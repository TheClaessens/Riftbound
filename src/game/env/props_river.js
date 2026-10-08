import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, lump, twoSided, paint, paintFlat, finish } from './props.js';
import { ENV, patchEnv, fbm, smooth } from './common.js';

// =====================================================================================
//  Riverlands recipes (Act III, The Stormwater Reach). Same contract as props.js: every
//  recipe returns a NON-INDEXED geometry with position / normal / color / sway, built with
//  prep -> lump/jitter -> paint -> finish, ready for PropBatch. Plus three tiny extras that
//  the biome owns as single draws: the glowing crown-shard material, a ribbon water sheet
//  (union of braids with true bank distance) and the waterfall / mist / dragonfly / rain
//  layers (all animated on the GPU, zero per-frame allocations).
// =====================================================================================

const ico = (r, d, rng, amt = 0.15) => lump(prep(new THREE.IcosahedronGeometry(r, d)), amt, rng);
const cyl = (rt, rb, h, seg = 7, hs = 1) => prep(new THREE.CylinderGeometry(rt, rb, h, seg, hs));

/** Per-unique-vertex random offset (keeps shared corners welded): chipped, hand-cut stone. */
export function jitterVerts(geo, amt, rng, ky = 1) {
  const p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
    let o = seen.get(key);
    if (!o) { o = [(rng() * 2 - 1) * amt, (rng() * 2 - 1) * amt * ky, (rng() * 2 - 1) * amt]; seen.set(key, o); }
    p.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  return geo;
}
const block = (w, h, d, rng, j = 0.04) => jitterVerts(prep(new THREE.BoxGeometry(w, h, d)), j, rng);

/** Hexahedron from 8 corners [x,y,z]: 0..3 front face CCW (BL, BR, TR, TL), 4..7 the same on the back. */
function hexa(c) {
  const idx = [0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0];
  const pos = new Float32Array(idx.length * 3);
  idx.forEach((k, i) => { pos[i * 3] = c[k][0]; pos[i * 3 + 1] = c[k][1]; pos[i * 3 + 2] = c[k][2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  let cx = 0, cy = 0, cz = 0;
  for (const p of c) { cx += p[0] / 8; cy += p[1] / 8; cz += p[2] / 8; }
  orientOutward(g, [cx, cy, cz]);        // corner order / mirroring never matters (convex blocks)
  return g;
}
/** Wedge block of an arch ring in the XY plane (centre cx, cy), angles a0 < a1, depth d along Z. */
function voussoir(cx, cy, ri, ro, a0, a1, d) {
  const P = (r, a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  const f = d / 2;
  return hexa([P(ri, a0, f), P(ro, a0, f), P(ro, a1, f), P(ri, a1, f), P(ri, a0, -f), P(ro, a0, -f), P(ro, a1, -f), P(ri, a1, -f)]);
}
/** Thin two-sided hanging strand (ivy / willow) from (x, y, z) down by len, facing direction a (radians, XZ). */
function strand(x, y, z, len, w0, w1, a, bow = 0.15, segs = 3) {
  const pos = [], nx = Math.cos(a), nz = Math.sin(a), tx = -nz, tz = nx;
  for (let k = 0; k < segs; k++) {
    const t0 = k / segs, t1 = (k + 1) / segs;
    const y0 = y - len * t0, y1 = y - len * t1;
    const o0 = Math.sin(t0 * Math.PI * 0.8) * bow, o1 = Math.sin(t1 * Math.PI * 0.8) * bow;
    const wa = (w0 + (w1 - w0) * t0) / 2, wb = (w0 + (w1 - w0) * t1) / 2;
    const ax = x + nx * o0, az = z + nz * o0, bx = x + nx * o1, bz = z + nz * o1;
    pos.push(ax - tx * wa, y0, az - tz * wa, bx - tx * wb, y1, bz - tz * wb, bx + tx * wb, y1, bz + tz * wb);
    pos.push(ax - tx * wa, y0, az - tz * wa, bx + tx * wb, y1, bz + tz * wb, ax + tx * wa, y0, az + tz * wa);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return twoSided(g);
}

/** Override the sway of the LAST `count` vertices of a finished recipe: hanging strands swing from their top. */
function hangSway(g, count, tops, amp, flutter) {
  const p = g.attributes.position, sw = g.attributes.sway, n = p.count;
  for (let i = n - count, j = 0; i < n; i++, j++) {
    const drop = Math.max(0, tops[j] - p.getY(i));
    const w = Math.min(1, drop / 2.2);
    sw.setXY(i, sw.getX(i) + amp * w, flutter * (0.4 + w));
  }
  return g;
}

// =====================================================================================
//  Vegetation
// =====================================================================================

/** Weeping willow: leaning gnarled trunk, umbrella crown, a curtain of hanging strands that swing. */
export function makeWillow(rng, pal, o = {}) {
  const S = o.size ?? 1, parts = [];
  const trunkH = (1.9 + rng() * 0.6) * S;
  const lx = (rng() - 0.5) * 0.9 * S, lz = (rng() - 0.5) * 0.9 * S;
  const trunk = cyl(0.3 * S, 0.5 * S, trunkH, 8, 4);
  { const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + trunkH / 2) / trunkH, flare = 1 + 0.7 * Math.max(0, 1 - t * 3.5) ** 2;
      const tw = Math.sin(t * 5 + i) * 0.03 * S;
      p.setXYZ(i, p.getX(i) * flare + lx * t * t + tw, p.getY(i), p.getZ(i) * flare + lz * t * t);
    } }
  trunk.translate(0, trunkH / 2, 0);
  parts.push(paint(trunk, pal.willowBark ?? pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.45, jitter: 0.12 }));
  const cx = lx, cz = lz, top = trunkH;
  for (let i = 0; i < 4; i++) {
    const b = cyl(0.07 * S, 0.17 * S, 1.9 * S, 5);
    b.translate(0, 0.95 * S, 0); b.rotateZ(0.55 + rng() * 0.35); b.rotateY((i / 4) * Math.PI * 2 + rng() * 0.8);
    b.translate(cx, top * 0.88, cz);
    parts.push(paint(b, pal.willowBark ?? pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.15 }));
  }
  // umbrella crown: low wide dome of flattened blobs
  const crownY = top + 1.15 * S, CR = (2.3 + rng() * 0.5) * S, blobs = [];
  const nb = 7 + Math.floor(rng() * 3);
  for (let i = 0; i < nb; i++) {
    const r = (i === 0 ? 1.5 : 0.95 + rng() * 0.45) * S;
    const g = ico(r, 1, rng, 0.14);
    g.scale(1.15, 0.62, 1.15);
    const a = (i / nb) * Math.PI * 2 + rng() * 0.6, d = i === 0 ? 0 : CR * (0.5 + rng() * 0.32);
    g.translate(cx + Math.cos(a) * d, crownY + (i === 0 ? 0.45 * S : (rng() - 0.3) * 0.5 * S), cz + Math.sin(a) * d);
    blobs.push(g);
  }
  let y0 = Infinity, y1 = -Infinity;
  for (const b of blobs) { b.computeBoundingBox(); y0 = Math.min(y0, b.boundingBox.min.y); y1 = Math.max(y1, b.boundingBox.max.y); }
  for (const b of blobs) {
    const v = 0.92 + rng() * 0.16;
    const cD = new THREE.Color(pal.willowDark).multiplyScalar(v), cL = new THREE.Color(pal.willowLight).multiplyScalar(v);
    parts.push(paint(b, cD.getHex(), cL.getHex(), rng, { ao: 0.5, jitter: 0.08, flutter: 1, hueJitter: 0.03, y0, y1 }));
  }
  // the curtain
  const strands = [], tops = [], ns = Math.round((40 + rng() * 12) * Math.min(1.3, S));
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * Math.PI * 2 + rng() * 0.2;
    const rr = CR * (0.82 + rng() * 0.38) + 0.35 * S;
    const ty = crownY - 0.15 * S + (rng() - 0.5) * 0.35 * S;
    const len = (1.5 + rng() * 1.7) * S * Math.min(1, (ty - 0.35) / 3.2);
    const g = strand(cx + Math.cos(a) * rr, ty, cz + Math.sin(a) * rr, len, 0.36 * S, 0.1 * S, a + Math.PI / 2, 0.22 * S, 3);
    strands.push(g);
    for (let k = 0; k < g.attributes.position.count; k++) tops.push(ty);
  }
  const curtain = mergeGeometries(strands); strands.forEach((s) => s.dispose());
  parts.push(paint(curtain, pal.willowDark, pal.willowTip ?? pal.willowLight, rng, { ao: 0.25, jitter: 0.1, flutter: 1, y0: 0.4 * S, y1: crownY, hueJitter: 0.04 }));
  const nC = curtain.attributes.position.count;
  const g = finish(parts, { height: crownY + 1.2 * S, amp: 0.14 * S, flutter: 0.035 });
  return hangSway(g, nC, tops, 0.28 * S, 0.06);
}

