import * as THREE from 'three';
import { HERO_YIELD_GLSL } from '../heroYield.js';

// =====================================================================================
//  ARCANE element VFX (owner: arcane VFX implementer; design/VFX.md, bible 10 §2.3 / §4).
//  The Rift prism: void-violet pools, precise rotating glyph geometry, starlight; converge, then pop.
//
//  1. Toolkit data (merged into the registries by vfx/index.js): PARTICLES / DEBRIS, all 'arcane*'.
//  2. The ARCANE KIT: a small pooled renderer for the shapes the shared toolkit cannot draw:
//       bodies   camera-facing procedural sprites, ONE instanced draw (bolt heads, bound moons,
//                event horizon, rune seals, star flares, speed rays, mint ghosts, tapered lines)
//       rings    procedural ground discs (rune circle with clockwise write-on / unwrite, ground
//                spiral, void wave) in one draw + tilted discs in the air (accretion disc), one draw
//       matter   biome-tinted pebbles + grass tufts torn up by a Singularity (2 instanced draws)
//     Immediate mode: owners push what they want drawn THIS frame from their update (skills,
//     projectiles, hero hooks); the kit adds its own timed effects and uploads once per frame from
//     a permanent vfx zone (so it runs inside vfx.update, after actors). <= 5 draws, only when alive.
//  3. Exported helpers for other bundles (reactions):
//       convergePop(game, pos, s = 1, { glyph, sparks })   motes rush in, then a star flare pops
//       runeCircle(game, pos, r, life, opts) -> handle     rune circle whose OUTER line sits exactly at r
//       unwrite(handle, dur = 0.4)                          erase it clockwise (arcane residue)
//       glyphFlash(game, pos, size, life)                   a rune seal that writes on and unwrites
//       starTrail(game, from, to, n)                        a constellation of twinkling star points
//       arcaneKit(game)                                     the kit (bodies / rings / matter API below)
// =====================================================================================

// ---------------------------------------------------------------- palette (bible 10 §2.2)
export const ARC = {
  core: 0xffffff, hi: 0xe6d4ff, body: 0xc08cff, edge: 0x8a4dff, dusk: 0x4a2390, void: 0x1a0633,
  prismA: 0x9ff3ff, prismB: 0xfff3c0, mint: 0x9dffb0,
};
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const COL = {
  core: lin(ARC.core), hi: lin(ARC.hi), body: lin(ARC.body), edge: lin(ARC.edge), dusk: lin(ARC.dusk),
  void: lin(ARC.void), prismA: lin(ARC.prismA), prismB: lin(ARC.prismB), mint: lin(ARC.mint), mintHi: lin(0xe8fff0),
};

const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const ERODE_END = [[0, 0], [0.7, 0], [1, 1]];

// ---------------------------------------------------------------- particles
export const PARTICLES = {
  // constellation dot: hangs where the bolt passed, twinkles out
  arcaneStar: { layer: 'glow', cell: 'star', life: [0.3, 0.42], size: [0.1, 0.15], spin: [-0.6, 0.6],
    color: [[0, 0xffffff, 2.2], [1, 0xe6d4ff, 1.6]], alpha: [[0, 1], [1, 1]], fill: 0.3, ink: 0.7,
    sizeCurve: [[0, 0.3], [0.1, 1.15], [0.45, 0.8], [1, 0]], erode: [[0, 0], [1, 0.2]] },
  arcaneStarHi: { layer: 'glow', cell: 'star', life: [0.3, 0.42], size: [0.1, 0.14], spin: [-0.6, 0.6],
    color: [[0, 0xe6d4ff, 2.0], [1, 0xc08cff, 1.5]], alpha: [[0, 1], [1, 1]], fill: 0.3, ink: 0.7,
    sizeCurve: [[0, 0.3], [0.1, 1.1], [0.45, 0.8], [1, 0]], erode: [[0, 0], [1, 0.2]] },
  // rare prism twinkles (<= 10 %): cyan and pale gold, star shaped only
  arcanePrismA: { layer: 'glow', cell: 'glint', life: [0.35, 0.45], size: [0.16, 0.2], spin: [-1, 1],
    color: [[0, 0xe8fdff, 2.2], [1, 0x9ff3ff, 1.6]], alpha: [[0, 1], [1, 1]], fill: 0.3, ink: 0.6,
    sizeCurve: [[0, 0.2], [0.15, 1.2], [1, 0]] },
  arcanePrismB: { layer: 'glow', cell: 'glint', life: [0.35, 0.45], size: [0.16, 0.2], spin: [-1, 1],
    color: [[0, 0xfffbe8, 2.2], [1, 0xfff3c0, 1.6]], alpha: [[0, 1], [1, 1]], fill: 0.3, ink: 0.6,
    sizeCurve: [[0, 0.2], [0.15, 1.2], [1, 0]] },
  // tiny rune stamped in the air behind a bolt; erodes away ("unwrites")
  arcaneRuneStamp: { layer: 'glow', cell: 'rune', life: [0.25, 0.3], size: [0.17, 0.2], rot: 0,
    color: [[0, 0xf4ecff, 1.9], [1, 0x8a4dff, 1.3]], alpha: [[0, 1], [1, 1]], fill: 0.35, ink: 0.85,
    erode: [[0, 0], [0.25, 0.05], [1, 1]] },
  // converge motes: spawn on a circle and rush into the centre in ~0.1 s (orbit pull 25/s)
  arcaneConverge: { layer: 'glow', cell: 'glint', orient: 'orbit', life: [0.1, 0.12], size: [0.14, 0.2], swirl: [3, 5], pull: [22, 27],
    rise: [0, 0], color: [[0, 0xc08cff, 1.7], [1, 0xffffff, 2.3]], alpha: [[0, 0.4], [0.3, 1], [1, 1]], fill: 0.3, ink: 0.7,
    sizeCurve: [[0, 0.7], [1, 1]], erode: [[0, 0], [1, 0]] },
  arcaneConvergeMint: { layer: 'glow', cell: 'glint', orient: 'orbit', life: [0.1, 0.12], size: [0.14, 0.2], swirl: [3, 5], pull: [22, 27],
    rise: [0, 0], color: [[0, 0x9dffb0, 1.7], [1, 0xffffff, 2.2]], alpha: [[0, 0.4], [0.3, 1], [1, 1]], fill: 0.3, ink: 0.7, erode: [[0, 0], [1, 0]] },
  // starlight sparks thrown outward by a pop
  arcaneSpark: { layer: 'glow', cell: 'streak', count: 8, life: [0.16, 0.28], size: [0.08, 0.11], stretch: 0.13, speed: [6, 11], up: 0.25,
    drag: 5, color: [[0, 0xffffff, 2.3], [0.4, 0xe6d4ff, 1.9], [1, 0x8a4dff, 1.3]], fill: 0.3, ink: 0.6 },
  arcaneSparkMint: { layer: 'glow', cell: 'streak', count: 8, life: [0.16, 0.28], size: [0.08, 0.11], stretch: 0.13, speed: [6, 11], up: 0.25,
    drag: 5, color: [[0, 0xffffff, 2.2], [0.4, 0xd8ffe2, 1.8], [1, 0x9dffb0, 1.3]], fill: 0.3, ink: 0.6 },
  // Singularity: starlight streaks spiralling into the core at constant speed (orbit: r·w is constant)
  arcaneInspiral: { layer: 'glow', cell: 'streak', orient: 'orbit', life: [1.4, 1.9], size: [0.075, 0.1], stretch: 0.32,
    swirl: [0.65, 0.9], pull: [1.05, 1.35], rise: [0, 0],
    color: [[0, 0xc08cff, 1.5], [0.5, 0xe6d4ff, 1.8], [1, 0xffffff, 2.3]], alpha: [[0, 0], [0.12, 1], [0.88, 1], [1, 0]],
    fill: 0.3, ink: 0.5, sizeCurve: [[0, 0.7], [0.85, 1], [1, 0.3]], erode: [[0, 0], [1, 0]] },
  // Singularity collapse: glyphs flung outward (drag 8: they stop at speed/8 metres)
  arcaneGlyphFly: { layer: 'glow', cell: 'rune', life: [0.42, 0.5], size: [0.34, 0.4], spin: [-2.5, 2.5], speed: [1, 1], up: 0, drag: 8, spread: 0.05,
    color: [[0, 0xffffff, 2.1], [0.3, 0xc08cff, 1.7], [1, 0x8a4dff, 1.2]], alpha: [[0, 1], [1, 1]], fill: 0.4, ink: 0.9,
    erode: [[0, 0], [0.55, 0], [1, 1]] },
  // a painted void puff (collapse breath, blink departure)
  arcaneVoidPuff: { layer: 'paint', cell: 'puff', life: [0.35, 0.5], size: [0.7, 1.0], spin: [-1, 1], speed: [0.5, 1.5], up: 0.2, drag: 3,
    color: [[0, 0x2a1050], [1, 0x1a0633]], shade: [[0, 0x12051f], [1, 0x0c0316]], alpha: [[0, 0.5], [1, 0.4]], fill: 0.5, ink: 0.4,
    sizeCurve: [[0, 0.5], [1, 1.1]], erode: [[0, 0], [0.3, 0.1], [1, 1]] },
  // Adrenaline: mint motes rising off the hero (4/s)
  arcaneMintMote: { layer: 'glow', cell: 'glint', life: [0.7, 1.0], size: [0.17, 0.23], spin: [-2, 2], speed: [0.2, 0.5], up: 2, gravity: -1.6, drag: 1.5,
    color: [[0, 0xeafff0, 2.0], [1, 0x9dffb0, 1.4]], alpha: FADE, fill: 0.35, ink: 0.6, sizeCurve: [[0, 0.4], [0.2, 1], [1, 0.3]], erode: ERODE_END },
  // Arcanist idle: a letter lifting off the floating tome and dissolving
  arcaneTomeLetter: { layer: 'glow', cell: 'rune', life: [0.9, 1.2], size: [0.12, 0.15], rot: 0, speed: [0.1, 0.25], up: 3, gravity: -0.5, drag: 1.2,
    color: [[0, 0xf4ecff, 1.7], [1, 0xc08cff, 1.3]], alpha: FADE, fill: 0.35, ink: 0.8, erode: [[0, 0], [0.5, 0.05], [1, 1]] },
  // Arcanist idle / Resonance: starlight twinkle
  arcaneTwinkle: { layer: 'glow', cell: 'star', life: [0.3, 0.45], size: [0.13, 0.18], spin: [-1, 1], speed: [0, 0.2], up: 1, gravity: -0.4,
    color: [[0, 0xffffff, 2.1], [1, 0xc08cff, 1.5]], alpha: [[0, 1], [1, 1]], fill: 0.3, ink: 0.7, sizeCurve: [[0, 0.2], [0.2, 1.1], [1, 0]] },
};

