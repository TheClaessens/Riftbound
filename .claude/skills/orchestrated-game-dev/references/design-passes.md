# Design passes

Iterating a game design in explicit, named passes forces you to critique before you add, to record what each decision overrules, and to cut. It produces a spec implementers can follow without asking questions.

## Files
- `design/PASSES.md` — the reasoning (audit + passes). Kept as history.
- `DESIGN.md` — the locked spec: only decisions and numbers, organised by system. Implement as written, tune later with a simulation harness.
- `ARCHITECTURE.md` — module contracts: file map with an owner per file, the shared game object, events (name → payload), per-module APIs, ground rules (units, axes, performance budgets, readability palette).

## Pass 0 — Audit
Play (or simulate) the current build with several strategies (e.g. auto-cast bot, kiting bot, standing bot). Then:

| Area | Verdict |
|---|---|
| Core loop | … |
| Structure / pacing | … |
| Player verbs | … |
| Build variety | … |
| Enemies | … |
| Bosses | … |
| World | … |
| Visuals | … |
| Meta | … |
| Rewarding playstyle | … |

End with a one-line **Diagnosis** ("good engine, no chassis").

## Pass template
```
## Pass N — <subject>
**Critique.** What is weak right now, concretely (one short paragraph).
**Decisions.** Bullets/tables with numbers. Name things (enemies, bosses, items get names and a one-line flavour).
**Overrules Pass K / vX:** what earlier decision this replaces, and why.
**Cut.** What you deliberately are NOT doing (goes to the backlog).
```

## A good default sequence (adapt to the genre)
1. World building & fantasy — why does any of this exist; tone; naming rules.
2. Run/level structure & pacing — acts, beats on a clock, difficulty curve shape.
3. Player identity & signature verbs — classes, a defensive/expressive verb.
4. Content roster — abilities/items; each must have a role.
5. Systems & combos — interactions between elements/systems; counterplay.
6. Enemies, factions & bosses — data-driven archetype × faction; every boss attack telegraphed.
7. Build-defining layer — things that make runs *different*, not just stronger.
8. World interactivity — the map is part of the combo system.
9. Visual direction, juice & audio — readability palette (player vs threat colours), feedback (hit-stop, shake, pulses), per-area identity.
10. Meta, balance targets & scope lock — coherence check against the pillars ("what playstyle does each system reward?"), balance targets for the sim harness, final cut list.

## Locking
- Write DESIGN.md as tables of numbers. Mark it LOCKED with a version.
- After the build, append a "post-build integration playtest log" to PASSES.md with what the sims showed and what was tuned.
- For later overhauls (e.g. visuals only), bump the design version and state explicitly what is locked (gameplay) and what changes (look), so implementers don't touch numbers.
