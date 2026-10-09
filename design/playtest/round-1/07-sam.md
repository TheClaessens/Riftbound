# Sam — completionist & lore fan · playtest round 1
**Verdict (in character, 2–3 sentences).** Every death paid out exactly what the design says, and the codex filled faster than I expected: reactions were complete after the first run and relics after the eighth. But the whole goal ladder stops at the Prism Dragon. Aurelith sat at 95–98% for minutes of game time in three abandoned runs while I took no damage from it, so I never won, no Rift Tier ever opened, and Stormcaller is still locked. I would come back for the last five fusions, but I would not be playing toward an ending I can see.

Fun: 6/10 · Would play again tomorrow: maybe · Domain score: 5/10

## Session log
Fresh save, `PT.init({ persona: 'sam', skill: 'average', fresh: true })`, Rift Primer on for run 1, no `assist`, no `jump`. Counted = ended by death (shards banked). Abandoned runs (`PT.abandon()`) award 0 shards and do not increment the run counter [data].

| Run | Class / tier | Result (act, time, level) | Build in one line | Shards (total) | Note |
|---|---|---|---|---|---|
| 1 | Pyromancer T0 | Died Act II 6:18, L16 (counted) | Cinder Bolt r2, Spirit Orbs, Blizzard r2, Singularity r2, Static Field, Meteor; Second Wind, Prism Lens, Alchemist's Coil, Thorned Ward | 188 (188) | Primer done; Gorrak killed at 3:09–3:37; reactions 6/6; unlocked Arcanist + Cryomancer |
| 2 | Arcanist T0 | Died Act II 6:57, L20 to Vashkar (boss 16%) (counted) | Arcane Bolt r3, Spirit Orbs r2, Singularity→Cataclysm, Frost Nova, Chain Lightning, Static Field, Meteor; Blood Pact, Pyre Crown, Hoarder's Lantern, Second Wind, Conductor's Ring, Glacier Plate | 209 (217) | First fusion (Cataclysm); killed by boss flame ring |
| 3 | Cryomancer T0 | Abandoned in Act III: Aurelith appeared at 13:18, quit at about 14:46 | Ice Shard, Singularity, Frost Nova→Absolute Zero, Storm Halo, Thunderhead, Blizzard, Static Field; Rift Magnet, Hoarder's Lantern, Echo Stone, Stormglass Boots, Duelist's Mark, Rime Shard | 0 (17) | Gorrak took 147 s; Aurelith at 97%; Act III reached but not counted |
| 4 | Cryomancer T0 | Abandoned in Act III: Aurelith appeared at 13:14, quit at 16:04 | Ice Shard, Singularity, Spirit Orbs, Absolute Zero, Thunderhead, Chain Lightning; Second Wind, Unstable Core, Conductor's Ring, Duelist's Mark, Stormglass Boots, Overclock, Prism Lens | 0 (17) | Longest stall: Aurelith at 97–98% for about 2m50s; no damage taken from it |
| 5 | Pyromancer T0 | Died Act II 6:28, L21 (counted) | Cinder Bolt r4, Static Field, Chain Lightning, Blizzard, Spirit Orbs, Frost Nova→Absolute Zero (with Singularity); Hoarder's Lantern, Alchemist's Coil, Pyre Crown, Prism Lens | 188 (205) | Died to War Boar and projectiles |
| 6 | Arcanist T0 | Died Act II 6:40, L19 at Vashkar 43% (counted) | Arcane Bolt r4, Spirit Orbs, Singularity→Cataclysm (with Meteor), Static Field r2, Chain Lightning r2, Blizzard; Thorned Ward, Second Wind, Glass Sigil | 197 (202) | Second Wind listed and not logged at death (see Bugs) |
| 7 | Cryomancer T0 | Abandoned in Act III: Aurelith appeared at 12:13, quit at about 12:30 | Cryomancer horde build with Rift Magnet and Second Wind; Thorned Ward, Glacier Plate, Alchemist's Coil | 0 (22) | Aurelith at 98% when I quit; short watch, so no stall length claimed |
| 8 | Pyromancer T0 | Died Act II 7:00, L21 at Vashkar 54% (counted) | Cinder Bolt r3, Meteor→Starfall, Blizzard r2, Chain Lightning r4, Fireball r2, Spirit Orbs; Ember Heart, Alchemist's Coil, Echo Stone | 204 (226) | Starfall fused; died to War Boar (91) and Vashkar |
| 9 | Arcanist T0 | Died Act II 5:36, L14 (counted) | Arcane Bolt r1, Fireball, Blizzard r3, Singularity r2, Meteor r2, Spirit Orbs r3; Glass Sigil, Pyre Crown, Thorned Ward, Ember Heart | 147 (173) | Died to War Boar (81) and Warg |

