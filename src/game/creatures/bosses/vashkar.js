// Boss 2 of 3: Vashkar, the Ashen Warchief (vashkar). Split out of bossModels.js; no behaviour change.
import { defineCreature, TAU, smooth, clamp01 } from '../rig.js';
import { PI, sin, cos, abs, max, qAim, eul, add, Frame, arc, boneMap, W, track, play, hold, weights, runActions } from './common.js';

// =====================================================================================
//  VASHKAR, THE ASHEN WARCHIEF  (vashkar, r 2.2) — §5.7
// =====================================================================================

const V = {
  skin: 0x4f6b2a, skinDk: 0x425a22, skinLt: 0x5f7e32, iron: 0x2b2a2e, ironLt: 0x47454c, leather: 0x3d2618, leatherDk: 0x2a1a10,
  bone: 0xeadfc4, rust: 0x8a4a2a, teal: 0x1fe0c2, ember: 0xff5a2a, emberHot: 0xffb040, wood: 0x3a2616,
  cloth: 0xeadfc4, soot: 0x2a2420, dark: 0x141014, flame: 0xff7a2a,
};

// Model-space point of the axe head when dragged during a charge (bosses.js: fire-trail sparks).
export const VASHKAR_AXE_DRAG = [-1.9, 0.35, -2.6];

const vashkarBones = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 2.0, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 2.25, 0] },
  { name: 'head', parent: 'spine', pivot: [0, 4.6, 0.42] },
  { name: 'jaw', parent: 'head', pivot: [0, 4.48, 0.78] },
  { name: 'pauldL', parent: 'spine', pivot: [1.45, 4.45, 0] },
  { name: 'pauldR', parent: 'spine', pivot: [-1.45, 4.45, 0] },
  { name: 'armL', parent: 'spine', pivot: [1.75, 4.3, 0] },
  { name: 'foreL', parent: 'armL', pivot: [1.95, 3.05, 0.1] },
  { name: 'armR', parent: 'spine', pivot: [-1.75, 4.3, 0] },
  { name: 'foreR', parent: 'armR', pivot: [-1.95, 3.05, 0.1] },
  { name: 'axe', parent: 'foreR', pivot: [-2.0, 1.85, 0.2] },
  { name: 'axeFire', parent: 'axe', pivot: [-2.7, 4.15, 0.2] },   // Axe Heat: flames along the blade, scaled by h.heat (0..1)
  { name: 'legL', parent: 'hips', pivot: [0.72, 2.0, 0] },
  { name: 'kneeL', parent: 'legL', pivot: [0.75, 1.05, 0.1] },
  { name: 'legR', parent: 'hips', pivot: [-0.72, 2.0, 0] },
  { name: 'kneeR', parent: 'legR', pivot: [-0.75, 1.05, 0.1] },
  { name: 'kilt', parent: 'hips', pivot: [0, 2.15, 0.75] },
  { name: 'bannerL', parent: 'spine', pivot: [0.75, 4.0, -1.1] },
  { name: 'flagL', parent: 'bannerL', pivot: [1.15, 7.0, -1.1] },
  { name: 'hemL', parent: 'flagL', pivot: [1.15, 6.12, -1.1] },
  { name: 'fireL', parent: 'flagL', pivot: [1.15, 7.0, -1.1] },
  { name: 'bannerR', parent: 'spine', pivot: [-0.75, 4.0, -1.1] },
  { name: 'flagR', parent: 'bannerR', pivot: [-1.15, 7.0, -1.1] },
  { name: 'hemR', parent: 'flagR', pivot: [-1.15, 6.12, -1.1] },
  { name: 'fireR', parent: 'flagR', pivot: [-1.15, 7.0, -1.1] },
];
const VB = boneMap(vashkarBones);

// Bone-white skull facing +Z (cranium centre c, radius r).
function skull(F, c, r, o) {
  F.sphere(r, { ...o, pos: c, seg: [7, 5], scale: [0.9, 0.88, 1.0], color: V.bone });
  for (const e of [1, -1]) F.sphere(r * 0.24, { ...o, pos: [c[0] + 0.36 * r * e, c[1] + 0.02 * r, c[2] + 0.84 * r], seg: [5, 3], color: V.dark });
  F.box(r * 0.2, r * 0.22, r * 0.2, { ...o, pos: [c[0], c[1] - 0.3 * r, c[2] + 0.9 * r], color: V.dark });
  F.box(r * 1.05, r * 0.42, r * 0.7, { ...o, pos: [c[0], c[1] - 0.72 * r, c[2] + 0.42 * r], taper: [1, 1.1], color: V.bone });
}

