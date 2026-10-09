import { ELEMENT_COLOR } from '../../core/utils.js';
import { spr, fireBillow } from './elements/fire.js';
import { frostCreep } from './elements/frost.js';
import { stormBolt, groundArcs, later } from './elements/storm.js';
import { arcaneKit, runeCircle, unwrite, COL } from './elements/arcane.js';
import { MIX, mixTier, gate, crowded, mixDecal, earth, underStrand, fuse, prismGlints } from './elements/mixed.js';

// =====================================================================================
//  Combat visuals (reactions, status events, ward / barrier breaks, kills). combat.js keeps all
//  gameplay (damage, statuses, hit-stop) and calls these for the look. Every function is
//  visual-only: never deal damage or change state here.
//    pos: Vector3 (y = 0) · r: the gameplay radius (already × area) — effects must show it exactly
//
//  Bible 10 §4.4: each reaction is the collision of its two parent elements, louder than the skills
//  that trigger it, <= 0.6 s of bright content, edge read at exactly r. Spam control (reactions fire
//  many times a second at high Chain):
//    - echo (isEcho) = a lighter after-pulse; a repeat of the same reaction within ~0.4 r / 0.15 s is
//      MERGED into a small accent (one big read instead of a white-out)
//    - mixTier (fx.heat / vfx.budget) trims counts; token buckets cap decals, rings, lights, shakes
//    - Chain >= 10 adds prism glints (one per 5 Chain, cap 5)
// =====================================================================================

const rnd = (a, b) => a + Math.random() * (b - a);
const bodyY = (e) => Math.min(2.2, Math.max(0.5, (e?.topY ?? 1.5) * (e?.visScale ?? 1) * 0.55));
const _p = { x: 0, y: 0, z: 0 };
const P = (x, y, z) => { _p.x = x; _p.y = y; _p.z = z; return _p; };

// shared per-call intensity: 1 full, lower for echo / merged / hot frames
function level(game, key, pos, r, isEcho) {
  // merge: same reaction close by within 0.15 s; budget: <= 4 full reads / s per type, <= 10 / s in total.
  // Anything past that plays as a lite accent (counts ×0.3, small, no decal / ring / light / shake).
  let merged = crowded(game, key, pos, Math.max(0.8, r * 0.4), 0.15);
  if (!merged && !isEcho && !(gate(game, 'rx-' + key, 4, 3) && gate(game, 'rxAll', 10, 6))) merged = true;
  const T = mixTier(game);
  const k = (isEcho ? 0.45 : merged ? 0.3 : 1) * (T === 2 ? 0.55 : T === 1 ? 0.8 : 1);
  return { k, merged: merged || isEcho, T };
}
const n = (base, k, min = 1) => Math.max(min, Math.round(base * k));
const light = (game, pos, col, I, life) => { if (gate(game, 'mixLight', 8, 3)) game.fx.light(pos, col, I, life); };
const shake = (game, s) => { if (gate(game, 'mixShake', 6, 2)) game.fx.shake(s); };

