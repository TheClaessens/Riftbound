import * as THREE from 'three';
import { fromScreen, smoothPolyline } from '../common.js';
import {
  makeBroadleaf, makePine, makeBirch, makeCanopy, makeBush, makeFern, makeRock, makeStump, makeLog,
  makeMushrooms, makeReeds, makeLilies, makeTent, makePalisade, makeTotem, makeCampfire, makeTrophy,
  makeCrates, makeBanner,
} from '../props.js';

// =====================================================================================
//  Act I — The Thornwood. A sunlit woodland glade: layered greens, wind-swept grass with
//  white / butter / periwinkle / lavender flowers (never red or pink), a dirt trail that
//  leads up to a goblin camp on the far edge, a stream with stepping stones, mossy rocks,
//  ferns, fallen logs, a dense tree line that hides the arena edge and a forest that keeps
//  going into the haze. Layout is authored in SCREEN space (S(right, up) metres from the
//  centre of the title view) so the composition reads the same on every run.
// =====================================================================================

const S = (sx, sy) => fromScreen(sx, sy);
const SP = (pts) => pts.map(([a, b]) => S(a, b));

const PAL = {
  trunk: 0x5a3f2c, trunkTop: 0x7a5a40, cut: 0xc9a777,
  leafDark: 0x2c6a2e, leafLight: 0x74c04c,
  pineDark: 0x1f4f38, pineLight: 0x3f8a52,
  birchBark: 0xdcd6c6, birchLeafDark: 0x7fb043, birchLeafLight: 0xc0dc6c,
  bushDark: 0x2f6a2c, bushLight: 0x6aae42,
  fernDark: 0x2e6a2a, fernLight: 0x7cc050,
  rock: 0x9a958a, rockDark: 0x5e5a54, moss: 0x5f9a3c,
  stem: 0xe4dac0, cap: 0xd2a35c, capDark: 0x9a7040,
  reedRoot: 0x3f7030, reedTip: 0xa8b860,
  lily: 0x6aa840, lilyDark: 0x3c7a2c,
  hide: 0xa58660, hideDark: 0x6a5038, pole: 0x5c4030, poleTop: 0x86664a,
  paint: 0xd6a03c, paint2: 0x3d8a7c, bone: 0xcfc5ae, stone: 0x8e8a80, stoneDark: 0x5a5650, rope: 0x8a7450,
};

