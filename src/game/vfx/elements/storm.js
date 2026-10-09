import * as THREE from 'three';
import { step } from '../textures.js';
import { CLOUD_STYLE } from '../clouds.js';

// =====================================================================================
//  STORM element VFX data + helpers (owned by the storm VFX implementer; see design/VFX.md).
//  Language (bible 10 §2.3): thin forked lines and 4-point stars over SLATE cloud; instant,
//  strobing, gone in <= 0.15 s; leaves only scorch flecks / fulgurite. Lemon #FFE45C, cored
//  #FFFBE0, never gold, never white-blue. Particles are stars / streaks that flicker (never slow
//  round dots, which would read as Act I pollen).
//
//  Exported helpers (also for the reactions bundle):
//    stormBolt(game, from, to, opts)   forked ribbon bolt with re-strikes + afterimage (pooled, 0 draws)
//    groundOut(game, pos, opts)        a bolt grounding: bounce sparks, ozone glints, scorch fleck, dust
//    skyPuff(game, pos, lead, opts)    slate puff trio that forms over pos; .strike(target) drops the bolt
//    groundArcs(game, pos, r, n, opts) n arcs crawling radially along the ground, ending exactly at r
//    later(game, delay, fn)            run fn after `delay` s of VFX time (visual stagger; never gameplay)
//    Strand                            a persistent, caller-driven ribbon strand (tails, tethers, cages)
//    moveDecal(handle, x, z)           re-position a live ground decal (following zones)
//    STORM                             the palette
//  All of it rides the toolkit's shared pools (ribbons / particles / decals / clouds / debris).
// =====================================================================================

export const STORM = {
  core: 0xfffbe0, hot: 0xfff3a0, body: 0xffe45c, edge: 0xc9b22e,
  slate: 0x2e3648, belly: 0x3d4b63, top: 0xe6ecf4, rain: 0x9fb4c8, ozone: 0xd8f0ff,
};

// Slate cloud styles (data added to the toolkit's cloud registry; prefixed 'storm').
CLOUD_STYLE.stormHead = { lit: 0x58647a, shadow: 0x262d3c, puffs: 14 };
CLOUD_STYLE.stormPuff = { lit: 0x5e6a80, shadow: 0x283040, puffs: 3 };

const FLICK = [[0, 1], [0.15, 0.35], [0.3, 1], [0.45, 0.2], [0.6, 1], [0.75, 0.3], [0.88, 0.9], [1, 0]];
const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const HOT = (k = 1) => [[0, STORM.core, 2.4 * k], [0.35, STORM.hot, 2.0 * k], [1, STORM.body, 1.6 * k]];

