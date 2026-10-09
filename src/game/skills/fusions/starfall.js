import * as THREE from 'three';
import { Projectile, fanDirections } from '../common.js';
import { rotateXZ, randRange } from '../../../core/utils.js';
import { blast } from '../fusionCommon.js';
import { cinderTrail, cinderHit, cinderDrop, fallingRockFx, meteorBurst, scorch, spr, fireTier } from '../../vfx/elements/fire.js';

const ORANGE = 0xff7a2a;

// ---------------------------------------------------------------- meteors
// Look (bible 10 §4.3): the bolts are white-hot cinders with a white star twinkle (fusion tell).
// Every counted hit sends a star mote up to a small constellation 4 u above the hero (the counter,
// made visible). When it completes, the stars flare and a shooting star (white-gold head, long
// streak) dives at a steep angle onto the dashed fire telegraph and lands as a 0.8x Meteor that
// leaves dead scorch, no crater.

// Full-size meteor impact: flash, burst, light, shake, then blast damage.
function meteorImpact(game, c, o) {
  if (game.vfx) {
    meteorBurst(game, c, o.radius, { scale: 0.8 * o.scale, column: false });
    scorch(game, c, o.radius * 0.8, 0.05, 1.4, { alpha: 0.55, intensity: 0.3, fade: 0.8 });
  }
  game.fx.light(c, ORANGE, o.light ?? 70, 0.35, 12);
  game.fx.shake(o.shake ?? 0.25);
  blast(game, c, o.radius, o.dmg, o.element, o.knockback ?? 0);
}

// A burning meteor falling from the sky onto p. Lands after o.fall seconds.
class MeteorFall {
  constructor(game, p, o) {
    this.p = p;
    this.o = o;
    this.t = 0;
    this.fx = fallingRockFx(game, p, { scale: 0.75 * o.scale, fall: o.fall, star: true, tail: 0.8,
      from: { x: p.x - 2.6, y: 20, z: p.z - 2.6 } });
  }

  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, this.t / this.o.fall);
    this.fx.update(k, dt);
    if (k >= 1) {
      meteorImpact(game, this.p, this.o);
      this.o.then?.(game, this.p);
      return false;
    }
    return true;
  }

  dispose() { this.fx.end(); }
}

// Orange telegraph for `o.fall` seconds, then the meteor lands on pos.
// o: fall, radius, dmg, element, knockback, scale, shake, light, telegraph (false to skip), then(game, p)
function callMeteor(game, pos, o) {
  const p = new THREE.Vector3(pos.x, 0, pos.z);
  if (o.telegraph !== false) game.fx.telegraph(p, o.radius, o.fall, { color: ORANGE, friendly: true });
  game.addActor(new MeteorFall(game, p, o));
}

// ---------------------------------------------------------------- constellation (visual counter)
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
function starSlot(game, i, every, out) {
  const P = game.player.pos, R = game.engine?.right ?? { x: 0.7071, z: -0.7071 };
  const k = i - (every - 1) / 2;
  const s = k * 0.75;
  return out.set(P.x + R.x * s, 4.2 + (i % 2 ? 0.35 : 0) - Math.abs(k) * 0.15, P.z + R.z * s);
}
// a counted hit: a star mote rises from the hit to its slot
function starMote(game, from, st, i, every) {
  const v = game.vfx;
  if (!v) return;
  starSlot(game, i, every, _c);
  const tf = 0.35;
  spr(v, 'fireStar', from.x, from.y, from.z, (_c.x - from.x) / tf, (_c.y - from.y) / tf, (_c.z - from.z) / tf, tf, 0.3, 0, 0, 0);
  const vs = (st._vfx ??= { arrive: [] });
  vs.arrive[i] = v.time + tf;
}
// the constellation completes: the stars flare and draw their lines, then the star dives
function starLaunch(game, st, every) {
  const v = game.vfx;
  if (!v) return;
  for (let i = 0; i < every; i++) {
    starSlot(game, i, every, _c);
    spr(v, 'fireStar', _c.x, _c.y, _c.z, 0, 0, 0, 0.35, 0.9, 0, 0, 0);
    spr(v, 'fireCore', _c.x, _c.y, _c.z, 0, 0, 0, 0.12, 0.4);
    if (i > 0) {
      const ax = _c.x, ay = _c.y, az = _c.z;
      starSlot(game, i - 1, every, _c);
      // a line flash: a streak running from star to star
      for (let j = 0; j < 4; j++) {
        const u = j / 4;
        spr(v, 'fireEmber', _c.x + (ax - _c.x) * u, _c.y + (ay - _c.y) * u, _c.z + (az - _c.z) * u,
          (ax - _c.x) * 3, (ay - _c.y) * 3, (az - _c.z) * 3, 0.16, 0.12, 0, 0, undefined, 0.3);
      }
    }
  }
  if (st._vfx) st._vfx.arrive.length = 0;
}

