// =====================================================================================
//  Small DOM helpers for the HUD. Every setter remembers the last value it wrote, so the
//  per-frame HUD update only touches the DOM when something actually changed.
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

// Re-trigger a CSS animation by removing and re-adding a class.
export function restartAnim(el, cls = 'on') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function clamp01(x) {
  return Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0;
}

export function pct(x) {
  return (clamp01(x) * 100).toFixed(2) + '%';
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
