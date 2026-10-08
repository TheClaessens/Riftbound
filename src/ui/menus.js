// =====================================================================================
//  Out-of-run menus: the title / Sanctum (class select, rift tier, attunements, codex,
//  run record) and the end screens (death / victory). UI owns one Menus instance and
//  delegates showTitle / hideTitle / showGameOver / showVictory / hideEnd to it.
//  All DOM is appended to root (#ui); root itself is never cleared.
// =====================================================================================
import { CLASSES, CLASS_ORDER } from '../game/classes.js';
import { ATTUNEMENTS, attuneCost, buyAttunement } from '../game/meta.js';
import { ACTS } from '../game/acts.js';
import { REACTIONS } from '../game/combat.js';
import { SKILLS, FUSIONS } from '../game/skills/registry.js';
import { RELICS, RELIC_IDS, RELIC_TAG_COLOR } from '../game/relics.js';

const GLYPH = { arcanist: '✦', pyromancer: '🜂', cryomancer: '❅', stormcaller: 'ϟ' };
const TIER_STEP = { hp: 30, dmg: 12, shards: 25 };   // per Rift Tier, in percent
const MAX_TIER_UI = 5;
const NONE_HTML = '<span class="menu-none">None</span>';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function make(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

function mmss(t) {
  const s = Math.max(0, Math.floor(Number(t) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const tagHTML = (color, label, count) =>
  `<span class="menu-tag" style="--c:${color}">${esc(label)}${count != null ? ` <span class="menu-tag-n">${esc(count)}</span>` : ''}</span>`;

function relicByName(name) {
  for (const def of Object.values(RELICS)) if (def.name === name) return def;
  return null;
}

export class Menus {
  constructor(game, root) {
    this.game = game;
    this.root = root ?? document.body;
    this.selClass = 'arcanist';
    this.selTier = 0;
    this.titleOpen = false;
    this.endOpen = false;
    this.endStats = null;
    this.refs = {};

    this.titleEl = make('div', 'menu-screen menu-title');
    this.endEl = make('div', 'menu-screen menu-end');
    this.root.append(this.titleEl, this.endEl);

    this._buildTitle();
    this.titleEl.addEventListener('click', (e) => this._onTitleClick(e));
    this.titleEl.addEventListener('change', (e) => this._onTitleChange(e));
    this.endEl.addEventListener('click', (e) => this._onEndClick(e));
    // One window listener; it only acts while the title or an end screen is open.
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  // ---------------------------------------------------------------- public API
  showTitle() {
    this.hideEnd();
    const meta = this.game.meta;
    const last = meta?.lastClass;
    this.selClass = this._unlocked(last) ? last : this._firstUnlocked();
    this.selTier = Math.max(0, Math.min(meta?.lastTier ?? 0, meta?.maxTier ?? 0));
    this._renderTitle();
    this.titleEl.classList.add('menu-open');
    this.titleOpen = true;
  }

  hideTitle() {
    this.titleOpen = false;
    this.titleEl.classList.remove('menu-open');
  }

  showGameOver(stats) { this._showEnd(stats, false); }

  showVictory(stats) { this._showEnd(stats, true); }

  hideEnd() {
    this.endOpen = false;
    this.endEl.classList.remove('menu-open');
  }

  // ---------------------------------------------------------------- title skeleton
  _buildTitle() {
    this.titleEl.innerHTML = `
      <div class="menu-wrap">
        <header class="menu-head">
          <div class="menu-brand">
            <div class="menu-logo">RIFTBOUND</div>
            <div class="menu-tagline">Descend. Weave the elements. Shatter the Heart.</div>
          </div>
          <div class="menu-shards" data-ref="shards"></div>
        </header>
        <main class="menu-body">
          <section class="menu-select">
            <h2 class="menu-h">Choose your Riftbound <span class="menu-hint">keys 1&ndash;4</span></h2>
            <div class="menu-classes" data-ref="classes"></div>
            <div class="menu-tier" data-ref="tier" hidden></div>
          </section>
          <aside class="menu-sanctum">
            <h2 class="menu-h">The Sanctum</h2>
            <div class="menu-attunes" data-ref="attunes"></div>
            <div class="menu-codex" data-ref="codex"></div>
          </aside>
        </main>
        <footer class="menu-foot">
          <div class="menu-controls">
            <kbd>WASD</kbd> move &middot; <kbd>Mouse</kbd> aim &middot; <kbd>LMB</kbd>/<kbd>RMB</kbd>/<kbd>Q</kbd>/<kbd>E</kbd>/<kbd>R</kbd> cast &middot;
            <kbd>SPACE</kbd> dash &middot; <kbd>T</kbd> auto-cast &middot; <kbd>Esc</kbd> pause
          </div>
          <div class="menu-actions">
            <label class="menu-check">
              <input type="checkbox" data-ref="auto">
              <span>Auto-cast</span>
            </label>
            <button type="button" class="menu-begin" data-act="begin">Begin Descent</button>
          </div>
        </footer>
      </div>`;
    this.titleEl.querySelectorAll('[data-ref]').forEach((n) => { this.refs[n.dataset.ref] = n; });
  }

  _renderTitle() {
    this._renderShards();
    this._renderClasses();
    this._renderTier();
    this._renderAttunes();
    this._renderCodex();
    if (this.refs.auto) this.refs.auto.checked = !!this.game.autoCast;
  }

  _renderShards() {
    const n = this.game.meta?.shards ?? 0;
    this.refs.shards.innerHTML = `<span class="menu-gem">◆</span><span class="menu-shard-n">${esc(n)}</span><span class="menu-shard-lbl">Rift Shards</span>`;
  }

  _renderClasses() {
    this.refs.classes.innerHTML = CLASS_ORDER.map((id, i) => this._cardHTML(CLASSES[id], i)).join('');
  }

  _cardHTML(c, i) {
    if (!c) return '';
    const unlocked = this._unlocked(c.id);
    const selected = c.id === this.selClass;
    const starter = SKILLS[c.starter];
    const cls = ['menu-card'];
    if (selected) cls.push('is-selected');
    if (!unlocked) cls.push('is-locked');
    const style = `--cc:${c.color};--cca:${c.color}55`;
    const starterName = `${starter?.icon ? `${esc(starter.icon)} ` : ''}${esc(starter?.name ?? c.starter)}`;
    return `
      <button type="button" class="${cls.join(' ')}" style="${style}" data-act="pick" data-id="${esc(c.id)}"
              aria-pressed="${selected}" ${unlocked ? '' : 'aria-disabled="true"'}>
        <span class="menu-card-key">${i + 1}</span>
        <span class="menu-card-glyph">${esc(GLYPH[c.id] ?? '✦')}</span>
        <span class="menu-card-name">${esc(c.name)}</span>
        <span class="menu-card-title">${esc(c.title)}</span>
        <span class="menu-card-block">
          <span class="menu-lbl">Starter</span>
          <span class="menu-card-desc menu-card-strong">${starterName}</span>
        </span>
        <span class="menu-card-block">
          <span class="menu-lbl">Dash &middot; ${esc(c.dash?.name)}</span>
          <span class="menu-card-desc">${esc(c.dash?.desc)}</span>
        </span>
        <span class="menu-card-block">
          <span class="menu-lbl">Trait &middot; ${esc(c.trait?.name)}</span>
          <span class="menu-card-desc">${esc(c.trait?.desc)}</span>
        </span>
        <span class="menu-card-play">${esc(c.playstyle)}</span>
        <span class="menu-card-tilt">${esc(c.tilt)}</span>
        ${unlocked ? '' : `<span class="menu-card-lock">🔒 ${esc(c.unlock?.text ?? 'Locked')}</span>`}
      </button>`;
  }

  _renderTier() {
    const box = this.refs.tier;
    const max = Math.min(MAX_TIER_UI, this.game.meta?.maxTier ?? 0);
    if (max <= 0) {
      box.hidden = true;
      box.innerHTML = '';
      this.selTier = 0;
      return;
    }
    box.hidden = false;
    this.selTier = Math.max(0, Math.min(this.selTier, max));
    let chips = '';
    for (let t = 0; t <= max; t++) {
      const on = t === this.selTier;
      chips += `<button type="button" class="menu-chip${on ? ' is-on' : ''}" data-act="tier" data-id="${t}" aria-pressed="${on}">${t}</button>`;
    }
    const t = this.selTier;
    const sel = t > 0
      ? ` <span class="menu-tier-now">Tier ${t}: +${t * TIER_STEP.hp}% HP, +${t * TIER_STEP.dmg}% dmg, +${t * TIER_STEP.shards}% shards</span>`
      : '';
    box.innerHTML = `
      <div class="menu-tier-head">
        <h3 class="menu-h-sm">Rift Tier</h3>
        <div class="menu-tier-chips">${chips}</div>
      </div>
      <div class="menu-tier-desc">+${TIER_STEP.hp}% enemy HP, +${TIER_STEP.dmg}% dmg, +${TIER_STEP.shards}% shards per tier${sel}</div>`;
  }

  _renderAttunes() {
    const meta = this.game.meta ?? {};
    this.refs.attunes.innerHTML = Object.values(ATTUNEMENTS).map((def) => {
      const r = meta.attune?.[def.id] ?? 0;
      const maxed = r >= def.max;
      const cost = attuneCost(r + 1);
      const can = !maxed && (meta.shards ?? 0) >= cost;
      let pips = '';
      for (let i = 0; i < def.max; i++) pips += `<span class="menu-pip${i < r ? ' is-on' : ''}"></span>`;
      const label = maxed ? 'Maxed' : `Buy <span class="menu-gem">◆</span> ${esc(cost)}`;
      const title = maxed ? '' : (can ? '' : 'Not enough Rift Shards');
      return `
        <div class="menu-att${maxed ? ' is-maxed' : ''}">
          <div class="menu-att-ico">${esc(def.icon)}</div>
          <div class="menu-att-main">
            <div class="menu-att-top">
              <span class="menu-att-name">${esc(def.name)}</span>
              <span class="menu-pips">${pips}</span>
              <span class="menu-att-rank">${r}/${def.max}</span>
            </div>
            <div class="menu-att-desc">${esc(def.desc)}</div>
          </div>
          <button type="button" class="menu-buy" data-act="buy" data-id="${esc(def.id)}" title="${esc(title)}" ${can ? '' : 'disabled'}>${label}</button>
        </div>`;
    }).join('');
  }

  _renderCodex() {
    const m = this.game.meta ?? {};
    const cod = m.codex ?? {};
    const st = m.stats ?? {};
    const nReact = Object.keys(REACTIONS).length;
    const nFus = FUSIONS.length;
    const nRel = RELIC_IDS.length;
    const bestAct = st.bestAct ? (ACTS[st.bestAct - 1]?.numeral ?? '—') : '—';
    this.refs.codex.innerHTML = `
      <div class="menu-codex-row">
        <span class="menu-lbl">Codex</span>
        <span>Reactions <b>${cod.reactions?.length ?? 0}/${nReact}</b></span>
        <span>Fusions <b>${cod.fusions?.length ?? 0}/${nFus}</b></span>
        <span>Relics <b>${cod.relics?.length ?? 0}/${nRel}</b></span>
      </div>
      <div class="menu-codex-row">
        <span class="menu-lbl">Record</span>
        <span>Runs <b>${st.runs ?? 0}</b></span>
        <span>Wins <b>${st.wins ?? 0}</b></span>
        <span>Best act <b>${esc(bestAct)}</b></span>
      </div>`;
  }

  // ---------------------------------------------------------------- title interaction
  _onTitleClick(e) {
    const btn = e.target?.closest?.('[data-act]');
    if (!btn || !this.titleEl.contains(btn) || btn.disabled) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'pick': this._pick(id); break;
      case 'tier': this._setTier(Number(id)); break;
      case 'buy': this._buy(id); break;
      case 'begin': this._begin(); break;
      default: break;
    }
  }

  _onTitleChange(e) {
    if (!this.refs.auto || e.target !== this.refs.auto) return;
    const on = !!this.refs.auto.checked;
    this.game.autoCast = on;
    this.game.events?.emit('autoCastChanged', { on });
  }

  _pick(id) {
    if (!this._unlocked(id)) return;
    this.selClass = id;
    this._renderClasses();
  }

  _setTier(t) {
    const max = Math.min(MAX_TIER_UI, this.game.meta?.maxTier ?? 0);
    if (!Number.isFinite(t) || t < 0 || t > max) return;
    this.selTier = t;
    this._renderTier();
  }

  _buy(id) {
    if (!this.game.meta || !buyAttunement(this.game.meta, id)) return;
    this._renderShards();
    this._renderAttunes();
  }

  _begin() {
    if (!this.titleOpen || !this._unlocked(this.selClass)) return;
    this.game.start({ classId: this.selClass, tier: this.selTier });
    this.hideTitle();
  }

  // ---------------------------------------------------------------- end screens
  _showEnd(stats, victory) {
    this.hideTitle();
    this.endStats = stats ?? {};
    this._renderEnd(this.endStats, victory);
    this.endEl.classList.add('menu-open');
    this.endOpen = true;
    this.endEl.querySelector('[data-act="again"]')?.focus?.({ preventScroll: true });
  }

  _renderEnd(s, victory) {
    this.endEl.className = `menu-screen menu-end ${victory ? 'is-victory' : 'is-death'}`;
    const meta = this.game.meta ?? {};
    const cls = CLASSES[s.classId];
    const act = ACTS[s.act ?? 0] ?? ACTS[0];
    const tier = s.tier ?? 0;
    const shards = s.shardsEarned ?? 0;
    const total = s.totalShards ?? meta.shards ?? 0;

    const unlocks = (s.unlocks ?? []).map((id) => CLASSES[id]?.name).filter(Boolean);
    let delay = 0.35;
    const callouts = [];
    for (const name of unlocks) {
      callouts.push(`<div class="menu-callout menu-callout-class" style="--d:${delay.toFixed(2)}s">New class unlocked: <b>${esc(name)}</b></div>`);
      delay += 0.2;
    }
    if (s.tierUnlocked) {
      callouts.push(`<div class="menu-callout menu-callout-tier" style="--d:${delay.toFixed(2)}s">Rift Tier ${esc(s.tierUnlocked)} unlocked</div>`);
    }

    const reactions = Object.entries(s.reactions ?? {})
      .filter(([, n]) => n > 0)
      .map(([type, n]) => tagHTML(REACTIONS[type]?.color ?? '#c08cff', REACTIONS[type]?.name ?? type, `×${n}`))
      .join('');
    const fusions = (s.fusions ?? []).map((name) => tagHTML('#9ff3ff', name)).join('');
    const relics = (s.relics ?? []).map((name) => {
      const def = relicByName(name);
      const label = def?.icon ? `${def.icon} ${name}` : name;
      return tagHTML(RELIC_TAG_COLOR[def?.tag] ?? '#c08cff', label);
    }).join('');

    const row = (k, v) => `<div class="menu-stat"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`;
    const subParts = [cls?.name, tier > 0 ? `Rift Tier ${tier}` : null].filter(Boolean);

    this.endEl.innerHTML = `
      <div class="menu-end-wrap">
        <header class="menu-end-head menu-panel" style="--d:0s">
          <div class="menu-end-eyebrow">${victory ? 'Victory' : 'Fallen'}</div>
          <h1 class="menu-end-title">${victory ? 'THE HEART IS SHATTERED' : 'THE RIFT CLAIMS YOU'}</h1>
          <div class="menu-end-sub">${esc(subParts.join(' · '))}</div>
        </header>
        ${callouts.length ? `<div class="menu-callouts">${callouts.join('')}</div>` : ''}
        <div class="menu-end-grid">
          <section class="menu-panel" style="--d:0.12s">
            <div class="menu-reward">
              <div class="menu-reward-gain">+${esc(shards)}<span>Rift Shards</span></div>
              <div class="menu-reward-total">Total <span class="menu-gem">◆</span> <b>${esc(total)}</b></div>
            </div>
            <dl class="menu-stats">
              ${row('Class', cls?.name ?? '—')}
              ${row('Act reached', `${act.numeral} · ${act.name}`)}
              ${row('Time', mmss(s.time))}
              ${row('Level', s.level ?? 1)}
              ${row('Kills', s.kills ?? 0)}
              ${row('Max chain', s.maxChain ?? 0)}
            </dl>
          </section>
          <section class="menu-panel" style="--d:0.22s">
            <div class="menu-block">
              <h3 class="menu-h-sm">Reactions</h3>
              <div class="menu-chips">${reactions || NONE_HTML}</div>
            </div>
            <div class="menu-block">
              <h3 class="menu-h-sm">Fusions made</h3>
              <div class="menu-chips">${fusions || NONE_HTML}</div>
            </div>
            <div class="menu-block">
              <h3 class="menu-h-sm">Relics</h3>
              <div class="menu-chips">${relics || NONE_HTML}</div>
            </div>
          </section>
        </div>
        <div class="menu-end-actions">
          <button type="button" class="menu-begin" data-act="again">Descend Again</button>
          <button type="button" class="menu-ghost" data-act="sanctum">Return to Sanctum</button>
        </div>
        <div class="menu-end-hint">Enter: descend again</div>
      </div>`;
  }

  _onEndClick(e) {
    const btn = e.target?.closest?.('[data-act]');
    if (!btn || !this.endEl.contains(btn)) return;
    if (btn.dataset.act === 'again') this._again();
    else if (btn.dataset.act === 'sanctum') this._toSanctum();
  }

  _again() {
    const s = this.endStats;
    if (!s) return;
    this.hideEnd();
    this.game.start({ classId: s.classId, tier: s.tier ?? 0 });
  }

  _toSanctum() {
    this.hideEnd();
    this.game.quitToTitle();
    // quitToTitle normally calls back into showTitle; make sure the Sanctum appears regardless.
    if (!this.titleOpen) this.showTitle();
  }

  // ---------------------------------------------------------------- keyboard
  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.endOpen) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this._again();
      }
      return;
    }
    if (!this.titleOpen) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) this._begin();
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      const id = CLASS_ORDER[Number(e.key) - 1];
      if (this._unlocked(id)) this._pick(id);
    }
  }

  // ---------------------------------------------------------------- helpers
  _unlocked(id) {
    return !!id && !!CLASSES[id] && !!this.game.meta?.unlocked?.[id];
  }

  _firstUnlocked() {
    return CLASS_ORDER.find((id) => this._unlocked(id)) ?? 'arcanist';
  }
}