/** Lombardy-style poplar: tall columnar crown (reads at a glance, very different from round oaks). */
export function makePoplar(rng, pal, o = {}) {
  const S = o.size ?? 1, H = (7.5 + rng() * 2) * S;
  const trunk = cyl(0.1 * S, 0.24 * S, H * 0.55, 6);
  trunk.translate(0, H * 0.275, 0);
  const parts = [paint(trunk, pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.5 })];
  const blobs = [], n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), r = (1.05 - 0.55 * t * t + rng() * 0.15) * S;
    const g = ico(r, 1, rng, 0.13);
    g.scale(1, 1.7, 1);
    g.translate((rng() - 0.5) * 0.25 * S, 2.0 * S + t * (H - 3.2 * S), (rng() - 0.5) * 0.25 * S);
    blobs.push(g);
  }
  const crown = mergeGeometries(blobs); blobs.forEach((b) => b.dispose());
  parts.push(paint(crown, pal.poplarDark ?? pal.leafDark, pal.poplarLight ?? pal.leafLight, rng, { ao: 0.55, jitter: 0.09, flutter: 1, hueJitter: 0.03 }));
  return finish(parts, { height: H, amp: 0.3 * S, flutter: 0.03 });
}

/** Dense cattail / flag clump: bent blades, brown cattail heads, optional pale-yellow flag iris. */
export function makeCattails(rng, pal, o = {}) {
  const parts = [], n = o.blades ?? 13, S = o.size ?? 1;
  for (let i = 0; i < n; i++) {
    const h = (0.9 + rng() * 0.9) * S, w = (0.05 + rng() * 0.04) * S, kink = 0.55 + rng() * 0.25, bend = (rng() - 0.3) * 0.5;
    const pos = [-w, 0, 0, w, 0, 0, w * 0.7, h * kink, 0, -w, 0, 0, w * 0.7, h * kink, 0, -w * 0.7, h * kink, 0,
      -w * 0.7, h * kink, 0, w * 0.7, h * kink, 0, bend * h * 0.4, h, bend * h * 0.15];
    let blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade = twoSided(blade);
    blade.rotateY(rng() * Math.PI); blade.rotateZ((rng() - 0.5) * 0.25);
    blade.translate((rng() - 0.5) * 0.55 * S, 0, (rng() - 0.5) * 0.55 * S);
    parts.push(paint(blade, pal.reedRoot, pal.reedTip, rng, { ao: 0.45, flutter: 1, y0: 0, y1: 1.6 * S, hueJitter: 0.04 }));
  }
  const nc = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nc; i++) {
    const h = (1.3 + rng() * 0.6) * S, x = (rng() - 0.5) * 0.4 * S, z = (rng() - 0.5) * 0.4 * S, lean = (rng() - 0.5) * 0.15;
    const stem = cyl(0.014 * S, 0.02 * S, h, 4); stem.translate(0, h / 2, 0); stem.rotateZ(lean); stem.translate(x, 0, z);
    parts.push(paintFlat(stem, pal.reedRoot, rng, { flutter: 1 }));
    const head = cyl(0.05 * S, 0.05 * S, 0.26 * S, 6); head.translate(0, h * 0.86, 0); head.rotateZ(lean); head.translate(x, 0, z);
    parts.push(paint(head, 0x4a3020, 0x6e4a2c, rng, { ao: 0.2, flutter: 1 }));
  }
  if (o.iris) {
    for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
      const h = (0.8 + rng() * 0.3) * S, x = (rng() - 0.5) * 0.5 * S, z = (rng() - 0.5) * 0.5 * S;
      for (let k = 0; k < 3; k++) {
        const pet = prep(new THREE.ConeGeometry(0.06 * S, 0.16 * S, 4));
        pet.rotateZ(Math.PI * 0.6); pet.translate(0.07 * S, 0, 0); pet.rotateY((k / 3) * Math.PI * 2 + i);
        pet.translate(x, h, z);
        parts.push(paintFlat(pet, k === 0 ? 0xf6dc5a : 0xf2e486, rng, { flutter: 1 }));
      }
    }
  }
  return finish(parts, { height: 1.6 * S, amp: 0.13 * S, flutter: 0.03 });
}

// =====================================================================================
//  Drowned kingdom: stone ruins
// =====================================================================================

/** Shared stone painter: wet algae-dark base -> pale weathered top, moss on up faces. */
const stonePaint = (pal, rng, y0, y1, mossAmt = 0.7) => (g) => paint(g, pal.stoneDark, pal.stone, rng, {
  ao: 0.3, jitter: 0.08, moss: pal.moss, mossAmt, mossUp: 0.62, y0, y1, hueJitter: 0.02,
});

/** Hanging ivy curtain along an edge from (x0,z0) to (x1,z1) at height y, facing a. Returns [geo, tops]. */
function ivy(rng, pal, pts, maxLen, w = 0.16) {
  const gs = [], tops = [];
  for (const [x, y, z, a] of pts) {
    const len = maxLen * (0.35 + rng() * 0.65);
    const g = strand(x, y, z, len, w, w * 0.4, a, 0.06, 2);
    gs.push(g); for (let k = 0; k < g.attributes.position.count; k++) tops.push(y);
  }
  const geo = mergeGeometries(gs); gs.forEach((g) => g.dispose());
  paint(geo, pal.ivyDark ?? pal.willowDark, pal.ivyLight ?? pal.willowLight, rng, { ao: 0.2, jitter: 0.12, flutter: 1 });
  return [geo, tops];
}

/**
 * Old stone bridge along local X (river flows along Z). o: { spans, span, width, pierW, spring (springing y),
 * broken: [span indices], ramps (approach length), ivy }. Piers reach down to y -1 (into the water).
 */
