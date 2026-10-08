import * as THREE from 'three';
import { GEO, glowMaterial, randRange } from '../../core/utils.js';
import { damageArea } from './common.js';

// BLIZZARD (frost, active). A frost zone at the cursor: frost ticks every 0.33 s,
// falling snow, and at rank 5 a gentle inward pull.
const TICK = 0.33;
const RANGE = 14;           // cast clamp

const _buf = [];            // reused query buffer (queryEnemies clears it)
const _sp = { x: 0, y: 0, z: 0 };
const _sv = { x: 0, y: 0, z: 0 };

export const blizzard = {
  id: 'blizzard',
  name: 'Blizzard',
  icon: '❄',
  element: 'frost',
  kind: 'active',
  maxRank: 5,
  range: RANGE,
  hint: 'Chills the whole zone: Freeze the horde, then Arcane for Shatter.',
  desc: (rank) => [
    'Summon a frost zone at the cursor: 5 frost damage every 0.33s to foes inside, for 4s.',
    '+15% radius.',
    'Zone lasts 6s.',
    '+40% damage.',
    'Zone gently pulls foes toward its centre.',
  ][rank - 1],
  cooldown: (rank) => [7, 6.5, 6, 5.5, 5][rank - 1],

  // ctx: { rank, origin, dir, target, player }
  cast(game, ctx) {
    const target = clampTarget(ctx.origin, ctx.target, RANGE);
    game.addActor(new FrostZone(game, target, ctx.rank));
  },
};

class FrostZone {
  constructor(game, pos, rank) {
    const area = game.player.stats.area;
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    this.radius = 3.5 * area * (rank >= 2 ? 1.15 : 1);
    this.life = rank >= 3 ? 6 : 4;
    this.dmg = 5 * (rank >= 4 ? 1.4 : 1);
    this.pull = rank >= 5;
    this.t = 0;
    this.tickAcc = 0;
    this.snowAcc = 0;

    this.discMat = new THREE.MeshBasicMaterial({ color: 0x6fb8e0, transparent: true, opacity: 0.18, depthWrite: false });
    this.edgeMat = glowMaterial(0x9fe9ff, 1.2, { transparent: true, opacity: 0.45, depthWrite: false, additive: true });

    const disc = new THREE.Mesh(GEO.disc, this.discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    disc.scale.setScalar(this.radius);
    const edge = new THREE.Mesh(GEO.ring, this.edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.06;
    edge.scale.setScalar(this.radius);

    this.group = new THREE.Group();
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.add(disc, edge);
    game.scene.add(this.group);

    game.fx.ring(this.pos, { color: 0x9fe9ff, radius: this.radius, from: this.radius * 0.3, life: 0.35 });
    game.fx.burst(this.pos, { color: 0xdff6ff, count: 14, speed: 3, life: 0.5, size: 0.3, up: 0.3 });
  }

  update(dt, game) {
    this.t += dt;
    const fade = Math.min(1, this.t / 0.3, (this.life - this.t) / 0.5);
    this.discMat.opacity = 0.18 * fade;
    this.edgeMat.opacity = (0.35 + 0.15 * Math.sin(this.t * 5)) * fade;

    // Falling snow: sparks drifting down through the zone.
    this.snowAcc += dt * 28 * fade;
    while (this.snowAcc >= 1) {
      this.snowAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * this.radius;
      _sp.x = this.pos.x + Math.cos(a) * rr;
      _sp.y = randRange(1, 3.5);
      _sp.z = this.pos.z + Math.sin(a) * rr;
      _sv.x = 0.4;                                  // slight drift
      _sv.y = -(1.8 + Math.random() * 1.2);         // falling
      _sv.z = 0.2;
      game.fx.spark(_sp, _sv, { color: 0xe8f8ff, size: 0.14, life: 0.9 });
    }

    // Frost damage every 0.33 s to everything inside.
    this.tickAcc += dt;
    if (this.tickAcc >= TICK) {
      this.tickAcc -= TICK;
      damageArea(game, this.pos, this.radius, this.dmg, { element: 'frost', statusPower: 1 });
    }

    // Rank 5: gently pull foes toward the centre (not bosses or inert objects).
    if (this.pull) {
      const step = 2 * dt;
      for (const e of game.queryEnemies(this.pos, this.radius, _buf)) {
        if (e.dead || e.inert || e.boss) continue;
        pullToward(e.pos, this.pos.x, this.pos.z, step);
      }
    }

    return this.t < this.life;
  }

  dispose(game) {
    game.scene.remove(this.group);
    this.discMat.dispose();
    this.edgeMat.dispose();
  }
}

// Move point p by up to `step` units toward (cx, cz) on the XZ plane, never overshooting.
function pullToward(p, cx, cz, step) {
  const dx = cx - p.x;
  const dz = cz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-4) return;
  const m = Math.min(step, d) / d;
  p.x += dx * m;
  p.z += dz * m;
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
