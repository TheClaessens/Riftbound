import { defineCreature, clamp01, smooth, bump } from '../creatures/rig.js';

// =====================================================================================
//  HERO RIG LIBRARY (design/HEROES.md, design/research/09-hero-bible.md §4).
//
//  The four playable heroes are built on the SAME instanced creature rig as the monsters
//  (PartBuilder parts, vertex colours, top-lit gradient, Lambert, outline). Each class file
//  declares its own bones (bible appendix) and writes its own animate() from LAYERS:
//
//    export const pyromancerHero = defineHero({
//      id: 'heroPyromancer', bones: [...], stride: 1.95,
//      muzzle: { bone: 'focus', at: [x, y, z] },          // focus emitter (bolts / flashes leave here)
//      hand:   { bone: 'handL', at: [x, y, z] },          // off-hand palm (alternating casters)
//      emitters: { chimney: { bone: 'chimney', at: [...] } },   // any named world points for idle FX
//      gait: { A: 0.8, K: 1.1, bob: 0.06, lean: 0.2, arm: 0.65, hy: 0.12, focusArm: 0.5 },
//      build(pb, B) {...},
//      animate(L, s, B, H) {...},     // L = layer writer below; H = s.h.hero channels (always present)
//    });
//
//  Required core bones (names are fixed; pivots per class):
//    root hips spine chest head armL foreL handL armR foreR handR focus thighL shinL footL thighR shinR footR
//
//  LAYERS. animate() writes into a scratch buffer and the library flushes it once:
//    L.add(b, x, y, z)      add rotation                 L.mv(b, x, y, z)   add offset (m)
//    L.put(b, x, y, z, w)   blend rotation toward an ABSOLUTE local key pose by weight w
//    L.putM(b, x, y, z, w)  same for the offset          L.scl(b, x, y, z)  multiply scale
//    L.putS(b, x, y, z, w)  blend scale toward a key scale
//    L.get(b, axis)         read the current rotation (0 = x, 1 = y, 2 = z), e.g. for cloth following legs
//  Helpers below implement the shared layers (bible order): rest → idle → gait → aimTwist →
//  (class: stance / actions / dash) → hit → death/recall. Use keys() for the bible's key-pose tables:
//    const K_RAISE = pose({ armR: [-2.8, 0, -0.2], spine: [-0.3, 0, 0], 'hips.m': [0, 0.06, 0], 'root.s': [1, 1, 1] });
//    keys(L, B, K_RAISE, w, lowerW)    // lowerW scales hips/legs/root entries (0 while running: legs keep running)
//
//  CHANNELS (h.hero, written by HeroModel in heroes/index.js; the viewer fills the same object):
//    aimRel   aim yaw relative to the root (rad)          moveRel  move yaw relative to the root
//    psi      lower-body yaw (±0.7)  mu  local move angle in the hips frame  back  backpedal frame
//    moving   0..1 (= s.move)        sp  speed 0..1 (speed / 6.5)
//    hold     starter stance 0..1    shot  per-shot recoil 1 → 0 (τ 70 ms)    shotN  shot counter
//    casting  true while the root faces the aim for casting
//    act      '' | 'throw' | 'heavy' | 'nova' | 'channel' | 'dash' | 'arrive' | 'death' | 'victory' ;  k  0..1
//    dashN    dash counter         meter  class meter 0..1     armor  Frost Armor 0..3
//    fidget   0..1 idle flourish (0 = none)   fidgetN  counter   stomp  1 → 0 footfall squash
//    perfect  1 → 0 after a Perfect Dodge     standing  1 when not moving (for full-body keys)
// =====================================================================================

