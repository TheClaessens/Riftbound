---
name: orchestrated-game-dev
description: Design, build or overhaul a game (or any large, visual, multi-system creative codebase) by acting as an autonomous orchestrator — audit, iterative named design passes, parallel research subagents, a locked spec + contracts, core tech written by the orchestrator, parallel implementation subagents with exclusive file ownership and visual self-verification, then integration review, A/B regression sims and polish passes. Use this whenever the user asks to make a game, iterate a game's design, redo a game's visuals/art direction, "spin up agents/subagents" for a big creative build, or says things like "you are the orchestrator", "fully iterate on the design", "I expect absolute perfection", "make it look like X", even if they don't mention orchestration explicitly.
---

# Orchestrated game development

You are the **director and integrator**, not the only builder. Big creative builds fail in predictable ways when one agent does everything (shallow research, inconsistent art, drift between systems) or when many agents work without structure (merge collisions, mismatched APIs, nobody looking at the result). This process exists to avoid both: decide first, write the contracts yourself, parallelise only where ownership is clean, and **look at everything with your own eyes before calling it done**.

The phases below are the default. Skip or merge phases when the task is smaller, but keep the order of *decide → contract → build in parallel → verify*.

## 0. Frame the work

- Read the codebase's design docs, architecture/contract docs and memory first. Find the gameplay contracts that must not change (APIs, numbers, ids, save formats).
- **Back up** before an overhaul: zip the current source into `backup/<name>-v<N>.zip`. It costs seconds and later doubles as an A/B baseline (§6).
- Get a **baseline screenshot** of the current state in the browser/harness so you can compare later.
- Unless the user asked to be consulted, run autonomously: they want a finished result, not check-ins. Still give short status lines between long waits.

## 1. Design (for new games or redesigns): audit + named passes

When the game design itself is being built or iterated, write `design/PASSES.md` before any code:

- **Pass 0 — Audit** the current build honestly (a verdict table per area, then one-line diagnosis).
- **Passes 1..N**, one subject each (fantasy, run structure/pacing, player verbs, content roster, combos/systems, enemies/bosses, build-defining layer, world interactivity, visual direction/juice/audio, meta/balance/scope lock). Each pass has **Critique → Decisions → Overrules (earlier passes) → Cut**. The *Cut* list is what keeps scope sane; every pass must cut something.
- Lock the result in `DESIGN.md` (numbers in tables, ready to implement) and a contracts doc (`ARCHITECTURE.md`: module ownership map, shared object shape, events, per-module APIs).

Details and a template: `references/design-passes.md`.

## 2. Research in parallel (before locking tech or art direction)

Spin up 3–5 **research subagents in one message**, each on a distinct topic, e.g.
1. core tech for the hardest system (e.g. animating hundreds of characters cheaply),
2. environment/world rendering,
3. art direction / creature or character design bible,
4. readability of VFX/UI under the new look,
5. anything domain-specific (audio, netcode, physics…).

Each research agent: reads the project but **edits nothing except its report** (`design/research/NN-topic.md`), uses web search, must give a TL;DR + concrete recommendations + **drop-in code verified against the exact library version**, cites sources, and returns a ~15-line summary. Prompt template: `references/agent-briefs.md#research`.

