import React, { useMemo, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';
import { Scene3D, useScene } from './Scene3D';
import { C3, leafShape, seeded } from './kit';
import { ContactShadow } from './ContactShadow';

const ROAD_IN = 1.18;
const ROAD_OUT = 1.52;
const CAR_LANE = 1.27;
const BIKE_LANE = 1.43;

function Buildings() {
  const blocks = useMemo(() => {
    const rand = seeded(11);
    const out: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [];
    // Downtown inside the ring.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
      const r = 0.3 + rand() * 0.55;
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        w: 0.18 + rand() * 0.12,
        d: 0.18 + rand() * 0.12,
        h: 0.25 + rand() * 0.75,
        color: rand() > 0.55 ? C3.white : rand() > 0.5 ? '#D7ECEC' : C3.paper,
      });
    }
    // Low buildings outside the ring.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const r = 1.78 + rand() * 0.15;
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        w: 0.16 + rand() * 0.08,
        d: 0.16 + rand() * 0.08,
        h: 0.12 + rand() * 0.22,
        color: rand() > 0.5 ? C3.white : '#E3EFEF',
      });
    }
    return out;
  }, []);

  return (
    <>
      {blocks.map((b, i) => (
        <group key={i} position={[b.x, 0.075 + b.h / 2, b.z]}>
          <mesh>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshPhongMaterial color={b.color} flatShading shininess={42} specular="#2A3A3E" />
          </mesh>
          {/* Teal roof cap on taller blocks. */}
          {b.h > 0.5 && (
            <mesh position={[0, b.h / 2 + 0.02, 0]}>
              <boxGeometry args={[b.w * 0.86, 0.04, b.d * 0.86]} />
              <meshPhongMaterial color={C3.teal} shininess={51} specular="#2A3A3E" />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

function Trees() {
  const trees = useMemo(() => {
    const rand = seeded(23);
    return Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.2;
      const r = i % 2 ? 1.05 : 1.66;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + rand() * 0.5 };
    });
  }, []);
  return (
    <>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0.075, t.z]} scale={t.s}>
          <mesh position={[0, 0.04, 0]}>
            <cylinderGeometry args={[0.012, 0.016, 0.08, 5]} />
            <meshPhongMaterial color="#7C5A3A" shininess={33} specular="#2A3A3E" />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <coneGeometry args={[0.07, 0.17, 6]} />
            <meshPhongMaterial color={i % 3 ? C3.leaf : C3.leafLight} flatShading shininess={33} specular="#2A3A3E" />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Car({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[0.2, 0.06, 0.1]} />
        <meshPhongMaterial color={color} shininess={64} specular="#2A3A3E" />
      </mesh>
      <mesh position={[-0.01, 0.09, 0]}>
        <boxGeometry args={[0.11, 0.045, 0.085]} />
        <meshPhongMaterial color="#CFEFF1" shininess={78} specular="#2A3A3E" />
      </mesh>
      {[-0.065, 0.065].map((x) =>
        [-0.052, 0.052].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.018, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.016, 10]} />
            <meshPhongMaterial color={C3.ink} shininess={33} specular="#2A3A3E" />
          </mesh>
        )),
      )}
    </group>
  );
}

