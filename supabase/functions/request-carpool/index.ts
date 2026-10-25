/**
 * request-carpool — turns a Map-radar tap into a mutual-approval match
 * (migrations 021, 053).
 *
 * Tapping "Request" on a nearby commuter:
 *   1. The TARGET must already be searching that day in the opposite role (a
 *      rider without a match, or a driver with a free seat). Their trip is
 *      never created or changed for them.
 *   2. The CALLER uses their own trip that day in the requested role, or gets
 *      one from their profile commute (at the target's leaving time).
 *   3. The pickup and drop-off are planned like the matcher does, with looser
 *      limits — the target sees exactly where and when, and decides.
 *   4. The match starts with the caller approved; the target is pushed.
 * The target approves via respond-to-match → the ride is created for both.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, RequestCarpoolSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';
import { reverseGeocode, mapboxToken } from '../_shared/geocode.ts';
import {
  DEFAULT_LIMITS,
  fetchDrivingRoute,
  type LngLat,
  nearestOnRoute,
  parseTimeToMinutes,
  planRide,
  type RideLimits,
  type RidePlan,
} from '../_shared/route.ts';
import { INTENT_COLUMNS, type IntentRow, localDateISO, planColumns, planSummary, street } from '../_shared/carpool.ts';

// A request is a person's own choice: plan it even when it isn't a tidy fit.
const REQUEST_LIMITS: RideLimits = {
  ...DEFAULT_LIMITS,
  doorPrefilterM: 20_000,
  maxDoorDetourM: 20_000,
  maxDropoffWalkM: 20_000,
  minSharedM: 0,
  maxTimeGapMin: 180,
};

const home = (i: IntentRow): LngLat => [i.home_long, i.home_lat];
const work = (i: IntentRow): LngLat => [i.work_long, i.work_lat];

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

  // Server-side visibility gate, mirroring the map's filter: otherwise any user
  // could target an arbitrary UUID and push them.
  const { data: visible, error: visErr } = await supabase.rpc('is_peer_visible', {
    p_caller: userId,
    p_target: target_user_id,
  });
  if (visErr) return respondInternalError('request-carpool', visErr, 'visibility_check_failed');
  if (!visible) return respondError(403, 'forbidden', 'peer_not_visible');

  const tripDate = trip_date ?? localDateISO(1);
  const callerIsDriver = requester_role === 'driver';
  const callerRole = callerIsDriver ? 'driver' : 'passenger';
  const targetRole = callerIsDriver ? 'passenger' : 'driver';

  const openTrip = async (id: string) => {
    const { data } = await supabase
      .from('trip_intents')
      .select(INTENT_COLUMNS)
      .eq('user_id', id)
      .eq('trip_date', tripDate)
      .neq('status', 'expired')
      .maybeSingle();
    return data as unknown as IntentRow | null;
  };
  /** Searching and with room: a rider without a match, a driver with a seat. */
  const hasRoom = async (i: IntentRow) =>
    i.role === 'passenger'
      ? i.status === 'pending'
      : (((await supabase.rpc('carpool_free_seats', { p_intent: i.id })).data as number | null) ?? 0) > 0;
  const conflict = (code: string) => respondError(409, 'conflict', code);

  try {
    // ── The target: already searching, in the other role ──────────────────
    const target = await openTrip(target_user_id);
    if (!target || target.role !== targetRole || !(await hasRoom(target))) return conflict('peer_unavailable');

    // ── The caller: their trip that day, or a new one from their profile ───
    let caller = await openTrip(userId);
    if (caller) {
      if (caller.role !== callerRole) return conflict('role_conflict');
      if (!(await hasRoom(caller))) return conflict(callerIsDriver ? 'no_seats_left' : 'already_matched');
    } else {
      const { data: me } = await supabase
        .from('profiles')
        .select('home_lat, home_long, work_lat, work_long, company_id')
        .eq('id', userId)
        .single();
      if (me?.home_lat == null || me?.work_lat == null) {
        return respondError(400, 'bad_request', 'caller_missing_home_or_work');
      }
      // An employee pairing with an independent must open their own trip
      // first (045) — never decided for them here.
      const { data: them } = await supabase.from('profiles').select('company_id').eq('id', target_user_id).single();
      if (me.company_id != null && them?.company_id == null) return respondError(403, 'forbidden', 'trip_not_open');

      const { error: saveErr } = await supabase.rpc('submit_trip_intent', {
        p_user: userId,
        p_trip_date: tripDate,
        p_fields: {
          role: callerRole,
          passenger_capacity: callerIsDriver ? 1 : null,
          departure_time: target.departure_time,
          home_lat: me.home_lat,
          home_long: me.home_long,
          work_lat: me.work_lat,
          work_long: me.work_long,
        },
      });
      if (saveErr) return respondInternalError('request-carpool', saveErr, 'caller_intent_failed');
      caller = await openTrip(userId);
      if (!caller) return respondInternalError('request-carpool', 'caller intent missing', 'caller_intent_failed');
    }

    const driver = callerIsDriver ? caller : target;
    const rider = callerIsDriver ? target : caller;

    const { data: canPair, error: pairErr } = await supabase.rpc('can_pair_intents', {
      p_driver_intent: driver.id,
      p_passenger_intent: rider.id,
    });
    if (pairErr) return respondInternalError('request-carpool', pairErr, 'pair_check_failed');
    if (canPair !== true) return respondError(403, 'forbidden', 'trip_not_open');

    // ── Pickup and drop-off ────────────────────────────────────────────────
    const token = mapboxToken();
    const driverDepartMin = parseTimeToMinutes(driver.departure_time) ?? parseTimeToMinutes(rider.departure_time);
    const riderDepartMin = parseTimeToMinutes(rider.departure_time) ?? driverDepartMin;
    const route = await fetchDrivingRoute([home(driver), work(driver)], token);
    let plan: RidePlan | null = route
      ? await planRide(
        route,
        {
          origin: home(rider),
          destination: work(rider),
          departMin: riderDepartMin,
          doorAllowed: rider.profiles?.share_pickup_address !== false,
        },
        driverDepartMin,
        (via) => fetchDrivingRoute([home(driver), via, work(driver)], token),
        REQUEST_LIMITS,
      )
      : null;
    // No usable route or times: the rider's door — or, when they hide their
    // address, the nearest point of the driver's route — to the driver's
    // destination; the times are agreed in chat.
    if (!plan) {
      const meetOnRoute = rider.profiles?.share_pickup_address === false && route
        ? nearestOnRoute(route, home(rider))
        : null;
      plan = {
        pickupKind: meetOnRoute ? 'route' : 'door',
        pickup: meetOnRoute?.point ?? home(rider),
        pickupOffsetS: 0,
        walkToPickupM: meetOnRoute?.distM ?? 0,
        detourM: 0,
        detourS: 0,
        dropoff: work(driver),
        dropoffOffsetS: route?.durationS ?? 0,
        walkFromDropoffM: 0,
        sharedM: route?.distanceM ?? 0,
        timeGapMin: 0,
        cost: 0,
      };
    }
    const cols = driverDepartMin != null
      ? planColumns(driver, plan, driverDepartMin)
      : {
        pickup_kind: plan.pickupKind,
        pickup_lat: plan.pickup[1],
        pickup_long: plan.pickup[0],
        dropoff_lat: plan.dropoff[1],
        dropoff_long: plan.dropoff[0],
      };
    const [pickupAddress, dropoffAddress] = await Promise.all([
      reverseGeocode(plan.pickup[0], plan.pickup[1], token),
      reverseGeocode(plan.dropoff[0], plan.dropoff[1], token),
    ]);

    // ── The match, with the caller already approved ────────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from('trip_intent_matches')
      .insert({
        driver_intent_id: driver.id,
        passenger_intent_id: rider.id,
        driver_user_id: driver.user_id,
        passenger_user_id: rider.user_id,
        trip_date: tripDate,
        ...cols,
        ai_compatibility_score: null,
        ai_reasoning: `Requested from the map. ${planSummary(plan)}`,
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        status: 'awaiting_other',
        driver_approved: callerIsDriver,
        passenger_approved: !callerIsDriver,
      })
      .select('id')
      .maybeSingle();
    if (insertErr) {
      if ((insertErr as { code?: string }).code === '23505') return respondJSON({ ok: true, already_requested: true });
      if (['no_seats_left', 'intent_closed'].includes(insertErr.message)) return conflict('peer_unavailable');
      return respondInternalError('request-carpool', insertErr, 'match_insert_failed');
    }

    // ── Push the target ────────────────────────────────────────────────────
    const { data: callerProfile } = await supabase.from('profiles').select('first_name').eq('id', userId).single();
    const callerName = callerProfile?.first_name ?? 'A colleague';
    const prof = target.profiles;
    if (prof?.expo_push_token && prof.notification_prefs?.matches !== false) {
      const when = 'proposed_pickup_time' in cols ? `${cols.proposed_pickup_time} ` : '';
      await sendPush({
        to: prof.expo_push_token,
        title: 'Carpool request',
        body: `${callerName} wants to carpool on ${tripDate}: pickup ${when}at ${street(pickupAddress)}. Open Clyzio to accept or decline.`,
        data: { screen: 'daily-commute' },
      });
    }

    return respondJSON({ ok: true, match_id: inserted?.id, status: 'awaiting_other' });
  } catch (err) {
    return respondInternalError('request-carpool', err);
  }
});
