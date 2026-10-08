import * as THREE from 'three';
import { defineCreature, TAU, clamp01, smooth, bump } from './rig.js';

// =====================================================================================
//  ACT I · GREENSKINS  (design/research/03-creature-art.md §4.1 – §4.6)
//  husk → Goblin Grunt · imp → Goblin Scamp · brute → Forest Troll
//  spitter → Goblin Shaman · bloater → Broodmother · mite → Spiderling
//
//  Conventions: faces +Z, Y up, left = +X.  Part positions are MODEL-space.
//  Rotation signs (XYZ euler): +x pitches the top forward / swings a hanging limb BACK,
//  so "arm forward / up" is NEGATIVE rot.x.  Left-side +z lifts an arm outward.
// =====================================================================================

const LIME = 0xb8ff3c;
const SKIN = 0xa3bd3c, SKIN_L = 0xb9cf52, SKIN_D = 0x7f9a2c, SKIN_M = 0x93ad34;
const LEATHER = 0x4a2f1d, LEATHER_D = 0x2e1c10, RUST = 0x8a3b22, RUST_D = 0x6e2c18;
const BONE = 0xeadcb4, IRON = 0x9aa0a6, WOOD = 0x6b4426, FUR = 0x3a2a20;
const TROLL = 0x46727d, TROLL_L = 0x6e9aa3, TROLL_D = 0x3b5f68, MOSS = 0x7da83a, MOSS_D = 0x55782a, SHROOM = 0xa0452a;
const SPIDER = 0x2e2236, SPIDER_L = 0x4a3550, SPIDER_K = 0x6a4a74;

// ---- tiny allocation-free animation helpers --------------------------------------
const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min, pow = Math.pow;
// Melee swing envelopes (k = 0..1, strike lands k ≈ 0.08–0.2):
//   wind(k): 0 → 1 (raise, k<0.08) → 0 (chop 0.08..0.2).   follow(k): 0 → 1 (chop) → hold → 0 (recover, with a little overshoot)
const wind = (k) => (k < 0.08 ? smooth(k / 0.08) : k < 0.2 ? 1 - smooth((k - 0.08) / 0.12) : 0);
const follow = (k) => {
  if (k < 0.08) return 0;
  if (k < 0.2) return smooth((k - 0.08) / 0.12);
  if (k < 0.38) return 1;
  const r = (k - 0.38) / 0.62;
  return (1 - smooth(r)) * (1 + 0.12 * sin(r * 9) * (1 - r));
};
// stepped "random" flick 0..1 used for ear twitches
const flick = (t, ph, rate) => { const v = sin(t * rate + ph); return v > 0.93 ? (v - 0.93) / 0.07 : 0; };

// ---- build-time helpers (allocation is fine here) ---------------------------------
const mirrorPts = (pts, sign) => pts.map(([x, y]) => [x * sign, y]);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
// Placement of a Y-aligned primitive of length `len` spanning p0 → p1.
function span(p0, p1) {
  _a.set(p0[0], p0[1], p0[2]); _b.set(p1[0], p1[1], p1[2]);
  const len = _a.distanceTo(_b);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(UP, _b);
  _e.setFromQuaternion(_q, 'XYZ');
  return { len, pos: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], rot: [_e.x, _e.y, _e.z] };
}
// point base + dir * len
const along = (base, dir, len) => [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len];

// =====================================================================================
//  4.1  GOBLIN GRUNT
// =====================================================================================
const EAR_ROOT = [[0, 0.08], [0.2, 0.14], [0.29, 0.0], [0.2, -0.11], [0, -0.09]];
const EAR_TIP = [[0.2, 0.14], [0.52, 0.3], [0.29, 0.0]];

// cleaver outline in (forward u, up v) → extrude shape [-u, v]; rotated y = +π/2 so u points +Z
const CLEAVER_BODY = [[0.04, 0], [-0.05, 0.0], [-0.2, 0.06], [-0.2, 0.34], [-0.15, 0.44], [0.04, 0.46]];
const CLEAVER_EDGE = [[-0.2, 0.06], [-0.27, 0.12], [-0.27, 0.32], [-0.2, 0.34]];

