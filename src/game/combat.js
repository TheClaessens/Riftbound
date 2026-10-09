import * as THREE from 'three';
import { ELEMENT_COLOR, ELEMENT_CSS, dirXZ, randRange } from '../core/utils.js';
import { REACTION_FX, frozenFx, burnTickFx, wardBreakFx, barrierBreakFx, killFx } from './vfx/reactions.js';

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
  combust: { id: 'combust', name: 'COMBUST', color: '#ffb070', hex: 0xff9a3c, elements: ['arcane', 'fire'], desc: 'Arcane on a Burning foe: detonates the burn instantly and spreads it.' },
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
        frozenFx(game, enemy);
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
    // only reactions the player caused directly echo: an echoed Superconduct used to set off
    // reactions that echoed again (the Prism Lens chain engine, playtest round 1)
    if (st.reactionEcho > 0 && reactionDepth === 0 && Math.random() < st.reactionEcho) {
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
    if (enemy.barrier <= 0) barrierBreakFx(game, enemy);
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
  wardBreakFx(game, enemy, el);
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
  killFx(game, enemy);
  enemy.onDeath?.(game);
  game.events.emit('enemyKilled', { enemy });
}

// The 45 ms freeze sells a reaction while they are rare. At Chain 4+ they come several times a
// second and the freezes turn into a stutter, so it is skipped there.
function reactionHitStop(game) {
  if (game.chain <= 3) game.hitStop(0.045);
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
        REACTION_FX.steam(game, pos, { r, enemy, isEcho });
        for (const e of game.queryEnemies(pos, r, _tmp).slice()) {
          if (e !== enemy) damageEnemy(game, e, base, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        }
        damageEnemy(game, enemy, base * 0.5, { element: 'physical', raw: true, noReaction: true, noCrit: true, silent: true });
        break;
      }
      case 'overload': {
        s.burn = 0; s.shock = 0;
        const r = 3.2 * area * st.overloadRadius;
        REACTION_FX.overload(game, pos, { r, enemy, isEcho });
        reactionHitStop(game);
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
        REACTION_FX.superconduct(game, pos, { targets, enemy, isEcho });
        for (const t of targets) {
          damageEnemy(game, t, base * 0.6, { element: 'frost', raw: true, noCrit: true, statusPower: 2 });
        }
        applyStatus(game, enemy, 'frost', 2);
        break;
      }
      case 'shatter': {
        s.frozen = 0; s.chill = 0;
        REACTION_FX.shatter(game, pos, { r: 2.2 * area, enemy, isEcho });
        reactionHitStop(game);
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
        reactionHitStop(game);
        damageEnemy(game, enemy, dmg, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        const near = game.queryEnemies(pos, Math.max(r, 4), _tmp).filter((e) => e !== enemy && !e.inert).slice();
        near.sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos));
        for (const e of near) {
          if (e.pos.distanceTo(pos) <= r) damageEnemy(game, e, dmg * 0.5, { element: 'physical', raw: true, noReaction: true, noCrit: true });
        }
        const spread = [];
        for (const e of near.slice(0, 3)) {
          if (e.dead) continue;
          applyStatus(game, e, 'fire', 1);
          spread.push(e);
        }
        REACTION_FX.combust(game, pos, { r, spread, enemy, isEcho });
        break;
      }
      case 'arcflash': {
        s.shock = 0;
        const r = 3 * area;
        REACTION_FX.arcflash(game, pos, { r, enemy, isEcho });
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
      burnTickFx(game, enemy);
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

// Emissive wash for statuses the rig shader doesn't draw itself (stun only now; burn / chill /
// frozen / shock are drawn by the rig's status channel, see statusLook, and vfx/status.js overlays).
export function statusTint(enemy) {
  return enemy.status.stun > 0 ? 0xf4e8ff : null;
}

// Rig status channel: writes [burn 0/1, cold (chill / freezeAt × 0.95, frozen = 1), shock 0/1] into out.
export function statusLook(enemy, out, freezeAt = 5) {
  const s = enemy.status;
  out[0] = s.burn > 0 ? 1 : 0;
  out[1] = s.frozen > 0 ? 1 : Math.min(0.95, 0.95 * s.chill / Math.max(1, freezeAt));
  out[2] = s.shock > 0 ? 1 : 0;
  return out;
}
// True while the reaction engine is resolving (used for "killed by reaction").
export const inReaction = () => reactionDepth > 0;

export function randomAngleOffset(spread) { return randRange(-spread, spread); }
