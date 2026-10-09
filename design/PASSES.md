# Riftbound — 10 Design Passes (v0.2 → v1.0)

Each pass takes one subject, critiques the current state honestly, makes decisions, and records what got **cut**.
Later passes may overrule earlier ones; when they do, it's called out. The result is locked in `DESIGN.md` (v1.0).

---

## Pass 0 — Audit of v0.2 (baseline)

Played and simulated v0.2 (auto-cast bot, kiting bot, standing bot).

| Area | Verdict |
|---|---|
| Core loop | Works. Reactions are the best part. |
| Run structure | **Flat.** A 10-minute clock with one arena and one palette. Minute 2 looks identical to minute 8. |
| Player verbs | **Too few.** You move and you hold buttons. There is no defensive skill expression and no dodge. |
| Build variety | 6 skills and 5 fixed fusions. After 3 runs you've seen everything. Arcane only has 1 reaction, so it's a dead element. |
| Enemies | 4 types, all "walk at you". Spitter is the only one that asks for a reaction from the player. No faction identity. |
| Bosses | One boss model, used twice. |
| World | Decorative only. Nothing in the arena interacts with the combo system. |
| Visuals | Clean but generic. Primitive enemy blobs, one dark slate palette, and no post grading. The HUD is fine. |
| Meta | Codex only. There's no reason to play run #4. |
| Playstyle reward | Nothing rewards *how* you play, only *what* you picked. |

**Diagnosis:** the game has a good engine (reactions) and no chassis. The 10 passes build the chassis around it.

---

## Pass 1 — World building & fantasy

**Critique.** "Riftbound" means nothing yet. There's no reason for a rift, a warden or elements to exist.

**Decisions.**
* **Setting: Vael**, a cloister-kingdom that tried to bind the four elemental Primes (Arcane, Fire, Frost, Storm) into a single crown: the **Riftcrown**. The binding failed and the crown shattered. Each shard tore a **Rift** into the world, and each Rift is warping the land around it into a mirror of its element.
* **You are Riftbound**: a mage whose soul is tethered to the Rift. You can't truly die. Death throws you back to the **Sanctum**, the last unbroken chapel, carrying **Rift Shards** (the meta currency). This explains both runs and meta progression in one sentence.
* **A run = one descent** through three strata of the Rift, each warped by a different Prime, ending at the **Rift Heart**, the crown's core.
* Tone: dark, melancholic, beautiful. The world is a ruin and the magic is the only light. Visually, **darkness is the canvas and your spells are the paint**.
* Every name gets a job: enemies have factions, bosses have names, relics have flavour lines (≤ 8 words).

**Cut.** NPCs, dialogue, story cutscenes. Lore lives in one-line flavour text, act titles and the Codex.

---

## Pass 2 — Run structure, acts & pacing

**Critique.** A single 10:00 clock gives no arc, and the 5:00 mid-boss is the same model as the final one.

**Decisions.**
* **Three Acts**, each a biome plus a faction plus a boss:
  1. **The Hollow Verge**: ruined arcane cloister (violet/teal). The Hollow (undead husks). Boss: **The Hollow Warden**.
  2. **The Cinder Wastes**: basalt and lava cracks (ember orange/black). The Ashborn. Boss: **Vashkar, the Cinder Colossus**.
  3. **The Shattered Crown**: floating crystal ruins in a storm (ice white/electric cyan/violet). The Riftborn. Boss: **The Rift Heart**.
* **Act clock = 3:00 of horde**, then the boss arrives. While the boss lives, the horde spawns at 35%. **Kill the boss → Rift Shift**: a 2.5 s transition where the screen flashes, all live enemies dissolve into XP (a clearing reward), the biome morphs and the next act begins. Total run ≈ 10–11 min.
* **In-act beats** (same skeleton for each act, so players learn the rhythm):
  * 0:00 act title card
  * 1:30 **Elite Surge**: 3 elites that each drop a Relic Chest
  * 2:15 **Swarm** ring
  * 3:00 **Boss**
* Difficulty is driven by **act multiplier × in-act ramp**, not one exponential curve. Each act starts with a visible step up, then ramps.
* Shrines, crystals and hazards appear on a per-act schedule (Pass 8).