function buildVashkar(pb) {
  const F = new Frame(pb);
  // box spanning a → b (its length along a→b)
  const strap = (a, b, w, d, o) => { const dd = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; F.box(w, Math.hypot(dd[0], dd[1], dd[2]), d, { ...o, pos: add(a, dd, 0.5), rot: eul(qAim(dd)) }); };

  // ---------------- legs: bare thighs, rounded iron greaves, spiked knee cops, sabatons
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    F.cap([0.74 * s, 2.2, 0], [0.77 * s, 1.05, 0.1], 0.57, { bone: 'leg' + L, color: V.skin });
    F.seg([0.78 * s, 0.32, 0.2], [0.77 * s, 1.08, 0.12], 0.46, 0.55, { bone: 'knee' + L, radial: 8, color: V.iron });
    F.sphere(0.34, { bone: 'knee' + L, pos: [0.78 * s, 1.1, 0.42], seg: [6, 4], color: V.ironLt });
    F.spike([0.78 * s, 1.12, 0.7], [0, 0.25, 1], 0.11, 0.42, { bone: 'knee' + L, color: V.bone });
    F.box(0.9, 0.38, 1.25, { bone: 'knee' + L, pos: [0.8 * s, 0.19, 0.38], taper: [0.78, 0.82], color: V.iron });
    F.box(0.92, 0.1, 0.16, { bone: 'knee' + L, pos: [0.8 * s, 0.07, 1.0], color: V.rust, trim: true });
  }
  // ---------------- hips: belt, skull buckle, iron kilt plates (front plates hang from the kilt bone)
  F.box(2.0, 0.8, 1.4, { bone: 'hips', pos: [0, 2.0, 0], taper: [1.05, 1.05], color: V.leather });
  F.cyl(1.32, 1.26, 0.46, { bone: 'hips', pos: [0, 2.32, 0.02], radial: 10, scale: [1, 1, 0.74], color: V.leatherDk });
  skull(F, [0, 2.42, 0.9], 0.3, { bone: 'hips' });
  for (const s of [1, -1]) {
    F.box(0.72, 1.05, 0.1, { bone: 'kilt', pos: [0.42 * s, 1.62, 0.9], rot: [0.08, 0, 0.05 * s], bottom: [1.15, 1], color: V.iron });
    F.box(0.82, 0.1, 0.14, { bone: 'kilt', pos: [0.42 * s, 1.1, 0.95], color: V.rust, trim: true });
    F.box(0.74, 1.0, 0.1, { bone: 'hips', pos: [1.12 * s, 1.68, 0.22], rot: [0, 1.25 * s, 0], bottom: [1.15, 1], color: V.ironLt });
  }
  F.box(1.4, 1.0, 0.1, { bone: 'hips', pos: [0, 1.66, -0.86], bottom: [1.15, 1], color: V.iron });

  // ---------------- torso: broad V — barrel chest over a narrower gut, hunched trapezius
  F.sphere(1.0, { bone: 'spine', pos: [0, 2.95, 0.1], seg: [9, 6], scale: [1.08, 0.86, 0.82], color: V.skinDk });
  F.sphere(1.3, { bone: 'spine', pos: [0, 3.95, -0.05], rot: [0.12, 0, 0], seg: [9, 7], scale: [1.34, 0.82, 0.84], color: V.skin });
  F.sphere(0.95, { bone: 'spine', pos: [0, 4.5, -0.42], seg: [8, 5], scale: [1.45, 0.58, 1.0], color: V.skin });
  for (const s of [1, -1]) F.sphere(0.62, { bone: 'spine', pos: [0.54 * s, 4.12, 0.7], rot: [0.25, 0, 0], seg: [7, 5], scale: [1.15, 0.72, 0.55], color: V.skinLt });
  // teal war-paint: three claw stripes raked across the left pec
  for (let i = 0; i < 3; i++) F.box(0.12, 0.82, 0.06, { bone: 'spine', pos: [0.28 + i * 0.25, 4.02 - i * 0.04, 1.03 - i * 0.03], rot: [-0.45, 0.2, 0.35], color: V.teal, emis: 0.45 });
  // war harness: bandolier from the left shoulder to the right hip, skull medallion (T)
  strap([1.2, 4.72, 0.62], [0.05, 3.82, 1.13], 0.3, 0.1, { bone: 'spine', color: V.leather });
  strap([0.05, 3.82, 1.13], [-1.0, 2.82, 0.92], 0.3, 0.1, { bone: 'spine', color: V.leather });
  F.sphere(0.24, { bone: 'spine', pos: [0.02, 3.82, 1.18], seg: [6, 4], scale: [1, 1, 0.6], color: V.ironLt, trim: true });
  // spiked iron collar around the neck
  F.torus(0.66, 0.15, { bone: 'spine', pos: [0, 4.78, 0.3], rot: [PI / 2 - 0.3, 0, 0], radial: 8, color: V.iron });
  for (const s of [1, -1]) F.spike([0.55 * s, 4.95, 0.1], [0.5 * s, 1, -0.3], 0.1, 0.42, { bone: 'spine', color: V.bone });

  // ---------------- skull pauldrons: layered rounded iron domes, a giant skull, bone spikes
  for (const s of [1, -1]) {
    const b = s > 0 ? 'pauldL' : 'pauldR';
    const P = F.sub([1.92 * s, 4.6, 0], [0, 0, -0.42 * s], b);
    P.sphere(0.95, { seg: [9, 5], thetaLength: 1.75, scale: [1.05, 0.8, 1.12], color: V.ironLt });
    P.torus(0.95, 0.1, { pos: [0, -0.13, 0], rot: [PI / 2, 0, 0], scale: [1.03, 1.1, 1], radial: 10, color: V.rust, trim: true });
    const Q = F.sub([2.3 * s, 4.12, 0], [0, 0, -0.85 * s], b);
    Q.sphere(0.86, { seg: [9, 4], thetaLength: 1.35, scale: [0.95, 0.62, 1.05], color: V.iron });
    skull(F, [2.02 * s, 5.0, 0.72], 0.46, { bone: b });
    for (const dz of [-0.62, -0.18, 0.26]) F.spike([1.86 * s, 5.28 - abs(dz + 0.18) * 0.3, dz], [0.5 * s, 1, dz * 0.45], 0.15, 0.95 - abs(dz + 0.18) * 0.45, { bone: b, color: V.bone });
  }

  // ---------------- head: big orc head raised out of the collar, face tilted to the camera
  F.sphere(0.6, { bone: 'head', pos: [0, 5.08, 0.8], seg: [8, 6], scale: [1.05, 0.92, 1.08], color: V.skin });
  F.box(1.08, 0.24, 0.36, { bone: 'head', pos: [0, 5.13, 1.36], rot: [-0.35, 0, 0], taper: [0.9, 0.8], color: V.skinDk });
  F.box(0.24, 0.3, 0.24, { bone: 'head', pos: [0, 4.92, 1.47], rot: [-0.2, 0, 0], taper: [0.7, 0.8], color: V.skinDk });
  for (const s of [1, -1]) {
    F.oct(0.13, { bone: 'head', pos: [0.26 * s, 4.99, 1.45], rot: [-0.3, 0, 0.35 * s], scale: [1.5, 0.8, 0.9], color: V.teal, emis: 3 });
    F.spike([0.56 * s, 5.05, 0.75], [s, 0.35, -0.45], 0.11, 0.55, { bone: 'head', color: V.skin });
  }
  // horned helm: iron skull-cap, rust band (T), crest, great bull horns curving forward
  F.sphere(0.66, { bone: 'head', pos: [0, 5.12, 0.74], seg: [8, 3], thetaLength: 1.12, scale: [1.02, 0.9, 1.08], color: V.iron });
  F.cyl(0.6, 0.62, 0.14, { bone: 'head', pos: [0, 5.4, 0.74], radial: 8, scale: [1.02, 1, 1.08], color: V.rust, trim: true });
  F.box(0.16, 0.3, 1.0, { bone: 'head', pos: [0, 5.8, 0.72], color: V.ironLt });
  for (const s of [1, -1]) {
    const h0 = [0.52 * s, 5.46, 0.74], h1 = [1.12 * s, 5.74, 0.64], h2 = [1.44 * s, 6.1, 1.0];
    F.seg(h0, h1, 0.21, 0.16, { bone: 'head', color: V.bone });
    F.seg(h1, h2, 0.16, 0.11, { bone: 'head', color: V.bone });
    F.spike(h2, [0.15 * s, 0.35, 1], 0.11, 0.58, { bone: 'head', color: V.soot });
  }
  F.cone(0.18, 1.3, { bone: 'head', pos: [0, 6.3, 0.5], rot: [-0.45, 0, 0], color: V.teal, emis: 1, eliteOnly: true });
  // jaw + tusks (T)
  F.box(1.0, 0.4, 0.8, { bone: 'jaw', pos: [0, 4.64, 1.14], rot: [-0.15, 0, 0], taper: [1.05, 1.1], color: V.skin });
  for (const s of [1, -1]) F.spike([0.33 * s, 4.8, 1.48], [0.22 * s, 1, 0.3], 0.14, 0.62, { bone: 'jaw', color: V.bone, trim: true });

  // ---------------- arms: huge biceps, spiked iron bracers, big fists
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    F.cap([1.78 * s, 4.32, 0], [1.95 * s, 3.05, 0.1], 0.54, { bone: 'arm' + L, color: V.skin });
    F.cap([1.95 * s, 3.12, 0.1], [2.0 * s, 2.08, 0.2], 0.5, { bone: 'fore' + L, color: V.skin });
    F.seg([1.98 * s, 2.18, 0.18], [1.97 * s, 2.86, 0.14], 0.58, 0.6, { bone: 'fore' + L, radial: 8, color: V.iron });
    F.spike([2.52 * s, 2.55, 0.16], [s, 0.25, 0], 0.1, 0.42, { bone: 'fore' + L, color: V.bone });
    F.spike([1.98 * s, 2.55, -0.38], [0.3 * s, 0.25, -1], 0.1, 0.36, { bone: 'fore' + L, color: V.bone });
    F.sphere(0.46, { bone: 'fore' + L, pos: [2.0 * s, 1.84, 0.2], seg: [7, 5], scale: [1.05, 0.95, 1.12], color: V.skinDk });
  }

  // ---------------- greataxe: authored vertical in the right fist, main blade pointing out (-X)
  const A = new Frame(pb, [-2.0, 1.85, 0.2], [0, 0, 0], 'axe');
  A.seg([0, -0.8, 0], [0, 2.95, 0], 0.13, 0.11, { color: V.wood });
  for (const y of [-0.35, 0.5, 1.4]) A.cyl(0.16, 0.16, 0.14, { pos: [0, y, 0], radial: 7, color: V.ironLt });
  A.spike([0, -0.78, 0], [0, -1, 0], 0.14, 0.4, { color: V.iron });
  A.box(0.36, 0.95, 0.36, { pos: [0, 2.3, 0], taper: [0.85, 0.85], color: V.iron });
  A.spike([0, 2.76, 0], [0, 1, 0], 0.13, 0.62, { color: V.iron });
  const blade = [[-0.15, 0.5], [-0.42, 0.62], ...arc(0.25, 0, 1.45, PI - 0.9, PI + 0.9, 8), [-0.42, -0.62], [-0.15, -0.5]];
  A.extrude(blade, 0.13, { pos: [0, 2.3, 0], color: V.iron });
  const edge = [...arc(0.25, 0, 1.52, PI - 0.88, PI + 0.88, 8), ...arc(0.25, 0, 1.26, PI + 0.84, PI - 0.84, 8)];
  A.extrude(edge, 0.18, { pos: [0, 2.3, 0], color: V.ember, emis: 2.4 });
  const back = [[0.14, 0.32], ...arc(-0.1, 0, 0.78, 0.82, -0.82, 4), [0.14, -0.32]];
  A.extrude(back, 0.12, { pos: [0, 2.3, 0], color: V.iron });
  const edgeB = [...arc(-0.1, 0, 0.82, 0.84, -0.84, 4), ...arc(-0.1, 0, 0.66, -0.78, 0.78, 4)];
  A.extrude(edgeB, 0.16, { pos: [0, 2.3, 0], color: V.ember, emis: 2.0 });
  for (const [x, y, r, l] of [[-0.7, 0.42, 0.55, 0.42], [-0.82, -0.1, -0.3, 0.36], [-0.62, -0.5, -0.7, 0.3]]) {
    A.box(l, 0.07, 0.17, { pos: [x, 2.3 + y, 0], rot: [0, 0, r], color: V.emberHot, emis: 1.8 });
  }

  // Axe Heat flames: tongues licking off the blade's outer edge (scaled to nothing until h.heat > 0)
  const AF = new Frame(pb, [-2.0, 1.85, 0.2], [0, 0, 0], 'axeFire');
  for (const [a, h, c] of [[PI - 0.85, 0.7, V.flame], [PI - 0.45, 1.0, V.emberHot], [PI, 1.3, V.flame], [PI + 0.45, 1.0, V.emberHot], [PI + 0.85, 0.7, V.flame]]) {
    AF.spike([0.25 + 1.4 * cos(a), 2.3 + 1.4 * sin(a), 0], [cos(a), sin(a) + 0.35, 0], 0.17, h, { color: c, emis: 2.6 });
  }
  for (const [x, y, h] of [[-0.55, 0.45, 0.8], [-0.55, -0.45, 0.8], [-0.2, 0.85, 0.6]]) AF.spike([x, 2.3 + y, 0], [-0.2, 1, 0], 0.13, h, { color: V.emberHot, emis: 2.4 });

  // ---------------- twin back banners: pole, crossbar, skull finial (T), cloth with the teal sigil, ragged soot hem
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const px = 0.75 * s;
    F.seg([px, 3.6, -1.1], [px, 7.45, -1.1], 0.1, 0.08, { bone: 'banner' + L, color: V.wood });
    F.box(1.45, 0.12, 0.12, { bone: 'banner' + L, pos: [px + 0.5 * s, 7.06, -1.1], color: V.wood });
    F.sphere(0.26, { bone: 'banner' + L, pos: [px, 7.64, -1.1], seg: [7, 5], scale: [0.95, 1.0, 1.1], color: V.bone, trim: true });
    for (const e of [1, -1]) F.spike([px + 0.16 * e, 7.74, -1.1], [e, 0.9, 0], 0.07, 0.36, { bone: 'banner' + L, color: V.bone });
    const fx = 1.25 * s;
    F.extrude([[-0.62, 0.0], [0.62, 0.0], [0.6, -0.9], [-0.6, -0.9]], 0.07, { bone: 'flag' + L, pos: [fx, 7.0, -1.1], color: V.cloth });
    F.oct(0.3, { bone: 'flag' + L, pos: [fx, 6.52, -1.1], scale: [1, 1.35, 0.3], color: V.teal, emis: 1.0 });
    F.extrude([[-0.6, 0.0], [0.6, 0.0], [0.56, -0.62], [0.3, -0.48], [0.12, -0.9], [-0.08, -0.5], [-0.32, -0.8], [-0.58, -0.42]], 0.07, { bone: 'hem' + L, pos: [fx, 6.12, -1.1], color: V.cloth });
    F.box(0.14, 0.62, 0.09, { bone: 'hem' + L, pos: [fx, 5.85, -1.1], color: V.teal, emis: 0.8 });
    F.extrude([[0.56, -0.62], [0.3, -0.48], [0.12, -0.9], [-0.08, -0.5], [-0.32, -0.8], [-0.58, -0.42], [-0.59, -0.3], [-0.32, -0.62], [-0.08, -0.36], [0.12, -0.72], [0.3, -0.34], [0.57, -0.48]], 0.09, { bone: 'hem' + L, pos: [fx, 6.12, -1.1], color: V.soot });
    // phase-2 flames (scaled to nothing until enraged)
    for (const [dx, h] of [[-0.35, 0.7], [0.05, 0.95], [0.4, 0.6]]) F.spike([fx + dx, 7.02, -1.1], [dx * 0.3, 1, 0], 0.13, h, { bone: 'fire' + L, color: V.flame, emis: 2.4 });
    for (const [dx, h] of [[-0.3, 0.5], [0.25, 0.45]]) F.spike([fx + dx, 5.45, -1.06], [0, 1, 0.3], 0.1, h, { bone: 'fire' + L, color: V.emberHot, emis: 2.2 });
  }
}

