import * as THREE from 'three';
import { dirXZ, clamp } from '../core/utils.js';
import { BASE_STATS, PASSIVES, SKILLS } from './skills/registry.js';
import { CLASSES } from './classes.js';
import { applyAttunements } from './meta.js';
import { damageEnemy, reactionBase } from './combat.js';
import { HeroModel } from './heroes/index.js';
import { HERO_FX } from './vfx/heroFx.js';

// Slot index -> how it's triggered. Slot 0 is the class starter (fixed).
export const SLOT_KEYS = [
  { label: 'LMB', mouse: 0 },
  { label: 'RMB', mouse: 2 },
  { label: 'Q', code: 'KeyQ' },
  { label: 'E', code: 'KeyE' },
  { label: 'R', code: 'KeyR' },
];
export const MAX_AUTOS = 2;

// Damage taken (playtest round 1, issues #4 and #5)
export const HIT_CAP = 0.3;            // max share of max HP one hit can take
const FROST_ARMOR_BLOCK = 0.6;         // Permafrost armour absorbs 60% of a hit
const FROST_ARMOR_CD = 1.2;            // seconds between armour gains (from freezing foes)
const FROST_ARMOR_MAX = 3;

// Player-facing name of whatever hurt the player: enemies, bosses ("Vashkar, the Ashen
// Warchief" -> "Vashkar"), projectiles (their shooter) and map hazards all carry .name.
export function hitSourceName(source) {
  const n = source?.name ?? source?.boss?.name;
  return n ? String(n).split(',')[0] : 'Unknown';
}

const _hits = [];

export class Player {
  constructor(game, classId = 'arcanist') {
    this.game = game;
    this.cls = CLASSES[classId] ?? CLASSES.arcanist;
    this.classId = this.cls.id;
    this.traitId = this.cls.trait.id;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.facing = new THREE.Vector3(1, 0, 0);
    this.moveDir = new THREE.Vector3();
    this.radius = 0.5;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpForLevel(1);
    this.invuln = 0;
    this.dead = false;
    this.skills = [];                 // { def, rank, cd, state, slot }
    this.slots = new Array(SLOT_KEYS.length).fill(null);
    this.passives = new Map();        // id -> rank
    this.relics = [];                 // relic defs
    this._relicState = new Map();     // id -> { st, cleanup }
    this.buffs = new Map();           // id -> { t, dur, name, icon, color, apply }
    this.shield = 0;                  // absorbs damage first (Aegis shrine)
    this.frostArmor = 0;              // Permafrost: each absorbs one full hit
    this._armorCd = 0;
    this.charge = 0;                  // Momentum
    this.traitDamage = 0;             // extra damage multiplier from trait (read by combat)
    this.traitCdr = 0;
    this.relicDmgTaken = 1;
    this.god = 1;                  // dev / sim damage-taken factor (src/dev/sim.js god option); never touched by relics
    this.adrenalineDur = 3;
    this.secondWind = false;
    this.lastElement = this.cls.element;
    this.castPulse = 0;
    this.walkT = 0;
    this._wildfire = [];
    this._offs = [];

    const d = this.cls.dash;
    this.dash = { def: d, max: d.charges, charges: d.charges, recharge: 0, t: 0, dir: new THREE.Vector3(1, 0, 0), speed: 0, window: 0, perfectUsed: false, trailT: 0, hit: new Set() };

    this.stats = { ...BASE_STATS };
    this.recalcStats();
    this.hp = this.stats.maxHp;

    this.model = new HeroModel(game, this.classId);   // rig body on game.heroes + ground ring (root)

    this._initTrait();
    this.learnSkill(SKILLS[this.cls.starter], 0);
  }

  // ------------------------------------------------------------- skills / passives
  getSkill(id) { return this.skills.find((s) => s.def.id === id); }
  skillRank(id) { return this.getSkill(id)?.rank ?? 0; }
  // Free *active* slot (slot 0 is reserved for the starter / its fusion).
  freeSlot() { for (let i = 1; i < this.slots.length; i++) if (this.slots[i] === null) return i; return -1; }
  usesSlot(def) { return typeof def.cast === 'function'; }
  autoCount() { return this.skills.filter((s) => !this.usesSlot(s.def)).length; }

