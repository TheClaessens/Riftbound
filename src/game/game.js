import * as THREE from 'three';
import { Events } from '../core/events.js';
import { SpatialHash } from './spatial.js';
import { FX } from './fx.js';
import { VFX } from './vfx/index.js';
import { CreatureRenderer } from './creatures/renderer.js';
import { heroRenderer, HeroModel, HERO_ELEMENT } from './heroes/index.js';
import { Player } from './player.js';
import { Pickups } from './pickups.js';
import { World } from './world.js';
import { Spawner } from './spawner.js';
import { UI } from '../ui/ui.js';
import { Audio as GameAudio } from './audio.js';
import { rollCards, applyCard } from './progression.js';
import { rollRelics } from './relics.js';
import { ACTS, ACT_LENGTH, SHIFT_DURATION } from './acts.js';
import { loadMeta, saveMeta, recordRun, maxTierOf } from './meta.js';
import { Tutorial } from './tutorial.js';

export const CHAIN_WINDOW = 2.5;
const RESONANCE_CHAIN_WINDOW = 4;   // Arcanist: the Chain holds longer
const CHAIN_MILESTONES = [10, 25, 50];

// Game states: 'title' | 'playing' | 'levelup' | 'relic' | 'paused' | 'shift' | 'dead' | 'victory'
// Act phase (game.phase): 'horde' | 'boss' | 'shift'
export class Game {
  constructor(engine, input) {
    this.engine = engine;
    this.input = input;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.events = new Events();
    this.state = 'title';
    this.time = 0;              // total run time
    this.act = 0;               // 0..2
    this.actTime = 0;           // seconds into the current act
    this.phase = 'horde';
    this.tier = 0;
    this.timeScale = 1;
    this._slowmo = 0;
    this._hitStop = 0;
    this._hitStopCd = 0;
    this.autoCast = false;
    this.enemies = [];
    this.actors = [];
    this.boss = null;              // set by spawner while a boss is alive (HUD shows its bar)
    this.chain = 0;
    this._lastReactionT = -99;
    this.spatial = new SpatialHash(4);
    this.meta = loadMeta();
    this.codex = this.meta.codex;
    this.stats = freshStats();
    this.run = freshRun(this.meta);

    this.creatures = new CreatureRenderer(this.scene, this.camera, { renderOrder: 3 });   // after ground decals (1)
    this.heroes = heroRenderer(this.scene, this.camera);   // the player's rig (own renderer: survives creatures.clear())
    this.fx = new FX(this);
    this.vfx = new VFX(this);   // world-grounded spell VFX (src/game/vfx/): particles, debris, shells, decals, ribbons, clouds, status overlays
    this.world = new World(this);
    this.pickups = new Pickups(this);
    this.player = null;
    this.spawner = new Spawner(this);
    this.ui = new UI(this);
    this.audio = new GameAudio(this);
    this.tutorial = new Tutorial(this);
    this.engine.shakeScale = this.meta.shake ?? 1;

    this.pendingLevelUps = 0;
    this.pendingChests = 0;
    this.events.on('levelUp', () => { this.pendingLevelUps++; });
    this.events.on('playerHit', (e) => this._onPlayerHit(e));
    this.events.on('playerDied', () => this._end('dead'));
    this.events.on('bossSpawned', () => { if (this.phase === 'horde') this.phase = 'boss'; });
    this.events.on('bossKilled', () => this._onBossKilled());
    this.events.on('reaction', (e) => this._onReaction(e));
    this.events.on('fusion', (e) => { this._discover('fusions', e.def.id); this.stats.fusions.push(e.def.name); this.slowmo(0.8, 0.25); });
    this.events.on('relicGained', (e) => this._discover('relics', e.def.id));

    // idle title-screen camera position
    this.engine.follow(new THREE.Vector3(), 1);
    this.vfx.warmup();
  }

  get actDef() { return ACTS[this.act]; }
  get chainWindow() { return this.player?.traitId === 'resonance' ? RESONANCE_CHAIN_WINDOW : CHAIN_WINDOW; }