export const PARTICLES = {
  // bouncing / flung spark streaks (short, fast, flicker)
  stormSpark: { layer: 'glow', cell: 'streak', count: 6, life: [0.12, 0.22], size: [0.05, 0.08], stretch: 0.22, speed: [4, 9], up: 0.7,
    gravity: 12, drag: 2, color: HOT(), alpha: FLICK, fill: 0.35, ink: 0.7, erode: [[0, 0], [0.8, 0], [1, 0.8]] },
  // crackling ball-lightning head / cast flash: a 4-point star that lives 1-2 frames
  stormStar: { layer: 'glow', cell: 'star', count: 1, life: [0.035, 0.05], size: [0.36, 0.42], spin: [-4, 4],
    color: [[0, STORM.core, 2.4], [1, STORM.body, 1.8]], fill: 0.35, ink: 0.8, alpha: [[0, 1], [1, 0.7]], sizeCurve: [[0, 1], [1, 0.75]] },
  // the lemon body glow around a crackling head (a plus-sparkle, not a round dot)
  stormHalo: { layer: 'glow', cell: 'glint', count: 1, life: [0.035, 0.05], size: [0.46, 0.5], spin: [-2, 2],
    color: [[0, STORM.body, 1.9], [1, STORM.body, 1.6]], fill: 0.3, ink: 0.6, alpha: [[0, 0.85], [1, 0.6]] },
  // the hot bead at the heart of ball lightning (lives 1-2 frames, re-sized every frame: never a drifting dot)
  stormBead: { layer: 'glow', cell: 'dot', count: 1, life: [0.035, 0.05], size: [0.2, 0.24],
    color: [[0, STORM.core, 2.5], [1, STORM.hot, 2.1]], fill: 0.45, ink: 0.7 },
  // impact star (bigger, 0.1 s)
  stormFlash: { layer: 'glow', cell: 'star', count: 1, life: [0.08, 0.12], size: [0.7, 0.95], spin: [-3, 3],
    color: [[0, STORM.core, 2.4], [1, STORM.body, 1.7]], fill: 0.35, ink: 0.85, sizeCurve: [[0, 0.5], [0.25, 1], [1, 0.2]] },
  // ozone glint: tiny lemon-white twinkle that pops off a grounding
  stormGlint: { layer: 'glow', cell: 'glint', count: 3, life: [0.14, 0.26], size: [0.11, 0.15], speed: [0.6, 1.6], up: 1.2, drag: 3, gravity: -1,
    spread: 0.25, color: [[0, STORM.hot, 2.1], [1, STORM.body, 1.6]], alpha: FLICK, fill: 0.3, ink: 0.7, sizeCurve: [[0, 0.4], [0.2, 1], [1, 0.6]] },
  // tiny zig-zag arc sprites (staff crawl, wisp cage, static ticks)
  stormArc: { layer: 'glow', cell: 'zigzag', count: 1, life: [0.05, 0.08], size: [0.24, 0.36], spin: [-6, 6],
    color: [[0, STORM.core, 2.3], [1, STORM.body, 1.8]], fill: 0.3, ink: 0.9, alpha: [[0, 1], [0.5, 0.5], [1, 0.9]] },
  stormGroundArc: { layer: 'glow', cell: 'zigzag', orient: 'ground', count: 1, life: [0.06, 0.1], size: [0.3, 0.5],
    color: [[0, STORM.core, 2.2], [1, STORM.body, 1.7]], fill: 0.35, ink: 0.9, alpha: [[0, 1], [0.4, 0.4], [0.6, 1], [1, 0.6]] },
  // rising flicker star motes over a charged aura (fast & short: never pollen)
  stormMote: { layer: 'glow', cell: 'star', count: 1, life: [0.22, 0.34], size: [0.1, 0.14], speed: [0.6, 1.2], up: 2, gravity: -4, drag: 1,
    spin: [-6, 6], color: [[0, STORM.core, 2.1], [1, STORM.body, 1.6]], alpha: FLICK, fill: 0.3, ink: 0.7 },
  // fulgurite: ground-flat streak that glows lemon then chars to a dark glassy line
  stormFulgurite: { layer: 'glow', cell: 'streak', orient: 'ground', count: 1, life: [0.7, 0.9], size: [0.11, 0.14], stretch: 26,
    color: [[0, STORM.core, 2.2], [0.12, STORM.body, 1.8], [0.45, STORM.edge, 0.7], [0.7, 0x2a2418, 1], [1, 0x1e1a14, 1]],
    alpha: [[0, 1], [0.8, 1], [1, 0]], fill: [[0, 0.35], [0.4, 0.55], [1, 0.5]], ink: 0.5, erode: [[0, 0], [0.75, 0], [1, 0.9]] },
  // rain sheet streaks (painted slate-blue, slanted)
  stormRain: { layer: 'paint', cell: 'streak', life: [0.4, 0.48], size: [0.045, 0.06], stretch: 0.75,
    color: 0xb4c6d8, shade: 0x6f8296, alpha: FADE, fill: 0.7, ink: 0.65 },
  // sleet flecks in the rain (Blizzard parent): white chips with navy ink
  stormSleet: { layer: 'paint', cell: 'iceChip', life: [0.42, 0.5], size: [0.1, 0.14], stretch: 0.12, spin: [-6, 6],
    color: 0xf4f8ff, shade: 0xa9c2dc, alpha: FADE, fill: 0.95, ink: 0.9 },
  // splash ripple where a drop lands
  stormSplash: { layer: 'paint', cell: 'ring', orient: 'ground', life: [0.22, 0.3], size: [0.28, 0.42],
    color: 0xd2deea, shade: 0x9fb4c8, alpha: [[0, 0.8], [1, 0]], fill: 0.55, ink: 0.35, sizeCurve: [[0, 0.25], [1, 1]] },
  // little dust puff kicked up by a grounding (neutral earth so it sits on all three biomes)
  stormDust: { layer: 'paint', cell: 'puff', count: 2, life: [0.4, 0.6], size: [0.35, 0.55], speed: [0.8, 2], up: 0.5, drag: 3, gravity: -0.6,
    spin: [-1, 1], color: 0xa89a84, shade: 0x6e6252, alpha: [[0, 0.65], [1, 0.45]], fill: 0.8, ink: 0.45,
    sizeCurve: [[0, 0.5], [1, 1.3]], erode: [[0, 0], [0.4, 0.1], [1, 1]] },
  // plasma orb: fire-cored star (the 'contained sun')
  stormPlasma: { layer: 'glow', cell: 'star', count: 1, life: [0.035, 0.05], size: [0.6, 0.75], spin: [-3, 3],
    color: [[0, 0xffe8a0, 1.9], [1, 0xff8a2a, 1.5]], fill: 0.4, ink: 0.7 },
  // soot for the plasma detonation (fire's dark partner, prefixed so fire may retune theirs)
  stormSoot: { layer: 'paint', cell: 'puff', count: 6, life: [0.8, 1.2], size: [0.7, 1.1], spin: [-0.6, 0.6], gravity: -2.2, drag: 1.5,
    speed: [0.5, 1.6], up: 1.2, color: [[0, 0x4a3c37], [1, 0x7a706c]], shade: [[0, 0x2a1a14], [1, 0x4a3a34]],
    alpha: [[0, 0], [0.1, 0.5], [1, 0.4]], fill: 0.85, ink: 0.35, sizeCurve: [[0, 0.5], [1, 1.5]], erode: [[0, 0], [0.4, 0.1], [1, 1]] },
};

