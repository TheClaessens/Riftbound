# Raid sims v5.1 - balance batch

Batch: `runSim({ classId, seconds: 800, log: false, god: 0, obelisks })` on the browser pane at `http://localhost:8097/?unlockall` (render loop frozen with `requestAnimationFrame = () => 0`). 4 lanes x 4 classes x 2 reps = 32 runs, all completed. No source files were edited.

Conventions:
- `Act` is the sim's `act` field, 1-based (Act 1 = Gorrak, Act 2 = Vashkar, Act 3 = Aurelith).
- `Bosses killed (ttk)` uses the sim's `bosses[].ttk`. In the Echo lane the original Gorrak kill is in `bossTimes` (not echo) and is shown as "(orig)" with its `t`.
- `dmgBy` ids: `hollowWarden` = Gorrak, `vashkar` = Vashkar.
- The sim's `diedInBoss` flag does not name the boss. Where the boss is named it is inferred from the boss-kill record and the `dmgBy` ids ("inferred").
- Gorrak spawn level is the act-0 stake level from the sim.
- The sim is not deterministic (see observation 5), so n = 8 per lane is the only sample.

## Per-run table (32 runs)

| Lane | Class (rep) | Result (time) | Act | Level | Bosses killed (ttk) | diedInBoss | Shards | Top-3 dmgBy |
|---|---|---|---|---|---|---|---|---|
| none | pyromancer (1) | dead (302 s) | 2 | 10 | Gorrak 61 s | no | 0 | EnemyBullet 140, hollowWarden 82, brute 43 |
| none | pyromancer (2) | dead (301 s) | 2 | 12 | Gorrak 60 s | no | 0 | EnemyBullet 221, hollowWarden 82, hazard 22 |
| none | cryomancer (1) | dead (553 s) | 2 | 18 | Gorrak 114 s | yes (Vashkar, inferred) | 0 | vashkar 131, EnemyBullet 124, magmaRam 96 |
| none | cryomancer (2) | dead (673 s) | 3 | 29 | Gorrak 90 s; Vashkar 92 s | no | 0 | EnemyBullet 223, wraith 125, vashkar 98 |
| none | stormcaller (1) | dead (295 s) | 2 | 10 | Gorrak 63 s | no | 0 | EnemyBullet 91, hollowWarden 72, hazard 44 |
| none | stormcaller (2) | dead (268 s) | 1 | 11 | - | yes (Gorrak, inferred) | 0 | hollowWarden 126, EnemyBullet 46, brute 22 |
| none | arcanist (1) | dead (362 s) | 2 | 15 | Gorrak 46 s | no | 0 | EnemyBullet 212, hazard 88, hollowWarden 68 |
| none | arcanist (2) | dead (388 s) | 2 | 18 | Gorrak 45 s | no | 0 | EnemyBullet 219, hollowWarden 55, hazard 44 |
| haste@90 | pyromancer (1) | dead (216 s) | 1 | 8 | - | yes (Gorrak, inferred) | 0 | hollowWarden 119, EnemyBullet 11, imp 7 |
| haste@90 | pyromancer (2) | dead (261 s) | 2 | 10 | Gorrak 75 s | no | 19 | EnemyBullet 144, hollowWarden 92, hazard 66 |
| haste@90 | cryomancer (1) | dead (666 s) | 3 | 16 | Gorrak 138 s; Vashkar 257 s | no | 49 | EnemyBullet 201, vashkar 164, hollowWarden 49 |
| haste@90 | cryomancer (2) | dead (489 s) | 3 | 16 | Gorrak 97 s; Vashkar 130 s | no | 49 | vashkar 128, wraith 64, EnemyBullet 58 |
| haste@90 | stormcaller (1) | dead (250 s) | 2 | 10 | Gorrak 64 s | no | 21 | EnemyBullet 79, hazard 66, hollowWarden 45 |
| haste@90 | stormcaller (2) | dead (282 s) | 1 | 8 | - | yes (Gorrak, inferred) | 0 | hollowWarden 135, EnemyBullet 11, mite 9 |
| haste@90 | arcanist (1) | dead (302 s) | 2 | 12 | Gorrak 101 s | no | 20 | EnemyBullet 139, hollowWarden 55, hazard 44 |
| haste@90 | arcanist (2) | dead (218 s) | 2 | 9 | Gorrak 61 s | no | 19 | EnemyBullet 109, hollowWarden 58, husk 36 |
| echo | pyromancer (1) | dead (341 s) | 2 | 11 | Gorrak (orig) 53 s; Echo of Gorrak 85 s | no | 25 | EnemyBullet 208, hollowWarden 146, magmaRam 27 |
| echo | pyromancer (2) | dead (384 s) | 2 | 13 | Gorrak (orig) 52 s; Echo of Gorrak 86 s | no | 25 | EnemyBullet 214, hollowWarden 124, obsidianBrute 81 |
| echo | cryomancer (1) | dead (560 s) | 2 | 18 | Gorrak (orig) 78 s; Echo of Gorrak 120 s | yes (Vashkar, inferred) | 25 | EnemyBullet 155, vashkar 126, hazard 90 |
| echo | cryomancer (2) | dead (767 s) | 3 | 19 | Gorrak (orig) 80 s; Vashkar (orig) 128 s; Echo of Gorrak 125 s; Echo of Vashkar 208 s | no | 63 | EnemyBullet 137, vashkar 111, hollowWarden 65 |
| echo | stormcaller (1) | dead (375 s) | 2 | 11 | Gorrak (orig) 75 s; Echo of Gorrak 116 s | no | 25 | hollowWarden 151, EnemyBullet 137, imp 35 |
| echo | stormcaller (2) | dead (130 s) | 1 | 7 | - | no | 0 | brute 43, EnemyBullet 22, bloater 15 |
| echo | arcanist (1) | dead (557 s) | 3 | 19 | Gorrak (orig) 41 s; Vashkar (orig) 64 s; Echo of Gorrak 73 s; Echo of Vashkar 101 s | no | 63 | vashkar 210, EnemyBullet 157, hollowWarden 124 |
| echo | arcanist (2) | dead (217 s) | 1 | 10 | - | yes (Gorrak, inferred) | 0 | hollowWarden 80, imp 71, husk 41 |
| wrath:3 | pyromancer (1) | dead (323 s) | 2 | 11 | Gorrak 83 s | no | 45 | EnemyBullet 156, hollowWarden 90, bloater 39 |
| wrath:3 | pyromancer (2) | dead (225 s) | 1 | 11 | - | yes (Gorrak, inferred) | 0 | EnemyBullet 206, hollowWarden 102, husk 7 |
| wrath:3 | cryomancer (1) | dead (109 s) | 1 | 7 | - | no | 0 | EnemyBullet 92, imp 43, husk 35 |
| wrath:3 | cryomancer (2) | dead (315 s) | 1 | 10 | - | yes (Gorrak, inferred) | 0 | hollowWarden 172, EnemyBullet 41, imp 36 |
| wrath:3 | stormcaller (1) | dead (218 s) | 1 | 10 | - | yes (Gorrak, inferred) | 0 | brute 44, hollowWarden 42, mite 40 |
| wrath:3 | stormcaller (2) | dead (104 s) | 1 | 4 | - | no | 0 | EnemyBullet 86 |
| wrath:3 | arcanist (1) | dead (162 s) | 1 | 9 | - | no | 0 | EnemyBullet 72, brute 58, mite 30 |
| wrath:3 | arcanist (2) | dead (244 s) | 1 | 10 | - | yes (Gorrak, inferred) | 0 | hollowWarden 129, husk 43, EnemyBullet 34 |

