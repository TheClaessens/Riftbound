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
    this.ready = name === 'crazygames' ? this._initCrazyGames() : Promise.resolve();
  }

  /** Platforms such as CrazyGames forbid links to other sites (patch notes, GitHub feedback). */
  get allowExternalLinks() { return this.name === 'web'; }

  async _initCrazyGames() {
    try {
      const SDK = await withTimeout((async () => {
        if (!window.CrazyGames?.SDK) await loadScript(SDK_URL);
        await window.CrazyGames.SDK.init();
        return window.CrazyGames.SDK;
      })(), INIT_TIMEOUT_MS);
      this.environment = SDK.environment;
      if (this.environment === 'disabled') return;
      this.sdk = SDK;
    } catch (err) {
      console.warn('[platform] CrazyGames SDK unavailable, continuing without it:', err);
    }
  }

  _call(fn) {
    if (!this.sdk) return;
    try { fn(); } catch (err) { console.warn('[platform] SDK call failed:', err); }
  }

  // main.js awaits `ready` first, so these bracket the game's construction (shader warm-up).
  loadingStart() { this._call(() => this.sdk.game.loadingStart()); }
  loadingStop() { this._call(() => this.sdk.game.loadingStop()); }

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
    this._call(() => (active ? this.sdk.game.gameplayStart() : this.sdk.game.gameplayStop()));
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

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timed out')), ms))]);
}

export const platform = new Platform(PLATFORM);
document.documentElement.dataset.platform = PLATFORM;   // css/style.css hides [data-external] off the web build
