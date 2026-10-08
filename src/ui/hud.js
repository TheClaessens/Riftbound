// =====================================================================================
//  In-run HUD: act bar, boss bar, HP / XP, trait meter, dash, skill slots, chain counter,
//  relic tray, buffs, shrine marker and the low-HP vignette. Updated every frame, but each
//  value is cached so the DOM is only touched when it changes. Transient overlays live in
//  hud-fx.js.
// =====================================================================================
import * as THREE from 'three';
import { ELEMENT_CSS } from '../core/utils.js';
import { FUSIONS } from '../game/skills/registry.js';
import { SLOT_KEYS } from '../game/player.js';
import { ACTS, ACT_LENGTH } from '../game/acts.js';
import { RELIC_TAG_COLOR } from '../game/relics.js';
import { HUDFx } from './hud-fx.js';
import {
  setText, setCss, setVar, setCls, setPips, restartAnim, clamp01, pct, fmtTime, lerp3, rgbHex,
} from './hud-util.js';

export const DASH_GLYPH = { blink: '⟶', flame: '✹', frost: '❄', storm: '⚡' };
const FUSION_IDS = new Set(FUSIONS.map((f) => f.def.id));
const SHRINE_INFO = {
  fury:      { name: 'Shrine of Fury', color: '#ff6a1f' },
  celerity:  { name: 'Shrine of Celerity', color: '#ffe45c' },
  greed:     { name: 'Shrine of Greed', color: '#ffd34d' },
  aegis:     { name: 'Shrine of Aegis', color: '#9ff3ff' },
};
const CHAIN_WHITE = [255, 255, 255], CHAIN_GOLD = [255, 211, 77];
const CHAIN_MAGENTA = [255, 61, 187], CHAIN_VIOLET = [208, 124, 255];
const EDGE_MARGIN = 56;