// Carry: the greataxe rests on the right shoulder.
const V_REST = {
  'spine.rx': 0.06, 'head.rx': -0.05,
  'armR.rx': -0.35, 'armR.rz': 0.28, 'foreR.rx': -1.5, 'axe.rx': 1.15, 'axe.rz': -0.15,
  'armL.rx': -0.05, 'armL.rz': 0.1, 'foreL.rx': -0.3,
};
const V_LOW = {
  'hips.my': -0.38, 'spine.rx': 0.45, 'head.rx': 0.38, 'jaw.rx': 0.15,
  'armR.rx': 0.95, 'armR.rz': 0.05, 'foreR.rx': -0.3, 'axe.rx': -3.35, 'axe.rz': 0.1,
  'armL.rx': 0.6, 'armL.rz': 0.25, 'foreL.rx': -0.5,
  'legL.rx': -0.4, 'legR.rx': 0.35, 'kneeL.rx': 0.35, 'kneeR.rx': 0.25,
  'bannerL.rx': 0.18, 'bannerR.rx': 0.18, 'flagL.rx': 0.25, 'flagR.rx': 0.25, 'hemL.rx': 0.2, 'hemR.rx': 0.2,
};
const V_WIND = track(VB, V_REST, [[0, 's', {}], [0.32, 'out', V_LOW], [1, 's', V_LOW]]);
const V_RUSH = track(VB, V_REST, [[0, 's', { ...V_LOW, 'axe.rx': -3.55, 'bannerL.rx': -0.3, 'bannerR.rx': -0.3, 'flagL.rx': -0.45, 'flagR.rx': -0.45, 'hemL.rx': -0.35, 'hemR.rx': -0.35, 'legL.rx': 0, 'legR.rx': 0, 'kneeL.rx': 0.2, 'kneeR.rx': 0.2 }], [1, 's', {}]]);
const V_SKID = track(VB, V_REST, [
  [0, 's', { ...V_LOW, 'spine.rx': -0.1, 'head.rx': 0.1, 'hips.my': -0.45, 'legL.rx': -0.75, 'kneeL.rx': 0.1, 'legR.rx': 0.45, 'kneeR.rx': 0.65, 'bannerL.rx': 0.35, 'bannerR.rx': 0.35, 'flagL.rx': 0.5, 'flagR.rx': 0.5 }],
  [0.45, 's', { ...V_LOW, 'spine.rx': 0.1, 'head.rx': 0.05, 'hips.my': -0.3, 'legL.rx': -0.5, 'kneeL.rx': 0.2, 'legR.rx': 0.3, 'kneeR.rx': 0.4 }],
]);
const V_SKY = { 'hips.my': 0.15, 'spine.rx': -0.25, 'head.rx': -0.45, 'jaw.rx': 0.55, 'armR.rx': -3.0, 'armR.rz': 0.45, 'foreR.rx': -0.2, 'axe.rx': 3.45, 'axe.rz': -0.3, 'armL.rx': -3.0, 'armL.rz': -0.45, 'foreL.rx': -0.2, 'bannerL.rz': 0.06, 'bannerR.rz': -0.06 };
const V_THRUST = { 'hips.my': -0.35, 'spine.rx': 0.5, 'head.rx': -0.2, 'jaw.rx': 0.3, 'armR.rx': -1.2, 'armR.rz': 0.4, 'foreR.rx': -0.2, 'axe.rx': 3.64, 'axe.rz': -0.2, 'armL.rx': -1.25, 'armL.rz': -0.4, 'foreL.rx': -0.25, 'legL.rx': -0.35, 'kneeL.rx': 0.3, 'kneeR.rx': 0.2 };
const V_METEOR = track(VB, V_REST, [
  [0, 's', {}],
  [0.35, 'out', V_SKY],
  [1.05, 's', { ...V_SKY, 'jaw.rx': 0.65, 'head.rx': -0.55, 'hips.my': 0.2 }],
  [1.13, 'in', V_THRUST],
  [1.3, 's', V_THRUST],
]);
const V_IMPACT = { 'hips.my': -0.45, 'spine.rx': 0.6, 'head.rx': -0.3, 'jaw.rx': 0.45, 'armR.rx': -1.1, 'armR.rz': 0.42, 'foreR.rx': -0.2, 'axe.rx': 2.57, 'axe.rz': -0.25, 'armL.rx': -1.15, 'armL.rz': -0.42, 'foreL.rx': -0.25, 'legL.rx': -0.5, 'kneeL.rx': 0.4, 'legR.rx': 0.3, 'kneeR.rx': 0.25 };
const V_SLAM = track(VB, V_REST, [
  [0, 's', {}],
  [0.36, 'out', { 'hips.my': 0.2, 'spine.rx': -0.3, 'head.rx': 0.05, 'jaw.rx': 0.2, 'armR.rx': -2.6, 'armR.rz': 0.45, 'foreR.rx': -0.6, 'axe.rx': 2.14, 'axe.rz': -0.3, 'armL.rx': -2.6, 'armL.rz': -0.45, 'foreL.rx': -0.6, 'kneeL.rx': 0.1, 'kneeR.rx': 0.1 }],
  [0.5, 'in', V_IMPACT],
  [0.8, 's', V_IMPACT],
  [1.0, 's', {}],
]);
const V_DIE = track(VB, V_REST, [
  [0, 's', {}],
  [0.3, 'out', { 'hips.my': -0.6, 'spine.rx': -0.35, 'head.rx': -0.5, 'jaw.rx': 0.6, 'armR.rx': -0.6, 'armR.rz': -0.5, 'foreR.rx': -0.2, 'axe.rx': 0.8, 'armL.rx': -1.4, 'armL.rz': 0.6, 'kneeL.rx': 0.9, 'kneeR.rx': 0.9, 'legL.rx': -0.6, 'legR.rx': -0.6 }],
  [1.0, 's', { 'hips.my': -0.8, 'spine.rx': 0.45, 'head.rx': 0.5, 'jaw.rx': 0.4, 'armR.rx': 0.2, 'armR.rz': -0.6, 'axe.rx': 1.6, 'armL.rx': -0.2, 'armL.rz': 0.7, 'kneeL.rx': 1.2, 'kneeR.rx': 1.2, 'legL.rx': -0.9, 'legR.rx': -0.9 }],
]);
const V_REST_TRACK = track(VB, V_REST, [[0, 's', {}], [1, 's', {}]]);

