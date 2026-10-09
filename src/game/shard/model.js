import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO } from '../../core/utils.js';
import { BLEND_ADD } from '../fx.js';
import { patchEnv, mulberry32 } from '../env/common.js';
import { prep, lump, paint } from '../env/props.js';

// =====================================================================================
//  The Crownshard set piece (v6). Contract: design/SHARD.md §3, design: design/SHARD_PASSES.md Pass 1 / 6.
//
//  A floating prism tine of the shattered Riftcrown (crystal, still clamped in a dull bronze filigree
//  collar) over a lit crater, inside the broken Vael binding circle: a cracked curb ring at the commune
//  radius (the rune line at r 4.5 IS the commune range), three binding-stones with their pact sigils
//  (Haste left, Echo front, Wrath right as seen from the iso camera) and chains from the stones to the
//  collar. Same silhouette every act; the stone takes the biome.
//
//  Draw calls (main pass): stone, collar, crystal, splinters, chains, ground glow, sigils, halo, column,
//  motes = 10. update() allocates nothing. No persistent lights (game.fx.light flashes in burst() only).
//  Layering: the ground glow is drawn in the OPAQUE list at renderOrder 1 (custom blend-add, no depth
//  test / write, like vfx/decals.js); every solid part of the set piece is at renderOrder 3 so it draws
//  over its own ground glow, and units / hostile telegraphs keep drawing over everything on the ground.
// =====================================================================================

const TAU = Math.PI * 2;
const COMMUNE_R = 4.5;
const STONE_R = 3.4;               // binding-stones (inside the commune ring: you commune among them)
const CURB_R = 4.92;               // centre line of the broken curb (inner edge ≈ 4.68, just outside the rune line)
const Y_DORM = 1.25;               // dormant: crystal pivot height (a third of it sunk, tilted)
const Y_FLOAT = 4.85;              // open: pivot height (tip ≈ 9.2, broken end ≈ 2.0)
const TILT_DORM = 0.44;
const COLLAR_Y = -0.85;            // collar on the crystal (pivot-relative, before SH)
const SW = 1.3, SH = 1.08;          // tine scale: width, length (top ≈ 9.5, broken end ≈ 2.3 when floating)
const NMAX = 20;                   // links per chain
const LINK = 0.27;                 // link spacing
const N_MOTES = 34;
const N_SPL = 7;

// Iso camera (engine.js isoOffset): looks along -(1, 1.22, 1). Screen-down = +X+Z, screen-right = +X-Z.
const CAM_N = new THREE.Vector3(1, 1.22, 1).normalize();
const DOWN = new THREE.Vector3(1, 0, 1).normalize();
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const SUN = new THREE.Vector3(-12, 34, 24).normalize();
// direction on the ground at screen bearing th (0 = toward the camera, +90° = screen right)
const scr = (th, out = new THREE.Vector3()) => out.copy(DOWN).multiplyScalar(Math.cos(th)).addScaledVector(RIGHT, Math.sin(th));

const D2R = Math.PI / 180;
const PACTS = [
  { id: 'haste', th: -105 * D2R, hex: 0xbfefff },
  { id: 'echo', th: 22 * D2R, hex: 0xb08cff, accent: 0x4ff0d0 },
  { id: 'wrath', th: 118 * D2R, hex: 0xff7a33 },
];
const RIFT = 0xe0c4ff;
const LEAN = scr(-62 * D2R);       // dormant lean (toward the camera's left)

// Biome stone. One silhouette every act; only the material changes.
const BIOME = [
  { // 0 Thornwood: mossy forest granite
    stone: [0x666a66, 0xc2c2b6], moss: 0x7a9a4a, mossAmt: 0.3, mossUp: 0.7,
    plinth: [0x55585a, 0xa8aaa0], bronze: [0x4e3a22, 0x8e6e44], verd: null, dust: 0x6a5a44,
  },
  { // 1 Sunscorch: banded sandstone
    stone: [0x8a5634, 0xdcaa6e], bands: [0xd9a368, 0xc0844e, 0xe6bb80, 0xb27446], bandH: 0.13,
    plinth: [0x74462a, 0xc8925c], bronze: [0x4a3620, 0x8a6a40], verd: null, dust: 0xb08a5e,
  },
  { // 2 Stormwater: drowned pale marble (water-stained below the old waterline, algae on top faces)
    stone: [0x4a6662, 0xf4f2ea], moss: 0x7aa088, mossAmt: 0.3, mossUp: 0.75,
    plinth: [0x3e5856, 0xe2e2da], bronze: [0x3e3a28, 0x7e6a46], verd: 0x4f8f7c, dust: 0x8a9a90,
  },
];

// ------------------------------------------------------------------ temps (update() is allocation-free)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _e = new THREE.Euler(), _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (k, a, b) => clamp01((k - a) / (b - a));

// ------------------------------------------------------------------ shared materials (built once)

let _stoneMat = null;
const stoneMaterial = () => _stoneMat ??= patchEnv(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'shardStone', wrap: true });

// ------------------------------------------------------------------ geometry helpers

// Hand-built faceted solids: triangles are oriented outward from an interior reference point.
class Tris {
  constructor() { this.p = []; this.r = []; this.b = []; }
  // skip: indices (0..2) of the vertices opposite edges that are not facet edges (quad diagonals, ring seams)
  tri(a, b, c, inside, rnd, skip = null) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    _c.set((a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]);
    const o = [0, 0, 0]; if (skip) for (const s of skip) o[s] = 1;
    let ba = [1 + o[0], o[1], o[2]], bb = [o[0], 1 + o[1], o[2]], bc = [o[0], o[1], 1 + o[2]];
    if (_n.dot(_c) < 0) { let t = b; b = c; c = t; t = bb; bb = bc; bc = t; }
    this.p.push(...a, ...b, ...c);
    this.b.push(...ba, ...bb, ...bc);
    this.r.push(rnd, rnd, rnd);
  }
  // quad a-b-c-d (a-b bottom, c-d top): the diagonal is always hidden, the horizontal edges on request
  quad(a, b, c, d, inside, rnd, hideBottom = false, hideTop = false) {
    this.tri(a, b, c, inside, rnd, hideBottom ? [1, 2] : [1]);
    this.tri(a, c, d, inside, rnd, hideTop ? [2, 0] : [2]);
  }
  // append another Tris through a matrix
  add(o, m) {
    for (let i = 0; i < o.p.length; i += 3) { _v.set(o.p[i], o.p[i + 1], o.p[i + 2]).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z); }
    this.r.push(...o.r); this.b.push(...o.b);
  }
}

// A crystal prism: rings [[y, r], ...] with a shared irregular cross-section, a pointed tip and a broken
// (jagged) or pointed bottom. corners: radius factors per corner; bevel: angular half-width of the
// chamfer at each corner (narrow facets that catch the prism glints).
function crystalTris(rng, { rings, corners, bevel = 0.12, tipY, botY, bend = 0, twist = 0, jag = 0 }) {
  const T = new Tris();
  const angs = [], rads = [];
  const n = corners.length;
  for (let c = 0; c < n; c++) {
    const a = (c / n) * TAU + (rng() - 0.5) * 0.2;
    if (bevel > 0) { angs.push(a - bevel, a + bevel); rads.push(corners[c] * 0.95, corners[c] * 0.95); }
    else { angs.push(a); rads.push(corners[c]); }
  }
  const S = angs.length;
  const y0 = rings[0][0], y1 = rings[rings.length - 1][0];
  const bx = (y) => bend * Math.pow(Math.max(0, (y - y0) / (tipY - y0)), 2);
  const V = rings.map(([y, r], i) => {
    const row = [];
    for (let j = 0; j < S; j++) {
      const yy = i === 0 && jag ? y + (rng() - 0.5) * jag : y;
      const a = angs[j] + twist * (yy - y0);
      row.push([Math.cos(a) * rads[j] * r + bx(yy), yy, Math.sin(a) * rads[j] * r]);
    }
    return row;
  });
  const fr = []; for (let j = 0; j < S; j++) fr.push(rng());
  for (let i = 0; i < rings.length - 1; i++) {
    const ym = (rings[i][0] + rings[i + 1][0]) / 2, ins = [bx(ym), ym, 0];
    for (let j = 0; j < S; j++) {
      const k = (j + 1) % S;
      T.quad(V[i][j], V[i][k], V[i + 1][k], V[i + 1][j], ins, fr[j], i > 0, i < rings.length - 2);
    }
  }
  const tip = [bx(tipY), tipY, 0], top = V[rings.length - 1], insT = [bx(y1), (y1 + tipY) / 2 - 0.2, 0];
  for (let j = 0; j < S; j++) T.tri(top[j], top[(j + 1) % S], tip, insT, (fr[j] + 0.5) % 1);
  const bot = [bx(botY) + (jag ? 0.08 : 0), botY, jag ? -0.06 : 0], insB = [0, y0 + 0.25, 0];
  for (let j = 0; j < S; j++) T.tri(V[0][j], V[0][(j + 1) % S], bot, insB, (fr[j] + 0.31) % 1);
  return T;
}

