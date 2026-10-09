import * as THREE from 'three';
import { spr } from './fire.js';

// =====================================================================================
//  MIXED element VFX (bundle E: reactions + enemy statuses; design/VFX.md, bible 10 §4.4 / §4.7).
//  A reaction is the real collision of two elements of this world, so it is built from the two
//  parents' own languages (fire billows + storm ground arcs, frost chips + lemon-cored ice bolts,
//  frost glass + arcane violet, forge flames + a violet glyph...) and is louder than either, but
//  carries <= 0.6 s of bright content.
//
//  Registries (merged into the toolkit at load): PARTICLES / DEBRIS, all 'mixed*'.
//  Helpers (reactions.js / status.js):
//    mixTier(game)                     spam LOD 0 | 1 | 2 (bible §5.5: fx.heat + vfx.budget)
//    gate(game, key, rate, burst)      token bucket on VFX time: false = over budget (skip / go lite)
//    crowded(game, key, pos, r, win)   true if the same effect fired within r metres in the last win s
//                                      (merges repeated reactions at high Chain into one read)
//    mixDecal(game, kind, ...)         decal with its own cap (the 128 pool evicts the OLDEST: never a live blizzard)
//    earth(game)                       biome soil colour (dust, clods, kill puffs)
//    underStrand(game, pts, n, o)      a soft, wide, dark under-glow along a bolt's points (navy under-strand)
//    fuse(game, from, target, o)       an ember fuse flying a parabola onto a moving foe (Combust spread)
//    prismGlints(game, pos)            Chain >= 10: one prism glint per 5 Chain at the flash (cap 5)
//    orbitStar(game, name, x, y, z, r, a0, life, size)   one orbiting sprite (stun stars)
// =====================================================================================

export const MIX = {
  steamCore: 0xfffaf2, steam: 0xfff6ee, peach: 0xffd9c2, droplet: 0xe8f6ff,
  ice: 0x9ff3ff, navy: 0x1b3a5c, lemon: 0xffe45c, violet: 0xc08cff, ember: 0xff7a2a, core: 0xfff4d6, stun: 0xf4e8ff,
};
const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const ERODE_END = [[0, 0], [0.7, 0], [1, 1]];

// biome soil (act 0 Thornwood loam, 1 Barrens ochre, 2 Reach grey-teal): dust that sits on all three
const EARTH = [0x7a6648, 0xb39a74, 0x7f8a84];
const EARTH_SHADE = [0x4a3c2a, 0x7a6448, 0x4c5654];
export const earth = (game) => EARTH[Math.max(0, Math.min(2, game.act ?? 0))];

const dust = (i) => ({ layer: 'paint', cell: 'puff', life: [0.45, 0.65], size: [0.45, 0.7], spin: [-1, 1], speed: [0.4, 1.0], up: 0.4,
  gravity: -0.8, drag: 3, color: EARTH[i], shade: EARTH_SHADE[i], alpha: [[0, 0.8], [0.6, 0.6], [1, 0.4]], fill: 0.85, ink: 0.5,
  sizeCurve: [[0, 0.45], [0.35, 1], [1, 1.2]], erode: [[0, 0], [0.4, 0.08], [1, 1]] });