const TEMPLATE = `
  <div class="hud-vig" data-ref="vig"></div>
  <div class="hud-vig-hit" data-ref="vigHit"></div>

  <div class="hud-top" data-ref="top">
    <div class="hud-act hud-panel">
      <div class="hud-act-head">
        <span class="hud-act-name" data-ref="actName"></span>
        <span class="hud-act-time" data-ref="actTime">0:00</span>
      </div>
      <div class="hud-act-bar" data-ref="actBar">
        <div class="hud-seg"><i class="hud-seg-fill"></i><b class="hud-skull">☠</b></div>
        <div class="hud-seg"><i class="hud-seg-fill"></i><b class="hud-skull">☠</b></div>
        <div class="hud-seg"><i class="hud-seg-fill"></i><b class="hud-skull">☠</b></div>
      </div>
      <div class="hud-act-sub" data-ref="actSub"></div>
    </div>
    <div class="hud-boss hud-panel" data-ref="boss">
      <div class="hud-boss-head">
        <span class="hud-boss-name" data-ref="bossName"></span>
        <span class="hud-boss-ward" data-ref="bossWard"></span>
        <span class="hud-boss-phase" data-ref="bossPhase"><i></i><i></i></span>
      </div>
      <div class="hud-boss-track"><div class="hud-boss-fill" data-ref="bossFill"></div></div>
    </div>
  </div>

  <div class="hud-tl">
    <div class="hud-relics" data-ref="relics"></div>
    <div class="hud-buffs" data-ref="buffs"></div>
  </div>

  <div class="hud-chain" data-ref="chain">
    <span class="hud-chain-word">CHAIN</span> <span class="hud-chain-n" data-ref="chainN"></span>
  </div>

  <div class="hud-bottom">
    <div class="hud-ac" data-ref="ac"></div>
    <div class="hud-core-row">
      <div class="hud-trait hud-panel" data-ref="trait">
        <div class="hud-tr" data-trait="resonance">
          <div class="hud-tr-label">Resonance</div>
          <div class="hud-tr-track"><div class="hud-tr-fill" data-ref="resFill"></div></div>
          <div class="hud-tr-val" data-ref="resVal"></div>
        </div>
        <div class="hud-tr" data-trait="wildfire">
          <div class="hud-tr-label"><span class="hud-tr-glyph">🔥</span> Wildfire</div>
          <div class="hud-tr-sub">Burning foes erupt when they fall</div>
        </div>
        <div class="hud-tr" data-trait="permafrost">
          <div class="hud-tr-label">Frost Armor</div>
          <div class="hud-pips" data-ref="trPips"><i></i><i></i><i></i></div>
        </div>
        <div class="hud-tr" data-trait="momentum">
          <div class="hud-tr-label">Momentum</div>
          <div class="hud-tr-track"><div class="hud-tr-fill" data-ref="momFill"></div></div>
          <div class="hud-tr-val" data-ref="momVal"></div>
        </div>
      </div>

      <div class="hud-core">
        <div class="hud-armor-row" data-ref="armorRow">
          <span class="hud-armor-label">FROST ARMOR</span>
          <div class="hud-pips" data-ref="armorPips"><i></i><i></i><i></i></div>
        </div>
        <div class="hud-hp" data-ref="hp">
          <div class="hud-hp-track">
            <div class="hud-hp-fill" data-ref="hpFill"></div>
            <div class="hud-shield-fill" data-ref="shieldFill"></div>
          </div>
          <div class="hud-hp-text" data-ref="hpText"></div>
        </div>
        <div class="hud-xp">
          <div class="hud-xp-fill" data-ref="xpFill"></div>
          <span class="hud-xp-text" data-ref="xpText"></span>
        </div>
      </div>
    </div>

    <div class="hud-skills hud-panel">
      <div class="hud-dash" data-ref="dash">
        <div class="hud-key">SPACE</div>
        <div class="hud-dash-icon" data-ref="dashIcon"></div>
        <div class="hud-dash-info">
          <div class="hud-dash-name" data-ref="dashName"></div>
          <div class="hud-pips hud-dash-pips" data-ref="dashPips"></div>
        </div>
      </div>
      <div class="hud-slots" data-ref="slots"></div>
      <div class="hud-autos" data-ref="autos"></div>
    </div>
  </div>

  <div class="hud-shrine" data-ref="shrine">
    <div class="hud-shrine-mark">
      <div class="hud-shrine-ring"></div>
      <div class="hud-shrine-core"></div>
      <div class="hud-shrine-label" data-ref="shrineLabel"></div>
    </div>
    <div class="hud-shrine-arrow">
      <div class="hud-shrine-tri" data-ref="shrineTri"></div>
      <div class="hud-shrine-label" data-ref="arrowLabel"></div>
    </div>
  </div>
`;

const _v = new THREE.Vector3();
const _m = new THREE.Vector3();
const _p = new THREE.Vector3();

function chainColor(n) {
  if (n < 10) return rgbHex(lerp3(CHAIN_WHITE, CHAIN_GOLD, (n - 2) / 8));
  if (n < 25) return rgbHex(lerp3(CHAIN_GOLD, CHAIN_MAGENTA, (n - 10) / 15));
  return rgbHex(lerp3(CHAIN_MAGENTA, CHAIN_VIOLET, (n - 25) / 25));
}

function relicTile(r) {
  const col = RELIC_TAG_COLOR[r.tag] ?? '#c08cff';
  return `<div class="hud-relic" style="--tag:${col}">
    <span class="hud-relic-ico">${r.icon}</span>
    <div class="hud-tip">
      <div class="hud-tip-name">${r.name}</div>
      <div class="hud-tip-tag">${String(r.tag).toUpperCase()}</div>
      <div class="hud-tip-desc">${r.desc}</div>
      <div class="hud-tip-flavour">${r.flavour ?? ''}</div>
    </div>
  </div>`;
}

