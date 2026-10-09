// Boss 1 of 3: Gorrak, the Troll King (hollowWarden). v5 raid actions: backhand, downed, recover, hornHold, leap, hurl, roar (+ slam time-warp).
import { defineCreature, TAU, smooth } from '../rig.js';
import { PI, sin, cos, abs, max, qAim, eul, add, norm, Frame, boneMap, W, track, play, hold, weights, runActions } from './common.js';

// =====================================================================================
//  GORRAK, THE TROLL KING  (hollowWarden, r 1.8) — §4.7
// =====================================================================================

const G = {
  slate: 0x4b767a, slateDk: 0x37585e, belly: 0x86a9a6, bark: 0x5b3a22, barkLt: 0x76502f,
  moss: 0x86b33c, mossDk: 0x5f8a2c, lime: 0xb8ff3c, bone: 0xeadcb4, rust: 0xc9602a,
  hide: 0x8a6a4a, leather: 0x4a2f1d, iron: 0x9aa0a6, earth: 0x4a3424, roots: 0x6b4426,
  stone: 0x8c8c84, leaf: 0x4f8a34, leafLt: 0x7cbf4a, gold: 0xe0bc52,
};

// Spore pods: ring on the mossy back (model space). Exported for bosses.js (projectile fx origins).
const POD_C = [0, 4.02, -0.9];
const POD_N = norm([0, 0.83, -0.56]);
const POD_V = norm([0, 0.56, 0.83]);
export const GORRAK_PODS = [];
for (let i = 0; i < 6; i++) {
  const a = i * (PI / 3) + PI / 6;
  const base = add(add(POD_C, [1, 0, 0], cos(a) * 0.82), POD_V, sin(a) * 0.6);
  GORRAK_PODS.push({ base, cap: add(base, POD_N, 0.4) });
}

const gorrakBones = [
  { name: 'root' },
  { name: 'hips', pivot: [0, 1.75, 0] },
  { name: 'spine', parent: 'hips', pivot: [0, 1.95, -0.1] },
  { name: 'head', parent: 'spine', pivot: [0, 3.75, 0.75] },
  { name: 'jaw', parent: 'head', pivot: [0, 3.72, 1.0] },
  { name: 'crown', parent: 'head', pivot: [0, 4.4, 0.95] },
  { name: 'armL', parent: 'spine', pivot: [1.55, 3.6, -0.05] },
  { name: 'foreL', parent: 'armL', pivot: [1.75, 2.45, 0.05] },
  { name: 'hornHand', parent: 'foreL', pivot: [1.85, 1.3, 0.15] },
  { name: 'armR', parent: 'spine', pivot: [-1.55, 3.6, -0.05] },
  { name: 'foreR', parent: 'armR', pivot: [-1.75, 2.45, 0.05] },
  { name: 'club', parent: 'foreR', pivot: [-1.85, 1.3, 0.15] },
  { name: 'legL', parent: 'hips', pivot: [0.62, 1.75, 0] },
  { name: 'kneeL', parent: 'legL', pivot: [0.66, 0.92, 0.08] },
  { name: 'legR', parent: 'hips', pivot: [-0.62, 1.75, 0] },
  { name: 'kneeR', parent: 'legR', pivot: [-0.66, 0.92, 0.08] },
  { name: 'back', parent: 'spine', pivot: [0, 3.4, -0.75] },
  ...GORRAK_PODS.map((p, i) => ({ name: `pod${i}`, parent: 'back', pivot: p.base })),
  { name: 'horn', parent: 'hips', pivot: [1.02, 1.95, 0.5] },
];
const GB = boneMap(gorrakBones);

function buildHorn(F) {
  // local +Y runs from the mouthpiece (origin) to the bell
  F.seg([0, 0, 0], [0, 0.32, 0.06], 0.06, 0.1, { color: G.bone });
  F.seg([0, 0.32, 0.06], [0, 0.62, 0.2], 0.1, 0.15, { color: G.bone });
  F.seg([0, 0.62, 0.2], [0, 0.86, 0.42], 0.15, 0.25, { color: G.bone, radial: 8 });
  F.torus(0.12, 0.045, { pos: [0, 0.32, 0.06], rot: [PI / 2 - 0.2, 0, 0], color: G.iron, radial: 8, trim: true });
  F.torus(0.17, 0.05, { pos: [0, 0.62, 0.2], rot: [PI / 2 - 0.5, 0, 0], color: G.iron, radial: 8, trim: true });
  F.sphere(0.17, { pos: [0, 0.84, 0.4], seg: [6, 4], color: G.lime, emis: 2.4 });
}