export function makeBridge(rng, pal, o = {}) {
  const spans = o.spans ?? 3, span = o.span ?? 4.5, W = o.width ?? 3.0, pw = o.pierW ?? 1.2, yS = o.spring ?? 0.5;
  const R = span / 2, ringT = 0.42, yDb = yS + R + ringT + 0.12, yD = yDb + 0.34, yB = -1.1;
  const broken = new Set(o.broken ?? []), ramp = o.ramps ?? 0;
  const L = spans * span + (spans + 1) * pw;
  const P = stonePaint(pal, rng, yB, yD + 0.6);
  const parts = [], ivyPts = [];
  const xs = [];       // pier centres
  for (let i = 0; i <= spans; i++) xs.push(-L / 2 + pw / 2 + i * (pw + span));
  for (let i = 0; i <= spans; i++) {
    const px = xs[i], end = i === 0 || i === spans;
    const leftBroken = i > 0 && broken.has(i - 1), rightBroken = i < spans && broken.has(i);
    const top = end ? yD : (leftBroken && rightBroken ? yS + 0.4 : yDb);
    const h = top - yB;
    const b = block(pw, h, W + (end ? 0.3 : 0.1), rng, 0.04); b.translate(px, yB + h / 2, 0); parts.push(P(b));
    if (!end) for (const s of [-1, 1]) {   // cutwaters, pointed into the current
      const z0 = s * (W / 2 + 0.05), z1 = s * (W / 2 + pw * 0.75), yt = yS + 0.55;
      const c = s > 0
        ? [[px - pw / 2, yB, z0], [px + pw / 2, yB, z0], [px + pw / 2, yt, z0], [px - pw / 2, yt, z0], [px, yB, z1], [px, yB, z1], [px, yt - 0.15, z1], [px, yt - 0.15, z1]]
        : [[px + pw / 2, yB, z0], [px - pw / 2, yB, z0], [px - pw / 2, yt, z0], [px + pw / 2, yt, z0], [px, yB, z1], [px, yB, z1], [px, yt - 0.15, z1], [px, yt - 0.15, z1]];
      // collapse the degenerate back face by building the wedge from a box-shaped hexa
      parts.push(P(jitterVerts(hexa(c), 0.03, rng)));
      const cap = prep(new THREE.ConeGeometry(pw * 0.62, 0.55, 4)); cap.rotateY(Math.PI / 4); cap.scale(1, 1, 0.9);
      cap.translate(px, yt + 0.12, s * (W / 2 + pw * 0.25));
      parts.push(P(cap));
    }
  }
  // arches, spandrels, deck
  const nV = 9;
  for (let s = 0; s < spans; s++) {
    const cx = (xs[s] + xs[s + 1]) / 2, isBroken = broken.has(s);
    for (let k = 0; k < nV; k++) {
      if (isBroken && k > 1 && k < nV - 2) continue;
      if (isBroken && rng() < 0.25 && (k === 1 || k === nV - 2)) continue;
      const a0 = Math.PI - (k / nV) * Math.PI, a1 = Math.PI - ((k + 1) / nV) * Math.PI;
      const v = jitterVerts(voussoir(cx, yS, R, R + ringT, a1 + 0.012, a0 - 0.012, W + 0.14), 0.025, rng);
      parts.push(P(v));
      if (!isBroken) {   // spandrel fill above this voussoir up to the deck
        const xa = cx + Math.cos(a0) * (R + ringT), ya = yS + Math.sin(a0) * (R + ringT);
        const xb = cx + Math.cos(a1) * (R + ringT), yb = yS + Math.sin(a1) * (R + ringT);
        if (yDb - Math.min(ya, yb) > 0.02) {
          const f = W / 2;
          parts.push(P(hexa([[xa, ya, f], [xb, yb, f], [xb, yDb, f], [xa, yDb, f], [xa, ya, -f], [xb, yb, -f], [xb, yDb, -f], [xa, yDb, -f]])));
        }
      }
    }
    if (!isBroken) {
      const d = block(span + pw, yD - yDb, W + 0.2, rng, 0.03); d.translate(cx, (yD + yDb) / 2, 0); parts.push(P(d));
      for (let q = 0; q < 6; q++) ivyPts.push([cx + (rng() - 0.5) * span, yDb + 0.05, (rng() < 0.5 ? -1 : 1) * (W / 2 + 0.12), 0]);
    } else {   // jagged broken deck stubs over the springers
      for (const side of [-1, 1]) {
        const len = 0.5 + rng() * 0.5, x = cx + side * (R - len / 2 + 0.1);
        const d = block(len + 0.3, yD - yDb, W * (0.6 + rng() * 0.3), rng, 0.08); d.translate(x, (yD + yDb) / 2 - 0.1, (rng() - 0.5) * 0.4); parts.push(P(d));
      }
    }
  }
  // parapets (gaps = ruin)
  for (const sz of [-1, 1]) {
    let x = -L / 2 + 0.1;
    while (x < L / 2 - 0.3) {
      const len = 0.55 + rng() * 0.4;
      const sIdx = Math.floor((x + L / 2) / (span + pw));
      const over = (x + L / 2) - sIdx * (span + pw);
      const inBroken = over > pw * 0.5 && broken.has(Math.min(spans - 1, sIdx)) && sIdx < spans;
      if (!inBroken && rng() > (o.gaps ?? 0.16)) {
        const hh = 0.42 + rng() * 0.12;
        const b = block(len - 0.04, hh, 0.26, rng, 0.03); b.translate(x + len / 2, yD + hh / 2, sz * (W / 2 - 0.05)); parts.push(P(b));
      }
      x += len;
    }
  }
  // approach stairs: worn stepped blocks down to the bank (two flanking kerb stones per step)
  if (ramp > 0) for (const s of [-1, 1]) {
    const n = 4, step = ramp / n;
    for (let q = 0; q < n; q++) {
      const top = yD - (q + 1) * (yD - 0.1) / (n + 0.4), xm = s * (L / 2 + step * (q + 0.5));
      const b = block(step + 0.06, top - yB, W * (0.92 - q * 0.03), rng, 0.05);
      b.translate(xm + (rng() - 0.5) * 0.08, (top + yB) / 2, (rng() - 0.5) * 0.1); parts.push(P(b));
      for (const sz of [-1, 1]) if (rng() < 0.75) {
        const k = block(step * 0.9, 0.32, 0.3, rng, 0.04); k.translate(xm, top + 0.12, sz * (W * (0.46 - q * 0.015)));
        parts.push(P(k));
      }
    }
    for (let q = 0; q < 3; q++) ivyPts.push([s * (L / 2 + ramp * (0.15 + q * 0.25)), yD * (0.75 - q * 0.22), (rng() < 0.5 ? -1 : 1) * (W * 0.46 + 0.05), 0]);
  }
  const all = [...parts];
  let ivyGeo = null, tops = [];
  if (o.ivy !== false && ivyPts.length) {
    for (const p of ivyPts) p[3] = p[2] > 0 ? Math.PI / 2 : -Math.PI / 2;
    [ivyGeo, tops] = ivy(rng, pal, ivyPts, 1.6, 0.2);
    all.push(ivyGeo);
  }
  const nI = ivyGeo ? ivyGeo.attributes.position.count : 0;
  const g = finish(all, { height: 6, amp: 0, flutter: 0 });
  if (nI) hangSway(g, nI, tops, 0.06, 0.05);
  g.userData = { length: L, piers: xs, width: W, deckY: yD };
  return g;
}

/** Free-standing ruined arch (palace arcade). o: { span, height, broken (0..1), depth } */
export function makeRuinArch(rng, pal, o = {}) {
  const span = o.span ?? 3.2, H = o.height ?? 2.6, D = o.depth ?? 0.9, pw = 0.85, brk = o.broken ?? 0.5;
  const R = span / 2, ringT = 0.5, Y1 = H + R + ringT + 0.6;
  const P = stonePaint(pal, rng, -0.8, Y1, 0.8);
  const parts = [];
  for (const s of [-1, 1]) {
    const px = s * (R + pw / 2);
    const short = s > 0 && brk > 0.6 ? 0.55 + rng() * 0.25 : 1;
    // plinth + stacked drums (round shafts read as "palace", square blocks as "bridge")
    const pl = block(pw + 0.3, 0.45, D + 0.3, rng, 0.04); pl.translate(px, -0.1, 0); parts.push(P(pl));
    let y = 0.12; const top = H * short, nd = 4;
    for (let k = 0; k < nd && y < top - 0.05; k++) {
      const h = Math.min(top - y, H / nd + (rng() - 0.5) * 0.12);
      const dr = jitterVerts(cyl(pw * 0.42, pw * 0.44, h - 0.02, 10), 0.02, rng);
      dr.rotateY(rng()); dr.translate(px + (rng() - 0.5) * 0.04, y + h / 2, 0); parts.push(P(dr));
      y += h;
    }
    if (short === 1) { const cap = block(pw + 0.18, 0.28, D + 0.12, rng, 0.03); cap.translate(px, H + 0.14, 0); parts.push(P(cap)); }
    else { // jagged break + a fallen drum at its foot
      const dr = jitterVerts(cyl(pw * 0.42, pw * 0.44, 0.7, 10), 0.03, rng); dr.rotateZ(Math.PI / 2); dr.rotateY(rng() * 2);
      dr.translate(px + 1.0, 0.25, 0.9 * (rng() < 0.5 ? -1 : 1)); parts.push(P(dr));
    }
  }
  const nV = 9;
  for (let k = 0; k < nV; k++) {
    const a0 = Math.PI - (k / nV) * Math.PI, a1 = Math.PI - ((k + 1) / nV) * Math.PI;
    if (brk > 0.6 && k >= nV - 4) continue;                 // right half fell with the short pillar
    if (brk > 0.25 && brk <= 0.6 && k === Math.floor(nV / 2)) continue;  // keystone lost
    const v = jitterVerts(voussoir(0, H + 0.28, R, R + ringT, a1 + 0.015, a0 - 0.015, D), 0.03, rng);
    parts.push(P(v));
  }
  // rubble at the base
  for (let i = 0; i < 4; i++) {
    const s = 0.25 + rng() * 0.25, b = block(s * 1.6, s, s * 1.2, rng, 0.06);
    b.rotateY(rng() * 3); b.rotateZ((rng() - 0.5) * 0.5); b.translate((rng() - 0.5) * span * 1.4, s * 0.3, (rng() - 0.5) * 1.8);
    parts.push(P(b));
  }
  const ivyPts = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + rng() * 0.45), r = R + ringT * 0.9;
    for (const sz of [-1, 1]) if (rng() < 0.5) ivyPts.push([Math.cos(a) * r, H + 0.28 + Math.sin(a) * r, sz * (D / 2 + 0.03), sz * Math.PI / 2]);
  }
  const [ivyGeo, tops] = ivy(rng, pal, ivyPts, 1.5);
  const nI = ivyGeo.attributes.position.count;
  const g = finish([...parts, ivyGeo], { height: 5, amp: 0, flutter: 0 });
  return hangSway(g, nI, tops, 0.05, 0.05);
}

