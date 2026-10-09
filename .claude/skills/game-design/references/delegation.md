# Delegating Implementation to Subagents

What worked when 10 parallel (Haiku) agents built Riftbound v1.0 in one go with very few integration bugs.

## Write the spine yourself
Write these yourself, because they touch everything and must stay coherent:
- the game object / state machine / stage flow / transitions
- damage & status pipeline (one `damageEnemy(...)` everyone calls)
- the player: movement, signature verb, traits, buffs, stat recalculation (base → class → meta → passives → items → buffs)
- progression (cards, reroll/banish), item definitions, meta save/unlocks
- data tables (classes, stages/scaling)
- small shared helpers other agents need (e.g. a line telegraph, a "corpse" death animation that takes ownership of a mesh)
- engine API **stubs** for things another agent will implement (e.g. `setGrade()`, `pulse()` as no-ops)

Then boot it and run a quick simulated run to prove the spine works **before** launching agents.

## Create stubs for every file an agent will fill
Each stub exports the exact names the registry imports and behaves trivially (a basic projectile, an auto skill with empty `update`). The game keeps running throughout, so you can test early and agents can't break imports.

## Split by file ownership, not by feature
A split that worked (one agent each):
1. starter abilities
2. shared abilities
3. fusions
4. enemies (archetypes × factions + enemy bullet)
5. bosses + spawner
6. world (biomes, map objects, shrines, hazards)
7. in-run UI (HUD + modals)
8. out-of-run menus (title, class select, meta shop, end screens)
9. graphics (post grade pass + character models)
10. audio (music + SFX)

Where two agents need a shared API (the bosses agent uses the enemies agent's bullet class), **fix the signature in the prompt for both** ("constructor `(game, pos, dir, damage, opts)` must also accept the old 4-arg call").

Where two UIs must cooperate (HUD and menus), define the interface in both prompts and make one the owner of composition.

## Prompt template for each agent
```
You are implementing part of <GAME>, <one-line tech summary>. Project root: <path>

## Your task: <title>
<Exact files to create or replace, and the exact export names.>
Spec: DESIGN.md §<n> (implement every number / rank effect exactly).

## Read first
1. ARCHITECTURE.md — <relevant contract sections>
2. DESIGN.md §<sections>
3. <Reference implementations to mirror>, <helper modules>
NOTE: other agents are writing <files> right now. Their exports will be <signatures>. Import those; don't edit them.

## Requirements
<Behaviour bullets with numbers, visual direction, readability colours, performance rules
 (shared geometry, dispose per-instance materials, no allocation per frame), edge cases
 (skip inert objects, gate attacks on the frozen/stunned multiplier, cancel telegraph handles on death).>

## Rules
- ONLY edit <files>. Report needed changes elsewhere in your final report.
- Do NOT use browser/preview tools, start servers or use git.  (They would fight over one browser.)
- You can't run the code: self-review imports (.js extensions, real paths), export names,
  brace balance, undefined variables. Re-read every file fully at the end.
- Final report (under N words): what you implemented, interpretation choices, contract deviations, and what other modules need.
```

## While agents run
- Launch all of them in one message, in the background. Give the user a short status.
- Use the waiting time to build the **simulation harness** (see balance-playbook.md); it doesn't touch agent files.
- When a report arrives, note deviations and spec conflicts it raises (e.g. "rank-5 text says −1.5 s but the cooldown array says 7") and resolve them in the spec.
- Once a few modules have landed, run the bot against the partial build to catch spine bugs early.

## Integration checklist after all reports
- [ ] Reload, check the console for errors, boot every class.
- [ ] Run the stage flow end to end: force each boss to die, confirm transitions and victory.
- [ ] Look for stale references to removed content (cut skills still named in audio/UI).
- [ ] Before publishing or sharing, read every file you didn't write.
