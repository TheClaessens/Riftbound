import * as THREE from 'three';
import { damageEnemy } from '../combat.js';
import { stormBolt, groundOut, later, ionTrail, chestY, STORM } from '../vfx/elements/storm.js';

// Look (bible 10 §4.2): a real forked bolt jumping body to body. Damage stays instant; the drawing
// is staggered 25 ms per hop so the eye can follow the chain. Every hop kinks down into the target's
// feet and grounds out (bounce sparks, ozone glints, a scorch fleck); the last target takes a short
// vertical grounding strike. r5: thicker core + an ionised path afterimage along the whole chain.

const HOP_STAGGER = 0.025;
const _from = new THREE.Vector3();

// Draw one hop (visual only).
function drawHop(game, fx, fy, fz, tx, ty, tz, i, last, rank) {
  stormBolt(game, { x: fx, y: fy, z: fz }, { x: tx, y: ty, z: tz },
    { width: rank >= 5 ? 0.5 : 0.42, hdr: 1.8, life: 0.15, ground: true, twigs: rank >= 3 ? 2 : 1, jag: 0.45 });
  game.vfx.emit('stormFlash', { x: tx, y: ty, z: tz }, { scale: 0.6 });
  groundOut(game, { x: tx, z: tz }, { sparks: last ? 6 : 4, glints: 3, fleck: 0.35, dust: 1, scale: 0.9 });
  if (i === 0 || last) game.fx.light({ x: tx, z: tz }, STORM.body, 20, 0.2);
  if (last) {
    // the chain's end: a short vertical grounding strike
    stormBolt(game, { x: tx + 0.1, y: 1.7, z: tz - 0.1 }, { x: tx, y: 0.05, z: tz }, { width: 0.3, life: 0.12, twigs: 1, twigLen: [0.3, 0.5], segLen: 0.3 });
  }
}

// r5 ionised path: a faint lemon after-glow along the whole chain (soft trail strand, no white core)
// that erodes into flecks and retracts from the chain's end back to the rod over ~0.25 s.
function ionisedPath(game, pts, np) {
  const P = ionTrail(game, { width: 0.2, hdr: 1.1, color: STORM.body });
  if (!P) return;
  // resample the hop polyline to 16 evenly spaced points (16 pts retract at 60/s = 0.27 s)
  let total = 0;
  for (let i = 1; i < np; i++) total += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 2] - pts[i * 3 - 1]);
  let seg = 1, acc = 0;
  for (let k = 0; k < 16; k++) {
    const want = (k / 15) * total;
    while (seg < np - 1 && acc + Math.hypot(pts[seg * 3] - pts[seg * 3 - 3], pts[seg * 3 + 2] - pts[seg * 3 - 1]) < want) {
      acc += Math.hypot(pts[seg * 3] - pts[seg * 3 - 3], pts[seg * 3 + 2] - pts[seg * 3 - 1]); seg++;
    }
    const a = (seg - 1) * 3, b = seg * 3;
    const L = Math.hypot(pts[b] - pts[a], pts[b + 2] - pts[a + 2]) || 1;
    const t = Math.min(1, Math.max(0, (want - acc) / L));
    P[k * 3] = pts[a] + (pts[b] - pts[a]) * t + (Math.random() - 0.5) * 0.12;
    P[k * 3 + 1] = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * t;
    P[k * 3 + 2] = pts[a + 2] + (pts[b + 2] - pts[a + 2]) * t + (Math.random() - 0.5) * 0.12;
  }
}

