// Boss 3 of 3: Aurelith, the Prism Dragon (riftHeart). Split out of bossModels.js; no behaviour change.
import { defineCreature, TAU, smooth } from '../rig.js';
import { PI, sin, cos, abs, max, add, norm, Frame, boneMap, W, track, play, hold, weights, runActions } from './common.js';

// =====================================================================================
//  AURELITH, THE PRISM DRAGON  (riftHeart, r 2.4) — §6.7
// =====================================================================================

const D = {
  wine: 0x8a2234, wineDk: 0x6a1a28, ox: 0x4e1520, cream: 0xecd3a0, ivory: 0xf2e6c8,
  saffron: 0xe08a3a, saffronDk: 0xb8622a, prism: 0xe6f4ff,
};

// Model-space mouth (breath / fan origin) and tail club (rear beam origin) for bosses.js fx.
export const AURELITH_MOUTH = [0, 3.7, 4.35];
export const AURELITH_TAIL = [0, 0.6, -5.6];

const aurelithBones = [
  { name: 'root' },
  { name: 'body', pivot: [0, 2.1, -0.2] },
  { name: 'chest', parent: 'body', pivot: [0, 2.25, 1.0] },
  { name: 'neck1', parent: 'chest', pivot: [0, 2.75, 1.75] },
  { name: 'neck2', parent: 'neck1', pivot: [0, 3.3, 2.45] },
  { name: 'head', parent: 'neck2', pivot: [0, 3.78, 2.95] },
  { name: 'jaw', parent: 'head', pivot: [0, 3.66, 3.2] },
  { name: 'heart', parent: 'chest', pivot: [0, 2.25, 2.15] },
  { name: 'legFL', parent: 'chest', pivot: [0.85, 2.15, 1.35] },
  { name: 'footFL', parent: 'legFL', pivot: [0.95, 1.15, 1.5] },
  { name: 'legFR', parent: 'chest', pivot: [-0.85, 2.15, 1.35] },
  { name: 'footFR', parent: 'legFR', pivot: [-0.95, 1.15, 1.5] },
  { name: 'legBL', parent: 'body', pivot: [0.9, 2.1, -1.35] },
  { name: 'footBL', parent: 'legBL', pivot: [0.95, 1.05, -1.15] },
  { name: 'legBR', parent: 'body', pivot: [-0.9, 2.1, -1.35] },
  { name: 'footBR', parent: 'legBR', pivot: [-0.95, 1.05, -1.15] },
  { name: 'wingL1', parent: 'body', pivot: [0.55, 3.0, 0.75] },
  { name: 'wingL2', parent: 'wingL1', pivot: [2.75, 3.2, 0.45] },
  { name: 'wingR1', parent: 'body', pivot: [-0.55, 3.0, 0.75] },
  { name: 'wingR2', parent: 'wingR1', pivot: [-2.75, 3.2, 0.45] },
  { name: 'tail1', parent: 'body', pivot: [0, 2.2, -1.95] },
  { name: 'tail2', parent: 'tail1', pivot: [0, 1.85, -2.95] },
  { name: 'tail3', parent: 'tail2', pivot: [0, 1.4, -3.85] },
  { name: 'tail4', parent: 'tail3', pivot: [0, 0.95, -4.7] },
];
const DB = boneMap(aurelithBones);

