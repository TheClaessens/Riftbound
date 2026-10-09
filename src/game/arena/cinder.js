import * as THREE from 'three';
import { patchEnv, mulberry32, smooth } from '../env/common.js';
import { barrens } from '../env/biomes/barrens.js';
import { makeWarBanner } from '../env/props_barrens.js';
import { ico, paint, tris, orientOut, paintFn, bake } from './geo.js';
import { TAU, nearK, heightCap } from './common.js';

// =====================================================================================
//  Sunscorch Barrens arena wall (Vashkar): a ring of jagged basalt teeth split by glowing ember
//  cracks, Warband war-banner poles planted among them. Ember orange / amber only (no red).
//  Layers (draw calls): stumps x2 (low front row), columns, fangs x2 (tall), banners.
// =====================================================================================

const C = {
  rock0: 0x252120, rock1: 0x4a403a, rockHi: 0x6c6056, dust: 0x77614a, ash: 0x8a7a68,
  ember: 0xff8a22, emberDeep: 0xe0561a,
};
const _c = new THREE.Color();
const EMBER = new THREE.Color(C.ember), EMBER_LO = new THREE.Color(0xe8741c);

/**
 * A faceted basalt solid: rings of jittered vertices (flat shaded), optional apex. Cracks are thin glowing
 * ribbons laid over the vertical edges listed in o.cracks.
 * o: { H, R, m, rings: [[t, radiusFactor]...], lean: [x, z], twist, yTilt, apex (y factor or 0), cracks: [col...], hot, jag }
 */
function solid(rng, o) {
  const { H, R, m = 6, rings, lean = [0, 0], twist = 0, yTilt = 0, apex = 1, cracks = [], hot = 1, jag = 0.08 } = o;
  const ang = [];
  for (let j = 0; j < m; j++) ang.push(((j + (rng() - 0.5) * 0.45) / m) * TAU);
  const axis = (y) => { const t = Math.max(0, y / H); return [lean[0] * t ** 1.7, y, lean[1] * t ** 1.7]; };
  const V = [];
  rings.forEach(([t, rf], i) => {
    const row = [], cx = lean[0] * t ** 1.7, cz = lean[1] * t ** 1.7;
    for (let j = 0; j < m; j++) {
      const a = ang[j] + twist * t, rr = R * rf * (0.82 + rng() * 0.36);
      const y = H * t + (i ? (rng() - 0.5) * jag * H : 0) + yTilt * Math.cos(a - 0.6) * t * t;
      row.push([cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr]);
    }
    V.push(row);
  });
  const pos = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = V[i][j], b = V[i][(j + 1) % m], c = V[i + 1][(j + 1) % m], d = V[i + 1][j];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  const top = V[V.length - 1];
  let tp;
  if (apex) tp = [lean[0], H * apex + (rng() - 0.5) * 0.1 * H, lean[1]];
  else { tp = top.reduce((s, p) => [s[0] + p[0] / m, s[1] + p[1] / m + 0.05, s[2] + p[2] / m], [0, 0, 0]); }
  for (let j = 0; j < m; j++) pos.push(...top[j], ...top[(j + 1) % m], ...tp);
  const body = tris(pos);
  orientOut(body, (x, y, z) => axis(y));
  const H0 = H;
  paintFn(body, (cx, cy, cz, nx, ny, nz, out) => {
    out.set(C.rock0).lerp(_c.set(C.rock1), smooth(0, H0, cy));
    if (ny > 0.4) out.lerp(_c.set(C.rockHi), 0.55 * smooth(0.4, 0.85, ny));
    out.lerp(_c.set(C.dust), 0.5 * (1 - smooth(0, 0.3 * H0 + 0.15, cy)));
    out.multiplyScalar(0.86 + rng() * 0.26);
    return 0;
  });
  const parts = [body];
  // ember cracks: thin zig-zag ribbons lying just proud of the vertical edges
  for (const col of cracks) {
    const rp = [], rc = [], rg = [];
    const L = [], Rr = [];
    for (let i = 0; i < V.length; i++) {
      const p = V[i][col % m], t = rings[i][0], ax = axis(p[1]);
      let ox = p[0] - ax[0], oz = p[2] - ax[2];
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const w = (0.07 + 0.05 * rng()) * (1 - 0.55 * t) * Math.max(0.5, R);
      const kink = (rng() - 0.5) * 0.16 * R * (i ? 1 : 0);
      const cx = p[0] + ox * 0.05 - oz * kink, cz = p[2] + oz * 0.05 + ox * kink;
      L.push([cx + oz * w, p[1], cz - ox * w]); Rr.push([cx - oz * w, p[1], cz + ox * w]);
    }
    for (let i = 0; i < V.length - 1; i++) {
      const t0 = rings[i][0], t1 = rings[i + 1][0];
      const quad = [L[i], Rr[i], Rr[i + 1], L[i], Rr[i + 1], L[i + 1]];
      const tt = [t0, t0, t1, t0, t1, t1];
      for (const dbl of [false, true]) {
        const idx = dbl ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
        for (const q of idx) {
          rp.push(...quad[q]);
          EMBER.clone().lerp(EMBER_LO, tt[q]).toArray(rc, rc.length);
          rg.push(hot * (1 - 0.5 * tt[q]));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(rg, 1));
    parts.push(g);
  }
  return parts;
}

function shift(parts, x, y, z, rotY = 0, s = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, s, s));
  for (const g of parts) g.applyMatrix4(m);
  return parts;
}