export const PARTICLES = {
  // ---------------------------------------------------------------- Steam Burst
  // superheated vapour billow: painted white core, peach shadow, alpha <= 0.6 (never hides a foe)
  mixedSteam: { layer: 'paint', cell: 'puff', life: [0.5, 0.65], size: [1.0, 1.3], spin: [-1.2, 1.2],
    color: [[0, 0xfffaf4], [0.6, 0xfff2ea], [1, 0xf2e6de]], shade: [[0, 0xffd2b8], [0.5, 0xf0c8b4], [1, 0xd8c6bc]],
    alpha: [[0, 0.5], [0.5, 0.46], [1, 0]], fill: 1, ink: 0.45, sizeCurve: [[0, 0.35], [0.3, 1], [1, 1.15]],
    erode: [[0, 0], [0.45, 0.06], [1, 1]] },
  // the same vapour rising and dissolving (dissipation beat)
  mixedVapour: { layer: 'paint', cell: 'puff', life: [0.8, 1.1], size: [0.9, 1.3], spin: [-0.6, 0.6], gravity: -1.6, drag: 1.4,
    color: [[0, 0xfff6ee], [1, 0xeee6e2]], shade: [[0, 0xe8cdbd], [1, 0xc8c0bc]],
    alpha: [[0, 0], [0.12, 0.42], [0.6, 0.32], [1, 0]], fill: 1, ink: 0.25, sizeCurve: [[0, 0.6], [1, 1.5]],
    erode: [[0, 0.1], [0.3, 0.05], [1, 1]] },
  // hiss flash: tiny white-hot glint (0.06 s)
  mixedSteamFlash: { layer: 'glow', cell: 'glint', life: [0.06, 0.08], size: [1.1, 1.3], spin: [-2, 2],
    color: [[0, 0xffffff, 1.9], [1, 0xffe8d8, 1.4]], fill: 0.3, ink: 0.4, alpha: [[0, 1], [1, 0.6]], sizeCurve: [[0, 0.6], [0.3, 1], [1, 0.5]] },
  // scalding droplets flung to r and falling (painted, navy-grey ink so they read on salt and water)
  mixedDroplet: { layer: 'paint', cell: 'droplet', life: [0.35, 0.45], size: [0.12, 0.15], stretch: 0.1,
    color: 0xeef8ff, shade: 0x9cc0dc, alpha: FADE, fill: 1, ink: 0.9, erode: [[0, 0], [0.8, 0], [1, 0.7]] },
  // ---------------------------------------------------------------- Shatter
  // violet-rimmed crack star at the body (1-3 frames)
  mixedSnapStar: { layer: 'glow', cell: 'star', life: [0.09, 0.12], size: [1.5, 1.7], spin: [-1, 1],
    color: [[0, 0xffffff, 2.2], [0.5, 0xe6d4ff, 1.8], [1, 0xc08cff, 1.4]], fill: 0.35, ink: 0.85, sizeCurve: [[0, 0.5], [0.25, 1], [1, 0.25]] },
  // radial crack on the ground (ground-flat streak whose length = the crack; painted rime + navy ink)
  mixedCrack: { layer: 'paint', cell: 'streak', orient: 'ground', life: [0.75, 0.85], size: [0.14, 0.16],
    color: 0xf0f8ff, shade: 0xb4d0e8, alpha: [[0, 0], [0.05, 0.85], [0.6, 0.7], [1, 0]], fill: 0.95, ink: 0.95,
    erode: [[0, 0], [0.55, 0.05], [1, 1]] },
  // ---------------------------------------------------------------- Combust
  // the foe's own flames rushing INTO it (arcane inward motion in fire colours, violet tips)
  mixedEmberIn: { layer: 'glow', cell: 'flame', orient: 'orbit', life: [0.07, 0.09], size: [0.32, 0.42], swirl: [3, 5], pull: [24, 30],
    rise: [-1, 0], color: [[0, 0xc08cff, 1.6], [0.4, 0xff9a3a, 1.9], [1, 0xfff4d6, 2.3]], alpha: [[0, 0.5], [0.3, 1], [1, 1]],
    fill: 0.35, ink: 0.7, erode: 0 },
  // ember fuse spark shed along a spreading fuse
  mixedFuseSpark: { layer: 'glow', cell: 'streak', life: [0.18, 0.26], size: [0.07, 0.09], stretch: 0.12,
    color: [[0, 0xfff0b0, 2.3], [0.5, 0xffa040, 1.9], [1, 0xa8441a, 1.2]], fill: 0.3, ink: 0.5, erode: ERODE_END },
  // ---------------------------------------------------------------- statuses
  // stun: little starlight sparks orbiting the head (#F4E8FF), constant radius
  mixedStunStar: { layer: 'glow', cell: 'star', orient: 'orbit', life: [0.45, 0.45], size: [0.26, 0.26], swirl: [6, 6], pull: [0, 0],
    rise: [0, 0], spin: [-3, 3], color: [[0, 0xffffff, 1.9], [1, 0xf4e8ff, 1.7]], alpha: [[0, 1], [1, 1]], fill: 0.35, ink: 0.85,
    sizeCurve: [[0, 0.8], [0.5, 1.1], [1, 0.8]], erode: 0 },
  // a pale ward / barrier pop (camera-facing ring that snaps outward)
  mixedPop: { layer: 'glow', cell: 'ring', life: [0.16, 0.2], size: [1.4, 1.6], color: [[0, 0xffffff, 1.8], [1, 0xc8a8ff, 1.3]],
    fill: 0.25, ink: 0.7, sizeCurve: [[0, 0.35], [1, 1.25]], alpha: [[0, 1], [1, 0]] },
  // kill dust (biome soil)
  mixedDust0: dust(0), mixedDust1: dust(1), mixedDust2: dust(2),
};

export const SHELLS = {};
export const RECIPES = {};

