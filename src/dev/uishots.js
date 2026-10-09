// =====================================================================================
//  UI harness (dev only): put any screen into an exact state for screenshots.
//    const U = await import('/src/dev/uishots.js?v=' + Date.now());
//    await U.hud({ classId: 'stormcaller', act: 1, boss: true, build: 'full', relics: 6, buffs: true, chain: 18, hp: 0.25 });
//    U.levelUp();               // 3 cards: new skill, rank-up, fusion (or pass { cards })
//    U.relicPick(4);            // a chest with 4 relics
//    U.pause('codex');          // pause screen on the 'build' or 'codex' tab
//    U.title(); U.gameOver('boar' / 'geyser' / 'vashkar' / 'crowd' / 'none'); U.victory();
//    U.freeze(); U.thaw();      // freeze the simulation (HUD keeps updating) / resume
//    U.restoreMeta();           // put the saved meta back exactly as it was before the first call
//  Nothing here writes the save: end screens get synthetic stats, and the meta is snapshotted
//  on first import. The simulation is frozen after every call (timeScale 0) so a visible pane
//  running requestAnimationFrame does not change the state between calls.
// =====================================================================================
import { SKILLS, PASSIVES, FUSIONS } from '../game/skills/registry.js';
import { RELICS } from '../game/relics.js';
import { CLASSES } from '../game/classes.js';
import { jumpToAct } from './sim.js';

const META_KEY = 'riftbound.meta.v1';
const DT = 1 / 30;
const g = () => window.__game;

if (!('__uiMetaBackup' in window)) window.__uiMetaBackup = localStorage.getItem(META_KEY);

export function restoreMeta() {
  const b = window.__uiMetaBackup;
  if (b == null) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, b);
}

export function freeze() { g().timeScale = 0; g()._slowmo = 0; }
export function thaw() { g().timeScale = 1; }

function stubPickers() {
  const ui = g().ui;
  ui.showLevelUp = (cards, onPick) => onPick(cards[0]);
  ui.showRelicPick = (relics, onPick) => onPick(relics[0]);
}
function unstubPickers() {
  const ui = g().ui;
  delete ui.showLevelUp;
  delete ui.showRelicPick;
}

// Advance the simulation synchronously (level-ups / chests auto-pick while stubbed).
export function step(seconds) {
  const game = g();
  game.timeScale = 1;
  stubPickers();
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    game.update(DT);
    if (game.state === 'levelup' || game.state === 'relic') game.state = 'playing';
  }
  unstubPickers();
  game.pendingLevelUps = 0;
  game.pendingChests = 0;
}

export function render() {
  const game = g();
  game.ui.update(DT);
  game.engine.render();
}

const BUILDS = {
  // slots: RMB/Q/E/R. Fusion in a slot + one auto skill + passives.
  full: { skills: ['fireball', 'chainLightning', 'frostNova', 'meteor'], fuse: 'fireball+chainLightning', autos: ['spiritOrbs', 'staticField'], passives: { might: 3, haste: 2, vitality: 1 } },
  mid: { skills: ['fireball', 'frostNova'], autos: ['spiritOrbs'], passives: { might: 1 } },
  none: { skills: [], autos: [], passives: {} },
};

function applyBuild(name) {
  const game = g(), p = game.player;
  const b = BUILDS[name] ?? BUILDS.none;
  for (const id of [...b.skills, ...b.autos]) {
    if (!SKILLS[id] || p.getSkill(id)) continue;
    p.learnSkill(SKILLS[id]);
    const s = p.getSkill(id);
    if (s) s.rank = 3;
  }
  if (b.fuse) {
    const [a, c] = b.fuse.split('+');
    const recipe = FUSIONS.find((f) => (f.a === a && f.b === c) || (f.a === c && f.b === a));
    if (recipe && p.getSkill(a) && p.getSkill(c)) p.fuse(recipe);
  }
  for (const [id, r] of Object.entries(b.passives)) for (let i = 0; i < r; i++) if (PASSIVES[id]) p.learnPassive(id);
  // a little cooldown variety so the slots show every state
  p.slots.forEach((s, i) => { if (s) s.cd = [0, 2.4, 0, 6.1, 0.6][i] ?? 0; });
}

