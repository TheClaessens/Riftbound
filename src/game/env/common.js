import * as THREE from 'three';

// =====================================================================================
//  Environment core: shared uniforms (ENV), shared GLSL (noise, cloud shadows, haze),
//  patchEnv() for every environment material, deterministic CPU noise, the terrain height
//  function and the layout mask (paths / water / grass density / height).
//  See design/research/02-environment.md. Everything here is biome-agnostic.
// =====================================================================================

// ---------- shared uniforms: every patched material references these SAME objects ----------
export const ENV = {
  uTime:         { value: 0 },
  uWindDir:      { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 0.6 },
  uCloudScale:   { value: 0.016 },                       // 1/m (~60 m cloud blobs)
  uCloudSpeed:   { value: new THREE.Vector2(2.0, 1.2) }, // m/s
  uCloudCover:   { value: 0.56 },                        // higher = fewer clouds
  uCloudDark:    { value: 0.74 },                        // direct-light multiplier in cloud shadow
  uHazeColor:    { value: new THREE.Color(0xbfe0c8) },
  uHazeLow:      { value: -7.0 },                        // y where height haze is full
  uEdgeHaze:     { value: new THREE.Vector2(64, 112) },  // radial haze start/end (m)
  uEdgeHazeMax:  { value: 0.4 },
  uFadeTarget:   { value: new THREE.Vector3(0, 1, 0) },  // player chest (world)
  uCamDir:       { value: new THREE.Vector3(1, 1.22, 1).normalize() }, // target -> camera
  uFadeRadius:   { value: 2.4 },
  uFadeTarget2:  { value: new THREE.Vector3(0, -100, 0) }, // second cut-out target: the raid boss (arena/wall.js drives it)
  uFade2:        { value: new THREE.Vector2(3.4, 0) },     // x = radius (m), y = 1 while a boss is up
  // Environment-only grade (before haze). Neutral tone mapping's toe subtracts up to 0.04 from every
  // channel, which over-saturates dark-ish albedos; env colours are desaturated / lifted here instead
  // of touching the global grade (characters + VFX keep theirs).
  uEnvSat:       { value: 0.82 },
  uEnvLift:      { value: 0.012 },
  uDapple:       { value: 0 },                           // canopy light dapple near the rim (forest)
};

/** Per frame: advance env time, move the occlusion cut-out to the player. */
export function updateEnv(dt, playerPos) {
  ENV.uTime.value = (ENV.uTime.value + dt) % 3600;
  if (playerPos) ENV.uFadeTarget.value.set(playerPos.x, 1.0, playerPos.z);
  else ENV.uFadeTarget.value.set(0, -100, 0);
}

/** Biome `env` block: { saturation (env-only, 0.82), lift (0.012), dapple (0..1 rim canopy light), haze, cloudCover, cloudDark, cloudScale, cloudSpeed:[x,z], wind, edgeHaze:[r0,r1], edgeHazeMax, windDir:[x,z] } */
export function applyEnvSettings(s = {}) {
  if (s.haze !== undefined) ENV.uHazeColor.value.set(s.haze);
  if (s.cloudCover !== undefined) ENV.uCloudCover.value = s.cloudCover;
  if (s.cloudDark !== undefined) ENV.uCloudDark.value = s.cloudDark;
  if (s.cloudScale !== undefined) ENV.uCloudScale.value = s.cloudScale;
  if (s.cloudSpeed) ENV.uCloudSpeed.value.set(s.cloudSpeed[0], s.cloudSpeed[1]);
  if (s.wind !== undefined) ENV.uWindStrength.value = s.wind;
  if (s.windDir) ENV.uWindDir.value.set(s.windDir[0], s.windDir[1]).normalize();
  if (s.edgeHaze) ENV.uEdgeHaze.value.set(s.edgeHaze[0], s.edgeHaze[1]);
  if (s.edgeHazeMax !== undefined) ENV.uEdgeHazeMax.value = s.edgeHazeMax;
  ENV.uEnvSat.value = s.saturation ?? 0.82;
  ENV.uEnvLift.value = s.lift ?? 0.012;
  ENV.uDapple.value = s.dapple ?? 0;
}

