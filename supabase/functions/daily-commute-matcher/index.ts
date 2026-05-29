import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, DailyCommuteMatcherSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';

// ─── Geo helpers ─────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestOnSegment(p: [number, number], a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

function nearestPointOnPolyline(home: [number, number], route: [number, number][]): [number, number] {
  let best: { point: [number, number]; dist: number } = { point: route[0], dist: Infinity };
  for (let i = 0; i < route.length - 1; i++) {
    const c = nearestOnSegment(home, route[i], route[i + 1]);
    const d = haversineKm(home[1], home[0], c[1], c[0]);
    if (d < best.dist) best = { point: c, dist: d };
  }
  return best.point;
}

async function fetchMapboxRoute(
  oLon: number, oLat: number, dLon: number, dLat: number, token: string,
): Promise<[number, number][]> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${oLon},${oLat};${dLon},${dLat}?geometries=geojson&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.routes?.[0]?.geometry?.coordinates ?? [];
  } catch { return []; }
}

async function reverseGeocode(lon: number, lat: number, token: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&limit=1`,
    );
    const json = await res.json();
    return json.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
}

async function scoreMatch(
  anthropic: Anthropic,
  driver: { departure_time: string | null; home_lat: number; home_long: number; work_lat: number; work_long: number },
  passenger: { required_arrival_time: string | null; home_lat: number; home_long: number; work_lat: number; work_long: number },
  detourKm: number,
): Promise<{ score: number; reasoning: string; proposed_departure: string; proposed_pickup_time: string }> {
  const prompt = `You are a commute-match scorer for a carpooling app.

Driver departs: ${driver.departure_time ?? 'flexible'}
Passenger must arrive by: ${passenger.required_arrival_time ?? 'flexible'}
Estimated detour for pickup: ${detourKm.toFixed(1)} km
Driver commute distance: ${haversineKm(driver.home_lat, driver.home_long, driver.work_lat, driver.work_long).toFixed(1)} km
Passenger commute distance: ${haversineKm(passenger.home_lat, passenger.home_long, passenger.work_lat, passenger.work_long).toFixed(1)} km

Respond with ONLY valid JSON (no markdown):
{"score":<0-100>,"reasoning":"<one sentence>","proposed_departure":"<HH:MM>","proposed_pickup_time":"<HH:MM>"}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    return JSON.parse((msg.content[0] as { type: string; text: string }).text);
  } catch {
    return {
      score: 70,
      reasoning: 'Route directions appear compatible based on proximity.',
      proposed_departure: driver.departure_time ?? '08:00',
      proposed_pickup_time: driver.departure_time ?? '08:15',
    };
  }
}

/**
 * Auth gate: accept either a valid user JWT (for on-demand runs from the app)
 * OR a matching `x-cron-secret` header (for scheduled cron invocations).
 *
 * Historically this function fell back to a service-role client when no auth
 * header was present — a CRITICAL anonymous DB-bypass vector. That fallback is
 * GONE. Configure `CRON_SHARED_SECRET` in project secrets and attach the
 * header in your cron job definition.
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

  // Otherwise require a valid user JWT
  try {
    const { supabase } = await verifyAuth(req);
    return supabase;
  } catch {
    return respondError(401, 'unauthorized');
  }
}

// ─── Pair evaluation (shared by batch + instant modes) ─────────────────────────

/**
 * Evaluate one driver↔passenger pair: same-company/cross-org visibility, geo
 * proximity, AI compatibility, then insert a trip_intent_matches row. Idempotent
 * via the (driver_intent_id, passenger_intent_id) unique index — a duplicate is a
 * no-op. Returns true only when a NEW match row was created.
 */
async function evaluatePair(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  mapboxToken: string,
  driver: any,
  passenger: any,
  tripDate: string,
): Promise<boolean> {
  const { data: visible, error: visibleErr } = await supabase.rpc('is_peer_visible', {
    p_caller: driver.user_id,
    p_target: passenger.user_id,
  });
  if (!visibleErr && visible === false) return false;

  const homeDist = haversineKm(driver.home_lat, driver.home_long, passenger.home_lat, passenger.home_long);
  if (homeDist > 10) return false;

  const driverRoute = await fetchMapboxRoute(
    driver.home_long, driver.home_lat, driver.work_long, driver.work_lat, mapboxToken,
  );

  let pickupLon: number, pickupLat: number;
  if (driverRoute.length > 1) {
    const nearest = nearestPointOnPolyline([passenger.home_long, passenger.home_lat], driverRoute as [number, number][]);
    pickupLon = nearest[0];
    pickupLat = nearest[1];
  } else {
    pickupLon = passenger.home_long;
    pickupLat = passenger.home_lat;
  }

  const detourKm = Math.max(
    0,
    haversineKm(driver.home_lat, driver.home_long, pickupLat, pickupLon) +
      haversineKm(pickupLat, pickupLon, driver.work_lat, driver.work_long) -
      haversineKm(driver.home_lat, driver.home_long, driver.work_lat, driver.work_long),
  );

  const scored = await scoreMatch(anthropic, driver, passenger, detourKm);
  if (scored.score < 40) return false;

  const pickupAddress = await reverseGeocode(pickupLon, pickupLat, mapboxToken);

  // ON CONFLICT DO NOTHING via upsert+ignoreDuplicates; .select() returns the
  // row only when it was actually inserted (empty on duplicate).
  const { data: inserted, error: matchInsertError } = await supabase
    .from('trip_intent_matches')
    .upsert(
      {
        driver_intent_id: driver.id,
        passenger_intent_id: passenger.id,
        driver_user_id: driver.user_id,
        passenger_user_id: passenger.user_id,
        trip_date: tripDate,
        ai_compatibility_score: scored.score,
        ai_reasoning: scored.reasoning,
        proposed_departure: scored.proposed_departure,
        proposed_pickup_time: scored.proposed_pickup_time,
        pickup_lat: pickupLat,
        pickup_long: pickupLon,
        pickup_address: pickupAddress,
        // Symmetric approval (migration 021): auto-matches start with neither
        // side approved. Both must approve (any order) to confirm the ride.
        status: 'pending',
        driver_approved: false,
        passenger_approved: false,
      },
      { onConflict: 'driver_intent_id,passenger_intent_id', ignoreDuplicates: true },
    )
    .select('id');

  if (matchInsertError) {
    console.error('match insert error:', matchInsertError);
    return false;
  }
  return Array.isArray(inserted) && inserted.length > 0;
}

