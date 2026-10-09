import { defineHero, pose, keys, twoKey, rest, idle, gait, aimTwist, wind, hit, deathCommon, stomp, smooth, bump } from './hero.js';

// =====================================================================================
//  ARCANIST — Loomwarden of the Prism Archive (design/research/09-hero-bible.md Appendix D, §4).
//  Slender, upright violet column: white standing collar + stole + tabard, white top-knot with a
//  bronze crown-pin, a BROKEN CROWN-HALO turning behind the head (3 bronze arcs, 3 crown points,
//  3 violet stars in the gaps), a FLOATING OPEN TOME at the left (its own bones: covers + a page
//  that flips), a bronze rift-key wand in the right hand, and 3 glyph-stars orbiting the waist.
//  Halo spin, glyph orbit speed / width and the gap stars scale with Chain (H.meter).
//
//  Model space, faces +Z, left = +X. Rotation signs (XYZ euler): +x pitches an upright segment's
//  top forward / swings a hanging part back; +y turns toward +X; +z moves a hanging limb toward +X.
//  Torso entries of the key poses are ADDITIVE (they never cancel the aim twist); limb / prop
//  entries blend to absolute keys (put).
// =====================================================================================

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;

// ---- shared Crownforge palette (bible §0)
const RIFT_IRON = 0x3a3350, RIFT_IRON_HI = 0x5a4f78;
const BRONZE_LO = 0x6e5232, BRONZE = 0xa07a48, BRONZE_HI = 0xc8a874;
const GILT = 0xecd9a6, GILT_HI = 0xf6ead0, GILT_D = 0xc9b07a;
const LEATHER_D = 0x2e2020;
const ARCANE = 0xc08cff, ARCANE_HI = 0xe6d2ff;
// ---- Loomwarden palette (Appendix D)
const ROBE = 0x4b2f86, ROBE_D = 0x3a2268;
const STOLE = 0xece6f8;
const SKIN = 0x8a5a3c, SKIN_D = 0x74492f;
const HAIR = 0xf0ecf6;
const TROUSER = 0x2a2238, BOOT = 0x2a2030;
const GLYPH_MATTE = 0x6d3fc0;

// ---- build helpers ------------------------------------------------------------------
// cylinder from a (radius rA) to b (radius rB)
function limb(pb, a, b, rA, rB, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return pb.cyl(rB, rA, len, { radial: 7, ...o, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [Math.atan2(dz / len, dy / len), 0, -Math.asin(dx / len)] });
}
// cone from base a to tip b
function ptCone(pb, a, b, r, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return pb.cone(r, len, { radial: 6, ...o, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [Math.atan2(dz / len, dy / len), 0, -Math.asin(dx / len)] });
}
// 4-point star (the Arcane element shape, design/UI.md §1.2)
const STAR4 = (r, ri = r * 0.32) => [[0, r], [ri * 0.7, ri * 0.7], [r, 0], [ri * 0.7, -ri * 0.7], [0, -r], [-ri * 0.7, -ri * 0.7], [-r, 0], [-ri * 0.7, ri * 0.7]];
// the Crownforge crown point (design/UI.md --orn-crown)
const CROWN_PT = [[-0.08, -0.05], [0.08, -0.05], [0.08, 0.025], [0.045, 0], [0, 0.065], [-0.045, 0], [-0.08, 0.025]];
const scaled = (pts, s) => pts.map(([x, y]) => [x * s, y * s]);
// point P + rotZ(a)·(x, y, z)
const rz3 = (P, a, x, y, z) => [P[0] + x * cos(a) - y * sin(a), P[1] + x * sin(a) + y * cos(a), P[2] + z];

// ---- bones (Appendix D, 32): the tome gets covers + a flipping page, the halo a star ring,
//      the wand its own star; the bun lives on the head.
const HERO_S = 1.1;                   // ×1.1: 2.4 m halo ring top, the tallest humanoid on screen
const TOME = [0.62, 1.14, 0.13];      // floating tome: spine (hinge) centre at the left hip
const HALO = [0, 1.85, -0.26];        // halo ring centre (behind the head)
const HALO_R = 0.33;
const STAR = [-0.26, 0.31, 0.04];     // wand star (the muzzle), wand modelled hanging along the forearm
const A_V = 0.2;                      // tome V half-angle (pages rise toward the outer edges)
const FLIP = PI - 2 * A_V;            // page rotation from the right half onto the left half
const CLOSE = PI / 2 - A_V;           // cover rotation to closed (standing on its spine)
const HALO_TILT = -0.15;              // the ring leans back a little (reads from the front AND the back)
const BONES = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 0.92, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 1.04, 0] },
  { name: 'chest', parent: 'spine', pivot: [0, 1.24, 0] },
  { name: 'head', parent: 'chest', pivot: [0, 1.58, 0.02] },
  { name: 'armL', parent: 'chest', pivot: [0.23, 1.48, 0] },
  { name: 'foreL', parent: 'armL', pivot: [0.25, 1.19, 0.01] },
  { name: 'handL', parent: 'foreL', pivot: [0.26, 0.93, 0.02] },
  { name: 'armR', parent: 'chest', pivot: [-0.23, 1.48, 0] },
  { name: 'foreR', parent: 'armR', pivot: [-0.25, 1.19, 0.01] },
  { name: 'handR', parent: 'foreR', pivot: [-0.26, 0.93, 0.02] },
  { name: 'focus', parent: 'handR', pivot: [-0.26, 0.87, 0.04] },     // rift-key wand (grip)
  { name: 'star', parent: 'focus', pivot: STAR },                      // wand star (spins, pulses)
  { name: 'tome', parent: 'chest', pivot: TOME },                      // floats, follows the aim twist
  { name: 'tomeL', parent: 'tome', pivot: TOME },                      // left cover + pages (hinge = spine)
  { name: 'tomeR', parent: 'tome', pivot: TOME },
  { name: 'page', parent: 'tome', pivot: TOME },                       // the page that flips
  { name: 'halo', parent: 'chest', pivot: HALO },
  { name: 'haloStars', parent: 'halo', pivot: HALO },                  // gap stars: flare out with Chain
  { name: 'thighL', parent: 'hips', pivot: [0.10, 0.90, 0] },
  { name: 'shinL', parent: 'thighL', pivot: [0.105, 0.49, 0.01] },
  { name: 'footL', parent: 'shinL', pivot: [0.11, 0.10, 0.02] },
  { name: 'thighR', parent: 'hips', pivot: [-0.10, 0.90, 0] },
  { name: 'shinR', parent: 'thighR', pivot: [-0.105, 0.49, 0.01] },
  { name: 'footR', parent: 'shinR', pivot: [-0.11, 0.10, 0.02] },
  { name: 'tabard', parent: 'hips', pivot: [0, 0.98, 0.14] },
  { name: 'coatB1', parent: 'hips', pivot: [0, 1.00, -0.14] },
  { name: 'coatB2', parent: 'coatB1', pivot: [0, 0.56, -0.17] },
  { name: 'glyph1', parent: 'hips', pivot: [0, 0.92, 0] },            // orbiters
  { name: 'glyph2', parent: 'hips', pivot: [0, 0.92, 0] },
  { name: 'glyph3', parent: 'hips', pivot: [0, 0.92, 0] },
  { name: 'shard', parent: 'chest', pivot: [0, 1.42, 0.17] },
];

