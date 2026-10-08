import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchEnv, fbm, smooth } from './common.js';

// =====================================================================================
//  Props: procedural low-poly recipes (flat-shaded, vertex-coloured with baked AO gradient and
//  face jitter) + PropBatch, which bakes every placement into world space and merges them into
//  a few chunked meshes (ONE material, per-vertex wind via the aSway attribute, player
//  occlusion dither). All vegetation and static props of a biome cost ~1 draw per visible chunk.
//
//  Recipe contract: a recipe returns a NON-INDEXED BufferGeometry with attributes
//    position, normal, color (linear RGB), sway (vec2: sway metres, flutter metres at that vertex)
//  Build recipes from parts with prep() -> lump() -> paint() and finish(parts, swayOpts).
// =====================================================================================

// ---------- building blocks ----------
/** Non-indexed, position only. */
export function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  return g;
}

/** Radial noise; duplicated vertices move together (no cracks). Geometry should be centred at origin. */
export function lump(geo, amount, rng) {
  const p = geo.attributes.position, seen = new Map(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${Math.round(v.x * 1e3)},${Math.round(v.y * 1e3)},${Math.round(v.z * 1e3)}`;
    let s = seen.get(key);
    if (s === undefined) { s = 1 + (rng() * 2 - 1) * amount; seen.set(key, s); }
    p.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  return geo;
}

/** Duplicate every triangle with reversed winding (double-sided cards in a single-sided material). */
export function twoSided(geo) {
  const p = geo.attributes.position.array, n = p.length;
  const out = new Float32Array(n * 2);
  out.set(p);
  for (let f = 0; f < n; f += 9) {
    out.set(p.subarray(f, f + 3), n + f);
    out.set(p.subarray(f + 6, f + 9), n + f + 3);
    out.set(p.subarray(f + 3, f + 6), n + f + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return g;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ca = new THREE.Color(), _cb = new THREE.Color(), _cm = new THREE.Color(), _cc = new THREE.Color();
/**
 * Per-face colour: bottom->top gradient * baked AO * jitter; optional moss/cap colour on up faces,
 * optional strata bands, optional `flutter` weight (leaves) stored for wind.
 * o: { jitter, ao (0..1 darkness at the bottom), moss, mossAmt, mossUp (normal.y threshold), bands, bandH,
 *      flutter (0/1), y0, y1 (gradient range override), hueJitter }
 */
export function paint(geo, bottom, top, rng, o = {}) {
  const { jitter = 0.08, ao = 0.55, moss = null, mossAmt = 0.8, mossUp = 0.55, bands = null, bandH = 1.5, flutter = 0, hueJitter = 0 } = o;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, p = geo.attributes.position;
  const y0 = o.y0 ?? min.y, y1 = o.y1 ?? max.y;
  const col = new Float32Array(p.count * 3), fl = new Float32Array(p.count);
  _ca.set(bottom); _cb.set(top);
  if (moss !== null) _cm.set(moss);
  const bandCols = bands ? bands.map((h) => new THREE.Color(h)) : null;
  for (let f = 0; f < p.count; f += 3) {
    _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
    const y = (_a.y + _b.y + _c.y) / 3;
    const t = Math.min(1, Math.max(0, (y - y0) / Math.max(y1 - y0, 1e-4)));
    if (bandCols) {
      const L = bandCols.length, n = Math.floor(y / bandH + rng() * 0.15);
      _cc.copy(bandCols[((n % L) + L) % L]);
    } else {
      _cc.copy(_ca).lerp(_cb, t);
    }
    _b.sub(_a); _c.sub(_a);
    const ny = _b.cross(_c).normalize().y;
    if (moss !== null && ny > mossUp) _cc.lerp(_cm, mossAmt * smooth(mossUp, mossUp + 0.3, ny));
    const j = 1 + (rng() * 2 - 1) * jitter;
    const k = (1 - ao) + ao * t;
    if (hueJitter) { const h = (rng() * 2 - 1) * hueJitter; _cc.r *= 1 + h; _cc.b *= 1 - h; }
    _cc.multiplyScalar(k * j);
    for (let q = 0; q < 3; q++) {
      col[(f + q) * 3] = _cc.r; col[(f + q) * 3 + 1] = _cc.g; col[(f + q) * 3 + 2] = _cc.b;
      fl[f + q] = flutter;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('fl', new THREE.BufferAttribute(fl, 1));
  return geo;
}

/** Solid colour (with jitter) — small accents. */
export const paintFlat = (geo, hex, rng, o = {}) => paint(geo, hex, hex, rng, { ao: 0, ...o });

/**
 * Merge painted parts; flat normals; sway attribute from height:
 * sway = amp * (y/height)^2, flutter = flutter * fl * (y/height)^2.
 */
export function finish(parts, { height = 4, amp = 0, flutter = 0, rootY = 0 } = {}) {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  const p = g.attributes.position, fl = g.attributes.fl, n = p.count;
  const sw = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const w = Math.min(1, Math.max(0, (p.getY(i) - rootY) / height)) ** 2;
    sw[i * 2] = amp * w;
    sw[i * 2 + 1] = flutter * fl.getX(i) * w;
  }
  g.deleteAttribute('fl');
  g.setAttribute('sway', new THREE.BufferAttribute(sw, 2));
  g.computeBoundingBox();
  return g;
}

const ico = (r, d, rng, amt = 0.15) => lump(prep(new THREE.IcosahedronGeometry(r, d)), amt, rng);
const cyl = (rt, rb, h, seg = 7, hs = 1) => prep(new THREE.CylinderGeometry(rt, rb, h, seg, hs));

// ---------- recipes ----------
// pal fields: trunk, trunkTop, bark (dark marks), leafDark, leafLight, rock, rockDark, moss, ...

/** Big broadleaf oak. o: { size } */
export function makeBroadleaf(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const trunkH = (2.1 + rng() * 0.8) * S, parts = [];
  const trunk = cyl(0.2 * S, 0.36 * S, trunkH, 7, 3);
  { // gentle bend + root flare
    const p = trunk.attributes.position, bx = (rng() - 0.5) * 0.4 * S, bz = (rng() - 0.5) * 0.4 * S;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + trunkH / 2) / trunkH;
      const flare = 1 + 0.55 * Math.max(0, 1 - t * 4) ** 2;
      p.setXYZ(i, p.getX(i) * flare + bx * t * t, p.getY(i), p.getZ(i) * flare + bz * t * t);
    }
  }
  trunk.translate(0, trunkH / 2, 0);
  parts.push(paint(trunk, pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.45, jitter: 0.1 }));
  // branches into the crown
  for (let i = 0; i < 3; i++) {
    const b = cyl(0.05 * S, 0.11 * S, 1.3 * S, 5);
    b.translate(0, 0.65 * S, 0);
    b.rotateZ(0.7 + rng() * 0.3);
    b.rotateY((i / 3) * Math.PI * 2 + rng());
    b.translate(0, trunkH * 0.82, 0);
    parts.push(paint(b, pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.2 }));
  }
  // crown: a big central mass + satellite blobs, slightly asymmetric, flattened bottoms
  const blobs = [], n = 5 + Math.floor(rng() * 3), cy = trunkH + 1.0 * S;
  for (let i = 0; i < n; i++) {
    const r = (i === 0 ? 1.55 : 0.85 + rng() * 0.55) * S;
    const g = ico(r, 1, rng, 0.14);
    g.scale(1, 0.84, 1);
    const a = (i / n) * Math.PI * 2 + rng() * 0.8, d = i === 0 ? 0 : (1.0 + rng() * 0.55) * S;
    const y = i === 0 ? cy + 0.3 * S : cy + (rng() * 1.1 - 0.25) * S;
    g.translate(Math.cos(a) * d, y, Math.sin(a) * d);
    blobs.push(g);
  }
  // paint each blob against the whole crown's height range, each with its own slight hue / value shift
  let y0 = Infinity, y1 = -Infinity;
  for (const b of blobs) { b.computeBoundingBox(); y0 = Math.min(y0, b.boundingBox.min.y); y1 = Math.max(y1, b.boundingBox.max.y); }
  const cDark = new THREE.Color(), cLight = new THREE.Color();
  for (const b of blobs) {
    const v = 0.9 + rng() * 0.2, warm = (rng() - 0.5) * 0.12;
    cDark.set(pal.leafDark).multiplyScalar(v); cLight.set(pal.leafLight).multiplyScalar(v);
    cLight.r *= 1 + warm; cLight.b *= 1 - warm;
    parts.push(paint(b, cDark.getHex(), cLight.getHex(), rng, { ao: 0.6, jitter: 0.09, flutter: 1, hueJitter: 0.03, y0, y1: y1 - 0.25 * S }));
  }
  return finish(parts, { height: cy + 1.5 * S, amp: 0.16 * S, flutter: 0.04 });
}

/** Pine / fir: stacked lumpy cone tiers. */
export function makePine(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const trunkH = (1.0 + rng() * 0.4) * S;
  const trunk = cyl(0.11 * S, 0.24 * S, trunkH + 1.2 * S, 6);
  trunk.translate(0, (trunkH + 1.2 * S) / 2, 0);
  const parts = [paint(trunk, pal.trunk, pal.trunk, rng, { ao: 0.5 })];
  const tiers = [], count = 4 + Math.floor(rng() * 2);
  let y = trunkH, r = (1.55 + rng() * 0.3) * S;
  for (let i = 0; i < count; i++) {
    const h = r * 1.35;
    const cone = lump(prep(new THREE.ConeGeometry(r, h, 8, 1)), 0.1, rng);
    // droop the rim
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < -h * 0.4) p.setY(k, p.getY(k) - 0.18 * r * (0.5 + rng() * 0.5));
    cone.rotateY(rng() * Math.PI);
    cone.translate(0, y + h / 2, 0);
    tiers.push(cone);
    y += h * 0.5; r *= 0.76;
  }
  const crown = mergeGeometries(tiers);
  tiers.forEach((t) => t.dispose());
  parts.push(paint(crown, pal.pineDark ?? pal.leafDark, pal.pineLight ?? pal.leafLight, rng, { ao: 0.5, jitter: 0.08, flutter: 1 }));
  return finish(parts, { height: y + r, amp: 0.12 * S, flutter: 0.02 });
}

/** Birch: slender pale trunk with dark marks, small light canopy blobs. */
export function makeBirch(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const trunkH = (3.2 + rng() * 1.0) * S;
  const trunk = cyl(0.09 * S, 0.16 * S, trunkH, 6, 6);
  trunk.translate(0, trunkH / 2, 0);
  trunk.rotateZ((rng() - 0.5) * 0.12);
  // bark marks: paint some faces dark
  paint(trunk, pal.birchBark ?? 0xd8d2c0, pal.birchBark ?? 0xe3ded0, rng, { ao: 0.3, jitter: 0.05 });
  { const c = trunk.attributes.color; for (let f = 0; f < c.count; f += 3) if (rng() < 0.22) for (let q = 0; q < 3; q++) c.setXYZ(f + q, 0.06, 0.055, 0.05); }
  const parts = [trunk];
  const blobs = [], n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const r = (0.6 + rng() * 0.35) * S;
    const g = ico(r, 1, rng, 0.16);
    g.scale(1, 1.35, 1);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : (0.45 + rng() * 0.35) * S;
    g.translate(Math.cos(a) * d, trunkH - 0.3 * S + rng() * 1.2 * S, Math.sin(a) * d);
    blobs.push(g);
  }
  const crown = mergeGeometries(blobs);
  blobs.forEach((b) => b.dispose());
  parts.push(paint(crown, pal.birchLeafDark ?? pal.leafDark, pal.birchLeafLight ?? pal.leafLight, rng, { ao: 0.45, jitter: 0.1, flutter: 1 }));
  return finish(parts, { height: trunkH + 1.5 * S, amp: 0.2 * S, flutter: 0.05 });
}

/** Crown-only canopy blob cluster (distant forest filler / tree line backing). */
export function makeCanopy(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const blobs = [], n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = (1.2 + rng() * 0.8) * S;
    const g = ico(r, rng() < 0.5 ? 0 : 1, rng, 0.15);
    g.scale(1, 0.8, 1);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : (1.2 + rng() * 0.8) * S;
    g.translate(Math.cos(a) * d, (2.6 + rng() * 1.2) * S, Math.sin(a) * d);
    blobs.push(g);
  }
  const trunk = cyl(0.2 * S, 0.3 * S, 2.8 * S, 5);
  trunk.translate(0, 1.4 * S, 0);
  const crown = mergeGeometries(blobs);
  blobs.forEach((b) => b.dispose());
  return finish([paint(trunk, pal.trunk, pal.trunk, rng, { ao: 0.5 }), paint(crown, pal.leafDark, pal.leafLight, rng, { ao: 0.5, jitter: 0.1, flutter: 1 })],
    { height: 5 * S, amp: 0.1 * S, flutter: 0.02 });
}

/** Bush / shrub: 2-5 blobs. o: { size, dots: [hex] (small flower/berry dots, never red), dotChance } */
export function makeBush(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const blobs = [], n = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const r = (0.42 + rng() * 0.32) * S;
    const g = ico(r, 1, rng, 0.16);
    g.scale(1, 0.85, 1);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : (0.35 + rng() * 0.3) * S;
    g.translate(Math.cos(a) * d, r * 0.62, Math.sin(a) * d);
    blobs.push(g);
  }
  const body = mergeGeometries(blobs);
  blobs.forEach((b) => b.dispose());
  const parts = [paint(body, pal.bushDark ?? pal.leafDark, pal.bushLight ?? pal.leafLight, rng, { ao: 0.6, jitter: 0.1, flutter: 1, y0: 0 })];
  if (o.dots) { // blossoms / berries on the upper faces
    body.computeBoundingBox();
    const p = body.attributes.position, dots = [];
    for (let f = 0; f < p.count; f += 3) {
      if (rng() > (o.dotChance ?? 0.12)) continue;
      _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
      const cx = (_a.x + _b.x + _c.x) / 3, cy = (_a.y + _b.y + _c.y) / 3, cz = (_a.z + _b.z + _c.z) / 3;
      if (cy < body.boundingBox.max.y * 0.45) continue;
      const d = prep(new THREE.OctahedronGeometry(0.07 * S, 0));
      d.scale(1, 0.6, 1);
      d.translate(cx * 1.04, cy * 1.04, cz * 1.04);
      dots.push(paintFlat(d, o.dots[Math.floor(rng() * o.dots.length)], rng, { jitter: 0.06 }));
    }
    if (dots.length) parts.push(...dots.map((d) => { d.getAttribute('fl').array.fill(1); return d; }));
  }
  return finish(parts, { height: 1.4 * S, amp: 0.05 * S, flutter: 0.03 });
}

/** Fern: arching fronds (two-sided strips). */
export function makeFern(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const fronds = [], n = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const len = (0.75 + rng() * 0.45) * S, segs = 5, pos = [];
    const pts = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const w = 0.17 * S * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (k === segs ? 0 : 1) + 0.01;
      // arc: rises then droops
      const x = t * len, y = Math.sin(t * 2.3) * 0.5 * len * (0.8 + rng() * 0.3);
      pts.push([x, y, w]);
    }
    for (let k = 0; k < segs; k++) {
      const [x0, y0, w0] = pts[k], [x1, y1, w1] = pts[k + 1];
      // tilt the blade slightly so each side catches light differently
      pos.push(x0, y0, -w0, x1, y1, -w1, x1, y1 + w1 * 0.25, w1);
      pos.push(x0, y0, -w0, x1, y1 + w1 * 0.25, w1, x0, y0 + w0 * 0.25, w0);
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g = twoSided(g);
    g.rotateZ(rng() * 0.25);
    g.rotateY((i / n) * Math.PI * 2 + rng() * 0.5);
    fronds.push(g);
  }
  const body = mergeGeometries(fronds);
  fronds.forEach((f) => f.dispose());
  return finish([paint(body, pal.fernDark ?? pal.leafDark, pal.fernLight ?? pal.leafLight, rng, { ao: 0.55, jitter: 0.08, flutter: 1, y0: 0 })],
    { height: 0.8 * S, amp: 0.07 * S, flutter: 0.035 });
}

/** Boulder / rock. o: { size, flat (slab), mossAmt } */
export function makeRock(rng, pal, o = {}) {
  const S = o.size ?? 1;
  const g = ico(1, rng() < 0.6 ? 0 : 1, rng, 0.26);
  if (o.flat) g.scale(1.3 + rng() * 0.4, 0.35 + rng() * 0.15, 1.1 + rng() * 0.3);
  else g.scale(1 + rng() * 0.4, 0.62 + rng() * 0.3, 0.9 + rng() * 0.35);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y - 0.22, 0);   // sunk
  g.scale(S, S, S);
  paint(g, pal.rockDark, pal.rock, rng, { ao: 0.45, jitter: 0.07, moss: pal.moss ?? null, mossAmt: o.mossAmt ?? 0.85, mossUp: 0.5, y0: 0 });
  return finish([g]);
}

/** Tree stump with lighter cut top and roots. */
export function makeStump(rng, pal, o = {}) {
  const S = o.size ?? 1, h = (0.45 + rng() * 0.3) * S, r = (0.3 + rng() * 0.12) * S;
  const body = cyl(r * 0.92, r * 1.08, h, 8, 1);
  body.translate(0, h / 2, 0);
  // jagged cut: raise some top vertices
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h - 0.01) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    p.setY(i, h + Math.max(0, Math.sin(a * 3 + 1)) * 0.14 * S);
  }
  paint(body, pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.45, moss: pal.cut ?? 0xc8a878, mossAmt: 1, mossUp: 0.8 });
  const parts = [body];
  for (let i = 0; i < 4; i++) {
    const rt = cyl(0.04 * S, 0.12 * S, 0.6 * S, 5);
    rt.translate(0, 0.3 * S, 0);
    rt.rotateZ(1.25);
    rt.rotateY((i / 4) * Math.PI * 2 + rng() * 0.6);
    rt.translate(0, 0.06 * S, 0);
    parts.push(paint(rt, pal.trunk, pal.trunk, rng, { ao: 0.2, moss: pal.moss ?? null, mossAmt: 0.6 }));
  }
  return finish(parts);
}

/** Fallen log (along local X). o: { length } */
export function makeLog(rng, pal, o = {}) {
  const L = o.length ?? 3.4, r = 0.4 + rng() * 0.1;
  const body = cyl(r * 0.9, r, L, 8, 3);
  { const p = body.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 0.9) * 0.08); }
  body.rotateZ(Math.PI / 2);
  body.translate(0, r * 0.82, 0);
  paint(body, pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.5, moss: pal.moss ?? null, mossAmt: 0.85, mossUp: 0.6, y0: 0, y1: r * 1.8 });
  const parts = [body];
  // lighter end caps
  for (const s of [-1, 1]) {
    const cap = prep(new THREE.CircleGeometry(r * 0.88, 8));
    cap.rotateY(s * Math.PI / 2);
    cap.translate(s * L / 2 * 1.002, r * 0.82, 0);
    parts.push(paintFlat(cap, pal.cut ?? 0xc8a878, rng, { jitter: 0.05 }));
  }
  const br = cyl(0.04, 0.09, 0.8, 5);
  br.translate(0, 0.4, 0); br.rotateZ(-0.5); br.translate(L * 0.15, r * 1.4, 0);
  parts.push(paint(br, pal.trunk, pal.trunk, rng, { ao: 0.2 }));
  return finish(parts);
}

/** Cluster of small mushrooms (tan / cream caps — never red). */
export function makeMushrooms(rng, pal, o = {}) {
  const parts = [], n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const s = (0.5 + rng() * 0.7) * (o.size ?? 1), h = 0.22 * s;
    const a = rng() * Math.PI * 2, d = rng() * 0.35;
    const stem = cyl(0.03 * s, 0.045 * s, h, 5);
    stem.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    parts.push(paintFlat(stem, pal.stem ?? 0xe6dcc4, rng, { jitter: 0.05 }));
    const cap = prep(new THREE.SphereGeometry(0.11 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2));
    cap.scale(1, 0.7, 1);
    cap.translate(Math.cos(a) * d, h * 0.92, Math.sin(a) * d);
    parts.push(paint(cap, pal.capDark ?? 0xa87a48, pal.cap ?? 0xd8a860, rng, { ao: 0.3 }));
  }
  return finish(parts);
}

/** Reeds / cattails (two-sided blades). */
export function makeReeds(rng, pal, o = {}) {
  const parts = [], n = o.blades ?? 9;
  for (let i = 0; i < n; i++) {
    const h = 0.8 + rng() * 0.7, w = 0.05;
    let blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, h, 0], 3));
    blade = twoSided(blade);
    blade.rotateZ((rng() - 0.5) * 0.4); blade.rotateY(rng() * Math.PI); blade.translate((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
    parts.push(paint(blade, pal.reedRoot ?? 0x4f7a32, pal.reedTip ?? 0xb8c070, rng, { ao: 0.4, flutter: 1, y0: 0, y1: 1.4 }));
    if (rng() < 0.35) {
      const cat = cyl(0.035, 0.035, 0.18, 5);
      cat.translate(0, h * 0.85, 0);
      cat.rotateZ((rng() - 0.5) * 0.2);
      parts.push(paintFlat(cat, 0x6a4a2e, rng, { flutter: 1 }));
    }
  }
  return finish(parts, { height: 1.4, amp: 0.12, flutter: 0.03 });
}

/** Lily pads (flat discs with a notch) + an occasional white/yellow blossom. */
export function makeLilies(rng, pal) {
  const parts = [], n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.2 + rng() * 0.18;
    const pad = prep(new THREE.CircleGeometry(r, 9, 0.5, Math.PI * 2 - 0.5));
    pad.rotateX(-Math.PI / 2);
    pad.rotateY(rng() * Math.PI * 2);
    const a = rng() * Math.PI * 2, d = rng() * 0.9;
    pad.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(paint(pad, pal.lilyDark ?? 0x3f7a30, pal.lily ?? 0x6aa840, rng, { ao: 0, jitter: 0.12 }));
    if (rng() < 0.3) {
      const b = prep(new THREE.ConeGeometry(0.08, 0.1, 5));
      b.translate(Math.cos(a) * d, 0.05, Math.sin(a) * d);
      parts.push(paintFlat(b, rng() < 0.5 ? 0xe8e2d0 : 0xf0d870, rng));
    }
  }
  return finish(parts);
}

// ---------- camp / settlement recipes (goblin camp in the forest; reusable by other factions) ----------
// pal fields: hide, hideDark, pole, poleTop, paint (accent), paint2, bone, stone, stoneDark, rope

/** Hide tent: 7-sided cone of patchy hides on crossed poles. o: { size } */
export function makeTent(rng, pal, o = {}) {
  const S = o.size ?? 1, h = 2.3 * S, r = 1.45 * S, parts = [];
  const cone = prep(new THREE.ConeGeometry(r, h, 7, 2, true));
  cone.translate(0, h / 2, 0);
  { const p = cone.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.05) p.setY(i, p.getY(i) + (rng() - 0.5) * 0.12); }
  paint(cone, pal.hideDark ?? 0x6a5038, pal.hide ?? 0xa08058, rng, { ao: 0.45, jitter: 0.16 });
  { const c = cone.attributes.color; for (let f = 0; f < c.count; f += 3) if (rng() < 0.25) { const k = 0.7 + rng() * 0.15; for (let q = 0; q < 3; q++) c.setXYZ(f + q, c.getX(f) * k, c.getY(f) * k * 0.95, c.getZ(f) * k * 0.9); } }
  parts.push(cone);
  const band = prep(new THREE.CylinderGeometry(r * 0.47, r * 0.62, 0.3 * S, 7, 1, true));
  band.translate(0, h * 0.52, 0);
  band.scale(1.03, 1, 1.03);
  parts.push(paintFlat(band, pal.paint ?? 0xd09838, rng, { jitter: 0.08 }));
  for (let i = 0; i < 3; i++) {
    const pole = cyl(0.03 * S, 0.05 * S, 1.0 * S, 4);
    pole.rotateZ((rng() - 0.5) * 0.6); pole.rotateX((rng() - 0.5) * 0.6);
    pole.translate(0, h + 0.2 * S, 0);
    parts.push(paintFlat(pole, pal.pole ?? 0x5c4030, rng));
  }
  const door = prep(new THREE.PlaneGeometry(0.7 * S, 1.1 * S));
  door.translate(0, 0.55 * S, 0);
  door.rotateX(-0.53);
  door.translate(0, 0, r * 0.68);
  parts.push(paintFlat(door, 0x241a12, rng, { jitter: 0 }));
  return finish(parts, { height: h, amp: 0.02, flutter: 0 });
}

/** Palisade: a row of sharpened stakes along local X (length L). */
export function makePalisade(rng, pal, o = {}) {
  const L = o.length ?? 4, parts = [], n = Math.round(L / 0.36);
  for (let i = 0; i < n; i++) {
    const h = 1.5 + rng() * 0.5, r = 0.13 + rng() * 0.04;
    const stake = cyl(r, r * 1.05, h, 6);
    stake.translate(0, h / 2, 0);
    const tip = prep(new THREE.ConeGeometry(r, 0.4, 6));
    tip.translate(0, h + 0.2, 0);
    const g = mergeGeometries([stake, tip]); stake.dispose(); tip.dispose();
    g.rotateZ((rng() - 0.5) * 0.12); g.rotateX(-0.08 - rng() * 0.1);
    g.translate(-L / 2 + (i + 0.5) * (L / n), 0, (rng() - 0.5) * 0.08);
    parts.push(paint(g, pal.pole ?? 0x5c4030, pal.poleTop ?? 0x8a6a48, rng, { ao: 0.45, jitter: 0.1 }));
  }
  for (const y of [0.45, 1.1]) {
    const rail = cyl(0.05, 0.05, L, 5);
    rail.rotateZ(Math.PI / 2); rail.translate(0, y, 0.14);
    parts.push(paintFlat(rail, pal.rope ?? 0x8a7450, rng));
  }
  return finish(parts);
}

/** Goblin totem: stacked carved blocks, painted, horned skull on top, rags. */
export function makeTotem(rng, pal) {
  const parts = [], H = 2.6;
  const pole = cyl(0.16, 0.2, H, 6);
  pole.translate(0, H / 2, 0);
  parts.push(paint(pole, pal.pole ?? 0x5c4030, pal.poleTop ?? 0x8a6a48, rng, { ao: 0.4 }));
  const cols = [pal.paint ?? 0xd09838, pal.paint2 ?? 0x3e8a80, pal.paint ?? 0xd09838];
  for (let i = 0; i < 3; i++) {
    const b = prep(new THREE.BoxGeometry(0.42, 0.34, 0.42));
    b.translate(0, 0.7 + i * 0.55, 0);
    parts.push(paintFlat(b, cols[i], rng, { jitter: 0.12 }));
    for (const sx of [-0.1, 0.1]) {
      const e = prep(new THREE.BoxGeometry(0.08, 0.06, 0.04));
      e.translate(sx, 0.75 + i * 0.55, 0.22);
      parts.push(paintFlat(e, 0x1c140e, rng, { jitter: 0 }));
    }
  }
  const skull = prep(new THREE.SphereGeometry(0.2, 6, 4));
  skull.scale(1, 0.85, 1.15); skull.translate(0, H + 0.1, 0.03);
  parts.push(paintFlat(skull, pal.bone ?? 0xcfc5ae, rng, { jitter: 0.05 }));
  for (const s of [-1, 1]) {
    const horn = prep(new THREE.ConeGeometry(0.06, 0.55, 5));
    horn.translate(0, 0.27, 0); horn.rotateZ(-s * 0.9); horn.translate(s * 0.16, H + 0.18, 0);
    parts.push(paint(horn, 0x8a7a60, pal.bone ?? 0xcfc5ae, rng, { ao: 0 }));
  }
  for (let i = 0; i < 3; i++) {
    let f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0, -0.5, 0.05], 3));
    f = twoSided(f);
    f.rotateY(i * 2.1); f.translate(Math.cos(i * 2.1) * 0.22, 2.2, Math.sin(i * 2.1) * 0.22);
    parts.push(paintFlat(f, i === 1 ? (pal.paint2 ?? 0x3e8a80) : (pal.paint ?? 0xd09838), rng, { flutter: 1 }));
  }
  return finish(parts, { height: 3, amp: 0, flutter: 0.06 });
}

/** Campfire: stone ring + crossed logs + ash (the flame is a separate animated mesh). */
export function makeCampfire(rng, pal) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = ico(0.2 + rng() * 0.06, 0, rng, 0.2);
    s.scale(1, 0.7, 1); s.translate(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
    parts.push(paint(s, pal.stoneDark ?? 0x5a5650, pal.stone ?? 0x8a867c, rng, { ao: 0.3 }));
  }
  const ash = prep(new THREE.CircleGeometry(0.5, 9));
  ash.rotateX(-Math.PI / 2); ash.translate(0, 0.02, 0);
  parts.push(paintFlat(ash, 0x2a2420, rng));
  for (let i = 0; i < 4; i++) {
    const l = cyl(0.06, 0.07, 0.9, 5);
    l.rotateZ(Math.PI / 2 - 0.35); l.translate(0.18, 0.2, 0); l.rotateY((i / 4) * Math.PI * 2);
    parts.push(paint(l, 0x3a2a1e, 0x5c4030, rng, { ao: 0 }));
  }
  return finish(parts);
}

/** Pole with a horned beast skull (hunting trophy). */
export function makeTrophy(rng, pal) {
  const parts = [];
  const pole = cyl(0.06, 0.08, 1.9, 5);
  pole.translate(0, 0.95, 0);
  parts.push(paintFlat(pole, pal.pole ?? 0x5c4030, rng));
  const skull = prep(new THREE.BoxGeometry(0.26, 0.22, 0.4));
  skull.translate(0, 1.95, 0.08);
  parts.push(paintFlat(skull, pal.bone ?? 0xcfc5ae, rng, { jitter: 0.05 }));
  const snout = prep(new THREE.BoxGeometry(0.18, 0.14, 0.24));
  snout.translate(0, 1.88, 0.34);
  parts.push(paintFlat(snout, pal.bone ?? 0xcfc5ae, rng, { jitter: 0.05 }));
  for (const s of [-1, 1]) {
    const horn = prep(new THREE.TorusGeometry(0.28, 0.035, 4, 7, Math.PI * 0.7));
    horn.rotateY(Math.PI / 2); horn.rotateX(-0.3); horn.rotateZ(s * 0.2); horn.translate(s * 0.15, 2.12, 0);
    parts.push(paint(horn, 0x8a7a60, pal.bone ?? 0xcfc5ae, rng, { ao: 0 }));
  }
  return finish(parts);
}

/** Crude crates + barrel. */
export function makeCrates(rng, pal) {
  const parts = [], n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const s = 0.45 + rng() * 0.2;
    const b = prep(new THREE.BoxGeometry(s, s, s));
    b.rotateY(rng() * 0.8);
    b.translate((i - n / 2) * 0.55, s / 2, (rng() - 0.5) * 0.4);
    parts.push(paint(b, pal.pole ?? 0x5c4030, pal.poleTop ?? 0x8a6a48, rng, { ao: 0.4, jitter: 0.12 }));
  }
  const barrel = cyl(0.26, 0.24, 0.6, 8);
  barrel.translate(0.15, 0.3, 0.6);
  parts.push(paint(barrel, 0x5c4030, 0x7a5a40, rng, { ao: 0.3 }));
  return finish(parts);
}

/** Tattered banner on a pole (cloth flutters). o: { color } */
export function makeBanner(rng, pal, o = {}) {
  const parts = [], H = 2.8;
  const pole = cyl(0.05, 0.07, H, 5);
  pole.translate(0, H / 2, 0);
  parts.push(paintFlat(pole, pal.pole ?? 0x5c4030, rng));
  const bar = cyl(0.03, 0.03, 0.8, 4);
  bar.rotateZ(Math.PI / 2); bar.translate(0.3, H - 0.15, 0);
  parts.push(paintFlat(bar, pal.pole ?? 0x5c4030, rng));
  const pos = [], W = 0.7, L = 1.2, segs = 4;
  for (let k = 0; k < segs; k++) {
    const y0 = H - 0.15 - (k / segs) * L, y1 = H - 0.15 - ((k + 1) / segs) * L;
    const w0 = W, w1 = k === segs - 1 ? W * 0.45 : W;
    pos.push(-0.05, y0, 0, -0.05 + w0, y0, 0, -0.05 + w1, y1, 0);
    pos.push(-0.05, y0, 0, -0.05 + w1, y1, 0, -0.05, y1, 0);
  }
  let cloth = new THREE.BufferGeometry();
  cloth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cloth = twoSided(cloth);
  const cc = o.color ?? pal.paint2 ?? 0x3e8a80;
  parts.push(paint(cloth, cc, cc, rng, { ao: 0, jitter: 0.06, flutter: 1 }));
  return finish(parts, { height: H, amp: 0.05, flutter: 0.08 });
}

// ---------- materials ----------
/** The ONE prop material: vertex colours, wrap lighting, per-vertex wind, player dither cut-out. */
export function createPropMaterial({ fade = true, key = 'props' } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  return patchEnv(m, { key, sway: true, fade, wrap: true });
}

// ---------- batching ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _n3 = new THREE.Matrix3();

/**
 * Collects placements and merges them into world-space chunk meshes sharing one material.
 *   const b = new PropBatch({ chunk: 40 });
 *   b.add(geo, { x, z, y, rotY, s, sy, tiltX, tiltZ, tint: [r,g,b] multiplier, shade: brightness });
 *   const meshes = b.build(material, { castShadow, receiveShadow, name });
 */
export class PropBatch {
  constructor({ chunk = 40 } = {}) { this.chunk = chunk; this.cells = new Map(); this.count = 0; }

  add(geo, it) {
    const s = it.s ?? 1;
    _e.set(it.tiltX ?? 0, it.rotY ?? 0, it.tiltZ ?? 0, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1));
    _m4.compose(_v.set(it.x, it.y ?? 0, it.z), _q, _s);
    const ck = `${Math.floor(it.x / this.chunk)},${Math.floor(it.z / this.chunk)}`;
    let list = this.cells.get(ck);
    if (!list) { list = []; this.cells.set(ck, list); }
    list.push({ geo, matrix: _m4.clone(), x: it.x, z: it.z, s: s * (it.sy ?? 1), tint: it.tint ?? null, shade: it.shade ?? 1 });
    this.count++;
  }

  build(material, { castShadow = true, receiveShadow = true, name = 'env.props' } = {}) {
    const meshes = [];
    for (const [key, list] of this.cells) {
      let total = 0;
      for (const e of list) total += e.geo.attributes.position.count;
      const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3), sw = new Float32Array(total * 4);
      let o = 0;
      for (const e of list) {
        const g = e.geo, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, W = g.attributes.sway;
        _n3.getNormalMatrix(e.matrix);
        const tr = e.tint ? e.tint[0] * e.shade : e.shade, tg = e.tint ? e.tint[1] * e.shade : e.shade, tb = e.tint ? e.tint[2] * e.shade : e.shade;
        for (let i = 0; i < P.count; i++, o++) {
          _v.fromBufferAttribute(P, i).applyMatrix4(e.matrix);
          pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
          _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
          nrm[o * 3] = _v.x; nrm[o * 3 + 1] = _v.y; nrm[o * 3 + 2] = _v.z;
          col[o * 3] = C.getX(i) * tr; col[o * 3 + 1] = C.getY(i) * tg; col[o * 3 + 2] = C.getZ(i) * tb;
          sw[o * 4] = e.x; sw[o * 4 + 1] = e.z;
          sw[o * 4 + 2] = W ? W.getX(i) * e.s : 0; sw[o * 4 + 3] = W ? W.getY(i) * e.s : 0;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 4));
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 0.5;     // wind margin
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${name}[${key}]`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.dispose = () => geo.dispose();
      meshes.push(mesh);
    }
    this.cells.clear();
    return meshes;
  }
}

/** Seeded variant cache: makeVariants(n, seed, (rng) => geometry). */
export function makeVariants(n, rng, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(rng, i));
  return out;
}

export { fbm };
