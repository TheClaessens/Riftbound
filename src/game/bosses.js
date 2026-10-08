import * as THREE from 'three';
import { GEO, glowMaterial, dirXZ, distXZ, ELEMENT_CSS } from '../core/utils.js';
import { makeStatus, updateStatuses, statusTint } from './combat.js';
import { createEnemy, EnemyBullet } from './enemies.js';
import { ACTS, BOSS_HP, enemyHpMult, enemyDmgMult } from './acts.js';

// =====================================================================================
//  Bosses: createBoss(game, id, pos, opts) for 'hollowWarden' | 'vashkar' | 'riftHeart'.
//  Each returns an enemy-contract object with boss: true, name, phase (1|2).
//  Every attack is telegraphed (red 0xff3344 / orange-red 0xff5a2a). Hazards and shots are
//  actors with hostile = true. Damage only lands when the player is inside the area at
//  resolution time (or when a hazard actually touches them).
// =====================================================================================

const RED = 0xff3344;
const ORANGE = 0xff5a2a;
const BULLET_COLOR = 0xff2a6d;
const ENEMY_CAP = 320;
const WARDS = ['fire', 'frost', 'storm', 'arcane'];
const WARD_HEX = { fire: 0xff6a1f, frost: 0x66d9ff, storm: 0xffe14a, arcane: 0xb67cff };
const WARD_CYCLE = 10;
const CHARGE_LEN = 26;
const CHARGE_SPEED = 22;
const BEAM_LEN = 22;
const BEAM_W = 1.2;
const LAVA_LIFE = 2.5;
const LAVA_DROP = 0.25;
const LAVA_R = 1.7;

const DEFS = {
  hollowWarden: { name: 'The Hollow Warden', radius: 1.8, speed: 2.4, stopGap: 1.4, resist: null, deathColor: 0x6a5aaa, cycle: 3.2, cycle2: 2.2 },
  vashkar: { name: 'Vashkar, the Cinder Colossus', radius: 2.2, speed: 2.0, stopGap: 1.2, resist: { fire: 0.5 }, deathColor: 0xff6a1f, cycle: 3.0, cycle2: 2.2 },
  riftHeart: { name: 'The Rift Heart', radius: 2.4, speed: 1.1, stopGap: 5, resist: null, deathColor: 0x9ff3ff, cycle: 3.2, cycle2: 2.4 },
};

// Shared geometry: never disposed, and never handed to fx transients (fx would dispose it).
const GEOM = {
  stone: new THREE.DodecahedronGeometry(1, 0),
  molten: new THREE.IcosahedronGeometry(1, 1),
  shard: GEO.octa,
  core: GEO.octa,
  eye: GEO.sphereLow,
  crack: GEO.box,
  ring: new THREE.RingGeometry(0.92, 1, 96),
};

// Base materials: each boss clones what it needs (per-instance flash/tint) and disposes it later.
const BASE = {
  stone: new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.92, metalness: 0.05 }),
  molten: new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 0.75, metalness: 0.15 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.5, depthWrite: false }),
};

// Direction from an angle measured the same way as group.rotation.y (local +Z).
function dirFromAngle(a) {
  return new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
}

// Distance from point (px,pz) to segment (a -> b) in XZ.
function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + abx * t - px, cz = az + abz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

function piece(geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  return m;
}

function own(b, mat) {
  b.mats.push(mat);
  return mat;
}

// =====================================================================================
//  Hostile actors
// =====================================================================================

