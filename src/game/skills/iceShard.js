import * as THREE from 'three';
import { Projectile, fanDirections } from './common.js';
import { shardLook } from '../vfx/elements/frost.js';

// Cryomancer starter (frost). Piercing crystal shards; at r5 each expiring shard splits.
// Look (vfx/elements/frost.js shardLook): a thrown icicle (faceted hex ice, navy outline, spinning)
// trailing a painted contrail and shed flakes, scratching a rime line on the ground under its path;
// it chips forward through foes, sticks into the ground at range and crumbles, or shatters when stopped.

const _hand = new THREE.Vector3();

// r5: expiring shard becomes 3 mini-shards (6 dmg) in a fan.
function splitShard(game, p) {
  for (const d of fanDirections(p.dir, 3, 0.5)) {
    const look = shardLook(game, { len: 0.6, wid: 0.075, mini: true });
    game.addActor(new Projectile(game, {
      pos: p.pos, dir: d, speed: 16, range: 5, radius: 0.36, damage: 6, element: 'frost',
      mesh: null,
      onUpdate: look.onUpdate, onDispose: look.onDispose, onHit: look.onHit,
      onExpire: (g, pp) => look.expire(g, pp),
    }));
  }
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
    // visual: leave from the casting hand; with 3+ shards each head is x0.85 (starter size cap)
    const h = game.player.hand ? game.player.hand(_hand) : null;
    const from = h ? { x: h.x, y: h.y, z: h.z } : null;
    const k = count >= 3 ? 0.85 : 1;
    for (const d of fanDirections(ctx.dir, count, 0.18 * (count - 1))) {
      const look = shardLook(game, { len: 1.1 * k, wid: 0.12 * k, hoar: r >= 4, from });
      game.addActor(new Projectile(game, {
        pos: ctx.origin, dir: d, speed: 20, range: 15,
        radius: 0.42, damage: dmg, element: 'frost', pierce, statusPower: 2, knockback: 1,
        mesh: null,
        onUpdate: look.onUpdate, onDispose: look.onDispose,
        onHit: look.onHit,
        onExpire: split ? (g, p) => { look.expire(g, p, { split: true }); splitShard(g, p); } : (g, p) => look.expire(g, p),
      }));
    }
  },
};
