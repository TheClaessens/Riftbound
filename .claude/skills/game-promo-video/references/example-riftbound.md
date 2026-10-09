# Worked example: Riftbound (Three.js isometric horde ARPG)

The first promo built with this kit (15 s, 1080p60, 12 shots). The full source lives in that project's `promo/`; this is the condensed shape of each file so you can pattern-match a new game.

## promo/index.html
Game CSS + import map copied from the game's `index.html`, the kit shims before anything else, the game's container ids kept (the engine appends its canvas to `#game`), and DOM HUD layers hidden:
```html
<script>window.PROMO = { width: 1920, height: 1080, seed: 1, raf: 'manual', timers: 'real' };</script>
<script src="kit/shims.js"></script>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js" } }</script>
<style> #game { position: fixed; left: -4000px; } #fx-layer, #ui { display: none !important; } </style>
<div id="game"></div><div id="fx-layer"></div><div id="ui"></div>
<canvas id="comp" width="1920" height="1080"></canvas><div id="status"></div>
<script type="module" src="promo.js"></script>
```

## promo/promo.js (adapter)
Boot without `main.js` (which owns the rAF loop):
```js
const engine = new Engine(document.getElementById('game'));
const input = new Input(engine.canvas, engine.camera);
const game = new Game(engine, input);
game.audio.muted = true;
game._openLevelUp = function () { this.pendingLevelUps = 0; };   // no modal cards
game._openChest = function () { this.pendingChests = 0; };
const camOffset = new THREE.Vector3();                             // shots can frame a subject
const baseFollow = engine.follow.bind(engine);
engine.follow = (target, dt) => baseFollow(_ft.copy(target).add(camOffset), dt, 0);
function tickGame(dt) { game.update(dt); input.endFrame(); if (game.state === 'levelup') game.state = 'playing'; }
```
Staging API (verbs the shots read like a script):
```js
stage({ classId, act, actTime, zoom, skills: [['fireball', 5]], passives, seed }) {
  P.seed(seed); game.start({ classId });
  // clear enemies, jump to act/biome, disable spawner + scripted beats, max out skills,
  // god mode that still lets the Perfect Dodge fire:
  p.takeDamage = (a, s) => { if (p.dash.window > 0 && !p.dash.perfectUsed) take(a, s); };
  // snap camera, reset shake/flash/time scale
},
spawn(types, n, r0, r1, { hpMult }) {…},   boss(id, x, z) {…},
aim(target), move(x, z), moveScreen(sx, sy), dash(),
tick(dt) { __promo.advance(dt * 1000); tickGame(dt); },  warm(seconds) {…},
project(worldPos) -> {x, y},  on(event, fn) /* auto-removed at shot end via shot.cleanup */
```
Overlay: the game's floating combat text is DOM (`game.fx.texts`), so `overlay` redraws it on the plate at 1.55× scale, filtered per shot (`texts: 'all' | 'light' | 'none'`).

Renderer:
```js
window.promo = createRenderer({ width: 1920, height: 1080, fps: 60, duration: 15,
  canvas: document.getElementById('comp'), source: () => engine.canvas,
  shots: SHOTS, tick: tickGame, render: () => engine.render(),
  overlay: drawFloatingTexts, titles: drawTitles, cuts: CUTS,
  soundtrack: (d) => renderSoundtrack({ ...CUE, duration: d }), context: P, fonts: [...] });
```

