// =====================================================================================
//  Store assets for portals (CrazyGames): cover images and silent preview videos, rendered
//  by the promo kit from the real game. One page, any size: ?w=1920&h=1080 (landscape),
//  ?w=1080&h=1920 (portrait video), ?w=1600&h=2400 / ?w=1600&h=1600 (2x covers).
//
//  Console (Studio server, /promo/store/?w=..&h=..):
//    await store.cover('cover-portrait.jpg', { w: 800, h: 1200 }) // frame 0, downscaled
//    await promo.sheet({ every: 0.5 })                           // contact sheet
//    promo.start({ name: 'preview-landscape.mp4', bitrate: 12e6 }); promo.job
//    await store.verify('preview-landscape.mp4', 'cover-landscape.jpg')   // check + exact cover
//
//  Reload the page before every final render or cover: the game keeps some world state across
//  runs (geodes, debris), so only the first pass after a fresh load is reproducible.
// =====================================================================================
import { createRenderer } from '/__studio/kits/promo/renderer.js';
import { createStage } from '../stage.js';
import { SHOTS, DURATION, COVER_END, OUTRO_AT } from './shots.js';
import { inspectMp4 } from '/__studio/kits/promo/verify.js';
import { WORDMARK_MAIN, WORDMARK_SUB } from '../../src/game/brand.js';

const W = window.PROMO.width, H = window.PROMO.height;
const ASPECT = W / H;
const { engine, P, tickGame, drawFloatingTexts } = createStage({ W, H, fonts: { label: 'Grenze', num: '"Alegreya Sans"' } });

// Wider camera for tall frames (the engine keeps the vertical world extent fixed).
P.zoomK = ASPECT < 0.8 ? 0.78 : ASPECT < 1.2 ? 0.86 : 1;
const stage = P.stage;
P.stage = (o = {}) => stage({ ...o, zoom: (o.zoom ?? 1) * P.zoomK });

// ------------------------------------------------------------------ cover wordmark (title screen look, css/menus.css .mn-mark)
const VOID = '#0c0a12', GILT = '#ecd9a6', BRONZE_HI = '#c8a874';
const PRIMES = ['#ff7a33', '#7fe0ff', '#ffe45c', '#c08cff'];   // fire, frost, storm, arcane
const CROWN = new Path2D('M2 16L9 9L12.5 12L20 0L27.5 12L31 9L38 16Z');   // --orn-crown, 40x16

function wordmark(g, cx, baseY, S, { tagline = true } = {}) {
  const text = WORDMARK_MAIN;
  g.save();
  g.font = `700 ${S}px "Grenze Gotisch"`;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const m = g.measureText(text);
  const top = baseY - m.actualBoundingBoxAscent, bot = baseY + m.actualBoundingBoxDescent;

  // engraved void outline + cast shadow
  g.lineJoin = 'round';
  g.fillStyle = 'rgba(12,10,18,0.5)'; g.strokeStyle = 'rgba(12,10,18,0.5)'; g.lineWidth = S * 0.09;
  g.strokeText(text, cx, baseY + S * 0.065); g.fillText(text, cx, baseY + S * 0.065);
  g.strokeStyle = VOID; g.fillStyle = VOID;
  g.strokeText(text, cx, baseY); g.fillText(text, cx, baseY);

  // forged gilt face (hard-stop gradient over the glyph box)
  const grad = g.createLinearGradient(0, top, 0, bot);
  grad.addColorStop(0, '#fff6dc'); grad.addColorStop(0.36, '#fff6dc');
  grad.addColorStop(0.36, GILT); grad.addColorStop(0.62, GILT);
  grad.addColorStop(0.62, BRONZE_HI); grad.addColorStop(0.84, BRONZE_HI);
  grad.addColorStop(0.84, '#a8854f'); grad.addColorStop(1, '#a8854f');
  g.fillStyle = grad;
  g.fillText(text, cx, baseY);

  // crown point over the wordmark
  const cw = S * 0.57, ch = cw * 16 / 40;
  g.save();
  g.translate(cx - cw / 2, top - ch * 0.75); g.scale(cw / 40, ch / 16);
  g.fillStyle = VOID; g.translate(0.6, 0.6); g.fill(CROWN); g.translate(-0.6, -0.6);
  const cg = g.createLinearGradient(0, 0, 40, 16);
  cg.addColorStop(0, '#fff4d2'); cg.addColorStop(0.3, '#fff4d2'); cg.addColorStop(0.3, GILT); cg.addColorStop(0.6, GILT); cg.addColorStop(0.6, BRONZE_HI); cg.addColorStop(1, BRONZE_HI);
  g.fillStyle = cg; g.fill(CROWN);
  g.restore();

  // second line of the name, small under the big word (css/menus.css .mn-mark-sub)
  let lineBot = bot, lineW = m.width;
  if (WORDMARK_SUB) {
    const ss = S * 0.3, sy = bot + S * 0.08 + ss * 0.8;
    g.font = `700 ${ss}px Grenze`;
    g.letterSpacing = `${ss * 0.04}px`;
    g.lineWidth = ss * 0.2; g.strokeStyle = VOID; g.fillStyle = GILT;
    g.strokeText(WORDMARK_SUB, cx, sy); g.fillText(WORDMARK_SUB, cx, sy);
    lineBot = sy + ss * 0.2; lineW = Math.max(lineW, g.measureText(WORDMARK_SUB).width);
    g.letterSpacing = '0px';
  }

  // prism hairline between two gilt diamonds
  const half = lineW / 2, ry = lineBot + S * 0.12, dia = S * 0.05;
  const pg = g.createLinearGradient(cx - half, 0, cx + half, 0);
  PRIMES.forEach((c, i) => pg.addColorStop(i / (PRIMES.length - 1), c));
  g.fillStyle = VOID; g.fillRect(cx - half + dia * 1.6, ry - S * 0.017, half * 2 - dia * 3.2, S * 0.034);
  g.fillStyle = pg; g.fillRect(cx - half + dia * 1.6, ry - S * 0.009, half * 2 - dia * 3.2, S * 0.018);
  for (const x of [cx - half + dia * 0.6, cx + half - dia * 0.6]) {
    g.save(); g.translate(x, ry); g.rotate(Math.PI / 4);
    g.fillStyle = VOID; g.fillRect(-dia / 2 - 1.5, -dia / 2 - 1.5, dia + 3, dia + 3);
    g.fillStyle = GILT; g.fillRect(-dia / 2, -dia / 2, dia, dia);
    g.restore();
  }

  // tagline
  if (tagline) {
    const ts = S * 0.17;
    g.font = `800 ${ts}px "Alegreya Sans SC"`;
    g.letterSpacing = `${ts * 0.08}px`;
    g.lineWidth = ts * 0.24; g.strokeStyle = VOID; g.fillStyle = GILT;
    const ty = ry + S * 0.08 + ts;
    g.strokeText('cross the rifts · weave the primes · slay the prism dragon', cx, ty);
    g.fillText('cross the rifts · weave the primes · slay the prism dragon', cx, ty);
  }
  g.restore();
}

