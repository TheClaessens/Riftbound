import * as THREE from 'three';
import { HERO_YIELD_GLSL } from './heroYield.js';

// =====================================================================================
//  Ground decals: ONE instanced draw for every live decal of every kind. Each instance is a
//  2x2 ground quad scaled to its radius; the fragment shader branches on the (per-instance,
//  so warp-coherent) kind and draws a procedural, animated mask:
//    0 frost   creeping crystalline front (polar noise lobes + dendrite fingers), Worley
//              facets, twinkling glints, dark ink band on the advancing edge, melts by noise
//    1 scorch  irregular char blob, glowing Worley ember cracks that cool from yellow to red to off
//    2 rune    rotating rune circle: rings, procedural 3-stroke glyphs per sector, hexagram,
//              drawn on by an angular sweep; glow strokes over a dark backing
//    3 crater  bowl + raised lip lit from the real sun direction (reads as a depression in iso),
//              polar-Worley radial cracks, optional cooling ember glow
//    4 wet     dark wet stain with ripple rings popping at random points
//    5 shadow  soft cool shadow blob (cloud shadow), slowly drifting edge
//  Premultiplied output under BLEND_ADD: rgb = paint * a + emission, a = how much ground is covered.
//  depthTest false (grass never hides it). Drawn in the OPAQUE pass at renderOrder 1: after the grass, before the
//  creatures (renderOrder 3) and heroes (21), so decals never wash over units.
//
//  Per-instance: iD0 = birth, life, seed, kind   iD1 = grow (s), fade (s), intensity, extra
//                iD2 = colour A (paint rgb, alpha) iD3 = colour B (accent / glow rgb, hdr)
// =====================================================================================

export const DECAL = { frost: 0, scorch: 1, rune: 2, crater: 3, wet: 4, shadow: 5 };

const VS = /* glsl */`
  attribute vec4 iD0; attribute vec4 iD1; attribute vec4 iD2; attribute vec4 iD3;
  varying vec2 vP; varying vec2 vW; varying float vR; varying vec3 vPV;
  varying vec4 vD0; varying vec4 vD1; varying vec4 vD2; varying vec4 vD3;
  void main() {
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vP = position.xz;
    vW = wp.xz;
    vR = length(instanceMatrix[0].xyz);
    vD0 = iD0; vD1 = iD1; vD2 = iD2; vD3 = iD3;
    vec4 pv = modelViewMatrix * wp; vPV = pv.xyz;
    gl_Position = projectionMatrix * pv;
  }`;

