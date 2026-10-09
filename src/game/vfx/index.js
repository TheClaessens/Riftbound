import * as THREE from 'three';
import { buildSpriteAtlas, buildNoiseTexture, RampAtlas, CELL, tintCurve } from './textures.js';
import { ParticleLayer, ORIENT } from './particles.js';
import { DebrisSystem } from './debris.js';
import { ShellSystem } from './shells.js';
import { DecalSystem } from './decals.js';
import { RibbonSystem } from './ribbons.js';
import { CloudSystem } from './clouds.js';
import { PARTICLES, SHELLS } from './presets.js';
import { RECIPES } from './recipes.js';
import { StatusVFX } from './status.js';
import { DEBRIS } from './debris.js';
import { HERO_YIELD } from './heroYield.js';
import * as FIRE from './elements/fire.js';
import * as FROST from './elements/frost.js';
import * as STORM from './elements/storm.js';
import * as ARCANE from './elements/arcane.js';
import * as MIXED from './elements/mixed.js';

// Element modules extend the registries (design/VFX.md: each element implementer owns one file).
for (const M of [FIRE, FROST, STORM, ARCANE, MIXED]) {
  Object.assign(PARTICLES, M.PARTICLES); Object.assign(SHELLS, M.SHELLS);
  Object.assign(RECIPES, M.RECIPES); Object.assign(DEBRIS, M.DEBRIS);
}

// =====================================================================================
//  game.vfx: world-grounded spell VFX. Lives NEXT TO game.fx (which keeps its API).
//
//    vfx.emit(preset, pos, { count, scale, speed, dir, cone, vel, radius })      one-shot burst
//    vfx.emitter(preset, { pos, rate, radius, area, y, vel, land, life, follow }) -> { pos, rate, stop() }
//    vfx.debris(kind, pos, n, { scale, speed, dir, cone, color })               physical chunks
//    vfx.sprout(kind, pos, { scale, life, tilt })                               crystal growing from the ground
//    vfx.shell(style, pos, { radius, height, y, life, follow })                 -> { end(), touch() }
//    vfx.decal(kind, pos, radius, life, { grow, fade, color, alpha, accent, hdr, intensity, extra }) -> { end() }
//    vfx.trail(target, { color, width, hdr, segLen })                          -> { stop() }
//    vfx.bolt(from, to, { color, width, hdr, life, jag, branches })
//    vfx.cloud(pos, { radius, height, style, life, back })                      -> { flash(k), end() }
//    vfx.zone(recipe, pos, opts)                                                -> composite handle { end(), ... }
//    vfx.impact(recipe, pos, opts)                                              composite one-shot
//    vfx.status (StatusVFX) reads game.enemies every frame: ice shells, flame licks, shock arcs.
//  Draw calls: 2 particle layers + 2 debris + <=4 shell kinds + 1 decal + 1 ribbon + 2 cloud + 2 ice = 14 max;
//  only systems with something alive draw (measured: 12 in a 10-zone + 300-status stress scene).
//  game.js: construct after game.fx, call vfx.update(dt) next to fx.update(dt), vfx.clear() next to fx.clear().
// =====================================================================================

export const BLEND_ADD = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};

const _hv = new THREE.Vector3();
const rr = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r ?? 0);
const DEFAULT_ALPHA = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const DEFAULT_ERODE = [[0, 0], [0.7, 0], [1, 1]];
const SHADE_TINT = [0.6, 0.68, 0.86];


