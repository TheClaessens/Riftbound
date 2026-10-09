# Noor — genre newcomer · playtest round 3
**Verdict (in character, 2–3 sentences).** I never played one of these, and after four runs I could explain most of the raid layer from the game's own tips: Stagger, Downed, Break Check, intermission and Winded are taught well by the tip line at the moment they happen. What lost me was the *obelisk* vocabulary (Windfall, Strain, Heat, affix, Elite Surge) and the fact that when I died, nothing told me that the obelisk bet I made was part of the reason. Red = bad I got at once; I never actually met a gold "go here" zone, so I cannot say if that half is obvious.
Fun: 7/10 · Would play again tomorrow: maybe (yes, if the obelisk cards read in plain words) · Domain score (learnability of the raid layer): 6.5/10

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| 1 | Pyromancer T0, fresh save, primer on | Died Act II 6:06, lvl 15, killed by Vashkar "axe sweep" | Cinder Bolt + Fireball + Spirit Orbs + Static Field + Blizzard + Frost Nova + Chain Lightning, 4 relics | 126 (Vigor x3 bought) | Killed Gorrak with no obelisk (84 s). In Act II I pulled the Haste obelisk at 38/110 HP and died inside the fight. |
| 2 | Cryomancer T0 | Died Act I 3:56, lvl 11, killed by Gorrak "kings wrath" (intermission 2) | Ice Shard + Frost Nova + Meteor, Glass Sigil (−40% max HP) | 59 | Armed Wrath to Heat 3 (Frenzied / Rift Storm / Vengeful). Bot picked the risky relic (my selection script took card 1); HP 154 → 92. |
| 3 | Arcanist T0 [assisted 0.5] | Died Act II 5:43, lvl 13 (War Boar contact, crowd) | Arcane Bolt + Fireball + Orbs, Pyre Crown, Conductor's Ring | 132 | Could not get the hands into the Echo ring (see Bugs). Killed Gorrak in 63 s with no obelisk. |
| 4 | Cryomancer T0 [assisted 0.5] | Abandoned in Act II 4:59 after beating Gorrak and the Echo | Ice Shard-based | 0 (abandon pays nothing) | Echo armed OK at 1:05. Gorrak 70 s, Echo of Gorrak 41 s, Echo Chest = 3 Boss Relics. |

## Highlights (what worked — keep these)
- **The tip line teaches each raid word at the moment it happens.** "Reactions, freezes, stuns, burning/chilled/shocked status and perfect dodges fill the boss's STAGGER bar. Fill it to knock the boss DOWN: it takes +40% damage." appeared with the first Stagger fill; "Break Check! Fill the STAGGER bar to the marker before the cast ends, or it lands." appeared on the first War Horn; "Intermission: the boss can't be harmed. Survive the pattern — it ends with the boss WINDED." and "WINDED: free hits after the intermission." appeared in sequence. I understood all four from tips alone. [read]
- **The boss-arrival tip about colour is excellent**: "The arena seals. Red = get out, striped gold = go here. Every attack is shown on the ground first." [read] Red circles/rings were instantly legible in the shots (shot: `playtest/out/noor-r3-kingswrath.png`, `playtest/out/noor-r3-wrath-boss.png`). [seen]
- **Break Check HUD** is one clear block: "WAR HORN / BREAK IT — STAGGER 60 / 5.0" with a countdown, then "War Horn BROKEN, boss DOWNED for 6s". Reading it, I knew what to do and whether it worked. [read]
- **Death screen "next time" lines are actionable** and specific: "King's Wrath shockwaves can't be outrun in the arena. Dash through each ring. They come about 3 seconds apart, so your dash is back for the next." and "Axe sweep follows with a ring around that circle. Step back IN, close to him." I would have tried exactly that next time. [read]
- **Obelisk cards give real numbers** (e.g. Haste: "Skips 130 s of horde", "Windfall: +356 XP now", "≈ −2 levels after the Windfall", "≈ +33 shards", "Paid only if you win the boss fight") and the tip "Doing nothing is fine." removed the fear of missing out. [read]
- **Boss "ECHO ARMED / THE BOSS WILL COME TWICE. YOU TAKE +10% DAMAGE."** banner after channelling is plain and honest. [read]
- Boss frame with phase names ("PHASE II SPORE ROT", "I · TIMBERFALL", "INTERMISSION 7.6 / It cannot be harmed. Survive.") makes fight structure feel like a raid. [read]

