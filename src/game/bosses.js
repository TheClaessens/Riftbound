import * as THREE from 'three';
import { GEO, glowMaterial, dirXZ, distXZ, ELEMENT_CSS } from '../core/utils.js';
import { makeStatus, updateStatuses, statusTint } from './combat.js';
import { createEnemy, EnemyBullet } from './enemies.js';
import { ACTS, BOSS_HP, enemyHpMult, enemyDmgMult } from './acts.js';
import { blendAddMaterial, HOSTILE_RED } from './fx.js';
import { BOSS_REGISTER, GORRAK_PODS, VASHKAR_AXE_DRAG, AURELITH_MOUTH, AURELITH_TAIL } from './creatures/bossModels.js';

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
  hollowWarden: { name: 'Gorrak, the Troll King', radius: 1.8, speed: 2.4, stopGap: 1.4, resist: null, deathColor: 0x6a5aaa, cycle: 3.2, cycle2: 2.2 },
  vashkar: { name: 'Vashkar, the Ashen Warchief', radius: 2.2, speed: 2.0, stopGap: 1.2, resist: { fire: 0.5 }, deathColor: 0xff6a1f, cycle: 3.0, cycle2: 2.2 },
  riftHeart: { name: 'Aurelith, the Prism Dragon', radius: 2.4, speed: 1.1, stopGap: 5, resist: null, deathColor: 0x9ff3ff, cycle: 3.2, cycle2: 2.4 },
};

// Creature-rig presentation per boss (src/game/creatures/bossModels.js). scale = model scale,
// glow = idle accent glow (phase 1 / phase 2). Every action passes its "tell" time to _play(): the
// accent glow ramps up to that moment (when the telegraph resolves), then decays.
const LOOK = {
  hollowWarden: { scale: 1.05, glow: [0.22, 0.5] },
  vashkar: { scale: 1.0, glow: [0.25, 0.55] },
  riftHeart: { scale: 1.1, glow: [0.35, 0.6] },
};
const HIT_FLASH_GAP = 0.2;  // bosses take constant fire: limit the rig squash/recoil rate
const BLEND = 0.2;          // s: cross-fade when an action interrupts or chains into another

