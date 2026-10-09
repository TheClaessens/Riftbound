import { step } from './textures.js';

// =====================================================================================
//  Preset data. Skill authors add entries here; no shader knowledge needed.
//
//  PARTICLE preset (world metres, seconds; [a, b] = random range; curves = number | [[t, v], ...]
//  over normalised life, step([...]) = hard toon steps):
//    layer    'glow' (blend-add: rgb emits, alpha darkens ground) | 'paint' (opaque-ish painted,
//             2-tone sun-lit, reads WHITE on sand because of its ink edge)
//    cell     sprite: puff wisp flame streak star snowflake iceChip flake rune rune2 droplet ring
//             curl zigzag dot glint (streak/flame/droplet/iceChip/zigzag point UP = along velocity)
//    orient   'camera' (default) | 'ground' (flat decal-like) | 'orbit' (spirals into the emitter)
//    count, life, size, speed, up (vertical bias -1..1+), dir {x,y,z} + cone (0..1), spread (spawn
//    jitter radius), gravity (m/s^2, negative = rises), drag (1/s), stretch (velocity streak
//    factor, 0 = off), rot ('random' | number), spin (rad/s range)
//    orbit only: swirl (rad/s), pull (1/s radial decay), rise (m/s)
//    color    hex | [[t, hex, hdr]]  (glow wants hdr 1.4-2.4 for the bloom threshold of 1.1)
//    alpha    curve (default fade in 6% / out last 15%)
//    sizeCurve curve multiplier (default 1)
//    erode    curve 0..1 (stylised dissolve; default: none until the last 30%, then eats it)
//    fill     curve: glow = occlusion of the ground under the body (0.3-0.6), paint = opacity
//    ink      curve 0..1: dark outline band in a darker value of the same hue (the toon outline)
// =====================================================================================

const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const ERODE_END = [[0, 0], [0.7, 0], [1, 1]];

