// =====================================================================================
//  RELICS — build-bending passives from Relic Chests (elites, bosses).
//  def: { id, name, icon, tag, desc, flavour,
//         apply?(stats)            → stat modifiers (re-applied on every recalc)
//         init?(game, player, st)  → event-driven effects; return a cleanup function }
// =====================================================================================
import { damageEnemy, applyStatus } from './combat.js';

export const RELIC_TAG_COLOR = {
  reaction: '#e0c4ff', fire: '#ff7a33', frost: '#7fe0ff', storm: '#ffe45c',
  risk: '#ff4d5e', dodge: '#9dffb0', economy: '#ffd34d', cast: '#c08cff', safety: '#ffffff',
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
    apply: (s) => { s.reactionXp = 2; } },
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

export const RELIC_IDS = Object.keys(RELICS);

export function rollRelics(game, n) {
  const owned = new Set(game.player.relics.map((r) => r.id));
  const pool = RELIC_IDS.filter((id) => !owned.has(id));
  const out = [];
  while (out.length < n && pool.length) out.push(RELICS[pool.splice(Math.floor(Math.random() * pool.length), 1)[0]]);
  return out;
}
