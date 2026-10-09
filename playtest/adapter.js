// =====================================================================================
//  Riftbound playtest adapter (game-playtest skill kit). Serve with the playtest server
//  (launch config "riftbound-playtest", port 8098; screenshots land in playtest/out/), then:
//    const PT = (await import('/playtest/adapter.js?v=' + Date.now())).default;
//    PT.init({ persona: 'mila', skill: 'casual', fresh: true, unlockAll: false });
//    PT.meta();  PT.buy('might');              // Sanctum: shards, attunements, classes, codex
//    PT.start({ classId: 'pyromancer', tier: 0, tutorial: true, assist: 1 });
//    PT.play({ seconds: 45 });                 // stops at level-up / relic / boss / act / end
//    PT.decision(); PT.choose(1); PT.reroll(); PT.banish(0);
//    PT.jump(3, { boss: true });               // content-review teleport (tag findings [jumped])
//    await PT.shot('act1', { around: 'player', size: 10 });   // playtest/out/<persona>-act1.png
//    PT.batch({ classIds: ['pyromancer', 'cryomancer'], n: 5, skill: 'expert' }); await PT.batchWait();
// =====================================================================================
import * as THREE from 'three';
import { createPlaytest, fmtTime } from './kit/playtest-core.js';
import { createTopdownHands } from './kit/hands-topdown.js';
import { FUSIONS } from '../src/game/skills/registry.js';
import { ATTUNEMENTS, attuneCost, buyAttunement, loadMeta, isUnlocked, maxTierOf } from '../src/game/meta.js';
import { CLASSES } from '../src/game/classes.js';
import { pinSize } from '../src/dev/shot.js';

const G = () => window.__game;
const META_KEY = 'riftbound.meta.v1';
const SRC = { EnemyBullet: 'enemy projectile', FlameRing: 'boss flame ring', LavaTrail: 'boss lava trail', BeamSweep: 'boss beam sweep' };
const srcName = (s) => !s ? 'unknown' : s.type === 'hazard' ? `map hazard: ${s.kind}` : s.name ?? SRC[s.constructor?.name] ?? s.type ?? s.constructor?.name ?? 'unknown';
const _v = new THREE.Vector3();
// v5: the obelisk the playtester asked the hands to walk to and channel (PT.channel)
let OB_GOAL = null;

