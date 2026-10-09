# Raid balance sims: lane x class batch

Harness: `runSim` from `src/dev/sim.js`, `seconds: 800`, `god: 0`, `log: false`, rAF frozen, one browser tab at `http://localhost:8097/?unlockall`. Source files not modified. Each lane has 4 classes x 2 reps (n = 8). Run 1 of pyromancer/default was run once before the batch and kept.

Reading the fields:
- **Final act** is 1-based (A1, A2, A3). `act` in `runSim` output is `game.act + 1`.
- **Kills** come from `stats.bossTimes` (every boss death, including the pre-Echo Gorrak kill in Echo runs). `Gorrak` = boss id `hollowWarden` (A1). `Vashkar` = id `vashkar` (A2). `Echo` = the Echo of Gorrak.
- **TTK** comes from `bossKilled` events, which only fire when a fight ends (the final kill). It is measured from the first spawn of that fight. In Echo runs the A1 TTK is the Echo kill, so it also includes the Rift Mend and the original fight.
- **Boss spawns** come from `stats.stakes` (non-Echo spawns only): act and player level at spawn.
- Shards at start: 45. Shards after the batch: 45 (unchanged).

## 1. Per-run table

| # | Lane | Class | Rep | Result | Final act | Level | Kills (act, boss) | TTK of fight-ending kill | Died in boss | Shards | Top 3 dmgBy | Boss spawns (act, level) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | default | pyromancer | 1 | dead | 1 | 11 | - | - | yes | 0 | hollowWarden 99, EnemyBullet 75, brute 21 | A1 L11 |
| 2 | default | pyromancer | 2 | dead | 1 | 11 | - | - | yes | 0 | hollowWarden 112, EnemyBullet 75, brute 21 | A1 L11 |
| 3 | default | cryomancer | 1 | dead | 3 | 19 | A1 Gorrak, A2 Vashkar | 64, 186 | no | 0 | EnemyBullet 148, wraith 63, vashkar 51 | A1 L11, A2 L18 |
| 4 | default | cryomancer | 2 | dead | 3 | 19 | A1 Gorrak, A2 Vashkar | 88, 149 | no | 0 | EnemyBullet 243, vashkar 119, magmaRam 91 | A1 L11, A2 L18 |
| 5 | default | stormcaller | 1 | dead | 1 | 10 | - | - | yes | 0 | hollowWarden 126, EnemyBullet 12, mite 10 | A1 L10 |
| 6 | default | stormcaller | 2 | dead | 2 | 20 | A1 Gorrak | 94 | yes | 0 | EnemyBullet 170, vashkar 113, hollowWarden 72 | A1 L11, A2 L20 |
| 7 | default | arcanist | 1 | dead | 1 | 11 | - | - | yes | 0 | hollowWarden 105, EnemyBullet 75, imp 12 | A1 L11 |
| 8 | default | arcanist | 2 | dead | 3 | 21 | A1 Gorrak, A2 Vashkar | 40, 91 | no | 0 | EnemyBullet 308, wraith 102, hazard 66 | A1 L11, A2 L21 |
| 9 | haste | pyromancer | 1 | dead | 1 | 8 | - | - | yes | 0 | hollowWarden 99 | A1 L8 |
| 10 | haste | pyromancer | 2 | dead | 1 | 8 | - | - | yes | 0 | hollowWarden 74 | A1 L8 |
| 11 | haste | cryomancer | 1 | dead | 2 | 16 | A1 Gorrak | 100 | yes | 12 | vashkar 262, hollowWarden 119, EnemyBullet 99 | A1 L9, A2 L16 |
| 12 | haste | cryomancer | 2 | dead | 3 | 15 | A1 Gorrak, A2 Vashkar | 116, 195 | no | 48 | vashkar 154, hollowWarden 142, EnemyBullet 63 | A1 L8, A2 L15 |
| 13 | haste | stormcaller | 1 | dead | 2 | 14 | A1 Gorrak | 98 | yes | 20 | vashkar 128, hollowWarden 112, EnemyBullet 68 | A1 L8, A2 L14 |
| 14 | haste | stormcaller | 2 | dead | 3 | 15 | A1 Gorrak, A2 Vashkar | 96, 109 | no | 51 | EnemyBullet 152, wraith 101, hollowWarden 72 | A1 L8, A2 L14 |
| 15 | haste | arcanist | 1 | dead | 1 | 8 | - | - | yes | 0 | hollowWarden 118, husk 26, bloater 26 | A1 L8 |
| 16 | haste | arcanist | 2 | dead | 2 | 14 | A1 Gorrak | 67 | yes | 20 | vashkar 112, EnemyBullet 92, hollowWarden 75 | A1 L8, A2 L14 |
| 17 | echo | pyromancer | 1 | dead | 1 | 10 | - | - | yes | 0 | EnemyBullet 120, husk 31, hollowWarden 27 | A1 L10 |
| 18 | echo | pyromancer | 2 | dead | 1 | 11 | - | - | yes | 0 | hollowWarden 116, EnemyBullet 37, bloater 12 | A1 L11 |
| 19 | echo | cryomancer | 1 | playing (800 s cap) | 2 | 22 | A1 Gorrak (pre-Echo), A1 Echo | Echo 233 | no | 15 | hollowWarden 213, EnemyBullet 107, vashkar 101 | A1 L11, A2 L22 |
| 20 | echo | cryomancer | 2 | dead | 1 | 10 | A1 Gorrak (pre-Echo only) | - | yes | 0 | hollowWarden 167, EnemyBullet 34, imp 33 | A1 L10 |
| 21 | echo | stormcaller | 1 | dead | 1 | 10 | - | - | yes | 0 | hollowWarden 105, EnemyBullet 59, imp 31 | A1 L10 |
| 22 | echo | stormcaller | 2 | dead | 1 | 10 | A1 Gorrak (pre-Echo only) | - | yes | 0 | hollowWarden 107, bloater 24, EnemyBullet 12 | A1 L10 |
| 23 | echo | arcanist | 1 | dead | 1 | 8 | - | - | no | 0 | imp 86, brute 51, EnemyBullet 47 | - |
| 24 | echo | arcanist | 2 | dead | 2 | 11 | A1 Gorrak (pre-Echo), A1 Echo | Echo 56 | no | 15 | EnemyBullet 150, hollowWarden 113, husk 32 | A1 L11 |
| 25 | wrath | pyromancer | 1 | dead | 1 | 10 | - | - | yes | 0 | hollowWarden 79, EnemyBullet 60, brute 22 | A1 L10 |
| 26 | wrath | pyromancer | 2 | dead | 1 | 10 | - | - | yes | 0 | hollowWarden 114, EnemyBullet 48, bloater 11 | A1 L10 |
| 27 | wrath | cryomancer | 1 | dead | 1 | 10 | - | - | yes | 0 | hollowWarden 203, imp 45, husk 36 | A1 L10 |
| 28 | wrath | cryomancer | 2 | dead | 3 | 21 | A1 Gorrak, A2 Vashkar | 85, 118 | no | 75 | EnemyBullet 182, magmaRam 147, vashkar 146 | A1 L10, A2 L20 |
| 29 | wrath | stormcaller | 1 | dead | 2 | 11 | A1 Gorrak | 80 | no | 30 | EnemyBullet 113, hollowWarden 78, hazard 22 | A1 L10 |
| 30 | wrath | stormcaller | 2 | dead | 2 | 11 | A1 Gorrak | 44 | no | 30 | EnemyBullet 119, hollowWarden 87, hazard 44 | A1 L11 |
| 31 | wrath | arcanist | 1 | dead | 1 | 6 | - | - | no | 0 | EnemyBullet 93, husk 34, imp 27 | - |
| 32 | wrath | arcanist | 2 | dead | 1 | 11 | - | - | yes | 0 | hollowWarden 122, EnemyBullet 48, husk 34 | A1 L11 |
| 33 | allin | pyromancer | 1 | dead | 1 | 8 | - | - | yes | 0 | hollowWarden 105, EnemyBullet 37, bloater 15 | A1 L8 |
| 34 | allin | pyromancer | 2 | dead | 1 | 8 | - | - | yes | 0 | hollowWarden 105, husk 27, imp 21 | A1 L7 |
| 35 | allin | cryomancer | 1 | dead | 1 | 8 | - | - | yes | 0 | hollowWarden 152, husk 12, imp 9 | A1 L8 |
| 36 | allin | cryomancer | 2 | dead | 1 | 9 | - | - | yes | 0 | hollowWarden 192, husk 43, imp 30 | A1 L9 |
| 37 | allin | stormcaller | 1 | dead | 1 | 9 | - | - | yes | 0 | hollowWarden 107, EnemyBullet 11, husk 7 | A1 L8 |
| 38 | allin | stormcaller | 2 | dead | 1 | 8 | A1 Gorrak (pre-Echo only) | - | yes | 0 | hollowWarden 156, bloater 26, EnemyBullet 11 | A1 L8 |
| 39 | allin | arcanist | 1 | dead | 2 | 15 | A1 Gorrak (pre-Echo), A1 Echo | Echo 89 | yes | 34 | hollowWarden 162, vashkar 66, EnemyBullet 64 | A1 L8, A2 L15 |
| 40 | allin | arcanist | 2 | dead | 1 | 9 | - | - | yes | 0 | EnemyBullet 79, imp 74, hollowWarden 30 | A1 L9 |

