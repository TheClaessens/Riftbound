import * as THREE from 'three';
import { Projectile, fanDirections, damageArea } from './common.js';
import { GEO, glowMaterial, ELEMENT_COLOR, dirXZ, randRange } from '../../core/utils.js';
import { damageEnemy } from '../combat.js';
import { blendAddMaterial } from '../fx.js';

// =====================================================================================
// FUSION SKILLS — evolved skills formed when two rank 3+ parents are combined.
// Each fusion is the payoff of deep investment in a combo pair.
// =====================================================================================

// ---------------------------------------------------------------
// FROSTFIRE COMET: Fireball + Frost Nova
// Large piercing comet that chains Steam Bursts along its path
// ---------------------------------------------------------------
export const frostfireComet = {
  id: 'frostfireComet',
  name: 'Frostfire Comet',
  icon: '☄',
  element: 'fire',
  maxRank: 3,
  range: 16,
  hint: 'Piercing comet applies Chill and Burn, chaining Steam Bursts.',
  desc: (rank) => [
    'Fire a massive comet that pierces all enemies. Each hit applies Chill AND Burn, triggering Steam Bursts.',
    '+30% damage.',
    'Fire 2 comets in a fan spread.',
  ][rank - 1],
  cooldown: (rank) => [1.6, 1.4, 1.2][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const count = r >= 3 ? 2 : 1;
    const baseDmg = 26 * (1 + (r >= 2 ? 0.3 : 0));
    const fireDmg = 14 * (1 + (r >= 2 ? 0.3 : 0));

    for (const d of fanDirections(ctx.dir, count, 0.3)) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir: d,
        speed: 13,
        range: 20,
        radius: 0.9,
        damage: baseDmg,
        element: 'frost',
        pierce: Infinity,
        knockback: 1.2,
        statusPower: 2,
        size: 0.6,
        trail: { color: 0xff6a1f, rate: 80, size: 0.4, life: 0.15 },
        color: 0xffffff,
        onHit: (g, e, p) => {
          // Fire damage hit triggers Steam Burst on chilled enemy
          damageEnemy(g, e, fireDmg, { element: 'fire' });
          // Visual burst at impact
          g.fx.burst(p.pos, { color: 0xff8a4a, count: 6, speed: 4, life: 0.3, size: 0.3 });
        },
        onExpire: (g, p) => {
          const r2 = 3 * game.player.stats.area;
          g.fx.ring(p.pos, { color: 0xff8a4a, radius: r2, life: 0.35 });
          g.fx.flashDisc(p.pos, { color: 0xff6a1f, radius: r2 * 0.9, life: 0.25 });
          g.fx.burst(p.pos, { color: 0xffa060, count: 20, speed: 7, life: 0.5, size: 0.35 });
          g.fx.light(p.pos, 0xff8a2a, 50, 0.3);
          g.fx.shake(0.2);
          damageArea(g, p.pos, r2, 30, { element: 'fire' });
        },
      }));
    }

    // Starting burst fx
    game.fx.burst(ctx.origin, { color: 0xffa060, count: 5, speed: 3, life: 0.2, size: 0.3 });
  },
};