// ---- gait (bible §4.4): a gliding walk
const GAIT = { A: 0.62, K: 0.9, bob: 0.035, lean: 0.1, arm: 0.4, hy: 0.08, focusArm: 0.35 };
const IDLE = { a: 0.015, f: 1.8, sway: 0.6 };

// ---- additive pose tables (torso / offsets), compiled lazily per def, allocation free afterwards
function dpose(table) { return { table, cache: new Map() }; }
const LOWER = { root: 1, hips: 1, thighL: 1, shinL: 1, footL: 1, thighR: 1, shinR: 1, footR: 1 };
function addK(L, B, K, w, lowerW = 1) {
  if (w <= 0) return;
  let list = K.cache.get(B);
  if (!list) {
    list = [];
    for (const key in K.table) {
      const [n, kind] = key.split('.');
      if (B[n] === undefined) throw new Error(`arcanist pose: unknown bone "${n}"`);
      const v = K.table[key];
      list.push(B[n], kind === 'm' ? 1 : 0, LOWER[n] ? 1 : n === 'spine' ? 2 : 0, v[0], v[1], v[2]);
    }
    K.cache.set(B, list);
  }
  for (let i = 0; i < list.length; i += 6) {
    const g = list[i + 2];
    const ww = g === 1 ? w * lowerW : g === 2 ? w * (0.6 + 0.4 * lowerW) : w;
    if (ww <= 0) continue;
    if (list[i + 1] === 1) L.mv(list[i], list[i + 3] * ww, list[i + 4] * ww, list[i + 5] * ww);
    else L.add(list[i], list[i + 3] * ww, list[i + 4] * ww, list[i + 5] * ww);
  }
}
// one key = absolute limb / prop pose (put) + additive torso deltas
const key2 = (put, add) => ({ put: pose(put), add: dpose(add) });
function applyKey(L, B, K, wPut, wAdd, lowerW) {
  keys(L, B, K.put, wPut, lowerW);
  addK(L, B, K.add, wAdd, lowerW);
}
// two-key action: limbs blend K1 → K2; torso deltas cross-fade (never sum)
function action2(L, B, K1, K2, w1, w2, lowerW) {
  keys(L, B, K1.put, w1, lowerW);
  keys(L, B, K2.put, w2, lowerW);
  addK(L, B, K1.add, w1 * (1 - w2), lowerW);
  addK(L, B, K2.add, w2, lowerW);
}

// dangling legs while floating (toes pointed)
const FLOAT_LEGS = { thighL: [-0.12, 0, 0.04], shinL: [0.32, 0, 0], footL: [0.55, 0, 0], thighR: [0.06, 0, -0.04], shinR: [0.45, 0, 0], footR: [0.6, 0, 0] };

// ---- rest additions (bible §4.2): upright and serene, wand forward, left palm under the tome
const REST_AR = pose({
  spine: [-0.06, 0, 0], head: [0.03, 0, 0],
  armR: [-0.08, 0, 0.02], foreR: [-0.55, 0, 0], handR: [-0.15, 0, 0], focus: [-0.12, 0, 0],
  armL: [-0.06, 0, 0.08], foreL: [-0.55, 0, 0], handL: [-0.35, 0, 0],
  tome: [0, 0, 0.28],
  halo: [HALO_TILT, 0, 0],
});

// ---- scribe rapid-cast stance (bible §4.6): wand on the target, left hand guiding the tome
const STANCE = key2(
  { armR: [-1.35, 0, -0.1], foreR: [-0.2, 0, 0], handR: [0, 0, 0], focus: [-0.3, 0, 0],
    armL: [-0.9, -0.2, 0.3], foreL: [-0.85, 0, 0], handL: [-0.45, 0, 0],
    'tome.m': [-0.14, 0.15, 0.12], tome: [0.35, 0, 0.2] },
  { chest: [0, 0.1, 0], 'hips.m': [0, -0.01, 0] },
);

// ---- idle fidgets: page flip (×2), reading the tome up close (×1)
const F_FLIP = key2(
  { armL: [-0.75, -0.15, 0.22], foreL: [-1.0, 0, 0], handL: [-0.5, 0, 0], 'tome.m': [-0.06, 0.12, 0.06], tome: [0.15, 0, 0.42] },
  { head: [0.18, 0.35, 0], chest: [0, 0.12, 0] },
);
const F_READ = key2(
  { armL: [-1.0, -0.35, 0.05], foreL: [-1.25, 0, 0], handL: [-0.4, 0, 0], 'tome.m': [-0.42, 0.48, 0.3], tome: [0.75, 0, 0.1],
    armR: [-0.35, 0, -0.1], foreR: [-1.2, 0, 0] },
  { head: [0.32, 0.1, -0.08], spine: [0.04, 0, 0], chest: [0, 0.06, 0] },
);

