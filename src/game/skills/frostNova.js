import * as THREE from 'three';
import { damageEnemy } from '../combat.js';

export const frostNova = {
  id: 'frostNova',
  name: 'Frost Nova',
  icon: '❄',
  element: 'frost',
  maxRank: 5,
  range: 5,
  hint: 'Chill stacks to Freeze. Frozen + Arcane = Shatter.',
  desc: (rank) => [
    'Emit an expanding ice ring, chilling enemies it passes.',
    '+30% damage.',
    '+25% radius.',
    'Chill stack multiplier increases to 3.',
    'A second nova pulse erupts 0.5s later.',
  ][rank - 1],
  cooldown: (rank) => [3.2, 3.0, 2.8, 2.6, 2.2][rank - 1],

  cast(game, ctx) {
    const rank = ctx.rank;
    const dmg = 12 * (1 + (rank >= 2 ? 0.3 : 0));
    const maxRadius = 4.5 * game.player.stats.area * (1 + (rank >= 3 ? 0.25 : 0));
    const statusPower = rank >= 4 ? 3 : 2;
    const expandDuration = 0.35;

    createNovaWave(game, ctx.origin, dmg, maxRadius, statusPower, expandDuration, new Set(), rank, false);

    // Rank 5: second pulse
    if (rank >= 5) {
      game.addActor({
        t: 0,
        update(dt) {
          this.t += dt;
          if (this.t >= 0.5) {
            const hit2 = new Set();
            createNovaWave(game, ctx.origin, dmg, maxRadius, statusPower, expandDuration, hit2, rank, true);
            return false;
          }
          return true;
        },
        dispose() {},
      });
    }
  },
};

function createNovaWave(game, origin, dmg, maxRadius, statusPower, expandDuration, hitSet, rank, second) {
  // Look (vfx/elements/frost.js 'frostNova'): the ground flash-freezes outward with the damage front, a low
  // snow wave rides it, and a ring of ice spikes erupts exactly at the radius, holds, cracks and shatters.
  game.vfx.zone('frostNova', origin, { radius: maxRadius, dur: expandDuration, rank, second });

  // Hit enemies as the ring expands
  let expandTime = 0;
  game.addActor({
    update(dt, g) {
      expandTime += dt;
      if (expandTime >= expandDuration) return false;

      const currentRadius = (expandTime / expandDuration) * maxRadius;
      const enemies = g.queryEnemies(origin, currentRadius, []);

      for (const e of enemies) {
        if (!hitSet.has(e)) {
          hitSet.add(e);
          const dir = new THREE.Vector3(e.pos.x - origin.x, 0, e.pos.z - origin.z);
          if (dir.length() > 0) dir.normalize();
          damageEnemy(g, e, dmg, {
            element: 'frost',
            statusPower,
            knockback: 5,
            dir,
          });
        }
      }
      return true;
    },
    dispose() {},
  });
}
