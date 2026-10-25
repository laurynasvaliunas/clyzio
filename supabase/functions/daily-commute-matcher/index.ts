/**
 * daily-commute-matcher — pairs drivers and riders for a day.
 *
 * Modes:
 *   • targeted ({ new_intent_id }) — the usual path. Migration 053's triggers
 *     call it whenever a trip starts searching (new, re-submitted, released by
 *     a decline or cancel) or a driver's seat frees up. A rider gets the single
 *     best driver; a driver gets the best riders for their free seats.
 *   • batch ({ trip_date? }, 18:00 cron) — a sweep over everything still
 *     searching for tomorrow, in case a targeted call was missed.
 *   • nudge ({ nudge: true }, 13:30 cron) — "plan tomorrow" reminder.
 *
 * A rider fits a driver when the driver's route passes them on the way (pickup
 * on the route within a short walk, or at their door for a small detour) and
 * the driver reaches the pickup within ±15 min of the rider's leaving time —
 * see _shared/route.ts. The database refuses anything else (seats, one live
 * match per rider, closed trips), so racing runs can't double-book.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, DailyCommuteMatcherSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';
import { reverseGeocode, mapboxToken as getMapboxToken } from '../_shared/geocode.ts';
import {
  buildRoute,
  distanceToRouteM,
  type DrivingRoute,
  fetchDrivingRoute,
  type LngLat,
  parseTimeToMinutes,
  planRide,
  type RidePlan,
} from '../_shared/route.ts';
import {
  INTENT_COLUMNS,
  type IntentRow,
  localDateISO,
  planColumns,
  planSummary,
  pushNewMatch,
} from '../_shared/carpool.ts';

/** Straight-line corridor around the driver's home→work line worth routing. */
const CORRIDOR_M = 3000;
/** A trip whose leaving time passed this long ago isn't matched any more. */
const LATE_MS = 15 * 60 * 1000;

/**
 * Auth gate: a valid user JWT (on-demand runs from the app) or the
 * `x-cron-secret` header (cron jobs and migration 053's triggers).
 */
async function authorise(req: Request): Promise<SupabaseClient | Response> {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }
  try {
    const { supabase } = await verifyAuth(req);
    return supabase;
  } catch {
    return respondError(401, 'unauthorized');
  }
}

const home = (i: IntentRow): LngLat => [i.home_long, i.home_lat];
const work = (i: IntentRow): LngLat => [i.work_long, i.work_lat];
const pairKey = (d: { id: string; generation: number }, p: { id: string; generation: number }) =>
  `${d.id}:${d.generation}:${p.id}:${p.generation}`;
const notLate = (i: IntentRow) => !i.departs_at || Date.parse(i.departs_at) > Date.now() - LATE_MS;

interface Candidate {
  driver: IntentRow;
  rider: IntentRow;
  plan: RidePlan;
  driverDepartMin: number;
}

/** One matcher run: caches driver routes so each is fetched from Mapbox once. */
class MatchRun {
  private routes = new Map<string, Promise<DrivingRoute | null>>();
  private tried = new Set<string>();
  created = 0;

  constructor(
    private supabase: SupabaseClient,
    private anthropic: Anthropic,
    private token: string,
  ) {}

  /** Remembers which pairs were already offered in these generations. */
  async loadTried(intentIds: string[]): Promise<void> {
    if (intentIds.length === 0) return;
    const { data } = await this.supabase
      .from('trip_intent_matches')
      .select('driver_intent_id, driver_generation, passenger_intent_id, passenger_generation')
      .or(`driver_intent_id.in.(${intentIds.join(',')}),passenger_intent_id.in.(${intentIds.join(',')})`);
    for (const m of data ?? []) {
      this.tried.add(`${m.driver_intent_id}:${m.driver_generation}:${m.passenger_intent_id}:${m.passenger_generation}`);
    }
  }