// ---------- GLSL shared by vertex + fragment ----------
export const ENV_PARS = /* glsl */`
uniform float uTime;
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uCloudScale;
uniform vec2  uCloudSpeed;
uniform float uCloudCover;
uniform float uCloudDark;
uniform vec3  uHazeColor;
uniform float uHazeLow;
uniform vec2  uEdgeHaze;
uniform float uEdgeHazeMax;
uniform float uEnvSat;
uniform float uEnvLift;
uniform float uDapple;
varying vec3  vEnvWorld;

float envHash(vec2 p) {                       // Dave Hoskins, hash without sine
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float envNoise(vec2 p) {                      // value noise, 0..1
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = envHash(i), b = envHash(i + vec2(1.0, 0.0));
  float c = envHash(i + vec2(0.0, 1.0)), d = envHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float envFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * envNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0; a *= 0.5; }
  return s / 0.9375;
}
float envCloud(vec2 xz) {
  vec2 p = xz * uCloudScale - uCloudSpeed * uCloudScale * uTime;
  float n = envNoise(p) * 0.55 + envNoise(p * 2.13 + 7.1) * 0.3 + envNoise(p * 4.7 - 3.3) * 0.15;
  float cl = mix(1.0, uCloudDark, smoothstep(uCloudCover, uCloudCover + 0.1, n));
  if (uDapple > 0.0) {
    float rim = smoothstep(46.0, 57.0, length(xz));
    float leaf = envNoise(xz * 0.75 + vec2(uTime * 0.06, 0.0)) * 0.6 + envNoise(xz * 1.9 - vec2(0.0, uTime * 0.09)) * 0.4;
    cl *= 1.0 - uDapple * rim * smoothstep(0.42, 0.52, leaf);
  }
  return cl;
}
vec3 envGrade(vec3 col) {
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), col, uEnvSat) + uEnvLift;
}
vec3 envHaze(vec3 col, vec3 wp) {
  float h = clamp(wp.y / uHazeLow, 0.0, 1.0);          // uHazeLow < 0
  h = h * h * (3.0 - 2.0 * h);
  float e = smoothstep(uEdgeHaze.x, uEdgeHaze.y, length(wp.xz)) * uEdgeHazeMax;
  return mix(col, uHazeColor, clamp(max(h * 0.38, e), 0.0, 1.0));
}
`;

// Instanced-mesh wind (origin from the instance matrix).
const WIND_PARS = /* glsl */`
uniform float uWindHeight;  // local height where sway weight reaches 1
uniform float uWindAmp;     // metres at the top
uniform float uFlutter;     // leaf flutter metres
`;
const WIND_VERTEX = /* glsl */`
{
  #ifdef USE_INSTANCING
    mat4 envM = modelMatrix * instanceMatrix;
  #else
    mat4 envM = modelMatrix;
  #endif
  vec3 envO = envM[3].xyz;
  float wh = clamp(position.y / uWindHeight, 0.0, 1.0);
  wh *= wh;
  float ph = dot(envO.xz, vec2(0.37, 0.23));
  float gust = envNoise(envO.xz * 0.05 - uWindDir * uTime * 0.3);
  float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.4;
  vec3 off = vec3(uWindDir.x, 0.0, uWindDir.y) * (sway * 0.5 + gust) * uWindAmp * uWindStrength * wh;
  off += vec3(0.6, 0.25, 0.6) * sin(uTime * 6.0 + dot(position, vec3(4.1, 3.3, 3.7)) + ph) * uFlutter * wh;
  mat3 envR = mat3(envM);
  transformed += transpose(envR) * off / max(dot(envR[0], envR[0]), 1e-4);
}
`;

