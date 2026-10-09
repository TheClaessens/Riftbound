// =====================================================================================
//  Riftbound promo adapter (built with the game-promo-video skill kit in ./kit).
//  The shared staging layer (stage.js) boots the game without its main loop and exposes
//  the staging API `P` the shots use; the kit does the rest (timeline, compositor,
//  encoder, soundtrack).
//
//  Console (http://localhost:8096/promo/):
//    await promo.still(8.7)          // frame at 8.7 s -> promo/out/still.jpg
//    await promo.sheet()             // contact sheet  -> promo/out/sheet.jpg
//    promo.start({ name: 'riftbound-promo.mp4' }); promo.job   // full render (poll job)
// =====================================================================================
import { createRenderer } from './kit/renderer.js';
import { renderSoundtrack } from './kit/soundtrack.js';
import { createStage } from './stage.js';
import { SHOTS } from './shots.js';
import { drawTitles, CUTS, CUE } from './titles.js';

const W = 1920, H = 1080;
const { engine, P, tickGame, drawFloatingTexts } = createStage({ W, H });
export { P };

// ------------------------------------------------------------------ renderer
window.promo = createRenderer({
  width: W, height: H, fps: 60, duration: 15,
  canvas: document.getElementById('comp'),
  source: () => engine.canvas,
  shots: SHOTS,
  tick: tickGame,
  render: () => engine.render(),
  overlay: drawFloatingTexts,
  titles: drawTitles,
  cuts: CUTS,
  soundtrack: (duration) => renderSoundtrack({ ...CUE, duration }),
  context: P,
  fonts: [
    '900 100px "Cinzel Decorative"', '700 100px "Cinzel Decorative"', '900 100px Cinzel', '800 100px Cinzel', '700 100px Cinzel',
    '900 100px Inter', '800 100px Inter', '700 100px Inter', '600 100px Inter',
  ],
});
