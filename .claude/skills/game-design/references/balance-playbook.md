# Balance Playbook: Simulation-Driven Tuning

Tuning by feel converges slowly and lies, so use a bot. This repo's harness is `src/dev/sim.js` (`runSim`, `jumpToAct`). Copy and adapt it for a new game.

## The harness
- **Fixed timestep loop** (`game.update(1/30)`), yielding to the event loop every ~300 steps so the page stays alive.
- Hooks: a `player.botMove = {x,z}` and `player.botDash` flag that the player's update reads in place of input.
- **Auto-pick policy:** fusion > rank-up toward a fusion partner > new skill with a partner > core passives. For items, take the first offered.
- **Restore the user's save** afterwards (a snapshot of meta + localStorage), so simulated runs don't hand out currency or unlocks.
- A `jumpToAct(n, {boss, god})` helper for visual tours. God mode must survive stat recalculation: put it on a field that recalc doesn't reset.

## What to log per run
`result, time, stage reached, level, kills, max chain`, plus:
- `levels: {L: second}`
- `stages: [{stage, at, level}]`
- `bosses: [{stage, ttk}]`
- `maxEnemies`
- items gained (count)
- **`dmgBy: {sourceType: total}`**
- perfect dodges
- errors (with stack)
- sim steps/sec

Run **every class** each round. One class hides outliers.

## Make the bot human-ish first
Each of these produced wrong conclusions until we fixed it:

| Bot artefact | Symptom | Fix |
|---|---|---|
| Kites away from XP | Slow early levels, then huge level spikes when a magnet or stage transition vacuumed the backlog | Steer toward nearby shards when threat is low |
| Auto-aim hits the nearest fodder | Boss TTK 400+ s | Aim (mouseGround + held buttons) at the boss while it lives |
| Flees the boss (heavy threat weight) | Out of cast range, endless boss fights | Orbit the boss at cast range: pull in if > 11 u, push out if < 7 u |
| Wanders into arena corners | Giant edge geometry in screenshots; exposed a bounds bug | Strong centre pull past r = 30, *and* fix the bounds to the visible wall shape |
| Never dodges telegraphs | Bosses look over-tuned | Accept it: treat the bot as a below-average player, and set targets accordingly (e.g. 70% reach stage 2) |

## Tuning order (each step changes 1–2 knobs, then re-runs all classes)
1. **Density.** Look at `maxEnemies`. If the horde never builds because kill power outpaces spawns, raise spawn rates before touching HP. We went from 1.1/s to 2.4/s plus ramp. We overshot to 3.0/s, which hit the 320 cap and killed bots at 2:00, then settled in between.
2. **XP curve.** Fit it to the level targets with cumulative sums. Estimate the XP available per stage as `Σ spawns × avg xp × stage xp mult` (plus combo bonus), then solve `xpForLevel(L) = a + bL + cL²` so that `Σ_{1..N-1}` hits the targets at stage ends. A single quadratic can't make the early levels fast too, so use a **piecewise** curve (a cheap linear part for L ≤ 4).
3. **Item economy.** Count items per run. If it's way over target, the drop source is too common. Fix: one "bearer" per beat plus a low random rate.
4. **Boss HP.** Use TTK with the bot aiming at the boss. Big variance between classes is normal. Tune to the median.
5. **Damage sources.** Read `dmgBy`. If one source dominates deaths (enemy bullets for us), lower that enemy's spawn weight or frequency, or add a small sustain (base regen 0.3/s, health drops 1%).
6. **Class outliers.** If one class dies early or has a tiny max chain, buff its starter's core number (we made Spark's forks scale at 75% of the bolt instead of a fixed 6).
7. **Combo bonuses.** If chains reach the hundreds, cap or halve the chain-to-XP conversion.

## Bugs the sim found that weren't balance
- An actor list mutated during iteration (a stage transition spliced actors mid-loop) → `undefined.update`. Guard the loop, and remove by identity.
- Boss chests left behind when the stage transitions → attract all items on transition.

Simulation is the cheapest integration test you have. Run it right after every agent lands.

## Write it down
Every round: append "finding → change" rows to the design log, and update the spec's numbers (spawn table, boss HP, XP formula, drop rates). The spec must always match the code.
