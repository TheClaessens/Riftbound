// =====================================================================================
//  Riftbound promo: motion-design layer, cut accents and soundtrack cue sheet.
//  Generic building blocks come from kit/motion.js; the two game-specific read-outs
//  (live reaction formula, fusion recipe) are drawn here.
// =====================================================================================
import { CLASSES } from '../src/game/classes.js';
import { REACTIONS } from '../src/game/combat.js';
import { ACTS } from '../src/game/acts.js';
import { createMotion, prog, outBack, outExpo, outCubic, lerp } from '/__studio/kits/promo/motion.js';

const M = createMotion({ W: 1920, H: 1080, ink: '#120a1a', fonts: { display: 'Cinzel', wordmark: '"Cinzel Decorative"', ui: 'Inter' } });
const { W } = M;
const GOLD = '#ffc340', MINT = '#9dffb0';
const EL_COLOR = { fire: '#ff7a33', frost: '#7fe0ff', storm: '#ffe45c', arcane: '#c08cff' };
const PERFECT_T = 8.633;   // measured: global time the Perfect Dodge fires (soundtrack sync)

// Cut accents: zoom punch + white flash (the dodge adds its own via shots.js `cuts`).
export const CUTS = [
  { t: 0.0, punch: 0, flash: 0 },
  ...[1.5, 3.5, 5.5, 7.5, 9.5, 11.5].map((t) => ({ t, punch: 0.07, flash: 0.5 })),
  ...[4.0, 4.5, 5.0].map((t) => ({ t, punch: 0.05, flash: 0.3 })),
  ...[12.0, 12.5].map((t) => ({ t, punch: 0.05, flash: 0.35 })),
  { t: 13.0, punch: 0.08, flash: 0.7 },
];

// Soundtrack cue sheet (kit/soundtrack.js), on the same 120 BPM grid as the cuts.
export const CUE = {
  bpm: 120,
  intro: { end: 1.5 },
  groove: { from: 1.5, to: 13, progression: ['Am', 'F', 'C', 'G'], busyFrom: 9.5 },
  cuts: [
    ...[1.5, 3.5, 5.5, 7.5, 9.5, 11.5].map((t) => ({ t, kind: 'major', whoosh: t > 1.5 })),
    ...[['F', 3.5], ['Am', 4.0], ['C', 4.5], ['G', 5.0]].map(([chord, t]) => ({ t, kind: 'minor', chord })),
  ],
  slowmo: [{ t: PERFECT_T, until: 9.0, release: 9.45 }],
  hits: [{ t: 9.95, kind: 'chime' }, ...[11.5, 12.0, 12.5].map((t) => ({ t, kind: 'boom', chord: 'F' }))],
  outro: { at: 13, riser: 1.0, roll: 0.5, chord: 'Am', sparkle: 13.78 },
};

// ------------------------------------------------------------------ game-specific read-outs
// Reaction equation that follows the reactions actually happening on screen.
function reactionFormula(g, lt, dur, P) {
  const shot = P.shot;
  if (!shot?.reacts) return;
  const out = prog(lt, dur - 0.16, 0.16);
  if (out >= 1) return;
  // newest reaction, held at least 0.3 s, prefer a type different from the one shown
  shot.shown ??= null; shot.shownAt ??= -9;
  const last = shot.reacts[shot.reacts.length - 1];
  if (last && (!shot.shown || (lt - shot.shownAt > 0.3 && last.type !== shot.shown))) {
    const fresh = [...shot.reacts].reverse().find((r) => r.type !== shot.shown) ?? last;
    if (fresh.type !== shot.shown) { shot.shown = fresh.type; shot.shownAt = lt; }
  }
  if (!shot.shown) return;
  const R = REACTIONS[shot.shown];
  const k = outBack(prog(lt, shot.shownAt, 0.22));
  const x = W - 110, y = 150;
  g.save();
  g.globalAlpha *= 1 - out;
  M.font(g, 900, 30, 'Inter', 3);
  const wr = g.measureText(R.name).width + 44;
  let cx = x - wr;
  g.save();
  g.translate(cx + wr / 2, y); g.scale(k, k); g.translate(-(cx + wr / 2), -y);
  M.chip(g, cx, y, R.name, R.color);
  g.restore();
  const [a, b] = R.elements;
  const sign = (s) => { M.font(g, 900, 44, 'Inter', 0); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; M.inkText(g, s, cx - (s === '=' ? 26 : 28), y + 16, { sw: 6 }); cx -= 60; };
  cx -= 22;
  sign('=');
  for (const el of [b, '+', a]) {
    if (el === '+') { sign('+'); continue; }
    M.font(g, 900, 26, 'Inter', 3);
    const w = g.measureText(el.toUpperCase()).width + 44;
    M.chip(g, cx - w, y, el.toUpperCase(), EL_COLOR[el], { fs: 26, h: 54 });
    cx -= w + 8;
  }
  if (P.game.chain > 1) {
    M.font(g, 900, 46, 'Inter', 2);
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    M.inkText(g, `CHAIN ×${P.game.chain}`, x, y + 100, { sw: 7, fill: GOLD });
  }
  g.restore();
}

