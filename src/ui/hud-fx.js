// =====================================================================================
//  HUD overlays driven by game events (Crownforge, design/UI.md §6):
//    centre   act title card, boss intro stamp, "… falls" stamp, Rift Shift flash
//    player   PERFECT stamp above the character
//    lane     Chain milestone stamp, reaction feed, discovery toasts (queued, max 2)
//  Every one-shot is a WAAPI animation (no class restarts / forced reflow).
// =====================================================================================
import { REACTIONS } from '../game/combat.js';
import { ACTS } from '../game/acts.js';
import { RELICS, RELIC_TAG_COLOR } from '../game/relics.js';
import { FUSIONS, SKILLS } from '../game/skills/registry.js';
import { icon, ICON, hasIcon } from './icons/index.js';
import { flash, reducedMotion, fmtCount } from './hud-util.js';

const TOAST_MS = 3400;
const TOASTS_MAX = 2;
const FEED_S = 2.5;
const FEED_MAX = 4;
const FORGE = 'cubic-bezier(.2,.8,.2,1)';
const STAMP = 'cubic-bezier(.34,1.56,.64,1)';
const RIFT = 'cubic-bezier(.7,0,.84,0)';

const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

// Reaction mark: its own icon when drawn, else the two element gems colliding.
export function reactionMark(R) {
  if (hasIcon(ICON.react(R.id))) return icon(ICON.react(R.id), { cls: 'hud-react-ico' });
  const [a, b] = R.elements ?? [];
  return `<span class="hud-gems">${icon(ICON.el(a), { el: a, fallback: '◆' })}${icon(ICON.el(b), { el: b, fallback: '◆' })}</span>`;
}

const FX_HTML = `
  <div class="hud-tc" data-fx="tc">
    <div class="hud-tc-kick">act</div>
    <div class="hud-tc-num" data-fx="tcNum"></div>
    <div class="hud-tc-name" data-fx="tcName"></div>
    <i class="hud-tc-line" data-fx="tcLine"></i>
  </div>
  <div class="hud-bi" data-fx="bi">
    <div class="hud-bi-name" data-fx="biName"></div>
    <div class="cf-rule hud-bi-rule"><i></i></div>
    <div class="hud-bi-epi" data-fx="biEpi"></div>
  </div>
  <div class="hud-stamp" data-fx="stamp"></div>
  <div class="hud-shift" data-fx="shift"><i class="hud-shift-crack"></i></div>
  <div class="hud-perfect" data-fx="perfect"><span>perfect</span></div>
`;

export class HUDFx {
  constructor(game, root, hud) {
    this.game = game;
    this.root = root;
    this.hud = hud;
    this._unsub = [];
    this._queue = [];
    this._toasts = [];
    this.feed = new Map();   // reaction type -> { n, t, row, nEl }
    this._fading = [];       // { row, t }: expired rows, removed on game time (not onfinish)

    root.insertAdjacentHTML('beforeend', FX_HTML);
    const E = this.el = {};
    root.querySelectorAll('[data-fx]').forEach((n) => { E[n.dataset.fx] = n; });
    E.feed = hud.el.feed;
    E.toasts = hud.el.toasts;
    E.ms = hud.el.ms;

    const on = (ev, fn) => this._unsub.push(game.events.on(ev, fn));
    on('runStart', () => this.reset());
    on('actStart', ({ act }) => this._titleCard(act));
    on('announce', (e) => { if (e.kind === 'bossDown') this._stamp(e.text, e.color); });
    on('bossSpawned', ({ enemy }) => this._bossIntro(enemy));
    on('discovered', (e) => this._discovered(e));
    on('reaction', ({ type }) => this._reaction(type));
    on('chainMilestone', ({ chain }) => this._milestone(chain));
    on('perfectDodge', () => this._perfect());
    on('riftShift', () => this._shift());
  }

  // Clear everything transient (new run or abandoned run).
  reset() {
    for (const e of this.feed.values()) e.row.remove();
    this.feed.clear();
    for (const f of this._fading) f.row.remove();
    this._fading.length = 0;
    this._queue.length = 0;
    for (const t of this._toasts) { clearTimeout(t.timer); t.node.remove(); }
    this._toasts.length = 0;
    for (const k of ['tc', 'bi', 'stamp', 'shift', 'perfect']) this.el[k].getAnimations?.().forEach((a) => a.cancel());
  }