**Overrules v0.2:** removes the 2:30/7:30 elite waves and the 5:00/10:00 boss timing.

**Cut.** Branching paths and act selection. The order is fixed: learn → counter → master.

---

## Pass 3 — Classes & the signature dash

**Critique.** Every run starts identically, and the player has no defensive verb.

**Decisions.**
* **Dash on Space** for every class. A short burst (~5 u, 0.16 s) with i-frames. It is the skill-expression verb.
* **Perfect Dodge:** if something would have hit you during the first 0.25 s of a dash, you get **PERFECT**: 0.35 s slow-mo, the dash cooldown is refunded, and **Adrenaline** (+30% damage for 3 s). This is *the* tight-gameplay reward and it makes telegraphed attacks into opportunities.
* **Four classes.** Each has a starter skill (locked to LMB), a dash variant, a **Trait** that rewards one playstyle, and a stat tilt:

| Class | Element | Starter | Dash | Trait (rewarded playstyle) |
|---|---|---|---|---|
| **Arcanist** | Arcane | Arcane Bolt | **Phase Step**: blink, 2.4 s cd | **Resonance**: +2% dmg and +1% CDR per Chain (max 25). *Rewards weaving reactions non-stop.* |
| **Pyromancer** | Fire | Cinder Bolt | **Flame Dash**: leaves a burning trail, 3.0 s cd | **Wildfire**: burning enemies explode on death and spread Burn. *Rewards diving into dense packs.* |
| **Cryomancer** | Frost | Ice Shard | **Glacial Slide**: chills along the path, 2.8 s cd | **Permafrost**: Frozen foes take +35% dmg, and every freeze grants Frost Armor (absorbs a hit, max 3). *Rewards control and patience.* |
| **Stormcaller** | Storm | Spark | **Lightning Dash**: 2 charges, shocks foes passed through, 1.8 s cd | **Momentum**: moving builds Charge (0–100), +0.5% dmg per Charge, which drains when still. *Rewards never stopping.* |

* Stat tilts: Pyro +10% dmg / −10 HP; Cryo +30 HP / −5% speed; Storm +10% speed / −10 HP; Arcanist is neutral.
* Unlocks: Arcanist is free. **Pyromancer**: defeat any Act I boss. **Cryomancer**: discover 4 reactions. **Stormcaller**: reach Act III.

**Cut.** Weapons and equipment, and class-specific ultimates (the fusion is the ultimate).

---

## Pass 4 — Skill roster

**Critique.** 6 skills is too thin. Blink is now redundant with the dash. Arcane Bolt being the starter for everyone kills class identity.

**Decisions.**
* **Blink is cut**, and so is the Glacial Step fusion. *(Overrules v0.2.)*
* Slot layout: **LMB = class starter (fixed)**, **RMB/Q/E/R = 4 active slots**, **2 auto slots** (no key), **Space = dash**.
* **Every element gets 2 shared skills + 1 class starter**: 8 shared + 4 starters = 12 skills.

| Element | Starter (class-only) | Shared A | Shared B |
|---|---|---|---|
| Arcane | Arcane Bolt | **Spirit Orbs** (auto) | **Singularity**: vortex that pulls a crowd together (the setup tool for AoE reactions) |
| Fire | Cinder Bolt | **Fireball** | **Meteor**: delayed huge impact at the cursor and a burning crater |
| Frost | Ice Shard | **Frost Nova** | **Blizzard**: lingering zone that stacks Chill fast |
| Storm | Spark | **Chain Lightning** | **Static Field** (auto): sky strikes on random nearby foes |

* **Ten fusions** (both parents rank 3+ → a guaranteed gold card). Six use shared skills (open to all) and four are **class fusions** (starter + shared):

