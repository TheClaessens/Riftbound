# v5.2 plan: round-3 backlog, Now + Next

Source: `REPORT.md` (this folder), § Backlog. The orchestrator works in the main session; Sonnet and Haiku subagents
implement. Everyone shares one working tree, and **every file has exactly one owner per wave**. Base: commit `79b24f5`.

## Decisions taken by the orchestrator (the report left them open)
- **Chaos vs focus:** take the middle path. Keep the duel readable, add **phase-scripted fodder waves** (small, never
  during a Break Check), and let the chain live on through them.
- **Sustain:** earned, but generous:
  - fodder orbs at 8%;
  - a broken Break Check drops an orb 30% of the time;
  - each phase gate tops you up by 12% of max HP.
- **Stagger: lean toward skill.** Perfect Dodge 10 → **20**, Rift Crystal blast 10 → **20**, reaction fatigue K 4 → **3**.
  Status pressure stays. These are tunable constants in `core.js` `POISE` / `FATIGUE_K`; flag in the changelog.
- **Fight length:** each phase has a minimum duration. The HP gate holds (as `hpFloor` does now) until the phase has run
  `minPhase[phase]` seconds of fight time. Values per boss:
  - Gorrak `[18, 18]`;
  - Vashkar `[24, 24]`;
  - Aurelith `[30, 30]`.

## Shared contracts (frozen before wave A, so the waves can run in parallel)
**C1, Fodder waves (core.js, used by the boss scripts).**
- `BossBase.spawnWave({ types: [typeId…], count, ring = 0.92, orbChance = 0.08, xp = true })` spawns plain enemies at the
  arena wall: normal XP, no goal. It is skipped while a Break Check runs or the boss is Downed.
- It tags each spawn `e.isFodder = true` and `e.orbChance = orbChance`.
- `CFG.fodder = { types, count: [p1, p2, p3], every: s }`. BossBase spawns one wave at each phase start (after the Winded
  window) and then every `every` s of fight time. It never spawns during an intermission, and caps live fodder at
  `count × 2`.
- Counts are small (3–6), so the fight stays readable.

**C2, Orb chance (combat.js).**
- `enemy.orbChance`, when set, replaces the 1% / 25% roll.
- `game.encounter`'s Seal stays XP-only.

**C3, Auto-cast priority (player.js reads, the bosses write).**
- Set `e.autoPriority` (a number; higher wins; 0 or undefined = plain) on adds and objects.
- Reserved values:
  - **3** goal-seeking adds (runners, torchbearers): the scripts set it on spawn;
  - **2** mechanic objects (shielding banners, conduits, ripening pods, the wyvern);
  - **1** fodder;
  - the boss is implicit **0.5**.
- Auto-cast with a boss up picks the highest `autoPriority` target within skill range. It breaks ties by distance and
  ignores untargetable, inert-but-`targetable: false` and dead targets.
- With no boss it falls back to `nearestEnemy` exactly as today.
- Crystals: if a Rift Crystal is within range and the boss is within its blast radius, it ranks **2.5**. Owner: player.js,
  if crystals are enemies or targets. If they are not targetable today, skip this and note it.

**C4, Objective marks (core.js helper, HUD pointer).**
- `BossBase.markObjective(e, { color, tether = true, label })` gives the add or object:
  - a ground ring (`fx` decal, never gold, never `HOSTILE_RED`; use orange `0xff9a3c` or the given colour);
  - a thin tether line to the boss while `tether`.
- It adds `e` to `boss.objectives` (a Set), which the HUD reads for off-screen edge pointers. It is cleaned up on death,
  clear and dispose.
- The HUD (hud.js) draws one edge arrow per off-screen objective in its colour. No arrow when it is on screen.

**C5, Earned heals (core.js, emits; the HUD listens).**
- A broken Break Check spawns a health orb 30% of the time at the boss's feet, offset toward the player.
- `_endIntermission`:
  - heals 12% max HP;
  - emits `bossGateHeal { amount }`;
  - refills **all** dash charges at the start of the intermission (not one charge at its end).

