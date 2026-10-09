import * as THREE from 'three';
import * as FIRE from './hero/fire.js';
import * as FROST from './hero/frost.js';
import * as STORM from './hero/storm.js';
import * as ARCANE from './hero/arcane.js';

// =====================================================================================
//  Hero visuals dispatcher (orchestrator-owned). player.js calls these hooks, and they forward to
//  the per-element modules in vfx/hero/*.js (one owner each). Visual only: never deal damage or
//  change player state here. World points on the hero: player.muzzle(out), player.hand(out),
//  player.model.emitter(name, out).
// =====================================================================================

const BY_DASH = { flame: FIRE, frost: FROST, storm: STORM, blink: ARCANE };
const BY_CLASS = { pyromancer: FIRE, cryomancer: FROST, stormcaller: STORM, arcanist: ARCANE };
const BY_EL = { fire: FIRE, frost: FROST, storm: STORM, arcane: ARCANE };
const _hand = new THREE.Vector3();

export const HERO_FX = {
  dashStart(game, player, kind, from) { BY_DASH[kind]?.dashStart(game, player, from); },
  dashTrail(game, player, kind, dir) { BY_DASH[kind]?.dashTrail(game, player, dir); },
  dashHit(game, player, kind, enemy) { BY_DASH[kind]?.dashHit(game, player, enemy); },
  firePatchStart(game, patch) { FIRE.firePatchStart(game, patch); },
  firePatchUpdate(game, patch, dt) { FIRE.firePatchUpdate(game, patch, dt); },
  firePatchEnd(game, patch) { FIRE.firePatchEnd(game, patch); },
  wildfire(game, pos, r) { FIRE.wildfire(game, pos, r); },
  armorGain(game, player, count) { FROST.armorGain(game, player, count); },
  armorBreak(game, player) { FROST.armorBreak(game, player); },
  perfectDodge(game, player) { ARCANE.perfectDodge(game, player); },
  // A slotted skill was cast (player.js, after def.cast). Point = the hand / focus that fired it.
  cast(game, player, def, slot) {
    const m = BY_EL[def.element];
    if (!m?.castFlash) return;
    m.castFlash(game, player, def, slot, slot === 0 ? player.hand(_hand) : player.muzzle(_hand));
  },
  // A shield (Aegis shrine) fully absorbed a hit.
  shieldBlock(game, player) {
    game.fx.ring(player.pos, { color: 0xffe9a0, radius: 1.3, life: 0.25 });
  },
  // The hero died: the rig kneels, slumps and is recalled into the Rift (k 0.75–1 of 1.4 s).
  death(game, player) {
    game.fx.burst(player.pos, { color: player.cls.hex, count: 40, speed: 6, life: 0.9, size: 0.45, up: 1.5, gravity: 4 });
  },
  // Every frame while playing: class idle FX + class-independent (Adrenaline, …).
  update(game, player, dt) {
    BY_CLASS[player.classId]?.idle(game, player, dt);
    ARCANE.anyClass(game, player, dt);
  },
};
