import * as THREE from 'three';
import { patchEnv, mulberry32 } from './common.js';

// =====================================================================================
//  Grass + flowers: ONE instanced draw each. Blades live in a window that follows the camera
//  in screen-aligned axes (each instance takes the periodic copy nearest the view centre), so
//  a fixed instance count always covers the view. Density, height and colour come from the
//  layout mask + world-space noise, so the period never shows. Wind gusts, player push and up
//  to 4 "clearings" (flattened circles, e.g. the shrine claim ring) are done in the vertex shader.
// =====================================================================================

export function makeBladeGeometry() {
  const W = [1.0, 0.8, 0.48], Y = [0.0, 0.4, 0.76], pos = [];
  for (let i = 0; i < 3; i++) pos.push(-0.5 * W[i], Y[i], 0, 0.5 * W[i], Y[i], 0);
  pos.push(0, 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = []; for (let i = 0; i < 7; i++) nrm.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  return g;
}

export function makeFlowerGeometry(petals = 5) {
  const pos = [], col = [], tint = [], idx = [];
  const stem = new THREE.Color(0x4a8a30), eye = new THREE.Color(0xe8b830), white = new THREE.Color(1, 1, 1);
  const push = (x, y, z, c, t) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); tint.push(t); return pos.length / 3 - 1; };
  const s0 = push(-0.12, 0, 0, stem, 0), s1 = push(0.12, 0, 0, stem, 0);
  const s2 = push(-0.08, 0.97, 0, stem, 0), s3 = push(0.08, 0.97, 0, stem, 0);
  idx.push(s0, s1, s2, s2, s1, s3);
  const c = push(0, 1.02, 0, eye, 0);
  const n = petals * 2, first = pos.length / 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = k % 2 === 0 ? 1.0 : 0.45;
    push(Math.cos(a) * r, 1.0 - (k % 2 === 0 ? 0.08 : 0), Math.sin(a) * r, white, 1);
  }
  for (let k = 0; k < n; k++) idx.push(c, first + ((k + 1) % n), first + k);   // faces +y
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  return g;
}

/** Window (U = screen-right, V = screen-up on the ground, metres) covering the view at `zoom`. */
export function fieldWindow(engine, zoom = 0.6, margin = 5) {
  const vh = engine.viewSize / zoom;
  const vw = vh * (innerWidth / Math.max(1, innerHeight));
  const o = engine.isoOffset;
  const elev = Math.atan2(o.y, Math.hypot(o.x, o.z));
  return new THREE.Vector2(vw + margin, vh / Math.sin(elev) + margin + 3);
}

const FIELD_VERTEX_PARS = /* glsl */`
attribute vec2 aOffset;               // 0..1 in the window
attribute vec4 aRand;                 // x yaw, y size/colour, z lean (-1..1), w clump cull threshold
uniform vec2 uCenter, uAxisU, uAxisV, uWindow, uMaskOrigin, uPlayer;
uniform float uMaskSize, uHeight, uWidth, uDensity, uPushRadius, uPatchLo;
uniform vec4 uClear[4];               // x, z, radius, strength
uniform sampler2D uMask;
varying float vFieldT;
varying float vFieldVar;
varying float vFieldAO;
#ifdef FIELD_FLOWER
attribute vec3 aCol;
attribute float aTint;
uniform vec3 uPetal[4];
varying vec3 vFieldCol;
#endif
`;