export const SHELLS = {
  // Thunderhead's rain curtain: a thin open cylinder of fast-falling streaks at exactly R
  stormRainCurtain: { geo: 'cylinder', mode: 'paint', tile: [56, 0.55], scroll: [0.1, 2.8], twist: 0.04, erode: 0.47, wobble: 0,
    fade: [0.6, 0.6], frontAlpha: 0.14,
    color: step([[0, 0x3d4b63], [0.08, 0x9fb4c8], [0.4, 0xd6e2ee]]), alpha: step([[0, 0.5], [0.08, 0.32], [0.4, 0.4]]) },
  // Plasma Orb storm cage (two domes = a sphere): sparse stepped energy bands, slate ink
  stormCage: { geo: 'dome', mode: 'glow', tile: [5, 2], scroll: [1.4, -2.4], twist: 0.9, erode: 0.44, wobble: 0,
    fade: [0.12, 0.15], frontAlpha: 0.65, hdr: 1,
    color: step([[0, 0x2e3648], [0.14, STORM.body, 1.5], [0.5, STORM.core, 2.1]]), alpha: step([[0, 0.55], [0.14, 0.35], [0.5, 0.3]]) },
  // Plasma Orb fire core (opaque toon, only the hot band blooms)
  stormPlasmaCore: { geo: 'dome', mode: 'paint', tile: [3, 1], scroll: [0.9, -1.6], twist: 0.4, erode: 0.04, wobble: 0,
    fade: [0.1, 0.1], frontAlpha: 1,
    color: step([[0, 0x7a3410], [0.1, 0xff8a2a, 1.05], [0.35, 0xffd25a, 1.2], [0.65, 0xfff4d6, 1.4]]),
    alpha: step([[0, 0.95], [0.1, 0.95], [0.35, 0.95], [0.65, 0.95]]) },
};

