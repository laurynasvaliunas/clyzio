/**
 * respond-to-match — unified symmetric carpool approval (migration 021).
 *
 * Supersedes driver-respond-to-matches + passenger-respond-to-match. One
 * endpoint handles both roles:
 *   - Decline → status cancelled_by_<role>, notify the other side.
 *   - Approve → set <role>_approved = true.
 *       • If BOTH sides have now approved → create the ride, status confirmed,
 *         flip both intents to matched, push both "you're riding together".
 *       • Otherwise → status awaiting_other, push the other side "X approved,
 *         your turn".
 *
 * Order-independent: whoever approves first just waits for the other. Idempotent:
 * re-approving is a no-op; acting on a terminal match returns its state.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, RespondToMatchSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';

interface MatchRow {
  id: string;
  driver_user_id: string;
  passenger_user_id: string;
  driver_intent_id: string;
  passenger_intent_id: string;
  trip_date: string;
  status: string;
  driver_approved: boolean;
  passenger_approved: boolean;
  pickup_lat: number | null;
  pickup_long: number | null;
  proposed_departure: string | null;
  ride_id: string | null;
}

const TERMINAL = ['confirmed', 'cancelled_by_driver', 'cancelled_by_passenger', 'expired'];

// deno-lint-ignore no-explicit-any
async function notify(supabase: any, userId: string, title: string, body: string) {
  const { data: prof } = await supabase
    .from('profiles')
    .select('expo_push_token, notification_prefs')
    .eq('id', userId)
    .single();
  const matchesPref = (prof?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
  if (prof?.expo_push_token && matchesPref) {
    await sendPush({ to: prof.expo_push_token, title, body, data: { screen: 'daily-commute' } });
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
  const { match_id, accepted, detour_preference, custom_pickup } = parsed.data;

  try {
    const { data: match, error: matchErr } = await supabase
      .from('trip_intent_matches')
      .select('id, driver_user_id, passenger_user_id, driver_intent_id, passenger_intent_id, trip_date, status, driver_approved, passenger_approved, pickup_lat, pickup_long, proposed_departure, ride_id')
      .eq('id', match_id)
      .maybeSingle();

    if (matchErr) return respondInternalError('respond-to-match', matchErr, 'match_fetch_failed');
    if (!match) return respondError(404, 'not_found', 'match_not_found');

    const m = match as MatchRow;
    const isDriver = m.driver_user_id === userId;
    const isPassenger = m.passenger_user_id === userId;
    if (!isDriver && !isPassenger) return respondError(403, 'forbidden', 'not_a_participant');

    // Terminal already — return current state, no side effects.
    if (TERMINAL.includes(m.status)) {
      return respondJSON({ ok: true, status: m.status, ride_id: m.ride_id });
    }

    const role = isDriver ? 'driver' : 'passenger';
    const otherUserId = isDriver ? m.passenger_user_id : m.driver_user_id;

    // ── Decline ─────────────────────────────────────────────────────────────
    if (!accepted) {
      const cancelStatus = isDriver ? 'cancelled_by_driver' : 'cancelled_by_passenger';
      await supabase
        .from('trip_intent_matches')
        .update({ status: cancelStatus, updated_at: new Date().toISOString() })
        .eq('id', m.id);
      const who = await firstName(supabase, userId);
      await notify(supabase, otherUserId, 'Carpool cancelled', `${who} can't make the carpool. We'll keep looking.`);
      return respondJSON({ ok: true, status: cancelStatus });
    }

    // ── Approve ─────────────────────────────────────────────────────────────
    const alreadyApproved = isDriver ? m.driver_approved : m.passenger_approved;
    const otherApproved = isDriver ? m.passenger_approved : m.driver_approved;

    // Idempotent: caller already approved and still waiting → no-op.
    if (alreadyApproved && !otherApproved) {
      return respondJSON({ ok: true, status: 'awaiting_other', already: true });
    }

    const bothNowApproved = otherApproved; // caller is approving now

    const approvalPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      [isDriver ? 'driver_approved' : 'passenger_approved']: true,
    };
    if (isDriver && detour_preference) {
      approvalPatch.detour_preference = detour_preference;
      if (detour_preference === 'fixed' && custom_pickup) {
        approvalPatch.custom_pickup_lat = custom_pickup.lat;
        approvalPatch.custom_pickup_long = custom_pickup.lng;
      }
    }

    if (!bothNowApproved) {
      // First approver → wait for the other.
      approvalPatch.status = 'awaiting_other';
      await supabase.from('trip_intent_matches').update(approvalPatch).eq('id', m.id);
      const who = await firstName(supabase, userId);
      await notify(
        supabase,
        otherUserId,
        `${who} approved your carpool`,
        `Open Clyzio to approve and lock in your ride for ${m.trip_date}.`,
      );
      return respondJSON({ ok: true, status: 'awaiting_other' });
    }

    // Both approved now → create the ride + confirm.
    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('work_lat, work_long')
      .eq('id', m.driver_user_id)
      .single();

    const { data: rideData, error: rideErr } = await supabase
      .from('rides')
      .insert({
        driver_id: m.driver_user_id,
        rider_id: m.passenger_user_id,
        status: 'scheduled',
        origin_lat: m.pickup_lat ?? 0,
        origin_long: m.pickup_long ?? 0,
        dest_lat: driverProfile?.work_lat ?? 0,
        dest_long: driverProfile?.work_long ?? 0,
        scheduled_at: new Date(`${m.trip_date}T${m.proposed_departure ?? '08:00'}:00`).toISOString(),
        transport_mode: 'carpool',
        transport_label: 'Carpool',
      })
      .select('id')
      .single();
    if (rideErr) return respondInternalError('respond-to-match', rideErr, 'ride_create_failed');

    await supabase
      .from('trip_intent_matches')
      .update({ ...approvalPatch, status: 'confirmed', ride_id: rideData?.id ?? null })
      .eq('id', m.id);

    await supabase.from('trip_intents').update({ status: 'matched' }).in('id', [m.driver_intent_id, m.passenger_intent_id]);

    // Push BOTH — confirmed.
    const driverName = await firstName(supabase, m.driver_user_id);
    const passengerName = await firstName(supabase, m.passenger_user_id);
    await notify(supabase, m.driver_user_id, 'Carpool confirmed!', `You're riding with ${passengerName} on ${m.trip_date}. You're all set!`);
    await notify(supabase, m.passenger_user_id, 'Carpool confirmed!', `You're riding with ${driverName} on ${m.trip_date}. You're all set!`);

    return respondJSON({ ok: true, status: 'confirmed', ride_id: rideData?.id });
  } catch (err) {
    return respondInternalError('respond-to-match', err);
  }
});
