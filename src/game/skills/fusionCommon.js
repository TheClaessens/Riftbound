import * as THREE from 'three';
import { timed } from './common.js';
import { dirXZ } from '../../core/utils.js';
import { damageEnemy, applyStatus } from '../combat.js';

// Gameplay helpers shared by the fusion skills (skills/fusions/*). Gameplay only — no visuals here.
const _q = [];
const _b = new THREE.Vector3();

// Cursor point clamped to `range` from the caster, on the ground plane.
export function aimPoint(ctx, range) {
  const dx = ctx.target.x - ctx.origin.x;
  const dz = ctx.target.z - ctx.origin.z;
  const d = Math.hypot(dx, dz);
  const k = d > range ? range / d : 1;
  return new THREE.Vector3(ctx.origin.x + dx * k, 0, ctx.origin.z + dz * k);
}

// Run fn(game) once after `dur` seconds. Uses the actor loop, so it respects hit-stop and slow-mo.
export function after(game, dur, fn) {
  timed(game, dur, () => {}, () => fn(game));
}

// Drag foes in the circle toward the centre by `step` units. Skips bosses and inert world objects.
export function pullToward(game, c, R, step) {
  for (const e of game.queryEnemies(c, R, _q)) {
    if (e.dead || e.inert || e.boss) continue;
    const dx = c.x - e.pos.x;
    const dz = c.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) continue;
    const s = Math.min(d, step) / d;
    e.pos.x += dx * s;
    e.pos.z += dz * s;
  }
}

// Damage every live foe in the circle, pushing each one radially outward.
export function blast(game, c, R, dmg, element, knockback = 0) {
  for (const e of game.queryEnemies(c, R, _q).slice()) {
    if (e.dead || e.inert) continue;
    damageEnemy(game, e, dmg, { element, knockback, dir: dirXZ(c, e.pos, _b) });
  }
}

// Freeze every foe in range with applyStatus (no reaction side effects; frost power 6 = instant Frozen).
export function freezeAll(game, c, R) {
  for (const e of game.queryEnemies(c, R, _q).slice()) {
    if (e.dead || e.inert) continue;
    applyStatus(game, e, 'frost', 6);
  }
}
