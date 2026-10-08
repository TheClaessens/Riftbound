import * as THREE from 'three';
import { GEO, glowMaterial, ELEMENT_COLOR } from '../../core/utils.js';
import { damageEnemy } from '../combat.js';

// -------------------------------------------------------------------------------------
// Actor contract (anything added with game.addActor):
//   actor.update(dt, game) -> boolean   (return false when finished)
//   actor.dispose(game)                 (remove meshes from scene)
// -------------------------------------------------------------------------------------

const _hits = [];

// Generic glowing projectile flying on the XZ plane.
// opts:
//   pos (Vector3), dir (Vector3 XZ normalized), speed, range (max travel distance),
//   radius (hit radius), damage, element, pierce (extra enemies it passes through; Infinity ok),
//   knockback, statusPower, color, size (visual radius), height (y), mesh (custom Object3D, optional),
//   trail: { color, rate (particles/sec), size, life }
//   homing (turn rate rad/s toward nearest enemy, 0 = none), homingRange
//   onHit(game, enemy, proj)   — after damage is dealt
//   onExpire(game, proj)       — when range runs out OR pierce exhausted (proj.pos = last position)
//   hitCooldown                — if set, the projectile can re-hit the same enemy after this many seconds
export class Projectile {
  constructor(game, opts) {
    this.o = opts;
    this.pos = opts.pos.clone();
    this.pos.y = opts.height ?? 0.9;
    this.dir = opts.dir.clone().setY(0).normalize();
    this.speed = opts.speed ?? 18;
    this.range = opts.range ?? 16;
    this.travelled = 0;
    this.radius = opts.radius ?? 0.45;
    this.pierce = opts.pierce ?? 0;
    this.hit = new Map(); // enemy -> time of hit
    this.age = 0;
    this.alive = true;
    this.trailAcc = 0;
    const color = opts.color ?? ELEMENT_COLOR[opts.element] ?? 0xffffff;
    this.color = color;
    if (opts.mesh) this.mesh = opts.mesh;
    else {
      this.mesh = new THREE.Mesh(GEO.sphere, glowMaterial(color, 3));
      this.mesh.scale.setScalar(opts.size ?? 0.25);
    }
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt, game) {
    if (!this.alive) return false;
    this.age += dt;
    const o = this.o;

    if (o.homing) {
      const t = game.nearestEnemy(this.pos, o.homingRange ?? 10);
      if (t) {
        const want = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
        const ang = Math.atan2(this.dir.z, this.dir.x);
        let target = Math.atan2(want.z, want.x);
        let d = target - ang;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const step = Math.sign(d) * Math.min(Math.abs(d), o.homing * dt);
        this.dir.set(Math.cos(ang + step), 0, Math.sin(ang + step));
      }
    }

    const step = this.speed * dt;
    this.pos.addScaledVector(this.dir, step);
    this.travelled += step;
    this.mesh.position.copy(this.pos);
    if (o.spin) this.mesh.rotation.y += o.spin * dt;

    if (o.trail) {
      this.trailAcc += dt * (o.trail.rate ?? 40);
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        game.fx.spark(this.pos, { x: (Math.random() - 0.5), y: Math.random() * 0.5, z: (Math.random() - 0.5) },
          { color: o.trail.color ?? this.color, size: o.trail.size ?? 0.3, life: o.trail.life ?? 0.3 });
      }
    }

    // collisions
    for (const e of game.queryEnemies(this.pos, this.radius, _hits)) {
      const last = this.hit.get(e);
      if (last !== undefined && (o.hitCooldown === undefined || this.age - last < o.hitCooldown)) continue;
      this.hit.set(e, this.age);
      damageEnemy(game, e, o.damage ?? 10, { element: o.element, knockback: o.knockback ?? 0, dir: this.dir, statusPower: o.statusPower });
      o.onHit?.(game, e, this);
      if (this.pierce <= 0) { this.alive = false; o.onExpire?.(game, this); return false; }
      this.pierce--;
    }

    if (this.travelled >= this.range) { this.alive = false; o.onExpire?.(game, this); return false; }
    return true;
  }

  dispose(game) {
    game.scene.remove(this.mesh);
    // Only dispose materials we created (custom meshes manage themselves).
    if (!this.o.mesh) this.mesh.material.dispose();
  }
}

// Convenience: run a function every frame for `duration` seconds as an actor.
// fn(dt, t, k) where t = elapsed, k = t/duration. Optional onEnd().
export function timed(game, duration, fn, onEnd) {
  let t = 0;
  game.addActor({
    update(dt) { t += dt; fn(dt, t, Math.min(1, t / duration)); if (t >= duration) { onEnd?.(); return false; } return true; },
    dispose() {},
  });
}

// Deal damage to every enemy in a circle. Returns the array of enemies hit (copy).
export function damageArea(game, pos, radius, damage, opts = {}) {
  const hits = game.queryEnemies(pos, radius, []).slice();
  for (const e of hits) damageEnemy(game, e, damage, opts);
  return hits;
}

// Spread N directions evenly around `dir` with total angular `spread` (radians).
export function fanDirections(dir, n, spread) {
  const out = [];
  const base = Math.atan2(dir.z, dir.x);
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? base : base - spread / 2 + (spread * i) / (n - 1);
    out.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return out;
}