// Merged-geometry wind: attribute aSway = (originX, originZ, sway metres, flutter metres).
// Positions are world space (identity model matrix), so offsets are applied directly.
const SWAY_PARS = /* glsl */`
attribute vec4 aSway;
`;
const SWAY_VERTEX = /* glsl */`
if (aSway.z + aSway.w > 0.0) {
  float ph = dot(aSway.xy, vec2(0.37, 0.23));
  float gust = envNoise(aSway.xy * 0.05 - uWindDir * uTime * 0.3);
  float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.4;
  transformed.xz += uWindDir * (sway * 0.45 + gust - 0.3) * aSway.z * uWindStrength;
  transformed += vec3(0.6, 0.25, 0.6) * sin(uTime * 5.0 + dot(position, vec3(4.1, 3.3, 3.7)) + ph) * aSway.w * (0.5 + uWindStrength);
}
`;

const WORLD_VERTEX = /* glsl */`
#ifdef USE_INSTANCING
  vEnvWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vEnvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

const FADE_PARS = /* glsl */`
uniform vec3  uFadeTarget;
uniform vec3  uCamDir;
uniform float uFadeRadius;
uniform vec3  uFadeTarget2;
uniform vec2  uFade2;
float envFadeKeep(vec3 target, float radius) {
  vec3 fr = vEnvWorld - target;
  float along = dot(fr, uCamDir);
  float perp = length(fr - along * uCamDir);
  float keep = smoothstep(radius, radius + 1.6, perp);
  keep = max(keep, 1.0 - smoothstep(0.4, 1.6, along));
  keep = max(keep, 1.0 - smoothstep(0.35, 0.9, vEnvWorld.y));
  return keep;
}
`;
// Player occlusion cut-out: Bayer-dithered discard inside a screen-space disc around the player (and, during a
// raid encounter, a second one around the boss), only for fragments in front of the target (toward the camera)
// and above knee height.
const FADE_FRAGMENT = /* glsl */`
{
  float keep = envFadeKeep(uFadeTarget, uFadeRadius);
  if (uFade2.y > 0.5) keep = min(keep, envFadeKeep(uFadeTarget2, uFade2.x));
  keep = 0.12 + 0.88 * keep;
  vec2 fc = mod(floor(gl_FragCoord.xy), 4.0);
  const float envBayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                                       3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  int bi = int(fc.x) + int(fc.y) * 4;
  if (keep < (envBayer[bi] + 0.5) / 16.0) discard;
}
`;

/**
 * Patch a MeshLambertMaterial for the environment (works with MeshStandard too, except `wrap`).
 * opts:
 *   cloud (true)  cloud shadows on the direct light       haze (true)  radial + low-height haze
 *   fade (false)  player occlusion dither cut-out          wrap (false) soft wrap lighting (Lambert)
 *   normalFix     double-sided cards keep the authored normal
 *   wind: {height, amp, flutter}   instanced-mesh sway     sway: true   merged-geometry sway (aSway attr)
 *   uniforms, key, vertexPars, vertexMain, beginVertex (replaces begin_vertex; must set vEnvWorld),
 *   beginNormal, fragmentPars, colorFragment (after color_fragment), emissiveFragment (after emissivemap_fragment)
 */
export function patchEnv(material, opts = {}) {
  const o = {
    cloud: true, haze: true, fade: false, wrap: false, normalFix: false, wind: null, sway: false,
    uniforms: {}, key: '', vertexPars: '', vertexMain: '', beginVertex: null, beginNormal: null,
    fragmentPars: '', colorFragment: '', emissiveFragment: '', ...opts,
  };
  const windU = o.wind ? {
    uWindHeight: { value: o.wind.height ?? 4 },
    uWindAmp: { value: o.wind.amp ?? 0.15 },
    uFlutter: { value: o.wind.flutter ?? 0.03 },
  } : {};
  const fadeU = o.fade ? { uFadeTarget: ENV.uFadeTarget, uCamDir: ENV.uCamDir, uFadeRadius: ENV.uFadeRadius, uFadeTarget2: ENV.uFadeTarget2, uFade2: ENV.uFade2 } : {};
  material.userData.envUniforms = { ...o.uniforms, ...windU };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENV, fadeU, o.uniforms, windU);

    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\n${ENV_PARS}\n${o.wind ? WIND_PARS : ''}\n${o.sway ? SWAY_PARS : ''}\n${o.vertexPars}`);
    if (o.beginNormal !== null) vs = vs.replace('#include <beginnormal_vertex>', o.beginNormal);
    if (o.beginVertex !== null) {
      vs = vs.replace('#include <begin_vertex>', o.beginVertex);
    } else {
      vs = vs.replace('#include <begin_vertex>',
        `#include <begin_vertex>\n${o.wind ? WIND_VERTEX : ''}\n${o.sway ? SWAY_VERTEX : ''}\n${o.vertexMain}\n${WORLD_VERTEX}`);
    }
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${ENV_PARS}\n${o.fade ? FADE_PARS : ''}\n${o.fragmentPars}`);
    if (o.fade) fs = fs.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FADE_FRAGMENT}`);
    if (o.colorFragment) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${o.colorFragment}`);
    if (o.normalFix) fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
    if (o.emissiveFragment) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${o.emissiveFragment}`);
    if (o.wrap) {
      fs = fs.replace('#include <lights_lambert_pars_fragment>', THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) * 0.6 + 0.4 ); dotNL *= dotNL;'));
    }
    if (o.cloud) {
      fs = fs.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nfloat envCl = envCloud( vEnvWorld.xz );\nreflectedLight.directDiffuse *= envCl;\nreflectedLight.directSpecular *= envCl;');
    }
    fs = fs.replace('#include <opaque_fragment>', (o.grade === false ? '' : 'outgoingLight = envGrade( outgoingLight );\n') + (o.haze ? 'outgoingLight = envHaze( outgoingLight, vEnvWorld );\n' : '') + '#include <opaque_fragment>');
    shader.fragmentShader = fs;
  };

  const key = ['env', o.grade !== false, o.cloud, o.haze, o.fade, o.wrap, o.normalFix, !!o.wind, o.sway, o.key,
    o.vertexPars, o.vertexMain, o.beginVertex, o.beginNormal, o.fragmentPars, o.colorFragment, o.emissiveFragment].join('|');
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