export const REACTION_FX = {
  // ---------------------------------------------------------------------------------- STEAM BURST
  // Fire ↔ Chill/Frozen. r = 2.8 × area. Superheated vapour explodes from the foe: a hiss flash, painted
  // white-to-peach billows easing out to EXACTLY r in 0.25 s, scalding droplets flung to r, a wet stain
  // whose edge sits on r and dries from the edge, then the vapour rises and dissolves.
  steam(game, pos, { r, enemy, isEcho }) {
    const v = game.vfx;
    if (!v) return;
    const { k, merged } = level(game, 'steam', pos, r, isEcho);
    const x = pos.x, z = pos.z, y = bodyY(enemy);
    const wasIce = enemy && v.status?.consume(enemy);       // its ice shell sizzles into vapour (no thaw chips)
    spr(v, 'mixedSteamFlash', x, y, z, 0, 0, 0, 0.07, merged ? 0.8 : 1.3);
    // 0-0.25 s: billows race out and STOP with their outer edge on r (drag 12: 95% of the way at 0.25 s)
    const sz = Math.min(1.5, Math.max(0.85, r / 2.8));
    const nb = n(12, k, 3), a0 = Math.random() * 6.283;
    for (let i = 0; i < nb; i++) {
      const a = a0 + (i / nb) * 6.283 + rnd(-0.15, 0.15);
      const s = rnd(2.0, 2.5) * sz * (merged ? 0.6 : 1), D = Math.max(0.3, r - 0.33 * s);
      const v0 = D * 12;
      spr(v, 'mixedSteam', x + Math.cos(a) * 0.2, 0.6, z + Math.sin(a) * 0.2, Math.cos(a) * v0, rnd(0.5, 1.5), Math.sin(a) * v0,
        rnd(0.5, 0.62), s, -5, 12);
    }
    // inner body of the cloud + the hot column rising off the foe
    const ni = merged ? 0 : n(3, k, 1);
    for (let i = 0; i < ni; i++) {
      const a = a0 + (i / ni) * 6.283 + 0.6, v0 = r * 0.4 * 12;
      spr(v, 'mixedSteam', x, 0.9, z, Math.cos(a) * v0, rnd(1, 2), Math.sin(a) * v0, rnd(0.5, 0.6), rnd(2.2, 2.6) * sz, -5, 12);
    }
    if (!merged) spr(v, 'mixedSteam', x, y * 0.9, z, 0, 3, 0, 0.55, 2.0 * sz, -3, 3);
    // 0.25-1.2 s: vapour rises from the ring and dissolves (born late: the dissipation beat)
    const nv = merged ? 1 : n(8, k, 2);
    for (let i = 0; i < nv; i++) {
      const a = Math.random() * 6.283, rr = r * rnd(0.3, 0.75);
      spr(v, 'mixedVapour', x + Math.cos(a) * rr, 0.9, z + Math.sin(a) * rr, Math.cos(a) * 0.4, rnd(0.8, 1.4), Math.sin(a) * 0.4,
        rnd(0.8, 1.05), rnd(1.7, 2.2) * sz, -1.6, 1.4, undefined, undefined, rnd(0.2, 0.32));
    }
    // 0.05-0.4 s: droplets flung out, landing near r
    const nd = n(8, k, 2);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * 6.283, vy = rnd(2.4, 3.4), y0 = 0.7, g = 14;
      const tf = (vy + Math.sqrt(vy * vy + 2 * g * y0)) / g, vh = r * rnd(0.72, 0.98) / tf;
      spr(v, 'mixedDroplet', x, y0, z, Math.cos(a) * vh, vy, Math.sin(a) * vh, tf + 0.03, undefined, g, 0, undefined, undefined, 0.04);
    }
    if (wasIce) { v.emit('iceChip', P(x, y, z), { count: 5, scale: 0.8 }); v.emit('frostPuff', P(x, y * 0.6, z), { count: 3, scale: 1.2 }); }
    if (!merged && gate(game, 'steamWet', 4, 2)) {
      // wet ground: the mask edge averages ~0.88 of the decal radius -> the stain's edge sits on r
      mixDecal(game, 'wet', P(x, 0, z), r / 0.88, 1.3, { grow: 0.22, fade: 0.7, alpha: 0.32 });
    }
    prismGlints(game, pos, y);
    if (!merged) { light(game, pos, 0xfff0e2, 30, 0.25); shake(game, 0.18); }
  },

  // ---------------------------------------------------------------------------------- OVERLOAD
  // Fire ↔ Shock. r = 3.2 × area × overloadRadius; knockback 14. A thunderclap fireball full of
  // lightning: white-gold flash, forge billow, 5-7 ground arcs crawling out and ENDING at r, a dust
  // shock to r, clods thrown outward, scorch with lemon fulgurite lines cooling, soot column.
  overload(game, pos, { r, enemy, isEcho }) {
    const v = game.vfx;
    if (!v) return;
    const { k, merged, T } = level(game, 'overload', pos, r, isEcho);
    const x = pos.x, z = pos.z;
    void enemy;
    spr(v, 'stormFlash', x, 0.9, z, 0, 0, 0, 0.08, merged ? 1.0 : 1.9);
    fireBillow(game, pos, r, { scale: Math.max(0.35, k), dust: false, glow: 0.6, scorchLife: 2.2, scorch: !merged, dome: !merged, flash: merged ? 0.6 : 1 });
    // ground arcs: storm's own bolts, flattened, tips exactly on r
    groundArcs(game, pos, r, merged ? 2 : T === 2 ? 4 : 6, { width: 0.24, life: 0.2, from: 0.4 });
    if (!merged) {
      // dust shock rolling out to r (painted soil puffs, drag-stopped on the edge)
      const dn = T === 2 ? 8 : 12, a0 = Math.random() * 6.283, dname = 'mixedDust' + Math.max(0, Math.min(2, game.act ?? 0));
      for (let i = 0; i < dn; i++) {
        const a = a0 + (i / dn) * 6.283, D = r * 0.9, kd = 7, life = 0.55;
        const v0 = D * kd / (1 - Math.exp(-kd * life));
        spr(v, dname, x + Math.cos(a) * 0.3, 0.25, z + Math.sin(a) * 0.3, Math.cos(a) * v0, 0.3, Math.sin(a) * v0, life, rnd(0.8, 1.05), 0, kd);
      }
      v.debris('mixedClod', P(x, 0, z), T === 2 ? 3 : 6, { color: earth(game), speed: Math.min(1.25, Math.max(0.8, r / 3.4)) });
      // fulgurite: lemon glassy lines fused into the scorch, cooling to dark
      const nf = T === 2 ? 3 : 5;
      for (let i = 0; i < nf; i++) {
        const a = Math.random() * 6.283, c = Math.cos(a), s = Math.sin(a), L = r * rnd(0.45, 0.65), sp = 0.25;
        spr(v, 'stormFulgurite', x + c * r * 0.5, 0.05, z + s * r * 0.5, c * sp, 0, s * sp, rnd(0.9, 1.2), 0.12, 0, 0, undefined, (L / 0.12 - 1) / sp);
      }
    }
    prismGlints(game, pos, 1.2, 1);
    if (!merged) { light(game, pos, 0xffa040, 60, 0.35); shake(game, 0.3); }
  },

  // ---------------------------------------------------------------------------------- SUPERCONDUCT
  // Frost ↔ Shock: arcs to up to 4 foes within 6.5 × area. Ice-blue lightning that frosts what it
  // touches: lemon-cored bolts with an ice-blue glow and a NAVY under-strand, lemon flecks and ice
  // crystals falling along the path, a rime flash + chips on every target, frost creep at the source.
  superconduct(game, pos, { targets, enemy, isEcho }) {
    const v = game.vfx;
    if (!v) return;
    const { k, merged } = level(game, 'superconduct', pos, 1.2, isEcho);
    const x = pos.x, z = pos.z, y = bodyY(enemy);
    v.emit('iceChip', P(x, y, z), { count: n(8, k, 2) });
    spr(v, 'frostStar', x, y, z, 0, 0, 0, 0.11, merged ? 0.7 : 1.5);
    if (!merged) spr(v, 'stormFlash', x, y, z, 0, 0, 0, 0.08, 1.2);
    if (!merged && gate(game, 'scCreep', 5, 2)) frostCreep(game, P(x, 0, z), 2, 0.15, 0.7, { alpha: 0.3, fade: 0.4, intensity: 1.3 });
    for (const t of targets) {
      const ty = bodyY(t);
      const from = P(x, y, z);
      const fx = from.x, fy = from.y, fz = from.z;
      const s = stormBolt(game, { x: fx, y: fy, z: fz }, { x: t.pos.x, y: ty, z: t.pos.z },
        { color: MIX.ice, width: isEcho ? 0.26 : 0.42, hdr: 1.9, twigs: isEcho ? 0 : 2, twigLen: [0.4, 0.9], life: 0.2, restrike: !isEcho });
      if (s && !isEcho) underStrand(game, s.pts, s.n, { width: 1.25, life: 0.16, hdr: 1.2 });
      // along the arc: ice crystals shaken loose (falling) + a couple of lemon flecks (storm signature)
      const nc = isEcho ? 2 : 4;
      for (let i = 0; i < nc; i++) {
        const u = (i + rnd(0.2, 0.8)) / nc;
        spr(v, 'iceChip', fx + (t.pos.x - fx) * u, fy + (ty - fy) * u, fz + (t.pos.z - fz) * u, rnd(-0.6, 0.6), rnd(0, 1), rnd(-0.6, 0.6),
          rnd(0.4, 0.55), rnd(0.16, 0.22), 14, 1);
      }
      const u = rnd(0.3, 0.7);
      v.emit('stormGlint', P(fx + (t.pos.x - fx) * u, fy + (ty - fy) * u, fz + (t.pos.z - fz) * u), { count: isEcho ? 1 : 2 });
      // the target: rime flash + 3 chips
      spr(v, 'frostStar', t.pos.x, ty, t.pos.z, 0, 0, 0, 0.09, 0.7);
      v.debris('frostChip', P(t.pos.x, ty * 0.6, t.pos.z), 3, { scale: 1.2 });
    }
    prismGlints(game, pos, y);
    if (!merged) { light(game, pos, 0x9ff3ff, 30, 0.25); shake(game, 0.12); }
  },

  // ---------------------------------------------------------------------------------- SHATTER
  // Arcane → Frozen: shards r = 2.2 × area. The frozen shell explodes into glass: a violet-rimmed crack
  // star, 12-16 ice shards with violet rim light blasted out (gravity 14) and landing INSIDE r, white
  // glitter, a splinter of radial cracks to r on a frost patch.
  shatter(game, pos, { r, enemy, isEcho }) {
    const v = game.vfx;
    if (!v) return;
    const { k, merged } = level(game, 'shatter', pos, r, isEcho);
    const x = pos.x, z = pos.z, y = bodyY(enemy);
    v.status?.consume(enemy);                             // the crust is this explosion now (no thaw chips)
    spr(v, 'mixedSnapStar', x, y, z, 0, 0, 0, 0.11, merged ? 1.1 : 2.4);
    spr(v, 'frostStar', x, y, z, 0, 0, 0, 0.06, 1.2);
    v.debris('mixedShard', P(x, Math.min(1.4, y * 0.8), z), n(rnd(12, 16.99) | 0, k, 4), { speed: Math.pow(r / 2.2, 0.6) });
    v.debris('frostChipV', P(x, y * 0.6, z), n(8, k, 2), { scale: 1.3 });
    v.emit('iceChip', P(x, y, z), { count: n(10, k, 3), scale: 1.1, speed: 1.2 });
    v.emit('arcaneSpark', P(x, y, z), { count: n(10, k, 3), scale: 1.1 });
    if (!merged) {
      if (gate(game, 'shatterCreep', 5, 2)) frostCreep(game, P(x, 0, z), r * 0.5, 0.08, 0.85, { alpha: 0.3, fade: 0.45, intensity: 1.4 });
      // splinter: radial cracks shooting out to r
      const nc = 7, a0 = Math.random() * 6.283;
      for (let i = 0; i < nc; i++) {
        const a = a0 + (i / nc) * 6.283 + rnd(-0.2, 0.2), c = Math.cos(a), s = Math.sin(a), L = r * rnd(0.8, 0.98), sp = 0.3, size = 0.15;
        spr(v, 'mixedCrack', x + c * L * 0.5, 0.04, z + s * L * 0.5, c * sp, 0, s * sp, rnd(0.75, 0.85), size, 0, 0, undefined, (L / size - 1) / sp);
      }
    }
    prismGlints(game, pos, y);
    if (!merged) { light(game, pos, 0xd8b8ff, 35, 0.2); shake(game, 0.1); }
  },

  // ---------------------------------------------------------------------------------- COMBUST
  // Arcane → Burn: splash r = 2.2 × area; Burn spreads to `spread` (≤ 3 foes within 4 u).
  // The burn implodes, then erupts: the foe's flames rush INTO it (arcane inward motion), a white-hot pop,
  // 8 flame tongues racing out in a ring to r, a violet glyph ring flashing at r; the spread flies as
  // ember fuses on 0.25 s parabolas (never lightning). Palette: ember orange + violet, no pink.
  combust(game, pos, { r, spread, enemy, isEcho }) {
    const v = game.vfx;
    if (!v) return;
    const { k, merged } = level(game, 'combust', pos, r, isEcho);
    const x = pos.x, z = pos.z, y = bodyY(enemy);
    const D = 0.06;                                       // implosion time
    v.emit('mixedEmberIn', P(x, y, z), { count: n(9, k, 3), radius: 1.0 });
    spr(v, 'fireCore', x, y, z, 0, 0, 0, 0.09, merged ? 1.0 : 1.7, 0, 0, undefined, undefined, D);
    // flame tongues in a ring, stopping on r (drag 4.5 over 0.34 s covers 78% of v0 / 4.5)
    const nt = n(10, k, 4), a0 = Math.random() * 6.283, sz = Math.min(1.3, Math.max(0.8, r / 2.2));
    for (let i = 0; i < nt; i++) {
      const a = a0 + (i / nt) * 6.283 + rnd(-0.12, 0.12), life = rnd(0.32, 0.36);
      const v0 = (r * 0.9 - 0.2) * 4.5 / (1 - Math.exp(-4.5 * life));
      spr(v, 'fireLick', x + Math.cos(a) * 0.2, 0.4, z + Math.sin(a) * 0.2, Math.cos(a) * v0, 1.3, Math.sin(a) * v0,
        life, rnd(1.0, 1.25) * sz, -2, 4.5, undefined, undefined, D + rnd(0, 0.02));
    }
    if (!merged) {
      for (let i = 0; i < 4; i++) spr(v, 'fireBillow', x + rnd(-0.3, 0.3), y * 0.8, z + rnd(-0.3, 0.3), rnd(-1, 1), rnd(1.5, 2.5), rnd(-1, 1),
        rnd(0.45, 0.6), rnd(1.1, 1.4) * sz, -1.5, 3, undefined, undefined, D);
      // gas flash: a ground-hugging ring of billows racing out to ~0.7 r behind the tongues
      for (let i = 0; i < 6; i++) {
        const a = a0 + ((i + 0.5) / 6) * 6.283, life = 0.45, kd = 7, v0 = (r * 0.62) * kd / (1 - Math.exp(-kd * life));
        spr(v, 'fireBillow', x, 0.35, z, Math.cos(a) * v0, 0.5, Math.sin(a) * v0, life, rnd(1.0, 1.2) * sz, 0, kd, undefined, undefined, D);
      }
      v.emit('fireEmber', P(x, y, z), { count: 8 });
      // violet glyph ring on r: writes on fast, holds a beat, unwrites (arcane residue)
      if (gate(game, 'mixRing', 6, 3)) {
        const h = runeCircle(game, P(x, 0, z), r, 0.42, { write: 0.1, color: COL.body, hdr: 1.6, style: 1, alpha: 0.95 });
        later(game, 0.2, () => unwrite(h, 0.2));
      }
    }
    for (const e of spread ?? []) fuse(game, P(x, y + 0.2, z), e, { dur: 0.25, delay: D, ty: bodyY(e), arc: 1.1 + Math.random() * 0.4 });
    prismGlints(game, pos, y);
    if (!merged) { light(game, pos, 0xffb070, 32, 0.25); shake(game, 0.2); }
  },

  // ---------------------------------------------------------------------------------- ARC FLASH
  // Arcane → Shock: stuns everything within r = 3 × area for 1.2 s. A flashbulb: a white flash sprite
  // (never fullscreen), 8 radial light rays for 0.12 s, starlight sparks, a violet glyph ring drawn at r.
  arcflash(game, pos, { r, enemy, isEcho }) {
    const v = game.vfx;
    if (!v) return;
    const { k, merged } = level(game, 'arcflash', pos, r, isEcho);
    const x = pos.x, z = pos.z, y = bodyY(enemy);
    const K = arcaneKit(game);
    K.timed('flare', x, y, z, merged ? 1.4 : 3.0, 0.08, { color: COL.core, hdr: 2.5, core: 1 });
    if (!merged) K.timed('rays', x, y, z, Math.min(5, r * 1.3), 0.13, { color: COL.hi, hdr: 2.0 });
    v.emit('arcaneSpark', P(x, y, z), { count: n(10, k, 3) });
    v.emit('stormGlint', P(x, y, z), { count: n(3, k, 1) });
    if (!merged && gate(game, 'mixRing', 6, 3)) {
      const h = runeCircle(game, P(x, 0, z), r, 0.4, { write: 0.12, color: COL.body, hdr: 1.6, style: 1, alpha: 0.95 });
      later(game, 0.2, () => unwrite(h, 0.18));
    }
    prismGlints(game, pos, y);
    if (!merged) { light(game, pos, 0xf4e8ff, 50, 0.2); shake(game, 0.12); }
  },
};

