import { testBiped } from './test.js';
import { REGISTER as greenskins } from './greenskins.js';
import { REGISTER as warband } from './warband.js';
import { REGISTER as wyrmkin } from './wyrmkin.js';
import { BOSS_REGISTER } from './bossModels.js';

// =====================================================================================
//  Enemy type id (enemies.js ENEMY_TYPES) → creature definition (rig + model + animation).
// =====================================================================================

const REGISTRY = { ...greenskins, ...warband, ...wyrmkin };

export function creatureFor(typeId) {
  return REGISTRY[typeId] ?? testBiped;
}

export function bossCreatureFor(bossId) {
  return BOSS_REGISTER[bossId] ?? null;
}

export function allCreatureDefs() {
  return [...new Set([...Object.values(REGISTRY), ...Object.values(BOSS_REGISTER)])];
}
