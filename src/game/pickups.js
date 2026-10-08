import * as THREE from 'three';
import { GEO, glowMaterial, randRange } from '../core/utils.js';
import { blendAddMaterial } from './fx.js';

const MAX_SHARDS = 1500;

// XP shards (instanced), health orbs and magnets.
export class Pickups {
  constructor(game) {
    this.game = game;
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.16, 0.26, 0.16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mat.color.multiplyScalar(1.5);
    this.inst = new THREE.InstancedMesh(geo, mat, MAX_SHARDS);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    // initialise the instanceColor buffer
    this.inst.setColorAt(0, new THREE.Color());
    game.scene.add(this.inst);
    // Soft ground blobs under each gem: value contrast on bright ground (one extra instanced draw).
    const blobGeo = GEO.disc.clone().rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blobGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), MAX_SHARDS);
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    game.scene.add(this.blobs);
    this._qId = new THREE.Quaternion();
    this._bp = new THREE.Vector3();
    this._bs = new THREE.Vector3();
    this._shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    this.shards = [];
    this.items = []; // { type, pos, mesh, t, attracted, vel }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
    this._e = new THREE.Euler();
  }

  reset() {
    this.shards.length = 0;
    this.inst.count = 0;
    this.blobs.count = 0;
    for (const it of this.items) this.game.scene.remove(it.mesh);
    this.items.length = 0;
  }

  spawnXP(pos, value) {
    if (value <= 0) return;
    // big values split into a big shard + a couple of small ones for juice
    if (this.shards.length >= MAX_SHARDS) {
      const s = this.shards[Math.floor(Math.random() * this.shards.length)];
      s.value += value;
      return;
    }
    this.shards.push({
      pos: new THREE.Vector3(pos.x + randRange(-0.3, 0.3), 0, pos.z + randRange(-0.3, 0.3)),
      vel: new THREE.Vector3(randRange(-2, 2), 4, randRange(-2, 2)),
      y: 0.5, vy: 3 + Math.random() * 2,
      value, t: Math.random() * 10, attracted: false, speed: 0,
    });
  }

  spawn(type, pos) {
    let mesh;
    if (type === 'health') {
      mesh = new THREE.Group();
      const core = new THREE.Mesh(GEO.sphere, glowMaterial(0xff2e4d, 1.4));
      core.scale.setScalar(0.28);
      const cross1 = new THREE.Mesh(GEO.box, glowMaterial(0xffffff, 2));
      cross1.scale.set(0.34, 0.1, 0.1);
      const cross2 = cross1.clone(); cross2.scale.set(0.1, 0.34, 0.1);
      cross1.position.z = cross2.position.z = 0.25;
      mesh.add(core, cross1, cross2, this._shadow());
    } else if (type === 'chest') {
      // Relic Chest: dark casket with a glowing gold seam and a light beacon.
      mesh = new THREE.Group();
      const box = new THREE.Mesh(GEO.box, new THREE.MeshStandardMaterial({ color: 0x2a1f3a, roughness: 0.6, metalness: 0.4 }));
      box.scale.set(0.8, 0.5, 0.55);
      const seam = new THREE.Mesh(GEO.box, glowMaterial(0xffc340, 1.8));
      seam.scale.set(0.84, 0.07, 0.59); seam.position.y = 0.1;
      // light beacon: blend-add so it also reads on bright ground (gold glow with a faint dark core)
      const beacon = new THREE.Mesh(GEO.cylinder, blendAddMaterial(0xffc340, { hdr: 1.3, opacity: 0.4, occ: 0.35 }));
      beacon.scale.set(0.35, 6, 0.35); beacon.position.y = 3;
      beacon.renderOrder = 4;
      mesh.add(box, seam, beacon, this._shadow(0.7));
    } else {
      mesh = new THREE.Group();
      const ring = new THREE.Mesh(GEO.torus, glowMaterial(0x9a5cff, 1.8));
      ring.scale.setScalar(0.32);
      const core = new THREE.Mesh(GEO.octa, glowMaterial(0x2fc4ff, 1.6));
      core.scale.setScalar(0.18);
      mesh.add(ring, core, this._shadow());
    }
    mesh.position.set(pos.x, 0.7, pos.z);
    this.game.scene.add(mesh);
    this.items.push({ type, pos: new THREE.Vector3(pos.x, 0, pos.z), mesh, t: 0, attracted: false, speed: 0 });
  }

  // Flat shadow blob on the ground under a floating item (items hover at y = 0.7).
  _shadow(r = 0.45) {
    const s = new THREE.Mesh(GEO.disc, this._shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.position.y = -0.67;
    s.scale.setScalar(r);
    return s;
  }

  magnetAll() { for (const s of this.shards) s.attracted = true; }

  update(dt) {
    const p = this.game.player;
    const pr2 = p.stats.pickupRadius * p.stats.pickupRadius;
    let n = 0;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      // pop-out arc
      if (s.vy !== 0 || s.y > 0.35) {
        s.vy -= 18 * dt; s.y += s.vy * dt;
        s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt;
        s.vel.multiplyScalar(Math.exp(-4 * dt));
        if (s.y <= 0.35) { s.y = 0.35; s.vy = 0; }
      }
      const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
      const d2 = dx * dx + dz * dz;
      if (!s.attracted && d2 < pr2 && s.t > 0.3) s.attracted = true;
      if (s.attracted) {
        s.speed = Math.min(30, s.speed + 40 * dt);
        const d = Math.sqrt(d2) || 1;
        const step = Math.min(d, s.speed * dt);
        s.pos.x += (dx / d) * step; s.pos.z += (dz / d) * step;
        if (d < 0.6) {
          p.gainXP(s.value);
          this.game.events.emit('xpCollected', { value: s.value });
          this.shards[i] = this.shards[this.shards.length - 1];
          this.shards.pop();
          continue;
        }
      }
    }
    for (const s of this.shards) {
      const big = s.value >= 5;
      const huge = s.value >= 25;
      const sc = huge ? 2.1 : big ? 1.5 : 1;
      this._e.set(0, s.t * 2.5, 0);
      this._q.setFromEuler(this._e);
      this._p.set(s.pos.x, s.y + Math.sin(s.t * 3) * 0.08, s.pos.z);
      this._s.setScalar(sc);
      this._m.compose(this._p, this._q, this._s);
      this.inst.setMatrixAt(n, this._m);
      // small blue, big gold, huge white-hot (HDR, blooms). Green/pink read as grass / hostile bullets.
      this.inst.setColorAt(n, huge ? this._c.set(0xffffff).multiplyScalar(1.7) : this._c.set(big ? 0xffc83a : 0x4fb8ff));
      this._m.compose(this._bp.set(s.pos.x, 0.03, s.pos.z), this._qId, this._bs.setScalar(0.2 * sc));
      this.blobs.setMatrixAt(n, this._m);
      n++;
    }
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    // special items
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += dt * 2;
      it.mesh.position.y = 0.7 + Math.sin(it.t * 3) * 0.12;
      const dx = p.pos.x - it.pos.x, dz = p.pos.z - it.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < p.stats.pickupRadius) it.attracted = true;
      if (it.attracted) {
        it.speed = Math.min(25, it.speed + 35 * dt);
        const step = Math.min(d, it.speed * dt);
        it.pos.x += (dx / (d || 1)) * step; it.pos.z += (dz / (d || 1)) * step;
      }
      it.mesh.position.x = it.pos.x; it.mesh.position.z = it.pos.z;
      if (d < 0.7) {
        if (it.type === 'chest') {
          this.game.queueChest();
          this.game.fx.ring(p.pos, { color: 0xffc340, radius: 3, life: 0.5 });
          this.game.fx.burst(p.pos, { color: 0xffc340, count: 24, speed: 5, life: 0.6, up: 2 });
        } else if (it.type === 'health') { p.heal(p.stats.maxHp * 0.3); this.game.fx.burst(p.pos, { color: 0xff3355, count: 16, speed: 3, life: 0.6, up: 2 }); }
        else { this.magnetAll(); this.game.fx.ring(p.pos, { color: 0xb67cff, radius: 12, life: 0.6 }); }
        this.game.events.emit('itemCollected', { type: it.type });
        this.game.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}