// A foe just became Frozen (Chill reached freezeAt): 8 chips + a white crack flash (the crust grows in
// status.js). Budgeted: a mass Superconduct can freeze 100+ foes in one frame.
export function frozenFx(game, enemy) {
  const v = game.vfx;
  if (!v || !gate(game, 'frozenFx', 40, 20)) return;
  const y = bodyY(enemy);
  spr(v, 'frostStar', enemy.pos.x, y, enemy.pos.z, 0, 0, 0, 0.09, 0.85);
  v.debris('frostChip', P(enemy.pos.x, y * 0.5, enemy.pos.z), mixTier(game) === 2 ? 4 : 8, { scale: 1.1 });
}

// A Burn tick landed (every 0.5 s while Burning): a crackle of embers off the flames (the flames
// themselves are the rig shader band + status.js licks).
export function burnTickFx(game, enemy) {
  const v = game.vfx;
  if (!v || !gate(game, 'burnTick', 40, 10)) return;
  const sc = enemy.visScale ?? 1, top = (enemy.topY ?? 1.5) * sc;
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * 6.283, rr = (enemy.baseRadius ?? 0.5) * sc * 0.6;
    spr(v, 'fireEmber', enemy.pos.x + Math.cos(a) * rr, top * rnd(0.6, 0.9), enemy.pos.z + Math.sin(a) * rr, Math.cos(a) * 0.6, rnd(1.5, 2.6), Math.sin(a) * 0.6,
      rnd(0.35, 0.5), 0.1, -1.5, 1.5);
  }
}

