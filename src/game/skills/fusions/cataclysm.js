import * as THREE from 'three';
import { damageEnemy } from '../../combat.js';
import { aimPoint, after, pullToward, blast } from '../fusionCommon.js';
import { fallingRockFx, meteorBurst, craterFx, scorch, spr, fireDecal, fireTier } from '../../vfx/elements/fire.js';

const ORANGE = 0xff7a2a;
const RIFT_Y = 6.2;

// Scratch objects. Never stored; each use is immediate.
const _q = [];

// Look (bible 10 §4.3): Singularity rips open the sky and a mountain of molten Prime-rock is
// dragged through. Pull: a violet rune circle on the pull radius, a ground swirl of debris and
// starlight spiralling in, and a world-scale SKY RIFT: a churning ash-cloud tear over the target,
// lit from inside (violet + molten), opening over the pull. The giant rock drops out of it.
// Impact: Meteor x1.6 (dust ring on r 5). Linger: a lava-pool crater, molten floor under drifting
// charcoal crust plates, slag lip on r 4, six tongues, embers. r3: three meteorites, same rift.

// ---------------------------------------------------------------- vortex (pull phase)
// Pull + sky rift. Calls onDone(game) when the pull ends. Gameplay: pullToward each frame.
class Vortex {
  constructor(game, c, R, o) {
    this.c = c.clone();
    this.R = R;
    this.dur = o.duration;
    this.speed = o.speed;
    this.onDone = o.onDone;
    this.t = 0;
    const v = game.vfx;
    if (v) {
      const P = { x: c.x, y: 0, z: c.z };
      fireDecal(game, 'rune', P, R / 0.93, this.dur + 0.3, { grow: 0.35, fade: 0.3, accent: 0xc08cff, hdr: 1.35 });
      v.decal('shadow', P, R * 0.9, this.dur + 0.4, { grow: 0.6, fade: 0.4, alpha: 0.32, color: 0x1a0633 });
      v.emitter('arcaneMote', { pos: P, radius: R, area: 'ring', rate: 26, y: [0.2, 1.4], life: this.dur });
      v.emitter('vortexDebris', { pos: P, radius: R, area: 'ring', rate: 14, y: [0.1, 0.5], life: this.dur });
      // the sky rift: a dark ash cloud tearing open over the target, lit from inside
      this.rift = v.cloud({ x: c.x, z: c.z }, { radius: 1.9, height: RIFT_Y, style: 'ash', life: this.dur + (o.riftLife ?? 1.2), puffs: 9 });
      v.emitter('arcaneMote', { pos: { x: c.x, y: RIFT_Y - 0.6, z: c.z }, radius: 2.0, area: 'ring', rate: 18, y: [0, 0.6], life: this.dur + 0.6 });
    }
  }