export const DEBRIS = {
  // bounce sparks: tiny chips that glow lemon, bounce once (gravity 12, restitution 0.4) and go dark
  stormSparkChip: { geo: 'chunk', color: 0x2a2820, emis: [STORM.body, 2.6], cool: 0.28, scale: [0.025, 0.04], speed: [2.5, 5], up: 1.3,
    gravity: 12, bounce: 0.4, life: [0.3, 0.42] },
};

// ------------------------------------------------------------------ recipes
// skyStrike in storm colours: slate puff + bolt + ground-out. vfx.impact('stormSkyStrike', pos, { lead })
function stormSkyStrike(vfx, pos, o = {}) {
  const g = vfx.game;
  const p = skyPuff(g, pos, 0, o);
  p.strike(pos, o);
}
export const RECIPES = { stormSkyStrike };

// =====================================================================================
//  internals: a tiny per-frame ticker riding vfx.zones (strobes, delayed calls, strands)
// =====================================================================================
const _c = new THREE.Color();
const _t = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3();
const rr = (a, b) => a + Math.random() * (b - a);

const strobes = [];          // { s, age, rs: next re-strike time, n, jag, ax.., bx.., flat, kink }
const delayed = [];          // { t, fn }
const strands = new Set();   // live Strand objects (watchdog: ended if not rewritten for 0.1 s)
let TV = null;               // the vfx the ticker is registered with
const TICK = {
  update(dt) {
    for (let i = strobes.length - 1; i >= 0; i--) {
      const b = strobes[i], s = b.s;
      if (!s.live || s.age < b.lastAge || s.style !== 1 || s.target) { strobes.splice(i, 1); continue; }
      b.lastAge = s.age;
      if (b.rs.length && s.age >= b.rs[0]) {
        b.rs.shift();
        writePath(TV.ribbons, s.pts, 0, b.n, b.ax, b.ay, b.az, b.bx, b.by, b.bz, b.jag, b.flat);
        if (b.kink) addKink(s, b);
      }
      if (s.age >= s.life - b.after) s.width = b.w * 0.55;                 // afterimage: a thinner ghost
      if (s.age >= s.life) strobes.splice(i, 1);
    }
    for (let i = delayed.length - 1; i >= 0; i--) {
      const d = delayed[i];
      d.t -= dt;
      if (d.t <= 0) { delayed.splice(i, 1); d.fn(); }
    }
    for (const st of strands) if (TV.time - st.stamp > 0.1) st.end();
    return strobes.length > 0 || delayed.length > 0 || strands.size > 0;
  },
  end() {},
};
function tick(vfx) {
  if (TV !== vfx || !vfx.zones.includes(TICK)) { TV = vfx; strobes.length = 0; delayed.length = 0; strands.clear(); vfx.zones.push(TICK); }
}

// Run fn after `delay` seconds of VFX time (stops with hit-stop / pause like everything in vfx).
export function later(game, delay, fn) {
  if (!game.vfx) return;
  if (delay <= 0) { fn(); return; }
  tick(game.vfx);
  delayed.push({ t: delay, fn });
}

// Re-position a live ground decal (decals.js has no move; its translation lives in the instance matrix).
export function moveDecal(h, x, z) {
  if (!h || h.slot < 0) return;
  const im = h.sys.mesh.instanceMatrix;
  im.array[h.slot * 16 + 12] = x; im.array[h.slot * 16 + 14] = z;
  im.needsUpdate = true;
  h.pos.x = x; h.pos.z = z;
}

// Spawn-pressure LOD (bible §5.5): 1 calm, ~0.35 heavy.
export const lod = (game) => (game.vfx ? game.vfx.budget() * (game.fx?.budget?.() ?? 1) : 1);

