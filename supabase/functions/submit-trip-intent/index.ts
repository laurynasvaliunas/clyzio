/**
 * submit-trip-intent — offer a ride or look for one on a day.
 *
 * Creates the day's carpool trip, or replaces it (migration 053's
 * submit_trip_intent, one transaction): the old trip closes, its open matches
 * are released — those people get a push and go back into matching — and the
 * row reopens as a new generation. Refused with 409 has_confirmed_ride while a
 * confirmed carpool exists that day: cancel the ride first.
 *
 * Matching starts by itself: the database calls daily-commute-matcher for a
 * trip as soon as it's searching.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, SubmitTripIntentSchema } from '../_shared/validate.ts';
import { localDateISO, notifyReleased } from '../_shared/carpool.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  // deno-lint-ignore no-explicit-any
  let supabase: any;
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
    open_to_independents, tz_offset_minutes,
  } = parsed.data;

  // Typed origin + destination from the planner are the matching endpoints;
  // otherwise the profile's home → work commute.
  const hasTyped = origin_lat != null && origin_long != null && dest_lat != null && dest_long != null;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('home_lat, home_long, work_lat, work_long, company_id')
      .eq('id', userId)
      .single();
    if (profileError) return respondInternalError('submit-trip-intent', profileError, 'profile_query_failed');
    if (!hasTyped && (profile?.home_lat == null || profile?.work_lat == null)) {
      return respondError(400, 'bad_request', 'missing_home_or_work_location');
    }

    const fields = {
      role,
      passenger_capacity: role === 'driver' ? (passenger_capacity ?? 1) : null,
      // The LEAVING time for both roles; the matcher compares it at the pickup.
      departure_time: departure_time ?? null,
      required_arrival_time: role === 'passenger' ? (required_arrival_time ?? null) : null,
      tz_offset_minutes: tz_offset_minutes ?? null,
      // Employees may open the trip to commuters outside their company (045).
      open_to_independents: !!open_to_independents && profile?.company_id != null,
      home_lat: hasTyped ? origin_lat : profile.home_lat,
      home_long: hasTyped ? origin_long : profile.home_long,
      work_lat: hasTyped ? dest_lat : profile.work_lat,
      work_long: hasTyped ? dest_long : profile.work_long,
      origin_lat: hasTyped ? origin_lat : null,
      origin_long: hasTyped ? origin_long : null,
      dest_lat: hasTyped ? dest_lat : null,
      dest_long: hasTyped ? dest_long : null,
      origin_address: hasTyped ? (origin_address ?? null) : null,
      dest_address: hasTyped ? (dest_address ?? null) : null,
    };

    const { data, error } = await supabase.rpc('submit_trip_intent', {
      p_user: userId,
      p_trip_date: trip_date ?? localDateISO(1),
      p_fields: fields,
    });
    if (error) {
      if (error.message === 'has_confirmed_ride') {
        return respondJSON(
          { error: 'conflict', code: 'has_confirmed_ride', ride_id: error.details ?? null },
          { status: 409 },
        );
      }
      return respondInternalError('submit-trip-intent', error, 'intent_save_failed');
    }

    const result = data as { intent: Record<string, unknown>; released: Array<{ partner_user_id: string }> };
    await notifyReleased(supabase, userId, result.released ?? []);
    return respondJSON({ intent: result.intent });
  } catch (err) {
    return respondInternalError('submit-trip-intent', err);
  }
});
