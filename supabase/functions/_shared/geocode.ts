// Mapbox reverse geocoding shared by the matcher, request-carpool and
// respond-to-match (pickup / ride addresses).

export function mapboxToken(): string {
  return Deno.env.get('MAPBOX_TOKEN') ?? Deno.env.get('EXPO_PUBLIC_MAPBOX_TOKEN') ?? '';
}

/** Address for a point, or "lat, lon" when Mapbox has nothing / is unreachable. */
export async function reverseGeocode(lon: number, lat: number, token: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&limit=1`,
    );
    const json = await res.json();
    return json.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
}
