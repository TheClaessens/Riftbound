import * as THREE from 'three';
import { setBossFade } from '../env/common.js';
import { TAU, W_FRAC, delayOf, easeOutBack, heightCap, createRingDecal } from './common.js';
import { buildVerge } from './verge.js';
import { buildCinder } from './cinder.js';
import { buildCrown } from './crown.js';

// =====================================================================================
//  Arena wall (v5, design/RAID.md): the themed ring that seals a boss encounter.
//  createArenaWall(game, biomeId 'verge'|'cinder'|'crown', center: Vector3, r) →
//    { rise(sec), sink(sec), setRadius(r, sec), update(dt), dispose(), stats }
//
//  One InstancedMesh per piece type (built once per wall: geometry is baked at creation, nothing is
//  created per frame). Pieces are placed on the circle at the gameplay radius: a piece's local frame is
//  x = along the wall, y = up, z = outward, and z = 0 is the INNER FACE, which sits exactly at `rad` (the
//  collision edge). The ring decal marks the same edge on the ground.
//
//  Rise / sink: a progress k (0..1) sweeps a staggered wave from the camera-side arc round to the far arc; each
//  piece takes W_FRAC of the sweep and erupts with an ease-out-back overshoot. Sink plays k backwards.
//  setRadius slides every piece along the radius (x-stretched so neighbours keep overlapping), eased like
//  the encounter's own arena.r.
//  Readability: pieces on the camera-side arc are low (≤ 0.8 u), the far arc may be 3–5 u tall, and every
//  wall material carries the env player cut-out (dithered hole around the hero for anything in front).
// =====================================================================================

const BUILDERS = { verge: buildVerge, cinder: buildCinder, crown: buildCrown };
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color(), _hide = new THREE.Matrix4().makeScale(0, 0, 0);

