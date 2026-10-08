import * as THREE from 'three';
import { Projectile, fanDirections, timed } from './common.js';
import { GEO, glowMaterial, ELEMENT_COLOR, dirXZ, rotateXZ, randRange, damp, pick } from '../../core/utils.js';
import { damageEnemy, applyStatus } from '../combat.js';
import { blendAddMaterial } from '../fx.js';

// =====================================================================================
// FUSION SKILLS (set 2): Absolute Zero, Cataclysm, Thunderhead, Starfall, Hailstorm, Tempest.
// Self-contained on purpose: no imports from the other skill files.
// Player telegraphs and meteors are ORANGE (0xff7a2a). Red is reserved for enemy attacks.
// =====================================================================================

const ORANGE = 0xff7a2a;
const ICE = 0xbff4ff;
const ICE_TELE = 0x9fe8ff;
const ARCANE = 0xc08cff;
const STORM = ELEMENT_COLOR.storm;
const CLOUD_HEIGHT = 5;

// Scratch objects. Never stored; each use is immediate.
const _q = [];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ---------------------------------------------------------------- shared helpers

// Cursor point clamped to `range` from the caster, on the ground plane.
function aimPoint(ctx, range) {
  const dx = ctx.target.x - ctx.origin.x;
  const dz = ctx.target.z - ctx.origin.z;
  const d = Math.hypot(dx, dz);
  const k = d > range ? range / d : 1;
  return new THREE.Vector3(ctx.origin.x + dx * k, 0, ctx.origin.z + dz * k);
}

// Run fn(game) once after `dur` seconds. Uses the actor loop, so it respects hit-stop and slow-mo.
function after(game, dur, fn) {
  timed(game, dur, () => {}, () => fn(game));
}

// Drag foes in the circle toward the centre by `step` units. Skips bosses and inert world objects.
function pullToward(game, c, R, step) {
  for (const e of game.queryEnemies(c, R, _q)) {
    if (e.dead || e.inert || e.boss) continue;
    const dx = c.x - e.pos.x;
    const dz = c.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) continue;
    const s = Math.min(d, step) / d;
    e.pos.x += dx * s;
    e.pos.z += dz * s;
  }
}

// Damage every live foe in the circle, pushing each one radially outward.
function blast(game, c, R, dmg, element, knockback = 0) {
  for (const e of game.queryEnemies(c, R, _q).slice()) {
    if (e.dead || e.inert) continue;
    damageEnemy(game, e, dmg, { element, knockback, dir: dirXZ(c, e.pos, _b) });
  }
}

// ---------------------------------------------------------------- vortex (pull phase)

// Imploding rings plus a pull. Calls onDone(game) when the pull ends.
class Vortex {
  constructor(game, c, R, o) {
    this.c = c.clone();
    this.R = R;
    this.dur = o.duration;
    this.speed = o.speed;
    this.onDone = o.onDone;
    this.t = 0;
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const mat = blendAddMaterial(o.color, { hdr: 1.7, occ: 0.45, opacity: 0 });
      const m = new THREE.Mesh(GEO.ring, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(this.c.x, 0.12, this.c.z);
      m.visible = false;
      game.scene.add(m);
      this.rings.push({ m, mat, delay: i * this.dur * 0.25 });
    }
  }

  update(dt, game) {
    this.t += dt;
    pullToward(game, this.c, this.R, this.speed * dt);
    const span = this.dur * 0.5;
    for (const r of this.rings) {
      const u = (this.t - r.delay) / span;
      r.m.visible = u >= 0 && u <= 1;
      if (!r.m.visible) continue;
      const s = this.R * (1 - 0.85 * u);
      r.m.scale.set(s, s, s);
      r.mat.opacity = Math.sin(u * Math.PI) * 0.9;
    }
    if (this.t >= this.dur) {
      this.onDone(game);
      return false;
    }
    return true;
  }

  dispose(game) {
    for (const r of this.rings) {
      game.scene.remove(r.m);
      r.mat.dispose();
    }
  }
}

