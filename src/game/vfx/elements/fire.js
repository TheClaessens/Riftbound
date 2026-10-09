import * as THREE from 'three';
import { step, mulberry32 } from '../textures.js';

// =====================================================================================
//  FIRE element VFX: the Ember Prime's forge (bible 10 §2.3). Owned by the fire VFX implementer.
//  Every fire effect has three layers: a tiny white-hot core (glow), an opaque toon flame body in
//  2-3 hard bands (paint), and a charcoal soot partner above/behind it (paint). Fire never passes
//  through red: it cools orange -> #A8441A -> #6A3A20 -> charcoal -> ash.
//
//  Registries (merged into the toolkit at load): PARTICLES, SHELLS, DEBRIS (all names 'fire*').
//  Shared helpers for other bundles (reactions, fusions):
//    fireBillow(game, pos, r, opts)   forge explosion whose edge reads at exactly r (billows, embers
//                                     landing on r, soot mushroom, dust shock, scorch r)
//    scorch(game, pos, r, glowLife, life, opts)  scorch decal whose ragged edge sits on r, glowing
//                                     ember cracks for glowLife s (glow = live), then dead char
//    emberSplash(game, pos, dir, n)   momentum ember splash continuing `dir`, embers land and glow
//    flameLicks(game, pos, r, n)      flame tongues racing out along the ground to r (gas flash)
//    spr(vfx, name, ...)              one sprite with explicit velocity / life / size / delay
//    moltenRock(scale) / iceCasing(scale)  shared-geometry meshes (basalt with molten facets, ice
//                                     casing with a molten core showing through) + ink hulls
//    fireTier(game)                   spam LOD 0 | 1 | 2 (bible 10 §5.5, keyed off fx.heat)
// =====================================================================================

const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const ERODE_END = [[0, 0], [0.7, 0], [1, 1]];

// palette (bible 10 §2.2). Nothing below hue 17 deg.
export const FIRE = {
  core: 0xfff4d6, hot: 0xffd25a, body: 0xff7a2a, edge: 0xe0561c,
  cool1: 0xa8441a, cool2: 0x6a3a20, soot: 0x2a1a14, char: 0x3a2a22, smoke: 0x4a3a34, ash: 0x8a7f76,
};