/** Broken column on a square base (+ optional fallen drums). o: { height, fallen } */
export function makeColumn(rng, pal, o = {}) {
  const H = o.height ?? (1.2 + rng() * 1.6), r = 0.34 + rng() * 0.06;
  const P = stonePaint(pal, rng, -0.4, 3.4, 0.85);
  const parts = [];
  const base = block(r * 2.6, 0.32, r * 2.6, rng, 0.04); base.translate(0, 0.06, 0); parts.push(P(base));
  const shaft = jitterVerts(cyl(r * 0.92, r, H, 10, 3), 0.015, rng);
  { const p = shaft.attributes.position; // jagged break on top
    for (let i = 0; i < p.count; i++) if (p.getY(i) > H / 2 - 0.01) p.setY(i, p.getY(i) - Math.max(0, Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 2 + 1)) * 0.35 - rng() * 0.05); }
  shaft.translate(0, 0.22 + H / 2, 0); parts.push(P(shaft));
  if (o.fallen !== false) {
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const d = jitterVerts(cyl(r * 0.92, r * 0.92, 0.55 + rng() * 0.4, 10), 0.02, rng);
      d.rotateZ(Math.PI / 2); d.rotateY(rng() * Math.PI);
      const a = rng() * Math.PI * 2; d.translate(Math.cos(a) * (0.9 + i * 0.6), r * 0.85, Math.sin(a) * (0.9 + i * 0.6)); parts.push(P(d));
    }
  }
  return finish(parts);
}

/** Scattered cut-stone rubble (a few mossy tumbled blocks). */
export function makeRubble(rng, pal, o = {}) {
  const P = stonePaint(pal, rng, -0.3, 1.2, 0.8), parts = [], n = o.count ?? (3 + Math.floor(rng() * 3)), S = o.size ?? 1;
  for (let i = 0; i < n; i++) {
    const s = (0.25 + rng() * 0.35) * S, b = block(s * (1.2 + rng() * 0.8), s, s * (1 + rng() * 0.4), rng, 0.05 * S);
    b.rotateY(rng() * 3); b.rotateX((rng() - 0.5) * 0.4); b.rotateZ((rng() - 0.5) * 0.4);
    const a = rng() * Math.PI * 2, d = rng() * 0.9 * S; b.translate(Math.cos(a) * d, s * 0.32, Math.sin(a) * d);
    parts.push(P(b));
  }
  return finish(parts);
}

/** Headless statue of the drowned king, hands on a sword, on a two-step plinth (~5 m). */
export function makeKingStatue(rng, pal, o = {}) {
  const parts = [], Y1 = 5.4;
  const P = stonePaint(pal, rng, -0.5, Y1, 0.55);
  const p1 = block(2.6, 0.6, 2.6, rng, 0.05); p1.translate(0, 0.2, 0); parts.push(P(p1));
  const p2 = block(2.0, 0.7, 2.0, rng, 0.04); p2.translate(0, 0.85, 0); parts.push(P(p2));
  const y0 = 1.2;
  // robe: lathe silhouette (hem -> waist -> chest -> shoulders)
  const prof = [[0.0, 0], [0.82, 0], [0.78, 0.25], [0.6, 1.2], [0.5, 1.75], [0.6, 2.35], [0.7, 2.75], [0.42, 3.0], [0.0, 3.05]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const robe = jitterVerts(prep(new THREE.LatheGeometry(prof, 9)), 0.02, rng);
  robe.scale(1, 1, 0.78); robe.translate(0, y0, 0); parts.push(P(robe));
  // cape falling behind
  const cape = jitterVerts(prep(new THREE.CylinderGeometry(0.66, 0.92, 2.7, 9, 1, true, Math.PI * 0.55, Math.PI * 0.9)), 0.02, rng);
  cape.translate(0, y0 + 1.5, -0.08); cape.scale(1, 1, 0.85); parts.push(P(twoSided(cape)));
  // pauldrons, arms down to the sword hilt in front
  for (const s of [-1, 1]) {
    const pd = prep(new THREE.SphereGeometry(0.34, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2)); pd.scale(1, 0.75, 1);
    pd.translate(s * 0.62, y0 + 2.62, 0); parts.push(P(pd));
    const arm = cyl(0.16, 0.2, 1.25, 6); arm.translate(0, -0.62, 0); arm.rotateX(-0.55); arm.rotateZ(s * 0.32);
    arm.translate(s * 0.64, y0 + 2.6, 0.05); parts.push(P(arm));
  }
  const hands = block(0.5, 0.26, 0.3, rng, 0.03); hands.translate(0, y0 + 1.6, 0.78); parts.push(P(hands));
  const blade = block(0.2, 1.75, 0.06, rng, 0.01); blade.translate(0, y0 + 0.55, 0.86); parts.push(P(blade));
  const guard = block(0.85, 0.12, 0.14, rng, 0.01); guard.translate(0, y0 + 1.45, 0.84); parts.push(P(guard));
  const pom = prep(new THREE.OctahedronGeometry(0.11, 0)); pom.translate(0, y0 + 1.86, 0.8); parts.push(P(pom));
  // the snapped neck
  const neck = jitterVerts(cyl(0.2, 0.24, 0.32, 7), 0.05, rng); neck.translate(0, y0 + 3.15, 0); parts.push(P(neck));
  return finish(parts);
}

/** The king's fallen head, crowned, lying on its cheek (crown points carry the glowing shards). ~2.6 m */
export function makeGiantHead(rng, pal, o = {}) {
  const parts = [];
  const P = stonePaint(pal, rng, -1.4, 1.6, 0.65);
  const skull = jitterVerts(prep(new THREE.IcosahedronGeometry(1.25, 1)), 0.06, rng);
  skull.scale(0.92, 1.12, 1.0); parts.push(P(skull));
  const brow = block(1.6, 0.26, 0.5, rng, 0.04); brow.translate(0, 0.25, 0.86); parts.push(P(brow));
  const nose = hexa([[-0.16, -0.35, 1.0], [0.16, -0.35, 1.0], [0.06, 0.2, 1.0], [-0.06, 0.2, 1.0], [-0.16, -0.35, 1.45], [0.16, -0.35, 1.45], [0.06, 0.2, 1.1], [-0.06, 0.2, 1.1]]);
  parts.push(P(jitterVerts(nose, 0.02, rng)));
  for (const s of [-1, 1]) {   // dark eye sockets
    const e = prep(new THREE.SphereGeometry(0.2, 6, 4)); e.scale(1.2, 0.7, 0.5); e.translate(s * 0.42, 0.02, 1.0);
    parts.push(paintFlat(e, 0x2e3436, rng, { jitter: 0.05 }));
  }
  const beard = jitterVerts(prep(new THREE.ConeGeometry(0.75, 1.2, 7)), 0.05, rng); beard.rotateX(Math.PI); beard.scale(1, 1, 0.6); beard.translate(0, -1.15, 0.55); parts.push(P(beard));
  // crown band + points
  const band = prep(new THREE.CylinderGeometry(1.05, 1.0, 0.42, 12, 1, true)); band.translate(0, 0.95, 0); parts.push(paint(twoSided(band), pal.crownDark ?? 0x8a7a52, pal.crown ?? 0xbfa66a, rng, { ao: 0.2, jitter: 0.08 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    if (i === 3) continue;          // one point snapped off
    const sp = prep(new THREE.ConeGeometry(0.17, 0.62, 4)); sp.translate(Math.cos(a) * 1.02, 1.45, Math.sin(a) * 1.02);
    parts.push(paint(sp, pal.crownDark ?? 0x8a7a52, pal.crown ?? 0xbfa66a, rng, { ao: 0.15 }));
  }
  const g = finish(parts);
  g.userData = { crownR: 1.02, crownY: 1.5, points: 7 };
  return g;
}

// =====================================================================================
//  Landforms
// =====================================================================================

/** Slate cliff: a wall of faceted prisms (strata bands, mossy and grassy tops, ledges). o: { w, h, d } */
export function makeCliff(rng, pal, o = {}) {
  const W = o.w ?? 10, H = o.h ?? 8, D = o.d ?? 4, parts = [];
  const bands = pal.slateBands ?? [0x5e6a78, 0x6c7886, 0x7d8896, 0x66717e];
  const n = Math.max(3, Math.round(W / 1.6));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const r = 1.0 + rng() * 0.7, h = H * (o.even ? 0.88 + rng() * 0.18 : (0.55 + 0.45 * Math.sin(t * Math.PI) ** 0.6) * (0.8 + rng() * 0.35));
    const col = jitterVerts(cyl(r * (0.82 + rng() * 0.12), r, h, 5 + Math.floor(rng() * 2), 3), 0.12, rng, 0.4);
    col.rotateY(rng() * Math.PI); col.translate(0, h / 2 - 1.2, 0);
    const tl = o.tilt ?? 1; col.rotateZ((rng() - 0.5) * 0.08 * tl); col.rotateX((-0.04 - rng() * 0.06) * tl);
    col.translate(-W / 2 + t * W + (rng() - 0.5) * 0.6, 0, (rng() - 0.5) * D * 0.6);
    parts.push(paint(col, 0, 0, rng, { bands, bandH: 0.8 + rng() * 0.4, ao: 0.42, jitter: 0.06, moss: pal.cliffMoss ?? pal.moss, mossAmt: 0.95, mossUp: 0.45, y0: -1.2, y1: H }));
  }
  // jutting ledges with grassy tops
  for (let i = 0; i < (o.caps === false ? 0 : Math.round(W / 4)); i++) {
    const w = 1.2 + rng() * 1.6, y = H * (0.25 + rng() * 0.45);
    const l = jitterVerts(prep(new THREE.BoxGeometry(w, 0.45, 1.2, 2, 1, 1)), 0.12, rng);
    l.translate(-W / 2 + rng() * W, y, D * 0.3 + 0.5);
    parts.push(paint(l, bands[1], bands[2], rng, { ao: 0.3, moss: pal.cliffMoss ?? pal.moss, mossAmt: 1, mossUp: 0.4 }));
  }
  // grass / shrub caps on the tallest columns
  for (let i = 0; i < (o.caps === false ? 0 : Math.round(W / 3)); i++) {
    const b = ico(0.7 + rng() * 0.6, 0, rng, 0.2); b.scale(1.3, 0.5, 1.1);
    b.translate(-W / 2 + rng() * W, H * (0.75 + rng() * 0.3), (rng() - 0.5) * D * 0.5);
    parts.push(paint(b, pal.leafDark, pal.leafLight, rng, { ao: 0.3, jitter: 0.1, flutter: 1 }));
  }
  return finish(parts, { height: H * 1.3, amp: 0.0, flutter: 0.02 });
}

// =====================================================================================
//  Dragons and the fallen crown
// =====================================================================================

/** A giant shed dragon scale: a convex keeled shield with banded growth rings and a pale bone rim. */
export function makeScale(rng, pal, o = {}) {
  const S = o.size ?? 1, L = 1.2 * S, Wd = 0.85 * S, N = 24, T = 0.09 * S;
  const outline = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const tip = Math.max(0, Math.cos(a)) ** 4;              // pointed toward +x
    outline.push([Math.cos(a) * L * 0.62 * (1 + tip * 0.5) + L * 0.1, Math.sin(a) * Wd * (1 - tip * 0.3)]);
  }
  const RINGS = [[1, 0.02], [0.9, 0.1], [0.76, 0.13], [0.62, 0.21], [0.46, 0.24], [0.3, 0.31]].map(([k, y]) => [k, y * S]);
  const keel = (p) => [p[0], p[1] + Math.max(0, 1 - Math.abs(p[2]) / (0.14 * S)) * 0.07 * S, p[2]];
  const ring = ([k, y]) => outline.map(([x, z]) => keel([x * k, y, z * k]));
  const rings = RINGS.map(ring), bot = outline.map(([x, z]) => [x * 0.98, -T, z * 0.98]);
  const ctr = [L * 0.06, 0.36 * S, 0];
  const C = (h) => new THREE.Color(h);
  const base = C(pal.scale ?? 0x4e3337), dark = base.clone().multiplyScalar(0.72), edge = C(pal.scaleEdge ?? 0xb6a68a);
  const band = [edge.clone().lerp(base, 0.35), base, dark, base, dark, base];
  const pos = [], col = [];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); const j = 1 + (rng() - 0.5) * 0.08; for (let q = 0; q < 3; q++) col.push(k.r * j, k.g * j, k.b * j); };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    for (let r = 0; r < rings.length - 1; r++) { const A = rings[r], B = rings[r + 1]; tri(A[i], A[j], B[j], band[r]); tri(A[i], B[j], B[i], band[r]); }
    const In = rings[rings.length - 1]; tri(In[i], In[j], ctr, band[5]);
    tri(rings[0][i], bot[j], rings[0][j], edge); tri(rings[0][i], bot[i], bot[j], edge);
    tri(bot[j], bot[i], [L * 0.05, -T, 0], edge.clone().multiplyScalar(0.6));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  orientOutward(g, [L * 0.06, 0.02 * S, 0]);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('fl', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  return finish([g]);
}
/** Make every triangle face away from point c (for convex-ish closed shells built by hand). */
function orientOutward(g, c) {
  const p = g.attributes.position.array;
  for (let f = 0; f < p.length; f += 9) {
    const ax = p[f], ay = p[f + 1], az = p[f + 2];
    const ux = p[f + 3] - ax, uy = p[f + 4] - ay, uz = p[f + 5] - az, vx = p[f + 6] - ax, vy = p[f + 7] - ay, vz = p[f + 8] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (ax + p[f + 3] + p[f + 6]) / 3 - c[0], my = (ay + p[f + 4] + p[f + 7]) / 3 - c[1], mz = (az + p[f + 5] + p[f + 8]) / 3 - c[2];
    if (nx * mx + ny * my + nz * mz < 0) for (let q = 0; q < 3; q++) { const t = p[f + 3 + q]; p[f + 3 + q] = p[f + 6 + q]; p[f + 6 + q] = t; }
  }
}