export const goblinGrunt = defineCreature({
  id: 'goblinGrunt',
  stride: 1.3,
  blob: 0.6,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.45, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.5, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 0.95, 0.08] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.0, 0.14] },
    { name: 'earL', parent: 'head', pivot: [0.2, 1.2, -0.02] },
    { name: 'earR', parent: 'head', pivot: [-0.2, 1.2, -0.02] },
    { name: 'armL', parent: 'spine', pivot: [0.31, 0.9, 0] },
    { name: 'armR', parent: 'spine', pivot: [-0.31, 0.9, 0] },
    { name: 'weapon', parent: 'armR', pivot: [-0.31, 0.4, 0.04] },
    { name: 'legL', parent: 'hips', pivot: [0.12, 0.45, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.12, 0.45, 0] },
  ],
  build(pb) {
    // ---- torso: dark leather vest, skin belly poking out
    pb.box(0.54, 0.46, 0.38, { bone: 'spine', pos: [0, 0.74, 0], rot: [0.22, 0, 0], taper: [0.8, 0.85], color: LEATHER });
    pb.sphere(0.21, { bone: 'spine', pos: [0, 0.6, 0.13], scale: [1.15, 0.95, 0.9], seg: [6, 4], color: SKIN_M });
    // ---- hips: rust loincloth + belt
    pb.box(0.42, 0.2, 0.3, { bone: 'hips', pos: [0, 0.37, 0], bottom: [1.2, 1.15], color: RUST });
    pb.box(0.2, 0.2, 0.05, { bone: 'hips', pos: [0, 0.27, 0.17], rot: [-0.12, 0, 0], color: RUST_D });
    pb.box(0.47, 0.07, 0.35, { bone: 'hips', pos: [0, 0.48, 0], color: LEATHER_D });
    pb.box(0.08, 0.08, 0.04, { bone: 'hips', pos: [0, 0.48, 0.18], color: BONE });
    // ---- head
    pb.box(0.46, 0.38, 0.42, { bone: 'head', pos: [0, 1.15, 0.12], taper: [0.85, 0.9], color: SKIN });
    pb.box(0.44, 0.07, 0.1, { bone: 'head', pos: [0, 1.255, 0.3], color: SKIN_D });          // brow ridge
    pb.cone(0.075, 0.22, { bone: 'head', pos: [0, 1.09, 0.41], rot: [Math.PI / 2 + 0.3, 0, 0], radial: 5, color: SKIN_L });
    pb.sphere(0.245, { bone: 'head', pos: [0, 1.27, 0.1], scale: [1, 0.7, 0.98], seg: [8, 3], thetaLength: Math.PI / 2, color: LEATHER });
    pb.box(0.4, 0.05, 0.38, { bone: 'head', pos: [0, 1.27, 0.12], color: LEATHER_D, trim: true }); // cap band (T)
    pb.mirror((side, k) => {
      pb.sphere(0.058, { bone: 'head', pos: [0.1 * k, 1.2, 0.325], scale: [1.1, 1, 0.8], seg: [5, 3], color: LIME, emis: 2.5 });
      pb.box(0.16, 0.05, 0.05, { bone: 'head', pos: [0.1 * k, 1.262, 0.335], rot: [0, 0, 0.38 * k], color: LEATHER_D });
      // ears: flat leaf shapes, tipped up/back
      pb.extrude(mirrorPts(EAR_ROOT, k), 0.05, { bone: 'ear' + side, pos: [0.2 * k, 1.2, -0.02], rot: [-1.0, 0, 0], color: SKIN });
      pb.extrude(mirrorPts(EAR_TIP, k), 0.055, { bone: 'ear' + side, pos: [0.2 * k, 1.2, -0.02], rot: [-1.0, 0, 0], color: SKIN_D });
      // jaw fangs
      pb.cone(0.04, 0.12, { bone: 'jaw', pos: [0.11 * k, 1.05, 0.37], radial: 4, color: BONE });
    });
    pb.box(0.36, 0.1, 0.3, { bone: 'jaw', pos: [0, 0.97, 0.26], color: SKIN_M });
    // ---- arms
    pb.mirror((side, k) => {
      const b = 'arm' + side;
      pb.cyl(0.075, 0.065, 0.46, { bone: b, pos: [0.31 * k, 0.64, 0], radial: 6, color: SKIN });
      pb.box(0.15, 0.15, 0.15, { bone: b, pos: [0.31 * k, 0.36, 0.01], color: SKIN_D });
      pb.cyl(0.085, 0.085, 0.07, { bone: b, pos: [0.31 * k, 0.47, 0], radial: 6, color: LEATHER });
    });
    pb.sphere(0.15, { bone: 'armR', pos: [-0.33, 0.97, 0], scale: [1.25, 0.7, 1], seg: [6, 4], color: LEATHER });
    pb.cone(0.05, 0.17, { bone: 'armR', pos: [-0.39, 1.07, 0], rot: [0, 0, 0.5], radial: 5, color: BONE, trim: true });
    pb.sphere(0.1, { bone: 'armL', pos: [0.31, 0.92, 0], seg: [6, 3], color: SKIN });
    // ---- legs + boots
    pb.mirror((side, k) => {
      const b = 'leg' + side;
      pb.cyl(0.09, 0.07, 0.4, { bone: b, pos: [0.12 * k, 0.27, 0], radial: 6, color: SKIN });
      pb.box(0.18, 0.14, 0.3, { bone: b, pos: [0.12 * k, 0.07, 0.05], taper: [0.9, 0.85], color: LEATHER });
      pb.box(0.19, 0.05, 0.1, { bone: b, pos: [0.12 * k, 0.15, 0.0], color: LEATHER_D });
    });
    // ---- cleaver (blade up at rest; animate() tilts it)
    pb.cyl(0.035, 0.035, 0.3, { bone: 'weapon', pos: [-0.31, 0.42, 0.04], radial: 6, color: WOOD });
    pb.extrude(CLEAVER_BODY, 0.05, { bone: 'weapon', pos: [-0.31, 0.57, 0.04], rot: [0, Math.PI / 2, 0], color: IRON });
    pb.extrude(CLEAVER_EDGE, 0.055, { bone: 'weapon', pos: [-0.31, 0.57, 0.04], rot: [0, Math.PI / 2, 0], color: 0xd9dde0, trim: true });
    // ---- elite crown: bone-and-antler spikes
    pb.cone(0.05, 0.3, { bone: 'head', pos: [0, 1.58, 0.08], radial: 5, color: BONE, eliteOnly: true });
    pb.mirror((side, k) => pb.cone(0.04, 0.24, { bone: 'head', pos: [0.14 * k, 1.53, 0.06], rot: [0, 0, -0.45 * k], radial: 5, color: BONE, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, ph = s.seed * TAU, m = s.move, w = s.walk;
    const sw = sin(w), cw = cos(w);
    const atk = s.action === 'attack' ? s.k : -1;
    const wd = atk >= 0 ? wind(atk) : 0, fl = atk >= 0 ? follow(atk) : 0;
    const hit = s.hit;
    const idle = 1 - m;

    // ---- breathing / idle
    const breath = sin(t * 3 + ph);
    P.scale(B.spine, 1, 1 + 0.025 * breath * idle, 1);
    P.move(B.hips, 0, -0.012 * (0.5 + 0.5 * breath) * idle, 0);
    P.rot(B.hips, 0, 0, sin(t * 1.1 + ph) * 0.03 * idle);
    P.rot(B.head, 0, sin(t * 0.7 + ph) * sin(t * 1.9 + ph * 2) * 0.3 * idle, 0);
    P.rot(B.earL, 0, 0, 0.35 + 0.22 * flick(t, ph * 3, 2.3) + 0.04 * sin(t * 2.5 + ph) * idle);
    P.rot(B.earR, 0, 0, -0.35 - 0.22 * flick(t, ph * 5 + 1, 1.9) - 0.04 * sin(t * 2.2 + ph) * idle);

    // ---- walk: bouncy waddle
    const A = 0.65 * m;
    P.rot(B.legL, sw * A, 0, 0);
    P.rot(B.legR, -sw * A, 0, 0);
    P.move(B.hips, 0, abs(cw) * 0.07 * m, 0);
    P.rot(B.hips, 0, sw * 0.12 * m, sw * 0.07 * m);
    P.rot(B.spine, 0.14 + 0.1 * m, -sw * 0.16 * m, -sw * 0.05 * m);
    P.rot(B.head, -0.12 * m + sin(w * 2 + 0.7) * 0.05 * m, sw * 0.1 * m, 0);
    const earF = 0.22 * abs(sin(w + 0.5)) * m;
    P.rot(B.earL, 0, -0.15 * m, -earF);
    P.rot(B.earR, 0, 0.15 * m, earF);
    P.rot(B.armL, 0.6 * sw * A + 0.7 * wd - 0.55 * fl, 0, 0.1 + 0.35 * wd);

    // ---- right arm + cleaver (rest: out to the side, blade up & forward)
    let armX = -0.45 + 0.35 * sw * m;
    let net = 0.5 + 0.12 * sin(t * 1.6 + ph) * idle + 0.1 * cw * m;
    let armZ = -0.28 - 0.04 * m;
    armX += (-2.35 - armX) * wd + (-0.8 - armX) * fl;
    net += (0.15 - net) * wd + (1.95 - net) * fl;
    armZ += (-0.35 - armZ) * wd;
    P.rot(B.armR, armX, 0, armZ);
    P.rot(B.weapon, net - armX, 0, 0);

    // ---- attack body
    P.rot(B.spine, -0.35 * wd + 0.38 * fl, 0.15 * fl, 0);
    P.move(B.hips, 0, 0.04 * wd, 0.14 * fl);
    P.rot(B.head, 0.1 * fl - 0.12 * wd, 0, 0);
    P.rot(B.jaw, 0.55 * wd + 0.3 * fl, 0, 0);
    P.rot(B.earL, 0, -0.5 * wd, -0.3 * fl);
    P.rot(B.earR, 0, 0.5 * wd, 0.3 * fl);
    P.rot(B.legL, -0.4 * fl + 0.1 * wd, 0, 0);
    P.rot(B.legR, 0.35 * fl, 0, 0);

    // ---- hit recoil: ears flatten, head snaps back
    P.rot(B.spine, -0.3 * hit, 0, 0);
    P.rot(B.head, -0.25 * hit, 0, 0);
    P.move(B.hips, 0, 0, -0.07 * hit);
    P.rot(B.earL, 0, 0.3 * hit, -0.6 * hit);
    P.rot(B.earR, 0, -0.3 * hit, 0.6 * hit);
    P.rot(B.jaw, 0.4 * hit, 0, 0);
  },
});

// =====================================================================================
//  4.2  GOBLIN SCAMP  (swarmer: low forward wedge, bone skull-cap, ears swept back)
// =====================================================================================
const EAR_BACK = [[-0.075, 0], [0.075, 0], [0.1, 0.12], [0.01, 0.38], [-0.07, 0.13]];

export const goblinScamp = defineCreature({
  id: 'goblinScamp',
  stride: 1.9,
  blob: 0.5,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.34, -0.15] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.38, -0.1] },
    { name: 'head', parent: 'spine', pivot: [0, 0.5, 0.22] },
    { name: 'jaw', parent: 'head', pivot: [0, 0.46, 0.34] },
    { name: 'earL', parent: 'head', pivot: [0.16, 0.6, 0.27] },
    { name: 'earR', parent: 'head', pivot: [-0.16, 0.6, 0.27] },
    { name: 'armL', parent: 'spine', pivot: [0.2, 0.5, 0.12] },
    { name: 'armR', parent: 'spine', pivot: [-0.2, 0.5, 0.12] },
    { name: 'legL', parent: 'hips', pivot: [0.1, 0.34, -0.14] },
    { name: 'legR', parent: 'hips', pivot: [-0.1, 0.34, -0.14] },
    { name: 'scarf', parent: 'spine', pivot: [0, 0.54, -0.2] },
  ],
  build(pb) {
    // torso: horizontal leather bar
    pb.box(0.36, 0.5, 0.3, { bone: 'spine', pos: [0, 0.45, 0.0], rot: [1.25, 0, 0], color: LEATHER });
    pb.box(0.32, 0.2, 0.28, { bone: 'hips', pos: [0, 0.34, -0.2], bottom: [1.1, 1.1], color: RUST });
    // head
    pb.box(0.36, 0.3, 0.34, { bone: 'head', pos: [0, 0.56, 0.36], taper: [0.8, 0.85], color: SKIN_L });
    // bone skull cap (top-plane identity) + back-swept horns (T)
    pb.sphere(0.22, { bone: 'head', pos: [0, 0.65, 0.34], scale: [1, 0.6, 1.2], seg: [6, 3], thetaLength: Math.PI / 2, color: BONE });
    pb.box(0.4, 0.06, 0.1, { bone: 'head', pos: [0, 0.665, 0.5], color: 0xcdbd90 }); // skull brow
    pb.mirror((side, k) => {
      pb.cone(0.05, 0.17, { bone: 'head', pos: [0.13 * k, 0.74, 0.22], rot: [-0.8, 0, -0.25 * k], radial: 4, color: BONE, trim: true });
      pb.sphere(0.07, { bone: 'head', pos: [0.1 * k, 0.6, 0.52], scale: [1.1, 1.1, 0.8], seg: [4, 2], color: LIME, emis: 2.8 });
      // ears swept straight back like a dart
      pb.extrude(EAR_BACK, 0.055, { bone: 'ear' + side, pos: [0.17 * k, 0.6, 0.27], rot: [-1.27, 0, -0.5 * k], color: SKIN });
      // arms (front legs when sprinting) + hands
      pb.cyl(0.065, 0.055, 0.4, { bone: 'arm' + side, pos: [0.2 * k, 0.3, 0.12], radial: 5, color: SKIN });
      pb.box(0.12, 0.1, 0.14, { bone: 'arm' + side, pos: [0.2 * k, 0.09, 0.14], color: SKIN_D });
      // hind legs + feet
      pb.cyl(0.075, 0.06, 0.3, { bone: 'leg' + side, pos: [0.1 * k, 0.19, -0.14], radial: 5, color: SKIN });
      pb.box(0.12, 0.07, 0.2, { bone: 'leg' + side, pos: [0.1 * k, 0.035, -0.09], color: LEATHER });
    });
    // grin: dark mouth + bone teeth on the jaw
    pb.box(0.26, 0.08, 0.2, { bone: 'jaw', pos: [0, 0.43, 0.46], color: LEATHER_D });
    pb.box(0.06, 0.07, 0.06, { bone: 'jaw', pos: [-0.08, 0.49, 0.55], color: BONE });
    pb.box(0.06, 0.07, 0.06, { bone: 'jaw', pos: [0.08, 0.49, 0.55], color: BONE });
    // trailing rag scarf (T)
    pb.box(0.22, 0.07, 0.3, { bone: 'scarf', pos: [0, 0.54, -0.36], rot: [0.1, 0, 0], color: RUST, trim: true });
    // elite crown
    pb.cone(0.05, 0.26, { bone: 'head', pos: [0, 0.88, 0.34], radial: 4, color: BONE, eliteOnly: true });
    pb.mirror((side, k) => pb.cone(0.04, 0.2, { bone: 'head', pos: [0.13 * k, 0.84, 0.3], rot: [0, 0, -0.5 * k], radial: 4, color: BONE, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, ph = s.seed * TAU, m = s.move, w = s.walk;
    const sw = sin(w), cw = cos(w);
    const atk = s.action === 'attack' ? s.k : -1;
    const hit = s.hit, idle = 1 - m;
    const pounce = atk >= 0 ? bump(atk, 0.0, 0.42) : 0;            // 0..1..0 arc
    const crouch = atk >= 0 ? (atk < 0.12 ? smooth(atk / 0.12) : 0) : 0;
    const reach = atk >= 0 ? (atk < 0.12 ? 0 : atk < 0.3 ? smooth((atk - 0.12) / 0.18) : 1 - smooth((atk - 0.3) / 0.7)) : 0;

    // idle: stands half-up, skull looks around, giggle-shake bursts
    const stand = idle * (1 - pounce);
    const giggle = pow(max(0, sin(t * 0.9 + ph * 2)), 10);
    P.rot(B.spine, -0.45 * stand + 0.04 * sin(t * 3.2 + ph) * idle, 0, 0);
    P.rot(B.armL, 0.45 * stand, 0, 0);
    P.rot(B.armR, 0.45 * stand, 0, 0);
    P.rot(B.head, 0.3 * stand, sin(t * 1.3 + ph) * sin(t * 0.6 + ph) * 0.6 * idle, 0);
    P.rot(B.hips, 0, 0, sin(t * 32) * 0.06 * giggle * idle);
    P.rot(B.jaw, 0.25 * giggle * idle * (0.5 + 0.5 * sin(t * 28)), 0, 0);
    P.rot(B.earL, 0, 0, 0.15 * flick(t, ph * 3, 2.1) + 0.03 * sin(t * 2 + ph));
    P.rot(B.earR, 0, 0, -0.15 * flick(t, ph * 5, 1.7) - 0.03 * sin(t * 2.3 + ph));

    // gallop: arms paired, legs paired, pairs half a cycle apart
    const A = 0.95 * m;
    P.rot(B.armL, -sw * A, 0, 0);
    P.rot(B.armR, -sw * A, 0, 0);
    P.rot(B.legL, sw * A * 0.9, 0, 0);
    P.rot(B.legR, sw * A * 0.9, 0, 0);
    P.move(B.hips, 0, max(0, cw) * 0.09 * m + 0.02 * abs(sw) * m, 0);
    P.rot(B.hips, 0.06 * sw * m, 0, 0);
    P.rot(B.spine, 0.08 * m + 0.14 * sw * m, 0, 0);
    P.rot(B.head, -0.14 * sw * m - 0.08 * m, 0, 0);          // keeps the head level
    P.rot(B.scarf, -0.3 * m + sin(t * 22 + ph) * 0.3 * m + sin(t * 3) * 0.05, sin(t * 17) * 0.15 * m, 0);
    P.rot(B.earL, 0.0, -0.1 * m, 0.1 * sin(t * 20) * m);
    P.rot(B.earR, 0.0, 0.1 * m, 0.1 * sin(t * 20 + 1) * m);
    P.scale(B.root, 1, 1, 1 + 0.08 * min(1, s.speed / 5.6) * m);

    // pounce
    P.move(B.hips, 0, 0.25 * pounce - 0.05 * crouch, 0.28 * reach);
    P.rot(B.spine, 0.2 * crouch - 0.1 * reach, 0, 0);
    P.rot(B.armL, 0.9 * crouch - 1.7 * reach, 0, 0);
    P.rot(B.armR, 0.9 * crouch - 1.7 * reach, 0, 0);
    P.rot(B.legL, 0.6 * crouch + 0.7 * reach, 0, 0);
    P.rot(B.legR, 0.6 * crouch + 0.7 * reach, 0, 0);
    P.rot(B.jaw, 0.7 * reach, 0, 0);
    P.rot(B.earL, 0, 0, -0.3 * reach);
    P.rot(B.earR, 0, 0, 0.3 * reach);

    // hit
    P.rot(B.spine, -0.3 * hit, 0, 0);
    P.rot(B.head, 0, 0, 0.3 * hit * sin(t * 60));
    P.move(B.hips, 0, 0, -0.06 * hit);
    P.rot(B.jaw, 0.5 * hit, 0, 0);
  },
});

// =====================================================================================
//  4.3  FOREST TROLL  (tank: a block with tusks, orange mohawk and a log club)
// =====================================================================================
export const forestTroll = defineCreature({
  id: 'forestTroll',
  stride: 2.0,
  blob: 1.05,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.9, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 1.0, -0.05] },
    { name: 'head', parent: 'spine', pivot: [0, 2.1, 0.55] },
    { name: 'jaw', parent: 'head', pivot: [0, 2.1, 0.8] },
    { name: 'armL', parent: 'spine', pivot: [0.85, 2.0, 0] },
    { name: 'foreL', parent: 'armL', pivot: [0.85, 1.3, 0] },
    { name: 'armR', parent: 'spine', pivot: [-0.85, 2.0, 0] },
    { name: 'foreR', parent: 'armR', pivot: [-0.85, 1.3, 0] },
    { name: 'weapon', parent: 'foreR', pivot: [-0.85, 0.45, 0.05] },
    { name: 'legL', parent: 'hips', pivot: [0.35, 0.9, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.35, 0.9, 0] },
  ],
  build(pb) {
    // ---- torso
    pb.box(1.4, 1.0, 0.9, { bone: 'spine', pos: [0, 1.6, 0.05], rot: [0.3, 0, 0], taper: [1.25, 1.1], color: TROLL });
    pb.sphere(0.5, { bone: 'spine', pos: [0, 1.25, 0.4], scale: [1, 0.85, 0.9], seg: [6, 4], color: TROLL_L });
    // shoulder moss, back moss mat + mushrooms
    pb.mirror((side, k) => {
      pb.sphere(0.3, { bone: 'spine', pos: [0.8 * k, 2.08, -0.1], scale: [1.1, 0.5, 1.0], seg: [6, 3], color: MOSS });
      pb.sphere(0.15, { bone: 'spine', pos: [0.95 * k, 2.12, 0.12], scale: [1, 0.7, 1], seg: [4, 3], color: MOSS_D });
    });
    pb.sphere(0.6, { bone: 'spine', pos: [0, 1.98, -0.4], scale: [1.0, 0.4, 0.9], seg: [6, 4], color: MOSS_D });
    for (const [x, y, z, r] of [[-0.3, 2.14, -0.45, 0.15], [0.25, 2.2, -0.6, 0.18], [0.05, 2.15, -0.15, 0.13]]) {
      pb.sphere(r, { bone: 'spine', pos: [x, y, z], scale: [1, 0.7, 1], seg: [5, 3], thetaLength: Math.PI / 2, color: SHROOM });
    }
    // ---- head (small, thrust forward between the shoulders)
    pb.box(0.62, 0.52, 0.6, { bone: 'head', pos: [0, 2.32, 0.8], taper: [0.82, 0.85], color: TROLL });
    for (let i = 0; i < 5; i++) pb.cone(0.11, 0.34 - 0.04 * Math.abs(i - 2), { bone: 'head', pos: [0, 2.7, 0.58 + i * 0.13], rot: [-0.2, 0, 0], radial: 5, color: 0xc9602a });
    pb.box(0.64, 0.13, 0.18, { bone: 'head', pos: [0, 2.46, 1.07], color: TROLL_D });
    pb.cone(0.1, 0.26, { bone: 'head', pos: [0, 2.27, 1.2], rot: [Math.PI / 2 + 0.35, 0, 0], radial: 5, color: TROLL_L });
    pb.mirror((side, k) => {
      pb.sphere(0.065, { bone: 'head', pos: [0.15 * k, 2.37, 1.08], seg: [4, 3], color: LIME, emis: 2.5 });
      // tusks: ivory, curved up/out, gold caps (T)
      const d = [0.247 * k, 0.851, 0.464];
      const base = [0.2 * k, 2.12, 1.14];
      pb.cone(0.09, 0.46, { bone: 'jaw', pos: along(base, d, 0.23), rot: [0.5, 0, -0.25 * k], radial: 4, color: BONE });
      pb.cone(0.055, 0.16, { bone: 'jaw', pos: along(base, d, 0.44), rot: [0.5, 0, -0.25 * k], radial: 4, color: BONE, trim: true });
    });
    pb.box(0.54, 0.17, 0.46, { bone: 'jaw', pos: [0, 2.12, 0.96], color: TROLL_D });
    // ---- arms (upper + forearm Popeye + fist)
    pb.mirror((side, k) => {
      pb.cyl(0.21, 0.19, 0.72, { bone: 'arm' + side, pos: [0.85 * k, 1.65, 0], radial: 6, color: TROLL });
      pb.cyl(0.26, 0.21, 0.78, { bone: 'fore' + side, pos: [0.85 * k, 0.91, 0], radial: 6, color: TROLL });
      pb.box(0.5, 0.14, 0.5, { bone: 'fore' + side, pos: [0.85 * k, 0.62, 0], color: LEATHER });
      pb.box(0.38, 0.34, 0.38, { bone: 'fore' + side, pos: [0.85 * k, 0.42, 0.03], taper: [0.85, 0.85], color: TROLL_D });
    });
    // ---- legs + feet
    pb.mirror((side, k) => {
      pb.cyl(0.27, 0.23, 0.9, { bone: 'leg' + side, pos: [0.35 * k, 0.48, 0], radial: 6, color: TROLL });
      pb.box(0.44, 0.18, 0.6, { bone: 'leg' + side, pos: [0.35 * k, 0.09, 0.1], taper: [0.9, 0.8], color: TROLL_D });
    });
    // ---- loincloth + belt
    pb.box(0.92, 0.5, 0.62, { bone: 'hips', pos: [0, 0.82, 0], bottom: [1.3, 1.2], color: LEATHER });
    pb.box(1.0, 0.12, 0.66, { bone: 'hips', pos: [0, 1.07, 0], color: RUST });
    pb.box(0.16, 0.16, 0.06, { bone: 'hips', pos: [0, 1.07, 0.35], color: BONE });
    // ---- log club (held head-down; animate() orients it)
    pb.cyl(0.17, 0.33, 1.6, { bone: 'weapon', pos: [-0.85, -0.15, 0.05], radial: 7, color: 0x5b3a22 });
    pb.cyl(0.35, 0.35, 0.12, { bone: 'weapon', pos: [-0.85, -0.55, 0.05], radial: 7, color: IRON, trim: true });
    pb.cyl(0.3, 0.3, 0.05, { bone: 'weapon', pos: [-0.85, -0.96, 0.05], radial: 7, color: 0xc8a46a });
    pb.sphere(0.15, { bone: 'weapon', pos: [-1.05, -0.3, 0.1], scale: [1, 0.8, 1], seg: [5, 3], color: MOSS });
    pb.box(0.15, 0.15, 0.15, { bone: 'weapon', pos: [-0.68, -0.35, 0.2], rot: [0.4, 0.5, 0.2], color: 0x8c8c84, trim: true });
    // ---- elite crown
    pb.cone(0.07, 0.45, { bone: 'head', pos: [0, 3.0, 0.9], radial: 5, color: BONE, eliteOnly: true });
    pb.mirror((side, k) => pb.cone(0.06, 0.38, { bone: 'head', pos: [0.2 * k, 2.9, 0.85], rot: [0, 0, -0.4 * k], radial: 5, color: BONE, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, ph = s.seed * TAU, m = s.move, w = s.walk;
    const sw = sin(w), cw = cos(w);
    const atk = s.action === 'attack' ? s.k : -1;
    // slam: raise 0→0.1, slam 0.1→0.2, hold, recover
    let up = 0, sl = 0;
    if (atk >= 0) {
      if (atk < 0.1) up = smooth(atk / 0.1);
      else if (atk < 0.2) { up = 1 - smooth((atk - 0.1) / 0.1); sl = 1 - up; }
      else if (atk < 0.45) sl = 1;
      else sl = 1 - smooth((atk - 0.45) / 0.55);
    }
    const hit = s.hit, idle = 1 - m;

    // idle: heavy breathing (0.4 Hz), occasional head scratch with the left hand
    const breath = sin(t * TAU * 0.4 + ph);
    P.scale(B.spine, 1, 1 + 0.03 * breath * idle, 1);
    P.rot(B.spine, 0.1 + 0.015 * breath * idle, 0, 0);
    P.rot(B.head, 0.05 * breath * idle, sin(t * 0.5 + ph) * 0.12 * idle, 0);
    const cyc = (t / 6 + s.seed) % 1;
    const scratch = cyc < 0.22 ? bump(cyc, 0, 0.22) : 0;
    const sc = smooth(min(1, scratch * 3)) * idle * (atk < 0 ? 1 : 0);
    P.rot(B.armL, -2.2 * sc, 0, -0.35 * sc);
    P.rot(B.foreL, -0.9 * sc + 0.2 * sin(t * 14) * sc, 0, 0);
    P.rot(B.head, 0.0, -0.2 * sc, 0.1 * sc);

    // lumber: A 0.35, slow heavy roll, club tip drags, footfall squash
    const A = 0.35 * m;
    P.rot(B.legL, sw * A, 0, 0);
    P.rot(B.legR, -sw * A, 0, 0);
    P.move(B.hips, 0, abs(cw) * 0.06 * m, 0);
    P.rot(B.hips, 0, sw * 0.1 * m, sw * 0.12 * m);
    P.rot(B.spine, 0.06 * m, -sw * 0.12 * m, -sw * 0.1 * m);
    P.rot(B.head, 0, sw * 0.08 * m, sw * 0.04 * m);
    P.rot(B.armL, 0.4 * sw * m, 0, 0.05 * m);
    P.scale(B.root, 1 + 0.01 * pow(max(0, -cos(2 * w)), 6) * m, 1 - 0.03 * pow(max(0, -cos(2 * w)), 6) * m, 1);

    // right arm + club (rest: club dragging head-forward on the ground)
    const restRX = -0.25 + 0.2 * -sw * m, restFX = -0.2;
    const restNet = 5.18 + 0.06 * sw * m;
    // slam targets: arms overhead, club head up-and-back; then club down in front
    let aX = restRX + (-2.6 - restRX) * up + (-0.75 - restRX) * sl;
    let fX = restFX + (-0.5 - restFX) * up + (-0.25 - restFX) * sl;
    let net = restNet + (2.9 - restNet) * up + (5.5 - restNet) * sl;
    P.rot(B.armR, aX, 0, -0.18 + 0.12 * up);
    P.rot(B.foreR, fX, 0, 0);
    P.rot(B.weapon, net - aX - fX, 0, -0.12 * (1 - up - sl));
    // left arm follows the slam
    P.rot(B.armL, -2.5 * up - 0.8 * sl, 0, -0.45 * (up + sl));
    P.rot(B.foreL, -0.5 * up - 0.3 * sl, 0, 0);
    // body for the slam
    P.rot(B.spine, -0.25 * up + 0.4 * sl, 0, 0);
    P.rot(B.head, 0.1 * up + 0.15 * sl, 0, 0);
    P.move(B.hips, 0, 0.1 * up - 0.12 * sl, 0.12 * sl);
    P.rot(B.jaw, 0.5 * up + 0.2 * sl, 0, 0);

    // hit: knockback resistant — only sways
    P.rot(B.spine, -0.1 * hit, 0, 0.06 * hit * sin(t * 40));
    P.rot(B.head, -0.15 * hit, 0, 0);
  },
});

// =====================================================================================
//  4.4  GOBLIN SHAMAN  (ranged: skull-and-antler mask, bone staff with a lime orb)
// =====================================================================================
export const goblinShaman = defineCreature({
  id: 'goblinShaman',
  stride: 1.1,
  blob: 0.62,
  muzzle: [-0.3, 1.8, 0.45],
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.45, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.5, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 0.95, 0.08] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.0, 0.14] },
    { name: 'earL', parent: 'head', pivot: [0.2, 1.2, -0.02] },
    { name: 'earR', parent: 'head', pivot: [-0.2, 1.2, -0.02] },
    { name: 'armL', parent: 'spine', pivot: [0.31, 0.9, 0] },
    { name: 'armR', parent: 'spine', pivot: [-0.31, 0.9, 0] },
    { name: 'foreR', parent: 'armR', pivot: [-0.31, 0.65, 0] },
    { name: 'weapon', parent: 'foreR', pivot: [-0.33, 0.4, 0.14] },
    { name: 'orb', parent: 'weapon', pivot: [-0.33, 2.08, 0.14] },
    { name: 'legL', parent: 'hips', pivot: [0.11, 0.45, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.11, 0.45, 0] },
  ],
  build(pb) {
    // ---- body: rust sash vest, fur shawl, bare legs
    pb.box(0.5, 0.45, 0.36, { bone: 'spine', pos: [0, 0.74, 0], rot: [0.28, 0, 0], taper: [0.85, 0.9], color: RUST });
    pb.sphere(0.19, { bone: 'spine', pos: [0, 0.6, 0.12], scale: [1.1, 0.9, 0.85], seg: [6, 4], color: SKIN_M });
    pb.cyl(0.3, 0.46, 0.28, { bone: 'spine', pos: [0, 1.0, 0.02], rot: [0.12, 0, 0], radial: 8, open: true, color: FUR });
    pb.box(0.4, 0.2, 0.3, { bone: 'hips', pos: [0, 0.36, 0], bottom: [1.2, 1.15], color: LEATHER });
    pb.box(0.18, 0.2, 0.05, { bone: 'hips', pos: [0, 0.27, 0.17], rot: [-0.12, 0, 0], color: RUST });
    pb.box(0.45, 0.07, 0.34, { bone: 'hips', pos: [0, 0.48, 0], color: LEATHER_D });
    pb.mirror((side, k) => pb.box(0.1, 0.12, 0.1, { bone: 'hips', pos: [0.26 * k, 0.4, 0.06], color: LEATHER }));
    // ---- head: skin skull + bone mask with glowing eyes
    pb.box(0.44, 0.38, 0.42, { bone: 'head', pos: [0, 1.15, 0.12], taper: [0.85, 0.9], color: SKIN });
    pb.box(0.42, 0.34, 0.12, { bone: 'head', pos: [0, 1.16, 0.33], taper: [0.88, 1], color: BONE });
    pb.box(0.2, 0.07, 0.05, { bone: 'head', pos: [0, 1.31, 0.4], color: 0xcdbd90 });
    pb.box(0.06, 0.07, 0.05, { bone: 'head', pos: [0, 1.1, 0.4], color: LEATHER_D });
    pb.mirror((side, k) => {
      pb.box(0.14, 0.12, 0.04, { bone: 'head', pos: [0.1 * k, 1.2, 0.39], color: LEATHER_D });
      pb.sphere(0.05, { bone: 'head', pos: [0.1 * k, 1.2, 0.41], seg: [4, 3], color: LIME, emis: 2.5 });
      // antlers: main beam + tine + glowing tip
      const dm = [0.48 * k, 0.87, -0.1], base = [0.13 * k, 1.3, 0.02];
      pb.cone(0.055, 0.4, { bone: 'head', pos: along(base, dm, 0.2), rot: [-0.1, 0, -0.5 * k], radial: 5, color: BONE });
      pb.cone(0.04, 0.12, { bone: 'head', pos: along(base, dm, 0.44), rot: [-0.1, 0, -0.5 * k], radial: 4, color: LIME, emis: 2 });
      const b2 = along(base, dm, 0.14), d2 = [0.9 * k, 0.43, 0.05];
      pb.cone(0.04, 0.22, { bone: 'head', pos: along(b2, d2, 0.1), rot: [0.0, 0, -1.1 * k], radial: 4, color: BONE });
      pb.cone(0.035, 0.09, { bone: 'head', pos: along(b2, d2, 0.24), rot: [0.0, 0, -1.1 * k], radial: 4, color: LIME, emis: 2 });
      // ears (smaller, drooping) + rust feather behind
      pb.extrude(mirrorPts(EAR_ROOT, k), 0.05, { bone: 'ear' + side, pos: [0.2 * k, 1.2, -0.02], rot: [-0.9, 0, 0], scale: 0.85, color: SKIN });
      pb.extrude(mirrorPts(EAR_TIP, k), 0.055, { bone: 'ear' + side, pos: [0.2 * k, 1.2, -0.02], rot: [-0.9, 0, 0], scale: 0.85, color: SKIN_D });
      pb.box(0.06, 0.26, 0.09, { bone: 'head', pos: [0.28 * k, 1.12, -0.1], rot: [0, 0, 0.25 * k], color: RUST });
      // limbs
      pb.cyl(0.07, 0.06, 0.4, { bone: 'leg' + side, pos: [0.11 * k, 0.27, 0], radial: 5, color: SKIN });
      pb.box(0.17, 0.14, 0.28, { bone: 'leg' + side, pos: [0.11 * k, 0.07, 0.05], taper: [0.9, 0.85], color: LEATHER });
    });
    pb.box(0.34, 0.1, 0.28, { bone: 'jaw', pos: [0, 0.97, 0.22], color: SKIN_M });
    // ---- arms
    pb.cyl(0.07, 0.065, 0.46, { bone: 'armL', pos: [0.31, 0.64, 0], radial: 5, color: SKIN });
    pb.box(0.15, 0.15, 0.15, { bone: 'armL', pos: [0.31, 0.36, 0.01], color: SKIN_D });
    pb.cyl(0.075, 0.07, 0.26, { bone: 'armR', pos: [-0.31, 0.78, 0], radial: 6, color: SKIN });
    pb.cyl(0.07, 0.065, 0.28, { bone: 'foreR', pos: [-0.31, 0.51, 0], radial: 5, color: SKIN });
    pb.box(0.16, 0.14, 0.16, { bone: 'foreR', pos: [-0.33, 0.38, 0.1], color: SKIN_D });
    // ---- staff: gnarled wooden pole, skull, caged lime orb
    pb.cyl(0.04, 0.05, 1.0, { bone: 'weapon', pos: [-0.33, 0.5, 0.14], radial: 5, color: WOOD });
    pb.sphere(0.065, { bone: 'weapon', pos: [-0.33, 1.0, 0.14], seg: [4, 3], color: 0x55361e });
    pb.cyl(0.04, 0.045, 0.85, { bone: 'weapon', pos: [-0.315, 1.43, 0.14], rot: [0, 0, 0.03], radial: 5, color: WOOD });
    pb.sphere(0.13, { bone: 'weapon', pos: [-0.31, 1.88, 0.15], scale: [1, 0.9, 1.15], seg: [5, 3], color: BONE });
    pb.box(0.14, 0.05, 0.1, { bone: 'weapon', pos: [-0.31, 1.77, 0.23], color: 0xcdbd90 });
    pb.mirror((side, k) => pb.box(0.05, 0.06, 0.04, { bone: 'weapon', pos: [-0.31 + 0.05 * k, 1.9, 0.27], color: LEATHER_D }));
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + 0.5;
      pb.cone(0.04, 0.2, { bone: 'weapon', pos: [-0.31 + 0.1 * sin(a), 2.02, 0.15 + 0.1 * cos(a)], rot: [0.0, 0, 0], radial: 4, color: BONE, trim: true });
    }
    pb.blob(0.13, { bone: 'orb', pos: [-0.31, 2.1, 0.15], detail: 0, color: LIME, emis: 2.6 });
    pb.torus(0.18, 0.03, { bone: 'weapon', pos: [-0.31, 2.1, 0.15], rot: [Math.PI / 2, 0, 0], tubular: 3, radial: 6, color: 0xc8a14a, trim: true });
    // hanging fetishes
    pb.box(0.07, 0.15, 0.07, { bone: 'weapon', pos: [-0.2, 1.6, 0.14], color: RUST });
    pb.box(0.07, 0.12, 0.07, { bone: 'weapon', pos: [-0.43, 1.57, 0.14], color: BONE });
    pb.box(0.2, 0.05, 0.05, { bone: 'weapon', pos: [-0.31, 1.69, 0.14], color: LEATHER_D });
    // ---- elite crown
    pb.cone(0.05, 0.3, { bone: 'head', pos: [0, 1.56, 0.04], radial: 5, color: BONE, eliteOnly: true });
    pb.mirror((side, k) => pb.cone(0.04, 0.22, { bone: 'head', pos: [0.07 * k, 1.5, 0.1], rot: [0, 0, -0.35 * k], radial: 5, color: BONE, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, ph = s.seed * TAU, m = s.move, w = s.walk;
    const sw = sin(w), cw = cos(w);
    const hit = s.hit, idle = 1 - m;
    // cast: k 0..0.7 wind-up (raise), 0.7..1 release (thrust, recoil)
    let raise = 0, thr = 0, rel = 0;
    if (s.action === 'cast') {
      const u = clamp01(s.k / 0.7);
      rel = clamp01((s.k - 0.7) / 0.3);
      raise = smooth(u) * (1 - smooth(rel));
      thr = rel < 0.25 ? smooth(rel / 0.25) : 1 - smooth((rel - 0.25) / 0.75);
    }
    const breath = sin(t * 3.1 + ph);

    // idle: staff planted, shuffling stance
    P.scale(B.spine, 1, 1 + 0.025 * breath * idle, 1);
    P.rot(B.hips, 0, 0, sin(t * 1.2 + ph) * 0.03 * idle);
    P.rot(B.head, 0, sin(t * 0.8 + ph) * sin(t * 1.7 + ph) * 0.3 * idle, 0);
    P.rot(B.spine, 0.18 + 0.1 * m, -sw * 0.12 * m, -sw * 0.05 * m);
    P.rot(B.earL, 0, 0, 0.25 + 0.2 * flick(t, ph * 3, 2.3));
    P.rot(B.earR, 0, 0, -0.25 - 0.2 * flick(t, ph * 5, 1.9));
    P.rot(B.jaw, (0.12 * pow(max(0, sin(t * 1.3 + ph)), 6) + 0.08 * breath) * idle, 0, 0);

    // walk (sidestep shuffle)
    const A = 0.5 * m;
    P.rot(B.legL, sw * A, 0, 0);
    P.rot(B.legR, -sw * A, 0, 0);
    P.move(B.hips, 0, abs(cw) * 0.05 * m, 0);
    P.rot(B.hips, 0, sw * 0.1 * m, sw * 0.05 * m);
    P.rot(B.armL, 0.5 * sw * A * 1.3, 0, 0.1);
    P.rot(B.head, -0.1 * m, sw * 0.08 * m, 0);

    // right arm holds the staff (rest: planted, vertical). raise lifts it overhead.
    const aX = -0.5 - 1.15 * raise + 0.1 * sw * m;
    const fX = 0.5 + 0.2 * raise;
    P.rot(B.armR, aX, 0, -0.1 * raise);
    P.rot(B.foreR, fX, 0, 0);
    P.rot(B.weapon, -(aX + fX) + 1.2 * thr - 0.25 * raise, 0, sin(t * 2.2 + ph) * 0.02 * idle + 0.15 * hit * sin(t * 55));
    P.move(B.weapon, 0, 0.5 * raise + 0.03 * abs(sw) * m + 0.015 * breath * idle, 0);
    const orbS = 1 + 0.8 * raise;
    P.scale(B.orb, orbS, orbS, orbS);

    // cast body: lean back during the wind-up, jaw open, recoil step on release
    P.rot(B.spine, -0.28 * raise + 0.25 * thr, 0, 0);
    P.rot(B.head, -0.15 * raise + 0.1 * thr, 0.12 * hit, 0.25 * hit);
    P.rot(B.jaw, 0.55 * raise + 0.3 * thr, 0, 0);
    P.rot(B.armL, 0.3 * raise, 0, 0.5 * raise);
    P.move(B.hips, 0, 0, -0.1 * thr);
    P.rot(B.earL, 0, 0, -0.2 * raise);
    P.rot(B.earR, 0, 0, 0.2 * raise);
    P.rot(B.spine, -0.2 * hit, 0, 0);
  },
});

