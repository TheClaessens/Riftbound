import * as THREE from 'three';
import { defineCreature, TAU, clamp01, smooth, bump, strikeCurve } from './rig.js';

// =====================================================================================
//  ACT II · WARBAND  (design/research/03-creature-art.md §5.1 – §5.6)
//  ashHusk → Orc Raider · cinderling → Warg · obsidianBrute → Ogre
//  emberSpitter → Orc Spirit-Shaman · magmaRam → War Boar + Goblin Outrider
//  pyreBomber → Goblin Sapper
//
//  Model space, faces +Z, left = +X.  Rotation signs (XYZ euler):
//   +x pitches the top forward / swings a hanging limb BACK (arm forward = negative)
//   +y turns toward +X (left)     +z lifts the +X side (left arm out = +z, right arm out = -z)
// =====================================================================================

const PI = Math.PI;
const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;

// ---- palette
const TEAL = 0x1fe0c2, TEAL_HOT = 0xd6fff6;
const SKIN = 0x557a2c, SKIN_L = 0x6f9338, SKIN_D = 0x3c5420;
const IRON = 0x2b2a2e, IRON_L = 0x55565c, IRON_E = 0xcfd2d6;
const LEATHER = 0x3d2618, LEATHER_L = 0x5a3a24, RUST = 0x8a4a2a, BONE = 0xeadfc4, SOOT = 0x1a1412;
const WOOD = 0x6b4426, WOOD_D = 0x3a2618;
const GOLD = 0xffc93a;

// ---- build helpers ---------------------------------------------------------------
const oct = (pb, r, o) => pb.geo(new THREE.OctahedronGeometry(r, 0), o);

// cone from base point a to tip b
function ptCone(pb, a, b, r, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  return pb.cone(r, len, { radial: 5, ...o, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [Math.atan2(uz, uy), 0, -Math.asin(ux)] });
}
// cylinder from a (radius rBot) to b (radius rTop)
function ptCyl(pb, a, b, rTop, rBot, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  return pb.cyl(rTop, rBot, len, { radial: 6, ...o, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [Math.atan2(uz, uy), 0, -Math.asin(ux)] });
}
// box from a to b (length along a→b)
function ptBox(pb, a, b, w, d, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  return pb.box(w, len, d, { ...o, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [Math.atan2(uz, uy), 0, -Math.asin(ux)] });
}
// flat plate in the YZ plane: pts are [z, y]; thick along X; o.pos = [x, 0, 0]
const side = (pb, pts, thick, o) => pb.extrude(pts.map(([z, y]) => [-z, y]), thick, { ...o, rot: [0, PI / 2, 0] });
// angry slanted teal eyes
function eyes(pb, bone, x, y, z, r, o = {}) {
  pb.mirror((s, k) => oct(pb, r, { bone, pos: [x * k, y, z], rot: [0, 0, k * 0.35], scale: [1.5, 0.8, 0.9], color: TEAL, emis: 2.6, ...o }));
}

// ---- animation helpers (allocation free) ------------------------------------------
const flick = (t, ph, rate) => { const v = sin(t * rate + ph); return v > 0.93 ? (v - 0.93) / 0.07 : 0; };
// swing arm angle from the strike curve: raise (ac = -1) → -1.6, strike (ac = 1.4) → +0.84
const swingAngle = (ac) => (ac < 0 ? 1.6 * ac : 0.6 * ac);

// =====================================================================================
//  5.1  ORC RAIDER
// =====================================================================================
const CHOP_BLADE = [[0.4, 0.04], [0.45, 0.2], [0.72, 0.24], [0.94, 0.18], [0.89, 0.08], [0.98, -0.02], [0.9, -0.11], [0.8, -0.2], [0.47, -0.15], [0.4, -0.05]];
const CHOP_EDGE = [[0.5, -0.1], [0.8, -0.15], [0.9, -0.06], [0.99, -0.02], [0.9, -0.12], [0.8, -0.22], [0.47, -0.17], [0.46, -0.1]];
const RAIDER_PLUME = [[0.18, 1.86], [0.12, 2.16], [-0.1, 2.42], [-0.4, 2.46], [-0.55, 2.26], [-0.3, 2.24], [-0.12, 2.04], [-0.1, 1.86]];

export const ashHusk = defineCreature({
  id: 'ashHusk',
  stride: 1.5,
  blob: 0.66,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.78, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.85, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 1.45, 0.12] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.46, 0.3] },
    { name: 'armL', parent: 'spine', pivot: [0.47, 1.38, 0] },
    { name: 'armR', parent: 'spine', pivot: [-0.47, 1.38, 0] },
    { name: 'weapon', parent: 'armR', pivot: [-0.5, 0.62, 0.05] },
    { name: 'legL', parent: 'hips', pivot: [0.16, 0.78, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.16, 0.78, 0] },
  ],
  build(pb) {
    // legs + boots
    pb.mirror((s, k) => {
      const b = 'leg' + s;
      pb.box(0.22, 0.54, 0.24, { bone: b, pos: [0.16 * k, 0.5, 0], bottom: [0.8, 0.85], color: SKIN });
      pb.box(0.26, 0.26, 0.38, { bone: b, pos: [0.16 * k, 0.13, 0.04], taper: [0.92, 0.9], color: LEATHER });
      pb.box(0.28, 0.06, 0.3, { bone: b, pos: [0.16 * k, 0.27, 0.02], color: RUST });
    });
    // hips: kilt with soot hem
    pb.box(0.56, 0.4, 0.42, { bone: 'hips', pos: [0, 0.64, 0], taper: [0.82, 0.86], color: LEATHER });
    pb.box(0.6, 0.08, 0.46, { bone: 'hips', pos: [0, 0.46, 0], color: SOOT });
    pb.box(0.24, 0.36, 0.06, { bone: 'hips', pos: [0, 0.6, 0.23], color: RUST });
    // torso
    pb.box(0.52, 0.34, 0.4, { bone: 'spine', pos: [0, 0.98, 0.0], color: SKIN });
    pb.box(0.8, 0.6, 0.5, { bone: 'spine', pos: [0, 1.24, 0.05], rot: [0.22, 0, 0], taper: [1.32, 1.0], color: SKIN });
    pb.sphere(0.28, { bone: 'spine', pos: [0, 1.5, -0.1], scale: [1.6, 0.6, 1.0], seg: [6, 3], color: SKIN });
    pb.box(0.62, 0.11, 0.44, { bone: 'spine', pos: [0, 0.94, 0], color: LEATHER_L });
    pb.box(0.13, 0.12, 0.05, { bone: 'spine', pos: [0, 0.94, 0.23], color: IRON_L, trim: true });
    pb.box(0.13, 0.78, 0.06, { bone: 'spine', pos: [0.02, 1.26, 0.3], rot: [0.2, 0, 0.55], color: LEATHER });
    pb.box(0.34, 0.07, 0.05, { bone: 'spine', pos: [0, 1.38, 0.31], rot: [0.2, 0, 0.08], color: TEAL, emis: 2 });
    pb.box(0.28, 0.07, 0.05, { bone: 'spine', pos: [0, 1.25, 0.29], rot: [0.2, 0, -0.08], color: TEAL, emis: 2 });
    // head
    pb.box(0.42, 0.38, 0.42, { bone: 'head', pos: [0, 1.63, 0.2], taper: [0.86, 0.86], color: SKIN_L });
    pb.box(0.46, 0.1, 0.15, { bone: 'head', pos: [0, 1.73, 0.37], color: SKIN_D });
    pb.box(0.1, 0.1, 0.08, { bone: 'head', pos: [0, 1.58, 0.42], color: SKIN_D });
    pb.box(0.44, 0.07, 0.04, { bone: 'head', pos: [0, 1.665, 0.405], color: TEAL, emis: 1.6 });
    eyes(pb, 'head', 0.1, 1.67, 0.42, 0.05);
    pb.mirror((s, k) => ptCone(pb, [0.2 * k, 1.64, 0.12], [0.38 * k, 1.8, 0.0], 0.06, { bone: 'head', color: SKIN_L }));
    ptCone(pb, [0, 1.83, 0.02], [0, 2.1, -0.16], 0.08, { bone: 'head', color: SOOT });
    pb.box(0.17, 0.08, 0.17, { bone: 'head', pos: [0, 1.85, 0.02], color: BONE, trim: true });
    // jaw + tusks
    pb.box(0.38, 0.12, 0.34, { bone: 'jaw', pos: [0, 1.5, 0.32], color: SKIN });
    pb.mirror((s, k) => ptCone(pb, [0.13 * k, 1.54, 0.46], [0.14 * k, 1.72, 0.5], 0.05, { bone: 'jaw', color: BONE }));
    // arms
    pb.mirror((s, k) => {
      const b = 'arm' + s;
      pb.box(0.21, 0.72, 0.21, { bone: b, pos: [0.5 * k, 1.03, 0], bottom: [0.82, 0.86], color: SKIN });
      pb.box(0.21, 0.21, 0.21, { bone: b, pos: [0.52 * k, 0.6, 0.03], color: SKIN_D });
    });
    // left pauldron: spiked iron
    pb.sphere(0.27, { bone: 'armL', pos: [0.54, 1.45, 0], scale: [1.25, 0.72, 1.12], seg: [7, 4], color: IRON });
    pb.cyl(0.33, 0.31, 0.07, { bone: 'armL', pos: [0.54, 1.3, 0], radial: 6, color: RUST, trim: true });
    ptCone(pb, [0.52, 1.56, 0.08], [0.62, 1.84, 0.1], 0.08, { bone: 'armL', color: BONE });
    ptCone(pb, [0.52, 1.54, -0.1], [0.58, 1.78, -0.2], 0.07, { bone: 'armL', color: BONE });
    // right shoulder + bracer
    pb.sphere(0.2, { bone: 'armR', pos: [-0.5, 1.45, 0], scale: [1.1, 0.85, 1], seg: [6, 3], color: SKIN });
    pb.box(0.26, 0.2, 0.26, { bone: 'armR', pos: [-0.5, 0.76, 0], color: LEATHER_L });
    // chopper (handle + notched blade, edge is trim)
    ptBox(pb, [-0.5, 0.61, -0.08], [-0.5, 0.62, 0.54], 0.09, 0.09, { bone: 'weapon', color: WOOD });
    side(pb, CHOP_BLADE.map(([z, y]) => [z, y + 0.62]), 0.06, { bone: 'weapon', pos: [-0.5, 0, 0], color: IRON_L });
    side(pb, CHOP_EDGE.map(([z, y]) => [z, y + 0.62]), 0.08, { bone: 'weapon', pos: [-0.5, 0, 0], color: IRON_E, trim: true });
    // elite: horned iron helm + teal plume
    pb.cyl(0.26, 0.28, 0.18, { bone: 'head', pos: [0, 1.86, 0.2], radial: 6, color: IRON, eliteOnly: true });
    pb.mirror((s, k) => {
      ptCone(pb, [0.24 * k, 1.84, 0.2], [0.5 * k, 1.98, 0.3], 0.08, { bone: 'head', color: BONE, eliteOnly: true });
      ptCone(pb, [0.5 * k, 1.98, 0.3], [0.58 * k, 2.26, 0.46], 0.06, { bone: 'head', color: BONE, eliteOnly: true });
    });
    side(pb, RAIDER_PLUME, 0.08, { bone: 'head', pos: [0, 0, 0], color: TEAL, emis: 1.6, eliteOnly: true });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, ph = s.seed * TAU, hit = s.hit;
    const sw = sin(w), cw = cos(w), idle = 1 - m;
    const atk = s.action === 'attack';
    const ac = atk ? strikeCurve(s.k, 0.08) : 0;
    const aw = atk ? 0.2 : 1;           // gait swing weight while attacking
    const br = sin(t * 2.4 + ph);
    const A = 0.55 * m;

    // gait
    P.rot(B.legL, sw * A, 0, 0);
    P.rot(B.legR, -sw * A, 0, 0);
    P.move(B.legL, 0, max(0, -cw) * 0.07 * m, 0);
    P.move(B.legR, 0, max(0, cw) * 0.07 * m, 0);
    P.move(B.hips, 0, (cw * cw - 1) * 0.08 * m + br * 0.008 * idle, 0.1 * max(ac, 0) - 0.07 * hit);
    P.rot(B.hips, 0, sw * 0.1 * m, sw * 0.05 * m);
    // spine: hunch, lean, counter-twist, breathing, attack twist
    P.rot(B.spine, 0.14 + 0.16 * m + 0.06 * ac - 0.25 * hit, -sw * 0.14 * m * aw + 0.4 * ac, sin(t * 1.3 + ph) * 0.03 * idle);
    P.scale(B.spine, 1, 1 + 0.02 * br, 1);
    // head
    P.rot(B.head, -0.18 - 0.1 * m + sin(w * 2 + 0.6) * 0.04 * m - 0.3 * hit + 0.1 * ac, sin(t * 0.6 + ph) * sin(t * 1.3 + ph * 2) * 0.3 * idle, 0);
    P.rot(B.jaw, 0.12 * (0.5 + 0.5 * sin(t * 1.9 + ph)) * idle + 0.5 * max(0, -ac) + 0.35 * hit, 0, 0);
    // arms
    P.rot(B.armL, -sw * A * 0.9 * aw + swingAngle(ac) * 0.3, 0, 0.1 + 0.05 * br * idle);
    P.rot(B.armR, -0.9 + sw * A * 0.5 * aw + swingAngle(ac) + 0.06 * br * idle, 0, -0.28 - 0.04 * m);
    P.rot(B.weapon, 0.25 * ac, 0, 0);
    // attack stance
    P.rot(B.legL, -0.3 * ac, 0, 0);
    P.rot(B.legR, 0.2 * ac, 0, 0);
  },
});

