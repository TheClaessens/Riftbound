# 13 - Risk/Reward Boss Summoning: Obelisks

Status: research + proposal. Nothing in `src/` or `DESIGN.md` was changed. Numbers marked "approx" come from my own back-of-envelope integration of DESIGN §3/§13 and must be calibrated with the sim harness.

Code touched by this proposal (read, not edited): `src/game/spawner.js` (boss fires at `t >= ACT_LENGTH`, `_spawnBoss`, `BUSY_BOSS_MULT`), `src/game/world.js` (shrine section: `_spawnShrine`, `_updateShrine`, `_claimShrine`, `SHRINE_CLAIM_R/TIME`, `setClearing(slot,...)`), `src/game/acts.js` (`ACT_LENGTH`, `BOSS_HP`), `src/game/game.js` (`_onBossKilled`, `_beginShift`, which already dissolves enemies into XP and clears projectiles).

---

## 1. TL;DR

* Keep the 3:00 summon as the **default path** ("the Rift calls"). It anchors every balance target (L10/L18/L26, TTK bands, shards). Obelisks are *opt-in modifiers on top of it*; doing nothing is always valid and is exactly today's game minus the horde during the boss.
* Each act, **three obelisks rise at 0:50**: **Haste** (summon now), **Echo** (the boss returns), **Wrath** (stackable boss affixes, 3 sigils). You can activate any subset, in any order, except that Haste ends the commit window (it summons). Each is a 4-5 s channel in a ring while the horde keeps coming, which is itself the first cost.
* **Costs attach to the encounter, not to the clock**, so "activate at 2:59" is not a loophole. **Every cost and payout is shown on the pillar's tooltip before you commit**, including a computed "you will skip about N levels".
* Rewards are mostly **build-defining** (boss relics, a free skill rank, a free fusion catalyst, a 4th/5th relic choice) plus a **capped** shard bonus. Haste gets a partial **Windfall** XP lump (30% of the XP skipped) so it is a gamble with a floor, not a death sentence.
* The boss fight becomes an **isolated raid encounter**: Rift Seal at summon, the live horde dissolves into XP (reuse the Rift Shift dissolve), spawner off, level-ups are drafted before the boss wakes, boss adds give 0 XP.
* Ship v1 = Haste + Echo + Wrath (3 types). Cut Tithe, Siege, Overtime/Delay, arena shrinking, and per-boss custom affixes until the sim says the core works.

---

## 2. Research: what comparable games teach

Source reliability: wiki/guide pages, quoted loosely. I flag anything I could not confirm.

