import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fromScreen, smoothPolyline, smooth, fbm, sideOf } from '../common.js';
import {
  makeBroadleaf, makeBirch, makeCanopy, makeBush, makeFern, makeRock, makeLog, makeLilies, PropBatch,
} from '../props.js';
import { createWaterMaterial } from '../water.js';
import {
  makeWillow, makePoplar, makeCattails, makeBridge, makeRuinArch, makeColumn, makeRubble, makeKingStatue,
  makeGiantHead, makeCliff, makeScale, makeCrystals, makeScorch, makeShoal, createShardMaterial,
  createRiverWaterMaterial, buildWaterSheet, buildFalls, createMist, createDragonflies, createRain,
} from '../props_river.js';

// =====================================================================================
//  Act III — The Stormwater Reach. The Prism Crown fell into a great river and the dragons came to
//  drink its light. Late afternoon under a breaking storm: slate cloud shadows racing over a lush
//  cool-green meadow, gold light in the gaps. A braided river pours from grey-blue cliffs
//  (three waterfalls into plunge pools on the far side), splits around a long island into two
//  shallow fords that cross the arena, and leaves through a canyon under an old three-arched bridge.
//  The drowned kingdom: a broken bridge on the old road, a palace arcade and the headless king on
//  the island, his crowned head fallen in the confluence with glowing crown shards. Dragon-scorched
//  earth and giant shed scales near the water. Willows, poplars, cattails, gravel bars.
//  Layout is authored in SCREEN space (S(right, up) metres from the centre of the title view).
// =====================================================================================

const S = (sx, sy) => fromScreen(sx, sy);
const SP = (pts) => pts.map(([a, b]) => S(a, b));
const R2 = Math.SQRT1_2;
/** rotY that turns local +X toward the screen direction (dx right, dy up). */
const rotScreen = (dx, dy) => { const wx = R2 * (dx - dy), wz = -R2 * (dx + dy); return Math.atan2(-wz, wx); };
/** rotY that turns local +Z (a model's front) toward the camera. */
const FACE_CAM = Math.PI / 4;

const WATER_Y = -0.08;
const VALLEY_Y = -7.15;

const PAL = {
  trunk: 0x4f4038, trunkTop: 0x6a5646, willowBark: 0x584a3f, cut: 0xc9b08a,
  leafDark: 0x2a6447, leafLight: 0x5ea85c,
  willowDark: 0x3a7240, willowLight: 0x8cc25a, willowTip: 0xa8d06a,
  poplarDark: 0x2a6240, poplarLight: 0x74b256,
  birchBark: 0xdcd8cc, birchLeafDark: 0x6aa64a, birchLeafLight: 0xb0d46a,
  bushDark: 0x2e6a3e, bushLight: 0x60a656,
  fernDark: 0x2c683a, fernLight: 0x74ba58,
  rock: 0x8f989f, rockDark: 0x56606a, moss: 0x5e8f46,
  stone: 0xb6b2a5, stoneDark: 0x58625c, ivyDark: 0x2f6436, ivyLight: 0x6aa84a,
  reedRoot: 0x47703a, reedTip: 0xbcbc72,
  lily: 0x6aa840, lilyDark: 0x3c7a2c,
  slateBands: [0x7a8796, 0x8b98a6, 0x9ba7b3, 0x8290a0], cliffMoss: 0x5e9048,
  scale: 0x4a3b42, scaleEdge: 0xb4a78e,
  crystal: 0xe6f4ff, crystalBase: 0x9ec2e2,
  crown: 0xc4aa6a, crownDark: 0x86764e,
  sand: 0xb7a987, gravel: 0x8c877a, sandWet: 0x7f765f, pebbleA: 0x868d94, pebbleB: 0xa69b85, pebbleC: 0x6c7480,
  char: 0x27231f, ash: 0x8a857c, charEdge: 0x3d3b2b,
};
const DRIFT = { trunk: 0x7d766b, trunkTop: 0xaaa293, cut: 0xc6bba4, moss: 0x7c9a5c };

// ---------- the river system (screen space) ----------
const CH = {
  up:   { w: 10,  pts: [[19.5, 58], [17.5, 51], [13.5, 44], [10, 38]] },
  a:    { w: 5.5, pts: [[10, 38], [-2, 36], [-14, 33], [-27, 28], [-39, 21], [-49, 13]] },
  b:    { w: 6.5, pts: [[10, 38], [9, 29], [4, 20], [-6, 13], [-19, 8.5], [-33, 7], [-44, 9], [-49, 13]] },
  down: { w: 11,  pts: [[-49, 13], [-60, 10], [-74, 7], [-92, 5], [-130, 3]] },
  trib: { w: 3.8, pts: [[-23, 58.5], [-22.5, 50], [-20, 41], [-17, 32.5]] },
};
const POOLS = [[20.5, 60, 6.6], [12, 62.5, 4.2], [-23.5, 60, 4.2]];   // plunge pools [sx, sy, r]
// falls: [pool index, width, cliff height above the terrain]; the foot sits inside the pool's far rim
const FALLS = [[0, 6.5, 11], [1, 2.6, 9], [2, 3.2, 10]].map(([pi, w, h]) => {
  const [px, py, r] = POOLS[pi], l = Math.hypot(px, py), d = r - 1.7;
  return [px + px / l * d, py + py / l * d, w, h];
});
const BRIDGE = { c: [-1, 16.5], dir: [0.57, -0.82] };   // broken bridge across braid B (axis, screen)
const KING_BRIDGE = { c: [15.3, 46.9], dir: [0.87, -0.5] }; // intact bridge across the upstream channel

let _built = null;   // per-build cache (smoothed channels) shared by layout() and props()
function channels() {
  if (_built) return _built;
  const sm = (c) => ({ w: c.w, pts: smoothPolyline(SP(c.pts), 1.5) });
  _built = { up: sm(CH.up), a: sm(CH.a), b: sm(CH.b), down: sm(CH.down), trib: sm(CH.trib) };
  return _built;
}

