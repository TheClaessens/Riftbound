# Dex — numbers analyst · playtest round 3

**Verdict (in character, 2–3 sentences).** Gorrak lands on target: the sim put him at 66 s mean and my three hand runs at 54, 73 and 77 s, and every hand run reached his Seal at 100% HP. Vashkar is where the HP economy breaks: one 63-damage lava window took a 78-HP cryomancer to 21%, and the only in-fight heals I could find were a regen trickle and one orb. The sim also disagrees with the v5.1 batch on the wrath:3 lane (1/8 vs 6/8 Gorrak kills) and on echo deaths (2/8 vs 5/8), so I would not sign off any lane tuning from these numbers yet.

Fun: 6/10 · Would play again tomorrow: maybe · Domain score: 5/10

Evidence tags: **[data]** sim or PT numbers, **[read]** HUD/event text, **[inferred]** my reading. n = 4 per lane per class in the sim (n = 8 per lane); PT runs are n = 3 (anecdote).

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| PT 1 | Pyromancer / t0, no assist, naive first-offer policy | dead, act 2, 6:57, lv 14 | Cinder Bolt, Fireball, Singularity, Frost Nova; Unstable Core, Pyre Crown, Alchemist's Coil | 160 | Gorrak 73 s; HP 13% at 4:15, act 2 entered at 44/90. HP trace only (no windows captured). [data] |
| PT 2 | Cryomancer / t0, no assist | dead, act 3, 11:01, lv 27 | Ice Shard, Static Field, Singularity, Frostfire Comet; Prism Lens, Overclock, Duelist's Mark, Glass Sigil, Pyre Crown, Second Wind | 251 (411 total) | Gorrak 77 s, Vashkar 58 s. Vashkar took 130 → 78 max HP at landing via Glass Sigil (picked by my policy). [data] [read] |
| PT 3 | Pyromancer / t0, no assist | dead, act 2, 6:15, lv 15 | Blood Pact, Second Wind, Unstable Core | not recorded (run ended in act 2 horde) | Gorrak 54 s harness / 56 s event text ("boss killed: Gorrak in 56s"). Full windows and events captured. [data] [read] |
| Sim | 4 lanes × 2 classes × 4 | 32 runs | see tables below | lane means 0 / 21.3 / 28.3 / 37.6 | Full per-run tables in the deep-dive. [data] |

## Highlights (what worked — keep these)
- **Gorrak's fight length is on target and his Seal is survivable at full HP.** Sim none lane 66 s mean (38–91), PT runs 54 / 73 / 77 s. Seal HP was 100% in all three PT runs (pre-Seal health orbs top up: 1 and 3 pickups in the windows before the Seal in PT 2 and PT 3; PT 1 not captured). [data]
- **Gorrak's attrition is small and readable.** The two fully sampled Gorrak fights took 33 and 37 damage, all from named moves (kings wrath 18 / 37 total, contact 10, timber 5). HP at kill was 84% (cryo) and roughly 63% (pyro, last sample before the kill). [data] [read]
- **Post-kill recovery is real and large.** HP rose from 57 → 84/90 (+27) and 12 → 44/90 (+32, pyro) across the act-1 → act-2 transition, and 109 → 130/130 (cryo, capped). [data]
- **Haste costs about 2 levels at Gorrak**, inside the 2–4 target: 10.3 (none) vs 8.3 (Haste summon). [data]
- **Pickup and boss events are named in the logs** (`dmgBy` names "Gorrak: kings wrath", "Vashkar: lava"), so the sources of damage are readable from the harness. [read]

