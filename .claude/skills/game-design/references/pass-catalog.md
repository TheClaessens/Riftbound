# Design Pass Catalogue

The ten passes that took Riftbound from a prototype to a tight v1.0. Use them as a menu: pick the ones the audit's diagnosis calls for, in roughly this order (the fantasy and structure passes come first because everything else hangs off them). Each pass lists the questions it must answer, the outputs to produce, and the traps we hit.

## Contents
- [0. Audit](#0-audit)
- [1. World & fantasy](#1-world--fantasy)
- [2. Run structure & pacing](#2-run-structure--pacing)
- [3. Classes & signature verb](#3-classes--signature-verb)
- [4. Skill / ability roster](#4-skill--ability-roster)
- [5. Combo system & counterplay](#5-combo-system--counterplay)
- [6. Enemies, factions & bosses](#6-enemies-factions--bosses)
- [7. Build-defining layer (items / relics)](#7-build-defining-layer-items--relics)
- [8. World interactivity](#8-world-interactivity)
- [9. Visual direction, juice & audio](#9-visual-direction-juice--audio)
- [10. Meta, balance targets & scope lock](#10-meta-balance-targets--scope-lock)

---

## 0. Audit
**Answer:** What works? What is flat? What does the player *do* (their verbs)? Is anything rewarded besides picking the right upgrades?
**Output:** a grading table (area → one-line verdict) and a one-line diagnosis.
**Trap:** auditing from the code only. Run it, even with a scripted bot, and look at screenshots.

## 1. World & fantasy
**Answer:** Why does this world have these mechanics? Who is the player, and why do they keep coming back (this justifies runs and meta in one sentence)? What is the tone in five words?
**Output:** the setting (2–3 sentences), the player identity, a "run = journey through X" framing, a tone line, and a naming rule (everything gets a name plus a ≤ 8-word flavour line).
**Riftbound example:** the shattered Riftcrown tore rifts into the world. The player is tethered to the rift and can't die permanently, so death sends them back to the Sanctum carrying shards (the meta currency).
**Cut by default:** NPCs, dialogue, cutscenes. Lore lives in flavour text and titles.

## 2. Run structure & pacing
**Answer:** Does minute 2 feel different from minute 8? What are the beats? Where are the peaks and the breathers?
**Output:**
- Stages/acts, each with a biome, a faction and a boss.
- A per-stage clock plus a repeating beat skeleton (e.g. elite surge at 1:30, swarm at 2:15, boss at 3:00).
- A stage transition with a payoff: enemies dissolve into XP, then a palette morph and a title card.
- Scaling as *stage multiplier × in-stage ramp*, not one long exponential.

**Traps:** a single long clock with one palette, and a reused boss model.

## 3. Classes & signature verb
**Answer:** Does every run start the same? Does the player have a defensive or skill-expression verb?
**Output:**
- **A shared signature verb** (dash) with a skill reward. A *Perfect Dodge* is the best one: taking a hit during the first ~0.25 s of the dash triggers slow-mo, a cooldown refund and a damage buff.
- **3–4 classes**, each defined by:
  - an element/theme
  - a starter ability locked to the primary button
  - its own variant of the verb
  - a **trait that rewards one playstyle**: weave combos / dive into packs / control and patience / never stop moving
  - a small stat tilt
  - an **unlock condition tied to a milestone**, not currency
- A one-line playstyle slogan per class.

**Trap:** classes that differ only in stats.

## 4. Skill / ability roster
**Answer:** Is there enough variety for many runs? Is anything redundant now that the new verb exists? Does each element have a role?
**Output:**
- A matrix: element × (class starter, shared A, shared B). Include at least one crowd-control *setup* tool (a pull vortex), because AoE combos need clumping.
- **Fusions**: two skills at rank N become an evolved skill. Include class-specific fusions (starter + shared skill) so each class has an ultimate.
- Slot layout (primary fixed, N actives, M autos).
- Give every stat a source; we found `stats.projectiles` had none.

**Traps:** keeping a skill the new verb made redundant (Blink vs dash), and a starter shared by all classes, which kills identity.

## 5. Combo system & counterplay
**Answer:**
- Does every element interact with every other?
- Is one element a dead end?
- Do enemies care which element you use?
- Do combos feed progression, not just damage?

**Output:**
- A complete interaction matrix. Give an odd-one-out element a role; "Arcane = detonator" consumes other statuses for burst, control or spread.
- A **chain/combo counter** that boosts XP (capped).
- Faction counterplay:
  - a resistance in one stage, which teaches mixing
  - **wards** (immune to element X until any reaction lands) in a later stage, which rewards combo builds and walls out mono builds
- A new status if needed (stun), with boss caps.

**Trap:** adding weaknesses on top of resistances and wards. It's too much to read; pick two counterplay tools at most.

## 6. Enemies, factions & bosses
**Answer:** Is every enemy "walk at you"? Which enemy forces the signature verb?
**Output:**
- **Archetypes** (behaviour + silhouette), each with what it asks of the player:

  | Archetype | Asks the player to |
  |---|---|
  | chaser | AoE |
  | swarmer | keep moving |
  | tank | burst it down |
  | ranged | reposition |
  | charger (line telegraph) | dash |
  | bomber (fuse; kill it early and it hurts enemies) | turn it into a weapon |
  | splitter | follow up with AoE |
  | blinker (teleport telegraph) | dodge on the flash |
  | support (shields allies) | prioritise it |

- **Factions** = palette + names + resist. Build the roster as an archetype × faction table with a stat table (HP, speed, damage, XP).
- Introduce 1–2 new archetypes per stage.
- **Bosses:** one per stage, two phases split at 50%, every attack telegraphed, and one signature "exam" attack that tests the verb (a ring you must dash through, sweeping beams).

**Trap:** too few enemies on screen to read as a horde. Decide density targets here, and check them in simulation.

## 7. Build-defining layer (items / relics)
**Answer:** Two runs with the same skills: do they feel different?
**Output:**
- Items from **chests** (pick 1 of 3) dropped at set beats, ~6–9 per run.
- About 18 items, each tagged by playstyle (reaction / fire / frost / storm / risk / dodge / economy / cast / safety). Each is one clear sentence plus a flavour line.
- Level-up **reroll + banish**, so planning a build is itself a skill.
- Prefer items expressible as stat modifiers plus a few event hooks; they're much easier to implement and balance.

**Trap:** chests from every elite. That gave 12–18 items per run. Use one "bearer" per beat plus a low random rate.

## 8. World interactivity
**Answer:** Can the player combo with the map? Is there a reason to move across the arena?
**Output:**
- **Elemental crystals** (inert objects that burst into status-applying AoE), so the map joins the combo system.
- **Shrines**: walk-to buffs on a timer with an edge-of-screen arrow, rewarding routing.
- **Stage hazards** that hurt *both sides* (lava vents, lightning), so they work as baits.
- Obstacles per biome.

**Trap:** auto-aim targeting world objects. Mark them `inert` and skip them in targeting.

## 9. Visual direction, juice & audio
**Answer:** Does it look like programmer art? Does anything change over time? Can you read the screen at peak chaos?
**Output:**
- A per-stage art direction table (background, light colours, grade tint, ambient particles, ground texture idea).
- A post-process grade pass: vignette, tint, saturation, low-HP pulse, chromatic kick on big events.
- Juice:
  - hit-stop (~45 ms, rate-limited)
  - spawn-in / death squash
  - slow-mo on perfect dodges
- A **readability palette**: player spells use element colours, enemy shots are hot magenta with a white core, telegraphs are red-orange, and player telegraphs are a different hue (orange).
- Distinct class silhouettes.
- A HUD list.
- Music: a per-stage theme plus an intensity layer driven by enemy count, and a boss layer.

**Trap:** decide the readability palette *before* anyone builds effects.

## 10. Meta, balance targets & scope lock
**Answer:** Why play run #5? What counts as balanced? What are we not doing?
**Output:**
- A meta currency formula, permanent upgrades (cost curve) and difficulty tiers.
- A codex.
- A coherence table (system → rewarded playstyle).
- **Numeric balance targets**: level by time, boss TTK, survival % per stage, FPS.
- The final cut list.