// ---------------------------------------------------------------- jagged path
// Writes n points from a to b into P (from index off): a persistent random walk perpendicular to the
// bolt in SCREEN space (so the zig-zag always reads), enveloped so both ends are exact.
let _seed = 1;
const srand = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);
function writePath(rib, P, off, n, ax, ay, az, bx, by, bz, jag, flat, rnd = Math.random) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1;
  if (flat) { _s.set(-dz, 0, dx).normalize(); _u.set(0, 1, 0); }
  else {
    const V = rib.viewDir;
    _t.set(dx / len, dy / len, dz / len);
    _s.crossVectors(_t, V);
    if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0);
    _s.normalize();
    _u.crossVectors(_t, _s).normalize();
  }
  let d = 0, e2 = 0;
  for (let i = 0; i < n; i++) {
    let t = i / (n - 1);
    if (i > 0 && i < n - 1) t += (rnd() - 0.5) * 0.45 / (n - 1);
    d = d * 0.3 + (rnd() * 2 - 1) * jag;
    e2 = e2 * 0.3 + (rnd() * 2 - 1) * jag * 0.35;
    const env = (i === 0 || i === n - 1) ? 0 : Math.pow(Math.sin(Math.PI * t), 0.55);
    const o = i * 3 + off * 3;
    P[o] = ax + dx * t + (_s.x * d + _u.x * e2) * env;
    P[o + 1] = ay + dy * t + (_s.y * d + _u.y * e2) * env * (flat ? 0 : 1);
    P[o + 2] = az + dz * t + (_s.z * d + _u.z * e2) * env;
  }
}
function addKink(s, b) {
  // ground-out: the bolt kinks down into the ground at the target's feet
  const o = (s.n - 1) * 3;
  if (s.n >= 16) return;
  s.pts[o + 3] = b.bx + b.kx; s.pts[o + 4] = 0.04; s.pts[o + 5] = b.bz + b.kz;
  s.n++;
}

// ribbon glow calibration: keeps the lemon band saturated (the shader's white core carries the heat)
const HDRK = 0.72;
function allocStrand(rib, style, width, hdr, life, color) {
  const s = rib._alloc();
  s.style = style; s.target = null; s.stopped = true;
  s.width = width; s.hdr = hdr * HDRK; s.life = life; s.age = 0;
  _c.set(color); s.r = _c.r; s.g = _c.g; s.b = _c.b;
  return s;
}

