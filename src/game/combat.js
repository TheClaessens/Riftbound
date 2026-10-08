import * as THREE from 'three';
import { ELEMENT_COLOR, ELEMENT_CSS, dirXZ, randRange } from '../core/utils.js';

// =====================================================================================
//  Damage, elemental statuses and REACTIONS — the combo engine.
//
//  Elements: 'arcane' | 'fire' | 'frost' | 'storm' | 'physical'
//  Status on enemy (enemy.status):
//    burn / burnDps / burnTick : burning (DoT)
//    chill (stacks 0..freezeAt) / chillT ; frozen (s)
//    shock (s)  : takes +stats.shockAmp damage
//    stun (s)   : can't move / attack, takes +25% damage
//  Reactions:
//    fire  ↔ chill/frozen  -> STEAM BURST        fire  ↔ shock -> OVERLOAD
//    frost ↔ shock         -> SUPERCONDUCT
//    arcane → frozen -> SHATTER   arcane → burn -> COMBUST   arcane → shock -> ARC FLASH
//  Enemy modifiers:
//    enemy.resist = { fire: 0.5 }  multiplies damage AND status duration of that element
//    enemy.ward   = 'fire'|...      immune to that element; any reaction on it breaks the ward
//    enemy.barrier                  points absorbed before HP
//    enemy.inert                    world objects (geodes): no status, no XP / kills, onDeath()
// =====================================================================================

export const REACTIONS = {
  steam: { id: 'steam', name: 'STEAM BURST', color: '#ffb38a', hex: 0xffb38a, elements: ['fire', 'frost'], desc: 'Fire + Frost: scalding AoE explosion.' },
  overload: { id: 'overload', name: 'OVERLOAD', color: '#ff9d3d', hex: 0xff8a2a, elements: ['fire', 'storm'], desc: 'Fire + Storm: big explosion with heavy knockback.' },
  superconduct: { id: 'superconduct', name: 'SUPERCONDUCT', color: '#9ff3ff', hex: 0x9ff3ff, elements: ['frost', 'storm'], desc: 'Frost + Storm: lightning arcs to nearby foes and chills them.' },
  shatter: { id: 'shatter', name: 'SHATTER', color: '#e0c4ff', hex: 0xd8b8ff, elements: ['arcane', 'frost'], desc: 'Arcane on a Frozen foe: x2.5 damage and ice shards.' },
  combust: { id: 'combust', name: 'COMBUST', color: '#ff7ab8', hex: 0xff5aa0, elements: ['arcane', 'fire'], desc: 'Arcane on a Burning foe: detonates the burn instantly and spreads it.' },
  arcflash: { id: 'arcflash', name: 'ARC FLASH', color: '#f4e8ff', hex: 0xe8d8ff, elements: ['arcane', 'storm'], desc: 'Arcane on a Shocked foe: stuns everything nearby.' },
};

export function makeStatus() {
  return { burn: 0, burnDps: 0, burnTick: 0, chill: 0, chillT: 0, frozen: 0, shock: 0, stun: 0, reactCd: 0 };
}

let reactionDepth = 0;
const _tmp = [];
const _dir = new THREE.Vector3();

export function reactionBase(game) {
  const p = game.player;
  return (18 + 7 * p.level) * p.stats.reaction;
}

// Which reaction (if any) does applying `element` to `enemy` cause?
export function checkReaction(enemy, element) {
  const s = enemy.status;
  const cold = s.chill > 0 || s.frozen > 0;
  switch (element) {
    case 'fire': return cold ? 'steam' : s.shock > 0 ? 'overload' : null;
    case 'frost': return s.burn > 0 ? 'steam' : s.shock > 0 ? 'superconduct' : null;
    case 'storm': return s.burn > 0 ? 'overload' : cold ? 'superconduct' : null;
    case 'arcane': return s.frozen > 0 ? 'shatter' : s.burn > 0 ? 'combust' : s.shock > 0 ? 'arcflash' : null;
    default: return null;
  }
}

