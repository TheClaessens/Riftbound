import * as THREE from 'three';
import { glowMaterial, GEO, ELEMENT_COLOR } from '../../core/utils.js';
import { damageEnemy } from '../combat.js';

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
  },

  onRankUp(game, state, rank) {
    // Rebuild orbs with new count
    for (const orb of state.orbs) {
      game.scene.remove(orb.mesh);
      orb.material.dispose();
    }
    state.orbs = [];
    rebuildOrbs(game, state, rank);
  },

  dispose(game, state) {
    for (const orb of state.orbs) {
      game.scene.remove(orb.mesh);
      orb.material.dispose();
    }
    state.orbs = [];
  },
};

function rebuildOrbs(game, state, rank) {
  const orbCount = [2, 3, 3, 4, 5][rank - 1];
  const orbitRadius = rank >= 5 ? 2.8 * game.player.stats.area : 2.2 * game.player.stats.area;

  for (let i = 0; i < orbCount; i++) {
    const angle = (i / orbCount) * Math.PI * 2;
    const material = glowMaterial(ELEMENT_COLOR.arcane, 3.5);
    const mesh = new THREE.Mesh(GEO.sphere, material);
    mesh.scale.setScalar(0.22);
    game.scene.add(mesh);

    state.orbs.push({
      index: i,
      angle,
      orbitRadius,
      mesh,
      material,
      bob: 0,
      hitCooldowns: new Map(), // enemy -> time remaining
      trails: [],
    });
  }
}

function updateOrb(game, orb, dt, rank) {
  const orbCount = [2, 3, 3, 4, 5][rank - 1];
  const angularSpeed = 2.6;

  // Update angle and position
  orb.angle += angularSpeed * dt;
  orb.bob += dt * 3;

  const x = game.player.pos.x + Math.cos(orb.angle) * orb.orbitRadius;
  const z = game.player.pos.z + Math.sin(orb.angle) * orb.orbitRadius;
  const y = 1.0 + Math.sin(orb.bob) * 0.15;

  orb.mesh.position.set(x, y, z);

  // Trail particles
  if (Math.random() < 0.4) {
    game.fx.spark(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(
        (Math.random() - 0.5) * 1,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 1
      ),
      { color: 0xb67cff, size: 0.15, life: 0.3 }
    );
  }

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
  const orbPos = orb.mesh.position;
  const enemies = game.queryEnemies(orbPos, 0.55, []).slice();

  for (const enemy of enemies) {
    const cooldown = orb.hitCooldowns.get(enemy);
    if (cooldown !== undefined && cooldown > 0) continue; // Still on cooldown

    const dmg = 9 * (1 + (rank >= 3 ? 0.25 : 0) + (rank >= 5 ? 0.25 : 0));
    damageEnemy(game, enemy, dmg, { element: 'arcane', knockback: 3 });
    orb.hitCooldowns.set(enemy, 0.5); // Set cooldown
  }
}
