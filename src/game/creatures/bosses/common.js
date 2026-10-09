// Shared build and animation helpers for the boss creature rigs (split out of bossModels.js; no behaviour change).
import * as THREE from 'three';
import { clamp01, smooth } from '../rig.js';

export const PI = Math.PI;
export const sin = Math.sin;
export const cos = Math.cos;
export const abs = Math.abs;
export const max = Math.max;
const min = Math.min;

// ---------------------------------------------------------------- build helpers (load time only)

const UP = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _qa = new THREE.Quaternion();
const _va = new THREE.Vector3();

const qEuler = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
export const qAim = (d) => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(d[0], d[1], d[2]).normalize());
export const eul = (q) => { _e.setFromQuaternion(q, 'XYZ'); return [_e.x, _e.y, _e.z]; };
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// A local coordinate frame over a PartBuilder: parts are given in frame coordinates.
export class Frame {
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
export function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + r * cos(a), cy + r * sin(a)]); }
  return out;
}

export function boneMap(bones) { const m = {}; bones.forEach((b, i) => { m[b.name] = i; }); return m; }

// ---------------------------------------------------------------- animation helpers (per frame, no allocation)

// Weighted pose writer: every write is scaled by w (and an optional per-bone mask).
export const W = {
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
export function track(Bm, rest, keys) {
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

export function play(tr, T) {
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
export function hold(tr, row = 0) {
  const r = tr.rows[row], ch = tr.ch;
  for (let c = 0; c < ch.length; c++) W.axis(ch[c][0], ch[c][1], ch[c][2], r[c]);
}

// Action weights. ACT[name] = { dur, fi (fade-in s), fo (fade-out s, 0 = holds to the end), fn(s, B, T, k) }.
const _wt = { base: 1, a: 0, p: 0 };
export function weights(s, ACT) {
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

export function runActions(s, B, ACT, wt) {
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