// ---- heavy: CONDUCTOR (tome held overhead → arms sweep out and down, the tome claps shut)
const H_RAISE = key2(
  { armL: [-2.75, 0, 0.25], foreL: [-0.3, 0, 0], handL: [-0.3, 0, 0], armR: [-2.45, 0, -0.35], foreR: [-0.3, 0, 0], handR: [0, 0, 0], focus: [0, 0, 0],
    'tome.m': [-0.46, 1.05, -0.16], tome: [0.1, 0, 0], ...FLOAT_LEGS },
  { spine: [-0.25, 0, 0], head: [-0.28, 0, 0], 'hips.m': [0, 0.1, 0] },
);
const H_SWEEP = key2(
  { armL: [-0.65, 0, 1.25], armR: [-0.65, 0, -1.25], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], handL: [0.2, 0, 0], handR: [0, 0, 0], focus: [0.3, 0, 0],
    'tome.m': [-0.52, 0.02, 0.44], tome: [0.3, 0, 0],
    thighL: [-0.4, 0, 0.12], shinL: [0.55, 0, 0], footL: [-0.15, 0, -0.1], thighR: [0.28, 0, -0.12], shinR: [0.5, 0, 0], footR: [-0.4, 0, 0.1] },
  { spine: [0.28, 0, 0], head: [0.05, 0, 0], 'hips.m': [0, -0.08, 0.02] },
);

// ---- throw: two-palm push with the tome to the front
const T_WIND = key2(
  { armL: [-0.55, -0.35, -0.15], foreL: [-1.8, 0, 0], handL: [-0.3, 0, 0], armR: [-0.55, 0.35, 0.15], foreR: [-1.8, 0, 0], handR: [0, 0, 0], focus: [0.5, 0, 0],
    'tome.m': [-0.52, 0.12, 0.3], tome: [0.9, 0, 0] },
  { chest: [0, -0.15, 0], spine: [-0.12, 0, 0], head: [-0.05, 0, 0] },
);
const T_PUSH = key2(
  { armL: [-1.5, 0, -0.14], armR: [-1.5, 0, 0.14], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0], handL: [-0.9, 0, 0], handR: [-0.7, 0, 0], focus: [0.75, 0, 0],
    'tome.m': [-0.6, 0.32, 0.74], tome: [1.35, 0, 0],
    thighL: [-0.42, 0, 0.1], shinL: [0.25, 0, 0], thighR: [0.3, 0, -0.1], shinR: [0.35, 0, 0] },
  { chest: [0, 0.1, 0], spine: [0.2, 0, 0], 'hips.m': [0, -0.03, 0.04] },
);

// ---- nova: gather (arms crossed, curl) → burst (arms flung out, the Arcanist floats)
const N_GATHER = key2(
  { armL: [-1.0, 0, -0.5], armR: [-1.0, 0, 0.5], foreL: [-1.4, 0, 0], foreR: [-1.4, 0, 0], focus: [0.4, 0, 0],
    thighL: [-0.4, 0, 0.1], thighR: [-0.4, 0, -0.1], shinL: [0.8, 0, 0], shinR: [0.8, 0, 0],
    'tome.m': [-0.3, 0.12, 0.12], tome: [0, 0, 0.6] },
  { spine: [0.4, 0, 0], head: [0.12, 0, 0], 'hips.m': [0, -0.14, 0] },
);
const N_BURST = key2(
  { armL: [-0.4, 0, 1.6], armR: [-0.4, 0, -1.6], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], handL: [-0.3, 0, 0], focus: [-0.2, 0, 0],
    'tome.m': [0.05, 0.45, -0.05], tome: [0.2, 0, 0.5], ...FLOAT_LEGS },
  { spine: [-0.3, 0, 0], head: [-0.3, 0, 0], 'hips.m': [0, 0.18, 0], tabard: [-0.3, 0, 0], coatB1: [0.45, 0, 0] },
);

// ---- channel: floats, tome open in front, left hand over the pages, the wand drawing over it
const CHANNEL = key2(
  { armR: [-1.05, 0.25, -0.05], foreR: [-0.95, 0, 0], handR: [-0.2, 0, 0], focus: [0.35, 0, 0],
    armL: [-1.0, -0.25, 0.15], foreL: [-1.0, 0, 0], handL: [-0.5, 0, 0],
    'tome.m': [-0.46, 0.14, 0.4], tome: [0.6, 0, 0], ...FLOAT_LEGS },
  { spine: [-0.06, 0, 0], head: [0.2, 0, 0], 'hips.m': [0, 0.15, 0] },
);

// ---- Phase Step arrive (bible §4.8): crouch → unfold (the controller hides the body 0.06 s first)
const A_CROUCH = key2(
  { thighL: [-0.5, 0, 0.1], thighR: [-0.5, 0, -0.1], shinL: [1.0, 0, 0], shinR: [1.0, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0],
    armL: [0.6, 0, 0.5], armR: [0.6, 0, -0.5], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], focus: [0.4, 0, 0],
    'tome.m': [-0.2, -0.05, -0.12] },
  { spine: [0.45, 0, 0], head: [0.2, 0, 0], 'hips.m': [0, -0.16, 0] },
);
const A_UNFOLD = key2(
  { armL: [-0.5, 0, 1.4], armR: [-0.5, 0, -1.4], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0], handL: [-0.3, 0, 0], focus: [-0.2, 0, 0],
    thighL: [0, 0, 0.05], thighR: [0, 0, -0.05], shinL: [0.1, 0, 0], shinR: [0.1, 0, 0], 'tome.m': [0.05, 0.12, 0] },
  { spine: [-0.2, 0, 0], head: [-0.15, 0, 0], 'hips.m': [0, 0.05, 0] },
);

// ---- death: rises and goes limp (the tome falls), then sinks to the knees → common slump + recall
const D_LIMP = key2(
  { armL: [0.18, 0, 0.32], armR: [0.18, 0, -0.32], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0], handL: [0.3, 0, 0], handR: [0.3, 0, 0], focus: [0.5, 0, 0],
    thighL: [0.06, 0, 0.03], shinL: [0.3, 0, 0], footL: [0.7, 0, 0], thighR: [-0.04, 0, -0.03], shinR: [0.4, 0, 0], footR: [0.75, 0, 0] },
  { spine: [-0.18, 0, 0], head: [-0.35, 0, 0.1], 'hips.m': [0, 0.22, 0] },
);
const D_KNEEL = key2(
  { thighL: [-0.3, 0, 0.12], shinL: [1.75, 0, 0], footL: [0.65, 0, 0], thighR: [-0.2, 0, -0.12], shinR: [1.7, 0, 0], footR: [0.65, 0, 0],
    armL: [0.1, 0, 0.18], armR: [0.1, 0, -0.18], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], handL: [0.2, 0, 0], handR: [0.2, 0, 0], focus: [0.6, 0, 0] },
  { spine: [0.3, 0, 0], head: [0.1, 0, 0], 'hips.m': [0, -0.4, -0.02] },
);

