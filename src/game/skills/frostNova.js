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

    createNovaWave(game, ctx.origin, dmg, maxRadius, statusPower, expandDuration, new Set());

    // Rank 5: second pulse
    if (rank >= 5) {
      game.addActor({
        t: 0,
        update(dt) {
          this.t += dt;
          if (this.t >= 0.5) {
            const hit2 = new Set();
            createNovaWave(game, ctx.origin, dmg, maxRadius, statusPower, expandDuration, hit2);
            return false;
          }
          return true;
        },
        dispose() {},
      });
    }
  },
};

function createNovaWave(game, origin, dmg, maxRadius, statusPower, expandDuration, hitSet) {
  // Expanding ring on the ground
  game.fx.ring(origin, { color: 0x66d9ff, radius: maxRadius, life: expandDuration, from: 0.2 });

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

  // Ice shard burst
  game.fx.burst(origin, { color: 0x66d9ff, count: 12, speed: 5, life: 0.6, size: 0.28, gravity: 8 });
}