  private route(driver: IntentRow): Promise<DrivingRoute | null> {
    let r = this.routes.get(driver.id);
    if (!r) {
      r = fetchDrivingRoute([home(driver), work(driver)], this.token);
      this.routes.set(driver.id, r);
    }
    return r;
  }

  /** Does this rider fit this driver's trip, and how well? */
  async evaluate(driver: IntentRow, rider: IntentRow): Promise<Candidate | null> {
    if (driver.user_id === rider.user_id || driver.trip_date !== rider.trip_date) return null;
    if (this.tried.has(pairKey(driver, rider))) return null;
    const driverDepartMin = parseTimeToMinutes(driver.departure_time);
    const riderDepartMin = parseTimeToMinutes(rider.departure_time);
    if (driverDepartMin == null || riderDepartMin == null) return null;

    // Cheap straight-line pre-filter before any API call.
    const line = buildRoute([home(driver), work(driver)]);
    if (distanceToRouteM(line, home(rider)) > CORRIDOR_M || distanceToRouteM(line, work(rider)) > CORRIDOR_M) {
      return null;
    }
    if (riderDepartMin < driverDepartMin - 15 || riderDepartMin > driverDepartMin + line.durationS / 60 + 30) {
      return null;
    }

    // Trip-level rule (migration 045): colleagues, public independents, or an
    // employee's trip opened to independents. Fail closed.
    const { data: canPair, error } = await this.supabase.rpc('can_pair_intents', {
      p_driver_intent: driver.id,
      p_passenger_intent: rider.id,
    });
    if (error || canPair !== true) return null;

    const route = await this.route(driver);
    if (!route) return null;
    const plan = await planRide(
      route,
      {
        origin: home(rider),
        destination: work(rider),
        departMin: riderDepartMin,
        // A rider who hides their address only gets meeting points on the route.
        doorAllowed: rider.profiles?.share_pickup_address !== false,
      },
      driverDepartMin,
      (via) => fetchDrivingRoute([home(driver), via, work(driver)], this.token),
    );
    return plan ? { driver, rider, plan, driverDepartMin } : null;
  }

  /** One sentence for the match card; the plain summary when the AI is slow or down. */
  private async reasoning(plan: RidePlan): Promise<string> {
    const plain = planSummary(plan);
    try {
      const ask = this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content:
            'Rewrite this carpool match summary as one friendly sentence of at most 20 words. ' +
            `Keep every number exactly as given and add no new facts: "${plain}"`,
        }],
      });
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
      const msg = await Promise.race([ask, timeout]);
      const text = (msg?.content?.[0] as { text?: string } | undefined)?.text?.trim();
      return text && text.length < 200 ? text : plain;
    } catch {
      return plain;
    }
  }

  /** Offers the match. False when the database refused it (seat taken meanwhile, …). */
  async create(c: Candidate): Promise<boolean> {
    const cols = planColumns(c.driver, c.plan, c.driverDepartMin);
    const [pickupAddress, dropoffAddress, reasoning] = await Promise.all([
      reverseGeocode(c.plan.pickup[0], c.plan.pickup[1], this.token),
      reverseGeocode(c.plan.dropoff[0], c.plan.dropoff[1], this.token),
      this.reasoning(c.plan),
    ]);
    const { data, error } = await this.supabase
      .from('trip_intent_matches')
      .insert({
        driver_intent_id: c.driver.id,
        passenger_intent_id: c.rider.id,
        driver_user_id: c.driver.user_id,
        passenger_user_id: c.rider.user_id,
        trip_date: c.driver.trip_date,
        ...cols,
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        ai_reasoning: reasoning,
        // Symmetric approval (migration 021): both approve, in any order.
        status: 'pending',
        driver_approved: false,
        passenger_approved: false,
      })
      .select('id')
      .maybeSingle();
    this.tried.add(pairKey(c.driver, c.rider));
    if (error || !data) {
      if (error) console.log('[matcher] match refused:', error.message);
      return false;
    }
    this.created++;
    await pushNewMatch(c.driver, c.rider, cols, pickupAddress);
    return true;
  }
}