// =====================================================================================
//  stormBolt(game, from, to, opts): bible §2.3 bolt. One segment per ~0.6 u, jag 0.35-0.5,
//  1-2 side twigs that die a frame earlier, re-strikes (re-randomised jag) at +40 / +80 ms, then a
//  60 ms thinner afterimage. Ribbon shader = ink (slate-dark) edge + lemon glow + hot core.
//  opts: { width 0.3, hdr 1.7, life 0.15, jag (auto), twigs 1, twigLen [0.3, 0.8], ground (kink to feet),
//          restrike true, color, flat (crawl along the ground), segLen 0.6, after 0.06 }
// =====================================================================================
export function stormBolt(game, from, to, o = {}) {
  const vfx = game.vfx;
  if (!vfx) return null;
  tick(vfx);
  const rib = vfx.ribbons;
  const ax = from.x, ay = from.y ?? 1, az = from.z, bx = to.x, by = to.y ?? 1, bz = to.z;
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const lowLod = vfx.budget() < 0.55;
  const segLen = o.segLen ?? 0.6;
  const kink = !!o.ground;
  const n = Math.max(3, Math.min(kink ? 15 : 16, Math.round(len / segLen) + 1));
  const jag = o.jag ?? Math.min(0.5, 0.18 + len * 0.05);
  const life = o.life ?? 0.15;
  const width = o.width ?? 0.3;
  const s = allocStrand(rib, 1, width, o.hdr ?? 1.7, life, o.color ?? STORM.body);
  s.n = n;
  writePath(rib, s.pts, 0, n, ax, ay, az, bx, by, bz, jag, !!o.flat);
  const b = { s, lastAge: 0, rs: (o.restrike ?? true) && !lowLod ? [0.04, 0.08] : [], n, jag, flat: !!o.flat, kink,
    ax, ay, az, bx, by, bz, w: width, after: o.after ?? 0.06, kx: 0, kz: 0 };
  if (kink) { b.kx = rr(-0.18, 0.18); b.kz = rr(-0.18, 0.18); addKink(s, b); }
  strobes.push(b);
  // side twigs
  const nt = lowLod ? 0 : (o.twigs ?? 1);
  const tl = o.twigLen ?? [0.3, 0.8];
  for (let k = 0; k < nt; k++) {
    const at = 1 + Math.floor(Math.random() * Math.max(1, n - 3));
    const p = s.pts, q = at * 3;
    const px = p[q], py = p[q + 1], pz = p[q + 2];
    // direction: along the bolt, swung sideways and a little down
    let tx = bx - ax, ty = by - ay, tz = bz - az;
    const tlen = Math.hypot(tx, ty, tz) || 1;
    tx /= tlen; ty /= tlen; tz /= tlen;
    const L = rr(tl[0], tl[1]);
    const sw = (Math.random() < 0.5 ? -1 : 1) * rr(0.5, 1.1);
    const sx = -tz, sz = tx;                          // ground-plane side
    const qx = px + (tx + sx * sw) * L * 0.7, qz = pz + (tz + sz * sw) * L * 0.7;
    const qy = o.flat ? py : Math.max(0.08, py + (ty * 0.7 - 0.35) * L);
    const ts = allocStrand(rib, 1, width * 0.55, (o.hdr ?? 1.7) * 0.9, Math.max(0.03, life - 0.04), o.color ?? STORM.body);
    ts.n = 4;
    writePath(rib, ts.pts, 0, 4, px, py, pz, qx, qy, qz, L * 0.25, !!o.flat);
  }
  return s;
}

// A soft (trail-shader) after-glow strand along 16 caller-written points that erodes into flecks and
// retracts from its far end at 60 pts/s (~0.27 s). Returns the point array to fill (16 × xyz).
export function ionTrail(game, o = {}) {
  const vfx = game.vfx;
  if (!vfx) return null;
  const s = allocStrand(vfx.ribbons, 0, o.width ?? 0.2, o.hdr ?? 1.1, 30, o.color ?? STORM.body);
  s.n = 16;
  return s.pts;
}

// ---------------------------------------------------------------- scorch-fleck limiter
const FLECK_MAX = 14;
const fleckEnd = new Float32Array(FLECK_MAX);
function fleckOk(vfx, life) {
  const now = vfx.time;
  for (let i = 0; i < FLECK_MAX; i++) if (fleckEnd[i] <= now) { fleckEnd[i] = now + life; return true; }
  return false;
}

