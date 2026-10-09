// =====================================================================================
//  Promo adapter (project-specific). Copy to <project>/promo/promo.js and fill in:
//    1. boot the game without its main loop
//    2. a staging API (P) the shots use: start a scenario, spawn, aim, move, act…
//    3. SHOTS (shots.js), titles (titles.js), cue sheet for the soundtrack
//  Everything generic lives in ./kit.
// =====================================================================================
import { createRenderer } from './kit/renderer.js';
import { renderSoundtrack } from './kit/soundtrack.js';
import { SHOTS } from './shots.js';
import { drawTitles, CUTS, CUE } from './titles.js';

// ---- 1. boot ------------------------------------------------------------------------
// Prefer importing the game's classes and constructing them yourself (no main loop), e.g.
//   const game = new Game(canvas); window.__game = game;
// If the update lives inside the game's own requestAnimationFrame loop, import its entry
// module instead and drive it with __promo.pumpRAF() in tick() below (PROMO.raf = 'manual').
const game = /* TODO */ null;
const gameCanvas = /* TODO: the canvas the game draws into */ document.querySelector('canvas');

// ---- 2. staging API ---------------------------------------------------------------------
export const P = {
  game,
  seed: (n) => window.__promo.seed(n),
  // stage({ level, character, seed, zoom }) — fresh deterministic scenario: reset the game,
  // reseed, pick the level/loadout, disable modal UI + random spawner, make the hero invulnerable
  // (but keep the mechanic you want to show working), set the camera.
  stage(opts) { /* TODO */ },
  // warm(seconds) — unrendered simulation so the shot opens mid-action.
  warm(seconds, step = null) {
    const n = Math.round(seconds * 30);
    for (let i = 0; i < n; i++) { step?.(i / 30 - seconds); window.__promo.advance(1000 / 30); tickGame(1 / 30); }
  },
  // project(worldPos) -> {x, y} screen pixels (for overlays that track game objects)
  project(pos) { /* TODO */ return { x: 0, y: 0 }; },
  shot: null, // per-shot scratch (set by the renderer)
};
window.P = P;

function tickGame(dt) {
  // TODO: game.update(dt)   — or: window.__promo.pumpRAF() when driving the game's own loop
}

// ---- 3. renderer ----------------------------------------------------------------------
window.promo = createRenderer({
  width: 1920, height: 1080, fps: 60, duration: 15,
  canvas: document.getElementById('comp'),
  source: () => gameCanvas,
  shots: SHOTS,
  tick: tickGame,
  render: () => { /* TODO: renderer.render(scene, camera) / game.draw() */ },
  overlay: (g, f) => { /* optional: redraw DOM-based floating text / HUD bits you want visible */ },
  titles: drawTitles,
  cuts: CUTS,
  soundtrack: (duration) => renderSoundtrack({ ...CUE, duration }),
  context: P,
  fonts: ['900 100px Inter', '800 100px Inter'],
});
