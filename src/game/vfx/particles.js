import * as THREE from 'three';
import { RAMP_GLSL } from './textures.js';

// =====================================================================================
//  ParticleLayer: stateless GPU particles drawn as ONE instanced quad mesh.
//
//  The CPU only writes a particle once, at spawn (ring-buffer slot, partial upload via
//  addUpdateRange). Everything else is evaluated in the vertex shader from uTime:
//    motion   analytic gravity + linear drag (exact integral), or an inward-spiralling orbit
//    looks    colour/alpha and size/erosion/fill/ink over life from two RampAtlas rows
//    shape    sprite-atlas cell, rotation + spin, velocity-aligned stretch, ground-flat quads
//  Dead / not-yet-born slots collapse to a clipped point. No per-frame CPU loop, no sorting.
//
//  Per-instance attributes (vec4 each):
//    iA = p0.xyz, birth            (orbit: centre.x, y0, centre.z, birth)
//    iB = v0.xyz, life             (orbit: r0, angle0, angular speed, life)
//    iC = gravity, drag, size, row (orbit: rise speed, pull rate, size, row)
//    iD = rot0, spin, stretch, packed (cell + 16 * orient + 64 * mode)
//  orient: 0 camera billboard, 1 ground-flat, 2 orbit (camera billboard)
//  mode:   0 glow (blend-add: rgb emits, alpha occludes) | 1 paint (premultiplied, toon-lit)
// =====================================================================================

export const ORIENT = { camera: 0, ground: 1, orbit: 2 };

const VS = /* glsl */`
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
  uniform float uTime;
  uniform vec4 uHeroView;   // hero chest in view space (xyz), w = 1 when there is a hero
  ${RAMP_GLSL}
  varying vec2 vUv; varying vec4 vColor; varying vec4 vShape; varying vec3 vShade; varying float vMode;
  vec2 rot2(vec2 q, float a) { float c = cos(a), s = sin(a); return vec2(q.x * c - q.y * s, q.x * s + q.y * c); }
  void main() {
    float age = uTime - iA.w;
    float life = iB.w;
    vUv = vec2(0.0); vColor = vec4(0.0); vShape = vec4(0.0); vShade = vec3(0.0); vMode = 0.0;
    if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float t = age / life;
    float packed = iD.w + 0.5;
    float cell = mod(floor(packed), 16.0);
    float orient = mod(floor(packed / 16.0), 4.0);
    float mode = floor(packed / 64.0);
    vec3 pos; vec3 vel;
    if (orient > 1.5) {
      // inward spiral: r = r0 e^(-k t); angular speed grows as the radius shrinks (w = w0 e^(k t))
      float k = iC.y;
      float ek = exp(k * age);
      float r = iB.x / ek;
      float a = iB.y + iB.z * (k > 1e-3 ? (ek - 1.0) / k : age);
      float w = iB.z * ek;
      vec2 d = vec2(cos(a), sin(a));
      pos = vec3(iA.x + d.x * r, iA.y + iC.x * age, iA.z + d.y * r);
      vel = vec3(-d.y * r * w - d.x * k * r, iC.x, d.x * r * w - d.y * k * r);
    } else {
      // exact integral of dv/dt = g - k v
      vec3 g = vec3(0.0, -iC.x, 0.0);
      float k = iC.y;
      if (k < 1e-3) {
        pos = iA.xyz + iB.xyz * age + 0.5 * g * age * age;
        vel = iB.xyz + g * age;
      } else {
        vec3 vt = g / k;
        float e = exp(-k * age);
        pos = iA.xyz + vt * age + (iB.xyz - vt) * (1.0 - e) / k;
        vel = vt + (iB.xyz - vt) * e;
      }
      pos.y = max(pos.y, 0.04);
    }
    vec4 col = ramp(iC.w, t);           // rgb (linear, HDR ok), alpha
    vec4 shp = ramp(iC.w + 1.0, t);     // x size mult, y erosion, z fill alpha / occlusion, w ink
    float size = iC.z * shp.x;
    float ang = iD.x + iD.y * age;
    vec2 q = position.xy;               // quad corner, -0.5..0.5 (+y = sprite up)
    vec4 mv;
    if (orient > 0.5 && orient < 1.5) {
      // flat on the ground (ripples, gusts, scorch flecks); stretch aligns +y with XZ velocity
      vec2 o;
      if (iD.z > 0.0 && dot(vel.xz, vel.xz) > 1e-6) {
        float sp = length(vel.xz);
        vec2 ay = vel.xz / sp, ax = vec2(ay.y, -ay.x);
        o = ax * q.x * size + ay * q.y * size * (1.0 + iD.z * sp);
      } else {
        o = rot2(q, ang) * size;
      }
      mv = modelViewMatrix * vec4(pos.x + o.x, pos.y + 0.03, pos.z + o.y, 1.0);
    } else {
      mv = modelViewMatrix * vec4(pos, 1.0);
      vec2 o;
      if (iD.z > 0.0) {
        // velocity-aligned streak: +y follows the screen-space velocity, length grows with speed
        vec2 vv = (modelViewMatrix * vec4(vel, 0.0)).xy;
        float sp = length(vv);
        vec2 ay = sp > 1e-4 ? vv / sp : vec2(0.0, 1.0);
        vec2 ax = vec2(ay.y, -ay.x);
        o = ax * q.x * size + ay * q.y * size * (1.0 + iD.z * sp);
      } else {
        o = rot2(q, ang) * size;
      }
      mv.xy += o;
    }
    gl_Position = projectionMatrix * mv;
    vUv = (vec2(mod(cell, 4.0), floor(cell / 4.0)) + q + 0.5) * 0.25;
    // Painted sprites in front of the hero fade over it (stacked puffs stay see-through): player VFX never hide the hero (bible 10 §5.1).
    vec4 mc = modelViewMatrix * vec4(pos, 1.0);   // sprite centre (view space)
    if (mode > 0.5 && uHeroView.w > 0.5 && mc.z > uHeroView.z - 0.6) {
      float hd = length((mc.xy - uHeroView.xy) / vec2(0.85, 1.25)) - 0.5 * size;
      col.a *= mix(0.12, 1.0, smoothstep(0.55, 1.25, hd));   // low floor: billows stack
    }
    vColor = col; vShape = shp; vMode = mode;
    vShade = mode > 0.5 ? ramp(iC.w + 2.0, t).rgb : vec3(0.0);   // paint: shadow colour over life
  }`;

