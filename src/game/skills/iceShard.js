import * as THREE from 'three';
import { Projectile, fanDirections } from './common.js';
import { GEO, glowMaterial } from '../../core/utils.js';

// Cryomancer starter (frost). Piercing crystal shards; at r5 each expiring shard splits.

// ONE shared material and two shared templates (module scope). Shots pass cloned Meshes,
// which share this geometry and material; Projectile does not dispose custom-mesh materials.
const SHARD_MAT = glowMaterial(0xbff4ff, 2);
const shardTemplate = new THREE.Mesh(GEO.octa, SHARD_MAT);
shardTemplate.scale.set(0.12, 0.12, 0.55); // long axis = local Z, tips at +-0.55
const miniTemplate = new THREE.Mesh(GEO.octa, SHARD_MAT);
miniTemplate.scale.set(0.07, 0.07, 0.3);

// Clone a template and point its long axis along `dir` (XZ). rotation.y = atan2(x, z) maps local +Z onto dir.
function shardMesh(template, dir) {
  const m = template.clone();
  m.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
  return m;
}

// r5: expiring shard becomes 3 mini-shards (6 dmg) in a fan.
function splitShard(game, p) {
  for (const d of fanDirections(p.dir, 3, 0.5)) {
    game.addActor(new Projectile(game, {
      pos: p.pos, dir: d, speed: 16, range: 5, radius: 0.36, damage: 6, element: 'frost',
      mesh: shardMesh(miniTemplate, d),
      trail: { rate: 30, color: 0xd8fbff, size: 0.14, life: 0.2 },
    }));
  }
  game.fx.burst(p.pos, { color: 0xbff4ff, count: 6, speed: 3, life: 0.3, size: 0.2 });
}

export const iceShard = {
  id: 'iceShard',
  name: 'Ice Shard',
  icon: '❅',
  element: 'frost',
  kind: 'active',
  maxRank: 5,
  range: 15,
  hint: 'Frozen foes Shatter under Arcane; Frost on Shocked foes Superconducts.',
  // Text shown on the level-up card for reaching `rank`.
  desc: (rank) => [
    'Launch a piercing ice shard that chills foes.',
    '+20% damage.',
    '+1 shard, fanned.',
    'Shards pierce 2 more foes.',
    '+1 shard. Expiring shards split into 3 mini-shards.',
  ][rank - 1],
  cooldown: (rank) => [0.50, 0.48, 0.45, 0.42, 0.38][rank - 1],
  // ctx: { rank, origin (Vector3, y = 0), dir (Vector3 XZ), target (Vector3 ground point), player }
  cast(game, ctx) {
    const r = ctx.rank;
    const count = 1 + (r >= 3 ? 1 : 0) + (r >= 5 ? 1 : 0) + game.player.stats.projectiles;
    const dmg = 16 * (r >= 2 ? 1.2 : 1);
    const pierce = 2 + (r >= 4 ? 2 : 0);
    const split = r >= 5;
    for (const d of fanDirections(ctx.dir, count, 0.18 * (count - 1))) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin, dir: d, speed: 20, range: 15,
        radius: 0.42, damage: dmg, element: 'frost', pierce, statusPower: 2, knockback: 1,
        mesh: shardMesh(shardTemplate, d),
        trail: { rate: 45, color: 0xd8fbff, size: 0.2, life: 0.3 },
        onHit: (g, e, p) => g.fx.burst(p.pos, { color: 0x9fe9ff, count: 4, speed: 2.5, life: 0.25, size: 0.2 }),
        onExpire: split ? (g, p) => splitShard(g, p) : undefined,
      }));
    }
    game.fx.burst({ x: ctx.origin.x + ctx.dir.x * 0.8, y: 0.4, z: ctx.origin.z + ctx.dir.z * 0.8 }, { color: 0xbff4ff, count: 3, speed: 2, life: 0.2, size: 0.3 });
  },
};
