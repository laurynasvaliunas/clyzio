/**
 * Address suggestions for every address field (planner, profile, setup, AI
 * planner).
 *
 * The fields used to ask Mapbox for the best matches anywhere in the world, so
 * "Ozo 25" offered Japan and Belgium next to Vilnius, and "Sav" led with
 * Savannah, Georgia. Now a search is tied to where the person commutes:
 *   • near a known point (the other end of the trip, home, or the phone's
 *     location) only matches within ~400 km are asked for, nearest first;
 *   • if nothing there matches, the search widens, so a far address can still
 *     be found by typing it out;
 *   • with no known point, Mapbox biases by network location and matches
 *     outside the country most of the results are in are dropped;
 *   • near-misses of a different street ("Oro Parko g. 25" for "Ozo 25") and
 *     repeats are removed.
 */

import { MAPBOX_TOKEN } from "./config";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AddressSuggestion {
  id: string;
  /** The full address, as saved with a trip or profile. */
  place_name: string;
  /** First line: street and number, or the place's name. */
  title: string;
  /** Second line: town, region, country. Empty for a bare name. */
  subtitle: string;
  /** [longitude, latitude] */
  coordinates: [number, number];
}

const TYPES = "address,place,locality,neighborhood";
/** Rows shown under a field. */
const SHOWN = 5;
/** Asked for, so there are still SHOWN after near-misses and repeats go. */
const REQUESTED = 8;
/** How far from the known point a match still counts as local. */
const LOCAL_KM = 400;
/** A match this much less relevant than the best one is a different street. */
const RELEVANCE_SLACK = 0.05;
/** Fewer characters than this are not searched. */
export const MIN_QUERY_LENGTH = 3;

function isPoint(p: LatLng | null | undefined): p is LatLng {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

// ─── Where this person commutes ───────────────────────────────────────────────

let bias: LatLng | null = null;

/**
 * Remembers where searches should look first: the saved home (or work), or
 * the phone's location. `onlyIfUnset` keeps a point already known, so a
 * location fix doesn't replace the saved home. Null forgets it (sign-out).
 */
export function setAddressSearchBias(
  point: LatLng | null | undefined,
  options: { onlyIfUnset?: boolean } = {},
): void {
  if (point == null) {
    if (!options.onlyIfUnset) bias = null;
    return;
  }
  if (!isPoint(point)) return;
  if (options.onlyIfUnset && bias) return;
  bias = { lat: point.lat, lng: point.lng };
}

export function getAddressSearchBias(): LatLng | null {
  return bias;
}

// ─── Request ──────────────────────────────────────────────────────────────────

/**
 * The Mapbox request for `text`.
 *   "local": matches inside a ~400 km box around `near`, nearest first.
 *   "wide":  anywhere, nearest to `near` first (or to the network location
 *            when no point is known).
 * The point is rounded to ~1 km: enough to rank by, not a home address.
 */
export function addressSearchUrl(
  text: string,
  near: LatLng | null,
  scope: "local" | "wide",
  token: string = MAPBOX_TOKEN,
): string {
  let url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json` +
    `?access_token=${token}&limit=${REQUESTED}&types=${TYPES}`;
  if (!near) return `${url}&proximity=ip`;

  const lat = Math.round(near.lat * 100) / 100;
  const lng = Math.round(near.lng * 100) / 100;
  url += `&proximity=${lng},${lat}`;
  if (scope === "local") {
    const dLat = LOCAL_KM / 111;
    const dLng = LOCAL_KM / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
    const box = [
      Math.max(lng - dLng, -180),
      Math.max(lat - dLat, -85),
      Math.min(lng + dLng, 180),
      Math.min(lat + dLat, 85),
    ].map((n) => n.toFixed(2));
    url += `&bbox=${box.join(",")}`;
  }
  return url;
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface Candidate {
  suggestion: AddressSuggestion;
  relevance: number;
  point: LatLng;
  country: string | null;
}

function toCandidate(feature: any): Candidate | null {
  const placeName = typeof feature?.place_name === "string" ? feature.place_name.trim() : "";
  const coords = feature?.geometry?.coordinates ?? feature?.center;
  if (!placeName || !Array.isArray(coords)) return null;
  const point = { lng: Number(coords[0]), lat: Number(coords[1]) };
  if (!isPoint(point)) return null;

  const comma = placeName.indexOf(",");
  const context: any[] = Array.isArray(feature.context) ? feature.context : [];
  const country = context.find((c) => typeof c?.id === "string" && c.id.startsWith("country."));
  return {
    suggestion: {
      id: String(feature.id ?? placeName),
      place_name: placeName,
      title: comma === -1 ? placeName : placeName.slice(0, comma).trim(),
      subtitle: comma === -1 ? "" : placeName.slice(comma + 1).trim(),
      coordinates: [point.lng, point.lat],
    },
    relevance: typeof feature.relevance === "number" ? feature.relevance : 1,
    point,
    country: typeof country?.short_code === "string" ? country.short_code.toLowerCase() : null,
  };
}

/**
 * Turns Mapbox's matches into the rows to show, in Mapbox's order (already
 * nearest first when a point was sent).
 */
export function rankAddressFeatures(features: unknown, near: LatLng | null): AddressSuggestion[] {
  let list = (Array.isArray(features) ? features : [])
    .map(toCandidate)
    .filter((c): c is Candidate => c !== null);
  if (list.length === 0) return [];

  // Near-misses of another street score lower than the real matches.
  const best = Math.max(...list.map((c) => c.relevance));
  list = list.filter((c) => c.relevance >= best - RELEVANCE_SLACK);

  if (near) {
    // Something nearby matches: a namesake on another continent isn't offered.
    const local = list.filter((c) => distanceKm(near, c.point) <= LOCAL_KM);
    if (local.length > 0) list = local;
  } else {
    // No known point: keep the country most matches are in, if there is one.
    const counts = new Map<string, number>();
    for (const c of list) if (c.country) counts.set(c.country, (counts.get(c.country) ?? 0) + 1);
    const [topCountry, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (topCountry && topCount >= 2 && topCount * 2 >= list.length) {
      list = list.filter((c) => c.country === topCountry);
    }
  }

  const seen = new Set<string>();
  const rows: AddressSuggestion[] = [];
  for (const c of list) {
    const key = c.suggestion.place_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(c.suggestion);
    if (rows.length === SHOWN) break;
  }
  return rows;
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function fetchFeatures(url: string): Promise<unknown[]> {
  const res = await fetch(url);
  if (res.ok === false) return [];
  const json = await res.json();
  return Array.isArray(json?.features) ? json.features : [];
}

/**
 * Suggestions for what the person has typed so far. `near` is a point this
 * field should search around (the trip's other end); without it the remembered
 * home or location is used. Never throws: no suggestions on any failure.
 */
export async function searchAddresses(
  text: string,
  options: { near?: LatLng | null } = {},
): Promise<AddressSuggestion[]> {
  const query = text.trim();
  if (query.length < MIN_QUERY_LENGTH) return [];
  const near = isPoint(options.near) ? options.near : bias;

  try {
    if (near) {
      const local = rankAddressFeatures(await fetchFeatures(addressSearchUrl(query, near, "local")), near);
      if (local.length > 0) return local;
    }
    return rankAddressFeatures(await fetchFeatures(addressSearchUrl(query, near, "wide")), near);
  } catch {
    return [];
  }
}
