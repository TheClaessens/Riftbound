import { fromScreen, smoothPolyline, distToPolyline } from '../common.js';
import { makeBush, makeCampfire, makePalisade, makeCrates } from '../props.js';
import {
  makeMesa, makeArch, makeBoulder, makePebbles, makeAcacia, makeThornbush, makeGrassTuft, makeDriftwood,
  makeBeastSkull, makeRibcage, makeBonePile, makeWarBanner, makeWarDrum, makeWatchtower, makeOrcTent, makeOrcHut,
  makeSkullTotem, makeSpikeBarricade, makeWeaponRack, makeSpit, makeFireFx, makeSmokeFx, makeDustDevils, makeSaltCrust,
} from '../props_barrens.js';

// =====================================================================================
//  Act II — The Sunscorch Barrens. Hot golden-afternoon savanna badlands: a desaturated
//  ochre / sand playfield (mid value, so red telegraphs, magenta bullets and orange fire
//  read) with golden grass tufts, flat-crowned acacias, dead thornbushes, sun-bleached bones
//  and two beast carcasses, a dry riverbed with bleached driftwood that spills out of gaps in
//  the rim rocks, a cracked salt pan, and the orc Warband's war camp (watchtower, hide hut and
//  tents, war drums, teal-sigil banners, skull totems, a smouldering fire under a spit) on the
//  far edge. Saturated rust / red strata live only on the outcrops, mesas, buttes and hoodoos
//  from r 56 outward, which form a canyon wall on the rim and a badlands backdrop beyond.
//  Dust devils (shader-only) wander the outskirts. Layout is authored in SCREEN space (S(right, up)).
//  Hazard note: the Act II fissure geysers are dark cracks with red-orange seams inside a red telegraph ring, so the ground
//  only has plain, low-contrast Voronoi cracks and the salt-pan crust is raised and pale.
// =====================================================================================

const S = (sx, sy) => fromScreen(sx, sy);
const SP = (pts) => pts.map(([a, b]) => S(a, b));
const TAU = Math.PI * 2;
const CAM_FACE = Math.PI / 4;   // rotY that turns a prop's +Z toward the iso camera (banner cloth reads face-on)

const PAL = {
  trunk: 0x4a3828, trunkTop: 0x6a5038, deadWood: 0x6e5e4e, deadWoodTip: 0xb6a88e, cut: 0xc8a878,
  leafDark: 0x3e5626, leafLight: 0x84984a,
  sageDark: 0x5f6a3e, sageLight: 0xa3a866, bushDark: 0x5f6a3e, bushLight: 0xa3a866,
  grassRoot: 0x8a7638, grassTip: 0xdcc27e,
  // in-arena sandstone: desaturated tan (rust lives outside)
  rock: 0xb79c76, rockDark: 0x7c644c, moss: 0xd0bc8e, pebble: 0xc2ad88,
  redRock: 0xbe7a52, redRockDark: 0x7a4632,
  strata: [0xb5532e, 0xc8643a, 0xd0703f, 0xbf5c34, 0xdb8a58, 0xa84c2c, 0xe0a26e],
  mesaCap: 0xb39668, talus: 0xbc8a62,
  bone: 0xd8ccb0, boneDark: 0x9a8a6c, horn: 0x5e5040, socket: 0x2a2018,
  // Warband: dark wood / iron / hide, teal accents
  wood: 0x463224, woodTop: 0x6a4e36, pole: 0x463224, poleTop: 0x6a4e36,
  hide: 0x93765a, hideDark: 0x5a4634, iron: 0x474a4c, ironLight: 0x84877f,
  teal: 0x23a094, tealLight: 0x55c8b6, cloth: 0x332c27, rope: 0x8a7450,
  stone: 0x9c8c76, stoneDark: 0x5e5244, salt: 0xddd2b8, saltDark: 0xb2a488,
};

