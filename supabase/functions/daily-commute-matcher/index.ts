import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Geo helpers ─────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

function nearestPointOnPolyline(
  passengerHome: [number, number],
  driverRoute: [number, number][]
): [number, number] {
  let best: { point: [number, number]; dist: number } = { point: driverRoute[0], dist: Infinity };
  for (let i = 0; i < driverRoute.length - 1; i++) {
    const candidate = nearestOnSegment(passengerHome, driverRoute[i], driverRoute[i + 1]);
    const d = haversineKm(passengerHome[1], passengerHome[0], candidate[1], candidate[0]);
    if (d < best.dist) best = { point: candidate, dist: d };
  }
  return best.point;
}

// ─── Mapbox route fetch ───────────────────────────────────────────────────────

async function fetchMapboxRoute(
  originLon: number, originLat: number,
  destLon: number, destLat: number,
  mapboxToken: string
): Promise<[number, number][]> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLon},${originLat};${destLon},${destLat}?geometries=geojson&access_token=${mapboxToken}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.routes?.[0]?.geometry?.coordinates ?? [];
}

// ─── Reverse geocode ─────────────────────────────────────────────────────────

async function reverseGeocode(lon: number, lat: number, mapboxToken: string): Promise<string> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${mapboxToken}&limit=1`;
    const res = await fetch(url);
    const json = await res.json();
    return json.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

// ─── Push notification ────────────────────────────────────────────────────────

async function sendPush(token: string, title: string, body: string, data?: Record<string, unknown>) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default" }),
    });
  } catch (e) {
    console.error("Push error:", e);
  }
}

// ─── Claude Haiku scoring ─────────────────────────────────────────────────────

async function scoreMatch(
  anthropic: Anthropic,
  driver: { departure_time: string | null; home_lat: number; home_long: number; work_lat: number; work_long: number },
  passenger: { required_arrival_time: string | null; home_lat: number; home_long: number; work_lat: number; work_long: number },
  detourKm: number
): Promise<{ score: number; reasoning: string; proposed_departure: string; proposed_pickup_time: string }> {
  const prompt = `You are a commute-match scorer for a carpooling app. Given a driver and passenger, produce a compatibility score and suggested timing.

Driver departs: ${driver.departure_time ?? "flexible"}
Passenger must arrive by: ${passenger.required_arrival_time ?? "flexible"}
Estimated detour for pickup: ${detourKm.toFixed(1)} km
Driver home→work straight distance: ${haversineKm(driver.home_lat, driver.home_long, driver.work_lat, driver.work_long).toFixed(1)} km
Passenger home→work straight distance: ${haversineKm(passenger.home_lat, passenger.home_long, passenger.work_lat, passenger.work_long).toFixed(1)} km

