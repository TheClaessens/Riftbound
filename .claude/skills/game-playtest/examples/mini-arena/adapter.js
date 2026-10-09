// Mini Arena playtest adapter: the smallest complete example of a game-playtest adapter
// (2D canvas, plain rAF loop, an event emitter, one choice UI, a persisted save).
//   const PT = (await import('<this folder>/adapter.js?v=' + Date.now())).default;
//   PT.init({ persona: 'selftest', skill: 'average', fresh: true }); PT.start(); PT.play({ seconds: 30 });
import { createPlaytest, fmtTime } from '../../kit/playtest-core.js';
import { createTopdownHands } from '../../kit/hands-topdown.js';

const G = () => window.game;

const hands = createTopdownHands({
  player: () => G().p && { x: G().p.x, z: G().p.y, radius: G().p.r },          // 2D: z = y
  threats: (p) => G().enemies.filter((e) => Math.hypot(e.x - p.x, e.y - p.z) < 160)
    .map((e) => ({ x: e.x, z: e.y, radius: e.r, weight: e.kind === 'brute' ? 3 : 1 })),
  projectiles: () => G().bullets.map((b) => {
    const s = Math.hypot(b.vx, b.vy) || 1;
    return { ref: b, x: b.x, z: b.y, dx: b.vx / s, dz: b.vy / s, speed: s, radius: b.r };
  }),
  target: (p) => {
    let best = null, bd = Infinity;
    for (const e of G().enemies) { const d = Math.hypot(e.x - p.x, e.y - p.z); if (d < bd) { bd = d; best = e; } }
    return best && { x: best.x, z: best.y };
  },
  arena: { x: 400, z: 300, radius: 220 },
  apply: ({ move, aim, fire, dash }) => {
    const inp = G().input;
    inp.bot = true; inp.moveX = move.x; inp.moveY = move.z; inp.fire = fire; inp.dash = dash;
    if (aim) { inp.aimX = aim.x; inp.aimY = aim.z; }
  },
  unit: 20,                                                                     // 20 px ≈ 1 m
});

const UPGRADE_PRIORITY = ['rate', 'dmg', 'hp', 'speed'];

const PT = createPlaytest({
  dt: 1 / 60,
  ready: () => !!G(),
  storageKeys: ['mini.save'],
  outDir: 'playtest/out',
  hands,

  install(ctx) {
    const g = G();
    const show = g.ui.showUpgrade;
    g.ui.showUpgrade = (opts, onPick) => {
      if (ctx.running) ctx.offer({ kind: 'upgrade', options: opts.map((o) => ({ id: o.id, name: o.name, desc: o.desc })), pick: (i) => onPick(opts[i]), opts });
      show(opts, onPick);
    };
    g.on('telegraph', (w) => hands.zone({ kind: 'circle', x: w.x, z: w.y, r: w.r, life: w.life, done: () => w.done }));
    g.on('hit', ({ amount, source }) => { if (!ctx.running) return; ctx.tally('dmgTaken', amount); ctx.tally('dmgBy', amount, source?.name ?? 'unknown'); });
    g.on('kill', ({ enemy }) => { if (ctx.running) ctx.tally('kills', 1, enemy.name); });
    g.on('upgrade', ({ u }) => ctx.event(`upgrade: ${u.name}`));
    g.on('dash', () => ctx.tally('dashes'));
    g.on('end', ({ won }) => ctx.event(won ? 'SURVIVED 90 s' : 'died'));
  },
  onInit() {
    const g = G();
    g.save = JSON.parse(localStorage.getItem('mini.save') || '{"best":0,"runs":0}');   // reload from the sandboxed key
    g.state = 'menu';
    return {};
  },
  start() { G().start(); return {}; },
  step: (dt) => G().update(dt),
  afterStep: (ctx) => { const g = G(); if (g.p) ctx.min('hpMin', g.p.hp); ctx.max('enemiesMax', g.enemies.length); },
  afterPlay: () => G().render(),
  time: () => G().time ?? 0,
  status: () => ({ won: 'won', lost: 'lost', menu: 'menu' })[G().state] ?? 'playing',
  lowHp: (f = 0.3) => !!G().p && G().p.hp < G().p.maxHp * f,
  state: () => {
    const g = G(), p = g.p;
    return p ? { screen: g.state, time: fmtTime(g.time), hp: `${Math.ceil(p.hp)}/${p.maxHp}`, kills: g.kills, enemies: g.enemies.length,
      build: { dmg: p.dmg, rate: p.rate, speed: p.speed } } : { screen: g.state };
  },
  stops: { brute: () => { const n0 = G().enemies.filter((e) => e.kind === 'brute').length; return () => G().enemies.filter((e) => e.kind === 'brute').length > n0; } },
  end: () => ({ result: G().state, survived: fmtTime(G().time), kills: G().kills, best: G().save.best, runs: G().save.runs }),
  abandon: () => { G().state = 'menu'; return {}; },
  canvas: () => G().canvas,
  render: () => G().render(),
  project: (pt) => ({ x: pt.x, y: pt.y ?? pt.z, pxPerUnit: 1 }),
  focus: (name) => (name === 'player' ? G().p : null),
  uiRoot: () => document.getElementById('ui'),
  meta: () => ({ ...G().save }),
  autoDecide: (d) => {
    let best = 0;
    d.options.forEach((o, i) => { if (UPGRADE_PRIORITY.indexOf(o.id) < UPGRADE_PRIORITY.indexOf(d.options[best].id)) best = i; });
    return best;
  },
  batchEnd: () => { G().save = JSON.parse(localStorage.getItem('mini.save') || '{"best":0,"runs":0}'); },   // the game caches its save in memory
  batchRow: () => ({ survived: fmtTime(G().time), kills: G().kills, hp: Math.ceil(G().p.hp) }),
});

window.PT = PT;
export default PT;