export const DEBRIS = {
  // Shatter: glassy shards with a violet rim (emissive cools fast: glow = live); short on the ground (no XP-gem read)
  mixedShard: { geo: 'shard', color: 0x9cc8e8, emis: [0xb67cff, 0.8], cool: 0.45, scale: [0.1, 0.2], stretch: 2.2, speed: [1.8, 3.0],
    up: 0.85, gravity: 14, bounce: 0.25, life: [0.5, 0.62] },
  // Overload knockback clods (tinted with the biome soil per call)
  mixedClod: { geo: 'chunk', color: 0x6a5a44, scale: [0.09, 0.16], speed: [6, 9], up: 0.7, gravity: 24, bounce: 0.3, life: [0.7, 1.0] },
  // kill gibs: small earthy chunks tinted toward the foe's colour
  mixedGib: { geo: 'chunk', color: 0x6a5a44, scale: [0.05, 0.09], speed: [1.6, 3.4], up: 1.1, gravity: 24, bounce: 0.3, life: [0.4, 0.6] },
  // a prism ward / barrier shell breaking: pale glass splinters (tinted per call)
  mixedWardShard: { geo: 'shard', color: 0xdfe6f0, scale: [0.05, 0.1], stretch: 2.2, speed: [3, 6], up: 0.9, gravity: 20, bounce: 0.3, life: [0.4, 0.6] },
};

// =====================================================================================
//  helpers
// =====================================================================================
const rnd = (a, b) => a + Math.random() * (b - a);

// spam LOD tier (bible §5.5): 0 calm, 1 busy, 2 extreme
export function mixTier(game) {
  const h = game.fx?.heat ?? 0;
  const b = game.vfx?.budget() ?? 1;
  return h > 240 || b < 0.45 ? 2 : h > 80 || b < 0.7 ? 1 : 0;
}

// token bucket keyed by name, refilled on VFX time (pauses with hit-stop like everything in vfx)
const BUCKETS = new Map();
export function gate(game, key, rate, burst = rate) {
  const now = game.vfx?.time ?? 0;
  let b = BUCKETS.get(key);
  if (!b) { b = { t: now, n: burst }; BUCKETS.set(key, b); }
  if (now < b.t) b.t = now;                       // vfx time restarted (new run)
  b.n = Math.min(burst, b.n + (now - b.t) * rate);
  b.t = now;
  if (b.n < 1) return false;
  b.n -= 1;
  return true;
}

// recent reaction spots per key (ring buffer); returns true when a same-key effect fired within r / win
const RECENT = new Map();
export function crowded(game, key, pos, r, win = 0.15) {
  const now = game.vfx?.time ?? 0;
  let L = RECENT.get(key);
  if (!L) { L = { x: new Float32Array(16), z: new Float32Array(16), t: new Float32Array(16).fill(-99), i: 0 }; RECENT.set(key, L); }
  let hit = false;
  for (let k = 0; k < 16; k++) {
    const dt = now - L.t[k];
    if (dt >= 0 && dt < win && (L.x[k] - pos.x) ** 2 + (L.z[k] - pos.z) ** 2 < r * r) { hit = true; break; }
  }
  if (!hit) { const i = L.i++ % 16; L.x[i] = pos.x; L.z[i] = pos.z; L.t[i] = now; }
  return hit;
}

// decal with its own cap (oldest ends first, fading in 0.2 s)
const _decals = [];
export function mixDecal(game, kind, pos, radius, life, opts, cap = 10) {
  const v = game.vfx;
  for (let i = _decals.length - 1; i >= 0; i--) if (!_decals[i].alive) _decals.splice(i, 1);
  const c = mixTier(game) === 2 ? Math.min(cap, 4) : cap;
  while (_decals.length >= c) _decals.shift().end(0.2);
  const h = v.decal(kind, pos, radius, life, opts);
  _decals.push(h);
  return h;
}

// ---------------------------------------------------------------- ticker (fuses) riding vfx.zones
const FUSES = [];
let TV = null;
const TICK = { update(dt) { tickFuses(dt); return FUSES.length > 0; }, end() {} };
function tick(vfx) {
  if (TV !== vfx || !vfx.zones.includes(TICK)) { TV = vfx; FUSES.length = 0; vfx.zones.push(TICK); }
}

