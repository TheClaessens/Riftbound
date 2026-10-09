import * as THREE from 'three';
import { BossBase, POISE, dirFromAngle, GEO, blendAddMaterial, HOSTILE_RED, SAFE_GOLD, segDist } from './core.js';
import { aurelith as AURELITH_MODEL, AURELITH_MOUTH, AURELITH_TAIL } from '../creatures/bosses/aurelith.js';
import { distXZ, ELEMENT_CSS } from '../../core/utils.js';
import { HERO_YIELD_GLSL } from '../vfx/heroYield.js';
import { breakWard as breakWardFx } from '../combat.js';

// =====================================================================================
//  Aurelith, the Prism Dragon — Act III FINAL boss (design/RAID_PASSES.md Pass 4, contract design/RAID.md).
//  P1 Refraction · Int 1 Skyward · P2 Storm Reach · Int 2 Floodfall · P3 Prismatic Overload.
//
//  Ward language: the Prism Ward colour (rotates every 10 s, P3 7 s, < 8% HP 3 s) names her NEXT special:
//    fire → Flame Lanes · frost → Frost Rings · storm → Tempest · arcane → Shard Fall.
//  A reaction on her breaks the ward (core: `wardBroken`): that cast is cancelled and she loses 10 poise
//  (a gold-standard "predict, then punish" loop). Prism Conduits (P1) re-form a broken ward after 3 s.
//  Arena: 4 crystal pillars (blockers) at 0.55 R. Beams stop at pillars; the gold strip behind each pillar
//  is the safe lee. Objects/adds and what each is FOR:
//    Crystal Pillars  — line-of-sight cover from beams / Nova (they crack under beams from P2 on).
//    Prism Conduits   — P1 generators: while one lives a broken ward re-forms; both down = ward off 8 s + Downed.
//    Storm Wyvern     — P2+: one at a time; its death leaves a Lightning Rod (safe zone) where YOU killed it:
//                       inside it, Tempest strikes are drawn to the rod and do nothing.
// =====================================================================================

const TAU = Math.PI * 2;
const WARD_HEX = { fire: 0xff6a1f, frost: 0x66d9ff, storm: 0xffe14a, arcane: 0xb67cff };
const WARD_NAME = { fire: 'FIRE', frost: 'FROST', storm: 'STORM', arcane: 'ARCANE' };
const WARD_ORDER = ['frost', 'fire', 'storm', 'arcane'];
const WARD_CYCLE = [10, 10, 7];       // by phase; < 8% HP: 3 s
const FINAL_FRAC = 0.08;
const BEAM_W = 1.3;
const PILLAR_R = 1.2;
const PILLAR_AT = 0.55;
const FLOOD_R = 17;

const CFG = {
  id: 'riftHeart', name: 'Aurelith, the Prism Dragon', model: AURELITH_MODEL,
  hp: 86000, radius: 2.4, speed: 2.3, stopGap: 5, resist: null, deathColor: 0x9ff3ff,
  look: { scale: 1.1, glow: [0.35, 0.5, 0.65] },
  cycle: [2.4, 2.0, 1.6], downed: [4, 5, 6], enrageAt: 120, turnRate: 7, windedDur: 4,
};

const _w = new THREE.Vector3();
const _v = new THREE.Vector3();
const _col = new THREE.Color();

// Smallest positive distance from (ox,oz) along unit (dx,dz) at which the ray leaves the circle (c, R).
function circleExit(ox, oz, dx, dz, cx, cz, R) {
  const fx = ox - cx, fz = oz - cz;
  const b = fx * dx + fz * dz, cc = fx * fx + fz * fz - R * R;
  const disc = b * b - cc;
  return disc <= 0 ? 0 : -b + Math.sqrt(disc);
}

// =====================================================================================
//  Beam sweep: n beams from one origin, sweeping `span` radians over `dur`. Pillars stop a beam; the player is
//  only hurt by the unblocked part (and never when boss.shadowed()). opts: { base, n, span, dur, mult,
//  gaps: [{a,w}] (beam off inside), crack (pillars take a hit per cast), width }
// =====================================================================================
class BeamField {
  constructor(boss, origin, o) {
    const game = boss.game;
    this.hostile = true;
    this.boss = boss;
    this.o = new THREE.Vector3(origin.x, 0, origin.z);
    this.base = o.base; this.n = o.n; this.span = o.span; this.dur = o.dur;
    this.mult = o.mult ?? 0.8;
    this.gaps = o.gaps ?? null;
    this.crack = !!o.crack;
    this.width = o.width ?? BEAM_W;
    this.t = 0; this.hitCd = 0; this.hitSet = new Set();
    this.angle0 = o.base;
    this.mat = blendAddMaterial(HOSTILE_RED, { hdr: 1.15, occ: 0.5, opacity: 0.75, depthTest: false });
    this.coreMat = blendAddMaterial(0xffd0d0, { hdr: 1.3, occ: 0.25, opacity: 0.8, depthTest: false });
    this.beams = [];
    for (let i = 0; i < this.n; i++) {
      const group = new THREE.Group();
      const m = new THREE.Mesh(GEO.plane, this.mat);
      m.rotation.x = -Math.PI / 2; m.renderOrder = 8;
      const c = new THREE.Mesh(GEO.plane, this.coreMat);
      c.rotation.x = -Math.PI / 2; c.renderOrder = 9;
      group.add(m, c);
      game.scene.add(group);
      this.beams.push({ group, m, c, len: 20, hitPillar: null });
    }
  }

  // Length of beam from origin along (dx,dz): to the arena wall, or the first blocking pillar.
  rayLen(dx, dz, beam) {
    const b = this.boss, a = b.arena;
    let len = circleExit(this.o.x, this.o.z, dx, dz, a.center.x, a.center.z, a.r + 0.5);
    beam.hitPillar = null;
    for (const p of b.pillars) {
      if (p.dead) continue;
      const bx = p.pos.x - this.o.x, bz = p.pos.z - this.o.z;
      const t0 = bx * dx + bz * dz;
      if (t0 <= 0) continue;
      const perp2 = bx * bx + bz * bz - t0 * t0;
      if (perp2 >= p.r * p.r) continue;
      const th = t0 - Math.sqrt(p.r * p.r - perp2);
      if (th < len) { len = th; beam.hitPillar = p; }
    }
    return Math.max(0.5, len);
  }