| Fusion | Recipe | Fantasy |
|---|---|---|
| Frostfire Comet | Fireball + Frost Nova | piercing comet chaining Steam Bursts |
| Plasma Orb | Fireball + Chain Lightning | crawling orb that zaps, then Overloads |
| Storm Halo | Chain Lightning + Spirit Orbs | lightning wisps |
| **Absolute Zero** | Frost Nova + Singularity | implosion → mass freeze → arcane pulse that Shatters |
| **Cataclysm** | Meteor + Singularity | vortex pulls the crowd, then a giant meteor lands in the middle |
| **Thunderhead** (auto) | Blizzard + Static Field | a storm cloud follows you, snowing Chill and striking lightning (Superconduct engine) |
| Arcane Barrage *(Arcanist)* | Arcane Bolt + Spirit Orbs | orbs fire homing missiles |
| **Starfall** *(Pyromancer)* | Cinder Bolt + Meteor | bolts call down meteors |
| **Hailstorm** *(Cryomancer)* | Ice Shard + Blizzard | shard fans that leave frost zones |
| **Tempest** *(Stormcaller)* | Spark + Static Field | sparks chain up to 8 and call sky strikes |

* A **ninth passive**, Volley (+1 projectile, max 2 ranks), so `stats.projectiles` finally has a source.

**Cut.** A fifth element (Nature/Void) was tempting, but it doubles the reaction matrix. It goes to the backlog.

---

## Pass 5 — Reactions v2 & elemental counterplay

**Critique.** Arcane has one reaction, so the starter element is the weakest combo element. Reactions don't care about enemy identity.

**Decisions.**
* **Arcane = the Detonator.** It never applies a status. It *consumes* statuses for burst:
  * Arcane → Frozen = **SHATTER** (existing): ×2.5 dmg and shards.
  * Arcane → Burning = **COMBUST** *(new)*: deals the remaining burn damage ×3 instantly in a small splash and spreads Burn to 3 neighbours.
  * Arcane → Shocked = **ARC FLASH** *(new)*: stuns the target and foes within 3 u for 1.2 s, and stunned foes take +25% damage.
* The 6-reaction matrix is now complete and symmetric: every pair of elements has an interaction.
* New status: **Stun**. Bosses get 0.3 s at most.
* **Global Chain counter:** every reaction within 2.5 s of the previous one adds +1 Chain. Chain gives **+1% XP per Chain (cap 50%)** and shows as a big HUD number. The Arcanist's Resonance reads it too. *Reactions now feed levelling, so playing for combos is rewarded beyond damage.*
* **Elemental counterplay by faction:**
  * Act I Hollow: no resistances (the learning act).
  * Act II Ashborn: **resist Fire 50%** (damage *and* burn duration). Pyromancers must branch out or invest in reactions. The biome teaches mixing.
  * Act III Riftborn: elites and the boss carry a **Prism Ward**, which makes them immune to one element (shown as a coloured aura). **Any reaction on the warded foe breaks the ward.** A mono-element build hits a wall, and a reaction build walks through it.

**Cut.** Enemy weaknesses (bonus damage). Resistances plus wards are enough to read; weaknesses add noise.

---

## Pass 6 — Enemies, factions & bosses

**Critique.** Every enemy is "walk at you". Nothing forces the dash.

**Decisions.** Enemies are **data-driven: archetype (behaviour + model) × faction (palette, names, resist)**.

| Archetype | Behaviour | What it asks of the player |
|---|---|---|
| chaser | walks at you (horde mass) | AoE |
| swarmer | fast, fragile, comes in packs | keep moving |
| tank | slow, huge HP, knockback-resistant | single-target burst / Shatter |
| ranged | keeps 8–10 u away, telegraphed shot | reposition |
| **charger** | stops, shows a **line telegraph** (0.7 s), then charges | **dash sideways / Perfect Dodge** |
| **bomber** | runs to you, **fuses for 1.0 s with a circle telegraph**, explodes and hurts *everyone*. Killed early, it blows up harmlessly to you but damages enemies | turn it into a weapon |
| **splitter** | splits into 3 mites on death | AoE follow-up |
| **blinker** | teleports next to you every ~4 s (0.5 s purple telegraph) | dodge on the flash |
| **support** | stays back and grants nearby allies a barrier (30% max HP) every 6 s | priority target, dive it |

Faction rosters (name per archetype):