function buildAurelith(pb) {
  const F = new Frame(pb);
  // body / chest / belly
  F.sphere(1.0, { bone: 'body', pos: [0, 2.2, -0.35], seg: [9, 7], scale: [1.05, 0.92, 1.85], color: D.wine });
  F.sphere(0.85, { bone: 'body', pos: [0, 1.82, -0.25], seg: [8, 5], scale: [0.95, 0.62, 1.6], color: D.cream });
  F.box(0.5, 0.22, 3.0, { bone: 'body', pos: [0, 3.05, -0.4], taper: [0.5, 1], color: D.ox });
  F.sphere(1.0, { bone: 'chest', pos: [0, 2.38, 1.2], seg: [9, 7], scale: [1.0, 1.04, 1.12], color: D.wine });
  [[1.32, 0.5, 0.3], [1.38, 0.95, 0.15], [1.5, 1.38, -0.15], [1.7, 1.75, -0.45]].forEach(([y, z, r]) => F.box(0.95 - (z - 0.5) * 0.1, 0.12, 0.42, { bone: 'chest', pos: [0, y, z], rot: [r, 0, 0], color: D.cream }));
  // crystal heart in a cage of ivory ribs
  F.blob(0.45, { bone: 'heart', pos: [0, 2.28, 2.12], detail: 0, scale: [1, 1.3, 1], color: D.prism, emis: 2.8 });
  for (const s of [1, -1]) {
    F.spike([0.42 * s, 1.85, 2.0], [-0.25 * s, 1, 0.35], 0.07, 0.75, { bone: 'chest', color: D.ivory });
    F.spike([0.42 * s, 2.75, 2.0], [-0.25 * s, -1, 0.35], 0.07, 0.6, { bone: 'chest', color: D.ivory });
  }
  // neck + neck crystals
  F.seg([0, 2.55, 1.6], [0, 3.32, 2.45], 0.62, 0.5, { bone: 'neck1', color: D.wine });
  F.sphere(0.45, { bone: 'neck1', pos: [0, 2.7, 2.15], seg: [6, 4], scale: [1, 0.8, 1.2], color: D.cream });
  F.seg([0, 3.3, 2.45], [0, 3.82, 2.98], 0.5, 0.42, { bone: 'neck2', color: D.wine });
  F.crystal([0, 3.38, 1.95], [0, 1, -0.55], 0.14, 0.62, { bone: 'neck1', color: D.prism, emis: 2.4 });
  F.crystal([0, 3.9, 2.58], [0, 1, -0.55], 0.12, 0.5, { bone: 'neck2', color: D.prism, emis: 2.4 });
  // head
  F.box(0.86, 0.62, 1.12, { bone: 'head', pos: [0, 3.98, 3.3], taper: [0.75, 0.8], color: D.wine });
  F.box(0.6, 0.4, 0.7, { bone: 'head', pos: [0, 3.86, 3.98], taper: [0.82, 0.88], color: D.wine });
  for (const s of [1, -1]) {
    F.box(0.26, 0.15, 0.55, { bone: 'head', pos: [0.3 * s, 4.24, 3.32], rot: [0.2, 0.3 * s, 0], color: D.ox });
    F.oct(0.1, { bone: 'head', pos: [0.34 * s, 4.1, 3.58], color: D.prism, emis: 2.8 });
    F.spike([0.22 * s, 3.72, 4.12], [0, -1, 0.15], 0.07, 0.3, { bone: 'head', color: D.ivory });
    // swept horns with crystal tips
    F.seg([0.3 * s, 4.18, 3.08], [0.52 * s, 4.58, 2.58], 0.14, 0.1, { bone: 'head', color: D.ivory });
    F.seg([0.52 * s, 4.58, 2.58], [0.64 * s, 4.8, 1.98], 0.1, 0.06, { bone: 'head', color: D.ivory });
    F.crystal([0.67 * s, 4.86, 1.78], [0.1 * s, 0.35, -1], 0.11, 0.5, { bone: 'head', color: D.prism, emis: 2.6, trim: true });
    F.spike([0.42 * s, 3.88, 3.05], [s, 0.2, -0.6], 0.08, 0.45, { bone: 'head', color: D.ivory });
    F.spike([0.4 * s, 3.68, 3.25], [s, -0.3, -0.5], 0.07, 0.35, { bone: 'head', color: D.ivory });
    F.seg([0.36 * s, 4.25, 3.0], [0.75 * s, 4.95, 2.3], 0.08, 0.04, { bone: 'head', color: 0xd0b0ff, eliteOnly: true });
  }
  // jaw
  F.box(0.6, 0.22, 1.0, { bone: 'jaw', pos: [0, 3.58, 3.75], taper: [0.9, 0.9], color: D.wine });
  F.box(0.5, 0.08, 0.9, { bone: 'jaw', pos: [0, 3.46, 3.75], color: D.cream });
  for (const s of [1, -1]) F.spike([0.22 * s, 3.68, 4.1], [0, 1, 0.1], 0.06, 0.22, { bone: 'jaw', color: D.ivory });
  F.sphere(0.17, { bone: 'jaw', pos: [0, 3.72, 3.5], seg: [6, 4], color: D.prism, emis: 2.6 });
  // legs
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    F.sphere(0.52, { bone: 'legF' + L, pos: [0.88 * s, 2.15, 1.35], seg: [7, 5], color: D.wine });
    F.cap([0.86 * s, 2.1, 1.35], [0.95 * s, 1.15, 1.5], 0.36, { bone: 'legF' + L, color: D.wine });
    F.cap([0.95 * s, 1.18, 1.5], [0.98 * s, 0.3, 1.62], 0.3, { bone: 'footF' + L, color: D.wineDk });
    F.box(0.64, 0.27, 0.78, { bone: 'footF' + L, pos: [0.98 * s, 0.14, 1.82], taper: [0.85, 0.85], color: D.ox });
    for (const dx of [-0.2, 0, 0.2]) F.spike([0.98 * s + dx, 0.13, 2.18], [0, -0.25, 1], 0.07, 0.3, { bone: 'footF' + L, color: D.ivory });
    F.sphere(0.66, { bone: 'legB' + L, pos: [0.9 * s, 1.95, -1.3], seg: [7, 5], scale: [0.78, 1.0, 1.1], color: D.wine });
    F.cap([0.9 * s, 1.95, -1.3], [0.95 * s, 1.05, -1.12], 0.42, { bone: 'legB' + L, color: D.wine });
    F.cap([0.95 * s, 1.08, -1.12], [0.97 * s, 0.3, -1.42], 0.32, { bone: 'footB' + L, color: D.wineDk });
    F.box(0.68, 0.27, 0.82, { bone: 'footB' + L, pos: [0.97 * s, 0.14, -1.2], taper: [0.85, 0.85], color: D.ox });
    for (const dx of [-0.2, 0, 0.2]) F.spike([0.97 * s + dx, 0.13, -0.84], [0, -0.25, 1], 0.07, 0.3, { bone: 'footB' + L, color: D.ivory });
  }
  // wings, authored fully spread (the base pose folds them)
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const W1 = 'wing' + L + '1', W2 = 'wing' + L + '2';
    const wr = [2.75 * s, 3.2, 0.45];
    F.cap([0.55 * s, 3.0, 0.75], wr, 0.14, { bone: W1, color: D.wineDk });
    F.sphere(0.2, { bone: W2, pos: wr, seg: [6, 4], color: D.wineDk });
    F.spike(add(wr, [0, 0.1, 0.1]), [0.3 * s, 0.6, 1], 0.08, 0.4, { bone: W2, color: D.ivory });
    const tips = [[4.6 * s, 3.35, -0.1], [4.1 * s, 3.25, -1.35], [3.0 * s, 3.2, -2.05]];
    for (const t of tips) F.cap(wr, t, 0.07, { bone: W2, color: D.wineDk, radial: 5 });
    const outer = [[2.75, 0.45], [4.6, -0.1], [3.95, -0.8], [4.1, -1.35], [3.4, -1.5], [3.0, -2.05]].map(([x, z]) => [x * s, z]);
    F.extrude(outer, 0.06, { bone: W2, pos: [0, 3.22, 0], rot: [PI / 2, 0, 0], color: D.saffron });
    const inner = [[0.55, 0.85], [2.75, 0.45], [3.0, -2.05], [2.1, -1.7], [1.3, -1.75], [0.5, -1.25]].map(([x, z]) => [x * s, z]);
    F.extrude(inner, 0.06, { bone: W1, pos: [0, 3.16, 0], rot: [PI / 2, 0, 0], color: D.saffronDk });
    for (const [dx, dz] of [[0.15, 0.05], [0.3, -0.25], [0.05, -0.35]]) F.crystal(add(wr, [dx * s, 0.18, dz]), [0.4 * s, 1, -0.2], 0.09, 0.42, { bone: W2, color: D.prism, emis: 2.6 });
  }
  // tail + crystal club
  F.seg([0, 2.25, -1.8], [0, 1.85, -2.95], 0.55, 0.42, { bone: 'tail1', color: D.wine });
  F.seg([0, 1.85, -2.95], [0, 1.4, -3.85], 0.42, 0.3, { bone: 'tail2', color: D.wine });
  F.seg([0, 1.4, -3.85], [0, 0.95, -4.7], 0.3, 0.2, { bone: 'tail3', color: D.wineDk });
  F.seg([0, 0.95, -4.7], [0, 0.62, -5.45], 0.2, 0.12, { bone: 'tail4', color: D.wineDk });
  [[0, 1, 0], [0.9, 0.4, -0.3], [-0.9, 0.4, -0.3], [0, 0.2, -1], [0, -0.6, -0.4]].forEach((d, i) => F.crystal(add([0, 0.6, -5.55], norm(d), 0.22), d, 0.18, 0.62 - (i > 2 ? 0.12 : 0), { bone: 'tail4', color: D.prism, emis: 2.6 }));
  for (const [b, p, h] of [['tail1', [0, 2.38, -2.3], 0.38], ['tail2', [0, 1.98, -3.3], 0.3], ['tail3', [0, 1.5, -4.2], 0.24]]) F.spike(p, [0, 1, -0.6], 0.12, h, { bone: b, color: D.ox });
  // spine crystal row: tall at the shoulders, smaller toward the tail
  const row = [['chest', 1.2, 3.35, 1.15, 0.27], ['chest', 0.62, 3.27, 1.25, 0.29], ['body', 0.05, 3.15, 1.1, 0.27], ['body', -0.5, 3.08, 0.95, 0.24], ['body', -1.05, 2.95, 0.8, 0.22], ['body', -1.6, 2.72, 0.66, 0.2], ['tail1', -2.25, 2.48, 0.55, 0.18], ['tail1', -2.75, 2.28, 0.45, 0.16], ['tail2', -3.3, 1.98, 0.36, 0.14]];
  for (const [b, z, y, h, r] of row) F.crystal([0, y + h * 0.45, z], [0, 1, -0.38], r * 1.1, h * 1.3, { bone: b, color: D.prism, emis: 2.6 });
  for (const s of [1, -1]) {
    F.crystal([0.38 * s, 3.38, 0.9], [0.5 * s, 1, -0.3], 0.16, 0.6, { bone: 'chest', color: D.prism, emis: 2.4 });
    F.crystal([0.4 * s, 3.18, -0.2], [0.5 * s, 1, -0.3], 0.14, 0.5, { bone: 'body', color: D.prism, emis: 2.4 });
  }
}

