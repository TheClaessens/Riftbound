import * as THREE from 'three';
import { distXZ } from '../core/utils.js';
import { ACT_LENGTH, ACTS } from './acts.js';
import { AFFIXES, AFFIX_IDS } from './bosses/affixes.js';
import { xpForLevel } from './player.js';
import { rollRankCards, applyCard } from './progression.js';
import { ShardVisual } from './shard/model.js';

// =====================================================================================
//  The Crownshard (v6): the player-controlled risk / reward layer for summoning a boss.
//  Design: design/SHARD_PASSES.md. Contract: design/SHARD.md. Payout numbers: design/RAID_PASSES.md
//  Pass 1 + research/13 (unchanged since v5.2). File / property name (`game.obelisks`) kept from v5.
//
//  One shard of the Prism Crown stands at the world origin every act. Dormant until 0:50, then it wakes.
//  Press F in range to commune: the game pauses on the Pact screen (src/ui/pact.js) and the player
//  seals pacts — Echo, Wrath heat 1–3, and/or Haste ("call it now"). Sealing anything new (without
//  Haste) makes the Rift answer: a burst of foes around the shard plus a Rift Pull. Costs attach to the
//  ENCOUNTER (game.run.stakes, read by encounter.js), never to the clock. When the encounter starts the
//  shard ascends and is gone for the rest of the act.
// =====================================================================================

export const SHARD_WAKE_AT = 50;              // seconds into the act
export const SHARD_POS = new THREE.Vector3(0, 0, 0);
export const PLAYER_START = new THREE.Vector3(4.5, 0, 4.5);
export const COMMUNE_R = 4.5;
const BODY_R = 1.6;                           // collision circle of the standing shard
const WAKE_T = 1.8, CALL_T = 3, ASCEND_T = 1.4;
const ANSWER_DELAY = 0.8;                     // the flare before the horde answers
export const ANSWER_PER_LEVEL = 6;            // foes per newly sealed stake level
export const PULL_PER_LEVEL = 4;              // s of Rift Pull per newly sealed stake level
const ANSWER_R0 = 11, ANSWER_R1 = 15;
const CAM_LEAN = 0.4, CAM_LEAN_R = 14;       // camera leans up to 40% toward the shard inside 14 u
const GRADE_PACT ={ saturation: 0.32, tint: [0.92, 0.9, 1.08], vignette: 0.42 };

// Payout tables (research/13 §4)
export const XP_BUDGET = [1100, 4000, 7100];  // XP an act yields by its boss (default path)
export const XP_BEFORE = [0, 1100, 5100];     // cumulative XP carried into each act
export const ACT_MULT = [1, 1.5, 2];
const WINDFALL = 0.4;                           // share of the XP still ahead
const ECHO_SHARDS = 25;                       // × ACT_MULT -> 25 / 38 / 50
const WRATH_SHARDS = [0, 8, 20, 45];          // total at heat N, × ACT_MULT
const PERK_SHARDS = 20;                       // final act: the run ends at the kill, so each chest / Cache perk pays this instead
const BOUNTY_PER_S = 0.25;
const F_TABLE = [[0, 0], [60, 0.23], [90, 0.38], [120, 0.56], [150, 0.77], [ACT_LENGTH, 1]];

// F(t): fraction of an act's XP collected by actTime t (piecewise linear through research/13's table).
export function xpFraction(t) {
  if (t <= 0) return 0;
  for (let i = 1; i < F_TABLE.length; i++) {
    if (t <= F_TABLE[i][0]) {
      const [t0, f0] = F_TABLE[i - 1], [t1, f1] = F_TABLE[i];
      return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
    }
  }
  return 1;
}
// Level reached with `cum` cumulative XP (no multipliers).
export function levelAtXP(cum) {
  let L = 1;
  while (cum >= xpForLevel(L) && L < 60) { cum -= xpForLevel(L); L++; }
  return L;
}