// ---- tall basalt fang with satellite shards; its flank is split by ember cracks ----
function makeFang(rng, { H = 4.2, R = 1.15, lean = [0.5, 0.35], cracks = [1, 4], twin = false } = {}) {
  const parts = [];
  const ringsA = [[0, 1.2], [0.14, 1.08], [0.32, 0.92], [0.52, 0.74], [0.72, 0.54], [0.88, 0.32]];
  if (twin) {      // two horns leaning apart from one root
    parts.push(...shift(solid(rng, { H, R: R * 0.8, m: 6, rings: ringsA, lean: [-lean[0] * 1.6, lean[1]], twist: 0.5, apex: 1, cracks, hot: 1, jag: 0.05 }), -0.75, -0.4, 1.3));
    parts.push(...shift(solid(rng, { H: H * 0.78, R: R * 0.7, m: 6, rings: ringsA, lean: [lean[0] * 1.8, lean[1] * 0.6], twist: -0.4, apex: 1, cracks: [cracks[0] + 2], hot: 0.9, jag: 0.05 }), 0.85, -0.4, 1.45));
  } else {
    parts.push(...shift(solid(rng, { H, R, m: 7, rings: ringsA, lean, twist: 0.6, apex: 1, cracks, hot: 1, jag: 0.05 }), 0, -0.4, 1.35));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 3.0 + 0.2 + rng() * 0.6, d = 1.3 + rng() * 0.4, h = 1.3 + rng() * 1.4;
    parts.push(...shift(solid(rng, { H: h, R: 0.5 + rng() * 0.2, m: 5, rings: [[0, 1.2], [0.4, 0.95], [0.75, 0.6]], lean: [(rng() - 0.5) * 0.5, 0.3 + rng() * 0.3], apex: 1, cracks: rng() < 0.5 ? [0] : [], hot: 0.9 }),
      Math.cos(a + Math.PI) * d, -0.35, 1.5 + Math.abs(Math.sin(a)) * d * 0.5 + 0.2));
  }
  return bake(parts);
}

// ---- column cluster: chiselled basalt columns with glowing gaps ----
function makeColumns(rng) {
  const parts = [];
  const cols = [[-1.6, 1.2, 1.5, 0.55], [-0.7, 1.7, 2.3, 0.6], [0.2, 1.1, 1.9, 0.5], [1.0, 1.7, 2.6, 0.62], [1.8, 1.0, 1.3, 0.5], [0.1, 2.3, 1.1, 0.5]];
  cols.forEach(([x, z, h, rad], i) => {
    parts.push(...shift(solid(rng, { H: h, R: rad, m: 6, rings: [[0, 1.08], [0.55, 1.0], [1, 0.92]], lean: [(rng() - 0.5) * 0.12, 0.05], twist: 0.2, yTilt: (rng() - 0.5) * 0.6, apex: 0, cracks: i % 2 ? [1] : [4], hot: 0.85, jag: 0.03 }), x, -0.35, z));
  });
  return bake(parts);
}