// Apply an element's status without damage. power scales duration / stacks.
export function applyStatus(game, enemy, element, power = 1) {
  if (enemy.inert || enemy.ward === element) return;
  const s = enemy.status;
  const st = game.player.stats;
  const res = enemy.resist?.[element] ?? 1;
  const bossRes = enemy.boss ? 0.4 : 1;
  switch (element) {
    case 'fire': {
      const dps = (6 + game.player.level * 1.6) * st.damage * st.burnDmg * power;
      s.burn = Math.max(s.burn, 3 * st.burnDur * res);
      s.burnDps = Math.max(s.burnDps, dps);
      break;
    }
    case 'frost': {
      if (s.frozen > 0) { s.frozen = Math.max(s.frozen, 0.6); break; }
      s.chill = Math.min(st.freezeAt, s.chill + Math.max(1, Math.round(power)) * bossRes * res);
      s.chillT = 3;
      if (s.chill >= st.freezeAt) {
        s.frozen = (enemy.boss ? 0.6 : 1.6) * res;
        s.chill = 0;
        game.fx.burst(enemy.pos, { color: ELEMENT_COLOR.frost, count: 8, speed: 3, life: 0.4, size: 0.3 });
        game.events.emit('enemyFrozen', { enemy });
      }
      break;
    }
    case 'storm':
      s.shock = Math.max(s.shock, 4 * power * st.shockDur * res);
      break;
  }
}

export function stunEnemy(enemy, dur) {
  if (enemy.inert) return;
  enemy.status.stun = Math.max(enemy.status.stun, enemy.boss ? Math.min(0.3, dur) : dur);
}

// Deal damage to an enemy. Returns damage dealt.
// opts: element, knockback (impulse), dir (Vector3 XZ, push direction; defaults away from player),
//       noReaction (skip reactions), noStatus (skip applying status), statusPower, raw (ignore player dmg mult),
//       noCrit, silent (no number)
export function damageEnemy(game, enemy, amount, opts = {}) {
  if (!enemy || enemy.dead) return 0;
  const p = game.player;
  const st = p.stats;
  const element = opts.element ?? 'physical';
  const s = enemy.status;

  // Prism Ward: immune to that element.
  if (enemy.ward && enemy.ward === element) {
    const now = game.time;
    if (!enemy._immuneT || now - enemy._immuneT > 0.5) { enemy._immuneT = now; game.fx.text(enemy.pos, 'IMMUNE', ELEMENT_CSS[element] ?? '#fff'); }
    return 0;
  }

  let dmg = amount * (opts.raw ? 1 : st.damage * (1 + p.traitDamage));
  let crit = false;
  if (!opts.noCrit && Math.random() < st.crit) { dmg *= 2; crit = true; }
  if (s.shock > 0) dmg *= 1 + st.shockAmp;
  if (s.stun > 0) dmg *= 1.25;
  if (s.frozen > 0 && p.traitId === 'permafrost') dmg *= 1.35;
  if (enemy.resist?.[element] !== undefined) dmg *= enemy.resist[element];

  // ---- reactions / statuses ----
  let reacted = null;
  if (!enemy.inert && !opts.noReaction && reactionDepth < 2 && s.reactCd <= 0) {
    reacted = checkReaction(enemy, element);
  }
  if (reacted) {
    s.reactCd = 0.2;
    if (reacted === 'shatter') dmg *= 2.5;
    triggerReaction(game, enemy, reacted, opts);
    if (enemy.ward) breakWard(game, enemy);
    if (st.reactionEcho > 0 && Math.random() < st.reactionEcho) {
      game.fx.text({ x: enemy.pos.x, y: 0.8, z: enemy.pos.z }, 'ECHO', '#ffffff');
      triggerReaction(game, enemy, reacted, opts, true);
    }
  } else if (!opts.noStatus && element !== 'physical' && element !== 'arcane') {
    applyStatus(game, enemy, element, opts.statusPower ?? 1);
  }

  // barrier absorbs first
  if (enemy.barrier > 0) {
    const absorbed = Math.min(enemy.barrier, dmg);
    enemy.barrier -= absorbed;
    dmg -= absorbed;
    if (enemy.barrier <= 0) game.fx.burst(enemy.pos, { color: 0xbfa8ff, count: 10, speed: 4, life: 0.35, size: 0.3 });
  }

  enemy.hp -= dmg;
  enemy.flash?.();
  if (!enemy.inert) game.stats.damageDealt += dmg;

  if (opts.knockback) {
    const d = opts.dir ? _dir.copy(opts.dir) : dirXZ(p.pos, enemy.pos, _dir);
    enemy.knock.addScaledVector(d, opts.knockback * (1 - (enemy.kbResist ?? 0)));
  }
  if (!opts.silent && dmg >= 0.5) {
    game.fx.number(enemy.pos, dmg, { color: crit ? '#fff27a' : (ELEMENT_CSS[element] ?? '#fff'), crit });
  }
  if (enemy.hp <= 0) killEnemy(game, enemy);
  return dmg;
}

