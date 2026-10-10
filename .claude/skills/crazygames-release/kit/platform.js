// =====================================================================================
//  Portal platform layer (crazygames-release skill kit). Copy to src/platform.js and import it
//  ONLY from the game's entry module, so test harnesses that build the game directly never load
//  an SDK.
//
//    'web'         the game's own site / local dev: no SDK, external links allowed
//    'crazygames'  the portal build: package-portal.ps1 sets window.PORTAL_PLATFORM and adds the
//                  SDK <script>; locally, ?platform=crazygames loads the SDK on demand
//
//  Entry module sketch (see SKILL.md, step 4):
//    import { platform } from './platform.js';
//    await platform.ready;            // capped wait: a slow or blocked SDK never holds up the game
//    platform.loadingStart();
//    ...build the game...
//    platform.attach({ isGameplay: () => game.state === 'playing' && game.byPlayer });
//    platform.loadingStop();
//    if (platform.autoStart) startRun();   // portals want gameplay within one click (or none)
//    platform.hideLoading();
//    // in the frame loop: platform.update();
//
//  Every SDK call is guarded (the SDK throws in its 'disabled' environment) and logged as
//  "[platform] <call>", so QA can read exactly what the portal received in the console.
//  TESTED in a shipped build: init, loading/gameplay events, auto-start, loading screen, boot timings.
//  UNTESTED here (Full Launch): ads, settings (muteAudio), data module. Verify them in the SDK's
//  'local' environment (localhost) before relying on them.
// =====================================================================================

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const INIT_TIMEOUT_MS = 4000;
const REPORT_GAP_MS = 1100;   // the SDK silently drops gameplayStart/Stop calls < 1 s apart

const query = new URLSearchParams(location.search);
export const PLATFORM = window.PORTAL_PLATFORM || (query.get('platform') === 'crazygames' ? 'crazygames' : 'web');

class Platform {
  constructor(name) {
    this.name = name;
    this.sdk = null;            // window.CrazyGames.SDK once init resolved in a working environment
    this.environment = 'none';  // 'local' | 'crazygames' | 'disabled' | 'none'
    this._inGameplay = false;   // what the SDK was last told
    this._lastReport = -Infinity;
    this._isGameplay = () => false;
    this._boot = { code: performance.now() };
    this.ready = name === 'crazygames' ? this._initCrazyGames() : Promise.resolve();
  }

  /** Portals forbid links to other sites; hide them with CSS: html[data-platform="crazygames"] [data-external]. */
  get allowExternalLinks() { return this.name === 'web'; }
  /** Portal builds skip the title screen and start a run right after loading. */
  get autoStart() { return this.name === 'crazygames'; }

  // `ready` settles on init or after INIT_TIMEOUT_MS, whichever comes first. A late init still
  // attaches: update() starts reporting from then on (an early version dropped the SDK for good
  // after the timeout and silently sent nothing, which failed the portal's automatic check).
  _initCrazyGames() {
    const init = (async () => {
      try {
        if (!window.CrazyGames?.SDK) await loadScript(SDK_URL);
        const SDK = window.CrazyGames.SDK;
        // package-portal.ps1 starts init at the top of <body>, overlapping the bundle download
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
      if (!this.sdk) console.warn(`[platform] SDK init still pending after ${INIT_TIMEOUT_MS} ms; starting anyway, events follow once it is up`);
      resolve();
    }, INIT_TIMEOUT_MS));
    return Promise.race([init, timeout]);
  }

  _call(name, ...args) {
    if (!this.sdk) return undefined;
    try { const r = this.sdk.game[name](...args); console.info(`[platform] ${name}`); return r; }
    catch (err) { console.warn(`[platform] SDK ${name} failed:`, err); return undefined; }
  }

  loadingStart() { this._call('loadingStart'); }
  loadingStop() { this.bootMark('built'); this._call('loadingStop'); }
  /** Sparingly: boss kills, a win, a new high score. */
  happytime() { this._call('happytime'); }

  /** isGameplay(): true while the player is actually playing (not paused, not in a menu or end
   *  screen, and not a scripted/bot run). Brief in-run choices (level-up cards) may count as play. */
  attach({ isGameplay }) { this._isGameplay = isGameplay; }

  /** Once per frame. Reports gameplay start/stop transitions, coalesced to the SDK's 1 s throttle:
   *  only the state that holds once the gap has passed is sent, so a quick pause/unpause sends nothing. */
  update(now = performance.now()) {
    if (!this.sdk) return;
    const active = !!this._isGameplay();
    if (active === this._inGameplay || now - this._lastReport < REPORT_GAP_MS) return;
    this._inGameplay = active;
    this._lastReport = now;
    this._call(active ? 'gameplayStart' : 'gameplayStop');
  }

  // ---------------------------------------------------------------- boot loading screen + timings
  /** Fade out #boot-loading (injected by package-portal.ps1) once the first frame is on screen. */
  hideLoading() {
    const el = document.getElementById('boot-loading');
    if (!el) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.bootMark('frame');
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 600);
    }));
  }

  /** Logs "[platform] boot: code … · sdk … · built … · first frame … ms" once (portal builds only). */
  bootMark(phase) {
    if (this._boot[phase] != null) return;
    this._boot[phase] = performance.now();
    if (phase !== 'frame' || this.name === 'web') return;
    const b = this._boot, f = (k, label) => (b[k] != null ? `${label} ${Math.round(b[k])} ms` : null);
    console.info(`[platform] boot: ${[f('code', 'code'), f('sdk', 'sdk'), f('built', 'built'), f('frame', 'first frame')].filter(Boolean).join(' · ')}`);
  }

  // ---------------------------------------------------------------- Full Launch (UNTESTED here)
  /** Midgame ads only at natural breaks (between runs), rewarded ads only on opt-in. Mute audio
   *  and freeze the game in onStart; undo in onEnd. Grant rewards only when `ok` is true.
   *  Resolves { ok, error }. Off-portal, or with the SDK unavailable, resolves { ok: false } at once. */
  requestAd(type, { onStart, onEnd } = {}) {
    return new Promise((resolve) => {
      if (!this.sdk) { resolve({ ok: false, error: 'no-sdk' }); return; }
      const done = (ok, error) => { try { onEnd?.(); } finally { resolve({ ok, error }); } };
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => onStart?.(),
          adFinished: () => done(true),
          adError: (err) => done(false, err?.code ?? err),   // adblock, unfilled, adCooldown, adsDisabledBasicLaunch…
        });
      } catch (err) { resolve({ ok: false, error: String(err) }); }
    });
  }

  /** Portal settings (muteAudio is required for Full Launch HTML5 games: it must override the
   *  game's own mute while set, without overwriting the player's saved preference). */
  onSettings(cb) {
    if (!this.sdk) return;
    try {
      cb(this.sdk.game.settings);
      this.sdk.game.addSettingsChangeListener((s) => cb(s));
    } catch (err) { console.warn('[platform] settings unavailable:', err); }
  }

  /** Save storage: the SDK data module on the portal (progress follows the account), localStorage
   *  elsewhere. Use only when environment === 'crazygames' so local test harnesses keep their own
   *  localStorage sandboxes. Requires "Progress Save" ticked at submission. Old localStorage keys
   *  are NOT imported by the SDK: copy them over once. */
  get storage() {
    if (this.sdk && this.environment === 'crazygames' && this.sdk.data) return this.sdk.data;
    return window.localStorage;
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
document.documentElement.dataset.platform = PLATFORM;
