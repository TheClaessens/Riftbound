// =====================================================================================
//  Bosses facade (v5). createBoss(game, id, pos, opts) → a raid-encounter boss script
//  (src/game/bosses/<boss>.js on BossBase, design/RAID.md); ids without a v5 script fall back to
//  the v4 boss (bosses/legacy.js). opts: { hpMult, damageScale, final, echo, affixes }
// =====================================================================================
import { Gorrak } from './bosses/gorrak.js';
import { Vashkar } from './bosses/vashkar.js';
import { Aurelith } from './bosses/aurelith.js';
import { createBoss as createLegacyBoss } from './bosses/legacy.js';

export { AFFIXES, AFFIX_IDS } from './bosses/affixes.js';
export const WARD_CYCLE = 10;   // seconds per Prism Ward element (HUD reads boss.wardT against boss.wardCycle ?? this)

const SCRIPTS = { hollowWarden: Gorrak, vashkar: Vashkar, riftHeart: Aurelith };

export function createBoss(game, id, pos, opts = {}) {
  const S = SCRIPTS[id];
  if (S && S.ready !== false) return new S(game, pos, opts);
  return createLegacyBoss(game, id, pos, opts);
}