// Prism Ward broken by a reaction (el = the ward's element): its glass shell bursts into tinted splinters.
const WARD_FLASH = { fire: 'fireStar', frost: 'frostStar', storm: 'stormFlash', arcane: 'mixedSnapStar' };
export function wardBreakFx(game, enemy, el) {
  const v = game.vfx;
  if (!v) return;
  const y = bodyY(enemy), col = ELEMENT_COLOR[el] ?? 0xffffff;
  spr(v, WARD_FLASH[el] ?? 'frostStar', enemy.pos.x, y, enemy.pos.z, 0, 0, 0, 0.1, 1.4);
  spr(v, 'mixedPop', enemy.pos.x, y, enemy.pos.z, 0, 0, 0, 0.18, 2.4);
  v.debris('mixedWardShard', P(enemy.pos.x, y * 0.6, enemy.pos.z), 12, { color: col, scale: 1.2 });
  v.emit('arcaneStar', P(enemy.pos.x, y, enemy.pos.z), { count: 4, scale: 1.4 });
}

// A Prism Hexer barrier was depleted: the lavender bubble pops.
export function barrierBreakFx(game, enemy) {
  const v = game.vfx;
  if (!v) return;
  const y = bodyY(enemy);
  spr(v, 'mixedPop', enemy.pos.x, y, enemy.pos.z, 0, 0, 0, 0.18, 2.2);
  v.debris('mixedWardShard', P(enemy.pos.x, y * 0.6, enemy.pos.z), 6, { color: 0xc8a8ff });
  v.emit('arcaneStarHi', P(enemy.pos.x, y, enemy.pos.z), { count: 4, scale: 1.3 });
}