// ---------------------------------------------------------------- v5 raid poses
// Poses below are authored on a normalised 0..1 track (see pk): the boss script sets the action length per
// use (teaching lead x1.4, 5 s wind-ups, any Downed length) and the pose stretches with it.
const pk = (tr, k) => play(tr, k * tr.t[tr.t.length - 1]);
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const FLAGS_BACK = { 'bannerL.rx': -0.3, 'bannerR.rx': -0.3, 'flagL.rx': -0.45, 'flagR.rx': -0.45, 'hemL.rx': -0.35, 'hemR.rx': -0.35 };

// Axe Combo "in": coil low, then an overhead whirl, haft flat over the head (the axe sweeps r 4.5 around him).
const V_COIL = { 'hips.my': -0.4, 'spine.rx': 0.3, 'head.rx': 0.15, 'jaw.rx': 0.2, 'armR.rx': -1.3, 'armR.rz': -0.55, 'foreR.rx': -0.5, 'axe.rx': 3.1, 'armL.rx': -1.0, 'armL.rz': 0.25, 'foreL.rx': -0.6, 'legL.rx': -0.55, 'legR.rx': 0.45, 'kneeL.rx': 0.55, 'kneeR.rx': 0.5, 'bannerL.rx': 0.2, 'bannerR.rx': 0.2 };
const V_WHIRL = { 'hips.my': -0.2, 'spine.rx': 0.26, 'head.rx': 0.1, 'jaw.rx': 0.5, 'armR.rx': -2.25, 'armR.rz': -0.12, 'foreR.rx': -0.35, 'axe.rx': 4.15, 'armL.rx': -2.25, 'armL.rz': 0.12, 'foreL.rx': -0.35, 'legL.rx': -0.4, 'legR.rx': 0.35, 'kneeL.rx': 0.45, 'kneeR.rx': 0.4, ...FLAGS_BACK };
const V_SPIN = track(VB, V_REST, [[0, 's', {}], [0.3, 'out', V_COIL], [0.4, 's', V_COIL], [0.52, 'in', V_WHIRL], [0.9, 's', V_WHIRL], [1, 's', {}]]);
// spin angle of the hips (rad): wind back, whirl twice (ends a full turn multiple so the fade-out never unwinds)
const spinPsi = (k) => (k < 0.3 ? -0.8 * smooth(k / 0.3) : k < 0.4 ? -0.8 : k < 0.9 ? -0.8 + (4 * PI + 0.8) * Math.pow(smooth((k - 0.4) / 0.5), 1.35) : 4 * PI);
export const vashkarSpinAngle = (k) => spinPsi(k);

