import { defineHero, pose, keys, addKeys, twoKey, rest, idle, gait, aimTwist, wind, deathCommon, stomp, smooth, bump } from './hero.js';

// =====================================================================================
//  STORMCALLER — Tempest Rider sky-courier (design/research/09-hero-bible.md Appendix C, §4).
//  Lean athletic courier, always leaning in: a wide DARK HAT DISC with a lemon band, a bolt pin
//  and a crooked tip pointing back like a weather vane; a lemon scarf (navy-striped so it reads
//  on the Barrens) streaming down the back; a navy tailcoat with two swallow-tails lined in lemon;
//  tall riding boots; and the forked CONDUCTOR'S ROD in the right hand (rift-iron shaft, bronze
//  yoke, two chunky tines whose tips take the last-cast element).
//
//  Model space, faces +Z, left = +X. Rotation signs (XYZ euler): +x pitches an upright segment's
//  top forward / swings a hanging part back; +y turns toward +X; +z moves a hanging limb toward +X.
//  The ROD is modelled along +Z through the fist (the grip axis), so its world pitch is the sum of
//  the chain's rx (spine + arm + fore + focus): rod direction = (0, −sin θ, cos θ).
//  Torso entries of the key poses are ADDITIVE (never cancel the aim twist); limbs put absolute keys.
// =====================================================================================

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;

// ---- shared Crownforge palette (bible §0)
const RIFT_IRON = 0x3a3350, RIFT_IRON_HI = 0x5a4f78;
const BRONZE_LO = 0x6e5232, BRONZE = 0xa07a48, BRONZE_HI = 0xc8a874;
const LEATHER = 0x5a3f2c, LEATHER_D = 0x2e2020, SOLE = 0x221a1e;
const STORM = 0xffe45c, STORM_HI = 0xfff7c8;
// ---- Tempest Rider palette (Appendix C). All yellows are LEMON (hue 50–52°), never gold (#ffc93a, 43°).
const COAT = 0x233a6e, COAT_D = 0x1a2a52, HAT = 0x1e2c52, HAT_L = 0x2b3d6c;
const SCARF = 0xf2d43a, SCARF_D = 0xc9b022, LINING = 0xe8cc30;
const SHIRT = 0xe8e0d0, SKIN = 0xd8a07a, SKIN_D = 0xc08866, HAIR = 0xf4eab4, BROW = 0x3a2a30;
const TROUSER = 0x2e3448, BOOT = 0x3a2a20, BOOT_L = 0x5a4030;

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
const CROWN_PT = [[-0.08, -0.05], [0.08, -0.05], [0.08, 0.025], [0.045, 0], [0, 0.065], [-0.045, 0], [-0.08, 0.025]];
const BOLT = [[-0.02, 0.07], [0.04, 0.07], [0.01, 0.01], [0.04, 0.01], [-0.03, -0.08], [-0.005, -0.01], [-0.035, -0.01]];

// ---- bones (Appendix C + hatTip (weather-vane wobble), fork (tine pop), scarfF (front end))
const HERO_S = 1.12;          // lean but the tallest humanoid on screen: hat tip ≈ 2.3 m
const GX = -0.28, GY = 0.80, GZ = 0.03;   // rod grip (focus pivot) in the right fist
const YOKE_Z = GZ + 0.72, TIP_Z = GZ + 1.0, TINE_X = 0.115;
const BONES = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 0.86, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 0.98, 0] },
  { name: 'chest', parent: 'spine', pivot: [0, 1.18, 0] },
  { name: 'head', parent: 'chest', pivot: [0, 1.50, 0.02] },
  { name: 'hat', parent: 'head', pivot: [0, 1.86, 0] },
  { name: 'hatTip', parent: 'hat', pivot: [0.04, 2.02, -0.09] },
  { name: 'armL', parent: 'chest', pivot: [0.25, 1.42, 0] },
  { name: 'foreL', parent: 'armL', pivot: [0.27, 1.13, 0] },
  { name: 'handL', parent: 'foreL', pivot: [0.28, 0.89, 0.01] },
  { name: 'armR', parent: 'chest', pivot: [-0.25, 1.42, 0] },
  { name: 'foreR', parent: 'armR', pivot: [-0.27, 1.13, 0] },
  { name: 'handR', parent: 'foreR', pivot: [-0.28, 0.89, 0.01] },
  { name: 'focus', parent: 'handR', pivot: [GX, GY, GZ] },
  { name: 'fork', parent: 'focus', pivot: [GX, GY, YOKE_Z] },
  { name: 'thighL', parent: 'hips', pivot: [0.11, 0.84, 0] },
  { name: 'shinL', parent: 'thighL', pivot: [0.115, 0.47, 0] },
  { name: 'footL', parent: 'shinL', pivot: [0.12, 0.10, 0.01] },
  { name: 'thighR', parent: 'hips', pivot: [-0.11, 0.84, 0] },
  { name: 'shinR', parent: 'thighR', pivot: [-0.115, 0.47, 0] },
  { name: 'footR', parent: 'shinR', pivot: [-0.12, 0.10, 0.01] },
  { name: 'tailL', parent: 'spine', pivot: [0.10, 1.00, -0.15] },
  { name: 'tailL2', parent: 'tailL', pivot: [0.11, 0.62, -0.17] },
  { name: 'tailR', parent: 'spine', pivot: [-0.10, 1.00, -0.15] },
  { name: 'tailR2', parent: 'tailR', pivot: [-0.11, 0.62, -0.17] },
  { name: 'scarf1', parent: 'chest', pivot: [0, 1.46, -0.17] },
  { name: 'scarf2', parent: 'scarf1', pivot: [0, 1.1, -0.2] },
  { name: 'scarf3', parent: 'scarf2', pivot: [0, 0.79, -0.2] },
  { name: 'scarfF', parent: 'chest', pivot: [0.08, 1.45, 0.17] },
  { name: 'shard', parent: 'chest', pivot: [0, 1.17, 0.16] },
];