// =====================================================================================
//  groundOut(game, pos, opts): every bolt that hits the ground grounds out (bible §2.3):
//  bounce sparks (4-6, gravity 12, restitution 0.4), ozone glints, a 0.35-0.5 u scorch fleck that
//  glows lemon (fulgurite) and cools dark, and a dust puff.
//  opts: { sparks 4, glints 3, fleck 0.4 (radius, 0 = none), fulgurite 0 (extra glow), dust 1, scale 1, star true }
// =====================================================================================
const _g = { x: 0, y: 0, z: 0 };
export function groundOut(game, pos, o = {}) {
  const vfx = game.vfx;
  if (!vfx) return;
  const L = vfx.budget();
  const sc = o.scale ?? 1;
  _g.x = pos.x; _g.z = pos.z;
  _g.y = 0.12;
  if (o.star !== false) { _g.y = 0.35 * sc; vfx.emit('stormFlash', _g, { scale: 0.55 * sc }); }
  _g.y = 0.12;
  const ns = o.sparks ?? 4;
  if (ns > 0) {
    vfx.emit('stormSpark', _g, { count: ns, dir: { x: 0, y: 1, z: 0 }, cone: 0.35, speed: 0.8 * sc });
    if (L > 0.6) vfx.debris('stormSparkChip', _g, Math.max(1, Math.round(ns * 0.5)));
  }
  const ng = o.glints ?? 3;
  if (ng > 0 && L > 0.5) { _g.y = 0.3; vfx.emit('stormGlint', _g, { count: ng }); }
  const fr = o.fleck ?? 0.4;
  if (fr > 0 && fleckOk(vfx, 1.1)) {
    vfx.decal('scorch', _g, fr * sc, 1.1, { grow: 0.04, fade: 0.55, alpha: 0.42, accent: STORM.body, hdr: 1.6 + (o.fulgurite ?? 0), extra: o.cool ?? 4.5, intensity: 1 });
  }
  const nd = o.dust ?? 1;
  if (nd > 0 && L > 0.5) { _g.y = 0.2; vfx.emit('stormDust', _g, { count: nd, scale: sc }); }
}

// =====================================================================================
//  skyPuff(game, pos, lead, opts): a slate cloud puff trio forms at y ~6 over pos (sky strikes
//  never come from empty sky). Returns { cloud, strike(target, opts), end() }. strike() flashes
//  the puff from inside, drops a forked bolt with 2 twigs to target and grounds it out; the puff
//  dissipates over 0.35 s. lead = expected seconds until the strike (a strike at lead 0 still
//  shows the puff: easeOutBack puffs are near full size after 1-2 frames).
//  opts: { height 6, radius 1.3, width 0.38, fleck 0.5, fulgurite 0, sparks 6, twigs 2 }
// =====================================================================================
export function skyPuff(game, pos, lead = 0.15, o = {}) {
  const vfx = game.vfx;
  const H = o.height ?? 6;
  const c = vfx.cloud({ x: pos.x + rr(-0.3, 0.3), z: pos.z + rr(-0.3, 0.3) }, { radius: o.radius ?? 1.3, height: H, style: 'stormPuff', puffs: 3, life: lead + 0.9 });
  for (const p of c.puffs) p.delay *= 0.5;
  let done = false;
  return {
    cloud: c,
    strike(target, so = {}) {
      if (done) return;
      done = true;
      const oo = { ...o, ...so };
      c.flash(1);
      c.end();
      const from = { x: c.pos.x + rr(-0.25, 0.25), y: c.pos.y - 0.35, z: c.pos.z + rr(-0.25, 0.25) };
      stormBolt(game, from, { x: target.x, y: 0.05, z: target.z },
        { width: oo.width ?? 0.38, hdr: oo.hdr ?? 1.8, twigs: oo.twigs ?? 2, twigLen: [0.5, 1.3], life: oo.life ?? 0.15, segLen: 0.55 });
      groundOut(game, target, { sparks: oo.sparks ?? 6, fleck: oo.fleck ?? 0.5, fulgurite: oo.fulgurite ?? 0, glints: 3, dust: 2, scale: oo.scale ?? 1 });
    },
    end() { if (!done) { done = true; c.end(); } },
  };
}

