import * as THREE from 'three';
import { Projectile, fanDirections } from '../common.js';
import { ELEMENT_COLOR } from '../../../core/utils.js';
import { damageEnemy } from '../../combat.js';
import { stormBolt, groundOut, skyPuff, later, Strand, chestY, STORM as SC } from '../../vfx/elements/storm.js';

const STORM = ELEMENT_COLOR.storm;
const STORM_TELE = SC.body;   // friendly storm-lemon dashed telegraph (was ORANGE: bible 10 §5.2 fix)

// Look (bible 10 §4.3, "a lightning whip that runs through the crowd; sometimes the sky answers"):
// a bigger Spark-style ball-lightning head with a zig-zag tail; the chain is drawn as real forked bolts
// hop by hop (15 ms visual stagger, damage instant) grounding out on every foe; a sky strike gets a
// storm-lemon dashed telegraph while a slate puff gathers over the foe, then the bolt drops from it.

// Scratch objects. Never stored; each use is immediate.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------- tempest helpers

// 0.3 s telegraph, then a bolt falls from the sky onto the foe.
function skyStrike(game, e, dmg) {
  const p = new THREE.Vector3(e.pos.x, 0, e.pos.z);
  const puff = game.vfx ? skyPuff(game, p, 0.3, { width: 0.42, sparks: 6, fleck: 0.5 }) : null;
  game.fx.telegraph(p, 1.1, 0.3, {
    color: STORM_TELE, friendly: true,
    onDone: () => {
      if (e.dead) { puff?.end(); return; }
      if (puff) {
        puff.strike(p);
        game.fx.light(p, SC.body, 22, 0.2);
      } else {
        game.fx.lightning({ x: p.x, y: 16, z: p.z }, { x: p.x, y: 0.9, z: p.z }, { color: STORM, life: 0.2, strands: 2, jag: 0.3 });
        game.fx.burst(p, { color: 0xfff27a, count: 10, speed: 6, life: 0.3, size: 0.3, up: 1 });
      }
      damageEnemy(game, e, dmg, { element: 'storm' });
    },
  });
}

// Lightning chain from `first` to up to `max` foes in total (the first hit counts).
function tempestChain(game, first, max, mult) {
  const range = 5.5 * game.player.stats.area;
  const seen = new Set([first]);
  let cur = first;
  if (game.vfx) {
    _p.x = first.pos.x; _p.y = chestY(first); _p.z = first.pos.z;
    game.vfx.emit('stormFlash', _p, { scale: 0.7 });
    groundOut(game, first.pos, { sparks: 4, glints: 2, fleck: 0, dust: 1, star: false });
  }
  for (let i = 1; i < max; i++) {
    const next = game.nearestEnemy(cur.pos, range, seen);
    if (!next) break;
    seen.add(next);
    _a.set(cur.pos.x, chestY(cur), cur.pos.z);
    _b.set(next.pos.x, chestY(next), next.pos.z);
    if (game.vfx) {
      const ax = _a.x, ay = _a.y, az = _a.z, bx = _b.x, by = _b.y, bz = _b.z, last = i === max - 1;
      later(game, (i - 1) * 0.015, () => {
        stormBolt(game, { x: ax, y: ay, z: az }, { x: bx, y: by, z: bz }, { width: 0.4, hdr: 1.8, life: 0.15, ground: true, twigs: 1, jag: 0.42 });
        game.vfx.emit('stormFlash', { x: bx, y: by, z: bz }, { scale: 0.55 });
        groundOut(game, { x: bx, z: bz }, { sparks: 3, glints: 2, fleck: last ? 0.35 : 0, dust: 0, scale: 0.85 });
      });
    } else game.fx.lightning(_a, _b, { color: STORM, life: 0.14 });
    damageEnemy(game, next, 14 * mult, { element: 'storm' });
    if (Math.random() < 0.25) skyStrike(game, next, 30 * mult);
    cur = next;
  }
}

// Ball-lightning head + zig-zag tail (Spark's look, one size up).
function head(game, p, dt) {
  const vfx = game.vfx;
  const k = 0.8 + Math.random() * 0.45;
  vfx.emit('stormHalo', p.pos, { scale: 1.0 * k });
  vfx.emit('stormStar', p.pos, { scale: 1.08 * k });
  vfx.emit('stormBead', p.pos, { scale: 1.15 * k });
  const L = Math.min(1.5, p.travelled);
  if (L > 0.2) {
    _p.x = p.pos.x - p.dir.x * L; _p.y = p.pos.y; _p.z = p.pos.z - p.dir.z * L;
    p.tail.jagged(5, p.pos, _p, 0.2, 0.05);
  }
  p.sparkAcc = (p.sparkAcc ?? 0) + dt * 26;
  while (p.sparkAcc >= 1) { p.sparkAcc -= 1; vfx.emit('stormSpark', p.pos, { count: 1, speed: 0.7 }); }
  // a short arc licks off the bead every few frames
  if (Math.random() < 0.35) vfx.emit('stormArc', p.pos, { scale: 1.1 });
}

export const tempest = {
  id: 'tempest',
  name: 'Tempest',
  icon: '⚡',
  element: 'storm',
  maxRank: 3,
  range: 10,
  hint: 'Spark bolts chain from foe to foe and call sky strikes.',
  desc: (rank) => [
    'Spark bolt that chains through up to 6 foes (14 dmg per jump). Each jump has a 25% chance to call a sky strike (30 storm).',
    '+30% damage.',
    'Chains through up to 8 foes.',
  ][rank - 1],
  cooldown: () => 0.3,

  cast(game, ctx) {
    const r = ctx.rank;
    const mult = r >= 2 ? 1.3 : 1;
    const maxFoes = r >= 3 ? 8 : 6;
    const count = 1 + game.player.stats.projectiles;
    const vis = !!game.vfx;

    for (const d of fanDirections(ctx.dir, count, 0.14 * (count - 1))) {
      const proj = new Projectile(game, {
        pos: ctx.origin,
        dir: d,
        speed: 30,
        range: 10,
        radius: 0.45,
        damage: 10 * mult,
        element: 'storm',
        pierce: 0,
        knockback: 0.3,
        size: 0.2,
        color: 0xfff27a,
        mesh: vis ? null : undefined,
        trail: vis ? undefined : { color: 0xffe14a, rate: 50, size: 0.2, life: 0.15 },
        onHit: (g, e) => tempestChain(g, e, maxFoes, mult),
        onUpdate: vis ? (g, p, dt) => head(g, p, dt) : undefined,
        onExpire: (g, p) => {
          if (p.hit.size || !g.vfx) return;
          g.vfx.emit('stormFlash', p.pos, { scale: 0.4 });
          g.vfx.emit('stormSpark', p.pos, { count: 4, dir: p.dir, cone: 0.4, speed: 0.6 });
        },
        onDispose: (g, p) => p.tail?.end(),
      });
      if (vis) proj.tail = new Strand(game, { width: 0.34, hdr: 2.0, color: SC.body });
      game.addActor(proj);
    }

    if (!vis) game.fx.burst(ctx.origin, { color: STORM, count: 4, speed: 3, life: 0.18, size: 0.25 });
  },
};