/** Cluster of hexagonal crown-shard crystals (goes into the glow batch). o: { size, n } */
export function makeCrystals(rng, pal, o = {}) {
  const S = o.size ?? 1, parts = [], n = o.n ?? (3 + Math.floor(rng() * 4));
  for (let i = 0; i < n; i++) {
    const r = (0.06 + rng() * 0.09) * S * (i === 0 ? 1.35 : 1), h = (0.35 + rng() * 0.55) * S * (i === 0 ? 1.4 : 1);
    const body = cyl(r, r * 1.05, h, 6); body.translate(0, h / 2, 0);
    const tip = prep(new THREE.ConeGeometry(r, r * 2.4, 6)); tip.translate(0, h + r * 1.2, 0);
    const c = mergeGeometries([body, tip]); body.dispose(); tip.dispose();
    c.rotateZ((rng() - 0.5) * 0.9 * (i === 0 ? 0.3 : 1)); c.rotateY(rng() * Math.PI * 2);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : (0.08 + rng() * 0.14) * S;
    c.translate(Math.cos(a) * d, -0.06 * S, Math.sin(a) * d);
    parts.push(paint(c, pal.crystalBase ?? 0x9cc0e0, pal.crystal ?? 0xe6f4ff, rng, { ao: 0, jitter: 0.06 }));
  }
  return finish(parts);
}

/**
 * Dragon-scorched ground: pale ash at the heart, a charcoal ring, a ragged burnt-olive fringe with a few
 * scorch rays (flat decal, smooth vertex colours) and burnt stalks. o: { r }
 */
