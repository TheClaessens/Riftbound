import * as THREE from 'three';
import { patchEnv, mulberry32, smooth } from '../env/common.js';
import { ico, paint, prep, paintFn, bake } from './geo.js';
import { TAU, nearK, heightCap, WAVE_GLSL } from './common.js';

// =====================================================================================
//  Stormwater Reach arena wall (Aurelith): prism-white / cyan crystal shards standing in a
//  rippling pool, with a thin water curtain falling inside them. The crystals and the curtain
//  follow setRadius, so Aurelith's Floodfall can shrink the ring. Water-flood visuals are the
//  boss's job; the ring decal here is only the pool lip at the collision edge.
//  Layers (draw calls): shards (low front, 2 variants), clusters (tall, 2 variants), curtain.
// =====================================================================================

const C = {
  ice: [0xa8d8f2, 0xc4ecf8, 0x8ee0ea, 0xb8d4f4], deep: 0x6aa0c8, tip: 0xf6fdff,
  rock0: 0x7b8da0, rock1: 0xb4c4d2, rockMoss: 0x6aa68c,
};
const _c = new THREE.Color(), _t = new THREE.Color();
const _L = new THREE.Vector3(-0.35, 0.8, 0.5).normalize();

/** One hexagonal prism with a pointed tip (open shells: base buried, tip cap closes the body). */
function prism(rng, { r, h, tipK = 2.4, x, z, lx = 0, lz = 0, tint, sides = 6 }) {
  const body = prep(new THREE.CylinderGeometry(r * 0.96, r * 1.06, h, sides, 1, true));
  body.translate(0, h / 2, 0);
  const tipH = r * tipK;
  const tip = prep(new THREE.ConeGeometry(r * 0.96, tipH, sides, 1, true));
  tip.translate(0, h + tipH / 2, 0);
  const g = bake([body, tip], { glow: false });
  const total = h + tipH, base = _c.set(tint);
  paintFn(g, (cx, cy, cz, nx, ny, nz, out) => {
    const t = Math.min(1, cy / total);
    out.copy(base).lerp(_t.set(C.deep), 0.55 * (1 - smooth(0, 0.5, t)));
    out.lerp(_t.set(C.tip), 0.75 * smooth(0.55, 1, t));
    const lit = 0.78 + 0.3 * Math.max(0, nx * _L.x + ny * _L.y + nz * _L.z) + (rng() - 0.5) * 0.12;
    out.multiplyScalar(lit);
    return 0.12 + 0.55 * smooth(0.45, 1, t);          // tips glow a little more than the bases
  });
  g.rotateY(rng() * TAU);
  g.rotateX(lz); g.rotateZ(-lx);
  g.translate(x, -0.2, z);
  return g;
}

function mound(rng, x, z, r, sy = 0.5) {
  const g = ico(r, 1, rng, 0.3);
  g.scale(1.3, sy, 1);
  g.translate(x, 0, z);
  return paint(g, C.rock0, C.rock1, rng, { ao: 0.55, jitter: 0.1, moss: C.rockMoss, mossAmt: 0.35, mossUp: 0.6 });
}

/** A burst of crystals around a rocky foot. H = height of the tallest. */
function makeCluster(rng, { H = 4.0, n = 8, span = 1.7, minH = 0.35 } = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const u = main ? 0 : (i / n) * 2 - 1 + (rng() - 0.5) * 0.3;
    const x = main ? (rng() - 0.5) * 0.5 : u * span, z = main ? 1.15 : 0.55 + rng() * 1.4;
    const h = main ? H : H * Math.max(minH, 0.65 - Math.abs(u) * 0.45 + (rng() - 0.5) * 0.3);
    const r = main ? H * 0.115 : 0.1 + Math.min(0.28, h * 0.08);
    const lean = (main ? 0.06 : 0.12 + rng() * 0.28);
    parts.push(prism(rng, { r, h, x, z, lx: (u + (rng() - 0.5) * 0.5) * lean * 1.4, lz: lean * (0.4 + rng()), tint: C.ice[(rng() * C.ice.length) | 0] }));
  }
  parts.push(mound(rng, -0.6, 1.1, 0.7), mound(rng, 0.7, 1.4, 0.6), mound(rng, 0, 0.7, 0.5, 0.4));
  return bake(parts);
}

