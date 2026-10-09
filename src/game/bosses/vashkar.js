import * as THREE from 'three';
import { BossBase, POISE, GEO, blendAddMaterial, segDist } from './core.js';
import { vashkar as VASHKAR_MODEL, VASHKAR_AXE_DRAG, vashkarSpinAngle } from '../creatures/bosses/vashkar.js';
import { BLEND_ADD } from '../vfx/index.js';
import { flameLicks, scorch, meteorBurst, fallingRockFx, spr } from '../vfx/elements/fire.js';
import { distXZ, dirXZ } from '../../core/utils.js';

// =====================================================================================
//  Vashkar, the Ashen Warchief — Act II raid boss (design/RAID_PASSES.md Pass 4, contract design/RAID.md).
//  P1 Twin Banners · Int 1 Ashfall · P2 Cinder Memory · Int 2 Molten Tide · P3 Warchief's Fury.
//
//  Mechanics (every add / object states its purpose):
//    Axe Combo       circle r 4.5 around him (in), 0.5 s later a donut 4.5-11 (out). +25 Axe Heat (flames on the blade).
//    War Banners     2 generator objects at opposite sides (r 0.7 R). Each living banner: armor 0.25 on him, a ring
//                    wave r->6 every 7 s. Both down = "Disarmed" (Downed 5 s, +15 poise each). PURPOSE: generators,
//                    damage them while baiting him away. His back banners are hidden the moment he plants them.
//    Torchbearers    2 orc thralls race from the wall to a fallen banner's site and re-light it at 50% HP.
//                    PURPOSE: race adds that make banners a priority decision (kill them, or the generator returns).
//    Banner Charge   line w 3 toward you (0.9 s) then the bull-rush, leaving a lava river (2.5 s; Double Charge 3.5 s).
//    Molten Overswing  Break Check at Axe Heat 100 (P1 60 / P2-3 70): 5 s wind-up; fail = cone 200 deg r 14 + fire 6 s.
//    Cinder Memory   (P2) ember marks drop where you stand every 0.5 s for 3 s, then detonate in order, 0.35 s apart.
//    Meteor Rain     (P3) 6 circles r 2.5 in two offset waves.
//
//  Public fields (HUD / audio): axeHeat 0..100 (the axe glows; at 100 the Overswing Break Check is queued),
//  banners [{ obj, side }] (objects tagged "banner", marker: true), sites (fallen banners awaiting a Torchbearer).
//  Back banners on his model are hidden once he plants his own (rig.banner), Axe Heat drives rig.heat (axe flames).
//  Events: bossTell { kind: combo|charge|overswing|memory|meteor|ashfall|tide|disarmed }.
// =====================================================================================

const CFG = {
  id: 'vashkar', name: 'Vashkar, the Ashen Warchief', model: VASHKAR_MODEL,
  hp: 30000, radius: 2.2, speed: 2.1, stopGap: 1.2, resist: { fire: 0.5 }, deathColor: 0xff6a1f,
  look: { scale: 1.0, glow: [0.25, 0.45, 0.62] },
  cycle: [1.7, 1.4, 1.1], downed: [4, 5, 6], enrageAt: 95,
};

const CHARGE_LEN = 26;
const CHARGE_SPEED = 22;
const COMBO_IN = 4.5;
const COMBO_OUT = 11;
const BANNER_HP = 0.032;         // × boss max HP
const BANNER_R = 0.7;            // × arena radius
const PULSE_EVERY = 7;
const OVERSWING_EVERY = 30;      // P3 (s of fight time)
const BANNER_SCALE = 1.4;
const HEAT_PASSIVE = 1.6;          // Axe Heat per second in P1/P2 (on top of +25 per combo)