  update(dt, game) {
    const boss = this.boss;
    if (boss.dead) return false;
    this.t += dt;
    this.hitCd -= dt;
    const k = Math.min(1, this.t / this.dur);
    const pl = game.player;
    for (let i = 0; i < this.n; i++) {
      const bm = this.beams[i];
      const a = this.base + this.span * k + (TAU * i) / this.n;
      if (i === 0) this.angle0 = a;
      const dx = Math.sin(a), dz = Math.cos(a);
      let off = false;
      if (this.gaps) for (const g of this.gaps) { let d = Math.abs(a - g.a) % TAU; if (d > Math.PI) d = TAU - d; if (d <= g.w / 2) { off = true; break; } }
      const len = this.rayLen(dx, dz, bm);
      bm.group.visible = !off;
      bm.group.position.set(this.o.x, 0.11, this.o.z);
      bm.group.rotation.y = a;
      bm.m.scale.set(this.width, len, 1); bm.m.position.z = len / 2;
      bm.c.scale.set(this.width * 0.34, len, 1); bm.c.position.z = len / 2;
      if (off) continue;
      if (bm.hitPillar) {
        if (this.crack && !this.hitSet.has(bm.hitPillar)) { this.hitSet.add(bm.hitPillar); boss.crackPillar(bm.hitPillar); }
        if (Math.random() < 0.5) game.fx.burst({ x: this.o.x + dx * len, y: 0.9, z: this.o.z + dz * len }, { color: 0xcfe8ff, count: 2, speed: 3, life: 0.3, size: 0.3, up: 1, hdr: 2 });
      }
      if (this.hitCd <= 0 && !pl.dead) {
        const d = segDist(pl.pos.x, pl.pos.z, this.o.x, this.o.z, this.o.x + dx * len, this.o.z + dz * len);
        if (d <= this.width * 0.5 + pl.radius * 0.5 && !boss.shadowed(pl.pos, this.o)) {
          this.hitCd = 0.5;
          boss.hitPlayer(this.mult, 'prism beam');
        }
      }
    }
    return this.t < this.dur;
  }

  dispose(game) {
    for (const b of this.beams) game.scene.remove(b.group);
    this.mat.dispose(); this.coreMat.dispose();
  }
}

// =====================================================================================
//  Pillar shadow strips: the gold "safe lee" behind each pillar while a beam / Nova is live. A pillar's
//  lee is a strip of the pillar's width running away from the beam source (drawn slightly narrower than the
//  true shadow, so gold is always truly safe).
// =====================================================================================
class PillarShadows {
  constructor(boss) { this.boss = boss; this.strips = []; }

  show(src) {
    this.hide();
    const b = this.boss, g = b.game, a = b.arena;
    for (const p of b.pillars) {
      if (p.dead) continue;
      const dx = p.pos.x - src.x, dz = p.pos.z - src.z, d = Math.hypot(dx, dz) || 1;
      _v.set(dx / d, 0, dz / d);
      const exit = circleExit(src.x, src.z, _v.x, _v.z, a.center.x, a.center.z, a.r);
      const len = exit - d - p.r;
      if (len < 1) continue;
      const from = { x: p.pos.x + _v.x * p.r, z: p.pos.z + _v.z * p.r };
      const h = g.fx.lineTelegraph(from, _v, len, p.r * 1.85, 9999, { safe: true });
      // hold the strip fully drawn (a normal telegraph fills over its duration)
      const tr = g.fx.transients.find((t) => t.mesh === h.mesh);
      const mat = h.mesh.children[0].material;
      if (tr) tr.update = (t) => { if (h.done) { t.t = t.life; return; } mat.uniforms.uProgress.value = 1; mat.uniforms.uTime.value = t.t; };
      this.strips.push(h);
    }
  }

  hide() {
    for (const h of this.strips) h.cancel();
    this.strips.length = 0;
  }
}

// =====================================================================================
//  Floodfall water: an opaque-pass ground layer (renderOrder 1, like decals) filling everything outside the
//  current arena radius — foam lapping at a wavy edge, scrolling ripples, depth-tinted.
// =====================================================================================
const FLOOD_VS = /* glsl */`
  varying vec2 vP; varying vec3 vPV;
  void main() {
    vP = position.xz;
    vec4 pv = modelViewMatrix * vec4(position, 1.0); vPV = pv.xyz;
    gl_Position = projectionMatrix * pv;
  }`;
const FLOOD_FS = /* glsl */`
  uniform float uInner, uOuter, uTime, uFade, uSurge;
  varying vec2 vP; varying vec3 vPV;
  ${HERO_YIELD_GLSL}
  void main() {
    float d = length(vP);
    float a = atan(vP.y, vP.x);
    float wob = 0.30 * sin(a * 7.0 + uTime * 1.7) + 0.2 * sin(a * 13.0 - uTime * 2.4) + 0.12 * sin(a * 29.0 + uTime * 3.1);
    float edge = uInner - 0.25 + wob * (0.5 + 0.7 * uSurge);
    float cover = smoothstep(edge - 0.06, edge + 0.1, d) * (1.0 - smoothstep(uOuter - 4.0, uOuter, d));
    if (cover < 0.004) discard;
    float r1 = sin(d * 2.7 - uTime * 1.3 + sin(a * 5.0 + uTime * 0.4) * 1.5);
    float r2 = sin(d * 4.9 + uTime * 0.9 + sin(a * 9.0 - uTime * 0.3) * 2.2);
    float lines = smoothstep(0.78, 1.0, r1 * 0.55 + r2 * 0.45);
    float foamW = 0.55 + uSurge * 1.5;
    float foam = (1.0 - smoothstep(0.0, foamW, d - edge)) * (0.65 + 0.35 * sin(a * 33.0 + uTime * 4.5));
    float deep = smoothstep(0.0, 7.0, d - edge);
    vec3 col = mix(vec3(0.20, 0.62, 0.74), vec3(0.06, 0.30, 0.46), deep);
    col += vec3(0.55, 0.85, 0.95) * lines * 0.32;
    col = mix(col, vec3(0.92, 0.98, 1.0), clamp(foam, 0.0, 1.0) * 0.9);
    float al = 0.80 * cover * uFade;
    gl_FragColor = vec4(col * al, al) * heroYieldGround(vPV);
  }`;

class FloodWater {
  constructor(boss) {
    const game = boss.game, c = boss.arena.center;
    this.boss = boss;
    this.hostile = false;
    this.gone = false;
    const outer = (boss.arena.r0 ?? boss.arena.r) + 7;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uInner: { value: boss.arena.r }, uOuter: { value: outer }, uTime: { value: 0 }, uFade: { value: 0 }, uSurge: { value: 0 },
        uHeroView: game.vfx.uHeroView, uHeroYield: game.vfx.uHeroYield,
      },
      vertexShader: FLOOD_VS, fragmentShader: FLOOD_FS,
      transparent: false, depthWrite: false, depthTest: false, ...game.vfx.blend,
    });
    this.geo = new THREE.PlaneGeometry(outer * 2, outer * 2).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.position.set(c.x, 0.045, c.z);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    game.scene.add(this.mesh);
    this.t = 0; this.surge = 0; this.target = 1; this.splashT = 0; this.linger = -1;
  }

  begin() { this.surge = 1; this.target = 1; }
  fadeOut() { this.target = 0; }
  orphan() { this.linger = 5; }                       // the body died: wait for the Echo to adopt the water, else drain
  adopt(boss) { this.boss = boss; this.linger = -1; this.target = 1; }

  update(dt) {
    const u = this.mat.uniforms;
    this.t += dt;
    u.uTime.value = this.t;
    if (this.linger >= 0) { this.linger -= dt; if (this.linger < 0) this.target = 0; }
    const ar = this.boss.game.encounter?.arena;
    u.uInner.value = ar ? ar.r : u.uInner.value;
    u.uFade.value += (this.target - u.uFade.value) * Math.min(1, dt * (this.target ? 1.8 : 1.2));
    this.surge = Math.max(0, this.surge - dt / 3.2);
    u.uSurge.value = this.surge;
    // splashes along the rising rim
    this.splashT -= dt;
    if (this.splashT <= 0 && this.surge > 0.05) {
      this.splashT = 0.05;
      const a = Math.random() * TAU, r = u.uInner.value + 0.4, c = this.mesh.position;
      this.boss.game.fx.burst({ x: c.x + Math.sin(a) * r, y: 0.2, z: c.z + Math.cos(a) * r }, { color: 0xd8f2ff, count: 5, speed: 3.2, life: 0.5, size: 0.4, up: 2.2, gravity: 7, hdr: 1.3 });
    }
    return !this.gone && !(this.target === 0 && u.uFade.value < 0.01);
  }

  dispose(game) {
    if (this._disposed) return;
    this._disposed = true;
    game.scene.remove(this.mesh);
    this.geo.dispose(); this.mat.dispose();
  }
}

