import * as THREE from 'three';
import { mulberry32 } from './textures.js';

// =====================================================================================
//  Debris: physical chunks (rocks, ice shards, embers, crystal splinters) as TWO instanced,
//  flat-shaded MeshLambert draws lit by the scene sun/hemi (they sit in the world, not on top
//  of it). CPU physics (gravity, ground bounce, friction, tumble), fixed capacity, swap-remove.
//  Per-instance emissive (rgb) via a 3-float attribute so embers glow then cool to charcoal.
//  Fade-out = shrink to 0 (no transparency, stays in the opaque pass, casts shadows).
//
//  Kinds: { geo: 'chunk'|'shard', color, emis:[hex, hdr], cool (s), scale:[min,max],
//           stretch (y scale mult), speed:[min,max], up, gravity, bounce, life:[min,max] }
//  sprout(kind, pos, opts): a static crystal that grows out of the ground with overshoot,
//  holds, then shatters into `shatter` small pieces of the same kind.
// =====================================================================================

export const DEBRIS = {
  rock:     { geo: 'chunk', color: 0x7a6a58, scale: [0.12, 0.26], speed: [4, 8], up: 1.1, gravity: 26, bounce: 0.35, life: [0.9, 1.4] },
  dirt:     { geo: 'chunk', color: 0x5d4a36, scale: [0.07, 0.14], speed: [3, 6], up: 1.3, gravity: 26, bounce: 0.25, life: [0.6, 1.0] },
  ember:    { geo: 'chunk', color: 0x2a1a14, emis: [0xff7a2a, 2.2], cool: 0.9, scale: [0.07, 0.14], speed: [5, 10], up: 1.2, gravity: 22, bounce: 0.3, life: [0.8, 1.3] },
  ice:      { geo: 'shard', color: 0x9fd0ee, emis: [0x66d9ff, 0.15], scale: [0.08, 0.16], stretch: 2.2, speed: [4, 8], up: 0.9, gravity: 26, bounce: 0.3, life: [0.7, 1.1] },
  crystal:  { geo: 'shard', color: 0xa98ad8, emis: [0xb67cff, 0.9], cool: 1.5, scale: [0.08, 0.15], stretch: 2.4, speed: [4, 9], up: 0.8, gravity: 20, bounce: 0.3, life: [0.7, 1.1] },
  iceSpike: { geo: 'shard', color: 0xa8d8f2, emis: [0x66d9ff, 0.12], scale: [0.28, 0.42], stretch: 3.2, life: [2, 2], shatter: 'ice' },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function chunkGeometry() {
  // low-poly rock: icosahedron with seeded per-vertex jitter, non-indexed -> flat facets
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position');
  const rnd = mulberry32(7);
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (!jit.has(k)) jit.set(k, 0.75 + rnd() * 0.45);
    const s = jit.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.8, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

function patchEmissive(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iEmis;\nvarying vec3 vEmisD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmisD = iEmis;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmisD;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmisD;');
  };
  mat.customProgramCacheKey = () => 'vfx-debris-v1';
}

class DebrisPool {
  constructor(scene, geo, cap, castShadow) {
    this.cap = cap;
    this.n = 0;
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    patchEmissive(mat);
    this.emis = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iEmis', this.emis);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // SoA state
    this.P = new Float32Array(cap * 3); this.V = new Float32Array(cap * 3);
    this.R = new Float32Array(cap * 3); this.W = new Float32Array(cap * 3);
    this.S = new Float32Array(cap * 3);              // base scale xyz
    this.T = new Float32Array(cap * 4);              // age, life, cool time, mode (0 physics, 1 sprout)
    this.E = new Float32Array(cap * 3);              // emissive rgb at birth
    this.K = new Array(cap).fill(null);              // kind def (for sprout shatter)
    this.F = new Float32Array(cap * 2);              // gravity, bounce
    this._arrs = [[this.P, 3], [this.V, 3], [this.R, 3], [this.W, 3], [this.S, 3], [this.T, 4], [this.E, 3], [this.F, 2]];
  }

  alloc() {
    if (this.n < this.cap) return this.n++;
    // full: recycle the oldest-by-age-fraction slot 0 (cheap; debris is short-lived)
    return 0;
  }

  _copy(from, to) {
    for (const [arr, w] of this._arrs) {
      for (let k = 0; k < w; k++) arr[to * w + k] = arr[from * w + k];
    }
    this.K[to] = this.K[from];
    const c = this.mesh.instanceColor.array;
    c[to * 3] = c[from * 3]; c[to * 3 + 1] = c[from * 3 + 1]; c[to * 3 + 2] = c[from * 3 + 2];
  }

  update(dt, onShatter) {
    const P = this.P, V = this.V, R = this.R, W = this.W, S = this.S, T = this.T, E = this.E, F = this.F;
    const inst = this.mesh.instanceMatrix.array, em = this.emis.array;
    let i = 0;
    while (i < this.n) {
      const t4 = i * 4;
      T[t4] += dt;
      const age = T[t4], life = T[t4 + 1];
      if (age >= life) {
        if (T[t4 + 3] > 0.5 && this.K[i]?.shatter) onShatter(this.K[i], P[i * 3], P[i * 3 + 1], P[i * 3 + 2], S[i * 3]);
        const last = --this.n;
        if (i !== last) this._copy(last, i);
        continue;
      }
      const i3 = i * 3;
      let grow = 1;
      if (T[t4 + 3] < 0.5) {
        // physics
        V[i3 + 1] -= F[i * 2] * dt;
        P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
        const floor = S[i3 + 1] * 0.6;
        if (P[i3 + 1] < floor) {
          P[i3 + 1] = floor;
          if (V[i3 + 1] < -1.5) {
            V[i3 + 1] *= -F[i * 2 + 1];
            V[i3] *= 0.6; V[i3 + 2] *= 0.6;
            W[i3] *= 0.6; W[i3 + 1] *= 0.6; W[i3 + 2] *= 0.6;
          } else {
            V[i3 + 1] = 0; V[i3] *= Math.exp(-8 * dt); V[i3 + 2] *= Math.exp(-8 * dt);
            W[i3] *= Math.exp(-6 * dt); W[i3 + 1] *= Math.exp(-6 * dt); W[i3 + 2] *= Math.exp(-6 * dt);
          }
        }
        R[i3] += W[i3] * dt; R[i3 + 1] += W[i3 + 1] * dt; R[i3 + 2] += W[i3 + 2] * dt;
      } else {
        // sprout: overshoot grow-in over 0.22 s (easeOutBack)
        const k = Math.min(1, age / 0.22), c1 = 1.9;
        grow = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      }
      const out = Math.min(1, (life - age) / 0.25);
      const s = Math.max(0, grow * (T[t4 + 3] > 0.5 ? 1 : out));
      _e.set(R[i3], R[i3 + 1], R[i3 + 2]);
      _q.setFromEuler(_e);
      _p.set(P[i3], P[i3 + 1], P[i3 + 2]);
      _s.set(S[i3] * s, S[i3 + 1] * s, S[i3 + 2] * s);
      _m.compose(_p, _q, _s);
      _m.toArray(inst, i * 16);
      const cool = T[t4 + 2] > 0 ? Math.max(0, 1 - age / T[t4 + 2]) : 1;
      const ck = cool * cool;
      em[i3] = E[i3] * ck; em[i3 + 1] = E[i3 + 1] * ck; em[i3 + 2] = E[i3 + 2] * ck;
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      this.emis.needsUpdate = true;
    }
  }
}

export class DebrisSystem {
  constructor(scene, { cap = 384 } = {}) {
    this.pools = {
      chunk: new DebrisPool(scene, chunkGeometry(), cap, true),
      shard: new DebrisPool(scene, new THREE.OctahedronGeometry(1, 0), cap, false),
    };
    this._shatter = (kind, x, y, z, sc) => this.burst(kind.shatter, { x, y: 0, z }, 5, { scale: Math.max(0.6, sc * 2.5), speed: 0.6 });
  }

  // n chunks flying out from pos. opts: { scale, speed, dir:{x,z}, cone (0..1 how much they follow dir), color }
  burst(kindId, pos, n, opts = {}) {
    const k = DEBRIS[kindId];
    if (!k) return;
    const pool = this.pools[k.geo];
    const sc = opts.scale ?? 1, sp = opts.speed ?? 1;
    for (let j = 0; j < n; j++) {
      const i = pool.alloc();
      const i3 = i * 3;
      const a = Math.random() * Math.PI * 2;
      const s = (k.speed?.[0] ?? 3) + Math.random() * ((k.speed?.[1] ?? 6) - (k.speed?.[0] ?? 3));
      let dx = Math.cos(a), dz = Math.sin(a);
      if (opts.dir) { const c = opts.cone ?? 0.6; dx = dx * (1 - c) + opts.dir.x * c; dz = dz * (1 - c) + opts.dir.z * c; }
      pool.P[i3] = pos.x + dx * 0.2; pool.P[i3 + 1] = (pos.y ?? 0) + 0.3; pool.P[i3 + 2] = pos.z + dz * 0.2;
      pool.V[i3] = dx * s * sp; pool.V[i3 + 1] = s * sp * (k.up ?? 1) * (0.6 + Math.random() * 0.6); pool.V[i3 + 2] = dz * s * sp;
      for (let q = 0; q < 3; q++) { pool.R[i3 + q] = Math.random() * 6.28; pool.W[i3 + q] = (Math.random() * 2 - 1) * 12; }
      this._common(pool, i, k, sc, opts, 0);
    }
  }

  // A crystal that grows out of the ground and holds; shatters into k.shatter at the end.
  sprout(kindId, pos, opts = {}) {
    const k = DEBRIS[kindId];
    const pool = this.pools[k.geo];
    const i = pool.alloc();
    const i3 = i * 3;
    pool.P[i3] = pos.x; pool.P[i3 + 2] = pos.z;
    pool.V[i3] = pool.V[i3 + 1] = pool.V[i3 + 2] = 0;
    pool.W[i3] = pool.W[i3 + 1] = pool.W[i3 + 2] = 0;
    const tilt = opts.tilt ?? 0.35;
    pool.R[i3] = (Math.random() * 2 - 1) * tilt; pool.R[i3 + 1] = Math.random() * 6.28; pool.R[i3 + 2] = (Math.random() * 2 - 1) * tilt;
    this._common(pool, i, k, opts.scale ?? 1, opts, 1);
    pool.T[i * 4 + 1] = opts.life ?? k.life[0];
    pool.P[i3 + 1] = pool.S[i3 + 1] * 0.55;          // half buried
  }

  _common(pool, i, k, sc, opts, mode) {
    const i3 = i * 3;
    const s = (k.scale[0] + Math.random() * (k.scale[1] - k.scale[0])) * sc;
    const st = k.stretch ?? 1;
    pool.S[i3] = s; pool.S[i3 + 1] = s * st; pool.S[i3 + 2] = s * (0.8 + Math.random() * 0.4);
    const t4 = i * 4;
    pool.T[t4] = 0;
    pool.T[t4 + 1] = k.life[0] + Math.random() * (k.life[1] - k.life[0]);
    pool.T[t4 + 2] = k.cool ?? 0;
    pool.T[t4 + 3] = mode;
    pool.F[i * 2] = k.gravity ?? 24; pool.F[i * 2 + 1] = k.bounce ?? 0.3;
    _c.set(opts.color ?? k.color);
    const v = 0.85 + Math.random() * 0.3;
    const col = pool.mesh.instanceColor.array;
    col[i3] = _c.r * v; col[i3 + 1] = _c.g * v; col[i3 + 2] = _c.b * v;
    if (k.emis) { _c.set(k.emis[0]).multiplyScalar(k.emis[1]); pool.E[i3] = _c.r; pool.E[i3 + 1] = _c.g; pool.E[i3 + 2] = _c.b; }
    else pool.E[i3] = pool.E[i3 + 1] = pool.E[i3 + 2] = 0;
    pool.K[i] = k;
  }

  update(dt) { for (const p of Object.values(this.pools)) p.update(dt, this._shatter); }
  clear() { for (const p of Object.values(this.pools)) { p.n = 0; p.mesh.count = 0; p.mesh.visible = false; } }
}