export const CORE_BONES = ['root', 'hips', 'spine', 'chest', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'focus', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const LOWER = new Set(['root', 'hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']);

export function newHeroState() {
  return {
    aimRel: 0, moveRel: 0, psi: 0, mu: 0, back: false, moving: 0, sp: 0,
    hold: 0, shot: 0, shotN: 0, casting: false,
    act: '', k: 0, dashN: 0, meter: 0, armor: 0,
    fidget: 0, fidgetN: 0, stomp: 0, perfect: 0, standing: 1,
  };
}

export function defineHero(spec) {
  for (const n of CORE_BONES) if (!spec.bones.some((b) => (b.name ?? b) === n)) throw new Error(`defineHero ${spec.id}: missing core bone "${n}"`);
  const viewerState = newHeroState();
  const def = defineCreature({
    blob: 0.6,
    gradient: [0.7, 1.08],
    height: 2.1,
    ...spec,
    deathTime: 1e9,                  // heroes play their own death (never the renderer's corpse topple)
    animate(P, s, B) {
      const H = s.h?.hero ?? viewerState;
      L.begin(def.boneCount);
      spec.animate(L, s, B, H);
      L.flush(P);
    },
  });
  def.isHero = true;
  def.muzzle = spec.muzzle;
  def.hand = spec.hand ?? spec.muzzle;
  def.emitters = spec.emitters ?? {};
  def.gaitParams = spec.gait;
  def.castHands = spec.castHands ?? 'R';     // 'R' focus hand only · 'alt' alternates R / L per shot · fn(shotN) → 'hand' | 'muzzle' | emitter name
  return def;
}

// ------------------------------------------------------------------ layer writer
const MAXB = 40, ST = 9;
const R = new Float32Array(MAXB * ST);
let NB = 0;
export const L = {
  begin(n) {
    NB = n;
    for (let b = 0; b < n; b++) { const o = b * ST; R[o] = R[o + 1] = R[o + 2] = R[o + 3] = R[o + 4] = R[o + 5] = 0; R[o + 6] = R[o + 7] = R[o + 8] = 1; }
  },
  add(b, x = 0, y = 0, z = 0) { const o = b * ST; R[o] += x; R[o + 1] += y; R[o + 2] += z; },
  mv(b, x = 0, y = 0, z = 0) { const o = b * ST + 3; R[o] += x; R[o + 1] += y; R[o + 2] += z; },
  scl(b, x = 1, y = x, z = x) { const o = b * ST + 6; R[o] *= x; R[o + 1] *= y; R[o + 2] *= z; },
  put(b, x, y, z, w) { if (w <= 0) return; const o = b * ST; R[o] += (x - R[o]) * w; R[o + 1] += (y - R[o + 1]) * w; R[o + 2] += (z - R[o + 2]) * w; },
  putM(b, x, y, z, w) { if (w <= 0) return; const o = b * ST + 3; R[o] += (x - R[o]) * w; R[o + 1] += (y - R[o + 1]) * w; R[o + 2] += (z - R[o + 2]) * w; },
  putS(b, x, y, z, w) { if (w <= 0) return; const o = b * ST + 6; R[o] += (x - R[o]) * w; R[o + 1] += (y - R[o + 1]) * w; R[o + 2] += (z - R[o + 2]) * w; },
  get(b, axis) { return R[b * ST + axis]; },
  flush(P) {
    for (let b = 0; b < NB; b++) {
      const o = b * ST;
      P.rot(b, R[o], R[o + 1], R[o + 2]);
      P.move(b, R[o + 3], R[o + 4], R[o + 5]);
      P.scale(b, R[o + 6], R[o + 7], R[o + 8]);
    }
  },
};

// ------------------------------------------------------------------ key poses
// pose({ boneName: [rx, ry, rz], 'bone.m': [mx, my, mz], 'bone.s': [sx, sy, sz] }) → compiled lazily per def.
export function pose(table) { return { table, cache: new Map() }; }

function compile(K, B) {
  const out = [];
  for (const key in K.table) {
    const [name, kind] = key.split('.');
    const b = B[name];
    if (b === undefined) throw new Error(`hero pose: unknown bone "${name}"`);
    const v = K.table[key];
    out.push({ b, kind: kind === 'm' ? 1 : kind === 's' ? 2 : 0, x: v[0], y: v[1], z: v[2], lower: LOWER.has(name), spine: name === 'spine' });
  }
  K.cache.set(B, out);
  return out;
}

// Blend toward a key pose. lowerW scales hips / legs / root entries (pass 0 while running so the
// legs keep running); the spine takes ×0.6 while running (bible §4.7).
export function keys(L_, B, K, w, lowerW = 1) {
  if (w <= 0) return;
  const list = K.cache.get(B) ?? compile(K, B);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    let ww = w;
    if (e.lower) ww *= lowerW;
    else if (e.spine) ww *= 0.6 + 0.4 * lowerW;
    if (ww <= 0) continue;
    if (e.kind === 0) L_.put(e.b, e.x, e.y, e.z, ww);
    else if (e.kind === 1) L_.putM(e.b, e.x, e.y, e.z, ww);
    else L_.putS(e.b, e.x, e.y, e.z, ww);
  }
}

// ADDITIVE key pose: adds table values × w (same lowerW / spine rules as keys()). Use it for TORSO
// entries (chest, spine, head yaw) so stances and actions don't erase the aim twist / gait; use keys()
// (absolute) for limbs. Pattern (pyromancer.js): one key = { put: pose(limbs), add: pose(torso deltas) }.
export function addKeys(L_, B, K, w, lowerW = 1) {
  if (w <= 0) return;
  const list = K.cache.get(B) ?? compile(K, B);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    let ww = w;
    if (e.lower) ww *= lowerW;
    else if (e.spine) ww *= 0.6 + 0.4 * lowerW;
    if (ww <= 0) continue;
    if (e.kind === 0) L_.add(e.b, e.x * ww, e.y * ww, e.z * ww);
    else if (e.kind === 1) L_.mv(e.b, e.x * ww, e.y * ww, e.z * ww);
    else L_.scl(e.b, 1 + (e.x - 1) * ww, 1 + (e.y - 1) * ww, 1 + (e.z - 1) * ww);
  }
}

