import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleProp, View, ViewStyle } from 'react-native';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber/native';
import { Scene3D, useScene } from './Scene3D';
import { C3, mix, seeded, sphereNoise } from './kit';
import { ContactShadow } from './ContactShadow';

const LAND = 0.18; // noise threshold above which a vertex is land
const MAX_TREES = 28;

function useGlobeGeometry(greenness: number) {
  return useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 4); // non-indexed → flat facets
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    // Fresh sage at the start, deep leaf green at the milestone.
    const landTone = mix(C3.sage, C3.leaf, greenness);
    const peakTone = mix(landTone.getStyle(), C3.snow, 0.35);
    const shallow = new THREE.Color(C3.tealLight);
    const deep = new THREE.Color(C3.teal);

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const n = sphereNoise(v.x, v.y, v.z, 3);
      let height = 1;
      let c: THREE.Color;
      if (n > LAND) {
        const h = n - LAND;
        height = 1 + Math.min(0.09, h * 0.12);
        c = h > 0.85 ? peakTone : landTone.clone().offsetHSL(0, 0, -h * 0.06);
      } else {
        c = deep.clone().lerp(shallow, Math.max(0, (n + 0.6) / 0.8));
      }
      v.multiplyScalar(height);
      pos.setXYZ(i, v.x, v.y, v.z);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [greenness]);
}

/** Points on land, deterministic, for placing trees. */
function useTreeSpots(count: number) {
  return useMemo(() => {
    const rand = seeded(42);
    const spots: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    let guard = 0;
    while (spots.length < count && guard++ < 4000) {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const n = new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t));
      const noise = sphereNoise(n.x, n.y, n.z, 3);
      if (noise < LAND + 0.08 || noise > LAND + 0.7) continue;
      const height = 1 + Math.min(0.09, (noise - LAND) * 0.12);
      spots.push({
        pos: n.clone().multiplyScalar(height),
        quat: new THREE.Quaternion().setFromUnitVectors(up, n),
        scale: 0.8 + rand() * 0.5,
      });
    }
    return spots;
  }, [count]);
}

function Globe({ greenness, trees, spin }: { greenness: number; trees: number; spin: React.MutableRefObject<number> }) {
  const { still } = useScene();
  const group = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Group>(null);
  const geometry = useGlobeGeometry(greenness);
  const spots = useTreeSpots(Math.min(MAX_TREES, Math.max(0, Math.round(trees))));
  const cloudBits = useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: 7 }, () => ({
      theta: rand() * Math.PI * 2,
      y: (rand() - 0.5) * 1.2,
      s: 0.06 + rand() * 0.05,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!group.current) return;
    // Idle spin + any drag momentum, which decays.
    const idle = still ? 0 : 0.18;
    group.current.rotation.y += (idle + spin.current) * delta;
    spin.current *= Math.pow(0.04, delta);
    if (clouds.current && !still) clouds.current.rotation.y += delta * 0.07;
  });

  return (
    <group rotation={[0.35, still ? 0.6 : 0, 0.08]}>
      <group ref={group}>
        <mesh geometry={geometry}>
          <meshLambertMaterial vertexColors flatShading />
        </mesh>
        {spots.map((s, i) => (
          <group key={i} position={s.pos} quaternion={s.quat} scale={s.scale}>
            <mesh position={[0, 0.045, 0]}>
              <coneGeometry args={[0.028, 0.085, 5]} />
              <meshPhongMaterial color={i % 3 === 0 ? C3.leafLight : C3.leaf} flatShading shininess={33} specular="#2A3A3E" />
            </mesh>
          </group>
        ))}
      </group>
      {/* Clouds drift independently of the planet. */}
      <group ref={clouds}>
        {cloudBits.map((c, i) => (
          <group key={i} position={[Math.cos(c.theta) * 1.22, c.y, Math.sin(c.theta) * 1.22]}>
            <mesh>
              <icosahedronGeometry args={[c.s, 0]} />
              <meshLambertMaterial color={C3.white} flatShading />
            </mesh>
            <mesh position={[c.s * 0.9, -c.s * 0.2, 0]}>
              <icosahedronGeometry args={[c.s * 0.75, 0]} />
              <meshLambertMaterial color={C3.white} flatShading />
            </mesh>
          </group>
        ))}
      </group>
      {/* Atmosphere halo. */}
      <mesh scale={1.16}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={C3.tealLight} transparent opacity={0.09} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export interface EcoGlobeProps {
  /** 0–1: how green the land reads (e.g. CO₂ saved toward a milestone). */
  greenness: number;
  /** Small trees planted on the land (e.g. "trees equivalent"). */
  trees?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The Impact hero: a slowly turning low-poly Earth. Land greens as the user's
 * CO₂ saving grows and tiny trees appear for each tree equivalent. A
 * horizontal drag spins it (vertical drags still scroll the screen).
 */
export function EcoGlobe({ greenness, trees = 0, style, accessibilityLabel }: EcoGlobeProps) {
  const spin = useRef(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => {
          spin.current = Math.max(-6, Math.min(6, g.vx * 4));
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );

  return (
    <View style={style} {...pan.panHandlers}>
      <Scene3D
        style={{ flex: 1 }}
        camera={{ position: [0, 0.15, 4.1], fov: 38 }}
        accessibilityLabel={accessibilityLabel}
      >
        <Globe greenness={Math.min(1, Math.max(0, greenness))} trees={trees} spin={spin} />
        <ContactShadow position={[0, -1.42, 0]} size={2.4} opacity={0.5} />
      </Scene3D>
    </View>
  );
}
