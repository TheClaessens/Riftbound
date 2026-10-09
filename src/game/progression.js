import { SKILLS, PASSIVES, FUSIONS, FUSION_RANK } from './skills/registry.js';
import { REACTIONS } from './combat.js';
import { MAX_AUTOS } from './player.js';

const MAX_PASSIVES = 5;
const FUSION_BIAS = 2;        // a new skill that completes a recipe (other parent owned) weighs 2x ...
const FUSION_BIAS_LVL = 8;    // ... from this level on. Every starter is a fusion parent, so an early
                              // bias funnelled drafts into L6-8 fusions that ate the starter and left
                              // 2-3 skills at L12 (bot A/B, Stormcaller: 5.0 -> 2.15 skills).
const ELEMENT_GUARANTEE_LVL = 3;

// A card: { type: 'new'|'rank'|'passive'|'fusion'|'heal', id, name, icon, element, rank, desc, hint, recipe? }
// game.run.banished (Set of card ids) are excluded for the rest of the run: as cards, as rank-ups,
// and as fusion parents (a recipe with a banished parent that cannot reach FUSION_RANK is dead:
// no hint, no bias, no pity for it).
//
// Draft rules (playtest round 1, #9):
//  - pity:  every hand holds a card that advances the build (rank-up, missing fusion parent, fusion)
//           while one exists, and never only passives / heal while an active skill is on offer;
//  - guarantee: by level 3 the hand holds a non-starter skill of the class element (once per run);
//  - bias:  new skills that complete a recipe weigh FUSION_BIAS x.
export function rollCards(game, n = 3) {
  const p = game.player;
  const run = game.run;
  const banned = run?.banished ?? new Set();
  const draft = run ? (run.draft ??= { elemSeen: false }) : { elemSeen: false };
  // multi-pick: every hand of a burst is dealt at the level it grants
  const lvl = p.level - Math.max(0, (game.pendingLevelUps ?? 0) - 1);
  const pool = [];
  const advancing = new Set();      // ids of pool cards that move the build forward

  // Fusions are guaranteed when available.
  const fusions = availableFusions(p).filter((r) => !banned.has(r.def.id)).map((recipe) => ({
    type: 'fusion', id: recipe.def.id, name: recipe.def.name, icon: recipe.def.icon, element: recipe.def.element,
    rank: 1, desc: recipe.def.desc(1), recipe,
    hint: `Fuses ${SKILLS[recipe.a].name} + ${SKILLS[recipe.b].name} · replaces both`,
  }));

  const hasFree = p.freeSlot() >= 0;
  const autoCount = p.autoCount();
  for (const def of Object.values(SKILLS)) {
    if (banned.has(def.id) || p.getSkill(def.id) || consumedByFusion(p, def.id)) continue;
    if (def.classOnly && def.classOnly !== p.classId) continue;
    const needsSlot = p.usesSlot(def);
    if (needsSlot ? !hasFree : autoCount >= MAX_AUTOS) continue;
    const completes = completesRecipe(p, def.id, banned);
    if (completes) advancing.add(def.id);
    pool.push({ w: (lvl < 8 ? 1.6 : 1.0) * (completes && lvl >= FUSION_BIAS_LVL ? FUSION_BIAS : 1), card: { type: 'new', id: def.id, name: def.name, icon: def.icon, element: def.element, rank: 1, desc: def.desc(1), hint: synergyHint(p, def, banned) } });
  }
  for (const s of p.skills) {
    const max = s.def.maxRank ?? 5;
    if (s.rank >= max || banned.has(s.def.id)) continue;
    const w = 1.2 + (s.rank === FUSION_RANK - 1 && fusionPartnerOwned(p, s.def.id, banned) ? 1.2 : 0) + (s.slot === 0 ? 0.3 : 0);
    advancing.add(s.def.id);
    pool.push({ w, card: { type: 'rank', id: s.def.id, name: s.def.name, icon: s.def.icon, element: s.def.element, rank: s.rank + 1, desc: s.def.desc(s.rank + 1), hint: rankHint(p, s, banned) } });
  }
  for (const def of Object.values(PASSIVES)) {
    const r = p.passives.get(def.id) ?? 0;
    if (r >= def.maxRank || banned.has(def.id)) continue;
    if (r === 0 && p.passives.size >= MAX_PASSIVES) continue;
    pool.push({ w: 0.8, card: { type: 'passive', id: def.id, name: def.name, icon: def.icon, element: 'physical', rank: r + 1, desc: def.desc(r + 1), hint: '' } });
  }

  const draw = (list) => {
    const total = list.reduce((a, b) => a + b.w, 0);
    let x = Math.random() * total;
    let idx = 0;
    for (; idx < list.length - 1; idx++) { x -= list[idx].w; if (x <= 0) break; }
    return list[idx];
  };
  const take = (entry) => { pool.splice(pool.indexOf(entry), 1); out.push(entry.card); return entry; };

  const out = fusions.slice(0, n);
  const locked = new Set();         // cards the pity pass must not swap out

  // Starter-element guarantee: a non-starter skill of the class element by L3 (once per run).
  const el = p.cls?.element;
  const isElemNew = (e) => e.card.type === 'new' && e.card.element === el;
  if (!draft.elemSeen && p.skills.some((s) => s.def.element === el && s.def.id !== p.cls?.starter)) draft.elemSeen = true;
  if (!draft.elemSeen && lvl >= ELEMENT_GUARANTEE_LVL && out.length < n) {
    const cands = pool.filter(isElemNew);
    if (cands.length) locked.add(take(draw(cands)).card);
  }

  while (out.length < n && pool.length) take(draw(pool));

  // Pity 1: something that advances the build. Swap out the weakest non-locked card.
  // Any new skill counts too: counting only rank-ups / recipe parents made pity swap rank-ups into
  // hands of fresh skills, which narrowed builds to 2-3 skills by L12 (bot A/B).
  const isAdv = (c) => c.type === 'fusion' || c.type === 'new' || (c.type === 'rank' && advancing.has(c.id));
  const swapIn = (cands) => {
    if (!cands.length) return;
    const rank = (c) => (c.type === 'heal' ? 0 : c.type === 'passive' ? 1 : 2);
    let slot = -1;
    for (let i = 0; i < out.length; i++) {
      if (locked.has(out[i]) || out[i].type === 'fusion') continue;
      if (slot < 0 || rank(out[i]) < rank(out[slot])) slot = i;
    }
    if (slot < 0) return;
    const pick = draw(cands);
    pool.splice(pool.indexOf(pick), 1);
    out[slot] = pick.card;
  };
  if (pool.length && !out.some(isAdv)) swapIn(pool.filter((e) => advancing.has(e.card.id) && e.card.type !== 'passive'));
  // Pity 2: never a hand of only passives / heal while an active skill is on offer.
  if (pool.length && out.length && out.every((c) => c.type === 'passive' || c.type === 'heal')) swapIn(pool.filter((e) => e.card.type === 'new' || e.card.type === 'rank'));

  if (out.some((c) => c.type === 'new' && c.element === el)) draft.elemSeen = true;
  while (out.length < n) out.push({ type: 'heal', id: 'heal-' + out.length, name: 'Rift Essence', icon: '✚', element: 'physical', rank: 0, desc: 'Restore 40% HP.', hint: '' });
  return out;
}