// =====================================================================================
//  Spider rig helpers (Broodmother, Spiderling)
// =====================================================================================
const LEG_PHI = [0.6, 1.2, 1.9, 2.55];       // leg yaw measured from +Z toward the side
const LEG_NAMES_L = ['leg1L', 'leg2L', 'leg3L', 'leg4L'];
const LEG_NAMES_R = ['leg1R', 'leg2R', 'leg3R', 'leg4R'];

// One bent spider leg: upper segment rising out of the body, lower segment down to the ground.
function spiderLeg(pb, bone, A, k, phi, o) {
  const d = [k * sin(phi), 0, cos(phi)];
  const K = [A[0] + d[0] * o.kh, A[1] + o.kv, A[2] + d[2] * o.kh];
  const F = [A[0] + d[0] * o.reach, o.foot, A[2] + d[2] * o.reach];
  const up = span(A, K), lo = span(K, F);
  pb.cyl(o.r * 0.85, o.r, up.len, { bone, pos: up.pos, rot: up.rot, radial: o.radial, open: true, color: o.color });
  pb.cone(o.r * 0.9, lo.len, { bone, pos: lo.pos, rot: lo.rot, radial: o.radial, color: o.color });
  if (o.knee) pb.sphere(o.knee, { bone, pos: K, seg: [4, 3], color: SPIDER_K });
}

