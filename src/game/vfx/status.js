import * as THREE from 'three';
import { spr } from './elements/fire.js';
import { stormBolt } from './elements/storm.js';
import { orbitStar } from './elements/mixed.js';

// =====================================================================================
//  Status overlays for hundreds of GPU-instanced creatures (bible 10 §4.7). The always-on look lives
//  in the rig shader (creatures/rig.js "status looks": rime climbing from the feet to chill/freezeAt,
//  frozen ice tint + cracks, burn char + flame band on the top 40%, strobing shock crack-lines).
//  This file adds what needs real shape, all pooled and budgeted:
//    Frozen   a translucent faceted ice CRUST (~×1.15 the body, crystal edges, navy ink silhouette, sun
//             sheen) + a small ground ice footprint (r = 1.4 × radius). ONE instanced draw each. Grows in
//             with overshoot; cracks during the last 0.3 s (thaw drips); ends in 6 falling chips, or
//             shatters on death; a reaction that consumes the ice (Shatter / Steam) calls consume().
//             LOD: more than 12 frozen -> the sheen and inner crystal lines fade out and the crust / footprint
//             interiors thin (to 30% at ~40 frozen); the navy silhouette ink stays, so a frozen horde never
//             turns into one white mass over the hero and hostile telegraphs.
//    Burning  flame licks + soot from the upper body: 3 + 1 per second on the nearest 40 burning foes.
//    Shocked  2 px lemon arcs jumping between shocked foes within 2 u (<= 6 live, ~1 per 0.3 s each).
//    Stunned  3 starlight sparks orbiting the head (nearest 40).
//    Chilled  a cold breath puff every 1.5 s (nearest 30).
//  Reads enemy fields: dead, inert, pos, status.{frozen, burn, shock, stun, chill}, topY, baseRadius|radius, visScale.
// =====================================================================================

const NEAR_BURN = 40, NEAR_STUN = 40, NEAR_CHILL = 30;
const ARC_LIVE = 6;

// ---------------------------------------------------------------- crust geometry
// A jittered, slightly tapered 7-sided ice sleeve with a pointed cap and 3 small crystals at the base,
// normalised to xz [-1,1], y [0,1]. Non-indexed (flat facets) + barycentrics for crisp facet edges.
function crustGeometry() {
  const N = 7;
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rings = [[0.0, 0.9], [0.3, 1.0], [0.68, 0.96], [0.9, 0.62]];
  const R = rings.map(([y, r]) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (y * 1.7) + (rand() - 0.5) * 0.25;
      const rr = r * (0.9 + rand() * 0.14);
      out.push([Math.cos(a) * rr, y + (y > 0 && y < 0.95 ? (rand() - 0.5) * 0.06 : 0), Math.sin(a) * rr]);
    }
    return out;
  });
  const top = [0.06, 1.0, -0.04];
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let k = 0; k < R.length - 1; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      tri(R[k][i], R[k + 1][i], R[k][j]);
      tri(R[k][j], R[k + 1][i], R[k + 1][j]);
    }
  }
  const T = R[R.length - 1];
  for (let i = 0; i < N; i++) tri(T[i], top, T[(i + 1) % N]);
  // 3 small crystals jutting out of the base (the footprint spikes) + 2 on the shoulders
  const spike = (ang, y, len, w, tilt) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const base = [c * 0.92, y, s * 0.92];
    const dir = [c * Math.sin(tilt), Math.cos(tilt), s * Math.sin(tilt)];
    const tip = [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len];
    const px = [-s * w, 0, c * w], pz = [c * w * 0.6 * Math.cos(tilt), -w * 0.6 * Math.sin(tilt), s * w * 0.6 * Math.cos(tilt)];
    const b = [[base[0] + px[0], base[1] + px[1], base[2] + px[2]], [base[0] + pz[0], base[1] + pz[1], base[2] + pz[2]],
      [base[0] - px[0], base[1] - px[1], base[2] - px[2]], [base[0] - pz[0], base[1] - pz[1], base[2] - pz[2]]];
    for (let i = 0; i < 4; i++) tri(b[i], tip, b[(i + 1) % 4]);
  };
  spike(0.4, 0.0, 0.32, 0.1, 0.9); spike(2.5, 0.0, 0.26, 0.09, 1.0); spike(4.4, 0.0, 0.3, 0.1, 0.85);
  spike(1.3, 0.62, 0.22, 0.07, 1.1); spike(3.9, 0.7, 0.2, 0.07, 1.05);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // outward winding check (flip triangles whose normal points at the axis)
  const p = g.getAttribute('position').array;
  for (let t = 0; t < p.length; t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (p[t] + p[t + 3] + p[t + 6]) / 3, cy = (p[t + 1] + p[t + 4] + p[t + 7]) / 3 - 0.45, cz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3;
    if (nx * cx + ny * cy + nz * cz < 0) for (let k = 0; k < 3; k++) { const s = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = s; }
  }
  g.computeVertexNormals();
  const bary = new Float32Array((p.length / 3) * 3);
  for (let i = 0; i < p.length / 3; i++) bary[i * 3 + (i % 3)] = 1;
  g.setAttribute('aBary', new THREE.BufferAttribute(bary, 3));
  return g;
}