const V3 = (x, z) => new THREE.Vector3(x, 0, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap2 = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// =====================================================================================
//  Molten ground: one procedural shader for every lava shape (lanes, trail, rising rim).
//  Dark crust + glowing cracks + slow magma flow; ragged noise edge; premultiplied over the ground in the opaque
//  pass (renderOrder 2, like game.vfx decals) so creatures always draw on top and telegraphs (7-8) over it.
// =====================================================================================
const LAVA_VS = /* glsl */`
  varying vec2 vUv; varying vec2 vW; varying float vBirth; attribute float aBirth;
  void main() {
    vUv = uv; vBirth = aBirth;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const LAVA_FS = /* glsl */`
  uniform float uTime, uMode, uInner, uAlpha, uHeat, uLife; uniform vec2 uSize;
  varying vec2 vUv; varying vec2 vW; varying float vBirth;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.3) * 0.2; }
  void main() {
    vec2 q = vUv - 0.5;
    float edgeD; float fade = uAlpha;
    if (uMode < 0.5) { vec2 e = uSize * 0.5 - abs(q) * uSize; edgeD = min(e.x, e.y); }
    else if (uMode < 1.5) { edgeD = (0.5 - length(q)) * uSize.x; }
    else if (uMode < 2.5) { float r = length(q) * uSize.x; edgeD = min(uSize.x * 0.5 - r, r - uInner); }
    else {
      edgeD = (0.5 - abs(q.x)) * uSize.x;
      float age = uTime - vBirth;
      fade *= clamp((uLife - age) / 0.9, 0.0, 1.0) * smoothstep(0.0, 0.16, age);
    }
    bool ring = uMode > 1.5 && uMode < 2.5;
    float n = fbm(vW * 0.32);
    edgeD += (n - 0.5) * 0.9;
    if (ring) { float ang = atan(q.y, q.x); edgeD += 0.3 * sin(ang * 11.0 + uTime * 1.4) + 0.18 * sin(ang * 23.0 - uTime * 2.1); }
    float m = smoothstep(0.0, 0.55, edgeD);
    if (m <= 0.002 || fade <= 0.002) discard;
    if (ring) {
      // Rising lava at the rim: big dark crust plates, a few wide glowing seams, brightest in the 1.4 u band at the inner edge,
      // calmer and darker further out, fading softly into the ground at the outer edge.
      float dIn = length(q) * uSize.x - uInner + (n - 0.5) * 0.9;
      float rr = length(q) * uSize.x;
      float dOut = uSize.x * 0.5 - rr;
      float s1 = abs(fbm(vW * 0.15 + vec2(uTime * 0.03, 3.0)) - 0.5);
      float seam = 1.0 - smoothstep(0.0, 0.055, s1);
      float near = exp(-max(dIn, 0.0) * 0.28);
      float edgeBand = 1.0 - smoothstep(0.0, 1.4, dIn);
      float hotR = clamp(edgeBand + seam * (0.25 + 0.5 * near), 0.0, 1.0);
      vec3 lavaR = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.74, 0.24), hotR * hotR);
      float fadeR = fade * smoothstep(0.0, 3.7, dOut);
      float aR = clamp(m * fadeR * 1.25, 0.0, 1.0);   // the ground is HDR-bright: crust needs ~full alpha to read as dark
      gl_FragColor = vec4(vec3(0.07, 0.042, 0.034) * aR + lavaR * hotR * (0.7 + 1.3 * hotR) * uHeat * m * fadeR, aR);
      return;
    }
    float c1 = abs(fbm(vW * 0.42 + vec2(uTime * 0.05, 0.0)) - 0.5);
    float c2 = abs(fbm(vW * 0.85 + vec2(11.0, -uTime * 0.04)) - 0.5);
    float crack = 1.0 - smoothstep(0.0, 0.05, min(c1, c2 * 1.25));
    float blob = smoothstep(0.58, 0.78, fbm(vW * 0.2 - vec2(0.0, uTime * 0.12)));
    float inner = 0.55 + 0.45 * smoothstep(0.0, 1.3, edgeD);
    float rim = 1.0 - smoothstep(0.0, 0.5, edgeD);
    float hot = clamp(max(crack, blob * 0.8) * inner + rim * 0.5, 0.0, 1.0);
    vec3 crust = vec3(0.06, 0.036, 0.03);
    vec3 lava = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.74, 0.24), hot * hot);
    vec3 emit = lava * hot * (0.8 + 1.3 * hot) * uHeat;
    float a = m * 0.95 * fade;
    gl_FragColor = vec4(crust * a + emit * m * fade, a);
  }`;

// o: { mode: 0 rect | 1 disc | 2 ring | 3 strip, size [x, y] (m), inner (ring, m), life (strip) }
function lavaMaterial(game, o) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: game.vfx.uTime, uMode: { value: o.mode }, uInner: { value: o.inner ?? 0 }, uAlpha: { value: 0 },
      uHeat: { value: 1 }, uLife: { value: o.life ?? 3 }, uSize: { value: new THREE.Vector2(o.size?.[0] ?? 1, o.size?.[1] ?? 1) },
    },
    vertexShader: LAVA_VS, fragmentShader: LAVA_FS,
    transparent: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide, ...BLEND_ADD,
  });
}

// Ember / tongue emitters spread along a segment (the "glow = live" particles of a lava floor).
function lavaEmitters(game, a, b, life, spacing = 5.5, scale = 1) {
  const v = game.vfx, out = [];
  const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / spacing));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t };
    out.push(v.emitter('fireEmber', { pos: p, rate: 4.5, radius: spacing * 0.5, y: [0.1, 0.5], life, scale }));
    out.push(v.emitter('fireLick', { pos: p, rate: 2.2, radius: spacing * 0.45, y: [0.05, 0.2], life, scale: 0.8 * scale }));
  }
  return out;
}

// A straight lava lane (Ashfall lanes, the Molten Tide lane embers). Hurts while standing in it.
class LavaPatch {
  constructor(boss, from, to, width, life, o = {}) {
    const game = boss.game;
    this.hostile = true;
    this.boss = boss;
    this.a = V3(from.x, from.z); this.b = V3(to.x, to.z);
    this.width = width;
    this.life = life; this.t = 0; this.tickT = 0;
    this.mult = o.mult ?? 0.28;
    const len = this.a.distanceTo(this.b);
    this.mat = lavaMaterial(game, { mode: 0, size: [width, len] });
    this.mesh = new THREE.Mesh(GEO.plane, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = Math.atan2(this.b.x - this.a.x, this.b.z - this.a.z);
    this.mesh.position.set((this.a.x + this.b.x) / 2, 0.05, (this.a.z + this.b.z) / 2);
    this.mesh.scale.set(width + 0.8, len + 0.8, 1);
    this.mat.uniforms.uSize.value.set(width + 0.8, len + 0.8);
    this.mesh.renderOrder = 2;
    game.scene.add(this.mesh);
    this.emitters = lavaEmitters(game, this.a, this.b, life - 0.4, 6);
  }

  update(dt, game) {
    this.t += dt;
    const u = this.mat.uniforms;
    u.uAlpha.value = Math.max(0, Math.min(1, this.t / 0.22, (this.life - this.t) / 0.7));
    u.uHeat.value = 1 - 0.45 * (this.t / this.life);
    this.tickT -= dt;
    const p = game.player;
    if (this.tickT <= 0 && !p.dead && this.t > 0.15 && this.t < this.life - 0.4
      && segDist(p.pos.x, p.pos.z, this.a.x, this.a.z, this.b.x, this.b.z) < this.width / 2 + p.radius * 0.4) {
      this.tickT = 0.5;
      this.boss.hitPlayer(this.mult, 'lava');
    }
    return this.t < this.life;
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    this.mat.dispose();
    for (const e of this.emitters) e.stop();
  }
}

// The lava river a charge leaves behind: a ribbon of molten ground (one pre-sized geometry, rewritten per frame).
const TRAIL_N = 56;
class LavaTrail {
  constructor(boss, life) {
    const game = boss.game;
    this.hostile = true;
    this.boss = boss;
    this.life = life;
    this.emitting = true;
    this.pts = [];                      // { x, z, t0 } (t0 = vfx time)
    this.dropT = 0;
    this.tickT = 0;
    this.width = 3.0;
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 4), 2));
    g.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    g.setIndex(idx);
    const uv = g.attributes.uv.array;
    for (let i = 0; i < TRAIL_N; i++) { uv[i * 4] = 0; uv[i * 4 + 1] = i / TRAIL_N; uv[i * 4 + 2] = 1; uv[i * 4 + 3] = i / TRAIL_N; }
    g.setDrawRange(0, 0);
    this.mat = lavaMaterial(game, { mode: 3, size: [this.width, 1], life });
    this.mat.uniforms.uAlpha.value = 1;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    game.scene.add(this.mesh);
    this.emitters = [];
    this.emT = 0;
  }

  update(dt, game) {
    const now = game.vfx.time;
    if (this.emitting && !this.boss.dead) {
      this.dropT -= dt;
      if (this.dropT <= 0) {
        this.dropT = 0.1;
        this.pts.push({ x: this.boss.pos.x, z: this.boss.pos.z, t0: now });
        if (this.pts.length > TRAIL_N) this.pts.shift();
      }
    }
    while (this.pts.length && now - this.pts[0].t0 > this.life) this.pts.shift();
    this._rebuild();
    // embers off the river (one cheap burst per new point instead of long-lived emitters)
    this.emT -= dt;
    if (this.emT <= 0 && this.pts.length) {
      this.emT = 0.09;
      const p = this.pts[Math.floor(Math.random() * this.pts.length)];
      if (now - p.t0 < this.life - 0.6) {
        spr(game.vfx, 'fireEmber', p.x + rnd(-1, 1), 0.2, p.z + rnd(-1, 1), rnd(-0.5, 0.5), rnd(1.2, 2.6), rnd(-0.5, 0.5), rnd(0.5, 0.9), 0.1);
        if (Math.random() < 0.5) spr(game.vfx, 'fireLick', p.x + rnd(-0.8, 0.8), 0.1, p.z + rnd(-0.8, 0.8), 0, 0.5, 0, undefined, rnd(0.6, 0.9));
      }
    }
    this.tickT -= dt;
    const pl = game.player;
    if (this.tickT <= 0 && !pl.dead) {
      for (const p of this.pts) {
        const age = now - p.t0;
        if (age > 0.12 && age < this.life - 0.5 && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < this.width / 2 + pl.radius * 0.3) {
          this.tickT = 0.5;
          this.boss.hitPlayer(0.3, 'lava trail');
          break;
        }
      }
    }
    return this.emitting || this.pts.length > 0;
  }

  _rebuild() {
    const n = this.pts.length;
    const pos = this.geo.attributes.position.array, bi = this.geo.attributes.aBirth.array;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    const hw = this.width / 2 + 0.4;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const o = i * 6;
      pos[o] = p.x - dz * hw; pos[o + 1] = 0.05; pos[o + 2] = p.z + dx * hw;
      pos[o + 3] = p.x + dz * hw; pos[o + 4] = 0.05; pos[o + 5] = p.z - dx * hw;
      bi[i * 2] = p.t0; bi[i * 2 + 1] = p.t0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aBirth.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.mat.uniforms.uSize.value.set(this.width + 0.8, 1);
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// The Molten Tide rim: a ring of rising lava between the new arena edge and the old wall.
class RimLava {
  constructor(boss, outer, from, to, sec) {
    const game = boss.game;
    this.hostile = false;
    this.boss = boss;
    this.outer = outer; this.from = from; this.to = to; this.sec = sec;
    this.t = 0; this.fading = false; this.fadeT = 0; this.dead = false;
    this.c = boss.arena.center.clone();
    this.mat = lavaMaterial(game, { mode: 2, size: [outer * 2, outer * 2], inner: from });
    this.mesh = new THREE.Mesh(GEO.plane, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.scale.set(outer * 2, outer * 2, 1);
    this.mesh.position.set(this.c.x, 0.055, this.c.z);
    this.mesh.renderOrder = 2;
    game.scene.add(this.mesh);
    const v = game.vfx;
    const rMid = (to + from) / 2;
    this.emitters = [
      v.emitter('fireEmber', { pos: this.c, rate: 45, radius: rMid + 0.5, area: 'ring', y: [0.2, 0.8], scale: 1.1 }),
      v.emitter('fireLick', { pos: this.c, rate: 16, radius: rMid + 0.5, area: 'ring', y: [0.05, 0.3], scale: 0.9 }),
      v.emitter('fireLava', { pos: this.c, rate: 4, radius: rMid + 0.5, area: 'ring', y: [0.05, 0.1], scale: 0.7 }),
    ];
    this.r = from;
  }

  fadeOut() { this.fading = true; }

  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, this.t / this.sec);
    this.r = this.from + (this.to - this.from) * (k * k * (3 - 2 * k));
    if (k >= 1 && game.encounter?.arena) this.r = Math.min(this.to, game.encounter.arena.r);   // then follow the live arena radius
    const u = this.mat.uniforms;
    u.uInner.value = this.r;
    let a = Math.min(1, this.t / 0.5);
    if (this.fading) { this.fadeT += dt; a *= Math.max(0, 1 - this.fadeT / 1.4); }
    u.uAlpha.value = a;
    u.uHeat.value = 0.85 + 0.15 * Math.sin(game.vfx.time * 1.7);
    // keep the emitters riding the rising edge
    const rr = ((this.r + 21.2) / 2) / 0.925;
    this.emitters.forEach((e, i) => { e.radius = Math.max(1, rr * (i === 2 ? 1.03 : 1)); });
    return !(this.fading && this.fadeT >= 1.4) && !this.dead;
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    this.mat.dispose();
    for (const e of this.emitters) e.stop();
  }
}

// =====================================================================================
//  Banner mesh (module-level geometry / materials; never per frame)
// =====================================================================================
const BM = {
  wood: new THREE.MeshLambertMaterial({ color: 0x3a2616 }),
  bone: new THREE.MeshLambertMaterial({ color: 0xeadfc4 }),
  iron: new THREE.MeshLambertMaterial({ color: 0x2b2a2e }),
  rock: new THREE.MeshLambertMaterial({ color: 0x4a3f38 }),
  cloth: new THREE.MeshLambertMaterial({ color: 0xd9ceb0, side: THREE.DoubleSide, emissive: 0x2a2418 }),
  soot: new THREE.MeshLambertMaterial({ color: 0x2a2420, side: THREE.DoubleSide }),
  teal: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1fe0c2).multiplyScalar(1.7) }),
};
const BG = (() => {
  const pole = new THREE.CylinderGeometry(0.1, 0.15, 5.6, 7); pole.translate(0, 2.8, 0);
  const bar = new THREE.BoxGeometry(2.0, 0.14, 0.14); bar.translate(0.75, 4.75, 0);
  const skull = new THREE.SphereGeometry(0.3, 8, 6); skull.scale(0.95, 1, 1.1); skull.translate(0, 5.75, 0);
  const spike = new THREE.ConeGeometry(0.08, 0.42, 5);
  const cloth = new THREE.Shape();   // ragged cloth hanging from the crossbar (local x 0..1.5, y 0..-2.1)
  cloth.moveTo(0, 0); cloth.lineTo(1.5, 0); cloth.lineTo(1.46, -1.5); cloth.lineTo(1.2, -1.2); cloth.lineTo(0.95, -2.1);
  cloth.lineTo(0.7, -1.4); cloth.lineTo(0.42, -1.95); cloth.lineTo(0.2, -1.3); cloth.lineTo(0.02, -1.6); cloth.lineTo(0, 0);
  const clothG = new THREE.ShapeGeometry(cloth);
  const sig = new THREE.OctahedronGeometry(0.34); sig.scale(1, 1.4, 0.25); sig.translate(0.75, -0.7, 0.03);
  const sigBar = new THREE.BoxGeometry(0.16, 0.6, 0.05); sigBar.translate(0.75, -1.3, 0.03);
  const rubble = new THREE.DodecahedronGeometry(0.5, 0);
  const rock = new THREE.ConeGeometry(0.34, 1.0, 5);
  return { pole, bar, skull, spike, clothG, sig, sigBar, rubble, rock };
})();

function buildBanner() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(new THREE.Mesh(BG.pole, BM.wood), new THREE.Mesh(BG.bar, BM.wood), new THREE.Mesh(BG.skull, BM.bone));
  for (const e of [1, -1]) { const s = new THREE.Mesh(BG.spike, BM.bone); s.position.set(0.2 * e, 5.9, 0); s.rotation.z = -0.5 * e; body.add(s); }
  // cairn: rubble and iron-grey spikes bracing the pole
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, r = 0.55 + (i % 2) * 0.12;
    const s = new THREE.Mesh(BG.rock, BM.rock); s.position.set(Math.cos(a) * r, 0.42, Math.sin(a) * r); s.rotation.set(Math.sin(a) * 0.42, 0, -Math.cos(a) * 0.42); s.scale.setScalar(0.9 + (i % 3) * 0.25); body.add(s);
  }
  const rb = new THREE.Mesh(BG.rubble, BM.rock); rb.position.set(0.1, 0.18, 0.1); rb.scale.set(1.2, 0.5, 1.2); body.add(rb);
  const cloth = new THREE.Group(); cloth.position.set(-0.05, 4.7, 0); body.add(cloth);
  cloth.add(new THREE.Mesh(BG.clothG, BM.cloth), new THREE.Mesh(BG.sig, BM.teal), new THREE.Mesh(BG.sigBar, BM.teal));
  // teal ground ring (the banner's "live" read): scaled / pulsed by the script
  const ringMat = blendAddMaterial(0x1fe0c2, { hdr: 1.5, occ: 0.4, opacity: 0.7, depthTest: false });
  const ring = new THREE.Mesh(GEO.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.09; ring.scale.setScalar(1.7); ring.renderOrder = 2; g.add(ring);
  // tether to the boss (thin teal strip on the ground, re-aimed per frame)
  const linkMat = blendAddMaterial(0x1fe0c2, { hdr: 1.3, occ: 0.25, opacity: 0.5, depthTest: false });
  const linkG = new THREE.Group(); linkG.position.y = 0.1; g.add(linkG);
  const link = new THREE.Mesh(GEO.plane, linkMat); link.rotation.x = -Math.PI / 2; link.renderOrder = 2; linkG.add(link);
  body.scale.setScalar(BANNER_SCALE);   // generators: big enough to read across the arena
  return { group: g, body, cloth, ring, ringMat, link, linkG, linkMat };
}

// A fallen banner toppling over, then smouldering (visual only).
class Toppling {
  constructor(game, banner, pos) {
    this.game = game;
    this.g = banner.body.clone();
    this.g.position.set(pos.x, 0, pos.z);
    this.dir = Math.random() * Math.PI * 2;
    this.g.rotation.y = this.dir;
    game.scene.add(this.g);
    this.t = 0;
  }

  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, this.t / 0.7);
    this.g.rotation.x = -1.35 * k * k;
    if (this.t < 2.4 && Math.random() < 0.5) spr(game.vfx, 'fireLick', this.g.position.x + rnd(-0.6, 0.6), 0.2, this.g.position.z + rnd(-0.6, 0.6), 0, 0.4, 0, undefined, rnd(0.5, 0.8));
    this.g.position.y = this.t > 2.4 ? -(this.t - 2.4) * 1.5 : 0;
    return this.t < 3.4;
  }

  dispose(game) { game.scene.remove(this.g); }
}

// Where a banner stood: pulsing teal ring + embers until a Torchbearer re-lights it (or the phase ends).
class RelightSite {
  constructor(game, pos) {
    this.game = game;
    this.pos = V3(pos.x, pos.z);
    this.mat = blendAddMaterial(0x1fe0c2, { hdr: 1.6, occ: 0.4, opacity: 0.8, depthTest: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(GEO.ring, this.mat);
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.set(pos.x, 0.09, pos.z); this.mesh.renderOrder = 2;
    game.scene.add(this.mesh);
    this.t = 0; this.dead = false;
  }

  update(dt, game) {
    this.t += dt;
    const k = (this.t * 0.9) % 1;
    this.mesh.scale.setScalar(2.4 - 1.5 * k);
    this.mat.opacity = 0.9 * (1 - k * k);
    if (Math.random() < 0.25) spr(game.vfx, 'fireEmber', this.pos.x + rnd(-0.5, 0.5), 0.2, this.pos.z + rnd(-0.5, 0.5), 0, rnd(1, 2), 0, rnd(0.5, 0.8), 0.1);
    return !this.dead;
  }

  dispose(game) { game.scene.remove(this.mesh); this.mat.dispose(); }
}

// A meteor in flight (visual only; the circle telegraph owns the damage and the impact burst).
class MeteorFall {
  constructor(game, at, fall, scale = 1) {
    this.game = game; this.fall = fall; this.t = 0;
    this.fx = fallingRockFx(game, at, { scale, fall, shadow: 1.8 * scale });
  }

  update(dt) {
    this.t += dt;
    this.fx.update(Math.min(1, this.t / this.fall), dt);
    return this.t < this.fall;
  }

  dispose() { this.fx.end(); }
}

// Flame field over a cone (the fire left by a failed Overswing): visual particles only; damage is the boss zone.
class FlameField {
  constructor(boss, origin, dir, angle, r, life) {
    this.hostile = true;
    this.boss = boss; this.o = origin.clone(); this.a0 = Math.atan2(dir.x, dir.z); this.angle = angle; this.r = r;
    this.life = life; this.t = 0; this.acc = 0; this.acc2 = 0;
    // molten crack network over the whole cone (glows while the fire is live)
    for (const [f, off] of [[0.3, 0], [0.3, -0.7], [0.3, 0.7], [0.62, -0.35], [0.62, 0.35], [0.62, -0.9], [0.62, 0.9], [0.9, 0], [0.9, -0.55], [0.9, 0.55]]) {
      const a = this.a0 + off * (angle / 2) * 0.95, rr = r * f;
      scorch(boss.game, { x: origin.x + Math.sin(a) * rr, z: origin.z + Math.cos(a) * rr }, 3.4, life * 0.8, life + 0.5, { alpha: 0.45, hdr: 2.2, intensity: 1.2 });
    }
  }

  update(dt, game) {
    this.t += dt;
    const k = Math.min(1, (this.life - this.t) / 1.5);
    const area = this.angle * this.r * this.r * 0.5;
    this.acc += dt * area * 0.16 * game.vfx.budget() * Math.max(0.2, k);
    while (this.acc >= 1) {
      this.acc -= 1;
      const rr = Math.sqrt(Math.random()) * this.r, a = this.a0 + (Math.random() - 0.5) * this.angle;
      const x = this.o.x + Math.sin(a) * rr, z = this.o.z + Math.cos(a) * rr;
      spr(game.vfx, 'fireLick', x, 0.1, z, 0, 0.6, 0, undefined, rnd(1.4, 2.2));
    }
    this.acc2 += dt * area * 0.05 * game.vfx.budget() * Math.max(0.2, k);
    while (this.acc2 >= 1) {
      this.acc2 -= 1;
      const rr = Math.sqrt(Math.random()) * this.r, a = this.a0 + (Math.random() - 0.5) * this.angle;
      const x = this.o.x + Math.sin(a) * rr, z = this.o.z + Math.cos(a) * rr;
      spr(game.vfx, 'fireEmber', x, 0.3, z, rnd(-0.5, 0.5), rnd(1.5, 3), rnd(-0.5, 0.5), rnd(0.6, 1.1), 0.12);
      if (Math.random() < 0.5) spr(game.vfx, 'fireBillow', x, 0.4, z, 0, 0.8, 0, 0.7, 1.1, -1.5, 3);
    }
    return this.t < this.life;
  }

  dispose() {}
}

// =====================================================================================
//  Vashkar
// =====================================================================================
export class Vashkar extends BossBase {
  constructor(game, pos, opts) {
    super(game, CFG, pos, opts);
    this.axeHeat = 0;                // 0..100 (HUD may read it); P1/P2: +25 per combo; P3: a 30 s timer
    this.banners = [];               // { obj, side, site? }
    this.sites = [];                 // fallen banners awaiting a Torchbearer: { pos, side, used, marker, adds }
    this.charging = false;
    this.chargeLava = 2.5;
    this.marks = [];                 // live Cinder Memory sigils
    this.inited = false;
    this.lastOverswing = 0;
    this._overQueued = false;
    this._heatVis = 0;
    this._banVis = [1, 1];
    this._banHide = [false, false];
    this.rim = null;
    this.bannerA0 = Math.random() * Math.PI * 2;
    this.moves = {
      combo: () => this.mCombo(),
      charge: () => this.mCharge(false),
      charge2: () => this.mCharge(true),
      memory: () => this.mMemory(),
      meteor: () => this.mMeteor(),
      overswing: () => this.mOverswing(),
    };
    this.rig.heat = 0;
    this.rig.banner = [1, 1];
    this.rig.rage = this.phase >= 2 ? 1 : 0;
  }

  rotation(phase) {
    if (phase === 1) return ['combo', 'charge', 'combo', 'combo', 'charge'];
    if (phase === 2) return ['combo', 'memory', 'charge2', 'combo', 'memory', 'charge2'];
    return ['meteor', 'combo', 'charge2', 'meteor', 'combo', 'charge'];
  }

  // ---------------------------------------------------------------- Axe Heat
  addHeat(n) {
    if (this.phase >= 3) return;
    this.axeHeat = Math.min(100, this.axeHeat + n);
    if (this.axeHeat >= 100) this._queueOverswing();
  }

  _queueOverswing() {
    if (this._overQueued) return;
    this._overQueued = true;
    this.queue('overswing');
  }

  // Big tells for the score / SFX (design/RAID.md bossTell).
  tellEvt(kind, lead) { this.game.events.emit('bossTell', { enemy: this, kind, lead }); }

  // ---------------------------------------------------------------- Axe Combo (in / out)

  mCombo() {
    this.tellEvt('combo', 1.2);
    const g = this.game, first = this.firstUse('combo');
    const lead = this.lead('combo', 1.2);
    const gap = first ? 0.85 : 0.5;                 // the donut lands this long after the circle
    const at = this.pos.clone();
    this.face(g.player.pos);
    const sweepDur = Math.max(0.5, (gap - 0.15) / 0.5);
    this.play('axeSpin', lead + 0.15, lead, ['axeSweep', sweepDur, gap - 0.15], 1.0);
    this.circle(at, COMBO_IN, lead, { dmg: 1.5, how: 'axe whirl', onResolve: () => {
      this.whirlFx(at);
      this.addHeat(25);
    } });
    if (first) {
      // teaching: only the safe region of the NEXT beat is shown at a time (gold = go here)
      this.donut(at, COMBO_IN, 17, lead, { safe: true });
      this.after(lead, () => {
        this.donut(at, COMBO_IN, COMBO_OUT, gap, { dmg: 1.3, how: 'axe sweep', onResolve: () => this.sweepFx(at) });
        this.circle(at, COMBO_IN, gap, { safe: true });
        g.fx.text({ x: at.x, y: 3, z: at.z }, 'NOW IN', '#ffe9a8', true);
      });
      g.fx.text({ x: at.x, y: 3, z: at.z }, 'OUT', '#ffe9a8', true);
    } else {
      this.donut(at, COMBO_IN, COMBO_OUT, lead + gap, { dmg: 1.3, how: 'axe sweep', onResolve: () => this.sweepFx(at) });
    }
    return lead + gap + 0.85;
  }

  whirlFx(at) {
    const g = this.game;
    flameLicks(g, at, COMBO_IN, 14, 1.1, 8);
    g.fx.flashDisc(at, { color: 0xffb040, radius: COMBO_IN, life: 0.22, hdr: 1.5 });
    g.fx.shake(0.4, 'threat');
  }

  sweepFx(at) {
    const g = this.game;
    flameLicks(g, at, COMBO_OUT, 26, 1.5, 14);
    g.fx.ring(at, { color: 0xffb040, radius: COMBO_OUT, life: 0.35, width: 0.12, hdr: 1.8 });
    scorch(g, at, 4.5, 0.6, 3);
    g.fx.shake(0.55, 'threat');
  }

  // ---------------------------------------------------------------- Banner Charge / Double Charge
  mCharge(double) {
    this.tellEvt('charge', 0.9);
    const dbl = double && this.phase >= 2;
    const lead = this.lead('charge', 0.9);
    this.chargeLava = dbl ? 3.5 : 2.5;
    this.chargesLeft = dbl ? 2 : 1;
    this.startCharge(lead);
    return lead + (dbl ? 2 * 1.7 + 0.8 : 1.7) + 0.6;
  }

  startCharge(lead) {
    const g = this.game;
    this.chargesLeft--;
    const dir = dirXZ(this.pos, g.player.pos, new THREE.Vector3());
    this.chargeDir = dir;
    this.yaw = Math.atan2(dir.x, dir.z);
    this.play('rushWind', lead, lead);
    this.line(this.pos, dir, CHARGE_LEN, 3, lead, { dmg: 1.2, how: 'banner charge', onResolve: (hit) => this.beginCharge(hit) });
  }

  beginCharge(alreadyHit) {
    const g = this.game;
    this.charging = true;
    this.chargeT = CHARGE_LEN / CHARGE_SPEED;
    this.chargeHit = !!alreadyHit;
    this.play('rush', CHARGE_LEN / CHARGE_SPEED, 0);
    this.trail = this.own(new LavaTrail(this, this.chargeLava));
    g.fx.shake(0.4, 'threat');
  }

  move(dt, mv) {
    if (!this.charging) { this._chase(dt, mv); return; }
    const g = this.game, step = CHARGE_SPEED * mv * dt;
    const px = this.pos.x, pz = this.pos.z;
    this.pos.addScaledVector(this.chargeDir, step);
    g.world.collide(this.pos, this.radius);
    this.chargeT -= dt;
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    const p = g.player;
    if (!this.chargeHit && distXZ(this.pos, p.pos) < this.radius + p.radius + 0.3) {
      this.chargeHit = true;
      this.hitPlayer(1.2, 'banner charge');
    }
    // sparks off the axe blade dragging behind him
    for (let i = 0; i < 2; i++) {
      const w = this.world(VASHKAR_AXE_DRAG);
      g.fx.spark(w, { x: rnd(-1.5, 1.5), y: rnd(1.5, 4), z: rnd(-1.5, 1.5) }, { color: i ? 0xffb040 : 0xff6a1f, size: 0.35, life: 0.35, gravity: 6, hdr: 2.4 });
    }
    if (this.chargeT <= 0 || moved < step * 0.4) this.endCharge();
  }

  endCharge() {
    const g = this.game;
    this.charging = false;
    if (this.trail) { this.trail.emitting = false; this.trail = null; }
    g.fx.shake(0.3, 'threat');
    g.fx.burst(this.pos, { color: 0xff5a2a, count: 10, speed: 5, life: 0.4, size: 0.4 });
    this.play('skid', 0.45, 0);
    if (this.chargesLeft > 0) {
      // Double Charge: the second line is re-aimed after the skid
      this.after(0.35, () => this.startCharge(0.8));
    }
  }

  // ---------------------------------------------------------------- Molten Overswing (Break Check)
  mOverswing() {
    this.tellEvt('overswing', 5);
    const g = this.game;
    this._overQueued = false;
    const thr = this.phase === 1 ? 60 : 70;
    const dir = dirXZ(this.pos, g.player.pos, new THREE.Vector3());
    this.face(g.player.pos);
    const origin = this.pos.clone();
    this.axeHeat = 100;
    const busy = this.breakCheck({
      name: 'Molten Overswing', dur: 5, threshold: thr, action: null,
      onSuccess: () => {
        g.fx.text({ x: this.pos.x, y: 3.6, z: this.pos.z }, 'QUENCHED', '#e8eef8', true);
        g.fx.burst(this.world([-2.5, 5, 0]), { color: 0xe8eef8, count: 24, speed: 5, life: 0.7, size: 0.5, up: 1.2 });
        this.axeHeat = 0; this.lastOverswing = this.fightT;
      },
      onFail: () => {
        this.lastOverswing = this.fightT; this.axeHeat = 0;
        this.overswingFire(origin, dir);
      },
    });
    this.play('overswing', 5.0, 4.8, ['recover', 0.6, 0], 1.25);
    // the cone shows late (it re-aims at you once): first use gets the long lead
    const lead = this.lead('overswing', 2.4);
    this.after(5 - lead, () => {
      const d2 = dirXZ(this.pos, g.player.pos, new THREE.Vector3());
      this.yaw = Math.atan2(d2.x, d2.z);
      origin.copy(this.pos);
      dir.copy(d2);
      this.cone(origin, d2, (200 * Math.PI) / 180, 14, lead, { dmg: 2.2, how: 'molten overswing', onResolve: () => {
        flameLicks(g, origin, 14, 30, 1.6, 16);
        g.fx.shake(0.8, 'threat');
        g.fx.ring(origin, { color: 0xffb040, radius: 14, life: 0.4, width: 0.12, hdr: 1.8 });
      } });
    });
    return busy + 0.8;
  }

  overswingFire(origin, dir) {
    const g = this.game;
    const angle = (200 * Math.PI) / 180;
    this.zone(origin, 'hostile', { radius: 14, angle, dir, life: 6, tag: 'overswingFire', onInside: (dt, z) => {
      z._tick = (z._tick ?? 0) - dt;
      if (z._tick <= 0) { z._tick = 0.5; this.hitPlayer(0.22, 'ground fire'); }
    } });
    this.own(new FlameField(this, origin, dir, angle, 14, 6));
  }

  // ---------------------------------------------------------------- Cinder Memory (P2)
  mMemory() {
    this.tellEvt('memory', 1.5);
    const g = this.game;
    const first = this.firstUse('memory');
    const n = first ? 3 : 6;
    const settle = first ? 2.0 : 0.9;                 // teaching: a long pause between the last mark and the first blast
    this.lead('memory', 1);                            // register first use
    const marks = [];
    this.play('stomp', 0.5, 0.3);
    for (let i = 0; i < n; i++) {
      this.after(i * 0.5, () => {
        this.play('stomp', 0.5, 0.32, null, 0.8);
        const at = g.player.pos.clone();
        const d = g.vfx.decal('rune', at, 2.15, 30, { grow: 0.3, fade: 0.3, color: 0x2a1006, alpha: 0.8, accent: 0xffb050, hdr: 2.6 });
        marks.push({ at, decal: d, i });
        this.marks.push(d);
        g.vfx.emit('fireEmber', at, { count: 6, speed: 0.8 });
        g.fx.text({ x: at.x, y: 0.8, z: at.z }, String(i + 1), '#ffb040', true);
        g.fx.burst(at, { color: 0xffa43a, count: 8, speed: 3, life: 0.4, size: 0.3, up: 1.4, hdr: 2 });
      });
    }
    const last = (n - 1) * 0.5;
    const tele = first ? 1.1 : 0.7;
    for (let i = 0; i < n; i++) {
      const det = last + settle + i * 0.35;               // detonation time of mark i
      this.after(det - tele, () => {
        const m = marks[i];
        if (!m) return;
        this.circle(m.at, 2, tele, { dmg: 1.2, how: 'cinder mark', onResolve: () => this.markBlast(m) });
        g.fx.text({ x: m.at.x, y: 1.2, z: m.at.z }, String(i + 1), '#ff5a2a', true);
      });
    }
    return last + settle + (n - 1) * 0.35 + 1.2;
  }

  markBlast(m) {
    const g = this.game;
    m.decal.end(0.25);
    flameLicks(g, m.at, 2, 8, 0.9, 4);
    g.fx.flashDisc(m.at, { color: 0xffb040, radius: 2, life: 0.2, hdr: 1.6 });
    scorch(g, m.at, 1.9, 0.5, 2.5);
    g.fx.shake(0.2, 'threat');
  }

  _endMarks() { for (const d of this.marks) d.end?.(0.2); this.marks.length = 0; }

  // ---------------------------------------------------------------- Meteor Rain (P3)
  mMeteor() {
    this.tellEvt('meteor', 1.1);
    const g = this.game;
    const wave = (centre, offset) => {
      const lead = 1.1;
      const pts = [centre.clone()];
      for (let k = 0; k < 2; k++) {
        const a = offset + k * 2.2 + rnd(-0.25, 0.25);
        pts.push(V3(centre.x + Math.sin(a) * 4.8, centre.z + Math.cos(a) * 4.8));
      }
      this.play('meteor', 1.3, lead, null, 1.1);
      for (const p of pts) {
        g.world.collide(p, 0.5);
        this.after(lead - 0.7, () => g.addActor(new MeteorFall(g, p, 0.7)));
        this.circle(p, 2.5, lead, { dmg: 1.0, how: 'meteor', onResolve: () => { meteorBurst(g, p, 2.5, { scale: 0.9 }); g.fx.shake(0.18, 'threat'); } });
      }
    };
    wave(g.player.pos.clone(), Math.random() * Math.PI * 2);
    this.after(1.45, () => wave(g.player.pos.clone(), Math.random() * Math.PI * 2 + 1.1));
    return 1.45 + 1.1 + 0.9;
  }

  // ---------------------------------------------------------------- War Banners (generators)
  bannerHp(mult) { return this.maxHp * BANNER_HP * mult; }

  raiseBanners() {
    const phase = this.phase;
    const hpMult = phase === 1 ? 1 : phase === 2 ? 1.3 : 1.6;
    const R = this.arena.r * BANNER_R;
    const c = this.arena.center;
    const sides = phase >= 3 ? [0] : [0, 1];
    const base = this.bannerA0 + (phase === 2 ? Math.PI / 2 : phase >= 3 ? Math.PI / 4 : 0);
    this.sites.forEach((s) => { s.marker.dead = true; }); this.sites.length = 0;
    this.play('warcry', 1.7, 0.7);
    this.busyT = Math.max(this.busyT, 1.9);
    for (const s of sides) {
      const a = base + s * Math.PI;
      const p = V3(c.x + Math.sin(a) * R, c.z + Math.cos(a) * R);
      this.after(0.45 + s * 0.25, () => { if (!this.dead && !this.intermissionIdx && this.phase === phase) this.spawnBanner(p, s, hpMult, true); }, true);
    }
    this._banHide = [true, true];   // his back banners are the ones he planted: they stay off for the rest of the fight
  }

  spawnBanner(p, side, hpMult, drop) {
    const g = this.game;
    const B = buildBanner();
    const hp = this.bannerHp(hpMult);
    let t = 0, pulseT = side === 0 ? 4.2 : 7.7, landed = !drop;
    const obj = this.spawnObject({
      pos: p, radius: BANNER_R, hp, mesh: B.group, name: 'War Banner', tag: 'banner', solid: true, marker: true,
      update: (dt) => {
        t += dt;
        // drop-in from the sky
        if (!landed) {
          const k = Math.min(1, t / 0.45);
          B.group.position.y = 18 * (1 - k) * (1 - k);
          if (k >= 1) { landed = true; B.group.position.y = 0; this.bannerLand(p); }
        }
        // cloth ripple, hit squash, live ring pulse
        B.cloth.rotation.y = 0.18 * Math.sin(t * 2.1 + side) + 0.08 * Math.sin(t * 5.3);
        B.cloth.rotation.z = 0.04 * Math.sin(t * 3.1);
        const f = obj.flashT > 0 ? obj.flashT / 0.1 : 0;
        B.body.scale.set(BANNER_SCALE * (1 + 0.05 * f), BANNER_SCALE * (1 - 0.04 * f), BANNER_SCALE * (1 + 0.05 * f));
        B.ring.scale.setScalar(1.7 + 0.12 * Math.sin(t * 3));
        // tether to the boss
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z, len = Math.hypot(dx, dz);
        B.linkG.rotation.y = Math.atan2(dx, dz);
        B.link.scale.set(0.22, Math.max(0.1, len - 2.5), 1);
        B.link.position.z = 1.2 + (len - 2.5) / 2;
        B.linkMat.opacity = 0.35 + 0.2 * Math.sin(t * 4);
        // the ring wave
        if (landed && !this.downed && !this.intermissionIdx && !this.dead) {
          pulseT -= dt;
          if (pulseT <= 0) {
            if (this.handles.size >= 2) pulseT = 0.4;                    // keep <= 3 hostile shapes live: wait for the board to clear
            else { pulseT = PULSE_EVERY; this.pulseTell(obj, B); }
          }
        }
      },
      onHit: () => { if (Math.random() < 0.5) g.vfx.emit('fireEmber', { x: p.x, y: 2 + Math.random() * 2, z: p.z }, { count: 3 }); },
      onDeath: () => this.bannerDown(obj, B, p, side),
    });
    obj.side = side;
    obj.hpMult = hpMult;
    this.banners.push({ obj, side });
    this.armor = 0.25 * this.banners.length;
    return obj;
  }

  bannerLand(p) {
    const g = this.game;
    g.fx.shake(0.35, 'threat');
    flameLicks(g, p, 3, 8, 0.8, 4);
    g.fx.burst(p, { color: 0x1fe0c2, count: 14, speed: 4, life: 0.5, size: 0.35, up: 1.4, hdr: 2.2 });
    scorch(g, p, 1.8, 0.5, 6);
  }

  // Ring-wave pulse: the banner flares and a small base circle fills, then the wave rolls out to r 6.
  pulseTell(obj, B) {
    const g = this.game;
    const lead = this.lead('pulse', 0.8);
    this._tele(g.fx.telegraph(obj.pos, 1.9, lead, { onDone: () => {
      if (obj.dead || this.dead) return;
      this.ringWave(obj.pos, { speed: 7.5, width: 0.9, from: 1.2, maxR: 6, dmg: 0.6, how: 'banner pulse' });
      g.fx.burst(obj.pos, { color: 0xff5a2a, count: 10, speed: 4, life: 0.4, size: 0.35, up: 1.0, hdr: 2.0 });
    } }));
    // flare on the cloth during the tell
    for (let i = 0; i < 4; i++) this.after(i * lead / 4, () => {
      if (obj.dead) return;
      spr(g.vfx, 'fireLick', obj.pos.x + rnd(-0.4, 0.4), 4.4 + Math.random(), obj.pos.z + rnd(-0.4, 0.4), 0, 1.2, 0, undefined, rnd(0.9, 1.3));
    });
  }

  bannerDown(obj, B, p, side) {
    const g = this.game;
    this.banners = this.banners.filter((b) => b.obj !== obj);
    this.armor = 0.25 * this.banners.length;   // think() does not run while Downed: refresh now
    if (this.dead || this.intermissionIdx) return;
    g.fx.shake(0.5, 'threat');
    g.fx.burst({ x: p.x, y: 0.5, z: p.z }, { color: 0x1fe0c2, count: 20, speed: 6, life: 0.7, size: 0.45, up: 1.2, hdr: 2.2 });
    flameLicks(g, p, 3, 10, 1.0, 5);
    g.addActor(new Toppling(g, B, p));
    this.addPoise(POISE.generator, 'generator');
    // Torchbearers: the site waits for a re-light
    const site = { pos: p.clone(), side, used: false, hpMult: obj.hpMult, adds: [] };
    site.marker = g.addActor(new RelightSite(g, p));
    this.sites.push(site);
    const left = this.banners.length;
    this.torchbearers(site);
    if (left === 0 && !this.downed) {
      g.fx.text({ x: this.pos.x, y: 3.6, z: this.pos.z }, 'DISARMED', '#e8eef8', true);
      g.events.emit('bossTell', { enemy: this, kind: 'disarmed', lead: 0 });
      this.down(5, 'break');
    }
  }

  // Race adds: two orc thralls run from the far wall to the fallen banner and re-light it at 50% HP.
  torchbearers(site) {
    const g = this.game, c = this.arena.center;
    const toSite = Math.atan2(site.pos.x - c.x, site.pos.z - c.z);
    for (let i = 0; i < 2; i++) {
      const a = toSite + Math.PI + (i ? 0.55 : -0.55) + rnd(-0.15, 0.15);
      const sp = this.arenaPoint(a, 0.97);
      const e = this.spawnAdd('ashHusk', sp, { hpMult: 0.45, speedMult: 1.45, goal: site.pos, goalR: 1.5, onGoal: (game, add) => {
        add.dead = true;
        if (site.used || this.dead || this.intermissionIdx) return;
        site.used = true;
        for (const o of site.adds) if (o !== add && !o.dead) { o.dead = true; g.fx.burst(o.pos, { color: 0x1fe0c2, count: 6, speed: 3, life: 0.4, size: 0.3 }); }
        site.marker.dead = true;
        this.sites = this.sites.filter((s) => s !== site);
        g.fx.text({ x: site.pos.x, y: 2.5, z: site.pos.z }, 'RE-LIT', '#1fe0c2', true);
        this.spawnBanner(site.pos, site.side, site.hpMult * 0.5, true);
      } });
      // the torch they carry: a small flame on a stick
      const torch = new THREE.Group();
      const stick = new THREE.Mesh(GEO.cylinder, BM.wood); stick.scale.set(0.05, 1.0, 0.05); stick.position.set(0.5, 1.2, 0.1);
      const fl = new THREE.Mesh(GEO.cone, BM.teal); fl.scale.set(0.2, 0.5, 0.2); fl.position.set(0.5, 1.85, 0.1);
      torch.add(stick, fl);
      e.mesh.add(torch);
      site.adds.push(e);
    }
    g.fx.text({ x: site.pos.x, y: 3.2, z: site.pos.z }, 'TORCHBEARERS', '#1fe0c2', true);
  }

  // ---------------------------------------------------------------- intermissions
  intermission(idx) {
    this._endMarks();
    this.charging = false;
    this.banners = [];
    for (const s of this.sites) s.marker.dead = true;
    this.sites.length = 0;
    return idx === 1 ? this.ashfall() : this.moltenTide();
  }

  // Intermission 1: plants the axe at the centre; 3 lava lanes follow in shown order, 1.6 s apart.
  ashfall() {
    this.tellEvt('ashfall', 1.5);
    const g = this.game, c = this.arena.center;
    const dist = distXZ(this.pos, c);
    const travel = Math.min(1.1, Math.max(0.35, dist / 18));
    this.yaw = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
    this.play('rush', travel, 0);
    this.slideTo(c, travel);
    this.after(travel, () => {
      this.play('plant', 8, 0.65);
      this.after(0.65, () => {
        g.fx.shake(0.7, 'threat');
        const p = this.world([-1.2, 0, 4.2]);
        flameLicks(g, p, 6, 28, 1.7, 14);
        scorch(g, p, 5, 1.2, 8);
        g.fx.flashDisc(p, { color: 0xffb040, radius: 5, life: 0.3, hdr: 1.8 });
        g.vfx.emitter('fireEmber', { pos: { x: p.x, z: p.z }, rate: 20, radius: 2.5, y: [0.1, 0.5], life: 6 });
      });
    });
    // falling ash over the whole arena
    g.vfx.emitter('fireAsh', { pos: c, rate: 70, radius: this.arena.r * 0.95, y: [8, 11], vel: { x: 0.7, y: -2.6, z: 0.3 }, land: true, life: 7.4, scale: 1.2 });
    // lanes (each re-aimed at where you stand when it is shown)
    const t0 = travel + 1.1, lead = this.lead('lane', 1.6);
    let prev = Math.random() * Math.PI;
    for (let i = 0; i < 3; i++) {
      const show = t0 + i * 1.6 + (i ? 0.64 * 0 : 0);
      this.after(show, () => {
        const pp = g.player.pos;
        let a = Math.random() * Math.PI;
        while (Math.abs(wrap2(a - prev)) < 0.6 || Math.abs(wrap2(a - prev - Math.PI)) < 0.6) a = Math.random() * Math.PI;
        prev = a;
        this.lane(pp, a, lead, i + 1);
      });
    }
    return t0 + 2 * 1.6 + lead + 1.1;
  }

  // One lava lane across the whole arena through `p`. Telegraph (line w 3) → lava for 3 s.
  lane(p, ang, lead, n, o = {}) {
    const g = this.game, c = this.arena.center, R = this.arena.r - 0.8;
    const d = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const w = { x: p.x - c.x, z: p.z - c.z };
    const b = w.x * d.x + w.z * d.z, cc = w.x * w.x + w.z * w.z - R * R;
    const disc = Math.max(0.01, b * b - cc), s = Math.sqrt(disc);
    const t1 = -b - s, t2 = -b + s;
    const from = V3(p.x + d.x * t1, p.z + d.z * t1), to = V3(p.x + d.x * t2, p.z + d.z * t2);
    const len = t2 - t1;
    const width = o.width ?? 3;
    g.fx.text({ x: from.x + d.x * 2, y: 0.5, z: from.z + d.z * 2 }, String(n), '#ffb040', true);
    this.line(from, d, len, width, lead, { dmg: o.dmg ?? 1.2, how: o.how ?? 'lava lane', onResolve: () => {
      if (o.meteors) { this.laneMeteors(from, d, len); return; }
      this.own(new LavaPatch(this, from, to, width, 3.4));
      flameLicks(g, V3((from.x + to.x) / 2, (from.z + to.z) / 2), 5, 10, 1.2, 4);
      g.fx.shake(0.3, 'threat');
    } });
  }

  // Molten Tide lane: a string of meteors falls along the line.
  laneMeteors(from, d, len) {
    const g = this.game;
    const n = Math.round(len / 3.2);
    for (let i = 0; i <= n; i++) {
      const p = V3(from.x + d.x * (len * i / n), from.z + d.z * (len * i / n));
      this.after(i * 0.045, () => {
        meteorBurst(g, p, 2.0, { scale: 0.65, column: i % 2 === 0, dome: false });
        scorch(g, p, 1.6, 0.5, 3);
      }, true);
    }
    g.fx.shake(0.5, 'threat');
  }

  slideTo(p, dur) {
    const from = this.pos.clone();
    let t = 0;
    const step = () => {
      t += 1 / 30;
      const k = Math.min(1, t / dur);
      this.pos.lerpVectors(from, p, k * k * (3 - 2 * k));
      if (k < 1) this.after(1 / 30, step, true);
    };
    step();
  }

  // Intermission 2: gold ring shows the new edge (r 16), the lava rises over 1.5 s, then 4 meteor lanes.
  moltenTide() {
    this.tellEvt('tide', 1.8);
    const g = this.game, c = this.arena.center;
    const slideT = Math.min(1.0, distXZ(this.pos, c) / 16);
    if (slideT > 0.3) { this.yaw = Math.atan2(c.x - this.pos.x, c.z - this.pos.z); this.play('rush', slideT, 0); this.slideTo(c, slideT); }
    this.after(Math.max(0.2, slideT), () => this.play('warcry', 2.4, 1.0));
    const newR = 16;
    // gold safe circle at the new radius
    this.circle(c, newR, 1.6, { safe: true });
    g.fx.text({ x: c.x + newR * 0.7, y: 0.5, z: c.z + newR * 0.7 }, 'THE TIDE RISES', '#ffe9a8', true);
    this.after(1.2, () => {
      g.encounter?.setArenaRadius(newR, 1.5);
      this.rim = new RimLava(this, 22.5, this.arena.r, newR, 1.5);
      g.addActor(this.rim);
      g.fx.shake(0.6, 'threat');
    });
    const lead = this.lead('meteorLane', 1.2);
    const t0 = 2.8;
    for (let i = 0; i < 4; i++) {
      this.after(t0 + i * 1.1, () => {
        const pp = g.player.pos;
        this.lane(pp, Math.random() * Math.PI, lead, i + 1, { width: 3.4, dmg: 1.2, how: 'meteor lane', meteors: true });
      });
    }
    return t0 + 3 * 1.1 + lead + 0.8;
  }

  // ---------------------------------------------------------------- hooks
  think(dt, mv) {
    if (!this.inited && !this.intermissionIdx) {
      this.inited = true;
      this.lastOverswing = this.fightT;
      this.raiseBanners();
    }
    // armor 0.25 per living banner
    let live = 0;
    for (const b of this.banners) if (!b.obj.dead) live++;
    this.armor = 0.25 * live;
    if (!this.intermissionIdx && !this.downed && !this.cast) {
      if (this.phase >= 3) this.axeHeat = Math.min(100, ((this.fightT - this.lastOverswing) / OVERSWING_EVERY) * 100);   // P3: a 30 s clock
      else this.axeHeat = Math.min(100, this.axeHeat + HEAT_PASSIVE * dt);                                          // P1/P2: the axe also warms by itself
      if (this.axeHeat >= 100) this._queueOverswing();
    }
    if (this.rim && this.rim.fading === false && this.dead) this.rim.fadeOut();
  }

  onPhase(phase) {
    this.axeHeat = this.phase >= 3 ? 0 : this.axeHeat;
    this.lastOverswing = this.fightT;
    this._overQueued = false;
    this.raiseBanners();
  }

  onDowned() {
    if (this.charging) { this.charging = false; if (this.trail) { this.trail.emitting = false; this.trail = null; } }
    this._endMarks();
    this._overQueued = this._overQueued && this.axeHeat >= 100;
  }

  onClearField() {
    if (this.trail) { this.trail.emitting = false; this.trail = null; }
    this._endMarks();
  }

  visuals(dt, anim) {
    const h = this.rig, g = this.game;
    // Axe Heat flames + hidden back banners
    const tgt = this.downed ? 0.12 : this.intermissionIdx ? 0.5 : this.axeHeat / 100;
    this._heatVis += (tgt - this._heatVis) * Math.min(1, dt * 5);
    h.heat = this._heatVis;
    for (let i = 0; i < 2; i++) {
      const to = this._banHide[i] ? 0 : 1;
      this._banVis[i] += (to - this._banVis[i]) * Math.min(1, dt * 6);
    }
    h.banner = this._banVis;
    if (this.axeHeat > 60 && Math.random() < dt * (this.axeHeat - 50) * 0.3 && !this.downed) {
      const p = this.world([-2.7 + rnd(-0.6, 0.6), 4.8 + rnd(-0.5, 0.8), 0.3 + rnd(-0.5, 0.5)]);
      spr(g.vfx, 'fireEmber', p.x, p.y, p.z, rnd(-0.4, 0.4), rnd(0.8, 1.6), rnd(-0.4, 0.4), rnd(0.5, 0.9), 0.1);
    }
    if (!anim || this.downed) return;
    // whirl: fire licks flung off the orbiting blade; overswing: the wind-up burns brighter and sheds sparks
    if (anim.action === 'axeSpin') {
      const k = Math.min(1, anim.t / anim.dur);
      if (k > 0.45 && k < 0.95) {
        const psi = vashkarSpinAngle(k), c = Math.cos(psi), s = Math.sin(psi);
        const px = -2.6, pz = 3.4;
        const w = this.world([px * c + pz * s, 5.8, -px * s + pz * c]);
        for (let i = 0; i < 3; i++) spr(g.vfx, i ? 'fireEmber' : 'fireLick', w.x, w.y, w.z, rnd(-2, 2), rnd(0, 2), rnd(-2, 2), undefined, i ? 0.12 : 0.7);
      }
    } else if (anim.action === 'overswing') {
      const k = Math.min(1, anim.t / anim.dur);
      if (Math.random() < dt * (10 + 40 * k)) {
        const w = this.world([-2.0 + rnd(-1, 1), 6.2 + rnd(-0.8, 1.2), -1.0 + rnd(-1, 1)]);
        spr(g.vfx, Math.random() < 0.6 ? 'fireEmber' : 'fireLick', w.x, w.y, w.z, rnd(-0.6, 0.6), rnd(0.5, 2), rnd(-0.6, 0.6), undefined, 0.5 + 0.6 * k);
      }
      if (k > 0.2 && Math.random() < dt * 6 * k) {
        // heat cracks opening in the ground at his feet
        const a = Math.random() * 6.28, r = rnd(1.5, 3 + 3 * k);
        spr(g.vfx, 'fireLava', this.pos.x + Math.sin(a) * r, 0.06, this.pos.z + Math.cos(a) * r, 0, 0, 0, undefined, rnd(1.2, 2.0));
      }
    } else if (anim.action === 'downed' && Math.random() < dt * 6) {
      spr(g.vfx, 'fireSoot', this.pos.x + rnd(-1.5, 1.5), 1.5, this.pos.z + rnd(-1.5, 1.5), 0, 1.0, 0, 1.1, 0.5, -0.5, 1.5);
    }
  }

  onDeath(game) {
    super.onDeath(game);
    this.rim?.fadeOut();
    for (const s of this.sites) s.marker.dead = true;
  }

  onDispose(game) {
    if (this.rim) { this.rim.dead = true; this.rim = null; }
    for (const s of this.sites) s.marker.dead = true;
    this._endMarks();
  }
}
