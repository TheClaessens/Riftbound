// =====================================================================================
//  Feedback panel (one shared Crownforge modal, opened from the title bar and the pause menu).
//  There is no backend and no token: the player's report goes to GitHub by opening a pre-filled
//  "new issue" page (an <a target=_blank>, which also works inside a sandboxed iframe) that they
//  submit themselves. The issue forms live in .github/ISSUE_TEMPLATE; the query names below
//  (template, title, details, run) must match the ids in those files.
// =====================================================================================
import { CLASSES } from '../game/classes.js';
import { ACTS } from '../game/acts.js';
import { GAME_VERSION, GAME_BUILD } from '../game/version.js';

const REPO_NEW_ISSUE = 'https://github.com/TheClaessens/Riftbound/issues/new';
const MAX_URL = 7000;          // GitHub rejects very long query strings; stay well under its ~8 KB limit
const DRAFT_KEY = 'riftbound.feedback.draft.v1';
const TRUNC_NOTE = '\n\n[truncated: the text was too long for a link]';

const KINDS = [
  { id: 'bug', label: 'Bug', prefix: '[Bug] ', title: 'Short summary of the problem', details: 'What happened, what you expected, and how to make it happen again.' },
  { id: 'balance', label: 'Balance', prefix: '[Balance] ', title: 'What feels too strong, too weak, too hard or too easy?', details: 'Where was it (class, skill, boss, Rift Tier)? Numbers and how it felt help.' },
  { id: 'idea', label: 'Idea', prefix: '[Idea] ', title: 'Your idea in one line', details: 'What would you like to see, and why would it make the game better?' },
  { id: 'other', label: 'Other', prefix: '[Other] ', title: 'What is on your mind?', details: 'Questions, comments, accessibility, anything else.' },
];

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const wf = (s) => (s.toWellFormed ? s.toWellFormed() : s);   // encodeURIComponent throws on lone surrogates
const enc = (s) => encodeURIComponent(wf(s));