// =====================================================================================
//  5.2  WARG
// =====================================================================================
const WARG_FUR = 0x7a6a5c, WARG_FUR_D = 0x4a3e36, WARG_BELLY = 0xb09c82, WARG_MUZZLE = 0xe3d4b2;
const WARG_PLUME = [[0.5, 0.92], [0.2, 1.24], [-0.2, 1.1], [-0.3, 0.9], [0.1, 0.9]];

// gallop leg angle (rot.x, positive = foot back). fwd = cos(phase) of the pair
const gallopF = (c, A) => -A * (c > 0 ? c : c * 0.5);
const gallopB = (c, A) => A * (c > 0 ? c * 0.85 : c * 0.55);

export const cinderling = defineCreature({
  id: 'cinderling',
  stride: 2.2,
  blob: 0.62,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 0.62, 0] },
    { name: 'head', parent: 'body', pivot: [0, 0.7, 0.4] },
    { name: 'jaw', parent: 'head', pivot: [0, 0.64, 0.6] },
    { name: 'legFL', parent: 'body', pivot: [0.14, 0.58, 0.3] },
    { name: 'legFR', parent: 'body', pivot: [-0.14, 0.58, 0.3] },
    { name: 'legBL', parent: 'body', pivot: [0.15, 0.5, -0.32] },
    { name: 'legBR', parent: 'body', pivot: [-0.15, 0.5, -0.32] },
    { name: 'tail1', parent: 'body', pivot: [0, 0.55, -0.5] },
    { name: 'tail2', parent: 'tail1', pivot: [0, 0.55, -0.78] },
  ],
  build(pb) {
    // lean hyena-wolf: deep chest, tucked waist, small sloping hips (a forward wedge from above)
    pb.sphere(0.26, { bone: 'body', pos: [0, 0.74, 0.24], rot: [0.3, 0, 0], scale: [0.86, 1.05, 1.28], seg: [5, 4], flat: false, color: WARG_FUR });
    pb.sphere(0.18, { bone: 'body', pos: [0, 0.67, -0.12], rot: [-0.18, 0, 0], scale: [0.88, 0.95, 1.75], seg: [5, 3], flat: false, color: WARG_FUR });
    pb.sphere(0.19, { bone: 'body', pos: [0, 0.6, -0.38], scale: [1.0, 1.0, 1.15], seg: [5, 3], flat: false, color: WARG_FUR });
    // spiky black mane down the spine (the serrated top-plane stripe)
    for (let i = 0; i < 4; i++) {
      const z = 0.42 - i * 0.2, y = 0.94 - i * 0.07, h = 0.32 - i * 0.05;
      ptCone(pb, [0, y - 0.05, z], [0, y + h, z - 0.2], 0.1, { bone: 'body', radial: 3, color: SOOT });
    }
    // iron collar (T)
    pb.box(0.3, 0.1, 0.28, { bone: 'body', pos: [0, 0.74, 0.46], rot: [0.4, 0, 0], color: IRON, trim: true });
    // head: low wedge skull, long cream muzzle, tall swept ears, teal eyes, bared fangs
    pb.box(0.29, 0.24, 0.28, { bone: 'head', pos: [0, 0.76, 0.57], taper: [0.8, 0.85], color: WARG_FUR });
    ptCyl(pb, [0, 0.72, 0.66], [0, 0.67, 1.0], 0.045, 0.1, { bone: 'head', radial: 4, color: WARG_MUZZLE });
    pb.mirror((s, k) => {
      ptCone(pb, [0.08 * k, 0.83, 0.52], [0.13 * k, 1.1, 0.4], 0.075, { bone: 'head', radial: 3, color: SOOT });
      oct(pb, 0.048, { bone: 'head', pos: [0.1 * k, 0.79, 0.69], rot: [0, 0, k * 0.4], scale: [1.4, 0.8, 0.9], color: TEAL, emis: 2.6 });
      ptCone(pb, [0.05 * k, 0.67, 0.9], [0.05 * k, 0.56, 0.92], 0.035, { bone: 'head', radial: 3, color: BONE });
    });
    pb.box(0.13, 0.05, 0.32, { bone: 'jaw', pos: [0, 0.6, 0.8], color: WARG_BELLY });
    // legs: long and thin; back legs with a hock
    pb.mirror((s, k) => {
      ptCyl(pb, [0.13 * k, 0.62, 0.3], [0.13 * k, 0.02, 0.34], 0.04, 0.07, { bone: 'legF' + s, radial: 4, color: WARG_FUR });
      pb.box(0.14, 0.3, 0.24, { bone: 'legB' + s, pos: [0.15 * k, 0.46, -0.36], rot: [-0.5, 0, 0], taper: [1, 0.8], color: WARG_FUR });
      ptCyl(pb, [0.15 * k, 0.36, -0.46], [0.15 * k, 0.02, -0.36], 0.035, 0.05, { bone: 'legB' + s, radial: 4, color: WARG_FUR_D });
    });
    // bushy tail, black tip
    ptCone(pb, [0, 0.6, -0.46], [0, 0.52, -0.84], 0.1, { bone: 'tail1', radial: 4, color: WARG_FUR });
    ptCone(pb, [0, 0.52, -0.8], [0, 0.42, -1.18], 0.13, { bone: 'tail2', radial: 4, color: SOOT });
    // elite: teal plume mane + gold horns
    side(pb, WARG_PLUME, 0.08, { bone: 'head', pos: [0, 0, 0], color: TEAL, emis: 1.6, eliteOnly: true });
    pb.mirror((s, k) => ptCone(pb, [0.12 * k, 0.88, 0.58], [0.26 * k, 1.12, 0.66], 0.06, { bone: 'head', radial: 3, color: GOLD, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, ph = s.seed * TAU, hit = s.hit;
    const idle = 1 - m;
    const atk = s.action === 'attack';
    const ac = atk ? strikeCurve(s.k, 0.08) : 0;
    const A = 0.8 * m;
    const c0 = cos(w), c1 = cos(w + 0.35), c2 = cos(w + PI + 0.25), c3 = cos(w + PI + 0.6);
    P.rot(B.legFL, gallopF(c0, A), 0, 0);
    P.rot(B.legFR, gallopF(c1, A), 0, 0);
    P.rot(B.legBL, gallopB(c2, A), 0, 0);
    P.rot(B.legBR, gallopB(c3, A), 0, 0);
    // idle crouch + breathing
    const br = sin(t * 3 + ph);
    P.scale(B.body, 1, 1 + 0.02 * br * idle, 1);
    // bounding body
    P.move(B.body, 0, sin(w * 2 + 0.3) * 0.05 * m - 0.04 * idle + 0.1 * max(0, -ac) * 0 , 0.2 * max(ac, 0) - 0.06 * max(-ac, 0) - 0.08 * hit);
    P.rot(B.body, -0.12 * cos(w) * m - 0.15 * max(-ac, 0) + 0.18 * max(ac, 0) - 0.15 * hit, 0, sin(w) * 0.04 * m);
    // head stays level, hangs low at idle
    P.rot(B.head, 0.1 * cos(w) * m + 0.22 * idle + sin(t * 0.7 + ph) * 0.04 * idle - 0.3 * max(-ac, 0) + 0.35 * max(ac, 0) - 0.3 * hit, sin(t * 0.5 + ph) * sin(t * 1.3 + ph * 2) * 0.35 * idle, 0);
    // laugh bursts
    const burst = clamp01((sin(t * 1.3 + ph * 5) - 0.7) * 4) * idle;
    P.rot(B.jaw, burst * (0.25 + 0.2 * sin(t * 50)) + 0.9 * max(-ac, 0) - 0.2 * max(ac, 0) + 0.35 * hit + 0.1 * m, 0, 0);
    P.rot(B.head, 0, 0, burst * sin(t * 40) * 0.05);
    // tail: streams back when moving
    P.rot(B.tail1, -0.35 * m + 0.2 * hit, sin(t * 4 + ph) * 0.3 * idle + sin(w * 2) * 0.12 * m, 0);
    P.rot(B.tail2, -0.1 * m, sin(t * 4 + ph - 0.9) * 0.3 * idle + sin(w * 2 - 0.8) * 0.15 * m, 0);
  },
});

// =====================================================================================
//  5.3  OGRE  (tank: a fat, hunched, charming brute — round gut, big underbite head
//              thrust forward, ape arms, hide loincloth, a spiked club on the shoulder)
// =====================================================================================
const OGRE = 0x8a6468, OGRE_L = 0xa8848a, OGRE_D = 0x62464b, OGRE_GUT = 0xb8948a;
const HIDE = 0x8f6a45, HIDE_D = 0x6a4a2e, FUR_D = 0x4a3326;
const pow6 = (x) => { x = x > 0 ? x * x * x : 0; return x * x; };

export const obsidianBrute = defineCreature({
  id: 'obsidianBrute',
  stride: 1.5,
  blob: 1.15,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 1.0, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 1.12, 0] },
    { name: 'belly', parent: 'spine', pivot: [0, 1.4, 0.4] },
    { name: 'head', parent: 'spine', pivot: [0, 2.5, 0.62] },
    { name: 'jaw', parent: 'head', pivot: [0, 2.62, 0.95] },
    { name: 'armL', parent: 'spine', pivot: [0.98, 2.3, -0.02] },
    { name: 'foreL', parent: 'armL', pivot: [1.05, 1.62, 0.04] },
    { name: 'armR', parent: 'spine', pivot: [-0.98, 2.3, -0.02] },
    { name: 'foreR', parent: 'armR', pivot: [-1.05, 1.62, 0.04] },
    { name: 'weapon', parent: 'foreR', pivot: [-1.07, 0.92, 0.1] },
    { name: 'legL', parent: 'hips', pivot: [0.42, 1.0, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.42, 1.0, 0] },
  ],
  build(pb) {
    // stumpy round legs + big flat feet
    pb.mirror((s, k) => {
      const b = 'leg' + s;
      pb.sphere(0.34, { bone: b, pos: [0.44 * k, 0.6, 0], scale: [1, 1.38, 1.05], seg: [5, 3], flat: false, color: OGRE });
      pb.sphere(0.3, { bone: b, pos: [0.46 * k, 0.13, 0.14], scale: [1.08, 0.5, 1.38], seg: [4, 3], flat: false, color: OGRE_D });
    });
    // hide loincloth hanging under the gut, leather belt, bone buckle (T)
    pb.cyl(0.7, 0.74, 0.18, { bone: 'hips', pos: [0, 1.02, 0.02], radial: 6, color: LEATHER });
    pb.box(0.7, 0.66, 0.08, { bone: 'hips', pos: [0, 0.66, 0.66], rot: [0.16, 0, 0], bottom: [0.75, 1], color: HIDE });
    pb.box(0.24, 0.24, 0.12, { bone: 'hips', pos: [0.5, 1.0, 0.5], rot: [0, 0.78, 0], color: BONE, trim: true });
    // torso: wide hunched barrel
    pb.sphere(0.8, { bone: 'spine', pos: [0, 1.95, -0.14], rot: [0.5, 0, 0], scale: [1.25, 0.72, 0.82], seg: [6, 5], flat: false, color: OGRE });
    // chest strap to a shaggy fur pauldron on the left shoulder
    ptBox(pb, [0.62, 2.5, 0.22], [-0.62, 1.86, 0.92], 0.2, 0.09, { bone: 'spine', color: LEATHER });
    pb.blob(0.42, { bone: 'armL', pos: [1.0, 2.56, -0.04], scale: [1.18, 0.6, 1.12], detail: 0, jitter: 0.22, seed: 7, color: FUR_D });
    // the gut: big, round, lighter, jiggles on its own bone
    pb.sphere(0.84, { bone: 'belly', pos: [0, 1.42, 0.4], scale: [1.06, 0.94, 0.96], seg: [7, 4], flat: false, color: OGRE_GUT });
    for (let i = 0; i < 2; i++) pb.box(0.09, 0.42, 0.05, { bone: 'belly', pos: [0.18 + i * 0.17, 1.64, 1.13], rot: [-0.28, 0, 0.22], color: TEAL, emis: 1.4 });
    // head (big, thrust forward): bald dome, heavy brow, bulb nose, huge underbite jaw with tusks
    pb.sphere(0.44, { bone: 'head', pos: [0, 2.92, 1.0], scale: [1.05, 0.9, 1.0], seg: [6, 5], flat: false, color: OGRE_L });
    pb.sphere(0.2, { bone: 'head', pos: [0, 2.95, 1.3], rot: [-0.25, 0, 0], scale: [2.15, 0.62, 0.95], seg: [5, 3], color: OGRE_D });
    eyes(pb, 'head', 0.17, 2.83, 1.43, 0.07);
    pb.sphere(0.14, { bone: 'head', pos: [0, 2.71, 1.5], scale: [1.15, 0.9, 1], seg: [5, 3], color: OGRE_L });
    pb.mirror((s, k) => ptCone(pb, [0.42 * k, 2.9, 0.98], [0.72 * k, 3.04, 0.82], 0.11, { bone: 'head', radial: 3, color: OGRE }));
    ptCone(pb, [0, 3.24, 0.86], [0, 3.56, 0.58], 0.11, { bone: 'head', radial: 4, color: SOOT });
    pb.sphere(0.48, { bone: 'jaw', pos: [0, 2.52, 1.18], scale: [1.22, 0.6, 1.0], seg: [6, 4], flat: false, color: OGRE });
    pb.mirror((s, k) => ptCone(pb, [0.31 * k, 2.66, 1.5], [0.4 * k, 3.1, 1.6], 0.105, { bone: 'jaw', radial: 5, color: BONE }));
    // long ape arms: round shoulder-upper arm, Popeye forearm, big knuckly fist
    pb.mirror((s, k) => {
      pb.sphere(0.4, { bone: 'arm' + s, pos: [1.02 * k, 2.12, -0.03], scale: [1.0, 1.3, 1.0], seg: [6, 4], flat: false, color: OGRE });
      pb.sphere(0.34, { bone: 'fore' + s, pos: [1.06 * k, 1.3, 0.06], scale: [1.0, 1.32, 1.0], seg: [5, 4], flat: false, color: OGRE });
      pb.sphere(0.3, { bone: 'fore' + s, pos: [1.07 * k, 0.86, 0.1], scale: [1.05, 0.95, 1.1], seg: [5, 4], flat: false, color: OGRE_D });
    });
    pb.cyl(0.34, 0.37, 0.22, { bone: 'foreR', pos: [-1.06, 1.08, 0.06], radial: 6, color: LEATHER });
    // spiked club: fat tapered log, iron band (T), bone spikes
    pb.lathe([[0.07, -0.25], [0.1, 0.9], [0.27, 1.95], [0.31, 2.4], [0, 2.68]], { bone: 'weapon', pos: [-1.07, 0.92, 0.1], radial: 6, color: WOOD });
    pb.cyl(0.24, 0.22, 0.13, { bone: 'weapon', pos: [-1.07, 0.92 + 1.6, 0.1], radial: 6, color: IRON_L, trim: true });
    for (let i = 0; i < 3; i++) {
      const a = i * (TAU / 3) + 0.4, y = 0.92 + 2.02 + i * 0.16, r = 0.27;
      const c = cos(a), sn = sin(a);
      ptCone(pb, [-1.07 + c * r, y, 0.1 + sn * r], [-1.07 + c * (r + 0.32), y + 0.06, 0.1 + sn * (r + 0.32)], 0.085, { bone: 'weapon', radial: 3, color: BONE });
    }
    // elite: horned iron helm + teal plume
    pb.sphere(0.47, { bone: 'head', pos: [0, 2.98, 1.0], scale: [1.05, 0.75, 1.0], seg: [6, 3], thetaLength: PI / 2, color: IRON, eliteOnly: true });
    pb.mirror((s, k) => ptCone(pb, [0.4 * k, 3.1, 1.02], [0.72 * k, 3.58, 1.18], 0.11, { bone: 'head', radial: 4, color: BONE, eliteOnly: true }));
    ptCone(pb, [0, 3.28, 0.88], [0, 3.95, 0.42], 0.14, { bone: 'head', radial: 4, color: TEAL, emis: 1.6, eliteOnly: true });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, ph = s.seed * TAU, hit = s.hit;
    const sw = sin(w), cw = cos(w), idle = 1 - m;
    // club slam envelopes: raise 0→0.08, slam 0.08→0.2, hold → 0.45, recover
    const k = s.action === 'attack' ? s.k : -1;
    let up = 0, sl = 0;
    if (k >= 0) {
      if (k < 0.08) up = smooth(k / 0.08);
      else if (k < 0.2) { up = 1 - smooth((k - 0.08) / 0.12); sl = 1 - up; }
      else if (k < 0.45) sl = 1;
      else sl = 1 - smooth((k - 0.45) / 0.55);
    }
    const busy = up + sl;
    const br = sin(t * 2.2 + ph);
    // waddle: short stumpy steps, big hip roll, footfall squash
    const A = 0.32 * m;
    P.rot(B.legL, sw * A, 0, -0.04 * max(0, sw) * m);
    P.rot(B.legR, -sw * A, 0, 0.04 * max(0, -sw) * m);
    P.move(B.legL, 0, max(0, -cw) * 0.06 * m, 0);
    P.move(B.legR, 0, max(0, cw) * 0.06 * m, 0);
    P.move(B.hips, 0, -abs(sw) * 0.06 * m + br * 0.012 * idle + 0.08 * up - 0.14 * sl, 0.12 * sl - 0.06 * hit);
    P.rot(B.hips, 0, sw * 0.1 * m, sw * 0.16 * m);
    P.rot(B.spine, 0.14 + 0.04 * m - 0.3 * up + 0.38 * sl - 0.12 * hit, -sw * 0.08 * m - 0.15 * up + 0.1 * sl, -sw * 0.12 * m + sin(t * 0.5 + ph) * 0.02 * idle);
    P.scale(B.spine, 1, 1 + 0.025 * br * idle, 1);
    P.scale(B.root, 1 + 0.015 * pow6(-cos(2 * w)) * m, 1 - 0.035 * pow6(-cos(2 * w)) * m, 1);
    // gut: lagging jiggle, breath, pushes out on the wind-up, bounces when hit
    const bj = sin(w * 2 - 1.3) * m;
    P.move(B.belly, 0, 0.05 * bj + 0.02 * br * idle - 0.04 * sl, 0.06 * up + 0.08 * hit);
    P.scale(B.belly, 1 + 0.035 * bj + 0.03 * br * idle + 0.12 * hit + 0.06 * up, 1 - 0.03 * bj - 0.05 * hit, 1 + 0.04 * bj + 0.14 * hit + 0.05 * up);
    // head: face tilted up toward the camera, slow look-around, chewing jaw, roar on the wind-up
    P.rot(B.head, -0.2 + 0.06 * cos(w * 2) * m - 0.25 * hit + 0.1 * up - 0.1 * sl, sin(t * 0.45 + ph) * sin(t * 1.1 + ph * 2) * 0.35 * idle * (1 - busy), 0.05 * sw * m);
    P.rot(B.jaw, 0.06 + 0.06 * max(0, sin(t * 3.1 + ph)) * idle + 0.45 * up + 0.2 * sl + 0.3 * hit, 0, 0);
    // left arm: swings, scratches the gut now and then, joins the slam
    const cyc = (t / 5.5 + s.seed) % 1;
    const sc = smooth(min(1, bump(cyc, 0, 0.3) * 3)) * idle * (1 - busy);
    P.rot(B.armL, -sw * A * 1.1 - 0.45 * sc - 2.4 * up - 0.7 * sl, 0, 0.1 + 0.03 * br * idle - 0.3 * sc - 0.35 * up - 0.3 * sl);
    P.rot(B.foreL, -0.2 - 0.12 * sw * m - (1.1 + 0.18 * sin(t * 13)) * sc - 0.4 * up - 0.2 * sl, 0, 0);
    // right arm + club. carry: club on the shoulder; wind: overhead behind; slam: head on the ground ahead
    const aX = -0.3 + 0.08 * sw * m + (-2.7 + 0.3) * up + (-0.8 + 0.3) * sl;
    const fX = -1.9 + 0.06 * br * idle + (-0.5 + 1.9) * up + (-0.3 + 1.9) * sl;
    const net = -0.95 + 0.05 * sw * m + (-2.6 + 0.95) * up + (2.0 + 0.95) * sl;
    P.rot(B.armR, aX, 0, -0.12 + 0.3 * up + 0.12 * sl);
    P.rot(B.foreR, fX, 0, 0);
    P.rot(B.weapon, net - aX - fX, 0, 0.1 * (1 - busy));
    // slam stance
    P.rot(B.legL, -0.3 * sl, 0, 0);
    P.rot(B.legR, 0.2 * sl, 0, 0);
  },
});

