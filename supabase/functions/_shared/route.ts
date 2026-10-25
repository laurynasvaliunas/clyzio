/**
 * Where and when a driver picks up a rider (migration 053).
 *
 * A rider matches a driver when the driver's route passes them on the way:
 *   • pickup — the point on the driver's route nearest the rider's start, if
 *     it's a short walk (≤ 800 m). Otherwise the driver comes to the rider's
 *     door, if that adds at most ~2 km of driving.
 *   • drop-off — the point on the route nearest the rider's destination
 *     (≤ 1 km walk), further along than the pickup.
 *   • time — the driver reaches the pickup within ±15 min of when the rider
 *     wants to leave. Times come from Mapbox's per-segment durations, not
 *     guesses.
 *
 * Pure apart from fetchDrivingRoute (Mapbox), so the matcher, request-carpool
 * and the Deno tests share exactly the same rules.
 */

/** [longitude, latitude], as Mapbox and GeoJSON order them. */
export type LngLat = [number, number];

export interface DrivingRoute {
  coords: LngLat[];
  /** Metres from the start to each coordinate. */
  cumM: number[];
  /** Seconds from the start to each coordinate. */
  cumS: number[];
  distanceM: number;
  durationS: number;
  /** Per leg (one per pair of consecutive waypoints). */
  legs: Array<{ distanceM: number; durationS: number }>;
}

export interface RideLimits {
  maxWalkToRouteM: number;
  maxDoorDetourM: number;
  /** Straight-line distance from the route beyond which a door pickup isn't even tried. */
  doorPrefilterM: number;
  maxDropoffWalkM: number;
  minSharedM: number;
  maxTimeGapMin: number;
}

export const DEFAULT_LIMITS: RideLimits = {
  maxWalkToRouteM: 800,
  maxDoorDetourM: 2000,
  doorPrefilterM: 1500,
  maxDropoffWalkM: 1000,
  minSharedM: 1000,
  maxTimeGapMin: 15,
};

export interface RidePlan {
  pickupKind: 'route' | 'door';
  pickup: LngLat;
  /** Seconds after the driver leaves. */
  pickupOffsetS: number;
  walkToPickupM: number;
  detourM: number;
  detourS: number;
  dropoff: LngLat;
  dropoffOffsetS: number;
  walkFromDropoffM: number;
  sharedM: number;
  /** Minutes between the pickup time and when the rider wanted to leave. */
  timeGapMin: number;
  /** Lower is better: walking, extra driving and waiting, in rough minutes. */
  cost: number;
}

/** Re-routes the driver through the rider's door: home → via → destination. */
export type DoorRouter = (via: LngLat) => Promise<DrivingRoute | null>;

// ─── Geometry ─────────────────────────────────────────────────────────────────

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * A route from its geometry and, when Mapbox returns them, per-segment
 * distances and durations. Without durations, time is spread by distance.
 */
export function buildRoute(
  coords: LngLat[],
  opts: { segDistancesM?: number[]; segDurationsS?: number[]; durationS?: number; legs?: DrivingRoute['legs'] } = {},
): DrivingRoute {
  const n = coords.length;
  const cumM = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    cumM[i] = cumM[i - 1] + (opts.segDistancesM?.[i - 1] ?? haversineM(coords[i - 1], coords[i]));
  }
  const distanceM = cumM[n - 1] ?? 0;
  const cumS = new Array<number>(n).fill(0);
  if (opts.segDurationsS && opts.segDurationsS.length >= n - 1) {
    for (let i = 1; i < n; i++) cumS[i] = cumS[i - 1] + opts.segDurationsS[i - 1];
  } else {
    const total = opts.durationS ?? distanceM / 11; // ~40 km/h
    for (let i = 1; i < n; i++) cumS[i] = distanceM > 0 ? (cumM[i] / distanceM) * total : 0;
  }
  const durationS = cumS[n - 1] ?? 0;
  return { coords, cumM, cumS, distanceM, durationS, legs: opts.legs ?? [{ distanceM, durationS }] };
}

export interface RoutePoint {
  point: LngLat;
  /** Straight-line metres from the query point to the route. */
  distM: number;
  /** Metres / seconds along the route to that point. */
  alongM: number;
  alongS: number;
}

/** The point on the route nearest p, and how far along the route it is. */
export function nearestOnRoute(route: DrivingRoute, p: LngLat): RoutePoint | null {
  const { coords, cumM, cumS } = route;
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    return { point: coords[0], distM: haversineM(p, coords[0]), alongM: 0, alongS: 0 };
  }
  // Project in a local equirectangular frame around p (metres), accurate at
  // commute scale.
  const kx = Math.cos(rad(p[1])) * (Math.PI / 180) * EARTH_M;
  const ky = (Math.PI / 180) * EARTH_M;
  let best: RoutePoint | null = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
    const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const point: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const distM = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || distM < best.distM) {
      best = {
        point,
        distM,
        alongM: cumM[i] + t * (cumM[i + 1] - cumM[i]),
        alongS: cumS[i] + t * (cumS[i + 1] - cumS[i]),
      };
    }
  }
  return best;
}