// Fusion recipe: two parent chips drift together and burst into the gold result at the fusion moment.
function fusionRecipe(g, lt, dur, fuseAt) {
  const out = prog(lt, dur - 0.16, 0.16);
  if (out >= 1) return;
  const y = 150, cx = W / 2;
  g.save();
  g.globalAlpha *= 1 - out;
  if (lt < fuseAt) {
    const kin = outExpo(prog(lt, 0.05, 0.35));
    const gap = lerp(300, 150, outCubic(prog(lt, 0.15, fuseAt - 0.15)));
    g.globalAlpha *= kin;
    M.chip(g, cx - gap - (1 - kin) * 400, y, 'CINDER BOLT', EL_COLOR.fire, { align: 'right' });
    M.chip(g, cx + gap + (1 - kin) * 400, y, 'METEOR', EL_COLOR.fire, { align: 'left' });
    M.font(g, 900, 54, 'Inter', 0); g.textAlign = 'center'; g.textBaseline = 'middle';
    M.inkText(g, '+', cx, y + 4, { sw: 7 });
  } else {
    const k = prog(lt, fuseAt, 0.3);
    if (k < 1) {
      g.save();
      g.globalAlpha *= 1 - k;
      g.strokeStyle = GOLD; g.lineWidth = 10 * (1 - k) + 2;
      g.beginPath(); g.arc(cx, y, 40 + 260 * outExpo(k), 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    const s = outBack(Math.min(1, k * 1.6), 2.4);
    g.save();
    g.translate(cx, y); g.scale(s, s); g.translate(-cx, -y);
    g.shadowColor = 'rgba(255,195,64,0.9)'; g.shadowBlur = 30;
    M.chip(g, cx, y, '✶ STARFALL', GOLD, { align: 'center', h: 84, fs: 42 });
    g.restore();
    const kt = prog(lt, fuseAt + 0.15, 0.3);
    if (kt > 0) {
      g.globalAlpha *= kt;
      M.font(g, 800, 24, 'Inter', 8); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      M.inkText(g, 'CINDER BOLT + METEOR', cx, y + 82, { sw: 5, shadow: 0.3, fill: '#ffe2b0' });
    }
  }
  g.restore();
}

// ------------------------------------------------------------------ sections
function dodge(g, T, P) {
  const lt = T - 7.5;
  if (lt < 0 || lt >= 2) return;
  const out = prog(lt, 1.84, 0.16);
  M.kicker(g, '04', 'PERFECT DODGE', 118, 150, lt, out, MINT);
  const eventT = P.shot?.perfectT;            // shot-local time of the real Perfect Dodge
  if (eventT == null || lt < eventT) {
    const k = prog(lt, 0.2, 0.2);
    if (k > 0) {
      g.save();
      g.globalAlpha *= k;
      M.font(g, 800, 44, 'Inter', 14);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      M.inkText(g, 'TIME YOUR DASH' + '.'.repeat(1 + (Math.floor((lt - 0.2) / 0.22) % 3)), W / 2, 960, { sw: 7 });
      g.restore();
    }
    return;
  }
  const lp = lt - eventT;
  const c = P.project(P.game.player.pos);
  g.save();
  g.globalAlpha *= 1 - out;
  M.speedLines(g, c.x, c.y, prog(lp, 0, 0.5));
  g.restore();
  M.bigLabel(g, lp, { l1: 'PERFECT', l2: 'DODGE', color: MINT, out, footer: 'SLOW-MO  ·  DASH REFUNDED  ·  +30% DAMAGE' });
}

const CLASS_CUTS = ['arcanist', 'pyromancer', 'cryomancer', 'stormcaller'].map((id, i) => {
  const c = CLASSES[id];
  return { t0: 3.5 + i * 0.5, name: c.name, color: c.color, sub: `${c.dash.name}  ·  ${c.trait.name}` };
});

const BOSS_CUTS = [
  [0, 11.5, 'Gorrak, the Troll King'],
  [1, 12.0, 'Vashkar, the Ashen Warchief'],
  [2, 12.5, 'Aurelith, the Prism Dragon'],
];
function bosses(g, T) {
  if (T < 11.5 || T >= 13) return;
  let i = 0;
  for (let k = 0; k < BOSS_CUTS.length; k++) if (T >= BOSS_CUTS[k][1]) i = k;
  const [act, t0, full] = BOSS_CUTS[i];
  const A = ACTS[act], [name, sub] = full.split(', ');
  const gl = T - 11.5, out = prog(gl, 1.36, 0.14);
  M.lowerThird(g, T - t0, {
    kickerNum: '06', kickerLabel: 'THREE ACTS  ·  THREE BOSSES', kickerT: gl, kickerOut: out, accent: GOLD,
    context: `ACT ${A.numeral}  —  ${A.name}`, contextColor: A.color, name, sub, numeral: A.numeral, numeralColor: A.color, out,
  });
}

function endCard(g, T) {
  const lt = T - 13;
  if (lt < 0) return;
  M.wordmark(g, lt, { text: 'RIFTBOUND', y: 450, size: 190, tagline: 'SLAY THE PRISM DRAGON', tagAt: 0.4 });
  M.ctaPill(g, lt - 0.75, 'PLAY NOW IN YOUR BROWSER', { y: 700 });
  M.featureRow(g, lt - 1.0, ['4 CLASSES', '6 REACTIONS', '10 FUSIONS', '3 BOSSES'], { y: 860 });
}

export function drawTitles(g, f) {
  const { T, P } = f;
  g.textBaseline = 'alphabetic';
  if (T < 1.5) M.wordmark(g, T, { text: 'RIFTBOUND', y: 500, size: 210, exit: 1.3, tagline: 'HORDE-SURVIVAL ACTION RPG', tagAt: 0.5 });
  M.bug(g, prog(T, 1.6, 0.3) * (1 - prog(T, 12.85, 0.15)), 'RIFTBOUND');
  if (T >= 1.5 && T < 3.5) {
    M.featureTitle(g, T - 1.5, 2, { num: '01', label: 'HORDE SURVIVAL', l1: 'SURVIVE', l2: 'THE HORDE', accent: GOLD });
    if (P.shot?.kills0 !== undefined) M.counter(g, T - 1.5, 2, P.shot.counter ??= {}, P.game.stats.kills - P.shot.kills0, { label: 'KILLS', color: GOLD });
  }
  M.cardSwap(g, T, CLASS_CUTS, { t0: 3.5, t1: 5.5, num: '02', label: 'FOUR CLASSES', accent: GOLD });
  if (T >= 5.5 && T < 7.5) {
    M.featureTitle(g, T - 5.5, 2, { num: '03', label: 'ELEMENTAL REACTIONS', l1: 'WEAVE', l2: '6 REACTIONS', accent: '#ff7ab8' });
    reactionFormula(g, T - 5.5, 2, P);
  }
  dodge(g, T, P);
  if (T >= 9.5 && T < 11.5) {
    M.featureTitle(g, T - 9.5, 2, { num: '05', label: 'SPELL FUSION', l1: 'FUSE', l2: '10 EVOLVED SPELLS', accent: GOLD });
    fusionRecipe(g, T - 9.5, 2, 0.45);
  }
  bosses(g, T);
  endCard(g, T);
}
