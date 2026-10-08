import * as THREE from 'three';
import { GEO } from '../../core/utils.js';
import { blendAddMaterial } from '../fx.js';
import { damageEnemy } from '../combat.js';

// STATIC FIELD (storm, AUTO). No cast(): takes no slot. Every INTERVAL seconds it sky-strikes
// random foes near the player. State lives in `state` (per skill entry); the def is shared.
const INTERVAL = [1.3, 1.2, 1.1, 1.0, 0.9];
const STRIKES = [1, 1, 2, 2, 3];
const RANGE = 10;
const BASE_DMG = 22;
const HALO_RADIUS = 1.1;

const _buf = [];            // reused query buffer (queryEnemies clears it)

export const staticField = {
  id: 'staticField',
  name: 'Static Field',
  icon: '☈',
  element: 'storm',
  maxRank: 5,
  range: RANGE,
  hint: 'Shocks foes: follow with Fire for Overload or Frost for Superconduct.',
  desc: (rank) => [
    'Auto: every 1.3s, sky-strike 1 random foe within 10 u for 22 storm damage.',
    'Strikes every 1.2s.',
    'Strikes 2 foes every 1.1s.',
    'Strikes 2 foes every 1.0s, +30% damage.',
    'Strikes 3 foes every 0.9s.',
  ][rank - 1],
  cooldown: (rank) => INTERVAL[rank - 1],

  init(game, state, rank) {
    state.cd = INTERVAL[rank - 1];
    state.t = 0;
    // Faint crackling halo around the player (per-instance material, disposed in dispose()).
    state.mat = blendAddMaterial(0xffe14a, { hdr: 1.4, opacity: 0.2, occ: 0.4, side: THREE.DoubleSide, depthTest: false });
    state.mesh = new THREE.Mesh(GEO.ring, state.mat);
    state.mesh.rotation.x = -Math.PI / 2;
    state.mesh.scale.setScalar(HALO_RADIUS);
    game.scene.add(state.mesh);
  },

  onRankUp(game, state, rank) {
    // A faster interval applies immediately.
    state.cd = Math.min(state.cd, INTERVAL[rank - 1]);
  },

  update(game, dt, state, rank) {
    const p = game.player;
    state.t += dt;

    if (state.mesh) {
      state.mesh.position.set(p.pos.x, 0.09, p.pos.z);
      // Uneven flicker reads as crackling.
      state.mat.opacity = 0.16 + 0.2 * Math.abs(Math.sin(state.t * 13) * Math.sin(state.t * 5.3));
    }

    state.cd -= dt;
    if (state.cd > 0) return;
    state.cd += INTERVAL[rank - 1];

    const area = p.stats.area;
    const range = RANGE * area;
    const range2 = range * range;
    const pool = game.queryEnemies(p.pos, range, _buf).filter((e) => {
      if (e.dead || e.inert) return false;
      const dx = e.pos.x - p.pos.x;
      const dz = e.pos.z - p.pos.z;
      return dx * dx + dz * dz <= range2;
    });

    // Strike N distinct random foes (partial Fisher-Yates over the pool).
    const want = Math.min(STRIKES[rank - 1], pool.length);
    for (let i = 0; i < want; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      const e = pool[j];
      pool[j] = pool[i];
      pool[i] = e;
      strike(game, e, rank, area);
    }
  },

  dispose(game, state) {
    if (state.mesh) {
      game.scene.remove(state.mesh);
      state.mat.dispose();
      state.mesh = null;
    }
  },
};

// One sky strike: lightning from high above the foe, a small ring, then storm damage.
function strike(game, e, rank, area) {
  const dmg = BASE_DMG * (rank >= 4 ? 1.3 : 1);   // rank 4: +30% damage
  game.fx.lightning({ x: e.pos.x, y: 12, z: e.pos.z }, { x: e.pos.x, y: 0.9, z: e.pos.z }, { color: 0xffe14a, life: 0.14, jag: 0.5 });
  game.fx.ring(e.pos, { color: 0xffe14a, radius: 1.2 * area, life: 0.25 });
  game.fx.light(e.pos, 0xffe14a, 20, 0.2);
  damageEnemy(game, e, dmg, { element: 'storm' });
}
