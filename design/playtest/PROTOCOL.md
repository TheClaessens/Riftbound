# Simulated playtest protocol

_This project instance follows the repo-local **game-playtest** skill (`.claude/skills/game-playtest/SKILL.md`)._

A repeatable round of AI playtesting. One orchestrator, N persona subagents, one synthesis report.

```
 orchestrator                         persona agents (parallel, Sonnet/Haiku)            orchestrator
 ─────────────                        ─────────────────────────────────────              ─────────────
 1 freeze build (backup zip)    ┌──►  own tab → PT driver → play runs in character  ──┐  5 read reports
 2 harness smoke test           │     decide cards/relics/Sanctum, screenshot, log    │  6 dedupe + cluster
 3 assign personas + domains ───┤     write round-N/<NN>-<persona>.md                 ├─►7 rank (severity × reach)
 4 launch all in one message    └──►  ≤15-line summary back                         ──┘  8 REPORT-round-N.md
```

## Files
| Path | What |
|---|---|
| `playtest/adapter.js` + `playtest/kit/` | The driver (`PT`), built on the repo-local **game-playtest** skill kit (`.claude/skills/game-playtest/`): bot hands (`casual`/`average`/`expert`), decision hooks, event digest, per-persona save sandbox, screenshots, background batches. Keep `playtest/kit/` in sync with the skill's `kit/`. |
| `design/playtest/PERSONAS.md` | The persona roster: archetype, focus domain, bot skill, save profile, model, questions to answer. |
| `design/playtest/BRIEF.md` | The shared playtester brief and the report template (incl. a machine-readable findings block). |
| `design/playtest/round-N/` | One report per persona + `REPORT.md` (the synthesis). Screenshots go to `playtest/out/` (round 1's are in `dev/shots/pt-*`). |

## Running a round
1. **Freeze**: note the build (`backup/` zip or version) in the round's REPORT header so findings can be traced.
2. **Server**: `preview_start { name: 'riftbound-playtest' }` (port 8098; screenshots PUT to `playtest/out/`).
3. **Smoke test** the driver in one tab: `PT.init → PT.start → PT.play → PT.decision → PT.choose → PT.shot`.
4. **Launch** every persona agent in one message (`run_in_background`), each with: persona id + number,
   model (per PERSONAS.md), URL (`http://localhost:8098/` or `/?unlockall`), and the instruction to read
   BRIEF.md + its PERSONAS.md section. Keep ≤ 7 concurrent tabs (the pane has a tab limit).
5. **Wait** for the completion notifications; don't poll the agents.
6. **Verify** the top claims in-engine (real bug / design flaw / harness artefact / bot limitation; see the skill's `references/protocol.md`), then
   **synthesise** (orchestrator): read every report, merge duplicates across personas, rank by
   severity × number of personas × pillar impact, keep persona disagreements explicit (they are design
   tensions, not noise), separate *harness artefacts* from game findings, and write `round-N/REPORT.md`:
   executive summary → scorecard → top issues → per-area findings → design tensions → recommended backlog
   (now / next / later) → harness caveats.
7. **Clean up**: sandboxed saves are `localStorage` keys `pt.<persona>.riftbound.meta.v1` in the 8098 origin only (never the real save).

## Model policy
Personas run on **Sonnet** when they judge screenshots or feel, **Haiku** when the work is numeric or
text-centric with an exact brief. No Opus playtesters; the orchestrator does the synthesis.

## Known limits
- The bot's hands are a proxy for a human. `casual` ≈ notices ~half of threats late, `expert` ≈ notices
  nearly all early and dashes through unavoidable hits. Treat difficulty findings as directional.
- No audio. Canvas screenshots carry no HUD (use `PT.ui()` for HUD text).
- A run is stochastic: one persona's single run is an anecdote; Dex's batches are the numbers.