// ---------------------------------------------------------------- hands
const hands = createTopdownHands({
  player: () => { const p = G().player; return p && { x: p.pos.x, z: p.pos.z, radius: p.radius }; },
  threats: (p) => G().queryEnemies(G().player.pos, 9, []).filter((e) => !e.inert && !e.dead)
    .map((e) => ({ x: e.pos.x, z: e.pos.z, radius: e.radius, weight: e.boss ? 6 : 1 })),
  projectiles: () => G().actors.filter((a) => a.hostile && a.pos && a.dir && a.speed)
    .map((a) => ({ ref: a, x: a.pos.x, z: a.pos.z, dx: a.dir.x, dz: a.dir.z, speed: a.speed, radius: a.radius })),
  hazards: () => G().actors.filter((a) => a.hostile && a.pos && !(a.dir && a.speed)).map((a) => ({ x: a.pos.x, z: a.pos.z, radius: a.radius })),
  goals: (p) => {
    const g = G(), out = [];
    // v5: walk to the obelisk being channelled (PT.channel) and stay inside its ring
    const ob = OB_GOAL && g.obelisks?.list?.find((o) => o.type === OB_GOAL.type && (o.state === 'idle' || o.state === 'channel'));
    if (ob) {
      const d = Math.hypot(ob.pos.x - p.x, ob.pos.z - p.z);
      out.push({ x: ob.pos.x, z: ob.pos.z, weight: d > 2 ? 3 : 0.4, calmOnly: false });
    } else if (OB_GOAL) OB_GOAL = null;
    // v5: debuffed (Gorrak's spores) → the gold cleanse pools
    if (g.player?.buffs?.has('spores') && g.boss?.actors) {
      for (const a of g.boss.actors) if (a.kind === 'safe' && !a.dead) { out.push({ x: a.pos.x, z: a.pos.z, weight: 2.5, calmOnly: false }); break; }
    }
    if (g.world.shrine) out.push({ x: g.world.shrine.pos.x, z: g.world.shrine.pos.z, weight: 1 });
    if (g.pickups.items.length) out.push({ x: g.pickups.items[0].pos.x, z: g.pickups.items[0].pos.z, weight: 1, maxThreat: 0.3 });
    else {
      let best = null, bd = 144;
      for (const s of g.pickups.shards) { const d = (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } }
      if (best) out.push({ x: best.pos.x, z: best.pos.z, weight: 0.8, maxThreat: 0.6 });
    }
    return out;
  },
  // aim: the primer's crystal while it asks for it, else the boss (by focus), else the nearest foe
  target: (p, lv) => {
    const g = G(), tut = g.tutorial;
    const crystal = tut?.active && tut.step === 'crystal' && tut.crystal && !tut.crystal.dead ? tut.crystal : null;
    const t = crystal ?? (g.boss && !g.boss.dead && Math.random() < lv.focus ? g.boss : g.nearestEnemy(g.player.pos, 16));
    return t ? { x: t.pos.x, z: t.pos.z } : null;
  },
  keepAt: () => { const b = G().boss; return b && !b.dead ? { x: b.pos.x, z: b.pos.z, near: 7, far: 11 } : null; },
  // v5: inside a sealed boss arena the leash follows it
  arena: () => { const A = G().encounter?.arena; return A ? { x: A.center.x, z: A.center.z, radius: A.r - 3 } : { x: 0, z: 0, radius: 30 }; },
  apply: ({ move, aim, dash }) => {
    const g = G(), p = g.player, inp = g.input;
    p.botMove = move;
    if (aim) {
      inp.mouseGround.set(aim.x, 0, aim.z);
      inp.mouseButtons.add(0);
      if (g.boss) inp.mouseButtons.add(2); else inp.mouseButtons.delete(2);
    } else inp.mouseButtons.clear();
    if (dash || (g.tutorial?.active && g.tutorial.step === 'dash' && Math.random() < 0.05)) p.botDash = true;
  },
});

// ---------------------------------------------------------------- helpers
function metaSummary() {
  const m = G().meta;
  return {
    shards: m.shards, runs: m.stats.runs, wins: m.stats.wins, bestAct: m.stats.bestAct, maxTier: maxTierOf(m),
    attune: m.attune, unlocked: Object.keys(CLASSES).filter((id) => isUnlocked(m, id)),
    codex: { reactions: m.codex.reactions.length + '/6', fusions: m.codex.fusions.length + '/10', relics: m.codex.relics.length + '/18' },
    tutorialDone: m.tutorialDone,
  };
}

// v5 raid boss: what the HUD shows, in words
function bossView(b) {
  const pct = Math.round(100 * b.hp / b.maxHp);
  const po = b.poise ? Math.round(100 * b.poise.v / (b.poise.max * (b.poise.mult ?? 1))) : null;
  const bits = [`${b.name} ${pct}%`, b.phases ? `phase ${b.phase}/${b.phases}` : null,
    b.intermissionIdx ? 'INTERMISSION (untargetable)' : null, b.downed ? 'DOWNED' : null, b.exposedT > 0 ? 'EXPOSED' : null,
    po !== null ? `stagger ${po}%` : null, b.cast ? `casting ${b.cast.name}${b.cast.check ? ` (break check: stagger ${b.cast.threshold})` : ''}` : null,
    b.enrage ? 'ENRAGED' : null, b.isEcho ? 'ECHO' : null, b.ward ? `ward ${b.ward}` : null, b.axeHeat !== undefined ? `axe heat ${Math.round(b.axeHeat)}` : null,
    b.affixes?.length ? `affixes ${b.affixes.map((a) => a.name).join('/')}` : null];
  const objs = b.objects ? [...b.objects].filter((o) => !o.dead && o.marker).map((o) => o.name) : [];
  if (objs.length) bits.push(`objects: ${objs.join(', ')}`);
  return bits.filter(Boolean).join(' · ');
}
function stakesView(st) {
  if (!st) return undefined;
  const s = [st.echo && 'Echo', st.heat && `Wrath ${st.heat}`, st.haste && 'Haste'].filter(Boolean);
  return s.length ? s.join(' + ') : undefined;
}