// ---------- CPU noise / helpers (deterministic) ----------
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.1, z * f - i * 9.7); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// Segment arrays + bounding boxes per polyline (cached on the points array).
const _polyCache = new WeakMap();
function polyIndex(pts) {
  let ix = _polyCache.get(pts);
  if (ix) return ix;
  const n = pts.length - 1, seg = new Float64Array(Math.max(0, n) * 8);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1], dx = bx - ax, dz = bz - az;
    seg.set([ax, az, dx, dz, 1 / (dx * dx + dz * dz || 1), Math.min(ax, bx), Math.max(ax, bx), 0], i * 8);
    seg[i * 8 + 7] = Math.min(az, bz); // minZ
    seg[i * 8 + 4] = 1 / (dx * dx + dz * dz || 1);
    minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx); minZ = Math.min(minZ, az, bz); maxZ = Math.max(maxZ, az, bz);
  }
  ix = { n, seg, minX, minZ, maxX, maxZ, maxZs: pts.map((p, i) => (i < n ? Math.max(p[1], pts[i + 1][1]) : 0)) };
  _polyCache.set(pts, ix);
  return ix;
}

/** Distance from (x,z) to a polyline; with maxD, returns maxD early when farther (fast rejection). */
export function distToPolyline(x, z, pts, maxD = Infinity) {
  const ix = polyIndex(pts);
  if (x < ix.minX - maxD || x > ix.maxX + maxD || z < ix.minZ - maxD || z > ix.maxZ + maxD) return maxD;
  let best = maxD * maxD;
  const s = ix.seg;
  for (let i = 0; i < ix.n; i++) {
    const o = i * 8;
    if (x < s[o + 5] - maxD || x > s[o + 6] + maxD || z < s[o + 7] - maxD || z > ix.maxZs[i] + maxD) continue;
    const ax = s[o], az = s[o + 1], dx = s[o + 2], dz = s[o + 3];
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) * s[o + 4]));
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/** Catmull-Rom resample of a polyline [[x,z],...] every `step` metres (smooth curves for paths / rivers). */
export function smoothPolyline(pts, step = 2) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}

