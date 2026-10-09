import * as THREE from 'three';
import { ELEMENT_COLOR } from '../../../core/utils.js';
import { spr, fireTier, scorch, flameLicks, fireDecal } from '../elements/fire.js';

// =====================================================================================
//  FIRE hero visuals (owned by the fire VFX implementer; design/VFX.md, bible 10 §4.5–4.6, bible 09 §5).
//  Flame Dash, its fire patches, Wildfire, Pyromancer idle FX (chimney embers…), fire cast flashes.
//  Visual only: never deal damage or change gameplay state.
// =====================================================================================
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ---------------------------------------------------------------- Flame Dash
// Flame Dash starts (5 u / 0.16 s). from = start point, player.dash.dir = direction.
export function dashStart(game, player, from) {
  game.fx.burst(from, { color: player.cls.hex, count: 7, speed: 4, life: 0.35, size: 0.35, up: 0.8 });
  const v = game.vfx;
  if (!v) return;
  const d = player.dash?.dir ?? player.facing;
  // shoulder-charge kick-off: a flame burst off the back + a soot cough
  for (let i = 0; i < 4; i++) {
    spr(v, 'fireSoot', from.x + (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.5, from.z + (Math.random() - 0.5) * 0.5,
      -d.x * 1.2 + (Math.random() - 0.5), 1 + Math.random(), -d.z * 1.2 + (Math.random() - 0.5), 0.9, 0.45 + Math.random() * 0.15, -0.6, 1.5);
  }
  for (let i = 0; i < 5; i++) {
    spr(v, 'fireLick', from.x, 0.3 + Math.random() * 0.6, from.z, -d.x * 3 + (Math.random() - 0.5) * 2, 1.5, -d.z * 3 + (Math.random() - 0.5) * 2,
      0.35, 0.5 + Math.random() * 0.25);
  }
  spr(v, 'fireCore', from.x, 0.8, from.z, 0, 0, 0, 0.08, 0.7);
}

// every ~0.03 s while dashing: flame tongues stream back off the shoulders
export function dashTrail(game, player, dir) {
  const v = game.vfx;
  if (!v) return;
  const p = player.pos;
  for (let i = 0; i < 3; i++) {
    const s = (Math.random() - 0.5) * 0.7;
    spr(v, 'fireLick', p.x - dir.z * s, 0.5 + Math.random() * 0.8, p.z + dir.x * s, -dir.x * 5 + (Math.random() - 0.5), 1.2, -dir.z * 5 + (Math.random() - 0.5),
      0.3 + Math.random() * 0.1, 0.8 + Math.random() * 0.35);
  }
  if (Math.random() < 0.6) spr(v, 'fireSoot', p.x, 1.0 + Math.random() * 0.4, p.z, -dir.x * 2, 1.2, -dir.z * 2, 0.8, 0.38, -0.6, 1.5);
  spr(v, 'fireEmber', p.x, 0.3, p.z, -dir.x * 3 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, -dir.z * 3 + (Math.random() - 0.5) * 2, 0.5, 0.1);
}
export function dashHit() {}

// ---------------------------------------------------------------- Flame Dash fire patches
// Flame Dash fire patch (r 1.2 × area, 2 s; one every 0.9 u of the path). patch: { pos, r, life, maxLife }
// A run of patches = one continuous scorch strip (width 2r), tongues every ~0.45 u, embers;
// flames die in age order (start of the trail first), then the strip holds 0.8 s as dead scorch.
const _patches = [];
export function firePatchStart(game, patch) {
  const v = game.vfx;
  if (!v) return;
  // visual merge: a patch on top of a still-young one only refreshes it (repeated dashes in place)
  let merged = false;
  for (const q of _patches) {
    if (q.life > 1.0 && Math.hypot(q.pos.x - patch.pos.x, q.pos.z - patch.pos.z) < 0.45) { merged = true; break; }
  }
  const f = patch._fx = { merged, acc: Math.random(), eAcc: Math.random(), flames: [] };
  if (!merged) {
    scorch(game, patch.pos, patch.r, patch.maxLife * 0.8, patch.maxLife + 0.8, { alpha: 0.5, grow: 0.12, fade: 0.8, intensity: 1.1 });
    // two tongues across the strip (every ~0.45 u along it)
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.283, rr = patch.r * (0.15 + Math.random() * 0.45);
      f.flames.push({ x: patch.pos.x + Math.cos(a) * rr, z: patch.pos.z + Math.sin(a) * rr, s: 0.8 + Math.random() * 0.45, ph: Math.random() * 6 });
    }
  }
  _patches.push(patch);
}
export function firePatchUpdate(game, patch, dt) {
  const f = patch._fx, v = game.vfx;
  if (!f || f.merged || !v) return;
  const k = Math.min(1, Math.max(0, patch.life / 0.4));     // last 0.4 s: tongues shrink
  const b = v.budget(), T = fireTier(game);
  f.acc += dt * 11 * b * (T === 2 ? 0.5 : 1);
  while (f.acc >= 1) {
    f.acc -= 1;
    const fl = f.flames[(Math.random() * f.flames.length) | 0];
    if (!fl) break;
    const sway = Math.sin(v.time * 9.4 + fl.ph) * 0.35;      // ~1.5 Hz sway
    spr(v, 'fireLick', fl.x + (Math.random() - 0.5) * 0.2, 0.12, fl.z + (Math.random() - 0.5) * 0.2, sway, 0.5, sway * 0.5,
      undefined, (0.62 + Math.random() * 0.3) * fl.s * (0.35 + 0.65 * k));
  }
  f.eAcc += dt * 7 * b * k;
  while (f.eAcc >= 1) {
    f.eAcc -= 1;
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * patch.r * 0.85;
    spr(v, 'fireEmber', patch.pos.x + Math.cos(a) * rr, 0.15, patch.pos.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.5);
  }
}
export function firePatchEnd(game, patch) {
  const i = _patches.indexOf(patch);
  if (i >= 0) _patches.splice(i, 1);
  const v = game.vfx;
  if (v && patch._fx && !patch._fx.merged && fireTier(game) < 2) {
    for (let j = 0; j < 2; j++) spr(v, 'fireAsh', patch.pos.x + (Math.random() - 0.5) * patch.r, 0.2, patch.pos.z + (Math.random() - 0.5) * patch.r, 0, 0.8, 0);
  }
}