## Per-lane summary (n = 8 per lane)

Same columns as the round-2 lane table in `design/playtest/round-2/06-dex.md`.

| Lane | Final act (mean, 1-based) | Gorrak killed | Gorrak TTK mean (median) | Vashkar / Echo-Vashkar killed | Deaths inside a boss fight | Gorrak spawn level (mean) | Obelisk shards (mean) |
|---|---|---|---|---|---|---|---|
| none (no obelisks) | 2.0 | 7/8 | 68.4 s (61) | 1/8 - TTK 92 s | 2/8 | 10.6 | 0 |
| haste@90 | 2.0 | 6/8 | 89.3 s (86) | 2/8 - TTK 257 s, 130 s | 2/8 | 8.1 | 22.1 |
| echo | 2.0 | Echo of Gorrak 6/8 (original Gorrak 6/8) | 100.8 s (101) | Echo of Vashkar 2/8 - TTK 208 s, 101 s | 2/8 | 10.7 | 28.3 |
| wrath:3 | 1.1 | 1/8 | 83 s (83) | 0/8 | 4/8 | 10.2 | 5.6 |

Gorrak TTK n: none 7, haste 6, echo 6 (Echo of Gorrak), wrath 1. Gorrak spawn level n: none 8, haste 8, echo 7, wrath 5 (the other wrath runs died before Gorrak spawned or in Act 1 before a stake was logged).