// =====================================================================================
//  5.4  ORC SPIRIT-SHAMAN
// =====================================================================================
const SH_FUR = 0x2f2520, SH_FUR_L = 0x4a3a30;
const SH_PLUME = [[0.05, 1.86], [0.0, 2.2], [-0.25, 2.5], [-0.5, 2.5], [-0.55, 2.3], [-0.3, 2.26], [-0.15, 2.0], [-0.12, 1.86]];

export const emberSpitter = defineCreature({
  id: 'emberSpitter',
  stride: 1.3,
  blob: 0.62,
  muzzle: [-0.4, 2.1, 0.7],
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.78, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.85, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 1.42, 0.14] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.42, 0.3] },
    { name: 'armL', parent: 'spine', pivot: [0.42, 1.32, 0] },
    { name: 'armR', parent: 'spine', pivot: [-0.42, 1.32, 0] },
    { name: 'foreR', parent: 'armR', pivot: [-0.46, 1.0, 0.05] },
    { name: 'weapon', parent: 'foreR', pivot: [-0.48, 0.78, 0.12] },
    { name: 'flame', parent: 'weapon', pivot: [-0.48, 2.42, 0.12] },
    { name: 'poleL', parent: 'spine', pivot: [0.2, 1.3, -0.3] },
    { name: 'poleR', parent: 'spine', pivot: [-0.2, 1.3, -0.3] },
    { name: 'legL', parent: 'hips', pivot: [0.15, 0.78, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.15, 0.78, 0] },
  ],
  build(pb) {
    // bare legs + wrapped boots
    pb.mirror((s, k) => {
      const b = 'leg' + s;
      pb.box(0.18, 0.6, 0.2, { bone: b, pos: [0.15 * k, 0.48, 0], bottom: [0.82, 0.85], color: SKIN });
      pb.box(0.23, 0.22, 0.34, { bone: b, pos: [0.15 * k, 0.11, 0.05], color: LEATHER });
    });
    // knee-length robe flap, charred hem
    pb.box(0.52, 0.46, 0.4, { bone: 'hips', pos: [0, 0.62, 0], taper: [0.84, 0.86], color: LEATHER_L });
    pb.box(0.56, 0.08, 0.44, { bone: 'hips', pos: [0, 0.42, 0], color: SOOT });
    pb.box(0.2, 0.34, 0.06, { bone: 'hips', pos: [0, 0.6, 0.22], color: RUST });
    pb.box(0.6, 0.1, 0.44, { bone: 'hips', pos: [0, 0.86, 0], color: LEATHER });
    pb.box(0.13, 0.12, 0.05, { bone: 'hips', pos: [0, 0.86, 0.23], color: BONE, trim: true });
    // torso: scrawny, bone-rib paint
    pb.box(0.52, 0.32, 0.38, { bone: 'spine', pos: [0, 0.98, 0], color: SKIN });
    pb.box(0.6, 0.5, 0.42, { bone: 'spine', pos: [0, 1.2, 0.04], rot: [0.26, 0, 0], taper: [1.2, 1.0], color: SKIN });
    for (let i = 0; i < 2; i++) pb.box(0.32 - i * 0.04, 0.06, 0.04, { bone: 'spine', pos: [0, 1.14 - i * 0.12, 0.27 + 0.01 * i], rot: [0.2, 0, 0], color: BONE });
    // fur mantle with hanging tufts
    pb.cyl(0.32, 0.58, 0.3, { bone: 'spine', pos: [0, 1.34, -0.02], radial: 6, color: SH_FUR });
    for (let i = 0; i < 3; i++) {
      const a = i * 1.5 + 0.4;
      ptCone(pb, [sin(a) * 0.5, 1.22, cos(a) * 0.46], [sin(a) * 0.56, 1.0, cos(a) * 0.52], 0.1, { bone: 'spine', radial: 4, color: SH_FUR_L });
    }
    // necklace
    for (let i = 0; i < 3; i++) oct(pb, 0.055, { bone: 'spine', pos: [(i - 1) * 0.13, 1.2 - (i === 1 ? 0.05 : 0), 0.32], color: TEAL, emis: 2 });
    // head: orc face under a warg-skull hood
    pb.box(0.36, 0.34, 0.36, { bone: 'head', pos: [0, 1.55, 0.2], taper: [0.88, 0.9], color: SKIN_L });
    pb.box(0.44, 0.3, 0.44, { bone: 'head', pos: [0, 1.7, 0.18], taper: [0.8, 0.85], color: BONE });
    pb.box(0.24, 0.14, 0.3, { bone: 'head', pos: [0, 1.66, 0.46], color: BONE });
    pb.box(0.15, 0.06, 0.12, { bone: 'head', pos: [0, 1.64, 0.62], color: SOOT });
    pb.mirror((s, k) => {
      pb.box(0.12, 0.1, 0.06, { bone: 'head', pos: [0.11 * k, 1.64, 0.4], color: SOOT });
      ptCone(pb, [0.14 * k, 1.84, 0.06], [0.22 * k, 2.1, -0.02], 0.08, { bone: 'head', color: BONE });
      ptCone(pb, [0.18 * k, 1.6, 0.0], [0.34 * k, 1.5, -0.12], 0.07, { bone: 'head', color: BONE, trim: true });
    });
    eyes(pb, 'head', 0.1, 1.63, 0.43, 0.045);
    pb.box(0.4, 0.09, 0.3, { bone: 'head', pos: [0, 1.5, 0.1], color: SH_FUR });
    // jaw + tusks
    pb.box(0.3, 0.1, 0.28, { bone: 'jaw', pos: [0, 1.46, 0.32], color: SKIN });
    pb.mirror((s, k) => ptCone(pb, [0.1 * k, 1.5, 0.43], [0.11 * k, 1.64, 0.47], 0.045, { bone: 'jaw', color: BONE }));
    // arms
    pb.box(0.17, 0.58, 0.17, { bone: 'armL', pos: [0.44, 1.02, 0], bottom: [0.8, 0.8], color: SKIN });
    pb.box(0.2, 0.2, 0.2, { bone: 'armL', pos: [0.44, 0.68, 0.03], color: SKIN_D });
    pb.box(0.17, 0.4, 0.17, { bone: 'armR', pos: [-0.45, 1.16, 0.01], color: SKIN });
    pb.box(0.15, 0.3, 0.15, { bone: 'foreR', pos: [-0.47, 0.88, 0.07], color: SKIN });
    pb.box(0.2, 0.2, 0.2, { bone: 'foreR', pos: [-0.48, 0.74, 0.12], color: SKIN_D });
    pb.box(0.15, 0.1, 0.15, { bone: 'foreR', pos: [-0.47, 0.92, 0.07], color: LEATHER });
    // back fetish poles
    pb.mirror((s, k) => {
      const b = 'pole' + s;
      ptBox(pb, [0.2 * k, 1.2, -0.3], [0.31 * k, 2.3, -0.3], 0.08, 0.08, { bone: b, color: WOOD });
      pb.box(0.19, 0.2, 0.22, { bone: b, pos: [0.31 * k, 2.4, -0.3], rot: [0, 0.3 * k, 0.2 * k], taper: [0.85, 0.85], color: BONE });
      pb.box(0.06, 0.2, 0.2, { bone: b, pos: [0.33 * k, 2.12, -0.4], rot: [0.3, 0, 0], color: RUST });
      pb.box(0.15, 0.07, 0.15, { bone: b, pos: [0.26 * k, 1.9, -0.3], color: BONE, trim: true });
    });
    // staff: gnarled wood, bone rings, iron brazier, spirit flame
    ptBox(pb, [-0.48, 0.14, 0.12], [-0.47, 1.2, 0.12], 0.1, 0.1, { bone: 'weapon', color: WOOD_D });
    ptBox(pb, [-0.47, 1.2, 0.12], [-0.48, 2.3, 0.12], 0.09, 0.09, { bone: 'weapon', color: WOOD_D });
    pb.box(0.14, 0.07, 0.14, { bone: 'weapon', pos: [-0.48, 1.85, 0.12], color: BONE });
    pb.box(0.14, 0.07, 0.14, { bone: 'weapon', pos: [-0.48, 1.55, 0.12], color: BONE, trim: true });
    pb.cyl(0.22, 0.13, 0.2, { bone: 'weapon', pos: [-0.48, 2.34, 0.12], radial: 6, color: IRON });
    pb.cyl(0.25, 0.25, 0.06, { bone: 'weapon', pos: [-0.48, 2.45, 0.12], radial: 6, color: IRON_L, trim: true });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.5;
      ptCone(pb, [-0.48 + sin(a) * 0.2, 2.42, 0.12 + cos(a) * 0.2], [-0.48 + sin(a) * 0.27, 2.68, 0.12 + cos(a) * 0.27], 0.05, { bone: 'weapon', radial: 4, color: IRON });
    }
    ptCone(pb, [-0.48, 2.46, 0.12], [-0.48, 2.98, 0.12], 0.17, { bone: 'flame', radial: 6, color: TEAL, emis: 2.4 });
    ptCone(pb, [-0.38, 2.46, 0.18], [-0.34, 2.84, 0.22], 0.12, { bone: 'flame', radial: 5, color: TEAL, emis: 2.4 });
    ptCone(pb, [-0.58, 2.46, 0.06], [-0.62, 2.82, 0.02], 0.12, { bone: 'flame', radial: 5, color: TEAL, emis: 2.4 });
    ptCone(pb, [-0.48, 2.46, 0.12], [-0.48, 2.74, 0.12], 0.09, { bone: 'flame', radial: 5, color: TEAL_HOT, emis: 3 });
    // elite: tall teal plume + gold horns
    side(pb, SH_PLUME, 0.09, { bone: 'head', pos: [0, 0, 0], color: TEAL, emis: 1.6, eliteOnly: true });
    pb.mirror((s, k) => ptCone(pb, [0.16 * k, 1.8, 0.2], [0.34 * k, 2.12, 0.3], 0.07, { bone: 'head', color: GOLD, eliteOnly: true }));
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, ph = s.seed * TAU, hit = s.hit;
    const sw = sin(w), cw = cos(w), idle = 1 - m;
    const act = s.action, k = s.k;
    const cast = act === 'cast';
    const atk = act === 'attack';
    const ac = atk ? strikeCurve(k, 0.08) : 0;
    // cast phases: wind 0..1 over k 0..0.7, then rel 0..1 over k 0.7..1
    const wind = cast ? smooth(min(k, 0.7) / 0.7) : 0;
    const rel = cast && k > 0.7 ? (k - 0.7) / 0.3 : 0;
    const thrust = rel > 0 ? smooth(min(1, rel / 0.35)) * (1 - smooth(max(0, (rel - 0.35) / 0.65))) : 0;
    const hold = wind * (1 - smooth(min(1, rel / 0.3)));   // wind-up pose, released over the first part of rel
    const br = sin(t * 2.6 + ph);
    const A = 0.5 * m;

    // gait: shuffling sidestep
    P.rot(B.legL, sw * A, 0, 0);
    P.rot(B.legR, -sw * A, 0, 0);
    P.move(B.legL, 0, max(0, -cw) * 0.05 * m, 0);
    P.move(B.legR, 0, max(0, cw) * 0.05 * m, 0);
    P.move(B.hips, 0, (cw * cw - 1) * 0.05 * m + br * 0.007 * idle, -0.1 * thrust * 0 + 0.0 - 0.07 * hit - 0.06 * thrust);
    P.rot(B.hips, 0, sw * 0.08 * m, sw * 0.04 * m);
    // spine
    P.rot(B.spine, 0.14 + 0.1 * m - 0.2 * hold + 0.2 * thrust - 0.25 * hit + 0.05 * ac, -0.5 * hold + 0.55 * thrust - sw * 0.1 * m + 0.3 * ac, sin(t * 1.2 + ph) * 0.025 * idle);
    P.scale(B.spine, 1, 1 + 0.02 * br, 1);
    // head: roars back on wind-up
    P.rot(B.head, -0.16 - 0.06 * m - 0.3 * hold + 0.2 * thrust - 0.3 * hit, sin(t * 0.55 + ph) * sin(t * 1.2 + ph * 2) * 0.3 * idle + 0.4 * hold - 0.5 * thrust, 0);
    P.rot(B.jaw, 0.1 + 0.6 * hold + 0.3 * thrust + 0.35 * hit, 0, 0);
    // off hand: balances, reaches up while chanting
    P.rot(B.armL, -sw * A * 0.8 - 0.8 * hold - 0.4 * thrust, 0, 0.12 + 0.7 * hold + 0.1 * br * idle);
    // staff arm. rest: held in front, staff vertical.  wind: swept back over the shoulder.  thrust: forward
    const armX = -0.3 + sw * A * 0.4 - 1.5 * hold - 0.5 * thrust + 0.3 * ac;
    const foreX = -0.5 - 0.5 * hold - 0.2 * thrust - 0.3 * max(-ac, 0);
    P.rot(B.armR, armX, 0, -0.1 - 0.2 * hold);
    P.rot(B.foreR, foreX, 0, 0);
    // weapon keeps the staff upright at rest (cancels arm + fore), tilts back on wind-up, thrusts forward on release
    P.rot(B.weapon, -(armX + foreX) - 0.1 - 0.5 * hold + 1.5 * thrust, 0, 0.15 * hold);
    // flame: flickers, grows on wind-up, spent after release
    const fl = 1 + 0.15 * sin(t * 62 + ph) + 0.1 * sin(t * 37);
    const grow = 1 + 1.2 * hold + 0.4 * thrust - 0.55 * smooth(min(1, rel / 0.4)) * (1 - smooth(max(0, (rel - 0.6) / 0.4)));
    P.scale(B.flame, 1 + 0.1 * grow * 0 + 0.15 * (grow - 1), fl * grow, 1 + 0.15 * (grow - 1));
    // fetish poles sway with lag
    P.rot(B.poleL, 0.05 + sin(w - 0.8) * 0.12 * m + sin(t * 1.7 + ph) * 0.03 * idle - 0.3 * thrust + 0.25 * hold, 0, sin(t * 1.3 + ph) * 0.03);
    P.rot(B.poleR, 0.05 + sin(w - 1.2) * 0.12 * m + sin(t * 1.5 + ph + 1) * 0.03 * idle - 0.3 * thrust + 0.25 * hold, 0, -sin(t * 1.4 + ph) * 0.03);
    P.rot(B.poleL, 0, 0, -0.1 * sw * m);
    P.rot(B.poleR, 0, 0, -0.1 * sw * m);
  },
});