// A foe died (the rig plays its own topple; this is the puff). The most frequent event in the game:
// a light, earthy read: a couple of biome-soil dust puffs and a few small chunks tinted toward the
// foe's colour. Bosses get a proper dust ring and rubble.
export function killFx(game, enemy) {
  const v = game.vfx;
  if (!v) return;
  const x = enemy.pos.x, z = enemy.pos.z;
  const dname = 'mixedDust' + Math.max(0, Math.min(2, game.act ?? 0));
  if (enemy.boss) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 6.283, v0 = 7;
      spr(v, dname, x + Math.cos(a) * 0.8, 0.4, z + Math.sin(a) * 0.8, Math.cos(a) * v0, 0.5, Math.sin(a) * v0, rnd(0.7, 0.9), rnd(1.4, 1.9), -0.6, 3.5);
    }
    v.debris('rock', P(x, 0.5, z), 12, { color: earth(game) });
    v.debris('mixedGib', P(x, 1, z), 10, { color: tint(enemy.deathColor, earth(game)), speed: 2, scale: 1.6 });
    return;
  }
  const sc = enemy.visScale ?? 1;
  const full = gate(game, 'kill', 50, 25);
  const nd = full ? 2 : 1;
  for (let i = 0; i < nd; i++) {
    const a = Math.random() * 6.283;
    spr(v, dname, x + Math.cos(a) * 0.2, 0.3, z + Math.sin(a) * 0.2, Math.cos(a) * 1.2, rnd(0.4, 0.9), Math.sin(a) * 1.2,
      rnd(0.5, 0.65), rnd(0.95, 1.2) * Math.min(1.8, (enemy.baseRadius ?? 0.5) * 2 * sc), -0.8, 3);
  }
  if (full && mixTier(game) < 2) v.debris('mixedGib', P(x, 0.4, z), 3, { color: tint(enemy.deathColor, earth(game)), scale: Math.min(1.5, sc) });
}

// foe colour pulled halfway toward the soil (earthy, never a saturated red splash)
function tint(a, b) {
  if (a === undefined || a === null) return b;
  const r = (((a >> 16) & 255) + ((b >> 16) & 255)) >> 1, g = (((a >> 8) & 255) + ((b >> 8) & 255)) >> 1, bl = ((a & 255) + (b & 255)) >> 1;
  return (r << 16) | (g << 8) | bl;
}
