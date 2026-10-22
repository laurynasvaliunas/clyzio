/**
 * complete-trip — server-side trip completion + gamification.
 *
 * Why a server function:
 *   The previous flow updated `profiles.xp_points`, `total_co2_saved`,
 *   `trips_completed`, and `badges` directly from the client. With the only
 *   profile UPDATE policy being `USING (auth.uid() = id)`, any user could
 *   write arbitrary values into those columns from a SQL client — see
 *   security audit C2. Migration 018 introduced a BEFORE-UPDATE trigger
 *   that now rejects those direct writes from authenticated users.
 *
 *   This function is the legitimate path:
 *     1. verifyAuth (real JWT)
 *     2. confirm the user is actually a participant in the ride
 *        (rider_id OR driver_id matches)
 *     3. compute XP / CO2 / badges server-side from the ride row
 *     4. atomically increment counters via the service-role client
 *        (service role bypasses RLS *and* the protected-column trigger)
 *     5. return the deltas + level-up info so the client can render the
 *        celebration modal
 *     6. when a driver ends a carpool, credit the passenger as well (unless
 *        they already collected) and push them to rate the driver
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, CompleteTripSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';
import {
  MAX_COMPLETIONS_PER_DAY,
  RIDE_COLUMNS,
  type RideRow,
  carpoolPushToken,
  creditOnBehalf,
  creditProfile,
} from '../_shared/credit.ts';

// ─── Anti-farming limits ──────────────────────────────────────────────────────
// A ride may be completed from shortly before its scheduled time (people leave
// early) but not for a trip planned hours ahead.
const EARLY_START_GRACE_MS = 30 * 60 * 1000;
const COMPLETABLE_STATUSES = new Set(['scheduled', 'requested', 'active', 'completed']);

// ─── Haversine for the celebration modal's "distance" field ───────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The driver ended a carpool: the passenger was in the car, so credit them too
 * (once — a passenger who already tapped "I've arrived" holds the claim) and
 * push them to rate the driver. Before this, a passenger whose driver ended
 * first could never collect: the ride left Upcoming and the trip screen hides
 * the end button on completed rides. Best effort — never fails the driver.
 */
