// =====================================================================================
//  The three Acts of a run. Data only; read by game.js (flow), spawner.js (rosters,
//  scaling), world.js (biome, hazards, geodes) and the UI (names).
// =====================================================================================

export const ACT_LENGTH = 180;       // seconds of horde before the boss
export const SHIFT_DURATION = 2.5;   // Rift Shift transition

export const ACTS = [
  {
    index: 0, id: 'verge', numeral: 'I', name: 'The Hollow Verge', faction: 'hollow', factionName: 'The Hollow',
    flavour: 'Where the first shard fell, the dead forgot how to rest.',
    boss: 'hollowWarden', bossName: 'The Hollow Warden',
    hp: 1, dmg: 1, xp: 1, rateBase: 2.4, rateRamp: 1.5,
    resist: null, wardChance: 0,
    hazard: null, geodes: ['arcane', 'frost'],
    color: '#c08cff',
    roster: [
      { type: 'husk', w: 6, from: 0 },
      { type: 'imp', w: 3, from: 20 },
      { type: 'bloater', w: 1.5, from: 50 },
      { type: 'spitter', w: 1.0, from: 70 },
      { type: 'brute', w: 1, from: 100 },
    ],
    swarmer: 'imp',
  },
  {
    index: 1, id: 'cinder', numeral: 'II', name: 'The Cinder Wastes', faction: 'ashborn', factionName: 'The Ashborn',
    flavour: 'The second shard burned the sea to glass.',
    boss: 'vashkar', bossName: 'Vashkar, the Cinder Colossus',
    hp: 2.6, dmg: 1.45, xp: 1.7, rateBase: 3.8, rateRamp: 1.9,
    resist: { fire: 0.5 }, wardChance: 0,
    hazard: 'lava', geodes: ['frost', 'storm'],
    color: '#ff7a33',
    roster: [
      { type: 'ashHusk', w: 5, from: 0 },
      { type: 'cinderling', w: 3, from: 0 },
      { type: 'emberSpitter', w: 1.5, from: 20 },
      { type: 'pyreBomber', w: 1.5, from: 35 },
      { type: 'magmaRam', w: 1.2, from: 60 },
      { type: 'obsidianBrute', w: 1, from: 90 },
    ],
    swarmer: 'cinderling',
  },
  {
    index: 2, id: 'crown', numeral: 'III', name: 'The Shattered Crown', faction: 'riftborn', factionName: 'The Riftborn',
    flavour: 'Here the crown broke. Here it still screams.',
    boss: 'riftHeart', bossName: 'The Rift Heart',
    hp: 6.5, dmg: 2.0, xp: 2.6, rateBase: 5.0, rateRamp: 2.2,
    resist: null, wardChance: 0.12,
    hazard: 'lightning', geodes: ['arcane', 'fire', 'frost', 'storm'],
    color: '#9ff3ff',
    roster: [
      { type: 'shardling', w: 4, from: 0 },
      { type: 'wraith', w: 2, from: 0 },
      { type: 'voidSpitter', w: 1.5, from: 15 },
      { type: 'crystalRam', w: 1.2, from: 30 },
      { type: 'prismHexer', w: 0.8, from: 50 },
      { type: 'colossus', w: 1, from: 80 },
    ],
    swarmer: 'shardling',
  },
];

// Scaling helpers (m = act minutes elapsed).
export function enemyHpMult(act, actTime, tier = 0) {
  const m = actTime / 60;
  return ACTS[act].hp * (1 + 0.35 * m + 0.06 * m * m) * (1 + 0.3 * tier);
}
export function enemyDmgMult(act, actTime, tier = 0) {
  const m = actTime / 60;
  return ACTS[act].dmg * (1 + 0.1 * m) * (1 + 0.12 * tier);
}
export function spawnRate(act, actTime) {
  const a = ACTS[act];
  return a.rateBase + a.rateRamp * (actTime / 60);
}

export const BOSS_HP = { hollowWarden: 8000, vashkar: 20000, riftHeart: 60000 };