**C6, Break Check readability (core.js + hud.js).**
- `_recover` growth is capped: `poise.mult = Math.min(1.5, mult * 1.25)` within a phase.
- The HUD label shows the target as a **percentage of the bar** ("break 60%"), never an absolute number.

**C7, Ring gap lane (core.js RingWave).**
- `ringWave(center, { gap: { angle, width } })` leaves an arc of `width` radians without damage, drawn as a gold
  striped notch (a safe walk-through).
- `gapSpin` rotates it per wave.

## Waves and owners
### Wave A: systems (parallel)
| Agent | Model | Owns | Items |
|---|---|---|---|
| A1 core | Sonnet | `bosses/core.js`, `combat.js`, `encounter.js` | C1 (BossBase side), C2, C4 (helper), C5, C6 (core), C7, minPhase gates, POISE / FATIGUE retune, Rift Mend announce ("Rift Mend: +20% HP, dash refilled") |
| A2 auto-cast | Sonnet | `player.js` | C3 selection; keeps the `noAuto` and held-key behaviour |
| A3 HUD + death | Sonnet | `ui/hud.js`, `ui/hud-fx.js`, `ui/menus.js`, `game.js`, `tutorial.js`, css as needed | C4 pointers, C6 label, gate-heal and orb floaters, death screen "Your bets" (obelisks armed, entry HP %, payout lost) and **this fight's** damage only (snapshot `hurt` at `encounterStart`), one-time tips: phase top-up, Rift Mend |
| A4 obelisks | Haiku | `obelisks.js` | Plain-word cards (drop Windfall / Strain / Heat jargon from player text; "net −2 levels by the boss"; Wrath "boss gets harder: <affix>"; Haste warns below 40% HP), **Act III Haste Bounty → 0** (keep Windfall) |

### Wave B: content (parallel, after A1 lands)
| Agent | Model | Owns | Items |
|---|---|---|---|
| B1 Gorrak | Sonnet | `bosses/gorrak.js` | fodder (goblins), runners `autoPriority 3` + `markObjective`, pods `autoPriority 2` while ripening, King's Wrath rings with a gap lane (`gapSpin`), `minPhase` |
| B2 Vashkar | Sonnet | `bosses/vashkar.js` | fodder (orc raiders), torchbearers priority 3 + mark, banners priority 2 while shielding, intermission lava thinner + one gold safe pocket per Ashfall / Molten Tide, banner DR re-check (single-target build), `minPhase` |
| B3 Aurelith | Sonnet | `bosses/aurelith.js`, `creatures/bosses/aurelith.js` | conduit body + tether + beam core **off gold** (prism violet / white-cyan), conduits priority 2 + mark, wyvern priority 2 + mark, fodder (wisps), Prism Crash at most 22% max HP, `minPhase` |
| B4 gold audit | Haiku | `heroes/stormcaller.js`, storm-crystal ring owner (found by grep), `pickups.js` big-XP gem colour | Recolour every non-safe gold or yellow (#ffc83a family) away from `SAFE_GOLD`; list what changed |

### Wave C: verify and document
- **Orchestrator:** a browser smoke test of each boss (`PT.jump(act, { boss: true })`, auto-cast on and off); verify C1–C7.
- **C1 sims (Haiku):** `runSim` n = 8 **per class** × lanes (none, haste@90, echo, wrath:3), Acts I–II, against the v5.1 baseline
  (`git archive 79b24f5` → `_ab/old/`). Report: kill rate, fight length vs target, deaths, HP at the Seal → end, heals.
- **C2 docs (Haiku):**
  - `design/RAID_PASSES.md` Pass 9 (table like Pass 8);
  - `design/RAID.md` contract additions (C1–C7);
  - DESIGN.md numbers;
  - the changelog entry.
- **Retune** from the sims if fight lengths miss their targets by more than 25%.

## Out of scope (Later)
- CVD hatch/high-contrast;
- hero halo above VFX;
- tips off the play area;
- vocabulary unification;
- obelisk world colours;
- the accessibility panel;
- Glass Sigil;
- mono-element draft depth;
- harness hands' channel weight.
