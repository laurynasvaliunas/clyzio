/**
 * 3D map look (2026-10 redesign): Mapbox Standard — real 3D buildings,
 * landmarks and time-of-day lighting — with a tilted camera.
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

/** Camera tilt for the 3D look, and a slight rotation so buildings read in depth. */
export const MAP_PITCH = 50;
export const MAP_HEADING = -15;

export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';

/** `StyleImport` config for the Standard basemap. */
export function standardConfig(lightPreset: LightPreset): Record<string, string> {
  return {
    lightPreset,
    show3dObjects: 'true',
    showPointOfInterestLabels: 'true',
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
