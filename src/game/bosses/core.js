import * as THREE from 'three';
import { GEO, dirXZ, distXZ } from '../../core/utils.js';
import { makeStatus, updateStatuses, statusTint, statusLook, damageEnemy } from '../combat.js';
import { createEnemy } from '../enemies.js';
import { ACTS, enemyHpMult, enemyDmgMult } from '../acts.js';
import { blendAddMaterial, BLEND_ADD, HOSTILE_RED, SAFE_GOLD } from '../fx.js';
import { AFFIXES } from './affixes.js';

// =====================================================================================
//  BossBase — the raid-encounter boss framework (v5). Contract: design/RAID.md.
//
//  A boss script subclasses BossBase and provides:
//    this.moves = { name: () => busySeconds, ... }     each move starts telegraphs/actions, returns how long
//                                                     the boss is busy (no new move, no walking)
//    rotation(phase) → ['slam', 'backhand', ...]       the learnable loop of moves for a phase (1..3)
//    intermission(index) → seconds                     scripted gate transition (index 1 | 2); boss is
//                                                     untargetable for its length, then Winded
//    optional: think(dt, mv), move(dt, mv), visuals(dt, anim), onPhase(phase), onDowned(), onRecovered(),
//              onClearField(), onDispose()
//  Everything else (rig + action clock, telegraph shapes with hit resolution, poise/Downed/Break Checks,
//  phases + gates + intermissions, adds, objects, zones, ring waves, enrage, affixes, echo) lives here.
//
//  v5.2 additions (design/playtest/round-3/PLAN-v5.2.md):
//    cfg.fodder = { types: [typeId], count: [p1, p2, p3], every: s }   phase-scripted fodder waves (BossBase
//        schedules them; spawnWave({ types, count, ring, orbChance, xp }) spawns one). Fodder live in this.fodder
//        (NOT this.adds), carry e.isFodder / e.orbChance / e.autoPriority = 1, and pay their XP out on clearField.
//    cfg.minPhase = [s1, s2]   a gate holds (hp pinned at hpFloor) until the phase ran that many fight-seconds
//    markObjective(e, { color, tether, label }) / unmarkObjective(e); this.objectives (Set of enemies, each with
//        e.objective = { color, label }) is what the HUD reads for edge pointers.
//    ringWave(c, { gap: { angle, width } })  a gold striped walk-through notch in the wave.
//  Events: bossGateHeal { enemy, amount, pct } (12% max HP at every intermission end; dash refilled at its start),
//          bossFodder { enemy, wave, count } (a wave was telegraphed), bossBreakOrb { enemy, pos } (30% on a broken check).
// =====================================================================================

const BLEND = 0.2;            // s: cross-fade when an action interrupts or chains into another
const HIT_FLASH_GAP = 0.2;    // bosses take constant fire: limit the rig squash/recoil rate
const POISE_MAX = 100;
const POISE_DECAY = 3;        // per second, starting POISE_DECAY_DELAY after the last gain
const POISE_DECAY_DELAY = 3;
const RECOVER_TIME = 8;       // poise locked after a Downed
const DOWNED_TAKEN = 1.4;
const EXPOSED_TAKEN = 1.2;
const TEACH = 1.4;            // first use of a mechanic: lead × TEACH
const POISE_MULT_CAP = 1.5;   // v5.2: the Break Check bar grows at most this much per phase (HUD shows a % of the bar)
const BREAK_ORB_CHANCE = 0.3; // a broken Break Check drops a health orb this often
const GATE_HEAL = 0.12;       // max-HP fraction restored when an intermission ends
const FODDER_LAND_HOLD = 2.5; // no fodder during the landing hold (matches encounter.holdModals)
const FODDER_TELL = 0.7;      // s of ground dust before a fodder body rises
const MARK_COLOR = 0xff9a3c;  // objective mark orange (never SAFE_GOLD / HOSTILE_RED)

export const POISE = {
  shatter: 14, steam: 10, overload: 10, combust: 10, superconduct: 8, arcflash: 8,
  frozen: 6, stunned: 4, perfect: 20, crystal: 20, generator: 15, chainPer: 0.5, chainMax: 5,
};
// Reaction fatigue (playtest round 2: reaction spam kept bosses Downed most of the fight with no dodging
// involved). Each reaction poise gain is × 1 / (1 + fatigue / FATIGUE_K); fatigue +1 per reaction, decays
// with FATIGUE_TAU. ~1 reaction/s → ×0.57; 3/s → ×0.33. Skill sources (perfect dodge, crystal, generator) are exempt.
// v5.2 (round 3, "lean toward skill"): perfect dodge / Rift Crystal 10 → 20, FATIGUE_K 4 → 3 so spam fades sooner.
const FATIGUE_K = 3;
const STATUS_POISE = 1.5;          // per 0.5 s while the boss carries a player status (≈ 3/s)
const FATIGUE_TAU = 4;
const REACTION_SRC = new Set(['shatter', 'steam', 'overload', 'combust', 'superconduct', 'arcflash']);

const _v = new THREE.Vector3();

// Distance from point (px,pz) to segment (a -> b) in XZ.
export function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + abx * t - px, cz = az + abz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

// Direction from an angle measured like group.rotation.y (0 = +Z).
export function dirFromAngle(a, out = new THREE.Vector3()) {
  return out.set(Math.sin(a), 0, Math.cos(a));
}

// Is point p inside a cone (apex o, unit dir d, total angle, radius)?
export function inCone(p, o, d, angle, radius, pad = 0) {
  const dx = p.x - o.x, dz = p.z - o.z;
  const r = Math.hypot(dx, dz);
  if (r > radius + pad) return false;
  if (r < 0.5 + pad) return true;
  const cos = (dx * d.x + dz * d.z) / r;
  return Math.acos(Math.max(-1, Math.min(1, cos))) <= angle / 2 + pad / Math.max(1, r);
}

// =====================================================================================
//  Hostile actors (generic)
// =====================================================================================