// Folded wings + resting neck (the base / rest of every dragon track)
const D_FOLD = {
  'wingL1.ry': 1.4, 'wingL1.rz': 0.22, 'wingL2.ry': 0.6, 'wingL2.rz': -1.25,
  'wingR1.ry': -1.4, 'wingR1.rz': -0.22, 'wingR2.ry': -0.6, 'wingR2.rz': 1.25,
};
const D_REST = { ...D_FOLD, 'neck1.rx': 0.05, 'head.rx': 0.1, 'tail1.rx': 0.05 };
const D_SPREAD = { 'wingL1.ry': -0.1, 'wingL1.rz': 0.3, 'wingL2.ry': 0, 'wingL2.rz': 0.1, 'wingR1.ry': 0.1, 'wingR1.rz': -0.3, 'wingR2.ry': 0, 'wingR2.rz': -0.1 };
const D_HALF = { 'wingL1.ry': 0.6, 'wingL1.rz': 0.45, 'wingL2.ry': 0.3, 'wingL2.rz': -0.4, 'wingR1.ry': -0.6, 'wingR1.rz': -0.45, 'wingR2.ry': -0.3, 'wingR2.rz': 0.4 };
const D_REAR = { ...D_HALF, 'neck1.rx': -0.5, 'neck2.rx': -0.25, 'head.rx': -0.3, 'jaw.rx': 0.3, 'body.rx': -0.12, 'body.my': 0.12, 'legFL.rz': 0.3, 'legFR.rz': -0.3, 'legFL.rx': 0.1, 'legFR.rx': 0.1, 'legBL.rx': 0.06, 'legBR.rx': 0.06 };
const D_BREATHE = track(DB, D_REST, [[0, 's', {}], [0.6, 'out', D_REAR], [1.0, 's', { ...D_REAR, 'jaw.rx': 0.7, 'neck1.rx': -0.55 }]]);
const D_BEAMPOSE = { ...D_SPREAD, 'neck1.rx': 0.22, 'neck2.rx': 0.12, 'head.rx': 0.12, 'jaw.rx': 0.78, 'neck1.ry': 0.18, 'neck2.ry': 0.12, 'body.rx': 0.05, 'legFL.rz': 0.3, 'legFR.rz': -0.3, 'legFL.rx': -0.15, 'legFR.rx': -0.15, 'legBL.rx': 0.15, 'legBR.rx': 0.15 };
const D_BEAM = track(DB, D_REST, [[0, 's', { ...D_REAR, 'jaw.rx': 0.7, 'neck1.rx': -0.55 }], [0.12, 'in', D_BEAMPOSE], [1, 's', D_BEAMPOSE]]);
const D_VOLLEYPOSE = { ...D_SPREAD, 'wingL1.rz': 0.45, 'wingR1.rz': -0.45, 'neck1.rx': -0.3, 'neck2.rx': -0.1, 'head.rx': -0.1, 'body.rx': -0.04, 'legFL.rz': 0.15, 'legFR.rz': -0.15 };
const D_VOLLEY = track(DB, D_REST, [[0, 's', {}], [0.45, 'out', D_VOLLEYPOSE], [1.9, 's', D_VOLLEYPOSE], [2.4, 's', {}]]);
const D_ROARPOSE = { ...D_SPREAD, 'wingL1.rz': 0.7, 'wingR1.rz': -0.7, 'wingL2.rz': 0.25, 'wingR2.rz': -0.25, 'body.rx': -0.3, 'body.my': 0.3, 'neck1.rx': -0.55, 'neck2.rx': -0.3, 'head.rx': -0.45, 'jaw.rx': 0.9, 'legFL.rx': -0.65, 'legFR.rx': -0.45, 'footFL.rx': 0.9, 'footFR.rx': 0.75, 'legBL.rx': 0.3, 'legBR.rx': 0.3, 'tail1.rx': 0.25 };
const D_ROAR = track(DB, D_REST, [[0, 's', {}], [0.35, 'out', D_ROARPOSE], [0.88, 's', { ...D_ROARPOSE, 'jaw.rx': 0.8, 'head.rx': -0.5 }], [1.0, 's', {}]]);
const D_DIE = track(DB, D_REST, [
  [0, 's', {}],
  [0.3, 'out', { ...D_HALF, 'neck1.rx': -0.6, 'head.rx': -0.5, 'jaw.rx': 0.8, 'body.rx': -0.15 }],
  [1.0, 's', { ...D_SPREAD, 'wingL1.rz': -0.2, 'wingR1.rz': 0.2, 'neck1.rx': 0.6, 'neck2.rx': 0.4, 'head.rx': 0.4, 'jaw.rx': 0.5, 'body.my': -0.8, 'legFL.rz': 0.5, 'legFR.rz': -0.5, 'legBL.rz': 0.4, 'legBR.rz': -0.4, 'footFL.rx': 0.6, 'footFR.rx': 0.6 }],
]);
const D_REST_TRACK = track(DB, D_REST, [[0, 's', {}], [1, 's', {}]]);
// phase 2 delta: wings held half open, head low and forward
const D_RAGE = track(DB, {}, [[0, 's', { 'wingL1.ry': -0.6, 'wingL1.rz': 0.2, 'wingL2.ry': -0.25, 'wingL2.rz': 0.7, 'wingR1.ry': 0.6, 'wingR1.rz': -0.2, 'wingR2.ry': 0.25, 'wingR2.rz': -0.7, 'neck1.rx': 0.1, 'body.rx': 0.04 }], [1, 's', {}]]);