const FIELD_BEGIN = /* glsl */`
vec3 transformed;
{
  vec2 fc = vec2(dot(uCenter, uAxisU), dot(uCenter, uAxisV));
  vec2 off = aOffset * uWindow;
  vec2 q = off + uWindow * floor((fc - off) / uWindow + 0.5);    // nearest periodic copy
  vec2 base = q.x * uAxisU + q.y * uAxisV;
  vec4 fm = texture(uMask, (base - uMaskOrigin) / uMaskSize);
  float patchN = envNoise(base * 0.09 + 3.7) * 0.7 + envNoise(base * 0.31 - 1.3) * 0.3;
  float dens = fm.b * uDensity * smoothstep(uPatchLo, uPatchLo + 0.4, patchN + fm.b * 0.2);
  #ifdef FIELD_FLOWER
    dens *= smoothstep(0.56, 0.7, envNoise(base * 0.06 + 11.3) * 0.75 + envNoise(base * 0.4) * 0.25);   // flower beds
  #endif
  float flatK = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 cl = uClear[i];
    float d = length(base - cl.xy);
    flatK = max(flatK, (1.0 - smoothstep(cl.z - 0.3, cl.z + 0.4, d)) * cl.w);
  }
  float alive = step(aRand.w, dens);
  float h = uHeight * (0.68 + 0.62 * aRand.y) * (0.75 + 0.42 * patchN) * mix(1.0, 0.25, flatK) * alive;
  float groundY = (fm.a * 255.0 - 128.0) / 8.0;
  float t = position.y;
  float ang = aRand.x * 6.2831853;
  vec2 rdir = vec2(cos(ang), sin(ang));
  vec2 rperp = vec2(-rdir.y, rdir.x);
  vec2 lxz = (rdir * position.x + rperp * position.z) * uWidth * (0.75 + 0.5 * aRand.y) * alive;
  float gust = envNoise(base * 0.06 - uWindDir * uTime * 0.55);
  float wave = sin(uTime * 2.2 - dot(base, uWindDir) * 0.4 + aRand.x * 3.0) * 0.25;
  vec2 bend = uWindDir * (gust * 1.1 + wave - 0.15) * uWindStrength + rperp * aRand.z * 0.4;
  vec2 away = base - uPlayer;
  float pd = length(away);
  bend += away / max(pd, 0.001) * (1.0 - smoothstep(0.0, uPushRadius, pd)) * 1.3;
  float tt = t * t;
  transformed = vec3(base.x + lxz.x, groundY, base.y + lxz.y);
  transformed.xz += bend * h * tt;
  transformed.y += h * t * (1.0 - 0.3 * min(dot(bend, bend), 1.0) * tt);
  vFieldT = t;
  float dryN = smoothstep(0.5, 0.8, envNoise(base * 0.017 + 9.0));
  vFieldVar = clamp(envNoise(base * 0.045 + 5.0) * 0.45 + dryN * 0.55 + aRand.y * 0.2, 0.0, 1.0);
  vFieldAO = (0.72 + 0.28 * smoothstep(0.2, 0.8, patchN)) * (1.0 - 0.3 * smoothstep(0.45, 0.8, 1.0 - envNoise(base * 0.011 + 3.0)));
  #ifdef FIELD_FLOWER
    vFieldCol = mix(aCol, uPetal[int(aRand.y * 3.999)], aTint);
  #endif
  vEnvWorld = transformed;
}
`;

const FIELD_FRAG_PARS = /* glsl */`
uniform vec3 uRoot, uTipA, uTipB;
varying float vFieldT;
varying float vFieldVar;
varying float vFieldAO;
#ifdef FIELD_FLOWER
varying vec3 vFieldCol;
#endif
`;

const FIELD_COLOR = /* glsl */`
#ifdef FIELD_FLOWER
  diffuseColor.rgb = vFieldCol;
#else
  {
    vec3 tipC = mix(uTipA, uTipB, smoothstep(0.25, 0.75, vFieldVar));
    vec3 rootC = uRoot * (0.85 + 0.25 * vFieldVar) * vFieldAO;
    diffuseColor.rgb = mix(rootC, tipC * mix(0.78, 1.0, vFieldAO), smoothstep(0.0, 1.0, vFieldT));
  }
#endif
`;

/**
 * opts: mask (buildLayoutMask), window (Vector2), kind 'grass'|'flower', count, height (m), width (m),
 *       density, patchLo (bare-patch threshold, higher = more bare), clump [min,max], clumpRadius,
 *       pushRadius, seed, colors: { root, tipA, tipB } or { petals: [hex x1..4] }
 * Returns a Mesh with userData.update(center, playerPos), userData.setWindow(v2),
 * userData.setClearing(i, x, z, r, strength), userData.dispose().
 */
