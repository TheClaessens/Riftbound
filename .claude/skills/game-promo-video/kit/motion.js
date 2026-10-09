// =====================================================================================
//  Motion-design kit for 2D-canvas titles. Every function is a pure function of local
//  time `lt` (seconds since the element's start), so stills match the final render.
//
//  const M = createMotion({ W: 1920, H: 1080, ink: '#120a1a',
//    fonts: { display: 'Cinzel', wordmark: '"Cinzel Decorative"', ui: 'Inter' } });
//  M.featureTitle(g, lt, 2, { num: '01', label: 'HORDE SURVIVAL', l1: 'SURVIVE', l2: 'THE HORDE', accent: '#ffc340' });
//
//  Building blocks: easing (prog, outExpo, outBack…), inkText, staggerText, slab, pool,
//  kicker. Compositions: featureTitle, wordmark, cardSwap, lowerThird, bigLabel, chip,
//  counter, speedLines, ctaPill, featureRow, bug.
// =====================================================================================
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const prog = (t, a, d) => clamp01((t - a) / d);
export const outCubic = (x) => 1 - (1 - x) ** 3;
export const outExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
export const inCubic = (x) => x * x * x;
export const outBack = (x, s = 1.9) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

export function createMotion({ W = 1920, H = 1080, ink = '#120a1a', fonts = {} } = {}) {
  const F = { display: fonts.display ?? 'Georgia', wordmark: fonts.wordmark ?? fonts.display ?? 'Georgia', ui: fonts.ui ?? 'Arial' };
  const INK = ink;

  function font(g, weight, size, family, tracking = 0) {
    g.font = `${weight} ${size}px ${family}`;
    g.letterSpacing = `${tracking}px`;
  }

  // Stroked + drop-shadowed text: legible over any gameplay plate.
  function inkText(g, str, x, y, { fill = '#fff', stroke = INK, sw = 8, shadow = 0.4 } = {}) {
    g.lineJoin = 'round';
    if (shadow > 0) { g.fillStyle = `rgba(0,0,0,${shadow})`; g.fillText(str, x, y + sw * 0.8); }
    if (sw > 0) { g.lineWidth = sw; g.strokeStyle = stroke; g.strokeText(str, x, y); }
    g.fillStyle = fill; g.fillText(str, x, y);
  }

  // Letters drop in one after another with overshoot. Set the font before calling.
  function staggerText(g, str, x, y, t, { stagger = 0.028, dur = 0.26, rise = 60, fill = '#fff', sw = 8, align = 'left', scaleFrom = 1 } = {}) {
    const total = g.measureText(str).width;
    const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    g.textAlign = 'left';
    for (let i = 0; i < str.length; i++) {
      const k = prog(t, i * stagger, dur);
      if (k <= 0) continue;
      const cx = x0 + g.measureText(str.slice(0, i)).width, w = g.measureText(str[i]).width;
      g.save();
      g.globalAlpha *= clamp01(k * 3);
      g.translate(cx + w / 2, y + (1 - outBack(k)) * rise);
      const s = lerp(scaleFrom, 1, outExpo(k)); g.scale(s, s);
      inkText(g, str[i], -w / 2, 0, { fill, sw });
      g.restore();
    }
    return total;
  }

  // Skewed colour slab: wipes in from the left (kIn 0..1), collapses to the right (kOut 0..1).
  function slab(g, x, y, w, h, color, kIn, kOut = 0, skew = -0.22) {
    if (kIn <= 0) return;
    const x0 = x + w * inCubic(kOut), x1 = x + w * outExpo(kIn);
    if (x1 <= x0) return;
    const sk = h * skew;
    g.beginPath();
    g.moveTo(x0 - sk, y); g.lineTo(x1 - sk, y); g.lineTo(x1, y + h); g.lineTo(x0, y + h);
    g.closePath(); g.fillStyle = color; g.fill();
  }

  // Soft dark pool behind a text block (readability over bright ground).
  function pool(g, x, y, rx, ry, a, rgb = '8,4,16') {
    if (a <= 0) return;
    g.save();
    g.translate(x, y); g.scale(rx / ry, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    gr.addColorStop(0, `rgba(${rgb},${0.55 * a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(-ry, -ry, ry * 2, ry * 2);
    g.restore();
  }

  // "01 | LABEL" kicker that slides in from the left.
  function kicker(g, num, label, x, y, lt, kOut, color) {
    const k = outExpo(prog(lt, 0, 0.3));
    if (k <= 0) return;
    g.save();
    g.globalAlpha *= k * (1 - inCubic(kOut));
    g.translate(-40 * (1 - k) - 60 * inCubic(kOut), 0);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    let lx = x;
    if (num) {
      font(g, 900, 26, F.ui, 2);
      const nw = g.measureText(num).width;
      g.fillStyle = color; g.fillRect(x, y - 24, nw + 22, 34);
      g.fillStyle = INK; g.fillText(num, x + 11, y + 2);
      lx = x + nw + 38;
    }
    font(g, 800, 25, F.ui, 7);
    inkText(g, label, lx, y + 2, { sw: 5, shadow: 0.3 });
    g.restore();
  }

  // Feature title (lower-left): kicker, white line 1 (letter stagger), line 2 on an accent slab.
  // Exits by sliding left over the last 0.16 s of `dur` (or at exitAt).
  function featureTitle(g, lt, dur, { num, label, l1, l2, accent, x = 118, y = 812, size = 118, exitAt }) {
    const out = prog(lt, (exitAt ?? dur) - 0.16, 0.16);
    if (out >= 1 || lt < 0) return;
    pool(g, x + 380, y + 10, 720, 250, prog(lt, 0, 0.2) * (1 - out));
    if (label) kicker(g, num, label, x, y - size - 44, lt, out, accent);
    g.save();
    g.translate(-90 * inCubic(out), 0);
    g.globalAlpha *= 1 - out;
    g.textBaseline = 'alphabetic';
    font(g, 900, size, F.display, 2);
    staggerText(g, l1, x, y, lt - 0.04, { rise: 50, sw: 9 });
    if (l2) {
      font(g, 900, size * 0.82, F.display, 2);
      const w2 = g.measureText(l2).width, sy = y + 22, sh = size * 0.92;
      slab(g, x - 18, sy, w2 + 54, sh, accent, prog(lt, 0.1, 0.28));
      g.save();
      g.beginPath(); g.rect(x - 40, sy, w2 + 120, sh); g.clip();
      const k2 = outExpo(prog(lt, 0.16, 0.3));
      g.fillStyle = INK; g.textAlign = 'left';
      g.fillText(l2, x + 10 - (1 - k2) * 60, sy + sh * 0.8 + (1 - k2) * sh * 0.4);
      g.restore();
    }
    g.restore();
  }

  // Big centred wordmark: letters scale-slam in, light streak, tracked tagline; optional zoom-out exit.
  function wordmark(g, lt, { text, y = 470, size = 200, exit = null, tagline, tagAt = 0.55,
    gradient = ['#fff6d8', '#ffd36a', '#ff8a2a'], glow = 'rgba(255,170,60,0.75)', streak = 'rgba(255,236,190,0.95)' }) {
    const out = exit != null ? prog(lt, exit, 0.2) : 0;
    if (out >= 1 || lt < 0) return;
    g.save();
    const s = 1 + 0.35 * inCubic(out);
    g.translate(W / 2, y); g.scale(s, s); g.translate(-W / 2, -y);
    g.globalAlpha *= 1 - inCubic(out);
    const ks = prog(lt, 0.3, 0.45);
    if (ks > 0) {
      const w = 1300 * outExpo(ks);
      const gr = g.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, streak.replace(/[\d.]+\)$/, `${(1 - 0.6 * ks).toFixed(3)})`)); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(W / 2 - w / 2, y + 44, w, 3);
    }
    font(g, 900, size, F.wordmark, 6);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const total = g.measureText(text).width, x0 = W / 2 - total / 2;
    for (let i = 0; i < text.length; i++) {
      const k = prog(lt, 0.06 + i * 0.03, 0.3);
      if (k <= 0) continue;
      const cx = x0 + g.measureText(text.slice(0, i)).width, w = g.measureText(text[i]).width, e = outExpo(k);
      g.save();
      g.globalAlpha *= clamp01(k * 2.5);
      g.translate(cx + w / 2, y - size * 0.35);
      const sc = lerp(2.4, 1, e); g.scale(sc, sc);
      g.translate(-w / 2, size * 0.35);
      const grad = g.createLinearGradient(0, -size * 0.72, 0, 6);    // local: baseline at y = 0
      gradient.forEach((c, j) => grad.addColorStop(j / (gradient.length - 1), c));
      g.shadowColor = glow; g.shadowBlur = 40 * (1 - 0.5 * e);
      g.lineJoin = 'round'; g.lineWidth = Math.max(6, size * 0.06); g.strokeStyle = INK;
      g.strokeText(text[i], 0, 0);
      g.shadowBlur = 0;
      g.fillStyle = grad; g.fillText(text[i], 0, 0);
      g.restore();
    }
    if (tagline) {
      const kt = prog(lt, tagAt, 0.45);
      if (kt > 0) {
        font(g, 800, Math.round(size * 0.15), F.ui, lerp(34, 13, outExpo(kt)));
        g.globalAlpha *= clamp01(kt * 2);
        g.textAlign = 'center';
        inkText(g, tagline, W / 2, y + size * 0.53, { sw: 6, shadow: 0.3 });
        g.textAlign = 'left';
      }
    }
    g.restore();
  }

  // One name per beat on a colour slab + "n/N" index (roster montages: classes, cars, weapons).
  // items: [{ t0, name, color, sub }]; group: { t0, t1, num, label, accent }.
  function cardSwap(g, T, items, group) {
    if (T < group.t0 || T >= group.t1) return;
    let idx = 0;
    for (let i = 0; i < items.length; i++) if (T >= items[i].t0) idx = i;
    const it = items[idx], lt = T - it.t0, gl = T - group.t0;
    const outAll = prog(gl, group.t1 - group.t0 - 0.16, 0.16);
    if (outAll >= 1) return;
    g.save();
    g.globalAlpha *= 1 - outAll;
    pool(g, 520, 840, 760, 260, 1);
    if (group.label) kicker(g, group.num, group.label, 118, 640, gl, outAll, group.accent ?? '#fff');
    const x = 118, y = 700, size = 132;
    font(g, 900, size, F.display, 3);
    const name = it.name.toUpperCase(), w = g.measureText(name).width;
    slab(g, x - 18, y, w + 60, size, it.color, prog(lt, 0, 0.12));
    g.save();
    g.beginPath(); g.rect(x - 60, y, w + 160, size); g.clip();
    const k = outExpo(prog(lt, 0.03, 0.22));
    g.fillStyle = INK; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillText(name, x + 12 - (1 - k) * 80, y + size * 0.82);
    g.restore();
    if (it.sub) {
      g.globalAlpha *= prog(lt, 0.08, 0.25);
      font(g, 700, 34, F.ui, 1);
      inkText(g, it.sub.toUpperCase(), x, y + size + 62, { sw: 6, fill: it.color });
    }
    g.restore();
    // index
    g.save();
    g.globalAlpha *= 1 - outAll;
    const ki = outBack(prog(lt, 0, 0.2));
    font(g, 900, 200, F.ui, -6);
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.translate(W - 120, 960); g.scale(ki, ki);
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineJoin = 'round';
    g.strokeText(String(idx + 1), -110, 0);
    font(g, 900, 64, F.ui, 0);
    inkText(g, `/${items.length}`, 0, 0, { sw: 6, fill: '#fff' });
    g.restore();
  }

  // Lower third for a named subject (boss, level, character): kicker, context line, name, subtitle, big numeral.
  function lowerThird(g, lt, { kickerNum, kickerLabel, kickerT = lt, kickerOut = 0, context, contextColor = '#fff', name, sub, numeral, numeralColor = '#fff', accent = '#fff', out = 0 }) {
    if (out >= 1 || lt < 0) return;
    g.save();
    g.globalAlpha *= 1 - out;
    pool(g, 560, 860, 820, 240, 1);
    if (kickerLabel) kicker(g, kickerNum, kickerLabel, 118, 690, kickerT, kickerOut, accent);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (context) {
      const ka = outExpo(prog(lt, 0, 0.2));
      font(g, 800, 30, F.ui, 8);
      g.save(); g.globalAlpha *= ka; g.translate(-40 * (1 - ka), 0);
      inkText(g, context.toUpperCase(), 118, 760, { sw: 6, fill: contextColor });
      g.restore();
    }
    font(g, 900, 108, F.display, 2);
    staggerText(g, name.toUpperCase(), 118, 880, lt - 0.02, { stagger: 0.018, dur: 0.2, rise: 40, sw: 9 });
    if (sub) {
      font(g, 700, 44, F.display, 6);
      g.save(); g.globalAlpha *= prog(lt, 0.06, 0.12);
      inkText(g, sub.toUpperCase(), 124, 944, { sw: 7, fill: '#ffe9b8' });
      g.restore();
    }
    g.restore();
    if (numeral) {
      g.save();
      g.globalAlpha *= 1 - out;
      const kr = outBack(prog(lt, 0, 0.22));
      g.translate(W - 140, 980); g.scale(kr, kr);
      font(g, 900, 300, F.display, 0);
      g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      inkText(g, numeral, 0, 0, { sw: 12, fill: numeralColor, shadow: 0.35 });   // fill, never outline-only (serif "I" reads as "II")
      g.restore();
    }
  }

  // Centred impact label for a gameplay moment (e.g. "PERFECT / DODGE"); slams in at lp = 0.
  function bigLabel(g, lp, { l1, l2, color = '#9dffb0', gradTop = '#f4fff6', glow = 'rgba(120,255,160,0.9)', y = 870, size = 176, out = 0, footer }) {
    if (lp < 0 || out >= 1) return;
    g.save();
    g.globalAlpha *= 1 - out;
    pool(g, W / 2, y - 40, 820, 230, 1);
    g.save();
    const s = lerp(1.9, 1, outExpo(prog(lp, 0, 0.16)));
    g.translate(W / 2, y); g.scale(s, s);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    font(g, 900, size, F.display, 6);
    g.shadowColor = glow; g.shadowBlur = 46;
    g.lineJoin = 'round'; g.lineWidth = 13; g.strokeStyle = INK;
    g.strokeText(l1, 0, 0);
    g.shadowBlur = 0;
    const gr = g.createLinearGradient(0, -size * 0.8, 0, 10);
    gr.addColorStop(0, gradTop); gr.addColorStop(1, color);
    g.fillStyle = gr; g.fillText(l1, 0, 0);
    if (l2) {
      font(g, 900, Math.round(size * 0.375), F.display, 24);
      const w = g.measureText(l2).width, sy = 26, sh = Math.round(size * 0.44);
      slab(g, -w / 2 - 40, sy, w + 80, sh, color, prog(lp, 0.06, 0.22));
      g.save();
      g.beginPath(); g.rect(-w / 2 - 70, sy, w + 140, sh); g.clip();
      const kk = outExpo(prog(lp, 0.1, 0.25));
      g.fillStyle = INK; g.fillText(l2, 12, sy + sh * 0.82 + (1 - kk) * 60);   // +12: letterSpacing trails the last glyph
      g.restore();
    }
    g.restore();
    if (footer) {
      const ks = prog(lp, 0.25, 0.3);
      if (ks > 0) {
        g.globalAlpha *= ks;
        font(g, 800, 30, F.ui, 5);
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        inkText(g, footer, W / 2, y + 160, { sw: 6, fill: '#ffffff' });
      }
    }
    g.restore();
  }

  // Pill chip; returns its width.
  function chip(g, x, y, text, color, { h = 64, fs = 30, textColor = INK, align = 'left' } = {}) {
    font(g, 900, fs, F.ui, 3);
    const w = g.measureText(text).width + 44;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.fillStyle = color;
    g.beginPath(); g.roundRect(x0, y - h / 2, w, h, h / 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = textColor; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, x0 + 22, y + 2);
    g.textBaseline = 'alphabetic';
    return w;
  }

  // Live number (kills, score, combo) that pops whenever it changes. `state` persists between frames.
  function counter(g, lt, dur, state, value, { x = W - 120, y = 830, label = 'KILLS', color = '#ffc340', size = 132, align = 'right' } = {}) {
    const kIn = outBack(prog(lt, 0.2, 0.3)), out = prog(lt, dur - 0.16, 0.16);
    if (kIn <= 0 || out >= 1) return;
    if (state.last === undefined) { state.last = value; state.bumpT = -9; }
    if (value !== state.last) { state.last = value; state.bumpT = lt; }
    const bump = 1 + 0.18 * Math.max(0, 1 - (lt - state.bumpT) / 0.12);
    g.save();
    g.globalAlpha *= 1 - out;
    g.translate(x + 80 * inCubic(out), y);
    g.scale(kIn * bump, kIn * bump);
    g.textAlign = align; g.textBaseline = 'alphabetic';
    font(g, 900, size, F.ui, -2);
    inkText(g, String(value), 0, 0, { sw: 10 });
    if (label) { font(g, 900, 30, F.ui, 8); inkText(g, label, align === 'right' ? -6 : 0, 50, { sw: 6, fill: color }); }
    g.restore();
  }

  // Radial speed-line burst around a screen point (k 0..1).
  function speedLines(g, cx, cy, k, { color = 'rgba(225,255,232,0.9)', n = 40, squash = 0.7 } = {}) {
    if (k <= 0 || k >= 1) return;
    g.save();
    g.globalAlpha *= 1 - k;
    g.strokeStyle = color;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.05;
      const r0 = 120 + 420 * outExpo(k) + (i % 4) * 26, r1 = r0 + 120 + (i % 5) * 50;
      g.lineWidth = 3 + (i % 3) * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * squash);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * squash);
      g.stroke();
    }
    g.restore();
  }

  // Call-to-action pill with a pop-in and a shine sweep.
  function ctaPill(g, lt, label, { x = W / 2, y = 700, from = ['#ffd36a', '#ff8a2a'], glow = 'rgba(255,170,60,0.6)' } = {}) {
    const kc = prog(lt, 0, 0.3);
    if (kc <= 0) return;
    g.save();
    const s = outBack(kc, 2.2);
    g.translate(x, y); g.scale(s, s);
    font(g, 900, 40, F.ui, 6);
    const w = g.measureText(label).width + 110, h = 92;
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, from[0]); gr.addColorStop(1, from[1]);
    g.shadowColor = glow; g.shadowBlur = 40;
    g.fillStyle = gr; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    const sh = prog(lt, 0.4, 0.5);
    if (sh > 0 && sh < 1) {
      g.save(); g.clip();
      const sx = lerp(-w / 2 - 100, w / 2 + 100, outCubic(sh));
      const sg = g.createLinearGradient(sx - 80, 0, sx + 80, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.75)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 4, 3);
    g.restore();
  }

  // Row of short facts separated by dots, staggered in.
  function featureRow(g, lt, items, { y = 860, gap = 70, dot = '#ffc340', colors = ['#fff', '#ffe9b8'] } = {}) {
    font(g, 800, 28, F.ui, 6);
    const widths = items.map((s) => g.measureText(s).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let x = W / 2 - total / 2;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (let i = 0; i < items.length; i++) {
      const k = prog(lt, i * 0.07, 0.25);
      if (k > 0) {
        g.save();
        g.globalAlpha *= k;
        g.translate(0, (1 - outCubic(k)) * 24);
        inkText(g, items[i], x, y, { sw: 5, shadow: 0.3, fill: colors[i % colors.length] });
        if (i < items.length - 1) { g.fillStyle = dot; g.beginPath(); g.arc(x + widths[i] + gap / 2, y - 10, 5, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      x += widths[i] + gap;
    }
  }

  // Small corner wordmark ("bug") shown during the feature section.
  function bug(g, k, text, { fill = '#ffd36a', x = W - 56, y = 74, size = 30 } = {}) {
    if (k <= 0) return;
    g.save();
    g.globalAlpha *= 0.85 * k;
    font(g, 900, size, F.wordmark, 3);
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    inkText(g, text, x, y, { sw: 6, fill, shadow: 0.25 });
    g.restore();
  }

  return { W, H, INK, F, font, inkText, staggerText, slab, pool, kicker, featureTitle, wordmark, cardSwap, lowerThird, bigLabel, chip, counter, speedLines, ctaPill, featureRow, bug };
}
