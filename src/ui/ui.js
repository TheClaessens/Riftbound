// =====================================================================================
//  UI orchestrator: owns the HUD (hud.js), the Menus (menus.js) and the three Crownforge
//  modals that live here: level-up ("The Rift offers…"), relic chest ("Bind a relic") and
//  pause (Build / Codex). Spec: design/UI.md §7. Styles: css/modals.css (prefix md-).
//  #ui ignores the pointer; an open modal re-enables it.
// =====================================================================================
import { FeedbackPanel } from './feedback.js';
import { Menus } from './menus.js';
import { HUD } from './hud.js';
import { icon, hasIcon, ICON, cardIconId } from './icons/index.js';
import { SKILLS, PASSIVES, FUSIONS, FUSION_RANK, ALL_DEFS } from '../game/skills/registry.js';
import { REACTIONS } from '../game/combat.js';
import { RELICS, RELIC_TAG_COLOR } from '../game/relics.js';
import { SLOT_KEYS, MAX_AUTOS } from '../game/player.js';
import { saveMeta, computeShards } from '../game/meta.js';

const LEVELUP_IGNORE_MS = 300;    // a held click from combat can never pick a card
const LEVELUP_SWAP_IGNORE_MS = 260; // the next hand of a multi-pick burst: long enough that a double click cannot take it
const RELIC_IGNORE_MS = 350;
const CLOSE_MS = 180;
const MAX_PASSIVES = 5;
const ELEMENTS = ['fire', 'frost', 'storm', 'arcane'];
const FUSION_BY_ID = new Map(FUSIONS.map((f) => [f.def.id, f]));
const DASH_FALLBACK = { blink: '⟶', flame: '✹', frost: '❄', storm: '⚡' };
const REDUCED = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

// ---------------------------------------------------------------- small helpers
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const cap = (s) => String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);
const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const fmtN = (v) => String(Math.round(v * 100) / 100);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const isActive = (def) => typeof def?.cast === 'function';
const tagColor = (tag) => RELIC_TAG_COLOR[tag] ?? '#ecd9a6';
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Wraps a callback so it can only ever fire once (double clicks / key repeats).
function once(fn) {
  let done = false;
  return (x) => { if (done) return; done = true; fn(x); };
}

// Highlight every number in a (plain-text) effect line: "+25% radius" → "+<b>25%</b> radius".
const NUM_RE = /[+−-]?(?:x|×)?\d+(?:\.\d+)?(?:%|s\b|u\b)?/g;
function hlNums(text) {
  return esc(text).replace(NUM_RE, (m) => `<b class="cf-hl">${m}</b>`);
}
const delta = (o, n) => `<span class="md-old">${o}</span><i class="md-arrow">→</i><b class="cf-hl">${n}</b>`;

// If two descriptions share a template and only numbers moved, render "old → new" in place.
function numDelta(prev, cur) {
  const re = /\d+(?:\.\d+)?/g;
  if (!prev || !cur || prev.replace(re, '#') !== cur.replace(re, '#')) return null;
  const a = prev.match(re) ?? [], b = cur.match(re) ?? [];
  if (!b.length || a.every((v, i) => v === b[i])) return null;
  let i = 0;
  return esc(cur).replace(re, (m) => { const o = a[i++]; return o === m ? m : delta(o, m); });
}

// Passive descs are per rank ("+12% damage."); show the running total before → after.
const COMPOUND = {};   // passive id -> number indices that multiply per rank (none: every passive stacks additively)
function passiveTotal(id, rank, idx, n) {
  if (COMPOUND[id]?.includes(idx)) return Math.round((Math.pow(1 + n / 100, rank) - 1) * 100);
  return Math.round(n * rank * 10) / 10;
}
function passiveDeltaHTML(id, rank) {
  const def = PASSIVES[id];
  const text = def.desc(rank);
  let i = 0;
  return esc(text).replace(/([+−-]?)(\d+(?:\.\d+)?)(%?)/g, (m, sign, num, pct) => {
    const k = i++;
    const now = passiveTotal(id, rank, k, Number(num));
    if (rank <= 1) return `<b class="cf-hl">${sign}${now}${pct}</b>`;
    return delta(`${sign}${passiveTotal(id, rank - 1, k, Number(num))}${pct}`, `${sign}${now}${pct}`);
  });
}
function passiveNowText(id, rank) {
  const def = PASSIVES[id];
  let i = 0;
  return hlNums(def.desc(rank).replace(/(\d+(?:\.\d+)?)/g, (m) => String(passiveTotal(id, rank, i++, Number(m)))));
}

// ---------------------------------------------------------------- tiny engraved sigils (24 grid)
// Type sigils (level-up ribbons) and relic tag sigils: 1–2 flat tones + an ink outline drawn
// under the fill, the same construction as the sprite icons.
const INK = 'stroke:var(--ink);stroke-width:2;stroke-linejoin:round;paint-order:stroke';
const svg24 = (body, cls = '') => `<svg class="md-sig ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const SIGIL = {
  new: svg24(`<path style="fill:var(--cf-gilt);${INK}" d="M12 1.5l2.4 5.6 5.9-1.9-2 5.8L23 12l-4.7 2 2 5.8-5.9-1.9L12 22.5l-2.4-5.6-5.9 1.9 2-5.8L1 12l4.7-2-2-5.8 5.9 1.9z"/><circle cx="12" cy="12" r="3.2" style="fill:#fff4d2"/>`),
  rank: svg24(`<path style="fill:var(--el);${INK}" d="M12 3l9 8.5-3.2 3L12 9l-5.8 5.5-3.2-3z"/><path style="fill:var(--el-lo);${INK}" d="M12 11l9 8.5-3.2 3L12 17l-5.8 5.5-3.2-3z"/>`),
  fusion: svg24(`<path style="fill:var(--cf-void);${INK}" d="M12 1.5L22.5 12 12 22.5 1.5 12z"/><path style="fill:var(--arcane)" d="M12 3L12 12 3 12z"/><path style="fill:var(--fire)" d="M12 3L21 12 12 12z"/><path style="fill:var(--storm)" d="M21 12L12 21 12 12z"/><path style="fill:var(--frost)" d="M12 21L3 12 12 12z"/>`),
  passive: svg24(`<circle cx="12" cy="12" r="9.5" style="fill:var(--cf-bronze);${INK}"/><circle cx="12" cy="12" r="5.5" style="fill:var(--cf-bronze-hi)"/><circle cx="12" cy="12" r="2.2" style="fill:var(--cf-bronze-lo)"/>`),
  heal: svg24(`<path style="fill:var(--hp);${INK}" d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z"/><path style="fill:var(--hp-hi)" d="M9 2.5h6v2H11v6.5H2.5V9H9z"/>`),
  banish: svg24(`<circle cx="12" cy="12" r="9" style="fill:none;stroke:var(--cf-void);stroke-width:5"/><circle cx="12" cy="12" r="9" style="fill:none;stroke:var(--hp-hi);stroke-width:2.6"/><path d="M5.8 18.2L18.2 5.8" style="stroke:var(--cf-void);stroke-width:5"/><path d="M5.8 18.2L18.2 5.8" style="stroke:var(--hp-hi);stroke-width:2.6"/>`),
};
const TAG_SIGIL = {
  reaction: svg24(`<circle cx="8.5" cy="12" r="5.6" style="fill:none;stroke:var(--ink);stroke-width:5"/><circle cx="15.5" cy="12" r="5.6" style="fill:none;stroke:var(--ink);stroke-width:5"/><circle cx="8.5" cy="12" r="5.6" style="fill:none;stroke:var(--acc);stroke-width:2.4"/><circle cx="15.5" cy="12" r="5.6" style="fill:none;stroke:var(--acc);stroke-width:2.4"/>`),
  risk: svg24(`<path style="fill:var(--acc);${INK}" d="M12 1.5L22.5 12 12 22.5 1.5 12z"/><path d="M12 3.5l-1.6 5 2.6 2.4-2 4.4 1.4 5.2" style="fill:none;stroke:var(--ink);stroke-width:1.8;stroke-linejoin:round"/>`),
  dodge: svg24(`<path style="fill:var(--acc);${INK}" d="M3 5h5l7 7-7 7H3l7-7z"/><path style="fill:var(--acc);${INK};opacity:.75" d="M11 5h4l7 7-7 7h-4l7-7z"/>`),
  economy: svg24(`<path style="fill:var(--acc);${INK}" d="M12 1.5l6.5 8L12 22.5 5.5 9.5z"/><path style="fill:#fff6d0" d="M12 1.5l-6.5 8H12z"/>`),
  cast: svg24(`<path style="fill:var(--acc);${INK}" d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9L1.5 12l7.9-2.6z"/>`),
  safety: svg24(`<path style="fill:var(--acc);${INK}" d="M12 1.8l8.5 3.2v6.3c0 5.2-3.6 9.2-8.5 10.9-4.9-1.7-8.5-5.7-8.5-10.9V5z"/><path style="fill:rgb(0 0 0 / .22)" d="M12 1.8v20.4c4.9-1.7 8.5-5.7 8.5-10.9V5z"/>`),
};
const tagSigil = (tag) => (ELEMENTS.includes(tag) ? icon(ICON.el(tag), { cls: 'md-sig' }) : TAG_SIGIL[tag] ?? TAG_SIGIL.cast);

