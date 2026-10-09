// =====================================================================================
//  The Rift Primer: a first-run tutorial played inside the opening minute of Act I, plus
//  one-time contextual tips for later moments (shrines, bosses, new acts).
//
//  The primer never pauses the game. It holds the act clock (so the Elite Surge and the
//  shrine wait for it) and walks the player through one objective at a time:
//    1. cast     hold LMB, kill a few foes (your bolts apply your element)
//    2. dash     press Space
//    3. crystal  a Rift Crystal of a complementary element spawns with a goblin pack around
//                it: shoot it while they are inside its ring
//    4. react    hit the foes it marked with your own element -> a REACTION
//    5. chain    short note on Chain, then done
//  Step 3/4 retry if the blast hits nobody or the marked foes die without reacting.
//  Done or skipped is saved in meta.tutorialDone; tips seen are saved in meta.tips.
// =====================================================================================
import * as THREE from 'three';
import { createEnemy } from './enemies.js';
import { REACTIONS } from './combat.js';
import { CLASSES } from './classes.js';
import { saveMeta } from './meta.js';
import { ELEMENT_CSS } from '../core/utils.js';

const CARD_DELAY = 3.4;          // wait for the act title card
const CAST_KILLS = 5;
const CRYSTAL_DIST = 8;
const PACK = 6;
const PACK_HP = 3.5;            // x HP for the pack (the blast alone kills a 1x goblin)
const REACT_TIMEOUT = 9;         // seconds after the blast before the crystal step is retried
const MAX_TRIES = 3;
const CHAIN_NOTE = 7;
const DONE_NOTE = 3.5;
const TIP_TIME = 7;
const HOLD_MAX = 150;            // never hold the act clock longer than this
const EDGE = 56;

// The crystal that reacts with each class's starter element, and what it makes.
const PAIR = {
  fire:   { crystal: 'frost', reaction: 'steam' },
  frost:  { crystal: 'fire', reaction: 'steam' },
  storm:  { crystal: 'frost', reaction: 'superconduct' },
  arcane: { crystal: 'fire', reaction: 'combust' },
};
const STATUS = { fire: 'Burning', frost: 'Chilled', storm: 'Shocked', arcane: 'Marked' };
const EL_NAME = { fire: 'Fire', frost: 'Frost', storm: 'Storm', arcane: 'Arcane' };

const el = (e, text = EL_NAME[e]) => `<b style="color:${ELEMENT_CSS[e] ?? '#fff'}">${text}</b>`;
const kbd = (k) => `<kbd>${k}</kbd>`;