| Game | System | Lesson for Riftbound |
|---|---|---|
| **Risk of Rain 2** | Teleporter boss spawns the moment you activate it; the boss must die before charge completes. Difficulty coefficient is time-based: `coeff = (playerFactor + minutes x timeFactor) x 1.15^stages`, about +0.10/min solo Rainstorm ([wiki: Difficulty](https://riskofrain2.wiki.gg/wiki/Difficulty)). Shrine of the Mountain: each activation gives the boss director +100% credits (more bosses, elite bosses, tougher bosses) and the teleporter drops `players x (1 + shrines)` items, with a chance per extra item to become a boss item. The shrine becomes unavailable once the teleporter starts charging ([wiki: Shrine of the Mountain](https://riskofrain2.wiki.gg/wiki/Shrine_of_the_Mountain)). The 90 s charge figure comes from a non-official guide, unconfirmed. | (1) The *same* pressure is both ambient (time) and opt-in (shrines); waiting has a cost, opting in has a payout. (2) The reward is **more of the thing the boss already drops**, so the modifier is legible. (3) A **closing commit window** stops last-second exploits. We copy 1 and 3, and we change the reward to be partly qualitative. |
| **Hades** | Pact of Punishment: Heat is a self-chosen difficulty dial, rewards tied to Heat levels (bounties are per weapon + Heat) ([rpgsite](https://www.rpgsite.net/feature/10287-hades-pact-of-punishment-heat-modifiers-and-how-to-maximize-your-rewards)). Infernal Gates of Erebus: a no-damage clear room with a Heat requirement per region (5/10/15); you can reroll the reward before entering ([Prima](https://primagames.com/gaming/hades-guide-infernal-gates-erebus)). Chaos gates: I found no reliable source, so I only rely on the well-known shape (a visible cost now, reward later) and do not cite specifics. | Heat works because each modifier is **named, discrete, and preview-able**, and the payout scales with total Heat rather than with which option you took. Gates work because the *test* is a skill expression (no damage), not just a stat tax. |
| **Slay the Spire** | One elite per act is flagged burning (flame icon) once the Emerald Key is missing; it gets one of 4 buffs (Strength, +25% max HP, Metallicize, Regenerate) and drops the key ([Elite](https://slaythespire.wiki.gg/wiki/Elite), [Keys](https://slaythespire.wiki.gg/wiki/Keys)). | The offer is **marked on the map before you route to it**; the reward is a **strategic goal** (access to a bonus act), not a number. One per act = bounded. |
| **Diablo 3** | Nephalem/Greater Rifts: the Guardian spawns when the progress bar hits 100%, with a 15 min limit on Greater Rifts; elites drop progress orbs; pylons appear at roughly 25-33% intervals as optional power ([Warcraft Tavern](https://www.warcrafttavern.com/d3/greater-rifts/), [Icy Veins](https://www.icy-veins.com/d3/how-to-run-greater-rifts-efficiently-guide), [Nephalem Rift wiki](https://diablo.fandom.com/wiki/Nephalem_Rift)). | The *player controls the pace of the boss's arrival* (kill faster -> boss sooner). The known failure mode is **skip-diving** (players avoid trash and only chase progress sources), so reward efficiency without letting it become the only correct play. |
| **Path of Exile** | Ritual: altars inside a ring, you defeat the enemies and bank Tribute, spend it on rewards; successive rituals in an area are harder and better; some rewards are hidden until more are completed ([PoE wiki: Ritual league](https://pathofexile.fandom.com/wiki/Ritual_league), [Mobalytics](https://mobalytics.gg/poe-2/guides/ritual)). PoE2 lets you defer a favour by paying part of its cost now ([playnews summary](https://www.playnews.gg/en/guides/path-of-exile-2-forbidden-rites-campaign-rituals-2-clusters-of-effigies-per-act-1-per-interlude-and-tribute-to-spend)). I did not find reliable Atlas/sextant detail, so none is claimed. | **Hidden rewards read as unfair**; keep ours fully visible. Escalation *within* a bounded area (our 3 Wrath sigils) is a proven shape. |
| **Last Epoch** | Monolith echoes show their reward before you start; Corruption raises monster scaling and reward quality, uncapped only on Empowered timelines ([Maxroll: advanced strategies](https://maxroll.gg/last-epoch/monolith/advanced-strategies), [Maxroll: endgame](https://maxroll.gg/last-epoch/getting-started/endgame-overview)). Boss gives a themed Blessing. | **Reward preview before commit**; **cap the open-ended dial** (we cap Wrath at 3). Themed rewards per boss (our boss relics) feel authored. |
| **Dead Cells** | Cursed chest: scroll + gem + gear one level higher, but while cursed almost any damage kills until you clear the counter; Boss Stem Cells (pre-run) raise enemy tier/density/variety and limit healing in exchange for cells, forge level, blueprints and bonus doors; Perfect Doors and timed doors give the **same reward** for two different skills ([Curse](https://deadcells.wiki.gg/wiki/Curse), [BSC](https://deadcells.wiki.gg/wiki/BSC), [Objects](https://deadcells.wiki.gg/wiki/Objects)). | The curse is a **tempo/skill test**, not a stat tax. Rewards can be **access** (doors, blueprints), not just power. Same reward through two risk shapes is a good pattern (our Haste = time skill, Wrath = execution skill). |
| **Vampire Survivors / Brotato** | VS Curse raises enemy speed, HP, spawn frequency, stacks additively with no upper limit, and pays through more kills and XP ([VS wiki](https://vampire.survivors.wiki/w/Curse)). Brotato Danger: +12/26/40% enemy damage and HP at Danger 3/4/5, elite and horde waves from Danger 2, elites drop a guaranteed legendary crate, on-screen cap of 100 enemies with overflow kills dropping nothing ([guide](https://gameplay.tips/guides/brotato-danger-5-guide.html)). | The best risk dials **generate their own reward** (more enemies = more XP) and have a **natural cap** (screen cap). Halls of Torment: I only found a developer brainstorm about artifacts raising Torment and later nerfs to its HP/defense scaling ([Steam thread](https://steamcommunity.com/app/2218750/discussions/0/4344355079687703902)), so treat it as weak evidence that stat-only dials get complained about. |
| **Deep Rock Galactic** | Hazard Level is chosen before the mission and feeds a Hazard Bonus; Warnings add a stated bonus (+15%, +40%) while Anomalies do not ([Hazard Level](https://deeprockgalactic.wiki.gg/wiki/Hazard_Level), [Warnings](https://deeprockgalactic.wiki.gg/wiki/Warning)). | The **bonus is printed next to the modifier**. Modifiers that change play (Warnings) pay; flavour-only ones (Anomalies) do not. |
| **Hollow Knight (Godhome)** | Pantheons are boss rushes; Bindings each remove one part of the kit; separate marks per difficulty tier ([guide](https://rogueranker.com/hollow-knight-pantheon/)). | Risk that **changes how you play** beats risk that inflates HP. Our affixes follow this. |
| **Lost Ark** | Chaos Dungeon: fill an orb to 100% by killing; reward gated by a daily Aura of Resonance resource ([WePC](https://www.wepc.com/gaming/lost-ark/lost-ark-chaos-dungeon-guide-locations-and-rewards/)). | Weak relevance. One lesson: a **daily/finite resource** gating reward is the MMO answer to dominance; we use a per-act cap instead. |

---

## 3. Principles

### 3.1 Make risk legible before commitment
1. **Preview everything on the pillar**: effect, cost, payout, and the *actual rolled affixes* (Wrath) so nothing is learned by dying (Last Epoch, DRG; PoE's hidden rewards are the counter-example).
2. **Compute the stakes for the player**: "Skips about 62% of Act XP (about -3 levels, Windfall gives back 1). Forfeits the Elite Surge chest." The game knows `actTime` and the XP curve; do the math for them.
3. **Cancel is free until the channel completes.** The channel IS the confirmation (progress decays at 0.2/s outside the ring, like shrines). No modal dialogs.
4. **Fix the cost to the encounter** (until the boss encounter ends), not to a timer, so late activation does not dodge it (the RoR2 lesson inverted: they close the window; we both close it AND attach cost to the fight).
5. **One glance language**: colour + silhouette + an icon from the SVG sprite (no emoji), so it works for colour-blind players.

### 3.2 Rewards that are build-defining, not just numbers
* Numbers are fine for the meta layer (shards). Run-layer payouts should be **new decisions**: more relic choices (4/5 cards), a **Boss Relic** (rare, themed), a **free skill rank**, a **free fusion catalyst**. These are what a player talks about after a run.
* Pay in **choice width first** (4th/5th card, RoR2's "more items" shape but as a pick): it respects the build and never forces a bad item.
* Keep shard payouts **capped** (Section 3.7) so the meta layer cannot be hijacked by one risk lane.

### 3.3 Avoid a dominant strategy
Threats and counters:

| Threat | Counter |
|---|---|
| "Always take everything" (reward is free) | Every obelisk has a cost that matters **in the boss fight**, which is where runs end. Channels also cost horde time/HP. Sim target: all-in win rate at least 15 pts below baseline at equal skill. |
| "Always Haste at the earliest moment" (shard farm) | Boss HP is fixed, so early Haste means under-levelled vs a fixed boss (see Section 4.3 table). Haste's shard bounty is capped by `seconds skipped`, and dying forfeits all of it. |
| "Always Haste at 2:55" | It is simply the default path (no bonus below ~10 s skipped). Bounty is proportional to seconds skipped. |
| "Stack Echo + Wrath H3 at +Haste = best" | That is the intended *all-in* lane; it should have the highest payout **and** the highest death rate. Cap shard payout to 60% of baseline run shards. |
| "One reward is strictly better" | Rewards are different axes: Haste = time + shards, Echo = boss relics (endurance), Wrath = quality/ranks (execution). Review per-class win rates (a Cryomancer dislikes "Unyielding"; see 5.4). |
| Skip-dive (Diablo) | Haste pays *proportional to time*, not a flat bonus; the boss is tuned independently of how fast you got there. |

### 3.4 Time pressure vs opt-in pressure
* **Time pressure** already exists: enemy HP `(1 + 0.35m + 0.06m^2)`, spawn rate and XP all ramp (DESIGN §3). That is RoR2's ambient clock, and it is enough.
* **Opt-in pressure** = obelisks. They should *spend the same currency the clock does* (time and HP), or the player will not feel the trade. Haste trades XP for time; Wrath/Echo trade HP safety for choice width.
* The two should not double up on the same decision: do not add a second ambient clock (e.g. Overtime) in v1.

### 3.5 Keep the "normal" path valid
* The default 3:00 summon gives the **standard boss chest (pick 1 of 3)** and standard shards, exactly as today. All balance targets (L10/L18/L26; TTK 30-45 / 45-60 / 60-90 s) are defined for this path.
* Obelisks never gate required content. Never gate a class unlock or a meta bar on obelisk use.
* The only change on the normal path: the boss fight is now isolated (see 5.0). Sim must verify TTK targets still hold without the 35% horde (it should get *slightly easier*; consider +0-5% boss damage to compensate).

### 3.6 Should the fixed timer still exist? Soft cap vs forced summon
Recommendation: **keep a hard summon at `ACT_LENGTH = 180`**.
* It preserves every balance anchor and the 10-11 min run length.
* A "delay" lane (stay longer for more XP) is plausible: **Overtime** = from 3:00 spawn rate rises +25% per 15 s, elite chance x2, forced summon at 4:00 (`ACT_HARD = 240`). I recommend **not** shipping it in v1: it removes the anchor, creates a farming-turtle incentive, and fights the "run length" pillar. If playtests show players complain "I'm not ready", add Overtime as an *opt-in obelisk* (Section 3.7 "Respite") instead of ambient.
* If the timer is ever made soft, the HUD timeline must show the forced time as a red marker and the Boss marker must move on Haste (see 6).

### 3.7 Currency guard
Cap `obeliskShards <= 0.6 x baseRunShards`, where `base = floor(kills/30) + 15*acts + 40*bosses + chainTerm` (DESIGN §12). Obelisk shards are added **before** the tier multiplier `x(1 + 0.25*tier)`.

---

## 4. Proposed system: the Rift Obelisks

### 4.0 Boss encounter format (prerequisite)
When a summon happens (default timer or Haste):
1. **Rift Seal (1.5 s)**: a violet ring rises at the arena rim, hostile projectiles cleared, spawner stopped (`BUSY_BOSS_MULT` -> 0), unarmed obelisks collapse.
2. **Reap**: all live enemies dissolve and fly XP to the player (reuse the `_beginShift` dissolve code path). This is a free partial level-up lump (approx 150-300 XP in Act I at 3:00, 1,500+ XP late).
3. **Level-up hands** drafted now (existing "N of M" modal), before the boss wakes. The player sees the Stakes card (6.4), picks skills knowing the affixes.
4. Boss intro (existing announce). Adds only from the boss's own cycle (Gorrak/Aurelith summons) and give **0 XP** to avoid mid-fight levelling.
5. **Soft enrage** (so isolation cannot be turtled): +4% boss damage per 10 s after 120 s of the encounter (Act I), after 150 s (II), 180 s (III). Not shown unless active.

### 4.1 Appearance, placement, activation
* **Reveal at 0:50 of each act** (after the first shrine at 0:35, before Elite Surge at 1:30). Event `obelisksRisen`. In the Rift Primer run the clock is held, so the reveal simply waits; Act I tip explains.
* **Three obelisks per act**, always the same three types (learnable, legible): Haste, Echo, Wrath.
* **Placement**: 20-34 u from the player at reveal time, at least 100 degrees apart in bearing, at least 12 u from each other, not on props, inside r 48 (arena r 55). Each uses a clearing slot like the shrine (`setClearing(slot, x, z, r + 0.9, 1)`; slots 1-3). Far placement is part of the cost: reaching one means crossing the horde.
* **Channel**: stand within **r 3.0** for **5.0 s** (shrines: r 2.2 / 2.5 s). Progress decays at 0.2/s outside (shrine uses 0.15). Movement inside the ring is allowed.
* **Rift Pull** (the risk of channelling): while any channel is running, horde spawns use the obelisk as `randomSpawnPoint` origin (14-20 u ring around it) and cluster size x1.5. No new enemy type. Cost: enemies arrive on top of you, no loopholes for kiting the pull.
* **Commit window**: once the boss spawns, all obelisks collapse (RoR2's "unavailable once charging"). If you are mid-channel at 3:00, the channel is cancelled with a "the Heart stirs" cue.
* **Shrine overlap**: a Shrine buff active when the boss arrives continues. If both a shrine and obelisk are within 10 u, nudge the shrine (the shrine spawner already picks randomly).

### 4.2 The three obelisks (v1) and two cut candidates

#### A. Obelisk of Haste ("Summon now")
* **Look**: tall obsidian spire, 7 u, a single floating hourglass crystal; gold-white sand motes falling UP; icon: chevrons.
* **Effect**: 3 s warning ("THE HEART STIRS"), then Rift Seal + boss spawn immediately. Everything already armed (Echo/Wrath) applies.
* **Cost**
  * Skip the rest of the horde: the XP you would have earned (approx; table below).
  * Forfeit the beats still ahead: Elite Surge (Relic Bearer chest) before 1:30, Swarm before 2:15.
  * The boss HP is fixed, so you fight a fixed target with fewer levels.
* **Pay**
  * **Windfall XP** = `0.30 x XPbudget[act] x (1 - F(t))` where `XPbudget = [1100, 4000, 7100]` (act XP at the target boss) and `F(t)` = fraction of the act's XP collected by `t` (approx: 0.23 @1:00, 0.38 @1:30, 0.56 @2:00, 0.77 @2:30). Granted at Reap as normal XP, so level-up hands follow.
  * **Haste Bounty** shards = `round(0.25 x secondsSkipped x actMult)`, `actMult = [1, 1.5, 2]`.
  * **Quick Chest**: the boss chest offers **4** relics instead of 3 (5 with Hoarder's Lantern).
* **Numbers (approx, from the XP curve in DESIGN §13; level thresholds: L7 380, L8 578, L10 1118, L13 2291, L15 3298, L18 5141, L21 7409, L23 9172, L26 12215 cumulative XP):**

| Summon at | Skipped | Act I level (target L10) | Act II (target L18) | Act III (target L26) | Shards I / II / III |
|---|---|---|---|---|---|
| 1:00 (earliest practical) | 120 s | L6 -> L7 with Windfall | L12 -> L14 | L20 -> L22 | 30 / 45 / 60 |
| 1:30 | 90 s | L7 -> L8 | L13 -> L15 | L21 -> L23 | 22 / 34 / 45 |
| 2:00 | 60 s | L8 -> L8 | L15 -> L16 | L23 -> L24 | 15 / 22 / 30 |
| 2:30 | 30 s | L9 | L16-17 | L24-25 | 8 / 11 / 15 |

  Net deficit is about **-2 to -4 levels**. Expect boss TTK about 1.2-1.4x target at 1:30. Acceptance for the sim: Haste@2:00 TTK at most 1.3x target and death rate at most +10 pts vs baseline; Haste@1:00 clearly loses (+35 pts or more). If Haste@1:00 is a good deal, lower Windfall to 20%.
* **Why it is not dominant**: payout is proportional to what you skip; the fight difficulty is not.

#### B. Obelisk of Echo ("The boss returns")
* **Look**: two paired shards of violet-teal obsidian offset like a ghost image; a second faint copy of the pillar flickers 1 u beside it; icon: two nested chevrons.
* **Effect**: when the boss dies, an **Echo** rises from its corpse in the same arena after a 3 s Rift Mend.
  * Echo HP = **60% / 55% / 50%** of base (Gorrak 4,800 / Vashkar 11,000 / Aurelith 30,000), x tier mult.
  * Same moveset and phases, **plus one random affix** (rolled and shown on the obelisk) and the cycle is 10% faster.
  * Rift Mend: hostile projectiles cleared, dash charges restored, **heal 20% max HP**, no other healing from the pause.
* **Cost**
  * **Strain**: you take **+10% damage** from the boss and echo until the encounter ends (applied at arming, so late activation does not dodge it).
  * Fight is longer: +18-27 s (Act I), +27-36 s (II), +30-45 s (III), at current TTK targets. More time to make a lethal mistake.
* **Pay**
  * **Echo Chest** (a second chest, on top of the boss chest): pick 1 of 3 **Boss Relics** (Section 4.5), not generic ones.
  * **Echo shards**: +15 / +22 / +30.
* **Why**: it is the endurance test; it spends *time and mistakes* instead of XP. It doubles the best part of the run (boss relics) without changing the horde at all.

#### C. Obelisk of Wrath ("Heat"; 3 sigils)
* **Look**: jagged black crown of three notches, ember cracks, one glowing **sigil pip per activation** that lights red-orange (0..3); icon: flame with 1-3 ticks.
* **Effect**: each completed channel adds **1 Heat** (max 3). Each Heat adds **one boss affix** (Section 5) and increases boss stats: Heat 1: +0%; Heat 2: boss HP +15%; Heat 3: boss HP +30%, damage +10%. **The next affix is pre-rolled and shown on the pillar face** before you channel (re-rolls are not allowed).
* **Cost**: the affix, plus the channel time on a pillar (Rift Pull applies each time). Channelling three times is about 15 s inside a ring in a swarm.
* **Pay (cumulative)**

| Heat | Chest | Shards (x actMult) | Extra |
|---|---|---|---|
| 1 | 4 relic choices | 5 | |
| 2 | 4 relic choices | 12 | **Wrath Cache**: pick any owned skill below max rank and +1 rank (or a fusion whose parents you own at any rank is formed at rank 1: **Fusion Catalyst**) |
| 3 | 5 relic choices; one slot is guaranteed a **Boss Relic** | 30 | the Wrath Cache and the catalyst are both offered |

  `actMult = [1, 1.5, 2]`. So H3 total shards = 30 / 45 / 60.
* **Why**: it is the execution test. Escalation stays bounded (Last Epoch / Hades cap), and payout is superlinear so Heat 3 feels like a goal, not a grind.

#### D. Obelisk of Tithe ("The Rift lends") - v1.1 candidate
* **Look**: bone-white basin with blood-red veins; icon: open hand.
* **Effect / cost**: immediately choose **1 of 3 relics** (4 with Lantern); in return **-25% max HP until the act's boss dies** (loan, not permanent). Max once per act; max HP does not heal back at the repayment moment (HP% preserved).
* **Why it is good**: the only obelisk that pays BEFORE the boss, so it helps the horde phase and is the "snowball" option. The cost lands in the fight, which is where HP matters. Overlap with Glass Sigil: multiplicative.
* **Risk**: relic now vs -25% HP later is probably a favourable trade for good players. Hold until the first three are balanced.

#### E. Obelisk of Siege ("the stay-longer lane") - cut candidate
* 45 s of horde x1.6 spawn rate and x1.5 XP, ending with a Relic Bearer elite (a second Surge). It is the "level up instead of leaving" lane and the closest thing to VS Curse. Cut for v1 (it duplicates Elite Surge + Swarm).

### 4.3 Level-deficit compensation (summary)
* Reap XP (free, automatic) plus the Windfall (30% of skipped XP) plus the extra relic choice cover about 40-60% of the lost power. The rest is the price.
* Do NOT compensate more: the point of Haste is that it is harder. If sim shows Haste@1:30 has equal win rate to the default path, reduce Windfall to 20% or remove the Quick Chest.
* Show the net in the tooltip: "Skips about -3 levels. Windfall returns +1." A player who understands this will use Haste when they are strong or fast, which is the "player controls their own risk" goal.

### 4.4 Total payoff, worked example (Act II, tier 0)
* Haste@1:30 + Echo + Wrath H3: boss chest 5 choices (one Boss Relic), Echo Chest with 3 Boss Relics, Wrath Cache, shards 34 + 22 + 45 = **101 shards** this act.
* Three acts all-in = about 303 shards, versus baseline run of about 313 (my rough estimate: 45 acts + 120 boss + about 118 kills + up to 30 chain); the 60% cap trims this to about 188. Net: a successful all-in run pays about +60%, not +100%.
* Cost: boss with 3 affixes at +30% HP, -3 levels, +10% damage taken, and an Echo round. Intended death rate: high.

### 4.5 Boss Relics (new rare tag "boss")
Drawn from Echo Chests and Heat 3 chests. Start with four; each is a rule-bender, not a stat stick.

| Relic | Effect | Hook |
|---|---|---|
| **Gorrak's Tusk** | Your dash releases a shockwave (r 3, 0.5 s stun, knockback 8) and has -25% cooldown. | dash builds, Perfect Dodge |
| **Vashkar's Brand** | Enemy Fire resistance is ignored; Burn spreads to 2 foes on death. | fire builds in Act II/III |
| **Aurelith's Scale** | Every 12 s your next reaction is guaranteed to Echo and breaks a Prism Ward. | reaction builds |
| **Rift Catalyst** | Choose a fusion whose parents you own (any rank); it forms immediately at rank 1. | build-defining |

Mark these as `tag: 'boss'` in `relics.js`, exclude them from normal chests.

---

## 5. Boss affixes (stackable "Heat" for bosses)

Affixes are the content of Wrath, and also an alternative lane: **Rift Tier** could add 1 default affix per 2 tiers if we want a meta ladder (Hades Heat style). Rules:
* Generic (work on all 3 bosses) so we author them once; each needs one visual tell.
* **Never hide the counter**: every affix has a visible telegraph or a visible state.
* **Never remove telegraph windows**: floor of 0.7 s on any attack's telegraph after speed-ups (Frenzied).

### 5.1 Pool (v1: 6)

| Affix | Effect | Counterplay | Read on the boss |
|---|---|---|---|
| **Frenzied** | Cycle interval x0.8; move speed +15%. | Dash timing | red steam from eyes/vents |
| **Bulwark** | Barrier of 12% max HP, rebuilt 20 s after it breaks; reaction damage x2 vs barrier. | Reactions, burst | barrier bubble (reuse the Hexer bubble) |
| **Retinue** | At 75% and 35% HP calls 2 elites of the act faction (Prism Ward in Act III). They give 0 XP; the boss heals 1%/s while one lives. | Kill the elites first | gold-rimmed escorts |
| **Reverberating** | Each telegraphed ground attack repeats once at the same spot after 1.2 s at 50% damage. | A second dash | ghost telegraph that re-lights |
| **Rift Storm** | While the boss is alive: 3 circles (r 2.0) every 3 s on random spots within 12 u, 1.2 s telegraph, 0.8 x act damage. | Positioning | ground cracks |
| **Last Stand** | At 25% HP: +30% damage, cycle x0.75, one signature attack doubled. | Hold cooldowns for the end | boss glows white |

### 5.2 Candidate extras (later)
* **Unyielding**: immune to Stun/Freeze/knockback. Cryomancer tax: allow only if the sim shows Cryomancer is not penalised more than 10 pts.
* **Siphon**: heals 3% max HP when it hits you (max once per second). Punishes mistakes; has the clearest read.
* **Giant**: +30% HP, x1.2 radius, slower attack cadence.

### 5.3 Rules
* Max 3 affixes at Heat 3, + at most 1 more on the Echo. No affix duplicates; Retinue is banned on Aurelith's Summon phase overlap (check against `bosses.js`, which I did not read).
* Affix rolling is seeded per act at reveal so the preview is exact.
* Affix tuning is by multipliers only, so the boss definitions in `bosses.js` need hooks (`onAttackScheduled`, `onHpPct`, `onHit`), not rewrites.

---

## 6. UI / communication

### 6.1 The offer (reveal)
* Announce banner (existing `announce` event): **"THE RIFT OFFERS"**, sub "Three obelisks have risen. Take what you dare." Sound: low horn + three tones.
* **Edge markers** (existing shrine marker system, UI.md): one per obelisk, using the obelisk's own icon and colour; distance label in metres; Haste marker pulses faster the closer the 3:00 timer is.
* **Act timeline** (top centre): the Boss marker is the default summon; each armed obelisk adds a small glyph chip next to the boss gem. On Haste the Boss marker **slides to "now"** (animation 0.5 s), so the "skip" is visible.

### 6.2 Approach tooltip (world-anchored card at 14 u)
Crownforge gold frame, 3 sections, text from the data (no hard-coded copy):
```
OBELISK OF HASTE                               [chevrons]
Summon the Heart now.
COST   Skips ~62% of this act's XP (about -3 levels)
       Forfeits: Elite Surge chest, Swarm
PAY    +1 level (Windfall)   +22 shards   4-card boss chest
Hold to channel (5 s)  -  stand in the ring
```
For Wrath:
```
OBELISK OF WRATH   [flame] [pip] [pip] [ ]
Next affix: REVERBERATING (attacks repeat once)
COST   Boss: +1 affix   (Heat 2: +15% HP)
PAY    Heat 2: free skill rank/catalyst, 12 shards
```
* Colour: cost lines in red-orange (`--danger`), pay lines in gold. Never colour-only: icons for each line.
* Compute numbers live. The XP and level math uses `game.actTime` and the XP table.

### 6.3 Channelling
* Ring: double concentric ring (shrine uses a single solid ring), rotating rune ticks, progress by tile instances like the shrine's `SHRINE_TILES` (reuse the instancing).
* Ring colour: the obelisk's colour; ring turns **red** when an enemy is inside it (so the player knows the channel is under pressure).
* Cancel is silent; completing flashes + one-shot SFX and the pillar **locks** (a closed glyph).
* **Last-second protection**: Haste's channel ends in a 0.5 s "TURN BACK" window (ring pulse) before the 3 s warning; leaving the ring cancels.

### 6.4 Stakes card (at Rift Seal, 2 s, skippable)
```
STAKES - ACT II
Haste (skipped 90 s)   Echo   Wrath x2: REVERBERATING, BULWARK
On victory:  5-card boss chest  -  Echo chest (3 boss relics)  -  +79 shards
```

### 6.5 During the fight
* **Boss nameplate**: affix **pips** under the bar (icon + name, 1-3), in the Prism Ward badge position pattern; Wrath Heat as flame pips.
* **Echo**: a second, ghosted bar segment behind the main bar ("ECHO 60%"); on kill it slides over.
* **Strain** (Echo cost): a thin red vignette pulse on every boss hit; buff tray icon with tooltip.
* **Tithe** (if shipped): the player's HP bar shows the loaned portion as a hatched dark segment at the right end.
* **World tells**: each affix has one VFX; see "Read on the boss" in 5.1.
* **Summary**: after the boss falls, a payout card counts shards up and lists what each obelisk paid (reinforces cause and effect).

### 6.6 Accessibility and onboarding
* Obelisk types use unique silhouette, icon and colour; keyboard-only play works since it is all movement.
* **One-time tip** on first reveal ("Walk into a ring to channel. You pick your own stakes. Doing nothing is fine.") after the shrine tip, never during the Primer.
* Codex page for obelisks, boss relics and affixes (like reactions).
* Hooks: events `obelisksRisen`, `obeliskArmed`, `bossSealed`, `affixApplied`, for audio and the tutorial.

---

## 7. Implementation sketch (for the contract pass)

* `acts.js`: add `OBELISK_REVEAL = 50`, `XP_BUDGET = [1100, 4000, 7100]`, `ACT_MULT = [1, 1.5, 2]`, `xpFraction(t)`.
* New `src/game/obelisks.js` (owned by one subagent): types table, `Obelisks` class modelled on world.js shrine code; owns `game.stakes = { haste, echo, heat, affixes[], strain }`, emits events.
* `spawner.js`: boss gate changes from `t >= ACT_LENGTH` to `game.stakes.summonNow || t >= ACT_LENGTH`; `_spawnBoss(act, stakes)`; `BUSY_BOSS_MULT = 0` and `_seal()` that calls the dissolve from `game._beginShift` (factor it into `game.dissolveHorde()`); Echo spawn in `_onEnemyKilled`.
* `bosses.js`: affix hooks (not read in this pass; verify the cycle code can scale intervals).
* `game.js`: Reap XP, queued level-up hands before boss wake, `bossKilled` payout (chests + shards), `stats.obeliskShards` (feeds `computeShards`, capped at 60%).
* `relics.js`: tag `boss` + four relics.
* UI: markers, tooltip, nameplate pips, stakes card (UI.md contract).
* Sim harness: add bot policy flags `hasteAt`, `echo`, `heat`; run 200 seeds x 4 classes for each lane; targets in Section 3.3.

---

## 8. Recommendation: what to ship

**Ship "Rift Obelisks v1": Haste + Echo + Wrath, three per act, fixed trio, any subset, Haste ends the window.** It has the fewest moving parts that fully test the idea: one time axis (Haste), one endurance axis (Echo), one execution axis (Wrath).

Ship list:
1. Isolated boss encounter (Seal, Reap, level-up hands, spawner off, soft enrage). This is worth shipping even if obelisks are cut.
2. Three obelisks, 5 s channel, Rift Pull, fixed positions, markers + tooltip.
3. Haste with Windfall 30%, bounty, Quick Chest.
4. Echo with Strain, Echo Chest (Boss Relics).
5. Wrath with 6 affixes, 3 heat tiers.
6. 4 Boss Relics; shard cap 60%.

Cut / defer (in priority order):
1. **Tithe** - v1.1 (strong, easy to add once chests exist).
2. **Siege**, **Overtime/Delay**, **Respite** - cut until playtests ask for them.
3. **Unyielding, Siphon, Giant** affixes - until the first six are tuned.
4. Arena shrinking / arena hazards per boss - cut.
5. Per-boss custom affix variants - cut (generic only).
6. Rift Tier default affixes (Hades-style ladder) - later, only if players ask for a post-win ladder.
7. Re-rolling affixes on the pillar - cut (it would hide the commitment).
8. Tutorial changes beyond a single tip.

Open questions for the orchestrator:
* Should Haste be available in Act I of a player's first runs? (Suggest yes, but show a Primer tip only; it self-selects.)
* Does an Echo Chest feel good as a second modal? (If not, merge into one 6-card chest.)
* Verify in `bosses.js` that cycle intervals and telegraph floors are data-driven; if not, Frenzied/Reverberating move to v1.1.
