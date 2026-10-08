import * as THREE from 'three';
import { GEO, glowMaterial, dirXZ } from '../../core/utils.js';
import { damageEnemy } from '../combat.js';
import { damageArea } from './common.js';

// METEOR (fire, active). Orange telegraph at the cursor; a glowing rock falls for FALL_TIME,
// then impact damage + knockback and a burning crater (an actor that ticks fire damage).
const COLOR = 0xff7a2a;
const HALO_COLOR = 0xffa050;
const FALL_TIME = 0.8;      // telegraph duration == fall duration
const FALL_HEIGHT = 22;
const RANGE = 14;           // cast clamp (auto-cast only targets within this range too)
const CRATER_TICK = 0.5;

// Scratch objects for fx.spark (it only reads x/y/z, so reuse avoids per-frame allocation).
const _sp = { x: 0, y: 0, z: 0 };
const _sv = { x: 0, y: 0, z: 0 };

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

  game.addActor(new FallingRock(game, pos));
  game.fx.telegraph(pos, impactR, FALL_TIME, {
    color: COLOR,
    onDone: () => impact(game, pos, impactR, impactDmg, craterR, craterDmg, craterLife),
  });
}

function impact(game, pos, radius, dmg, craterR, craterDmg, craterLife) {
  for (const e of game.queryEnemies(pos, radius, [])) {
    damageEnemy(game, e, dmg, { element: 'fire', knockback: 8, dir: dirXZ(pos, e.pos) });
  }

  game.fx.flashDisc(pos, { color: COLOR, radius: radius * 0.9, life: 0.3 });
  game.fx.ring(pos, { color: COLOR, radius, life: 0.45 });
  game.fx.burst(pos, { color: 0xffa060, count: 26, speed: 8, life: 0.6, size: 0.4 });
  game.fx.burst(pos, { color: 0xffd700, count: 10, speed: 5, life: 0.35, size: 0.3 });
  game.fx.light(pos, COLOR, 60, 0.35);
  game.fx.shake(0.25);

  game.addActor(new Crater(game, pos, craterR, craterDmg, craterLife));
}

// Glowing rock that falls from high above (drifting in from the upper-left) onto the telegraph.
class FallingRock {
  constructor(game, target) {
    this.tx = target.x;
    this.tz = target.z;
    this.t = 0;
    this.trailAcc = 0;

    this.rockMat = glowMaterial(COLOR, 3);
    this.haloMat = glowMaterial(HALO_COLOR, 1.5, { transparent: true, opacity: 0.45, depthWrite: false, additive: true });
    this.rock = new THREE.Mesh(GEO.icosa, this.rockMat);
    this.rock.scale.setScalar(0.9);
    const halo = new THREE.Mesh(GEO.sphere, this.haloMat);
    halo.scale.setScalar(1.7);

    this.group = new THREE.Group();
    this.group.add(this.rock, halo);
    this.group.position.set(this.tx - 4, FALL_HEIGHT, this.tz - 4);
    game.scene.add(this.group);
  }

  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, this.t / FALL_TIME);
    const a = 1 - k;
    // Starts at (-4, 22, -4) offset and accelerates down onto the target.
    this.group.position.set(this.tx - 4 * a, 1 + (FALL_HEIGHT - 1) * a * a, this.tz - 4 * a);
    this.rock.rotation.x += dt * 5;
    this.rock.rotation.y += dt * 3;

    // Fiery trail.
    this.trailAcc += dt * 45;
    while (this.trailAcc >= 1) {
      this.trailAcc -= 1;
      const p = this.group.position;
      _sp.x = p.x + (Math.random() - 0.5) * 0.3;
      _sp.y = p.y + (Math.random() - 0.5) * 0.3;
      _sp.z = p.z + (Math.random() - 0.5) * 0.3;
      _sv.x = (Math.random() - 0.5) * 0.8;
      _sv.y = 0.5 + Math.random() * 1.0;
      _sv.z = (Math.random() - 0.5) * 0.8;
      game.fx.spark(_sp, _sv, { color: 0xff9a40, size: 0.3, life: 0.35 });
    }
    return this.t < FALL_TIME;
  }

  dispose(game) {
    game.scene.remove(this.group);
    this.rockMat.dispose();
    this.haloMat.dispose();
  }
}

// Burning crater: ground glow + rising embers, ticking fire damage until it expires.
class Crater {
  constructor(game, pos, radius, dmg, life) {
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = radius;
    this.dmg = dmg;
    this.life = life;
    this.t = 0;
    this.tickAcc = 0;
    this.sparkAcc = 0;

    this.glowMat = glowMaterial(COLOR, 2, { transparent: true, opacity: 0.5, depthWrite: false, additive: true });
    this.charMat = new THREE.MeshBasicMaterial({ color: 0x2a0f06, transparent: true, opacity: 0.6, depthWrite: false });

    const glow = new THREE.Mesh(GEO.disc, this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    glow.scale.setScalar(radius);
    const char = new THREE.Mesh(GEO.disc, this.charMat);
    char.rotation.x = -Math.PI / 2;
    char.position.y = 0.06;
    char.scale.setScalar(radius * 0.55);

    this.group = new THREE.Group();
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.add(glow, char);
    game.scene.add(this.group);
  }

  update(dt, game) {
    this.t += dt;
    const fade = Math.min(1, (this.life - this.t) / 0.4);
    this.glowMat.opacity = (0.42 + 0.12 * Math.sin(this.t * 9)) * fade;
    this.charMat.opacity = 0.6 * fade;

    this.tickAcc += dt;
    if (this.tickAcc >= CRATER_TICK) {
      this.tickAcc -= CRATER_TICK;
      damageArea(game, this.pos, this.radius, this.dmg, { element: 'fire' });
    }

    // Embers rising from inside the crater.
    this.sparkAcc += dt * 16;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * this.radius;
      _sp.x = this.pos.x + Math.cos(a) * rr;
      _sp.y = 0.2;
      _sp.z = this.pos.z + Math.sin(a) * rr;
      _sv.x = (Math.random() - 0.5) * 0.6;
      _sv.y = 1.2 + Math.random() * 1.6;
      _sv.z = (Math.random() - 0.5) * 0.6;
      game.fx.spark(_sp, _sv, { color: 0xff8a2a, size: 0.3, life: 0.6 });
    }
    return this.t < this.life;
  }

  dispose(game) {
    game.scene.remove(this.group);
    this.glowMat.dispose();
    this.charMat.dispose();
  }
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