/**
 * Start a fresh god-mode run and dress the HUD.
 * opts: classId, act (0-2), boss, seconds (sim time), build ('full'|'mid'|'none'), relics (count),
 *       buffs (bool), chain (number), hp (0..1 of max), shield (abs), level, shrine (bool), dashUsed (bool)
 */
export async function hud(opts = {}) {
  const {
    classId = 'pyromancer', act = 0, boss = false, seconds = 6, build = 'full', relics = 4,
    buffs = true, chain = 0, hp = 1, shield = 0, level = 0, shrine = false, dashUsed = false,
  } = opts;
  const game = g();
  document.getElementById('ui').style.display = '';
  game.ui.hideLevelUp?.(); game.ui.hideRelicPick?.(); game.ui.hidePause?.();
  game.ui.menus.hideTitle(); game.ui.menus.hideEnd();
  stubPickers();
  game.start({ classId });
  jumpToAct(act, { boss });
  unstubPickers();
  step(boss ? Math.max(seconds, 3) : seconds);
  const p = game.player;
  applyBuild(build);
  const ids = Object.keys(RELICS);
  for (let i = 0; i < relics && i < ids.length; i++) p.addRelic(RELICS[ids[(i * 5) % ids.length]]);
  if (buffs) {
    p.addBuff('adrenaline', 4.2, { name: 'Adrenaline', icon: '✦', color: '#9dffb0', apply: (s) => { s.damage += 0.3; } });
    p.addBuff('fury', 17, { name: 'Fury', icon: '✹', color: '#ff4d5e', apply: (s) => { s.damage += 0.4; } });
  }
  if (level) { p.level = level; }
  p.xp = p.xpToNext * 0.62;
  p.hp = Math.max(1, p.stats.maxHp * hp);
  p.shield = shield;
  const tot = Math.max(p.stats.maxHp, p.hp + shield);
  game.ui.hud?.hpMeter?.reset?.(p.hp / tot);      // no stale damage ghost in frozen shots
  game.ui.hud?.clMeter?.reset?.(p.hp / tot);
  if (dashUsed) { p.dash.charges = 0; p.dash.recharge = (p.dash.def.cd ?? 2) * 0.6; }
  if (chain) { game.chain = chain; game._lastReactionT = game.time; }
  if (shrine && !game.world.shrine) game.world._spawnShrine?.(p);
  game.state = 'playing';
  freeze();
  render();
  return { class: CLASSES[classId]?.name, act, boss: !!game.boss, slots: p.slots.map((s) => s?.def.id ?? null), autos: p.skills.filter((s) => s.slot < 0).map((s) => s.def.id), relics: p.relics.length };
}

function ensureRun() {
  const game = g();
  if (!game.player) { stubPickers(); game.start({ classId: 'pyromancer' }); jumpToAct(0); unstubPickers(); step(2); applyBuild('mid'); }
}

const SAMPLE_CARDS = () => {
  const p = g().player;
  const fb = SKILLS.fireball, cl = SKILLS.chainLightning, fus = FUSIONS.find((f) => f.def.id === 'plasmaOrb');
  return [
    { type: 'new', id: 'meteor', name: SKILLS.meteor.name, icon: SKILLS.meteor.icon, element: SKILLS.meteor.element, rank: 1, desc: SKILLS.meteor.desc(1), hint: 'Reacts with your frost: STEAM BURST' },
    { type: 'rank', id: 'fireball', name: fb.name, icon: fb.icon, element: fb.element, rank: 3, desc: fb.desc(3), hint: 'Rank 3 unlocks a fusion with Chain Lightning.' },
    { type: 'fusion', id: fus.def.id, name: fus.def.name, icon: fus.def.icon, element: fus.def.element, rank: 1, desc: fus.def.desc(1), hint: `${fb.name} + ${cl.name}` },
  ].filter(Boolean);
};

