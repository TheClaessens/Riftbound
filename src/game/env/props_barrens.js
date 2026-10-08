import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, lump, paint, paintFlat, twoSided, finish } from './props.js';
import { ENV, ENV_PARS, fbm, vnoise, smooth } from './common.js';

// =====================================================================================
//  Act II props — The Sunscorch Barrens. Same recipe contract as props.js (prep -> lump ->
//  paint -> finish; non-indexed, vertex colours, sway attribute), plus a few shader-only
//  ambient effects (campfire flame + smoke, dust devils) that animate on ENV.uTime with no
//  per-frame CPU work.
//
//  pal fields: trunk, trunkTop, deadWood, deadWoodTip, leafDark, leafLight, grassRoot, grassTip,
//    strata[], mesaCap, talus, bone, boneDark, horn, wood, woodTop, hide, hideDark, iron, ironLight,
//    teal, tealLight, cloth, rope, stone, stoneDark
// =====================================================================================

const TAU = Math.PI * 2;
const ico = (r, d, rng, amt = 0.15) => lump(prep(new THREE.IcosahedronGeometry(r, d)), amt, rng);
const cyl = (rt, rb, h, seg = 7, hs = 1) => prep(new THREE.CylinderGeometry(rt, rb, h, seg, hs));

// ---------- geometry helpers ----------
const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Cylinder from point a to point b (radius r0 at a, r1 at b). */
function beam(a, b, r0, r1 = r0, seg = 5) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _dir.length() || 1e-3;
  _dir.multiplyScalar(1 / L);
  const g = cyl(r1, r0, L, seg);
  g.translate(0, L / 2, 0);
  _q.setFromUnitVectors(_up, _dir);
  g.applyQuaternion(_q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** Tapered tube along a smooth curve through pts (radius r0 -> r1). Open ends. */
function tube(pts, r0, r1, radial = 5, segs = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return prep(g);
}

/** Triangle soup -> geometry. */
function tris(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3();
const _e1 = new THREE.Vector3();
/** Flip faces whose normal points toward centerFn(cx, cy, cz) -> [x, y, z] (closed-ish hulls, single-sided material). */
function orientOut(geo, centerFn) {
  const p = geo.attributes.position;
  for (let f = 0; f < p.count; f += 3) {
    _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
    _m.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    _n.copy(_b).sub(_a).cross(_e1.copy(_c).sub(_a));
    const [ox, oy, oz] = centerFn(_m.x, _m.y, _m.z);
    if (_n.x * (_m.x - ox) + _n.y * (_m.y - oy) + _n.z * (_m.z - oz) < 0) {
      p.setXYZ(f + 1, _c.x, _c.y, _c.z); p.setXYZ(f + 2, _b.x, _b.y, _b.z);
    }
  }
  return geo;
}

const _col = new THREE.Color();
/** Per-face colour from fn(cx, cy, cz, nx, ny, nz, outColor) -> flutter (0/1, optional). */
function paintFn(geo, fn) {
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), fl = new Float32Array(n);
  for (let f = 0; f < n; f += 3) {
    _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
    _m.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    _b.sub(_a); _c.sub(_a); _n.copy(_b).cross(_c).normalize();
    const flut = fn(_m.x, _m.y, _m.z, _n.x, _n.y, _n.z, _col) ?? 0;
    for (let q = 0; q < 3; q++) {
      col[(f + q) * 3] = _col.r; col[(f + q) * 3 + 1] = _col.g; col[(f + q) * 3 + 2] = _col.b;
      fl[f + q] = flut;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('fl', new THREE.BufferAttribute(fl, 1));
  return geo;
}

/**
 * finish() + per-part sway override: parts with userData.sway = (x, y, z) => [swayMetres, flutterMetres]
 * get that instead of the height curve (e.g. cloth hanging from a bar flutters at the bottom, not the top).
 */
function finishX(parts, opts) {
  const ranges = [];
  let off = 0;
  for (const p of parts) { const n = p.attributes.position.count; if (p.userData.sway) ranges.push([off, n, p.userData.sway]); off += n; }
  const g = finish(parts, opts);
  if (ranges.length) {
    const P = g.attributes.position, W = g.attributes.sway;
    for (const [o, n, fn] of ranges) for (let i = o; i < o + n; i++) {
      const [s, f] = fn(P.getX(i), P.getY(i), P.getZ(i));
      W.setXY(i, s, f);
    }
  }
  return g;
}

const C = (h) => new THREE.Color(h);

// =====================================================================================
//  Rock formations
// =====================================================================================

/**
 * Strata painter: ragged horizontal bands (continuous, gently waving around the formation),
 * desert-varnish streaks on cliff faces, pale talus at the foot, dry-grass cap on up faces.
 */
function paintStrata(geo, pal, rng, { H, bandH = 1.6, talus = 0.14, ao = 0.3 }) {
  const cols = pal.strata.map(C), cap = C(pal.mesaCap), tal = C(pal.talus);
  const bounds = [], idx = [];
  let y = -H * 0.2, last = -1;
  while (y < H * 1.3) {
    bounds.push(y);
    let k; do k = Math.floor(rng() * cols.length); while (k === last && cols.length > 1);
    idx.push(k); last = k;
    y += bandH * (0.45 + rng() * 1.1);
  }
  const ph1 = rng() * TAU, ph2 = rng() * TAU, tilt = (rng() - 0.5) * 0.05, sv = rng() * 40;
  return paintFn(geo, (x, cy, z, nx, ny, nz, out) => {
    const r = Math.hypot(x, z) || 1e-3, ca = x / r, sa = z / r;
    const a = Math.atan2(sa, ca);
    const yy = cy + Math.sin(a * 2 + ph1) * 0.35 + Math.sin(a * 5 + ph2) * 0.12 + x * tilt;
    let b = 0;
    while (b < bounds.length - 1 && bounds[b + 1] <= yy) b++;
    out.copy(cols[idx[b]]);
    // desert varnish: dark vertical streaks on the cliff faces
    if (ny < 0.5 && cy > talus * H) {
      const s = vnoise(ca * 4.3 + sv, sa * 4.3 + cy * 0.03);
      if (s > 0.66) out.multiplyScalar(0.84 - (s - 0.66) * 0.5);
    }
    // talus skirt toward pale sand-rust
    const tk = 1 - smooth(talus * H * 0.35, talus * H * 1.15, cy);
    out.lerp(tal, tk * 0.7);
    // dry-grass / sand cap on ledges and the top
    if (ny > 0.62) out.lerp(cap, smooth(0.62, 0.85, ny) * (cy > talus * H ? 1 : 0.5));
    const k = (1 - ao) + ao * smooth(-0.05 * H, 0.45 * H, cy);
    out.multiplyScalar(k * (1 + (rng() * 2 - 1) * 0.05));
    return 0;
  });
}

/**
 * Mesa / butte / hoodoo spire. The lathe profile is built BAND BY BAND: every stratum is one ring
 * of quads with its own radius (hard layers stand proud, soft ones recede, ledges between them),
 * so colour bands are crisp, follow the geometry and read as eroded layer-cake badlands. The rings
 * are pushed by fBm of the direction (seamless), jittered per band, stretched, then sheared so the
 * strata tilt. o: { radius, height, kind: 'mesa'|'butte'|'spire', seg, bandH }
 * Origin at the base centre; the base sits ~0.6 m below y = 0.
 */
export function makeMesa(rng, pal, o = {}) {
  const R = o.radius ?? 6, H = o.height ?? 12, kind = o.kind ?? 'mesa', seg = o.seg ?? (kind === 'spire' ? 10 : 9);
  const block = kind === 'block', bandH = o.bandH ?? (block ? H / 3 : Math.max(0.9, H / 10));
  const L1 = 0.45 + rng() * 0.2;
  const talusT = kind === 'butte' ? 0.17 : kind === 'spire' ? 0.14 : block ? 0.06 : 0.12;
  // radius multiplier of the silhouette at t = y / H
  const base = (t) => {
    if (kind === 'spire') {
      if (t < talusT) return 0.8 + 0.5 * (1 - t / talusT) ** 2;
      if (t < 0.78) return 0.78 - (t - talusT) * 0.42;
      if (t < 0.83) return 0.55 + (t - 0.78) * 9;
      return 1.02 - (t - 0.83) * 0.6;
    }
    if (block) return (t < talusT ? 1.1 : 1.0 - t * 0.14) * (t > 0.9 ? 0.92 : 1);
    if (t < talusT) return 1.02 + (kind === 'butte' ? 0.36 : 0.3) * (1 - t / talusT) ** 1.6;
    let r = 1.0 - (t - talusT) * (kind === 'butte' ? 0.16 : 0.08);
    if (t > L1) r *= kind === 'butte' ? 0.8 : 0.87;
    return r;
  };
  // strata
  const ys = [block ? -0.3 : -0.6];
  while (ys[ys.length - 1] < H - bandH * 0.4) ys.push(Math.min(H, ys[ys.length - 1] + bandH * (0.5 + rng() * 1.0)));
  ys[ys.length - 1] = H;
  const nB = ys.length - 1, hard = [];
  for (let i = 0; i < nB; i++) hard.push(ys[i] / H < talusT ? 0 : (rng() < 0.3 ? 0.06 : -0.02) + (rng() - 0.5) * 0.03);
  if (!block && kind !== 'spire') hard[nB - 1] = 0.08;   // caprock overhang
  const pts = [];
  for (let i = 0; i < nB; i++) {
    const y0 = ys[i] + (i ? 0.03 : 0), y1 = ys[i + 1];
    pts.push(new THREE.Vector2(R * base(Math.max(0, y0) / H) * (1 + hard[i]), y0));
    pts.push(new THREE.Vector2(R * base(y1 / H) * (1 + hard[i]) * 0.985, y1));
  }
  const rTop = pts[pts.length - 1].x;
  pts.push(new THREE.Vector2(rTop * 0.6, H + 0.08), new THREE.Vector2(0, H + 0.12));
  const nP = pts.length;
  const lathe = new THREE.LatheGeometry(pts, seg);
  // deform the indexed lathe (seam duplicates share direction -> identical offsets, no cracks)
  const s1 = rng() * 50, s2 = rng() * 50, amp = kind === 'spire' ? 0.4 : block ? 0.7 : 0.4;
  const ex = 1 + rng() * (kind === 'spire' ? 0.2 : block ? 0.8 : 0.45), rot = rng() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
  const tx = (rng() - 0.5) * 0.07, tz = (rng() - 0.5) * 0.07;
  const p = lathe.attributes.position;
  for (let v = 0; v < p.count; v++) {
    const j = v % nP, band = Math.min(nB - 1, j >> 1);
    let x = p.getX(v), y = p.getY(v), z = p.getZ(v);
    const r = Math.hypot(x, z);
    if (r > 1e-4) {
      let ca = x / r, sa = z / r;
      const dphi = (vnoise(ca * 2.1 + s2, sa * 2.1 + s1) - 0.5) * 0.35;
      const c2 = Math.cos(dphi), s3 = Math.sin(dphi);
      [ca, sa] = [ca * c2 - sa * s3, ca * s3 + sa * c2];
      const k = 1 + (fbm(ca * 1.2 + s1, sa * 1.2 + s2, 3) - 0.5) * amp
        + (vnoise(ca * 3.4 + s2 + band * 1.7, sa * 3.4 + band * 2.3) - 0.5) * (j >= nB * 2 ? 0.05 : 0.12)
        + (vnoise(ca * 6.3 + s1, sa * 6.3 - s2) - 0.5) * 0.3;   // vertical fluting / columns
      x = ca * r * k; z = sa * r * k;
    }
    if (j >= nP - 2) y += (vnoise(x * 0.4 + s1, z * 0.4) - 0.5) * 0.3;    // uneven top
    // stretch + rotate, then shear (tilted strata)
    let X = x * ex, Z = z;
    [X, Z] = [X * cr - Z * sr, X * sr + Z * cr];
    p.setXYZ(v, X, y + X * tx + Z * tz, Z);
  }
  const g = prep(lathe);
  // colour by band (faces lie within one band ring; ledges coloured by their normal)
  const cols = pal.strata.map(C), cap = C(pal.mesaCap), tal = C(pal.talus);
  const bandCol = [];
  let last = -1;
  // alternate light / dark strata (with the odd repeat) so the layering always reads, even in flat light
  const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const order = cols.map((c, i) => i).sort((a, b) => lum(cols[a]) - lum(cols[b]));
  const half = Math.ceil(order.length / 2), darkSet = order.slice(0, half), lightSet = order.slice(half);
  let light = rng() < 0.5;
  for (let i = 0; i < nB; i++) {
    if (rng() > 0.18) light = !light;
    const set = light ? lightSet : darkSet;
    let k; do k = set[Math.floor(rng() * set.length)]; while (k === last && set.length > 1);
    last = k; bandCol.push(k);
  }
  const sv = rng() * 40;
  paintFn(g, (x, cy, z, nx, ny, nz, out) => {
    const y = cy - x * tx - z * tz;
    let b = 0;
    while (b < nB - 1 && ys[b + 1] + 0.015 <= y) b++;
    out.copy(cols[bandCol[b]]);
    const t = y / H;
    if (t < talusT) out.lerp(tal, 0.35 + 0.3 * (1 - t / talusT));
    const r = Math.hypot(x, z) || 1;
    if (ny < 0.45 && t >= talusT) {    // desert varnish streaks down the cliffs
      const s = vnoise((x / r) * 4.3 + sv, (z / r) * 4.3);
      if (s > 0.62) out.multiplyScalar(0.86 - (s - 0.62) * 0.6);
    }
    const top = t > 0.97 || Math.abs(t - L1) < 0.03;
    if (ny > 0.6) out.lerp(cap, smooth(0.6, 0.85, ny) * (top ? 0.8 : 0.3));
    else if (ny < -0.5) out.multiplyScalar(0.7);
    out.multiplyScalar((0.74 + 0.26 * smooth(-0.05, 0.5, t)) * (1 + (rng() * 2 - 1) * 0.045));
    return 0;
  });
  const parts = [g];
  // fallen blocks + scree at the foot
  const nb = block ? Math.floor(rng() * 2) : kind === 'spire' ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 4);
  for (let i = 0; i < nb; i++) {
    const br = R * (0.08 + rng() ** 2 * 0.16), a = rng() * TAU, d = R * (1.25 + rng() * 0.4) * (1 + (ex - 1) * Math.abs(Math.cos(a - rot)));
    const b = ico(br, 0, rng, 0.25);
    b.scale(1.2, 0.75, 1); b.rotateY(rng() * TAU);
    b.translate(Math.cos(a) * d, br * 0.3, Math.sin(a) * d);
    const bc = C(pal.strata[Math.floor(rng() * pal.strata.length)]).lerp(tal, 0.35);
    parts.push(paint(b, bc.clone().multiplyScalar(0.68).getHex(), bc.getHex(), rng, { ao: 0.4, moss: pal.mesaCap, mossAmt: 0.6, mossUp: 0.75 }));
  }
  return finish(parts);
}

/** Wind-carved rock arch (landmark outside the arena). Spans local X. o: { span, height } */
export function makeArch(rng, pal, o = {}) {
  const span = o.span ?? 10, H = o.height ?? 8, parts = [];
  for (const s of [-1, 1]) {
    const leg = makeMesaLeg(rng, pal, span * 0.2, H);
    leg.translate(s * span / 2, 0, 0);
    parts.push(leg);
  }
  // the bridge: a lumpy tapered tube arcing between the legs
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, x = (t - 0.5) * span;
    pts.push([x, H * (0.78 + 0.22 * Math.sin(Math.PI * t)), (rng() - 0.5) * 0.4]);
  }
  const br = tube(pts, span * 0.13, span * 0.13, 8, 10);
  { const q = br.attributes.position; for (let i = 0; i < q.count; i++) { const k = 1 + (vnoise(q.getX(i) * 0.6, q.getY(i) * 0.6 + q.getZ(i)) - 0.5) * 0.35; const cy = H * 0.9; q.setY(i, cy + (q.getY(i) - cy) * k); q.setZ(i, q.getZ(i) * k * 1.3); } }
  parts.push(paintStrata(br, pal, rng, { H: H * 1.2, bandH: 1.3, talus: 0 }));
  return finish(parts);
}
function makeMesaLeg(rng, pal, R, H) {
  const prof = [[1.6, -0.05], [1.3, 0.05], [1.0, 0.2], [0.9, 0.6], [1.1, 0.85], [1.3, 1.0], [0.5, 1.04], [0, 1.05]];
  let g = prep(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * R, y * H)), 10));
  const s1 = rng() * 40, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = 1 + (fbm(x / r * 1.4 + s1, z / r * 1.4 + y * 0.05, 3) - 0.5) * 0.6;
    p.setXYZ(i, x * k, y, z * k);
  }
  return paintStrata(g, pal, rng, { H, bandH: 1.3, talus: 0.12 });
}