function trisGeometry(T, y0, y1) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(T.p), h = new Float32Array(T.r.length);
  for (let i = 0; i < h.length; i++) h[i] = (pos[i * 3 + 1] - y0) / (y1 - y0);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(new Float32Array(T.r), 1));
  g.setAttribute('aH', new THREE.BufferAttribute(h, 1));
  g.setAttribute('aBary', new THREE.BufferAttribute(new Float32Array(T.b), 3));
  g.computeVertexNormals();          // non-indexed → flat facet normals
  g.computeBoundingSphere();
  return g;
}

// The tine: ≈ 6.6 u long, pivot at its centre of mass (local y −2.6 … +4.0).
function tineGeometry() {
  const rng = mulberry32(90917);
  const main = crystalTris(rng, {
    rings: [[-2.25, 0.5], [-1.7, 0.66], [-0.9, 0.73], [0.0, 0.7], [1.0, 0.6], [2.0, 0.46], [2.9, 0.29]],
    corners: [1.0, 0.8, 1.07, 0.86, 0.99, 0.76], bevel: 0.13, tipY: 4.0, botY: -2.65, bend: 0.3, twist: 0.035, jag: 0.5,
  });
  // two small crystals grown out of the lower body (break the symmetry, read as "a broken-off cluster")
  for (const [y, yaw, lean, s] of [[-1.25, 2.3, 0.75, 1], [-0.25, 4.6, 0.62, 0.8]]) {
    const sub = crystalTris(rng, { rings: [[0, 0.17], [0.5, 0.15]], corners: [1, 0.85, 1, 0.9, 1, 0.8], bevel: 0, tipY: 0.85, botY: -0.12 });
    _m4.compose(_v.set(Math.cos(yaw) * 0.5, y, -Math.sin(yaw) * 0.5), _q.setFromEuler(_e.set(0, yaw, -lean)), _s.setScalar(s));
    main.add(sub, _m4);
  }
  return trisGeometry(main, -2.65, 4.0);
}

function splinterGeometry() {
  const rng = mulberry32(4471);
  const T = crystalTris(rng, { rings: [[-0.1, 0.14], [0.12, 0.13]], corners: [1, 0.8, 1, 0.85, 0.95, 0.75], bevel: 0, tipY: 0.42, botY: -0.3 });
  return trisGeometry(T, -0.3, 0.42);
}

// a box laid out along an arc segment, etc. (build-time only)
function xf(g, { rx = 0, ry = 0, rz = 0, x = 0, y = 0, z = 0, s = null } = {}) {
  if (s) Array.isArray(s) ? g.scale(s[0], s[1], s[2]) : g.scale(s, s, s);
  if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

// The circle's stone: crater ejecta, three binding-stones, the broken curb ring, fallen chunks.
function circleGeometry(act, world) {
  const B = BIOME[act] ?? BIOME[0];
  const rng = mulberry32(7121 + act * 31);
  const parts = [];
  const look = { ao: 0.45, jitter: 0.09, moss: B.moss ?? null, mossAmt: B.mossAmt ?? 0.8, mossUp: B.mossUp ?? 0.55, bands: B.bands ?? null, bandH: B.bandH ?? 1.5 };
  const stone = (g, y1 = 0.5, o = {}) => parts.push(paint(g, B.stone[0], B.stone[1], rng, { ...look, y0: -0.05, y1, ...o }));

  // ---- crater lip: up-thrust paving slabs and ejecta lumps (≤ 0.5 u)
  const NL = 17;
  for (let i = 0; i < NL; i++) {
    const a = (i / NL) * TAU + (rng() - 0.5) * 0.3;
    if (i % 2 === 0) {
      const r = 1.95 + rng() * 0.3, len = 0.5 + rng() * 0.3;
      const g = lump(prep(new THREE.BoxGeometry(len, 0.12, 0.34 + rng() * 0.2)), 0.06, rng);
      xf(g, { rz: -(0.42 + rng() * 0.3), y: 0.1, ry: -a, x: Math.cos(a) * r, z: Math.sin(a) * r });
      stone(g, 0.45);
    } else {
      const r = 2.05 + rng() * 0.35, sz = 0.16 + rng() * 0.13;
      const g = lump(prep(new THREE.IcosahedronGeometry(sz, 0)), 0.18, rng);
      xf(g, { s: [1.35, 0.62, 1], ry: -a + rng(), y: sz * 0.25, x: Math.cos(a) * r, z: Math.sin(a) * r });
      stone(g, 0.4);
    }
  }
  // pebbles thrown inside the bowl
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU, r = 1.0 + rng() * 0.8, sz = 0.09 + rng() * 0.08;
    const g = lump(prep(new THREE.IcosahedronGeometry(sz, 0)), 0.2, rng);
    xf(g, { s: [1.2, 0.7, 1], y: sz * 0.3, x: Math.cos(a) * r, z: Math.sin(a) * r });
    stone(g, 0.3);
  }

  // ---- binding-stones: squat carved plinths (≤ 1 u) with an iron staple for the chain
  for (const P of PACTS) {
    const d = scr(P.th), a = Math.atan2(d.z, d.x);
    const parts1 = [];
    const base = lump(prep(new THREE.CylinderGeometry(0.56, 0.66, 0.16, 6, 1)), 0.05, rng); base.translate(0, 0.07, 0);
    const body = lump(prep(new THREE.CylinderGeometry(0.34, 0.45, 0.66, 4, 2)), 0.05, rng); body.rotateY(Math.PI / 4); body.translate(0, 0.14 + 0.33, 0);
    const cap = lump(prep(new THREE.CylinderGeometry(0.44, 0.38, 0.13, 4, 1)), 0.04, rng); cap.rotateY(Math.PI / 4 + 0.08); cap.translate(0, 0.8 + 0.065, 0);
    parts1.push(paint(base, B.plinth[0], B.plinth[1], rng, { ...look, y0: -0.05, y1: 1.0 }));
    parts1.push(paint(body, B.plinth[0], B.plinth[1], rng, { ...look, moss: null, y0: -0.05, y1: 1.0 }));
    parts1.push(paint(cap, B.plinth[0], B.plinth[1], rng, { ...look, y0: -0.05, y1: 0.95 }));
    // iron staple on the inner top edge (the chain hangs from it)
    const st = prep(new THREE.TorusGeometry(0.1, 0.035, 4, 8)); st.rotateY(Math.PI / 2); st.translate(0.14, 0.98, 0);
    parts1.push(paint(st, 0x26252c, 0x56545e, rng, { ao: 0.2, jitter: 0.05 }));
    for (const g of parts1) { g.rotateY(-a + Math.PI); g.translate(d.x * STONE_R, 0, d.z * STONE_R); parts.push(g); }
  }

  // ---- the broken curb ring: low blocks at the commune edge, cracked, some missing; gaps where paths enter
  const mask = world?._env?.mask;
  const NC = 26;
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * TAU + 0.07;
    const cx = Math.cos(a) * CURB_R, cz = Math.sin(a) * CURB_R;
    const m = mask?.sample ? mask.sample(cx, cz) : null;
    const onPath = m && m.path > 0.35;
    if (onPath ? rng() < 0.85 : rng() < 0.1) continue;
    const chord = (TAU / NC) * CURB_R * 0.9;
    const split = rng() < 0.3;
    const pieces = split ? [[-0.26, 0.46], [0.25, 0.47]] : [[0, 1]];
    for (const [off, frac] of pieces) {
      const h = (onPath ? 0.1 : 0.16) + rng() * 0.13, w = chord * frac;
      const g = lump(prep(new THREE.BoxGeometry(w, h, 0.42 + rng() * 0.08)), 0.05, rng);
      g.translate(off * chord, h / 2 - 0.04 - rng() * 0.05, 0);
      g.rotateX((rng() - 0.5) * 0.18); g.rotateZ((rng() - 0.5) * (split ? 0.3 : 0.12));
      g.rotateY(-a - Math.PI / 2);
      g.translate(cx, 0, cz);
      stone(g, 0.32);
    }
  }
  // fallen chunks outside the curb (≤ r 6.4)
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU, r = 5.45 + rng() * 0.9, sz = 0.14 + rng() * 0.14;
    const g = lump(prep(new THREE.IcosahedronGeometry(sz, 0)), 0.2, rng);
    xf(g, { s: [1.3, 0.7, 1], ry: rng() * 3, y: sz * 0.3, x: Math.cos(a) * r, z: Math.sin(a) * r });
    stone(g, 0.3);
  }

  for (const p of parts) p.deleteAttribute('fl');
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}