// ---------------------------------------------------------------- v5 raid poses (src/game/bosses/aurelith.js)
// Tell times come from the boss script: rig.tellT (first resolve, s from action start), rig.tell2 (second stomp).
const c01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Crashed: wings splayed flat, belly on the ground, head down, legs out — readable from the iso camera.
const D_DOWNPOSE = {
  // belly on the ground, legs sprawled
  'body.my': -0.8, 'body.rx': 0.14, 'chest.rx': 0.1,
  'legFL.rz': 0.8, 'legFR.rz': -0.7, 'legFL.rx': 0.45, 'legFR.rx': 0.3, 'legBL.rz': 0.65, 'legBR.rz': -0.55, 'legBL.rx': 0.2, 'legBR.rx': 0.35,
  'footFL.rx': 0.6, 'footFR.rx': 0.5, 'footBL.rx': 0.5, 'footBR.rx': 0.45,
  // neck and head slumped on the ground to one side, jaw slack
  'neck1.rx': 1.05, 'neck1.ry': 0.95, 'neck2.rx': 0.75, 'neck2.ry': 0.65, 'head.rx': 0.5, 'head.ry': 0.45, 'head.rz': 0.55, 'jaw.rx': 0.8,
  // wings collapsed half-open, drooping onto the ground (uneven)
  'wingL1.ry': -0.15, 'wingL1.rz': -0.55, 'wingL2.ry': 0.25, 'wingL2.rz': -0.55,
  'wingR1.ry': 0.3, 'wingR1.rz': 0.6, 'wingR2.ry': -0.55, 'wingR2.rz': 0.45,
  // tail limp, curled to the other side
  'tail1.rx': 0.25, 'tail1.ry': -0.5, 'tail2.rx': 0.2, 'tail2.ry': -0.6, 'tail3.ry': -0.5, 'tail4.ry': -0.4,
};
// the stagger: rears back, wings thrown up, then collapses
const D_DOWN_IN = track(DB, D_REST, [[0, 's', {}],
  [0.2, 'out', { ...D_HALF, 'wingL1.rz': 0.7, 'wingR1.rz': -0.7, 'neck1.rx': -0.5, 'neck2.rx': -0.3, 'head.rx': -0.4, 'jaw.rx': 0.8, 'body.rx': -0.22, 'body.my': 0.1 }],
  [0.6, 'in', D_DOWNPOSE]]);