/** Boulder in barrens sandstone. o: { size, flat, stack (balanced second rock) } */
export function makeBoulder(rng, pal, o = {}) {
  const S = o.size ?? 1, parts = [];
  const g = ico(1, rng() < 0.55 ? 0 : 1, rng, 0.24);
  if (o.flat) g.scale(1.35 + rng() * 0.4, 0.32 + rng() * 0.12, 1.1 + rng() * 0.3);
  else g.scale(1 + rng() * 0.35, 0.66 + rng() * 0.28, 0.9 + rng() * 0.3);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y - 0.2, 0);
  g.scale(S, S, S);
  const top = g.boundingBox.max.y * S;
  parts.push(paint(g, o.dark ?? pal.rockDark, o.light ?? pal.rock, rng, { ao: 0.45, jitter: 0.07, moss: o.cap ?? pal.moss, mossAmt: o.capAmt ?? 0.55, mossUp: 0.62, y0: 0 }));
  if (o.stack) {
    const s2 = S * (0.45 + rng() * 0.2);
    const b = ico(1, 0, rng, 0.22);
    b.scale(1.1 * s2, 0.75 * s2, 0.95 * s2);
    b.rotateY(rng() * TAU);
    b.translate((rng() - 0.5) * 0.3 * S, top + 0.45 * s2, (rng() - 0.5) * 0.3 * S);
    parts.push(paint(b, o.dark ?? pal.rockDark, o.light ?? pal.rock, rng, { ao: 0.35, jitter: 0.07, moss: o.cap ?? pal.moss, mossAmt: 0.5, mossUp: 0.62 }));
  }
  return finish(parts);
}

/** Cluster of rounded riverbed stones / pebbles (flat, pale). o: { n, spread } */
export function makePebbles(rng, pal, o = {}) {
  const parts = [], n = o.n ?? (6 + Math.floor(rng() * 6)), spread = o.spread ?? 1.2;
  for (let i = 0; i < n; i++) {
    const r = 0.08 + rng() ** 2 * 0.28, a = rng() * TAU, d = Math.sqrt(rng()) * spread;
    const s = ico(r, 0, rng, 0.18);
    s.scale(1.2, 0.45 + rng() * 0.2, 1); s.rotateY(rng() * TAU);
    s.translate(Math.cos(a) * d, r * 0.15, Math.sin(a) * d);
    const v = 0.85 + rng() * 0.3;
    const c = C(rng() < 0.3 ? pal.talus : pal.pebble ?? pal.rock).multiplyScalar(v);
    parts.push(paint(s, c.clone().multiplyScalar(0.72).getHex(), c.getHex(), rng, { ao: 0.3, jitter: 0.05 }));
  }
  return finish(parts);
}

// =====================================================================================
//  Vegetation
// =====================================================================================

/**
 * Acacia: a leaning trunk forks into 2-4 limbs that splay out almost horizontally and split again;
 * every twig end carries a small flat leaf pad, and the pads sit on (nearly) one plane: the iconic
 * flat umbrella with dark gaps and visible limbs underneath. o: { size, dead }
 */