export class HUD {
  constructor(game, uiRoot) {
    this.game = game;
    this.visible = false;
    this._k = {};              // last structural keys (guards for rebuilding DOM)
    this._chainLast = 0;
    this._buffRefs = [];
    this._slotParts = [];
    this._unsub = [];

    const root = document.createElement('div');
    root.className = 'hud';
    root.style.display = 'none';
    root.innerHTML = TEMPLATE;
    uiRoot.appendChild(root);
    this.root = root;

    const $ = (ref) => root.querySelector(`[data-ref="${ref}"]`);
    const traits = {};
    root.querySelectorAll('[data-trait]').forEach((el) => { traits[el.dataset.trait] = el; });

    this.el = {
      vig: $('vig'), vigHit: $('vigHit'), top: $('top'),
      actName: $('actName'), actTime: $('actTime'), actSub: $('actSub'),
      segs: [...root.querySelectorAll('.hud-seg')],
      boss: $('boss'), bossName: $('bossName'), bossWard: $('bossWard'),
      bossPhase: $('bossPhase'), bossFill: $('bossFill'),
      relics: $('relics'), buffs: $('buffs'),
      chain: $('chain'), chainN: $('chainN'),
      ac: $('ac'), trait: $('trait'), traits,
      resFill: $('resFill'), resVal: $('resVal'),
      momFill: $('momFill'), momVal: $('momVal'), trPips: $('trPips'),
      armorRow: $('armorRow'), armorPips: $('armorPips'),
      hp: $('hp'), hpFill: $('hpFill'), shieldFill: $('shieldFill'), hpText: $('hpText'),
      xpFill: $('xpFill'), xpText: $('xpText'),
      dash: $('dash'), dashIcon: $('dashIcon'), dashName: $('dashName'), dashPips: $('dashPips'),
      slots: $('slots'), autos: $('autos'),
      shrine: $('shrine'), shrineLabel: $('shrineLabel'), shrineTri: $('shrineTri'), arrowLabel: $('arrowLabel'),
    };

    // Five slot boxes; their contents are rebuilt only when the skill or its rank changes.
    for (let i = 0; i < SLOT_KEYS.length; i++) {
      const box = document.createElement('div');
      box.className = 'hud-slot empty';
      this.el.slots.appendChild(box);
      this._slotParts.push(null);
    }
    this.el.slotBoxes = [...this.el.slots.children];

    this.fx = new HUDFx(game, root);

    this._unsub.push(game.events.on('playerHit', () => restartAnim(this.el.vigHit, 'on')));
  }

  show() {
    this.visible = true;
    this.root.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.root.style.display = 'none';
  }

  dispose() {
    this._unsub.forEach((u) => u?.());
    this._unsub = [];
    this.fx.dispose();
    this.root.remove();
  }

  update(dt) {
    if (!this.visible) return;
    const g = this.game;
    const p = g.player;

    this._updateAct(g, p);
    this._updateBoss(g);
    this._updateChain(g);
    this._updateShrine(g);
    this.fx.update(dt);

    setText(this.el.ac, `[T] AUTO-CAST ${g.autoCast ? 'ON' : 'OFF'}`);
    setCls(this.el.ac, 'on', !!g.autoCast);

    if (!p) return;
    this._updateRelics(p);
    this._updateBuffs(p);
    this._updateHP(p);
    this._updateTrait(p, g);
    this._updateDash(p);
    this._updateSlots(p);
  }

  // ------------------------------------------------------------------ act bar
  _updateAct(g, p) {
    const E = this.el;
    const act = g.act ?? 0;
    const def = ACTS[act];
    if (def) {
      setText(E.actName, `ACT ${def.numeral} · ${def.name.toUpperCase()}`);
      setCss(E.actName, 'color', def.color);
      setVar(E.top, '--act', def.color);   // act accent: progress bar fill
    }

    let timeText;
    if (g.phase === 'boss') timeText = 'BOSS FIGHT';   // the boss bar below carries the name
    else if (g.phase === 'shift') timeText = 'RIFT SHIFT';
    else timeText = fmtTime(Math.min(g.actTime ?? 0, ACT_LENGTH));
    setText(E.actTime, timeText);
    setCls(E.actTime, 'boss', g.phase === 'boss');

    for (let i = 0; i < E.segs.length; i++) {
      const seg = E.segs[i];
      let f = 0;
      if (i < act) f = 1;
      else if (i === act) f = g.phase === 'horde' ? clamp01((g.actTime ?? 0) / ACT_LENGTH) : 1;
      setCss(seg.querySelector('.hud-seg-fill'), 'width', pct(f));
      setCls(seg, 'done', f >= 1);
      setCls(seg, 'cur', i === act);
    }

    setText(E.actSub, `Lv ${p?.level ?? 1} · ${g.stats?.kills ?? 0} kills`);
  }