// Expanding fire ring from a point. Hurts the player once, when the band crosses them.
// Dash through it (i-frames) to avoid it.
class FlameRing {
  constructor(game, center, damage) {
    this.hostile = true;
    this.center = new THREE.Vector3(center.x, 0, center.z);
    this.r = 2.6;
    this.speed = 9;
    this.width = 0.8;
    this.maxR = 18;
    this.damage = damage;
    this.hit = false;
    this.mat = glowMaterial(0xff6a1f, 2.4, { transparent: true, opacity: 0.9, depthWrite: false, additive: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(GEOM.ring, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(this.center.x, 0.12, this.center.z);
    this.mesh.scale.setScalar(this.r);
    game.scene.add(this.mesh);
  }

  update(dt, game) {
    this.r += this.speed * dt;
    this.mesh.scale.setScalar(this.r);
    this.mat.opacity = 0.9 - 0.5 * Math.min(1, this.r / this.maxR);
    if (!this.hit) {
      const p = game.player;
      if (Math.abs(distXZ(p.pos, this.center) - this.r) <= this.width * 0.5 + p.radius) {
        this.hit = true;
        p.takeDamage(this.damage, this);
        game.fx.burst(p.pos, { color: 0xff6a1f, count: 12, speed: 5, life: 0.4, size: 0.35 });
      }
    }
    return this.r < this.maxR;
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    this.mat.dispose();
  }
}

// Lava pools dropped along a charge path. Burns the player while they stand in one.
class LavaTrail {
  constructor(game, boss, dmgScale) {
    this.hostile = true;
    this.boss = boss;
    this.dmgScale = dmgScale;
    this.emitting = true;
    this.points = [];
    this.dropT = 0;
    this.tickT = 0;
    this.mat = glowMaterial(0xff5a2a, 1.8, { transparent: true, opacity: 0.7, depthWrite: false, additive: true });
  }

  update(dt, game) {
    if (this.emitting && !this.boss.dead) {
      this.dropT -= dt;
      if (this.dropT <= 0) {
        this.dropT = LAVA_DROP;
        this._drop(game);
      }
    }
    for (let i = this.points.length - 1; i >= 0; i--) {
      const pt = this.points[i];
      pt.t += dt;
      if (pt.t >= LAVA_LIFE) {
        game.scene.remove(pt.mesh);
        this.points.splice(i, 1);
        continue;
      }
      pt.mesh.scale.setScalar(1.5 * (1 - 0.35 * (pt.t / LAVA_LIFE)));
    }
    this.tickT -= dt;
    if (this.tickT <= 0 && this.points.length) {
      const p = game.player;
      for (const pt of this.points) {
        if (distXZ(p.pos, pt.pos) < LAVA_R) {
          p.takeDamage(8 * this.dmgScale, this.boss);
          this.tickT = 0.5;
          break;
        }
      }
    }
    return this.emitting || this.points.length > 0;
  }

  _drop(game) {
    const m = new THREE.Mesh(GEO.disc, this.mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(this.boss.pos.x, 0.06, this.boss.pos.z);
    m.scale.setScalar(1.5);
    game.scene.add(m);
    this.points.push({ mesh: m, pos: this.boss.pos.clone(), t: 0 });
  }

  dispose(game) {
    for (const pt of this.points) game.scene.remove(pt.mesh);
    this.points.length = 0;
    this.emitting = false;
    this.mat.dispose();
  }
}

// Sweeping beams from the Rift Heart. Each beam sweeps `Math.PI` over `dur` seconds;
// beams are spaced evenly around the circle. Damage: at most once per 0.5 s.
class BeamSweep {
  constructor(game, boss, base, n, dur, damage) {
    this.hostile = true;
    this.boss = boss;
    this.base = base;
    this.n = n;
    this.dur = dur;
    this.damage = damage;
    this.t = 0;
    this.hitCd = 0;
    this.mat = glowMaterial(RED, 2.2, { transparent: true, opacity: 0.8, depthWrite: false, additive: true });
    this.beams = [];
    for (let i = 0; i < n; i++) {
      const group = new THREE.Group();
      const m = new THREE.Mesh(GEO.plane, this.mat);
      m.rotation.x = -Math.PI / 2;
      m.position.z = BEAM_LEN / 2;
      m.scale.set(BEAM_W, BEAM_LEN, 1);
      group.add(m);
      game.scene.add(group);
      this.beams.push(group);
    }
  }

  update(dt, game) {
    if (this.boss.dead) return false;
    this.t += dt;
    this.hitCd -= dt;
    const k = Math.min(1, this.t / this.dur);
    const o = this.boss.pos;
    const p = game.player;
    for (let i = 0; i < this.n; i++) {
      const a = this.base + Math.PI * k + (Math.PI * 2 * i) / this.n;
      const g = this.beams[i];
      g.position.set(o.x, 0.1, o.z);
      g.rotation.y = a;
      if (this.hitCd <= 0) {
        const d = segDist(p.pos.x, p.pos.z, o.x, o.z, o.x + Math.sin(a) * BEAM_LEN, o.z + Math.cos(a) * BEAM_LEN);
        if (d <= BEAM_W * 0.5 + p.radius) {
          this.hitCd = 0.5;
          p.takeDamage(this.damage, this.boss);
        }
      }
    }
    return this.t < this.dur;
  }

  dispose(game) {
    for (const g of this.beams) game.scene.remove(g);
    this.mat.dispose();
  }
}

// =====================================================================================
//  Boss
// =====================================================================================

class Boss {
  constructor(game, id, pos, opts) {
    const def = DEFS[id];
    this.id = id;
    this.type = id;
    this.name = def.name;
    this.boss = true;
    this.final = !!opts.final;
    this.phase = 1;
    this.elite = false;
    this.inert = false;

    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = def.radius;
    this.maxHp = BOSS_HP[id] * (opts.hpMult ?? 1);
    this.hp = this.maxHp;
    this.xp = 150 * (opts.xpMult ?? ACTS[game.act]?.xp ?? 1);
    this.damageScale = opts.damageScale ?? 1;
    this.damage = 25 * this.damageScale;
    this.speed = def.speed;
    this.stopGap = def.stopGap;
    this.cycleBase = def.cycle;
    this.cycleP2 = def.cycle2;

    this.status = makeStatus();
    this.knock = new THREE.Vector3();
    this.kbResist = 1;
    this.dead = false;
    this.resist = def.resist;
    this.ward = null;
    this.barrier = 0;
    this.deathColor = def.deathColor;
    this.flashT = 0;
    this.mesh = null;

    // internals
    this.time = 0;
    this.busyT = 0;        // attack lockout: no new attack and no walking while > 0
    this.cycleT = 2.0;     // seconds until the next attack may start
    this.contactCd = 0;
    this.lastAttack = null;
    this.timers = [];
    this.handles = new Set();
    this.mats = [];
    this.idleHex = 0;
    this.idleI = 0;
    this.charging = false;
    this.chargesLeft = 0;
    this.chargeDir = new THREE.Vector3(0, 0, 1);
    this.chargeT = 0;
    this.chargeHit = false;
    this.trail = null;
    this.hot = false;
    this.wardT = WARD_CYCLE;
    this.wardIdx = 0;
    this.rainT = 2.5;
    this.shownWard = null;
    this._disposed = false;

    if (id === 'hollowWarden') buildWarden(this);
    else if (id === 'vashkar') buildVashkar(this);
    else buildHeart(this);

    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  flash() {
    this.flashT = 0.08;
  }

  // ---------------------------------------------------------------- frame
  update(dt, game) {
    if (this.dead) return;
    const mv = updateStatuses(game, this, dt);
    if (this.dead) return; // burn can kill
    this.time += dt;
    // Frozen (mv 0): no movement, no timers, no attacks.
    if (mv > 0) this._act(dt, game, mv);

    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-8 * dt));
    game.world.collide(this.pos, this.radius);

    if (this.phase === 1 && this.hp < this.maxHp * 0.5) this._enterPhase2(game);
    this._visuals(dt);
  }

  _enterPhase2(game) {
    this.phase = 2;
    this.cycleT = Math.min(this.cycleT, 0.6);
    this.rainT = 1.5;
    this.hot = true;
    game.events.emit('bossPhase', { enemy: this, phase: 2 });
    game.fx.shake(0.8);
    game.fx.ring(this.pos, { color: RED, radius: 9, life: 0.7, width: 0.12 });
    game.fx.flashDisc(this.pos, { color: RED, radius: 3, life: 0.3, hdr: 1.8 });
    game.fx.text({ x: this.pos.x, y: 2.6, z: this.pos.z }, 'PHASE II', '#ff5a2a', true);
  }

  _act(dt, game, mv) {
    if (this.busyT > 0) this.busyT -= dt;
    if (this.contactCd > 0) this.contactCd -= dt;
    this._tickTimers(dt);
    this._move(game, mv, dt);
    this._contact(game);
    this._think(dt, game, mv);

    this.cycleT -= dt;
    if (this.cycleT <= 0 && this.busyT <= 0 && !this.charging) {
      this.cycleT = this.phase === 2 ? this.cycleP2 : this.cycleBase;
      this._attack(game);
    }
  }

  _move(game, mv, dt) {
    if (this.busyT > 0 || this.charging) return;
    const p = game.player.pos;
    const toP = dirXZ(this.pos, p, new THREE.Vector3());
    this.mesh.rotation.y = Math.atan2(toP.x, toP.z);
    if (distXZ(this.pos, p) <= this.radius + this.stopGap) return;
    this.pos.addScaledVector(toP, this.speed * mv * dt);
  }

  _contact(game) {
    if (this.contactCd > 0) return;
    const p = game.player;
    if (distXZ(this.pos, p.pos) < this.radius + p.radius + 0.2) {
      p.takeDamage(this.damage * 0.4, this);
      this.contactCd = 1.0;
    }
  }

  _think(dt, game, mv) {
    if (this.id === 'vashkar') {
      if (this.charging) this._chargeStep(dt, game, mv);
    } else if (this.id === 'riftHeart') {
      this.wardT -= dt;
      if (this.wardT <= 0) this._cycleWard(game);
      if (this.phase === 2) {
        this.rainT -= dt;
        if (this.rainT <= 0) {
          this.rainT = 4;
          this._shardRain(game);
        }
      }
    }
  }

  _attack(game) {
    switch (this.id) {
      case 'hollowWarden': return this._wardenAttack(game);
      case 'vashkar': return this._vashkarAttack(game);
      default: return this._heartAttack(game);
    }
  }

  _pick(list) {
    let k;
    do {
      k = list[Math.floor(Math.random() * list.length)];
    } while (k === this.lastAttack && list.length > 1);
    this.lastAttack = k;
    return k;
  }

  // Telegraph helpers: the handle is tracked so dispose() can cancel it.
  _circle(game, at, radius, dur, color, onHit) {
    const handle = game.fx.telegraph(at, radius, dur, {
      color,
      onDone: () => {
        this.handles.delete(handle);
        if (!this.dead) onHit();
      },
    });
    this.handles.add(handle);
    return handle;
  }

  _line(game, from, dir, len, width, dur, color, onHit) {
    const handle = game.fx.lineTelegraph(from, dir, len, width, dur, {
      color,
      onDone: () => {
        this.handles.delete(handle);
        if (!this.dead) onHit();
      },
    });
    this.handles.add(handle);
    return handle;
  }

  _after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  _tickTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        if (!this.dead) tm.fn();
      }
    }
  }

