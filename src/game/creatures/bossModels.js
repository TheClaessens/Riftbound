import * as THREE from 'three';
import { defineCreature, TAU, clamp01, smooth } from './rig.js';

// =====================================================================================
//  BOSS CREATURES  (design/research/03-creature-art.md §4.7, §5.7, §6.7 · design/ART.md)
//    hollowWarden → Gorrak, the Troll King      (club on the shoulder, antler crown, spore pods)
//    vashkar      → Vashkar, the Ashen Warchief (skull pauldrons, twin banners, molten greataxe)
//    riftHeart    → Aurelith, the Prism Dragon  (four legs, wings, ward-tinted prism crystals)
//
//  Animation model. Every boss pose is a crossfade of
//    base     : idle / locomotion (+ the resting "carry" of the weapon)
//    action   : h.action at h.k (0..1 over the action's duration; bosses.js drives it, see ACT tables)
//    previous : h.prevAction frozen at h.prevK, fading out with h.blend (1 → 0) when an action
//               interrupts / chains into another one (bosses.js sets these)
//  Action poses are absolute keyframe tracks (relative to the authored rest pose), so the weights
//  always sum to 1 and every transition is continuous. Small additive layers (breathing, hit
//  recoil, pod heartbeat, cloth sway) go on top.
//  Extra handle fields read here: h.rage (phase 2, 0/1), h.dur (duration override for k),
//  h.flapK (dragon hover layer 0..1, or < 0 when idle).
// =====================================================================================

const PI = Math.PI;
const sin = Math.sin;
const cos = Math.cos;
const abs = Math.abs;
const max = Math.max;
const min = Math.min;

// ---------------------------------------------------------------- build helpers (load time only)

const UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _qa = new THREE.Quaternion();
const _va = new THREE.Vector3();

const qEuler = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
const qAim = (d) => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(d[0], d[1], d[2]).normalize());
const eul = (q) => { _e.setFromQuaternion(q, 'XYZ'); return [_e.x, _e.y, _e.z]; };
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// A local coordinate frame over a PartBuilder: parts are given in frame coordinates.
class Frame {
  constructor(pb, pos = [0, 0, 0], q = new THREE.Quaternion(), bone = undefined) {
    this.pb = pb;
    this.p = v3(pos);
    this.q = Array.isArray(q) ? qEuler(q) : q.clone();
    this.bone = bone;
  }
  sub(pos, q = [0, 0, 0], bone = this.bone) {
    const p = v3(pos).applyQuaternion(this.q).add(this.p);
    return new Frame(this.pb, [p.x, p.y, p.z], this.q.clone().multiply(Array.isArray(q) ? qEuler(q) : q), bone);
  }
  pt(a) { const p = v3(a).applyQuaternion(this.q).add(this.p); return [p.x, p.y, p.z]; }
  x(o) {
    const p = _va.fromArray(o.pos ?? [0, 0, 0]).applyQuaternion(this.q).add(this.p);
    const r = o.rot ?? [0, 0, 0];
    _qa.setFromEuler(_e.set(r[0], r[1], r[2]));
    const q = this.q.clone().multiply(_qa);
    return { bone: this.bone, ...o, pos: [p.x, p.y, p.z], rot: eul(q) };
  }
  box(w, h, d, o = {}) { this.pb.box(w, h, d, this.x(o)); return this; }
  sphere(r, o = {}) { this.pb.sphere(r, this.x(o)); return this; }
  blob(r, o = {}) { this.pb.blob(r, this.x(o)); return this; }
  cone(r, h, o = {}) { this.pb.cone(r, h, this.x(o)); return this; }
  cyl(rt, rb, h, o = {}) { this.pb.cyl(rt, rb, h, this.x(o)); return this; }
  capsule(r, len, o = {}) { this.pb.capsule(r, len, this.x(o)); return this; }
  lathe(pts, o = {}) { this.pb.lathe(pts, this.x(o)); return this; }
  extrude(pts, depth, o = {}) { this.pb.extrude(pts, depth, this.x(o)); return this; }
  torus(r, tube, o = {}) { this.pb.torus(r, tube, this.x(o)); return this; }
  oct(r, o = {}) { this.pb.geo(new THREE.OctahedronGeometry(r), this.x(o)); return this; }
  // Tapered cylinder from a (radius r0) to b (radius r1).
  seg(a, b, r0, r1, o = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    return this.cyl(r1, r0, len, { radial: 7, ...o, pos: add(a, d, 0.5), rot: eul(qAim(d)) });
  }
  // Capsule spanning a → b (round ends sit on the points).
  cap(a, b, r, o = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.max(0.01, Math.hypot(d[0], d[1], d[2]) - r * 0.6);
    return this.capsule(r, len, { radial: 7, cap: 2, ...o, pos: add(a, d, 0.5), rot: eul(qAim(d)) });
  }
  // Cone whose base centre is at `base`, pointing along dir.
  spike(base, dir, r, h, o = {}) {
    const d = norm(dir);
    return this.cone(r, h, { radial: 5, ...o, pos: add(base, d, h / 2), rot: eul(qAim(d)) });
  }
  // Elongated octahedron crystal centred at c pointing along dir (total length h).
  crystal(c, dir, r, h, o = {}) {
    return this.oct(r, { ...o, pos: c, rot: eul(qAim(dir)), scale: [1, h / (2 * r), 0.8] });
  }
}

