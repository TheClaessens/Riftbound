# Playtest round 3 — v5.1 raid bosses (addendum to BRIEF.md and round-2/ROUND.md)

Read `design/playtest/BRIEF.md` first (harness, rules, report template), then `design/playtest/round-2/ROUND.md`
(what the obelisks and raid encounters are, the v5 driver verbs, `state.boss`, calibration). This file
**overrides** both where they differ.

Build: v5.1, commit `79b24f5` ("Riftbound v5.1: raid tuning, HUD pass"). Server: `http://localhost:8098/`
(fresh save) or `http://localhost:8098/?unlockall`.
Report path: `design/playtest/round-3/<NN>-<persona>.md` (same template as BRIEF.md, with "round 3" in the title).
Screenshots: `await PT.shot('r3-<what>')`.

## What this round is about
The **boss encounters as they play now in v5.1**: the full fight from the Seal to the payout, at every act,
plus the obelisk choice that leads into it. Round 2 found tuning and clarity problems, and v5.1 changed these:
- **Stagger:** reactions fatigue (spam fills the bar less); a burning, chilled or shocked boss builds Stagger
  on its own (so mono-element builds can reach it); Perfect Dodge and a Rift Crystal blast are worth +10.
  A Break Check now starts from your current bar instead of resetting it.
- **Fairness:** Gorrak's combo backhand has a longer lead (0.85 s); dash-through ring waves (King's Wrath,
  Aurelith's frost rings) are 3.2 s apart; intermissions last 7–9 s. Bosses can't be re-frozen for 4 s or
  stunned more than once per 1.5 s.
- **Tuning:** boss HP Gorrak 14.5k, Vashkar 24k, Aurelith 86k; Vashkar's banners shield 20% each. Haste's
  Windfall is bigger; Echo and Wrath pay more shards; Wrath heat needs stepping out and back in. Six Boss Relics.
- **Clarity:** safe zones are now solid gold with diagonal stripes and gold means only "go here"; Haste is pale cyan;
  level-up modals wait until the boss has landed; the death screen names the killing move; one-time tips
  explain Stagger, intermissions, Winded, Break Checks and King's Wrath.

You don't need to check each change one by one. Play the fights, and report what you experience.
Where something on this list is relevant to your domain, say whether it lands.

## New driver verb (round 3)
- `PT.autoCast(true)` → plays with the game's own **auto-cast** (the `T` toggle in the HUD / settings): your skills
  fire at targets the game picks, and the bot hands only move and dash. `PT.autoCast(false)` returns to the
  hands' manual aim (which always aims at the boss when there is one, else the nearest foe).
  Use `window.__game.autoCast` only to read the setting; don't change other game state.

## Calibration (unchanged from round 2 plus the v5.1 sims; bot hands, god off)
- The bot reaches Gorrak at about level 10–11, Vashkar at about 18–20. Without assist it rarely gets past Act II.
- v5.1 sims (n = 8 per lane): Gorrak killed 7/8 on the default lane, mean fight 68 s; 2/8 bots died inside the
  fight. With Wrath 3, 1/8 killed him (the bot mostly dies channelling under Rift Pull).
- **expert** hands step out of every ground telegraph (circles, cones, donuts, lines), but can't time dashes
  through ring waves and can't use Aurelith's pillars as cover. Damage from those is a bot limitation; judge
  them by whether you could *see* them coming.
- With manual aim the bot always shoots the boss. It kills pods, banners, runners and conduits only by accident
  (area spells, line of fire). If a human would switch targets, say so; that's a finding about the game.
- Deaths are weak evidence. *What* hurt you (`r.window.dmgBy` in each `PT.play` result; it is not a global), *how much HP you had going in*, *where you could
  have healed*, and whether you could see it coming are strong evidence.

