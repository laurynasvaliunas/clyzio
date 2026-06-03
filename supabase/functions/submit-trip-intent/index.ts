import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, SubmitTripIntentSchema } from '../_shared/validate.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  let supabase;
  try {
    ({ userId, supabase } = await verifyAuth(req));
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, SubmitTripIntentSchema);
  if (!parsed.ok) return parsed.response;
  const {
    role, passenger_capacity, departure_time, required_arrival_time, trip_date,
    origin_lat, origin_long, dest_lat, dest_long, origin_address, dest_address,
  } = parsed.data;

  // When the planner supplies a TYPED origin + destination, those are the
  // matching endpoints (the matcher compares home_/work_ columns, so we route
  // the typed coords through them). Otherwise fall back to the profile commute.
  const hasTyped =
    origin_lat != null && origin_long != null && dest_lat != null && dest_long != null;

  try {
    // Matching endpoints: typed origin/dest when provided, else profile home/work.
    let homeLat: number, homeLong: number, workLat: number, workLong: number;

    if (hasTyped) {
      homeLat = origin_lat!; homeLong = origin_long!;
      workLat = dest_lat!;   workLong = dest_long!;
    } else {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('home_lat, home_long, work_lat, work_long')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('submit-trip-intent profile err:', profileError.message);
        return respondError(500, 'internal_error', 'profile_query_failed');
      }

      if (!profile || profile.home_lat == null || profile.work_lat == null) {
        return respondError(400, 'bad_request', 'missing_home_or_work_location');
      }
      homeLat = profile.home_lat; homeLong = profile.home_long;
      workLat = profile.work_lat; workLong = profile.work_long;
    }

    const targetDate = trip_date ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const { data: existing } = await supabase
      .from('trip_intents')
      .select('id')
      .eq('user_id', userId)
      .eq('trip_date', targetDate)
      .maybeSingle();

    const basePayload = {
      role,
      passenger_capacity: role === 'driver' ? (passenger_capacity ?? null) : null,
      // departure_time is the LEAVING time for BOTH roles — the matcher pairs
      // driver & passenger whose leaving times are within ±15 min.
      departure_time: departure_time ?? null,
      // required_arrival_time stays optional (passenger display only).
      required_arrival_time: role === 'passenger' ? (required_arrival_time ?? null) : null,
    };

    // Matching endpoints + (when typed) the per-trip origin/dest record.
    const endpointPayload = {
      home_lat: homeLat,
      home_long: homeLong,
      work_lat: workLat,
      work_long: workLong,
      origin_lat: hasTyped ? origin_lat : null,
      origin_long: hasTyped ? origin_long : null,
      dest_lat: hasTyped ? dest_lat : null,
      dest_long: hasTyped ? dest_long : null,
      origin_address: hasTyped ? (origin_address ?? null) : null,
      dest_address: hasTyped ? (dest_address ?? null) : null,
    };

    let intent;
    if (existing) {
      const { data, error } = await supabase
        .from('trip_intents')
        // Refresh the endpoints too when the planner sent a typed route, so
        // changing the route for an already-submitted date actually updates it.
        .update({ ...basePayload, status: 'pending', ...(hasTyped ? endpointPayload : {}) })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      intent = data;
    } else {
      const { data, error } = await supabase
        .from('trip_intents')
        .insert({
          user_id: userId,
          ...basePayload,
          trip_date: targetDate,
          ...endpointPayload,
        })
        .select()
        .single();
      if (error) throw error;
      intent = data;
    }

    // Instant matching: fire the matcher in targeted mode for THIS intent so a
    // compatible counterpart is matched within seconds (delivered to both via
    // the realtime subscription on trip_intent_matches + push). Fire-and-forget
    // so the submit response stays fast; EdgeRuntime.waitUntil keeps the
    // background request alive after we respond.
    if (intent?.id) {
      const fireMatch = fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/daily-commute-matcher`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': Deno.env.get('CRON_SHARED_SECRET') ?? '',
          },
          body: JSON.stringify({ trip_date: targetDate, new_intent_id: intent.id }),
        },
      ).catch((e) => { console.error('instant-match invoke failed:', e); });

      try {
        (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
          .EdgeRuntime?.waitUntil?.(fireMatch);
      } catch { /* waitUntil unavailable — request still fires, just not awaited */ }
    }

    return respondJSON({ intent });
  } catch (err) {
    return respondInternalError('submit-trip-intent', err);
  }
});
