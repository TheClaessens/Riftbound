import * as THREE from 'three';
import { ENV, mulberry32 } from './common.js';

// =====================================================================================
//  Ambient motes: one THREE.Points per layer living in a camera-following window (like the
//  grass), fully animated in the vertex shader (no per-frame CPU work besides two uniforms).
//    kind 'dot'  : soft round specks (pollen, dust, seeds), additive or normal blending
//    kind 'leaf' : tumbling leaf-shaped sprites that fall and drift with the wind (normal blending)
//    kind 'butterfly': flapping two-lobed sprites wandering low over the grass (normal blending)
// =====================================================================================

const VS = /* glsl */`
uniform float uTime, uPPU, uSize, uFall, uRise, uHeight, uWindStrength;
uniform vec2 uCenter, uWindow, uAxisU, uAxisV, uDrift, uWindDir;
attribute vec4 aRand;
varying float vA;
varying float vRot;
varying vec3 vTint;
uniform vec3 uColorA, uColorB;
void main() {
  vec2 off = position.xz * uWindow;
  vec2 drift = (uDrift + uWindDir * uWindStrength * 0.8) * uTime * (0.6 + 0.8 * aRand.x);
  vec2 wob = vec2(sin(uTime * 0.7 + aRand.y * 40.0), cos(uTime * 0.53 + aRand.z * 40.0)) * 0.7;
#ifdef MOTE_BUTTERFLY
  wob = vec2(sin(uTime * 0.45 + aRand.y * 40.0) + sin(uTime * 1.3 + aRand.x * 9.0) * 0.4,
             cos(uTime * 0.37 + aRand.z * 40.0) + cos(uTime * 1.1 + aRand.w * 9.0) * 0.4) * 2.5;
#endif
  vec2 o = off + vec2(dot(drift, uAxisU), dot(drift, uAxisV)) + wob;
  vec2 fc = vec2(dot(uCenter, uAxisU), dot(uCenter, uAxisV));
  vec2 q = o + uWindow * floor((fc - o) / uWindow + 0.5);
  vec2 w = q.x * uAxisU + q.y * uAxisV;
  float cyc = fract(position.y + uTime * (uRise - uFall) / uHeight * (0.7 + 0.6 * aRand.w));
  float y = 0.25 + cyc * uHeight + sin(uTime * 0.9 + aRand.x * 30.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(w.x, y, w.y, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPPU * (0.6 + 0.8 * aRand.y);
  float edge = smoothstep(0.0, 0.12, cyc) * (1.0 - smoothstep(0.85, 1.0, cyc));
  vA = edge * (0.55 + 0.45 * sin(uTime * (1.5 + aRand.z * 2.0) + aRand.x * 20.0));
  vRot = uTime * (1.0 + aRand.z * 3.0) * (aRand.w > 0.5 ? 1.0 : -1.0) + aRand.y * 6.28;
  vTint = mix(uColorA, uColorB, aRand.w);
}`;

const FS = /* glsl */`
varying float vA;
varying float vRot;
varying vec3 vTint;
uniform float uOpacity;
void main() {
  vec2 p = gl_PointCoord - 0.5;
#ifdef MOTE_BUTTERFLY
  float flap = abs(sin(vRot * 7.0));                        // wing beat
  vec2 q = vec2(p.x / max(flap, 0.15), p.y);
  float w = length(vec2(abs(q.x) - 0.2, q.y * 1.3)) - 0.2;  // two wing lobes
  float body = length(vec2(p.x * 6.0, p.y * 1.4)) - 0.25;
  if (min(w, body) > 0.0) discard;
  vec3 col = body < 0.0 ? vec3(0.12, 0.1, 0.08) : vTint * (0.8 + 0.4 * (0.5 - p.y));
  gl_FragColor = vec4(col, uOpacity * smoothstep(0.0, 0.3, vA + 0.4));
  return;
#endif
#ifdef MOTE_LEAF
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p;
  p.y *= 1.0 + 0.8 * abs(sin(vRot * 1.3));                  // tumbling: foreshortened
  float d = length(vec2(p.x * 2.2, p.y));
  if (d > 0.42) discard;
  float rib = 1.0 - smoothstep(0.0, 0.04, abs(p.x));
  gl_FragColor = vec4(vTint * (0.85 + 0.25 * p.y) * (1.0 - rib * 0.25), uOpacity * smoothstep(0.0, 0.3, vA + 0.3));
#else
  float d = length(p);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA * uOpacity;
  #ifdef MOTE_ADD
    gl_FragColor = vec4(vTint * a, 1.0);
  #else
    gl_FragColor = vec4(vTint, a);
  #endif
#endif
}`;

/**
 * o: { kind 'dot'|'leaf', count, window (Vector2), colors: [hexA, hexB], size (m), height (m),
 *      rise (m/s), fall (m/s), drift [u,v] m/s, opacity, additive, intensity, seed }
 */
export function createMotes(o) {
  const c = { kind: 'dot', count: 500, colors: [0xfff1b8, 0xfff8d8], size: 0.1, height: 5, rise: 0.15, fall: 0, drift: [0.3, 0.1], opacity: 1, additive: true, intensity: 1, seed: 3, ...o };
  const rng = mulberry32(c.seed);
  const pos = new Float32Array(c.count * 3), rnd = new Float32Array(c.count * 4);
  for (let i = 0; i < c.count; i++) {
    pos[i * 3] = rng(); pos[i * 3 + 1] = rng(); pos[i * 3 + 2] = rng();
    rnd[i * 4] = rng(); rnd[i * 4 + 1] = rng(); rnd[i * 4 + 2] = rng(); rnd[i * 4 + 3] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
  const s2 = Math.SQRT1_2;
  const uniforms = {
    uTime: ENV.uTime, uWindDir: ENV.uWindDir, uWindStrength: ENV.uWindStrength,
    uCenter: { value: new THREE.Vector2() }, uWindow: { value: c.window.clone() },
    uAxisU: { value: new THREE.Vector2(s2, -s2) }, uAxisV: { value: new THREE.Vector2(-s2, -s2) },
    uDrift: { value: new THREE.Vector2(c.drift[0], c.drift[1]) }, uPPU: { value: 40 }, uSize: { value: c.size },
    uFall: { value: c.fall }, uRise: { value: c.rise }, uHeight: { value: c.height }, uOpacity: { value: c.opacity },
    uColorA: { value: new THREE.Color(c.colors[0]).multiplyScalar(c.intensity) },
    uColorB: { value: new THREE.Color(c.colors[1] ?? c.colors[0]).multiplyScalar(c.intensity) },
  };
  const defines = {};
  if (c.kind === 'leaf') defines.MOTE_LEAF = '';
  else if (c.kind === 'butterfly') defines.MOTE_BUTTERFLY = '';
  else if (c.kind === 'dot' && c.additive) defines.MOTE_ADD = '';
  const mat = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false,
    blending: c.kind === 'dot' && c.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = `env.motes.${c.kind}`;
  pts.frustumCulled = false;
  pts.matrixAutoUpdate = false;
  pts.renderOrder = 6;
  pts.userData.update = (center, ppu) => { uniforms.uCenter.value.set(center.x, center.z); uniforms.uPPU.value = ppu; };
  pts.userData.setWindow = (w) => uniforms.uWindow.value.copy(w);
  pts.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return pts;
}