While they run, do useful non-overlapping work (backup, baseline screenshots, reading code, prototyping the piece you're already confident about). When reports land, **reconcile conflicts explicitly** (two reports will disagree on e.g. bloom threshold or tone mapping — pick one, note why) and adopt their gotchas.

## 3. Lock contracts and build the core yourself

The orchestrator writes the parts everything else depends on:
- The shared core system/API (e.g. the instanced character rig, the biome/environment framework, the effect API) — prototype it end-to-end and verify in the real app before anyone builds on it.
- A **contract doc for implementers** (e.g. `design/ART.md`): coordinate conventions, the exact API, action/state names they will receive, budgets (tris, bones, draw calls), and a mandatory verification checklist.
- **Stubs + registry pre-wired**: create each agent's file with an empty export and wire it into the registry/index yourself, so no implementer ever needs to touch a shared file.
- A **dev viewer / harness** so agents can see their work: e.g. a viewer page that renders any asset at real game scale and camera, in any pose, with URL params; and a `snap()` helper that starts a god-mode run in a given level, simulates N seconds synchronously, hides the HUD and renders one frame. Without this, implementers model blind and quality collapses.

## 4. Parallel implementation with exclusive ownership

Launch implementers in one message. Rules that keep this safe:
- **Exclusive file ownership.** Each agent owns named files and may edit nothing else. If it needs a shared change it reports it instead of making it.
- **Self-contained brief**: what to build, files owned, files forbidden, docs to read first (contract doc + the relevant research sections), quality bar, budgets, and a **mandatory visual verification loop** in its *own* browser tab (create a tab once, always pass that tab id, never touch other tabs), console-error check, and a short final report (<40 lines). Template: `references/agent-briefs.md#implementation`.
- **Sequence by dependency, parallelise by content.** Build the quality-bar instance first (one biome, one faction), then fan out siblings that copy its standard (e.g. world phase 1 = shared systems + forest; phase 2 = barrens and riverlands in parallel).
- **Model choice**: creative/visual/architectural work → the strongest models; mechanical, exactly-specified work (renames, applying a change list) → cheaper models. Follow any saved user preference, but the user's current quality bar wins; mention the choice.
- **Relay cross-cutting changes.** When one agent's work changes what others see (new shading, a new FX API, a constraint like "ground decals must render over grass"), send a short message to the affected running agents and append it to the contract doc.

## 5. Review every handback yourself

An agent's report is a claim, not proof. For each handback:
- Look at the result yourself (viewer close-up + real game scale + in-game screenshot).
- Do small follow-up fixes yourself when they touch shared/core files the agent couldn't edit (e.g. clamps, shader channels, viewer layout).
- If quality is below the bar, **resume the same agent** with specific, visual feedback ("the ogre reads as a blue robot: no visible face, all boxes, no flesh — make the head thrust forward, add a round gut…"). Agents that self-report "not iterated to perfection" need this.
- Apply other owners' follow-up notes once their file is free (e.g. hazard colours in a file the boss agent owned).

## 6. Integrate and verify

- **Smoke test** every level/act and every boss in-game; read the console.
- **Performance**: stress test at the worst case (max enemies + effects) and measure update and render time (sync the GPU, e.g. `gl.finish()`), draw calls, programs.
- **Gameplay regression A/B**: extract the backup into a subfolder served by the same server and run the same automated sims on old and new builds. Sims are noisy: use **n ≥ 8–12 per side** before concluding anything, compare the same metric at the same timestamp, and bisect suspected causes by toggling them at runtime. Don't "fix" balance based on 3 runs.
- **Player-perspective feedback**: once the build is playable end to end, run the `game-playtest` skill. A panel of AI persona playtesters (Sonnet/Haiku) plays it sped up and writes reports, which you verify in-engine and synthesise into a ranked backlog for the next design pass.
- Fix integration bugs at the root (e.g. a value computed as NaN when the window is 0×0 never recovers).

## 7. Polish pass, docs, memory

- Run an **art-director polish agent** on the weakest assets you identified during review (and consistency gaps like "creatures have outlines, the player doesn't").
- Update DESIGN/ARCHITECTURE/README to the new state (new APIs, names, file map), remove temporary comparison folders, clear test save data.
- Save non-obvious lessons to memory (where things live, how to verify, gotchas).
- Final message to the user: what changed (grouped by player-visible area), what was verified and how, honest caveats (perf numbers are on this machine, areas that are denser than before, agent workarounds), where docs live.

## Pitfalls worth remembering
- Shared in-app browser: agents must use their own tab; tabs can hit a limit; a hidden pane may report 0×0 and stall `requestAnimationFrame` — advance the game with synchronous update loops and render explicitly before screenshots.
- Test runs write save data (localStorage); clear it afterwards.
- Screenshots from a small pane under-represent detail; judge silhouettes at 1–1.4× game zoom as well as close-ups.
- A rewrite of the look changes readability rules: re-check projectiles, telegraphs, pickups, text and UI against the new backgrounds, not just the new art.

For web/three.js projects, read `references/web-3d-lessons.md` before writing core rendering tech — it holds concrete, verified techniques (instanced skinned crowds, bloom/tone mapping for bright scenes, blend-add VFX, camera-following grass, procedural modelling gotchas).