| Archetype | Act I: Hollow | Act II: Ashborn | Act III: Riftborn |
|---|---|---|---|
| chaser | Husk | Ash Husk | — |
| swarmer | Imp | Cinderling | Shardling |
| tank | Brute | Obsidian Brute | Colossus |
| ranged | Spitter | Ember Spitter (fire shot) | Void Spitter (3-shot spread) |
| splitter | Bloater | — | — |
| charger | — | Magma Ram | Crystal Ram |
| bomber | — | Pyre Bomber | — |
| blinker | — | — | Wraith |
| support | — | — | Prism Hexer |

Each act introduces **two new verbs**: Act I has splitter, Act II adds charger and bomber, Act III adds blinker and support.

**Bosses** (one per act, each with 2 phases split at 50% HP and every attack telegraphed):
* **The Hollow Warden** (Act I): ground slam (circle), husk summon, radial volley. Phase 2: faster, double volley.
* **Vashkar, the Cinder Colossus** (Act II, resists fire): line-telegraphed **charge** leaving lava, **meteor rain** (6 circles around you), **flame ring** (an expanding ring you must *dash through*, the Perfect Dodge exam). Phase 2: two charges in a row, plus a lava ring.
* **The Rift Heart** (Act III, final): hovering crystal core that **rotates its Prism Ward element every 10 s**. **Twin sweeping beams** (dash through them), prism volleys, Riftborn summons. Phase 2: beams speed up and shard rain begins.

**Cut.** Enemy healers (support covers it), flying enemies, and a mini-boss per act (Elite Surge covers it).

---

## Pass 7 — Build-defining layer: Relics

**Critique.** Level-up cards make you *stronger*, but they don't make you *different*. Two Fireball + Frost Nova runs feel the same.

**Decisions.**
* **Relics**: passive, build-bending items that drop from **Relic Chests** (every elite, every boss). Opening a chest means picking 1 of 3. You get about 6–9 per run with no cap. They're shown as a tray in the HUD.
* Relics are deliberately **tagged by playstyle** so they *pull* a build in a direction:

| Tag | Relics |
|---|---|
| Reaction | Alchemist's Coil (+40% reaction dmg), **Prism Lens** (reactions 25% chance to echo), Unstable Core (Overload stuns 0.6 s, +50% radius) |
| Fire / aggression | Ember Heart (Burn ×2 duration, +50% burn dmg), Pyre Crown (killing a burning foe heals 0.5 HP) |
| Frost / control | **Rime Shard** (freeze at 3 Chill instead of 5), Glacier Plate (−3% damage taken per Frozen foe within 6 u, max −24%) |
| Storm / mobility | Stormglass Boots (+15% speed, −30% dash cooldown), Conductor's Ring (Shock ×2 duration, Shocked foes take +40% instead of +20%) |
| Risk | Glass Sigil (+50% dmg, −40% max HP), Blood Pact (+1 projectile, −1 HP/s while above 50% HP) |
| Dodge | **Duelist's Mark** (Perfect Dodge heals 8%, Adrenaline 6 s), Thorned Ward (when hit, nova for 300% of the damage taken) |
| Economy | Hoarder's Lantern (+30% XP, chests offer 4 relics), Rift Magnet (foes killed by reactions drop double XP) |
| Cast | **Echo Stone** (slotted skills 15% chance to cast twice), Overclock (every 8th cast of a skill deals ×3) |
| Safety | Second Wind (once per run: survive lethal at 50% HP and freeze nearby) |

* Level-up gets **Reroll** (2 per run) and **Banish** (1 per run, removes that card from the pool for the run). Planning a build is a skill.

**Overrules Pass 5:** the Chain XP bonus stays, but Rift Magnet is the *opt-in* way to push the economy further.

**Cut.** Relic upgrades and relic synergies-of-synergies. A relic is one clear sentence.

---

## Pass 8 — World interactivity

**Critique.** The arena is wallpaper. The best combo game in the world should let you combo with the *map*.

**Decisions.**
* **Rift Geodes**: elemental crystals on the map (Act I: arcane/frost; Act II: frost/storm, the *counter* to the Ashborn; Act III: all four). Hit one to shatter it into a **4.5 u elemental burst** that applies a heavy status (and therefore *reactions* with whatever is already on the foes). A Frost Geode next to a burning horde gives a chain of Steam Bursts. 8 live at a time, and each respawns 25 s after it breaks. Auto-cast ignores them; you aim at them deliberately.
* **Shrines**: one at a time, appearing every ~50 s, 14–22 u away with an arrow pointing to it on the HUD edge. Stand in the circle for 2.5 s to claim it (the progress ring shows). You get a 25 s buff:
  * **Fury**: +40% dmg
  * **Celerity**: −30% cooldowns, +15% speed
  * **Greed**: magnetise all XP, +50% XP
  * **Aegis**: 60-pt shield

  *This rewards route-planning and mobility.*
