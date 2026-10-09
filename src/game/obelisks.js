import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, glowMaterial, distXZ } from '../core/utils.js';
import { blendAddMaterial, BLEND_ADD } from './fx.js';
import { patchEnv, mulberry32 } from './env/common.js';
import { prep, lump, paint } from './env/props.js';
import { ACT_LENGTH } from './acts.js';
import { AFFIXES, AFFIX_IDS } from './bosses/affixes.js';
import { xpForLevel } from './player.js';
import { rollRankCards, applyCard } from './progression.js';

// =====================================================================================
//  Rift Obelisks (v5): the player-controlled risk / reward layer for summoning a boss.
//  Spec: design/RAID_PASSES.md Pass 1 (numbers), design/RAID.md (contract), research/13 §4 (payouts).
//
//  Three monoliths rise at 0:50 of every act: Haste (summon now), Echo (the boss comes twice),
//  Wrath (up to 3 Heat = boss affixes). Standing inside a ring channels it; costs attach to the
//  ENCOUNTER (game.run.stakes, read by encounter.js), never to the clock. When any encounter starts
//  they all collapse.
//
//  Game API (unchanged stub contract): constructor(game), reset(), update(dt), collapse(), pullCenter().
//  HUD API:   obelisks.list  [{ type, pos, progress 0..1, channelling, armed, heat, nextAffix (def|null),
//                               state 'rising'|'idle'|'channel'|'spent'|'collapsing', def }]
//             obelisks.preview(type) → { title, cost: [lines], pay: [lines], levelsDelta? (Haste: net levels) ... }
//  Events:    obelisksRisen { obelisks }  obeliskChannel { obelisk, progress } (<= 10 Hz)
//             obeliskArmed { type, heat, affix }  obeliskCollapse {}  obeliskPayout { shards, parts, lines }
//             wrathCache { card }
// =====================================================================================

export const OBELISK_RISE_AT = 50;            // seconds into the act
const CHANNEL_R = 3.0;
const CHANNEL_TIME = 4.0;
const CHANNEL_DECAY = 0.25;                   // progress lost per second outside the ring
const HASTE_WARN = 3;                         // "THE HEART STIRS" (spawner beats wait while it runs: obelisks.summoning)
const RISE_T = 1.6, COLLAPSE_T = 1.1, RISE_STAGGER = 0.35;
const DEG = Math.PI / 180;
const PLACE_MIN = 20, PLACE_MAX = 32, PLACE_R = 48, MIN_SEP = 12, MIN_ANGLE = 100 * Math.PI / 180;
// placement passes, strictest first: bearing gap (rad), clearance from obstacles, and the camera-side canopy margin
const PASSES = [
  { ang: MIN_ANGLE, pad: 3.3, sh: 3.0 }, { ang: MIN_ANGLE, pad: 2.4, sh: 2.2 }, { ang: MIN_ANGLE, pad: 1.6, sh: 1.2 }, { ang: MIN_ANGLE, pad: 1.0, sh: 0 },
  { ang: 80 * DEG, pad: 1.0, sh: 0 }, { ang: 55 * DEG, pad: 1.0, sh: 0 }, { ang: 30 * DEG, pad: 0.8, sh: 0 },
];
const BODY_R = 0.9;                           // collision circle of the standing monolith
const TILES = 64;


// Payout tables (research/13 §4)
export const XP_BUDGET = [1100, 4000, 7100];  // XP an act yields by its boss (default path)
export const XP_BEFORE = [0, 1100, 5100];     // cumulative XP carried into each act
export const ACT_MULT = [1, 1.5, 2];
const WINDFALL = 0.4;                           // share of the XP still ahead
const ECHO_SHARDS = 25;                       // × ACT_MULT -> 25 / 38 / 50
const WRATH_SHARDS = [0, 8, 20, 45];          // total at heat N, × ACT_MULT
const PERK_SHARDS = 20;                       // final act: the run ends at the kill, so each chest / Cache perk pays this instead
const BOUNTY_PER_S = 0.25;
const F_TABLE = [[0, 0], [60, 0.23], [90, 0.38], [120, 0.56], [150, 0.77], [ACT_LENGTH, 1]];

// F(t): fraction of an act's XP collected by actTime t (piecewise linear through research/13's table).
export function xpFraction(t) {
  if (t <= 0) return 0;
  for (let i = 1; i < F_TABLE.length; i++) {
    if (t <= F_TABLE[i][0]) {
      const [t0, f0] = F_TABLE[i - 1], [t1, f1] = F_TABLE[i];
      return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
    }
  }
  return 1;
}
// Level reached with `cum` cumulative XP (no multipliers).
export function levelAtXP(cum) {
  let L = 1;
  while (cum >= xpForLevel(L) && L < 60) { cum -= xpForLevel(L); L++; }
  return L;
}

export const OBELISK_TYPES = {
  haste: { id: 'haste', name: 'Obelisk of Haste', title: 'Haste', tag: 'Summon now', color: '#bfefff', hex: 0xbfefff, icon: 'obeliskHaste', fallback: '»' },
  echo: { id: 'echo', name: 'Obelisk of Echo', title: 'Echo', tag: 'The boss comes twice', color: '#b08cff', hex: 0xa88cff, accent: 0x4ff0d0, icon: 'obeliskEcho', fallback: '◈' },
  wrath: { id: 'wrath', name: 'Obelisk of Wrath', title: 'Wrath', tag: 'Danger', color: '#ff7a33', hex: 0xff7a33, icon: 'obeliskWrath', fallback: '♨' },
};
const TYPE_IDS = ['haste', 'echo', 'wrath'];

export const freshStakes = () => ({
  haste: null, echo: false, heat: 0, affixes: [], bossHpMult: 1, bossDmgMult: 1,
  chest: { extra: 0, bossRelics: 0 }, echoChest: null, echoAffix: null, wrathCache: false,
});

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _col = new THREE.Color();
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };

// ------------------------------------------------------------------ shared assets (built once, never disposed)

let _stoneMat = null;
function stoneMaterial() {
  return _stoneMat ??= patchEnv(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'obeliskStone', wrap: true });
}
let _ringGeo = null, _ringDarkGeo = null;
const ringGeo = () => _ringGeo ??= new THREE.RingGeometry(0.93, 1, 72);
const ringDarkGeo = () => _ringDarkGeo ??= new THREE.RingGeometry(0.88, 1.04, 72);