  // Summon a group of enemies on a ring around the boss (cap-aware).
  _summon(game, types, radius) {
    const act = game.act, t = game.actTime, tier = game.tier;
    const hpMult = enemyHpMult(act, t, tier);
    const damageScale = enemyDmgMult(act, t, tier);
    const n = types.length;
    for (let i = 0; i < n; i++) {
      if (game.liveEnemyCount() >= ENEMY_CAP) break;
      const a = (Math.PI * 2 * i) / n;
      const p = new THREE.Vector3(this.pos.x + Math.cos(a) * radius, 0, this.pos.z + Math.sin(a) * radius);
      game.world.collide(p, 0.5);
      game.addEnemy(createEnemy(game, types[i], p, { hpMult, damageScale }));
    }
  }

  // ---------------------------------------------------------------- Hollow Warden
  _wardenAttack(game) {
    const kind = this._pick(['slam', 'volley', 'summon']);
    if (kind === 'slam') {
      this.busyT = 1.4;
      const at = new THREE.Vector3(game.player.pos.x, 0, game.player.pos.z);
      this._circle(game, at, 5, 1.0, RED, () => {
        const p = game.player;
        if (distXZ(p.pos, at) < 5) p.takeDamage(this.damage * 1.6, this);
        game.fx.ring(at, { color: RED, radius: 5, life: 0.25, width: 0.2 });
        game.fx.burst(at, { color: RED, count: 20, speed: 6, life: 0.5, size: 0.4 });
        game.fx.shake(0.5);
      });
    } else if (kind === 'volley') {
      this.busyT = 0.9;
      this._circle(game, this.pos, 2.4, 0.6, ORANGE, () => this._radial(game));
    } else {
      this.busyT = 1.0;
      this._circle(game, this.pos, 3.0, 0.7, ORANGE, () => this._summon(game, ['husk', 'husk', 'husk', 'husk', 'husk', 'husk'], 3.2));
    }
  }