// ---- victory: floats with arms open, the tome opens wide overhead → calm hovering loop
const V_OPEN = key2(
  { armL: [-0.55, 0, 1.3], armR: [-0.55, 0, -1.3], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], handL: [-0.3, 0, 0], handR: [-0.3, 0, 0], focus: [-0.4, 0, 0],
    'tome.m': [-0.6, 1.2, 0.08], tome: [0.25, 0, 0], ...FLOAT_LEGS },
  { spine: [-0.15, 0, 0], head: [-0.28, 0, 0], 'hips.m': [0, 0.25, 0] },
);
const V_CALM = key2(
  { armL: [-0.35, 0, 0.55], armR: [-0.35, 0, -0.55], foreL: [-0.65, 0, 0], foreR: [-0.65, 0, 0], handL: [-0.45, 0, 0], handR: [-0.3, 0, 0], focus: [-0.3, 0, 0],
    'tome.m': [-0.5, 0.2, 0.34], tome: [0.55, 0, 0], ...FLOAT_LEGS },
  { spine: [-0.04, 0, 0], head: [0.1, 0, 0], 'hips.m': [0, 0.16, 0] },
);

export const arcanistHero = defineHero({
  id: 'heroArcanist',
  bones: BONES,
  stride: 1.95 * HERO_S,
  blob: 0.55,
  gait: GAIT,
  castHands: (n) => (n % 3 === 0 ? 'tome' : 'muzzle'),   // every 3rd starter shot fires from the tome
  muzzle: { bone: 'star', at: STAR },
  hand: { bone: 'tome', at: [TOME[0], TOME[1] + 0.17, TOME[2]] },     // tome sigil (every 3rd scribe shot)
  emitters: {
    wand: { bone: 'star', at: STAR },                                   // wand star (= muzzle)
    tome: { bone: 'tome', at: [TOME[0], TOME[1] + 0.17, TOME[2]] },     // sigil over the open pages
    halo: { bone: 'halo', at: HALO },                                   // halo centre (behind the head)
    haloTop: { bone: 'halo', at: [0, HALO[1] + HALO_R, HALO[2]] },      // top of the ring
    glyph1: { bone: 'glyph1', at: [0, 0.92, 0.56] },                     // orbiting glyph-stars
    glyph2: { bone: 'glyph2', at: [0, 0.92, 0.56] },
    glyph3: { bone: 'glyph3', at: [0, 0.92, 0.56] },
    bun: { bone: 'head', at: [0.175, 2.095, -0.05] },                     // crown-pin star
    footL: { bone: 'footL', at: [0.11, 0.02, 0.06] },
    footR: { bone: 'footR', at: [-0.11, 0.02, 0.06] },
  },

  build(pb) {
    // ================= legs: dark trousers, soft pointed boots with a curled toe
    pb.mirror((S, k) => {
      limb(pb, [0.10 * k, 0.92, 0], [0.105 * k, 0.49, 0.01], 0.085, 0.072, { bone: 'thigh' + S, color: TROUSER });
      limb(pb, [0.105 * k, 0.49, 0.01], [0.11 * k, 0.12, 0.02], 0.075, 0.066, { bone: 'shin' + S, color: BOOT });
      pb.cyl(0.09, 0.08, 0.09, { bone: 'shin' + S, pos: [0.107 * k, 0.3, 0.015], radial: 7, color: RIFT_IRON_HI });   // boot cuff
      pb.box(0.13, 0.1, 0.25, { bone: 'foot' + S, pos: [0.11 * k, 0.055, 0.06], taper: [0.9, 0.85], color: BOOT });
      ptCone(pb, [0.11 * k, 0.055, 0.17], [0.11 * k, 0.12, 0.31], 0.058, { bone: 'foot' + S, color: BOOT });            // curled toe
      pb.box(0.14, 0.04, 0.27, { bone: 'foot' + S, pos: [0.11 * k, 0.02, 0.06], color: LEATHER_D });                  // sole
    });

    // ================= hips / skirts: side panels, white front tabard, two-piece back coat
    pb.box(0.3, 0.18, 0.24, { bone: 'hips', pos: [0, 0.92, 0], color: ROBE });
    pb.mirror((S, k) => {
      pb.box(0.08, 0.62, 0.27, { bone: 'hips', pos: [0.18 * k, 0.68, -0.02], bottom: [1.2, 1.28], color: ROBE });
      pb.box(0.095, 0.05, 0.32, { bone: 'hips', pos: [0.187 * k, 0.385, -0.02], color: BRONZE, trim: true });          // hem
    });
    pb.box(0.17, 0.52, 0.045, { bone: 'tabard', pos: [0, 0.72, 0.15], bottom: [1.15, 1], color: STOLE });
    pb.box(0.2, 0.05, 0.055, { bone: 'tabard', pos: [0, 0.465, 0.15], color: BRONZE_HI, trim: true });
    pb.extrude(STAR4(0.065), 0.02, { bone: 'tabard', pos: [0, 0.65, 0.178], color: GLYPH_MATTE });
    pb.box(0.4, 0.46, 0.05, { bone: 'coatB1', pos: [0, 0.78, -0.16], bottom: [1.15, 1], color: ROBE });
    pb.box(0.13, 0.42, 0.03, { bone: 'coatB1', pos: [0, 0.8, -0.192], bottom: [1.2, 1], color: STOLE });            // stole tails down the back
    pb.box(0.17, 0.05, 0.04, { bone: 'coatB1', pos: [0, 0.6, -0.195], color: BRONZE_HI, trim: true });
    pb.extrude(STAR4(0.07), 0.02, { bone: 'coatB1', pos: [0, 0.7, -0.21], color: GLYPH_MATTE });
    pb.box(0.46, 0.4, 0.05, { bone: 'coatB2', pos: [0, 0.37, -0.18], bottom: [1.25, 1], color: ROBE_D });
    pb.box(0.6, 0.05, 0.06, { bone: 'coatB2', pos: [0, 0.18, -0.18], color: BRONZE_HI, trim: true });

    // ================= waist: robe, rift-iron sash with a bronze star buckle
    pb.box(0.32, 0.22, 0.24, { bone: 'spine', pos: [0, 1.1, 0], color: ROBE });
    pb.box(0.15, 0.2, 0.04, { bone: 'spine', pos: [0, 1.12, 0.125], color: STOLE });
    pb.cyl(0.185, 0.185, 0.08, { bone: 'spine', pos: [0, 1.03, 0], radial: 8, color: RIFT_IRON });
    pb.extrude(STAR4(0.075), 0.035, { bone: 'spine', pos: [0, 1.03, 0.195], color: BRONZE_HI, trim: true });

    // ================= torso: violet coat, white stole + standing collar (top-plane identity)
    pb.box(0.4, 0.4, 0.27, { bone: 'chest', pos: [0, 1.34, 0], taper: [1.15, 1], color: ROBE });
    pb.box(0.16, 0.44, 0.04, { bone: 'chest', pos: [0, 1.3, 0.14], color: STOLE });
    for (const y of [1.3, 1.22]) pb.box(0.1, 0.04, 0.03, { bone: 'chest', pos: [0, y, 0.165], color: BRONZE_HI });
    pb.mirror((S, k) => pb.box(0.12, 0.06, 0.28, { bone: 'chest', pos: [0.13 * k, 1.535, 0], color: STOLE }));         // stole over the shoulders
    pb.cyl(0.17, 0.2, 0.16, { bone: 'chest', pos: [0, 1.56, -0.01], radial: 8, color: STOLE });                      // collar ring
    pb.box(0.38, 0.3, 0.055, { bone: 'chest', pos: [0, 1.68, -0.15], rot: [-0.3, 0, 0], bottom: [0.72, 1], color: STOLE });   // standing collar
    pb.mirror((S, k) => pb.box(0.055, 0.22, 0.17, { bone: 'chest', pos: [0.175 * k, 1.66, -0.07], rot: [-0.25, 0, -0.3 * k], color: STOLE }));  // collar wings
    pb.extrude(scaled(CROWN_PT, 1.7), 0.04, { bone: 'chest', pos: [0, 1.36, -0.14], rot: [0, PI, 0], color: BRONZE_HI, trim: true });   // Archive crest (back)
    pb.box(0.14, 0.2, 0.03, { bone: 'chest', pos: [0, 1.2, -0.14], color: STOLE });
    // Crownshard clasp (crown point + Arcane Prime gem) on the stole
    pb.extrude(scaled(CROWN_PT, 1.35), 0.04, { bone: 'shard', pos: [0, 1.42, 0.175], color: BRONZE_HI, trim: true });
    pb.sphere(0.052, { bone: 'shard', pos: [0, 1.425, 0.205], seg: [5, 3], color: ARCANE, emis: 2.6 });

    // ================= head: face, glowing eyes, white hair, top-knot + crown-pin
    pb.box(0.34, 0.35, 0.32, { bone: 'head', pos: [0, 1.755, 0.04], taper: [0.9, 0.92], color: SKIN });
    pb.box(0.065, 0.1, 0.075, { bone: 'head', pos: [0, 1.73, 0.215], taper: [0.8, 0.8], color: SKIN_D });          // nose
    pb.mirror((S, k) => {
      pb.box(0.075, 0.045, 0.03, { bone: 'head', pos: [0.08 * k, 1.78, 0.2], color: ARCANE_HI, emis: -1.6 });       // eyes
      pb.box(0.1, 0.04, 0.05, { bone: 'head', pos: [0.085 * k, 1.83, 0.2], rot: [0, 0, -0.2 * k], color: HAIR });   // brows
      pb.box(0.055, 0.26, 0.16, { bone: 'head', pos: [0.172 * k, 1.74, -0.01], color: HAIR });                     // side locks
    });
    pb.sphere(0.195, { bone: 'head', pos: [0, 1.88, 0.02], scale: [1, 0.62, 1.06], seg: [8, 3], thetaLength: PI / 2, color: HAIR });
    pb.box(0.32, 0.29, 0.075, { bone: 'head', pos: [0, 1.76, -0.13], color: HAIR });
    pb.sphere(0.135, { bone: 'head', pos: [0, 2.01, -0.05], scale: [1, 1.08, 1], seg: [7, 4], color: HAIR });         // top-knot
    pb.cyl(0.09, 0.11, 0.055, { bone: 'head', pos: [0, 1.905, -0.05], radial: 7, color: BRONZE });                   // bun band
    pb.box(0.36, 0.055, 0.055, { bone: 'head', pos: [0, 2.03, -0.05], rot: [0, 0, 0.35], color: BRONZE_HI, trim: true });   // crown-pin
    pb.extrude(STAR4(0.065), 0.035, { bone: 'head', pos: [0.175, 2.095, -0.05], color: ARCANE, emis: -2.0 });       // pin star

    // ================= arms: bronze shoulder caps, bell sleeves, white cuffs, big hands
    pb.mirror((S, k) => {
      limb(pb, [0.23 * k, 1.48, 0], [0.25 * k, 1.19, 0.01], 0.075, 0.068, { bone: 'arm' + S, color: ROBE });
      pb.sphere(0.115, { bone: 'arm' + S, pos: [0.245 * k, 1.5, 0], scale: [1.1, 0.7, 1.05], seg: [7, 3], thetaLength: PI / 2, color: BRONZE_HI, trim: true });
      pb.cyl(0.115, 0.1, 0.04, { bone: 'arm' + S, pos: [0.245 * k, 1.485, 0], scale: [1.1, 1, 1.05], radial: 7, color: BRONZE });
      limb(pb, [0.25 * k, 1.19, 0.01], [0.26 * k, 0.97, 0.02], 0.07, 0.118, { bone: 'fore' + S, color: ROBE });
      pb.cyl(0.125, 0.125, 0.05, { bone: 'fore' + S, pos: [0.26 * k, 0.975, 0.02], radial: 8, color: STOLE });
      pb.box(0.12, 0.13, 0.12, { bone: 'hand' + S, pos: [0.26 * k, 0.87, 0.03], taper: [1, 0.9], color: SKIN });
      pb.box(0.05, 0.07, 0.055, { bone: 'hand' + S, pos: [0.205 * k, 0.885, 0.075], color: SKIN_D });               // thumb
    });

    // ================= rift-key wand (hangs along the forearm line from the fist; star at the tip)
    pb.cyl(0.041, 0.034, 0.5, { bone: 'focus', pos: [-0.26, 0.61, 0.04], radial: 6, color: BRONZE });              // shaft y 0.86 → 0.36
    pb.cyl(0.055, 0.055, 0.05, { bone: 'focus', pos: [-0.26, 0.79, 0.04], radial: 6, color: BRONZE_HI, trim: true });   // collar
    pb.box(0.06, 0.1, 0.045, { bone: 'focus', pos: [-0.21, 0.47, 0.04], color: BRONZE_HI });                       // key bits
    pb.box(0.05, 0.06, 0.045, { bone: 'focus', pos: [-0.215, 0.55, 0.04], color: BRONZE_HI });
    pb.cyl(0.05, 0.03, 0.05, { bone: 'focus', pos: [-0.26, 0.375, 0.04], radial: 6, color: BRONZE_HI });            // tip cup
    pb.extrude(STAR4(0.1), 0.045, { bone: 'star', pos: STAR, color: ARCANE, emis: 2.8 });                           // MUZZLE

    // ================= floating tome (open V, rift-iron covers, gilt pages, hovering sigil)
    pb.mirror((S, c) => {
      const a = c * A_V;
      pb.box(0.28, 0.045, 0.37, { bone: 'tome' + S, pos: rz3(TOME, a, c * 0.14, 0, 0), rot: [0, 0, a], color: RIFT_IRON });
      pb.box(0.26, 0.05, 0.34, { bone: 'tome' + S, pos: rz3(TOME, a, c * 0.132, 0.046, 0), rot: [0, 0, a], color: GILT });
      for (const z of [-0.16, 0.16]) pb.box(0.065, 0.06, 0.065, { bone: 'tome' + S, pos: rz3(TOME, a, c * 0.25, 0.0, z), rot: [0, 0, a], color: BRONZE_HI, trim: true });
    });
    pb.cyl(0.04, 0.04, 0.39, { bone: 'tome', pos: [TOME[0], TOME[1] - 0.014, TOME[2]], rot: [PI / 2, 0, 0], radial: 6, color: BRONZE });
    pb.box(0.24, 0.035, 0.31, { bone: 'page', pos: rz3(TOME, -A_V, -0.128, 0.09, 0), rot: [0, 0, -A_V], color: GILT_HI });
    pb.box(0.035, 0.045, 0.29, { bone: 'page', pos: rz3(TOME, -A_V, -0.235, 0.09, 0), rot: [0, 0, -A_V], color: GILT_D });   // page edge
    pb.extrude(STAR4(0.095), 0.025, { bone: 'tome', pos: [TOME[0], TOME[1] + 0.17, TOME[2]], rot: [-PI / 2, 0, 0], color: ARCANE, emis: 2.4 });   // sigil

    // ================= the Shattered Halo: 3 bronze arcs + 3 crown points, 3 violet stars in the gaps
    // (modelled flat in the XY plane; the bone carries the back-tilt so the spin stays in the ring plane)
    const TH0 = PI / 2 - 0.8;
    for (let i = 0; i < 3; i++) {
      const a0 = TH0 + i * 2.094;
      pb.torus(HALO_R, 0.048, { bone: 'halo', pos: HALO, rot: [0, 0, a0], tubular: 4, radial: 6, arc: 1.6, color: BRONZE_HI, trim: true });
      const am = a0 + 0.8;
      pb.extrude(scaled(CROWN_PT, 1.45), 0.045, { bone: 'halo', pos: [HALO[0] + (HALO_R + 0.045) * cos(am), HALO[1] + (HALO_R + 0.045) * sin(am), HALO[2]], rot: [0, 0, am - PI / 2], color: BRONZE_HI, trim: true });
      const ag = a0 + 1.847;
      pb.extrude(STAR4(0.085), 0.045, { bone: 'haloStars', pos: [HALO[0] + HALO_R * cos(ag), HALO[1] + HALO_R * sin(ag), HALO[2]], rot: [0, 0, ag - PI / 2], color: ARCANE, emis: -2.2 });
    }

    // ================= orbiting glyph-stars (tilted up so the iso camera sees their face)
    for (let n = 1; n <= 3; n++) pb.extrude(STAR4(0.105), 0.04, { bone: 'glyph' + n, pos: [0, 0.92, 0.56], rot: [-0.6, 0, 0], color: ARCANE, emis: -1.8 });
  },

  animate(L, s, B, H) {
    const t = s.t, phi = s.walk, m = H.moving, act = H.act, k = H.k;
    const lower = H.standing, meter = H.meter;
    rest(L, B, REST_AR);
    L.scl(B.root, HERO_S);
    idle(L, s, B, H, IDLE);
    gait(L, s, B, H, GAIT, 'L');
    aimTwist(L, s, B, H);
    // gliding walk: the head floats level over the bob, the shoulders barely roll
    const sp = H.sp;
    L.add(B.head, -0.05 * m * sp, 0, 0);
    L.add(B.foreL, -0.12 * m, 0, 0);

    // ---- spin rates (integrated on the handle so a Chain change never makes the halo jump)
    let haloRate = 0.25 + 1.0 * meter, glyphRate = 1.2 * (1 + 2 * meter);
    let shut = 0, flip = 0, tomeS = 1, haloS = 1, starS = 1, haloLift = 0;

    // ---- idle fidgets: page flip (×2: three pages, the halo spins ×4) · reading up close (×1)
    if (H.fidget > 0 && act === '') {
      const f = H.fidget, w = smooth(f / 0.18) * (1 - smooth((f - 0.82) / 0.18));
      if (H.fidgetN % 3 !== 2) {
        applyKey(L, B, F_FLIP, w, w, 1);
        const ph = min(0.999, max(0, (f - 0.2) / 0.63)) * 3, fr = ph - Math.floor(ph);
        flip = f > 0.2 && f < 0.83 ? smooth(fr / 0.8) : 0;
        L.add(B.tome, 0, 0, 0.25 * sin(fr * PI) * w * (Math.floor(ph) & 1 ? -1 : 1));
        L.add(B.handL, 0, 0, -0.25 * sin(fr * PI) * w);
        haloRate *= 1 + 3 * w;
      } else {
        applyKey(L, B, F_READ, w, w, 1);
        L.add(B.head, 0.06 * sin(f * 5 * PI) * w, 0, 0);                  // reading nods
        flip = bump(f, 0.45, 0.75) > 0 ? smooth((f - 0.45) / 0.3) : 0;
        haloRate *= 1 + 1.5 * w;
      }
    }

    // ---- scribe stance + recoil: the wand flicks on 2 of 3 shots, every 3rd shot the tome fires
    const hold = H.hold;
    let tomeShot = 0;
    if (hold > 0) {
      applyKey(L, B, STANCE, hold, hold, lower);
      const sh = H.shot * hold;
      if (H.shotN % 3 === 0) {
        tomeShot = sh;
        const sg = (Math.floor(H.shotN / 3) & 1) ? -1 : 1;
        L.add(B.tome, 0.4 * sh, 0, 0.15 * sg * sh);
        L.mv(B.tome, 0, 0.02 * sh, 0.07 * sh);
        L.add(B.armL, -0.3 * sh, 0, 0); L.add(B.handL, -0.4 * sh, 0, 0);
        L.add(B.chest, 0, -0.08 * sh, 0);
        tomeS = 1 + 0.18 * sh;
        shut = -0.35 * sh;
        glyphRate *= 1 + sh;
      } else {
        L.add(B.focus, -0.4 * sh, 0, 0); L.add(B.foreR, 0.15 * sh, 0, 0); L.add(B.armR, -0.08 * sh, 0, 0);
        L.add(B.chest, 0, 0.06 * sh, 0);
        starS = 1 + 0.35 * sh;
      }
    }

    // ---- actions
    if (act === 'heavy') {
      const W2 = twoKey(k, 0.18, 0.36, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, H_RAISE, H_SWEEP, w1, w2, lower);
      haloS = 1 + 0.25 * w1 * (1 - w2) + 0.4 * w2;
      haloRate += 25 * bump(k, 0.16, 0.5);                                   // +3 rad flourish on the downbeat
      shut = -0.35 * w1 * (1 - w2) + w2;                                      // open overhead → clap shut
      tomeS = 1 + 0.2 * w1 * (1 - w2);
      starS = 1 + 0.3 * w1;
      haloLift = 0.06 * w1 * (1 - w2);
    } else if (act === 'throw') {
      const W2 = twoKey(k, 0.2, 0.35, 0.5), w1 = W2[0], w2 = W2[1];
      action2(L, B, T_WIND, T_PUSH, w1, w2, lower);
      shut = 0.55 * w1 * (1 - w2) - 0.4 * w2;
      tomeS = 1 + 0.25 * w2;
      haloS = 1 + 0.12 * w2;
    } else if (act === 'nova') {
      const W2 = twoKey(k, 0.25, 0.4, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, N_GATHER, N_BURST, w1, w2, lower);
      shut = 0.8 * w1 * (1 - w2) - 0.45 * w2;
      haloS = 1 - 0.15 * w1 * (1 - w2) + 0.4 * w2;
      haloRate += 6 * w2;
    } else if (act === 'channel') {
      applyKey(L, B, CHANNEL, 1, 1, lower);
      L.mv(B.hips, 0, 0.03 * sin(t * 3) * lower, 0);
      L.add(B.focus, 0.04 * sin(t * 23), 0, 0.12 * sin(t * 4.1));
      L.add(B.handL, 0, 0, 0.15 * sin(t * 3.3));
      const pc = (t * 1.6) % 1;
      flip = smooth(pc / 0.7);
      shut = -0.2;
      haloRate += 2.5;
      haloS = 1.12 + 0.05 * sin(t * 8);
      starS = 1.15 + 0.1 * sin(t * 9);
    } else if (act === 'arrive' || act === 'dash') {
      // k 0–0.19 is hidden by the controller (departure stretch, viewer only), crouch at the reveal,
      // unfold at k 0.36 (with the arrival burst), settle by k 1
      const W2 = twoKey(k, 0.19, 0.36, 0.48), w1 = W2[0], w2 = W2[1];
      action2(L, B, A_CROUCH, A_UNFOLD, w1, w2, 1);
      const dep = 1 - smooth(k / 0.15);
      L.scl(B.root, (1 + 0.15 * w1 * (1 - w2) - 0.05 * w2) * (1 - 0.4 * dep), (1 - 0.2 * w1 * (1 - w2) + 0.08 * w2) * (1 + 0.3 * dep), (1 + 0.15 * w1 * (1 - w2) - 0.05 * w2) * (1 - 0.4 * dep));
      haloS = 1 - 0.4 * w1 * (1 - w2) + 0.35 * w2;
      shut = w1 * (1 - w2) - 0.35 * w2;
      tomeS = 1 - 0.2 * w1 * (1 - w2) + 0.1 * w2;
      starS = 1 + 0.4 * w2;
      haloRate += 8 * w2;
    }

    // ---- secondary motion (bible §4.9; +rx swings a hanging part back)
    const Wd = wind(H);
    const vb = Wd.vb, vs = Wd.vs;
    const thL = L.get(B.thighL, 0), thR = L.get(B.thighR, 0);
    const thMin = min(thL, thR, 0), thMax = max(thL, thR, 0);
    // tabard: pushed forward by the leading thigh, never into the legs
    L.add(B.tabard, 0.85 * thMin + 0.1 * vb + 0.04 * sin(2 * phi) * m, 0, -0.2 * vs);
    // back coat: wind + kept clear of the trailing thigh; the lower panel lags (travelling wave)
    const coat = (Wd.back ? 0.04 : 0.1 + 0.35 * vb) + 0.05 * sin(2 * phi - 0.5) * m + 0.04 * sin(t * 2.1) * (1 - m);
    L.add(B.coatB1, max(coat, 0.8 * thMax), 0, 0.3 * vs);
    L.add(B.coatB2, 0.6 * coat + 0.08 * sin(2 * phi - 1.4) * m + 0.03 * sin(t * 2.1 - 0.6), 0, 0.18 * vs);
    // tome: floats and bobs, turns lazily, trails behind on the glide, lags the gait bob
    L.mv(B.tome, 0, 0.03 * sin(t * 1.8) + 0.5 * GAIT.bob * m * (abs(cos(phi - 0.7)) - abs(cos(phi))), -0.12 * m * sp);
    L.add(B.tome, 0.04 * sin(t * 1.1), 0.1 * sin(t * 0.7), 0.04 * sin(t * 1.3));
    L.scl(B.tome, tomeS);
    // covers: open V by default; shut = 1 closes the book, negative opens it wider
    L.add(B.tomeL, 0, 0, shut * CLOSE);
    L.add(B.tomeR, 0, 0, -shut * CLOSE);
    L.add(B.page, 0, 0, -flip * FLIP - shut * CLOSE);                       // the loose page rides the right cover
    // halo: turns (Chain speeds it up), bobs, leans back on the glide
    const h = s.h;
    let haloA, glyphA;
    if (h) {
      if (h._arcT === undefined) { h._arcT = t; h._arcHalo = t * haloRate; h._arcGlyph = t * glyphRate; }
      const dt = min(0.1, max(0, t - h._arcT));
      h._arcT = t;
      h._arcHalo += dt * haloRate; h._arcGlyph += dt * glyphRate;
      haloA = h._arcHalo; glyphA = h._arcGlyph;
    } else { haloA = t * haloRate; glyphA = t * glyphRate; }
    L.add(B.halo, -0.15 * m * sp, 0, haloA);
    L.mv(B.halo, 0, 0.015 * sin(t * 1.8 + 1) + haloLift, 0);
    L.scl(B.halo, haloS * (1 + 0.06 * meter));
    // gap stars flare outward and grow with Chain (Resonance at Chain ≥ 10 is visible on the body)
    L.scl(B.haloStars, 1 + 0.12 * meter + 0.22 * smooth((meter - 0.25) / 0.3) + 0.06 * sin(t * 3) * meter);
    // glyph-stars orbit the waist (×(1 + 2·meter)), bob, the orbit widens with Chain
    const gs = 1 + 0.2 * meter + 0.15 * tomeShot;
    L.add(B.glyph1, 0, glyphA, 0); L.add(B.glyph2, 0, glyphA + 2.094, 0); L.add(B.glyph3, 0, glyphA + 4.189, 0);
    L.mv(B.glyph1, 0, 0.05 * sin(t * 2), 0); L.mv(B.glyph2, 0, 0.05 * sin(t * 2 + 2.1), 0); L.mv(B.glyph3, 0, 0.05 * sin(t * 2 + 4.2), 0);
    L.scl(B.glyph1, gs); L.scl(B.glyph2, gs); L.scl(B.glyph3, gs);
    // wand star: slow twinkle-spin + breathing, kicks on each wand shot
    L.add(B.star, 0, t * 1.6, 0);
    L.scl(B.star, starS * (1 + 0.07 * sin(t * 4.3)));
    // Crownshard clasp pulses at 2 + 4·meter Hz
    const cp = sin(t * 2 * PI * (2 + 4 * meter));
    L.scl(B.shard, 1 + (0.04 + 0.1 * meter) * max(0, cp));

    stomp(L, B, H, 0.03);
    hit(L, s, B, null);
    if (s.hit > 0) {
      L.add(B.tabard, 0.15 * s.hit, 0, 0); L.add(B.coatB1, 0.2 * s.hit, 0, 0);
      L.mv(B.tome, 0, 0.04 * s.hit, -0.08 * s.hit); L.add(B.tome, 0, 0, 0.3 * s.hit);
      L.add(B.halo, 0.2 * s.hit, 0, 0);
    }

    // ---- death: stagger → rises limp (the tome drops to the ground) → sinks to the knees → recall
    if (act === 'death') {
      const wRise = smooth((k - 0.1) / 0.25), wSink = smooth((k - 0.5) / 0.22);
      applyKey(L, B, D_LIMP, wRise * (1 - wSink), wRise * (1 - wSink), 1);
      applyKey(L, B, D_KNEEL, wSink, wSink, 1);
      const fall = smooth((k - 0.2) / 0.22);
      const hy = 0.22 * wRise * (1 - wSink) - 0.4 * wSink;
      L.mv(B.tome, 0.06 * fall, -(1.02 + hy) * fall * fall, 0.08 * fall);
      L.add(B.tome, 0.35 * fall, 0, -0.28 * fall + 1.2 * bump(fall, 0.35, 1));
      L.add(B.tomeL, 0, 0, CLOSE * fall); L.add(B.tomeR, 0, 0, -CLOSE * fall); L.add(B.page, 0, 0, -CLOSE * fall);
      L.add(B.halo, 0.45 * wRise, 0, 0);
      L.mv(B.halo, 0, -0.08 * wSink, 0);
      deathCommon(L, B, k);
    } else if (act === 'victory') {
      // floats with arms open (halo ×1.3 spinning, tome opened wide overhead) → calm hovering loop
      const w1 = smooth(k / 0.15) * (1 - smooth((k - 0.55) / 0.3));
      const w2 = smooth((k - 0.55) / 0.3);
      action2(L, B, V_OPEN, V_CALM, w1, w2, 1);
      L.scl(B.halo, 1 + 0.3 * w1 + 0.08 * w2);
      L.add(B.halo, 0, 0, 5 * smooth(k / 0.6));                              // a fast extra turn on the burst
      L.add(B.tomeL, 0, 0, -0.6 * w1 - 0.15 * w2); L.add(B.tomeR, 0, 0, 0.6 * w1 + 0.15 * w2); L.add(B.page, 0, 0, 0.6 * w1 + 0.15 * w2);
      if (w2 > 0) {   // serene loop: slow hover, now and then a page turns
        L.mv(B.hips, 0, w2 * 0.03 * sin(t * 1.8), 0);
        L.add(B.head, w2 * 0.05 * sin(t * 0.9), 0, 0);
        const pc = (t / 2.6) % 1;
        L.add(B.page, 0, 0, -w2 * FLIP * smooth((pc - 0.6) / 0.3));
      }
    }
  },
});
