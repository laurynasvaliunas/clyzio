// deno test supabase/functions/transit-routes/transit.test.ts
import { mapVehicleType, normalizeRoute, TRANSIT_CO2_FACTORS, transitCacheKey } from './transit.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// A Google Directions transit route: walk, `lines` in order, walk.
function route(lines: { name: string; type: string; metres: number }[], departure = 1793080140) {
  const transit = lines.map((l) => ({
    travel_mode: 'TRANSIT',
    distance: { value: l.metres },
    transit_details: { line: { short_name: l.name, vehicle: { type: l.type } } },
  }));
  const metres = lines.reduce((s, l) => s + l.metres, 0);
  return {
    legs: [{
      distance: { value: metres },
      duration: { value: 1500 },
      departure_time: { text: '8:09 AM', value: departure },
      arrival_time: { text: '8:34 AM', value: departure + 1500 },
      steps: [{ travel_mode: 'WALKING' }, ...transit, { travel_mode: 'WALKING' }],
    }],
  };
}

Deno.test('Google vehicle types map to the factor keys', () => {
  assert(mapVehicleType('TROLLEYBUS') === 'trolleybus', 'trolleybus');
  assert(mapVehicleType('LIGHT_RAIL') === 'tram', 'light rail');
  assert(mapVehicleType('METRO_RAIL') === 'subway', 'metro');
  assert(mapVehicleType('COMMUTER_TRAIN') === 'rail', 'train');
  assert(mapVehicleType('INTERCITY_BUS') === 'bus', 'bus');
  assert(mapVehicleType(undefined) === 'bus', 'unknown → bus');
});

Deno.test('a one-vehicle route uses that vehicle\'s factor', () => {
  const o = normalizeRoute(route([{ name: '9', type: 'TROLLEYBUS', metres: 6000 }]));
  assert(o, 'option');
  assert(o.submode === 'trolleybus' && o.co2_per_km === TRANSIT_CO2_FACTORS.trolleybus, `factor ${o.submode}`);
  assert(o.co2_kg === Math.round(6 * TRANSIT_CO2_FACTORS.trolleybus * 1000) / 1000, `co2 ${o.co2_kg}`);
  assert(o.summary === '9' && o.duration_min === 25, 'summary and duration');
});

Deno.test('a mixed route is credited with the vehicle covering most of the distance', () => {
  const o = normalizeRoute(route([
    { name: '3G', type: 'BUS', metres: 2000 },
    { name: 'T1', type: 'TRAM', metres: 8000 },
  ]));
  assert(o, 'option');
  assert(o.submode === 'tram' && o.co2_per_km === 0.029, `submode ${o.submode}`);
  assert(o.summary === '3G → T1', o.summary);
  assert(!('mixed' in TRANSIT_CO2_FACTORS), 'no uncited "mixed" factor');
});

Deno.test('departure and arrival come back as timestamps for the phone to format', () => {
  const o = normalizeRoute(route([{ name: '9', type: 'TROLLEYBUS', metres: 6000 }], 1793080140));
  assert(o, 'option');
  assert(o.departure_ts === 1793080140 && o.arrival_ts === 1793080140 + 1500, `ts ${o.departure_ts}`);
  assert(o.departure_text === '8:09 AM', 'text kept for older app builds');
});

Deno.test('a route with no public-transport step is dropped', () => {
  assert(normalizeRoute({ legs: [{ steps: [{ travel_mode: 'WALKING' }] }] }) === null, 'walk only');
  assert(normalizeRoute({}) === null, 'no legs');
});

Deno.test('the cache key separates the same hour on different dates', () => {
  const a = { lat: 54.6872, lng: 25.2797 };
  const b = { lat: 54.7, lng: 25.3 };
  const friday = transitCacheKey(a, b, new Date('2026-10-30T16:00:00Z'));
  const saturday = transitCacheKey(a, b, new Date('2026-10-31T16:00:00Z'));
  const fridayLater = transitCacheKey(a, b, new Date('2026-10-30T16:45:00Z'));
  assert(friday !== saturday, 'Friday and Saturday share a key');
  assert(friday === fridayLater, 'the same hour on the same day should share a key');
  assert(friday === transitCacheKey({ lat: 54.6912, lng: 25.2801 }, b, new Date('2026-10-30T16:00:00Z')), 'nearby starts share a key');
});