// Tetrapod gait: legs {1L,2R,3L,4R} in phase, the others half a cycle later.
function legStep(P, bone, i, left, w, amp, lift, m) {
  const off = ((i + (left ? 0 : 1)) & 1) ? Math.PI : 0;
  const p = sin(w + off), v = cos(w + off);
  const k = left ? 1 : -1;
  P.rot(bone, 0, -k * p * amp * m, k * max(0, v) * lift * m);
}

// =====================================================================================
//  4.5  BROODMOTHER  (splitter: round egg-sac abdomen with a skull marking)
// =====================================================================================
export const broodmother = defineCreature({
  id: 'broodmother',
  stride: 1.2,
  blob: 1.0,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 0.48, 0.3] },
    { name: 'abdomen', parent: 'body', pivot: [0, 0.55, -0.2] },
    { name: 'sac', parent: 'abdomen', pivot: [0, 0.52, -0.5] },
    { name: 'jaw', parent: 'body', pivot: [0, 0.42, 0.55] },
    { name: 'leg1L', parent: 'body', pivot: [0.15, 0.5, 0.5] },
    { name: 'leg2L', parent: 'body', pivot: [0.24, 0.5, 0.4] },
    { name: 'leg3L', parent: 'body', pivot: [0.24, 0.5, 0.2] },
    { name: 'leg4L', parent: 'body', pivot: [0.2, 0.5, 0.05] },
    { name: 'leg1R', parent: 'body', pivot: [-0.15, 0.5, 0.5] },
    { name: 'leg2R', parent: 'body', pivot: [-0.24, 0.5, 0.4] },
    { name: 'leg3R', parent: 'body', pivot: [-0.24, 0.5, 0.2] },
    { name: 'leg4R', parent: 'body', pivot: [-0.2, 0.5, 0.05] },
  ],
  build(pb) {
    // cephalothorax + eyes + fangs
    pb.sphere(0.32, { bone: 'body', pos: [0, 0.48, 0.3], scale: [1, 0.72, 1.2], seg: [7, 4], color: SPIDER });
    pb.sphere(0.075, { bone: 'body', pos: [-0.1, 0.58, 0.63], seg: [4, 3], color: LIME, emis: 2.6 });
    pb.sphere(0.075, { bone: 'body', pos: [0.1, 0.58, 0.63], seg: [4, 3], color: LIME, emis: 2.6 });
    pb.sphere(0.05, { bone: 'body', pos: [-0.2, 0.55, 0.57], seg: [4, 3], color: LIME, emis: 2.2 });
    pb.sphere(0.05, { bone: 'body', pos: [0.2, 0.55, 0.57], seg: [4, 3], color: LIME, emis: 2.2 });
    pb.mirror((side, k) => pb.cone(0.07, 0.24, { bone: 'jaw', pos: [0.1 * k, 0.36, 0.62], rot: [2.4, 0, -0.1 * k], radial: 5, color: BONE, trim: true }));
    pb.box(0.26, 0.1, 0.12, { bone: 'jaw', pos: [0, 0.43, 0.62], color: SPIDER });
    // abdomen: the dominant round sac
    pb.sphere(0.55, { bone: 'abdomen', pos: [0, 0.52, -0.5], scale: [1, 0.8, 1.15], seg: [8, 5], color: SPIDER });
    pb.sphere(0.4, { bone: 'abdomen', pos: [0, 0.34, -0.52], scale: [1, 0.6, 1.1], seg: [6, 3], color: SPIDER_L });
    pb.torus(0.56, 0.045, { bone: 'abdomen', pos: [0, 0.5, -0.5], rot: [Math.PI / 2, 0, 0], scale: [1, 1.15, 1], tubular: 3, radial: 10, color: SPIDER_K, trim: true });
    // skull marking on the top plane
    pb.cyl(0.2, 0.22, 0.07, { bone: 'abdomen', pos: [0, 0.95, -0.45], radial: 8, color: BONE });
    pb.box(0.16, 0.07, 0.12, { bone: 'abdomen', pos: [0, 0.94, -0.27], color: BONE });
    pb.box(0.08, 0.05, 0.08, { bone: 'abdomen', pos: [-0.075, 0.985, -0.45], color: SPIDER });
    pb.box(0.08, 0.05, 0.08, { bone: 'abdomen', pos: [0.075, 0.985, -0.45], color: SPIDER });
    // spinnerets
    pb.cone(0.09, 0.2, { bone: 'abdomen', pos: [0, 0.45, -1.18], rot: [-Math.PI / 2, 0, 0], radial: 5, color: SPIDER });
    // egg pustules (lime) ringed around the sac
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + 0.3, el = i % 2 ? 0.45 : 0.85;
      const px = 0.56 * cos(el) * sin(a) * 1.02, py = 0.52 + 0.44 * sin(el) * 1.02, pz = -0.5 + 0.63 * cos(el) * cos(a) * 1.02;
      pb.sphere(0.11, { bone: 'sac', pos: [px, py, pz], scale: [1, 0.75, 1], seg: [5, 3], color: LIME, emis: 2.2 });
    }
    // legs
    const opt = { kh: 0.45, kv: 0.42, reach: 0.9, foot: 0.03, r: 0.065, radial: 5, color: SPIDER, knee: 0.075 };
    for (let i = 0; i < 4; i++) {
      const phi = LEG_PHI[i];
      const ay = 0.5, az = 0.3 + 0.22 * cos(phi) - 0.04;
      spiderLeg(pb, LEG_NAMES_L[i], [0.24 * sin(phi), ay, az], 1, phi, opt);
      spiderLeg(pb, LEG_NAMES_R[i], [-0.24 * sin(phi), ay, az], -1, phi, opt);
    }
    // elite crown: spikes along the thorax
    pb.cone(0.06, 0.3, { bone: 'body', pos: [0, 0.8, 0.3], radial: 4, color: BONE, eliteOnly: true });
    pb.mirror((side, k) => pb.cone(0.05, 0.24, { bone: 'body', pos: [0.13 * k, 0.76, 0.34], rot: [0, 0, -0.45 * k], radial: 4, color: BONE, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, ph = s.seed * TAU, m = s.move, w = s.walk;
    const hit = s.hit, idle = 1 - m;
    const atk = s.action === 'attack' ? s.k : -1;
    const rear = atk >= 0 ? (atk < 0.1 ? smooth(atk / 0.1) : atk < 0.2 ? 1 : 1 - smooth((atk - 0.2) / 0.5)) : 0;
    const lunge = atk >= 0 ? bump(atk, 0.08, 0.3) : 0;

    // throb: egg sac pulses at 1.2 Hz, the pustules swell a bit more
    const th = sin(t * TAU * 1.2 + ph);
    P.scale(B.abdomen, 1 + 0.05 * th, 1 + 0.05 * th, 1 + 0.05 * th);
    P.scale(B.sac, 1 + 0.06 * th, 1 + 0.06 * th, 1 + 0.06 * th);
    P.rot(B.jaw, 0.1 * pow(max(0, sin(t * 7 + ph)), 8) + 0.04 * sin(t * 2 + ph), 0, 0);
    P.move(B.body, 0, 0.012 * sin(t * 2.4 + ph) * idle, 0);

    // tetrapod gait + waterbed abdomen + skitter
    const A = 0.35, L = 0.38;
    legStep(P, B.leg1L, 0, true, w, A, L, m); legStep(P, B.leg2L, 1, true, w, A, L, m);
    legStep(P, B.leg3L, 2, true, w, A, L, m); legStep(P, B.leg4L, 3, true, w, A, L, m);
    legStep(P, B.leg1R, 0, false, w, A, L, m); legStep(P, B.leg2R, 1, false, w, A, L, m);
    legStep(P, B.leg3R, 2, false, w, A, L, m); legStep(P, B.leg4R, 3, false, w, A, L, m);
    // idle fidget: slow independent leg tapping
    P.rot(B.leg1L, 0, 0, 0.12 * max(0, sin(t * 1.7 + ph)) * idle);
    P.rot(B.leg1R, 0, 0, -0.12 * max(0, sin(t * 1.3 + ph * 2)) * idle);
    P.rot(B.leg3L, 0, 0, 0.08 * max(0, sin(t * 1.1 + ph * 3)) * idle);
    P.rot(B.leg4R, 0, 0, -0.08 * max(0, sin(t * 1.9 + ph * 4)) * idle);
    P.rot(B.body, 0, sin(t * 25) * 0.03 * m + sin(w) * 0.06 * m, sin(w * 2) * 0.03 * m);
    P.move(B.body, 0, abs(sin(w)) * 0.025 * m, 0);
    P.rot(B.abdomen, -0.1 * sin(w * 2 + 1.2) * m + 0.04 * sin(t * 1.6 + ph), -sin(w) * 0.12 * m, sin(w * 2 + 0.5) * 0.06 * m);

    // attack: rear up, front legs rise and lunge
    P.rot(B.body, -0.5 * rear + 0.22 * lunge, 0, 0);
    P.move(B.body, 0, 0.05 * rear, 0.25 * lunge);
    P.rot(B.jaw, 0.7 * rear + 0.3 * lunge, 0, 0);
    P.rot(B.leg1L, 0.5 * lunge, -0.25 * rear, 0.9 * rear);
    P.rot(B.leg1R, 0.5 * lunge, 0.25 * rear, -0.9 * rear);
    P.rot(B.leg2L, 0, 0, 0.25 * rear);
    P.rot(B.leg2R, 0, 0, -0.25 * rear);
    P.rot(B.abdomen, 0.35 * rear, 0, 0);

    // hit: the sac wobbles like jelly
    P.scale(B.abdomen, 1 + 0.1 * hit * sin(t * 50), 1 - 0.1 * hit, 1 + 0.1 * hit);
    P.rot(B.abdomen, 0.15 * hit, 0, 0);
  },
});

