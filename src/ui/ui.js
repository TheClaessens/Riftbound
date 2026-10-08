// =====================================================================================
//  UI orchestrator: owns the HUD (hud.js), the level-up / relic-chest / pause modals and
//  the Menus (menus.js: title, class select, sanctum, game over, victory). Everything lives
//  in the #ui overlay; #ui itself ignores the pointer, interactive pieces re-enable it.
// =====================================================================================
import { Menus } from './menus.js';
import { HUD, DASH_GLYPH } from './hud.js';
import { SKILLS, PASSIVES, FUSIONS } from '../game/skills/registry.js';
import { REACTIONS } from '../game/combat.js';
import { RELICS, RELIC_TAG_COLOR } from '../game/relics.js';
import { SLOT_KEYS } from '../game/player.js';
import { ELEMENT_CSS } from '../core/utils.js';

const GOLD = '#d4af37';
const LEVELUP_IGNORE_MS = 350;
const RELIC_IGNORE_MS = 400;
const FUSION_IDS = new Set(FUSIONS.map((f) => f.def.id));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Wraps a callback so it can only ever fire once (double clicks / key repeats).
function once(fn) {
  let done = false;
  return (x) => { if (done) return; done = true; fn(x); };
}

function cardHTML(card, i) {
  const fusion = card.type === 'fusion';
  const accent = fusion ? GOLD : (ELEMENT_CSS[card.element] ?? '#c08cff');
  let tag = '';
  switch (card.type) {
    case 'new': tag = 'NEW SKILL'; break;
    case 'rank': tag = `RANK ${card.rank}`; break;
    case 'passive': tag = `PASSIVE · RANK ${card.rank}`; break;
    case 'fusion': tag = '✦ FUSION ✦'; break;
    case 'heal': tag = 'RESTORE'; break;
  }
  return `
    <div class="ui-card${fusion ? ' fusion' : ''}" data-idx="${i}" style="--accent:${accent};animation-delay:${(i * 0.08).toFixed(2)}s">
      <span class="ui-card-key">${i + 1}</span>
      <div class="ui-card-icon">${card.icon ?? '✚'}</div>
      <div class="ui-card-name">${card.name}</div>
      <div class="ui-card-tag">${tag}</div>
      <div class="ui-card-desc">${card.desc ?? ''}</div>
      ${card.hint ? `<div class="ui-card-hint">${card.hint}</div>` : ''}
    </div>`;
}

function relicCardHTML(r, i) {
  const col = RELIC_TAG_COLOR[r.tag] ?? '#c08cff';
  return `
    <div class="ui-relic-card" data-idx="${i}" style="--tag:${col}">
      <span class="ui-card-key">${i + 1}</span>
      <div class="ui-relic-icon">${r.icon}</div>
      <div class="ui-relic-name">${r.name}</div>
      <div class="ui-relic-tag">${String(r.tag).toUpperCase()}</div>
      <div class="ui-relic-desc">${r.desc}</div>
      <div class="ui-relic-flavour">${r.flavour ?? ''}</div>
    </div>`;
}

function elementChip(el) {
  return `<span class="cx-el" style="color:${ELEMENT_CSS[el] ?? '#ffffff'}">${cap(el)}</span>`;
}

function buildPaneHTML(p) {
  if (!p) return '<div class="pz-empty">No run in progress.</div>';

  const skills = [...p.skills].sort((a, b) => (a.slot < 0 ? 99 : a.slot) - (b.slot < 0 ? 99 : b.slot));
  const skillRows = skills.map((s) => {
    const max = s.def.maxRank ?? 5;
    const key = s.slot >= 0 ? SLOT_KEYS[s.slot].label : 'AUTO';
    const col = ELEMENT_CSS[s.def.element] ?? '#c08cff';
    let pips = '';
    for (let i = 0; i < max; i++) pips += `<i class="${i < s.rank ? 'on' : ''}"></i>`;
    return `
      <div class="pz-row${FUSION_IDS.has(s.def.id) ? ' fusion' : ''}" style="--el:${col}">
        <span class="pz-key">${key}</span>
        <span class="pz-ico">${s.def.icon}</span>
        <span class="pz-name">${s.def.name}</span>
        <span class="pz-pips">${pips}</span>
      </div>`;
  }).join('');

  const dash = p.dash.def;
  const dashRow = `
    <div class="pz-row">
      <span class="pz-key">SPACE</span>
      <span class="pz-ico">${DASH_GLYPH[dash.kind] ?? '➤'}</span>
      <span class="pz-name">${dash.name}</span>
      <span class="pz-sub">${dash.desc ?? ''}</span>
    </div>`;

  const passives = [...p.passives.entries()].map(([id, r]) => {
    const d = PASSIVES[id];
    if (!d) return '';
    return `
      <div class="pz-row">
        <span class="pz-ico">${d.icon}</span>
        <span class="pz-name">${d.name}</span>
        <span class="pz-sub">${d.desc(r)}</span>
        <span class="pz-rank">${r}/${d.maxRank}</span>
      </div>`;
  }).join('');

  const relics = p.relics.map((r) => `
    <div class="pz-row pz-relic" style="--tag:${RELIC_TAG_COLOR[r.tag] ?? '#c08cff'}">
      <span class="pz-ico">${r.icon}</span>
      <span class="pz-name">${r.name}</span>
      <span class="pz-sub">${r.desc}</span>
    </div>`).join('');

  return `
    <div class="pz-grid">
      <section class="pz-col">
        <h3>Skills</h3>
        ${skillRows}
        ${dashRow}
      </section>
      <section class="pz-col">
        <h3>Passives</h3>
        ${passives || '<div class="pz-empty">None yet.</div>'}
      </section>
      <section class="pz-col">
        <h3>Relics <span>${p.relics.length}</span></h3>
        ${relics || '<div class="pz-empty">None yet. Relic Chests drop from elites and bosses.</div>'}
      </section>
    </div>`;
}