  // ------------------------------------------------------------------ boss bar
  _updateBoss(g) {
    const E = this.el;
    const b = g.boss;
    const on = !!b && !b.dead;
    setCls(E.boss, 'on', on);
    if (!on) return;

    setText(E.bossName, String(b.name ?? ACTS[g.act]?.bossName ?? 'Boss').toUpperCase());
    setCss(E.bossFill, 'width', pct(b.maxHp > 0 ? b.hp / b.maxHp : 0));
    setCls(E.bossPhase, 'p2', (b.phase ?? 1) >= 2);

    const ward = b.ward;
    setCls(E.bossWard, 'on', !!ward);
    if (ward) {
      setText(E.bossWard, `WARD · ${String(ward).toUpperCase()}`);
      const col = ELEMENT_CSS[ward] ?? '#ffffff';
      setCss(E.bossWard, 'color', col);
      setCss(E.bossWard, 'borderColor', col);
    }
  }

  // ------------------------------------------------------------------ chain
  _updateChain(g) {
    const E = this.el;
    const n = g.chain | 0;
    if (n >= 2) {
      setText(E.chainN, '×' + n);
      setCss(E.chain, 'fontSize', (34 + Math.min(n, 50) * 0.5).toFixed(1) + 'px');
      setCls(E.chainN, 'rainbow', n >= 50);
      setCss(E.chainN, 'color', n >= 50 ? '' : chainColor(n));
      setCls(E.chain, 'on', true);
      if (n > this._chainLast) restartAnim(E.chain, 'pop');
      this._chainLast = n;
    } else {
      // Chain ended: fade out (CSS transition) and keep the last number visible while fading.
      setCls(E.chain, 'on', false);
      this._chainLast = 0;
    }
  }

  // ------------------------------------------------------------------ HP / XP / armour
  _updateHP(p) {
    const E = this.el;
    const max = Math.max(1, p.stats.maxHp);
    const hp = Math.max(0, p.hp);
    const sh = Math.max(0, p.shield || 0);
    const total = Math.max(max, hp + sh);

    setCss(E.hpFill, 'width', pct(hp / total));
    setCss(E.shieldFill, 'left', pct(hp / total));
    setCss(E.shieldFill, 'width', pct(sh / total));
    setText(E.hpText, `${Math.ceil(hp)} / ${max}` + (sh > 0 ? `   +${Math.ceil(sh)}` : ''));
    setCls(E.hp, 'low', hp / max < 0.3);

    setCss(E.xpFill, 'width', pct(p.xpToNext > 0 ? p.xp / p.xpToNext : 0));
    setText(E.xpText, `LV ${p.level}`);

    const fa = p.frostArmor | 0;
    setCls(E.armorRow, 'on', fa > 0);
    setPips(E.armorPips, fa);
  }

  // ------------------------------------------------------------------ trait meter
  _updateTrait(p, g) {
    const E = this.el;
    for (const k of Object.keys(E.traits)) setCls(E.traits[k], 'on', k === p.traitId);

    switch (p.traitId) {
      case 'resonance': {
        const c = Math.min(25, g.chain | 0);
        setCss(E.resFill, 'width', pct(c / 25));
        setText(E.resVal, `${c} / 25 · +${Math.round((p.traitDamage || 0) * 100)}% DMG`);
        break;
      }
      case 'momentum': {
        const ch = Math.max(0, Math.min(100, p.charge || 0));
        setCss(E.momFill, 'width', pct(ch / 100));
        setText(E.momVal, `${Math.round(ch)} / 100 · +${(ch * 0.5).toFixed(1)}% DMG`);
        setCls(E.traits.momentum, 'hot', ch > 80);
        break;
      }
      case 'permafrost':
        setPips(E.trPips, p.frostArmor | 0);
        break;
    }
  }