// Two-key action envelope (raise → strike → hold → recover). Returns [w1, w2]:
// blend K1 with w1 then K2 with w2. t1 = time of K1, t2 = time of K2, th = end of the K2 hold.
const _W = [0, 0];
export function twoKey(k, t1, t2, th) {
  const rec = k <= th ? 1 : 1 - smooth((k - th) / Math.max(1e-3, 1 - th));
  _W[0] = smooth(k / t1) * rec;
  _W[1] = (k <= t1 ? 0 : smooth((k - t1) / Math.max(1e-3, t2 - t1))) * rec;
  return _W;
}

// ------------------------------------------------------------------ shared layers
export const REST = pose({ armL: [0, 0, 0.12], armR: [0, 0, -0.12], foreL: [-0.18, 0, 0], foreR: [-0.18, 0, 0], shinL: [0.06, 0, 0], shinR: [0.06, 0, 0], spine: [0.04, 0, 0], head: [-0.04, 0, 0] });

// Rest pose (absolute) + optional class additions (another pose()).
export function rest(L_, B, extra) {
  keys(L_, B, REST, 1);
  if (extra) {
    const list = extra.cache.get(B) ?? compile(extra, B);
    for (const e of list) {
      if (e.kind === 0) L_.add(e.b, e.x, e.y, e.z);
      else if (e.kind === 1) L_.mv(e.b, e.x, e.y, e.z);
      else L_.scl(e.b, e.x, e.y, e.z);
    }
  }
}

// Idle life: breathing, weight shift, head glance (fades out when moving / aiming).
// o: { a (breath amplitude), f (Hz·2π), sway (scale), cloth: [bone indices] }
export function idle(L_, s, B, H, o) {
  const t = s.t, still = 1 - H.moving;
  const br = Math.sin(t * o.f + s.seed * 6);
  L_.scl(B.chest, 1 + br * o.a * 0.4, 1 + br * o.a, 1 + br * o.a * 0.4);
  const sw = Math.sin(t * 0.8) * (o.sway ?? 1) * still;
  L_.add(B.hips, 0, 0, 0.03 * sw);
  L_.mv(B.hips, 0.015 * sw, 0, 0);
  L_.add(B.shinL, 0.05 * Math.max(0, sw), 0, 0);
  L_.add(B.shinR, 0.05 * Math.max(0, -sw), 0, 0);
  if (!H.casting) L_.add(B.head, 0, 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.93) * still * (1 - Math.min(1, Math.abs(H.aimRel))), 0);
  if (o.cloth) for (let i = 0; i < o.cloth.length; i++) L_.add(o.cloth[i], 0.04 * Math.sin(t * 2.1 + i * 0.6), 0, 0);
}

// Locomotion with strafe / backpedal built in (bible §4.4). G = def gait params.
// Writes hips yaw ψ, leg swing along μ, knees, feet, bob, roll, lean, pelvis twist, free-arm swing.
// freeArms: 'both' | 'L' (the right arm holds the focus: swings at G.focusArm)
export function gait(L_, s, B, H, G, freeArms = 'L') {
  const phi = s.walk, m = H.moving * (H.act === 'dash' ? 0 : 1), sp = H.sp;
  const fx = Math.cos(H.mu), fz = Math.sin(H.mu);
  const A = G.A * m * (0.55 + 0.45 * sp);
  const sn = Math.sin(phi), cs = Math.cos(phi);
  L_.add(B.hips, 0, H.psi, 0);
  L_.add(B.thighL, -A * sn * fx, 0, 0.7 * A * sn * fz);
  L_.add(B.thighR, A * sn * fx, 0, -0.7 * A * sn * fz);
  const kL = G.K * m * Math.pow(Math.max(0, cs), 1.3) + 0.08 * m;
  const kR = G.K * m * Math.pow(Math.max(0, -cs), 1.3) + 0.08 * m;
  L_.add(B.shinL, kL, 0, 0);
  L_.add(B.shinR, kR, 0, 0);
  L_.add(B.footL, -0.6 * (L_.get(B.thighL, 0) + kL) * m, 0, 0);
  L_.add(B.footR, -0.6 * (L_.get(B.thighR, 0) + kR) * m, 0, 0);
  L_.mv(B.hips, 0, G.bob * m * (Math.abs(cs) - 0.6), 0);
  L_.add(B.hips, 0, G.hy * m * sn * fx, 0.05 * m * sn - 0.1 * m * sp * fz);
  L_.add(B.chest, 0, -1.3 * G.hy * m * sn * fx, 0);
  L_.add(B.spine, G.lean * m * sp * (fx > 0 ? fx : 0.5 * fx), 0, 0);
  const sw = (G.arm ?? 0.5) * A * sn * fx;
  L_.add(B.armL, sw, 0, 0);
  L_.add(B.armR, -sw * (freeArms === 'both' ? 1 : (G.focusArm ?? 0.5)), 0, 0);
}

