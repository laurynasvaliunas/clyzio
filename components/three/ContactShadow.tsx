import React, { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Soft round "contact shadow" under an object — a disc whose per-vertex alpha
 * falls off from the centre. No texture: expo-gl can't upload some of the
 * formats three.js uses, and a texture-free shadow is cheaper anyway.
 */
function shadowGeometry(): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(0, 1, 48, 8);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.min(1, Math.hypot(pos.getX(i), pos.getY(i)));
    colors[i * 4] = 0.043; // ink #0B1A1F
    colors[i * 4 + 1] = 0.102;
    colors[i * 4 + 2] = 0.122;
    colors[i * 4 + 3] = Math.pow(1 - r, 2.2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geo;
}

let shared: THREE.BufferGeometry | null = null;

export function ContactShadow({
  position,
  size,
  opacity = 0.4,
}: {
  position: [number, number, number];
  /** Diameter in scene units. */
  size: number;
  opacity?: number;
}) {
  const geometry = useMemo(() => (shared ??= shadowGeometry()), []);
  return (
    <mesh geometry={geometry} position={position} rotation={[-Math.PI / 2, 0, 0]} scale={size / 2}>
      <meshBasicMaterial vertexColors transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
