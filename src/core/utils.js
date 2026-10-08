import * as THREE from 'three';

export const rand = Math.random;
export const randRange = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(randRange(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent smoothing: move `a` toward `b` with half-life-ish `rate`.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function distXZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
export function dist2XZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}
// Normalized XZ direction from a to b (y = 0). Writes into `out`.
export function dirXZ(a, b, out = new THREE.Vector3()) {
  out.set(b.x - a.x, 0, b.z - a.z);
  const l = out.length();
  if (l > 1e-6) out.multiplyScalar(1 / l); else out.set(1, 0, 0);
  return out;
}
// Rotate an XZ direction by angle (radians) around Y.
export function rotateXZ(v, ang, out = new THREE.Vector3()) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return out.set(v.x * c - v.z * s, 0, v.x * s + v.z * c);
}

// Element palette. HDR multipliers (>1) make things bloom.
export const ELEMENT_COLOR = {
  arcane: 0xb67cff,
  fire: 0xff6a1f,
  frost: 0x66d9ff,
  storm: 0xffe14a,
  physical: 0xffffff,
  poison: 0x7cff6a,
};
export const ELEMENT_CSS = {
  arcane: '#c08cff',
  fire: '#ff7a33',
  frost: '#7fe0ff',
  storm: '#ffe45c',
  physical: '#ffffff',
};

// Basic material that blooms: color multiplied above 1.0 in linear space.
export function glowMaterial(color, intensity = 2.5, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? true, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: opts.side ?? THREE.FrontSide });
  m.color.multiplyScalar(intensity);
  return m;
}

// Shared geometries so modules don't allocate new ones per projectile.
export const GEO = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  sphereLow: new THREE.SphereGeometry(1, 8, 6),
  icosa: new THREE.IcosahedronGeometry(1, 0),
  octa: new THREE.OctahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  ring: new THREE.RingGeometry(0.85, 1, 48),
  disc: new THREE.CircleGeometry(1, 32),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 32),
};