## Round-3 questions per persona
* **01 Rhea — challenge seeker (expert, Sonnet, unlockAll).** Domain: boss fairness, tactics and skill expression.
  Fight all three bosses (Gorrak naturally at least twice with two classes; Vashkar/Aurelith via `PT.jump(act, { boss: true })`
  or `assist`, tagged). Per boss: is every hit telegraphed and avoidable now? Does positioning matter? Does Stagger
  now reward dodging and crystals more than reaction spam? Do Break Checks still feel great? Which mechanic is the
  best and which the most cheap/tedious? How long were the fights and was the length fun?
  Did HP attrition across the fight feel fair: where did your HP go, and was there any way to get it back?
* **02 Viktor — hardcore buildcrafter (expert, Sonnet, unlockAll).** Domain: obelisk risk/reward and builds vs the boss.
  At least 3 runs with different obelisk combos (none / Haste / Echo + Wrath 2–3) and at least one mono-element build.
  Are the trades legible and is any obelisk now a no-brainer or a never-pick? Do the payouts feel worth the risk?
  Can a mono-element build Stagger now, and does a reaction build still trivialise it? Do the 6 Boss Relics give
  real choices? Does a sustain build (regen, lifesteal-like relics, heal cards) change how the boss fights play?
* **03 Mila — cozy casual (casual, Sonnet, fresh save, primer on).** Domain: epic feel, intensity and frustration.
  Play 3 runs naturally. Does the boss arrival feel like an event now? Is the boss fight more or less exciting
  than the horde part of the act before it? Describe how the *intensity* changes when the Seal closes: what you
  pay attention to before vs during the fight, and whether you liked that change. When you died, did you
  understand why, and did you want to try again? Best and worst moment.
* **04 Noor — genre newcomer (casual, Sonnet, fresh save, primer on).** Domain: learnability of the raid layer.
  Without reading the design doc: from the cards, HUD, tips and death screen alone, can you explain Haste/Echo/Wrath,
  Stagger, Downed, Break Check, Winded and intermissions after your runs? Gold vs red zones: is "go here" vs
  "get out" obvious now? Did the death screen tell you what to do differently? What confused you most?
* **05 Ilse — comfort & readability (average, Sonnet, unlockAll).** Domain: readability of the raid fights.
  Screenshot every boss mechanic you meet (use jump). Can you always find your hero, the boss, the adds, the
  telegraphs and the safe zones? Is gold now reserved for "safe"? Do the boss frame and the tips cover the arena?
  Peak clutter (King's Wrath, Molten Tide, Floodfall). Are the adds (runners, pods, banners, conduits, the wyvern)
  easy to spot and easy to tell apart from the boss's attacks?
* **06 Dex — numbers analyst (Haiku).** Domain: boss-fight balance and HP economy.
  Use the sim harness `const { runSim } = await import('/src/dev/sim.js?v=' + Date.now())` →
  `runSim({ classId, seconds: 800, log: false, god: 0, obelisks: [] | ['haste@90'] | ['echo'] | ['wrath:3'] })`
  (n ≥ 8 per lane, at least two classes), plus 2–3 `PT` runs of your own to read `r.window.dmgBy` from each `PT.play` result.
  Per lane and act: bosses killed, deaths inside the fight, fight length vs targets (Gorrak 60–75 s,
  Vashkar 80–100 s, Aurelith 100–120 s), level at the boss, obelisk shards. **HP economy:** HP% when the Seal closes vs HP%
  at the kill or death, total damage taken per fight by move, and any healing during the fight (and its source).
  Compare with round 2's numbers in `design/playtest/round-2/REPORT.md` and `design/playtest/raid-sims-v5.1.md`.
* **07 Ola — motor accessibility (casual, Sonnet, unlockAll).** Domain: input load and auto-cast in the boss fights.
  Play with `PT.autoCast(true)` for most runs (one run without, for comparison). Fight Gorrak at least twice
  naturally and Vashkar/Aurelith via jump (tagged). Does auto-cast pick sensible targets during a boss fight:
  the boss, the adds that matter (runners racing to heal him, spore pods, banners, conduits, the wyvern), the
  crystals? Can a player who relies on auto-cast complete every mechanic (Break Checks, add priorities, intermissions)?
  What has to be held, timed or aimed? What would you need as a player who can't aim precisely?
