import * as THREE from 'three';
import { damageEnemy } from '../combat.js';
import { arcaneKit, convergePop, COL, chestY } from '../vfx/elements/arcane.js';

// SPIRIT ORBS (arcane, auto). Look (bible 10 §4.2): tiny bound moons of starlight, each a miniature
// galaxy (fresnel rim, swirling void interior, white 4-point core) with a rune satellite. Each drags
// a tapered arc of its own orbit (the arcs of 2–5 moons sketch the orbit radius without a circle).
// Hits squash the moon and converge-pop on the foe. r3/r5 brighten the moons; r5 adds faint
// constellation lines between consecutive moons and longer arcs. Drawn by the arcane kit (0 meshes).

const _pp = { x: 0, y: 0, z: 0 };

export const spiritOrbs = {
  id: 'spiritOrbs',
  name: 'Spirit Orbs',
  icon: '◈',
  element: 'arcane',
  maxRank: 5,
  range: 3,
  hint: 'Orbs Shatter frozen enemies on contact.',
  desc: (rank) => [
    'Passive: 2 arcane orbs orbit you, damaging enemies on contact.',
    '+1 orb.',
    '+1 orb, +25% damage.',
    '+1 orb.',
    '+1 orb, +25% damage.',
  ][rank - 1],
  cooldown: () => 0,

  init(game, state, rank) {
    state.orbs = [];
    state.time = 0;
    rebuildOrbs(game, state, rank);
  },

  update(game, dt, state, rank) {
    state.time += dt;

    for (const orb of state.orbs) {
      updateOrb(game, orb, dt, rank);
    }
    drawOrbs(game, state, rank, dt);
  },

  onRankUp(game, state, rank) {
    // Rebuild orbs with new count
    state.orbs = [];
    rebuildOrbs(game, state, rank);
  },

  dispose(game, state) {
    state.orbs = [];
  },
};

function rebuildOrbs(game, state, rank) {
  const orbCount = [2, 3, 3, 4, 5][rank - 1];
  const orbitRadius = rank >= 5 ? 2.8 * game.player.stats.area : 2.2 * game.player.stats.area;

  for (let i = 0; i < orbCount; i++) {
    const angle = (i / orbCount) * Math.PI * 2;

    state.orbs.push({
      index: i,
      angle,
      orbitRadius,
      pos: new THREE.Vector3(),
      bob: 0,
      hitCooldowns: new Map(), // enemy -> time remaining
      // visual only
      squash: 0, popCd: 0, seed: Math.random() * 30, dust: Math.random(),
    });
  }
}

function updateOrb(game, orb, dt, rank) {
  const angularSpeed = 2.6;

  // Update angle and position
  orb.angle += angularSpeed * dt;
  orb.bob += dt * 3;

  const x = game.player.pos.x + Math.cos(orb.angle) * orb.orbitRadius;
  const z = game.player.pos.z + Math.sin(orb.angle) * orb.orbitRadius;
  const y = 1.0 + Math.sin(orb.bob) * 0.15;

  orb.pos.set(x, y, z);

  // Decay and clean up expired hit cooldowns
  const toDelete = [];
  for (const [enemy, timeLeft] of orb.hitCooldowns) {
    const newTime = timeLeft - dt;
    if (enemy.dead || newTime <= 0) {
      toDelete.push(enemy);
    } else {
      orb.hitCooldowns.set(enemy, newTime);
    }
  }
  for (const enemy of toDelete) {
    orb.hitCooldowns.delete(enemy);
  }

  // Check collisions
  const orbPos = orb.pos;
  const enemies = game.queryEnemies(orbPos, 0.55, []).slice();

  orb.popCd -= dt;
  for (const enemy of enemies) {
    const cooldown = orb.hitCooldowns.get(enemy);
    if (cooldown !== undefined && cooldown > 0) continue; // Still on cooldown

    const dmg = 9 * (1 + (rank >= 3 ? 0.25 : 0) + (rank >= 5 ? 0.25 : 0));
    damageEnemy(game, enemy, dmg, { element: 'arcane', knockback: 3 });
    orb.hitCooldowns.set(enemy, 0.5); // Set cooldown
    // visual: the moon squashes, the foe gets a converge-pop + glyph (at most one pop per moon per 0.12 s)
    orb.squash = 0.06;
    if (orb.popCd <= 0) {
      orb.popCd = 0.12;
      _pp.x = enemy.pos.x; _pp.y = chestY(enemy); _pp.z = enemy.pos.z;
      convergePop(game, _pp, 0.85, { glyph: true, sparks: 3 });
    }
  }
}

