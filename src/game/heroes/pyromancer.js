import { defineHero, pose, keys, twoKey, rest, idle, gait, aimTwist, wind, hit, deathCommon, stomp, smooth, bump } from './hero.js';

// =====================================================================================
//  PYROMANCER — Cinderwright forge-priest (design/research/09-hero-bible.md Appendix A, §4).
//  Stocky fire-plug brawler: soot coat, leather apron, ember forge hood with a floppy liripipe,
//  ash-white beard, bronze goggles, the oversized BRAZIER-GAUNTLET on the right arm (coal window,
//  glowing palm core, knuckle flames) and a kiln backpack whose chimney spikes up behind the LEFT
//  shoulder (asymmetric silhouette: fist low-right, chimney high-left).
//
//  Model space, faces +Z, left = +X. Rotation signs (XYZ euler): +x pitches an upright segment's
//  top forward / swings a hanging part back; +y turns toward +X; +z moves a hanging limb toward +X.
//  Torso entries of the key poses are ADDITIVE (they never cancel the aim twist); limb entries
//  blend to absolute keys (put).
// =====================================================================================

const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;

// ---- shared Crownforge palette (bible §0)
const RIFT_IRON = 0x3a3350, RIFT_IRON_HI = 0x5a4f78;
const BRONZE_LO = 0x6e5232, BRONZE = 0xa07a48, BRONZE_HI = 0xc8a874;
const LEATHER_D = 0x2e2020;
const FIRE = 0xff7a33, FIRE_HI = 0xffd0a8;
// ---- Cinderwright palette (Appendix A)
const SOOT = 0x3b2a24, APRON = 0x6a4428, CHAR = 0x241814;
const HOOD = 0xc8561e, HOOD_D = 0x9e4218;
const SKIN = 0xc68a62, SKIN_D = 0xa8704c;
const ASH = 0xd8d0c4, ASH_D = 0xb8b0a4, LINEN = 0xd8c8a8;
const TROUSER = 0x3e3230, BOOT = 0x2e2220, BOOT_L = 0x4a3428, WOOD = 0x6b4426;

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
// the Crownforge crown point (design/UI.md --orn-crown), scaled
const CROWN_PT = [[-0.08, -0.05], [0.08, -0.05], [0.08, 0.025], [0.045, 0], [0, 0.065], [-0.045, 0], [-0.08, 0.025]];

// ---- bones (Appendix A + a 'flames' child of the focus for the knuckle-flame flicker)
const HERO_S = 1.12;   // whole-body scale: a 2.2 m-tall chunk among 1.8 m orcs
const CHIM_X = 0.15;   // chimney stands on the pack's left rim (behind the LEFT shoulder)
const BONES = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 0.78, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 0.90, 0] },
  { name: 'chest', parent: 'spine', pivot: [0, 1.10, 0] },
  { name: 'head', parent: 'chest', pivot: [0, 1.44, 0.06] },
  { name: 'hood', parent: 'head', pivot: [-0.03, 1.80, -0.10] },
  { name: 'beard', parent: 'head', pivot: [0, 1.53, 0.20] },
  { name: 'armL', parent: 'chest', pivot: [0.31, 1.36, 0] },
  { name: 'foreL', parent: 'armL', pivot: [0.34, 1.06, 0.02] },
  { name: 'handL', parent: 'foreL', pivot: [0.35, 0.82, 0.03] },
  { name: 'armR', parent: 'chest', pivot: [-0.31, 1.36, 0] },
  { name: 'foreR', parent: 'armR', pivot: [-0.34, 1.06, 0.02] },
  { name: 'handR', parent: 'foreR', pivot: [-0.35, 0.80, 0.04] },
  { name: 'focus', parent: 'handR', pivot: [-0.355, 0.6, 0.0] },
  { name: 'flames', parent: 'focus', pivot: [-0.355, 0.72, 0.23] },
  { name: 'thighL', parent: 'hips', pivot: [0.13, 0.76, 0] },
  { name: 'shinL', parent: 'thighL', pivot: [0.135, 0.42, 0.01] },
  { name: 'footL', parent: 'shinL', pivot: [0.14, 0.10, 0.02] },
  { name: 'thighR', parent: 'hips', pivot: [-0.13, 0.76, 0] },
  { name: 'shinR', parent: 'thighR', pivot: [-0.135, 0.42, 0.01] },
  { name: 'footR', parent: 'shinR', pivot: [-0.14, 0.10, 0.02] },
  { name: 'apronF', parent: 'hips', pivot: [0, 0.90, 0.19] },
  { name: 'coatB', parent: 'hips', pivot: [0, 0.90, -0.17] },
  { name: 'pack', parent: 'chest', pivot: [0, 1.30, -0.22] },
  { name: 'chimney', parent: 'pack', pivot: [CHIM_X, 1.44, -0.36] },
  { name: 'shard', parent: 'spine', pivot: [0, 0.93, 0.29] },
];

