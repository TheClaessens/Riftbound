import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, pick, distXZ, ELEMENT_COLOR } from '../core/utils.js';
import { makeStatus, damageEnemy } from './combat.js';
import { ACTS } from './acts.js';
import { BLEND_ADD, blendAddMaterial } from './fx.js';
import { buildBiome } from './env/biome.js';
import { applyBiomeAtmos } from './env/lighting.js';
import { patchEnv, mulberry32 } from './env/common.js';
import { prep, lump, paint, paintFlat } from './env/props.js';
import { forest } from './env/biomes/forest.js';
import { barrens } from './env/biomes/barrens.js';
import { river } from './env/biomes/river.js';

// =====================================================================================
//  World: biomes (built by src/game/env, see env/biome.js), Rift Crystals (internally "geodes"), Shrines and act
//  hazards. See ARCHITECTURE.md "World contract". The look of each biome is data in
//  env/biomes/*.js; this file keeps the gameplay (numbers and logic unchanged).
// =====================================================================================

const ARENA_RADIUS = 55;
const GEODE_COUNT = 8;
const GEODE_HP = 10;              // breaks in one or two hits: it is a trigger, not a resource to mine
const CRYSTAL_HOVER = 1.3;        // float height of the crystal centre
const CRYSTAL_SCALE = 1.35;
const GEODE_RESPAWN = 25;
const GEODE_BURST_R = 4.5;
const GEODE_BURST_DMG = 20;
const SHRINE_FIRST = 35;
const SHRINE_GAP = 50;
const SHRINE_LIFE = 40;
const SHRINE_CLAIM_R = 2.2;
const SHRINE_CLAIM_TIME = 2.5;
const SHRINE_BUFF_TIME = 25;
const SHRINE_TILES = 48;
const LAVA_EVERY = 2.5, LAVA_COUNT = 2, LAVA_R = 14;
const STRIKE_EVERY = 1.6, STRIKE_COUNT = 3, STRIKE_R = 12;
const HAZ_LAVA = { type: 'hazard', kind: 'lava' };
const HAZ_STORM = { type: 'hazard', kind: 'lightning' };
const FISSURES = 8;              // pooled fissure-geyser decals (Act II hazard visual)

// Game biome ids (acts.js) -> environment definitions.
const BIOMES = { verge: forest, cinder: barrens, crown: river };

const SHRINES = {
  fury: { title: 'Fury', name: 'Shrine of Fury', color: '#ff4d5e', hex: 0xff4d5e, icon: '✹', apply: (s) => { s.damage += 0.4; } },
  celerity: { title: 'Celerity', name: 'Shrine of Celerity', color: '#ffe45c', hex: 0xffe45c, icon: '➤', apply: (s) => { s.cdr += 0.3; s.moveSpeed *= 1.15; } },
  greed: { title: 'Greed', name: 'Shrine of Greed', color: '#ffd34d', hex: 0xffd34d, icon: '◆', apply: (s) => { s.xpMult += 0.5; } },
  aegis: { title: 'Aegis', name: 'Shrine of Aegis', color: '#7fe0ff', hex: 0x7fe0ff, icon: '◈', apply: () => {} },
};
const SHRINE_TYPES = Object.keys(SHRINES);

const RUNE_GLYPHS = {
  fury: { closed: true, polys: [[[64, 22], [92, 98], [64, 80], [36, 98]]] },
  celerity: { closed: false, polys: [[[40, 52], [64, 36], [88, 52]], [[40, 82], [64, 66], [88, 82]]] },
  greed: { closed: true, polys: [[[64, 22], [104, 64], [64, 106], [24, 64]]] },
  aegis: { closed: true, polys: [[[64, 20], [98, 34], [94, 72], [64, 108], [34, 72], [30, 34]]] },
};