// Element gem (shape + colour). Physical has no gem.
const gem = (el, cls = 'md-gem') => (ELEMENTS.includes(el) ? icon(ICON.el(el), { cls, fallback: '◆', el }) : '');

function keyCap(i) {
  const lab = SLOT_KEYS[i]?.label ?? '';
  if (lab === 'LMB' || lab === 'RMB') {
    const id = ICON.ui(lab === 'LMB' ? 'mouse-l' : 'mouse-r');
    return hasIcon(id) ? `<span class="cf-key md-key-ico">${icon(id)}</span>` : `<span class="cf-key">${lab.toLowerCase()}</span>`;
  }
  return `<span class="cf-key">${esc(lab.toLowerCase())}</span>`;
}

function pips(n, max, newAt = -1) {
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="${i === newAt ? 'new' : i < n ? 'on' : ''}"></i>`;
  return `<span class="cf-pips md-pips">${s}</span>`;
}

// ---------------------------------------------------------------- level-up cards
const TYPE_WORD = { new: 'new', rank: 'rank up', fusion: 'fusion', passive: 'passive', heal: 'restore' };
const SHAPED = new Set(ELEMENTS);

function cardDef(card) {
  if (card.type === 'passive') return PASSIVES[card.id];
  if (card.type === 'heal') return null;
  return ALL_DEFS[card.id] ?? FUSION_BY_ID.get(card.id)?.def ?? null;
}

// Which loadout cell a card changes. target/consumed are data-k keys of the strip cells.
function cardTarget(card, p) {
  if (!p) return null;
  const autos = p.skills.filter((s) => s.slot < 0);
  const locOf = (s) => (s.slot >= 0 ? `slot-${s.slot}` : `auto-${autos.indexOf(s)}`);
  const keyOf = (s) => (s.slot >= 0 ? SLOT_KEYS[s.slot].label : 'auto');
  switch (card.type) {
    case 'new': {
      const def = SKILLS[card.id];
      if (!def) return null;
      if (p.usesSlot(def)) { const i = p.freeSlot(); return i >= 0 ? { target: `slot-${i}`, ghost: true, key: SLOT_KEYS[i].label } : null; }
      return autos.length < MAX_AUTOS ? { target: `auto-${autos.length}`, ghost: true, key: 'auto' } : null;
    }
    case 'rank': {
      const s = p.getSkill(card.id);
      return s ? { target: locOf(s), key: keyOf(s) } : null;
    }
    case 'fusion': {
      const f = card.recipe ?? FUSION_BY_ID.get(card.id);
      if (!f) return null;
      const parents = [p.getSkill(f.a), p.getSkill(f.b)].filter(Boolean);
      const active = p.usesSlot(f.def);
      const host = parents.find((s) => (active ? s.slot >= 0 : s.slot < 0)) ?? null;
      return {
        target: host ? locOf(host) : null, ghost: true,
        consumed: parents.filter((s) => s !== host).map(locOf),
        key: host ? keyOf(host) : (active ? '' : 'auto'),
      };
    }
    case 'passive': {
      const has = p.passives.has(card.id);
      if (has) return { target: `pas-${card.id}` };
      return p.passives.size < MAX_PASSIVES ? { target: `pas-${p.passives.size}`, ghost: true } : null;
    }
    default: return null;
  }
}

function medalHTML(card, el) {
  const shape = card.type === 'passive' ? 'round' : card.type === 'heal' ? 'plain' : SHAPED.has(el) ? el : 'round';
  const ico = icon(cardIconId(card), { el: el || '', fallback: card.icon ?? '✚' });
  return `<div class="md-medal" data-shape="${shape}"><i class="md-mount"></i>
    <div class="cf-socket md-socket${shape === 'round' ? ' round' : ''}">${ico}</div></div>`;
}

function effectHTML(card, def, p) {
  const r = card.rank ?? 1;
  let main = '', stat = '';
  switch (card.type) {
    case 'new':
    case 'fusion':
      main = hlNums(def?.desc?.(1) ?? card.desc ?? '');
      break;
    case 'rank': {
      const prev = r > 1 ? def?.desc?.(r - 1) : '';
      const cur = def?.desc?.(r) ?? card.desc ?? '';
      main = numDelta(prev, cur) ?? hlNums(cur);
      const cd0 = def?.cooldown?.(r - 1), cd1 = def?.cooldown?.(r);
      if (cd0 > 0 && cd1 > 0 && cd0 !== cd1 && !cur.includes(fmtN(cd1))) {
        const dp = Math.max(...[cd0, cd1].map((v) => (fmtN(v).split('.')[1] ?? '').length));
        stat = `<span class="md-stat"><span class="cf-label">${isActive(def) ? 'cooldown' : 'interval'}</span> ${delta(cd0.toFixed(dp), cd1.toFixed(dp) + 's')}</span>`;
      }
      break;
    }
    case 'passive':
      main = PASSIVES[card.id] ? passiveDeltaHTML(card.id, r) : hlNums(card.desc);
      break;
    case 'heal': {
      main = hlNums(card.desc ?? 'Restore 40% HP.');
      if (p) {
        const max = p.stats.maxHp, now = Math.ceil(p.hp), next = Math.ceil(Math.min(max, p.hp + max * 0.4));
        stat = `<span class="md-stat"><span class="cf-label">hp</span> ${delta(now, next)}<span class="md-of">/ ${Math.round(max)}</span></span>`;
      }
      break;
    }
  }
  const long = main.replace(/<[^>]+>/g, '').length > 74;
  return `<div class="md-effect${long ? ' is-long' : ''}"><p>${main}</p>${stat}</div>`;
}

// card.hint is plain text from progression.js; light up reaction and fusion names in it.
const REACT_BY_NAME = Object.values(REACTIONS).map((R) => [R.name, R]);
const FUSION_NAMES = FUSIONS.map((f) => f.def.name);
function synergyHTML(card) {
  if (!card.hint) return '';
  let h = esc(card.hint);
  let kind = 'hint', react = null;
  for (const [name, R] of REACT_BY_NAME) {
    const re = new RegExp(name.replace(/ /g, '\\s'), 'i');
    if (re.test(h)) { h = h.replace(re, `<b class="md-react" style="--rc:${R.color}">${titleCase(name)}</b>`); kind = 'react'; react = R; }
  }
  for (const name of FUSION_NAMES) {
    const re = new RegExp(name.replace(/ /g, '\\s'), 'i');
    if (re.test(h)) { h = h.replace(re, `<b class="md-fname">${esc(name)}</b>`); kind = 'fusion'; }
  }
  h = h.replace(/FUSION/g, 'fusion');
  const mark = kind === 'fusion' ? SIGIL.fusion : react ? icon(ICON.react(react.id), { cls: 'md-sig', fallback: '✦' }) : '';
  return `<div class="md-syn md-syn-${kind}">${mark}<span>${h}</span></div>`;
}

function footHTML(card, def, tgt) {
  if (card.type === 'heal') return `<span class="cf-label">restore · instant · build unchanged</span>`;
  if (card.type === 'passive') {
    const max = def?.maxRank ?? 5;
    return `<span class="cf-label">passive · always on · max rank ${max}</span>`;
  }
  const el = card.element ?? def?.element ?? '';
  const kind = isActive(def) ? 'active' : 'auto';
  const key = tgt?.key && tgt.key !== 'auto' ? ` · ${esc(tgt.key.toLowerCase())}` : '';
  return `${gem(el)}<span class="cf-label">${esc(el)} · ${kind}${key}</span>`;
}

function cardHTML(card, i, p) {
  const t = card.type;
  const def = cardDef(card);
  const el = t === 'passive' || t === 'heal' ? '' : (card.element ?? def?.element ?? '');
  const max = t === 'heal' ? 0 : (def?.maxRank ?? 5);
  const before = t === 'new' || t === 'fusion' ? 0 : Math.max(0, (card.rank ?? 1) - 1);
  const tgt = cardTarget(card, p);

  let rankRow;
  if (t === 'heal') rankRow = '';
  else {
    rankRow = `<div class="md-rankrow" aria-label="rank ${before} to ${before + 1}">
      ${pips(before, max)}<i class="md-arrow">→</i>${pips(before, max, before)}</div>`;
  }

  let parents = '';
  if (t === 'fusion') {
    const f = card.recipe ?? FUSION_BY_ID.get(card.id);
    if (f) {
      parents = [f.a, f.b].map((id, k) => {
        const d = SKILLS[id];
        return `<div class="md-parent md-parent-${k ? 'r' : 'l'} cf-socket" data-el="${d?.element ?? ''}">${icon(ICON.skill(id), { el: d?.element ?? '', fallback: d?.icon ?? '◆' })}</div>`;
      }).join('');
    }
  }

  // the crown's prism crack: a jagged hairline (stroke = the shared #md-prism-grad in the modal)
  const crack = t === 'fusion' ? `<svg class="md-crack" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 6.5H22L27 2.5L33 9.5L37 6H58L63 1L70 11L74 5.5H96L101 3L105 8.5L111 6H134L139 1.5L146 10.5L150 6.5H171L176 3.5L181 8L185 6H200"/></svg>` : '';

  const style = t === 'passive' ? '--el:var(--cf-gilt);--el-lo:var(--cf-bronze);--el-hi:#fff4d2;'
    : t === 'heal' ? '--el:var(--hp-hi);--el-lo:var(--hp);--el-hi:#ffd0c0;' : '';
  return `
    <button type="button" class="md-card" data-idx="${i}" data-type="${t}"${el ? ` data-el="${el}"` : ''} style="${style}--i:${i}">
      <i class="md-glint" aria-hidden="true"></i>
      ${crack}
      <span class="md-keycap num">${i + 1}</span>
      <span class="md-type"><span class="md-type-n">${SIGIL[t] ?? ''}<span class="cf-label">${TYPE_WORD[t] ?? t}</span></span><span class="md-type-b">${SIGIL.banish}<span class="cf-label">banish?</span></span></span>
      ${parents}
      ${medalHTML(card, el)}
      <h3 class="md-name">${esc(card.name)}</h3>
      ${rankRow}
      ${effectHTML(card, def, p)}
      ${synergyHTML(card)}
      <div class="md-foot">${footHTML(card, def, tgt)}</div>
    </button>`;
}