const D_UP_FROM_DOWN = track(DB, D_REST, [[0, 's', D_DOWNPOSE], [0.6, 's', {}]]);
// Prism Nova: wings clamped tight round a crouched body, then flared wide as the crystals blaze
const D_NOVA_WRAP = { 'wingL1.ry': 1.7, 'wingL1.rz': -0.3, 'wingL2.ry': 0.9, 'wingL2.rz': -1.6, 'wingR1.ry': -1.7, 'wingR1.rz': 0.3, 'wingR2.ry': -0.9, 'wingR2.rz': 1.6,
  'neck1.rx': 0.75, 'neck2.rx': 0.5, 'head.rx': 0.55, 'jaw.rx': 0.05, 'body.my': -0.55, 'body.rx': 0.12,
  'legFL.rx': 0.35, 'legFR.rx': 0.35, 'legBL.rx': 0.4, 'legBR.rx': 0.4, 'footFL.rx': 0.5, 'footFR.rx': 0.5, 'tail1.rx': 0.45, 'tail2.rx': 0.3 };
const D_NOVA_FLARE = { ...D_SPREAD, 'wingL1.rz': 1.0, 'wingR1.rz': -1.0, 'wingL2.rz': 0.4, 'wingR2.rz': -0.4, 'wingL1.ry': -0.25, 'wingR1.ry': 0.25,
  'neck1.rx': -0.75, 'neck2.rx': -0.4, 'head.rx': -0.55, 'jaw.rx': 0.95, 'body.rx': -0.28, 'body.my': 0.38,
  'legFL.rx': -0.55, 'legFR.rx': -0.55, 'legFL.rz': 0.2, 'legFR.rz': -0.2, 'footFL.rx': 0.9, 'footFR.rx': 0.9, 'legBL.rx': 0.3, 'legBR.rx': 0.3, 'tail1.rx': 0.3 };
const D_NOVA = track(DB, D_REST, [[0, 's', {}], [1.3, 'out', D_NOVA_WRAP], [4.7, 's', D_NOVA_WRAP], [5.05, 'in', D_NOVA_FLARE], [6, 's', D_NOVA_FLARE]]);
// Tempest: head and wings thrown skyward, calling the bolts down
const D_CALL = { ...D_ROARPOSE, 'wingL1.rz': 0.95, 'wingR1.rz': -0.95, 'wingL2.rz': 0.4, 'wingR2.rz': -0.4, 'neck1.rx': -0.75, 'neck2.rx': -0.45, 'head.rx': -0.6, 'jaw.rx': 0.7, 'body.rx': -0.34, 'body.my': 0.34 };
const D_TEMPEST_UP = track(DB, D_REST, [[0, 's', {}], [0.6, 'out', D_CALL]]);
// Shard Fall: wings snapped open, head high — a head jab per shard
const D_SHARDPOSE = { ...D_SPREAD, 'wingL1.rz': 0.8, 'wingR1.rz': -0.8, 'wingL2.rz': 0.3, 'wingR2.rz': -0.3, 'neck1.rx': -0.35, 'neck2.rx': -0.15, 'head.rx': -0.2, 'jaw.rx': 0.3, 'body.rx': -0.08, 'legFL.rz': 0.15, 'legFR.rz': -0.15 };
const D_SHARDS_UP = track(DB, D_REST, [[0, 's', {}], [0.5, 'out', D_SHARDPOSE]]);
// Quadrant Prism: wings wide and high, crystals up, then a flare
const D_PRISMPOSE = { ...D_SPREAD, 'wingL1.rz': 0.9, 'wingR1.rz': -0.9, 'wingL2.rz': 0.4, 'wingR2.rz': -0.4, 'neck1.rx': -0.5, 'neck2.rx': -0.3, 'head.rx': -0.35, 'jaw.rx': 0.5, 'body.rx': -0.18, 'body.my': 0.2, 'legFL.rz': 0.2, 'legFR.rz': -0.2 };
const D_PRISM_UP = track(DB, D_REST, [[0, 's', {}], [0.7, 'out', D_PRISMPOSE]]);