/** Low front row: small shards (<= 0.75 u) in a fringe of wet stone. */
function makeShards(rng) {
  const parts = [], L = 3.4;
  for (let i = 0; i < 9; i++) {      // prisms of mixed height (the piece is clamped under 0.8 u on the camera arc)
    const x = -L / 2 + 0.3 + i * (L - 0.6) / 8 + (rng() - 0.5) * 0.3, z = 0.35 + (i % 2) * 0.5 + rng() * 0.5, h = 0.2 + rng() * 0.38;
    parts.push(prism(rng, { r: 0.1 + rng() * 0.07, h, tipK: 3.0, x, z, lx: (rng() - 0.5) * 0.5, lz: 0.1 + rng() * 0.3, tint: C.ice[(rng() * C.ice.length) | 0] }));
  }
  for (let i = 0; i < 3; i++) parts.push(mound(rng, -L / 2 + 0.7 + i * (L - 1.4) / 2, 0.6 + rng() * 0.8, 0.36 + rng() * 0.15, 0.5));
  return bake(parts);
}

// ---------- materials ----------
function createShardMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x5fb4e0) });
  m.emissiveIntensity = 0.16;
  return patchEnv(m, {
    key: 'arenaCrown', fade: true, wrap: true,
    vertexPars: 'attribute float aGlow; varying float vGlow;', vertexMain: 'vGlow = aGlow;',
    fragmentPars: 'varying float vGlow;',
    emissiveFragment: 'totalEmissiveRadiance = totalEmissiveRadiance * (0.4 + vGlow * 1.8) + diffuseColor.rgb * vGlow * 0.5 * (0.7 + 0.5 * sin(uTime * 2.3 + vEnvWorld.x * 1.7 + vEnvWorld.z * 1.3 + vEnvWorld.y * 3.5));',
  });
}