const CRUST_VS = /* glsl */`
  attribute vec4 iIce;          // freeze time, seed, thaw 0..1, alpha LOD
  attribute vec3 aBary;
  uniform float uTime;
  varying vec3 vN; varying vec3 vB; varying float vY; varying vec4 vI;
  void main() {
    float k = clamp((uTime - iIce.x) / 0.14, 0.0, 1.0);
    float g = 1.0 + 2.7 * pow(k - 1.0, 3.0) + 1.7 * pow(k - 1.0, 2.0);   // easeOutBack
    vec3 p = position * vec3(g, g, g);
    mat3 M = mat3(instanceMatrix);
    vec3 s2 = vec3(dot(M[0], M[0]), dot(M[1], M[1]), dot(M[2], M[2]));
    vN = normalize(normalMatrix * (M * (normal / max(s2, vec3(1e-6)))));
    vB = aBary; vY = position.y; vI = iIce;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const CRUST_FS = /* glsl */`
  uniform vec3 uSunV;
  varying vec3 vN; varying vec3 vB; varying float vY; varying vec4 vI;
  void main() {
    vec3 n = normalize(vN);
    float facing = abs(n.z);                       // ortho camera: view along -z
    float ndl = dot(n, uSunV);
    float e = min(vB.x, min(vB.y, vB.z));
    float edge = 1.0 - smoothstep(0.0, fwidth(e) * 1.6 + 1e-4, e);   // crisp facet edges (~1.5 px)
    float sil = 1.0 - smoothstep(0.22, 0.42, facing);                // silhouette facets
    float lod = vI.w, thaw = vI.z;
    // glass: nearly clear inside, a sun sheen on lit facets, a cold fresnel on the silhouette
    // LOD (many frozen): the sheen and the inner crystal lines go first; the navy silhouette ink stays
    float detail = smoothstep(0.5, 1.0, lod);
    vec3 col = mix(vec3(0.5, 0.76, 0.93), vec3(0.86, 0.95, 1.0), step(0.4, ndl));
    float a = 0.05 + 0.1 * step(0.4, ndl) * detail + 0.2 * sil;
    col = mix(col, vec3(0.9, 0.97, 1.0), smoothstep(0.86, 0.98, vY) * 0.6);   // rime on the cap
    a += smoothstep(0.86, 0.98, vY) * 0.12 * detail;
    // facet edges: white crystal lines inside, NAVY ink on the silhouette (reads on salt, snow and water)
    vec3 ink = vec3(0.04, 0.12, 0.26);
    vec3 lineCol = mix(vec3(0.88, 0.96, 1.0), ink, sil);
    float lineA = mix(0.42 * detail, 0.8, sil) * (1.0 + thaw * 0.8);
    col = mix(col, lineCol, edge);
    a = mix(a, lineA, edge);
    a *= mix(0.7, 1.0, detail) * (1.0 - 0.35 * thaw);
    gl_FragColor = vec4(col * a, a);              // premultiplied (BLEND_ADD); painted, never blooms
  }`;

const FOOT_VS = /* glsl */`
  attribute vec4 iFp;           // freeze time, seed, thaw, alpha LOD
  uniform float uTime;
  varying vec2 vP; varying vec2 vW; varying vec4 vF; varying float vG;
  void main() {
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vP = position.xz; vW = wp.xz; vF = iFp;
    vG = clamp((uTime - iFp.x) / 0.18, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }`;
const FOOT_FS = /* glsl */`
  uniform sampler2D uNoise;
  varying vec2 vP; varying vec2 vW; varying vec4 vF; varying float vG;
  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float an = atan(vP.y, vP.x);
    float g = 1.0 - (1.0 - vG) * (1.0 - vG);
    float lobe = 0.8 + 0.1 * sin(an * 6.0 + vF.y * 6.0) + 0.06 * sin(an * 11.0 - vF.y * 3.0);
    float d = lobe * g * (1.0 - vF.z * 0.4) - r;
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) discard;
    float band = 1.0 - smoothstep(0.0, 0.1, d);
    vec4 cell = texture(uNoise, vW * 0.35 + vF.y);
    float facet = 1.0 - smoothstep(0.0, 0.07, cell.b);
    vec3 col = mix(vec3(0.72, 0.87, 0.97), vec3(0.95), facet * 0.5);
    col = mix(col, vec3(0.08, 0.2, 0.36), band * 0.85);
    float a = mix(0.3 * vF.w, 0.7, band) * m;      // LOD thins the interior; the navy rim stays
    gl_FragColor = vec4(col * a, a);
  }`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _sunW = new THREE.Vector3(-12, 34, 24).normalize();
const _pt = { x: 0, y: 0, z: 0 };
const _q0 = [];
const rnd = (a, b) => a + Math.random() * (b - a);

// k nearest (to the hero) of list -> out (no allocation after warm-up)
const _d = [], _ix = [];
function nearest(list, from, k, out) {
  out.length = 0;
  const n = list.length;
  if (n <= k || !from) { for (let i = 0; i < n; i++) out.push(list[i]); return out; }
  _d.length = n; _ix.length = n;
  for (let i = 0; i < n; i++) { const e = list[i]; _d[i] = (e.pos.x - from.x) ** 2 + (e.pos.z - from.z) ** 2; _ix[i] = i; }
  _ix.sort(byD);
  for (let i = 0; i < k; i++) out.push(list[_ix[i]]);
  return out;
}
const byD = (a, b) => _d[a] - _d[b];

export class StatusVFX {
  constructor(vfx, cap = 384) {
    this.vfx = vfx;
    this.cap = cap;
    // crust
    const geo = crustGeometry();
    this.iIce = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iIce', this.iIce);
    this.u = { uTime: vfx.uTime, uSunV: { value: new THREE.Vector3() }, uNoise: { value: vfx.noise } };
    this.crust = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: CRUST_VS, fragmentShader: CRUST_FS,
      transparent: true, depthWrite: false, ...vfx.blend }), cap);
    this.crust.renderOrder = 7;           // after creatures (3); before hostile telegraphs (8) and the hero (21)
    this.crust.name = 'vfx-status-crust';
    // footprint
    const fgeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.iFp = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    fgeo.setAttribute('iFp', this.iFp);
    // OPAQUE list at renderOrder 1 like the vfx decals: after the grass, before every unit; depthTest off
    this.foot = new THREE.InstancedMesh(fgeo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: FOOT_VS, fragmentShader: FOOT_FS,
      transparent: false, depthWrite: false, depthTest: false, ...vfx.blend }), cap);
    this.foot.renderOrder = 1;
    this.foot.name = 'vfx-status-footprint';
    for (const m of [this.crust, this.foot]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; m.visible = false;
      vfx.scene.add(m);
    }
    this.frozenAt = new Map();      // enemy -> { t0, seed }
    this._burning = []; this._shocked = []; this._stunned = []; this._chilled = [];
    this._near = [];
    this.burnAcc = 0; this.burnRR = 0; this.sootAcc = 0;
    this.arcAcc = 0; this.arcRR = 0; this.arcEnd = new Float32Array(ARC_LIVE);
    this.stunT = 0; this._stunSeen = new Set(); this._stunNow = new Set();
    this.breathAcc = 0; this.breathRR = 0;
    this.dripAcc = 0;
    this._q = [];
    // compile both programs now (first use mid-fight would stall 20-60 ms per program)
    const R = vfx.game?.engine?.renderer;
    if (R?.compile && vfx.camera) {
      for (const m of [this.crust, this.foot]) { m.visible = true; try { R.compile(m, vfx.camera); } catch { /* first use compiles */ } m.visible = false; }
    }
  }

  // A reaction consumed this foe's ice (Shatter / Steam): drop the crust without thaw chips.
  // Returns true if it was frozen (encased).
  consume(e) {
    if (!e || !this.frozenAt.has(e)) return false;
    this.frozenAt.delete(e);
    return true;
  }

  update(dt, enemies, camera) {
    const vfx = this.vfx, now = vfx.time, game = vfx.game;
    if (camera) this.u.uSunV.value.copy(_sunW).transformDirection(camera.matrixWorldInverse);
    const hero = game.player?.pos ?? null;
    const B = this._burning, S = this._shocked, ST = this._stunned, CH = this._chilled;
    B.length = 0; S.length = 0; ST.length = 0; CH.length = 0;
    let nFrozen = 0;
    for (const e of enemies) {
      if (e.dead || e.inert || !e.status) continue;
      const st = e.status;
      if (st.frozen > 0) nFrozen++;
      else if (st.chill > 0) CH.push(e);
      if (st.burn > 0) B.push(e);
      if (st.shock > 0) S.push(e);
      if (st.stun > 0) ST.push(e);
    }

    // ---------------------------------------------------------------- frozen crust + footprint
    // LOD: <= 12 frozen = full; then thinner (down to 45% at ~45 frozen)
    const lod = nFrozen <= 12 ? 1 : Math.max(0.3, 1 - (nFrozen - 12) / 40);
    const inst = this.crust.instanceMatrix.array, ia = this.iIce.array;
    const finst = this.foot.instanceMatrix.array, fa = this.iFp.array;
    let n = 0;
    for (const e of enemies) {
      if (e.dead || e.inert || !e.status || !(e.status.frozen > 0)) continue;
      let rec = this.frozenAt.get(e);
      if (!rec) { rec = { t0: now, seed: Math.random() * 10 }; this.frozenAt.set(e, rec); }
      if (n >= this.cap) continue;
      const sc = e.visScale ?? 1, br = (e.baseRadius ?? e.radius ?? 0.5);
      const rad = Math.max(0.3, br * 1.12) * sc;
      const h = Math.max(0.6, (e.topY ?? 1.5) * 1.03) * sc;
      const thaw = Math.max(0, Math.min(1, 1 - e.status.frozen / 0.3));
      _q.setFromAxisAngle(_up, rec.seed * 2.3);
      _m.compose(_p.set(e.pos.x, 0, e.pos.z), _q, _s.set(rad, h, rad)).toArray(inst, n * 16);
      ia[n * 4] = rec.t0; ia[n * 4 + 1] = rec.seed; ia[n * 4 + 2] = thaw; ia[n * 4 + 3] = lod;
      const fr = Math.max(0.5, br * 1.4) * sc;
      _m.compose(_p.set(e.pos.x, 0.04, e.pos.z), _q, _s.set(fr, 1, fr)).toArray(finst, n * 16);
      fa[n * 4] = rec.t0; fa[n * 4 + 1] = rec.seed; fa[n * 4 + 2] = thaw; fa[n * 4 + 3] = lod;
      // thaw: meltwater drips off the crust (budgeted)
      if (thaw > 0 && n < 24) {
        this.dripAcc += dt * 6;
        if (this.dripAcc >= 1) {
          this.dripAcc -= 1;
          const a = Math.random() * 6.283;
          spr(vfx, 'mixedDroplet', e.pos.x + Math.cos(a) * rad, h * rnd(0.3, 0.7), e.pos.z + Math.sin(a) * rad, 0, -0.5, 0, 0.3, 0.1, 14, 0);
        }
      }
      n++;
    }
    // thaw / death / consumed: shatter or drop the crust
    for (const [e, rec] of this.frozenAt) {
      if (!e.dead && e.status?.frozen > 0) continue;
      this.frozenAt.delete(e);
      void rec;
      const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc;
      _pt.x = e.pos.x; _pt.z = e.pos.z;
      if (e.dead) {
        // killed while encased: the crust bursts (budgeted for mass deaths)
        if (this._gate(now, 0)) {
          _pt.y = top * 0.4; vfx.debris('frostChip', _pt, 6, { scale: Math.max(1, top / 1.4) });
          _pt.y = top * 0.55; vfx.emit('frostStar', _pt, { count: 1, scale: 0.8 });
        }
      } else if (this._gate(now, 1)) {
        // thawed without a reaction: 6 chips fall off, a little cold mist
        _pt.y = top * 0.5; vfx.debris('frostChip', _pt, 6, { scale: 1.1, speed: 0.5 });
        _pt.y = 0.3; vfx.emit('frostPuff', _pt, { count: 2, scale: 1 });
      }
    }
    for (const m of [this.crust, this.foot]) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = n > 0; }
    if (n > 0) { this.iIce.needsUpdate = true; this.iFp.needsUpdate = true; }

    const bud = vfx.budget();
    // ---------------------------------------------------------------- burning: flame licks + soot (nearest 40)
    if (B.length) {
      const L = nearest(B, hero, NEAR_BURN, this._near);
      this.burnAcc += 3 * L.length * dt * bud;
      this.sootAcc += 1 * L.length * dt * bud;
      while (this.burnAcc >= 1) {
        this.burnAcc -= 1;
        const e = L[this.burnRR++ % L.length];
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc, r = (e.baseRadius ?? e.radius ?? 0.5) * sc * 0.6;
        const a = Math.random() * 6.283;
        spr(vfx, 'fireLick', e.pos.x + Math.cos(a) * r, top * rnd(0.6, 0.9), e.pos.z + Math.sin(a) * r, Math.cos(a) * 0.3, rnd(0.6, 1.4), Math.sin(a) * 0.3,
          rnd(0.4, 0.55), rnd(0.42, 0.58) * Math.min(1.5, Math.max(0.8, top / 1.7)), -5, 2);
      }
      while (this.sootAcc >= 1) {
        this.sootAcc -= 1;
        const e = L[(this.burnRR * 7) % L.length];
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc;
        spr(vfx, 'fireSoot', e.pos.x, top * 1.0, e.pos.z, rnd(-0.2, 0.2), rnd(1.2, 1.8), rnd(-0.2, 0.2), rnd(0.6, 0.8), rnd(0.32, 0.42), -1.2, 1.5);
      }
    } else { this.burnAcc = 0; this.sootAcc = 0; }

    // ---------------------------------------------------------------- shocked: arcs jumping between foes
    if (S.length) {
      this.arcAcc += Math.min(40, S.length / 0.3) * dt;
      let tries = 0;
      while (this.arcAcc >= 1 && tries++ < 8) {
        this.arcAcc -= 1;
        let slot = -1;
        for (let i = 0; i < ARC_LIVE; i++) if (this.arcEnd[i] <= now) { slot = i; break; }
        if (slot < 0) { this.arcAcc = 0; break; }
        const e = S[this.arcRR++ % S.length];
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc;
        let mate = null;
        const q = game.queryEnemies ? game.queryEnemies(e.pos, 2, this._q) : _q0;
        for (const o of q) if (o !== e && !o.dead && o.status?.shock > 0) { mate = o; break; }
        if (mate) {
          const mt = (mate.topY ?? 1.5) * (mate.visScale ?? 1);
          stormBolt(game, { x: e.pos.x, y: top * 0.6, z: e.pos.z }, { x: mate.pos.x, y: mt * 0.6, z: mate.pos.z },
            { width: 0.1, hdr: 1.5, life: 0.1, twigs: 0, restrike: false, jag: 0.22 });
          this.arcEnd[slot] = now + 0.1;
        } else if (Math.random() < 0.35) {
          // a lone shocked foe: a tiny crawl across its own body
          const r = (e.baseRadius ?? 0.5) * sc, a = Math.random() * 6.283;
          stormBolt(game, { x: e.pos.x + Math.cos(a) * r, y: top * rnd(0.3, 0.8), z: e.pos.z + Math.sin(a) * r },
            { x: e.pos.x - Math.cos(a) * r, y: top * rnd(0.3, 0.8), z: e.pos.z - Math.sin(a) * r },
            { width: 0.08, hdr: 1.4, life: 0.07, twigs: 0, restrike: false, jag: 0.15, segLen: 0.25 });
          this.arcEnd[slot] = now + 0.07;
        }
      }
    } else this.arcAcc = 0;

    // ---------------------------------------------------------------- stunned: orbiting starlight sparks
    this.stunT -= dt;
    const SN = this._stunNow;
    SN.clear();
    if (ST.length) {
      const L = nearest(ST, hero, NEAR_STUN, this._near);
      const tick = this.stunT <= 0;
      if (tick) this.stunT = 0.42;
      for (const e of L) {
        SN.add(e);
        if (!tick && this._stunSeen.has(e)) continue;
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc, rr = Math.max(0.32, (e.baseRadius ?? 0.5) * 0.75 * sc);
        const base = now * 6;
        for (let k = 0; k < 3; k++) orbitStar(game, 'mixedStunStar', e.pos.x, top + 0.18, e.pos.z, rr, base + k * 2.094, 0.45, 0.34 * Math.min(1.4, sc));
      }
    }
    const tmp = this._stunSeen; this._stunSeen = SN; this._stunNow = tmp;

    // ---------------------------------------------------------------- chilled: cold breath (nearest 30)
    if (CH.length) {
      const L = nearest(CH, hero, NEAR_CHILL, this._near);
      this.breathAcc += L.length / 1.5 * dt * bud;
      while (this.breathAcc >= 1) {
        this.breathAcc -= 1;
        const e = L[this.breathRR++ % L.length];
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc, yaw = e.yaw ?? 0;
        const fx = Math.sin(yaw), fz = Math.cos(yaw), r = (e.baseRadius ?? 0.5) * sc * 0.7;
        spr(vfx, 'frostPuff', e.pos.x + fx * r, top * 0.82, e.pos.z + fz * r, fx * 0.6, 0.15, fz * 0.6, rnd(0.5, 0.7), rnd(0.32, 0.42) * Math.min(1.5, sc + 0.2), -0.3, 2.2);
      }
    } else this.breathAcc = 0;
  }

  // small token buckets for the thaw / death chip bursts (mass events)
  _gate(now, i) {
    const b = this._b ??= [{ t: 0, n: 12 }, { t: 0, n: 12 }];
    const k = b[i];
    if (now < k.t) k.t = now;
    k.n = Math.min(12, k.n + (now - k.t) * 30); k.t = now;
    if (k.n < 1) return false;
    k.n -= 1; return true;
  }

  clear() {
    this.frozenAt.clear();
    this._stunSeen.clear();
    this.arcEnd.fill(0);
    for (const m of [this.crust, this.foot]) { m.count = 0; m.visible = false; }
  }
}