function buildGorrak(pb) {
  const F = new Frame(pb);
  // ---- legs
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    F.cap([0.62 * s, 1.85, 0], [0.67 * s, 0.92, 0.08], 0.46, { bone: 'leg' + L, color: G.slate });
    F.cap([0.67 * s, 0.98, 0.08], [0.7 * s, 0.32, 0.14], 0.39, { bone: 'knee' + L, color: G.slate });
    F.box(0.42, 0.3, 0.3, { bone: 'knee' + L, pos: [0.68 * s, 0.95, 0.38], rot: [0.3, 0, 0], color: G.bark });
    F.box(0.82, 0.34, 1.02, { bone: 'knee' + L, pos: [0.72 * s, 0.17, 0.32], taper: [0.85, 0.85], color: G.slateDk });
    for (const dx of [-0.24, 0, 0.24]) F.spike([0.72 * s + dx, 0.12, 0.78], [0, -0.15, 1], 0.08, 0.28, { bone: 'knee' + L, color: G.bone });
  }
  // ---- hips: pelvis, belt, loincloth, skull buckle
  F.box(1.6, 0.8, 1.2, { bone: 'hips', pos: [0, 1.85, 0], color: G.slateDk });
  F.box(1.95, 0.34, 1.38, { bone: 'hips', pos: [0, 2.08, 0.05], color: G.leather });
  F.box(0.95, 1.05, 0.12, { bone: 'hips', pos: [0, 1.42, 0.68], bottom: [1.25, 1], color: G.hide });
  F.box(1.1, 1.0, 0.12, { bone: 'hips', pos: [0, 1.45, -0.64], bottom: [1.2, 1], color: G.hide });
  F.sphere(0.22, { bone: 'hips', pos: [0, 2.06, 0.74], seg: [6, 4], scale: [1, 1.1, 0.8], color: G.bone, trim: true });
  // horn on the left hip + its strap
  F.box(0.12, 0.5, 0.12, { bone: 'hips', pos: [0.95, 1.95, 0.55], rot: [0, 0, -0.3], color: G.leather });
  buildHorn(new Frame(pb, [1.02, 1.95, 0.5], qAim([0.12, -0.85, 0.5]), 'horn'));
  // hand horn (only shown while blowing): across the left fist, mouthpiece inward, bell out
  buildHorn(new Frame(pb, [1.8, 1.12, 0.2], qAim([0.88, -0.42, 0.15]), 'hornHand'));
  // ---- torso
  F.sphere(1.0, { bone: 'spine', pos: [0, 2.55, 0.32], seg: [10, 7], scale: [1.12, 0.86, 0.92], color: G.belly });
  F.box(2.6, 1.7, 1.6, { bone: 'spine', pos: [0, 3.05, 0.0], rot: [0.35, 0, 0], taper: [1.25, 1.05], color: G.slate });
  F.blob(1.0, { bone: 'spine', pos: [0, 3.45, -0.42], detail: 1, jitter: 0.1, seed: 4, scale: [1.38, 0.8, 0.95], color: G.slate });
  // bark pauldrons with bark spikes + moss tuft
  for (const s of [1, -1]) {
    F.box(1.05, 0.5, 1.05, { bone: 'spine', pos: [1.48 * s, 3.98, -0.05], rot: [0, 0, -0.32 * s], taper: [0.7, 0.7], color: G.bark });
    for (const dz of [-0.32, 0, 0.32]) F.spike([1.55 * s, 4.15, dz - 0.05], [0.55 * s, 1, dz * 0.6], 0.13, 0.62 - abs(dz) * 0.4, { bone: 'spine', color: G.barkLt });
    F.blob(0.28, { bone: 'spine', pos: [1.25 * s, 4.18, -0.35], detail: 0, color: G.moss });
  }
  // ---- back: moss mat + spore pods
  F.blob(1.0, { bone: 'back', pos: [0, 3.76, -0.72], rot: [-0.58, 0, 0], detail: 1, jitter: 0.16, seed: 7, scale: [1.32, 0.5, 1.08], color: G.moss });
  F.blob(0.45, { bone: 'back', pos: [0.75, 3.35, -1.15], detail: 0, jitter: 0.2, color: G.mossDk });
  F.blob(0.4, { bone: 'back', pos: [-0.8, 3.3, -1.1], detail: 0, jitter: 0.2, color: G.mossDk });
  GORRAK_PODS.forEach((p, i) => {
    const bone = `pod${i}`;
    F.spike(add(p.base, POD_N, -0.05), POD_N, 0.12, 0.34, { bone, color: G.bark });
    F.sphere(0.24, { bone, pos: p.cap, rot: eul(qAim(POD_N)), seg: [7, 5], scale: [1, 1.3, 1], color: G.lime, emis: 1.4 });
  });
  // ---- head
  F.box(0.8, 0.55, 0.7, { bone: 'head', pos: [0, 3.72, 0.78], color: G.slate });
  F.box(1.0, 0.82, 1.02, { bone: 'head', pos: [0, 4.02, 1.05], taper: [0.85, 0.8], color: G.slate });
  F.box(1.08, 0.24, 0.4, { bone: 'head', pos: [0, 4.24, 1.45], rot: [0.35, 0, 0], color: G.slateDk });
  F.cone(0.16, 0.42, { bone: 'head', pos: [0, 3.98, 1.66], rot: [2.0, 0, 0], radial: 5, color: G.slate });
  for (const s of [1, -1]) {
    F.spike([0.5 * s, 4.08, 0.95], [s, 0.3, -0.4], 0.17, 0.8, { bone: 'head', color: G.slate });
    F.oct(0.1, { bone: 'head', pos: [0.24 * s, 4.08, 1.55], color: G.lime, emis: 3 });
  }
  for (let i = 0; i < 5; i++) F.spike([0, 4.38, 0.62 + i * 0.17], [0, 1, -0.35], 0.14, 0.5 - abs(i - 2) * 0.05, { bone: 'head', color: G.rust });
  // jaw: underbite, tusks, moss beard
  F.box(0.98, 0.36, 0.82, { bone: 'jaw', pos: [0, 3.62, 1.3], color: G.slate });
  for (const s of [1, -1]) F.spike([0.33 * s, 3.74, 1.58], [0.28 * s, 1, 0.28], 0.13, 0.78, { bone: 'jaw', color: G.bone, trim: true });
  for (const x of [-0.28, 0, 0.28]) F.spike([x, 3.5, 1.42], [x * 0.4, -1, 0.25], 0.16, 0.62 - abs(x) * 0.4, { bone: 'jaw', color: G.mossDk });
  // ---- crown: bone circlet + 5 branching antlers (gold tips) — elite gets an extra pair
  F.torus(0.5, 0.09, { bone: 'crown', pos: [0, 4.42, 1.0], rot: [PI / 2, 0, 0], color: G.bone, radial: 10 });
  for (let i = 0; i < 5; i++) {
    const a = PI / 2 + i * (TAU / 5);
    const out = [cos(a), 0, sin(a)], tan = [-sin(a), 0, cos(a)];
    const len = i === 0 ? 0.95 : 1.35;
    const b = [0.48 * cos(a), 4.46, 1.0 + 0.48 * sin(a)];
    const d = norm([out[0] * 0.6, 1, out[2] * 0.6]);
    F.spike(b, d, 0.11, len * 0.8, { bone: 'crown', color: G.barkLt });
    F.spike(add(b, d, len * 0.68), d, 0.06, len * 0.42, { bone: 'crown', color: G.gold, trim: true });
    const t1 = add(b, d, len * 0.4);
    F.spike(t1, norm(add(add(d, out, 0.9), tan, 0.45)), 0.065, 0.45, { bone: 'crown', color: G.barkLt });
    const t2 = add(b, d, len * 0.62);
    F.spike(t2, norm(add(add(d, out, 0.3), tan, -0.7)), 0.05, 0.36, { bone: 'crown', color: G.bone });
  }
  for (const s of [1, -1]) F.spike([0.35 * s, 4.5, 0.75], [s, 1.4, -0.4], 0.09, 1.0, { bone: 'crown', color: G.gold, eliteOnly: true });
  // ---- arms
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    F.blob(0.52, { bone: 'arm' + L, pos: [1.62 * s, 3.62, -0.05], detail: 0, color: G.slate });
    F.cap([1.58 * s, 3.55, -0.05], [1.75 * s, 2.45, 0.05], 0.41, { bone: 'arm' + L, color: G.slate });
    F.cap([1.75 * s, 2.5, 0.05], [1.84 * s, 1.55, 0.15], 0.47, { bone: 'fore' + L, color: G.slate });
    F.torus(0.46, 0.065, { bone: 'fore' + L, pos: [1.8 * s, 2.12, 0.1], rot: [PI / 2, 0, 0.1 * s], color: G.leaf, radial: 9 });
    F.torus(0.44, 0.065, { bone: 'fore' + L, pos: [1.82 * s, 1.85, 0.12], rot: [PI / 2 + 0.25, 0, 0], color: G.leafLt, radial: 9 });
    F.box(0.72, 0.64, 0.72, { bone: 'fore' + L, pos: [1.86 * s, 1.3, 0.15], taper: [1.05, 1.05], color: G.slate });
  }
  // ---- club: uprooted tree, authored pointing straight up from the right fist
  const C = new Frame(pb, [-1.85, 1.3, 0.15]);
  C.seg([0, -0.45, 0], [0, 2.75, 0], 0.24, 0.36, { bone: 'club', color: G.bark, radial: 7 });
  C.seg([0.0, 1.0, 0], [0.42, 1.55, 0.1], 0.09, 0.05, { bone: 'club', color: G.bark });
  C.sphere(0.34, { bone: 'club', pos: [0.5, 1.7, 0.12], seg: [6, 4], scale: [1, 0.65, 1], color: G.leaf });
  C.sphere(0.26, { bone: 'club', pos: [0.32, 1.85, -0.1], seg: [6, 4], scale: [1, 0.65, 1], color: G.leafLt });
  C.blob(0.88, { bone: 'club', pos: [0, 3.12, 0], detail: 1, jitter: 0.2, seed: 11, scale: [1.0, 0.9, 1.1], color: G.earth });
  const roots = [[1, -0.3, 0.2], [-0.9, -0.2, 0.5], [0.3, -0.25, -1], [-0.4, 0.3, -0.9], [0.8, 0.55, 0.5], [-0.6, 0.7, 0.4], [0.1, 1, 0.1]];
  roots.forEach((r, i) => { const d = norm(r); C.spike(add([0, 3.12, 0], d, 0.62), d, 0.12, 0.8 - (i % 3) * 0.12, { bone: 'club', color: G.roots }); });
  C.blob(0.22, { bone: 'club', pos: [0.62, 3.0, 0.5], detail: 0, color: G.stone });
  C.blob(0.2, { bone: 'club', pos: [-0.55, 3.35, -0.5], detail: 0, color: G.stone });
  C.blob(0.18, { bone: 'club', pos: [-0.2, 2.6, 0.72], detail: 0, color: G.stone });
  C.blob(0.3, { bone: 'club', pos: [0.1, 3.85, 0.3], detail: 0, jitter: 0.2, color: G.moss });
}

