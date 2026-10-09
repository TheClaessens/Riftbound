// =====================================================================================
//  RELICS — build-bending passives from Relic Chests (elites, bosses).
//  def: { id, name, icon, tag, desc, flavour,
//         apply?(stats)            → stat modifiers (re-applied on every recalc)
//         init?(game, player, st)  → event-driven effects; return a cleanup function }
// =====================================================================================
import { damageEnemy, applyStatus, stunEnemy, reactionBase } from './combat.js';

export const RELIC_TAG_COLOR = {
  reaction: '#e0c4ff', fire: '#ff7a33', frost: '#7fe0ff', storm: '#ffe45c',
  risk: '#ff4d5e', dodge: '#9dffb0', economy: '#ffd34d', cast: '#c08cff', safety: '#ffffff',
  boss: '#ec9a3c',   // Boss Relics (v5): gold-crimson; only from Echo chests and Heat 3
};

export const RELICS = {
  alchemistsCoil: { id: 'alchemistsCoil', name: "Alchemist's Coil", icon: '⚗', tag: 'reaction',
    desc: '+40% reaction damage.', flavour: 'Copper wound by a madman. It hums.',
    apply: (s) => { s.reaction += 0.4; } },
  prismLens: { id: 'prismLens', name: 'Prism Lens', icon: '◇', tag: 'reaction',
    desc: 'Reactions have a 25% chance to echo.', flavour: 'Everything happens twice through it.',
    apply: (s) => { s.reactionEcho += 0.25; } },
  unstableCore: { id: 'unstableCore', name: 'Unstable Core', icon: '✺', tag: 'reaction',
    desc: 'Overload has +50% radius and stuns for 0.6s.', flavour: 'Do not shake.',
    apply: (s) => { s.overloadRadius *= 1.5; s.overloadStun = Math.max(s.overloadStun, 0.6); } },
  emberHeart: { id: 'emberHeart', name: 'Ember Heart', icon: '❤', tag: 'fire',
    desc: 'Burn lasts twice as long and deals +50% damage.', flavour: 'Still warm. Still beating.',
    apply: (s) => { s.burnDur *= 2; s.burnDmg *= 1.5; } },
  pyreCrown: { id: 'pyreCrown', name: 'Pyre Crown', icon: '♛', tag: 'fire',
    desc: 'Killing a burning foe heals 0.5 HP.', flavour: 'Worn by a king who ruled ashes.',
    init: (game, p) => game.events.on('enemyKilled', ({ enemy }) => { if (enemy.status.burn > 0) p.hp = Math.min(p.stats.maxHp, p.hp + 0.5); }) },
  rimeShard: { id: 'rimeShard', name: 'Rime Shard', icon: '❅', tag: 'frost',
    desc: 'Foes Freeze at 3 Chill instead of 5.', flavour: 'Cold enough to stop a thought.',
    apply: (s) => { s.freezeAt = Math.min(s.freezeAt, 3); } },
  glacierPlate: { id: 'glacierPlate', name: 'Glacier Plate', icon: '⛨', tag: 'frost',
    desc: '−3% damage taken per Frozen foe within 6u (max −24%).', flavour: 'The stillness guards you.',
    init: (game, p, st) => {
      st.t = 0;
      const off = game.events.on('tick', ({ dt }) => {
        st.t -= dt; if (st.t > 0) return; st.t = 0.25;
        let n = 0;
        for (const e of game.queryEnemies(p.pos, 6, [])) if (e.status.frozen > 0 && ++n >= 8) break;
        p.relicDmgTaken = 1 - 0.03 * n;
      });
      return () => { off(); p.relicDmgTaken = 1; };
    } },
  stormglassBoots: { id: 'stormglassBoots', name: 'Stormglass Boots', icon: '➹', tag: 'storm',
    desc: '+15% move speed, −30% dash cooldown.', flavour: 'Each step lands before the last.',
    apply: (s) => { s.moveSpeed *= 1.15; s.dashCdr += 0.3; } },
  conductorsRing: { id: 'conductorsRing', name: "Conductor's Ring", icon: '◯', tag: 'storm',
    desc: 'Shock lasts twice as long; Shocked foes take +40% damage.', flavour: 'The current wants a path.',
    apply: (s) => { s.shockDur *= 2; s.shockAmp = Math.max(s.shockAmp, 0.4); } },
  glassSigil: { id: 'glassSigil', name: 'Glass Sigil', icon: '⟁', tag: 'risk',
    desc: '+50% damage, −40% max HP.', flavour: 'Beautiful. Fragile. Lethal.',
    apply: (s) => { s.damage += 0.5; s.maxHp *= 0.6; } },
  bloodPact: { id: 'bloodPact', name: 'Blood Pact', icon: '🩸', tag: 'risk',
    desc: '+1 projectile. Lose 1 HP/s while above 50% HP.', flavour: 'Paid in advance. Forever.',
    apply: (s) => { s.projectiles += 1; },
    init: (game, p) => game.events.on('tick', ({ dt }) => { if (p.hp > p.stats.maxHp * 0.5) p.hp -= dt; }) },
  duelistsMark: { id: 'duelistsMark', name: "Duelist's Mark", icon: '⚔', tag: 'dodge',
    desc: 'Perfect Dodges heal 8% HP and Adrenaline lasts 6s.', flavour: 'Closer. Closer. Now.',
    init: (game, p) => { p.adrenalineDur = 6; const off = game.events.on('perfectDodge', () => p.heal(p.stats.maxHp * 0.08)); return () => { off(); p.adrenalineDur = 3; }; } },
  thornedWard: { id: 'thornedWard', name: 'Thorned Ward', icon: '✣', tag: 'dodge',
    desc: 'When hit, release a nova dealing 300% of the damage taken.', flavour: 'It remembers every wound.',
    init: (game, p) => game.events.on('playerHit', ({ amount }) => {
      game.fx.ring(p.pos, { color: 0x9dffb0, radius: 4, life: 0.35 });
      for (const e of game.queryEnemies(p.pos, 4, []).slice()) damageEnemy(game, e, amount * 3, { element: 'physical', raw: true, noCrit: true, knockback: 6 });
    }) },
  hoardersLantern: { id: 'hoardersLantern', name: "Hoarder's Lantern", icon: '🏮', tag: 'economy',
    desc: '+30% XP. Chests offer 4 relics.', flavour: 'Its light finds what others missed.',
    apply: (s) => { s.xpMult += 0.3; s.chestChoices = 4; } },
  riftMagnet: { id: 'riftMagnet', name: 'Rift Magnet', icon: '⋒', tag: 'economy',
    desc: 'Foes killed by reactions drop double XP.', flavour: 'Chaos pays dividends.',
    apply: (s) => { s.reactionXp += 1; } },   // additive: Magnetism also raises reactionXp
  echoStone: { id: 'echoStone', name: 'Echo Stone', icon: '◈', tag: 'cast',
    desc: 'Slotted skills have a 15% chance to cast twice.', flavour: 'It repeats what it hears.',
    apply: (s) => { s.echo += 0.15; } },
  overclock: { id: 'overclock', name: 'Overclock', icon: '⚙', tag: 'cast',
    desc: 'Every 8th skill cast resets all your cooldowns.', flavour: 'Faster. Faster. FASTER.',
    init: (game, p, st) => {
      st.n = 0;
      return game.events.on('cast', ({ echo }) => {
        if (echo || ++st.n < 8) return;
        st.n = 0;
        for (const s of p.skills) s.cd = 0;
        game.fx.ring(p.pos, { color: 0xc08cff, radius: 3, life: 0.3 });
        game.fx.text(p.pos, 'OVERCLOCK', '#c08cff');
      });
    } },
  secondWind: { id: 'secondWind', name: 'Second Wind', icon: '❂', tag: 'safety',
    desc: 'Once per run, survive lethal damage at 50% HP and freeze foes nearby.', flavour: 'Not yet.',
    init: (game, p) => { p.secondWind = true; return () => { p.secondWind = false; }; },
    onTrigger: (game, p) => {
      p.hp = p.stats.maxHp * 0.5;
      game.fx.ring(p.pos, { color: 0x9ff3ff, radius: 6, life: 0.5 });
      game.fx.text(p.pos, 'SECOND WIND', '#ffffff', true);
      for (const e of game.queryEnemies(p.pos, 6, []).slice()) applyStatus(game, e, 'frost', 10);
    } },
};