// Pact identity (colour + icon + name; never colour alone). Icon ids kept from v5.
export const OBELISK_TYPES = {
  haste: { id: 'haste', name: 'Pact of Haste', title: 'Haste', tag: 'Call the boss now', color: '#bfefff', hex: 0xbfefff, icon: 'obeliskHaste', fallback: '»' },
  echo: { id: 'echo', name: 'Pact of Echo', title: 'Echo', tag: 'The boss comes twice', color: '#b08cff', hex: 0xa88cff, accent: 0x4ff0d0, icon: 'obeliskEcho', fallback: '◈' },
  wrath: { id: 'wrath', name: 'Pact of Wrath', title: 'Wrath', tag: 'Feed it Heat', color: '#ff7a33', hex: 0xff7a33, icon: 'obeliskWrath', fallback: '♨' },
};
export const PACT_TYPES = OBELISK_TYPES;

export const freshStakes = () => ({
  haste: null, echo: false, heat: 0, affixes: [], bossHpMult: 1, bossDmgMult: 1,
  chest: { extra: 0, bossRelics: 0 }, echoChest: null, echoAffix: null, wrathCache: false,
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ the director

export class Obelisks {
  constructor(game) {
    this.game = game;
    this.shard = null;            // { pos, state, k, t, near, wakeAt, wakeIn, usable, vis, obstacle, queue[3] }
    this._S = { state: 'dormant', k: 0, near: 0, sealed: { echo: false, heat: 0, haste: false }, draft: null, answer: 0, wakeIn: 0 };
    this._cachePending = false;
    this._hasteT = 0;
    this._answerT = 0;            // > 0: the flare is running, the horde answers when it ends
    this._answerLevels = 0;
    this._pullT = 0;              // > 0: horde spawns converge on the shard
    this._answerK = 0;
    this._payout = { haste: 0, echo: 0, wrath: 0 };
    this._time = 0;
    this._grade0 = null;
    if (game.run) game.run.stakes = freshStakes();

    const ev = game.events;
    ev.on('runStart', () => this.reset());
    ev.on('actStart', () => this._newAct());
    ev.on('encounterStart', (e) => this._onEncounterStart(e));
    ev.on('encounterEnd', (e) => { if (e?.victory) this._onEncounterEnd(); });
  }

  get stakes() {
    const run = this.game.run;
    return run.stakes ??= freshStakes();
  }

  // v5 compatibility: the HUD / sim used to read a list of three obelisks.
  get list() { return []; }

  // ------------------------------------------------------------------ lifecycle

  reset() {
    this._clear();
    this._resetTimers();
    this._cachePending = false;
    if (this.game.run) this.game.run.stakes = freshStakes();
  }

  _resetTimers() {
    this._hasteT = 0; this._answerT = 0; this._answerLevels = 0; this._pullT = 0; this._answerK = 0;
    this._payout = { haste: 0, echo: 0, wrath: 0 };
  }

  _newAct() {
    const g = this.game;
    this._clear();
    this._resetTimers();
    g.run.stakes = freshStakes();
    // Wrath's affixes are rolled now and shown on the Pact screen before any seal (no duplicates, no re-rolls).
    const ids = AFFIX_IDS.slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const s = this.shard = {
      pos: SHARD_POS.clone(), state: 'dormant', k: 0, t: 0, near: 0, wakeAt: SHARD_WAKE_AT, wakeIn: SHARD_WAKE_AT,
      usable: false, vis: null, obstacle: null, queue: ids.slice(0, 3),
    };
    s.obstacle = { x: s.pos.x, z: s.pos.z, r: BODY_R, obelisk: true };
    g.world.obstacles.push(s.obstacle);
    g.world._env?.setClearing?.(1, s.pos.x, s.pos.z, COMMUNE_R + 1.6, 1);
    s.vis = new ShardVisual(g, s.pos, g.act);
    // acts II–III: the Rift Shift already moved the player while the screen was white (game.js); dev jumps did not
    if (g.act === 0 || (g.player && distXZ(g.player.pos, PLAYER_START) > 12)) this.placePlayer();
    this._syncS();
  }

  // Every act starts at the shard, camera side (design/SHARD.md §2).
  placePlayer() {
    const g = this.game, p = g.player;
    if (!p) return;
    p.pos.set(PLAYER_START.x, 0, PLAYER_START.z);
    g.engine.camTarget?.set(PLAYER_START.x, 0, PLAYER_START.z);
  }

  // Camera follow target (game.js): near the shard the camera leans toward it so the whole tine stays in frame.
  cameraTarget(playerPos, out) {
    const s = this.shard;
    if (!s || s.state === 'ascending' || s.state === 'gone') return playerPos;
    const d = distXZ(playerPos, s.pos);
    if (d >= CAM_LEAN_R) return playerPos;
    return out.lerpVectors(playerPos, s.pos, CAM_LEAN * (1 - d / CAM_LEAN_R));
  }

  _clear() {
    const s = this.shard;
    if (!s) return;
    this._removeObstacle();
    s.vis?.dispose();
    this.game.world?._env?.setClearing?.(1, 0, 0, 0, 0);
    this.shard = null;
    this._setGrade(false);
  }

  _removeObstacle() {
    const s = this.shard;
    if (!s?.obstacle) return;
    const obs = this.game.world?.obstacles;
    const i = obs ? obs.indexOf(s.obstacle) : -1;
    if (i >= 0) obs.splice(i, 1);
    s.obstacle = null;
  }

  // Encounter started (timer, Haste, dev): the shard ascends into its column and is gone for the act.
  collapse() {
    const s = this.shard;
    this._hasteT = 0; this._answerT = 0; this._pullT = 0;
    if (!s || s.state === 'ascending' || s.state === 'gone') return;
    if (this.game.state === 'pact') this._close(false, false);
    this._removeObstacle();
    s.state = 'ascending'; s.t = 0; s.k = 0; s.usable = false;
    s.vis?.burst('ascend');
    this.game.events.emit('shardAscend', {});
  }

  // Rift Pull (spawner): while the Rift answers a pact, packs converge on the shard.
  pullCenter() {
    return this._pullT > 0 && this.shard ? this.shard.pos : null;
  }

  // ------------------------------------------------------------------ frame

  // true during Haste's 3 s warning (spawner holds its beats)
  get summoning() { return this._hasteT > 0; }

  canCommune() {
    const g = this.game, s = this.shard, p = g.player;
    return !!(s && s.usable && s.state === 'open' && g.state === 'playing' && g.phase === 'horde' && !g.encounter?.active
      && p && !p.dead && !(p.dash?.t > 0) && this._hasteT <= 0 && distXZ(p.pos, s.pos) <= COMMUNE_R);
  }

  update(dt) {
    const g = this.game, s = this.shard, p = g.player;
    this._time += dt;
    if (!s || !p) return;
    s.t += dt;

    if (s.state === 'dormant') {
      s.wakeIn = Math.max(0, s.wakeAt - g.actTime);
      if (g.actTime >= s.wakeAt && g.phase === 'horde' && !g.encounter?.active && !p.dead) this._wake();
    } else if (s.state === 'waking') {
      s.k = clamp01(s.t / WAKE_T);
      if (s.k >= 1) { s.state = 'open'; s.t = 0; s.k = 0; s.usable = true; }
    } else if (s.state === 'calling') {
      s.k = clamp01(1 - this._hasteT / CALL_T);
    } else if (s.state === 'ascending') {
      s.k = clamp01(s.t / ASCEND_T);
      if (s.k >= 1) { s.state = 'gone'; s.k = 0; }
    }

    if (this._hasteT > 0) {
      this._hasteT -= dt;
      if (this._hasteT <= 0) { this._hasteT = 0; this._summonHaste(); }
    }
    if (this._answerT > 0) {
      this._answerT -= dt;
      if (this._answerT <= 0) { this._answerT = 0; this._answer(); }
    }
    if (this._pullT > 0) this._pullT = Math.max(0, this._pullT - dt);
    this._answerK = this._answerT > 0 ? clamp01(1 - this._answerT / ANSWER_DELAY) : Math.max(0, this._answerK - dt * 0.8);

    // F: commune (the prompt is drawn by the HUD from canCommune())
    if (g.input?.pressed('KeyF') && this.canCommune()) this.commune();

    // Wrath Cache: opened late in the victory beat (after the score's resolution), never in the final act
    if (this._cachePending && g.state === 'playing') {
      const E = g.encounter;
      if ((E.state === 'victory' && E.t >= 1.6) || (!E.active && E.state === 'idle')) this._openCache();
    }
    this._animate(dt, this._time);
  }

  // While the game is paused on the Pact screen (game.js calls this with the real dt): the shard keeps turning.
  updatePaused(realDt) {
    this._time += realDt;
    this._animate(realDt, this._time);
  }

  _syncS() {
    const s = this.shard, S = this._S, st = this.stakes;
    if (!s) return S;
    S.state = this.game.state === 'pact' && s.state === 'open' ? 'communing' : s.state;
    S.k = s.k;
    S.wakeIn = s.wakeIn;
    S.sealed.echo = !!st.echo; S.sealed.heat = st.heat ?? 0; S.sealed.haste = !!st.haste || this._hasteT > 0;
    S.answer = this._answerK;
    return S;
  }

  _animate(dt, time) {
    const s = this.shard;
    if (!s?.vis) return;
    const p = this.game.player;
    const inRange = !!p && (s.state === 'open' || this.game.state === 'pact') && distXZ(p.pos, s.pos) <= COMMUNE_R;
    s.near += ((inRange ? 1 : 0) - s.near) * Math.min(1, dt * 6);
    this._S.near = s.near;
    s.vis.update(dt, time, this._syncS());
  }

  _wake() {
    const s = this.shard, g = this.game;
    s.state = 'waking'; s.t = 0; s.k = 0; s.wakeIn = 0;
    s.vis?.burst('wake');
    g.events.emit('shardWake', { pos: s.pos });
    g.events.emit('announce', { kind: 'obelisk', text: 'THE CROWNSHARD WAKES', sub: 'Press F beside it to strike a pact. Time stops while you choose.', color: '#e0c4ff' });
  }

  // ------------------------------------------------------------------ the Pact screen

  commune() {
    const g = this.game;
    if (!this.canCommune()) return false;
    g.state = 'pact';
    this._S.draft = { echo: !!this.stakes.echo, heat: this.stakes.heat ?? 0, haste: false };
    this._setGrade(true);
    g.ui.showPact?.(this.pactView(), {
      onSeal: (d) => this.sealPact({ ...d, haste: false }),
      onCall: (d) => this.sealPact({ ...d, haste: true }),
      onLeave: () => this.closePact(),
      onDraft: (d) => this.setDraft(d),
    });
    g.events.emit('pactOpen', {});
    return true;
  }

  setDraft(d) { this._S.draft = d ? { echo: !!d.echo, heat: d.heat | 0, haste: !!d.haste } : null; }

  closePact() { if (this.game.state === 'pact') this._close(false, false); }

  _close(sealed, haste) {
    const g = this.game;
    if (g.state !== 'pact') return;   // bots seal without opening the screen
    g.ui.hidePact?.();
    this._S.draft = null;
    this._setGrade(false);
    g.state = 'playing';
    // the key that closed the screen must not also open the pause menu / cast on the resumed frame
    g.input?.justPressed?.delete('Escape');
    g.input?.justPressed?.delete('KeyF');
    g.events.emit('pactClose', { sealed, haste });
  }

  _setGrade(on) {
    const e = this.game.engine;
    if (!e?.setGrade) return;
    if (on) {
      if (!this._grade0) this._grade0 = { ...e._g, tint: e._g.tint.slice() };
      e.setGrade(GRADE_PACT, 0.35);
    } else if (this._grade0) {
      e.setGrade(this._grade0, 0.3);
      this._grade0 = null;
    }
  }

  // New stake levels a draft would add (never lowers what is sealed).
  _newLevels(d = {}) {
    const st = this.stakes;
    const echo = d.echo && !st.echo ? 1 : 0;
    const heat = Math.max(0, Math.min(3, d.heat | 0) - (st.heat ?? 0));
    return { echo, heat, levels: echo + heat };
  }

  answerPreview(d = {}) {
    const n = this._newLevels(d).levels;
    if (d.haste) return { levels: n, foes: 0, seconds: 0 };
    return { levels: n, foes: n * ANSWER_PER_LEVEL, seconds: n * PULL_PER_LEVEL };
  }

  pactView() {
    const g = this.game, st = this.stakes, p = g.player;
    const queue = this.shard?.queue ?? AFFIX_IDS.slice(0, 3);
    return {
      act: g.act,
      bossName: ACTS[g.act]?.bossName ?? 'The boss',
      timeLeft: Math.max(0, ACT_LENGTH - g.actTime),
      lowHp: !!p && p.stats.maxHp > 0 && p.hp / p.stats.maxHp < 0.4,
      sealed: { echo: !!st.echo, heat: st.heat ?? 0 },
      affixes: queue.map((id) => AFFIXES[id]),
      haste: this.preview('haste'),
      echo: this.preview('echo'),
      wrath: [null, this.preview('wrath', 1), this.preview('wrath', 2), this.preview('wrath', 3)],
      answerPerLevel: ANSWER_PER_LEVEL,
      pullPerLevel: PULL_PER_LEVEL,
    };
  }

  // Seal what is new in the draft; haste: also call the boss (3 s). Returns { levels, haste }.
  sealPact(d = {}) {
    const g = this.game, s = this.shard;
    if (!s || !s.usable || g.encounter?.active || g.phase !== 'horde') { this.closePact(); return { levels: 0, haste: false }; }
    const st = this.stakes, mult = ACT_MULT[g.act] ?? 1, final = g.act >= 2;
    const { echo, heat, levels } = this._newLevels(d);
    const fx = g.fx;

    if (echo) {
      st.echo = true;
      st.echoChest = { pool: 'boss', choices: 3 };
      this._payout.echo = Math.round(ECHO_SHARDS * mult) + (final ? PERK_SHARDS : 0);
      s.vis?.burst('seal-echo');
      g.events.emit('obeliskArmed', { type: 'echo', heat: 0, affix: null });
    }
    for (let i = 0; i < heat; i++) {
      const h = (st.heat ?? 0) + 1;
      const id = s.queue[h - 1];
      st.heat = h;
      st.affixes.push(id);
      if (h === 1) st.chest.extra += 1;
      if (h >= 2) { st.bossHpMult = h >= 3 ? 1.3 : 1.15; st.wrathCache = true; }
      if (h >= 3) { st.bossDmgMult = 1.1; st.chest.bossRelics = 1; }
      g.events.emit('obeliskArmed', { type: 'wrath', heat: h, affix: id });
    }
    if (heat) { this._payout.wrath = this._wrathShards(st.heat); s.vis?.burst('seal-wrath'); }

    const parts = [];
    if (echo) parts.push('Echo');
    if (heat) parts.push(`Wrath ${'I'.repeat(st.heat)}`);

    if (d.haste) {
      this._close(true, true);
      s.state = 'calling'; s.t = 0; s.k = 0; s.usable = false;
      this._hasteT = CALL_T;
      s.vis?.burst('seal-haste');
      fx.shake(0.3);
      g.events.emit('obeliskArmed', { type: 'haste', heat: 0, affix: null });
      g.events.emit('announce', { kind: 'obelisk', text: 'THE SHARD CALLS', sub: `${ACTS[g.act]?.bossName ?? 'The boss'} comes in 3 seconds${parts.length ? ` · ${parts.join(' · ')}` : ''}`, color: '#bfefff' });
      return { levels, haste: true };
    }

    this._close(levels > 0, false);
    if (levels > 0) {
      this._answerLevels += levels;
      this._answerT = ANSWER_DELAY;
      this._pullT = Math.max(this._pullT, ANSWER_DELAY + levels * PULL_PER_LEVEL);
      fx.shake(0.25);
      const aff = heat ? AFFIXES[st.affixes[st.affixes.length - 1]] : null;
      g.events.emit('announce', { kind: 'obelisk', text: 'PACT SEALED', sub: `${parts.join(' · ')}${aff ? ` (${aff.name})` : ''} — the horde answers`, color: heat ? '#ff7a33' : '#b08cff' });
    }
    return { levels, haste: false };
  }

  // The horde answers: packs burst out of the Rift around the shard (the Pull keeps more coming).
  _answer() {
    const g = this.game, s = this.shard;
    const n = this._answerLevels * ANSWER_PER_LEVEL;
    this._answerLevels = 0;
    if (!s || n <= 0 || g.encounter?.active || g.phase !== 'horde') return;
    s.vis?.burst('answer');
    const spawned = g.spawner.spawnAround?.(s.pos, n, ANSWER_R0, ANSWER_R1) ?? 0;
    g.events.emit('riftAnswer', { pos: s.pos, foes: spawned, seconds: this._pullT });
  }

  // Wrath total at `heat` (x act mult). Final act: each heat's chest / Cache perk becomes PERK_SHARDS (the run ends at the kill).
  _wrathShards(heat, act = this.game.act) {
    return Math.round(WRATH_SHARDS[heat] * (ACT_MULT[act] ?? 1)) + (act >= 2 ? PERK_SHARDS * heat : 0);
  }

  _summonHaste() {
    const g = this.game, st = this.stakes;
    const skipped = Math.max(0, Math.round(ACT_LENGTH - g.actTime));
    st.haste = { at: Math.round(g.actTime), skipped };
    if (!g.encounter.summon('haste')) {
      st.haste = null;
      // could not start (e.g. the player died during the call): the shard settles back
      const s = this.shard;
      if (s && s.state === 'calling') { s.state = 'open'; s.usable = true; s.k = 0; }
    }
  }

  // ------------------------------------------------------------------ payouts

  _hasteMath(t = this.game.actTime, act = this.game.act) {
    const B = XP_BUDGET[act] ?? 1100, base = XP_BEFORE[act] ?? 0, F = xpFraction(t);
    const ahead = B * (1 - F), windfall = Math.round(WINDFALL * ahead);
    const Lend = levelAtXP(base + B), Lnow = levelAtXP(base + B * F), Lhaste = levelAtXP(base + B * F + windfall);
    return { skipped: Math.max(0, Math.round(ACT_LENGTH - t)), ahead: Math.round(ahead), windfall, levelsSkipped: Lend - Lnow, levelsBack: Lhaste - Lnow, levelsDelta: Lhaste - Lend };
  }

  _onEncounterStart({ reason } = {}) {
    const g = this.game, st = this.stakes;
    this.collapse();
    if (reason === 'haste' && st.haste) {
      const mult = ACT_MULT[g.act] ?? 1;
      const m = this._hasteMath(ACT_LENGTH - st.haste.skipped, g.act);
      st.chest.extra += 1;                                                    // Quick Chest: 4 relics instead of 3
      // Haste bonus shards (paid on victory); none in the final act
      this._payout.haste = g.act >= 2 ? 0 : Math.round(BOUNTY_PER_S * st.haste.skipped * mult);
      // Windfall XP: a burst of gems that flies straight to the player (level-up hands follow)
      const n = 6;
      for (let i = 0; i < n; i++) g.pickups.spawnXP(g.player.pos, m.windfall / n);
      g.pickups.magnetAll();
      g.fx.text(g.player.pos, `+${m.windfall} XP`, '#bfefff', true);
      st.haste.windfall = m.windfall;
    }
  }

  _onEncounterEnd() {
    const g = this.game, st = this.stakes;
    const parts = { ...this._payout };
    const total = parts.haste + parts.echo + parts.wrath;
    if (total > 0) {
      g.stats.obeliskShards = (g.stats.obeliskShards ?? 0) + total;
      const lines = [];
      if (parts.haste) lines.push({ type: 'haste', text: `Haste bonus +${parts.haste}`, shards: parts.haste });
      if (parts.echo) lines.push({ type: 'echo', text: `Echo bonus +${parts.echo}`, shards: parts.echo });
      if (parts.wrath) lines.push({ type: 'wrath', text: `Wrath bonus +${parts.wrath}`, shards: parts.wrath });
      g.events.emit('obeliskPayout', { shards: total, parts, lines });
    }
    this._payout = { haste: 0, echo: 0, wrath: 0 };
    if (st.wrathCache && g.act < 2) this._cachePending = true;
  }

  _openCache() {
    const g = this.game;
    this._cachePending = false;
    const cards = rollRankCards(g, 3);
    g.state = 'levelup';
    g.ui.levelUpTip = 'Wrath Cache: +1 rank to a skill you own.';
    g.ui.showLevelUp(cards, (card) => {
      applyCard(g, card);
      g.ui.hideLevelUp();
      g.state = 'playing';
      g.events.emit('wrathCache', { card });
    }, { rerolls: 0, banishes: 0 }, { index: 1, total: 1, title: 'WRATH CACHE' });
  }

  // ------------------------------------------------------------------ previews (Pact screen)

  // { title, tag, cost: [lines], pay: [lines], ... } — computed live from the act clock and the stakes.
  // wrath: `heat` = the level this preview is for (1..3).
  preview(type, heat = 1) {
    const g = this.game, mult = ACT_MULT[g.act] ?? 1, t = g.actTime, final = g.act >= 2;
    const def = OBELISK_TYPES[type];
    if (!def) return null;
    const WIN = 'Paid only if you win the boss fight';
    const perk = (txt) => (final ? `${txt}: becomes ≈ +${PERK_SHARDS} shards (the run ends at the kill)` : txt);
    if (type === 'haste') {
      const m = this._hasteMath();
      const beats = [t < 90 ? 'Elite Surge' : null, t < 135 ? 'Swarm' : null].filter(Boolean);
      const net = Math.abs(m.levelsDelta);
      const p = g.player;
      const lowHp = !!p && p.stats.maxHp > 0 && p.hp / p.stats.maxHp < 0.4;
      return {
        title: def.name, tag: def.tag, levelsDelta: m.levelsDelta, skipped: m.skipped, windfall: m.windfall, lowHp,
        cost: [
          m.skipped > 8 ? `Skips ${m.skipped} s of horde${beats.length ? ` (${beats.join(', ')})` : ''}` : 'Skips almost nothing',
          net > 0 ? `≈ net −${net} level${net === 1 ? '' : 's'} by the boss` : '≈ no levels lost by the boss',
          ...(lowHp ? ['Low HP: the boss arrives now'] : []),
        ],
        pay: [
          `+${m.windfall} XP right away`,
          final ? 'No shard bounty in the final act' : `≈ +${Math.round(BOUNTY_PER_S * m.skipped * mult)} shards`,
          ...(final ? [] : ['Boss chest: choose from 4 relics instead of 3']),
          WIN,
        ],
      };
    }
    if (type === 'echo') {
      return {
        title: def.name, tag: def.tag,
        cost: ['You take +10% damage for the whole fight', 'The boss rises again as an Echo (55% HP, starts at Phase 2)'],
        pay: [
          'Before the Echo: heal 20% and refill your dash',
          perk('Echo Chest: pick 1 of 3 Boss Relics'),
          `≈ +${Math.round(ECHO_SHARDS * mult) + (final ? PERK_SHARDS : 0)} shards`,
          WIN,
        ],
      };
    }
    const h = Math.max(1, Math.min(3, heat | 0));
    const queue = this.shard?.queue ?? AFFIX_IDS.slice(0, 3);
    const aff = AFFIXES[queue[h - 1]];
    const perkLine = h === 1 ? 'Boss chest: choose from 4 relics instead of 3' : h === 2 ? 'Wrath Cache: +1 rank to a skill you own' : 'Boss chest: one of the choices is a Boss Relic';
    return {
      title: def.name, tag: def.tag, heat: h, nextAffix: aff,
      cost: [
        `Boss gets harder: ${aff.name} (${aff.desc})`,
        ...(h === 2 ? ['Boss HP +15%'] : h === 3 ? ['Boss HP +30%, damage +10%'] : []),
      ],
      pay: [
        perk(perkLine),
        `≈ ${this._wrathShards(h)} shards in total at Heat ${h}`,
        WIN,
      ],
    };
  }

  // ------------------------------------------------------------------ dev
  // Force a state for screenshots: devState('open') | ('calling', 0.5) | ('dormant') ...
  devState(state, k = 0) {
    const s = this.shard;
    if (!s) return;
    s.state = state; s.k = k; s.t = 0; s.usable = state === 'open';
  }
}