export const SHELLS = {};
export const RECIPES = {};
export const DEBRIS = {
  // violet glass splinters from a collapse / glyph shatter (emissive cools fast: "glow = live")
  arcaneShard: { geo: 'shard', color: 0x5a3c96, emis: [0xc08cff, 1.2], cool: 0.5, scale: [0.06, 0.11], stretch: 2.3, speed: [4, 8], up: 0.9, gravity: 22, bounce: 0.3, life: [0.5, 0.8] },
};

// =====================================================================================
//  GLSL
// =====================================================================================
const GLSL_COMMON = /* glsl */`
  const float TAU = 6.2831853;
  float h11(float n) { return fract(sin(n * 12.9898 + 0.731) * 43758.5453); }
  float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
  float fill1(float d, float w) { float aa = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, d); }
  // a rune: 3 connected strokes between points of a 3x3 grid (+ a dot); lp in about -1..1
  float glyphD(vec2 lp, float id) {
    vec2 prev = vec2(floor(h11(id) * 3.0) - 1.0, floor(h11(id * 1.7 + 0.3) * 3.0) - 1.0);
    float d = 9.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 nx = vec2(floor(h11(id * 3.1 + fk * 7.3) * 3.0) - 1.0, floor(h11(id * 5.3 + fk * 2.9) * 3.0) - 1.0);
      if (nx == prev) nx = vec2(prev.x == 0.0 ? 1.0 : -prev.x, prev.y == 0.0 ? -1.0 : -prev.y);
      d = min(d, sdSeg(lp, prev * vec2(0.62, 0.78), nx * vec2(0.62, 0.78)));
      prev = nx;
    }
    if (h11(id * 9.7) > 0.5) d = min(d, length(lp - vec2(0.0, -1.05)) - 0.06);
    return d;
  }
  // 4-point star field: 1 at the tips' outline (k 1 = diamond, 0.5 = concave star)
  float starF(vec2 p, float k) { return pow(abs(p.x), k) + pow(abs(p.y), k); }
`;

// ---------------------------------------------------------------- bodies (camera-facing)
// kinds: 0 STAR  1 ORB  2 HORIZON  3 GLYPH  4 RAYS  5 FLASH  6 VOID  7 LINE  8 GHOST
const K_STAR = 0, K_ORB = 1, K_HORIZON = 2, K_GLYPH = 3, K_RAYS = 4, K_FLASH = 5, K_VOID = 6, K_LINE = 7, K_GHOST = 8;

