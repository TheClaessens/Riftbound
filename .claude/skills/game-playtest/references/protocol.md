# Protocol: launch, verify, synthesise

## Project layout

```
playtest/
  kit/            ← copied from the skill
  adapter.js      ← the per-game adapter (from kit/adapter.template.js)
  PERSONAS.md     ← the panel for this game (from references/personas.md)
  BRIEF.md        ← shared brief + report template (from references/brief-template.md)
  out/            ← screenshots (the server writes PUTs here)
  rounds/
    round-1/
      01-<persona>.md … NN-<persona>.md, *-data.json
      REPORT.md   ← the synthesis
```

If the project already keeps design docs elsewhere (e.g. `design/`), PERSONAS/BRIEF/rounds can live there. Keep `kit/`, `adapter.js` and `out/` together under the served root.

Add a launch config for the server if the session has a preview browser. Use it, not a shell, to start servers.

## Before launch (orchestrator)
1. Freeze the build: zip or tag it, and note the version in the round's REPORT header.
2. Start the kit server. Run the smoke test and calibration (SKILL.md step 2), and put the calibration numbers into BRIEF.md.
3. Close or idle your own tab work. Every persona will create its own tab.

## Launch prompt (one per persona, all in one message, `run_in_background: true`)

```
You are simulated playtester #<NN> "<Name>" (<archetype>) for the browser game <GAME>.
Project folder: <abs path>. The game server is already running at <URL> — never start/stop servers.

1. Read `<BRIEF.md>` completely (instructions, harness API, report template), then section "<NN>. <Name>"
   in `<PERSONAS.md>`. Stay in character. <Design-doc rule for this persona: none before playing / sections X as a wiki.>
2. Your settings: persona id `<id>`, bot skill `<level>`, start URL `<URL>`,
   `PT.init({ persona: '<id>', skill: '<level>', fresh: true<, unlockAll: true> })`.
   Report file: `<rounds/round-N/NN-id.md>`<; data file: …>.
3. Plan: <the persona's concrete play plan: runs, characters/modes, what to screenshot, crutch rules,
   exact batch commands for analysts>.
4. Only write your report<, data> file. Do not edit any other file and don't read game source code.
   Use only your own browser tab (always pass its tabId); close it when done.
Final reply: the ≤15-line summary described in the brief.
```

Pass `model` per persona: Sonnet for judgement personas, Haiku for analysts and ledgers.

## While they run
- Do not poll. Each completion arrives as a notification with the summary.
- Relay each summary to the user in 3–6 lines as it lands.
- Start reading the full reports as they arrive. Note:
  - claims to verify;
  - cross-persona agreements;
  - disagreements.
- Fix harness artefacts in the kit or adapter immediately, so later personas and the next round benefit. Note each fix in the brief's caveats.

## Verification routine (before writing the report)
For each candidate top issue, and every blocker/bug/stuck/impossible claim:
1. **Reproduce in-engine** in your own tab:
   - use `PT.jump`/crutches or the game's own debug hooks;
   - read the relevant object state;
   - call the damage/score function directly with a probe value.
2. **Classify** it:

| Verdict | Meaning | Action |
|---|---|---|
| Real bug | code contradicts intent | cite file:line, give the minimal fix, measure the effect (A/B by patching at runtime) |
| Design flaw | code does what it says; that is the problem | cite the rule/formula, propose a change |
| Harness artefact | the driver or bot caused it | fix the adapter/kit; list it so the team doesn't chase it |
| Bot limitation | a human would not hit this | keep as a directional caveat; propose a harness improvement |
| Unverified | couldn't check in time | list under "worth a quick check" |

Reference-round examples:
- **Real bug:** a "boss stall at fixed %". A support enemy's barrier also applied to bosses, so a direct probe hit dealt 0.
- **Harness artefact:** "+0 rewards" on the end screen. The count-up ran on rAF, which the driver froze.
- **Bot limitation:** "boss off-screen for 45 s". The bot kites the horde instead of chasing the boss.

## Synthesis REPORT template

```markdown
# <GAME> — Simulated Playtest, Round N · Synthesis
**Build:** <version/date> · **Method:** <protocol link> · **Personas:** <link>
**Testers:** N AI personas (<models>), ~X hand-drafted runs + Y batch runs, Z screenshots; top claims verified in-engine.

## 1. Executive summary
<3–6 numbered bullets: the blocker(s) with root cause, the biggest systemic problems, and what is great>

## 2. Scorecard
| Persona | Model | Runs | Fun | Again tomorrow? | Domain score | One-line verdict |
| **Mean** | | | | | | |

## 3. Verified by the orchestrator
| Claim | Verdict (real bug / design flaw / harness artefact / bot limitation) | Evidence (file:line, measurement) |
Not verified, worth a quick check: …

## 4. Top issues (ranked by severity × reach × pillar impact)
| # | Issue | Sev. | Raised by | Evidence | Recommended change | Effort |
Smaller polish: …

## 5. What to keep (consensus praise)

## 6. Design tensions
| Tension | Side A (personas) | Side B (personas) | Suggested resolution |

## 7. Recommended backlog
**Now** (bugs/blockers, small) · **Next** (core clarity & balance) · **Later** (retention, larger)
End "Next" with "re-run the analyst batches (n ≥ 8) to re-baseline".

## 8. Harness caveats & next-round improvements
<bot ceiling and calibration, crutch usage, what was not evaluated (audio, real-time feel), auto-pick usage, cost>

## Appendix — persona reports
```

**Ranking rule.** Score each issue by three factors:
- **Severity:** blocker 4, major 3, minor 2, polish 1.
- **Reach:** the number of personas who raised it independently.
- **Pillar impact:** whether it breaks a stated design pillar.

Verified issues outrank unverified ones at equal score.

**Disagreements are features.** "Casual wants fewer deaths, hardcore wants more teeth" is a design decision. Present it as a tension with a resolution that serves both sides; don't average it away.

## Cost & time (reference round)
- **Agents:** 7 personas, 5 on Sonnet and 2 on Haiku.
- **Tokens:** ~1.7 M subagent tokens in total, ~150–470 k each. The completionist, with the most runs, was the largest.
- **Time:** 8–21 min wall time per persona, run in parallel.
- **Orchestration:** ~1 hour, including writing the driver.

With the kit, a new game mostly costs the adapter (~1–2 h) plus one round.
