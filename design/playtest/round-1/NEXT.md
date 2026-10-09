# Round 1 "Next" batch: contracts and ownership

This file is the contract for the parallel work on the "Next" backlog in `REPORT.md` §7 (issues #3, #4, #5, #6, #9, #12). Read `REPORT.md` §4 for the evidence behind each item.

## Ownership (exclusive: edit nothing outside your files)

| Work | Owner | Files |
|---|---|---|
| Shared plumbing (done before launch): damage-source names, run damage log, per-hit cap, Frost Armor, XP curve | orchestrator | `src/game/player.js`, `src/game/game.js` (except `_openLevelUp`), `src/game/enemies.js`, `src/game/bosses.js`, `src/game/world.js` |
| Balance: Cryomancer audit, Arcanist status source, unlock order, War Boar stagger | orchestrator | `src/game/classes.js`, `src/game/skills/arcaneBolt.js`, `src/game/meta.js`, `src/game/relics.js` |
| **A. Hero readability** (#3) | agent A | `src/core/engine.js`, `src/game/heroes/**`, `src/game/vfx/**`, `src/game/fx.js`, new files under `src/game/vfx/` |
| **B. Death recap** (#6) | agent B | `src/ui/menus.js` (end screen only), `css/menus.css`, the end-screen fixture in `src/dev/uishots.js` |
| **C. Draft + multi-pick level-ups** (#9, #12) | agent C | `src/game/progression.js`, `PASSIVES` in `src/game/skills/registry.js`, `Game._openLevelUp` in `src/game/game.js`, the level-up modal in `src/ui/ui.js`, `css/modals.css` |

If you need a change in someone else's file, write it under "Requests" in your final report instead of making it.

## Damage data (for B; already live)

- `player.takeDamage(amount, source, how?)` emits `playerHit { amount, source, how, name }`.
  - `name` is player-facing, from `hitSourceName(source)` in `player.js`.
  - Enemies give their roster name ("War Boar", "Goblin Shaman").
  - Bosses give the short name ("Vashkar").
  - Projectiles give their shooter's name.
  - Hazards: "Fissure Geyser", "Lightning Strike".
- `how` is one of: `'charge'`, `'explosion'`, `'projectile'`, `'slam'`, `'flame ring'`, `'lava trail'`, `'beam'`, or `null` (contact or a plain attack).
- `game.stats.hurt` (reset each run, passed to `ui.showGameOver(stats)` as `stats.hurt`):
  - `by: { [name]: { dmg, hits, hows: { [how]: dmg } } }`: the whole run.
  - `recent: [{ name, how, dmg, t, hp }]`: the last 8 hits, oldest first. `t` is the run clock in seconds; `hp` is HP after the hit.
  - `killer: { name, how, dmg } | null`: the killing blow.
- Enemy roster and facts for contextual tips:
  - `ENEMY_TYPES` in `src/game/enemies.js` gives names, archetypes and fire resistance (Act II orcs resist fire 50%).
  - `ACTS` in `src/game/acts.js` holds the boss names.

## A. Hero readability (#3), Opus, visual

**Problem.** At peak density the hero vanishes inside their own spell VFX (steam clouds, fireballs, thunderclouds, glyphs, singularity piles, meteors). The low-HP state then desaturates the whole frame to 40%, which hides everything exactly when the player most needs to see.

Evidence screenshots in `dev/shots/`:
- `pt-ilse-a3-peak.png`, `pt-ilse-a3-arc-flash.png`, `pt-ilse-a3-arc-hitstop.png`, `pt-ilse-a3-storm-lowhp.png`, `pt-ilse-a1-swarm.png`, `pt-ilse-a2-lowhp.png`
- `pt-mila-act2-chaos.png`
- `pt-rhea-vash-low3.png`

Ilse found the hero within a second only when few effects overlapped.

**Goals, in priority order:**
1. **The hero is always findable within half a second**, at any density, for every class:
   - A post-bloom hero silhouette/outline that stays visible when the hero is occluded or washed out by bright additive VFX. For example, a screen-space mask of the hero rendered after bloom and composited as a thin, high-contrast rim and a faint fill, but only where the hero is covered.
   - A brighter, crisper under-foot ring.
   - It must not look like a debug overlay at rest: in a calm frame the hero should look the same as today.
2. **Own VFX yield near the hero.** The player's own clouds, bursts, glyphs and decals fade (≈ 50–70% alpha reduction) within ~3 u of the hero's screen position. Painted particles already have `uHeroView`; extend that idea consistently.
3. **Low HP as an edge pulse, not a wash.**
   - Keep the red edge pulse.
   - Drop the full-frame desaturation (the `uLowHp` saturation pull in `engine.js`), or limit it to the outer edge.
   - The hero should read *more*, not less, at low HP. For example, the outline pulses red.
4. Hostile projectiles and red telegraphs must stay readable: never fade or hide them.

**Constraints:**
- Read `design/VFX.md`, `design/HEROES.md` and `.claude/skills/orchestrated-game-dev/references/web-3d-lessons.md` first.
- Budget: at most +0.5 ms GPU at the stress case and one extra render target at most. Measure it.
- No gameplay changes.

**Verification (mandatory):**
- Use `src/dev/shot.js` with the `riftbound-shots` server (port 8097, writes `dev/shots/`). Create your own browser tab once and always pass its tabId.
- Recreate the worst cases:
  - Cryomancer in steam clouds, Act III peak;
  - Arcanist in a Meteor / Singularity / glyph pile;
  - Stormcaller at low HP by the pond;
  - Pyromancer on the dirt road under Fireball + Chain Lightning.
- Plus a calm frame per class.
- Save before/after pairs as `dev/shots/next-read-<case>-{before,after}.png`.
- Check the console for errors.

## B. Death recap (#6), Sonnet

**Problem.** Players can't answer "why did I die?". The death screen names no killer.

**Build, on the death end screen** (not on victory):
1. A headline line:
   - "Slain by **War Boar** · charge · 41";
   - for hazards, "Caught by **Fissure Geyser**";
   - if `killer` is null, fall back to the top source.
2. **Top 3 damage sources this run:** name, a share bar, % of damage taken, and the main `how` if one dominates.
3. **The last moments:** the last 3–5 hits from `recent`, as a compact row of chips with the damage and the hp-after mini-bar. Players should see "three hits in 1.2 s".
4. **One contextual tip.** Pick the most relevant from a small table keyed by killer name / how / act. Examples:
   - War Boar charge: "War Boars mark their charge with a red line. Dash across it, not along it."
   - Projectiles: "Shaman bolts are slow. Strafe sideways."
   - Fissure Geyser: "Red rings with glowing cracks erupt a second later. Step out."
   - Orcs while playing fire: "Act II orcs resist Fire 50%. Lean on reactions."
   - Bosses: one line each.
   - A generic fallback.
   - Keep it to 8–14 entries.

**Style.** Match the existing Crownforge end screen: `css/menus.css`, the `mn-*` classes and the `cf-*` primitives from `css/theme.css`, `icon()` from `src/ui/icons`. No emoji. It must fit at 1280×720 and 800×600 without scrolling the main column. The existing ledger, reactions, fusions and relics stay.

**Verification:**
- Use the uishots harness (`src/dev/uishots.js`). Add `hurt` data to its end-screen fixture so the recap renders there.
- Then do a real death in-game: port 8094 (launch config `riftbound-alt`) with `?unlockall`, `window.__game`. Start a run and let enemies hit you, or call `__game.player.takeDamage(...)`.
- Read the screenshots back. Use your own tab with an explicit tabId. Check the console.

## C. Draft quality + multi-pick level-ups (#9, #12), Sonnet

**Problems:**
- About 6% of hands are all-weak.
- The Cryomancer sees no frost card until L4.
- Meteor first shows up at L11.
- Magnetism, Swiftness, Amplify and Precision are filler.
- Boss kills and Rift Shifts grant 3–5 level-ups in one second, which means 3–5 modals in a row.

**Build:**
1. **Pity.** Every hand contains at least one card that advances the build, when such a card exists. That means a rank-up of an owned skill, a new skill that is the missing parent of a fusion whose other parent you own, or a fusion. Never a hand of only passives/heal while those exist.
2. **Starter-element guarantee.** If by L3 the player has not been offered a non-starter skill of their class element, the L3 or L4 hand includes one (Cryomancer: Frost Nova or Blizzard, and so on). Use the class element from `CLASSES` in `src/game/classes.js`.
3. **Fusion-parent bias.** New-skill cards that complete a recipe whose other parent is owned get ~2× weight.
4. **Banish narrows the pool.** Check that a banished id never returns this run (`run.banished`), including as a rank-up or a fusion parent hint. Fix it if not.
5. **Rework the dead passives** (`PASSIVES` in `registry.js`): Magnetism, Swiftness, Amplify, Precision.
   - Each should be a real choice with a clear identity (for example, Swiftness also speeds dash recharge; Magnetism also pulls XP on kill).
   - Keep the numbers modest, and keep `desc(rank)` text short and in the existing style.
   - Only use stats that `BASE_STATS` / `player.recalcStats` already support, or that you can add inside `PASSIVES.apply` without touching other files. Otherwise list a Request.
6. **Multi-pick level-ups.**
   - When `pendingLevelUps > 1`, the modal stays open after a pick and deals the next hand in place, with a "1 of 3" counter in the header. No close/reopen flicker.
   - Reroll and banish work per hand.
   - **Adapter contract (do not break):** `ui.showLevelUp(cards, onPick, ctl, extra)` must still be called once per hand. The playtest adapter wraps it to offer decisions, so pass `{ index, total }` as the 4th argument and let the UI swap content when the modal is already open.

**Verification:**
- Port 8094 (`riftbound-alt`) with `?unlockall`, in your own tab with an explicit tabId.
- Print 200 rolled hands per class at L2–L12: count all-weak hands before and after, and when the first class-element card appears.
- Screenshot the multi-pick modal at index 1 and 2 of 3, and read the shots.
- Run `PT` (see `design/playtest/BRIEF.md`; `import('/playtest/adapter.js')` on port 8098, launch config `riftbound-playtest`) for one short run to check that decisions still fire once per hand.
- Check the console.
