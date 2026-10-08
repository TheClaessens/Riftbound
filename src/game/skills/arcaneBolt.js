import { Projectile, fanDirections } from './common.js';

// REFERENCE IMPLEMENTATION of an active skill. Other skills follow this shape.
export const arcaneBolt = {
  id: 'arcaneBolt',
  name: 'Arcane Bolt',
  icon: '✦',
  element: 'arcane',
  kind: 'active',
  maxRank: 5,
  range: 16,                     // used by auto-cast targeting
  hint: 'Shatters Frozen enemies for x2.5 damage.',
  // Text shown on the level-up card for reaching `rank`.
  desc: (rank) => [
    'Fire a fast bolt of arcane energy.',
    '+1 bolt, +15% damage.',
    'Bolts pierce 1 extra enemy.',
    '+1 bolt, +20% damage.',
    'Bolts pierce 2 more and fly faster.',
  ][rank - 1],
  cooldown: (rank) => [0.36, 0.34, 0.32, 0.3, 0.27][rank - 1],
  // ctx: { rank, origin (Vector3, y = 0), dir (Vector3 XZ), target (Vector3 ground point), player }
  cast(game, ctx) {
    const r = ctx.rank;
    const count = (r >= 4 ? 3 : r >= 2 ? 2 : 1) + game.player.stats.projectiles;
    const dmg = 14 * (1 + (r >= 2 ? 0.15 : 0) + (r >= 4 ? 0.2 : 0));
    const pierce = (r >= 3 ? 1 : 0) + (r >= 5 ? 2 : 0);
    for (const d of fanDirections(ctx.dir, count, 0.12 * (count - 1))) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin, dir: d, speed: r >= 5 ? 26 : 21, range: 16,
        radius: 0.45, damage: dmg, element: 'arcane', pierce, knockback: 1.5,
        size: 0.22, trail: { rate: 50, size: 0.28, life: 0.25 },
        onHit: (g, e, p) => g.fx.burst(p.pos, { color: 0xb67cff, count: 4, speed: 3, life: 0.25, size: 0.25 }),
      }));
    }
    game.fx.burst({ x: ctx.origin.x + ctx.dir.x * 0.8, y: 0.4, z: ctx.origin.z + ctx.dir.z * 0.8 }, { color: 0xb67cff, count: 3, speed: 2, life: 0.2, size: 0.3 });
  },
};
