// =====================================================================================
//  UI scale: one root unit. 1rem = 12 / 15 / 20 px at 1280×720 / 1920×1080 / 2560×1440
//  (floor 12 px so text stays legible at 720p), snapped to whole device pixels so frames and
//  icons land on the pixel grid. CSS authors in "1080p pixels" via --u (= 1rem / 15):
//    width: calc(64 * var(--u));
//  Never scale the UI with transform (blurs text). See design/UI.md §Scale.
// =====================================================================================
let mq = null;

export function applyUiScale() {
  const root = document.documentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;   // hidden pane can report 0
  const raw = Math.min(w / 128, h / 72);
  const rem = Math.min(22, Math.max(12, raw));
  root.style.fontSize = `${Math.round(rem * dpr) / dpr}px`;
  root.style.setProperty('--dpx', `${1 / dpr}px`);
}

export function installUiScale() {
  const onDpr = () => {
    applyUiScale();
    mq?.removeEventListener('change', onDpr);
    mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', onDpr);
  };
  window.addEventListener('resize', applyUiScale);
  onDpr();
}

// Snap a CSS-px coordinate to the device-pixel grid (use for translates that come to rest).
export function snapPx(x) {
  const d = window.devicePixelRatio || 1;
  return Math.round(x * d) / d;
}