// Arc polyline (centre cx, cy · radius r · angles a0 → a1 · n steps).
function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + r * cos(a), cy + r * sin(a)]); }
  return out;
}

function boneMap(bones) { const m = {}; bones.forEach((b, i) => { m[b.name] = i; }); return m; }

// ---------------------------------------------------------------- animation helpers (per frame, no allocation)

// Weighted pose writer: every write is scaled by w (and an optional per-bone mask).
const W = {
  P: null, w: 1, mask: null,
  f(b) { return this.mask ? this.w * this.mask[b] : this.w; },
  rot(b, x = 0, y = 0, z = 0) { const w = this.f(b); if (w) this.P.rot(b, x * w, y * w, z * w); return this; },
  move(b, x = 0, y = 0, z = 0) { const w = this.f(b); if (w) this.P.move(b, x * w, y * w, z * w); return this; },
  scale(b, x = 1, y = x, z = x) { const w = this.f(b); if (w) this.P.scale(b, 1 + (x - 1) * w, 1 + (y - 1) * w, 1 + (z - 1) * w); return this; },
  axis(b, type, a, v) {
    const w = this.f(b) * v;
    if (!w) return;
    if (type === 'r') this.P.rot(b, a === 0 ? w : 0, a === 1 ? w : 0, a === 2 ? w : 0);
    else this.P.move(b, a === 0 ? w : 0, a === 1 ? w : 0, a === 2 ? w : 0);
  },
};

// Keyframe track. keys: [[time, ease, {chan: value}], ...] — values fall back to `rest` (the carry pose).
// chan = 'bone.rx' | 'bone.ry' | 'bone.rz' | 'bone.mx' | 'bone.my' | 'bone.mz'.
// ease (for the segment that ENDS at that key): 's' smooth (default) · 'in' accelerate · 'out' decelerate · 'lin'.
function track(Bm, rest, keys) {
  const names = new Set(Object.keys(rest));
  for (const k of keys) for (const n of Object.keys(k[2])) names.add(n);
  const list = [...names];
  const ch = list.map((n) => {
    const [b, c] = n.split('.');
    if (Bm[b] === undefined) throw new Error(`track: unknown bone ${b}`);
    return [Bm[b], c[0], 'xyz'.indexOf(c[1])];
  });
  const rows = keys.map((k) => list.map((n) => (k[2][n] ?? rest[n] ?? 0)));
  return { t: keys.map((k) => k[0]), e: keys.map((k) => k[1]), ch, rows };
}

function play(tr, T) {
  const t = tr.t, n = t.length;
  let i = 0;
  while (i < n - 2 && T >= t[i + 1]) i++;
  let u = clamp01((T - t[i]) / Math.max(1e-4, t[i + 1] - t[i]));
  const e = tr.e[i + 1];
  u = e === 'in' ? u * u * u : e === 'out' ? 1 - (1 - u) * (1 - u) : e === 'lin' ? u : u * u * (3 - 2 * u);
  const a = tr.rows[i], b = tr.rows[i + 1], ch = tr.ch;
  for (let c = 0; c < ch.length; c++) W.axis(ch[c][0], ch[c][1], ch[c][2], a[c] + (b[c] - a[c]) * u);
}

