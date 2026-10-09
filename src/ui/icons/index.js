// =====================================================================================
//  Crownforge icon system. One hidden SVG sprite of <symbol>s is injected once; every icon in
//  the UI is `<svg class="ico"><use href="#i-<id>"/></svg>`. Colours come from CSS custom
//  properties that inherit through <use> (see css/theme.css):
//    --el / --el-lo / --el-hi   element tri-tone (set by data-el="fire" etc. or inline)
//    --metal / --metal-lo / --metal-hi, --glass, --ink, --acc (relic tag accent)
//  Icon sets live in set-*.js (one owner each) and export { '<id>': body } where body is SVG
//  markup on a 48×48 grid, or { vb: 24, body } for 24-grid glyphs.
//  Ids: skill-<skillId> · relic-<relicId> · passive-<id> · attune-<id> · class-<classId>
//       el-<element> · dash-<kind> · buff-<buffId> · react-<reactionId> · status-<id> · ui-<name>
//  Contract for implementers: design/UI.md §Icons.
// =====================================================================================
import SKILL_ICONS from './set-skills.js';
import RELIC_ICONS from './set-relics.js';
import MISC_ICONS from './set-misc.js';
import REACT_ICONS from './set-react.js';
import RAID_ICONS from './set-raid.js';

const SETS = [SKILL_ICONS, RELIC_ICONS, REACT_ICONS, MISC_ICONS, RAID_ICONS];
const REG = new Map();
let injected = false;

for (const set of SETS) {
  for (const [id, v] of Object.entries(set ?? {})) {
    const def = typeof v === 'string' ? { vb: 48, body: v } : { vb: v.vb ?? 48, body: v.body ?? '' };
    if (def.body) REG.set(id, def);
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);

/** Inject the sprite (idempotent). Called by UI on boot; safe to call from dev pages. */
export function ensureIcons(doc = document) {
  if (injected && doc.getElementById('rb-icon-sprite')) return;
  const symbols = [...REG].map(([id, d]) =>
    `<symbol id="i-${id}" viewBox="0 0 ${d.vb} ${d.vb}">${d.body}</symbol>`).join('');
  const wrap = doc.createElement('div');
  wrap.innerHTML = `<svg id="rb-icon-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
    style="position:absolute;width:0;height:0;overflow:hidden" focusable="false"><defs>${symbols}</defs></svg>`;
  doc.body.prepend(wrap.firstElementChild);
  injected = true;
}

export function hasIcon(id) { return REG.has(id); }
export function iconIds() { return [...REG.keys()]; }

/**
 * Icon markup. opts: { cls, el (element name → data-el), title, fallback (glyph text when the
 * icon is missing) }. Missing icons render the fallback glyph in a span with the same class, so
 * the UI never shows an empty hole while a set is incomplete.
 */
export function icon(id, opts = {}) {
  const { cls = '', el = '', title = '', fallback = '' } = opts;
  const elAttr = el ? ` data-el="${esc(el)}"` : '';
  if (!REG.has(id)) {
    return `<span class="ico ico-glyph ${esc(cls)}"${elAttr} aria-hidden="true">${esc(fallback || '◆')}</span>`;
  }
  const t = title ? `<title>${esc(title)}</title>` : '';
  return `<svg class="ico ${esc(cls)}"${elAttr} aria-hidden="${title ? 'false' : 'true'}">${t}<use href="#i-${esc(id)}"/></svg>`;
}

// ---- id helpers so callers never hand-build id strings -----------------------------
export const ICON = {
  skill: (id) => `skill-${id}`,
  relic: (id) => `relic-${id}`,
  passive: (id) => `passive-${id}`,
  attune: (id) => `attune-${id}`,
  cls: (id) => `class-${id}`,
  el: (el) => `el-${el}`,
  dash: (kind) => `dash-${kind}`,
  buff: (id) => `buff-${id}`,
  react: (id) => `react-${id}`,
  status: (id) => `status-${id}`,
  ui: (name) => `ui-${name}`,
};

// Level-up card → icon id (cards come from progression.js: new / rank / fusion / passive / heal).
export function cardIconId(card) {
  if (card.type === 'passive') return ICON.passive(card.id);
  if (card.type === 'heal') return ICON.ui('essence');
  return ICON.skill(card.id);
}
