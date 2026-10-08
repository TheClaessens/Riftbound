import { Projectile, fanDirections } from './common.js';
import { damageEnemy } from '../combat.js';

// Stormcaller starter (storm). Very fast spark; on hit it forks lightning to nearby foes.

const FORK_SHARE = 0.75; // forks deal 75% of the main bolt (tuned up from a fixed 6 after sims)

// From the hit point, arc lightning to up to `forks` nearest foes not yet hit by this spark.
function forkFrom(game, e, p, forks, forkRange, dmg) {
  const hit = new Set([e]);
  for (let i = 0; i < forks; i++) {
    const t = game.nearestEnemy(e.pos, forkRange, hit);
    if (!t) break;
    hit.add(t);
    game.fx.lightning(p.pos, { x: t.pos.x, y: 0.9, z: t.pos.z }, { color: 0xffe14a, life: 0.12 });
    game.fx.light(t.pos, 0xffe14a, 14, 0.15);
    damageEnemy(game, t, dmg * FORK_SHARE, { element: 'storm' });
  }
}

export const spark = {
  id: 'spark',
  name: 'Spark',
  icon: 'ϟ',
  element: 'storm',
  kind: 'active',
  maxRank: 5,
  range: 12,
  hint: 'Storm into Burning foes Overloads; into Chilled foes Superconducts.',
  // Text shown on the level-up card for reaching `rank`.
  desc: (rank) => [
    'Fire a very fast spark. On hit it forks to 2 foes within 4 u.',
    '+1 fork.',
    '+25% damage.',
    'Fork range 6 u.',
    '+1 spark, fanned.',
  ][rank - 1],
  cooldown: (rank) => [0.32, 0.30, 0.28, 0.26, 0.24][rank - 1],
  // ctx: { rank, origin (Vector3, y = 0), dir (Vector3 XZ), target (Vector3 ground point), player }
  cast(game, ctx) {
    const r = ctx.rank;
    const count = (r >= 5 ? 2 : 1) + game.player.stats.projectiles;
    const dmg = 12 * (r >= 3 ? 1.25 : 1);
    const forks = 2 + (r >= 2 ? 1 : 0);
    const forkRange = r >= 4 ? 6 : 4;
    for (const d of fanDirections(ctx.dir, count, 0.12 * (count - 1))) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin, dir: d, speed: 30, range: 12,
        radius: 0.4, damage: dmg, element: 'storm', knockback: 0.5,
        size: 0.16, color: 0xfff3a0,
        trail: { rate: 70, color: 0xffe14a, size: 0.18, life: 0.14 },
        onHit: (g, e, p) => forkFrom(g, e, p, forks, forkRange, dmg),
      }));
    }
    game.fx.burst({ x: ctx.origin.x + ctx.dir.x * 0.6, y: 0.9, z: ctx.origin.z + ctx.dir.z * 0.6 }, { color: 0xfff3a0, count: 3, speed: 2, life: 0.15, size: 0.25 });
  },
};
