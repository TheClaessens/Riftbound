# Example: Riftbound (Three.js isometric horde-survival ARPG)

The reference application of this skill. The full adapter is `playtest/adapter.js` in the Riftbound repo (~330 lines). Its round-1 outputs are in `design/playtest/round-1/` (seven persona reports plus REPORT.md).

## Game shape
- **Run:** 3 acts × ~3.5 min, with a boss per act.
- **Choices:** level-up card drafts (3 cards, with reroll/banish) and relic chests.
- **Combat:** elemental reactions, fusions, dash with a "perfect dodge".
- **Meta:** Rift Shards → attunements (stat ranks), class unlocks, codex, difficulty tiers 0–5.
- **Engine:** `window.__game`, which exposes `update(dt)`, `state` (`playing / levelup / relic / shift / paused / dead / victory / title`), an event bus and `engine.render()`.

## Adapter mapping (condensed)

```js
const PT = createPlaytest({
  dt: 1 / 30,
  ready: () => !!window.__game,
  storageKeys: ['riftbound.meta.v1'],
  hands,                                              // createTopdownHands({...}), below
  install(ctx) {
    // choices: wrap the modal openers, still show them
    ui.showLevelUp = (cards, onPick, ctl) => { ctx.offer({ kind: 'levelup', info: { rerolls: ctl.rerolls },
      options: cards.map(cardView), pick: (i) => onPick(cards[i]), cards, onPick, ctl }); lu(cards, onPick, ctl); };
    ui.showRelicPick = (relics, onPick) => { ctx.offer({ kind: 'relic', options: relics.map(relicView), pick: (i) => onPick(relics[i]) }); rp(relics, onPick); };
    // telegraphs → hands
    fx.telegraph = (pos, r, dur, o = {}) => { const h = circle(pos, r, dur, o); if (!o.friendly) hands.zone({ kind: 'circle', x: pos.x, z: pos.z, r, life: dur, done: () => h.done }); return h; };
    // events → digest (player-facing source names)
    on('playerHit', ({ amount, source }) => { ctx.tally('dmgTaken', amount); ctx.tally('dmgBy', amount, srcName(source)); });
    on('bossSpawned', ({ enemy }) => ctx.event(`boss appears: ${enemy.name}`));   // + ~18 more events
  },
  onInit({ unlockAll }) { /* reload meta from the sandboxed key, pin 1280×720, re-render title */ },
  start({ classId, tier, tutorial, assist }) { /* g.start(...), optional damage assist */ },
  step: (dt) => g.update(dt),
  status: () => ({ dead: 'lost', victory: 'won', title: 'menu', paused: 'paused' })[g.state] ?? 'playing',
  stops: { boss: () => { const had = !!g.boss; return () => !had && !!g.boss; }, act: /* act index changed */ },
  actions: { buy, reroll, banish, jump },             // jump(act, { boss }) grants levels to the design target
  autoDecide, batchPlan, batchTrack, batchRow,        // the balance bot's draft policy + row shape
});
```

Hands config: `threats` = `queryEnemies(player, 9)` (weight 6 for bosses); `projectiles` = hostile actors with `dir` and `speed`; `goals` = shrine, chest/items, nearest XP shard; `target` = the tutorial crystal, else the boss, else the nearest foe; `keepAt` = the boss at 7–11 u; `arena` radius 30. `apply` writes `player.botMove`, `input.mouseGround`, `input.mouseButtons` and `player.botDash`.

## Calibration (before round 1)
- Sim speed: ~100× real time in Act I; ~5× late with 300 enemies.
- Every hands level died in Act I–II with Pyromancer, Stormcaller and Arcanist, mostly to melee bruisers and projectiles. The tanky Cryomancer reached Act III and usually won.
- Expert vs average made no clear difference (n = 5 per cell).

## Round 1 in numbers
- **Panel:** 7 personas, 5 on Sonnet and 2 on Haiku. ~45 hand-drafted runs + 40 batch runs, ~155 screenshots, ~1.7 M subagent tokens, 8–21 min each in parallel.
- **Scores:** mean fun 6.5/10. The casual persona scored 8, the analyst 5.
- **Verified top findings:**
  1. A final-boss "stall" was a **real bug**: Prism-Shaman barriers worth 30% of max HP applied to bosses. A probe hit dealt 0; with the barrier off, TTK was ≈ 100 s.
  2. A combo counter that never resets in dense hordes, feeding an uncapped reward term: a **design flaw**.
  3. The hero is lost inside the player's own VFX at peak density (4/7 personas).
  4. One class won 7/7 batch runs, the others 0/30.
- **Harness artefacts caught:** a "+0 shards" end screen (count-up on a frozen rAF), a locked class preselected after the save swap, and a stale title after a purchase.
- **Most valuable report sections:**
  - the damage-by-source breakdowns;
  - screenshots of the hero-in-VFX problem;
  - the hardcore persona's draft tally (48% meaningful / 28% no-brainer / 6% all-weak);
  - the newcomer's "explain it, then check the doc" self-test, which exposed a death-screen tip that taught the wrong rule.
