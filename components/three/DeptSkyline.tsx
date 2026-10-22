import React, { useMemo, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';
import { Scene3D, useScene } from './Scene3D';
import { C3, mix } from './kit';
import { ContactShadow } from './ContactShadow';

const MAX_TOWERS = 8;
const MAX_HEIGHT = 1.9;

function Skyline({ values }: { values: number[] }) {
  const { still } = useScene();
  const ref = useRef<THREE.Group>(null);
  const grow = useRef(0);
  const towers = useMemo(() => {
    const vals = values.slice(0, MAX_TOWERS);
    const max = Math.max(1e-6, ...vals);
    const n = vals.length;
    return vals.map((v, i) => {
      const t = n > 1 ? i / (n - 1) : 0.5;
      return {
        x: (i - (n - 1) / 2) * 0.46,
        h: 0.12 + (v / max) * MAX_HEIGHT,
        color: mix(C3.tealLight, C3.tealDeep, t).getStyle(),
      };
    });
  }, [values]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    grow.current = still ? 1 : Math.min(1, grow.current + delta * 1.1);
    const e = 1 - Math.pow(1 - grow.current, 3);
    ref.current.children.forEach((c, i) => {
      const tower = towers[i];
      if (!tower) return;
      c.scale.y = Math.max(0.001, e);
      c.position.y = (tower.h * e) / 2;
    });
    if (!still) ref.current.parent!.rotation.y = Math.sin(Date.now() / 4000) * 0.25 - 0.35;
  });

  return (
    <group rotation={[0, -0.35, 0]}>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[Math.max(1.4, towers.length * 0.46 + 0.4), 0.08, 1.0]} />
        <meshLambertMaterial color="#EEF5F5" />
      </mesh>
      <group ref={ref}>
        {towers.map((t, i) => (
          <mesh key={i} position={[t.x, t.h / 2, 0]}>
            <boxGeometry args={[0.32, t.h, 0.32]} />
            <meshPhongMaterial color={t.color} flatShading shininess={56} specular="#2A3A3E" />
          </mesh>
        ))}
      </group>
      <ContactShadow position={[0, -0.09, 0]} size={Math.max(2.4, towers.length * 0.6)} opacity={0.35} />
    </group>
  );
}

export interface DeptSkylineProps {
  /** One value per department (e.g. CO₂ saved), in display order. */
  values: number[];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Manager dashboard hero: department towers sized by the saving they've made. */
export function DeptSkyline({ values, style, accessibilityLabel }: DeptSkylineProps) {
  if (values.length === 0) return null;
  return (
    <Scene3D
      style={style}
      camera={{ position: [0, 1.6, 4.2], fov: 36, lookAt: [0, 0.6, 0] }}
      accessibilityLabel={accessibilityLabel}
    >
      <Skyline values={values} />
    </Scene3D>
  );
}