// ---- low stump cluster (<= 0.75 u): broken columns, rubble and a glowing seam ----
function makeStumps(rng) {
  const parts = [], L = 3.2;
  for (let i = 0; i < 5; i++) {      // a row of low pointed teeth, the front/back ones leaning out
    const x = -L / 2 + 0.35 + i * (L - 0.7) / 4 + (rng() - 0.5) * 0.25, z = 0.45 + (i % 2) * 0.55 + rng() * 0.35, h = 0.5 + rng() * 0.22;
    parts.push(...shift(solid(rng, { H: h, R: 0.38 + rng() * 0.16, m: 5, rings: [[0, 1.25], [0.45, 0.98], [0.8, 0.62]], lean: [(rng() - 0.5) * 0.25, 0.12 + rng() * 0.16], twist: 0.3, apex: 1, cracks: i % 2 ? [(rng() * 5) | 0] : [], hot: 0.95, jag: 0.06 }), x, -0.1, z));
  }
  for (let i = 0; i < 4; i++) {      // rubble
    const g = ico(0.17 + rng() * 0.15, 0, rng, 0.35);
    g.scale(1, 0.7, 1); g.translate((rng() - 0.5) * L, 0.05, 0.2 + rng() * 1.4);
    paint(g, C.rock0, C.rock1, rng, { ao: 0.3, jitter: 0.12 });
    parts.push(g);
  }
  return bake(parts);
}

// ---------- materials ----------
function createRockMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  return patchEnv(m, {
    key: 'arenaCinder', fade: true, wrap: true,
    vertexPars: 'attribute float aGlow; varying float vGlow;', vertexMain: 'vGlow = aGlow;',
    fragmentPars: 'varying float vGlow;',
    emissiveFragment: 'totalEmissiveRadiance += diffuseColor.rgb * vGlow * (1.55 + 0.4 * sin(uTime * 2.1 + vEnvWorld.x * 0.7 + vEnvWorld.z * 0.9 + vEnvWorld.y * 2.5));',
  });
}
function createBannerMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  return patchEnv(m, {
    key: 'arenaBanner', fade: true, wrap: true,
    vertexPars: 'attribute vec2 sway;',
    vertexMain: `{ vec3 bo = (modelMatrix * instanceMatrix)[3].xyz; float bph = dot(bo.xz, vec2(0.37, 0.23));
      transformed.x += sin(uTime * 1.7 + bph) * sway.x * (0.7 + uWindStrength);
      transformed.z += cos(uTime * 1.3 + bph) * sway.x * 0.5 * (0.7 + uWindStrength);
      transformed += vec3(0.6, 0.25, 0.6) * sin(uTime * 5.0 + dot(position, vec3(4.1, 3.3, 3.7)) + bph) * sway.y; }`,
  });
}

