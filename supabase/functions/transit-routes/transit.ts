/**
 * Pure helpers for transit-routes: turn a Google Directions transit route into
 * a planner option, and build the shared cache key. Tested in transit.test.ts.
 */

export type TransitSubmode = 'bus' | 'trolleybus' | 'tram' | 'subway' | 'rail';

// kg CO₂e per passenger-km. KEEP IN SYNC with lib/commuteUtils.ts
// TRANSIT_CO2_FACTORS and the database's emission_factor rows (kind 'transit',
// migration 060), which credit the saved trip with the same vehicle.
export const TRANSIT_CO2_FACTORS: Record<TransitSubmode, number> = {
  bus: 0.097,        // EEA 2023
  trolleybus: 0.029, // EEA 2023 (tram; electric trolleybus)
  tram: 0.029,       // EEA 2023
  subway: 0.028,     // EEA 2023
  rail: 0.035,       // EEA 2023
};

/** Google `vehicle.type` → our sub-mode. */
export function mapVehicleType(t: string | undefined): TransitSubmode {
  switch ((t ?? '').toUpperCase()) {
    case 'TROLLEYBUS': return 'trolleybus';
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

export interface TransitOption {
  summary: string;
  submode: TransitSubmode;
  duration_min: number;
  /** Google's own text ("8:09 AM"); kept for app builds older than departure_ts. */
  departure_text: string | null;
  arrival_text: string | null;
  /** Unix seconds, formatted on the phone in its 12/24-hour setting. */
  departure_ts: number | null;
  arrival_ts: number | null;
  distance_km: number;
  co2_per_km: number;
  co2_kg: number;
}

// deno-lint-ignore no-explicit-any
export function normalizeRoute(route: any): TransitOption | null {
  const leg = route?.legs?.[0];
  if (!leg) return null;
  const steps = Array.isArray(leg.steps) ? leg.steps : [];
  // deno-lint-ignore no-explicit-any
  const transitSteps = steps.filter((s: any) => s.travel_mode === 'TRANSIT');
  if (transitSteps.length === 0) return null;

  // The vehicle that covers most of the ride decides the factor, so the
  // option shows the same CO₂ the saved trip is credited with.
  const metresBySubmode = new Map<TransitSubmode, number>();
  const lines: string[] = [];
  for (const s of transitSteps) {
    const sub = mapVehicleType(s.transit_details?.line?.vehicle?.type);
    metresBySubmode.set(sub, (metresBySubmode.get(sub) ?? 0) + (s.distance?.value ?? 0));
    lines.push(s.transit_details?.line?.short_name ?? s.transit_details?.line?.name ?? sub);
  }
  const submode = [...metresBySubmode].sort((a, b) => b[1] - a[1])[0][0];
  const co2PerKm = TRANSIT_CO2_FACTORS[submode];
  const distanceKm = (leg.distance?.value ?? 0) / 1000;

  return {
    summary: lines.join(' → '),
    submode,
    duration_min: Math.round((leg.duration?.value ?? 0) / 60),
    departure_text: leg.departure_time?.text ?? null,
    arrival_text: leg.arrival_time?.text ?? null,
    departure_ts: typeof leg.departure_time?.value === 'number' ? leg.departure_time.value : null,
    arrival_ts: typeof leg.arrival_time?.value === 'number' ? leg.arrival_time.value : null,
    distance_km: distanceKm,
    co2_per_km: co2PerKm,
    co2_kg: Math.round(distanceKm * co2PerKm * 1000) / 1000,
  };
}

/**
 * Google often returns the same lines at the same departure several times,
 * differing only in a few hundred metres of walking. Keep the first of each
 * (callers sort by duration first, so that's the fastest).
 */
export function uniqueOptions(options: TransitOption[]): TransitOption[] {
  const seen = new Set<string>();
  return options.filter((o) => {
    const key = `${o.summary}@${o.departure_ts ?? o.departure_text ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Cache key: the commute corridor (~1 km) and the departure hour **on that
 * date** (UTC). Without the date, a Friday-evening lookup was reused for
 * Saturday at the same hour, and weekend timetables differ.
 */
export function transitCacheKey(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  departure: Date,
): string {
  return `${origin.lat.toFixed(2)},${origin.lng.toFixed(2)}>` +
    `${dest.lat.toFixed(2)},${dest.lng.toFixed(2)}@${departure.toISOString().slice(0, 13)}`;
}
