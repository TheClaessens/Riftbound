# Dex — numbers analyst · playtest round 1
**Verdict (in character, 2–3 sentences).** Spreadsheets say Cryomancer is the only class that wins: 7 of 7 resolved Cryomancer runs won, and 0 of 30 other runs did. Other classes reach Act II's end sometimes (5 of 30 reached Act III), then die there, mostly to enemy projectiles. Cryomancer runs take 12–20 minutes against a 10–11 minute target, bank 3–4× the shards of any other class (almost half from Chain, which reached 15,079 in one run), and their Gorrak and Aurelith medians (79–133 s and 107–237 s) sit well outside the 30–45 s and 60–90 s targets. The beats land on time, but the balance is not there yet.

Fun: 5/10 · Would play again tomorrow: maybe · Domain score: 4/10

Caveat: n = 5 per cell (boss samples n = 2–5). Batch rows use the harness auto-draft policy, not my card choices. Treat every spread below as direction, not verdict.

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| A1 | Pyromancer r0, average ×5 (batch) | 5/5 dead in Act II or I; median 6:28, L17 (range 4:54–6:32) | Fireball, Frost Nova, Cinder Bolt; 2 of 5 fused | median 190 (122–252), computed | Gorrak median 25 s (12–54) |
| A2 | Cryomancer r0, average ×5 (batch) | 4 victories (14:11–20:24); 1 still alive at 21:26 (harness cap) | Storm Halo, Hailstorm, Meteor, Static Field; 5/5 fused | median 754 (567–1129), 46% from Chain | Gorrak 133 s, Vashkar 76 s, Aurelith 237 s (medians) |
| A3 | Stormcaller r0, average ×5 (batch) | 4 dead in Act II (6:55–8:00), 1 dead in Act I (3:30); median 7:08, L18 | Spark, Blizzard, Static Field, Singularity; 4/5 fused | median 210 (72–247) | Gorrak median 41 s (34–87) |
| A4 | Arcanist r0, average ×5 (batch) | 3 dead Act II, 1 dead Act I (3:29, L7), 1 dead Act III (8:22); median 6:49, L16 | Arcane Bolt, Blizzard, Chain Lightning; 3/5 fused | median 210 (61–310) | Gorrak median 35 s |
| B1 | Pyromancer r0, expert ×5 (batch) | 4 dead Act II (4:58–6:35), 1 dead Act III (10:17); median 5:32, L17 | Cinder Bolt, Blizzard, Static Field, Meteor; 4/5 fused | median 140 (135–410) | Gorrak median 35 s (29–44) |
| B2 | Cryomancer r0, expert ×5 (batch) | 3 victories (12:34, 12:55, 17:04); 2 still alive at 20:50 and 21:26 (harness cap) | Ice Shard, Meteor, Hailstorm, Absolute Zero; 5/5 fused | median 692 (390–1934), 46% from Chain | One still-alive run: maxChain 15,079 |
| B3 | Stormcaller r0, expert ×5 (batch) | 5/5 dead, Acts II–III; median 8:55, L20 | Spark, Blizzard, Tempest, Storm Halo; 5/5 fused | median 231 (212–367) | Gorrak median 93 s (24–159) |
| B4 | Arcanist r0, expert ×5 (batch) | 2 dead Act I (5:16, L11; 7:29, L7), 2 dead Act II, 1 dead Act III; median 7:18, L17 | Arcane Bolt, Singularity, Frost Nova, Chain Lightning; 3/5 fused | median 183 (40–284) | Gorrak median 14 s (13–59), fastest kill seen |
| P1 | Pyromancer r0, manual, passives-first (Magnetism, Volley ×2, Catalyst, Precision, Might ×2; relic Thorned Ward) | Dead in Act I boss fight at 3:54, L9 | Cinder Bolt r1, Meteor r1; 5 passives, 1 relic, no fusion | 58 (matches the end-screen figure) | Died with Gorrak at 2% HP; 133 dmg taken in the last 46 s |
| P2 | Cryomancer r0, manual, frost-only (Ice Shard r3, Blizzard r3, Hailstorm r3; passives Amplify, Vitality, Precision ×3, Volley ×2, Might; relics Blood Pact, Echo Stone, Glacier Plate) | Abandoned at Act III start, 9:33, L19, HP 150/150, 3,131 kills | Hailstorm forged at 5:26 (r1), r3 at 8:18 | not computed (abandoned) | Gorrak 144 s, Vashkar 64 s; no frost offer until L4 |