// ---- gait (bible §4.4)
const GAIT = { A: 0.8, K: 1.1, bob: 0.06, lean: 0.2, arm: 0.65, hy: 0.12, focusArm: 0.5 };
const IDLE = { a: 0.025, f: 1.6, sway: 1 };

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
      if (B[n] === undefined) throw new Error(`pyromancer pose: unknown bone "${n}"`);
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
// one key = absolute limb pose (put) + additive torso deltas
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

// ---- rest additions (bible §4.2): wide stance, hunch, the heavy fist hangs out
const REST_PY = pose({
  thighL: [0, 0, 0.10], thighR: [0, 0, -0.10], footL: [0, 0, -0.10], footR: [0, 0, 0.10],
  spine: [0.10, 0, 0], head: [-0.10, 0, 0], armR: [0, 0, -0.20], foreR: [-0.12, 0, 0], armL: [0, 0, 0.04],
});

// ---- starter jab-jab stance (bible §4.6): gauntlet forward at the target, left hand on guard
const STANCE = key2(
  { armR: [-1.3, 0.15, -0.22], foreR: [-0.42, 0, 0], handR: [-0.15, 0, 0], armL: [-0.55, -0.3, 0.06], foreL: [-1.5, 0, 0], handL: [-0.2, 0, 0] },
  { chest: [0, 0.20, 0], head: [0.02, -0.12, 0], 'hips.m': [0, -0.02, 0] },
);

// ---- knuckle-crack fidget (bible §4.3) and beard stroke (alternate)
const F_CRACK = key2(
  { armR: [-1.0, 0.25, -0.05], foreR: [-1.25, 0, 0], armL: [-0.9, -0.2, -0.3], foreL: [-1.35, 0, 0], handL: [-0.3, 0, 0] },
  { chest: [0, 0.12, 0], head: [0.12, 0, 0], spine: [0.05, 0, 0] },
);
const F_BEARD = key2(
  { armL: [-1.25, -0.35, -0.2], foreL: [-1.75, 0, 0], handL: [-0.4, 0, 0] },
  { head: [-0.12, 0.12, 0.16], spine: [-0.05, 0, 0], chest: [0, -0.1, 0] },
);

// ---- heavy: FORGE SLAM (raise both fists overhead → hammer the gauntlet into the ground)
const H_RAISE = key2(
  { armR: [-2.75, 0, 0.30], foreR: [-0.45, 0, 0], handR: [0.2, 0, 0], armL: [-2.6, 0, -0.30], foreL: [-0.6, 0, 0] },
  { spine: [-0.42, 0, 0], head: [-0.22, 0, 0], 'hips.m': [0, 0.06, 0] },
);
const H_SLAM = key2(
  { armR: [-0.8, 0, 0.12], foreR: [-0.1, 0, 0], handR: [-0.2, 0, 0], armL: [-0.75, 0, -0.15], foreL: [-0.3, 0, 0],
    thighL: [-0.75, 0, 0.12], shinL: [1.05, 0, 0], footL: [-0.3, 0, -0.1], thighR: [0.35, 0, -0.12], shinR: [0.95, 0, 0], footR: [-0.6, 0, 0.1] },
  { spine: [0.45, 0, 0], head: [-0.05, 0, 0], 'hips.m': [0, -0.17, 0.04] },
);

// ---- throw: overhand hook with the gauntlet (Fireball)
const T_WIND = key2(
  { armR: [-2.4, 0, -0.45], foreR: [-1.6, 0, 0], handR: [0.3, 0, 0], armL: [-0.7, 0, 0.3], foreL: [-1.0, 0, 0] },
  { chest: [0, -0.5, 0], spine: [-0.12, 0, 0], head: [0, 0.3, 0] },
);
const T_REL = key2(
  { armR: [-1.6, 0, -0.1], foreR: [-0.08, 0, 0], handR: [-0.1, 0, 0], armL: [0.35, 0, 0.3], foreL: [-0.9, 0, 0],
    thighL: [-0.45, 0, 0.1], shinL: [0.25, 0, 0], thighR: [0.3, 0, -0.1], shinR: [0.35, 0, 0] },
  { chest: [0, 0.45, 0], spine: [0.2, 0, 0], head: [0, -0.3, 0], 'hips.m': [0, -0.04, 0.03] },
);

// ---- nova: gather (arms crossed, crouch) → burst (arms flung out)
const N_GATHER = key2(
  { armL: [-1.0, 0, -0.5], armR: [-1.0, 0, 0.5], foreL: [-1.4, 0, 0], foreR: [-1.4, 0, 0], thighL: [-0.4, 0, 0.1], thighR: [-0.4, 0, -0.1], shinL: [0.8, 0, 0], shinR: [0.8, 0, 0] },
  { spine: [0.4, 0, 0], head: [0.1, 0, 0], 'hips.m': [0, -0.16, 0] },
);
const N_BURST = key2(
  { armL: [-0.4, 0, 1.6], armR: [-0.4, 0, -1.6], foreL: [-0.2, 0, 0], foreR: [-0.2, 0, 0] },
  { spine: [-0.35, 0, 0], head: [-0.3, 0, 0], 'hips.m': [0, 0.06, 0], apronF: [-0.3, 0, 0], coatB: [0.4, 0, 0] },
);