export const PARTICLES = {
  // Projectile head tongue: opaque toon flame, constant look (spawned every frame, life ~1.5 frames).
  fireHead: { layer: 'paint', cell: 'flame', life: [0.05, 0.05], size: 0.4,
    color: [[0, 0xffb238, 1.14], [1, 0xffb238, 1.14]], shade: [[0, 0xf06a1e, 1.0], [1, 0xf06a1e, 1.0]],
    alpha: 1, fill: 1, ink: 0.95, sizeCurve: 1, erode: 0 },
  // Puffy molten body (fireball orb, comet core): constant look, rotated per frame (boils).
  fireOrb: { layer: 'paint', cell: 'puff', life: [0.05, 0.05], size: 0.6,
    color: [[0, 0xffe48a, 1.22], [1, 0xffc040, 1.2]], shade: 0xff7a2a, alpha: 1, fill: 1, ink: 0.8, sizeCurve: 1, erode: 0 },
  // White-hot core / flash. Holds full size + alpha to t 0.7 (per-frame heads render at t 0.67).
  fireCore: { layer: 'glow', cell: 'dot', life: [0.07, 0.1], size: 0.3,
    color: [[0, FIRE.core, 2.3], [0.7, 0xfff0c0, 2.0], [1, FIRE.hot, 1.5]],
    alpha: [[0, 1], [0.75, 1], [1, 0]], fill: 0.3, ink: 0.35,
    sizeCurve: [[0, 0.7], [0.15, 1], [0.72, 1], [1, 0.35]], erode: 0 },
  // Ember streak: rises and sways by default (gravity -1.5); pass +gravity for splashes that land.
  fireEmber: { layer: 'glow', cell: 'streak', count: 10, life: [0.3, 0.5], size: [0.08, 0.11], stretch: 0.1,
    speed: [1, 3], up: 1, gravity: -1.5, drag: 1.5,
    color: [[0, 0xfff0b0, 2.4], [0.35, 0xffb040, 2.0], [0.8, FIRE.edge, 1.4], [1, FIRE.cool1, 1.1]],
    fill: 0.3, ink: 0.45, sizeCurve: [[0, 1], [1, 0.6]], erode: ERODE_END },
  // Toon flame tongue (zones, patches, crater cracks, dash): rises, cools through brown.
  fireLick: { layer: 'paint', cell: 'flame', rot: 0, life: [0.4, 0.6], size: [0.35, 0.55], gravity: -5, drag: 2,
    speed: [0.2, 0.8], up: 2, spin: [-0.6, 0.6],
    color: [[0, 0xffe080, 1.25], [0.25, 0xffb040, 1.15], [0.55, FIRE.body, 1.05], [0.85, FIRE.cool1, 1], [1, FIRE.cool2, 1]],
    shade: [[0, 0xff9030, 1.05], [0.25, FIRE.body, 1.0], [0.55, FIRE.edge, 1], [0.85, FIRE.cool2, 1], [1, FIRE.char, 1]],
    fill: 1, ink: [[0, 0.55], [1, 0.9]], sizeCurve: [[0, 0.5], [0.22, 1], [1, 0.4]],
    erode: [[0, 0], [0.5, 0.12], [1, 1]] },
  // Explosion billow: toon fire bands that turn into soot (alpha drops to <= 0.5 once it is smoke).
  fireBillow: { layer: 'paint', cell: 'puff', count: 6, life: [0.55, 0.8], size: [0.9, 1.2], spin: [-1, 1],
    speed: [0.5, 1.5], up: 0.6, gravity: -1.5, drag: 3,
    color: step([[0, 0xfff0b0, 1.25], [0.12, 0xffc848, 1.18], [0.3, 0xff9a34, 1.08], [0.5, 0x9a5226, 1], [0.68, FIRE.char, 1]]),
    shade: step([[0, 0xffa040, 1.05], [0.12, 0xff8a2a, 1.0], [0.3, FIRE.edge, 1.0], [0.5, 0x4a2a1a, 1], [0.68, FIRE.soot, 1]]),
    alpha: [[0, 1], [0.55, 1], [0.72, 0.5], [1, 0.35]], fill: 1, ink: 0.75,
    sizeCurve: [[0, 0.45], [0.22, 1], [1, 1.35]], erode: [[0, 0], [0.55, 0.06], [1, 1]] },
  // Charcoal soot (the dark partner). Painted alpha capped < 0.5 (bible 10 §5.4).
  fireSoot: { layer: 'paint', cell: 'puff', count: 4, life: [0.6, 0.9], size: [0.3, 0.42], spin: [-0.6, 0.6],
    speed: [0.2, 0.6], up: 1.5, gravity: -1.2, drag: 1.5,
    color: [[0, 0x3a2c26], [1, 0x5a504a]], shade: [[0, 0x1e1410], [1, 0x2e2622]],
    alpha: [[0, 0], [0.08, 0.5], [0.6, 0.42], [1, 0.3]], fill: 1, ink: 0.3,
    sizeCurve: [[0, 0.65], [1, 1.5]], erode: [[0, 0], [0.5, 0.06], [1, 1]] },
  // Ash flakes drifting up as things cool.
  fireAsh: { layer: 'paint', cell: 'flake', count: 4, life: [0.9, 1.4], size: [0.12, 0.17], spin: [-4, 4],
    speed: [0.5, 1.5], up: 1.2, gravity: -0.8, drag: 1.5, color: FIRE.ash, shade: 0x5a504a,
    alpha: FADE, fill: 1, ink: 0.7, erode: ERODE_END },
  // White-gold 4-point star (Starfall: fusion tell, constellation).
  fireStar: { layer: 'glow', cell: 'glint', count: 1, life: [0.3, 0.45], size: [0.32, 0.4], spin: [-1.5, 1.5],
    color: [[0, 0xffffff, 2.4], [1, FIRE.core, 1.9]], alpha: [[0, 1], [0.8, 1], [1, 0]], fill: 0.3, ink: 0.6,
    sizeCurve: [[0, 0.3], [0.12, 1], [0.75, 1], [1, 0]], erode: 0 },
  // Ground-flat char smudge (edge bands, blob shadows, crust plates).
  fireChar: { layer: 'paint', cell: 'puff', orient: 'ground', life: [1.0, 1.4], size: [0.5, 0.8],
    color: 0x2a1e18, shade: 0x2a1e18, alpha: [[0, 0], [0.08, 0.5], [0.7, 0.45], [1, 0]], fill: 0.9, ink: 0.15,
    erode: [[0, 0.3], [0.12, 0], [0.7, 0.08], [1, 1]] },
  // Ground-flat molten glow (lava floors, crater cracks). Only while the zone is live (glow = live).
  fireLava: { layer: 'glow', cell: 'puff', orient: 'ground', life: [0.7, 1.0], size: [0.8, 1.2], spin: [-0.3, 0.3],
    color: [[0, 0xffb040, 1.35], [0.5, 0xff8a2a, 1.2], [1, FIRE.edge, 1.05]],
    alpha: [[0, 0], [0.2, 1], [0.7, 0.8], [1, 0]], fill: 0.3, ink: 0.4,
    sizeCurve: [[0, 0.6], [0.3, 1], [1, 0.9]], erode: [[0, 0.4], [0.25, 0], [0.6, 0.1], [1, 1]] },
  // Steam (Frostfire Comet): painted white, never above linear 1.0.
  fireSteam: { layer: 'paint', cell: 'puff', count: 4, life: [0.6, 0.9], size: [0.5, 0.75], spin: [-0.8, 0.8],
    speed: [0.3, 1], up: 1.2, gravity: -1.5, drag: 2, color: [[0, 0xfffaf2], [1, 0xf4ece6]], shade: [[0, 0xe0d4cc], [1, 0xcfc4be]],
    alpha: [[0, 0], [0.1, 0.5], [1, 0.32]], fill: 1, ink: 0.35, sizeCurve: [[0, 0.5], [1, 1.6]], erode: [[0, 0], [0.4, 0.08], [1, 1]] },
};