export function applyCard(game, card) {
  const p = game.player;
  switch (card.type) {
    case 'new': p.learnSkill(SKILLS[card.id]); break;
    case 'rank': p.rankUpSkill(card.id); break;
    case 'passive': p.learnPassive(card.id); break;
    case 'fusion': p.fuse(card.recipe); break;
    case 'heal': p.heal(p.stats.maxHp * 0.4); break;
  }
}

export function availableFusions(p) {
  return FUSIONS.filter((f) => p.skillRank(f.a) >= FUSION_RANK && p.skillRank(f.b) >= FUSION_RANK && !p.getSkill(f.def.id));
}

function consumedByFusion(p, id) {
  return FUSIONS.some((f) => (f.a === id || f.b === id) && p.getSkill(f.def.id));
}

// Can this parent still reach FUSION_RANK? (a banished, under-ranked or consumed parent cannot)
function parentLive(p, id, banned) {
  if (p.skillRank(id) >= FUSION_RANK) return true;
  if (banned.has(id)) return false;
  if (p.getSkill(id)) return true;
  const def = SKILLS[id];
  return !!def && !(def.classOnly && def.classOnly !== p.classId) && !consumedByFusion(p, id);
}

// Recipes touching `id` whose result is open, both parents can still get there, and the other parent is owned.
function livePairs(p, id, banned) {
  const out = [];
  for (const f of FUSIONS) {
    const other = f.a === id ? f.b : f.b === id ? f.a : null;
    if (!other || !p.getSkill(other) || p.getSkill(f.def.id) || banned.has(f.def.id)) continue;
    if (parentLive(p, id, banned) && parentLive(p, other, banned)) out.push({ f, other });
  }
  return out;
}

