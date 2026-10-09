// =====================================================================================
//  Balance simulation harness (dev only). From the browser console:
//    const { runSim } = await import('/src/dev/sim.js');
//    await runSim({ classId: 'pyromancer', seconds: 700 });
//  A kiting bot plays with auto-cast; it drafts toward fusions and records a timeline.
// =====================================================================================
import { FUSIONS } from '../game/skills/registry.js';

const DT = 1 / 30;

// ---- Rift Obelisk lanes (v5). runSim({ obelisks: ['haste@90', 'echo', 'wrath:2'] }):
//   'echo' | 'wrath' (heat 1) | 'wrath:N' (heat N, 1..3) | 'haste' (at 2:00) | 'haste@S' (at actTime S seconds).
// Every act the bot walks to and channels the listed obelisks (Haste last, once its time has come).
export function parseObelisks(list = []) {
  const out = [];
  for (const s of list) {
    const m = /^(haste|echo|wrath)(?::(\d))?(?:@(\d+))?$/.exec(String(s).trim());
    if (!m) throw new Error('bad obelisk spec: ' + s);
    out.push({ type: m[1], heat: Math.min(3, +(m[2] ?? 1)), at: m[3] !== undefined ? +m[3] : m[1] === 'haste' ? 120 : 0 });
  }
  return out;
}
function obeliskTarget(game, plan) {
  const L = game.obelisks?.list;
  if (!plan?.length || !L?.length || game.encounter?.active || game.phase !== 'horde') return null;
  const t = game.actTime;
  const live = (type) => L.find((o) => o.type === type && (o.state === 'idle' || o.state === 'channel'));
  const haste = plan.find((s) => s.type === 'haste');
  if (haste && t >= haste.at) { const o = live('haste'); if (o) return o; }
  for (const s of plan) {
    if (s.type === 'haste') continue;
    const o = live(s.type);
    if (!o || (s.type === 'echo' && o.armed) || (s.type === 'wrath' && o.heat >= s.heat)) continue;
    return o;
  }
  return null;
}