const FS = /* glsl */`
  uniform float uTime; uniform sampler2D uNoise; uniform vec2 uSunXZ;
  varying vec2 vP; varying vec2 vW; varying float vR; varying vec3 vPV;
  varying vec4 vD0; varying vec4 vD1; varying vec4 vD2; varying vec4 vD3;
  ${HERO_YIELD_GLSL}
  const float TAU = 6.2831853;
  float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
  float stroke(float d, float w) { float aa = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, d); }
  // polar samples jump at the atan seam: use an explicit LOD so mip selection does not spike
  vec4 nzP(vec2 q) { return textureLod(uNoise, q, 1.0); }
  vec4 nz(vec2 q) { return texture(uNoise, q); }

  vec4 frost(vec2 p, float r, float an, float age, float grow, float fadeK, float seed) {
    float big = nzP(vec2(an * 5.0, r * 0.25 + seed)).r;
    float fing = nzP(vec2(an * 23.0, r * 0.6 - seed)).g;
    float front = grow * (0.78 + 0.26 * big);
    float d = front - r + (fing - 0.5) * 0.25 * smoothstep(0.25, 1.0, r);
    float er = nz(vW * 0.11 + seed).r;
    d = min(d, (er - fadeK * 1.15) * 0.6);
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) return vec4(0.0);
    vec4 cell = nz(vW * 0.09 + seed * 0.37);
    float facet = 1.0 - smoothstep(0.0, 0.09, cell.b);
    float edgeBand = 1.0 - smoothstep(0.0, 0.14 / max(vR, 0.5), d);
    vec3 col = mix(vD2.rgb, vec3(1.0), facet * 0.65);
    col = mix(col, vD3.rgb, edgeBand * 0.9);
    float a = vD2.a * m * mix(0.8 + 0.2 * facet, 1.0, edgeBand);
    float tw = step(0.9, fract(cell.a * 7.0 + floor(uTime * 2.5 + cell.a * 10.0) * 0.618));
    vec3 emit = vec3(1.1, 1.4, 1.6) * tw * (1.0 - smoothstep(0.0, 0.25, cell.b)) * m * vD1.z;
    return vec4(col * a + emit, a);
  }

  vec4 scorch(vec2 p, float r, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.15 + seed).r;
    float d = grow * (0.72 + 0.4 * n) - r;
    d = min(d, (n - fadeK) * 0.5);
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) return vec4(0.0);
    float heat = exp(-age * vD1.w);
    float crack = 1.0 - smoothstep(0.0, 0.07, nz(vW * 0.22 + seed).b);
    float core = 1.0 - smoothstep(0.1, 0.8, r);
    vec3 ember = mix(vec3(0.15, 0.045, 0.014), vD3.rgb, heat)   /* cools toward ember-brown #6A3A20 (linear), never red */ * vD3.w * heat * vD1.z;
    float a = vD2.a * m * mix(0.5, 1.0, 1.0 - smoothstep(0.3, 1.0, r));
    return vec4(vD2.rgb * a + ember * crack * core * m, a);
  }

  vec4 rune(vec2 p, float r, float an, float age, float grow, float fadeK, float seed) {
    float rotO = age * 0.35, rotI = -age * 0.6;
    float sweep = step(fract(an - 0.25 + 1.0), grow);
    float s = 0.0, back = 0.0;
    float dO = abs(r - 0.93); s += stroke(dO, 0.028) * sweep; back += stroke(dO, 0.07);
    float d2 = abs(r - 0.80); s += stroke(d2, 0.011) * sweep; back += stroke(d2, 0.04);
    float d3 = abs(r - 0.42); s += stroke(d3, 0.013) * sweep; back += stroke(d3, 0.04);
    // glyph band between the two outer rings
    const float N = 14.0;
    float sa = fract(an + rotO / TAU) * N;
    float id = floor(sa);
    vec2 lp = vec2((fract(sa) - 0.5) * (TAU * 0.865 / N), r - 0.865) / 0.05;
    float dg = 9.0;
    vec2 prev = vec2(floor(hash1(id + seed) * 3.0) - 1.0, floor(hash1(id * 1.7 + seed) * 3.0) - 1.0);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 nx = vec2(floor(hash1(id * 3.1 + fk * 7.3 + seed) * 3.0) - 1.0, floor(hash1(id * 5.3 + fk * 2.9 + seed) * 3.0) - 1.0);
      if (nx == prev) nx = -nx;
      dg = min(dg, sdSeg(lp, prev * vec2(0.55, 0.7), nx * vec2(0.55, 0.7)));
      prev = nx;
    }
    float inBand = step(abs(r - 0.865), 0.06);
    s += stroke(dg * 0.05, 0.009) * inBand * sweep;
    // hexagram (two triangles) rotating the other way
    float dh = 9.0;
    for (int k = 0; k < 6; k++) {
      float a0 = rotI + float(k) * TAU / 6.0, a1 = a0 + 2.0 * TAU / 6.0;
      dh = min(dh, sdSeg(p, 0.78 * vec2(cos(a0), sin(a0)), 0.78 * vec2(cos(a1), sin(a1))));
    }
    s += stroke(dh, 0.01) * smoothstep(0.4, 0.8, grow);
    back += stroke(dh, 0.035);
    s = min(s, 1.0); back = min(back, 1.0);
    float k = (1.0 - fadeK) * vD1.z * (0.85 + 0.15 * sin(age * 6.0));
    float tint = (1.0 - smoothstep(0.93, 0.96, r)) * 0.12;
    float a = max(back * vD2.a, tint) * k;
    return vec4(vD2.rgb * a + vD3.rgb * vD3.w * s * k, a);
  }

  vec4 crater(vec2 p, float r, float an, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.2 + seed).r;
    vec2 dir = p / max(r, 1e-3);
    float rr = r / max(grow, 0.05);
    float bowl = 1.0 - smoothstep(0.40, 0.48 + 0.06 * n, rr);
    float lip = smoothstep(0.36, 0.48, rr) * (1.0 - smoothstep(0.52, 0.66 + 0.1 * n, rr));
    float wallLit = clamp(dot(-dir, uSunXZ), 0.0, 1.0) * smoothstep(0.2, 0.45, rr);
    float lipLit = step(0.0, dot(dir, uSunXZ));
    float cr = nzP(vec2(an * 2.0, log(max(r, 0.05)) * 0.35 + seed)).b;
    float crack = (1.0 - smoothstep(0.0, 0.06, cr)) * smoothstep(0.42, 0.5, rr) * (1.0 - smoothstep(0.7, 1.0, r));
    float er = smoothstep(fadeK - 0.05, fadeK + 0.05, n * 0.9 + 0.05);
    vec3 dark = vD2.rgb, dust = vD3.rgb;
    vec3 col = mix(dark, dark * 1.8 + 0.05, wallLit);
    float a = bowl * vD2.a;
    vec3 lipCol = dust * mix(0.7, 1.15, lipLit);
    col = mix(col, lipCol, lip * (1.0 - bowl));
    a = max(a, lip * 0.75);
    col = mix(col, dark * 0.6, crack); a = max(a, crack * 0.8);
    a *= er;
    float heat = exp(-age * vD1.w) * vD1.z;
    vec3 emit = vec3(1.6, 0.55, 0.12) * heat * (crack + bowl * 0.35 * (1.0 - smoothstep(0.0, 0.4, rr))) * er;
    return vec4(col * a + emit, a);
  }

  vec4 wet(vec2 p, float r, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.18 + seed).r;
    float d = grow * (0.72 + 0.32 * n) - r;
    d = min(d, (n - fadeK) * 0.5);
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) return vec4(0.0);
    float ring = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float ph = age * 0.9 + fk * 0.37;
      float cyc = floor(ph);
      vec2 c = vec2(hash1(cyc * 13.1 + fk + seed * 7.0), hash1(cyc * 7.7 + fk * 3.1 + seed * 3.0)) * 1.1 - 0.55;
      float rr = fract(ph) * 0.32;
      float dd = abs(length(p - c) - rr);
      ring += (1.0 - smoothstep(0.0, 0.025, dd)) * (1.0 - fract(ph));
    }
    float a = vD2.a * m;
    float sheen = (1.0 - smoothstep(0.0, 0.08, d)) * 0.5;
    return vec4(vD2.rgb * a + vD3.rgb * vD3.w * (ring + sheen) * m, a);
  }

  vec4 shadow(vec2 p, float r, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.08 + vec2(age * 0.05, 0.0) + seed).r;
    float m = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.35)) * grow * (1.0 - fadeK);
    float a = vD2.a * m;
    return vec4(vD2.rgb * a, a);
  }

  void main() {
    float age = uTime - vD0.x, life = vD0.y;
    if (age < 0.0 || age > life) discard;
    vec2 p = vP;
    float r = length(p);
    if (r > 1.0) discard;
    float an = atan(p.y, p.x) / TAU + 0.5;
    float g = clamp(age / max(vD1.x, 1e-3), 0.0, 1.0);
    float grow = 1.0 - (1.0 - g) * (1.0 - g) * (1.0 - g);
    float fadeK = clamp((age - (life - vD1.y)) / max(vD1.y, 1e-3), 0.0, 1.0);
    float seed = vD0.z, kind = vD0.w;
    vec4 o;
    if (kind < 0.5) o = frost(p, r, an, age, grow, fadeK, seed);
    else if (kind < 1.5) o = scorch(p, r, age, grow, fadeK, seed);
    else if (kind < 2.5) o = rune(p, r, an, age, grow, fadeK, seed);
    else if (kind < 3.5) o = crater(p, r, an, age, grow, fadeK, seed);
    else if (kind < 4.5) o = wet(p, r, age, grow, fadeK, seed);
    else o = shadow(p, r, age, grow, fadeK, seed);
    if (o.a < 0.002 && max(o.r, max(o.g, o.b)) < 0.002) discard;
    gl_FragColor = o * heroYieldGround(vPV);   // busy screen: ground marks yield around the hero
  }`;

