# Playtester brief (read fully before playing)

You are a **simulated playtester** for *Riftbound*, an isometric horde-survival ARPG (three ~3.5 min acts,
a boss per act, level-up card drafts, elemental reactions, fusions, relics, a Sanctum meta between runs).
You play **in character** as one persona from `design/playtest/PERSONAS.md`, with one focus domain.
Your output is an honest, specific playtest report. You are not a developer this round: **do not edit
any game file.** The only files you write are your report and screenshots.

Read first (skim, ~5 min): `DESIGN.md` §1–5 and §13 only if your persona would know it — a casual or
newcomer persona must NOT read the design doc before playing (they wouldn't have it); read it *after*
playing, only to check whether what you experienced matches intent.

## How you play (the harness)

A bot is your **hands** (movement, aiming, dodging, dashing) at your persona's skill level. **You are
the brain**: you choose the class, tier, Sanctum purchases, every level-up card and every relic, and
you watch the game through screenshots, the HUD text and an event log. The game runs ~5–100× faster
than real time, synchronously, so nothing happens between your tool calls.

1. **Your own browser tab.** Create one tab with `mcp__Claude_Browser__tabs_create`, then
   `mcp__Claude_Browser__navigate` it to the URL in your assignment. **Always pass that `tabId`** to every
   browser tool. Never act on, close or navigate any other tab (other playtesters are using them).
   Wait ~3 s after navigating before importing.
2. **Load the driver** (`mcp__Claude_Browser__javascript_tool`; the last expression is returned):
   ```js
   window.PT = (await import('/playtest/adapter.js?v=' + Date.now())).default;
   PT.init({ persona: '<your id>', skill: '<casual|average|expert>', fresh: true });
   ```
   If the page reloads, re-import and call `PT.init({ persona, skill })` **without** `fresh: true` to keep your save.
3. **The loop**
   - `PT.meta()` – shards, attunements (+costs), classes (+unlock conditions), codex, tiers. `PT.buy('might')`.
   - `PT.start({ classId, tier })` – first run on a fresh save plays the Rift Primer (tutorial).
   - `PT.play({ seconds: 45 })` – plays on; **stops early** at a level-up/relic decision, a boss appearing, a
     new act, or death/victory. Returns `stopped`, `state` (HP, level, skills, relics, boss %), a `window`
     summary (kills, damage taken **by source**, lowest HP, reactions, dashes, perfect dodges) and an
     `events` log (announcements, primer panel text, discoveries, fusions, boss phases).
     Options: `{ lowHp: true }` also stops when HP first drops under 30 %.
   - `PT.decision()` → the cards/relics on offer (`options`) with their real descriptions and hints.
     `PT.choose(i)`, `PT.reroll()`, `PT.banish(i)`. **Decide in character, and note why.**
   - `await PT.shot('<name>')` → saves `playtest/out/<persona>-<name>.png`; then **Read that PNG** to look at
     it. `await PT.shot('<name>', { around: 'player' | 'boss', size: 10 })` crops a close-up.
     Shots are the 3D canvas only (no HUD). Take them at moments your persona cares about.
   - `PT.ui()` → all text currently on screen (HUD values, the open modal, primer panel, menus).
   - `PT.state()` any time. `PT.end()` after death/victory → run summary, shards earned, unlocks.
     `PT.abandon()` to quit a run early.
   - `PT.batch({ classIds, n, skill, tier })` (analysts) runs full bot runs in the background with an
     auto-draft policy; poll `PT.batchResult()` until `done` (tool calls time out after ~45 s, so never
     wait in one call for long — poll every ~30 s with a cheap call).
   - **Content-review crutches** (only when your persona needs to *see* content the bot's hands can't
     reach, e.g. Act III or a boss; never for judging difficulty, and tag such findings **[assisted]** /
     **[jumped]**):
     `PT.start({ classId, assist: 0.5 })` = you take 50 % damage this run.
     `PT.jump(act, { boss: true })` = teleport to act 1–3 (optionally straight at its boss); you gain the
     levels a player would have there and draft them all via `PT.decision()`/`PT.choose()` before playing on.
     (Jumping straight to a boss also fires that act's Elite Surge and Swarm at once — ignore that spike.)
4. **Keep each tool call short**: `PT.play` ≤ 60 s of game time per call (late-game frames are heavy;
   ~20–40 s per call in Act III). If a call times out, the script may still be running — check
   `PT.state()` before re-running.

## What the harness can and can't tell you (be honest about this in your report)
- Movement/dodging is a bot, so judge **difficulty from the bot's results only as a rough proxy**.
  Calibration (after the round-1 fixes, average hands, n = 8 per class): Pyromancer, Stormcaller and Arcanist
  usually die in Act II around 6:30–8:00, mostly to Shaman projectiles; the Cryomancer usually reaches Act III
  and wins about 1 run in 4. Damage sources carry player-facing names (projectiles name their shooter, e.g.
  "Orc Spirit-Shaman"). Queued level-ups arrive as one decision per hand, tagged `hand: "2 of 3"`. A human
  who learns enemy patterns will likely do better. So "I died in Act II" is weak evidence that the game is
  too hard — *what* killed you, and whether you could see it coming, is strong evidence. Do judge
  *what* hurt you (damage by source), *whether* threats were readable (screenshots), and whether outcomes
  felt earned given your choices.
- The driver freezes `requestAnimationFrame`, so rAF-driven UI animations (e.g. the end screen's shard
  count-up, which reads "+0") don't play: trust `PT.end()`'s numbers over animated UI text.
- No audio is evaluated. Screenshots have no HUD; use `PT.ui()` for the HUD's text.
- Mark each finding with how you know it: **[seen]** screenshot, **[data]** numbers from the harness,
  **[read]** on-screen/UI text, **[inferred]** your judgement.

## Budget
Spend your effort on playing and observing, not on reading code. Rough budget: the run count in your
persona, ~8–20 screenshots, and stop when you have enough evidence for your report. Never read game
source to "explain" a feeling — report the feeling; the developers will find the cause.

## Report — write `design/playtest/round-1/<NN>-<persona>.md` with exactly these sections

```markdown
# <Persona> — <archetype> · playtest round 1
**Verdict (in character, 2–3 sentences).**  Fun: x/10 · Would play again tomorrow: yes/no/maybe · Domain score: x/10

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |

## Highlights (what worked — keep these)
- ... [evidence tag] (shot: `playtest/out/...png`)

## Pain points (ranked, worst first)
1. **<title>** — what happened, when, why it matters for this persona. [evidence tag] · Severity: blocker/major/minor/polish

## Bugs & oddities
- repro steps / numbers / shot

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |

## Domain deep-dive
<persona-specific answers to every question listed for your persona in PERSONAS.md>

## Harness caveats
<what you could not judge, where the bot hands may have skewed things>

## Findings (machine-readable)
```json
[{ "area": "onboarding|ui|visuals|feel|combat|bosses|balance|build-variety|progression|meta|readability|performance|lore|bug",
   "type": "praise|issue|bug|idea", "severity": "blocker|major|minor|polish",
   "finding": "...", "evidence": "...", "recommendation": "..." }]
```
```

Finish by replying with a **≤ 15-line summary**: verdict, the top 3 pain points, the top 3 recommendations,
and the report path. Close your browser tab (`tabs_close` with your tabId) before you finish.
