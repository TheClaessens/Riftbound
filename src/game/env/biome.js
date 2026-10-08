import * as THREE from 'three';
import { ENV, updateEnv, makeHeightFn, buildLayoutMask, mulberry32, smooth, sideOf } from './common.js';
import { createGround } from './ground.js';
import { createField, fieldWindow } from './field.js';
import { PropBatch, createPropMaterial } from './props.js';
import { makeRiverGeometry, makePondGeometry, createWaterMaterial } from './water.js';
import { createMotes } from './motes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// =====================================================================================
//  buildBiome(def, { engine, scene }) turns a biome DEFINITION (plain data + one props recipe
//  function, see biomes/forest.js) into live scene objects, and returns a handle with
//  update() / dispose() / obstacles. world.js owns gameplay; this owns the look.
//
//  Biome definition fields (all colours sRGB hex):
//    id, name, seed
//    atmos     Engine.setAtmosphere block: { background, hemiSky, hemiGround, hemiIntensity, moon (sun colour),
//              moonIntensity, grade: { tint, saturation, contrast, vignette } }
//    env       applyEnvSettings block: { saturation (env-only), lift, dapple, haze, cloudCover, cloudDark, cloudScale, cloudSpeed:[x,z], wind, windDir, edgeHaze, edgeHazeMax }
//    rim       [hex, strength] creature rim light
//    terrain   makeHeightFn opts: { flatR, ramp, farRise, nearDrop, noiseAmp, noiseFreq, depth }
//    layout(rng) -> { paths: [{points:[[x,z]..], width}], rivers: [{points, width}], ponds: [{x,z,r}] }
//              (world x,z; author in screen space with fromScreen(sx, sy) + smoothPolyline). Water sits at a
//              constant level (water.level, default -0.07): keep rivers / ponds on the flat arena or the far
//              (rising) side, never on the camera-side drop (there the channel would float above the valley).
//    ground    createGround pal: { groundA, groundB, groundDark, path, pathEdge, bank, slope, soil, speck, speckAmt, cracks, pebbles }
//    grass     null | createField opts (count, height, width, density, patchLo, clump, clumpRadius, colors:{root,tipA,tipB})
//    flowers   null | createField opts with colors.petals (no red / pink / magenta: telegraph colours)
//    water     null | { deep, shallow, foam, speed, sparkle, foamWidth, level }
//    motes     [createMotes opts...]  kind 'dot' | 'leaf' | 'butterfly' (see motes.js)
//    props(ctx) recipe: place everything with the ctx helpers below. Return nothing.
//
//  ctx (props recipe context):
//    rng, pal (= def.palette), mask, heightFn, ARENA (55)
//    y(x,z)                       terrain height
//    side(x,z)                    -1 far side (screen-top) .. +1 camera side (screen-bottom)
//    free(x,z,r,{path,water,pad,center})  true if (x,z) is clear of reserved circles / path / water / spawn clearing
//    reserve(x,z,r)               mark a circle as used (spacing only)
//    solid(x,z,r)                 add a collision circle (only if it can touch the arena)
//    footprint(x,z,r,keep)        thin grass / show soil under a prop
//    place(geo, it, {far})        bake geo at it = {x,z,y?,rotY,s,sx,sy,sz,tiltX,tiltZ,tint,shade}; y defaults to terrain
//                                 far=true -> distant batch (no shadow casting, no occlusion dither)
//    add(object3D, update?)       extra custom objects (owned + disposed by the biome)
//    tryPlace(n, sampler, r, fn)  n attempts: sampler(rng)->[x,z]; fn(x,z) called when free(x,z,r)
// =====================================================================================

export const ARENA = 55;

