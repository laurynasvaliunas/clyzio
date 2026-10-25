// deno test supabase/functions/_shared/route.test.ts
import {
  buildRoute,
  DEFAULT_LIMITS,
  type DrivingRoute,
  fetchDrivingRoute,
  haversineM,
  type LngLat,
  minutesToHHMM,
  nearestOnRoute,
  parseTimeToMinutes,
  planRide,
} from './route.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// A straight 12.9 km drive east along latitude 54.68 at 10 m/s, a point every 0.01°.
const LAT = 54.68;
function straightRoute(fromLng = 25.2, toLng = 25.4): DrivingRoute {
  const coords: LngLat[] = [];
  for (let x = fromLng; x <= toLng + 1e-9; x += 0.01) coords.push([Number(x.toFixed(4)), LAT]);
  const seg = coords.slice(1).map((c, i) => haversineM(coords[i], c));
  return buildRoute(coords, { segDistancesM: seg, segDurationsS: seg.map((m) => m / 10) });
}
const route = straightRoute();
const M_PER_DEG_LAT = 111_195;

/** A door router whose detour adds `extraM` metres (and extraM / 10 seconds). */
const doorRouter = (extraM: number) => (via: LngLat) => {
  const toVia = nearestOnRoute(route, via)!;
  const leg1M = toVia.alongM + 0.5 * extraM;
  const leg2M = route.distanceM - toVia.alongM + 0.5 * extraM;
  return Promise.resolve({
    ...route,
    distanceM: leg1M + leg2M,
    durationS: (leg1M + leg2M) / 10,
    legs: [{ distanceM: leg1M, durationS: leg1M / 10 }, { distanceM: leg2M, durationS: leg2M / 10 }],
  });
};

Deno.test('nearestOnRoute projects onto the route and measures along it', () => {
  const p = nearestOnRoute(route, [25.25, LAT + 0.005])!;
  assert(near(p.distM, 0.005 * M_PER_DEG_LAT, 5), `distance to route ${p.distM}`);
  const along = haversineM([25.2, LAT], [25.25, LAT]);
  assert(near(p.alongM, along, 5), `along ${p.alongM} vs ${along}`);
  assert(near(p.alongS, along / 10, 1), `seconds along ${p.alongS}`);
});

Deno.test('a rider a short walk from the route is picked up on it, with the exact time', async () => {
  const plan = await planRide(
    route,
    { origin: [25.25, LAT + 0.004], destination: [25.38, LAT + 0.002], departMin: 485 },
    480,
  );
  assert(plan, 'expected a plan');
  assert(plan.pickupKind === 'route', plan.pickupKind);
  assert(near(plan.walkToPickupM, 0.004 * M_PER_DEG_LAT, 5), `walk ${plan.walkToPickupM}`);
  assert(plan.detourM === 0, 'no detour for an on-route pickup');
  assert(near(plan.pickupOffsetS, haversineM([25.2, LAT], [25.25, LAT]) / 10, 1), `offset ${plan.pickupOffsetS}`);
  assert(plan.timeGapMin < 1, `gap ${plan.timeGapMin}`);
  assert(near(plan.sharedM, haversineM([25.25, LAT], [25.38, LAT]), 5), `shared ${plan.sharedM}`);
  assert(plan.dropoffOffsetS > plan.pickupOffsetS, 'drop-off comes after the pickup');
});

Deno.test('a rider beyond walking distance gets a door pickup when the detour is ≤ 2 km', async () => {
  const rider = { origin: [25.25, LAT + 0.01] as LngLat, destination: [25.38, LAT] as LngLat, departMin: 486 };
  const plan = await planRide(route, rider, 480, doorRouter(1500));
  assert(plan, 'expected a door plan');
  assert(plan.pickupKind === 'door', plan.pickupKind);
  assert(near(plan.detourM, 1500, 1), `detour ${plan.detourM}`);
  assert(plan.walkToPickupM === 0, 'no walk at the door');
  assert(plan.pickup[0] === 25.25 && plan.pickup[1] === LAT + 0.01, 'pickup is the rider\'s door');

  assert((await planRide(route, rider, 480, doorRouter(2500))) === null, 'a 2.5 km detour is too much');
  assert((await planRide(route, { ...rider, doorAllowed: false }, 480, doorRouter(500))) === null,
    'no door pickup for a rider who hides their address');
  assert((await planRide(route, rider, 480)) === null, 'no door pickup without a router');
});

Deno.test('riders far off the route are not even routed to', async () => {
  let called = false;
  const plan = await planRide(
    route,
    { origin: [25.25, LAT + 0.03], destination: [25.38, LAT], departMin: 485 },
    480,
    (v) => { called = true; return doorRouter(100)(v); },
  );
  assert(plan === null && !called, 'a 3 km-away rider must be rejected before any Mapbox call');
});

Deno.test('wrong direction, far destination and the time gate are rejected', async () => {
  assert((await planRide(route, { origin: [25.35, LAT], destination: [25.22, LAT], departMin: 485 }, 480)) === null,
    'drop-off before the pickup');
  assert((await planRide(route, { origin: [25.25, LAT], destination: [25.38, LAT + 0.02], departMin: 485 }, 480)) === null,
    'destination 2 km from the route');
  assert((await planRide(route, { origin: [25.25, LAT], destination: [25.255, LAT], departMin: 485 }, 480)) === null,
    'less than 1 km together');
  assert((await planRide(route, { origin: [25.25, LAT], destination: [25.38, LAT], departMin: 510 }, 480)) === null,
    'leaving 25 min after the driver passes');
  assert((await planRide(route, { origin: [25.25, LAT], destination: [25.38, LAT], departMin: 499 }, 480)) !== null,
    'leaving 14 min after the driver passes is within ±15');
  assert((await planRide(route, { origin: [25.25, LAT], destination: [25.38, LAT], departMin: null }, 480)) === null,
    'no leaving time, no match');
});

Deno.test('times parse and format as local HH:MM', () => {
  assert(parseTimeToMinutes('08:05') === 485 && parseTimeToMinutes('08:05:00') === 485, 'parse');
  assert(parseTimeToMinutes('25:00') === null && parseTimeToMinutes(null) === null, 'invalid');
  assert(minutesToHHMM(485.4) === '08:05' && minutesToHHMM(1445) === '00:05', 'format');
  assert(DEFAULT_LIMITS.maxWalkToRouteM === 800 && DEFAULT_LIMITS.maxDoorDetourM === 2000, 'limits');
});

Deno.test('fetchDrivingRoute uses Mapbox per-segment timing and legs', async () => {
  const fake = ((_url: string) =>
    Promise.resolve(new Response(JSON.stringify({
      routes: [{
        distance: 2000,
        duration: 300,
        geometry: { coordinates: [[25.2, LAT], [25.21, LAT], [25.22, LAT]] },
        legs: [
          { distance: 600, duration: 200, annotation: { distance: [600], duration: [200] } },
          { distance: 1400, duration: 100, annotation: { distance: [1400], duration: [100] } },
        ],
      }],
    })))) as unknown as typeof fetch;
  const r = await fetchDrivingRoute([[25.2, LAT], [25.21, LAT], [25.22, LAT]], 'tok', fake);
  assert(r, 'route');
  assert(r.cumS[1] === 200 && r.cumS[2] === 300 && r.cumM[2] === 2000, `cum ${r.cumS} ${r.cumM}`);
  assert(r.legs.length === 2 && r.legs[0].durationS === 200, 'legs');
  assert((await fetchDrivingRoute([[25.2, LAT]], 'tok', fake)) === null, 'needs two waypoints');
});
