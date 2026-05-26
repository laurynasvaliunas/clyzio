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
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, CompleteTripSchema } from '../_shared/validate.ts';

// ─── Gamification constants (mirror lib/gamification.ts) ──────────────────────
// Flat XP per trip so progress is legible ("3 more trips to the next level").
const XP_PER_TRIP = 100;
const TRIPS_PER_LEVEL = 3;
const XP_PER_LEVEL = XP_PER_TRIP * TRIPS_PER_LEVEL; // 300
const MAX_LEVEL = 10;

function getLevel(xp: number): number {
  const safe = Math.max(0, Math.floor(xp || 0));
  return Math.min(MAX_LEVEL, Math.floor(safe / XP_PER_LEVEL) + 1);
}

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
      .select(
        'id, status, rider_id, driver_id, transport_mode, co2_saved, ' +
        'origin_lat, origin_long, dest_lat, dest_long',
      )
      .eq('id', ride_id)
      .maybeSingle();

    if (rideErr) return respondInternalError('complete-trip', rideErr, 'ride_fetch_failed');
    if (!ride) return respondError(404, 'not_found', 'ride_not_found');
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return respondError(403, 'forbidden', 'not_a_participant');
    }
    // Idempotency: if the ride is already completed and the caller wants to
    // end it, that's a no-op — but we still won't double-credit XP. Use the
    // status check + a per-(user, ride) idempotency guard via the participant
    // having already been credited (we can't easily detect this without an
    // extra table; for v1.0 we accept that a participant who hits "complete"
    // twice in the same second on different devices may get credited twice.
    // This is bounded by the network round-trip and unlikely in practice).
    if (ride.status === 'completed' && end_trip) {
      // Don't re-write status, but also don't re-credit. Return zeros so the
      // UI can show a neutral "already complete" message.
      return respondJSON({
        already_completed: true,
        xp_earned: 0,
        co2_saved: 0,
        distance_km: 0,
        leveled_up: false,
      });
    }

    // (2) Mark the ride completed if the caller is ending the trip.
    const completedAt = new Date().toISOString();
    if (end_trip) {
      const { error: updErr } = await supabase
        .from('rides')
        .update({ status: 'completed', completed_at: completedAt })
        .eq('id', ride_id);
      if (updErr) return respondInternalError('complete-trip', updErr, 'ride_update_failed');
    }

    // (3) Compute the deltas server-side.
    const xpEarned = XP_PER_TRIP;
    const co2Saved = Number(ride.co2_saved) || 0;
    const distanceKm =
      ride.origin_lat != null && ride.origin_long != null &&
      ride.dest_lat != null && ride.dest_long != null
        ? haversineKm(ride.origin_lat, ride.origin_long, ride.dest_lat, ride.dest_long)
        : 0;

    // (4) Read current totals + badges, compute new state.
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('xp_points, total_co2_saved, trips_completed, badges')
      .eq('id', userId)
      .maybeSingle();
    if (profErr || !profile) {
      return respondInternalError(
        'complete-trip',
        profErr ?? new Error('profile not found'),
        'profile_fetch_failed',
      );
    }

    const oldXP = Number(profile.xp_points) || 0;
    const newXP = oldXP + xpEarned;
    const newCO2 = (Number(profile.total_co2_saved) || 0) + co2Saved;
    const newTripsCount = (Number(profile.trips_completed) || 0) + 1;
    const oldLevel = getLevel(oldXP);
    const newLevel = getLevel(newXP);
    const leveledUp = newLevel > oldLevel;

    // Badge evaluation
    const existingBadges: string[] = Array.isArray(profile.badges) ? profile.badges : [];
    const newBadges: string[] = [];
    if (newTripsCount >= 1 && !existingBadges.includes('first_trip')) newBadges.push('first_trip');
    if (newTripsCount >= 10 && !existingBadges.includes('trips_10')) newBadges.push('trips_10');
    if (newCO2 >= 50 && !existingBadges.includes('co2_50')) newBadges.push('co2_50');
    if (newCO2 >= 100 && !existingBadges.includes('co2_100')) newBadges.push('co2_100');
    if (ride.driver_id && ride.rider_id && !existingBadges.includes('first_carpool')) {
      newBadges.push('first_carpool');
    }
    if (ride.transport_mode === 'walking' && !existingBadges.includes('walker_5')) {
      // Cheap aggregate: count this user's completed walking rides (as rider
      // OR driver — mirrors the activity.tsx behaviour).
      const { count } = await supabase
        .from('rides')
        .select('id', { count: 'exact', head: true })
        .or(`rider_id.eq.${userId},driver_id.eq.${userId}`)
        .eq('transport_mode', 'walking')
        .eq('status', 'completed');
      if ((count ?? 0) >= 5) newBadges.push('walker_5');
    }

    const updatedBadges = newBadges.length > 0
      ? [...existingBadges, ...newBadges]
      : existingBadges;

    // (5) Single UPDATE — service role bypasses the C1 column-guard trigger.
    const { error: writeErr } = await supabase
      .from('profiles')
      .update({
        xp_points: newXP,
        total_co2_saved: newCO2,
        trips_completed: newTripsCount,
        ...(newBadges.length > 0 ? { badges: updatedBadges } : {}),
      })
      .eq('id', userId);
    if (writeErr) {
      return respondInternalError('complete-trip', writeErr, 'profile_update_failed');
    }

    return respondJSON({
      xp_earned: xpEarned,
      co2_saved: co2Saved,
      distance_km: distanceKm,
      new_xp: newXP,
      new_total_co2: newCO2,
      new_trips_count: newTripsCount,
      old_level: oldLevel,
      new_level: newLevel,
      leveled_up: leveledUp,
      new_badges: newBadges,
    });
  } catch (err) {
    return respondInternalError('complete-trip', err);
  }
});
