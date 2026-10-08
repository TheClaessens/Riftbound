import { SKILLS, PASSIVES, FUSIONS, FUSION_RANK } from './skills/registry.js';
import { REACTIONS } from './combat.js';
import { MAX_AUTOS } from './player.js';

const MAX_PASSIVES = 5;

// A card: { type: 'new'|'rank'|'passive'|'fusion'|'heal', id, name, icon, element, rank, desc, hint, recipe? }
// game.run.banished (Set of card ids) are excluded for the rest of the run.
export function rollCards(game, n = 3) {
  const p = game.player;
  const banned = game.run?.banished ?? new Set();
  const pool = [];

  // Fusions are guaranteed when available.
  const fusions = availableFusions(p).filter((r) => !banned.has(r.def.id)).map((recipe) => ({
    type: 'fusion', id: recipe.def.id, name: recipe.def.name, icon: recipe.def.icon, element: recipe.def.element,
    rank: 1, desc: recipe.def.desc(1), recipe,
    hint: `Fuses ${SKILLS[recipe.a].name} + ${SKILLS[recipe.b].name}`,
  }));

  const hasFree = p.freeSlot() >= 0;
  const autoCount = p.autoCount();
  for (const def of Object.values(SKILLS)) {
    if (banned.has(def.id) || p.getSkill(def.id) || consumedByFusion(p, def.id)) continue;
    if (def.classOnly && def.classOnly !== p.classId) continue;
    const needsSlot = p.usesSlot(def);
    if (needsSlot ? !hasFree : autoCount >= MAX_AUTOS) continue;
    pool.push({ w: p.level < 8 ? 1.6 : 1.0, card: { type: 'new', id: def.id, name: def.name, icon: def.icon, element: def.element, rank: 1, desc: def.desc(1), hint: synergyHint(p, def) } });
  }
  for (const s of p.skills) {
    const max = s.def.maxRank ?? 5;
    if (s.rank >= max || banned.has(s.def.id)) continue;
    const w = 1.2 + (s.rank === FUSION_RANK - 1 && fusionPartnerOwned(p, s.def.id) ? 1.2 : 0) + (s.slot === 0 ? 0.3 : 0);
    pool.push({ w, card: { type: 'rank', id: s.def.id, name: s.def.name, icon: s.def.icon, element: s.def.element, rank: s.rank + 1, desc: s.def.desc(s.rank + 1), hint: rankHint(p, s) } });
  }
  for (const def of Object.values(PASSIVES)) {
    const r = p.passives.get(def.id) ?? 0;
    if (r >= def.maxRank || banned.has(def.id)) continue;
    if (r === 0 && p.passives.size >= MAX_PASSIVES) continue;
    pool.push({ w: 0.8, card: { type: 'passive', id: def.id, name: def.name, icon: def.icon, element: 'physical', rank: r + 1, desc: def.desc(r + 1), hint: '' } });
  }

  const out = fusions.slice(0, n);
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let x = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) { x -= pool[idx].w; if (x <= 0) break; }
    out.push(pool.splice(idx, 1)[0].card);
  }
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

function fusionPartnerOwned(p, id) {
  return FUSIONS.some((f) => (f.a === id && p.getSkill(f.b)) || (f.b === id && p.getSkill(f.a)));
}

// Tell the player what a new skill combos with, based on what they own.
function synergyHint(p, def) {
  for (const f of FUSIONS) {
    const other = f.a === def.id ? f.b : f.b === def.id ? f.a : null;
    if (other && p.getSkill(other)) return `Fusion path: + ${SKILLS[other].name} → ${f.def.name}`;
  }
  for (const r of Object.values(REACTIONS)) {
    if (!r.elements.includes(def.element)) continue;
    const otherEl = r.elements.find((e) => e !== def.element);
    if (p.skills.some((s) => s.def.element === otherEl)) return `Reacts with your ${otherEl}: ${r.name}`;
  }
  return def.hint ?? '';
}

function rankHint(p, s) {
  if (s.rank + 1 === FUSION_RANK) {
    for (const f of FUSIONS) {
      const other = f.a === s.def.id ? f.b : f.b === s.def.id ? f.a : null;
      if (other && p.skillRank(other) >= FUSION_RANK) return `Unlocks FUSION: ${f.def.name}!`;
      if (other && p.getSkill(other)) return `Fusion path → ${f.def.name}`;
    }
  }
  return '';
}
