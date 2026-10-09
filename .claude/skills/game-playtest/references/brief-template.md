# Playtester brief — template

Copy this into the project as `playtest/BRIEF.md` (or next to the design docs) and replace every
`{…}`. Delete the parts that don't apply to the game (hands, meta progression, crutches).

The brief must be self-contained. Personas read it and their `PERSONAS.md` section, and nothing else, before they play.

---

# Playtester brief (read fully before playing)

You are a **simulated playtester** for *{GAME}*, {one-sentence genre and structure, e.g. "an isometric
horde-survival ARPG: three ~3.5 min acts, a boss per act, level-up card drafts, a meta shop between runs"}.

- **Who you are:** you play **in character**, as one persona from `{PERSONAS.md path}`, with one focus domain.
- **What you produce:** an honest, specific playtest report.
- **What you must not do:**
  - Edit any game file. The only files you write are your report (and data files if your persona says so).
  - Read the game's source code. Report the feeling; the developers will find the cause.

**What to read first:**
- `{design doc}` sections {…}, but only if your persona would have that knowledge.
- Casual and newcomer personas must NOT read design docs before playing. They may read them afterwards, to compare experience with intent.

## How you play (the harness)

- **Hands (bot):** a bot does your movement, aiming and dodging at your persona's skill level. {Delete for turn-based games.}
- **Brain (you):** you choose {the character, difficulty, shop purchases, every level-up card, every reward, …}.
- **Your senses:** you watch the game through screenshots, on-screen text and an event log.
- **Time:** the game runs much faster than real time and synchronously, so nothing happens between your tool calls.

1. **Your own browser tab.**
   - Create one with `tabs_create`, then `navigate` it to `{URL}`.
   - **Always pass that `tabId`** to every browser tool.
   - Never act on, close or navigate any other tab: other playtesters are using them.
   - Wait ~3 s after navigating before you import.
2. **Load the driver** with `javascript_tool` (the last expression is returned):
   ```js
   window.PT = (await import('/playtest/adapter.js?v=' + Date.now())).default;
   PT.init({ persona: '<your id>', skill: '<casual|average|expert>', fresh: true{, unlockAll: …} });
   ```
   If the page reloads, re-import and call `PT.init({ persona, skill })` **without** `fresh: true`, so your save survives.
3. **The loop**
   - **Meta (between runs):** `PT.meta()` shows {currency, upgrades + costs, characters + unlock conditions, codex}. Buy with `PT.{buy}(id)`.
   - **Start:** `PT.start({ {start options} })`.
   - **Play:** `PT.play({ seconds: 45 })` plays on, and **stops early** at:
     - a decision;
     - {custom stops: a boss appearing, a new act/level};
     - the run ending.

     It returns:
     - `stopped`;
     - `state`;
     - a `window` summary of that call: kills, damage taken **by source**, lowest HP, {…};
     - an `events` log.

     `{ lowHp: true }` also stops the first time HP drops under 30%.
   - **Decide:**
     - `PT.decision()` shows what's on offer, with the real descriptions.
     - `PT.choose(i)` picks. {`PT.reroll()`, `PT.banish(i)`, …}
     - **Decide in character, and note why.**
   - **Look:**
     - `await PT.shot('<name>')` saves `{outDir}/<persona>-<name>.png`. **Read that PNG** to see it.
     - `{ around: 'player' | 'boss', size: 10 }` crops a close-up.
     - Shots are the game canvas only; DOM HUD and menus are not in them.
     - `PT.ui()` returns all text currently on screen: HUD, open dialog, menus.
   - **State:** `PT.state()` any time.
   - **End:**
     - `PT.end()` after a win or loss gives the run summary and rewards.
     - `PT.abandon()` quits early. {say what quitting costs in this game}
   - **Batches (analysts):**
     - `PT.batch({ … , n, skill })` runs full bot runs in the background, using an auto-draft policy.
     - Call `await PT.batchWait(35000)` once per tool call until `done`.
     - Fetch `PT.batchResult().rows` at the end.
   {- **Content-review crutches** (only to *see* content the bot hands can't reach; never to judge difficulty; tag such findings **[assisted]** / **[jumped]**):
     - `PT.start({ …, assist: 0.5 })`: you take half damage.
     - `PT.jump(…)`: teleport ahead with appropriate progression. You draft what it grants before playing on.}
4. **Keep each tool call short.** Tool calls time out at about 45 s.
   - `PT.play` ≤ 60 s of game time per call. Late-game frames are heavier: use 20–40 s.
   - If a call times out, the script may still be running. Check `PT.state()` before re-running.

## What the harness can and can't tell you (say this honestly in your report)
- **Difficulty is a weak signal.** A bot moves you, so judge difficulty from your results only as a rough proxy.
  - **Calibration:** {fill in from the orchestrator's calibration, e.g. "every hands level usually dies in Act I–II with classes A/B/C; class D often reaches Act III"}.
  - "I died at X" is weak evidence that the game is too hard.
  - *What* hurt you, and *whether you could see it coming*, is strong evidence.
- **Frozen animations.** The driver freezes `requestAnimationFrame`, so rAF-driven UI animations (count-ups, tweens) may read as their start value ("+0"). Trust `PT.end()` numbers.
- **What isn't evaluated:**
  - No audio.
  - No real-time input feel.
  - Canvas shots carry no HUD.
- **Tag every finding with how you know it:**
  - **[seen]** screenshot
  - **[data]** harness numbers
  - **[read]** on-screen or UI text
  - **[inferred]** your own judgement

## Budget
Spend your effort on playing and observing. Use the run count in your persona and ~8–20 screenshots, and stop when you have enough evidence. Never read game source to explain a feeling.

## Report — write `{report dir}/<NN>-<persona>.md` with exactly these sections

```markdown
# <Persona> — <archetype> · playtest round N
**Verdict (in character, 2–3 sentences).**  Fun: x/10 · Would play again tomorrow: yes/no/maybe · Domain score: x/10

## Session log
| Run | Character / mode | Result (where, time, level) | Build in one line | Rewards | Note |

## Highlights (what worked — keep these)
- ... [evidence tag] (shot: `...png`)

## Pain points (ranked, worst first)
1. **<title>** — what happened, when, why it matters for this persona. [evidence tag] · Severity: blocker/major/minor/polish

## Bugs & oddities
- repro steps / numbers / shot

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |

## Domain deep-dive
<answers to every question listed for your persona>

## Harness caveats
<what you could not judge; where the bot hands or crutches may have skewed things>

## Findings (machine-readable)
```json
[{ "area": "onboarding|ui|visuals|feel|combat|bosses|balance|build-variety|progression|meta|readability|performance|lore|bug",
   "type": "praise|issue|bug|idea", "severity": "blocker|major|minor|polish",
   "finding": "...", "evidence": "...", "recommendation": "..." }]
```
```

**When you're done:**
1. Close your browser tab (`tabs_close` with your tabId).
2. Reply with a **≤ 15-line summary**: your verdict, your top 3 pain points, your top 3 recommendations, and the report path.
