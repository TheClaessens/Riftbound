import * as THREE from 'three';
import { makeRigMaterials, Pose, POSE_STRIDE, solvePose } from './rig.js';

// =====================================================================================
//  CreatureRenderer: one InstancedMesh per creature type, GPU skinned from a bone texture,
//  plus one shared InstancedMesh of soft blob shadows under every creature.
//
//    const h = renderer.add(def, { pos, yaw, scale, seed })   // handle; keep it on the enemy
//    h.pos (Vector3, shared by reference) · h.yaw (smoothed) · h.scale · h.lift (y offset)
//    h.action / h.k  : current action name + 0..1 progress, read by def.animate
//    h.flash()       : white hit flash + squash + recoil (s.hit)
//    h.tint          : null | hex (status emissive)     h.glow: 0..1+ (ramps emissive parts)
//    h.rim           : null | [r,g,b,a] per-instance rim light (elites, wards)
//    h.accent        : null | [r,g,b,mix] recolours emissive parts (wards)
//    h.elite         : true → trim parts turn gold, elite-only parts appear
//    h.frozen        : true → animation time stops (frozen enemies hold their pose)
//    h.hidden        : true → instance collapses (blink)
//    h.stat          : null | [burn 0..1, cold 0..1 (1 = frozen), shock 0..1] → status looks in the rig shader
//    renderer.add(def, { track: true }) + renderer.boneWorld(h, bone, [x,y,z], outVec3) → world point on a bone
//    renderer.remove(h, { corpse: true })                     // death topple, then free
//    renderer.update(dt, time)                                // once per frame (dt 0 = hold)
//    renderer.setRim(hex, strength)                           // biome rim light colour
//
//  def.animate(P, s, B) gets s = { t, dt, walk, move, speed, action, k, hit, seed, h, dying }
// =====================================================================================

const START_CAP = 16;
const DEATH_TIME = 0.55;          // default; a def may set spec.deathTime (bosses)
const SQUASH_TIME = 0.1;
const _mat = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();
const RIG_TIME = { value: 0 };   // shared rigTime uniform (status flicker in the rig shader)

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.75)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

class Batch {
  constructor(scene, def, rimUniform, outlineUniform, renderOrder = 0) {
    this.renderOrder = renderOrder;
    this.scene = scene;
    this.def = def;
    this.handles = [];
    this.uniforms = { boneTex: { value: null }, rigRim: rimUniform, rigOutline: outlineUniform, rigTime: RIG_TIME, rigHeight: { value: def.geometry.boundingBox.max.y } };
    const mats = makeRigMaterials(this.uniforms, def.spec.material);
    this.material = mats.color;
    this.depthMaterial = mats.depth;
    this.hullMaterial = def.spec.outline === false ? null : mats.hull;
    this.hull = null;
    const bb = def.geometry.boundingBox;
    this.blobR = def.spec.blob ?? Math.max(0.3, Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 0.8);
    this.cap = 0;
    this.mesh = null;
    this._grow(START_CAP);
  }

