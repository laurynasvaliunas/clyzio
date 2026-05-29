/**
 * request-carpool — turns a Map-radar tap into a mutual-approval match
 * (migration 021).
 *
 * The Map radar used to one-sidedly book the ride. Now tapping "Request" on a
 * nearby commuter:
 *   1. Ensures BOTH the caller and the target have a pending trip_intent for
 *      the date (synthesised from their profiles).
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

  const tripDate = trip_date ?? tomorrowISO();
  // Caller 'rider' → caller is the passenger, target is the driver.
  const callerIsDriver = requester_role === 'driver';
  const callerRole = callerIsDriver ? 'driver' : 'passenger';
  const targetRole = callerIsDriver ? 'passenger' : 'driver';

  try {
    const callerIntent = await ensureIntent(supabase, userId, callerRole, tripDate);
    if (!callerIntent) return respondError(400, 'bad_request', 'caller_missing_home_or_work');

    const targetIntent = await ensureIntent(supabase, target_user_id, targetRole, tripDate);
    if (!targetIntent) return respondError(400, 'bad_request', 'target_missing_home_or_work');

    const driverIntent = callerIsDriver ? callerIntent : targetIntent;
    const passengerIntent = callerIsDriver ? targetIntent : callerIntent;

    // Pickup = passenger's home (simple, reliable for a manual request).
    const pickupLat = passengerIntent.home_lat;
    const pickupLong = passengerIntent.home_long;

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

    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('expo_push_token, notification_prefs')
      .eq('id', target_user_id)
      .single();
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