// ---------------------------------------------------------------- loadout strip (level-up)
function skillIcon(def) {
  return icon(ICON.skill(def.id), { el: def.element, fallback: def.icon ?? '◆' });
}
function dashIcon(def) {
  return icon(ICON.dash(def.kind), { el: { flame: 'fire', frost: 'frost', storm: 'storm', blink: 'arcane' }[def.kind] ?? '', fallback: DASH_FALLBACK[def.kind] ?? '➤' });
}
function passiveIcon(id) {
  return icon(ICON.passive(id), { fallback: PASSIVES[id]?.icon ?? '◆' });
}

function loadoutHTML(p) {
  if (!p) return '';
  const autos = p.skills.filter((s) => s.slot < 0);
  const cell = (k, sock, below = '', badge = '') => `<div class="md-lo-cell" data-k="${k}">${sock}${badge}<span class="md-lo-under">${below}</span></div>`;
  const rank = (n) => `<span class="md-lo-rank num">${n}</span>`;
  const sock = (cls, el, inner) => `<div class="cf-socket md-lo-sock ${cls}"${el ? ` data-el="${el}"` : ''}>${inner}<span class="md-lo-ghost"></span></div>`;

  const out = [];
  const d = p.dash.def;
  out.push(`<div class="md-lo-group">${cell('dash', sock('is-dash', '', dashIcon(d)), '<span class="cf-key">space</span>')}</div>`);
  const slots = p.slots.map((s, i) => (s
    ? cell(`slot-${i}`, sock(FUSION_BY_ID.has(s.def.id) ? 'is-fusion' : '', s.def.element, skillIcon(s.def)), keyCap(i), rank(s.rank))
    : cell(`slot-${i}`, sock('empty', '', ''), keyCap(i)))).join('');
  out.push(`<div class="md-lo-group">${slots}</div>`);
  let au = '';
  for (let i = 0; i < MAX_AUTOS; i++) {
    const s = autos[i];
    au += s ? cell(`auto-${i}`, sock(`round${FUSION_BY_ID.has(s.def.id) ? ' is-fusion' : ''}`, s.def.element, skillIcon(s.def)), '<span class="cf-label">auto</span>', rank(s.rank))
      : cell(`auto-${i}`, sock('round empty', '', ''), '<span class="cf-label">auto</span>');
  }
  out.push(`<div class="md-lo-group">${au}</div>`);
  const pas = [...p.passives.entries()];
  let ps = '';
  for (let i = 0; i < MAX_PASSIVES; i++) {
    const e = pas[i];
    ps += e ? cell(`pas-${e[0]}`, sock('round is-token', '', passiveIcon(e[0])), '', rank(e[1]))
      : cell(`pas-${i}`, sock('round is-token empty', '', ''), '');
  }
  out.push(`<div class="md-lo-group md-lo-pas">${ps}</div>`);
  return out.join('<i class="md-lo-sep" aria-hidden="true"></i>');
}

// ---------------------------------------------------------------- relic chest cards
const STAT_ROWS = [
  ['maxHp', 'max hp', (v) => Math.round(v)],
  ['damage', 'damage', (v) => `+${Math.round((v - 1) * 100)}%`],
  ['projectiles', 'projectiles', (v) => `+${v}`],
  ['moveSpeed', 'move speed', (v) => v.toFixed(1)],
  ['reaction', 'reaction dmg', (v) => `${Math.round(v * 100)}%`],
  ['xpMult', 'xp gain', (v) => `+${Math.round((v - 1) * 100)}%`],
  ['dashCdr', 'dash cooldown', (v) => `−${Math.round(v * 100)}%`],
  ['freezeAt', 'freeze at', (v) => `${v} chill`],
  ['chestChoices', 'chest choices', (v) => v],
];
function statDiff(r, p) {
  if (!r.apply || !p) return '';
  const a = p.stats, b = { ...p.stats };
  try { r.apply(b); } catch { return ''; }
  for (const [k, label, f] of STAT_ROWS) {
    if (typeof a[k] === 'number' && Math.abs(a[k] - b[k]) > 1e-6) return `<span class="cf-label">${label}</span> ${delta(f(a[k]), f(b[k]))}`;
  }
  return '';
}