// blendAddMaterial for InstancedMesh: a raw ShaderMaterial must apply instanceMatrix itself.
function instBlendAdd(color, o = {}) {
  const u = { uColor: { value: new THREE.Color(color).multiplyScalar(o.hdr ?? 1) }, uOcc: { value: o.occ ?? 0.35 }, uOpacity: { value: o.opacity ?? 1 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `void main() {
      #ifdef USE_INSTANCING
        mat4 im = instanceMatrix;
      #else
        mat4 im = mat4(1.0);
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * im * vec4(position, 1.0); }`,
    fragmentShader: 'uniform vec3 uColor; uniform float uOcc; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor * uOpacity, uOcc * uOpacity); }',
    transparent: true, depthWrite: false, depthTest: true, ...BLEND_ADD,
  });
  m.color = u.uColor.value;
  Object.defineProperty(m, 'opacity', { get: () => u.uOpacity.value, set: (v) => { u.uOpacity.value = v; }, configurable: true });
  return m;
}

let _bandGeo = null, _rimGeo = null, _beamGeo = null;
const bandGeo = () => _bandGeo ??= new THREE.TorusGeometry(1, 0.07, 5, 28);
const rimGeo = () => _rimGeo ??= new THREE.TorusGeometry(1, 0.03, 5, 48);
const beamGeo = () => _beamGeo ??= new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);   // open: soft edges come from the shader
// A faint light column: fades to nothing at the top and along its silhouette (blend-add: reads on bright ground).
function beamMaterial(hex) {
  const u = { uColor: { value: new THREE.Color(hex) }, uOpacity: { value: 0.2 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 1.8) * pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.05, vUv.y) * uOpacity;
        gl_FragColor = vec4(uColor * a * 2.5, a * 0.25); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND_ADD,
  });
  m.color = u.uColor.value;
  Object.defineProperty(m, 'opacity', { get: () => u.uOpacity.value, set: (v) => { u.uOpacity.value = v; }, configurable: true });
  return m;
}

const _geo = {};
// A tapered prism (shard) leaning by `lean` rad about Z then turned by `yaw`, standing at (x, y0, z).
function shard(rng, rt, rb, h, seg, lean, yaw, x, z, y0, wobble = 0.04) {
  const g = lump(prep(new THREE.CylinderGeometry(rt, rb, h, seg, 3)), wobble, rng);
  g.translate(0, h / 2, 0);
  g.rotateZ(-lean);
  g.rotateY(yaw);
  g.translate(x, y0, z);
  return g;
}
// A hexagonal crystal: prism body + pyramid cap, leaning by `lean` and turned by `yaw`, standing at (x, y0, z).
function crystal(rng, r, bodyH, capH, seg, lean, yaw, x, z, y0, taper = 0.84) {
  const body = prep(new THREE.CylinderGeometry(r * taper, r, bodyH, seg, 1)); body.translate(0, bodyH / 2, 0);
  const cap = prep(new THREE.ConeGeometry(r * taper, capH, seg, 1)); cap.translate(0, bodyH + capH / 2, 0);
  const g = mergeGeometries([body, cap]);
  body.dispose(); cap.dispose();
  lump(g, 0.035, rng);
  g.rotateZ(-lean); g.rotateY(yaw); g.translate(x, y0, z);
  return g;
}
function stoneGeometry(type) {
  if (_geo[type]) return _geo[type];
  const rng = mulberry32({ haste: 1117, echo: 2339, wrath: 3571 }[type]);
  const parts = [];
  const top = { haste: 0x6a5c48, echo: 0x4a5778, wrath: 0x4a3a34 }[type];
  // dais
  const dais = lump(prep(new THREE.CylinderGeometry(1.75, 2.0, 0.26, 8, 1)), 0.035, rng);
  dais.translate(0, 0.08, 0);
  parts.push(paint(dais, 0x2c2a36, 0x5a566a, rng, { ao: 0.25, jitter: 0.06, y0: -0.05, y1: 0.21 }));
  // standing stones marking the ring (outside r 3)
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3, r = CHANNEL_R + 0.55, h = 0.55 + rng() * 0.75;
    const st = lump(prep(new THREE.BoxGeometry(0.36, h, 0.26)), 0.08, rng);
    st.translate(0, h / 2 - 0.05, 0);
    st.rotateZ((rng() - 0.5) * 0.25);
    st.rotateY(-a + (rng() - 0.5) * 0.4);
    st.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(paint(st, 0x18161d, top, rng, { ao: 0.45, jitter: 0.07, y0: 0, y1: 1.3 }));
  }
  const y0 = 0.2;
  if (type === 'haste') {
    // tall obsidian spire; small satellites lean away from it
    parts.push(paint(shard(rng, 0.1, 0.8, 5.6, 5, 0, 0.4, 0, 0, y0, 0.03), 0x1a1724, 0x7468a0, rng, { ao: 0.5, jitter: 0.1, y0, y1: y0 + 5.6 }));
    for (const [rt, rb, h, lean, yaw, x, z] of [[0.02, 0.26, 1.9, 0.2, 0.5, 1.05, 0.5], [0.02, 0.22, 1.4, -0.22, 2.4, -0.9, -0.6], [0.02, 0.2, 1.1, 0.18, 4.2, -0.15, 1.1]]) {
      parts.push(paint(shard(rng, rt, rb, h, 5, lean, yaw, x, z, y0, 0.05), 0x1c1826, 0x6a5e90, rng, { ao: 0.5, jitter: 0.1, y0, y1: y0 + h }));
    }
  } else if (type === 'echo') {
    // twin offset crystal shards of violet-teal obsidian
    parts.push(paint(crystal(rng, 0.62, 3.6, 1.8, 6, 0.05, 0.2, -0.5, 0.5, y0), 0x1b1648, 0x4a9ab0, rng, { ao: 0.5, jitter: 0.11, y0, y1: y0 + 5.4 }));
    parts.push(paint(crystal(rng, 0.46, 2.6, 1.5, 6, -0.08, 1.1, 0.95, -0.4, y0), 0x1e1650, 0x6a6cc8, rng, { ao: 0.5, jitter: 0.11, y0, y1: y0 + 4.1 }));
    for (const [r, bh, ch, lean, yaw, x, z] of [[0.2, 0.7, 0.7, 0.3, 0.2, 0.55, 1.55], [0.16, 0.5, 0.5, -0.3, 2.0, 1.55, -1.05]]) {
      parts.push(paint(crystal(rng, r, bh, ch, 6, lean, yaw, x, z, y0), 0x1b1648, 0x3f8a9e, rng, { ao: 0.5, jitter: 0.1, y0, y1: y0 + bh + ch }));
    }
  } else {
    // jagged black crown: thick base + 7 uneven spikes
    const base = lump(prep(new THREE.CylinderGeometry(1.0, 1.3, 1.5, 8, 2)), 0.05, rng);
    base.translate(0, y0 + 0.75, 0);
    parts.push(paint(base, 0x0e0d12, 0x3a3234, rng, { ao: 0.5, jitter: 0.09, y0, y1: y0 + 1.5 }));
    const H = [6.2, 4.4, 5.3, 3.7, 4.9, 4.1, 4.7];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.25;
      parts.push(paint(shard(rng, 0.025, 0.3, H[i] - 1.1, 5, 0.16 + rng() * 0.08, -a + Math.PI / 2, Math.cos(a) * 0.78, Math.sin(a) * 0.78, y0 + 1.1, 0.06), 0x0e0d12, 0x302a2c, rng, { ao: 0.5, jitter: 0.08, y0: y0 + 1.1, y1: y0 + H[i] }));
    }
  }
  parts.forEach((p) => p.deleteAttribute('fl'));
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  _geo[type] = g;
  return g;
}