export const barrens = {
  id: 'barrens', name: 'The Sunscorch Barrens', seed: 7331,
  palette: PAL,
  atmos: {
    background: 0xe9cfa4, hemiSky: 0xb4d0ff, hemiGround: 0xa0784e, hemiIntensity: 1.15,
    moon: 0xffe4b4, moonIntensity: 3.3,
    grade: { tint: [1.02, 1.0, 0.96], saturation: 1.0, contrast: 1.06, vignette: 0.2 },
  },
  env: {
    haze: 0xe9cfa4, saturation: 0.86, lift: 0.01, dapple: 0,
    cloudCover: 0.7, cloudDark: 0.8, cloudScale: 0.012, cloudSpeed: [3.0, 0.8],
    wind: 0.85, windDir: [0.9, 0.35], edgeHaze: [64, 118], edgeHazeMax: 0.5,
  },
  rim: [0xfff2dc, 0.38],
  terrain: { flatR: 56, ramp: 12, farRise: 7, nearDrop: -7, noiseAmp: 3.5, noiseFreq: 0.035, depth: 0.3 },

  layout() {
    // dry riverbed (a 'river' with no water: carved, pale bank colour), crossing the far half
    // (it ends where the land starts rising at the rim: carved into the hills it would read as a dark trench)
    const wash = { width: 6.0, points: smoothPolyline(SP([[-56.5, 5], [-42, 10], [-22, 20], [0, 22], [20, 27], [32, 35], [38.5, 41]]), 2) };
    // the warband's trail: from the lowlands (camera side) through the arena up to the war camp
    const trail = { width: 3.2, points: smoothPolyline(SP([[84, -70], [52, -46], [28, -27], [9, -11], [-5, 4], [-13, 17], [-19, 28], [-23, 36], [-24, 40]]), 2) };
    // a dried-up salt pan (a 'pond' with no water: shallow carve, pale bank colour + crust props)
    const [px, pz] = S(-28, -21);
    return { paths: [trail], rivers: [wash], ponds: [{ x: px, z: pz, r: 6.5 }] };
  },

  ground: {
    groundA: 0xa68e70, groundB: 0xbca88a, groundDark: 0x8e7a60, groundDry: 0xc8ba9e,
    path: 0xc8baa0, pathEdge: 0xa69374, bank: 0xc6b89a, slope: 0x9c7a5c, soil: 0x907a5c,
    speck: 0x86705a, speckAmt: 0.32, cracks: 0.6, pebbles: 0.7,
  },
  grass: {
    count: 38000, height: 0.5, width: 0.1, density: 0.9, patchLo: 0.36, clump: [9, 16], clumpRadius: 0.2,
    colors: { root: 0x8a7638, tipA: 0xcbb168, tipB: 0xe2cc8a },
  },
  flowers: {
    count: 2200, height: 0.34, width: 0.12, density: 0.8, patchLo: 0.3, clump: [3, 6], clumpRadius: 0.5,
    colors: { petals: [0xc6b6e2, 0xece2c6, 0xf0d870, 0xb8a8dc] },
  },
  water: null,
  motes: [
    { kind: 'dot', count: 340, colors: [0xead2a6, 0xd9bc8e], size: 0.1, height: 3.2, rise: 0.04, drift: [1.8, 0.45], additive: false, opacity: 0.6 },
    { kind: 'dot', count: 140, colors: [0xfff0c4, 0xffe6a8], size: 0.12, height: 4.5, rise: 0.08, drift: [0.5, 0.15], additive: true, intensity: 0.7 },
    { kind: 'leaf', count: 46, colors: [0xd8c088, 0xbfa46e], size: 0.3, height: 3.5, fall: 0.25, drift: [1.6, 0.35], opacity: 0.95 },
  ],

  props(ctx) {
    const { rng } = ctx;
    const pal = PAL;
    const V = (n, fn) => Array.from({ length: n }, () => fn());
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const tint = (amt = 0.1) => [1 + (rng() - 0.5) * amt, 1 + (rng() - 0.5) * amt * 0.8, 1 + (rng() - 0.5) * amt];
    const yaw = () => rng() * TAU;
    const redPal = { ...pal, rock: pal.redRock, rockDark: pal.redRockDark };

    // ---- geometry variants ------------------------------------------------------------
    const acacias = V(4, () => makeAcacia(rng, pal));
    const bigAcacia = makeAcacia(rng, pal, { size: 1.3 });
    const snags = V(2, () => makeAcacia(rng, pal, { dead: true }));
    const thorns = V(3, () => makeThornbush(rng, pal));
    const thornsLeafy = V(2, () => makeThornbush(rng, pal, { leaves: true }));
    const sage = V(3, () => makeBush(rng, pal, { size: 0.75 }));
    const tufts = V(4, () => makeGrassTuft(rng, pal));
    const rocks = V(3, () => makeBoulder(rng, pal));
    const slabs = V(2, () => makeBoulder(rng, pal, { flat: true }));
    const redRocks = V(3, () => makeBoulder(rng, redPal, { cap: pal.mesaCap, capAmt: 0.5 }));
    const stacks = V(2, () => makeBoulder(rng, redPal, { stack: true, cap: pal.mesaCap, capAmt: 0.5 }));
    const outcrops = V(5, () => makeMesa(rng, pal, { kind: 'block', radius: 1.3, height: 2.4, seg: 7 }));
    const pebbles = V(3, () => makePebbles(rng, pal));
    const drift = V(2, () => makeDriftwood(rng, pal, { length: 2.2 + rng() * 1.2 }));
    const bonePiles = V(3, () => makeBonePile(rng, pal));
    const skulls = V(2, () => makeBeastSkull(rng, pal));
    const mesas = V(3, () => makeMesa(rng, pal, { kind: 'mesa', radius: 8, height: 16 }));
    const buttes = V(3, () => makeMesa(rng, pal, { kind: 'butte', radius: 4, height: 12 }));
    const spires = V(2, () => makeMesa(rng, pal, { kind: 'spire', radius: 2, height: 10 }));
    const lowButtes = V(2, () => makeMesa(rng, pal, { kind: 'butte', radius: 4, height: 6 }));

    // ---- helpers -------------------------------------------------------------------------
    const tree = (x, z, o = {}) => {
      const geo = o.geo ?? (o.dead ? pick(snags) : o.big ? bigAcacia : pick(acacias));
      const s = o.s ?? (0.9 + rng() * 0.3);
      const tr = (o.big ? 0.42 : 0.32) * s;
      ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.12), tiltX: (rng() - 0.5) * 0.05, tiltZ: (rng() - 0.5) * 0.05 }, { far: o.far });
      ctx.reserve(x, z, o.space ?? tr + 0.9);
      if (!o.far) { ctx.solid(x, z, tr); ctx.footprint(x, z, tr + 1.2, 0.3); }
    };
    // s = instance scale; boulder radius ≈ 1.1 m at s = 1
    const rock = (x, z, s, o = {}) => {
      const geo = o.geo ?? pick(o.red ? redRocks : rocks), R = 1.15 * s;
      ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.08), shade: 0.94 + rng() * 0.12 }, { far: o.far });
      ctx.reserve(x, z, R);
      if (o.solid !== false && !o.far) ctx.solid(x, z, R * 0.78);
      ctx.footprint(x, z, R + 0.4, 0.25);
    };
    // blocky red sandstone outcrop (a mini mesa with 2-4 strata); radius ≈ 1.5 m at s = 1
    const outcrop = (x, z, s, o = {}) => {
      ctx.place(pick(outcrops), { x, z, y: ctx.y(x, z) - 0.1 * s, rotY: yaw(), s, sy: o.sy ?? 1, tint: tint(0.08), shade: 0.93 + rng() * 0.12 }, { far: o.far });
      const R = 1.5 * s;
      ctx.reserve(x, z, R);
      if (!o.far && o.solid !== false) ctx.solid(x, z, R * 0.8);
      ctx.footprint(x, z, R + 0.4, 0.25);
    };
    const deco = (geo, x, z, s = 1, o = {}) => { ctx.place(geo, { x, z, rotY: yaw(), s, tint: tint(0.12), ...o }); };
    // big footprints: ctx.free's water test saturates 5 m from the bed, so formation spacing is checked here
    const wash = ctx.layout.rivers[0].points;
    const big = [];
    const roomFor = (x, z, R) => { for (const b of big) if (Math.hypot(x - b[0], z - b[1]) < R + b[2]) return false; return ctx.free(x, z, 1.5, { water: true }); };
    const clearOf = (x, z, R) => distToPolyline(x, z, wash, R + 4) > R + 3 && roomFor(x, z, R);
    const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);    // rotY so local +Z points at (tx, tz)
    // mesa-family formation; R = footprint radius at s = 1 (talus ≈ 1.4 R)
    const formation = (geo, x, z, s, Rb, o = {}) => {
      ctx.place(geo, { x, z, rotY: yaw(), s, sy: o.sy ?? 1, tint: tint(0.08), shade: 0.95 + rng() * 0.1 }, { far: o.far });
      ctx.reserve(x, z, Rb * s * 1.25);
      big.push([x, z, Rb * s * 1.2]);
      if (!o.far) ctx.solid(x, z, Rb * s * 1.05);
      if (o.H) {   // a little dry scrub on the flat top
        const top = ctx.y(x, z) + o.H * s * (o.sy ?? 1) - 0.05, n = 1 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) { const a = yaw(), d = Math.sqrt(rng()) * Rb * s * 0.4; ctx.place(pick(rng() < 0.6 ? tufts : sage), { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: top, rotY: yaw(), s: 1.1 + rng() * 0.6, tint: tint(0.12) }, { far: o.far }); }
      }
    };

    // ---- 1. hero composition around the title view ------------------------------------
    { // fallen beast: ribcage + skull, right of centre
      const [x, z] = S(17, -9), ry = face(x, z, ...S(30, -4)) - Math.PI / 2;   // ribcage local +X = head
      ctx.place(makeRibcage(rng, pal, { length: 7 }), { x, z, y: 0, rotY: ry, tiltX: 0.04 });
      const hx = Math.cos(-ry), hz = Math.sin(-ry);   // local +X in world (rotY about Y)
      for (const k of [-2.2, 0, 2.2]) { const px = x + hx * k, pz = z + hz * k; ctx.solid(px, pz, 1.25); ctx.reserve(px, pz, 1.6); ctx.footprint(px, pz, 2.0, 0.15); }
      const sx = x + hx * 5.2, sz = z + hz * 5.2;
      ctx.place(skulls[0], { x: sx, z: sz, y: -0.12, rotY: ry + Math.PI / 2 + 0.5, tiltZ: 0.12 });
      ctx.solid(sx, sz, 1.0); ctx.reserve(sx, sz, 1.5); ctx.footprint(sx, sz, 1.8, 0.2);
      for (const [a, b] of [[12, -14], [22, -12.5], [14, -4]]) { const [px, pz] = S(a, b); deco(pick(tufts), px, pz, 1.1 + rng() * 0.3); }
      const [bx, bz] = S(24, -14); deco(bonePiles[0], bx, bz, 1.1);
    }
    { const [x, z] = S(-14, 7); tree(x, z, { big: true, s: 1.0 }); const [a, b] = S(-11, 5.5); deco(pick(tufts), a, b, 1.2); const [c, d] = S(-16.5, 5); deco(pick(thornsLeafy), c, d, 0.9); }
    { const [x, z] = S(-15, -6); rock(x, z, 1.0); const [a, b] = S(-13.2, -7.4); deco(pick(tufts), a, b, 1.0); const [c, d] = S(-17, -7.5); rock(c, d, 0.45, { solid: false }); }
    { const [x, z] = S(10, 13); rock(x, z, 1.25, { geo: stacks[0] }); const [a, b] = S(12.5, 12); deco(pick(thorns), a, b, 1.0); }
    { const [x, z] = S(-6, -18); deco(pick(thorns), x, z, 1.15); ctx.reserve(x, z, 0.9); const [a, b] = S(-4, -17); deco(bonePiles[1], a, b, 1); }
    { const [x, z] = S(24, 3); tree(x, z, { dead: true, s: 1.0 }); }
    { // an older carcass, half swallowed by the sand: rib arcs breaking the surface + a great horned skull
      const [x, z] = S(-6, -36), ry = 0.9;
      ctx.place(makeRibcage(rng, pal, { length: 6.5, ribs: 6 }), { x, z, y: -1.05, rotY: ry, tiltX: 0.12, s: 1.05 });
      const hx = Math.cos(ry), hz = -Math.sin(ry);
      for (const k of [-1.6, 1.6]) { const px = x + hx * k, pz = z + hz * k; ctx.solid(px, pz, 1.1); ctx.reserve(px, pz, 1.6); ctx.footprint(px, pz, 2.0, 0.2); }
      const sx = x + hx * 4.6 + 1.2, sz = z + hz * 4.6 - 0.6;
      ctx.place(skulls[1], { x: sx, z: sz, y: -0.25, rotY: ry + 1.9, s: 1.15, tiltX: -0.1 });
      ctx.solid(sx, sz, 1.1); ctx.reserve(sx, sz, 1.8); ctx.footprint(sx, sz, 2.0, 0.2);
      for (let i = 0; i < 3; i++) { const a = yaw(), d = 3 + rng() * 3; deco(pick(tufts), x + Math.cos(a) * d, z + Math.sin(a) * d, 1 + rng() * 0.3); }
    }

    // ---- 2. the Warband camp on the far edge (up the trail) --------------------------------
    {
      const [fx, fz] = S(-24, 41);
      ctx.place(makeCampfire(rng, pal), { x: fx, z: fz, rotY: 0 });
      ctx.place(makeSpit(rng, pal), { x: fx, z: fz, rotY: 0.6 });
      ctx.reserve(fx, fz, 1.4); ctx.solid(fx, fz, 0.9); ctx.footprint(fx, fz, 2.2, 0.0);
      ctx.footprint(fx, fz, 9, 0.15);    // trodden camp ground
      ctx.add(makeFireFx(fx, 0.05, fz, { size: 1.15 }));
      ctx.add(makeSmokeFx(fx, 0.4, fz));
      const tents = [[-35, 40, 1.0, 'hut'], [-14.5, 46.5, 1.05], [-26.5, 50.5, 1.2]];
      for (const [sx, sy, s, kind] of tents) {
        const [x, z] = S(sx, sy);
        ctx.place(kind === 'hut' ? makeOrcHut(rng, pal, { size: s }) : makeOrcTent(rng, pal, { size: s }), { x, z, rotY: face(x, z, fx, fz) });
        ctx.reserve(x, z, 2.1 * s); ctx.solid(x, z, 1.55 * s); ctx.footprint(x, z, 2.3 * s, 0.05);
      }
      { const [x, z] = S(-33, 31.5); ctx.place(makeWarDrum(rng, pal), { x, z, rotY: face(x, z, fx, fz) + 0.4, s: 1.25 }); ctx.reserve(x, z, 1.4); ctx.solid(x, z, 0.9); ctx.footprint(x, z, 1.6, 0.1); }
      { const [x, z] = S(-15, 38); ctx.place(makeWeaponRack(rng, pal), { x, z, rotY: face(x, z, fx, fz) }); ctx.reserve(x, z, 1.1); ctx.solid(x, z, 0.75); }
      { const [x, z] = S(-31.5, 46); ctx.place(makeCrates(rng, pal), { x, z, rotY: 0.7 }); ctx.reserve(x, z, 1.0); ctx.solid(x, z, 0.8); }
      for (const [sx, sy] of [[-19.5, 32.5], [-27.5, 34]]) {
        const [x, z] = S(sx, sy); ctx.place(makeSkullTotem(rng, pal), { x, z, rotY: face(x, z, 0, 0) });
        ctx.reserve(x, z, 0.5); ctx.solid(x, z, 0.25); ctx.footprint(x, z, 0.8, 0.2);
      }
      const sig = ['fangs', 'claw', 'eye', 'tusk'];
      for (const [sx, sy, k] of [[-9.5, 42, 0], [-40.5, 34, 1], [-20, 54, 2], [-36.5, 47.5, 3]]) {
        const [x, z] = S(sx, sy); ctx.place(makeWarBanner(rng, pal, { sigil: sig[k], height: 4.0 + rng() * 0.6 }), { x, z, rotY: CAM_FACE + (rng() - 0.5) * 0.9 });
        ctx.reserve(x, z, 0.4); ctx.solid(x, z, 0.15);
      }
      for (const [sx, sy, L, rot] of [[-6, 37, 3.4, 0.5], [-42, 26, 3.6, -0.3]]) {
        const [x, z] = S(sx, sy);
        ctx.place(makeSpikeBarricade(rng, pal, { length: L }), { x, z, rotY: face(x, z, 0, 0) + rot });
        ctx.reserve(x, z, L * 0.5); ctx.solid(x, z, 0.9);
        const c = Math.cos(face(x, z, 0, 0) + rot), s2 = Math.sin(face(x, z, 0, 0) + rot);
        for (const k of [-1, 1]) { ctx.solid(x + c * L * 0.33 * k, z - s2 * L * 0.33 * k, 0.75); }
      }
      { const [x, z] = S(-46, 40); ctx.place(makeWatchtower(rng, pal), { x, z, rotY: face(x, z, 0, 0) }); ctx.reserve(x, z, 2.4); ctx.solid(x, z, 1.6); ctx.footprint(x, z, 2.6, 0.1); }
      // palisade arc behind the camp, on the arena rim
      const a0 = Math.atan2(S(-50, 30)[1], S(-50, 30)[0]), a1 = Math.atan2(S(-2, 57)[1], S(-2, 57)[0]);
      let da = a1 - a0; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const a = a0 + da * (i + 0.5) / segs, r = 57.2 + Math.sin(i * 1.7) * 0.4;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!ctx.free(x, z, 0.8, { pad: 0 })) continue;
        ctx.place(makePalisade(rng, pal, { length: Math.abs(da) * r / segs + 0.2 }), { x, z, rotY: -a - Math.PI / 2 });
        ctx.reserve(x, z, 1.2);
      }
    }

    // ---- 3. dry riverbed dressing ----------------------------------------------------------
    for (let i = 0; i < wash.length - 1; i++) {
      const [x0, z0] = wash[i], [x1, z1] = wash[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const inArena = Math.hypot(x0, z0) < 62;
      if (rng() < (inArena ? 0.35 : 0.2)) { const o = (rng() - 0.5) * 4; ctx.place(pick(pebbles), { x: x0 + nx * o, z: z0 + nz * o, rotY: yaw(), s: 0.8 + rng() * 0.6 }); }
      if (rng() < 0.05) { const o = (rng() - 0.5) * 3; ctx.place(pick(drift), { x: x0 + nx * o, z: z0 + nz * o, y: -0.25, rotY: Math.atan2(-dz, dx) + (rng() - 0.5) * 0.8, s: 0.9 + rng() * 0.3, tint: tint(0.08) }); }
      for (const side of [-1, 1]) {
        if (rng() < 0.3) { const o = 3.6 + rng() * 1.4; deco(pick(tufts), x0 + nx * o * side, z0 + nz * o * side, 0.8 + rng() * 0.5); }
        if (rng() < 0.1) { const o = 3.4 + rng() * 0.8; const x = x0 + nx * o * side, z = z0 + nz * o * side; ctx.place(pick(rocks), { x, z, rotY: yaw(), s: 0.35 + rng() * 0.3, tint: tint(0.08) }); }
      }
    }
    for (const p of wash) ctx.reserve(p[0], p[1], 2.4);
    for (const [ex, ez] of [wash[0], wash[wash.length - 1]]) {   // the wash spills out of a gap in the rim rocks
      const r = Math.hypot(ex, ez), ux = ex / r, uz = ez / r, nx = -uz, nz = ux;
      for (const [o, f, s] of [[-5.6, 0.2, 1.0], [5.8, 0.6, 1.1], [-3.4, 3.6, 1.3], [3.6, 3.9, 1.25], [0.3, 6.4, 1.5]]) {
        outcrop(ex + nx * o + ux * f, ez + nz * o + uz * f, s * (0.9 + rng() * 0.2), { sy: 0.8 + rng() * 0.6 });
      }
    }
    { // the salt pan: polygon crust on the floor, bones and pebbles strewn round the rim
      const p = ctx.layout.ponds[0];
      ctx.place(makeSaltCrust(rng, pal, { radius: 6.3, cell: 1.25 }), { x: p.x, z: p.z, y: -0.3, rotY: yaw() });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + rng() * 0.4, o = p.r + 0.4 + rng() * 1.4, x = p.x + Math.cos(a) * o, z = p.z + Math.sin(a) * o;
        const k = rng();
        if (k < 0.35) deco(pick(tufts), x, z, 0.9 + rng() * 0.4);
        else if (k < 0.6) deco(pick(pebbles), x, z, 0.7 + rng() * 0.4);
        else if (k < 0.75) deco(pick(bonePiles), x, z, 0.8);
        else if (k < 0.9) deco(pick(thorns), x, z, 0.9 + rng() * 0.3);
      }
      { const a = yaw(), x = p.x + Math.cos(a) * 3, z = p.z + Math.sin(a) * 3; ctx.place(skulls[1], { x, z, y: -0.36, rotY: yaw(), s: 0.6, tiltZ: 0.2 }); ctx.solid(x, z, 0.6); }
      ctx.reserve(p.x, p.z, p.r + 1.2);
    }

    // ---- 4. in-arena acacias (few; mostly the far half so they never stand in front of the action) ----
    let nTrees = 0;
    ctx.tryPlace(400, ctx.ring(18, 50), 2.4, (x, z) => {
      if (nTrees >= 8) return;
      const side = ctx.side(x, z);
      if (side > 0.25 && rng() < 0.85) return;
      if (ctx.mask.sample(x, z).path > 0.05) return;
      tree(x, z, { dead: rng() < 0.22, space: 5 }); nTrees++;
      for (let k = 0; k < 2; k++) if (rng() < 0.7) { const a = yaw(), d = 1.2 + rng(); deco(pick(tufts), x + Math.cos(a) * d, z + Math.sin(a) * d, 0.9 + rng() * 0.4); }
      if (rng() < 0.35) { const a = yaw(); deco(pick(bonePiles), x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8, 0.9); }
    });

    // ---- 5. the arena rim: red-rock outcrops, scrub, a low ledge on the camera side -------------
    for (let i = 0; i < 170; i++) {
      const a = (i / 170) * TAU + (rng() - 0.5) * 0.02, ca = Math.cos(a), sa = Math.sin(a);
      const side = (ca + sa) * Math.SQRT1_2;
      if (side > 0.45) {   // camera side: low ledge of rocks and scrub; the land falls away beyond
        const r = 55.6 + rng() * 1.8, x = ca * r, z = sa * r;
        if (!ctx.free(x, z, 0.6)) continue;
        const k = rng();
        if (k < 0.4) rock(x, z, 0.55 + rng() * 0.6, { red: true });
        else if (k < 0.75) deco(pick(thorns), x, z, 0.9 + rng() * 0.4);
        else deco(pick(tufts), x, z, 1 + rng() * 0.4);
        ctx.reserve(x, z, 0.6);
        continue;
      }
      if (rng() < 0.6) {   // scrub just inside the edge
        const r = 53.4 + rng() * 2.4, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 0.6, { pad: 0.1 })) {
          const k = rng();
          deco(k < 0.5 ? pick(tufts) : k < 0.8 ? pick(thorns) : pick(sage), x, z, 0.9 + rng() * 0.5); ctx.reserve(x, z, 0.5);
        }
      }
      if (rng() < 0.55) {   // red-rock outcrops straddling the edge
        const r = 56.8 + rng() * 3, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 1.6, { pad: 0.3 })) { if (rng() < 0.22) rock(x, z, 1.2 + rng() * 1.1, { geo: pick(stacks) }); else outcrop(x, z, 0.8 + rng() * 0.8, { sy: 0.7 + rng() * 0.8 }); }
      }
      if (side < 0.2 && rng() < 0.1) {   // the odd acacia / snag between the rocks (far half: never in front of the action)
        const r = 57.5 + rng() * 3, x = ca * r, z = sa * r;
        if (ctx.free(x, z, 1.2, { pad: 0.2 })) tree(x, z, { dead: rng() < 0.45, s: 0.95 + rng() * 0.3, space: 1.4 });
      }
    }
    // escarpment: broken red-rock ledges and slabs half-buried in the far-side slope
    ctx.tryPlace(240, ctx.ring(58.5, 69), 1.4, (x, z) => {
      if (ctx.side(x, z) > 0.35 || distToPolyline(x, z, wash, 9) < 8) return;
      const s = 0.9 + rng() * 1.4;
      ctx.place(pick(outcrops), { x, z, y: ctx.y(x, z) - 0.25 * s, rotY: yaw(), s, sy: 0.6 + rng() * 0.9, tint: tint(0.08), shade: 0.92 + rng() * 0.14, tiltX: (rng() - 0.5) * 0.15, tiltZ: (rng() - 0.5) * 0.15 });
      ctx.reserve(x, z, 0.9 * s);
      ctx.solid(x, z, 0.8 * s);
      if (rng() < 0.5) { const a = yaw(), d = s * 1.1; ctx.place(pick(rng() < 0.6 ? tufts : thorns), { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, rotY: yaw(), s: 1 + rng() * 0.4 }); }
    }, { water: true, pad: 0.15 });
    // buttes and hoodoos just beyond the rim (far half + sides; short on the flanks so they never hide the player)
    let nB = 0;
    const [campX, campZ] = S(-26, 46);
    ctx.tryPlace(400, ctx.ring(61, 74), 2, (x, z) => {
      if (nB >= 15) return;
      const side = ctx.side(x, z), r = Math.hypot(x, z);
      if (side > 0.42 || !clearOf(x, z, 4.5) || Math.hypot(x - campX, z - campZ) < 15) return;
      const tall = side < 0.08, k = rng();
      if (k < 0.3 && tall) { const s = 0.8 + rng() * 0.6; if (r - 2.6 * s < 58) return; formation(pick(spires), x, z, s, 2.0, { sy: 0.9 + rng() * 0.4 }); }
      else { const s = 0.65 + rng() * 0.45; if (r - 5.2 * s < 57.5) return; formation(pick(tall ? buttes : lowButtes), x, z, s, 4.0, { sy: tall ? 0.8 + rng() * 0.6 : 0.8 + rng() * 0.3, H: tall ? 12 : 6 }); }
      nB++;
    }, { water: true });

    // ---- 6. the badlands beyond: mesas, buttes, hoodoos, acacia savanna, scattered rocks --------
    { // a wind-carved arch on the far skyline
      const [x, z] = S(-28, 90);
      ctx.place(makeArch(rng, pal, { span: 14, height: 11 }), { x, z, rotY: Math.PI / 4 + 0.3, tint: tint(0.06) }, { far: true });
      ctx.reserve(x, z, 10); big.push([x, z, 11]);
    }
    ctx.tryPlace(1400, ctx.ring(70, 128), 2, (x, z) => {
      const r = Math.hypot(x, z), side = ctx.side(x, z), far = r > 78;
      if (!clearOf(x, z, 4)) return;
      const k = rng();
      if (side > 0.45) {   // camera-side lowlands: savanna + a few low buttes (never tall enough to occlude)
        if (r < 66) return;
        if (k < 0.12 && r > 76) formation(pick(lowButtes), x, z, 0.6 + rng() * 0.5, 4, { far, sy: 0.6 + rng() * 0.4, H: 6 });
        else if (k < 0.62) tree(x, z, { far, dead: rng() < 0.15, s: 1.0 + rng() * 0.45, space: 3.5 });
        else outcrop(x, z, 1.1 + rng() * 1.3, { far, solid: false, sy: 0.6 + rng() * 0.7 });
        return;
      }
      if (k < 0.2) formation(pick(mesas), x, z, 0.7 + rng() * 0.7, 8, { far, sy: 0.6 + rng() * 0.7, H: 16 });
      else if (k < 0.38) formation(pick(buttes), x, z, 0.8 + rng() * 0.7, 4, { far, sy: 0.8 + rng() * 0.8, H: 12 });
      else if (k < 0.48) formation(pick(spires), x, z, 0.8 + rng() * 0.8, 2, { far, sy: 0.8 + rng() * 0.6 });
      else if (k < 0.82) tree(x, z, { far, dead: rng() < 0.15, s: 1.0 + rng() * 0.45, space: 3.5 });
      else if (rng() < 0.6) outcrop(x, z, 1.2 + rng() * 1.6, { far, solid: false, sy: 0.6 + rng() * 0.9 }); else rock(x, z, 1.4 + rng() * 2, { red: true, far, solid: false });
    }, { water: true });
    // scrub everywhere outside (fills the slopes between formations)
    ctx.tryPlace(500, ctx.ring(58, 100), 0.8, (x, z) => {
      const far = Math.hypot(x, z) > 78;
      ctx.place(pick(rng() < 0.55 ? tufts : rng() < 0.6 ? thorns : sage), { x, z, rotY: yaw(), s: 1 + rng() * 0.5, tint: tint(0.12) }, { far });
    }, { pad: 0.2 });
    // camera side: the land falls into a savanna valley (low rocks + scrub on the ledge, trees further down)
    ctx.tryPlace(800, ctx.ring(57.5, 80), 1.2, (x, z) => {
      const r = Math.hypot(x, z);
      if (ctx.side(x, z) < 0.4 || !clearOf(x, z, 1.2)) return;
      const k = rng();
      if (r > 64 && k < 0.35) tree(x, z, { dead: rng() < 0.2, s: 1.0 + rng() * 0.4, space: 3 });
      else if (k < 0.5) outcrop(x, z, r < 62 ? 0.6 + rng() * 0.5 : 0.8 + rng() * 0.9, { solid: false, sy: 0.45 + rng() * 0.45 });
      else if (k < 0.62) rock(x, z, 0.6 + rng() * 0.9, { red: true, solid: false });
      else { deco(pick(rng() < 0.5 ? tufts : rng() < 0.6 ? thorns : sage), x, z, 1 + rng() * 0.5); ctx.reserve(x, z, 0.5); }
    }, { water: true });

    // ---- 7. playfield dressing: boulders, slabs, thornbushes, sage, tufts, bones -----------------
    const field = ctx.ring(9, 52);
    ctx.tryPlace(22, field, 1.3, (x, z) => { rock(x, z, 0.5 + rng() * 0.6); if (rng() < 0.6) { const a = yaw(); deco(pick(tufts), x + Math.cos(a) * 1.3, z + Math.sin(a) * 1.3, 0.9 + rng() * 0.3); } });
    ctx.tryPlace(10, field, 1.2, (x, z) => { ctx.place(pick(slabs), { x, z, rotY: yaw(), s: 0.7 + rng() * 0.4, tint: tint(0.08) }); ctx.reserve(x, z, 1.1); ctx.footprint(x, z, 1.4, 0.3); });
    let nSk = 0;
    ctx.tryPlace(40, ctx.ring(16, 50), 1.4, (x, z) => {
      if (nSk >= 4) return;
      ctx.place(skulls[nSk % 2], { x, z, y: -0.15, rotY: yaw(), s: 0.5 + rng() * 0.2, tiltZ: (rng() - 0.5) * 0.3 });
      ctx.reserve(x, z, 1.1); ctx.solid(x, z, 0.55); ctx.footprint(x, z, 1.2, 0.3); nSk++;
    });
    ctx.tryPlace(30, field, 0.9, (x, z) => { deco(pick(rng() < 0.3 ? thornsLeafy : thorns), x, z, 0.8 + rng() * 0.45); ctx.reserve(x, z, 0.7); });
    ctx.tryPlace(70, field, 0.7, (x, z) => { deco(pick(sage), x, z, 0.7 + rng() * 0.5); ctx.reserve(x, z, 0.5); });
    ctx.tryPlace(170, ctx.ring(8, 54), 0.45, (x, z) => { deco(pick(tufts), x, z, 0.75 + rng() * 0.6); ctx.reserve(x, z, 0.3); });
    ctx.tryPlace(18, field, 0.8, (x, z) => { deco(pick(bonePiles), x, z, 0.8 + rng() * 0.4); ctx.reserve(x, z, 0.8); });
    ctx.tryPlace(26, field, 0.6, (x, z) => { deco(pick(pebbles), x, z, 0.6 + rng() * 0.5); });
    // lone warband banners staking out the territory along the edge
    let nBan = 0;
    ctx.tryPlace(120, ctx.ring(50, 54), 0.6, (x, z) => {
      if (nBan >= 4 || ctx.side(x, z) > 0.3) return;
      ctx.place(makeWarBanner(rng, pal, { sigil: ['fangs', 'claw', 'eye', 'tusk'][nBan] }), { x, z, rotY: CAM_FACE + (rng() - 0.5) * 1.0 });
      ctx.reserve(x, z, 3); ctx.solid(x, z, 0.15);
      const a = yaw(); deco(pick(bonePiles), x + Math.cos(a) * 1.0, z + Math.sin(a) * 1.0, 0.8);
      nBan++;
    });

    // ---- 8. ambient: dust devils over the outskirts -------------------------------------------
    ctx.add(makeDustDevils({ count: 3, mask: ctx.mask, r0: 38, r1: 84, color: 0xe2cca0, dark: 0x94744e }));
  },
};
