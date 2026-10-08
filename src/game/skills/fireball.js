import * as THREE from 'three';
import { Projectile, damageArea, timed } from './common.js';
import { glowMaterial, GEO, ELEMENT_COLOR } from '../../core/utils.js';
import { blendAddMaterial } from '../fx.js';
import { damageEnemy } from '../combat.js';

export const fireball = {
  id: 'fireball',
  name: 'Fireball',
  icon: '🔥',
  element: 'fire',
  maxRank: 5,
  range: 15,
  hint: 'Fire + Frost = Steam Burst. Fire + Storm = Overload.',
  desc: (rank) => [
    'Hurl a fiery projectile that explodes on impact.',
    '+20% damage.',
    '+25% explosion radius.',
    '+1 extra fireball.',
    'Explosions leave a 2.5s burning patch.',
  ][rank - 1],
  cooldown: (rank) => [1.1, 1.0, 0.95, 0.9, 0.8][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const count = (r >= 4 ? 2 : 1) + game.player.stats.projectiles;
    const dmg = 24 * (1 + (r >= 2 ? 0.2 : 0));
    const explosionRadius = 2.2 * game.player.stats.area * (1 + (r >= 3 ? 0.25 : 0));
    const projectileDmg = dmg * 0.3; // only 30% of explosion damage on direct hit
    const directions = [];
    if (count === 1) {
      directions.push(ctx.dir);
    } else {
      const spread = 0.25;
      const base = Math.atan2(ctx.dir.z, ctx.dir.x);
      for (let i = 0; i < count; i++) {
        const a = base - spread / 2 + (spread * i) / (count - 1);
        directions.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
    }

    for (const dir of directions) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir,
        speed: 15,
        range: 15,
        radius: 0.5,
        damage: projectileDmg,
        element: 'fire',
        knockback: 1,
        size: 0.3,
        color: 0xffb347,
        trail: { color: 0xff5a1a, rate: 60, size: 0.35, life: 0.3 },
        onHit: (g, e, p) => {
          if (!p._exploded) {
            p._exploded = true;
            explodeFireball(g, p.pos, explosionRadius, r);
          }
        },
        onExpire: (g, p) => {
          if (!p._exploded) {
            p._exploded = true;
            explodeFireball(g, p.pos, explosionRadius, r);
          }
        },
      }));
    }
  },
};

function explodeFireball(game, pos, radius, rank) {
  const dmg = 24 * (1 + (rank >= 2 ? 0.2 : 0));
  damageArea(game, pos, radius, dmg, { element: 'fire', knockback: 3 });
  game.fx.ring(pos, { color: 0xff7a2a, radius, life: 0.4 });
  game.fx.flashDisc(pos, { color: 0xff5a1a, radius: radius * 0.9, life: 0.3 });
  game.fx.burst(pos, { color: 0xffb347, count: 16, speed: 6, life: 0.5, size: 0.4, backing: 0.3, backingColor: 0x2a0f06 });
  game.fx.burst(pos, { color: 0xffd700, count: 8, speed: 4, life: 0.3, size: 0.3 });
  game.fx.light(pos, 0xff7a2a, 50, 0.3);
  game.fx.shake(0.08);

  // Rank 5: burning patch
  if (rank >= 5) {
    const patchRadius = 1.2 * game.player.stats.area;
    const burnMat = blendAddMaterial(0xff7a2a, { hdr: 1.4, opacity: 0.6, occ: 0.4, side: THREE.DoubleSide, depthTest: false });
    const burnMesh = new THREE.Mesh(GEO.disc, burnMat);
    burnMesh.rotation.x = -Math.PI / 2;
    burnMesh.position.copy(pos);
    burnMesh.position.y = 0.05;
    burnMesh.scale.setScalar(patchRadius);
    game.scene.add(burnMesh);

    let patchLife = 2.5;
    let damageAccum = 0;
    game.addActor({
      update(dt, g) {
        patchLife -= dt;
        if (patchLife <= 0) return false;

        damageAccum += dt;
        if (damageAccum >= 0.5) {
          damageAccum = 0;
          damageArea(g, pos, patchRadius, 6, { element: 'fire' });
        }
        return true;
      },
      dispose(g) {
        g.scene.remove(burnMesh);
        burnMat.dispose();
      },
    });
  }
}