// Freeze every foe in range with applyStatus (no reaction side effects; frost power 6 = instant Frozen).
function freezeAll(game, c, R) {
  for (const e of game.queryEnemies(c, R, _q).slice()) {
    if (e.dead || e.inert) continue;
    applyStatus(game, e, 'frost', 6);
  }
}

// Ice spikes erupt around the centre and then fade.
class IceCrystals {
  constructor(game, c, R, n = 10) {
    this.t = 0;
    this.mat = glowMaterial(0x86e2ff, 1.6, { transparent: true, opacity: 1, depthWrite: false });
    this.meshes = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + randRange(-0.25, 0.25);
      const rr = R * randRange(0.35, 0.85);
      const h = randRange(1.4, 2.4);
      const m = new THREE.Mesh(GEO.cone, this.mat);
      m.position.set(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr);
      m.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
      m.scale.set(0.3, h, 0.3);
      m.userData.h = h;
      game.scene.add(m);
      this.meshes.push(m);
    }
  }

  update(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / 0.22);
    for (const m of this.meshes) m.position.y = m.userData.h * (k - 0.5);
    this.mat.opacity = this.t < 1.0 ? 1 : Math.max(0, 1 - (this.t - 1.0) / 0.6);
    return this.t < 1.6;
  }

  dispose(game) {
    for (const m of this.meshes) game.scene.remove(m);
    this.mat.dispose();
  }
}

// Arcane pulse: shatters every frozen foe in range (Arcane on Frozen = SHATTER).
function arcanePulse(game, c, R, dmg) {
  game.fx.ring(c, { color: ARCANE, radius: R * 1.1, life: 0.45, width: 0.22, hdr: 1.9, occ: 0.5 });
  game.fx.flashDisc(c, { color: 0xe6d4ff, radius: R, life: 0.3, hdr: 1.4 });
  game.fx.burst(c, { color: ARCANE, count: 28, speed: 10, life: 0.5, size: 0.4, backing: 0.35, backingColor: 0x1f0f3a });
  game.fx.light(c, ARCANE, 90, 0.35, 14);
  game.fx.shake(0.3);
  blast(game, c, R, dmg, 'arcane', 3);
}

// ---------------------------------------------------------------- meteors

// Full-size meteor impact: flash, ring, burst, light, shake, then blast damage.
function meteorImpact(game, c, o) {
  game.fx.flashDisc(c, { color: 0xffb070, radius: o.radius * 1.1, life: 0.3, hdr: 1.4 });
  game.fx.ring(c, { color: ORANGE, radius: o.radius * 1.3, life: 0.4, width: 0.25 });
  game.fx.burst(c, { color: 0xff8a2a, count: 26, speed: 9, life: 0.6, size: 0.4, up: 1.4, gravity: 4, backing: 0.45, backingColor: 0x2a0f06 });
  game.fx.burst(c, { color: 0xffe14a, count: 10, speed: 12, life: 0.3, size: 0.25 });
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
    this.mat = glowMaterial(ORANGE, 1.8);
    this.haloMat = blendAddMaterial(ORANGE, { hdr: 1.5, opacity: 0.4, occ: 0.3 });
    this.mesh = new THREE.Mesh(GEO.sphere, this.mat);
    this.mesh.scale.setScalar(0.7 * o.scale);
    this.halo = new THREE.Mesh(GEO.sphere, this.haloMat);
    this.halo.scale.setScalar(1.6 * o.scale);
    game.scene.add(this.mesh);
    game.scene.add(this.halo);
  }

  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, this.t / this.o.fall);
    const y = 0.7 * this.o.scale + 24 * (1 - k) * (1 - k);
    this.mesh.position.set(this.p.x, y, this.p.z);
    this.halo.position.set(this.p.x, y, this.p.z);
    if (Math.random() < 0.9) {
      _b.set((Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3);
      game.fx.spark(this.mesh.position, _b, { color: ORANGE, size: 0.35 * this.o.scale, life: 0.35 });
    }
    if (k >= 1) {
      meteorImpact(game, this.p, this.o);
      this.o.then?.(game, this.p);
      return false;
    }
    return true;
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    game.scene.remove(this.halo);
    this.mat.dispose();
    this.haloMat.dispose();
  }
}