// Axe Combo "out": low wide sweep, the axe dragged along the ground in a huge arc.
const V_SW_A = { 'hips.my': -0.62, 'spine.rx': 0.55, 'head.rx': 0.3, 'jaw.rx': 0.35, 'armR.rx': -0.55, 'armR.rz': -0.55, 'foreR.rx': -0.35, 'axe.rx': 2.55, 'armL.rx': -0.85, 'armL.rz': 0.3, 'foreL.rx': -0.5, 'legL.rx': -0.85, 'legR.rx': 0.5, 'kneeL.rx': 0.65, 'kneeR.rx': 0.55, 'bannerL.rx': 0.3, 'bannerR.rx': 0.3 };
const V_SW_B = { ...V_SW_A, 'spine.rx': 0.7, 'head.rx': 0.4, 'armR.rx': -0.8, 'armR.rz': 0.1, 'foreR.rx': -0.25, 'axe.rx': 2.85, 'armL.rx': -1.0, 'armL.rz': 0.1, 'bannerL.rx': -0.35, 'bannerR.rx': -0.35 };
const V_SWEEP = track(VB, V_REST, [[0, 's', {}], [0.3, 'out', V_SW_A], [0.42, 's', V_SW_A], [0.56, 'in', V_SW_B], [0.8, 's', V_SW_B], [1, 's', {}]]);
const sweepPsi = (k) => (k < 0.3 ? 1.1 * smooth(k / 0.3) : k < 0.42 ? 1.1 : k < 0.56 ? 1.1 - 2.7 * Math.pow(smooth((k - 0.42) / 0.14), 0.8) : -1.6 + 0.6 * smooth((k - 0.56) / 0.44));