## 2. Per-lane summary

| Lane | n | Victories | Outcomes | Mean final act | Deaths inside boss | Boss kills per run | Mean TTK per act (fight-ending kills) | Mean spawn level A1 / A2 | Mean obelisk shards |
|---|---|---|---|---|---|---|---|---|---|
| default | 8 | 0 | 8 dead | 1.9 | 5/8 (63%) | 0.88 | A1 71.5 (n=4), A2 142 (n=3) | 10.9 (n=8) / 19.3 (n=4) | 0 (no obelisks) |
| haste | 8 | 0 | 8 dead | 1.9 | 6/8 (75%) | 0.88 | A1 95.4 (n=5), A2 152 (n=2) | 8.1 (n=8) / 14.6 (n=5) | 18.9 |
| echo | 8 | 0 | 7 dead, 1 playing at cap | 1.3 | 5/7 (71%) | 0.75 | A1 Echo 144.5 (n=2) | 10.4 (n=7) / 22 (n=1) | 3.8 |
| wrath | 8 | 0 | 8 dead | 1.5 | 4/8 (50%) | 0.50 | A1 69.7 (n=3), A2 118 (n=1) | 10.3 (n=7) / 20 (n=1) | 16.9 |
| allin | 8 | 0 | 8 dead | 1.1 | 8/8 (100%) | 0.38 | A1 Echo 89 (n=1) | 8.1 (n=8) / 15 (n=1) | 4.3 |

