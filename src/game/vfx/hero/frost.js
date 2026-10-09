import * as THREE from 'three';
import { ice, frostCreep, frostParticle as puff, frostTier, iceShatter } from '../elements/frost.js';

// =====================================================================================
//  FROST hero visuals (bundle B; design/VFX.md, bible 10 §4.5–4.6, bible 09 §5).
//    Glacial Slide   an ice road freezes out sideways under the slide (to ±1.6 u = the chill radius),
//                    a skier's spray of snow kicks up behind the feet, small spikes heave up along the
//                    road edges; the road melts over 1.2 s and the spikes crumble.
//    Permafrost      the rig draws the 1–3 orbiting hex shards; here a shard condenses from converging snow
//                    on gain, shatters into chips on absorb, and rime frosts the ground under the feet.
//    Idle            hem frost motes, a breath puff every 2.8 s, rime footprints (bible 09 §5).
//    castFlash       a puff of snow + a 0.05 s white star at the casting hand / crystal.
//  Visual only: never deal damage or change gameplay state.
// =====================================================================================

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

// per-hero visual state (one player)
const S = {
  slide: { lx: 0, lz: 0, acc: 0, side: 1, n: 0, spikes: [], road: [] },
  hemT: 0, breathT: 1.2, stepAcc: 0, foot: 0, lx: 0, lz: 0, rimeT: 0, init: false, game: null,
};

// ------------------------------------------------------------------ Glacial Slide (5 u / 0.2 s)
export function dashStart(game, player, from) {
  // the existing class-colour start burst at 0.6x count (bible §4.5)
  game.fx.burst(from, { color: player.cls.hex, count: 7, speed: 4, life: 0.35, size: 0.35, up: 0.8 });
  const sl = S.slide;
  sl.lx = from.x; sl.lz = from.z; sl.acc = 0.6; sl.n = 0;
  sl.spikes.length = 0;
  const area = player.stats?.area ?? 1;
  // first slab of road under the kick-off
  sl.road.length = 0;
  sl.road.push(frostCreep(game, from, 1.6 * area, 0.15, 1.6, { alpha: 0.34, fade: 1.2, intensity: 1.2 }));
  puff(game.vfx, 'frostStar', from.x, 0.3, from.z, 0, 0, 0, 0.8);
  for (let i = 0; i < 4; i++) puff(game.vfx, 'frostPuff', from.x + rnd(-0.4, 0.4), 0.2, from.z + rnd(-0.4, 0.4), rnd(-1, 1), 0.6, rnd(-1, 1), 1.1);
}

export function dashTrail(game, player, dir) {
  const vfx = game.vfx, p = player.pos, sl = S.slide;
  const area = player.stats?.area ?? 1;
  const dx = p.x - sl.lx, dz = p.z - sl.lz;
  sl.acc += Math.hypot(dx, dz);
  sl.lx = p.x; sl.lz = p.z;
  // the ice road: a slab of rime every 1.1 u, as wide as the chill (±1.6 u)
  if (sl.acc >= 1.1) {
    sl.acc = 0;
    sl.road.push(frostCreep(game, p, 1.6 * area, 0.15, 1.6, { alpha: 0.3, fade: 1.2, intensity: 1.1 }));
    // small spikes heaved up along the road edges (alternating sides)
    if (sl.n < 6 && frostTier(game) < 2) {
      const px = -dir.z, pz = dir.x;
      for (const side of [1, -1]) {
        if (sl.n >= 6) break;
        sl.n++;
        const off = 1.45 * area * rnd(0.92, 1.02);
        sl.spikes.push(ice(game).sprout(p.x + px * off * side + rnd(-0.2, 0.2), p.z + pz * off * side + rnd(-0.2, 0.2),
          { h: rnd(0.5, 0.75), w: 0.1, tilt: 0.55, dir: { x: px * side, z: pz * side }, life: 1.0 + rnd(0, 0.2), chips: 2, grow: 0.08, rime: 0.35 }));
      }
    }
  }
  // skier's spray: snow kicked up and back from the feet (~40/s)
  for (let i = 0; i < 2; i++) {
    const sx = (Math.random() < 0.5 ? 1 : -1) * 0.25;
    puff(vfx, i ? 'snowStreak' : 'snowflake', p.x - dir.x * 0.3 - dir.z * sx, 0.15, p.z - dir.z * 0.3 + dir.x * sx,
      -dir.x * rnd(2, 3.5) - dir.z * sx * 4, rnd(2.5, 4), -dir.z * rnd(2, 3.5) + dir.x * sx * 4, i ? 0.7 : 0.6);
  }
  puff(vfx, 'frostPuff', p.x - dir.x * 0.5, 0.25, p.z - dir.z * 0.5, -dir.x * 1.5, 0.5, -dir.z * 1.5, 0.9);
}

// a foe chilled by the slide: a rime flash + a few chips flicked off it
export function dashHit(game, player, enemy) {
  void player;
  puff(game.vfx, 'frostGlint', enemy.pos.x, 0.9, enemy.pos.z, 0, 0.3, 0, 0.6);
  if (frostTier(game) < 1) game.vfx.debris('frostChip', { x: enemy.pos.x, y: 0.4, z: enemy.pos.z }, 2, { scale: 0.8 });
}

// ------------------------------------------------------------------ Permafrost (Frost Armor 0–3)
// The Cryomancer rig draws the 1–3 orbiting hex shards itself (bones armor1–3, r 0.70, y 1.08). This
// file adds the beats at the shard's world point: condense-on-gain, shatter-on-absorb, and a faint rime
// under the feet while armoured.
function shardPos(player, i, out) {
  if (player.model?.emitter) return player.model.emitter('armor' + (i + 1), out);
  return out.set(player.pos.x, 1.08, player.pos.z);
}

