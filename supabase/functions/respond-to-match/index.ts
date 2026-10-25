/**
 * respond-to-match — symmetric carpool approval (migrations 021, 053).
 *
 * One endpoint for both roles, any order:
 *   - Decline / withdraw → cancelled_by_<role>. The database (053) puts both
 *     trips back into matching and re-runs the matcher for them; the other
 *     person gets a push.
 *   - Approve → once both have, the ride is created and the match confirmed in
 *     the same transaction (respond_carpool_match locks the match, so two
 *     approvals at the same moment confirm exactly once).
 *
 * The ride: origin = the pickup (a point on the driver's route or the rider's
 * door), destination = the drop-off, scheduled at the pickup time.
 * Idempotent: answering a match that's already settled returns its state.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, RespondToMatchSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';
import { street } from '../_shared/carpool.ts';

interface MatchRow {
  id: string;
  driver_user_id: string;
  passenger_user_id: string;
  driver_intent_id: string;
  passenger_intent_id: string;
  trip_date: string;
  status: string;
  pickup_lat: number | null;
  pickup_long: number | null;
  pickup_address: string | null;
  pickup_at: string | null;
  proposed_pickup_time: string | null;
  proposed_departure: string | null;
  dropoff_lat: number | null;
  dropoff_long: number | null;
  dropoff_address: string | null;
}

// Vilnius' getTimezoneOffset() on a date (-180 in summer, -120 in winter).
function vilniusOffsetMinutes(tripDate: string): number {
  const noon = new Date(`${tripDate}T12:00:00Z`);
  const wall = (tz: string) => new Date(noon.toLocaleString('en-US', { timeZone: tz })).getTime();
  return (wall('UTC') - wall('Europe/Vilnius')) / 60_000;
}

// "HH:MM local wall-clock on trip_date" as UTC, given the phone's
// getTimezoneOffset() (+ve west of UTC; Vilnius when absent). For matches
// made before 053, which have no pickup_at.
function buildScheduledAt(tripDate: string, hhmm: string, tzOffsetMinutes?: number): string {
  const [y, mo, d] = tripDate.split('-').map(Number);
  const [hh, mm] = (hhmm || '08:00').split(':').map(Number);
  const baseUtcMs = Date.UTC(y, (mo || 1) - 1, d, hh || 0, mm || 0);
  const off = Number.isFinite(tzOffsetMinutes) ? (tzOffsetMinutes as number) : vilniusOffsetMinutes(tripDate);
  return new Date(baseUtcMs + off * 60_000).toISOString();
}

// deno-lint-ignore no-explicit-any
async function notify(supabase: any, userId: string, title: string, body: string, data: Record<string, unknown>) {
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('expo_push_token, notification_prefs')
    .eq('id', userId)
    .single();
  if (error) console.error('[respond-to-match] notify profile read failed:', error.message);
  const matchesPref = (prof?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
  if (prof?.expo_push_token && matchesPref) {
    await sendPush({ to: prof.expo_push_token, title, body, data });
  }
}

// deno-lint-ignore no-explicit-any
async function firstName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('first_name').eq('id', userId).single();
  return data?.first_name ?? 'Your match';
}

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

  const parsed = await parseBody(req, RespondToMatchSchema);
  if (!parsed.ok) return parsed.response;
  // detour_preference / custom_pickup from older builds are accepted and
  // ignored: the pickup is planned with the match (migration 053).
  const { match_id, accepted, tz_offset_minutes } = parsed.data;

  try {
    const { data: match, error: matchErr } = await supabase
      .from('trip_intent_matches')
      .select('id, driver_user_id, passenger_user_id, driver_intent_id, passenger_intent_id, trip_date, status, pickup_lat, pickup_long, pickup_address, pickup_at, proposed_pickup_time, proposed_departure, dropoff_lat, dropoff_long, dropoff_address')
      .eq('id', match_id)
      .maybeSingle();
    if (matchErr) return respondInternalError('respond-to-match', matchErr, 'match_fetch_failed');
    if (!match) return respondError(404, 'not_found', 'match_not_found');

    const m = match as MatchRow;
    const isDriver = m.driver_user_id === userId;
    if (!isDriver && m.passenger_user_id !== userId) return respondError(403, 'forbidden', 'not_a_participant');
    const otherUserId = isDriver ? m.passenger_user_id : m.driver_user_id;

    // The ride this match becomes if this approval is the second one.
    let ride: Record<string, unknown> | null = null;
    if (accepted) {
      const [{ data: driverIntent }, { data: passengerIntent }, { data: driverProfile }, { data: passengerProfile }] = await Promise.all([
        supabase.from('trip_intents').select('work_lat, work_long, dest_address').eq('id', m.driver_intent_id).single(),
        supabase.from('trip_intents').select('home_lat, home_long').eq('id', m.passenger_intent_id).single(),
        supabase.from('profiles').select('work_lat, work_long, work_address').eq('id', m.driver_user_id).single(),
        supabase.from('profiles').select('share_pickup_address').eq('id', m.passenger_user_id).single(),
      ]);
      const hasDropoff = m.dropoff_lat != null && m.dropoff_long != null;
      // A door pickup of a rider who hides their address has no pickup point
      // on the match; the ride still needs one (its address stays hidden).
      ride = {
        origin_lat: m.pickup_lat ?? passengerIntent?.home_lat ?? 0,
        origin_long: m.pickup_long ?? passengerIntent?.home_long ?? 0,
        origin_address: m.pickup_address,
        dest_lat: hasDropoff ? m.dropoff_lat : (driverIntent?.work_lat ?? driverProfile?.work_lat ?? 0),
        dest_long: hasDropoff ? m.dropoff_long : (driverIntent?.work_long ?? driverProfile?.work_long ?? 0),
        dest_address: hasDropoff ? m.dropoff_address : (driverIntent?.dest_address ?? driverProfile?.work_address ?? null),
        share_origin_address: passengerProfile?.share_pickup_address ?? true,
        scheduled_at: m.pickup_at ??
          buildScheduledAt(m.trip_date, m.proposed_pickup_time ?? m.proposed_departure ?? '08:00', tz_offset_minutes),
      };
    }

    const { data: result, error: rpcErr } = await supabase.rpc('respond_carpool_match', {
      p_match: m.id,
      p_user: userId,
      p_accept: accepted,
      p_ride: ride,
    });
    if (rpcErr) return respondInternalError('respond-to-match', rpcErr, 'respond_failed');
    const r = result as { status: string; ride_id?: string; changed: boolean; reason?: string };

    if (r.changed) {
      const who = await firstName(supabase, userId);
      if (r.status === 'cancelled_by_driver' || r.status === 'cancelled_by_passenger') {
        await notify(supabase, otherUserId, 'Carpool cancelled',
          `${who} can't make the carpool. We're looking for another match.`, { screen: 'daily-commute' });
      } else if (r.status === 'awaiting_other') {
        await notify(supabase, otherUserId, `${who} accepted your carpool`,
          `Accept too to lock in the ride on ${m.trip_date}.`, { screen: 'daily-commute' });
      } else if (r.status === 'confirmed') {
        const where = `${m.proposed_pickup_time?.slice(0, 5) ?? ''} at ${street(m.pickup_address)}`.trim();
        const [driverName, passengerName] = isDriver
          ? [who, await firstName(supabase, m.passenger_user_id)]
          : [await firstName(supabase, m.driver_user_id), who];
        const data = { screen: 'trip', rideId: r.ride_id };
        await notify(supabase, m.driver_user_id, 'Carpool confirmed!', `You're picking up ${passengerName}: ${where}.`, data);
        await notify(supabase, m.passenger_user_id, 'Carpool confirmed!', `${driverName} picks you up: ${where}.`, data);
      } else if (r.status === 'expired' && r.reason === 'no_seats_left') {
        await notify(supabase, m.passenger_user_id, 'That car is full now',
          "The driver's seats were taken. We're looking for another match.", { screen: 'daily-commute' });
      }
    }

    return respondJSON({ ok: true, status: r.status, ride_id: r.ride_id ?? null, reason: r.reason ?? null });
  } catch (err) {
    return respondInternalError('respond-to-match', err);
  }
});
