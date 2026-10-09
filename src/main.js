import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import { installUiScale } from './ui/scale.js';
import { ensureIcons } from './ui/icons/index.js';
import { platform } from './platform.js';

// The host SDK (CrazyGames build only) must be initialised before the game boots; on the
// web build this resolves at once, and on a slow or blocked SDK it gives up after a few seconds.
await platform.ready;
platform.loadingStart();

installUiScale();   // 1rem snapped to device pixels (css/theme.css authors in --u)
ensureIcons();      // inject the Crownforge icon sprite once

const engine = new Engine(document.getElementById('game'));
const input = new Input(engine.canvas, engine.camera);
const game = new Game(engine, input);
window.__game = game; // handy for debugging in the console
platform.attach(game);
platform.loadingStop();

let last = performance.now();
let errors = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    input.update();
    game.update(dt);
    engine.render();
    platform.update();
  } catch (err) {
    // Keep the loop alive; log the first few errors only.
    if (errors++ < 5) console.error(err);
  }
  input.endFrame();
}
requestAnimationFrame(frame);