const _tmpHits = [];
const _tmpScan = [];
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// ------------------------------------------------------------------ helpers

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Matrix for position / scale / Euler rotation (returns a new Matrix4).
function xform(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  _p.set(x, y, z); _s.set(sx, sy, sz); _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Textured blend-add material (rgb adds glow, alpha darkens what is behind -> reads on bright ground).
function texBlendAdd(map, color, { hdr = 1.4, occ = 0.4, opacity = 1, depthTest = true, side = THREE.FrontSide } = {}) {
  const u = { uMap: { value: map }, uColor: { value: new THREE.Color(color).multiplyScalar(hdr) }, uOcc: { value: occ }, uOpacity: { value: opacity } };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform float uOcc; uniform float uOpacity; varying vec2 vUv;
      void main() { vec4 t = texture2D(uMap, vUv); float a = t.a * uOpacity; gl_FragColor = vec4(uColor * t.rgb * a, uOcc * a); }`,
    transparent: true, depthWrite: false, depthTest, side, ...BLEND_ADD,
  });
  m.color = u.uColor.value;
  Object.defineProperty(m, 'opacity', { get: () => u.uOpacity.value, set: (v) => { u.uOpacity.value = v; }, configurable: true });
  return m;
}

// Radial soft disc texture (white, alpha falloff).
function makeSoftDisc() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ shared geode / shrine assets

// Rift Crystal material: vertex-colour facets tinted by the element (aEmis masks the tint and glow).
const GEODE_PARS = /* glsl */`
uniform vec3 uTint;
uniform vec3 uGlow;
varying float vEmis;
`;
function geodeMaterial() {
  const uniforms = { uTint: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() } };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  patchEnv(m, {
    key: 'geode', uniforms, wrap: true,
    vertexPars: 'attribute float aEmis; varying float vEmis;', vertexMain: 'vEmis = aEmis;',
    fragmentPars: GEODE_PARS,
    colorFragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, uTint * diffuseColor.g, vEmis);',
    emissiveFragment: 'totalEmissiveRadiance += uGlow * vEmis * (0.55 + 0.6 * diffuseColor.g);',
  });
  m.userData.u = uniforms;
  return m;
}

// Rift Crystal: a tall, faceted crystal that floats over a rift scar, with three small shards
// orbiting it. No rock base: an ore node on the ground reads as "mine me", a floating unstable
// crystal reads as "something that goes off". Two meshes so the orbit can spin on its own.
let _crystalGeos = null;
function crystalGeometries() {
  if (_crystalGeos) return _crystalGeos;
  const rng = mulberry32(4242);
  // Hexagonal bipyramid: body, long upper tip, short lower tip. Facets carry a grey "shade" in .g.
  const crystal = (r, h, tipUp, tipDown) => {
    const body = prep(new THREE.CylinderGeometry(r, r * 0.9, h, 6, 1));
    const up = prep(new THREE.ConeGeometry(r, tipUp, 6, 1));
    up.translate(0, h / 2 + tipUp / 2, 0);
    const down = prep(new THREE.ConeGeometry(r * 0.9, tipDown, 6, 1));
    down.rotateX(Math.PI); down.translate(0, -h / 2 - tipDown / 2, 0);
    const g = mergeGeometries([body, up, down]); body.dispose(); up.dispose(); down.dispose();
    paint(g, 0x7a7a7a, 0xf6f6f6, rng, { ao: 0.25, jitter: 0.2 });
    g.deleteAttribute('fl');
    g.setAttribute('aEmis', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    return g;
  };
  const core = crystal(0.3, 0.75, 0.6, 0.42);
  const shards = [];
  for (let i = 0; i < 3; i++) {
    const s = crystal(0.08 + rng() * 0.03, 0.18, 0.16, 0.12);
    const a = (i / 3) * Math.PI * 2;
    s.rotateZ(0.5); s.rotateY(-a);
    s.translate(Math.cos(a) * 0.78, (i - 1) * 0.16, Math.sin(a) * 0.78);
    shards.push(s);
  }
  const orbit = mergeGeometries(shards);
  shards.forEach((s) => s.dispose());
  core.computeVertexNormals(); orbit.computeVertexNormals();
  _crystalGeos = { core, orbit };
  return _crystalGeos;
}

// Ground textures for the crystal: a jagged glowing rift scar under it, and a dashed ring that
// marks exactly how far the blast reaches.
function makeRiftScar() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  const rng = mulberry32(77);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = '#ffffff'; g.shadowBlur = 8;
  for (let i = 0; i < 6; i++) {
    let a = (i / 6) * Math.PI * 2 + rng() * 0.6, x = 128, y = 128;
    const len = 70 + rng() * 45;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(x, y);
    for (let d = 0; d < len; d += 12) {
      a += (rng() - 0.5) * 0.9;
      x += Math.cos(a) * 12; y += Math.sin(a) * 12;
      g.lineTo(x, y);
      g.lineWidth = Math.max(1.2, 5 * (1 - d / len));
    }
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function makeDashRing() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  const R = 120, N = 28;
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  g.lineWidth = 5;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / N) * 0.55;
    g.beginPath(); g.arc(128, 128, R, a0, a1); g.stroke();
  }
  // a faint fill toward the rim so the covered area reads as one zone
  const grd = g.createRadialGradient(128, 128, R * 0.55, 128, 128, R);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(255,255,255,0.07)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(128, 128, R, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

// Shrine: a mossy standing stone with a rune face, a ring of small stones marking the claim circle.
let _shrineGeo = null;
function shrineGeometry() {
  if (_shrineGeo) return _shrineGeo;
  const rng = mulberry32(777);
  const parts = [];
  const mono = prep(new THREE.BoxGeometry(0.95, 2.5, 0.55, 2, 4, 1));
  { const p = mono.attributes.position; for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 1.25) / 2.5; p.setX(i, p.getX(i) * (1 - 0.22 * t)); p.setZ(i, p.getZ(i) * (1 - 0.15 * t)); } }
  lump(mono, 0.05, rng);
  mono.translate(0, 1.15, 0);
  paint(mono, 0x6e6a64, 0xb4ae9e, rng, { ao: 0.4, jitter: 0.07, moss: 0x5f9a3c, mossAmt: 0.85, mossUp: 0.45, y0: 0, y1: 2.4 });
  parts.push(mono);
  const base = lump(prep(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 9, 1)), 0.06, rng);
  base.translate(0, 0.08, 0);
  parts.push(paint(base, 0x5a5650, 0x8a867c, rng, { ao: 0.3, moss: 0x5f9a3c, mossAmt: 0.5 }));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2, r = SHRINE_CLAIM_R + 0.55;
    const h = 0.35 + rng() * 0.35;
    const st = lump(prep(new THREE.BoxGeometry(0.28, h, 0.2)), 0.08, rng);
    st.translate(0, h / 2 - 0.05, 0);
    st.rotateY(-a + (rng() - 0.5) * 0.4);
    st.rotateZ((rng() - 0.5) * 0.2);
    st.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(paint(st, 0x5c5a58, 0x9a968c, rng, { ao: 0.4, moss: 0x5f9a3c, mossAmt: 0.7 }));
  }
  parts.forEach((p) => p.deleteAttribute('fl'));
  _shrineGeo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  _shrineGeo.computeVertexNormals();
  return _shrineGeo;
}

// Fissure geyser decal (Act II hazard): dark branching cracks with red-orange seams while the
// telegraph runs (SEAM_HOT), cooling to ember (SEAM_COOL) after the eruption.
const SEAM_HOT = new THREE.Color(0xff4a1c), SEAM_COOL = new THREE.Color(0x4a1c0c);
function makeCrackTexture() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const rng = mulberry32(99);
  const walks = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    let a = (k / n) * Math.PI * 2 + rng() * 0.6, x = S / 2, y = S / 2;
    const pts = [[x, y]];
    const steps = 6 + Math.floor(rng() * 4);
    for (let s = 0; s < steps; s++) {
      a += (rng() - 0.5) * 0.9;
      const l = 9 + rng() * 9;
      x += Math.cos(a) * l; y += Math.sin(a) * l;
      pts.push([x, y]);
      if (rng() < 0.25) walks.push([[x, y], [x + Math.cos(a + 1) * 14, y + Math.sin(a + 1) * 14]]);
    }
    walks.push(pts);
  }
  const stroke = (style, lw) => {
    g.strokeStyle = style; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    for (const pts of walks) { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
    g.stroke();
  };
  // R = dark crack mask, G = seam mask (alpha = union)
  g.globalCompositeOperation = 'lighter';
  stroke('rgba(255,0,0,1)', 9);
  stroke('rgba(0,255,0,1)', 2.6);
  g.fillStyle = 'rgba(255,255,0,1)';
  g.beginPath(); g.arc(S / 2, S / 2, 9, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const CRACK_FS = /* glsl */`
uniform sampler2D uMap; uniform float uGrow; uniform float uGlow; uniform float uFade; uniform vec3 uSeam;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float d = length(vUv - 0.5) * 2.0;
  float vis = 1.0 - smoothstep(uGrow - 0.08, uGrow, d);
  float crack = t.r * vis, seam = t.g * vis;
  vec3 dark = vec3(0.07, 0.035, 0.02);
  vec3 col = mix(dark, uSeam * uGlow, seam);
  float a = max(crack * 0.85, seam) * uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

// ------------------------------------------------------------------ World

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    this.obstacles = [];          // [{x, z, r}] collision circles (rebuilt per biome)
    this.biomeId = null;
    this.biomeName = '';
    this.shrine = null;           // null | { type, pos, progress, timeLeft, color, name } (HUD)

    this._env = null;             // live biome handle (env/biome.js)
    this._shrineMats = {};        // per shrine type, cached, never disposed
    this._sh = null;              // live shrine visuals
    this._shrineStone = patchEnv(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'shrineStone', wrap: true });
    this._softDisc = makeSoftDisc();
    this._riftScar = makeRiftScar();
    this._dashRing = makeDashRing();
    this._lastNow = performance.now();
    this._initFissures();

    this._resetRun();
    this.setBiome('verge', true);
  }

  // ------------------------------------------------------------------ run state

  _resetRun() {
    this._gen = (this._gen ?? 0) + 1;            // invalidates pending hazard callbacks
    for (const h of this._handles ?? []) h.cancel();
    this._handles = [];
    this._geodeSlots = Array.from({ length: GEODE_COUNT }, () => ({ geode: null, timer: 0 }));
    for (const g of this._loose ?? []) g.dead = true;
    this._loose = [];
    this._removeShrine();
    this._shrineAct = -1;
    this._nextShrineAt = SHRINE_FIRST;
    this._hazKind = null;
    this._hazT = 0;
    this._seenBoss = null;
    this._bossT0 = -99;
    this._magnetT = 0;
    this._flashT = 6;
    this._clearFissures?.();
  }

  reset() {
    this._resetRun();
  }

  // ------------------------------------------------------------------ biomes

  setBiome(id, instant) {
    const def = BIOMES[id];
    if (!def) return;
    const rebuild = this.biomeId !== id || !this._env;
    this.biomeId = id;
    this.biomeName = def.name;
    this._cancelHazards();
    this._dropGeodes();
    this._removeShrine();
    this._clearFissures();
    if (rebuild) {
      this._env?.dispose();
      this._env = buildBiome(def, { engine: this.game.engine, scene: this.scene });
      this.obstacles = this._env.obstacles;
    }
    applyBiomeAtmos(this.game.engine, def, instant ? 0 : 1.5, this.game.creatures);
  }

  /** Terrain height (0 everywhere inside the arena; hills / valleys outside). */
  heightAt(x, z) { return this._env ? this._env.heightFn(x, z) : 0; }

  _cancelHazards() {
    this._gen++;
    for (const h of this._handles) h.cancel();
    this._handles = [];
  }

  _blocked(x, z, pad) {
    for (const o of this.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    }
    return false;
  }

  // Random point in a disc around c (avoiding obstacles, inside bounds).
  _pointNear(c, R, pad) {
    for (let a = 0; a < 14; a++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * R;
      const x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
      if (Math.abs(x) > 57 || Math.abs(z) > 57) continue;
      if (this._blocked(x, z, pad)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(Math.max(-57, Math.min(57, c.x)), 0, Math.max(-57, Math.min(57, c.z)));
  }

  // ------------------------------------------------------------------ frame

  update(dt, time) {
    const game = this.game;
    // Environment animation runs on real time (the title screen calls update with a scaled dt).
    const now = performance.now();
    const realDt = Math.min(0.1, Math.max(0, (now - this._lastNow) / 1000));
    this._lastNow = now;
    const p = game.player;
    this._env?.update(realDt, p && !p.dead ? p.pos : null);
    this._animateShrine(dt, time);
    this._updateFissures(dt);
    if (game.state !== 'playing') return;
    if (!p || p.dead) return;
    this._updateGeodes(dt);
    this._updateShrine(dt, p);
    this._updateHazards(dt, p);
    if (this.biomeId === 'crown') this._updateFlash(dt, p);
  }

  // ------------------------------------------------------------------ world contract

  collide(pos, radius) {
    // Push pos out of every obstacle circle it overlaps, then clamp inside bounds
    for (const obs of this.obstacles) {
      const dx = pos.x - obs.x;
      const dz = pos.z - obs.z;
      const distSq = dx * dx + dz * dz;
      const minDist = obs.r + radius;

      // Quick early-out check
      if (Math.abs(dx) > minDist + 0.1 || Math.abs(dz) > minDist + 0.1) continue;

      const dist = Math.sqrt(distSq);
      if (dist < minDist) {
        const pushDist = minDist - dist;
        if (dist > 1e-6) {
          pos.x += (dx / dist) * pushDist;
          pos.z += (dz / dist) * pushDist;
        }
      }
    }

    // Clamp inside bounds (minus radius)
    const margin = radius;
    if (pos.x < this.bounds.minX + margin) pos.x = this.bounds.minX + margin;
    if (pos.x > this.bounds.maxX - margin) pos.x = this.bounds.maxX - margin;
    if (pos.z < this.bounds.minZ + margin) pos.z = this.bounds.minZ + margin;
    if (pos.z > this.bounds.maxZ - margin) pos.z = this.bounds.maxZ - margin;
    // The playable arena is the circle inside the tree line.
    const r = Math.hypot(pos.x, pos.z), maxR = ARENA_RADIUS - margin;
    if (r > maxR) { pos.x *= maxR / r; pos.z *= maxR / r; }
  }

  randomSpawnPoint(center, minDist, maxDist) {
    // Try up to 25 times to find a valid point
    for (let attempt = 0; attempt < 25; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);
      const x = center.x + Math.cos(angle) * dist;
      const z = center.z + Math.sin(angle) * dist;

      // Check bounds (with 2-unit margin)
      if (Math.hypot(x, z) > ARENA_RADIUS - 2) continue;

      // Check obstacles
      let tooClose = false;
      for (const obs of this.obstacles) {
        const dx = x - obs.x, dz = z - obs.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < obs.r + 0.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      return new THREE.Vector3(x, 0, z);
    }

    // Fallback: clamp to bounds center
    const x = Math.max(this.bounds.minX + 2, Math.min(this.bounds.maxX - 2, center.x));
    const z = Math.max(this.bounds.minZ + 2, Math.min(this.bounds.maxZ - 2, center.z));
    return new THREE.Vector3(x, 0, z);
  }

  // ------------------------------------------------------------------ Rift Crystals (geodes)

  // Each of the 8 slots holds one geode, or counts down a respawn timer after one breaks.
  _updateGeodes(dt) {
    for (const slot of this._geodeSlots) {
      if (slot.geode && slot.geode.dead) slot.geode = null;
      if (slot.geode) continue;
      if (slot.timer > 0) { slot.timer -= dt; continue; }
      this._spawnGeode(slot);
    }
  }

  _spawnGeode(slot) {
    const game = this.game;
    const act = ACTS[game.act] ?? ACTS[0];
    const el = pick(act.geodes);
    // Spread geodes out: retry for a spot at least 9 u from every other geode.
    let pos = null;
    for (let tries = 0; tries < 8; tries++) {
      pos = this.randomSpawnPoint(game.player.pos, 10, 32);
      if (this._geodeSlots.every((s) => !s.geode || s.geode.pos.distanceTo(pos) >= 9)) break;
    }
    const geode = this._makeGeode(el, pos, slot, act.hp);
    slot.geode = geode;
    game.addEnemy(geode);
  }

  // Biome change: existing geodes are marked dead (the game removes and disposes them).
  _dropGeodes() {
    for (const slot of this._geodeSlots) {
      if (slot.geode) {
        slot.geode.dead = true;
        slot.geode._slot = null;
        slot.geode = null;
      }
      slot.timer = 0;
    }
    for (const g of this._loose) g.dead = true;
    this._loose.length = 0;
  }

  // Rift Crystal: floats and slowly turns over a glowing rift scar; a dashed ground ring shows
  // the blast radius and lights up while foes stand inside it ("shoot it now").
  _makeGeode(el, pos, slot, hpMult) {
    const game = this.game;
    const color = ELEMENT_COLOR[el] ?? 0xffffff;
    const group = new THREE.Group();
    group.position.copy(pos);

    const mat = geodeMaterial();
    const elCol = new THREE.Color(color);
    const tint = elCol.clone().lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(0.9);
    mat.userData.u.uTint.value.copy(tint);
    const geos = crystalGeometries();
    const float = new THREE.Group();
    float.position.y = CRYSTAL_HOVER;
    const core = new THREE.Mesh(geos.core, mat);
    core.castShadow = true;
    const orbit = new THREE.Mesh(geos.orbit, mat);
    orbit.castShadow = true;
    float.add(core, orbit);

    const scarMat = texBlendAdd(this._riftScar, color, { hdr: 1.1, occ: 0.35, opacity: 0.9, depthTest: false });
    const scar = new THREE.Mesh(GEO.plane, scarMat);
    scar.rotation.x = -Math.PI / 2;
    scar.rotation.z = Math.random() * Math.PI * 2;
    scar.scale.setScalar(2.8);
    scar.position.y = 0.04;
    scar.renderOrder = 1;

    const ringMat = texBlendAdd(this._dashRing, color, { hdr: 1.3, occ: 0.3, opacity: 0.4, depthTest: false });
    const ring = new THREE.Mesh(GEO.plane, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(GEODE_BURST_R * 2 * (128 / 120));   // the texture's ring sits at r 120 of 128
    ring.position.y = 0.05;
    ring.renderOrder = 1;

    group.add(float, scar, ring);
    game.scene.add(group);

    const glowBase = elCol.clone().multiplyScalar(0.8);
    const ph = Math.random() * Math.PI * 2;
    const hp = GEODE_HP * hpMult;
    const geode = {
      type: 'geode', element: el, pos, radius: 0.7,
      hp, maxHp: hp, xp: 0, damage: 0, speed: 0,
      status: makeStatus(), knock: new THREE.Vector3(), kbResist: 1,
      dead: false, inert: true, elite: false, boss: false, final: false,
      ward: null, resist: null, barrier: 0,
      deathColor: color, mesh: group,
      flashT: 0, _slot: slot, _t: 0, _disposed: false,
      armed: 0,          // 0..1, eases toward 1 while a foe is inside the blast radius
      _scanT: Math.random() * 0.2, _foesIn: false,
      update: (dt) => {
        geode._t += dt;
        geode._scanT -= dt;
        if (geode._scanT <= 0) {
          geode._scanT = 0.2;
          geode._foesIn = game.queryEnemies(pos, GEODE_BURST_R, _tmpScan).some((e) => !e.inert && !e.dead && distXZ(e.pos, pos) <= GEODE_BURST_R);
        }
        geode.armed += ((geode._foesIn ? 1 : 0) - geode.armed) * Math.min(1, dt * 6);
        const a = geode.armed;
        const pulse = 0.5 + 0.5 * Math.sin(geode._t * (2.4 + 5 * a) + ph);
        // unstable hover: bob, slow turn, and a jitter that grows while armed
        const jit = (0.012 + 0.03 * a) * Math.sin(geode._t * 37 + ph);
        float.position.set(jit, CRYSTAL_HOVER + Math.sin(geode._t * 1.6 + ph) * 0.08, -jit);
        core.rotation.y = geode._t * 0.6 + ph;
        orbit.rotation.y = -geode._t * (1.6 + 2.4 * a) + ph;
        if (geode.flashT > 0) {
          geode.flashT -= dt;
          mat.userData.u.uGlow.value.setRGB(2.4, 2.4, 2.4);
          float.scale.setScalar(CRYSTAL_SCALE * (1 + geode.flashT * 2.5));
        } else {
          mat.userData.u.uGlow.value.copy(glowBase).multiplyScalar(0.8 + 0.5 * pulse + 0.6 * a);
          float.scale.setScalar(CRYSTAL_SCALE);
        }
        scarMat.opacity = 0.6 + 0.3 * pulse + 0.3 * a;
        ringMat.opacity = 0.22 + 0.1 * pulse + 0.68 * a;
        ring.rotation.z = geode._t * 0.15;
      },
      flash: () => { geode.flashT = 0.08; },
      dispose: (g) => {
        if (geode._disposed) return;
        geode._disposed = true;
        g.scene.remove(group);
        mat.dispose();
        scarMat.dispose();
        ringMat.dispose();
      },
      onDeath: (g) => this._geodeBurst(geode, g),
    };
    return geode;
  }

  // A crystal outside the respawning slots (the tutorial places these). Removed on a biome change.
  spawnCrystal(el, pos, { hp } = {}) {
    const game = this.game;
    const act = ACTS[game.act] ?? ACTS[0];
    const geode = this._makeGeode(el, pos.clone(), null, act.hp);
    if (hp) { geode.hp = geode.maxHp = hp; }
    this._loose.push(geode);
    game.addEnemy(geode);
    return geode;
  }

  // Broken crystal: elemental burst that hits every non-inert enemy within 4.5 u. The shockwave
  // ring lands exactly on the dashed ring, so cause and reach read as one thing.
  _geodeBurst(geode, game) {
    const pos = geode.pos;
    const el = geode.element;
    const color = ELEMENT_COLOR[el] ?? 0xffffff;
    const act = ACTS[game.act] ?? ACTS[0];
    const R = GEODE_BURST_R;
    const up = { x: pos.x, y: CRYSTAL_HOVER, z: pos.z };

    game.fx.flashDisc(pos, { color, radius: R, life: 0.3, hdr: 2 });
    game.fx.ring(pos, { color, radius: R, life: 0.45, width: 0.25, hdr: 3 });
    game.fx.ring(pos, { color: 0xffffff, radius: R * 0.55, life: 0.3, width: 0.15, hdr: 2 });
    game.fx.burst(up, { color, count: 34, speed: 10, life: 0.6, size: 0.4, up: 1.2, hdr: 3 });
    game.fx.burst(up, { color: 0xffffff, count: 10, speed: 6, life: 0.4, size: 0.25, up: 3, gravity: 12, hdr: 2.5 });
    game.fx.light(pos, color, 60, 0.35, 16);
    game.fx.shake(0.2);

    const dmg = GEODE_BURST_DMG * act.hp;
    const hits = game.queryEnemies(pos, R, _tmpHits).slice();
    let n = 0;
    for (const e of hits) {
      if (e === geode || e.inert || e.dead) continue;
      if (distXZ(e.pos, pos) > R) continue;
      damageEnemy(game, e, dmg, { element: el, statusPower: 3, raw: true });
      n++;
    }

    if (geode._slot) {
      geode._slot.geode = null;
      geode._slot.timer = GEODE_RESPAWN;
    }
    const i = this._loose.indexOf(geode);
    if (i >= 0) this._loose.splice(i, 1);
    game.events.emit('geodeBroken', { element: el, pos: pos.clone(), hits: n });
  }

  // ------------------------------------------------------------------ Shrines

  // Per-type shared materials and glyph texture (cached, never disposed).
  _shrineMatsFor(type) {
    let c = this._shrineMats[type];
    if (c) return c;
    const def = SHRINES[type];
    const cv = makeCanvas(128, 128);
    const g = cv.getContext('2d');
    g.strokeStyle = '#ffffff';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 10;
    g.lineJoin = 'round';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    const glyph = RUNE_GLYPHS[type];
    g.lineWidth = 7;
    g.beginPath();
    for (const poly of glyph.polys) {
      poly.forEach(([x, y], i) => { if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      if (glyph.closed) g.closePath();
    }
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    c = {
      glyph: texBlendAdd(tex, def.hex, { hdr: 1.7, occ: 0.55, side: THREE.DoubleSide }),
      face: texBlendAdd(tex, def.hex, { hdr: 1.5, occ: 0.6 }),
      ring: blendAddMaterial(def.hex, { hdr: 1.3, occ: 0.55, opacity: 0.9 }),
      ringDark: new THREE.MeshBasicMaterial({ color: 0x10140c, transparent: true, opacity: 0.45, depthWrite: false }),
      prog: blendAddMaterial(def.hex, { hdr: 1.9, occ: 0.6 }),
      beam: blendAddMaterial(def.hex, { hdr: 0.6, occ: 0.0, opacity: 0.07, side: THREE.DoubleSide }),
    };
    this._shrineMats[type] = c;
    return c;
  }

  _spawnShrine(p) {
    const game = this.game;
    const type = pick(SHRINE_TYPES);
    const def = SHRINES[type];
    const pos = this.randomSpawnPoint(p.pos, 14, 22);
    const c = this._shrineMatsFor(type);

    const group = new THREE.Group();
    group.position.copy(pos);

    // Standing stone faces the camera (+X+Z); ring of small stones marks the claim circle.
    const stone = new THREE.Mesh(shrineGeometry(), this._shrineStone);
    stone.rotation.y = Math.PI / 4;
    stone.castShadow = true;
    stone.receiveShadow = true;

    const face = new THREE.Mesh(GEO.plane, c.face);
    face.scale.setScalar(0.72);
    face.position.set(0.21, 1.45, 0.21);
    face.rotation.y = Math.PI / 4;
    face.renderOrder = 2;

    const glyph = new THREE.Mesh(GEO.plane, c.glyph);
    glyph.scale.setScalar(1.1);
    glyph.position.y = 3.3;

    const ringDark = new THREE.Mesh(GEO.ring, c.ringDark);
    ringDark.rotation.x = -Math.PI / 2;
    ringDark.scale.setScalar(SHRINE_CLAIM_R + 0.08);
    ringDark.position.y = 0.03;
    ringDark.renderOrder = 1;
    const ring = new THREE.Mesh(GEO.ring, c.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(SHRINE_CLAIM_R);
    ring.position.y = 0.05;
    ring.renderOrder = 2;

    // Progress ring: tiles appear as the claim fills (instance count, no allocation per frame).
    const prog = new THREE.InstancedMesh(GEO.box, c.prog, SHRINE_TILES);
    for (let i = 0; i < SHRINE_TILES; i++) {
      const a = (i / SHRINE_TILES) * Math.PI * 2;
      prog.setMatrixAt(i, xform(
        Math.cos(a) * (SHRINE_CLAIM_R - 0.25), 0.09, Math.sin(a) * (SHRINE_CLAIM_R - 0.25),
        0.24, 0.06, 0.14, 0, -a + Math.PI / 2, 0));
    }
    prog.count = 0;
    prog.renderOrder = 3;

    const beam = new THREE.Mesh(GEO.cylinder, c.beam);
    beam.scale.set(0.7, 24, 0.7);
    beam.position.y = 12;

    group.add(stone, face, glyph, ringDark, ring, prog, beam);
    this.scene.add(group);
    this._sh = { group, glyph, ring, prog, face };
    this._env?.setClearing(0, pos.x, pos.z, SHRINE_CLAIM_R + 0.9, 1);

    this.shrine = { type, pos, progress: 0, timeLeft: SHRINE_LIFE, color: def.color, name: def.name };
    game.events.emit('shrineSpawned', { type, pos });
    game.fx.ring(pos, { color: def.hex, radius: 3.5, life: 0.5, width: 0.2 });
    game.fx.light(pos, def.hex, 40, 0.4, 14);
  }

  _removeShrine() {
    if (this._sh) {
      this.scene.remove(this._sh.group);
      this._sh.prog.dispose?.();
      this._sh = null;
    }
    this._env?.setClearing(0, 0, 0, 0, 0);
    this.shrine = null;
  }

  _animateShrine(dt, t) {
    const sh = this._sh, s = this.shrine;
    if (!sh || !s) return;
    sh.glyph.rotation.y += dt * 1.3;
    sh.glyph.position.y = 3.3 + Math.sin(t * 1.7) * 0.12;
    sh.ring.material.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    sh.face.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.2);
    sh.prog.count = Math.round(s.progress * SHRINE_TILES);
  }

  _updateShrine(dt, p) {
    const game = this.game;

    // Schedule restarts with every act: first shrine at 0:35, then 50 s after claim or expiry.
    if (game.act !== this._shrineAct) {
      this._shrineAct = game.act;
      this._nextShrineAt = SHRINE_FIRST;
      this._removeShrine();
    }

    // Greed keeps pulling XP in while its buff lasts.
    if (p.hasBuff('greed')) {
      this._magnetT -= dt;
      if (this._magnetT <= 0) {
        this._magnetT = 0.5;
        game.pickups?.magnetAll();
      }
    }

    const s = this.shrine;
    if (!s) {
      if (game.actTime >= this._nextShrineAt) this._spawnShrine(p);
      return;
    }

    s.timeLeft -= dt;
    const inside = distXZ(p.pos, s.pos) <= SHRINE_CLAIM_R;
    s.progress = inside
      ? Math.min(1, s.progress + dt / SHRINE_CLAIM_TIME)
      : Math.max(0, s.progress - dt * 0.15);

    if (s.progress >= 1) {
      this._claimShrine(p);
    } else if (s.timeLeft <= 0) {
      game.fx.burst(s.pos, { color: SHRINES[s.type].hex, count: 14, speed: 3, life: 0.5, size: 0.3, up: 1 });
      this._removeShrine();
      this._nextShrineAt = game.actTime + SHRINE_GAP;
    }
  }

  _claimShrine(p) {
    const game = this.game;
    const s = this.shrine;
    const def = SHRINES[s.type];
    const pos = s.pos;

    p.addBuff(s.type, SHRINE_BUFF_TIME, { name: def.title, icon: def.icon, color: def.color, apply: def.apply });
    if (s.type === 'aegis') p.addShield(60);
    if (s.type === 'greed') game.pickups?.magnetAll();

    game.fx.ring(pos, { color: def.hex, radius: 6, life: 0.6, width: 0.2, hdr: 3 });
    game.fx.flashDisc(pos, { color: def.hex, radius: 2.5, life: 0.35 });
    game.fx.burst(pos, { color: def.hex, count: 40, speed: 7, life: 0.8, size: 0.4, up: 2, hdr: 2.5 });
    game.fx.light(pos, def.hex, 90, 0.5, 16);
    game.fx.shake(0.3);
    game.fx.text(pos, def.title.toUpperCase(), def.color, true);
    game.events.emit('shrineClaimed', { type: s.type, pos: pos.clone() });

    this._removeShrine();
    this._nextShrineAt = game.actTime + SHRINE_GAP;
  }

  // ------------------------------------------------------------------ hazards

  // Act II fissure geysers / Act III lightning. Paused for a boss's first 3 seconds.
  _updateHazards(dt, p) {
    const game = this.game;
    const kind = ACTS[game.act]?.hazard ?? null;
    if (kind !== this._hazKind) {
      this._hazKind = kind;
      this._hazT = kind === 'lava' ? LAVA_EVERY : STRIKE_EVERY;
    }
    if (!kind) return;

    const boss = game.boss;
    if (boss && !boss.dead) {
      if (boss !== this._seenBoss) { this._seenBoss = boss; this._bossT0 = game.time; }
      if (game.time - this._bossT0 < 3) return;
    }

    const every = kind === 'lava' ? LAVA_EVERY : STRIKE_EVERY;
    this._hazT -= dt;
    if (this._hazT > 0) return;
    this._hazT += every;

    const gen = this._gen;
    this._handles = this._handles.filter((h) => !h.done);
    if (kind === 'lava') {
      for (let k = 0; k < LAVA_COUNT; k++) {
        const pt = this._pointNear(p.pos, LAVA_R, 1.2);
        const fis = this._openFissure(pt, 1.2);
        this._handles.push(game.fx.telegraph(pt, 2.4, 1.2, { color: 0xff5a2a, onDone: () => this._erupt(pt, gen, fis) }));
      }
    } else {
      for (let k = 0; k < STRIKE_COUNT; k++) {
        const pt = this._pointNear(p.pos, STRIKE_R, 1.2);
        this._handles.push(game.fx.telegraph(pt, 1.8, 1.0, { color: 0xb0d8ff, onDone: () => this._strike(pt, gen) }));
      }
    }
  }

  _erupt(pt, gen, fis) {
    const game = this.game;
    if (gen !== this._gen || game.state !== 'playing') return;
    const act = ACTS[game.act] ?? ACTS[0];
    const fx = game.fx;
    if (fis) { fis.phase = 1; fis.t = 0; }
    // geyser: dark dust column + yellow-white spray (reads on ochre ground)
    fx.burst(pt, { color: 0x5a4030, count: 16, speed: 4, life: 0.9, size: 0.7, up: 5, gravity: 4, blend: 'normal' });
    fx.burst(pt, { color: 0xffc860, count: 24, speed: 6, life: 0.6, size: 0.35, up: 9, gravity: 14, hdr: 2.2, backing: true });
    fx.burst(pt, { color: 0xfff0c0, count: 10, speed: 3, life: 0.4, size: 0.3, up: 11, gravity: 10, hdr: 2.6 });
    fx.flashDisc(pt, { color: 0xffb040, radius: 2.4, life: 0.3, hdr: 1.6 });
    fx.ring(pt, { color: 0x6a4a30, radius: 2.6, life: 0.4, width: 0.3, blend: 'dark' });
    fx.light(pt, 0xffb040, 70, 0.35, 12);
    fx.shake(0.15, 'threat');

    const p = game.player;
    if (p && !p.dead && distXZ(p.pos, pt) <= 2.4) p.takeDamage(15 * act.dmg, HAZ_LAVA);
    for (const e of game.queryEnemies(pt, 2.4, _tmpHits).slice()) {
      if (e.inert || e.dead || distXZ(e.pos, pt) > 2.4) continue;
      damageEnemy(game, e, 40 * act.hp, { element: 'fire', raw: true, noCrit: true });
    }
    game.events.emit('hazard', { kind: 'lava', pos: pt.clone() });
  }

  _strike(pt, gen) {
    const game = this.game;
    if (gen !== this._gen || game.state !== 'playing') return;
    const act = ACTS[game.act] ?? ACTS[0];
    const fx = game.fx;
    fx.lightning({ x: pt.x, y: 14, z: pt.z }, { x: pt.x, y: 0.2, z: pt.z }, { color: 0xe8f6ff, life: 0.25, strands: 2, jag: 0.6, segments: 10 });
    fx.flashDisc(pt, { color: 0xc8e8ff, radius: 1.8, life: 0.22, hdr: 2.4 });
    fx.ring(pt, { color: 0xb0d8ff, radius: 1.8, life: 0.25, width: 0.2 });
    fx.light(pt, 0xb0d8ff, 80, 0.25, 12);
    fx.shake(0.1, 'threat');
    game.engine.skyFlash?.(0.35);

    const p = game.player;
    if (p && !p.dead && distXZ(p.pos, pt) <= 1.8) p.takeDamage(12 * act.dmg, HAZ_STORM);
    for (const e of game.queryEnemies(pt, 1.8, _tmpHits).slice()) {
      if (e.inert || e.dead || distXZ(e.pos, pt) > 1.8) continue;
      damageEnemy(game, e, 35 * act.hp, { element: 'storm', raw: true, noCrit: true });
    }
    game.events.emit('hazard', { kind: 'lightning', pos: pt.clone() });
  }

  // Stormwater Reach: a distant lightning flash every 6-12 s (sky light pulse; no extra lights).
  _updateFlash(dt) {
    this._flashT -= dt;
    if (this._flashT > 0) return;
    this._flashT = 6 + Math.random() * 6;
    this.game.engine.skyFlash?.(0.8);
  }

  // ------------------------------------------------------------------ fissure decals (pooled)

  _initFissures() {
    const tex = makeCrackTexture();
    this._fis = [];
    for (let i = 0; i < FISSURES; i++) {
      const u = { uMap: { value: tex }, uGrow: { value: 0 }, uGlow: { value: 1 }, uFade: { value: 1 }, uSeam: { value: new THREE.Color(0xffd27a) } };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: CRACK_FS,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const m = new THREE.Mesh(GEO.plane, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.04;
      m.visible = false;
      m.renderOrder = 1;
      this.scene.add(m);
      this._fis.push({ mesh: m, u, active: false, phase: 0, t: 0, dur: 1 });
    }
  }

  _openFissure(pt, dur) {
    const f = this._fis.find((q) => !q.active) ?? this._fis[0];
    f.active = true; f.phase = 0; f.t = 0; f.dur = dur;
    f.mesh.position.set(pt.x, 0.04 + this.heightAt(pt.x, pt.z), pt.z);
    f.mesh.rotation.z = Math.random() * Math.PI * 2;
    f.mesh.scale.setScalar(5.6);
    f.mesh.visible = true;
    return f;
  }

  _updateFissures(dt) {
    for (const f of this._fis) {
      if (!f.active) continue;
      f.t += dt;
      const u = f.u;
      // Seams glow in the threat palette only while the telegraph is live, then cool to a dull
      // ember: pale cream cracks lingering after the eruption read as an unmarked hazard
      // (playtest round 1, issue #11).
      if (f.phase === 0) {          // cracks spread while the telegraph fills
        const k = Math.min(1, f.t / f.dur);
        u.uSeam.value.copy(SEAM_HOT);
        u.uGrow.value = 0.15 + 0.85 * k;
        u.uGlow.value = 0.6 + 1.4 * k * k + 0.45 * Math.sin(f.t * 30) * k;
        u.uFade.value = 1;
        if (f.t > f.dur + 0.6) f.phase = 1;    // telegraph cancelled / never erupted: fade out
      } else {                      // erupted: flare, then cool and fade
        const k = Math.min(1, f.t / 1.0);
        u.uSeam.value.copy(SEAM_HOT).lerp(SEAM_COOL, Math.min(1, k * 3));
        u.uGrow.value = 1;
        u.uGlow.value = 1.6 * (1 - k) + 0.2;
        u.uFade.value = 1 - k * k;
        if (k >= 1) { f.active = false; f.mesh.visible = false; }
      }
    }
  }

  _clearFissures() {
    for (const f of this._fis ?? []) { f.active = false; f.mesh.visible = false; }
  }
}