export function makeAcacia(rng, pal, o = {}) {
  const S = o.size ?? 1, dead = !!o.dead, wood = [], parts = [];
  const la = rng() * TAU, lean = 0.1 + rng() * 0.22;
  const th = (2.3 + rng() * 0.7) * S;
  const fork = [Math.cos(la) * Math.sin(lean) * th, th * Math.cos(lean), Math.sin(la) * Math.sin(lean) * th];
  wood.push(tube([[0, -0.15, 0], [fork[0] * 0.2, fork[1] * 0.4, fork[2] * 0.2], [fork[0] * 0.75, fork[1] * 0.8, fork[2] * 0.75], fork], 0.21 * S, 0.12 * S, 6, 5));
  const flare = cyl(0.17 * S, 0.36 * S, 0.5 * S, 6);
  flare.translate(0, 0.16 * S, 0);
  wood.push(flare);
  const crownY = fork[1] + (1.2 + rng() * 0.4) * S;
  const nb = dead ? 3 + Math.floor(rng() * 2) : 3 + (rng() < 0.4 ? 1 : 0);
  const tips = [], a0 = rng() * TAU;
  for (let b = 0; b < nb; b++) {
    const ab = a0 + (b / nb) * TAU + (rng() - 0.5) * 0.7;
    const d = (1.0 + rng() * 0.7) * S;
    const tip = [fork[0] + Math.cos(ab) * d, crownY - (0.15 + rng() * 0.25) * S, fork[2] + Math.sin(ab) * d];
    const mid = [fork[0] + Math.cos(ab) * d * 0.35, fork[1] + (tip[1] - fork[1]) * 0.7, fork[2] + Math.sin(ab) * d * 0.35];
    wood.push(tube([fork, mid, tip], 0.1 * S, 0.04 * S, 5, 4));
    tips.push([tip, 1]);
    for (let k = 0; k < 2; k++) {
      const ab2 = ab + (k ? 1 : -1) * (0.5 + rng() * 0.45);
      const d2 = (0.8 + rng() * 0.6) * S;
      const t2 = [tip[0] + Math.cos(ab2) * d2 * 0.9 - Math.cos(ab) * 0.3 * S, crownY - (0.1 + rng() * 0.3) * S, tip[2] + Math.sin(ab2) * d2 * 0.9 - Math.sin(ab) * 0.3 * S];
      wood.push(beam(mid, t2, 0.05 * S, 0.025 * S, 4));
      tips.push([t2, 0]);
    }
    if (dead) for (const [t] of tips.slice(-3)) for (let k = 0; k < 2; k++) {
      const at = rng() * TAU, e = [t[0] + Math.cos(at) * 0.5 * S, t[1] + (0.2 + rng() * 0.35) * S, t[2] + Math.sin(at) * 0.5 * S];
      wood.push(beam(t, e, 0.025 * S, 0.01 * S, 3));
    }
  }
  const wg = mergeGeometries(wood); wood.forEach((w) => w.dispose());
  parts.push(paint(wg, dead ? pal.deadWood : pal.trunk, dead ? pal.deadWoodTip : pal.trunkTop, rng, { ao: 0.5, jitter: 0.08 }));
  let top = crownY + 0.6 * S;
  if (!dead) {
    // flat leaf pads: flat underside, low dome on top, ragged rim
    const pad = (r, x, y, z) => {
      const g = ico(r, 1, rng, 0.16);
      const q = g.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const px = q.getX(i), py = q.getY(i), pz = q.getZ(i);
        q.setXYZ(i, px * 1.05, py > 0 ? py * 0.32 : py * 0.12, pz * 1.05);
      }
      g.rotateY(rng() * TAU);
      g.translate(x, y, z);
      return g;
    };
    const pads = [];
    for (const [t, main] of tips) {
      const r = (main ? 1.0 + rng() * 0.3 : 0.8 + rng() * 0.35) * S;
      pads.push(pad(r, t[0], crownY + (rng() - 0.5) * 0.18 * S + (main ? 0.08 * S : 0), t[2]));
    }
    // a couple of fill pads over the fork so the umbrella reads as one canopy (with notches at the rim)
    for (let i = 0; i < 2; i++) {
      const a = rng() * TAU, d = rng() * 0.6 * S;
      pads.push(pad((1.0 + rng() * 0.3) * S, fork[0] + Math.cos(a) * d, crownY + 0.12 * S, fork[2] + Math.sin(a) * d));
    }
    let y0 = Infinity, y1 = -Infinity;
    for (const b of pads) { b.computeBoundingBox(); y0 = Math.min(y0, b.boundingBox.min.y); y1 = Math.max(y1, b.boundingBox.max.y); }
    top = y1;
    const cD = new THREE.Color(), cL = new THREE.Color();
    for (const b of pads) {
      const v = 0.88 + rng() * 0.22, warm = (rng() - 0.5) * 0.16;
      cD.set(pal.leafDark).multiplyScalar(v * 0.8); cL.set(pal.leafLight).multiplyScalar(v);
      cL.r *= 1 + warm; cL.b *= 1 - warm;
      parts.push(paint(b, cD.getHex(), cL.getHex(), rng, { ao: 0.6, jitter: 0.1, flutter: 1, hueJitter: 0.04, y0, y1: y1 - 0.05 * S }));
    }
  }
  return finish(parts, { height: top, amp: (dead ? 0.03 : 0.1) * S, flutter: dead ? 0 : 0.03 });
}

/** Thornbush: a tangle of forking twigs (3-sided), dead and bleached, or with sparse sage leaves. o: { size, leaves } */
export function makeThornbush(rng, pal, o = {}) {
  const S = o.size ?? 1, twigs = [], tipsOut = [];
  const grow = (p0, dir, len, r, depth) => {
    const p1 = [p0[0] + dir[0] * len, p0[1] + dir[1] * len, p0[2] + dir[2] * len];
    twigs.push(beam(p0, p1, r, r * 0.45, 3));
    if (depth === 0) { tipsOut.push(p1); return; }
    const kids = 1 + (rng() < 0.7 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const t = 0.5 + rng() * 0.4, q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t];
      const nd = [dir[0] + (rng() - 0.5) * 1.3, dir[1] + (rng() - 0.3) * 0.8, dir[2] + (rng() - 0.5) * 1.3];
      const l = Math.hypot(nd[0], nd[1], nd[2]) || 1;
      grow(q, [nd[0] / l, nd[1] / l, nd[2] / l], len * (0.5 + rng() * 0.2), r * 0.6, depth - 1);
    }
    if (rng() < 0.5) tipsOut.push(p1);
  };
  const n = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.6, e = 0.45 + rng() * 0.7;
    grow([Math.cos(a) * 0.08 * S, 0, Math.sin(a) * 0.08 * S], [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], (0.55 + rng() * 0.45) * S, 0.05 * S, 2);
  }
  const wg = mergeGeometries(twigs); twigs.forEach((t) => t.dispose());
  const parts = [paint(wg, pal.deadWood, pal.deadWoodTip, rng, { ao: 0.55, jitter: 0.1, y0: 0, y1: 1.1 * S })];
  if (o.leaves) {
    for (const t of tipsOut) {
      if (rng() < 0.35) continue;
      const g = ico((0.1 + rng() * 0.1) * S, 0, rng, 0.2);
      g.scale(1, 0.7, 1); g.translate(t[0], t[1], t[2]);
      parts.push(paint(g, pal.sageDark, pal.sageLight, rng, { ao: 0.2, jitter: 0.1, flutter: 1 }));
    }
  }
  return finish(parts, { height: 1.2 * S, amp: 0.03 * S, flutter: 0.02 });
}

/** Golden bunch-grass tuft (two-sided curved blades). o: { size, blades } */
export function makeGrassTuft(rng, pal, o = {}) {
  const S = o.size ?? 1, n = o.blades ?? (14 + Math.floor(rng() * 10)), parts = [];
  const root = C(pal.grassRoot), tip = C(pal.grassTip);
  for (let i = 0; i < n; i++) {
    const h = (0.38 + rng() * 0.45) * S, w = (0.035 + rng() * 0.025) * S, out = 0.15 + rng() * 0.75;
    const p0 = [0, 0], p1 = [Math.sin(out) * h * 0.5, Math.cos(out) * h * 0.5], p2 = [Math.sin(out * 1.7) * h, Math.cos(out * 1.5) * h * 0.95];
    const w1 = w * 0.65;
    let g = tris([
      p0[0], p0[1], -w, p1[0], p1[1], -w1, p1[0], p1[1], w1,
      p0[0], p0[1], -w, p1[0], p1[1], w1, p0[0], p0[1], w,
      p1[0], p1[1], -w1, p2[0], p2[1], 0, p1[0], p1[1], w1,
    ]);
    g = twoSided(g);
    const a = rng() * TAU, d = rng() * 0.12 * S;
    g.rotateY(a); g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    const v = 0.88 + rng() * 0.24, sage = rng() < 0.15 ? 0.25 : 0;
    const tc = tip.clone().multiplyScalar(v); if (sage) tc.lerp(C(pal.sageLight), sage);
    parts.push(paint(g, root.getHex(), tc.getHex(), rng, { ao: 0.35, jitter: 0.06, flutter: 1, y0: 0, y1: h }));
  }
  return finish(parts, { height: 0.75 * S, amp: 0.08 * S, flutter: 0.025 });
}

/**
 * Salt-pan crust: a jittered hexagonal net of low raised ridges (the polygon crust of a dried lake),
 * fading out toward the rim. Lies on y = 0 (place it at the pan floor). o: { radius, cell }
 */
