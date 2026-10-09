import * as THREE from 'three';
import { defineHero, pose, keys, twoKey, rest, idle, gait, aimTwist, wind, cloth, hit, deathCommon, stomp, smooth, bump } from './hero.js';

// =====================================================================================
//  CRYOMANCER — Stillwater Warden (design/research/09-hero-bible.md Appendix B, §4).
//  Tall, serene keeper of the Frost Prime: a WHITE TRIANGLE (fur hood + wide fur mantle with
//  ice pauldron spikes, flaring over a cobalt robe of three swinging panels), a rift-iron
//  cuirass with the Crownshard clasp, an ice tiara of three glowing prisms, and the
//  STILLWATER CROOK in the right hand: a tall rift-iron staff whose bronze claw holds a big
//  glowing HEXAGONAL crystal (the UI frost shape). Up to three hexagonal Frost Armor shards
//  orbit the body, one per armor charge (they pop in with an overshoot when gained).
//
//  The staff stays vertical however the arm moves: the focus bone counter-rotates the whole
//  arm chain (bible §4.2), then a "world" tilt is applied on top (lance, thrust, slide...).
//
//  Model space, faces +Z, left = +X. Rotation signs (XYZ euler): +x pitches an upright segment's
//  top forward / swings a hanging part back; +y turns toward +X; +z moves a hanging limb toward +X
//  (an upright segment with +z leans toward −X). Torso entries of the key poses are ADDITIVE
//  (they never cancel the aim twist); limb entries blend to absolute keys (put).
// =====================================================================================

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
const TAU = PI * 2;

// ---- shared Crownforge palette (bible §0)
const RIFT_IRON = 0x3a3350, RIFT_IRON_HI = 0x5a4f78;
const BRONZE_LO = 0x6e5232, BRONZE = 0xa07a48, BRONZE_HI = 0xc8a874;
const LEATHER_D = 0x2e2020;
const FROST = 0x7fe0ff, FROST_HI = 0xe2f8ff;
// ---- Stillwater palette (Appendix B). Whites kept ≤ ~0.85 albedo so they never bloom.
const FUR = 0xdce5ec, FUR_SH = 0xb6c7d4;
const ROBE = 0x2a4d8e, ROBE_D = 0x213a6a;
const SASH = 0xc4d2de;
const CRYSTAL = 0xbfeaff;
const SKIN = 0xdcae94, SKIN_D = 0xc4927a;
const HAIR = 0xd2dbe4;

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
// the Crownforge crown point (design/UI.md --orn-crown)
const CROWN_PT = [[-0.08, -0.05], [0.08, -0.05], [0.08, 0.025], [0.045, 0], [0, 0.065], [-0.045, 0], [-0.08, 0.025]];
// hexagon outline (flat top), radius r
const HEX = (r) => { const p = []; for (let i = 0; i < 6; i++) { const a = i * PI / 3; p.push([r * cos(a), r * sin(a)]); } return p; };

// ---- bones (Appendix B, 29)
const HERO_S = 1.05;                      // whole-body scale: tiara 2.37 m, crystal 2.38 m — the tallest humanoid
const SX = -0.33, SZ = 0.06;              // staff axis (x, z) at rest
const CRY_Y = 1.95;                       // crystal centre
const ARM_R = 0.7, ARM_Y = 1.08;          // Frost Armor orbit radius / height (glows against the cobalt robe)
const MANTLE_GAP = 0.6;                   // half-angle of the cloak's front opening
const REST_SLIDE = -0.09;                 // the staff butt rests on the ground
const HOOD_CAP = 0.95, HOOD_GAP = 0.62;   // hood: closed cap down to θ 0.95, then a front opening of ±0.62 rad
const BONES = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 0.90, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 1.02, 0] },
  { name: 'chest', parent: 'spine', pivot: [0, 1.24, 0] },
  { name: 'head', parent: 'chest', pivot: [0, 1.60, 0.03] },
  { name: 'crown', parent: 'head', pivot: [0, 1.93, 0.07] },
  { name: 'armL', parent: 'chest', pivot: [0.29, 1.50, 0] },
  { name: 'foreL', parent: 'armL', pivot: [0.31, 1.20, 0.01] },
  { name: 'handL', parent: 'foreL', pivot: [0.32, 0.94, 0.02] },
  { name: 'armR', parent: 'chest', pivot: [-0.29, 1.50, 0] },
  { name: 'foreR', parent: 'armR', pivot: [-0.31, 1.20, 0.01] },
  { name: 'handR', parent: 'foreR', pivot: [-0.32, 0.94, 0.04] },
  { name: 'focus', parent: 'handR', pivot: [SX, 0.90, SZ] },          // staff grip
  { name: 'crystal', parent: 'focus', pivot: [SX, CRY_Y, SZ] },
  { name: 'thighL', parent: 'hips', pivot: [0.12, 0.88, 0] },
  { name: 'shinL', parent: 'thighL', pivot: [0.125, 0.48, 0.01] },
  { name: 'footL', parent: 'shinL', pivot: [0.13, 0.10, 0.02] },
  { name: 'thighR', parent: 'hips', pivot: [-0.12, 0.88, 0] },
  { name: 'shinR', parent: 'thighR', pivot: [-0.125, 0.48, 0.01] },
  { name: 'footR', parent: 'shinR', pivot: [-0.13, 0.10, 0.02] },
  { name: 'skirtL', parent: 'hips', pivot: [0.12, 0.95, 0.06] },
  { name: 'skirtR', parent: 'hips', pivot: [-0.12, 0.95, 0.06] },
  { name: 'skirtB', parent: 'hips', pivot: [0, 0.95, -0.12] },
  { name: 'cape1', parent: 'chest', pivot: [0, 1.48, -0.20] },
  { name: 'cape2', parent: 'cape1', pivot: [0, 0.98, -0.27] },
  { name: 'armor1', pivot: [0, ARM_Y, 0] },                            // Frost Armor orbiters (parent root)
  { name: 'armor2', pivot: [0, ARM_Y, 0] },
  { name: 'armor3', pivot: [0, ARM_Y, 0] },
  { name: 'shard', parent: 'chest', pivot: [0, 1.4, 0.22] },
];

