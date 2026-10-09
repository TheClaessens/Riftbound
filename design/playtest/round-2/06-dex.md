# Dex — numbers analyst · playtest round 2

**Verdict (in character, 2–3 sentences).** The spreadsheet says the no-obelisk path is the cleanest: 0 of 8 bot deaths inside a boss fight, Gorrak down in 6 of 8. Wrath:3 is the sore spot: it killed 6 of 8 runs inside a boss fight for a mean of 11 obelisk shards, and Vashkar and Aurelith run well past their targets (Vashkar about 2x). I would not call the lanes broken yet, because n is 8 per lane and the Act II and III numbers rest on one or two fights each.

Fun: 5/10 · Would play again tomorrow: maybe · Domain score: 6/10

## Session log

Sims (`runSim`, seconds 800, god 0, 32 runs: 4 lanes x 4 classes x 2 reps). Full per-run table is in the Domain deep-dive.

| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| sim none x8 | pyro, cryo, storm, arc | 7 dead, 1 at cap; mean final act 2.0 | no obelisks | 0 | Gorrak 6/8, Vashkar 2/8, 0 deaths in boss |
| sim haste@90 x8 | same | 7 dead, 1 at cap; mean final act 1.75 | Haste channel at 90 s (6 spawns) | 13.6 mean | Gorrak 5/8, Vashkar 1/8, 3 deaths in boss |
| sim echo x8 | same | 8 dead; mean final act 1.63 | Echo | 10.4 mean | Echo Gorrak 4/8, Echo Vashkar 1/8, 5 deaths in boss |
| sim wrath:3 x8 | same | 8 dead; mean final act 1.38 | Wrath, heat 3 on 6 of 7 spawns | 11.3 mean | Gorrak 3/8, Vashkar 0/8, 6 deaths in boss |
| [jumped] PT pyro, Act I | pyromancer, level 10 | won, 44 s fight | choose(0) every draft | 0 | Gorrak killed 0:46 |
| [jumped] PT cryo, Act I | cryomancer, level 10 | won, 119 s fight | choose(0) every draft | 0 | Gorrak killed 2:02 |
| [jumped] PT pyro, Act II | pyromancer, level 18 | died 64 s into the Vashkar fight (1:06) | choose(0) every draft | 0 | banner pulse 44 dmg |
| [jumped] PT cryo, Act II | cryomancer, level 18 | won, 156 s fight | choose(0) every draft | 0 | Vashkar killed 2:38 |
| [jumped] PT pyro, Act III | pyromancer, level 26 | died 82 s into the Aurelith fight (1:24) | choose(0) every draft | 0 | prism beam 132 dmg |
| [jumped] PT cryo, Act III | cryomancer, level 26 | won, 134 s fight | choose(0) every draft | 0 | Aurelith killed 4:25 |

Note: the first two PT loop attempts ended on the level-up screen because my own loop treated `levelup` as an end state. They are discarded; only the corrected 6-run batch is reported.

## Highlights (what worked — keep these)
- The no-obelisk lane is the cleanest result in the set: 0 of 8 deaths inside a boss fight, and 6 of 8 Gorrak kills at a mean spawn level of 10.7. [data] (sim none)
- Haste costs about 2.5 levels at Gorrak, inside the 2–4 target: Gorrak spawns at a mean level of 8.2 with Haste against 10.7 on the timer. The lane pays a mean of 13.6 obelisk shards with 5 of 8 Gorrak kills. [data] (sim haste)
- Boss fights have a readable 3-phase rhythm in the event log: two intermissions per won fight, break checks at about 0:13–0:53, and a DOWNED window after each stagger. Every won fight logged exactly two intermissions, one per phase change. [read] (PT event log)
- Gorrak's damage is spread across three named moves (backhand, King's Wrath, club slam) rather than one spike. [data] (PT dmgBy)

