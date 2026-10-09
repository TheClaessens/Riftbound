import * as THREE from 'three';

// =====================================================================================
//  Ribbons: projectile trails AND lightning bolts in ONE pre-allocated dynamic mesh.
//  96 ribbons x 16 points, camera-facing strips built on the CPU each frame (~3k vertices),
//  no allocation after boot (replaces the per-call Line2 + LineGeometry + LineMaterial).
//    trail(target, opts)  follows target.pos / target (Vector3-like, read every frame); when
//                         stopped (projectile died) the tail retracts into the last point.
//    bolt(from, to, opts) midpoint-displaced forked lightning: white core, element glow,
//                         dark ink edge (reads on sunlit ground), flickers, fades in ~0.18 s.
//  Vertex attributes: position, aSide = (u along 0 head..1 tail, side -1..1, alpha, style),
//                     aCol = (rgb, hdr). style 0 = soft eroding trail, 1 = bolt.
// =====================================================================================

const SEG = 16;
const VS = /* glsl */`
  attribute vec4 aSide; attribute vec4 aCol;
  varying vec4 vSide; varying vec4 vCol;
  void main() { vSide = aSide; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */`
  uniform sampler2D uNoise; uniform float uTime;
  varying vec4 vSide; varying vec4 vCol;
  void main() {
    float u = vSide.x, s = abs(vSide.y), a = vSide.z;
    if (a < 0.003) discard;
    if (vSide.w < 0.5) {
      float n = texture(uNoise, vec2(u * 1.5 - uTime * 1.3, vSide.y * 0.2 + 0.37)).r;
      float body = 1.0 - smoothstep(0.55, 1.0, s);
      float core = 1.0 - smoothstep(0.1, 0.38, s);
      float keep = smoothstep(-0.06, 0.06, n + 0.3 - u * 0.95);       // the tail breaks into flecks
      float m = body * keep * a;
      if (m < 0.003) discard;
      vec3 rgb = vCol.rgb * vCol.w * (0.5 + 1.0 * core * (1.0 - u));
      gl_FragColor = vec4(rgb * m, m * 0.45);
    } else {
      float core = 1.0 - smoothstep(0.16, 0.28, s);
      float glow = 1.0 - smoothstep(0.42, 0.6, s);
      float ink = 1.0 - smoothstep(0.82, 1.0, s);
      vec3 rgb = mix(vCol.rgb * vCol.w * glow, vec3(2.4), core);
      gl_FragColor = vec4(rgb * a, ink * a * 0.75);
    }
  }`;

const _c = new THREE.Color();
const _v = new THREE.Vector3();

export class RibbonSystem {
  constructor(scene, shared, camera, max = 96) {
    this.max = max;
    this.camera = camera;
    const nv = max * SEG * 2;
    this.pos = new Float32Array(nv * 3);
    this.side = new Float32Array(nv * 4);
    this.col = new Float32Array(nv * 4);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSide = new THREE.BufferAttribute(this.side, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSide', this.aSide);
    geo.setAttribute('aCol', this.aCol);
    const idx = new Uint32Array(max * (SEG - 1) * 6);
    let k = 0;
    for (let r = 0; r < max; r++) {
      for (let i = 0; i < SEG - 1; i++) {
        const a = (r * SEG + i) * 2;
        idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + 2;
        idx[k++] = a + 1; idx[k++] = a + 3; idx[k++] = a + 2;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: shared.noise }, uTime: shared.uTime },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, ...shared.blend,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.slots = [];
    for (let r = 0; r < max; r++) this.slots.push({ id: r, live: false, pts: new Float32Array(SEG * 3), n: 0, age: 0 });
    this.free = this.slots.slice().reverse();
    this.live = [];
    this.viewDir = new THREE.Vector3(1, 1.22, 1).normalize();
  }

  _alloc() {
    let s = this.free.pop();
    if (!s) { s = this.live.shift(); this._clearSlot(s); }   // steal the oldest
    s.live = true; s.n = 0; s.age = 0; s.stopped = false; s.retract = 0;
    this.live.push(s);
    return s;
  }
  _clearSlot(s) {
    const base = s.id * SEG * 2;
    for (let v = 0; v < SEG * 2; v++) this.side[(base + v) * 4 + 2] = 0;
    this.pos.fill(0, base * 3, (base + SEG * 2) * 3);
    s.live = false;
  }

  // target: Vector3 / {x,y,z} read every frame (e.g. projectile.pos). opts: { color, width, hdr, life (max s), segLen }
  trail(target, opts = {}) {
    const s = this._alloc();
    s.style = 0; s.target = target;
    s.width = opts.width ?? 0.35; s.hdr = opts.hdr ?? 1.5; s.segLen = opts.segLen ?? 0.3;
    s.life = opts.life ?? 30;
    _c.set(opts.color ?? 0xffffff); s.r = _c.r; s.g = _c.g; s.b = _c.b;
    s.pts[0] = target.x; s.pts[1] = target.y ?? 0.9; s.pts[2] = target.z;
    s.pts[3] = target.x; s.pts[4] = target.y ?? 0.9; s.pts[5] = target.z;
    s.n = 2;
    return { stop: () => { s.stopped = true; }, slot: s };
  }

  // Forked lightning. opts: { color, width, hdr, life, jag, branches }
  bolt(from, to, opts = {}) {
    const main = this._boltStrand(from, to, Math.min(SEG, 12), opts.jag ?? 0.55, opts.width ?? 0.45, opts);
    const nb = opts.branches ?? 2;
    for (let b = 0; b < nb; b++) {
      const at = 2 + Math.floor(Math.random() * 6);
      const o = at * 3;
      const p = { x: main.pts[o], y: main.pts[o + 1], z: main.pts[o + 2] };
      const len = 1.2 + Math.random() * 1.6;
      const a = Math.random() * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * len, y: Math.max(0.2, p.y - len * (0.6 + Math.random() * 0.6)), z: p.z + Math.sin(a) * len };
      this._boltStrand(p, q, 6, 0.3, (opts.width ?? 0.45) * 0.55, opts);
    }
  }

  _boltStrand(from, to, n, jag, width, opts) {
    const s = this._alloc();
    s.style = 1; s.target = null; s.stopped = true;
    s.width = width; s.hdr = opts.hdr ?? 1.6; s.life = opts.life ?? 0.18;
    _c.set(opts.color ?? 0xffe14a); s.r = _c.r; s.g = _c.g; s.b = _c.b;
    const fy = from.y ?? 1, ty = to.y ?? 1;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const j = Math.sin(Math.PI * t) * jag;
      s.pts[i * 3] = from.x + (to.x - from.x) * t + (Math.random() * 2 - 1) * j;
      s.pts[i * 3 + 1] = fy + (ty - fy) * t + (Math.random() * 2 - 1) * j * 0.5;
      s.pts[i * 3 + 2] = from.z + (to.z - from.z) * t + (Math.random() * 2 - 1) * j;
    }
    s.n = n;
    return s;
  }

  update(dt) {
    if (this.camera) { this.camera.getWorldDirection(this.viewDir); this.viewDir.negate(); }
    const V = this.viewDir;
    for (let li = this.live.length - 1; li >= 0; li--) {
      const s = this.live[li];
      s.age += dt;
      const P = s.pts;
      if (s.style === 0) {
        if (!s.stopped) {
          // move the head; push a new point once it travelled segLen
          const tx = s.target.x, ty = s.target.y ?? 0.9, tz = s.target.z;
          const dx = tx - P[3], dy = ty - P[4], dz = tz - P[5];
          if (dx * dx + dy * dy + dz * dz > s.segLen * s.segLen) {
            const m = Math.min(s.n, SEG - 1);
            P.copyWithin(3, 0, m * 3);
            s.n = Math.min(SEG, s.n + 1);
          }
          P[0] = tx; P[1] = ty; P[2] = tz;
          if (s.age > s.life) s.stopped = true;
        } else {
          // retract: drop tail points at ~60 pts/s, then free
          s.retract += dt * 60;
          while (s.retract >= 1 && s.n > 1) { s.n--; s.retract -= 1; }
          if (s.n <= 1) { this._release(li); continue; }
        }
      } else if (s.age > s.life) { this._release(li); continue; }
      this._build(s, V);
    }
    this.aPos.needsUpdate = this.aSide.needsUpdate = this.aCol.needsUpdate = true;
    this.mesh.visible = this.live.length > 0;
  }

  _release(li) {
    const s = this.live[li];
    this.live.splice(li, 1);
    this._clearSlot(s);
    this.free.push(s);
  }

  _build(s, V) {
    const P = s.pts, n = s.n, base = s.id * SEG * 2;
    let alpha = 1;
    if (s.style === 1) {
      const k = s.age / s.life;
      alpha = (s.age < 0.04 ? 1 : (Math.random() < 0.7 ? 1 : 0.25)) * (1 - k * k);
    }
    for (let i = 0; i < SEG; i++) {
      const v0 = (base + i * 2) * 4, v1 = v0 + 4;
      if (i >= n) {
        // collapse unused points onto the last one (zero-area quads, nothing rasterised)
        const p0 = (base + i * 2) * 3, q = (n - 1) * 3;
        for (let k = 0; k < 3; k++) { this.pos[p0 + k] = P[q + k]; this.pos[p0 + 3 + k] = P[q + k]; }
        this.side[v0 + 2] = 0; this.side[v1 + 2] = 0;
        continue;
      }
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      _v.set(P[ia * 3] - P[ib * 3], P[ia * 3 + 1] - P[ib * 3 + 1], P[ia * 3 + 2] - P[ib * 3 + 2]);
      // side = tangent x view (camera-facing strip)
      let sx = _v.y * V.z - _v.z * V.y, sy = _v.z * V.x - _v.x * V.z, sz = _v.x * V.y - _v.y * V.x;
      const l = Math.hypot(sx, sy, sz) || 1;
      const u = n > 1 ? i / (n - 1) : 0;
      const w = s.style === 0 ? s.width * Math.pow(1 - u, 0.6) * 0.5 + 0.01 : s.width * 0.5;
      sx *= w / l; sy *= w / l; sz *= w / l;
      const p0 = (base + i * 2) * 3, p1 = p0 + 3;
      this.pos[p0] = P[i * 3] + sx; this.pos[p0 + 1] = P[i * 3 + 1] + sy; this.pos[p0 + 2] = P[i * 3 + 2] + sz;
      this.pos[p1] = P[i * 3] - sx; this.pos[p1 + 1] = P[i * 3 + 1] - sy; this.pos[p1 + 2] = P[i * 3 + 2] - sz;
      this.side[v0] = u; this.side[v0 + 1] = -1; this.side[v0 + 2] = alpha; this.side[v0 + 3] = s.style;
      this.side[v1] = u; this.side[v1 + 1] = 1; this.side[v1 + 2] = alpha; this.side[v1 + 3] = s.style;
      this.col[v0] = this.col[v1] = s.r; this.col[v0 + 1] = this.col[v1 + 1] = s.g;
      this.col[v0 + 2] = this.col[v1 + 2] = s.b; this.col[v0 + 3] = this.col[v1 + 3] = s.hdr;
    }
  }

  clear() { for (let li = this.live.length - 1; li >= 0; li--) this._release(li); this.mesh.visible = false; }
}