// ------------------------------------------------------------------ glow motes (one InstancedMesh per obelisk)
const MOTES = {
  haste: { n: 20, colors: [0xcfefff, 0xffffff], hdr: 1.8, size: 0.075, h: 6.8, r0: 0.45, r1: 1.5, v0: 0.5, v1: 1.1, sway: 0.25 },
  echo: { n: 16, colors: [0xb59cff, 0x5ff2d6], hdr: 1.6, size: 0.07, h: 5.4, r0: 0.5, r1: 1.7, v0: 0.2, v1: 0.5, sway: 0.5 },
  wrath: { n: 18, colors: [0xff8a3a, 0xffc060], hdr: 1.7, size: 0.065, h: 5.2, r0: 0.5, r1: 1.4, v0: 0.3, v1: 0.8, sway: 0.4 },
};
function makeMotes(type, rng) {
  const c = MOTES[type];
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  mat.color.multiplyScalar(c.hdr);
  const mesh = new THREE.InstancedMesh(GEO.octa, mat, c.n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const seeds = new Float32Array(c.n * 4);
  for (let i = 0; i < c.n; i++) {
    seeds[i * 4] = rng();                                  // phase
    seeds[i * 4 + 1] = rng() * Math.PI * 2;                // angle
    seeds[i * 4 + 2] = c.r0 + rng() * (c.r1 - c.r0);       // radius
    seeds[i * 4 + 3] = c.v0 + rng() * (c.v1 - c.v0);       // speed
    mesh.setColorAt(i, _col.set(c.colors[i % c.colors.length]));
  }
  return { mesh, seeds, cfg: c };
}
function updateMotes(M, time, gain, count) {
  const { mesh, seeds, cfg } = M;
  mesh.count = count ?? cfg.n;
  for (let i = 0; i < mesh.count; i++) {
    const ph = (seeds[i * 4] + time * seeds[i * 4 + 3] / cfg.h) % 1;
    const a = seeds[i * 4 + 1] + time * 0.35 * (i % 2 ? 1 : -1) + Math.sin(time + i) * cfg.sway * 0.4;
    const r = seeds[i * 4 + 2] * (0.7 + 0.5 * Math.sin(ph * Math.PI));
    const sc = cfg.size * Math.sin(ph * Math.PI) * gain;
    _p.set(Math.cos(a) * r, 0.4 + ph * cfg.h, Math.sin(a) * r);
    _q.identity();
    _s.setScalar(sc);
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------------ one obelisk's visuals

function buildVisuals(game, o) {
  const def = o.def, type = o.type;
  const rng = mulberry32(o.slot * 977 + 13);
  const root = new THREE.Group();
  root.position.copy(o.pos);
  const body = new THREE.Group();           // rises from / sinks into the ground
  const ground = new THREE.Group();         // ring, tiles, ticks (fade / scale in)
  root.add(body, ground);
  const mats = [];                          // { m, base: Color } glow materials the animation scales
  const own = [];                           // disposables
  const glow = (m, k = 1, body = false) => { mats.push({ m, base: m.color.clone(), k, body }); own.push(m); return m; };

  const stone = new THREE.Mesh(stoneGeometry(type), stoneMaterial());
  stone.castShadow = true; stone.receiveShadow = true;
  body.add(stone);
  // a thin lit rim around the dais: the obelisk's colour even from a distance
  const rim = new THREE.Mesh(rimGeo(), glow(glowMaterial(def.hex, 1.0), 1, true));
  rim.rotation.x = Math.PI / 2; rim.scale.setScalar(1.78); rim.position.y = 0.22;
  body.add(rim);

  const V ={ root, body, ground, mats, own, type, motes: null, parts: {} };
  const hex = def.hex;

  // ---- ring, underlay, fill, progress tiles, rune ticks, beam (shared)
  const ringMat = glow(blendAddMaterial(hex, { hdr: 1.4, occ: 0.55, opacity: 0.9 }));
  const ring = new THREE.Mesh(ringGeo(), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(CHANNEL_R); ring.position.y = 0.05; ring.renderOrder = 2;
  const under = new THREE.Mesh(ringDarkGeo(), new THREE.MeshBasicMaterial({ color: 0x0c0d12, transparent: true, opacity: 0.5, depthWrite: false }));
  own.push(under.material);
  under.rotation.x = -Math.PI / 2; under.scale.setScalar(CHANNEL_R); under.position.y = 0.03; under.renderOrder = 1;
  const fillMat = glow(blendAddMaterial(hex, { hdr: 1.0, occ: 0.0, opacity: 0.05 }));
  const fill = new THREE.Mesh(GEO.disc, fillMat);
  fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(CHANNEL_R - 0.05); fill.position.y = 0.04; fill.renderOrder = 1;
  const tileMat = glow(instBlendAdd(hex, { hdr: 2.0, occ: 0.6 }));
  const tiles = new THREE.InstancedMesh(GEO.box, tileMat, TILES);
  for (let i = 0; i < TILES; i++) {
    const a = (i / TILES) * Math.PI * 2;
    _p.set(Math.cos(a) * (CHANNEL_R - 0.36), 0.08, Math.sin(a) * (CHANNEL_R - 0.36)); _e.set(0, -a + Math.PI / 2, 0); _q.setFromEuler(_e); _s.set(0.26, 0.05, 0.13);
    tiles.setMatrixAt(i, _m4.compose(_p, _q, _s));
  }
  tiles.count = 0; tiles.renderOrder = 3; tiles.frustumCulled = false;
  const tickMat = glow(instBlendAdd(hex, { hdr: 1.3, occ: 0.4, opacity: 0.7 }));
  const NT = 24;
  const ticks = new THREE.InstancedMesh(GEO.box, tickMat, NT);
  for (let i = 0; i < NT; i++) {
    const a = (i / NT) * Math.PI * 2, long = i % 3 === 0;
    _p.set(Math.cos(a) * (CHANNEL_R + 0.28), 0.07, Math.sin(a) * (CHANNEL_R + 0.28)); _e.set(0, -a + Math.PI / 2, 0); _q.setFromEuler(_e); _s.set(0.06, 0.03, long ? 0.34 : 0.17);
    ticks.setMatrixAt(i, _m4.compose(_p, _q, _s));
  }
  ticks.renderOrder = 2; ticks.frustumCulled = false;
  const beamMat = glow(beamMaterial(hex), 0.35);
  const beam = new THREE.Mesh(beamGeo(), beamMat);
  beam.scale.set(0.9, 26, 0.9); beam.position.y = 13;
  ground.add(under, fill, ring, tiles, ticks);
  body.add(beam);
  own.push(tiles, ticks);
  Object.assign(V.parts, { ring, ringMat, fillMat, tiles, ticks, beam, beamMat, tileMat, tickMat });

  // ---- type-specific
  if (type === 'haste') {
    // three gold bands inlaid in the spire; lit one by one while channelling
    V.bands = [];
    [[1.5, 0.68], [2.7, 0.52], [3.9, 0.38]].forEach(([y, r]) => {
      const m = glow(glowMaterial(0xbfefff, 1.4), 1, true);
      const b = new THREE.Mesh(bandGeo(), m);
      b.rotation.x = Math.PI / 2; b.scale.set(r, r, 1.7); b.position.y = y;
      body.add(b); V.bands.push(m);
    });
    // floating hourglass crystal (two cones tip to tip) with a gold frame and halo
    const hg = new THREE.Group(); hg.position.y = 6.5;
    const crystalMat = glow(glowMaterial(0xdff6ff, 1.25), 1, true);
    const up = new THREE.Mesh(GEO.cone, crystalMat); up.rotation.x = Math.PI; up.scale.set(0.42, 0.62, 0.42); up.position.y = 0.31;
    const dn = new THREE.Mesh(GEO.cone, crystalMat); dn.scale.set(0.42, 0.62, 0.42); dn.position.y = -0.31;
    const frameM = glow(glowMaterial(0xffffff, 1.5), 1, true);
    const frame = new THREE.Mesh(GEO.torus, frameM); frame.scale.set(0.55, 0.55, 2); frame.rotation.x = Math.PI / 2;
    const halo = new THREE.Mesh(GEO.sphere, glow(blendAddMaterial(0xbfefff, { hdr: 1, occ: 0.05, opacity: 0.07 }), 1, true));
    halo.scale.setScalar(0.95);
    hg.add(up, dn, frame, halo);
    body.add(hg);
    V.hourglass = hg; V.frame = frame; V.halo = halo;
  } else if (type === 'echo') {
    // a faint ghost copy of the main shard flickers beside it
    const gm = glow(blendAddMaterial(0xa88cff, { hdr: 1.2, occ: 0.1, opacity: 0.28, side: THREE.DoubleSide }), 1, true);
    const gg = crystal(mulberry32(5), 0.62, 3.6, 1.8, 6, 0.05, 0.2, 0, 0, 0.2);
    const ghost = new THREE.Mesh(gg, gm);
    ghost.position.set(-1.35, 0, 1.35);
    body.add(ghost); own.push(gg);
    V.ghost = ghost; V.ghostMat = gm;
    // teal seam bands + orbiting shards
    V.bands = [];
    [[1.7, 0.6], [3.1, 0.54]].forEach(([y, r]) => {
      const m = glow(glowMaterial(0x4ff0d0, 1.5), 1, true);
      const b = new THREE.Mesh(bandGeo(), m);
      b.position.set(-0.5 + y * 0.049, y, 0.5 - y * 0.01); b.rotation.x = Math.PI / 2; b.scale.set(r, r, 1.7);
      body.add(b); V.bands.push(m);
    });
    const orbit = new THREE.Group(); orbit.position.y = 5.0;
    const om = glow(glowMaterial(0xa88cff, 1.8), 1, true);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(GEO.octa, om); s.scale.set(0.12, 0.24, 0.12);
      const a = (i / 3) * Math.PI * 2; s.position.set(Math.cos(a) * 0.95, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.95);
      orbit.add(s);
    }
    body.add(orbit); V.orbit = orbit;
  } else {
    // three sigil pips on the crown's base (facing the camera, +X +Z); ember cracks
    V.pips = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x3a1408 }); own.push(m);
      const a = Math.PI / 4 + (i - 1) * 0.62;
      const pip = new THREE.Mesh(GEO.octa, m);
      pip.scale.set(0.17, 0.3, 0.07);
      pip.position.set(Math.cos(a) * 1.22, 1.1, Math.sin(a) * 1.22);
      pip.rotation.y = -a + Math.PI / 2;
      const rim = new THREE.Mesh(GEO.octa, new THREE.MeshBasicMaterial({ color: 0x0a0809 })); own.push(rim.material);
      rim.scale.set(0.24, 0.38, 0.05); rim.position.set(Math.cos(a) * 1.17, 1.1, Math.sin(a) * 1.17); rim.rotation.y = pip.rotation.y;
      body.add(rim, pip);
      V.pips.push(m);
    }
    V.cracks = glow(blendAddMaterial(0xff6a1a, { hdr: 0.8, occ: 0.0, opacity: 0.7 }), 1, true);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5, h = 0.5 + (i % 3) * 0.28;
      const c = new THREE.Mesh(GEO.box, V.cracks);
      c.scale.set(0.045, h, 0.045);
      c.position.set(Math.cos(a) * (1.12 - 0.0), 0.5 + (i % 2) * 0.35 + h / 2 - 0.2, Math.sin(a) * 1.12);
      c.rotation.set((i - 2) * 0.05, 0, (i % 2 ? 0.12 : -0.12));
      body.add(c);
    }
  }
  V.motes = makeMotes(type, rng);
  body.add(V.motes.mesh); own.push(V.motes.mesh, V.motes.mesh.material);

  root.visible = false;
  game.scene.add(root);
  return V;
}