export const SHELLS = {
  // opaque toon blast dome: charcoal ink edge, deep orange, orange, yellow core band (only it blooms)
  fireDome: { geo: 'dome', mode: 'paint', tile: [3, 1], scroll: [0, -1.4], twist: 0.3, erode: 0.12, wobble: 0,
    fade: [0.04, 0.2], frontAlpha: 0.9,
    color: step([[0, FIRE.char], [0.1, FIRE.edge], [0.3, 0xff8a2a], [0.6, 0xffd060, 1.22]]),
    alpha: step([[0, 0.95], [0.1, 0.92], [0.3, 0.9], [0.6, 0.9]]) },
  // flame column: eroding tongues rising off a ring
  fireColumn: { geo: 'cylinder', mode: 'paint', tile: [3, 1], scroll: [0.15, -1.9], twist: 0.25, erode: 0.2, wobble: 0.1,
    fade: [0.05, 0.25], frontAlpha: 0.8,
    color: step([[0, FIRE.char], [0.12, FIRE.edge], [0.32, 0xff8a2a], [0.6, 0xffd25a, 1.2]]),
    alpha: step([[0, 0.9], [0.12, 0.92], [0.32, 0.92], [0.6, 0.95]]) },
};

export const RECIPES = {};

export const DEBRIS = {
  // basalt chunk with ember cracks (meteor debris): glows, cools to charcoal, lies 1.2 s, sinks
  fireRock: { geo: 'chunk', color: 0x3a2a22, emis: [0xff8a2a, 1.6], cool: 1.3, scale: [0.15, 0.32], speed: [5, 8], up: 0.75,
    gravity: 20, bounce: 0.3, life: [1.5, 1.9] },
  // a single glowing coal (Cinder Bolt drop, slag crumbs): bounces once and gutters out
  fireCinder: { geo: 'chunk', color: 0x2a1a14, emis: [0xffa040, 2.2], cool: 0.5, scale: [0.06, 0.1], speed: [3, 5], up: 0.8,
    gravity: 22, bounce: 0.35, life: [0.45, 0.6] },
  // slag lump sprouting on a crater lip / patch edge; crumbles into cinders when the zone dies
  fireSlag: { geo: 'chunk', color: 0x4a3428, emis: [0xff7a2a, 0.75], cool: 4, scale: [0.18, 0.28], stretch: 0.7, life: [3, 3],
    shatter: 'fireCinder' },
};

// ---------------------------------------------------------------- sprites
const _rr = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r ?? 0);

// One sprite with explicit everything (undefined = preset default). delay > 0 = born later (free).
export function spr(vfx, name, x, y, z, vx, vy, vz, life, size, grav, drag, rot, stretch, delay = 0) {
  const p = vfx.preset(name), d = p.d;
  p.layer.spawn(x, y, z, vx, vy, vz, vfx.time + delay, life ?? _rr(d.life ?? [0.4, 0.6]),
    grav ?? d.gravity ?? 0, drag ?? d.drag ?? 0, size ?? _rr(d.size ?? 0.3), p.row,
    rot ?? (typeof d.rot === 'number' ? d.rot + (Math.random() - 0.5) * 0.3 : Math.random() * 6.283), _rr(d.spin ?? 0), stretch ?? d.stretch ?? 0, p.packed);
  vfx.heat += 1;
}

// Spam LOD (bible 10 §5.5): 0 full, 1 trails/debris halved, 2 starters head-only.
export function fireTier(game) {
  const h = game.fx?.heat ?? 0;
  const b = game.vfx?.budget() ?? 1;
  return h > 240 || b < 0.45 ? 2 : h > 80 || b < 0.7 ? 1 : 0;
}

// ---------------------------------------------------------------- decal budget
// The decal pool (128) is shared by every element and evicts the OLDEST when full, which could be
// someone's live blizzard. Fire keeps its own cap and ends its oldest scorch first.
const _decals = [];
export function fireDecal(game, kind, pos, radius, life, opts) {
  const v = game.vfx;
  for (let i = _decals.length - 1; i >= 0; i--) if (!_decals[i].alive || v.time - _decals[i].birth > _decals[i].life) _decals.splice(i, 1);
  const cap = fireTier(game) === 2 ? 8 : 26;
  while (_decals.length >= cap) _decals.shift().end(0.2);
  const h = v.decal(kind, pos, radius, life, opts);
  _decals.push(h);
  return h;
}

// Scorch whose ragged edge sits on r (the mask edge averages 0.92 of the decal radius).
// Glowing ember cracks cool over glowLife (glow = live); dead char holds until life.
export function scorch(game, pos, r, glowLife = 0.4, life = 1.5, o = {}) {
  return fireDecal(game, 'scorch', { x: pos.x, z: pos.z }, r / 0.92, life, {
    grow: o.grow ?? 0.1, fade: o.fade ?? 0.8, alpha: o.alpha ?? 0.62, color: 0x241a16,
    accent: o.accent ?? 0xffc04a, hdr: o.hdr ?? 2.0, intensity: o.intensity ?? 1, extra: 3 / Math.max(0.05, glowLife),
  });
}

