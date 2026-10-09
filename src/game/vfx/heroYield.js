// =====================================================================================
//  Own-VFX yield around the hero (playtest round 1, issue #3: "protect a readable bubble").
//  Every game.vfx system (= the player's own spells, reactions and statuses; hostile projectiles and
//  telegraphs never use game.vfx) multiplies its alpha by heroYield(viewPos): ~60 % fainter at the hero,
//  back to full by ~3 m on screen. Strength follows spawn pressure (vfx.heat), so a calm frame, idle
//  element FX and a lone cast are untouched; it only bites when the screen is busy.
//
//    uHeroView  = hero chest in view space (xyz), w = 1 when there is a hero      (vfx.uHeroView)
//    uHeroYield = (r0, r1 view-space metres, alpha floor at the hero, strength)  (vfx.uHeroYield)
//  heroYieldGround(): milder version for ground layers (decals, ground rings) that never cover the hero.
// =====================================================================================

// alpha ×0.35 within r0 of the hero on screen, ×~0.75 at 2.5 m, full beyond r1. heat: calm play with idle FX
// and a starter measures 6–30, peak fights 340–700.
export const HERO_YIELD = { r0: 1.3, r1: 3.4, floor: 0.35, heatLo: 70, heatHi: 240 };

export const HERO_YIELD_GLSL = /* glsl */`
  uniform vec4 uHeroView;
  uniform vec4 uHeroYield;
  float heroYield(vec3 pv) {
    if (uHeroView.w < 0.5 || uHeroYield.w < 0.001) return 1.0;
    float d = length(pv.xy - uHeroView.xy);
    return 1.0 - uHeroYield.w * (1.0 - uHeroYield.z) * (1.0 - smoothstep(uHeroYield.x, uHeroYield.y, d));
  }
  float heroYieldGround(vec3 pv) { return mix(1.0, heroYield(pv), 0.6); }`;