export function makeScorch(rng, pal, o = {}) {
  const R = o.r ?? 2, N = 30, pos = [], col = [];
  const cA = new THREE.Color(pal.ash ?? 0x8a857c), cM = new THREE.Color(pal.char ?? 0x27231f), cE = new THREE.Color(pal.charEdge ?? 0x3d3b2b);
  const r1 = [], r2 = [], r3 = [];
  for (let i = 0; i < N; i++) {
    const w = 0.92 + 0.08 * Math.sin(i * 1.7) + rng() * 0.1;
    r1.push(R * 0.3 * (0.75 + rng() * 0.5)); r2.push(R * 0.66 * w); r3.push(R * (0.86 + rng() * 0.22) * w);
  }
  const P = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
  const push = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); };
  const ash = cA.clone().lerp(cM, 0.4), soot = cM.clone().multiplyScalar(0.75);
  const ringC = []; for (let i = 0; i < N; i++) ringC.push(rng() < 0.4 ? ash : cM);   // ash drifts streak the burn
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a0 = (i / N) * Math.PI * 2, a1 = (j / N) * Math.PI * 2;
    push([0, 0, 0], soot); push(P(a1, r1[j]), soot); push(P(a0, r1[i]), soot);
    push(P(a0, r1[i]), soot); push(P(a1, r1[j]), soot); push(P(a1, r2[j]), ringC[j]);
    push(P(a0, r1[i]), soot); push(P(a1, r2[j]), ringC[j]); push(P(a0, r2[i]), ringC[i]);
    push(P(a0, r2[i]), ringC[i]); push(P(a1, r2[j]), ringC[j]); push(P(a1, r3[j]), cE);
    push(P(a0, r2[i]), ringC[i]); push(P(a1, r3[j]), cE); push(P(a0, r3[i]), cE);
  }
  for (let i = 0; i < 7; i++) {      // scorch rays
    const a = rng() * Math.PI * 2, ra = R * 0.8, rb = R * (1.2 + rng() * 0.35), w = R * (0.05 + rng() * 0.04);
    const t = [-Math.sin(a) * w, 0, Math.cos(a) * w], b = P(a, ra);
    push([b[0] - t[0], 0, b[2] - t[2]], cM); push([b[0] + t[0], 0, b[2] + t[2]], cM); push(P(a, rb), cE);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  orientUp(g);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('fl', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.translate(0, 0.025, 0);
  const parts = [g];
  for (let i = 0; i < 8; i++) {      // burnt stalks
    const a = rng() * Math.PI * 2, r = R * (0.5 + rng() * 0.55);
    const s = prep(new THREE.ConeGeometry(0.035, 0.18 + rng() * 0.22, 4)); s.rotateZ((rng() - 0.5) * 0.6); s.translate(Math.cos(a) * r, 0.09, Math.sin(a) * r);
    parts.push(paintFlat(s, 0x221c18, rng));
  }
  return finish(parts);
}
function orientUp(g) {
  const p = g.attributes.position.array;
  for (let f = 0; f < p.length; f += 9) {
    const ux = p[f + 3] - p[f], uz = p[f + 5] - p[f + 2], vx = p[f + 6] - p[f], vz = p[f + 8] - p[f + 2];
    if (uz * vx - ux * vz < 0) for (let q = 0; q < 3; q++) { const t = p[f + 3 + q]; p[f + 3 + q] = p[f + 6 + q]; p[f + 6 + q] = t; }
  }
}

/**
 * Gravel bar / sand shoal: an irregular flat lens that hugs the terrain and stays just above the
 * water level where it runs into the river, with scattered pebbles. Built in world space around
 * (cx, cz); place it at { x: cx, z: cz, y: 0 }.
 */
export function makeShoal(rng, pal, { cx, cz, rx, rz, rot = 0, heightFn, waterY = -0.08, pebbles = 1 }) {
  const N = 20, rings = [0, 0.45, 0.8, 1], pos = [], col = [];
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const edge = []; for (let i = 0; i < N; i++) edge.push(0.82 + rng() * 0.3);
  const V = (k, i) => {
    const a = (i / N) * Math.PI * 2, e = k === 0 ? 0 : rings[k] * (k === rings.length - 1 ? edge[i % N] : 1 + (edge[i % N] - 1) * 0.5);
    const lx = Math.cos(a) * rx * e, lz = Math.sin(a) * rz * e;
    const x = lx * cs - lz * sn, z = lx * sn + lz * cs;
    const y = Math.max(heightFn(cx + x, cz + z), waterY) + 0.03 + (k < rings.length - 1 ? 0.025 * (1 - rings[k]) : 0);
    return [x, y, z, k];
  };
  const sand = new THREE.Color(pal.sand ?? 0xb7a886), grav = new THREE.Color(pal.gravel ?? 0x8d8676), wet = new THREE.Color(pal.sandWet ?? 0x857a62);
  const C = (v) => {
    const n = fbm((cx + v[0]) * 0.7, (cz + v[2]) * 0.7, 2);
    const c = sand.clone().lerp(grav, smooth(0.35, 0.65, n));
    return c.lerp(wet, v[3] === rings.length - 1 ? 0.55 : v[3] === 2 ? 0.2 : 0);
  };
  const push = (v) => { const c = C(v); pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); };
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < N; i++) {
    const a = V(k, i), b = V(k, i + 1), c = V(k + 1, i), d = V(k + 1, i + 1);
    if (k === 0) { push(a); push(d); push(c); continue; }
    push(a); push(b); push(d); push(a); push(d); push(c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  orientUp(g);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('fl', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  const parts = [g];
  const np = Math.round(rx * rz * 2.2 * pebbles);
  const pcol = [pal.pebbleA ?? 0x8a8f94, pal.pebbleB ?? 0xa59a84, pal.pebbleC ?? 0x6f7680];
  for (let i = 0; i < np; i++) {
    const a = rng() * Math.PI * 2, e = Math.sqrt(rng()) * 0.85;
    const lx = Math.cos(a) * rx * e, lz = Math.sin(a) * rz * e, x = lx * cs - lz * sn, z = lx * sn + lz * cs;
    const s = 0.06 + rng() * 0.12;
    const p = ico(s, 0, rng, 0.25); p.scale(1.3, 0.55, 1);
    p.rotateY(rng() * 3);
    p.translate(x, Math.max(heightFn(cx + x, cz + z), waterY) + 0.04, z);
    parts.push(paint(p, pcol[i % 3], new THREE.Color(pcol[i % 3]).multiplyScalar(1.15).getHex(), rng, { ao: 0.3, jitter: 0.1 }));
  }
  return finish(parts);
}

// =====================================================================================
//  Glow material for the crown shards (one draw): vertex-coloured Lambert + slow pulsing emissive.
// =====================================================================================
export function createShardMaterial(hex = 0xe6f4ff) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(hex) });
  m.emissiveIntensity = 0.24;
  const uPulse = { value: 0 };
  patchEnv(m, {
    key: 'riverShards', uniforms: { uPulse }, fragmentPars: 'uniform float uPulse;',
    // shimmer travels up each crystal; the tips glow a little more than the bases
    emissiveFragment: 'totalEmissiveRadiance *= 0.55 + 0.45 * smoothstep(0.0, 0.9, vEnvWorld.y) + 0.25 * sin(uTime * 2.3 + vEnvWorld.x * 1.7 + vEnvWorld.z * 1.3 + vEnvWorld.y * 4.0) + uPulse;',
  });
  m.userData.uPulse = uPulse;
  return m;
}

// =====================================================================================
//  Water: the Reach builds its own sheet (instead of one ribbon per river) so braids, pools and
//  confluences are ONE continuous surface with a true distance-to-bank (islands, shoals, piers
//  and stepping stones included -> foam rings), a separate depth channel (shallow fords in the
//  arena, deep water outside), whitewater where falls land, a visible pebbly riverbed in the
//  shallows, modest sparkle inside the arena and wading ripples around the player.
// =====================================================================================