// ---- channel: fist pressed into the cupped left palm at chest height
const CHANNEL = key2(
  { armR: [-1.05, 0.3, -0.05], foreR: [-1.3, 0, 0], handR: [-0.2, 0, 0], armL: [-0.95, -0.25, -0.15], foreL: [-1.45, 0, 0], handL: [-0.3, 0, 0] },
  { spine: [-0.2, 0, 0], head: [-0.12, 0, 0], hood: [-0.25, 0, 0] },
);

// ---- Flame Dash: shoulder-charge → skid
const D_CHARGE = key2(
  { armR: [-1.65, 0, -0.1], foreR: [-0.12, 0, 0], handR: [-0.3, 0, 0], armL: [0.9, 0, 0.4], foreL: [-0.5, 0, 0],
    thighL: [-0.95, 0, 0], shinL: [0.6, 0, 0], footL: [0.2, 0, 0], thighR: [0.8, 0, 0], shinR: [0.9, 0, 0], footR: [0.4, 0, 0] },
  { spine: [0.5, 0, 0], chest: [0, 0.35, 0], head: [-0.4, -0.2, 0], 'hips.m': [0, -0.08, 0], beard: [0.5, 0, 0], hood: [-0.6, 0, 0] },
);
const D_SKID = key2(
  { armR: [-0.8, 0, -0.3], foreR: [-0.3, 0, 0], armL: [-0.5, 0, 0.6], foreL: [-0.6, 0, 0],
    thighL: [-0.55, 0, 0.1], shinL: [0.25, 0, 0], footL: [0.3, 0, 0], thighR: [0.35, 0, -0.1], shinR: [0.6, 0, 0], footR: [-0.2, 0, 0] },
  { spine: [-0.3, 0, 0], head: [0.1, 0, 0], 'hips.m': [0, -0.1, -0.04], beard: [-0.25, 0, 0] },
);

// ---- arrive (after a blink, if ever used): land in a crouch
const ARRIVE = key2(
  { thighL: [-0.5, 0, 0.1], thighR: [-0.5, 0, -0.1], shinL: [1.0, 0, 0], shinR: [1.0, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0], armL: [0.4, 0, 0.5], armR: [0.4, 0, -0.6] },
  { spine: [0.35, 0, 0], head: [-0.2, 0, 0], 'hips.m': [0, -0.16, 0] },
);

// ---- death: drop to one knee, the gauntlet fist planted on the ground
const DEATH = key2(
  { thighL: [-1.35, 0, 0.12], shinL: [1.3, 0, 0], footL: [0.05, 0, -0.1], thighR: [0.1, 0, -0.12], shinR: [1.65, 0, 0], footR: [-0.75, 0, 0.1],
    armR: [-0.55, 0, -0.12], foreR: [-0.15, 0, 0], handR: [-0.3, 0, 0], armL: [-0.4, 0, 0.35], foreL: [-1.0, 0, 0] },
  { spine: [0.45, 0, 0], head: [0.15, 0, 0], 'hips.m': [0, -0.36, 0.04] },
);

// ---- victory: fist straight up (flame burst) → crossed arms, calm loop
const V_FIST = key2(
  { armR: [-3.0, 0, 0.05], foreR: [-0.12, 0, 0], handR: [0.1, 0, 0], armL: [0.15, 0, 0.5], foreL: [-1.3, 0, 0] },
  { spine: [-0.22, 0, 0], head: [-0.3, 0, 0], chest: [0, 0.18, 0] },
);
const V_CROSS = key2(
  { armR: [-0.38, 0.95, -0.12], foreR: [-1.75, 0, 0], handR: [0, 0, 0], armL: [-0.48, -0.95, 0.1], foreL: [-1.6, 0, 0], handL: [0, 0, 0],
    thighL: [0, 0, 0.16], thighR: [0, 0, -0.16], footL: [0, 0, -0.16], footR: [0, 0, 0.16] },
  { spine: [-0.14, 0, 0], head: [-0.08, 0.12, 0] },
);

const DASH_SPLIT = 0.16 / 0.30;   // charge until the dash ends (0.16 s of 0.30 s), then the skid