export function buildBiome(def, { engine, scene }) {
  const t0 = performance.now();
  const rng = mulberry32(def.seed ?? 1);
  const root = new THREE.Group();
  root.name = `env.${def.id}`;
  const owned = [];            // objects with userData.dispose
  const updaters = [];
  const layout = def.layout ? def.layout(mulberry32((def.seed ?? 1) + 11)) : {};
  const paths = layout.paths ?? [], rivers = layout.rivers ?? [], ponds = layout.ponds ?? [];
  const heightFn = makeHeightFn({ ...(def.terrain ?? {}), rivers, ponds });
  const mask = buildLayoutMask({ heightFn, paths, rivers, ponds });

  // ---------- props ----------
  const near = new PropBatch({ chunk: 36 }), far = new PropBatch({ chunk: 60 });
  const reserved = [], obstacles = [], footprints = [];
  const ctx = {
    rng, pal: def.palette ?? {}, mask, heightFn, ARENA, layout,
    y: (x, z) => heightFn(x, z),
    side: (x, z) => sideOf(x, z),
    free(x, z, r, o = {}) {
      if (Math.abs(x) > 126 || Math.abs(z) > 126) return false;
      const m = mask.sample(x, z);
      if (!o.path && m.path > 0.2) return false;
      if (!o.water && m.waterD > -r - 0.6) return false;
      const c = o.center ?? 7;
      if (Math.hypot(x, z) < c + r) return false;
      const pad = o.pad ?? 0.4;
      for (const q of reserved) {
        const dx = x - q.x, dz = z - q.z, rr = r + q.r + pad;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
      return true;
    },
    reserve(x, z, r) { reserved.push({ x, z, r }); },
    solid(x, z, r) { if (Math.hypot(x, z) - r < ARENA + 1) obstacles.push({ x, z, r }); },
    footprint(x, z, r, keep = 0.2) { footprints.push({ x, z, r, keep }); },
    place(geo, it, o = {}) {
      const p = { ...it };
      if (p.y === undefined) p.y = heightFn(p.x, p.z);
      (o.far ? far : near).add(geo, p);
    },
    add(obj, update) { root.add(obj); owned.push(obj); if (update) updaters.push(update); },
    tryPlace(n, sampler, r, fn, o) {
      let k = 0;
      for (let i = 0; i < n; i++) {
        const [x, z] = sampler(rng);
        if (ctx.free(x, z, r, o)) { fn(x, z); k++; }
      }
      return k;
    },
    ring: (r0, r1, a0 = 0, a1 = Math.PI * 2) => (R) => {
      const a = a0 + R() * (a1 - a0), r = Math.sqrt(r0 * r0 + R() * (r1 * r1 - r0 * r0));
      return [Math.cos(a) * r, Math.sin(a) * r];
    },
  };
  def.props?.(ctx);
  mask.stamp(footprints);
  mask.commit();

  const propMat = createPropMaterial({ fade: true, key: `props` });
  const farMat = createPropMaterial({ fade: false, key: `propsFar` });
  for (const m of near.build(propMat, { castShadow: true, name: 'env.props' })) { root.add(m); owned.push(m); }
  for (const m of far.build(farMat, { castShadow: false, name: 'env.far' })) { root.add(m); owned.push(m); }

  // ---------- ground ----------
  const ground = createGround({ mask, heightFn, pal: def.ground });
  root.add(ground); owned.push(ground);

  // ---------- water ----------
  if (def.water && (rivers.length || ponds.length)) {
    const geos = [];
    for (const rv of rivers) geos.push(makeRiverGeometry(rv.points, rv.width, { y: def.water.level ?? -0.07 }));
    for (const p of ponds) geos.push(makePondGeometry(p.x, p.z, p.r, { y: def.water.level ?? -0.07 }));
    const wgeo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const wmat = createWaterMaterial(def.water, {
      width: rivers[0]?.width ?? 6, speed: def.water.speed ?? 0.8, sparkle: def.water.sparkle ?? 0.9, foamWidth: def.water.foamWidth ?? 0.45,
    });
    const water = new THREE.Mesh(wgeo, wmat);
    water.name = 'env.water';
    water.receiveShadow = true;
    water.matrixAutoUpdate = false;
    water.updateMatrix();
    water.userData.dispose = () => { wgeo.dispose(); wmat.dispose(); };
    root.add(water); owned.push(water);
  }

  // ---------- grass / flowers / motes ----------
  // Grass window: sized for the current zoom band (denser blades at the default zoom).
  const zoomBand = () => (engine.zoom < 0.86 ? 0.6 : 0.86);
  let band = zoomBand();
  let win = fieldWindow(engine, band);
  const fields = [];
  if (def.grass) fields.push(createField({ mask, window: win, seed: (def.seed ?? 1) + 3, ...def.grass }));
  if (def.flowers) fields.push(createField({ mask, window: win, kind: 'flower', seed: (def.seed ?? 1) + 5, ...def.flowers }));
  for (const f of fields) { root.add(f); owned.push(f); }
  const motes = (def.motes ?? []).map((m, i) => createMotes({ window: win, seed: (def.seed ?? 1) + 20 + i, ...m }));
  for (const m of motes) { root.add(m); owned.push(m); }

  scene.add(root);
  // NaN-safe: a biome built while the window is 0×0 (hidden tab) must still resize its grass window later.
  const viewAspect = () => innerWidth / Math.max(1, innerHeight);
  let aspect = viewAspect();
  const center = new THREE.Vector3();

  const handle = {
    id: def.id, def, root, obstacles, heightFn, mask, ground, fields, motes,
    buildMs: 0,
    /** dt: real seconds; player: Vector3 | null (occlusion + grass push). */
    update(dt, player) {
      updateEnv(dt, player);
      const a = viewAspect();
      const zb = zoomBand();
      if (!(Math.abs(a - aspect) <= 1e-3) || zb !== band) {
        aspect = a; band = zb; win = fieldWindow(engine, band);
        for (const f of fields) f.userData.setWindow(win);
        for (const m of motes) m.userData.setWindow(win);
      }
      center.copy(engine.camTarget);
      for (const f of fields) f.userData.update(center, player);
      const ppu = engine.pixelsPerUnit();
      for (const m of motes) m.userData.update(center, ppu);
      for (const u of updaters) u(dt, ENV.uTime.value);
    },
    /** Flatten grass in circle slot i (0..3), e.g. under the shrine claim ring. strength 0 clears the slot. */
    setClearing(i, x, z, r, strength = 1) { for (const f of fields) f.userData.setClearing(i, x, z, r, strength); },
    dispose() {
      scene.remove(root);
      for (const o of owned) {
        if (o.userData?.dispose) o.userData.dispose();
        else o.traverse?.((c) => { c.geometry?.dispose?.(); c.material?.dispose?.(); });
      }
      propMat.dispose(); farMat.dispose();
      mask.texture.dispose();
    },
  };
  handle.buildMs = Math.round(performance.now() - t0);
  return handle;
}

export { smooth };
