import * as THREE from 'three';
import { patchEnv, mulberry32 } from '../env/common.js';
import { ico, prep, paint, paintFlat, tubeAlong, thornsAlong, thorn, bake } from './geo.js';
import { TAU, nearK, heightCap } from './common.js';

// =====================================================================================
//  Thornwood arena wall (Gorrak): a hedge of interlaced brambles with root arches and a few
//  antler-like branches. Warm greens, dark thorns, moss on every up face, amber blossoms.
//  Layers (draw calls): tangle x2 (low front row), mass x2 (tall back rows), arch, antler.
// =====================================================================================

const C = {
  vine0: 0x1c120d, vine1: 0x4a3828, root0: 0x2e2118, root1: 0x6e5038, moss: 0x4f8a38,
  leafShade: 0x16401f, leafDark: 0x2a5e2a, leafMid: 0x438434, leafLight: 0x6aa844, leafWarm: 0x93bf52,
  thorn0: 0x1a120c, thorn1: 0xd4c49a, bone0: 0x5a4838, bone1: 0xd9ceb0, blossom: 0xdfa93c,
};

function vine(parts, rng, pts, r0, r1, o = {}) {
  const { geo, curve } = tubeAlong(pts, r0, r1, { radial: o.radial ?? 4, segs: o.segs ?? 7, flare: o.flare ?? 0 });
  paint(geo, o.c0 ?? C.vine0, o.c1 ?? C.vine1, rng, { ao: 0.5, jitter: 0.1, moss: C.moss, mossAmt: o.moss ?? 0.35, mossUp: 0.6 });
  parts.push(geo);
  if (o.every !== 0) {
    thornsAlong(parts, curve, rng, {
      every: o.every ?? 0.4, len: o.len ?? 0.4, r: o.tr ?? 0.055, c0: C.thorn0, c1: C.thorn1,
      bias: o.bias ?? [0, 0.35, 0.55], rad0: r0, rad1: r1, t0: o.t0 ?? 0.1, hook: 0.35,
    });
  }
  return curve;
}

/** Lumpy leaf mass (dark underside, sun-lit top). */
function leafBlob(parts, rng, x, y, z, r, o = {}) {
  const sy = o.sy ?? 0.65;
  const g = ico(r, o.d ?? 1, rng, o.amt ?? 0.28);
  g.scale(o.sx ?? 1, sy, o.sz ?? 1);
  g.translate(x, y, z);
  const q = rng(), top = q < 0.1 ? C.leafWarm : q < 0.35 ? C.leafLight : C.leafMid;
  parts.push(paint(g, C.leafShade, top, rng, { ao: 0.75, jitter: 0.1, hueJitter: 0.07, y0: y - r * sy, y1: y + r * sy }));
}

function blossom(parts, rng, x, y, z, s = 1) {
  const g = prep(new THREE.OctahedronGeometry(0.08 * s, 0));
  g.translate(x, y, z);
  parts.push(paintFlat(g, C.blossom, rng, { jitter: 0.08 }));
}

// ---- low front tangle: a squat hedge loaf, knotted canes <= 0.85 u, a fan of thorns ----
function makeTangle(rng) {
  const parts = [], L = 3.6;
  for (let i = 0; i < 3; i++) {
    const x = -L / 2 + 0.6 + i * (L - 1.2) / 2 + (rng() - 0.5) * 0.3;
    leafBlob(parts, rng, x, 0.2 + rng() * 0.06, 0.75 + rng() * 0.45, 0.6 + rng() * 0.15, { sx: 1.3, sy: 0.7, sz: 1.0, amt: 0.3 });
  }
  for (let i = 0; i < 6; i++) {
    const z0 = 0.28 + (i / 5) * 1.05 + (rng() - 0.5) * 0.2, dir = i % 2 ? 1 : -1;
    const x0 = -L / 2 + 0.1 + rng() * 0.5, x1 = L / 2 - 0.1 - rng() * 0.5;
    const pts = [[x0, -0.1, z0], [x0 + (x1 - x0) * 0.25, 0.4 + rng() * 0.3, z0 + dir * 0.25], [x0 + (x1 - x0) * 0.5, 0.25 + rng() * 0.35, z0 - dir * 0.2],
      [x0 + (x1 - x0) * 0.75, 0.5 + rng() * 0.3, z0 + dir * 0.2], [x1, -0.05, z0 - dir * 0.1]];
    vine(parts, rng, pts, 0.12, 0.075, { every: 0.36, len: 0.36, tr: 0.06, bias: [0, 0.45, 0.4], radial: 4 });
  }
  for (let i = 0; i < 2; i++) {     // hoops that arc out of the ground and back in
    const x = -L / 2 + 0.9 + i * (L - 1.8) + (rng() - 0.5) * 0.4, z = 0.3 + rng() * 0.9, w = 0.55 + rng() * 0.4;
    vine(parts, rng, [[x - w, -0.1, z], [x - w * 0.55, 0.55, z], [x, 0.8 + rng() * 0.08, z], [x + w * 0.55, 0.55, z], [x + w, -0.1, z]], 0.13, 0.09, { every: 0.34, len: 0.34, tr: 0.06, radial: 4 });
  }
  for (let i = 0; i < 8; i++) {       // ground thorns
    const x = (rng() - 0.5) * L, z = 0.1 + rng() * 1.4, lean = (rng() - 0.5) * 0.5;
    parts.push(thorn([x, -0.05, z], [lean, 1, 0.2 + rng() * 0.4], 0.4 + rng() * 0.3, 0.065, C.thorn0, C.thorn1, rng));
  }
  for (let i = 0; i < 2; i++) blossom(parts, rng, (rng() - 0.5) * L * 0.8, 0.5 + rng() * 0.25, 0.3 + rng() * 0.9);
  return bake(parts, { glow: false });
}