export const river = {
  id: 'river', name: 'The Stormwater Reach', seed: 2024,
  palette: PAL,
  atmos: {
    background: 0x8299ab, hemiSky: 0x98b0dc, hemiGround: 0x4a6a46, hemiIntensity: 1.2,
    moon: 0xffd49c, moonIntensity: 3.3,
    grade: { tint: [0.97, 1.0, 1.04], saturation: 1.1, contrast: 1.08, vignette: 0.27 },
  },
  env: { haze: 0x8299ab, saturation: 0.92, lift: 0.008, dapple: 0, cloudCover: 0.43, cloudDark: 0.42, cloudScale: 0.0115, cloudSpeed: [4.2, 1.6], wind: 1.05, windDir: [0.75, 0.66], edgeHaze: [62, 114], edgeHazeMax: 0.55 },
  rim: [0xe6f2ff, 0.4],
  terrain: { flatR: 56, ramp: 12, farRise: 4.5, nearDrop: -6.5, noiseAmp: 2.8, depth: 0.5 },

  layout() {
    const c = channels();
    const road = { width: 3.2, points: smoothPolyline(SP([[54, -68], [38, -46], [25, -27], [15, -11], [8.5, 1.5], [4.6, 8.6]]), 2) };
    const plaza = { width: 2.6, points: smoothPolyline(SP([[-6.6, 24.6], [-10, 24], [-13.5, 22.6]]), 1) };
    const rivers = [c.up, c.a, c.b, c.down, c.trib].map((r) => ({ width: r.w, points: r.pts }));
    const ponds = POOLS.map(([sx, sy, r]) => { const [x, z] = S(sx, sy); return { x, z, r }; });
    const [cx, cz] = S(-27, -24);
    ponds.push({ x: cx, z: cz, r: 4.2 });                 // the drowned courtyard
    return { paths: [road, plaza], rivers, ponds };
  },

  ground: {
    groundA: 0x4b9748, groundB: 0x68b056, groundDark: 0x31723c, groundDry: 0x92aa55,
    path: 0x9b958a, pathEdge: 0x86955a, bank: 0x877c64, slope: 0x66745c, soil: 0x4e4536,
    speck: 0x88b45c, speckAmt: 0.22, pebbles: 0.9,
  },
  grass: {
    count: 64000, height: 0.5, width: 0.13, density: 1.0, patchLo: 0.13, clump: [5, 11], clumpRadius: 0.34,
    colors: { root: 0x29623a, tipA: 0x68b558, tipB: 0xa2cc64 },
  },
  flowers: {
    count: 6500, height: 0.35, width: 0.14, density: 1.0, patchLo: 0.1, clump: [3, 7], clumpRadius: 0.5,
    colors: { petals: [0xeae6d6, 0xf2de86, 0x5c8eea, 0x52a8e2] },
  },
  water: null,           // the Reach builds its own water sheet (braids + pools + valley lakes) in props()
  motes: [
    { kind: 'dot', count: 260, colors: [0xf6f2e4, 0xe4ecee], size: 0.11, height: 4.5, rise: 0.06, drift: [1.0, 0.3], additive: false, opacity: 0.85 },
    { kind: 'dot', count: 90, colors: [0xfff0c8, 0xe6f4ff], size: 0.13, height: 3, rise: 0.1, drift: [0.4, 0.1], additive: true, intensity: 0.55 },
  ],

  props(ctx) {
    const { rng } = ctx;
    const pal = PAL;
    const ch = channels();
    const V = (n, fn) => Array.from({ length: n }, () => fn());
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const tint = (amt = 0.1) => [1 + (rng() - 0.5) * amt, 1 + (rng() - 0.5) * amt * 0.8, 1 + (rng() - 0.5) * amt];
    const yaw = () => rng() * Math.PI * 2;

    // ---- variants ---------------------------------------------------------------------
    const willows = V(3, () => makeWillow(rng, pal));
    const bigWillows = V(2, () => makeWillow(rng, pal, { size: 1.3 }));
    const poplars = V(3, () => makePoplar(rng, pal));
    const alders = V(3, () => makeBroadleaf(rng, pal, { size: 0.9 }));
    const birches = V(2, () => makeBirch(rng, pal));
    const canopies = V(3, () => makeCanopy(rng, pal));
    const bushes = V(3, () => makeBush(rng, pal));
    const blossom = V(2, () => makeBush(rng, pal, { dots: [0xeee8d6, 0xf2de86], dotChance: 0.16 }));
    const blueBush = V(1, () => makeBush(rng, pal, { dots: [0x9cadf4, 0xeee8d6], dotChance: 0.14 }));
    const ferns = V(2, () => makeFern(rng, pal));
    const rocks = V(3, () => makeRock(rng, pal));
    const wetRocks = V(2, () => makeRock(rng, { ...pal, rock: 0x6f7880, rockDark: 0x434c54 }, { mossAmt: 0.95 }));
    const bigRocks = V(2, () => makeRock(rng, pal, { size: 1.6, mossAmt: 0.5 }));
    const slabs = V(3, () => makeRock(rng, { ...pal, rock: 0x9ea3a2, rockDark: 0x5c6566 }, { flat: true, mossAmt: 0.4 }));
    const paving = V(2, () => makeRock(rng, { ...pal, rock: pal.stone, rockDark: 0x7d7a70 }, { flat: true, mossAmt: 0.6 }));
    const cattails = V(3, () => makeCattails(rng, pal));
    const irises = V(2, () => makeCattails(rng, pal, { iris: true, blades: 10 }));
    const lilies = V(2, () => makeLilies(rng, pal));
    const drift = V(2, () => makeLog(rng, DRIFT, { length: 2.6 + rng() * 1.4 }));
    const columns = V(3, () => makeColumn(rng, pal));
    const rubble = V(3, () => makeRubble(rng, pal));
    const scales = V(3, () => makeScale(rng, pal, { size: 1 + rng() * 0.4 }));
    const cliffs = V(4, () => makeCliff(rng, pal, { w: 10 + rng() * 3, h: 9 + rng() * 3, d: 4 }));
    const ridges = V(2, () => makeCliff(rng, pal, { w: 14, h: 13, d: 6 }));
    const crystals = V(3, () => makeCrystals(rng, pal));
    const bigCrystals = V(2, () => makeCrystals(rng, pal, { size: 1.8, n: 5 }));

    // crown shards glow: their own tiny batch (one draw, emissive material)
    const shardBatch = new PropBatch({ chunk: 200 });
    const shard = (x, z, s = 1, o = {}) => {
      shardBatch.add(o.geo ?? pick(s > 1.4 ? bigCrystals : crystals), { x, z, y: o.y ?? ctx.y(x, z), rotY: yaw(), s, tiltX: o.tiltX ?? (rng() - 0.5) * 0.3, tiltZ: o.tiltZ ?? (rng() - 0.5) * 0.3 });
    };

    // ---- helpers -------------------------------------------------------------------------
    const tree = (x, z, kind, o = {}) => {
      const geo = kind === 'willow' ? pick(o.big ? bigWillows : willows) : kind === 'poplar' ? pick(poplars) : kind === 'birch' ? pick(birches) : pick(alders);
      const s = o.s ?? (0.9 + rng() * 0.3);
      const trunkR = (kind === 'willow' ? (o.big ? 0.62 : 0.48) : kind === 'poplar' ? 0.22 : kind === 'birch' ? 0.2 : 0.36) * s;
      ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.12), tiltX: (rng() - 0.5) * 0.05, tiltZ: (rng() - 0.5) * 0.05 }, { far: o.far });
      ctx.reserve(x, z, o.space ?? trunkR + 0.9);
      if (!o.far) { ctx.solid(x, z, trunkR); ctx.footprint(x, z, trunkR + 1.0, 0.35); }
    };
    const rock = (x, z, s, o = {}) => {
      const big = o.big ?? s > 1.3;
      const geo = o.geo ?? pick(big ? bigRocks : (o.wet ? wetRocks : rocks));
      const sc = big ? s / 1.6 : s, R = (big ? 1.8 : 1.1) * sc;
      ctx.place(geo, { x, z, y: o.y, rotY: yaw(), s: sc, tint: tint(0.08), shade: 0.95 + rng() * 0.1 }, { far: o.far });
      ctx.reserve(x, z, R);
      if (o.solid !== false && !o.far) ctx.solid(x, z, R * 0.78);
      ctx.footprint(x, z, R + 0.3, 0.3);
    };
    const deco = (geo, x, z, s = 1, o = {}) => { ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.12), ...o }); };
    const at = (sx, sy) => S(sx, sy);
    const inWater = (x, z, m = 0) => ctx.mask.sample(x, z).waterD > -m;

    // water-sheet features (foam rings) collected while placing
    const foamCircles = [];      // [x, z, r]
    const shoals = [];           // { cx, cz, rx, rz, rot }
    const whiteSpots = [];       // [x, z, radius, strength]

    // ---- 1. the broken bridge on the old road (hero piece, crossing braid B) -------------------
    // a bridge across a channel: geometry + collision along piers / abutments / stairs + foam at the piers
    const placeBridge = (c, dir, o) => {
      const [cx, cz] = at(c[0], c[1]);
      const geo = makeBridge(rng, pal, o);
      const ry = rotScreen(dir[0], dir[1]);
      ctx.place(geo, { x: cx, z: cz, y: 0, rotY: ry });
      const ax = Math.cos(ry), az = -Math.sin(ry);       // local +X in world
      const zx = Math.sin(ry), zz = Math.cos(ry);        // local +Z in world
      const L = geo.userData.length, hw = (o.width ?? 3) / 2;
      for (const px of geo.userData.piers) {
        const end = Math.abs(px) > L / 2 - 1;
        if (end) { const x = cx + ax * px, z = cz + az * px; ctx.solid(x, z, hw * 0.68); ctx.reserve(x, z, hw + 0.4); continue; }
        for (const lz of [-hw * 0.95, 0, hw * 0.95]) {        // pier + cutwaters
          const x = cx + ax * px + zx * lz, z = cz + az * px + zz * lz;
          ctx.solid(x, z, 0.6); ctx.reserve(x, z, 0.9);
          foamCircles.push([x, z, 0.75]);
        }
      }
      const ramp = o.ramps ?? 0;
      if (ramp > 0) for (const s of [-1, 1]) {                    // approach stairs: one circle each
        const lx = s * (L / 2 + ramp * 0.55), x = cx + ax * lx, z = cz + az * lx;
        ctx.solid(x, z, Math.min(hw * 0.68, ramp * 0.45)); ctx.reserve(x, z, 1.8); ctx.footprint(x, z, 1.9, 0.15);
      }
      for (const s of [-1, 1]) { const lx = s * (L / 2 - 0.6); ctx.footprint(cx + ax * lx, cz + az * lx, 2.2, 0.15); }
      return { cx, cz, ax, az, zx, zz, ry, L };
    };
    { // the King's Bridge, still standing across the upstream channel: its arches frame the falls behind
      placeBridge(KING_BRIDGE.c, KING_BRIDGE.dir, { spans: 3, span: 4.4, width: 3.0, pierW: 1.2, spring: 0.5, broken: [], ramps: 1.8, gaps: 0.12 });
    }
    {
      const { cx, cz, ax, az, zx, zz, ry } = placeBridge(BRIDGE.c, BRIDGE.dir, { spans: 3, span: 4.2, width: 3.0, pierW: 1.2, spring: 0.45, broken: [1], ramps: 2.4, gaps: 0.2 });
      // the fallen middle span: tumbled blocks in the ford (one solid, the rest wadeable)
      for (let i = 0; i < 5; i++) {
        const lx = (rng() - 0.5) * 3.2, lz = (rng() - 0.5) * 4.2, x = cx + ax * lx + zx * lz, z = cz + az * lx + zz * lz;
        ctx.place(pick(rubble), { x, z, y: -0.32, rotY: yaw(), s: 0.9 + rng() * 0.4 });
        foamCircles.push([x, z, 0.55]);
      }
      { const x = cx + zx * 2.6, z = cz + zz * 2.6; ctx.place(pick(slabs), { x, z, y: -0.28, rotY: ry, s: 0.9 }); ctx.solid(x, z, 0.7); foamCircles.push([x, z, 0.9]); }
      // flat paving slabs leading up the road
      for (let i = 0; i < 9; i++) {
        const t = 0.15 + i * 0.1, [sx, sy] = [4.6 + (54 - 4.6) * t * 0.35, 8.6 - (8.6 + 68) * t * 0.35];
        const [x, z] = at(sx + (rng() - 0.5) * 2.4, sy + (rng() - 0.5) * 2.4);
        if (ctx.free(x, z, 0.6, { path: true, pad: 0.1 })) { ctx.place(pick(paving), { x, z, y: -0.12, rotY: yaw(), s: 0.42 + rng() * 0.2 }); ctx.reserve(x, z, 0.6); }
      }
      // reeds and a willow framing the far abutment
      for (let i = 0; i < 6; i++) {
        const lx = (rng() < 0.5 ? -1 : 1) * (3.9 + rng() * 1.4), lz = (rng() - 0.5) * 7, x = cx + ax * lx + zx * lz, z = cz + az * lx + zz * lz;
        if (!inWater(x, z, 0.4)) deco(pick(cattails), x, z, 0.8 + rng() * 0.4);
      }
    }

    // ---- 1b. the meadow around the title view: low, readable story pieces (never tall near the centre) ----
    {
      const P = (sx, sy) => at(sx, sy);
      { const [x, z] = P(-15, -5); if (ctx.free(x, z, 1.4)) { rock(x, z, 1.05, { big: false }); const [a, b] = P(-13.2, -6.4); deco(pick(ferns), a, b, 1.0); const [c, d] = P(-16.8, -3.6); deco(pick(irises), c, d, 0.8); } }
      { const [x, z] = P(22, -6); if (ctx.free(x, z, 0.9)) { ctx.place(columns[0], { x, z, rotY: 0.7, s: 1.05 }); ctx.reserve(x, z, 1.0); ctx.solid(x, z, 0.5); ctx.footprint(x, z, 1.3, 0.2);
        const [a, b] = P(23.6, -4.6); deco(pick(rubble), a, b, 0.9); const [c, d] = P(20.4, -7.8); deco(pick(blossom), c, d, 0.9); } }
      { const [x, z] = P(-9, -19); if (ctx.free(x, z, 1.8)) { ctx.place(makeScorch(rng, pal, { r: 1.7 }), { x, z, y: 0, rotY: yaw() }); ctx.footprint(x, z, 1.5, 0.18); ctx.reserve(x, z, 1.0);
        const [a, b] = P(-6.6, -17.4); ctx.place(pick(scales), { x: a, z: b, y: -0.3, rotY: 2.1, tiltX: 0.12, tiltZ: 1.0, s: 1.2 }); ctx.reserve(a, b, 1.0); ctx.solid(a, b, 0.45); } }
      { const [x, z] = P(-22, 1.5); if (ctx.free(x, z, 1.6)) { ctx.place(pick(drift), { x, z, rotY: rotScreen(1, 0.15), tint: tint(0.08) }); ctx.reserve(x, z, 1.6);
        for (const k of [-1, 0, 1]) { const [a, b] = P(-22 + k * 1.1, 1.5 + k * 0.15); ctx.solid(a, b, 0.42); } }
      }
      { const [x, z] = P(9, 13); if (ctx.free(x, z, 0.8)) { deco(pick(blueBush), x, z, 1.0); ctx.reserve(x, z, 0.7); } }
    }

    // ---- 2. the island: palace arcade, the headless king, the crowned head in the confluence --------
    {
      // the king faces the bridge
      const [kx, kz] = at(-16.5, 21.5);
      const [bx, bz] = at(BRIDGE.c[0] - 6, BRIDGE.c[1] + 8.5);
      ctx.place(makeKingStatue(rng, pal), { x: kx, z: kz, y: 0, rotY: Math.atan2(bx - kx, bz - kz) });
      ctx.reserve(kx, kz, 2.2); ctx.solid(kx, kz, 1.45); ctx.footprint(kx, kz, 2.4, 0.1);
      for (let i = 0; i < 4; i++) { const a = yaw(), r = 1.8 + rng() * 0.8; deco(pick(rubble), kx + Math.cos(a) * r, kz + Math.sin(a) * r, 0.7 + rng() * 0.3); }
      for (let i = 0; i < 3; i++) { const a = yaw(), r = 1.6 + rng() * 0.4; shard(kx + Math.cos(a) * r, kz + Math.sin(a) * r, 0.8 + rng() * 0.3); }
      // arcade along the island, facing the camera
      const row = [[-24.5, 19.4], [-29.5, 17.2], [-34.5, 15]];
      row.forEach(([sx, sy], i) => {
        const [x, z] = at(sx, sy);
        ctx.place(makeRuinArch(rng, pal, { span: 3.0, height: 2.5 + (i === 1 ? 0.3 : 0), broken: [0.1, 0.45, 0.85][i] }), { x, z, y: 0, rotY: rotScreen(-0.92, -0.4) });
        const ry = rotScreen(-0.92, -0.4), ax = Math.cos(ry), az = -Math.sin(ry);
        for (const s of [-1, 1]) { const px = x + ax * s * 1.93, pz = z + az * s * 1.93; ctx.solid(px, pz, 0.6); ctx.reserve(px, pz, 0.9); ctx.footprint(px, pz, 1.2, 0.25); }
        ctx.reserve(x, z, 1.2);
      });
      // the head, crowned, fallen into the shallows where the braids meet
      const [hx, hz] = at(-46.2, 15.2);
      const head = makeGiantHead(rng, pal);
      // face turned up toward the camera, lying on its cheek, crown tipped into the current
      ctx.place(head, { x: hx, z: hz, y: -0.25, rotY: FACE_CAM - 0.35, tiltX: -0.45, tiltZ: 1.2, s: 1.15 });
      ctx.reserve(hx, hz, 2.4); ctx.solid(hx, hz, 1.5); foamCircles.push([hx, hz, 1.55]);
      // crown shards spilled around it (and two big ones on the island tip)
      for (let i = 0; i < 6; i++) { const a = yaw(), r = 1.8 + rng() * 1.6, x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r; shard(x, z, 0.7 + rng() * 0.4, { y: Math.max(WATER_Y - 0.08, ctx.y(x, z)) }); }
      { const [x, z] = at(-41, 15.8); shard(x, z, 0.8, { geo: pick(bigCrystals) }); ctx.reserve(x, z, 0.8); ctx.solid(x, z, 0.35); ctx.footprint(x, z, 1.2, 0.2); }
      { const [x, z] = at(-12, 27.5); shard(x, z, 0.75, { geo: pick(bigCrystals) }); ctx.reserve(x, z, 0.8); ctx.solid(x, z, 0.35); ctx.footprint(x, z, 1.2, 0.2); }
      // island willow (upstream end) and alder by the arcade
      { const [x, z] = at(3, 30.5); tree(x, z, 'willow', { big: true, s: 1.0, space: 3 }); }
      { const [x, z] = at(-37.5, 19.5); tree(x, z, 'alder', { s: 0.95, space: 2.5 }); }
    }

    // ---- 3. scorched earth and shed scales (where the dragons came down to drink) -----------------
    {
      const scorches = [[-6, 27, 2.4], [27, 9, 2.1], [-22, -12, 2.6], [33, -28, 2.0], [-40, -4, 1.9], [18, 30, 1.7]];
      for (const [sx, sy, r] of scorches) {
        const [x, z] = at(sx, sy);
        if (inWater(x, z, r + 1.5)) continue;
        ctx.place(makeScorch(rng, pal, { r }), { x, z, y: 0, rotY: yaw() });
        ctx.footprint(x, z, r * 0.9, 0.18);
        ctx.reserve(x, z, r * 0.6);
        if (rng() < 0.7) { const a = yaw(); shard(x + Math.cos(a) * r * 0.4, z + Math.sin(a) * r * 0.4, 0.9 + rng() * 0.3); }
      }
      const sc = [[-4, 29.5], [24.5, 11.5], [-20, -15], [12, 34], [-30, 3.5], [36, -25], [-45, -2]];
      for (const [sx, sy] of sc) {
        const [x, z] = at(sx, sy);
        if (inWater(x, z, 0.8) || !ctx.free(x, z, 0.8, { pad: 0, center: 6 })) continue;
        { const st = rng() < 0.6; ctx.place(pick(scales), { x, z, y: st ? -0.3 : -0.05, rotY: yaw(), tiltX: (rng() - 0.5) * 0.3, tiltZ: st ? 0.85 + rng() * 0.35 : 0.15 + rng() * 0.2, s: 1.1 + rng() * 0.4 }); if (st) ctx.solid(x, z, 0.45); }
        ctx.reserve(x, z, 1.0); ctx.footprint(x, z, 1.3, 0.25);
      }
    }

    // ---- 4. fords: stepping stones and gravel bars ----------------------------------------------
    {
      const ford = (p0, p1, n) => {
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1), [x, z] = at(p0[0] + (p1[0] - p0[0]) * t + (rng() - 0.5) * 0.5, p0[1] + (p1[1] - p0[1]) * t + (rng() - 0.5) * 0.4);
          ctx.place(pick(slabs), { x, z, y: -0.2, rotY: yaw(), s: 0.5 + rng() * 0.12, tint: tint(0.08) });
          foamCircles.push([x, z, 0.62]);
        }
      };
      ford([0.6, 32.0], [-0.8, 40.4], 7);       // island -> far bank across braid A
      ford([-27.4, 3.0], [-27.0, 11.6], 7);     // meadow -> island across braid B
      const bar = (sx, sy, rx, rz, dirx, diry, peb = 1) => {
        const [cx, cz] = at(sx, sy);
        shoals.push({ cx, cz, rx, rz, rot: -rotScreen(dirx, diry) });
        ctx.place(makeShoal(rng, pal, { cx, cz, rx, rz, rot: -rotScreen(dirx, diry), heightFn: ctx.heightFn, waterY: WATER_Y, pebbles: peb }), { x: cx, z: cz, y: 0 });
        ctx.reserve(cx, cz, Math.min(rx, rz));
      };
      bar(8.2, 33.8, 3.4, 1.5, -0.35, -0.95);      // island head, splitting the current
      bar(-44.5, 12.6, 3.0, 1.3, -0.9, 0.3);        // island tail
      bar(-12.5, 7.6, 2.8, 1.1, -0.95, -0.3);       // inner bend of braid B
      bar(-33, 25.8, 2.6, 1.0, -0.85, -0.5);        // braid A, island side
      bar(18.5, 51, 3.2, 1.5, -0.3, -0.95);         // upstream channel
      bar(-60, 6.8, 3.6, 1.4, -1, -0.2);            // canyon gravel
      // driftwood stranded on the bars
      for (const [sx, sy, r] of [[8.6, 34.2, 0.5], [-44.8, 12.9, 2.4], [-12.8, 7.3, 0.3], [18.2, 51.3, 1.1]]) {
        const [x, z] = at(sx, sy);
        ctx.place(pick(drift), { x, z, y: Math.max(ctx.y(x, z), WATER_Y) - 0.2, rotY: r + yaw() * 0.15, tint: tint(0.08) });
        if (Math.hypot(x, z) < 56) { ctx.solid(x, z, 0.5); }
      }
    }

    // ---- 5. banks: cattails, irises, wet boulders, lilies in still water --------------------------
    const allCh = [ch.up, ch.a, ch.b, ch.down, ch.trib];
    for (const c of allCh) {
      const P = c.pts, half = c.w / 2;
      for (let i = 0; i < P.length - 1; i += 1) {
        const [x0, z0] = P[i], [x1, z1] = P[i + 1];
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        for (const sd of [-1, 1]) {
          const r0 = Math.hypot(x0, z0);
          const dens = r0 < 50 ? 0.32 : 0.55;
          if (rng() < dens) {
            const o = half + 0.6 + rng() * 1.2, x = x0 + nx * o * sd, z = z0 + nz * o * sd;
            if (!inWater(x, z, 0.2) && ctx.free(x, z, 0.4, { water: true, pad: 0, center: 8 })) { deco(pick(rng() < 0.25 ? irises : cattails), x, z, 0.8 + rng() * 0.45); ctx.reserve(x, z, 0.35); }
          }
          if (rng() < 0.1) {
            const o = half - 0.2 + rng() * 0.9, x = x0 + nx * o * sd, z = z0 + nz * o * sd;
            if (ctx.free(x, z, 0.5, { water: true, pad: 0.2, center: 8 })) {
              const s = 0.4 + rng() * 0.35;
              ctx.place(pick(wetRocks), { x, z, rotY: yaw(), s, tint: tint(0.08), y: Math.min(ctx.y(x, z), 0) });
              ctx.reserve(x, z, s * 1.1); if (inWater(x, z, -0.2)) foamCircles.push([x, z, s * 0.9]);
            }
          }
        }
      }
    }
    { // the drowned courtyard: lilies, a ring of broken columns, reeds
      const p = ctx.layout.ponds[ctx.layout.ponds.length - 1];
      for (let i = 0; i < 5; i++) { const a = rng() * 6.28, o = rng() * p.r * 0.7; ctx.place(pick(lilies), { x: p.x + Math.cos(a) * o, z: p.z + Math.sin(a) * o, y: WATER_Y + 0.01, rotY: yaw() }); }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3, o = p.r + 1.6, x = p.x + Math.cos(a) * o, z = p.z + Math.sin(a) * o;
        if (i % 3 === 2) { deco(pick(rubble), x, z, 0.9); continue; }
        ctx.place(pick(columns), { x, z, rotY: yaw(), s: 0.9 + rng() * 0.25 });
        ctx.reserve(x, z, 1.0); ctx.solid(x, z, 0.5); ctx.footprint(x, z, 1.2, 0.25);
      }
      for (let i = 0; i < 10; i++) {
        const a = rng() * 6.28, o = p.r + 0.4 + rng() * 0.7, x = p.x + Math.cos(a) * o, z = p.z + Math.sin(a) * o;
        if (ctx.free(x, z, 0.35, { water: true, pad: 0 })) { deco(pick(rng() < 0.4 ? irises : cattails), x, z, 0.75 + rng() * 0.35); ctx.reserve(x, z, 0.3); }
      }
      const [wx, wz] = [p.x + Math.cos(2.4) * (p.r + 3.2), p.z + Math.sin(2.4) * (p.r + 3.2)];
      if (ctx.free(wx, wz, 1.4)) tree(wx, wz, 'willow', { s: 0.95, space: 2.6 });
    }
    // lilies in the slack water of the plunge pools
    for (const [sx, sy, r] of POOLS) for (let i = 0; i < 3; i++) {
      const [px, pz] = at(sx, sy), a = rng() * 6.28, o = r * (0.55 + rng() * 0.35);
      ctx.place(pick(lilies), { x: px + Math.cos(a) * o, z: pz + Math.sin(a) * o, y: WATER_Y + 0.01, rotY: yaw() });
    }

    // ---- 6. trees inside the arena: willows by the water, few, on the far half ----------------------
    for (const [sx, sy, k, s] of [[-4, 43, 'willow', 1.05], [-23, 39, 'willow', 1.0], [-43, 29, 'poplar', 1.0], [-47, 33, 'poplar', 0.9],
      [30, 42, 'willow', 1.0], [36, 20, 'alder', 0.95], [-36, 0, 'willow', 0.9], [44, 2, 'birch', 1.0], [46.5, 5.5, 'birch', 0.85]]) {
      const [x, z] = at(sx, sy);
      if (!ctx.free(x, z, 1.4, { pad: 0.2 })) continue;
      tree(x, z, k, { s, space: 3 });
      if (rng() < 0.6) { const a = yaw(); deco(pick(ferns), x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5, 0.9 + rng() * 0.3); }
    }

    // ---- 7. the arena rim --------------------------------------------------------------------------
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * Math.PI * 2 + (rng() - 0.5) * 0.02;
      const ca = Math.cos(a), sa = Math.sin(a);
      const side = (ca + sa) * R2;
      if (side > 0.45) {   // camera side: low ledge of slate rocks, bushes, broken columns
        const r = 55.8 + rng() * 1.6, x = ca * r, z = sa * r;
        if (!ctx.free(x, z, 0.6)) continue;
        const k = rng();
        if (k < 0.42) rock(x, z, 0.7 + rng() * 0.6, { big: rng() < 0.3 });
        else if (k < 0.5) { ctx.place(pick(columns), { x, z, rotY: yaw(), s: 0.8 + rng() * 0.3 }); ctx.reserve(x, z, 0.9); ctx.solid(x, z, 0.5); }
        else deco(pick(rng() < 0.3 ? blossom : bushes), x, z, 0.9 + rng() * 0.5);
        continue;
      }
      if (rng() < 0.65) {
        const r = 54 + rng() * 2, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 0.7, { pad: 0.1 })) { deco(pick(rng() < 0.2 ? blossom : rng() < 0.1 ? blueBush : bushes), x, z, 0.9 + rng() * 0.6); ctx.reserve(x, z, 0.6); }
      }
      if (rng() < 0.25) {
        const r = 54.5 + rng() * 2, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 0.6, { pad: 0.1 })) deco(pick(ferns), x, z, 1 + rng() * 0.4);
      }
      const vista = side < -0.55;     // keep the far side open toward the cliffs and falls: slim trees only
      for (const row of [0, 1]) {
        if (vista && (row === 1 || rng() < 0.55)) continue;
        const r = 56.8 + row * 3.6 + rng() * 2.4, x = Math.cos(a + row * 0.02) * r, z = Math.sin(a + row * 0.02) * r;
        if (!ctx.free(x, z, 1.3, { pad: 0.6 })) continue;
        const k = rng();
        const kind = vista ? (k < 0.7 ? 'poplar' : 'birch') : (k < 0.4 ? 'willow' : k < 0.58 ? 'alder' : k < 0.86 ? 'poplar' : 'birch');
        tree(x, z, kind, { s: 0.95 + rng() * 0.4, space: 1.8 });
      }
    }

    // escarpment: slate outcrops break up the camera-side drop down to the valley
    for (let i = 0; i < 50; i++) {
      const a = rng() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      if ((ca + sa) * R2 < 0.35) continue;
      const r = 58 + rng() * 6, x = ca * r, z = sa * r;
      if (!ctx.free(x, z, 1.2, { pad: 0.2 })) continue;
      rock(x, z, 1.2 + rng() * 1.3, { big: true, solid: false, y: ctx.y(x, z) - 0.75 });
      if (rng() < 0.5) { const b = yaw(); deco(pick(rng() < 0.5 ? ferns : bushes), x + Math.cos(b) * 2, z + Math.sin(b) * 2, 1 + rng() * 0.4); }
    }

    // ---- 8. cliffs and waterfalls on the far side -----------------------------------------------------
    const fallsData = [], mistSrc = [];
    {
      // cliff wall: an arc of slate faces across the far side, set back behind the plunge pools
      const segs = [];
      for (let th = 32; th <= 148; th += 7.5 + rng() * 2) {
        const t = th * Math.PI / 180;
        let r = 68.5 + Math.sin(t * 3.1 + 1.3) * 2 + rng() * 1.5;
        // wrap around the plunge pools (the falls pour from the cliff face at their far rim)
        for (const [px, py, pr] of POOLS) {
          const pt = Math.atan2(py, px), pl = Math.hypot(px, py);
          if (Math.abs(pt - t) < (pr + 3) / pl) r = Math.max(r, pl + pr + 2.0);
        }
        segs.push([Math.cos(t) * r, Math.sin(t) * r, t]);
      }
      for (const [sx, sy, t] of segs) {
        const [x, z] = at(sx, sy);
        const geo = pick(cliffs);
        // face the arena (local +Z toward the centre)
        ctx.place(geo, { x, z, rotY: Math.atan2(-x, -z), s: 0.95 + rng() * 0.3, tint: tint(0.06) }, { far: true });
        ctx.reserve(x, z, 4.5);
        void t;
      }
      // a second, higher ridge behind (haze layers)
      for (let th = 38; th <= 142; th += 11 + rng() * 4) {
        const t = th * Math.PI / 180, r = 86 + rng() * 6, [x, z] = at(Math.cos(t) * r, Math.sin(t) * r);
        ctx.place(pick(ridges), { x, z, rotY: Math.atan2(-x, -z), s: 1.0 + rng() * 0.4, tint: tint(0.06) }, { far: true });
        ctx.reserve(x, z, 6);
      }
      // falls: from the cliff lip down into each pool
      for (const [sx, sy, w, hh] of FALLS) {
        const [x, z] = at(sx, sy);
        const [bx, bz] = at(sx * 1.06, sy * 1.06);
        const top = Math.max(ctx.y(bx, bz), 1.5) + hh;
        fallsData.push({ x, z, y0: WATER_Y - 0.1, y1: top, w, rotY: Math.atan2(-x, -z), lip: 0.9 });
        mistSrc.push({ x, y: 0, z, w: w * 1.2, h: 3.5, dx: -x / Math.hypot(x, z) * 0.5, dz: -z / Math.hypot(x, z) * 0.5 });
        whiteSpots.push([x, z, w * 0.9 + 2.5, 1]);
        for (let i = 0; i < 4; i++) { const a = yaw(), r = w * 0.6 + 1 + rng() * 1.5; rock(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.6 + rng() * 0.5, { wet: true, solid: false, y: WATER_Y - 0.25 }); }
      }
      // drowned arches standing in the main plunge pool
      { const [x, z] = at(16.5, 61.5); ctx.place(makeRuinArch(rng, pal, { span: 3.4, height: 2.8, broken: 0.5 }), { x, z, y: -0.9, rotY: rotScreen(1, 0.2) }); foamCircles.push([x + 1.4, z - 1.4, 0.6], [x - 1.4, z + 1.4, 0.6]); }
    }

    // canyon walls: where a channel or pool cuts into the hills outside the arena, face the cut with slate
    {
      const walls = V(3, () => makeCliff(rng, pal, { w: 6, h: 4.5, d: 1.6, caps: false, tilt: 0.3, even: true }));
      const wallAt = (x, z, nx, nz) => {      // (nx, nz) = unit vector from the wall toward the water
        if (Math.hypot(x, z) < 58) return;
        const top = Math.max(ctx.y(x - nx * 2.2, z - nz * 2.2), ctx.y(x - nx * 3.2, z - nz * 3.2));
        if (top < 1.0) return;
        ctx.place(pick(walls), { x, z, y: -0.35, rotY: Math.atan2(nx, nz), s: 1, sx: 0.85 + rng() * 0.3, sy: Math.min(1.5, (top + 0.7) / 3.3), tint: tint(0.06) }, { far: true });
        ctx.reserve(x, z, 1.8);
      };
      for (const c of [ch.down, ch.up, ch.trib]) {
        const P = c.pts;
        for (let i = 1; i < P.length - 1; i += 3) {
          const [x0, z0] = P[i], [x1, z1] = P[i + 1];
          const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          for (const sd of [-1, 1]) { const o = c.w / 2 + 0.2 + rng() * 0.4; wallAt(x0 + nx * o * sd, z0 + nz * o * sd, -nx * sd, -nz * sd); }
        }
      }
      for (const p of ctx.layout.ponds.slice(0, POOLS.length)) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + rng() * 0.15, o = p.r + 0.3, x = p.x + Math.cos(a) * o, z = p.z + Math.sin(a) * o;
          wallAt(x, z, -Math.cos(a), -Math.sin(a));
        }
      }
    }

    // ---- 9. the canyon: a drowned arcade standing in the deep water where the river leaves ------------------
    for (const [sx, sy, br, h] of [[-61, 12.2, 0.85, 2.6], [-68, 9.6, 0.1, 3.0], [-75, 7.4, 0.45, 2.8], [-86, 4.5, 0.3, 2.6]]) {
      const [x, z] = at(sx, sy);
      ctx.place(makeRuinArch(rng, pal, { span: 3.4, height: h, broken: br }), { x, z, y: -0.9, rotY: FACE_CAM }, { far: true });
      foamCircles.push([x + 1.7 * R2, z - 1.7 * R2, 0.55], [x - 1.7 * R2, z + 1.7 * R2, 0.55]);
      ctx.reserve(x, z, 3);
    }

    // ---- 10. the world beyond: groves on the slopes, the misty valley on the camera side --------------------
    ctx.tryPlace(2400, ctx.ring(62, 128), 2.0, (x, z) => {
      const r = Math.hypot(x, z), side = ctx.side(x, z);
      if (side < -0.35 && r > 66 && r < 98) return;     // cliffs own the far side
      if (r > 86) {
        if (rng() < 0.15) return;
        ctx.place(pick(canopies), { x, z, rotY: yaw(), s: 1.0 + rng() * 0.5, tint: tint(0.16) }, { far: true });
        ctx.reserve(x, z, 2.6);
        return;
      }
      if (side > 0.5 && r < 66) return;                 // keep the ledge open
      if (side > 0.25 && ctx.y(x, z) < VALLEY_Y + 0.3) {  // valley lakes: reeds at the shore only
        if (ctx.y(x, z) > VALLEY_Y - 0.25 && rng() < 0.5) deco(pick(cattails), x, z, 1 + rng() * 0.4);
        return;
      }
      const k = rng();
      const kind = side > 0.4 ? (k < 0.5 ? 'willow' : k < 0.8 ? 'alder' : 'poplar') : (k < 0.3 ? 'willow' : k < 0.6 ? 'alder' : k < 0.85 ? 'poplar' : 'birch');
      tree(x, z, kind, { s: 1.0 + rng() * 0.45, space: 2.2 });
      if (rng() < 0.3) { const a = yaw(); deco(pick(bushes), x + Math.cos(a) * 2, z + Math.sin(a) * 2, 1 + rng() * 0.5); }
    }, { pad: 0.3 });
    ctx.tryPlace(60, ctx.ring(60, 100), 2, (x, z) => { if (ctx.side(x, z) < 0.3) rock(x, z, 1.3 + rng() * 1.1, { solid: false, big: true, y: ctx.y(x, z) - 0.5 }); });

    // ---- 11. playfield dressing ---------------------------------------------------------------------------
    const field = ctx.ring(9, 52);
    ctx.tryPlace(22, field, 1.2, (x, z) => { rock(x, z, 0.45 + rng() * 0.55); if (rng() < 0.35) { const a = yaw(); deco(pick(ferns), x + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1, 0.8); } });
    let nCol = 0;
    ctx.tryPlace(40, ctx.ring(14, 50), 1.2, (x, z) => {
      if (nCol >= 4) return;
      ctx.place(pick(columns), { x, z, rotY: yaw(), s: 0.85 + rng() * 0.3, tint: tint(0.06) });
      ctx.reserve(x, z, 1.1); ctx.solid(x, z, 0.48); ctx.footprint(x, z, 1.2, 0.25); nCol++;
    });
    ctx.tryPlace(14, field, 0.9, (x, z) => { deco(pick(rubble), x, z, 0.8 + rng() * 0.4); ctx.reserve(x, z, 0.8); });
    ctx.tryPlace(110, field, 0.8, (x, z) => { const k = rng(); deco(pick(k < 0.25 ? blossom : k < 0.35 ? blueBush : bushes), x, z, 0.75 + rng() * 0.5); ctx.reserve(x, z, 0.5); });
    ctx.tryPlace(70, ctx.ring(8, 54), 0.5, (x, z) => { deco(pick(ferns), x, z, 0.8 + rng() * 0.4); ctx.reserve(x, z, 0.3); });
    ctx.tryPlace(60, ctx.ring(8, 54), 0.5, (x, z) => { if (ctx.mask.sample(x, z).waterD > -4) { deco(pick(cattails), x, z, 0.7 + rng() * 0.4); ctx.reserve(x, z, 0.3); } });

    // ---- 12. live objects: water sheet, falls, mist, shards, dragonflies, rain ----------------------------------
    buildWater(ctx, ch, { foamCircles, shoals, whiteSpots });
    {
      const L = 40;
      const geo = buildFalls(fallsData, L);
      const mat = createWaterMaterial({ shallow: 0x8ccfcf, foam: 0xeef8f6, deep: 0x2a7c96 }, { waterfall: true, length: L });
      const m = new THREE.Mesh(geo, mat);
      m.name = 'env.falls'; m.matrixAutoUpdate = false; m.receiveShadow = true;
      m.userData.dispose = () => { geo.dispose(); mat.dispose(); };
      ctx.add(m);
    }
    ctx.add(createMist(mistSrc, { count: 40, opacity: 0.16, size: 1.9 }));
    {
      const mat = createShardMaterial(0xe6f4ff);
      const g = new THREE.Group(); g.name = 'env.shards';
      const parts = shardBatch.build(mat, { castShadow: false, name: 'env.shards' });
      const geo = mergeGeometries(parts.map((m) => m.geometry));      // one draw for every shard
      parts.forEach((m) => m.geometry.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'env.shards'; mesh.matrixAutoUpdate = false; mesh.receiveShadow = true;
      g.add(mesh);
      g.userData.dispose = () => { geo.dispose(); mat.dispose(); };
      ctx.add(g, (dt, t) => { mat.userData.uPulse.value = 0.12 * Math.sin(t * 0.9) * Math.sin(t * 0.37); });
    }
    { // dragonflies patrol the water inside and around the arena
      const anchors = [];
      for (const c of [ch.a, ch.b, ch.up, ch.trib]) for (let i = 0; i < c.pts.length; i += 6) {
        const [x, z] = c.pts[i];
        if (Math.hypot(x, z) < 70 && rng() < 0.75) anchors.push([x + (rng() - 0.5) * c.w, z + (rng() - 0.5) * c.w]);
      }
      const pond = ctx.layout.ponds[ctx.layout.ponds.length - 1];
      anchors.push([pond.x, pond.z], [pond.x + 1.5, pond.z - 1]);
      ctx.add(createDragonflies(anchors, { size: 0.95 }));
    }
    { // passing showers
      const rain = createRain({ count: 800, window: 70, opacity: 0.2 });
      const u = rain.userData.uniforms;
      ctx.add(rain, (dt, t) => { u.uRain.value = smooth(0.48, 0.72, fbm(t * 0.012, 3.7, 2)); });
    }
  },
};