/** Straight-line metres from p to the nearest point of the polyline (pre-filter). */
export function distanceToRouteM(route: DrivingRoute, p: LngLat): number {
  return nearestOnRoute(route, p)?.distM ?? Infinity;
}

// ─── Time ─────────────────────────────────────────────────────────────────────

/** "HH:MM" / "HH:MM:SS" → minutes since midnight, or null. */
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since midnight → "HH:MM" (wraps past midnight). */
export function minutesToHHMM(total: number): string {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ─── Planning ─────────────────────────────────────────────────────────────────

const WALK_M_PER_MIN = 80;

/**
 * Plans the rider into the driver's trip, or returns null when they don't fit.
 * `doorRouter` is only called when walking to the route is too far but the
 * rider is close enough for a short detour.
 */
export async function planRide(
  route: DrivingRoute,
  rider: { origin: LngLat; destination: LngLat; departMin: number | null; doorAllowed?: boolean },
  driverDepartMin: number | null,
  doorRouter?: DoorRouter,
  limits: RideLimits = DEFAULT_LIMITS,
): Promise<RidePlan | null> {
  if (route.coords.length < 2 || driverDepartMin == null || rider.departMin == null) return null;

  const drop = nearestOnRoute(route, rider.destination);
  const near = nearestOnRoute(route, rider.origin);
  if (!drop || !near || drop.distM > limits.maxDropoffWalkM) return null;
  // The rider has to ride a real stretch of the route, forwards.
  if (drop.alongM - near.alongM < limits.minSharedM) return null;

  let plan: Omit<RidePlan, 'timeGapMin' | 'cost'> | null = null;

  if (near.distM <= limits.maxWalkToRouteM) {
    plan = {
      pickupKind: 'route',
      pickup: near.point,
      pickupOffsetS: near.alongS,
      walkToPickupM: near.distM,
      detourM: 0,
      detourS: 0,
      dropoff: drop.point,
      dropoffOffsetS: drop.alongS,
      walkFromDropoffM: drop.distM,
      sharedM: drop.alongM - near.alongM,
    };
  } else if (rider.doorAllowed !== false && doorRouter && near.distM <= limits.doorPrefilterM) {
    const via = await doorRouter(rider.origin);
    if (via && via.legs.length >= 2) {
      const detourM = Math.max(0, via.distanceM - route.distanceM);
      const detourS = Math.max(0, via.durationS - route.durationS);
      if (detourM <= limits.maxDoorDetourM) {
        plan = {
          pickupKind: 'door',
          pickup: rider.origin,
          pickupOffsetS: via.legs[0].durationS,
          walkToPickupM: 0,
          detourM,
          detourS,
          dropoff: drop.point,
          // The detour happens before the drop-off, so it arrives that much later.
          dropoffOffsetS: drop.alongS + detourS,
          walkFromDropoffM: drop.distM,
          sharedM: drop.alongM - near.alongM,
        };
      }
    }
  }
  if (!plan) return null;

  const pickupMin = driverDepartMin + plan.pickupOffsetS / 60;
  const timeGapMin = Math.abs(pickupMin - rider.departMin);
  if (timeGapMin > limits.maxTimeGapMin) return null;

  const cost =
    plan.walkToPickupM / WALK_M_PER_MIN +
    (plan.detourS / 60) * 1.5 +
    timeGapMin * 0.5 +
    (plan.walkFromDropoffM / WALK_M_PER_MIN) * 0.5;

  return { ...plan, timeGapMin, cost };
}

// ─── Mapbox ───────────────────────────────────────────────────────────────────

/** Driving route through the given waypoints, with exact per-segment timing. */
export async function fetchDrivingRoute(
  waypoints: LngLat[],
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DrivingRoute | null> {
  if (!token || waypoints.length < 2) return null;
  const path = waypoints.map((p) => `${p[0]},${p[1]}`).join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${path}` +
    `?geometries=geojson&overview=full&annotations=distance,duration&access_token=${token}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json = await res.json();
    const r = json.routes?.[0];
    const coords = r?.geometry?.coordinates as LngLat[] | undefined;
    if (!coords || coords.length < 2) return null;
    // deno-lint-ignore no-explicit-any
    const legs = (r.legs ?? []) as any[];
    const segDistancesM = legs.flatMap((l) => l.annotation?.distance ?? []);
    const segDurationsS = legs.flatMap((l) => l.annotation?.duration ?? []);
    return buildRoute(coords, {
      segDistancesM: segDistancesM.length === coords.length - 1 ? segDistancesM : undefined,
      segDurationsS: segDurationsS.length === coords.length - 1 ? segDurationsS : undefined,
      durationS: r.duration,
      legs: legs.map((l) => ({ distanceM: l.distance ?? 0, durationS: l.duration ?? 0 })),
    });
  } catch {
    return null;
  }
}
