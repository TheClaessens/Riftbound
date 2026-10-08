import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, glowMaterial, pick, distXZ, ELEMENT_COLOR } from '../core/utils.js';
import { makeStatus, damageEnemy } from './combat.js';
import { ACTS } from './acts.js';

// =====================================================================================
//  World: three biomes (ground, props, atmosphere, ambient particles), Rift Geodes,
//  Shrines and act hazards. See ARCHITECTURE.md "World contract".
// =====================================================================================

const ARENA_RADIUS = 55;
const GEODE_COUNT = 8;
const GEODE_HP = 30;
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
const REPEAT = 10; // ground texture repeats across the 150 u plane
const HAZ_LAVA = { type: 'hazard', kind: 'lava' };
const HAZ_STORM = { type: 'hazard', kind: 'lightning' };

const BIOMES = {
  verge: {
    name: 'The Hollow Verge', seed: 1337, groundGlow: 0.6,
    runes: [0xa66bff, 0x5fd4ff], wall: 0xa66bff, cliff: 0x1a1a22, debris: 0x3a3c45,
    stone: 0x555560, wood: 0x3a3630, rock: 0x222228, crystals: [0xa66bff, 0x5fd4ff],
    atmos: {
      background: 0x07080d, hemiSky: 0x8a9bff, hemiGround: 0x1a1020, hemiIntensity: 0.9,
      moon: 0xc4d0ff, moonIntensity: 1.7,
      grade: { tint: [0.95, 0.97, 1.08], saturation: 1.0, contrast: 1.0, vignette: 0.35 },
    },
  },
  cinder: {
    name: 'The Cinder Wastes', seed: 7331, groundGlow: 0.85,
    runes: [0xff7a33, 0xffb347], wall: 0xff6a1f, cliff: 0x1a0c08, debris: 0x2a2321,
    stone: 0x1f1816, rock: 0x140e0c, crystals: [0xff6a1f, 0xffb347],
    atmos: {
      background: 0x0d0605, hemiSky: 0xff9a6a, hemiGround: 0x200a05, hemiIntensity: 0.9,
      moon: 0xffb080, moonIntensity: 1.5,
      grade: { tint: [1.12, 0.97, 0.88], saturation: 1.1, contrast: 1.08, vignette: 0.35 },
    },
  },
  crown: {
    name: 'The Shattered Crown', seed: 2024, groundGlow: 0.8,
    runes: [0x9ff3ff, 0xffffff], wall: 0x7fe0ff, cliff: 0x1c2233, debris: 0x8fa0b8,
    stone: 0xd5deea, rock: 0x3a4a60, crystals: [0x9ff3ff, 0xffffff],
    atmos: {
      background: 0x0a0d14, hemiSky: 0xcfe8ff, hemiGround: 0x141a2a, hemiIntensity: 0.9,
      moon: 0xe0f0ff, moonIntensity: 1.9,
      grade: { tint: [0.95, 1.02, 1.1], saturation: 0.85, contrast: 1.0, vignette: 0.35 },
    },
  },
};

// Ambient particle systems: one THREE.Points per biome.
const AMBIENT = {
  verge: {
    additive: true, opacity: 0.9,
    parts: [{ count: 240, color: [0.35, 0.95, 0.85], hdr: 1.5, size: [0.08, 0.16], vy: [-0.2, 0.2], vxz: 0.4, lo: 0.3, hi: 9, sway: 0.5 }],
  },
  cinder: {
    additive: true, opacity: 0.9,
    parts: [
      { count: 160, color: [1.0, 0.5, 0.15], hdr: 2.2, size: [0.1, 0.2], vy: [0.8, 2.4], vxz: 0.3, lo: 0.2, hi: 12, sway: 0.4 },
      { count: 56, color: [0.22, 0.2, 0.2], hdr: 1.0, size: [0.5, 0.9], vy: [0.35, 0.7], vxz: 0.15, lo: 0.5, hi: 8, sway: 0.2, smoke: true },
    ],
  },
  crown: {
    additive: false, opacity: 0.85,
    parts: [{ count: 280, color: [0.92, 0.97, 1.0], hdr: 1.0, size: [0.1, 0.18], vy: [-1.8, -1.0], vxz: 0.4, lo: 0, hi: 14, sway: 0.6 }],
  },
};

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

const PARTICLE_VS = `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale, 1.0, 64.0);
}`;
const PARTICLE_FS = `
uniform float uOpacity;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * uOpacity);
}`;

// Shared (never disposed) material for geode rock bases.
const GEODE_ROCK = new THREE.MeshStandardMaterial({ color: 0x242230, roughness: 1, metalness: 0 });

const _tmpHits = [];
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// ------------------------------------------------------------------ helpers

// Seeded random number generator (mulberry32)
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

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

