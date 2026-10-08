import { Projectile, fanDirections } from './common.js';
import { randRange, rotateXZ } from '../../core/utils.js';

// Pyromancer starter (fire). Fast ember bolts that set foes Burning.
export const cinderBolt = {
  id: 'cinderBolt',
  name: 'Cinder Bolt',
  icon: '🜂',
  element: 'fire',
  kind: 'active',
  maxRank: 5,
  range: 14,
  hint: 'Burning foes Steam with Frost and Overload with Storm.',
  // Text shown on the level-up card for reaching `rank`.
  desc: (rank) => [
    'Fire a fast bolt that sets foes Burning.',
    '+1 bolt.',
    '+25% damage.',
    '+1 bolt.',
    'Bolts pierce 1 foe and burn harder.',
  ][rank - 1],
  cooldown: (rank) => [0.30, 0.28, 0.26, 0.24, 0.22][rank - 1],
  // ctx: { rank, origin (Vector3, y = 0), dir (Vector3 XZ), target (Vector3 ground point), player }
  cast(game, ctx) {
    const r = ctx.rank;
    const count = 1 + (r >= 2 ? 1 : 0) + (r >= 4 ? 1 : 0) + game.player.stats.projectiles;
    const dmg = 8 * (r >= 3 ? 1.25 : 1);
    const pierce = r >= 5 ? 1 : 0;
    const statusPower = r >= 5 ? 1.5 : 1;
    for (const d of fanDirections(ctx.dir, count, 0.1 * (count - 1))) {
      rotateXZ(d, randRange(-0.06, 0.06), d); // small aim jitter per bolt (in place)
      game.addActor(new Projectile(game, {
        pos: ctx.origin, dir: d, speed: 22, range: 14,
        radius: 0.4, damage: dmg, element: 'fire', pierce, statusPower, knockback: 0.6,
        size: 0.18, color: 0xff5a2a,
        trail: { rate: 60, color: 0xff7a33, size: 0.24, life: 0.22 },
        onHit: (g, e, p) => g.fx.burst(p.pos, { color: 0xff7a33, count: 5, speed: 3, life: 0.25, size: 0.22 }),
      }));
    }
    game.fx.burst({ x: ctx.origin.x + ctx.dir.x * 0.8, y: 0.4, z: ctx.origin.z + ctx.dir.z * 0.8 }, { color: 0xff7a33, count: 3, speed: 2, life: 0.2, size: 0.3 });
  },
};