  update(dt, game) {
    this.t += dt;
    pullToward(game, this.c, this.R, this.speed * dt);
    const v = game.vfx;
    if (v && dt > 0) {
      const k = Math.min(1, this.t / this.dur), life = Math.min(0.06, dt * 1.5);
      // the tear opens: a violet rim around a molten heart, growing with the pull
      spr(v, 'arcaneMote', this.c.x, RIFT_Y - 0.5, this.c.z, 0, 0, 0, life, 1.6 + 2.2 * k, 0, 0, v.time * 2);
      spr(v, 'fireOrb', this.c.x, RIFT_Y - 0.7, this.c.z, 0, 0, 0, life, 0.4 + 1.3 * k, 0, 0, v.time * 3);
      spr(v, 'fireCore', this.c.x, RIFT_Y - 0.7, this.c.z, 0, 0, 0, life, 0.5 + 0.9 * k, 0, 0, 0);
      if (Math.random() < dt * (3 + 8 * k)) this.rift?.flash(0.4 + 0.5 * k);
      // molten tongues lick down out of the tear
      if (Math.random() < dt * 22 * k) {
        const a = Math.random() * 6.283, rr = 0.4 + Math.random() * 1.1;
        spr(v, 'fireLick', this.c.x + Math.cos(a) * rr, RIFT_Y - 0.9, this.c.z + Math.sin(a) * rr, 0, -1.5, 0, 0.4, 0.7 + Math.random() * 0.5, 3, 2, Math.PI);
      }
      if (Math.random() < dt * 12 * k) {
        const a = Math.random() * 6.283;
        spr(v, 'fireEmber', this.c.x + Math.cos(a) * 1.2, RIFT_Y - 0.8, this.c.z + Math.sin(a) * 1.2, (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, 0.6, 0.13, 3, 0.5);
      }
    }
    if (this.t >= this.dur) {
      this.onDone(game);
      return false;
    }
    return true;
  }

  dispose() {}
}

// ---------------------------------------------------------------- meteors

// Full-size meteor impact: burst, light, shake, then blast damage.
function meteorImpact(game, c, o) {
  if (game.vfx) {
    meteorBurst(game, c, o.radius, { scale: o.vfxScale ?? 1 });
    scorch(game, c, o.radius, 0.3, o.scorchLife ?? 2.0, { alpha: 0.45, fade: 1.0 });
  }
  game.fx.light(c, ORANGE, o.light ?? 70, 0.35, 12);
  game.fx.shake(o.shake ?? 0.25);
  blast(game, c, o.radius, o.dmg, o.element, o.knockback ?? 0);
}

// A burning meteor falling out of the rift onto p. Lands after o.fall seconds.
class MeteorFall {
  constructor(game, p, o) {
    this.p = p;
    this.o = o;
    this.t = 0;
    const from = o.from ? { x: o.from.x, y: o.from.y, z: o.from.z } : undefined;
    this.fx = fallingRockFx(game, p, { scale: o.scale, fall: o.fall, from, tail: 1.2, shadow: o.shadowR ?? 1.6, rock: 0.9 });
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

// The lava-pool crater: a lingering ground area that ticks damage.
// o: radius, life, tick, dmg, element
class GroundZone {
  constructor(game, pos, o) {
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.o = o;
    this.age = 0;
    this.tick = 0;
    this.look = game.vfx ? craterFx(game, this.pos, { R: o.radius, life: o.life, flames: 6, embers: 24, lava: true, lavaRate: 24, crustRate: 7 }) : null;
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

    this.look?.update(dt);
    return this.age < o.life;
  }

  dispose() {}
}

export const cataclysm = {
  id: 'cataclysm',
  name: 'Cataclysm',
  icon: '🜄',
  element: 'fire',
  maxRank: 3,
  range: 12,
  hint: 'Pull everything into a vortex, then a meteor crashes into it and leaves a burning crater.',
  desc: (rank) => [
    'At the cursor: a 1.5 s vortex drags foes in (r 6), then a giant meteor (160 dmg, r 5) crashes down with heavy knockback and leaves a burning crater (r 4, 4 s).',
    '+30% damage.',
    'Three 50-damage meteors follow around the crater.',
  ][rank - 1],
  cooldown: (rank) => [7, 6.2, 5.5][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const area = game.player.stats.area;
    const mult = r >= 2 ? 1.3 : 1;
    const c = aimPoint(ctx, 12);
    const rift = { x: c.x, y: RIFT_Y - 0.4, z: c.z };

    // Orange wind-up on the impact footprint, shown for the whole pull.
    game.fx.telegraph(c, 5 * area, 1.5, { color: ORANGE, friendly: true });
    game.addActor(new Vortex(game, c, 6 * area, {
      color: ORANGE,
      duration: 1.5,
      speed: 6,
      riftLife: r >= 3 ? 2.6 : 1.0,
      onDone: (g) => {
        callMeteor(g, c, {
          fall: 0.8,
          radius: 5 * area,
          dmg: 160 * mult,
          element: 'fire',
          knockback: 12,
          scale: 1.9,
          shake: 0.5,
          light: 160,
          telegraph: false,
          from: rift, shadowR: 1.4, vfxScale: 1.6, scorchLife: 5.2,
          then: (gg, p) => {
            gg.addActor(new GroundZone(gg, p, { radius: 4 * area, life: 4, tick: 0.5, dmg: 12 * mult, element: 'fire', color: ORANGE }));
            if (r >= 3) {
              const a0 = Math.random() * Math.PI * 2;
              for (let i = 0; i < 3; i++) {
                const a = a0 + (i / 3) * Math.PI * 2;
                const at = { x: p.x + Math.cos(a) * 3.2 * area, z: p.z + Math.sin(a) * 3.2 * area };
                after(gg, 0.4 + i * 0.35, (g3) => callMeteor(g3, at, {
                  fall: 0.6,
                  radius: 2.2 * area,
                  dmg: 50 * mult,
                  element: 'fire',
                  scale: 1.1,
                  shake: 0.2,
                  light: 60,
                  from: rift, vfxScale: 0.7,
                }));
              }
            }
          },
        });
      },
    }));

    if (game.vfx && fireTier(game) < 2) {
      for (let i = 0; i < 6; i++) spr(game.vfx, 'fireEmber', ctx.origin.x, 1.2, ctx.origin.z, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 0.3, 0.1);
    }
  },
};