// ---- tall bramble hedge: a dark leafy body, thick arching canes and long thorns ----
function makeMass(rng, H = 3.0) {
  const parts = [], L = 4.4;
  for (let i = 0; i < 4; i++) {       // body: overlapping dark lumps so the wall reads as one dense hedge
    const x = -L / 2 + 0.6 + i * (L - 1.2) / 3 + (rng() - 0.5) * 0.4;
    const y = H * (0.3 + rng() * 0.16), r = 0.9 + rng() * 0.3;
    leafBlob(parts, rng, x, y, 1.0 + rng() * 0.8, r, { sx: 1.15, sy: 1.1 + H * 0.12, sz: 1, amt: 0.3 });
  }
  for (let i = 0; i < 3; i++) {
    const x = -L / 2 + 1.0 + i * (L - 2.0) / 2 + (rng() - 0.5) * 0.5;
    leafBlob(parts, rng, x, H * (0.6 + rng() * 0.2), 1.4 + rng() * 0.6, 0.5 + rng() * 0.22, { sx: 1.1, sy: 0.85, amt: 0.3 });
  }
  for (let i = 0; i < 7; i++) {       // thick arching canes that out-reach the body, with long hooked thorns
    const x0 = -L / 2 + 0.3 + i * (L - 0.6) / 6 + (rng() - 0.5) * 0.4, z0 = 0.3 + rng() * 0.6;
    const lean = (rng() - 0.5) * 2.6, top = H * (0.8 + rng() * 0.5);
    const pts = [[x0, -0.2, z0], [x0 + lean * 0.1, top * 0.3, z0 + (rng() - 0.5) * 0.4], [x0 + lean * 0.4, top * 0.68, z0 + rng() * 0.6],
      [x0 + lean * 0.85, top, z0 + (rng() - 0.3) * 0.6], [x0 + lean * 1.25, top * 0.8, z0 + rng() * 0.6]];
    vine(parts, rng, pts, 0.24, 0.06, { flare: 0.6, radial: 5, segs: 6, every: 0.5, len: 0.8, tr: 0.1, moss: 0.3, bias: [0, 0.3, 0.65] });
  }
  for (let i = 0; i < 3; i++) {       // thin interlacing whips cross the canes in front of the body
    const x0 = -L / 2 + 0.3 + rng() * (L - 0.6), z0 = 0.2 + rng() * 0.4, dx = (rng() - 0.5) * 3, top = H * (0.4 + rng() * 0.45);
    vine(parts, rng, [[x0, -0.1, z0], [x0 + dx * 0.3, top * 0.45, z0 + 0.3], [x0 + dx * 0.7, top * 0.9, z0 - 0.05], [x0 + dx, top * 0.6, z0 + 0.3]], 0.085, 0.04, { every: 0.36, len: 0.5, tr: 0.06, radial: 4, segs: 6 });
  }
  for (let i = 0; i < 2; i++) {       // mossy root mounds
    const g = ico(0.55 + rng() * 0.3, 1, rng, 0.25); g.scale(1.5, 0.5, 1.1); g.translate(-L / 2 + 1.0 + i * (L - 2.0), 0.1, 0.5 + rng() * 0.5);
    parts.push(paint(g, C.root0, C.root1, rng, { ao: 0.5, moss: C.moss, mossAmt: 0.85, mossUp: 0.4 }));
  }
  for (let i = 0; i < 3; i++) blossom(parts, rng, (rng() - 0.5) * L * 0.8, H * (0.25 + rng() * 0.45), 0.45 + rng() * 0.3, 1.2);
  return bake(parts, { glow: false });
}