export const AURELITH_ACT = {
  // ----- v5 raid actions -----
  // Crashed (holds for any duration: h.dur): stagger → collapse in 0.6 s, then a slow laboured heave.
  downed: {
    dur: 4, fi: 0.12, fo: 0.3, fn: (s, B, T) => {
      play(D_DOWN_IN, Math.min(T, 0.6));
      const hv = sin(T * 3.2), e = smooth(T / 0.8);     // slow heaving breath
      W.move(B.body, 0, 0.05 * hv * e, 0).rot(B.chest, 0.05 * hv * e).rot(B.neck1, 0.03 * hv * e).rot(B.head, 0.03 * sin(T * 1.3 + 1) * e, 0, 0.04 * sin(T * 0.9) * e).rot(B.jaw, 0.07 * hv * e);
      W.rot(B.wingL1, 0, 0, 0.04 * hv * e).rot(B.wingR1, 0, 0, -0.04 * hv * e).rot(B.tail3, 0, 0.05 * sin(T * 0.8) * e);
    },
  },
  recover: { dur: 0.6, fi: 0.05, fo: 0.2, fn: (s, B, T) => play(D_UP_FROM_DOWN, T) },
  // Prism Nova (6 s Break Check): wrap, tremble harder, flare.
  nova: {
    dur: 6, fi: 0.2, fo: 0.4, fn: (s, B, T) => {
      play(D_NOVA, T);
      if (T > 1.3 && T < 5.0) {
        const u = c01((T - 1.3) / 3.7), sh = sin(T * 52) * (0.01 + 0.035 * u * u);
        W.rot(B.body, sh, 0, sh * 0.5).rot(B.wingL1, 0, 0, sh).rot(B.wingR1, 0, 0, -sh).rot(B.head, sh * 0.6, sh * 0.6);
      } else if (T >= 5.05) {
        const sh = sin(T * 60) * 0.02 * (1 - c01((T - 5.4) / 0.6));
        W.rot(B.head, sh, sh).rot(B.jaw, sh);
      }
    },
  },
  // Skyward / Floodfall: lifts off and hovers high (hold), heavy wing-beats. Chains into crash.
  skyward: {
    dur: 7, fi: 0.12, fo: 0, fn: (s, B, T) => {
      const wr = smooth(T / 0.8);
      aurelithHover(s, B, T, wr, 2.0, 6);
      W.rot(B.neck1, -0.18 * wr).rot(B.head, -0.1 * wr).rot(B.jaw, 0.25 * wr * (0.5 + 0.5 * sin(T * 2)));
    },
  },
  // Slams down from the hover; wings splay and dust flies at impact (T = 0.35).
  crash: {
    dur: 1.0, fi: 0.05, fo: 0.3, fn: (s, B, T) => {
      const d = c01(T / 0.35), up = 1 - d * d;
      const im = T >= 0.35 ? Math.exp(-(T - 0.35) * 5) : 0;
      W.move(B.body, 0, 2.1 * up - 0.5 * im, 0).rot(B.body, -0.1 * up + 0.2 * im);
      W.rot(B.wingL1, 0, 0, 0.55 * up - 0.4 * im).rot(B.wingR1, 0, 0, -0.55 * up + 0.4 * im);
      W.rot(B.wingL2, 0, 0, 0.2 * up - 0.2 * im).rot(B.wingR2, 0, 0, -0.2 * up + 0.2 * im);
      W.rot(B.legFL, 0.35 * up + 0.2 * im, 0, 0.5 * im).rot(B.legFR, 0.3 * up + 0.2 * im, 0, -0.5 * im);
      W.rot(B.legBL, 0.5 * up, 0, 0.4 * im).rot(B.legBR, 0.45 * up, 0, -0.4 * im);
      W.rot(B.neck1, -0.2 * up + 0.5 * im).rot(B.neck2, 0.3 * im).rot(B.head, 0.3 * im).rot(B.jaw, 0.5 * im);
    },
  },
  // Tempest: call the bolts down (jaw-flung lunges as each strike locks).
  tempest: {
    dur: 2.6, fi: 0.15, fo: 0.4, fn: (s, B, T) => {
      const tt = s.h.tellT ?? 1.6;
      play(D_TEMPEST_UP, Math.min(T, 0.6));
      if (T > 0.6 && T < tt + 1.1) {
        const u = c01((T - 0.6) / Math.max(0.2, tt - 0.6)), sh = sin(T * 36) * 0.035 * u;
        W.rot(B.head, sh, sh).rot(B.neck2, 0, sh).rot(B.wingL1, 0, 0, sh * 2).rot(B.wingR1, 0, 0, -sh * 2);
      }
      for (let j = 0; j < 3; j++) {
        const d = T - (tt + 0.55 * j - 0.05);
        if (d < 0 || d > 0.3) continue;
        const e = Math.sin((d / 0.3) * PI);
        W.rot(B.neck1, 0.6 * e).rot(B.neck2, 0.25 * e).rot(B.head, 0.35 * e).rot(B.jaw, -0.3 * e).rot(B.wingL1, 0, 0, -0.35 * e).rot(B.wingR1, 0, 0, 0.35 * e);
      }
    },
  },
  // Flame Lanes: rears back like the breath, then exhales a long gout along the lanes.
  lanes: {
    dur: 1.9, fi: 0.12, fo: 0.35, fn: (s, B, T) => {
      const tt = s.h.tellT ?? 1.0;
      if (T < tt) { play(D_BREATHE, c01(T / tt)); return; }
      const e = Math.exp(-(T - tt) * 2.2), w0 = W.w;
      W.w = w0 * (0.4 + 0.6 * e);
      play(D_BREATHE, 1);
      W.w = w0;
      W.rot(B.neck1, 0.55 * e).rot(B.neck2, 0.3 * e).rot(B.head, 0.3 * e).rot(B.jaw, 0.1 * e);
    },
  },
  // Frost Rings: rears up and stamps twice (stomp 1 at tellT, stomp 2 at tell2).
  rings: {
    dur: 3.9, fi: 0.12, fo: 0.4, fn: (s, B, T) => {
      const t1 = s.h.tellT ?? 0.9, t2 = s.h.tell2 ?? (t1 + 2.4);
      let rise = 0, slam = 0;
      for (const ts of [t1, t2]) {
        if (T < ts) rise = Math.max(rise, smooth((T - (ts - 0.75)) / 0.75));
        else slam = Math.max(slam, Math.exp(-(T - ts) * 6));
      }
      W.rot(B.body, -0.3 * rise + 0.12 * slam).move(B.body, 0, 0.3 * rise - 0.18 * slam, 0);
      W.rot(B.legFL, -0.65 * rise + 0.15 * slam).rot(B.legFR, -0.6 * rise + 0.15 * slam).rot(B.footFL, 0.9 * rise).rot(B.footFR, 0.8 * rise);
      W.rot(B.neck1, -0.45 * rise + 0.3 * slam).rot(B.neck2, -0.2 * rise + 0.15 * slam).rot(B.head, -0.35 * rise + 0.2 * slam).rot(B.jaw, 0.4 * rise);
      W.rot(B.wingL1, 0, 0, 0.5 * rise + 0.45 * slam).rot(B.wingR1, 0, 0, -0.5 * rise - 0.45 * slam);
      W.rot(B.wingL1, 0, -0.35 * (rise + slam), 0).rot(B.wingR1, 0, 0.35 * (rise + slam), 0);
      W.rot(B.tail1, 0.2 * rise);
    },
  },
  // Shard Fall: wings snapped open, a head jab on every shard (circle j lands at tellT + 0.3 j − 0.1).
  shards: {
    dur: 3.3, fi: 0.1, fo: 0.4, fn: (s, B, T) => {
      const tt = s.h.tellT ?? 1.0;
      play(D_SHARDS_UP, Math.min(T, 0.5));
      for (let j = 0; j < 6; j++) {
        const d = T - (tt + 0.3 * j - (j ? 0.1 : 0) - 0.1);
        if (d < 0 || d > 0.27) continue;
        const e = d < 0.08 ? smooth(d / 0.08) : 1 - smooth((d - 0.08) / 0.19);
        W.rot(B.neck1, 0.5 * e).rot(B.neck2, 0.15 * e).rot(B.head, 0.25 * e).rot(B.jaw, 0.6 * e);
        W.rot(B.wingL1, 0, 0, -0.14 * e).rot(B.wingR1, 0, 0, 0.14 * e);
      }
    },
  },
  // Quadrant Prism: wings and crystals raised, flare at the release.
  prism: {
    dur: 2.6, fi: 0.15, fo: 0.4, fn: (s, B, T) => {
      const tt = s.h.tellT ?? 1.2;
      play(D_PRISM_UP, Math.min(T, 0.7));
      if (T > 0.7 && T < tt) { const sh = sin(T * 30) * 0.025 * c01((T - 0.7) / (tt - 0.7)); W.rot(B.head, sh, sh).rot(B.wingL1, 0, 0, sh * 2).rot(B.wingR1, 0, 0, -sh * 2); }
      if (T >= tt) {
        const e = Math.exp(-(T - tt) * 3.5);
        W.rot(B.wingL1, 0, 0, 0.35 * e).rot(B.wingR1, 0, 0, -0.35 * e).rot(B.neck1, -0.25 * e).rot(B.head, -0.2 * e).rot(B.jaw, 0.3 * e);
      }
    },
  },
  // ----- v4 actions -----
  breathe: { dur: 1.0, fi: 0.15, fo: 0, fn: (s, B, T, k) => play(D_BREATHE, k) },
  beam: {
    dur: 3.0, fi: 0, fo: 0, fn: (s, B, T, k) => {
      play(D_BEAM, k);
      const sh = sin(s.t * 38) * 0.025;
      W.rot(B.head, sh, sh).rot(B.neck2, 0, sh);
    },
  },
  beamEnd: { dur: 0.3, fi: 0, fo: 0.3, fn: () => play(D_BEAM, 1) },
  volley: {
    dur: 2.4, fi: 0.1, fo: 0.45, fn: (s, B, T) => {
      play(D_VOLLEY, T);
      // five head jabs, each landing on a fan (fans fire at 0.6 + 0.3 j)
      for (let j = 0; j < 5; j++) {
        const d = T - (0.52 + 0.3 * j);
        if (d < 0 || d > 0.27) continue;
        const e = d < 0.08 ? smooth(d / 0.08) : 1 - smooth((d - 0.08) / 0.19);
        W.rot(B.neck1, 0.5 * e).rot(B.neck2, 0.15 * e).rot(B.head, 0.25 * e).rot(B.jaw, 0.65 * e);
        W.rot(B.wingL1, 0, 0, -0.12 * e).rot(B.wingR1, 0, 0, 0.12 * e);
      }
    },
  },
  roar: {
    dur: 1.0, fi: 0.1, fo: 0.25, fn: (s, B, T) => {
      play(D_ROAR, T);
      if (T > 0.35 && T < 0.9) { const sh = sin(s.t * 40) * 0.035; W.rot(B.head, sh, sh).rot(B.jaw, sh); }
    },
  },
  die: { dur: 1.6, fi: 0.08, fo: 0, fn: (s, B, T, k) => play(D_DIE, k) },
};

