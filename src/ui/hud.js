// =====================================================================================
//  In-run HUD, Crownforge style (design/UI.md §6).
//    top centre   act timeline (act gems, 0:00-3:00 track with beat markers, timer, beat
//                 ribbon) / boss bar (Tier-1 crowned frame, ghost chip, phase notch, ward)
//    top left     relic tray
//    bottom       one Tier-1 action bar: level chip, HP + XP, dash, 5 skill sockets,
//                 auto-skill sockets, auto-cast chip; buff squares beside it
//    under player status cluster (mini HP, dash pips, Frost Armor, Momentum)
//    right lane   Chain, Resonance (Arcanist), reaction feed + toasts (hud-fx.js)
//    edges        markers for the shrine, the Relic Bearer and dropped chests
//  Updated every frame, but every write goes through the memoised setters in hud-util.js
//  and per-frame geometry is transform/opacity only. Transient overlays live in hud-fx.js.
// =====================================================================================
import * as THREE from 'three';
import { FUSIONS } from '../game/skills/registry.js';
import { SLOT_KEYS, MAX_AUTOS } from '../game/player.js';
import { ACTS, ACT_LENGTH } from '../game/acts.js';
import { RELIC_TAG_COLOR } from '../game/relics.js';
import { BEATS } from '../game/spawner.js';
import { WARD_CYCLE } from '../game/bosses.js';
import { icon, ICON } from './icons/index.js';
import { HUDFx } from './hud-fx.js';
import {
  setText, setHTML, setCss, setVar, setCls, setAttr, setScaleX, setOpacity, flash,
  clamp01, q, fmtTime, fmtCount, lerp3, rgbHex, setPips, snap, Meter,
} from './hud-util.js';

// Kept for ui.js (pause build view); the HUD itself draws dash icons with icon().
export const DASH_GLYPH = { blink: '⟶', flame: '✹', frost: '❄', storm: '⚡' };

const FUSION_IDS = new Set(FUSIONS.map((f) => f.def.id));
const KEY_HTML = [
  `<span class="cf-key hud-key mouse">${icon(ICON.ui('mouse-l'), { fallback: 'L' })}</span>`,
  `<span class="cf-key hud-key mouse">${icon(ICON.ui('mouse-r'), { fallback: 'R' })}</span>`,
  '<span class="cf-key hud-key">q</span>',
  '<span class="cf-key hud-key">e</span>',
  '<span class="cf-key hud-key">r</span>',
];
const BEAT_ICON = { surge: ['surge', '♛'], swarm: ['swarm', '◎'], boss: ['boss', '☠'] };
const CHAIN_WHITE = [255, 255, 255], CHAIN_AMBER = [224, 160, 48];
const RIBBON_LEAD = 10;      // seconds of "Elite Surge in 0:08" before a beat
const RIBBON_HOLD = 3;       // seconds the beat name stays after it lands
const MARKERS = 5;           // pooled edge markers (boss + shrine + bearer + 2 chests)

const _v = new THREE.Vector3();
const _m = new THREE.Vector3();

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const pips = (n) => '<i></i>'.repeat(n);
const ringSvg = (cls) => `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><circle class="bg" cx="20" cy="20" r="17"/><circle class="fg" cx="20" cy="20" r="17" pathLength="100" stroke-dasharray="0 100"/></svg>`;