// deno-lint-ignore no-explicit-any
async function creditPassenger(supabase: any, ride: RideRow, driverId: string): Promise<void> {
  if (!ride.rider_id) return;
  const credit = await creditOnBehalf(supabase, ride, ride.rider_id, 'complete-trip');
  if (!credit || !credit.ok) return;
  try {
    const [{ data: driver }, token] = await Promise.all([
      supabase.from('profiles').select('first_name').eq('id', driverId).maybeSingle(),
      carpoolPushToken(supabase, ride.rider_id),
    ]);
    if (token) {
      await sendPush({
        to: token,
        title: 'Trip complete',
        body: `${driver?.first_name ?? 'Your driver'} ended the carpool: +${credit.xpEarned} XP and ${credit.co2Saved.toFixed(2)} kg CO₂ saved. Tap to rate them.`,
        data: { screen: 'rating', rideId: ride.id },
      });
    }
  } catch (err) {
    console.error('[complete-trip] passenger push error:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  let supabase: ReturnType<typeof verifyAuth> extends Promise<infer T>
    ? T extends { supabase: infer S } ? S : never
    : never;
  try {
    const ctx = await verifyAuth(req);
    userId = ctx.userId;
    supabase = ctx.supabase;
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, CompleteTripSchema);
  if (!parsed.ok) return parsed.response;
  const { ride_id, end_trip } = parsed.data;

  try {
    // (1) Fetch the ride. Authorization: caller must be participant.
    const { data: ride, error: rideErr } = await supabase
      .from('rides')
      .select(RIDE_COLUMNS)
      .eq('id', ride_id)
      .maybeSingle();

    if (rideErr) return respondInternalError('complete-trip', rideErr, 'ride_fetch_failed');
    if (!ride) return respondError(404, 'not_found', 'ride_not_found');
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return respondError(403, 'forbidden', 'not_a_participant');
    }
    // (1.2) Only a live ride earns credit. Cancelled rides and rides planned for
    // later are refused before anything is claimed. A ride the driver already
    // completed stays creditable so the passenger can still collect theirs.
    if (!COMPLETABLE_STATUSES.has(ride.status)) {
      return respondError(409, 'conflict', ride.status === 'cancelled' ? 'ride_cancelled' : 'ride_not_completable');
    }
    if (
      ride.status !== 'completed' &&
      ride.scheduled_at &&
      new Date(ride.scheduled_at).getTime() - Date.now() > EARLY_START_GRACE_MS
    ) {
      return respondError(409, 'conflict', 'ride_not_started');
    }
    // (1.3) Rolling daily cap on credited completions.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: capErr } = await supabase
      .from('ride_completions')
      .select('ride_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    if (capErr) return respondInternalError('complete-trip', capErr, 'cap_check_failed');
    if ((recentCount ?? 0) >= MAX_COMPLETIONS_PER_DAY) {
      return respondError(429, 'rate_limited', 'daily_completion_limit');
    }
    // (1.5) Per-participant idempotency (migration 036): credit each participant
    // exactly once per ride, in any order. Claim a ride_completions row BEFORE
    // crediting so a double-tap / retry is a no-op. This replaces the old
    // status-based guard, which (a) let passengers — who pass end_trip=false —
    // farm credit by tapping repeatedly, and (b) blocked the 2nd participant.
    const { error: claimErr } = await supabase
      .from('ride_completions')
      .insert({ ride_id, user_id: userId });
    if (claimErr) {
      if ((claimErr as { code?: string }).code === '23505') {
        // Already credited this user for this ride → neutral no-op.
        return respondJSON({
          already_completed: true,
          xp_earned: 0,
          co2_saved: 0,
          distance_km: 0,
          leveled_up: false,
        });
      }
      return respondInternalError('complete-trip', claimErr, 'completion_claim_failed');
    }

    // (2) Mark the ride completed when the caller ends the trip (driver/solo).
    // Passengers pass end_trip=false and just collect their own credit while the
    // driver keeps control of the ride lifecycle. Enforced here too: on a
    // carpool only the driver can end the ride, whatever the client sends.
    const completedAt = new Date().toISOString();
    const isCarpool = !!(ride.driver_id && ride.rider_id);
    const mayEndRide = !isCarpool || ride.driver_id === userId;
    if (end_trip && mayEndRide && ride.status !== 'completed') {
      const { error: updErr } = await supabase
        .from('rides')
        .update({ status: 'completed', completed_at: completedAt })
        .eq('id', ride_id);
      if (updErr) {
        // Roll back the claim so the completion stays retryable.
        await supabase.from('ride_completions').delete().eq('ride_id', ride_id).eq('user_id', userId);
        return respondInternalError('complete-trip', updErr, 'ride_update_failed');
      }
    }

    // (3) Credit the caller: XP / CO₂ / trips / badges, computed server-side.
    const credit = await creditProfile(supabase, userId, ride as RideRow);
    if (!credit.ok) {
      // Roll back the completion claim so the user can retry.
      await supabase.from('ride_completions').delete().eq('ride_id', ride_id).eq('user_id', userId);
      return respondInternalError('complete-trip', credit.error, 'profile_update_failed');
    }

    // (4) A driver ending a carpool completes it for the passenger too.
    if (end_trip && isCarpool && ride.driver_id === userId) {
      await creditPassenger(supabase, ride as RideRow, userId);
    }

    const distanceKm =
      ride.origin_lat != null && ride.origin_long != null &&
      ride.dest_lat != null && ride.dest_long != null
        ? haversineKm(ride.origin_lat, ride.origin_long, ride.dest_lat, ride.dest_long)
        : 0;

    return respondJSON({
      xp_earned: credit.xpEarned,
      co2_saved: credit.co2Saved,
      distance_km: distanceKm,
      new_xp: credit.newXP,
      new_total_co2: credit.newCO2,
      new_trips_count: credit.newTripsCount,
      old_level: credit.oldLevel,
      new_level: credit.newLevel,
      leveled_up: credit.newLevel > credit.oldLevel,
      new_badges: credit.newBadges,
    });
  } catch (err) {
    return respondInternalError('complete-trip', err);
  }
});