/**
 * Push both sides of a freshly-created match. Symmetric framing (migration
 * 021): each side is asked to APPROVE — neither has to wait for the other to
 * go first, and the ride confirms once both have approved.
 */
async function pushMatch(driver: any, passenger: any): Promise<void> {
  const passengerName = passenger.profiles?.first_name ?? 'a passenger';
  const driverName = driver.profiles?.first_name ?? 'a driver';
  if (driver.profiles?.expo_push_token) {
    await sendPush({
      to: driver.profiles.expo_push_token,
      title: 'Carpool match found!',
      body: `You matched with ${passengerName}. Open Clyzio to approve and ride together.`,
      data: { screen: 'daily-commute' },
    });
  }
  if (passenger.profiles?.expo_push_token) {
    await sendPush({
      to: passenger.profiles.expo_push_token,
      title: 'Carpool match found!',
      body: `You matched with ${driverName}. Open Clyzio to approve and ride together.`,
      data: { screen: 'daily-commute' },
    });
  }
}

/**
 * Instant/targeted mode: match ONE newly-submitted intent against the nearest
 * viable opposite-role intent for its trip_date, and create the match row
 * immediately. Both parties' realtime subscriptions on trip_intent_matches fire
 * on the same INSERT, so the match appears the same second; push covers
 * backgrounded users. Bypasses the daily matcher_runs date-claim entirely.
 */
async function runTargeted(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  mapboxToken: string,
  newIntentId: string,
): Promise<Response> {
  const { data: ni, error } = await supabase
    .from('trip_intents')
    .select('*, profiles(first_name, expo_push_token)')
    .eq('id', newIntentId)
    .eq('status', 'pending')
    .single();

  if (error || !ni) {
    return respondJSON({ ok: true, targeted: true, matches_created: 0, note: 'intent_not_pending' });
  }

  const oppositeRole = ni.role === 'driver' ? 'passenger' : 'driver';
  const { data: pool } = await supabase
    .from('trip_intents')
    .select('*, profiles(first_name, expo_push_token)')
    .eq('trip_date', ni.trip_date)
    .eq('status', 'pending')
    .eq('role', oppositeRole)
    .neq('user_id', ni.user_id);

  // Try nearest candidates first; one solid match is enough for the instant path.
  const sorted = (pool ?? []).slice().sort(
    (a: any, b: any) =>
      haversineKm(ni.home_lat, ni.home_long, a.home_lat, a.home_long) -
      haversineKm(ni.home_lat, ni.home_long, b.home_lat, b.home_long),
  );

  let created = 0;
  for (const cand of sorted) {
    const driver = ni.role === 'driver' ? ni : cand;
    const passenger = ni.role === 'driver' ? cand : ni;
    const matched = await evaluatePair(supabase, anthropic, mapboxToken, driver, passenger, ni.trip_date);
    if (!matched) continue;
    created++;
    await pushMatch(driver, passenger);
    await supabase.from('trip_intents').update({ status: 'matched' }).in('id', [driver.id, passenger.id]);
    break;
  }

  return respondJSON({ ok: true, targeted: true, matches_created: created });
}

/**
 * 3:30 PM nudge (PDF D7): push commuters who haven't planned tomorrow yet.
 *
 * Cohort = profiles with a push token + a home location set, who have NO
 * scheduled/requested/active ride for tomorrow. Gentle, once-a-day reminder.
 * Idempotency reuses matcher_runs with a `nudge:<date>` sentinel so a double
 * cron fire doesn't double-push.
 */