// =====================================================================================
//  Aurelith
// =====================================================================================
export class Aurelith extends BossBase {
  constructor(game, pos, opts) {
    super(game, CFG, pos, opts);
    const ev = game.events;
    this.moves = {
      special: () => this.mSpecial(),
      beams: () => this.mBeams(2),
      beams4: () => this.mBeams(4),
      quad: () => this.mQuad(),
      nova: () => this.mNova(),
    };
    // ---- ward state (HUD reads ward / wardT / wardCycle) ----
    this.ward = null;
    this.wardEl = null;
    this.wardIdx = -1;
    this.wardCycle = WARD_CYCLE[this.phase - 1];
    this.wardT = this.wardCycle;
    this.wardOffT = 0;        // both conduits down: ward off, cycle paused
    this.reformT = 0;         // a conduit lives: broken ward re-forms after 3 s
    this.reformEl = null;
    this.specialQ = [];       // wards whose special has not been cast yet
    this.tokens = [];         // live special casts: { fam, cancelled, handles, end }
    this.tickN = 0;
    this.finalStage = false;
    this.phaseT = 0;
    this.novaUsed = false; this.novaQueued = false;
    // ---- arena objects ----
    this.pillars = [];
    this.conduits = [];
    this.beamsLive = [];
    this.tellLines = [];
    this.strikes = [];
    this.shadows = new PillarShadows(this);
    this.wyvern = null; this.wyvernCd = 2.5;
    this.rod = null;
    this.flood = null;
    this.orbit = Math.random() * TAU;
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.pillarMat = this.own_mat(new THREE.MeshLambertMaterial({ color: 0xd8def5, emissive: 0x2c3a78 }));
    this.pillarHurtMat = this.own_mat(new THREE.MeshLambertMaterial({ color: 0xe9d9c4, emissive: 0x7a4a2a }));

    // prism wardglow under the heart (legacy), tinted by the ward
    this.wardGlowMat = this.own_mat(blendAddMaterial(0xffffff, { hdr: 1, occ: 0.4, opacity: 0.22, depthTest: false }));
    const glow = new THREE.Mesh(GEO.disc, this.wardGlowMat);
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.05, 1.6); glow.scale.setScalar(2.1); glow.renderOrder = 2;
    this.wardGlow = glow;
    this.mesh.add(glow);

    this._offs.push(ev.on('wardBroken', ({ enemy, element }) => { if (enemy === this) this.onWardBroken(element); }));

