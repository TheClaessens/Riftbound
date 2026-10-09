// =====================================================================================
//  The Crownshard's Pact screen (v6). Contract: design/SHARD.md §4–5, spec: design/SHARD_PASSES.md Pass 3.
//  The game is paused (game.state === 'pact'); the engine grade has drained the world and the 3D shard keeps
//  turning behind this panel. Three pact columns (Echo, Wrath, Haste) with the same anatomy: sigil, name, tag,
//  Risk list, Reward list. Echo is a toggle, Wrath a 0–3 stepper (levels are cumulative), Haste is the primary
//  action "Call it now". Footer: the live cost of sealing + three verbs (Call it now / Seal the pact / Walk away).
//  Keys (only while game.state === 'pact'): 1 Echo, 2 raise Wrath, 3 lower Wrath, Enter seal, H call, Esc walk away.
//  Styles: css/pact.css (prefix pact-). API (kept from the placeholder):
//    new PactScreen(game, root); show(view, { onSeal(draft), onCall(draft), onLeave(), onDraft(draft) }); hide()
//  draft = { echo: bool, heat: 0..3 }. Nothing here changes game state: every verb goes through the handlers.
// =====================================================================================
import { icon, hasIcon, ICON } from './icons/index.js';

const IGNORE_MS = 300;          // a held click / key from combat can never seal anything (cf. the level-up modal)
const CLOSE_MS = 140;
const ROMAN = ['', 'I', 'II', 'III'];
const REDUCED = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const NUM_RE = /[+−-]?(?:x|×)?\d+(?:\.\d+)?(?:%|s\b|u\b)?/g;
const hl = (text) => esc(text).replace(NUM_RE, (m) => `<b class="cf-hl">${m}</b>`);
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const shortName = (full) => String(full ?? 'The boss').split(',')[0].trim();
const clampHeat = (n) => Math.max(0, Math.min(3, n | 0));

const KEYS = {
  Digit1: 'echo', Numpad1: 'echo', Digit2: 'up', Numpad2: 'up', Digit3: 'down', Numpad3: 'down',
  Enter: 'seal', NumpadEnter: 'seal', KeyH: 'call', Escape: 'leave',
};

// Pact identity. Colour is always paired with the sigil and the name (never colour alone).
const PACTS = {
  haste: { id: 'haste', icon: 'obeliskHaste', acc: '#bfefff', lo: '#6fb4cc', hi: '#f0fcff' },
  echo: { id: 'echo', icon: 'obeliskEcho', acc: '#b08cff', lo: '#6d3fc0', hi: '#e6d2ff' },
  wrath: { id: 'wrath', icon: 'obeliskWrath', acc: '#ff7a33', lo: '#b23c0e', hi: '#ffd0a8' },
};
const pactVars = (p) => `--acc:${p.acc};--acc-lo:${p.lo};--acc-hi:${p.hi}`;

// A small hazard diamond (shape, not a glyph) for the Low HP warning.
const WARN_SVG = '<svg class="ico pact-warn-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5L22.5 12 12 22.5 1.5 12z" style="fill:var(--hp-hi);stroke:var(--cf-void);stroke-width:2;stroke-linejoin:round;paint-order:stroke"/><path d="M10.6 6.6h2.8l-.5 7h-1.8z" style="fill:var(--cf-void)"/><circle cx="12" cy="16.8" r="1.5" style="fill:var(--cf-void)"/></svg>';

const sprite = (id, fallback) => icon(ICON.ui(id), { fallback });
const affixSprite = (def) => icon(def?.icon && hasIcon(ICON.ui(def.icon)) ? ICON.ui(def.icon) : ICON.ui('affix'), { fallback: '◆' });

function listHTML(lines) {
  return lines.map((l) => `<li>${hl(l)}</li>`).join('');
}

