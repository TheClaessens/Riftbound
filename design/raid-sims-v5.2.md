# Raid sims: v5.1 baseline vs v5.2 working tree

## Setup

- **Builds.** v5.2 working tree at `http://localhost:8098/?unlockall`. v5.1 baseline at `http://localhost:8098/_ab/old/index.html?unlockall`. Run sequentially in one browser tab, v5.2 first.
- **Sample.** 128 runs per build: 4 classes x 4 obelisk lanes x 8 reps, `seconds: 900`, `god: 0`.
- **Lanes.** `none` (no obelisks), `haste` (`haste@90`), `echo` (`echo`), `wrath3` (`wrath:3`).
- **Driver.** `src/dev/sim.js` `runSim`, auto-cast bot. Harness: `requestAnimationFrame` frozen; `setTimeout(0)` replaced with MessageChannel yields so hidden-tab throttling does not stall the run.
- **Health.** 0 errors in either build (summed `errors` = 0). No `__err`. v5.2 results: 127 dead, 1 playing at the 900 s cap, 0 victory. v5.1 results: 125 dead, 1 playing at the cap, 2 victory.

### Definitions

- **Reach.** Run had a stake or boss-time entry for the act. Echo-lane stakes only record the echo boss, so reach falls back to `bossTimes`.
- **Kill %.** Non-echo `bossTimes` entry for the act, divided by reach.
- **In-fight deaths.** `diedInBoss` true, reached, not killed.
- **Fight time.** Non-echo `bossTimes[].t` (kills only), reported as mean (median) [min-max].
- **Level / HP.** Mean at boss spawn from the non-echo stake (echo stake as fallback).
- **Shards.** Mean `obeliskShards` per run, all runs in the lane.
- **Targets.** Gorrak (Act I) 60-75 s; Vashkar (Act II) 80-100 s.

## Boss results per lane

Act I, Gorrak (`hollowWarden`)

| Lane | Build | Reach | Kill % | In-fight deaths | Fight s, mean (median) [min-max] | Lvl | HP at spawn |
|---|---|---|---|---|---|---|---|
| none | v5.1 | 30 | 90% (27) | 3 | 64.2 (62) [38-108] | 10.5 | 89.6 |
| none | v5.2 | 29 | 93% (27) | 2 | **87.9 (80) [55-171]** | 10.4 | 94.6 |
| haste | v5.1 | 30 | 73% (22) | 8 | 79.1 (76.5) [45-126] | 8.2 | 86.6 |
| haste | v5.2 | 29 | 86% (25) | 4 | 87.0 (79) [65-167] | 8.2 | 88.1 |
| echo | v5.1 | 30 | 73% (22) | 8 | 73.2 (71) [44-169] | 10.5 | 84.9 |
| echo | v5.2 | 27 | 96% (26) | 1 | 77.8 (76) [59-145] | 10.3 | 95.0 |
| wrath3 | v5.1 | 26 | 58% (15) | 11 | 97.4 (87) [37-247] | 10.3 | 94.9 |
| wrath3 | v5.2 | 26 | 54% (14) | 12 | 96.3 (82.5) [66-166] | 10.5 | 89.7 |

Act II, Vashkar

| Lane | Build | Reach | Kill % | In-fight deaths | Fight s, mean (median) [min-max] | Lvl | HP at spawn |
|---|---|---|---|---|---|---|---|
| none | v5.1 | 11 | 91% (10) | 1 | 97.8 (90.5) [49-158] | 18.6 | 100.6 |
| none | v5.2 | 11 | 100% (11) | 0 | **113.0 (104) [85-172]** | 19.1 | 89.4 |
| haste | v5.1 | 12 | 42% (5) | 7 | 150.0 (146) [63-245] | 15.4 | 81.6 |
| haste | v5.2 | 18 | 67% (12) | 6 | 115.2 (107) [81-159] | 15.4 | 70.3 |
| echo | v5.1 | 7 | 71% (5) | 2 | 129.0 (134) [80-189] | 18.7 | 92.0 |
| echo | v5.2 | 11 | 91% (10) | 1 | 98.8 (94.5) [79-135] | 18.0 | 92.3 |
| wrath3 | v5.1 | 7 | 14% (1) | 6 | 179 (n=1) | 19.0 | 97.3 |
| wrath3 | v5.2 | 5 | 60% (3) | 2 | 140.7 (122) [114-186] | 18.8 | 87.0 |

Vashkar reach rises in v5.2 haste and echo because more runs clear Gorrak. Lane-to-lane Act II comparisons therefore use different populations.

## Obelisk shards (mean per run)

| Lane | v5.1 | v5.2 |
|---|---|---|
| none | 0 | 0 |
| haste | 17.8 | 25.5 |
| echo | 22.3 | 29.8 |
| wrath3 | 23.2 | 26.1 |

## Per class, lane none, fight time s, mean (median) [n]

| Class | Gorrak v5.1 | Gorrak v5.2 | Vashkar v5.1 | Vashkar v5.2 |
|---|---|---|---|---|
| Pyromancer | 58.6 (47) [7] | 67.3 (66) [7] | no reach | no reach |
| Cryomancer | 76.8 (75.5) [8] | **116.1 (109.5) [8]** | 97.9 (90.5) [8] | **122.4 (120.5) [8]** |
| Arcanist | 52.7 (49.5) [6] | 73.2 (76) [5] | 113 [1] | 86.5 (86.5) [2] |
| Stormcaller | 65.5 (60) [6] | 86.7 (86) [7] | 82 [1] | 91 [1] |

Per-class cells hold 1-8 runs. Treat them as directional only.

## What moved