// =====================================================================================
//  5.5  WAR BOAR + GOBLIN OUTRIDER
// =====================================================================================
const BOAR = 0x6e4c38, BOAR_D = 0x3d2b22, BOAR_BELLY = 0x94705a, SNOUT = 0xc48a70;
const GSKIN = 0x8aa332, GSKIN_D = 0x5f7228;
const PENNANT = [[-0.02, 2.48], [-0.6, 2.4], [-0.45, 2.26], [-0.62, 2.1], [-0.02, 2.02]];
const SIGIL = [[-0.14, 2.26], [-0.26, 2.37], [-0.38, 2.26], [-0.26, 2.15]];
const BOAR_PLUME = [[0.7, 1.2], [0.55, 1.5], [0.2, 1.7], [-0.1, 1.62], [-0.2, 1.4], [0.15, 1.42], [0.35, 1.2]];

export const magmaRam = defineCreature({
  id: 'magmaRam',
  stride: 1.2,
  blob: 1.0,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 0.82, 0] },
    { name: 'mane', parent: 'body', pivot: [0, 1.1, 0.3] },
    { name: 'head', parent: 'body', pivot: [0, 0.9, 0.62] },
    { name: 'jaw', parent: 'head', pivot: [0, 0.76, 0.85] },
    { name: 'legFL', parent: 'body', pivot: [0.27, 0.62, 0.45] },
    { name: 'legFR', parent: 'body', pivot: [-0.27, 0.62, 0.45] },
    { name: 'legBL', parent: 'body', pivot: [0.27, 0.62, -0.5] },
    { name: 'legBR', parent: 'body', pivot: [-0.27, 0.62, -0.5] },
    { name: 'tail', parent: 'body', pivot: [0, 0.95, -0.88] },
    { name: 'rider', parent: 'body', pivot: [0, 1.15, -0.1] },
    { name: 'riderArm', parent: 'rider', pivot: [-0.2, 1.5, -0.08] },
    { name: 'pennant', parent: 'riderArm', pivot: [-0.22, 1.2, 0.02] },
    { name: 'flag', parent: 'pennant', pivot: [-0.22, 2.3, 0.0] },
  ],
  build(pb) {
    // body: high humped front, lower rump
    pb.box(0.86, 0.76, 0.96, { bone: 'body', pos: [0, 0.8, 0.2], taper: [0.84, 0.86], color: BOAR });
    pb.box(0.76, 0.66, 0.86, { bone: 'body', pos: [0, 0.75, -0.5], taper: [0.9, 0.9], color: BOAR });
    pb.sphere(0.42, { bone: 'body', pos: [0, 1.1, 0.28], scale: [1.0, 0.62, 1.1], seg: [6, 3], color: BOAR });
    pb.box(0.62, 0.18, 1.5, { bone: 'body', pos: [0, 0.44, -0.12], color: BOAR_BELLY });
    // saddle + straps + buckle
    pb.box(0.78, 0.12, 0.56, { bone: 'body', pos: [0, 1.15, -0.12], color: LEATHER });
    pb.box(0.82, 0.05, 0.6, { bone: 'body', pos: [0, 1.1, -0.12], color: RUST, trim: true });
    // bristle ridge (flattens in the charge)
    for (let i = 0; i < 6; i++) {
      const z = 0.62 - i * 0.22, y = (i < 3 ? 1.28 - i * 0.02 : 1.14 - (i - 3) * 0.03);
      ptCone(pb, [0, y - 0.04, z], [0, y + 0.26, z - 0.1], 0.09, { bone: 'mane', radial: 4, color: SOOT });
    }
    // legs
    pb.mirror((s, k) => {
      pb.box(0.26, 0.52, 0.28, { bone: 'legF' + s, pos: [0.27 * k, 0.36, 0.45], bottom: [0.8, 0.85], color: BOAR });
      pb.box(0.24, 0.12, 0.3, { bone: 'legF' + s, pos: [0.27 * k, 0.06, 0.48], color: SOOT });
      pb.box(0.28, 0.52, 0.3, { bone: 'legB' + s, pos: [0.27 * k, 0.36, -0.5], bottom: [0.8, 0.85], color: BOAR });
      pb.box(0.24, 0.12, 0.3, { bone: 'legB' + s, pos: [0.27 * k, 0.06, -0.47], color: SOOT });
    });
    // tail
    ptCone(pb, [0, 0.95, -0.9], [0, 1.15, -1.1], 0.07, { bone: 'tail', radial: 5, color: BOAR });
    pb.box(0.12, 0.12, 0.12, { bone: 'tail', pos: [0, 1.17, -1.12], color: SOOT });
    // head: block + snout + disc
    pb.box(0.58, 0.58, 0.4, { bone: 'head', pos: [0, 0.9, 0.58], color: BOAR });
    pb.box(0.52, 0.5, 0.48, { bone: 'head', pos: [0, 0.88, 0.8], taper: [0.9, 0.9], color: BOAR });
    pb.box(0.38, 0.32, 0.28, { bone: 'head', pos: [0, 0.78, 1.04], color: BOAR_BELLY });
    pb.cyl(0.17, 0.19, 0.1, { bone: 'head', pos: [0, 0.77, 1.21], rot: [PI / 2, 0, 0], radial: 6, color: SNOUT });
    // iron face-plate, spike, teal sigil stripe
    pb.box(0.56, 0.1, 0.56, { bone: 'head', pos: [0, 1.17, 0.75], color: IRON });
    pb.box(0.54, 0.1, 0.16, { bone: 'head', pos: [0, 1.13, 1.03], rot: [0.5, 0, 0], color: IRON, trim: true });
    ptCone(pb, [0, 1.2, 0.9], [0, 1.34, 1.18], 0.09, { bone: 'head', color: BONE });
    pb.box(0.09, 0.05, 0.5, { bone: 'head', pos: [0, 1.235, 0.74], color: TEAL, emis: 2.2 });
    pb.mirror((s, k) => {
      oct(pb, 0.05, { bone: 'head', pos: [0.24 * k, 1.02, 1.0], rot: [0, 0, k * 0.4], scale: [1.4, 0.8, 0.9], color: TEAL, emis: 2.6 });
    });
    // jaw + big curved tusks
    pb.box(0.34, 0.12, 0.4, { bone: 'jaw', pos: [0, 0.62, 1.0], color: BOAR_D });
    pb.mirror((s, k) => {
      ptCone(pb, [0.2 * k, 0.64, 0.92], [0.3 * k, 0.72, 1.28], 0.1, { bone: 'jaw', radial: 5, color: BONE });
      ptCone(pb, [0.3 * k, 0.72, 1.28], [0.3 * k, 1.0, 1.46], 0.08, { bone: 'jaw', radial: 5, color: BONE });
    });
    // rider: goblin outrider
    pb.box(0.4, 0.34, 0.3, { bone: 'rider', pos: [0, 1.4, -0.1], taper: [0.88, 0.9], color: LEATHER_L });
    pb.mirror((s, k) => pb.box(0.14, 0.3, 0.16, { bone: 'rider', pos: [0.26 * k, 1.2, -0.06], rot: [0, 0, 0.5 * k], color: GSKIN }));
    pb.box(0.38, 0.32, 0.34, { bone: 'rider', pos: [0, 1.72, -0.02], taper: [0.82, 0.84], color: GSKIN });
    pb.box(0.2, 0.14, 0.12, { bone: 'rider', pos: [0, 1.66, 0.18], color: GSKIN_D });
    pb.sphere(0.21, { bone: 'rider', pos: [0, 1.86, -0.02], scale: [1, 0.6, 1.05], seg: [7, 3], thetaLength: PI / 2, color: LEATHER });
    pb.box(0.38, 0.06, 0.36, { bone: 'rider', pos: [0, 1.82, -0.02], color: LEATHER_L, trim: true });
    pb.mirror((s, k) => {
      ptCone(pb, [0.18 * k, 1.74, -0.04], [0.52 * k, 1.84, -0.18], 0.08, { bone: 'rider', color: GSKIN });
      pb.box(0.15, 0.15, 0.06, { bone: 'rider', pos: [0.1 * k, 1.76, 0.17], color: IRON });
      pb.box(0.1, 0.1, 0.05, { bone: 'rider', pos: [0.1 * k, 1.76, 0.2], color: TEAL, emis: 2.4 });
    });
    pb.box(0.2, 0.05, 0.08, { bone: 'rider', pos: [0, 1.6, 0.16], color: BONE });
    // rider arm + lance pennant
    pb.box(0.1, 0.34, 0.1, { bone: 'riderArm', pos: [-0.22, 1.35, 0.0], color: GSKIN });
    pb.box(0.12, 0.12, 0.12, { bone: 'riderArm', pos: [-0.22, 1.2, 0.02], color: GSKIN_D });
    ptBox(pb, [-0.22, 0.95, 0.02], [-0.22, 2.45, 0.02], 0.08, 0.08, { bone: 'pennant', color: WOOD });
    ptCone(pb, [-0.22, 2.44, 0.02], [-0.22, 2.64, 0.02], 0.06, { bone: 'pennant', radial: 5, color: IRON_L, trim: true });
    side(pb, PENNANT, 0.05, { bone: 'flag', pos: [-0.22, 0, 0], color: BONE });
    side(pb, SIGIL, 0.08, { bone: 'flag', pos: [-0.22, 0, 0], color: TEAL, emis: 2.0 });
    // elite: teal plume + gold horns on the boar, gold spikes on the rider's cap
    side(pb, BOAR_PLUME, 0.1, { bone: 'head', pos: [0, 0, 0], color: TEAL, emis: 1.6, eliteOnly: true });
    pb.mirror((s, k) => {
      ptCone(pb, [0.2 * k, 1.2, 0.62], [0.42 * k, 1.5, 0.64], 0.09, { bone: 'head', color: GOLD, eliteOnly: true });
      ptCone(pb, [0.12 * k, 1.9, -0.02], [0.2 * k, 2.15, -0.02], 0.06, { bone: 'rider', color: GOLD, eliteOnly: true });
    });
    ptCone(pb, [0, 1.92, -0.02], [0, 2.22, -0.02], 0.07, { bone: 'rider', color: GOLD, eliteOnly: true });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, ph = s.seed * TAU, hit = s.hit, k = s.k;
    const act = s.action, idle = 1 - m;
    const wu = act === 'windup', ch = act === 'charge', rc = act === 'recover', atk = act === 'attack';
    const ac = atk ? strikeCurve(k, 0.08) : 0;
    const br = sin(t * 2.2 + ph);

    let lance = 0;      // pennant lowered 0..1
    let headDown = 0;   // head pitch
    let pawE = 0, paw = 0;
    let comp = 0;
    let gal = 0;        // gallop blend 0..1
    let skid = 0;
    if (wu) {
      headDown = 0.45 * smooth(k / 0.21);
      lance = smooth((k - 0.15) / 0.35);
      const u = clamp01((k - 0.21) / 0.65);
      pawE = smooth((k - 0.18) / 0.05) * (1 - smooth((k - 0.86) / 0.06));
      paw = (0.3 - 1.15 * sin(PI * (u * 2 % 1))) * pawE;
      comp = smooth((k - 0.86) / 0.14);
    } else if (ch) {
      gal = 1; lance = 1; headDown = 0.5;
    } else if (rc) {
      skid = 1 - smooth(k / 0.7);
      lance = 1 - smooth(k / 0.5);
      headDown = 0.2 * skid;
    }

    // ---- legs
    if (gal > 0) {
      const g = w * 0.5 + 0.0;
      const c = cos(g), c2 = cos(g + 0.3);
      P.rot(B.legFL, gallopF(c, 0.95), 0, 0);
      P.rot(B.legFR, gallopF(c2, 0.95), 0, 0);
      P.rot(B.legBL, gallopB(-c, 0.95), 0, 0);
      P.rot(B.legBR, gallopB(-c2, 0.95), 0, 0);
      P.move(B.body, 0, sin(g * 2 + 0.4) * 0.06, 0);
      P.rot(B.body, -0.1 * c, 0, 0);
      P.scale(B.body, 1, 1, 1.08);
    } else {
      const A = 0.45 * m * (1 - skid);
      const sw = sin(w);
      P.rot(B.legFL, sw * A, 0, 0);
      P.rot(B.legBR, sw * A, 0, 0);
      P.rot(B.legFR, -sw * A + paw, 0, 0);
      P.rot(B.legBL, -sw * A, 0, 0);
      P.move(B.legFL, 0, max(0, -cos(w)) * 0.05 * m, 0);
      P.move(B.legBR, 0, max(0, -cos(w)) * 0.05 * m, 0);
      P.move(B.legFR, 0, max(0, cos(w)) * 0.05 * m, 0);
      P.move(B.legBL, 0, max(0, cos(w)) * 0.05 * m, 0);
      P.move(B.body, 0, (cos(w) * cos(w) - 1) * 0.04 * m + br * 0.008 * idle, 0);
      P.rot(B.body, 0.12 * smooth(wu ? k / 0.21 : 0) * (wu ? 1 : 0) * (1 - comp) + sin(w * 2) * 0.03 * m, 0, sin(w) * 0.03 * m);
      if (wu) P.scale(B.body, 1, 1 - 0.05 * comp, 1 - 0.08 * comp);
    }
    if (rc) {
      // skid: braced front legs, body sits back, head shakes, rider wobbles
      P.rot(B.legFL, -0.75 * skid, 0, 0);
      P.rot(B.legFR, -0.75 * skid, 0, 0);
      P.rot(B.legBL, 0.4 * skid, 0, 0);
      P.rot(B.legBR, 0.4 * skid, 0, 0);
      P.rot(B.body, -0.14 * skid, 0, 0);
      P.move(B.body, 0, -0.04 * skid, 0.25 * skid);
    }
    // ---- head
    const shake = rc ? sin(clamp01((k - 0.25) / 0.65) * TAU * 3) * 0.45 * (clamp01((k - 0.25) / 0.65) > 0 && k < 0.9 ? 1 : 0) : 0;
    P.rot(B.head, headDown + 0.04 * br * idle - 0.1 * cos(w) * m * (1 - gal) - 0.5 * ac - 0.3 * hit * 0 + (atk ? 0.0 : 0) - 0.25 * hit, shake + sin(t * 0.5 + ph) * 0.15 * idle * sin(t * 1.1 + ph * 3), 0);
    P.rot(B.jaw, 0.08 + 0.3 * max(-ac, 0) + 0.2 * hit + 0.18 * (wu ? bump(k, 0.2, 0.4) : 0) + 0.05 * sin(t * 2 + ph) * idle, 0, 0);
    if (atk) P.move(B.body, 0, 0, 0.22 * max(ac, 0) - 0.05 * max(-ac, 0));
    P.move(B.body, 0, 0, -0.07 * hit);
    P.rot(B.mane, -0.4 * gal, 0, 0);
    P.rot(B.tail, -0.2 * gal + 0.1 * hit, sin(t * 5 + ph) * 0.35 * idle + sin(w * 2) * 0.2 * m, 0);

    // ---- rider: bounces with lag, leans into the charge, wobbles on the skid
    const bounce = sin(w * 2 - 1.0) * m;
    const wob = rc ? sin(k * TAU * 3.2) * 0.3 * skid : 0;
    P.move(B.rider, 0, 0.03 * bounce + 0.012 * br * idle, 0);
    P.rot(B.rider, -0.05 * bounce + 0.2 * (ch ? 1 : 0) + 0.12 * comp + 0.1 * (wu ? smooth(k / 0.3) : 0) - 0.2 * skid, 0, wob);
    // pennant: carried upright (sways) → lowered like a lance
    const sway = sin(t * 8 + ph) * 0.08 * m + sin(t * 1.8 + ph) * 0.04;
    P.rot(B.riderArm, -0.4 * lance, 0, -0.1 * lance);
    P.rot(B.pennant, 1.0 * lance + sway * (1 - lance) + 0.3 * wob, 0, 0);
    P.rot(B.flag, 0, sin(t * 11 + ph) * 0.18 + sin(t * 7) * 0.1 * (0.4 + gal), sin(t * 9 + ph) * 0.1);
  },
});

