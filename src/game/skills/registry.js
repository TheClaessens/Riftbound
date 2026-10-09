import { arcaneBolt } from './arcaneBolt.js';
import { cinderBolt } from './cinderBolt.js';
import { iceShard } from './iceShard.js';
import { spark } from './spark.js';
import { fireball } from './fireball.js';
import { frostNova } from './frostNova.js';
import { chainLightning } from './chainLightning.js';
import { spiritOrbs } from './spiritOrbs.js';
import { meteor } from './meteor.js';
import { blizzard } from './blizzard.js';
import { staticField } from './staticField.js';
import { singularity } from './singularity.js';
import { frostfireComet } from './fusions/frostfireComet.js';
import { plasmaOrb } from './fusions/plasmaOrb.js';
import { stormHalo } from './fusions/stormHalo.js';
import { arcaneBarrage } from './fusions/arcaneBarrage.js';
import { absoluteZero } from './fusions/absoluteZero.js';
import { cataclysm } from './fusions/cataclysm.js';
import { thunderhead } from './fusions/thunderhead.js';
import { starfall } from './fusions/starfall.js';
import { hailstorm } from './fusions/hailstorm.js';
import { tempest } from './fusions/tempest.js';

// Class starters: only offered to / owned by their class.
arcaneBolt.classOnly = 'arcanist';
cinderBolt.classOnly = 'pyromancer';
iceShard.classOnly = 'cryomancer';
spark.classOnly = 'stormcaller';

// All learnable base skills (not fusions).
export const SKILLS = Object.fromEntries(
  [arcaneBolt, cinderBolt, iceShard, spark, fireball, frostNova, chainLightning, spiritOrbs, meteor, blizzard, staticField, singularity]
    .map((s) => [s.id, s]),
);

// Fusion recipes: both parents at rank >= FUSION_RANK → gold card. Result takes parent A's slot.
export const FUSION_RANK = 3;
export const FUSIONS = [
  { a: 'fireball', b: 'frostNova', def: frostfireComet },
  { a: 'fireball', b: 'chainLightning', def: plasmaOrb },
  { a: 'chainLightning', b: 'spiritOrbs', def: stormHalo },
  { a: 'frostNova', b: 'singularity', def: absoluteZero },
  { a: 'meteor', b: 'singularity', def: cataclysm },
  { a: 'blizzard', b: 'staticField', def: thunderhead },
  { a: 'arcaneBolt', b: 'spiritOrbs', def: arcaneBarrage },
  { a: 'cinderBolt', b: 'meteor', def: starfall },
  { a: 'iceShard', b: 'blizzard', def: hailstorm },
  { a: 'spark', b: 'staticField', def: tempest },
];
for (const f of FUSIONS) f.def.kind = f.def.kind ?? 'active';

export const ALL_DEFS = { ...SKILLS, ...Object.fromEntries(FUSIONS.map((f) => [f.def.id, f.def])) };

// Passives modify player.stats. apply(stats) is called once per rank on a fresh base.
export const PASSIVES = {
  might:     { id: 'might', name: 'Might', icon: '⚔', maxRank: 5, desc: () => '+12% damage.', apply: (s) => { s.damage += 0.12; } },
  haste:     { id: 'haste', name: 'Haste', icon: '⌛', maxRank: 5, desc: () => '−7% skill cooldowns.', apply: (s) => { s.cdr += 0.07; } },
  swiftness: { id: 'swiftness', name: 'Swiftness', icon: '➶', maxRank: 5, desc: () => '+8% move speed.', apply: (s) => { s.moveSpeed *= 1.08; } },
  vitality:  { id: 'vitality', name: 'Vitality', icon: '♥', maxRank: 5, desc: () => '+20 max HP, +0.4 HP/s regen.', apply: (s) => { s.maxHp += 20; s.regen += 0.4; } },
  magnetism: { id: 'magnetism', name: 'Magnetism', icon: '◎', maxRank: 5, desc: () => '+30% pickup radius, +6% XP.', apply: (s) => { s.pickupRadius *= 1.3; s.xpMult += 0.06; } },
  amplify:   { id: 'amplify', name: 'Amplify', icon: '◉', maxRank: 5, desc: () => '+10% area of effect.', apply: (s) => { s.area += 0.1; } },
  catalyst:  { id: 'catalyst', name: 'Catalyst', icon: '⚗', maxRank: 5, desc: () => '+25% reaction damage.', apply: (s) => { s.reaction += 0.25; } },
  precision: { id: 'precision', name: 'Precision', icon: '✧', maxRank: 5, desc: () => '+6% critical chance.', apply: (s) => { s.crit += 0.06; } },
  volley:    { id: 'volley', name: 'Volley', icon: '⋔', maxRank: 2, desc: () => '+1 projectile on projectile skills.', apply: (s) => { s.projectiles += 1; } },
};

// Every stat the game reads. Classes, attunements, passives, relics and buffs modify a copy.
export const BASE_STATS = {
  damage: 1, cdr: 0, moveSpeed: 6.5, maxHp: 100, regen: 0.3, pickupRadius: 2.6,
  area: 1, projectiles: 0, reaction: 1, crit: 0.05, armor: 0, xpMult: 1,
  // status tuning (relics)
  burnDur: 1, burnDmg: 1, freezeAt: 5, shockDur: 1, shockAmp: 0.2,
  overloadRadius: 1, overloadStun: 0,
  // misc (relics / buffs)
  dashCdr: 0, echo: 0, reactionEcho: 0, chestChoices: 3, reactionXp: 1, dmgTaken: 1,
};
