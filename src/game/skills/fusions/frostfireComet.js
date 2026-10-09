import * as THREE from 'three';
import { Projectile, fanDirections, damageArea } from '../common.js';
import { damageEnemy } from '../../combat.js';
import { iceCasing, fireBillow, fireDecal, fireTier, spr } from '../../vfx/elements/fire.js';

// ---------------------------------------------------------------
// FROSTFIRE COMET: Fireball + Frost Nova
// Large piercing comet that chains Steam Bursts along its path
// Look (bible 10 §4.3): a molten core cased in faceted glacier ice (navy ink hull, the core glowing
// through the cracks), twin tails braided in a helix (one flame, one frost) that hiss steam where
// they cross, and a world-scale MELT TRAIL: wet ground along the path. Hits: steam, ice chips,
// embers. Expire: the casing shatters, a forge billow on r 3 and a ring of steam rolling to r 3.
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
    const tails = r >= 2 ? 1.3 : 1;

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
        mesh: iceCasing(0.5),
        color: 0xffffff,
        onUpdate: (g, p, dt) => cometTrail(g, p, dt, tails),
        onDispose: (g, p) => { p._fx?.fire.stop(); p._fx?.frost.stop(); },
        onHit: (g, e, p) => {
          // Fire damage hit triggers Steam Burst on chilled enemy
          damageEnemy(g, e, fireDmg, { element: 'fire' });
          // Visual: steam hiss, ice chips, embers
          cometHit(g, p);
        },
        onExpire: (g, p) => {
          const r2 = 3 * game.player.stats.area;
          cometBurst(g, p, r2);
          g.fx.light(p.pos, 0xff8a2a, 50, 0.3);
          g.fx.shake(0.2);
          damageArea(g, p.pos, r2, 30, { element: 'fire' });
        },
      }));
    }
  },
};

// ---------------------------------------------------------------- visuals
function cometTrail(game, p, dt, tails) {
  const v = game.vfx;
  const m = p.mesh;
  if (m) {
    // the casing tumbles slowly around its travel axis; the ink hull follows
    const body = m.userData.spin;
    body.rotation.x += dt * 2.2; body.rotation.z += dt * 1.4;
    m.userData.hull.rotation.copy(body.rotation);
  }
  if (!v || dt <= 0) return;
  let f = p._fx;
  if (!f) {
    const a = { x: p.pos.x, y: p.pos.y, z: p.pos.z }, b = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    f = p._fx = {
      a, b, steam: 0, melt: 0, ember: 0, lx: p.pos.x, lz: p.pos.z,
      fire: v.trail(a, { color: 0xff7a2a, width: 0.42 * tails, hdr: 1.7, segLen: 0.35 }),
      frost: v.trail(b, { color: 0xbff4ff, width: 0.42 * tails, hdr: 1.1, segLen: 0.35 }),
    };
  }
  const T = fireTier(game), bud = v.budget();
  const dx = p.dir.x, dz = p.dir.z, x = p.pos.x, y = p.pos.y, z = p.pos.z;
  // twin tails braided in a helix (radius 0.3, 3 turns/s) behind the casing
  const ph = p.age * 6.283 * 3, rad = 0.3 * tails;
  const sx = -dz, sz = dx, c = Math.cos(ph) * rad, s = Math.sin(ph) * rad;
  f.a.x = x - dx * 0.45 + sx * c; f.a.y = y + s; f.a.z = z - dz * 0.45 + sz * c;
  f.b.x = x - dx * 0.45 - sx * c; f.b.y = y - s; f.b.z = z - dz * 0.45 - sz * c;
  // molten heart glowing through the ice
  spr(v, 'fireCore', x + 0.3, y + 0.38, z + 0.3, 0, 0, 0, Math.min(0.06, dt * 1.5), 0.42, 0, 0, 0);
  // steam billows where the tails cross
  f.steam += dt * 20 * bud * (T === 2 ? 0.4 : 1);
  while (f.steam >= 1) {
    f.steam -= 1;
    spr(v, 'fireSteam', x - dx * (0.6 + Math.random() * 0.6), y + (Math.random() - 0.5) * 0.3, z - dz * (0.6 + Math.random() * 0.6),
      -dx * 1.2 + (Math.random() - 0.5), 0.8 + Math.random() * 0.6, -dz * 1.2 + (Math.random() - 0.5), undefined, 0.42 + Math.random() * 0.2);
  }
  f.ember += dt * 14 * bud;
  while (f.ember >= 1) {
    f.ember -= 1;
    spr(v, 'fireEmber', f.a.x, f.a.y, f.a.z, -dx * 2 + (Math.random() - 0.5) * 1.5, 0.5 + Math.random(), -dz * 2 + (Math.random() - 0.5) * 1.5, 0.35, 0.1);
    if (Math.random() < 0.6) spr(v, 'iceChip', f.b.x, f.b.y, f.b.z, -dx * 2 + (Math.random() - 0.5) * 1.5, 1, -dz * 2 + (Math.random() - 0.5) * 1.5, 0.35, 0.13);
  }
  // melt trail: a wet stain along the ground track (drops a stamp every ~1.2 u)
  if (Math.hypot(x - f.lx, z - f.lz) > 1.6) {
    f.lx = x; f.lz = z;
    if (T < 2) fireDecal(game, 'wet', { x, z }, 1.25, 1.5, { grow: 0.2, fade: 0.8, alpha: 0.2, accent: 0x9fb4c8, hdr: 0.22 });
  }
}

function cometHit(game, p) {
  const v = game.vfx;
  if (!v) return;
  const x = p.pos.x, y = p.pos.y, z = p.pos.z;
  if (fireTier(game) < 2) for (let i = 0; i < 2; i++) spr(v, 'fireSteam', x, y, z, (Math.random() - 0.5) * 2, 1.4, (Math.random() - 0.5) * 2, 0.7, 0.55);
  v.emit('iceChip', { x, y, z }, { count: 4 });
  for (let i = 0; i < 4; i++) spr(v, 'fireEmber', x, y, z, p.dir.x * 3 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 1.5, p.dir.z * 3 + (Math.random() - 0.5) * 3, 0.5, 0.11, 7, 0.8);
}

function cometBurst(game, p, r) {
  const v = game.vfx;
  if (!v) return;
  const x = p.pos.x, z = p.pos.z;
  v.debris('ice', { x, y: p.pos.y - 0.3, z }, 14, { scale: 1.3, speed: 1.1 });
  v.emit('iceChip', { x, y: 0.9, z }, { count: 10 });
  fireBillow(game, p.pos, r, { scale: 0.9 });
  // steam rolling out along the ground to r
  const n = fireTier(game) === 2 ? 5 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + Math.random() * 0.4, v0 = r * 2.4;
    spr(v, 'fireSteam', x + Math.cos(a) * 0.3, 0.4, z + Math.sin(a) * 0.3, Math.cos(a) * v0, 0.4, Math.sin(a) * v0, 0.85, 0.8 + Math.random() * 0.3, -0.8, 2.2);
  }
  fireDecal(game, 'wet', { x, z }, r * 0.95, 1.6, { grow: 0.25, fade: 0.9, alpha: 0.24, accent: 0x9fb4c8, hdr: 0.3 });
}