// carry pose (club resting on the right shoulder) — the rest of every action track
const G_REST = {
  'spine.rx': 0.14, 'head.rx': -0.12, 'jaw.rx': 0.06,
  'armR.rx': -0.55, 'armR.rz': 0.3, 'foreR.rx': -1.9, 'club.rx': 1.25, 'club.rz': -0.1,
  'armL.rx': -0.08, 'armL.rz': 0.08, 'foreL.rx': -0.25,
};

const G_SLAM = track(GB, G_REST, [
  [0, 's', {}],
  // grab the trunk with both hands, crouch (anticipation)
  [0.26, 's', { 'hips.my': -0.2, 'spine.rx': 0.32, 'head.rx': -0.25, 'armR.rx': -0.75, 'foreR.rx': -1.2, 'club.rx': 1.35, 'armL.rx': -1.1, 'armL.rz': -0.45, 'foreL.rx': -1.0, 'legL.rx': -0.2, 'legR.rx': -0.2, 'kneeL.rx': 0.35, 'kneeR.rx': 0.35 }],
  // apex: overhead, leaning back, on his toes (reached as the telegraph fills)
  [0.88, 'out', { 'hips.my': 0.22, 'spine.rx': -0.36, 'head.rx': 0.12, 'jaw.rx': 0.3, 'armR.rx': -2.75, 'armR.rz': 0.72, 'foreR.rx': -0.55, 'club.rx': 2.3, 'club.rz': -0.3, 'armL.rx': -2.75, 'armL.rz': -0.72, 'foreL.rx': -0.55, 'legL.rx': 0.05, 'legR.rx': 0.05, 'kneeL.rx': 0.18, 'kneeR.rx': 0.18 }],
  // crash (lands exactly at the end of the 1.0 s telegraph)
  [1.0, 'in', { 'hips.my': -0.42, 'spine.rx': 0.62, 'head.rx': -0.45, 'jaw.rx': 0.5, 'armR.rx': -1.45, 'armR.rz': 0.5, 'foreR.rx': -0.25, 'club.rx': 3.05, 'club.rz': -0.2, 'armL.rx': -1.5, 'armL.rz': -0.5, 'foreL.rx': -0.3, 'legL.rx': -0.45, 'legR.rx': 0.25, 'kneeL.rx': 0.55, 'kneeR.rx': 0.2 }],
  // hold the impact
  [1.28, 's', { 'hips.my': -0.38, 'spine.rx': 0.56, 'head.rx': -0.4, 'jaw.rx': 0.35, 'armR.rx': -1.4, 'armR.rz': 0.5, 'foreR.rx': -0.3, 'club.rx': 3.0, 'club.rz': -0.2, 'armL.rx': -1.45, 'armL.rz': -0.5, 'foreL.rx': -0.35, 'legL.rx': -0.45, 'legR.rx': 0.25, 'kneeL.rx': 0.55, 'kneeR.rx': 0.2 }],
  [1.4, 's', {}],
]);