## Pain points (ranked, worst first)
1. **Vashkar's lava is a single-window spike that a 78-max-HP player cannot absorb.** In PT 2, 63 damage came from "Vashkar: lava" in one 8–10 s window (7:37 → 7:45), taking HP 78 → 16 (21%) before the Break Check. The bot does not dodge (it uses average hands), so the spike is partly a bot artifact, but the size of one hit window is a fairness question for expert players. [data] [read] · Severity: major
2. **Vashkar has almost no in-fight heal.** The 58 s kill ended at 18/78 (23%). Heals inside the fight were a passive trickle of roughly 0.2–0.3 HP/s (16 → 24 over 27 s; 126 → 130 over 21 s in the Gorrak fight), one health orb in the DOWNED phase (7:37–7:45, value hidden by the same window's lava damage), and Pyre Crown's 0.5 HP per burning kill (adds only). Gorrak had no heal in the fight in both fully sampled runs. [data] · Severity: major (confirms the round-2 "in-arena heal" backlog item)
3. **A relic can cut max HP in the middle of a boss fight.** Glass Sigil (+50% damage, −40% max HP, per its offer text) was taken at Vashkar's landing by my first-offer policy. Max HP went 130 → 78 (exactly −40%) and the HUD bar reset with it. The text was visible on the card, but the boss frame gives no warning and the cut lands while the fight is live. [read] [inferred] · Severity: minor (my policy's choice, but a real trap for a player who reads "+50% damage")
4. **The two batches disagree on wrath:3 and echo, so the lane balance is not settled.** Wrath:3 Gorrak kills 1/8 (v5.1) vs 6/8 (this batch); echo deaths in boss 2/8 vs 5/8. Same build and same `runSim` call, with the one harness difference I could identify being the rAF freeze. [data] · Severity: major (for balance decisions, not for play)

