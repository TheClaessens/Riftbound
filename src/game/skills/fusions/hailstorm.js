import * as THREE from 'three';
import { Projectile, fanDirections } from '../common.js';
import { damageEnemy } from '../../combat.js';
import { shardLook, squall } from '../../vfx/elements/frost.js';

// HAILSTORM (Ice Shard + Blizzard, Cryomancer LMB). Look: icicles (the Ice Shard look at 0.85x) that
// each bring a little squall where they land: the shard embeds in the ground as the squall's anchor and
// a mini blizzard forms (cloud puffs, snow, rime, spikes AT r). Repeated squalls within 1.5 u merge
// visually (vfx/elements/frost.js squall()); the gameplay zones below stay separate.

// Scratch objects. Never stored; each use is immediate.
const _q = [];
const _hand = new THREE.Vector3();

// A lingering ground area that ticks damage (the mini-blizzard). o: radius, life, tick, dmg, element
class GroundZone {
  constructor(game, pos, o) {
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.o = o;
    this.age = 0;
    this.tick = 0;
    squall(game, this.pos, o.radius, o.life);
  }

  update(dt, game) {
    const o = this.o;
    this.age += dt;
    this.tick += dt;

    if (this.tick >= o.tick) {
      this.tick -= o.tick;
      for (const e of game.queryEnemies(this.pos, o.radius, _q).slice()) {
        if (e.dead || e.inert) continue;
        damageEnemy(game, e, o.dmg, { element: o.element, noCrit: true });
      }
    }
    return this.age < o.life;
  }

  dispose() {}
}

export const hailstorm = {
  id: 'hailstorm',
  name: 'Hailstorm',
  icon: '❆',
  element: 'frost',
  maxRank: 3,
  range: 15,
  hint: 'Ice shards leave mini-blizzards wherever they expire, chilling everything nearby.',
  desc: (rank) => [
    'Fan of 5 piercing ice shards (18 dmg, pierce 3). Each shard leaves a 2 s mini-blizzard where it expires.',
    '+30% damage.',
    '7 shards.',
  ][rank - 1],
  cooldown: () => 0.45,

  cast(game, ctx) {
    const r = ctx.rank;
    const area = game.player.stats.area;
    const mult = r >= 2 ? 1.3 : 1;
    const count = (r >= 3 ? 7 : 5) + game.player.stats.projectiles;
    const h = game.player.hand ? game.player.hand(_hand) : null;
    const from = h ? { x: h.x, y: h.y, z: h.z } : null;

    for (const d of fanDirections(ctx.dir, count, 0.2 * (count - 1))) {
      const look = shardLook(game, { len: 0.94, wid: 0.1, from, rime: 0.1 });
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir: d,
        speed: 20,
        range: 15,
        radius: 0.5,
        damage: 18 * mult,
        element: 'frost',
        pierce: 3,
        knockback: 0.5,
        statusPower: 2,
        size: 0.24,
        color: 0xd8f8ff,
        mesh: null,
        onUpdate: look.onUpdate,
        onDispose: look.onDispose,
        onHit: look.onHit,
        onExpire: (g, p) => {
          look.expire(g, p, { stickLife: 0.9 });
          g.addActor(new GroundZone(g, p.pos, { radius: 2 * area, life: 2, tick: 0.33, dmg: 4 * mult, element: 'frost' }));
        },
      }));
    }
  },
};
