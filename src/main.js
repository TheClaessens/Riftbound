import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Game } from './game/game.js';

const engine = new Engine(document.getElementById('game'));
const input = new Input(engine.canvas, engine.camera);
const game = new Game(engine, input);
window.__game = game; // handy for debugging in the console

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
  } catch (err) {
    // Keep the loop alive; log the first few errors only.
    if (errors++ < 5) console.error(err);
  }
  input.endFrame();
}
requestAnimationFrame(frame);