// Shared geometry: never disposed, and never handed to fx transients (fx would dispose it).
const GEOM = {
  ring: new THREE.RingGeometry(0.92, 1, 96),
};
const _w = new THREE.Vector3();
const _v = new THREE.Vector3();
const _col = new THREE.Color();
const _m3 = [0, 0, 0];

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
    // Hostile red (never the player's fire orange), blend-add so it darkens bright ground, over grass.
    this.mat = blendAddMaterial(HOSTILE_RED, { hdr: 1.9, occ: 0.55, opacity: 0.95, side: THREE.DoubleSide, depthTest: false });
    this.mesh = new THREE.Mesh(GEOM.ring, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(this.center.x, 0.12, this.center.z);
    this.mesh.renderOrder = 8;
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
        game.fx.burst(p.pos, { color: HOSTILE_RED, count: 12, speed: 5, life: 0.4, size: 0.35, backing: true });
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
    this.mat = blendAddMaterial(0xff4a1a, { hdr: 1.5, occ: 0.6, opacity: 0.8, depthTest: false });
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
    m.renderOrder = 7;
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

    // presentation: creature rig + animation state (see _play / _visuals)
    this.game = game;
    this.yaw = Math.atan2(game.player.pos.x - this.pos.x, game.player.pos.z - this.pos.z);
    this.anim = null;          // { action, t, dur, tell, next }
    this.prevAnim = null;      // interrupted action, cross-faded out over BLEND seconds
    this.blendT = 0;
    this.flapT = -1;           // Aurelith hover (phase-2 shard rain) timer
    this.beamBase = 0;
    this.flashGap = 0;
    this.look = LOOK[id];
    if (id === 'riftHeart') { this.wardIdx = 0; this.ward = WARDS[0]; }

    this.mesh = new THREE.Group(); // anchor for extra attachments (positioned at the boss each frame)
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    if (id === 'riftHeart') {
      // soft ward-coloured glow pooled under the crystal heart
      this.wardGlowMat = own(this, glowMaterial(0xffffff, 1, { transparent: true, opacity: 0.22, depthWrite: false, additive: true }));
      const g = new THREE.Mesh(GEO.disc, this.wardGlowMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(0, 0.05, 1.6);
      g.scale.setScalar(2.6);
      this.wardGlow = g;
      this.mesh.add(g);
    }
    this.rig = game.creatures.add(BOSS_REGISTER[id], { pos: this.pos, yaw: this.yaw, scale: this.look.scale, turnRate: 7 });
    this.rig.rage = 0;
    this.rig.flapK = -1;
    this._applyWard();
  }

  flash() {
    this.flashT = 0.08;
    if (this.flashGap <= 0 && this.rig) {
      this.rig.flash();
      this.flashGap = HIT_FLASH_GAP;
    }
  }

  // ---------------------------------------------------------------- animation state
  // Start a body action on the rig. dur = action length (s) → k = t / dur. tell = time (s) at which
  // its telegraph resolves (the accent glow peaks there). next = [action, dur, tell] chained after.
  _play(action, dur, tell = 0, next = null, peak = 1.1) {
    const a = this.anim;
    if (a && a.t < a.dur) {
      this.prevAnim = { action: a.action, k: Math.min(1, a.t / a.dur), dur: a.dur };
      this.blendT = BLEND;
    } else this.prevAnim = null;
    this.anim = { action, t: 0, dur, tell, next, peak };
  }

  // Model-space point (metres, boss facing +Z) → world position, using the rig's current yaw.
  _world(p, out = new THREE.Vector3()) {
    const s = this.rig.scale, yaw = this.rig._yaw;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const x = p[0] * s, z = p[2] * s;
    return out.set(this.pos.x + x * c + z * sn, p[1] * s, this.pos.z - x * sn + z * c);
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
    this._visuals(dt, mv);
  }

  _enterPhase2(game) {
    this.phase = 2;
    this.cycleT = Math.min(this.cycleT, 0.6);
    this.rainT = 1.5;
    this.hot = true;
    game.events.emit('bossPhase', { enemy: this, phase: 2 });
    game.fx.shake(0.8, 'threat');
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
    this.yaw = Math.atan2(toP.x, toP.z);
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
      this._play('slam', 1.4, 1.0, null, 0.55); // grab, raise overhead, crash when the telegraph fills, hold
      const at = new THREE.Vector3(game.player.pos.x, 0, game.player.pos.z);
      this._circle(game, at, 5, 1.0, RED, () => {
        const p = game.player;
        if (distXZ(p.pos, at) < 5) p.takeDamage(this.damage * 1.6, this);
        game.fx.ring(at, { color: RED, radius: 5, life: 0.25, width: 0.2 });
        game.fx.burst(at, { color: RED, count: 20, speed: 6, life: 0.5, size: 0.4 });
        game.fx.shake(0.5, 'threat');
        this._clubImpact(game);
      });
    } else if (kind === 'volley') {
      this.busyT = 0.9;
      this._play('volley', 0.9, 0.6, null, 1.15); // hunch, pods swell and glow, pop
      this._circle(game, this.pos, 2.4, 0.6, ORANGE, () => this._radial(game));
    } else {
      this.busyT = 1.0;
      this._play('summon', 1.0, 0.7, null, 0.9); // horn to the mouth, head back, blow
      this._circle(game, this.pos, 3.0, 0.7, ORANGE, () => { this._hornBlast(game); this._summon(game, ['husk', 'husk', 'husk', 'husk', 'husk', 'husk'], 3.2); });
    }
  }

  // Radial volley: 12 shots, or 24 interleaved shots in phase 2.
  _radial(game) {
    const n = this.phase === 2 ? 24 : 12;
    for (let i = 0; i < n; i++) {
      const dir = dirFromAngle((Math.PI * 2 * i) / n);
      const start = this.pos.clone().addScaledVector(dir, this.radius + 0.5);
      game.addActor(new EnemyBullet(game, start, dir, this.damage * 0.6, { speed: 7.5, radius: 0.28, life: 4, color: BULLET_COLOR, size: 0.3 }));
      this._podSpark(game, start, i, n);
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
      this._play('meteor', 1.3, 1.1); // axe raised to the sky, roar, thrust down as they land
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
    this.yaw = Math.atan2(dir.x, dir.z);
    this._play('rushWind', telegraphTime, telegraphTime); // helm lowered, axe swept back, foot scrapes
    this._line(game, this.pos, dir, CHARGE_LEN, 3.0, telegraphTime, RED, () => this._beginCharge(game));
  }

  _beginCharge(game) {
    this.charging = true;
    this.chargeT = CHARGE_LEN / CHARGE_SPEED;
    this.chargeHit = false;
    this._play('rush', CHARGE_LEN / CHARGE_SPEED, 0);
    this.trail = new LavaTrail(game, this, this.damageScale);
    game.addActor(this.trail);
    game.fx.shake(0.4, 'threat');
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
    game.fx.shake(0.3, 'threat');
    game.fx.burst(this.pos, { color: ORANGE, count: 10, speed: 5, life: 0.4, size: 0.4 });
    this._play('skid', 0.45, 0);
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
        game.fx.shake(0.15, 'threat');
      });
    }
  }

  _flameRings(game, count) {
    const origin = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    for (let k = 0; k < count; k++) {
      // each ring: a two-handed overhead slam that buries the axe as the telegraph resolves
      const fire = () => {
        this._play('slam', 1.0, 0.5, null, 0.9);
        return this._circle(game, origin, 2.6, 0.5, ORANGE, () => {
          game.addActor(new FlameRing(game, origin, this.damage));
          this._axeImpact(game);
        });
      };
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
      this._play('roar', 1.0, 0.8); // rears up, wings spread, roars; shards break off the back
      this._circle(game, this.pos, 3.2, 0.8, ORANGE, () => {
        this._shardBurst(game);
        this._summon(game, ['shardling', 'shardling', 'shardling', 'shardling', 'wraith'], 3.4);
      });
    }
  }

  _twinBeams(game) {
    const p2 = this.phase === 2;
    const n = p2 ? 4 : 2;
    const sweep = p2 ? 2 : 3;
    const d = dirXZ(this.pos, game.player.pos, new THREE.Vector3());
    const base = Math.atan2(d.x, d.z);
    this.busyT = 1.0 + sweep + 0.3;
    this.yaw = base;
    this.beamBase = base;
    this.beamN = n;
    // rear back + charge the breath for the 1 s telegraph, then breathe: the body turns with beam 0
    this._play('breathe', 1.0, 1.0);
    const origin = new THREE.Vector3(this.pos.x, 0, this.pos.z);
    let done = 0;
    for (let i = 0; i < n; i++) {
      const dir = dirFromAngle(base + (Math.PI * 2 * i) / n);
      this._line(game, origin, dir, BEAM_LEN, BEAM_W, 1.0, RED, () => {
        done++;
        if (done === n) {
          game.addActor(new BeamSweep(game, this, base, n, sweep, this.damage * 0.8));
          this._play('beam', sweep, 0, ['beamEnd', 0.3, 0]);
        }
      });
    }
  }

  // Prism Volley: 5 fans of 5 shots, each fan aimed at the player at its firing time.
  _prismVolley(game) {
    this.busyT = 0.6 + 1.5 + 0.3;
    this._play('volley', 2.4, 0.6); // wings snap open, then one head jab per fan
    this._circle(game, this.pos, 2.8, 0.6, ORANGE, () => {
      for (let k = 0; k < 5; k++) this._after(k * 0.3, () => this._fan(game));
    });
  }

  _fan(game) {
    const aim = Math.atan2(game.player.pos.x - this.pos.x, game.player.pos.z - this.pos.z);
    this.yaw = aim;
    // fans leave the mouth (projected to the ground plane, at least the old ring distance out)
    const fwd = Math.max(this.radius + 0.5, AURELITH_MOUTH[2] * this.look.scale);
    const mouth = new THREE.Vector3(this.pos.x + Math.sin(aim) * fwd, 0, this.pos.z + Math.cos(aim) * fwd);
    for (let j = -2; j <= 2; j++) {
      const dir = dirFromAngle(aim + j * 0.16);
      game.addActor(new EnemyBullet(game, mouth, dir, this.damage * 0.6, { speed: 8, radius: 0.28, life: 4, color: BULLET_COLOR, size: 0.3, y: 1.3 }));
    }
    const m = this._world(AURELITH_MOUTH, _w);
    game.fx.burst(m, { color: BULLET_COLOR, count: 8, speed: 4, life: 0.25, size: 0.35, up: -0.3, hdr: 2.6 });
  }

  // Phase 2: 8 random circles within 12 u of the player, every 4 s.
  _shardRain(game) {
    this.flapT = 0; // lifts into a low hover with heavy wing beats while the shards fall
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

  // Ward → the rig's accent channel (heart, spine / horn / wing crystals, eyes) + a ward-tinted rim
  // and ground glow. A cleared ward (reaction) snaps the crystals back to prism white.
  _applyWard() {
    this.shownWard = this.ward;
    if (!this.rig || this.id !== 'riftHeart') return;
    if (this.ward) {
      const c = _col.setHex(WARD_HEX[this.ward]); // linear
      this.rig.accent = [c.r, c.g, c.b, 0.85];
      this.rig.rim = [c.r, c.g, c.b, 0.55];
      this.wardGlowMat.color.copy(c).multiplyScalar(1.3);
    } else {
      this.rig.accent = null;
      this.rig.rim = null;
      this.wardGlowMat.color.setHex(0xdfe6ff).multiplyScalar(0.45);
    }
  }

  // ---------------------------------------------------------------- visuals
  _visuals(dt, mv) {
    const h = this.rig;
    const adt = mv > 0 ? dt : 0; // frozen / stunned: the body holds its pose (timers pause too)
    if (this.flashT > 0) this.flashT -= dt;
    if (this.flashGap > 0) this.flashGap -= dt;

    // action clock (+ chained follow-up actions)
    let a = this.anim;
    if (a) {
      a.t += adt;
      if (a.t >= a.dur) {
        const next = a.next;
        this.anim = null;
        if (next) this._play(next[0], next[1], next[2]);
        a = this.anim;
      }
    }
    if (this.blendT > 0) {
      this.blendT -= adt;
      if (this.blendT <= 0) this.prevAnim = null;
    }

    // facing overrides while busy: the dragon turns with its breath sweep and tracks the player
    // through the prism volley
    if (a && this.id === 'riftHeart') {
      if (a.action === 'beam') this.yaw = this.beamBase + Math.PI * Math.min(1, a.t / a.dur);
      else if (a.action === 'volley') {
        const p = this.game.player.pos;
        this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      }
    }
    h.turnRate = a && a.action === 'beam' ? 30 : 7;
    h.yaw = this.yaw;

    // rig channels
    const p = this.prevAnim;
    h.action = a ? a.action : null;
    h.k = a ? Math.min(1, a.t / a.dur) : 0;
    h.dur = a ? a.dur : 0;
    h.prevAction = p ? p.action : null;
    h.prevK = p ? p.k : 0;
    h.prevDur = p ? p.dur : 0;
    h.blend = p ? Math.max(0, this.blendT / BLEND) : 0;
    h.rage = this.phase === 2 ? 1 : 0;
    h.frozen = this.status.frozen > 0;
    h.tint = statusTint(this);
    if (this.flapT >= 0) {
      this.flapT += adt;
      if (this.flapT >= 1.25 && !this.landed) { this.landed = true; this._landDust(); }
      if (this.flapT >= 1.4) this.flapT = -1;
    } else this.landed = false;
    h.flapK = this.flapT >= 0 ? this.flapT / 1.4 : -1;

    // accent glow: idle level, ramps up to each telegraph's resolve moment, peaks while charging
    let glow = this.look.glow[this.phase === 2 ? 1 : 0];
    if (a) glow = Math.max(glow, this._tellGlow(a));
    if (this.id === 'riftHeart') glow += 0.15 * Math.sin(this.time * Math.PI * 1.6); // heart beat, 0.8 Hz
    h.glow = glow;

    if (this.id === 'riftHeart' && this.ward !== this.shownWard) this._applyWard();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = h._yaw;
    if (this.wardGlow) this.wardGlowMat.opacity = 0.16 + 0.1 * Math.min(1.2, glow);

    // continuous fx: fire trail from the dragged axe, breath sparks at the beam emitters
    if (this.charging && adt > 0) this._fireTrail();
    if (a && a.action === 'beam' && adt > 0) this._breathFx();
  }

  _tellGlow(a) {
    if (a.action === 'rush' || a.action === 'beam') return 1.15;
    if (a.action === 'beamEnd') return 1.15 * (1 - a.t / a.dur);
    if (this.id === 'riftHeart' && a.action === 'volley' && a.t > 0.6) {
      // a flare on each fan
      const ph = ((a.t - 0.6) % 0.3) / 0.3;
      return a.t < 1.85 ? 0.75 + 0.45 * (1 - ph) : Math.max(0, 0.75 - (a.t - 1.85) * 2);
    }
    const tl = a.tell;
    if (!tl) return 0;
    const pk = a.peak / 1.1;
    if (a.t < tl) return pk * (0.15 + 0.95 * Math.pow(a.t / tl, 1.5));
    return pk * Math.max(0, 1.1 - (a.t - tl) / 0.35);
  }

  // ---------------------------------------------------------------- body-anchored fx
  // Gorrak's root-ball crashing down in front of him.
  _clubImpact(game) {
    const p = this._world([-0.9, 0, 4.3], _w);
    game.fx.ring(p, { color: 0xc8a878, radius: 3.2, life: 0.45, width: 0.3, hdr: 0.9 });
    game.fx.burst(p, { color: 0x8a6a4a, count: 16, speed: 5, life: 0.6, size: 0.45, up: 1.2, gravity: 8, hdr: 0.9 });
  }

  // Spore pods (back) → each radial shot: a lime streak from the nearest pod, and a pop per pod.
  _podSpark(game, start, i, n) {
    const k = Math.floor((i * GORRAK_PODS.length) / n);
    const pod = this._podWorld(k, _w);
    if (i % (n / GORRAK_PODS.length) === 0) {
      game.fx.burst(pod, { color: 0xb8ff3c, count: 6, speed: 3, life: 0.35, size: 0.4, up: 1.4, hdr: 2.4 });
    }
    _v.set((start.x - pod.x) / 0.22, (0.8 - pod.y) / 0.22, (start.z - pod.z) / 0.22);
    game.fx.spark(pod, _v, { color: 0xd0ff6a, size: 0.4, life: 0.22, drag: 0, hdr: 2.6 });
  }

  // Pod position at the moment of release: the back is pitched forward by the volley hunch.
  _podWorld(i, out) {
    const c = GORRAK_PODS[i].cap, th = 0.45, py = 1.95, pz = -0.1;
    const y = c[1] - py, z = c[2] - pz;
    _m3[0] = c[0]; _m3[1] = py - 0.05 + y * Math.cos(th) - z * Math.sin(th); _m3[2] = pz + y * Math.sin(th) + z * Math.cos(th);
    return this._world(_m3, out);
  }

  // War horn: three expanding sound rings from the horn bell.
  _hornBlast(game) {
    const p = this._world([0.7, 4.4, 1.3], _w);
    game.fx.burst(p, { color: 0xb8ff3c, count: 10, speed: 4, life: 0.4, size: 0.35, up: 1, hdr: 2.4 });
    const at = this.pos.clone();
    for (let i = 0; i < 3; i++) {
      const fire = () => game.fx.ring(at, { color: 0xb8ff3c, radius: 7 + i * 1.5, life: 0.6, width: 0.06, hdr: 1.6 });
      if (i === 0) fire(); else this._after(i * 0.14, fire);
    }
  }

  // Vashkar's buried axe head: cracked-earth flash where the flame ring is born.
  _axeImpact(game) {
    const p = this._world([-1.0, 0, 4.0], _w);
    game.fx.flashDisc(p, { color: ORANGE, radius: 1.6, life: 0.25, hdr: 1.8 });
    game.fx.burst(p, { color: 0xffb040, count: 14, speed: 6, life: 0.45, size: 0.4, up: 1.4, gravity: 6 });
    game.fx.shake(0.25, 'threat');
  }

  // Sparks off the axe blade dragging behind him during the bull-rush.
  _fireTrail() {
    const fx = this.game.fx;
    const p = this._world(VASHKAR_AXE_DRAG, _w);
    for (let i = 0; i < 2; i++) {
      _v.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
      fx.spark(p, _v, { color: i ? 0xffb040 : 0xff6a1f, size: 0.35, life: 0.35, gravity: 6, hdr: 2.4 });
    }
  }

  // Breath sparks: the mouth (beam 0), the tail club (opposite beam) and, with 4 beams, the wings.
  _breathFx() {
    const fx = this.game.fx;
    const col = this.ward ? WARD_HEX[this.ward] : 0xe6f4ff;
    const emit = (pt) => {
      const p = this._world(pt, _w);
      _v.set((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2);
      fx.spark(p, _v, { color: col, size: 0.4, life: 0.25, hdr: 2.4 });
    };
    emit(AURELITH_MOUTH);
    if (this.beamN >= 2) emit(AURELITH_TAIL);
    if (this.beamN >= 4) { emit([4.2, 3.0, 0.2]); emit([-4.2, 3.0, 0.2]); }
  }

  // Summon roar: crystal shards burst off the spine.
  _shardBurst(game) {
    const col = this.ward ? WARD_HEX[this.ward] : 0xe6f4ff;
    for (const pt of [[0, 4.0, 0.9], [0, 3.8, -0.3], [0, 3.4, -1.4]]) {
      game.fx.burst(this._world(pt, _w), { color: col, count: 7, speed: 5, life: 0.6, size: 0.35, up: 1.6, gravity: 5, hdr: 2.2 });
    }
  }

  _landDust() {
    this.game.fx.ring(this.pos, { color: 0xd8d0b8, radius: 5, life: 0.5, width: 0.25, hdr: 0.8 });
    this.game.fx.shake(0.2, 'threat');
  }

  // ---------------------------------------------------------------- lifecycle
  // Killed: start the death topple right away (dispose may come a frame later, or not at all
  // before the victory screen).
  onDeath(game) {
    if (!this.rig) return;
    this.rig.frozen = false;
    game.creatures.remove(this.rig, { corpse: true });
  }

  dispose(game) {
    if (this._disposed) return;
    this._disposed = true;
    this.dead = true;
    for (const h of this.handles) h.cancel();
    this.handles.clear();
    this.timers.length = 0;
    this.charging = false;
    if (this.trail) this.trail.emitting = false;
    if (this.rig) {
      // death topple (spec.deathTime 1.6 s) with the boss's own flourish; game resets clear it at once
      this.rig.frozen = false;
      this.rig.action = 'die';
      game.creatures.remove(this.rig, { corpse: true });
    }
    if (this.mesh) game.scene.remove(this.mesh);
    this._freeMats();
  }

  _freeMats() {
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
  }
}

// -------------------------------------------------------------------------------------

export function createBoss(game, id, pos, opts = {}) {
  if (!DEFS[id]) throw new Error(`Unknown boss: ${id}`);
  return new Boss(game, id, pos, opts);
}