## Bugs & oddities
- **wrath:3 and echo batches disagree with v5.1.** Repro: `runSim({ classId: 'cryomancer', seconds: 800, log: false, god: 0, obelisks: ['wrath:3'] })` ×4 on `http://localhost:8098/?unlockall` (no rAF freeze). v5.1 batch: `http://localhost:8097` with `requestAnimationFrame = () => 0`. Gorrak killed 6/8 here vs 1/8 there. [data]
- **`bossTimes.t` and `bosses[].ttk` use different clocks.** For original bosses in the echo lane, `bossTimes.t` is the only fight time; it sits 2–4 s away from the ttk-style value for the same boss in non-echo lanes. I used it as the Gorrak ttk in the echo lane and labelled it. [data]
- **`stakes.haste` has no clear meaning** (values 0 to 80 in the Haste lane). I did not use it.
- **`PT.play` returns `{ error, decision }` instead of throwing when a level-up is pending.** My first loop treated this as "no progress" and spun for ~25 s, logging ~40 million empty rows. The loop needs to check `r.decision` first. [data] (harness)
- **Sim `diedInBoss` does not name the boss.** Boss deaths in the echo lane are inferred from the stake and from `dmgBy`. [data]
- **Two sim runs died before any Seal** (haste cryo #2 at 124 s, wrath pyro #2 at 124 s; both Act 1 with husks / bullets, no stake logged). They are counted as horde deaths, not boss deaths. [data]
- **Aurelith was never reached** in 32 sim runs or 3 PT runs. The 100–120 s target is unmeasured. [data]

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Re-run the wrath:3 and echo lanes with n ≥ 16 per class on the same harness (both rAF frozen and not) before any lane tuning | Pain 4: the batches disagree | Settles whether the lane is hard or the sim is noisy; decides whether wrath is "all-in" or just "unlucky" | S |
| 2 | Look at Vashkar's lava damage per hit and window; check a dodge-timed expert run, and consider capping a single lava window or making its telegraph louder | Pain 1: 63 damage in ~8 s to a 78-max-HP player | Fewer 1-window deaths at the DOWNED phase | M |
| 3 | Add a small in-arena heal (the round-2 backlog item), e.g. a heal after each Break Check or per phase, and show it in the boss frame | Pain 2: Vashkar's fight ends near 20% with almost no heal | Vashkar's HP economy becomes a choice rather than a race | M |
| 4 | When a relic changes max HP, show "HP now → HP after" on the offer and in the HUD, and do not offer max-HP-cut relics at a boss landing unless the boss frame shows it | Pain 3: the 130 → 78 cut landed mid-fight | Fewer surprise losses during the Seal | S |
| 5 | Name the post-kill heal: say what gives the +21 to +32 HP (health orb or kill heal) on the kill card | Highlight: the largest heal in the fight is unlabelled, so balance can't count it | Easier to tune Gorrak's and Vashkar's attrition against the post-kill heal | S |
| 6 | Log per-fight HP at Seal, every 10 s, at kill/death, damage by move and heals with source inside `runSim` (the sim has none of this now) | Harness caveat: HP economy numbers came from three hand runs only | Makes future numbers directly comparable with the hand runs | S |

## Domain deep-dive

### Per-lane summary (sim, n = 8 per lane; pyro / cryo split in brackets)
| Lane | Final act (mean) | Gorrak killed | Gorrak ttk mean (range) | Vashkar killed | Vashkar ttk mean (range) | Echo Gorrak / Echo Vashkar killed | Deaths inside a boss | Level at Gorrak Seal | Level at Vashkar Seal | Shards mean |
|---|---|---|---|---|---|---|---|---|---|---|
| none | 2.38 [1.75 / 3.0] | 7/8 [3 / 4] | 66 s (38–91) [pyro 49, cryo 79] | 4/8 (cryo) | 104 s (78–121) | — | 1/8 | 10.3 | 18.5 | 0 |
| haste@90 | 2.0 [1.75 / 2.25] | 6/8 [3 / 3] | 94 s (66–147) [pyro 77, cryo 111] | 2/8 (cryo) | 115 s (99–130) | — | 2/8 | 8.3 | 15 (Haste summon) | 21.3 [14.8 / 27.8] |
| echo | 2.0 [1.5 / 2.5] | 8/8 originals [4 / 4] | 70 s (36–130) orig (`bossTimes`) | 2/8 originals (cryo) | 102 s (80–123) orig | 6/8 Echo Gorrak, ttk 118 s (65–187); 2/8 Echo Vashkar, ttk 163 s (131–195) | 5/8 | 10.4 | 18 | 28.3 [12.5 / 44] |
| wrath:3 | 1.88 [1.5 / 2.25] | 6/8 [2 / 4] | 96 s (38–180) [pyro 58, cryo 114] | 1/8 (cryo) | 123 s (1 run) | — | 2/8 | 10.7 | 18 | 37.6 [13.3 / 62] |

Act 1 Seal HP% (sim stake snapshot, max HP Pyro 90 / Cryo 130): none 84% (8 runs: 100, 87, 57, 41, 85, 100, 98, 100); haste 95% (7 runs); echo 99% (8); wrath 93% (7). Act 2 Seal HP%: none 62% (4 cryo runs: 99, 90, 33, 26); haste 88% (3); echo 73% (5: 23, 95, 89, 99, 60); wrath 75% (2). [data]

### Per-run sim table (32 runs)
Stakes = the sim's act snapshot (level and current HP / max). "Died in boss" is the sim's `diedInBoss` flag.

**none**
| # | Class | Result | Bosses (ttk, s) | Gorrak stake lv / HP | Shards | Top dmgBy | Died in boss |
|---|---|---|---|---|---|---|---|
| 1 | pyro | dead 320 s, act 2, lv 15 | Gorrak 53 | lv 12 / 90 (100%) | 0 | EnemyBullet 178, hazard 44, hollowWarden 40 | no |
| 2 | pyro | dead 311 s, act 2, lv 12 | Gorrak 57 | lv 11 / 78 (87%) | 0 | EnemyBullet 143, hollowWarden 55 | no |
| 3 | pyro | dead 216 s, act 1, lv 10 | killed in Gorrak | lv 10 / 51 (57%) | 0 | EnemyBullet 84, hollowWarden 68 | yes |
| 4 | pyro | dead 320 s, act 2, lv 13 | Gorrak 38 | lv 10 / 37 (41%) | 0 | EnemyBullet 172, hollowWarden 45 | no |
| 5 | cryo | dead 597 s, act 3, lv 20 | Gorrak 71; Vashkar 121 | lv 10 / 111 (85%); Vashkar lv 19 / 129 (99%) | 0 | EnemyBullet 201, vashkar 79 | no |
| 6 | cryo | dead 679 s, act 3, lv 23 | Gorrak 91; Vashkar 117 | lv 10 / 130 (100%); lv 19 / 117 (90%) | 0 | EnemyBullet 245, wraith 84, vashkar 68 | no |
| 7 | cryo | dead 594 s, act 3, lv 20 | Gorrak 77; Vashkar 78 | lv 10 / 127 (98%); lv 18 / 43 (33%) | 0 | EnemyBullet 119, hazard 65 | no |
| 8 | cryo | dead 579 s, act 3, lv 19 | Gorrak 77; Vashkar 99 | lv 9 / 130 (100%); lv 18 / 34 (26%) | 0 | EnemyBullet 168, hollowWarden 131 | no |

**haste@90** (Haste summoned at 1:30 of each act)
| # | Class | Result | Bosses (ttk, s) | Stake (Haste summon) | Shards | Top dmgBy | Died in boss |
|---|---|---|---|---|---|---|---|
| 1 | pyro | dead 211 s, act 2, lv 9 | Gorrak 66 | lv 8 / 90 | 20 | hollowWarden 68, EnemyBullet 97 | no |
| 2 | pyro | dead 220 s, act 2, lv 9 | Gorrak 74 | lv 9 / 90 | 20 | hollowWarden 65, EnemyBullet 41 | no |
| 3 | pyro | dead 260 s, act 2, lv 9 | Gorrak 92 | lv 8 / 90 | 19 | EnemyBullet 108, hollowWarden 68 | no |
| 4 | pyro | dead 186 s, act 1, lv 9 | died in Gorrak (109 dmg) | lv 9 / 90 | 0 | hollowWarden 109 | yes |
| 5 | cryo | dead 435 s, act 2, lv 15 | Gorrak 147; died in Vashkar | lv 8 / 92; Vashkar lv 15 / 101 | 20 | vashkar 149, hollowWarden 80 | yes |
| 6 | cryo | dead 124 s, act 1, lv 7 | none (no Seal logged) | — | 0 | EnemyBullet 62, husk 53 | no |
| 7 | cryo | dead 522 s, act 3, lv 20 | Gorrak 98; Vashkar 99 | lv 8 / 128; lv 15 / 110 | 45 | EnemyBullet 176, hollowWarden 118, vashkar 88 | no |
| 8 | cryo | dead 482 s, act 3, lv 16 | Gorrak 88; Vashkar 130 | lv 8 / 126; lv 15 / 130 | 46 | EnemyBullet 93, hollowWarden 73 | no |

**echo** (Gorrak "orig" time = `bossTimes.t`)
| # | Class | Result | Bosses | Gorrak stake lv / HP | Shards | Top dmgBy | Died in boss |
|---|---|---|---|---|---|---|---|
| 1 | pyro | dead 356 s, act 2, lv 13 | orig 54; Echo 81 | lv 10 / 90 | 25 | EnemyBullet 264, hollowWarden 124 | no |
| 2 | pyro | dead 450 s, act 2, lv 18 | orig 36; Echo 65 | lv 11 / 90; Vashkar lv 18 / 21 (23%) | 25 | hollowWarden 113, hazard 110 | yes (act 2) |
| 3 | pyro | dead 258 s, act 1, lv 11 | orig 51; died in Echo | lv 11 / 90 | 0 | hollowWarden 151 | yes |
| 4 | pyro | dead 255 s, act 1, lv 10 | orig 50; died in Echo | lv 10 / 90 | 0 | hollowWarden 151 | yes |
| 5 | cryo | dead 643 s, act 3, lv 20 | orig 45; Echo 78; Vashkar 80; Echo Vashkar 131 | lv 11 / 121; Vashkar lv 18 / 123 | 63 | EnemyBullet 186, vashkar 76 | no |
| 6 | cryo | dead 790 s, act 3, lv 22 | orig 82; Echo 120; Vashkar 123; Echo Vashkar 195 | lv 10 / 130; lv 18 / 116 | 63 | EnemyBullet 357, vashkar 186 | no |
| 7 | cryo | dead 604 s, act 2, lv 18 | orig 130; Echo 187; died in Vashkar | lv 10 / 130; Vashkar lv 18 / 129 | 25 | vashkar 100, hollowWarden 94 | yes |
| 8 | cryo | dead 590 s, act 2, lv 18 | orig 111; Echo 177; died in Vashkar | lv 10 / 130; Vashkar lv 18 / 78 (60%) | 25 | EnemyBullet 137, vashkar 78 | yes |

**wrath:3**
| # | Class | Result | Bosses | Gorrak stake lv / HP / heat | Shards | Top dmgBy | Died in boss |
|---|---|---|---|---|---|---|---|
| 1 | pyro | dead 246 s, act 1, lv 11 | died in Gorrak (121 dmg) | lv 11 / 90 / 3 | 0 | EnemyBullet 164, hollowWarden 121 | yes |
| 2 | pyro | dead 124 s, act 1, lv 8 | none (no Seal logged) | — | 0 | EnemyBullet 102, brute 21 | no |
| 3 | pyro | dead 315 s, act 2, lv 11 | Gorrak 38 | lv 11 / 90 / 1 | 8 | EnemyBullet 202, hollowWarden 81 | no |
| 4 | pyro | dead 329 s, act 2, lv 11 | Gorrak 78 | lv 10 / 59 (66%) / 3 | 45 | EnemyBullet 186, hollowWarden 104 | no |
| 5 | cryo | dead 337 s, act 2, lv 12 | Gorrak 80 | lv 11 / 120 (92%) / 3 | 45 | EnemyBullet 127, hollowWarden 105 | no |
| 6 | cryo | dead 747 s, act 3, lv 20 | Gorrak 180; Vashkar 123 | lv 11 / 127 / 3; lv 18 / 129 / 3 | 113 | EnemyBullet 152, hollowWarden 100, vashkar 89 | no |
| 7 | cryo | dead 386 s, act 2, lv 11 | Gorrak 84 | lv 11 / 130 / 3 | 45 | EnemyBullet 182, hollowWarden 74 | no |
| 8 | cryo | dead 534 s, act 2, lv 18 | Gorrak 113; died in Vashkar | lv 10 / 126 / 3; Vashkar lv 18 / 65 (50%) / 2 | 45 | EnemyBullet 193, hollowWarden 141, vashkar 82 | yes |

### Compared with round 2 and the v5.1 batch
| Lane | v5.1 batch (`raid-sims-v5.1.md`): Gorrak killed / ttk / deaths in boss / shards | This batch: Gorrak killed / ttk / deaths in boss / shards |
|---|---|---|
| none | 7/8 / 68 s / 2/8 / 0 | 7/8 / 66 s / 1/8 / 0 |
| haste@90 | 6/8 / 89 s / 2/8 / 22.1 | 6/8 / 94 s / 2/8 / 21.3 |
| echo | 6/8 (+ Echo 6/8) / 101 s / 2/8 / 28.3 | 8/8 orig (+ Echo 6/8) / 70 s orig, 118 s Echo / 5/8 / 28.3 |
| wrath:3 | 1/8 / 83 s / 4/8 / 5.6 | 6/8 / 96 s / 2/8 / 37.6 |

- **Agree:** none, haste and echo shards; the none and haste Gorrak kill rates; haste costs about 2 levels at Gorrak (target 2–4).
- **Disagree:** wrath:3 (kills and shards) and echo deaths in boss. Under the v5.1 lane ranking wrath is the deadliest lane. In this batch it pays the most (37.6) and kills Gorrak 6/8, but it has the lowest final act (1.88), so "all-in riskiest" is not clearly supported here, and no lane is clearly riskiest on deaths (echo 5/8).
- **Round 2 targets:** Gorrak 60–75 s: sim none 66 s (in), echo original 70 s (in), haste 94 s (above), wrath 96 s (above, range 38–180); PT runs 54 / 73 / 77 s (2 of 3 in). Vashkar 80–100 s: none 104 s (just above), echo original 102 s (just above), haste 115 s (above), PT 58 s (below, cryo with Glass Sigil at landing). Aurelith: unmeasured.

### Hand runs: HP economy (3 PT runs, `PT.play` with 10 s steps in the boss window, 20 s otherwise)

**Gorrak (Act 1)**
| Run | Seal (time, HP) | HP through the fight | Kill (time, HP) | Damage in fight, by move | Heals during fight | Post-kill |
|---|---|---|---|---|---|---|
| PT 1 pyro (max 90) | 3:10, 90 (100%) | 4:08 62 (69%); 4:15 12 (13%) | ~4:23 (73 s, HP not sampled) | not captured | not captured | act 2 at 4:28, 44 (49%) |
| PT 2 cryo (max 130) | 3:01, 130 (100%) | 3:32 126; 3:41 129; 3:53 130; 4:02 120; 4:10 106 (82%); 4:19 109 | 4:19 (77 s), 109 (84%) | kings wrath 18, contact 10, timber 5 = 33 | none in fight (magnet pickup only); +3 to +4 regen over ~20 s | act 2 at 4:23, 130 (full) |
| PT 3 pyro (max 90) | 3:01, 90 (100%) | 3:23–3:31 90; 3:40 70 (78%); 3:48 57 (63%) | 3:57 (54–56 s), HP not sampled | kings wrath 37 (22 + 15) | none in fight; one health pickup in the closing window | act 2 at 4:00, 84 (93%); +27 |

**Vashkar (Act 2, PT 2 only)**
| Seal (time, HP) | HP through the fight | Kill (time, HP) | Damage in fight, by move | Heals during fight | Post-kill |
|---|---|---|---|---|---|
| 7:25, 130/130 (100%); Glass Sigil taken at landing → max 78; 7:37 78/78 | 7:45 16 (21%) after 63 lava in ~8 s; 7:55 19; 8:04 22; 8:12 24; 8:22 18 | 8:22 (58 s), 18/78 (23%) | lava 63, meteor 9.4 = 72.4 | one health pickup at 7:37–7:45 (value hidden by the lava window); regen ~0.3 HP/s (16 → 24 over 27 s) | act 3 at 8:27, 43/78 (+25, one health pickup) |

**Answer to "is there any in-fight heal in practice?"** Yes, but thin. Observed in-fight heals: passive regen of roughly 0.2–0.3 HP/s (source not named in any event text I captured); one health orb during Vashkar's DOWNED phase (value not separable); Pyre Crown's 0.5 HP per burning kill (adds only, not observed in a boss window). No heal was observed in the Gorrak fight other than regen in PT 2. The large heals (+21 to +32) come after the kill, not during it.

### Domain questions (round 3, Dex)
- **Lane balance:** I can't rank the lanes with confidence. The sim's two batches disagree on wrath (1/8 vs 6/8 Gorrak kills) and echo (deaths in boss 2/8 vs 5/8), and n = 8 per lane is too small for either to win. Haste is the one lane that agrees on both batches (cost about 2 levels, 6/8 kills).
- **Obelisk payouts:** shards rise with risk in this batch (none 0, haste 21, echo 28, wrath 38), but the wrath lane's mean is carried by its cryo runs (45, 45, 45, 113; pyro 0–45). Not enough data to call it a dominant choice.
- **Boss-fight HP economy:** Gorrak is a low-attrition fight (33–37 damage, full HP at Seal, 63–84% at kill). Vashkar is the sink (72 damage, one 63-damage window, 23% at kill, no real in-fight heal). The round-2 idea of a heal after each Break Check would matter most here.
- **Fight length vs targets:** Gorrak on target (66 s sim, 54–77 s PT); Vashkar at or above target in the sim (104–123 s) but below in PT (58 s), where the Glass Sigil's +50% damage probably shortened the kill. [inferred]
- **Level at Seal:** Gorrak 10–11 in every lane; Vashkar 18 in every lane except haste (15 at the Haste summon).

## Harness caveats
- **The sim is not deterministic** (the v5.1 batch measured the same). My batch's wrath and echo results disagree with v5.1 by more than I'd expect from noise, but I can't rule out that as noise without more runs.
- **The sim bot uses auto-cast** (`sim.js` header: "A kiting bot plays with auto-cast"). The PT hands use manual aim, which always targets the boss. The two are not the same bot, so sim numbers and PT numbers are not directly comparable beyond the broad picture.
- **My rAF is not frozen** for the sim batch; the v5.1 batch froze it. I believe this is the only harness difference I can see, and I did not verify it.
- **The PT runs use a naive first-offer policy** for every level-up and relic (not a player's choice). It picked Glass Sigil and Second Wind, and it picked Fireball, Frost Nova and Singularity by position. Treat PT build numbers as a mechanical test, not a playtest of the build.
- **PT damage numbers come from the bot's hands**, which don't dodge lava or ring waves well (round-2 calibration). The 63-damage lava window is the strongest evidence I have against Vashkar's fairness, and it needs an expert-hands run to confirm.
- **n = 3 for the PT HP economy**, so the heal and regen numbers are anecdotes. HP at kill was not sampled in every run.
- **Aurelith was not reached** in any run, so no Act 3 boss numbers are claimed.
- **Harness mistake:** my first PT loop mishandled a pending level-up (see Bugs). Its output was discarded and PT 1's HP trace came from a second loop.

## Findings (machine-readable)
```json
[
  {"area": "balance", "type": "issue", "severity": "major", "finding": "wrath:3 lane disagrees between the v5.1 batch (Gorrak 1/8) and this batch (6/8, cryo 4/4); echo deaths in boss 2/8 vs 5/8. Lane ranking unsettled.", "evidence": "32-run sim batch, runSim same args, port 8098 without rAF freeze vs v5.1 batch at 8097 with rAF frozen (design/playtest/raid-sims-v5.1.md)", "recommendation": "Re-run wrath:3 and echo with n >= 16 per class on the same harness, with and without rAF freeze, before any lane tuning."},
  {"area": "bosses", "type": "issue", "severity": "major", "finding": "Vashkar's lava took 63 damage in one ~8 s window from 78 max HP (78 -> 16, 21%); the bot does not dodge, so the spike may be partly a bot artifact.", "evidence": "PT run 2 (cryomancer): window 7:37-7:45, dmgBy 'Vashkar: lava' 63; Vashkar kill at 8:22, 18/78", "recommendation": "Check per-hit damage and telegraph with expert hands; consider capping a single window or louder telegraph."},
  {"area": "balance", "type": "issue", "severity": "major", "finding": "Little in-fight healing: a passive trickle of about 0.2-0.3 HP/s; one health orb in Vashkar's DOWNED phase; none seen in Gorrak's fight; Vashkar's 58 s kill ended at 23% HP.", "evidence": "PT run 2 HP trace (3:32-4:19 and 7:45-8:22); PT run 3 Gorrak fight windows with no fight pickups", "recommendation": "Add an in-arena heal (after Break Checks or per phase), shown in the boss frame."},
  {"area": "readability", "type": "issue", "severity": "minor", "finding": "A relic offer taken at Vashkar's landing (Glass Sigil, -40% max HP) cut max HP 130 -> 78 mid-fight with no warning in the boss frame.", "evidence": "PT run 2: 7:25 130/130, 7:37 78/78; relic text 'Glass Sigil: +50% damage, -40% max HP' (decision options)", "recommendation": "Show 'HP now -> HP after' on max-HP relic offers, and show the max-HP change in the boss frame."},
  {"area": "bosses", "type": "praise", "severity": "minor", "finding": "Gorrak lands on target (sim 66 s mean; PT 54/73/77 s) and the Seal is entered at full HP in all three hand runs; attrition is 33-37 damage, all from named moves.", "evidence": "sim none lane n=8; PT runs 1-3 HP traces and dmgBy", "recommendation": "Keep Gorrak's attrition as it is; the post-kill heal is the main recovery."},
  {"area": "balance", "type": "idea", "severity": "minor", "finding": "The largest heals (+21 to +32 HP) happen after the Gorrak kill and are not labelled as such in the logs.", "evidence": "PT run 1 12 -> 44, PT run 2 109 -> 130, PT run 3 57 -> 84 across the act transition", "recommendation": "Name the post-kill heal on the kill card and in the event log so balance can count it."},
  {"area": "balance", "type": "idea", "severity": "minor", "finding": "Sim runs lack per-fight HP, heal and damage-by-move logging; HP economy numbers had to come from hand runs.", "evidence": "runSim result keys: no per-fight HP or heal fields", "recommendation": "Add HP at Seal, HP every 10 s, HP at kill or death, damage by move and heals with source to runSim output."},
  {"area": "bug", "type": "bug", "severity": "minor", "finding": "PT.play returns { error, decision } instead of throwing while a level-up is pending; a naive loop spins with no progress.", "evidence": "PT.play with an open decision: keys [error, decision]; my first loop logged ~40 million empty rows in 25 s", "recommendation": "Document or change PT.play to stop with stopped: 'decision' when a decision is open."}
]
```