const G_VOLLEY = track(GB, G_REST, [
  [0, 's', {}],
  [0.16, 's', { 'spine.rx': 0.45, 'head.rx': -0.35, 'hips.my': -0.1 }],
  // hunched, back to the sky, pods swelling
  [0.58, 's', { 'spine.rx': 0.78, 'head.rx': -0.7, 'jaw.rx': 0.15, 'hips.my': -0.25, 'armL.rx': -0.35, 'armL.rz': 0.45, 'foreL.rx': -0.7, 'armR.rz': -0.1, 'kneeL.rx': 0.25, 'kneeR.rx': 0.25, 'legL.rx': -0.15, 'legR.rx': -0.15 }],
  // pop: recoil upward, roar
  [0.66, 'in', { 'spine.rx': 0.3, 'head.rx': -0.35, 'jaw.rx': 0.55, 'hips.my': 0.05, 'armL.rx': -0.5, 'armL.rz': 0.75, 'foreL.rx': -0.4 }],
  [0.9, 's', {}],
]);

const G_SUMMON = track(GB, G_REST, [
  [0, 's', {}],
  // reach down to the horn on the left hip
  [0.24, 's', { 'spine.rx': 0.3, 'hips.rz': 0.08, 'armL.rx': 0.1, 'armL.rz': -0.18, 'foreL.rx': -0.55, 'head.rx': -0.1 }],
  // horn to the mouth, head back
  [0.48, 's', { 'spine.rx': -0.12, 'head.rx': -0.45, 'jaw.rx': 0.3, 'armL.rx': -1.6, 'armL.rz': -0.7, 'foreL.rx': -0.6 }],
  // blow
  [0.92, 's', { 'spine.rx': -0.22, 'head.rx': -0.58, 'jaw.rx': 0.35, 'armL.rx': -1.72, 'armL.rz': -0.7, 'foreL.rx': -0.6, 'hips.my': 0.06 }],
  [1.0, 's', {}],
]);

const G_DIE = track(GB, G_REST, [
  [0, 's', {}],
  [0.25, 'out', { 'spine.rx': -0.45, 'head.rx': -0.6, 'jaw.rx': 0.6, 'armR.rx': -1.6, 'armR.rz': -0.4, 'club.rx': 0.2, 'armL.rx': -2.2, 'armL.rz': 0.6, 'foreL.rx': -0.4 }],
  [1.0, 's', { 'spine.rx': 0.2, 'head.rx': 0.5, 'jaw.rx': 0.5, 'armR.rx': -0.2, 'armR.rz': -0.6, 'club.rx': 0.6, 'armL.rx': -0.4, 'armL.rz': 0.8, 'foreL.rx': -0.2, 'kneeL.rx': 0.6, 'kneeR.rx': 0.3 }],
]);
const G_REST_TRACK = track(GB, G_REST, [[0, 's', {}], [1, 's', {}]]);

// ---------------------------------------------------------------------------------------------
//  v5 raid poses. Authoring rules (the boss script, src/game/bosses/gorrak.js, relies on them):
//   * Telegraphed moves (backhand, slam) are authored for ONE canonical timeline and time-warped onto the
//     real lead time (warp()), so the blow always lands exactly when the telegraph resolves, however long
//     the first-use lead is. `dur` = lead + follow-through (slam 0.4, backhand 0.35).
//   * Held poses (downed, hornHold) never finish early: their last key is held until the action ends
//     (the boss passes dur = the real downed / cast length; weights() reads h.dur).
//   * leap and roar are authored in normalised time (k) so they stretch to any duration.
// ---------------------------------------------------------------------------------------------

// Canonical-time warp: wind-up [0, dur-follow] maps onto [0, tellKey]; follow-through plays in real time.
function warp(T, d, follow, tellKey) {
  const w = Math.max(0.2, d - follow);
  return T < w ? (T / w) * tellKey : tellKey + (T - w);
}