const TEMPLATE = `
  <div class="hud-vig" data-ref="vig"></div>
  <div class="hud-vig-hit" data-ref="vigHit"></div>
  <div class="hud-markers" data-ref="markers"></div>

  <div class="hud-top" data-ref="top">
    <div class="hud-act cf-plate flat" data-ref="act">
      <div class="hud-act-gems" data-ref="gems"><i></i><i></i><i></i></div>
      <div class="hud-tl" data-ref="tl">
        <div class="hud-tl-track"><i class="hud-tl-fill" data-ref="tlFill"></i><i class="hud-tl-ticks"></i></div>
        <div class="hud-tl-headw" data-ref="tlHead"><i class="hud-tl-head"></i></div>
        <div class="hud-tl-beats" data-ref="tlBeats"></div>
      </div>
      <div class="hud-timer" data-ref="timerBox"><i class="hud-hold"></i><span class="num outlined" data-ref="timer">0:00</span></div>
    </div>
    <div class="hud-ribbon cf-plate flat" data-ref="ribbon">
      <span class="hud-rb-ico" data-ref="rbIco"></span>
      <span class="hud-rb-txt" data-ref="rbTxt"></span>
      <span class="hud-rb-t num" data-ref="rbT"></span>
    </div>
    <div class="hud-boss cf-frame crown" data-ref="boss">
      <div class="hud-ward" data-ref="ward">
        <div class="cf-socket round hud-ward-sock" data-ref="wardSock"><span class="hud-ward-gem" data-ref="wardGem"></span></div>
        ${ringSvg('hud-ward-ring')}
        <span class="hud-ward-t num" data-ref="wardT"></span>
      </div>
      <div class="hud-boss-head">
        <span class="hud-boss-name" data-ref="bossName"></span>
        <span class="hud-boss-epi" data-ref="bossEpi"></span>
      </div>
      <div class="hud-boss-row">
        <div class="cf-bar hud-boss-bar" data-ref="bossBar">
          <div class="cf-bar-track"><i class="cf-bar-ghost"></i><i class="cf-bar-fill"></i><i class="hud-bar-flash"></i></div>
          <i class="hud-boss-notch" data-ref="bossNotch"></i>
          <div class="cf-prism hud-boss-prism"></div>
        </div>
        <span class="cf-pips hud-boss-ph" data-ref="bossPh"><i class="on"></i><i></i></span>
      </div>
    </div>
  </div>

  <div class="hud-relics cf-plate" data-ref="relics"></div>

  <div class="hud-lane" data-ref="lane">
    <div class="hud-chain" data-ref="chain">
      <span class="hud-chain-lbl">chain</span>
      <span class="hud-chain-n num" data-ref="chainN"><span class="hud-chain-base" data-ref="chainBase"></span><span class="hud-chain-prism" data-ref="chainPrism" aria-hidden="true"></span></span>
      <span class="hud-ms num" data-ref="ms"></span>
    </div>
    <div class="hud-res cf-plate flat" data-ref="res">
      <div class="hud-res-track"><i class="hud-res-fill" data-ref="resFill"></i><i class="hud-res-ticks"></i></div>
      <span class="hud-res-v num" data-ref="resV"></span>
    </div>
    <div class="hud-feed" data-ref="feed"></div>
    <div class="hud-toasts" data-ref="toasts"></div>
  </div>

  <div class="hud-cl" data-ref="cl">
    <div class="hud-cl-in" data-ref="clIn">
      <div class="cf-bar-track hud-cl-hp" data-ref="clHp"><i class="cf-bar-ghost"></i><i class="cf-bar-fill"></i><i class="cf-bar-shield"></i><i class="hud-cl-low"></i></div>
      <div class="hud-cl-mom" data-ref="clMom"><i data-ref="clMomFill"></i></div>
      <div class="hud-cl-row">
        <span class="hud-cl-dash" data-ref="clDash"></span>
        <span class="hud-cl-armor" data-ref="clArmor"><i></i><i></i><i></i></span>
      </div>
    </div>
  </div>

  <div class="hud-bottom">
    <div class="hud-actionw">
      <div class="hud-buffs" data-ref="buffs"></div>
      <div class="hud-action cf-frame" data-ref="action">
        <div class="hud-vitals">
          <div class="hud-lv" data-ref="lv"><span class="hud-lv-l">lv</span><span class="num" data-ref="lvN">1</span></div>
          <div class="hud-hp" data-ref="hpw">
            <div class="cf-bar capped hud-hpbar" data-ref="hp">
              <div class="cf-bar-track"><i class="cf-bar-ghost"></i><i class="cf-bar-fill"></i><i class="cf-bar-shield"></i><i class="cf-bar-ticks" style="--n:4"></i><i class="hud-bar-flash"></i><i class="hud-hp-low"></i></div>
            </div>
            <div class="hud-xp"><i data-ref="xpFill"></i></div>
          </div>
          <div class="hud-hpnum"><span class="num hud-hp-n" data-ref="hpN"></span><span class="num hud-sh-n" data-ref="shN"></span></div>
        </div>
        <div class="hud-row">
          <div class="hud-dash" data-ref="dash"></div>
          <i class="hud-div"></i>
          <div class="hud-slots" data-ref="slots"></div>
          <i class="hud-div"></i>
          <div class="hud-autos" data-ref="autos"></div>
          <div class="hud-ac" data-ref="ac">
            <div class="cf-socket hud-ac-sock">${icon(ICON.ui('auto'), { fallback: 'A' })}</div>
            <span class="cf-key hud-key">t</span>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

// --------------------------------------------------------------------------- helpers
function chainColor(n) {
  if (n < 10) return rgbHex(lerp3(CHAIN_WHITE, CHAIN_AMBER, (n - 2) / 8));
  return rgbHex(CHAIN_AMBER);
}

function splitBossName(full) {
  const s = String(full ?? 'Boss');
  const i = s.indexOf(',');
  return i < 0 ? [s, ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

// One skill socket (slot, dash or auto). Static structure; only classes / vars / text change.
function socketHTML({ round = false } = {}) {
  return `<div class="cf-socket${round ? ' round' : ''} hud-sock">
      <span class="hud-sock-ico"></span>
      <i class="hud-cd"></i><i class="hud-hand"></i><span class="hud-clip"><i class="hud-glint"></i></span>
    </div>`;
}

export class HUD {
  constructor(game, uiRoot) {
    this.game = game;
    this.visible = false;
    this._k = {};              // last structural keys (guards for rebuilding DOM)
    this._unsub = [];
    this._chainLast = 0;
    this._ribbon = null;       // { kind, text, t } after a beat lands
    this._bearer = null;
    this._bearerScan = 0;
    this._clBoost = 0;         // seconds of full-opacity cluster after a hit / dash change
    this._dashLast = -1;
    this._pScreen = { x: -999, y: -999, ok: false };
    this._uPx = 0.8;

    const root = document.createElement('div');
    root.className = 'hud';
    root.style.display = 'none';
    root.innerHTML = TEMPLATE;
    uiRoot.appendChild(root);
    uiRoot.classList.add('hud-off');
    this.root = root;
    this.uiRoot = uiRoot;

    const E = this.el = {};
    root.querySelectorAll('[data-ref]').forEach((n) => { E[n.dataset.ref] = n; });
    E.gemList = [...E.gems.children];

    this._buildTimeline();
    this._buildSlots();
    this._buildMarkers();

    this.hpMeter = new Meter(E.hp);
    this.bossMeter = new Meter(E.bossBar, { hold: 0.45, rate: 5 });
    this.clMeter = new Meter(E.clHp);

    this.fx = new HUDFx(game, root, this);

    const on = (ev, fn) => this._unsub.push(game.events.on(ev, fn));
    on('runStart', () => this._reset());
    on('playerHit', () => {
      this._clBoost = 1.2;
      flash(E.vigHit, [{ opacity: 0.85 }, { opacity: 0 }], { duration: 260 }, 120);
    });
    on('announce', (e) => {
      if (e.kind === 'surge' || e.kind === 'swarm') this._ribbon = { kind: e.kind, text: e.text, sub: e.sub, t: RIBBON_HOLD };
    });
    on('bossSpawned', () => {
      // the intro stamp (hud-fx) settles into the bar: the frame forges in as it lands
      E.boss.animate?.([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: 900, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      this.bossMeter.reset(1);
    });
    on('relicGained', ({ def }) => { this._newRelic = def?.id; });
    on('autoCastChanged', () => flash(E.ac.firstElementChild, [{ transform: 'scale(1.1)' }, { transform: 'none' }], { duration: 160 }));

    this._onResize = () => { this._uPx = parseFloat(getComputedStyle(document.documentElement).fontSize) / 15 || 0.8; };
    window.addEventListener('resize', this._onResize);
    this._onResize();
  }

  show() {
    this.visible = true;
    this.root.style.display = 'block';
    this.uiRoot.classList.remove('hud-off');
    this._onResize();
  }

  hide() {
    this.visible = false;
    this.root.style.display = 'none';
    this.uiRoot.classList.add('hud-off');   // hides the primer plates too (css/hud.css)
  }

  dispose() {
    this._unsub.forEach((u) => u?.());
    this._unsub = [];
    window.removeEventListener('resize', this._onResize);
    this.fx.dispose();
    this.root.remove();
  }

  _reset() {
    this._k = {};
    this._chainLast = 0;
    this._ribbon = null;
    this._bearer = null;
    this._dashLast = -1;
    this.hpMeter.reset(1);
    this.clMeter.reset(1);
    this.bossMeter.reset(1);
    for (const s of this._slots) { s.wasCd = false; s.start = 0; }
  }

  update(dt) {
    if (!this.visible) return;
    const g = this.game;
    const p = g.player;
    const live = g.state === 'playing' || g.state === 'shift';
    const gdt = live ? dt * (g.timeScale ?? 1) : 0;
    // a modal mirrors the loadout (level-up strip, pause build): step the action bar aside
    setCls(this.uiRoot, 'hud-modal', g.state === 'levelup' || g.state === 'relic' || g.state === 'paused');

    this._updateAct(g, gdt);
    this._updateBoss(g, gdt);
    this._updateChain(g, p);
    this.fx.update(dt);

    if (!p) return;
    this._updateCluster(g, p, dt, live);
    this._updateMarkers(g, p, dt);
    this._updateRelics(p);
    this._updateBuffs(p);
    this._updateVitals(p, gdt);
    this._updateDash(p);
    this._updateSlots(p);
    this._updateAutos(p, g);
  }

  // ================================================================== top: act timeline
  _buildTimeline() {
    const beats = [...BEATS.map((b) => ({ ...b })), { id: 'boss', at: ACT_LENGTH, name: 'Boss' }];
    this._beats = beats;
    this.el.tlBeats.innerHTML = beats.map((b) => {
      const [ui, fb] = BEAT_ICON[b.id] ?? ['surge', '◆'];
      return `<span class="hud-beat${b.id === 'boss' ? ' boss' : ''}" style="left:${(b.at / ACT_LENGTH * 100).toFixed(3)}%">${icon(ICON.ui(ui), { fallback: fb })}</span>`;
    }).join('');
    beats.forEach((b, i) => { b.node = this.el.tlBeats.children[i]; });
  }

  _updateAct(g, gdt) {
    const E = this.el;
    const act = g.act ?? 0;
    const def = ACTS[act];
    if (def && this._k.act !== act) {
      this._k.act = act;
      setVar(E.top, '--act', def.color);
    }
    const bossOn = !!g.boss && !g.boss.dead;
    setCls(E.top, 'boss', bossOn);

    for (let i = 0; i < E.gemList.length; i++) {
      setCls(E.gemList[i], 'done', i < act);
      setCls(E.gemList[i], 'cur', i === act);
    }

    const t = g.phase === 'horde' ? Math.min(g.actTime ?? 0, ACT_LENGTH) : ACT_LENGTH;
    const f = clamp01(t / ACT_LENGTH);
    setScaleX(E.tlFill, f);
    setCss(E.tlHead, 'transform', `translateX(${(q(f) * 100).toFixed(2)}%)`);
    setText(E.timer, fmtTime(t));
    setCls(E.timerBox, 'held', !!g.tutorial?.holdClock && g.phase === 'horde');

    // beat markers: past ones dim; the next one pulses in its last seconds
    let soon = null;
    for (const b of this._beats) {
      const d = b.at - t;
      setCls(b.node, 'past', d <= 0);
      const isSoon = g.phase === 'horde' && d > 0 && d <= RIBBON_LEAD;
      setCls(b.node, 'soon', isSoon);
      if (isSoon && !soon) soon = { b, d };
    }

    // ribbon: "Elite Surge in 0:08" before a beat, the beat name for 3 s after it
    if (this._ribbon) { this._ribbon.t -= gdt; if (this._ribbon.t <= 0) this._ribbon = null; }
    let kind = '', txt = '', tt = '';
    if (this._ribbon && !bossOn) {
      kind = this._ribbon.kind;
      txt = (this._ribbon.sub ? `${BEATS.find((b) => b.id === kind)?.name ?? this._ribbon.text} · ${this._ribbon.sub}` : this._ribbon.text).toLowerCase();
      tt = '';
    } else if (soon && !bossOn) {
      kind = soon.b.id;
      txt = `${soon.b.id === 'boss' ? (splitBossName(def?.bossName)[0]) : soon.b.name} in`.toLowerCase();
      tt = fmtTime(Math.ceil(soon.d));
    } else if (g.phase === 'shift') {
      kind = 'shift'; txt = 'rift shift';
    }
    setCls(E.ribbon, 'on', !!txt);
    if (txt) {
      if (this._k.rbKind !== kind) {
        this._k.rbKind = kind;
        const [ui, fb] = BEAT_ICON[kind] ?? ['surge', '◆'];
        setHTML(E.rbIco, kind === 'shift' ? '' : icon(ICON.ui(ui), { fallback: fb }));
        setCls(E.ribbon, 'boss', kind === 'boss');
      }
      setText(E.rbTxt, txt);
      setText(E.rbT, tt);
    }
  }

  // ================================================================== top: boss bar
  _updateBoss(g, gdt) {
    const E = this.el;
    const b = g.boss;
    const on = !!b && !b.dead;
    setCls(E.boss, 'on', on);
    if (!on) return;

    if (this._k.bossId !== b) {
      this._k.bossId = b;
      const [name, epi] = splitBossName(ACTS[g.act]?.bossName ?? b.name);
      setText(E.bossName, name);
      setText(E.bossEpi, epi.toLowerCase());
      setCls(E.boss, 'prism', b.id === 'riftHeart');
      this.bossMeter.reset(b.maxHp > 0 ? b.hp / b.maxHp : 1);
    }
    const f = b.maxHp > 0 ? b.hp / b.maxHp : 0;
    this.bossMeter.update(gdt, f);
    const p2 = (b.phase ?? 1) >= 2;
    setCls(E.bossNotch, 'past', p2 || f <= 0.5);
    setCls(E.bossPh.children[1], 'on', p2);

    // Prism Ward (Aurelith): element gem + countdown ring; broken = grey until the next cycle
    const warded = b.id === 'riftHeart' || !!b.ward;
    setCls(E.ward, 'on', warded);
    if (warded) {
      const w = b.ward;
      setCls(E.ward, 'broken', !w);
      if (this._k.ward !== w) {
        this._k.ward = w;
        if (w) {
          E.ward.dataset.el = w;
          setHTML(E.wardGem, icon(ICON.el(w), { el: w, fallback: '◆' }));
          if (this._k.wardSeen) flash(E.ward, [{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        } else {
          delete E.ward.dataset.el;
          setHTML(E.wardGem, '');
          flash(E.ward, [{ transform: 'scale(.82)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 200 });
        }
        this._k.wardSeen = true;
      }
      const wt = Math.max(0, b.wardT ?? 0);
      setAttr(E.ward.querySelector('.fg'), 'stroke-dasharray', `${Math.round(clamp01(wt / WARD_CYCLE) * 100)} 100`);
      setText(E.wardT, String(Math.ceil(wt)));
    }
  }

  // ================================================================== right lane: chain
  _updateChain(g, p) {
    const E = this.el;
    const n = g.chain | 0;
    if (n >= 2) {
      const s = '×' + fmtCount(n);
      setText(E.chainBase, s);
      setText(E.chainPrism, s);
      setCls(E.chain, 'prism', n >= 25);
      setCls(E.chain, 'crowned', n >= 50);
      if (n < 25) setCss(E.chainBase, 'color', chainColor(n));
      setCls(E.chain, 'on', true);
      if (n > this._chainLast) flash(E.chainN, [{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 120 }, 120);
      this._chainLast = n;
    } else {
      setCls(E.chain, 'on', false);   // fades out with the last number still shown
      this._chainLast = 0;
    }

    // Arcanist Resonance: the same data as Chain, so it lives under it
    const res = p?.traitId === 'resonance';
    setCls(E.res, 'on', res);
    if (res) {
      const c = Math.min(25, n);
      setScaleX(E.resFill, c / 25);
      setText(E.resV, `+${Math.round((p.traitDamage || 0) * 100)}% dmg`);
      setCls(E.res, 'full', c >= 25);
    }
  }

  // ================================================================== under the character
  _updateCluster(g, p, dt, live) {
    const E = this.el;
    const cam = g.camera;
    _v.set(p.pos.x, 0, p.pos.z);
    _m.copy(_v).project(cam);
    const w = window.innerWidth, h = window.innerHeight;
    const sx = (_m.x * 0.5 + 0.5) * w;
    const sy = (-_m.y * 0.5 + 0.5) * h;
    const ok = live && _m.z < 1 && sx > -50 && sx < w + 50 && sy > -50 && sy < h + 50;
    this._pScreen.x = sx; this._pScreen.y = sy; this._pScreen.ok = ok;
    setCls(E.cl, 'on', ok);
    if (!ok) return;
    if (this._k.clEl !== p.cls.element) { this._k.clEl = p.cls.element; E.cl.dataset.el = p.cls.element; }
    setCss(E.cl, 'transform', `translate3d(${snap(sx)}px, ${snap(sy + 16 * this._uPx)}px, 0)`);

    const max = Math.max(1, p.stats.maxHp);
    const hp = Math.max(0, p.hp);
    const sh = Math.max(0, p.shield || 0);
    const total = Math.max(max, hp + sh);
    this.clMeter.update(live ? dt * (g.timeScale ?? 1) : 0, hp / total, sh / total);
    const frac = hp / max;

    // dash pips (fill = recharge)
    const d = p.dash;
    if (this._k.clDash !== d.max) {
      this._k.clDash = d.max;
      E.clDash.innerHTML = '<i><b></b></i>'.repeat(d.max);
    }
    const full = d.def.cd * (1 - Math.min(0.7, Math.max(0, p.stats.dashCdr || 0)));
    const kids = E.clDash.children;
    for (let i = 0; i < kids.length; i++) {
      let prog = 0;
      if (i < d.charges) prog = 1;
      else if (i === d.charges && full > 0) prog = clamp01(1 - d.recharge / full);
      setScaleX(kids[i].firstChild, prog);
      setCls(kids[i], 'on', i < d.charges);
    }
    if (this._dashLast >= 0 && d.charges !== this._dashLast) this._clBoost = Math.max(this._clBoost, 0.8);
    this._dashLast = d.charges;

    // Permafrost armour / Momentum
    const perma = p.traitId === 'permafrost';
    setCls(E.clArmor, 'on', perma);
    if (perma) setPips(E.clArmor, p.frostArmor | 0);
    const mom = p.traitId === 'momentum';
    setCls(E.clMom, 'on', mom);
    if (mom) {
      const ch = Math.max(0, Math.min(100, p.charge || 0));
      setScaleX(E.clMomFill, ch / 100);
      setCls(E.clMom, 'hot', ch > 80);
    }

    if (this._clBoost > 0) this._clBoost -= dt;
    setCls(E.cl, 'loud', this._clBoost > 0 || frac < 0.5);
    setCls(E.cl, 'low', frac < 0.3 && hp > 0);
  }

  // ================================================================== edge markers
  _buildMarkers() {
    this._mk = [];
    for (let i = 0; i < MARKERS; i++) {
      const m = el(`<div class="hud-mk">
          <i class="hud-mk-arrow"></i>
          <div class="hud-mk-disk"><span class="hud-mk-ico"></span>${ringSvg('hud-mk-ring')}</div>
          <span class="hud-mk-d num"></span>
        </div>`);
      this.el.markers.appendChild(m);
      this._mk.push({ root: m, arrow: m.querySelector('.hud-mk-arrow'), ico: m.querySelector('.hud-mk-ico'), ring: m.querySelector('.hud-mk-ring .fg'), d: m.querySelector('.hud-mk-d'), kind: '' });
    }
  }

  _updateMarkers(g, p, dt) {
    const cam = g.camera;
    const targets = [];
    // the act boss: edge arrow only while off screen (the boss bar covers the rest)
    if (g.boss && !g.boss.dead) targets.push({ kind: 'boss', pos: g.boss.pos, y: 2, color: '#e04a3a' });
    const s = g.world?.shrine;
    if (s?.pos) targets.push({ kind: 'shrine', pos: s.pos, y: 1.6, color: s.color ?? '#c08cff', prog: clamp01(s.progress), onScreen: true });

    // the Relic Bearer: rescan a few times a second (the elite list is tiny but enemies are not)
    this._bearerScan -= dt;
    if (this._bearer && (this._bearer.dead || !this._bearer.dropsChest)) this._bearer = null;
    if (!this._bearer && this._bearerScan <= 0) {
      this._bearerScan = 0.25;
      this._bearer = g.enemies.find((e) => e.dropsChest && !e.dead) ?? null;
    }
    if (this._bearer) targets.push({ kind: 'bearer', pos: this._bearer.pos, y: 2, color: '#e0a030' });
    for (const it of g.pickups?.items ?? []) {
      if (it.type === 'chest' && !it.attracted && targets.length < MARKERS) targets.push({ kind: 'chest', pos: it.pos, y: 1, color: '#e0a030' });
    }

    const w = window.innerWidth, h = window.innerHeight, u = this._uPx;
    const bossOn = !!g.boss && !g.boss.dead;
    const L = 40 * u, R = w - 40 * u;
    const T = (bossOn ? 150 : 132) * u, B = h - 150 * u;   // excludes the top bar and the action bar
    for (let i = 0; i < this._mk.length; i++) {
      const M = this._mk[i], t = targets[i];
      if (!t) { setCls(M.root, 'on', false); continue; }
      if (M.kind !== t.kind) {
        M.kind = t.kind;
        const [ui, fb] = t.kind === 'boss' ? ['boss', '☠'] : t.kind === 'shrine' ? ['shrine', '⛩'] : t.kind === 'bearer' ? ['chest', '♛'] : ['chest', '▣'];
        M.ico.innerHTML = icon(ICON.ui(ui), { fallback: fb });
        M.root.dataset.kind = t.kind;
      }
      setVar(M.root, '--acc', t.color);
      _v.set(t.pos.x, t.y, t.pos.z);
      _m.copy(_v).applyMatrix4(cam.matrixWorldInverse);
      const front = _m.z < 0;
      _m.copy(_v).project(cam);
      const sx = (_m.x * 0.5 + 0.5) * w, sy = (-_m.y * 0.5 + 0.5) * h;
      const inside = front && sx >= L && sx <= R && sy >= T && sy <= B;
      if (inside && !t.onScreen) { setCls(M.root, 'on', false); continue; }
      setCls(M.root, 'on', true);
      setCls(M.root, 'edge', !inside);
      if (t.kind === 'shrine') setAttr(M.ring, 'stroke-dasharray', `${Math.round(t.prog * 100)} 100`);
      setCls(M.root, 'prog', t.kind === 'shrine' && t.prog > 0);

      let x = sx, y = sy - 44 * u, ang = 0;
      if (!inside) {
        let dx = sx - w / 2, dy = sy - h / 2;
        if (!front) { dx = -dx; dy = -dy; }
        if (dx === 0 && dy === 0) dy = -1;
        const cx = w / 2, cy = (T + B) / 2;
        const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        const k = Math.min(ux ? ((ux > 0 ? R : L) - cx) / ux : Infinity, uy ? ((uy > 0 ? B : T) - cy) / uy : Infinity);
        x = cx + ux * k; y = cy + uy * k;
        ang = Math.atan2(uy, ux) * 180 / Math.PI;
        const dist = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
        setText(M.d, `${Math.round(dist)}m`);
      }
      setCss(M.root, 'transform', `translate3d(${snap(x)}px, ${snap(y)}px, 0)`);
      setCss(M.arrow, 'transform', `rotate(${Math.round(ang)}deg)`);
    }
  }

  // ================================================================== relics / buffs
  _updateRelics(p) {
    const E = this.el;
    const key = p.relics.map((r) => r.id).join(',');
    if (this._k.relics !== key) {
      this._k.relics = key;
      E.relics.innerHTML = p.relics.map((r) =>
        `<div class="hud-relic" data-id="${r.id}" style="--acc:${RELIC_TAG_COLOR[r.tag] ?? 'var(--cf-gilt)'}">${icon(ICON.relic(r.id), { fallback: r.icon })}</div>`).join('');
      setCls(E.relics, 'on', p.relics.length > 0);
      setVar(E.relics, '--cols', String(Math.max(1, Math.min(6, p.relics.length))));
      if (this._newRelic) {
        const t = E.relics.querySelector(`[data-id="${this._newRelic}"]`);
        t?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-out', pseudoElement: '::after' });
        this._newRelic = null;
      }
    }
    // Second Wind spent: its tile goes grey
    if (key.includes('secondWind')) {
      setCls(E.relics.querySelector('[data-id="secondWind"]'), 'spent', !p.secondWind);
    }
  }

  _updateBuffs(p) {
    const E = this.el;
    const buffs = [...(p.buffs?.entries() ?? [])];
    const key = buffs.map(([id]) => id).join(',');
    if (this._k.buffs !== key) {
      this._k.buffs = key;
      E.buffs.innerHTML = buffs.map(([id, b]) =>
        `<div class="hud-buff" style="--acc:${b.color ?? 'var(--cf-gilt)'};--el:${b.color ?? 'var(--cf-gilt)'}">
           <div class="hud-buff-sq">${icon(ICON.buff(id), { fallback: b.icon ?? '◆' })}<i class="hud-buff-sweep"></i></div>
           <span class="hud-buff-t num"></span>
         </div>`).join('');
      this._buffRefs = [...E.buffs.children].map((n) => ({ sweep: n.querySelector('.hud-buff-sweep'), t: n.querySelector('.hud-buff-t') }));
    }
    for (let i = 0; i < buffs.length; i++) {
      const b = buffs[i][1], r = this._buffRefs[i];
      const left = clamp01(b.dur > 0 ? b.t / b.dur : 0);
      setVar(r.sweep, '--cd', `${Math.round((1 - left) * 180) * 2}deg`);
      setText(r.t, String(Math.max(0, Math.ceil(b.t))));
    }
  }

  // ================================================================== bottom: vitals
  _updateVitals(p, gdt) {
    const E = this.el;
    const max = Math.max(1, p.stats.maxHp);
    const hp = Math.max(0, p.hp);
    const sh = Math.max(0, p.shield || 0);
    const total = Math.max(max, hp + sh);
    this.hpMeter.update(gdt, hp / total, sh / total);
    setText(E.hpN, String(Math.ceil(hp)));
    setText(E.shN, sh >= 1 ? `+${Math.ceil(sh)}` : '');
    const low = hp / max < 0.3 && hp > 0;
    setCls(E.hpw, 'low', low);
    setCls(E.vig, 'on', low);

    setScaleX(E.xpFill, p.xpToNext > 0 ? p.xp / p.xpToNext : 0);
    if (this._k.lv !== p.level) {
      if (this._k.lv) E.lv.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', pseudoElement: '::after' });
      this._k.lv = p.level;
      setText(E.lvN, String(p.level));
    }
  }

  // ================================================================== bottom: sockets
  _buildSlots() {
    const E = this.el;
    // dash
    E.dash.innerHTML = `${socketHTML()}<span class="cf-key hud-key wide">space</span><span class="hud-charges"></span><span class="hud-num num"></span>`;
    this._dashS = this._sockParts(E.dash);
    this._dashS.charges = E.dash.querySelector('.hud-charges');
    // 5 skill slots
    this._slots = SLOT_KEYS.map((k, i) => {
      const box = el(`<div class="hud-sk empty">${socketHTML()}${KEY_HTML[i]}<span class="cf-pips hud-rank"></span><span class="hud-num num"></span><i class="hud-crack"></i></div>`);
      E.slots.appendChild(box);
      return this._sockParts(box);
    });
  }

  _sockParts(box) {
    return {
      box,
      sock: box.querySelector('.hud-sock'),
      ico: box.querySelector('.hud-sock-ico'),
      cd: box.querySelector('.hud-cd'),
      hand: box.querySelector('.hud-hand'),
      glint: box.querySelector('.hud-glint'),
      num: box.querySelector('.hud-num'),
      rank: box.querySelector('.hud-rank'),
      wasCd: false,
      start: 0,
    };
  }

  // Shared cooldown drawing: conic sweep + clock hand + whole seconds, glint on ready.
  _cooldown(S, cd, glintMin = 1.5) {
    if (cd > 0 && (!S.wasCd || cd > S.start)) S.start = cd;          // a fresh cast
    const sweep = S.start >= 1 && cd > 0;                              // sub-second starters only dim
    const r = sweep ? clamp01(cd / S.start) : 0;
    setCls(S.box, 'cooling', cd > 0);
    setCls(S.box, 'sweep', sweep);
    if (sweep) {
      const deg = Math.round((1 - r) * 720) / 2;   // elapsed angle: the dark wedge shrinks clockwise
      setVar(S.cd, '--cd', `${deg}deg`);
      setCss(S.hand, 'transform', `rotate(${deg}deg)`);
    }
    setText(S.num, cd >= 1 ? String(Math.ceil(cd)) : '');
    if (S.wasCd && cd <= 0 && S.start >= glintMin) {
      flash(S.glint, [
        { opacity: 0, transform: 'translateX(-70%) rotate(20deg)' },
        { opacity: 1, offset: 0.3 },
        { opacity: 0, transform: 'translateX(70%) rotate(20deg)' },
      ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }, 200);
      flash(S.sock, [{ transform: 'scale(1.07)' }, { transform: 'none' }], { duration: 140 }, 200);
    }
    S.wasCd = cd > 0;
  }

  _updateDash(p) {
    const S = this._dashS;
    const d = p.dash, def = d.def;
    if (this._k.dashKind !== def.kind + p.cls.element) {
      this._k.dashKind = def.kind + p.cls.element;
      S.box.dataset.el = p.cls.element;
      S.ico.innerHTML = icon(ICON.dash(def.kind), { fallback: DASH_GLYPH[def.kind] ?? '»' });
    }
    if (this._k.dashMax !== d.max) {
      this._k.dashMax = d.max;
      S.charges.innerHTML = '<i><b></b></i>'.repeat(d.max);
    }
    const full = def.cd * (1 - Math.min(0.7, Math.max(0, p.stats.dashCdr || 0)));
    const kids = S.charges.children;
    for (let i = 0; i < kids.length; i++) {
      let prog = 0;
      if (i < d.charges) prog = 1;
      else if (i === d.charges && full > 0) prog = clamp01(1 - d.recharge / full);
      setScaleX(kids[i].firstChild, prog);
      setCls(kids[i], 'on', i < d.charges);
    }
    // the socket itself sweeps only when no charge is left
    const cd = d.charges > 0 ? 0 : Math.max(0, d.recharge);
    if (cd > 0 && !S.wasCd) S.start = full;
    this._cooldown(S, cd, 1);
  }

  _updateSlots(p) {
    for (let i = 0; i < this._slots.length; i++) {
      const S = this._slots[i];
      const s = p.slots[i] ?? null;
      const key = s ? `${s.def.id}:${s.rank}` : '';
      if (this._k['slot' + i] !== key) {
        const prevId = (this._k['slot' + i] ?? '').split(':')[0];
        this._k['slot' + i] = key;
        setCls(S.box, 'empty', !s);
        setCls(S.sock, 'empty', !s);
        if (s) {
          const fusion = FUSION_IDS.has(s.def.id);
          S.box.dataset.el = s.def.element ?? 'physical';
          S.ico.innerHTML = icon(ICON.skill(s.def.id), { fallback: s.def.icon });
          const max = s.def.maxRank ?? 5;
          S.rank.innerHTML = pips(max);
          setPips(S.rank, s.rank);
          setCls(S.box, 'fusion', fusion);
          if (prevId && prevId !== s.def.id) { S.wasCd = false; S.start = 0; }
          if (prevId) flash(S.sock, [{ transform: 'scale(1.1)' }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        } else {
          delete S.box.dataset.el;
          S.ico.innerHTML = '';
          S.rank.innerHTML = '';
          setCls(S.box, 'fusion', false);
        }
      }
      if (s) this._cooldown(S, Math.max(0, s.cd));
      else { setCls(S.box, 'cooling', false); setCls(S.box, 'sweep', false); setText(S.num, ''); S.wasCd = false; S.start = 0; }
    }
  }

  _updateAutos(p, g) {
    const E = this.el;
    const autos = p.skills.filter((s) => s.slot < 0);
    const aKey = autos.map((s) => `${s.def.id}:${s.rank}`).join(',');
    if (this._k.autos !== aKey) {
      this._k.autos = aKey;
      E.autos.innerHTML = autos.map((s) =>
        `<div class="hud-auto${FUSION_IDS.has(s.def.id) ? ' fusion' : ''}" data-el="${s.def.element ?? 'physical'}">
           <div class="cf-socket round hud-sock"><span class="hud-sock-ico">${icon(ICON.skill(s.def.id), { fallback: s.def.icon })}</span></div>
           <span class="cf-pips hud-rank">${pips(s.def.maxRank ?? 5)}</span>
         </div>`).join('')
        + '<div class="hud-auto none"><div class="cf-socket round empty hud-sock"></div></div>'.repeat(Math.max(0, MAX_AUTOS - autos.length));
      autos.forEach((s, i) => setPips(E.autos.children[i].querySelector('.hud-rank'), s.rank));
      setCls(E.autos, 'has', autos.length > 0);
    }
    setCls(E.ac, 'on', !!g.autoCast);
  }
}