// ---------------------------------------------------------------- visuals (kit, immediate mode)
const ARC_SEGS = 7;
function drawOrbs(game, state, rank, dt) {
  const K = arcaneKit(game);
  const orbs = state.orbs;
  const n = orbs.length;
  if (!n) return;
  const px = game.player.pos.x, pz = game.player.pos.z;
  const bright = 1 + (rank >= 3 ? 0.15 : 0) + (rank >= 5 ? 0.15 : 0);
  const arcLen = rank >= 5 ? 1.8 : 1.4;
  const tier = K.tier();
  const t = state.time;
  for (const o of orbs) {
    const r = o.orbitRadius;
    // orbit arc: tapered strip along the circle behind the moon
    const span = arcLen / r;
    let ax = o.pos.x, ay = o.pos.y, az = o.pos.z;
    for (let k = 1; k <= ARC_SEGS; k++) {
      const u0 = (k - 1) / ARC_SEGS, u1 = k / ARC_SEGS;
      const a = o.angle - span * u1;
      const bx = px + Math.cos(a) * r, bz = pz + Math.sin(a) * r;
      const by = 1.0 + Math.sin(o.bob - 3 * (span * u1) / 2.6) * 0.15;
      const w0 = 0.24 * (1 - u0), w1 = 0.24 * (1 - u1);
      K.line(ax, ay, az, bx, by, bz, w0, COL.body, 1.6 * bright, 0.95 * (1 - u0), w0 > 1e-4 ? w1 / w0 : 0, (1 - u1) / Math.max(1e-3, 1 - u0), 0.8 * (1 - u0));
      ax = bx; ay = by; az = bz;
    }
    // the moon
    o.squash = Math.max(0, o.squash - dt);
    const sq = o.squash > 0 ? 0.8 : 1;
    K.orb(o.pos.x, o.pos.y, o.pos.z, 0.6 * (o.squash > 0 ? 1.12 : 1), sq, COL.body, 1.5, 1, bright, o.seed, rank >= 5 ? 1.3 : 1);
    // rune satellite (0.35 u, 4 rad/s)
    const sa = t * 4 + o.seed;
    K.glyph(o.pos.x + Math.cos(sa) * 0.35, o.pos.y + Math.sin(sa * 0.7) * 0.08, o.pos.z + Math.sin(sa) * 0.35, 0.17, COL.hi, 1.7, 0.95, 1, 0, -t * 2, o.seed, 0.4);
    // starlight dust shed along the orbit (~3/s per moon)
    if (tier === 0) {
      o.dust += dt * 3;
      if (o.dust >= 1) {
        o.dust -= 1;
        _pp.x = o.pos.x; _pp.y = o.pos.y; _pp.z = o.pos.z;
        game.vfx.emit(Math.random() < 0.5 ? 'arcaneStar' : 'arcaneStarHi', _pp, { count: 1, scale: 1.1 });
      }
    }
  }
  // r5: faint constellation lines between consecutive moons (a star polygon rotating around you)
  if (rank >= 5 && n > 2) {
    for (let i = 0; i < n; i++) {
      const a = orbs[i].pos, b = orbs[(i + 1) % n].pos;
      K.line(a.x, a.y, a.z, b.x, b.y, b.z, 0.045, COL.body, 1.3, 0.35, 1, 1, 0.2);
    }
  }
}