// ---------------------------------------------------------------- composite helpers
// Momentum splash: n embers in a 120 deg cone along dir, arcing down to lie glowing on the ground.
export function emberSplash(game, pos, dir, n = 6) {
  const v = game.vfx;
  if (!v) return;
  const base = Math.atan2(dir?.z ?? 0, dir?.x ?? 1);
  n = Math.max(2, Math.round(n * v.budget()));
  for (let i = 0; i < n; i++) {
    const a = base + (Math.random() * 2 - 1) * (dir ? 1.05 : Math.PI);
    const s = 3 + Math.random() * 2.2;
    spr(v, 'fireEmber', pos.x, Math.max(0.3, pos.y ?? 0.8), pos.z, Math.cos(a) * s, 1.2 + Math.random() * 2, Math.sin(a) * s,
      0.65 + Math.random() * 0.25, 0.1, 9, 0.9);
  }
}

// Flame tongues racing out along the ground and stopping on r (gas flash / wildfire).
export function flameLicks(game, pos, r, n = 6, size = 1, puffs = 0) {
  const v = game.vfx;
  const k = 4.5, a0 = Math.random() * 6.283;
  // a ground-hugging ring of gas billows racing out to r (flash, then soot)
  for (let i = 0; i < puffs; i++) {
    const a = a0 + ((i + 0.5) / puffs) * 6.283 + (Math.random() - 0.5) * 0.4, life = 0.5 + Math.random() * 0.1;
    const v0 = (r * 0.92 * 7) / (1 - Math.exp(-7 * life));
    spr(v, 'fireBillow', pos.x + Math.cos(a) * 0.2, 0.3, pos.z + Math.sin(a) * 0.2, Math.cos(a) * v0, 0.6, Math.sin(a) * v0,
      life, (0.75 + Math.random() * 0.25) * size, 0, 7);
  }
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + (Math.random() - 0.5) * 0.5;
    const v0 = r * k * (0.92 + Math.random() * 0.1);
    spr(v, 'fireLick', pos.x + Math.cos(a) * 0.2, 0.35, pos.z + Math.sin(a) * 0.2, Math.cos(a) * v0, 1.2, Math.sin(a) * v0,
      0.32 + Math.random() * 0.08, (0.55 + Math.random() * 0.2) * size, -2, k, undefined, undefined, 0.02 + Math.random() * 0.04);
  }
}

// Forge explosion with its edge on r. o: { scale (counts), dome (bool), scorchLife, glow, dust, flash }
export function fireBillow(game, pos, r, o = {}) {
  const v = game.vfx;
  if (!v) return;
  const T = fireTier(game);
  const x = pos.x, z = pos.z, sz = Math.min(1.6, Math.max(0.75, r / 2.2));
  // I flash (0.06 s): white-hot, <= 0.6 r
  spr(v, 'fireCore', x, 0.7, z, 0, 0, 0, 0.09, Math.min(2.2, 0.6 * r) * (o.flash ?? 1));
  if (o.dome !== false && T < 2) v.shell('fireDome', { x, y: 0, z }, { radius: 0.48 * r, height: 0.4 * r, life: 0.26 });
  // I billow: puffs pushed radially to 0.75 r, rising, stepping yellow -> orange -> soot
  const nb = T === 2 ? 4 : Math.round(9 * (o.scale ?? 1));
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * 6.283 + Math.random() * 0.6;
    const v0 = 0.75 * r * 3 * (0.6 + Math.random() * 0.4);         // ease-out to <= 0.75 r
    spr(v, 'fireBillow', x + Math.cos(a) * 0.1 * r, 0.4, z + Math.sin(a) * 0.1 * r, Math.cos(a) * v0, 0.8 + Math.random() * 1.2, Math.sin(a) * v0,
      0.6 + Math.random() * 0.25, (1.0 + Math.random() * 0.35) * sz, -1.5, 3);
  }
  // mushroom stem: hot billows punching straight up through the middle
  if (T < 2) for (let i = 0; i < 3; i++) {
    spr(v, 'fireBillow', x + (Math.random() - 0.5) * 0.3, 0.5 + i * 0.35, z + (Math.random() - 0.5) * 0.3, 0, 3 + i * 1.2, 0,
      0.6 + i * 0.08, (1.25 - i * 0.12) * sz, -1.5, 2.5, undefined, undefined, i * 0.03);
  }
  // I embers: launched so they LAND on the radius (edge read)
  const ne = T === 2 ? 4 : Math.round(14 * (o.scale ?? 1));
  for (let i = 0; i < ne; i++) {
    const a = Math.random() * 6.283, vy = 2.6 + Math.random() * 0.8, tf = (2 * vy) / 8;
    const vh = (r * (0.88 + Math.random() * 0.12)) / tf;
    spr(v, 'fireEmber', x, 0.4, z, Math.cos(a) * vh, vy, Math.sin(a) * vh, tf + 0.25 + Math.random() * 0.2, 0.11, 8, 0);
  }
  // L soot mushroom cap
  if (T < 2) {
    const ns = Math.round(6 * (o.scale ?? 1));
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * 6.283, rr = Math.random() * 0.25 * r;
      spr(v, 'fireSoot', x + Math.cos(a) * rr, 0.9, z + Math.sin(a) * rr, Math.cos(a) * 0.5, 2.4 + Math.random() * 0.8, Math.sin(a) * 0.5,
        0.95 + Math.random() * 0.3, (0.75 + Math.random() * 0.3) * sz, -0.6, 1.6, undefined, undefined, 0.06 + Math.random() * 0.1);
    }
  }
  // I dust shock along the ground to r (knockback read)
  if (o.dust !== false && T < 2) game.fx.ring({ x, z }, { color: 0x8a6a4a, radius: r, life: 0.2, blend: 'dark', width: 0.16, occ: 0.55 });
  if (o.scorch !== false) scorch(game, pos, r, o.glow ?? 0.45, o.scorchLife ?? 2.4, { fade: 1.0, alpha: 0.7 });
}