// Per-kind defaults: grow / fade seconds, colour A (paint, alpha), colour B (accent, hdr), intensity, extra.
const DEFAULTS = {
  frost:  { grow: 0.6, fade: 0.6, a: [0xcfe9ff, 0.72], b: [0x2f5f8f, 1], intensity: 1, extra: 0 },
  scorch: { grow: 0.12, fade: 0.8, a: [0x24160f, 0.72], b: [0xffc04a, 2.2], intensity: 1, extra: 0.9 },
  rune:   { grow: 0.35, fade: 0.3, a: [0x140a24, 0.5], b: [0xb67cff, 1.35], intensity: 1, extra: 0 },
  crater: { grow: 0.08, fade: 1.0, a: [0x2a2018, 0.8], b: [0xb59a72, 1], intensity: 1, extra: 1.2 },
  wet:    { grow: 0.4, fade: 0.8, a: [0x1d3550, 0.38], b: [0xcfe8ff, 0.9], intensity: 1, extra: 0 },
  shadow: { grow: 0.5, fade: 0.6, a: [0x1a2236, 0.32], b: [0x000000, 1], intensity: 1, extra: 0 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

export class DecalSystem {
  constructor(scene, shared, cap = 128) {
    this.cap = cap;
    this.n = 0;
    this.handles = [];
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(), mk(), mk(), mk()];
    ['iD0', 'iD1', 'iD2', 'iD3'].forEach((name, i) => geo.setAttribute(name, this.attrs[i]));
    // the sun's ground direction (toward the sun) from engine.js SUN_OFFSET (-12, 34, 24)
    this.sun = new THREE.Vector2(-12, 24).normalize();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uNoise: { value: shared.noise }, uSunXZ: { value: this.sun }, uHeroView: shared.uHeroView, uHeroYield: shared.uHeroYield },
      vertexShader: VS, fragmentShader: FS,
      // OPAQUE list (custom blending still applies): drawn after the grass (renderOrder 0) and BEFORE the
      // creatures (3) and heroes (21). depthTest off so grass never hides it; units always draw over it.
      transparent: false, depthWrite: false, depthTest: false, ...shared.blend,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.time = 0;
  }

  // kind: 'frost'|'scorch'|'rune'|'crater'|'wet'|'shadow'. opts: { grow, fade, color, alpha, accent, hdr,
  // intensity, extra (scorch/crater: cooling rate), seed, yaw, y }. Returns { end(fade?), alive, pos, radius }.
  add(kind, pos, radius, life, opts = {}) {
    const D = DEFAULTS[kind];
    if (this.n >= this.cap) this._remove(0);
    const i = this.n++;
    const h = { pos: { x: pos.x, z: pos.z }, radius, life, birth: this.time, slot: i, sys: this,
      get alive() { return this.slot >= 0; },
      end(fade) {
        if (this.slot < 0) return;
        const a0 = this.sys.attrs[0].array, a1 = this.sys.attrs[1].array;
        const age = this.sys.time - this.birth;
        const f = fade ?? a1[this.slot * 4 + 1];
        this.life = Math.min(this.life, age + f);
        a0[this.slot * 4 + 1] = this.life; a1[this.slot * 4 + 1] = f;
        this.sys.attrs[0].needsUpdate = this.sys.attrs[1].needsUpdate = true;
      },
    };
    this.handles[i] = h;
    const [a0, a1, a2, a3] = this.attrs.map((a) => a.array);
    const o = i * 4;
    a0[o] = this.time; a0[o + 1] = life; a0[o + 2] = opts.seed ?? Math.random() * 10; a0[o + 3] = DECAL[kind];
    a1[o] = opts.grow ?? D.grow; a1[o + 1] = Math.min(opts.fade ?? D.fade, life * 0.5);
    a1[o + 2] = opts.intensity ?? D.intensity; a1[o + 3] = opts.extra ?? D.extra;
    _c.set(opts.color ?? D.a[0]); a2[o] = _c.r; a2[o + 1] = _c.g; a2[o + 2] = _c.b; a2[o + 3] = opts.alpha ?? D.a[1];
    _c.set(opts.accent ?? D.b[0]); a3[o] = _c.r; a3[o + 1] = _c.g; a3[o + 2] = _c.b; a3[o + 3] = opts.hdr ?? D.b[1];
    for (const a of this.attrs) a.needsUpdate = true;
    _q.setFromAxisAngle(_up, kind === 'crater' ? 0 : (opts.yaw ?? Math.random() * 6.283));
    _p.set(pos.x, opts.y ?? 0.05, pos.z);
    _s.set(radius, 1, radius);
    _m.compose(_p, _q, _s).toArray(this.mesh.instanceMatrix.array, i * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    return h;
  }

  _remove(i) {
    const last = --this.n;
    this.handles[i].slot = -1;
    if (i !== last) {
      for (const a of this.attrs) { const arr = a.array; for (let k = 0; k < 4; k++) arr[i * 4 + k] = arr[last * 4 + k]; a.needsUpdate = true; }
      const im = this.mesh.instanceMatrix.array;
      for (let k = 0; k < 16; k++) im[i * 16 + k] = im[last * 16 + k];
      this.mesh.instanceMatrix.needsUpdate = true;
      this.handles[i] = this.handles[last];
      this.handles[i].slot = i;
    }
    this.handles[last] = null;
  }

  update(time) {
    this.time = time;
    for (let i = this.n - 1; i >= 0; i--) if (time - this.handles[i].birth > this.handles[i].life) this._remove(i);
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
  }

  clear() { while (this.n > 0) this._remove(this.n - 1); this.mesh.count = 0; this.mesh.visible = false; }
}