  // ------------------------------------------------------------------ lifecycle
  // opts: { classId, tier, player } (player: started from the menus by a person; scripted starts
  // such as sims and the promo renderer leave it off, which keeps the Rift Primer out of them)
  start(opts = {}) {
    this.hideShowcase();
    const classId = opts.classId ?? this.meta.lastClass ?? 'pyromancer';
    this.tier = Math.min(opts.tier ?? 0, maxTierOf(this.meta));
    this.meta.lastClass = classId; this.meta.lastTier = this.tier; saveMeta(this.meta);

    for (const e of this.enemies) e.dispose(this);
    for (const a of this.actors) a.dispose?.(this);
    this.enemies.length = 0;
    this.actors.length = 0;
    this.fx.clear();
    this.vfx.clear();
    this.creatures.clear();
    this.pickups.reset();
    this.player?.dispose();
    this.stats = freshStats();
    this.stats.classId = classId;
    this.stats.tier = this.tier;
    this.run = freshRun(this.meta);
    this.time = 0;
    this.act = 0;
    this.actTime = 0;
    this.phase = 'horde';
    this.timeScale = 1; this._slowmo = 0; this._hitStop = 0;
    this.boss = null;
    this.chain = 0; this._lastReactionT = -99;
    this.pendingLevelUps = 0;
    this.pendingChests = 0;
    this.world.setBiome?.(ACTS[0].id, true);
    this.player = new Player(this, classId);
    this.spawner.reset();
    this.world.reset?.();
    this.state = 'playing';
    this.events.emit('runStart', { classId, tier: this.tier, player: !!opts.player });
    this.events.emit('actStart', { act: 0, def: ACTS[0] });
  }

  _onPlayerHit({ amount, how, name }) {
    const h = this.stats.hurt;
    const b = h.by[name] ?? (h.by[name] = { dmg: 0, hits: 0, hows: {} });
    b.dmg += amount; b.hits++;
    if (how) b.hows[how] = (b.hows[how] ?? 0) + amount;
    h.recent.push({ name, how: how ?? null, dmg: amount, t: this.time, hp: Math.max(0, this.player?.hp ?? 0) });
    if (h.recent.length > RECENT_HITS) h.recent.shift();
    if (this.player && this.player.hp <= 0) h.killer = { name, how: how ?? null, dmg: amount };
  }

  _end(state) {
    if (this.state === 'dead' || this.state === 'victory') return;
    this.state = state;
    if (state === 'dead') this.player.model.die(); else this.player.model.victory();
    const s = this.stats;
    s.level = this.player.level;
    s.maxHp = this.player.stats.maxHp;   // death recap hp bars
    s.time = this.time;
    s.act = this.act;
    s.victory = state === 'victory';
    s.relics = this.player.relics.map((r) => r.name);
    const res = recordRun(this.meta, {
      kills: s.kills, actsReached: this.act + 1, bossesKilled: s.bossesKilled, maxChain: s.maxChain,
      victory: s.victory, tier: this.tier, wardenKilled: s.bossesKilled > 0,
    });
    s.shardsEarned = res.shards;
    s.unlocks = res.unlocks;
    s.tierUnlocked = res.tierUnlocked;
    s.totalShards = this.meta.shards;
    this.events.emit('runEnd', { victory: s.victory, stats: s });
    if (state === 'dead') this.ui.showGameOver(s);
    else this.ui.showVictory(s);
  }