export function makeSaltCrust(rng, pal, o = {}) {
  const R = o.radius ?? 6, a = o.cell ?? 1.35, pos = [];
  const h = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
  const P = (i, j) => [i * a + j * a / 2, j * a * Math.sqrt(3) / 2];
  const cen = (i, j, up) => {
    const t = up ? [P(i, j), P(i + 1, j), P(i, j + 1)] : [P(i + 1, j), P(i, j + 1), P(i + 1, j + 1)];
    const k = up ? 0 : 1, jx = (h(i, j, k) - 0.5) * a * 0.45, jz = (h(i, j, k + 7) - 0.5) * a * 0.45;
    return [(t[0][0] + t[1][0] + t[2][0]) / 3 + jx, (t[0][1] + t[1][1] + t[2][1]) / 3 + jz];
  };
  const n = Math.ceil(R / a) + 3, cx = -1.5 * n * a, cz = -n * a * Math.sqrt(3) / 2;
  const ridge = (p, q) => {
    const ax = p[0] + cx, az = p[1] + cz, bx = q[0] + cx, bz = q[1] + cz;
    const m = Math.hypot((ax + bx) / 2, (az + bz) / 2);
    if (m > R * 0.97) return;
    const k = 1 - smooth(R * 0.7, R * 0.97, m), w = 0.07 + 0.05 * k, ht = 0.035 + 0.06 * k;
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, px = -dz / l * w, pz = dx / l * w;
    pos.push(ax + px, 0, az + pz, bx + px, 0, bz + pz, ax, ht, az, bx + px, 0, bz + pz, bx, ht, bz, ax, ht, az);
    pos.push(ax - px, 0, az - pz, ax, ht, az, bx - px, 0, bz - pz, bx - px, 0, bz - pz, ax, ht, az, bx, ht, bz);
  };
  for (let i = -1; i < 2 * n; i++) for (let j = -1; j < 2 * n; j++) {
    const u = cen(i, j, true);
    ridge(u, cen(i, j, false)); ridge(u, cen(i - 1, j, false)); ridge(u, cen(i, j - 1, false));
  }
  const g = orientOut(tris(pos), (x, y, z) => [x, -1, z]);
  paint(g, pal.saltDark ?? 0xb8aa8c, pal.salt ?? 0xe0d6bc, rng, { ao: 0.2, jitter: 0.05, y0: 0, y1: 0.08 });
  return finish([g]);
}

/** Bleached driftwood log on the dry riverbed (along local X). */
export function makeDriftwood(rng, pal, o = {}) {
  const L = o.length ?? 2.6, r = 0.16 + rng() * 0.08, parts = [];
  const body = tube([[-L / 2, r * 0.7, 0], [-L / 6, r * 0.85, (rng() - 0.5) * 0.3], [L / 6, r * 0.8, (rng() - 0.5) * 0.3], [L / 2, r * 0.6, 0]], r, r * 0.6, 6, 6);
  parts.push(paint(body, pal.deadWood, pal.deadWoodTip, rng, { ao: 0.5, jitter: 0.08, y0: 0, y1: r * 1.8 }));
  for (let i = 0; i < 2; i++) {
    const x = (rng() - 0.3) * L * 0.6, a = (rng() - 0.5) * 2;
    parts.push(paint(beam([x, r, 0], [x + Math.cos(a) * 0.6, r + 0.25 + rng() * 0.3, Math.sin(a) * 0.6 + 0.2], 0.06, 0.02, 4), pal.deadWood, pal.deadWoodTip, rng, { ao: 0.2 }));
  }
  // root ball stub
  const rb = ico(r * 1.6, 0, rng, 0.3);
  rb.scale(0.6, 1, 1); rb.translate(-L / 2 - r * 0.4, r * 0.9, 0);
  parts.push(paint(rb, pal.deadWood, pal.deadWoodTip, rng, { ao: 0.4 }));
  return finish(parts);
}

// =====================================================================================
//  Bones
// =====================================================================================

/** Giant horned beast skull lying on the ground, facing +Z (≈ 2.6 m long at size 1). o: { size, horns } */
export function makeBeastSkull(rng, pal, o = {}) {
  const S = o.size ?? 1, parts = [], dark = pal.socket ?? 0x2a2018;
  const bone = (g, ao = 0.45) => paint(g, pal.boneDark, pal.bone, rng, { ao, jitter: 0.05, y0: 0, y1: 1.0 * S });
  const cr = ico(0.62 * S, 1, rng, 0.07);
  cr.scale(1.05, 0.78, 1.0); cr.translate(0, 0.42 * S, -0.2 * S);
  parts.push(bone(cr));
  const brow = prep(new THREE.BoxGeometry(1.15 * S, 0.2 * S, 0.34 * S));
  brow.rotateX(-0.2); brow.translate(0, 0.66 * S, 0.12 * S);
  parts.push(bone(brow, 0.2));
  const sn = cyl(0.24 * S, 0.44 * S, 1.4 * S, 7);
  sn.scale(1, 1, 0.66); sn.rotateX(Math.PI / 2 + 0.12); sn.translate(0, 0.32 * S, 0.78 * S);
  parts.push(bone(sn));
  for (const s of [-1, 1]) {
    const e = ico(0.17 * S, 0, rng, 0.1);
    e.scale(1, 0.85, 0.7); e.translate(s * 0.36 * S, 0.54 * S, 0.24 * S);
    parts.push(paintFlat(e, dark, rng, { jitter: 0 }));
    // cheek bone
    parts.push(bone(beam([s * 0.48 * S, 0.3 * S, 0.0], [s * 0.3 * S, 0.22 * S, 0.9 * S], 0.09 * S, 0.06 * S, 5), 0.3));
    // teeth
    for (let k = 0; k < 4; k++) {
      const t = prep(new THREE.ConeGeometry(0.045 * S, 0.2 * S, 4));
      t.rotateX(Math.PI); t.translate(s * (0.22 - k * 0.02) * S, 0.08 * S, (0.5 + k * 0.22) * S);
      parts.push(paintFlat(t, pal.bone, rng, { jitter: 0.06 }));
    }
    // lower jaw (askew)
    parts.push(bone(beam([s * 0.42 * S, 0.1 * S, -0.15 * S], [s * 0.18 * S, 0.06 * S, (1.25 + rng() * 0.1) * S], 0.08 * S, 0.05 * S, 5), 0.3));
    if (o.horns !== false) {
      const h = tube([[s * 0.5 * S, 0.62 * S, -0.2 * S], [s * 1.15 * S, 0.8 * S, -0.42 * S], [s * 1.7 * S, 1.25 * S, -0.2 * S], [s * 1.85 * S, 1.8 * S, 0.3 * S]], 0.2 * S, 0.025 * S, 6, 10);
      parts.push(paint(h, pal.horn, pal.bone, rng, { ao: 0.2, jitter: 0.05 }));
    }
  }
  const nose = prep(new THREE.BoxGeometry(0.16 * S, 0.1 * S, 0.2 * S));
  nose.translate(0, 0.47 * S, 1.3 * S);
  parts.push(paintFlat(nose, dark, rng, { jitter: 0 }));
  return finish(parts);
}

/**
 * Giant ribcage + spine of a fallen beast (spine along local X, head end +X), half buried.
 * o: { length, ribs }
 */
export function makeRibcage(rng, pal, o = {}) {
  const L = o.length ?? 7, nR = o.ribs ?? 7, parts = [];
  const bone = (g, ao = 0.4) => paint(g, pal.boneDark, pal.bone, rng, { ao, jitter: 0.05, y0: -0.2, y1: 2.6 });
  const spineY = (x) => { const t = x / L + 0.5; return -0.2 + 2.6 * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.92 + 0.02))) ** 0.8; };
  const sp = [];
  for (let i = 0; i <= 10; i++) { const x = (i / 10 - 0.5) * L; sp.push([x, spineY(x), 0]); }
  parts.push(bone(tube(sp, 0.13, 0.09, 6, 16)));
  // vertebrae knobs + dorsal spines
  for (let i = 1; i < 14; i++) {
    const x = (i / 14 - 0.5) * L, y = spineY(x);
    const v = ico(0.17, 0, rng, 0.1); v.scale(0.8, 0.9, 1.1); v.translate(x, y, 0);
    parts.push(bone(v, 0.2));
    if (i > 2 && i < 12) {
      const d = prep(new THREE.ConeGeometry(0.06, 0.35 + Math.sin(i / 14 * Math.PI) * 0.35, 4));
      d.rotateZ(0.35); d.translate(x - 0.05, y + 0.28, 0);
      parts.push(bone(d, 0.1));
    }
  }
  // rib pairs
  for (let i = 0; i < nR; i++) {
    const t = (i + 0.5) / nR, x = (-0.3 + t * 0.62) * L, ys = spineY(x), w = 1.2 + Math.sin(Math.PI * t) * 0.8;
    for (const s of [-1, 1]) {
      if (rng() < 0.12) continue;                                  // a missing rib
      const broken = rng() < 0.25;
      const pts = [[x, ys, 0], [x + 0.12, ys + 0.12, s * w * 0.62], [x + 0.25, ys * 0.62, s * w], [x + 0.32, ys * 0.2, s * w * 0.9]];
      if (!broken) pts.push([x + 0.36, -0.3, s * w * 0.68]);
      parts.push(bone(tube(pts, 0.11, broken ? 0.07 : 0.05, 5, broken ? 7 : 9)));
    }
  }
  return finish(parts);
}