// Orange telegraph for `o.fall` seconds, then the meteor lands on pos.
// o: fall, radius, dmg, element, knockback, scale, shake, light, telegraph (false to skip), then(game, p)
function callMeteor(game, pos, o) {
  const p = new THREE.Vector3(pos.x, 0, pos.z);
  if (o.telegraph !== false) game.fx.telegraph(p, o.radius, o.fall, { color: ORANGE, friendly: true });
  game.addActor(new MeteorFall(game, p, o));
}

// A lingering ground area that ticks damage. Used for craters and mini-blizzards.
// o: radius, life, tick, dmg, element, color
class GroundZone {
  constructor(game, pos, o) {
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.o = o;
    this.age = 0;
    this.tick = 0;
    this.mat = blendAddMaterial(o.color, { hdr: 1.3, opacity: 0.3, occ: 0.35, side: THREE.DoubleSide, depthTest: false });
    this.ringMat = blendAddMaterial(o.color, { hdr: 1.6, opacity: 0.8, occ: 0.5, side: THREE.DoubleSide, depthTest: false });
    this.disc = new THREE.Mesh(GEO.disc, this.mat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.set(this.pos.x, 0.05, this.pos.z);
    this.disc.scale.setScalar(o.radius);
    this.ring = new THREE.Mesh(GEO.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(this.pos.x, 0.07, this.pos.z);
    this.ring.scale.setScalar(o.radius);
    game.scene.add(this.disc);
    game.scene.add(this.ring);
  }

  update(dt, game) {
    const o = this.o;
    this.age += dt;
    this.tick += dt;
    const k = this.age / o.life;
    const fade = k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;
    this.mat.opacity = (0.3 + 0.07 * Math.sin(this.age * 7)) * fade;
    this.ringMat.opacity = 0.8 * fade;

    if (this.tick >= o.tick) {
      this.tick -= o.tick;
      for (const e of game.queryEnemies(this.pos, o.radius, _q).slice()) {
        if (e.dead || e.inert) continue;
        damageEnemy(game, e, o.dmg, { element: o.element, noCrit: true });
      }
    }

    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2;
      const rr = o.radius * Math.sqrt(Math.random());
      _a.set(this.pos.x + Math.cos(a) * rr, 0.2, this.pos.z + Math.sin(a) * rr);
      _b.set(0, 1.4, 0);
      game.fx.spark(_a, _b, { color: o.color, size: 0.2, life: 0.6 });
    }
    return this.age < o.life;
  }

  dispose(game) {
    game.scene.remove(this.disc);
    game.scene.remove(this.ring);
    this.mat.dispose();
    this.ringMat.dispose();
  }
}

// ---------------------------------------------------------------- tempest helpers

// Orange 0.3 s telegraph, then a bolt falls from the sky onto the foe.
function skyStrike(game, e, dmg) {
  const p = new THREE.Vector3(e.pos.x, 0, e.pos.z);
  game.fx.telegraph(p, 1.1, 0.3, {
    color: ORANGE, friendly: true,
    onDone: () => {
      if (e.dead) return;
      game.fx.lightning({ x: p.x, y: 16, z: p.z }, { x: p.x, y: 0.9, z: p.z }, { color: STORM, life: 0.2, strands: 2, jag: 0.3 });
      game.fx.burst(p, { color: 0xfff27a, count: 10, speed: 6, life: 0.3, size: 0.3, up: 1 });
      damageEnemy(game, e, dmg, { element: 'storm' });
    },
  });
}

// Lightning chain from `first` to up to `max` foes in total (the first hit counts).
function tempestChain(game, first, max, mult) {
  const range = 5.5 * game.player.stats.area;
  const seen = new Set([first]);
  let cur = first;
  for (let i = 1; i < max; i++) {
    const next = game.nearestEnemy(cur.pos, range, seen);
    if (!next) break;
    seen.add(next);
    _a.set(cur.pos.x, 0.9, cur.pos.z);
    _b.set(next.pos.x, 0.9, next.pos.z);
    game.fx.lightning(_a, _b, { color: STORM, life: 0.14 });
    damageEnemy(game, next, 14 * mult, { element: 'storm' });
    if (Math.random() < 0.25) skyStrike(game, next, 30 * mult);
    cur = next;
  }
}

// ---------------------------------------------------------------- ABSOLUTE ZERO

export const absoluteZero = {
  id: 'absoluteZero',
  name: 'Absolute Zero',
  icon: '✳',
  element: 'frost',
  maxRank: 3,
  range: 12,
  hint: 'Drag foes into a vortex, freeze them, then shatter the frozen with an arcane pulse.',
  desc: (rank) => [
    'At the cursor: a 1.2 s vortex drags foes in (r 6), then freezes them all. 0.3 s later an arcane pulse (40 dmg) Shatters every frozen foe.',
    '+30% damage.',
    'A second arcane pulse follows 0.5 s after the first.',
  ][rank - 1],
  cooldown: (rank) => [8, 7, 6][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const area = game.player.stats.area;
    const mult = r >= 2 ? 1.3 : 1;
    const R = 6 * area;
    const c = aimPoint(ctx, 12);

    game.fx.telegraph(c, R, 1.2, { color: ICE_TELE, friendly: true });
    game.addActor(new Vortex(game, c, R, {
      color: ICE,
      duration: 1.2,
      speed: 7.5,
      onDone: (g) => {
        freezeAll(g, c, R);
        g.addActor(new IceCrystals(g, c, R));
        g.fx.flashDisc(c, { color: 0xe8fbff, radius: R * 1.05, life: 0.4, hdr: 1.4 });
        g.fx.ring(c, { color: 0x6fd0ff, radius: R, life: 0.35, width: 0.3, hdr: 1.9, occ: 0.5 });
        g.fx.burst(c, { color: 0xdff8ff, count: 36, speed: 8, life: 0.7, size: 0.35, up: 1.2 });
        g.fx.light(c, ICE_TELE, 120, 0.45, 16);
        g.fx.shake(0.35);
        g.hitStop(0.05);
        after(g, 0.3, (gg) => arcanePulse(gg, c, R, 40 * mult));
        if (r >= 3) after(g, 0.8, (gg) => arcanePulse(gg, c, R, 40 * mult));
      },
    }));

    game.fx.burst(ctx.origin, { color: ICE, count: 6, speed: 3, life: 0.25, size: 0.3 });
  },
};

// ---------------------------------------------------------------- CATACLYSM

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