1. **Gorrak (none) got slower.** Mean 64 to 88 s, median 62 to 80 s. This is now above the 60-75 s target. Cryomancer drives most of it (77 to 116 s).
2. **Vashkar (none) got slower.** Mean 98 to 113 s, median 90.5 to 104 s. This is above the 80-100 s target. Kill rate 91% to 100%, in-fight deaths 1 to 0.
3. **Obelisk lanes became easier to win.** Gorrak haste 73 to 86%, echo 73 to 96%. Vashkar haste 42 to 67%, echo 71 to 91%. In-fight deaths fell in haste and echo. Shards per run rose by about +8 (haste), +7.5 (echo), +3 (wrath3).
4. **Wrath3 is flat to slightly worse on Gorrak.** Kill 58 to 54%, deaths 11 to 12. Vashkar wrath3 cells (n=7 to 5) are too small to call.
5. **Victories.** v5.1 had 2 victory runs, v5.2 had 0. One run per build hit the 900 s cap still playing. Read this with the Act II sample sizes in mind.

## Caveats

- Lane-none Act I has 27-29 kills per build, which is usable. Act II cells are often under 12 runs and several are under 5. Treat Act II lane numbers as directional.
- Echo-lane reach comes from `bossTimes` fallback. An initial pass that used stakes alone reported reach 0 for echo; that was a harness-side read problem, corrected before the numbers above were computed.
- The bot is the auto-cast bot in `sim.js`, not a human. Fight-time targets are for human play, so the bot's absolute times may not map one-to-one.

## Retune 1 (Gorrak 12k, Vashkar 21.5k)

Setup: v5.2 working tree after the HP retune (Gorrak 14500 to 12000, Vashkar 24000 to 21500). Fresh tab, same harness and bot. Lanes `none` and `echo` only, 8 reps x 4 classes = 64 runs. 0 errors. One run still playing at the 900 s cap (cryomancer, echo, act 3). The v5.1 and first v5.2 columns are copied from the tables above.

Act I, Gorrak (target 60-75 s)

| Lane | Build | Reach | Kill % | In-fight deaths | Fight s, mean (median) [min-max] | Lvl | HP at spawn |
|---|---|---|---|---|---|---|---|
| none | v5.1 | 30 | 90% (27) | 3 | 64.2 (62) [38-108] | 10.5 | 89.6 |
| none | v5.2 run 1 | 29 | 93% (27) | 2 | 87.9 (80) [55-171] | 10.4 | 94.6 |
| none | v5.2 retune | 29 | 93% (27) | 2 | **75.9 (74) [60-109]** | 10.7 | 92.5 |
| echo | v5.1 | 30 | 73% (22) | 8 | 73.2 (71) [44-169] | 10.5 | 84.9 |
| echo | v5.2 run 1 | 27 | 96% (26) | 1 | 77.8 (76) [59-145] | 10.3 | 95.0 |
| echo | v5.2 retune | 28 | 82% (23) | 5 | 76.2 (75) [57-135] | 10.6 | 85.3 |

Act II, Vashkar (target 80-100 s)

| Lane | Build | Reach | Kill % | In-fight deaths | Fight s, mean (median) [min-max] | Lvl | HP at spawn |
|---|---|---|---|---|---|---|---|
| none | v5.1 | 11 | 91% (10) | 1 | 97.8 (90.5) [49-158] | 18.6 | 100.6 |
| none | v5.2 run 1 | 11 | 100% (11) | 0 | 113.0 (104) [85-172] | 19.1 | 89.4 |
| none | v5.2 retune | 11 | 82% (9) | 2 | **107.8 (109) [86-120]** | 19.2 | 98.6 |
| echo | v5.1 | 7 | 71% (5) | 2 | 129.0 (134) [80-189] | 18.7 | 92.0 |
| echo | v5.2 run 1 | 11 | 91% (10) | 1 | 98.8 (94.5) [79-135] | 18.0 | 92.3 |
| echo | v5.2 retune | 8 | 75% (6) | 2 | 101.0 (97) [88-117] | 19.4 | 78.1 |

Per class, lane none, Gorrak fight time s, mean (median) [n]

| Class | v5.1 | v5.2 run 1 | v5.2 retune |
|---|---|---|---|
| Pyromancer | 58.6 (47) [7] | 67.3 (66) [7] | 70.8 (68.5) [8] |
| Cryomancer | 76.8 (75.5) [8] | 116.1 (109.5) [8] | 86.5 (80.5) [8] |
| Arcanist | 52.7 (49.5) [6] | 73.2 (76) [5] | 73.0 (72.5) [6] |
| Stormcaller | 65.5 (60) [6] | 86.7 (86) [7] | 70.4 (69) [5] |

Shards per run, lane echo: v5.1 22.3, v5.2 run 1 29.8, v5.2 retune 22.8.

What the retune moved

1. Gorrak (none) fight mean fell from 88 to 76 s and median from 80 to 74 s. The mean sits just above the 75 s ceiling, the median is inside the target. Kill rate and deaths match run 1. Cryomancer drove the drop (116 to 87 s).
2. Gorrak (echo) gave back the gain. Kill rate fell from 96% to 82% and in-fight deaths rose from 1 to 5, close to v5.1 (73%, 8 deaths).
3. Vashkar (none) fight mean fell from 113 to 108 s, but the median rose from 104 to 109 s. Both remain above the 80-100 s target. Kill rate fell from 100% to 82%, deaths rose from 0 to 2.
4. Vashkar (echo) kill rate fell from 91% to 75% and mean fight time is flat (99 to 101 s), at the top of the target.
5. Cells hold 5-11 runs. A one-kill swing moves kill % by 9-14 points, so the retune deltas are directional, not conclusive.