export function armorGain(game, player, count) {
  // condensation: 6 snow motes converge on the new shard + a glint
  const i = Math.max(0, Math.min(2, count - 1));
  const p = shardPos(player, i, _a);
  for (let k = 0; k < 6; k++) {
    const b = (k / 6) * Math.PI * 2;
    puff(game.vfx, 'snowflake', p.x + Math.cos(b) * 0.8, p.y + rnd(-0.3, 0.3), p.z + Math.sin(b) * 0.8, -Math.cos(b) * 3.2, 0, -Math.sin(b) * 3.2, 0.5);
  }
  puff(game.vfx, 'frostGlint', p.x, p.y, p.z, 0, 0, 0, 0.8);
}

export function armorBreak(game, player) {
  // the spent shard (index = the charge just lost) shatters into 8 chips; the "ARMOR" text stays (player.js)
  const n = player.frostArmor ?? 0;            // already decremented by player.js
  const i = Math.max(0, Math.min(2, n));
  const p = shardPos(player, i, _a);
  _b.set(p.x, 0, p.z);
  iceShatter(game, _b, 1.2, 8, { y: Math.max(0.3, p.y - 0.4), scale: 1.2, starScale: 0.9 });
  puff(game.vfx, 'frostPuff', p.x, p.y, p.z, 0, 0.3, 0, 0.8);
}

function updateArmorRime(game, player, dt) {
  const n = Math.max(0, Math.min(3, player.frostArmor ?? 0));
  // a faint rime under the feet while armoured
  if (n > 0) {
    S.rimeT -= dt;
    const moved = Math.hypot(player.pos.x - S.lx, player.pos.z - S.lz);
    if (S.rimeT <= 0 && (moved > 0.6 || S.rimeT < -0.9)) {
      S.rimeT = 0.3; S.lx = player.pos.x; S.lz = player.pos.z;
      frostCreep(game, player.pos, 0.8, 0.2, 1.0, { alpha: 0.16, fade: 0.5, intensity: 0.6 });
    }
  }
}

// ------------------------------------------------------------------ idle (every frame, Cryomancer)
export function idle(game, player, dt) {
  if (S.game !== game || !S.init) { S.init = true; S.game = game; ice(game); }
  if (game.state !== 'playing' && game.state !== 'shift') return;
  const vfx = game.vfx;
  updateArmorRime(game, player, dt);
  const meter = player.model?.H?.meter ?? 0;
  const moving = Math.hypot(player.vel?.x ?? 0, player.vel?.z ?? 0) > 1;
  // hem frost: one mote every 0.25 s (faster with armour), drifting down off the snow hem
  S.hemT -= dt;
  if (S.hemT <= 0) {
    S.hemT = 0.25 / (1 + meter);
    const hem = player.model?.emitter ? player.model.emitter('hem', _a) : _a.copy(player.pos);
    const a = Math.random() * 6.283;
    const same = Math.abs(hem.x - player.pos.x) + Math.abs(hem.z - player.pos.z) < 1e-3 && hem.y < 0.05;
    puff(vfx, 'snowflake', player.pos.x + Math.cos(a) * 0.42, same ? 0.18 : hem.y, player.pos.z + Math.sin(a) * 0.42, Math.cos(a) * 0.2, -0.25, Math.sin(a) * 0.2, 0.55);
  }
  // breath: a small white puff in front of the face every 2.8 s
  S.breathT -= dt;
  if (S.breathT <= 0) {
    S.breathT = 2.8;
    const f = player.facing ?? { x: 0, z: 1 };
    const m = player.model?.emitter ? player.model.emitter('mouth', _a) : _a.set(player.pos.x, 1.72, player.pos.z);
    if (m.y < 0.5) m.y = 1.72;
    puff(vfx, 'frostPuff', m.x + f.x * 0.12, m.y, m.z + f.z * 0.12, f.x * 0.5, 0.15, f.z * 0.5, 0.4);
  }
  // rime footprints while walking
  if (moving) {
    S.stepAcc += Math.hypot(player.vel.x, player.vel.z) * dt;
    if (S.stepAcc >= 0.85) {
      S.stepAcc = 0;
      S.foot ^= 1;
      const fp = player.model?.emitter ? player.model.emitter(S.foot ? 'footL' : 'footR', _b) : _b.copy(player.pos);
      if (Math.abs(fp.x - player.pos.x) + Math.abs(fp.z - player.pos.z) < 1e-3) {
        const f = player.facing ?? { x: 0, z: 1 };
        fp.x += -f.z * (S.foot ? 0.16 : -0.16); fp.z += f.x * (S.foot ? 0.16 : -0.16);
      }
      frostCreep(game, fp, 0.32, 0.1, 0.7, { alpha: 0.32, fade: 0.4, intensity: 0.4 });
    }
  }
}

// ------------------------------------------------------------------ cast flash (any frost skill)
export function castFlash(game, player, def, slot, point) {
  void player; void def;
  const vfx = game.vfx;
  const big = slot !== 0;
  puff(vfx, 'frostStar', point.x, point.y, point.z, 0, 0, 0, big ? 0.9 : 0.55);
  const n = big ? 6 : (frostTier(game) >= 2 ? 1 : 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283;
    puff(vfx, 'snowflake', point.x, point.y, point.z, Math.cos(a) * rnd(1, 2.2), rnd(0, 1.2), Math.sin(a) * rnd(1, 2.2), 0.5);
  }
}