// Ember fuse: a hot coal on a 0.25 s parabola from `from` onto `target` (an enemy: follows target.pos),
// shedding sparks and drawing a short ember ribbon; on arrival it ignites a flame puff on the foe.
export function fuse(game, from, target, o = {}) {
  const vfx = game.vfx;
  tick(vfx);
  const p = { x: from.x, y: from.y ?? 1, z: from.z };
  const f = {
    p, target, t: -(o.delay ?? 0), dur: o.dur ?? 0.25, fx: from.x, fy: from.y ?? 1, fz: from.z, arc: o.arc ?? 1.3,
    trail: null, acc: 0, ty: o.ty ?? 0.9,
  };
  FUSES.push(f);
  return f;
}
function tickFuses(dt) {
  const vfx = TV, game = vfx.game;
  for (let i = FUSES.length - 1; i >= 0; i--) {
    const f = FUSES[i];
    f.t += dt;
    if (f.t < 0) continue;
    if (!f.trail) f.trail = vfx.trail(f.p, { color: 0xff8a2a, width: 0.26, hdr: 1.7, segLen: 0.14, life: 0.6 });
    const k = Math.min(1, f.t / f.dur);
    const tp = f.target.pos ?? f.target;
    f.p.x = f.fx + (tp.x - f.fx) * k;
    f.p.z = f.fz + (tp.z - f.fz) * k;
    f.p.y = f.fy + (f.ty - f.fy) * k + f.arc * 4 * k * (1 - k);
    f.acc += dt * 40;
    while (f.acc >= 1) {
      f.acc -= 1;
      spr(vfx, 'mixedFuseSpark', f.p.x, f.p.y, f.p.z, rnd(-1.2, 1.2), rnd(0.5, 1.8), rnd(-1.2, 1.2), undefined, undefined, 6, 1.5);
    }
    if (k >= 1) {
      f.trail.stop();
      FUSES.splice(i, 1);
      // ignition: a flame puff licks up the foe + a white-hot pop
      spr(vfx, 'fireCore', f.p.x, f.ty, f.p.z, 0, 0, 0, 0.08, 0.7);
      for (let j = 0; j < 3; j++) {
        spr(vfx, 'fireLick', f.p.x + rnd(-0.2, 0.2), f.ty * 0.7, f.p.z + rnd(-0.2, 0.2), rnd(-0.4, 0.4), rnd(1, 2), rnd(-0.4, 0.4),
          rnd(0.35, 0.45), rnd(0.45, 0.6), -5, 2, undefined, undefined, j * 0.03);
      }
      void game;
    }
  }
}

// A soft wide under-glow strand along a bolt's points (style 0 = trail shader: no white core).
// Used as Superconduct's NAVY under-strand. pts: Float32Array of xyz, n points.
const _c = new THREE.Color();
export function underStrand(game, pts, n, o = {}) {
  const rib = game.vfx?.ribbons;
  if (!rib || n < 2) return null;
  const s = rib._alloc();                       // core request (REVIEW.md): public persistent-strand API
  s.style = 0; s.target = null; s.stopped = true;
  // a stopped style-0 strand retracts at 60 pts/s; start the counter negative so it HOLDS for `life` first
  s.width = o.width ?? 0.6; s.hdr = o.hdr ?? 1; s.life = 1; s.age = 0; s.retract = -(o.life ?? 0.12) * 60;
  _c.set(o.color ?? MIX.navy); s.r = _c.r; s.g = _c.g; s.b = _c.b;
  const m = Math.min(n, 16);
  for (let i = 0; i < m * 3; i++) s.pts[i] = pts[i];
  s.n = m;
  return s;
}

// Chain >= 10: one prism glint per 5 Chain (cap 5) around a flash point (bible §4.4 note)
const _pp = { x: 0, y: 0, z: 0 };
export function prismGlints(game, pos, y = 1, spread = 0.7) {
  const c = game.chain ?? 0;
  if (c < 10) return;
  const n = Math.min(5, Math.floor(c / 5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + Math.random();
    _pp.x = pos.x + Math.cos(a) * spread * rnd(0.5, 1); _pp.y = y + rnd(-0.2, 0.5); _pp.z = pos.z + Math.sin(a) * spread * rnd(0.5, 1);
    game.vfx.emit(i % 2 ? 'arcanePrismB' : 'arcanePrismA', _pp, { count: 1, scale: 1.3 });
  }
}

// One orbiting sprite (orbit presets): centre (x, y, z), radius r, start angle a0.
export function orbitStar(game, name, x, y, z, r, a0, life, size) {
  const vfx = game.vfx, p = vfx.preset(name), d = p.d;
  p.layer.spawn(x, y, z, r, a0, d.swirl?.[0] ?? 6, vfx.time, life ?? d.life[0], 0, 0, size ?? d.size[0], p.row, 0, 0, 0, p.packed);
  vfx.heat += 1;
}