// ---------- screen-space authoring helpers (iso camera offset (1, 1.22, 1)) ----------
// Screen-right on the ground = (1,0,-1)/√2, screen-up = (-1,0,-1)/√2, camera side = (1,0,1)/√2.
const R2 = Math.SQRT1_2;
/** Screen-aligned ground coordinates (sx right, sy up, metres) -> world [x, z]. */
export const fromScreen = (sx, sy) => [R2 * (sx - sy), -R2 * (sx + sy)];
/** World x,z -> 'nearness' -1 (far side, screen-top) .. +1 (camera side, screen-bottom), direction only. */
export const sideOf = (x, z) => (x + z) * R2 / Math.max(Math.hypot(x, z), 1e-3);

/**
 * Terrain: flat at y=0 inside flatR; the far side rises (hills), the camera side drops (valley),
 * so nothing outside the arena can hide the player. Water bodies carve shallow channels.
 * opts: { flatR, ramp, farRise, nearDrop, noiseAmp, noiseFreq, rivers:[{points,width}], ponds:[{x,z,r}], depth }
 */
export function makeHeightFn({ flatR = 56, ramp = 11, farRise = 5, nearDrop = -6, noiseAmp = 3, noiseFreq = 0.035, rivers = [], ponds = [], depth = 0.5 } = {}) {
  const base = (x, z) => {
    const r = Math.hypot(x, z);
    if (r <= flatR) return 0;
    const side = smooth(-0.15, 0.55, (x * R2 + z * R2) / Math.max(r, 1e-3));
    const t = smooth(flatR, flatR + ramp * (1 - 0.45 * side), r);   // crisper ledge on the camera side
    const lvl = farRise + (nearDrop - farRise) * side;
    const far = smooth(flatR + ramp, flatR + ramp + 40, r);   // rolling hills farther out
    return t * (lvl + (fbm(x * noiseFreq, z * noiseFreq) - 0.5) * 2 * noiseAmp * (1 - 0.6 * side) * (0.6 + 0.8 * far));
  };
  const fn = (x, z) => {
    let h = base(x, z);
    for (const rv of rivers) {
      const k = 1 - smooth(rv.width * 0.5 - 1.6, rv.width * 0.5 + 0.7, distToPolyline(x, z, rv.points, rv.width * 0.5 + 1));
      if (k > 0) h = h * (1 - k) - depth * k;
    }
    for (const p of ponds) {
      const k = 1 - smooth(p.r - 1.6, p.r + 0.7, Math.hypot(x - p.x, z - p.z));
      if (k > 0) h = h * (1 - k) - depth * k;
    }
    return h;
  };
  fn.uncarved = base;
  return fn;
}

/**
 * Layout mask (256² DataTexture over `meters`): R path, G water (0.5 = bank, 1 = 5 m inside,
 * 0 = 5 m outside), B grass density, A height (h*8+128). The same data drives ground colour,
 * grass / flower density and CPU placement, so everything agrees.
 * paths/rivers: [{ points: [[x,z],...], width }], ponds: [{x,z,r}]
 * Returns { texture, origin, size, sample(x,z), stamp(obstacles), commit() }.
 */
