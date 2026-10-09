# Crownshard sims: v5.2 (three obelisks) vs v6 (Crownshard + pacts)

- **Builds.** v6 working tree vs `backup/riftbound-v5.2-preshard.zip` extracted to `_ab/old/`, same server, two tabs in parallel.
- **Sample.** 48 runs per build: pyromancer + cryomancer × lanes `none`, `echo`, `wrath:3`, `echo+wrath:2` × 6 reps, `seconds: 600`, `god: 0`, auto-cast bot (`runSim`). 12 runs per cell: differences of 1–2 runs are noise.
- **Lane driver.** v5.2: the bot walks to each obelisk and channels it (4 s per level under a Rift Pull). v6: the bot walks to the shard after 0:50 and calls `sealPact()` once (Answer: 6 foes per new level + 4 s of Rift Pull per level).
- **Health.** 0 errors and 0 fatals in both builds.

## Act I — Gorrak

| Lane | Build | Reach | Kills | Mean s | Median s | In-fight deaths | Lvl at spawn |
|---|---|---|---|---|---|---|---|
| none | v6 | 12 | 11 | 77.5 | 74 | 1 | 10.7 |
| none | v5.2 | 12 | 11 | 79.6 | 75 | 1 | 10.6 |
| echo | v6 | 12 | 12 | 75.7 | 76 | 0 | 10.5 |
| echo | v5.2 | 12 | 11 | 80.9 | 76 | 1 | 10.3 |
| wrath:3 | v6 | 12 | 10 | 89.1 | 75.5 | 2 | 10.6 |
| wrath:3 | v5.2 | 11 | 9 | 94.0 | 88 | 2 | 10.6 |
| echo+wrath:2 | v6 | 11 | 10 | 78.7 | 77 | 1 | 10.5 |
| echo+wrath:2 | v5.2 | 10 | 7 | 89.6 | 87 | 3 | 10.7 |

## Act II — Vashkar (600 s cap: few runs get there)

| Lane | Build | Reach | Kills | Mean s | In-fight deaths | Lvl at spawn |
|---|---|---|---|---|---|---|
| none | v6 | 4 | 3 | 110.7 | 0 | 18.8 |
| none | v5.2 | 6 | 4 | 92.8 | 0 | 19.3 |
| echo | v6 | 6 | 3 | 88.3 | 0 | 18.2 |
| echo | v5.2 | 8 | 2 | 74.5 | 0 | 18.9 |
| wrath:3 | v6 | 5 | 3 | 98.7 | 1 | 18.8 |
| wrath:3 | v5.2 | 6 | 2 | 102.5 | 1 | 19.0 |
| echo+wrath:2 | v6 | 6 | 4 | 88.8 | 0 | 18.8 |
| echo+wrath:2 | v5.2 | 3 | 0 | – | 0 | 19.3 |

Mean pact shards per run: v6 27.3, v5.2 24.6.

## Reading

1. **Default lane unchanged** (Act I 77.5 vs 79.6 s, same kills, same level). The new obstacle and the start position at the shard don't move the balanced path.
2. **Pact lanes are a little kinder to the bot** (Act I echo+wrath:2: 10 kills vs 7). The bot no longer stands still channelling; the Answer arrives while it is free to kite. That is the intended trade (the decision is free, the cost is the horde), but it is cheaper than v5's channel for a bot.
3. **Tuning knob** if humans find sealing free: `ANSWER_PER_LEVEL` (6) and `PULL_PER_LEVEL` (4 s) in `src/game/obelisks.js`. Not changed on n = 12.
