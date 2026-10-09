import * as THREE from 'three';
import { Projectile, damageArea } from './common.js';
import { fireBillow, fireTier, scorch, spr } from '../vfx/elements/fire.js';

// Look (bible 10 §4.2): a hurled blob of forge-fire that bursts into a soot mushroom.
// Travel: boiling toon orb + flame tongue streaming back + licks, soot, embers, blob shadow.
// Impact: flash, dome, billows to 0.75 r, embers landing on r, dust shock, soot cap, scorch r.
// Rank 5 patch: scorch r 1.2 with a glowing slag lip and three swaying tongues (glow = live).
export const fireball = {
  id: 'fireball',
  name: 'Fireball',
  icon: '🔥',
  element: 'fire',
  maxRank: 5,
  range: 15,
  hint: 'Fire + Frost = Steam Burst. Fire + Storm = Overload.',
  desc: (rank) => [
    'Hurl a fiery projectile that explodes on impact.',
    '+20% damage.',
    '+25% explosion radius.',
    '+1 extra fireball.',
    'Explosions leave a 2.5s burning patch.',
  ][rank - 1],
  cooldown: (rank) => [1.1, 1.0, 0.95, 0.9, 0.8][rank - 1],

  cast(game, ctx) {
    const r = ctx.rank;
    const count = (r >= 4 ? 2 : 1) + game.player.stats.projectiles;
    const dmg = 24 * (1 + (r >= 2 ? 0.2 : 0));
    const explosionRadius = 2.2 * game.player.stats.area * (1 + (r >= 3 ? 0.25 : 0));
    const projectileDmg = dmg * 0.3; // only 30% of explosion damage on direct hit
    const directions = [];
    if (count === 1) {
      directions.push(ctx.dir);
    } else {
      const spread = 0.25;
      const base = Math.atan2(ctx.dir.z, ctx.dir.x);
      for (let i = 0; i < count; i++) {
        const a = base - spread / 2 + (spread * i) / (count - 1);
        directions.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
    }

    for (const dir of directions) {
      game.addActor(new Projectile(game, {
        pos: ctx.origin,
        dir,
        speed: 15,
        range: 15,
        radius: 0.5,
        damage: projectileDmg,
        element: 'fire',
        knockback: 1,
        size: 0.3,
        color: 0xffb347,
        mesh: null,
        onUpdate: (g, p, dt) => fireballTrail(g, p, dt),
        onHit: (g, e, p) => {
          if (!p._exploded) {
            p._exploded = true;
            explodeFireball(g, p.pos, explosionRadius, r);
          }
        },
        onExpire: (g, p) => {
          if (!p._exploded) {
            p._exploded = true;
            explodeFireball(g, p.pos, explosionRadius, r);
          }
        },
      }));
    }
  },
};

// ---------------------------------------------------------------- travel look
const _h = new THREE.Vector3();
function fireballTrail(game, p, dt) {
  const v = game.vfx;
  if (!v || dt <= 0) return;
  let f = p._fx;
  if (!f) {
    f = p._fx = { l: 0, s: 0, e: 0, ox: 0, oy: 0, oz: 0 };
    if (game.player?.muzzle) { game.player.muzzle(_h); f.ox = _h.x - p.pos.x; f.oy = _h.y - p.pos.y; f.oz = _h.z - p.pos.z; }
  }
  const T = fireTier(game), b = v.budget();
  const dx = p.dir.x, dz = p.dir.z;
  let x = p.pos.x, y = p.pos.y, z = p.pos.z;
  const form = Math.min(1, 0.3 + (p.age / 0.08) * 0.7);              // A: the ball forms off the gauntlet
  if (p.age < 0.1) { const k = 1 - p.age / 0.1; x += f.ox * k; y += f.oy * k; z += f.oz * k; }
  const life = Math.min(0.06, dt * 1.5);
  // body: boiling molten orb + a streaming flame tongue behind it + white-hot heart
  const vb = 2.5, hs = 0.85 * form, len = hs * (1 + 0.4 * vb);
  spr(v, 'fireHead', x - dx * (0.3 * len - vb * dt), y, z - dz * (0.3 * len - vb * dt), -dx * vb, 0, -dz * vb, life, hs, 0, 0, 0, 0.4);
  spr(v, 'fireOrb', x, y, z, 0, 0, 0, life, 0.78 * form * (0.94 + Math.random() * 0.12), 0, 0, Math.random() * 6.283, 0);
  spr(v, 'fireCore', x + dx * 0.05, y + 0.03, z + dz * 0.05, 0, 0, 0, life, 0.3 * form, 0, 0, 0);
  // blob shadow sells the 0.9 u height
  spr(v, 'fireChar', x, 0.02, z, 0, 0, 0, life, 0.62, 0, 0, 0, 0);
  // flame licks shed backward and rising
  f.l += dt * 30 * b * (T === 2 ? 0.4 : 1);
  while (f.l >= 1) {
    f.l -= 1;
    spr(v, 'fireLick', x - dx * 0.3 + (Math.random() - 0.5) * 0.25, y + (Math.random() - 0.5) * 0.2, z - dz * 0.3 + (Math.random() - 0.5) * 0.25,
      -dx * 3, 1.2, -dz * 3, 0.28, 0.3 + Math.random() * 0.15);
  }
  if (T < 2) {
    f.s += dt * 15 * b;
    while (f.s >= 1) {
      f.s -= 1;
      spr(v, 'fireSoot', x - dx * 0.45, y + 0.2, z - dz * 0.45, -dx * 0.6, 0.8, -dz * 0.6, 0.75, 0.4 + Math.random() * 0.12, -0.6, 1.4);
    }
  }
  f.e += dt * 15 * b;
  while (f.e >= 1) {
    f.e -= 1;
    const s = (Math.random() - 0.5) * 2;
    spr(v, 'fireEmber', x - dx * 0.3, y, z - dz * 0.3, -dx * 2.5 - dz * s, 0.8 + Math.random(), -dz * 2.5 + dx * s, 0.4, 0.11, undefined, undefined, undefined, 0.22);
  }
}

function explodeFireball(game, pos, radius, rank) {
  const dmg = 24 * (1 + (rank >= 2 ? 0.2 : 0));
  damageArea(game, pos, radius, dmg, { element: 'fire', knockback: 3 });
  fireBillow(game, pos, radius, { scale: rank >= 3 ? 1.15 : 1 });
  game.fx.light(pos, 0xff7a2a, 50, 0.3);
  game.fx.shake(0.08);

  // Rank 5: burning patch
  if (rank >= 5) {
    const patchRadius = 1.2 * game.player.stats.area;
    const look = burningPatch(game, pos, patchRadius, 2.5);

    let patchLife = 2.5;
    let damageAccum = 0;
    game.addActor({
      update(dt, g) {
        patchLife -= dt;
        if (patchLife <= 0) return false;

        damageAccum += dt;
        if (damageAccum >= 0.5) {
          damageAccum = 0;
          damageArea(g, pos, patchRadius, 6, { element: 'fire' });
        }
        look.update(dt, patchLife);
        return true;
      },
      dispose() {},
    });
  }
}

// r5 burning patch (visual): scorch r with a glowing slag lip on r, three tongues swaying ~1.5 Hz,
// embers; the flames shrink over the last 0.4 s, then the lip crumbles (glow = live).
function burningPatch(game, pos, r, life) {
  const v = game.vfx;
  const c = { x: pos.x, z: pos.z };
  scorch(game, c, r, life * 0.7, life + 0.8, { alpha: 0.55, grow: 0.15, intensity: 1.2 });
  const nl = 7;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * 6.283 + Math.random() * 0.5, rr = r * (0.96 + Math.random() * 0.08);
    v.sprout('fireSlag', { x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr }, { scale: 0.55 + Math.random() * 0.25, life, tilt: 0.5 });
  }
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.283 + Math.random() * 0.8, rr = r * (0.2 + Math.random() * 0.35);
    flames.push({ x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr, ph: Math.random() * 6, s: 0.85 + Math.random() * 0.4, acc: Math.random() });
  }
  let eA = 0;
  return {
    update(dt, left) {
      const k = Math.min(1, Math.max(0, left / 0.4));
      const b = v.budget();
      for (const f of flames) {
        f.acc += dt * 12 * b;
        while (f.acc >= 1) {
          f.acc -= 1;
          const sway = Math.sin(v.time * 9.4 + f.ph) * 0.5;
          spr(v, 'fireLick', f.x, 0.12, f.z, sway, 0.4, sway * 0.4, undefined, (0.75 + Math.random() * 0.3) * f.s * (0.3 + 0.7 * k));
        }
      }
      eA += dt * 10 * b * k;
      while (eA >= 1) {
        eA -= 1;
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * 0.85;
        spr(v, 'fireEmber', c.x + Math.cos(a) * rr, 0.15, c.z + Math.sin(a) * rr, 0, 1.2 + Math.random(), 0);
      }
    },
  };
}
