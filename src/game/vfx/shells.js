import * as THREE from 'three';
import { RAMP_GLSL } from './textures.js';

// =====================================================================================
//  Shells: noise-scrolled mesh effects (fire pillar, snow veil, tornado / vortex funnel,
//  explosion dome, swirling torus). One InstancedMesh per geometry kind => at most 4 draws
//  however many are alive. All animation (scroll, twist, wobble, erosion in/out) runs on the
//  GPU from per-instance attributes written once; the CPU only writes a matrix on spawn / move.
//
//  Look: field = scrollingNoise * verticalProfile - threshold; pixels with field < 0 are cut
//  (hard alpha erosion, AA'd with fwidth), and the colour comes from a STEPPED ramp indexed
//  by how deep inside the shape the pixel is => dark ink band at every eroded edge, then 2-3
//  flat colour bands. Erosion threshold rises at birth and death (shape grows / burns away).
//  Front faces fade toward the middle of the silhouette so a cylinder never hides its contents.
//
//  Per-instance (vec4): iS0 = birth, life, seed, rampRow   iS1 = tileX (integer!), tileY, scrollX, scrollY
//                       iS2 = twist, erode, wobble, mode    iS3 = fadeIn, fadeOut, hdr, frontAlpha
// =====================================================================================

const VS = /* glsl */`
  attribute vec4 iS0; attribute vec4 iS1; attribute vec4 iS2; attribute vec4 iS3;
  uniform float uTime;
  varying vec2 vUv; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vS3;
  varying float vAge; varying vec3 vNrmV; varying vec3 vPV;
  void main() {
    vAge = uTime - iS0.x;
    vec3 p = position;
    float wob = iS2.z * uv.y;
    p.x += sin(uv.y * 6.0 + vAge * 3.1 + iS0.z * 7.0) * wob;
    p.z += cos(uv.y * 5.0 + vAge * 2.7 + iS0.z * 5.0) * wob;
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    vec4 pv = modelViewMatrix * wp; vPV = pv.xyz;
    gl_Position = projectionMatrix * pv;
    vNrmV = normalMatrix * (mat3(instanceMatrix) * normal);
    vUv = uv; vS0 = iS0; vS1 = iS1; vS2 = iS2; vS3 = iS3;
  }`;

const FS = /* glsl */`
  uniform sampler2D uNoise;
  uniform vec4 uProfile;          // per geometry kind: base fade-in [x..y], top fade-out [z..w] on uv.y
  uniform vec4 uHeroView;         // hero chest in view space; shell parts in front of the hero fade to 30%
  ${RAMP_GLSL}
  varying vec2 vUv; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vS3;
  varying float vAge; varying vec3 vNrmV; varying vec3 vPV;
  void main() {
    float life = vS0.y;
    if (vAge < 0.0 || vAge > life) discard;
    vec2 uv = vUv;
    uv.x += uv.y * vS2.x;                                        // twist (spiral)
    vec2 sc = vS1.zw * vAge;
    float n1 = texture(uNoise, uv * vS1.xy + sc + vS0.z).r;
    float n2 = texture(uNoise, uv * vS1.xy * vec2(2.0, 1.5) + sc * vec2(1.7, 1.3) + vS0.z * 1.7 + 0.37).r;
    float n = n1 * n2 * 2.0;
    float prof = smoothstep(uProfile.x, uProfile.y, uv.y) * (1.0 - smoothstep(uProfile.z, uProfile.w, uv.y));
    float env = min(1.0, vAge / max(vS3.x, 1e-3)) * min(1.0, (life - vAge) / max(vS3.y, 1e-3));
    float f = n * prof - (vS2.y + (1.0 - env) * 0.8);
    float aa = max(fwidth(f), 1e-3);
    float m = smoothstep(-aa, aa, f);
    if (m < 0.003) discard;
    vec4 c = ramp(vS0.w, f / 0.45);                              // stepped ramp: ink -> body -> highlight
    float facing = abs(normalize(vNrmV).z);
    float front = gl_FrontFacing ? mix(1.0, vS3.w, facing * facing) : 1.0;
    float hk = 1.0;
    if (uHeroView.w > 0.5 && vPV.z > uHeroView.z - 0.6) hk = mix(0.3, 1.0, smoothstep(0.45, 1.0, length((vPV.xy - uHeroView.xy) / vec2(0.85, 1.25))));
    float a = c.a * m * front * hk;
    if (vS2.w > 0.5) gl_FragColor = vec4(c.rgb * a, a);          // paint (premultiplied)
    else gl_FragColor = vec4(c.rgb * vS3.z * m * front * hk, a);  // glow: rgb emits, alpha occludes
  }`;

