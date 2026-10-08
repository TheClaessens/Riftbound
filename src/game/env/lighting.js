import * as THREE from 'three';
import { applyEnvSettings } from './common.js';

// =====================================================================================
//  Biome lighting glue. Lights themselves live in Engine (sun = engine.moon DirectionalLight,
//  engine.hemi HemisphereLight; never added/removed at runtime). A biome's `atmos` block is the
//  Engine.setAtmosphere() format; its `env` block goes to applyEnvSettings (haze, clouds, wind).
//
//  Value budget (design/research/04 §5): bloom = peak channel > 1.1 BEFORE exposure. Flat sunlit
//  ground radiance ≈ albedo_lin × (sun·sin(elev)·lum(sunCol) + hemi·lum(sky)) / π. Keep the env
//  peak channel ≲ 0.75 pre-exposure: ground albedo ≤ ~0.55 linear per channel, foliage ≤ ~0.6.
// =====================================================================================

/** Apply a biome's atmosphere (lights, background, grade), env uniforms and creature rim colour. */
export function applyBiomeAtmos(engine, biome, seconds = 0, creatures = null) {
  if (biome.atmos) engine.setAtmosphere(biome.atmos, seconds);
  applyEnvSettings(biome.env ?? {});
  if (creatures && biome.rim) creatures.setRim(biome.rim[0], biome.rim[1]);
}

/** Luminance-normalised HDR colour (for anything that should bloom on purpose). */
export function hdrColor(hex, targetPeak = 1.5) {
  const c = new THREE.Color(hex);
  const m = Math.max(c.r, c.g, c.b, 1e-3);
  return c.multiplyScalar(targetPeak / m);
}
