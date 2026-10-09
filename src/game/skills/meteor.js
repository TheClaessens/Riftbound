import * as THREE from 'three';
import { dirXZ } from '../../core/utils.js';
import { damageEnemy } from '../combat.js';
import { damageArea } from './common.js';
import { fallingRockFx, meteorBurst, craterFx, scorch } from '../vfx/elements/fire.js';

// METEOR (fire, active). Orange telegraph at the cursor; a chunk of the Ember Prime falls for
// FALL_TIME, then impact damage + knockback and a burning crater (an actor that ticks fire damage).
// Look (bible 10 §4.2): growing shadow under the telegraph; tumbling basalt with molten facets,
// a flame comet tail and a dark smoke scar across the sky; impact flash, dome + flame column,
// basalt debris and a dust ring rolling to exactly r; a slag-lipped crater with molten cracks,
// tongues, embers and heat smoke that cools to dead char (glow = live).
const COLOR = 0xff7a2a;
const FALL_TIME = 0.8;      // telegraph duration == fall duration
const FALL_HEIGHT = 22;
const RANGE = 14;           // cast clamp (auto-cast only targets within this range too)
const CRATER_TICK = 0.5;

export const meteor = {
  id: 'meteor',
  name: 'Meteor',
  icon: '☄',
  element: 'fire',
  kind: 'active',
  maxRank: 5,
  range: RANGE,
  hint: 'Crater Burn + Chill = Steam Burst. Knockback scatters the horde.',
  desc: (rank) => [
    'Call a meteor at the cursor: 60 fire damage in a 3.2 radius, knockback 8, and a 2.5s burning crater.',
    '+25% damage.',
    'A second meteor falls 3 units away 0.25s later.',
    'Burning crater lasts 4s.',
    '+30% radius.',
  ][rank - 1],
  cooldown: (rank) => [4.5, 4.2, 3.9, 3.6, 3.2][rank - 1],

  // ctx: { rank, origin, dir, target, player }
  cast(game, ctx) {
    const r = ctx.rank;
    const target = clampTarget(ctx.origin, ctx.target, RANGE);
    launchMeteor(game, target, r);

    // Rank 3: a second meteor 3 u away from the first, 0.25 s later.
    if (r >= 3) {
      const a = Math.random() * Math.PI * 2;
      const second = new THREE.Vector3(target.x + Math.cos(a) * 3, 0, target.z + Math.sin(a) * 3);
      after(game, 0.25, () => launchMeteor(game, second, r));
    }
  },
};

function launchMeteor(game, pos, rank) {
  const area = game.player.stats.area;
  const big = rank >= 5 ? 1.3 : 1;           // rank 5: +30% radius
  const mult = rank >= 2 ? 1.25 : 1;         // rank 2: +25% damage (impact and crater)
  const impactR = 3.2 * area * big;
  const craterR = 2.6 * area * big;
  const impactDmg = 60 * mult;
  const craterDmg = 8 * mult;
  const craterLife = rank >= 4 ? 4 : 2.5;    // rank 4: crater lasts 4 s

  game.addActor(new FallingRock(game, pos, big));
  game.fx.telegraph(pos, impactR, FALL_TIME, {
    color: COLOR, friendly: true,
    onDone: () => impact(game, pos, impactR, impactDmg, craterR, craterDmg, craterLife, big),
  });
}

function impact(game, pos, radius, dmg, craterR, craterDmg, craterLife, big = 1) {
  for (const e of game.queryEnemies(pos, radius, [])) {
    damageEnemy(game, e, dmg, { element: 'fire', knockback: 8, dir: dirXZ(pos, e.pos) });
  }

  if (game.vfx) {
    meteorBurst(game, pos, radius, { scale: big });
    scorch(game, pos, radius, 0.3, craterLife + 1.2, { alpha: 0.4, fade: 1.0 });
  }
  game.fx.light(pos, COLOR, 60, 0.35);
  game.fx.shake(0.25);

  game.addActor(new Crater(game, pos, craterR, craterDmg, craterLife));
}

// A chunk of the Prime falling from high above (drifting in from the upper-left) onto the telegraph.
// Gameplay timing lives in the telegraph; this actor is visual only.
class FallingRock {
  constructor(game, target, scale = 1) {
    this.t = 0;
    this.fx = fallingRockFx(game, target, { scale, fall: FALL_TIME, height: FALL_HEIGHT });
  }
  update(dt) {
    this.t += dt;
    this.fx.update(Math.min(1, this.t / FALL_TIME), dt);
    return this.t < FALL_TIME;
  }
  dispose() { this.fx.end(); }
}

// Burning crater: ticking fire damage until it expires. Look = craterFx (slag lip on the radius).
class Crater {
  constructor(game, pos, radius, dmg, life) {
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = radius;
    this.dmg = dmg;
    this.life = life;
    this.t = 0;
    this.tickAcc = 0;
    this.look = game.vfx ? craterFx(game, this.pos, { R: radius, life, flames: 5, embers: 16, lava: true, lavaRate: 7, crustRate: 0 }) : null;
  }

  update(dt, game) {
    this.t += dt;

    this.tickAcc += dt;
    if (this.tickAcc >= CRATER_TICK) {
      this.tickAcc -= CRATER_TICK;
      damageArea(game, this.pos, this.radius, this.dmg, { element: 'fire' });
    }
    this.look?.update(dt);
    return this.t < this.life;
  }

  dispose() {}
}

// Run fn once after `delay` seconds (an actor that removes itself).
function after(game, delay, fn) {
  let t = 0;
  game.addActor({
    update(dt) {
      t += dt;
      if (t < delay) return true;
      fn();
      return false;
    },
    dispose() {},
  });
}

// Target point on the ground, clamped to `maxRange` from origin.
function clampTarget(origin, target, maxRange) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= maxRange || d < 1e-6) return new THREE.Vector3(target.x, 0, target.z);
  const s = maxRange / d;
  return new THREE.Vector3(origin.x + dx * s, 0, origin.z + dz * s);
}