// Molten Overswing: 5 s of winding up (axe hauled back and up, shaking, glowing), then the huge swing at the end.
const V_RAISE = { 'hips.my': 0.05, 'spine.rx': -0.22, 'head.rx': -0.3, 'jaw.rx': 0.35, 'armR.rx': -2.9, 'armR.rz': 0.28, 'foreR.rx': -0.3, 'axe.rx': 3.6, 'armL.rx': -2.9, 'armL.rz': -0.28, 'foreL.rx': -0.3, 'legL.rx': -0.2, 'legR.rx': 0.2, 'kneeL.rx': 0.25, 'kneeR.rx': 0.25, ...FLAGS_BACK };
const V_HAUL = { ...V_RAISE, 'hips.my': -0.1, 'spine.rx': -0.55, 'head.rx': -0.6, 'jaw.rx': 0.65, 'armR.rx': -3.35, 'armL.rx': -3.3, 'foreR.rx': -0.1, 'foreL.rx': -0.1, 'axe.rx': 4.15, 'kneeL.rx': 0.4, 'kneeR.rx': 0.4, 'legL.rx': -0.3, 'legR.rx': 0.3 };
const V_OVER_SW = { 'hips.my': -0.45, 'spine.rx': 0.55, 'head.rx': 0.15, 'jaw.rx': 0.5, 'armR.rx': -1.35, 'armR.rz': -0.2, 'foreR.rx': -0.2, 'axe.rx': 3.2, 'armL.rx': -1.4, 'armL.rz': 0.1, 'foreL.rx': -0.3, 'legL.rx': -0.7, 'legR.rx': 0.45, 'kneeL.rx': 0.6, 'kneeR.rx': 0.45, 'bannerL.rx': -0.3, 'bannerR.rx': -0.3, 'flagL.rx': -0.5, 'flagR.rx': -0.5 };
const V_OVER = track(VB, V_REST, [[0, 's', {}], [0.1, 'out', V_RAISE], [0.86, 's', V_HAUL], [0.9, 's', V_HAUL], [0.97, 'in', V_OVER_SW], [1, 's', V_OVER_SW]]);
const overPsi = (k) => (k < 0.9 ? 0.5 * smooth((k - 0.1) / 0.8) : 0.5 + (-2.0 - 0.5) * smooth((k - 0.9) / 0.1));

// Downed: on one knee, head hung, leaning on the planted axe (it holds for any length; breathing is additive).
const V_KNEEL = { 'hips.my': -1.3, 'hips.ry': 0.35, 'spine.rx': 1.12, 'spine.ry': 0.55, 'spine.rz': -0.18, 'head.rx': 1.0, 'head.ry': -0.4, 'jaw.rx': 0.45,
  'armR.rx': 0.25, 'armR.rz': -0.55, 'foreR.rx': -0.1, 'axe.rx': 1.55, 'axe.rz': 0.25,           // axe dropped flat on the ground beside him
  'armL.rx': -0.55, 'armL.rz': 0.3, 'foreL.rx': -0.35,                                       // off-hand bracing on the ground
  'legL.rx': -1.45, 'kneeL.rx': 1.5, 'legR.rx': 0.1, 'kneeR.rx': 1.95,                         // one knee down
  'pauldL.rz': 0.1, 'pauldR.rz': -0.1, 'bannerL.rx': 0.45, 'bannerR.rx': 0.45, 'flagL.rx': 0.55, 'flagR.rx': 0.55, 'hemL.rx': 0.3, 'hemR.rx': 0.3 };
const V_DOWNED = track(VB, V_REST, [[0, 's', {}], [0.4, 'in', { ...V_KNEEL, 'hips.my': -0.8, 'spine.rx': 0.5, 'spine.ry': 0.2 }], [1, 'out', V_KNEEL]]);
// Recover: shake it off, shoulders up, a short snort.
const V_RECOVER = track(VB, V_REST, [[0, 's', { 'hips.my': -0.5, 'spine.rx': 0.5, 'head.rx': 0.45, 'legL.rx': -0.8, 'kneeL.rx': 0.8, 'kneeR.rx': 1.0 }], [0.5, 'out', { 'spine.rx': -0.2, 'head.rx': -0.5, 'jaw.rx': 0.5, 'armL.rx': -0.8, 'armL.rz': 0.5, 'foreL.rx': -0.5 }], [1, 's', {}]]);

// Plant (Ashfall): axe hauled up, driven point-first into the ground, both fists on the haft, head bowed.
const V_PL_UP = { 'hips.my': 0.15, 'spine.rx': -0.3, 'head.rx': -0.5, 'jaw.rx': 0.55, 'armR.rx': -3.0, 'armR.rz': 0.3, 'foreR.rx': -0.2, 'axe.rx': 3.5, 'armL.rx': -3.0, 'armL.rz': -0.3, 'foreL.rx': -0.2, ...FLAGS_BACK };
const V_PL_IN = { 'hips.my': -0.5, 'spine.rx': 0.55, 'head.rx': 0.3, 'jaw.rx': 0.2, 'armR.rx': -1.15, 'armR.rz': 0.35, 'foreR.rx': -0.35, 'axe.rx': 4.65, 'armL.rx': -1.2, 'armL.rz': -0.35, 'foreL.rx': -0.5, 'legL.rx': -0.55, 'legR.rx': 0.3, 'kneeL.rx': 0.5, 'kneeR.rx': 0.35 };
const V_PLANT = track(VB, V_REST, [[0, 's', {}], [0.3, 'out', V_PL_UP], [0.42, 's', V_PL_UP], [0.5, 'in', V_PL_IN], [0.58, 's', V_PL_IN], [1, 's', { ...V_PL_IN, 'spine.rx': 0.62, 'head.rx': 0.42 }]]);