  learnSkill(def, preferSlot = -1) {
    const entry = { def, rank: 1, cd: 0, state: {}, slot: -1 };
    if (this.usesSlot(def)) {
      const slot = preferSlot >= 0 && this.slots[preferSlot] === null ? preferSlot : this.freeSlot();
      if (slot < 0) return null;
      entry.slot = slot;
      this.slots[slot] = entry;
    }
    this.skills.push(entry);
    def.init?.(this.game, entry.state, entry.rank);
    this.game.events.emit('skillLearned', { def });
    return entry;
  }

  rankUpSkill(id) {
    const s = this.getSkill(id);
    if (!s || s.rank >= (s.def.maxRank ?? 5)) return;
    s.rank++;
    s.def.onRankUp?.(this.game, s.state, s.rank);
    this.game.events.emit('skillRankUp', { def: s.def, rank: s.rank });
  }

  removeSkill(id) {
    const s = this.getSkill(id);
    if (!s) return -1;
    s.def.dispose?.(this.game, s.state);
    if (s.slot >= 0) this.slots[s.slot] = null;
    this.skills.splice(this.skills.indexOf(s), 1);
    return s.slot;
  }

  fuse(recipe) {
    const slotA = this.removeSkill(recipe.a);
    const slotB = this.removeSkill(recipe.b);
    const prefer = slotA >= 0 ? slotA : slotB;
    this.learnSkill(recipe.def, prefer);
    this.game.events.emit('fusion', { def: recipe.def, recipe });
  }

  learnPassive(id) {
    this.passives.set(id, (this.passives.get(id) ?? 0) + 1);
    this.recalcStats();
  }

  addRelic(def) {
    if (this.relics.some((r) => r.id === def.id)) return;
    this.relics.push(def);
    const st = {};
    const cleanup = def.init?.(this.game, this, st);
    this._relicState.set(def.id, { st, cleanup });
    this.recalcStats();
    this.game.events.emit('relicGained', { def });
  }

  // Timed buff. def: { name, icon, color, apply(stats) }. Re-adding refreshes the timer.
  addBuff(id, duration, def = {}) {
    this.buffs.set(id, { t: duration, dur: duration, ...def });
    this.recalcStats();
    this.game.events.emit('buff', { id, duration, def });
  }
  hasBuff(id) { return this.buffs.has(id); }
  addShield(n) { this.shield = Math.max(this.shield, 0) + n; }

  recalcStats() {
    const oldMax = this.stats.maxHp;
    const s = { ...BASE_STATS };
    this.cls.apply(s);
    if (this.game.meta) applyAttunements(s, this.game.meta);
    for (const [id, rank] of this.passives) for (let i = 0; i < rank; i++) PASSIVES[id].apply(s);
    for (const r of this.relics) r.apply?.(s);
    for (const b of this.buffs.values()) b.apply?.(s);
    s.maxHp = Math.max(1, Math.round(s.maxHp));
    this.stats = s;
    if (this.hp !== undefined) {
      if (s.maxHp > oldMax) this.hp += s.maxHp - oldMax;
      this.hp = Math.min(this.hp, s.maxHp);
    }
  }

  // ------------------------------------------------------------- traits
  _initTrait() {
    const ev = this.game.events;
    if (this.traitId === 'wildfire') {
      this._offs.push(ev.on('enemyKilled', ({ enemy }) => {
        if (enemy.status.burn > 0 && this._wildfire.length < 24) this._wildfire.push(enemy.pos.clone());
      }));
    } else if (this.traitId === 'permafrost') {
      this._offs.push(ev.on('enemyFrozen', () => {
        if (this._armorCd > 0 || this.frostArmor >= FROST_ARMOR_MAX) return;
        this.frostArmor++;
        this._armorCd = FROST_ARMOR_CD;
        HERO_FX.armorGain(this.game, this, this.frostArmor);
      }));
    }
  }