function relicContext(r, p, game) {
  if (!p) return '';
  const held = p.relics.filter((x) => x.tag === r.tag).length;
  switch (r.tag) {
    case 'fire': case 'frost': case 'storm': {
      const n = p.skills.filter((s) => s.def.element === r.tag).length;
      return n ? `${gem(r.tag)}<span>Boosts ${plural(n, 'skill')} you own</span>`
        : `${gem(r.tag)}<span class="md-warn">You own no ${r.tag} skills yet</span>`;
    }
    case 'reaction': {
      if (held) return `<span>Joins your ${plural(held, 'reaction relic')}</span>`;
      const kinds = Object.keys(game.stats?.reactions ?? {}).length;
      return kinds ? `<span>${plural(kinds, 'reaction')} set off this run</span>` : '<span class="md-warn">No reactions set off yet</span>';
    }
    case 'risk': {
      const d = statDiff(r, p);
      if (d) return d;
      return `<span class="cf-label">hp</span> <b class="num">${Math.ceil(p.hp)}</b><span class="md-of">/ ${Math.round(p.stats.maxHp)}</span>`;
    }
    case 'dodge':
      return `${dashIcon(p.dash.def)}<span>${esc(p.dash.def.name)} · ${plural(p.dash.max, 'charge')}</span>`;
    case 'economy':
      return statDiff(r, p) || `<span>Level ${p.level}</span>`;
    case 'cast': {
      const n = p.slots.filter(Boolean).length;
      return `<span>${plural(n, 'slotted skill')} benefit</span>`;
    }
    case 'safety':
      return `<span class="cf-label">hp now</span> <b class="num">${Math.ceil(p.hp)}</b><span class="md-of">/ ${Math.round(p.stats.maxHp)}</span>`;
    default:
      return held ? `<span>You hold ${plural(held, `${r.tag} relic`)}</span>` : '';
  }
}

function relicCardHTML(r, i, p, game) {
  const col = tagColor(r.tag);
  return `
    <button type="button" class="md-card md-relic" data-idx="${i}" style="--i:${i};--acc:${col};--el:${col}">
      <i class="md-glint" aria-hidden="true"></i>
      <span class="md-keycap num">${i + 1}</span>
      <div class="md-plinth-wrap">
        <div class="md-relic-ico">${icon(ICON.relic(r.id), { fallback: r.icon })}</div>
        <div class="md-plinth"><span class="md-plinth-sig">${tagSigil(r.tag)}</span></div>
      </div>
      <span class="md-tag cf-label">${esc(r.tag)}</span>
      <h3 class="md-name">${esc(r.name)}</h3>
      <div class="md-effect"><p>${hlNums(r.desc)}</p></div>
      <div class="md-ctx">${relicContext(r, p, game)}</div>
    </button>`;
}

// ---------------------------------------------------------------- element square
// Corners: fire TL, storm TR, frost BL, arcane BR. 4 elements choose 2 = the 6 reactions.
const SQ_POS = { fire: [0, 0], storm: [100, 0], frost: [0, 100], arcane: [100, 100] };
const SQ_LABEL = { overload: [50, 0], steam: [0, 50], shatter: [50, 100], arcflash: [100, 50], combust: [25, 25], superconduct: [75, 25] };

function squareHTML(found, cls = '') {
  const lines = [], labels = [];
  for (const R of Object.values(REACTIONS)) {
    const [a, b] = R.elements.map((e) => SQ_POS[e]);
    if (!a || !b) continue;
    const on = found.has(R.id);
    lines.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${on ? 'on' : ''}" style="--rc:${R.color}" vector-effect="non-scaling-stroke"/>`);
    const [x, y] = SQ_LABEL[R.id] ?? [50, 50];
    labels.push(`<span class="md-sq-lbl${on ? ' on' : ''}" style="left:${x}%;top:${y}%;--rc:${R.color}">${on ? esc(titleCase(R.name)) : '???'}</span>`);
  }
  const gems = ELEMENTS.map((e) => `<span class="md-sq-gem" style="left:${SQ_POS[e][0]}%;top:${SQ_POS[e][1]}%">${icon(ICON.el(e), { fallback: '◆', el: e, title: cap(e) })}</span>`).join('');
  return `<div class="md-sq ${cls}"><div class="md-sq-box">
    <svg class="md-sq-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
    ${labels.join('')}${gems}</div></div>`;
}

