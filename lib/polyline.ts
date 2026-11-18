/**
 * Google's encoded polyline format (precision 5), as returned by Google
 * Directions for a public-transport option.
 */

/** [longitude, latitude] pairs, the order Mapbox and GeoJSON use. */
export type LngLat = [number, number];

/** Decodes an encoded polyline. Returns [] for anything that isn't one. */
export function decodePolyline(encoded: string | null | undefined): LngLat[] {
  if (typeof encoded !== "string" || encoded.length === 0) return [];
  const coords: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  // One signed number: 5-bit chunks, lowest first, until a chunk < 0x20.
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return [];
    lat += dLat;
    lng += dLng;
    const point: LngLat = [lng / 1e5, lat / 1e5];
    if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return [];
    coords.push(point);
  }
  return coords;
}