// Collects fresh geometries per material key, then merges each key into one mesh.
class Merger {
  constructor() { this.parts = new Map(); }
  add(key, geo, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    let list = this.parts.get(key);
    if (!list) { list = []; this.parts.set(key, list); }
    list.push(g);
  }
  flush(root, mats, own) {
    for (const [key, list] of this.parts) {
      const mat = mats[key];
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged || !mat) continue;
      own(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !mat.transparent;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    this.parts.clear();
  }
}

function speckles(ctx, rng, S, alpha, n, color) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 1.5, 1 + rng() * 1.5);
  ctx.restore();
}

// Random polylines in S-space. Returns [[ [x,y], ... ], ...]
function makeWalks(rng, count, steps, len, S) {
  const out = [];
  for (let c = 0; c < count; c++) {
    let x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2;
    const pts = [[x, y]];
    for (let s = 0; s < steps; s++) {
      a += (rng() - 0.5) * 1.0;
      const l = len * (0.6 + rng() * 0.8);
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      pts.push([x, y]);
    }
    out.push(pts);
  }
  return out;
}

function drawWalks(ctx, walks, sc, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const pts of walks) {
    ctx.moveTo(pts[0][0] * sc, pts[0][1] * sc);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * sc, pts[i][1] * sc);
  }
  ctx.stroke();
  ctx.restore();
}

// Small runic circle (rune sigil).
function drawSigil(ctx, x, y, r, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    ctx.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
    ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
  }
  ctx.stroke();
  ctx.restore();
}

// Ground colour map + emissive map (emissive = the glowing parts of the ground).
function makeGroundTextures(id, seed) {
  const rng = mulberry32(seed);
  const S = 1024, H = 512, k = H / S;
  const cv = makeCanvas(S, S), g = cv.getContext('2d');
  const ec = makeCanvas(H, H), e = ec.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, H, H);

  if (id === 'verge') {
    // Slate flagstones with faint violet runes.
    g.fillStyle = '#1e2530';
    g.fillRect(0, 0, S, S);
    const N = 6, T = S / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      g.fillStyle = rng() > 0.5 ? '#1a1f28' : '#242a38';
      g.fillRect(i * T + 3, j * T + 3, T - 6, T - 6);
    }
    g.strokeStyle = '#0a0c12';
    g.lineWidth = 4;
    for (let i = 0; i <= N; i++) {
      g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * T); g.lineTo(S, i * T); g.stroke();
    }
    speckles(g, rng, S, 0.1, 220, '#ffffff');
    drawWalks(g, makeWalks(rng, 50, 4, 16, S), 1, 'rgba(255,255,255,0.08)', 1);
    for (let n = 0; n < 3; n++) {
      const x = rng() * S, y = rng() * S, r = 14 + rng() * 18;
      drawSigil(g, x, y, r, 'rgba(166,107,255,0.22)', 2);
      drawSigil(e, x * k, y * k, r * k, '#4a3580', 1.2);
    }
  } else if (id === 'cinder') {
    // Black basalt plates with glowing lava cracks.
    g.fillStyle = '#2a1f1a';
    g.fillRect(0, 0, S, S);
    const N = 5, T = S / N;
    const shades = ['#3d2e27', '#352820', '#2e231d'];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) =>
        [(i + u) * T + (rng() - 0.5) * T * 0.14, (j + v) * T + (rng() - 0.5) * T * 0.14]);
      g.beginPath();
      g.moveTo(corners[0][0], corners[0][1]);
      for (let q = 1; q < 4; q++) g.lineTo(corners[q][0], corners[q][1]);
      g.closePath();
      g.fillStyle = shades[(rng() * 3) | 0];
      g.fill();
      g.strokeStyle = '#030202';
      g.lineWidth = 6;
      g.stroke();
    }
    speckles(g, rng, S, 0.14, 200, '#ffffff');
    const cracks = makeWalks(rng, 7, 12, 24, S);
    drawWalks(g, cracks, 1, '#5a1606', 4);
    drawWalks(g, cracks, 1, '#b8461a', 1.2);
    drawWalks(e, cracks, k, '#c4400f', 4 * k);
    drawWalks(e, cracks, k, '#ffb070', 1.2 * k);
  } else {
    // Pale cracked marble with cyan crystal veins.
    g.fillStyle = '#56627a';
    g.fillRect(0, 0, S, S);
    for (let n = 0; n < 260; n++) {
      g.fillStyle = 'rgba(20,30,52,0.10)';
      g.beginPath();
      g.arc(rng() * S, rng() * S, 20 + rng() * 60, 0, Math.PI * 2);
      g.fill();
    }
    drawWalks(g, makeWalks(rng, 40, 8, 18, S), 1, 'rgba(25,35,60,0.45)', 1.4);
    drawWalks(g, makeWalks(rng, 14, 10, 24, S), 1, 'rgba(15,22,40,0.7)', 2.2);
    const cyan = makeWalks(rng, 12, 12, 30, S);
    drawWalks(g, cyan, 1, '#7fe0ff', 2.6);
    drawWalks(g, cyan, 1, '#e8fbff', 0.9);
    drawWalks(e, cyan, k, '#66e6ff', 2.6 * k);
  }

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(REPEAT, REPEAT);
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(ec);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.repeat.set(REPEAT, REPEAT);
  return { map, emissive };
}

function makeRuneTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const cx = 128, cy = 128;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  for (let r = 20; r < 120; r += 20) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 200, 255, 0.9)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const r of [30, 60, 90]) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    this.obstacles = [];          // [{x, z, r}] collision circles (rebuilt per biome)
    this.biomeId = null;
    this.biomeName = '';
    this.shrine = null;           // null | { type, pos, progress, timeLeft, color, name } (HUD)

    this._owned = [];             // disposable resources of the current biome decor
    this._decor = null;
    this._runes = [];
    this._crystals = [];          // glow materials that pulse: { mat, base, phase }
    this._bobbers = [];           // floating fragments: { mesh, y0, phase }
    this._vents = [];             // cinder vent positions (smoke source)
    this._amb = null;
    this._ambCache = {};
    this._groundCache = {};
    this._shrineMats = {};        // per shrine type, cached, never disposed
    this._sh = null;              // live shrine visuals

    this._shrineStone = new THREE.MeshStandardMaterial({ color: 0x3b3a48, roughness: 0.8, metalness: 0.05 });
    this._runeTex = new THREE.CanvasTexture(makeRuneTexture());

    // One big ground plane; texture and emissive map are swapped per biome.
    this._groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), this._groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this._resetRun();
    this.setBiome('verge', true);
  }

  // ------------------------------------------------------------------ run state

  _resetRun() {
    this._gen = (this._gen ?? 0) + 1;            // invalidates pending hazard callbacks
    for (const h of this._handles ?? []) h.cancel();
    this._handles = [];
    this._geodeSlots = Array.from({ length: GEODE_COUNT }, () => ({ geode: null, timer: 0 }));
    this._removeShrine();
    this._shrineAct = -1;
    this._nextShrineAt = SHRINE_FIRST;
    this._hazKind = null;
    this._hazT = 0;
    this._seenBoss = null;
    this._bossT0 = -99;
    this._magnetT = 0;
    this._flashT = 6;
  }

  reset() {
    this._resetRun();
  }

  // ------------------------------------------------------------------ biomes

  setBiome(id, instant) {
    const def = BIOMES[id];
    if (!def) return;
    this.biomeId = id;
    this.biomeName = def.name;
    const tex = this._groundTextures(id);
    this._groundMat.map = tex.map;
    this._groundMat.emissiveMap = tex.emissive;
    this._groundMat.emissiveIntensity = def.groundGlow;
    this._cancelHazards();
    this._dropGeodes();
    this._removeShrine();
    this._buildDecor(id);
    this._showAmbient(id);
    this.game.engine?.setAtmosphere?.(def.atmos, instant ? 0 : 1.5);
  }

  _groundTextures(id) {
    let t = this._groundCache[id];
    if (!t) t = this._groundCache[id] = makeGroundTextures(id, BIOMES[id].seed + 99);
    return t;
  }

  _cancelHazards() {
    this._gen++;
    for (const h of this._handles) h.cancel();
    this._handles = [];
  }

  _own(o) {
    this._owned.push(o);
    return o;
  }

  _disposeDecor() {
    if (this._decor) { this.scene.remove(this._decor); this._decor = null; }
    for (const o of this._owned) o.dispose?.();
    this._owned = [];
    this._runes = [];
    this._crystals = [];
    this._bobbers = [];
    this._vents = [];
  }

  _buildDecor(id) {
    this._disposeDecor();
    const def = BIOMES[id];
    const rng = mulberry32(def.seed);
    const root = new THREE.Group();
    this.scene.add(root);
    this._decor = root;
    this.obstacles = [];
    this._placeProps(id, rng, root);
    this._buildRunes(def, rng, root);
    this._buildEdge(def, root);
    this._buildDebris(def, rng, root);
  }

  // ------------------------------------------------------------------ placement

  // Obstacles never sit within 5 u of the origin or of the player.
  _canPlace(x, z, r) {
    if (Math.abs(x) > 56 || Math.abs(z) > 56) return false;
    if (Math.hypot(x, z) < 5 + r) return false;
    const p = this.game.player;
    if (p && Math.hypot(x - p.pos.x, z - p.pos.z) < 5 + r) return false;
    for (const o of this.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < r + o.r + 0.6) return false;
    }
    return true;
  }

  _findSpot(rng, r) {
    for (let t = 0; t < 30; t++) {
      const x = -54 + rng() * 108, z = -54 + rng() * 108;
      if (this._canPlace(x, z, r)) return { x, z };
    }
    return null;
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

  // ------------------------------------------------------------------ props

  _placeProps(id, rng, root) {
    const def = BIOMES[id];
    const M = new Merger();
    const mats = {};
    const own = (o) => this._own(o);
    const std = (k, opts) => { mats[k] = own(new THREE.MeshStandardMaterial(opts)); };
    const glow = (k, color, intensity) => {
      const m = own(glowMaterial(color, intensity, { transparent: true, opacity: 1 }));
      mats[k] = m;
      this._crystals.push({ mat: m, base: new THREE.Color(color).multiplyScalar(intensity), phase: rng() * Math.PI * 2 });
    };

    if (id === 'verge') {
      std('stone', { color: def.stone, roughness: 0.85, metalness: 0 });
      std('wood', { color: def.wood, roughness: 0.9, metalness: 0 });
      std('rock', { color: def.rock, roughness: 1, metalness: 0 });
      glow('glowA', def.crystals[0], 2.5);
      glow('glowB', def.crystals[1], 2.5);
      for (let i = 0; i < 30; i++) {
        const r = 0.8 + rng() * 0.3;
        const p = this._findSpot(rng, r);
        if (p) this._pillar(M, 'stone', p.x, p.z, r, 2 + rng() * 2, rng);
      }
      for (let i = 0; i < 20; i++) {
        const p = this._findSpot(rng, 0.4);
        if (p) this._tree(M, p.x, p.z, rng);
      }
      for (let i = 0; i < 18; i++) {
        const p = this._findSpot(rng, 0.7);
        if (p) this._crystalCluster(M, p.x, p.z, rng, rng() > 0.5 ? 'glowA' : 'glowB');
      }
    } else if (id === 'cinder') {
      std('basalt', { color: 0x1a1412, roughness: 0.92, metalness: 0.05 });
      std('basalt2', { color: def.rock, roughness: 0.95, metalness: 0, flatShading: true });
      glow('ventGlow', 0xff5a1a, 2.2);
      for (let i = 0; i < 24; i++) {
        const r = 0.6 + rng() * 0.3;
        const p = this._findSpot(rng, r);
        if (p) this._spire(M, 'basalt', p.x, p.z, r, 3.5 + rng() * 3.5, rng);
      }
      for (let i = 0; i < 30; i++) {
        const s = 0.8 + rng() * 0.7;
        const p = this._findSpot(rng, s * 0.95);
        if (p) this._rock(M, 'basalt2', p.x, p.z, s, rng);
      }
      // Smoking vents: decor only (no collider).
      for (let i = 0; i < 8; i++) {
        const p = this._findSpot(rng, 1.3);
        if (!p) continue;
        this._vents.push({ x: p.x, z: p.z });
        M.add('basalt', new THREE.CylinderGeometry(1.0, 1.25, 0.4, 10), xform(p.x, 0.2, p.z));
        M.add('ventGlow', new THREE.CircleGeometry(0.85, 16), xform(p.x, 0.42, p.z, 1, 1, 1, -Math.PI / 2, 0, 0));
      }
    } else {
      std('crystal', { color: 0xbfe9ff, roughness: 0.25, metalness: 0.1, emissive: 0x2aa8d8, emissiveIntensity: 0.45 });
      std('marble', { color: 0xc8d0dc, roughness: 0.7, metalness: 0 });
      for (let i = 0; i < 24; i++) {
        const r = 0.5 + rng() * 0.25;
        const p = this._findSpot(rng, r);
        if (p) this._spire(M, 'crystal', p.x, p.z, r, 3 + rng() * 3, rng);
      }
      for (let i = 0; i < 12; i++) {
        const r = 0.7 + rng() * 0.2;
        const p = this._findSpot(rng, r);
        if (p) this._pillar(M, 'marble', p.x, p.z, r, 1.5 + rng() * 1.5, rng);
      }
      // Floating ruin fragments: decor only, they bob above the ground.
      const fragMat = own(new THREE.MeshStandardMaterial({ color: 0xaab6c8, roughness: 0.6, metalness: 0.05, emissive: 0x1a3a55, emissiveIntensity: 0.3 }));
      for (let i = 0; i < 12; i++) {
        const p = this._findSpot(rng, 1.2);
        if (!p) continue;
        const m = new THREE.Mesh(GEO.box, fragMat);
        m.scale.set(1.6 + rng() * 1.8, 0.5 + rng() * 0.4, 1.0 + rng() * 1.2);
        m.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
        const y0 = 4.5 + rng() * 3;
        m.position.set(p.x, y0, p.z);
        root.add(m);
        this._bobbers.push({ mesh: m, y0, phase: rng() * Math.PI * 2 });
      }
    }
    M.flush(root, mats, own);
  }

  _pillar(M, key, x, z, r, h, rng) {
    M.add(key, new THREE.CylinderGeometry(r, r, h * 0.7, 8), xform(x, h * 0.35, z));
    M.add(key, new THREE.CylinderGeometry(r * 1.3, r * 0.9, r * 0.4, 8), xform(x, h * 0.65, z));
    if (rng() > 0.6) {
      M.add(key, new THREE.BoxGeometry(r * 1.5, r * 0.3, r * 0.3),
        xform(x + r * 0.8, r * 0.3, z + r * 0.5, 1, 1, 1, 0, 0, rng() * 0.5));
    }
    this.obstacles.push({ x, z, r });
  }

  _tree(M, x, z, rng) {
    M.add('wood', new THREE.CylinderGeometry(0.25, 0.3, 3, 8), xform(x, 1.5, z));
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, hf = 0.3 + i * 0.15;
      M.add('wood', new THREE.CylinderGeometry(0.1, 0.05, 1.5, 6),
        xform(x + Math.cos(a) * 0.3, 2.5 + hf * 1.5, z + Math.sin(a) * 0.3, 1, 1, 1, 0, 0, 0.3 + rng() * 0.4));
    }
    this.obstacles.push({ x, z, r: 0.4 });
  }

  _crystalCluster(M, x, z, rng, glowKey) {
    M.add('rock', new THREE.IcosahedronGeometry(1, 0), xform(x, 0.3, z, 0.6, 0.4, 0.6));
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      M.add(glowKey, new THREE.OctahedronGeometry(1, 0),
        xform(x + Math.cos(a) * 0.5, 0.5 + rng(), z + Math.sin(a) * 0.5,
          0.4 + rng() * 0.3, 0.6 + rng() * 0.4, 0.4 + rng() * 0.3));
    }
    this.obstacles.push({ x, z, r: 0.7 });
  }

  _spire(M, key, x, z, r, h, rng) {
    M.add(key, new THREE.CylinderGeometry(r * 0.12, r, h, 6),
      xform(x, h / 2, z, 1, 1, 1, (rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12));
    this.obstacles.push({ x, z, r: r * 0.9 });
  }

  _rock(M, key, x, z, s, rng) {
    M.add(key, new THREE.IcosahedronGeometry(1, 0), xform(x, s * 0.4, z, s, s * (0.7 + rng() * 0.6), s));
    this.obstacles.push({ x, z, r: s * 0.95 });
  }

  // ------------------------------------------------------------------ runes, edge, debris

  _buildRunes(def, rng, root) {
    this._addRune(root, 0, 0, 3.5, def.runes[0], 0.6, rng);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const d = 15 + rng() * 40;
      const size = 1.5 + rng() * 1;
      const color = rng() > 0.5 ? def.runes[0] : def.runes[1];
      const op = 0.4 + rng() * 0.3;
      this._addRune(root, Math.cos(a) * d, Math.sin(a) * d, size, color, op, rng);
    }
  }

  _addRune(root, x, z, size, color, opacity, rng) {
    const mat = this._own(glowMaterial(color, 1.8, { transparent: true, opacity, additive: true }));
    mat.map = this._runeTex;
    const plane = new THREE.Mesh(GEO.plane, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.01, z);
    plane.scale.set(size * 2, size * 2, 1);
    root.add(plane);
    this._runes.push({ mat, base: opacity, phase: rng() * Math.PI * 2 });
  }

  // Arena edge: jagged cliffs and glowing barrier walls, styled per biome.
  _buildEdge(def, root) {
    const cliffMat = this._own(new THREE.MeshStandardMaterial({ color: def.cliff, roughness: 0.95, metalness: 0 }));
    const cliffs = this._own(new THREE.InstancedMesh(GEO.icosa, cliffMat, 20));
    const m = new THREE.Matrix4();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const sc = 3 + Math.random() * 2;
      const h = 4 + Math.random() * 3;
      m.compose(_p.set(Math.cos(a) * 65, h * 0.5, Math.sin(a) * 65), _q.identity(), _s.set(sc * 1.5, h, sc));
      cliffs.setMatrixAt(i, m);
    }
    root.add(cliffs);

    const wallMat = this._own(glowMaterial(def.wall, 1.2, { transparent: true, opacity: 0.35, additive: true, depthWrite: false }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, b = ((i + 1) / 8) * Math.PI * 2;
      const x = Math.cos(a) * 62, z = Math.sin(a) * 62;
      const nx = Math.cos(b) * 62, nz = Math.sin(b) * 62;
      const wall = new THREE.Mesh(GEO.plane, wallMat);
      wall.scale.set(Math.hypot(nx - x, nz - z), 8, 1);
      wall.position.set((x + nx) * 0.5, 4, (z + nz) * 0.5);
      wall.rotation.y = (a + b) * 0.5 + Math.PI / 2;
      root.add(wall);
    }
  }

  // Small stones scattered over the arena (one InstancedMesh per biome).
  _buildDebris(def, rng, root) {
    const mat = this._own(new THREE.MeshStandardMaterial({ color: def.debris, roughness: 0.95, metalness: 0 }));
    const count = 220;
    const inst = this._own(new THREE.InstancedMesh(GEO.icosa, mat, count));
    const m = new THREE.Matrix4();
    const p = this.game.player;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const x = -56 + rng() * 112, z = -56 + rng() * 112;
      if (Math.hypot(x, z) < 6) continue;
      if (p && Math.hypot(x - p.pos.x, z - p.pos.z) < 6) continue;
      const s = 0.1 + rng() * 0.2;
      m.compose(_p.set(x, s * 0.5, z), _q.identity(), _s.set(s, s, s));
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.receiveShadow = true;
    root.add(inst);
  }

  // ------------------------------------------------------------------ ambient particles

  _showAmbient(id) {
    if (this._amb) this.scene.remove(this._amb.points);
    let amb = this._ambCache[id];
    if (!amb) amb = this._ambCache[id] = this._buildAmbient(id);
    amb.vents = this._vents;
    this.scene.add(amb.points);
    this._amb = amb;
  }

  _buildAmbient(id) {
    const cfg = AMBIENT[id];
    let n = 0;
    for (const part of cfg.parts) n += part.count;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const lo = new Float32Array(n);
    const hi = new Float32Array(n);
    const sway = new Float32Array(n);
    const smoke = new Uint8Array(n);
    let i = 0;
    for (const part of cfg.parts) {
      for (let k = 0; k < part.count; k++, i++) {
        const i3 = i * 3;
        pos[i3] = (Math.random() * 2 - 1) * 28;
        pos[i3 + 1] = part.lo + Math.random() * (part.hi - part.lo);
        pos[i3 + 2] = (Math.random() * 2 - 1) * 28;
        vel[i3] = (Math.random() * 2 - 1) * part.vxz;
        vel[i3 + 1] = part.vy[0] + Math.random() * (part.vy[1] - part.vy[0]);
        vel[i3 + 2] = (Math.random() * 2 - 1) * part.vxz;
        col[i3] = part.color[0] * part.hdr;
        col[i3 + 1] = part.color[1] * part.hdr;
        col[i3 + 2] = part.color[2] * part.hdr;
        size[i] = part.size[0] + Math.random() * (part.size[1] - part.size[0]);
        phase[i] = Math.random() * Math.PI * 2;
        lo[i] = part.lo;
        hi[i] = part.hi;
        sway[i] = part.sway;
        smoke[i] = part.smoke ? 1 : 0;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 40 }, uOpacity: { value: cfg.opacity } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 6;
    return { id, points, geometry, material, count: n, pos, vel, phase, lo, hi, sway, smoke, vents: [] };
  }

  // Particles drift in a window around the player, so density follows the camera.
  _updateAmbient(dt, t) {
    const amb = this._amb;
    if (!amb) return;
    const p = this.game.player;
    const cx = p ? p.pos.x : 0, cz = p ? p.pos.z : 0;
    const P = amb.pos, V = amb.vel;
    const W = 28, WW = 56;
    for (let i = 0; i < amb.count; i++) {
      const i3 = i * 3;
      const sw = amb.sway[i] * Math.sin(t * 0.8 + amb.phase[i]) * dt;
      P[i3] += V[i3] * dt + sw;
      P[i3 + 1] += V[i3 + 1] * dt;
      P[i3 + 2] += V[i3 + 2] * dt + sw * 0.5;
      let dx = P[i3] - cx;
      dx -= Math.floor((dx + W) / WW) * WW;
      P[i3] = cx + dx;
      let dz = P[i3 + 2] - cz;
      dz -= Math.floor((dz + W) / WW) * WW;
      P[i3 + 2] = cz + dz;
      if (P[i3 + 1] > amb.hi[i]) {
        if (amb.smoke[i] && amb.vents.length) {
          const v = amb.vents[(Math.random() * amb.vents.length) | 0];
          P[i3] = v.x;
          P[i3 + 2] = v.z;
        }
        P[i3 + 1] = amb.lo[i];
      } else if (P[i3 + 1] < amb.lo[i]) {
        P[i3 + 1] = amb.hi[i];
      }
    }
    amb.geometry.attributes.position.needsUpdate = true;
    amb.material.uniforms.uScale.value = this.game.engine.pixelsPerUnit();
  }

  // Rune pulses, crystal pulses and bobbing fragments (every state).
  _animate(dt, t) {
    for (const r of this._runes) r.mat.opacity = r.base * (0.5 + 0.5 * Math.sin(t * 2 + r.phase));
    for (const c of this._crystals) c.mat.color.copy(c.base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 1.5 + c.phase));
    for (const b of this._bobbers) {
      b.mesh.position.y = b.y0 + Math.sin(t * 0.9 + b.phase) * 0.3;
      b.mesh.rotation.y += dt * 0.15;
    }
  }

  // ------------------------------------------------------------------ frame

  update(dt, time) {
    const game = this.game;
    this._animate(dt, time);
    this._updateAmbient(dt, time);
    this._animateShrine(dt, time);
    if (game.state !== 'playing') return;
    const p = game.player;
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
    // The playable arena is the circle inside the octagonal rift wall (inner radius ≈ 57).
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

  // ------------------------------------------------------------------ Rift Geodes

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
  }

  _makeGeode(el, pos, slot, hpMult) {
    const game = this.game;
    const color = ELEMENT_COLOR[el] ?? 0xffffff;
    const group = new THREE.Group();
    group.position.copy(pos);

    const base = new THREE.Mesh(GEO.icosa, GEODE_ROCK);
    base.scale.set(0.6, 0.4, 0.6);
    base.position.y = 0.3;

    const glowMat = glowMaterial(color, 1.7, { transparent: true, opacity: 1 });
    const crystals = new THREE.InstancedMesh(GEO.octa, glowMat, 3);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random() * 0.5;
      crystals.setMatrixAt(i, xform(
        Math.cos(a) * 0.45, 0.6 + Math.random() * 0.3, Math.sin(a) * 0.45,
        0.28 + Math.random() * 0.1, 0.55 + Math.random() * 0.3, 0.28 + Math.random() * 0.1,
        0, a, 0.15 * (Math.random() - 0.5)));
    }
    crystals.instanceMatrix.needsUpdate = true;

    const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    discMat.color.multiplyScalar(1.2);
    const disc = new THREE.Mesh(GEO.disc, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.scale.setScalar(1.3);
    disc.position.y = 0.03;

    group.add(base, crystals, disc); // 3 meshes
    game.scene.add(group);

    const baseCol = new THREE.Color(color).multiplyScalar(1.7);
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
      update: (dt) => {
        geode._t += dt;
        group.rotation.y += dt * 0.35;
        crystals.position.y = Math.sin(geode._t * 1.6 + ph) * 0.05;
        if (geode.flashT > 0) {
          geode.flashT -= dt;
          glowMat.color.setRGB(3, 3, 3);
        } else {
          glowMat.color.copy(baseCol).multiplyScalar(0.8 + 0.25 * Math.sin(geode._t * 2.4 + ph));
        }
      },
      flash: () => { geode.flashT = 0.08; },
      dispose: (g) => {
        if (geode._disposed) return;
        geode._disposed = true;
        g.scene.remove(group);
        crystals.dispose?.();
        glowMat.dispose();
        discMat.dispose();
      },
      onDeath: (g) => this._geodeBurst(geode, g),
    };
    return geode;
  }

  // Broken geode: elemental burst that hits every non-inert enemy within 4.5 u.
  _geodeBurst(geode, game) {
    const pos = geode.pos;
    const el = geode.element;
    const color = ELEMENT_COLOR[el] ?? 0xffffff;
    const act = ACTS[game.act] ?? ACTS[0];
    const R = GEODE_BURST_R;

    game.fx.flashDisc(pos, { color, radius: R, life: 0.3, hdr: 2 });
    game.fx.ring(pos, { color, radius: R, life: 0.45, width: 0.2, hdr: 3 });
    game.fx.burst(pos, { color, count: 30, speed: 9, life: 0.6, size: 0.4, up: 1.4, hdr: 3 });
    game.fx.light(pos, color, 60, 0.35, 16);
    game.fx.shake(0.2);

    const dmg = GEODE_BURST_DMG * act.hp;
    const hits = game.queryEnemies(pos, R, _tmpHits).slice();
    for (const e of hits) {
      if (e === geode || e.inert || e.dead) continue;
      if (distXZ(e.pos, pos) > R) continue;
      damageEnemy(game, e, dmg, { element: el, statusPower: 3, raw: true });
    }

    if (geode._slot) {
      geode._slot.geode = null;
      geode._slot.timer = GEODE_RESPAWN;
    }
    game.events.emit('geodeBroken', { element: el, pos: pos.clone() });
  }

  // ------------------------------------------------------------------ Shrines

  // Per-type shared materials and glyph texture (cached, never disposed).
  _shrineMatsFor(type) {
    let c = this._shrineMats[type];
    if (c) return c;
    const def = SHRINES[type];
    const cv = makeCanvas(128, 128);
    const g = cv.getContext('2d');
    g.strokeStyle = def.color;
    g.shadowColor = def.color;
    g.shadowBlur = 14;
    g.lineJoin = 'round';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
    const glyph = RUNE_GLYPHS[type];
    g.lineWidth = 4;
    g.beginPath();
    for (const poly of glyph.polys) {
      poly.forEach(([x, y], i) => { if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      if (glyph.closed) g.closePath();
    }
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const glyphMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    glyphMat.color.multiplyScalar(1.8);
    c = {
      glyph: glyphMat,
      ring: glowMaterial(def.hex, 1.4, { transparent: true, opacity: 0.8, additive: true, depthWrite: false }),
      prog: glowMaterial(def.hex, 2.2, { transparent: true, opacity: 1, additive: true, depthWrite: false }),
      beam: glowMaterial(def.hex, 0.7, { transparent: true, opacity: 0.06, additive: true, depthWrite: false, side: THREE.DoubleSide }),
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

    const plinth = new THREE.Mesh(GEO.cylinder, this._shrineStone);
    plinth.scale.set(1.1, 0.5, 1.1);
    plinth.position.y = 0.25;
    plinth.receiveShadow = true;

    const glyph = new THREE.Mesh(GEO.plane, c.glyph);
    glyph.scale.setScalar(1.5);
    glyph.position.y = 2.3;

    const ring = new THREE.Mesh(GEO.ring, c.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(SHRINE_CLAIM_R);
    ring.position.y = 0.05;

    // Progress ring: tiles appear as the claim fills (instance count, no allocation per frame).
    const prog = new THREE.InstancedMesh(GEO.box, c.prog, SHRINE_TILES);
    for (let i = 0; i < SHRINE_TILES; i++) {
      const a = (i / SHRINE_TILES) * Math.PI * 2;
      prog.setMatrixAt(i, xform(
        Math.cos(a) * SHRINE_CLAIM_R, 0.09, Math.sin(a) * SHRINE_CLAIM_R,
        0.26, 0.05, 0.12, 0, a + Math.PI / 2, 0));
    }
    prog.count = 0;

    const beam = new THREE.Mesh(GEO.cylinder, c.beam);
    beam.scale.set(0.9, 24, 0.9);
    beam.position.y = 12;

    group.add(plinth, glyph, ring, prog, beam);
    this.scene.add(group);
    this._sh = { group, glyph, ring, prog };

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
    this.shrine = null;
  }

  _animateShrine(dt, t) {
    const sh = this._sh, s = this.shrine;
    if (!sh || !s) return;
    sh.glyph.rotation.y += dt * 1.3;
    sh.glyph.position.y = 2.3 + Math.sin(t * 1.7) * 0.12;
    sh.ring.material.opacity = 0.55 + 0.25 * Math.sin(t * 3);
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

  // Act II lava vents / Act III lightning. Paused for a boss's first 3 seconds.
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
        this._handles.push(game.fx.telegraph(pt, 2.4, 1.2, { color: 0xff5a2a, onDone: () => this._erupt(pt, gen) }));
      }
    } else {
      for (let k = 0; k < STRIKE_COUNT; k++) {
        const pt = this._pointNear(p.pos, STRIKE_R, 1.2);
        this._handles.push(game.fx.telegraph(pt, 1.8, 1.0, { color: 0xb0d8ff, onDone: () => this._strike(pt, gen) }));
      }
    }
  }

  _erupt(pt, gen) {
    const game = this.game;
    if (gen !== this._gen || game.state !== 'playing') return;
    const act = ACTS[game.act] ?? ACTS[0];
    const fx = game.fx;
    fx.burst(pt, { color: 0xff7a2a, count: 26, speed: 8, life: 0.7, size: 0.45, up: 3, gravity: 9, hdr: 2.6 });
    fx.burst(pt, { color: 0xffd08a, count: 12, speed: 5, life: 0.4, size: 0.3, up: 4, gravity: 6, hdr: 2.6 });
    fx.flashDisc(pt, { color: 0xff5a2a, radius: 2.4, life: 0.35, hdr: 2.2 });
    fx.ring(pt, { color: 0xff5a2a, radius: 2.6, life: 0.35, width: 0.25 });
    fx.light(pt, 0xff5a2a, 70, 0.35, 12);
    fx.shake(0.15);

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
    fx.shake(0.1);

    const p = game.player;
    if (p && !p.dead && distXZ(p.pos, pt) <= 1.8) p.takeDamage(12 * act.dmg, HAZ_STORM);
    for (const e of game.queryEnemies(pt, 1.8, _tmpHits).slice()) {
      if (e.inert || e.dead || distXZ(e.pos, pt) > 1.8) continue;
      damageEnemy(game, e, 35 * act.hp, { element: 'storm', raw: true, noCrit: true });
    }
    game.events.emit('hazard', { kind: 'lightning', pos: pt.clone() });
  }

  // Crown: a brief sky flash every 6-12 s for atmosphere.
  _updateFlash(dt, p) {
    this._flashT -= dt;
    if (this._flashT > 0) return;
    this._flashT = 6 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2;
    const d = 6 + Math.random() * 14;
    this.game.fx.light({ x: p.pos.x + Math.cos(a) * d, y: 0, z: p.pos.z + Math.sin(a) * d }, 0xdff1ff, 110, 0.5, 40);
  }
}