export const starfall = {
  id: 'starfall',
  name: 'Starfall',
  icon: '✶',
  element: 'fire',
  maxRank: 3,
  range: 14,
  hint: 'Rapid triple cinder bolts. Every 4th hit calls a meteor onto that spot.',
  desc: (rank) => [
    'Rapid cinder bolts: 3 per shot, piercing 1, 10 dmg. Every 4th bolt hit calls a meteor (45 dmg, Burn) onto that spot after a 0.5 s telegraph.',
    '+30% damage.',
    'A meteor every 3rd hit.',
  ][rank - 1],
  cooldown: () => 0.22,

  cast(game, ctx) {
    const r = ctx.rank;
    const st = ctx.state;
    const area = game.player.stats.area;
    const mult = r >= 2 ? 1.3 : 1;
    const every = r >= 3 ? 3 : 4;
    const count = 3 + game.player.stats.projectiles;
    const look = { rank: 5, scale: 0.85, star: true };

    for (const d of fanDirections(ctx.dir, count, 0.2 * (count - 1))) {
      const dir = rotateXZ(d, randRange(-0.06, 0.06));
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir,
        speed: 22,
        range: 14,
        radius: 0.4,
        damage: 10 * mult,
        element: 'fire',
        pierce: 1,
        knockback: 0.4,
        statusPower: 1.5,
        size: 0.26,
        color: 0xffa050,
        mesh: null,
        onUpdate: (g, p, dt) => cinderTrail(g, p, dt, look),
        onExpire: (g, p) => { if (p.travelled >= p.range) cinderDrop(g, p); },
        onHit: (g, e, p) => {
          cinderHit(g, p, look, e, p.pierce > 0);
          st.hits = (st.hits ?? 0) + 1;
          if (st.hits >= every) {
            st.hits = 0;
            starLaunch(g, st, every);
            callMeteor(g, p.pos, { fall: 0.5, radius: 2.6 * area, dmg: 45 * mult, element: 'fire', scale: 0.9, shake: 0.15, light: 50 });
          } else {
            starMote(g, p.pos, st, st.hits - 1, every);
          }
        },
      }));
    }
  },

  // Visual only: keep the collected stars of the constellation shining above the hero.
  update(game, dt, st, rank) {
    const v = game.vfx, n = st?.hits ?? 0;
    if (!v || !n || dt <= 0 || !game.player) return;
    const every = rank >= 3 ? 3 : 4;
    const arrive = st._vfx?.arrive;
    const life = Math.min(0.06, dt * 1.5);
    const tw = fireTier(game) === 2 ? 0.8 : 1;
    for (let i = 0; i < Math.min(n, every); i++) {
      if (arrive && arrive[i] !== undefined && v.time < arrive[i]) continue;
      starSlot(game, i, every, _c);
      const pulse = 0.85 + 0.15 * Math.sin(v.time * 7 + i * 2.1);
      spr(v, 'fireStar', _c.x, _c.y, _c.z, 0, 0, 0, life, 0.7 * pulse * tw, 0, 0, v.time * 1.2 + i);
      spr(v, 'fireCore', _c.x, _c.y, _c.z, 0, 0, 0, life, 0.24, 0, 0, 0);
      // faint constellation line to the previous star
      if (i > 0) {
        const ax = _c.x, ay = _c.y, az = _c.z;
        starSlot(game, i - 1, every, _d);
        const lx = ax - _d.x, ly = ay - _d.y, lz = az - _d.z, L = Math.hypot(lx, ly, lz);
        spr(v, 'fireEmber', (ax + _d.x) / 2, (ay + _d.y) / 2, (az + _d.z) / 2, lx / L * 0.01, ly / L * 0.01, lz / L * 0.01,
          life, 0.07, 0, 0, 0, (L / 0.07 - 1) / 0.008);
      }
    }
  },
};