// ---------------------------------------------------------------
// PLASMA ORB: Fireball + Chain Lightning
// Slow orb that zaps nearby enemies then detonates (Fire damage → Overload chain)
// ---------------------------------------------------------------
export const plasmaOrb = {
  id: 'plasmaOrb',
  name: 'Plasma Orb',
  icon: '◍',
  element: 'storm',
  maxRank: 3,
  range: 14,
  hint: 'Slow orb zaps enemies and detonates, overloading all of them.',
  desc: (rank) => [
    'Send a pulsing orb that zaps up to 3 nearby enemies, then detonates.',
    'Zaps up to 5 enemies instead of 3.',
    'Larger detonation radius.',
  ][rank - 1],
  cooldown: (rank) => [2.6, 2.3, 2.0][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const target = ctx.target.clone();
    target.y = 0.9;

    const orbActor = {
      pos: Object.assign(ctx.origin.clone(), { y: 0.9 }),
      target: target,
      travelled: 0,
      maxDist: 14,
      speed: 5,
      alive: true,
      lastZap: 0,
      mesh: null,
      halo: null,

      init() {
        const mat = glowMaterial(0xffe14a, 1.8);
        this.mesh = new THREE.Mesh(GEO.sphere, mat);
        this.mesh.scale.setScalar(0.35);
        this.mesh.position.copy(this.pos);
        game.scene.add(this.mesh);

        // Additive orange halo
        const halMat = blendAddMaterial(0xff8a2a, { hdr: 1.5, opacity: 0.6, occ: 0.3 });
        this.halo = new THREE.Mesh(GEO.sphere, halMat);
        this.halo.scale.setScalar(0.55);
        this.halo.position.copy(this.pos);
        game.scene.add(this.halo);
      },

      update(dt, g) {
        if (!this.alive) return false;

        // Move toward target
        const dir = new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
        const dist = dir.length();
        if (dist > 1e-6) dir.multiplyScalar(1 / dist);
        const step = this.speed * dt;
        this.pos.addScaledVector(dir, step);
        this.travelled += step;
        this.mesh.position.copy(this.pos);
        this.halo.position.copy(this.pos);

        // Pulsing animation
        const pulse = 1 + Math.sin(g.time * 8) * 0.15;
        this.mesh.scale.setScalar(0.35 * pulse);
        this.halo.scale.setScalar(0.55 * pulse);

        // Small orbiting sparks
        if (Math.random() < 0.3) {
          const a = Math.random() * Math.PI * 2;
          const sp = 4;
          g.fx.spark(this.pos, {
            x: Math.cos(a) * sp,
            y: 0.5,
            z: Math.sin(a) * sp,
          }, { color: 0xff8a2a, size: 0.2, life: 0.3 });
        }

        // Zap nearby enemies every 0.25s
        this.lastZap += dt;
        if (this.lastZap >= 0.25) {
          this.lastZap = 0;
          const zapCount = r >= 2 ? 5 : 3;
          const targets = g.queryEnemies(this.pos, 4.5 * g.player.stats.area, []).slice(0, zapCount);
          for (const e of targets) {
            g.fx.lightning(this.pos, e.pos, { color: 0xffe14a, life: 0.15 });
            damageEnemy(g, e, 10, { element: 'storm' });
          }
        }

        // Finish when travelled far enough or reached target
        if (this.travelled >= this.maxDist || (new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z).length() < 0.5)) {
          this.alive = false;
          this._detonate(g);
          return false;
        }
        return true;
      },

      _detonate(g) {
        const r2 = (r >= 3 ? 4.5 : 3.5) * g.player.stats.area;
        g.fx.flashDisc(this.pos, { color: 0xff8a2a, radius: r2, life: 0.3, hdr: 1.3 });
        g.fx.ring(this.pos, { color: 0xff8a2a, radius: r2, life: 0.4, width: 0.3 });
        g.fx.burst(this.pos, { color: 0xff8a2a, count: 30, speed: 9, life: 0.6, size: 0.4, backing: 0.4, backingColor: 0x2a0f06 });
        g.fx.light(this.pos, 0xff8a2a, 60, 0.35);
        g.fx.shake(0.25);

        // Deal fire damage, which triggers overload on shocked enemies
        const enemies = g.queryEnemies(this.pos, r2, []).slice();
        for (const e of enemies) {
          damageEnemy(g, e, 40, { element: 'fire' });
        }
      },

      dispose(g) {
        g.scene.remove(this.mesh);
        g.scene.remove(this.halo);
        this.mesh.material.dispose();
        this.halo.material.dispose();
      },
    };

    orbActor.init();
    game.addActor(orbActor);
  },
};