Shard totals: counted 1133 earned, 1100 spent, 33 left. Each counted total matches the design §12 formula `floor(kills/30) + 15·acts + 40·bosses + floor(maxChain/10)`: run 1 = 74+30+40+44 = 188, run 2 = 81+30+40+58 = 209, run 9 = 62+30+40+15 = 147 [data].

### Sanctum spends (why)
| After run | Spent | Left | Why |
|---|---|---|---|
| 1 | Insight→3 (20+40+60 = 120), Vigor→2 (20+40 = 60) = 180 | 8 | Insight is the XP engine that makes every later run faster; Vigor because I died to projectiles |
| 2 | Vigor→3 (60), Insight→4 (80), Might→1, Swiftcast→1, Fortune→1 (20 each) = 200 | 17 | Keep both maxing lines moving; Fortune gives a reroll for the fusion-hunting picks |
| 5 | Insight→5 (100), Vigor→4 (80), Exile→1 (20) = 200 | 5 | Insight maxed; Exile for banish picks on junk cards |
| 6 | Vigor→5 (100), Might→2 (40), Fortune→2 (40) = 180 | 22 | Vigor maxed (survival); damage and rerolls |
| 8 | Might→3 (60), Fortune→3 (60), Swiftcast→2 (40), Exile→2 (40) = 200 | 26 | Fortune maxed |
| 9 | Might→4 (80), Swiftcast→3 (60) = 140 | 33 | Nothing else affordable: cheapest left is Exile→3 at 60 |

Attunement ranks at end: Might 4/5, Vigor 5/5, Insight 5/5, Swiftcast 3/5, Fortune 3/3, Exile 2/3.

### Progression table (counted runs and codex)
| After run | Shards earned / total | Codex reactions / fusions / relics | Unlocks | Tiers |
|---|---|---|---|---|
| 1 | 188 / 188 | 6 / 0 / 4 (of 6 / 10 / 18) | Arcanist (killWarden), Cryomancer (reactions4) | 0 |
| 2 | 209 / 217 | 6 / 1 / 9 | none | 0 |
| 5 | 188 / 205 | not read | none | 0 |
| 6 | 197 / 202 | 6 / 4 / 17 | none | 0 |
| 8 | 204 / 226 | 6 / 5 / 18 | none | 0 |
| 9 | 147 / 173 | 6 / 5 / 18 | none | 0 |

Stormcaller (reachAct3) never unlocked: no counted run has ended in Act III, so `bestAct` stayed at II through 6 counted runs and 3 abandons.