// BACKHAND — the cone. Right arm drawn wide and back, torso coiled, weight sunk; one sweeping
// horizontal arc across his front (arm ry carries it: rz lifts the arm level, ry swings it in the plane).
// Impact (tellKey) at 1.1.
const G_BACKHAND = track(GB, G_REST, [
  [0, 's', {}],
  // coil: club arm out wide and back, torso twisted to his right, legs planted wide, eyes on the target
  [0.55, 'out', { 'hips.my': -0.3, 'hips.ry': -0.3, 'spine.ry': -0.8, 'spine.rx': 0.18, 'head.ry': 0.7, 'head.rx': -0.1,
    'armR.rz': -1.4, 'armR.ry': -0.55, 'armR.rx': 0, 'foreR.rx': -0.1, 'club.rx': 0.25, 'club.rz': 3.1,
    'armL.rz': 0.85, 'armL.rx': -0.35, 'foreL.rx': -0.5, 'legL.rz': 0.14, 'legR.rz': -0.14, 'legL.rx': -0.28, 'legR.rx': -0.22, 'kneeL.rx': 0.5, 'kneeR.rx': 0.46 }],
  // hold the coil (pods and crown shiver in the additive layer), tension builds
  [1.02, 's', { 'hips.my': -0.38, 'hips.ry': -0.4, 'spine.ry': -0.95, 'spine.rx': 0.22, 'head.ry': 0.85, 'head.rx': -0.1,
    'armR.rz': -1.45, 'armR.ry': -0.8, 'armR.rx': 0, 'foreR.rx': -0.1, 'club.rx': 0.25, 'club.rz': 3.1,
    'armL.rz': 0.95, 'armL.rx': -0.35, 'foreL.rx': -0.5, 'legL.rz': 0.16, 'legR.rz': -0.16, 'legL.rx': -0.3, 'legR.rx': -0.24, 'kneeL.rx': 0.55, 'kneeR.rx': 0.5 }],
  // the sweep: whole body unwinds, the arm whips through (accelerates into the impact)
  [1.1, 'in', { 'hips.my': -0.2, 'hips.ry': 0.45, 'spine.ry': 0.75, 'spine.rx': 0.1, 'head.ry': -0.4, 'head.rx': -0.05, 'jaw.rx': 0.45,
    'armR.rz': -1.45, 'armR.ry': 1.7, 'armR.rx': 0, 'foreR.rx': -0.1, 'club.rx': 0.25, 'club.rz': 3.1,
    'armL.rz': 0.5, 'armL.rx': -0.1, 'foreL.rx': -0.3, 'legL.rz': 0.12, 'legR.rz': -0.1, 'legL.rx': -0.2, 'legR.rx': 0.1, 'kneeL.rx': 0.3, 'kneeR.rx': 0.35 }],
  // follow-through, overshoot and settle
  [1.28, 's', { 'hips.my': -0.18, 'hips.ry': 0.55, 'spine.ry': 0.9, 'head.ry': -0.5, 'armR.rz': -1.4, 'armR.ry': 2.05, 'foreR.rx': -0.1, 'club.rx': 0.25, 'club.rz': 3.1, 'armL.rz': 0.4, 'kneeL.rx': 0.3, 'kneeR.rx': 0.3, 'legR.rx': 0.1 }],
  [1.5, 's', {}],
]);

// DOWNED — the Poise break. Knocked back, then collapses onto his right knee leaning on the planted club,
// head bowed, left forearm on the raised knee; pods wilt. Held for any duration (last key is held).
const SLUMP = {
  // hips dropped to the ground, one knee down, torso pitched ~58° and twisted, head hanging, club dropped flat,
  // free hand planted, crown tilted — a silhouette that reads "hit him NOW" from the iso camera
  'hips.my': -1.0, 'hips.rx': 0.2, 'hips.rz': 0.1, 'spine.rx': 1.0, 'spine.ry': 0.42, 'spine.rz': -0.12,
  'head.rx': 0.75, 'head.ry': -0.3, 'head.rz': 0.15, 'jaw.rx': 0.3, 'crown.rz': 0.35,
  'legR.rx': 0.25, 'legR.rz': -0.15, 'kneeR.rx': 1.85, 'legL.rx': -1.35, 'legL.rz': 0.18, 'kneeL.rx': 1.35,
  'armR.rx': 0.1, 'armR.rz': -0.7, 'foreR.rx': -0.2, 'club.rx': 0, 'club.rz': -1.45,
  'armL.rx': -1.0, 'armL.rz': 0.2, 'foreL.rx': -0.1,
};
const G_DOWNED = track(GB, G_REST, [
  [0, 's', {}],
  // the hit: head snaps back, arms fling wide, weight reels backwards
  [0.15, 'out', { 'hips.my': 0.02, 'hips.rx': -0.1, 'spine.rx': -0.55, 'head.rx': 0.4, 'jaw.rx': 0.55, 'armR.rx': -0.35, 'armR.rz': -1.0, 'foreR.rx': -0.3, 'club.rx': 0.5,
    'armL.rx': -0.3, 'armL.rz': 1.0, 'foreL.rx': -0.3, 'legL.rx': 0.25, 'legR.rx': 0.35, 'kneeL.rx': 0.2, 'kneeR.rx': 0.2 }],
  // drop towards the knee
  [0.5, 'in', { ...SLUMP, 'hips.my': -0.55, 'spine.rx': 0.5, 'head.rx': 0.2, 'kneeR.rx': 1.2, 'legL.rx': -0.8, 'kneeL.rx': 0.7 }],
  // settle (hold)
  [0.72, 'out', { ...SLUMP, 'hips.my': -0.82, 'spine.rx': 0.7 }],
  [0.95, 's', SLUMP],
]);

// RECOVER — gets up out of the slump with a snort, ending on the carry pose (0.6 s).
const G_RECOVER = track(GB, G_REST, [
  [0, 's', SLUMP],
  [0.28, 's', { 'hips.my': -0.35, 'spine.rx': 0.35, 'head.rx': -0.35, 'jaw.rx': 0.5, 'legL.rx': -0.55, 'kneeL.rx': 0.7, 'legR.rx': -0.2, 'kneeR.rx': 0.8, 'armR.rx': -0.8, 'foreR.rx': -1.4, 'club.rx': 0.9, 'armL.rx': -0.4, 'foreL.rx': -0.5 }],
  [0.6, 's', {}],
]);

