import * as THREE from 'three';
import { Projectile, fanDirections } from './common.js';
import { StarBolt } from '../vfx/elements/arcane.js';

// ARCANE BOLT (Arcanist starter). Look (bible 10 §4.1): a sliver of starlight (velocity-aligned
// diamond over a void underlay) with a tapered tail that leaves a dotted constellation and tiny
// runes; impacts converge, then pop. r3 adds a leading needle (pierce), r5 a white-hot head,
// a longer tail, denser constellation with prism glints. The cast flash is vfx/hero/arcane.js.
const _hand = new THREE.Vector3();

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
    // visual only: bolts appear at the casting hand and settle onto their gameplay line in 0.09 s
    let hand = null;
    if (game.player.hand) {
      game.player.hand(_hand);
      hand = { x: _hand.x - ctx.origin.x, y: _hand.y - 0.9, z: _hand.z - ctx.origin.z };
      if (!(Math.abs(hand.x) < 3 && Math.abs(hand.y) < 3 && Math.abs(hand.z) < 3)) hand = null;
    }
    for (const d of fanDirections(ctx.dir, count, 0.12 * (count - 1))) {
      const v = new StarBolt(game, {
        scale: count >= 3 ? 0.85 : 1, len: r >= 5 ? 1.3 : 0.9, needle: r >= 3, hot: r >= 5,
        dots: r >= 5 ? 18 : 12, prism: r >= 5, hand,
      });
      game.addActor(new Projectile(game, {
        pos: ctx.origin, dir: d, speed: r >= 5 ? 26 : 21, range: 16,
        radius: 0.45, damage: dmg, element: 'arcane', pierce, knockback: 1.5,
        mesh: null,
        onUpdate: (g, p, dt) => v.update(g, p, dt),
        onHit: (g, e, p) => v.hit(g, e, p),
        onExpire: (g, p) => v.expire(g, p),
      }));
    }
  },
};