// ---------------------------------------------------------------- Wildfire
// A burning foe died and explodes (r 2.2 × area): its flames flare, then a ground-licking gas
// flash races out to r, a soot puff, and a scorch r that glows 0.4 s then lies dead.
// Spam: up to 6 per frame. Explosions within 1.2 u (×1.5 at tier 1) of a recent one merge.
const _wild = [];
const _tok = { n: 4, t: 0 };
export function wildfire(game, pos, r) {
  const v = game.vfx;
  if (!v) return;
  const T = fireTier(game);
  const mr = T === 0 ? 1.2 : 1.8;
  for (let i = _wild.length - 1; i >= 0; i--) if (v.time - _wild[i].t > 0.3) _wild.splice(i, 1);
  for (const w of _wild) {
    if (Math.hypot(w.x - pos.x, w.z - pos.z) < mr) {
      spr(v, 'fireEmber', pos.x, 0.5, pos.z, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3);
      return;
    }
  }
  if (_wild.length >= 12) _wild.shift();
  _wild.push({ x: pos.x, z: pos.z, t: v.time });
  // global rate limit: ~10 full explosions/s (burst of 4); beyond that a cheap edge-only read
  _tok.n = Math.min(4, _tok.n + Math.max(0, v.time - _tok.t) * (T === 0 ? 10 : 6)); _tok.t = v.time;
  if (_tok.n < 1) {
    spr(v, 'fireCore', pos.x, 0.7, pos.z, 0, 0, 0, 0.08, 0.7);
    flameLicks(game, pos, r, 4, 1.0);
    return;
  }
  _tok.n -= 1;
  // 0–0.08: the corpse's flames flare
  spr(v, 'fireCore', pos.x, 0.7, pos.z, 0, 0, 0, 0.1, 1.1);
  if (T < 2) {
    for (let i = 0; i < 3; i++) spr(v, 'fireLick', pos.x + (Math.random() - 0.5) * 0.4, 0.4, pos.z + (Math.random() - 0.5) * 0.4, 0, 3, 0, 0.32, 1.0 + Math.random() * 0.4);
    // the gas pops: a squat billow on the corpse
    spr(v, 'fireBillow', pos.x, 0.5, pos.z, 0, 1.6, 0, 0.5, 1.15, -1.5, 3, undefined, undefined, 0.04);
  }
  // 0.08–0.3: gas flash licking out along the ground to r
  flameLicks(game, pos, r, T === 0 ? 5 : 3, 1.25, T === 0 ? 9 : T === 1 ? 6 : 0);
  if (T < 2) spr(v, 'fireSoot', pos.x, 0.9, pos.z, 0, 1.8, 0, 1.0, 0.8, -0.6, 1.4, undefined, undefined, 0.1);
  scorch(game, pos, r, 0.4, 1.4, { alpha: 0.5, fade: 0.7 });
}