/** A few scattered long bones + a small horned skull (decoration). */
export function makeBonePile(rng, pal, o = {}) {
  const parts = [], n = 3 + Math.floor(rng() * 3), S = o.size ?? 1;
  const bone = (g) => paint(g, pal.boneDark, pal.bone, rng, { ao: 0.35, jitter: 0.05, y0: 0, y1: 0.4 });
  for (let i = 0; i < n; i++) {
    const L = (0.5 + rng() * 0.6) * S, a = rng() * TAU, cx = (rng() - 0.5) * 1.2 * S, cz = (rng() - 0.5) * 1.2 * S;
    const r = 0.05 * S, y = r * 0.9;
    const p0 = [cx - Math.cos(a) * L / 2, y, cz - Math.sin(a) * L / 2], p1 = [cx + Math.cos(a) * L / 2, y + (rng() - 0.3) * 0.1, cz + Math.sin(a) * L / 2];
    parts.push(bone(beam(p0, p1, r, r * 0.9, 5)));
    for (const p of [p0, p1]) { const k = ico(r * 1.8, 0, rng, 0.15); k.translate(p[0], p[1], p[2]); parts.push(bone(k)); }
  }
  if (o.skull !== false && rng() < 0.7) {
    const sk = ico(0.17 * S, 1, rng, 0.06); sk.scale(0.9, 0.75, 1.25); sk.translate(0.3 * S, 0.1 * S, 0.2 * S);
    parts.push(bone(sk));
    for (const s of [-1, 1]) {
      const e = ico(0.045 * S, 0, rng, 0); e.translate(0.3 * S + s * 0.08 * S, 0.15 * S, 0.36 * S);
      parts.push(paintFlat(e, 0x2a2018, rng, { jitter: 0 }));
      const h = tube([[0.3 * S + s * 0.1 * S, 0.17 * S, 0.12 * S], [0.3 * S + s * 0.32 * S, 0.25 * S, 0.0], [0.3 * S + s * 0.4 * S, 0.45 * S, 0.12 * S]], 0.04 * S, 0.01 * S, 4, 5);
      parts.push(paint(h, pal.horn, pal.bone, rng, { ao: 0.1 }));
    }
  }
  return finish(parts);
}

// =====================================================================================
//  Orc warband camp (dark olive / iron / hide, teal accents)
// =====================================================================================

// Sigils on banner cloth, (u, v) in [0,1], v = 0 at the top.
const SIGILS = {
  fangs: (u, v) => { for (const cu of [0.33, 0.67]) { if (v > 0.24 && v < 0.74 && Math.abs(u - cu) < 0.13 * (0.74 - v) / 0.5) return true; } return v > 0.18 && v < 0.27 && u > 0.2 && u < 0.8; },
  eye: (u, v) => { const d = Math.abs(u - 0.5) / 0.32 + Math.abs(v - 0.45) / 0.22; return (d < 1 && d > 0.6) || Math.hypot(u - 0.5, (v - 0.45) * 1.3) < 0.08; },
  claw: (u, v) => { if (v < 0.2 || v > 0.74) return false; for (let k = 0; k < 3; k++) { const d = (u - 0.22 - k * 0.24) + (v - 0.47) * 0.45; if (Math.abs(d) < 0.06) return true; } return false; },
  tusk: (u, v) => { const r = Math.hypot(u - 0.5, (v - 0.62) * 1.1); return (r < 0.3 && r > 0.18 && v > 0.62) || (Math.abs(u - 0.5) < 0.06 && v > 0.2 && v < 0.5); },
};

/** Cloth panel hanging from y = top, x in [-W/2, W/2]; teal sigil + trim; tattered hem. Flutters from the hem. */
function bannerCloth(rng, pal, { W, L, top, sigil = 'fangs', cols = 8, rows = 12, base, z = 0.05 }) {
  const pos = [], P = (i, j) => {
    const u = i / cols, v = j / rows;
    const hem = j === rows ? (i % 2 === 0 ? 0.14 : -0.06) * L / 2 + (rng() - 0.5) * 0.05 : 0;
    const taper = 1 - v * 0.12;
    return [(u - 0.5) * W * taper, top - v * L - hem, z + Math.sin(Math.PI * u) * 0.06 + v * v * 0.08];
  };
  const grid = [];
  for (let j = 0; j <= rows; j++) { const row = []; for (let i = 0; i <= cols; i++) row.push(P(i, j)); grid.push(row); }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
    pos.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const g = twoSided(tris(pos));
  const fn = SIGILS[sigil] ?? SIGILS.fangs, base_ = C(base ?? pal.cloth), teal = C(pal.teal), trim = C(pal.iron);
  paintFn(g, (x, y, zz, nx, ny, nz, out) => {
    const u = x / W + 0.5, v = (top - y) / L;
    if (v < 0.08) out.copy(teal).multiplyScalar(0.8);
    else if (u < 0.07 || u > 0.93) out.copy(trim);
    else if (fn(u, v)) out.copy(teal);
    else out.copy(base_);
    out.multiplyScalar(0.92 + rng() * 0.12);
    return 1;
  });
  g.userData.sway = (x, y) => { const d = Math.min(1, Math.max(0, (top - y) / L)); return [0.22 * d * d, 0.07 * d]; };
  return g;
}

/** Warband war banner: tall pole, crossbar, horned top, dark cloth with a teal sigil. o: { sigil, height } */
export function makeWarBanner(rng, pal, o = {}) {
  const H = o.height ?? 4.2, parts = [];
  parts.push(paint(cyl(0.055, 0.085, H, 6).translate(0, H / 2, 0), pal.wood, pal.woodTop, rng, { ao: 0.4 }));
  parts.push(paintFlat(beam([-0.68, H - 0.3, 0], [0.68, H - 0.3, 0], 0.04, 0.04, 5), pal.wood, rng));
  // iron spear tip + bone horns on top
  parts.push(paintFlat(prep(new THREE.ConeGeometry(0.08, 0.42, 4)).translate(0, H + 0.2, 0), pal.ironLight, rng));
  for (const s of [-1, 1]) {
    parts.push(paint(tube([[s * 0.05, H - 0.15, 0], [s * 0.3, H, 0], [s * 0.36, H + 0.32, 0]], 0.045, 0.01, 4, 5), pal.horn, pal.bone, rng, { ao: 0 }));
    // rope ends dangling from the bar
    parts.push(paintFlat(beam([s * 0.64, H - 0.3, 0], [s * 0.66, H - 0.75, 0.02], 0.015, 0.012, 3), pal.rope, rng, { flutter: 1 }));
  }
  parts.push(bannerCloth(rng, pal, { W: 1.15, L: 2.0, top: H - 0.32, sigil: o.sigil }));
  return finishX(parts, { height: H, amp: 0.03, flutter: 0 });
}

/** War drums: a big hide drum on stubby legs (iron hoops, teal band, laced) + a small one + sticks. */
export function makeWarDrum(rng, pal) {
  const parts = [];
  const drum = (R, Hh, y0, x, z, legs) => {
    const b = cyl(R, R * 0.88, Hh, 12, 2);
    { const q = b.attributes.position; for (let i = 0; i < q.count; i++) { const k = 1 + 0.08 * Math.cos((q.getY(i) / Hh) * Math.PI); q.setX(i, q.getX(i) * k); q.setZ(i, q.getZ(i) * k); } }
    b.translate(x, y0 + Hh / 2, z);
    parts.push(paint(b, pal.wood, pal.woodTop, rng, { ao: 0.35, jitter: 0.1 }));
    const band = prep(new THREE.CylinderGeometry(R * 1.09, R * 1.07, Hh * 0.18, 12, 1, true));
    band.translate(x, y0 + Hh * 0.5, z);
    parts.push(paintFlat(band, pal.teal, rng, { jitter: 0.06 }));
    for (const t of [0.04, 0.96]) {
      const hoop = prep(new THREE.CylinderGeometry(R * (t > 0.5 ? 1.03 : 0.93), R * (t > 0.5 ? 1.03 : 0.93), Hh * 0.08, 12, 1, true));
      hoop.translate(x, y0 + Hh * t, z);
      parts.push(paintFlat(hoop, pal.iron, rng, { jitter: 0.05 }));
    }
    const skin = prep(new THREE.CircleGeometry(R * 1.0, 12));
    skin.rotateX(-Math.PI / 2); skin.translate(x, y0 + Hh + 0.01, z);
    parts.push(paint(skin, pal.hide, 0xcdb48c, rng, { ao: 0, jitter: 0.04 }));
    // zig-zag lacing
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU;
      const r0 = R * 1.08;
      parts.push(paintFlat(beam([x + Math.cos(a0) * r0, y0 + Hh * 0.96, z + Math.sin(a0) * r0], [x + Math.cos(a1) * r0 * 0.97, y0 + Hh * 0.6, z + Math.sin(a1) * r0 * 0.97], 0.015, 0.015, 3), pal.rope, rng));
    }
    if (legs) for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      parts.push(paintFlat(beam([x + Math.cos(a) * R * 0.6, y0 + 0.05, z + Math.sin(a) * R * 0.6], [x + Math.cos(a) * R * 1.05, -0.05, z + Math.sin(a) * R * 1.05], 0.07, 0.06, 5), pal.wood, rng));
    }
  };
  drum(0.66, 0.9, 0.45, 0, 0, true);
  drum(0.38, 0.5, 0, 1.05, 0.35, false);
  for (const s of [-1, 1]) {
    const a = [0.35 * s, 0.02, 0.85], b = [0.15 * s, 1.0, 0.58];
    parts.push(paintFlat(beam(a, b, 0.035, 0.03, 4), pal.wood, rng));
    const k = ico(0.08, 0, rng, 0.1); k.translate(b[0], b[1], b[2]);
    parts.push(paintFlat(k, pal.bone, rng));
  }
  // a small skull lashed to the front
  const sk = ico(0.14, 1, rng, 0.05); sk.scale(0.9, 0.85, 0.8); sk.translate(0, 0.9, 0.72);
  parts.push(paintFlat(sk, pal.bone, rng, { jitter: 0.05 }));
  for (const s of [-1, 1]) { const e = ico(0.035, 0, rng, 0); e.translate(s * 0.05, 0.93, 0.82); parts.push(paintFlat(e, 0x241a12, rng, { jitter: 0 })); }
  return finish(parts);
}

