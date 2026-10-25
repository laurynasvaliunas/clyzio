/**
 * Map look (2026-10 friendly redesign, Waze-like): Mapbox Standard laid flat —
 * top-down, no 3D buildings, few labels, bright daylight colours — with a
 * thick bright route.
 *
 * Each map falls back to the flat Street/Dark style if Standard fails to load
 * (MapView `onMapLoadingError`), so the map never goes blank.
 */
/** Matches rnmapbox's Camera `bounds` stop (not exported by the package). */
export interface CameraBoundsWithPadding {
  ne: [number, number];
  sw: [number, number];
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

export const MAP_STYLE_3D = 'mapbox://styles/mapbox/standard';

/** Flat, north-up camera. */
export const MAP_PITCH = 0;
export const MAP_HEADING = 0;

export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';

/** `StyleImport` config for the Standard basemap. */
export function standardConfig(lightPreset: LightPreset): Record<string, string> {
  return {
    lightPreset,
    theme: 'default',
    show3dObjects: 'false',
    showPointOfInterestLabels: 'false',
    showTransitLabels: 'false',
    showPedestrianRoads: 'false',
  };
}

/** fitBounds-style padding ([top, right, bottom, left] or one number) as camera bounds. */
export function boundsWithPadding(
  ne: [number, number],
  sw: [number, number],
  padding: number | [number, number, number, number],
): CameraBoundsWithPadding {
  const [top, right, bottom, left] = typeof padding === 'number' ? [padding, padding, padding, padding] : padding;
  return { ne, sw, paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left };
}

/**
 * Route line, Waze-style: a white casing under a thick bright line. Pair the
 * two LineLayers in this order (casing first) with `slot="middle"`.
 */
export const ROUTE_CASING_STYLE = {
  lineColor: '#FFFFFF',
  lineWidth: 12,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};
export const ROUTE_LINE_STYLE = {
  lineColor: '#00B9CC',
  lineWidth: 7,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
  lineEmissiveStrength: 1,
};
