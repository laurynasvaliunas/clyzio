/**
 * Trip credit — the one place XP / CO₂ / trips / badges are added to a
 * profile. Used by complete-trip (a participant ending or collecting a trip)
 * and close-stale-rides (closing a trip someone confirmed but nobody ended).
 *
 * Writes go through the service-role client, which bypasses the C1
 * column-guard trigger that blocks client writes to these counters.
 */

// ─── Gamification constants (mirror lib/gamification.ts) ──────────────────────
// Flat XP per trip so progress is legible ("3 more trips to the next level").
export const XP_PER_TRIP = 100;
const TRIPS_PER_LEVEL = 3;
const XP_PER_LEVEL = XP_PER_TRIP * TRIPS_PER_LEVEL; // 300
const MAX_LEVEL = 10;

// Credited completions per user per rolling 24h. A commute is 2 legs a day;
// 6 leaves room for errands without letting a script mint unbounded XP.
export const MAX_COMPLETIONS_PER_DAY = 6;

export function getLevel(xp: number): number {
  const safe = Math.max(0, Math.floor(xp || 0));
  return Math.min(MAX_LEVEL, Math.floor(safe / XP_PER_LEVEL) + 1);
}

export interface RideRow {
  id: string;
  status: string;
  scheduled_at: string | null;
  rider_id: string | null;
  driver_id: string | null;
  transport_mode: string | null;
  co2_saved: number | null;
  origin_lat: number | null;
  origin_long: number | null;
  dest_lat: number | null;
  dest_long: number | null;
}

export const RIDE_COLUMNS =
  'id, status, scheduled_at, rider_id, driver_id, transport_mode, co2_saved, origin_lat, origin_long, dest_lat, dest_long';

export type Credit =
  | {
      ok: true;
      xpEarned: number;
      co2Saved: number;
      newXP: number;
      newCO2: number;
      newTripsCount: number;
      oldLevel: number;
      newLevel: number;
      newBadges: string[];
    }
  | { ok: false; error: unknown };

/**
 * Adds one ride's XP / CO₂ / trip / badges to a participant's profile. The
 * caller has already claimed the ride_completions row for this user.
 */
// deno-lint-ignore no-explicit-any
export async function creditProfile(supabase: any, uid: string, ride: RideRow): Promise<Credit> {
  const isCarpool = !!(ride.driver_id && ride.rider_id);
  const xpEarned = XP_PER_TRIP;
  // Carpool CO₂ is a SHARED saving — split it 50/50 between driver and rider so
  // the pair's combined credit equals the trip's saving (no double-count). Solo
  // trips credit the full amount to the one participant.
  const fullCo2 = Number(ride.co2_saved) || 0;
  const co2Saved = isCarpool ? Math.round((fullCo2 / 2) * 1000) / 1000 : fullCo2;

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('xp_points, total_co2_saved, trips_completed, badges')
    .eq('id', uid)
    .maybeSingle();
  if (profErr || !profile) return { ok: false, error: profErr ?? new Error('profile not found') };

  const oldXP = Number(profile.xp_points) || 0;
  const newXP = oldXP + xpEarned;
  const newCO2 = (Number(profile.total_co2_saved) || 0) + co2Saved;
  const newTripsCount = (Number(profile.trips_completed) || 0) + 1;

  // Badge evaluation
  const existingBadges: string[] = Array.isArray(profile.badges) ? profile.badges : [];
  const newBadges: string[] = [];
  if (newTripsCount >= 1 && !existingBadges.includes('first_trip')) newBadges.push('first_trip');
  if (newTripsCount >= 10 && !existingBadges.includes('trips_10')) newBadges.push('trips_10');
  if (newCO2 >= 50 && !existingBadges.includes('co2_50')) newBadges.push('co2_50');
  if (newCO2 >= 100 && !existingBadges.includes('co2_100')) newBadges.push('co2_100');
  if (isCarpool && !existingBadges.includes('first_carpool')) newBadges.push('first_carpool');
  if (ride.transport_mode === 'walking' && !existingBadges.includes('walker_5')) {
    // Cheap aggregate: count this user's completed walking rides (as rider
    // OR driver — mirrors the activity.tsx behaviour).
    const { count } = await supabase
      .from('rides')
      .select('id', { count: 'exact', head: true })
      .or(`rider_id.eq.${uid},driver_id.eq.${uid}`)
      .eq('transport_mode', 'walking')
      .eq('status', 'completed');
    if ((count ?? 0) >= 5) newBadges.push('walker_5');
  }

  // Single UPDATE — service role bypasses the C1 column-guard trigger.
  const { error: writeErr } = await supabase
    .from('profiles')
    .update({
      xp_points: newXP,
      total_co2_saved: newCO2,
      trips_completed: newTripsCount,
      ...(newBadges.length > 0 ? { badges: [...existingBadges, ...newBadges] } : {}),
    })
    .eq('id', uid);
  if (writeErr) return { ok: false, error: writeErr };

  return {
    ok: true,
    xpEarned,
    co2Saved,
    newXP,
    newCO2,
    newTripsCount,
    oldLevel: getLevel(oldXP),
    newLevel: getLevel(newXP),
    newBadges,
  };
}

/**
 * Credits a participant who didn't make the call themselves (the passenger when
 * the driver ends a carpool; anyone still owed when a confirmed trip is closed
 * automatically). Same rules as a self-claim: daily cap, one credit per ride.
 * Returns null when nothing was credited (capped, already credited, or a
 * failure, which is logged and rolled back). Never throws.
 */
// deno-lint-ignore no-explicit-any
export async function creditOnBehalf(supabase: any, ride: RideRow, uid: string, tag: string): Promise<Credit | null> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('ride_completions')
      .select('ride_id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_COMPLETIONS_PER_DAY) return null;

    const { error: claimErr } = await supabase.from('ride_completions').insert({ ride_id: ride.id, user_id: uid });
    if (claimErr) {
      if ((claimErr as { code?: string }).code !== '23505') {
        console.error(`[${tag}] claim failed:`, claimErr.message);
      }
      return null;
    }

    const credit = await creditProfile(supabase, uid, ride);
    if (!credit.ok) {
      await supabase.from('ride_completions').delete().eq('ride_id', ride.id).eq('user_id', uid);
      console.error(`[${tag}] credit failed:`, credit.error);
      return null;
    }
    return credit;
  } catch (err) {
    console.error(`[${tag}] credit error:`, err);
    return null;
  }
}

/** Push token of a user who allows match/carpool pushes, else null. */
// deno-lint-ignore no-explicit-any
export async function carpoolPushToken(supabase: any, uid: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('expo_push_token, notification_prefs')
    .eq('id', uid)
    .maybeSingle();
  const allowed = (data?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
  return data?.expo_push_token && allowed ? data.expo_push_token : null;
}