const _v = new THREE.Vector3();
const _m = new THREE.Vector3();

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this._tip = null;
    this._kills = 0;
    this._marked = [];
    this._unsub = [];
    this._build(game.ui.uiRoot);

    const on = (ev, fn) => this._unsub.push(game.events.on(ev, fn));
    on('runStart', (e) => this._onRunStart(e));
    on('runEnd', () => this._stop(false));
    on('enemyKilled', ({ enemy }) => { if (!enemy.inert) this._kills++; });
    on('dash', () => { if (this.step === 'dash') this._complete(); });
    on('geodeBroken', (e) => this._onCrystalBroken(e));
    on('reaction', (e) => this._onReaction(e));
    on('levelUp', () => this._onLevelUp());
    on('shrineSpawned', () => this.tip('shrine', 'A <b>Shrine</b> has appeared &mdash; follow the arrow.', 'Stand inside it for 2.5s to claim a powerful 25s blessing.'));
    on('bossSpawned', () => this.tip('boss', 'A <b>boss</b> approaches!', 'Every attack is telegraphed in <b style="color:#ff5a4a">red</b>. Step out, or dash through it.'));
    // v5 raid tips: Rift Obelisks, Stagger / Downed, Break Checks (one-time each; see design/RAID.md)
    on('obelisksRisen', () => this.tip('obelisks', 'Obelisks let you <b>call the boss your way</b>.', '<b style="color:#ffd34d">Haste</b> summons it now, <b style="color:#b9a4ff">Echo</b> brings it twice, <b style="color:#ff8a4a">Wrath</b> adds affixes. Stand in a ring for 4s to arm one. Doing nothing is fine.'));
    on('bossDowned', ({ reason } = {}) => reason !== 'winded' && this.tip('downed', 'The boss is <b>Downed</b>!', 'Reactions, freezes and perfect dodges fill its <b style="color:#e8eef8">Stagger</b> bar. A full bar drops it for a few seconds: hit it hard.'));
    on('breakCheck', () => this.tip('breakcheck', 'A <b>Break Check</b>: it is charging a big attack.', 'Fill the Stagger bar past the marker before the cast ends to cancel it and knock the boss Down.'));
    on('actStart', ({ act }) => {
      if (act === 1) this.tip('act2', 'The orcs of the Barrens <b>resist Fire</b> (50%).', `Lean on reactions and other elements. Red rings with glowing cracks erupt as geysers: step out.`, CARD_DELAY);
      if (act === 2) this.tip('act3', 'Some foes carry a <b>Prism Ward</b> &mdash; immune to one element.', 'Any reaction on a warded foe shatters its ward. Mind the lightning circles.', CARD_DELAY);
    });
  }

  /** True while the primer holds the act clock (game.js skips actTime). */
  get holdClock() { return this.active && this.step !== 'chain' && this.step !== 'done' && this._held < HOLD_MAX; }

  // ------------------------------------------------------------------ public

  /** One-time contextual tip (shown once per profile). */
  tip(id, text, sub = '', delay = 0) {
    const meta = this.game.meta;
    if (!this._playerRun || !meta || meta.tips?.includes(id)) return;
    if (this.active && this.step !== 'done') return;   // the primer has the panel; the tip waits for another time
    (meta.tips ??= []).push(id);
    saveMeta(meta);
    this._tip = { text, sub, t: TIP_TIME, delay };
  }

  skip() {
    this._stop(true);
  }

  /** Stop without marking the primer done (dev tools: act jumps, sims). */
  cancel() {
    this._stop(false);
  }

  // ------------------------------------------------------------------ flow

  _onRunStart({ player } = {}) {
    const g = this.game, meta = g.meta;
    this._stop(false);
    this._tip = null;
    this._playerRun = !!player;   // tips and the primer only for runs a person started
    if (!meta || meta.tutorialDone || !player) return;
    const cls = CLASSES[g.player?.cls?.id] ?? CLASSES.pyromancer;
    this.elem = cls.element;
    this.starter = g.player?.getSkill?.(cls.starter)?.def?.name ?? 'your bolt';
    this.pair = PAIR[this.elem] ?? PAIR.fire;
    this.active = true;
    this.stepIdx = -1;
    this.step = 'intro';
    this._t = 0;
    this._held = 0;
    this._tries = 0;
    this.crystal = null;
    this._render();
  }

  _stop(markDone) {
    if (this.active && markDone) {
      this.game.meta.tutorialDone = true;
      saveMeta(this.game.meta);
    }
    this.active = false;
    this.step = null;
    this.crystal = null;
    this._glow(null);
    this.game.ui.levelUpTip = '';
    this._render();
  }

  _go(step) {
    this.step = step;
    this._t = 0;
    const g = this.game;
    switch (step) {
      case 'cast': this.stepIdx = 0; this._kills = 0; this._glow('.hud-slots'); break;
      case 'dash': this.stepIdx = 1; this._glow('.hud-dash'); break;
      case 'crystal':
        this.stepIdx = 2; this._glow(null); this._placeCrystal();
        if (!g.meta.tips.includes('crystal')) g.meta.tips.push('crystal');   // taught here; no separate tip
        break;
      case 'react': this.stepIdx = 3; break;
      case 'chain': this.stepIdx = 4; this._glow('.hud-chain'); this.crystal = null; break;
      case 'done':
        this._glow(null);
        g.meta.tutorialDone = true;
        saveMeta(g.meta);
        break;
    }
    this._render(true);
  }

  _complete() {
    const next = { intro: 'cast', cast: 'dash', dash: 'crystal', crystal: 'react', react: 'chain', chain: 'done' }[this.step];
    if (next) this._go(next);
  }

  /** Real-time frame tick (after the game update). */
  update(realDt) {
    const g = this.game;
    const playing = g.state === 'playing';
    this.el.panel.classList.toggle('hide', !playing);
    if (this._tip && playing) {
      if (this._tip.delay > 0) this._tip.delay -= realDt;
      else { this._tip.t -= realDt; if (this._tip.t <= 0) this._tip = null; }
      this._renderTip();
    } else if (this._tipShown && !this._tip) this._renderTip();

    if (!this.active) {
      this._mark(null);
      if (playing) this._scanForCrystal(realDt);
      return;
    }
    if (playing) {
      const dt = realDt;
      this._t += dt;
      if (this.holdClock) this._held += dt;
      switch (this.step) {
        case 'intro': if (this._t >= CARD_DELAY) this._go('cast'); break;
        case 'cast': if (this._kills >= CAST_KILLS) this._complete(); break;
        case 'crystal':
          // if the crystal got lost (biome change etc.) place a new one
          if (!this.crystal || (this.crystal.dead && !this._broken)) this._placeCrystal();
          break;
        case 'react': {
          const marked = this._marked.filter((e) => !e.dead);
          if (this._t > REACT_TIMEOUT || (marked.length === 0 && this._t > 1.5)) this._retry();
          break;
        }
        case 'chain': if (this._t >= CHAIN_NOTE) this._complete(); break;
        case 'done': if (this._t >= DONE_NOTE) { this.active = false; this.step = null; this._render(); } break;
      }
    }
    this._mark(playing && this.step === 'crystal' && this.crystal && !this.crystal.dead ? this.crystal : null);
  }

  // Players who skipped the primer get the crystal explained the first time they walk up to one.
  _scanForCrystal(dt) {
    const g = this.game, p = g.player;
    if (!p || g.meta.tips?.includes('crystal')) return;
    this._scanT = (this._scanT ?? 0) - dt;
    if (this._scanT > 0) return;
    this._scanT = 0.5;
    if (g.enemies.some((e) => e.type === 'geode' && !e.dead && e.pos.distanceTo(p.pos) < 9)) {
      this.tip('crystal', 'Glowing crystals are <b>Rift Crystals</b>.', 'Shoot one to blast every foe inside its ring with its element. Lure foes in first.');
    }
  }

  _retry() {
    this._tries++;
    if (this._tries >= MAX_TRIES) { this._go('chain'); return; }
    this._go('crystal');
    this._setSub(`Try again: wait until foes are <b>inside the ring</b>, then shoot the crystal.`);
  }

  // Crystal ahead of the player (toward the cursor), goblin pack on its far side walking in.
  _placeCrystal() {
    const g = this.game, p = g.player;
    if (!p) return;
    this._broken = false;
    this._reactedEarly = false;
    _v.copy(g.input.mouseGround).sub(p.pos).setY(0);
    if (_v.lengthSq() < 1) _v.set(0, 0, -1);
    _v.normalize();
    // toward the cursor if there is room, else swing around until the arena edge / props allow it
    const base = Math.atan2(_v.z, _v.x);
    let pos = null;
    for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6, Math.PI]) {
      _v.set(Math.cos(base + da), 0, Math.sin(base + da));
      const q = p.pos.clone().addScaledVector(_v, CRYSTAL_DIST);
      g.world.collide(q, 1.2);
      if (q.distanceTo(p.pos) >= CRYSTAL_DIST - 1.5) { pos = q; break; }
    }
    if (!pos) pos = p.pos.clone().addScaledVector(_v, CRYSTAL_DIST);
    this.crystal = g.world.spawnCrystal(this.pair.crystal, pos, { hp: 1 });
    const opts = g.spawner._opts(g.act, 0, 'husk', false);
    opts.hpMult *= PACK_HP;   // they must survive the blast to be reacted on
    for (let i = 0; i < PACK; i++) {
      const a = Math.atan2(_v.z, _v.x) + (i / (PACK - 1) - 0.5) * 2.2;
      const d = 2.5 + (i % 2) * 1.6;
      const q = new THREE.Vector3(pos.x + Math.cos(a) * d, 0, pos.z + Math.sin(a) * d);
      g.world.collide(q, 0.5);
      g.addEnemy(createEnemy(g, 'husk', q, opts));
    }
  }

  _onCrystalBroken(e) {
    if (!this.active || this.step !== 'crystal' || !this.crystal) return;
    if (e.pos.distanceTo(this.crystal.pos) > 0.5) return;
    this._broken = true;
    // foes already carrying your element react to the blast itself: that is the lesson, done
    if (this._reactedEarly) { this._reactedEarly = false; this._go('chain'); return; }
    if (!e.hits) { this._retry(); return; }
    // remember who got the crystal's element, to time out if they all die unreacted
    const st = { fire: 'burn', frost: 'chill', storm: 'shock' }[this.pair.crystal];
    this._marked = this.game.queryEnemies(e.pos, 5, []).filter((x) => !x.inert && !x.dead && (!st || x.status[st] > 0));
    this._complete();
  }

  _onReaction(e) {
    if (!this.active) return;
    // The crystal's damage (and so any reaction it causes) lands before geodeBroken is emitted.
    const early = this.step === 'crystal' && this.crystal && e.pos && e.pos.distanceTo(this.crystal.pos) < 6;
    if (this.step !== 'react' && !early) return;
    this.game.slowmo(0.9, 0.35);
    this._reacted = REACTIONS[e.type];
    if (early) this._reactedEarly = true;
    else this._complete();
  }

  _onLevelUp() {
    // the first level-up of the primer run explains what to look for on the cards
    if (!this.active || this._luTold) return;
    this._luTold = true;
    this.game.ui.levelUpTip = 'Tip: a skill of a different element lets you set off reactions on your own. Look for "Reacts with your ..." on the cards.';
  }

  // ------------------------------------------------------------------ text

  _copy() {
    const E = this.elem, C = this.pair.crystal, R = REACTIONS[this.pair.reaction];
    switch (this.step) {
      case 'cast': return {
        text: `Hold ${kbd('LMB')} to cast <b>${this.starter}</b>. Move with ${kbd('WASD')}.`,
        sub: E === 'arcane' ? `${el(E)} detonates the elements other spells leave on a foe.` : `Your bolts leave foes ${el(E, STATUS[E])}.`,
        prog: () => `${Math.min(this._kills, CAST_KILLS)} / ${CAST_KILLS}`,
      };
      case 'dash': return {
        text: `Press ${kbd('SPACE')} to dash.`,
        sub: 'Nothing can hit you mid-dash. Dash just as an attack lands for a <b>PERFECT</b> dodge.',
      };
      case 'crystal': return {
        text: `A ${el(C, EL_NAME[C] + ' Rift Crystal')}! Shoot it while foes are <b>inside its ring</b>.`,
        sub: `Its blast leaves every foe it reaches ${el(C, STATUS[C])}.`,
      };
      case 'react': return {
        text: `Now hit the ${el(C, STATUS[C])} foes with your ${el(E)}!`,
        sub: 'Two elements on one foe set off a <b>REACTION</b>.',
      };
      case 'chain': {
        const r = this._reacted ?? R;
        return {
          text: `<b style="color:${r.color}">${r.name}!</b> ${el(r.elements[0])} + ${el(r.elements[1])}. There are 6 reactions to discover.`,
          sub: 'Reactions in quick succession build <b>CHAIN</b> for bonus XP. Rift Crystals keep appearing: lure foes into them.',
        };
      }
      case 'done': return { text: '<b>Primer complete.</b> Survive three minutes, then slay the Troll King.', sub: '' };
      default: return null;
    }
  }

  // ------------------------------------------------------------------ DOM

  _build(root) {
    root.insertAdjacentHTML('beforeend', `
      <div class="tut cf-plate" data-ref="tut">
        <div class="tut-head">
          <span class="tut-kicker" data-ref="kicker"></span>
          <span class="tut-steps" data-ref="steps"><i></i><i></i><i></i><i></i><i></i></span>
        </div>
        <div class="tut-text" data-ref="text"></div>
        <div class="tut-sub" data-ref="sub"></div>
        <div class="tut-foot">
          <span class="tut-prog num" data-ref="prog"></span>
          <button type="button" class="tut-skip" data-ref="skip">Skip tutorial</button>
        </div>
      </div>
      <div class="tut-tip cf-plate" data-ref="tip">
        <div class="tut-kicker">TIP</div>
        <div class="tut-text" data-ref="tipText"></div>
        <div class="tut-sub" data-ref="tipSub"></div>
      </div>
      <div class="tut-mark" data-ref="mark">
        <div class="tut-mark-label">SHOOT IT</div>
        <div class="tut-mark-arrow"></div>
      </div>`);
    const nodes = [...root.querySelectorAll(":scope > .tut, :scope > .tut-tip, :scope > .tut-mark")];
    const q = (r) => nodes.find((n) => n.dataset.ref === r) ?? nodes.map((n) => n.querySelector(`[data-ref="${r}"]`)).find(Boolean);
    this.el = {
      panel: q('tut'), kicker: q('kicker'), steps: q('steps'), text: q('text'), sub: q('sub'), prog: q('prog'), skip: q('skip'),
      tip: q('tip'), tipText: q('tipText'), tipSub: q('tipSub'), mark: q('mark'),
    };
    this.el.skip.addEventListener('click', () => this.skip());
    this.root = root;
  }

  _render(fresh = false) {
    const E = this.el;
    const c = this.active ? this._copy() : null;
    E.panel.classList.toggle('on', !!c);
    if (!c) return;
    const done = this.step === 'done';
    E.kicker.textContent = done ? 'RIFT PRIMER' : `RIFT PRIMER · ${this.stepIdx + 1} / 5`;
    [...E.steps.children].forEach((n, i) => { n.className = i < this.stepIdx || done ? 'ok' : i === this.stepIdx ? 'cur' : ''; });
    E.text.innerHTML = c.text;
    E.sub.innerHTML = c.sub;
    E.sub.style.display = c.sub ? '' : 'none';
    E.skip.style.display = done || this.step === 'chain' ? 'none' : '';
    this._prog = c.prog ?? null;
    E.prog.textContent = this._prog ? this._prog() : '';
    E.panel.classList.toggle('done', done);
    if (fresh) { E.panel.classList.remove('pop'); void E.panel.offsetWidth; E.panel.classList.add('pop'); }
  }

  _setSub(html) { this.el.sub.innerHTML = html; this.el.sub.style.display = ''; }

  _renderTip() {
    const E = this.el, t = this._tip;
    const show = !!t && t.delay <= 0 && this.game.state === 'playing';
    if (show && !this._tipShown) {
      E.tipText.innerHTML = t.text;
      E.tipSub.innerHTML = t.sub;
      E.tipSub.style.display = t.sub ? '' : 'none';
    }
    E.tip.classList.toggle('on', show);
    this._tipShown = show;
    if (this._prog && this.active) this.el.prog.textContent = this._prog();
  }

  // Pulse a HUD element the current step talks about.
  _glow(selector) {
    this.root.querySelectorAll('.tut-glow').forEach((n) => n.classList.remove('tut-glow'));
    if (selector) this.root.querySelector(selector)?.classList.add('tut-glow');
  }

  // World marker over the tutorial crystal; pinned to the screen edge when it is off screen.
  _mark(target) {
    const E = this.el.mark;
    if (this.active && this._prog) this.el.prog.textContent = this._prog();
    if (!target) { E.classList.remove('on'); return; }
    const cam = this.game.camera;
    _v.set(target.pos.x, 3.2, target.pos.z);
    _m.copy(_v).project(cam);
    const w = innerWidth, h = innerHeight;
    let sx = (_m.x * 0.5 + 0.5) * w, sy = (-_m.y * 0.5 + 0.5) * h;
    const off = sx < EDGE || sx > w - EDGE || sy < EDGE || sy > h - EDGE;
    let rot = 0;
    if (off) {
      const dx = sx - w / 2, dy = sy - h / 2, len = Math.hypot(dx, dy) || 1;
      const t = Math.min((w / 2 - EDGE) / Math.abs(dx / len || 1e-6), (h / 2 - EDGE) / Math.abs(dy / len || 1e-6));
      sx = w / 2 + (dx / len) * t; sy = h / 2 + (dy / len) * t;
      rot = Math.atan2(dy, dx) * 180 / Math.PI - 90;
    }
    E.classList.add('on');
    E.classList.toggle('edge', off);
    E.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    E.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
  }
}