// HORN HOLD — Break Check "War Horn". Reach to the hip, horn to the mouth, then blow and keep blowing
// (the last key is held for the whole cast; breaths pulse in the additive layer, the glow builds from the cast).
const HORN = {
  'spine.rx': -0.2, 'hips.my': 0.04, 'head.rx': -0.58, 'jaw.rx': 0.35, 'armL.rx': -1.72, 'armL.rz': -0.7, 'foreL.rx': -0.6,
  'legL.rz': 0.08, 'legR.rz': -0.08, 'armR.rx': -0.7, 'armR.rz': 0.25,
};
const G_HORNHOLD = track(GB, G_REST, [
  [0, 's', {}],
  [0.3, 's', { 'spine.rx': 0.3, 'hips.rz': 0.08, 'armL.rx': 0.1, 'armL.rz': -0.18, 'foreL.rx': -0.55, 'head.rx': -0.1 }],
  [0.65, 's', { ...HORN, 'spine.rx': -0.12, 'head.rx': -0.45, 'jaw.rx': 0.3, 'armL.rx': -1.6 }],
  [0.95, 'out', HORN],
]);

// LEAP — normalised: crouch (0-0.22) → launch + airborne (0.22-0.86) → crash landing (0.86-1). The boss script
// lifts the rig (h.lift) along a parabola during the airborne part. Lands in the slam-crash pose.
const G_LEAP = track(GB, G_REST, [
  [0, 's', {}],
  // coil: deep crouch, arms back, head down
  [0.2, 's', { 'hips.my': -0.5, 'spine.rx': 0.6, 'head.rx': -0.1, 'armL.rx': 0.5, 'armL.rz': 0.3, 'foreL.rx': -0.3, 'armR.rx': 0.2, 'foreR.rx': -1.5, 'club.rx': 1.0,
    'legL.rx': -0.55, 'legR.rx': -0.55, 'kneeL.rx': 1.0, 'kneeR.rx': 1.0 }],
  // launch: whole body stretches, both arms thrown up, roar
  [0.32, 'out', { 'hips.my': 0.3, 'spine.rx': -0.35, 'head.rx': 0.1, 'jaw.rx': 0.5, 'armL.rx': -2.8, 'armL.rz': -0.5, 'foreL.rx': -0.4, 'armR.rx': -2.8, 'armR.rz': 0.5, 'foreR.rx': -0.5, 'club.rx': 1.8,
    'legL.rx': 0.25, 'legR.rx': 0.3, 'kneeL.rx': 0.1, 'kneeR.rx': 0.1 }],
  // apex: knees tucked, club overhead (the slam apex carried through the air)
  [0.58, 's', { 'hips.my': 0.15, 'spine.rx': -0.2, 'head.rx': 0.05, 'jaw.rx': 0.3, 'armL.rx': -2.75, 'armL.rz': -0.72, 'foreL.rx': -0.55, 'armR.rx': -2.75, 'armR.rz': 0.72, 'foreR.rx': -0.55, 'club.rx': 2.3, 'club.rz': -0.3,
    'legL.rx': -1.0, 'legR.rx': -0.8, 'kneeL.rx': 1.3, 'kneeR.rx': 1.1 }],
  // falling: club comes down, legs reach for the ground
  [0.86, 'in', { 'hips.my': -0.1, 'spine.rx': 0.5, 'head.rx': -0.3, 'jaw.rx': 0.4, 'armL.rx': -1.6, 'armL.rz': -0.5, 'foreL.rx': -0.3, 'armR.rx': -1.6, 'armR.rz': 0.5, 'foreR.rx': -0.3, 'club.rx': 3.0, 'club.rz': -0.2,
    'legL.rx': -0.2, 'legR.rx': -0.1, 'kneeL.rx': 0.3, 'kneeR.rx': 0.3 }],
  // landing crash (the slam crash pose)
  [0.94, 'out', { 'hips.my': -0.45, 'spine.rx': 0.65, 'head.rx': -0.45, 'jaw.rx': 0.5, 'armR.rx': -1.45, 'armR.rz': 0.5, 'foreR.rx': -0.25, 'club.rx': 3.05, 'club.rz': -0.2, 'armL.rx': -1.5, 'armL.rz': -0.5, 'foreL.rx': -0.3,
    'legL.rx': -0.5, 'legR.rx': -0.35, 'kneeL.rx': 0.6, 'kneeR.rx': 0.5 }],
  [1, 's', { 'hips.my': -0.4, 'spine.rx': 0.6, 'head.rx': -0.4, 'jaw.rx': 0.35, 'armR.rx': -1.4, 'armR.rz': 0.5, 'foreR.rx': -0.3, 'club.rx': 3.0, 'club.rz': -0.2, 'armL.rx': -1.45, 'armL.rz': -0.5, 'foreL.rx': -0.35,
    'legL.rx': -0.45, 'legR.rx': -0.3, 'kneeL.rx': 0.55, 'kneeR.rx': 0.45 }],
]);

// HURL — one-handed overhand tree throw with the LEFT arm (the club stays shouldered). The tree prop is
// positioned from the hornHand bone by the boss script while T < RELEASE; release at 0.56.
const G_HURL = track(GB, G_REST, [
  [0, 's', {}],
  // stoop, left hand to the ground (uprooting)
  [0.16, 'out', { 'hips.my': -0.28, 'spine.rx': 0.85, 'spine.ry': 0.25, 'head.rx': 0.05, 'armL.rx': 0.1, 'armL.rz': 0.35, 'foreL.rx': -0.15, 'legL.rx': -0.5, 'legR.rx': -0.4, 'kneeL.rx': 0.8, 'kneeR.rx': 0.7 }],
  // heave: stands up, tree hauled up and back over the shoulder, chest out, roar
  [0.38, 'out', { 'hips.my': 0.1, 'spine.rx': -0.5, 'spine.ry': 0.35, 'head.rx': 0.2, 'jaw.rx': 0.5, 'armL.rx': -2.55, 'armL.rz': 0.45, 'foreL.rx': -1.1, 'legL.rx': 0.05, 'legR.rx': -0.1, 'kneeL.rx': 0.2, 'kneeR.rx': 0.25 }],
  // release: whole body whips forward
  [0.56, 'in', { 'hips.my': -0.2, 'spine.rx': 0.62, 'spine.ry': -0.2, 'head.rx': -0.3, 'jaw.rx': 0.35, 'armL.rx': -0.55, 'armL.rz': 0.25, 'foreL.rx': -0.15, 'legL.rx': -0.4, 'legR.rx': 0.2, 'kneeL.rx': 0.5, 'kneeR.rx': 0.2 }],
  [0.9, 's', {}],
]);