    // Orange wind-up on the impact footprint, shown for the whole pull.
    game.fx.telegraph(c, 5 * area, 1.5, { color: ORANGE, friendly: true });
    game.addActor(new Vortex(game, c, 6 * area, {
      color: ORANGE,
      duration: 1.5,
      speed: 6,
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
                }));
              }
            }
          },
        });
      },
    }));

    game.fx.burst(ctx.origin, { color: ORANGE, count: 6, speed: 3, life: 0.25, size: 0.3 });
  },
};

// ---------------------------------------------------------------- THUNDERHEAD (auto)

const cloudRadius = (game, rank) => 6 * game.player.stats.area * (rank >= 2 ? 1.2 : 1);

// Place the puffs, disc and ring for radius R. Called on init, on rank-up and when area changes.
function layoutCloud(state, R) {
  state.R = R;
  state.disc.scale.setScalar(R);
  state.ring.scale.setScalar(R);
  const n = state.puffs.length;
  for (let i = 0; i < n; i++) {
    const m = state.puffs[i];
    if (i === 0) {
      m.position.x = 0;
      m.position.z = 0;
    } else {
      const a = ((i - 1) / (n - 1)) * Math.PI * 2 + 0.5;
      m.position.x = Math.cos(a) * R * 0.38;
      m.position.z = Math.sin(a) * R * 0.38;
    }
    m.scale.setScalar(R * (0.28 + 0.04 * (i % 2)));
  }
}

