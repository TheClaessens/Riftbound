import * as THREE from 'three';
import { ACTS } from './acts.js';
import { createBoss } from './bosses.js';
import { createArenaWall, warmArenaWall } from './arena/wall.js';

// =====================================================================================
//  Encounter director (v5, design/RAID.md): turns a boss summon into an isolated raid encounter.
//    encounterStart payload: { bossId, act, arena, stakes, reason, entryHp: { hp, maxHp, pct } } (HP at the Seal)
//    summon(reason)  'timer' (spawner, 3:00) | 'haste' (Obelisk of Haste) | 'dev'
//    Seal 1.5 s (wall rises, horde reaped into XP, spawner/hazards/shrines off) → boss lands →
//    fight → [Echo: Rift Mend 3 s → Echo rises] → victory: wall sinks 2.4 s → bossKilled → Rift Shift.
//  Stakes (obelisks.js writes game.run.stakes): { echo, heat, affixes:[ids], bossHpMult, bossDmgMult,
//    chest: { extra, bossRelics }, echoChest: { pool:'boss', choices } } — all optional.
// =====================================================================================

export const ARENAS = {
  hollowWarden: { r: 20, zoom: 0.9 },
  vashkar: { r: 21, zoom: 0.88 },
  riftHeart: { r: 22, zoom: 0.85 },
};
const SEAL_TIME = 1.5;
const MEND_TIME = 3;
const VICTORY_TIME = 2.4;
const BOSS_SUB = {
  hollowWarden: 'The old king of the Thornwood wakes.',
  vashkar: 'The Warchief answers the war horns. Fire will not hurt him much.',
  riftHeart: 'Its scales drink the elements. Read its ward.',
};

export class Encounter {
  constructor(game) {
    this.game = game;
    this.reset();
    const ev = game.events;
    ev.on('enemyKilled', ({ enemy }) => { if (enemy?.boss && this.active) this._onBossDeath(enemy); });
    ev.on('runStart', () => this.reset());
    ev.on('runEnd', () => this._teardown());
    // Pre-compile this act's arena wall in the background under the real gameplay lighting state (a boot-time
    // warm compiled different program variants; measured 60-80 ms hitch at the Seal without this).
    this._warmed = new Set();
    ev.on('actStart', ({ def }) => {
      const id = def?.id;
      if (!id || this._warmed.has(id)) return;
      this._warmed.add(id);
      setTimeout(() => { try { warmArenaWall(game, id); } catch (e) { /* optional */ } }, 400);
    });
  }

  reset() {
    this._teardown();
    this.active = false;
    this.state = 'idle';           // 'idle' | 'seal' | 'fight' | 'mend' | 'victory'
    this.t = 0;
    this.arena = null;             // { center: Vector3, r, r0 } (live; world.collide reads it)
    this.bossId = null;
    this.reason = null;
    this.echoDone = false;
    this.fightTime = 0;
  }

  get stakes() { return this.game.run?.stakes ?? {}; }

