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
import { icon, ICON, hasIcon } from './icons/index.js';
import { HUDFx } from './hud-fx.js';
import {
  setText, setHTML, setCss, setVar, setCls, setAttr, setScaleX, setOpacity, flash,
  clamp01, q, fmtTime, fmtCount, lerp3, rgbHex, setPips, snap, Meter, esc, pct,
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
const BEAT_ICON = { surge: ['surge', '♛'], swarm: ['swarm', '◎'], boss: ['boss', '☠'], obelisks: ['obelisk', '◆'] };
// The HUD's own beat (spawner.js BEATS stays untouched): the Rift Obelisks rise at 0:50 (design/RAID.md).
const OBELISK_BEAT = { id: 'obelisks', at: 50, name: 'Obelisks rise' };
const CHAIN_WHITE = [255, 255, 255], CHAIN_AMBER = [224, 160, 48];
const RIBBON_LEAD = 10;      // seconds of "Elite Surge in 0:08" before a beat
const RIBBON_HOLD = 3;       // seconds the beat name stays after it lands
const MARKERS = 12;          // pooled edge markers (boss + 3 obelisks + 3 fight objects + shrine + bearer + chests)
const RECOVER_TIME = 8;      // BossBase poise lock after a Downed (core.js RECOVER_TIME)
const OB_NEAR = 10;          // world units: the approach card appears inside this radius (hysteresis +2)
const HEAT_MAX = 3;
// Obelisk identity: colour + icon + label (never colour alone).
const OB = {
  haste: { color: '#bfefff', icon: 'obeliskHaste', name: 'Haste', title: 'Obelisk of Haste' },
  echo: { color: '#b08cff', icon: 'obeliskEcho', name: 'Echo', title: 'Obelisk of Echo' },
  wrath: { color: '#ff7a33', icon: 'obeliskWrath', name: 'Wrath', title: 'Obelisk of Wrath' },
};
const POISE_STEEL = '#e8eef8';
// One-line meaning for every status chip (title tooltip + aria): the words the game never defined (playtest r2)
const CHIP_TIP = {
  downed: 'Staggered — takes +40% damage',
  winded: 'Recovering from the intermission — free hits',
  exposed: 'Weak point open — +20% damage',
  sealed: 'Untargetable during the intermission',
  recovering: 'Stagger locked for a moment',
  stagger: 'Fill this with reactions to stagger the boss',
};
const BUFF_TIP = {
  strain: 'Strain — +10% damage taken (Obelisk of Echo)', spores: 'Spores — more damage taken, slower; Sap pools cleanse',
  sap: 'Sap — +25% move speed', rooted: 'Rooted — cannot move',
};
const ELNAME = { fire: 'Fire', frost: 'Frost', storm: 'Storm', arcane: 'Arcane', physical: 'Physical' };

// Affix def.icon is a bare name ('affixFrenzied'): resolve to a sprite, falling back to the generic sigil.
export const affixIcon = (def, cls = '') => icon(def?.icon && hasIcon(ICON.ui(def.icon)) ? ICON.ui(def.icon) : ICON.ui('affix'), { cls });
// Buff sprite by id, then by def.icon name, then the generic buff sprite: never a text glyph.
function buffIcon(id, b) {
  if (hasIcon(ICON.buff(id))) return icon(ICON.buff(id));
  const alt = typeof b?.icon === 'string' && b.icon.length > 2 ? ICON.buff(b.icon) : '';
  return icon(alt && hasIcon(alt) ? alt : ICON.ui('buff'));
}

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
      <div class="hud-armed" data-ref="armed"></div>
    </div>
    <div class="hud-ribbon cf-plate flat" data-ref="ribbon">
      <span class="hud-rb-ico" data-ref="rbIco"></span>
      <span class="hud-rb-txt" data-ref="rbTxt"></span>
      <span class="hud-rb-t num" data-ref="rbT"></span>
    </div>
    <div class="hud-boss cf-frame crown" data-ref="boss">
      <i class="hud-boss-glow" data-ref="bossGlow"></i>
      <div class="hud-ward" data-ref="ward">
        <div class="cf-socket round hud-ward-sock" data-ref="wardSock"><span class="hud-ward-gem" data-ref="wardGem"></span></div>
        ${ringSvg('hud-ward-ring')}
        <span class="hud-ward-t num" data-ref="wardT"></span>
      </div>
      <div class="hud-boss-head">
        <div class="hud-boss-tags">
          <span class="hud-tag echo" data-ref="tagEcho"><span class="hud-tag-ico">${icon(ICON.ui('obeliskEcho'))}</span><span data-ref="tagEchoTxt">echo</span></span>
          <span class="hud-tag enrage" data-ref="tagEnrage"><span class="hud-tag-ico">${icon(ICON.ui('affixFrenzied'))}</span><span data-ref="tagEnrageTxt">enraged</span></span>
        </div>
        <div class="hud-boss-who">
          <span class="hud-boss-name" data-ref="bossName"></span>
          <span class="hud-boss-epi" data-ref="bossEpi"></span>
        </div>
        <span class="hud-boss-state" data-ref="bossState"><span class="hud-bs-ico" data-ref="bsIco"></span><span class="hud-bs-txt" data-ref="bsTxt"></span></span>
      </div>
      <div class="hud-boss-row">
        <div class="cf-bar hud-boss-bar" data-ref="bossBar">
          <div class="cf-bar-track"><i class="cf-bar-ghost"></i><i class="cf-bar-fill"></i><i class="hud-bar-flash"></i><i class="hud-boss-lock" data-ref="bossLock"></i></div>
          <div class="hud-boss-notches" data-ref="bossNotches"></div>
          <div class="cf-prism hud-boss-prism"></div>
        </div>
        <span class="cf-pips hud-boss-ph" data-ref="bossPh"><i class="on"></i><i></i><i></i></span>
      </div>
      <div class="hud-boss-prow" data-ref="prow">
        <div class="hud-poise" data-ref="poise">
          <div class="hud-poise-track"><i class="hud-poise-fill" data-ref="poiseFill"></i><i class="hud-poise-flash" data-ref="poiseFlash"></i></div>
          <i class="hud-poise-mk" data-ref="poiseMk"></i>
          <span class="hud-poise-lbl"><span class="hud-poise-ico">${icon(ICON.ui('stagger'))}</span><span class="hud-poise-txt" data-ref="poiseTxt">stagger</span></span>
          <span class="hud-poise-fl" data-ref="poiseFl"></span>
        </div>
        <div class="hud-heat" data-ref="heat"><div class="hud-heat-track"><i class="hud-heat-fill" data-ref="heatFill"></i></div><span class="hud-heat-lbl"><span class="hud-heat-ico">${icon(ICON.ui("affixFrenzied"))}</span><span data-ref="heatTxt">axe heat</span></span></div>
        <span class="hud-boss-tail"></span>
      </div>
      <div class="hud-boss-affixes" data-ref="affixes"></div>
      <div class="hud-cast cf-plate" data-ref="cast">
        <div class="hud-cast-head">
          <span class="hud-cast-ico">${icon(ICON.ui('breakCheck'))}</span>
          <span class="hud-cast-name" data-ref="castName"></span>
          <span class="hud-cast-tag" data-ref="castTag"></span>
          <span class="hud-cast-t num" data-ref="castT"></span>
        </div>
        <div class="hud-cast-bar"><i class="hud-cast-fill" data-ref="castFill"></i></div>
      </div>
    </div>
  </div>

  <div class="hud-ob cf-frame" data-ref="ob">
    <div class="hud-ob-head">
      <div class="cf-socket hud-ob-sock" data-ref="obSock"><span data-ref="obIco"></span>${ringSvg('hud-ob-ring')}</div>
      <div class="hud-ob-title"><span class="hud-ob-kick" data-ref="obKick">rift obelisk</span><span class="hud-ob-name" data-ref="obName"></span></div>
      <span class="hud-ob-chip" data-ref="obChip"></span>
    </div>
    <div class="hud-ob-body" data-ref="obBody"></div>
    <div class="hud-ob-foot"><span data-ref="obFoot"></span></div>
    <div class="hud-ob-meter"><i data-ref="obFill"></i></div>
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
    this._notches = [];        // boss HP-bar gate notches [{ el, g }]
    this._downReason = '';     // last bossDowned reason ('stagger' | 'break' | 'winded')
    this._poiseAcc = 0;        // poise gained since the last floater
    this._poiseCd = 0;
    this._ob = null;           // obelisk shown on the approach card
    this._obT = 0;             // preview() refresh timer
    this._obKey = '';
    this._obSize = { w: 0, h: 0 };
    this._obHint = 'hold the ring to channel';

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
    // ---- raid encounter (design/RAID.md) ----
    on('poise', (e) => this._onPoise(e));
    on('bossDowned', (e) => {
      this._downReason = e?.reason ?? 'stagger';
      flash(E.bossGlow, [{ opacity: 1 }, { opacity: 0.55 }], { duration: 320 }, 60);
    });
    on('breakCheck', () => {
      flash(E.cast, [{ transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    });
    on('breakCheckEnd', ({ enemy, name, success }) => {
      if (success) flash(E.poiseFlash, [{ opacity: 1 }, { opacity: 0 }], { duration: 520 }, 0);
      if (enemy === this.game.boss) this._verdict = { t: 1.5, success: !!success, name };   // shown INSIDE the cast bar, never centre
    });
    on('obelisksRisen', () => { this._ribbon = { kind: 'obelisks', text: 'The Rift offers', t: 4 }; });
    on('obeliskArmed', ({ type }) => { this._armPop = type; this._k.armed = null; });
    on('encounterStart', () => { this._k.armed = null; });
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
    this.fx.reset();                        // nothing from a finished fight or run survives in the DOM
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
    this._bossClear?.();
    this._chainLast = 0;
    this._ribbon = null;
    this._bearer = null;
    this._dashLast = -1;
    this.hpMeter.reset(1);
    this.clMeter.reset(1);
    this.bossMeter.reset(1);
    this._ob = null; this._obKey = '';
    setCls(this.el.ob, 'on', false);
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
    this._updateObelisks(g, p, dt);
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
    const beats = [{ ...OBELISK_BEAT }, ...BEATS.map((b) => ({ ...b })), { id: 'boss', at: ACT_LENGTH, name: 'Boss' }].sort((a, b) => a.at - b.at);
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

    // Haste armed: the boss gem slides from 3:00 to "now" (the skip is visible)
    const stakes = g.run?.stakes ?? {};
    const hasteOn = g.phase === 'horde' && !!(g.obelisks?.list ?? []).find((o) => o.type === 'haste')?.armed;
    if (!hasteOn) this._hasteFrom = null; else if (this._hasteFrom == null) this._hasteFrom = t;
    const hasteAt = hasteOn ? clamp01((t + 3) / ACT_LENGTH) : 1;

    // beat markers: past ones dim; the next one pulses in its last seconds
    let soon = null;
    for (const b of this._beats) {
      let at = b.at;
      if (b.id === 'boss') {
        at = hasteAt * ACT_LENGTH;
        setCss(b.node, 'left', `${(hasteAt * 100).toFixed(3)}%`);
        setCls(b.node, 'hasted', hasteAt < 1);
      }
      const d = at - t;
      setCls(b.node, 'past', d <= 0 && b.id !== 'boss');
      const isSoon = g.phase === 'horde' && d > 0 && d <= RIBBON_LEAD;
      setCls(b.node, 'soon', isSoon);
      if (isSoon && !soon) soon = { b, d };
    }
    this._updateArmed(stakes, bossOn);

    // ribbon: "Elite Surge in 0:08" before a beat, the beat name for 3 s after it
    if (this._ribbon) { this._ribbon.t -= gdt; if (this._ribbon.t <= 0) this._ribbon = null; }
    let kind = '', txt = '', tt = '';
    if (hasteOn && !bossOn) {
      // the 3 s Haste warning: the boss is coming now
      kind = 'boss'; txt = 'the heart stirs in';
      tt = fmtTime(Math.ceil(Math.max(0, 3 - (t - (this._hasteFrom ?? t)))));
    } else if (this._ribbon && !bossOn) {
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
    } else { setText(E.rbTxt, ""); setText(E.rbT, ""); }
  }

  // ================================================================== top: armed chips (timeline)
  // One chip per armed obelisk, hanging under the act plate (right end). Wrath shows its Heat.
  _updateArmed(stakes, bossOn) {
    const E = this.el, list = this.game.obelisks?.list ?? [];
    const armed = (t) => list.find((o) => o.type === t)?.armed;
    const haste = !!armed('haste'), echo = !!stakes.echo || !!armed('echo');
    const heat = stakes.heat | 0;
    const key = `${haste ? 1 : 0}${echo ? 1 : 0}${heat}`;
    if (this._k.armed === key) return;
    this._k.armed = key;
    const chips = [];
    if (haste) chips.push(['haste', '', 'Haste armed: the boss comes now']);
    if (echo) chips.push(['echo', '', 'Echo armed: the boss comes twice']);
    if (heat > 0) chips.push(['wrath', `<b>${heat}</b>`, `Wrath: Heat ${heat}`]);
    E.armed.innerHTML = chips.map(([t, extra, title]) =>
      `<span class="hud-chip" data-t="${t}" title="${esc(title)}" style="--acc:${OB[t].color}">${icon(ICON.ui(OB[t].icon))}${extra}</span>`).join('');
    setCls(E.armed, 'on', chips.length > 0);
    const pop = this._armPop;
    this._armPop = null;
    if (pop) E.armed.querySelector(`[data-t="${pop}"]`)?.animate?.([{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  // ================================================================== top: boss bar
  // The boss frame is hidden (display none) between fights: empty its text too, so no old boss name / affix /
  // chip text lingers in the DOM for the next fight or run. (Memoised setters keep their caches in step.)
  _bossClear() {
    const E = this.el;
    this._k.bossId = null; this._k.bsKind = ''; this._k.cast = null; this._k.ward = undefined;
    this._verdict = null; this._notches = [];
    for (const n of [E.bossName, E.bossEpi, E.bsTxt, E.castName, E.castTag, E.castT, E.tagEnrageTxt, E.poiseTxt, E.heatTxt, E.tagEchoTxt]) setText(n, '');
    E.affixes.innerHTML = ''; E.bossNotches.innerHTML = '';   // written raw in _bossSetup
    for (const n of [E.bsIco, E.wardGem]) setHTML(n, '');
    for (const k of ['sealed', 'downed', 'winded', 'exposed', 'echo', 'has-affix', 'has-heat', 'has-poise']) setCls(E.boss, k, false);
    setCls(E.cast, 'on', false);
    setCls(E.bossState, 'on', false);
  }

  _bossSetup(g, b) {
    const E = this.el;
    this._k.bossId = b;
    const [name, epi] = splitBossName(ACTS[g.act]?.bossName ?? b.name);
    setText(E.bossName, name);
    setText(E.bossEpi, epi.toLowerCase());
    setCls(E.boss, 'prism', b.id === 'riftHeart');
    this.bossMeter.reset(b.maxHp > 0 ? b.hp / b.maxHp : 1);
    // 3 phases (legacy bosses: 2), a notch per gate (Echo [1, .5] draws one at 50%)
    const phases = b.phases ?? 2;
    E.bossPh.innerHTML = pips(phases);
    const gates = (b.gates ?? [0.5]).filter((x) => x > 0.01 && x < 0.99);
    E.bossNotches.innerHTML = gates.map((x) => `<i class="hud-boss-notch" style="left:${(x * 100).toFixed(2)}%"></i>`).join('');
    this._notches = gates.map((x, i) => ({ el: E.bossNotches.children[i], g: x }));
    // affixes: icon + name (the def text is the tooltip); the row exists for the whole fight (no layout shift)
    const ax = b.affixes ?? [];
    // resistances first ("Resists Fire 50%": fire builds need to know), then the Wrath affixes
    const res = Object.entries(b.resist ?? {}).filter(([, v]) => typeof v === 'number' && v > 0);
    E.affixes.innerHTML = res.map(([el, v]) => {
      const nm = ELNAME[el] ?? el, txt = `Resists ${nm} ${Math.round(v * 100)}%`;
      return `<span class="hud-affix resist" data-el="${esc(el)}" title="${txt}: ${nm} damage and ${nm} reactions hurt it less"><span class="hud-affix-ico">${icon(ICON.el(el), { el })}</span><span class="hud-affix-n">${txt}</span></span>`;
    }).join('') + ax.map((a) =>
      `<span class="hud-affix" title="${esc(a.name)}: ${esc(a.desc)}"><span class="hud-affix-ico">${affixIcon(a)}</span><span class="hud-affix-n">${esc(a.name)}</span></span>`).join('');
    setCls(E.boss, 'has-affix', ax.length + res.length > 0);
    setCls(E.boss, 'has-poise', !!b.poise);
    setCls(E.boss, 'has-heat', b.id === 'vashkar' && typeof b.axeHeat === 'number');
    setCls(E.boss, 'echo', !!b.isEcho);
    setCls(E.tagEcho, 'on', !!b.isEcho || !!g.run?.stakes?.echo);
    setCls(E.tagEcho, 'pending', !b.isEcho);
    setText(E.tagEchoTxt, b.isEcho ? 'echo' : '+ echo');
    this._poiseAcc = 0;
  }

  _updateBoss(g, gdt) {
    const E = this.el;
    const b = g.boss;
    const on = !!b && !b.dead;
    setCls(E.boss, 'on', on);
    if (!on) { if (this._k.bossId) this._bossClear(); return; }
    if (this._k.bossId !== b) this._bossSetup(g, b);

    const f = b.maxHp > 0 ? b.hp / b.maxHp : 0;
    this.bossMeter.update(gdt, f);
    const phase = b.phase ?? 1;
    setPips(E.bossPh, phase);
    const legacyP2 = b.phases === undefined && phase >= 2;
    for (const n of this._notches) setCls(n.el, 'past', legacyP2 || f <= n.g + 0.003);

    // ---- state: sealed (gate / intermission) · downed · exposed · enrage
    const inter = !!b.untargetable || (b.intermissionIdx | 0) > 0;
    const atFloor = b.hpFloor !== undefined && b.hpFloor > 0 && b.hp <= b.hpFloor + 0.5;
    const sealed = inter || atFloor;
    const downed = !!b.downed;
    const exposed = (b.exposedT ?? 0) > 0;
    setCls(E.boss, 'sealed', sealed);
    if (sealed) setScaleX(E.bossLock, f);
    setCls(E.boss, 'downed', downed);
    setCls(E.boss, 'exposed', exposed && !downed);
    const enr = b.enrage | 0;
    setCls(E.tagEnrage, 'on', enr > 0);
    if (enr > 0) setText(E.tagEnrageTxt, enr > 1 ? `enraged ×${enr}` : 'enraged');
    const winded = downed && this._downReason === 'winded';
    let kind = '', txt = '';
    if (winded) { kind = 'winded'; txt = 'winded'; }
    else if (downed) { kind = 'downed'; txt = 'downed'; }
    else if (exposed) { kind = 'exposed'; txt = `exposed ${Math.ceil(b.exposedT)}`; }
    else if (sealed) { kind = 'sealed'; txt = 'sealed'; }
    setCls(E.boss, 'winded', winded);
    setCls(E.bossState, 'on', !!kind);
    if (kind) {
      if (this._k.bsKind !== kind) {
        this._k.bsKind = kind;
        E.bossState.dataset.k = kind;
        setHTML(E.bsIco, icon(kind === 'sealed' ? ICON.ui('lock') : ICON.ui(kind)));
        setAttr(E.bossState, 'title', CHIP_TIP[kind]);
      }
      setText(E.bsTxt, txt);
    } else this._k.bsKind = '';

    // ---- Poise / STAGGER bar
    const P = b.poise;
    if (P) {
      const cap = Math.max(1, (P.max ?? 100) * (P.mult || 1));
      const check = !!b.cast?.check && P.threshold > 0;
      let fill, mode, label;
      if (downed && b.downedDur > 0) { fill = b.downedT / b.downedDur; mode = 'downed'; label = `${this._downReason === 'winded' ? 'winded' : 'downed'} ${Math.ceil(Math.max(0, b.downedT))}`; }
      else if (P.lockT > 0) { fill = P.lockT / RECOVER_TIME; mode = 'rec'; label = 'recovering'; }
      else {
        fill = P.v / cap;
        mode = inter ? 'off' : check ? 'check' : 'idle';
        label = check ? `stagger ${Math.round(P.threshold)}` : 'stagger';
      }
      setScaleX(E.poiseFill, fill);
      const pc = E.poise;
      setCls(pc, 'downed', mode === 'downed');
      setCls(pc, 'rec', mode === 'rec');
      setCls(pc, 'off', mode === 'off');
      setCls(pc, 'check', mode === 'check');
      setCls(pc, 'hot', mode !== 'downed' && mode !== 'rec' && P.v / cap > 0.8);
      setText(E.poiseTxt, label);
      setAttr(E.poise, 'title', mode === 'rec' ? CHIP_TIP.recovering : mode === 'downed' ? CHIP_TIP[winded ? 'winded' : 'downed'] : CHIP_TIP.stagger);
      const th = check ? clamp01(P.threshold / cap) : 0;
      setCls(E.poiseMk, 'on', th > 0);
      if (th > 0) {
        setCss(E.poiseMk, 'left', `${(q(th) * 100).toFixed(2)}%`);
        setCls(E.poiseMk, 'met', P.v >= P.threshold);
      }
      // "+N" floaters, batched (a Chain of reactions is many events)
      this._poiseCd -= gdt;
      if (this._poiseAcc >= 1 && this._poiseCd <= 0) {
        this._poiseCd = 0.22;
        this._poiseFloater(this._poiseAcc, clamp01(P.v / cap));
        this._poiseAcc = 0;
      }
    }

    // ---- Vashkar's Axe Heat (0..100; the Molten Overswing Break Check queues at 100)
    if (typeof b.axeHeat === 'number' && b.id === 'vashkar') {
      const hv = Math.max(0, Math.min(100, b.axeHeat));
      setScaleX(E.heatFill, hv / 100);
      setText(E.heatTxt, `axe heat ${Math.round(hv)}`);
      setCls(E.heat, 'hot', hv >= 85);
      setCls(E.heat, 'full', hv >= 100);
    }

    // ---- cast bar (named casts + Break Checks)
    const c = b.cast;
    if (c) this._verdict = null;
    else if (this._verdict && (this._verdict.t -= gdt) <= 0) this._verdict = null;
    const V = c ? null : this._verdict;
    setCls(E.cast, 'on', !!c || !!V);
    setCls(E.cast, 'verdict', !!V);
    setCls(E.cast, 'ok', !!V?.success);
    setCls(E.cast, 'fail', !!V && !V.success);
    if (c) {
      const key = `${c.name}|${c.check ? c.threshold : 0}`;
      if (this._k.cast !== key) {
        this._k.cast = key;
        setText(E.castName, c.name);
        setText(E.castTag, c.check ? `break it — stagger ${Math.round(c.threshold)}` : '');
        setCls(E.cast, 'check', !!c.check);
      }
      setScaleX(E.castFill, c.dur > 0 ? c.t / c.dur : 0);
      setText(E.castT, Math.max(0, c.dur - c.t).toFixed(1));
    } else if (V) {
      const key = `v|${V.name}|${V.success}`;
      if (this._k.cast !== key) {
        this._k.cast = key;
        setText(E.castName, V.name ?? 'Break Check');
        setText(E.castTag, V.success ? 'broken!' : 'failed');
        setCls(E.cast, 'check', true);
        setText(E.castT, '');
        setScaleX(E.castFill, 1);
      }
    } else this._k.cast = null;

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
      setAttr(E.ward.querySelector('.fg'), 'stroke-dasharray', `${Math.round(clamp01(wt / (b.wardCycle ?? WARD_CYCLE)) * 100)} 100`);
      setText(E.wardT, String(Math.ceil(wt)));
    }
  }

  _onPoise({ enemy, amount }) {
    if (enemy !== this.game.boss || !(amount > 0)) return;
    this._poiseAcc += amount;
    flash(this.el.poiseFlash, [{ opacity: 0.85 }, { opacity: 0 }], { duration: 240 }, 70);
  }

  // a "+N" that rises off the fill's leading edge
  _poiseFloater(n, at) {
    const host = this.el.poiseFl;
    if (!host.animate) return;
    const s = document.createElement('span');
    s.textContent = `+${Math.round(n)}`;
    s.style.left = `${(q(at) * 100).toFixed(2)}%`;
    host.appendChild(s);
    const done = () => s.remove();
    const a = s.animate([{ opacity: 0, transform: 'translate(-50%, 4px)' }, { opacity: 1, transform: 'translate(-50%, -4px)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%, -16px)' }], { duration: 700, easing: 'ease-out' });
    a.onfinish = done;
    setTimeout(done, 900);
    while (host.children.length > 4) host.firstElementChild.remove();
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

  // ================================================================== obelisks: approach card
  // The nearest idle/channelling obelisk inside OB_NEAR: a compact world-anchored card with the live preview()
  // (title, cost, pay, Haste's "≈ −N levels", Wrath's rolled affix + Heat pips) and, while channelling, the
  // progress ring + meter. Everything is data from game.obelisks (defensive `?.`: the director may be a stub).
  _updateObelisks(g, p, dt) {
    const E = this.el;
    const OBS = g.obelisks;
    let best = null, bd = 1e9;
    if (OBS?.list && g.phase === 'horde' && g.state === 'playing' && !p.dead) {
      for (const o of OBS.list) {
        if (!o?.pos || !(o.state === 'idle' || o.state === 'channel')) continue;
        const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
        if (d < bd) { bd = d; best = o; }
      }
    }
    const near = best && bd <= (this._ob === best ? OB_NEAR + 2 : OB_NEAR);
    if (!near) {
      this._ob = null;
      setCls(E.ob, "on", false);
      if (this._obKey) { this._obKey = ""; E.obBody.innerHTML = ""; setText(E.obName, ""); setText(E.obKick, ""); setText(E.obChip, ""); setText(E.obFoot, ""); setHTML(E.obIco, ""); }
      return;
    }
    const o = best;
    const def = OB[o.type] ?? OB.haste;
    const same = this._ob === o;
    this._ob = o;
    this._obT -= dt;
    let pv = null;
    if (!same || this._obT <= 0) {
      this._obT = 0.25;
      try { pv = OBS.preview?.(o.type) ?? null; } catch { pv = null; }
      const heat = o.heat | 0;
      const key = JSON.stringify([o.type, pv, o.nextAffix?.id, heat]);
      if (key !== this._obKey) {
        this._obKey = key;
        this._buildObCard(o, def, pv);
      }
    }
    // channel: progress ring + meter; the body collapses so the card stays small while you stand in the ring
    const ch = !!o.channelling || o.state === 'channel';
    const prog = clamp01(o.progress);
    const chOn = ch && prog > 0;
    setCls(E.ob, 'channel', chOn);
    if (this._obCh !== chOn) {            // the body collapses / returns: re-measure once per toggle
      this._obCh = chOn;
      if (E.ob.offsetWidth) { this._obSize.w = E.ob.offsetWidth; this._obSize.h = E.ob.offsetHeight; }
    }
    setAttr(E.ob.querySelector('.hud-ob-ring .fg'), 'stroke-dasharray', `${Math.round(prog * 100)} 100`);
    setScaleX(E.obFill, prog);
    setText(E.obFoot, chOn ? `channelling ${Math.round(prog * 100)}%${o.type === 'wrath' ? `  ·  heat ${Math.min(HEAT_MAX, (o.heat | 0) + 1)} of ${HEAT_MAX}` : ''}` : this._obHint);

    // anchor above the monolith, clamped under the top bar and above the action bar
    const u = this._uPx, w = window.innerWidth, h = window.innerHeight;
    _v.set(o.pos.x, 4.6, o.pos.z);
    _m.copy(_v).project(g.camera);
    const sx = (_m.x * 0.5 + 0.5) * w, sy = (-_m.y * 0.5 + 0.5) * h, vis = _m.z < 1;
    const cw = this._obSize.w || 330 * u, ch2 = this._obSize.h || 200 * u;
    const x = Math.max(10 * u, Math.min(w - cw - 10 * u, sx - cw / 2));
    let yy = sy - ch2 - 6 * u;
    if (yy < 120 * u) {                    // no room above the monolith: hang the card under its plinth instead
      _v.set(o.pos.x, 0, o.pos.z);
      _m.copy(_v).project(g.camera);
      yy = (-_m.y * 0.5 + 0.5) * h + 44 * u;
    }
    const y = Math.max(120 * u, Math.min(h - ch2 - 150 * u, yy));
    setCls(E.ob, 'on', vis);
    setCss(E.ob, 'transform', `translate3d(${snap(x)}px, ${snap(y)}px, 0)`);
    setVar(E.ob, '--acc', o.def?.color ?? def.color);
  }

  _buildObCard(o, def, pv) {
    const E = this.el;
    const line = (l) => (typeof l === 'string' ? l : (l?.text ?? l?.label ?? ''));
    const aff = o.nextAffix ?? pv?.nextAffix ?? null;
    // Wrath's affix gets its own row: drop the cost line that repeats it
    const cost = (pv?.cost ?? []).map(line).filter((s) => s && !(aff && s.includes(aff.desc)));
    const pay = (pv?.pay ?? []).map(line).filter(Boolean);
    const spriteId = o.def?.icon ?? def.icon;
    setHTML(E.obIco, icon(ICON.ui(spriteId)));
    setText(E.obName, pv?.title ?? o.def?.name ?? def.title);
    setText(E.obKick, pv?.tag ?? 'rift obelisk');
    // Haste: the net level swing, computed live by the director
    const ld = pv?.levelsDelta;
    setText(E.obChip, typeof ld === 'number' ? (ld < 0 ? `≈ −${Math.abs(ld)} level${Math.abs(ld) === 1 ? '' : 's'}` : ld > 0 ? `≈ +${ld} level${ld === 1 ? '' : 's'}` : '≈ even') : '');
    setCls(E.obChip, 'on', typeof ld === 'number');
    setCls(E.obChip, 'gain', typeof ld === 'number' && ld > 0);
    const heat = o.type === 'wrath' ? (o.heat | 0) : -1;
    const sec = (cls, label, lines) => (lines.length
      ? `<div class="hud-ob-sec ${cls}"><span class="hud-ob-lbl"><i></i>${label}</span><ul>${lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : '');
    E.obBody.innerHTML =
      (heat >= 0 ? `<div class="hud-ob-heat"><span class="hud-ob-lbl">heat</span><span class="cf-pips">${Array.from({ length: HEAT_MAX }, (_, i) => `<i class="${i < heat ? 'on' : ''}"></i>`).join('')}</span></div>` : '')
      + (aff ? `<div class="hud-ob-affix"><span class="hud-ob-aico">${affixIcon(aff)}</span><span class="hud-ob-atxt"><b>${esc(aff.name)}</b><span>${esc(aff.desc)}</span></span></div>` : '')
      + sec('cost', 'cost', cost) + sec('pay', 'pay', pay);
    this._obHint = 'hold the ring to channel';
    setText(E.obFoot, this._obHint);
    setCls(E.ob, 'on', true);
    // measure once per rebuild (never per frame)
    this._obSize.w = E.ob.offsetWidth || 0;
    this._obSize.h = E.ob.offsetHeight || 0;
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
      this._mk.push({ root: m, disk: m.querySelector('.hud-mk-disk'), arrow: m.querySelector('.hud-mk-arrow'), ico: m.querySelector('.hud-mk-ico'), ring: m.querySelector('.hud-mk-ring .fg'), d: m.querySelector('.hud-mk-d'), kind: '' });
    }
  }

  _updateMarkers(g, p, dt) {
    const cam = g.camera;
    const targets = [];
    const bossLive = g.boss && !g.boss.dead ? g.boss : null;
    // the act boss: edge arrow only while off screen (the boss bar covers the rest)
    if (bossLive) targets.push({ kind: 'boss', pos: bossLive.pos, y: 2, color: '#e04a3a' });
    // Rift Obelisks (rise at 0:50): the nearest one is on the approach card instead
    const obList = g.obelisks?.list;
    if (obList && g.phase === 'horde') {
      const remain = ACT_LENGTH - (g.actTime ?? 0);
      for (const o of obList) {
        if (!o?.pos || !(o.state === 'idle' || o.state === 'channel') || o === this._ob) continue;
        const d = OB[o.type] ?? OB.haste;
        targets.push({
          kind: `ob-${o.type}`, pos: o.pos, y: 4.4, color: o.def?.color ?? d.color, onScreen: true, label: d.name,
          sprite: o.def?.icon ?? d.icon, prog: clamp01(o.progress), ring: true,
          // Haste's marker pulses faster as the 3:00 summon closes in
          pulse: o.type === 'haste' ? Math.max(0.35, Math.min(1.6, remain / 90)) : 0,
        });
      }
    }
    // fight objects that ask for it (banners, conduits): steel-white = poise sources; the ring is their HP
    if (bossLive?.objects) {
      let n = 0;
      for (const o of bossLive.objects) {
        if (!o.marker || o.dead || n >= 4) continue;
        n++;
        targets.push({ kind: 'object', pos: o.pos, y: 3.2, color: POISE_STEEL, onScreen: true, label: o.name, prog: o.maxHp > 0 ? clamp01(o.hp / o.maxHp) : 1, ring: true, sprite: 'generator' });
      }
    }
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
    const bossOn = !!bossLive;
    const L = 40 * u, R = w - 40 * u;
    const T = (bossOn ? 140 : 132) * u, B = h - 150 * u;   // excludes the top bar and the action bar
    for (let i = 0; i < this._mk.length; i++) {
      const M = this._mk[i], t = targets[i];
      if (!t) { setCls(M.root, 'on', false); setText(M.d, ''); continue; }
      if (M.kind !== t.kind) {
        M.kind = t.kind;
        const sprite = t.sprite
          ? icon(ICON.ui(t.sprite))
          : (() => {
            const [ui, fb] = t.kind === 'boss' ? ['boss', '☠'] : t.kind === 'shrine' ? ['shrine', '⛩'] : t.kind === 'bearer' ? ['chest', '♛'] : ['chest', '▣'];
            return icon(ICON.ui(ui), { fallback: fb });
          })();
        M.ico.innerHTML = sprite;
        M.root.dataset.kind = t.kind;
      }
      setVar(M.root, '--acc', t.color);
      setVar(M.disk, '--pulse', t.pulse ? `${t.pulse.toFixed(2)}s` : '0s');
      setCls(M.root, 'pulse', !!t.pulse);
      _v.set(t.pos.x, t.y, t.pos.z);
      _m.copy(_v).applyMatrix4(cam.matrixWorldInverse);
      const front = _m.z < 0;
      _m.copy(_v).project(cam);
      const sx = (_m.x * 0.5 + 0.5) * w, sy = (-_m.y * 0.5 + 0.5) * h;
      const inside = front && sx >= L && sx <= R && sy >= T && sy <= B;
      if (inside && !t.onScreen) { setCls(M.root, 'on', false); continue; }
      setCls(M.root, 'on', true);
      setCls(M.root, 'edge', !inside);
      const showRing = t.ring ? true : (t.kind === 'shrine' && t.prog > 0);
      if (showRing) setAttr(M.ring, 'stroke-dasharray', `${Math.round((t.prog ?? 0) * 100)} 100`);
      setCls(M.root, 'prog', showRing);

      let x = sx, y = sy - 44 * u, ang = 0;
      let label = t.label ?? '';
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
        label = `${label ? label + ' ' : ''}${Math.round(dist)}m`;
      }
      setText(M.d, label);
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
        `<div class="hud-buff" title="${esc(BUFF_TIP[id] ?? b.name ?? id)}" style="--acc:${b.color ?? 'var(--cf-gilt)'};--el:${b.color ?? 'var(--cf-gilt)'}">
           <div class="hud-buff-sq">${buffIcon(id, b)}<i class="hud-buff-sweep"></i></div>
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