  _updateTrait(dt, moving) {
    const game = this.game;
    switch (this.traitId) {
      case 'resonance': {
        const c = Math.min(25, game.chain);
        this.traitDamage = 0.02 * c;
        this.traitCdr = 0.01 * c;
        break;
      }
      case 'momentum':
        this.charge = clamp(this.charge + (moving ? 28 : -60) * dt, 0, 100);
        this.traitDamage = 0.005 * this.charge;
        break;
      case 'wildfire': {
        let n = 0;
        while (this._wildfire.length && n++ < 6) {
          const pos = this._wildfire.shift();
          const r = 2.2 * this.stats.area;
          HERO_FX.wildfire(game, pos, r);
          const dmg = reactionBase(game) * 0.5;
          for (const e of game.queryEnemies(pos, r, _hits).slice()) damageEnemy(game, e, dmg, { element: 'fire', raw: true, noCrit: true, silent: e.hp > dmg * 3 });
        }
        break;
      }
      case 'permafrost':
        if (this._armorCd > 0) this._armorCd -= dt;
        break;
    }
  }

  // ------------------------------------------------------------- xp / hp
  gainXP(n) {
    const chainBonus = 1 + Math.min(50, this.game.chain) * 0.005; // up to +25%
    this.xp += n * this.stats.xpMult * chainBonus;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = xpForLevel(this.level);
      this.game.events.emit('levelUp', { level: this.level });
    }
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    if (this.hp - before >= 1) this.game.fx.number(this.pos, this.hp - before, { color: '#6dff8a' });
  }

  // source: the enemy / boss / projectile / hazard (its .name is player-facing); how: optional
  // attack label for the death recap ('charge', 'slam', 'projectile', ...).
  takeDamage(amount, source, how = null) {
    const game = this.game;
    if (this.dead || game.state !== 'playing') return;
    // Perfect Dodge: anything that would land early in a dash is negated and rewarded.
    if (this.dash.window > 0 && !this.dash.perfectUsed) { this._perfectDodge(source); return; }
    if (this.invuln > 0) return;
    let dmg = amount * (1 - this.stats.armor) * this.stats.dmgTaken * this.relicDmgTaken * this.god;
    // No single hit takes more than HIT_CAP of max HP (Act II War Boar charges took 40-50%).
    dmg = Math.min(dmg, this.stats.maxHp * HIT_CAP);
    if (this.frostArmor > 0) {
      // Permafrost armour softens a hit instead of erasing it (it made the Cryomancer untouchable)
      this.frostArmor--;
      HERO_FX.armorBreak(game, this);
      game.fx.text(this.pos, 'ARMOR', '#7fe0ff');
      dmg *= 1 - FROST_ARMOR_BLOCK;
    }
    if (this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a; dmg -= a;
      if (dmg <= 0) { this.invuln = 0.25; HERO_FX.shieldBlock(game, this); return; }
    }
    this.hp -= dmg;
    this.invuln = 0.45;
    game.fx.number(this.pos, dmg, { color: '#ff4d5e' });
    this.model.hit();
    game.fx.shake(0.25, 'threat');
    game.engine.pulse?.('hit');
    game.events.emit('playerHit', { amount: dmg, source, how, name: hitSourceName(source) });
    if (this.hp <= 0) {
      if (this.secondWind) {
        this.secondWind = false;
        this.invuln = 1.5;
        const rs = this.relics.find((r) => r.id === 'secondWind');
        rs?.onTrigger?.(game, this);
        return;
      }
      this.hp = 0;
      this.dead = true;
      HERO_FX.death(game, this);
      game.events.emit('playerDied', {});
    }
  }

  _perfectDodge(source) {
    const game = this.game;
    const d = this.dash;
    d.perfectUsed = true;
    d.charges = d.max; d.recharge = 0;
    this.invuln = Math.max(this.invuln, 0.35);
    this.addBuff('adrenaline', this.adrenalineDur, { name: 'Adrenaline', icon: '✦', color: '#9dffb0', apply: (s) => { s.damage += 0.3; } });
    game.slowmo(0.35, 0.3);
    game.hitStop(0.09);
    game.engine.pulse?.('perfect');
    // the HUD stamps PERFECT above the character (hud-fx.js); no world text here
    HERO_FX.perfectDodge(game, this);
    this.model.perfect();
    game.events.emit('perfectDodge', { source });
  }

  // ------------------------------------------------------------- dash
  _startDash(mx, mz) {
    const game = this.game, d = this.dash, def = d.def;
    if (d.charges === d.max) d.recharge = def.cd * (1 - clamp(this.stats.dashCdr, 0, 0.7));
    d.charges--;
    const len = Math.hypot(mx, mz);
    if (len > 0) d.dir.set(mx / len, 0, mz / len); else d.dir.copy(this.facing);
    d.window = 0.25;
    d.perfectUsed = false;
    d.hit.clear();
    d.trailT = 0;
    const from = this.pos.clone();
    this.model.dashStart(def.kind);
    game.events.emit('dash', { kind: def.kind });

    if (def.kind === 'blink') {
      this.pos.addScaledVector(d.dir, def.dist);
      game.world.collide(this.pos, this.radius);
      this.vel.set(0, 0, 0);
      d.t = def.dur;
      this.invuln = Math.max(this.invuln, def.dur + 0.1);
      HERO_FX.dashStart(game, this, def.kind, from);
      for (const e of game.queryEnemies(this.pos, 2 * this.stats.area, _hits).slice()) damageEnemy(game, e, 10, { element: 'arcane', knockback: 4 });
    } else {
      d.t = def.dur;
      d.speed = def.dist / def.dur;
      HERO_FX.dashStart(game, this, def.kind, from);
      this.invuln = Math.max(this.invuln, def.dur + 0.1);
    }
  }

  _updateDash(dt) {
    const game = this.game, d = this.dash, def = d.def;
    if (d.window > 0) d.window -= dt;
    if (d.charges < d.max) {
      d.recharge -= dt;
      if (d.recharge <= 0) {
        d.charges++;
        d.recharge = d.charges < d.max ? def.cd * (1 - clamp(this.stats.dashCdr, 0, 0.7)) : 0;
      }
    }
    if (d.t <= 0) return false;
    d.t -= dt;
    if (def.kind === 'blink') return true;
    this.pos.addScaledVector(d.dir, d.speed * dt);
    this.vel.copy(d.dir).multiplyScalar(this.stats.moveSpeed);
    game.world.collide(this.pos, this.radius);
    d.trailT -= dt;
    if (d.trailT <= 0) {
      d.trailT = 0.03;
      HERO_FX.dashTrail(game, this, def.kind, d.dir);
    }
    const area = this.stats.area;
    if (def.kind === 'flame') {
      if (!d._lastPatch || d._lastPatch.distanceTo(this.pos) > 0.9) {
        d._lastPatch = this.pos.clone();
        game.addActor(new FirePatch(game, this.pos, 1.2 * area, 2));
      }
    } else if (def.kind === 'frost' || def.kind === 'storm') {
      const r = (def.kind === 'frost' ? 1.6 : 1.3) * area;
      for (const e of game.queryEnemies(this.pos, r, _hits).slice()) {
        if (d.hit.has(e)) continue;
        d.hit.add(e);
        if (def.kind === 'frost') damageEnemy(game, e, 6, { element: 'frost', statusPower: 2 });
        else damageEnemy(game, e, 8, { element: 'storm' });
        HERO_FX.dashHit(game, this, def.kind, e);
      }
    }
    return true;
  }

  // ------------------------------------------------------------- per-frame
  update(dt) {
    const game = this.game, input = game.input, eng = game.engine;

    // movement input (camera-relative)
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) { mx += eng.forward.x; mz += eng.forward.z; }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) { mx -= eng.forward.x; mz -= eng.forward.z; }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx += eng.right.x; mz += eng.right.z; }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { mx -= eng.right.x; mz -= eng.right.z; }
    if (this.botMove) { mx = this.botMove.x; mz = this.botMove.z; } // simulation harness hook
    const len = Math.hypot(mx, mz);
    this.moveDir.set(len > 0 ? mx / len : 0, 0, len > 0 ? mz / len : 0);

    // aim
    dirXZ(this.pos, input.mouseGround, this.facing);

    // dash
    if ((input.pressed('Space') || this.botDash) && this.dash.charges > 0 && this.dash.t <= 0) { this.botDash = false; this._startDash(mx, mz); }
    const dashing = this._updateDash(dt);

    if (!dashing) {
      const speed = this.stats.moveSpeed;
      const tx = this.moveDir.x * speed, tz = this.moveDir.z * speed;
      const a = 1 - Math.exp(-14 * dt);
      this.vel.x += (tx - this.vel.x) * a;
      this.vel.z += (tz - this.vel.z) * a;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      game.world.collide(this.pos, this.radius);
    }
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;

    // timers
    if (this.invuln > 0) this.invuln -= dt;
    if (this.stats.regen > 0) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    let buffsChanged = false;
    for (const [id, b] of this.buffs) { b.t -= dt; if (b.t <= 0) { this.buffs.delete(id); buffsChanged = true; } }
    if (buffsChanged) this.recalcStats();
    this._updateTrait(dt, moving);

    // skills
    for (const s of this.skills) {
      if (s.cd > 0) s.cd -= dt;
      s.def.update?.(game, dt, s.state, s.rank);
    }
    const cdMult = 1 - clamp(this.stats.cdr + this.traitCdr, 0, 0.6);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s || s.cd > 0) continue;
      const k = SLOT_KEYS[i];
      const held = k.mouse !== undefined ? input.mouse(k.mouse) : input.isDown(k.code);
      let target = null;
      if (held) target = input.mouseGround.clone();
      else if (game.autoCast && !s.def.noAuto) {
        const e = this._autoTarget(s.def.range ?? 14);
        if (e) target = e.pos.clone();
      }
      if (!target) continue;
      target.y = 0;
      const dir = dirXZ(this.pos, target, new THREE.Vector3());
      const ctx = { rank: s.rank, origin: this.pos.clone(), dir, target, player: this, state: s.state };
      s.def.cast(game, ctx);
      this.model.cast(s.def, i);
      HERO_FX.cast(game, this, s.def, i);
      s.cd = s.def.cooldown(s.rank) * cdMult;
      this.castPulse = 1;
      this.lastElement = s.def.element ?? 'arcane';
      game.events.emit('cast', { def: s.def, rank: s.rank, slot: i, echo: false });
      if (this.stats.echo > 0 && Math.random() < this.stats.echo) this._echoCast(s, ctx);
    }

    // visuals: the hero rig reads facing / velocity / dash / invuln (heroes/index.js)
    this.castPulse = Math.max(0, this.castPulse - dt * 5);
    const sh = game.world.shrine;
    this.model.channel(game.state === 'shift' || !!(sh && sh.progress > 0 && sh.progress < 1 && Math.hypot(sh.pos.x - this.pos.x, sh.pos.z - this.pos.z) < 2.4));
    this.model.update(dt, { player: this, moving, dashing });
    HERO_FX.update(game, this, dt);
  }

  // Auto-cast target (design/playtest/round-3 contract C3). No live boss: exactly game.nearestEnemy.
  // Boss up: highest rank in skill range wins, ties by distance. Rank = e.autoPriority, else 3 for goal
  // adds (runners / torchbearers), 1 for fodder, 0 plain; the boss counts 0.5 (never when untargetable);
  // a Rift Crystal counts 2.5 while the boss stands inside its blast. Best rank 0 -> boss if in range,
  // else nearest. Runs once per range bucket per frame (cached; no allocations in the hot path).
  _autoTarget(range) {
    const game = this.game, boss = game.boss;
    if (!boss || boss.dead) return game.nearestEnemy(this.pos, range);
    const c = this._autoCache ??= { t: -1, n: 0, r: [0, 0, 0, 0, 0, 0], e: [null, null, null, null, null, null], tmp: [] };
    if (c.t !== game.time) { c.t = game.time; c.n = 0; }
    for (let i = 0; i < c.n; i++) {
      if (c.r[i] === range) { const e = c.e[i]; return e && e.dead ? (c.e[i] = this._pickAuto(range, boss, c)) : e; }
    }
    const e = this._pickAuto(range, boss, c);
    if (c.n < c.r.length) { c.r[c.n] = range; c.e[c.n++] = e; }
    return e;
  }

  _pickAuto(range, boss, c) {
    const px = this.pos.x, pz = this.pos.z, r2 = range * range;
    const bossOk = !boss.untargetable && boss.targetable !== false;
    const burstR = 4.5 + (boss.radius ?? 0);
    let best = null, bestRank = -1, bestD = Infinity;      // ranked picks
    let near = null, nearD = Infinity, bossIn = false;     // plain fallback
    const list = this.game.queryEnemies(this.pos, range, c.tmp);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz, d = dx * dx + dz * dz;
      if (d >= r2) continue;
      let rank;
      if (e === boss) {
        if (!bossOk) continue;
        bossIn = true; rank = 0.5;
      } else if (e.type === 'geode') {
        const bx = e.pos.x - boss.pos.x, bz = e.pos.z - boss.pos.z;
        if (!(bossOk && bx * bx + bz * bz <= burstR * burstR)) continue;
        rank = 2.5;
      } else {
        if (e.untargetable || e.targetable === false || (e.inert && !e.targetable)) continue;
        rank = e.autoPriority ?? (e.goal ? 3 : e.isFodder ? 1 : 0);
        if (rank <= 0) { if (d < nearD) { nearD = d; near = e; } continue; }
      }
      if (rank > bestRank || (rank === bestRank && d < bestD)) { bestRank = rank; bestD = d; best = e; }
    }
    if (best && bestRank > 0.5) return best;
    if (bossIn) return boss;
    return best ?? near;
  }

  // Death / victory pose after the run ended (game.js keeps calling this behind the end screen).
  updateEnd(dt) {
    this.vel.multiplyScalar(Math.exp(-8 * dt));
    this.model.update(dt, { player: this, moving: false, dashing: false });
  }

  // World points on the hero for spell visuals: the focus head (staff orb, brazier…) and the casting palm.
  muzzle(out) { return this.model.muzzle(out); }
  hand(out) { return this.model.hand(out); }

  _echoCast(s, ctx) {
    const game = this.game;
    let t = 0.12;
    game.addActor({
      update: (dt) => {
        t -= dt;
        if (t > 0) return true;
        if (!this.getSkill(s.def.id)) return false;
        s.def.cast(game, { ...ctx, origin: this.pos.clone() });
        game.events.emit('cast', { def: s.def, rank: s.rank, slot: s.slot, echo: true });
        return false;
      },
    });
  }

  dispose() {
    for (const off of this._offs) off();
    for (const { cleanup } of this._relicState.values()) cleanup?.();
    for (const s of this.skills) s.def.dispose?.(this.game, s.state);
    this.model.dispose();
  }
}