const BODY_VS = /* glsl */`
  attribute vec4 iP; attribute vec4 iR; attribute vec4 iC; attribute vec4 iV; attribute vec4 iX;
  varying vec2 vUv; varying vec4 vR; varying vec4 vC; varying vec4 vX; varying float vAsp; varying vec3 vPV;
  void main() {
    vR = iR; vC = iC; vX = iX;
    vec2 q = position.xy;
    vec4 mv;
    if (abs(iR.z - 7.0) < 0.5) {
      // LINE from iP.xyz (u 0) to iV.xyz (u 1), width iP.w
      vec4 a = modelViewMatrix * vec4(iP.xyz, 1.0);
      vec4 b = modelViewMatrix * vec4(iV.xyz, 1.0);
      vec2 d = b.xy - a.xy; float L = length(d);
      vec2 dir = L > 1e-5 ? d / L : vec2(0.0, 1.0);
      vec2 n = vec2(dir.y, -dir.x);
      float t = q.y + 0.5;
      mv = mix(a, b, t);
      mv.xy += n * q.x * iP.w;
      mv.z += 0.3;
      vUv = vec2(q.x * 2.0, t);
      vAsp = L / max(iP.w, 1e-4);
    } else {
      mv = modelViewMatrix * vec4(iP.xyz, 1.0);
      vec2 ay = vec2(0.0, 1.0);
      if (dot(iV.xyz, iV.xyz) > 1e-8) {
        vec2 vv = (modelViewMatrix * vec4(iV.xyz, 0.0)).xy; float l = length(vv);
        if (l > 1e-5) ay = vv / l;
      }
      float c = cos(iR.x), s = sin(iR.x);
      ay = vec2(ay.x * c - ay.y * s, ay.x * s + ay.y * c);
      vec2 ax = vec2(ay.y, -ay.x);
      mv.xy += ax * q.x * iP.w + ay * q.y * iP.w * iR.y;
      mv.z += iV.w;                     // depth bias toward the camera (keeps small heads out of grass)
      vUv = q * 2.0;
      vAsp = iR.y;
    }
    vPV = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const BODY_FS = /* glsl */`
  uniform float uTime;
  uniform vec3 uVoid; uniform vec3 uDusk; uniform vec3 uHi;
  varying vec2 vUv; varying vec4 vR; varying vec4 vC; varying vec4 vX; varying float vAsp; varying vec3 vPV;
  ${HERO_YIELD_GLSL}
  ${GLSL_COMMON}
  void main() {
    float kind = vR.z, alpha = vR.w;
    vec2 p = vUv;
    vec3 col = vC.rgb; float hdr = vC.w;
    vec3 emit = vec3(0.0); vec3 paint = vec3(0.0); float pa = 0.0;    // emission + premultiplied paint
    if (kind < 0.5) {
      // STAR: a velocity-aligned diamond / 4-point star: white core, element body, void ink rim,
      // and a small spinning sparkle (p2 = spin angle). p1 concavity 0..1, p3 core scale.
      float f = starF(p, mix(1.0, 0.5, vX.x));
      if (f > 1.0) discard;
      float aa = fwidth(f) + 1e-4;
      float body = 1.0 - smoothstep(0.66 - aa, 0.66 + aa, f);
      float core = 1.0 - smoothstep(0.24 * vX.z - aa, 0.24 * vX.z + aa, f);
      vec2 t = vec2(p.x, p.y * vAsp);
      float cs = cos(vX.y), sn = sin(vX.y);
      t = vec2(t.x * cs - t.y * sn, t.x * sn + t.y * cs);
      float sp = starF(t * 0.85, 0.42);
      float spark = 1.0 - smoothstep(0.85, 1.0, sp);
      emit = mix(col * hdr, vec3(2.3), core) * body + vec3(1.8) * spark * (1.0 - body) * 0.8;
      paint = uVoid; pa = (1.0 - body) * 0.55 + body * 0.25;
      pa *= 1.0 - spark * 0.5;
    } else if (kind < 1.5) {
      // ORB: a bound moon / miniature galaxy. Fresnel rim, swirling void-dusk interior with star
      // specks, white 4-point core, ink edge. p1 squash (y), p2 brightness, p3 core scale.
      p.y /= max(vX.x, 0.3); p.x *= mix(1.0, vX.x, 0.5);
      float r = length(p);
      if (r > 1.0) discard;
      float aa = fwidth(r) + 1e-4;
      float ink = smoothstep(0.84 - aa, 0.84 + aa, r);
      float rimB = smoothstep(0.62 - aa, 0.62 + aa, r) * (1.0 - ink);
      float an = atan(p.y, p.x);
      float sw = sin(an * 2.0 + r * 8.0 - uTime * 4.5 + vX.w * 6.0);
      float arm = step(0.25, sw) * (1.0 - smoothstep(0.2, 0.62, r));
      vec3 inner = mix(uVoid, uDusk, arm);
      // star specks on a rotating polar lattice
      float ga = fract((an + uTime * 1.6) / TAU * 7.0);
      float gr = fract(r * 4.0);
      float speck = step(0.86, h11(floor((an + uTime * 1.6) / TAU * 7.0) * 3.7 + floor(r * 4.0) * 11.0 + vX.w))
        * (1.0 - smoothstep(0.0, 0.18, length(vec2(ga - 0.5, gr - 0.5)))) * (1.0 - rimB) * (1.0 - ink);
      float core = 1.0 - smoothstep(0.5 * vX.z - aa * 2.0, 0.5 * vX.z + aa * 2.0, starF(p, 0.55));
      float glowIn = (1.0 - smoothstep(0.0, 0.45, r)) * 0.5;
      emit = col * hdr * vX.y * (rimB * 1.2 + glowIn) + vec3(2.4) * vX.y * core + uHi * 1.8 * speck + col * arm * 0.55;
      paint = mix(inner, uVoid * 0.6, ink); pa = mix(0.85, 0.95, ink) * (1.0 - core);
    } else if (kind < 2.5) {
      // HORIZON: event horizon disc, thin bright Einstein ring, faint lensing halo; p1 ring strength
      float r = length(p);
      if (r > 1.0) discard;
      float aa = fwidth(r) + 1e-4;
      float disc = 1.0 - smoothstep(0.55 - aa, 0.55 + aa, r);
      float an = atan(p.y, p.x);
      float ring = (1.0 - smoothstep(0.035 - aa, 0.035 + aa, abs(r - 0.63))) * (0.75 + 0.25 * sin(an * 3.0 - uTime * 6.0));
      float halo = (1.0 - smoothstep(0.66, 1.0, r)) * step(0.55, r);
      emit = uHi * 2.3 * ring * vX.x + col * hdr * halo * 0.35 * (0.6 + 0.4 * sin(an * 5.0 + uTime * 4.0));
      paint = vec3(0.012, 0.004, 0.03); pa = disc + halo * 0.3;
    } else if (kind < 3.5) {
      // GLYPH seal: ring + rune strokes; clockwise write-on (p1) and unwrite (p2); p3 glyph turn
      float r = length(p);
      if (r > 1.0) discard;
      float an = fract(0.25 - atan(p.y, p.x) / TAU);
      float vis = step(vX.y, an) * step(an, vX.x);
      float cs = cos(vX.z), sn = sin(vX.z);
      vec2 g = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
      float dRing = abs(r - 0.84);
      float dIn = abs(r - 0.68);
      float dg = glyphD(g / 0.5, vX.w) * 0.5;
      float s = max(max(fill1(dRing, 0.07), fill1(dIn, 0.025)), fill1(dg, 0.06)) * vis;
      float sc = max(fill1(dRing, 0.025), fill1(dg, 0.022)) * vis;
      float back = 1.0 - smoothstep(0.86, 0.98, r);
      emit = col * hdr * s + vec3(2.2) * sc;
      paint = uVoid; pa = back * 0.4 * max(vis, 0.35) + s * 0.25;
    } else if (kind < 4.5) {
      // RAYS: 12 radial speed lines shooting outward; p1 progress
      float r = length(p);
      if (r > 1.0) discard;
      float N = 12.0;
      float an = atan(p.y, p.x) / TAU * N + 0.5;
      float id = floor(an);
      float jit = h11(id + vX.w * 13.0);
      float da = (fract(an) - 0.5 + (jit - 0.5) * 0.3) * TAU / N * r;
      float r0 = 0.28 + 0.62 * vX.x;
      float r1 = min(1.0, 0.5 + (0.45 + 0.25 * jit) * vX.x * 1.4);
      float u = clamp((r - r0) / max(r1 - r0, 1e-3), 0.0, 1.0);
      float inR = step(r0, r) * step(r, r1);
      float w = 0.016 * (1.0 - u) + 0.003;
      float ray = fill1(abs(da), w) * inR;
      float core = fill1(abs(da), w * 0.4) * inR;
      emit = (col * hdr * ray + vec3(2.0) * core) * (1.0 - u * 0.5);
      paint = uVoid; pa = ray * 0.25;
    } else if (kind < 5.5) {
      // FLASH: star flare (long 4-point rays, short diagonal rays, round core)
      float r = length(p);
      float rays = 1.0 - smoothstep(0.75, 1.0, starF(p, 0.36));
      vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;
      float rays2 = 1.0 - smoothstep(0.7, 1.0, starF(d * 1.7, 0.4));
      float aa = fwidth(r) + 1e-4;
      float core = 1.0 - smoothstep(0.2 - aa, 0.2 + aa, r);
      float halo = (1.0 - smoothstep(0.2, 0.5, r)) * 0.5;
      float m = max(max(rays, rays2 * 0.7), halo);
      if (m + core < 0.01) discard;
      emit = col * hdr * m + vec3(2.4) * core * vX.x;
      paint = uVoid; pa = (rays + halo) * 0.15;
    } else if (kind < 6.5) {
      // VOID: soft painted pool of void under a bright body
      float r = length(p);
      if (r > 1.0) discard;
      float m = 1.0 - smoothstep(0.35, 1.0, r);
      paint = col; pa = m;
    } else if (kind < 7.5) {
      // LINE: tapered starlight strip; u 0 at the head. p1 tail width, p2 falloff, p3 core
      float w = mix(1.0, vX.x, vUv.y);
      float x = abs(vUv.x) / max(w, 1e-3);
      if (x > 1.0) discard;
      float aa = fwidth(x) + 1e-3;
      float body = 1.0 - smoothstep(0.6 - aa, 0.6 + aa, x);
      float core = 1.0 - smoothstep(0.22 - aa, 0.22 + aa, x);
      float fall = mix(1.0, vX.y, vUv.y);
      emit = (col * hdr * body + vec3(2.1) * core * vX.z) * fall;
      paint = uVoid; pa = (1.0 - body) * 0.6 * fall + body * 0.2 * fall;
    } else if (kind > 8.5) {
      // GLOW: soft light around a small bright body (toon-stepped in 3 bands)
      float r = length(p);
      if (r > 1.0) discard;
      float k = 1.0 - r;
      float b = k * k * 0.6 + step(0.45, k) * 0.25 + step(0.72, k) * 0.35;
      emit = col * hdr * b;
      paint = uVoid; pa = k * 0.12;
    } else {
      // GHOST: mint afterimage of a hooded caster (hood + shoulders + flared robe), hollow with a bright
      // rim, fading toward the hem
      vec2 t = vec2(p.x, p.y * vAsp);
      float head = length((t - vec2(0.0, vAsp * 0.68)) * vec2(1.0, 0.85)) - 0.3;
      float yb = clamp((vAsp * 0.5 - t.y) / (vAsp * 1.45), 0.0, 1.0);
      float bw = mix(0.36, 0.7, yb * yb);
      float body = max(abs(t.x) - bw, max(t.y - vAsp * 0.5, -t.y - vAsp * 0.95));
      float sh = length((t - vec2(0.0, vAsp * 0.42)) * vec2(0.8, 2.2)) - 0.42;
      float d = min(min(head, body), sh);
      float aa = fwidth(d) + 1e-4;
      float m = 1.0 - smoothstep(-aa, aa, d);
      if (m < 0.01) discard;
      float rim = 1.0 - smoothstep(0.0, 0.1, -d);
      float hem = smoothstep(-vAsp * 0.95, -vAsp * 0.2, t.y);
      emit = col * hdr * (0.2 + 0.8 * rim) * m * hem;
      paint = col * 0.6; pa = m * 0.18 * hem;
    }
    gl_FragColor = vec4(paint * pa + emit, pa) * alpha * heroYield(vPV);
  }`;

// ---------------------------------------------------------------- rings (ground / air discs)
// kinds: 0 RUNE circle  1 SWIRL (ground spiral)  2 ACCRETION disc  3 WAVE  4 SEAL
const R_RUNE = 0, R_SWIRL = 1, R_ACCRETION = 2, R_WAVE = 3, R_SEAL = 4;

const RING_VS = /* glsl */`
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iD; attribute vec4 iE;
  varying vec2 vP; varying float vS; varying vec4 vA; varying vec4 vB; varying vec4 vD; varying vec4 vE; varying vec3 vPV;
  void main() {
    vP = position.xz;
    vS = length(instanceMatrix[0].xyz);
    vA = iA; vB = iB; vD = iD; vE = iE;
    vec4 pv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vPV = pv.xyz;
    gl_Position = projectionMatrix * pv;
  }`;

const RING_FS = /* glsl */`
  uniform float uTime; uniform vec3 uVoid; uniform vec3 uDusk; uniform vec3 uHi;
  varying vec2 vP; varying float vS; varying vec4 vA; varying vec4 vB; varying vec4 vD; varying vec4 vE; varying vec3 vPV;
  ${HERO_YIELD_GLSL}
  ${GLSL_COMMON}
  void main() {
    float kind = vA.x;
    vec2 q = vP * vS;                       // metres from the centre (local plane)
    float d = length(q);
    if (d > vS) discard;
    float an = fract(atan(q.y, q.x) / TAU + 0.375);   // 0 at screen-top, grows clockwise on screen
    vec3 col = vB.rgb; float hdr = vB.w;
    float alpha = vD.x;
    vec3 emit = vec3(0.0); vec3 paint = uVoid; float pa = 0.0;
    float R = vE.x;
    if (kind < 0.5) {
      // RUNE circle. Outer line exactly at R; a glyph band inside on a void backing; an inner line;
      // a faint void pool. vA.y glyph rotation, vA.z write (0..1 clockwise), vA.w unwrite.
      // vD.y backing alpha, vD.z seed, vD.w style (0 full, 1 thin inner ring, 2 double band)
      float vis = step(vA.w, an) * step(an, vA.z);
      float pen = (1.0 - smoothstep(0.0, 0.03, abs(an - vA.z))) * step(vA.z, 0.999) * step(0.001, vA.z);
      float style = vD.w;
      float bw = style > 0.5 && style < 1.5 ? 0.16 : 0.3;            // glyph band width (m)
      float lw = style > 0.5 && style < 1.5 ? 0.03 : 0.045;          // outer line half width
      float e = abs(d - R);
      float line = fill1(e, lw);
      float under = fill1(e, lw + 0.07);
      float bc = R - 0.09 - bw * 0.5;
      float inBand = fill1(abs(d - bc), bw * 0.5);
      float sweepA = fract(an + vA.y / TAU);
      float N = max(6.0, floor(TAU * bc / (bw * 1.25)));
      float sa = sweepA * N;
      float id = floor(sa);
      vec2 lp = vec2((fract(sa) - 0.5) * TAU * bc / N, d - bc) / (bw * 0.5);
      float g = fill1(glyphD(lp, id + vD.z * 17.0) * bw * 0.5, 0.022) * inBand;
      float s = line + g;
      float il = 0.0;
      if (style > 1.5) {
        float bc2 = bc - bw - 0.06;
        float inB2 = fill1(abs(d - bc2), bw * 0.5);
        float sa2 = fract(an - vA.y * 1.3 / TAU) * N; float id2 = floor(sa2);
        vec2 lp2 = vec2((fract(sa2) - 0.5) * TAU * bc2 / N, d - bc2) / (bw * 0.5);
        s += fill1(glyphD(lp2, id2 + 31.0 + vD.z * 17.0) * bw * 0.5, 0.022) * inB2;
        inBand = max(inBand, inB2);
        il = fill1(abs(d - (bc2 - bw * 0.5 - 0.05)), 0.018);
      } else il = fill1(abs(d - (bc - bw * 0.5 - 0.05)), 0.016);
      s = min(1.0, s + il) * vis;
      float pool = smoothstep(R * 0.2, R - bw, d) * 0.6;
      emit = col * hdr * s + vec3(1.6) * line * vis * 0.25 + uHi * 2.2 * pen * under;
      pa = max(under, inBand) * vD.y * vis + pool * vD.y * 0.35 * vis;
      pa = max(pa, s * 0.3);
    } else if (kind < 1.5) {
      // SWIRL: dark logarithmic spiral arms on a faint void pool, rotating (vA.y), each arm with a thin
      // violet leading edge; soft rim before R (the rune circle carries the edge)
      float r = d / max(R, 1e-3);
      float ph = 3.0 * (atan(q.y, q.x) + vA.y) - 4.2 * log(max(r, 0.02));
      float arm = sin(ph);
      float fadeR = smoothstep(0.06, 0.3, r) * (1.0 - smoothstep(0.72, 0.98, r));
      float armK = step(0.3, arm) * fadeR;
      float edge = (step(0.3, arm) - step(0.52, arm)) * step(0.0, cos(ph)) * fadeR;
      float pool = 1.0 - smoothstep(0.5, 1.0, r);
      paint = mix(uVoid, uDusk, edge * 0.6);
      pa = pool * vD.y * 0.45 + armK * vD.y;
      emit = col * hdr * edge * 0.45;
    } else if (kind < 2.5) {
      // ACCRETION disc (tilted, in the air): a dark disc with bright violet spiral streaks and a hot inner rim
      float r = d / max(R, 1e-3);
      if (r < 0.3) discard;
      float u = (r - 0.3) / 0.7;
      float a = atan(q.y, q.x);
      float st = sin(a * 4.0 + vA.y - 7.0 * log(r)) * 0.5 + 0.5;
      float streak = step(0.62, st) * (1.0 - u * 0.8);
      float rim = 1.0 - step(0.09, u);
      float body = 1.0 - smoothstep(0.8, 1.0, u);
      emit = (col * streak * 0.8 + uHi * rim * 1.1) * hdr * body;
      paint = mix(uVoid, uDusk, 0.35); pa = body * 0.42 * (1.0 - rim);
    } else if (kind < 3.5) {
      // WAVE: painted void band expanding to R (vE.y = progress 0..1), bright violet leading edge
      float front = vE.y * R;
      float th = 0.45;
      float inside = step(d, front) * (1.0 - smoothstep(0.0, th, front - d));
      float lead = fill1(abs(d - front), 0.05);
      paint = mix(uVoid, uDusk, 0.3); pa = inside * 0.6;
      emit = col * hdr * lead + uHi * 1.6 * lead * 0.5;
    } else {
      // SEAL: one big glyph inside a double ring with ticks and a hexagram; write / unwrite clockwise
      float vis = step(vA.w, an) * step(an, vA.z);
      float r = d / max(R, 1e-3);
      float s = fill1(abs(r - 0.92), 0.035) + fill1(abs(r - 0.8), 0.014);
      float tick = step(0.92, fract(an * 24.0 + 0.04)) * fill1(abs(r - 0.86), 0.05);
      float dh = 9.0;
      for (int k = 0; k < 6; k++) {
        float a0 = vA.y + float(k) * TAU / 6.0, a1 = a0 + 2.0 * TAU / 6.0;
        dh = min(dh, sdSeg(q / R, 0.78 * vec2(cos(a0), sin(a0)), 0.78 * vec2(cos(a1), sin(a1))));
      }
      s += fill1(dh, 0.012) * 0.8 + tick;
      s += fill1(glyphD(q / R / 0.32, vD.z * 7.0) * 0.32, 0.03);
      s = min(s, 1.0) * vis;
      float back = 1.0 - smoothstep(0.9, 1.0, r);
      emit = col * hdr * s;
      pa = back * vD.y * max(vis, 0.3) + s * 0.25;
    }
    if (pa < 0.002 && max(emit.r, max(emit.g, emit.b)) < 0.002) discard;
    #ifdef AIR
    gl_FragColor = vec4(paint * pa + emit, pa) * alpha * heroYield(vPV);
    #else
    gl_FragColor = vec4(paint * pa + emit, pa) * alpha * heroYieldGround(vPV);
    #endif
  }`;

// ---------------------------------------------------------------- matter geometry
function pebbleGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position');
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!jit.has(k)) jit.set(k, 0.75 + rnd() * 0.45);
    const j = jit.get(k);
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j * 0.7, pos.getZ(i) * j);
  }
  g.computeVertexNormals();
  return g;
}
function tuftGeometry() {
  // a torn-up clod: flat soil cap with 4 grass blades (thin 3-sided spikes); vertex colours mark soil
  const parts = [];
  const soil = new THREE.CylinderGeometry(0.75, 0.55, 0.35, 6, 1).translate(0, -0.1, 0);
  parts.push([soil, 0]);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.ConeGeometry(0.16, 1.5, 3, 1).translate(0, 0.75, 0);
    b.rotateZ((i - 1.5) * 0.32).rotateY(i * 1.7).translate((i - 1.5) * 0.18, 0.05, ((i % 2) - 0.5) * 0.25);
    parts.push([b, 1]);
  }
  const out = [];
  for (const [p, isGrass] of parts) {
    const ng = p.toNonIndexed();
    const n = ng.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = isGrass ? 1 : 0.78; c[i * 3 + 1] = isGrass ? 1 : 0.5; c[i * 3 + 2] = isGrass ? 1 : 0.4; }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    ng.deleteAttribute('uv');
    out.push(ng);
  }
  // merge manually (no addon import needed)
  let total = 0;
  for (const g of out) total += g.getAttribute('position').count;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const g of out) {
    P.set(g.getAttribute('position').array, o * 3); N.set(g.getAttribute('normal').array, o * 3); C.set(g.getAttribute('color').array, o * 3);
    o += g.getAttribute('position').count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.computeVertexNormals();
  return geo;
}
// per act: [pebble, soil, grass]  (Thornwood, Sunscorch Barrens, Stormwater Reach)
const MATTER_TINT = [
  [0x7a6e5e, 0x5b4632, 0x5c9440],
  [0x9a8466, 0x8e7458, 0xc2a95a],
  [0x6e7c74, 0x4e4a3a, 0x4b9748],
];

// =====================================================================================
//  The kit
// =====================================================================================
const CAP_B = 1536, CAP_R = 48, CAP_M = 96;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const _c = new THREE.Color();
const _UP = new THREE.Vector3(0, 1, 0);

class ArcaneKit {
  constructor(vfx) {
    this.vfx = vfx;
    const scene = vfx.scene;
    this.t = 0;
    this.lastTick = -1;
    const U = { uTime: vfx.uTime, uHeroView: vfx.uHeroView, uHeroYield: vfx.uHeroYield, uVoid: { value: new THREE.Vector3(...COL.void) }, uDusk: { value: new THREE.Vector3(...COL.dusk) }, uHi: { value: new THREE.Vector3(...COL.hi) } };

    // ---- bodies
    const quad = new THREE.PlaneGeometry(1, 1);
    const bg = new THREE.InstancedBufferGeometry();
    bg.setIndex(quad.getIndex());
    bg.setAttribute('position', quad.getAttribute('position'));
    this.bAttr = {};
    for (const n of ['iP', 'iR', 'iC', 'iV', 'iX']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP_B * 4), 4).setUsage(THREE.DynamicDrawUsage);
      bg.setAttribute(n, a); this.bAttr[n] = a;
    }
    this.P = this.bAttr.iP.array; this.R = this.bAttr.iR.array; this.C = this.bAttr.iC.array; this.V = this.bAttr.iV.array; this.X = this.bAttr.iX.array;
    bg.instanceCount = 0;
    this.bGeo = bg;
    const bmat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: BODY_VS, fragmentShader: BODY_FS,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, ...vfx.blend });
    this.bodies = new THREE.Mesh(bg, bmat);
    this.bodies.frustumCulled = false; this.bodies.renderOrder = 14; this.bodies.name = 'vfx-arcane-bodies';
    this.nb = 0;

    // ---- rings: ground (depthTest off like the decals) and air (tilted, depth tested)
    const mkRing = (depthTest, order, name) => {
      const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
      const attrs = {};
      for (const n of ['iA', 'iB', 'iD', 'iE']) {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP_R * 4), 4).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute(n, a); attrs[n] = a;
      }
      const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: RING_VS, fragmentShader: RING_FS, defines: depthTest ? { AIR: 1 } : {},
        // ground rings go in the OPAQUE list (custom blending still applies) at renderOrder 2: after the grass,
        // before creatures (3) and heroes (21), so they never wash over units (same rule as vfx decals)
        transparent: depthTest, depthWrite: false, depthTest, side: THREE.DoubleSide, ...vfx.blend });
      const mesh = new THREE.InstancedMesh(geo, mat, CAP_R);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.renderOrder = order; mesh.name = name; mesh.count = 0;
      return { mesh, attrs, n: 0 };
    };
    this.ground = mkRing(false, 2, 'vfx-arcane-ground');
    this.air = mkRing(true, 11, 'vfx-arcane-air');

    // ---- matter (pebbles / clods)
    const mkMatter = (geo, vertexColors) => {
      const mat = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors });
      const mesh = new THREE.InstancedMesh(geo, mat, CAP_M);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP_M * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
      return { mesh, n: 0 };
    };
    this.matterP = mkMatter(pebbleGeometry(), false); this.matterP.mesh.name = 'vfx-arcane-pebbles';
    this.matterT = mkMatter(tuftGeometry(), true); this.matterT.mesh.name = 'vfx-arcane-clods';

    this.group = new THREE.Group();
    this.group.name = 'vfx-arcane';
    this.group.add(this.bodies, this.ground.mesh, this.air.mesh, this.matterP.mesh, this.matterT.mesh);
    scene.add(this.group);

    // timed effects (pooled records)
    this.fx = [];
    this.fxFree = [];
    this.rings = [];
    this.ringFree = [];

    this.zone = { update: (dt) => { this.update(dt); return true; }, end() {} };
    vfx.zones.push(this.zone);
    this._warm();
  }

  _warm() {
    // compile the 4 programs now (first use mid-fight would stall 20-60 ms per program)
    const r = this.vfx.game.engine?.renderer;
    this.star(0, -50, 0, 0.01, 1, 0, 0, 0, 0, COL.body, 1, 0.001);
    this._ringW(this.ground, R_RUNE, 0, -50, 0, 1, null, COL.body, 1, 0.001, 0, 0, 1, 0, 0, 0, 0, 0, 0);
    this._ringW(this.air, R_ACCRETION, 0, -50, 0, 1, null, COL.body, 1, 0.001, 0, 0, 1, 0, 0, 0, 0, 0, 0);
    this.matter(0, 0, -50, 0, 0.01, 0, 0, 0, 0x777777); this.matter(1, 0, -50, 0, 0.01, 0, 0, 0, 0x777777);
    this._flush();
    if (r?.compile) { try { r.compile(this.group, this.vfx.camera); } catch { /* ignore */ } }
  }

  budget() { return Math.min(this.vfx.budget(), this.vfx.game.fx?.budget?.() ?? 1); }
  // LOD tier (bible §5.5): 0 full, 1 trimmed, 2 heads + short streaks only
  tier() { const b = this.budget(); return b > 0.7 ? 0 : b > 0.45 ? 1 : 2; }

  // ------------------------------------------------------------ immediate-mode bodies
  _w(kind, x, y, z, size, aspect, rot, c, hdr, alpha, vx, vy, vz, bias, p1, p2, p3, seed) {
    if (this.nb >= CAP_B) return;
    const o = (this.nb++) * 4;
    const P = this.P, R = this.R, C = this.C, V = this.V, X = this.X;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = size;
    R[o] = rot; R[o + 1] = aspect; R[o + 2] = kind; R[o + 3] = alpha;
    C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; C[o + 3] = hdr;
    V[o] = vx; V[o + 1] = vy; V[o + 2] = vz; V[o + 3] = bias;
    X[o] = p1; X[o + 1] = p2; X[o + 2] = p3; X[o + 3] = seed;
  }
  // velocity-aligned diamond / 4-point star. dir (dx,dz) = travel; spin = sparkle angle
  star(x, y, z, size, aspect, dx, dz, spin, concave, c, hdr, alpha, core = 1) {
    this._w(K_STAR, x, y, z, size, aspect, 0, c, hdr, alpha, dx, 0, dz, 0.4, concave, spin, core, 0);
  }
  orb(x, y, z, size, squash, c, hdr, alpha, bright = 1, seed = 0, core = 1) {
    this._w(K_ORB, x, y, z, size, 1, 0, c, hdr, alpha, 0, 0, 0, 0.35, squash, bright, core, seed);
  }
  horizon(x, y, z, size, ring, alpha) { this._w(K_HORIZON, x, y, z, size, 1, 0, COL.body, 1.4, alpha, 0, 0, 0, 0.2, ring, 0, 0, 0); }
  glyph(x, y, z, size, c, hdr, alpha, write, unwrite, turn, seed, bias = 0.3) {
    this._w(K_GLYPH, x, y, z, size, 1, 0, c, hdr, alpha, 0, 0, 0, bias, write, unwrite, turn, seed);
  }
  rays(x, y, z, size, c, hdr, alpha, progress, seed) { this._w(K_RAYS, x, y, z, size, 1, 0, c, hdr, alpha, 0, 0, 0, 2.5, progress, 0, 0, seed); }
  flash(x, y, z, size, c, hdr, alpha, rot = 0, core = 1, bias = 2.5) { this._w(K_FLASH, x, y, z, size, 1, rot, c, hdr, alpha, 0, 0, 0, bias, core, 0, 0, 0); }
  voidDisc(x, y, z, size, alpha, c = COL.void) { this._w(K_VOID, x, y, z, size, 1, 0, c, 1, alpha, 0, 0, 0, 0.1, 0, 0, 0, 0); }
  // strip from A (u 0) to B (u 1): width ×taper and alpha ×falloff at B (linear in between)
  line(ax, ay, az, bx, by, bz, width, c, hdr, alpha, taper = 1, falloff = 1, core = 1) {
    this._w(K_LINE, ax, ay, az, width, 1, 0, c, hdr, alpha, bx, by, bz, 0, taper, falloff, core, 0);
  }
  glow(x, y, z, size, c, hdr, alpha) { this._w(9, x, y, z, size, 1, 0, c, hdr, alpha, 0, 0, 0, 0.3, 0, 0, 0, 0); }
  ghost(x, y, z, size, c, alpha) { this._w(K_GHOST, x, y, z, size, 2.1, 0, c, 1.3, alpha, 0, 0, 0, 0, 0, 0, 0, 0); }

  // ------------------------------------------------------------ immediate-mode matter
  matter(kind, x, y, z, s, rx, ry, rz, hex) {
    const M = kind ? this.matterT : this.matterP;
    if (M.n >= CAP_M) return;
    const i = M.n++;
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p3.set(x, y, z); _s3.set(s, s, s);
    _m4.compose(_p3, _q, _s3).toArray(M.mesh.instanceMatrix.array, i * 16);
    _c.set(hex); const a = M.mesh.instanceColor.array; a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b;
  }

  // ------------------------------------------------------------ rings (timed records)
  // A ring record lives until rec.life; owners may change its fields while alive.
  // opts: { air, tilt (rad toward the camera), y, write (s), rot (rad), spin (rad/s), color, hdr, alpha,
  //         back, style, seed, p1, p2, p3, fadeIn, quad (quad radius mult) }
  ring(kind, x, z, R, life, o = {}) {
    const r = this.ringFree.pop() ?? {};
    r.kind = kind; r.x = x; r.z = z; r.y = o.y ?? 0.05; r.R = R; r.quad = o.quad ?? (R + 0.25);
    r.life = life; r.t = 0; r.air = !!o.air; r.tilt = o.tilt ?? 0;
    r.writeDur = o.write ?? 0; r.unAt = Infinity; r.unDur = 0.4;
    r.rot = o.rot ?? Math.random() * 6.283; r.spin = o.spin ?? 0;
    r.c = o.color ?? COL.body; r.hdr = o.hdr ?? 1.4; r.alpha = o.alpha ?? 1; r.back = o.back ?? 0.5;
    r.style = o.style ?? 0; r.seed = o.seed ?? Math.random() * 10; r.p1 = o.p1 ?? 0; r.p2 = o.p2 ?? 0; r.p3 = o.p3 ?? 0;
    r.fadeIn = o.fadeIn ?? 0; r.fadeOut = o.fadeOut ?? 0; r.gen = (r.gen ?? 0) + 1; r.alive = true; r.onTick = o.onTick ?? null;
    this.rings.push(r);
    return r;
  }
  // start erasing a ring clockwise now (or end it at once if it has no write mask)
  unwriteRing(r, dur = 0.4) {
    if (!r.alive || r.unAt < Infinity) return;
    r.unAt = r.t; r.unDur = dur; r.life = Math.min(r.life, r.t + dur);
  }

  _ringW(M, kind, x, y, z, quad, rec, c, hdr, alpha, rot, write, unwrite, back, seed, style, p1, p2, p3, R = quad) {
    if (M.n >= CAP_R) return;
    const i = M.n++, o = i * 4;
    if (rec && rec.tilt) {
      _q.setFromAxisAngle(_p3.set(1, 0, -1).normalize(), rec.tilt);   // lean the normal toward the camera (+x+z)
    } else _q.identity();
    _p3.set(x, y, z); _s3.set(quad, 1, quad);
    _m4.compose(_p3, _q, _s3).toArray(M.mesh.instanceMatrix.array, i * 16);
    const A = M.attrs.iA.array, B = M.attrs.iB.array, D = M.attrs.iD.array, E = M.attrs.iE.array;
    A[o] = kind; A[o + 1] = rot; A[o + 2] = write; A[o + 3] = unwrite;
    B[o] = c[0]; B[o + 1] = c[1]; B[o + 2] = c[2]; B[o + 3] = hdr;
    D[o] = alpha; D[o + 1] = back; D[o + 2] = seed; D[o + 3] = style;
    E[o] = R; E[o + 1] = p1; E[o + 2] = p2; E[o + 3] = p3;
  }

  // ------------------------------------------------------------ timed bodies
  // type: 'flare' | 'glyph' | 'rays' | 'ghost' | 'line' | 'drop' (falling unwriting glyph)
  timed(type, x, y, z, size, life, o = {}) {
    const f = this.fxFree.pop() ?? {};
    f.type = type; f.x = x; f.y = y; f.z = z; f.size = size; f.life = life; f.t = -(o.delay ?? 0);
    f.c = o.color ?? COL.body; f.hdr = o.hdr ?? 1.6; f.alpha = o.alpha ?? 1; f.seed = o.seed ?? Math.random() * 50;
    f.vx = o.vx ?? 0; f.vy = o.vy ?? 0; f.vz = o.vz ?? 0; f.bx = o.bx ?? x; f.by = o.by ?? y; f.bz = o.bz ?? z;
    f.width = o.width ?? 0.1; f.rot = o.rot ?? Math.random() * 6.283; f.spin = o.spin ?? 0; f.write = o.write ?? 0.25;
    f.unwrite = o.unwrite ?? 0.3; f.core = o.core ?? 1; f.bias = o.bias ?? 0.3;
    this.fx.push(f);
    return f;
  }

  _tickFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t < 0) continue;
      if (f.t >= f.life) { this.fx[i] = this.fx[this.fx.length - 1]; this.fx.pop(); this.fxFree.push(f); continue; }
      const k = f.t / f.life;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      switch (f.type) {
        case 'flare': {
          // pop: overshoot then shrink
          const s = k < 0.3 ? 0.5 + (k / 0.3) * 0.7 : 1.2 * (1 - (k - 0.3) / 0.7) ** 1.5;
          this.flash(f.x, f.y, f.z, f.size * s, f.c, f.hdr, f.alpha, f.rot + f.t * f.spin, f.core);
          break;
        }
        case 'glyph': {
          // write on clockwise, hold, unwrite clockwise
          const lw = f.write, lu = f.unwrite;
          const write = Math.min(1, f.t / Math.max(lw * f.life, 1e-3));
          const un = Math.max(0, (f.t - (1 - lu) * f.life) / Math.max(lu * f.life, 1e-3));
          this.glyph(f.x, f.y, f.z, f.size * (1 + 0.15 * (1 - write)), f.c, f.hdr, f.alpha, write, un, f.rot + f.t * f.spin, f.seed, f.bias);
          break;
        }
        case 'drop': {
          f.vy -= 7 * dt;
          this.glyph(f.x, Math.max(0.1, f.y), f.z, f.size, f.c, f.hdr, f.alpha * (1 - k * 0.3), 1, k, f.rot + f.t * f.spin, f.seed);
          break;
        }
        case 'rays': this.rays(f.x, f.y, f.z, f.size, f.c, f.hdr, f.alpha * (1 - k * k), Math.sqrt(k), f.seed); break;
        case 'ghost': this.ghost(f.x, f.y, f.z, f.size, f.c, f.alpha * (1 - k)); break;
        case 'line': this.line(f.x, f.y, f.z, f.bx, f.by, f.bz, f.width * (1 - k * 0.5), f.c, f.hdr, f.alpha * (1 - k), 1, 0.2, f.core); break;
        default: break;
      }
    }
  }

  _tickRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) {
        r.alive = false;
        this.rings[i] = this.rings[this.rings.length - 1]; this.rings.pop(); this.ringFree.push(r); continue;
      }
      r.rot += r.spin * dt;
      r.onTick?.(r, dt);
      const write = r.writeDur > 0 ? Math.min(1, r.t / r.writeDur) : 1;
      const un = r.unAt < Infinity ? Math.min(1, (r.t - r.unAt) / r.unDur) : 0;
      let a = r.alpha;
      if (r.fadeIn > 0) a *= Math.min(1, r.t / r.fadeIn);
      if (r.fadeOut > 0) a *= Math.min(1, (r.life - r.t) / r.fadeOut);
      if (a <= 0.001) continue;
      this._ringW(r.air ? this.air : this.ground, r.kind, r.x, r.y, r.z, r.quad, r, r.c, r.hdr, a, r.rot,
        r.kind === R_SWIRL || r.kind === R_ACCRETION || r.kind === R_WAVE ? 1 : write, un, r.back, r.seed, r.style, r.p1, r.p2, r.p3, r.R);
    }
  }

  _upload(attr, n) {
    attr.clearUpdateRanges();
    if (n > 0) { attr.addUpdateRange(0, n * attr.itemSize); attr.needsUpdate = true; }
  }

  _flush() {
    for (const n of ['iP', 'iR', 'iC', 'iV', 'iX']) this._upload(this.bAttr[n], this.nb);
    this.bGeo.instanceCount = this.nb;
    this.bodies.visible = this.nb > 0;
    for (const M of [this.ground, this.air]) {
      M.mesh.count = M.n; M.mesh.visible = M.n > 0;
      if (M.n > 0) { M.mesh.instanceMatrix.needsUpdate = true; for (const a of Object.values(M.attrs)) this._upload(a, M.n); }
      M.n = 0;
    }
    for (const M of [this.matterP, this.matterT]) {
      M.mesh.count = M.n; M.mesh.visible = M.n > 0;
      if (M.n > 0) { M.mesh.instanceMatrix.needsUpdate = true; M.mesh.instanceColor.needsUpdate = true; }
      M.n = 0;
    }
    this.nb = 0;
  }

  update(dt) {
    this.t += dt;
    this.lastTick = this.vfx.time;
    this._tickRings(dt);
    this._tickFx(dt);
    this._flush();
  }

  // vfx.clear() dropped our zone (new run): forget timed effects and re-register
  _revive() {
    if (this.vfx.zones.includes(this.zone)) return;
    for (const r of this.rings) { r.alive = false; this.ringFree.push(r); }
    this.rings.length = 0;
    for (const f of this.fx) this.fxFree.push(f);
    this.fx.length = 0;
    this.nb = 0; this.ground.n = this.air.n = this.matterP.n = this.matterT.n = 0;
    this.vfx.zones.push(this.zone);
  }
}

// One kit per VFX instance.
export function arcaneKit(game) {
  const vfx = game.vfx;
  let k = vfx._arcaneKit;
  if (!k) k = vfx._arcaneKit = new ArcaneKit(vfx);
  else if (vfx.time !== k.lastTick) k._revive();       // not ticked since the last vfx.update: was it cleared?
  return k;
}

export const RING = { rune: R_RUNE, swirl: R_SWIRL, accretion: R_ACCRETION, wave: R_WAVE, seal: R_SEAL };

export function matterTint(game) { return MATTER_TINT[Math.max(0, Math.min(2, game.act ?? 0))]; }

// =====================================================================================
//  Helpers (also for the reactions bundle)
// =====================================================================================
const _pp = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };

// Converge -> pop: motes spawn on a circle (0.6·s) and rush in for 0.1 s, then a star flare pops.
// opts: { glyph (rune seal flash on the spot), sparks (count), color (lin rgb), mint }
export function convergePop(game, pos, s = 1, o = {}) {
  const K = arcaneKit(game), vfx = game.vfx;
  const y = pos.y ?? 0.9;
  const tier = K.tier();
  _pp.x = pos.x; _pp.y = y; _pp.z = pos.z;
  if (tier < 2) vfx.emit(o.mint ? 'arcaneConvergeMint' : 'arcaneConverge', _pp, { count: Math.max(3, Math.round(6 * s)), radius: 0.62 * s });
  K.timed('flare', pos.x, y, pos.z, 0.6 * s, 0.13, { delay: tier < 2 ? 0.07 : 0, color: o.color ?? COL.body, hdr: 1.7, core: 1 });
  if (o.glyph && tier < 2) K.timed('glyph', pos.x, y, pos.z, 0.45 * s, 0.24, { delay: 0.06, color: o.color ?? COL.body, hdr: 1.7, write: 0.2, unwrite: 0.45 });
  const sp = o.sparks ?? Math.round(4 * s);
  if (sp > 0 && tier < 2) vfx.emit(o.mint ? 'arcaneSparkMint' : 'arcaneSpark', _pp, { count: sp, scale: Math.min(1.2, 0.7 + 0.3 * s) });
}

// Rune circle with its OUTER line exactly at r (gameplay radius). Returns a handle for unwrite().
// opts: { write (s, clockwise inscribe), spin (rad/s), style (0 full, 1 thin, 2 double band), color, alpha, back }
export function runeCircle(game, pos, r, life = 1, o = {}) {
  const rec = arcaneKit(game).ring(R_RUNE, pos.x, pos.z, r, life, { write: 0.3, spin: 0.3, back: 0.5, ...o });
  return { rec, gen: rec.gen };
}
export function unwrite(handle, dur = 0.4) {
  if (!handle?.rec || handle.rec.gen !== handle.gen || !handle.rec.alive) return;
  const r = handle.rec;
  if (r.unAt < Infinity) return;
  r.unAt = r.t; r.unDur = dur; r.life = Math.min(r.life, r.t + dur);
}

export function glyphFlash(game, pos, size = 0.5, life = 0.3, o = {}) {
  arcaneKit(game).timed('glyph', pos.x, pos.y ?? 0.9, pos.z, size, life, { color: o.color ?? COL.body, hdr: o.hdr ?? 1.7, write: 0.25, unwrite: 0.4, ...o });
}

// A constellation: n star points along from -> to that twinkle out (stagger along the path).
export function starTrail(game, from, to, n = 6, o = {}) {
  const vfx = game.vfx;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    _pp.x = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 0.25;
    _pp.y = (from.y ?? 1) + ((to.y ?? 1) - (from.y ?? 1)) * t + (Math.random() - 0.5) * 0.3;
    _pp.z = from.z + (to.z - from.z) * t + (Math.random() - 0.5) * 0.25;
    vfx.emit(i % 3 === 1 ? 'arcaneStarHi' : 'arcaneStar', _pp, { count: 1, scale: o.scale ?? 1.4 });
  }
}

// Radial outward emit helper: n particles of `preset` evenly around pos with speed v (no vertical).
export function radialEmit(game, preset, pos, n, v, o = {}) {
  const vfx = game.vfx;
  const a0 = Math.random() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283;
    _dir.x = Math.cos(a); _dir.y = o.up ?? 0; _dir.z = Math.sin(a);
    vfx.emit(preset, pos, { count: 1, dir: _dir, cone: 1, speed: v, scale: o.scale ?? 1 });
  }
}

// =====================================================================================
//  StarBolt: the shared look of Arcane Bolt and Arcane Barrage missiles ("a sliver of starlight
//  that leaves a dotted constellation"). Attach to a Projectile with mesh: null:
//    const v = new StarBolt(game, { scale, len, needle, hot, dots, hand });
//    onUpdate: (g, p, dt) => v.update(g, p, dt)        onHit: v.hit(g, e, p)        onExpire: v.expire(g, p)
//  Tail = a tapered strip through the bolt's own path history (exact length, frame-rate independent,
//  curves with homing missiles). Head = void underlay + velocity-aligned diamond + spinning sparkle.
// =====================================================================================
const HN = 14;
export class StarBolt {
  // o: { scale (1 = 0.2 u wide head), len (tail m), needle (bool), hot (bool), dots (/s), stamp (s), hand (Vector3: visual launch point) }
  constructor(game, o = {}) {
    this.s = o.scale ?? 1;
    this.len = o.len ?? 0.9;
    this.needle = !!o.needle;
    this.hot = !!o.hot;
    this.dots = o.dots ?? 12;
    this.stamp = o.stamp ?? 0.12;
    this.prism = !!o.prism;
    this.hist = new Float32Array(HN * 3);
    this.hn = 0;
    this.dotAcc = Math.random() * 0.5; this.stampT = Math.random() * this.stamp; this.nDots = 0;
    this.spin = Math.random() * 6.283;
    this.off = o.hand ?? null;            // visual offset from the gameplay origin to the casting hand
    this.offT = 0.09;
  }

  update(game, p, dt) {
    const K = arcaneKit(game);
    const tier = K.tier();
    const s = this.s;
    let x = p.pos.x, y = p.pos.y, z = p.pos.z;
    if (this.off && p.age < this.offT) {
      const k = 1 - p.age / this.offT;
      x += this.off.x * k; y += this.off.y * k; z += this.off.z * k;
    }
    // path history (one point per 0.14 m)
    const H = this.hist;
    if (this.hn === 0 || (H[0] - x) ** 2 + (H[2] - z) ** 2 > 0.0196) {
      H.copyWithin(3, 0, (HN - 1) * 3);
      this.hn = Math.min(HN, this.hn + 1);
    }
    H[0] = x; H[1] = y; H[2] = z;
    this.spin += dt * 6;
    const dx = p.dir.x, dz = p.dir.z;
    const hdr = this.hot ? 2.0 : 1.6;
    // tail (drawn first, under the head)
    const L = tier >= 2 ? this.len * 0.5 : this.len;
    let acc = 0, w0 = 0.22 * s;
    let ax = x, ay = y, az = z;
    for (let i = 1; i < this.hn && acc < L; i++) {
      let bx = H[i * 3], by = H[i * 3 + 1], bz = H[i * 3 + 2];
      let seg = Math.hypot(bx - ax, by - ay, bz - az);
      if (seg < 1e-4) continue;
      if (acc + seg > L) { const f = (L - acc) / seg; bx = ax + (bx - ax) * f; by = ay + (by - ay) * f; bz = az + (bz - az) * f; seg = L - acc; }
      const u0 = acc / L, u1 = (acc + seg) / L;
      const wa = w0 * (1 - u0), wb = w0 * (1 - u1);
      K.line(ax, ay, az, bx, by, bz, wa, COL.body, hdr * 0.9, 0.85 * (1 - u0 * 0.7), wa > 1e-4 ? wb / wa : 0, (1 - u1 * 0.7) / (1 - u0 * 0.7), 1 - u0);
      acc += seg; ax = bx; ay = by; az = bz;
    }
    // head
    if (tier < 2) K.voidDisc(x, y, z, 0.62 * s, 0.4);
    K.glow(x, y, z, 0.72 * s, COL.body, this.hot ? 1.25 : 1.0, 1);
    K.star(x, y, z, 0.3 * s, 2.1, dx, dz, 0, 0.35, this.hot ? COL.hi : COL.body, hdr, 1, this.hot ? 1.6 : 1.25);
    K.flash(x, y, z, 0.66 * s, COL.hi, 1.8, 0.9, this.spin, 0.4);
    if (this.needle) K.line(x + dx * 0.1 * s, y, z + dz * 0.1 * s, x + dx * 0.55 * s, y, z + dz * 0.55 * s, 0.07 * s, COL.hi, 1.8, 1, 0, 0.3, 1);
    if (tier >= 2) return;
    // constellation dots hang where the bolt passed; tiny runes stamp in place
    this.dotAcc += dt * this.dots * K.budget();
    while (this.dotAcc >= 1) {
      this.dotAcc -= 1;
      this.nDots++;
      _pp.x = x - dx * 0.25 + (Math.random() - 0.5) * 0.18; _pp.y = y + (Math.random() - 0.5) * 0.2; _pp.z = z - dz * 0.25 + (Math.random() - 0.5) * 0.18;
      const pre = this.prism && this.nDots % 4 === 0 ? (this.nDots % 8 === 0 ? 'arcanePrismB' : 'arcanePrismA') : (Math.random() < 0.5 ? 'arcaneStar' : 'arcaneStarHi');
      game.vfx.emit(pre, _pp, { count: 1, scale: 1.3 * Math.max(0.8, s) });
    }
    this.stampT -= dt;
    if (this.stampT <= 0 && tier === 0) {
      this.stampT += this.stamp;
      _pp.x = x - dx * 0.4; _pp.y = y; _pp.z = z - dz * 0.4;
      game.vfx.emit('arcaneRuneStamp', _pp, { count: 1, scale: Math.max(0.8, s) });
    }
  }

  // projectile hit: converge-pop; a pierce-through gets a smaller flare and no glyph
  hit(game, e, p) {
    _pp.x = e.pos.x; _pp.y = chestY(e); _pp.z = e.pos.z;
    const through = p.pierce > 0;
    convergePop(game, _pp, (through ? 0.6 : 1) * Math.max(0.75, this.s), { glyph: !through, sparks: through ? 2 : 4 });
  }

  // range ran out: the sliver dissolves into a few stars
  expire(game, p) {
    if (p.travelled < p.range) return;
    _pp.x = p.pos.x; _pp.y = p.pos.y; _pp.z = p.pos.z;
    game.vfx.emit('arcaneStar', _pp, { count: 3, scale: 1.1 });
  }
}

// Chest height of a foe for hit flashes (from its gameplay radius; grunt ~0.95, troll ~1.4).
export function chestY(e) { return Math.min(1.6, 0.4 + (e.radius ?? 0.5) * 1.1); }