// ---- root arch: two twisted root columns meeting in a pointed arch, thorns and hanging vines ----
function makeArch(rng) {
  const parts = [], Hh = 4.2;
  const strand = (s, phase, r0) => {
    const spine = new THREE.CatmullRomCurve3([
      [s * 2.5, -0.3, 0.9], [s * 2.4, 1.0, 0.95], [s * 1.95, 2.3, 0.85], [s * 1.15, 3.4, 0.9], [s * 0.35, Hh, 0.9],
    ].map((p) => new THREE.Vector3(...p)));
    const pts = [], T = new THREE.Vector3(), N2 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      spine.getPointAt(t, T); spine.getTangentAt(t, N2);
      const side = new THREE.Vector3().crossVectors(N2, Z).normalize();
      const phi = phase + t * 7.5, a = 0.2 * (1 - t * 0.5);
      pts.push([T.x + side.x * Math.sin(phi) * a, T.y + side.y * Math.sin(phi) * a, T.z + Math.cos(phi) * a]);
    }
    vine(parts, rng, pts, r0, 0.13, { c0: C.root0, c1: C.root1, flare: 0.9, radial: 5, segs: 14, every: 0.45, len: 0.55, tr: 0.075, moss: 0.8, t0: 0.15, bias: [0, 0.25, 0.7] });
  };
  for (const s of [-1, 1]) { strand(s, 0, 0.36); strand(s, Math.PI, 0.3); }
  leafBlob(parts, rng, 0, Hh - 0.1, 0.9, 0.7);
  leafBlob(parts, rng, -0.9, Hh - 0.65, 0.95, 0.5);
  leafBlob(parts, rng, 0.95, Hh - 0.6, 0.85, 0.5);
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.7 + (rng() - 0.5) * 0.3, top = Hh - 0.5 - Math.abs(x) * 0.5;
    vine(parts, rng, [[x, top, 0.9], [x + (rng() - 0.5) * 0.2, top - 0.7, 0.95], [x + (rng() - 0.5) * 0.3, top - 1.4 - rng() * 0.6, 0.9]], 0.05, 0.03, { every: 0.3, len: 0.3, tr: 0.04, radial: 3, segs: 4 });
  }
  for (const s of [-1, 1]) {           // mossy foot mounds
    const g = ico(0.8, 1, rng, 0.25); g.scale(1.3, 0.6, 1.1); g.translate(s * 2.45, 0, 0.9);
    parts.push(paint(g, C.root0, C.root1, rng, { ao: 0.5, moss: C.moss, mossAmt: 0.9, mossUp: 0.35 }));
  }
  for (let i = 0; i < 4; i++) blossom(parts, rng, (rng() - 0.5) * 4.4, 0.3 + rng() * 2.4, 1.1, 1.3);
  return bake(parts, { glow: false });
}

// ---- antler: a bone-pale forked branch rising from the ground ----
function makeAntler(rng) {
  const parts = [], Hh = 4.4;
  const tine = (pts, r0, r1) => {
    const { geo, curve } = tubeAlong(pts, r0, r1, { radial: 5, segs: 6, flare: 0.5 });
    paint(geo, C.bone0, C.bone1, rng, { ao: 0.35, jitter: 0.08 });
    parts.push(geo);
    const e = pts[pts.length - 1], d = [e[0] - pts[pts.length - 2][0], e[1] - pts[pts.length - 2][1], e[2] - pts[pts.length - 2][2]];
    parts.push(thorn(e, d, r1 * 7, r1 * 1.1, C.bone1, 0xf2ead4, rng, 5));
    return curve;
  };
  const trunk = [[0, -0.3, 0.9], [-0.15, 1.2, 0.95], [0.1, 2.5, 0.85], [-0.1, 3.6, 0.9], [0.2, Hh, 0.9]];
  const tc = tine(trunk, 0.2, 0.05);
  const P = new THREE.Vector3();
  for (let i = 0; i < 5; i++) {
    const t = 0.28 + i * 0.14, s = i % 2 ? 1 : -1;
    tc.getPointAt(t, P);
    const len = 1.5 - i * 0.18;
    tine([[P.x, P.y, P.z], [P.x + s * len * 0.4, P.y + len * 0.28, P.z + (rng() - 0.5) * 0.4], [P.x + s * len * 0.75, P.y + len * 0.75, P.z + (rng() - 0.5) * 0.4], [P.x + s * len * 0.85, P.y + len * 1.25, P.z]], 0.1, 0.03);
  }
  const g = ico(0.7, 1, rng, 0.25); g.scale(1.4, 0.55, 1.1); g.translate(0, 0, 0.9);
  parts.push(paint(g, C.root0, C.root1, rng, { ao: 0.5, moss: C.moss, mossAmt: 0.9, mossUp: 0.35 }));
  return bake(parts, { glow: false });
}

