/**
 * request-carpool — turns a Map-radar tap into a mutual-approval match
 * (migration 021).
 *
 * The Map radar used to one-sidedly book the ride. Now tapping "Request" on a
 * nearby commuter:
 *   1. Ensures BOTH the caller and the target have a pending trip_intent for
 *      the date (synthesised from their profiles). For an independent +
 *      employee pair the employee's intent must already exist and be open to
 *      independents (migration 045); it is never synthesised.
 *   2. Creates a trip_intent_matches row with the INITIATOR pre-approved and
 *      the target not — status awaiting_other.
 *   3. Pushes the target to approve.
 * The target approves via respond-to-match → ride is created for both.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, RequestCarpoolSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';
import { ensureIntent } from '../_shared/intents.ts';
import { reverseGeocode, mapboxToken } from '../_shared/geocode.ts';

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
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

  const parsed = await parseBody(req, RequestCarpoolSchema);
  if (!parsed.ok) return parsed.response;
  const { target_user_id, requester_role, trip_date } = parsed.data;

  if (target_user_id === userId) {
    return respondError(400, 'bad_request', 'cannot_match_self');
  }

  // Server-side visibility gate — mirror the map's client-side filter. Without
  // this, any authenticated user could target an arbitrary UUID, creating
  // intent/match rows for the victim and pushing them a notification.
  const { data: visible, error: visErr } = await supabase.rpc('is_peer_visible', {
    p_caller: userId,
    p_target: target_user_id,
  });
  if (visErr) return respondInternalError('request-carpool', visErr, 'visibility_check_failed');
  if (!visible) return respondError(403, 'forbidden', 'peer_not_visible');

  const tripDate = trip_date ?? tomorrowISO();
  // Caller 'rider' → caller is the passenger, target is the driver.
  const callerIsDriver = requester_role === 'driver';
  const callerRole = callerIsDriver ? 'driver' : 'passenger';
  const targetRole = callerIsDriver ? 'passenger' : 'driver';

  try {
    // Independent + employee is decided per trip (migration 045): the
    // employee's own intent for that date must already exist, be open and have
    // the right role — never synthesise or flip it on their behalf.
    const { data: parties } = await supabase
      .from('profiles')
      .select('id, company_id')
      .in('id', [userId, target_user_id]);
    const hasCompany = (id: string) =>
      (parties ?? []).some((p: { id: string; company_id: string | null }) => p.id === id && p.company_id != null);
    const isMixed = hasCompany(userId) !== hasCompany(target_user_id);

    const intentFor = async (id: string, role: 'driver' | 'passenger') => {
      if (!(isMixed && hasCompany(id))) return ensureIntent(supabase, id, role, tripDate);
      const { data: open } = await supabase
        .from('trip_intents')
        .select('id, user_id, role, home_lat, home_long, work_lat, work_long, trip_date')
        .eq('user_id', id)
        .eq('trip_date', tripDate)
        .eq('role', role)
        .eq('open_to_independents', true)
        .in('status', ['pending', 'unmatched'])
        .maybeSingle();
      return open ?? 'not_open';
    };

    const callerIntent = await intentFor(userId, callerRole);
    if (callerIntent === 'not_open') return respondError(403, 'forbidden', 'trip_not_open');
    if (!callerIntent) return respondError(400, 'bad_request', 'caller_missing_home_or_work');

    const targetIntent = await intentFor(target_user_id, targetRole);
    if (targetIntent === 'not_open') return respondError(403, 'forbidden', 'trip_not_open');
    if (!targetIntent) return respondError(400, 'bad_request', 'target_missing_home_or_work');

    const driverIntent = callerIsDriver ? callerIntent : targetIntent;
    const passengerIntent = callerIsDriver ? targetIntent : callerIntent;

    const { data: canPair, error: pairErr } = await supabase.rpc('can_pair_intents', {
      p_driver_intent: driverIntent.id,
      p_passenger_intent: passengerIntent.id,
    });
    if (pairErr) return respondInternalError('request-carpool', pairErr, 'pair_check_failed');
    if (canPair !== true) return respondError(403, 'forbidden', 'peer_not_visible');

    // Pickup = passenger's home (simple, reliable for a manual request), with an
    // address so the confirmed ride doesn't show a bare "Origin".
    const pickupLat = passengerIntent.home_lat;
    const pickupLong = passengerIntent.home_long;
    const { data: passengerTrip } = await supabase
      .from('trip_intents')
      .select('origin_address')
      .eq('id', passengerIntent.id)
      .single();
    const pickupAddress =
      passengerTrip?.origin_address ?? (await reverseGeocode(pickupLong, pickupLat, mapboxToken()));

    // Insert the match with the initiator pre-approved. Dedupe on the
    // (driver_intent_id, passenger_intent_id) unique index (migration 016).
    const { data: inserted, error: insertErr } = await supabase
      .from('trip_intent_matches')
      .upsert(
        {
          driver_intent_id: driverIntent.id,
          passenger_intent_id: passengerIntent.id,
          driver_user_id: driverIntent.user_id,
          passenger_user_id: passengerIntent.user_id,
          trip_date: tripDate,
          ai_compatibility_score: null,
          ai_reasoning: 'Requested directly from the map.',
          pickup_lat: pickupLat,
          pickup_long: pickupLong,
          pickup_address: pickupAddress,
          status: 'awaiting_other',
          driver_approved: callerIsDriver,
          passenger_approved: !callerIsDriver,
        },
        { onConflict: 'driver_intent_id,passenger_intent_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();

    if (insertErr) return respondInternalError('request-carpool', insertErr, 'match_insert_failed');

    // If the row already existed (duplicate ignored), surface a friendly state.
    if (!inserted) {
      return respondJSON({ ok: true, already_requested: true });
    }

    // Notify the target to approve.
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', userId)
      .single();
    const callerName = callerProfile?.first_name ?? 'A colleague';

    const { data: targetProfile, error: targetErr } = await supabase
      .from('profiles')
      .select('expo_push_token, notification_prefs')
      .eq('id', target_user_id)
      .single();
    if (targetErr) console.error('[request-carpool] push profile read failed:', targetErr.message);
    const matchesPref = (targetProfile?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
    if (targetProfile?.expo_push_token && matchesPref) {
      await sendPush({
        to: targetProfile.expo_push_token,
        title: 'Carpool request',
        body: `${callerName} wants to carpool with you on ${tripDate}. Open Clyzio to approve.`,
        data: { screen: 'daily-commute' },
      });
    }

    return respondJSON({ ok: true, match_id: inserted.id, status: 'awaiting_other' });
  } catch (err) {
    return respondInternalError('request-carpool', err);
  }
});