// Upper/lower split (bible §4.5): spine + chest counter-twist ψ so the chest stays on the root (= aim);
// when not casting the head and chest glance toward the aim; while casting, the chest catches up.
export function aimTwist(L_, s, B, H) {
  L_.add(B.spine, 0, -0.45 * H.psi, 0);
  L_.add(B.chest, 0, -0.55 * H.psi, 0);
  const a = H.aimRel;
  if (H.casting) L_.add(B.chest, 0, clampN(a, 0.6), 0);
  else { L_.add(B.head, 0, 0.6 * clampN(a, 0.9), 0); L_.add(B.chest, 0, 0.4 * clampN(a, 0.5), 0); }
}

// Cloth wind in the chest frame (bible §4.5): vb = wind from the front (0..1), vs = sideways (−1..1).
export const WIND = { vb: 0, vs: 0, back: false };
export function wind(H) {
  const c = Math.cos(H.moveRel), sn = Math.sin(H.moveRel);
  const m = H.moving * H.sp;
  WIND.vb = m * Math.max(0, c);
  WIND.vs = m * sn;
  WIND.back = H.moving > 0.3 && c < 0;
  return WIND;
}

// Generic cloth bone: back-swing with the wind, side-stream, flutter; children get ×0.6 + phase lag.
// side: 0 centre, 1 left cloth, -1 right cloth.
export function cloth(L_, s, B, b, H, { base = 0.12, gain = 1.0, side = 0, flutter = 0.08, i = 0, mult = 1, dash = 0.9 } = {}) {
  const W = wind(H);
  const dashW = H.act === 'dash' ? bump(H.k, -0.05, 1.05) * dash : 0;
  let rx = W.back ? 0.05 : base + gain * W.vb;
  rx = Math.max(-0.05, rx) + dashW;
  const fl = flutter * Math.sin(2 * s.walk - 0.6 * i) * (0.4 + H.moving) * (W.back ? 1.5 : 1) + 0.04 * Math.sin(s.t * 2.1 + i * 0.6);
  L_.add(b, rx * mult + fl, 0, -0.45 * W.vs * (side === 0 ? 1 : side) * mult);
}

// Starter cast stance + per-shot recoil helper: returns [stanceW, recoil] (bible §4.6).
const _SR = [0, 0];
export function stance(H) { _SR[0] = H.hold; _SR[1] = H.shot; return _SR; }

// Hit recoil (bible §4.10). Never breaks the stance.
export function hit(L_, s, B, clothBones) {
  const h = s.hit;
  if (h <= 0) return;
  L_.add(B.spine, -0.3 * h, 0, 0);
  L_.add(B.head, -0.25 * h, 0, 0);
  L_.mv(B.hips, 0, 0, -0.08 * h);
  L_.add(B.armL, 0, 0, 0.3 * h);
  L_.add(B.armR, 0, 0, -0.3 * h);
  if (clothBones) for (const b of clothBones) L_.add(b, 0.2 * h, 0, 0);
}

// Death common beats (bible §4.10): stagger 0–0.15, (class collapse 0.15–0.5), slump 0.5–0.75,
// Rift recall 0.75–1 (root squashes to nothing). Call AFTER the class collapse keys.
export function deathCommon(L_, B, k) {
  const st = bump(k, 0, 0.3);
  L_.put(B.spine, -0.4, 0, 0, st * 0.8);
  L_.add(B.head, -0.4 * st + 0.4 * smooth((k - 0.5) / 0.25), 0, 0);
  L_.mv(B.hips, 0, 0, -0.1 * st);
  L_.add(B.armL, 0, 0, 0.8 * st);
  L_.add(B.armR, 0, 0, -0.8 * st);
  const r = smooth((k - 0.75) / 0.25);
  if (r > 0) L_.scl(B.root, 1 + 0.15 * smooth(r * 3) - 0.95 * r, 1 - 0.95 * r, 1 + 0.15 * smooth(r * 3) - 0.95 * r);
}

// Footfall squash written by the controller (H.stomp 1 → 0 over 0.06 s).
export function stomp(L_, B, H, amount = 0.04) {
  if (H.stomp > 0) L_.scl(B.root, 1, 1 - amount * H.stomp, 1);
}

export const clampN = (v, a) => (v < -a ? -a : v > a ? a : v);
export { clamp01, smooth, bump };