export const pyromancerHero = defineHero({
  id: 'heroPyromancer',
  bones: BONES,
  stride: 1.95 * HERO_S,
  blob: 0.62,
  gait: GAIT,
  castHands: 'alt',
  muzzle: { bone: 'focus', at: [-0.355, 0.5, 0.0] },
  hand: { bone: 'handL', at: [0.35, 0.66, 0.06] },
  emitters: {
    chimney: { bone: 'chimney', at: [CHIM_X, 2.09, -0.36] },     // ember mouth (embers + smoke puffs)
    palm: { bone: 'focus', at: [-0.355, 0.5, 0.0] },          // palm core (= muzzle)
    coal: { bone: 'foreR', at: [-0.345, 0.95, 0.2] },            // coal window on the bracer front
    knuckles: { bone: 'flames', at: [-0.355, 0.85, 0.29] },      // knuckle-flame tips
    door: { bone: 'pack', at: [0, 1.2, -0.58] },                 // kiln fire door (back)
    footL: { bone: 'footL', at: [0.14, 0.02, 0.06] },            // stomp dust
    footR: { bone: 'footR', at: [-0.14, 0.02, 0.06] },
  },

  build(pb) {
    // ================= legs: trousers, bronze greaves, steel-toe boots
    pb.mirror((S, k) => {
      limb(pb, [0.13 * k, 0.8, 0], [0.135 * k, 0.42, 0.01], 0.12, 0.1, { bone: 'thigh' + S, color: TROUSER });
      limb(pb, [0.135 * k, 0.42, 0.01], [0.14 * k, 0.12, 0.02], 0.1, 0.09, { bone: 'shin' + S, color: BOOT });
      pb.cyl(0.115, 0.115, 0.08, { bone: 'shin' + S, pos: [0.135 * k, 0.4, 0.01], radial: 7, color: BOOT_L });
      pb.box(0.15, 0.22, 0.06, { bone: 'shin' + S, pos: [0.137 * k, 0.27, 0.1], taper: [1.15, 1], color: BRONZE });
      pb.box(0.19, 0.14, 0.31, { bone: 'foot' + S, pos: [0.14 * k, 0.07, 0.06], taper: [0.88, 0.8], color: BOOT });
      pb.box(0.2, 0.1, 0.1, { bone: 'foot' + S, pos: [0.14 * k, 0.05, 0.2], taper: [0.9, 0.8], color: RIFT_IRON });      // steel toe
      pb.box(0.2, 0.05, 0.32, { bone: 'foot' + S, pos: [0.14 * k, 0.025, 0.06], color: LEATHER_D });                      // sole
    });

    // ================= hips / skirts
    pb.box(0.42, 0.2, 0.3, { bone: 'hips', pos: [0, 0.79, 0], color: TROUSER });
    pb.box(0.42, 0.48, 0.06, { bone: 'apronF', pos: [0, 0.66, 0.2], bottom: [1.14, 1], color: APRON });
    pb.box(0.48, 0.06, 0.07, { bone: 'apronF', pos: [0, 0.44, 0.2], color: CHAR });
    pb.box(0.12, 0.12, 0.05, { bone: 'apronF', pos: [0.1, 0.7, 0.235], color: LEATHER_D });                            // apron pocket
    pb.box(0.54, 0.54, 0.06, { bone: 'coatB', pos: [0, 0.63, -0.18], bottom: [1.2, 1], color: SOOT });
    pb.box(0.6, 0.06, 0.07, { bone: 'coatB', pos: [0, 0.38, -0.18], color: CHAR });
    pb.box(0.06, 0.32, 0.07, { bone: 'coatB', pos: [0, 0.55, -0.19], color: CHAR });                                  // back vent
    pb.mirror((S, k) => pb.box(0.07, 0.07, 0.05, { bone: 'coatB', pos: [0.1 * k, 0.8, -0.215], color: BRONZE_LO }));  // vent buttons
    pb.mirror((S, k) => pb.box(0.07, 0.42, 0.3, { bone: 'hips', pos: [0.275 * k, 0.7, -0.02], bottom: [1, 1.12], color: SOOT }));
    // forge hammer at the left hip
    pb.cyl(0.032, 0.032, 0.3, { bone: 'hips', pos: [0.34, 0.7, -0.02], radial: 5, color: WOOD });
    pb.box(0.1, 0.09, 0.17, { bone: 'hips', pos: [0.34, 0.56, -0.02], color: RIFT_IRON });

    // ================= torso
    pb.box(0.62, 0.44, 0.42, { bone: 'chest', pos: [0, 1.24, 0], taper: [1.1, 1.0], bottom: [0.9, 0.95], color: SOOT });
    pb.box(0.38, 0.34, 0.05, { bone: 'chest', pos: [0, 1.21, 0.2], color: APRON });                                   // apron bib
    pb.mirror((S, k) => pb.box(0.07, 0.26, 0.05, { bone: 'chest', pos: [0.15 * k, 1.42, 0.1], rot: [-0.6, 0, 0], color: APRON }));
    pb.mirror((S, k) => pb.box(0.07, 0.34, 0.05, { bone: 'chest', pos: [0.17 * k, 1.28, -0.21], color: LEATHER_D }));
    pb.cyl(0.25, 0.37, 0.17, { bone: 'chest', pos: [0, 1.47, 0], radial: 8, color: HOOD_D });                          // cowl over the shoulders
    pb.box(0.5, 0.22, 0.36, { bone: 'spine', pos: [0, 0.99, 0.01], color: SOOT });
    pb.cyl(0.28, 0.28, 0.1, { bone: 'spine', pos: [0, 0.93, 0], radial: 8, color: LEATHER_D });                        // belt
    pb.box(0.11, 0.14, 0.11, { bone: 'spine', pos: [-0.25, 0.87, 0.1], color: APRON });                                // pouch
    // Crownshard clasp = belt boss (crown point + Ember Prime gem), ×1.35 so it is a 0.22 m read
    pb.extrude(CROWN_PT.map(([x, y]) => [x * 1.35, y * 1.35]), 0.04, { bone: 'shard', pos: [0, 0.93, 0.29], color: BRONZE_HI, trim: true });
    pb.sphere(0.052, { bone: 'shard', pos: [0, 0.935, 0.32], seg: [5, 3], color: FIRE, emis: 2.6 });

    // ================= head: face, hood, goggles
    pb.box(0.34, 0.32, 0.32, { bone: 'head', pos: [0, 1.61, 0.09], taper: [0.9, 0.92], color: SKIN });
    pb.box(0.11, 0.11, 0.1, { bone: 'head', pos: [0, 1.585, 0.28], taper: [0.75, 0.8], color: SKIN_D });             // big nose
    pb.mirror((S, k) => {
      pb.box(0.06, 0.26, 0.26, { bone: 'head', pos: [0.195 * k, 1.6, 0.04], color: HOOD });                           // hood side flaps
      pb.box(0.07, 0.2, 0.15, { bone: 'head', pos: [0.165 * k, 1.53, 0.18], color: ASH_D });                          // mutton chops
      // forge goggles worn over the eyes: bronze rims, ember-lit lenses (the facing read)
      pb.cyl(0.075, 0.075, 0.06, { bone: 'head', pos: [0.088 * k, 1.665, 0.25], rot: [PI / 2, 0, 0], radial: 8, color: BRONZE_HI, trim: true });
      pb.sphere(0.056, { bone: 'head', pos: [0.088 * k, 1.665, 0.275], seg: [6, 3], rot: [PI / 2, 0, 0], scale: [1, 0.5, 1], color: FIRE_HI, emis: -1.5 });
      pb.box(0.06, 0.06, 0.2, { bone: 'head', pos: [0.17 * k, 1.665, 0.16], color: LEATHER_D });                       // strap stub into the hood
    });
    pb.sphere(0.22, { bone: 'head', pos: [0, 1.7, 0.06], scale: [1.1, 0.88, 1.12], seg: [8, 3], thetaLength: PI / 2, color: HOOD });      // hood cap
    pb.box(0.4, 0.3, 0.11, { bone: 'head', pos: [0, 1.6, -0.1], taper: [0.9, 1], color: HOOD });                     // hood back
    // liripipe: the hood's floppy tail, flopping back over the right shoulder
    ptCone(pb, [-0.04, 1.8, -0.1], [-0.24, 1.6, -0.36], 0.11, { bone: 'hood', radial: 5, color: HOOD });
    pb.sphere(0.06, { bone: 'hood', pos: [-0.25, 1.58, -0.37], seg: [5, 3], color: HOOD_D });                        // tassel knob

    // ================= beard (front read: big white wedge)
    pb.box(0.34, 0.32, 0.15, { bone: 'beard', pos: [0, 1.4, 0.22], bottom: [0.55, 0.75], color: ASH });
    pb.box(0.3, 0.07, 0.08, { bone: 'beard', pos: [0, 1.545, 0.27], color: ASH });                                    // moustache
    limb(pb, [0, 1.26, 0.24], [0, 1.1, 0.25], 0.05, 0.045, { bone: 'beard', radial: 5, color: ASH_D });               // braid
    pb.cyl(0.06, 0.06, 0.06, { bone: 'beard', pos: [0, 1.22, 0.245], radial: 6, color: BRONZE_HI, trim: true });     // bead

    // ================= left arm: sleeve, small pauldron, bare forearm with wraps, big hand
    limb(pb, [0.31, 1.38, 0], [0.34, 1.06, 0.02], 0.1, 0.09, { bone: 'armL', color: SOOT });
    pb.cyl(0.11, 0.11, 0.07, { bone: 'armL', pos: [0.335, 1.1, 0.015], radial: 7, color: APRON });
    pb.sphere(0.17, { bone: 'armL', pos: [0.34, 1.42, 0], scale: [1.2, 0.75, 1.15], seg: [7, 3], thetaLength: PI / 2, color: BRONZE, trim: true });
    pb.cyl(0.17, 0.15, 0.05, { bone: 'armL', pos: [0.34, 1.4, 0], radial: 7, scale: [1.2, 1, 1.15], color: BRONZE_LO });    // pauldron underside
    limb(pb, [0.34, 1.06, 0.02], [0.35, 0.84, 0.03], 0.085, 0.075, { bone: 'foreL', color: SKIN });
    pb.cyl(0.09, 0.09, 0.09, { bone: 'foreL', pos: [0.348, 0.9, 0.03], radial: 6, color: LINEN });
    pb.box(0.16, 0.16, 0.17, { bone: 'handL', pos: [0.35, 0.74, 0.04], taper: [1, 0.9], color: SKIN_D });
    pb.box(0.06, 0.09, 0.07, { bone: 'handL', pos: [0.27, 0.76, 0.09], color: SKIN_D });                              // thumb

    // ================= right arm: the BRAZIER-GAUNTLET (signature)
    limb(pb, [-0.31, 1.38, 0], [-0.34, 1.06, 0.02], 0.11, 0.1, { bone: 'armR', color: SOOT });
    pb.sphere(0.22, { bone: 'armR', pos: [-0.36, 1.43, 0], scale: [1.3, 0.82, 1.2], seg: [8, 3], thetaLength: PI / 2, color: BRONZE });
    for (let i = -1; i <= 1; i++) pb.box(0.055, 0.11, 0.2, { bone: 'armR', pos: [-0.36 + 0.09 * i, 1.56, 0], color: BRONZE_LO });   // vent fins
    pb.torus(0.27, 0.035, { bone: 'armR', pos: [-0.36, 1.43, 0], rot: [PI / 2, 0, 0], scale: [1.05, 1, 0.95], tubular: 3, radial: 10, color: BRONZE_HI, trim: true });
    pb.cyl(0.27, 0.2, 0.07, { bone: 'armR', pos: [-0.36, 1.4, 0], radial: 8, scale: [1.05, 1, 0.95], color: BRONZE_LO });  // pauldron underside
    pb.cyl(0.14, 0.165, 0.32, { bone: 'foreR', pos: [-0.345, 0.93, 0.03], radial: 8, color: RIFT_IRON });              // bracer body
    pb.cyl(0.15, 0.15, 0.05, { bone: 'foreR', pos: [-0.345, 1.08, 0.03], radial: 8, color: BRONZE_HI });
    pb.cyl(0.175, 0.175, 0.05, { bone: 'foreR', pos: [-0.345, 0.78, 0.03], radial: 8, color: BRONZE_HI, trim: true });
    pb.box(0.21, 0.21, 0.05, { bone: 'foreR', pos: [-0.345, 0.94, 0.17], color: BRONZE_LO });                          // window frame
    pb.box(0.15, 0.15, 0.04, { bone: 'foreR', pos: [-0.345, 0.94, 0.185], color: FIRE, emis: -2.2 });                  // coal window
    for (let i = 0; i < 2; i++) pb.box(0.2, 0.05, 0.05, { bone: 'foreR', pos: [-0.345, 0.91 + 0.06 * i, 0.2], color: RIFT_IRON }); // grille
    // the iron fist + bronze knuckle-duster
    // the fist: bronze, back-of-hand plate in front, a row of iron knuckle studs along the punching
    // (bottom) face with the palm core glowing behind them, thumb wrapped on the inner side
    pb.box(0.3, 0.27, 0.3, { bone: 'handR', pos: [-0.355, 0.675, 0.06], taper: [1.04, 1.04], bottom: [0.96, 0.96], color: BRONZE });
    pb.box(0.31, 0.17, 0.06, { bone: 'handR', pos: [-0.355, 0.69, 0.215], color: BRONZE_HI, trim: true });              // back-of-hand plate
    for (let i = 0; i < 4; i++) pb.box(0.065, 0.07, 0.09, { bone: 'handR', pos: [-0.46 + 0.07 * i, 0.545, 0.15], color: RIFT_IRON }); // knuckle studs
    pb.box(0.1, 0.15, 0.12, { bone: 'handR', pos: [-0.2, 0.67, 0.1], rot: [0, 0, 0.12], color: BRONZE_LO });            // thumb
    // palm core (muzzle) in a bronze ring on the punching face
    pb.torus(0.07, 0.03, { bone: 'focus', pos: [-0.355, 0.545, 0.0], rot: [PI / 2, 0, 0], tubular: 3, radial: 8, color: BRONZE_HI });
    pb.sphere(0.07, { bone: 'focus', pos: [-0.355, 0.545, 0.0], seg: [6, 3], scale: [1, 0.75, 1], color: FIRE, emis: 3.0 });
    // knuckle flames licking up off the back of the hand (flicker on their own bone)
    for (const dx of [-0.085, 0, 0.085]) ptCone(pb, [-0.355 + dx, 0.72, 0.23], [-0.355 + dx * 1.3, 0.86 - abs(dx) * 0.6, 0.29], 0.048, { bone: 'flames', radial: 4, color: FIRE_HI, emis: 2.6 });

    // ================= kiln pack + chimney (behind the left shoulder)
    pb.cyl(0.18, 0.21, 0.38, { bone: 'pack', pos: [0, 1.25, -0.35], radial: 8, color: BRONZE });
    pb.cyl(0.215, 0.215, 0.05, { bone: 'pack', pos: [0, 1.09, -0.35], radial: 8, color: RIFT_IRON });
    pb.cyl(0.19, 0.19, 0.05, { bone: 'pack', pos: [0, 1.43, -0.35], radial: 8, color: RIFT_IRON });
    pb.box(0.19, 0.16, 0.05, { bone: 'pack', pos: [0, 1.2, -0.55], color: RIFT_IRON });                                // door frame
    pb.box(0.13, 0.09, 0.04, { bone: 'pack', pos: [0, 1.2, -0.57], color: FIRE, emis: -2.2 });                         // fire door
    pb.cyl(0.075, 0.09, 0.58, { bone: 'chimney', pos: [CHIM_X, 1.72, -0.36], radial: 6, color: RIFT_IRON });
    pb.cyl(0.09, 0.09, 0.05, { bone: 'chimney', pos: [CHIM_X, 1.55, -0.36], radial: 6, color: BRONZE_LO });            // collar
    pb.cyl(0.135, 0.08, 0.11, { bone: 'chimney', pos: [CHIM_X, 2.02, -0.36], radial: 6, color: BRONZE_HI, trim: true });  // flared cap
    pb.cyl(0.1, 0.1, 0.03, { bone: 'chimney', pos: [CHIM_X, 2.065, -0.36], radial: 6, color: FIRE, emis: -2.5 });  // ember mouth
  },

  animate(L, s, B, H) {
    const t = s.t, phi = s.walk, m = H.moving, act = H.act, k = H.k;
    const lower = H.standing;
    rest(L, B, REST_PY);
    L.scl(B.root, HERO_S);                                   // hero scale (reads as the biggest humanoid)
    idle(L, s, B, H, IDLE);
    gait(L, s, B, H, GAIT, 'L');
    aimTwist(L, s, B, H);
    // brawler run: shoulders roll, the heavy fist swings out a little at each step
    const sp = H.sp, sn = sin(phi);
    L.add(B.chest, 0, 0, 0.06 * m * sn);
    L.add(B.armR, 0, 0, -0.08 * m * abs(sn));
    L.add(B.armL, 0, 0, 0.05 * m * abs(sn));
    L.add(B.foreL, -0.35 * m, 0, 0);                          // pumping forearm
    L.add(B.foreR, -0.2 * m, 0, 0);
    L.add(B.head, -0.08 * m * sp, 0, 0);                      // head up against the lean

    // ---- idle fidgets (knuckle crack ×2, beard stroke ×1)
    if (H.fidget > 0 && act === '') {
      const f = H.fidget, w = smooth(f / 0.18) * (1 - smooth((f - 0.82) / 0.18));
      if (H.fidgetN % 3 !== 2) {
        applyKey(L, B, F_CRACK, w, w, 1);
        L.add(B.handR, 0, 0.35 * sin(f * 4 * PI) * bump(f, 0.35, 0.85), 0.15 * bump(f, 0.55, 0.7));
        L.add(B.head, 0, 0, 0.12 * bump(f, 0.5, 0.75));
      } else {
        applyKey(L, B, F_BEARD, w, w, 1);
        L.add(B.foreL, 0.25 * sin(f * 6 * PI) * bump(f, 0.25, 0.85), 0, 0);
        L.add(B.beard, 0, 0, 0.1 * sin(f * 6 * PI) * bump(f, 0.25, 0.85));
      }
    }

    // ---- starter jab-jab stance + per-shot recoil (odd shot: gauntlet jab · even: left flick)
    const hold = H.hold;
    if (hold > 0) {
      applyKey(L, B, STANCE, hold, hold, lower);
      const sh = H.shot * hold;
      if (H.shotN & 1) {
        L.add(B.foreR, 0.38 * sh, 0, 0); L.add(B.armR, -0.15 * sh, 0, 0); L.add(B.handR, 0.15 * sh, 0, 0);
        L.add(B.chest, 0, 0.15 * sh, 0); L.mv(B.hips, 0, 0, -0.025 * sh);
        L.scl(B.focus, 1 + 0.25 * sh);
      } else {
        L.add(B.foreL, 1.15 * sh, 0, 0); L.add(B.armL, -0.85 * sh, 0.15 * sh, -0.12 * sh); L.add(B.handL, -0.5 * sh, 0, 0);
        L.add(B.chest, 0, -0.15 * sh, 0);
        L.scl(B.handL, 1 + 0.15 * sh);
      }
    }

    // ---- actions
    let wDash = 0, wSkid = 0, focusS = 1;
    if (act === 'heavy') {
      const W2 = twoKey(k, 0.18, 0.36, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, H_RAISE, H_SLAM, w1, w2, lower);
      focusS = 1 + 0.2 * w1 * (1 - w2) + 0.45 * w2;
    } else if (act === 'throw') {
      const W2 = twoKey(k, 0.2, 0.35, 0.5), w1 = W2[0], w2 = W2[1];
      action2(L, B, T_WIND, T_REL, w1, w2, lower);
      focusS = 1 + 0.35 * w2;
    } else if (act === 'nova') {
      const W2 = twoKey(k, 0.25, 0.4, 0.6), w1 = W2[0], w2 = W2[1];
      action2(L, B, N_GATHER, N_BURST, w1, w2, lower);
      focusS = 1 + 0.3 * w2;
    } else if (act === 'channel') {
      applyKey(L, B, CHANNEL, 1, 1, lower);
      L.mv(B.hips, 0, 0.02 * sin(t * 3) * lower, 0);
      L.add(B.focus, 0.03 * sin(t * 23), 0, 0);
      L.add(B.hood, 0.1 * sin(t * 11), 0, 0);
      focusS = 1.12 + 0.08 * sin(t * 8);
    } else if (act === 'dash') {
      // shoulder-charge while the dash runs, then a skid on the planted front foot
      wDash = smooth(k / 0.1) * (1 - smooth((k - DASH_SPLIT + 0.08) / 0.16));
      wSkid = smooth((k - DASH_SPLIT + 0.1) / 0.14) * (1 - smooth((k - 0.7) / 0.3));
      applyKey(L, B, D_CHARGE, wDash, wDash, 1);
      applyKey(L, B, D_SKID, wSkid, wSkid, 1);
      L.scl(B.root, 1 - 0.05 * wDash, 1 - 0.05 * wDash, 1 + 0.2 * wDash);
      focusS = 1 + 0.5 * wDash;
    } else if (act === 'arrive') {
      const w = 1 - smooth(k);
      applyKey(L, B, ARRIVE, w, w, 1);
    }

    // ---- secondary motion (bible §4.9; signs per the rig convention: +rx swings a hanging part back)
    const Wd = wind(H);
    const vb = Wd.vb, vs = Wd.vs;
    const thL = L.get(B.thighL, 0), thR = L.get(B.thighR, 0);
    const thMin = min(thL, thR, 0), thMax = max(thL, thR, 0);
    // apron: pushed forward by the leading thigh, never into the legs
    L.add(B.apronF, 0.85 * thMin + 0.12 * vb + 0.05 * sin(2 * phi) * m, 0, -0.25 * vs);
    // coat back: wind + kept clear of the trailing thigh
    const coat = (Wd.back ? 0.04 : 0.12 + 0.6 * vb) + 0.06 * sin(2 * phi - 0.5) * m + 0.35 * wDash;
    L.add(B.coatB, max(coat, 0.8 * thMax), 0, 0.3 * vs);
    // hood liripipe: streams back in the wind, bounces with the step
    L.add(B.hood, -0.35 * vb + 0.08 * sin(t * 2.3) + 0.1 * sin(2 * phi - 0.9) * m, 0, -0.3 * vs + 0.05 * sin(t * 1.7));
    // beard: lags the bob
    L.add(B.beard, 0.08 * m * sin(2 * phi - 0.6) + 0.15 * vb + 0.3 * s.hit, 0, 0);
    // pack jolts half a beat late, the chimney wobbles (and leans back in the wind)
    L.mv(B.pack, 0, 0.5 * GAIT.bob * m * (abs(cos(phi - 0.63)) - abs(cos(phi))), 0);
    L.add(B.pack, 0.04 * m * sin(2 * phi - 1.2), 0, 0);
    L.add(B.chimney, 0.12 * sin(2 * phi - 0.8) * m - 0.15 * vb - 0.3 * wDash + 0.08 * H.stomp, 0, 0.06 * sin(phi - 0.8) * m);

    // ---- focus: coal breathing + knuckle-flame flicker (harder with nearby Burn)
    const meter = H.meter;
    L.scl(B.focus, focusS * (1 + 0.06 * sin(t * 8.2)));
    const fl = 0.8 + 0.45 * (0.5 + 0.3 * sin(t * 9 + 1.3) + 0.2 * sin(t * 23.7));
    L.scl(B.flames, 1 + 0.1 * meter, fl * (1 + 0.35 * meter + 0.4 * H.shot), 1 + 0.1 * meter);
    // Crownshard clasp pulses at 2 + 4·meter Hz
    const cp = sin(t * 2 * PI * (2 + 4 * meter));
    L.scl(B.shard, 1 + (0.04 + 0.1 * meter) * max(0, cp));

    stomp(L, B, H, 0.05);
    hit(L, s, B, null);
    if (s.hit > 0) { L.add(B.apronF, 0.15 * s.hit, 0, 0); L.add(B.coatB, 0.2 * s.hit, 0, 0); L.add(B.hood, 0.3 * s.hit, 0, 0); }

    // ---- death: stagger → drop to one knee, fist planted → slump → Rift recall
    if (act === 'death') {
      const w = smooth((k - 0.12) / 0.33);
      applyKey(L, B, DEATH, w, w, 1);
      L.add(B.head, 0.25 * smooth((k - 0.5) / 0.2), 0, 0);
      deathCommon(L, B, k);
    } else if (act === 'victory') {
      // fist up with a knuckle-flame burst, then crossed arms (calm loop at k = 1)
      const w1 = smooth(k / 0.12) * (1 - smooth((k - 0.5) / 0.25));
      const w2 = smooth((k - 0.5) / 0.3);
      action2(L, B, V_FIST, V_CROSS, w1, w2, 1);
      const burst = bump(k, 0.06, 0.45);
      L.scl(B.focus, 1 + 0.5 * burst);
      L.scl(B.flames, 1 + 0.4 * burst, 1 + 1.6 * burst, 1 + 0.4 * burst);
      L.add(B.armR, -0.08 * bump(k, 0.1, 0.3), 0, 0);
      if (w2 > 0) {   // smug calm loop: slow breath, a nod now and then
        L.add(B.head, w2 * 0.06 * sin(t * 1.3) * sin(t * 0.47), 0, 0);
        L.mv(B.hips, 0, w2 * 0.008 * sin(t * 1.6), 0);
      }
    }
  },
});