// ---- gait (bible §4.4): long athletic stride, the left arm pumps fully, the rod arm at ×0.5
const GAIT = { A: 0.95, K: 1.35, bob: 0.07, lean: 0.26, arm: 0.9, hy: 0.14, focusArm: 0.5 };
const IDLE = { a: 0.02, f: 2.6, sway: 1.3 };

// one key = absolute limb pose (put) + additive torso deltas
const key2 = (put, add) => ({ put: pose(put), add: pose(add) });
function applyKey(L, B, K, wPut, wAdd, lowerW) {
  keys(L, B, K.put, wPut, lowerW);
  addKeys(L, B, K.add, wAdd, lowerW);
}
// two-key action: limbs blend K1 → K2; torso deltas cross-fade (never sum)
function action2(L, B, K1, K2, w1, w2, lowerW) {
  keys(L, B, K1.put, w1, lowerW);
  keys(L, B, K2.put, w2, lowerW);
  addKeys(L, B, K1.add, w1 * (1 - w2), lowerW);
  addKeys(L, B, K2.add, w2, lowerW);
}

// ---- rest additions (bible §4.2): always leaning in; rod angled forward-up (~55°), tip out a little
const REST_ST = pose({
  spine: [0.12, 0, 0], head: [-0.12, 0, 0],
  armR: [-0.12, 0, -0.06], foreR: [-0.55, 0, 0], focus: [-0.55, -0.2, 0],
  armL: [0, 0, 0.03], thighL: [0, 0, 0.04], thighR: [0, 0, -0.04],
});

// ---- starter: FENCER stance (bible §4.6). Side-on, rod arm straight at the target, the rod
// continues the arm line (tines ahead), off hand raised behind in an en-garde curl.
const STANCE = key2(
  { armR: [-1.62, 0, -0.4], foreR: [-0.06, 0, 0], handR: [0, 0, 0], focus: [1.4, 0, 0],
    armL: [-0.3, 0, 1.15], foreL: [0, 0, 1.4], handL: [0, 0, 0.3] },
  { chest: [0, 0.4, 0], spine: [0.06, 0, 0], head: [0.04, -0.3, 0], 'hips.m': [0, -0.03, 0],
    thighL: [-0.22, 0, 0.06], shinL: [0.18, 0, 0], thighR: [0.18, 0, -0.08], shinR: [0.22, 0, 0] },
);

// ---- fidgets: rod twirl (×2) and hat tip (×1)
const F_TWIRL = key2(
  { armR: [-0.75, 0, -0.25], foreR: [-0.5, 0, 0], handR: [0, 0, 0] },
  { chest: [0, 0.1, 0], head: [0.05, -0.1, 0] },
);
const F_HAT = key2(
  { armL: [-2.35, -0.2, 0.15], foreL: [-1.55, 0, 0], handL: [-0.4, 0, 0] },
  { head: [0.14, 0.1, 0], spine: [0.04, 0, 0] },
);

// ---- heavy: SKYCALL (rod straight up, knee up → stamp and point the rod at the target)
const H_RAISE = key2(
  { armR: [-3.0, 0, -0.1], foreR: [0, 0, 0], handR: [0, 0, 0], focus: [1.4, 0, 0],
    armL: [0.3, 0, 1.0], foreL: [-0.35, 0, 0],
    thighL: [-1.2, 0, 0.05], shinL: [1.6, 0, 0], footL: [0.35, 0, 0], thighR: [0.05, 0, -0.04], shinR: [0.12, 0, 0] },
  { spine: [-0.27, 0, 0], head: [-0.42, 0, 0], 'hips.m': [0, 0.05, 0] },
);
const H_STRIKE = key2(
  { armR: [-1.62, 0, -0.18], foreR: [-0.04, 0, 0], handR: [0, 0, 0], focus: [1.85, 0, 0],
    armL: [0.6, 0, 0.55], foreL: [-0.45, 0, 0],
    thighL: [-0.6, 0, 0.06], shinL: [0.65, 0, 0], footL: [0, 0, 0], thighR: [0.38, 0, -0.06], shinR: [0.5, 0, 0], footR: [-0.15, 0, 0] },
  { spine: [0.35, 0, 0], head: [-0.22, 0, 0], 'hips.m': [0, -0.12, 0.04] },
);

// ---- throw: ROD WHIP (rod cocked back over the shoulder → whipped down at the target)
const T_WIND = key2(
  { armR: [-2.7, 0, -0.35], foreR: [-1.0, 0, 0], handR: [0, 0, 0], focus: [1.0, 0, 0], armL: [-0.8, 0, 0.35], foreL: [-0.6, 0, 0] },
  { chest: [0, -0.5, 0], spine: [-0.12, 0, 0], head: [0, 0.35, 0] },
);
const T_REL = key2(
  { armR: [-1.5, 0, -0.2], foreR: [-0.05, 0, 0], handR: [0, 0, 0], focus: [1.9, 0, 0], armL: [0.45, 0, 0.3], foreL: [-0.7, 0, 0],
    thighL: [-0.45, 0, 0.08], shinL: [0.25, 0, 0], thighR: [0.3, 0, -0.08], shinR: [0.35, 0, 0] },
  { chest: [0, 0.45, 0], spine: [0.2, 0, 0], head: [0, -0.3, 0], 'hips.m': [0, -0.04, 0.03] },
);