// ---------- layout ----------
export function buildCinder({ r }) {
  const rng = mulberry32(0xc1d3e5);
  const rock = createRockMaterial(), bannerMat = createBannerMaterial();
  const stumps = [makeStumps(rng), makeStumps(rng)];
  const columns = makeColumns(rng);
  const fangs = [makeFang(rng, { H: 4.2, R: 1.15, lean: [0.5, 0.35], cracks: [1, 4] }), makeFang(rng, { H: 3.6, R: 1.0, lean: [-0.6, 0.3], cracks: [2, 5], twin: true })];
  const banner = makeWarBanner(rng, barrens.palette, { height: 4.4 });
  banner.scale(1.5, 1, 1.5);
  banner.computeBoundingBox();
  const layers = [
    { name: 'stumps', geo: stumps[0], mat: rock, items: [] }, { name: 'stumps2', geo: stumps[1], mat: rock, items: [] },
    { name: 'columns', geo: columns, mat: rock, items: [] },
    { name: 'fangA', geo: fangs[0], mat: rock, items: [] }, { name: 'fangB', geo: fangs[1], mat: rock, items: [] },
    { name: 'banner', geo: banner, mat: bannerMat, items: [], cast: true },
  ];
  const circ = TAU * r;
  const place = (layer, a, o) => {   // every piece is clamped to the readability height cap at its angle
    const it = { a, off: 0, yaw: 0, s: 1, sx: 1, sy: 1, tilt: 0, ...o };
    it.sy = Math.min(it.sy, heightCap(a) / (layers[layer].geo.boundingBox.max.y * it.s));
    layers[layer].items.push(it);
  };
  const cap = (a, H, s = 1) => Math.min(1.12, heightCap(a) / (H * s));
  const flip = () => (rng() < 0.5 ? Math.PI : 0);
  const nF = Math.round(circ / 2.7);
  for (let i = 0; i < nF; i++) {
    const a = (i + 0.5 + (rng() - 0.5) * 0.2) / nF * TAU;
    place(i % 2, a, { off: (rng() - 0.3) * 0.25, yaw: (rng() - 0.5) * 0.3 + flip(), s: 0.92 + rng() * 0.18, dust: i % 3 === 0 });
  }
  const nC = Math.round(circ / 3.8);
  for (let i = 0; i < nC; i++) {
    const a = (i + 0.5 + (rng() - 0.5) * 0.3) / nC * TAU;
    if (nearK(a) < 0.1) continue;
    const s = 0.92 + rng() * 0.2;
    place(2, a, { off: 1.2 + rng() * 0.5, yaw: (rng() - 0.5) * 0.4 + flip(), s, sy: Math.min(cap(a, 2.4, s), 1.1) * (0.9 + rng() * 0.15), dust: i % 2 === 0 });
  }
  const nT = Math.round(circ / 4.9);
  for (let i = 0; i < nT; i++) {
    const a = (i + 0.5 + (rng() - 0.5) * 0.25) / nT * TAU + 0.12;
    if (nearK(a) < 0.35) continue;
    const H = i % 2 ? 3.7 : 4.2, s = 0.95 + rng() * 0.2;
    place(3 + (i % 2), a, { off: 2.2 + rng() * 0.6, yaw: (rng() - 0.5) * 0.4 + flip(), s, sy: Math.min(cap(a, H, s), 1.12) * (0.88 + rng() * 0.15), dust: true });
  }
  for (let i = 0; i < 9; i++) {      // war banners among the teeth, mostly on the far arc
    const a = Math.PI * 1.25 + (i - 4) * 0.3 + (rng() - 0.5) * 0.1;
    if (nearK(a) < 0.7) continue;
    place(5, a, { off: 3.0 + rng() * 0.6, yaw: (rng() - 0.5) * 0.2, s: 1.05, sy: Math.min(1, cap(a, 4.6, 1.05)), tilt: (rng() - 0.5) * 0.08, dust: false });
  }
  return {
    layers,
    ring: { kind: 1, paint: 0x120d0b, line: 0xff9a30, line2: 0xff8a22, hdr: 1.25 },
    dust(game, pos, it) {
      const v = game.vfx;
      if (!v) return;
      v.debris('rock', pos, 5, { scale: 1.1 });
      v.emit('dustRing', pos, { count: 3, scale: 0.65, speed: 0.3 });
      if (it && it.layer >= 3) v.emit('ember', pos, { count: 3, scale: 0.8, speed: 0.4 });
    },
    // ambient: an ember drifts off a crack now and then once the wall stands
    extras: [({ game, center, r: r0 }) => {
      let t = 0;
      return {
        update(dt, st) {
          if (st.k < 0.99 || !game.vfx) return;
          t -= dt;
          if (t > 0) return;
          t = 0.16 + Math.random() * 0.2;
          const a = Math.PI * 1.25 + (Math.random() - 0.5) * 4.6;
          if (nearK(a) < 0.25 && Math.random() < 0.6) return;
          const rr = st.rad + 1.2 + Math.random() * 2;
          game.vfx.emit('ember', { x: st.center.x + Math.cos(a) * rr, y: 0.4 + Math.random() * 1.5, z: st.center.z + Math.sin(a) * rr }, { count: 1, scale: 0.6, speed: 0.25 });
        },
      };
    }],
    dispose() { rock.dispose(); bannerMat.dispose(); },
  };
}