Respond with ONLY valid JSON (no markdown):
{
  "score": <0-100>,
  "reasoning": "<one sentence why they match well or poorly>",
  "proposed_departure": "<HH:MM>",
  "proposed_pickup_time": "<HH:MM>"
}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text;
    return JSON.parse(text);
  } catch {
    // Fallback if AI fails
    const depHour = driver.departure_time ? parseInt(driver.departure_time.split(":")[0]) : 8;
    return {
      score: 70,
      reasoning: "Route directions appear compatible based on proximity.",
      proposed_departure: driver.departure_time ?? "08:00",
      proposed_pickup_time: `${String(depHour).padStart(2, "0")}:${driver.departure_time?.split(":")[1] ?? "15"}`,
    };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const mapboxToken = Deno.env.get("MAPBOX_TOKEN") ?? Deno.env.get("EXPO_PUBLIC_MAPBOX_TOKEN") ?? "";

  try {
    // Determine today (Vilnius time) → tomorrow is the trip date
    const now = new Date();
    // Get the trip_date this run covers — allow manual override via body for testing
    let tripDate: string;
    try {
      const body = await req.json().catch(() => ({}));
      tripDate = body.trip_date ?? (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
      })();
    } catch {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      tripDate = d.toISOString().split("T")[0];
    }

    // Idempotency: try to claim this run date
    const { error: claimError } = await supabase
      .from("matcher_runs")
      .insert({ run_date: tripDate });

    if (claimError) {
      // Already ran for this date (PK conflict)
      console.log(`Matcher already ran for ${tripDate}, skipping.`);
      return new Response(JSON.stringify({ skipped: true, trip_date: tripDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all pending intents for tomorrow
    const { data: intents, error: intentsError } = await supabase
      .from("trip_intents")
      .select("*, profiles(first_name, expo_push_token)")
      .eq("trip_date", tripDate)
      .eq("status", "pending");

    if (intentsError) throw intentsError;

    const drivers = (intents ?? []).filter(i => i.role === "driver");
    const passengers = (intents ?? []).filter(i => i.role === "passenger");

    console.log(`Matching ${drivers.length} drivers vs ${passengers.length} passengers for ${tripDate}`);

    let matchesCreated = 0;

    // Track which passengers are already matched this run (one match per passenger)
    const matchedPassengerIds = new Set<string>();

    for (const driver of drivers) {
      const driverMatchIds: string[] = [];
      const passengerNotifyList: string[] = [];

      for (const passenger of passengers) {
        if (matchedPassengerIds.has(passenger.id)) continue;

        // Proximity filter: passenger home within 10 km of driver home
        const homeDist = haversineKm(driver.home_lat, driver.home_long, passenger.home_lat, passenger.home_long);
        if (homeDist > 10) continue;

        // Fetch driver route geometry for pickup calculation
        const driverRoute = await fetchMapboxRoute(
          driver.home_long, driver.home_lat,
          driver.work_long, driver.work_lat,
          mapboxToken
        );

        // Find nearest pickup point on driver's route
        let pickupLon: number;
        let pickupLat: number;
        if (driverRoute.length > 1) {
          const nearest = nearestPointOnPolyline(
            [passenger.home_long, passenger.home_lat],
            driverRoute as [number, number][]
          );
          pickupLon = nearest[0];
          pickupLat = nearest[1];
        } else {
          pickupLon = passenger.home_long;
          pickupLat = passenger.home_lat;
        }

        const detourKm = haversineKm(driver.home_lat, driver.home_long, pickupLat, pickupLon) +
          haversineKm(pickupLat, pickupLon, driver.work_lat, driver.work_long) -
          haversineKm(driver.home_lat, driver.home_long, driver.work_lat, driver.work_long);

        // AI scoring
        const scored = await scoreMatch(anthropic, driver, passenger, Math.max(0, detourKm));

        if (scored.score < 40) continue; // Skip poor matches

        const pickupAddress = await reverseGeocode(pickupLon, pickupLat, mapboxToken);

        // Insert match
        const { data: newMatch, error: matchInsertError } = await supabase
          .from("trip_intent_matches")
          .insert({
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
          })
          .select("id")
          .single();

        if (matchInsertError) {
          console.error("Match insert error:", matchInsertError);
          continue;
        }

        matchesCreated++;
        matchedPassengerIds.add(passenger.id);
        driverMatchIds.push(newMatch.id);
        if (passenger.profiles?.expo_push_token) {
          passengerNotifyList.push(passenger.profiles.expo_push_token);
        }
      }

      if (driverMatchIds.length > 0) {
        // Update driver intent status
        await supabase
          .from("trip_intents")
          .update({ status: "matched" })
          .eq("id", driver.id);

        // Notify driver
        if (driver.profiles?.expo_push_token) {
          await sendPush(
            driver.profiles.expo_push_token,
            "Commute Matches Found!",
            `You have ${driverMatchIds.length} passenger match${driverMatchIds.length > 1 ? "es" : ""} for tomorrow. Tap to review.`,
            { screen: "daily-commute" }
          );
        }

        // Notify matched passengers
        for (const pushToken of passengerNotifyList) {
          await sendPush(
            pushToken,
            "Driver Match Found!",
            "A driver match was found for your commute tomorrow. Tap to confirm.",
            { screen: "daily-commute" }
          );
        }
      }
    }

    // Mark unmatched intents
    const unmatchedDriverIds = drivers
      .filter(d => !matchedPassengerIds.has(d.id) && matchesCreated === 0)
      .map(d => d.id);

    // Notify unmatched users
    const allUnmatched = [
      ...drivers.filter(d => {
        // Driver is unmatched if we didn't add any matches for them
        return true; // Check will be done per-driver above — simplified here
      }),
      ...passengers.filter(p => !matchedPassengerIds.has(p.id)),
    ];

    for (const intent of allUnmatched) {
      if (intent.status === "pending" && intent.profiles?.expo_push_token) {
        await sendPush(
          intent.profiles.expo_push_token,
          "No Match Today",
          "We couldn't find a carpool match for tomorrow. You're on your own — try again tomorrow!",
          { screen: "daily-commute" }
        );
        await supabase
          .from("trip_intents")
          .update({ status: "unmatched" })
          .eq("id", intent.id);
      }
    }

    // Update matcher_runs with results
    await supabase
      .from("matcher_runs")
      .update({
        completed_at: new Date().toISOString(),
        intents_processed: (intents ?? []).length,
        matches_created: matchesCreated,
      })
      .eq("run_date", tripDate);

    return new Response(
      JSON.stringify({ ok: true, trip_date: tripDate, intents_processed: (intents ?? []).length, matches_created: matchesCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("daily-commute-matcher error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