Notes: "Boss kills per run" counts every boss death (`bossTimes`). The Echo lane and allin lane A1 TTK is the Echo kill, measured from the original Gorrak spawn (the Echo spawn does not reset the timer), so it is not comparable to the default and haste A1 values.

## 3. Console errors

- `errors` array (sim-internal exceptions): empty in all 40 runs.
- Browser console, error level, after the batch: "No console logs." (none seen).
- Save check: `riftbound.meta.v1` shards 45 before, 45 after.

## 4. Observations (factual)

1. 0 of 40 runs reached victory: 39 ended dead, and 1 (echo, cryomancer, rep 1) was still playing at the 800 s cap, mid-fight with Vashkar at level 22.
2. The 40 runs produced 27 boss deaths: Gorrak 18 (6 of them before an Echo), Vashkar 6, Echo 3.
3. Six runs reached act 3 and none spawned an act-3 boss; all six ended dead.
4. Allin deaths were 8/8 inside a boss fight, against 5/8 default, 6/8 haste, 5/7 echo and 4/8 wrath; allin mean final act was 1.1 against 1.9 default.
5. In the obelisk lanes, the 11 runs with a fight-ending kill all had 15 to 75 shards, while the 3 runs whose only kill was a pre-Echo Gorrak kill (rows 20, 22, 38) had 0.
