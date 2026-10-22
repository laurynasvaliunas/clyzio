import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';
import { Scene3D, useScene } from './Scene3D';
import { C3, leafShape, seeded } from './kit';

const CONFETTI = 70;
const CONFETTI_COLORS = [C3.teal, C3.mint, C3.sun, C3.sunLight, C3.white, C3.tealLight];

/** Bevelled gold coin with an embossed teal leaf. */
function Medal() {
  const { still } = useScene();
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const emblem = useMemo(
    () =>
      new THREE.ExtrudeGeometry(leafShape(0.95), {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.02,
        bevelSegments: 2,
        curveSegments: 18,
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const now = clock.getElapsedTime();
    if (born.current == null) born.current = now;
    const t = now - born.current;
    if (still) {
      ref.current.scale.setScalar(1);
      ref.current.rotation.set(0, 0.35, 0);
      return;
    }
    // Spin-in over ~0.9 s with a soft overshoot, then a gentle sway.
    const k = Math.min(1, t / 0.9);
    const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    ref.current.scale.setScalar(Math.max(0.001, ease));
    ref.current.rotation.y = (1 - k) * Math.PI * 3 + Math.sin(t * 1.3) * 0.35 * k;
    ref.current.position.y = Math.sin(t * 1.8) * 0.05 * k;
  });

  return (
    <group ref={ref}>
      {/* Coin body faces the camera (cylinder axis → z). */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1, 1, 0.2, 56]} />
        <meshPhongMaterial color={C3.sun} shininess={71} specular="#FFE7B0" />
      </mesh>
      {/* Raised rim */}
      <mesh>
        <torusGeometry args={[0.95, 0.07, 12, 56]} />
        <meshPhongMaterial color={C3.sunLight} shininess={74} specular="#FFE7B0" />
      </mesh>
      {/* Inner disc */}
      <mesh position={[0, 0, 0.101]}>
        <circleGeometry args={[0.82, 56]} />
        <meshPhongMaterial color="#F7C35A" shininess={64} specular="#FFE7B0" />
      </mesh>
      <mesh geometry={emblem} position={[0, 0, 0.1]}>
        <meshPhongMaterial color={C3.teal} shininess={60} specular="#2A3A3E" />
      </mesh>
      <mesh geometry={emblem} position={[0, 0, -0.16]} rotation={[0, Math.PI, 0]}>
        <meshPhongMaterial color={C3.teal} shininess={60} specular="#2A3A3E" />
      </mesh>
    </group>
  );
}

/** One-shot 3D confetti burst (instanced, so it's a single draw call). */
function Confetti() {
  const { still } = useScene();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const born = useRef<number | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bits = useMemo(() => {
    const rand = seeded(99);
    return Array.from({ length: CONFETTI }, () => {
      const a = rand() * Math.PI * 2;
      const up = 2.2 + rand() * 2.4;
      const out = 1.2 + rand() * 1.8;
      return {
        v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out * 0.6),
        spin: new THREE.Vector3(rand() * 8, rand() * 8, rand() * 8),
        color: new THREE.Color(CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)]),
      };
    });
  }, []);

  // Colours before the first draw (so the shader compiles with instance
  // colours) and every piece hidden until the burst starts.
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    bits.forEach((b, i) => {
      m.setColorAt(i, b.color);
      m.setMatrixAt(i, dummy.matrix);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
  }, [bits, dummy]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m || still) return;
    const now = clock.getElapsedTime();
    if (born.current == null) born.current = now;
    const t = Math.min(3.2, now - born.current);
    bits.forEach((b, i) => {
      dummy.position.set(b.v.x * t, b.v.y * t - 2.6 * t * t, b.v.z * t);
      dummy.rotation.set(b.spin.x * t, b.spin.y * t, b.spin.z * t);
      const fade = t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.8) : 1;
      dummy.scale.setScalar(fade);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  if (still) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI]}>
      <planeGeometry args={[0.09, 0.05]} />
      <meshPhongMaterial side={THREE.DoubleSide} shininess={51} specular="#2A3A3E" />
    </instancedMesh>
  );
}

export interface MedalBurstProps {
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Trip-completed / setup-done celebration: a spinning medal + confetti. */
export function MedalBurst({ style, accessibilityLabel }: MedalBurstProps) {
  return (
    <Scene3D style={style} camera={{ position: [0, 0.2, 4.6], fov: 38 }} lights="warm" accessibilityLabel={accessibilityLabel}>
      <Medal />
      <Confetti />
    </Scene3D>
  );
}