// ---------------------------------------------------------------------------------------------
//  Boss Relics (v5, design/RAID_PASSES.md Pass 6): tag 'boss', never in normal chests. They come from
//  the Echo Chest (spec.pool === 'boss') and from Heat 3 chests (spec.bossRelics).
// ---------------------------------------------------------------------------------------------
const _hits = [];
const BOSS_RELICS = {
  gorraksTusk: { id: 'gorraksTusk', name: "Gorrak's Tusk", icon: '⇶', tag: 'boss',
    desc: 'Your dash ends in a shockwave (r 3, stuns 0.5s, knockback) and recharges 25% faster.', flavour: 'Cracked off the Troll King. It still wants to charge.',
    apply: (s) => { s.dashCdr += 0.25; },
    init: (game, p, st) => {
      st.on = false; st.t = 0;
      const offA = game.events.on('dash', () => { st.on = true; st.t = 1.2; });
      const offB = game.events.on('tick', ({ dt }) => {
        if (!st.on) return;
        st.t -= dt;
        if (p.dash.t > 0 && st.t > 0) return;      // wait for the dash (or blink) to finish
        st.on = false;
        const R = 3 * p.stats.area, dmg = reactionBase(game) * 0.3;
        game.fx.ring(p.pos, { color: 0xd8b878, radius: R, life: 0.35, width: 0.25 });
        game.fx.burst(p.pos, { color: 0x8a6a48, count: 10, speed: 4, life: 0.5, size: 0.5, up: 1.5, blend: 'normal' });
        game.fx.shake(0.12);
        for (const e of game.queryEnemies(p.pos, R + 0.5, _hits).slice()) {
          if (e.dead || e.inert || Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > R + (e.radius ?? 0.5)) continue;
          stunEnemy(e, 0.5);
          damageEnemy(game, e, dmg, { element: 'physical', raw: true, noCrit: true, noStatus: true, knockback: 8, silent: !e.boss });
        }
      });
      return () => { offA(); offB(); };
    } },
  vashkarsBrand: { id: 'vashkarsBrand', name: "Vashkar's Brand", icon: '♨', tag: 'boss',
    desc: "Foes' Fire resistance is ignored. Burning foes spread Burn to 2 nearby foes when they die.", flavour: 'Branded into the warchief. Now it brands back.',
    apply: (s) => { s.ignoreFireResist = 1; },
    init: (game) => game.events.on('enemyKilled', ({ enemy }) => {
      if (!enemy?.status || enemy.status.burn <= 0) return;
      let n = 0;
      for (const e of game.queryEnemies(enemy.pos, 7, []).slice()) {
        if (e === enemy || e.dead || e.inert || e.status.burn > 0) continue;
        applyStatus(game, e, 'fire', 1);
        game.fx.burst(e.pos, { color: 0xff8a3a, count: 6, speed: 3, life: 0.4, size: 0.3, up: 1.5 });
        if (++n >= 2) break;
      }
    }) },
  aurelithsScale: { id: 'aurelithsScale', name: "Aurelith's Scale", icon: '⬡', tag: 'boss',
    desc: 'Every 12s your next reaction is guaranteed to echo and breaks Prism Wards.', flavour: 'Each facet remembers a different light.',
    init: (game, p, st) => {
      st.ready = false; st.cd = 12; st.used = false;
      const arm = () => {
        st.ready = true; st.used = false;
        // while ready, every reaction echoes (reactionEcho 1); the buff is dropped one tick after the first reaction
        p.addBuff('aurelithsScale', 99999, { name: "Aurelith's Scale", icon: '⬡', color: '#7fd4ff', apply: (s) => { s.reactionEcho = 1; } });
        game.fx.text(p.pos, 'SCALE READY', '#7fd4ff');
      };
      const offA = game.events.on('reaction', ({ enemy }) => {
        if (!st.ready || st.used) return;
        st.used = true;
        if (enemy?.ward) game.events.emit('scaleBreak', { enemy });
        enemy?.breakWard?.('scale');       // boss scripts with a Prism Ward may expose breakWard(src)
        game.fx.text(enemy?.pos ?? p.pos, 'PRISM ECHO', '#7fd4ff');
      });
      const offB = game.events.on('tick', ({ dt }) => {
        if (st.used) { st.ready = false; st.used = false; st.cd = 12; p.buffs.delete('aurelithsScale'); p.recalcStats(); return; }
        if (st.ready) return;
        st.cd -= dt;
        if (st.cd <= 0) arm();
      });
      return () => { offA(); offB(); p.buffs.delete('aurelithsScale'); p.recalcStats(); };
    } },
  riftbreakersSigil: { id: 'riftbreakersSigil', name: "Riftbreaker's Sigil", icon: '✧', tag: 'boss',
    desc: '+60% Poise gain. Downed bosses take 20% more damage from you.', flavour: 'Every wall has a seam. This finds it.',
    apply: (s) => { s.poiseGain += 0.6; s.downedDmg += 0.2; } },
};
// Perfect Dodges become attacks: a fire burst (burns, stuns 0.4 s, adds Stagger to bosses).
BOSS_RELICS.ashenStandard = { id: 'ashenStandard', name: 'Ashen Standard', icon: '⚑', tag: 'boss',
  desc: 'Perfect Dodges erupt in a fire burst (r 5): burns, stuns for 0.4s and adds Stagger to bosses.', flavour: 'It burns brightest where you should have died.',
  init: (game, p) => game.events.on('perfectDodge', () => {
    const R = 5 * p.stats.area, dmg = reactionBase(game) * 0.8;
    game.fx.ring(p.pos, { color: 0xff9a3c, radius: R, life: 0.4, width: 0.25 });
    game.fx.burst(p.pos, { color: 0xff7a33, count: 22, speed: 6, life: 0.6, size: 0.4, up: 2, hdr: 2 });
    for (const e of game.queryEnemies(p.pos, R + 0.5, _hits).slice()) {
      if (e.dead || e.inert || Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > R + (e.radius ?? 0.5)) continue;
      stunEnemy(e, 0.4);
      if (e.boss) e.addPoise?.(6, 'standard');
      damageEnemy(game, e, dmg, { element: 'fire', raw: true, noCrit: true, knockback: 3 });
    }
  }) };
