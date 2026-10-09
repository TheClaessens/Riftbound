import * as THREE from 'three';
import { damageArea } from './common.js';
import { frostParticle } from '../vfx/elements/frost.js';

// BLIZZARD (frost, active). A frost zone at the cursor: frost ticks every 0.33 s, and at rank 5 a
// gentle inward pull. Look (vfx/elements/frost.js 'frostBlizzard'): an actual squall parks over the
// zone: cloud lid, wind-driven snow, snow whipping round a drift ridge + ice spikes AT the radius.
const TICK = 0.33;
const RANGE = 14;           // cast clamp

const _buf = [];            // reused query buffer (queryEnemies clears it)

export const blizzard = {
  id: 'blizzard',
  name: 'Blizzard',
  icon: '❄',
  element: 'frost',
  kind: 'active',
  maxRank: 5,
  range: RANGE,
  hint: 'Chills the whole zone: Freeze the horde, then Arcane for Shatter.',
  desc: (rank) => [
    'Summon a frost zone at the cursor: 5 frost damage every 0.33s to foes inside, for 4s.',
    '+15% radius.',
    'Zone lasts 6s.',
    '+40% damage.',
    'Zone gently pulls foes toward its centre.',
  ][rank - 1],
  cooldown: (rank) => [7, 6.5, 6, 5.5, 5][rank - 1],

  // ctx: { rank, origin, dir, target, player }
  cast(game, ctx) {
    const target = clampTarget(ctx.origin, ctx.target, RANGE);
    game.addActor(new FrostZone(game, target, ctx.rank));
  },
};

class FrostZone {
  constructor(game, pos, rank) {
    const area = game.player.stats.area;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = 3.5 * area * (rank >= 2 ? 1.15 : 1);
    this.life = rank >= 3 ? 6 : 4;
    this.dmg = 5 * (rank >= 4 ? 1.4 : 1);
    this.pull = rank >= 5;
    this.t = 0;
    this.tickAcc = 0;
    this.breathN = 0;
    this.fxh = game.vfx.zone('frostBlizzard', this.pos, { radius: this.radius, life: this.life, rank });
  }

  update(dt, game) {
    this.t += dt;

    // Frost damage every 0.33 s to everything inside.
    this.tickAcc += dt;
    if (this.tickAcc >= TICK) {
      this.tickAcc -= TICK;
      const hits = damageArea(game, this.pos, this.radius, this.dmg, { element: 'frost', statusPower: 1 });
      // visual only: frost-breath puffs from every 3rd foe caught in the squall
      for (let i = this.breathN++ % 3; i < hits.length; i += 3) {
        const e = hits[i];
        frostParticle(game.vfx, 'frostPuff', e.pos.x, 1.1, e.pos.z, 0, 0.4, 0, 0.42);
      }
    }

    // Rank 5: gently pull foes toward the centre (not bosses or inert objects).
    if (this.pull) {
      const step = 2 * dt;
      for (const e of game.queryEnemies(this.pos, this.radius, _buf)) {
        if (e.dead || e.inert || e.boss) continue;
        pullToward(e.pos, this.pos.x, this.pos.z, step);
      }
    }

    return this.t < this.life;
  }

  // The squall dissolves on its own (snow thins, cloud boils away, spikes crumble, rime recedes).
  dispose() {
    this.fxh.end();
  }
}

// Move point p by up to `step` units toward (cx, cz) on the XZ plane, never overshooting.
function pullToward(p, cx, cz, step) {
  const dx = cx - p.x;
  const dz = cz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-4) return;
  const m = Math.min(step, d) / d;
  p.x += dx * m;
  p.z += dz * m;
}

// Target point on the ground, clamped to `maxRange` from origin.
function clampTarget(origin, target, maxRange) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= maxRange || d < 1e-6) return new THREE.Vector3(target.x, 0, target.z);
  const s = maxRange / d;
  return new THREE.Vector3(origin.x + dx * s, 0, origin.z + dz * s);
}