// Warcry: chest out, arms wide, head back, banners snapping.
const V_ROAR = { 'hips.my': 0.05, 'spine.rx': -0.35, 'head.rx': -0.7, 'jaw.rx': 0.85, 'armR.rx': -0.2, 'armR.rz': -1.0, 'foreR.rx': -0.35, 'axe.rx': 1.3, 'armL.rx': -0.3, 'armL.rz': 1.0, 'foreL.rx': -0.35, 'legL.rx': -0.2, 'legR.rx': 0.2, 'kneeL.rx': 0.2, 'kneeR.rx': 0.2, 'bannerL.rz': 0.1, 'bannerR.rz': -0.1 };
const V_WARCRY = track(VB, V_REST, [[0, 's', {}], [0.3, 'out', { 'spine.rx': 0.3, 'head.rx': 0.1, 'jaw.rx': 0.1, 'armR.rz': -0.4, 'armL.rz': 0.4, 'hips.my': -0.2 }], [0.5, 'in', V_ROAR], [0.85, 's', V_ROAR], [1, 's', {}]]);

// Stomp (Cinder Memory beat): axe lifted a hand's breadth, then the butt thumped into the ground.
const V_STOMP = track(VB, V_REST, [[0, 's', {}], [0.4, 'out', { 'armR.rx': -1.1, 'foreR.rx': -1.2, 'axe.rx': 1.9, 'spine.rx': -0.1, 'hips.my': 0.08, 'head.rx': -0.2 }], [0.62, 'in', { 'armR.rx': -0.3, 'foreR.rx': -0.8, 'axe.rx': 1.25, 'spine.rx': 0.28, 'hips.my': -0.28, 'head.rx': 0.2, 'kneeL.rx': 0.3, 'kneeR.rx': 0.3 }], [1, 's', {}]]);

export const VASHKAR_ACT = {
  rushWind: {
    dur: 0.9, fi: 0.12, fo: 0, fn: (s, B, T, k) => {
      play(V_WIND, k);
      // scrape the right foot twice
      if (k > 0.3) { const u = (k - 0.3) / 0.7; W.rot(B.legR, -0.45 * sin(u * TAU * 2)).rot(B.kneeR, 0.25 * max(0, sin(u * TAU * 2))); }
    },
  },
  rush: {
    dur: 1.2, fi: 0, fo: 0, fn: (s, B) => {
      hold(V_RUSH);
      const g = s.walk * 0.5, sg = sin(g), cg = cos(g);
      W.rot(B.legL, sg * 0.85).rot(B.legR, -sg * 0.85);
      W.rot(B.kneeL, max(0, -cg) * 0.9).rot(B.kneeR, max(0, cg) * 0.9);
      W.rot(B.armL, -sg * 0.7).rot(B.foreL, -0.6 - 0.3 * max(0, sg));
      W.move(B.hips, 0, -0.18 * abs(sg), 0).rot(B.spine, 0.06 * abs(cg), sg * 0.12, 0);
      W.rot(B.axe, 0.08 * sin(g * 2));
    },
  },
  skid: { dur: 0.45, fi: 0, fo: 0.3, fn: (s, B, T) => play(V_SKID, T) },
  meteor: {
    dur: 1.3, fi: 0.1, fo: 0.18, fn: (s, B, T) => {
      play(V_METEOR, T);
      if (T > 0.4 && T < 1.05) { const sh = sin(s.t * 45) * 0.03; W.rot(B.head, sh, sh * 0.5).rot(B.spine, 0, sh * 0.3); }
    },
  },
  slam: { dur: 1.0, fi: 0.08, fo: 0.2, fn: (s, B, T) => play(V_SLAM, T) },
  // ---- v5 raid moves (normalised tracks: any dur works; the script picks it so the tell lands on the telegraph)
  axeSpin: {
    dur: 1.3, fi: 0.15, fo: 0.1, fn: (s, B, T, k) => {
      pk(V_SPIN, k);
      W.rot(B.hips, 0, wrapPi(spinPsi(k)), 0);
    },
  },
  axeSweep: {
    dur: 1.0, fi: 0.1, fo: 0.25, fn: (s, B, T, k) => {
      pk(V_SWEEP, k);
      W.rot(B.hips, 0, sweepPsi(k), 0);
    },
  },
  overswing: {
    dur: 5.0, fi: 0.4, fo: 0.15, fn: (s, B, T, k) => {
      pk(V_OVER, k);
      W.rot(B.hips, 0, overPsi(k), 0);
      // the wind-up trembles harder the closer it gets
      if (k < 0.9) { const sh = sin(s.t * 38) * 0.035 * smooth(k / 0.9); W.rot(B.spine, sh, sh * 0.6, sh * 0.3).rot(B.head, sh * 0.8, 0, 0).rot(B.armR, 0, 0, sh).rot(B.armL, 0, 0, -sh); }
    },
  },
  downed: {
    dur: 4.0, fi: 0.2, fo: 0.45, fn: (s, B, T, k) => {
      // enters over 0.45 s whatever the length, then holds: T is absolute seconds, so clamp it
      play(V_DOWNED, Math.min(T, 0.45) / 0.45);
      // heaving breaths (a ~1.3 s loop): shoulders and back rise, head nods, braced arm shudders, the jaw gapes
      const hv = Math.max(0, sin(s.t * 4.8)), hv2 = hv * hv, br = sin(s.t * 2.4);
      W.rot(B.spine, 0.1 * hv2 - 0.02 * br, 0.03 * br).rot(B.head, -0.09 * hv2).rot(B.jaw, 0.12 * hv2);
      W.rot(B.pauldL, 0, 0, 0.1 * hv2).rot(B.pauldR, 0, 0, -0.1 * hv2).rot(B.armL, 0.05 * hv2);
      W.move(B.hips, 0, 0.04 * hv2, 0);
    },
  },
  recover: {
    dur: 0.6, fi: 0.05, fo: 0.15, fn: (s, B, T, k) => pk(V_RECOVER, k),
  },
  plant: {
    dur: 8.0, fi: 0.15, fo: 0.3, fn: (s, B, T) => {
      play(V_PLANT, Math.min(T / 1.3, 1));   // raise 0.4 s, hang, drive the axe in at 0.65 s, then hold for the intermission
      const br = sin(s.t * 3.0);
      if (T > 0.8) W.rot(B.spine, 0.025 * br).rot(B.head, 0.03 * br);
    },
  },
  warcry: {
    dur: 1.6, fi: 0.12, fo: 0.25, fn: (s, B, T, k) => {
      pk(V_WARCRY, k);
      if (k > 0.3 && k < 0.9) { const sh = sin(s.t * 45) * 0.02; W.rot(B.head, sh, sh * 0.5).rot(B.spine, 0, sh * 0.3); }
    },
  },
  stomp: { dur: 0.5, fi: 0.05, fo: 0.12, fn: (s, B, T, k) => pk(V_STOMP, k) },
  die: { dur: 1.6, fi: 0.08, fo: 0, fn: (s, B, T, k) => play(V_DIE, k) },
};