export const forest = {
  id: 'forest', name: 'The Thornwood', seed: 1337,
  palette: PAL,
  atmos: {
    background: 0xb5d6b8, hemiSky: 0xcfe4ff, hemiGround: 0x5f7034, hemiIntensity: 1.2,
    moon: 0xfff0d6, moonIntensity: 3.15,
    grade: { tint: [1.0, 1.0, 0.97], saturation: 1.0, contrast: 1.05, vignette: 0.18 },
  },
  env: { haze: 0xb5d6b8, saturation: 0.88, dapple: 0.4, cloudCover: 0.56, cloudDark: 0.66, cloudScale: 0.016, cloudSpeed: [2.0, 1.2], wind: 0.6, windDir: [0.8, 0.6], edgeHaze: [66, 118], edgeHazeMax: 0.45 },
  rim: [0xfff0d8, 0.35],
  terrain: { flatR: 56, ramp: 11, farRise: 5.5, nearDrop: -6, noiseAmp: 3, depth: 0.55 },

  layout() {
    const stream = { width: 4.6, points: smoothPolyline(SP([[-100, 30], [-62, 20], [-38, 11], [-17, 15], [3, 19], [22, 14], [40, 23], [60, 40], [100, 64]]), 2) };
    const trail = { width: 3.4, points: smoothPolyline(SP([[-90, -58], [-50, -32], [-25, -17], [-7, -7], [9, 2], [22, 13], [28, 28], [30, 40], [26, 47]]), 2) };
    const branch = { width: 2.6, points: smoothPolyline(SP([[-7, -7], [12, -13], [32, -24], [56, -32], [95, -42]]), 2) };
    return { paths: [trail, branch], rivers: [stream], ponds: [{ ...{ x: S(-30, -27)[0], z: S(-30, -27)[1] }, r: 3.6 }] };
  },

  ground: {
    groundA: 0x44803a, groundB: 0x5c9440, groundDark: 0x2c5e2e, groundDry: 0x8a9a48,
    path: 0xa08660, pathEdge: 0x7e8c45, bank: 0x5e5236, slope: 0x6f6a5c, soil: 0x5f4e34,
    speck: 0x86a050, speckAmt: 0.3, pebbles: 0.55,
  },
  grass: {
    count: 64000, height: 0.44, width: 0.14, density: 1.0, patchLo: 0.16, clump: [5, 11], clumpRadius: 0.32,
    colors: { root: 0x24522a, tipA: 0x5e9c40, tipB: 0x98b852 },
  },
  flowers: {
    count: 6000, height: 0.36, width: 0.15, density: 1.0, patchLo: 0.1, clump: [3, 7], clumpRadius: 0.5,
    colors: { petals: [0xe8e4d0, 0xf6d050, 0x7c9cf0, 0xa0a6f4] },
  },
  water: { deep: 0x1d6684, shallow: 0x3c9c9a, foam: 0xaed0c8, speed: 0.9, sparkle: 0.7, foamWidth: 0.16, level: -0.08 },
  motes: [
    { kind: 'dot', count: 380, colors: [0xfff0a8, 0xffe7c0], size: 0.17, height: 4.5, rise: 0.12, drift: [0.35, 0.1], additive: true, intensity: 0.9 },
    { kind: 'butterfly', count: 20, colors: [0xf2eccc, 0xf4d454], size: 0.5, height: 1.6, rise: 0.0, drift: [0.15, 0.05], opacity: 1 },
    { kind: 'leaf', count: 80, colors: [0x7cb446, 0xb8c454], size: 0.4, height: 7, fall: 0.6, drift: [0.6, -0.2], opacity: 0.95 },
  ],

  props(ctx) {
    const { rng } = ctx;
    const pal = PAL;
    const V = (n, fn) => Array.from({ length: n }, () => fn());
    const oaks = V(4, () => makeBroadleaf(rng, pal));
    const bigOaks = V(2, () => makeBroadleaf(rng, pal, { size: 1.3 }));
    const pines = V(3, () => makePine(rng, pal));
    const birches = V(2, () => makeBirch(rng, pal));
    const canopies = V(3, () => makeCanopy(rng, pal));
    const bushes = V(3, () => makeBush(rng, pal));
    const blossom = V(2, () => makeBush(rng, pal, { dots: [0xece6d2, 0xf2d060], dotChance: 0.16 }));
    const ferns = V(3, () => makeFern(rng, pal));
    const rocks = V(3, () => makeRock(rng, pal));
    const bigRocks = V(2, () => makeRock(rng, pal, { size: 1.6, mossAmt: 0.45 }));
    const slabs = V(2, () => makeRock(rng, pal, { flat: true, mossAmt: 0.5 }));
    const stumps = V(2, () => makeStump(rng, pal));
    const logs = V(2, () => makeLog(rng, pal, { length: 3.2 + rng() * 1.2 }));
    const shrooms = V(2, () => makeMushrooms(rng, pal));
    const reeds = V(2, () => makeReeds(rng, pal));
    const lilies = V(2, () => makeLilies(rng, pal));
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const tint = (amt = 0.1) => [1 + (rng() - 0.5) * amt, 1 + (rng() - 0.5) * amt * 0.8, 1 + (rng() - 0.5) * amt];
    const yaw = () => rng() * Math.PI * 2;

    // ---- helpers -------------------------------------------------------------------
    const tree = (x, z, kind, o = {}) => {
      const geo = kind === 'pine' ? pick(pines) : kind === 'birch' ? pick(birches) : kind === 'big' ? pick(bigOaks) : pick(oaks);
      const s = o.s ?? (0.9 + rng() * 0.35);
      const trunkR = (kind === 'pine' ? 0.28 : kind === 'birch' ? 0.2 : kind === 'big' ? 0.55 : 0.4) * s;
      ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.14), tiltX: (rng() - 0.5) * 0.06, tiltZ: (rng() - 0.5) * 0.06 }, { far: o.far });
      ctx.reserve(x, z, o.space ?? trunkR + 0.8);
      if (!o.far) { ctx.solid(x, z, trunkR); ctx.footprint(x, z, trunkR + 1.0, 0.35); }
    };
    // s = instance scale; small variant ≈ 1.1 m radius at s = 1, big variant ≈ 1.8 m.
    const rock = (x, z, s, o = {}) => {
      const big = o.big ?? s > 1.3;
      const geo = o.geo ?? pick(big ? bigRocks : rocks);
      const sc = big ? s / 1.6 : s, R = (big ? 1.8 : 1.1) * sc;
      ctx.place(geo, { x, z, rotY: yaw(), s: sc, tint: tint(0.08), shade: 0.95 + rng() * 0.1 }, { far: o.far });
      ctx.reserve(x, z, R);
      if (o.solid !== false && !o.far) ctx.solid(x, z, R * 0.78);
      ctx.footprint(x, z, R + 0.3, 0.3);
    };
    const deco = (geo, x, z, s = 1, o = {}) => { ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.12), ...o }); };

    // ---- 1. hero composition around the title view -----------------------------------
    { // big old oak up-left of centre, across the stream bank
      const [x, z] = S(-17, 9); tree(x, z, 'big', { s: 1.1 });
      const [x2, z2] = S(-20, 6.5); deco(pick(ferns), x2, z2, 1.2);
      const [x3, z3] = S(-14, 7.5); deco(pick(shrooms), x3, z3, 1.1);
      const [x4, z4] = S(-26, 24); tree(x4, z4, 'pine', { s: 1.1 }); const [x5, z5] = S(-30, 21); tree(x5, z5, 'pine', { s: 0.9 });
    }
    { const [x, z] = S(-14, -2); rock(x, z, 1.0); const [a, b] = S(-12.5, -3.4); deco(pick(ferns), a, b, 1.0); }
    { const [x, z] = S(13, -8); ctx.place(stumps[0], { x, z, rotY: 0.6, s: 1.2 }); ctx.reserve(x, z, 0.6); ctx.solid(x, z, 0.45); ctx.footprint(x, z, 1.1, 0.3);
      const [a, b] = S(14.2, -7); deco(shrooms[0], a, b, 0.9); }
    { const [x, z] = S(-18, -14); ctx.place(logs[0], { x, z, rotY: 0.5, s: 1 }); const L = 1.7;
      for (const k of [-1, 0, 1]) { const px = x + Math.cos(0.5) * L * 0.6 * k, pz = z - Math.sin(0.5) * L * 0.6 * k; ctx.solid(px, pz, 0.4); ctx.reserve(px, pz, 0.5); ctx.footprint(px, pz, 0.8, 0.4); } }
    { const [x, z] = S(18, 8); deco(pick(blossom), x, z, 1.15); ctx.reserve(x, z, 0.9); }
    { const [x, z] = S(-24, 1); deco(pick(bushes), x, z, 1.1); ctx.reserve(x, z, 0.9); }
    { const [x, z] = S(8, -18); rock(x, z, 0.7); }
    { const [x, z] = S(18, -10); tree(x, z, 'birch', { s: 1.05 }); const [a, b] = S(19.8, -8.6); tree(a, b, 'birch', { s: 0.85 }); }

    // stepping stones where the trail crosses the stream
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) / 2;
      const [x, z] = S(22 + t * 1.1, 13.2 + t * 2.2);
      ctx.place(pick(slabs), { x, z, y: -0.18, rotY: yaw(), s: 0.55 + rng() * 0.1 });
    }

    // ---- 2. goblin camp on the far edge (up the trail) ----------------------------------
    {
      const tents = [[16.5, 47.5, 1.3], [28.5, 46.5, 1.15]];
      for (const [sx, sy, s] of tents) {
        const [x, z] = S(sx, sy);
        ctx.place(makeTent(rng, pal, { size: s }), { x, z, rotY: Math.atan2(S(22.5, 41.5)[0] - x, S(22.5, 41.5)[1] - z), s: 1 });
        ctx.reserve(x, z, 1.7 * s); ctx.solid(x, z, 1.3 * s); ctx.footprint(x, z, 1.8 * s, 0.1);
      }
      const [fx, fz] = S(22.5, 41.5);
      ctx.place(makeCampfire(rng, pal), { x: fx, z: fz, rotY: 0 });
      ctx.reserve(fx, fz, 1.2); ctx.solid(fx, fz, 0.75); ctx.footprint(fx, fz, 1.8, 0.0);
      ctx.add(makeFlame(fx, fz), flameUpdate);
      const [tx, tz] = S(13, 43); ctx.place(makeTotem(rng, pal), { x: tx, z: tz, rotY: Math.atan2(-tx, -tz) });
      ctx.reserve(tx, tz, 0.5); ctx.solid(tx, tz, 0.3); ctx.footprint(tx, tz, 0.8, 0.2);
      const [bx, bz] = S(33, 43); ctx.place(makeBanner(rng, pal, { color: pal.paint2 }), { x: bx, z: bz, rotY: Math.PI * 0.25 });
      ctx.reserve(bx, bz, 0.3); ctx.solid(bx, bz, 0.15);
      const [b2x, b2z] = S(10.5, 47); ctx.place(makeBanner(rng, pal, { color: pal.paint }), { x: b2x, z: b2z, rotY: Math.PI * 0.2 });
      ctx.reserve(b2x, b2z, 0.3); ctx.solid(b2x, b2z, 0.15);
      const [cx, cz] = S(23, 49.5); ctx.place(makeCrates(rng, pal), { x: cx, z: cz, rotY: 0.4 }); ctx.reserve(cx, cz, 1.0); ctx.solid(cx, cz, 0.8);
      for (const [sx, sy] of [[8, 39], [36, 39]]) {
        const [x, z] = S(sx, sy); ctx.place(makeTrophy(rng, pal), { x, z, rotY: Math.atan2(-x, -z) }); ctx.reserve(x, z, 0.3); ctx.solid(x, z, 0.12);
      }
      // palisade arc behind the camp, on the arena rim
      const a0 = Math.atan2(S(-6, 50)[1], S(-6, 50)[0]), a1 = Math.atan2(S(52, 36)[1], S(52, 36)[0]);
      let da = a1 - a0; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      const segs = 9;
      for (let i = 0; i < segs; i++) {
        const a = a0 + da * (i + 0.5) / segs, r = 56.6 + Math.sin(i * 1.7) * 0.4;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        ctx.place(makePalisade(rng, pal, { length: Math.abs(da) * r / segs + 0.2 }), { x, z, rotY: -a - Math.PI / 2 });
        ctx.reserve(x, z, 1.2);
      }
    }

    // ---- 3. stream dressing ---------------------------------------------------------------
    const stream = ctx.layout.rivers[0].points;
    for (let i = 0; i < stream.length - 1; i += 1) {
      const [x0, z0] = stream[i], [x1, z1] = stream[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (const side of [-1, 1]) {
        if (rng() < 0.55) { const o = 2.5 + rng() * 1.2; deco(pick(reeds), x0 + nx * o * side, z0 + nz * o * side, 0.8 + rng() * 0.5); }
        if (rng() < 0.18) { const o = 2.6 + rng() * 0.8; const x = x0 + nx * o * side, z = z0 + nz * o * side; ctx.place(pick(rocks), { x, z, rotY: yaw(), s: 0.35 + rng() * 0.3, tint: tint(0.08) }); }
      }
      if (rng() < 0.12) { const o = (rng() - 0.5) * 2; ctx.place(pick(lilies), { x: x0 + nx * o, z: z0 + nz * o, y: -0.06, rotY: yaw(), s: 0.9 }); }
    }
    { // pond dressing
      const p = ctx.layout.ponds[0];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + rng() * 0.3, o = p.r + 0.6 + rng() * 0.8;
        if (rng() < 0.6) deco(pick(reeds), p.x + Math.cos(a) * o, p.z + Math.sin(a) * o, 0.8 + rng() * 0.4);
        else ctx.place(pick(rocks), { x: p.x + Math.cos(a) * o, z: p.z + Math.sin(a) * o, rotY: yaw(), s: 0.35 + rng() * 0.35, tint: tint(0.08) });
      }
      for (let i = 0; i < 3; i++) { const a = rng() * 6.28, o = rng() * p.r * 0.6; ctx.place(pick(lilies), { x: p.x + Math.cos(a) * o, z: p.z + Math.sin(a) * o, y: -0.07, rotY: yaw() }); }
      ctx.reserve(p.x, p.z, p.r + 1.5);
    }

    // ---- 4. in-arena trees (few, mostly on the far half: tall things never stand in front of the action) ----
    let nTrees = 0;
    ctx.tryPlace(400, ctx.ring(20, 50), 2.2, (x, z) => {
      if (nTrees >= 9) return;
      const side = ctx.side(x, z);
      if (side > 0.25 && rng() < 0.85) return;      // near (camera) half: rare
      if (ctx.mask.sample(x, z).path > 0.05) return;
      const k = rng();
      tree(x, z, k < 0.5 ? 'oak' : k < 0.78 ? 'pine' : 'birch', { space: 4.5 }); nTrees++;
      if (rng() < 0.7) { const a = yaw(); deco(pick(ferns), x + Math.cos(a) * 1.4, z + Math.sin(a) * 1.4, 0.9 + rng() * 0.3); }
      if (rng() < 0.4) { const a = yaw(); deco(pick(shrooms), x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, 0.8 + rng() * 0.4); }
    });

    // ---- 5. the tree line (arena rim) -------------------------------------------------------
    for (let i = 0; i < 150; i++) {
      const a = (i / 150) * Math.PI * 2 + (rng() - 0.5) * 0.02;
      const ca = Math.cos(a), sa = Math.sin(a);
      const side = (ca + sa) * Math.SQRT1_2;
      if (side > 0.45) {   // camera side: low ledge of rocks and bushes; trees stand far down the drop
        const r = 55.8 + rng() * 1.6, x = ca * r, z = sa * r;
        if (!ctx.free(x, z, 0.6, { water: false })) continue;
        if (rng() < 0.45) rock(x, z, 0.7 + rng() * 0.6, { big: rng() < 0.3 });
        else deco(pick(rng() < 0.3 ? blossom : bushes), x, z, 0.9 + rng() * 0.5);
        continue;
      }
      // rim bushes just inside the edge
      if (rng() < 0.7) {
        const r = 54 + rng() * 2, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 0.7, { pad: 0.1 })) { deco(pick(rng() < 0.25 ? blossom : bushes), x, z, 0.9 + rng() * 0.6); ctx.reserve(x, z, 0.6); }
      }
      if (rng() < 0.3) {
        const r = 54.5 + rng() * 2, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 0.6, { pad: 0.1 })) { deco(pick(ferns), x, z, 1 + rng() * 0.4); }
      }
      // trunks at 56.5..62 (two staggered rows)
      for (const row of [0, 1]) {
        const r = 56.6 + row * 3.4 + rng() * 2.4, x = Math.cos(a + row * 0.02) * r, z = Math.sin(a + row * 0.02) * r;
        if (!ctx.free(x, z, 1.2, { pad: 0.6 })) continue;
        const k = rng();
        tree(x, z, k < 0.45 ? 'oak' : k < 0.8 ? 'pine' : k < 0.92 ? 'big' : 'birch', { s: 0.95 + rng() * 0.45, space: 1.6 });
      }
    }

    // ---- 6. the forest beyond (hills on the far side, valley canopy on the near side) ----------
    ctx.tryPlace(2600, ctx.ring(61, 128), 1.9, (x, z) => {
      const r = Math.hypot(x, z), side = ctx.side(x, z);
      if (r > 84) {
        if (rng() < 0.12) return;
        ctx.place(pick(canopies), { x, z, rotY: yaw(), s: 1.0 + rng() * 0.5, tint: tint(0.16) }, { far: true });
        ctx.reserve(x, z, 2.6);
        return;
      }
      if (side > 0.5 && r < 64) return;              // keep the ledge open
      const k = rng();
      tree(x, z, k < 0.45 ? 'oak' : k < 0.85 ? 'pine' : 'birch', { s: 1.0 + rng() * 0.5, space: 2.0 });
      if (rng() < 0.35) { const a = yaw(); deco(pick(bushes), x + Math.cos(a) * 2, z + Math.sin(a) * 2, 1 + rng() * 0.5); }
    }, { pad: 0.3 });
    // rocky outcrops on the far hills
    ctx.tryPlace(70, ctx.ring(60, 95), 2, (x, z) => { if (ctx.side(x, z) < 0.2) rock(x, z, 1.6 + rng() * 1.8, { solid: false, big: true }); });

    // ---- 7. playfield dressing: rocks, stumps, logs, bushes, ferns, mushrooms -----------------
    const field = ctx.ring(9, 52);
    ctx.tryPlace(34, field, 1.2, (x, z) => { rock(x, z, 0.5 + rng() * 0.6); });
    ctx.tryPlace(14, field, 0.9, (x, z) => {
      ctx.place(pick(stumps), { x, z, rotY: yaw(), s: 0.9 + rng() * 0.4, tint: tint(0.1) }); ctx.reserve(x, z, 0.6); ctx.solid(x, z, 0.42); ctx.footprint(x, z, 1.0, 0.3);
      if (rng() < 0.5) { const a = yaw(); deco(pick(shrooms), x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7, 0.8 + rng() * 0.4); }
    });
    let nLogs = 0;
    ctx.tryPlace(40, ctx.ring(14, 50), 2.4, (x, z) => {
      if (nLogs >= 4) return;
      const ry = yaw(), L = 1.7, c = Math.cos(ry), s = Math.sin(ry);
      for (const k of [-1, 1]) if (!ctx.free(x + c * L * k, z - s * L * k, 0.5)) return;
      ctx.place(pick(logs), { x, z, rotY: ry, tint: tint(0.1) });
      for (const k of [-1, 0, 1]) { const px = x + c * L * 0.62 * k, pz = z - s * L * 0.62 * k; ctx.solid(px, pz, 0.42); ctx.reserve(px, pz, 0.5); ctx.footprint(px, pz, 0.9, 0.4); }
      if (rng() < 0.6) deco(pick(shrooms), x + c * 0.6 + s * 0.6, z - s * 0.6 + c * 0.6, 0.9);
      nLogs++;
    });
    ctx.tryPlace(120, field, 0.8, (x, z) => { deco(pick(rng() < 0.3 ? blossom : bushes), x, z, 0.75 + rng() * 0.5); ctx.reserve(x, z, 0.5); });
    ctx.tryPlace(160, ctx.ring(8, 54), 0.5, (x, z) => { deco(pick(ferns), x, z, 0.8 + rng() * 0.5); ctx.reserve(x, z, 0.3); });
    ctx.tryPlace(40, field, 0.4, (x, z) => { deco(pick(shrooms), x, z, 0.8 + rng() * 0.4); });
  },
};