## Pain points (ranked, worst first)
1. **The death screen doesn't mention the obelisk bet or the HP I walked in with.** Run 1: I armed Haste at 38/110 HP (nothing on the card warns "you will have no time to heal"), arrived at Vashkar at 39 HP and died; the screen said "Slain by Vashkar axe sweep" and blamed Goblin Shaman 45% / Gorrak 25% (whole-run damage), with no line like "Haste skipped your healing time" or "Haste payout lost". Run 2: Wrath 3 + Glass Sigil killed me, and the death screen listed only "Relics bound: Glass Sigil" and a King's Wrath tip. A newcomer will not connect "my choices at the obelisk" with "I died". [read] · Severity: major
2. **Obelisk vocabulary is jargon.** Windfall, Strain, Heat, affix, Elite Surge, Swarm, "Boss Relics", "Echo Chest", "Wrath Cache" are all used without explanation. "≈ −2 levels after the Windfall" literally reads as a contradiction (windfall gives XP, yet net levels go down). I could not tell whether Heat 3 is good or bad; the pay lines ("≈ 8 shards in total at Heat 1", "≈ 20 shards at Heat 2") hint that more heat = more reward, but never say "boss gets harder". "Strain: +10% damage taken" needs the word "Strain" removed. [read] · Severity: major
3. **I could not tell the three obelisks apart at a glance.** In the first shot (`noor-r3-obelisks-rise.png`) two are purple crystals and one is cyan, all in dashed rings; the card only appears when I'm near, and the world ring doesn't show which is Haste/Echo/Wrath. The HUD does list "Haste 33m / Echo 24m / Wrath 30m" distances at the top-left, which helped once I noticed it. [seen/read] · Severity: minor
4. **Downed / Winded / Exposed / Sealed / Recovering chips are easy to mix.** In the fight the boss line reads "DOWNED" during a 3 s "WINDED" chip, and I once saw an "EXPOSED" chip (Gorrak phase 2) with no tip explaining it. "SEALED / RECOVERING" for the intermission also sounds like a different thing from "INTERMISSION". Two words for similar free-damage windows is the main confusion in the Stagger family. [read] · Severity: minor
5. **Gold never appeared for me.** In 3 full Gorrak fights and half a Vashkar fight I saw red telegraphs, green spore clouds, blue/purple dashed crystal rings, but never a striped gold "go here" zone, so the tip's second half is unproven for a new player. Green spore clouds look similar to "good" things. [seen] · Severity: minor (uncertain)
6. **The Wrath choice has no "recommended for beginners" cue.** Heat 1 offered "Frenzied: Attacks come 20% faster", Heat 3 added "Vengeful: +12% damage. Each phase gate makes it 6% stronger." I stacked it to Heat 3, couldn't gauge the danger, and died to Gorrak's second intermission. The pay ("Wrath Cache: +1 rank to a skill you own") didn't feel worth what I read. [read/inferred] · Severity: minor
7. **Primer panel and tips go stale across runs.** The text "Primer complete. Survive three minutes, then slay the Troll King." stayed in the primer panel through all four runs, and at the start of the Cryomancer's Act I I got the Act II tip "The orcs of the Barrens resist Fire (50%)". [read] · Severity: polish