/** Crude watchtower: splayed log legs, X-braces, plank platform, spiked rail, hide roof, ladder, pennant. */
export function makeWatchtower(rng, pal) {
  const parts = [], Pf = 4.8, B = 1.5, T = 1.02, Htop = Pf + 1.45;
  const legAt = (sx, sz, y) => { const t = y / Htop, w = B + (T - B) * t; return [sx * w, y, sz * w]; };
  const wood = (g, ao = 0.35) => paint(g, pal.wood, pal.woodTop, rng, { ao, jitter: 0.12 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const j = () => (rng() - 0.5) * 0.12;
    parts.push(wood(beam([sx * B + j(), -0.2, sz * B + j()], [sx * T, Htop, sz * T], 0.15, 0.11, 6)));
  }
  const sides = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  for (const [p, q] of sides) {
    parts.push(wood(beam(legAt(p[0], p[1], 0.5), legAt(q[0], q[1], Pf - 0.35), 0.06, 0.06, 4), 0.2));
    parts.push(wood(beam(legAt(q[0], q[1], 0.5), legAt(p[0], p[1], Pf - 0.35), 0.06, 0.06, 4), 0.2));
    parts.push(wood(beam(legAt(p[0], p[1], 2.5), legAt(q[0], q[1], 2.5), 0.07, 0.07, 4), 0.2));
  }
  // platform planks
  const pw = T * 2 + 0.5;
  for (let i = 0; i < 6; i++) {
    const pl = prep(new THREE.BoxGeometry(pw / 6 - 0.02, 0.12, pw + (rng() - 0.5) * 0.25));
    pl.translate(-pw / 2 + (i + 0.5) * pw / 6, Pf + (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.1);
    parts.push(paint(pl, pal.wood, pal.woodTop, rng, { ao: 0.25, jitter: 0.14 }));
  }
  // spiked rail
  for (const [p, q] of sides) {
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6, x = (p[0] + (q[0] - p[0]) * t) * (pw / 2 - 0.05), z = (p[1] + (q[1] - p[1]) * t) * (pw / 2 - 0.05);
      const h = 0.75 + rng() * 0.2;
      parts.push(wood(cyl(0.05, 0.055, h, 5).translate(x, Pf + h / 2, z), 0.2));
      parts.push(paintFlat(prep(new THREE.ConeGeometry(0.055, 0.22, 5)).translate(x, Pf + h + 0.11, z), pal.woodTop, rng));
    }
    parts.push(wood(beam([p[0] * (pw / 2), Pf + 0.55, p[1] * (pw / 2)], [q[0] * (pw / 2), Pf + 0.55, q[1] * (pw / 2)], 0.04, 0.04, 4), 0.1));
  }
  // hide roof (4-sided) + iron spike + pennant
  const roof = prep(new THREE.ConeGeometry(T * 1.85, 1.5, 4, 1, true));
  roof.rotateY(Math.PI / 4); roof.translate(0, Htop + 0.6, 0);
  paint(roof, pal.hideDark, pal.hide, rng, { ao: 0.35, jitter: 0.16 });
  parts.push(roof);
  const under = prep(new THREE.ConeGeometry(T * 1.83, 1.48, 4, 1, true));
  under.rotateY(Math.PI / 4); under.scale(-1, 1, 1); under.translate(0, Htop + 0.59, 0);
  parts.push(paintFlat(under, pal.hideDark, rng));
  parts.push(paintFlat(prep(new THREE.ConeGeometry(0.07, 0.6, 4)).translate(0, Htop + 1.6, 0), pal.ironLight, rng));
  parts.push(paintFlat(beam([0, Htop + 1.2, 0], [0, Htop + 2.3, 0], 0.03, 0.025, 4), pal.wood, rng));
  {
    let pen = tris([0, Htop + 2.25, 0, 0.9, Htop + 2.02, 0.02, 0, Htop + 1.8, 0]);
    pen = twoSided(pen);
    paintFlat(pen, pal.teal, rng, { flutter: 1 });
    pen.userData.sway = (x) => [0.15 * Math.min(1, x / 0.9), 0.06 * Math.min(1, x / 0.9)];
    parts.push(pen);
  }
  // ladder on +Z
  for (const s of [-1, 1]) parts.push(wood(beam([s * 0.32, 0, B + 0.55], [s * 0.3, Pf + 0.2, T + 0.3], 0.045, 0.04, 4), 0.2));
  for (let i = 1; i < 12; i++) {
    const t = i / 12, y = t * (Pf + 0.2), z = B + 0.55 + (T + 0.3 - B - 0.55) * t;
    parts.push(wood(beam([-0.32, y, z], [0.32, y, z], 0.025, 0.025, 3), 0.1));
  }
  // shield hung on the rail (teal boss)
  const sh = prep(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10));
  sh.rotateX(Math.PI / 2); sh.translate(0.45, Pf + 0.45, -pw / 2 - 0.06);
  parts.push(paint(sh, pal.hideDark, pal.hide, rng, { ao: 0, jitter: 0.1 }));
  const boss = prep(new THREE.SphereGeometry(0.12, 6, 3, 0, TAU, 0, Math.PI / 2));
  boss.rotateX(-Math.PI / 2); boss.translate(0.45, Pf + 0.45, -pw / 2 - 0.1);
  parts.push(paintFlat(boss, pal.teal, rng));
  return finishX(parts, { height: Htop + 2.3, amp: 0.02, flutter: 0 });
}

/** Orc ridge tent: patchy hides over a ridge pole, crossed end poles, teal war-paint stripe, tusks at the door (+Z). o: { size } */
export function makeOrcTent(rng, pal, o = {}) {
  const S = o.size ?? 1, Lx = 2.9 * S, w = 1.35 * S, h = 2.0 * S, nx = 5, nt = 3, parts = [];
  // hull along Z (door at +Z): slopes on ±X
  const pos = [];
  const V = (s, i, t) => {
    const u = i / nx, z = (u - 0.5) * Lx;
    const sag = 0.16 * S * Math.sin(Math.PI * u) * (1 - t);
    return [s * (w * t + 0.12 * S * t * t), h * (1 - t) - sag, z];
  };
  for (const s of [-1, 1]) for (let i = 0; i < nx; i++) for (let k = 0; k < nt; k++) {
    const t0 = k / nt, t1 = (k + 1) / nt;
    const a = V(s, i, t0), b = V(s, i + 1, t0), c = V(s, i, t1), d = V(s, i + 1, t1);
    pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  // gable ends
  for (const e of [0, nx]) {
    const top = V(1, e, 0), l = V(-1, e, 1), r = V(1, e, 1);
    pos.push(...top, ...l, ...r);
  }
  const hull = orientOut(tris(pos), (x, y, z) => [0, Math.min(y, h * 0.3), z * 0.2]);
  const hide = C(pal.hide), hideD = C(pal.hideDark), teal = C(pal.teal);
  const stripeK = 1 + Math.floor(rng() * 2);
  paintFn(hull, (x, y, z, nX, nY, nZ, out) => {
    const t = 1 - y / h;
    out.copy(hideD).lerp(hide, smooth(0, 0.9, 1 - t * 0.85));
    if (rng() < 0.3) out.multiplyScalar(0.78 + rng() * 0.12);
    if (Math.abs(nZ) < 0.5 && x > 0 && Math.abs(t - (stripeK + 0.5) / nt) < 0.5 / nt && Math.abs(z) < Lx * 0.42) out.copy(teal).multiplyScalar(0.85);
    out.multiplyScalar(0.93 + rng() * 0.1);
    return 0;
  });
  parts.push(hull);
  // door
  const door = tris([0, h * 0.72, Lx / 2 + 0.02, -0.42 * S, 0, Lx / 2 + 0.02, 0.42 * S, 0, Lx / 2 + 0.02]);
  parts.push(paintFlat(orientOut(door, () => [0, h * 0.3, 0]), 0x231a12, rng, { jitter: 0 }));
  // ridge pole + crossed end poles
  parts.push(paintFlat(beam([0, h - 0.02, -Lx / 2 - 0.35], [0, h - 0.02, Lx / 2 + 0.35], 0.05 * S, 0.05 * S, 5), pal.wood, rng));
  for (const e of [-1, 1]) for (const s of [-1, 1]) {
    parts.push(paintFlat(beam([s * w * 0.75, -0.05, e * Lx / 2], [-s * 0.45 * S, h + 0.55 * S, e * (Lx / 2 + 0.1)], 0.05 * S, 0.04 * S, 4), pal.wood, rng));
  }
  // tusks flanking the door
  for (const s of [-1, 1]) {
    const tk = tube([[s * 0.8 * S, -0.05, Lx / 2 + 0.45 * S], [s * 0.85 * S, 0.8 * S, Lx / 2 + 0.6 * S], [s * 0.55 * S, 1.45 * S, Lx / 2 + 0.45 * S]], 0.1 * S, 0.02 * S, 5, 6);
    parts.push(paint(tk, pal.boneDark, pal.bone, rng, { ao: 0.2 }));
  }
  return finish(parts, { height: h, amp: 0.015, flutter: 0 });
}

/** Orc hide hut: a squat dome of stitched hides over bent bone ribs, teal war-paint band, smoke hole, door at +Z. o: { size } */
export function makeOrcHut(rng, pal, o = {}) {
  const S = o.size ?? 1, R = 1.75 * S, H = 1.95 * S, parts = [];
  const dome = prep(new THREE.SphereGeometry(R, 14, 5, 0, TAU, 0, Math.PI / 2));
  dome.scale(1, H / R, 1);
  {
    const q = dome.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i), a = Math.atan2(z, x);
      const sag = 1 - 0.07 * Math.abs(Math.sin(a * 2)) * Math.sin(Math.PI * Math.min(1, y / H));
      q.setXYZ(i, x * sag, y + (y < 0.05 ? (rng() - 0.5) * 0.06 : 0), z * sag);
    }
  }
  const hide = C(pal.hide), hideD = C(pal.hideDark), teal = C(pal.teal);
  paintFn(dome, (x, y, z, nx, ny, nz, out) => {
    if (z > 0 && Math.abs(x) < 0.5 * S && y < 1.1 * S) { out.set(0x231a12); return 0; }        // door
    if (y > H * 0.93) { out.set(0x2a2019); return 0; }                                           // smoke hole
    out.copy(hideD).lerp(hide, smooth(0, H * 0.8, y));
    if (rng() < 0.3) out.multiplyScalar(0.76 + rng() * 0.14);
    if (y > H * 0.42 && y < H * 0.62) out.lerp(teal, 0.85);
    out.multiplyScalar(0.93 + rng() * 0.1);
    return 0;
  });
  parts.push(dome);
  // bone ribs over the dome
  for (let k = 0; k < 3; k++) {
    const yawR = (k / 3) * Math.PI + 0.3, c = Math.cos(yawR), s = Math.sin(yawR), pts = [];
    for (let i = 0; i <= 6; i++) {
      const ph = (i / 6) * Math.PI, rr = R * 1.04 * Math.cos(ph);
      pts.push([c * rr, Math.sin(ph) * H * 1.04 - 0.05, s * rr]);
    }
    parts.push(paint(tube(pts, 0.065 * S, 0.065 * S, 4, 12), pal.boneDark, pal.bone, rng, { ao: 0.3 }));
  }
  // door frame + tusks + poles out of the smoke hole
  const zf = R * 0.97;
  for (const sx of [-1, 1]) {
    parts.push(paintFlat(beam([sx * 0.52 * S, -0.05, zf], [sx * 0.46 * S, 1.2 * S, zf - 0.25 * S], 0.06 * S, 0.05 * S, 4), pal.wood, rng));
    parts.push(paint(tube([[sx * 0.85 * S, -0.05, zf + 0.25 * S], [sx * 0.9 * S, 0.7 * S, zf + 0.45 * S], [sx * 0.6 * S, 1.3 * S, zf + 0.35 * S]], 0.09 * S, 0.02 * S, 5, 6), pal.boneDark, pal.bone, rng, { ao: 0.2 }));
  }
  parts.push(paintFlat(beam([-0.6 * S, 1.18 * S, zf - 0.22 * S], [0.6 * S, 1.2 * S, zf - 0.22 * S], 0.05 * S, 0.05 * S, 4), pal.wood, rng));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rng();
    parts.push(paintFlat(beam([Math.cos(a) * 0.15 * S, H * 0.8, Math.sin(a) * 0.15 * S], [Math.cos(a) * 0.45 * S, H + 0.55 * S, Math.sin(a) * 0.45 * S], 0.04 * S, 0.03 * S, 4), pal.wood, rng));
  }
  return finish(parts, { height: H, amp: 0.01, flutter: 0 });
}