// ---------------------------------------------------------------- Pyromancer idle (bible 09 §5)
// Chimney embers every 0.2 / (1 + 1.5·meter) s and a soot puff every 0.7 s; the forge breathes
// harder the more foes are burning nearby (Wildfire primed). At high meter the coal window spits.
const _idle = { e: 0, s: 0, c: 0 };
export function idle(game, player, dt) {
  const v = game.vfx, m = player.model;
  if (!v || !m?.emitter || dt <= 0) return;
  const meter = m.H?.meter ?? 0;
  _idle.e -= dt; _idle.s -= dt; _idle.c -= dt;
  if (_idle.e <= 0) {
    _idle.e = (0.2 / (1 + 1.5 * meter)) * (0.8 + Math.random() * 0.4);
    m.emitter('chimney', _a);
    spr(v, 'fireEmber', _a.x, _a.y, _a.z, (Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 0.3, 0.12, -1.2, 1.2);
  }
  if (_idle.s <= 0) {
    _idle.s = 0.7 * (0.85 + Math.random() * 0.3) / (1 + 0.6 * meter);
    m.emitter('chimney', _a);
    spr(v, 'fireSoot', _a.x, _a.y + 0.1, _a.z, 0.15, 0.7, -0.1, 1.2, 0.26, -0.5, 1.2);
  }
  if (meter > 0.4 && _idle.c <= 0) {
    _idle.c = 0.5 / meter;
    m.emitter('knuckles', _b);
    spr(v, 'fireLick', _b.x, _b.y, _b.z, 0, 0.5, 0, 0.3, 0.28);
  }
}

// ---------------------------------------------------------------- cast flashes
// A fire skill was cast (any class). slot 0 = starter (3–4 casts/s). point = the casting hand / focus.
export function castFlash(game, player, def, slot, point) {
  const v = game.vfx;
  if (!v || !point) return;
  const d = player.facing;
  if (slot === 0) {
    // the coal is flicked off the palm: a flame flick along the aim + 3 ember streaks
    spr(v, 'fireHead', point.x + d.x * 0.15, point.y, point.z + d.z * 0.15, d.x * 4, 0, d.z * 4, 0.06, 0.3, 0, 6, 0, 0.35);
    spr(v, 'fireCore', point.x, point.y, point.z, 0, 0, 0, 0.05, 0.22);
    if (fireTier(game) < 2) for (let i = 0; i < 3; i++) {
      const s = (Math.random() - 0.5) * 2;
      spr(v, 'fireEmber', point.x, point.y, point.z, d.x * 4 - d.z * s, 0.8 + Math.random(), d.z * 4 + d.x * s, 0.25, 0.08);
    }
    return;
  }
  // bigger spells: the gauntlet vents: core flash, tongues up, soot cough
  spr(v, 'fireCore', point.x, point.y, point.z, 0, 0, 0, 0.1, 0.55);
  for (let i = 0; i < 4; i++) spr(v, 'fireLick', point.x, point.y, point.z, d.x * 1.5 + (Math.random() - 0.5), 2, d.z * 1.5 + (Math.random() - 0.5), 0.3, 0.38 + Math.random() * 0.15);
  spr(v, 'fireSoot', point.x, point.y + 0.2, point.z, 0, 1.2, 0, 0.9, 0.35, -0.6, 1.4);
}
export { ELEMENT_COLOR, fireDecal };