## Bugs & oddities
- **Rift Mend is invisible.** After the first Gorrak body died with Echo armed, HP jumped 120 → 154 and I only saw "IT STIRS AGAIN / The Echo rises" and, 3 seconds later, "ECHO OF GORRAK". The card says nothing about a heal between bodies; a newcomer would not know the second body arrives with a fresh bar of HP.
- **"THE HEART STIRS — The boss comes in 3 seconds"** was the announcement after arming Haste in Act II (boss: Vashkar). "The heart" is never explained. [read]
- `PT.ui()` showed the previous level-up/relic card text for a while after I had chosen (stale modal text in the DOM text, not necessarily visible). Harness-level.
- Level-up decisions that arrive while walking to an obelisk cancel my `PT.channel`; I had to re-issue it each time. Worth checking that a real player's channel isn't broken by the level-up modal (progress might be lost).
- Casual hands hovered at distance 7–11 from the Echo/Wrath ring for dozens of seconds under pressure and never stepped in: ring radius vs. what the card calls "stand in the ring" may be tight, or the hands avoid fighting packs. Worked immediately at 0:50 when the field was quiet (runs 2 and 4) and in Act II run 1 (Haste, 2 units). I could not get Echo armed in run 3 despite ~60 s of trying. [data]
- Run 3 [assisted 0.5] died in the Act II horde to "War Boar / Orc Spirit-Shaman contact" in an Elite Surge/Swarm window while stuck outside the Echo ring. Not a design bug; it shows that channelling during a surge is dangerous. [data]
- "+0 rift shards" on the death screen (known animation caveat).
- Sanctum prices rise per rank (Vigor 20 → 40 → 60...), not visible until after buying. I spent 120 shards on 3 Vigor ranks, expecting 20 each. [read]

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Add a **"Your bets" block to the death screen** ("Haste armed: skipped 102 s of healing/levels; payout lost since you didn't win", "Wrath Heat 3: Frenzied, Rift Storm, Vengeful", "You entered the fight at 39/110 HP"). | #1 | Newcomer learns the obelisks are a trade, not a free reward; death reads as "my decision", not "unfair boss". | S |
| 2 | Rewrite obelisk card lines in plain words: "Windfall" → "Bonus XP now"; "Strain" → "You take +10% damage"; "Heat" → "Boss gets harder (Heat 1–3), better payout"; "≈ −2 levels after the Windfall" → "You'll be ~2 levels lower than if you waited". Add a short "Best if you are strong / healthy" line (or the boss-HP warning) on Haste. | #2, #6 | Newcomer can choose without a glossary. | S |
| 3 | Make the three obelisks visually distinct in the world (icon/colour per type and a floating label while within ~25 u) and have the first-time tip name them. | #3 | No guessing which rune is Haste. | S/M |
| 4 | Merge the free-damage window vocabulary: one word for the boss "open" state ("DOWNED") with a subline ("from Stagger / from Break Check / after intermission"); explain EXPOSED in a tip or drop it. | #4 | Fewer terms to memorise. | S |
| 5 | Announce Rift Mend: a one-line banner "Rift Mend: +20% HP, dash ready — the Echo rises in 3 s". Name the Echo's start in the card ("a second, weaker Gorrak at Phase 2"). | Bugs (Rift Mend) | Echo feels fair instead of a surprise. | S |
| 6 | Reset the primer panel text and stale tips when a new run starts; make sure a first gold zone is shown in Gorrak's fight (or in the tip) so "go here" is actually seen. | #5, #7 | Consistent teaching. | S |

## Domain deep-dive
**What I understood after the primer.** Shoot (hold LMB), dash (space) and a perfect dodge when an attack lands, shoot the blue crystal to Chill foes then hit them with Fire for a Steam Burst reaction; two elements on one foe set off a reaction, quick reactions build Chain for XP. The primer text is short and each step fires when I do the thing. The 5 steps passed in about 16 s of game time; it was enough to start but "Chain" as a number rising confused me for a while (I thought ×50! was my kill count). "Rift Crystal" = a shootable pillar in a dashed ring.