/** Open trips for a day: riders still searching, drivers with a free seat. */
async function openPool(supabase: SupabaseClient, tripDate: string) {
  const { data, error } = await supabase
    .from('trip_intents')
    .select(INTENT_COLUMNS)
    .eq('trip_date', tripDate)
    .in('status', ['pending', 'matched']);
  if (error) throw error;
  const intents = ((data ?? []) as unknown as IntentRow[]).filter(notLate);

  const riders = intents.filter((i) => i.role === 'passenger' && i.status === 'pending');
  const drivers: Array<IntentRow & { free: number }> = [];
  for (const d of intents.filter((i) => i.role === 'driver')) {
    const free = d.status === 'pending'
      ? (d.passenger_capacity ?? 1)
      : (((await supabase.rpc('carpool_free_seats', { p_intent: d.id })).data as number | null) ?? 0);
    if (free > 0) drivers.push({ ...d, free });
  }
  return { riders, drivers };
}

// ─── Targeted ─────────────────────────────────────────────────────────────────

async function runTargeted(run: MatchRun, supabase: SupabaseClient, intentId: string): Promise<Response> {
  const { data: me } = await supabase
    .from('trip_intents')
    .select(INTENT_COLUMNS)
    .eq('id', intentId)
    .maybeSingle();
  const ni = me as unknown as IntentRow | null;
  if (!ni || !['pending', 'matched'].includes(ni.status) || !notLate(ni)) {
    return respondJSON({ ok: true, targeted: true, matches_created: 0, note: 'intent_not_open' });
  }

  const { riders, drivers } = await openPool(supabase, ni.trip_date);

  if (ni.role === 'passenger') {
    if (ni.status !== 'pending') {
      return respondJSON({ ok: true, targeted: true, matches_created: 0, note: 'rider_has_match' });
    }
    await run.loadTried([ni.id]);
    const found: Candidate[] = [];
    for (const d of drivers) {
      const c = await run.evaluate(d, ni);
      if (c) found.push(c);
    }
    // One offer at a time for a rider: the best fit; the next if a seat went meanwhile.
    found.sort((a, b) => a.plan.cost - b.plan.cost);
    for (const c of found) {
      if (await run.create(c)) break;
    }
  } else {
    const me2 = drivers.find((d) => d.id === ni.id);
    if (!me2) {
      return respondJSON({ ok: true, targeted: true, matches_created: 0, note: 'no_free_seats' });
    }
    await run.loadTried([ni.id]);
    const found: Candidate[] = [];
    for (const r of riders) {
      const c = await run.evaluate(me2, r);
      if (c) found.push(c);
    }
    found.sort((a, b) => a.plan.cost - b.plan.cost);
    let left = me2.free;
    for (const c of found) {
      if (left <= 0) break;
      if (await run.create(c)) left--;
    }
  }

  return respondJSON({ ok: true, targeted: true, matches_created: run.created });
}

// ─── Batch sweep ──────────────────────────────────────────────────────────────