// Open the level-up modal. cards: 'sample' (new / rank / fusion), 'real' (rolled by the game), or an array.
export function levelUp({ cards = 'sample', rerolls = 2, banishes = 1 } = {}) {
  ensureRun();
  const game = g();
  unstubPickers();
  game.ui.hidePause?.(); game.ui.hideRelicPick?.();
  const list = cards === 'real' ? null : (Array.isArray(cards) ? cards : SAMPLE_CARDS());
  if (!list) { game.pendingLevelUps = 1; game._openLevelUp(); freeze(); render(); return game.state; }
  const ctl = { rerolls, banishes, reroll: () => SAMPLE_CARDS().reverse(), banish: () => SAMPLE_CARDS() };
  game.state = 'levelup';
  game.ui.showLevelUp(list, () => { game.ui.hideLevelUp(); game.state = 'playing'; }, ctl);
  freeze(); render();
  return game.state;
}

export function relicPick(n = 3) {
  ensureRun();
  const game = g();
  unstubPickers();
  game.ui.hideLevelUp?.(); game.ui.hidePause?.();
  const ids = ['alchemistsCoil', 'bloodPact', 'stormglassBoots', 'secondWind', 'prismLens', 'overclock'];
  game.state = 'relic';
  game.ui.showRelicPick(ids.slice(0, n).map((id) => RELICS[id]), () => { game.ui.hideRelicPick(); game.state = 'playing'; });
  freeze(); render();
  return game.state;
}

export function pause(tab = 'build') {
  ensureRun();
  const game = g();
  game.ui.hideLevelUp?.(); game.ui.hideRelicPick?.();
  game.state = 'paused';
  game.ui.showPause();
  game.ui._setPauseTab?.(tab);
  freeze(); render();
  return game.state;
}

export function title() {
  const game = g();
  game.ui.hideLevelUp?.(); game.ui.hideRelicPick?.(); game.ui.hidePause?.();
  game.quitToTitle();
  render();
  return game.state;
}

// stats.hurt fixtures for the death recap (shape: design/playtest/round-1/NEXT.md "Damage data").
// U.gameOver('boar' | 'geyser' | 'vashkar' | 'crowd' | 'none')
const HURT = {
  // War Boar charge finishing a run that Spirit-Shaman bolts had been grinding down
  boar: {
    by: {
      'War Boar': { dmg: 118, hits: 4, hows: { charge: 118 } },
      'Orc Spirit-Shaman': { dmg: 164, hits: 15, hows: { projectile: 164 } },
      'Orc Raider': { dmg: 72, hits: 12, hows: {} },
      'Fissure Geyser': { dmg: 30, hits: 2, hows: {} },
    },
    recent: [
      { name: 'Orc Spirit-Shaman', how: 'projectile', dmg: 11, t: 364.1, hp: 74 },
      { name: 'Orc Raider', how: null, dmg: 8, t: 366.4, hp: 66 },
      { name: 'Orc Spirit-Shaman', how: 'projectile', dmg: 11, t: 369.8, hp: 55 },
      { name: 'War Boar', how: 'charge', dmg: 24, t: 370.9, hp: 31 },
      { name: 'War Boar', how: 'charge', dmg: 41, t: 371.6, hp: 0 },
    ],
    killer: { name: 'War Boar', how: 'charge', dmg: 41 },
  },
  geyser: {
    by: { 'Fissure Geyser': { dmg: 90, hits: 3, hows: {} }, 'Warg': { dmg: 60, hits: 10, hows: {} } },
    recent: [
      { name: 'Warg', how: null, dmg: 9, t: 369.2, hp: 52 },
      { name: 'Fissure Geyser', how: null, dmg: 30, t: 371.4, hp: 22 },
      { name: 'Fissure Geyser', how: null, dmg: 30, t: 372.0, hp: 0 },
    ],
    killer: { name: 'Fissure Geyser', how: null, dmg: 30 },
  },
  vashkar: {
    by: { Vashkar: { dmg: 310, hits: 9, hows: { slam: 120, 'flame ring': 110, 'lava trail': 24 } }, 'Orc Raider': { dmg: 40, hits: 7, hows: {} } },
    recent: [
      { name: 'Vashkar', how: 'lava trail', dmg: 8, t: 360.2, hp: 58 },
      { name: 'Vashkar', how: 'lava trail', dmg: 8, t: 360.7, hp: 50 },
      { name: 'Vashkar', how: 'flame ring', dmg: 36, t: 363.9, hp: 14 },
      { name: 'Vashkar', how: 'charge', dmg: 30, t: 364.4, hp: 0 },
    ],
    killer: { name: 'Vashkar', how: 'charge', dmg: 30 },
  },
  // a crowd with no single killer and no recorded killing blow (falls back to the top source)
  crowd: {
    by: { 'Goblin Scamp': { dmg: 80, hits: 14, hows: {} }, 'Orc Raider': { dmg: 70, hits: 11, hows: {} }, Warg: { dmg: 66, hits: 11, hows: {} }, Ogre: { dmg: 40, hits: 2, hows: {} }, 'Goblin Sapper': { dmg: 28, hits: 1, hows: { explosion: 28 } } },
    recent: [
      { name: 'Warg', how: null, dmg: 6, t: 370.0, hp: 30 },
      { name: 'Goblin Scamp', how: null, dmg: 6, t: 370.4, hp: 24 },
      { name: 'Orc Raider', how: null, dmg: 6, t: 371.1, hp: 18 },
    ],
    killer: null,
  },
};

