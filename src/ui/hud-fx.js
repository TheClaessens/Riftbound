// =====================================================================================
//  HUD overlays driven by game events: centre announcements, discovery banners (queued),
//  the act title card, Rift Shift and PERFECT flashes, chain milestones and the reaction
//  feed. CSS keyframes do the animation; this file only swaps content and restarts them.
// =====================================================================================
import { REACTIONS } from '../game/combat.js';
import { ACTS } from '../game/acts.js';
import { RELICS, RELIC_TAG_COLOR } from '../game/relics.js';
import { FUSIONS, SKILLS } from '../game/skills/registry.js';
import { restartAnim } from './hud-util.js';

const GOLD = '#d4af37';
const BANNER_MS = 3400;
const FEED_MS = 2.5;

const FX_HTML = `
  <div class="hud-announce">
    <div class="hud-ann-title" data-ref="annTitle"></div>
    <div class="hud-ann-sub" data-ref="annSub"></div>
  </div>
  <div class="hud-banner" data-ref="banner">
    <div class="hud-banner-kicker" data-ref="bKicker"></div>
    <div class="hud-banner-title" data-ref="bTitle"></div>
    <div class="hud-banner-desc" data-ref="bDesc"></div>
  </div>
  <div class="hud-titlecard" data-ref="titlecard">
    <div class="hud-tc-act">Act</div>
    <div class="hud-tc-num" data-ref="tcNum"></div>
    <div class="hud-tc-name" data-ref="tcName"></div>
    <div class="hud-tc-flavour" data-ref="tcFlav"></div>
  </div>
  <div class="hud-milestone" data-ref="milestone"></div>
  <div class="hud-feed" data-ref="feed"></div>
  <div class="hud-shift" data-ref="shift"></div>
  <div class="hud-perfect" data-ref="perfect"></div>
`;

export class HUDFx {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this._unsub = [];
    this._queue = [];
    this._busy = false;
    this._bannerTimer = 0;
    this._tcUntil = 0;
    this.feed = new Map();   // reaction type -> { n, t, R }

    root.insertAdjacentHTML('beforeend', FX_HTML);
    const q = (ref) => root.querySelector(`[data-ref="${ref}"]`);
    this.announce = root.querySelector('.hud-announce');
    this.annTitle = q('annTitle');
    this.annSub = q('annSub');
    this.banner = q('banner');
    this.bKicker = q('bKicker');
    this.bTitle = q('bTitle');
    this.bDesc = q('bDesc');
    this.titlecard = q('titlecard');
    this.tcNum = q('tcNum');
    this.tcName = q('tcName');
    this.tcFlav = q('tcFlav');
    this.milestone = q('milestone');
    this.feedEl = q('feed');
    this.shift = q('shift');
    this.perfect = q('perfect');

    const on = (ev, fn) => this._unsub.push(game.events.on(ev, fn));
    on('runStart', () => this.reset());
    on('actStart', ({ act }) => this._titleCard(act));
    on('announce', ({ text, sub, color }) => this._announce(text, sub, color));
    on('discovered', (e) => this._discovered(e));
    on('reaction', ({ type }) => this._reaction(type));
    on('chainMilestone', ({ chain }) => this._milestone(chain));
    on('perfectDodge', () => restartAnim(this.perfect, 'on'));
    on('riftShift', () => restartAnim(this.shift, 'on'));
  }

  // Clear everything transient (new run or abandoned run).
  reset() {
    this.feed.clear();
    this._renderFeed();
    this._queue.length = 0;
    this._tcUntil = 0;
    this._busy = false;
    clearTimeout(this._bannerTimer);
    for (const el of [this.banner, this.announce, this.titlecard, this.milestone]) el?.classList.remove('on');
  }

  update(dt) {
    if (!this.feed.size) return;
    let changed = false;
    for (const [k, e] of this.feed) {
      e.t -= dt;
      if (e.t <= 0) { this.feed.delete(k); changed = true; }
    }
    if (changed) this._renderFeed();
  }

  dispose() {
    this._unsub.forEach((u) => u?.());
    this._unsub = [];
    clearTimeout(this._bannerTimer);
  }

  // ------------------------------------------------------------ announcements
  _announce(text = '', sub = '', color = '#ffb38a') {
    this.annTitle.textContent = text;
    this.annTitle.style.color = color;
    this.annSub.textContent = sub || '';
    restartAnim(this.announce, 'on');
  }

  // ------------------------------------------------------------ discovery banners (queued)
  _discovered({ kind, id }) {
    if (kind === 'reactions') {
      const R = REACTIONS[id];
      if (R) this._enqueue({ kicker: 'NEW REACTION', title: R.name, desc: R.desc, color: R.color });
    } else if (kind === 'fusions') {
      const f = FUSIONS.find((x) => x.def.id === id);
      if (f) {
        this._enqueue({
          kicker: 'FUSION FORGED', title: f.def.name, color: GOLD,
          desc: `${SKILLS[f.a]?.name ?? '?'} + ${SKILLS[f.b]?.name ?? '?'}`,
        });
      }
    } else if (kind === 'relics') {
      const r = RELICS[id];
      if (r) {
        this._enqueue({
          kicker: 'RELIC DISCOVERED', title: `${r.icon} ${r.name}`, desc: r.desc,
          color: RELIC_TAG_COLOR[r.tag] ?? '#c08cff',
        });
      }
    }
  }

  _enqueue(item) {
    this._queue.push(item);
    if (!this._busy) this._nextBanner();
  }

  _nextBanner() {
    // never draw a banner over the act title card; wait until it has faded
    if (this._queue.length && performance.now() < this._tcUntil) {
      this._busy = true;
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => this._nextBanner(), 500);
      return;
    }
    const it = this._queue.shift();
    if (!it) { this._busy = false; return; }
    this._busy = true;
    this.banner.style.setProperty('--c', it.color);
    this.bKicker.textContent = it.kicker;
    this.bTitle.textContent = it.title;
    this.bDesc.textContent = it.desc || '';
    restartAnim(this.banner, 'on');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this._nextBanner(), BANNER_MS);
  }

  // ------------------------------------------------------------ act title card
  _titleCard(actIdx) {
    const def = ACTS[actIdx];
    if (!def) return;
    this.tcNum.textContent = def.numeral;
    this.tcName.textContent = def.name;
    this.tcFlav.textContent = def.flavour || '';
    this.titlecard.style.setProperty('--c', def.color);
    this._tcUntil = performance.now() + 3200;   // banners wait for the card (CSS animation is 3.2s)
    restartAnim(this.titlecard, 'on');
  }

  // ------------------------------------------------------------ chain milestone pill
  _milestone(chain) {
    const rainbow = chain >= 50;
    const col = chain >= 25 ? '#ff4fd8' : '#ffd34d';
    this.milestone.style.setProperty('--c', rainbow ? '#ffffff' : col);
    this.milestone.innerHTML = `<span class="${rainbow ? 'rb' : ''}">CHAIN ×${chain}!</span>`;
    restartAnim(this.milestone, 'on');
  }

  // ------------------------------------------------------------ reaction feed
  _reaction(type) {
    const R = REACTIONS[type];
    if (!R) return;
    const e = this.feed.get(type) ?? { n: 0, t: 0, R };
    e.n++;
    e.t = FEED_MS;
    this.feed.set(type, e);
    this._renderFeed();
  }

  _renderFeed() {
    this.feedEl.innerHTML = [...this.feed.values()].map((e) =>
      `<div class="hud-feed-e" style="color:${e.R.color}">${e.R.name} ×${e.n}</div>`).join('');
  }
}