**Words/icons that confused me (pre-RAID.md).**
- "Windfall", "Strain", "Heat", "affix", "Elite Surge", "Swarm", "Relic Bearer" (I only learned it from the announcement "Slay the Relic Bearer"), "Echo Chest", "Wrath Cache". Also "Chill/Freeze" in "Foes Freeze at 3 Chill instead of 5" (Rime Shard) and "Adrenaline" (Duelist's Mark).
- Level-up cards say "Reacts with your fire: Overload" — I only worked out that this means a new skill with a different element than my main one, because the tip told me so.
- "Heart" in "THE HEART STIRS".
- The mini icons beside the cooldown row (q/e/r/t with numbers) look like timers, but I never worked out what the "auto" labels in the bar meant.

**Could I explain it to a friend? (what I said BEFORE reading RAID.md, then graded after)**
| Term | My own-words explanation (before) | Graded vs RAID.md (after) |
|---|---|---|
| Haste | A button-in-the-ground that calls the boss right now, skipping the rest of the horde timer. You get a pile of XP instantly but fewer levels overall, and more shards if you win. | Correct. Missed: the reward 4th relic option; HP warning I never saw. |
| Echo | The boss comes back a second time as a weaker copy for a second chest of Boss Relics, and I take +10% damage. | Correct on the main points. Did not know: it starts at Phase 2 with 55% HP (the card says so), and there's a free 3 s heal-and-dash-refill between bodies (Rift Mend, not on the card). Surprised: Echo took only 41 s, easier than the first body. |
| Wrath | A dial: each time I stand in the ring I add Heat. Each Heat adds a nasty boss trait (faster attacks, lightning, extra damage), makes the boss stronger (+15% HP at Heat 2), and ups the reward (more relics, +1 skill rank at Heat 2). | Correct. I did not know the "packs converge on you while you channel" cost is a spawn spike while standing still. |
| Stagger | A grey bar under the boss that fills when I hit it with reactions, freezes, stuns, dodges. | Correct, thanks to the tip. |
| Downed | When Stagger is full the boss falls over for ~4–8 s and takes +40% damage. | Correct. |
| Break Check | The boss shouts (War Horn); I get 5 s to fill Stagger to the marker, or it hits me for a big hit. If I break it the boss is Downed longer. | Correct. |
| Winded | A short 3 s vulnerable state after an intermission, "free hits". | Correct, although I could not tell Winded from Downed on the HUD (both say DOWNED in the status line). |
| Intermission | The boss disappears (SEALED), I can't hurt it, I survive an attack pattern (Timberfall, King's Wrath) for ~8–9 s, then it ends in Winded. | Correct. The clearest of the set. |
| Gold vs red | Red = get out. Gold = go here. | Red confirmed on every telegraph. Gold: never saw one. Unverified. |

**Gold vs red: is "go here" vs "get out" obvious now?** Red yes: red rings, circles and cones in the shots were unmistakable and the tip names them. Gold: I can't say; I never saw a gold zone in Gorrak's fight or the first half of Vashkar's. The death hint "Step back IN, close to him" is the closest thing to a "go here" instruction I saw, and it is phrased as text, not as a coloured zone. One more observation: crystals in dashed blue/purple rings, green spore clouds and the green glow on the troll's club share the screen with the red; with Chain spam steam clouds the screen gets busy, but red stays the loudest.

**Did the death screen tell me what to do differently?** Partly. The "next time" line is concrete for the killing move (King's Wrath: dash through rings; Axe sweep: step back in). What it doesn't tell me: the HP I entered with, that the obelisk I armed made the fight harder or came with no healing time, or why the damage list names Goblin Shaman/Gorrak when a single Vashkar hit killed me. Run 3's line "No single foe killed you, the crowd did. Thin it with area skills and fight with open ground behind you." was a good generic tip, but it wasn't tied to the Echo ring I was trying to reach.

**What confused me most.** (1) The obelisk card wording and what Heat means; (2) that going to an obelisk takes you away from the horde and into the ring while enemies keep coming (the tip says "Doing nothing is fine", which I liked, but nothing says "wait until the elite surge is over"); (3) Downed/Winded/Exposed; (4) why my HP didn't heal between fights (I only saw HP refill from the level-up heal and the Echo's Rift Mend, which came without explanation).

## Harness caveats
- The casual bot hands had real trouble standing inside obelisk rings during Elite Surge/Swarm; a human would just walk in. I could not judge whether the 4 s channel is hard for humans. In run 3 I never managed to arm Echo; in run 4 I armed it at 1:05 when the field was quiet.
- Runs 3 and 4 were [assisted 0.5]; run 3's Act II death is weak evidence for balance. Run 4's Echo was fought assisted, so the "Echo took 41 s and was easy" impression is [assisted] and not a difficulty claim.
- My relic picker took card index 0 in run 2, and that was Glass Sigil. A real beginner might pick the first card too, but the "risk" tag and "max hp 110 → 66" line were on screen.
- I abandoned run 4 and so did not see how an Echo win pays shards (`obeliskShards`).
- Boss-fight judgments are based on the bot's dodging; I did not time telegraphs. Shots are canvas-only (no HUD), so HUD claims are from `PT.ui()` text.
- Gold zones: not seen, so no screenshot evidence either way.