const RW_PARS = /* glsl */`
uniform vec3 uDeep, uShallow, uFoam;
uniform float uSpeed, uSparkle, uFoamW;
uniform vec3 uFadeTarget;
varying vec2 vWUv;       // x metres inside the river bank, y metres along the current
varying vec4 vWAux;      // x depth 0..1, y whitewater 0..1, z sparkle mask, w metres to the nearest obstacle (stone / pier / bar)
float wFoam = 0.0;
`;
const RW_COLOR = /* glsl */`
{
  float edgeR = vWUv.x;                          // river banks: streaks, depth, sparkle
  float edgeM = min(vWUv.x, vWAux.w);            // banks + obstacles: foam
  vec2 wp = vEnvWorld.xz;
  vec2 fuv = vec2(edgeR, vWUv.y - uTime * uSpeed);
  float n1 = envNoise(wp * 0.5 + vec2(0.0, uTime * 0.2));
  float n2 = envNoise(fuv * vec2(1.3, 0.45) + vec2(5.2, uTime * 0.25));
  float streak = smoothstep(0.64, 0.72, envNoise(fuv * vec2(1.2, 0.16) + 3.0));
  float depth = clamp(vWAux.x, 0.0, 1.0);
  // riverbed seen through shallow water (wobbles with the surface)
  vec2 bw = wp + vec2(sin(uTime * 1.3 + wp.y * 1.7), cos(uTime * 1.1 + wp.x * 1.9)) * 0.05;
  float bed = envNoise(bw * 0.8) * 0.6 + envNoise(bw * 2.6 + 3.0) * 0.4;
  float peb = smoothstep(0.66, 0.74, envNoise(bw * 4.2 + 5.0));
  vec3 sh = uShallow * (0.84 + 0.28 * bed) * (1.0 - 0.16 * peb);
  vec3 c = mix(sh, uDeep, smoothstep(0.05, 1.0, depth));
  c *= 0.95 + 0.1 * envNoise(wp * 0.35 - uTime * 0.05);
  c = mix(c, mix(uShallow, uFoam, 0.35), streak * (0.18 + 0.2 * depth) * smoothstep(0.3, 1.4, edgeM));
  // foam band along banks and around stones / piers / gravel bars
  float fe = uFoamW * (0.45 + 0.7 * n1) + 0.05 * sin(vWUv.y * 1.7 - uTime * 2.2);
  wFoam = 1.0 - smoothstep(fe, fe + 0.07, edgeM);
  wFoam = max(wFoam, step(0.86, n2) * (1.0 - smoothstep(0.3, 1.2, edgeM)) * 0.7);
  // whitewater (falls plunge pools, rapids at piers / stones, confluences)
  float ww = vWAux.y;
  if (ww > 0.01) {
    float tur = envNoise(fuv * vec2(2.2, 0.9) + vec2(1.7, uTime * 0.9)) * 0.6 + n2 * 0.4;
    wFoam = max(wFoam, smoothstep(0.62, 0.7, tur + ww * 0.5) * min(1.0, ww * 1.3));
    c = mix(c, mix(uShallow, uFoam, 0.6) * 1.05, ww * 0.16);
  }
  // wading ripples around the player
  float pd = length(wp - uFadeTarget.xz);
  float rip = (1.0 - smoothstep(0.4, 2.0, pd)) * smoothstep(0.15, 0.4, pd);
  rip *= smoothstep(0.75, 0.95, sin(pd * 9.0 - uTime * 6.0)) * smoothstep(0.2, 0.8, edgeM);
  c = mix(c, uFoam, rip * 0.4);
  c = mix(c, uShallow * 1.06, (1.0 - smoothstep(fe + 0.07, fe + 0.45, edgeM)) * 0.4);
  c = mix(c, uFoam, clamp(wFoam, 0.0, 1.0) * 0.92);
  diffuseColor.rgb = c;
}
`;
const RW_EMISSIVE = /* glsl */`
{
  vec2 sp = vEnvWorld.xz * 2.4;
  float s = envNoise(sp + vec2(uTime * 0.9, -uTime * 0.6)) * envNoise(sp * 1.37 - vec2(uTime * 0.7, uTime * 0.5));
  totalEmissiveRadiance += uFoam * uSparkle * vWAux.z * smoothstep(0.6, 0.68, s) * (1.0 - clamp(wFoam, 0.0, 1.0)) * smoothstep(0.4, 1.2, min(vWUv.x, vWAux.w));
}
`;

/** pal: { deep, shallow, foam }. o: { speed, sparkle, foamWidth } */
export function createRiverWaterMaterial(pal, { speed = 0.9, sparkle = 0.7, foamWidth = 0.2 } = {}) {
  const uniforms = {
    uDeep: { value: new THREE.Color(pal.deep) }, uShallow: { value: new THREE.Color(pal.shallow) }, uFoam: { value: new THREE.Color(pal.foam) },
    uSpeed: { value: speed }, uSparkle: { value: sparkle }, uFoamW: { value: foamWidth }, uFadeTarget: ENV.uFadeTarget,
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  patchEnv(mat, {
    key: 'riverSheet', uniforms,
    vertexPars: 'attribute vec4 aAux;\nvarying vec2 vWUv;\nvarying vec4 vWAux;', vertexMain: 'vWUv = uv; vWAux = aAux;',
    fragmentPars: RW_PARS, colorFragment: RW_COLOR, emissiveFragment: RW_EMISSIVE,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}

/**
 * Water sheet over a grid. field(x, z) -> null (no water) | { bank, flow, depth, white, sparkle }:
 * bank = metres inside the nearest bank (negative outside), flow = metres along the current.
 * Cells are kept where any corner has bank > -keep. All vertices at y.
 */
export function buildWaterSheet({ x0, z0, x1, z1, cell = 0.8, y = -0.08, keep = 1.2, field }) {
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const V = new Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) V[j * (nx + 1) + i] = field(x0 + i * cell, z0 + j * cell);
  const pos = [], uv = [], aux = [], nrm = [], idx = [], map = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const vid = (i, j) => {
    const k = j * (nx + 1) + i;
    if (map[k] >= 0) return map[k];
    const f = V[k];
    map[k] = pos.length / 3;
    pos.push(x0 + i * cell, y, z0 + j * cell); nrm.push(0, 1, 0);
    uv.push(f ? f.bank : -keep * 2, f ? f.flow : 0);
    aux.push(f ? f.depth : 0, f ? f.white : 0, f ? f.sparkle : 0, f ? (f.land ?? 99) : 99);
    return map[k];
  };
  const ok = (f) => f && f.bank > -keep;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = V[j * (nx + 1) + i], b = V[j * (nx + 1) + i + 1], c = V[(j + 1) * (nx + 1) + i], d = V[(j + 1) * (nx + 1) + i + 1];
    if (!(ok(a) || ok(b) || ok(c) || ok(d))) continue;
    if (!a || !b || !c || !d) continue;
    // flow discontinuity guard (two different channels meeting): skip extreme jumps
    const va = vid(i, j), vb = vid(i + 1, j), vc = vid(i, j + 1), vd = vid(i + 1, j + 1);
    idx.push(va, vc, vb, vb, vc, vd);   // CCW seen from +y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAux', new THREE.Float32BufferAttribute(aux, 4));
  g.setIndex(idx);
  return g;
}

/**
 * Waterfall ribbons (merged): each fall = a slightly convex sheet with a curved lip, wider at the
 * bottom. falls: [{ x, y0 (bottom), y1 (top), z, w, rotY, lip }]. uv.y = metres from the top, aligned so
 * every fall's foot lands at v = L (the waterfall material foams the last 1.5 m).
 */
export function buildFalls(falls, L) {
  const geos = [];
  for (const f of falls) {
    const H = f.y1 - f.y0, segX = 4, segY = 10, pos = [], uv = [], idx = [];
    for (let j = 0; j <= segY; j++) {
      const t = j / segY;                       // 0 top -> 1 bottom
      const y = f.y1 - H * t;
      const w = f.w * (1 + 0.25 * t);
      const out = (f.lip ?? 0.8) * (1 - (1 - t) ** 3) * 0.6 + 0.25 * Math.sin(t * Math.PI);   // bulge away from the cliff
      for (let i = 0; i <= segX; i++) {
        const s = i / segX - 0.5;
        const bow = -Math.abs(s) * 0.4;
        pos.push(s * w, y, out + bow);
        uv.push(w / 2 - Math.abs(s) * w, L - H + H * t);
      }
    }
    for (let j = 0; j < segY; j++) for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // the lip: a short horizontal run-out on top of the cliff
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g = g.toNonIndexed();
    g.rotateY(f.rotY ?? Math.PI / 4);
    g.translate(f.x, 0, f.z);
    g.computeVertexNormals();
    geos.push(g);
  }
  const m = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  // face the normals toward the camera-ish (front side) for lighting
  return m;
}

// =====================================================================================
//  GPU-animated sprite layers (each ONE draw, no per-frame CPU work besides two uniforms set in
//  onBeforeRender from the renderer: pixels-per-metre and the camera target).
// =====================================================================================
const _rs = new THREE.Vector2();
const ISO_K = 120 / Math.hypot(1, 1.22, 1);   // engine.isoOffset (camera = target + (1, 1.22, 1) * ISO_K)
function hookPPU(obj, uniforms) {
  obj.onBeforeRender = (renderer, scene, camera) => {
    renderer.getDrawingBufferSize(_rs);
    uniforms.uPPU.value = (_rs.y / Math.max(1e-3, camera.top - camera.bottom)) * camera.zoom;
  };
}

const SPRITE_VS_HEAD = /* glsl */`
uniform float uTime, uPPU;
attribute vec4 aRand;
`;

/** Waterfall mist: soft billows rising and spreading from each fall's foot. sources: [{x, y, z, w}] */
export function createMist(sources, { count = 70, color = 0xe8f2f4, opacity = 0.32, size = 2.4 } = {}) {
  const n = sources.length * count, pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4), src = new Float32Array(n * 4);
  let k = 0;
  let seed = 7;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const s of sources) for (let i = 0; i < count; i++, k++) {
    pos[k * 3] = s.x; pos[k * 3 + 1] = s.y; pos[k * 3 + 2] = s.z;
    rnd[k * 4] = R(); rnd[k * 4 + 1] = R(); rnd[k * 4 + 2] = R(); rnd[k * 4 + 3] = R();
    src[k * 4] = s.w; src[k * 4 + 1] = s.h ?? 3; src[k * 4 + 2] = s.dx ?? 0.7; src[k * 4 + 3] = s.dz ?? 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('aSrc', new THREE.BufferAttribute(src, 4));
  const uniforms = { uTime: ENV.uTime, uPPU: { value: 40 }, uSize: { value: size }, uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color) }, uHazeColor: ENV.uHazeColor };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: SPRITE_VS_HEAD + /* glsl */`
      attribute vec4 aSrc;
      uniform float uSize;
      varying float vA;
      void main() {
        float life = 4.0 + aRand.w * 3.0;
        float t = fract(uTime / life + aRand.x);
        vec3 p = position;
        float a = aRand.y * 6.2831853;
        vec2 side = vec2(cos(a), sin(a)) * (aRand.z * 0.5 + 0.2);
        p.x += (aRand.y - 0.5) * aSrc.x + (side.x * 2.5 + aSrc.z * 3.0) * t;
        p.z += (aRand.z - 0.5) * aSrc.x * 0.6 + (side.y * 2.5 + aSrc.w * 3.0) * t;
        p.y += t * aSrc.y * (0.6 + aRand.w * 0.8) + 0.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPPU * (0.5 + 0.9 * t) * (0.7 + 0.6 * aRand.z);
        vA = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.45, 1.0, t));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.0, 0.5, d)) * vA * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'env.mist';
  pts.frustumCulled = false;
  pts.matrixAutoUpdate = false;
  pts.renderOrder = 5;
  hookPPU(pts, uniforms);
  pts.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return pts;
}

/**
 * Dragonflies: darting hover-and-dash flight around fixed world anchors (along the water).
 * anchors: [[x, z], ...]; colours: body hues (never red).
 */
export function createDragonflies(anchors, { colors = [0x2fb8c8, 0x4a86e8, 0x46c07c], size = 0.62 } = {}) {
  const n = anchors.length, pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4), col = new Float32Array(n * 3);
  let seed = 99;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = anchors[i][0]; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = anchors[i][1];
    rnd[i * 4] = R(); rnd[i * 4 + 1] = R(); rnd[i * 4 + 2] = R(); rnd[i * 4 + 3] = R();
    c.set(colors[i % colors.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const uniforms = { uTime: ENV.uTime, uPPU: { value: 40 }, uSize: { value: size } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: SPRITE_VS_HEAD + /* glsl */`
      attribute vec3 aCol;
      uniform float uSize;
      varying vec3 vCol;
      varying float vRot;
      varying float vFlap;
      vec2 hpos(float k, vec4 r) {   // k-th hover point around the anchor (hash)
        float a = fract(sin(k * 12.9898 + r.x * 78.233) * 43758.5453) * 6.2831853;
        float d = 0.6 + fract(sin(k * 39.346 + r.y * 11.135) * 23421.631) * 2.8;
        return vec2(cos(a), sin(a)) * d;
      }
      void main() {
        float T = 1.1 + aRand.z * 1.6;
        float tt = uTime / T + aRand.w * 10.0;
        float k = floor(tt), f = fract(tt);
        vec2 A = hpos(k, aRand), B = hpos(k + 1.0, aRand);
        float m = smoothstep(0.0, 0.22, f);                      // dash, then hover
        vec2 o = mix(A, B, m);
        o += vec2(sin(uTime * 7.0 + aRand.x * 30.0), cos(uTime * 6.3 + aRand.y * 30.0)) * 0.04;
        vec3 p = position + vec3(o.x, 0.55 + aRand.y * 0.7 + sin(uTime * 1.7 + aRand.z * 9.0) * 0.08, o.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPPU;
        // heading in screen space (dash direction)
        vec2 d = B - A;
        vec2 sd = vec2(d.x - d.y, -(d.x + d.y) * 0.75);           // world xz -> screen (right, up)
        vRot = atan(sd.y, sd.x);
        vFlap = uTime * 38.0 + aRand.x * 20.0;
        vCol = aCol;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      varying float vRot;
      varying float vFlap;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        p.y = -p.y;
        float c = cos(vRot), s = sin(vRot);
        p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);         // p.x along the body
        float body = length(vec2(p.x * 1.0, p.y * 9.0)) - 0.36;
        float head = length(p - vec2(0.28, 0.0)) - 0.065;
        float flap = 0.55 + 0.45 * abs(sin(vFlap));
        vec2 q = vec2(abs(p.x - 0.1) - 0.0, abs(p.y));
        float w1 = length(vec2((p.x - 0.14) * 4.2, (abs(p.y) - 0.21 * flap) * 1.6)) - 0.19 * flap;
        float w2 = length(vec2((p.x + 0.02) * 4.2, (abs(p.y) - 0.19 * flap) * 1.6)) - 0.17 * flap;
        float wing = min(w1, w2);
        if (min(min(body, head), wing) > 0.0) discard;
        if (min(body, head) < 0.0) {
          float stripe = step(0.5, fract(p.x * 14.0));
          gl_FragColor = vec4(vCol * (0.75 + 0.35 * stripe), 1.0);
        } else {
          gl_FragColor = vec4(mix(vec3(0.92, 0.97, 1.0), vCol, 0.25), 0.42);
        }
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'env.dragonflies';
  pts.frustumCulled = false;
  pts.matrixAutoUpdate = false;
  pts.renderOrder = 6;
  hookPPU(pts, uniforms);
  pts.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return pts;
}