## Highlights (what worked — keep these)
- Beat timings are exact. Act II started at 5:26, Elite Surge at 6:56 (act 1:30), Swarm at 7:41 (act 2:15), boss at 8:26 (act 3:00). [read]
- The shard formula checks out on the end screen. P1: floor(1293/30) + 15·1 + 40·0 + floor(4/10) = 58, the number shown. [read][data]
- Level pacing sits on target early. P1 hit L5 at 1:02 against a 1:00 target. P2 hit L18 at 8:27, at the Act II boss, close to the "L18 at Act II's end" target. [data]
- Dense Act I reads well. P2's shot has about 300 foes alive, and the Cryomancer, the crystal ring and the front of the horde stay separable. [seen] (`dev/shots/pt-dex-mono-frost-act1.png`)
- Arcane Rift Crystals create reactions even in a frost-only build (5 Shatter reactions in P2's Act II boss window). Mixed-element play comes from the map as well as the draft. [data]
- Vashkar's pre-fight announcement reads "Fire will not hurt him much", which pushes a fire-only player to switch element before the fight. [read]
- Hailstorm surfaces as a level-up card once Ice Shard and Blizzard both reach rank 3, with a clear recipe hint ("Fuses Ice Shard + Blizzard"). [read]

## Pain points (ranked, worst first)
1. **Chain runs away and inflates shards.** Shards use the uncapped `floor(maxChain/10)`. Cryomancer runs median 754 shards (567–1129), against 140–231 for the others. Chain is 46% of Cryomancer shards and 10–29% for the rest. In Cryomancer runs, maxChain reaches 40–92% of the total reaction count, so the 2.5 s reset rarely fires in a dense horde. Chain hit 15,079 in one run. [data] · Severity: major
2. **Cryomancer is the only class that wins.** 7 of 7 resolved runs won. The other classes won 0 of 30: 21 died in Act II, 4 in Act I (all during the Gorrak fight), and 5 reached Act III and died there. A player who picks anything but frost is in the losing bracket by default. [data] · Severity: major
3. **Act II is a wall for the other three classes.** Median death per cell is 5:32–8:55, mostly 6:30–7:20. `enemy projectile` is the top damage source in 19 of 30 non-Cryomancer deaths (63%). `War Boar` leads in 4 and Vashkar's `boss flame ring` in 4. Expert hands did not move the wall: Pyromancer 6:28 (average) vs 5:32 (expert), Stormcaller 7:08 vs 8:55, Arcanist 6:49 vs 7:18. [data] · Severity: major
4. **Frost bosses take too long.** Cryomancer Gorrak median 133 s (average) and 79 s (expert), against 30–45 s. Aurelith median 237 s (average, n=4) and 107 s (expert, n=3), against 60–90 s. Vashkar 76–79 s against 45–60 s. The frost-only probe: Gorrak 144 s, Vashkar 64 s. In that probe the Gorrak fight started with 290 foes alive. [data][seen] · Severity: major
5. **Cryomancer runs are too long.** Victories run 12:34–20:24 (median 18:01 average, 12:55 expert) against a 10–11 minute target. Final-boss levels (L31–56) are also well past the L26 target. [data] · Severity: major
6. **Frost-only builds are starved and do not react.** P2 saw 9 level-up cards at L2–L3 (including one reroll) with no frost card. The first frost offer was Blizzard at L4, and Ice Shard r2 came at L5. Its Chain stayed at 0 until the Act I crystals fired, and its L10 landed at 4:39, late against the Act I boss. [data][read] · Severity: minor
7. **Skill expression does not show in outcomes.** Expert and average hands moved Stormcaller later (+1:47) and Pyromancer earlier (−0:56). With n = 5 this is noise, and it may be the bot's ceiling rather than the game's. [data] · Severity: minor

## Bugs & oddities
- **Chain runaway.** Batch B2 expert Cryomancer, still alive at 21:26: `maxChain` 15,079, `reactions` 16,456, `kills` 9,080, `bossTtk` [62, 90]. Repro: `PT.batch({ classIds:['cryomancer'], n:5, skill:'expert' })`, then read the row with `result: "playing"`. Expected: Chain resets when the gap exceeds 2.5 s. Hypothesis: continuous reactions from Thunderhead and Storm Halo keep the window open. [data][inferred]
- **Harness time cap at about 21:26.** Three Cryomancer runs ended as `playing` at 20:50–21:26 (A2 at 21:26, B2 at 20:50 and 21:26), which looks like a per-run time cap in the batch. Censored, not wins. [data]
- **Empty damage window.** B2 expert victory at 12:34 has `topDmgSources: []`, so a 12-minute run logged no damage. [data]
- **Fusion consumes the second parent's slot.** After Hailstorm was forged, the HUD skill list went from `Ice Shard r3, Blizzard r3` to `Hailstorm r1` alone. Probably intended under the fusion-slot rule, but worth confirming that Blizzard r3 is meant to vanish. [read]
- **Relic decision at Act II boss spawn.** P2 got a relic chest decision at 8:26, the same second as Vashkar's spawn. The event log shows no chest or Relic Bearer death, so the source is unclear. [read]
- **Frost offers.** Nine offers at L2–L3 (plus a reroll) had no frost card. Blizzard first appeared at L4, and the first Ice Shard rank card at L5. This may be draw luck, but check the pool weighting for a starter's own element. [data]

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Cap the Chain term in the shard formula (for example `min(maxChain, 50)/10`), or count chain resets per run instead of the running max. Confirm the 2.5 s reset fires under continuous reactions | 1 (Chain runaway); 2 (Cryomancer shards) | Cryomancer shards fall from about 4× the others to about 2×. Removes the meta pull toward frost | S |
| 2 | Raise frost damage to bosses, or lower Gorrak and Aurelith HP, so frost fights land in the 30–45 s and 60–90 s bands | 4 (boss TTK) | Gorrak and Aurelith TTK move into target for Cryomancer. Frost stops being the slowest boss element | M |
| 3 | Reduce Act II ranged damage (`emberSpitter`, `War Boar` charge) or delay the Act II roster by about 30 s | 3 (Act II wall); 2 (only Cryomancer wins) | Other classes reach Act III more often. Act II median death moves past 7:30 | M |
| 4 | Lower the Gorrak horde pressure. About 300 foes alive stretches the boss TTK and spills damage. Check whether the 35% boss-phase horde rate applies in Act I | 4 (boss TTK) | Gorrak TTK drops for every class, not only frost | S |
| 5 | Trim Cryomancer survival (Permafrost armour, Glacier Plate, +30 HP stat tilt) or reduce the Superconduct loop from Thunderhead so Chain does not run forever | 2 (only Cryomancer wins); 5 (run length) | Runs move toward 10–11 min and Cryomancer stops winning by default | M |
| 6 | Guarantee at least one card of the class's own starter element by Level 4 | 6 (frost-only starvation) | Single-element builds are viable without rerolls | S |

## Domain deep-dive
**Which class, skill or relic is over- or under-tuned?**
- **Cryomancer: over-tuned on survival and on Chain.** 7 of 7 resolved runs won. Median shards 754 against 140–231 for the rest, and 46% of shards come from Chain. Its real weakness is run length and boss TTK, which costs it time, not outcomes.
- **Pyromancer: under-tuned against Act II.** Median death 6:28 (average) and 5:32 (expert). Vashkar resists fire by half, so fire has no good answer to the Act II boss. Its Gorrak TTK is on target (25–35 s).
- **Stormcaller: mid.** Median death 7:08 (average) and 8:55 (expert). It reaches Act II reliably. Vashkar's flame ring is its third-biggest damage source, not its second.
- **Arcanist: mid to under.** Median death 6:49 (average) and 7:18 (expert), with one Act I death on each side. Its boss fights are variable (Gorrak 14–35 s on medians).
- **Skills.** The near-universal picks are Fireball (5 of 5 average Pyromancer runs), Storm Halo (5 of 5 average Cryomancer runs) and Frost Nova (4 of 5 average Pyromancer runs). Cryomancer's frost-storm fusions (Storm Halo, Hailstorm, Absolute Zero, Thunderhead) appear in all 10 Cryomancer runs and in 6 of 10 Stormcaller runs. No skill outside Cryomancer dominates its cell, but the samples are tiny.
- **Relics.** Rime Shard is in 8 of 10 Cryomancer runs and Alchemist's Coil in 4 of 5 average Cryomancer runs. No relic appears in more than 4 of 5 runs in any other class. Relic data gives no dominant non-Cryomancer relic.
- **Fusions reached.** Cryomancer 10/10 runs, Stormcaller 9/10, Pyromancer 6/10, Arcanist 6/10.
- **Manual probes (one run each).** P1 (passives-first Pyromancer) died at Gorrak phase 2 with the boss at 2%, a near miss, not a clear dead pick. P2 (frost-only Cryomancer) survived Act II at full HP but needed 144 s for Gorrak, so frost is strong on survival and weak on boss DPS. That matches the batch.

**Where do runs die?**
- Act I: 4 of 30 non-Cryomancer deaths, all during the Gorrak fight.
- Act II: 21 of 30. Median death 5:32–8:55 per cell, mostly 6:30–7:20.
- Act III: 5 of 30, all after 8:00. Top source is `enemy projectile` in 4 of 5, `boss flame ring` in 1.
- Across all 30 non-Cryomancer deaths, the top-1 damage source is `enemy projectile` (19), `War Boar` (4) or `boss flame ring` (4) plus a few others.
- Cryomancer: no resolved run died.

**Are the targets met? (DESIGN.md §13)**
| Target | Measured | Verdict |
|---|---|---|
| L5 at 1:00 | P1 1:02; P2 1:40 | met (passives-first), late (frost-only) |
| L10 at Act I boss | P1 L9 at boss spawn; P2 L10 at 4:39 (mid-boss) | roughly met (P1), late (P2) |
| L18 at Act II's end | Non-Cryomancer Act II median death at L16–18; P2 L18 at 8:27 | met |
| L26+ at final boss | Cryomancer L31–56 at 12–20 min | over, mostly because runs are long |
| Gorrak 30–45 s | Pyro 25/35; Storm 41/93; Arc 35/14; Cryo 133/79; frost probe 144 | met for average Pyro, Storm and Arc; missed for Storm expert, Arcanist expert (too fast at 14 s), and frost |
| Vashkar 45–60 s | Cryo 76/79; Arc 43 (n=1); Storm exp 83.5 (n=2); frost probe 64 | slightly over |
| Aurelith 60–90 s | Cryo 237 (n=4) / 107 (n=3) | over (1.5–4×) |
| Victory run length 10–11 min | Cryo 12:34–20:24 | over |

## Harness caveats
- Bot hands decide dodges. Non-Cryomancer deaths are mostly to projectiles and chargers, which a human who reads telegraphs may avoid. Expert hands did not visibly improve survival, so the bot's ceiling may be the limit, not the game. "Act II wall" is a pressure signal, not proof of unfairness.
- Batch rows use the auto-draft policy, not my picks. "Build" lines describe what the policy drafted.
- Three Cryomancer runs were cut off around 21 minutes. The 7/7 is for resolved runs only. If the censored runs had died, the win rate would drop.
- Shard medians are computed from logged fields with the DESIGN.md §12 formula at tier 0. Only P1 was checked against the end screen.
- Chain figures come from the harness window and may count reactions per target rather than per trigger. Read the Chain runaway as a strong signal to check, not a confirmed bug.
- My manual probes are single runs. P2 was abandoned at Act III start, so it gives no Aurelith or final-boss data.
- Boss TTK samples are small (n = 2–5). The horde-density link to Gorrak TTK comes from two runs (P2 with 290 foes alive, P1 with 57), not a controlled test.
- Screenshots: `dev/shots/pt-dex-mono-frost-act1.png` (full frame, Act I, about 300 foes) and `dev/shots/pt-dex-mono-frost-vashkar.png` (Vashkar close-up). In the close-up the boss reads pale against the ochre ground, which may be a Chill overlay. Not confirmed.
- No audio. No HUD text was captured for the batch runs.

## Findings (machine-readable)
```json
[
{ "area": "meta", "type": "bug", "severity": "major", "finding": "Chain counter is effectively unbounded in dense hordes and feeds the shard formula uncapped (floor(maxChain/10)). Cryomancer shard median 754 vs 140-231 for other classes, with 46% from Chain.", "evidence": "Batch A2/B2 (Cryomancer): maxChain 2133-7040 in victories and 15079 in a run still alive at 21:26; maxChain is 40-92% of total reactions in Cryomancer runs; shard medians computed with the DESIGN s12 formula.", "recommendation": "Cap the Chain term in the shard formula or count chain resets per run; confirm the 2.5 s reset fires under continuous reactions." },
{ "area": "balance", "type": "issue", "severity": "major", "finding": "Cryomancer is the only class that wins. 7 of 7 resolved runs won; 0 of 30 other runs won; 21 of 30 non-Cryomancer deaths in Act II, 5 in Act III.", "evidence": "Batch A (average) and B (expert), 4 classes x 5 runs; 3 Cryomancer runs censored at about 21 min.", "recommendation": "Trim Cryomancer survival (Permafrost armour, Glacier Plate, +30 HP tilt) and/or lower Act II pressure for other classes." },
{ "area": "combat", "type": "issue", "severity": "major", "finding": "Act II is a wall for Pyromancer, Stormcaller and Arcanist. Median death per cell 5:32-8:55, mostly 6:30-7:20. Enemy projectiles are the top damage source in 19 of 30 non-Cryomancer deaths.", "evidence": "Batch A/B death times and topDmgSources; War Boar top-1 in 4 deaths, boss flame ring in 4.", "recommendation": "Reduce Act II ranged damage (emberSpitter, War Boar charge) or delay the Act II roster by about 30 s." },
{ "area": "bosses", "type": "issue", "severity": "major", "finding": "Frost bosses take too long. Cryomancer Gorrak median 133 s (average) and 79 s (expert) vs 30-45 s; Aurelith 237 s and 107 s vs 60-90 s; Vashkar 76-79 s vs 45-60 s. Frost-only probe: Gorrak 144 s.", "evidence": "Batch bossTtk arrays by boss index; probe P2 event 'boss killed: Gorrak in 144s'.", "recommendation": "Raise frost damage to bosses or lower Gorrak/Aurelith HP so frost fights land in target." },
{ "area": "bosses", "type": "issue", "severity": "minor", "finding": "Gorrak fight starts with about 300 foes alive in the frost-only probe (290 at 3:00) vs 57 at the matching moment in the passives probe. Horde density may stretch boss TTK.", "evidence": "PT.play state.enemiesAlive at boss spawn in P1 and P2; two runs only.", "recommendation": "Check whether the 35% boss-phase horde rate applies in Act I; consider clearing or capping the field at boss spawn." },
{ "area": "progression", "type": "issue", "severity": "major", "finding": "Cryomancer runs are too long. Victories 12:34-20:24 (median 18:01 average, 12:55 expert) vs 10-11 min target. Final-boss level L31-56 vs L26 target.", "evidence": "Batch A2/B2 victory times and levels.", "recommendation": "Tune Cryomancer kill speed or the late-game XP curve alongside the Chain fix." },
{ "area": "build-variety", "type": "issue", "severity": "minor", "finding": "Frost-only builds are starved. Nine level-up cards at L2-L3 (including one reroll) had no frost card; Blizzard first appeared at L4 and the Ice Shard rank card at L5. Frost-only runs have zero Chain until arcane crystals fire.", "evidence": "PT.decision() cards in probe P2; state.maxChain 0 through 3:00.", "recommendation": "Guarantee at least one starter-element card by Level 4." },
{ "area": "balance", "type": "issue", "severity": "minor", "finding": "Expert hands do not clearly beat average hands in Act II. Median death: Pyromancer 6:28 vs 5:32, Stormcaller 7:08 vs 8:55, Arcanist 6:49 vs 7:18.", "evidence": "Batch A vs B, n=5 per cell.", "recommendation": "Treat as a harness-ceiling question first; re-run with n >= 8 before changing numbers." },
{ "area": "bug", "type": "bug", "severity": "minor", "finding": "Batch run with an empty damage window: a 12-minute expert Cryomancer victory logs topDmgSources []. Separately, a relic chest decision at Act II boss spawn has no matching event.", "evidence": "Batch B2 row (12:34 victory); probe P2 at 8:26.", "recommendation": "Check the damage-window logger and the chest-source event." },
{ "area": "bosses", "type": "praise", "severity": "minor", "finding": "Beat timings are exact: Elite Surge at act 1:30, Swarm at act 2:15, Boss at act 3:00, to the second.", "evidence": "P2 events: Elite Surge 6:56 (act 2 1:30), Swarm 7:41 (2:15), boss 8:26.", "recommendation": "Keep." },
{ "area": "readability", "type": "praise", "severity": "minor", "finding": "Dense Act I (about 300 foes) stays readable. The Cryomancer, the crystal ring and the front of the horde are separable in the screenshot.", "evidence": "Screenshot dev/shots/pt-dex-mono-frost-act1.png.", "recommendation": "Keep." },
{ "area": "readability", "type": "issue", "severity": "polish", "finding": "The Vashkar close-up reads pale against the ochre ground, which may be a Chill overlay. Not confirmed.", "evidence": "Screenshot dev/shots/pt-dex-mono-frost-vashkar.png (around boss, size 10).", "recommendation": "Check boss tint and contrast under Chill." },
{ "area": "bug", "type": "bug", "severity": "minor", "finding": "Batch runs stop around 21:26 with the run still 'playing' (3 Cryomancer runs). Looks like a harness time cap, not a game event.", "evidence": "Batch A2 row 'playing 21:26'; B2 rows 'playing 20:50' and '21:26'.", "recommendation": "Raise the batch cap or report censoring explicitly." },
{ "area": "combat", "type": "idea", "severity": "minor", "finding": "Gorrak TTK spreads widely across builds: 12-14 s for some fire/arcane runs and 144 s for frost. The spread is too wide for one boss HP value.", "evidence": "Batch A (Pyromancer run 3: 12 s), B (Arcanist run 3: 13 s); probe P2 144 s.", "recommendation": "Look at Cataclysm and Arcane Barrage burst values before changing HP." }
]
```