function geometryFor(kind) {
  switch (kind) {
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1, 28, 4, true).translate(0, 0.5, 0);
    case 'funnel': return new THREE.CylinderGeometry(1, 0.22, 1, 28, 8, true).translate(0, 0.5, 0);
    case 'dome': return new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'torus': return new THREE.TorusGeometry(1, 0.22, 8, 40).rotateX(-Math.PI / 2);
    default: throw new Error(`unknown shell kind ${kind}`);
  }
}
const PROFILE = {
  cylinder: [0.0, 0.18, 0.55, 1.0],
  funnel: [0.0, 0.25, 0.75, 1.0],
  dome: [-0.1, 0.15, 0.9, 1.01],
  torus: [-1.0, -0.5, 2.0, 2.5],
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

class ShellPool {
  constructor(scene, kind, shared, cap) {
    this.kind = kind;
    this.cap = cap;
    this.n = 0;
    this.handles = [];
    const geo = geometryFor(kind);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(), mk(), mk(), mk()];
    ['iS0', 'iS1', 'iS2', 'iS3'].forEach((name, i) => geo.setAttribute(name, this.attrs[i]));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime, uNoise: { value: shared.noise }, uHeroView: shared.uHeroView,
        uRamp: { value: shared.ramps.tex }, uRampRows: { value: shared.ramps.rows },
        uProfile: { value: new THREE.Vector4(...PROFILE[kind]) },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, ...shared.blend,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  _write(i, h) {
    _q.setFromAxisAngle(_up, h.yaw);
    _p.set(h.pos.x, (h.pos.y ?? 0) + h.y, h.pos.z);
    _s.set(h.radius, h.height, h.radius);
    _m.compose(_p, _q, _s).toArray(this.mesh.instanceMatrix.array, i * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  add(h, st, time) {
    if (this.n >= this.cap) this._remove(0);
    const i = this.n++;
    h.slot = i;
    this.handles[i] = h;
    const [a0, a1, a2, a3] = this.attrs.map((a) => a.array);
    const o = i * 4;
    a0[o] = time; a0[o + 1] = h.life; a0[o + 2] = Math.random() * 10; a0[o + 3] = st.row;
    a1[o] = st.tile[0]; a1[o + 1] = st.tile[1]; a1[o + 2] = st.scroll[0]; a1[o + 3] = st.scroll[1];
    a2[o] = st.twist ?? 0; a2[o + 1] = st.erode ?? 0.2; a2[o + 2] = st.wobble ?? 0; a2[o + 3] = st.mode === 'paint' ? 1 : 0;
    a3[o] = st.fade?.[0] ?? 0.25; a3[o + 1] = st.fade?.[1] ?? 0.35; a3[o + 2] = st.hdr ?? 1; a3[o + 3] = st.frontAlpha ?? 1;
    for (const a of this.attrs) a.needsUpdate = true;
    this._write(i, h);
  }

  _remove(i) {
    const last = --this.n;
    const h = this.handles[i];
    if (h) h.slot = -1;
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
    for (let i = this.n - 1; i >= 0; i--) {
      const h = this.handles[i];
      if (time - h.birth > h.life) { this._remove(i); continue; }
      if (h.follow || h.dirty) { this._write(i, h); h.dirty = false; }
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
  }
}

export class ShellSystem {
  constructor(scene, shared, cap = 32) {
    this.scene = scene; this.shared = shared; this.cap = cap;
    this.pools = {};
    this.time = 0;
  }
  _pool(kind) { return this.pools[kind] ??= new ShellPool(this.scene, kind, this.shared, this.cap); }

  // st: compiled shell style (see presets.js). opts: { radius, height, y, life, yaw, follow }
  // Returns a handle: { pos (live if follow), radius, height, end(fadeOut?), alive }.
  add(st, pos, opts, time) {
    const pool = this._pool(st.geo);
    const sys = this;
    const h = {
      pos: opts.follow ? pos : { x: pos.x, y: pos.y ?? 0, z: pos.z },
      radius: opts.radius ?? 1, height: opts.height ?? opts.radius ?? 1, y: opts.y ?? 0,
      yaw: opts.yaw ?? Math.random() * 6.283, life: opts.life ?? 1, birth: time,
      follow: !!opts.follow, dirty: false, slot: -1, pool,
      get alive() { return this.slot >= 0; },
      // set radius/height then call touch() to re-upload the matrix
      touch() { this.dirty = true; },
      end(fadeOut = st.fade?.[1] ?? 0.35) {
        if (this.slot < 0) return;
        this.life = Math.min(this.life, sys.time - this.birth + fadeOut);
        pool.attrs[0].array[this.slot * 4 + 1] = this.life;
        pool.attrs[0].needsUpdate = true;
      },
    };
    pool.add(h, st, time);
    return h;
  }

  update(time) { this.time = time; for (const p of Object.values(this.pools)) p.update(time); }
  clear() { for (const p of Object.values(this.pools)) { while (p.n > 0) p._remove(p.n - 1); p.mesh.count = 0; p.mesh.visible = false; } }
}