* **Act hazards**, which hurt both you and enemies, so they double as weapons:
  * Act I: none (learning act).
  * Act II: **Lava Vents** erupt (1.2 s circle telegraph), dealing damage and Burn to everything inside.
  * Act III: **Lightning Strikes** rain (1.0 s telegraph), dealing damage and Shock. Lure the horde into them and follow up with Fire for Overloads.
* Obstacles (pillars, rocks, spires) per biome. Collision already exists.

**Cut.** Destructible walls and traps you place yourself.

---

## Pass 9 — Visual direction, juice & audio

**Critique.** It reads as "programmer art in the dark". Enemies are blobs, and nothing changes from minute 1 to 10.

**Decisions.**
* **Per-act art direction** (palette = ground texture + background + hemisphere/moon light colours + grading + ambient particles):
  * Verge: slate flagstones, violet rune circles, teal motes, cool moonlight.
  * Cinder: black basalt plates with **glowing lava cracks** (emissive map), drifting embers, warm red key light.
  * Crown: pale cracked marble and crystal, snow particles, periodic sky flashes, cold cyan key light.
* **Rift Shift transition**: white-violet flash, then a radial shockwave ring across the arena, then a 1.5 s palette lerp, a camera zoom punch and the new act title card.
* **Post-processing grade pass** (custom shader after bloom): vignette, per-act tint/lift, saturation, a low-HP red edge pulse with desaturation, and a short chromatic-aberration kick on big hits / Perfect Dodge.
* **Game feel:**
  * **Hit-stop**: 45 ms on Shatter/Overload/Combust and boss phase changes, 90 ms on a Perfect Dodge (on top of the slow-mo).
  * Enemy **spawn-in**: rises out of a small rift decal over 0.35 s.
  * Enemy **death**: white flash, a squash shrink over 0.12 s, then the burst.
  * Telegraphs are always **red-orange ground decals** with a filling interior. Enemy projectiles are **hot magenta with a white core**, never confusable with player spells.
* **Models**: each class gets a distinct silhouette:
  * Arcanist: violet hood and an orb staff.
  * Pyromancer: horned crimson cowl and a brazier staff.
  * Cryomancer: tall ice crown, white robe, crystal staff.
  * Stormcaller: wide-brimmed navy hat, gold trim, a rod with spinning rings.

  Enemy archetype models get readable silhouettes (≤ 3 meshes) and emissive eyes/cores in faction colours. Elites get a pulsing rim aura. Prism Ward is a rotating coloured shell.
* **HUD:**
  * Top: an act bar with 3 segments and boss skull markers.
  * Under HP: dash pips and the trait meter (Momentum / Resonance / Frost Armor / Wildfire).
  * Right of centre: a large **CHAIN ×N** that pulses.
  * Top-left: the relic tray.
  * Edge arrow toward the active shrine.
  * Skill slots get radial cooldown sweeps.
* **Audio:** procedural music per act (a drone plus an arpeggio, with an intensity layer driven by enemy count and a boss layer). New SFX: dash, perfect dodge, relic, geode shatter, shrine claim, Rift Shift, boss phase.

**Cut.** Imported 3D assets and textures. Everything stays procedural (no build step, no asset pipeline).

---

## Pass 10 — Meta, balance, scope lock

**Critique.** Nine passes added a lot. The danger now is mush, so this pass checks every system against the pillars and against what a run *feels* like.

**Coherence check.** Each system now answers "what playstyle does this reward?":

| System | Rewards |
|---|---|
| Reactions + Chain | mixing elements, sustained combos |
| Classes + Traits | a committed playstyle (weave / dive / control / kite) |
| Dash + Perfect Dodge | reading telegraphs, nerve |
| Factions (resist / ward) | adapting your build per act |
| Relics | leaning into an archetype |
| Geodes / hazards | using the map |
| Shrines | routing and mobility |
| Reroll / Banish | planning |

