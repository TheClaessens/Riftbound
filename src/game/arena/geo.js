import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, lump, paint, paintFlat, twoSided } from '../env/props.js';

// =====================================================================================
//  Arena wall — geometry kit. Same recipe contract as env/props.js (non-indexed, flat-shaded,
//  vertex-coloured with a baked AO gradient), plus an optional per-vertex glow weight `aGlow`.
//  Piece frame: x = along the wall (tangent), y = up, z = OUTWARD (z = 0 is the wall's inner face).
// =====================================================================================

export { prep, lump, paint, paintFlat, twoSided };
export { TAU } from './common.js';
const TAU = Math.PI * 2;

export const ico = (r, d, rng, amt = 0.15) => lump(prep(new THREE.IcosahedronGeometry(r, d)), amt, rng);
export const cyl = (rt, rb, h, seg = 7, hs = 1, open = false) => prep(new THREE.CylinderGeometry(rt, rb, h, seg, hs, open));

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3(), _e = new THREE.Vector3();

/** Cylinder from point a to b (radius r0 at a, r1 at b). Position only; paint it afterwards. */
export function beam(a, b, r0, r1 = r0, seg = 5) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _d.length() || 1e-3;
  _d.multiplyScalar(1 / L);
  const g = cyl(r1, r0, L, seg);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(_up, _d));
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** A painted open cone ("thorn") from `base` along `dir`. Colours run along its axis. */
export function thorn(base, dir, len, r, c0, c1, rng, seg = 4) {
  const g = prep(new THREE.ConeGeometry(r, len, seg, 1, true));
  g.translate(0, len / 2, 0);
  paint(g, c0, c1, rng, { ao: 0, jitter: 0.1 });
  _d.set(dir[0], dir[1], dir[2]).normalize();
  g.applyQuaternion(_q.setFromUnitVectors(_up, _d));
  g.translate(base[0], base[1], base[2]);
  return g;
}

/**
 * Tapered tube along a Catmull-Rom curve through pts. radius r0 -> r1 with optional base flare.
 * Returns { geo, curve } (geo is position-only; paint it).
 */
export function tubeAlong(pts, r0, r1, { radial = 4, segs = 7, flare = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const r = (r0 + (r1 - r0) * t) * (1 + flare * Math.max(0, 1 - t * 4) ** 2);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return { geo: prep(g), curve };
}

/** Thorns spaced along a curve (arc-length t in [t0, t1]). dirBias pulls them toward a direction (e.g. outward / up). */
export function thornsAlong(parts, curve, rng, { every = 0.4, len = 0.4, r = 0.05, c0 = 0x23190f, c1 = 0x6e5c3e, bias = [0, 0.3, 0.5], t0 = 0.12, t1 = 1, rad0 = 0.1, rad1 = 0.05, seg = 4, hook = 0.35 }) {
  const L = curve.getLength(), n = Math.max(1, Math.floor(L * (t1 - t0) / every));
  const T = new THREE.Vector3(), P = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = t0 + (t1 - t0) * ((i + 0.5 + (rng() - 0.5) * 0.6) / n);
    curve.getPointAt(Math.min(1, Math.max(0, t)), P);
    curve.getTangentAt(Math.min(1, Math.max(0, t)), T);
    N1.set(T.y, -T.x, 0.001).cross(T).normalize();
    if (!isFinite(N1.x)) N1.set(1, 0, 0);
    N2.crossVectors(T, N1).normalize();
    const phi = rng() * TAU;
    D.copy(N1).multiplyScalar(Math.cos(phi)).addScaledVector(N2, Math.sin(phi));
    D.x += bias[0]; D.y += bias[1]; D.z += bias[2];
    D.addScaledVector(T, hook).normalize();
    const rr = rad0 + (rad1 - rad0) * t;
    const s = 0.65 + rng() * 0.7;
    parts.push(thorn([P.x + D.x * rr * 0.6, P.y + D.y * rr * 0.6, P.z + D.z * rr * 0.6], [D.x, D.y, D.z], len * s, r * (0.8 + rng() * 0.4), c0, c1, rng, seg));
  }
}

/** Make faces point away from centerFn(cx, cy, cz) -> [x, y, z] (single-sided hulls built by hand). */
export function orientOut(geo, centerFn) {
  const p = geo.attributes.position;
  for (let f = 0; f < p.count; f += 3) {
    _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
    _m.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    _n.copy(_b).sub(_a).cross(_e.copy(_c).sub(_a));
    const [ox, oy, oz] = centerFn(_m.x, _m.y, _m.z);
    if (_n.x * (_m.x - ox) + _n.y * (_m.y - oy) + _n.z * (_m.z - oz) < 0) {
      p.setXYZ(f + 1, _c.x, _c.y, _c.z); p.setXYZ(f + 2, _b.x, _b.y, _b.z);
    }
  }
  return geo;
}

/** Triangle soup -> geometry. */
export function tris(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

const _col = new THREE.Color();
/** Per-face colour from fn(cx, cy, cz, nx, ny, nz, outColor) -> glow weight (0..n, optional). Sets `color` and `aGlow`. */
export function paintFn(geo, fn) {
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let f = 0; f < n; f += 3) {
    _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
    _m.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    _b.sub(_a); _c.sub(_a); _n.copy(_b).cross(_c).normalize();
    const g = fn(_m.x, _m.y, _m.z, _n.x, _n.y, _n.z, _col) ?? 0;
    for (let q = 0; q < 3; q++) {
      col[(f + q) * 3] = _col.r; col[(f + q) * 3 + 1] = _col.g; col[(f + q) * 3 + 2] = _col.b;
      gl[f + q] = g;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return geo;
}

/** Give every part the same attribute set, merge, flat-shade. Returns the final geometry (+ bounding box). */
export function bake(parts, { glow = true } = {}) {
  for (const g of parts) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'color' && k !== 'aGlow') g.deleteAttribute(k);
    if (!g.attributes.color) paintFlat(g, 0x808080, () => 0.5, { jitter: 0 });
    if (g.attributes.fl) g.deleteAttribute('fl');
    if (glow && !g.attributes.aGlow) g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    if (!glow && g.attributes.aGlow) g.deleteAttribute('aGlow');
  }
  const out = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

export const triCount = (geo) => geo.attributes.position.count / 3;