function cloudStrike(game, cloud, e) {
  _a.set(cloud.x, CLOUD_HEIGHT - 0.4, cloud.z);
  _b.set(e.pos.x, 0.9, e.pos.z);
  game.fx.lightning(_a, _b, { color: STORM, life: 0.2, strands: 2, jag: 0.35 });
  damageEnemy(game, e, 30, { element: 'storm' });
}

export const thunderhead = {
  id: 'thunderhead',
  name: 'Thunderhead',
  icon: '☁',
  element: 'storm',
  maxRank: 3,
  range: 3,
  hint: 'A storm cloud follows you, chilling foes beneath it and calling strikes onto the chilled.',
  desc: (rank) => [
    'A storm cloud drifts after you. Every 0.4 s it chills all foes beneath (4 frost). Every 0.9 s it strikes a random foe for 30 storm.',
    '+20% radius.',
    'Strikes every 0.6 s.',
  ][rank - 1],
  cooldown: () => 0,

  init(game, state, rank) {
    state.pos = new THREE.Vector3(game.player.pos.x, 0, game.player.pos.z);
    state.t = 0;
    state.tickT = 0;
    state.strikeT = 0;
    state.group = new THREE.Group();

    const puffMat = new THREE.MeshBasicMaterial({ color: 0x3d4b63, transparent: true, opacity: 0.6, depthWrite: false });
    const discMat = new THREE.MeshBasicMaterial({ color: 0x4a6ad0, transparent: true, opacity: 0.12, depthWrite: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5f86e0, transparent: true, opacity: 0.6, depthWrite: false });
    state.mats = [puffMat, discMat, ringMat];

    state.puffs = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(GEO.sphere, puffMat);
      state.puffs.push(m);
      state.group.add(m);
    }
    state.disc = new THREE.Mesh(GEO.disc, discMat);
    state.disc.rotation.x = -Math.PI / 2;
    state.disc.position.y = 0.05;
    state.ring = new THREE.Mesh(GEO.ring, ringMat);
    state.ring.rotation.x = -Math.PI / 2;
    state.ring.position.y = 0.06;
    state.group.add(state.disc, state.ring);

    game.scene.add(state.group);
    layoutCloud(state, cloudRadius(game, rank));
    state.group.position.copy(state.pos);
  },

  update(game, dt, state, rank) {
    const p = game.player.pos;
    const R = cloudRadius(game, rank);

    // Lagging follow.
    state.pos.x = damp(state.pos.x, p.x, 2.2, dt);
    state.pos.z = damp(state.pos.z, p.z, 2.2, dt);
    state.group.position.set(state.pos.x, 0, state.pos.z);
    if (R !== state.R) layoutCloud(state, R);

    // Puff bob.
    state.t += dt;
    for (let i = 0; i < state.puffs.length; i++) {
      state.puffs[i].position.y = CLOUD_HEIGHT + Math.sin(state.t * 1.2 + i * 1.9) * 0.35;
    }

    // Snow drifting out of the cloud.
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      const rr = R * Math.sqrt(Math.random());
      _a.set(state.pos.x + Math.cos(a) * rr, CLOUD_HEIGHT - 0.5, state.pos.z + Math.sin(a) * rr);
      _b.set(randRange(-0.2, 0.2), -1.6, randRange(-0.2, 0.2));
      game.fx.spark(_a, _b, { color: 0xe6f4ff, size: 0.14, life: 2.6, drag: 0.6, hdr: 1.6 });
    }

    // Frost pulse on everything under the cloud.
    state.tickT += dt;
    if (state.tickT >= 0.4) {
      state.tickT -= 0.4;
      for (const e of game.queryEnemies(state.pos, R, _q).slice()) {
        if (e.dead || e.inert) continue;
        damageEnemy(game, e, 4, { element: 'frost' });
      }
    }

    // Sky strike on a random foe under the cloud.
    state.strikeT += dt;
    const every = rank >= 3 ? 0.6 : 0.9;
    if (state.strikeT >= every) {
      state.strikeT -= every;
      const pool = [];
      for (const e of game.queryEnemies(state.pos, R, _q)) {
        if (!e.dead && !e.inert) pool.push(e);
      }
      if (pool.length) cloudStrike(game, state.pos, pick(pool));
    }
  },

  onRankUp(game, state, rank) {
    layoutCloud(state, cloudRadius(game, rank));
  },

  dispose(game, state) {
    if (state.group) game.scene.remove(state.group);
    for (const m of state.mats ?? []) m.dispose();
    state.group = null;
    state.mats = null;
    state.puffs = null;
  },
};