**Meta progression (Sanctum):**
* **Rift Shards** earned per run: 1 per 30 kills, +15 per act reached, +40 per boss, +1 per 10 Chain peak, ×(1 + 0.25 × tier).
* **Attunements** (permanent; cost 20 × next rank). Each line lists the bonus per rank, then the maximum rank:

  | Attunement | Per rank | Max rank |
  |---|---|---|
  | Might | +4% damage | 5 |
  | Vigor | +8 max HP | 5 |
  | Insight | +5% XP | 5 |
  | Swiftcast | −3% cooldowns | 5 |
  | Fortune | +1 reroll | 3 |
  | Exile | +1 banish | 3 |

* **Rift Tiers** (unlocked by a first victory): Tier 0–5, each adding +30% enemy HP, +12% enemy damage and +25% shards.
* Codex: reactions 6, fusions 10, relics 18, classes 4.

**Balance targets** (to be validated by a simulation harness):
* Levels: L5 at 1:00, L10 at the Act I boss, L18 at Act II's end, L26+ at the final boss.
* Boss TTK for a sane build: Act I 30–45 s, Act II 45–60 s, Rift Heart 60–90 s.
* First-time player: about 70% reach Act II, 35% reach Act III, 15% win.
* Enemy cap 320 live, with ~60 FPS as the target on mid hardware.

**Final scope lock.** The 10 passes added: 3 acts, 4 classes, dash/perfect dodge, 6 new skills, 6 new fusions, 2 new reactions, stun, Chain, faction resist and Prism Ward, 5 new enemy archetypes, 3 bosses, 18 relics, Geodes, Shrines, 2 hazards, a grade pass, models, music and meta.

**Final cut list:** fifth element, co-op, equipment, NPCs, endless mode, bestiary, relic upgrades, destructible terrain, imported assets.

→ Locked into **DESIGN.md v1.0**.

---

## Post-build: integration playtest log (v1.0 build)

The locked design was built by 10 parallel Haiku agents on a core I wrote myself (game flow, combat, player, relics, meta). I then tuned it with the simulation harness (`src/dev/sim.js`), a kiting bot that drafts toward fusions, aims at bosses and logs damage sources.

| Finding (sim / visual) | Change |
|---|---|
| Rift Shift cleared actors mid-loop, so `actors[i]` was undefined | guarded the actor loop |
| Horde never exceeded ~50 enemies; bosses died in 7–16 s | spawn rate ×2.2, boss HP raised, then settled at 8k / 20k / 60k |
| XP curve far too generous (L19 at the end of Act I) | refit: `8+10L` (L ≤ 4), then `25 + 28L + 0.55L²`; Chain XP halved to +0.5%/chain (cap 25%) |
| 12–18 relics per run (every elite dropped a chest) | Elite Surge now has one gold-marked **Relic Bearer**; random elites drop a chest 6%; elite rate 1% |
| Stormcaller lagged behind the other classes | Spark 12 dmg, range 12, forks deal 75% of the bolt |
| Early deaths came mostly from Spitter bullets | Spitter weight 1.5 → 1.0, base regen 0.3/s, health drop 1% |
| Player could walk into the arena corners behind the rift wall | the playable arena is now a circle r = 55 |
| Verge ground had ~4,000 glowing sigils; Cinder lava cracks blew out the screen; Crown was near-white | sigils 40 → 3 per tile and dimmed; cracks thinner and darker with emissive 0.85; basalt lightened; Crown moved to slate-blue marble |
| Riftborn crowds bloomed into a white mass | body changed to deep amethyst, core glow lowered |
| Player lost in bright combat | ground ring always draws on top, brighter, with a dark inner disc |
| Announcements collided with the act title card | announcements moved to the top third, chain milestones below the player |
| Boss chest could be left behind during the Rift Shift | all items fly to the player on Shift |

Final bot results (an average player with no telegraph dodging):
* 3 of 4 classes reach Act II and 1 of 4 reaches Act III.
* L10 at about 3:10.
* Frame cost about 4 ms (simulation plus render) with 307 enemies.