function disposeVisuals(game, V) {
  if (!V) return;
  game.scene.remove(V.root);
  for (const d of V.own) d.dispose?.();
}

// ------------------------------------------------------------------ the director

export class Obelisks {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._cachePending = false;
    this._hasteT = 0;
    this._risen = false;
    this._payout = { haste: 0, echo: 0, wrath: 0 };
    this._time = 0;
    this._lastEmit = 0;
    if (game.run) game.run.stakes = freshStakes();

    const ev = game.events;
    ev.on('runStart', () => this.reset());
    ev.on('actStart', () => this._newAct());
    ev.on('encounterStart', (e) => this._onEncounterStart(e));
    ev.on('encounterEnd', (e) => { if (e?.victory) this._onEncounterEnd(); });
  }

  get stakes() {
    const run = this.game.run;
    return run.stakes ??= freshStakes();
  }

  // ------------------------------------------------------------------ lifecycle

  reset() {
    this._clear();
    this._risen = false;
    this._hasteT = 0;
    this._cachePending = false;
    this._payout = { haste: 0, echo: 0, wrath: 0 };
    if (this.game.run) this.game.run.stakes = freshStakes();
  }

  _newAct() {
    this._clear();
    this._risen = false;
    this._hasteT = 0;
    this._payout = { haste: 0, echo: 0, wrath: 0 };
    this.game.run.stakes = freshStakes();
  }

  _clear() {
    const w = this.game.world;
    for (const o of this.list) {
      this._removeObstacle(o);
      disposeVisuals(this.game, o.vis);
      w?._env?.setClearing?.(o.slot, 0, 0, 0, 0);
    }
    this.list = [];
  }

  _removeObstacle(o) {
    if (!o.obstacle) return;
    const obs = this.game.world?.obstacles;
    const i = obs ? obs.indexOf(o.obstacle) : -1;
    if (i >= 0) obs.splice(i, 1);
    o.obstacle = null;
    this.game.world?._env?.setClearing?.(o.slot, 0, 0, 0, 0);
  }

  // Encounter started (timer, Haste, dev): every obelisk collapses, an unfinished Haste warning is void.
  collapse() {
    if (!this.list.length && !this._hasteT) return;
    this._hasteT = 0;
    let any = false;
    for (const o of this.list) {
      if (o.state === 'collapsing') continue;
      any = true;
      o.state = 'collapsing'; o.t = 0; o.channelling = false; o.progress = Math.min(o.progress, 1);
      this._removeObstacle(o);
      const fx = this.game.fx;
      fx.burst(o.pos, { color: 0x4a4350, count: 14, speed: 5, life: 0.8, size: 0.45, up: 4, gravity: 14, blend: 'normal' });
      fx.burst(o.pos, { color: 0x6a5a48, count: 16, speed: 3.5, life: 1.1, size: 0.9, up: 2.5, gravity: 3, blend: 'normal' });
    }
    if (any) this.game.events.emit('obeliskCollapse', {});
  }

  // Rift Pull (spawner): while a channel is running, packs converge on that obelisk.
  pullCenter() {
    for (const o of this.list) if (o.channelling && o.state === 'channel') return o.pos;
    return null;
  }

  get(type) { return this.list.find((o) => o.type === type) ?? null; }

  // ------------------------------------------------------------------ rising

  _rise() {
    const g = this.game;
    this._risen = true;
    const placed = this._place();
    // Wrath's affixes are rolled now and shown before any channel (no duplicates, no re-rolls).
    const ids = AFFIX_IDS.slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    TYPE_IDS.forEach((type, i) => {
      const def = OBELISK_TYPES[type];
      const pos = placed[i];
      const o = {
        type, def, slot: i + 1, pos, progress: 0, channelling: false, armed: false, heat: 0,
        nextAffix: null, queue: type === 'wrath' ? ids.slice(0, 3) : null, state: 'rising', t: -i * RISE_STAGGER,
        obstacle: null, vis: null, _press: 0, _scanT: 0, _emitT: 0, _dust: false, _done: false,
      };
      o.nextAffix = o.queue ? AFFIXES[o.queue[0]] : null;
      o.vis = buildVisuals(g, o);
      o.obstacle = { x: pos.x, z: pos.z, r: BODY_R, obelisk: true };
      g.world.obstacles.push(o.obstacle);
      g.world._env?.setClearing?.(o.slot, pos.x, pos.z, CHANNEL_R + 0.9, 1);
      this.list.push(o);
    });
    g.events.emit('obelisksRisen', { obelisks: this.list });
    g.events.emit('announce', { kind: 'obelisk', text: 'THE RIFT OFFERS', sub: 'Three obelisks have risen. Take what you dare.', color: '#bfefff' });
  }

  // 20-32 u from the player, >= 100 deg apart (bearing), >= 12 u from each other, inside r 48, clear of obstacles.
  _place() {
    const g = this.game, w = g.world, c = g.player.pos;
    const placed = [];
    const blocked = (x, z, pad) => {
      for (const ob of w.obstacles) if (Math.hypot(x - ob.x, z - ob.z) < ob.r + pad) return true;
      return false;
    };
    // the iso camera sits at +X +Z: a canopy on that side hides the monolith, so keep that line of sight clear
    const shadowed = (x, z, m) => {
      for (const ob of w.obstacles) {
        const dx = ob.x - x, dz = ob.z - z, along = (dx + dz) * Math.SQRT1_2, perp = Math.abs(dx - dz) * Math.SQRT1_2;
        if (along > 1.0 && along < 9 && perp < ob.r + m) return true;
      }
      return false;
    };
    const shrine = w.shrine?.pos;
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      let found = null;
      for (let pass = 0; pass < PASSES.length && !found; pass++) {
        const { ang: minAng, pad, sh } = PASSES[pass];
        for (let a = 0; a < 70 && !found; a++) {
          // first tries spread the three evenly around the player, later ones go anywhere
          const ang = a < 24 ? base + (i / 3) * Math.PI * 2 + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
          const d = PLACE_MIN + Math.random() * (PLACE_MAX - PLACE_MIN);
          const x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
          if (Math.hypot(x, z) > PLACE_R) continue;
          if (blocked(x, z, pad) || (sh > 0 && shadowed(x, z, sh))) continue;
          if (shrine && Math.hypot(x - shrine.x, z - shrine.z) < 8) continue;
          if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < MIN_SEP || angDiff(q.ang, ang) < minAng)) continue;
          found = { x, z, ang };
        }
      }
      if (!found) {
        const f = w.randomSpawnPoint(c, 14, 30);
        found = { x: f.x, z: f.z, ang: Math.atan2(f.z - c.z, f.x - c.x) };
      }
      placed.push(found);
    }
    return placed.map((q) => new THREE.Vector3(q.x, 0, q.z));
  }

  // ------------------------------------------------------------------ frame

  // true during Haste's 3 s warning (spawner holds its beats)
  get summoning() { return this._hasteT > 0; }

  update(dt) {
    const g = this.game;
    this._time += dt;
    const p = g.player;
    if (!p) return;

    if (!this._risen && g.phase === 'horde' && !g.encounter?.active && !p.dead && g.actTime >= OBELISK_RISE_AT && g.actTime < ACT_LENGTH - 15) this._rise();

    if (this._hasteT > 0) {
      this._hasteT -= dt;
      if (this._hasteT <= 0) { this._hasteT = 0; this._summonHaste(); }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      this._step(o, dt, p);
      this._animate(o, dt);
      if (o.state === 'collapsing' && o.t >= COLLAPSE_T) {
        disposeVisuals(g, o.vis); o.vis = null;
        this.list.splice(i, 1);
      }
    }

    // Wrath Cache: opened late in the victory beat (after the score's resolution), never in the final act
    if (this._cachePending && g.state === 'playing') {
      const E = g.encounter;
      if ((E.state === 'victory' && E.t >= 1.6) || (!E.active && E.state === 'idle')) this._openCache();
    }
  }

  _step(o, dt, p) {
    o.t += dt;
    if (o.state === 'rising') {
      if (o.t >= 0 && !o._dust) {
        o._dust = true;
        const fx = this.game.fx;
        fx.burst(o.pos, { color: 0x7a6a56, count: 22, speed: 4, life: 1.1, size: 0.9, up: 3, gravity: 3, blend: 'normal' });
        fx.burst(o.pos, { color: 0x3a3642, count: 10, speed: 5, life: 0.7, size: 0.4, up: 5, gravity: 14, blend: 'normal' });
        fx.shake(0.22);
      }
      if (o.t >= RISE_T) {
        o.state = 'idle';
        this.game.fx.ring(o.pos, { color: o.def.hex, radius: CHANNEL_R + 1.2, life: 0.5, width: 0.15 });
      }
      return;
    }
    if (o.state === 'collapsing') return;
    if (o.state === 'spent') { o.channelling = false; return; }

    const g = this.game;
    const usable = !g.encounter?.active && g.phase === 'horde' && !p.dead;
    const near = usable && distXZ(p.pos, o.pos) <= CHANNEL_R;
    if (o.needExit && !near) o.needExit = false;   // Wrath: stepped out, the next heat may start
    const inside = near && !o.needExit;
    const prev = o.progress;
    o.channelling = inside;
    o.state = inside ? 'channel' : 'idle';
    o.progress = inside ? Math.min(1, o.progress + dt / CHANNEL_TIME) : Math.max(0, o.progress - CHANNEL_DECAY * dt);

    // pressure: foes standing in the ring make it flicker white
    o._scanT -= dt;
    if (o._scanT <= 0) {
      o._scanT = 0.25;
      let n = 0;
      for (const e of g.queryEnemies(o.pos, CHANNEL_R, [])) { if (!e.inert && !e.dead && distXZ(e.pos, o.pos) <= CHANNEL_R) { n = 1; break; } }
      o._pressT = n;
    }

    o._emitT -= dt;
    if ((inside || o.progress < prev) && o.progress > 0 && o._emitT <= 0) {
      o._emitT = 0.1;
      g.events.emit('obeliskChannel', { obelisk: o, progress: o.progress });
    }
    if (o.progress >= 1 && usable) this._complete(o);
  }

  // ------------------------------------------------------------------ completing a channel

  _complete(o) {
    const g = this.game, st = this.stakes, mult = ACT_MULT[g.act] ?? 1, final = g.act >= 2;
    const fx = g.fx, hex = o.def.hex;
    o.channelling = false;
    fx.ring(o.pos, { color: hex, radius: 7, life: 0.6, width: 0.2, hdr: 3 });
    fx.burst(o.pos, { color: hex, count: 36, speed: 7, life: 0.8, size: 0.4, up: 3, hdr: 2.5 });
    fx.light(o.pos, hex, 90, 0.5, 16);
    fx.shake(0.3);
    let affix = null;

    if (o.type === 'haste') {
      o.armed = true; o.state = 'spent'; o.progress = 1;
      this._hasteT = HASTE_WARN;
      g.events.emit('announce', { kind: 'obelisk', text: 'THE HEART STIRS', sub: 'The boss comes in 3 seconds', color: '#bfefff' });
    } else if (o.type === 'echo') {
      o.armed = true; o.state = 'spent'; o.progress = 1;
      st.echo = true;
      st.echoChest = { pool: 'boss', choices: 3 };
      this._payout.echo = Math.round(ECHO_SHARDS * mult) + (final ? PERK_SHARDS : 0);
      g.events.emit('announce', { kind: 'obelisk', text: 'ECHO ARMED', sub: 'The boss will come twice. You take +10% damage.', color: '#b08cff' });
    } else {
      o.heat++;
      const id = o.queue[o.heat - 1];
      affix = AFFIXES[id];
      st.heat = o.heat;
      st.affixes.push(id);
      if (o.heat >= 2) st.bossHpMult = o.heat >= 3 ? 1.3 : 1.15;
      if (o.heat >= 3) st.bossDmgMult = 1.1;
      if (o.heat === 1) st.chest.extra += 1;
      if (o.heat >= 2) { st.wrathCache = true; }
      if (o.heat >= 3) st.chest.bossRelics = 1;
      this._payout.wrath = this._wrathShards(o.heat);
      o.armed = true;
      o.progress = 0;
      o.needExit = o.heat < 3;               // step out of the ring and back in before the next channel
      o.nextAffix = o.heat < 3 ? AFFIXES[o.queue[o.heat]] : null;
      o.state = o.heat >= 3 ? 'spent' : 'idle';
      if (o.heat >= 3) o.progress = 1;
      o._flash = 1;
      g.events.emit('announce', { kind: 'obelisk', text: `WRATH ${'I'.repeat(o.heat)}`, sub: `${affix.name}: ${affix.desc}`, color: '#ff7a33' });
    }
    fx.text(o.pos, o.def.title.toUpperCase() + (o.type === 'wrath' ? ` ${o.heat}` : ''), o.def.color, true);
    g.events.emit('obeliskArmed', { type: o.type, heat: o.type === 'wrath' ? o.heat : 0, affix: affix ? affix.id : null });
  }

  // Wrath total at `heat` (x act mult). Final act: each heat's chest / Cache perk becomes PERK_SHARDS (the run ends at the kill).
  _wrathShards(heat, act = this.game.act) {
    return Math.round(WRATH_SHARDS[heat] * (ACT_MULT[act] ?? 1)) + (act >= 2 ? PERK_SHARDS * heat : 0);
  }

  _summonHaste() {
    const g = this.game, st = this.stakes;
    const skipped = Math.max(0, Math.round(ACT_LENGTH - g.actTime));
    st.haste = { at: Math.round(g.actTime), skipped };
    if (!g.encounter.summon('haste')) st.haste = null;
  }

  // ------------------------------------------------------------------ payouts

  _hasteMath(t = this.game.actTime, act = this.game.act) {
    const B = XP_BUDGET[act] ?? 1100, base = XP_BEFORE[act] ?? 0, F = xpFraction(t);
    const ahead = B * (1 - F), windfall = Math.round(WINDFALL * ahead);
    const Lend = levelAtXP(base + B), Lnow = levelAtXP(base + B * F), Lhaste = levelAtXP(base + B * F + windfall);
    return { skipped: Math.max(0, Math.round(ACT_LENGTH - t)), ahead: Math.round(ahead), windfall, levelsSkipped: Lend - Lnow, levelsBack: Lhaste - Lnow, levelsDelta: Lhaste - Lend };
  }

  _onEncounterStart({ reason } = {}) {
    const g = this.game, st = this.stakes;
    this.collapse();
    if (reason === 'haste' && st.haste) {
      const mult = ACT_MULT[g.act] ?? 1;
      const m = this._hasteMath(ACT_LENGTH - st.haste.skipped, g.act);
      st.chest.extra += 1;                                                    // Quick Chest: 4 relics instead of 3
      // Haste bonus shards (paid on victory); none in the final act
      this._payout.haste = g.act >= 2 ? 0 : Math.round(BOUNTY_PER_S * st.haste.skipped * mult);
      // Windfall XP: a burst of gems that flies straight to the player (level-up hands follow)
      const n = 6;
      for (let i = 0; i < n; i++) g.pickups.spawnXP(g.player.pos, m.windfall / n);
      g.pickups.magnetAll();
      g.fx.text(g.player.pos, `+${m.windfall} XP`, '#bfefff', true);
      st.haste.windfall = m.windfall;
    }
  }

  _onEncounterEnd() {
    const g = this.game, st = this.stakes;
    const parts = { ...this._payout };
    const total = parts.haste + parts.echo + parts.wrath;
    if (total > 0) {
      g.stats.obeliskShards = (g.stats.obeliskShards ?? 0) + total;
      const lines = [];
      if (parts.haste) lines.push({ type: 'haste', text: `Haste bonus +${parts.haste}`, shards: parts.haste });
      if (parts.echo) lines.push({ type: 'echo', text: `Echo bonus +${parts.echo}`, shards: parts.echo });
      if (parts.wrath) lines.push({ type: 'wrath', text: `Wrath bonus +${parts.wrath}`, shards: parts.wrath });
      g.events.emit('obeliskPayout', { shards: total, parts, lines });
    }
    this._payout = { haste: 0, echo: 0, wrath: 0 };
    if (st.wrathCache && g.act < 2) this._cachePending = true;
  }

  _openCache() {
    const g = this.game;
    this._cachePending = false;
    const cards = rollRankCards(g, 3);
    g.state = 'levelup';
    g.ui.levelUpTip = 'Wrath Cache: +1 rank to a skill you own.';
    g.ui.showLevelUp(cards, (card) => {
      applyCard(g, card);
      g.ui.hideLevelUp();
      g.state = 'playing';
      g.events.emit('wrathCache', { card });
    }, { rerolls: 0, banishes: 0 }, { index: 1, total: 1, title: 'WRATH CACHE' });
  }

  // ------------------------------------------------------------------ HUD preview

  // { title, cost: [lines], pay: [lines], levelsDelta? } — computed live from the act clock and the stakes.
  preview(type) {
    const g = this.game, mult = ACT_MULT[g.act] ?? 1, t = g.actTime, final = g.act >= 2;
    const def = OBELISK_TYPES[type];
    if (!def) return null;
    const o = this.get(type);
    const WIN = 'Paid only if you win the boss fight';
    const perk = (txt) => (final ? `${txt}: becomes ≈ +${PERK_SHARDS} shards (the run ends at the kill)` : txt);
    if (type === 'haste') {
      const m = this._hasteMath();
      const beats = [t < 90 ? 'Elite Surge' : null, t < 135 ? 'Swarm' : null].filter(Boolean);
      const net = Math.abs(m.levelsDelta);
      const p = this.game.player;
      const lowHp = !!p && p.stats.maxHp > 0 && p.hp / p.stats.maxHp < 0.4;
      return {
        title: def.name, tag: def.tag, levelsDelta: m.levelsDelta, skipped: m.skipped, windfall: m.windfall,
        cost: [
          m.skipped > 8 ? `Skips ${m.skipped} s of horde${beats.length ? ` (${beats.join(', ')})` : ''}` : 'Skips almost nothing',
          net > 0 ? `≈ net −${net} level${net === 1 ? '' : 's'} by the boss` : '≈ no levels lost by the boss',
          ...(lowHp ? ['Low HP: the boss arrives now'] : []),
        ],
        pay: [
          `+${m.windfall} XP right away`,
          final ? 'No shard bounty in the final act' : `≈ +${Math.round(BOUNTY_PER_S * m.skipped * mult)} shards`,
          ...(final ? [] : ['Boss chest: choose from 4 relics instead of 3']),
          WIN,
        ],
      };
    }
    if (type === 'echo') {
      return {
        title: def.name, tag: def.tag,
        cost: ['You take +10% damage for the whole fight', 'The boss rises again as an Echo (55% HP, starts at Phase 2)'],
        pay: [
          'Before the Echo: heal 20% and refill your dash',
          ...(final ? [perk('Echo Chest: pick 1 of 3 Boss Relics')] : ['Echo Chest: pick 1 of 3 Boss Relics']),
          `≈ +${Math.round(ECHO_SHARDS * mult) + (final ? PERK_SHARDS : 0)} shards`,
          WIN,
        ],
      };
    }
    const heat = o?.heat ?? 0, h = heat + 1;
    const note = o?.needExit && o.channelling === false && this.game.player && distXZ(this.game.player.pos, o.pos) <= CHANNEL_R ? 'Step out and back in to raise it again' : null;
    if (heat >= 3) return { title: def.name, tag: def.tag, heat, cost: ['Max level reached (3 of 3)'], pay: [`≈ +${this._wrathShards(3)} shards in total`, WIN] };
    const aff = o?.nextAffix ?? AFFIXES[AFFIX_IDS[0]];
    const perkLine = h === 1 ? 'Boss chest: choose from 4 relics instead of 3' : h === 2 ? 'Wrath Cache: +1 rank to a skill you own' : 'Boss chest: one of the choices is a Boss Relic';
    return {
      title: def.name, tag: def.tag, heat, nextAffix: aff, note,
      cost: [
        ...(note ? [note] : []),
        `Boss gets harder: ${aff.name} (${aff.desc})`,
        ...(h === 2 ? ['Boss HP +15%'] : h === 3 ? ['Boss HP +30%, damage +10%'] : []),
        'Packs converge on you while you channel',
      ],
      pay: [
        perk(perkLine),
        `≈ ${this._wrathShards(h)} shards in total at level ${h}`,
        WIN,
      ],
    };
  }


  // ------------------------------------------------------------------ visuals

  _animate(o, dt) {
    const V = o.vis;
    if (!V) return;
    const time = this._time, P = V.parts, def = o.def;
    // ---- rise / collapse envelope
    let vis = 1, sink = 0, shake = 0;
    if (o.state === 'rising') {
      const k = clamp01(o.t / RISE_T);
      vis = o.t < 0 ? 0 : 1;
      sink = (1 - ease(k)) * 8.5;
      shake = (1 - k) * 0.05;
    } else if (o.state === 'collapsing') {
      const k = clamp01(o.t / COLLAPSE_T);
      sink = k * k * 8.5;
      shake = (1 - k) * 0.09;
    }
    V.root.visible = vis > 0;
    V.body.position.set(shake ? Math.sin(time * 61) * shake : 0, -sink, shake ? Math.cos(time * 57) * shake : 0);
    const gk = o.state === 'rising' ? clamp01(o.t / RISE_T) : o.state === 'collapsing' ? 1 - clamp01(o.t / (COLLAPSE_T * 0.7)) : 1;
    V.ground.scale.setScalar(0.55 + 0.45 * ease(Math.max(0, gk)));
    const spentK = o.state === 'spent' && !(o.type === 'haste' && this._hasteT > 0) ? 1 : 0;

    // ---- glow level
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + o.slot);
    const chan = o.channelling ? 1 : 0;
    V._chan = lerp(V._chan ?? 0, chan, Math.min(1, dt * 6));
    V._flash = Math.max(0, (V._flash ?? 0) - dt * 2); if (o._flash) { V._flash = o._flash; o._flash = 0; }
    let warn = 0;
    if (o.type === 'haste' && this._hasteT > 0) warn = 0.5 + 0.5 * Math.sin(time * 16);
    let g = 0.8 + 0.2 * pulse + 1.4 * o.progress * (o.state === 'spent' ? 0 : 1) + 0.9 * V._chan + 1.2 * V._flash + (o.armed ? 0.5 : 0) + 1.5 * warn;
    if (o.state === 'collapsing') g *= clamp01(1 - o.t / (COLLAPSE_T * 0.6));
    const dimSpent = o.state === 'spent' && !o.armed ? 0.35 : 1;
    let gb = 0.85 + 0.15 * pulse + 0.7 * o.progress * (o.state === 'spent' ? 0 : 1) + 0.25 * V._chan + 0.9 * V._flash + (o.armed ? 0.3 : 0) + 1.2 * warn;
    if (o.state === 'collapsing') gb *= clamp01(1 - o.t / (COLLAPSE_T * 0.6));
    for (const { m, base, k, body } of V.mats) m.color.copy(base).multiplyScalar((body ? gb : g) * k * dimSpent);

    // ---- ring state
    V._press = lerp(V._press ?? 0, o._pressT ?? 0, Math.min(1, dt * 5));
    const ringOp = o.state === 'collapsing' ? Math.max(0, 1 - o.t / (COLLAPSE_T * 0.6)) : spentK ? (o.armed ? 0.55 : 0.25) : (0.65 + 0.3 * pulse) * (0.75 + 0.25 * V._chan);
    P.ringMat.opacity = ringOp;
    P.tickMat.opacity = 0.6 * ringOp;
    P.fillMat.opacity = (0.03 + 0.09 * o.progress) * (o.state === 'collapsing' ? 0 : 1);
    P.beamMat.opacity = 0.2 * (0.7 + 0.3 * pulse) * (o.state === 'collapsing' ? Math.max(0, 1 - o.t / 0.4) : 1) * (o.state === 'rising' ? clamp01(o.t / RISE_T) : 1) * (spentK && !o.armed ? 0.4 : 1);
    // pressure: a foe inside the ring makes it flicker white (never red: red is reserved for hostile telegraphs)
    if (V._press > 0.02) {
      _col.set(0xffffff).multiplyScalar(1.6);
      const k = V._press * (0.45 + 0.35 * Math.sin(time * 18));
      P.ringMat.color.lerp(_col, k);
      P.tickMat.color.lerp(_col, k * 0.7);
    }
    P.ticks.rotation.y = time * (0.12 + 0.5 * V._chan);
    P.tiles.count = o.state === 'collapsing' ? 0 : Math.round(clamp01(o.progress) * TILES);

    // ---- type specifics
    if (o.type === 'haste') {
      const sp = 0.8 + o.progress * 5 + (warn ? 8 : 0);
      V.hourglass.rotation.y += dt * sp;
      V.hourglass.position.y = 6.5 + Math.sin(time * 1.6) * 0.14;
      V.hourglass.scale.setScalar(1 + 0.08 * V._chan + 0.14 * warn + 0.2 * V._flash);
      V.frame.rotation.z += dt * 1.2;
      const lit = o.armed ? 3 : o.progress * 3;
      V.bands.forEach((m, i) => { const on = clamp01(lit - i); m.userData.k = 0.25 + 0.75 * on; });
    } else if (o.type === 'echo') {
      // the ghost flickers; armed, it settles into a steady second image
      const f = o.armed ? 0.55 : (Math.sin(time * 19 + 1.3) > 0.35 ? 0.1 : 0.5) * (0.6 + 0.4 * Math.sin(time * 7));
      V.ghostMat.opacity = (0.16 + 0.2 * f + 0.35 * o.progress) * (o.state === 'collapsing' ? ringOp : 1) * (o.state === 'rising' ? 0.4 : 1);
      const jit = o.armed ? 0.02 : 0.06 * Math.sin(time * 23);
      V.ghost.position.set(-1.35 + jit, 0.0, 1.35 - jit);
      V.orbit.rotation.y += dt * (0.7 + 3.5 * o.progress + (o.armed ? 1.5 : 0));
      const lit = o.armed ? 2 : o.progress * 2;
      V.bands.forEach((m, i) => { m.userData.k = 0.3 + 0.7 * clamp01(lit - i); });
    } else {
      // sigil pips: lit per heat; the next one smoulders while channelling
      for (let i = 0; i < 3; i++) {
        const m = V.pips[i];
        if (i < o.heat) m.color.setRGB(2.2 + 0.4 * pulse, 0.55 + 0.15 * pulse, 0.12);
        else if (i === o.heat) { const k = 0.1 + 0.9 * o.progress; m.color.setRGB(0.1 + 1.7 * k, 0.04 + 0.35 * k, 0.02 + 0.05 * k); }
        else m.color.setRGB(0.1, 0.04, 0.02);
      }
      V.cracks.color.setRGB(1.0, 0.42, 0.1).multiplyScalar(0.55 + 0.5 * pulse + 0.4 * o.heat + 0.8 * V._chan);
    }
    // glow bands carry their own lit factor (userData.k), applied on top of the shared gain
    if (V.bands) for (const m of V.bands) {
      const e = V.mats.find((q) => q.m === m);
      if (e) m.color.copy(e.base).multiplyScalar(gb * (m.userData.k ?? 1) * dimSpent);
    }
    // ---- motes
    const moteGain = (o.state === 'rising' ? clamp01(o.t / RISE_T) : 1) * (o.state === 'collapsing' ? 0 : 1) * (0.7 + 0.5 * V._chan) * (dimSpent < 1 ? 0.5 : 1);
    const cnt = o.type === 'wrath' ? 8 + 4 * o.heat : undefined;
    updateMotes(V.motes, time + o.slot * 5, moteGain, cnt);
  }
}