const _cand = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
function botSteer(game, plan = null) {
  const p = game.player;
  let ax = 0, az = 0, threat = 0;
  for (const e of game.queryEnemies(p.pos, 9, [])) {
    if (e.inert || e.dead) continue;
    const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
    const d2 = Math.max(0.5, dx * dx + dz * dz);
    const w = (e.boss ? 6 : 1) / d2;
    ax += dx * w; az += dz * w; threat += w;
  }
  for (const a of game.actors) {
    if (!a.hostile || !a.pos) continue;
    const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 9) { ax += dx * 3 / Math.max(0.3, d2); az += dz * 3 / Math.max(0.3, d2); threat += 1; }
  }
  // tangential drift so the bot circles instead of running into walls
  const tx = -az, tz = ax;
  let mx = ax + tx * 0.6, mz = az + tz * 0.6;
  // pull back toward the centre near the edges
  const r = Math.hypot(p.pos.x, p.pos.z);
  const ob = obeliskTarget(game, plan);
  if (r > 30 && !(ob && r < 46)) { mx -= p.pos.x / r * (r - 30) * 0.6; mz -= p.pos.z / r * (r - 30) * 0.6; }
  // orbit the boss at casting range instead of fleeing it
  if (game.boss && !game.boss.dead) {
    const b = game.boss, dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    const pull = d > 11 ? 1.5 : d < 7 ? -1.5 : 0;
    mx += dx / d * pull; mz += dz / d * pull;
  }
  // walk to (and stay in) the obelisk the lane wants
  // (ob resolved above)
  if (ob) {
    const dx = ob.pos.x - p.pos.x, dz = ob.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    const w = d > 2.2 ? 3.2 : 0.6 * (d / 2.2);
    mx += dx / d * w; mz += dz / d * w;
  }
  // go to shrine when calm
  const sh = game.world.shrine;
  if (sh && threat < 0.4) { mx += (sh.pos.x - p.pos.x) * 0.1; mz += (sh.pos.z - p.pos.z) * 0.1; }
  // chase chests / items / nearby XP when calm (a human vacuums XP between fights)
  if (threat < 0.3 && game.pickups.items.length) {
    const it = game.pickups.items[0];
    mx += (it.pos.x - p.pos.x) * 0.1; mz += (it.pos.z - p.pos.z) * 0.1;
  } else if (threat < 0.6) {
    let best = null, bd = 144;
    for (const s of game.pickups.shards) { const d = (s.pos.x - p.pos.x) ** 2 + (s.pos.z - p.pos.z) ** 2; if (d < bd) { bd = d; best = s; } }
    if (best) { const d = Math.sqrt(bd) || 1; mx += (best.pos.x - p.pos.x) / d * 0.8; mz += (best.pos.z - p.pos.z) / d * 0.8; }
  }
  // Raid bosses (v5): step out of pending telegraphs (BossBase.danger), stand in gold cleanse zones
  // when debuffed, and dash when a hit is about to land and walking can't clear it.
  const boss = game.boss;
  if (boss && !boss.dead && boss.danger) {
    const here = boss.danger(p.pos);
    if (here > 0) {
      let best = null, bs = Infinity;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
        for (const step of [2.5, 5]) {
          _cand.set(p.pos.x + sa * step, 0, p.pos.z + ca * step);
          game.world.collide(_cand, p.radius);
          const sc = boss.danger(_cand) * 10 + step * 0.15 - (mx * sa + mz * ca) * 0.05;
          if (sc < bs) { bs = sc; best = a; }
        }
      }
      if (best !== null) { mx = Math.sin(best) * 10; mz = Math.cos(best) * 10; }
      if (here >= 2.4 && p.dash.charges > 0 && Math.random() < 0.5) p.botDash = true;
    } else if (p.buffs.has('spores')) {
      for (const a of boss.actors) {
        if (a.kind !== 'safe' || a.dead) continue;
        mx += (a.pos.x - p.pos.x) * 0.6; mz += (a.pos.z - p.pos.z) * 0.6;
        break;
      }
    }
  }
  const l = Math.hypot(mx, mz);
  p.botMove = l > 0.01 ? { x: mx / l, z: mz / l } : { x: 0, z: 0 };
  // Aim: hold LMB on the boss (humans focus it); otherwise aim at the nearest foe.
  const target = game.boss && !game.boss.dead ? game.boss : game.nearestEnemy(p.pos, 16);
  if (target) {
    game.input.mouseGround.set(target.pos.x, 0, target.pos.z);
    game.input.mouseButtons.add(0);
    if (game.boss) game.input.mouseButtons.add(2); else game.input.mouseButtons.delete(2);
  } else game.input.mouseButtons.clear();
  if (threat > 1.2 && Math.random() < 0.08) p.botDash = true;
}

function pickCard(game, cards) {
  const p = game.player;
  const score = (c) => {
    if (c.type === 'fusion') return 100;
    if (c.type === 'rank') {
      const partner = FUSIONS.some((f) => (f.a === c.id && p.getSkill(f.b)) || (f.b === c.id && p.getSkill(f.a)));
      return 40 + (partner ? 20 : 0) - c.rank;
    }
    if (c.type === 'new') {
      const partner = FUSIONS.some((f) => (f.a === c.id && p.getSkill(f.b)) || (f.b === c.id && p.getSkill(f.a)));
      return 35 + (partner ? 15 : 0);
    }
    if (c.type === 'passive') return ['might', 'catalyst', 'vitality', 'haste'].includes(c.id) ? 30 : 20;
    return 0;
  };
  return cards.slice().sort((a, b) => score(b) - score(a))[0];
}

// Visual tour helper: jump the current run straight into an act (0..2), optionally with a boss.
export function jumpToAct(act, { boss = false, god = true } = {}) {
  const game = window.__game;
  if (!game.player) game.start({ classId: 'arcanist' });
  game.tutorial?.cancel();
  for (const e of game.enemies) if (!e.inert || e.isObject) e.dead = true;
  game.boss = null;
  game.encounter?.reset();
  game.obelisks?.reset?.();
  for (let i = game.actors.length - 1; i >= 0; i--) if (game.actors[i].hostile) { game.actors[i].dispose?.(game); game.actors.splice(i, 1); }
  game.act = act; game.actTime = boss ? 179.5 : 5; game.phase = 'horde'; game.state = 'playing';
  game.world.setBiome(['verge', 'cinder', 'crown'][act], true);
  game.spawner.onActStart?.(act);
  if (boss) game.actTime = 179.5;
  if (god) game.player.god = 0.02; // player.god: dev-only damage factor, relics never reset it
  game.autoCast = true;
  game.events.emit('actStart', { act, def: game.actDef });
}

