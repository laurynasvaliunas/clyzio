/**
 * Runtime shims React Three Fiber needs on React Native. Imported by Scene3D
 * BEFORE '@react-three/fiber/native' (import order = evaluation order).
 *
 * R3F's bundled react-reconciler (dev build) records React performance tracks
 * with performance.mark/measure/clearMarks/clearMeasures; React Native's
 * `performance` object lacks some of them, which threw "performance.
 * clearMeasures is not a function" on the first 3D render.
 */
type PerfLike = Record<string, unknown>;

const perf = (globalThis as unknown as { performance?: PerfLike }).performance;
if (perf) {
  for (const fn of ['mark', 'measure', 'clearMarks', 'clearMeasures']) {
    if (typeof perf[fn] !== 'function') perf[fn] = () => undefined;
  }
}

export {};
