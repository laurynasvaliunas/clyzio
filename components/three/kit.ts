/**
 * Shared building blocks for Clyzio's procedural 3D scenes.
 *
 * Everything is generated in code (no model or texture files), so scenes cost
 * no downloads and carry no asset licences.
 */
import * as THREE from 'three';

/** Brand colours as three.js expects them (sRGB hex; three converts). */
export const C3 = {
  teal: '#00565A',
  tealLight: '#0E8C93',
  tealDeep: '#003D40',
  mint: '#34D399',
  leaf: '#059669',
  leafLight: '#4ADE80',
  sage: '#9CCFA6',
  sun: '#F59E0B',
  sunLight: '#FCD34D',
  sand: '#D9C9A3',
  snow: '#F4F7F7',
  white: '#FFFFFF',
  paper: '#EEF3F4',
  slate: '#2B3A3F',
  ink: '#0B1A1F',
  clay: '#DC2626',
  sky: '#BFE6EA',
} as const;

/** Deterministic PRNG (mulberry32) — scenes look the same on every render. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth pseudo-noise on the unit sphere (sum of rotated sine waves). Cheap,
 * dependency-free and continuous, so neighbouring vertices agree and
 * low-poly surfaces have no cracks.
 */
export function sphereNoise(x: number, y: number, z: number, seed = 1): number {
  const s = seed * 1.618;
  let n = 0;
  n += Math.sin(x * 2.1 + s) * Math.cos(y * 1.7 - s) * 0.55;
  n += Math.sin(y * 3.3 + z * 1.9 + s * 2) * 0.3;
  n += Math.cos(z * 2.7 - x * 1.3 + s * 3) * 0.35;
  n += Math.sin((x + y + z) * 5.1 + s) * 0.12;
  return n; // roughly −1.3 … 1.3
}

/** Linear blend of two hex colours. */
export function mix(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));
}

/** A leaf outline, used for the medal emblem and the floating leaves. */
export function leafShape(scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5 * scale);
  s.bezierCurveTo(0.42 * scale, -0.25 * scale, 0.42 * scale, 0.3 * scale, 0, 0.55 * scale);
  s.bezierCurveTo(-0.42 * scale, 0.3 * scale, -0.42 * scale, -0.25 * scale, 0, -0.5 * scale);
  return s;
}

/** Critically-damped approach of `current` toward `target` (frame-rate safe). */
export function damp(current: number, target: number, lambda: number, delta: number): number {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}
