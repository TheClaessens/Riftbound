// =====================================================================================
//  Persistent meta progression: Rift Shards, Attunements, class unlocks, codex, tiers.
// =====================================================================================
import { CLASSES } from './classes.js';

const KEY = 'riftbound.meta.v1';
const OLD_CODEX_KEY = 'riftbound.codex.v1';

export const ATTUNEMENTS = {
  might:     { id: 'might', name: 'Might', icon: '⚔', max: 5, desc: '+4% damage per rank', apply: (s, r) => { s.damage += 0.04 * r; } },
  vigor:     { id: 'vigor', name: 'Vigor', icon: '♥', max: 5, desc: '+8 max HP per rank', apply: (s, r) => { s.maxHp += 8 * r; } },
  insight:   { id: 'insight', name: 'Insight', icon: '◈', max: 5, desc: '+5% XP per rank', apply: (s, r) => { s.xpMult += 0.05 * r; } },
  swiftcast: { id: 'swiftcast', name: 'Swiftcast', icon: '⌛', max: 5, desc: '−3% cooldowns per rank', apply: (s, r) => { s.cdr += 0.03 * r; } },
  fortune:   { id: 'fortune', name: 'Fortune', icon: '⟳', max: 3, desc: '+1 level-up reroll per rank', apply: () => {} },
  exile:     { id: 'exile', name: 'Exile', icon: '⊘', max: 3, desc: '+1 level-up banish per rank', apply: () => {} },
};
export const attuneCost = (nextRank) => 20 * nextRank;

function fresh() {
  return {
    v: 1, shards: 0,
    attune: Object.fromEntries(Object.keys(ATTUNEMENTS).map((k) => [k, 0])),
    unlocked: { pyromancer: true },
    codex: { reactions: [], fusions: [], relics: [] },
    stats: { runs: 0, wins: 0, bestAct: 0, bossKills: 0, wardenKills: 0, totalKills: 0, bestChain: 0 },
    maxTier: 0, lastClass: 'pyromancer', lastTier: 0,
    unlockAll: false,   // player setting: every class and Rift Tier playable; earned progress is kept separately
    shake: 1,           // player setting: screen shake 1 full, 0.5 reduced, 0 off
    tutorialDone: false, // the Rift Primer (first-run tutorial) has been completed or skipped
    tips: [],           // contextual one-time hints already shown (tutorial.js)
  };
}

export const MAX_TIER = 5;

// Read unlocks through these so the "Unlock all" setting can be switched off without losing real progress.
export const isUnlocked = (meta, id) => !!CLASSES[id] && (!!meta?.unlockAll || !!meta?.unlocked?.[id]);
export const maxTierOf = (meta) => (meta?.unlockAll ? MAX_TIER : (meta?.maxTier ?? 0));

export function loadMeta() {
  let m = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === 1) {
      m = { ...m, ...raw, attune: { ...m.attune, ...raw.attune }, codex: { ...m.codex, ...raw.codex }, stats: { ...m.stats, ...raw.stats } };
      // Saves from before the Pyromancer became the starter class: it is free, and veterans skip the primer.
      m.unlocked = { ...raw.unlocked, pyromancer: true };
      if (raw.tutorialDone === undefined && m.stats.runs > 0) m.tutorialDone = true;
    }
    else {
      const old = JSON.parse(localStorage.getItem(OLD_CODEX_KEY));
      if (old?.reactions) { m.codex.reactions = old.reactions; m.codex.fusions = old.fusions ?? []; }
    }
  } catch { /* storage unavailable */ }
  if (typeof location !== 'undefined' && (/[?&]unlockall\b/.test(location.search) || location.hash === '#unlockall')) {
    m.unlockAll = true;
  }
  return m;
}

export function saveMeta(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

export function applyAttunements(stats, meta) {
  for (const [id, r] of Object.entries(meta.attune)) if (r > 0) ATTUNEMENTS[id]?.apply(stats, r);
}

export function buyAttunement(meta, id) {
  const def = ATTUNEMENTS[id];
  const r = meta.attune[id] ?? 0;
  if (!def || r >= def.max) return false;
  const cost = attuneCost(r + 1);
  if (meta.shards < cost) return false;
  meta.shards -= cost;
  meta.attune[id] = r + 1;
  saveMeta(meta);
  return true;
}

// Chain pays up to CHAIN_SHARD_CAP / 10 shards: uncapped, dense hordes held the Chain for
// thousands of reactions and it became ~46% of a run's shards (playtest round 1).
export const CHAIN_SHARD_CAP = 300;

// Rift Obelisk payouts (design/RAID_PASSES.md Pass 1 §6) are capped at 60% of the run's base shards and
// added BEFORE the tier multiplier.
export const OBELISK_SHARD_CAP = 0.6;

// Base run shards before the tier multiplier.
export function baseShards(rs) {
  const chain = Math.min(rs.maxChain, CHAIN_SHARD_CAP);
  return Math.floor(rs.kills / 30) + 15 * rs.actsReached + 40 * rs.bossesKilled + Math.floor(chain / 10);
}
// The part of rs.bonusShards (obelisk payouts; missing = 0) that counts after the cap.
export function bonusShardsPaid(rs) {
  return Math.min(Math.max(0, Math.round(rs.bonusShards ?? 0)), Math.floor(OBELISK_SHARD_CAP * baseShards(rs)));
}

// runStats: { kills, actsReached (1..3), bossesKilled, maxChain, victory, tier, bonusShards? }
export function computeShards(rs) {
  return Math.round((baseShards(rs) + bonusShardsPaid(rs)) * (1 + 0.25 * (rs.tier ?? 0)));
}

// Returns ids of classes whose unlock condition is satisfied but not yet unlocked.
export function checkUnlocks(meta) {
  const out = [];
  const cond = {
    killWarden: meta.stats.wardenKills > 0,
    reactions4: meta.codex.reactions.length >= 4,
    reachAct3: meta.stats.bestAct >= 3,
  };
  for (const c of Object.values(CLASSES)) {
    if (meta.unlocked[c.id] || !c.unlock) continue;
    if (cond[c.unlock.id]) { meta.unlocked[c.id] = true; out.push(c.id); }
  }
  return out;
}

// Called once at run end. Mutates + saves meta. Returns { shards, unlocks, tierUnlocked }.
export function recordRun(meta, rs) {
  const shards = computeShards(rs);
  meta.shards += shards;
  meta.stats.runs++;
  meta.stats.totalKills += rs.kills;
  meta.stats.bestAct = Math.max(meta.stats.bestAct, rs.actsReached);
  meta.stats.bossKills += rs.bossesKilled;
  meta.stats.bestChain = Math.max(meta.stats.bestChain, rs.maxChain);
  if (rs.wardenKilled) meta.stats.wardenKills++;
  let tierUnlocked = null;
  if (rs.victory) {
    meta.stats.wins++;
    if ((rs.tier ?? 0) >= meta.maxTier && meta.maxTier < MAX_TIER) { meta.maxTier = (rs.tier ?? 0) + 1; tierUnlocked = meta.maxTier; }
  }
  const unlocks = checkUnlocks(meta);
  saveMeta(meta);
  return { shards, unlocks, tierUnlocked, obeliskShards: bonusShardsPaid(rs) };   // obeliskShards: paid after the 60% cap, before the tier multiplier
}