// =====================================================================================
//  4.6  SPIDERLING  (swarmer: aubergine dot with legs and a lime-striped abdomen)
// =====================================================================================
export const spiderling = defineCreature({
  id: 'spiderling',
  stride: 0.75,
  blob: 0.4,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 0.17, 0.08] },
    { name: 'abdomen', parent: 'body', pivot: [0, 0.2, -0.05] },
    { name: 'leg1L', parent: 'body', pivot: [0.07, 0.18, 0.15] },
    { name: 'leg2L', parent: 'body', pivot: [0.09, 0.18, 0.09] },
    { name: 'leg3L', parent: 'body', pivot: [0.09, 0.18, 0.03] },
    { name: 'leg4L', parent: 'body', pivot: [0.08, 0.18, -0.03] },
    { name: 'leg1R', parent: 'body', pivot: [-0.07, 0.18, 0.15] },
    { name: 'leg2R', parent: 'body', pivot: [-0.09, 0.18, 0.09] },
    { name: 'leg3R', parent: 'body', pivot: [-0.09, 0.18, 0.03] },
    { name: 'leg4R', parent: 'body', pivot: [-0.08, 0.18, -0.03] },
  ],
  build(pb) {
    pb.sphere(0.11, { bone: 'body', pos: [0, 0.18, 0.1], scale: [1, 0.85, 1.1], seg: [6, 4], color: SPIDER });
    pb.sphere(0.17, { bone: 'abdomen', pos: [0, 0.2, -0.16], scale: [1, 0.85, 1.2], seg: [6, 4], color: SPIDER });
    pb.box(0.07, 0.04, 0.26, { bone: 'abdomen', pos: [0, 0.35, -0.16], rot: [0.12, 0, 0], color: LIME, emis: 1.8 });
    pb.mirror((side, k) => {
      pb.sphere(0.045, { bone: 'body', pos: [0.05 * k, 0.22, 0.2], seg: [4, 3], color: LIME, emis: 2.6 });
      pb.cone(0.04, 0.11, { bone: 'body', pos: [0.04 * k, 0.1, 0.22], rot: [2.5, 0, 0], radial: 4, color: BONE, trim: true });
    });
    const opt = { kh: 0.14, kv: 0.13, reach: 0.3, foot: 0.02, r: 0.035, radial: 4, color: SPIDER };
    for (let i = 0; i < 4; i++) {
      const phi = LEG_PHI[i];
      const az = 0.08 + 0.07 * cos(phi);
      spiderLeg(pb, LEG_NAMES_L[i], [0.07 * sin(phi) + 0.03, 0.18, az], 1, phi, opt);
      spiderLeg(pb, LEG_NAMES_R[i], [-0.07 * sin(phi) - 0.03, 0.18, az], -1, phi, opt);
    }
    pb.cone(0.045, 0.2, { bone: 'body', pos: [0, 0.38, 0.1], radial: 4, color: BONE, eliteOnly: true });
    pb.mirror((side, k) => pb.cone(0.04, 0.16, { bone: 'body', pos: [0.08 * k, 0.35, 0.08], rot: [0, 0, -0.5 * k], radial: 4, color: BONE, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, ph = s.seed * TAU, m = s.move, w = s.walk;
    const hit = s.hit, idle = 1 - m;
    const atk = s.action === 'attack' ? s.k : -1;
    const hop = atk >= 0 ? bump(atk, 0, 0.4) : 0;
    const lunge = atk >= 0 ? bump(atk, 0.05, 0.3) : 0;
    const ww = w * 1.0;
    const A = 0.5, L = 0.6;
    legStep(P, B.leg1L, 0, true, ww, A, L, m); legStep(P, B.leg2L, 1, true, ww, A, L, m);
    legStep(P, B.leg3L, 2, true, ww, A, L, m); legStep(P, B.leg4L, 3, true, ww, A, L, m);
    legStep(P, B.leg1R, 0, false, ww, A, L, m); legStep(P, B.leg2R, 1, false, ww, A, L, m);
    legStep(P, B.leg3R, 2, false, ww, A, L, m); legStep(P, B.leg4R, 3, false, ww, A, L, m);
    // skitter: body jitter doubled, pauses with twitchy legs
    P.rot(B.body, 0, sin(t * 30) * 0.07 * m + sin(ww) * 0.05 * m, sin(t * 26) * 0.04 * m);
    P.move(B.body, 0, abs(sin(ww)) * 0.012 * m + 0.05 * hop, 0.1 * lunge);
    P.rot(B.abdomen, 0.1 * sin(ww * 2) * m + 0.04 * sin(t * 2.2 + ph) * idle, sin(ww) * 0.15 * m, 0);
    P.scale(B.abdomen, 1, 1 + 0.04 * sin(t * 6 + ph), 1);
    P.rot(B.leg1L, 0, 0, 0.5 * max(0, sin(t * 3 + ph)) * idle);
    P.rot(B.leg1R, 0, 0, -0.5 * max(0, sin(t * 3.4 + ph * 2)) * idle);
    P.rot(B.body, -0.35 * lunge, 0, 0);
    P.rot(B.leg1L, -0.5 * lunge, 0, 0.7 * lunge);
    P.rot(B.leg1R, -0.5 * lunge, 0, -0.7 * lunge);
    P.rot(B.body, -0.3 * hit, 0, 0);
    P.scale(B.abdomen, 1 + 0.15 * hit, 1 - 0.15 * hit, 1);
  },
});

export const REGISTER = {
  husk: goblinGrunt,
  imp: goblinScamp,
  brute: forestTroll,
  spitter: goblinShaman,
  bloater: broodmother,
  mite: spiderling,
};