function fakeStats(victory, hurt = 'boar') {
  return {
    classId: 'stormcaller', tier: 2, act: victory ? 2 : 1, time: victory ? 641 : 372, level: victory ? 31 : 19,
    kills: victory ? 4120 : 1688, maxChain: victory ? 57 : 23, shardsEarned: victory ? 318 : 96, totalShards: 1204,
    unlocks: victory ? [] : ['arcanist'], tierUnlocked: victory ? 3 : 0,
    reactions: { overload: 211, superconduct: 96, steam: 40, arcflash: 12 },
    fusions: ['Plasma Orb', 'Tempest'],
    relics: ["Alchemist's Coil", 'Blood Pact', 'Stormglass Boots', 'Second Wind'],
    hurt: victory ? undefined : (HURT[hurt] ?? undefined),
  };
}

export function gameOver(hurt = 'boar') { ensureRun(); const game = g(); game.ui.showGameOver(fakeStats(false, hurt)); freeze(); render(); return 'gameover'; }
export function victory() { ensureRun(); const game = g(); game.ui.showVictory(fakeStats(true)); freeze(); render(); return 'victory'; }

// The Crownshard's Pact screen: a god-mode run at `act`, the shard woken, the player beside it, the screen open.
//   await U.pact({ act: 0, echo: false, heat: 0, draft: { echo: true, heat: 2 }, hp: 1 })
//   echo / heat = already SEALED (sealed through the director, then the screen is re-opened); draft = the player's
//   current selection on top of that. The Answer's foes are cleared. Close with U.pactClose().
export async function pact({ act = 0, echo = false, heat = 0, draft = null, hp = 1, classId = 'pyromancer', build = 'full' } = {}) {
  await hud({ classId, act, build, hp, seconds: 4, buffs: false, relics: 3 });
  const game = g();
  game.timeScale = 1;
  game.actTime = 49;
  step(3.5);
  game.player.pos.set(2.8, 0, 2.8);
  game.player.hp = Math.max(1, game.player.stats.maxHp * hp);
  game.state = 'playing';
  if (echo || heat) {
    game.obelisks.commune();
    game.obelisks.sealPact({ echo, heat, haste: false });
    step(2);
    game.enemies.slice().forEach((e) => { e.dead = true; e.hp = 0; });
    game.player.pos.set(2.8, 0, 2.8);
    game.state = 'playing';
  }
  game.timeScale = 0;
  const ok = game.obelisks.commune();
  if (draft) game.ui.pact.setDraft(draft);
  game.obelisks.updatePaused(DT);
  render();
  return { ok, state: game.state, shard: game.obelisks.shard?.state, stakes: { echo: game.run.stakes.echo, heat: game.run.stakes.heat } };
}

export function pactClose() {
  const game = g();
  game.obelisks.closePact();
  game.timeScale = 1;
  return game.state;
}