## Findings (machine-readable)
```json
[
 { "area": "onboarding", "type": "praise", "severity": "polish",
   "finding": "Tip line teaches Stagger, Downed, Break Check, Intermission and Winded one at a time, at the moment they occur. A newcomer can explain all five afterwards.",
   "evidence": "Tips: 'Reactions... fill the boss's STAGGER bar. Fill it to knock the boss DOWN: it takes +40% damage.', 'Break Check! Fill the STAGGER bar to the marker...', 'Intermission: ... ends with the boss WINDED.' [read]",
   "recommendation": "Keep; extend the same pattern to obelisk terms." },
 { "area": "ui", "type": "praise", "severity": "polish",
   "finding": "Red telegraphs are instantly legible, and the arena-seal tip names Red = get out, striped gold = go here.",
   "evidence": "playtest/out/noor-r3-kingswrath.png, noor-r3-wrath-boss.png [seen]",
   "recommendation": "Keep." },
 { "area": "ui", "type": "issue", "severity": "major",
   "finding": "Death screen does not mention armed obelisks (Haste/Echo/Wrath), the HP the player walked in with, or a lost payout. Run-wide damage list names unrelated sources.",
   "evidence": "Runs 1 and 2 death screens: only 'Slain by Vashkar axe sweep', 'Relics bound: Glass Sigil', damage % by source for the entire run. [read]",
   "recommendation": "Add a 'Your bets' block (obelisks armed, entry HP, payout lost) and show damage-by-source for the boss fight only." },
 { "area": "onboarding", "type": "issue", "severity": "major",
   "finding": "Obelisk card text uses undefined jargon (Windfall, Strain, Heat, affix, Elite Surge, Swarm) and '≈ -2 levels after the Windfall' reads as contradictory; no beginner guidance about when to take Haste (healthy) or how dangerous Heat 3 is.",
   "evidence": "PT.obelisks() cost/pay lines; Haste armed at 38/110 HP led to a death 20 s later. [read][data]",
   "recommendation": "Plain-language rewrite, a one-line 'who this is for' per obelisk, and a warning on Haste when HP is low." },
 { "area": "readability", "type": "issue", "severity": "minor",
   "finding": "Three obelisks are hard to tell apart in the world (two purple crystals, one cyan, same dashed ring). Card only shows near the obelisk.",
   "evidence": "playtest/out/noor-r3-obelisks-rise.png [seen]",
   "recommendation": "Per-type colour/icon and a floating label." },
 { "area": "ui", "type": "issue", "severity": "minor",
   "finding": "DOWNED, WINDED, EXPOSED, SEALED and RECOVERING overlap in meaning; boss status line says DOWNED during a WINDED chip; EXPOSED has no tip.",
   "evidence": "Gorrak phase 2 status 'EXPOSED' in run 2; WINDED chip alongside 'DOWNED' string in run 1. [read]",
   "recommendation": "Unify to one 'DOWNED' state with a reason subline, or explain each with a tip on first sight." },
 { "area": "bosses", "type": "issue", "severity": "minor",
   "finding": "Rift Mend (heal and dash refill between Echo bodies) is not on the obelisk card and is announced only as 'IT STIRS AGAIN'.",
   "evidence": "HP 120 -> 154 at 4:13 in run 4; log 'the boss falls... the Echo rises (Rift Mend)'. [data]",
   "recommendation": "Add 'Rift Mend: you're healed 20% between bodies' to the Echo card and the announcement." },
 { "area": "bug", "type": "bug", "severity": "polish",
   "finding": "Primer panel text 'Primer complete...' and previous-act tips persist into later runs and acts (Act II tip shown at the start of an Act I of a new run).",
   "evidence": "PT.ui() in all four runs. [read]",
   "recommendation": "Clear the primer panel and tip queue on run start." },
 { "area": "readability", "type": "issue", "severity": "minor",
   "finding": "No gold 'go here' zone was seen in 3 Gorrak fights and half of a Vashkar fight, so the second half of the arena-seal tip is unproven for a new player.",
   "evidence": "Screenshots of Gorrak phases 1-3; no gold-striped zones. [seen]",
   "recommendation": "Show at least one gold safe zone in the first boss fight (or restate the tip when one appears)." },
 { "area": "bug", "type": "bug", "severity": "minor",
   "finding": "Casual hands could not enter obelisk rings during Elite Surge/Swarm; level-up modals cancel a started channel (progress restarted).",
   "evidence": "Run 3: ~60 s hovering at distance 7-11 without channelling; harness channel reset after each decision. [data]",
   "recommendation": "Check that the channel survives the level-up modal and that the ring radius is reachable under pressure; consider a short 'channel pauses instead of resetting' rule." }
]
```