// =====================================================================================
//  groundArcs(game, pos, r, n, opts): n bolts flattened onto the ground (y ~0.1), crawling
//  radially from near pos and ENDING EXACTLY at radius r (an edge read for blasts: Overload,
//  Plasma Orb). opts: { width 0.24, life 0.2, from 0.3 (start radius), spin (angle offset), stagger 0 }
// =====================================================================================
export function groundArcs(game, pos, r, n = 6, o = {}) {
  const a0 = o.spin ?? Math.random() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + rr(-0.25, 0.25);
    const cx = Math.cos(a), cz = Math.sin(a);
    const r0 = o.from ?? 0.3;
    const go = () => {
      stormBolt(game, { x: pos.x + cx * r0, y: 0.12, z: pos.z + cz * r0 }, { x: pos.x + cx * r, y: 0.08, z: pos.z + cz * r },
        { width: o.width ?? 0.24, life: o.life ?? 0.2, flat: true, twigs: 1, twigLen: [0.4, 0.9], jag: Math.min(0.45, 0.12 * r), hdr: 1.6 });
      _g.x = pos.x + cx * r; _g.y = 0.15; _g.z = pos.z + cz * r;
      game.vfx.emit('stormSpark', _g, { count: 2, dir: { x: cx, y: 0.8, z: cz }, cone: 0.5 });
    };
    if (o.stagger) later(game, i * o.stagger, go); else go();
  }
}

// =====================================================================================
//  Strand: a persistent ribbon strand the caller rewrites every frame (spark tails, wisp tethers,
//  plasma wires, feeler tendrils). It quietly re-allocates its pool slot every ~0.25 s so it is never
//  the oldest one (the pool steals the oldest when full) and recovers if it was stolen anyway.
//    const st = new Strand(game, { width, hdr, color, alpha });
//    const P = st.begin(n);  P[i*3..] = xyz ...   (call once per frame, before vfx.update's ribbons)
//    st.end();
// =====================================================================================
export class Strand {
  constructor(game, o = {}) { this.game = game; this.o = o; this.s = null; this.lastAge = 0; }
  begin(n) {
    const vfx = this.game.vfx, rib = vfx.ribbons;
    tick(vfx);
    strands.add(this);
    this.stamp = vfx.time;
    let s = this.s;
    if (s && (!s.live || s.age < this.lastAge || s.style !== 1 || s.target || s._own !== this)) s = null;
    if (s && s.age > 0.25) { s.life = -1; s._own = null; s = null; }
    if (!s) {
      s = allocStrand(rib, 1, this.o.width ?? 0.2, this.o.hdr ?? 1.6, 1e9, this.o.color ?? STORM.body);
      s._own = this;
    }
    this.s = s;
    this.lastAge = s.age;
    const a = this.o.alpha ?? 1;
    s.life = a >= 0.999 ? 1e9 : (s.age + 0.1) / Math.sqrt(1 - a);
    s.n = Math.max(2, Math.min(16, n));
    return s.pts;
  }
  // a jagged a -> b path whose zig-zag is re-rolled only every `every` s and otherwise rides along with a
  // (spark tails: re-randomised every 50 ms, bible §4.1)
  jagged(n, a, b, jag, every = 0.05) {
    const vfx = this.game.vfx;
    this.begin(n);
    if (vfx.time - (this.rollT ?? -9) >= every) { this.seed = 1 + Math.floor(Math.random() * 2147483646); this.rollT = vfx.time; }
    _seed = this.seed;   // the same zig-zag between re-rolls, laid along the CURRENT a -> b
    writePath(vfx.ribbons, this.s.pts, 0, this.s.n, a.x, a.y, a.z, b.x, b.y, b.z, jag, false, srand);
  }
  set width(w) { this.o.width = w; if (this.s) this.s.width = w; }
  set hdr(h) { this.o.hdr = h; if (this.s) this.s.hdr = h * HDRK; }
  // a jagged path a -> b (screen-perpendicular zig-zag) as the whole strand
  path(n, a, b, jag) {
    const P = this.begin(n);
    writePath(this.game.vfx.ribbons, P, 0, this.s.n, a.x, a.y, a.z, b.x, b.y, b.z, jag, false);
  }
  end() {
    strands.delete(this);
    if (this.s && this.s._own === this && this.s.live && this.s.age >= this.lastAge) { this.s.life = -1; this.s._own = null; }
    this.s = null;
  }
}

// Where a bolt meets a foe: upper body, scaled by its size (arcs read OVER the crowd, not inside it).
export const chestY = (e) => Math.min(2.2, 0.75 + (e?.radius ?? 0.5) * 1.1);