const FS = /* glsl */`
  uniform sampler2D uAtlas;
  varying vec2 vUv; varying vec4 vColor; varying vec4 vShape; varying vec3 vShade; varying float vMode;
  void main() {
    vec4 tx = texture(uAtlas, vUv);
    // erosion eats the shape from the noisy, thin parts first (stylised dissolve, not a fade)
    float v = tx.r - vShape.y * (1.25 * (1.0 - tx.b) + 0.2);
    float aa = max(fwidth(tx.r) * 0.8, 1e-3);
    float sil = smoothstep(0.30 - aa, 0.30 + aa, v);          // silhouette incl. ink band
    if (sil < 0.003) discard;
    float fill = smoothstep(0.47 - aa, 0.47 + aa, v);         // body
    vec3 base = vColor.rgb;
    float emitK = 1.0;
    if (vMode > 0.5) {
      base = mix(vShade, base, smoothstep(0.44, 0.56, tx.g));   // 2-tone toon light: shadow colour | lit colour
      emitK = vShape.z;                                        // premultiplied paint
    } else {
      base *= 1.0 + 0.4 * smoothstep(0.7 - aa, 0.7 + aa, v);    // hard-edged hot core band (toon), blooms first
    }
    vec3 ink = min(vColor.rgb, vec3(1.0)) * 0.18;              // darker value of the same hue
    float inkA = (sil - fill) * vShape.w;
    float a = vColor.a;
    gl_FragColor = vec4((base * fill * emitK + ink * inkA) * a, (fill * vShape.z + inkA) * a);
  }`;

export class ParticleLayer {
  // shared: { uTime, atlas, ramps, blend }
  constructor(scene, shared, { capacity = 8192, renderOrder = 10, name = 'vfx-particles' } = {}) {
    this.cap = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aA = mk(); this.aB = mk(); this.aC = mk(); this.aD = mk();
    this.A = this.aA.array; this.B = this.aB.array; this.C = this.aC.array; this.D = this.aD.array;
    // never-born slots: life 0 -> clipped
    geo.setAttribute('iA', this.aA); geo.setAttribute('iB', this.aB);
    geo.setAttribute('iC', this.aC); geo.setAttribute('iD', this.aD);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uHeroView: shared.uHeroView,
        uAtlas: { value: shared.atlas },
        uRamp: { value: shared.ramps.tex },
        uRampRows: { value: shared.ramps.rows },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,   // ground-flat quads flip winding
      ...shared.blend,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = name;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.head = 0;
    this.spawned = 0;
    this.dirtyStart = 0;
    this.dirtyCount = 0;
    this.lastDeath = -1;
  }

  // Write one particle. Returns the slot. The oldest slot is recycled when the ring is full.
  spawn(px, py, pz, vx, vy, vz, birth, life, grav, drag, size, row, rot, spin, stretch, packed) {
    const i = this.head;
    this.head = (i + 1) % this.cap;
    if (this.dirtyCount === 0) this.dirtyStart = i;
    this.dirtyCount++;
    this.spawned++;
    const o = i * 4;
    const A = this.A, B = this.B, C = this.C, D = this.D;
    A[o] = px; A[o + 1] = py; A[o + 2] = pz; A[o + 3] = birth;
    B[o] = vx; B[o + 1] = vy; B[o + 2] = vz; B[o + 3] = life;
    C[o] = grav; C[o + 1] = drag; C[o + 2] = size; C[o + 3] = row;
    D[o] = rot; D[o + 1] = spin; D[o + 2] = stretch; D[o + 3] = packed;
    if (birth + life > this.lastDeath) this.lastDeath = birth + life;
    return i;
  }

  // Once per frame: upload only the slots written this frame (1-2 contiguous ranges).
  flush(time) {
    if (this.dirtyCount > 0) {
      const n = Math.min(this.dirtyCount, this.cap);
      for (const at of [this.aA, this.aB, this.aC, this.aD]) {
        if (n < this.cap) {
          const s = this.dirtyStart, e = s + n;
          if (e <= this.cap) at.addUpdateRange(s * 4, n * 4);
          else { at.addUpdateRange(s * 4, (this.cap - s) * 4); at.addUpdateRange(0, (e - this.cap) * 4); }
        }
        at.needsUpdate = true;
      }
      this.dirtyCount = 0;
    }
    this.geo.instanceCount = Math.min(this.cap, this.spawned);
    this.mesh.visible = time < this.lastDeath;
  }

  clear() {
    this.D.fill(0); this.B.fill(0);
    for (const at of [this.aB, this.aD]) { at.clearUpdateRanges(); at.needsUpdate = true; }
    this.head = 0; this.spawned = 0; this.dirtyCount = 0; this.lastDeath = -1;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}
