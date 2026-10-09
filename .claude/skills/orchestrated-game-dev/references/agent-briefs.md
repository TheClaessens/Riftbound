# Subagent brief templates

Subagents start with no context. A brief must stand alone: what, why, which files, which docs, the bar, and how to prove it works. Launch independent agents in a single message so they run concurrently, and run them in the background.

## Research

```
You are a research agent for <game> (<one-line genre + camera + scale>). Do NOT edit any project
files except the one report you write. <Browser rule: e.g. do not use the shared browser.> Use
WebSearch/WebFetch (load via ToolSearch) to research current best practice and write a concrete,
code-ready report.

## Project constraints (hard)
- <runtime/build constraints, library + EXACT version, no-asset rules>
- <camera/scale facts that change the answer (e.g. a 1.8 m character is ~50 px tall)>
- <performance budget (entities on screen, fps, draw calls)>
- <rendering pipeline as it exists today>

## Research questions — answer each with concrete recommendations + code
1. <question>  (ask it to compare options and recommend ONE)
2. ...

## Output
Write to `design/research/NN-<topic>.md`: TL;DR (10–15 lines) → sections per question →
"Drop-in code" appendix, syntax-correct and verified against the exact library version (check the
source tag when unsure). Cite URLs. Final message: a 15-line summary.
```

Good research topics for a visual overhaul: (1) core tech for the hardest system, (2) environment rendering, (3) art-direction bible (per-entity silhouettes, proportions in real units, parts lists, palettes with value contrast vs each background, animation tells, rigs), (4) readability of VFX/UI on the new backgrounds with a specific change list against the actual code.

## Implementation

```
You are a <senior role> on <game> at <path> (<stack, no-build rules>). Quality bar: <the user's words,
e.g. "absolute perfection"> — <what excellent means here, with reference points>.

## Your job
<what to build, mapped to ids/contracts, with the export shape expected by the registry>

## Read first (in full)
1. <contract doc> — authoritative on API.
2. <research/bible sections relevant to this agent>.
3. <core code files + a minimal example + the code that drives this agent's output>.

## Files you own
- <file(s)>. Do not edit any other file. If you need a change in a shared module, describe it in
  your final report instead.

## Requirements
- <budgets (tris/bones/draw calls), conventions, required states/animations/actions, no per-frame allocations>
- <readability constraints: reserved colours, contrast vs background, size vs the player>

## Verification (mandatory, iterate until excellent)
Dev server: <url>. Use the built-in browser tools ONLY in your own tab: create one tab once, then
always pass that tab id; never touch, close or navigate other tabs (other agents use them).
- Viewer: <url with params> at real game scale and close-up, all states, variants (elite/warded), angles.
- In-game: <how to call snap()/harness>, screenshot; check console errors.
- After testing: <cleanup, e.g. remove save key>.
If you find a bug in shared core code, do NOT fix it — report it.

## Final report
Under 40 lines: per item what you built, budget numbers, what you verified and how, open issues,
API problems found.
```

## Follow-up / polish (resume the same agent when possible)

Resuming keeps its context. Be visual and specific:

```
Review feedback on <file>. Do a focused polish pass on <items> (same file ownership and verification rules).
1) <ITEM>: at <zoom/view> it reads as <wrong thing>. Make it unmistakably <right thing>:
   - <concrete shape/proportion/colour changes>
   - <what must stay (budgets, animation contract)>
2) ...
Report back briefly.
```

## Art-director polish agent (end of project)
Give it the list of weakest assets from your review, the files it may edit, the exact contracts other code relies on (bone names, exported points, action names), and ask it to do a final full review pass at play scale and fix anything clearly below the bar.

## Broadcasting a change to running agents
Keep it to a few lines: what changed, whether the API changed, what they should re-check, and where it's documented. Also append it to the contract doc so later agents see it.