  update(dt) {
    // expired rows leave the DOM on game time: an onfinish that never fires (throttled or
    // hidden tab) used to pile stale duplicate chips down the right edge
    for (let i = this._fading.length - 1; i >= 0; i--) {
      const f = this._fading[i];
      if ((f.t -= dt) <= 0) { f.row.remove(); this._fading.splice(i, 1); }
    }
    if (!this.feed.size) return;
    for (const [k, e] of this.feed) {
      e.t -= dt;
      if (e.t <= 0) {
        this.feed.delete(k);
        const row = e.row;
        row.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(12px)' }], { duration: 220, easing: RIFT, fill: 'forwards' });
        this._fading.push({ row, t: 0.25 });
      }
    }
  }

  dispose() {
    this._unsub.forEach((u) => u?.());
    this._unsub = [];
    for (const t of this._toasts) clearTimeout(t.timer);
  }

  // ------------------------------------------------------------ act title card (≤ 2.3 s)
  _titleCard(actIdx) {
    const def = ACTS[actIdx];
    if (!def) return;
    const E = this.el;
    E.tcNum.textContent = def.numeral;
    E.tcName.textContent = def.name;
    E.tc.style.setProperty('--act', def.color);
    const calm = reducedMotion();
    E.tc.animate([
      { opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 },
    ], { duration: 2300, easing: 'linear' });
    if (!calm) {
      E.tcNum.animate([{ transform: 'scale(1.35)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: STAMP, fill: 'backwards' });
      E.tcName.animate([{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 160, easing: FORGE, fill: 'backwards' });
    }
    E.tcLine.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 520, delay: 220, easing: FORGE, fill: 'backwards' });
  }

  // ------------------------------------------------------------ boss intro: stamp, then settle up into the bar
  _bossIntro(enemy) {
    const E = this.el;
    const full = ACTS[this.game.act]?.bossName ?? enemy?.name ?? 'Boss';
    const i = full.indexOf(',');
    E.biName.textContent = i < 0 ? full : full.slice(0, i).trim();
    E.biEpi.textContent = i < 0 ? '' : full.slice(i + 1).trim().toLowerCase();
    E.bi.classList.toggle('prism', enemy?.id === 'riftHeart');
    E.tc.getAnimations?.().forEach((a) => a.cancel());   // never two centre cards at once
    const calm = reducedMotion();
    E.bi.animate([
      { opacity: 0, transform: calm ? 'none' : 'scale(1.18)' },
      { opacity: 1, transform: 'none', offset: 0.16, easing: 'linear' },
      { opacity: 1, transform: 'none', offset: 0.72, easing: RIFT },
      { opacity: 0, transform: calm ? 'none' : 'translateY(-22vh) scale(.5)' },
    ], { duration: 1200, easing: STAMP });
  }

  // ------------------------------------------------------------ centre stamp (boss down)
  _stamp(text, color) {
    const E = this.el;
    E.stamp.textContent = titleCase(text);
    E.stamp.style.setProperty('--c', color || 'var(--cf-gilt)');
    E.stamp.animate([
      { opacity: 0, transform: 'scale(1.2)' },
      { opacity: 1, transform: 'none', offset: 0.18 },
      { opacity: 1, transform: 'none', offset: 0.75 },
      { opacity: 0, transform: 'translateY(-10px)' },
    ], { duration: 1300, easing: FORGE });
  }

  // ------------------------------------------------------------ Rift Shift flash
  _shift() {
    const E = this.el;
    E.shift.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' });
    E.shift.firstElementChild.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)', offset: 0.4 }, { transform: 'scaleX(1)' }], { duration: 1100, easing: FORGE });
  }

  // ------------------------------------------------------------ PERFECT above the character (0.4 s)
  _perfect() {
    const P = this.hud._pScreen, E = this.el;
    if (!P.ok) return;
    const u = this.hud._uPx;
    E.perfect.style.transform = `translate3d(${Math.round(P.x)}px, ${Math.round(P.y - 96 * u)}px, 0)`;
    flash(E.perfect.firstElementChild, [
      { opacity: 0, transform: 'scale(1.25)' },
      { opacity: 1, transform: 'none', offset: 0.25 },
      { opacity: 1, transform: 'none', offset: 0.7 },
      { opacity: 0, transform: 'translateY(-8px)' },
    ], { duration: 520, easing: FORGE }, 100);
  }

  // ------------------------------------------------------------ Chain milestone stamp (beside the number)
  _milestone(chain) {
    const ms = this.el.ms;
    ms.textContent = `×${chain}!`;
    ms.classList.toggle('prism', chain >= 25);
    ms.animate([
      { opacity: 0, transform: 'rotate(-8deg) scale(1.4)' },
      { opacity: 1, transform: 'rotate(-8deg)', offset: 0.15 },
      { opacity: 1, transform: 'rotate(-8deg)', offset: 0.75 },
      { opacity: 0, transform: 'rotate(-8deg) translateY(-8px)' },
    ], { duration: 1200, easing: FORGE });
  }

  // ------------------------------------------------------------ reaction feed (newest on top, max 4)
  _reaction(type) {
    const R = REACTIONS[type];
    if (!R) return;
    let e = this.feed.get(type);
    if (!e) {
      const row = document.createElement('div');
      row.className = 'hud-fd';
      row.style.setProperty('--c', R.color);
      row.innerHTML = `<span class="hud-fd-ico">${reactionMark(R)}</span><span class="hud-fd-name">${R.name.toLowerCase()}</span><span class="hud-fd-n num"></span>`;
      e = { n: 0, t: FEED_S + 1, row, nEl: row.lastElementChild };
      this.feed.set(type, e);
      this.el.feed.prepend(row);
      row.animate([{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: FORGE });
      while (this.feed.size > FEED_MAX) {
        const [oldK, old] = [...this.feed].reduce((a, b) => (b[1].t < a[1].t ? b : a));
        old.row.remove();
        this.feed.delete(oldK);
      }
    } else if (this.el.feed.firstElementChild !== e.row) {
      this.el.feed.prepend(e.row);
    }
    e.n++;
    e.t = FEED_S;
    e.nEl.textContent = `×${fmtCount(e.n)}`;
    if (e.n > 1) flash(e.nEl, [{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 120 }, 120);
  }

  // ------------------------------------------------------------ discovery toasts (right lane)
  _discovered({ kind, id }) {
    if (kind === 'reactions') {
      const R = REACTIONS[id];
      if (R) this._enqueue({ kicker: 'new reaction', title: titleCase(R.name), desc: R.desc, ico: reactionMark(R), c: R.color });
    } else if (kind === 'fusions') {
      const f = FUSIONS.find((x) => x.def.id === id);
      if (f) {
        this._enqueue({
          kicker: 'fusion forged', title: f.def.name, prism: true, el: f.def.element,
          desc: `${SKILLS[f.a]?.name ?? '?'} + ${SKILLS[f.b]?.name ?? '?'}`,
          ico: icon(ICON.skill(id), { el: f.def.element, fallback: f.def.icon }),
        });
      }
    } else if (kind === 'relics') {
      const r = RELICS[id];
      if (r) {
        const acc = RELIC_TAG_COLOR[r.tag] ?? 'var(--cf-gilt)';
        this._enqueue({ kicker: 'relic discovered', title: r.name, desc: r.desc, acc, ico: icon(ICON.relic(id), { fallback: r.icon }) });
      }
    }
  }

  _enqueue(item) {
    this._queue.push(item);
    this._pump();
  }

  _pump() {
    while (this._toasts.length < TOASTS_MAX && this._queue.length) this._showToast(this._queue.shift());
  }

  _showToast(it) {
    const node = document.createElement('div');
    node.className = `hud-toast cf-plate${it.prism ? ' prism' : ''}`;
    if (it.acc) node.style.setProperty('--acc', it.acc);
    if (it.c) node.style.setProperty('--c', it.c);
    node.innerHTML = `
      ${it.prism ? '<i class="cf-prism hud-toast-crack"></i>' : ''}
      <div class="cf-socket hud-toast-ico"${it.el ? ` data-el="${it.el}"` : ''}>${it.ico ?? ''}</div>
      <div class="hud-toast-txt">
        <div class="hud-toast-kick">${it.kicker}</div>
        <div class="hud-toast-title">${it.title}</div>
        <div class="hud-toast-desc">${it.desc ?? ''}</div>
      </div>`;
    this.el.toasts.appendChild(node);
    const calm = reducedMotion();
    node.animate([{ opacity: 0, transform: calm ? 'none' : 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: FORGE });
    const t = { node, timer: 0 };
    t.timer = setTimeout(() => {
      const a = node.animate([{ opacity: 1 }, { opacity: 0, transform: calm ? 'none' : 'translateX(30px)' }], { duration: 240, easing: RIFT });
      a.onfinish = () => {
        node.remove();
        this._toasts.splice(this._toasts.indexOf(t), 1);
        this._pump();
      };
    }, TOAST_MS);
    this._toasts.push(t);
  }
}