    // the Echo fights in the flooded arena: take over the water the first body left behind
    const af = game._aurFlood;
    if (opts.echo && af && !af._disposed && !af.gone) { af.adopt(this); this.flood = af; }
    else if (this.arena.r0 && this.arena.r < this.arena.r0 - 0.5) { this.flood = game.addActor(new FloodWater(this)); }
    game._aurFlood = null;
    this.spawnPillars();
    if (this.phase === 1) this.spawnConduits();
    this.cycleWard();
  }

  rotation(phase) {
    if (phase === 1) return ['special', 'beams', 'special', 'nova', 'beams', 'special'];
    if (phase === 2) return ['special', 'quad', 'beams', 'special', 'nova', 'quad', 'beams'];
    return ['special', 'beams4', 'special', 'quad', 'nova', 'special', 'beams4'];
  }

  novaAt() { return this.phase === 1 ? 12 : 9; }

  ready(name) {
    if (name === 'special') return this.specialQ.length > 0 && this.wardOffT <= 0;
    if (name === 'nova') return !this.novaUsed && this.phaseT >= this.novaAt();
    return true;
  }

  // ================================================================ ward language
  setWard(el) {
    this.ward = el;
    if (el) this.wardEl = el;
    this.game.events.emit('bossWard', { enemy: this, ward: el });
  }

  cycleWard() {
    this.wardIdx = (this.wardIdx + 1) % WARD_ORDER.length;
    const el = WARD_ORDER[this.wardIdx];
    this.wardT = this.wardCycle;
    this.reformT = 0;
    this.setWard(el);
    this.game.fx.text({ x: this.pos.x, y: 2.8, z: this.pos.z }, `PRISM WARD: ${WARD_NAME[el]}`, ELEMENT_CSS[el], true);
    this.tickN++;
    if (this.finalStage && this.tickN % 3 !== 0) return;     // the final stagger window: rapid wards, rare specials
    const cap = this.phase === 3 ? 2 : 1;
    this.specialQ.push(el);
    while (this.specialQ.length > cap) this.specialQ.shift();
    // the colour names her NEXT cast: do it as soon as she is free (the player's window to break the ward is the tell)
    if (this.queued.filter((q) => q === 'special').length < this.specialQ.length) this.queued.push('special');
  }

  onWardBroken(el) {
    if (this.dead || this.intermissionIdx) return;
    this.addPoise(this.finalStage ? 15 : 10, 'ward');
    this.expose(2.5);
    // that family's next cast is cancelled (queued, or in its telegraph)
    let cancelled = false;
    const qi = this.specialQ.indexOf(el);
    if (qi >= 0) { this.specialQ.splice(qi, 1); cancelled = true; }
    for (const t of this.tokens) {
      if (t.fam === el && !t.cancelled && this.time < t.end) {
        t.cancelled = true;
        for (const h of t.handles) h.cancel();
        cancelled = true;
        this.busyT = Math.min(this.busyT, 0.6);
        this.gapT = 0.8;
        this.play('recover', 0.6, 0);
      }
    }
    if (cancelled) this.game.fx.text({ x: this.pos.x, y: 3.4, z: this.pos.z }, 'CAST BROKEN', '#e8eef8', true);
    if (this.liveConduits() > 0) { this.reformT = 3; this.reformEl = el; }
    this.game.events.emit('bossWard', { enemy: this, ward: null });
  }

  liveConduits() { let n = 0; for (const c of this.conduits) if (!c.dead) n++; return n; }

  tickWard(dt) {
    if (this.wardOffT > 0) return;          // counted down in update() (it keeps running through the Downed)
    if (this.reformT > 0) {
      this.reformT -= dt;
      if (this.reformT <= 0 && !this.ward && this.liveConduits() > 0) {
        this.setWard(this.reformEl);
        this.game.fx.text({ x: this.pos.x, y: 3.0, z: this.pos.z }, 'WARD RE-FORMED', ELEMENT_CSS[this.reformEl], true);
      }
    }
    this.wardT -= dt;
    if (this.wardT <= 0) this.cycleWard();
  }

  // ================================================================ arena objects
  spawnPillars() {
    const geoOcta = GEO.octa, geoCyl = GEO.cylinder;
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + 0.12;     // offset from the Rift Crystals (world.js puts those on the diagonals)
      const p = this.arenaPoint(ang, PILLAR_AT);
      const mesh = new THREE.Group();
      const slab = new THREE.Mesh(geoCyl, this.pillarMat); slab.scale.set(1.25, 0.55, 1.25); slab.position.y = 0.27;
      const main = new THREE.Mesh(geoOcta, this.pillarMat); main.scale.set(1.0, 2.7, 1.0); main.position.y = 2.6;
      const sideA = new THREE.Mesh(geoOcta, this.pillarMat); sideA.scale.set(0.5, 1.4, 0.5); sideA.position.set(0.85, 1.3, 0.3); sideA.rotation.z = -0.35;
      const sideB = new THREE.Mesh(geoOcta, this.pillarMat); sideB.scale.set(0.45, 1.2, 0.45); sideB.position.set(-0.7, 1.15, -0.5); sideB.rotation.z = 0.4;
      mesh.add(slab, main, sideA, sideB);
      const pil = { dead: false, cracks: 0, r: PILLAR_R, pos: null, obj: null, main, sideA, sideB, mesh };
      pil.obj = this.spawnObject({
        pos: p, radius: PILLAR_R, hp: 1e9, mesh, solid: true, blocker: true, targetable: false, keepOnClear: true,
        name: 'Crystal Pillar', tag: 'pillar',
        onDeath: () => { pil.dead = true; },
      });
      pil.pos = pil.obj.pos;
      this.pillars.push(pil);
    }
  }

  // A beam reached a pillar: from P2 on, 3 beam casts crack it apart (fewer shelters).
  crackPillar(p) {
    if (this.phase < 2 || p.dead) return;
    const g = this.game;
    p.cracks++;
    g.fx.burst({ x: p.pos.x, y: 2, z: p.pos.z }, { color: 0xcfe8ff, count: 10, speed: 5, life: 0.5, size: 0.4, up: 2, gravity: 6, hdr: 1.6 });
    if (p.cracks >= 3) {
      g.fx.burst({ x: p.pos.x, y: 1.5, z: p.pos.z }, { color: 0xcfe8ff, count: 30, speed: 7, life: 0.8, size: 0.5, up: 3, gravity: 9, hdr: 1.8 });
      g.fx.flashDisc(p.pos, { color: 0xe8eef8, radius: 2.4, life: 0.3, hdr: 1.6 });
      g.fx.shake(0.4, 'threat');
      g.fx.text({ x: p.pos.x, y: 3, z: p.pos.z }, 'PILLAR SHATTERED', '#e8eef8', true);
      p.dead = true; p.obj.dead = true; p.obj.onDeath(g);
    } else {
      // visible damage: the crown slumps and the whole crystal glows amber-hot
      p.main.material = this.pillarHurtMat; p.sideA.material = this.pillarHurtMat; p.sideB.material = this.pillarHurtMat;
      p.main.rotation.z = 0.12 * p.cracks; p.main.scale.y = 2.7 - 0.45 * p.cracks;
      p.main.position.y = 2.6 - 0.4 * p.cracks;
    }
  }

  // Prism Conduits (P1): generators at the wall. Purpose: gate the ward-break reward.
  spawnConduits() {
    const g = this.game;
    const a0 = Math.PI / 4 + (Math.random() < 0.5 ? 0 : Math.PI / 2);      // a diagonal pair, opposite each other
    const mat = this.own_mat(new THREE.MeshLambertMaterial({ color: 0xfff0c8, emissive: 0xc8902a }));
    const lineMat = this.own_mat(blendAddMaterial(SAFE_GOLD, { hdr: 1.5, occ: 0.3, opacity: 0.7, side: THREE.DoubleSide, depthTest: false }));
    for (let i = 0; i < 2; i++) {
      const pos = this.arenaPoint(a0 + i * Math.PI, 0.9);
      const mesh = new THREE.Group();
      const main = new THREE.Mesh(GEO.octa, mat); main.scale.set(0.8, 2.0, 0.8); main.position.y = 2.1;
      const a = new THREE.Mesh(GEO.octa, mat); a.scale.set(0.4, 1.0, 0.4); a.position.set(0.7, 1.0, 0.2); a.rotation.z = -0.4;
      const b = new THREE.Mesh(GEO.octa, mat); b.scale.set(0.35, 0.9, 0.35); b.position.set(-0.6, 0.9, -0.3); b.rotation.z = 0.4;
      const base = new THREE.Mesh(GEO.cylinder, mat); base.scale.set(0.9, 0.4, 0.9); base.position.y = 0.2;
      const pivot = new THREE.Group();
      const line = new THREE.Mesh(GEO.plane, lineMat);
      line.rotation.x = -Math.PI / 2; line.renderOrder = 9;
      pivot.add(line); pivot.position.y = 2.2;
      const orbit = new THREE.Mesh(GEO.torus, lineMat); orbit.scale.setScalar(1.15); orbit.position.y = 2.1; orbit.rotation.x = Math.PI / 2.4; orbit.renderOrder = 9;
      mesh.add(base, main, a, b, pivot, orbit);
      const obj = this.spawnObject({
        pos, radius: 1.0, hp: 520 * (g.actDef?.hp ?? 1), mesh, name: 'Prism Conduit', tag: 'conduit', solid: true,
        update: (dt, o) => {
          const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, len = Math.hypot(dx, dz);
          pivot.rotation.y = Math.atan2(dx, dz);
          line.scale.set(0.2 + 0.05 * Math.sin(this.time * 6), Math.max(0.1, len - 2), 1);
          line.position.z = len / 2;
          main.rotation.y += dt * 0.8; orbit.rotation.z += dt * 1.6;
        },
        onDeath: (o) => this.onConduitDead(o),
      });
      obj.marker = true;
      this.conduits.push(obj);
    }
  }

  onConduitDead(o) {
    if (this.dead || this.intermissionIdx) return;
    const g = this.game;
    g.fx.burst({ x: o.pos.x, y: 1.5, z: o.pos.z }, { color: 0xcfe8ff, count: 26, speed: 6, life: 0.7, size: 0.5, up: 2.5, gravity: 8, hdr: 1.8 });
    g.fx.flashDisc(o.pos, { color: SAFE_GOLD, radius: 2.4, life: 0.3, hdr: 1.5 });
    g.fx.text({ x: o.pos.x, y: 3, z: o.pos.z }, 'CONDUIT DOWN', '#ffe9a8', true);
    this.addPoise(POISE.generator, 'generator');
    this.expose(2.5);
    if (this.liveConduits() === 0) {
      // both conduits down: the ward fails for 8 s and she crashes
      this.wardOffT = 8; this.reformT = 0;
      this.setWard(null);
      this.down(4, 'break');
    }
  }

  // ================================================================ movement: she circles slowly, keeping 6–10 u
  move(dt, mv) {
    if (this.busyT > 0) return;
    const g = this.game, p = g.player.pos, c = this.arena.center;
    this.orbit += this.orbitDir * 0.17 * dt * mv;
    const R = Math.min(7, this.arena.r * 0.32);
    const tx = c.x + Math.sin(this.orbit) * R, tz = c.z + Math.cos(this.orbit) * R;
    let dx = tx - this.pos.x, dz = tz - this.pos.z;
    const pd = distXZ(this.pos, p);
    if (pd < 6) { dx += (this.pos.x - p.x) * 1.2; dz += (this.pos.z - p.z) * 1.2; }
    else if (pd > 11) { dx += (p.x - this.pos.x) * 0.5; dz += (p.z - this.pos.z) * 0.5; }
    const dl = Math.hypot(dx, dz);
    if (dl > 0.2) {
      const sp = Math.min(this.speed * (pd < 5 ? 1.5 : 1), dl * 1.5) * mv;
      this.pos.x += (dx / dl) * sp * dt; this.pos.z += (dz / dl) * sp * dt;
    }
    this.face(p);
  }

  // ================================================================ moves
  token(fam, dur) {
    this.tokens = this.tokens.filter((t) => this.time < t.end);
    const t = { fam, cancelled: false, handles: [], end: this.time + dur };
    this.tokens.push(t);
    return t;
  }
  sh(tok, h) { tok.handles.push(h); return h; }
  fafter(tok, sec, fn) { this.after(sec, () => { if (!tok.cancelled) fn(); }); }

  mSpecial() {
    const fam = this.specialQ.shift();
    if (!fam) return 0.3;
    const busy = fam === 'fire' ? this.castLanes() : fam === 'frost' ? this.castRings() : fam === 'storm' ? this.castTempest() : this.castShards();
    return this.phase === 3 ? busy * 0.6 : busy;   // P3: families overlap
  }

  // ---- fire: 3 parallel flame lanes, one through you
  castLanes() {
    const g = this.game, c = this.arena.center, R = this.arena.r;
    const lead = this.lead('lanes', 0.95);
    const tok = this.token('fire', lead + 1);
    this.face(g.player.pos);
    this.rig.tellT = lead;
    this.play('lanes', lead + 0.9, lead, null, 1.0);
    const ang = Math.random() * TAU;
    const dir = dirFromAngle(ang), perp = new THREE.Vector3(dir.z, 0, -dir.x);
    const offP = (g.player.pos.x - c.x) * perp.x + (g.player.pos.z - c.z) * perp.z;
    for (const k of [-1, 0, 1]) {
      const off = offP + k * 7.2;
      if (Math.abs(off) > R - 1) continue;
      const half = Math.sqrt(R * R - off * off);
      const from = c.clone().addScaledVector(perp, off).addScaledVector(dir, -half);
      this.sh(tok, this.line(from, dir, half * 2, 3, lead, { dmg: 1.2, how: 'flame lane', onResolve: () => this.laneFx(from, dir, half * 2) }));
    }
    return lead + 1.5;
  }

  laneFx(from, dir, len) {
    const g = this.game;
    const n = Math.ceil(len / 4);
    for (let i = 0; i <= n; i++) {
      const p = { x: from.x + dir.x * (len * i) / n, y: 0.2, z: from.z + dir.z * (len * i) / n };
      g.fx.burst(p, { color: 0xffa040, count: 4, speed: 4, life: 0.5, size: 0.5, up: 2, gravity: 6, hdr: 1.8 });
      g.vfx?.decal('scorch', p, 2.0, 1.6);
    }
    g.fx.shake(0.25, 'threat');
  }

  // ---- frost: two ring waves, 3.2 s apart (dash through; ≥ the slowest dash recharge, 3.0 s)
  castRings() {
    const g = this.game;
    const lead = this.lead('rings', 0.9);
    const tok = this.token('frost', lead + 3.6);
    this.face(g.player.pos);
    this.rig.tellT = lead; this.rig.tell2 = lead + 3.2;
    this.play('rings', lead + 3.2 + 0.9, lead, null, 1.0);
    const stomp = (ld) => this.sh(tok, this.circle(this.pos, 3.4, ld, {
      dmg: 0.7, how: 'frost stomp', onResolve: () => {
        this.ringWave(this.pos, { speed: 8, width: 1.1, from: 3.0, maxR: this.arena.r + 2, dmg: 1.0, how: 'frost ring' });
        g.fx.burst({ x: this.pos.x, y: 0.3, z: this.pos.z }, { color: 0xcfeeff, count: 22, speed: 7, life: 0.6, size: 0.5, up: 1.2, gravity: 4, hdr: 1.6 });
        g.vfx?.decal('frost', this.pos, 4.2, 2.2);
        g.fx.shake(0.35, 'threat');
      },
    }));
    stomp(lead);
    this.fafter(tok, lead + 2.4, () => stomp(0.8));
    return lead + 3.2 + 1.0;
  }

  // ---- storm: Tempest — 3 strikes chase you, then lock
  castTempest() {
    const g = this.game;
    const lead = this.lead('tempest', 1.65);
    const tok = this.token('storm', lead + 1.2);
    this.face(g.player.pos);
    this.rig.tellT = lead;
    this.play('tempest', lead + 1.1 + 0.7, lead, null, 1.0);
    tok.axis = Math.random() * TAU;
    for (let i = 0; i < 3; i++) this.fafter(tok, i * 0.55, () => this.strike(tok, lead, i));
    return lead + 1.1 + 0.9;
  }

  inRod() {
    const r = this.rod, p = this.game.player;
    return !!r && !p.dead && distXZ(p.pos, r.pos) < 2 + p.radius * 0.5;
  }

  // Strike 0 hunts you; 1 and 2 hunt the points 4.2 u either side of you (so standing still, or just stepping
  // aside, lands you in a circle: you must keep moving until they lock).
  strike(tok, lead, i = 0) {
    const g = this.game, p = g.player.pos;
    const off = i === 0 ? 0 : i === 1 ? 4.2 : -4.2;
    const ox = Math.sin(tok.axis ?? 0) * off, oz = Math.cos(tok.axis ?? 0) * off;
    const s = { pos: new THREE.Vector3(p.x + ox, 0, p.z + oz), ox, oz, t: 0, chase: lead - 0.45, lead, h: null, diverted: false };
    s.h = this.sh(tok, this._tele(g.fx.telegraph(s.pos, 2.2, lead, this._teleOpts({}, () => this.land(s)))));
    this.strikes.push(s);
    if (this.inRod()) this.divert(s);
  }

  // The rod pulls the bolt: the circle vanishes and the strike lands on the rod instead.
  divert(s) {
    if (s.diverted) return;
    s.diverted = true;
    s.h.cancel();
    const rem = Math.max(0.1, s.lead - s.t);
    this.after(rem, () => this.rodBolt());
  }

  rodBolt() {
    if (!this.rod || this.dead) return;
    const g = this.game, r = this.rod.pos;
    g.vfx?.bolt({ x: r.x + 1.2, y: 16, z: r.z - 1 }, { x: r.x, y: 3.3, z: r.z }, { color: 0xffe14a, width: 0.5, hdr: 2.4, life: 0.25 });
    g.fx.flashDisc(r, { color: 0xffe14a, radius: 1.6, life: 0.2, hdr: 1.8 });
    g.fx.burst({ x: r.x, y: 3.2, z: r.z }, { color: 0xffe14a, count: 14, speed: 5, life: 0.4, size: 0.35, up: 0.5, hdr: 2.4 });
    if (this.inRod()) g.fx.text({ x: r.x, y: 3.8, z: r.z }, 'GROUNDED', '#ffe9a8');
    g.fx.shake(0.15, 'threat');
  }

  land(s) {
    const g = this.game;
    const i = this.strikes.indexOf(s);
    if (i >= 0) this.strikes.splice(i, 1);
    if (s.diverted || this.dead) return;
    const hit = !g.player.dead && distXZ(g.player.pos, s.pos) < 2.2 + g.player.radius * 0.3 && !this.inRod();
    g.vfx?.bolt({ x: s.pos.x + 1.5, y: 16, z: s.pos.z - 1 }, { x: s.pos.x, y: 0.2, z: s.pos.z }, { color: 0xffe14a, width: 0.6, hdr: 2.4, life: 0.25 });
    g.fx.flashDisc(s.pos, { color: 0xffe14a, radius: 2.2, life: 0.25, hdr: 1.8 });
    g.fx.burst({ x: s.pos.x, y: 0.3, z: s.pos.z }, { color: 0xffe14a, count: 16, speed: 6, life: 0.5, size: 0.4, up: 1.6, hdr: 2.2 });
    g.vfx?.decal('scorch', s.pos, 1.8, 1.4);
    this._resolve(hit, { dmg: 1.1, how: 'tempest' }, s.pos);
  }

  // ---- arcane: 6 delayed shard circles around you
  castShards() {
    const g = this.game;
    const lead = this.lead('shards', 1.0);
    const tok = this.token('arcane', lead + 2);
    this.face(g.player.pos);
    this.rig.tellT = lead;
    this.play('shards', lead + 0.3 * 5 + 0.8, lead, null, 1.0);
    const c = this.arena.center, R = this.arena.r;
    for (let i = 0; i < 6; i++) {
      this.fafter(tok, i * 0.3, () => {
        const pp = g.player.pos;
        const a = Math.random() * TAU, d = i === 0 ? Math.random() * 2 : 2 + Math.random() * 7;
        const at = new THREE.Vector3(pp.x + Math.sin(a) * d, 0, pp.z + Math.cos(a) * d);
        const dc = distXZ(at, c);
        if (dc > R - 2) at.set(c.x + ((at.x - c.x) / dc) * (R - 2), 0, c.z + ((at.z - c.z) / dc) * (R - 2));
        this.sh(tok, this.circle(at, 2.2, i === 0 ? lead : Math.max(0.9, lead - 0.1), { dmg: 1.0, how: 'prism shard', onResolve: () => this.shardFx(at) }));
      });
    }
    return lead + 0.3 * 5 + 1.0;
  }

  shardFx(at) {
    const g = this.game;
    g.fx.flashDisc(at, { color: 0xb67cff, radius: 2.2, life: 0.22, hdr: 1.6 });
    g.fx.burst({ x: at.x, y: 0.4, z: at.z }, { color: 0xd8b8ff, count: 14, speed: 5, life: 0.5, size: 0.4, up: 2.4, gravity: 8, hdr: 2.0 });
    g.vfx?.decal('rune', at, 2.2, 1.2);
    g.fx.shake(0.12, 'threat');
  }

  // ---- beams: Twin (P1/P2: 2 opposite, 140° over 3 s) / Quad (P3: 4, 60° over 2.6 s)
  mBeams(n) {
    const g = this.game;
    const quad = n === 4;
    const lead = this.lead(quad ? 'beams4' : 'beams', 1.2);
    const span = (quad ? 60 : 140) * Math.PI / 180, dur = quad ? 2.6 : 3.0;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const base = this.face(g.player.pos);
    const origin = this.pos.clone();
    this.rig.tellT = lead;
    this.bossTell('beams', lead);
    this.play('breathe', lead, lead);
    // tell: lines swing into their start angle in the sweep direction (the beam arrives already turning)
    const a = this.arena;
    for (let i = 0; i < n; i++) {
      const a0 = base + (TAU * i) / n;
      const len = circleExit(origin.x, origin.z, Math.sin(a0), Math.cos(a0), a.center.x, a.center.z, a.r);
      const h = this._tele(g.fx.lineTelegraph(origin, _w.set(Math.sin(a0), 0, Math.cos(a0)), len, BEAM_W + 0.4, lead, this._teleOpts({}, () => {})));
      this.tellLines.push({ h, a0, t: 0, lead, dir });
    }
    this.shadows.show(origin);
    this.after(lead, () => {
      const bf = this.own(new BeamField(this, origin, { base, n, span: span * dir, dur, mult: 0.8, crack: true }));
      this.beamsLive.push(bf);
      this.play('beam', dur, 0, ['beamEnd', 0.3, 0]);
      this.beamBase = base;
    });
    this.after(lead + dur + 0.1, () => this.shadows.hide());
    return lead + dur + 0.6;
  }

  // ---- Quadrant Prism: 3 of 4 quadrant cones fire in sequence; the safe one is gold
  mQuad() {
    const g = this.game, c = this.arena.center, R = this.arena.r + 1;
    const lead = this.lead('quad', 1.2);
    this.face(g.player.pos);
    this.rig.tellT = lead;
    this.bossTell('quad', lead);
    this.play('prism', lead + 1.4, lead, null, 1.0);
    const base = Math.random() * TAU;
    const pl = g.player.pos;
    const pa = Math.atan2(pl.x - c.x, pl.z - c.z);
    const inQ = Math.floor((((pa - base) % TAU) + TAU) % TAU / (Math.PI / 2));
    // the safe quadrant is usually not the one you are standing in
    const safeIdx = Math.random() < 0.75 ? (inQ + 1 + Math.floor(Math.random() * 3)) % 4 : inQ;
    let order = 0;
    for (let q = 0; q < 4; q++) {
      const mid = base + (q + 0.5) * (Math.PI / 2);
      const d = dirFromAngle(mid);
      if (q === safeIdx) { this.cone(c, d, Math.PI / 2, R, lead + 1.1, { safe: true }); continue; }
      const ld = lead + order * 0.5;
      order++;
      this.cone(c, d, Math.PI / 2, R, ld, {
        dmg: 1.3, how: 'prism quadrant', onResolve: () => {
          g.fx.burst({ x: c.x + d.x * R * 0.55, y: 0.5, z: c.z + d.z * R * 0.55 }, { color: 0xe6f4ff, count: 24, speed: 6, life: 0.6, size: 0.5, up: 2, hdr: 2 });
          g.fx.shake(0.3, 'threat');
        },
      });
    }
    return lead + 2.2;
  }

  // ---- Break Check: Prism Nova (6 s). Stagger her, or hide in a pillar's gold lee.
  mNova() {
    if (this.novaUsed) return 0.2;       // already cast this phase (queued + rotation can both ask)
    const g = this.game;
    this.novaUsed = true;
    this.face(g.player.pos);
    this.rig.tellT = 6;
    this.bossTell('nova', 6);
    this.shadows.show(this.pos);
    const src = this.pos.clone();
    return this.breakCheck({
      name: 'Prism Nova', dur: 6, threshold: this.phase === 1 ? 60 : 70, action: 'nova',
      onSuccess: () => { this.shadows.hide(); g.fx.text({ x: this.pos.x, y: 3.6, z: this.pos.z }, 'NOVA BROKEN', '#e8eef8', true); },
      onFail: () => {
        this.shadows.hide();
        const lee = this.shadowed(g.player.pos, src);
        g.fx.flashDisc(src, { color: 0xe6f4ff, radius: this.arena.r + 3, life: 0.45, hdr: 1.4 });
        g.fx.ring(src, { color: 0xe6f4ff, radius: this.arena.r, life: 0.6, width: 0.3, hdr: 1.8 });
        g.fx.shake(0.8, 'threat');
        g.events.emit('bossImpact', { enemy: this, pos: src, heavy: true });
        if (!lee) this.hitPlayer(1.6, 'prism nova');
        else g.fx.text(g.player.pos, 'SHELTERED', '#ffe9a8', true);
      },
    });
  }

  bossTell(kind, lead) { this.game.events.emit('bossTell', { enemy: this, kind, lead }); }

  // ================================================================ intermissions
  intermission(idx) {
    const g = this.game, c = this.arena.center.clone(), R = this.arena.r;
    this.setWard(null); this.wardOffT = 0; this.reformT = 0;
    this.specialQ.length = 0; this.queued = this.queued.filter((q) => q !== 'special' && q !== 'nova');
    this.bossTell(idx === 1 ? 'skyward' : 'floodfall', 1.5);
    this.leapTo(c, 1.2);
    if (idx === 1) {
      // Skyward: lift to the centre, one beam turns 360° over 5 s; 3 gold gaps where it is off; then she crashes.
      this.rig.tellT = 6.9;
      this.play('skyward', 6.9, 0, ['crash', 1.0, 0.35]);
      const a0 = Math.random() * TAU, gapW = 0.8;
      const gaps = [];
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k * TAU) / 3;
        gaps.push({ a, w: gapW });
        this.zone(c, 'safe', { radius: R, angle: gapW, dir: dirFromAngle(a), life: 6.9, tag: 'gap' });
      }
      const start = a0 + TAU / 6;                                   // starts in the middle of a hot arc
      this.after(0.5, () => this.shadows.show(c));
      this.after(0.4, () => {
        this._tele(g.fx.lineTelegraph(c, _w.set(Math.sin(start), 0, Math.cos(start)), R, BEAM_W + 0.4, 1.5, this._teleOpts({}, () => {})));
      });
      this.after(1.9, () => {
        this.beamsLive.push(this.own(new BeamField(this, c, { base: start, n: 1, span: TAU * (Math.random() < 0.5 ? 1 : -1), dur: 5, mult: 0.8, gaps })));
      });
      this.after(6.9, () => this.shadows.hide());
      this.after(7.25, () => {
        this.crashFx(c);
        this.ringWave(c, { speed: 9, width: 1.1, from: 2.8, maxR: R + 3, dmg: 1.2, how: 'prism crash' });
      });
      return 8;
    }
    // Floodfall: a gold ring marks the new edge, the river rises to R 17, shards rain from the sky.
    this.rig.tellT = 7;
    this.play('skyward', 7.0, 0, ['crash', 1.0, 0.35]);
    this.donut(c, FLOOD_R - 0.5, FLOOD_R + 0.5, 1.5, { safe: true });
    this.after(1.5, () => {
      g.encounter.setArenaRadius(FLOOD_R, 1.5);
      if (!this.flood) this.flood = g.addActor(new FloodWater(this));
      this.flood.begin();
      g.fx.shake(0.5, 'threat');
    });
    for (let w = 0; w < 3; w++) {
      this.after(2.0 + w * 1.5, () => {
        const rr = FLOOD_R - 1.5;
        for (let i = 0; i < 8; i++) {
          let at;
          if (i === 0) { at = g.player.pos.clone(); at.y = 0; }
          else {
            const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * rr;
            at = new THREE.Vector3(c.x + Math.sin(a) * d, 0, c.z + Math.cos(a) * d);
          }
          this.circle(at, 2.2, w === 0 ? 1.3 : 1.0, { dmg: 1.0, how: 'shard rain', onResolve: () => this.shardFx(at) });
        }
      });
    }
    this.after(7.35, () => this.crashFx(c));
    return 8;
  }

  crashFx(c) {
    const g = this.game;
    g.fx.ring(c, { color: 0xd8d0b8, radius: 6, life: 0.5, width: 0.3, hdr: 0.9 });
    g.fx.burst({ x: c.x, y: 0.3, z: c.z }, { color: 0xd8d0b8, count: 30, speed: 9, life: 0.7, size: 0.7, up: 1.4, gravity: 5, hdr: 0.9 });
    g.fx.shake(0.9, 'threat');
    g.events.emit('bossImpact', { enemy: this, pos: c, heavy: true });
  }

  leapTo(p, dur) {
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

  // ================================================================ frame hooks
  update(dt, game) {
    if (this.wardOffT > 0 && !this.dead && !this.intermissionIdx) {
      this.wardOffT -= dt;
      if (this.wardOffT <= 0) { this.wardOffT = 0; this.cycleWard(); }
    }
    super.update(dt, game);
  }

  think(dt, mv) {
    const g = this.game;
    if (this.beamsLive.length) this.beamsLive = this.beamsLive.filter((b) => !b._cleared && b.t < b.dur);
    if (this.intermissionIdx) return;
    this.phaseT += dt * mv;
    // the phase's Break Check comes as soon as she is free once the phase is a few seconds old
    if (!this.novaUsed && !this.novaQueued && this.phaseT >= this.novaAt()) { this.novaQueued = true; this.queued.push('nova'); }
    // final stagger: below 8% the ward cycles every 3 s and every break is +15 poise
    if (!this.finalStage && this.phase === 3 && this.hp < this.maxHp * FINAL_FRAC) {
      this.finalStage = true;
      this.wardCycle = 3;
      this.wardT = Math.min(this.wardT, 1.5);
      g.fx.text({ x: this.pos.x, y: 3.6, z: this.pos.z }, 'PRISMATIC OVERLOAD', '#e8eef8', true);
    }
    this.tickWard(dt * mv);
    this.tickStrikes(dt * mv);
    this.tickWyvern(dt);
    this.tickLines(dt);
    if (this.rod) this.tickRod(dt);
  }

  tickLines(dt) {
    for (let i = this.tellLines.length - 1; i >= 0; i--) {
      const L = this.tellLines[i];
      L.t += dt;
      if (L.h.done) { this.tellLines.splice(i, 1); continue; }
      const u = Math.max(0, 1 - L.t / L.lead);
      L.h.mesh.rotation.y = L.a0 - L.dir * 0.5 * u * u;
    }
  }

  tickStrikes(dt) {
    const p = this.game.player.pos;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      if (s.h.done) { this.strikes.splice(i, 1); continue; }
      s.t += dt;
      if (this.inRod()) { this.divert(s); continue; }
      if (s.t < s.chase) {
        const dx = p.x + s.ox - s.pos.x, dz = p.z + s.oz - s.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { const st = Math.min(d, 8.5 * dt); s.pos.x += (dx / d) * st; s.pos.z += (dz / d) * st; }
        const ac = this.arena.center, ad = distXZ(s.pos, ac), am = this.arena.r - 1.2;
        if (ad > am) { s.pos.x = ac.x + ((s.pos.x - ac.x) / ad) * am; s.pos.z = ac.z + ((s.pos.z - ac.z) / ad) * am; }
        s.h.mesh.position.set(s.pos.x, 0.07, s.pos.z);
      }
    }
  }

  // ---- Storm Wyvern + Lightning Rod (P2+)
  tickWyvern(dt) {
    if (this.phase < 2) return;
    const w = this.wyvern;
    if (w) {
      if (w.dead) { this.wyvern = null; this.wyvernCd = 3; this.dropRod(w.pos); }
    } else if (!this.rod) {
      this.wyvernCd -= dt;
      if (this.wyvernCd <= 0) {
        const a = Math.random() * TAU;
        this.wyvern = this.spawnAdd('wraith', this.arenaPoint(a, 0.75), { hpMult: 2.2 });
        this.game.fx.text(this.wyvern.pos, 'STORM WYVERN', '#ffe14a', true);
      }
    }
  }

  dropRod(pos) {
    const g = this.game;
    if (this.rod) this.removeRod();
    const mesh = new THREE.Group();
    const poleMat = this.own_mat(new THREE.MeshLambertMaterial({ color: 0xcfd6e8, emissive: 0x4a5a7a }));
    const tipMat = this.own_mat(blendAddMaterial(0xffe14a, { hdr: 2.2, occ: 0.2, opacity: 0.95, depthTest: false }));
    const pole = new THREE.Mesh(GEO.cylinder, poleMat); pole.scale.set(0.1, 3.2, 0.1); pole.position.y = 1.6;
    const tip = new THREE.Mesh(GEO.sphereLow, tipMat); tip.scale.setScalar(0.28); tip.position.y = 3.3; tip.renderOrder = 10;
    const base = new THREE.Mesh(GEO.cylinder, poleMat); base.scale.set(0.35, 0.3, 0.35); base.position.y = 0.15;
    mesh.add(pole, tip, base);
    mesh.position.set(pos.x, 0, pos.z);
    g.scene.add(mesh);
    const rod = { pos: new THREE.Vector3(pos.x, 0, pos.z), mesh, tip, zone: null, t: 0, zapT: 0.4 };
    rod.zone = this.zone(rod.pos, 'safe', { radius: 2, life: 10, tag: 'rod', onExpire: () => { if (this.rod === rod) this.removeRod(); } });
    this.rod = rod;
    g.fx.text({ x: pos.x, y: 3.6, z: pos.z }, 'LIGHTNING ROD', '#ffe9a8', true);
    g.fx.burst({ x: pos.x, y: 0.5, z: pos.z }, { color: 0xffe14a, count: 18, speed: 5, life: 0.5, size: 0.4, up: 2, hdr: 2.2 });
  }

  tickRod(dt) {
    const r = this.rod;
    r.t += dt;
    r.zapT -= dt;
    r.tip.scale.setScalar(0.26 + 0.07 * Math.sin(r.t * 14));
    if (r.zapT <= 0) {
      r.zapT = 0.7 + Math.random() * 0.5;
      const a = Math.random() * TAU;
      this.game.fx.spark({ x: r.pos.x, y: 3.3, z: r.pos.z }, _v.set(Math.sin(a) * 4, 2.5, Math.cos(a) * 4), { color: 0xffe14a, size: 0.35, life: 0.25, hdr: 2.4 });
    }
    if (r.t >= 10) this.removeRod();
  }

  removeRod() {
    const r = this.rod;
    if (!r) return;
    this.rod = null;
    this.game.scene.remove(r.mesh);
    r.zone?.end();
  }

  // ================================================================ lifecycle hooks

  onDowned() {
    this.endBeams();
    this.shadows.hide();
    this.strikes.length = 0;
    this.tellLines.length = 0;
    for (const t of this.tokens) t.cancelled = true;
    this.tokens.length = 0;
  }

  endBeams() {
    for (const b of this.beamsLive) b._cleared = true;
    this.beamsLive.length = 0;
  }

  onClearField() {
    this.endBeams();
    this.shadows.hide();
    this.strikes.length = 0;
    this.tellLines.length = 0;
    for (const t of this.tokens) t.cancelled = true;
    this.tokens.length = 0;
    this.wyvern = null;
    this.removeRod();
    if (this.wyvernCd < 2.5) this.wyvernCd = 2.5;
  }

  onPhase(phase) {
    this.phaseT = 0;
    this.novaUsed = false; this.novaQueued = false;
    this.wardCycle = WARD_CYCLE[phase - 1];
    this.wyvernCd = 2.5;
    this.specialQ.length = 0; this.queued = this.queued.filter((q) => q !== 'special' && q !== 'nova');
    this.cycleWard();
  }

  onDeath(game) {
    this.shadows.hide();
    this.removeRod();
    this.setWard(null);
    super.onDeath(game);
  }

  // Aurelith's Scale (Boss Relic) and other sources may break the Prism Ward directly (relics.js).
  breakWard(src) { if (this.ward && !this.dead) breakWardFx(this.game, this); }

  onDispose(game) {
    this.shadows.hide();
    this.removeRod();
    if (this.flood) { this.flood.orphan(); game._aurFlood = this.flood; }
    this.flood = null;
    for (const t of this.strikes) t.h?.cancel();
    this.strikes.length = 0;
  }

  // ================================================================ visuals
  // Downed: the crystals go nearly dark with a slow, weak pulse (the rest of the stance is in the rig's `downed`).
  _visuals(dt, mv) {
    super._visuals(dt, mv);
    if (this.downed && this.rig) this.rig.glow = 0.05 + 0.05 * Math.sin(this.time * 2.2);
  }

  visuals(dt, a) {
    const h = this.rig;
    // the dragon turns with her breath sweep
    if (a && a.action === 'beam' && this.beamsLive.length) this.yaw = this.beamsLive[0].angle0;
    h.turnRate = a && a.action === 'beam' ? 30 : 7;
    if (a && a.action === 'skyward' && this.beamsLive.length) this.yaw = this.beamsLive[0].angle0;
    // ward → crystal accent + rim + ground glow
    if (this.ward !== this._shownWard) this.applyWard();
    if (this.beamsLive.length && a && a.action === 'beam') this.breathFx();
    this.wardGlowMat.opacity = 0.1 + 0.07 * Math.min(1.2, h.glow ?? 0.4);
  }

  _tellGlow(a) {
    if (a.action === 'beam') return 1.15;
    if (a.action === 'beamEnd') return 1.15 * (1 - a.t / a.dur);
    if (a.action === 'skyward') return 0.5;
    if (a.action === 'downed') return 0;
    return super._tellGlow(a);
  }

  applyWard() {
    this._shownWard = this.ward;
    const h = this.rig;
    if (!h) return;
    if (this.ward) {
      const c = _col.setHex(WARD_HEX[this.ward]);
      h.accent = [c.r, c.g, c.b, 0.85];
      h.rim = [c.r, c.g, c.b, 0.55];
      this.wardGlowMat.color.copy(c).multiplyScalar(1.3);
    } else {
      h.accent = null;
      h.rim = this.isEcho ? [0.62, 0.42, 1.0, 0.85] : null;
      this.wardGlowMat.color.setHex(0xdfe6ff).multiplyScalar(0.45);
    }
  }

  breathFx() {
    const fx = this.game.fx;
    const col = this.wardEl ? WARD_HEX[this.wardEl] : 0xe6f4ff;
    const emit = (pt) => {
      const p = this.world(pt, _w);
      _v.set((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2);
      fx.spark(p, _v, { color: col, size: 0.4, life: 0.25, hdr: 2.4 });
    };
    emit(AURELITH_MOUTH);
    const n = this.beamsLive[0]?.n ?? 2;
    if (n >= 2) emit(AURELITH_TAIL);
    if (n >= 4) { emit([4.2, 3.0, 0.2]); emit([-4.2, 3.0, 0.2]); }
  }
}
