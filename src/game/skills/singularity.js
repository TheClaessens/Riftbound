import * as THREE from 'three';
import { GEO, randRange } from '../../core/utils.js';
import { blendAddMaterial } from '../fx.js';
import { damageArea } from './common.js';

// SINGULARITY (arcane, active). A dark-violet vortex at the cursor: pulls non-boss foes toward
// its centre, ticks arcane damage, then collapses for burst damage.
const CD = [9, 8.5, 8, 7.5, 6];
const RANGE = 14;           // cast clamp
const TICK = 0.25;

// Shared geometry (module-level). Thin tubes so the rings stay slim when scaled up.
const VORTEX_RING = new THREE.RingGeometry(0.93, 1, 64);
const VORTEX_TORUS = new THREE.TorusGeometry(1, 0.035, 6, 48);

const _buf = [];            // reused query buffer (queryEnemies clears it)
const _sp = { x: 0, y: 0, z: 0 };
const _sv = { x: 0, y: 0, z: 0 };

export const singularity = {
  id: 'singularity',
  name: 'Singularity',
  icon: '◎',
  element: 'arcane',
  kind: 'active',
  maxRank: 5,
  range: RANGE,
  hint: 'Pulls the horde together — perfect setup for AoE reactions.',
  desc: (rank) => [
    'Open a vortex at the cursor that pulls foes to its centre (4 arcane damage every 0.25s), then collapses for 30 damage.',
    '+20% radius.',
    'Vortex lasts 3.5s.',
    'Collapse deals double damage (60).',
    'Cooldown drops to 6s.',
  ][rank - 1],
  cooldown: (rank) => CD[rank - 1],

  // ctx: { rank, origin, dir, target, player }
  cast(game, ctx) {
    const target = clampTarget(ctx.origin, ctx.target, RANGE);
    game.addActor(new Vortex(game, target, ctx.rank));
  },
};

class Vortex {
  constructor(game, pos, rank) {
    const area = game.player.stats.area;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = 5 * area * (rank >= 2 ? 1.2 : 1);
    this.life = rank >= 3 ? 3.5 : 2.5;
    this.collapseDmg = rank >= 4 ? 60 : 30;
    this.collapseR = 3 * area;
    this.t = 0;
    this.tickAcc = 0;
    this.sparkAcc = 0;

    // Per-instance materials (disposed in dispose()).
    this.floorMat = new THREE.MeshBasicMaterial({ color: 0x1a0633, transparent: true, opacity: 0.6, depthWrite: false });
    this.ringMat = blendAddMaterial(0xb67cff, { hdr: 1.7, opacity: 0.85, occ: 0.5, depthTest: false });
    this.tiltMat = blendAddMaterial(0x8a4dff, { hdr: 1.6, opacity: 0.7, occ: 0.5 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    this.group = new THREE.Group();
    this.group.position.set(this.pos.x, 0, this.pos.z);

    const floor = new THREE.Mesh(GEO.disc, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.03;
    floor.scale.setScalar(this.radius);

    const flat = new THREE.Mesh(VORTEX_RING, this.ringMat);
    flat.rotation.x = -Math.PI / 2;
    flat.position.y = 0.08;
    flat.scale.setScalar(this.radius);

    // Two tilted tori; the group spins so their orientation sweeps around the centre.
    this.tiltA = new THREE.Mesh(VORTEX_TORUS, this.tiltMat);
    this.tiltA.rotation.x = 1.0;
    this.tiltA.position.y = 1.5;
    this.tiltA.scale.setScalar(this.radius * 0.7);

    this.tiltB = new THREE.Mesh(VORTEX_TORUS, this.tiltMat);
    this.tiltB.rotation.set(-0.6, 0, 0.5);
    this.tiltB.position.y = 1.0;
    this.tiltB.scale.setScalar(this.radius * 0.45);

    // Event horizon.
    const core = new THREE.Mesh(GEO.sphere, this.coreMat);
    core.position.y = 0.6;
    core.scale.setScalar(0.7);

    this.group.add(floor, flat, this.tiltA, this.tiltB, core);
    this.group.scale.setScalar(0.2);
    game.scene.add(this.group);
  }

  update(dt, game) {
    this.t += dt;
    const fade = Math.min(1, this.t / 0.3, (this.life - this.t) / 0.3);
    const grow = Math.min(1, this.t / 0.35);
    this.group.scale.setScalar(0.2 + 0.8 * grow);
    this.group.rotation.y += dt * 3.2;

    this.floorMat.opacity = 0.6 * fade;
    this.ringMat.opacity = (0.75 + 0.2 * Math.sin(this.t * 8)) * fade;
    this.tiltMat.opacity = 0.7 * fade;

    // Pull non-boss, non-inert foes toward the centre: slow at the centre, up to 7 u/s at the rim.
    const cx = this.pos.x;
    const cz = this.pos.z;
    for (const e of game.queryEnemies(this.pos, this.radius, _buf)) {
      if (e.dead || e.inert || e.boss) continue;
      const dx = cx - e.pos.x;
      const dz = cz - e.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1e-4) continue;
      const f = Math.min(1, d / this.radius);
      const speed = 7 * (0.25 + 0.75 * f);
      const step = Math.min(d, speed * dt);
      e.pos.x += (dx / d) * step;
      e.pos.z += (dz / d) * step;
    }

    // Arcane damage every 0.25 s.
    this.tickAcc += dt;
    if (this.tickAcc >= TICK) {
      this.tickAcc -= TICK;
      damageArea(game, this.pos, this.radius, 4, { element: 'arcane' });
    }

    // Violet motes spiralling inward from the rim.
    this.sparkAcc += dt * 36 * fade;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const r0 = this.radius * (0.85 + Math.random() * 0.15);
      _sp.x = cx + cosA * r0;
      _sp.y = randRange(0.2, 1.6);
      _sp.z = cz + sinA * r0;
      const tang = 3.5;   // tangential (swirl)
      const inward = 3.0; // toward the centre
      _sv.x = -sinA * tang - cosA * inward;
      _sv.y = 0;
      _sv.z = cosA * tang - sinA * inward;
      game.fx.spark(_sp, _sv, { color: 0xa070ff, size: 0.2, life: 1.0 });
    }

    if (this.t >= this.life) {
      this.collapse(game);
      return false;
    }
    return true;
  }

  collapse(game) {
    const p = this.pos;
    const r = this.collapseR;
    damageArea(game, p, r, this.collapseDmg, { element: 'arcane' });
    game.fx.flashDisc(p, { color: 0xc08cff, radius: r, life: 0.3 });
    game.fx.ring(p, { color: 0xb67cff, radius: r, life: 0.4 });
    game.fx.burst(p, { color: 0xb67cff, count: 24, speed: 8, life: 0.5, size: 0.35 });
    game.fx.light(p, 0xb67cff, 50, 0.3);
    game.fx.shake(0.15);
  }

  dispose(game) {
    game.scene.remove(this.group);
    this.floorMat.dispose();
    this.ringMat.dispose();
    this.tiltMat.dispose();
    this.coreMat.dispose();
  }
}

// Target point on the ground, clamped to `maxRange` from origin.
function clampTarget(origin, target, maxRange) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= maxRange || d < 1e-6) return new THREE.Vector3(target.x, 0, target.z);
  const s = maxRange / d;
  return new THREE.Vector3(origin.x + dx * s, 0, origin.z + dz * s);
}
