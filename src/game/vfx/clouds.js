import * as THREE from 'three';
import { HERO_YIELD_GLSL } from './heroYield.js';

// =====================================================================================
//  Clouds: stacked low-poly puffs, toon-lit (2 bands from the real sun direction, darker
//  undersides), boiling vertex wobble, dark outline hull like the creatures, internal
//  lightning flash. 2 instanced draws for ALL clouds (body + hull). Opaque, so they never
//  sort against other transparents; see-through is a screen-door dither (per-cloud alpha),
//  which the VFX uses to fade a cloud whenever the player stands in its screen footprint.
// =====================================================================================

const BAYER = /* glsl */`
  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    // 4x4 Bayer matrix, row-major, /16
    float m = 0.0;
    if (i < 1.0) m = 0.0; else if (i < 2.0) m = 8.0; else if (i < 3.0) m = 2.0; else if (i < 4.0) m = 10.0;
    else if (i < 5.0) m = 12.0; else if (i < 6.0) m = 4.0; else if (i < 7.0) m = 14.0; else if (i < 8.0) m = 6.0;
    else if (i < 9.0) m = 3.0; else if (i < 10.0) m = 11.0; else if (i < 11.0) m = 1.0; else if (i < 12.0) m = 9.0;
    else if (i < 13.0) m = 15.0; else if (i < 14.0) m = 7.0; else if (i < 15.0) m = 13.0; else m = 5.0;
    return (m + 0.5) / 16.0;
  }`;

const VS = /* glsl */`
  attribute vec4 iCl0; attribute vec4 iCl1;   // lit rgb + flash, shadow rgb + alpha
  uniform float uTime; uniform float uOutline;
  varying vec3 vN; varying vec4 vC0; varying vec4 vC1; varying vec3 vPV;
  void main() {
    float ph = float(gl_InstanceID) * 1.73;
    vec3 p = position + normal * 0.06 * sin(uTime * 2.2 + position.y * 4.0 + position.x * 3.0 + ph);
    #ifdef HULL
      float s = length(instanceMatrix[0].xyz);
      p += normal * uOutline / max(s, 0.01);
    #endif
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    vN = normalize(mat3(instanceMatrix) * normal);
    vC0 = iCl0; vC1 = iCl1;
    vec4 pv = modelViewMatrix * wp; vPV = pv.xyz;
    gl_Position = projectionMatrix * pv;
  }`;