// Burning ground left by Flame Dash (gameplay; the look is HERO_FX.firePatch*).
class FirePatch {
  constructor(game, pos, r, life) {
    this.pos = pos.clone(); this.r = r; this.life = life; this.maxLife = life; this.tick = 0;
    HERO_FX.firePatchStart(game, this);
  }
  update(dt, game) {
    this.life -= dt; this.tick -= dt;
    HERO_FX.firePatchUpdate(game, this, dt);
    if (this.tick <= 0) {
      this.tick = 0.4;
      for (const e of game.queryEnemies(this.pos, this.r, _hits).slice()) damageEnemy(game, e, 4, { element: 'fire', silent: true });
    }
    return this.life > 0;
  }
  dispose(game) { HERO_FX.firePatchEnd(game, this); }
}

// Fitted to DESIGN §13: ~L5 at 1:00, L10 at the Act I boss, L18 by Act II's end, L27 at the Heart.
// L5-L11 ease from the early ramp into the main curve: it used to jump 48 -> 178 XP at L5,
// which left players stuck at L7 for over a minute (playtest round 1, #12).
export function xpForLevel(L) {
  if (L <= 4) return 8 + 10 * L;
  const main = Math.floor(25 + 28 * L + 0.55 * L * L);
  if (L >= 12) return main;
  const k = (L - 4) / 8;
  return Math.floor((48 + 40 * (L - 4)) * (1 - k) + main * k);
}
