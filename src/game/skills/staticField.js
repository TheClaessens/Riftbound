import * as THREE from 'three';
import { GEO } from '../../core/utils.js';
import { blendAddMaterial } from '../fx.js';
import { damageEnemy } from '../combat.js';
import { skyPuff, STORM } from '../vfx/elements/storm.js';

// STATIC FIELD (storm, AUTO). No cast(): takes no slot. Every INTERVAL seconds it sky-strikes
// random foes near the player. State lives in `state` (per skill entry); the def is shared.
//
// Look (bible 10 §4.2, "you carry a charged sky"): tiny ground arcs crawl around the hero's feet
// and flicker-star motes rise off them. PRE_ROLL s before each tick the strike targets are chosen
// (same pool, same count, same uniform pick) and a slate cloud puff forms over each one; on the
// original tick the puff lights from inside and drops a forked bolt that grounds out. Damage timing
// is unchanged; a pre-picked foe that died or left the range is re-picked on the tick.
const INTERVAL = [1.3, 1.2, 1.1, 1.0, 0.9];
const STRIKES = [1, 1, 2, 2, 3];
const RANGE = 10;
const BASE_DMG = 22;
const HALO_RADIUS = 1.1;
const PRE_ROLL = 0.15;

const _buf = [];            // reused query buffer (queryEnemies clears it)
const _g = { x: 0, y: 0, z: 0 };

// The live strike pool around the player (gameplay filter, unchanged).
function strikePool(game, area) {
  const p = game.player;
  const range = RANGE * area;
  const range2 = range * range;
  return game.queryEnemies(p.pos, range, _buf).filter((e) => {
    if (e.dead || e.inert) return false;
    const dx = e.pos.x - p.pos.x;
    const dz = e.pos.z - p.pos.z;
    return dx * dx + dz * dz <= range2;
  });
}

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
    state.pre = null;        // pre-rolled [{ e, puff }] for the coming tick
    state.arcT = 0;
    state.moteT = 0;
    if (game.vfx) return;
    // (no vfx toolkit) faint crackling halo around the player
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
    if (game.vfx) aura(game, dt, state, rank);

    state.cd -= dt;
    const area = p.stats.area;

    // Pre-roll (visual anticipation): choose the coming tick's targets now and gather a puff over each.
    if (game.vfx && !state.pre && state.cd <= PRE_ROLL && state.cd > 0) {
      const pool = strikePool(game, area);
      const want = Math.min(STRIKES[rank - 1], pool.length);
      state.pre = [];
      for (let i = 0; i < want; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        const e = pool[j];
        pool[j] = pool[i];
        pool[i] = e;
        state.pre.push({ e, puff: skyPuff(game, e.pos, state.cd, { fulgurite: rank >= 4 ? 1.2 : 0, width: rank >= 4 ? 0.44 : 0.38 }) });
      }
    }

    if (state.cd > 0) return;
    state.cd += INTERVAL[rank - 1];

    const pool = strikePool(game, area);
    // Strike N distinct random foes (partial Fisher-Yates over the pool). Pre-picked foes that are
    // still valid lead; the rest of the N are drawn uniformly from the remaining pool.
    const want = Math.min(STRIKES[rank - 1], pool.length);
    const pre = state.pre;
    state.pre = null;
    let i = 0;
    if (pre) {
      for (const pk of pre) {
        const k = i < want ? pool.indexOf(pk.e, i) : -1;
        if (k < 0) { pk.puff.end(); continue; }
        pool[k] = pool[i];
        pool[i] = pk.e;
        strike(game, pk.e, rank, area, pk.puff);
        i++;
      }
    }
    for (; i < want; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      const e = pool[j];
      pool[j] = pool[i];
      pool[i] = e;
      strike(game, e, rank, area, null);
    }
  },

  dispose(game, state) {
    if (state.pre) { for (const pk of state.pre) pk.puff.end(); state.pre = null; }
    if (state.mesh) {
      game.scene.remove(state.mesh);
      state.mat.dispose();
      state.mesh = null;
    }
  },
};

// The charged aura: ground arcs crawling around the feet (r 0.6-1.1, 50 % duty) + rising flicker stars.
function aura(game, dt, state, rank) {
  const vfx = game.vfx, p = game.player.pos;
  const arcs = rank >= 5 ? 12 : 8;                 // r5: ×1.5
  state.arcT += dt * arcs / 0.08 * 0.5;            // ~arcs visible at 50 % duty (each lives ~0.08 s)
  while (state.arcT >= 1) {
    state.arcT -= 1;
    const a = Math.random() * 6.283, r = 0.6 + Math.random() * (HALO_RADIUS - 0.6);
    _g.x = p.x + Math.cos(a) * r; _g.y = 0.05; _g.z = p.z + Math.sin(a) * r;
    vfx.emit('stormGroundArc', _g, { scale: 0.75 + Math.random() * 0.4 });
  }
  state.moteT += dt * 6;
  while (state.moteT >= 1) {
    state.moteT -= 1;
    const a = Math.random() * 6.283, r = 0.5 + Math.random() * 0.6;
    _g.x = p.x + Math.cos(a) * r; _g.y = 0.15; _g.z = p.z + Math.sin(a) * r;
    vfx.emit('stormMote', _g);
  }
}

// One sky strike: a bolt drops from a slate puff onto the foe (grounding out), then storm damage.
function strike(game, e, rank, area, puff) {
  const dmg = BASE_DMG * (rank >= 4 ? 1.3 : 1);   // rank 4: +30% damage
  if (game.vfx) {
    (puff ?? skyPuff(game, e.pos, 0, { fulgurite: rank >= 4 ? 1.2 : 0, width: rank >= 4 ? 0.44 : 0.38 })).strike(e.pos);
  } else {
    game.fx.lightning({ x: e.pos.x, y: 12, z: e.pos.z }, { x: e.pos.x, y: 0.9, z: e.pos.z }, { color: 0xffe14a, life: 0.14, jag: 0.5 });
    game.fx.ring(e.pos, { color: 0xffe14a, radius: 1.2 * area, life: 0.25 });
  }
  game.fx.light(e.pos, STORM.body, 20, 0.2);
  damageEnemy(game, e, dmg, { element: 'storm' });
}