// ---------------------------------------------------------------
// STORM HALO: Chain Lightning + Spirit Orbs
// Passive orbiting wisps that chain lightning to enemies
// ---------------------------------------------------------------
export const stormHalo = {
  id: 'stormHalo',
  name: 'Storm Halo',
  icon: '✺',
  element: 'storm',
  maxRank: 3,
  range: 3,
  hint: 'Orbiting lightning wisps that chain on contact.',
  desc: (rank) => [
    'Summon 4 lightning wisps that orbit you and zap enemies on contact.',
    'Summon 5 wisps instead.',
    'Summon 6 wisps.',
  ][rank - 1],
  cooldown: () => 0,

  init(game, state, rank) {
    state.wisps = [];
    const count = [4, 5, 6][rank - 1];
    for (let i = 0; i < count; i++) {
      state.wisps.push({
        angle: (i / count) * Math.PI * 2,
        mesh: null,
        lastHitEnemies: new Map(), // enemy -> time of last hit
        lastZap: 0,
      });
    }
  },

  update(game, dt, state, rank) {
    const orbitRadius = 2.6 * game.player.stats.area;
    const angularSpeed = 3.2;

    for (const wisp of state.wisps) {
      wisp.angle += angularSpeed * dt;

      // Position wisp around player
      const x = game.player.pos.x + Math.cos(wisp.angle) * orbitRadius;
      const z = game.player.pos.z + Math.sin(wisp.angle) * orbitRadius;
      const y = 1.0;

      if (!wisp.mesh) {
        const mat = glowMaterial(0xffe14a, 1.8);
        wisp.mesh = new THREE.Mesh(GEO.sphere, mat);
        wisp.mesh.scale.setScalar(0.25);
        game.scene.add(wisp.mesh);
      }
      wisp.mesh.position.set(x, y, z);

      // Small crackling sparks
      if (Math.random() < 0.4) {
        game.fx.spark(wisp.mesh.position, {
          x: randRange(-2, 2),
          y: randRange(0, 2),
          z: randRange(-2, 2),
        }, { color: 0xffe14a, size: 0.15, life: 0.25 });
      }

      // Contact damage (radius 0.6)
      const contactEnemies = game.queryEnemies(wisp.mesh.position, 0.6, []).slice();
      for (const e of contactEnemies) {
        const lastHit = wisp.lastHitEnemies.get(e) ?? -0.6;
        if (game.time - lastHit >= 0.5) {
          wisp.lastHitEnemies.set(e, game.time);
          damageEnemy(game, e, 14, { element: 'storm' });

          // Chain to up to 2 more enemies within 4 units
          const chainTargets = game.queryEnemies(e.pos, 4, []).filter((t) => t !== e).slice(0, 2);
          for (const t of chainTargets) {
            game.fx.lightning(e.pos, t.pos, { color: 0xffe14a, life: 0.15 });
            damageEnemy(game, t, 8, { element: 'storm' });
          }
        }
      }

      // Periodic zap to nearest enemy every 1.2s
      wisp.lastZap += dt;
      if (wisp.lastZap >= 1.2) {
        wisp.lastZap = 0;
        const nearest = game.nearestEnemy(wisp.mesh.position, 7);
        if (nearest) {
          game.fx.lightning(wisp.mesh.position, nearest.pos, { color: 0xffe14a, life: 0.15 });
          damageEnemy(game, nearest, 12, { element: 'storm' });
        }
      }
    }
  },

  onRankUp(game, state, rank) {
    // Add new wisps if ranking up
    const prevCount = [4, 5, 6][rank - 2] ?? 4;
    const newCount = [4, 5, 6][rank - 1];
    for (let i = prevCount; i < newCount; i++) {
      state.wisps.push({
        angle: (i / newCount) * Math.PI * 2,
        mesh: null,
        lastHitEnemies: new Map(),
        lastZap: 0,
      });
    }
  },

  dispose(game, state) {
    for (const wisp of state.wisps) {
      if (wisp.mesh) {
        game.scene.remove(wisp.mesh);
        wisp.mesh.material.dispose();
      }
    }
    state.wisps = [];
  },
};