// ---------------------------------------------------------------- meshes (shared, built once)
let _rock = null, _ice = null;
function facetedGeo(detail, seed, moltenFrac, flat = 0.85) {
  const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const pos = g.getAttribute('position');
  const rnd = mulberry32(seed);
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!jit.has(k)) jit.set(k, 0.78 + rnd() * 0.4);
    const s = jit.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * flat, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  // material groups: 0 = rock / ice, 1 = molten facet. Faces near the zero set of a sum of sines
  // form a connected crack network (not a random speckle).
  const faces = pos.count / 3;
  let cur = -1, start = 0;
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let f = 0; f < faces; f++) {
    const cx = (pos.getX(f * 3) + pos.getX(f * 3 + 1) + pos.getX(f * 3 + 2)) / 3;
    const cy = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
    const cz = (pos.getZ(f * 3) + pos.getZ(f * 3 + 1) + pos.getZ(f * 3 + 2)) / 3;
    const n = Math.abs(Math.sin(3.3 * cx + ph[0]) + Math.sin(3.1 * cy + ph[1]) + Math.sin(3.6 * cz + ph[2]));
    const m = n < moltenFrac ? 1 : 0;
    if (m !== cur) { if (cur >= 0) g.addGroup(start * 3, (f - start) * 3, cur); cur = m; start = f; }
  }
  g.addGroup(start * 3, (faces - start) * 3, cur);
  return g;
}
function hdr(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }

// Basalt with molten facets + dark ink hull. Returns a Group (shared geometry / materials: no dispose).
export function moltenRock(scale = 1) {
  if (!_rock) {
    const geo = facetedGeo(2, 11, 0.42);
    _rock = {
      geo,
      mats: [new THREE.MeshLambertMaterial({ color: 0x3a2a22, emissive: 0x1a0c06, flatShading: true }),
        new THREE.MeshBasicMaterial({ color: hdr(0xff8a2a, 1.9) })],
      hull: new THREE.MeshBasicMaterial({ color: 0x140c08, side: THREE.BackSide }),
    };
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(_rock.geo, _rock.mats);
  const hull = new THREE.Mesh(_rock.geo, _rock.hull);
  hull.scale.setScalar(1.1);
  g.add(body, hull);
  g.scale.setScalar(scale);
  g.userData.spin = body;
  g.userData.hull = hull;
  return g;
}

// Glacier-ice casing with a molten core glowing through the cracks + navy ink hull.
export function iceCasing(scale = 1) {
  if (!_ice) {
    const geo = facetedGeo(1, 23, 0.75, 1.0);
    _ice = {
      geo,
      mats: [new THREE.MeshLambertMaterial({ color: 0x5fa8d8, emissive: 0x10283a, flatShading: true }),
        new THREE.MeshBasicMaterial({ color: hdr(0xffa040, 2.0) })],
      hull: new THREE.MeshBasicMaterial({ color: 0x1b3a5c, side: THREE.BackSide }),
    };
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(_ice.geo, _ice.mats);
  const hull = new THREE.Mesh(_ice.geo, _ice.hull);
  hull.scale.setScalar(1.09);
  g.add(body, hull);
  g.scale.setScalar(scale);
  g.userData.spin = body;
  g.userData.hull = hull;
  return g;
}

// ---------------------------------------------------------------- projectile looks
// Per-frame sprites live 1.5 frames: spawned in the actor pass at vfx.time T, rendered at age dt,
// dead by the next render, so exactly one copy is ever drawn (no additive doubling).
const _h = new THREE.Vector3();

// Cinder Bolt / Starfall cinder. L: { rank, scale, star }. Call from Projectile.onUpdate.
export function cinderTrail(game, p, dt, L) {
  const v = game.vfx;
  if (!v || dt <= 0) return;
  const T = fireTier(game);
  let f = p._fx;
  if (!f) {
    f = p._fx = { e: Math.random(), s: Math.random(), hx: 0, hy: 0, hz: 0, hand: false };
    if (game.player?.hand) { game.player.hand(_h); f.hx = _h.x - p.pos.x; f.hy = _h.y - p.pos.y; f.hz = _h.z - p.pos.z; f.hand = true; }
  }
  const dx = p.dir.x, dz = p.dir.z;
  let x = p.pos.x, y = p.pos.y, z = p.pos.z;
  // the coal leaves the casting hand and settles onto the gameplay line within 0.08 s
  if (f.hand && p.age < 0.08) { const k = 1 - p.age / 0.08; x += f.hx * k; y += f.hy * k; z += f.hz * k; }
  const life = Math.min(0.06, dt * 1.5);
  const hot = L.rank >= 5, sc = L.scale * (L.rank >= 3 ? 1.15 : 1);
  // head tongue: tip trails backward (velocity -dir, stretched), round base on the coal
  const size = 0.5 * sc * (0.9 + Math.random() * 0.2);
  const vb = 2.2, len = size * (1 + 0.36 * vb);
  spr(v, 'fireHead', x - dx * (0.32 * len - vb * dt), y, z - dz * (0.32 * len - vb * dt), -dx * vb, 0, -dz * vb, life, size, 0, 0, 0, 0.36);
  // white-hot coal (front 30%; r5 front 50%)
  spr(v, 'fireCore', x + dx * 0.04, y, z + dz * 0.04, 0, 0, 0, life, (hot ? 0.3 : 0.2) * sc, 0, 0, 0);
  if (L.star && T < 2) spr(v, 'fireStar', x + dx * 0.05, y + 0.02, z + dz * 0.05, 0, 0, 0, life, 0.3 * sc, 0, 0, game.vfx.time * 5);
  // ember streaks: rise and sway (convection)
  const b = v.budget();
  f.e += dt * 25 * (L.rank >= 3 ? 1.3 : 1) * b * (T === 0 ? 1 : 0.5);
  while (f.e >= 1) {
    f.e -= 1;
    const side = (Math.random() * 2 - 1) * 0.6;
    spr(v, 'fireEmber', x - dx * 0.25, y + (Math.random() - 0.5) * 0.12, z - dz * 0.25,
      -dx * 2.5 - dz * side * 1.6, 0.6 + Math.random(), -dz * 2.5 + dx * side * 1.6, 0.28 + Math.random() * 0.16, 0.1 * sc,
      undefined, undefined, undefined, 0.22);
  }
  // soot thread: hangs in the air after the bolt has gone (dropped at tier 2)
  if (T < 2) {
    f.s += dt * 10 * b;
    while (f.s >= 1) {
      f.s -= 1;
      spr(v, 'fireSoot', x - dx * 0.25, y + 0.05, z - dz * 0.25, (Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3,
        hot ? 1.0 : 0.55, (0.3 + Math.random() * 0.08) * sc, -0.6, 1.2);
    }
  }
}

// Cinder impact. pass = true while the bolt punches through (r5 pierce).
export function cinderHit(game, p, L, e, pass) {
  const v = game.vfx;
  if (!v) return;
  const T = fireTier(game), x = p.pos.x, y = p.pos.y, z = p.pos.z;
  if (pass) {
    spr(v, 'fireCore', x, y, z, 0, 0, 0, 0.07, 0.32);
    if (T < 2) for (let i = 0; i < 4; i++) spr(v, 'fireAsh', x, y + 0.1, z, p.dir.x * 1.5 + (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), p.dir.z * 1.5 + (Math.random() - 0.5) * 1.5);
    return;
  }
  spr(v, 'fireCore', x, y, z, 0, 0, 0, 0.08, 0.45 * (L.scale ?? 1));
  emberSplash(game, p.pos, p.dir, T === 2 ? 3 : L.rank >= 5 ? 10 : 6);
  if (T < 2) spr(v, 'fireSoot', x, y + 0.15, z, p.dir.x * 0.4, 0.9, p.dir.z * 0.4, 0.7, 0.36, -0.6, 1.6);
}

// Bolt ran out of range: the coal drops, bounces once and gutters out.
export function cinderDrop(game, p) {
  const v = game.vfx;
  if (!v) return;
  const T = fireTier(game);
  if (T === 0 || (T === 1 && Math.random() < 0.4)) v.debris('fireCinder', { x: p.pos.x, y: p.pos.y - 0.3, z: p.pos.z }, 1, { dir: p.dir, cone: 0.95, speed: 0.8 });
  spr(v, 'fireSoot', p.pos.x, p.pos.y, p.pos.z, p.dir.x * 0.8, 0.5, p.dir.z * 0.8, 0.6, 0.26, -0.6, 1.6);
}

// ---------------------------------------------------------------- meteor kit
// Impact of a falling chunk of the Prime (Meteor, Starfall's falling star, Cataclysm).
// o: { scale (1 = Meteor; debris / counts / column), column (bool), dome (bool) }
export function meteorBurst(game, pos, R, o = {}) {
  const v = game.vfx;
  if (!v) return;
  const s = o.scale ?? 1, T = fireTier(game);
  const x = pos.x, z = pos.z, P = { x, y: 0, z };
  spr(v, 'fireCore', x, 0.9, z, 0, 0, 0, 0.09, 1.4 * Math.min(1.6, s));
  if (T < 2 && o.dome !== false) v.shell('fireDome', P, { radius: 0.36 * R, height: 0.34 * R, life: 0.3 });
  if (T < 2 && o.column !== false) v.shell('fireColumn', P, { radius: 0.5 * Math.min(1.6, s), height: 2.5 * Math.min(1.6, s), life: 0.38 });
  // billows that stay inside the crater, rising
  const nb = T === 2 ? 3 : Math.round(6 * Math.min(1.6, s));
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * 6.283 + Math.random() * 0.5, v0 = 0.35 * R * 3;
    spr(v, 'fireBillow', x, 0.5, z, Math.cos(a) * v0, 1.5 + Math.random(), Math.sin(a) * v0, 0.6 + Math.random() * 0.25, (1.0 + Math.random() * 0.3) * Math.min(1.5, s), -1.5, 3);
  }
  // dust rolling out along the ground to exactly R, then lifting (edge read)
  const nd = T === 2 ? 5 : Math.round(10 * Math.min(1.6, s));
  for (let i = 0; i < nd; i++) {
    const a = (i / nd) * 6.283 + Math.random() * 0.4, v0 = 4 * R * 0.93;
    spr(v, 'dustRing', x + Math.cos(a) * 0.3, 0.3, z + Math.sin(a) * 0.3, Math.cos(a) * v0, 0.5, Math.sin(a) * v0, 0.6 + Math.random() * 0.25, (0.8 + Math.random() * 0.3) * Math.min(1.4, s), -0.8, 4);
  }
  // embers + basalt debris landing inside R
  const ne = T === 2 ? 6 : Math.round(20 * Math.min(1.6, s));
  for (let i = 0; i < ne; i++) {
    const a = Math.random() * 6.283, vy = 3 + Math.random() * 3, sp = (0.3 + Math.random() * 0.6) * R * 1.5;
    spr(v, 'fireEmber', x, 0.5, z, Math.cos(a) * sp, vy, Math.sin(a) * sp, 0.6 + Math.random() * 0.4, 0.12, 7, 0.6);
  }
  if (T < 2) v.debris('fireRock', P, Math.round(12 * s), { scale: Math.min(1.5, 0.8 + 0.25 * s), speed: Math.min(1.25, 0.6 + 0.12 * R) });
  game.fx.ring(P, { color: 0x8a6a4a, radius: R, life: 0.24, blend: 'dark', width: 0.14, occ: 0.6 });
}

// A molten crater zone (visual only). o: { R (crater radius), life, flames, embers, lava (bool), lip (n) }
// Returns { update(dt) } driven by the gameplay actor; it ends by itself after life (+ dead residue).
export function craterFx(game, pos, o) {
  const v = game.vfx;
  const R = o.R, L = o.life, P = { x: pos.x, y: 0, z: pos.z };
  // bowl + slag lip (crater mask lip sits at ~0.52 of the decal radius); dead residue holds 1.2 s
  fireDecal(game, 'crater', P, R / 0.52, L + 1.2, { grow: 0.08, fade: 1.0, color: 0x241a16, accent: 0x8a6a4a, intensity: 0, extra: 1 });
  // molten crack network: glowing only while it deals damage
  fireDecal(game, 'scorch', P, R * 1.02, L, { grow: 0.05, fade: 0.45, alpha: 0.32, color: 0x241a16, accent: 0xffb040, hdr: 2.1, intensity: 1.25, extra: 0.35 / Math.max(1, L) });
  // slag lip lumps on the gameplay radius; they glow, cool, crumble at end-of-damage
  const nl = o.lip ?? Math.round(6 + R * 1.6);
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * 6.283 + Math.random() * 0.4, rr = R * (0.97 + Math.random() * 0.06);
    v.sprout('fireSlag', { x: P.x + Math.cos(a) * rr, z: P.z + Math.sin(a) * rr }, { scale: (1.2 + Math.random() * 0.8) * Math.min(1.4, 0.7 + R * 0.12), life: L, tilt: 0.5 });
  }
  const flames = [];
  const nf = o.flames ?? 4;
  for (let i = 0; i < nf; i++) {
    const a = Math.random() * 6.283, rr = R * (0.15 + Math.random() * 0.55);
    flames.push({ x: P.x + Math.cos(a) * rr, z: P.z + Math.sin(a) * rr, acc: Math.random(), s: 0.9 + Math.random() * 0.5 });
  }
  let t = 0, eA = 0, sA = 0, lA = 0, cA = 0;
  return {
    update(dt) {
      t += dt;
      if (t >= L) return false;
      const k = Math.min(1, (L - t) / (0.4 * L));        // last 40%: cracks dim, flames gutter
      const b = v.budget();
      for (const f of flames) {
        f.acc += dt * 10 * b * (0.4 + 0.6 * k);
        while (f.acc >= 1) {
          f.acc -= 1;
          spr(v, 'fireLick', f.x + (Math.random() - 0.5) * 0.25, 0.15, f.z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.4, 0.6, (Math.random() - 0.5) * 0.4,
            undefined, (0.7 + Math.random() * 0.35) * f.s * (0.5 + 0.5 * k));
        }
      }
      eA += dt * (o.embers ?? 16) * b * k;
      while (eA >= 1) {
        eA -= 1;
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * R * 0.9;
        spr(v, 'fireEmber', P.x + Math.cos(a) * rr, 0.2, P.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4);
      }
      sA += dt * 4 * b;
      while (sA >= 1) {
        sA -= 1;
        const a = Math.random() * 6.283, rr = Math.random() * R * 0.6;
        spr(v, 'fireSoot', P.x + Math.cos(a) * rr, 0.6, P.z + Math.sin(a) * rr, 0, 1.4, 0, 1.1, 0.45, -0.8, 1.4);
      }
      if (o.lava) {
        lA += dt * (o.lavaRate ?? 8) * b * k;
        while (lA >= 1) {
          lA -= 1;
          const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * R * 0.72;
          spr(v, 'fireLava', P.x + Math.cos(a) * rr, 0.06, P.z + Math.sin(a) * rr, 0, 0, 0, undefined, (1.0 + Math.random() * 0.5) * Math.min(1.6, R * 0.35));
        }
        cA += dt * (o.crustRate ?? 5) * b;
        while (cA >= 1) {
          cA -= 1;
          const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * R * 0.75;
          spr(v, 'fireChar', P.x + Math.cos(a) * rr, 0.08, P.z + Math.sin(a) * rr, Math.cos(a + 1.6) * 0.25, 0, Math.sin(a + 1.6) * 0.25, 1.4 + Math.random() * 0.6, 0.5 + Math.random() * 0.5);
        }
      }
      return true;
    },
  };
}

// A chunk of the Prime falling onto target (visual only; the caller owns the timing).
// o: { scale, height, from {x,y,z} (default: up-left), tail, shadow (r), rock (mesh scale mult), star (white-gold head) }
// Returns { update(k, dt) with k = 0..1 of the fall, end() }.
export function fallingRockFx(game, target, o = {}) {
  const v = game.vfx, s = o.scale ?? 1, H = o.height ?? 22;
  const from = o.from ?? { x: target.x - 4, y: H, z: target.z - 4 };
  const group = moltenRock(0.62 * s * (o.rock ?? 1));
  const pos = new THREE.Vector3(from.x, from.y, from.z);
  group.position.copy(pos);
  game.scene.add(group);
  const body = group.userData.spin, hull = group.userData.hull;
  const tail = o.tail ?? 1;
  const fire = o.star ? null : v?.trail(pos, { color: 0xff8a2a, width: 1.1 * s * tail, hdr: 1.6, segLen: 0.5 });
  const smoke = o.star ? null : v?.trail(pos, { color: 0x2a1a14, width: 0.8 * s * tail, hdr: 1, segLen: 0.65 });
  const fall = o.fall ?? 0.8;
  v?.decal('shadow', { x: target.x, z: target.z }, (o.shadow ?? 1.6) * s, fall + 0.1, { grow: fall, fade: 0.1, alpha: 0.5, color: 0x140c08 });
  let acc = 0, eAcc = 0, done = false;
  return {
    pos,
    update(k, dt) {
      const a = 1 - k;
      pos.set(target.x + (from.x - target.x) * a, 0.8 * s + (from.y - 0.8 * s) * a * a, target.z + (from.z - target.z) * a);
      group.position.copy(pos);
      body.rotation.x += dt * 5; body.rotation.y += dt * 3;
      hull.rotation.copy(body.rotation);
      if (!v || dt <= 0) return;
      const b = v.budget();
      acc += dt * 50 * b * Math.min(1.5, s);
      while (acc >= 1) {
        acc -= 1;
        spr(v, 'fireLick', pos.x + (Math.random() - 0.5) * 0.5 * s, pos.y + (Math.random() - 0.5) * 0.5 * s, pos.z + (Math.random() - 0.5) * 0.5 * s,
          (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.3, (0.6 + Math.random() * 0.4) * Math.min(1.6, s));
      }
      eAcc += dt * 30 * b;
      while (eAcc >= 1) {
        eAcc -= 1;
        spr(v, 'fireEmber', pos.x, pos.y, pos.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.5, 0.13);
      }
      const life = Math.min(0.06, dt * 1.5);
      spr(v, 'fireCore', pos.x, pos.y, pos.z, 0, 0, 0, life, (o.star ? 1.2 : 0.9) * Math.min(1.6, s), 0, 0, 0);
      if (o.star) {
        spr(v, 'fireStar', pos.x, pos.y, pos.z, 0, 0, 0, life, 1.3 * s, 0, 0, v.time * 3);
        // shooting-star streak tail (~3 u) instead of a ribbon: a stretched ember along the fall line
        const vx = (from.x - target.x), vy = (from.y - 0.8 * s) * 2 * a, vz = (from.z - target.z);
        const vl = Math.hypot(vx, vy, vz) || 1, L = 3;
        spr(v, 'fireEmber', pos.x + vx / vl * L * 0.5, pos.y + vy / vl * L * 0.5, pos.z + vz / vl * L * 0.5, vx / vl * 0.01, vy / vl * 0.01, vz / vl * 0.01,
          life, 0.42 * s, 0, 0, 0, (L / (0.42 * s) - 1) / 0.01);
      }
    },
    end() {
      if (done) return; done = true;
      game.scene.remove(group);
      fire?.stop(); smoke?.stop();
    },
  };
}