// ---- gait (bible §4.4): long calm glide, the staff arm barely swings
const GAIT = { A: 0.6, K: 0.8, bob: 0.035, lean: 0.08, arm: 0.35, hy: 0.06, focusArm: 0.3 };
const IDLE = { a: 0.015, f: 1.2, sway: 0.5 };

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
      if (B[n] === undefined) throw new Error(`cryomancer pose: unknown bone "${n}"`);
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
// one key = absolute limb pose (put) + additive torso deltas + staff (world tilt x, tilt z, slide m)
const key2 = (put, add, staff = null) => ({ put: pose(put), add: dpose(add), st: staff });
// staff accumulator (module scratch: animate is synchronous, no allocation)
const ST = { x: 0, z: 0, slide: 0 };
function staffKey(K, w) {
  if (!K.st || w <= 0) return;
  ST.x += (K.st[0] - ST.x) * w; ST.z += (K.st[1] - ST.z) * w; ST.slide += (K.st[2] - ST.slide) * w;
}
function applyKey(L, B, K, wPut, wAdd, lowerW) {
  keys(L, B, K.put, wPut, lowerW);
  addK(L, B, K.add, wAdd, lowerW);
  staffKey(K, wPut);
}
// two-key action: limbs blend K1 → K2; torso deltas cross-fade (never sum)
function action2(L, B, K1, K2, w1, w2, lowerW) {
  keys(L, B, K1.put, w1, lowerW);
  keys(L, B, K2.put, w2, lowerW);
  addK(L, B, K1.add, w1 * (1 - w2), lowerW);
  addK(L, B, K2.add, w2, lowerW);
  staffKey(K1, w1);
  staffKey(K2, w2);
}

// ---- rest additions (bible §4.2): staff hand a little forward, left forearm across the waist
const REST_CR = pose({
  armR: [-0.12, 0, 0.0], foreR: [-0.3, 0, 0],
  armL: [-0.25, -0.35, -0.02], foreL: [-1.05, 0, 0], handL: [0.1, 0, 0],
  head: [0.02, 0, 0],
});

// ---- starter LANCE stance (bible §4.6): staff tilts ~60° forward, crystal leads; left palm open
const STANCE = key2(
  { armR: [-1.0, 0, -0.12], foreR: [-0.35, 0, 0], handR: [0, 0, 0], armL: [-1.15, 0.1, 0.3], foreL: [-0.25, 0, 0], handL: [-0.5, 0, 0] },
  { chest: [0, 0.15, 0], spine: [0.06, 0, 0], head: [0.02, -0.08, 0] },
  [0.85, 0, 0],
);

// ---- fidgets: staff tap (×2) and crystal gaze (×1)
const F_TAP = key2(
  { armR: [-0.42, 0, -0.08], foreR: [-0.55, 0, 0] },
  { head: [0.06, 0, 0] },
  [0, 0, 0.08],
);
const F_GAZE = key2(
  { armR: [-0.75, 0.35, 0.05], foreR: [-1.05, 0, 0], armL: [-0.95, -0.5, -0.15], foreL: [-1.25, 0, 0], handL: [-0.3, 0, 0] },
  { head: [-0.12, -0.35, 0.12], spine: [-0.04, 0, 0], chest: [0, -0.12, 0] },
  [0.15, -0.3, 0.12],
);

// ---- heavy: STILLWATER PLANT (staff raised overhead → butt strikes the ground)
const H_RAISE = key2(
  { armR: [-2.6, 0, -0.15], foreR: [-0.3, 0, 0], armL: [-2.25, -0.2, 0.15], foreL: [-0.5, 0, 0], handL: [-0.2, 0, 0] },
  { spine: [-0.22, 0, 0], head: [-0.2, 0, 0], 'hips.m': [0, 0.05, 0] },
  [0, 0, 0.1],
);
const H_PLANT = key2(
  { armR: [-0.75, 0, -0.1], foreR: [-0.55, 0, 0], armL: [-0.55, 0, 0.9], foreL: [-0.4, 0, 0], handL: [-0.3, 0, 0],
    thighL: [-0.15, 0, 0.28], thighR: [0.05, 0, -0.28], shinL: [0.55, 0, 0], shinR: [0.55, 0, 0], footL: [-0.3, 0, -0.25], footR: [-0.4, 0, 0.25] },
  { spine: [0.32, 0, 0], head: [-0.1, 0, 0], 'hips.m': [0, -0.12, 0] },
  [0, 0, -0.07],
);

// ---- throw: STAFF THRUST (wind back → lunge, crystal at the target)
const T_WIND = key2(
  { armR: [0.35, 0, -0.45], foreR: [-1.1, 0, 0], armL: [-0.9, 0, 0.3], foreL: [-0.6, 0, 0], handL: [-0.4, 0, 0] },
  { chest: [0, -0.5, 0], spine: [-0.1, 0, 0], head: [0, 0.3, 0] },
  [-0.55, 0, 0],
);
const T_THRUST = key2(
  { armR: [-1.55, 0, -0.08], foreR: [-0.05, 0, 0], armL: [-0.2, 0, 0.55], foreL: [-0.5, 0, 0],
    thighL: [-0.45, 0, 0.08], shinL: [0.3, 0, 0], thighR: [0.3, 0, -0.08], shinR: [0.35, 0, 0] },
  { chest: [0, 0.45, 0], spine: [0.2, 0, 0], head: [0, -0.3, 0], 'hips.m': [0, -0.05, 0.04] },
  [1.4, 0, 0],
);

