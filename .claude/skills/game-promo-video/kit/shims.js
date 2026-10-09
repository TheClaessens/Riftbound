// =====================================================================================
//  Promo render shims (classic script, load BEFORE any game code).
//  Makes a browser game deterministic and resolution-locked so every frame can be
//  re-rendered identically:
//    - window.innerWidth/innerHeight/devicePixelRatio report the video size
//    - performance.now() / Date.now() follow a virtual clock the renderer advances
//    - Math.random() is a seeded PRNG (mulberry32), reseedable per shot
//    - optional: requestAnimationFrame callbacks are queued and pumped manually
//    - optional: setTimeout/setInterval fire on the virtual clock
//
//  Configure with a global set before this script:
//    <script>window.PROMO = { width: 1920, height: 1080, seed: 1, raf: 'manual', timers: 'real' }</script>
//  raf:    'manual' (default) = rAF never fires on its own; call __promo.pumpRAF() to run one frame
//          'real'             = leave rAF alone (use when you drive game.update() yourself and the
//                               game's own loop is harmless or not started)
//  timers: 'real' (default) | 'virtual' (setTimeout/setInterval follow the virtual clock)
// =====================================================================================
(() => {
  const cfg = Object.assign({ width: 1920, height: 1080, seed: 1, raf: 'manual', timers: 'real', epoch: Date.UTC(2026, 0, 1) }, window.PROMO || {});
  window.PROMO = cfg;

  for (const [k, v] of [['innerWidth', cfg.width], ['innerHeight', cfg.height], ['outerWidth', cfg.width], ['outerHeight', cfg.height], ['devicePixelRatio', 1]]) {
    Object.defineProperty(window, k, { get: () => v, configurable: true });
  }

  // ---- virtual clock
  let now = 0;
  performance.now = () => now;
  const RealDate = Date;
  const realNow = RealDate.now.bind(RealDate);
  Date.now = () => cfg.epoch + now;

  // ---- seeded RNG
  let s = cfg.seed | 0;
  Math.random = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---- requestAnimationFrame
  let rafQueue = new Map(), rafId = 0;
  if (cfg.raf === 'manual') {
    window.requestAnimationFrame = (cb) => { rafQueue.set(++rafId, cb); return rafId; };
    window.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
  }

  // ---- timers
  const timers = [];
  let timerId = 1e6;
  if (cfg.timers === 'virtual') {
    window.setTimeout = (fn, ms = 0, ...a) => { timers.push({ id: ++timerId, at: now + Math.max(0, ms), fn, a }); return timerId; };
    window.setInterval = (fn, ms = 0, ...a) => { timers.push({ id: ++timerId, at: now + Math.max(1, ms), fn, a, every: Math.max(1, ms) }); return timerId; };
    window.clearTimeout = window.clearInterval = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  }
  function runTimers() {
    for (let guard = 0; guard < 1000; guard++) {
      let best = -1;
      for (let i = 0; i < timers.length; i++) if (timers[i].at <= now && (best < 0 || timers[i].at < timers[best].at)) best = i;
      if (best < 0) return;
      const t = timers[best];
      if (t.every) t.at += t.every; else timers.splice(best, 1);
      try { typeof t.fn === 'function' ? t.fn(...t.a) : (0, eval)(t.fn); } catch (e) { console.error(e); }
    }
  }

  window.__promo = {
    config: cfg,
    get now() { return now; },
    // Advance the virtual clock by `ms` (fires virtual timers that came due).
    advance(ms) { now += ms; if (cfg.timers === 'virtual') runTimers(); },
    seed(n) { s = n | 0; },
    // Run the callbacks queued by the game's own requestAnimationFrame loop once, with the
    // virtual timestamp. Use this to drive games whose update lives inside their rAF loop.
    pumpRAF() {
      const q = rafQueue; rafQueue = new Map();
      for (const cb of q.values()) { try { cb(now); } catch (e) { console.error(e); } }
      return q.size;
    },
    realNow,
  };
})();
