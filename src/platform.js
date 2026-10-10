// =====================================================================================
//  Host platform layer. The game runs in two places:
//    · 'web'         GitHub Pages / local dev. No SDK, external links allowed.
//    · 'crazygames'  the CrazyGames build (tools/package-crazygames.ps1 sets
//                    window.RIFTBOUND_PLATFORM and adds the SDK <script> to index.html).
//  Locally, ?platform=crazygames loads the SDK on demand (add &useLocalSdk=true off localhost).
//
//  Only main.js imports this module, so Game stays constructible in the sim, playtest,
//  uishots and promo harnesses, which never load an SDK.
//  Every SDK call is guarded: the SDK throws in its 'disabled' environment, and a missing or
//  blocked SDK must never stop the game.
// =====================================================================================

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const INIT_TIMEOUT_MS = 4000;
const REPORT_GAP_MS = 1100;   // the SDK throttles gameplayStart/Stop to one per second

const query = new URLSearchParams(location.search);
export const PLATFORM = window.RIFTBOUND_PLATFORM || (query.get('platform') === 'crazygames' ? 'crazygames' : 'web');

// Game states that count as active play for the SDK. Level-up and relic picks are brief in-run
// choices, so they stay "gameplay"; pause, end screens and the title are not.
const GAMEPLAY_STATES = new Set(['playing', 'shift', 'levelup', 'relic']);

class Platform {
  constructor(name) {
    this.name = name;
    this.sdk = null;            // window.CrazyGames.SDK once init resolved in a working environment
    this.environment = 'none';  // SDK environment: 'local' | 'crazygames' | 'disabled' | 'none'
    this._inGameplay = false;   // what the SDK was last told
    this._lastReport = -Infinity;
    this._playerRun = false;    // the current run was started from the menus (not a sim or script)
    this._boot = { code: performance.now() };   // ms since navigation start: code running, sdk, built, frame
    this.ready = name === 'crazygames' ? this._initCrazyGames() : Promise.resolve();
  }

  /** Record a boot phase; on 'frame' a portal build logs the whole timeline once, e.g.
   *  "[platform] boot: code 1830 ms · sdk 1910 ms · built 2420 ms · first frame 2480 ms". */
  bootMark(phase) {
    if (this._boot[phase] != null) return;
    this._boot[phase] = performance.now();
    if (phase !== 'frame' || this.name === 'web') return;
    const b = this._boot, f = (k, label) => (b[k] != null ? `${label} ${Math.round(b[k])} ms` : null);
    console.info(`[platform] boot: ${[f('code', 'code'), f('sdk', 'sdk'), f('built', 'built'), f('frame', 'first frame')].filter(Boolean).join(' · ')}`);
  }

  /** Platforms such as CrazyGames forbid links to other sites (patch notes, GitHub feedback). */
  get allowExternalLinks() { return this.name === 'web'; }

  /** Portal builds skip the title screen on boot and drop the player straight into a run with the
   *  title's own pick (last class and tier, or the first unlocked class). The Sanctum is still one
   *  click away from the end screen. */
  get autoStart() { return this.name === 'crazygames'; }

  /** Fade out the boot loading screen (#boot-loading, injected by tools/package-crazygames.ps1)
   *  once the first game frame is on screen. */
  hideLoading() {
    const el = document.getElementById('boot-loading');
    if (!el) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.bootMark('frame');
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 600);
    }));
  }

  // `ready` settles when init finishes or after INIT_TIMEOUT_MS, whichever is first, so a slow SDK
  // never holds up the game. A late init still attaches: update() starts reporting from then on.
  _initCrazyGames() {
    const init = (async () => {
      try {
        if (!window.CrazyGames?.SDK) await loadScript(SDK_URL);
        const SDK = window.CrazyGames.SDK;
        // the packaged index.html starts init before the game bundle downloads (window.__cgInit)
        await (window.__cgInit ?? SDK.init());
        this.environment = SDK.environment;
        this.bootMark('sdk');
        console.info(`[platform] CrazyGames SDK ready (environment: ${this.environment})`);
        if (this.environment !== 'disabled') this.sdk = SDK;
      } catch (err) {
        console.warn('[platform] CrazyGames SDK unavailable, continuing without it:', err);
      }
    })();
    const timeout = new Promise((resolve) => setTimeout(() => {
      if (!this.sdk) console.warn(`[platform] SDK init still pending after ${INIT_TIMEOUT_MS} ms; starting the game, events follow once it is up`);
      resolve();
    }, INIT_TIMEOUT_MS));
    return Promise.race([init, timeout]);
  }

  // Every call is logged ([platform] gameplayStart, ...) so QA can confirm events in the console.
  _call(name) {
    if (!this.sdk) return;
    try { this.sdk.game[name](); console.info(`[platform] ${name}`); } catch (err) { console.warn(`[platform] SDK ${name} failed:`, err); }
  }

  // main.js awaits `ready` first, so these bracket the game's construction (shader warm-up).
  loadingStart() { this._call('loadingStart'); }
  loadingStop() { this.bootMark('built'); this._call('loadingStop'); }

  /** Hook the game's lifecycle. Call once, after the Game is constructed. */
  attach(game) {
    this.game = game;
    game.events.on('runStart', (e) => { this._playerRun = !!e.player; });
  }

  /** Once per frame: report gameplay start/stop transitions to the SDK. The SDK drops calls that
   *  come within 1 s of the previous one, so a quick pause/unpause is coalesced: only the state
   *  that holds when the gap has passed is sent. */
  update(now = performance.now()) {
    const g = this.game;
    if (!g || !this.sdk) return;
    const active = this._playerRun && GAMEPLAY_STATES.has(g.state);
    if (active === this._inGameplay || now - this._lastReport < REPORT_GAP_MS) return;
    this._inGameplay = active;
    this._lastReport = now;
    this._call(active ? 'gameplayStart' : 'gameplayStop');
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export const platform = new Platform(PLATFORM);
document.documentElement.dataset.platform = PLATFORM;   // css/style.css hides [data-external] off the web build
