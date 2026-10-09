import * as THREE from 'three';
import { smooth } from '../env/common.js';

// =====================================================================================
//  Arena wall — shared helpers (design/RAID.md, RAID_PASSES.md Pass 2).
//  Angle convention everywhere: a = atan2(z - cz, x - cx), direction (cos a, sin a) on the ground.
//  The iso camera sits at +X +Z, so the NEAR arc is a = PI/4 and the FAR arc is a = 5PI/4.
// =====================================================================================

export const TAU = Math.PI * 2;
export const W_FRAC = 0.42;            // fraction of the rise/sink that one piece takes (rest = stagger)
export const A0 = Math.PI * 0.25;      // the rise wave starts at the camera-side arc (most visible) and meets itself on the far arc

export const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
/** 0 on the camera side (wall stays low, <= ~0.8 u) .. 1 on the far / flanking arcs (wall may be tall). */
export const nearK = (a) => smooth(0.5, -0.1, (Math.cos(a) + Math.sin(a)) * Math.SQRT1_2);
/** Tallest allowed piece (metres) at angle a. */
export const heightCap = (a) => 0.78 + 3.8 * nearK(a);
/** 0 at the wave origin .. 1 at the end of the wave. */
export const delayOf = (a) => Math.abs(wrapPi(a - A0)) / Math.PI;
/** Eases 0..1 with a small overshoot (ease-out-back). */
export const easeOutBack = (t, c1 = 1.25) => { const u = t - 1; return 1 + (c1 + 1) * u * u * u + c1 * u * u; };

/** GLSL: the same wave as delayOf / piece progress, for ring + curtain shaders. Needs uniform float uK. */
export const WAVE_GLSL = /* glsl */`
const float AR_PI = 3.14159265;
const float AR_TAU = 6.2831853;
const float AR_A0 = ${A0.toFixed(6)};
const float AR_W = ${W_FRAC.toFixed(4)};
float arReveal(float a, float k) {
  float d = abs(mod(a - AR_A0 + AR_PI, AR_TAU) - AR_PI) / AR_PI;
  return clamp((k - d * (1.0 - AR_W)) / AR_W, 0.0, 1.0);
}
float arHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float arNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(arHash(i), arHash(i + vec2(1.0, 0.0)), u.x), mix(arHash(i + vec2(0.0, 1.0)), arHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// ---------- ground ring decal ------------------------------------------------------
// One quad, painted in the OPAQUE pass (custom blending, depthTest off, renderOrder 1: after the grass,
// before the wall pieces (2), creatures (3) and heroes (21)). Marks the collision edge at `uRad` and a
// biome-tinted scar just inside it. Never red.
const RING_VS = /* glsl */`
varying vec2 vXZ;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const RING_FS = /* glsl */`
uniform vec2 uCenter; uniform float uRad, uK, uTime, uKind, uOut;
uniform vec3 uPaint, uLine, uLine2;
varying vec2 vXZ;
${WAVE_GLSL}
void main() {
  vec2 v = vXZ - uCenter; float d = length(v); float a = atan(v.y, v.x);
  float ins = uRad - d;                       // metres inside the wall's inner face
  if (ins < -uOut - 0.04) discard;
  float rv = arReveal(a, uK);
  if (rv <= 0.0) discard;
  float arc = a * uRad;
  float band = 1.0 - smoothstep(0.0, 1.7, ins);
  float lineM = smoothstep(0.0, 0.05, ins) * (1.0 - smoothstep(0.12, 0.28, ins));
  vec3 paint = uPaint; float pa = 0.0; vec3 glow = vec3(0.0); float occ = 0.0;
  if (uKind < 0.5) {                          // verge: loam scar with root streaks, a dashed leaf-lit edge
    float st = arNoise(vec2(arc * 1.9, ins * 2.4));
    pa = 0.5 * band * (0.6 + 0.6 * st);
    float dash = smoothstep(0.32, 0.52, arNoise(vec2(arc * 0.8, 3.0)));
    glow = uLine * lineM * (0.45 + 0.55 * dash);
    occ = lineM * 0.45;
  } else if (uKind < 1.5) {                   // cinder: ash scar, flickering ember seam
    float st = arNoise(vec2(arc * 1.4, ins * 1.8));
    pa = 0.55 * band * (0.65 + 0.5 * st);
    float fl = arNoise(vec2(arc * 0.9 - uTime * 0.9, 5.0 + uTime * 0.3));
    float seam = lineM * (0.35 + 0.9 * smoothstep(0.3, 0.75, fl));
    glow = uLine * seam + uLine2 * (1.0 - smoothstep(0.0, 1.1, ins)) * 0.16 * (0.5 + fl);
    occ = lineM * 0.4;
  } else {                                    // crown: wet stone, rippling shallows and a foam lip
    float rip = 0.5 + 0.5 * sin(ins * 6.0 - uTime * 1.6 + arNoise(vec2(arc * 0.6, ins)) * 5.0);
    float foam = smoothstep(0.62, 0.8, arNoise(vec2(arc * 1.5, ins * 2.6 + uTime * 0.3))) * (1.0 - smoothstep(0.1, 0.4, ins)) * step(-0.3, ins);
    float pool = (1.0 - smoothstep(0.0, 1.7, max(ins, 0.0))) * smoothstep(-uOut, -uOut + 1.4, ins);
    pa = 0.55 * pool * (0.7 + 0.3 * rip);
    paint = mix(uPaint, uLine2, rip * 0.3 * pool);
    paint = mix(paint, uLine, clamp(foam, 0.0, 1.0));
    pa = max(pa, foam * 0.85);
    glow = uLine * lineM * 0.75;
    occ = lineM * 0.3;
  }
  gl_FragColor = vec4(paint * pa + glow, clamp(pa + occ, 0.0, 1.0)) * rv;
}`;

const _blend = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};
let _quad = null;

/** o: { kind 0 verge | 1 cinder | 2 crown, paint, line, line2 (hex), rMax } */
export function createRingDecal(scene, center, r, o) {
  _quad ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: new THREE.Vector2(center.x, center.z) }, uRad: { value: r }, uK: { value: 0 }, uTime: { value: 0 },
      uKind: { value: o.kind }, uOut: { value: o.out ?? 0 }, uPaint: { value: new THREE.Color(o.paint) },
      uLine: { value: new THREE.Color(o.line).multiplyScalar(o.hdr ?? 1.2) }, uLine2: { value: new THREE.Color(o.line2 ?? o.line) },
    },
    vertexShader: RING_VS, fragmentShader: RING_FS,
    transparent: false, depthWrite: false, depthTest: false, ..._blend,
  });
  const mesh = new THREE.Mesh(_quad, mat);       // shared quad: never disposed with the ring
  mesh.position.set(center.x, 0.06, center.z);
  mesh.scale.setScalar(2 * ((o.rMax ?? r) + 1.5 + (o.out ?? 0)));
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.name = 'arena.ring';
  scene.add(mesh);
  return {
    mesh,
    set(k, rad, t) { mesh.visible = k > 0.001; mat.uniforms.uK.value = k; mat.uniforms.uRad.value = rad; mat.uniforms.uTime.value = t; },
    dispose() { scene.remove(mesh); mat.dispose(); },
  };
}