// =====================================================================================
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
    this._tips = [];
    this.levelUpTip = '';

    this.hud = new HUD(game, this.uiRoot);
    this._buildLevelUp();
    this._buildRelicPick();
    this._buildPause();
    this.feedback = new FeedbackPanel(this);
    this.menus = new Menus(game, this.uiRoot);

    const on = (ev, fn) => this._unsub.push(game.events.on(ev, fn));
    on('runStart', () => {
      this.menus.hideTitle();
      this.menus.hideEnd();
      this._closeModals(true);
      this.hud.show();
    });
    on('autoCastChanged', () => this._syncSettings());

    this._onKey = (e) => {
      if (e.repeat) return;
      const st = this.game.state;
      if (st === 'levelup' && this._lu) this._luKey(e);
      else if (st === 'relic' && this._rp) this._rpKey(e);
      else if (st === 'paused' && this.pauseEl.classList.contains('is-open')) this._pzKey(e);
    };
    this._onKeyUp = (e) => {
      this._lu?.held.delete(e.code);
      this._rp?.held.delete(e.code);
    };
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('keyup', this._onKeyUp);

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
    for (const el of [this.luEl, this.rpEl, this.pauseEl]) this._close(el, instant);
    this.feedback?.close(true);
  }

  // Closed modals keep their layout but skip rendering (content-visibility) and are inert.
  _open(el) {
    clearTimeout(el._hideT);
    el.classList.remove('is-closing');
    el.inert = false;
    el.removeAttribute('aria-hidden');
    el.classList.add('is-open');
  }

  _close(el, instant = false) {
    if (!el) return;
    clearTimeout(el._hideT);
    const wasOpen = el.classList.contains('is-open');
    el.classList.remove('is-open');
    el.inert = true;
    el.setAttribute('aria-hidden', 'true');
    if (!wasOpen || instant || REDUCED.matches) { el.classList.remove('is-closing'); return; }
    el.classList.add('is-closing');
    el._hideT = setTimeout(() => el.classList.remove('is-closing'), CLOSE_MS);
  }

  _mkModal(cls, label) {
    const el = document.createElement('div');
    el.className = `md-modal ${cls}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
    this.uiRoot.appendChild(el);
    return el;
  }

  _heldNow() {
    const s = new Set(this.game.input?.down ?? []);
    return s;
  }

  // ------------------------------------------------------------------ level-up
  _buildLevelUp() {
    const el = this._mkModal('md-lu', 'Level up');
    el.innerHTML = `
      <div class="cf-backdrop"></div>
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
        <linearGradient id="md-prism-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#c08cff"/><stop offset=".33" stop-color="#ff7a33"/><stop offset=".66" stop-color="#ffe45c"/><stop offset="1" stop-color="#7fe0ff"/>
        </linearGradient></defs></svg>
      <div class="md-stage">
        <header class="md-head">
          <h2 class="md-hero" data-ref="title">The Rift offers…</h2>
          <div class="md-head-rule"><span class="md-stamp" data-ref="lvstamp"><span class="cf-label">level</span><b class="num" data-ref="level">1</b></span><span class="md-stamp md-stamp-multi" data-ref="multi" hidden><b class="num" data-ref="mi">1</b><span class="cf-label">of</span><b class="num" data-ref="mt">1</b></span></div>
        </header>
        <div class="md-cards" data-ref="cards"></div>
        <p class="md-tip" data-ref="tip" aria-live="polite"></p>
        <div class="md-actions">
          <button type="button" class="cf-btn md-act" data-ref="reroll">${icon(ICON.ui('reroll'), { cls: 'md-act-ico', fallback: '⟳' })}<span>Reroll</span><b class="md-count num" data-ref="rr">0</b><span class="cf-key">f</span></button>
          <button type="button" class="cf-btn md-act" data-ref="banish">${icon(ICON.ui('banish'), { cls: 'md-act-ico', fallback: '⊘' })}<span>Banish</span><b class="md-count num" data-ref="bb">0</b><span class="cf-key">x</span></button>
        </div>
        <div class="md-loadout cf-plate" data-ref="loadout"></div>
      </div>`;
    this.luEl = el;
    const q = (ref) => el.querySelector(`[data-ref="${ref}"]`);
    this.luRefs = { title: q("title"), lvstamp: q("lvstamp"), level: q("level"), multi: q('multi'), mi: q('mi'), mt: q('mt'), cards: q('cards'), tip: q('tip'), reroll: q('reroll'), banish: q('banish'), rr: q('rr'), bb: q('bb'), loadout: q('loadout') };

    const R = this.luRefs;
    R.cards.addEventListener('click', (e) => {
      const c = e.target.closest?.('.md-card');
      if (c) this._luPick(Number(c.dataset.idx));
    });
    R.cards.addEventListener('pointerover', (e) => {
      const c = e.target.closest?.('.md-card');
      if (c) this._luFocus(Number(c.dataset.idx));
    });
    R.cards.addEventListener('pointerleave', () => this._luFocus(-1));
    R.cards.addEventListener('focusin', (e) => {
      const c = e.target.closest?.('.md-card');
      if (c) this._luFocus(Number(c.dataset.idx));
    });
    R.reroll.addEventListener('click', () => this._luReroll());
    R.banish.addEventListener('click', () => this._luToggleBanish());
  }

  // extra: { index, total } when this is hand `index` of a burst of `total` level-ups. A hand shown while
  // the modal is already open (multi-pick) is swapped in place: no close / reopen.
  showLevelUp(cards, onPick, ctl, extra) {
    const wasOpen = !!this._lu && this.luEl.classList.contains('is-open');
    if (!extra && wasOpen) extra = { index: this._lu.index, total: this._lu.total, title: this._lu.title };   // a re-offer of the same hand (reroll / banish)
    const total = Math.max(1, extra?.total ?? 1);
    const index = Math.min(total, Math.max(1, extra?.index ?? 1));
    this._lu = {
      cards,
      ctl: ctl ?? {},
      onPick: once(onPick),
      banishMode: false,
      focus: -1,
      held: this._heldNow(),
      ignoreUntil: performance.now() + (wasOpen ? LEVELUP_SWAP_IGNORE_MS : LEVELUP_IGNORE_MS),
      index, total, title: extra?.title,
    };
    const R = this.luRefs;
    // the burst grants consecutive levels; the player is already at the last one
    const lvl = (this.game.player?.level ?? 0) - (total - index);
    R.level.textContent = String(lvl > 0 ? lvl : '');
    R.title.textContent = extra?.title ?? 'The Rift offers…';   // Wrath Cache etc. replace the header
    R.lvstamp.hidden = !!extra?.title;
    const multi = total > 1;
    R.multi.hidden = !multi;
    this.luEl.classList.toggle('is-multi', multi);
    if (multi) {
      R.mi.textContent = String(index);
      R.mt.textContent = String(total);
      R.multi.setAttribute('aria-label', `level-up ${index} of ${total}`);
      if (wasOpen && !REDUCED.matches && R.multi.animate) R.multi.animate([{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
    R.loadout.innerHTML = loadoutHTML(this.game.player);
    this._luRender(cards, wasOpen && this._luTook ? `Took <b>${esc(this._luTook)}</b>.` : '');
    this._luTook = '';
    this._open(this.luEl);
  }

  hideLevelUp() {
    this._lu = null;
    this._luTook = '';
    this.levelUpTip = '';   // tutorial tips are for one level-up only
    this._close(this.luEl);
  }

  _luRender(cards, msg = '', fresh = true) {
    const L = this._lu;
    if (!L) return;
    L.cards = cards;
    const R = this.luRefs;
    if (fresh) {
      R.cards.innerHTML = cards.map((c, i) => cardHTML(c, i, this.game.player)).join('');
      R.cards.dataset.n = String(cards.length);
      L.focus = -1;
      this._luFocus(-1);
    }
    this.luEl.classList.toggle('is-banish', L.banishMode);

    const rr = L.ctl.rerolls ?? 0;
    const bb = L.ctl.banishes ?? 0;
    R.rr.textContent = String(rr);
    R.bb.textContent = String(bb);
    R.reroll.disabled = rr <= 0;
    R.banish.disabled = bb <= 0 && !L.banishMode;
    R.banish.classList.toggle('is-on', L.banishMode);
    R.tip.innerHTML = msg || (L.banishMode
      ? 'Choose a card to <b>banish</b> for the rest of the run · <span class="cf-key">esc</span> cancels'
      : esc(this.levelUpTip || ''));
    R.tip.classList.toggle('is-warn', L.banishMode);
  }

  _luKey(e) {
    const L = this._lu;
    if (L.held.has(e.code)) return;          // held since combat: wait for a fresh press
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) { const i = Number(digit[1]) - 1; if (i < L.cards.length) { e.preventDefault(); this._luFocus(i); this._luPick(i); } return; }
    switch (e.code) {
      case 'KeyF': this._luReroll(); break;
      case 'KeyX': this._luToggleBanish(); break;
      case 'Escape': if (L.banishMode) { L.banishMode = false; this._luRender(L.cards, '', false); } break;
      case 'ArrowLeft': case 'ArrowRight': {
        const n = L.cards.length;
        const i = L.focus < 0 ? (e.code === 'ArrowLeft' ? n - 1 : 0) : (L.focus + (e.code === 'ArrowLeft' ? n - 1 : 1)) % n;
        this.luRefs.cards.children[i]?.focus();
        this._luFocus(i);
        break;
      }
      case 'Enter': if (L.focus >= 0) { e.preventDefault(); this._luPick(L.focus); } break;
    }
  }

  // Highlight the loadout cell the focused card changes (and preview its icon there).
  _luFocus(idx) {
    const L = this._lu;
    const root = this.luRefs.loadout;
    for (const c of root.querySelectorAll('.is-target, .is-consumed')) c.classList.remove('is-target', 'is-consumed', 'has-ghost');
    for (const g of root.querySelectorAll('.md-lo-ghost')) g.innerHTML = '';
    for (const c of this.luRefs.cards.children) c.classList.toggle('is-focus', Number(c.dataset.idx) === idx);
    if (!L) return;
    L.focus = idx;
    const card = L.cards[idx];
    if (!card || L.banishMode) return;
    const t = cardTarget(card, this.game.player);
    if (!t) return;
    const cell = t.target && root.querySelector(`[data-k="${t.target}"]`);
    if (cell) {
      cell.classList.add('is-target');
      if (t.ghost) {
        const def = cardDef(card);
        cell.querySelector('.md-lo-ghost').innerHTML = icon(cardIconId(card), { el: card.type === 'passive' ? '' : (card.element ?? def?.element ?? ''), fallback: card.icon ?? '◆' });
        cell.classList.add('has-ghost');
      }
    }
    for (const k of t.consumed ?? []) root.querySelector(`[data-k="${k}"]`)?.classList.add('is-consumed');
  }

  _luReroll() {
    const L = this._lu;
    if (!L || performance.now() < L.ignoreUntil) return;
    if (!L.ctl.reroll || !((L.ctl.rerolls ?? 0) > 0)) { this._nudge(this.luRefs.reroll); this._luRender(L.cards, 'No rerolls left.', false); return; }
    const c = L.ctl.reroll();
    L.banishMode = false;
    if (c) this._luRender(c);
    else this._luRender(L.cards, 'No rerolls left.', false);
  }

  _luToggleBanish() {
    const L = this._lu;
    if (!L) return;
    if (!L.banishMode && !((L.ctl.banishes ?? 0) > 0)) { this._nudge(this.luRefs.banish); this._luRender(L.cards, 'No banishes left.', false); return; }
    L.banishMode = !L.banishMode;
    this._luRender(L.cards, '', false);
    this._luFocus(L.banishMode ? -1 : L.focus);
  }

  _luPick(idx) {
    const L = this._lu;
    if (!L || performance.now() < L.ignoreUntil) return;
    const card = L.cards[idx];
    if (!card) return;

    if (L.banishMode) {
      if (card.type === 'heal') { this._luRender(L.cards, `${esc(card.name)} cannot be banished.`, false); return; }
      L.banishMode = false;
      const c = L.ctl.banish ? L.ctl.banish(card) : null;
      if (c) this._luRender(c, `Banished <b>${esc(card.name)}</b> for this run.`);
      else this._luRender(L.cards, `${esc(card.name)} cannot be banished.`, false);
      return;
    }
    const els = [...this.luRefs.cards.children];
    els.forEach((c, i) => c.classList.add(i === idx ? 'is-picked' : 'is-dropped'));
    this._luTook = card.type === 'heal' ? '' : card.name;
    L.onPick(card);
  }

  _nudge(el) {
    if (REDUCED.matches || !el?.animate) return;
    el.animate([{ translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '0 0' }], { duration: 180, easing: 'ease-out' });
  }

  // ------------------------------------------------------------------ relic chest
  _buildRelicPick() {
    const el = this._mkModal('md-rp', 'Relic chest');
    el.innerHTML = `
      <div class="cf-backdrop"></div>
      <div class="md-chestlight" aria-hidden="true"></div>
      <div class="md-stage">
        <header class="md-head">
          <h2 class="md-hero">Bind a relic</h2>
          <div class="md-head-rule"><span class="md-stamp md-stamp-chest">${icon(ICON.ui('chest'), { cls: 'md-stamp-ico', fallback: '◆' })}<span class="cf-label">relic chest</span></span></div>
        </header>
        <div class="md-cards md-relics" data-ref="cards"></div>
        <p class="md-tip md-tip-quiet"><span class="cf-key">1</span>–<span class="cf-key" data-ref="maxkey">3</span> or click to bind · relics last the whole run</p>
      </div>`;
    this.rpEl = el;
    this.rpCards = el.querySelector('[data-ref="cards"]');
    this.rpMaxKey = el.querySelector('[data-ref="maxkey"]');
    this.rpCards.addEventListener('click', (e) => {
      const c = e.target.closest?.('.md-card');
      if (c) this._rpPick(Number(c.dataset.idx));
    });
  }

  showRelicPick(relics, onPick) {
    this._rp = { relics, onPick: once(onPick), held: this._heldNow(), ignoreUntil: performance.now() + RELIC_IGNORE_MS };
    this.rpCards.innerHTML = relics.map((r, i) => relicCardHTML(r, i, this.game.player, this.game)).join('');
    this.rpCards.dataset.n = String(relics.length);
    this.rpMaxKey.textContent = String(relics.length);
    this._open(this.rpEl);
  }

  hideRelicPick() {
    this._rp = null;
    this._close(this.rpEl);
  }

  _rpKey(e) {
    const R = this._rp;
    if (R.held.has(e.code)) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) { e.preventDefault(); this._rpPick(Number(digit[1]) - 1); }
  }

  _rpPick(idx) {
    const R = this._rp;
    if (!R || performance.now() < R.ignoreUntil) return;
    const relic = R.relics[idx];
    if (!relic) return;
    [...this.rpCards.children].forEach((c, i) => c.classList.add(i === idx ? 'is-picked' : 'is-dropped'));
    R.onPick(relic);
  }

  // ------------------------------------------------------------------ pause (build + codex)
  _buildPause() {
    const el = this._mkModal('md-pz', 'Paused');
    el.innerHTML = `
      <div class="cf-backdrop"></div>
      <div class="md-pz-panel cf-frame crown">
        <header class="md-pz-head">
          <h2 class="md-pz-title">Paused</h2>
          <nav class="md-tabs" role="tablist">
            <button type="button" class="md-tab" role="tab" data-tab="build">${icon(ICON.ui('gear'), { cls: 'md-tab-ico', fallback: '◆' })}<span>Build</span></button>
            <button type="button" class="md-tab" role="tab" data-tab="codex">${icon(ICON.ui('tome'), { cls: 'md-tab-ico', fallback: '◆' })}<span>Codex</span></button>
            <span class="cf-key md-tab-key">tab</span>
          </nav>
          <div class="md-pz-actions">
            <button type="button" class="cf-btn primary" data-ref="resume">Resume <span class="cf-key">esc</span></button>
            <button type="button" class="cf-btn md-feedback" data-ref="feedback">${icon(ICON.ui('feedback'), { cls: 'md-act-ico', fallback: '✉' })}Feedback</button>
            <button type="button" class="cf-btn md-abandon" data-ref="abandon">Abandon run</button>
          </div>
        </header>
        <div class="md-pz-body">
          <section class="md-pane" data-pane="build" role="tabpanel"></section>
          <section class="md-pane" data-pane="codex" role="tabpanel"></section>
        </div>
        <footer class="md-pz-foot">
          <div class="md-set">
            <span class="cf-label">screen shake</span>
            <div class="md-seg" data-ref="shake">
              <button type="button" data-v="0">off</button><button type="button" data-v="0.5">low</button><button type="button" data-v="1">full</button>
            </div>
          </div>
          <div class="md-set">
            <span class="cf-label">auto-cast</span>
            <button type="button" class="md-toggle" data-ref="auto"><i></i><span data-ref="autoTxt">off</span></button>
            <span class="cf-key">t</span>
          </div>
          <div class="md-run" data-ref="run"></div>
        </footer>
        <div class="cf-tip md-tip-pop" data-ref="tip" hidden></div>
      </div>`;
    this.pauseEl = el;
    const q = (ref) => el.querySelector(`[data-ref="${ref}"]`);
    this.pzAbandon = q('abandon');
    this.pzPanes = [...el.querySelectorAll('.md-pane')];
    this.pzTabs = [...el.querySelectorAll('.md-tab')];
    this.pzRefs = { shake: q('shake'), auto: q('auto'), autoTxt: q('autoTxt'), run: q('run'), tip: q('tip'), panel: el.querySelector('.md-pz-panel') };

    q('feedback').addEventListener('click', () => this.feedback.open());
    q('resume').addEventListener('click', () => this.game.togglePause());
    this.pzAbandon.addEventListener('click', () => this._onAbandonClick());
    for (const tab of this.pzTabs) tab.addEventListener('click', () => this._setPauseTab(tab.dataset.tab));

    this.pzRefs.shake.addEventListener('click', (e) => {
      const b = e.target.closest?.('button');
      if (!b) return;
      const v = Number(b.dataset.v);
      const meta = this.game.meta;
      if (meta) { meta.shake = v; saveMeta(meta); }
      if (this.game.engine) this.game.engine.shakeScale = v;
      this._syncSettings();
    });
    this.pzRefs.auto.addEventListener('click', () => {
      this.game.autoCast = !this.game.autoCast;
      this.game.events.emit('autoCastChanged', { on: this.game.autoCast });
      this._syncSettings();
    });

    // one shared tooltip for codex tiles / loadout rows
    const panel = this.pzRefs.panel;
    panel.addEventListener('pointerover', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (!t || !panel.contains(t)) return;
      this._showTip(t);
    });
    panel.addEventListener('pointerout', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (t && !t.contains(e.relatedTarget)) this.pzRefs.tip.hidden = true;
    });
    panel.addEventListener('focusin', (e) => {
      const t = e.target.closest?.('[data-tip]');
      if (t) this._showTip(t); else this.pzRefs.tip.hidden = true;
    });
  }

  _showTip(t) {
    const tip = this.pzRefs.tip;
    const html = this._tips[Number(t.dataset.tip)];
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const pr = this.pzRefs.panel.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.right - pr.left + 8, y = r.top - pr.top;
    if (x + tw > pr.width - 8) x = r.left - pr.left - tw - 8;
    if (y + th > pr.height - 8) y = pr.height - th - 8;
    tip.style.left = `${Math.round(Math.max(8, x))}px`;
    tip.style.top = `${Math.round(Math.max(8, y))}px`;
  }

  _tip(html) { this._tips.push(html); return ` data-tip="${this._tips.length - 1}" tabindex="0"`; }

  _setPauseTab(name) {
    for (const t of this.pzTabs) {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
    }
    for (const p of this.pzPanes) p.classList.toggle('is-off', p.dataset.pane !== name);
    this._pzTab = name;
    if (this.pzRefs?.tip) this.pzRefs.tip.hidden = true;
  }

  _pzKey(e) {
    if (e.code === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); this.game.togglePause(); }
    else if (e.code === 'Tab') { e.preventDefault(); this._setPauseTab(this._pzTab === 'build' ? 'codex' : 'build'); }
  }

  // Abandon needs a second click within 3 s, so it is never hit by accident. The armed label
  // names the shards an abandoned run forfeits: quitting pays nothing (playtest round 1, #14).
  _onAbandonClick() {
    if (!this._abandonArmed) {
      this._abandonArmed = true;
      const g = this.game, s = g.stats;
      const shards = computeShards({ kills: s.kills, actsReached: g.act + 1, bossesKilled: s.bossesKilled, maxChain: s.maxChain, tier: g.tier });
      this.pzAbandon.textContent = shards > 0 ? `Forfeit ${shards} shards?` : 'Confirm abandon?';
      this.pzAbandon.title = 'An abandoned run pays no shards and does not count toward unlocks.';
      this.pzAbandon.classList.add('danger', 'is-armed');
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
      this.pzAbandon.textContent = 'Abandon run';
      this.pzAbandon.title = '';
      this.pzAbandon.classList.remove('danger', 'is-armed');
    }
  }

  _syncSettings() {
    if (!this.pzRefs) return;
    const shake = this.game.meta?.shake ?? 1;
    for (const b of this.pzRefs.shake.children) b.classList.toggle('is-on', Number(b.dataset.v) === shake);
    const on = !!this.game.autoCast;
    this.pzRefs.auto.classList.toggle('is-on', on);
    this.pzRefs.autoTxt.textContent = on ? 'on' : 'off';
  }

  showPause() {
    this._disarmAbandon();
    this._tips = [];
    this.pzPanes[0].innerHTML = this._buildPaneHTML(this.game.player);
    this.pzPanes[1].innerHTML = this._codexHTML(this.game.codex ?? {});
    const g = this.game;
    this.pzRefs.run.innerHTML = g.player
      ? `${icon(ICON.ui('clock'), { cls: 'md-run-ico', fallback: '◷' })}<b class="num">${fmtTime(g.time ?? 0)}</b><span class="cf-label">act ${(g.act ?? 0) + 1}</span><i class="md-dot"></i><b class="num">${g.stats?.kills ?? 0}</b><span class="cf-label">kills</span><i class="md-dot"></i><b class="num">${g.stats?.maxChain ?? 0}</b><span class="cf-label">peak chain</span>`
      : '';
    this._syncSettings();
    this._setPauseTab('build');
    this._open(this.pauseEl);
  }

  hidePause() {
    this._disarmAbandon();
    if (this.pzRefs) this.pzRefs.tip.hidden = true;
    this._close(this.pauseEl);
  }

  // ---- build tab: loadout · element square + fusions in reach · relics
  _buildPaneHTML(p) {
    if (!p) return '<p class="md-empty">No run in progress.</p>';
    const T = (h) => this._tip(h);
    const autos = p.skills.filter((s) => s.slot < 0);
    const skillRow = (s, key, empty) => {
      if (empty) return `<div class="md-row is-empty">${key}<div class="cf-socket md-row-sock empty"></div><div class="md-row-txt"><span class="md-row-name">Empty</span><span class="md-row-sub">A new skill can go here</span></div></div>`;
      const d = s.def, max = d.maxRank ?? 5, fus = FUSION_BY_ID.has(d.id);
      const tip = `<b>${esc(d.name)}</b> <span class="cf-label">rank ${s.rank}/${max}</span><br>${hlNums(d.desc(1))}${s.rank > 1 ? `<br><span class="cf-dim">Ranks: ${[...Array(s.rank - 1)].map((_, k) => esc(d.desc(k + 2))).join(' ')}</span>` : ''}`;
      return `<div class="md-row${fus ? ' is-fusion' : ''}" data-el="${d.element}"${T(tip)}>${key}
        <div class="cf-socket md-row-sock${s.slot < 0 ? ' round' : ''}">${skillIcon(d)}</div>
        <div class="md-row-txt"><span class="md-row-name">${esc(d.name)}</span><span class="md-row-sub">${esc(d.desc(1))}</span></div>
        ${pips(s.rank, max)}</div>`;
    };
    const d = p.dash.def;
    const rows = [
      `<div class="md-row" data-el="${{ flame: 'fire', frost: 'frost', storm: 'storm', blink: 'arcane' }[d.kind] ?? ''}"${T(`<b>${esc(d.name)}</b><br>${esc(d.desc ?? '')}`)}><span class="md-row-key"><span class="cf-key">space</span></span>
        <div class="cf-socket md-row-sock">${dashIcon(d)}</div>
        <div class="md-row-txt"><span class="md-row-name">${esc(d.name)}</span><span class="md-row-sub">${esc(d.desc ?? '')}</span></div>
        <span class="md-row-num"><b class="num">${fmtN(d.cd)}</b><span class="cf-label">s</span>${p.dash.max > 1 ? `<span class="cf-label">×${p.dash.max}</span>` : ''}</span></div>`,
      ...p.slots.map((s, i) => skillRow(s, `<span class="md-row-key">${keyCap(i)}</span>`, !s)),
      ...autos.map((s) => skillRow(s, `<span class="md-row-key"><span class="cf-label">auto</span></span>`)),
    ];
    const pas = [...p.passives.entries()].map(([id, r]) => {
      const def = PASSIVES[id];
      if (!def) return '';
      return `<div class="md-prow"${T(`<b>${esc(def.name)}</b> <span class="cf-label">rank ${r}/${def.maxRank}</span><br>${passiveNowText(id, r)} <span class="cf-dim">(${esc(def.desc(r))} per rank)</span>`)}>
        <div class="cf-socket round is-token md-prow-sock">${passiveIcon(id)}</div>
        <span class="md-prow-name">${esc(def.name)}</span><span class="md-prow-fx">${passiveNowText(id, r)}</span>${pips(r, def.maxRank)}</div>`;
    }).join('');

    // fusions in reach: any recipe where you own at least one parent (and not the fusion)
    const reach = FUSIONS.filter((f) => !p.getSkill(f.def.id) && (p.getSkill(f.a) || p.getSkill(f.b)))
      .map((f) => ({ f, need: Math.max(0, FUSION_RANK - p.skillRank(f.a)) + Math.max(0, FUSION_RANK - p.skillRank(f.b)) }))
      .sort((a, b) => a.need - b.need);
    const parentHTML = (id) => {
      const r = p.skillRank(id), dd = SKILLS[id];
      const ok = r >= FUSION_RANK;
      return `<span class="md-fz-par${r ? '' : ' is-missing'}${ok ? ' is-ok' : ''}"><span class="cf-socket md-fz-sock${r ? '' : ' md-sil'}" data-el="${dd?.element ?? ''}">${icon(ICON.skill(id), { el: dd?.element ?? '', fallback: dd?.icon ?? '◆' })}</span>
        <span class="md-fz-r num">${r ? `r${r}` : '—'}</span></span>`;
    };
    const reachRows = reach.slice(0, 5).map(({ f, need }) => {
      const a = SKILLS[f.a], b = SKILLS[f.b];
      const missing = [f.a, f.b].filter((id) => p.skillRank(id) < FUSION_RANK)
        .map((id) => (p.skillRank(id) ? `${esc(SKILLS[id].name)} <b>r${FUSION_RANK}</b>` : `learn ${esc(SKILLS[id].name)}`));
      const status = need === 0 ? '<span class="md-fz-ready">Ready: offered on your next level-up</span>' : `<span class="md-fz-need">${cap(missing.join(' · '))}</span>`;
      return `<div class="md-fz${need === 0 ? ' is-ready' : ''}"${T(`<b>${esc(f.def.name)}</b><br>${esc(a?.name)} + ${esc(b?.name)}, both at rank ${FUSION_RANK}.<br>${hlNums(f.def.desc(1))}`)}>
        ${parentHTML(f.a)}<i class="md-fz-op">+</i>${parentHTML(f.b)}<i class="md-fz-op">=</i>
        <span class="cf-socket md-fz-sock is-result" data-el="${f.def.element}">${icon(ICON.skill(f.def.id), { el: f.def.element, fallback: f.def.icon ?? '◆' })}</span>
        <span class="md-fz-txt"><span class="md-fz-name">${esc(f.def.name)}</span>${status}</span></div>`;
    }).join('');
    const more = reach.length > 5 ? `<p class="md-more">+${reach.length - 5} more paths</p>` : '';

    const relics = p.relics.map((r) => `
      <div class="md-relrow" style="--acc:${tagColor(r.tag)};--el:${tagColor(r.tag)}">
        <div class="md-relrow-ico">${icon(ICON.relic(r.id), { fallback: r.icon })}</div>
        <div class="md-relrow-txt"><span class="md-relrow-name">${esc(r.name)}<span class="md-relrow-tag">${tagSigil(r.tag)}<span class="cf-label">${esc(r.tag)}</span></span></span>
          <span class="md-relrow-fx">${hlNums(r.desc)}</span><span class="md-relrow-fl">${esc(r.flavour ?? '')}</span></div></div>`).join('');

    const found = new Set(this.game.codex?.reactions ?? []);
    return `
      <div class="md-build">
        <section class="md-col">
          <h3 class="md-sec"><span>Loadout</span></h3>
          <div class="md-rows">${rows.join('')}</div>
          <h3 class="md-sec"><span>Passives</span><b class="num">${p.passives.size}/${MAX_PASSIVES}</b></h3>
          <div class="md-prows">${pas || '<p class="md-empty">None yet. Passives appear on level-up cards.</p>'}</div>
        </section>
        <section class="md-col md-col-mid">
          <h3 class="md-sec"><span>Reactions</span><b class="num">${found.size}/${Object.keys(REACTIONS).length}</b></h3>
          ${squareHTML(found, 'is-build')}
          <h3 class="md-sec"><span>Fusions in reach</span></h3>
          <div class="md-fzs">${reachRows || `<p class="md-empty">Each fusion needs a specific pair of skills, both at rank ${FUSION_RANK}. Learn one half of a recipe to see it here.</p>`}${more}</div>
        </section>
        <section class="md-col">
          <h3 class="md-sec"><span>Relics</span><b class="num">${p.relics.length}</b></h3>
          <div class="md-relrows">${relics || '<p class="md-empty">None yet. Relic chests drop from elites and bosses.</p>'}</div>
        </section>
      </div>`;
  }

  // ---- codex tab: reactions · fusion recipes · relic grid
  _codexHTML(codex) {
    const T = (h) => this._tip(h);
    const rFound = new Set(codex.reactions ?? []);
    const fFound = new Set(codex.fusions ?? []);
    const relFound = new Set(codex.relics ?? []);
    const reactions = Object.values(REACTIONS);

    const rRows = reactions.map((R) => {
      const on = rFound.has(R.id);
      const pair = R.elements.map((e) => gem(e, 'md-gem')).join('<i class="md-fz-op">+</i>');
      return `<div class="md-rx${on ? '' : ' is-locked'}" style="--rc:${R.color}">
        <span class="md-rx-ico${on ? '' : ' md-sil'}">${icon(ICON.react(R.id), { fallback: '✦' })}</span>
        <span class="md-rx-pair">${pair}</span>
        <span class="md-rx-txt"><span class="md-rx-name">${on ? esc(titleCase(R.name)) : '???'}</span>
        <span class="md-rx-desc">${on ? esc(cap(R.desc.replace(/^[^:]+:\s*/, ''))) : 'Hit a foe with both elements to discover it.'}</span></span></div>`;
    }).join('');

    const fTiles = FUSIONS.map((f) => {
      const on = fFound.has(f.def.id);
      const a = SKILLS[f.a], b = SKILLS[f.b];
      const sock = (id, d, cls = '') => `<span class="cf-socket md-cx-sock${on ? '' : ' md-sil'} ${cls}" data-el="${d?.element ?? ''}">${icon(ICON.skill(id), { el: d?.element ?? '', fallback: d?.icon ?? '◆' })}</span>`;
      const tip = on ? `<b>${esc(f.def.name)}</b> <span class="cf-label">${isActive(f.def) ? 'active' : 'auto'}</span><br>${esc(a?.name)} + ${esc(b?.name)} at rank ${FUSION_RANK}<br>${hlNums(f.def.desc(1))}`
        : `<b>Undiscovered fusion</b><br>A specific pair of skills, both at rank ${FUSION_RANK}. The fusion replaces both.`;
      return `<div class="md-recipe${on ? ' is-found' : ''}" data-el="${f.def.element}"${T(tip)}>
        <div class="md-recipe-eq">${sock(f.a, a)}<i class="md-fz-op">+</i>${sock(f.b, b)}<i class="md-fz-op">=</i>
        ${on ? sock(f.def.id, f.def, 'is-result') : '<span class="cf-socket md-cx-sock is-result is-unknown"><b>?</b></span>'}</div>
        <span class="md-recipe-name">${on ? esc(f.def.name) : '???'}</span></div>`;
    }).join('');

    const relicList = Object.values(RELICS);
    const relTiles = relicList.map((r) => {
      const on = relFound.has(r.id);
      const tip = on ? `<b>${esc(r.name)}</b> <span class="cf-label" style="color:${tagColor(r.tag)}">${esc(r.tag)}</span><br>${hlNums(r.desc)}<br><i class="cf-dim">${esc(r.flavour ?? '')}</i>`
        : '<b>Unknown relic</b><br>Found in relic chests.';
      return `<div class="md-reltile${on ? '' : ' is-locked'}" style="--acc:${tagColor(r.tag)}"${T(tip)}>
        <span class="md-reltile-ico${on ? '' : ' md-sil'}">${icon(ICON.relic(r.id), { fallback: on ? r.icon : '?' })}</span></div>`;
    }).join('');

    const rCount = reactions.filter((R) => rFound.has(R.id)).length;
    const fCount = FUSIONS.filter((f) => fFound.has(f.def.id)).length;
    const relCount = relicList.filter((r) => relFound.has(r.id)).length;

    const ms = this.game.meta?.stats ?? {};
    const recs = [
      [ms.runs ?? 0, 'runs'], [ms.wins ?? 0, 'victories'], [ms.bestAct ? `${ms.bestAct}` : '—', 'best act'],
      [ms.bestChain ?? 0, 'best chain'], [ms.bossKills ?? 0, 'bosses slain'], [(ms.totalKills ?? 0).toLocaleString('en-US'), 'foes slain'],
    ].map(([v, k]) => `<div class="md-rec"><b class="num">${v}</b><span class="cf-label">${k}</span></div>`).join('');

    return `
      <div class="md-codex">
        <section class="md-col">
          <h3 class="md-sec"><span>Reactions</span><b class="num">${rCount}/${reactions.length}</b></h3>
          ${squareHTML(rFound, 'is-codex')}
          <div class="md-rxs">${rRows}</div>
        </section>
        <section class="md-col">
          <h3 class="md-sec"><span>Fusions</span><b class="num">${fCount}/${FUSIONS.length}</b></h3>
          <div class="md-recipes">${fTiles}</div>
          <h3 class="md-sec"><span>Relics</span><b class="num">${relCount}/${relicList.length}</b></h3>
          <div class="md-reltiles">${relTiles}</div>
          <h3 class="md-sec"><span>Records</span></h3>
          <div class="md-recs">${recs}</div>
        </section>
      </div>`;
  }

  dispose() {
    this._unsub.forEach((u) => u?.());
    this._unsub = [];
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('keyup', this._onKeyUp);
    this.hud.dispose();
  }
}