/** Skull totem: pole, three stacked skulls, crossbar with teal rags and bone charms, horned beast skull on top. */
export function makeSkullTotem(rng, pal) {
  const parts = [], H = 3.3;
  parts.push(paint(cyl(0.09, 0.13, H, 6).translate(0, H / 2, 0), pal.wood, pal.woodTop, rng, { ao: 0.4 }));
  for (let i = 0; i < 3; i++) {
    const y = 1.3 + i * 0.48, rot = (rng() - 0.5) * 0.6;
    const sk = ico(0.2, 1, rng, 0.06); sk.scale(0.95, 0.85, 1.0); sk.rotateY(rot); sk.translate(0, y, 0.05);
    parts.push(paint(sk, pal.boneDark, pal.bone, rng, { ao: 0.35 }));
    const jaw = prep(new THREE.BoxGeometry(0.22, 0.08, 0.16)); jaw.rotateY(rot); jaw.translate(Math.sin(rot) * 0.12, y - 0.17, 0.05 + Math.cos(rot) * 0.12);
    parts.push(paintFlat(jaw, pal.bone, rng));
    for (const s of [-1, 1]) {
      const e = ico(0.05, 0, rng, 0);
      e.translate(Math.cos(rot) * s * 0.075 + Math.sin(rot) * 0.18, y + 0.02, 0.05 - Math.sin(rot) * s * 0.075 + Math.cos(rot) * 0.18);
      parts.push(paintFlat(e, 0x221810, rng, { jitter: 0 }));
    }
  }
  const yb = H - 0.35;
  parts.push(paintFlat(beam([-0.6, yb, 0], [0.6, yb + 0.05, 0], 0.035, 0.035, 4), pal.wood, rng));
  for (let i = 0; i < 4; i++) {
    const x = -0.5 + i * 0.33, L = 0.45 + rng() * 0.35;
    if (i % 2 === 0) {
      let r = tris([x - 0.06, yb, 0.03, x + 0.06, yb, 0.03, x + (rng() - 0.5) * 0.06, yb - L, 0.05]);
      r = twoSided(r);
      paintFlat(r, i === 2 ? pal.cloth : pal.teal, rng, { flutter: 1 });
      r.userData.sway = (xx, y) => { const d = Math.min(1, (yb - y) / L); return [0.12 * d, 0.05 * d]; };
      parts.push(r);
    } else {
      const k = ico(0.06, 0, rng, 0.2); k.scale(0.7, 1.3, 0.7); k.translate(x, yb - 0.28, 0.02);
      parts.push(paintFlat(k, pal.bone, rng));
      parts.push(paintFlat(beam([x, yb, 0.02], [x, yb - 0.22, 0.02], 0.01, 0.01, 3), pal.rope, rng));
    }
  }
  // horned beast skull on top
  const top = ico(0.26, 1, rng, 0.05); top.scale(0.9, 0.75, 1.3); top.translate(0, H + 0.12, 0.08);
  parts.push(paint(top, pal.boneDark, pal.bone, rng, { ao: 0.3 }));
  for (const s of [-1, 1]) {
    parts.push(paint(tube([[s * 0.15, H + 0.2, 0], [s * 0.55, H + 0.3, -0.12], [s * 0.72, H + 0.65, 0.05]], 0.07, 0.015, 5, 6), pal.horn, pal.bone, rng, { ao: 0.1 }));
    const e = ico(0.05, 0, rng, 0); e.translate(s * 0.1, H + 0.16, 0.36);
    parts.push(paintFlat(e, 0x221810, rng, { jitter: 0 }));
  }
  return finishX(parts, { height: H, amp: 0, flutter: 0 });
}

/** Cheval-de-frise: a log on trestles with sharpened stakes crossing in X's (spikes face ±Z). o: { length } */
export function makeSpikeBarricade(rng, pal, o = {}) {
  const L = o.length ?? 3.6, parts = [], n = Math.max(2, Math.round(L / 0.85));
  parts.push(paint(beam([-L / 2, 0.55, 0], [L / 2, 0.58, 0], 0.15, 0.14, 7), pal.wood, pal.woodTop, rng, { ao: 0.3 }));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * (L / n) + (rng() - 0.5) * 0.1;
    for (const s of [-1, 1]) {
      const a = [x, -0.05, -s * 0.85], b = [x + (rng() - 0.5) * 0.1, 1.45 + rng() * 0.2, s * 0.95];
      parts.push(paint(beam(a, b, 0.07, 0.06, 5), pal.wood, pal.woodTop, rng, { ao: 0.3, jitter: 0.1 }));
      _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const tip = prep(new THREE.ConeGeometry(0.062, 0.35, 5));
      tip.translate(0, 0.175, 0); tip.applyQuaternion(_q.setFromUnitVectors(_up, _dir)); tip.translate(b[0], b[1], b[2]);
      parts.push(paintFlat(tip, pal.woodTop, rng));
    }
    parts.push(paintFlat(prep(new THREE.BoxGeometry(0.12, 0.2, 0.34)).translate(x, 0.6, 0), pal.rope, rng));
  }
  return finish(parts);
}

/** Weapon rack: A-frame with leaning spears and a round teal-bossed shield. */
export function makeWeaponRack(rng, pal) {
  const parts = [], W = 1.8;
  for (const s of [-1, 1]) {
    parts.push(paintFlat(beam([s * W / 2, 0, -0.45], [s * W / 2, 1.3, 0], 0.05, 0.045, 4), pal.wood, rng));
    parts.push(paintFlat(beam([s * W / 2, 0, 0.45], [s * W / 2, 1.3, 0], 0.05, 0.045, 4), pal.wood, rng));
  }
  parts.push(paintFlat(beam([-W / 2 - 0.1, 1.25, 0], [W / 2 + 0.1, 1.25, 0], 0.04, 0.04, 4), pal.wood, rng));
  for (let i = 0; i < 5; i++) {
    const x = -W / 2 + 0.25 + i * (W - 0.5) / 4 + (rng() - 0.5) * 0.08, lean = 0.3 + rng() * 0.1;
    const a = [x, 0, 0.55], b = [x + (rng() - 0.5) * 0.15, 2.2, 0.55 - Math.tan(lean) * 2.2];
    parts.push(paintFlat(beam(a, b, 0.03, 0.025, 4), pal.woodTop, rng));
    _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const tip = prep(new THREE.ConeGeometry(0.06, 0.32, 4));
    tip.translate(0, 0.16, 0); tip.applyQuaternion(_q.setFromUnitVectors(_up, _dir)); tip.translate(b[0], b[1], b[2]);
    parts.push(paintFlat(tip, pal.ironLight, rng));
  }
  const sh = prep(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 10));
  sh.rotateX(Math.PI / 2 - 0.25); sh.translate(0.55, 0.5, 0.75);
  parts.push(paint(sh, pal.hideDark, pal.hide, rng, { ao: 0, jitter: 0.1 }));
  const rim = prep(new THREE.TorusGeometry(0.46, 0.035, 3, 12));
  rim.rotateX(-0.25); rim.translate(0.55, 0.5, 0.79);
  parts.push(paintFlat(rim, pal.iron, rng));
  const boss = prep(new THREE.SphereGeometry(0.13, 6, 3, 0, TAU, 0, Math.PI / 2));
  boss.rotateX(Math.PI / 2 - 0.25); boss.translate(0.55, 0.5, 0.8);
  parts.push(paintFlat(boss, pal.teal, rng));
  return finish(parts);
}