// god: 0 (off) | true | a damage-taken fraction.   obelisks: see parseObelisks.
export async function runSim({ classId = 'arcanist', seconds = 700, tier = 0, log = true, tutorial = false, obelisks = [], god = 0 } = {}) {
  const plan = parseObelisks(obelisks);
  const game = window.__game;
  const ui = game.ui;
  const saved = { showLevelUp: ui.showLevelUp, showRelicPick: ui.showRelicPick, hideRelicPick: ui.hideRelicPick, hideLevelUp: ui.hideLevelUp, showGameOver: ui.showGameOver, showVictory: ui.showVictory };
  ui.showLevelUp = (cards, onPick) => onPick(pickCard(game, cards));
  ui.showRelicPick = (relics, onPick) => onPick(relics[0]);
  ui.hideLevelUp = ui.hideRelicPick = () => {};
  ui.showGameOver = ui.showVictory = () => {};

  const metaBackup = JSON.stringify(game.meta);
  game.meta.tutorialDone = !tutorial;   // balance sims skip the Rift Primer unless asked
  game.start({ classId, tier });
  if (god) game.player.god = god === true ? 0.02 : god;   // god: true (near-immortal) or the fraction of damage still taken (0.3 = soft god)
  game.autoCast = true;
  const tl = { levels: {}, acts: [], bosses: [], stakes: [], errors: [], fps: [] };
  let bossStart = null;
  const offs = [
    game.events.on('levelUp', ({ level }) => { tl.levels[level] = Math.round(game.time); }),
    game.events.on('bossSpawned', ({ echo }) => {
      if (echo) return;
      bossStart = game.time;
      const st = game.run.stakes ?? {};
      tl.stakes.push({ act: game.act, level: game.player.level, actTime: Math.round(game.actTime), haste: st.haste?.skipped ?? 0, echo: !!st.echo, heat: st.heat ?? 0, hp: Math.round(game.player.hp) });
    }),
    game.events.on('bossKilled', ({ enemy }) => { tl.bosses.push({ act: game.act, name: enemy.name, ttk: Math.round(game.time - bossStart), at: Math.round(game.time) }); }),
    game.events.on('actStart', ({ act }) => tl.acts.push({ act, at: Math.round(game.time), level: game.player?.level })),
    game.events.on('playerHit', ({ amount, source }) => {
      const k = source?.type ?? source?.constructor?.name ?? 'unknown';
      (tl.dmgBy ??= {})[k] = Math.round(((tl.dmgBy[k] ?? 0) + amount));
    }),
    game.events.on('perfectDodge', () => { tl.perfect = (tl.perfect ?? 0) + 1; }),
  ];
  const steps = Math.round(seconds / DT);
  let maxEnemies = 0, t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    if (game.state === 'dead' || game.state === 'victory') break;
    if (game.state === 'playing' || game.state === 'shift') botSteer(game, plan);
    try { game.update(DT); } catch (err) { tl.errors.push(String(err?.stack ?? err).slice(0, 400)); if (tl.errors.length > 5) break; }
    if (game.state === 'paused') game.togglePause();
    maxEnemies = Math.max(maxEnemies, game.enemies.length);
    if (i % 300 === 299) { tl.fps.push(Math.round(300 / ((performance.now() - t0) / 1000))); t0 = performance.now(); await new Promise((r) => setTimeout(r, 0)); }
  }
  offs.forEach((o) => o());
  game.input.mouseButtons.clear();
  Object.assign(ui, saved);
  // don't let simulated runs pollute the real save
  Object.assign(game.meta, JSON.parse(metaBackup));
  try { localStorage.setItem('riftbound.meta.v1', metaBackup); } catch { /* ignore */ }

  const p = game.player;
  const res = {
    classId, result: game.state, time: Math.round(game.time), act: game.act + 1, level: p.level, hp: Math.round(p.hp),
    kills: game.stats.kills, maxChain: game.stats.maxChain, reactions: game.stats.reactions,
    skills: p.skills.map((s) => `${s.def.id}:${s.rank}`), passives: [...p.passives].map(([k, v]) => `${k}:${v}`),
    relics: p.relics.map((r) => r.id), maxEnemies, simStepsPerSec: tl.fps,
    obelisks, obeliskShards: game.stats.obeliskShards ?? 0, bossTimes: game.stats.bossTimes ?? [], diedInBoss: game.state === 'dead' && !!game.encounter?.active, ...tl,
  };
  if (log) console.log('[sim]', JSON.stringify(res));
  return res;
}