export function buildLayoutMask({ meters = 256, res = 256, heightFn, paths = [], rivers = [], ponds = [] }) {
  const half = meters / 2, cell = meters / res;
  const data = new Uint8Array(res * res * 4);
  const H = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    H[j * res + i] = heightFn(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell);
  }
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * cell, k = j * res + i;
      let pathV = 0, waterD = -99;                      // waterD: metres inside the nearest bank
      for (const p of paths) {
        const d = distToPolyline(x, z, p.points, p.width * 0.5 + 2);
        if (d < p.width * 0.5 + 2) pathV = Math.max(pathV, 1 - smooth(p.width * 0.5 - 1.6, p.width * 0.5 + 1.6, d));
      }
      for (const rv of rivers) waterD = Math.max(waterD, rv.width * 0.5 - distToPolyline(x, z, rv.points, rv.width * 0.5 + 6));
      for (const p of ponds) waterD = Math.max(waterD, p.r - Math.hypot(x - p.x, z - p.z));
      const waterV = Math.min(1, Math.max(0, 0.5 + waterD / 10));
      const hx = H[j * res + Math.min(i + 1, res - 1)] - H[j * res + Math.max(i - 1, 0)];
      const hz = H[Math.min(j + 1, res - 1) * res + i] - H[Math.max(j - 1, 0) * res + i];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const wet = smooth(-2.5, 0.6, waterD);
      const grass = Math.max(0, 1 - Math.max(pathV * 1.3, wet)) * (1 - smooth(0.55, 1.1, slope));
      data[k * 4] = Math.round(pathV * 255);
      data[k * 4 + 1] = Math.round(waterV * 255);
      data[k * 4 + 2] = Math.round(grass * 255);
      data[k * 4 + 3] = Math.min(255, Math.max(0, Math.round(H[k] * 8 + 128)));
    }
  }
  const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);   // row 0 = z min
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  const idx = (x, z) => {
    const i = Math.min(res - 1, Math.max(0, Math.floor((x + half) / cell)));
    const j = Math.min(res - 1, Math.max(0, Math.floor((z + half) / cell)));
    return (j * res + i) * 4;
  };
  const sample = (x, z) => {
    const k = idx(x, z);
    return { path: data[k] / 255, water: data[k + 1] / 255, waterD: (data[k + 1] / 255 - 0.5) * 10, grass: data[k + 2] / 255, h: (data[k + 3] - 128) / 8 };
  };
  /** Thin the grass under prop footprints [{x,z,r, keep?}] (keep = residual density 0..1). */
  const stamp = (list) => {
    for (const o of list) {
      const rr = o.r + 0.6;
      const i0 = Math.max(0, Math.floor((o.x - rr + half) / cell)), i1 = Math.min(res - 1, Math.ceil((o.x + rr + half) / cell));
      const j0 = Math.max(0, Math.floor((o.z - rr + half) / cell)), j1 = Math.min(res - 1, Math.ceil((o.z + rr + half) / cell));
      const keep = o.keep ?? 0.25;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
        const k = (j * res + i) * 4 + 2;
        const f = keep + (1 - keep) * smooth(o.r * 0.6, o.r + 0.6, Math.hypot(x - o.x, z - o.z));
        data[k] = Math.round(data[k] * f);
      }
    }
  };
  const commit = () => { texture.needsUpdate = true; };
  return { texture, origin: new THREE.Vector2(-half, -half), size: meters, sample, stamp, commit, heightFn };
}

/** Second occlusion cut-out that follows the raid boss (dither like the player's). pos null = off. Allocation-free. */
export function setBossFade(pos, radius = 3.4, height = 2) {
  if (pos) { ENV.uFadeTarget2.value.set(pos.x, height, pos.z); ENV.uFade2.value.set(radius, 1); }
  else ENV.uFade2.value.y = 0;
}
