// =====================================================================================
//  BOSS CREATURES  (design/research/03-creature-art.md §4.7, §5.7, §6.7 · design/ART.md)
//    hollowWarden → Gorrak, the Troll King      (club on the shoulder, antler crown, spore pods)
//    vashkar      → Vashkar, the Ashen Warchief (skull pauldrons, twin banners, molten greataxe)
//    riftHeart    → Aurelith, the Prism Dragon  (four legs, wings, ward-tinted prism crystals)
//
//  Animation model. Every boss pose is a crossfade of
//    base     : idle / locomotion (+ the resting "carry" of the weapon)
//    action   : h.action at h.k (0..1 over the action's duration; bosses.js drives it, see ACT tables)
//    previous : h.prevAction frozen at h.prevK, fading out with h.blend (1 → 0) when an action
//               interrupts / chains into another one (bosses.js sets these)
//  Action poses are absolute keyframe tracks (relative to the authored rest pose), so the weights
//  always sum to 1 and every transition is continuous. Small additive layers (breathing, hit
//  recoil, pod heartbeat, cloth sway) go on top.
//  Extra handle fields read here: h.rage (phase 2, 0/1), h.dur (duration override for k),
//  h.flapK (dragon hover layer 0..1, or < 0 when idle).
// =====================================================================================

import { gorrak, GORRAK_PODS } from './bosses/gorrak.js';
import { vashkar, VASHKAR_AXE_DRAG } from './bosses/vashkar.js';
import { aurelith, AURELITH_MOUTH, AURELITH_TAIL } from './bosses/aurelith.js';

export { GORRAK_PODS, VASHKAR_AXE_DRAG, AURELITH_MOUTH, AURELITH_TAIL, gorrak, vashkar, aurelith };

export const BOSS_REGISTER = { hollowWarden: gorrak, vashkar, riftHeart: aurelith };
