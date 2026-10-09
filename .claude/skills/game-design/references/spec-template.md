# Locked Spec Template (`DESIGN.md`)

Copy this skeleton and fill every `<…>` with real values. An implementer reading one section should be able to build it without asking a question. If you catch yourself writing an adjective where a number belongs, stop and pick the number. Simulation will correct it later.

```markdown
# <GAME> — Game Design v<X.Y> (LOCKED)

> <One-sentence pitch: who you are, what you do, how it ends.>

The rationale and the cut list are in [design/PASSES.md](design/PASSES.md). This file is the spec: implement the numbers as written, then tune them with the simulation harness.

## 1. Pillars
1. <Pillar>: <one sentence>   (3 max; every system must serve at least one)

## 2. Fantasy
<3 sentences. Explains the runs and the meta.>

## 3. Run structure
| Stage | Biome | Faction | Boss | Hazard | Map objects |
* Stage clock: <seconds>. Beats: <time → event>, …
* Transition: <what happens, in order, and its duration>.
* Win condition / loss condition.

### Scaling (`m` = stage minutes)
| Quantity | Formula | Stage 1 | Stage 2 | Stage 3 |
| Enemy HP | `base × stageHp × (1 + a·m + b·m²) × tierMult` | | | |
| Enemy damage | … | | | |
| XP | … | | | |
| Spawn rate (/s) | `rateBase + rateRamp·m` | | | |
* Live cap, elite chance and elite multipliers, boss base HP.

## 4. Controls
| Input | Action |

## 5. Classes
| | Class A | Class B | … |
| Element / colour | | |
| Starter | | |
| Verb variant (values) | | |
| Trait (exact numbers) | | |
| Stat tilt | | |
| Unlock | | |
**Signature verb rules:** i-frames, cooldowns, the perfect-dodge window and its reward (exact values).

## 6. Statuses & combos
| Element | Status | Effect (durations, %) |
| Combo | Trigger | Effect (radius, damage formula) |
* Combo counter rules, hit-stop rules, resist/ward/barrier rules.

## 7. Skills
Slot layout. Rank rules. Fusion rule.
| Skill | Element | cd per rank [ … ] · base values · r2 … · r3 … · r4 … · r5 … |
| Fusion | Recipe | Type | r1; r2; r3 |
| Passive | per-rank effect | max rank |
Level-up rules (cards, reroll, banish, filler).

## 8. Items / relics
Drop sources and rate (target per run), choices per chest.
| Item | Tag | Effect (one sentence, exact numbers) |

## 9. Enemies
| Archetype | Behaviour (with telegraph timings) |
| Type id | Stage | Archetype | HP | Speed | Damage | XP | Notes |
Spawn rosters: <type weight @ time-available>. Visual language rules.
### Bosses
Per boss: radius, attack cycle, every attack with telegraph shape/duration/damage multiplier, phase 2 changes.

## 10. World
Bounds/arena shape, map objects (counts, HP, effect, respawn), shrines (schedule, claim rules, buffs), hazards (interval, telegraph, damage to each side).

## 11. Look & feel
Per-stage atmosphere table (background / lights / grade). Readability palette. Juice list. HUD list. Audio list.

## 12. Meta
Currency formula, permanent upgrades table (per rank, max, cost), unlocks, tiers, codex, save key.

## 13. Balance targets
* Levels by time, boss TTK per stage, survival % per stage, FPS budget.
* XP formula and player base stats (fill these in after tuning).
```

## Checklist before marking it LOCKED
- [ ] Every enemy, boss attack, skill rank and item has numbers.
- [ ] Every telegraph has a shape, a duration and a colour.
- [ ] The scaling table is filled for every stage.
- [ ] The balance targets section exists and is numeric.
- [ ] The cut list lives in the passes doc and nothing in the spec contradicts it.
- [ ] Names exist for every faction, boss, stage and item.