/** Spit over the fire (two forked posts + bar with a roasting haunch). */
export function makeSpit(rng, pal) {
  const parts = [], W = 1.7;
  for (const s of [-1, 1]) {
    parts.push(paintFlat(beam([s * W / 2, -0.05, 0], [s * W / 2, 1.05, 0], 0.045, 0.04, 4), pal.wood, rng));
    for (const k of [-1, 1]) parts.push(paintFlat(beam([s * W / 2, 1.0, 0], [s * W / 2 + k * 0.1, 1.25, 0], 0.03, 0.02, 3), pal.wood, rng));
  }
  parts.push(paintFlat(beam([-W / 2 - 0.2, 1.08, 0], [W / 2 + 0.25, 1.08, 0], 0.025, 0.025, 4), pal.woodTop, rng));
  const meat = ico(0.24, 1, rng, 0.12); meat.scale(1.5, 0.85, 0.85); meat.translate(0, 1.0, 0);
  parts.push(paint(meat, 0x4a2a18, 0x8a5a32, rng, { ao: 0.3 }));
  const kb = ico(0.07, 0, rng, 0.1); kb.translate(0.42, 1.04, 0);
  parts.push(paintFlat(kb, pal.bone, rng));
  return finish(parts);
}

// =====================================================================================
//  Ambient effects (shader-animated on ENV.uTime; one draw each, no CPU per frame)
// =====================================================================================

/** Smouldering campfire flame (one HDR mesh, flicker in the vertex shader). */
export function makeFireFx(x, y, z, o = {}) {
  const S = o.size ?? 1, geos = [];
  const add = (g, hex, k) => {
    g = prep(g);
    const n = g.attributes.position.count, c = new THREE.Color(hex), col = new Float32Array(n * 3), kk = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; kk[i] = k; }
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
    geos.push(g);
  };
  add(new THREE.ConeGeometry(0.21 * S, 0.62 * S, 6, 1, true).translate(0, 0.31 * S, 0), new THREE.Color(0xff8a28).multiplyScalar(1.45), 0);
  add(new THREE.ConeGeometry(0.12 * S, 0.42 * S, 6, 1, true).translate(0, 0.21 * S, 0), new THREE.Color(0xffd68a).multiplyScalar(1.75), 1);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    add(new THREE.ConeGeometry(0.07 * S, 0.34 * S, 4, 1, true).translate(Math.cos(a) * 0.15 * S, 0.17 * S, Math.sin(a) * 0.15 * S), new THREE.Color(0xff9a34).multiplyScalar(1.4), 2 + i);
  }
  const geo = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: ENV.uTime },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime; attribute vec3 aCol; attribute float aK; varying vec3 vCol;
      void main() {
        vec3 p = position;
        float t = uTime + aK * 1.7;
        float f = 1.0 + sin(t * 13.0) * 0.1 + sin(t * 21.7 + aK) * 0.07;
        p.y *= f * (aK >= 2.0 ? 0.75 + 0.35 * sin(t * 7.0 + aK * 2.0) : 1.0);
        p.x += sin(t * 9.0 + p.y * 6.0) * 0.06 * p.y;
        p.z += cos(t * 8.0 + p.y * 5.0) * 0.06 * p.y;
        float a = uTime * 1.6; p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
        vCol = aCol * (0.9 + 0.1 * sin(t * 17.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env.fire';
  mesh.position.set(x, y, z);
  mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

/** Lazy smoke column (soft low-poly puffs rising, drifting downwind, fading). */
export function makeSmokeFx(x, y, z, o = {}) {
  const n = o.puffs ?? 12, geos = [];
  for (let i = 0; i < n; i++) {
    const g = prep(new THREE.IcosahedronGeometry(0.32, 0));
    const c = g.attributes.position.count, ph = new Float32Array(c).fill(i / n), sd = new Float32Array(c).fill((i * 0.618034) % 1);
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSd', new THREE.BufferAttribute(sd, 1));
    geos.push(g);
  }
  const geo = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  geo.computeVertexNormals();
  const uniforms = { ...ENV, uDark: { value: new THREE.Color(o.dark ?? 0x5a5048) }, uLight: { value: new THREE.Color(o.light ?? 0xb8ab98) }, uRise: { value: o.rise ?? 6 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      ${ENV_PARS}
      uniform float uRise; attribute float aPh; attribute float aSd; varying float vLife; varying float vShade;
      void main() {
        float life = fract(uTime * 0.11 + aPh);
        vLife = life;
        float s = 0.35 + life * 2.1;
        vec3 p = position * s;
        vec3 o = vec3(uWindDir.x, 0.0, uWindDir.y) * life * life * 3.2 * (0.6 + uWindStrength);
        o.xz += vec2(sin(uTime * 0.6 + aSd * 20.0), cos(uTime * 0.5 + aSd * 13.0)) * 0.35 * life;
        o.y = life * uRise + 0.3;
        vec4 wp = modelMatrix * vec4(p + o, 1.0);
        vEnvWorld = wp.xyz;
        vShade = 0.72 + 0.28 * normal.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${ENV_PARS}
      uniform vec3 uDark, uLight; varying float vLife; varying float vShade;
      void main() {
        vec3 c = mix(uDark, uLight, smoothstep(0.0, 0.7, vLife)) * vShade;
        float a = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife)) * 0.55;
        gl_FragColor = vec4(envHaze(c, vEnvWorld), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env.smoke';
  mesh.position.set(x, y, z);
  mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

/**
 * Dust devils: N twisting translucent dust funnels that spin up, wander downwind and die, each
 * cycle at a new spot on a ring around the arena centre. Entirely in the vertex shader; the
 * terrain height comes from the layout mask's A channel. o: { count, mask, r0, r1, color, dark }
 */
export function makeDustDevils(o) {
  const N = o.count ?? 3, RAD = 14, HS = 10, pos = [], loc = [];
  for (let d = 0; d < N; d++) for (let shell = 0; shell < 3; shell++) {
    for (let j = 0; j < HS; j++) for (let i = 0; i < RAD; i++) {
      const a0 = (i / RAD) * TAU, a1 = ((i + 1) / RAD) * TAU, h0 = j / HS, h1 = (j + 1) / HS;
      const quad = [[a0, h0], [a1, h0], [a0, h1], [a1, h0], [a1, h1], [a0, h1]];
      for (const [a, h] of quad) { pos.push(0, h * 8, 0); loc.push(a, h, shell, d); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLoc', new THREE.Float32BufferAttribute(loc, 4));
  const uniforms = {
    ...ENV,
    uMask: { value: o.mask.texture }, uMaskOrigin: { value: o.mask.origin }, uMaskSize: { value: o.mask.size },
    uRing: { value: new THREE.Vector2(o.r0 ?? 30, o.r1 ?? 80) },
    uDust: { value: new THREE.Color(o.color ?? 0xdcc49a) }, uDustDark: { value: new THREE.Color(o.dark ?? 0xa08058) },
    uOpacity: { value: o.opacity ?? 0.62 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      ${ENV_PARS}
      uniform sampler2D uMask; uniform vec2 uMaskOrigin; uniform float uMaskSize; uniform vec2 uRing;
      attribute vec4 aLoc;
      varying float vH; varying float vAng; varying float vLife; varying float vShell;
      float h11(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float d = aLoc.w;
        float per = 19.0 + d * 4.3;
        float ct = uTime / per + d * 0.37;
        float cyc = floor(ct), ph = fract(ct);
        float ang = h11(cyc * 12.9898 + d * 78.233) * 6.2831853;
        float rad = mix(uRing.x, uRing.y, h11(cyc * 39.3468 + d * 11.135));
        vec2 c = vec2(cos(ang), sin(ang)) * rad + uWindDir * (ph - 0.5) * 20.0;
        c += vec2(sin(uTime * 0.7 + d * 3.0), cos(uTime * 0.53 + d * 5.0)) * 1.8;
        float life = smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.68, 1.0, ph));
        float gy = (texture2D(uMask, (c - uMaskOrigin) / uMaskSize).a * 255.0 - 128.0) / 8.0;
        float h = aLoc.y;
        float H = (6.5 + h11(cyc * 7.31 + d) * 4.0) * (0.45 + 0.55 * life);
        float sh = aLoc.z;
        float r = mix(0.22, 2.1, pow(h, 1.35)) * (0.72 + 0.22 * sh) * (0.55 + 0.45 * life);
        if (sh > 1.5) { r = mix(0.9, 2.6, h) * (0.6 + 0.4 * life); H *= 0.12; }    // dust skirt at the foot
        float a = aLoc.x + uTime * (4.2 - h * 1.8) + sh * 1.3;
        vec2 bend = vec2(sin(uTime * 1.3 + h * 2.4 + d), cos(uTime * 1.07 + h * 1.9 + d * 2.0)) * 0.7 * h
                  + uWindDir * h * h * 1.2;
        vec3 wp = vec3(c.x + cos(a) * r + bend.x, gy + h * H, c.y + sin(a) * r + bend.y);
        vEnvWorld = wp; vH = h; vAng = a; vLife = life; vShell = sh;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${ENV_PARS}
      uniform vec3 uDust, uDustDark; uniform float uOpacity;
      varying float vH; varying float vAng; varying float vLife; varying float vShell;
      void main() {
        float s = sin(vAng * 3.0 + vH * 7.0) * 0.5 + 0.5;
        float n = envNoise(vec2(vAng * 1.5 + vH * 3.0, vH * 5.0 - uTime * 1.7));
        float streak = smoothstep(0.25, 0.8, s * 0.65 + n * 0.55);
        float prof = smoothstep(0.0, 0.1, vH) * (1.0 - smoothstep(0.55, 1.0, vH));
        if (vShell > 1.5) prof = (1.0 - smoothstep(0.2, 1.0, vH)) * 0.8;
        float a = (0.22 + 0.78 * streak) * prof * vLife * uOpacity * (vShell > 0.5 && vShell < 1.5 ? 0.7 : 1.0);
        if (a < 0.01) discard;
        vec3 col = mix(uDustDark, uDust, smoothstep(0.05, 0.7, vH) * 0.75 + streak * 0.25);
        gl_FragColor = vec4(envHaze(col, vEnvWorld), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env.dustDevils';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 5;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}
