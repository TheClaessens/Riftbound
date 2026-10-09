---
name: game-design
description: Iterative game design workflow — run named design passes (world, run structure, classes, skills, combo systems, enemies, build items, map interactivity, visuals/feel, meta & balance), lock a numeric spec, define module contracts, delegate implementation to subagents, then balance with a simulation bot and do visual QA. Use this skill whenever the user wants to design, redesign, expand, iterate on, or balance a game (or a game feature, class, enemy roster, progression system, boss, economy), asks for "design passes", a GDD / DESIGN.md, game mechanics that reward playstyles, or wants a prototype turned into a tight, polished game — even if they don't say "game design" explicitly.
---

# Game Design

A workflow for taking a game from "works" to "tight": a design that can be explained in one page, where every system rewards a playstyle, every number is written down, and the result is verified by simulation and by looking at it.

It was distilled from building *Riftbound* (this repo): a v0.2 horde-survival prototype went through 10 design passes, a locked v1.0 spec, 10 parallel implementation agents and a simulation-driven tuning loop. The artefacts from that session are in `design/PASSES.md`, `DESIGN.md`, `ARCHITECTURE.md` and `src/dev/sim.js`. They are good worked examples to imitate.

## The loop at a glance

1. **Audit:** play/simulate what exists and grade each area honestly.
2. **Design passes:** one subject per pass, each with critique, decisions and cuts.
3. **Coherence pass:** check every system against the pillars, then lock scope.
4. **Locked spec:** write `DESIGN.md` with real numbers, so implementers never guess.
5. **Contracts:** write `ARCHITECTURE.md` (APIs, events, data shapes, ownership).
6. **Build:** write the spine yourself, then delegate content with exclusive file ownership.
7. **Simulate & tune:** run a bot harness, compare against targets, change knobs, repeat.
8. **Visual QA:** screenshot every act/biome/state, fix readability, re-check.
9. **Log:** append what changed and why to the design log, and update the spec's numbers.

Skip steps that don't apply. A single feature might only need passes 1 and 3 plus a short spec. Don't skip the *order*, though: decisions before numbers, numbers before code, code before tuning.

## 1. Audit first

Before proposing anything, read the code/docs and actually run the game. If you can, drive it with scripts: start a run, fast-forward with a fixed timestep, auto-pick level-ups, then take screenshots. Grade each area in a table (core loop, run structure, player verbs, build variety, enemies, bosses, world, visuals, meta, playstyle reward) with one blunt sentence each. End with a one-line **diagnosis** ("good engine, no chassis"). The passes exist to fix the diagnosis, so if it's vague the passes will be too.

## 2. Design passes

Write them to `design/PASSES.md`. Each pass:

```
## Pass N — <Subject>
**Critique.** What is weak right now, concretely (observed, not imagined).
**Decisions.** Bullets/tables with names, numbers, and the *playstyle each decision rewards*.
**Overrules:** <earlier pass/version decisions this reverses>   (only if any)
**Cut.** What you deliberately are NOT doing, and why.
```

The *cut* line matters as much as the decisions. Scope creep is the main failure mode of multi-pass design, and writing cuts keeps each pass honest. Later passes may overrule earlier ones, so say so explicitly. That is the point of iterating.

Pick subjects that address the diagnosis. The default catalogue (10 passes), with the questions each must answer and the traps we hit, is in **`references/pass-catalog.md`**. Read it before planning passes.

Principles that held up across every pass:
- **Every system must answer "what playstyle does this reward?"** If it can't, cut it or merge it.
- **Give each element/class/faction an identity verb** (e.g. "Arcane = detonator", "Act II enemies resist fire → teaches mixing"). Identity beats stat variety.
- **Add verbs before adding numbers.** A dash with a Perfect Dodge reward did more for "tight gameplay" than any stat card.
- **Introduce 1–2 new mechanics per act/level**, so the player always has something to learn.
- **Telegraph everything dangerous**, and make the telegraph an opportunity (perfect dodge, bait into hazards).
- **Prefer data-driven combinations** (archetype × faction, element × element matrix) over bespoke content, because you get variety cheaply and implementers get a pattern.
- Naming is design: factions, bosses, relics and acts get evocative names plus one flavour line. Lore lives in short text, not cutscenes.