function vashkarBase(s, B) {
  const m = s.move, w = s.walk, rage = s.h.rage ? 1 : 0;
  const tb = s.t * (1 + 0.5 * rage) + s.seed * TAU;
  const br = sin(tb * 1.5);
  hold(V_REST_TRACK);
  const sw = sin(w), cw = cos(w);
  W.rot(B.legL, sw * 0.38 * m).rot(B.legR, -sw * 0.38 * m);
  W.rot(B.kneeL, max(0, -cw) * 0.65 * m + 0.05).rot(B.kneeR, max(0, cw) * 0.65 * m + 0.05);
  W.move(B.hips, 0, -0.14 * abs(sw) * m + 0.03 * br * (1 - m) - 0.05 * rage, 0);
  W.rot(B.hips, 0, sw * 0.06 * m, sw * 0.06 * m);
  W.rot(B.spine, 0.1 * m + 0.1 * rage + 0.02 * br, -sw * 0.08 * m, -sw * 0.04 * m);
  W.rot(B.head, -0.06 * m + 0.03 * sin(tb * 0.6), 0.16 * sin(tb * 0.31), 0);
  W.rot(B.jaw, 0.04 + 0.03 * br + 0.2 * rage * max(0, sin(tb * 1.7)));
  W.rot(B.armL, -sw * 0.32 * m + 0.03 * br, 0, 0.03 * br + 0.08 * rage);
  W.rot(B.foreL, -0.12 * m - 0.25 * rage);
  W.rot(B.armR, 0.04 * sw * m);
  // armour clank and banners trailing while walking
  W.rot(B.pauldL, 0, 0, 0.05 * sw * m).rot(B.pauldR, 0, 0, 0.05 * sw * m);
  W.rot(B.bannerL, -0.1 * m).rot(B.bannerR, -0.1 * m);
  W.rot(B.flagL, -0.18 * m).rot(B.flagR, -0.18 * m);
}

export const vashkar = defineCreature({
  id: 'vashkar',
  stride: 3.2,
  blob: 2.6,
  deathTime: 1.6,
  bones: vashkarBones,
  build(pb) { buildVashkar(pb); },
  animate(P, s, B) {
    W.P = P; W.mask = null;
    const rage = s.h.rage ? 1 : 0;
    if (s.dying > 0) { W.w = 1; play(V_DIE, s.dying); }
    else {
      const wt = weights(s, VASHKAR_ACT);
      W.w = wt.base; vashkarBase(s, B);
      runActions(s, B, VASHKAR_ACT, wt);
      W.w = 1;
    }
    // additive: breathing, cloth wave (2-segment lag), hit recoil, phase-2 banner fire
    const tb = s.t * (1 + 0.5 * rage) + s.seed * TAU;
    const br = sin(tb * 1.5);
    P.scale(B.spine, 1 + 0.01 * br, 1 + 0.02 * br, 1 + 0.015 * br);
    const wv = tb * (2.0 + s.move * 1.5);
    for (let i = 0; i < 2; i++) {
      const ba = i ? B.bannerR : B.bannerL, fl = i ? B.flagR : B.flagL, he = i ? B.hemR : B.hemL, ph = i * 1.3;
      P.rot(ba, 0.03 * sin(tb * 1.2 + ph), 0, 0.03 * sin(tb * 0.9 + ph));
      P.rot(fl, 0.1 * sin(wv + ph), 0.12 * sin(wv * 0.7 + ph), 0);
      P.rot(he, 0.16 * sin(wv - 0.9 + ph), 0.14 * sin(wv * 0.7 - 0.8 + ph), 0);
    }
    if (s.hit > 0) P.rot(B.spine, -0.1 * s.hit).rot(B.head, -0.18 * s.hit);
    // Axe Heat flames along the blade (h.heat 0..1) and the back banners (h.banner = [L, R] visible fraction;
    // the boss script hides each one once it has planted that banner in the ground)
    const hk = s.dying > 0 ? 0 : (s.h.heat ?? 0);
    P.scale(B.axeFire, max(0.001, hk * (1 + 0.14 * sin(s.t * 21) + 0.08 * sin(s.t * 33))));
    const bn = s.h.banner;
    if (bn && s.dying <= 0) { P.scale(B.bannerL, max(0.001, bn[0])); P.scale(B.bannerR, max(0.001, bn[1])); }
    if (rage && s.dying <= 0) {
      const f = 1 + 0.18 * sin(s.t * 17) + 0.1 * sin(s.t * 29);
      P.scale(B.fireL, 1, f, 1).scale(B.fireR, 1, 2 - f, 1);
    } else { P.scale(B.fireL, 0.001).scale(B.fireR, 0.001); }
  },
});