## Highlights (what worked — keep these)
- The shard formula is exact and legible: a Pyromancer that reached Act II with 443 max chain got 188, and the title, the end screen and the Sanctum all agreed on the total. [data]
- The codex and unlock hints are the best part of the meta: the title shows the next lock ("Reach the Stormwater Reach (Act III)") and the Sanctum shows 29/34 at a glance. [read]
- The relic flavour lines are short and specific, and several land: "Not yet." on Second Wind, "Paid in advance. Forever." on Blood Pact, "Cold enough to stop a thought." on Rime Shard, "It remembers every wound." on Thorned Ward. [read]
- Act names and boss lines match DESIGN §3: The Thornwood / Gorrak "The old king of the Thornwood wakes."; The Sunscorch Barrens / Vashkar "Fire will not hurt him much."; The Stormwater Reach / Aurelith "Shatter the Heart to seal the Rift." Each boss's weakness is stated in the announcement before the fight. [read]
- Fusion picks are readable at level-up: each card carries "Fusion path: + X → Y" or "Unlocks FUSION: Y!", so a completionist can plan a build toward a named fusion. [read]
- Level-ups in act I–II land near the design targets (L9–10 by the Act I boss, L16–20 by Act II's end). [data]

## Pain points (ranked, worst first)
1. **The endgame never ends.** Aurelith took damage in the first minute (100% → 97%) and then stayed at 95–98% for the whole time I watched in three abandoned runs: about 1.5 game minutes in one, about 2m50s in the longest, and a short watch in the third. The Dragon did not hurt me in any of them (`dmgBy` empty during the stall), so every run sat until I abandoned it. There is no visible way to finish the fight: the announcement says "Shatter the Heart", and no HUD element says where the heart is. Victory is what unlocks Rift Tiers 1–5 and, by design, is how a player finishes the game. [data][seen][read] · Severity: blocker
2. **Dying is the only reward, and it is hard to get to.** Abandoning a run pays 0 shards and does not count as a run. Stormcaller's unlock (reach Act III) needs a counted run to end in Act III, and nothing I did produced one. From the menu it looks like I reached Act III, but the Sanctum still shows bestAct II. [data][inferred] · Severity: major
3. **The shard number on the death screen says +0.** The "fallen" screen reads "+0 rift shards · total 17" until the harness banks the run, then the total jumps by 188 or 209. If a player sees that, they will think the run paid nothing. [read] · Severity: major (verify it is not harness-only)
4. **Second Wind is invisible.** It fired once with no event line (HP went from 30 to 78 of 156, which is exactly 50%), and two of my lethal deaths had Second Wind equipped and no trigger logged (run 1 at 6:18, run 6 at 6:40). I could not tell whether it was consumed, bypassed, or never armed. [data][inferred] · Severity: major
5. **Fusion codex has no visible map.** 5 of 10 fusions are filled after 9 runs. The codex shows only a count, and I found nine recipe names in the hints; the tenth recipe is not named anywhere on screen I could read. The death-screen line "Raise two skills to rank 3 and the Rift offers a fusion" is the only guidance. [read][inferred] · Severity: major
6. **Reaction codex is done in one run.** Six reactions were all discovered in run 1 (the primer teaches Steam and the rest come along in one act). That gives Sam a checkmark on day one and then nothing to chase for that codex line. [data] · Severity: minor
7. **Act III feedback is spam.** "Prism Ward broken (frost)" lines landed every 2–5 seconds in the event log through all of Act III, which buries anything more useful. [data] · Severity: minor
8. **Attunement price rises the cost curve fast.** Max Insight+Vigor+Might+Swiftcast+Fortune+Exile is 1440 shards, about 7.6 counted runs at my average of 189 per run, and the Sanctum panel shows the next rank cost clearly. That is fine, but at the max rank the mid-game 60-shard purchases are all Fortune or Exile, so the late game has few meaningful choices. [data] · Severity: minor
9. **Stray onboarding text in a non-tutorial run.** In run 3, the Rift Primer's end line "Primer complete. Survive three minutes, then slay the Troll King." fired at the start of Act III. [data] · Severity: minor

## Bugs & oddities
- **Aurelith stall (blocker).** Repro: any run that reaches the Act III boss at 3:00 act clock. Observed `boss` HP: 100% at 13:18 then 97% at 14:30 (run A); 97–98% from 13:14 to 16:04 (run B); 98% at 12:26 (run C, quit soon after). `window.dmgBy` empty throughout. Shots: `dev/shots/pt-sam-aurelith-stuck.png`, `dev/shots/pt-sam-aurelith-run4.png` (dragon barely visible under the horde and ward shards).
- **Death screen shards read +0** before `PT.end()` banks them (e.g. run 1 "+0 rift shards / total 0" → 188 banked; run 9 "+0 / total 26" → 147 banked). Could be harness-only ordering; please check with a real click-through to "Return to Sanctum".
- **Second Wind**: silent trigger at run 2 (HP 30 → 78 of 156, no event). Not triggered at lethal damage in run 1 (dead at 0/110 with Second Wind listed, event log silent) and run 6 (dead at 0/91 with Second Wind listed, silent). Could be overkill damage in a single tick or a cooldown bug.
- **Title/Sanctum stale after `PT.buy()`**: the title panel kept showing pre-purchase shard totals and attunement prices until the screen re-rendered (seen after run 1 buys, run 2 buys and run 9 buys). Sanctum data was correct throughout. Likely harness-only (no re-render from `buy()`), but worth checking that a real click refreshes.
- **Rift Tier row vanished from the title.** On the fresh save the title showed "Rift Tier 0 1 2 3 4 5 · the rift as it is · no modifiers". After six counted runs it is no longer in `PT.ui()` on the title. Could be gated on a win; please confirm the row is meant to hide.
- **Primer text in a finished tutorial**: "PRIMER PANEL: Primer complete. Survive three minutes, then slay the Troll King." at 10:18 in run 3 (Act III start, `tutorial: false`).
- **Abandon awards nothing silently**: `PT.abandon()` returned to title with no shards and no run counted. Whether the in-game quit path warns the player is unknown to me.
- **Lowhp stop with HP already under 30%**: `PT.play({ lowHp: true })` returns at once with 0 s played (harness, not game).

## Recommendations (max 6)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Make Aurelith's heart/ward state readable on the HUD (ward element, heart exposed/shielded) and make sure a hit on the exposed heart lands. Add a stall backstop (e.g. boss enrage after N seconds with no HP change). | #1 Endgame never ends | Gives every run a real ending; unlocks Tiers 1–5 and the Stormcaller path | M |
| 2 | Show the shard breakdown the run will bank on the death screen (kills, acts, bosses, chain) and the new total, not +0. | #3 +0 on death | Players see the reward before they leave the run | S |
| 3 | Give abandon a clear warning ("quit: 0 shards, run not counted") or pay a fraction of the shards. | #2 abandon = no reward | Stops long, unrewarded runs from feeling wasted | S |
| 4 | Log every Second Wind trigger (and its HP before and after) and make sure lethal damage in one tick still arms it. | #4 Second Wind invisible | Players trust the relic; devs can verify the bug | S |
| 5 | In the fusion codex, show all 10 recipe silhouettes with the two skills each needs. | #5 fusion map | The last 5 fusions become a visible goal across runs | S |
| 6 | Cap the Prism Ward event lines to one per ward phase and keep the rest in the HUD. | #7 event spam | Act III log becomes readable | S |

## Domain deep-dive
**Is there always a next goal?** Yes, until about run 6. The title always names one next lock or cost, and in early runs there are plenty of goals (Arcanist, Cryomancer, codex lines, attunement ranks). By run 6 the visible goals are fusions (5/10, with no map), Stormcaller (needs an Act III death I could not get), attunement top-ups worth 340 more shards, and Rift Tiers 1–5 (locked behind a Victory I could not get). Without a Victory the game has no ending, so the goal list stalls there.

**How long until everything is unlocked?**
- Classes: 3 of 4 in run 1 (Arcanist via killWarden, Cryomancer via reactions4). Stormcaller is not projected: it needs a counted run to end in Act III, which none of my 9 runs did.
- Codex: reactions 6/6 in run 1; relics 18/18 by run 8; fusions 5/10 by run 9. The last five need specific skill pairs and I could not name the tenth. My estimate is 5–10 more counted runs with deliberate picks, but that is a guess.
- Attunements: the remaining need is Might 4→5 (100), Swiftcast 3→5 (80+100), Exile 2→3 (60), which is 340 shards beyond the 33 I have banked, roughly 2 counted runs at 189 average.
- Rift Tiers 1–5: not projectable at all. Tier N+1 needs a win at tier N and I have zero wins. If Aurelith can be beaten, that is five full ~11-minute wins in a row before the top tier.
Overall, a player on my pace reaches "classes done, relics and reactions done, attunements maxed" in about 2 counted runs plus the fusion hunt, and stops at the Dragon wall. I do not think a human would have the same wall, but the screen does not give them the means to find out.

**What is the rate of shards and attunements?** About 189 shards per counted run (range 147–209; abandoned runs 0). The rate is driven by kills, chain, and acts reached, not by boss kills. So a run that is bad at killing Aurelith but reaches Act III still gains the same as one that dies early in Act II, if it counts. Attunement costs are 20 × next rank, as DESIGN §12 says: Might r1 20, r2 40, r3 60, r4 80, r5 100.

**Codex fill rate and discovery.** Reactions filled in run 1 and the primer carries the first six, so the codex gives no long-term reason to play. Relics filled quickly (9 by run 2, 18 by run 8) because each chest offers 3–4 new relics. Fusions are the only slow line, and the level-up card "Fusion path" hints are the only way to aim at them.

**Does the world's text feel coherent and evocative?** Largely yes, and the Thornwood / Sunscorch / Stormwater act names and the three boss announcements read well as one story (the old king wakes, the Warchief answers the horns, the Dragon hides its heart). The relic lines are the strongest writing: terse, specific, two-word rhythm ("Beautiful. Fragile. Lethal." on Glass Sigil, "Faster. Faster. FASTER." on Overclock). Weak spots: the Prism Ward event lines are repetitive, the primer line about the Troll King fires at the wrong time, and nothing in the world text explains how to break the Dragon's heart, which is the one piece of lore a completionist needs most. The Pyre Crown line "Worn by a king who ruled ashes." lands well with the Warband act.

**Goals the game communicates.** Clearly: codex counts, attunement costs, and the Stormcaller lock. Weakly: fusion recipes (only as level-up hints), the Dragon's weakness (announced once), and the tier ladder (its row disappears from the title after I unlocked nothing).

## Harness caveats
- Bot hands did all the moving, dodging and ward-breaking. The Aurelith stall may be a hands problem: the bot may simply not be targeting the heart. I could not tell design bug from bot limitation, and I did not read game source to find out. The "dragon does zero damage to me" fact is solid, but it is one character's data.
- My level-up and relic picks were codex-biased (fusions, new skills, relics with good flavour), not a neutral policy, so builds here are not representative of a casual player.
- The death-screen "+0" reading and the stale title panel may come from the harness calling `PT.ui()` before `PT.end()` or `PT.buy()` re-render; I could not check a real click-through.
- Deaths are weak evidence of difficulty (bot died to projectiles and War Boars in Act II), so I did not judge difficulty from them.
- No audio. Screenshots only where noted; shots at boss time show the horde and ward shards, not the heart.
- `assist` was not used (no content crutch needed); no `jump` used.

## Findings (machine-readable)
```json
[
  {"area":"bosses","type":"bug","severity":"blocker","finding":"Aurelith, the Prism Dragon stays at 95–98% HP across three runs (up to about 2m50s watched); the hero takes zero damage from the boss during the stall, so runs never end and Victory (and Rift Tiers) are unreachable with these hands.","evidence":"[data] boss HP 100%→97% by 14:30 (boss at 13:18), 97–98% from 13:14 to 16:04 (second run), 98% at 12:26 (third run); dmgBy empty throughout; events show only 'Prism Ward broken' lines; announcement 'Shatter the Heart to seal the Rift'. Shot dev/shots/pt-sam-aurelith-stuck.png.","recommendation":"Make the heart/ward state readable on the HUD, verify exposed-heart hits land, add an enrage or stall backstop."},
  {"area":"bosses","type":"issue","severity":"major","finding":"The Act III boss's win condition is not communicated on screen beyond one announcement line.","evidence":"[read] only 'Shatter the Heart to seal the Rift' in the boss announcement; no HUD target or hint for the heart.","recommendation":"Add a short persistent objective line or heart indicator during the Aurelith fight."},
  {"area":"meta","type":"issue","severity":"major","finding":"Abandoning a run awards 0 shards and does not count as a run, with no visible warning.","evidence":"[data] PT.abandon() after 14–16 game minutes: shards unchanged, runs counter unchanged (4 → 4, 2 → 2).","recommendation":"Warn on quit or pay a partial reward."},
  {"area":"meta","type":"issue","severity":"major","finding":"Stormcaller (reach Act III) cannot be unlocked: no counted run has ended in Act III, so bestAct stayed at II over 6 counted runs and 3 abandoned Act III runs.","evidence":"[data] sanctum.classes stormcaller unlocked:false, unlock 'reachAct3'; bestAct 2 after 6 runs; title hint 'Reach the Stormwater Reach (Act III)'.","recommendation":"Count Act III reach at the moment of entry, or provide a path to die in Act III."},
  {"area":"ui","type":"bug","severity":"major","finding":"Death screen shows '+0 rift shards' with the pre-run total; the banked award (188–209 per run) appears only after the run is closed.","evidence":"[read] PT.ui() on 'fallen' screen: '+0 rift shards / total 17' (run 9); PT.end() then reports shardsEarned 147, total 173.","recommendation":"Show the earned amount on the death screen; verify whether the harness reads too early."},
  {"area":"combat","type":"bug","severity":"major","finding":"Second Wind's trigger is invisible: it fired once with no event (HP 30→78 of 156), and two lethal deaths with it equipped and unused logged no trigger.","evidence":"[data] run 2 HP 30→78 silently at 6:05 (50% of 156); run 1 died 0/110 at 6:18 and run 6 died 0/91 at 6:40 with 'Second Wind' in relics and no 'Second Wind' event.","recommendation":"Log every trigger with HP before/after; confirm lethal bursts still arm the relic."},
  {"area":"progression","type":"issue","severity":"major","finding":"The fusion codex gives no map: 5/10 after 9 runs, and only nine recipe names are visible anywhere in the game.","evidence":"[read] sanctum codex 'fusions 5/10'; level-up hints name Cataclysm, Absolute Zero, Storm Halo, Thunderhead, Starfall, Hailstorm, Frostfire Comet, Arcane Barrage, Plasma Orb; the tenth recipe is not named on screen.","recommendation":"Show all ten recipes as silhouettes with their required skills in the codex."},
  {"area":"progression","type":"issue","severity":"minor","finding":"The reaction codex (6/6) is complete in run 1, leaving no codex goal for reactions after the primer.","evidence":"[data] after run 1 sanctum codex reactions 6/6.","recommendation":"Spread reaction discoveries across acts or add reaction mastery goals."},
  {"area":"meta","type":"praise","severity":"minor","finding":"The shard formula matches DESIGN §12 exactly on every counted run that I checked, and the Sanctum totals agree with the title.","evidence":"[data] run 1: 74+30+40+44 = 188; run 2: 81+30+40+58 = 209; run 9: 62+30+40+15 = 147.","recommendation":"Keep the formula and show its breakdown on the end screen."},
  {"area":"meta","type":"praise","severity":"minor","finding":"Class and attunement goals are always visible: the title shows the next lock and the Sanctum shows the next attunement cost.","evidence":"[read] title 'Reach the Stormwater Reach (Act III)'; attunements listed with next cost (20 × next rank).","recommendation":"Keep these visible; add the same for fusions and tiers."},
  {"area":"lore","type":"praise","severity":"minor","finding":"Relic flavour lines are short, specific and memorable; several are the best writing in the game.","evidence":"[read] 'Not yet.' (Second Wind); 'Paid in advance. Forever.' (Blood Pact); 'Cold enough to stop a thought.' (Rime Shard); 'It remembers every wound.' (Thorned Ward); 'Faster. Faster. FASTER.' (Overclock).","recommendation":"Keep the style for the remaining boss and fusion text."},
  {"area":"lore","type":"praise","severity":"minor","finding":"Act names and boss announcements form a coherent arc matching DESIGN §2–3, and each boss announces its weakness before the fight.","evidence":"[read] 'The old king of the Thornwood wakes.'; 'Fire will not hurt him much.'; 'Shatter the Heart to seal the Rift.'","recommendation":"Make the Aurelith line match the on-screen objective (see the boss finding)."},
  {"area":"lore","type":"bug","severity":"minor","finding":"A Rift Primer end line ('Survive three minutes, then slay the Troll King') fired at the start of Act III in a non-tutorial run.","evidence":"[data] run 3 events '10:18 PRIMER PANEL: rift primer Primer complete...' with tutorial:false.","recommendation":"Stop primer text from firing outside the tutorial."},
  {"area":"visuals","type":"issue","severity":"minor","finding":"Act III event log is spammed with 'Prism Ward broken (element)' every 2–5 seconds.","evidence":"[data] runs 3, 4, 7: 15–20 such events per game minute during Act III.","recommendation":"Collapse repeated ward events into a counter."},
  {"area":"ui","type":"bug","severity":"minor","finding":"The title and Sanctum panels show stale shard totals and attunement prices after PT.buy() until the screen re-renders.","evidence":"[read] after buys the PT.ui() title showed 173 while PT.sanctum() showed 33; costs shown as base values until a later read.","recommendation":"Verify a real click refreshes; if so, this is harness-only."},
  {"area":"ui","type":"issue","severity":"minor","finding":"The Rift Tier row (0–5) was on the fresh-save title but is absent from the title after six counted runs.","evidence":"[read] fresh title: 'Rift Tier 0 1 2 3 4 5 · the rift as it is · no modifiers'; later title text has no tier row.","recommendation":"Show locked tiers with the unlock condition (win at tier N)."},
  {"area":"balance","type":"issue","severity":"minor","finding":"Act II boss kill times run 70–149 s against the DESIGN §13 target of 45–60 s; Act I kills ranged 20–147 s.","evidence":"[data] Vashkar killed in 107 s, 149 s and 70 s; Gorrak killed in 20 s, 33 s, 34 s, 41 s, 101 s, 118 s, 147 s.","recommendation":"Dex should confirm against the batch data."}
]
```