export const PARTICLES = {
  // ---------------------------------------------------------------- frost
  snowStreak: { layer: 'paint', cell: 'streak', life: [0.5, 0.75], size: [0.13, 0.17], stretch: 0.8,
    color: 0xffffff, alpha: FADE, fill: 0.95, ink: 0.9, erode: [[0, 0], [0.85, 0], [1, 0.8]] },
  snowflake: { layer: 'paint', cell: 'snowflake', life: [0.9, 1.4], size: [0.2, 0.32], spin: [-3, 3],
    color: 0xffffff, alpha: FADE, fill: 1, ink: 0.9, erode: ERODE_END },
  snowDrift: { layer: 'paint', cell: 'curl', orient: 'ground', life: [0.6, 0.9], size: [0.45, 0.8], stretch: 0.2,
    color: 0xf2f8ff, alpha: FADE, fill: 0.85, ink: 0.7, erode: [[0, 0.6], [0.2, 0], [0.7, 0.1], [1, 1]] },
  coldFog: { layer: 'paint', cell: 'puff', life: [1.6, 2.4], size: [1.5, 2.3], spin: [-0.2, 0.2], drag: 1,
    color: 0xeef6ff, alpha: [[0, 0], [0.25, 0.32], [0.75, 0.32], [1, 0]], fill: 0.6, ink: 0,
    erode: [[0, 0.5], [0.3, 0.1], [0.7, 0.15], [1, 0.9]] },
  iceChip: { layer: 'glow', cell: 'iceChip', count: 8, life: [0.4, 0.7], size: [0.14, 0.24], spin: [-8, 8],
    speed: [3, 6], up: 0.8, gravity: 14, drag: 1, color: [[0, 0xd8f6ff, 1.5], [1, 0x66d9ff, 1.25]], fill: 0.6, ink: 0.8, erode: ERODE_END },
  frostGlint: { layer: 'glow', cell: 'glint', count: 6, life: [0.3, 0.5], size: [0.3, 0.45], spin: [-1, 1], spread: 0.6,
    color: [[0, 0xe8fbff, 1.8], [1, 0x9fe9ff, 1.4]], fill: 0.3, ink: 0.5, sizeCurve: [[0, 0.3], [0.3, 1], [1, 0]] },
  // ---------------------------------------------------------------- fire
  // opaque toon flame: lit yellow / shadow orange / dark-red ink, HDR just over the bloom threshold
  flameLick: { layer: 'paint', cell: 'flame', life: [0.35, 0.55], size: [0.35, 0.55], gravity: -6, drag: 2, speed: [0.2, 0.8], up: 2,
    color: [[0, 0xffe070, 1.25], [0.35, 0xffb030, 1.15], [0.7, 0xff6a1a, 1.05], [1, 0x8a2a10, 0.9]],
    shade: [[0, 0xff7a1a, 1.05], [0.35, 0xe8501a, 1], [0.7, 0xb8300c, 1], [1, 0x4a1a10, 1]],
    fill: 1, ink: [[0, 0.5], [1, 0.9]], sizeCurve: [[0, 0.6], [0.3, 1], [1, 0.45]],
    erode: [[0, 0], [0.5, 0.15], [1, 1]] },
  ember: { layer: 'glow', cell: 'streak', count: 12, life: [0.5, 0.9], size: [0.06, 0.1], stretch: 0.12, speed: [3, 8], up: 1.2,
    gravity: 6, drag: 1.2, color: [[0, 0xffe08a, 2.4], [1, 0xff5a1a, 1.4]], fill: 0.3, ink: 0.4, erode: ERODE_END },
  smoke: { layer: 'paint', cell: 'puff', count: 6, life: [0.8, 1.3], size: [0.6, 1.0], spin: [-0.6, 0.6], gravity: -1.8, drag: 1.5,
    speed: [0.5, 1.5], up: 1, color: [[0, 0x4a3c37], [1, 0x8a807c]], alpha: [[0, 0], [0.1, 0.85], [1, 0.7]], fill: 0.85, ink: 0.35,
    sizeCurve: [[0, 0.5], [1, 1.4]], erode: [[0, 0], [0.4, 0.1], [1, 1]] },
  // opaque toon explosion puff that turns into smoke (stylised: no additive white-out when stacked)
  fireball: { layer: 'paint', cell: 'puff', count: 5, life: [0.3, 0.45], size: [1.1, 1.7], spin: [-1, 1], spread: 0.5, speed: [0.5, 2], up: 0.6,
    color: [[0, 0xffe070, 1.2], [0.35, 0xffa030, 1.1], [0.75, 0xb8481a, 1], [1, 0x4a3a36, 1]],
    shade: [[0, 0xf06a1a, 1], [0.35, 0xc8380c, 1], [0.75, 0x5a2410, 1], [1, 0x2a2220, 1]], fill: 1, ink: 0.7,
    sizeCurve: [[0, 0.4], [0.3, 1], [1, 1.1]], erode: [[0, 0], [0.3, 0], [1, 1]] },
  dustRing: { layer: 'paint', cell: 'puff', count: 12, life: [0.5, 0.8], size: [0.7, 1.1], speed: [6, 10], up: 0.05, drag: 4,
    spin: [-1, 1], color: 0xb59a72, alpha: [[0, 0.9], [1, 0.7]], fill: 0.85, ink: 0.5,
    sizeCurve: [[0, 0.4], [1, 1.3]], erode: [[0, 0], [0.5, 0.1], [1, 1]] },
  // ---------------------------------------------------------------- arcane
  arcaneMote: { layer: 'glow', cell: 'glint', orient: 'orbit', life: [0.9, 1.3], size: [0.18, 0.3], swirl: [2.5, 3.5], pull: [0.9, 1.3],
    rise: [0.3, 0.9], spin: [-2, 2], color: [[0, 0xd9b8ff, 1.8], [1, 0x8a4dff, 1.4]], fill: 0.4, ink: 0.7, erode: ERODE_END },
  vortexDebris: { layer: 'paint', cell: 'flake', orient: 'orbit', life: [1.0, 1.4], size: [0.16, 0.26], swirl: [3, 4], pull: [1, 1.4],
    rise: [0.4, 1.2], spin: [-6, 6], color: 0x6a5a4a, fill: 1, ink: 0.8, erode: ERODE_END },
  runeGlyph: { layer: 'glow', cell: 'rune', life: [0.7, 1.0], size: [0.35, 0.5], gravity: -1.5, drag: 2, speed: [0.2, 0.6], up: 2,
    color: [[0, 0xe8d8ff, 1.7], [0.3, 0xb67cff, 1.5], [1, 0x6a2adf, 1.1]], fill: 0.5, ink: 0.8, erode: [[0, 0], [0.6, 0], [1, 1]] },
  // ---------------------------------------------------------------- storm
  spark: { layer: 'glow', cell: 'streak', count: 10, life: [0.2, 0.35], size: [0.06, 0.1], stretch: 0.15, speed: [6, 12], up: 0.6,
    gravity: 10, drag: 2, color: [[0, 0xffffff, 2.4], [1, 0xffe14a, 1.6]], fill: 0.3, ink: 0.6 },
  sparkStar: { layer: 'glow', cell: 'star', count: 1, life: [0.12, 0.2], size: [0.9, 1.3], spin: [-2, 2],
    color: [[0, 0xfff6c0, 2.0], [1, 0xffe14a, 1.5]], fill: 0.4, ink: 0.8, sizeCurve: [[0, 0.6], [0.3, 1], [1, 0.2]] },
  rain: { layer: 'paint', cell: 'streak', life: [0.35, 0.45], size: [0.05, 0.07], stretch: 0.7,
    color: 0xc8dcf5, alpha: FADE, fill: 0.8, ink: 0.8 },
};