  // Title screen: the selected class stands in the world behind the menus (victory → calm loop),
  // turned three-quarters toward the camera, with the camera zoomed in a little.
  showcase(classId) {
    if (this.state !== 'title' || !HERO_ELEMENT[classId]) return;
    if (this._show?.classId === classId) return;
    this._show?.model.dispose();
    const toCam = new THREE.Vector3(this.engine.isoOffset.x, 0, this.engine.isoOffset.z).normalize();
    const stub = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: toCam.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.45),
      slots: [], dash: { window: 0, dir: null, def: { dur: 0.1 } }, invuln: 0, game: this,
      frostArmor: 3, charge: 100, lastElement: HERO_ELEMENT[classId],
    };
    const model = new HeroModel(this, classId);
    model.hideRing = true;
    model.victory();
    this._show = { classId, model, stub, zoom: this._show?.zoom ?? this.engine.targetZoom };
    this.engine.targetZoom = 2.1;
  }

  hideShowcase() {
    if (!this._show) return;
    this._show.model.dispose();
    this.engine.targetZoom = this._show.zoom;
    this._show = null;
  }

  quitToTitle() {
    for (const e of this.enemies) e.dispose(this);
    for (const a of this.actors) a.dispose?.(this);
    this.enemies.length = 0; this.actors.length = 0;
    this.fx.clear(); this.vfx.clear(); this.pickups.reset();
    this.creatures.clear();
    this.player?.dispose(); this.player = null;
    this.boss = null;
    this.state = 'title';
    this.world.setBiome?.(ACTS[0].id, true);
    this.ui.showTitle?.();
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.ui.showPause(); }
    else if (this.state === 'paused') { this.state = 'playing'; this.ui.hidePause(); }
  }

  slowmo(duration, scale) { this._slowmo = duration; this.timeScale = scale; }

  // Freeze gameplay for a few frames on big impacts (rate-limited).
  hitStop(sec) {
    if (this._hitStopCd > 0 && sec < 0.08) return;
    this._hitStop = Math.max(this._hitStop, sec);
    this._hitStopCd = 0.25;
  }

  _discover(kind, id) {
    if (this.codex[kind].includes(id)) return;
    this.codex[kind].push(id);
    saveMeta(this.meta);
    this.events.emit('discovered', { kind, id });
  }

  _onReaction(e) {
    this._discover('reactions', e.type);
    const prev = this.chain;
    this.chain = this.time - this._lastReactionT <= this.chainWindow ? this.chain + 1 : 1;
    this._lastReactionT = this.time;
    if (this.chain > this.stats.maxChain) this.stats.maxChain = this.chain;
    for (const m of CHAIN_MILESTONES) if (prev < m && this.chain >= m) this.events.emit('chainMilestone', { chain: m });
  }

  // ------------------------------------------------------------------ acts
  _onBossKilled() {
    this.stats.bossesKilled++;
    this.boss = null;
    if (this.act >= ACTS.length - 1) { this._end('victory'); return; }
    this._beginShift();
  }

  _beginShift() {
    this.phase = 'shift';
    this.state = 'shift';
    this._shiftT = 0;
    this._shiftSwapped = false;
    this.hitStop(0.12);
    this.engine.pulse?.('shift');
    this.fx.shake(0.6, 'threat');
    this.fx.ring(this.player.pos, { color: 0xe0c4ff, radius: 40, life: 1.4, width: 0.05 });
    // the horde dissolves into XP
    for (const e of this.enemies) {
      if (e.dead || e.inert) continue;
      this.pickups.spawnXP(e.pos, e.xp ?? 1);
      this.fx.burst(e.pos, { color: e.deathColor ?? 0x9a7cff, count: 4, speed: 3, life: 0.5, size: 0.35, up: 1.5 });
      e.dead = true;
    }
    for (let i = this.actors.length - 1; i >= 0; i--) {
      if (this.actors[i].hostile) { this.actors[i].dispose?.(this); this.actors.splice(i, 1); }
    }
    this.pickups.magnetAll();
    for (const it of this.pickups.items) it.attracted = true; // the boss's Relic Chest flies to you
    this.events.emit('riftShift', { from: this.act, to: this.act + 1 });
  }

  _updateShift(dt) {
    this._shiftT += dt;
    if (!this._shiftSwapped && this._shiftT >= SHIFT_DURATION * 0.4) {
      this._shiftSwapped = true;
      this.world.setBiome?.(ACTS[this.act + 1].id, false);
    }
    if (this._shiftT >= SHIFT_DURATION) {
      this.act++;
      this.actTime = 0;
      this.phase = 'horde';
      this.state = 'playing';
      this.spawner.onActStart?.(this.act);
      this.events.emit('actStart', { act: this.act, def: ACTS[this.act] });
    }
  }

  // ------------------------------------------------------------------ queries
  addActor(a) { this.actors.push(a); return a; }
  addEnemy(e) { this.enemies.push(e); return e; }
  liveEnemyCount() { let n = 0; for (const e of this.enemies) if (!e.inert && !e.dead) n++; return n; }

  // NOTE: returns `out` (reused). Copy with .slice() if you will trigger more queries while iterating.
  queryEnemies(pos, radius, out = []) { return this.spatial.query(pos.x, pos.z, radius, out); }

  // Nearest live, non-inert enemy (auto-cast / homing never target world objects).
  nearestEnemy(pos, maxRange = Infinity, exclude = null) {
    let best = null, bd = maxRange * maxRange;
    const list = isFinite(maxRange) ? this.queryEnemies(pos, maxRange, this._nearTmp ??= []) : this.enemies;
    for (const e of list) {
      if (e.dead || e.inert || (exclude && exclude.has?.(e))) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------ frame
  update(realDt) {
    const input = this.input;
    if (input.pressed('Escape') || input.pressed('KeyP')) this.togglePause();
    if (input.pressed('KeyT') && this.state === 'playing') {
      this.autoCast = !this.autoCast;
      this.events.emit('autoCastChanged', { on: this.autoCast });
    }

    if (this._slowmo > 0) { this._slowmo -= realDt; if (this._slowmo <= 0) this.timeScale = 1; }
    if (this._hitStopCd > 0) this._hitStopCd -= realDt;
    let dt = realDt * this.timeScale;
    if (this._hitStop > 0) { this._hitStop -= realDt; dt = 0; }

    const active = this.state === 'playing' || this.state === 'shift';
    if (active && dt > 0) {
      this.time += dt;
      if (this.state === 'playing') {
        if (!this.tutorial.holdClock) this.actTime += dt;   // the Rift Primer holds the act clock
        this.spawner.update(dt);
      } else this._updateShift(dt);
      if (this.chain > 0 && this.time - this._lastReactionT > this.chainWindow) {
        this.events.emit('chainEnd', { chain: this.chain });
        this.chain = 0;
      }
      this.player.update(dt);
      this.events.emit('tick', { dt });

      this.spatial.clear();
      for (const e of this.enemies) if (!e.dead) this.spatial.insert(e);

      for (const e of this.enemies) if (!e.dead) e.update(dt, this);
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i];
        if (!a) continue; // the list can shrink mid-loop (Rift Shift clears hostile actors)
        if (a.update(dt, this) === false) {
          a.dispose?.(this);
          const j = this.actors.indexOf(a);
          if (j >= 0) this.actors.splice(j, 1);
        }
      }
      // remove dead enemies
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead) { e.dispose(this); this.enemies[i] = this.enemies[this.enemies.length - 1]; this.enemies.pop(); }
      }
      this.pickups.update(dt);
      this.world.update?.(dt, this.time);
      this.fx.update(dt);
      this.vfx.update(dt);
      this.creatures.update(dt, this.time);
      this.heroes.update(dt, this.time);

      if (this.state === 'playing') {
        if (this.pendingLevelUps > 0) this._openLevelUp();
        else if (this.pendingChests > 0) this._openChest();
      }
    } else if (active) {
      // hit-stop: freeze the simulation but keep texts / camera alive
      this.creatures.update(0, this.time);
      this.heroes.update(0, this.time);
      this.fx.updateTexts(0);
    } else {
      this.world.update?.(realDt * 0.3, this.time);
      this.creatures.update(0, this.time);
      // the hero keeps playing its death / victory pose behind the end screen
      const ending = this.player && (this.state === 'dead' || this.state === 'victory');
      if (ending) this.player.updateEnd(realDt);
      if (this._show && this.state === 'title') this._show.model.update(realDt, { player: this._show.stub, moving: false, dashing: false });
      this.heroes.update(ending || this._show ? realDt : 0, this.time);
      this.fx.updateTexts(0);
    }

    const followTarget = this.player ? this.player.pos : _origin;
    this.engine.follow(followTarget, realDt, input.wheel);
    this.engine.update?.(realDt, this);
    this.tutorial.update(realDt);
    this.ui.update(realDt);
  }

  // ------------------------------------------------------------------ level-up / chests
  _openLevelUp() {
    this.state = 'levelup';
    const run = this.run;
    let index = 1;                               // hand number inside this burst of level-ups
    const ctl = {
      get rerolls() { return run.rerolls; },
      get banishes() { return run.banishes; },
      // Both return a fresh set of cards (or null when not allowed). They act on the current hand only.
      reroll: () => { if (run.rerolls <= 0) return null; run.rerolls--; return rollCards(this, 3); },
      banish: (card) => {
        if (run.banishes <= 0 || card.type === 'heal') return null;
        run.banishes--; run.banished.add(card.id);
        return rollCards(this, 3);
      },
    };
    // Multi-pick: while level-ups are still queued the modal stays open and the next hand is dealt in
    // place (one ui.showLevelUp call per hand: the playtest adapter wraps it to offer decisions).
    const deal = () => {
      this.ui.showLevelUp(rollCards(this, 3), onPick, ctl, { index, total: index - 1 + this.pendingLevelUps });
    };
    const onPick = (card) => {
      applyCard(this, card);
      this.pendingLevelUps--;
      if (this.pendingLevelUps > 0 && this.state === 'levelup') { index++; deal(); return; }
      this.ui.hideLevelUp();
      this.state = 'playing';
    };
    deal();
  }

  // Called by pickups when a Relic Chest is collected.
  queueChest() { this.pendingChests++; }

  _openChest() {
    const relics = rollRelics(this, this.player.stats.chestChoices);
    if (!relics.length) { this.pendingChests--; this.player.heal(this.player.stats.maxHp * 0.5); return; }
    this.state = 'relic';
    this.events.emit('chestOpened', { relics });
    this.ui.showRelicPick(relics, (relic) => {
      this.player.addRelic(relic);
      this.pendingChests--;
      this.ui.hideRelicPick();
      this.state = 'playing';
    });
  }
}

const _origin = new THREE.Vector3();

// stats.hurt: the death recap's data (contract: design/playtest/round-1/NEXT.md §Death recap)
//   by:     { [sourceName]: { dmg, hits, hows: { [how]: dmg } } }   whole run
//   recent: [{ name, how, dmg, t, hp }]                             last RECENT_HITS hits, oldest first
//   killer: { name, how, dmg } | null                               the hit that ended the run
function freshStats() {
  return {
    kills: 0, damageDealt: 0, reactions: {}, fusions: [], level: 1, time: 0, maxChain: 0, bossesKilled: 0, act: 0,
    hurt: { by: {}, recent: [], killer: null },
  };
}
const RECENT_HITS = 8;
function freshRun(meta) {
  return { rerolls: 2 + (meta.attune.fortune ?? 0), banishes: 1 + (meta.attune.exile ?? 0), banished: new Set() };
}