/** "Mozilla/5.0 ... Chrome/129.0.0.0 Safari/537.36" -> "Chrome 129 / Windows". Nothing personal. */
export function shortUA(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '') {
  let browser = 'Unknown browser', m;
  if ((m = /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua))) browser = `Edge ${m[1]}`;
  else if ((m = /OPR\/(\d+)/.exec(ua))) browser = `Opera ${m[1]}`;
  else if ((m = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua))) browser = `Firefox ${m[1]}`;
  else if ((m = /(?:Chrome|CriOS)\/(\d+)/.exec(ua))) browser = `Chrome ${m[1]}`;
  else if ((m = /Version\/(\d+).*Safari/.exec(ua))) browser = `Safari ${m[1]}`;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} / ${os}` : browser;
}

/** Plain-text run details (render: text in the issue form). No personal data. */
export function runDetails(game) {
  const L = [`Version: ${GAME_VERSION}${GAME_BUILD ? ` (${GAME_BUILD})` : ''}`];
  const g = game;
  const live = g?.player && ['playing', 'paused', 'levelup', 'relic', 'shift', 'pact'].includes(g.state);
  if (live) {
    const cls = CLASSES[g.stats?.classId] ?? CLASSES[g.player.classId ?? g.player.cls?.id];
    const act = g.act ?? 0;
    L.push(`Class: ${cls?.name ?? g.stats?.classId ?? 'unknown'}`);
    L.push(`Act: ${act + 1} (${ACTS[act]?.name ?? '?'}) | Level ${g.player.level ?? '?'} | Rift Tier ${g.tier ?? 0}`);
    L.push(`Run time: ${fmtTime(g.time ?? 0)}`);
    if (g.boss && !g.boss.dead) {
      const name = String(ACTS[act]?.bossName ?? g.boss.name ?? 'Boss').split(',')[0];
      L.push(`Boss: ${name}${g.boss.phase ? `, phase ${g.boss.phase}` : ''}`);
    }
    const st = g.run?.stakes ?? {};
    const armed = [];
    if (st.haste) armed.push('Haste');
    if (st.echo) armed.push('Echo');
    if ((st.heat | 0) > 0) armed.push(`Wrath heat ${st.heat | 0}${st.affixes?.length ? ` (${st.affixes.join(', ')})` : ''}`);
    L.push(`Pacts sealed: ${armed.length ? armed.join(', ') : 'none'}`);
  } else L.push('Run: none (menu)');
  L.push(`Auto-cast: ${g?.autoCast ? 'on' : 'off'}`);
  L.push(`Screen: ${innerWidth}x${innerHeight} @${(window.devicePixelRatio || 1).toFixed(2).replace(/\.?0+$/, '')}x`);
  L.push(`Browser: ${shortUA()}`);
  return L.join('\n');
}

/** Build the GitHub "new issue" URL; shrinks `details` until the URL fits MAX_URL. */
export function buildIssueUrl(kindId, title, details, run) {
  const kind = KINDS.find((k) => k.id === kindId) ?? KINDS[0];
  const make = (d) => `${REPO_NEW_ISSUE}?template=${kind.id}.yml&title=${enc(kind.prefix + title.trim())}&details=${enc(d)}${run ? `&run=${enc(run)}` : ''}`;
  let url = make(details);
  if (url.length <= MAX_URL) return { url, truncated: false };
  let lo = 0, hi = details.length;          // largest n with make(details[:n] + note) <= MAX_URL
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    make(cut(details, mid) + TRUNC_NOTE).length <= MAX_URL ? (lo = mid) : (hi = mid - 1);
  }
  url = make(cut(details, lo) + TRUNC_NOTE);
  return { url, truncated: true };
}
const cut = (s, n) => { const c = s.charCodeAt(n - 1); return s.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n); };

export class FeedbackPanel {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.kind = 'bug';
    this.attach = true;
    this.run = '';
    this._from = null;
    this._copyT = 0;
    const el = this.el = ui._mkModal('md-fb', 'Feedback');
    el.innerHTML = `
      <div class="cf-backdrop" data-ref="back"></div>
      <form class="md-fb-panel cf-frame crown" novalidate autocomplete="off">
        <header class="md-fb-head">
          <h2 class="md-fb-title">Feedback</h2>
          <button type="button" class="cf-btn" data-ref="close">Close <span class="cf-key">esc</span></button>
        </header>
        <div class="md-fb-body">
          <div class="md-fb-row">
            <span class="cf-label">kind</span>
            <div class="md-seg md-fb-kinds" role="radiogroup" aria-label="Kind of feedback">
              ${KINDS.map((k) => `<button type="button" role="radio" data-kind="${k.id}">${k.label}</button>`).join('')}
            </div>
          </div>
          <label class="md-fb-field"><span class="cf-label">title <b class="md-fb-req">required</b></span>
            <input class="md-fb-in" type="text" data-ref="title" maxlength="120" spellcheck="true">
          </label>
          <label class="md-fb-field"><span class="cf-label">details</span>
            <textarea class="md-fb-in md-fb-ta" data-ref="details" rows="5" maxlength="4000" spellcheck="true"></textarea>
          </label>
          <div class="md-fb-attach">
            <button type="button" class="md-toggle is-on" data-ref="attach" role="switch" aria-checked="true"><i></i><span>Attach run details</span></button>
            <span class="md-fb-hint">Game version, class, act, level, tier, run time, screen size and browser. Nothing personal.</span>
          </div>
          <pre class="md-fb-run" data-ref="runPre" tabindex="0" aria-label="Run details that will be attached"></pre>
        </div>
        <footer class="md-fb-foot">
          <div class="md-fb-acts">
            <a class="cf-btn primary md-fb-go" data-ref="go" target="_blank" rel="noopener" href="${REPO_NEW_ISSUE}">Open on GitHub</a>
            <button type="button" class="cf-btn" data-ref="copy">Copy text</button>
            <span class="md-fb-status" data-ref="status" role="status" aria-live="polite"></span>
          </div>
          <p class="md-fb-small">Opens GitHub in a new tab. You need a free GitHub account; your report becomes a public issue. No account? Copy the text and send it to the team.</p>
        </footer>
      </form>`;
    const q = (r) => el.querySelector(`[data-ref="${r}"]`);
    this.r = { back: q('back'), close: q('close'), title: q('title'), details: q('details'), attach: q('attach'), runPre: q('runPre'), go: q('go'), copy: q('copy'), status: q('status') };
    this.kindBtns = [...el.querySelectorAll('[data-kind]')];
    this.form = el.querySelector('form');
    this.focusables = () => [...this.form.querySelectorAll('button, input, textarea, a[href], pre[tabindex]')].filter((n) => !n.hidden && !n.disabled && n.offsetParent !== null);

    this.form.addEventListener('submit', (e) => e.preventDefault());
    this.r.back.addEventListener('click', () => this.close());
    this.r.close.addEventListener('click', () => this.close());
    for (const b of this.kindBtns) b.addEventListener('click', () => { this.kind = b.dataset.kind; this._sync(); this._save(); });
    this.r.attach.addEventListener('click', () => { this.attach = !this.attach; this._sync(); this._save(); });
    for (const f of [this.r.title, this.r.details]) f.addEventListener('input', () => { this._sync(); this._save(); this._flash(''); });
    this.r.go.addEventListener('click', (e) => this._onGo(e));
    this.r.copy.addEventListener('click', () => this._copy());

    // While open: Esc closes, Tab stays inside, and keydown never reaches the game, the title screen
    // or the pause menu (their hotkeys: WASD, Space, 1-4, Enter, T, M, Esc). Default actions (typing,
    // Space on a button) are untouched, and keyup still flows so a key held on open is released.
    this._onKey = (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'Enter' && e.target === this.r.title) { e.preventDefault(); this.r.details.focus(); }
      else if (e.key === 'Tab') {
        const f = this.focusables();
        if (f.length) {
          const first = f[0], last = f[f.length - 1], a = document.activeElement;
          if (!this.form.contains(a)) { e.preventDefault(); first.focus(); }
          else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
        }
      }
      e.stopPropagation();
    };
    window.addEventListener('keydown', this._onKey, true);
  }

  get isOpen() { return this.el.classList.contains('is-open'); }

  open() {
    if (this.isOpen) return;
    this._from = document.activeElement;
    this._restore();
    this.run = runDetails(this.game);
    this.r.runPre.textContent = this.run;
    this._flash('');
    this._sync();
    this.ui._open(this.el);
    this.r.title.focus({ preventScroll: true });
    if (document.activeElement !== this.r.title) requestAnimationFrame(() => this.r.title.focus({ preventScroll: true }));
  }

  close(instant = false) {
    if (!this.isOpen) return;
    this.ui._close(this.el, instant);
    const back = this._from;
    this._from = null;
    if (!instant && back && back.isConnected && typeof back.focus === 'function' && !back.closest?.('[inert]')) back.focus({ preventScroll: true });
    else if (document.activeElement && this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  // ---- state -> DOM
  _sync() {
    const k = KINDS.find((x) => x.id === this.kind) ?? KINDS[0];
    for (const b of this.kindBtns) { const on = b.dataset.kind === k.id; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); }
    this.r.title.placeholder = k.title;
    this.r.details.placeholder = k.details;
    this.r.attach.classList.toggle('is-on', this.attach);
    this.r.attach.setAttribute('aria-checked', String(this.attach));
    this.r.runPre.hidden = !this.attach;
    const title = this.r.title.value, empty = !title.trim();
    this.r.title.classList.toggle('is-warn', this._warn && empty);
    const { url } = buildIssueUrl(k.id, title, this.r.details.value, this.attach ? this.run : '');
    this.r.go.href = url;
    this.r.go.setAttribute('aria-disabled', String(empty));
    this.r.go.classList.toggle('is-off', empty);
  }

  _flash(msg, cls = '') { this.r.status.textContent = msg; this.r.status.className = `md-fb-status${cls ? ` ${cls}` : ''}`; }

  _text() {
    const k = KINDS.find((x) => x.id === this.kind) ?? KINDS[0];
    let t = `${k.prefix}${this.r.title.value.trim()}\n\n${this.r.details.value.trim()}`;
    if (this.attach) t += `\n\n---\nRun details\n${this.run}`;
    return t;
  }

  _onGo(e) {
    if (!this.r.title.value.trim()) {     // a link cannot be disabled: block the navigation, point at the field
      e.preventDefault();
      this._warn = true;
      this._sync();
      this._flash('Add a title first.', 'is-warn');
      this.r.title.focus();
      return;
    }
    const { truncated } = buildIssueUrl(this.kind, this.r.title.value, this.r.details.value, this.attach ? this.run : '');
    this._flash(truncated ? 'Opened on GitHub. Details were shortened for the link.' : 'Opened on GitHub.', 'is-ok');
    // The href must stay as is until the browser has followed it; the draft is gone now, the fields reset right after.
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
    this._noSave = true;
    setTimeout(() => {
      this.r.title.value = ''; this.r.details.value = ''; this._warn = false; this._noSave = false;
      this._sync();
    }, 600);
  }

  async _copy() {
    const text = this._text();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* sandboxed or denied: fall back */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'md-fb-copybuf';
      this.form.appendChild(ta);
      const prev = document.activeElement;
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      prev?.focus?.({ preventScroll: true });
    }
    this._flash(ok ? 'Copied' : 'Could not copy. Select the text and copy it by hand.', ok ? 'is-ok' : 'is-warn');
    clearTimeout(this._copyT);
    if (ok) this._copyT = setTimeout(() => this._flash(''), 2500);
  }

  // ---- unsent draft (localStorage, never trusted to exist)
  _save() {
    if (this._noSave) return;
    try {
      const d = { kind: this.kind, title: this.r.title.value, details: this.r.details.value, attach: this.attach };
      if (!d.title && !d.details) localStorage.removeItem(DRAFT_KEY); else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch { /* storage unavailable */ }
  }

  _restore() {
    this._warn = false;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { d = null; }
    if (d && typeof d === 'object') {
      this.kind = KINDS.some((k) => k.id === d.kind) ? d.kind : this.kind;
      this.attach = d.attach !== false;
      this.r.title.value = String(d.title ?? '').slice(0, 120);
      this.r.details.value = String(d.details ?? '').slice(0, 4000);
    }
  }
}