// ---- nova: gather (staff hugged, crouch) → burst (arms flung out, robes flare)
const N_GATHER = key2(
  { armL: [-1.0, 0, -0.55], armR: [-0.9, 0, 0.35], foreL: [-1.4, 0, 0], foreR: [-1.2, 0, 0],
    thighL: [-0.4, 0, 0.1], thighR: [-0.4, 0, -0.1], shinL: [0.8, 0, 0], shinR: [0.8, 0, 0], footL: [-0.4, 0, 0], footR: [-0.4, 0, 0] },
  { spine: [0.42, 0, 0], head: [0.15, 0, 0], 'hips.m': [0, -0.17, 0] },
  [0, 0, 0],
);
const N_BURST = key2(
  { armL: [-0.4, 0, 1.55], armR: [-0.4, 0, -1.35], foreL: [-0.2, 0, 0], foreR: [-0.3, 0, 0], handL: [0.4, 0, 0] },
  { spine: [-0.3, 0, 0], head: [-0.3, 0, 0], 'hips.m': [0, 0.06, 0], cape1: [0.5, 0, 0], cape2: [0.3, 0, 0], skirtB: [0.35, 0, 0], skirtL: [-0.3, 0, 0.3], skirtR: [-0.3, 0, -0.3] },
  [0, 0, 0],
);

// ---- channel: staff held upright before the chest in both hands
const CHANNEL = key2(
  { armR: [-0.9, 0.35, 0.05], foreR: [-1.05, 0, 0], armL: [-0.85, -0.55, -0.25], foreL: [-1.3, 0, 0], handL: [-0.2, 0, 0] },
  { spine: [-0.08, 0, 0], head: [-0.15, 0, 0], cape1: [-0.15, 0, 0] },
  [0, 0, 0.06],
);

// ---- Glacial Slide: side-on ICE-SURF, the crystal trails low behind → rise + staff tap
const D_SURF = key2(
  { thighL: [-0.3, 0, 0.4], thighR: [0.3, 0, -0.4], shinL: [0.7, 0, 0], shinR: [0.7, 0, 0], footL: [-0.4, 0, -0.3], footR: [-0.5, 0, 0.3],
    armL: [-1.25, 0, 0.6], foreL: [-0.3, 0, 0], handL: [-0.3, 0, 0], armR: [-0.1, 0, -0.95], foreR: [-0.2, 0, 0] },
  { hips: [0, 1.1, 0], chest: [0, -0.4, 0], spine: [0.25, 0, 0], head: [0.05, -0.55, 0], 'hips.m': [0, -0.2, 0] },
  [-1.15, 0.35, 0],
);
const D_RISE = key2(
  { armR: [-0.55, 0, -0.1], foreR: [-0.6, 0, 0], armL: [-0.5, 0, 0.45], foreL: [-0.6, 0, 0],
    thighL: [-0.25, 0, 0.1], shinL: [0.3, 0, 0], thighR: [0.15, 0, -0.1], shinR: [0.3, 0, 0] },
  { spine: [0.08, 0, 0], 'hips.m': [0, -0.06, 0] },
  [0, 0, -0.05],
);

// ---- arrive (after a blink, if ever used): land in a crouch
const ARRIVE = key2(
  { thighL: [-0.5, 0, 0.1], thighR: [-0.5, 0, -0.1], shinL: [1.0, 0, 0], shinR: [1.0, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0], armL: [0.4, 0, 0.5], armR: [-0.5, 0, -0.5] },
  { spine: [0.35, 0, 0], head: [-0.2, 0, 0], 'hips.m': [0, -0.16, 0] },
  [0, 0, 0],
);

// ---- death: lean on the planted staff → kneel beside it (then common slump + Rift recall)
const D_LEAN = key2(
  { armR: [-1.25, 0, -0.05], foreR: [-0.45, 0, 0], armL: [0.15, 0, 0.25], foreL: [-0.4, 0, 0],
    thighL: [-0.2, 0, 0.05], shinL: [0.35, 0, 0], thighR: [0.15, 0, -0.05], shinR: [0.45, 0, 0] },
  { spine: [0.5, 0, 0], head: [0.25, 0, 0], 'hips.m': [0, -0.08, 0] },
  [0.2, 0, -0.25],
);
const D_KNEEL = key2(
  { thighL: [-1.4, 0, 0.12], shinL: [1.35, 0, 0], footL: [0.05, 0, -0.1], thighR: [0.15, 0, -0.12], shinR: [1.7, 0, 0], footR: [-0.75, 0, 0.1],
    armR: [-1.55, 0, -0.1], foreR: [-0.35, 0, 0], armL: [-0.2, 0, 0.3], foreL: [-0.8, 0, 0] },
  { spine: [0.45, 0, 0], head: [0.2, 0, 0], 'hips.m': [0, -0.42, 0.04] },
  [0.1, 0, -0.42],
);

// ---- victory: plant the staff and bow → calm loop with the staff planted
const V_BOW = key2(
  { armR: [-0.85, 0, -0.08], foreR: [-0.75, 0, 0], armL: [-0.75, -0.55, -0.1], foreL: [-1.65, 0, 0], handL: [-0.1, 0, 0] },
  { head: [0.4, 0, 0], spine: [0.18, 0, 0] },
  [0, 0, -0.2],
);
const V_CALM = key2(
  { armR: [-0.7, 0.1, -0.1], foreR: [-0.75, 0, 0], armL: [-0.2, 0, 0.3], foreL: [-0.45, 0, 0], handL: [0.15, 0, 0],
    thighL: [0, 0, 0.08], thighR: [0, 0, -0.08], footL: [0, 0, -0.08], footR: [0, 0, 0.08] },
  { spine: [-0.06, 0, 0], head: [-0.1, 0.1, 0] },
  [0, 0, -0.2],
);