function buildCodexHTML(codex) {
  const reactions = Object.values(REACTIONS);
  const rFound = new Set(codex.reactions ?? []);
  const rTiles = reactions.map((R) => rFound.has(R.id)
    ? `<div class="cx-tile">
         <div class="cx-name" style="color:${R.color}">${R.name}</div>
         <div class="cx-combo">${R.elements.map(elementChip).join(' + ')}</div>
         <div class="cx-desc">${R.desc}</div>
       </div>`
    : `<div class="cx-tile locked">
         <div class="cx-name">???</div>
         <div class="cx-combo">? + ?</div>
         <div class="cx-desc">Discover it by combining two elements.</div>
       </div>`).join('');

  const fFound = new Set(codex.fusions ?? []);
  const fTiles = FUSIONS.map((f) => fFound.has(f.def.id)
    ? `<div class="cx-tile fusion">
         <div class="cx-name">${f.def.name} <span class="cx-tag">${f.def.cast ? 'ACTIVE' : 'AUTO'}</span></div>
         <div class="cx-combo">${SKILLS[f.a]?.name ?? '?'} + ${SKILLS[f.b]?.name ?? '?'}</div>
         <div class="cx-desc">${f.def.desc(1)}</div>
       </div>`
    : `<div class="cx-tile locked">
         <div class="cx-name">???</div>
         <div class="cx-combo">??? + ???</div>
         <div class="cx-desc">Raise two spells to rank 3.</div>
       </div>`).join('');

  const relicList = Object.values(RELICS);
  const relFound = new Set(codex.relics ?? []);
  const relTiles = relicList.map((r) => relFound.has(r.id)
    ? `<div class="cx-tile" style="--tag:${RELIC_TAG_COLOR[r.tag] ?? '#c08cff'}">
         <div class="cx-name"><span class="cx-ico">${r.icon}</span> ${r.name}</div>
         <div class="cx-combo">${String(r.tag).toUpperCase()}</div>
         <div class="cx-desc">${r.desc}</div>
       </div>`
    : `<div class="cx-tile locked">
         <div class="cx-name"><span class="cx-ico">?</span> ???</div>
         <div class="cx-combo">&nbsp;</div>
         <div class="cx-desc">Found in Relic Chests.</div>
       </div>`).join('');

  const rCount = reactions.filter((R) => rFound.has(R.id)).length;
  const fCount = FUSIONS.filter((f) => fFound.has(f.def.id)).length;
  const relCount = relicList.filter((r) => relFound.has(r.id)).length;

  return `
    <section class="cx-sec"><h3>Reactions <span>${rCount} / ${reactions.length}</span></h3><div class="cx-grid">${rTiles}</div></section>
    <section class="cx-sec"><h3>Fusions <span>${fCount} / ${FUSIONS.length}</span></h3><div class="cx-grid">${fTiles}</div></section>
    <section class="cx-sec"><h3>Relics <span>${relCount} / ${relicList.length}</span></h3><div class="cx-grid">${relTiles}</div></section>`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.uiRoot = document.getElementById('ui');
    this.uiRoot.innerHTML = '';

    this._unsub = [];
    this._lu = null;             // open level-up state
    this._rp = null;             // open relic-chest state
    this._abandonArmed = false;
    this._armT = 0;

    this.hud = new HUD(game, this.uiRoot);
    this._buildLevelUp();
    this._buildRelicPick();
    this._buildPause();
    this.menus = new Menus(game, this.uiRoot);

    const on = (ev, fn) => this._unsub.push(game.events.on(ev, fn));
    on('runStart', () => {
      this.menus.hideTitle();
      this.menus.hideEnd();
      this._closeModals(true);
      this.hud.show();
    });

    this._onKey = (e) => {
      if (e.repeat) return;
      const g = this.game;
      if (g.state === 'levelup' && /^[1-3]$/.test(e.key)) this._luPick(Number(e.key) - 1);
      else if (g.state === 'relic' && /^[1-4]$/.test(e.key)) this._rpPick(Number(e.key) - 1);
    };
    document.addEventListener('keydown', this._onKey);

    this.showTitle();
  }

  update(dt) {
    this.hud.update(dt);
  }

  // ------------------------------------------------------------------ screens
  showTitle() {
    this.hud.hide();
    this._closeModals(true);
    this.menus.showTitle();
  }

  showGameOver(stats) {
    this.hud.hide();
    this._closeModals(true);
    this.menus.showGameOver(stats);
  }

  showVictory(stats) {
    this.hud.hide();
    this._closeModals(true);
    this.menus.showVictory(stats);
  }

  _closeModals(instant = false) {
    this._lu = null;
    this._rp = null;
    this._disarmAbandon();
    for (const el of [this.luEl, this.rpEl, this.pauseEl]) this._setModal(el, false, instant);
  }

  _setModal(el, on, instant = false) {
    clearTimeout(el._hideT);
    if (on) {
      el.style.display = 'flex';
      el.classList.add('ui-show');
      return;
    }
    el.classList.remove('ui-show');
    if (instant || el.style.display === 'none') { el.style.display = 'none'; return; }
    el._hideT = setTimeout(() => { el.style.display = 'none'; }, 220);
  }

  // ------------------------------------------------------------------ level-up
  _buildLevelUp() {
    const el = document.createElement('div');
    el.className = 'ui-modal ui-levelup';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="ui-modal-backdrop"></div>
      <div class="ui-modal-content ui-levelup-content">
        <div class="ui-levelup-title" data-ref="title">LEVEL UP</div>
        <div class="ui-levelup-sub">Choose one · keys 1 2 3</div>
        <div class="ui-cards" data-ref="cards"></div>
        <div class="ui-levelup-foot">
          <div class="ui-foot-buttons">
            <button class="ui-btn" data-ref="reroll">⟳ Reroll</button>
            <button class="ui-btn" data-ref="banish">⊘ Banish</button>
          </div>
          <div class="ui-foot-hint" data-ref="hint"></div>
        </div>
      </div>`;
    this.uiRoot.appendChild(el);
    this.luEl = el;
    const q = (ref) => el.querySelector(`[data-ref="${ref}"]`);
    this.luRefs = { title: q('title'), cards: q('cards'), reroll: q('reroll'), banish: q('banish'), hint: q('hint') };

    this.luRefs.cards.addEventListener('click', (e) => {
      const c = e.target.closest?.('.ui-card');
      if (c) this._luPick(Number(c.dataset.idx));
    });
    this.luRefs.reroll.addEventListener('click', () => this._luReroll());
    this.luRefs.banish.addEventListener('click', () => this._luToggleBanish());
  }

  showLevelUp(cards, onPick, ctl) {
    this._lu = {
      cards,
      ctl: ctl ?? {},
      onPick: once(onPick),
      banishMode: false,
      ignoreUntil: Date.now() + LEVELUP_IGNORE_MS,
    };
    this._luRender(cards);
    this._setModal(this.luEl, true);
  }

  hideLevelUp() {
    this._lu = null;
    this._setModal(this.luEl, false);
  }

  _luRender(cards, msg = '') {
    const L = this._lu;
    if (!L) return;
    L.cards = cards;
    const R = this.luRefs;
    R.title.textContent = `LEVEL UP ${this.game.player?.level ?? ''}`.trim();
    R.cards.innerHTML = cards.map((c, i) => cardHTML(c, i)).join('');
    R.cards.classList.toggle('banish-mode', L.banishMode);

    const rr = L.ctl.rerolls ?? 0;
    const bb = L.ctl.banishes ?? 0;
    R.reroll.textContent = `⟳ Reroll (${rr})`;
    R.reroll.disabled = rr <= 0;
    R.banish.textContent = `⊘ Banish (${bb})`;
    R.banish.disabled = bb <= 0;
    R.banish.classList.toggle('active', L.banishMode);
    R.hint.textContent = msg || (L.banishMode ? 'Click a card to banish it for this run.' : '');
  }

  _luReroll() {
    const L = this._lu;
    if (!L || !L.ctl.reroll) return;
    const c = L.ctl.reroll();
    if (c) this._luRender(c);
    else this._luRender(L.cards, 'No rerolls left.');
  }

  _luToggleBanish() {
    const L = this._lu;
    if (!L || !(L.ctl.banishes > 0)) return;
    L.banishMode = !L.banishMode;
    this._luRender(L.cards);
  }

  _luPick(idx) {
    const L = this._lu;
    if (!L || Date.now() < L.ignoreUntil) return;
    const card = L.cards[idx];
    if (!card) return;

    if (L.banishMode) {
      L.banishMode = false;
      const c = L.ctl.banish ? L.ctl.banish(card) : null;
      if (c) this._luRender(c, `Banished ${card.name}.`);
      else this._luRender(L.cards, `${card.name} cannot be banished.`);
      return;
    }
    L.onPick(card);
  }

  // ------------------------------------------------------------------ relic chest
  _buildRelicPick() {
    const el = document.createElement('div');
    el.className = 'ui-modal ui-relic';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="ui-modal-backdrop"></div>
      <div class="ui-modal-content ui-relic-content">
        <div class="ui-relic-title">Relic Chest</div>
        <div class="ui-levelup-sub">Choose one relic · keys 1 2 3 4</div>
        <div class="ui-relic-cards" data-ref="cards"></div>
      </div>`;
    this.uiRoot.appendChild(el);
    this.rpEl = el;
    this.rpCards = el.querySelector('[data-ref="cards"]');
    this.rpCards.addEventListener('click', (e) => {
      const c = e.target.closest?.('.ui-relic-card');
      if (c) this._rpPick(Number(c.dataset.idx));
    });
  }

  showRelicPick(relics, onPick) {
    this._rp = { relics, onPick: once(onPick), ignoreUntil: Date.now() + RELIC_IGNORE_MS };
    this.rpCards.innerHTML = relics.map(relicCardHTML).join('');
    this._setModal(this.rpEl, true);
  }

  hideRelicPick() {
    this._rp = null;
    this._setModal(this.rpEl, false);
  }

  _rpPick(idx) {
    const R = this._rp;
    if (!R || Date.now() < R.ignoreUntil) return;
    const relic = R.relics[idx];
    if (relic) R.onPick(relic);
  }

  // ------------------------------------------------------------------ pause (build + codex)
  _buildPause() {
    const el = document.createElement('div');
    el.className = 'ui-modal ui-pause';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="ui-modal-backdrop"></div>
      <div class="ui-modal-content ui-pause-content">
        <div class="pz-title">Paused</div>
        <div class="pz-actions">
          <button class="ui-button-primary" data-ref="resume">RESUME</button>
          <button class="ui-button-secondary" data-ref="abandon">ABANDON RUN</button>
        </div>
        <div class="pz-tabs">
          <button class="pz-tab on" data-tab="build">Build</button>
          <button class="pz-tab" data-tab="codex">Codex</button>
        </div>
        <div class="pz-pane" data-pane="build"></div>
        <div class="pz-pane" data-pane="codex" hidden></div>
      </div>`;
    this.uiRoot.appendChild(el);
    this.pauseEl = el;
    this.pzAbandon = el.querySelector('[data-ref="abandon"]');
    this.pzPanes = [...el.querySelectorAll('.pz-pane')];
    this.pzTabs = [...el.querySelectorAll('.pz-tab')];

    el.querySelector('[data-ref="resume"]').addEventListener('click', () => this.game.togglePause());
    this.pzAbandon.addEventListener('click', () => this._onAbandonClick());
    for (const tab of this.pzTabs) tab.addEventListener('click', () => this._setPauseTab(tab.dataset.tab));
  }

  _setPauseTab(name) {
    for (const t of this.pzTabs) t.classList.toggle('on', t.dataset.tab === name);
    for (const p of this.pzPanes) p.hidden = p.dataset.pane !== name;
  }

  // Abandon needs a second click within 3 s, so it is never hit by accident.
  _onAbandonClick() {
    if (!this._abandonArmed) {
      this._abandonArmed = true;
      this.pzAbandon.textContent = 'CONFIRM ABANDON?';
      this.pzAbandon.classList.add('armed');
      clearTimeout(this._armT);
      this._armT = setTimeout(() => this._disarmAbandon(), 3000);
      return;
    }
    this._disarmAbandon();
    this.game.quitToTitle();
  }

  _disarmAbandon() {
    this._abandonArmed = false;
    clearTimeout(this._armT);
    if (this.pzAbandon) {
      this.pzAbandon.textContent = 'ABANDON RUN';
      this.pzAbandon.classList.remove('armed');
    }
  }

  showPause() {
    this._disarmAbandon();
    this.pzPanes[0].innerHTML = buildPaneHTML(this.game.player);
    this.pzPanes[1].innerHTML = buildCodexHTML(this.game.codex);
    this._setPauseTab('build');
    this._setModal(this.pauseEl, true);
  }

  hidePause() {
    this._disarmAbandon();
    this._setModal(this.pauseEl, false);
  }

  dispose() {
    this._unsub.forEach((u) => u?.());
    this._unsub = [];
    document.removeEventListener('keydown', this._onKey);
    this.hud.dispose();
  }
}