// Ring-wave material with a safe notch: red band everywhere except the gap arc, which shows as a wider gold
// diagonal-striped lane with bright rails (the same stripe language as the safe-zone decals in fx.js).
function ringGapMaterial(color, gap) {
  const u = {
    uColor: { value: new THREE.Color(color).multiplyScalar(1.9) },
    uGold: { value: new THREE.Color(SAFE_GOLD).multiplyScalar(1.5) },
    uOpacity: { value: 0.95 },
    uGap: { value: new THREE.Vector2(gap.a, gap.w) },
    uR: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform vec3 uGold; uniform float uOpacity; uniform vec2 uGap; uniform float uR;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float rr = length(p);
        float a = atan(p.x, -p.y);
        float d = abs(mod(a - uGap.x + 3.14159265, 6.2831853) - 3.14159265);
        float half_ = uGap.y * 0.5;
        if (d <= half_) {
          float st = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 16.0));
          float rail = 1.0 - step(0.16, (half_ - d) * uR);
          vec3 c = uGold * mix(0.45 + 0.75 * st, 1.4, rail);
          gl_FragColor = vec4(c * uOpacity, 0.7 * uOpacity);
        } else {
          if (rr < 0.92) discard;
          gl_FragColor = vec4(uColor * uOpacity, 0.55 * uOpacity);
        }
      }`,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, ...BLEND_ADD,
  });
  Object.defineProperty(m, 'opacity', { get: () => u.uOpacity.value, set: (v) => { u.uOpacity.value = v; }, configurable: true });
  return m;
}

// Expanding ring wave: hurts the player once when its band crosses them (dash through it).
// opts: { speed=9, width=0.8, from=2.6, maxR=18, dmg, how, gaps: [{a, w}] (radians; safe arcs, not drawn),
//   gap: { angle, width, spin? } (v5.2: ONE safe walk-through arc, drawn as a gold striped notch; spin rad/s),
//   color }
export class RingWave {
  constructor(boss, center, opts) {
    const game = boss.game;
    this.hostile = true;
    this.boss = boss;
    this.center = new THREE.Vector3(center.x, 0, center.z);
    this.r = opts.from ?? 2.6;
    this.speed = opts.speed ?? 9;
    this.width = opts.width ?? 0.8;
    this.maxR = opts.maxR ?? 18;
    this.damage = opts.dmg ?? boss.damage;
    this.how = opts.how ?? 'ring';
    this.gaps = opts.gaps ?? null;
    this.hit = false;
    this.gap = null;
    if (opts.gap) {
      this.gap = { a: opts.gap.angle, w: opts.gap.width, spin: opts.gap.spin ?? 0 };
      this.gaps = [...(this.gaps ?? []), this.gap];
    }
    if (this.gap) {
      this.mat = ringGapMaterial(opts.color ?? HOSTILE_RED, this.gap);
      this.mesh = new THREE.Mesh(boss.ringGapGeo ??= new THREE.RingGeometry(0.86, 1, 96), this.mat);
    } else {
      this.mat = blendAddMaterial(opts.color ?? HOSTILE_RED, { hdr: 1.9, occ: 0.55, opacity: 0.95, side: THREE.DoubleSide, depthTest: false });
      this.mesh = new THREE.Mesh(boss.ringGeo, this.mat);
    }
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(this.center.x, 0.12, this.center.z);
    this.mesh.renderOrder = 8;
    this.mesh.scale.setScalar(this.r);
    game.scene.add(this.mesh);
  }

  update(dt, game) {
    this.r += this.speed * dt;
    this.mesh.scale.setScalar(this.r);
    this.mat.opacity = 0.95 - 0.5 * Math.min(1, this.r / this.maxR);
    if (this.gap) {
      this.gap.a += this.gap.spin * dt;
      this.mat.uniforms.uGap.value.set(this.gap.a, this.gap.w);
      this.mat.uniforms.uR.value = this.r;
    }
    if (!this.hit) {
      const p = game.player;
      if (Math.abs(distXZ(p.pos, this.center) - this.r) <= this.width * 0.5 + p.radius && !this._inGap(p.pos)) {
        this.hit = true;
        p.takeDamage(this.damage, this.boss, this.how);
        game.fx.burst(p.pos, { color: HOSTILE_RED, count: 12, speed: 5, life: 0.4, size: 0.35, backing: true });
      }
    }
    return this.r < this.maxR;
  }

  _inGap(p) {
    if (!this.gaps) return false;
    const a = Math.atan2(p.x - this.center.x, p.z - this.center.z);
    for (const g of this.gaps) {
      let d = Math.abs(a - g.a) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d <= g.w / 2) return true;
    }
    return false;
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    this.mat.dispose();
  }
}

// Persistent ground zone actor (fx.zone decal + an inside test). kind 'hostile' | 'safe'.
// opts: { life, radius, inner?, angle?, dir?, onInside(dt, zone), onEnter(zone), onExit(zone), onExpire(zone), tag }
export class Zone {
  constructor(boss, pos, kind, opts) {
    const game = boss.game;
    this.boss = boss;
    this.hostile = kind === 'hostile';   // safe zones survive a Rift Shift clear only by being non-hostile
    this.kind = kind;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = opts.radius;
    this.inner = opts.inner;
    this.angle = opts.angle;
    this.dir = opts.dir ? opts.dir.clone() : null;
    this.life = opts.life ?? 8;
    this.t = 0;
    this.tag = opts.tag ?? null;
    this.opts = opts;
    this.inside = false;
    this.dead = false;
    this.decal = game.fx.zone(this.pos, { radius: this.radius, inner: this.inner, angle: this.angle, dir: this.dir }, kind);
  }

  contains(p, pad = 0) {
    const d = distXZ(p, this.pos);
    if (d > this.radius + pad) return false;
    if (this.inner !== undefined && d < this.inner - pad) return false;
    if (this.angle !== undefined) return inCone(p, this.pos, this.dir, this.angle, this.radius, pad);
    return true;
  }

  setRadius(r) { this.radius = r; this.decal.setRadius(r); }

  update(dt, game) {
    if (this.dead) return false;
    this.t += dt;
    const fade = Math.min(1, (this.life - this.t) / 0.5, this.t / 0.25);
    this.decal.setOpacity(Math.max(0, fade));
    const inside = !game.player.dead && this.contains(game.player.pos, game.player.radius * 0.5);
    if (inside && !this.inside) this.opts.onEnter?.(this);
    if (!inside && this.inside) this.opts.onExit?.(this);
    this.inside = inside;
    if (inside) this.opts.onInside?.(dt, this);
    if (this.t >= this.life) {
      this.opts.onExpire?.(this);
      return false;
    }
    return true;
  }

  end() { this.dead = true; }

  dispose(game) {
    if (this.inside) this.opts.onExit?.(this);
    this.inside = false;
    this.decal.dispose();
  }
}

// =====================================================================================
//  BossBase
// =====================================================================================
export class BossBase {
  // cfg: { id, name, model (creature def), hp, radius, speed, stopGap, resist, deathColor,
  //        look: { scale, glow: [p1, p2, p3] }, cycle: [p1, p2, p3] (s gap between moves),
  //        gates: [0.66, 0.33], downed: [4, 5, 6], enrageAt (s), turnRate }
  // opts (from the encounter): { hpMult, damageScale, final, echo, affixes: [ids], arena }
  constructor(game, cfg, pos, opts = {}) {
    this.game = game;
    this.cfg = cfg;
    this.id = cfg.id;
    this.type = cfg.id;
    this.name = opts.echo ? `Echo of ${cfg.name.split(',')[0]}` : cfg.name;
    this.boss = true;
    this.final = !!opts.final;
    this.isEcho = !!opts.echo;
    this.elite = false;
    this.inert = false;

    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = cfg.radius;
    this.maxHp = cfg.hp * (opts.hpMult ?? 1) * (opts.echo ? 0.55 : 1);
    this.hp = this.maxHp;
    this.xp = 0;                       // levels come from the Reap, never from the boss fight
    this.damageScale = opts.damageScale ?? 1;
    this.damage = 25 * this.damageScale;
    this.speed = cfg.speed;
    this.stopGap = cfg.stopGap ?? 1.4;
    this.status = makeStatus();
    this.knock = new THREE.Vector3();
    this.kbResist = 1;
    this.dead = false;
    this.resist = cfg.resist ?? null;
    this.ward = null;
    this.barrier = 0;
    this.deathColor = cfg.deathColor ?? 0x9a7cff;
    this.mesh = new THREE.Group();     // anchor for attachments (follows the boss)
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);

    // ---- encounter state (read by HUD / audio: design/RAID.md "Boss fields") ----
    this.phases = 3;
    this.gates = cfg.gates ?? [0.66, 0.33];
    this.phase = opts.echo ? 2 : 1;
    this.gateIdx = opts.echo ? 1 : 0;   // the echo only has the last gate, scaled to its own bar
    if (opts.echo) this.gates = [1, 0.5];
    this.hpFloor = this.maxHp * this.gates[this.gateIdx];
    this.intermissionIdx = 0;          // 0 = none; 1 | 2 while an intermission runs
    this.untargetable = false;
    this.downed = false;
    this.downedT = 0;
    this.downedDur = 0;
    this.exposedT = 0;
    this.armor = 0;                    // 0..0.9 damage reduction (generators); scripts set it
    this.takenMult = 1;
    this.poise = { v: 0, max: POISE_MAX, mult: 1, lockT: 0, lastGain: -99, threshold: 0, fatigue: 0 };
    this.cast = null;                  // { name, t, dur, threshold (0 = plain cast), check: bool }
    this.enrage = 0;                   // 0 = calm; n = enrage steps reached
    this.fightT = 0;                   // seconds of active fight (excludes intermissions + Downed)
    this.affixes = (opts.affixes ?? []).map((id) => AFFIXES[id]).filter(Boolean);
    this.musicState = this.phase === 1 ? 'p1' : 'p2';

    // ---- internals ----
    this.time = 0;
    this.busyT = 0;
    this.gapT = 2.0;
    this.contactCd = 0;
    this.timers = [];
    this.handles = new Set();
    this.actors = new Set();           // ring waves, zones, etc. owned by this fight
    this.adds = new Set();
    this.fodder = new Set();           // v5.2 fodder waves (kept out of this.adds so move gates like ready('horn') ignore them)
    this.objectives = new Set();       // v5.2 marked adds / objects (HUD edge pointers read this)
    this._marks = new Map();           // e -> { ring, tether, mat }
    this._markMats = new Map();        // colour -> shared material set
    this._fodderT = 0;                 // fight-seconds to the next wave (≤ 0 = due)
    this._fodderWave = 0;
    this._fodderPending = 0;
    this._fodderGen = 0;               // bumped on clearField: pending rises from an old wave are dropped
    this.phaseT = 0;                  // fight-seconds in the current phase (excludes intermissions + Downed)
    this._gateHeld = false;            // a gate is waiting for cfg.minPhase
    this.objects = new Set();
    this.blockers = [];                // pillars: { x, z, r } that block beams (also world obstacles)
    this.mats = [];
    this.seen = new Set();             // mechanics already shown once (teaching rule)
    this.rotIdx = 0;
    this.queued = [];
    this.moves = this.moves ?? {};
    this.flashT = 0;
    this.flashGap = 0;
    this.anim = null;
    this.prevAnim = null;
    this.blendT = 0;
    this._stunWas = false;
    this._frozenWas = false;
    this._disposed = false;
    this.ringGeo = new THREE.RingGeometry(0.92, 1, 96);

    this.yaw = Math.atan2(game.player.pos.x - this.pos.x, game.player.pos.z - this.pos.z);
    this.look = cfg.look;
    this.rig = game.creatures.add(cfg.model, { pos: this.pos, yaw: this.yaw, scale: cfg.look.scale, turnRate: cfg.turnRate ?? 7 });
    this.rig.rage = 0;
    if (this.isEcho) {
      this.rig.rim = [0.62, 0.42, 1.0, 0.85];   // spectral violet rim
      this.rig.tint = [0.75, 0.7, 1.0];
    }

    // ---- poise sources ----
    const ev = game.events;
    this._offs = [
      ev.on('reaction', ({ type, enemy }) => {
        if (enemy !== this) return;
        let n = POISE[type] ?? 0;
        if (this.resist?.fire && (type === 'combust' || type === 'steam')) n *= 0.5;
        n += Math.min(POISE.chainMax, POISE.chainPer * game.chain);
        this.addPoise(n, type);
      }),
      ev.on('enemyFrozen', ({ enemy }) => { if (enemy === this) this.addPoise(POISE.frozen, 'frozen'); }),
      ev.on('perfectDodge', ({ source }) => {
        if (source === this || source?.boss === this || this.actors.has(source)) this.addPoise(POISE.perfect, 'perfect');
      }),
      ev.on('geodeBroken', ({ pos }) => {
        if (pos && distXZ(pos, this.pos) <= 4.5 + this.radius) this.addPoise(POISE.crystal, 'crystal');
      }),
    ];
  }

  // ================================================================ public helpers for scripts
  get arena() { return this.game.encounter?.arena ?? { center: new THREE.Vector3(), r: 20 }; }

  // Point in the arena: angle (rad, like rotation.y) and fraction of the radius.
  arenaPoint(angle, frac, out = new THREE.Vector3()) {
    const a = this.arena;
    return out.set(a.center.x + Math.sin(angle) * a.r * frac, 0, a.center.z + Math.cos(angle) * a.r * frac);
  }

  // Damage of a hit = base boss damage × mult × enrage/affix scaling.
  dmg(mult = 1) {
    return this.damage * mult * Math.pow(1.05, this.enrage) * (this._affixDmg ?? 1);
  }

  // Teaching rule: the first time `id` is used this fight, its lead time is × 1.4.
  lead(id, base) {
    if (this.seen.has(id)) return base;
    this.seen.add(id);
    return base * TEACH;
  }

  firstUse(id) { return !this.seen.has(id); }

  // Start a body action on the rig. dur = action length (s) → k = t / dur; tell = when its telegraph
  // resolves (accent glow peaks there); next = [action, dur, tell] chained after.
  play(action, dur, tell = 0, next = null, peak = 1.1) {
    const a = this.anim;
    if (a && a.t < a.dur) {
      this.prevAnim = { action: a.action, k: Math.min(1, a.t / a.dur), dur: a.dur };
      this.blendT = BLEND;
    } else this.prevAnim = null;
    this.anim = { action, t: 0, dur, tell, next, peak };
  }

  // Model-space point (metres, boss facing +Z) → world position, using the rig's current yaw.
  world(p, out = new THREE.Vector3()) {
    const s = this.rig.scale, yaw = this.rig._yaw ?? this.yaw;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const x = p[0] * s, z = p[2] * s;
    return out.set(this.pos.x + x * c + z * sn, p[1] * s, this.pos.z - x * sn + z * c);
  }

  face(target) {
    this.yaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    return this.yaw;
  }

  // keep: survive Downed / intermission cancels (use for clean-up timers only)
  after(sec, fn, keep = false) { this.timers.push({ t: sec, fn, keep }); }

  // seq([[t, fn], ...]): run fns at absolute offsets from now.
  seq(steps) { for (const [t, fn] of steps) this.after(t, fn); }

  queue(name) { this.queued.push(name); }

  // ---- shapes. Each resolves after `lead` s; the player is hit if inside at that moment.
  // o: { dmg (mult, default 1), how, onResolve(hit), safe (gold, no damage), keepColor, color }
  circle(at, r, lead, o = {}) {
    const c = new THREE.Vector3(at.x, 0, at.z);
    return this._tele({ kind: 'circle', c, r, safe: !!o.safe }, lead, this.game.fx.telegraph(c, r, lead, this._teleOpts(o, () => {
      const hit = !o.safe && distXZ(this.game.player.pos, c) < r + this.game.player.radius * 0.3;
      this._resolve(hit, o, c);
    })));
  }

  cone(origin, dir, angle, r, lead, o = {}) {
    const c = new THREE.Vector3(origin.x, 0, origin.z), d = dir.clone().setY(0).normalize();
    return this._tele({ kind: 'cone', c, d, angle, r, safe: !!o.safe }, lead, this.game.fx.coneTelegraph(c, d, angle, r, lead, this._teleOpts(o, () => {
      const hit = !o.safe && inCone(this.game.player.pos, c, d, angle, r, this.game.player.radius * 0.3);
      this._resolve(hit, o, c);
    })));
  }

  donut(at, inner, outer, lead, o = {}) {
    const c = new THREE.Vector3(at.x, 0, at.z);
    return this._tele({ kind: 'donut', c, inner, r: outer, safe: !!o.safe }, lead, this.game.fx.donutTelegraph(c, inner, outer, lead, this._teleOpts(o, () => {
      const d = distXZ(this.game.player.pos, c);
      const hit = !o.safe && d < outer + this.game.player.radius * 0.3 && d > inner - this.game.player.radius * 0.3;
      this._resolve(hit, o, c);
    })));
  }

  line(from, dir, len, width, lead, o = {}) {
    const a = new THREE.Vector3(from.x, 0, from.z), d = dir.clone().setY(0).normalize();
    return this._tele({ kind: 'line', c: a, d, len, width, safe: !!o.safe }, lead, this.game.fx.lineTelegraph(a, d, len, width, lead, this._teleOpts(o, () => {
      const p = this.game.player.pos;
      const hit = !o.safe && segDist(p.x, p.z, a.x, a.z, a.x + d.x * len, a.z + d.z * len) < width / 2 + this.game.player.radius * 0.3;
      this._resolve(hit, o, a);
    })));
  }

  // Expanding ring wave from `center` (see RingWave opts).
  ringWave(center, opts = {}) {
    const w = new RingWave(this, center, { ...opts, dmg: this.dmg(opts.dmg ?? 1) });
    return this.own(w);
  }

  // Ground zone actor. kind 'hostile' | 'safe'. See Zone.
  zone(pos, kind, opts) { return this.own(new Zone(this, pos, kind, opts)); }

  // Register a hostile/visual actor as owned by this fight (cleared at intermissions / death).
  own(actor) {
    this.actors.add(actor);
    const upd = actor.update.bind(actor);
    actor.update = (dt, game) => {
      const alive = !actor._cleared && upd(dt, game);
      if (!alive) this.actors.delete(actor);
      return alive;
    };
    this.game.addActor(actor);
    return actor;
  }

  // Spawn an add (0 XP). o: { hpMult (× act scaling), speedMult, goal (Vector3), goalR, onGoal(game, e),
  //   elite, keepOnClear (survive intermissions) }
  spawnAdd(typeId, pos, o = {}) {
    const g = this.game;
    const act = g.act;
    const e = createEnemy(g, typeId, pos, {
      hpMult: enemyHpMult(act, 150, g.tier) * (o.hpMult ?? 1),
      damageScale: enemyDmgMult(act, 150, g.tier),
      xpMult: 0, elite: !!o.elite,
    });
    e.xp = 0;
    e.isAdd = true;
    e.owner = this;
    if (o.speedMult) e.speed *= o.speedMult;
    if (o.goal) { e.goal = o.goal; e.goalR = o.goalR ?? 1.6; e.onGoal = o.onGoal; }
    e.keepOnClear = !!o.keepOnClear;
    g.addEnemy(e);
    this.adds.add(e);
    return e;
  }

  // Fodder wave (v5.2 C1): `count` plain enemies rise from the arena wall (angle spread, kept off the player),
  // each after a short dust tell. Normal XP, e.isFodder, e.orbChance, e.autoPriority 1, tracked in this.fodder
  // (never this.adds). Capped so live + pending fodder stays ≤ count × 2. Returns the number scheduled.
  // o: { types, count = 3, ring = 0.92, orbChance = 0.08, xp = true, onSpawn(e) }
  spawnWave(o = {}) {
    const g = this.game;
    const types = o.types ?? this.cfg.fodder?.types;
    if (!types?.length || this.dead || !g.player || g.player.dead) return 0;
    const want = Math.max(1, Math.round(o.count ?? 3));
    const room = want * 2 - this._liveFodder() - this._fodderPending;
    const n = Math.min(want, room);
    if (n <= 0) return 0;
    const ring = o.ring ?? 0.92, orbChance = o.orbChance ?? 0.08;
    const pp = g.player.pos;
    const base = Math.random() * Math.PI * 2;
    const wave = ++this._fodderWave;
    for (let i = 0; i < n; i++) {
      let ang = base + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      let at = this.arenaPoint(ang, ring);
      for (let k = 0; k < 6 && distXZ(at, pp) < 7; k++) at = this.arenaPoint((ang += 0.45), ring);   // not on top of the player
      const typeId = types[(Math.random() * types.length) | 0];
      g.fx.ring(at, { color: 0x2e2216, radius: 1.5, from: 0.3, life: FODDER_TELL, width: 0.3, hdr: 1, occ: 0.8, blend: 'normal' });
      g.fx.burst(at, { color: 0x5a4630, count: 8, speed: 2.5, life: 0.6, size: 0.4, up: 1.4, gravity: 5, occ: 0.85, blend: 'normal' });
      this._fodderPending++;
      const gen = this._fodderGen;
      this.after(FODDER_TELL, () => {
        this._fodderPending = Math.max(0, this._fodderPending - 1);
        if (gen !== this._fodderGen || this.dead || this._disposed || this.intermissionIdx) return;
        const act = g.act;
        const e = createEnemy(g, typeId, at, {
          hpMult: enemyHpMult(act, 150, g.tier),
          damageScale: enemyDmgMult(act, 150, g.tier),
          xpMult: o.xp === false ? 0 : ACTS[act].xp,
          resist: ACTS[act].resist,
        });
        e.isFodder = true;
        e.owner = this;
        e.orbChance = orbChance;
        e.autoPriority = 1;
        g.addEnemy(e);
        this.fodder.add(e);
        o.onSpawn?.(e);
      }, true);
    }
    g.events.emit('bossFodder', { enemy: this, wave, count: n });
    return n;
  }

  _liveFodder() {
    let n = 0;
    for (const e of this.fodder) { if (e.dead) this.fodder.delete(e); else n++; }
    return n;
  }

  // cfg.fodder scheduler (fight branch only: never during intermissions or Downed/Winded). First wave when a
  // phase starts (after Winded and the 2.5 s landing hold), then every `every` fight-seconds; a wave is
  // postponed (not dropped) while a Break Check cast runs.
  _fodderTick(dt) {
    const f = this.cfg.fodder;
    if (!f) return;
    if (this._fodderT > 0) this._fodderT -= dt;
    if (this._fodderT > 0 || this.cast?.check || this._gatePending) return;
    const enc = this.game.encounter;
    if (enc?.active && enc.state === 'fight' && enc.t < FODDER_LAND_HOLD) return;
    const count = f.count?.[this.phase - 1] ?? f.count?.[f.count.length - 1] ?? 3;
    const n = this.spawnWave({ types: f.types, count, ring: f.ring, orbChance: f.orbChance, xp: f.xp });
    this._fodderT = n > 0 ? (f.every ?? 20) : 1.5;
  }

  // Objective mark (v5.2 C4): ground ring under `e` (follows it) + thin tether to the boss; adds `e` to
  // this.objectives and sets e.objective = { color, label } for the HUD. Orange by default; never gold or hostile
  // red. Removed automatically when `e` dies, on clearField / dispose, or via unmarkObjective(e).
  markObjective(e, o = {}) {
    if (!e || e.dead) return e;
    let color = o.color ?? MARK_COLOR;
    if (color === SAFE_GOLD || color === HOSTILE_RED) color = MARK_COLOR;
    this.unmarkObjective(e);
    let mats = this._markMats.get(color);
    if (!mats) {
      const mk = (a) => blendAddMaterial(color, { hdr: 1.7, occ: 0.5, opacity: a, side: THREE.DoubleSide, depthTest: false });
      mats = { ring: mk(1), tether: mk(0.5) };
      this._markMats.set(color, mats);
    }
    const scene = this.game.scene;
    const ring = new THREE.Mesh(this.ringGeo, mats.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 6;
    scene.add(ring);
    let tether = null;
    if (o.tether !== false) {
      tether = new THREE.Group();
      const m = new THREE.Mesh(GEO.plane, mats.tether);
      m.rotation.x = -Math.PI / 2;
      m.position.z = 0.5;
      m.scale.set(0.16, 1, 1);
      m.renderOrder = 5;
      tether.add(m);
      scene.add(tether);
    }
    this._marks.set(e, { ring, tether });
    e.objective = { color, label: o.label ?? null };
    this.objectives.add(e);
    return e;
  }

  unmarkObjective(e) {
    const m = this._marks.get(e);
    if (!m) { this.objectives.delete(e); return; }
    const scene = this.game.scene;
    scene.remove(m.ring);
    if (m.tether) scene.remove(m.tether);
    this._marks.delete(e);
    this.objectives.delete(e);
    e.objective = null;
  }

  _markTick() {
    if (!this._marks.size) return;
    const t = this.time, k = 0.75 + 0.25 * Math.sin(t * 5);
    for (const m of this._markMats.values()) { m.ring.opacity = k; m.tether.opacity = 0.5 * k; }
    for (const [e, m] of this._marks) {
      if (e.dead || e._disposed) { this.unmarkObjective(e); continue; }
      m.ring.position.set(e.pos.x, 0.1, e.pos.z);
      m.ring.scale.setScalar((e.radius ?? 0.6) + 0.6 + 0.07 * Math.sin(t * 5));
      if (m.tether) {
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        m.tether.position.set(this.pos.x, 0.1, this.pos.z);
        m.tether.rotation.y = Math.atan2(dx, dz);
        m.tether.scale.z = Math.max(0.01, Math.hypot(dx, dz));
      }
    }
  }

  // A destructible fight object (pod, banner, conduit, pillar). Enemy-contract, inert (no XP, no kill, no
  // statuses/reactions), but targetable (auto-cast / homing may pick it) unless targetable: false.
  // o: { pos, radius, hp, mesh (Object3D, added to scene by this), targetable (auto-cast may target it;
  //   default true), solid (adds a world obstacle), blocker (blocks beams), onDeath(obj), onHit(obj),
  //   update(dt, obj), keepOnClear, name, tag }
  spawnObject(o) {
    const g = this.game;
    const pos = new THREE.Vector3(o.pos.x, 0, o.pos.z);
    const boss = this;
    const obj = {
      type: o.tag ?? 'bossObject', name: o.name ?? 'object', tag: o.tag ?? null, owner: this,
      pos, radius: o.radius ?? 0.8, hp: o.hp, maxHp: o.hp, xp: 0, damage: 0, speed: 0,
      status: makeStatus(), knock: new THREE.Vector3(), kbResist: 1,
      dead: false, inert: true, targetable: o.targetable !== false, elite: false, boss: false, final: false, isObject: true,
      ward: null, resist: null, barrier: 0, deathColor: o.deathColor ?? 0xd8c8a0, mesh: o.mesh ?? new THREE.Group(),
      keepOnClear: !!o.keepOnClear, marker: !!o.marker, flashT: 0, dropsChest: false,
      update(dt) { if (this.flashT > 0) this.flashT -= dt; o.update?.(dt, obj); },
      flash() { this.flashT = 0.1; o.onHit?.(obj); },
      onDeath(game) { boss.objects.delete(obj); boss._dropObstacle(obj); o.onDeath?.(obj); },
      dispose(game) {
        if (obj._disposed) return;
        obj._disposed = true;
        boss.objects.delete(obj);
        boss._dropObstacle(obj);
        game.scene.remove(obj.mesh);
      },
    };
    obj.mesh.position.set(pos.x, 0, pos.z);
    g.scene.add(obj.mesh);
    if (o.solid || o.blocker) {
      obj._obs = { x: pos.x, z: pos.z, r: obj.radius };
      g.world.obstacles.push(obj._obs);
      if (o.blocker) this.blockers.push(obj._obs);
    }
    g.addEnemy(obj);
    this.objects.add(obj);
    return obj;
  }

  // Is `p` in the shadow of a blocker (pillar) as seen from `src`? (beam line of sight)
  shadowed(p, src) {
    for (const b of this.blockers) {
      const dx = p.x - src.x, dz = p.z - src.z;
      const len = Math.hypot(dx, dz);
      const bx = b.x - src.x, bz = b.z - src.z;
      const t = (bx * dx + bz * dz) / (len * len || 1);
      if (t <= 0 || t >= 1) continue;
      if (segDist(b.x, b.z, src.x, src.z, p.x, p.z) < b.r) return true;
    }
    return false;
  }

  // Danger at point p within `horizon` s: pending hostile telegraphs whose area contains p (weighted by how
  // soon they resolve) + hostile zones. Used by the sim bot (src/dev/sim.js); cheap, no allocation.
  danger(p, horizon = 1.6, pad = 0.6) {
    let d = 0;
    for (const h of this.handles) {
      const s = h.shape;
      if (!s || s.safe || h.done) continue;
      const left = h.resolveAt - this.time;
      if (left > horizon) continue;
      let inside = false;
      if (s.kind === 'circle') inside = distXZ(p, s.c) < s.r + pad;
      else if (s.kind === 'donut') { const q = distXZ(p, s.c); inside = q < s.r + pad && q > s.inner - pad; }
      else if (s.kind === 'cone') inside = inCone(p, s.c, s.d, s.angle, s.r, pad);
      else if (s.kind === 'line') inside = segDist(p.x, p.z, s.c.x, s.c.z, s.c.x + s.d.x * s.len, s.c.z + s.d.z * s.len) < s.width / 2 + pad;
      if (inside) d += 1 + 2 * (1 - Math.max(0, left) / horizon);
    }
    for (const a of this.actors) {
      if (a instanceof Zone && a.hostile && !a.dead && a.contains(p, pad)) d += 1.5;
      else if (a instanceof RingWave && !a.hit) {
        const q = distXZ(p, a.center);
        if (q > a.r && q - a.r < a.speed * 0.5 && !a._inGap(p)) d += 2;
      }
    }
    return d;
  }

  // Safe zones (gold) containing p, e.g. sap pools, lightning rods, shelters.
  inSafe(p) {
    for (const a of this.actors) if (a instanceof Zone && a.kind === 'safe' && !a.dead && a.contains(p)) return true;
    return false;
  }

  // Hit the player now (outside a telegraph) with base damage × mult.
  hitPlayer(mult = 1, how = 'hit', source = this) {
    this.game.player.takeDamage(this.dmg(mult), source, how);
  }

  // Named cast bar without a poise threshold (HUD shows it).
  castBar(name, dur) { this.cast = { name, t: 0, dur, threshold: 0, check: false }; }

  // Break Check: a named cast the player must stagger. Poise empties, the threshold mark appears.
  // o: { name, dur, threshold, action, onSuccess, onFail } → busy for dur
  breakCheck(o) {
    // Stagger already built carries over (round 2: resetting a 90% bar to 0 read as stolen progress): the
    // target is the check's full size above the current bar (capped at the bar), never below the base threshold.
    const base = Math.round(o.threshold * (this._affixPoise ?? 1));
    const cap = this.poise.max * this.poise.mult - 1;
    const threshold = Math.round(Math.min(cap, Math.max(base, this.poise.v + base)));
    this.cast = { name: o.name, t: 0, dur: o.dur, threshold, check: true, o };
    this.poise.lockT = 0;
    this.poise.threshold = threshold;
    if (o.action) this.play(o.action, o.dur, o.dur, null, 1.2);
    this.busyT = Math.max(this.busyT, o.dur + 0.2);
    this.game.events.emit('breakCheck', { enemy: this, name: o.name, dur: o.dur, threshold });
    return o.dur + 0.2;
  }

  addPoise(n, src) {
    const p = this.poise;
    if (n <= 0 || this.dead || this.downed || this.intermissionIdx || p.lockT > 0) return;
    let gain = n * (this.game.player?.stats.poiseGain ?? 1) * (1 - 0.05 * this.game.tier);
    if (REACTION_SRC.has(src)) { gain /= 1 + p.fatigue / FATIGUE_K; p.fatigue += 1; }
    p.v = Math.min(p.max * p.mult, p.v + gain);
    p.lastGain = this.time;
    this.game.events.emit('poise', { enemy: this, amount: gain, src });
    const c = this.cast;
    if (c?.check && p.v >= c.threshold) this._checkResult(true);
    else if (p.v >= p.max * p.mult) this.down(this.cfg.downed?.[this.phase - 1] ?? 4, 'stagger');
  }

  // Downed: stagger pose, +40% damage taken, pending telegraphs/timers cancelled (zones stay).
  down(sec, reason = 'stagger') {
    if (this.dead) return;
    sec = Math.max(1, sec - (this._affixDownedCut ?? 0));
    this._cancelPending();
    this.cast = null;
    this.downed = true;
    this.downedT = sec;
    this.downedDur = sec;
    this.busyT = sec;
    this.poise.v = 0;
    this.poise.threshold = 0;
    this.play('downed', sec, 0, null, 0.3);
    this.game.fx.text({ x: this.pos.x, y: 3, z: this.pos.z }, reason === 'winded' ? 'WINDED' : 'DOWNED', '#e8eef8', true);
    this.game.events.emit('bossDowned', { enemy: this, dur: sec, reason });
    this.onDowned?.(reason);
  }

  expose(sec) { this.exposedT = Math.max(this.exposedT, sec); }

  // Remove adds, zones, ring waves and pending telegraphs (intermission start, death).
  clearField() {
    this._cancelPending();
    for (const a of this.actors) { a._cleared = true; }
    this.actors.clear();
    for (const e of this.adds) {
      if (e.dead || e.keepOnClear) continue;
      this.game.fx.burst(e.pos, { color: 0x9a7cff, count: 4, speed: 3, life: 0.4, size: 0.3, up: 1.4 });
      e.dead = true;
    }
    this.adds.clear();
    // fodder pay their XP out (the player earned the wave's worth) and fade
    this._fodderGen++;
    for (const e of this.fodder) {
      if (e.dead) continue;
      if (e.xp > 0) this.game.pickups.spawnXP(e.pos, e.xp);
      this.game.fx.burst(e.pos, { color: 0x9a7cff, count: 4, speed: 3, life: 0.4, size: 0.3, up: 1.4 });
      e.dead = true;
    }
    this.fodder.clear();
    this._fodderPending = 0;
    for (const o of [...this.objects]) {
      if (o.keepOnClear) continue;
      o.dead = true;
    }
    for (const e of [...this.objectives]) if (e.dead) this.unmarkObjective(e);
    this.onClearField?.();
  }

  // ================================================================ frame
  update(dt, game) {
    if (this.dead) return;
    const mv = this.intermissionIdx || this.downed ? 1 : updateStatuses(game, this, dt);
    if (this.dead) return;
    this.time += dt;
    this._poiseFromStatus(dt);
    this._tickTimers(dt, mv);

    if (this.intermissionIdx) {
      this.intT -= dt;
      this.think?.(dt, 1);
      if (this.intT <= 0) this._endIntermission();
    } else if (this.downed) {
      this.downedT -= dt;
      if (this.downedT <= 0) this._recover();
    } else if (this._gatePending) {
      this._beginIntermission();
    } else if (mv > 0) {
      this.fightT += dt;
      this.phaseT += dt;
      if (this._gateHeld && this.phaseT >= this._minPhase()) { this._gateHeld = false; this.onGate(); }
      this._fodderTick(dt);
      this._enrageTick();
      this._affixTick(dt);
      if (this.busyT > 0) { this.busyT -= dt; if (this.busyT <= 0) this.gapT = this._gap(); }
      if (this.contactCd > 0) this.contactCd -= dt;
      if (this.cast) this._castTick(dt);
      if (this.move) this.move(dt, mv); else this._chase(dt, mv);
      this._contact(game);
      this.think?.(dt, mv);
      if (this.busyT <= 0 && !this.cast) {
        this.gapT -= dt;
        if (this.gapT <= 0) this._nextMove();
      }
    }

    // poise decay (paused during checks, Downed and the recovery lock)
    const p = this.poise;
    p.fatigue *= Math.exp(-dt / FATIGUE_TAU);
    if (p.lockT > 0) p.lockT -= dt;
    else if (!this.cast?.check && !this.downed && this.time - p.lastGain > POISE_DECAY_DELAY) p.v = Math.max(0, p.v - POISE_DECAY * dt);
    if (this.exposedT > 0) this.exposedT -= dt;
    this.takenMult = (1 - this.armor) * (this.downed ? DOWNED_TAKEN : 1) * (this.exposedT > 0 ? EXPOSED_TAKEN : 1);

    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-8 * dt));
    game.world.collide(this.pos, this.radius);
    this._markTick();
    this._visuals(dt, mv);
  }

  // combat.js calls this when damage would cross the current gate.
  onGate() {
    if (this.intermissionIdx || this._gatePending) return;
    if (this.gateIdx >= this.gates.length) return;
    // cfg.minPhase: hp stays pinned at hpFloor until the phase has run long enough (Downed time doesn't count)
    if (this.phaseT < this._minPhase()) { this._gateHeld = true; return; }
    this._gateHeld = false;
    this._gatePending = true;
    this.game.fx.flashDisc(this.pos, { color: 0xe8eef8, radius: this.radius + 1, life: 0.25, hdr: 1.6 });
  }

  // ================================================================ internals
  _minPhase() { return this.cfg.minPhase?.[this.phase - 1] ?? 0; }

  _teleOpts(o, onDone) {
    return { onDone, safe: !!o.safe, keepColor: !!o.keepColor, color: o.color };
  }

  // shape: the telegraph's hit area (bots and AI-assist read it through danger()); resolves at time + lead.
  // Legacy one-argument form _tele(handle) (no shape) is still accepted.
  _tele(shape, lead, handle) {
    if (handle === undefined) { handle = shape; shape = null; }
    handle.shape = shape;
    handle.resolveAt = this.time + (lead ?? 0);
    this.handles.add(handle);
    const done = handle.cancel;
    handle.cancel = () => { this.handles.delete(handle); done(); };
    return handle;
  }

  _resolve(hit, o, at) {
    if (this.dead) return;
    if (hit) this.hitPlayer(o.dmg ?? 1, o.how ?? 'attack');
    if (!o.safe) {
      this.game.events.emit('bossImpact', { enemy: this, pos: at, heavy: (o.dmg ?? 1) >= 1.4 });
      if (this.affixes.some((a) => a.id === 'reverberating') && !o.noEcho) {
        this.after(0.4, () => this.ringWave(at, { speed: 7, maxR: 7, from: 1, dmg: 0.5, how: 'reverberation' }));
      }
    }
    o.onResolve?.(hit);
  }

  _cancelPending() {
    for (const h of [...this.handles]) h.cancel();
    this.handles.clear();
    this.timers = this.timers.filter((t) => t.keep);
  }

  _tickTimers(dt, mv) {
    if (mv <= 0 && !this.intermissionIdx) return;   // frozen / stunned: scripted timers pause too
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        if (!this.dead) tm.fn();
      }
    }
  }

  _gap() {
    const base = this.cfg.cycle?.[this.phase - 1] ?? 1.2;
    return base * Math.pow(0.95, this.enrage) * (this._affixGap ?? 1);
  }

  _nextMove() {
    let name = this.queued.shift();
    if (!name) {
      const rot = this.rotation(this.phase);
      if (!rot?.length) return;
      for (let tries = 0; tries < rot.length; tries++) {
        const cand = rot[this.rotIdx % rot.length];
        this.rotIdx++;
        if (this.moves[cand] && (this.ready?.(cand) ?? true)) { name = cand; break; }
      }
    }
    if (!name || !this.moves[name]) { this.gapT = 0.5; return; }
    this.lastMove = name;
    const busy = this.moves[name].call(this) ?? 1;
    this.busyT = Math.max(this.busyT, busy);
    if (this.busyT <= 0) this.gapT = this._gap();
  }

  _castTick(dt) {
    const c = this.cast;
    c.t += dt;
    if (c.t >= c.dur) {
      if (c.check) this._checkResult(false);
      else this.cast = null;
    }
  }

  _checkResult(success) {
    const c = this.cast;
    this.cast = null;
    this.poise.threshold = 0;
    this.game.events.emit('breakCheckEnd', { enemy: this, name: c.name, success });
    if (success) {
      c.o.onSuccess?.();
      this._breakOrb();
      this.down((this.cfg.downed?.[this.phase - 1] ?? 4) + 2, 'break');
    } else {
      this.busyT = 0.6;
      c.o.onFail?.();
    }
  }

  // C5: a broken Break Check drops a health orb 30% of the time, at the boss's feet toward the player.
  _breakOrb() {
    if (Math.random() >= BREAK_ORB_CHANCE) return;
    const p = this.game.player.pos, d = dirXZ(this.pos, p, _v);
    const pos = { x: this.pos.x + d.x * (this.radius + 1.2), z: this.pos.z + d.z * (this.radius + 1.2) };
    this.game.pickups.spawn('health', pos);
    this.game.events.emit('bossBreakOrb', { enemy: this, pos });
  }

  _recover() {
    this.downed = false;
    this.busyT = 0;
    this.gapT = 0.8;
    this.poise.lockT = RECOVER_TIME;
    this.poise.mult = Math.min(POISE_MULT_CAP, this.poise.mult * 1.25);
    this.play('recover', 0.6, 0);
    this.game.events.emit('bossRecovered', { enemy: this });
    this.onRecovered?.();
  }

  _beginIntermission() {
    this._gatePending = false;
    this.gateIdx++;
    const idx = this.isEcho ? 2 : this.gateIdx;
    if (this.downed) { this.downed = false; this.downedT = 0; }
    this.cast = null;
    this.poise.v = 0;
    this.poise.threshold = 0;
    this.clearField();
    // C5: the player starts the intermission with every dash charge (the 12% heal lands when it ends)
    const dash = this.game.player.dash;
    dash.charges = dash.max; dash.recharge = 0;
    this._gateHeld = false;
    this.untargetable = true;
    this.intermissionIdx = idx;
    this.musicState = idx === 1 ? 'inter' : 'inter2';
    this.status.frozen = 0; this.status.stun = 0;
    this.intT = this.intermission(idx) ?? 6;
    this.game.events.emit('bossIntermission', { enemy: this, index: idx, dur: this.intT });
  }

  _endIntermission() {
    this.intermissionIdx = 0;
    this.untargetable = false;
    this.phase = Math.min(3, this.phase + 1);
    this.hpFloor = this.gateIdx < this.gates.length ? this.maxHp * this.gates[this.gateIdx] : undefined;
    if (this.hpFloor === undefined) delete this.hpFloor;
    this.poise.mult = 1;
    this.rotIdx = 0;
    this.musicState = this.phase === 2 ? 'p2' : 'p3';
    this.rig.rage = this.phase >= 2 ? 1 : 0;
    this.phaseT = 0;
    this._fodderT = 0;
    // C5: every gate tops the player up by 12% max HP (dash charges were refilled when the intermission began)
    const pl = this.game.player;
    if (!pl.dead) {
      const amount = pl.stats.maxHp * GATE_HEAL;
      pl.heal(amount);
      this.game.events.emit('bossGateHeal', { enemy: this, amount, pct: GATE_HEAL });
    }
    this.game.events.emit('bossPhase', { enemy: this, phase: this.phase });
    this.onPhase?.(this.phase);
    this.down(this.cfg.windedDur ?? 3, 'winded');
  }

  _enrageTick() {
    const at = this.cfg.enrageAt;
    if (!at || this.fightT < at) return;
    const n = 1 + Math.floor((this.fightT - at) / 10);
    if (n !== this.enrage) {
      if (this.enrage === 0) this.game.events.emit('bossEnrage', { enemy: this, level: n });
      this.enrage = n;
    }
  }

  _affixTick(dt) {
    if (!this.affixes.length) return;
    if (this._affixDmg === undefined) {
      this._affixDmg = 1; this._affixGap = 1; this._affixPoise = 1; this._affixDownedCut = 0;
      for (const a of this.affixes) a.init?.(this);
    }
    for (const a of this.affixes) a.update?.(this, dt);
  }

  _poiseFromStatus(dt) {
    // Status pressure: every 0.5 s a boss carrying Burn / Chill / Shock gains STATUS_POISE (round 2: single-
    // element builds had no way to stagger; reactions alone also favoured 2-element builds too much).
    this._statusT = (this._statusT ?? 0.5) - dt;
    if (this._statusT <= 0) {
      this._statusT = 0.5;
      const s = this.status;
      if (s.burn > 0 || s.chill > 0 || s.shock > 0) this.addPoise(STATUS_POISE, 'status');
    }
    const stun = this.status.stun > 0;
    if (stun && !this._stunWas) this.addPoise(POISE.stunned, 'stunned');
    this._stunWas = stun;
  }

  _chase(dt, mv) {
    if (this.busyT > 0) return;
    const p = this.game.player.pos;
    this.face(p);
    if (distXZ(this.pos, p) <= this.radius + this.stopGap) return;
    dirXZ(this.pos, p, _v);
    this.pos.addScaledVector(_v, this.speed * mv * dt);
  }

  _contact(game) {
    if (this.contactCd > 0 || this.untargetable) return;
    const p = game.player;
    if (distXZ(this.pos, p.pos) < this.radius + p.radius + 0.2) {
      p.takeDamage(this.dmg(0.4), this, 'contact');
      this.contactCd = 1.0;
    }
  }

  _dropObstacle(obj) {
    if (!obj._obs) return;
    const w = this.game.world.obstacles;
    const i = w.indexOf(obj._obs);
    if (i >= 0) w.splice(i, 1);
    const j = this.blockers.indexOf(obj._obs);
    if (j >= 0) this.blockers.splice(j, 1);
    obj._obs = null;
  }

  flash() {
    this.flashT = 0.08;
    if (this.flashGap <= 0 && this.rig) {
      this.rig.flash();
      this.flashGap = HIT_FLASH_GAP;
    }
  }

  _visuals(dt, mv) {
    const h = this.rig;
    const adt = mv > 0 || this.downed || this.intermissionIdx ? dt : 0;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.flashGap > 0) this.flashGap -= dt;
    let a = this.anim;
    if (a) {
      a.t += adt;
      if (a.t >= a.dur) {
        const next = a.next;
        this.anim = null;
        if (next) this.play(next[0], next[1], next[2]);
        a = this.anim;
      }
    }
    if (this.blendT > 0) {
      this.blendT -= adt;
      if (this.blendT <= 0) this.prevAnim = null;
    }
    this.visuals?.(dt, a);
    h.yaw = this.yaw;
    const p = this.prevAnim;
    h.action = a ? a.action : null;
    h.k = a ? Math.min(1, a.t / a.dur) : 0;
    h.dur = a ? a.dur : 0;
    h.prevAction = p ? p.action : null;
    h.prevK = p ? p.k : 0;
    h.prevDur = p ? p.dur : 0;
    h.blend = p ? Math.max(0, this.blendT / BLEND) : 0;
    h.frozen = this.status.frozen > 0;
    if (!this.isEcho) h.tint = statusTint(this);
    h.stat = statusLook(this, h.stat ?? [0, 0, 0], this.game.player?.stats.freezeAt);
    let glow = this.look.glow[this.phase - 1] ?? this.look.glow[0];
    if (a) glow = Math.max(glow, this._tellGlow(a));
    if (this.downed) glow *= 0.4;
    h.glow = glow;
    h.hidden = !!this.hidden;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = h._yaw ?? this.yaw;
  }

  _tellGlow(a) {
    const tl = a.tell;
    if (!tl) return 0;
    const pk = a.peak / 1.1;
    if (a.t < tl) return pk * (0.15 + 0.95 * Math.pow(a.t / tl, 1.5));
    return pk * Math.max(0, 1.1 - (a.t - tl) / 0.35);
  }

  own_mat(mat) { this.mats.push(mat); return mat; }

  // ================================================================ lifecycle
  onDeath(game) {
    this.clearField();
    for (const o of [...this.objects]) o.dead = true;
    if (!this.rig) return;
    this.rig.frozen = false;
    game.creatures.remove(this.rig, { corpse: true });
    this.rig = null;
  }

  dispose(game) {
    if (this._disposed) return;
    this._disposed = true;
    this.dead = true;
    for (const off of this._offs) off();
    this._cancelPending();
    for (const e of [...this._marks.keys()]) this.unmarkObjective(e);
    for (const m of this._markMats.values()) { m.ring.dispose(); m.tether.dispose(); }
    this._markMats.clear();
    for (const a of this.actors) a._cleared = true;
    for (const o of [...this.objects]) { o.dead = true; o.dispose(game); }
    if (this.rig) {
      this.rig.frozen = false;
      this.rig.action = 'die';
      game.creatures.remove(this.rig, { corpse: true });
      this.rig = null;
    }
    this.onDispose?.(game);
    game.scene.remove(this.mesh);
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
    this.ringGeo.dispose();
    this.ringGapGeo?.dispose();
  }
}

export { GEO, HOSTILE_RED, SAFE_GOLD, blendAddMaterial, damageEnemy };