const DASH_SPLIT = 0.2 / 0.35;   // surf while the slide runs (0.2 s of 0.35 s), then the rise

// Frost Armor pop (stateless writer, per-hero timers stashed on the channel object H once)
function armorPop(H, t) {
  const a = H.armor | 0;
  if (H.cryoArmor === undefined) { H.cryoArmor = a; H.cryoPop1 = H.cryoPop2 = H.cryoPop3 = -9; }
  if (a > H.cryoArmor) {
    if (a >= 1 && H.cryoArmor < 1) H.cryoPop1 = t;
    if (a >= 2 && H.cryoArmor < 2) H.cryoPop2 = t;
    if (a >= 3 && H.cryoArmor < 3) H.cryoPop3 = t;
  }
  H.cryoArmor = a;
}
// 0 → 1.3 (0.12 s) → 1 (0.14 s)
function popS(dt) {
  if (dt < 0) return 1;
  if (dt < 0.12) return 1.3 * smooth(dt / 0.12);
  if (dt < 0.26) return 1.3 - 0.3 * smooth((dt - 0.12) / 0.14);
  return 1;
}

export const cryomancerHero = defineHero({
  id: 'heroCryomancer',
  bones: BONES,
  stride: 1.85 * HERO_S,
  blob: 0.66,
  gait: GAIT,
  castHands: 'R',
  muzzle: { bone: 'crystal', at: [SX, CRY_Y, SZ] },
  hand: { bone: 'handL', at: [0.32, 0.86, 0.06] },
  emitters: {
    crystal: { bone: 'crystal', at: [SX, CRY_Y, SZ] },          // crystal heart (= muzzle)
    tip: { bone: 'crystal', at: [SX, 2.27, SZ] },                // crystal point
    butt: { bone: 'focus', at: [SX, 0.02, SZ] },                 // staff butt (frost ring on tap / plant / slide exit)
    hem: { bone: 'hips', at: [0, 0.18, 0] },                     // hem ring centre (r 0.42 · scale) for frost motes
    mouth: { bone: 'head', at: [0, 1.7, 0.27] },                 // breath puffs
    tiara: { bone: 'crown', at: [0, 2.22, 0.27] },               // front prism tip
    clasp: { bone: 'shard', at: [0, 1.4, 0.27] },
    armor1: { bone: 'armor1', at: [0, ARM_Y, ARM_R] },            // Frost Armor shards (shatter fx)
    armor2: { bone: 'armor2', at: [0, ARM_Y, ARM_R] },
    armor3: { bone: 'armor3', at: [0, ARM_Y, ARM_R] },
    footL: { bone: 'footL', at: [0.13, 0.02, 0.06] },            // rime footprints
    footR: { bone: 'footR', at: [-0.13, 0.02, 0.06] },
  },

  build(pb) {
    // ================= legs (mostly under the robe: rift-iron greaves + boots show in the gaps)
    pb.mirror((S, k) => {
      limb(pb, [0.12 * k, 0.9, 0], [0.125 * k, 0.48, 0.01], 0.105, 0.09, { bone: 'thigh' + S, color: ROBE_D });
      limb(pb, [0.125 * k, 0.48, 0.01], [0.13 * k, 0.12, 0.02], 0.095, 0.085, { bone: 'shin' + S, color: RIFT_IRON });
      pb.sphere(0.08, { bone: 'shin' + S, pos: [0.125 * k, 0.47, 0.07], seg: [5, 3], color: BRONZE });
      pb.cyl(0.11, 0.105, 0.07, { bone: 'shin' + S, pos: [0.13 * k, 0.2, 0.015], radial: 7, color: FUR_SH });      // fur boot cuff
      pb.box(0.16, 0.13, 0.3, { bone: 'foot' + S, pos: [0.13 * k, 0.065, 0.06], taper: [0.9, 0.85], color: RIFT_IRON });
      pb.box(0.16, 0.06, 0.08, { bone: 'foot' + S, pos: [0.13 * k, 0.035, 0.2], color: RIFT_IRON_HI });             // toe cap
      pb.box(0.17, 0.04, 0.31, { bone: 'foot' + S, pos: [0.13 * k, 0.02, 0.06], color: LEATHER_D });               // sole
    });

    // ================= hips / robe: three swinging panels (L, R front; back) + fixed side panels
    pb.box(0.4, 0.18, 0.3, { bone: 'hips', pos: [0, 0.92, 0], color: ROBE_D });
    pb.mirror((S, k) => {
      pb.box(0.25, 0.74, 0.07, { bone: 'skirt' + S, pos: [0.135 * k, 0.57, 0.08], bottom: [1.5, 1.1], shift: [-0.01 * k, 0], color: ROBE });
      pb.box(0.38, 0.075, 0.11, { bone: 'skirt' + S, pos: [0.16 * k, 0.2, 0.085], color: FUR });                      // snow hem
      pb.box(0.045, 0.6, 0.05, { bone: 'skirt' + S, pos: [0.02 * k, 0.6, 0.12], color: BRONZE_LO });              // inner edge trim
      pb.box(0.08, 0.74, 0.3, { bone: 'hips', pos: [0.28 * k, 0.6, -0.03], rot: [0, 0, 0.17 * k], bottom: [1, 1.2], color: ROBE_D });
      pb.box(0.11, 0.075, 0.36, { bone: 'hips', pos: [0.345 * k, 0.25, -0.03], rot: [0, 0, 0.17 * k], color: FUR_SH });
    });
    pb.box(0.56, 0.76, 0.07, { bone: 'skirtB', pos: [0, 0.57, -0.13], bottom: [1.4, 1], color: ROBE });
    pb.box(0.8, 0.075, 0.11, { bone: 'skirtB', pos: [0, 0.2, -0.13], color: FUR });

    // ================= torso: rift-iron cuirass, breastplate, sash + Crownshard clasp
    pb.box(0.46, 0.42, 0.32, { bone: 'chest', pos: [0, 1.34, 0], taper: [1.1, 1.0], color: RIFT_IRON });
    pb.box(0.34, 0.3, 0.05, { bone: 'chest', pos: [0, 1.31, 0.165], taper: [1.05, 1], bottom: [0.8, 1], color: RIFT_IRON_HI });
    pb.box(0.36, 0.05, 0.06, { bone: 'chest', pos: [0, 1.17, 0.165], color: BRONZE_HI, trim: true });
    pb.box(0.42, 0.2, 0.3, { bone: 'spine', pos: [0, 1.1, 0], color: ROBE });
    pb.cyl(0.24, 0.24, 0.09, { bone: 'spine', pos: [0, 1.03, 0], radial: 8, color: SASH });                          // sash
    pb.box(0.11, 0.11, 0.07, { bone: 'spine', pos: [0.11, 1.03, 0.22], color: SASH });                                // sash knot
    pb.box(0.08, 0.22, 0.05, { bone: 'spine', pos: [0.14, 0.9, 0.23], rot: [0, 0, 0.15], color: SASH });             // knot tail
    pb.box(0.05, 0.16, 0.04, { bone: 'chest', pos: [0, 1.25, 0.2], color: BRONZE_LO });                              // breastplate ridge

    // ================= fur cloak + ice pauldrons (the white top plane), open in a Λ over the cuirass
    pb.geo(new THREE.CylinderGeometry(0.22, 0.53, 0.3, 10, 1, false, MANTLE_GAP, TAU - 2 * MANTLE_GAP), { bone: 'chest', pos: [0, 1.5, -0.03], color: FUR, flat: false });
    pb.geo(new THREE.CylinderGeometry(0.535, 0.5, 0.05, 10, 1, false, MANTLE_GAP, TAU - 2 * MANTLE_GAP), { bone: 'chest', pos: [0, 1.335, -0.03], color: FUR_SH, flat: false });
    pb.mirror((S, k) => {
      // lapels along the opening (hide the cut, frame the breastplate)
      limb(pb, [0.124 * k, 1.66, 0.155], [0.3 * k, 1.33, 0.41], 0.055, 0.065, { bone: 'chest', radial: 6, color: FUR });
    });
    // Crownshard clasp on the breastplate, framed by the cloak's Λ (crown point ×1.45 holding the Frost Prime gem)
    pb.extrude(CROWN_PT.map(([x, y]) => [x * 1.45, y * 1.45]), 0.04, { bone: 'shard', pos: [0, 1.4, 0.21], color: BRONZE_HI, trim: true });
    pb.sphere(0.055, { bone: 'shard', pos: [0, 1.405, 0.24], seg: [6, 3], color: FROST, emis: 2.6 });
    pb.mirror((S, k) => {
      pb.sphere(0.2, { bone: 'chest', pos: [0.36 * k, 1.5, -0.02], scale: [1.35, 0.62, 1.15], rot: [0, 0, -0.22 * k], seg: [8, 5], color: FUR, flat: false });
      ptCone(pb, [0.4 * k, 1.56, -0.06], [0.68 * k, 1.8, -0.14], 0.08, { bone: 'chest', color: CRYSTAL });         // big ice spike
      ptCone(pb, [0.38 * k, 1.57, 0.07], [0.54 * k, 1.74, 0.15], 0.058, { bone: 'chest', color: CRYSTAL });         // small ice spike
    });

    // ================= cape: white upper, cobalt lower, fur hem, bronze hex sigil (the frost shape)
    pb.box(0.66, 0.54, 0.07, { bone: 'cape1', pos: [0, 1.24, -0.25], bottom: [1.12, 1], color: FUR_SH });
    // lower cape: a cobalt shield-point with a white fur hem along the V
    pb.extrude([[-0.37, 0.3], [0.37, 0.3], [0.44, -0.2], [0, -0.4], [-0.44, -0.2]], 0.06, { bone: 'cape2', pos: [0, 0.7, -0.3], color: ROBE_D });
    pb.mirror((S, k) => {
      limb(pb, [0.46 * k, 0.5, -0.3], [0, 0.29, -0.3], 0.05, 0.05, { bone: 'cape2', radial: 5, color: FUR });
    });
    pb.extrude(HEX(0.12), 0.04, { bone: 'cape2', pos: [0, 0.76, -0.34], color: BRONZE_HI, trim: true });
    pb.extrude(HEX(0.065), 0.03, { bone: 'cape2', pos: [0, 0.76, -0.365], color: ROBE });

    // ================= head: pale face, frost eyes, silver fringe, deep fur hood
    // parka hood: a big round fur hood, the pale face peeking out of a thick fur ruff
    pb.box(0.28, 0.3, 0.28, { bone: 'head', pos: [0, 1.76, 0.1], taper: [0.94, 0.95], color: SKIN });
    pb.box(0.07, 0.075, 0.06, { bone: 'head', pos: [0, 1.735, 0.265], color: SKIN_D });                               // nose
    pb.box(0.3, 0.1, 0.08, { bone: 'head', pos: [0, 1.895, 0.2], rot: [-0.25, 0, 0], color: HAIR });                // silver fringe
    pb.mirror((S, k) => {
      pb.box(0.07, 0.065, 0.03, { bone: 'head', pos: [0.08 * k, 1.785, 0.245], color: FROST, emis: -2.4 });         // frost eyes
      pb.box(0.09, 0.035, 0.04, { bone: 'head', pos: [0.08 * k, 1.835, 0.245], rot: [0, 0, 0.25 * k], color: HAIR }); // brows
      pb.box(0.06, 0.2, 0.07, { bone: 'head', pos: [0.13 * k, 1.7, 0.2], color: HAIR });                            // side locks
    });
    // hood: a closed cap + a lower shell open at the front in a U around the face
    pb.geo(new THREE.SphereGeometry(0.255, 10, 3, 0, TAU, 0, HOOD_CAP), { bone: 'head', pos: [0, 1.8, -0.03], scale: [0.98, 1.04, 1], color: FUR, flat: false });
    pb.geo(new THREE.SphereGeometry(0.255, 10, 4, PI / 2 + HOOD_GAP, TAU - 2 * HOOD_GAP, HOOD_CAP, PI - HOOD_CAP), { bone: 'head', pos: [0, 1.8, -0.03], scale: [0.98, 1.04, 1], color: FUR, flat: false });

    // ================= ice tiara (crown bone): bronze circlet round the hood, a crown of ice prisms
    pb.torus(0.238, 0.032, { bone: 'crown', pos: [0, 1.93, -0.015], rot: [PI / 2 - 0.12, 0, 0], tubular: 3, radial: 10, color: BRONZE_HI, trim: true });
    pb.cyl(0.07, 0.07, 0.2, { bone: 'crown', pos: [0, 2.03, 0.23], radial: 6, color: CRYSTAL });
    pb.cone(0.07, 0.13, { bone: 'crown', pos: [0, 2.195, 0.23], radial: 6, color: FROST, emis: -2.2 });
    pb.mirror((S, k) => {
      pb.cyl(0.054, 0.054, 0.15, { bone: 'crown', pos: [0.165 * k, 2.0, 0.165], rot: [0.1, 0, -0.32 * k], radial: 6, color: CRYSTAL });
      pb.cone(0.054, 0.09, { bone: 'crown', pos: [0.2 * k, 2.115, 0.177], rot: [0.1, 0, -0.32 * k], radial: 6, color: FROST, emis: -1.5 });
      ptCone(pb, [0.18 * k, 1.95, -0.17], [0.25 * k, 2.1, -0.25], 0.045, { bone: 'crown', color: CRYSTAL });       // back prisms (matte)
    });

    // ================= arms: bell sleeves, fur cuffs, rift-iron gauntlets
    pb.mirror((S, k) => {
      limb(pb, [0.29 * k, 1.5, 0], [0.31 * k, 1.2, 0.01], 0.095, 0.085, { bone: 'arm' + S, color: ROBE });
      limb(pb, [0.31 * k, 1.2, 0.01], [0.32 * k, 0.99, 0.02], 0.09, 0.135, { bone: 'fore' + S, color: ROBE });
      pb.cyl(0.145, 0.145, 0.07, { bone: 'fore' + S, pos: [0.32 * k, 0.99, 0.02], radial: 7, color: FUR });
      pb.box(0.15, 0.15, 0.15, { bone: 'hand' + S, pos: [0.32 * k, 0.87, 0.04], color: RIFT_IRON });
      pb.box(0.155, 0.05, 0.16, { bone: 'hand' + S, pos: [0.32 * k, 0.92, 0.04], color: RIFT_IRON_HI });          // knuckle plate
    });

    // ================= the Stillwater Crook (staff vertical at rest; grip = focus pivot)
    pb.cyl(0.042, 0.048, 1.62, { bone: 'focus', pos: [SX, 0.93, SZ], radial: 6, color: RIFT_IRON_HI });             // y 0.12–1.74
    pb.cyl(0.056, 0.056, 0.22, { bone: 'focus', pos: [SX, 0.9, SZ], radial: 6, color: LEATHER_D });                // grip wrap
    pb.cyl(0.06, 0.06, 0.05, { bone: 'focus', pos: [SX, 0.17, SZ], radial: 6, color: BRONZE });                      // ferrule
    pb.cone(0.05, 0.13, { bone: 'focus', pos: [SX, 0.08, SZ], rot: [PI, 0, 0], radial: 6, color: BRONZE });         // butt spike
    pb.cyl(0.07, 0.07, 0.05, { bone: 'focus', pos: [SX, 1.45, SZ], radial: 6, color: BRONZE_LO });                  // shaft ring
    pb.cyl(0.085, 0.052, 0.1, { bone: 'focus', pos: [SX, 1.76, SZ], radial: 6, color: BRONZE, trim: true });          // claw collar
    for (let i = 0; i < 3; i++) {                                                                                      // bronze claw prongs
      const a = i * TAU / 3 + PI / 6;
      const ca = cos(a), sa = sin(a);
      ptCone(pb, [SX + 0.06 * sa, 1.78, SZ + 0.06 * ca], [SX + 0.17 * sa, 2.06, SZ + 0.17 * ca], 0.045, { bone: 'focus', radial: 4, color: BRONZE_HI, trim: true });
    }
    // the hexagonal crystal: matte-lit body, blooming tip (both take the last-cast element)
    pb.cyl(0.14, 0.14, 0.24, { bone: 'crystal', pos: [SX, CRY_Y, SZ], radial: 6, color: CRYSTAL, emis: 1.0 });
    pb.cone(0.14, 0.2, { bone: 'crystal', pos: [SX, CRY_Y + 0.22, SZ], radial: 6, color: FROST, emis: 2.4 });
    pb.cone(0.14, 0.1, { bone: 'crystal', pos: [SX, CRY_Y - 0.17, SZ], rot: [PI, 0, 0], radial: 6, color: CRYSTAL, emis: 1.0 });

    // ================= Frost Armor shards (hidden by scale 0 until earned): hexagonal ice prisms
    for (let n = 1; n <= 3; n++) {
      const o = { bone: 'armor' + n, radial: 6 };
      pb.cyl(0.075, 0.075, 0.16, { ...o, pos: [0, ARM_Y, ARM_R], color: CRYSTAL });
      pb.cone(0.075, 0.11, { ...o, pos: [0, ARM_Y + 0.135, ARM_R], color: FROST, emis: -2.2 });
      pb.cone(0.075, 0.11, { ...o, pos: [0, ARM_Y - 0.135, ARM_R], rot: [PI, 0, 0], color: FROST, emis: -2.2 });
    }
  },

  animate(L, s, B, H) {
    const t = s.t, phi = s.walk, m = H.moving, act = H.act, k = H.k, sp = H.sp;
    const lower = H.standing;
    ST.x = 0; ST.z = 0; ST.slide = 0;
    rest(L, B, REST_CR);
    L.scl(B.root, HERO_S);                                   // hero scale: the tallest humanoid on screen
    idle(L, s, B, H, IDLE);
    gait(L, s, B, H, GAIT, 'L');
    aimTwist(L, s, B, H);
    // serene glide: the head stays level, the staff leans into the run and rocks with the step
    const sn = sin(phi);
    L.add(B.head, -0.05 * m * sp, 0, 0);
    L.add(B.foreL, -0.15 * m, 0, 0);
    ST.x = 0.28 * m * sp - 0.1 * m * sn;
    ST.z = -0.04 * m * sp;
    ST.slide = REST_SLIDE + 0.05 * m;

    // ---- idle fidgets (staff tap ×2, crystal gaze ×1)
    let crystalS = 1, spin = 0.6;
    if (H.fidget > 0 && act === '') {
      const f = H.fidget, w = smooth(f / 0.18) * (1 - smooth((f - 0.82) / 0.18));
      if (H.fidgetN % 3 !== 2) {
        // lift 0.08 m (k 0–0.4), drop at k 0.55: the butt taps the ground
        applyKey(L, B, F_TAP, w, w, 1);
        ST.slide = REST_SLIDE + 0.08 * smooth(f / 0.4) * (1 - smooth((f - 0.5) / 0.06));
        const tap = bump(f, 0.55, 0.75);
        L.add(B.head, 0.08 * tap, 0, 0);
        L.scl(B.root, 1, 1 - 0.015 * tap, 1);
        crystalS += 0.15 * tap;
      } else {
        applyKey(L, B, F_GAZE, w, w, 1);
        L.add(B.head, 0, 0, 0.08 * sin(f * 3 * PI) * w);
        spin += 6 * bump(f, 0.2, 0.85);
        crystalS += 0.12 * bump(f, 0.25, 0.8);
      }
    }

    // ---- starter LANCE stance + per-shot thrust (single focus hand)
    const hold = H.hold;
    if (hold > 0) {
      applyKey(L, B, STANCE, hold, hold, lower);
      const sh = H.shot * hold;
      L.add(B.armR, -0.22 * sh, 0, 0); L.add(B.foreR, 0.3 * sh, 0, 0);
      L.add(B.chest, 0, 0.08 * sh, 0); L.mv(B.hips, 0, 0, 0.02 * sh);
      ST.x += 0.22 * sh;
      ST.slide += 0.06 * sh;
      crystalS += 0.2 * sh;
    }

    // ---- actions
    let wDash = 0, wRise = 0;
    if (act === 'heavy') {
      const W2 = twoKey(k, 0.18, 0.36, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, H_RAISE, H_PLANT, w1, w2, lower);
      crystalS += 0.2 * w1 * (1 - w2) + 0.4 * w2;
      L.scl(B.root, 1, 1 - 0.04 * bump(k, 0.33, 0.48), 1);
    } else if (act === 'throw') {
      const W2 = twoKey(k, 0.2, 0.35, 0.5), w1 = W2[0], w2 = W2[1];
      action2(L, B, T_WIND, T_THRUST, w1, w2, lower);
      crystalS += 0.35 * w2;
    } else if (act === 'nova') {
      const W2 = twoKey(k, 0.25, 0.4, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, N_GATHER, N_BURST, w1, w2, lower);
      crystalS += 0.35 * w2;
      spin += 8 * bump(k, 0.2, 0.7);
    } else if (act === 'channel') {
      applyKey(L, B, CHANNEL, 1, 1, lower);
      L.mv(B.hips, 0, 0.02 * sin(t * 3) * lower, 0);
      ST.x += 0.03 * sin(t * 23);
      crystalS = 1.12 + 0.08 * sin(t * 8);
      spin += 2.5;
    } else if (act === 'dash') {
      // ice-surf while the slide runs, then rise with a staff-butt tap
      wDash = smooth(k / 0.08) * (1 - smooth((k - DASH_SPLIT + 0.06) / 0.16));
      wRise = smooth((k - DASH_SPLIT + 0.08) / 0.14) * (1 - smooth((k - 0.72) / 0.28));
      applyKey(L, B, D_SURF, wDash, wDash, 1);
      applyKey(L, B, D_RISE, wRise, wRise, 1);
      L.scl(B.root, 1 + 0.04 * wDash, 1 - 0.04 * wDash, 1 + 0.12 * wDash);
      crystalS += 0.25 * wDash;
    } else if (act === 'arrive') {
      const w = 1 - smooth(k);
      applyKey(L, B, ARRIVE, w, w, 1);
    }

    // ---- secondary motion (bible §4.9; +rx swings a hanging part back)
    const Wd = wind(H);
    const vb = Wd.vb, vs = Wd.vs;
    const thL = L.get(B.thighL, 0), thR = L.get(B.thighR, 0);
    const thMax = max(thL, thR, 0);
    // front panels follow their thigh forward (never into it), half-follow it back; flare with a strafe
    L.add(B.skirtL, 0.95 * min(thL, 0) + 0.3 * max(thL, 0) - 0.06 * vb, 0, 0.8 * L.get(B.thighL, 2) - 0.2 * vs);
    L.add(B.skirtR, 0.95 * min(thR, 0) + 0.3 * max(thR, 0) - 0.06 * vb, 0, 0.8 * L.get(B.thighR, 2) - 0.2 * vs);
    // back panel: pushed by the trailing thigh, streams a little in the wind
    L.add(B.skirtB, max(0.85 * thMax, (Wd.back ? 0 : 0.25 * vb) + 0.04 * sin(2 * phi - 0.5) * m) + 0.3 * wDash, 0, 0.2 * vs);
    // cape: wind + flutter (cape2 lags); always clear of the back panel
    cloth(L, s, B, B.cape1, H, { base: 0.05, gain: 0.32, flutter: 0.05, dash: 0.45 });
    cloth(L, s, B, B.cape2, H, { base: 0.02, gain: 0.12, flutter: 0.08, i: 1, mult: 0.6, dash: 0.2 });
    L.add(B.cape1, 0, 0, 0.27 * vs);                         // a heavy cape: only a little side-stream
    L.add(B.cape2, 0, 0, 0.1 * vs);
    const capeNeed = 0.45 * L.get(B.skirtB, 0) - L.get(B.cape1, 0);
    if (capeNeed > 0) L.add(B.cape1, capeNeed, 0, 0);

    // ---- the Stillwater Crook: counter-rotate the arm chain so the staff stays vertical, then tilt
    const ax = L.get(B.hips, 0) + L.get(B.spine, 0) + L.get(B.chest, 0) + L.get(B.armR, 0) + L.get(B.foreR, 0) + L.get(B.handR, 0);
    const az = L.get(B.hips, 2) + L.get(B.spine, 2) + L.get(B.chest, 2) + L.get(B.armR, 2) + L.get(B.foreR, 2) + L.get(B.handR, 2);
    L.put(B.focus, ST.x - ax, L.get(B.focus, 1), ST.z - az, 1);
    // slide along the staff axis (expressed in the hand frame): + lifts the staff, − drives the butt down
    if (ST.slide !== 0) L.mv(B.focus, 0, ST.slide * cos(ax), -ST.slide * sin(ax));
    // crystal: slow spin + breathing
    L.add(B.crystal, 0, t * spin, 0);
    L.scl(B.crystal, crystalS * (1 + 0.04 * sin(t * 1.4)));
    // Crownshard clasp pulses with Frost Armor
    L.scl(B.shard, 1 + (0.03 + 0.08 * H.meter) * max(0, sin(t * TAU * (1 + 2 * H.meter))));

    // ---- Frost Armor: one hexagonal shard per charge, orbiting at chest height
    armorPop(H, t);
    const vic = act === 'victory';
    const nArm = vic ? 3 : H.armor;
    const orb = vic ? t * (1.6 + 4.5 * (1 - smooth((k - 0.55) / 0.4))) : t * 1.6;
    for (let n = 1; n <= 3; n++) {
      const b = n === 1 ? B.armor1 : n === 2 ? B.armor2 : B.armor3;
      const pt = n === 1 ? H.cryoPop1 : n === 2 ? H.cryoPop2 : H.cryoPop3;
      const sc = nArm >= n ? (vic ? smooth(k / 0.15) : popS(t - pt)) : 0;
      L.add(b, 0.12 * sin(t * 0.9 + n * 2.1), orb + n * 2.094, 0.1 * sin(t * 1.3 + n));
      L.mv(b, 0, 0.05 * sin(t * 2 + n * 2.1), 0);
      L.scl(b, sc);
    }

    stomp(L, B, H, 0.03);
    hit(L, s, B, null);
    if (s.hit > 0) { L.add(B.cape1, 0.25 * s.hit, 0, 0); L.add(B.skirtB, 0.15 * s.hit, 0, 0); L.add(B.crown, -0.1 * s.hit, 0, 0); }

    // ---- death: lean on the staff → kneel beside it → slump → Rift recall
    if (act === 'death') {
      const w1 = smooth((k - 0.1) / 0.2), w2 = smooth((k - 0.32) / 0.22);
      action2(L, B, D_LEAN, D_KNEEL, w1, w2, 1);
      L.add(B.head, 0.25 * smooth((k - 0.5) / 0.2), 0, 0);
      deathCommon(L, B, k);
      // the staff keeps standing beside the kneeling warden
      const ax2 = L.get(B.hips, 0) + L.get(B.spine, 0) + L.get(B.chest, 0) + L.get(B.armR, 0) + L.get(B.foreR, 0) + L.get(B.handR, 0);
      const az2 = L.get(B.hips, 2) + L.get(B.spine, 2) + L.get(B.chest, 2) + L.get(B.armR, 2) + L.get(B.foreR, 2) + L.get(B.handR, 2);
      L.put(B.focus, ST.x - ax2, 0, ST.z - az2, w1);
    } else if (vic) {
      // plant the staff and bow (k 0–0.55) → calm loop, the staff planted at the side
      const w1 = smooth(k / 0.15) * (1 - smooth((k - 0.55) / 0.25));
      const w2 = smooth((k - 0.55) / 0.3);
      action2(L, B, V_BOW, V_CALM, w1, w2, 1);
      const ax2 = L.get(B.hips, 0) + L.get(B.spine, 0) + L.get(B.chest, 0) + L.get(B.armR, 0) + L.get(B.foreR, 0) + L.get(B.handR, 0);
      const az2 = L.get(B.hips, 2) + L.get(B.spine, 2) + L.get(B.chest, 2) + L.get(B.armR, 2) + L.get(B.foreR, 2) + L.get(B.handR, 2);
      L.put(B.focus, -ax2, 0, -az2, 1);
      L.mv(B.focus, 0, ST.slide * cos(ax2), -ST.slide * sin(ax2));
      L.scl(B.crystal, 1 + 0.3 * bump(k, 0.08, 0.4));
      if (w2 > 0) {   // calm loop: slow breath, a faint sway of the robe
        L.add(B.head, w2 * 0.04 * sin(t * 1.1) * sin(t * 0.43), 0, 0);
        L.mv(B.hips, 0, w2 * 0.006 * sin(t * 1.2), 0);
      }
    }
  },
});