  // Start the encounter for the current act. Returns false if one can't start now.
  summon(reason = 'timer') {
    const g = this.game;
    if (this.active || g.phase !== 'horde' || !g.player || g.player.dead) return false;
    const def = ACTS[g.act];
    const A = ARENAS[def.boss] ?? { r: 20, zoom: 0.9 };
    this.active = true;
    this.state = 'seal';
    this.t = 0;
    this.reason = reason;
    this.bossId = def.boss;
    this.echoDone = false;
    this.fightTime = 0;
    g.phase = 'boss';

    // arena centred on the player, kept inside the world circle
    const maxC = 55 - A.r - 2;
    const c = new THREE.Vector3(g.player.pos.x, 0, g.player.pos.z);
    const cl = Math.hypot(c.x, c.z);
    if (cl > maxC) c.multiplyScalar(maxC / cl);
    this.arena = { center: c, r: A.r, r0: A.r, zoom: A.zoom };
    g.world.setArena(this.arena);

    // reap: hostile actors vanish, the horde dissolves into XP that flies to you
    for (let i = g.actors.length - 1; i >= 0; i--) {
      if (g.actors[i].hostile) { g.actors[i].dispose?.(g); g.actors.splice(i, 1); }
    }
    for (const e of g.enemies) {
      if (e.dead || e.inert) continue;
      g.pickups.spawnXP(e.pos, e.xp ?? 1);
      g.fx.burst(e.pos, { color: e.deathColor ?? 0x9a7cff, count: 4, speed: 3, life: 0.5, size: 0.35, up: 1.5 });
      e.dead = true;
    }
    g.pickups.magnetAll();
    g.obelisks?.collapse?.();

    this.wall = createArenaWall(g, g.world.biomeId ?? def.id, c, A.r);
    this.wall.rise(SEAL_TIME);
    this._zoom0 = g.engine.targetZoom;
    g.fx.shake(0.4, 'threat');
    g.engine.pulse?.('shift');

    // Strain (Obelisk of Echo): +10% damage taken for the whole encounter
    if (this.stakes.echo) {
      g.player.addBuff('strain', 99999, { name: 'Strain', icon: 'strain', color: '#b08cff', apply: (s) => { s.dmgTaken *= 1.1; } });
    }
    // entryHp: the player's HP at the Seal (the death screen compares it to the HP they died with)
    const pl = g.player;
    const entryHp = { hp: pl.hp, maxHp: pl.stats.maxHp, pct: pl.stats.maxHp > 0 ? pl.hp / pl.stats.maxHp : 1 };
    g.events.emit('encounterStart', { bossId: this.bossId, act: g.act, arena: this.arena, stakes: this.stakes, reason, entryHp });
    return true;
  }

  // Level-up / chest modals wait during the Seal and the first 2.5 s after the landing (game.js).
  holdModals() {
    return this.active && (this.state === 'seal' || (this.state === 'fight' && this.t < 2.5));
  }

  // Animate the arena radius (Molten Tide, Floodfall). The wall follows.
  setArenaRadius(r, sec = 1.5) {
    if (!this.arena) return;
    this._rFrom = this.arena.r;
    this._rTo = r;
    this._rT = 0;
    this._rDur = Math.max(0.01, sec);
    this.wall?.setRadius(r, sec);
  }

  // Camera follow target during the encounter (game.js): biased toward the arena centre.
  cameraTarget(playerPos, out) {
    if (!this.arena || this.state === 'idle') return playerPos;
    return out.lerpVectors(playerPos, this.arena.center, 0.3);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    this.wall?.update(dt);
    if (this._rDur) {
      this._rT += dt;
      const k = Math.min(1, this._rT / this._rDur);
      this.arena.r = this._rFrom + (this._rTo - this._rFrom) * k * k * (3 - 2 * k);
      if (k >= 1) this._rDur = 0;
    }
    if (this.state !== 'victory') g.engine.targetZoom = this.arena.zoom;

    if (this.state === 'seal' && this.t >= SEAL_TIME) this._spawn(false);
    else if (this.state === 'fight') this.fightTime += dt;
    else if (this.state === 'mend' && this.t >= MEND_TIME) this._spawn(true);
    else if (this.state === 'victory' && this.t >= VICTORY_TIME) this._finish();
  }