## Pain points (ranked, worst first)
1. **Wrath:3 is a boss-death trap for little pay.** 6 of 8 runs died inside a boss fight (4 in Gorrak, 2 in Vashkar); 3 of 8 killed Gorrak; 0 of 8 killed Vashkar. Mean obelisk shards 11.3, against 13.6 for Haste with fewer deaths. [data] · Severity: major
2. **Vashkar runs about 2x its target.** Target 80–100 s. Sim Vashkar kills averaged 197 s (n=2 default, 208 s n=1 Haste, 222 s n=1 Echo Vashkar). The jumped cryomancer win took 156 s. [data][jumped] · Severity: major
3. **Aurelith is over target and dominated by one move.** Target 100–120 s. The jumped cryomancer win took 134 s; the pyromancer died 82 s into the fight. `Aurelith: prism beam` did 164 damage across the two fights (132 of it in the pyromancer's death). No sim run reached the Act III boss, so this is one jumped fight per class. [data][jumped] · Severity: major
4. **Echo lane deaths.** 5 of 8 runs died inside a boss fight. Echo of Gorrak kills averaged 93 s (n=4, range 65–120 s). Echo pays 15 shards for a kill, 38 when both echoes die. Per run the lane pays less than Haste (10.4 against 13.6 mean). [data] · Severity: major
5. **Gorrak is a little long.** Default mean 79 s (median 77) against a 60–75 target. Haste's Gorrak kills averaged 94 s (median 87). Jumped PT fights ranged from 44 s to 119 s, a wide spread. [data][jumped] · Severity: minor
6. **Sim damage is named by boss id, not by move.** `dmgBy` in sim output reads `hollowWarden` or `vashkar`, so I cannot say which Gorrak or Vashkar move hurt in the sim lanes. [data] · Severity: minor (tooling)

## Bugs & oddities
- `window.dmgBy` is undefined on the page after `PT.init`. The per-move damage is in the `window` summary of each `PT.play` result (`r.window.dmgBy`), keyed as `"Gorrak: backhand"`. The ROUND text says `window.dmgBy`; the actual location differs. Repro: `PT.start({ classId: 'cryomancer' }); PT.jump(1, { boss: true }); typeof window.dmgBy` returns `"undefined"`.
- Hit counts per move are not exposed by the harness. Only damage totals are. The "hits per fight" column I was asked for cannot be filled from the data.
- Sim runs in a hidden browser pane stall between tool calls. The batch finished only after I fronted the tab and kept a blocking JS poll running.
- Browser tab cap: opening my tab failed for about 10 minutes because the Browser pane was at its tab cap (9 tabs). I waited with background sleeps and retried. I did not touch other tabs.
- The `levelup` screen is reported as a non-playing screen by `PT.state().screen`. A naive loop that stops on any non-`playing` screen ends at the first level-up.
- Sim run `#4` (none, cryomancer) and run `#12` (Haste, cryomancer) were still `playing` at the 800 s cap, at act 3. These are censored, not deaths.

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Cut Vashkar's effective HP, or raise stagger gain from reactions in phase 1–2, so a fight lands near 100 s | Pain 2 | Vashkar fights move from about 200 s toward 100 s; Echo/Wrath Vashkar kills become reachable | M |
| 2 | Reduce Aurelith prism beam damage or cadence, or shorten intermissions, to bring the fight to 100–120 s | Pain 3 | Fewer deaths to one beam; fight length in band | M |
| 3 | Lower Wrath's per-heat affix stacking at heat 3, or raise its shard payout to match its death rate | Pain 1 | Wrath deaths from 6/8 toward Haste's 3/8; mean shard value rises to match risk | S |
| 4 | Make Echo's +10% damage-taken shorter or lighter, or move its payout before the echo fight | Pain 4 | Echo deaths from 5/8 toward Haste's level | S |
| 5 | Trim Gorrak HP about 10% | Pain 5 | Gorrak mean from 79 s toward 70 s | S |
| 6 | Expose hit counts and move names on `window.dmgBy` (and in sim `dmgBy`) | Pain 6, bugs | Future numeric audits can rank moves by hits per fight | S |

## Domain deep-dive

### Lane table (n = 8 per lane; deaths and boss kills counted per run)

| Lane | Final act (mean, 1-based) | Gorrak killed | Gorrak TTK mean (median) | Vashkar / Echo-Vashkar killed | Deaths inside a boss fight | Gorrak spawn level (mean) | Obelisk shards (mean) |
|---|---|---|---|---|---|---|---|
| none (no obelisks) | 2.0 | 6/8 | 79 s (77) | 2/8 — TTK 178, 215 s (n=2) | 0/8 | 10.7 | 0 (no obelisks) |
| haste@90 | 1.75 | 5/8 (+1 at timer spawn) | 94 s (87) | 1/8 — TTK 208 s | 3/8 | 8.2 (6 Haste spawns) | 13.6 |
| echo | 1.63 | Echo of Gorrak 4/8 | 93 s (94) | Echo of Vashkar 1/8 — TTK 222 s | 5/8 | 11.0 | 10.4 |
| wrath:3 | 1.38 | 3/8 | 85 s (83) | 0/8 | 6/8 | 10.6 | 11.3 |
| all-in | not run this round (not in the assignment) | — | — | — | — | — | — |

Survival rule of thumb from this table: deaths inside boss fights rise with obelisk count and Wrath heat; Haste's cost in spawn level is modest.

### Per-boss table against targets (ROUND.md)

| Boss | Target TTK | Sim lanes (kills, mean TTK) | Jumped PT fights (n) | Read |
|---|---|---|---|---|
| Gorrak (Act I) | 60–75 s | none 79 s (6); Haste 94 s (5); Wrath 85 s (3); Echo 93 s (4) | cryo won 119 s; pyro won 44 s (n=2, mean 82 s) | Slightly over in the sim lanes; very wide spread in PT |
| Vashkar (Act II) | 80–100 s | none 197 s (2); Haste 208 s (1); Echo 222 s (1) | cryo won 156 s; pyro died at 64 s (n=2) | About 2x target; biggest gap in the set |
| Aurelith (Act III) | 100–120 s | no sim run reached the Act III boss | cryo won 134 s; pyro died at 82 s (n=2) | Over target; one jumped win only |

### Top 5 boss moves by damage taken (6 jumped PT fights, `PT.play` window summary)

| Rank | Move | Boss | Total dmg | Per fight (fights that include it) | Hits per fight |
|---|---|---|---|---|---|
| 1 | prism beam | Aurelith | 164 (132 pyro death, 32 cryo win) | 82 (n=2) | not exposed |
| 2 | King's Wrath | Gorrak | 66 (30 pyro, 36 cryo) | 33 (n=2) | not exposed |
| 3 | backhand | Gorrak | 53 (27 pyro, 26 cryo) | 26.5 (n=2) | not exposed |
| 4 | banner pulse | Vashkar | 52.7 (44 pyro, 8.7 cryo) | 26.4 (n=2) | not exposed |
| 5 | tempest | Aurelith | 33 (pyro only) | 16.5 (n=2) | not exposed |

Other moves seen: Vashkar banner charge 27 (pyro), lava trail 22 (pyro), lava 14.1 (both), axe sweep 18 (cryo); Gorrak club slam 27 (pyro); Aurelith prism crash 16 and prism quadrant 16 (cryo).

The pyromancer took most of the damage in both deaths. Its banner pulse and prism beam totals are roughly 5x and 4x the cryomancer's in the same boss. That pattern points to positioning and shelter, not to a fixed move value.

### Per-run sim table (32 runs)

| # | Lane | Class / rep | Result | Final act | Level | Gorrak TTK | Vashkar TTK | Died in boss | Shards | Top dmg by source |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | none | pyro 0 | dead | A2 | 13 | 61 | — | no | 0 | EnemyBullet 221, hazard 66, hollowWarden 55 |
| 2 | none | pyro 1 | dead | A1 | 9 | — | — | no | 0 | brute 93, EnemyBullet 72, imp 8 |
| 3 | none | cryo 0 | dead | A3 | 22 | 100 | 178 | no | 0 | EnemyBullet 431, vashkar 178, wraith 101 |
| 4 | none | cryo 1 | playing (cap) | A3 | 22 | 108 | 215 | no | 0 | EnemyBullet 116, vashkar 61, hazard 56 |
| 5 | none | storm 0 | dead | A2 | 11 | 78 | — | no | 0 | EnemyBullet 133, hollowWarden 55, hazard 44 |
| 6 | none | storm 1 | dead | A2 | 19 | 76 | — | no | 0 | EnemyBullet 251, hazard 88, hollowWarden 45 |
| 7 | none | arc 0 | dead | A2 | 12 | 52 | — | no | 0 | EnemyBullet 176, hollowWarden 55, magmaRam 30 |
| 8 | none | arc 1 | dead | A1 | 7 | — | — | no | 0 | bloater 70, brute 44, EnemyBullet 24 |
| 9 | haste@90 | pyro 0 | dead | A1 | 7 | — | — | no | 0 | EnemyBullet 141, husk 7 (no boss reached) |
| 10 | haste@90 | pyro 1 | dead | A2 | 10 | 87 | — | no | 20 | hollowWarden 95, EnemyBullet 90, hazard 44 |
| 11 | haste@90 | cryo 0 | dead | A2 | 15 | 77 | — | yes (Vashkar) | 20 | vashkar 172, hollowWarden 75, magmaRam 63 |
| 12 | haste@90 | cryo 1 | playing (cap) | A3 | 23 | 143 (timer spawn) | 208 | no | 30 | EnemyBullet 256, wraith 146, brute 90 |
| 13 | haste@90 | storm 0 | dead | A2 | 9 | 89 | — | no | 20 | hollowWarden 109, EnemyBullet 56, hazard 22 |
| 14 | haste@90 | storm 1 | dead | A1 | 8 | died in Gorrak | — | yes (Gorrak) | 0 | hollowWarden 111, imp 6 |
| 15 | haste@90 | arc 0 | dead | A1 | 10 | died in Gorrak | — | yes (Gorrak) | 0 | EnemyBullet 94, hollowWarden 60, brute 22 |
| 16 | haste@90 | arc 1 | dead | A2 | 11 | 76 | — | no | 19 | EnemyBullet 85, hollowWarden 68, magmaRam 60 |
| 17 | echo | pyro 0 | dead | A2 | 20 | Echo 65 | — | yes (Vashkar) | 15 | EnemyBullet 261, hollowWarden 135, hazard 88 |
| 18 | echo | pyro 1 | dead | A1 | 12 | no kill | — | yes (Echo) | 0 | hollowWarden 105, EnemyBullet 35, husk 15 |
| 19 | echo | cryo 0 | dead | A3 | 19 | Echo 120 | Echo 222 | no | 38 | vashkar 241, EnemyBullet 237, hollowWarden 123 |
| 20 | echo | cryo 1 | dead | A2 | 19 | Echo 120 | — | yes (Vashkar) | 15 | vashkar 105, EnemyBullet 89, hollowWarden 82 |
| 21 | echo | storm 0 | dead | A1 | 10 | — | — | no | 0 | EnemyBullet 99, imp 24, husk 21 |
| 22 | echo | storm 1 | dead | A1 | 11 | no kill | — | yes (Echo) | 0 | hollowWarden 105, EnemyBullet 74, brute 23 |
| 23 | echo | arc 0 | dead | A1 | 7 | — | — | no | 0 | husk 58, imp 49, bloater 24 |
| 24 | echo | arc 1 | dead | A2 | 18 | Echo 68 | — | yes (Vashkar) | 15 | hazard 220, hollowWarden 124, vashkar 99 |
| 25 | wrath:3 | pyro 0 | dead | A1 | 12 | no kill | — | yes (Gorrak) | 0 | EnemyBullet 162, hollowWarden 57, imp 14 |
| 26 | wrath:3 | pyro 1 | dead | A2 | 12 | 60 | — | no | 30 | EnemyBullet 208, hollowWarden 90, hazard 66 |
| 27 | wrath:3 | cryo 0 | dead | A2 | 20 | 83 | — | yes (Vashkar) | 30 | vashkar 253, EnemyBullet 72, hollowWarden 72 |
| 28 | wrath:3 | cryo 1 | dead | A2 | 18 | 113 | — | yes (Vashkar) | 30 | hollowWarden 123, vashkar 120, EnemyBullet 107 |
| 29 | wrath:3 | storm 0 | dead | A1 | 7 | — | — | no | 0 | EnemyBullet 171, imp 7, mite 5 |
| 30 | wrath:3 | storm 1 | dead | A1 | 11 | no kill | — | yes (Gorrak) | 0 | hollowWarden 115, EnemyBullet 57, bloater 23 |
| 31 | wrath:3 | arc 0 | dead | A1 | 11 | no kill | — | yes (Gorrak) | 0 | EnemyBullet 133, hollowWarden 77, imp 19 |
| 32 | wrath:3 | arc 1 | dead | A1 | 11 | no kill | — | yes (Gorrak) | 0 | EnemyBullet 85, hollowWarden 75, husk 47 |

### Questions (Dex persona)
- **Which class/skill/relic is over- or under-tuned?** In the default lane both Cryomancer runs reached Act III, while the other three classes reached Act II in 4 of 6 runs and never Act III (the other 2 died in Act I). Its Vashkar kills (156 s jumped) are not out of line with the sim. Pyromancer dies early in Vashkar and Aurelith fights, but that is a [jumped] result from `choose(0)` drafts, not a class verdict.
- **Where do runs die?** Default lane: horde (EnemyBullet, hazard), not bosses. Haste: Gorrak or Vashkar fights (3/8). Echo: mostly inside the echo fights (5/8). Wrath:3: inside the boss fights (6/8). Most damage in sim runs is EnemyBullet (shooter projectiles), not boss moves, but dmgBy names bosses by id only, so I cannot split it further.
- **Are targets met?** Haste's level cost: yes (about 2.5 levels). Gorrak: close (79 s default, 94 s Haste). Vashkar: no (about 2x). Aurelith: no (134 s jumped, one win). All-in: not run.
- **Is a lane a no-brainer or a never-pick?** Wrath:3 is the lane with the most boss deaths and the lowest final act (1.38). Its mean shard value (11.3) is below Haste's (13.6). By these numbers it is a never-pick at heat 3 unless the Wrath Cache and boss relics pay more than the shards show.
- **Do the boss relics and Wrath Cache pay?** Not measured here: the sim does not log boss relics or the Wrath Cache decision.

## Harness caveats
- Sims are bot hands, not humans. A human who learns telegraphs will do better. The calibration note in ROUND.md says expert hands cannot dodge Aurelith's sweeping beams, so the prism beam number is a bot limitation until a human check.
- n is small: 8 per sim lane (2 per class), 1–4 kills per boss per lane, and 1–2 jumped fights per boss per class. Treat the lane percentages as directional. Vashkar and Aurelith rest on very few kills.
- Sim lanes ran 800 s of game time. Two runs (none cryo rep 1, Haste cryo rep 1) were still playing at the cap, at act 3, and are censored rather than dead.
- Obelisk shards are the only shards counted. Meta shards per run are not in the sim, so per-run payout is understated across all lanes.
- The PT boss runs used `PT.jump(act, { boss: true })` with levels 10, 18 and 26, and every draft was `PT.choose(0)`. The builds are arbitrary, not Dex's build. Results are [jumped] and not used for difficulty claims.
- Boss fight length in the PT runs is measured from the "boss appears" event at 0:02 to the "ENCOUNTER WON" event. Death fights are measured from 0:02 to the death screen.
- The TTK in sim output runs from the first spawn of that fight. In Echo runs, the Echo TTK is measured from the original Gorrak spawn, so it is not directly comparable to the default Gorrak TTK. The old raid-sims batch used a different build (before the cone-dodge and combo fixes), so its numbers are not compared here.
- Hit counts per move are not in the harness output. "Hits per fight" is not reported.
- Several runs' `diedInBoss` flags are taken from the sim as-is. In Echo runs the pre-echo Gorrak kill is in `bossTimes`, so I counted the Echo kill separately.
- No audio, and no visual review in this round. Screenshots were not taken; the numbers are the evidence.

## Findings (machine-readable)
```json
[
  {"area": "balance", "type": "issue", "severity": "major", "finding": "Wrath:3 lane is the deadliest obelisk lane: 6/8 runs died inside a boss fight, 3/8 Gorrak kills, 0/8 Vashkar kills; mean obelisk shards 11.3 vs Haste 13.6.", "evidence": "sim wrath:3 n=8, round-2 Dex sim table rows 25-32 [data]", "recommendation": "Lower heat-3 affix stacking or raise Wrath payout so the shard value matches its death rate."},
  {"area": "balance", "type": "issue", "severity": "major", "finding": "Vashkar fights run about 2x the 80-100 s target: sim default mean 197 s (n=2), Haste 208 s (n=1), Echo 222 s (n=1); jumped cryomancer win 156 s.", "evidence": "sim none rows 3-4, haste row 12, echo row 19; PT Act II cryo fight [data][jumped]", "recommendation": "Reduce Vashkar effective HP or raise phase 1-2 stagger gain so a fight lands near 100 s."},
  {"area": "bosses", "type": "issue", "severity": "major", "finding": "Aurelith fight runs over the 100-120 s target and one move dominates damage: prism beam 164 total across two fights (132 in the pyromancer death).", "evidence": "PT Act III cryo win 134 s, pyro death at 82 s; dmgBy 'Aurelith: prism beam' [jumped]", "recommendation": "Reduce prism beam damage or cadence, or shorten intermissions; check the telegraph is readable before the beam hits."},
  {"area": "balance", "type": "issue", "severity": "major", "finding": "Echo lane: 5/8 runs died inside a boss fight; Echo of Gorrak kills average 93 s; echo pays 15 shards per kill (38 when both echoes die).", "evidence": "sim echo rows 17-24 [data]", "recommendation": "Shorten echo fights or move part of the payout to the first kill; re-check the +10% damage-taken rule."},
  {"area": "bosses", "type": "praise", "severity": "minor", "finding": "No-obelisk path: 0/8 deaths inside a boss fight and 6/8 Gorrak kills at a mean spawn level of 10.7.", "evidence": "sim none n=8 [data]", "recommendation": "Keep as the baseline reference for obelisk costs."},
  {"area": "balance", "type": "praise", "severity": "minor", "finding": "Haste costs about 2.5 levels at Gorrak (spawn level 8.2 vs 10.7), inside the 2-4 target, and pays a mean of 13.6 shards.", "evidence": "sim haste vs none spawn levels [data]", "recommendation": "Keep the Haste cost and payout as they are."},
  {"area": "balance", "type": "issue", "severity": "minor", "finding": "Gorrak TTK sits slightly above target: default mean 79 s (median 77) vs 60-75 s; Haste kills 94 s.", "evidence": "sim none and haste Gorrak TTK [data]", "recommendation": "Trim Gorrak HP about 10 percent."},
  {"area": "bug", "type": "bug", "severity": "minor", "finding": "window.dmgBy is undefined on the page; per-move boss damage is only in the PT.play window summary (window.dmgBy key). Hit counts per move are not exposed.", "evidence": "PT.start + PT.jump + typeof window.dmgBy -> 'undefined' [read]", "recommendation": "Expose dmgBy globally with hit counts, and align ROUND.md with the real location."},
  {"area": "bug", "type": "issue", "severity": "minor", "finding": "Sim dmgBy names bosses by id (hollowWarden, vashkar), not by move, so boss-move damage cannot be ranked from sim output.", "evidence": "runSim output dmgBy keys across 32 runs [data]", "recommendation": "Add move-level keys to the sim dmgBy."},
  {"area": "readability", "type": "idea", "severity": "minor", "finding": "Pyromancer deaths in Vashkar and Aurelith fights come after a choose(0) draft; a human draft would be a better test of boss difficulty.", "evidence": "PT runs, jumped, n=2 deaths [jumped]", "recommendation": "Use a fixed reasonable build for boss-move audits."}
]
```