  // Radial volley: 12 shots, or 24 interleaved shots in phase 2.
  _radial(game) {
    const n = this.phase === 2 ? 24 : 12;
    for (let i = 0; i < n; i++) {
      const dir = dirFromAngle((Math.PI * 2 * i) / n);
      const start = this.pos.clone().addScaledVector(dir, this.radius + 0.5);
      game.addActor(new EnemyBullet(game, start, dir, this.damage * 0.6, { speed: 7.5, radius: 0.28, life: 4, color: BULLET_COLOR, size: 0.3 }));
    }
  }

  // ---------------------------------------------------------------- Vashkar
  _vashkarAttack(game) {
    const kind = this._pick(['charge', 'meteor', 'ring']);
    if (kind === 'charge') {
      this.chargesLeft = this.phase === 2 ? 2 : 1;
      this.busyT = this.phase === 2 ? 4.2 : 2.5;
      this._startCharge(game, 0.9);
    } else if (kind === 'meteor') {
      this.busyT = 1.3;
      this._meteorRain(game);
    } else {
      this.busyT = this.phase === 2 ? 1.6 : 1.0;
      this._flameRings(game, this.phase === 2 ? 2 : 1);
    }
  }

  _startCharge(game, telegraphTime) {
    this.chargesLeft--;
    const dir = dirXZ(this.pos, game.player.pos, new THREE.Vector3());
    this.chargeDir.copy(dir);
    this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    this._line(game, this.pos, dir, CHARGE_LEN, 3.0, telegraphTime, RED, () => this._beginCharge(game));
  }