  _grow(cap) {
    const def = this.def;
    const geo = def.geometry;
    const n = def.boneCount;
    const old = this.mesh;
    // bone texture: width = 4 texels per bone, height = capacity (row = instance)
    const data = new Float32Array(n * 4 * cap * 4);
    const tex = new THREE.DataTexture(data, n * 4, cap, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texData = data;
    if (this.tex) this.tex.dispose();
    this.tex = tex;
    this.uniforms.boneTex.value = tex;

    const attr = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.fx = attr(); this.rim = attr(); this.acc = attr(); this.misc = attr();
    geo.setAttribute('iFx', this.fx);
    geo.setAttribute('iRim', this.rim);
    geo.setAttribute('iAcc', this.acc);
    geo.setAttribute('iMisc', this.misc);

    const mesh = new THREE.InstancedMesh(geo, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = this.depthMaterial;
    mesh.castShadow = def.spec.shadow !== false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = `creature:${def.id}`;
    mesh.renderOrder = this.renderOrder;
    if (old) { this.scene.remove(old); old.dispose(); }
    if (this.hull) { this.scene.remove(this.hull); this.hull.dispose(); this.hull = null; }
    if (this.hullMaterial) {
      const hull = new THREE.InstancedMesh(geo, this.hullMaterial, cap);
      hull.instanceMatrix = mesh.instanceMatrix; // shared: one upload drives both
      hull.frustumCulled = false;
      hull.count = 0;
      hull.name = `creature-hull:${def.id}`;
      hull.renderOrder = this.renderOrder;
      this.scene.add(hull);
      this.hull = hull;
    }
    this.scene.add(mesh);
    this.mesh = mesh;
    this.cap = cap;
  }

  ensure(count) {
    if (count <= this.cap) return;
    let c = this.cap;
    while (c < count) c *= 2;
    this._grow(c);
  }
}

export class CreatureRenderer {
  // opts: { outlinePx (default 1.6), renderOrder (heroes draw after their ground ring) }
  constructor(scene, camera = null, opts = {}) {
    this.camera = camera;
    this.outline = { value: 0.035 };
    this.outlinePx = opts.outlinePx ?? 1.6;
    this.renderOrder = opts.renderOrder ?? 0;
    this.scene = scene;
    this.batches = new Map();
    this.pose = new Pose();
    this.time = 0;
    this.rim = { value: new THREE.Vector4(1.0, 0.95, 0.84, 0.35) };
    this._s = { t: 0, dt: 0, walk: 0, move: 0, speed: 0, action: null, k: 0, hit: 0, seed: 0, h: null, dying: 0 };

    // Blob shadows (one draw call for every creature).
    this.blobCap = 0;
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.4, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.blobGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.blobs = null;
    this._growBlobs(64);
  }

  _growBlobs(cap) {
    if (this.blobs) { this.scene.remove(this.blobs); this.blobs.dispose(); }
    const m = new THREE.InstancedMesh(this.blobGeo, this.blobMat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = -1;
    m.count = 0;
    m.name = 'creature:blobs';
    this.scene.add(m);
    this.blobs = m;
    this.blobCap = cap;
  }

  setRim(hex, strength = 0.35) {
    _col.setHex(hex);
    this.rim.value.set(_col.r, _col.g, _col.b, strength);
  }

  _batch(def) {
    let b = this.batches.get(def.id);
    if (!b) { b = new Batch(this.scene, def, this.rim, this.outline, this.renderOrder); this.batches.set(def.id, b); }
    return b;
  }

  // Warm up: builds geometry + allocates batches for these defs before they are needed.
  prepare(defs) { for (const d of defs) this._batch(d); }

  add(def, opts = {}) {
    const b = this._batch(def);
    const seed = opts.seed ?? Math.random();
    const h = {
      def, batch: b,
      pos: opts.pos ?? new THREE.Vector3(),
      yaw: opts.yaw ?? 0, _yaw: opts.yaw ?? 0, turnRate: opts.turnRate ?? 12,
      scale: opts.scale ?? 1, lift: 0, tilt: 0,
      action: null, k: 0,
      tint: null, glow: 0, rim: null, accent: null, elite: false,
      seed,
      walk: seed * 6.283, move: 0, speed: 0,
      hit: 0, flashT: 0, squashT: 0, t: seed * 10, frozen: false,
      dying: 0, dead: false,
      color: opts.color ?? null, // per-instance colour multiplier [r,g,b] (variety)
      pose: new Float32Array(def.boneCount * POSE_STRIDE),
      _px: NaN, _pz: NaN,
      flash() { this.flashT = 0.08; this.squashT = SQUASH_TIME; this.hit = 1; },
    };
    if (!h.color) {
      // subtle per-instance variety: ±6% value, tiny hue shift
      const v = 0.94 + seed * 0.12;
      h.color = [v * (0.98 + 0.04 * ((seed * 7.3) % 1)), v, v * (0.98 + 0.04 * ((seed * 3.1) % 1))];
    }
    if (opts.track) {
      // keep this instance's solved bone matrices + instance matrix for boneWorld() (heroes)
      h.bones = new Float32Array(def.boneCount * 16);
      h.matrix = new THREE.Matrix4();
    }
    b.handles.push(h);
    return h;
  }

  // World position of a model-space point carried by `bone` (name or index), as of the last update().
  // Needs a handle added with { track: true }.
  boneWorld(h, bone, local, out) {
    const bi = typeof bone === 'number' ? bone : h.def.B[bone];
    const m = h.bones, o = bi * 16, x = local[0], y = local[1], z = local[2];
    out.set(m[o] * x + m[o + 4] * y + m[o + 8] * z + m[o + 12],
      m[o + 1] * x + m[o + 5] * y + m[o + 9] * z + m[o + 13],
      m[o + 2] * x + m[o + 6] * y + m[o + 10] * z + m[o + 14]);
    return out.applyMatrix4(h.matrix);
  }

  // corpse: play the death topple first (the handle stays alive DEATH_TIME seconds).
  remove(h, opts = {}) {
    if (h.dead || h.dying > 0) return;
    if (opts.corpse) {
      h.dying = 1e-4;
      h.flashT = 0.1;
      h.tint = null;
      h.glow = 0;
      h.frozen = false;
      h._fall = (h.seed * 6.283) % 6.283;
      return;
    }
    this._free(h);
  }

  _free(h) {
    if (h.dead) return;
    h.dead = true;
    const list = h.batch.handles;
    const i = list.indexOf(h);
    if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
  }

  clear() {
    for (const b of this.batches.values()) { b.handles.length = 0; b.mesh.count = 0; b.mesh.visible = false; if (b.hull) { b.hull.count = 0; b.hull.visible = false; } }
    this.blobs.count = 0;
  }

  update(dt, time) {
    this.time = time;
    RIG_TIME.value = time % 1000;
    const cam = this.camera;
    if (cam && cam.isOrthographicCamera) this.outline.value = this.outlinePx * (cam.top - cam.bottom) / (cam.zoom * Math.max(1, innerHeight));
    const s = this._s;
    s.dt = dt;
    let total = 0;
    for (const b of this.batches.values()) total += b.handles.length;
    if (total > this.blobCap) { let c = this.blobCap; while (c < total) c *= 2; this._growBlobs(c); }
    const blobArr = this.blobs.instanceMatrix.array;
    let nb = 0;

    for (const b of this.batches.values()) {
      const list = b.handles;
      for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i];
        if (h.dying > 0 && h.dying >= (h.def.spec.deathTime ?? DEATH_TIME)) this._free(h);
      }
      const n = list.length;
      b.ensure(n);
      const def = b.def, bones = def.boneCount;
      const inst = b.mesh.instanceMatrix.array, fx = b.fx.array, rim = b.rim.array, acc = b.acc.array, misc = b.misc.array;
      const col = b.mesh.instanceColor.array;
      const tex = b.texData;
      for (let i = 0; i < n; i++) {
        const h = list[i];
        // ---- locomotion bookkeeping (gait phase follows distance → no foot sliding)
        if (dt > 0) {
          if (Number.isNaN(h._px)) { h._px = h.pos.x; h._pz = h.pos.z; }
          const dx = h.pos.x - h._px, dz = h.pos.z - h._pz;
          const d = Math.sqrt(dx * dx + dz * dz);
          h._px = h.pos.x; h._pz = h.pos.z;
          const step = d > 2.5 ? 0 : d; // teleports don't count
          h.speed += (step / dt - h.speed) * (1 - Math.exp(-10 * dt));
          if (h.dying <= 0) h.walk += step / (def.stride * h.scale) * 6.283185;
          h.move += ((h.speed > 0.25 ? 1 : 0) - h.move) * (1 - Math.exp(-8 * dt));
          h.hit = Math.max(0, h.hit - dt * 6);
          if (!h.frozen) h.t += dt;
          if (h.flashT > 0) h.flashT -= dt;
          if (h.squashT > 0) h.squashT -= dt;
          if (h.dying > 0) h.dying += dt;
          let dy = h.yaw - h._yaw;
          dy -= Math.round(dy / 6.283185) * 6.283185;
          if (!h.frozen) h._yaw += dy * (1 - Math.exp(-h.turnRate * dt));
        }
        // ---- pose
        s.t = h.t; s.walk = h.walk; s.move = h.move; s.speed = h.speed; s.action = h.action; s.k = h.k;
        s.hit = h.hit; s.seed = h.seed; s.h = h; s.dying = h.dying > 0 ? Math.min(1, h.dying / (h.def.spec.deathTime ?? DEATH_TIME)) : 0;
        this.pose.reset(h.pose, bones);
        def.animate(this.pose, s, def.B);
        solvePose(def, h.pose, tex, i * bones * 16);
        if (h.bones) h.bones.set(tex.subarray(i * bones * 16, (i + 1) * bones * 16));

        // ---- instance transform (+ hit squash, + generic death topple: fall and sink)
        let lift = h.lift, sc = h.scale, rx = 0, rz = 0, sy = 1, sxz = 1;
        if (h.squashT > 0) { const q = h.squashT / SQUASH_TIME; sy = 1 - 0.15 * q; sxz = 1 + 0.1 * q; }
        if (h.dying > 0) {
          const k = Math.min(1, h.dying / (h.def.spec.deathTime ?? DEATH_TIME));
          const fall = Math.min(1, k * 2.2);
          const ease = fall * fall * (3 - 2 * fall);
          rx = Math.cos(h._fall) * 1.45 * ease;
          rz = Math.sin(h._fall) * 1.45 * ease;
          lift -= Math.max(0, k - 0.45) / 0.55 * 0.9 * sc;
          sc *= 1 - 0.25 * Math.max(0, k - 0.6) / 0.4;
        }
        if (h.hidden) sc = 0;
        _e.set(rx + h.tilt, h._yaw, rz, 'YXZ');
        _q.setFromEuler(_e);
        _pos.set(h.pos.x, h.pos.y + lift, h.pos.z);
        _scl.set(sc * sxz, sc * sy, sc * sxz);
        _mat.compose(_pos, _q, _scl);
        _mat.toArray(inst, i * 16);
        if (h.matrix) h.matrix.copy(_mat);

        // ---- per-instance channels
        const o = i * 4;
        if (h.flashT > 0) {
          const f = Math.min(1, h.flashT / 0.08) * 0.9;
          fx[o] = f; fx[o + 1] = f; fx[o + 2] = f;
        } else if (h.tint !== null) {
          _col.setHex(h.tint);
          // daylight: a light wash keeps the model readable; frozen reads stronger (gameplay info)
          const tk = h.frozen ? 0.34 : 0.17;
          fx[o] = _col.r * tk; fx[o + 1] = _col.g * tk; fx[o + 2] = _col.b * tk;
        } else { fx[o] = fx[o + 1] = fx[o + 2] = 0; }
        if (h.dying > 0) { fx[o] *= 0.5; fx[o + 1] *= 0.5; fx[o + 2] *= 0.5; }
        fx[o + 3] = h.glow;
        if (h.rim) { rim[o] = h.rim[0]; rim[o + 1] = h.rim[1]; rim[o + 2] = h.rim[2]; rim[o + 3] = h.rim[3]; }
        else { rim[o] = rim[o + 1] = rim[o + 2] = rim[o + 3] = 0; }
        if (h.accent) { acc[o] = h.accent[0]; acc[o + 1] = h.accent[1]; acc[o + 2] = h.accent[2]; acc[o + 3] = h.accent[3]; }
        else acc[o + 3] = 0;
        misc[o] = h.elite ? 1 : 0;
        // status looks: h.stat = [burn 0..1, cold 0..1 (1 = frozen), shock 0..1] or null
        const st = h.dying > 0 ? null : h.stat;
        misc[o + 1] = st ? st[0] : 0; misc[o + 2] = st ? st[1] : 0; misc[o + 3] = st ? st[2] : 0;
        const c = h.color;
        const dk = h.dying > 0 ? 1 - 0.35 * Math.min(1, h.dying / (h.def.spec.deathTime ?? DEATH_TIME)) : 1;
        col[i * 3] = c[0] * dk; col[i * 3 + 1] = c[1] * dk; col[i * 3 + 2] = c[2] * dk;

        // ---- blob shadow
        const br = b.blobR * h.scale * (h.dying > 0 ? 1 - Math.min(1, h.dying / (h.def.spec.deathTime ?? DEATH_TIME)) : 1);
        const bo = nb * 16;
        blobArr[bo] = br; blobArr[bo + 1] = 0; blobArr[bo + 2] = 0; blobArr[bo + 3] = 0;
        blobArr[bo + 4] = 0; blobArr[bo + 5] = 1; blobArr[bo + 6] = 0; blobArr[bo + 7] = 0;
        blobArr[bo + 8] = 0; blobArr[bo + 9] = 0; blobArr[bo + 10] = br; blobArr[bo + 11] = 0;
        blobArr[bo + 12] = h.pos.x; blobArr[bo + 13] = 0.03; blobArr[bo + 14] = h.pos.z; blobArr[bo + 15] = 1;
        nb++;
      }
      b.mesh.count = n;
      if (b.hull) { b.hull.count = n; b.hull.visible = n > 0; }
      b.mesh.visible = n > 0;
      if (n > 0) {
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.instanceColor.needsUpdate = true;
        b.fx.needsUpdate = true;
        b.rim.needsUpdate = true;
        b.acc.needsUpdate = true;
        b.misc.needsUpdate = true;
        b.tex.needsUpdate = true;
      }
    }
    this.blobs.count = nb;
    this.blobs.visible = nb > 0;
    if (nb > 0) this.blobs.instanceMatrix.needsUpdate = true;
  }
}
