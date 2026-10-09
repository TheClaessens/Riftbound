// ---------------------------------------------------------------
// STORM HALO: Chain Lightning + Spirit Orbs
// Passive orbiting wisps that chain lightning to enemies
// ---------------------------------------------------------------
import * as THREE from 'three';
import { damageEnemy } from '../../combat.js';
import { stormBolt, groundOut, Strand, chestY, STORM } from '../../vfx/elements/storm.js';

// Look (bible 10 §4.3, "a crown of ball-lightning moons tethered by arcs"): each wisp is a crackling
// 4-point star with a two-arc jittering cage; faint flickering tether arcs join consecutive wisps,
// so a polygon of lightning turns at the orbit radius (2.6 × area). Before its periodic zap a wisp
// flares for ~80 ms (read from the gameplay timer), then a forked bolt jumps to the foe and grounds
// out. Contact: a snap star plus small chain bolts to the 2 foes it chains to.

const _p = { x: 0, y: 0, z: 0 };
const _t = new THREE.Vector3();

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
        p: new THREE.Vector3(),
        lastHitEnemies: new Map(), // enemy -> time of last hit
        lastZap: 0,
      });
    }
    state.tether = null;
  },

  update(game, dt, state, rank) {
    const orbitRadius = 2.6 * game.player.stats.area;
    const angularSpeed = 3.2;
    const vfx = game.vfx;

    for (const wisp of state.wisps) {
      wisp.angle += angularSpeed * dt;

      // Position wisp around player
      const x = game.player.pos.x + Math.cos(wisp.angle) * orbitRadius;
      const z = game.player.pos.z + Math.sin(wisp.angle) * orbitRadius;
      const y = 1.0;
      wisp.p.set(x, y, z);

      // Contact damage (radius 0.6)
      const contactEnemies = game.queryEnemies(wisp.p, 0.6, []).slice();
      for (const e of contactEnemies) {
        const lastHit = wisp.lastHitEnemies.get(e) ?? -0.6;
        if (game.time - lastHit >= 0.5) {
          wisp.lastHitEnemies.set(e, game.time);
          damageEnemy(game, e, 14, { element: 'storm' });
          if (vfx) { _p.x = e.pos.x; _p.y = chestY(e); _p.z = e.pos.z; vfx.emit('stormFlash', _p, { scale: 0.55 }); }

          // Chain to up to 2 more enemies within 4 units
          const chainTargets = game.queryEnemies(e.pos, 4, []).filter((t) => t !== e).slice(0, 2);
          for (const t of chainTargets) {
            if (vfx) {
              _p.x = e.pos.x; _p.y = chestY(e); _p.z = e.pos.z;
              _t.set(t.pos.x, chestY(t), t.pos.z);
              stormBolt(game, _p, _t, { width: 0.24, life: 0.12, ground: true, twigs: 0, restrike: false });
              groundOut(game, t.pos, { sparks: 2, glints: 1, fleck: 0, dust: 0, scale: 0.7, star: false });
            } else game.fx.lightning(e.pos, t.pos, { color: 0xffe14a, life: 0.15 });
            damageEnemy(game, t, 8, { element: 'storm' });
          }
        }
      }

      // Periodic zap to nearest enemy every 1.2s
      wisp.lastZap += dt;
      if (wisp.lastZap >= 1.2) {
        wisp.lastZap = 0;
        const nearest = game.nearestEnemy(wisp.p, 7);
        if (nearest) {
          if (vfx) {
            _t.set(nearest.pos.x, chestY(nearest), nearest.pos.z);
            stormBolt(game, wisp.p, _t, { width: 0.32, hdr: 1.8, life: 0.15, ground: true, twigs: 1 });
            groundOut(game, nearest.pos, { sparks: 4, glints: 2, fleck: 0.3, dust: 1, scale: 0.8 });
          } else game.fx.lightning(wisp.p, nearest.pos, { color: 0xffe14a, life: 0.15 });
          damageEnemy(game, nearest, 12, { element: 'storm' });
        }
      }

      if (vfx) drawWisp(game, wisp);
    }
    if (vfx) drawTether(game, state);
  },

  onRankUp(game, state, rank) {
    // Add new wisps if ranking up
    const prevCount = [4, 5, 6][rank - 2] ?? 4;
    const newCount = [4, 5, 6][rank - 1];
    for (let i = prevCount; i < newCount; i++) {
      state.wisps.push({
        angle: (i / newCount) * Math.PI * 2,
        p: new THREE.Vector3(),
        lastHitEnemies: new Map(),
        lastZap: 0,
      });
    }
  },

  dispose(game, state) {
    for (const t of state.tether ?? []) t.end();
    state.tether = null;
    state.wisps = [];
  },
};

// Ball-lightning moon: crackling star (+ ×1.5 flare in the last 80 ms before its zap) and a 2-arc cage.
function drawWisp(game, w) {
  const vfx = game.vfx;
  const flare = w.lastZap >= 1.12 ? 1.5 : 1;
  const k = (0.8 + Math.random() * 0.4) * flare;
  vfx.emit('stormHalo', w.p, { scale: 1.3 * k });
  vfx.emit('stormBead', w.p, { scale: 1.6 * k });
  vfx.emit('stormStar', w.p, { scale: 1.3 * k });
  w.cageT = (w.cageT ?? 0) - 1;
  if (w.cageT <= 0) {
    w.cageT = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * 6.283;
      _p.x = w.p.x + Math.cos(a) * 0.28; _p.y = w.p.y + (Math.random() - 0.5) * 0.3; _p.z = w.p.z + Math.sin(a) * 0.28;
      vfx.emit('stormArc', _p, { scale: 0.85 * flare });
    }
  }
}

// Faint flickering tether arcs joining consecutive wisps: one short jagged strand per edge (re-rolled
// every 50 ms), so a polygon of lightning turns at the orbit radius.
function drawTether(game, state) {
  const W = state.wisps, n = W.length;
  if (n < 2) return;
  const T = (state.tether ??= []);
  while (T.length < n) T.push(new Strand(game, { width: 0.15, hdr: 1.5, color: STORM.body, alpha: 0.55 }));
  for (let i = 0; i < n; i++) {
    // 50 % duty: each edge blinks on its own rhythm
    if (Math.random() < 0.25) { T[i].end(); continue; }
    T[i].jagged(5, W[i].p, W[(i + 1) % n].p, 0.22, 0.05);
  }
}
