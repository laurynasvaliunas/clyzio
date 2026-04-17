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
  const { role, passenger_capacity, departure_time, required_arrival_time, trip_date } = parsed.data;

  try {
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
      departure_time: role === 'driver' ? (departure_time ?? null) : null,
      required_arrival_time: role === 'passenger' ? (required_arrival_time ?? null) : null,
    };

    let intent;
    if (existing) {
      const { data, error } = await supabase
        .from('trip_intents')
        .update({ ...basePayload, status: 'pending' })
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
          home_lat: profile.home_lat,
          home_long: profile.home_long,
          work_lat: profile.work_lat,
          work_long: profile.work_long,
        })
        .select()
        .single();
      if (error) throw error;
      intent = data;
    }

    return respondJSON({ intent });
  } catch (err) {
    return respondInternalError('submit-trip-intent', err);
  }
});