export function breakWard(game, enemy) {
  const el = enemy.ward;
  enemy.ward = null;
  game.fx.burst(enemy.pos, { color: ELEMENT_COLOR[el] ?? 0xffffff, count: 24, speed: 7, life: 0.5, size: 0.35, up: 1 });
  game.fx.ring(enemy.pos, { color: ELEMENT_COLOR[el] ?? 0xffffff, radius: 2.5, life: 0.3 });
  game.fx.text(enemy.pos, 'WARD BROKEN', '#ffffff');
  game.events.emit('wardBroken', { enemy, element: el });
}

export function killEnemy(game, enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  if (enemy.inert) { enemy.onDeath?.(game); return; }
  game.stats.kills++;
  const st = game.player.stats;
  const byReaction = reactionDepth > 0;
  enemy.killedByReaction = byReaction;
  const xp = (enemy.xp ?? 1) * (byReaction ? st.reactionXp : 1);
  game.pickups.spawnXP(enemy.pos, xp);
  // Relic Chests: bosses, Elite Surge's Relic Bearer, and 6% of random elites (~7 per run).
  const chest = enemy.boss || enemy.dropsChest || (enemy.elite && enemy.dropsChest === undefined && Math.random() < 0.06);
  if (chest) game.pickups.spawn('chest', enemy.pos);
  if (Math.random() < (enemy.boss ? 1 : enemy.elite ? 0.25 : 0.01)) game.pickups.spawn('health', { x: enemy.pos.x + 1, z: enemy.pos.z });
  if (Math.random() < (enemy.boss ? 1 : enemy.elite ? 0.12 : 0.0025)) game.pickups.spawn('magnet', { x: enemy.pos.x - 1, z: enemy.pos.z });
  game.fx.burst(enemy.pos, { color: enemy.deathColor ?? 0x9a7cff, count: enemy.boss ? 80 : 10, speed: enemy.boss ? 10 : 4, life: 0.6, size: 0.35, gravity: 6, up: 1.2 });
  enemy.onDeath?.(game);
  game.events.emit('enemyKilled', { enemy });
}