const D_MASK = new Float32Array(aurelithBones.length).fill(1);
const D_HOVER_BONES = ['body', 'wingL1', 'wingL2', 'wingR1', 'wingR2', 'legFL', 'footFL', 'legFR', 'footFR', 'legBL', 'footBL', 'legBR', 'footBR', 'tail3', 'tail4'].map((n) => DB[n]);

function aurelithBase(s, B) {
  const m = s.move, w = s.walk, rage = s.h.rage ? 1 : 0;
  const tb = s.t * (1 + 0.5 * rage) + s.seed * TAU;
  const br = sin(tb * 1.3);
  hold(D_REST_TRACK);
  if (rage) { const w0 = W.w; W.w = w0 * 0.45; hold(D_RAGE); W.w = w0; }
  const sw = sin(w), cw = cos(w), A = 0.32 * m;
  W.rot(B.legFL, sw * A).rot(B.legBR, sw * A).rot(B.legFR, -sw * A).rot(B.legBL, -sw * A);
  W.rot(B.footFL, max(0, -cw) * 0.6 * m).rot(B.footBR, max(0, -cw) * 0.5 * m);
  W.rot(B.footFR, max(0, cw) * 0.6 * m).rot(B.footBL, max(0, cw) * 0.5 * m);
  W.move(B.body, 0, -0.07 * abs(sw) * m + 0.04 * br, 0).rot(B.body, 0.02 * sin(w * 2) * m, 0, 0.04 * sw * m);
  W.rot(B.chest, -0.02 * br, 0, -0.03 * sw * m);
  W.rot(B.neck1, 0.04 * br + 0.12 * rage, 0.12 * sin(tb * 0.8), 0);
  W.rot(B.neck2, -0.03 * br, -0.1 * sin(tb * 0.8 - 0.7), 0);
  W.rot(B.head, 0.05 * sin(tb * 0.6) - 0.08 * rage, 0.08 * sin(tb * 0.8 - 1.4), 0);
  W.rot(B.jaw, 0.04 + 0.03 * br + 0.15 * rage * max(0, sin(tb * 1.9)));
  W.rot(B.wingL1, 0, 0, 0.08 * br).rot(B.wingR1, 0, 0, -0.08 * br);
  W.rot(B.wingL2, 0, 0, -0.04 * br).rot(B.wingR2, 0, 0, 0.04 * br);
}