  // ------------------------------------------------------------------ dash
  _updateDash(p) {
    const E = this.el;
    const d = p.dash, def = d.def;
    setCls(E.dash, 'ready', d.charges > 0);
    setVar(E.dash, '--c', p.cls.color);
    setText(E.dashName, def.name);
    setText(E.dashIcon, DASH_GLYPH[def.kind] ?? '➤');

    if (E.dashPips.children.length !== d.max) {
      E.dashPips.innerHTML = Array.from({ length: d.max }, () => '<i></i>').join('');
    }
    const full = def.cd * (1 - Math.min(0.7, Math.max(0, p.stats.dashCdr || 0)));
    const pips = E.dashPips.children;
    for (let i = 0; i < pips.length; i++) {
      let prog = 0;
      if (i < d.charges) prog = 100;
      else if (i === d.charges && full > 0) prog = clamp01(1 - d.recharge / full) * 100;
      setVar(pips[i], '--p', prog.toFixed(1));
    }
  }

  // ------------------------------------------------------------------ skill slots + autos
  _updateSlots(p) {
    const E = this.el;
    for (let i = 0; i < E.slotBoxes.length; i++) {
      const box = E.slotBoxes[i];
      const s = p.slots[i] ?? null;
      const key = s ? `${s.def.id}:${s.rank}` : '';
      if (this._k['slot' + i] !== key) {
        this._k['slot' + i] = key;
        const label = `<div class="hud-slot-key">${SLOT_KEYS[i].label}</div>`;
        if (s) {
          const max = s.def.maxRank ?? 5;
          let pips = '';
          for (let j = 0; j < max; j++) pips += `<i class="${j < s.rank ? 'on' : ''}"></i>`;
          box.innerHTML = `${label}<div class="hud-slot-icon">${s.def.icon}</div>
            <div class="hud-slot-cd"></div><div class="hud-slot-cdt"></div>
            <div class="hud-slot-pips">${pips}</div>`;
          box.classList.toggle('fusion', FUSION_IDS.has(s.def.id));
          box.classList.remove('empty');
          setVar(box, '--el', ELEMENT_CSS[s.def.element] ?? '#c08cff');
          this._slotParts[i] = { cd: box.querySelector('.hud-slot-cd'), cdt: box.querySelector('.hud-slot-cdt') };
        } else {
          box.innerHTML = `${label}<div class="hud-slot-empty">—</div>`;
          box.classList.remove('fusion');
          box.classList.add('empty');
          setVar(box, '--el', '#c4923a');
          this._slotParts[i] = null;
        }
      }
      const parts = this._slotParts[i];
      if (s && parts) {
        const maxCd = typeof s.def.cooldown === 'function' ? s.def.cooldown(s.rank) : 0;
        const r = maxCd > 0 ? clamp01(s.cd / maxCd) : 0;
        setVar(parts.cd, '--cd', Math.round(r * 360) + 'deg');
        setText(parts.cdt, s.cd > 0.05 ? s.cd.toFixed(1) : '');
        setCls(box, 'ready', s.cd <= 0);
      } else {
        setCls(box, 'ready', false);
      }
    }

    const autos = p.skills.filter((s) => s.slot < 0);
    const aKey = autos.map((s) => `${s.def.id}:${s.rank}`).join(',');
    if (this._k.autos !== aKey) {
      this._k.autos = aKey;
      E.autos.innerHTML = autos.map((s) =>
        `<div class="hud-auto" style="--el:${ELEMENT_CSS[s.def.element] ?? '#c08cff'}" title="${s.def.name} · rank ${s.rank}">
           <span>${s.def.icon}</span><i>${s.rank}</i></div>`).join('');
    }
  }

  // ------------------------------------------------------------------ relics / buffs
  _updateRelics(p) {
    const key = p.relics.map((r) => r.id).join(',');
    if (this._k.relics !== key) {
      this._k.relics = key;
      this.el.relics.innerHTML = p.relics.map(relicTile).join('');
    }
  }

