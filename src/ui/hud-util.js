// =====================================================================================
//  Small DOM helpers for the HUD. Every setter remembers the last value it wrote, so the
//  per-frame HUD update only touches the DOM when something actually changed. Per-frame
//  geometry goes through transform / opacity only (see design/UI.md §6 Perf).
// =====================================================================================

const memo = new WeakMap();
function store(el) {
  let m = memo.get(el);
  if (!m) { m = new Map(); memo.set(el, m); }
  return m;
}

export function setText(el, v) {
  if (!el) return;
  const m = store(el);
  if (m.get('t') !== v) { m.set('t', v); el.textContent = v; }
}

export function setHTML(el, v) {
  if (!el) return;
  const m = store(el);
  if (m.get('h') !== v) { m.set('h', v); el.innerHTML = v; }
}

export function setCss(el, prop, v) {
  if (!el) return;
  const m = store(el), k = 's:' + prop;
  if (m.get(k) !== v) { m.set(k, v); el.style[prop] = v; }
}

export function setVar(el, name, v) {
  if (!el) return;
  const m = store(el), k = 'v:' + name;
  if (m.get(k) !== v) { m.set(k, v); el.style.setProperty(name, v); }
}

export function setCls(el, name, on) {
  if (!el) return;
  on = !!on;
  const m = store(el), k = 'c:' + name;
  if (m.get(k) !== on) { m.set(k, on); el.classList.toggle(name, on); }
}

export function setAttr(el, name, v) {
  if (!el) return;
  const m = store(el), k = 'a:' + name;
  if (m.get(k) !== v) { m.set(k, v); el.setAttribute(name, v); }
}

/** transform: scaleX(p) for a fill (quantised so the memo skips repeats). */
export function setScaleX(el, p) {
  setCss(el, 'transform', `scaleX(${q(clamp01(p))})`);
}

/** Opacity, quantised to 1/64. */
export function setOpacity(el, a) {
  setCss(el, 'opacity', String(Math.round(clamp01(a) * 64) / 64));
}

// Re-trigger a CSS animation by removing and re-adding a class. Not for hot paths (forced
// reflow): one-shot flashes use flash() / WAAPI instead.
export function restartAnim(el, cls = 'on') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const lastFlash = new WeakMap();
/**
 * One-shot WAAPI animation, rate-limited per element (gap ms). Returns the Animation or null.
 * Cancels the previous one on the same element so restarts are clean.
 */
export function flash(el, keyframes, opts = {}, gap = 90) {
  if (!el || !el.animate) return null;
  const now = performance.now();
  const prev = lastFlash.get(el);
  if (prev && now - prev.t < gap) return null;
  prev?.a?.cancel();
  const a = el.animate(keyframes, { duration: 180, easing: 'ease-out', ...opts });
  lastFlash.set(el, { t: now, a });
  return a;
}

export function reducedMotion() {
  return matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function clamp01(x) {
  return Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0;
}

// quantise a 0..1 fraction to 1/2048 (keeps transform strings stable frame to frame)
export function q(x) {
  return Math.round(x * 2048) / 2048;
}

export function pct(x) {
  return (clamp01(x) * 100).toFixed(2) + '%';
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** HTML-escape (preview lines, affix names and object names come from game data). */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
}

export const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(5, n | 0))] ?? String(n);

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Compact counts for tight HUD slots: 999, 1.2k, 15k.
export function fmtCount(n) {
  n = Math.max(0, Math.floor(n || 0));
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

// Linear blend of two [r, g, b] triples.
export function lerp3(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function rgbHex([r, g, b]) {
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Light up the first n children of a pip row.
export function setPips(container, n) {
  if (!container) return;
  const kids = container.children;
  for (let i = 0; i < kids.length; i++) setCls(kids[i], 'on', i < n);
}

// Snap a CSS-px coordinate to the device-pixel grid (for translates that come to rest).
export function snap(x) {
  const d = window.devicePixelRatio || 1;
  return Math.round(x * d) / d;
}

/**
 * Bar meter with a JS-driven ghost chip (research 06 §3.2 / D1).
 * root contains .cf-bar-fill, .cf-bar-ghost, optional .cf-bar-shield and .hud-bar-flash.
 * update(dt, v, s): dt in game seconds (0 while paused); v, s = fractions of the track.
 */
export class Meter {
  constructor(root, { hold = 0.4, rate = 7 } = {}) {
    this.root = root;
    this.fill = root.querySelector('.cf-bar-fill');
    this.ghost = root.querySelector('.cf-bar-ghost');
    this.shield = root.querySelector('.cf-bar-shield');
    this.flashEl = root.querySelector('.hud-bar-flash');
    this.v = -1;
    this.g = 1;
    this.t = 0;
    this.hold = hold;
    this.rate = rate;
  }

  reset(v = 1) { this.v = v; this.g = v; this.t = 0; }

  update(dt, v, s = 0) {
    v = clamp01(v);
    s = clamp01(Math.min(s, 1 - v));
    if (this.v >= 0 && v < this.v - 1e-4) {   // took damage
      this.t = this.hold;
      if (this.flashEl) flash(this.flashEl, [{ opacity: 0.9 }, { opacity: 0 }], { duration: 200 });
    }
    this.v = v;
    if (this.g < v) this.g = v;                  // heal: the ghost follows at once
    else if (this.t > 0) this.t -= dt;           // hold the chip so the hit reads
    else this.g = v + (this.g - v) * Math.exp(-this.rate * dt);
    if (this.g - v < 0.001) this.g = v;

    setCss(this.fill, 'transform', `scaleX(${q(v)})`);
    if (this.ghost) setCss(this.ghost, 'transform', `scaleX(${q(this.g)})`);
    if (this.shield) setCss(this.shield, 'transform', `translateX(${(q(v) * 100).toFixed(3)}%) scaleX(${q(s)})`);
  }
}