// Phase-2 hover (shard rain): heavy wing beats, body lifts, legs dangle. T in seconds (0..1.4).
function aurelithHover(s, B, T, wr, hh = 1, f = 7.5) {
  const ph = T * f;
  const lift = 1.05 * hh * wr + 0.16 * hh * sin(ph - PI / 2) * wr;
  W.move(B.body, 0, lift, 0).rot(B.body, -0.08 * wr, 0, 0);
  W.rot(B.wingL1, 0, -0.1 * wr, (0.3 + 0.8 * sin(ph)) * wr).rot(B.wingR1, 0, 0.1 * wr, -(0.3 + 0.8 * sin(ph)) * wr);
  W.rot(B.wingL2, 0, 0, 0.45 * sin(ph - 1.0) * wr).rot(B.wingR2, 0, 0, -0.45 * sin(ph - 1.0) * wr);
  W.rot(B.legFL, 0.35 * wr).rot(B.legFR, 0.3 * wr).rot(B.footFL, 0.5 * wr).rot(B.footFR, 0.45 * wr);
  W.rot(B.legBL, 0.5 * wr).rot(B.legBR, 0.45 * wr).rot(B.footBL, 0.4 * wr).rot(B.footBR, 0.35 * wr);
  W.rot(B.tail3, 0.2 * wr, 0.35 * sin(T * 4) * wr).rot(B.tail4, 0.15 * wr, 0.45 * sin(T * 4 - 0.6) * wr);
}

export const aurelith = defineCreature({
  id: 'aurelith',
  stride: 2.6,
  blob: 3.0,
  deathTime: 1.6,
  bones: aurelithBones,
  build(pb) { buildAurelith(pb); },
  animate(P, s, B) {
    W.P = P; W.mask = null;
    const rage = s.h.rage ? 1 : 0;
    const tb = s.t * (1 + 0.5 * rage) + s.seed * TAU;
    if (s.dying > 0) { W.w = 1; play(D_DIE, s.dying); }
    else {
      // hover layer (masked to body / wings / legs); runs on top of any action
      const fk = s.action === 'rain' ? s.k : (s.h.flapK ?? -1);
      let wr = 0, T = 0;
      if (fk >= 0 && fk < 1) { T = fk * 1.4; wr = smooth(T / 0.3) * smooth((1.4 - T) / 0.4); }
      if (wr > 0) { D_MASK.fill(1); for (const b of D_HOVER_BONES) D_MASK[b] = 1 - wr; W.mask = D_MASK; }
      const wt = weights(s, AURELITH_ACT);
      W.w = wt.base; aurelithBase(s, B);
      runActions(s, B, AURELITH_ACT, wt);
      W.mask = null; W.w = 1;
      if (wr > 0) aurelithHover(s, B, T, wr);
    }
    // additive: heart pulse (0.8 Hz), breathing, tail sway, hit recoil
    const hp = sin(tb * TAU * 0.8);
    P.scale(B.heart, 1 + 0.07 * hp);
    P.scale(B.body, 1 + 0.012 * sin(tb * 1.3), 1 + 0.02 * sin(tb * 1.3), 1);
    const ts = s.dying > 0 ? 0.2 : 1;
    P.rot(B.tail1, 0, 0.18 * sin(tb * 1.1) * ts, 0).rot(B.tail2, 0, 0.22 * sin(tb * 1.1 - 0.6) * ts, 0);
    P.rot(B.tail3, 0, 0.28 * sin(tb * 1.1 - 1.2) * ts, 0).rot(B.tail4, 0, 0.32 * sin(tb * 1.1 - 1.8) * ts, 0);
    if (s.hit > 0) P.rot(B.neck1, -0.15 * s.hit).rot(B.head, -0.2 * s.hit);
  },
});