function completesRecipe(p, id, banned) { return livePairs(p, id, banned).length > 0; }
function fusionPartnerOwned(p, id, banned) { return livePairs(p, id, banned).length > 0; }

// Tell the player what a new skill combos with, based on what they own.
function synergyHint(p, def, banned) {
  const pair = livePairs(p, def.id, banned)[0];
  if (pair) return `Fusion path: + ${SKILLS[pair.other].name}, both rank ${FUSION_RANK} → ${pair.f.def.name}`;
  for (const r of Object.values(REACTIONS)) {
    if (!r.elements.includes(def.element)) continue;
    const otherEl = r.elements.find((e) => e !== def.element);
    if (p.skills.some((s) => s.def.element === otherEl)) return `Reacts with your ${otherEl}: ${r.name}`;
  }
  return def.hint ?? '';
}

function rankHint(p, s, banned) {
  if (s.rank + 1 === FUSION_RANK) {
    for (const { f, other } of livePairs(p, s.def.id, banned)) {
      // name the partner and its rank: players read "Fusion path" as "any two skills at rank 3"
      if (p.skillRank(other) >= FUSION_RANK) return `Unlocks FUSION: ${f.def.name} at your next level-up!`;
      return `Fusion path: ${SKILLS[other].name} r${p.skillRank(other)}/${FUSION_RANK} → ${f.def.name}`;
    }
  }
  return '';
}

// Wrath Cache (obelisks.js, Heat 2): a hand of "+1 rank to a skill you own" cards. Skills first (random),
// then owned passives, then Rift Essence; banished ids are skipped. Apply the pick with applyCard().
export function rollRankCards(game, n = 3) {
  const p = game.player;
  const banned = game.run?.banished ?? new Set();
  const cards = [];
  const skills = p.skills.filter((s) => s.rank < (s.def.maxRank ?? 5) && !banned.has(s.def.id));
  for (let i = skills.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [skills[i], skills[j]] = [skills[j], skills[i]]; }
  for (const s of skills.slice(0, n)) {
    cards.push({ type: 'rank', id: s.def.id, name: s.def.name, icon: s.def.icon, element: s.def.element, rank: s.rank + 1, desc: s.def.desc(s.rank + 1), hint: rankHint(p, s, banned) || 'Wrath Cache: +1 rank' });
  }
  if (cards.length < n) {
    for (const def of Object.values(PASSIVES)) {
      const r = p.passives.get(def.id) ?? 0;
      if (cards.length >= n) break;
      if (r === 0 || r >= def.maxRank || banned.has(def.id)) continue;
      cards.push({ type: 'passive', id: def.id, name: def.name, icon: def.icon, element: 'physical', rank: r + 1, desc: def.desc(r + 1), hint: 'Wrath Cache: +1 rank' });
    }
  }
  while (cards.length < n) cards.push({ type: 'heal', id: 'heal-' + cards.length, name: 'Rift Essence', icon: '✚', element: 'physical', rank: 0, desc: 'Restore 40% HP.', hint: '' });
  return cards;
}