const FS = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vN; varying vec4 vC0; varying vec4 vC1; varying vec3 vPV;
  ${BAYER}
  ${HERO_YIELD_GLSL}
  void main() {
    float ca = vC1.a * heroYield(vPV);          // busy screen: screen-door the puffs near the hero too
    if (ca < 0.999 && ca < bayer4(gl_FragCoord.xy)) discard;
    #ifdef HULL
      gl_FragColor = vec4(vC1.rgb * 0.26 + vec3(1.0, 0.97, 0.85) * vC0.a * 0.15, 1.0);
    #else
      vec3 n = normalize(vN);
      float lit = smoothstep(0.02, 0.1, dot(n, uSunDir));
      float under = smoothstep(-0.15, -0.55, n.y);
      vec3 col = mix(vC1.rgb, vC0.rgb, lit) * (1.0 - 0.3 * under);
      col += vec3(1.0, 0.95, 0.75) * vC0.a * (0.45 - 0.25 * under);  // flash from inside (underside stays darker)
      gl_FragColor = vec4(col, 1.0);
    #endif
  }`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color();

export const CLOUD_STYLE = {
  snow:  { lit: 0xf4f8ff, shadow: 0x9fb4d0, puffs: 7 },
  storm: { lit: 0x9aa3b8, shadow: 0x4a5266, puffs: 10 },
  ash:   { lit: 0x8c7f78, shadow: 0x4a3f3a, puffs: 8 },
};

export class CloudSystem {
  constructor(scene, shared, cap = 160) {
    this.cap = cap;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.a0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iCl0', this.a0);
    geo.setAttribute('iCl1', this.a1);
    // sun direction (toward the sun) from engine.js SUN_OFFSET
    const sun = new THREE.Vector3(-12, 34, 24).normalize();
    const common = { uTime: shared.uTime, uSunDir: { value: sun }, uOutline: { value: 0.06 }, uHeroView: shared.uHeroView, uHeroYield: shared.uHeroYield };
    this.uniforms = common;
    this.body = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: common, vertexShader: VS, fragmentShader: FS }), cap);
    this.hull = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: common, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, defines: { HULL: 1 } }), cap);
    this.hull.instanceMatrix = this.body.instanceMatrix;     // one upload drives both
    for (const m of [this.body, this.hull]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; m.visible = false;
      scene.add(m);
    }
    this.clouds = [];
  }

  // opts: { radius (m), height (m), style: 'snow'|'storm'|'ash', life, puffs, back (m: push the cloud up-screen,
  // along engine.forward, so it does not cover the zone it rains on) }
  add(pos, opts = {}) {
    const back = (opts.back ?? 0) * 0.7071;
    const st = CLOUD_STYLE[opts.style ?? 'snow'];
    const R = opts.radius ?? 3;
    const n = opts.puffs ?? st.puffs;
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const rr = i === 0 ? 0 : R * (0.35 + Math.random() * 0.45);
      const big = i === 0 ? 1.25 : 0.75 + Math.random() * 0.45;
      puffs.push({ a, rr, y: (Math.random() * 2 - 1) * 0.35 + (i === 0 ? 0.35 : 0), s: R * 0.36 * big, delay: i * 0.035 });
    }
    const c = {
      pos: { x: pos.x - back, y: opts.height ?? 4.5, z: pos.z - back }, R, puffs, st,
      age: 0, life: opts.life ?? 4, flashV: 0, alpha: 1, spin: (Math.random() < 0.5 ? -1 : 1) * 0.12, dead: false,
      flash(k = 1) { this.flashV = Math.max(this.flashV, k); },
      end() { this.life = Math.min(this.life, this.age + 0.35); },
    };
    this.clouds.push(c);
    return c;
  }

  // focus: ground point that must stay visible (player). A point at height h on the iso camera covers
  // the ground ~1.16 h further up-screen (camera elevation 40.8 deg), along engine.forward (-1,0,-1)/sqrt2.
  update(dt, focus) {
    const inst = this.body.instanceMatrix.array, A0 = this.a0.array, A1 = this.a1.array;
    let k = 0;
    for (let ci = this.clouds.length - 1; ci >= 0; ci--) {
      const c = this.clouds[ci];
      c.age += dt;
      if (c.age >= c.life) { this.clouds.splice(ci, 1); continue; }
      c.flashV *= Math.exp(-dt * 16);
      let want = 1;
      if (focus) {
        const off = 1.16 * c.pos.y * 0.7071;
        const gx = c.pos.x - off, gz = c.pos.z - off;
        const d = Math.hypot(focus.x - gx, focus.z - gz);
        want = d < c.R + 1.5 ? 0.45 : 1;
      }
      c.alpha += (want - c.alpha) * (1 - Math.exp(-dt * 6));
      const out = Math.min(1, (c.life - c.age) / 0.35);
      _c.set(c.st.lit); const lr = _c.r, lg = _c.g, lb = _c.b;
      _c.set(c.st.shadow);
      for (const p of c.puffs) {
        if (k >= this.cap) break;
        const g = Math.min(1, Math.max(0, (c.age - p.delay) / 0.3));
        const back = 1 + 2.2 * Math.pow(g - 1, 3) + 1.2 * Math.pow(g - 1, 2);   // easeOutBack
        const s = p.s * Math.max(0, back) * out;
        const a = p.a + c.age * c.spin;
        _p.set(c.pos.x + Math.cos(a) * p.rr, c.pos.y + p.y, c.pos.z + Math.sin(a) * p.rr);
        _e.set(0, a, 0); _q.setFromEuler(_e);
        _s.set(s, s * 0.62, s);
        _m.compose(_p, _q, _s).toArray(inst, k * 16);
        const o = k * 4;
        A0[o] = lr; A0[o + 1] = lg; A0[o + 2] = lb; A0[o + 3] = c.flashV;
        A1[o] = _c.r; A1[o + 1] = _c.g; A1[o + 2] = _c.b; A1[o + 3] = c.alpha;
        k++;
      }
    }
    for (const m of [this.body, this.hull]) { m.count = k; m.visible = k > 0; }
    if (k > 0) { this.body.instanceMatrix.needsUpdate = true; this.a0.needsUpdate = true; this.a1.needsUpdate = true; }
  }

  clear() { this.clouds.length = 0; for (const m of [this.body, this.hull]) { m.count = 0; m.visible = false; } }
}