// SHELL styles: geo 'cylinder' | 'funnel' | 'dome' | 'torus'. ramp = colour by depth inside the shape
// (t = 0 at the eroded edge -> 1 deep inside), stepped for toon bands; alpha = occlusion (glow) or
// opacity (paint). tile[0] MUST be an integer (wraps around the mesh). scroll in tiles/s
// (+y scroll = features move DOWN, -y = rise). twist = spiral, erode = base threshold (0.1 dense ..
// 0.45 sparse), wobble = metres of boil at the top, frontAlpha = near-wall opacity mid-silhouette.
export const SHELLS = {
  snowVeil: { geo: 'cylinder', mode: 'paint', tile: [5, 1], scroll: [-0.7, 0.45], twist: 0.6, erode: 0.36, wobble: 0.06,
    fade: [0.4, 0.5], frontAlpha: 0.45,
    color: step([[0, 0x4a6f99], [0.14, 0xcfe6ff], [0.5, 0xffffff]]), alpha: step([[0, 0.85], [0.14, 0.5], [0.5, 0.65]]) },
  firePillar: { geo: 'cylinder', mode: 'glow', tile: [3, 1], scroll: [0.1, -1.4], twist: 0.2, erode: 0.2, wobble: 0.08,
    fade: [0.15, 0.4], frontAlpha: 0.7, hdr: 1,
    color: step([[0, 0x3a0a04], [0.15, 0xff5a1a, 1.3], [0.45, 0xffa040, 1.7], [0.75, 0xfff0b0, 2.2]]),
    alpha: step([[0, 0.8], [0.15, 0.45], [0.45, 0.35], [0.75, 0.3]]) },
  vortexFunnel: { geo: 'funnel', mode: 'glow', tile: [3, 1], scroll: [0.9, 0.35], twist: 1.2, erode: 0.24, wobble: 0.1,
    fade: [0.3, 0.3], frontAlpha: 0.55, hdr: 1,
    color: step([[0, 0x12051f], [0.15, 0x5a22c0, 1.0], [0.5, 0x9a5cff, 1.25], [0.8, 0xd8c0ff, 1.5]]),
    alpha: step([[0, 0.85], [0.15, 0.5], [0.5, 0.4], [0.8, 0.35]]) },
  // opaque toon fire dome (paint): dark ink edge, red, orange, yellow core; only the core is >1.1 (blooms)
  blastDome: { geo: 'dome', mode: 'paint', tile: [3, 1], scroll: [0, -1.4], twist: 0.3, erode: 0.12, wobble: 0,
    fade: [0.04, 0.26], frontAlpha: 0.9,
    color: step([[0, 0x4a1206], [0.1, 0xe0401a], [0.3, 0xff8a2a], [0.6, 0xffd060, 1.25]]),
    alpha: step([[0, 0.95], [0.1, 0.92], [0.3, 0.9], [0.6, 0.9]]) },
  arcaneDome: { geo: 'dome', mode: 'glow', tile: [4, 2], scroll: [0.6, -1.0], twist: 0.6, erode: 0.08, wobble: 0,
    fade: [0.04, 0.3], frontAlpha: 0.8, hdr: 1,
    color: step([[0, 0x12051f], [0.12, 0x8a4dff, 1.4], [0.4, 0xb67cff, 1.9], [0.7, 0xf4e8ff, 2.4]]),
    alpha: step([[0, 0.8], [0.12, 0.5], [0.4, 0.4], [0.7, 0.35]]) },
  frostRing: { geo: 'torus', mode: 'paint', tile: [6, 1], scroll: [1.2, 0.0], twist: 0, erode: 0.3, wobble: 0,
    fade: [0.15, 0.4], frontAlpha: 1,
    color: step([[0, 0x4a6f99], [0.14, 0xcfe6ff], [0.5, 0xffffff]]), alpha: step([[0, 0.9], [0.14, 0.7], [0.5, 0.85]]) },
};
