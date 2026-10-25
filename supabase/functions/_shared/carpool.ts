// Carpool match helpers shared by daily-commute-matcher and request-carpool:
// turning a route plan into a trip_intent_matches row, the words both people
// see, and the "you have a match" pushes. Rules live in route.ts and in the
// database (migration 053).

import { minutesToHHMM, type RidePlan } from './route.ts';
import { sendPush } from './expoPush.ts';

/** The app's commuters are in Lithuania; server-side "today" means theirs. */
export function localDateISO(addDays = 0, timeZone = 'Europe/Vilnius'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + addDays * 86_400_000));
}

export interface IntentRow {
  id: string;
  user_id: string;
  role: 'driver' | 'passenger';
  trip_date: string;
  status: string;
  generation: number;
  passenger_capacity: number | null;
  departure_time: string | null;
  departs_at: string | null;
  home_lat: number;
  home_long: number;
  work_lat: number;
  work_long: number;
  profiles?: {
    first_name: string | null;
    expo_push_token: string | null;
    notification_prefs: { matches?: boolean } | null;
    share_pickup_address: boolean | null;
  } | null;
}

export const INTENT_COLUMNS =
  'id, user_id, role, trip_date, status, generation, passenger_capacity, departure_time, departs_at, ' +
  'home_lat, home_long, work_lat, work_long, ' +
  'profiles(first_name, expo_push_token, notification_prefs, share_pickup_address)';

const round1 = (x: number) => Math.round(x * 10) / 10;
const walkMin = (m: number) => Math.max(1, Math.round(m / 80));

/** Columns of trip_intent_matches that describe the plan (pickup, drop-off, times). */
export function planColumns(driver: IntentRow, plan: RidePlan, driverDepartMin: number) {
  const pickupAt = driver.departs_at
    ? new Date(Date.parse(driver.departs_at) + plan.pickupOffsetS * 1000).toISOString()
    : null;
  return {
    pickup_kind: plan.pickupKind,
    pickup_lat: plan.pickup[1],
    pickup_long: plan.pickup[0],
    pickup_at: pickupAt,
    walk_to_pickup_m: Math.round(plan.walkToPickupM),
    detour_km: round1(plan.detourM / 1000),
    detour_min: Math.round(plan.detourS / 60),
    dropoff_lat: plan.dropoff[1],
    dropoff_long: plan.dropoff[0],
    walk_from_dropoff_m: Math.round(plan.walkFromDropoffM),
    shared_km: round1(plan.sharedM / 1000),
    proposed_departure: minutesToHHMM(driverDepartMin),
    proposed_pickup_time: minutesToHHMM(driverDepartMin + plan.pickupOffsetS / 60),
    proposed_dropoff_time: minutesToHHMM(driverDepartMin + plan.dropoffOffsetS / 60),
    // How well it fits, from the same cost the matcher ranks by.
    ai_compatibility_score: Math.round(Math.max(40, Math.min(99, 100 - plan.cost * 3))),
  };
}

/** One plain sentence about the fit, shown on both people's match cards. */
export function planSummary(plan: RidePlan): string {
  const together = `${round1(plan.sharedM / 1000)} km together`;
  if (plan.pickupKind === 'door') {
    return `Door pickup: +${round1(plan.detourM / 1000)} km (about ${Math.max(1, Math.round(plan.detourS / 60))} min) for the driver, ${together}.`;
  }
  return plan.walkToPickupM < 60
    ? `Pickup right on the driver's route, ${together}.`
    : `On the driver's route: ${walkMin(plan.walkToPickupM)} min walk to the pickup, ${together}.`;
}

/** First part of an address ("Gedimino pr. 9" from "Gedimino pr. 9, Vilnius, …"). */
export const street = (address: string | null | undefined) => (address ?? '').split(',')[0].trim() || 'the pickup point';

async function pushIfAllowed(intent: IntentRow, title: string, body: string) {
  const prof = intent.profiles;
  if (!prof?.expo_push_token || prof.notification_prefs?.matches === false) return;
  await sendPush({ to: prof.expo_push_token, title, body, data: { screen: 'daily-commute' } });
}

/**
 * Tells the people whose open match was released by close_trip_intent (stop
 * looking / changed trip). The database already put them back into matching.
 */
export async function notifyReleased(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  actorId: string,
  released: Array<{ partner_user_id: string }>,
): Promise<void> {
  const ids = [...new Set(released.map((r) => r.partner_user_id))];
  if (ids.length === 0) return;
  const [{ data: me }, { data: partners }] = await Promise.all([
    supabase.from('profiles').select('first_name').eq('id', actorId).maybeSingle(),
    supabase.from('profiles').select('id, expo_push_token, notification_prefs').in('id', ids),
  ]);
  const who = me?.first_name ?? 'Your match';
  for (const p of partners ?? []) {
    if (!p.expo_push_token || (p.notification_prefs as { matches?: boolean } | null)?.matches === false) continue;
    await sendPush({
      to: p.expo_push_token,
      title: 'Carpool cancelled',
      body: `${who} changed their plans. We're looking for another match.`,
      data: { screen: 'daily-commute' },
    });
  }
}

/** Tells both people about a new match, with where and when the pickup is. */
export async function pushNewMatch(
  driver: IntentRow,
  rider: IntentRow,
  m: { pickup_kind: string; proposed_pickup_time: string; walk_to_pickup_m: number; detour_min: number },
  pickupAddress: string,
): Promise<void> {
  const riderName = rider.profiles?.first_name ?? 'A rider';
  const driverName = driver.profiles?.first_name ?? 'A driver';
  const where = `${m.proposed_pickup_time} at ${street(pickupAddress)}`;
  const forDriver = m.pickup_kind === 'door'
    ? `Pickup ${where}, about ${Math.max(1, m.detour_min)} min extra for you.`
    : `Pickup ${where}, on your route.`;
  const forRider = m.pickup_kind === 'door'
    ? `Pickup ${where}, at your door.`
    : `Pickup ${where}, ${walkMin(m.walk_to_pickup_m)} min walk for you.`;
  await Promise.all([
    pushIfAllowed(driver, `Carpool match: ${riderName}`, `${forDriver} Open Clyzio to accept or decline.`),
    pushIfAllowed(rider, `Carpool match: ${driverName}`, `${forRider} Open Clyzio to accept or decline.`),
  ]);
}