function Bike() {
  return (
    <group>
      {[-0.05, 0.05].map((x) => (
        <mesh key={x} position={[x, 0.035, 0]}>
          <torusGeometry args={[0.03, 0.007, 6, 14]} />
          <meshPhongMaterial color={C3.ink} shininess={33} specular="#2A3A3E" />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.1, 0.012, 0.012]} />
        <meshPhongMaterial color={C3.sun} shininess={33} specular="#2A3A3E" />
      </mesh>
      {/* Rider */}
      <mesh position={[0.005, 0.115, 0]}>
        <capsuleGeometry args={[0.018, 0.05, 4, 8]} />
        <meshPhongMaterial color={C3.sun} shininess={42} specular="#2A3A3E" />
      </mesh>
      <mesh position={[0.012, 0.165, 0]}>
        <sphereGeometry args={[0.017, 10, 10]} />
        <meshPhongMaterial color="#F2D2B6" shininess={33} specular="#2A3A3E" />
      </mesh>
    </group>
  );
}

function Leaves() {
  const { still } = useScene();
  const geo = useMemo(() => new THREE.ShapeGeometry(leafShape(0.12)), []);
  const leaves = useMemo(() => {
    const rand = seeded(5);
    return Array.from({ length: 6 }, () => ({
      x: (rand() - 0.5) * 3.2,
      y: 0.9 + rand() * 0.9,
      z: (rand() - 0.5) * 2.4,
      phase: rand() * Math.PI * 2,
    }));
  }, []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.getElapsedTime();
    refs.current.forEach((m, i) => {
      if (!m) return;
      const l = leaves[i];
      m.position.y = l.y + Math.sin(t * 0.9 + l.phase) * 0.12;
      m.rotation.z = Math.sin(t * 0.7 + l.phase) * 0.6;
      m.rotation.y = t * 0.5 + l.phase;
    });
  });
  return (
    <>
      {leaves.map((l, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={geo}
          position={[l.x, l.y, l.z]}
        >
          <meshPhongMaterial color={i % 2 ? C3.mint : C3.leaf} side={THREE.DoubleSide} shininess={42} specular="#2A3A3E" />
        </mesh>
      ))}
    </>
  );
}

function City() {
  const { still } = useScene();
  const world = useRef<THREE.Group>(null);
  const car = useRef<THREE.Group>(null);
  const bike = useRef<THREE.Group>(null);
  const dashes = useMemo(
    () => Array.from({ length: 22 }, (_, i) => (i / 22) * Math.PI * 2),
    [],
  );

  useFrame(({ clock }) => {
    const t = still ? 2.2 : clock.getElapsedTime();
    if (world.current && !still) world.current.rotation.y = t * 0.08;
    if (car.current) {
      const a = t * 0.55;
      car.current.position.set(Math.cos(a) * CAR_LANE, 0.075, Math.sin(a) * CAR_LANE);
      car.current.rotation.y = -a - Math.PI / 2;
    }
    if (bike.current) {
      const a = -t * 0.32 + 2;
      bike.current.position.set(Math.cos(a) * BIKE_LANE, 0.075, Math.sin(a) * BIKE_LANE);
      bike.current.rotation.y = -a + Math.PI / 2;
    }
  });

  return (
    <group ref={world} rotation={[0, still ? 0.5 : 0, 0]}>
      {/* Ground plate */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[2.1, 2.1, 0.15, 48]} />
        <meshLambertMaterial color="#F2F7F6" />
      </mesh>
      <mesh position={[0, -0.09, 0]}>
        <cylinderGeometry args={[2.1, 2.0, 0.04, 48]} />
        <meshPhongMaterial color={C3.teal} shininess={42} specular="#2A3A3E" />
      </mesh>
      {/* Park inside the ring */}
      <mesh position={[0, 0.076, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ROAD_IN, 40]} />
        <meshLambertMaterial color="#D8F0E2" />
      </mesh>
      {/* Ring road */}
      <mesh position={[0, 0.078, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ROAD_IN, ROAD_OUT, 64]} />
        <meshLambertMaterial color={C3.slate} />
      </mesh>
      {dashes.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * ((ROAD_IN + ROAD_OUT) / 2), 0.08, Math.sin(a) * ((ROAD_IN + ROAD_OUT) / 2)]}
          rotation={[-Math.PI / 2, 0, -a]}
        >
          <planeGeometry args={[0.012, 0.11]} />
          <meshBasicMaterial color="#E7EEEF" />
        </mesh>
      ))}
      <Buildings />
      <Trees />
      <group ref={car}>
        <Car color={C3.tealLight} />
      </group>
      <group ref={bike}>
        <Bike />
      </group>
      <ContactShadow position={[0, -0.12, 0]} size={5.2} opacity={0.4} />
    </group>
  );
}

export interface CommuteCityProps {
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Welcome / onboarding hero: a little city where people commute cleanly. */
export function CommuteCity({ style, accessibilityLabel }: CommuteCityProps) {
  return (
    <Scene3D
      style={style}
      camera={{ position: [0, 2.6, 4.4], fov: 36, lookAt: [0, 0.25, 0] }}
      accessibilityLabel={accessibilityLabel}
    >
      <City />
      <Leaves />
    </Scene3D>
  );
}