// ---------- the water sheet: braids + pools (river level) and valley lakes (camera side) ----------
function buildWater(ctx, ch, { foamCircles, shoals, whiteSpots }) {
  const chans = [ch.up, ch.b, ch.a, ch.trib, ch.down].map((c) => prepChannel(c));
  const [up, b, a, trib, down] = chans;
  // flow coordinate continuity: B is the trunk; A is stretched to meet B at both ends; the tributary ends on A
  up.s0 = 0; b.s0 = up.len; b.k = 1;
  a.s0 = up.len; a.k = b.len / a.len;
  down.s0 = up.len + b.len;
  { const j = project(a, trib.pts[trib.pts.length - 1][0], trib.pts[trib.pts.length - 1][1]); trib.k = 1; trib.s0 = a.s0 + j.s * a.k - trib.len; }
  const pools = ctx.layout.ponds.map((p) => p);
  const confl = [a.pts[a.pts.length - 1], trib.pts[trib.pts.length - 1], up.pts[up.pts.length - 1]];
  const field = (x, z) => {
    let bank = -99, sW = 0, sS = 0;
    for (const c of chans) {
      if (x < c.minX - 8 || x > c.maxX + 8 || z < c.minZ - 8 || z > c.maxZ + 8) continue;
      const pr = project(c, x, z);
      const bc = c.w / 2 - pr.d;
      if (bc > bank) bank = bc;
      const w = smooth(-2.5, 1.5, bc) + 1e-4;
      sW += w; sS += w * (c.s0 + pr.s * (c.k ?? 1));
    }
    for (const p of pools) { const bp = p.r - Math.hypot(x - p.x, z - p.z); if (bp > bank) bank = bp; }
    if (bank < -3) return { bank, flow: 0, depth: 0, white: 0, sparkle: 0 };
    let land = 99;
    for (const [cx, cz, r] of foamCircles) { const d = Math.hypot(x - cx, z - cz) - r; if (d < land) land = d; }
    for (const s of shoals) {
      const dx = x - s.cx, dz = z - s.cz, c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const e = Math.hypot(lx / s.rx, lz / s.rz);
      const d = (e - 0.95) * Math.min(s.rx, s.rz);
      if (d < land) land = d;
    }
    const r = Math.hypot(x, z);
    let white = 0;
    for (const [cx, cz, rr, st] of whiteSpots) white = Math.max(white, (1 - smooth(rr * 0.3, rr, Math.hypot(x - cx, z - cz))) * st);
    for (const [cx, cz] of confl) white = Math.max(white, (1 - smooth(1.0, 4.0, Math.hypot(x - cx, z - cz))) * 0.45);
    white = Math.max(white, (1 - smooth(0.0, 0.9, land)) * 0.35 * smooth(-0.2, 0.6, bank));
    const deepK = 0.38 + 0.62 * smooth(48, 62, r);
    const depth = smooth(0.4, 4.6, bank) * deepK * 0.85;
    return { bank, land, flow: sW > 0 ? sS / sW : 0, depth, white, sparkle: 0.25 + 0.4 * smooth(46, 62, r) };
  };
  // bbox of all water
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const c of chans) { x0 = Math.min(x0, c.minX - c.w); z0 = Math.min(z0, c.minZ - c.w); x1 = Math.max(x1, c.maxX + c.w); z1 = Math.max(z1, c.maxZ + c.w); }
  for (const p of pools) { x0 = Math.min(x0, p.x - p.r - 2); z0 = Math.min(z0, p.z - p.r - 2); x1 = Math.max(x1, p.x + p.r + 2); z1 = Math.max(z1, p.z + p.r + 2); }
  x0 = Math.max(x0, -129); z0 = Math.max(z0, -129); x1 = Math.min(x1, 129); z1 = Math.min(z1, 129);
  const g1 = buildWaterSheet({ x0, z0, x1, z1, cell: 0.85, y: WATER_Y, keep: 1.4, field });

  // valley lakes: a flat sheet at VALLEY_Y wherever the camera-side valley dips below it
  const hf = ctx.heightFn;
  const lake = (x, z) => {
    const r = Math.hypot(x, z);
    if (r < 62 || sideOf(x, z) < 0.25) return { bank: -9, flow: 0, depth: 0, white: 0, sparkle: 0 };
    const d = VALLEY_Y - hf(x, z);
    return { bank: d * 3.2, flow: (x - z) * 0.7, depth: smooth(0.1, 1.6, d) * 0.8, white: 0, sparkle: 0.3 };
  };
  const g2 = buildWaterSheet({ x0: -20, z0: -20, x1: 129, z1: 129, cell: 1.25, y: VALLEY_Y, keep: 1.0, field: lake });
  const geo = mergeIndexed([g1, g2]);
  g1.dispose(); g2.dispose();
  const mat = createRiverWaterMaterial({ deep: 0x1d6a8c, shallow: 0x3c9f9e, foam: 0xcfe5e2 }, { speed: 0.95, sparkle: 0.85, foamWidth: 0.15 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env.water';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  ctx.add(mesh);
}

function mergeIndexed(geos) {
  const names = ['position', 'normal', 'uv', 'aAux'];
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const out = new THREE.BufferGeometry(), idx = new Uint32Array(ni);
  for (const n of names) {
    const sz = geos[0].attributes[n].itemSize, arr = new Float32Array(nv * sz);
    let o = 0; for (const g of geos) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, sz));
  }
  let vo = 0, io = 0;
  for (const g of geos) { const src = g.index.array; for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo; vo += g.attributes.position.count; }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function prepChannel(c) {
  const pts = c.pts, n = pts.length, cum = new Float64Array(n);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    minX = Math.min(minX, pts[i][0]); maxX = Math.max(maxX, pts[i][0]); minZ = Math.min(minZ, pts[i][1]); maxZ = Math.max(maxZ, pts[i][1]);
  }
  return { pts, w: c.w, cum, len: cum[n - 1], minX, minZ, maxX, maxZ, s0: 0, k: 1 };
}
const _pr = { d: 0, s: 0 };
function project(c, x, z) {
  const P = c.pts;
  let best = Infinity, bs = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; bs = c.cum[i] + t * Math.sqrt(l2); }
  }
  _pr.d = Math.sqrt(best); _pr.s = bs;
  return _pr;
}