// ROAR — normalised. Coil, then chest-out roar with both arms thrown wide and the club raised, held (shaking in
// the additive layer), then a short release. Used by King's Wrath and the phase gates.
const ROAR_HOLD = { 'hips.my': 0.06, 'spine.rx': -0.55, 'head.rx': 0.55, 'jaw.rx': 0.75, 'armR.rx': -2.4, 'armR.rz': -0.5, 'foreR.rx': -0.5, 'club.rx': 1.9, 'club.rz': -0.2,
  'armL.rx': -0.5, 'armL.rz': 1.15, 'foreL.rx': -0.4, 'legL.rz': 0.14, 'legR.rz': -0.14, 'legL.rx': 0.08, 'legR.rx': 0.08 };
const G_ROAR = track(GB, G_REST, [
  [0, 's', {}],
  [0.22, 's', { 'hips.my': -0.32, 'spine.rx': 0.55, 'head.rx': -0.3, 'jaw.rx': 0.1, 'armL.rx': 0.1, 'armL.rz': 0.4, 'legL.rx': -0.35, 'legR.rx': -0.35, 'kneeL.rx': 0.75, 'kneeR.rx': 0.75 }],
  [0.36, 'out', ROAR_HOLD],
  [0.84, 's', { ...ROAR_HOLD, 'spine.rx': -0.6, 'head.rx': 0.6 }],
  [1, 's', {}],
]);

// whole-torso breathing swell (poses above never scale the spine, so this is purely additive)
function swellSpine(B, v) { W.scale(B.spine, v, 1 + (v - 1) * 0.6, v); }

export const GORRAK_ACT = {
  // SLAM: crash lands at canonical 1.0 = the circle's resolve (dur = lead + 0.4)
  slam: { dur: 1.3, fi: 0.12, fo: 0.14, fn: (s, B, T) => play(G_SLAM, warp(T, s.h.dur > 0 ? s.h.dur : 1.3, 0.4, 1.0)) },
  backhand: { dur: 1.45, fi: 0.12, fo: 0.16, fn: (s, B, T) => play(G_BACKHAND, warp(T, s.h.dur > 0 ? s.h.dur : 1.45, 0.35, 1.1)) },
  volley: {
    dur: 0.9, fi: 0.1, fo: 0.14, fn: (s, B, T) => {
      play(G_VOLLEY, T);
      for (let i = 0; i < 6; i++) {
        const b = B[`pod${i}`];
        if (T < 0.6) { const sw = smooth((T - 0.05 - i * 0.04) / 0.5); W.scale(b, 1 + 0.5 * sw, 1 + 0.55 * sw, 1 + 0.5 * sw); }
        else { const r = smooth((T - 0.66) / 0.24); W.scale(b, 1.3 - 0.3 * r, 0.45 + 0.55 * r, 1.3 - 0.3 * r); }
      }
    },
  },
  summon: { dur: 1.0, fi: 0.1, fo: 0.1, fn: (s, B, T) => play(G_SUMMON, T) },
  hornHold: {
    dur: 5, fi: 0.2, fo: 0.3, fn: (s, B, T) => {
      play(G_HORNHOLD, T);
      // breaths: the chest swells, then the blast pushes out; pods pulse with the note
      const d = s.h.dur > 0 ? s.h.dur : 5;
      const ph = (T - 1.0) / 1.15, on = T > 1.0 && T < d - 0.3 ? ph - Math.floor(ph) : 0;
      const inh = smooth(on / 0.45) * (1 - smooth((on - 0.45) / 0.1)), blast = smooth((on - 0.5) / 0.12) * (1 - smooth((on - 0.7) / 0.3));
      W.rot(B.spine, -0.14 * inh + 0.05 * blast).rot(B.head, -0.08 * blast).move(B.hips, 0, 0.05 * inh - 0.03 * blast, 0);
      swellSpine(B, 1 + 0.08 * inh - 0.04 * blast);
      for (let i = 0; i < 6; i++) W.scale(B[`pod${i}`], 1 + 0.2 * blast + 0.08 * inh);
    },
  },
  downed: {
    dur: 4, fi: 0.05, fo: 0.2, fn: (s, B, T) => {
      play(G_DOWNED, T);
      // heavy breathing on the slump; pods wilt and sag
      // slow heaving breath (rib cage swells, shoulders rise) + a lazy sway; both fade in after the collapse
      const e = smooth((T - 0.6) / 0.5), br = sin(s.t * 2.1), br2 = 0.5 + 0.5 * br;
      W.rot(B.spine, (0.07 * br) * e, 0.04 * sin(s.t * 0.8) * e, 0.03 * sin(s.t * 0.55) * e).rot(B.head, 0.05 * sin(s.t * 1.3 + 1) * e, 0.06 * sin(s.t * 0.7) * e, 0);
      W.rot(B.hips, 0, 0, 0.03 * sin(s.t * 0.55 + 0.6) * e).rot(B.armL, 0.03 * br * e);
      W.scale(B.spine, 1 + 0.035 * br2 * e, 1 + 0.025 * br2 * e, 1 + 0.045 * br2 * e);
      const wilt = smooth(T / 0.6);
      for (let i = 0; i < 6; i++) W.scale(B[`pod${i}`], 1 - 0.35 * wilt, 1 - 0.5 * wilt, 1 - 0.35 * wilt);
    },
  },
  recover: {
    dur: 0.6, fi: 0.05, fo: 0.1, fn: (s, B, T) => {
      play(G_RECOVER, T);
      const r = smooth(T / 0.6);   // pods re-inflate
      for (let i = 0; i < 6; i++) W.scale(B[`pod${i}`], 0.65 + 0.35 * r, 0.5 + 0.5 * r, 0.65 + 0.35 * r);
    },
  },
  leap: { dur: 1.0, fi: 0.1, fo: 0.12, fn: (s, B, T, k) => play(G_LEAP, k) },
  hurl: { dur: 0.9, fi: 0.1, fo: 0.12, fn: (s, B, T) => play(G_HURL, T) },
  roar: {
    dur: 1.4, fi: 0.1, fo: 0.15, fn: (s, B, T, k) => {
      play(G_ROAR, k);
      // the roar shakes him; pods bulge hard
      const hold = smooth((k - 0.36) / 0.1) * (1 - smooth((k - 0.84) / 0.12));
      W.rot(B.spine, 0.03 * sin(s.t * 38) * hold).rot(B.head, 0.04 * sin(s.t * 33) * hold);
      for (let i = 0; i < 6; i++) W.scale(B[`pod${i}`], 1 + 0.45 * hold);
    },
  },
  die: { dur: 1.6, fi: 0.08, fo: 0, fn: (s, B, T, k) => play(G_DIE, k) },
};