// ---- nova: gather (rod hugged upright, crouch) → burst (arms flung out, cloth flares)
const N_GATHER = key2(
  { armL: [-1.0, 0, -0.5], armR: [-1.0, 0, 0.5], foreL: [-1.4, 0, 0], foreR: [-1.4, 0, 0], focus: [0.3, 0, 0],
    thighL: [-0.4, 0, 0.1], thighR: [-0.4, 0, -0.1], shinL: [0.8, 0, 0], shinR: [0.8, 0, 0] },
  { spine: [0.4, 0, 0], head: [0.1, 0, 0], 'hips.m': [0, -0.16, 0] },
);
const N_BURST = key2(
  { armL: [-0.4, 0, 1.6], armR: [-0.4, 0, -1.6], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0], focus: [0.9, 0, 0] },
  { spine: [-0.3, 0, 0], head: [-0.3, 0, 0], 'hips.m': [0, 0.06, 0], scarf1: [0.7, 0, 0], tailL: [0.6, 0, 0.3], tailR: [0.6, 0, -0.3], hat: [-0.2, 0, 0] },
);

// ---- channel: rod held upright before the chest, off hand cupped beside it
const CHANNEL = key2(
  { armR: [-1.1, 0, -0.1], foreR: [-1.2, 0, 0], handR: [0, 0, 0], focus: [0.62, 0, 0],
    armL: [-1.0, -0.25, 0.25], foreL: [-1.35, 0, 0], handL: [-0.3, 0, 0] },
  { spine: [-0.1, 0, 0], head: [-0.15, 0, 0] },
);

// ---- Lightning Dash: BOLT-RUN (legs mirrored on alternate charges) → hop landing
const D_RUN_ARMS = { armL: [1.2, 0, 0.25], armR: [1.1, 0, -0.25], foreL: [0.2, 0, 0], foreR: [0.2, 0, 0], handR: [0, 0, 0], focus: [1.15, 0, 0] };
const D_RUN_ADD = { spine: [0.75, 0, 0], head: [-0.55, 0, 0], 'hips.m': [0, 0.06, 0], hat: [-0.3, 0, 0], scarf1: [1.2, 0, 0], scarf2: [0.1, 0, 0], scarf3: [0.15, 0, 0], tailL: [1.1, 0, 0.1], tailR: [1.1, 0, -0.1] };
const D_RUN_A = key2(
  { ...D_RUN_ARMS, thighL: [-1.1, 0, 0], shinL: [1.4, 0, 0], footL: [0.2, 0, 0], thighR: [0.9, 0, 0], shinR: [0.6, 0, 0], footR: [0.4, 0, 0] },
  D_RUN_ADD,
);
const D_RUN_B = key2(
  { ...D_RUN_ARMS, thighR: [-1.1, 0, 0], shinR: [1.4, 0, 0], footR: [0.2, 0, 0], thighL: [0.9, 0, 0], shinL: [0.6, 0, 0], footL: [0.4, 0, 0] },
  D_RUN_ADD,
);
const D_LAND = key2(
  { thighL: [-0.75, 0, 0.12], shinL: [1.2, 0, 0], footL: [-0.4, 0, 0], thighR: [-0.3, 0, -0.12], shinR: [1.15, 0, 0], footR: [-0.75, 0, 0],
    armL: [-0.5, 0, 0.6], foreL: [-0.4, 0, 0] },
  { spine: [0.35, 0, 0], head: [-0.25, 0, 0], 'hips.m': [0, -0.2, 0.04] },
);

// ---- arrive (blink landing; not used by the Stormcaller's dash, kept for completeness)
const ARRIVE = key2(
  { thighL: [-0.5, 0, 0.1], thighR: [-0.5, 0, -0.1], shinL: [1.0, 0, 0], shinR: [1.0, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0], armL: [0.4, 0, 0.5], armR: [0.4, 0, -0.6] },
  { spine: [0.35, 0, 0], head: [-0.2, 0, 0], 'hips.m': [0, -0.16, 0] },
);

// ---- death: knees buckle, spin half a turn, fall flat on the back (the hat flies off)
const DEATH = key2(
  { thighL: [-0.15, 0, 0.2], shinL: [0.25, 0, 0], thighR: [0.05, 0, -0.25], shinR: [0.15, 0, 0],
    armL: [-0.6, 0, 1.1], foreL: [-0.3, 0, 0], armR: [-0.4, 0, -1.2], foreR: [-0.2, 0, 0], focus: [-1.3, 0, 0] },
  { spine: [-0.15, 0, 0], head: [-0.2, 0.3, 0] },
);

// ---- victory: rod to the sky (strike lands on the tines) → hat tip, rod on the shoulder → calm loop
const V_SKY = key2(
  { armR: [-3.0, 0, -0.06], foreR: [0, 0, 0], handR: [0, 0, 0], focus: [1.42, 0, 0], armL: [0.2, 0, 0.45], foreL: [-0.9, 0, 0] },
  { spine: [-0.2, 0, 0], head: [-0.42, 0, 0], chest: [0, 0.15, 0] },
);
const V_TIP = key2(
  { armR: [-0.35, 0.2, -0.25], foreR: [-2.15, 0, 0], handR: [0, 0, 0], focus: [0.15, 0, 0],
    armL: [-2.35, -0.2, 0.15], foreL: [-1.55, 0, 0], handL: [-0.4, 0, 0] },
  { spine: [-0.06, 0, 0], head: [0.16, 0.1, 0], chest: [0, -0.1, 0] },
);
const V_CALM = key2(
  { armR: [-0.35, 0.2, -0.25], foreR: [-2.15, 0, 0], handR: [0, 0, 0], focus: [0.15, 0, 0],
    armL: [0.1, 0, 0.5], foreL: [-1.25, 0, -0.2], handL: [0.2, 0, 0],
    thighL: [0, 0, 0.1], thighR: [-0.12, 0, -0.08], shinR: [0.18, 0, 0], footR: [-0.1, 0, 0] },
  { spine: [-0.1, 0, 0], head: [-0.06, 0.15, 0], chest: [0, -0.12, 0] },
);

const DASH_SPLIT = 0.12 / 0.22;   // bolt-run while the dash runs (0.12 s of 0.22 s), then hop + landing