export class PactScreen {
  constructor(game, root) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'pact-screen';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'The Crownshard');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.inert = true;
    root.appendChild(this.el);
    this.h = null;
    this.view = null;
    this.draft = { echo: false, heat: 0 };
    this.R = {};
    this._held = new Set();
    this._ignoreUntil = 0;
    this._done = false;
    this._hideT = 0;

    this._onKey = (e) => {
      if (this.game.state !== 'pact' || !this.h) return;
      const act = KEYS[e.code];
      if (!act || e.ctrlKey || e.metaKey || e.altKey) return;
      // ours: keep it away from the pause menu, the input system and a focused button's own Enter
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || this._held.has(e.code) || performance.now() < this._ignoreUntil) return;
      this._act(act);
    };
    this._onKeyUp = (e) => this._held.delete(e.code);
    document.addEventListener('keydown', this._onKey, true);
    document.addEventListener('keyup', this._onKeyUp, true);
    game.events.on('runStart', () => this.hide(true));
  }

  // ------------------------------------------------------------------ public API

  show(view, handlers) {
    clearTimeout(this._hideT);
    this.view = view;
    this.h = handlers;
    this._done = false;
    this.draft = { echo: !!view.sealed.echo, heat: clampHeat(view.sealed.heat) };
    this._held = new Set(this.game.input?.down ?? []);
    this._ignoreUntil = performance.now() + IGNORE_MS;
    this._build();
    this._sync(true);
    this.el.classList.remove('is-closing');
    this.el.inert = false;
    this.el.removeAttribute('aria-hidden');
    this.el.classList.add('is-open');
    this.R.panel.focus({ preventScroll: true });
  }

  hide(instant = false) {
    clearTimeout(this._hideT);
    this.h = null;
    this.el.inert = true;
    this.el.setAttribute('aria-hidden', 'true');
    const wasOpen = this.el.classList.contains('is-open');
    this.el.classList.remove('is-open');
    if (!wasOpen || instant || REDUCED.matches) { this.el.classList.remove('is-closing'); return; }
    this.el.classList.add('is-closing');
    this._hideT = setTimeout(() => this.el.classList.remove('is-closing'), CLOSE_MS);
  }

  // Dev / harness: patch the draft as if the player had clicked ({ echo?, heat? }).
  setDraft(patch) { this._set(patch); }

  // ------------------------------------------------------------------ input

  _act(act) {
    if (!this.h || this._done) return;
    const d = this.draft, sealed = this.view.sealed;
    switch (act) {
      case 'echo':
        if (sealed.echo) { this._nudge(this.R.echoBtn); return; }
        this._set({ echo: !d.echo });
        break;
      case 'up':
        if (d.heat >= 3) { this._nudge(this.R.plus); return; }
        this._set({ heat: d.heat + 1 });
        break;
      case 'down':
        if (d.heat <= sealed.heat) { this._nudge(this.R.minus); return; }
        this._set({ heat: d.heat - 1 });
        break;
      case 'heat': break;   // handled by _onClick (row index)
      case 'seal':
        if (!(this._preview().levels > 0)) { this._nudge(this.R.seal); return; }
        this._finish('onSeal');
        break;
      case 'call': this._finish('onCall'); break;
      case 'leave': this._finish('onLeave'); break;
    }
  }

  _finish(kind) {
    if (this._done || !this.h) return;
    this._done = true;
    const h = this.h, d = { ...this.draft };
    if (kind === 'onLeave') h.onLeave?.();
    else h[kind]?.(d);
  }

  _onClick(e) {
    if (performance.now() < this._ignoreUntil) return;
    const t = e.target.closest?.('[data-act]');
    if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    t.blur?.();
    const act = t.dataset.act;
    if (act === 'heat') {
      const n = Number(t.dataset.n);
      const d = this.draft, sealed = this.view.sealed;
      if (n <= sealed.heat) { this._nudge(t); return; }               // sealed: locked
      this._set({ heat: n === d.heat ? n - 1 : n });                  // click the top lit row again to step back
      return;
    }
    this._act(act);
  }

  _set(patch) {
    const sealed = this.view.sealed;
    const d = this.draft;
    const next = { echo: patch.echo ?? d.echo, heat: clampHeat(patch.heat ?? d.heat) };
    if (sealed.echo) next.echo = true;                       // oaths stay sealed
    next.heat = Math.max(sealed.heat, next.heat);
    if (next.echo === d.echo && next.heat === d.heat) return;
    this.draft = next;
    this.h?.onDraft?.({ ...next });
    this._sync();
  }

  _nudge(el) {
    if (REDUCED.matches || !el?.animate) return;
    el.animate([{ translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '0 0' }], { duration: 180, easing: 'ease-out' });
  }

  _preview() {
    try { return this.game.obelisks?.answerPreview?.({ ...this.draft }) ?? { levels: 0, foes: 0, seconds: 0 }; } catch { return { levels: 0, foes: 0, seconds: 0 }; }
  }

  // ------------------------------------------------------------------ build (once per show)

  _build() {
    const v = this.view;
    const hv = v.haste ?? {}, ev = v.echo ?? {};
    const boss = shortName(v.bossName);
    this.el.innerHTML = `
      <div class="pact-backdrop"></div>
      <div class="pact-panel cf-frame crown" tabindex="-1" data-ref="panel">
        <header class="pact-head">
          <h2 class="pact-title">The Crownshard</h2>
          <p class="pact-sub"><b>${esc(boss)}</b> is drawn to its light <i class="pact-dot"></i> arrives in <b class="num pact-time">${fmtTime(v.timeLeft ?? 0)}</b></p>
        </header>

        <div class="pact-cols">
          <section class="pact-col pact-echo" style="${pactVars(PACTS.echo)}" data-pact="echo">
            ${this._headHTML(PACTS.echo, ev.title ?? 'Pact of Echo', ev.tag ?? 'The boss comes twice', '<span class="pact-badge" data-ref="echoBadge"></span>')}
            <div class="pact-body">
              <div class="pact-sec cost"><span class="pact-lbl"><i></i>risk</span><ul>${listHTML(ev.cost ?? [])}</ul></div>
              <div class="pact-sec pay"><span class="pact-lbl"><i></i>reward</span><ul>${listHTML(ev.pay ?? [])}</ul></div>
            </div>
            <button type="button" class="pact-ctl pact-toggle" data-act="echo" data-ref="echoBtn" aria-pressed="false">
              <i class="pact-box"></i><span class="pact-ctl-t" data-ref="echoTxt"></span><span class="cf-key">1</span>
            </button>
          </section>

          <section class="pact-col pact-wrath" style="${pactVars(PACTS.wrath)}" data-pact="wrath">
            ${this._headHTML(PACTS.wrath, 'Pact of Wrath', 'Feed it Heat', '<span class="pact-badge" data-ref="wrathBadge"></span>')}
            <div class="pact-heat">
              <div class="pact-stepper" role="group" aria-label="Wrath heat">
                <button type="button" class="pact-step" data-act="down" data-ref="minus" aria-label="Lower Heat"><i class="pact-sign"></i><span class="cf-key">3</span></button>
                <span class="pact-heat-lbl"><span class="cf-pips pact-pips" data-ref="pips"><i></i><i></i><i></i></span><b class="pact-heat-n" data-ref="heatN"></b></span>
                <button type="button" class="pact-step" data-act="up" data-ref="plus" aria-label="Raise Heat"><i class="pact-sign plus"></i><span class="cf-key">2</span></button>
              </div>
              <div class="pact-sec cost pact-risk"><span class="pact-lbl"><i></i>risk · boss affixes</span></div>
              <ol class="pact-aff" data-ref="aff">${this._affixRowsHTML()}</ol>
              <ul class="pact-hp pact-sec cost" data-ref="hpLines"></ul>
            </div>
            <div class="pact-body" data-ref="wrathBody"></div>
          </section>

          <section class="pact-col pact-haste" style="${pactVars(PACTS.haste)}" data-pact="haste">
            ${this._headHTML(PACTS.haste, hv.title ?? 'Pact of Haste', hv.tag ?? 'Call the boss now', '')}
            <div class="pact-body">
              <div class="pact-warn" data-ref="warn" hidden>${WARN_SVG}<span class="pact-warn-t"><b>Low HP</b><span>The boss arrives now, and you are not at full strength.</span></span></div>
              <div class="pact-sec cost"><span class="pact-lbl"><i></i>risk</span><ul>${listHTML((hv.cost ?? []).filter((l) => !/^low hp/i.test(l)))}</ul></div>
              <div class="pact-sec pay"><span class="pact-lbl"><i></i>reward</span><ul>${listHTML(hv.pay ?? [])}</ul></div>
            </div>
            <p class="pact-note" data-ref="hasteNote"></p>
            <button type="button" class="cf-btn primary pact-ctl pact-callbtn" data-act="call">Call it now <span class="cf-key">h</span></button>
          </section>
        </div>

        <footer class="pact-foot">
          <p class="pact-cost" data-ref="cost"><span class="pact-cost-ico">${sprite('swarm', '◎')}</span><span class="pact-cost-t" data-ref="costT"></span></p>
          <div class="pact-actions">
            <button type="button" class="cf-btn pact-btn-call" data-act="call">Call it now <span class="cf-key">h</span></button>
            <button type="button" class="cf-btn primary pact-btn-seal" data-act="seal" data-ref="seal">Seal the pact <span class="cf-key">enter</span></button>
            <button type="button" class="cf-btn pact-btn-leave" data-act="leave">Walk away <span class="cf-key">esc</span></button>
          </div>
        </footer>
      </div>`;
    const R = this.R = {};
    this.el.querySelectorAll('[data-ref]').forEach((n) => { R[n.dataset.ref] = n; });
    R.cols = {
      echo: this.el.querySelector('.pact-echo'), wrath: this.el.querySelector('.pact-wrath'), haste: this.el.querySelector('.pact-haste'),
    };
    R.rows = [...R.aff.children];
    this.el.querySelector('.pact-panel').addEventListener('click', (e) => this._onClick(e));
  }

  _headHTML(p, name, tag, extra) {
    return `<div class="pact-chead">
      <div class="cf-socket lit pact-sock" style="--el:${p.acc};--el-lo:${p.lo};--el-hi:${p.hi}">${icon(ICON.ui(p.icon), { fallback: '◆' })}</div>
      <div class="pact-ctitle"><h3 class="pact-name">${esc(name)}</h3><span class="pact-tag">${esc(tag)}</span></div>
      ${extra}
    </div>`;
  }

  _affixRowsHTML() {
    const aff = this.view.affixes ?? [];
    return [1, 2, 3].map((n) => {
      const a = aff[n - 1] ?? {};
      return `<li class="pact-aff-li"><button type="button" class="pact-aff-row" data-act="heat" data-n="${n}" title="${esc(`${a.name ?? ''}: ${a.desc ?? ''}`)}">
        <span class="pact-aff-n">${ROMAN[n]}</span>
        <span class="pact-aff-ico">${affixSprite(a)}</span>
        <span class="pact-aff-t"><b>${esc(a.name ?? '')}</b><span>${esc(a.desc ?? '')}</span></span>
        <span class="pact-aff-s"></span>
      </button></li>`;
    }).join('');
  }

  // ------------------------------------------------------------------ sync (every draft change)

  _sync(first = false) {
    const v = this.view, d = this.draft, sealed = v.sealed, R = this.R;
    const lock = icon(ICON.ui('lock'), { fallback: '◆' });

    // ---- echo
    const echoNew = d.echo && !sealed.echo;
    R.cols.echo.classList.toggle('is-sealed', !!sealed.echo);
    R.cols.echo.classList.toggle('is-new', echoNew);
    R.echoBtn.disabled = false;
    R.echoBtn.setAttribute('aria-pressed', String(!!d.echo));
    R.echoBtn.setAttribute('aria-disabled', String(!!sealed.echo));
    R.echoBtn.classList.toggle('is-locked', !!sealed.echo);
    R.echoBtn.classList.toggle('is-on', !!d.echo);
    R.echoTxt.textContent = sealed.echo ? 'Sealed' : d.echo ? 'Echo added' : 'Add Echo';
    R.echoBadge.innerHTML = sealed.echo ? `${lock}<span>sealed</span>` : echoNew ? '<span>added</span>' : '';
    R.echoBadge.hidden = !(sealed.echo || echoNew);

    // ---- wrath: stepper, affix rows, lists for the highest drafted level (cumulative)
    const heat = d.heat;
    const newHeat = heat > sealed.heat;
    R.cols.wrath.classList.toggle('is-sealed', sealed.heat > 0 && !newHeat);
    R.cols.wrath.classList.toggle('is-new', newHeat);
    R.cols.wrath.classList.toggle('is-idle', heat === 0);
    [...R.pips.children].forEach((p, i) => { p.className = i < sealed.heat ? 'on' : i < heat ? 'new' : ''; });
    R.heatN.textContent = heat > 0 ? `Heat ${ROMAN[heat]}` : 'No Heat';
    R.minus.disabled = heat <= sealed.heat;
    R.plus.disabled = heat >= 3;
    R.rows.forEach((row, i) => {
      const n = i + 1;
      const state = n <= sealed.heat ? 'lock' : n <= heat ? 'new' : 'off';
      const btn = row.firstElementChild;
      btn.dataset.state = state;
      btn.querySelector('.pact-aff-s').innerHTML = state === 'lock' ? `${lock}<span>sealed</span>` : state === 'new' ? '<span>added</span>' : '';
      btn.setAttribute('aria-pressed', String(n <= heat));
    });
    R.wrathBadge.innerHTML = sealed.heat > 0 && !newHeat ? `${lock}<span>heat ${ROMAN[sealed.heat]}</span>` : newHeat ? `<span>heat ${ROMAN[heat]}</span>` : '';
    R.wrathBadge.hidden = heat === 0;
    this._wrathLists();

    // ---- haste
    const hv = v.haste ?? {};
    R.warn.hidden = !hv.lowHp;
    R.cols.haste.classList.toggle('is-low', !!hv.lowHp);
    const pv = this._preview();
    const withHaste = this.game.obelisks?.answerPreview?.({ ...d, haste: true });
    R.hasteNote.textContent = pv.levels > 0 && withHaste && withHaste.foes === 0 ? 'Seals your draft too. No horde answers; the boss arrives in 3 s.' : 'The boss arrives in 3 s.';

    // ---- footer
    const wake = pv.levels > 0;
    R.costT.innerHTML = wake
      ? `Sealing wakes the horde: <b class="cf-hl">~${pv.foes}</b> foes converge on the shard.`
      : 'Nothing new to seal.';
    R.cost.classList.toggle('is-quiet', !wake);
    R.cost.title = wake ? `The Rift answers with ${pv.foes} foes and a Rift Pull for ${pv.seconds} s.` : '';
    R.seal.disabled = !wake;
    this.el.classList.toggle('has-draft', wake);
  }

  // Wrath: the affix rows ARE the risk (levels stack, so every row up to the drafted Heat is lit); the HP / damage
  // lines come from the highest drafted level, the Reward list stacks each level's perk with the top level's shards.
  // At Heat 0 it previews Heat I, dimmed.
  _wrathLists() {
    const v = this.view, heat = this.draft.heat, R = this.R;
    const top = heat > 0 ? heat : 1;
    const W = v.wrath ?? [];
    const pvTop = W[top];
    if (!pvTop) { R.wrathBody.innerHTML = ''; R.hpLines.innerHTML = ''; return; }
    const extra = (pvTop.cost ?? []).filter((l) => !/^boss gets harder/i.test(l));
    R.hpLines.innerHTML = listHTML(extra);
    R.hpLines.hidden = extra.length === 0;
    const pay = [];
    for (let k = 1; k < top; k++) if (W[k]?.pay?.[0]) pay.push(W[k].pay[0]);
    pay.push(...(pvTop.pay ?? []));
    R.wrathBody.innerHTML = `<div class="pact-sec pay"><span class="pact-lbl"><i></i>reward${heat === 0 ? ' · if you take Heat I' : top > 1 ? ` · Heat I to ${ROMAN[top]} stack` : ''}</span><ul>${listHTML(pay)}</ul></div>`;
  }
}