/**
 * Passing showers: thin slanted rain streaks (camera-window quads, one draw). Intensity comes and
 * goes on its own slow cycle (uRain set by the caller's update), and never gets heavy enough to
 * hide the fight.
 */
export function createRain({ count = 700, window = 64, height = 16, len = 1.1, width = 0.025, color = 0xd8e6f2, opacity = 0.22 } = {}) {
  const pos = new Float32Array(count * 6 * 3), rnd = new Float32Array(count * 6 * 4), cnr = new Float32Array(count * 6 * 2);
  let seed = 4242;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const C = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
  for (let i = 0; i < count; i++) {
    const r = [R(), R(), R(), R()];
    for (let k = 0; k < 6; k++) {
      const o = i * 6 + k;
      rnd.set(r, o * 4); cnr[o * 2] = C[k][0]; cnr[o * 2 + 1] = C[k][1];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(cnr, 2));
  const uniforms = {
    uTime: ENV.uTime, uWindDir: ENV.uWindDir, uWindStrength: ENV.uWindStrength,
    uWindow: { value: window }, uHeight: { value: height }, uLen: { value: len }, uWidth: { value: width },
    uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uRain: { value: 0 }, uIso: { value: ISO_K },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uWindStrength, uWindow, uHeight, uLen, uWidth, uRain, uIso;
      uniform vec2 uWindDir;
      attribute vec4 aRand;
      attribute vec2 aCorner;
      varying float vA;
      void main() {
        vec2 ctr = cameraPosition.xz - vec2(uIso);                     // camera target on the ground
        vec2 fall = uWindDir * (2.0 + 3.0 * uWindStrength);           // m/s sideways
        float speed = 13.0 + aRand.w * 4.0;
        float ph = fract(aRand.z + uTime * speed / uHeight);
        float y = uHeight * (1.0 - ph);
        // world-anchored drops in a screen-aligned periodic window (u = screen-right, v = screen-up)
        vec2 U = vec2(0.70710678, -0.70710678), V = vec2(-0.70710678, -0.70710678);
        vec2 win = vec2(uWindow * 1.25, uWindow);
        vec2 base = aRand.xy * win + floor(aRand.z + uTime * speed / uHeight) * vec2(7.31, 3.17);   // reshuffle each fall cycle
        base += vec2(dot(fall, U), dot(fall, V)) * (uHeight - y) / speed;
        vec2 fc = vec2(dot(ctr, U), dot(ctr, V));
        vec2 q = base + win * floor((fc - base) / win + 0.5);
        vec2 xz = q.x * U + q.y * V;
        vec3 dir = normalize(vec3(fall.x, -speed, fall.y));
        vec3 right = vec3(0.70710678, 0.0, -0.70710678);
        vec3 p = vec3(xz.x, y, xz.y) + dir * uLen * aCorner.x + right * uWidth * aCorner.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vA = uRain * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.85, 1.0, ph)) * (0.5 + 0.5 * aRand.y) * step(aRand.x, 0.25 + 0.75 * uRain);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main() { gl_FragColor = vec4(uColor, vA * uOpacity); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env.rain';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 7;
  mesh.userData.uniforms = uniforms;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

export { smooth };
