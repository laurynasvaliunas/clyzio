/**
 * Clyzio's 3D scenes. Import from here (not the individual files) — Jest
 * replaces this module with lightweight stand-ins, since there is no GL in
 * the test environment.
 */
import './polyfills'; // before anything loads React Three Fiber
export { Scene3D } from './Scene3D';
export type { Scene3DProps } from './Scene3D';
export { EcoGlobe } from './EcoGlobe';
export type { EcoGlobeProps } from './EcoGlobe';
export { CommuteCity } from './CommuteCity';
export type { CommuteCityProps } from './CommuteCity';
export { MedalBurst } from './MedalBurst';
export type { MedalBurstProps } from './MedalBurst';
export { LevelGem } from './LevelGem';
export type { LevelGemProps } from './LevelGem';
export { DeptSkyline } from './DeptSkyline';
export type { DeptSkylineProps } from './DeptSkyline';