// The crown's bronze filigree band, clamped round the tine (does not spin with the crystal).
// Returns { geo, lugs: [Vector3 x3] } in collar-local space.
function collarGeometry(act) {
  const B = BIOME[act] ?? BIOME[0];
  const rng = mulberry32(3301);
  const parts = [];
  const bronze = (g, o = {}) => parts.push(paint(g, B.bronze[0], B.bronze[1], rng, { ao: 0.35, jitter: 0.06, moss: B.verd, mossAmt: 0.55, mossUp: 0.5, y0: -0.3, y1: 0.45, ...o }));
  const prof = [[0.74, -0.23], [0.86, -0.23], [0.9, -0.13], [0.88, 0.17], [0.82, 0.23], [0.74, 0.23], [0.74, -0.23]].map(([x, y]) => new THREE.Vector2(x, y));
  bronze(prep(new THREE.LatheGeometry(prof, 8)));
  const bead = prep(new THREE.TorusGeometry(0.9, 0.045, 3, 8)); bead.rotateX(Math.PI / 2); bead.rotateY(Math.PI / 8); bead.translate(0, -0.25, 0); bronze(bead);
  // fleurons: the crown's points, alternately tall and short
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8, h = i % 2 ? 0.36 : 0.2;
    const c = prep(new THREE.ConeGeometry(0.08, h, 4)); c.translate(Math.cos(a) * 0.81, 0.23 + h / 2, Math.sin(a) * 0.81); bronze(c);
  }
  // the broken crown rim: a strap that once ran on round the great crown, snapped off
  {
    const a0 = scr(210 * D2R), base = Math.atan2(a0.z, a0.x);
    let x = Math.cos(base) * 0.86, z = Math.sin(base) * 0.86, dir = base + Math.PI / 2 + 0.25;
    for (let i = 0; i < 3; i++) {
      const len = 0.36, g = prep(new THREE.BoxGeometry(len, 0.34 - i * 0.04, 0.07));
      g.rotateZ(i === 2 ? 0.2 : 0); g.rotateY(-dir);
      g.translate(x + Math.cos(dir) * len / 2, -0.02 - i * 0.03, z + Math.sin(dir) * len / 2);
      bronze(g);
      x += Math.cos(dir) * len * 0.95; z += Math.sin(dir) * len * 0.95; dir -= 0.32;
    }
    const stub = prep(new THREE.ConeGeometry(0.075, 0.34, 4)); stub.rotateZ(-0.35); stub.translate(x - Math.cos(dir + 0.3) * 0.3, 0.3, z - Math.sin(dir + 0.3) * 0.3); bronze(stub);
  }
  // chain lugs facing each binding-stone
  const lugs = [];
  for (const P of PACTS) {
    const d = scr(P.th), a = Math.atan2(d.z, d.x);
    const t = prep(new THREE.TorusGeometry(0.1, 0.036, 3, 6));
    t.rotateY(-a); t.translate(Math.cos(a) * 0.93, -0.05, Math.sin(a) * 0.93);
    parts.push(paint(t, 0x2a2830, 0x5a5862, rng, { ao: 0.2, jitter: 0.05 }));
    lugs.push(new THREE.Vector3(Math.cos(a) * 1.0, -0.05, Math.sin(a) * 1.0));
  }
  for (const p of parts) p.deleteAttribute('fl');
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  geo.computeVertexNormals();
  return { geo, lugs };
}

// Sigils + stone seams: one blend-add mesh, every vertex carries (channel, emit, occlusion, bob).
// Channels: 0 Haste, 1 Echo violet, 2 Echo teal, 3 Wrath crown, 4..6 Wrath notches (heat 1..3).
const CH_COLORS = [0xbfefff, 0xb08cff, 0x4ff0d0, 0xff7a33, 0xffa050, 0xffa050, 0xffa050, RIFT];
function sigilGeometry() {
  const pos = [], info = [];
  let M = null;               // current 2D → 3D mapper
  const put = (x, y, ch, emit, occ, bob) => { M(x, y, _v); pos.push(_v.x, _v.y, _v.z); info.push(ch, emit, occ, bob); };
  const tri = (a, b, c, ch, emit = 1, occ = 0.25, bob = 1) => { put(a[0], a[1], ch, emit, occ, bob); put(b[0], b[1], ch, emit, occ, bob); put(c[0], c[1], ch, emit, occ, bob); };
  const stroke = (x0, y0, x1, y1, w, ch, emit = 1, occ = 0.3) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
    // extend the ends by half a width so polylines join cleanly
    const ex = dx / L * w * 0.45, ey = dy / L * w * 0.45;
    const a = [x0 - ex + nx, y0 - ey + ny], b = [x1 + ex + nx, y1 + ey + ny], c = [x1 + ex - nx, y1 + ey - ny], d = [x0 - ex - nx, y0 - ey - ny];
    tri(a, b, c, ch, emit, occ); tri(a, c, d, ch, emit, occ);
  };
  const poly = (pts, w, ch, emit, occ) => { for (let i = 0; i < pts.length - 1; i++) stroke(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, ch, emit, occ); };
  const ring = (cx, cy, R, w, ch, emit = 1, occ = 0.3, n = 22) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, r0 = R - w / 2, r1 = R + w / 2;
      const p = [cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], q = [cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1];
      const s = [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1], t = [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0];
      tri(p, q, s, ch, emit, occ); tri(p, s, t, ch, emit, occ);
    }
  };
  const disc = (cx, cy, R, ch, occ, n = 18) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      tri([cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R], ch, 0, occ);
    }
  };
  const diamond = (cx, cy, rx, ry, ch) => { tri([cx - rx, cy], [cx, cy + ry], [cx + rx, cy], ch, 1, 0.3); tri([cx - rx, cy], [cx + rx, cy], [cx, cy - ry], ch, 1, 0.3); };

  // camera-facing basis (fixed iso camera): right = RIGHT, up = n × right
  const nrm = CAM_N, up = new THREE.Vector3().crossVectors(nrm, RIGHT).normalize();
  const S = 1.36;   // sigil scale (≈ 1.35 u across)
  PACTS.forEach((P, idx) => {
    const d = scr(P.th), cx = d.x * STONE_R, cz = d.z * STONE_R, cy = 1.78;
    const C = new THREE.Vector3(cx + d.x * 0.3, cy, cz + d.z * 0.3).addScaledVector(nrm, 0.25);   // a little outward: the chain leaves inward
    M = (x, y, out) => out.copy(C).addScaledVector(RIGHT, x * S).addScaledVector(up, y * S);
    const main = idx === 0 ? 0 : idx === 1 ? 1 : 3;
    disc(0, 0, 0.5, main, 0.42);                         // dark medallion backing (reads on bright ground)
    ring(0, 0, 0.47, 0.035, main, 0.55, 0.2, 28);      // medallion rim
    if (P.id === 'haste') {
      // hourglass + double chevron ("now")
      const hx = -0.12;
      stroke(hx - 0.24, 0.34, hx + 0.24, 0.34, 0.075, 0); stroke(hx - 0.24, -0.34, hx + 0.24, -0.34, 0.075, 0);
      poly([[hx - 0.19, 0.34], [hx - 0.035, 0.0], [hx - 0.19, -0.34]], 0.06, 0);
      poly([[hx + 0.19, 0.34], [hx + 0.035, 0.0], [hx + 0.19, -0.34]], 0.06, 0);
      tri([hx - 0.12, -0.29], [hx + 0.12, -0.29], [hx, -0.1], 0);           // sand below
      tri([hx - 0.07, 0.25], [hx + 0.07, 0.25], [hx, 0.12], 0);             // sand above
      poly([[0.18, 0.17], [0.28, 0.0], [0.18, -0.17]], 0.065, 0);
      poly([[0.29, 0.17], [0.39, 0.0], [0.29, -0.17]], 0.065, 0);
    } else if (P.id === 'echo') {
      // twin rings: the boss and its echo
      ring(-0.13, 0.0, 0.25, 0.075, 1);
      ring(0.13, 0.0, 0.25, 0.075, 2);
      diamond(0, 0, 0.05, 0.09, 1);
    } else {
      // ember crown over three notches: one notch lights per heat
      poly([[-0.31, -0.1], [-0.34, 0.3], [-0.16, 0.12], [0, 0.38], [0.16, 0.12], [0.34, 0.3], [0.31, -0.1], [-0.31, -0.1]], 0.07, 3);
      diamond(-0.23, -0.27, 0.075, 0.1, 4);
      diamond(0.0, -0.27, 0.075, 0.1, 5);
      diamond(0.23, -0.27, 0.075, 0.1, 6);
    }
    // seam band round the plinth capstone (non-bobbing, world-horizontal)
    const n = 12, r = 0.5, y0 = 0.76, y1 = 0.83;
    const ch = main;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const p2 = [p1[0], y1, p1[2]], p3 = [p0[0], y1, p0[2]];
      for (const q of [p0, p1, p2, p0, p2, p3]) { pos.push(...q); info.push(ch, 0.8, 0.0, 0); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 4));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ shaders

const PRISM_GLSL = /* glsl */`
vec3 prismPal(float h) {           // cyan → mint → white → lilac (never red / magenta)
  h = fract(h) * 4.0;
  vec3 a = vec3(0.50, 0.92, 1.00), b = vec3(0.58, 1.00, 0.80), c = vec3(1.00, 0.97, 0.96), d = vec3(0.76, 0.60, 1.00);
  if (h < 1.0) return mix(a, b, h);
  if (h < 2.0) return mix(b, c, h - 1.0);
  if (h < 3.0) return mix(c, d, h - 2.0);
  return mix(d, a, h - 3.0);
}`;

function crystalMaterial() {
  const u = {
    uTime: { value: 0 }, uGlow: { value: 0.3 }, uGlint: { value: 0.5 }, uDim: { value: 1 }, uFlash: { value: 0 },
    uDeep: { value: new THREE.Color(0x1e1248) }, uMid: { value: new THREE.Color(0x6a48c4) }, uPale: { value: new THREE.Color(0xe4d8ff) }, uCore: { value: new THREE.Color(0xf2e8ff) },
    uSun: { value: SUN.clone() },
  };
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */`
      attribute float aRand; attribute float aH; attribute vec3 aBary;
      varying vec3 vNW; varying vec3 vNV; varying float vRand; varying float vH; varying vec3 vBary;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vNW = normalize(mat3(m) * normal);
        vNV = normalize((viewMatrix * vec4(vNW, 0.0)).xyz);
        vRand = aRand; vH = aH; vBary = aBary;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uGlow, uGlint, uDim, uFlash;
      uniform vec3 uDeep, uMid, uPale, uCore, uSun;
      varying vec3 vNW; varying vec3 vNV; varying float vRand; varying float vH; varying vec3 vBary;
      ${PRISM_GLSL}
      void main() {
        vec3 n = normalize(vNW);
        float facing = clamp(normalize(vNV).z, 0.0, 1.0);
        float sun = clamp(dot(n, uSun) * 0.6 + 0.4, 0.0, 1.0);
        float g = min(uGlow, 1.5);
        // painted body: a clear value step per facet, deep indigo in the shade → pale lilac in the sun
        float v = clamp(0.02 + 0.92 * sun * sun + 0.36 * (vRand - 0.5) + 0.1 * n.y, 0.0, 1.0);
        vec3 col = (v < 0.5 ? mix(uDeep, uMid, v * 2.0) : mix(uMid, uPale, v * 2.0 - 1.0)) * (0.32 + 0.5 * g);
        // inner light seen through the thickness: face-on facets, strongest low in the tine, breathing upward
        float core = pow(facing, 3.0) * (0.6 + 0.4 * sin(vH * 7.0 - uTime * 1.6)) * (1.1 - 0.55 * vH);
        col += uCore * core * g * 0.75;
        // prismatic light on the grazing facets
        float fr = pow(1.0 - facing, 2.5);
        float hue = vRand * 0.55 + n.x * 0.3 + n.z * 0.22 + vH * 0.35 + uTime * 0.05;
        vec3 prism = prismPal(hue);
        col += prism * fr * (0.25 + 0.75 * g);
        // crisp facet edges (screen-space width): the cut of the crystal
        float e = min(min(vBary.x, vBary.y), vBary.z);
        float edge = 1.0 - smoothstep(0.0, fwidth(e) * 1.6, e);
        col += mix(vec3(1.0), prism, 0.55) * edge * (0.25 + 0.9 * g) * (0.55 + 0.45 * fr);
        // a glint band sweeping up the tine + facet sparkles
        float sw = fract(uTime * 0.21);
        float band = smoothstep(0.06, 0.0, abs(vH - (sw * 1.5 - 0.25)));
        col += mix(vec3(1.0), prism, 0.4) * band * uGlint * (0.35 + 0.8 * fr + 1.2 * edge);
        float sp = step(0.955, fract(sin(vRand * 913.7 + floor(uTime * 3.0 + vRand * 11.0) * 17.3) * 43758.5453));
        col += prism * sp * uGlint * 1.3;
        col += uCore * uFlash * (0.6 + facing);
        gl_FragColor = vec4(col * uDim, 1.0);
      }`,
  });
}