async function runBatch(run: MatchRun, supabase: SupabaseClient, tripDate: string): Promise<Response> {
  // Once per day (a double cron fire must not double-push).
  const { error: claimError } = await supabase.from('matcher_runs').insert({ run_date: tripDate });
  if (claimError) return respondJSON({ skipped: true, trip_date: tripDate });

  const { riders, drivers } = await openPool(supabase, tripDate);
  await run.loadTried([...riders, ...drivers].map((i) => i.id));
  console.log(`matcher: ${drivers.length}d vs ${riders.length}p for ${tripDate}`);

  // Every feasible pair, then the cheapest first: each rider once, each driver
  // up to their free seats.
  const all: Candidate[] = [];
  for (const d of drivers) {
    for (const r of riders) {
      const c = await run.evaluate(d, r);
      if (c) all.push(c);
    }
  }
  all.sort((a, b) => a.plan.cost - b.plan.cost);
  const seats = new Map(drivers.map((d) => [d.id, d.free]));
  const placed = new Set<string>();
  for (const c of all) {
    if (placed.has(c.rider.id) || (seats.get(c.driver.id) ?? 0) <= 0) continue;
    if (await run.create(c)) {
      placed.add(c.rider.id);
      seats.set(c.driver.id, (seats.get(c.driver.id) ?? 1) - 1);
    }
  }

  // Riders still searching keep searching; tell them once tonight.
  for (const r of riders) {
    if (placed.has(r.id)) continue;
    const prof = r.profiles;
    if (!prof?.expo_push_token || prof.notification_prefs?.matches === false) continue;
    await sendPush({
      to: prof.expo_push_token,
      title: 'Still looking for your carpool',
      body: "No driver on your route yet for tomorrow. We'll tell you as soon as someone joins.",
      data: { screen: 'daily-commute' },
    });
  }

  await supabase.from('matcher_runs').update({
    completed_at: new Date().toISOString(),
    intents_processed: riders.length + drivers.length,
    matches_created: run.created,
  }).eq('run_date', tripDate);

  return respondJSON({
    ok: true,
    trip_date: tripDate,
    intents_processed: riders.length + drivers.length,
    matches_created: run.created,
  });
}

// ─── Nudge ────────────────────────────────────────────────────────────────────

/**
 * 13:30 nudge (PDF D7): push commuters who haven't planned tomorrow yet —
 * no ride and no carpool trip for that day. Once a day (matcher_runs claim).
 */
async function runNudge(supabase: SupabaseClient): Promise<Response> {
  const tomorrow = localDateISO(1);
  const { error: claimError } = await supabase.from('matcher_runs').insert({ run_date: `nudge:${tomorrow}` });
  if (claimError) {
    return respondJSON({ ok: true, nudge: true, skipped: true, trip_date: tomorrow });
  }

  const dayStart = `${tomorrow}T00:00:00.000Z`;
  const dayEnd = `${tomorrow}T23:59:59.999Z`;
  const [{ data: planned }, { data: trips }] = await Promise.all([
    supabase
      .from('rides')
      .select('rider_id, driver_id')
      .in('status', ['scheduled', 'requested', 'active'])
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd),
    supabase.from('trip_intents').select('user_id').eq('trip_date', tomorrow).neq('status', 'expired'),
  ]);
  const plannedIds = new Set<string>();
  for (const r of planned ?? []) {
    if (r.rider_id) plannedIds.add(r.rider_id);
    if (r.driver_id) plannedIds.add(r.driver_id);
  }
  for (const t of trips ?? []) plannedIds.add(t.user_id);

  const { data: candidates } = await supabase
    .from('profiles')
    .select('id, expo_push_token')
    .not('expo_push_token', 'is', null)
    .not('home_lat', 'is', null);

  let pushed = 0;
  for (const c of candidates ?? []) {
    if (plannedIds.has(c.id) || !c.expo_push_token) continue;
    await sendPush({
      to: c.expo_push_token,
      title: 'Plan tomorrow’s commute',
      body: 'Have you planned tomorrow’s commute yet? Tap to pick your greenest way to work.',
      data: { screen: 'index' },
    });
    pushed++;
  }
  return respondJSON({ ok: true, nudge: true, pushed, trip_date: tomorrow });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const gate = await authorise(req);
  if (gate instanceof Response) return gate;
  const supabase = gate;

  const parsed = await parseBody(req, DailyCommuteMatcherSchema);
  if (!parsed.ok) return parsed.response;

  const run = new MatchRun(
    supabase,
    new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' }),
    getMapboxToken(),
  );

  try {
    if (parsed.data.nudge) return await runNudge(supabase);
    if (parsed.data.new_intent_id) return await runTargeted(run, supabase, parsed.data.new_intent_id);
    return await runBatch(run, supabase, parsed.data.trip_date ?? localDateISO(1));
  } catch (err) {
    return respondInternalError('daily-commute-matcher', err);
  }
});
