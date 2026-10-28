/**
 * transit-routes — public-transit options via Google Directions (mode=transit).
 *
 * Powers the planner's Branch B (Bus / Tram / Metro / Trolleybus / Rail with
 * departure times + per-option CO₂). The Google key stays server-side. Results
 * are cached 6h in `transit_route_cache`, keyed by commute corridor + departure
 * date and hour, so colleagues on the same route share a lookup and we stay
 * under the free tier.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, TransitRoutesSchema } from '../_shared/validate.ts';
import { normalizeRoute, transitCacheKey, type TransitOption } from './transit.ts';

const CACHE_TTL_HOURS = 6;

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
    const cacheKey = transitCacheKey(
      { lat: origin_lat, lng: origin_long },
      { lat: dest_lat, lng: dest_long },
      depDate,
    );

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