  _updateBuffs(p) {
    const buffs = [...(p.buffs?.entries() ?? [])];
    const key = buffs.map(([id]) => id).join(',');
    if (this._k.buffs !== key) {
      this._k.buffs = key;
      this.el.buffs.innerHTML = '';
      this._buffRefs = buffs.map(([id, b]) => {
        const d = document.createElement('div');
        d.className = 'hud-buff hud-panel';
        d.style.setProperty('--c', b.color ?? '#c08cff');
        d.innerHTML = `<span class="hud-buff-ico">${b.icon ?? '◆'}</span>
          <span class="hud-buff-name">${b.name ?? id}</span>
          <span class="hud-buff-t"></span><i class="hud-buff-bar"></i>`;
        this.el.buffs.appendChild(d);
        return { t: d.querySelector('.hud-buff-t'), bar: d.querySelector('.hud-buff-bar') };
      });
    }
    buffs.forEach(([, b], i) => {
      const r = this._buffRefs[i];
      if (!r) return;
      setText(r.t, Math.ceil(Math.max(0, b.t)) + 's');
      setCss(r.bar, 'width', pct(b.dur > 0 ? b.t / b.dur : 0));
    });
  }

  // ------------------------------------------------------------------ shrine marker
  _updateShrine(g) {
    const E = this.el;
    const s = g.world?.shrine;
    const cam = g.camera;
    if (!s || !s.pos || !cam) { setCls(E.shrine, 'on', false); return; }

    const info = SHRINE_INFO[s.type] ?? {};
    const color = s.color ?? info.color ?? '#c08cff';
    const name = s.name ?? info.name ?? 'Shrine';
    setCls(E.shrine, 'on', true);
    setVar(E.shrine, '--c', color);
    setText(E.shrineLabel, name);
    setText(E.arrowLabel, name);
    const ring = E.shrine.querySelector('.hud-shrine-ring');
    setVar(ring, '--p', (clamp01(s.progress) * 360).toFixed(1) + 'deg');

    // Project a point just above the shrine into screen space.
    _v.set(s.pos.x, 1.4, s.pos.z);
    _m.copy(_v).applyMatrix4(cam.matrixWorldInverse);
    const front = _m.z < 0;   // camera looks down -Z in view space
    _p.copy(_v).project(cam);
    const w = window.innerWidth, h = window.innerHeight;
    const sx = (_p.x * 0.5 + 0.5) * w;
    const sy = (-_p.y * 0.5 + 0.5) * h;

    const onScreen = front && sx >= EDGE_MARGIN && sx <= w - EDGE_MARGIN && sy >= EDGE_MARGIN && sy <= h - EDGE_MARGIN;
    if (onScreen) {
      setCls(E.shrine, 'mark', true);
      setCls(E.shrine, 'arrow', false);
      setCss(E.shrine, 'transform', `translate(${sx.toFixed(1)}px, ${(sy - 40).toFixed(1)}px)`);
      return;
    }

    // Off screen (or behind the camera): pin an arrow to the screen edge.
    let dx = sx - w / 2, dy = sy - h / 2;
    if (!front) { dx = -dx; dy = -dy; }
    if (dx === 0 && dy === 0) dy = -1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const hw = w / 2 - EDGE_MARGIN, hh = h / 2 - EDGE_MARGIN;
    const t = Math.min(
      ux !== 0 ? hw / Math.abs(ux) : Infinity,
      uy !== 0 ? hh / Math.abs(uy) : Infinity,
    );
    const ex = w / 2 + ux * t, ey = h / 2 + uy * t;
    const ang = Math.atan2(uy, ux) * 180 / Math.PI;

    setCls(E.shrine, 'mark', false);
    setCls(E.shrine, 'arrow', true);
    setCss(E.shrine, 'transform', `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px)`);
    setCss(E.shrineTri, 'transform', `rotate(${(ang + 90).toFixed(1)}deg)`);
  }
}
