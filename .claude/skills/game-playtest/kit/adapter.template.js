// =====================================================================================
//  <GAME> playtest adapter. Copy to playtest/adapter.js and fill in every TODO.
//  Playtesters load it with:
//    const PT = (await import('/playtest/adapter.js?v=' + Date.now())).default;
//    PT.init({ persona: 'mila', skill: 'casual', fresh: true });
//  See the skill's references/adapter-guide.md for engine-specific recipes.
// =====================================================================================
import { createPlaytest, fmtTime } from './kit/playtest-core.js';
// Real-time action game? Use the bot hands. Turn-based / puzzle / card game? Delete this
// import and the `hands` field: play() then just steps until the next decision.
import { createTopdownHands } from './kit/hands-topdown.js';

const G = () => window.game;            // TODO: how to reach the live game object

const hands = createTopdownHands({
  player: () => { const p = G().player; return p && { x: p.x, z: p.y, radius: 16 }; },   // TODO (2D: z = y)
  threats: (p) => G().enemies.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.z) < 300)
    .map((e) => ({ x: e.x, z: e.y, radius: e.r, weight: e.isBoss ? 6 : 1 })),           // TODO
  projectiles: () => G().bullets.filter((b) => b.hostile)
    .map((b) => ({ ref: b, x: b.x, z: b.y, dx: b.vx / b.speed, dz: b.vy / b.speed, speed: b.speed, radius: b.r })), // TODO
  goals: (p) => G().pickups.map((it) => ({ x: it.x, z: it.y, weight: 0.8 })),            // TODO
  target: (p, lvl) => { const e = G().nearestEnemy?.(); return e ? { x: e.x, z: e.y } : null; },
  arena: null,                                                                         // e.g. { x: 400, z: 300, radius: 350 }
  unit: 1,                                                                             // game units per metre (2D pixels: ~20-40)
  apply: ({ move, aim, fire, dash }) => {
    // TODO: write into whatever the game reads for input (an input object, a fake key state, ...)
    const inp = G().input;
    inp.moveX = move.x; inp.moveY = move.z;
    if (aim) { inp.aimX = aim.x; inp.aimY = aim.z; }
    inp.fire = fire; inp.dash = dash;
  },
});

const PT = createPlaytest({
  dt: 1 / 60,                                          // TODO: the game's fixed step (or a sane one)
  ready: () => !!G(),
  // freeze: () => { G().loop.stop(); },               // default: window.requestAnimationFrame = () => 0
  storageKeys: ['mygame.save'],                        // TODO: localStorage keys the game persists (sandboxed per persona)
  outDir: 'playtest/out',

  // Called once, the first PT.init(): wrap the game's "ask the player" functions and subscribe
  // to its events. Report through ctx: ctx.offer / ctx.event / ctx.tally / ctx.min / ctx.max.
  install(ctx) {
    const g = G();
    // Decisions: wrap the UI function that opens a choice; DON'T auto-resolve it.
    const show = g.ui.showUpgradeChoice.bind(g.ui);    // TODO
    g.ui.showUpgradeChoice = (choices, onPick) => {
      ctx.offer({
        kind: 'upgrade',
        options: choices.map((c) => ({ name: c.name, desc: c.description })),   // plain data only
        pick: (i) => onPick(choices[i]),
      });
      show(choices, onPick);                           // keep the real modal for PT.ui()/screenshots
    };
    // Events → digest. Name damage sources the way a player would ("Goblin Archer", not "enemy3").
    g.events.on('playerHit', ({ amount, source }) => { ctx.tally('dmgTaken', amount); ctx.tally('dmgBy', amount, source?.displayName ?? 'unknown'); });
    g.events.on('enemyKilled', () => ctx.tally('kills'));
    g.events.on('levelUp', ({ level }) => ctx.event(`level ${level}`));
    g.events.on('bossSpawned', ({ boss }) => ctx.event(`boss appears: ${boss.name}`));
    // telegraph hook → hands
    // const tele = g.fx.warnCircle.bind(g.fx); g.fx.warnCircle = (x, y, r, sec) => { const h = tele(x, y, r, sec); hands.zone({ kind: 'circle', x, z: y, r, life: sec, done: () => h.done }); return h; };
  },

  onInit(opts, ctx) {                                  // after the save sandbox swap: reload the save, show the menu
    // TODO: G().save = loadSave(); G().showMenu();
    return {};
  },

  start(opts, ctx) {                                   // TODO: begin a run/level/match; return info or { error }
    G().startRun(opts);
    return { mode: opts.mode ?? 'default' };
  },
  step(dt, ctx) { G().update(dt); },                   // TODO: ONE synchronous simulation tick
  afterStep(ctx) {                                     // per-tick readings into the window
    const p = G().player; if (p) ctx.min('hpMin', p.hp);
  },
  time: () => G().time,                                // game clock in seconds (for the event log)
  status: () => {                                      // TODO: 'playing' | 'menu' | 'paused' | 'won' | 'lost'
    const g = G(); return g.gameOver ? (g.victory ? 'won' : 'lost') : 'playing';
  },
  lowHp: (frac = 0.3) => { const p = G().player; return !!p && p.hp < p.maxHp * frac; },
  state: () => {                                       // what a player could know; keep it compact
    const g = G(), p = g.player;
    return { time: fmtTime(g.time), level: p.level, hp: `${Math.round(p.hp)}/${p.maxHp}`, score: g.score };
  },
  stops: {                                             // extra stop reasons: factory → checker
    boss: () => { const before = !!G().boss; return () => !before && !!G().boss; },
  },
  end: (ctx) => ({ result: G().victory ? 'won' : 'lost', score: G().score }),   // TODO: run summary (+ meta rewards)
  abandon: (ctx) => { G().quitToMenu(); return {}; },

  // looking
  canvas: () => document.querySelector('canvas'),      // TODO
  render: () => {},                                    // TODO: draw one frame now (WebGL: render right before reading)
  project: null,                                       // (point) => ({ x, y, pxPerUnit }) in canvas px, enables shot(..., { around })
  focus: (name) => (name === 'player' ? G().player : name === 'boss' ? G().boss : null),
  uiRoot: () => document.getElementById('ui') ?? document.body,

  // out-of-run progression (optional)
  meta: null,                                          // () => ({ currency, upgrades:[...], unlocks:[...] })
  actions: {                                           // extra PT.<name>(...) verbs (meta purchases, rerolls, teleports)
    // buy: (ctx, id) => ({ ok: G().shop.buy(id) }),
  },

  // batches (optional)
  autoDecide: (decision, ctx) => 0,                    // the balance bot's draft policy → option index
  batchPlan: (opts) => (opts.modes ?? ['default']).map((mode) => ({ mode })),
  batchRow: (ctx, runOpts) => ({ ...runOpts, ...PT.state() }),

  hands,
});

window.PT = PT;
export default PT;