function triggerReaction(game, enemy, type, opts, isEcho = false) {
  const R = REACTIONS[type];
  const s = enemy.status;
  const pos = enemy.pos.clone();
  const st = game.player.stats;
  const base = reactionBase(game);
  const area = st.area;
  if (!isEcho) {
    game.stats.reactions[type] = (game.stats.reactions[type] ?? 0) + 1;
    game.events.emit('reaction', { type, pos, enemy });
    game.fx.text(pos, R.name, R.color, false);
  }
  reactionDepth++;
  try {
    switch (type) {
      case 'steam': {
        s.burn = 0; s.chill = 0; s.frozen = 0;
        const r = 2.8 * area;
        game.fx.ring(pos, { color: R.hex, radius: r, life: 0.35 });
        game.fx.flashDisc(pos, { color: 0xffd0b0, radius: r * 0.8, life: 0.25 });
        game.fx.burst(pos, { color: 0xffd8c8, count: 14, speed: 6, life: 0.6, size: 0.5, up: 1.5, drag: 3, hdr: 0.8 });
        game.fx.light(pos, 0xffaa77, 40, 0.3);
        game.fx.shake(0.18);
        for (const e of game.queryEnemies(pos, r, _tmp).slice()) {
          if (e !== enemy) damageEnemy(game, e, base, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        }
        damageEnemy(game, enemy, base * 0.5, { element: 'physical', raw: true, noReaction: true, noCrit: true, silent: true });
        break;
      }
      case 'overload': {
        s.burn = 0; s.shock = 0;
        const r = 3.2 * area * st.overloadRadius;
        game.fx.ring(pos, { color: R.hex, radius: r, life: 0.4, width: 0.3 });
        game.fx.flashDisc(pos, { color: 0xff7a2a, radius: r, life: 0.3, hdr: 2.2 });
        game.fx.burst(pos, { color: 0xff8a2a, count: 30, speed: 9, life: 0.6, size: 0.45, gravity: 5, up: 1.2 });
        game.fx.burst(pos, { color: 0xffe14a, count: 12, speed: 12, life: 0.3, size: 0.25 });
        game.fx.light(pos, 0xff7a2a, 60, 0.35);
        game.fx.shake(0.3);
        game.hitStop(0.045);
        for (const e of game.queryEnemies(pos, r, _tmp).slice()) {
          if (st.overloadStun > 0) stunEnemy(e, st.overloadStun);
          damageEnemy(game, e, base * 1.3, { element: 'physical', raw: true, noReaction: true, noCrit: true, knockback: 14, dir: dirXZ(pos, e.pos, new THREE.Vector3()) });
        }
        break;
      }
      case 'superconduct': {
        s.shock = 0;
        const targets = game.queryEnemies(pos, 6.5 * area, _tmp)
          .filter((e) => e !== enemy && !e.inert)
          .sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos))
          .slice(0, 4);
        game.fx.ring(pos, { color: R.hex, radius: 2, life: 0.3 });
        game.fx.light(pos, 0x9ff3ff, 30, 0.25);
        game.fx.shake(0.12);
        for (const t of targets) {
          game.fx.lightning(pos, t.pos, { color: R.hex, life: 0.22 });
          damageEnemy(game, t, base * 0.6, { element: 'frost', raw: true, noCrit: true, statusPower: 2 });
        }
        applyStatus(game, enemy, 'frost', 2);
        break;
      }
      case 'shatter': {
        s.frozen = 0; s.chill = 0;
        game.fx.burst(pos, { color: 0xbfefff, count: 24, speed: 8, life: 0.5, size: 0.3, gravity: 10, up: 1 });
        game.fx.burst(pos, { color: 0xc08cff, count: 10, speed: 4, life: 0.4, size: 0.5 });
        game.fx.ring(pos, { color: 0xd8b8ff, radius: 1.8, life: 0.25 });
        game.fx.shake(0.1);
        game.hitStop(0.045);
        for (const e of game.queryEnemies(pos, 2.2 * area, _tmp).slice()) {
          if (e !== enemy) damageEnemy(game, e, base * 0.4, { element: 'frost', raw: true, noReaction: true, noCrit: true });
        }
        break;
      }
      case 'combust': {
        const remaining = Math.max(0, s.burn) * s.burnDps;
        const dmg = Math.max(base * 0.8, remaining * 3);
        s.burn = 0; s.burnDps = 0;
        const r = 2.2 * area;
        game.fx.flashDisc(pos, { color: 0xff5aa0, radius: r, life: 0.28, hdr: 2 });
        game.fx.ring(pos, { color: R.hex, radius: r * 1.2, life: 0.3, width: 0.25 });
        game.fx.burst(pos, { color: 0xff6a1f, count: 22, speed: 8, life: 0.5, size: 0.45, up: 2, gravity: 4 });
        game.fx.burst(pos, { color: 0xff5aa0, count: 10, speed: 5, life: 0.4, size: 0.4 });
        game.fx.light(pos, 0xff5aa0, 45, 0.3);
        game.fx.shake(0.2);
        game.hitStop(0.045);
        damageEnemy(game, enemy, dmg, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        const near = game.queryEnemies(pos, Math.max(r, 4), _tmp).filter((e) => e !== enemy && !e.inert).slice();
        near.sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos));
        for (const e of near) {
          if (e.pos.distanceTo(pos) <= r) damageEnemy(game, e, dmg * 0.5, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        }
        for (const e of near.slice(0, 3)) {
          if (e.dead) continue;
          applyStatus(game, e, 'fire', 1);
          game.fx.lightning(pos, e.pos, { color: 0xff6a1f, life: 0.18, strands: 1, jag: 0.25 });
        }
        break;
      }
      case 'arcflash': {
        s.shock = 0;
        const r = 3 * area;
        game.fx.flashDisc(pos, { color: 0xffffff, radius: r, life: 0.18, hdr: 3 });
        game.fx.ring(pos, { color: R.hex, radius: r, life: 0.3, width: 0.12 });
        game.fx.burst(pos, { color: 0xffe14a, count: 14, speed: 9, life: 0.3, size: 0.25 });
        game.fx.light(pos, 0xffffff, 50, 0.2);
        game.fx.shake(0.12);
        for (const e of game.queryEnemies(pos, r, _tmp).slice()) {
          stunEnemy(e, 1.2);
          damageEnemy(game, e, base * 0.5, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        }
        break;
      }
    }
  } finally {
    reactionDepth--;
  }
}