// ---------------------------------------------------------------
// ARCANE BARRAGE: Arcane Bolt + Spirit Orbs
// REPLACES Arcane Bolt: fires more homing missiles + orbiting orbs that fire too
// ---------------------------------------------------------------
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
        size: 0.18,
        homing: 7,
        homingRange: 10,
        trail: { color: 0xb67cff, rate: 50, size: 0.22, life: 0.2 },
        onHit: (g, e, p) => {
          g.fx.burst(p.pos, { color: 0xb67cff, count: 4, speed: 3, life: 0.25, size: 0.25 });
        },
      }));
    }

    game.fx.burst(ctx.origin, { color: 0xb67cff, count: 5, speed: 2, life: 0.2, size: 0.3 });
  },

  init(game, state, rank) {
    state.orbs = [];
    state.orbFireCooldown = [];

    for (let i = 0; i < 3; i++) {
      state.orbs.push({
        angle: (i / 3) * Math.PI * 2,
        mesh: null,
        lastHitEnemies: new Map(), // enemy -> time of last hit
      });
      state.orbFireCooldown.push(0);
    }
  },

  update(game, dt, state, rank) {
    const orbitRadius = 1.8;
    const angularSpeed = 2;
    const fireInterval = rank >= 3 ? 1.4 : 2.0;

    for (let i = 0; i < state.orbs.length; i++) {
      const orb = state.orbs[i];
      orb.angle += angularSpeed * dt;

      // Position orb around player
      const x = game.player.pos.x + Math.cos(orb.angle) * orbitRadius;
      const z = game.player.pos.z + Math.sin(orb.angle) * orbitRadius;
      const y = 1.0;

      if (!orb.mesh) {
        const mat = glowMaterial(0xb67cff, 1.8);
        orb.mesh = new THREE.Mesh(GEO.sphere, mat);
        orb.mesh.scale.setScalar(0.3);
        game.scene.add(orb.mesh);
      }
      orb.mesh.position.set(x, y, z);

      // Contact damage (radius 0.6, per-enemy cooldown 0.5s)
      const contactEnemies = game.queryEnemies(orb.mesh.position, 0.6, []).slice();
      for (const e of contactEnemies) {
        const lastHit = orb.lastHitEnemies.get(e) ?? -0.6;
        if (game.time - lastHit >= 0.5) {
          orb.lastHitEnemies.set(e, game.time);
          damageEnemy(game, e, 8, { element: 'arcane' });
        }
      }

      // Fire homing missile every fireInterval seconds
      state.orbFireCooldown[i] += dt;
      if (state.orbFireCooldown[i] >= fireInterval) {
        state.orbFireCooldown[i] = 0;
        const nearest = game.nearestEnemy(orb.mesh.position, 10);
        if (nearest) {
          game.addActor(new Projectile(game, {
            pos: orb.mesh.position.clone(),
            dir: dirXZ(orb.mesh.position, nearest.pos, new THREE.Vector3()),
            speed: 16,
            range: 22,
            radius: 0.3,
            damage: 15,
            element: 'arcane',
            pierce: 0,
            knockback: 0.8,
            size: 0.18,
            homing: 7,
            homingRange: 10,
            trail: { color: 0xb67cff, rate: 50, size: 0.22, life: 0.2 },
            onHit: (g, e, p) => {
              g.fx.burst(p.pos, { color: 0xb67cff, count: 4, speed: 3, life: 0.25, size: 0.25 });
            },
          }));
        }
      }
    }
  },

  onRankUp(game, state, rank) {
    // No changes needed on rank up (same number of orbs)
  },

  dispose(game, state) {
    for (const orb of state.orbs) {
      if (orb.mesh) {
        game.scene.remove(orb.mesh);
        orb.mesh.material.dispose();
      }
    }
    state.orbs = [];
    state.orbFireCooldown = [];
  },
};
