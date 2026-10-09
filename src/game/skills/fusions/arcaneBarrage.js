import * as THREE from 'three';
import { Projectile, fanDirections } from '../common.js';
import { dirXZ } from '../../../core/utils.js';
import { damageEnemy } from '../../combat.js';
import { arcaneKit, StarBolt, COL } from '../../vfx/elements/arcane.js';

// ARCANE BARRAGE (Arcane Bolt + Spirit Orbs). Look (bible 10 §4.3): a flock of starlight darts that
// curve like birds, launched from three rune moons. The cast flashes a rune seal behind the caster
// and the darts burst out of it; each dart is an Arcane Bolt head at 0.7× with a curving tail through
// its own path. The three moons show a rotating rune face that spins up and glows for 0.15 s
// before a dart pops out. Hits: a small converge-pop. Drawn by the arcane kit (no meshes).

const _pp = { x: 0, y: 0, z: 0 };

function missileVisual(game) {
  return new StarBolt(game, { scale: 0.8, len: 1.2, dots: 7, stamp: 0.2 });
}

export const arcaneBarrage = {
  id: 'arcaneBarrage',
  name: 'Arcane Barrage',
  icon: '✷',
  element: 'arcane',
  maxRank: 3,
  range: 16,
  hint: 'Orbiting orbs fire homing missiles at enemies. Shatters Frozen foes.',
  desc: (rank) => [
    'Fire a barrage of homing arcane missiles in a wide fan. 3 orbiting orbs also fire missiles.',
    'Increased missile count.',
    'Orbs fire more frequently.',
  ][rank - 1],
  cooldown: (rank) => [0.55, 0.5, 0.45][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const count = 2 + r + game.player.stats.projectiles;
    const dmg = 15 * (1 + (r >= 2 ? 0.15 : 0));

    for (const d of fanDirections(ctx.dir, count, 0.9)) {
      const v = missileVisual(game);
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir: d,
        speed: 16,
        range: 22,
        radius: 0.35,
        damage: dmg,
        element: 'arcane',
        pierce: 0,
        knockback: 1.0,
        homing: 7,
        homingRange: 10,
        mesh: null,
        onUpdate: (g, p, dt) => v.update(g, p, dt),
        onHit: (g, e, p) => v.hit(g, e, p),
        onExpire: (g, p) => v.expire(g, p),
      }));
    }

    // launch seal: a rune disc flashes behind the caster, the darts burst out of it
    const K = arcaneKit(game);
    K.timed('glyph', ctx.origin.x - ctx.dir.x * 0.6, 1.25, ctx.origin.z - ctx.dir.z * 0.6, 1.1, 0.24,
      { color: COL.body, hdr: 1.8, write: 0.25, unwrite: 0.4, spin: 3, bias: 0.6 });
    _pp.x = ctx.origin.x + ctx.dir.x * 0.4; _pp.y = 0.95; _pp.z = ctx.origin.z + ctx.dir.z * 0.4;
    game.vfx.emit('arcaneSpark', _pp, { count: 5, dir: ctx.dir, cone: 0.7 });
  },

  init(game, state, rank) {
    state.orbs = [];
    state.orbFireCooldown = [];

    for (let i = 0; i < 3; i++) {
      state.orbs.push({
        angle: (i / 3) * Math.PI * 2,
        pos: new THREE.Vector3(),
        lastHitEnemies: new Map(), // enemy -> time of last hit
        seed: Math.random() * 30, turn: Math.random() * 6, squash: 0,
      });
      state.orbFireCooldown.push(0);
    }
  },

  update(game, dt, state, rank) {
    const orbitRadius = 1.8;
    const angularSpeed = 2;
    const fireInterval = rank >= 3 ? 1.4 : 2.0;
    const K = arcaneKit(game);

    for (let i = 0; i < state.orbs.length; i++) {
      const orb = state.orbs[i];
      orb.angle += angularSpeed * dt;

      // Position orb around player
      const x = game.player.pos.x + Math.cos(orb.angle) * orbitRadius;
      const z = game.player.pos.z + Math.sin(orb.angle) * orbitRadius;
      const y = 1.0;

      orb.pos.set(x, y, z);

      // Contact damage (radius 0.6, per-enemy cooldown 0.5s)
      const contactEnemies = game.queryEnemies(orb.pos, 0.6, []).slice();
      for (const e of contactEnemies) {
        const lastHit = orb.lastHitEnemies.get(e) ?? -0.6;
        if (game.time - lastHit >= 0.5) {
          orb.lastHitEnemies.set(e, game.time);
          damageEnemy(game, e, 8, { element: 'arcane' });
          orb.squash = 0.06;
        }
      }

      // Fire homing missile every fireInterval seconds
      state.orbFireCooldown[i] += dt;
      if (state.orbFireCooldown[i] >= fireInterval) {
        state.orbFireCooldown[i] = 0;
        const nearest = game.nearestEnemy(orb.pos, 10);
        if (nearest) {
          const v = missileVisual(game);
          game.addActor(new Projectile(game, {
            pos: orb.pos.clone(),
            dir: dirXZ(orb.pos, nearest.pos, new THREE.Vector3()),
            speed: 16,
            range: 22,
            radius: 0.3,
            damage: 15,
            element: 'arcane',
            pierce: 0,
            knockback: 0.8,
            homing: 7,
            homingRange: 10,
            mesh: null,
            onUpdate: (g, p, dt2) => v.update(g, p, dt2),
            onHit: (g, e, p) => v.hit(g, e, p),
            onExpire: (g, p) => v.expire(g, p),
          }));
          _pp.x = orb.pos.x; _pp.y = orb.pos.y; _pp.z = orb.pos.z;
          K.timed('flare', _pp.x, _pp.y, _pp.z, 0.7, 0.1, { color: COL.hi, hdr: 1.8 });
        }
      }

      // ---- the rune moon (visual): spins up and glows in the 0.15 s before it fires
      const pre = Math.max(0, 1 - (fireInterval - state.orbFireCooldown[i]) / 0.15);
      orb.turn += dt * (1.2 + 14 * pre);
      orb.squash = Math.max(0, orb.squash - dt);
      K.orb(x, y, z, 0.5, orb.squash > 0 ? 0.8 : 1, COL.body, 1.5, 1, 1.15 + 0.5 * pre, orb.seed, 1);
      K.glyph(x, y, z, 0.36 * (1 + 0.15 * pre), COL.hi, 1.5 + 0.9 * pre, 0.9, 1, 0, orb.turn, orb.seed, 0.45);
      // short orbit arc behind the moon
      const span = 0.9 / orbitRadius;
      let ax = x, az = z;
      for (let k = 1; k <= 4; k++) {
        const u0 = (k - 1) / 4, u1 = k / 4;
        const a = orb.angle - span * u1;
        const bx = game.player.pos.x + Math.cos(a) * orbitRadius, bz = game.player.pos.z + Math.sin(a) * orbitRadius;
        const w0 = 0.14 * (1 - u0), w1 = 0.14 * (1 - u1);
        K.line(ax, y, az, bx, y, bz, w0, COL.edge, 1.5, 0.85 * (1 - u0), w0 > 1e-4 ? w1 / w0 : 0, (1 - u1) / Math.max(1e-3, 1 - u0), 0.5 * (1 - u0));
        ax = bx; az = bz;
      }
    }
  },

  onRankUp(game, state, rank) {
    // No changes needed on rank up (same number of orbs)
  },

  dispose(game, state) {
    state.orbs = [];
    state.orbFireCooldown = [];
  },
};