export class VFX {
  // game: needs scene, camera (or engine.camera); optional player (focus for cloud fading)
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.engine?.camera ?? game.camera;
    this.time = 0;
    this.uTime = { value: 0 };
    this.uHeroView = { value: new THREE.Vector4(0, 0, 0, 0) };   // painted particles fade over the hero
    // own-VFX yield around the hero (heroYield.js): r0, r1, floor, strength (0 calm .. 1 busy)
    this.uHeroYield = { value: new THREE.Vector4(HERO_YIELD.r0, HERO_YIELD.r1, HERO_YIELD.floor, 0) };
    this.atlas = buildSpriteAtlas();
    this.noise = buildNoiseTexture();
    this.ramps = new RampAtlas(384);
    const shared = { uTime: this.uTime, uHeroView: this.uHeroView, uHeroYield: this.uHeroYield, atlas: this.atlas, noise: this.noise, ramps: this.ramps, blend: BLEND_ADD };
    this.paint = new ParticleLayer(this.scene, shared, { capacity: 8192, renderOrder: 9, name: 'vfx-paint' });
    this.glow = new ParticleLayer(this.scene, shared, { capacity: 8192, renderOrder: 13, name: 'vfx-glow' });
    this.debrisSys = new DebrisSystem(this.scene);
    this.shells = new ShellSystem(this.scene, shared);
    this.decals = new DecalSystem(this.scene, shared);
    this.ribbons = new RibbonSystem(this.scene, shared, this.camera);
    this.clouds = new CloudSystem(this.scene, shared);
    this.blend = BLEND_ADD;
    this.status = new StatusVFX(this);
    this._pp = {};                 // compiled particle presets
    this._sp = {};                 // compiled shell styles
    this.emitters = [];
    this.zones = [];
    this.heat = 0;                 // spawn pressure -> budget()
  }

  // 1 when calm, ~0.35 under extreme spawn pressure (mirrors fx.budget()).
  budget() { return 1 / (1 + this.heat / 2500); }

  // ---------------------------------------------------------------- presets
  preset(name) {
    let p = this._pp[name];
    if (p) return p;
    const d = PARTICLES[name];
    if (!d) throw new Error(`vfx: unknown particle preset '${name}'`);
    const row = this.ramps.addRow({ color: d.color ?? 0xffffff, alpha: d.alpha ?? DEFAULT_ALPHA });
    this.ramps.addRow({ x: d.sizeCurve ?? 1, y: d.erode ?? DEFAULT_ERODE, z: d.fill ?? 0.4, w: d.ink ?? 0.6 });
    // paint shadow colour (default: the lit colour pushed toward the cool sky fill)
    this.ramps.addRow({ color: d.shade ?? tintCurve(d.color ?? 0xffffff, SHADE_TINT), alpha: 1 });
    const orient = ORIENT[d.orient ?? 'camera'];
    const mode = d.layer === 'paint' ? 1 : 0;
    p = this._pp[name] = {
      d, row, orient, layer: mode ? this.paint : this.glow,
      packed: CELL[d.cell ?? 'dot'] + 16 * orient + 64 * mode,
    };
    return p;
  }
  // Register / derive a preset at runtime: vfx.define('fireLick_blue', { ...PARTICLES.flameLick, color: ... })
  define(name, def) { PARTICLES[name] = def; delete this._pp[name]; return name; }

  shellStyle(name) {
    let s = this._sp[name];
    if (s) return s;
    const d = SHELLS[name];
    if (!d) throw new Error(`vfx: unknown shell style '${name}'`);
    s = this._sp[name] = { ...d, row: this.ramps.addRow({ color: d.color, alpha: d.alpha ?? 1 }) };
    return s;
  }

  // ---------------------------------------------------------------- particles
  // One particle. (x,y,z) position; (vx,vy,vz) initial velocity; s = size multiplier.
  _one(p, x, y, z, vx, vy, vz, s) {
    const d = p.d;
    const life = rr(d.life ?? [0.4, 0.6]);
    const rot = d.rot === undefined || d.rot === 'random' ? Math.random() * 6.283 : d.rot;
    if (p.orient === 2) {
      // orbit: x,z = centre, (vx = r0, vz = start angle)
      p.layer.spawn(x, y, z, vx, vz, rr(d.swirl ?? [3, 3]), this.time, life,
        rr(d.rise ?? 0), rr(d.pull ?? 1), rr(d.size ?? 0.3) * s, p.row, rot, rr(d.spin ?? 0), d.stretch ?? 0, p.packed);
    } else {
      p.layer.spawn(x, y, z, vx, vy, vz, this.time, life,
        d.gravity ?? 0, d.drag ?? 0, rr(d.size ?? 0.3) * s, p.row, rot, rr(d.spin ?? 0), d.stretch ?? 0, p.packed);
    }
    this.heat += 1;
  }

  // opts: { count, scale, speed (mult), dir {x,y,z}, cone 0..1, vel {x,y,z} (added), radius (orbit) }
  emit(name, pos, opts = {}) {
    const p = this.preset(name), d = p.d;
    const n = Math.max(1, Math.round((opts.count ?? d.count ?? 8) * this.budget()));
    const s = opts.scale ?? 1, sm = opts.speed ?? 1;
    const spread = d.spread ?? 0.1;
    const y0 = pos.y ?? 0.5;
    for (let i = 0; i < n; i++) {
      if (p.orient === 2) {
        const r0 = (opts.radius ?? 2) * (0.6 + Math.random() * 0.4);
        this._one(p, pos.x, y0, pos.z, r0, 0, Math.random() * 6.283, s);
        continue;
      }
      // random direction with vertical bias `up`, optionally pulled into `dir` by `cone`
      const a = Math.random() * 6.283;
      const sp = rr(d.speed ?? [0, 0]) * sm;
      let dx = Math.cos(a), dy = Math.random() * 2 - 1 + (d.up ?? 0.3), dz = Math.sin(a);
      const dir = opts.dir ?? d.dir;
      if (dir) { const c = opts.cone ?? d.cone ?? 0.7; dx = dx * (1 - c) + dir.x * c; dy = dy * (1 - c) + (dir.y ?? 0) * c; dz = dz * (1 - c) + dir.z * c; }
      const l = Math.hypot(dx, dy, dz) || 1;
      const v = opts.vel;
      this._one(p,
        pos.x + (Math.random() * 2 - 1) * spread, y0 + (Math.random() * 2 - 1) * spread * 0.5, pos.z + (Math.random() * 2 - 1) * spread,
        dx / l * sp + (v?.x ?? 0), dy / l * sp + (v?.y ?? 0), dz / l * sp + (v?.z ?? 0), s);
    }
  }

  // Continuous emitter. opts: { pos (kept by reference if follow), rate (/s), radius, area 'disc'|'ring'|'point',
  //   y [min,max], vel {x,y,z} (fixed velocity + preset speed jitter), land (true: spawn upwind so the
  //   particle LANDS inside the area: for falling snow / rain), life (s), scale }
  emitter(name, opts = {}) {
    const p = this.preset(name);
    const e = {
      p, pos: opts.follow ? opts.pos : { x: opts.pos.x, y: opts.pos.y ?? 0, z: opts.pos.z },
      rate: opts.rate ?? 20, radius: opts.radius ?? 1, area: opts.area ?? 'disc', y: opts.y ?? [0.3, 0.6],
      vel: opts.vel ?? null, land: !!opts.land, life: opts.life ?? Infinity, scale: opts.scale ?? 1,
      age: 0, acc: 0, stopped: false,
      stop() { this.stopped = true; },
    };
    this.emitters.push(e);
    return e;
  }

  _tickEmitter(e, dt) {
    const p = e.p, d = p.d;
    e.acc += e.rate * dt * this.budget();
    while (e.acc >= 1) {
      e.acc -= 1;
      let x = e.pos.x, z = e.pos.z;
      const a = Math.random() * 6.283;
      const rad = e.area === 'point' ? 0 : e.area === 'ring' ? e.radius * (0.85 + Math.random() * 0.15) : e.radius * Math.sqrt(Math.random());
      if (p.orient === 2) { this._one(p, x, (e.pos.y ?? 0) + rr(e.y), z, Math.max(0.3, rad), 0, a, e.scale); continue; }
      x += Math.cos(a) * rad; z += Math.sin(a) * rad;
      let y = (e.pos.y ?? 0) + rr(e.y);
      let vx, vy, vz;
      if (e.vel) {
        const j = rr(d.speed ?? [0, 0]);
        vx = e.vel.x + (Math.random() * 2 - 1) * j; vy = e.vel.y + (Math.random() * 2 - 1) * j * 0.3; vz = e.vel.z + (Math.random() * 2 - 1) * j;
      } else {
        const b = Math.random() * 6.283, sp = rr(d.speed ?? [0, 0]);
        vx = Math.cos(b) * sp; vy = (d.up ?? 0.3) * sp; vz = Math.sin(b) * sp;
      }
      if (e.land && vy < -0.1) {
        const tf = y / -vy;                          // time to the ground: start upwind
        x -= vx * tf; z -= vz * tf;
      }
      this._one(p, x, y, z, vx, vy, vz, e.scale);
    }
  }

  // ---------------------------------------------------------------- other primitives
  debris(kind, pos, n, opts) { this.debrisSys.burst(kind, pos, Math.max(1, Math.round(n * this.budget())), opts); }
  sprout(kind, pos, opts) { this.debrisSys.sprout(kind, pos, opts); }
  shell(style, pos, opts = {}) { return this.shells.add(this.shellStyle(style), pos, opts, this.time); }
  decal(kind, pos, radius, life, opts) { return this.decals.add(kind, pos, radius, life, opts); }
  trail(target, opts) { return this.ribbons.trail(target, opts); }
  bolt(from, to, opts) { this.ribbons.bolt(from, to, opts); }
  cloud(pos, opts) { return this.clouds.add(pos, opts); }

  // Composite recipes (recipes.js). Zones update every frame until they end.
  zone(name, pos, opts = {}) {
    const z = RECIPES[name](this, pos, opts);
    this.zones.push(z);
    return z;
  }
  impact(name, pos, opts = {}) { return RECIPES[name](this, pos, opts); }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    this.uTime.value = this.time;
    const hp = this.game.player?.pos, hv = this.uHeroView.value;
    if (hp && this.camera) { _hv.set(hp.x, 1.1, hp.z).applyMatrix4(this.camera.matrixWorldInverse); hv.set(_hv.x, _hv.y, _hv.z, 1); } else hv.w = 0;
    this.heat *= Math.exp(-3 * dt);
    // yield strength follows spawn pressure (smoothed over ~0.25 s so it never flickers)
    const hy = this.uHeroYield.value, H = HERO_YIELD;
    const busy = Math.min(1, Math.max(0, (this.heat - H.heatLo) / (H.heatHi - H.heatLo)));
    hy.w += (busy * busy * (3 - 2 * busy) - hy.w) * (1 - Math.exp(-4 * dt));
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.update(dt) === false) this.zones.splice(i, 1);
    }
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.age += dt;
      if (e.stopped || e.age >= e.life) { this.emitters.splice(i, 1); continue; }
      this._tickEmitter(e, dt);
    }
    this.paint.flush(this.time);
    this.glow.flush(this.time);
    this.debrisSys.update(dt);
    this.shells.update(this.time);
    this.decals.update(this.time);
    this.ribbons.update(dt);
    this.clouds.update(dt, this.game.player?.pos ?? null);
    if (this.game.enemies) this.status.update(dt, this.game.enemies, this.camera);
  }

  // Compile every VFX program once at boot (first use otherwise stalls 20–60 ms per program).
  warmup() {
    const r = this.game.engine?.renderer;
    if (!r?.compile) return;
    const p = { x: 0, y: 0.5, z: 0 };
    this.emit('snowStreak', p, { count: 1 }); this.emit('iceChip', p, { count: 1 });
    this.debris('rock', p, 1); this.debris('ice', p, 1);
    for (const s of ['snowVeil', 'vortexFunnel', 'blastDome', 'frostRing']) this.shell(s, p, { radius: 1, life: 0.2 });
    this.decal('frost', p, 1, 0.2);
    this.bolt({ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 1 }, {});
    this.cloud(p, { radius: 1, life: 0.2 });
    this.update(1e-3);
    try { r.compile(this.scene, this.camera); } catch { /* ignore */ }
    this.clear();
  }

  clear() {
    this.emitters.length = 0;
    this.zones.length = 0;
    this.paint.clear(); this.glow.clear();
    this.debrisSys.clear(); this.shells.clear(); this.decals.clear();
    this.ribbons.clear(); this.clouds.clear(); this.status.clear();
    // the arcane kit draws immediate-mode instances: drop its records AND hide last frame's instances,
    // or a new run keeps the previous run's glyphs frozen on screen until the next arcane cast
    const k = this._arcaneKit;
    if (k) { k._revive(); k._flush(); }
  }
}
