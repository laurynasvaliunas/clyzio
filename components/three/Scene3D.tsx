import React, { Component, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import './polyfills'; // must precede the R3F import
import { Canvas, useThree } from '@react-three/fiber/native';
import { useIsFocused } from '@react-navigation/native';
import { useReducedMotion } from '../ui/useReducedMotion';
import { C3 } from './kit';

/** What every scene can ask: should it hold still? */
interface SceneState {
  /** Reduce Motion is on: render a composed still frame, no idle loops. */
  still: boolean;
}

const SceneContext = createContext<SceneState>({ still: false });
export const useScene = () => useContext(SceneContext);

/** Soft studio lighting shared by every scene. */
export function StudioLights({ warm = false }: { warm?: boolean }) {
  return (
    <>
      <hemisphereLight args={[C3.white, warm ? '#F6E7C8' : '#CFE7E8', 1.6]} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color={warm ? '#FFF4DE' : C3.white} />
      <directionalLight position={[-4, 2, -3]} intensity={0.9} color={C3.tealLight} />
      <ambientLight intensity={0.35} />
    </>
  );
}

/**
 * R3F's setFrameloop() only updates state — it never restarts the global
 * render loop, which stops itself once every root is "never". Scenes mount
 * paused (focus resolves a beat later) and pause again off-screen, so kick the
 * loop whenever this root becomes active again.
 */
function LoopKick({ frameloop }: { frameloop: 'always' | 'demand' | 'never' }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (frameloop !== 'never') invalidate();
  }, [frameloop, invalidate]);
  return null;
}

type PresentingContext = WebGL2RenderingContext & {
  endFrameEXP?: () => void;
  __clyzioPaced?: boolean;
};

/** Presented frames between GL-thread catch-ups. */
const FENCE_EVERY = 6;
/** A catch-up wait longer than this means the GL thread is falling behind. */
const LAG_MS = 8;
/** At most, draw every 8th frame (7.5 fps): enough to stay alive anywhere. */
const MAX_STRIDE = 8;
const FRAME_MS = 1000 / 60;

/**
 * Paces frames to what the GL thread can draw.
 *
 * expo-gl queues GL calls for its own thread and never makes JS wait, so a
 * scene that takes longer than a frame to draw (low-end Android, or the iOS
 * Simulator's software GL) builds an ever-growing backlog: the canvas falls
 * seconds behind, looks frozen, and memory climbs. Every FENCE_EVERY presented
 * frames a blocking call (getError) waits for the GL thread to catch up, which
 * bounds the backlog; while it lags, only every `stride`-th frame is drawn.
 * Scenes animate on clock time, so a lower frame rate keeps the same motion.
 *
 * Also presents once per rendered frame: R3F appends expo-gl's endFrameEXP
 * to gl.render in onCreated, which React StrictMode (dev) runs twice.
 */
function FramePacer() {
  const gl = useThree((s) => s.gl);
  const frameloop = useThree((s) => s.frameloop);
  const loopRef = useRef(frameloop);
  loopRef.current = frameloop;

  useLayoutEffect(() => {
    const ctx = gl.getContext() as PresentingContext;
    if (ctx.__clyzioPaced || !ctx.endFrameEXP) return;
    ctx.__clyzioPaced = true;

    let stride = 1;
    let tick = 0;
    // Runs inside R3F's wrapper, which presents after it: a skipped frame
    // leaves three's frame counter unchanged, so nothing is presented.
    const render = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      // On-demand frames are one-offs (Reduce Motion): never skip those.
      if (loopRef.current === 'always' && tick++ % stride !== 0) return;
      render(scene, camera);
    };

    const present = ctx.endFrameEXP.bind(ctx);
    let lastFrame = -1;
    let presented = 0;
    let since = performance.now();
    ctx.endFrameEXP = () => {
      const frame = gl.info.render.frame;
      if (frame === lastFrame) return;
      lastFrame = frame;
      present();
      if (++presented % FENCE_EVERY !== 0) return;

      const start = performance.now();
      ctx.getError(); // blocks until the GL thread has drained the queue
      const end = performance.now();
      if (end - start > LAG_MS) {
        // The GL thread was busy for most of the interval: size the stride
        // from its time per frame, with 25% headroom.
        const perFrame = (end - since) / FENCE_EVERY;
        stride = Math.min(MAX_STRIDE, Math.max(stride + 1, Math.ceil((perFrame * 1.25) / FRAME_MS)));
      } else if (end - start < LAG_MS / 4 && stride > 1) {
        stride -= 1; // probe back toward full rate
      }
      since = end;
    };
  }, [gl]);
  return null;
}

function LookAt({ target }: { target: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  const [x, y, z] = target;
  useLayoutEffect(() => {
    camera.lookAt(x, y, z);
    camera.updateProjectionMatrix();
  }, [camera, x, y, z]);
  return null;
}

/** Some Android emulators have no usable GL: show the fallback, not a crash. */
class GLBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    if (__DEV__) console.warn('[Scene3D] falling back:', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface Scene3DProps {
  /** three.js scene content (rendered inside the Canvas). */
  children: React.ReactNode;
  /** Sizing of the canvas container — give it a height. */
  style?: StyleProp<ViewStyle>;
  camera?: { position: [number, number, number]; fov?: number; lookAt?: [number, number, number] };
  /** Shown if GL is unavailable. Defaults to nothing (the screen behind shows). */
  fallback?: React.ReactNode;
  /** Use the shared studio lights (default true). */
  lights?: boolean | 'warm';
  /** Readable description; omit for purely decorative scenes. */
  accessibilityLabel?: string;
}

/**
 * The one canvas wrapper every 3D scene goes through.
 *
 * - Renders only while its screen is focused and the app is in the
 *   foreground: frameloop "never" otherwise, so off-screen scenes cost no
 *   GPU or battery.
 * - Reduce Motion: frameloop "demand" + `still` in context; scenes compose a
 *   final pose instead of looping.
 * - GL failures fall back to `fallback` (Android emulators without GL).
 */
export function Scene3D({
  children,
  style,
  camera = { position: [0, 0, 5], fov: 40 },
  fallback = null,
  lights = true,
  accessibilityLabel,
}: Scene3DProps) {
  const focused = useIsFocused();
  const still = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const frameloop = !focused || !active ? 'never' : still ? 'demand' : 'always';

  return (
    // Non-collapsable with its own stacking context: keeps the GL layer
    // composited above the screen's background layers.
    <View
      style={[styles.box, style]}
      collapsable={false}
      pointerEvents="none"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    >
      <GLBoundary fallback={fallback}>
        <Canvas
          frameloop={frameloop}
          camera={{ position: camera.position, fov: camera.fov ?? 40, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
          style={styles.fill}
        >
          <SceneContext.Provider value={{ still }}>
            <LoopKick frameloop={frameloop} />
            <FramePacer />
            <LookAt target={camera.lookAt ?? [0, 0, 0]} />
            {lights ? <StudioLights warm={lights === 'warm'} /> : null}
            {children}
          </SceneContext.Provider>
        </Canvas>
      </GLBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', zIndex: 1 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