## Side-by-side with round 2 (`round-2/06-dex.md`)

Round 2 lane is "none" for the default lane. Format: round 2 / v5.1.

| Lane | Final act | Gorrak killed | Gorrak TTK mean (median) | Vashkar killed | Deaths in boss | Gorrak spawn lv | Obelisk shards |
|---|---|---|---|---|---|---|---|
| none | 2.0 / 2.0 | 6/8 / 7/8 | 79 s (77) / 68.4 s (61) | 2/8 / 1/8 | 0/8 / 2/8 | 10.7 / 10.6 | 0 / 0 |
| haste@90 | 1.75 / 2.0 | 5/8 / 6/8 | 94 s (87) / 89.3 s (86) | 1/8 / 2/8 | 3/8 / 2/8 | 8.2 / 8.1 | 13.6 / 22.1 |
| echo | 1.63 / 2.0 | 4/8 / 6/8 | 93 s (94) / 100.8 s (101) | 1/8 / 2/8 | 5/8 / 2/8 | 11.0 / 10.7 | 10.4 / 28.3 |
| wrath:3 | 1.38 / 1.1 | 3/8 / 1/8 | 85 s (83) / 83 s (83) | 0/8 / 0/8 | 6/8 / 4/8 | 10.6 / 10.2 | 11.3 / 5.6 |

Round-2 Echo Gorrak counts are shown in the Gorrak column for the echo lane.

## Errors

- Sim errors: none. The `errors` array was empty in all 32 runs.
- Browser console (`read_console_messages`, onlyErrors): no entries.
- A single smoke run of pyromancer, default lane, was done before the batch to check the output shape. It is not in the table or the summary.

## Observations (factual)

1. Wrath:3 is the lowest lane again: final act mean 1.1, with 7 of 8 runs ending in Act 1 and 1 of 8 killing Gorrak. Round 2 had 3/8 Gorrak kills and 6/8 deaths inside a boss; this batch had 4/8 deaths inside a boss.
2. Haste@90 costs 2.5 levels at the Gorrak spawn (8.1 vs 10.6 with no obelisks), the same cost as round 2. Mean shards rose from 13.6 to 22.1, and the Vashkar kills (257 s, 130 s) both came from cryomancer runs.
3. Echo: 6/8 runs killed the original Gorrak and 6/8 killed Echo of Gorrak (round 2: 4/8). Deaths inside a boss fell from 5/8 to 2/8. Mean shards 28.3 (round 2: 10.4).
4. Vashkar kills in this batch are 92 s (none), 130 s and 257 s (haste), and 208 s and 101 s (Echo). Only the 92 s none kill is inside the 80-100 s target; the 101 s Echo kill is just over.
5. The sim is not deterministic: the same pyromancer default config gave 273 s dead (Gorrak ttk 47) in the smoke run and 302 s dead (Gorrak ttk 61) in the batch. All 32 batch runs ended dead before the 800 s cap, so none were censored (round 2 had 2 censored runs).