function relicView(r) { return { name: r.name, tag: r.tag, desc: r.desc, flavour: r.flavour }; }
function cardView(c) {
  return { type: c.type, name: c.name, element: c.element, rank: c.rank, desc: c.desc, hint: c.hint || undefined };
}

function offerLevelUp(ctx, cards, onPick, ctl, extra) {
  ctx.offer({
    kind: extra?.title ? 'wrathCache' : 'levelup', info: { level: G().player.level, hand: extra?.total > 1 ? `${extra.index} of ${extra.total}` : undefined, rerolls: ctl?.rerolls ?? 0, banishes: ctl?.banishes ?? 0 },
    options: cards.map(cardView), pick: (i) => onPick(cards[i]), cards, onPick, ctl,
  });
}

// ---------------------------------------------------------------- adapter
const PT = createPlaytest({
  dt: 1 / 30,
  ready: () => !!G(),
  storageKeys: [META_KEY],
  outDir: 'playtest/out',
  hands,

  install(ctx) {
    const g = G(), ui = g.ui, fx = g.fx;
    // decisions wait for the playtester; the real modal still opens so PT.ui() can read it
    const lu = ui.showLevelUp.bind(ui), rp = ui.showRelicPick.bind(ui);
    ui.showLevelUp = (cards, onPick, ctl, extra) => { if (ctx.running) offerLevelUp(ctx, cards, onPick, ctl, extra); lu(cards, onPick, ctl, extra); };
    ui.showRelicPick = (relics, onPick) => {
      if (ctx.running) ctx.offer({ kind: 'relic', options: relics.map(relicView), pick: (i) => onPick(relics[i]) });
      rp(relics, onPick);
    };
    // hostile telegraphs → danger zones for the hands
    const circle = fx.telegraph.bind(fx), line = fx.lineTelegraph.bind(fx);
    fx.telegraph = (pos, radius, duration, opts = {}) => {
      const h = circle(pos, radius, duration, opts);
      if (!opts.friendly && !opts.safe) hands.zone({ kind: 'circle', x: pos.x, z: pos.z, r: radius, life: duration, done: () => h.done });
      return h;
    };
    // v5 boss shapes: cones and donuts (gold 'safe' markers are not dangers)
    const cone = fx.coneTelegraph.bind(fx), donut = fx.donutTelegraph.bind(fx);
    fx.coneTelegraph = (origin, dir, angle, radius, duration, opts = {}) => {
      const h = cone(origin, dir, angle, radius, duration, opts);
      if (!opts.friendly && !opts.safe) {
        const l = Math.hypot(dir.x, dir.z) || 1;
        hands.zone({ kind: 'cone', x: origin.x, z: origin.z, dx: dir.x / l, dz: dir.z / l, r: radius, angle, life: duration, done: () => h.done });
      }
      return h;
    };
    fx.donutTelegraph = (pos, inner, outer, duration, opts = {}) => {
      const h = donut(pos, inner, outer, duration, opts);
      if (!opts.friendly && !opts.safe) hands.zone({ kind: 'donut', x: pos.x, z: pos.z, inner, r: outer, life: duration, done: () => h.done });
      return h;
    };
    fx.lineTelegraph = (from, dir, length, width, duration, opts = {}) => {
      const h = line(from, dir, length, width, duration, opts);
      if (!opts.friendly && !opts.safe) {
        const l = Math.hypot(dir.x, dir.z) || 1;
        hands.zone({ kind: 'line', x: from.x, z: from.z, dx: dir.x / l, dz: dir.z / l, len: length, w: width, life: duration, done: () => h.done });
      }
      return h;
    };
    // events → digest
    const on = (n, f) => g.events.on(n, (e) => { if (ctx.running) f(e); });
    on('playerHit', ({ amount, source, how, name }) => {
      ctx.tally('dmgTaken', amount);
      // v5 boss attacks are named by the move ("Gorrak, the Troll King: backhand")
      const bossy = source?.boss || source?.owner || source?.boss?.boss;
      ctx.tally('dmgBy', amount, bossy ? `${name ?? srcName(source)}: ${how ?? 'hit'}` : srcName(source));
    });
    on('enemyKilled', () => ctx.tally('kills'));
    on('reaction', ({ type }) => ctx.tally('reactions', 1, type));
    on('levelUp', ({ level }) => { ctx.tally('levelUps'); ctx.event(`level ${level}`); });
    on('perfectDodge', () => ctx.tally('perfectDodges'));
    on('dash', () => ctx.tally('dashes'));
    on('announce', ({ text, sub }) => ctx.event(`ANNOUNCE "${text}"${sub ? ` — ${sub}` : ''}`));
    on('actStart', ({ act, def }) => ctx.event(`act ${act + 1} starts: ${def?.name ?? def?.id ?? ''}`));
    on('bossSpawned', ({ enemy }) => { ctx.run.bossT = g.time; ctx.event(`boss appears: ${enemy.name}`); });
    on('bossPhase', ({ enemy, phase }) => ctx.event(`${enemy.name} enters phase ${phase ?? 2}`));
    // v5: raid encounters + obelisks
    on('encounterStart', ({ reason, stakes }) => {
      const st = [stakes?.echo && 'Echo', stakes?.heat && `Wrath heat ${stakes.heat} (${(stakes.affixes ?? []).join(', ')})`, stakes?.haste && 'Haste'].filter(Boolean);
      ctx.event(`THE ARENA SEALS (${reason}); stakes: ${st.join(' + ') || 'none'}`);
    });
    on('bossIntermission', ({ enemy, index, dur }) => ctx.event(`${enemy.name}: intermission ${index} (${Math.round(dur)}s, untargetable)`));
    on('bossDowned', ({ dur, reason }) => { ctx.tally('bossDowned', 1, reason); ctx.event(`boss ${reason === 'winded' ? 'WINDED' : 'DOWNED'} for ${Math.round(dur)}s (${reason})`); });
    on('breakCheck', ({ name, dur, threshold }) => ctx.event(`BREAK CHECK: ${name} — fill Stagger to ${threshold} within ${Math.round(dur)}s`));
    on('breakCheckEnd', ({ name, success }) => { ctx.tally('breakChecks', 1, success ? 'broken' : 'failed'); ctx.event(`${name} ${success ? 'BROKEN' : 'NOT broken (it resolves)'}`); });
    on('poise', ({ amount, src }) => ctx.tally('staggerGained', amount, src));
    on('bossEnrage', ({ enemy }) => ctx.event(`${enemy.name} ENRAGES`));
    on('echoMend', () => ctx.event('the boss falls... the Echo rises (Rift Mend)'));
    on('encounterEnd', ({ enemy }) => ctx.event(`ENCOUNTER WON: ${enemy?.name}`));
    on('obelisksRisen', () => ctx.event('THREE RIFT OBELISKS RISE (Haste / Echo / Wrath): see PT.obelisks()'));
    on('obeliskArmed', ({ type, heat, affix }) => ctx.event(`obelisk armed: ${type}${type === 'wrath' ? ` heat ${heat} (${affix})` : ''}`));
    on('obeliskPayout', ({ shards, lines }) => ctx.event(`obelisk payout: +${shards} shards (${(lines ?? []).map((l) => l.text).join('; ')})`));
    on('bossKilled', ({ enemy }) => ctx.event(`boss killed: ${enemy.name} in ${Math.round(g.time - (ctx.run.bossT ?? g.time))}s`));
    on('discovered', ({ kind, id }) => ctx.event(`NEW codex entry (${kind}): ${id}`));
    on('fusion', ({ def }) => ctx.event(`FUSION: ${def.name}`));
    on('relicGained', ({ def }) => ctx.event(`relic gained: ${def.name}`));
    on('shrineClaimed', ({ type }) => ctx.event(`shrine claimed: ${type}`));
    on('chainMilestone', ({ chain }) => ctx.event(`Chain ${chain}!`));
    on('wardBroken', ({ element }) => ctx.tally('wardsBroken', 1, element));
    on('geodeBroken', ({ element, hits }) => { ctx.tally('crystals'); if (hits >= 5) ctx.event(`${element} crystal blast hit ${hits} foes`); });
    on('itemCollected', ({ type }) => { if (type !== 'chest') ctx.tally('pickups', 1, type); });
    on('playerDied', () => ctx.event('YOU DIED'));
    on('runEnd', ({ victory }) => ctx.event(victory ? 'VICTORY' : 'run over'));
  },

  onInit({ unlockAll, shake } = {}) {
    const g = G();
    const m = loadMeta();                       // reads the persona's sandboxed save
    if (unlockAll !== undefined) m.unlockAll = !!unlockAll;
    if (shake !== undefined) m.shake = shake;
    for (const k of Object.keys(g.meta)) delete g.meta[k];
    Object.assign(g.meta, m);
    g.codex = g.meta.codex;
    localStorage.setItem(META_KEY, JSON.stringify(g.meta));
    pinSize(1280, 720);
    // re-render the title from the swapped save (it was drawn from the origin's save at boot)
    if (g.state !== 'title') g.quitToTitle(); else g.ui.showTitle?.();
    return {};
  },

  start({ classId = 'pyromancer', tier = 0, tutorial, assist = 1 } = {}, ctx) {
    const g = G();
    if (!isUnlocked(g.meta, classId)) return { error: `${classId} is locked`, classes: PT.meta().classes };
    if (tutorial === false) g.meta.tutorialDone = true;
    g.ui.hideTitle?.(); g.ui.menus?.hideTitle?.(); g.hideShowcase?.();
    g.start({ classId, tier, player: true });
    g.autoCast = true;
    if (assist < 1) {
      // ASSIST: a declared crutch for content review (not a game setting); always report it
      const p = g.player, td = p.takeDamage.bind(p);
      p.takeDamage = (amount, source) => td(amount * assist, source);
    }
    ctx.run.tutText = '';
    return { classId, tier: g.tier, tutorial: !!g.tutorial?.active, assist };
  },

  step(dt) {
    const g = G();
    if (g.state === 'paused') g.togglePause();
    g.update(dt);
  },
  afterStep(ctx) {
    const g = G(), p = g.player;
    ctx.min('hpMin', p.hp);
    ctx.max('maxEnemiesAlive', g.enemies.length);
    // primer / tip panel text (reads layout: only while a panel can be up, every 6th tick)
    const tut = g.tutorial;
    if (!(tut?.active || tut?._tip || ctx.run.tutText)) return;
    ctx.every(6, 'tut', () => {
      const el = document.querySelector('.tut');
      let t = el && el.offsetParent !== null ? el.innerText.replace(/\s+/g, ' ').trim() : '';
      if (/^skip tutorial$/i.test(t)) t = '';
      if (t && t.replace(/\d+/g, '') !== ctx.run.tutText.replace(/\d+/g, '')) ctx.event(`PRIMER PANEL: "${t.slice(0, 220)}"`);
      ctx.run.tutText = t;
    });
  },
  afterPlay() { const g = G(); g.input.mouseButtons.clear(); g.engine.render(); },
  settle() { G().update(0); },                 // lets a queued second level-up open right away
  time: () => G().time,
  status: () => {
    const s = G().state;
    return s === 'dead' ? 'lost' : s === 'victory' ? 'won' : s === 'title' ? 'menu' : s === 'paused' ? 'paused' : 'playing';
  },
  lowHp: (frac = 0.3) => { const p = G().player; return !!p && p.hp < p.stats.maxHp * frac; },
  state: () => {
    const g = G(), p = g.player;
    if (!p) return { screen: g.state };
    return {
      screen: g.state, time: fmtTime(g.time), act: g.act + 1, actClock: fmtTime(g.actTime), phase: g.phase,
      hp: `${Math.round(p.hp)}/${Math.round(p.stats.maxHp)}`, level: p.level, xpPct: Math.round(100 * p.xp / p.xpToNext),
      kills: g.stats.kills, chain: g.chain, maxChain: g.stats.maxChain, enemiesAlive: g.enemies.filter((e) => !e.dead && !e.inert).length,
      boss: g.boss && !g.boss.dead ? bossView(g.boss) : null,
      obelisks: g.obelisks?.list?.length && g.phase === 'horde' ? g.obelisks.list.map((o) => `${o.type}:${o.state}${o.armed ? ' ARMED' : ''}${o.type === 'wrath' ? ` heat ${o.heat}` : ''}`).join(', ') : undefined,
      stakes: stakesView(g.run.stakes),
      debuffs: [...p.buffs.keys()].filter((k) => ['spores', 'rooted', 'strain'].includes(k)),
      skills: p.skills.map((s) => `${s.def.name} r${s.rank}`), passives: [...p.passives].map(([k, v]) => `${k} r${v}`),
      relics: p.relics.map((r) => r.name), rerolls: g.run.rerolls, banishes: g.run.banishes,
    };
  },
  stops: {
    boss: () => { const had = !!G().boss; return () => !had && !!G().boss; },
    act: () => { const a0 = G().act; return () => G().act !== a0 && G().state === 'playing'; },
    // v5
    obelisks: () => { const had = !!G().obelisks?.list?.length; return () => !had && !!G().obelisks?.list?.length; },
    phase: () => { const b0 = G().boss, p0 = b0?.phase, i0 = b0?.intermissionIdx; return () => { const b = G().boss; return !!b && (b !== b0 || b.phase !== p0 || b.intermissionIdx !== i0); }; },
    breakCheck: () => { const had = !!G().boss?.cast?.check; return () => !had && !!G().boss?.cast?.check; },
    channelled: () => { const had = !!OB_GOAL; return () => had && !OB_GOAL; },
  },
  end() {
    const g = G(), s = g.stats;
    const out = {
      result: g.state, time: fmtTime(s.time), act: s.act + 1, level: s.level, kills: s.kills, maxChain: s.maxChain,
      bossesKilled: s.bossesKilled, reactions: s.reactions, fusions: s.fusions, relics: s.relics,
      shardsEarned: s.shardsEarned, totalShards: s.totalShards, newlyUnlocked: s.unlocks, tierUnlocked: s.tierUnlocked,
      obeliskShards: s.obeliskShards ?? 0, bossFights: (s.bossTimes ?? []).map((b) => `act ${b.act + 1}${b.echo ? ' echo' : ''}: ${b.t}s`),
    };
    OB_GOAL = null;
    g.quitToTitle();
    return out;
  },
  abandon() { G().quitToTitle(); return { note: 'quitting pays no shards and does not count as a run' }; },

  // looking
  canvas: () => G().engine.renderer.domElement,
  render: () => G().engine.render(),
  project: (pt) => {
    const g = G(), cam = g.engine.camera, src = g.engine.renderer.domElement;
    _v.set(pt.x, (pt.y ?? 0) + 1, pt.z).project(cam);
    return { x: (_v.x * 0.5 + 0.5) * src.width, y: (-_v.y * 0.5 + 0.5) * src.height, pxPerUnit: src.height * cam.zoom / (cam.top - cam.bottom) };
  },
  focus: (name) => (name === 'player' ? G().player?.pos : name === 'boss' ? G().boss?.pos : null),
  uiRoot: () => document.getElementById('ui') ?? document.body,

  // out-of-run progression: the Sanctum
  meta: () => {
    const m = G().meta;
    return {
      ...metaSummary(),
      attunements: Object.values(ATTUNEMENTS).map((a) => {
        const r = m.attune[a.id] ?? 0;
        return { id: a.id, name: a.name, desc: a.desc, rank: r, max: a.max, nextCost: r < a.max ? attuneCost(r + 1) : null };
      }),
      classes: Object.values(CLASSES).map((c) => ({ id: c.id, name: c.name, unlocked: isUnlocked(m, c.id), unlock: c.unlock?.desc ?? c.unlock?.id ?? null })),
    };
  },

  actions: {
    // v5: the three Rift Obelisks (risen at 0:50 of each act): what each offers right now
    obelisks(ctx) {
      const g = G(), O = g.obelisks;
      if (!O?.list?.length) return { none: g.phase === 'horde' ? `obelisks rise at 0:50 (act clock ${fmtTime(g.actTime)})` : 'collapsed (the boss is here)' };
      return O.list.map((o) => {
        const pv = O.preview?.(o.type) ?? {};
        return {
          type: o.type, name: o.def?.name, state: o.state, armed: !!o.armed, heat: o.type === 'wrath' ? o.heat : undefined,
          distance: Math.round(Math.hypot(o.pos.x - g.player.pos.x, o.pos.z - g.player.pos.z)),
          cost: pv.cost, pay: pv.pay, levelsDelta: pv.levelsDelta, nextAffix: o.nextAffix ? `${o.nextAffix.name}: ${o.nextAffix.desc}` : undefined,
        };
      });
    },
    // v5: walk to an obelisk and channel it (stand in its ring 4 s; foes converge on you meanwhile).
    // Then PT.play({ seconds: 20, until: 'channelled' }). Wrath: call again for each extra heat.
    channel(ctx, type) {
      const g = G(), o = g.obelisks?.list?.find((x) => x.type === type);
      if (!o) return { error: `no ${type} obelisk now`, obelisks: PT.obelisks() };
      if (o.state !== 'idle' && o.state !== 'channel') return { error: `${type} obelisk is ${o.state}${o.armed ? ' (already armed)' : ''}` };
      OB_GOAL = { type };
      return { walking: type, distance: Math.round(Math.hypot(o.pos.x - g.player.pos.x, o.pos.z - g.player.pos.z)), note: "PT.play({ seconds: 20, until: 'channelled' })" };
    },
    cancelChannel() { OB_GOAL = null; return { ok: true }; },
    buy(ctx, id) {
      const g = G(), ok = buyAttunement(g.meta, id);
      if (ok && g.state === 'title') g.ui.showTitle?.();   // the real button re-renders too
      return { ok, shards: g.meta.shards, rank: g.meta.attune[id] };
    },
    reroll(ctx) {
      const d = ctx.decision;
      if (d?.kind !== 'levelup') return { error: 'no level-up waiting' };
      const cards = d.ctl.reroll();
      if (!cards) return { error: 'no rerolls left' };
      G().ui.showLevelUp(cards, d.onPick, d.ctl);   // re-offers through the hook
      return PT.decision();
    },
    banish(ctx, i) {
      const d = ctx.decision;
      if (d?.kind !== 'levelup') return { error: 'no level-up waiting' };
      const cards = d.ctl.banish(d.cards[i]);
      if (!cards) return { error: 'cannot banish (none left, or a heal card)' };
      G().ui.showLevelUp(cards, d.onPick, d.ctl);
      return PT.decision();
    },
    // Content-review teleport to act 1..3 (optionally at its boss), with the levels a player would
    // have there (draft them via PT.decision/choose). Tag findings made after a jump [jumped].
    jump(ctx, act, { boss = false } = {}) {
      const g = G();
      if (!ctx.running || !g.player) return { error: 'start a run first' };
      const a = Math.max(1, Math.min(3, act)) - 1;
      for (const e of g.enemies) if (!e.inert || e.isObject) e.dead = true;
      g.boss = null;
      g.encounter?.reset();
      g.obelisks?.reset?.();
      OB_GOAL = null;
      for (let i = g.actors.length - 1; i >= 0; i--) if (g.actors[i].hostile) { g.actors[i].dispose?.(g); g.actors.splice(i, 1); }
      g.act = a; g.actTime = boss ? 179.5 : 1; g.phase = 'horde'; g.state = 'playing';
      g.world.setBiome(['verge', 'cinder', 'crown'][a], true);
      g.spawner.onActStart?.(a);
      g.events.emit('actStart', { act: a, def: g.actDef });
      const target = [1, 10, 18][a] + (boss ? [9, 8, 8][a] : 0);
      const p = g.player;
      while (p.level < target) p.gainXP(p.xpToNext - p.xp + 0.01);
      p.hp = p.stats.maxHp;
      g.update(0);
      return { jumped: a + 1, boss, level: p.level, note: 'level-ups open on the next PT.play(); draft them before fighting' };
    },
  },

  // batches: full bot runs with the balance bot's draft policy (fusions > partner ranks > ...)
  autoDecide(d) {
    if (d.kind === 'relic') return 0;
    const p = G().player;
    const partner = (id) => FUSIONS.some((f) => (f.a === id && p.getSkill(f.b)) || (f.b === id && p.getSkill(f.a)));
    const score = (c) => c.type === 'fusion' ? 100 : c.type === 'rank' ? 40 + (partner(c.id) ? 20 : 0) - c.rank
      : c.type === 'new' ? 35 + (partner(c.id) ? 15 : 0) : c.type === 'passive' ? (['might', 'catalyst', 'vitality', 'haste'].includes(c.id) ? 30 : 20) : 0;
    let best = 0;
    d.cards.forEach((c, i) => { if (score(c) > score(d.cards[best])) best = i; });
    return best;
  },
  batchPlan: ({ classIds = ['pyromancer'], tier = 0 }) => classIds.map((classId) => ({ classId, tier, tutorial: false })),
  batchBegin(ctx) {
    const g = G();
    ctx.run_saved = JSON.stringify(g.meta);
    g.meta.unlockAll = true; g.meta.tutorialDone = true;
  },
  batchEnd(ctx) {
    const g = G();
    if (!ctx.run_saved) return;
    Object.assign(g.meta, JSON.parse(ctx.run_saved));
    localStorage.setItem(META_KEY, ctx.run_saved);
  },
  batchTrack(ctx) {
    const g = G(), bossTtk = [], dmg = {};
    const offs = [
      g.events.on('bossKilled', () => bossTtk.push(Math.round(g.time - (ctx.run?.bossT ?? g.time)))),
      g.events.on('playerHit', ({ amount, source }) => { const s = srcName(source); dmg[s] = (dmg[s] ?? 0) + amount; }),
    ];
    return { bossTtk, dmg, stop: () => offs.forEach((o) => o()) };
  },
  batchRow(ctx, runOpts, tr) {
    const g = G(), p = g.player;
    return {
      classId: runOpts.classId, tier: runOpts.tier, time: fmtTime(g.time), act: g.act + 1, level: p.level, kills: g.stats.kills,
      maxChain: g.stats.maxChain, bossTtk: tr.bossTtk, reactions: Object.values(g.stats.reactions).reduce((a, b) => a + b, 0),
      fusions: g.stats.fusions, skills: p.skills.map((s) => `${s.def.id}:${s.rank}`), relics: p.relics.map((r) => r.id),
      topDmgSources: Object.entries(tr.dmg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${Math.round(v)}`),
    };
  },
});

window.PT = PT;
export default PT;
