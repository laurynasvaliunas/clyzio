/**
 * transit-routes — public-transit options via Google Directions (mode=transit).
 *
 * Powers the planner's Branch B (Bus / Tram / Metro / Trolleybus / Rail with
 * departure times + per-option CO₂). The Google key stays server-side. Results
 * are cached 6h in `transit_route_cache`, keyed by commute corridor + departure
 * hour, so colleagues on the same route share a lookup and we stay under the
 * free tier.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, TransitRoutesSchema } from '../_shared/validate.ts';

const CACHE_TTL_HOURS = 6;

// KEEP IN SYNC with lib/commuteUtils.ts TRANSIT_CO2_FACTORS (kg CO₂e/passenger-km).
const TRANSIT_CO2_FACTORS: Record<string, number> = {
  bus: 0.10,
  trolleybus: 0.025,
  tram: 0.035,
  subway: 0.04,
  rail: 0.035,
  mixed: 0.06,
};
function getTransitCO2(submode: string): number {
  return TRANSIT_CO2_FACTORS[submode] ?? TRANSIT_CO2_FACTORS.mixed;
}

// Map Google `vehicle.type` → our factor keys.
function mapVehicleType(t: string | undefined): string {
  switch ((t ?? '').toUpperCase()) {
    case 'BUS':
    case 'INTERCITY_BUS':
    case 'TROLLEYBUS': return t === 'TROLLEYBUS' ? 'trolleybus' : 'bus';
    case 'TRAM':
    case 'LIGHT_RAIL': return 'tram';
    case 'SUBWAY':
    case 'METRO_RAIL':
    case 'MONORAIL': return 'subway';
    case 'HEAVY_RAIL':
    case 'RAIL':
    case 'COMMUTER_TRAIN':
    case 'HIGH_SPEED_TRAIN': return 'rail';
    default: return 'bus';
  }
}

interface TransitOption {
  summary: string;
  submode: string;
  duration_min: number;
  departure_text: string | null;
  arrival_text: string | null;
  distance_km: number;
  co2_per_km: number;
  co2_kg: number;
}

// deno-lint-ignore no-explicit-any
function normalizeRoute(route: any): TransitOption | null {
  const leg = route?.legs?.[0];
  if (!leg) return null;
  const steps = Array.isArray(leg.steps) ? leg.steps : [];
  const transitSteps = steps.filter((s: any) => s.travel_mode === 'TRANSIT');
  if (transitSteps.length === 0) return null;

  const types = new Set<string>();
  const lines: string[] = [];
  for (const s of transitSteps) {
    const v = s.transit_details?.line?.vehicle?.type;
    const sub = mapVehicleType(v);
    types.add(sub);
    const name = s.transit_details?.line?.short_name
      ?? s.transit_details?.line?.name
      ?? sub;
    lines.push(name);
  }
  const submode = types.size === 1 ? [...types][0] : 'mixed';
  const co2PerKm = getTransitCO2(submode);
  const distanceKm = (leg.distance?.value ?? 0) / 1000;

  return {
    summary: lines.join(' → '),
    submode,
    duration_min: Math.round((leg.duration?.value ?? 0) / 60),
    departure_text: leg.departure_time?.text ?? null,
    arrival_text: leg.arrival_time?.text ?? null,
    distance_km: distanceKm,
    co2_per_km: co2PerKm,
    co2_kg: Math.round(distanceKm * co2PerKm * 1000) / 1000,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // deno-lint-ignore no-explicit-any
  let supabase: any;
  try {
    ({ supabase } = await verifyAuth(req));
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, TransitRoutesSchema);
  if (!parsed.ok) return parsed.response;
  const { origin_lat, origin_long, dest_lat, dest_long, departure_time } = parsed.data;

  const apiKey = Deno.env.get('GOOGLE_DIRECTIONS_API_KEY');
  if (!apiKey) return respondError(503, 'transit_unavailable', 'missing_google_key');

  try {
    const depDate = departure_time ? new Date(departure_time) : new Date();
    const depHour = depDate.getHours();
    const cacheKey =
      `${origin_lat.toFixed(2)},${origin_long.toFixed(2)}>` +
      `${dest_lat.toFixed(2)},${dest_long.toFixed(2)}@${depHour}`;

    // 1) Cache hit within TTL → return immediately.
    const { data: cached } = await supabase
      .from('transit_route_cache')
      .select('payload, created_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (cached?.created_at) {
      const ageMs = Date.now() - new Date(cached.created_at).getTime();
      if (ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000) {
        return respondJSON(cached.payload);
      }
    }

    // 2) Fetch from Google Directions (transit).
    const depUnix = Math.floor(depDate.getTime() / 1000);
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin_lat},${origin_long}` +
      `&destination=${dest_lat},${dest_long}` +
      `&mode=transit&alternatives=true&departure_time=${depUnix}&key=${apiKey}`;

    const res = await fetch(url);
    const json = await res.json();

    if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      console.error('google directions status:', json.status, json.error_message ?? '');
      return respondError(502, 'transit_upstream_error');
    }

    const options = (Array.isArray(json.routes) ? json.routes : [])
      .map(normalizeRoute)
      .filter((o: TransitOption | null): o is TransitOption => o !== null)
      .sort((a: TransitOption, b: TransitOption) => a.duration_min - b.duration_min)
      .slice(0, 4);

    const payload = { options };

    // 3) Cache (upsert) — best-effort; never block the response on cache write.
    await supabase
      .from('transit_route_cache')
      .upsert({ cache_key: cacheKey, payload, created_at: new Date().toISOString() },
        { onConflict: 'cache_key' })
      .then(() => undefined, () => undefined);

    return respondJSON(payload);
  } catch (err) {
    return respondInternalError('transit-routes', err);
  }
});