// Defensive: every 15 s the first hit that costs more than 15% of max HP is half refunded (may turn a lethal blow into a survivable one).
BOSS_RELICS.hollowHeartstone = { id: 'hollowHeartstone', name: 'Hollow Heartstone', icon: '❖', tag: 'boss',
  desc: 'Every 15s, the first hit that costs over 15% of your max HP is half refunded.', flavour: 'Still beating. Not yours, but it helps.',
  init: (game, p, st) => {
    st.cd = 0;
    const offA = game.events.on('tick', ({ dt }) => { if (st.cd > 0) st.cd -= dt; });
    const offB = game.events.on('playerHit', ({ amount }) => {
      if (st.cd > 0 || amount < p.stats.maxHp * 0.15) return;
      st.cd = 15;
      p.hp = Math.min(p.stats.maxHp, p.hp + amount * 0.5);   // playerHit fires before the death check
      game.fx.ring(p.pos, { color: 0xffd6a0, radius: 2.5, life: 0.4 });
      game.fx.text(p.pos, 'HEARTSTONE', '#ffd6a0');
    });
    return () => { offA(); offB(); };
  } };
Object.assign(RELICS, BOSS_RELICS);

export const RELIC_IDS = Object.keys(RELICS);                                  // all of them (codex)
export const BOSS_RELIC_IDS = Object.keys(BOSS_RELICS);
export const NORMAL_RELIC_IDS = RELIC_IDS.filter((id) => RELICS[id].tag !== 'boss');

// Roll a chest hand. spec (see game.queueChest): { pool: 'boss' → boss relics only, bossRelics: n guaranteed
// boss slots }. `extra` / `choices` are resolved by the caller into n. Normal pools never contain boss relics.
export function rollRelics(game, n, spec = null) {
  const owned = new Set(game.player.relics.map((r) => r.id));
  const draw = (pool, k) => {
    const out = [];
    while (out.length < k && pool.length) out.push(RELICS[pool.splice(Math.floor(Math.random() * pool.length), 1)[0]]);
    return out;
  };
  const bossPool = BOSS_RELIC_IDS.filter((id) => !owned.has(id));
  if (spec?.pool === 'boss') return draw(bossPool, n);
  const bossN = Math.min(spec?.bossRelics ?? 0, n, bossPool.length);
  const out = draw(bossPool, bossN);
  out.push(...draw(NORMAL_RELIC_IDS.filter((id) => !owned.has(id)), n - out.length));
  if (bossN > 0) for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