function gorrakBase(s, B) {
  const m = s.move, w = s.walk, rage = s.h.rage ? 1 : 0;
  const tb = s.t * (1 + 0.6 * rage) + s.seed * TAU;
  const br = sin(tb * 1.6);
  hold(G_REST_TRACK);
  const sw = sin(w), cw = cos(w);
  W.rot(B.legL, sw * 0.34 * m - 0.03).rot(B.legR, -sw * 0.34 * m - 0.03);
  W.rot(B.kneeL, max(0, -cw) * 0.6 * m + 0.06).rot(B.kneeR, max(0, cw) * 0.6 * m + 0.06);
  W.move(B.hips, 0, -0.13 * abs(sw) * m + 0.03 * br * (1 - m) - 0.06 * rage, 0);
  W.rot(B.hips, 0, sw * 0.07 * m, sw * 0.07 * m);
  W.rot(B.spine, 0.1 * m + 0.14 * rage + 0.025 * br, -sw * 0.09 * m, -sw * 0.05 * m);
  W.rot(B.head, -0.06 * m - 0.12 * rage + 0.03 * sin(tb * 0.7), 0.14 * sin(tb * 0.37), 0);
  W.rot(B.jaw, 0.04 * br + 0.18 * rage * (0.5 + 0.5 * sin(tb * 2.3)));
  W.rot(B.armL, -sw * 0.3 * m + 0.03 * br, 0, 0.03 * br + 0.12 * rage);
  W.rot(B.foreL, -0.15 * m - 0.2 * rage);
  W.rot(B.armR, max(0, sw) * 0.06 * m, 0, 0);
  W.rot(B.club, 0.04 * sin(w * 2) * m, 0, 0);
}

export const gorrak = defineCreature({
  id: 'gorrak',
  stride: 2.8,
  blob: 2.3,
  deathTime: 1.6,
  bones: gorrakBones,
  build(pb) { buildGorrak(pb); },
  animate(P, s, B) {
    W.P = P; W.mask = null;
    if (s.dying > 0) {
      W.w = 1; play(G_DIE, s.dying);
      P.scale(B.hornHand, 0.001);
      return;
    }
    const wt = weights(s, GORRAK_ACT);
    W.w = wt.base; gorrakBase(s, B);
    runActions(s, B, GORRAK_ACT, wt);
    W.w = 1;
    // additive: breathing, crown sway, pod heartbeat, hit recoil
    const rage = s.h.rage ? 1 : 0;
    const tb = s.t * (1 + 0.6 * rage) + s.seed * TAU;
    const br = sin(tb * 1.6);
    P.scale(B.spine, 1 + 0.012 * br, 1 + 0.025 * br, 1 + 0.02 * br);
    P.rot(B.crown, 0.04 * sin(tb * 1.1) + 0.05 * sin(s.walk) * s.move, 0, 0.05 * sin(tb * 0.9) + 0.05 * sin(s.walk) * s.move);
    // h.podGrow (boss script, optional): per-pod 0..1 size — flung pods leave his back and slowly regrow
    const pg = s.h.podGrow;
    for (let i = 0; i < 6; i++) {
      const ph = sin(tb * (2.2 + rage) - i * 0.6);
      const pulse = ph > 0 ? ph * ph * ph * ph : 0;
      P.scale(B[`pod${i}`], (1 + 0.12 * pulse) * (pg ? Math.max(0.001, pg[i]) : 1));
    }
    if (s.hit > 0) P.rot(B.spine, -0.12 * s.hit).rot(B.head, -0.2 * s.hit);
    // horn swap: the hand horn appears while it is held (summon 0.24 s → 0.95 s; hornHold from 0.4 s to 0.1 s
    // before the end). `s.h.dur` is the real cast length for hornHold.
    let held = false;
    if (s.action === 'summon') held = s.k * 1.0 > 0.24 && s.k * 1.0 < 0.95;
    else if (s.action === 'hornHold') { const d = s.h.dur > 0 ? s.h.dur : 5; held = s.k * d > 0.4 && s.k * d < d - 0.1; }
    if (held) P.scale(B.horn, 0.001); else P.scale(B.hornHand, 0.001);
  },
});