// Logo size and placement per aspect: big enough to read on a small store tile.
function coverLayout() {
  // base = baseline of the big word; the second line, the prism rule and the tagline sit under it
  if (ASPECT >= 1.2) return { S: H * 0.22, base: H * 0.74, tagline: true, shade: 0.45 };
  if (ASPECT >= 0.8) return { S: W * 0.22, base: H * 0.79, tagline: false, shade: 0.5 };
  return { S: W * 0.26, base: H * 0.83, tagline: false, shade: 0.55 };
}

function drawTitles(g, f) {
  if (!f.def.cover) return;
  const L = coverLayout();
  // legibility: darken the lower part of the frame under the logo, and a soft vignette
  const sh = g.createLinearGradient(0, H * L.shade, 0, H);
  sh.addColorStop(0, 'rgba(8,5,16,0)'); sh.addColorStop(0.55, 'rgba(8,5,16,0.55)'); sh.addColorStop(1, 'rgba(8,5,16,0.82)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(8,5,16,0)'); vg.addColorStop(1, 'rgba(8,5,16,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // fit the wordmark to 82% of the width
  g.font = `700 ${L.S}px "Grenze Gotisch"`;
  const S = Math.min(L.S, L.S * (W * 0.82) / g.measureText(WORDMARK_MAIN).width);
  wordmark(g, W / 2, L.base, S, { tagline: L.tagline });
}

// Cuts in and out of the cover: a short flash, no zoom punch (real-speed footage).
const CUTS = [
  { t: COVER_END, punch: 0.03, flash: 0.35 },
  ...SHOTS.filter((s) => s.t0 > COVER_END && s.t0 < OUTRO_AT).map((s) => ({ t: s.t0, punch: 0.02, flash: 0.18 })),
  { t: OUTRO_AT, punch: 0.03, flash: 0.45 },
];

// ------------------------------------------------------------------ renderer
const comp = document.getElementById('comp');
comp.width = W; comp.height = H;
const promo = createRenderer({
  width: W, height: H, fps: 60, duration: DURATION,
  canvas: comp,
  source: () => engine.canvas,
  shots: SHOTS,
  tick: tickGame,
  render: () => engine.render(),
  overlay: drawFloatingTexts,
  titles: drawTitles,
  cuts: CUTS,
  context: P,
  fonts: ['700 100px "Grenze Gotisch"', '800 100px "Alegreya Sans SC"', '800 100px Grenze', '800 100px "Alegreya Sans"', '700 100px Grenze'],
});
window.promo = promo;

// Cover = frame 0, optionally downscaled (render the page at 2x for the small covers).
async function cover(name, { w = W, h = H, type = 'image/jpeg', quality = 0.92 } = {}) {
  await promo.still(0, '_cover-src.jpg');
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(comp, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, type, quality));
  return promo.put(name, blob);
}
// Check a rendered video (duration, size, tracks, decoded frames → <file>-check.jpg); with
// `coverName`, also save its first frame: the cover image the video opens on, pixel for pixel.
async function verify(file, coverName) {
  const { info, frame0 } = await inspectMp4(promo.put, file);
  if (coverName && frame0) info.cover = await promo.put(coverName, await frame0.convertToBlob({ type: 'image/jpeg', quality: 0.93 }));
  return info;
}
window.store = { cover, verify, P };