export function createField(opts) {
  const o = {
    kind: 'grass', count: 48000, window: new THREE.Vector2(78, 68), height: 0.5, width: 0.12, density: 1, patchLo: 0.25,
    clump: [5, 11], clumpRadius: 0.35, pushRadius: 1.6, seed: 7, colors: {}, ...opts,
  };
  const flower = o.kind === 'flower';
  const baseGeo = flower ? makeFlowerGeometry() : makeBladeGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = baseGeo.index;
  for (const name in baseGeo.attributes) geo.setAttribute(name, baseGeo.attributes[name]);

  const rng = mulberry32(o.seed), W = o.window;
  const off = new Float32Array(o.count * 2), rnd = new Float32Array(o.count * 4);
  const cu = o.clumpRadius / W.x, cv = o.clumpRadius / W.y;
  for (let i = 0; i < o.count;) {
    const u0 = rng(), v0 = rng(), cr = rng();
    const n = o.clump[0] + Math.floor(rng() * (o.clump[1] - o.clump[0] + 1));
    for (let k = 0; k < n && i < o.count; k++, i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
      off[i * 2] = (((u0 + Math.cos(a) * r * cu) % 1) + 1) % 1;
      off[i * 2 + 1] = (((v0 + Math.sin(a) * r * cv) % 1) + 1) % 1;
      rnd[i * 4] = rng(); rnd[i * 4 + 1] = rng(); rnd[i * 4 + 2] = rng() * 2 - 1; rnd[i * 4 + 3] = cr * 0.85 + rng() * 0.15;
    }
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = o.count;

  const s2 = Math.SQRT1_2;
  const petals = o.colors.petals ?? [0xffffff];
  const uniforms = {
    uCenter: { value: new THREE.Vector2() }, uPlayer: { value: new THREE.Vector2(1e5, 1e5) },
    uAxisU: { value: new THREE.Vector2(s2, -s2) },      // screen-right on ground
    uAxisV: { value: new THREE.Vector2(-s2, -s2) },     // screen-up on ground
    uWindow: { value: W.clone() },
    uMask: { value: o.mask.texture }, uMaskOrigin: { value: o.mask.origin }, uMaskSize: { value: o.mask.size },
    uHeight: { value: o.height }, uWidth: { value: o.width }, uDensity: { value: o.density }, uPushRadius: { value: o.pushRadius },
    uPatchLo: { value: o.patchLo },
    uClear: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uRoot: { value: new THREE.Color(o.colors.root ?? 0x3c7a2a) },
    uTipA: { value: new THREE.Color(o.colors.tipA ?? 0x8cc94f) },
    uTipB: { value: new THREE.Color(o.colors.tipB ?? 0xb8d85a) },
    uPetal: { value: [0, 1, 2, 3].map((i) => new THREE.Color(petals[i % petals.length])) },
  };
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  if (flower) mat.defines = { FIELD_FLOWER: '' };
  patchEnv(mat, {
    key: flower ? 'flower' : 'grass', uniforms, normalFix: true,
    vertexPars: FIELD_VERTEX_PARS,
    beginNormal: 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );',
    beginVertex: FIELD_BEGIN,
    fragmentPars: FIELD_FRAG_PARS, colorFragment: FIELD_COLOR,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = flower ? 'env.flowers' : 'env.grass';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.uniforms = uniforms;
  mesh.userData.update = (center, player) => {
    uniforms.uCenter.value.set(center.x, center.z);
    if (player) uniforms.uPlayer.value.set(player.x, player.z); else uniforms.uPlayer.value.set(1e5, 1e5);
  };
  mesh.userData.setWindow = (w) => { uniforms.uWindow.value.copy(w); };
  mesh.userData.setClearing = (i, x, z, r, strength = 1) => { uniforms.uClear.value[i].set(x, z, r, strength); };
  mesh.userData.dispose = () => { geo.dispose(); baseGeo.dispose(); mat.dispose(); };
  return mesh;
}
