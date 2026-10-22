import React, { useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';
import { Scene3D, useScene } from './Scene3D';
import { C3 } from './kit';
import { ContactShadow } from './ContactShadow';

/** Gem colour by level band: teal → mint → gold → violet at the top. */
function tierColor(level: number): string {
  if (level >= 9) return '#8B5CF6';
  if (level >= 7) return C3.sun;
  if (level >= 4) return C3.mint;
  return C3.tealLight;
}

function Gem({ level }: { level: number }) {
  const { still } = useScene();
  const ref = useRef<THREE.Group>(null);
  const color = tierColor(level);

  useFrame(({ clock }) => {
    if (!ref.current || still) return;
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.6;
    ref.current.position.y = Math.sin(t * 1.6) * 0.08;
  });

  return (
    <>
      <group ref={ref} rotation={[0, still ? 0.6 : 0, 0]}>
        {/* Crown + pavilion = a cut gem. */}
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.62, 0.95, 0.36, 8]} />
          <meshPhongMaterial color={color} flatShading shininess={80} specular="#2A3A3E" />
        </mesh>
        <mesh position={[0, -0.42, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.95, 0.85, 8]} />
          <meshPhongMaterial color={color} flatShading shininess={76} specular="#2A3A3E" />
        </mesh>
        <mesh position={[0, 0.365, 0]}>
          <cylinderGeometry args={[0.62, 0.62, 0.01, 8]} />
          <meshPhongMaterial color={C3.white} transparent opacity={0.35} flatShading shininess={33} specular="#2A3A3E" />
        </mesh>
      </group>
      <ContactShadow position={[0, -1.05, 0]} size={1.7} opacity={0.4} />
    </>
  );
}

export interface LevelGemProps {
  level: number;
  style?: StyleProp<ViewStyle>;
}

/** Profile hero: a floating faceted gem tinted by the user's level. */
export function LevelGem({ level, style }: LevelGemProps) {
  return (
    <Scene3D style={style} camera={{ position: [0, 0.6, 3.6], fov: 36, lookAt: [0, -0.15, 0] }}>
      <Gem level={level} />
    </Scene3D>
  );
}