export function createArenaWall(game, biomeId, center, r) {
  const build = BUILDERS[biomeId] ?? BUILDERS.verge;
  const B = build({ game, r, center });
  const scene = game.scene;
  const group = new THREE.Group();
  group.name = `arena.wall.${biomeId}`;
  scene.add(group);

  // ---- instanced layers ----
  const layers = [], items = [];
  let tris = 0, draws = 0;
  for (const L of B.layers) {
    if (!L.items.length) continue;
    const mesh = new THREE.InstancedMesh(L.geo, L.mat, L.items.length);
    mesh.name = `arena.${L.name}`;
    mesh.frustumCulled = false;
    mesh.castShadow = L.cast ?? true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;                       // after the ring decal (1), before creatures (3)
    const H = L.geo.boundingBox.max.y;
    L.items.forEach((it, i) => {
      it.layer = layers.length; it.i = i; it.H = H; it.p = 0;
      it.cos = Math.cos(it.a); it.sin = Math.sin(it.a);
      it.d = Math.min(1 - W_FRAC, delayOf(it.a) * (1 - W_FRAC) + (it.dj ?? (Math.random() - 0.5) * 0.04));
      it.d = Math.max(0, it.d);
      mesh.setMatrixAt(i, _hide);
      if (it.tint !== undefined) mesh.setColorAt(i, _c.set(it.tint));
      else if (it.shade !== undefined) mesh.setColorAt(i, _c.setScalar(it.shade));
      items.push(it);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    layers.push({ mesh, geo: L.geo, mat: L.mat });
    tris += (L.geo.attributes.position.count / 3) * L.items.length;
    draws++;
  }
  const extras = (B.extras ?? []).map((f) => f({ game, scene: group, center, r, group }));
  for (const x of extras) { if (x.draws) draws += x.draws; if (x.tris) tris += x.tris; }
  const ring = createRingDecal(scene, center, r, { ...B.ring, rMax: r });
  draws++;

  // ---- state ----
  let k = 0, target = 0, rate = 1, rad = r, rFrom = r, rTo = r, rT = 0, rDur = 0, time = 0, dirty = true, sunk = false;
  const sMaxDust = 14;
  const _dp = { x: 0, y: 0, z: 0 };
  let dustBudget = 0;

  function writeMatrices() {
    const stretch = rad / r;
    for (let n = 0; n < items.length; n++) {
      const it = items[n], mesh = layers[it.layer].mesh;
      const prev = it.p;
      const p = Math.min(1, Math.max(0, (k - it.d) / W_FRAC));
      it.p = p;
      if (p <= 0.0005) { mesh.setMatrixAt(it.i, _hide); continue; }
      const e = easeOutBack(p);
      const hh = it.H * it.s * it.sy;
      const sink = (hh + 0.5) * (1 - e);
      const rr = rad + it.off;
      _p.set(center.x + it.cos * rr, -sink, center.z + it.sin * rr);
      const wob = (1 - p) * 0.28;
      _e.set((it.tiltX ?? 0) * 0 + wob * (it.wx ?? 0.6) + (it.tilt ?? 0), Math.PI / 2 - it.a + (it.yaw ?? 0), wob * (it.wz ?? -0.4), 'YXZ');
      _q.setFromEuler(_e);
      _s.set(it.s * it.sx * stretch, it.s * it.sy * (0.55 + 0.45 * Math.min(1, p * 2.2)), it.s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(it.i, _m);
      if (it.dust && ((prev <= 0.0005 && p > 0.0005) || (prev > 0.02 && p <= 0.02 && prev > p)) && dustBudget < sMaxDust) {
        _dp.x = center.x + it.cos * (rr + 0.8); _dp.y = 0.1; _dp.z = center.z + it.sin * (rr + 0.8);
        B.dust?.(game, _dp, it);
        dustBudget++;
      }
    }
    for (const L of layers) L.mesh.instanceMatrix.needsUpdate = true;
  }

  // dev stats: pieces taller than the camera-side height cap (should be 0)
  let overCap = 0, maxH = 0;
  for (const it of items) { const hh = it.H * it.s * it.sy; maxH = Math.max(maxH, hh); if (hh > heightCap(it.a) + 0.06) overCap++; }

  const wall = {
    group,
    stats: {
      overCap, maxH: +maxH.toFixed(2), drawCalls: draws, tris: Math.round(tris), pieces: items.length, layers: layers.map((L) => `${L.mesh.name}:${L.mesh.count}x${L.geo.attributes.position.count / 3}`) },
    _items: items,
    rise(sec) { target = 1; rate = 1 / Math.max(0.01, sec); sunk = false; },
    sink(sec) { target = 0; rate = 1 / Math.max(0.01, sec); },
    setRadius(nr, sec) { rFrom = rad; rTo = nr; rT = 0; rDur = Math.max(0.01, sec); },
    update(dt) {
      time += dt;
      dustBudget = 0;
      if (k !== target) {
        k += Math.sign(target - k) * Math.min(Math.abs(target - k), rate * dt);
        dirty = true;
      }
      if (rDur) {
        rT += dt;
        const t = Math.min(1, rT / rDur);
        rad = rFrom + (rTo - rFrom) * t * t * (3 - 2 * t);
        if (t >= 1) rDur = 0;
        dirty = true;
      }
      if (dirty) { writeMatrices(); dirty = false; }
      const vis = k > 0.001;
      for (const L of layers) L.mesh.visible = vis;
      ring.set(k, rad, time);
      // the env cut-out also follows the boss, so canopy / tall props inside the arena never hide it
      const bs = game.boss;
      if (bs && !bs.dead && k > 0.3) setBossFade(bs.pos, Math.max(3.2, (bs.radius ?? 1.5) * 1.8), Math.max(1.6, (bs.radius ?? 1.5) * 1.1)); else setBossFade(null);
      for (const x of extras) x.update?.(dt, { k, rad, time, center, game });
    },
    dispose() {
      scene.remove(group);
      for (const L of layers) { L.mesh.dispose(); L.geo.dispose(); }
      const seen = new Set();
      for (const L of layers) if (!seen.has(L.mat)) { seen.add(L.mat); L.mat.dispose(); }
      for (const x of extras) x.dispose?.();
      B.dispose?.();
      if (game.encounter?.wall === wall || !game.encounter?.wall) setBossFade(null);
      ring.dispose();
    },
  };
  return wall;
}

/**
 * Optional: build + compile a wall off-screen so the first Seal does not hitch on shader compilation.
 * Call once per biome (e.g. at act start / boot). Safe to skip.
 */
export function warmArenaWall(game, biomeId) {
  const w = createArenaWall(game, biomeId, new THREE.Vector3(4000, 0, 4000), 20);
  w.rise(0.01);
  w.update(0.1);
  // Compile only this wall's materials, against the real scene's lights (program cache keys must match the
  // fight). Synchronous on purpose: compileAsync's readiness poll threw from a timer when a stage/biome
  // rebuild disposed materials mid-compile.
  try { game.engine.renderer.compile(w.group, game.engine.camera, game.scene); } catch (e) { /* headless / no renderer */ }
  // Keep the warm wall alive, sunk and hidden: three.js frees a program as soon as no live material uses it,
  // so disposing it would throw the compiled programs away again (measured: 60-80 ms hitch at every Seal).
  w.sink(0.001);
  w.update(0.1);
  WARM.push(w);
}
const WARM = [];
