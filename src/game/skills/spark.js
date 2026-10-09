import { Projectile, fanDirections } from './common.js';
import { damageEnemy } from '../combat.js';
import { stormBolt, groundOut, Strand, chestY, STORM } from '../vfx/elements/storm.js';

// Stormcaller starter (storm). Very fast spark; on hit it forks lightning to nearby foes.
// Look (bible 10 §4.1): a bead of ball lightning (a crackling 4-point star that jumps ±30 % in size
// every frame) dragging a zig-zag bolt tail re-rolled every 50 ms; forks are full forked bolts
// that kink down and ground out at the target's feet (bounce sparks + ozone glints).

const FORK_SHARE = 0.75; // forks deal 75% of the main bolt (tuned up from a fixed 6 after sims)
const _p = { x: 0, y: 0, z: 0 };
const _q = { x: 0, y: 0, z: 0 };

// From the hit point, arc lightning to up to `forks` nearest foes not yet hit by this spark.
function forkFrom(game, e, p, forks, forkRange, dmg, rank) {
  const hit = new Set([e]);
  // impact snap on the struck foe (one light per impact)
  _p.x = e.pos.x; _p.y = chestY(e); _p.z = e.pos.z;
  game.vfx?.emit('stormFlash', _p, { scale: 0.6 });
  game.vfx?.emit('stormSpark', _p, { count: 4, dir: p.dir, cone: 0.55 });
  game.fx.light(e.pos, STORM.body, 14, 0.15);
  for (let i = 0; i < forks; i++) {
    const t = game.nearestEnemy(e.pos, forkRange, hit);
    if (!t) break;
    hit.add(t);
    _q.x = t.pos.x; _q.y = chestY(t); _q.z = t.pos.z;
    stormBolt(game, p.pos, _q, { width: 0.32, hdr: 1.9, life: 0.15, ground: true, twigs: rank >= 4 ? 1 : 0, twigLen: [0.3, 0.6] });
    groundOut(game, t.pos, { sparks: 4, glints: 3, fleck: 0, dust: 0, scale: 0.8 });
    damageEnemy(game, t, dmg * FORK_SHARE, { element: 'storm' });
  }
}

// Per-frame head: crackling star + zig-zag tail + flung streaks (+ r5 electric cage).
function head(game, p, dt, rank, hs) {
  const vfx = game.vfx;
  if (!vfx) return;
  const k = 0.75 + Math.random() * 0.5;                    // the bead jumps ±25 % every frame (crackle)
  vfx.emit('stormHalo', p.pos, { scale: hs * k * 0.9 });
  vfx.emit('stormStar', p.pos, { scale: hs * k });
  vfx.emit('stormBead', p.pos, { scale: hs * k });
  if (rank >= 5) {
    // r5: 3-point electric cage, two short arcs orbiting the bead
    for (let k = 0; k < 2; k++) {
      const a = p.age * 22 + k * Math.PI;
      _p.x = p.pos.x + Math.cos(a) * 0.26; _p.y = p.pos.y + Math.sin(a * 0.7) * 0.18; _p.z = p.pos.z + Math.sin(a) * 0.26;
      vfx.emit('stormArc', _p, { scale: 0.7 });
    }
  }
  // tail: a 3-segment zig-zag bolt from the head back 1.2 u (shorter while leaving the rod)
  const L = Math.min(1.2, p.travelled);
  if (L > 0.2) {
    _q.x = p.pos.x - p.dir.x * L; _q.y = p.pos.y; _q.z = p.pos.z - p.dir.z * L;
    p.tail.jagged(4, p.pos, _q, 0.16, 0.05);
  }
  p.sparkAcc = (p.sparkAcc ?? 0) + dt * 20;
  if (p.sparkAcc >= 1) {
    p.sparkAcc -= 1;
    vfx.emit('stormSpark', p.pos, { count: 1, speed: 0.6 });
  }
}

export const spark = {
  id: 'spark',
  name: 'Spark',
  icon: 'ϟ',
  element: 'storm',
  kind: 'active',
  maxRank: 5,
  range: 12,
  hint: 'Storm into Burning foes Overloads; into Chilled foes Superconducts.',
  // Text shown on the level-up card for reaching `rank`.
  desc: (rank) => [
    'Fire a very fast spark. On hit it forks to 2 foes within 4 u.',
    '+1 fork.',
    '+25% damage.',
    'Fork range 6 u.',
    '+1 spark, fanned.',
  ][rank - 1],
  cooldown: (rank) => [0.32, 0.30, 0.28, 0.26, 0.24][rank - 1],
  // ctx: { rank, origin (Vector3, y = 0), dir (Vector3 XZ), target (Vector3 ground point), player }
  cast(game, ctx) {
    const r = ctx.rank;
    const count = (r >= 5 ? 2 : 1) + game.player.stats.projectiles;
    const dmg = 12 * (r >= 3 ? 1.25 : 1);
    const forks = 2 + (r >= 2 ? 1 : 0);
    const forkRange = r >= 4 ? 6 : 4;
    const hs = (count >= 3 ? 0.85 : 1) * (r >= 3 ? 1.06 : 1);   // head scale (≤ 0.45 u wide)
    const hasVfx = !!game.vfx;
    for (const d of fanDirections(ctx.dir, count, 0.12 * (count - 1))) {
      const proj = new Projectile(game, {
        pos: ctx.origin, dir: d, speed: 30, range: 12,
        radius: 0.4, damage: dmg, element: 'storm', knockback: 0.5,
        size: 0.16, color: 0xfff3a0,
        mesh: hasVfx ? null : undefined,
        trail: hasVfx ? undefined : { rate: 70, color: 0xffe14a, size: 0.18, life: 0.14 },
        onHit: (g, e, p) => forkFrom(g, e, p, forks, forkRange, dmg, r),
        onUpdate: (g, p, dt) => head(g, p, dt, r, hs),
        onExpire: (g, p) => {
          if (p.hit.size || !g.vfx) return;
          // fizzle at range: the bead pops into a few dying sparks in the air
          g.vfx.emit('stormFlash', p.pos, { scale: 0.35 });
          g.vfx.emit('stormSpark', p.pos, { count: 3, dir: p.dir, cone: 0.4, speed: 0.6 });
        },
        onDispose: (g, p) => p.tail?.end(),
      });
      if (hasVfx) proj.tail = new Strand(game, { width: 0.3 * hs, hdr: 2.0, color: STORM.body });
      game.addActor(proj);
    }
  },
};