// ---------------------------------------------------------------- STARFALL

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
        trail: { color: 0xff6a1f, rate: 40, size: 0.22, life: 0.18 },
        onHit: (g, e, p) => {
          g.fx.burst(p.pos, { color: 0xffa060, count: 4, speed: 3, life: 0.2, size: 0.25 });
          st.hits = (st.hits ?? 0) + 1;
          if (st.hits >= every) {
            st.hits = 0;
            callMeteor(g, p.pos, { fall: 0.5, radius: 2.6 * area, dmg: 45 * mult, element: 'fire', scale: 0.9, shake: 0.15, light: 50 });
          }
        },
      }));
    }

    game.fx.burst(ctx.origin, { color: 0xff8a2a, count: 4, speed: 3, life: 0.18, size: 0.25 });
  },
};

// ---------------------------------------------------------------- HAILSTORM

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

    for (const d of fanDirections(ctx.dir, count, 0.2 * (count - 1))) {
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
        trail: { color: 0x9fe6ff, rate: 60, size: 0.2, life: 0.22 },
        onHit: (g, e, p) => {
          g.fx.burst(p.pos, { color: ICE, count: 4, speed: 3, life: 0.2, size: 0.22 });
        },
        onExpire: (g, p) => {
          g.addActor(new GroundZone(g, p.pos, { radius: 2 * area, life: 2, tick: 0.33, dmg: 4 * mult, element: 'frost', color: 0x9fe6ff }));
        },
      }));
    }

    game.fx.burst(ctx.origin, { color: ICE, count: 5, speed: 3, life: 0.2, size: 0.25 });
  },
};

// ---------------------------------------------------------------- TEMPEST

export const tempest = {
  id: 'tempest',
  name: 'Tempest',
  icon: '⚡',
  element: 'storm',
  maxRank: 3,
  range: 10,
  hint: 'Spark bolts chain from foe to foe and call sky strikes.',
  desc: (rank) => [
    'Spark bolt that chains through up to 6 foes (14 dmg per jump). Each jump has a 25% chance to call a sky strike (30 storm).',
    '+30% damage.',
    'Chains through up to 8 foes.',
  ][rank - 1],
  cooldown: () => 0.3,

  cast(game, ctx) {
    const r = ctx.rank;
    const mult = r >= 2 ? 1.3 : 1;
    const maxFoes = r >= 3 ? 8 : 6;
    const count = 1 + game.player.stats.projectiles;

    for (const d of fanDirections(ctx.dir, count, 0.14 * (count - 1))) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir: d,
        speed: 30,
        range: 10,
        radius: 0.45,
        damage: 10 * mult,
        element: 'storm',
        pierce: 0,
        knockback: 0.3,
        size: 0.2,
        color: 0xfff27a,
        trail: { color: 0xffe14a, rate: 50, size: 0.2, life: 0.15 },
        onHit: (g, e) => tempestChain(g, e, maxFoes, mult),
      }));
    }

    game.fx.burst(ctx.origin, { color: STORM, count: 4, speed: 3, life: 0.18, size: 0.25 });
  },
};
