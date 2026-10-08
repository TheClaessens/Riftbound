import * as THREE from 'three';
import { GEO, randRange } from '../core/utils.js';

const MAX_PARTICLES = 5000;
const MAX_NUMBERS = 90;

// Visual effects: GPU point particles, expanding rings, lightning, pooled lights,
// ground telegraphs and DOM-based floating combat text.
export class FX {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.engine = game.engine;
    this.layer = document.getElementById('fx-layer');

    // ---- particles ----
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMax = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pSize0 = new Float32Array(MAX_PARTICLES);
    this.pCount = 0;
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pGeo = g;
    this.pMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 30 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float uScale;
        void main(){
          vColor = color; vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a, a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);

    // ---- transient meshes (rings, lightning, telegraphs) ----
    this.transients = [];

    // ---- pooled point lights (fixed count => no shader recompiles) ----
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      l.position.set(0, -100, 0);
      this.scene.add(l);
      this.lights.push({ light: l, life: 0, max: 1, intensity: 0 });
    }

    // ---- floating text ----
    this.texts = [];
    this.labelTimes = new Map();
    // "heat" rises with every effect spawned and decays over time; heavy
    // combat scales particle counts and flashes down to avoid white-out.
    this.heat = 0;
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // ---------- Particles ----------
  // opts: color (hex), count, speed, life, size, gravity, up (vertical bias), drag, spread (pos jitter), hdr (brightness)
  burst(pos, opts = {}) {
    const count = Math.max(1, Math.round((opts.count ?? 12) * this.budget()));
    this.heat += count;
    const speed = opts.speed ?? 4;
    const life = opts.life ?? 0.5;
    const size = opts.size ?? 0.35;
    const gravity = opts.gravity ?? 0;
    const up = opts.up ?? 0.6;
    const drag = opts.drag ?? 2;
    const spread = opts.spread ?? 0.1;
    const hdr = opts.hdr ?? 2.2;
    this._c.set(opts.color ?? 0xffffff).multiplyScalar(hdr);
    const y = pos.y ?? 0;
    for (let n = 0; n < count; n++) {
      if (this.pCount >= MAX_PARTICLES) return;
      const i = this.pCount++;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const vy = (Math.random() * 2 - 1 + up) * s * 0.6;
      this.pPos[i * 3] = pos.x + randRange(-spread, spread);
      this.pPos[i * 3 + 1] = y + 0.5 + randRange(-spread, spread);
      this.pPos[i * 3 + 2] = pos.z + randRange(-spread, spread);
      this.pVel[i * 3] = Math.cos(a) * s;
      this.pVel[i * 3 + 1] = vy;
      this.pVel[i * 3 + 2] = Math.sin(a) * s;
      this.pCol[i * 3] = this._c.r; this.pCol[i * 3 + 1] = this._c.g; this.pCol[i * 3 + 2] = this._c.b;
      const l = life * (0.6 + Math.random() * 0.4);
      this.pLife[i] = l; this.pMax[i] = l;
      this.pSize0[i] = size * (0.6 + Math.random() * 0.6);
      this.pGrav[i] = gravity; this.pDrag[i] = drag;
    }
  }

  // A single particle with explicit velocity (for trails).
  spark(pos, vel, opts = {}) {
    if (this.pCount >= MAX_PARTICLES) return;
    const i = this.pCount++;
    this._c.set(opts.color ?? 0xffffff).multiplyScalar(opts.hdr ?? 2.2);
    this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
    this.pVel[i * 3] = vel?.x ?? 0; this.pVel[i * 3 + 1] = vel?.y ?? 0; this.pVel[i * 3 + 2] = vel?.z ?? 0;
    this.pCol[i * 3] = this._c.r; this.pCol[i * 3 + 1] = this._c.g; this.pCol[i * 3 + 2] = this._c.b;
    const l = opts.life ?? 0.4;
    this.pLife[i] = l; this.pMax[i] = l;
    this.pSize0[i] = opts.size ?? 0.3;
    this.pGrav[i] = opts.gravity ?? 0; this.pDrag[i] = opts.drag ?? 1;
  }

  // ---------- Rings / shockwaves ----------
  // Expanding flat ring on the ground. opts: color, radius, life, from (start radius), width (0..1 thickness), hdr, y
  ring(pos, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ color: opts.color ?? 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.color.multiplyScalar(opts.hdr ?? 2.5);
    const inner = 1 - (opts.width ?? 0.18);
    const geo = new THREE.RingGeometry(inner, 1, 48);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, (opts.y ?? 0.08), pos.z);
    this.scene.add(m);
    const life = opts.life ?? 0.4, r1 = opts.radius ?? 3, r0 = opts.from ?? 0.2;
    this.transients.push({
      mesh: m, t: 0, life,
      update: (tr, k) => { const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k)); m.scale.set(r, r, r); mat.opacity = 1 - k; },
    });
  }

  // Filled glowing disc that fades (explosion core). opts: color, radius, life
  flashDisc(pos, opts = {}) {
    this.heat += 12;
    if (this.heat > 260) return;
    const fade = this.budget();
    const mat = new THREE.MeshBasicMaterial({ color: opts.color ?? 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.color.multiplyScalar(opts.hdr ?? 1.6);
    const m = new THREE.Mesh(GEO.disc, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.06, pos.z);
    const r = opts.radius ?? 2;
    m.scale.setScalar(r);
    this.scene.add(m);
    this.transients.push({ mesh: m, t: 0, life: opts.life ?? 0.25, ownGeo: false, update: (tr, k) => { mat.opacity = (1 - k) * 0.7 * fade; m.scale.setScalar(r * (0.7 + 0.3 * k)); } });
  }

  // Jagged lightning between two points. opts: color, life, jag, width(lines), segments
  lightning(from, to, opts = {}) {
    const segs = opts.segments ?? 8;
    const jag = opts.jag ?? 0.45;
    const life = opts.life ?? 0.16;
    const y0 = from.y ?? 1, y1 = to.y ?? 1;
    const group = new THREE.Group();
    const mats = [];
    for (let strand = 0; strand < (opts.strands ?? 2); strand++) {
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const j = i === 0 || i === segs ? 0 : jag;
        pts.push(new THREE.Vector3(
          from.x + (to.x - from.x) * t + randRange(-j, j),
          y0 + (y1 - y0) * t + randRange(-j, j) * 0.6,
          from.z + (to.z - from.z) * t + randRange(-j, j)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: opts.color ?? 0xffe14a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      mat.color.multiplyScalar(strand === 0 ? 4 : 2);
      mats.push(mat);
      group.add(new THREE.Line(geo, mat));
    }
    this.scene.add(group);
    this.transients.push({
      mesh: group, t: 0, life, group: true,
      update: (tr, k) => { for (const m of mats) m.opacity = 1 - k; },
    });
    // Sparks at the impact point
    this.burst({ x: to.x, y: 0.5, z: to.z }, { color: opts.color ?? 0xffe14a, count: 5, speed: 5, life: 0.25, size: 0.25 });
  }

  // Ground circle that fills up over `duration`, then calls onDone. Returns handle with cancel().
  telegraph(pos, radius, duration, opts = {}) {
    const color = opts.color ?? 0xff3344;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    ringMat.color.multiplyScalar(1.6);
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), ringMat);
    const fill = new THREE.Mesh(GEO.disc, fillMat);
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(radius);
    fill.position.y = 0.01;
    group.add(ring, fill);
    group.position.set(pos.x, 0.07, pos.z);
    this.scene.add(group);
    const handle = { done: false, cancel: () => { handle.done = true; } };
    this.transients.push({
      mesh: group, t: 0, life: duration, group: true,
      update: (tr, k) => {
        if (handle.done) { tr.t = tr.life; return; }
        fill.scale.setScalar(Math.max(0.01, radius * k));
        ringMat.opacity = 0.5 + 0.5 * Math.sin(k * 30);
      },
      onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
    });
    return handle;
  }

  // Rectangular ground telegraph from `from` along `dir` (XZ unit). Fills along its length over `duration`,
  // then calls opts.onDone. Returns handle with cancel(). opts: color, onDone
  lineTelegraph(from, dir, length, width, duration, opts = {}) {
    const color = opts.color ?? 0xff3344;
    const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    edgeMat.color.multiplyScalar(1.6);
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const group = new THREE.Group();
    const edge = new THREE.Mesh(GEO.plane, edgeMat);
    edge.rotation.x = -Math.PI / 2; edge.scale.set(width, length, 1); edge.position.z = length / 2;
    const fill = new THREE.Mesh(GEO.plane, fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.y = 0.01;
    group.add(edge, fill);
    group.position.set(from.x, 0.07, from.z);
    group.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(group);
    const handle = { done: false, cancel: () => { handle.done = true; } };
    this.transients.push({
      mesh: group, t: 0, life: duration, group: true, keepMaterials: false,
      update: (tr, k) => {
        if (handle.done) { tr.t = tr.life; return; }
        const l = Math.max(0.01, length * k);
        fill.scale.set(width * 0.9, l, 1); fill.position.z = l / 2;
        edgeMat.opacity = 0.25 + 0.25 * Math.sin(k * 30);
      },
      onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
    });
    return handle;
  }

  // Take ownership of a dead enemy's mesh: white-ish squash + shrink over `life`, then remove it.
  // Materials are NOT disposed here (enemies may share them); pass opts.onEnd to dispose clones.
  corpse(mesh, life = 0.12, opts = {}) {
    const s0 = mesh.scale.clone();
    this.transients.push({
      mesh, t: 0, life, keepMaterials: true,
      update: (tr, k) => { mesh.scale.set(s0.x * (1 + 0.4 * k), s0.y * (1 - 0.9 * k), s0.z * (1 + 0.4 * k)); },
      onEnd: opts.onEnd,
    });
  }

  // Short-lived dynamic light (pooled; at most 6 at once).
  light(pos, color = 0xffffff, intensity = 30, life = 0.25, distance = 10) {
    let slot = this.lights.find((l) => l.life <= 0) || this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.light.position.set(pos.x, 1.5, pos.z);
    slot.intensity = intensity; slot.life = life; slot.max = life;
    slot.light.intensity = intensity;
  }

  // 1 when calm, falls toward ~0.25 in massive chain reactions.
  budget() { return 1 / (1 + this.heat / 120); }

  shake(amount) { this.engine.shake(amount); }

  // ---------- Floating text ----------
  number(pos, value, opts = {}) {
    if (this.texts.length >= MAX_NUMBERS) return;
    const v = Math.round(value);
    if (v <= 0) return;
    this._text(pos, String(v), opts.color ?? '#ffffff', opts.crit ? 'crit' : 'dmg', opts.crit ? 0.8 : 0.6);
  }
  // Big label (reaction names, "LEVEL UP", etc.)
  text(pos, str, color = '#ffffff', big = false) {
    const now = performance.now();
    if (now - (this.labelTimes.get(str) ?? -1e9) < 220) return;
    this.labelTimes.set(str, now);
    this._text(pos, str, color, big ? 'label big' : 'label', big ? 1.4 : 1.0);
  }
  _text(pos, str, color, cls, life) {
    const el = document.createElement('div');
    el.className = 'ftext ' + cls;
    el.textContent = str;
    el.style.color = color;
    this.layer.appendChild(el);
    this.texts.push({ el, x: pos.x + randRange(-0.3, 0.3), y: (pos.y ?? 0) + 1.6, z: pos.z + randRange(-0.3, 0.3), t: 0, life, vy: 1.8 });
  }

  update(dt) {
    this.heat *= Math.exp(-3 * dt);
    // particles (swap-remove dead)
    let i = 0;
    while (i < this.pCount) {
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        const last = --this.pCount;
        if (i !== last) this._copyParticle(last, i);
        continue;
      }
      const i3 = i * 3;
      const d = Math.exp(-this.pDrag[i] * dt);
      this.pVel[i3] *= d; this.pVel[i3 + 2] *= d;
      this.pVel[i3 + 1] = this.pVel[i3 + 1] * d - this.pGrav[i] * dt;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (this.pPos[i3 + 1] < 0.05) { this.pPos[i3 + 1] = 0.05; this.pVel[i3 + 1] *= -0.3; }
      const k = this.pLife[i] / this.pMax[i];
      this.pAlpha[i] = Math.min(1, k * 2);
      this.pSize[i] = this.pSize0[i] * (0.4 + 0.6 * k);
      i++;
    }
    this.pGeo.setDrawRange(0, this.pCount);
    for (const n of ['position', 'color', 'size', 'alpha']) this.pGeo.attributes[n].needsUpdate = true;
    this.pMat.uniforms.uScale.value = this.engine.pixelsPerUnit();

    // transients
    for (let t = this.transients.length - 1; t >= 0; t--) {
      const tr = this.transients[t];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.life);
      tr.update(tr, k);
      if (tr.t >= tr.life) {
        this.scene.remove(tr.mesh);
        if (!tr.keepMaterials) tr.mesh.traverse((o) => { if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.transients.splice(t, 1);
        tr.onEnd?.();
      }
    }

    // lights
    for (const l of this.lights) {
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity = Math.max(0, l.intensity * (l.life / l.max));
        if (l.life <= 0) l.light.intensity = 0;
      }
    }

    this.updateTexts(dt);
  }

  // Texts are positioned even while paused so they don't freeze mid-air oddly.
  updateTexts(dt) {
    const cam = this.engine.camera;
    for (let t = this.texts.length - 1; t >= 0; t--) {
      const tx = this.texts[t];
      tx.t += dt;
      tx.y += tx.vy * dt;
      tx.vy *= Math.exp(-3 * dt);
      const k = tx.t / tx.life;
      if (k >= 1) { tx.el.remove(); this.texts.splice(t, 1); continue; }
      this._v.set(tx.x, tx.y, tx.z).project(cam);
      const sx = (this._v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-this._v.y * 0.5 + 0.5) * innerHeight;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      tx.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${pop})`;
      tx.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
  }

  _copyParticle(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pPos[t3 + k] = this.pPos[f3 + k];
      this.pVel[t3 + k] = this.pVel[f3 + k];
      this.pCol[t3 + k] = this.pCol[f3 + k];
    }
    this.pLife[to] = this.pLife[from]; this.pMax[to] = this.pMax[from];
    this.pSize0[to] = this.pSize0[from]; this.pGrav[to] = this.pGrav[from]; this.pDrag[to] = this.pDrag[from];
    this.pSize[to] = this.pSize[from]; this.pAlpha[to] = this.pAlpha[from];
  }

  clear() {
    this.pCount = 0;
    for (const tr of this.transients) this.scene.remove(tr.mesh);
    this.transients.length = 0;
    for (const tx of this.texts) tx.el.remove();
    this.texts.length = 0;
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
  }
}