// ---------- the water curtain ----------
const CURT_VS = /* glsl */`
attribute float aAng; attribute float aV;
varying float vAng; varying float vV; varying float vY;
void main() { vAng = aAng; vV = aV; vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CURT_FS = /* glsl */`
uniform float uK, uTime, uRad;
varying float vAng; varying float vV; varying float vY;
${WAVE_GLSL}
void main() {
  float rv = arReveal(vAng, uK);
  if (vV > rv + 0.001) discard;
  float arc = vAng * uRad;
  float s1 = arNoise(vec2(arc * 2.3, vY * 0.55 + uTime * 3.2));
  float s2 = arNoise(vec2(arc * 5.1 + 7.0, vY * 0.9 + uTime * 4.6));
  float streak = smoothstep(0.55, 0.95, s1) * 0.8 + smoothstep(0.7, 1.0, s2) * 0.5;
  float foot = 1.0 - smoothstep(0.0, 0.16, vV);                    // splash at the base
  float lip = smoothstep(rv, rv - 0.06, vV);                       // soft growing top edge
  float topFade = 1.0 - smoothstep(0.82, 1.0, vV);
  float a = (0.08 + 0.4 * streak + 0.3 * foot) * lip * topFade;
  vec3 col = mix(vec3(0.52, 0.80, 0.95), vec3(0.97, 1.0, 1.0), clamp(streak * 0.9 + foot * 0.7, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}`;

function createCurtain({ scene, r }) {
  const N = 192;
  const pos = new Float32Array((N + 1) * 2 * 3), ang = new Float32Array((N + 1) * 2), vv = new Float32Array((N + 1) * 2);
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, h = heightCap(a) * 0.78 + Math.sin(a * 7.0) * 0.08;
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j;
      pos[k * 3] = Math.cos(a); pos[k * 3 + 1] = j ? h : 0.0; pos[k * 3 + 2] = Math.sin(a);
      ang[k] = a; vv[k] = j;
    }
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  geo.setAttribute('aV', new THREE.BufferAttribute(vv, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uTime: { value: 0 }, uRad: { value: r } },
    vertexShader: CURT_VS, fragmentShader: CURT_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'arena.curtain';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);
  return {
    draws: 1, tris: N * 2,
    update(dt, st) {
      const R = st.rad + 0.55;
      mesh.position.set(st.center.x, 0.03, st.center.z);
      mesh.scale.set(R, 1, R);
      mat.uniforms.uK.value = st.k; mat.uniforms.uTime.value = st.time; mat.uniforms.uRad.value = R;
      mesh.visible = st.k > 0.001;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}

// ---------- layout ----------
export function buildCrown({ r }) {
  const rng = mulberry32(0x5c2a77);
  const mat = createShardMaterial();
  const shards = [makeShards(rng), makeShards(rng)];
  const clusters = [makeCluster(rng, { H: 4.2, n: 9 }), makeCluster(rng, { H: 3.5, n: 8 }), makeCluster(rng, { H: 1.9, n: 8, span: 1.4, minH: 0.5 })];
  const layers = [
    { name: 'shards', geo: shards[0], mat, items: [] }, { name: 'shards2', geo: shards[1], mat, items: [] },
    { name: 'clusterA', geo: clusters[0], mat, items: [] }, { name: 'clusterB', geo: clusters[1], mat, items: [] }, { name: 'bed', geo: clusters[2], mat, items: [] },
  ];
  const circ = TAU * r;
  const place = (layer, a, o) => {   // every piece is clamped to the readability height cap at its angle
    const it = { a, off: 0, yaw: 0, s: 1, sx: 1, sy: 1, tilt: 0, ...o };
    it.sy = Math.min(it.sy, heightCap(a) / (layers[layer].geo.boundingBox.max.y * it.s));
    layers[layer].items.push(it);
  };
  const cap = (a, H, s = 1) => Math.min(1.12, heightCap(a) / (H * s));
  const flip = () => (rng() < 0.5 ? Math.PI : 0);
  const nF = Math.round(circ / 3.0);
  for (let i = 0; i < nF; i++) {
    const a = (i + 0.5 + (rng() - 0.5) * 0.2) / nF * TAU;
    place(i % 2, a, { off: (rng() - 0.3) * 0.25, yaw: (rng() - 0.5) * 0.3 + flip(), s: 0.95 + rng() * 0.2, sy: 1, dust: i % 3 === 0 });
  }
  const nB = Math.round(circ / 3.7);
  for (let i = 0; i < nB; i++) {       // crystal bed: a mid row of shorter clusters that fills the gaps between the tall ones
    const a = (i + 0.5 + (rng() - 0.5) * 0.3) / nB * TAU + 0.2;
    if (nearK(a) < 0.08) continue;
    place(4, a, { off: 0.7 + rng() * 0.4, yaw: (rng() - 0.5) * 0.5 + flip(), s: 0.95 + rng() * 0.25, dust: i % 3 === 0 });
  }
  for (const [row, spacing, minK, off] of [[0, 4.4, 0.1, 1.8], [1, 6.2, 0.45, 3.2]]) {
    const n = Math.round(circ / spacing);
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5 + (rng() - 0.5) * 0.3 + row * 0.35) / n * TAU;
      if (nearK(a) < minK) continue;
      const H = (i % 2 ? 3.5 : 4.2) + 0.9, s = 0.95 + rng() * 0.25;
      place(2 + (i % 2), a, { off: off + rng() * 0.4, yaw: (rng() - 0.5) * 0.5 + flip(), s, sy: Math.min(cap(a, H, s), 1.15) * (0.9 + rng() * 0.15), dust: i % 2 === 0 });
    }
  }
  return {
    layers,
    ring: { kind: 2, paint: 0x2c708f, line: 0xeaffff, line2: 0x7fd0e8, hdr: 1.05, out: 3.0 },
    dust(game, pos) {
      const v = game.vfx;
      if (!v) return;
      v.debris('ice', pos, 6, { scale: 1.0 });
      v.emit('frostGlint', pos, { count: 4, scale: 0.8 });
      v.emit('coldFog', pos, { count: 2, scale: 0.55 });
    },
    extras: [createCurtain],
    dispose() { mat.dispose(); },
  };
}