// Chain links: lit dark iron + a per-link emissive (instanced attribute aGlow).
function chainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uIron: { value: new THREE.Color(0x3a3842) }, uSun: { value: SUN.clone() } },
    vertexShader: /* glsl */`
      attribute vec3 aGlow; varying vec3 vGlow; varying vec3 vNW;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vNW = normalize(mat3(m) * normal); vGlow = aGlow;
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uIron, uSun; varying vec3 vGlow; varying vec3 vNW;
      void main() {
        vec3 n = normalize(vNW);
        float l = clamp(dot(n, uSun) * 0.6 + 0.4, 0.0, 1.0);
        vec3 col = uIron * (0.35 + 0.9 * l * l) + vec3(0.08, 0.08, 0.1) * pow(clamp(n.y, 0.0, 1.0), 2.0) + vGlow;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The ground layer: crater bowl + glowing fissures, the rune line at the commune radius, pact spokes,
// the Haste warning pulse and the Answer flash. One disc, BLEND_ADD (rgb adds light, alpha darkens).
function groundMaterial() {
  const dirs = PACTS.map((P) => { const d = scr(P.th); return new THREE.Vector2(d.x, d.z); });
  const u = {
    uTime: { value: 0 }, uCrater: { value: 0 }, uCrack: { value: 0.1 }, uRing: { value: 0 }, uGroove: { value: 0.2 }, uRot: { value: 0 },
    uCall: { value: 0 }, uAnswer: { value: 0 }, uDim: { value: 1 }, uSeal: { value: new THREE.Vector3() }, uWarn: { value: 0 },
    uDirs: { value: dirs }, uRift: { value: new THREE.Color(RIFT) }, uRiftDeep: { value: new THREE.Color(0x9a74ff) },
    uPact: { value: PACTS.map((P) => new THREE.Color(P.hex)) }, uHaste: { value: new THREE.Color(0xbfefff) },
  };
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uCrater, uCrack, uRing, uGroove, uRot, uCall, uAnswer, uDim, uWarn;
      uniform vec3 uSeal; uniform vec2 uDirs[3]; uniform vec3 uRift, uRiftDeep, uPact[3], uHaste;
      varying vec2 vP;
      float h1(float n) { return fract(sin(n) * 43758.5453); }
      float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      vec2 gpt(float h) { float i = floor(h * 9.0); return vec2(mod(i, 3.0) - 1.0, floor(i / 3.0) - 1.0); }
      float runes(float ang, float r) {
        const float N = 40.0, RC = 4.14;
        float s = (ang + uRot) / 6.2831853 * N; float id = floor(s);
        float cw = 6.2831853 * RC / N;
        vec2 q = vec2((fract(s) - 0.5) * cw, r - RC);
        if (abs(q.y) > 0.2 || h1(id * 7.71) < 0.14) return 0.0;
        vec2 sc = vec2(0.15, 0.12);
        float m = 1e3;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          vec2 a = gpt(h1(id * 3.17 + fi * 1.31)) * sc, b = gpt(h1(id * 5.71 + fi * 2.77)) * sc;
          if (dot(b - a, b - a) < 1e-3) b = a + vec2(0.0, sc.y);
          m = min(m, sdSeg(q, a, b));
        }
        return smoothstep(0.036, 0.016, m);
      }
      float cracks(float ang, float r) {
        float c = 0.0;
        for (int L = 0; L < 1; L++) {
          float N = L == 0 ? 9.0 : 13.0;
          float s = ang / 6.2831853 * N + (L == 0 ? 0.13 : 0.61);
          float id = floor(s);
          float zz = fract(r * 1.3 + h1(id * 2.3) ) * 2.0 - 1.0; float zz2 = fract(r * 3.1 + h1(id * 4.1)) * 2.0 - 1.0;
          float wob = 0.1 * (abs(zz) - 0.5) * (h1(id * 0.7) > 0.5 ? 1.0 : -1.0) + 0.035 * (abs(zz2) - 0.5);   // jagged, not wavy
          float f = abs(fract(s + wob) - 0.5) / N * 6.2831853 * r;
          float len = mix(2.2, 3.4, h1(id * 1.37 + float(L) * 9.1)) * (L == 0 ? 1.0 : 0.62);
          float w = mix(L == 0 ? 0.11 : 0.06, 0.015, smoothstep(0.6, len, r));
          c = max(c, smoothstep(w, w * 0.25, f) * (1.0 - smoothstep(len * 0.8, len, r)) * smoothstep(0.45, 1.0, r) * (L == 0 ? 1.0 : 0.5));
        }
        return c;
      }
      void main() {
        vec2 p = vP; float r = length(p); float ang = atan(p.y, p.x);
        vec3 rgb = vec3(0.0); float a = 0.0;
        // crater: dark scorched bowl + glowing fissures; floods with light when the shard wakes
        float bowl = 1.0 - smoothstep(1.55, 2.35, r);
        a += bowl * (0.5 + 0.25 * (1.0 - r / 2.35));
        float ck = cracks(ang, r);
        rgb += mix(uRiftDeep, uRift, 0.5 + 0.5 * uCrater) * ck * (uCrack + 1.6 * uCrater);
        a += ck * 0.25;
        float fl = exp(-r * r / 1.7);
        rgb += uRiftDeep * fl * uCrater * 0.5;
        // commune range: carved groove (always), rune line + glyph band (lit by uRing)
        float d = r - 4.5;
        float groove = smoothstep(0.42, 0.14, abs(r - 4.3));
        a += groove * uGroove;
        float line = smoothstep(0.05, 0.012, abs(d));
        float ticks = step(0.5, fract((ang + uRot * 0.5) / 6.2831853 * 120.0)) * smoothstep(0.14, 0.05, abs(r - 4.62)) * step(r, 4.68);
        float gl = runes(ang, r);
        rgb += uRift * (line * 1.5 + gl * 1.15 + ticks * 0.0) * uRing;
        a += (line * 0.3 + gl * 0.2) * min(uRing * 2.0, 1.0);
        // sealed / drafted pacts: a spoke from the crater to the ring through its stone, and a pool at the stone
        for (int i = 0; i < 3; i++) {
          float k = uSeal[i];
          if (k <= 0.001) continue;
          vec2 dir = uDirs[i];
          float al = dot(p, dir); float pe = length(p - dir * al);
          float spoke = smoothstep(0.075, 0.02, pe) * smoothstep(1.9, 2.3, al) * (1.0 - smoothstep(4.3, 4.55, al));
          float flow = 0.7 + 0.3 * sin(al * 5.0 - uTime * 4.0);
          vec2 sp = p - dir * 3.4;
          float pool = exp(-dot(sp, sp) / 0.55);
          rgb += uPact[i] * (spoke * 1.5 * flow + pool * 0.55) * k;
          a += (pool * 0.12 + spoke * 0.2) * min(k, 1.0);
        }
        // Haste: the call — pale warning rings racing outward (never red)
        if (uCall > 0.001) {
          float ph = fract(uTime * (1.2 + 1.6 * uWarn));
          float rr = mix(1.4, 6.6, ph);
          float w = smoothstep(0.22, 0.0, abs(r - rr)) * (1.0 - ph);
          rgb += uHaste * w * uCall * 1.7;
          a += w * 0.18 * uCall;
        }
        // the Answer: the circle flares
        if (uAnswer > 0.001) {
          rgb += uRift * (line * 2.0 + ck * 1.5 + fl * 0.6) * uAnswer;
        }
        float edge = 1.0 - smoothstep(6.3, 6.6, r);
        gl_FragColor = vec4(rgb * uDim * edge, clamp(a, 0.0, 0.85) * uDim * edge);
      }`,
    transparent: false, depthWrite: false, depthTest: false, ...BLEND_ADD,
  });
}

function sigilMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uFade: { value: 1 },
      uCol: { value: CH_COLORS.map((h) => new THREE.Color(h)) }, uGain: { value: new Float32Array(8) },
    },
    vertexShader: /* glsl */`
      attribute vec4 aInfo; uniform vec3 uCol[8]; uniform float uGain[8]; uniform float uTime; uniform float uFade;
      varying vec3 vRGB; varying float vA;
      void main() {
        int ch = int(aInfo.x + 0.5);
        float g = uGain[ch];
        vRGB = uCol[ch] * g * aInfo.y * uFade;
        vA = aInfo.z * clamp(0.45 + g, 0.0, 1.0) * uFade;
        vec3 p = position;
        p.y += aInfo.w * sin(uTime * 1.3 + p.x * 0.7 + p.z * 0.4) * 0.06;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'varying vec3 vRGB; varying float vA; void main() { gl_FragColor = vec4(vRGB, vA); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND_ADD,
  });
}

function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xc8b0ff) }, uOp: { value: 0.2 } },
    vertexShader: 'varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying vec3 vN; void main() { float f = clamp(vN.z, 0.0, 1.0); float a = pow(f, 2.4) * uOp; gl_FragColor = vec4(uColor * a, 0.0); }',
    transparent: true, depthWrite: false, ...BLEND_ADD,
  });
}

// A light column that reads across the map: a narrow hot core + a soft sheath, rising streaks.
function columnMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xe8dcff) }, uOp: { value: 0 }, uTime: { value: 0 }, uCore: { value: 1 }, uLo: { value: 2 }, uHi: { value: 9 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main() { vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOp, uTime, uCore, uLo, uHi; varying vec2 vUv; varying vec3 vN;
      void main() {
        float f = clamp(abs(vN.z), 0.0, 1.0);
        float h = vUv.y;
        float fade = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.006, h);
        float streak = 0.72 + 0.28 * sin(vUv.x * 6.2831853 * 5.0 + sin(h * 31.0)) * sin(h * 140.0 - uTime * 7.0);
        float hm = h * 64.0;
        float gap = 1.0 - 0.8 * smoothstep(uLo, uLo + 0.9, hm) * (1.0 - smoothstep(uHi - 1.2, uHi + 0.4, hm));   // the crystal itself stays readable
        float a = (pow(f, 7.0) * 1.3 * uCore + pow(f, 1.6) * 0.42) * fade * streak * uOp * gap;
        gl_FragColor = vec4(uColor * a * 2.2, a * 0.1);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND_ADD,
  });
}

let _linkGeo = null, _colGeo = null, _discGeo = null, _haloGeo = null;
const linkGeo = () => _linkGeo ??= new THREE.TorusGeometry(1, 0.42, 3, 6);
const columnGeo = () => _colGeo ??= new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0);
const discGeo = () => _discGeo ??= new THREE.CircleGeometry(6.6, 72).rotateX(-Math.PI / 2);
const haloGeo = () => _haloGeo ??= new THREE.SphereGeometry(1, 14, 10);
let _tineGeo = null, _splGeo = null;
const tineGeo = () => _tineGeo ??= tineGeometry();
const splGeo = () => _splGeo ??= splinterGeometry();
let _sigGeo = null;
const sigGeo = () => _sigGeo ??= sigilGeometry();

// ------------------------------------------------------------------ the set piece

export class ShardVisual {
  constructor(game, pos, act = 0) {
    this.game = game;
    this.act = act;
    const root = this.root = new THREE.Group();
    root.position.copy(pos);
    this.own = [];                                  // per-instance disposables

    // ---- the circle (static)
    const sg = circleGeometry(act, game.world);
    this.own.push(sg);
    const stone = new THREE.Mesh(sg, stoneMaterial());
    stone.castShadow = true; stone.receiveShadow = true; stone.renderOrder = 3;
    root.add(stone);

    this.groundMat = groundMaterial();
    const ground = new THREE.Mesh(discGeo(), this.groundMat);
    ground.position.y = 0.02; ground.renderOrder = 1; ground.frustumCulled = false;
    root.add(ground);

    this.sigMat = sigilMaterial();
    const sig = new THREE.Mesh(sigGeo(), this.sigMat);
    sig.renderOrder = 4;
    root.add(sig);

    // ---- the floating tine: float (bob / tilt) → collar (no spin) + spin → crystal
    this.float = new THREE.Group();
    this.spin = new THREE.Group();
    this.crystalMat = crystalMaterial();
    const crystal = new THREE.Mesh(tineGeo(), this.crystalMat);
    crystal.castShadow = true; crystal.renderOrder = 3;
    this.spin.add(crystal);
    const cg = collarGeometry(act);
    this.own.push(cg.geo);
    this.collar = new THREE.Mesh(cg.geo, stoneMaterial());
    this.collar.castShadow = true; this.collar.renderOrder = 3;
    this.collar.position.y = COLLAR_Y * SH; this.collar.scale.setScalar(SW);
    this.spin.scale.set(SW, SH, SW);
    this.lugs = cg.lugs;
    this.haloMat = haloMaterial();
    this.halo = new THREE.Mesh(haloGeo(), this.haloMat);
    this.halo.scale.set(2.1, 4.7, 2.1); this.halo.position.y = 0.6; this.halo.renderOrder = 12;
    this.float.add(this.spin, this.collar, this.halo);
    root.add(this.float);

    // ---- splinters (instanced crystal shards: embedded in the crater while dormant, orbiting once awake)
    this.splMat = crystalMaterial();
    this.spl = new THREE.InstancedMesh(splGeo(), this.splMat, N_SPL);
    this.spl.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spl.frustumCulled = false; this.spl.renderOrder = 3;
    root.add(this.spl);
    const rng = mulberry32(5521 + act);
    this.splSeed = [];
    for (let i = 0; i < N_SPL; i++) {
      const ga = (i / N_SPL) * TAU + rng() * 0.6, gr = 1.0 + rng() * 0.95;
      this.splSeed.push({
        gx: Math.cos(ga) * gr, gz: Math.sin(ga) * gr, gy: 0.02 + rng() * 0.08,
        grot: new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 2.2, rng() * TAU, (rng() - 0.5) * 2.2)),
        ph: (i / N_SPL) * TAU + rng() * 0.4, or: 1.4 + rng() * 0.55, oy: -2.0 + (i / (N_SPL - 1)) * 4.2 + (rng() - 0.5) * 0.4,
        sc: 1.15 + rng() * 0.9, spin: 0.6 + rng() * 1.2, delay: rng() * 0.18,
      });
    }

    // ---- chains (one instanced draw for all three)
    this.chainMat = chainMaterial();
    this.chainGlow = new THREE.InstancedBufferAttribute(new Float32Array(NMAX * 3 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const lg = linkGeo().clone();                   // per-instance clone: the instanced glow attribute is ours
    lg.setAttribute('aGlow', this.chainGlow);
    this.own.push(lg);
    this.chains = new THREE.InstancedMesh(lg, this.chainMat, NMAX * 3);
    this.chains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chains.frustumCulled = false; this.chains.castShadow = true; this.chains.renderOrder = 3;
    root.add(this.chains);
    this.anchors = PACTS.map((P) => { const d = scr(P.th); return new THREE.Vector3(d.x * (STONE_R - 0.12), 1.0, d.z * (STONE_R - 0.12)); });
    this.drop = PACTS.map((P) => { const d = scr(P.th); return new THREE.Vector3(d.x * 2.1, 0.06, d.z * 2.1); });
    this.chainCol = PACTS.map((P) => new THREE.Color(P.hex));
    this.chainAcc = new THREE.Color(0x4ff0d0);

    // ---- light column + motes
    this.colMat = columnMaterial();
    this.column = new THREE.Mesh(columnGeo(), this.colMat);
    this.column.scale.set(1.05, 64, 1.05); this.column.renderOrder = 11; this.column.frustumCulled = false;
    root.add(this.column);

    const mm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.motes = new THREE.InstancedMesh(GEO.octa, mm, N_MOTES);
    this.motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.motes.frustumCulled = false; this.motes.renderOrder = 10;
    this.moteSeed = new Float32Array(N_MOTES * 4);
    const mc = [0xe8dcff, 0xffffff, 0xb8f4ff, 0xc8a8ff];
    for (let i = 0; i < N_MOTES; i++) {
      this.moteSeed[i * 4] = rng(); this.moteSeed[i * 4 + 1] = rng() * TAU; this.moteSeed[i * 4 + 2] = 0.5 + rng() * 1.8; this.moteSeed[i * 4 + 3] = 0.6 + rng() * 0.8;
      this.motes.setColorAt(i, _col.set(mc[i % mc.length]).multiplyScalar(1.9));
    }
    root.add(this.motes);
    this.own.push(this.groundMat, this.sigMat, this.crystalMat, this.haloMat, this.splMat, this.chainMat, this.colMat, mm, this.spl, this.chains, this.motes);

    // ---- state
    this._tiltAxis = new THREE.Vector3().crossVectors(UP, LEAN).normalize();
    this._yaw = 0.6; this._orb = 0; this._moteT = 0;
    this._g = 0.3; this._crater = 0.05; this._ring = 0; this._col = 0; this._lift = 0;
    this._flash = 0; this._seal = [0, 0, 0]; this._lastK = 0; this._lastState = null; this._snapped = false;
    this._gain = this.sigMat.uniforms.uGain.value;

    game.scene.add(root);
    this.update(0, 0, { state: 'dormant', k: 0, near: 0, sealed: { echo: false, heat: 0, haste: false }, draft: null, answer: 0, wakeIn: 0 });
  }

  // ------------------------------------------------------------------ frame

  update(dt, time, S) {
    const st = S.state;
    // gone: the shard has left. The broken circle stays as a cold ruin (low stone, no collision, no glow):
    // the chains lie where they fell, the sigils are dark.
    const gone = st === 'gone';
    this.float.visible = this.spl.visible = this.column.visible = this.motes.visible = !gone;
    if (gone) {
      if (this._lastState !== 'gone') {
        const gu = this.groundMat.uniforms;
        gu.uCrater.value = 0; gu.uRing.value = 0; gu.uCall.value = 0; gu.uAnswer.value = 0; gu.uCrack.value = 0.04; gu.uGroove.value = 0.14; gu.uSeal.value.set(0, 0, 0);
        this.sigMat.uniforms.uFade.value = 0.35;
        this._gain.fill(0.1);
        this.chainGlow.array.fill(0); this.chainGlow.needsUpdate = true;
      }
      this._lastState = st;
      return;
    }
    const k = S.k ?? 0, near = S.near ?? 0, ans = S.answer ?? 0;
    const se = S.sealed ?? NO_SEAL, dr = S.draft;
    const fdt = Math.min(1, dt * 5);

    // one-shots driven by the state clock (the director only calls burst() at state starts)
    if (st === 'waking' && this._lastK < 0.3 && k >= 0.3) this._snap();
    if (st !== 'waking' && st !== 'dormant') this._snapped = true;
    this._lastK = st === 'waking' ? k : 0;
    this._lastState = st;
    this._flash = Math.max(0, this._flash - dt * 1.6);
    for (let i = 0; i < 3; i++) this._seal[i] = Math.max(0, this._seal[i] - dt * 1.4);

    // ---- pose
    const breath = 0.5 + 0.5 * Math.sin(time * 1.15);
    let y = Y_FLOAT, tilt = 0, spinRate = 0.22, trem = 0, sy = 1, sxz = 1, lift = 1, glow = 1, crater = 0.55, ring = 0, col = 0.3, dim = 1;
    let glint = 0.8, motes = 0.8, moteSpd = 1, warn = 0, call = 0, cg = 1;
    if (st === 'dormant') {
      y = Y_DORM + 0.03 * breath; tilt = TILT_DORM; spinRate = 0; lift = 0;
      glow = 0.22 + 0.16 * breath; crater = 0.0; ring = 0; col = 0; glint = 0.25; motes = 0.3; moteSpd = 0.4;
    } else if (st === 'waking') {
      const strain = seg(k, 0, 0.3), up = ease(seg(k, 0.3, 0.82)), settle = seg(k, 0.82, 1);
      trem = 0.07 * strain * (1 - up);
      y = lerp(Y_DORM, Y_FLOAT + 0.45, up) - 0.45 * ease(settle);
      tilt = TILT_DORM * (1 - ease(seg(k, 0.3, 0.9))) * (1 + 0.15 * strain);
      spinRate = 0.22 * up + 2.2 * Math.sin(Math.PI * up);
      lift = ease(seg(k, 0.33, 0.95));
      glow = lerp(0.3 + 0.6 * strain * (0.6 + 0.4 * Math.sin(time * 37)), 1.0, up) + 1.2 * Math.sin(Math.PI * seg(k, 0.28, 0.6));
      crater = 1.6 * Math.sin(Math.PI * seg(k, 0.3, 1)) + 0.55 * seg(k, 0.6, 1) + 0.3 * strain;
      ring = 0.2 * seg(k, 0.5, 1); col = 0.55 * ease(seg(k, 0.3, 0.7)) + 0.25 * Math.sin(Math.PI * seg(k, 0.3, 1));
      motes = 0.3 + 0.9 * up; moteSpd = 0.4 + 1.6 * up;
    } else if (st === 'open' || st === 'communing') {
      const com = st === 'communing' ? 1 : 0;
      y = Y_FLOAT + 0.16 * Math.sin(time * 1.05);
      tilt = 0.03 * Math.sin(time * 0.7);
      spinRate = 0.24 + 0.12 * com;
      glow = 0.95 + 0.3 * near + 0.45 * com + 0.08 * breath;
      crater = 0.5 + 0.2 * near + 0.25 * com;
      ring = 0.2 + 0.8 * Math.max(near, com);
      col = 0.32 + 0.1 * near + 0.18 * com;
      glint = 0.85 + 0.4 * com; motes = 0.75 + 0.25 * com; moteSpd = 1 + 0.4 * com;
    } else if (st === 'calling') {
      warn = 0.5 + 0.5 * Math.sin(time * (9 + 10 * k));
      call = 0.6 + 0.4 * k;
      y = Y_FLOAT + 0.5 * ease(k) + 0.1 * Math.sin(time * 1.05);
      spinRate = 0.3 + 7 * k * k;
      trem = 0.025 * k;
      glow = 1.3 + 0.7 * k + 0.5 * warn;
      crater = 0.8 + 0.6 * k + 0.3 * warn;
      ring = 0.55; col = 0.55 + 0.6 * k + 0.25 * warn;
      glint = 1.5; motes = 1; moteSpd = 1.6 + 3 * k;
    } else if (st === 'ascending') {
      const r = ease(seg(k, 0, 1));
      y = Y_FLOAT + 0.5 + 30 * Math.pow(k, 2.1);
      spinRate = 7 * (1 - k * 0.5);
      sy = 1 + 0.9 * r; sxz = 1 - 0.75 * Math.pow(seg(k, 0.4, 1), 1.5);
      glow = 2.0 * (1 - seg(k, 0.75, 1)) + 0.5;
      crater = 1.2 * (1 - r); ring = 0.4 * (1 - r);
      col = 1.4 * Math.sin(Math.PI * Math.min(1, k * 1.25 + 0.2)) * (1 - seg(k, 0.85, 1));
      glint = 1.5; motes = 1 - r; moteSpd = 4; dim = 1 - 0.35 * r;
      cg = 1 - seg(k, 0.0, 0.35);
    }
    glow += 1.3 * ans + 1.2 * this._flash;
    crater += 0.6 * ans;
    col += 0.35 * ans;
    ring = Math.max(ring, 0.6 * ans);

    this._g += (glow - this._g) * fdt;
    this._crater += (crater - this._crater) * fdt;
    this._ring += (ring - this._ring) * fdt;
    this._col += (col - this._col) * fdt;

    const F = this.float;
    F.position.set(trem ? Math.sin(time * 61) * trem : 0, y, trem ? Math.cos(time * 53) * trem : 0);
    F.quaternion.setFromAxisAngle(this._tiltAxis, tilt);
    F.scale.set(sxz, sy, sxz);
    this._yaw += dt * spinRate;
    this.spin.rotation.y = this._yaw;
    // the collar does not spin; it swings gently (and is wrenched while waking)
    this.collar.rotation.set(0, 0.05 * Math.sin(time * 0.6) + (st === 'waking' ? 0.12 * Math.sin(time * 23) * seg(k, 0.1, 0.35) * (1 - seg(k, 0.35, 0.5)) : 0), 0);

    // ---- materials
    const cu = this.crystalMat.uniforms;
    cu.uTime.value = time; cu.uGlow.value = this._g; cu.uGlint.value = glint; cu.uFlash.value = this._flash * 0.8 + ans * 0.4 + 0.5 * warn * call;
    const su = this.splMat.uniforms;
    su.uTime.value = time + 3.1; su.uGlow.value = this._g * 0.9 * (0.5 + 0.5 * this._lift + (st === 'dormant' ? 0.3 : 0)); su.uGlint.value = glint; su.uFlash.value = cu.uFlash.value;
    this.haloMat.uniforms.uOp.value = 0.11 * this._g + 0.05 * warn;
    this.halo.visible = st !== 'dormant';

    const gu = this.groundMat.uniforms;
    gu.uTime.value = time;
    gu.uCrater.value = this._crater;
    gu.uCrack.value = st === 'dormant' ? 0.12 + 0.3 * breath * breath : 0.3;
    gu.uRing.value = this._ring;
    gu.uGroove.value = 0.16 + 0.12 * Math.min(1, this._ring * 2);
    gu.uRot.value = time * (0.03 + 0.06 * near);
    gu.uCall.value = call; gu.uWarn.value = warn;
    gu.uAnswer.value = ans;
    gu.uDim.value = dim;

    const cm = this.colMat.uniforms;
    cm.uTime.value = time; cm.uOp.value = this._col * (1 + 0.25 * warn); cm.uCore.value = 1 + 0.6 * call;
    cm.uLo.value = y - 2.65 * SH * sy; cm.uHi.value = y + 4.0 * SH * sy;
    cm.uColor.value.setHex(0xe8dcff);
    if (call > 0) cm.uColor.value.lerp(_col.setHex(0xbfefff), 0.6 * call);
    const cw = 1.05 + 0.35 * call * (0.6 + 0.4 * warn) + (st === 'ascending' ? 0.8 * Math.sin(Math.PI * k) : 0);
    this.column.scale.set(cw, 64, cw);
    this.column.visible = this._col > 0.004;

    // ---- sigils + spokes (sealed pacts light their stone; the open Pact screen's draft glows faintly)
    const awake = st === 'dormant' ? 0 : st === 'waking' ? seg(k, 0.4, 1) : 1;
    const base = (0.14 + 0.24 * awake + 0.14 * near * awake) * (st === 'ascending' ? 1 - k : 1);
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    const G = this._gain;
    const hS = !!se.haste, hD = !!(dr && dr.haste) && !hS;
    const eS = !!se.echo, eD = !!(dr && dr.echo) && !eS;
    const heat = se.heat | 0, dh = dr ? Math.max(heat, dr.heat | 0) : heat;
    const lit = (s, d, f) => (s ? 1.25 + 0.2 * pulse : d ? 0.5 + 0.2 * pulse : base) + 1.6 * f;
    G[0] = lit(hS, hD, this._seal[0]) + (call ? 0.8 * warn : 0);
    G[1] = lit(eS, eD, this._seal[1]);
    G[2] = G[1];
    G[3] = (heat > 0 ? 0.8 + 0.08 * heat + 0.12 * pulse : dh > 0 ? 0.45 + 0.15 * pulse : base) + 1.4 * this._seal[2];
    const emb = 0.85 + 0.15 * Math.sin(time * 11.0) * Math.sin(time * 7.3);
    for (let i = 0; i < 3; i++) G[4 + i] = (i < heat ? 1.45 * emb : i < dh ? 0.6 + 0.35 * pulse : 0.06) + (i === heat - 1 ? 1.5 * this._seal[2] : 0);
    G[7] = 0;
    this.sigMat.uniforms.uTime.value = time;
    this.sigMat.uniforms.uFade.value = st === 'ascending' ? 1 - 0.6 * k : 1;
    const sv = gu.uSeal.value;
    sv.set(hS ? 1 : hD ? 0.3 : 0, eS ? 1 : eD ? 0.3 : 0, heat > 0 ? 0.55 + 0.15 * heat : dh > 0 ? 0.3 : 0);
    sv.x += this._seal[0]; sv.y += this._seal[1]; sv.z += this._seal[2];

    // ---- chains, splinters, motes
    this.root.updateMatrixWorld(true);
    this._chains(st, k, time, cg, se, dr, warn);
    this._lift += ((st === 'dormant' ? 0 : st === 'waking' ? lift : 1) - this._lift) * Math.min(1, dt * 8);
    if (st === 'waking') this._lift = lift;
    this._splinters(dt, time, st, k, spinRate);
    this._moteT += dt * moteSpd;
    this._motes(this._moteT, time, motes, st === 'dormant' ? 10 : N_MOTES, y);
  }

  _chains(st, k, time, cg, se, dr, warn) {
    const R = this.root.position, mw = this.collar.matrixWorld;
    const glow = this.chainGlow.array;
    let idx = 0;
    for (let c = 0; c < 3; c++) {
      const A = this.anchors[c];
      _b.copy(this.lugs[c]).applyMatrix4(mw).sub(R);
      // ascending: the chains part and fall to the crater floor
      if (cg < 1) _b.lerp(this.drop[c], 1 - cg);
      const dx = _b.x - A.x, dy = _b.y - A.y, dz = _b.z - A.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let sag = 0, jit = 0;
      if (st === 'dormant') { sag = 0.02; jit = 0.008; }
      else if (st === 'waking') {
        const strain = seg(k, 0.05, 0.3), after = seg(k, 0.3, 1);
        jit = 0.05 * strain * (1 - after);
        sag = after > 0 ? 0.25 * after + 0.9 * Math.exp(-after * 6) * Math.abs(Math.sin(after * 22)) : 0;
      } else if (st === 'calling') { sag = 0.12; jit = 0.03 * warn; }
      else if (st === 'ascending') { sag = 0.25 + 0.6 * (1 - cg); }
      else sag = 0.26 + 0.05 * Math.sin(time * 0.8 + c * 2.1);
      sag *= Math.min(1, d / 3);
      const n = Math.max(2, Math.min(NMAX, Math.round(d / LINK)));
      // control point: midpoint lowered by 2 × sag (quadratic Bézier peak sag = sag)
      _c.set((A.x + _b.x) / 2, (A.y + _b.y) / 2 - 2 * sag, (A.z + _b.z) / 2);
      // pact light
      const P = PACTS[c];
      let on = 0;
      if (P.id === 'haste') on = se.haste ? 1 : dr?.haste ? 0.3 : 0;
      else if (P.id === 'echo') on = se.echo ? 1 : dr?.echo && !se.echo ? 0.3 : 0;
      else on = (se.heat | 0) > 0 ? 0.55 + 0.15 * (se.heat | 0) : dr && (dr.heat | 0) > 0 ? 0.3 : 0;
      const fl = this._seal[c];
      const strainGlow = st === 'waking' ? 0.5 * seg(k, 0.05, 0.3) * (1 - seg(k, 0.3, 0.4)) * (0.5 + 0.5 * Math.sin(time * 41 + c)) : st === 'dormant' ? 0.03 : 0;
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n, it = 1 - t;
        _p.set(it * it * A.x + 2 * it * t * _c.x + t * t * _b.x, it * it * A.y + 2 * it * t * _c.y + t * t * _b.y, it * it * A.z + 2 * it * t * _c.z + t * t * _b.z);
        _t.set(2 * it * (_c.x - A.x) + 2 * t * (_b.x - _c.x), 2 * it * (_c.y - A.y) + 2 * t * (_b.y - _c.y), 2 * it * (_c.z - A.z) + 2 * t * (_b.z - _c.z)).normalize();
        _u.crossVectors(_t, UP);
        if (_u.lengthSq() < 1e-4) _u.set(1, 0, 0);
        _u.normalize();
        _w.crossVectors(_u, _t);                         // ⟂ both, "up-ish"
        if (jit) { const s = Math.sin(time * 47 + j * 1.7 + c * 3) * jit * Math.sin(Math.PI * t); _p.addScaledVector(_u, s); }
        // alternate link planes; columns: x = along, y = across, z = thickness
        if (j & 1) { _a.copy(_u); _v.crossVectors(_t, _a); }
        else { _a.copy(_w); _v.crossVectors(_t, _a); }
        const e = _m4.elements;
        e[0] = _t.x * 0.134; e[1] = _t.y * 0.134; e[2] = _t.z * 0.134; e[3] = 0;
        e[4] = _a.x * 0.085; e[5] = _a.y * 0.085; e[6] = _a.z * 0.085; e[7] = 0;
        e[8] = _v.x * 0.12; e[9] = _v.y * 0.12; e[10] = _v.z * 0.12; e[11] = 0;
        e[12] = _p.x; e[13] = _p.y; e[14] = _p.z; e[15] = 1;
        this.chains.setMatrixAt(idx, _m4);
        // glow: sealed energy flows from the stone up to the shard; a seal flash runs along as a wave front
        const flow = 0.55 + 0.45 * Math.sin(time * 5 - j * 0.7);
        const wave = fl > 0 ? Math.exp(-Math.pow((t - (1 - fl) * 1.2) * 6, 2)) * 2.5 : 0;
        const g = on * flow * 1.1 + wave;
        const colr = P.id === 'echo' && (j & 1) ? this.chainAcc : this.chainCol[c];
        glow[idx * 3] = colr.r * g + strainGlow * 0.9; glow[idx * 3 + 1] = colr.g * g + strainGlow * 0.8; glow[idx * 3 + 2] = colr.b * g + strainGlow;
        idx++;
      }
    }
    this.chains.count = idx;
    this.chains.instanceMatrix.needsUpdate = true;
    this.chainGlow.needsUpdate = true;
  }

  _splinters(dt, time, st, k, spinRate) {
    const F = this.float.position, L = this._lift;
    this._orb += dt * (0.3 + 0.35 * spinRate);
    const asc = st === 'ascending' ? k : 0;
    for (let i = 0; i < N_SPL; i++) {
      const s = this.splSeed[i];
      const l = st === 'waking' ? ease(seg(k, 0.33 + s.delay, 0.8 + s.delay)) : L;
      const a = s.ph + this._orb * (i & 1 ? 1 : 0.8);
      const or = s.or * (1 - 0.6 * asc);
      _a.set(F.x + Math.cos(a) * or, F.y + s.oy * (1 + asc) + 0.12 * Math.sin(time * 1.3 + i), F.z + Math.sin(a) * or);
      _p.set(s.gx, s.gy, s.gz).lerp(_a, l);
      _p.y += Math.sin(Math.PI * l) * 0.8;
      _qb.setFromEuler(_e.set(0.35 * Math.sin(i), time * s.spin + i, 0.4 * Math.cos(i * 1.7)));
      _q.slerpQuaternions(s.grot, _qb, l);
      _s.setScalar(s.sc * (st === 'ascending' ? 1 - 0.6 * k : 1));
      this.spl.setMatrixAt(i, _m4.compose(_p, _q, _s));
    }
    this.spl.instanceMatrix.needsUpdate = true;
  }

  _motes(t, time, gain, count, y) {
    const M = this.motes, sd = this.moteSeed, top = Math.max(3, y + 4.5);
    M.count = count;
    for (let i = 0; i < count; i++) {
      const ph = (sd[i * 4] + t * sd[i * 4 + 3] * 0.11) % 1;
      const a = sd[i * 4 + 1] + t * 0.5 * (i & 1 ? 1 : -1);
      const r = sd[i * 4 + 2] * (0.55 + 0.6 * Math.sin(ph * Math.PI)) + 0.35;
      const sc = 0.075 * Math.sin(ph * Math.PI) * gain * (0.8 + 0.4 * sd[i * 4 + 3]);
      _p.set(Math.cos(a) * r, 0.2 + ph * top, Math.sin(a) * r);
      _q.identity(); _s.setScalar(Math.max(0.0001, sc));
      M.setMatrixAt(i, _m4.compose(_p, _q, _s));
    }
    M.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ one-shots

  // waking k = 0.3: the bindings give; the shard tears free
  _snap() {
    if (this._snapped) return;
    this._snapped = true;
    const fx = this.game.fx, R = this.root.position;
    if (!fx) return;
    fx.shake(0.4);
    for (const A of this.anchors) {
      _v.set(R.x + A.x * 0.8, A.y * 0.6, R.z + A.z * 0.8);
      fx.burst(_v, { color: 0xf2eaff, count: 14, speed: 6, life: 0.5, size: 0.22, up: 1.2, gravity: 9, hdr: 2.2 });
    }
    _v.set(R.x, 0, R.z);
    fx.burst(_v, { color: (BIOME[this.act] ?? BIOME[0]).dust, count: 26, speed: 4.5, life: 1.3, size: 1.0, up: 1.6, gravity: 2, blend: 'normal', spread: 1.0 });
    fx.burst(_v, { color: 0x4a4350, count: 16, speed: 6, life: 0.9, size: 0.3, up: 3.5, gravity: 14, blend: 'normal', spread: 0.8 });
    fx.flashDisc(_v, { color: RIFT, radius: 3.2, life: 0.55, hdr: 1.4 });
    fx.ring(_v, { color: RIFT, radius: 6.6, life: 0.8, width: 0.1, hdr: 1.6 });
    fx.light(_v, RIFT, 120, 0.8, 16);
    this._flash = 1;
  }

  burst(kind) {
    const fx = this.game.fx, R = this.root.position;
    if (!fx) return;
    _v.set(R.x, 0, R.z);
    if (kind === 'wake') {
      // the bindings strain: a rumble, crater dust, the fissures flash
      this._snapped = false; this._lastK = 0;
      fx.shake(0.22);
      fx.burst(_v, { color: (BIOME[this.act] ?? BIOME[0]).dust, count: 18, speed: 2.5, life: 1.4, size: 0.8, up: 1.0, gravity: 1, blend: 'normal', spread: 1.6 });
      fx.ring(_v, { color: RIFT, radius: 3.0, life: 0.6, width: 0.12, hdr: 1.5 });
      this._flash = 0.6;
      return;
    }
    const i = kind === 'seal-haste' ? 0 : kind === 'seal-echo' ? 1 : kind === 'seal-wrath' ? 2 : -1;
    if (i >= 0) {
      const P = PACTS[i], d = scr(P.th, _w);
      _a.set(R.x + d.x * STONE_R, 1.2, R.z + d.z * STONE_R);
      _b.set(R.x + d.x * STONE_R, 0, R.z + d.z * STONE_R);
      fx.ring(_b, { color: P.hex, radius: 2.0, life: 0.55, width: 0.2, hdr: 2 });
      fx.burst(_a, { color: P.hex, count: 26, speed: 4.5, life: 0.8, size: 0.32, up: 2.2, hdr: 2.2 });
      if (P.accent) fx.burst(_a, { color: P.accent, count: 14, speed: 3.5, life: 0.9, size: 0.28, up: 2.6, hdr: 2.2 });
      if (P.id === 'wrath') fx.burst(_a, { color: 0xffb070, count: 16, speed: 2, life: 1.4, size: 0.18, up: 3.5, gravity: -2, hdr: 2.4 });
      fx.light(_b, P.hex, 70, 0.5, 9);
      this._seal[i] = 1;
      this._flash = Math.max(this._flash, 0.5);
      if (P.id === 'haste') {
        fx.ring(_v, { color: P.hex, radius: COMMUNE_R + 1.5, life: 0.7, width: 0.12, hdr: 1.8 });
        fx.shake(0.18);
      }
      return;
    }
    if (kind === 'answer') {
      // the Rift answers the pact: the circle flares, a shockwave runs out to where the horde will come from
      _a.set(R.x, this.float.position.y + 2, R.z);
      fx.ring(_v, { color: RIFT, radius: 13, life: 0.9, width: 0.07, hdr: 1.8 });
      fx.ring(_v, { color: RIFT, radius: COMMUNE_R, life: 0.45, width: 0.2, hdr: 2.2 });
      fx.flashDisc(_v, { color: RIFT, radius: 4.6, life: 0.45, hdr: 1.3 });
      fx.burst(_a, { color: RIFT, count: 34, speed: 7, life: 1.0, size: 0.4, up: 0.8, hdr: 2.2 });
      fx.light(_v, RIFT, 110, 0.7, 16);
      fx.shake(0.3);
      this._flash = 1;
      return;
    }
    if (kind === 'ascend') {
      // the chains part and the shard rises up its own light
      for (const A of this.anchors) {
        _a.set(R.x + A.x * 0.35, this.float.position.y + COLLAR_Y, R.z + A.z * 0.35);
        fx.burst(_a, { color: 0xf2eaff, count: 12, speed: 5, life: 0.6, size: 0.24, up: 0.5, gravity: 10, hdr: 2.2 });
      }
      _a.set(R.x, this.float.position.y, R.z);
      fx.burst(_a, { color: RIFT, count: 40, speed: 5, life: 1.2, size: 0.4, up: 5, hdr: 2.2, spread: 0.8 });
      fx.ring(_v, { color: RIFT, radius: 7.5, life: 0.8, width: 0.12, hdr: 1.8 });
      fx.flashDisc(_v, { color: RIFT, radius: 3.5, life: 0.6, hdr: 1.4 });
      fx.light(_v, RIFT, 130, 0.9, 18);
      fx.shake(0.4);
      this._flash = 1;
    }
  }

  dispose() {
    this.game.scene.remove(this.root);
    for (const d of this.own) d.dispose?.();
    this.own.length = 0;
  }
}

const NO_SEAL = { echo: false, heat: 0, haste: false };