  _beginCharge(game) {
    this.charging = true;
    this.chargeT = CHARGE_LEN / CHARGE_SPEED;
    this.chargeHit = false;
    this.trail = new LavaTrail(game, this, this.damageScale);
    game.addActor(this.trail);
    game.fx.shake(0.4);
  }

  _chargeStep(dt, game, mv) {
    const step = CHARGE_SPEED * mv * dt;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.addScaledVector(this.chargeDir, step);
    game.world.collide(this.pos, this.radius);
    this.chargeT -= dt;
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);

    const p = game.player;
    if (!this.chargeHit && distXZ(this.pos, p.pos) < this.radius + p.radius + 0.3) {
      this.chargeHit = true;
      p.takeDamage(this.damage * 1.2, this);
    }
    if (this.chargeT <= 0 || moved < step * 0.4) this._endCharge(game);
  }

  _endCharge(game) {
    this.charging = false;
    if (this.trail) this.trail.emitting = false;
    game.fx.shake(0.3);
    game.fx.burst(this.pos, { color: ORANGE, count: 10, speed: 5, life: 0.4, size: 0.4 });
    if (this.chargesLeft > 0) this._startCharge(game, 0.5);
  }

  _meteorRain(game) {
    const c = game.player.pos;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 4;
      const at = new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
      game.world.collide(at, 0.5);
      this._circle(game, at, 2.5, 1.1, RED, () => {
        if (distXZ(game.player.pos, at) < 2.5) game.player.takeDamage(this.damage, this);
        game.fx.flashDisc(at, { color: ORANGE, radius: 2.5, life: 0.25, hdr: 1.8 });
        game.fx.burst(at, { color: ORANGE, count: 14, speed: 5, life: 0.5, size: 0.4, up: 1.5 });
        game.fx.shake(0.15);
      });
    }
  }

  _flameRings(game, count) {
    const origin = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    for (let k = 0; k < count; k++) {
      const fire = () => this._circle(game, origin, 2.6, 0.5, ORANGE, () => {
        game.addActor(new FlameRing(game, origin, this.damage));
      });
      if (k === 0) fire();
      else this._after(0.6 * k, fire);
    }
  }

  // ---------------------------------------------------------------- Rift Heart
  _heartAttack(game) {
    const kind = this._pick(['beams', 'volley', 'summon']);
    if (kind === 'beams') this._twinBeams(game);
    else if (kind === 'volley') this._prismVolley(game);
    else {
      this.busyT = 1.0;
      this._circle(game, this.pos, 3.2, 0.8, ORANGE, () => this._summon(game, ['shardling', 'shardling', 'shardling', 'shardling', 'wraith'], 3.4));
    }
  }

  _twinBeams(game) {
    const p2 = this.phase === 2;
    const n = p2 ? 4 : 2;
    const sweep = p2 ? 2 : 3;
    const d = dirXZ(this.pos, game.player.pos, new THREE.Vector3());
    const base = Math.atan2(d.x, d.z);
    this.busyT = 1.0 + sweep + 0.3;
    const origin = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    let done = 0;
    for (let i = 0; i < n; i++) {
      const dir = dirFromAngle(base + (Math.PI * 2 * i) / n);
      this._line(game, origin, dir, BEAM_LEN, BEAM_W, 1.0, RED, () => {
        done++;
        if (done === n) game.addActor(new BeamSweep(game, this, base, n, sweep, this.damage * 0.8));
      });
    }
  }

  // Prism Volley: 5 fans of 5 shots, each fan aimed at the player at its firing time.
  _prismVolley(game) {
    this.busyT = 0.6 + 1.5 + 0.3;
    this._circle(game, this.pos, 2.8, 0.6, ORANGE, () => {
      for (let k = 0; k < 5; k++) this._after(k * 0.3, () => this._fan(game));
    });
  }

  _fan(game) {
    const aim = Math.atan2(game.player.pos.x - this.pos.x, game.player.pos.z - this.pos.z);
    for (let j = -2; j <= 2; j++) {
      const dir = dirFromAngle(aim + j * 0.16);
      const start = this.pos.clone().addScaledVector(dir, this.radius + 0.5);
      game.addActor(new EnemyBullet(game, start, dir, this.damage * 0.6, { speed: 8, radius: 0.28, life: 4, color: BULLET_COLOR, size: 0.3 }));
    }
  }

  // Phase 2: 8 random circles within 12 u of the player, every 4 s.
  _shardRain(game) {
    const c = game.player.pos;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 12;
      const at = new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
      game.world.collide(at, 0.5);
      this._circle(game, at, 2.2, 1.0, RED, () => {
        if (distXZ(game.player.pos, at) < 2.2) game.player.takeDamage(this.damage * 0.8, this);
        game.fx.burst(at, { color: 0x9ff3ff, count: 10, speed: 4, life: 0.4, size: 0.3 });
      });
    }
  }

  // Ward cycle: next element every 10 s. A reaction on the boss clears ward until the next tick.
  _cycleWard(game) {
    this.wardT = WARD_CYCLE;
    this.wardIdx = (this.wardIdx + 1) % WARDS.length;
    this.ward = WARDS[this.wardIdx];
    game.fx.text({ x: this.pos.x, y: 2.2, z: this.pos.z }, `PRISM WARD: ${this.ward.toUpperCase()}`, ELEMENT_CSS[this.ward], true);
  }

  _applyWard() {
    this.shownWard = this.ward;
    const hex = this.ward ? WARD_HEX[this.ward] : 0xdfe6ff;
    this.idleHex = hex;
    this.idleI = this.ward ? 1.1 : 0.3;
    this.glowMat.color.setHex(hex).multiplyScalar(this.ward ? 2.6 : 1.1);
  }

  // ---------------------------------------------------------------- visuals
  _visuals(dt) {
    const m = this.bodyMat;
    if (this.flashT > 0) {
      this.flashT -= dt;
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = 0.8 * Math.max(0, this.flashT / 0.08);
    } else {
      const tint = statusTint(this);
      if (tint !== null) {
        m.emissive.setHex(tint);
        m.emissiveIntensity = 0.45;
      } else {
        m.emissive.setHex(this.idleHex);
        m.emissiveIntensity = this.idleI;
      }
    }
    this.mesh.position.copy(this.pos);
    this._animate(dt);
  }

  _animate(dt) {
    const t = this.time;
    switch (this.id) {
      case 'hollowWarden': {
        this.crownMat.color.setHex(this.phase === 2 ? 0xff6080 : 0xb580ff).multiplyScalar(2.0 + 0.5 * Math.sin(t * 3));
        break;
      }
      case 'vashkar': {
        const hot = this.hot ? 1.4 : 0;
        this.crackMat.color.setHex(this.charging ? 0xffb040 : 0xff7a2a).multiplyScalar(2.2 + 0.7 * Math.sin(t * 5) + hot);
        this.eyeMat.color.setHex(0xffc060).multiplyScalar(this.charging ? 4 : 2.6 + hot);
        break;
      }
      case 'riftHeart': {
        if (this.ward !== this.shownWard) this._applyWard();
        const y = 2.6 + Math.sin(t * 1.6) * 0.22;
        this.core.position.y = y;
        this.core.rotation.y += dt * 0.5;
        this.glowCore.position.y = y;
        this.glowCore.rotation.y -= dt * 0.9;
        this.ring1.position.y = y;
        this.ring1.rotation.z += dt * 1.2;
        this.ring2.position.y = y;
        this.ring2.rotation.z -= dt * 1.8;
        const n = this.sats.length;
        for (let i = 0; i < n; i++) {
          const a = t * 0.9 + (Math.PI * 2 * i) / n;
          this.sats[i].position.set(Math.cos(a) * 2.8, y + Math.sin(a * 2) * 0.4, Math.sin(a) * 2.8);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- lifecycle
  dispose(game) {
    if (this._disposed) return;
    this._disposed = true;
    this.dead = true;
    for (const h of this.handles) h.cancel();
    this.handles.clear();
    this.timers.length = 0;
    this.charging = false;
    if (this.trail) this.trail.emitting = false;
    if (this.mesh) {
      // Death squash; the materials are released when the squash ends.
      game.fx.corpse(this.mesh, 0.5, { onEnd: () => this._freeMats() });
    }
  }

  _freeMats() {
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
  }
}

// -------------------------------------------------------------------------------------
//  Mesh builders (<= 12 meshes per boss, shared geometry)
// -------------------------------------------------------------------------------------

function buildWarden(b) {
  const g = new THREE.Group();
  b.bodyMat = own(b, BASE.stone.clone());
  g.add(piece(GEOM.stone, b.bodyMat, [0, 1.7, 0], [1.5, 1.7, 1.35]));
  b.crownMat = own(b, glowMaterial(0xb580ff, 2.2, { additive: true }));
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5;
    g.add(piece(GEOM.shard, b.crownMat, [Math.cos(a) * 1.05, 3.2, Math.sin(a) * 1.05], [0.3, 0.85, 0.3], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]));
  }
  g.add(piece(GEOM.shard, b.crownMat, [0, 3.7, 0], [0.45, 1.25, 0.45]));
  b.idleHex = 0;
  b.idleI = 0;
  b.mesh = g;
}

function buildVashkar(b) {
  const g = new THREE.Group();
  b.bodyMat = own(b, BASE.molten.clone());
  g.add(piece(GEOM.molten, b.bodyMat, [0, 2.0, 0], [2.2, 1.9, 2.1]));
  b.crackMat = own(b, glowMaterial(0xff7a2a, 2.4, { additive: true }));
  b.eyeMat = own(b, glowMaterial(0xffc060, 2.6));
  g.add(piece(GEOM.eye, b.eyeMat, [-0.8, 2.6, 1.9], [0.34, 0.34, 0.34]));
  g.add(piece(GEOM.eye, b.eyeMat, [0.8, 2.6, 1.9], [0.34, 0.34, 0.34]));
  const cracks = [[0.4, 0.2], [-1.1, 0.5], [2.0, -0.3], [-2.4, -0.1], [0.9, -0.9]]; // [angle, elevation]
  for (const [a, e] of cracks) {
    const x = Math.cos(a) * Math.cos(e) * 2.2;
    const z = Math.sin(a) * Math.cos(e) * 2.1;
    const y = 2.0 + Math.sin(e) * 1.9;
    g.add(piece(GEOM.crack, b.crackMat, [x, y, z], [0.16, 0.06, 1.1], [0, Math.atan2(Math.cos(a), Math.sin(a)), 0]));
  }
  b.idleHex = 0xff5a2a;
  b.idleI = 0.2;
  b.mesh = g;
}

function buildHeart(b) {
  const g = new THREE.Group();
  b.bodyMat = own(b, BASE.crystal.clone());
  b.glowMat = own(b, glowMaterial(0xffffff, 2.4, { transparent: true, opacity: 0.9, depthWrite: false, additive: true, side: THREE.DoubleSide }));
  b.core = piece(GEOM.core, b.bodyMat, [0, 2.6, 0], [1.5, 1.5, 1.5]);
  b.glowCore = piece(GEOM.core, b.glowMat, [0, 2.6, 0], [0.8, 0.8, 0.8]);
  b.ring1 = piece(GEOM.ring, b.glowMat, [0, 2.6, 0], [2.8, 2.8, 2.8], [-Math.PI / 2, 0, 0]);
  b.ring2 = piece(GEOM.ring, b.glowMat, [0, 2.6, 0], [2.6, 2.6, 2.6], [1.1, 0, 0]);
  g.add(b.core, b.glowCore, b.ring1, b.ring2);
  b.sats = [];
  for (let i = 0; i < 3; i++) {
    const s = piece(GEOM.shard, b.glowMat, [0, 2.6, 0], [0.3, 0.3, 0.3]);
    b.sats.push(s);
    g.add(s);
  }
  b.wardIdx = 0;
  b.ward = WARDS[0];
  b._applyWard();
  b.mesh = g;
}

// -------------------------------------------------------------------------------------

export function createBoss(game, id, pos, opts = {}) {
  if (!DEFS[id]) throw new Error(`Unknown boss: ${id}`);
  return new Boss(game, id, pos, opts);
}