// Static pose (one row) applied through W.
function hold(tr, row = 0) {
  const r = tr.rows[row], ch = tr.ch;
  for (let c = 0; c < ch.length; c++) W.axis(ch[c][0], ch[c][1], ch[c][2], r[c]);
}

// Action weights. ACT[name] = { dur, fi (fade-in s), fo (fade-out s, 0 = holds to the end), fn(s, B, T, k) }.
const _wt = { base: 1, a: 0, p: 0 };
function weights(s, ACT) {
  const h = s.h;
  let wa = 0, wp = 0;
  const a = s.action ? ACT[s.action] : null;
  if (a) {
    const d = h.dur && h.dur > 0 ? h.dur : a.dur, T = s.k * d;
    wa = (a.fi > 0 ? smooth(T / a.fi) : 1) * (a.fo > 0 ? smooth((d - T) / a.fo) : 1);
  }
  const pa = h.prevAction ? ACT[h.prevAction] : null;
  const bl = pa ? clamp01(h.blend ?? 0) : 0;
  if (bl > 0) {
    const d = h.prevDur && h.prevDur > 0 ? h.prevDur : pa.dur, T = (h.prevK ?? 0) * d;
    wp = bl * (pa.fo > 0 ? smooth((d - T) / pa.fo) : 1);
  }
  const sum = wa + wp;
  if (sum > 1) { wa /= sum; wp /= sum; }
  _wt.base = Math.max(0, 1 - wa - wp); _wt.a = wa; _wt.p = wp;
  return _wt;
}

function runActions(s, B, ACT, wt) {
  const h = s.h;
  if (wt.p > 0) {
    const pa = ACT[h.prevAction];
    const d = h.prevDur && h.prevDur > 0 ? h.prevDur : pa.dur;
    W.w = wt.p; pa.fn(s, B, (h.prevK ?? 0) * d, h.prevK ?? 0);
  }
  if (wt.a > 0) {
    const a = ACT[s.action];
    const d = h.dur && h.dur > 0 ? h.dur : a.dur;
    W.w = wt.a; a.fn(s, B, s.k * d, s.k);
  }
}

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

const GORRAK_ACT = {
  slam: { dur: 1.4, fi: 0.12, fo: 0.14, fn: (s, B, T) => play(G_SLAM, T) },
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
    for (let i = 0; i < 6; i++) {
      const ph = sin(tb * (2.2 + rage) - i * 0.6);
      const pulse = ph > 0 ? ph * ph * ph * ph : 0;
      P.scale(B[`pod${i}`], 1 + 0.12 * pulse);
    }
    if (s.hit > 0) P.rot(B.spine, -0.12 * s.hit).rot(B.head, -0.2 * s.hit);
    // horn swap: the hand horn appears while it is held (summon 0.24 s → 0.95 s)
    const held = s.action === 'summon' && s.k * 1.0 > 0.24 && s.k * 1.0 < 0.95;
    if (held) P.scale(B.horn, 0.001); else P.scale(B.hornHand, 0.001);
  },
});

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

const VASHKAR_ACT = {
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
    if (rage && s.dying <= 0) {
      const f = 1 + 0.18 * sin(s.t * 17) + 0.1 * sin(s.t * 29);
      P.scale(B.fireL, 1, f, 1).scale(B.fireR, 1, 2 - f, 1);
    } else { P.scale(B.fireL, 0.001).scale(B.fireR, 0.001); }
  },
});

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
    F.seg([0.36 * s, 4.25, 3.0], [0.75 * s, 4.95, 2.3], 0.08, 0.04, { bone: 'head', color: 0xffc93a, eliteOnly: true });
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

const AURELITH_ACT = {
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
function aurelithHover(s, B, T, wr) {
  const f = 7.5, ph = T * f;
  const lift = 1.05 * wr + 0.16 * sin(ph - PI / 2) * wr;
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

export const BOSS_REGISTER = { hollowWarden: gorrak, vashkar, riftHeart: aurelith };