// =====================================================================================
//  5.6  GOBLIN SAPPER
// =====================================================================================
const KEG = 0x7a2e1e;
const SAP_PLUME = [[0.0, 2.0], [-0.1, 2.4], [-0.3, 2.62], [-0.55, 2.56], [-0.5, 2.38], [-0.3, 2.3], [-0.2, 2.0]];

export const pyreBomber = defineCreature({
  id: 'pyreBomber',
  stride: 1.5,
  blob: 0.65,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.42, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.46, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 0.82, 0.06] },
    { name: 'earL', parent: 'head', pivot: [0.2, 1.0, 0.04] },
    { name: 'earR', parent: 'head', pivot: [-0.2, 1.0, 0.04] },
    { name: 'armL', parent: 'spine', pivot: [0.24, 0.8, 0] },
    { name: 'foreL', parent: 'armL', pivot: [0.36, 1.02, 0.04] },
    { name: 'armR', parent: 'spine', pivot: [-0.24, 0.8, 0] },
    { name: 'foreR', parent: 'armR', pivot: [-0.36, 1.02, 0.04] },
    { name: 'keg', parent: 'spine', pivot: [0, 1.58, 0] },
    { name: 'band', parent: 'keg', pivot: [0, 1.58, 0] },
    { name: 'spark', parent: 'keg', pivot: [0.2, 2.2, 0.04] },
    { name: 'legL', parent: 'hips', pivot: [0.1, 0.42, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.1, 0.42, 0] },
  ],
  build(pb) {
    // legs + boots
    pb.mirror((s, k) => {
      const b = 'leg' + s;
      pb.box(0.15, 0.36, 0.16, { bone: b, pos: [0.1 * k, 0.24, 0], bottom: [0.8, 0.85], color: GSKIN });
      pb.box(0.19, 0.14, 0.28, { bone: b, pos: [0.1 * k, 0.07, 0.04], color: LEATHER });
    });
    // hips + vest
    pb.box(0.36, 0.22, 0.28, { bone: 'hips', pos: [0, 0.46, 0], taper: [0.88, 0.88], color: LEATHER });
    pb.box(0.14, 0.2, 0.05, { bone: 'hips', pos: [0, 0.4, 0.15], color: RUST });
    pb.box(0.4, 0.36, 0.3, { bone: 'spine', pos: [0, 0.68, 0], taper: [1.12, 1.0], color: LEATHER_L });
    pb.box(0.34, 0.24, 0.26, { bone: 'spine', pos: [0, 0.58, 0.04], color: GSKIN });
    // bandolier of mini kegs
    pb.box(0.09, 0.56, 0.06, { bone: 'spine', pos: [0, 0.7, 0.16], rot: [0, 0, -0.65], color: LEATHER });
    for (let i = 0; i < 3; i++) {
      const u = (i - 1) * 0.17;
      pb.box(0.11, 0.14, 0.11, { bone: 'spine', pos: [sin(0.65) * u, 0.7 + cos(0.65) * u, 0.21], color: KEG });
    }
    // head: big, goggled, grinning
    pb.box(0.44, 0.36, 0.4, { bone: 'head', pos: [0, 0.98, 0.1], taper: [0.8, 0.84], color: GSKIN });
    pb.box(0.24, 0.16, 0.14, { bone: 'head', pos: [0, 0.9, 0.3], color: GSKIN_D });
    pb.cone(0.06, 0.15, { bone: 'head', pos: [0, 0.94, 0.4], rot: [PI / 2 + 0.2, 0, 0], radial: 5, color: GSKIN_D });
    pb.box(0.26, 0.06, 0.06, { bone: 'head', pos: [0, 0.83, 0.32], color: SOOT });
    pb.mirror((s, k) => pb.box(0.06, 0.09, 0.05, { bone: 'head', pos: [0.05 * k, 0.82, 0.34], color: BONE }));
    pb.box(0.48, 0.07, 0.43, { bone: 'head', pos: [0, 1.04, 0.1], color: LEATHER, trim: true });   // goggle strap (T)
    pb.sphere(0.24, { bone: 'head', pos: [0, 1.16, 0.08], scale: [1.02, 0.5, 1.0], seg: [8, 3], thetaLength: PI / 2, color: LEATHER_L });
    pb.mirror((s, k) => {
      pb.box(0.17, 0.17, 0.07, { bone: 'head', pos: [0.1 * k, 1.04, 0.3], color: IRON });
      pb.box(0.11, 0.11, 0.05, { bone: 'head', pos: [0.1 * k, 1.04, 0.34], color: TEAL, emis: 2.6 });
      // big goblin ears: T-bar under the keg
      ptCone(pb, [0.18 * k, 1.0, 0.04], [0.58 * k, 1.12, -0.12], 0.09, { bone: 'ear' + s, color: GSKIN });
      ptCone(pb, [0.3 * k, 1.04, 0.0], [0.58 * k, 1.12, -0.12], 0.06, { bone: 'ear' + s, color: GSKIN_D });
    });
    // arms raised, holding the keg
    pb.mirror((s, k) => {
      ptBox(pb, [0.22 * k, 0.8, 0], [0.36 * k, 1.02, 0.04], 0.14, 0.14, { bone: 'arm' + s, color: GSKIN });
      ptBox(pb, [0.36 * k, 1.02, 0.04], [0.3 * k, 1.3, 0.1], 0.13, 0.13, { bone: 'fore' + s, color: GSKIN });
      pb.box(0.14, 0.14, 0.14, { bone: 'fore' + s, pos: [0.29 * k, 1.34, 0.12], color: GSKIN_D });
    });
    // keg: barrel lathe, iron bands (T), bone skull lid, fuse, spark, heat band
    pb.lathe([[0.001, -0.275], [0.3, -0.275], [0.35, 0], [0.3, 0.275], [0.001, 0.275]], { bone: 'keg', pos: [0, 1.58, 0], radial: 8, color: KEG });
    pb.cyl(0.33, 0.33, 0.08, { bone: 'keg', pos: [0, 1.42, 0], radial: 8, color: IRON, trim: true });
    pb.cyl(0.33, 0.33, 0.08, { bone: 'keg', pos: [0, 1.74, 0], radial: 8, color: IRON, trim: true });
    pb.cyl(0.27, 0.27, 0.04, { bone: 'keg', pos: [0, 1.86, 0], radial: 8, color: BONE });
    pb.mirror((s, k) => pb.box(0.09, 0.03, 0.09, { bone: 'keg', pos: [0.09 * k, 1.89, 0.06], color: SOOT }));
    pb.box(0.2, 0.03, 0.06, { bone: 'keg', pos: [0, 1.89, -0.12], color: SOOT });
    ptBox(pb, [0.1, 1.86, 0.0], [0.2, 2.14, 0.04], 0.07, 0.07, { bone: 'keg', color: SOOT });
    oct(pb, 0.12, { bone: 'spark', pos: [0.2, 2.2, 0.04], color: 0xfff2a0, emis: 3 });
    oct(pb, 0.07, { bone: 'spark', pos: [0.32, 2.28, 0.08], color: 0xfff2a0, emis: 3 });
    oct(pb, 0.07, { bone: 'spark', pos: [0.1, 2.3, 0.0], color: 0xffd060, emis: 3 });
    pb.cyl(0.36, 0.36, 0.06, { bone: 'band', pos: [0, 1.58, 0], radial: 8, color: 0xff5a2a, emis: 2.4 });
    // elite: gold spiked ring + teal plume on the keg lid
    for (let i = 0; i < 3; i++) {
      const a = i * 1.5708 + 0.8;
      ptCone(pb, [sin(a) * 0.24, 1.88, cos(a) * 0.24], [sin(a) * 0.28, 2.12, cos(a) * 0.28], 0.06, { bone: 'keg', radial: 4, color: GOLD, eliteOnly: true });
    }
    side(pb, SAP_PLUME.map(([z, y]) => [z - 0.12, y]), 0.08, { bone: 'keg', pos: [0, 0, 0], color: TEAL, emis: 1.6, eliteOnly: true });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk * 1.4, m = s.move, ph = s.seed * TAU, hit = s.hit, k = s.k;
    const sw = sin(w), cw = cos(w);
    const fuse = s.action === 'fuse';
    const atk = s.action === 'attack';
    const ac = atk ? strikeCurve(k, 0.08) : 0;
    const f = fuse ? k : 0;
    const A = 0.85 * m * (fuse ? 0 : 1);
    const br = sin(t * 3 + ph);
    const idle = 1 - m;

    // frantic run in place while the fuse burns
    const fr = fuse ? t * (22 + 12 * f) : 0;
    const frs = sin(fr), frc = cos(fr);
    const fz = fuse ? 1 : 0;
    P.rot(B.legL, sw * A + frs * 0.85 * fz, 0, 0);
    P.rot(B.legR, -sw * A - frs * 0.85 * fz, 0, 0);
    P.move(B.legL, 0, max(0, -cw) * 0.08 * m + max(0, -frc) * 0.08 * fz, 0);
    P.move(B.legR, 0, max(0, cw) * 0.08 * m + max(0, frc) * 0.08 * fz, 0);
    P.move(B.hips, 0, (cw * cw - 1) * 0.04 * m + abs(frc) * 0.04 * fz + br * 0.008 * idle * (1 - fz) - 0.07 * hit, 0.04 * max(ac, 0) - 0.05 * hit);
    P.rot(B.hips, 0, sw * 0.12 * m, sw * 0.05 * m + sin(fr * 0.5) * 0.08 * fz * f);
    P.rot(B.spine, 0.08 + 0.2 * m + 0.1 * fz - 0.2 * hit + 0.25 * max(ac, 0) - 0.15 * max(-ac, 0), -sw * 0.12 * m + sin(fr * 0.5) * 0.1 * fz * f, sin(t * 1.4 + ph) * 0.02 * idle);
    P.scale(B.spine, 1, 1 + 0.02 * br, 1);
    P.rot(B.head, -0.08 - 0.12 * m + sin(w * 2 + 0.5) * 0.05 * m - 0.2 * hit, sin(t * 0.8 + ph) * sin(t * 1.9 + ph * 2) * 0.35 * idle + sin(fr) * 0.1 * fz * f, 0);

    // keg: bobs on the arms with lag; lifted + shaken in the fuse
    const lift = fuse ? 0.14 * smooth(k * 5) : 0;
    const shk = fuse ? sin(t * TAU * 18) * (0.04 + 0.13 * f) : 0;
    P.move(B.keg, 0, sin(w * 2 - 0.8) * 0.035 * m + lift + 0.012 * br * idle, 0.25 * max(ac, 0) - 0.06 * max(-ac, 0) + shk * 0.3);
    P.rot(B.keg, shk * 0.5, 0, sw * 0.06 * m + shk + (fuse ? 0 : 0));
    // forearms stretch so the hands follow the keg
    const ext = 1 + lift / 0.3 + 0.1 * max(ac, 0);
    P.scale(B.foreL, 1, ext, 1);
    P.scale(B.foreR, 1, ext, 1);
    P.rot(B.armL, -0.1 * hit, 0, 0.05 * sw * m);
    P.rot(B.armR, -0.1 * hit, 0, -0.05 * sw * m);
    // ears flap back
    const ef = 0.5 * m + 0.15 * sin(w * 2) * m + 0.4 * fz * f + 0.2 * hit + 0.1 * flick(t, ph * 2, 2.1) * idle;
    P.rot(B.earL, 0, ef, 0.1 * sin(t * 3 + ph) * idle);
    P.rot(B.earR, 0, -ef, -0.1 * sin(t * 3.2 + ph) * idle);

    // fuse spark flickers (rate 6 → 20 Hz, up to ×2 size), heat band ramps in
    const rate = fuse ? 6 + 14 * f : 6;
    const fk = 1 + (0.3 + 0.2 * f) * sin(t * TAU * rate + ph) * sin(t * 13.7 + ph * 3);
    const sz = (1 + f) * fk;
    P.scale(B.spark, sz, sz, sz);
    const bd = fuse ? smooth(f * 1.6) : 0;
    P.scale(B.band, max(bd, 0.0001), max(bd, 0.0001), max(bd, 0.0001));
    // last 0.15 s: the whole sapper bulges
    if (fuse && f > 0.85) { const g = 1 + 0.15 * smooth((f - 0.85) / 0.15); P.scale(B.root, g, g, g); }
  },
});

export const REGISTER = { ashHusk, cinderling, obsidianBrute, emberSpitter, magmaRam, pyreBomber };