export const stormcallerHero = defineHero({
  id: 'heroStormcaller',
  bones: BONES,
  stride: 2.45 * HERO_S,
  blob: 0.55,
  gait: GAIT,
  castHands: 'R',
  muzzle: { bone: 'fork', at: [GX, GY, TIP_Z - 0.02] },                  // between the tine tips
  hand: { bone: 'handL', at: [0.28, 0.76, 0.04] },
  emitters: {
    tineL: { bone: 'fork', at: [GX + TINE_X + 0.01, GY, TIP_Z] },        // tine tips (arc endpoints)
    tineR: { bone: 'fork', at: [GX - TINE_X - 0.01, GY, TIP_Z] },
    hatPin: { bone: 'hat', at: [0.14, 1.94, 0.17] },                      // bolt pin on the band
    footL: { bone: 'footL', at: [0.12, 0.02, 0.06] },
    footR: { bone: 'footR', at: [-0.12, 0.02, 0.06] },
    scarfTip: { bone: 'scarf3', at: [0, 0.46, -0.2] },                    // streamer end
    tailL: { bone: 'tailL2', at: [0.24, 0.22, -0.17] },                   // swallow-tail points
    tailR: { bone: 'tailR2', at: [-0.24, 0.22, -0.17] },
  },

  build(pb) {
    // ================= legs: trousers, tall riding boots (folded cuffs, bronze buckle)
    pb.mirror((S, k) => {
      limb(pb, [0.11 * k, 0.86, 0], [0.115 * k, 0.47, 0], 0.095, 0.08, { bone: 'thigh' + S, color: TROUSER });
      limb(pb, [0.115 * k, 0.47, 0], [0.12 * k, 0.12, 0.01], 0.088, 0.078, { bone: 'shin' + S, color: BOOT });
      pb.cyl(0.112, 0.098, 0.1, { bone: 'shin' + S, pos: [0.116 * k, 0.47, 0.005], radial: 7, color: BOOT_L });   // boot cuff
      pb.box(0.07, 0.06, 0.05, { bone: 'shin' + S, pos: [0.12 * k, 0.3, 0.09], color: BRONZE_HI, trim: true });   // buckle
      pb.box(0.165, 0.13, 0.32, { bone: 'foot' + S, pos: [0.12 * k, 0.07, 0.06], taper: [0.88, 0.8], color: BOOT });
      pb.box(0.175, 0.04, 0.33, { bone: 'foot' + S, pos: [0.12 * k, 0.02, 0.06], color: SOLE });
      pb.box(0.06, 0.06, 0.06, { bone: 'foot' + S, pos: [0.12 * k, 0.04, -0.1], color: BRONZE_LO });              // spur stub
    });

    // ================= hips: tailcoat waist, short side flaps, cut-away front corners ride the thighs
    pb.box(0.38, 0.2, 0.27, { bone: 'hips', pos: [0, 0.86, 0], color: TROUSER });
    pb.mirror((S, k) => {
      pb.box(0.06, 0.3, 0.24, { bone: 'hips', pos: [0.2 * k, 0.8, -0.01], bottom: [1.2, 1.1], color: COAT });
      pb.box(0.15, 0.2, 0.05, { bone: 'thigh' + S, pos: [0.11 * k, 0.8, 0.12], bottom: [1.1, 1], color: COAT });
      pb.box(0.16, 0.05, 0.055, { bone: 'thigh' + S, pos: [0.11 * k, 0.69, 0.12], color: LINING });
    });

    // ================= swallow-tails (lemon-lined points)
    pb.mirror((S, k) => {
      pb.box(0.21, 0.42, 0.05, { bone: 'tail' + S, pos: [0.11 * k, 0.81, -0.165], bottom: [1.1, 1], color: COAT });
      const P = [[0.0, 0.64], [0.0, 0.42], [0.25, 0.18], [0.235, 0.64]].map(([x, y]) => [x * k, y]);
      pb.extrude(k > 0 ? P : P.slice().reverse(), 0.05, { bone: 'tail' + S + '2', pos: [0.005 * k, 0, -0.17], color: COAT });
      pb.box(0.34, 0.055, 0.06, { bone: 'tail' + S + '2', pos: [0.13 * k, 0.3, -0.17], rot: [0, 0, -0.77 * k], color: LINING });
    });

    // ================= torso: navy tailcoat, lemon lapels, shirt V, belt, Crownshard clasp
    pb.box(0.36, 0.22, 0.26, { bone: 'spine', pos: [0, 1.07, 0], color: COAT });
    pb.cyl(0.2, 0.2, 0.08, { bone: 'spine', pos: [0, 0.98, 0], radial: 8, color: LEATHER_D });
    pb.box(0.1, 0.08, 0.05, { bone: 'spine', pos: [0, 0.98, 0.195], color: BRONZE, trim: true });           // buckle
    pb.box(0.09, 0.11, 0.08, { bone: 'spine', pos: [-0.17, 0.94, 0.09], color: LEATHER });                    // pouches
    pb.box(0.09, 0.11, 0.08, { bone: 'spine', pos: [0.17, 0.94, 0.09], color: LEATHER });
    pb.box(0.44, 0.38, 0.29, { bone: 'chest', pos: [0, 1.29, 0], taper: [1.12, 1], bottom: [0.9, 0.95], color: COAT });
    pb.box(0.11, 0.24, 0.03, { bone: 'chest', pos: [0, 1.35, 0.145], taper: [1.3, 1], color: SHIRT });
    pb.mirror((S, k) => pb.box(0.08, 0.33, 0.04, { bone: 'chest', pos: [0.085 * k, 1.3, 0.15], rot: [0, 0, 0.24 * k], color: LINING }));
    pb.box(0.2, 0.05, 0.05, { bone: 'chest', pos: [0, 1.135, 0.14], color: COAT_D });                          // coat hem line
    // Crownshard clasp (crown point + Storm Prime gem), ×1.35 → a 0.22 m read
    pb.extrude(CROWN_PT.map(([x, y]) => [x * 1.35, y * 1.35]), 0.04, { bone: 'shard', pos: [0, 1.17, 0.165], color: BRONZE_HI, trim: true });
    pb.sphere(0.05, { bone: 'shard', pos: [0, 1.175, 0.195], seg: [6, 3], color: STORM, emis: 2.6 });
    // high coat collar flaring behind the scarf
    pb.box(0.32, 0.17, 0.06, { bone: 'chest', pos: [0, 1.57, -0.12], rot: [-0.35, 0, 0], taper: [1.15, 1], color: COAT_D });
    pb.mirror((S, k) => pb.box(0.06, 0.15, 0.17, { bone: 'chest', pos: [0.15 * k, 1.55, -0.03], rot: [0, 0, -0.3 * k], color: COAT_D }));
    // pauldrons: navy domes with a lemon edge and a bronze stud
    pb.mirror((S, k) => {
      pb.sphere(0.155, { bone: 'arm' + S, pos: [0.28 * k, 1.45, 0], scale: [1.3, 0.62, 1.2], seg: [7, 3], thetaLength: PI / 2, color: COAT_D });
      pb.cyl(0.2, 0.19, 0.05, { bone: 'arm' + S, pos: [0.28 * k, 1.44, 0], scale: [1, 1, 0.92], radial: 8, color: LINING });
      pb.box(0.075, 0.075, 0.075, { bone: 'arm' + S, pos: [0.3 * k, 1.535, 0], rot: [0, 0.785, 0], color: BRONZE_HI, trim: true });
    });

    // ================= scarf: neck wrap + knot + front end + 3-segment streamer (navy stripes → reads on the Barrens)
    pb.cyl(0.17, 0.2, 0.11, { bone: 'chest', pos: [0, 1.5, 0], radial: 8, color: SCARF });
    pb.box(0.13, 0.11, 0.09, { bone: 'chest', pos: [0.06, 1.46, 0.175], color: SCARF });
    pb.box(0.11, 0.24, 0.05, { bone: 'scarfF', pos: [0.1, 1.33, 0.19], bottom: [1.15, 1], color: SCARF });
    pb.box(0.125, 0.05, 0.055, { bone: 'scarfF', pos: [0.1, 1.23, 0.19], color: SCARF_D });
    pb.box(0.22, 0.38, 0.05, { bone: 'scarf1', pos: [0, 1.28, -0.2], color: SCARF });
    pb.box(0.21, 0.33, 0.05, { bone: 'scarf2', pos: [0, 0.94, -0.2], color: SCARF });
    pb.box(0.215, 0.065, 0.056, { bone: 'scarf2', pos: [0, 0.86, -0.2], color: COAT_D });
    pb.box(0.2, 0.26, 0.05, { bone: 'scarf3', pos: [0, 0.65, -0.2], color: SCARF });
    pb.box(0.205, 0.06, 0.056, { bone: 'scarf3', pos: [0, 0.69, -0.2], color: COAT_D });
    pb.mirror((S, k) => ptCone(pb, [0.05 * k, 0.53, -0.2], [0.07 * k, 0.43, -0.2], 0.055, { bone: 'scarf3', radial: 4, color: SCARF_D }));

    // ================= head: young courier face, glowing storm eyes, dark brows, a grin, static-spiked hair
    pb.box(0.33, 0.34, 0.32, { bone: 'head', pos: [0, 1.67, 0.03], taper: [0.92, 0.94], color: SKIN });
    pb.box(0.08, 0.1, 0.09, { bone: 'head', pos: [0, 1.64, 0.215], taper: [0.8, 0.8], color: SKIN_D });          // nose
    pb.box(0.13, 0.05, 0.04, { bone: 'head', pos: [0.015, 1.578, 0.19], rot: [0, 0, -0.12], color: LEATHER_D });  // lopsided grin
    pb.box(0.22, 0.08, 0.2, { bone: 'head', pos: [0, 1.535, 0.08], color: SKIN_D });                                // jaw
    pb.mirror((S, k) => {
      pb.box(0.065, 0.05, 0.03, { bone: 'head', pos: [0.078 * k, 1.695, 0.19], color: STORM_HI, emis: -1.8 });   // eyes
      pb.box(0.1, 0.05, 0.05, { bone: 'head', pos: [0.08 * k, 1.75, 0.19], rot: [0, 0, -0.28 * k], color: BROW });  // brows
      // static spikes bristling out under the brim
      ptCone(pb, [0.13 * k, 1.72, -0.02], [0.31 * k, 1.69, -0.07], 0.075, { bone: 'head', radial: 4, color: HAIR });
      ptCone(pb, [0.12 * k, 1.65, -0.08], [0.29 * k, 1.55, -0.15], 0.065, { bone: 'head', radial: 4, color: HAIR });
      ptCone(pb, [0.06 * k, 1.7, -0.12], [0.15 * k, 1.6, -0.31], 0.07, { bone: 'head', radial: 4, color: HAIR });
    });

    // ================= hat (the top-plane signature): dark disc, lemon band, bolt pin, crooked tip
    // brim (front raised so the face shows) with a lighter rolled edge; a squat flat-topped riding
    // crown (NOT a wizard cone); the crooked tip flops back-left down off the crown like a weather vane
    pb.cyl(0.44, 0.44, 0.05, { bone: 'hat', pos: [0, 1.875, 0], rot: [-0.22, 0, 0], radial: 12, color: HAT });
    pb.torus(0.43, 0.032, { bone: 'hat', pos: [0, 1.875, 0], rot: [PI / 2 - 0.22, 0, 0], radial: 12, tubular: 3, color: HAT_L });
    pb.cyl(0.18, 0.195, 0.15, { bone: 'hat', pos: [0, 1.96, -0.02], rot: [-0.22, 0, 0], radial: 8, color: HAT });
    pb.cyl(0.204, 0.204, 0.085, { bone: 'hat', pos: [0, 1.93, -0.01], rot: [-0.22, 0, 0], radial: 8, color: SCARF });
    // bolt pin on the band's front-left (bronze button + fixed-colour storm bolt)
    pb.cyl(0.055, 0.055, 0.03, { bone: 'hat', pos: [0.13, 1.935, 0.155], rot: [PI / 2 + 0.22, 0.75, 0], radial: 6, color: BRONZE_HI, trim: true });
    pb.extrude(BOLT.map(([x, y]) => [x * 1.6, y * 1.6]), 0.04, { bone: 'hat', pos: [0.14, 1.94, 0.17], rot: [-0.22, 0.75, 0], color: STORM, emis: -1.0 });
    ptCone(pb, [0.04, 2.02, -0.09], [0.2, 1.92, -0.36], 0.12, { bone: 'hatTip', radial: 7, color: HAT });
    pb.sphere(0.055, { bone: 'hatTip', pos: [0.2, 1.92, -0.36], seg: [5, 3], color: BRONZE_HI, trim: true });

    // ================= arms: navy sleeves, lemon cuffs, big leather riding gloves
    pb.mirror((S, k) => {
      limb(pb, [0.25 * k, 1.42, 0], [0.27 * k, 1.13, 0], 0.08, 0.072, { bone: 'arm' + S, color: COAT });
      limb(pb, [0.27 * k, 1.13, 0], [0.28 * k, 0.93, 0.01], 0.072, 0.066, { bone: 'fore' + S, color: COAT });
      pb.cyl(0.092, 0.085, 0.09, { bone: 'fore' + S, pos: [0.28 * k, 0.95, 0.01], radial: 7, color: LINING });
      pb.box(0.155, 0.16, 0.16, { bone: 'hand' + S, pos: [0.28 * k, 0.81, 0.025], taper: [1, 0.92], color: LEATHER });
      pb.box(0.05, 0.08, 0.07, { bone: 'hand' + S, pos: [0.22 * k, 0.83, 0.07], color: LEATHER });            // thumb
    });

    // ================= the CONDUCTOR'S ROD (along +Z through the right fist)
    pb.cyl(0.04, 0.046, 0.92, { bone: 'focus', pos: [GX, GY, GZ + 0.25], rot: [PI / 2, 0, 0], radial: 6, color: RIFT_IRON_HI });   // shaft −0.21 … +0.71
    pb.cyl(0.054, 0.054, 0.2, { bone: 'focus', pos: [GX, GY, GZ - 0.06], rot: [PI / 2, 0, 0], radial: 6, color: LEATHER });          // grip
    pb.sphere(0.065, { bone: 'focus', pos: [GX, GY, GZ - 0.23], seg: [6, 3], color: BRONZE });                                         // pommel
    for (const z of [0.3, 0.5]) pb.cyl(0.056, 0.056, 0.045, { bone: 'focus', pos: [GX, GY, GZ + z], rot: [PI / 2, 0, 0], radial: 6, color: BRONZE });
    // fork: bronze yoke + two chunky tines with storm tips (the tips take the last-cast element)
    pb.box(0.3, 0.085, 0.09, { bone: 'fork', pos: [GX, GY, YOKE_Z + 0.01], color: BRONZE_HI, trim: true });
    pb.cyl(0.06, 0.05, 0.08, { bone: 'fork', pos: [GX, GY, YOKE_Z - 0.04], rot: [PI / 2, 0, 0], radial: 6, color: BRONZE });
    for (const t of [-1, 1]) {
      limb(pb, [GX + 0.12 * t, GY, YOKE_Z + 0.03], [GX + TINE_X * t, GY, TIP_Z - 0.04], 0.042, 0.036, { bone: 'fork', radial: 5, color: BRONZE_HI });
      pb.sphere(0.058, { bone: 'fork', pos: [GX + TINE_X * t, GY, TIP_Z], seg: [5, 3], color: STORM, emis: 2.8 });
    }
  },

  animate(L, s, B, H) {
    const t = s.t, phi = s.walk, m = H.moving, act = H.act, k = H.k;
    const lower = H.standing, still = 1 - m;
    rest(L, B, REST_ST);
    L.scl(B.root, HERO_S);
    idle(L, s, B, H, IDLE);
    // restless heel bounce (bible §4.3)
    L.mv(B.hips, 0, 0.012 * max(0, sin(t * 5 + s.seed * 4)) * still * (act === '' ? 1 : 0), 0);
    gait(L, s, B, H, GAIT, 'L');
    aimTwist(L, s, B, H);
    // athletic run: shoulders roll, the free arm pumps, head up against the lean, rod arm tucked
    const sp = H.sp, sn = sin(phi);
    L.add(B.chest, 0, 0, 0.05 * m * sn);
    L.add(B.foreL, -0.55 * m, 0, 0);
    L.add(B.foreR, -0.25 * m, 0, 0);
    L.add(B.focus, 0.15 * m * sp, 0, 0);
    L.add(B.head, -0.12 * m * sp, 0, 0);

    // ---- idle fidgets: rod twirl (×2), hat tip (×1)
    if (H.fidget > 0 && act === '') {
      const f = H.fidget, w = smooth(f / 0.18) * (1 - smooth((f - 0.82) / 0.18));
      if (H.fidgetN % 3 !== 2) {
        applyKey(L, B, F_TWIRL, w, w, 1);
        // two full turns of the rod in the hand, eased, over the middle 0.6 s
        L.add(B.focus, 0.3 * w, 4 * PI * smooth((f - 0.2) / 0.55), 0);
        L.add(B.head, 0.08 * bump(f, 0.25, 0.75), 0, 0);
      } else {
        applyKey(L, B, F_HAT, w, w, 1);
        L.add(B.hat, 0.28 * bump(f, 0.3, 0.8), 0, 0);
        L.mv(B.hat, 0, 0.015 * bump(f, 0.3, 0.8), 0);
      }
    }

    // ---- starter FENCER stance + snap recoil with alternating fork flicks (shotN)
    const hold = H.hold;
    let forkS = 1;
    if (hold > 0) {
      applyKey(L, B, STANCE, hold, hold, lower);
      // standing: the lower body turns side-on too, the spine untwists it (chest stays +0.3)
      L.add(B.hips, 0, 0.4 * hold * lower, 0);
      L.add(B.spine, 0, -0.4 * hold * lower, 0);
      const sh = H.shot * hold, sd = (H.shotN & 1) ? 1 : -1;
      L.add(B.focus, -0.32 * sh, 0, 0);
      L.add(B.handR, 0, 0, 0.24 * sd * sh);
      L.add(B.foreR, -0.12 * sh, 0, 0);
      L.add(B.armR, -0.06 * sh, 0, 0);
      L.add(B.chest, 0, 0.08 * sh, 0);
      L.mv(B.hips, 0, 0, -0.02 * sh);
      forkS = 1 + 0.3 * sh;
    }

    // ---- actions
    let wRun = 0, hatPop = 0;
    if (act === 'heavy') {
      const W2 = twoKey(k, 0.18, 0.36, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, H_RAISE, H_STRIKE, w1, w2, lower);
      forkS = 1 + 0.25 * w1 * (1 - w2) + 0.4 * w2;
      hatPop = bump(k, 0.3, 0.62);
    } else if (act === 'throw') {
      const W2 = twoKey(k, 0.2, 0.35, 0.5), w1 = W2[0], w2 = W2[1];
      action2(L, B, T_WIND, T_REL, w1, w2, lower);
      L.add(B.focus, -0.55 * bump(k, 0.2, 0.42), 0, 0);      // the rod lags the arm (whip)
      forkS = 1 + 0.35 * w2;
    } else if (act === 'nova') {
      const W2 = twoKey(k, 0.25, 0.4, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, N_GATHER, N_BURST, w1, w2, lower);
      forkS = 1 + 0.3 * w2;
      hatPop = 0.6 * w2;
    } else if (act === 'channel') {
      applyKey(L, B, CHANNEL, 1, 1, lower);
      L.mv(B.hips, 0, 0.02 * sin(t * 3) * lower, 0);
      L.add(B.focus, 0.03 * sin(t * 23), 0, 0);
      L.mv(B.hat, 0, 0.03 * max(0, sin(t * 9)), 0);           // static lifts the hat
      forkS = 1.1 + 0.08 * sin(t * 8);
    } else if (act === 'dash') {
      // bolt-run while the dash runs, alternate charges mirror the legs and the roll; then hop → land
      wRun = smooth(k / 0.08) * (1 - smooth((k - DASH_SPLIT + 0.06) / 0.12));
      const alt = H.dashN & 1;
      applyKey(L, B, alt ? D_RUN_A : D_RUN_B, wRun, wRun, 1);
      L.add(B.root, 0, 0, (alt ? 0.25 : -0.25) * wRun);
      L.scl(B.root, 1 - 0.15 * wRun, 1 - 0.08 * wRun, 1 + 0.45 * wRun);
      const hop = bump(k, DASH_SPLIT - 0.12, DASH_SPLIT + 0.14);
      L.mv(B.hips, 0, 0.09 * hop, 0);
      L.add(B.shinL, 0.5 * hop, 0, 0); L.add(B.shinR, 0.6 * hop, 0, 0);
      const wl = smooth((k - DASH_SPLIT - 0.04) / 0.12) * (1 - smooth((k - 0.78) / 0.22));
      applyKey(L, B, D_LAND, wl, wl, 1);
      forkS = 1 + 0.5 * wRun;
    } else if (act === 'arrive') {
      const w = 1 - smooth(k);
      applyKey(L, B, ARRIVE, w, w, 1);
    }

    // ---- secondary motion (bible §4.9, signs per the rig: +rx swings a hanging part back)
    const Wd = wind(H);
    const vb = Wd.vb, vs = Wd.vs, bk = Wd.back;
    const thL = L.get(B.thighL, 0), thR = L.get(B.thighR, 0);
    // swallow-tails: stream back with the wind, flap per step, kept clear of the trailing thigh
    const tb = bk ? 0.05 : 0.1 + 0.95 * vb;
    const fl = (bk ? 1.5 : 1) * 0.1 * m;
    const tL = max(tb + fl * sin(2 * phi) + 0.04 * sin(t * 2.1), 0.85 * max(thL, 0) + 0.04);
    const tR = max(tb + fl * sin(2 * phi + PI) + 0.04 * sin(t * 2.1 + 0.6), 0.85 * max(thR, 0) + 0.04);
    L.add(B.tailL, tL, 0, -0.35 * vs + 0.1 * vb);
    L.add(B.tailR, tR, 0, -0.35 * vs - 0.1 * vb);
    L.add(B.tailL2, 0.3 * (tL - 0.04) + 0.1 * sin(2 * phi - 1) * m + 0.22 * sin(t * 12) * vb + 0.03 * sin(t * 2.3), 0, 0.1 * sin(t * 10 + 1) * vb);
    L.add(B.tailR2, 0.3 * (tR - 0.04) + 0.1 * sin(2 * phi + PI - 1) * m + 0.22 * sin(t * 12 + 2.1) * vb + 0.03 * sin(t * 2.3 + 0.7), 0, -0.1 * sin(t * 10 + 2.5) * vb);
    // scarf: a travelling wave in the wind (scarf1 → 2 → 3 phase-lagged), side stream, idle drift
    const sv = bk ? 0 : vb;
    L.add(B.scarf1, (bk ? 0.05 : 0.1 + 0.95 * vb) + 0.12 * sin(t * 9) * sv + 0.04 * sin(t * 2.1), 0, -0.45 * vs + 0.03 * sin(t * 1.3));
    L.add(B.scarf2, 0.1 + 0.28 * sin(t * 11 - 0.7) * sv + 0.05 * sin(t * 2.1 - 0.6) + 0.1 * sin(2 * phi - 0.6) * m, 0, 0.14 * sin(t * 9 - 1.0) * sv);
    L.add(B.scarf3, 0.32 * sin(t * 11 - 1.4) * sv + 0.06 * sin(t * 2.1 - 1.2) + 0.12 * sin(2 * phi - 1.2) * m, 0, 0.18 * sin(t * 9 - 2.0) * sv);
    // front end of the scarf flaps out to the side
    L.add(B.scarfF, -0.12 * vb + 0.04 * sin(t * 2.3) + 0.08 * sin(2 * phi - 0.4) * m, 0, 0.35 * vb + 0.07 * sin(t * 8) * vb + 0.15 * wRun);
    // hat: the brim lifts with speed; the crooked tip wobbles a beat late like a weather vane
    L.add(B.hat, -0.12 * m * sp + 0.03 * sin(t * 1.7) + 0.04 * sin(2 * phi - 0.9) * m, 0, 0.02 * sin(t * 1.3));
    L.add(B.hatTip, 0.1 * sin(2 * phi - 1.5) * m + 0.05 * sin(t * 1.9) - 0.12 * vb - 0.25 * wRun, 0.06 * sin(t * 1.1), 0.08 * sin(phi - 1.0) * m);
    if (hatPop > 0) { L.mv(B.hat, 0, 0.08 * hatPop, 0); L.add(B.hat, -0.22 * hatPop, 0, 0); L.add(B.hatTip, 0.3 * hatPop, 0, 0); }

    // ---- the rod: tines shimmer (harder with Momentum), Crownshard pulses at 2 + 4·meter Hz
    const meter = H.meter;
    L.scl(B.fork, forkS * (1 + (0.02 + 0.05 * meter) * sin(t * 13 + 1.1 * sin(t * 5))));
    const cp = sin(t * 2 * PI * (2 + 4 * meter));
    L.scl(B.shard, 1 + (0.04 + 0.1 * meter) * max(0, cp));

    stomp(L, B, H, 0.025);
    // hit (bible §4.10 + cloth kick)
    const h = s.hit;
    if (h > 0) {
      L.add(B.spine, -0.3 * h, 0, 0); L.add(B.head, -0.25 * h, 0, 0); L.mv(B.hips, 0, 0, -0.08 * h);
      L.add(B.armL, 0, 0, 0.3 * h); L.add(B.armR, 0, 0, -0.3 * h);
      L.add(B.tailL, 0.25 * h, 0, 0); L.add(B.tailR, 0.25 * h, 0, 0); L.add(B.scarf1, 0.35 * h, 0, 0);
      L.add(B.hat, -0.2 * h, 0, 0);
    }

    // ---- death: stagger → knees buckle, spin half a turn, fall flat on the back; the hat flies off
    if (act === 'death') {
      const w = smooth((k - 0.1) / 0.3);
      applyKey(L, B, DEATH, w, w, 1);
      const spin = smooth((k - 0.12) / 0.33), fall = smooth((k - 0.26) / 0.24);
      L.add(B.root, 1.38 * fall, PI * spin, 0.12 * fall);
      L.mv(B.hips, 0, -0.1 * bump(k, 0.12, 0.4), 0);
      L.add(B.spine, -0.2 * fall, 0, 0);
      // the hat: launched up off the head (arc + tumble), then lies tipped beside the head
      const hf = smooth((k - 0.12) / 0.4), arc = bump(k, 0.12, 0.52);
      L.mv(B.hat, 0.12 * hf, 0.55 * arc + 0.1 * hf, -0.3 * hf);
      L.add(B.hat, -2.9 * hf, 0, 0.5 * hf);
      deathCommon(L, B, k);
    } else if (act === 'victory') {
      // rod to the sky (strike on the tines at k 0.3) → hat tip, rod on the shoulder → calm loop
      const w1 = smooth(k / 0.12) * (1 - smooth((k - 0.45) / 0.18));
      const w2 = smooth((k - 0.45) / 0.18) * (1 - smooth((k - 0.8) / 0.2));
      const w3 = smooth((k - 0.8) / 0.2);
      keys(L, B, V_SKY.put, w1, 1); keys(L, B, V_TIP.put, w2, 1); keys(L, B, V_CALM.put, w3, 1);
      addKeys(L, B, V_SKY.add, w1, 1); addKeys(L, B, V_TIP.add, w2, 1); addKeys(L, B, V_CALM.add, w3, 1);
      const strike = bump(k, 0.24, 0.46);
      L.scl(B.fork, 1 + 0.6 * strike);
      L.add(B.armR, -0.06 * bump(k, 0.26, 0.36), 0, 0);
      L.add(B.hat, 0.32 * bump(k, 0.52, 0.86), 0, 0);
      L.mv(B.hat, 0, 0.02 * bump(k, 0.52, 0.86), 0);
      if (w3 > 0) {   // calm loop: heel bounce, the rod taps the shoulder, a slow nod
        L.mv(B.hips, 0, w3 * 0.01 * max(0, sin(t * 4.2)), 0);
        L.add(B.focus, w3 * 0.06 * max(0, sin(t * 2.1)), 0, 0);
        L.add(B.head, w3 * 0.05 * sin(t * 1.3) * sin(t * 0.47), 0, 0);
      }
    }
  },
});