// ---------- campfire flame (one tiny animated mesh; HDR core blooms a little) ----------
let _flame = null;
function makeFlame(x, z) {
  const geo = new THREE.ConeGeometry(0.22, 0.75, 6, 1, true);
  geo.translate(0, 0.37, 0);
  const inner = new THREE.ConeGeometry(0.12, 0.5, 6, 1, true);
  inner.translate(0, 0.25, 0);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a2a).multiplyScalar(1.5), side: THREE.DoubleSide });
  const matIn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe08a).multiplyScalar(1.7), side: THREE.DoubleSide });
  const g = new THREE.Group();
  const outer = new THREE.Mesh(geo, mat), core = new THREE.Mesh(inner, matIn);
  g.add(outer, core);
  g.position.set(x, 0.12, z);
  g.userData.dispose = () => { geo.dispose(); inner.dispose(); mat.dispose(); matIn.dispose(); };
  _flame = g;
  return g;
}
function flameUpdate(dt, t) {
  if (!_flame) return;
  const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 21.7) * 0.06;
  _flame.scale.set(1 + Math.sin(t * 9.3) * 0.06, f, 1 + Math.cos(t * 8.1) * 0.06);
  _flame.rotation.y = t * 1.7;
  _flame.children[1].scale.y = 1 + Math.sin(t * 17 + 1) * 0.12;
}