async function runNudge(supabase: SupabaseClient): Promise<Response> {
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  // Idempotency claim (sentinel date string distinct from the matcher's).
  const claimKey = `nudge:${tomorrow}`;
  const { error: claimError } = await supabase
    .from('matcher_runs')
    .insert({ run_date: claimKey });
  if (claimError) {
    return respondJSON({ ok: true, nudge: true, skipped: true, trip_date: tomorrow });
  }

  const dayStart = `${tomorrow}T00:00:00.000Z`;
  const dayEnd = `${tomorrow}T23:59:59.999Z`;

  // Users who already have a ride scheduled for tomorrow → exclude.
  const { data: planned } = await supabase
    .from('rides')
    .select('rider_id, driver_id')
    .in('status', ['scheduled', 'requested', 'active'])
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd);

  const plannedIds = new Set<string>();
  for (const r of planned ?? []) {
    if (r.rider_id) plannedIds.add(r.rider_id);
    if (r.driver_id) plannedIds.add(r.driver_id);
  }

  // Candidate commuters: have a push token + a home location.
  const { data: candidates } = await supabase
    .from('profiles')
    .select('id, expo_push_token')
    .not('expo_push_token', 'is', null)
    .not('home_lat', 'is', null);

  let pushed = 0;
  for (const c of candidates ?? []) {
    if (plannedIds.has(c.id)) continue;
    if (!c.expo_push_token) continue;
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

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
  const mapboxToken = Deno.env.get('MAPBOX_TOKEN') ?? Deno.env.get('EXPO_PUBLIC_MAPBOX_TOKEN') ?? '';

  try {
    // Nudge mode: the 3:30 PM "plan tomorrow" reminder cohort.
    if (parsed.data.nudge) {
      return await runNudge(supabase);
    }

    // Instant mode: a single newly-submitted intent fired this run. Match it
    // now and return — no date-claim, no full batch.
    if (parsed.data.new_intent_id) {
      return await runTargeted(supabase, anthropic, mapboxToken, parsed.data.new_intent_id);
    }

    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();
    const tripDate: string = parsed.data.trip_date ?? tomorrow;

    // Idempotency
    const { error: claimError } = await supabase
      .from('matcher_runs')
      .insert({ run_date: tripDate });
    if (claimError) {
      return respondJSON({ skipped: true, trip_date: tripDate });
    }

    const { data: intents, error: intentsError } = await supabase
      .from('trip_intents')
      .select('*, profiles(first_name, expo_push_token)')
      .eq('trip_date', tripDate)
      .eq('status', 'pending');

    if (intentsError) throw intentsError;

    const drivers = (intents ?? []).filter((i: { role: string }) => i.role === 'driver');
    const passengers = (intents ?? []).filter((i: { role: string }) => i.role === 'passenger');

    console.log(`matcher: ${drivers.length}d vs ${passengers.length}p for ${tripDate}`);

    let matchesCreated = 0;
    const matchedPassengerIds = new Set<string>();

    for (const driver of drivers) {
      const before = matchesCreated;
      const passengerTokensToNotify: string[] = [];

      for (const passenger of passengers) {
        if (matchedPassengerIds.has(passenger.id)) continue;

        const matched = await evaluatePair(supabase, anthropic, mapboxToken, driver, passenger, tripDate);
        if (!matched) continue;

        matchesCreated++;
        matchedPassengerIds.add(passenger.id);
        if (passenger.profiles?.expo_push_token) {
          passengerTokensToNotify.push(passenger.profiles.expo_push_token);
        }
      }

      if (matchesCreated > before) {
        await supabase.from('trip_intents').update({ status: 'matched' }).eq('id', driver.id);
        if (driver.profiles?.expo_push_token) {
          const count = matchesCreated - before;
          await sendPush({
            to: driver.profiles.expo_push_token,
            title: 'Carpool matches found!',
            body: `You matched with ${count} passenger${count > 1 ? 's' : ''} for tomorrow. Open Clyzio to approve and ride together.`,
            data: { screen: 'daily-commute' },
          });
        }
        for (const token of passengerTokensToNotify) {
          await sendPush({
            to: token,
            title: 'Carpool match found!',
            body: 'You matched with a driver for tomorrow. Open Clyzio to approve and ride together.',
            data: { screen: 'daily-commute' },
          });
        }
      }
    }

    // Mark unmatched passengers
    for (const passenger of passengers) {
      if (!matchedPassengerIds.has(passenger.id)) {
        await supabase.from('trip_intents').update({ status: 'unmatched' }).eq('id', passenger.id);
        if (passenger.profiles?.expo_push_token) {
          await sendPush({
            to: passenger.profiles.expo_push_token,
            title: 'No match today',
            body: "We couldn't find a carpool match for tomorrow. Try again tomorrow!",
            data: { screen: 'daily-commute' },
          });
        }
      }
    }

    await supabase.from('matcher_runs').update({
      completed_at: new Date().toISOString(),
      intents_processed: (intents ?? []).length,
      matches_created: matchesCreated,
    }).eq('run_date', tripDate);

    return respondJSON({
      ok: true,
      trip_date: tripDate,
      intents_processed: (intents ?? []).length,
      matches_created: matchesCreated,
    });
  } catch (err) {
    return respondInternalError('daily-commute-matcher', err);
  }
});