// ---------- material ----------
function createVergeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  return patchEnv(m, { key: 'arenaVerge', fade: true, wrap: true, wind: { height: 4.5, amp: 0.1, flutter: 0.025 } });
}

// ---------- layout ----------
const A_FAR = Math.PI * 1.25;

export function buildVerge({ r }) {
  const rng = mulberry32(0x7e46e1);
  const mat = createVergeMaterial();
  const tangles = [makeTangle(rng), makeTangle(rng)];
  const masses = [makeMass(rng, 3.0), makeMass(rng, 3.4)];
  const arch = makeArch(rng), antler = makeAntler(rng);
  const layers = [
    { name: 'tangle', geo: tangles[0], mat, items: [] }, { name: 'tangle2', geo: tangles[1], mat, items: [] },
    { name: 'massA', geo: masses[0], mat, items: [] }, { name: 'massB', geo: masses[1], mat, items: [] },
    { name: 'arch', geo: arch, mat, items: [] }, { name: 'antler', geo: antler, mat, items: [] },
  ];
  const circ = TAU * r;
  const place = (layer, a, o) => {   // every piece is clamped to the readability height cap at its angle
    const it = { a, off: 0, yaw: 0, s: 1, sx: 1, sy: 1, tilt: 0, ...o };
    it.sy = Math.min(it.sy, heightCap(a) / (layers[layer].geo.boundingBox.max.y * it.s));
    layers[layer].items.push(it);
  };
  const cap = (a, H, s = 1) => Math.min(1.12, heightCap(a) / (H * s));   // keeps the piece under the readability cap
  // front row: low tangles everywhere (the inner face at r)
  const nF = Math.round(circ / 3.2);
  for (let i = 0; i < nF; i++) {
    const a = (i + 0.5 + (rng() - 0.5) * 0.25) / nF * TAU;
    const s = 0.9 + rng() * 0.2;
    place(i % 2, a, { off: (rng() - 0.3) * 0.2, yaw: (rng() - 0.5) * 0.25 + (rng() < 0.5 ? Math.PI : 0), s, sy: Math.min(1, 0.78 / (0.95 * s)), dust: i % 3 === 0 });
  }
  // back rows: tall mass, scaled to the height cap; skipped where the camera looks over the wall
  const rows = [{ off: 1.2, n: Math.round(circ / 3.9), minK: 0.12 }, { off: 2.7, n: Math.round(circ / 5.4), minK: 0.5 }];
  rows.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      const a = (i + 0.5 + (rng() - 0.5) * 0.3 + ri * 0.3) / row.n * TAU;
      const k = nearK(a);
      if (k < row.minK) continue;
      const H = (i % 2 ? 3.4 : 3.0), s = 0.95 + rng() * 0.2, sy = cap(a, H, s) * (0.85 + rng() * 0.2);
      place(2 + (i % 2), a, { off: row.off + rng() * 0.4, yaw: (rng() - 0.5) * 0.3 + (rng() < 0.5 ? Math.PI : 0), s, sy: Math.min(sy, 1.12), dust: i % 2 === 0 });
    }
  });
  // root arches over the far / flanking arcs
  const nA = Math.round(circ / 14);
  for (let i = 0; i < nA; i++) {
    const a = (i + 0.5) / nA * TAU + 0.15;
    if (nearK(a) < 0.7) continue;
    place(4, a, { off: 0.9, yaw: (rng() - 0.5) * 0.1, s: 1.05, sy: Math.min(1, cap(a, 4.2, 1.05)), dust: true });
  }
  // antlers on the far arc
  for (let i = 0; i < 9; i++) {
    const a = A_FAR + (i - 4) * 0.28 + (rng() - 0.5) * 0.12;
    if (nearK(a) < 0.8) continue;
    place(5, a, { off: 2.1 + rng() * 0.8, yaw: (rng() - 0.5) * 0.4, s: 0.9 + rng() * 0.3, sy: 1, tilt: (rng() - 0.5) * 0.12, dust: true });
  }
  return {
    layers,
    ring: { kind: 0, paint: 0x1a1008, line: 0xd8f2a0, line2: 0xd8f2a0, hdr: 1.25 },
    dust(game, pos) {
      const v = game.vfx;
      if (!v) return;
      v.debris('dirt', pos, 5, { scale: 1.0 });
      v.emit('dustRing', pos, { count: 4, scale: 0.8, speed: 0.3 });
    },
    dispose() { mat.dispose(); },
  };
}