// Tick statuses. Returns movement multiplier (0 when frozen or stunned).
export function updateStatuses(game, enemy, dt) {
  const s = enemy.status;
  if (s.reactCd > 0) s.reactCd -= dt;
  if (s.burn > 0) {
    s.burn -= dt;
    s.burnTick -= dt;
    if (s.burnTick <= 0) {
      s.burnTick = 0.5;
      damageEnemy(game, enemy, s.burnDps * 0.5, { element: 'fire', raw: true, noReaction: true, noStatus: true, noCrit: true });
      if (Math.random() < 0.8) game.fx.burst(enemy.pos, { color: ELEMENT_COLOR.fire, count: 2, speed: 1, life: 0.5, size: 0.3, up: 2.5, gravity: -2 });
    }
    if (s.burn <= 0) s.burnDps = 0;
  }
  if (s.shock > 0) s.shock -= dt;
  if (s.stun > 0) { s.stun -= dt; if (s.frozen > 0) s.frozen -= dt; return 0; }
  if (s.frozen > 0) { s.frozen -= dt; return 0; }
  if (s.chill > 0) {
    s.chillT -= dt;
    if (s.chillT <= 0) { s.chill = Math.max(0, s.chill - 1); s.chillT = 1; }
  }
  return 1 - 0.12 * Math.min(5, s.chill);
}

// Tint helper for enemy meshes: returns a hex color describing the dominant status (or null).
export function statusTint(enemy) {
  const s = enemy.status;
  if (s.frozen > 0) return 0x58c8ff;
  if (s.stun > 0) return 0xf4e8ff;
  if (s.burn > 0) return 0xff5a1a;
  if (s.shock > 0) return 0xffe14a;
  if (s.chill > 0) return 0x5fb8ff;
  return null;
}

// True while the reaction engine is resolving (used for "killed by reaction").
export const inReaction = () => reactionDepth > 0;

export function randomAngleOffset(spread) { return randRange(-spread, spread); }
