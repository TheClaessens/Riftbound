import * as THREE from 'three';
import { damageEnemy } from '../combat.js';

export const chainLightning = {
  id: 'chainLightning',
  name: 'Chain Lightning',
  icon: '⚡',
  element: 'storm',
  maxRank: 5,
  range: 12,
  hint: 'Storm + Fire = Overload. Storm + Frost = Superconduct.',
  desc: (rank) => [
    'Strike up to 3 enemies with chaining lightning.',
    '+1 bounce.',
    '+1 bounce.',
    '+1 bounce.',
    '+2 bounces, increased damage scaling.',
  ][rank - 1],
  cooldown: (rank) => [1.4, 1.3, 1.2, 1.1, 1.0][rank - 1],

  cast(game, ctx) {
    const rank = ctx.rank;
    const bounceCount = [3, 4, 5, 6, 8][rank - 1];
    const baseDmg = 16;
    const dmgPerBounce = 0.92;
    const dmgScaling = 1 + Math.max(0, rank - 1) * 0.15;

    // Find first target
    let current = ctx.target;
    let nearest = game.nearestEnemy(current, 4);
    if (nearest) current = nearest.pos;
    else {
      nearest = game.nearestEnemy(game.player.pos, 12);
      if (nearest) current = nearest.pos;
      else {
        // No targets, draw fizzle
        const dir = new THREE.Vector3(ctx.target.x - ctx.origin.x, 0, ctx.target.z - ctx.origin.z);
        if (dir.length() > 0) dir.normalize();
        const end = new THREE.Vector3(
          ctx.origin.x + dir.x * 3,
          0,
          ctx.origin.z + dir.z * 3
        );
        game.fx.lightning(
          new THREE.Vector3(ctx.origin.x, 1.9, ctx.origin.z),
          new THREE.Vector3(end.x, 0.9, end.z),
          { color: 0xffe14a, life: 0.1 }
        );
        return;
      }
    }

    const hitSet = new Set();
    let currentPos = new THREE.Vector3(ctx.origin.x, 1.9, ctx.origin.z);
    let prevEnemy = null;
    let dmgMult = 1;

    for (let bounce = 0; bounce < bounceCount; bounce++) {
      const nearest = game.nearestEnemy(current, 5.5, hitSet);
      if (!nearest) break;

      hitSet.add(nearest);
      const dmg = baseDmg * dmgMult * dmgScaling;

      // Draw lightning from current position to nearest enemy
      const targetPos = new THREE.Vector3(nearest.pos.x, 0.9, nearest.pos.z);
      game.fx.lightning(currentPos, targetPos, { color: 0xffe14a, life: 0.12 });
      game.fx.light(targetPos, 0xffe14a, 20, 0.2);

      // Apply damage
      damageEnemy(game, nearest, dmg, { element: 'storm' });

      currentPos = targetPos;
      prevEnemy = nearest;
      current = nearest.pos;
      dmgMult *= dmgPerBounce;
    }
  },
};