  _spawn(echo) {
    const g = this.game;
    const def = ACTS[g.act];
    const st = this.stakes;
    const final = g.act === ACTS.length - 1;
    const c = this.arena.center, p = g.player.pos;
    // land 12 u from the player, toward (and past) the centre
    const d = new THREE.Vector3(c.x - p.x, 0, c.z - p.z);
    if (d.lengthSq() < 4) d.set(Math.sin(g.time), 0, Math.cos(g.time));
    d.normalize();
    const pos = echo && this._lastBossPos ? this._lastBossPos.clone() : p.clone().addScaledVector(d, 12);
    // the Echo fights in the full arena again (its own phases may shrink it: Molten Tide, Floodfall)
    if (echo && this.arena.r < this.arena.r0) this.setArenaRadius(this.arena.r0, 1.2);
    g.world.collide(pos, 2.5);
    const boss = createBoss(g, def.boss, pos, {
      hpMult: (1 + 0.3 * g.tier) * (st.bossHpMult ?? 1),
      damageScale: def.dmg * (1 + 0.12 * g.tier) * (st.bossDmgMult ?? 1),
      final, echo, affixes: [...(st.affixes ?? []), ...(echo && st.echoAffix ? [st.echoAffix] : [])],
      arena: this.arena,
    });
    boss.chestSpec = echo ? { pool: 'boss', choices: 3, ...(st.echoChest ?? {}) } : { extra: st.chest?.extra ?? 0, bossRelics: st.chest?.bossRelics ?? 0 };
    // an Echo fight only drops the Echo Chest; the first body's chest drops when it dies
    g.addEnemy(boss);
    g.boss = boss;
    this.state = 'fight';
    this.t = 0;
    g.events.emit('bossSpawned', { enemy: boss, final, echo });
    g.events.emit('announce', {
      kind: 'boss',
      text: echo ? `ECHO OF ${def.bossName.split(',')[0].toUpperCase()}` : def.bossName.toUpperCase(),
      sub: echo ? 'It returns. Weaker, faster, angrier.' : final ? 'Shatter the Heart to seal the Rift' : BOSS_SUB[def.boss],
      color: echo ? '#b08cff' : final ? '#ff4d5e' : def.color,
    });
  }

  _onBossDeath(enemy) {
    const g = this.game;
    g.boss = null;
    this._lastBossPos = enemy.pos.clone();
    g.stats.bossTimes = g.stats.bossTimes ?? [];
    g.stats.bossTimes.push({ act: g.act, id: enemy.id, echo: !!enemy.isEcho, t: Math.round(this.fightTime) });
    g.hitStop(0.12);
    g.slowmo(0.6, 0.3);
    if (this.stakes.echo && !this.echoDone) {
      // Rift Mend → the Echo rises
      this.echoDone = true;
      this.state = 'mend';
      this.t = 0;
      for (let i = g.actors.length - 1; i >= 0; i--) {
        if (g.actors[i].hostile) { g.actors[i].dispose?.(g); g.actors.splice(i, 1); }
      }
      const p = g.player;
      p.heal(p.stats.maxHp * 0.2);
      p.dash.charges = p.dash.max;
      g.events.emit('echoMend', { enemy, dur: MEND_TIME });
      g.events.emit('announce', { kind: 'boss', text: 'IT STIRS AGAIN', sub: 'Rift Mend: +20% HP, dash refilled', color: '#b08cff' });
      return;
    }
    this.state = 'victory';
    this.t = 0;
    this.wall?.sink(VICTORY_TIME);
    g.pickups.magnetAll();
    g.events.emit('encounterEnd', { victory: true, enemy, final: !!enemy.final, bossId: this.bossId });
    if (!enemy.final) g.events.emit('announce', { kind: 'bossDown', text: `${enemy.name.toUpperCase()} FALLS`, color: '#ffc340' });
    this._killed = enemy;
  }

  _finish() {
    const g = this.game;
    const enemy = this._killed;
    this._teardown();
    this.active = false;
    this.state = 'idle';
    for (const it of g.pickups.items) it.attracted = true;
    g.events.emit('bossKilled', { enemy, final: !!enemy?.final });
  }

  // Release the arena, camera and Strain (victory, run end, quit).
  _teardown() {
    const g = this.game;
    if (this.wall) { this.wall.dispose(); this.wall = null; }
    if (this.arena) g.world.setArena?.(null);
    this.arena = null;
    if (this._zoom0 !== undefined) { g.engine.targetZoom = this._zoom0; this._zoom0 = undefined; }
    if (g.player?.buffs?.has('strain')) { g.player.buffs.delete('strain'); g.player.recalcStats(); }
    this._killed = null;
    this._rDur = 0;
  }
}