// Visual check helper: start (or continue) a god-mode run in `act`, simulate `seconds`, hide the
// HUD and render one frame. Level-ups auto-pick. Usage:
//   const { snap } = await import('/src/dev/sim.js?v=' + Date.now()); await snap({ act: 1, seconds: 20 });
export async function snap({ act = 0, seconds = 15, classId = 'pyromancer', boss = false, fresh = true, hud = false, zoom } = {}) {
  const game = window.__game;
  const ui = game.ui;
  ui.showLevelUp = (cards, onPick) => onPick(cards[0]);
  ui.showRelicPick = (relics, onPick) => onPick(relics[0]);
  if (fresh || !game.player) { game.start({ classId }); jumpToAct(act, { boss }); }
  ui.hideLevelUp?.(); ui.hideRelicPick?.();
  if (game.state !== 'playing') game.state = 'playing';
  game.pendingLevelUps = 0;
  document.getElementById('ui').style.display = hud ? '' : 'none';
  if (zoom) { game.engine.targetZoom = game.engine.zoom = zoom; }
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    game.update(1 / 30);
    if (game.state === 'levelup' || game.state === 'relic') game.state = 'playing';
  }
  game.engine.render();
  return { enemies: game.enemies.length, state: game.state, act: game.act, hp: Math.round(game.player.hp) };
}

// v5 boss encounters: jump straight into an act's boss fight (design/RAID.md).
//   jumpToBoss(act, { god, echo, affixes: ['frenzied'], phase: 1|2|3, step: true })
//   step: advance the 1.5 s Seal synchronously so the boss exists on return.
// level: level the hero up first with the sim's card picks (balance runs; default 1 = as jumped)
export function jumpToBoss(act = 0, { god = true, echo = false, affixes = [], heat: heatOpt, phase = 1, step = true, level = 1 } = {}) {
  const heat = heatOpt ?? affixes.length, real = heatOpt !== undefined;   // HP / damage / chest scaling only when heat is passed explicitly
  const game = window.__game;
  jumpToAct(act, { god });
  game.actTime = 30;
  if (level > 1) {
    const ui = game.ui, keep = { s: ui.showLevelUp, h: ui.hideLevelUp };
    ui.showLevelUp = (cards, onPick) => onPick(pickCard(game, cards));
    ui.hideLevelUp = () => {};
    while (game.player.level < level) { game.player.gainXP(game.player.xpToNext - game.player.xp + 0.01); game.update(1 / 30); }
    for (let i = 0; i < 5 && game.pendingLevelUps > 0; i++) game.update(1 / 30);
    ui.showLevelUp = keep.s; ui.hideLevelUp = keep.h;
  }
  // stakes as the obelisks would have left them (heat 2: +15% boss HP; heat 3: +30% HP, +10% damage, a guaranteed Boss Relic)
  game.run.stakes = { ...(game.run.stakes ?? {}), echo, heat, affixes,
    bossHpMult: real ? (heat >= 3 ? 1.3 : heat >= 2 ? 1.15 : 1) : 1, bossDmgMult: real && heat >= 3 ? 1.1 : 1,
    echoChest: echo ? { pool: 'boss', choices: 3 } : null,
    chest: { extra: real && heat >= 1 ? 1 : 0, bossRelics: real && heat >= 3 ? 1 : 0 } };
  game.encounter.summon('dev');
  if (step) for (let i = 0; i < 60 && !game.boss; i++) game.update(1 / 30);
  const b = game.boss;
  if (b && phase > 1 && b.gates) {
    // fast-forward through the gates (intermissions run synchronously)
    for (let ph = 1; ph < phase; ph++) {
      b.phaseT = 999;                 // minPhase (v5.2) holds the gate until the phase has run long enough
      b.hp = b.hpFloor + 1;
      b.onGate?.(game);
      for (let i = 0; i < 30 * 12 && b.phase === ph; i++) game.update(1 / 30);
    }
  }
  return b;
}