## promo/shots.js (three representative shots)
```js
// Core loop: tough horde + reinforcement waves keeps the screen full while the kill counter climbs.
{ id: 'horde', t0: 1.5,
  setup(P) { P.stage({ classId: 'pyromancer', act: 0, actTime: 75, zoom: 0.78, seed: 21, skills: [['cinderBolt', 5], ['fireball', 5], ['meteor', 5]] });
             P.spawn(GREENSKINS, 220, 6, 20, { hpMult: 14 }); P.warm(0.5, () => P.moveScreen(1, 0.25)); P.shot.kills0 = P.game.stats.kills; },
  step(P, t) { P.aim(); P.moveScreen(1, 0.25); if (Math.round(t * 60) % 12 === 0) P.spawn(GREENSKINS, 16, 12, 18, { hpMult: 14 }); } },

// Skill moment synced to a real event: boss slam starts at shot start, the dash is triggered on
// game time, time ramps into slow-mo, and the shot records when the Perfect Dodge fired.
{ id: 'dodge', t0: 7.5,
  setup(P) { /* stage, boss above the hero, camOffset toward the boss, warm */
    b._pick = () => 'slam'; b._attack(P.game); P.shot.slamT = P.game.time;
    P.on('perfectDodge', () => { P.shot.perfectT ??= P.shot.t; P.engine._flash.amp = Math.min(P.engine._flash.amp, 0.22); }); },
  step(P, t) { const since = P.game.time - P.shot.slamT; if (!P.shot.dashed && since >= 0.95) { P.shot.dashed = true; P.dash(); } },
  speed: (t) => (t < 0.82 ? 1 : t < 0.97 ? 1 - 0.6 * smooth((t - 0.82) / 0.15) : t < 1.5 ? 0.4 : 0.4 + 0.6 * smooth((t - 1.5) / 0.3)),
  cuts: (s) => (s.perfectT != null ? [{ t: s.perfectT, punch: 0.1, flash: 0.5 }] : []),
  texts: 'light' },

// Montage cut (one of four, 0.5 s each): close-up, dash on the first frames.
classShot(3.5, { classId: 'arcanist', act: 0, skills: [['arcaneBolt', 5], ['spiritOrbs', 5]], enemies: GREENSKINS, seed: 31 }),
```

## promo/titles.js
```js
const M = createMotion({ W: 1920, H: 1080, ink: '#120a1a', fonts: { display: 'Cinzel', wordmark: '"Cinzel Decorative"', ui: 'Inter' } });
export function drawTitles(g, { T, P }) {
  if (T < 1.5) M.wordmark(g, T, { text: 'RIFTBOUND', y: 500, size: 210, exit: 1.3, tagline: 'HORDE-SURVIVAL ACTION RPG' });
  if (T >= 1.5 && T < 3.5) {
    M.featureTitle(g, T - 1.5, 2, { num: '01', label: 'HORDE SURVIVAL', l1: 'SURVIVE', l2: 'THE HORDE', accent: '#ffc340' });
    M.counter(g, T - 1.5, 2, P.shot.counter ??= {}, P.game.stats.kills - P.shot.kills0, { label: 'KILLS' });
  }
  M.cardSwap(g, T, CLASS_CUTS, { t0: 3.5, t1: 5.5, num: '02', label: 'FOUR CLASSES', accent: '#ffc340' });
  // 5.5 reactions: featureTitle + a chip formula fed by real 'reaction' events (game-specific)
  // 7.5 dodge: "TIME YOUR DASH…" until P.shot.perfectT, then M.speedLines at the hero + M.bigLabel('PERFECT','DODGE')
  // 9.5 fusion: featureTitle + recipe chips that collide into the result on the fusion frame
  // 11.5 bosses: M.lowerThird per boss with act name/colour and a filled roman numeral
  // 13.0 end card: M.wordmark + M.ctaPill + M.featureRow
}
export const CUE = { bpm: 120, intro: { end: 1.5 }, groove: { from: 1.5, to: 13, progression: ['Am', 'F', 'C', 'G'], busyFrom: 9.5 },
  cuts: [...majors, ...minors], slowmo: [{ t: 8.633, until: 9.0, release: 9.45 }], hits: [...], outro: { at: 13, riser: 1.0, roll: 0.5, sparkle: 13.78 } };
```

## Iteration log (what actually needed fixing)
1. The horde died during warm-up (Wildfire chain explosions) → `hpMult 14` + reinforcement waves; measured on-screen counts.
2. The Perfect Dodge never fired: the slow-mo ramp delayed the slam, so the dash came early → trigger on game time, measure `perfectT`, sync the music to it.
3. The perfect pulse tinted the screen green for ~1 s in slow-mo → clamp the pulse amplitude in the event handler.
4. The Cryomancer froze Vashkar blue → Stormcaller for that cut, fewer extras, `texts: 'light'`, closer zoom.
5. Outlined Cinzel numerals read "I" as "II" → filled numerals.
6. The wordmark gradient didn't show → gradient built in local glyph space.
7. Damage numbers over the blurred end card → `texts: 'none'` on logo and end card.