export const chainLightning = {
  id: 'chainLightning',
  name: 'Chain Lightning',
  icon: '⚡',
  element: 'storm',
  maxRank: 5,
  range: 12,
  hint: 'Storm + Fire = Overload. Storm + Frost = Superconduct.',
  desc: (rank) => [
    'Strike up to 3 enemies with chaining lightning.',
    '+1 bounce.',
    '+1 bounce.',
    '+1 bounce.',
    '+2 bounces, increased damage scaling.',
  ][rank - 1],
  cooldown: (rank) => [1.4, 1.3, 1.2, 1.1, 1.0][rank - 1],

  cast(game, ctx) {
    const rank = ctx.rank;
    const bounceCount = [3, 4, 5, 6, 8][rank - 1];
    const baseDmg = 16;
    const dmgPerBounce = 0.92;
    const dmgScaling = 1 + Math.max(0, rank - 1) * 0.15;
    const vis = !!game.vfx;

    // Find first target
    let current = ctx.target;
    let nearest = game.nearestEnemy(current, 4);
    if (nearest) current = nearest.pos;
    else {
      nearest = game.nearestEnemy(game.player.pos, 12);
      if (nearest) current = nearest.pos;
      else {
        // No targets, draw fizzle
        const dir = new THREE.Vector3(ctx.target.x - ctx.origin.x, 0, ctx.target.z - ctx.origin.z);
        if (dir.length() > 0) dir.normalize();
        const end = new THREE.Vector3(
          ctx.origin.x + dir.x * 3,
          0,
          ctx.origin.z + dir.z * 3
        );
        if (vis) {
          // a 3 u bolt that dissipates into sparks in the air
          stormBolt(game, { x: ctx.origin.x, y: 1.9, z: ctx.origin.z }, { x: end.x, y: 0.9, z: end.z }, { width: 0.3, life: 0.12, twigs: 1 });
          game.vfx.emit('stormSpark', { x: end.x, y: 0.9, z: end.z }, { count: 6, dir, cone: 0.3, speed: 0.7 });
          game.vfx.emit('stormFlash', { x: end.x, y: 0.9, z: end.z }, { scale: 0.4 });
        } else {
          game.fx.lightning(
            new THREE.Vector3(ctx.origin.x, 1.9, ctx.origin.z),
            new THREE.Vector3(end.x, 0.9, end.z),
            { color: 0xffe14a, life: 0.1 }
          );
        }
        return;
      }
    }

    const hitSet = new Set();
    let currentPos = new THREE.Vector3(ctx.origin.x, 1.9, ctx.origin.z);
    let prevEnemy = null;
    let dmgMult = 1;
    // visual hop list (x, y, z per point), source = the rod head
    const pts = vis ? new Float32Array((bounceCount + 1) * 3) : null;
    let np = 0;
    if (vis) {
      try { game.player.muzzle(_from); } catch { _from.set(ctx.origin.x, 1.9, ctx.origin.z); }
      if (_from.y < 0.5) _from.set(ctx.origin.x, 1.9, ctx.origin.z);
      pts[0] = _from.x; pts[1] = _from.y; pts[2] = _from.z; np = 1;
    }

    for (let bounce = 0; bounce < bounceCount; bounce++) {
      const nearest = game.nearestEnemy(current, 5.5, hitSet);
      if (!nearest) break;

      hitSet.add(nearest);
      const dmg = baseDmg * dmgMult * dmgScaling;

      // Draw lightning from current position to nearest enemy
      const targetPos = new THREE.Vector3(nearest.pos.x, 0.9, nearest.pos.z);
      if (vis) { pts[np * 3] = targetPos.x; pts[np * 3 + 1] = chestY(nearest); pts[np * 3 + 2] = targetPos.z; np++; }
      else {
        game.fx.lightning(currentPos, targetPos, { color: 0xffe14a, life: 0.12 });
        game.fx.light(targetPos, 0xffe14a, 20, 0.2);
      }

      // Apply damage
      damageEnemy(game, nearest, dmg, { element: 'storm' });

      currentPos = targetPos;
      prevEnemy = nearest;
      current = nearest.pos;
      dmgMult *= dmgPerBounce;
    }

    if (vis && np > 1) {
      const hops = np - 1;
      for (let i = 0; i < hops; i++) {
        const a = i * 3, b = (i + 1) * 3;
        const fx = pts[a], fy = pts[a + 1], fz = pts[a + 2], tx = pts[b], ty = pts[b + 1], tz = pts[b + 2];
        later(game, i * HOP_STAGGER, () => drawHop(game, fx, fy, fz, tx, ty, tz, i, i === hops - 1, rank));
      }
      if (rank >= 5) later(game, hops * HOP_STAGGER, () => ionisedPath(game, pts, Math.min(np, 16)));
    }
  },
};