## 3. Coherence pass and scope lock

The last pass re-reads everything as a whole:
- Build a table with columns *System* and *Rewards*. Any row that says "nothing in particular" gets cut.
- List the final cut list in one line.
- Set **balance targets** as numbers (levels by time, boss time-to-kill, survival rates per stage, FPS budget). Simulation tunes toward these later, so without them "balanced" means nothing.

## 4. Locked spec (`DESIGN.md`)

The spec is what implementers build from, so it must contain numbers, not adjectives. Use the template in **`references/spec-template.md`**. Rules of thumb:
- Every skill/enemy/boss/item has its exact values (cooldowns per rank, damage, radius, HP, speed, XP, durations).
- Scaling is written as formulas with a per-stage table.
- Mark the file **LOCKED** and link the passes doc for rationale. Changes after lock go through tuning and are written back into the spec, never left only in code.

## 5. Contracts (`ARCHITECTURE.md`)

When more than one agent or person builds the game, contracts prevent integration hell. Document:
- the central game object (state machine values, members, helper queries, and gotchas such as "query returns a reused array")
- the full **events table** (name → payload)
- the entity contracts (enemy/boss/actor/skill/world/UI method signatures)
- shared helper APIs (FX, damage function)
- a **file map with owners**
- ground rules: performance budget, mesh limits, readability palette (player spells vs enemy shots vs telegraphs use distinct colours), "never create geometry per frame", etc.

## 6. Build: spine first, then delegate

Delegation guidance (what to write yourself, how to split, prompt template, stubs, verification) is in **`references/delegation.md`**. The short version:
- Write the **spine** yourself: game flow, combat/damage, player, progression, data tables, persistence. These touch everything, and coherence matters more than speed here.
- Create **stub files** with the right exports so the game runs before agents finish.
- Give each agent **exclusive files**, the spec sections to implement, the contracts to obey, an explicit "do not edit other files / do not use the browser" rule, and a short final-report format.
- Launch independent agents in parallel. Integrate and test in the browser yourself as reports arrive.

## 7. Simulate & tune

Build a bot harness early, because balance by gut feel lies. The playbook, including the bot design, the metrics to log, the tuning order and every pitfall we hit, is in **`references/balance-playbook.md`**. Key lessons:
- Log per run: levels by time, stage reach times, boss TTK, max concurrent enemies, items gained, **damage taken by source**, perfect dodges and errors.
- Make the bot *human-ish* before trusting it: it collects XP, aims at the boss, orbits the boss at cast range, stays away from the arena edge and dodges when threatened. Otherwise you tune against bot artefacts.
- Tune in this order: density/spawn → XP curve (fit it to targets with cumulative sums) → item economy → boss HP → difficulty spikes from specific damage sources → class outliers.
- Expect to overshoot. Change one or two knobs at a time, re-run all classes, and write each finding and its fix into the design log.

## 8. Visual QA

Screenshot every stage, the menus, every modal, a boss fight, the transition and the end screens. Then look for the classic problems listed in **`references/visual-qa.md`**: ground noise, bloom white-outs, enemies the same value as the ground, a player lost in effects, overlapping banners, giant geometry at the arena edge, stale screenshots from hidden panes. Fix, re-screenshot, and move on.

## 9. Log and hand off

Append a "Post-build: integration playtest log" table to `design/PASSES.md` (finding → change), update the spec's numbers, and tell the user plainly what was verified (and how) and what wasn't (e.g. "not hand-played with mouse/keyboard", "audio not listened to").

## Working style notes

- When the user says "no input from me, you're the orchestrator", don't ask questions. Make decisions, record them in the passes doc, and report at the end. Give short progress updates while long work runs.
- Keep passes **excruciatingly specific**: names, numbers and tables. A pass that reads like a pitch deck has failed.
- Reuse what works. Don't rewrite a good v0 system just because you're redesigning around it.
