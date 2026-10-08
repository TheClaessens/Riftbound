# RIFTBOUND — Game Design v1.0 (LOCKED)

> An isometric horde-survival ARPG in three acts. Pick a class, weave elements into reactions, bend your build with relics, and dash through the telegraphs. Descend through the Rift and shatter its Heart.

The rationale and the cut list are in [design/PASSES.md](design/PASSES.md). This file is the **spec**: implement the numbers as written, then tune them with the simulation harness.

---

## 1. Pillars
1. **Readable chaos.** Hundreds of enemies, but your character, the threats (red-orange telegraphs, magenta enemy shots) and your combos are always readable.
2. **Combos are discovered, not memorised.** 4 elements × 6 reactions, 10 fusions, and a map you can combo with.
3. **Play-style is rewarded.** Class traits, relics, Chain and Perfect Dodge pay out for *how* you play, not just *what* you picked.

## 2. Fantasy
Vael's mages tried to bind the four elemental Primes into the **Riftcrown**. It shattered and tore Rifts into the world. You are **Riftbound**, tethered to the Rift and unable to truly die. Each run is a descent through three warped strata to the **Rift Heart**. Death returns you to the **Sanctum** with **Rift Shards**.

## 3. Run structure
| Act | Biome | Faction | Boss | Hazard | Geodes |
|---|---|---|---|---|---|
| I | **The Hollow Verge** (violet/teal ruined cloister) | The Hollow | **The Hollow Warden** | none | arcane, frost |
| II | **The Cinder Wastes** (basalt, lava cracks, embers) | The Ashborn (resist Fire 50%) | **Vashkar, the Cinder Colossus** (resist Fire 50%) | Lava Vents | frost, storm |
| III | **The Shattered Crown** (pale crystal ruins, storm) | The Riftborn (elites carry Prism Ward) | **The Rift Heart** (rotating Prism Ward) | Lightning Strikes | all 4 |

* **Act clock**: 3:00 of horde (`ACT_LENGTH = 180`), then the boss spawns. While a boss lives, the horde spawns at 35%.
* **Beats per act**:

  | Time | Beat |
  |---|---|
  | 0:00 | Act title card |
  | 1:30 | **Elite Surge**: 3 elites; the gold-marked **Relic Bearer** (×1.5 HP) drops a Relic Chest |
  | 2:15 | **Swarm**: a ring of 24 swarmers |
  | 3:00 | **Boss** |

* **Rift Shift** (boss killed, acts I–II): 2.5 s transition.
  1. Hit-stop, then a white-violet flash.
  2. All live enemies dissolve and drop their XP.
  3. Enemy projectiles are removed.
  4. The biome morphs (palette, ground, props, lights).
  5. The act title card shows, and the next act begins.
* Killing the Act III boss is a **Victory**. Total run length ≈ 10–11 min.

### Scaling (`m` = act minutes elapsed = actTime / 60; `tier` = Rift Tier)

| Quantity | Formula | Act I | Act II | Act III |
|---|---|---|---|---|
| Enemy HP | `base × actHp × (1 + 0.35m + 0.06m²) × (1 + 0.3·tier)` | actHp 1 | actHp 2.6 | actHp 6.5 |
| Enemy damage | `base × actDmg × (1 + 0.1m) × (1 + 0.12·tier)` | actDmg 1 | actDmg 1.45 | actDmg 2.0 |
| Enemy XP | `base × actXp` | actXp 1 | actXp 1.7 | actXp 2.6 |
| Spawn rate (enemies/s) | `rateBase + rateRamp × m` | 2.4 + 1.5m | 3.8 + 1.9m | 5.0 + 2.2m |

* Live cap: 320.
* Elite chance (after 0:45 of an act): 1%.
* Elites have ×4 HP, ×1.35 radius, ×6 XP (min 10), ×1.3 damage and a rim aura. Random elites drop a Relic Chest 6% of the time (≈ 7 relics per full run, counting surges and bosses).
* Boss base HP: Warden 8,000 · Vashkar 20,000 · Rift Heart 60,000 (× tier mult). Bosses drop a chest (it flies to you during the Rift Shift), a health orb and a magnet.

## 4. Controls
| Input | Action |
|---|---|
| WASD / arrows | Move (camera-relative) |
| Mouse | Aim |
| LMB | Class starter skill (hold) |
| RMB / Q / E / R | Active skill slots 1–4 (hold) |
| **Space** | **Dash** |
| T | Auto-cast toggle (RMB/Q/E/R fire at the nearest foe) |
| Wheel | Zoom |
| Esc / P | Pause + Codex |
| M | Mute |

## 5. Classes
| | Arcanist | Pyromancer | Cryomancer | Stormcaller |
|---|---|---|---|---|
| Element / colour | arcane `#c08cff` | fire `#ff7a33` | frost `#7fe0ff` | storm `#ffe45c` |
| Starter (LMB) | Arcane Bolt | Cinder Bolt | Ice Shard | Spark |
| Dash | **Phase Step**: instant blink, 5.5 u, cd 2.4 s, arcane burst at arrival (r 2, 10 dmg, *detonates statuses*) | **Flame Dash**: 5 u / 0.16 s, cd 3.0 s, leaves a fire trail (2 s, 4 fire dmg / 0.4 s, r 1.2) | **Glacial Slide**: 5 u / 0.2 s, cd 2.8 s, chills foes along the path (r 1.6, 6 frost dmg, statusPower 2) | **Lightning Dash**: 6 u / 0.12 s, **2 charges**, cd 1.8 s each, shocks foes along the path (r 1.3, 8 storm dmg) |
| Trait | **Resonance**: +2% dmg and +1% CDR per Chain (max 25) | **Wildfire**: a burning foe that dies explodes (r 2.2 × area, 50% reaction base, fire, can react) | **Permafrost**: Frozen foes take +35% dmg; freezing a foe grants 1 Frost Armor (max 3, ≥ 1.2 s apart; each armor fully absorbs one hit) | **Momentum**: Charge 0–100 (+28/s moving, −60/s still); +0.5% dmg per Charge |
| Stat tilt | — | +10% dmg, −10 HP | +30 HP, −5% move | +10% move, −10 HP |
| Unlock | free | defeat the Hollow Warden | discover 4 reactions | reach Act III |

**Dash (all classes).** I-frames for the dash duration + 0.1 s. Direction is the movement input, or the aim direction when standing still.

**Perfect Dodge.** If damage would land in the first **0.25 s** of a dash, you take no damage and trigger PERFECT:
* "PERFECT" text and 0.35 s slow-mo (×0.3)
* 90 ms hit-stop
* all dash charges refunded
* **Adrenaline**: +30% dmg for 3 s

Once per dash. Event: `perfectDodge`.

## 6. Elements, statuses, reactions
| Element | Status | Effect |
|---|---|---|
| Fire | Burn | 3 s × `burnDur`; dps = (6 + 1.6·lvl) × dmg × `burnDmg` |
| Frost | Chill (stacks) | −12% speed per stack; at `freezeAt` (5) stacks → **Frozen** 1.6 s (bosses 0.6 s) |
| Storm | Shock | 4 s × `shockDur`; takes +`shockAmp` (20%) dmg |
| Arcane | — | **Detonator**: consumes other statuses |
| — | **Stun** | can't move/attack; +25% dmg taken; bosses cap at 0.3 s |

Reaction base = `(18 + 7·level) × stats.reaction`. A reaction can't trigger a reaction (depth guard), except via the status it applies.

| Reaction | Trigger | Effect |
|---|---|---|
| **STEAM BURST** | Fire ↔ Chill/Frozen | AoE r 2.8 × area, 1.0 × base; consumes both statuses |
| **OVERLOAD** | Fire ↔ Shock | AoE r 3.2 × area, 1.3 × base, knockback 14 |
| **SUPERCONDUCT** | Frost ↔ Shock | arcs to 4 foes within 6.5 u (0.6 × base, frost, statusPower 2); re-chills the target |
| **SHATTER** | Arcane → Frozen | hit ×2.5; shards r 2.2, 0.4 × base |
| **COMBUST** *(new)* | Arcane → Burn | instant `max(0.8 × base, remainingBurn × 3)` to the target, 50% splash r 2.2; spreads Burn to the 3 nearest foes within 4 u |
| **ARC FLASH** *(new)* | Arcane → Shock | stuns the target and foes within 3 × area for 1.2 s; 0.5 × base to each |

* **Chain:** a reaction within 2.5 s of the previous one adds +1 Chain. Otherwise Chain resets to 1. Chain gives +0.5% XP per Chain (cap +25%). The HUD shows **CHAIN ×N**, and peak Chain is recorded in run stats.
* **Hit-stop:** 45 ms on Shatter, Overload or Combust (at most once per 0.25 s).
* **Resistances:** `enemy.resist = { fire: 0.5 }` multiplies damage *and* status duration for that element.
* **Prism Ward:** `enemy.ward = 'fire'|'frost'|'storm'|'arcane'` makes the foe immune (0 dmg, no status, "IMMUNE" label at most every 0.5 s). **Any reaction on the warded foe breaks the ward** (shatter FX, event `wardBroken`).
* **Barrier:** `enemy.barrier` points absorb damage before HP (from the Prism Hexer).

## 7. Skills
**Slots:**
* LMB = class starter (slot 0, fixed)
* RMB/Q/E/R = slots 1–4
* Max 2 **auto** skills (no `cast()`)
* Fusions take the slot of parent A (or B), so a starter fusion stays on LMB.
* Active skills rank 1–5. Fusions rank 1–3. Fusion card = both parents at rank ≥ 3 (guaranteed to show).

### 7.1 Starters (class-only, `classOnly`)
| Skill | Element | Spec (r1 → r5) |
|---|---|---|
| Arcane Bolt | arcane | (existing) |
| **Cinder Bolt** | fire | cd [.30 .28 .26 .24 .22]. Fast bolt (speed 22, range 14, ±0.06 rad jitter), 8 dmg, applies Burn. r2 +1 bolt · r3 +25% dmg · r4 +1 bolt · r5 bolts pierce 1 and statusPower 1.5 |
| **Ice Shard** | frost | cd [.50 .48 .45 .42 .38]. Piercing shard (speed 20, range 15, pierce 2), 16 dmg, statusPower 2. r2 +20% dmg · r3 +1 shard (fan 0.18) · r4 pierce +2 · r5 +1 shard, and each shard splits into 3 mini-shards (6 dmg) when it expires |
| **Spark** | storm | cd [.32 .30 .28 .26 .24]. Short bolt (speed 30, range 12), 12 dmg; on hit forks to 2 more foes within 4 u (75% of the bolt damage each, lightning FX). r2 +1 fork · r3 +25% dmg · r4 fork range 6 · r5 +1 spark (fan) |

### 7.2 Shared
| Skill | Element | Spec |
|---|---|---|
| Fireball | fire | (existing) |
| Frost Nova | frost | (existing) |
| Chain Lightning | storm | (existing) |
| Spirit Orbs | arcane, **auto** | (existing) |
| **Meteor** | fire | cd [4.5 4.2 3.9 3.6 3.2], range 16. At the cursor (clamped to 14 u): 0.8 s orange telegraph, then impact 60 dmg r 3.2 × area, knockback 8, plus a burning crater r 2.6 for 2.5 s (8 fire dmg / 0.5 s). r2 +25% dmg · r3 second meteor 3 u away 0.25 s later · r4 crater 4 s · r5 +30% radius |
| **Blizzard** | frost | cd [7 6.5 6 5.5 5]. Zone at the cursor r 3.5 × area for 4 s; every 0.33 s, 5 frost dmg (statusPower 1) to all inside. r2 +15% radius · r3 6 s · r4 +40% dmg · r5 zone gently pulls foes inward (2 u/s) |
| **Static Field** | storm, **auto** | Every [1.3 1.2 1.1 1.0 0.9] s, sky-strike [1 1 2 2 3] random foes within 10 u for 22 dmg (storm). r4 +30% dmg |
| **Singularity** | arcane | cd [9 8.5 8 7.5 6]. Vortex at the cursor r 5 × area for 2.5 s: pulls non-boss foes toward the centre (up to 7 u/s), arcane 4 dmg / 0.25 s, then collapses for 30 dmg r 3. r2 +20% radius · r3 3.5 s · r4 collapse ×2 · r5 cd −1.5 s |

### 7.3 Fusions
| Fusion | Recipe | Type | Spec (r1; r2; r3) |
|---|---|---|---|
| Frostfire Comet | Fireball + Frost Nova | active | (existing) |
| Plasma Orb | Fireball + Chain Lightning | active | (existing) |
| Storm Halo | Chain Lightning + Spirit Orbs | auto | (existing) |
| Arcane Barrage | Arcane Bolt + Spirit Orbs (Arcanist) | auto | (existing) |
| **Absolute Zero** | Frost Nova + Singularity | active, frost, cd [8 7 6] | At the cursor: pull for 1.2 s (r 6), then **freeze** all within r 6 (frost statusPower 6), then 0.3 s later an arcane pulse of 40 dmg (r 6) → mass **Shatter**. r2 +30% dmg; r3 a second pulse 0.5 s later |
| **Cataclysm** | Meteor + Singularity | active, fire, cd [7 6.2 5.5] | Pull for 1.5 s (r 6), then a giant meteor: 160 dmg r 5, knockback 12, burning crater r 4 for 4 s. r2 +30% dmg; r3 three 50-dmg meteors follow around the crater |
| **Thunderhead** | Blizzard + Static Field | **auto**, storm | A storm cloud follows the player (lagging, r 6). Every 0.4 s: frost 4 dmg to all inside. Every 0.9 s: a sky strike on a random foe inside (30 storm) → constant Superconduct. r2 +20% radius; r3 strikes every 0.6 s |
| **Starfall** | Cinder Bolt + Meteor (Pyromancer) | active (LMB) | Cinder Bolts as at r5; every 4th bolt **hit** calls a meteor at the hit point (45 dmg r 2.6 + Burn) after a 0.5 s telegraph. r2 +30% dmg; r3 every 3rd hit |
| **Hailstorm** | Ice Shard + Blizzard (Cryomancer) | active (LMB) | Fan of 5 shards (pierce 3, 18 dmg, statusPower 2). Each leaves a mini-blizzard (r 2, 2 s, 4 frost / 0.33 s) where it expires. r2 +30% dmg; r3 7 shards |
| **Tempest** | Spark + Static Field (Stormcaller) | active (LMB) | Spark chains up to 6 foes (r3: 8), 14 dmg per jump; each jump has a 25% chance to call a sky strike (30 storm). r2 +30% dmg |

### 7.4 Passives (rank 1–5, max 5 different)
Might +12% dmg · Haste −7% cd · Swiftness +8% move · Vitality +20 HP and +0.4 regen · Magnetism +30% pickup and +6% XP · Amplify +10% area · Catalyst +25% reaction dmg · Precision +6% crit · **Volley** +1 projectile (max rank 2).

### 7.5 Level-up
3 cards. A guaranteed fusion card if one is available. **Reroll** (2 per run + Fortune) and **Banish** (1 per run + Exile; the card's id is removed from this run's pool). "Rift Essence" (heal 40%) is the filler.

## 8. Relics
Dropped by **Relic Chests** (every elite, every boss). Opening a chest = pick 1 of 3 (4 with Hoarder's Lantern). There is no cap, no duplicates, and they're shown in the HUD tray. Each has an id, a name, an icon, a one-sentence effect, a flavour line, and a tag.

| Relic | Tag | Effect |
|---|---|---|
| Alchemist's Coil | reaction | +40% reaction damage |
| Prism Lens | reaction | Reactions have a 25% chance to echo (trigger again) |
| Unstable Core | reaction | Overload +50% radius and stuns for 0.6 s |
| Ember Heart | fire | Burn lasts 2× as long and deals +50% damage |
| Pyre Crown | fire | Killing a burning foe heals 0.5 HP |
| Rime Shard | frost | Foes Freeze at 3 Chill instead of 5 |
| Glacier Plate | frost | −3% damage taken per Frozen foe within 6 u (max −24%) |
| Stormglass Boots | storm | +15% move speed, −30% dash cooldown |
| Conductor's Ring | storm | Shock lasts 2×, and Shocked foes take +40% (instead of +20%) |
| Glass Sigil | risk | +50% damage, −40% max HP |
| Blood Pact | risk | +1 projectile; lose 1 HP/s while above 50% HP |
| Duelist's Mark | dodge | Perfect Dodge heals 8% HP, and Adrenaline lasts 6 s |
| Thorned Ward | dodge | When hit, release a nova (r 4) dealing 300% of the damage taken |
| Hoarder's Lantern | economy | +30% XP; chests offer 4 relics |
| Rift Magnet | economy | Foes killed by reactions drop double XP |
| Echo Stone | cast | Slotted skills have a 15% chance to cast twice |
| Overclock | cast | Every 8th skill cast resets all your cooldowns |
| Second Wind | safety | Once per run, survive lethal damage at 50% HP and freeze foes within 6 u |

## 9. Enemies
Archetype (behaviour + model) × faction (palette, name, resist).

| Archetype | Behaviour |
|---|---|
| chaser | Walks at the player. Contact damage (0.8 s cd). |
| swarmer | Fast, fragile. |
| tank | Slow, huge HP, kbResist 0.7. |
| ranged | Holds 8–10 u, 0.4 s windup glow, then a magenta shot (Ember: applies Burn to the player visually only; Void: 3-shot spread). |
| charger | Within 9 u: stops, **line telegraph** 0.7 s (width 1.4, length 10), charges at 18 u/s for 10 u, then 1.2 s recovery. |
| bomber | Speed 4. Within 2.2 u: **fuses** 1.0 s (circle telegraph r 2.8), then explodes, hurting the player (2× dmg) **and** enemies (60 + 20·act dmg). Killed before exploding: detonates instantly and damages **enemies only**. |
| splitter | On death spawns 3 mites (swarmer stats × 0.4 HP). |
| blinker | Every ~4 s (when 5–14 u away): 0.5 s purple telegraph at a spot 2.5 u from the player, then teleports there. |
| support | Holds 9–12 u; every 6 s grants allies within 7 u a barrier of 30% of their max HP (visible bubble). |

| Type id | Act | Archetype | HP | Spd | Dmg | XP | Notes |
|---|---|---|---|---|---|---|---|
| husk | I | chaser | 18 | 3.0 | 6 | 1 | |
| imp | I | swarmer | 12 | 5.6 | 6 | 1 | |
| brute | I | tank | 90 | 2.2 | 18 | 4 | |
| spitter | I | ranged | 30 | 2.6 | 10 | 2 | |
| bloater | I | splitter | 45 | 2.0 | 10 | 3 | |
| mite | any | swarmer | 5 | 6.2 | 4 | 0 | spawned by splitters |
| ashHusk | II | chaser | 20 | 3.2 | 6 | 1 | resist fire |
| cinderling | II | swarmer | 12 | 6.0 | 6 | 1 | resist fire |
| obsidianBrute | II | tank | 110 | 2.2 | 20 | 5 | resist fire |
| emberSpitter | II | ranged | 30 | 2.6 | 10 | 2 | resist fire |
| magmaRam | II | charger | 60 | 2.8 | 16 | 3 | resist fire |
| pyreBomber | II | bomber | 25 | 4.0 | 14 | 2 | resist fire |
| shardling | III | swarmer | 12 | 6.2 | 6 | 1 | |
| colossus | III | tank | 140 | 2.0 | 22 | 6 | |
| voidSpitter | III | ranged | 32 | 2.6 | 10 | 2 | 3-shot |
| crystalRam | III | charger | 65 | 3.0 | 16 | 3 | |
| wraith | III | blinker | 28 | 3.4 | 10 | 2 | |
| prismHexer | III | support | 40 | 2.4 | 6 | 4 | |

**Act III Prism Ward:** every elite, and 12% of non-swarmer Riftborn, gets a random ward element.

**Spawn rosters** (weight, available from act-second):

| Act | Roster |
|---|---|
| I | husk 6 @0 · imp 3 @20 · bloater 1.5 @50 · spitter 1.5 @70 · brute 1 @100 |
| II | ashHusk 5 @0 · cinderling 3 @0 · emberSpitter 1.5 @20 · pyreBomber 1.5 @35 · magmaRam 1.2 @60 · obsidianBrute 1 @90 |
| III | shardling 4 @0 · wraith 2 @0 · voidSpitter 1.5 @15 · crystalRam 1.2 @30 · prismHexer 0.8 @50 · colossus 1 @80 |

**Visual language:**
* ≤ 3 meshes per enemy, with emissive faction-coloured eyes/cores:
  * Hollow: moss-grey flesh, cyan eyes.
  * Ashborn: charred black with glowing orange cracks.
  * Riftborn: pale violet crystal with a white-cyan core.
* Elites get a pulsing rim aura. Ward is a rotating translucent shell in the ward element's colour.
* Spawn-in: rises from the ground over 0.35 s. Death: 0.12 s white squash-shrink, then the burst.

### Bosses (2 phases, phase 2 at 50% HP; every attack telegraphed)
* **Hollow Warden** (r 1.8). Cycle (every 3.2 s, 2.2 s in phase 2):
  * **Slam**: circle r 5 at the player, 1.0 s telegraph, 1.6 × dmg.
  * **Summon**: 6 husks.
  * **Volley**: 12 radial shots (24 in phase 2, two rings).
* **Vashkar** (r 2.2, resist fire). Cycle 3.0 s (2.2 s in phase 2):
  * **Charge**: line telegraph 0.9 s, 22 u/s, leaves a lava trail (2.5 s, burns the player 8/0.5 s); phase 2 does 2 charges in a row.
  * **Meteor Rain**: 6 circles r 2.5 around the player, 1.1 s telegraph.
  * **Flame Ring**: an expanding ring from Vashkar (speed 9, width 0.8) that must be dashed through; phase 2 sends 2 rings 0.6 s apart.
* **Rift Heart** (r 2.4, hovers, slow drift toward the player).
  * **Ward cycle**: rotates its Prism Ward element every 10 s. It can't be broken permanently; a reaction on it removes the ward for the rest of that cycle.
  * **Twin Beams**: 2 opposite beams (length 22, width 1.2) telegraphed 1.0 s, then sweeping 180° over 3 s (phase 2: 4 beams, faster).
  * **Prism Volley**: 5 fans of 5 shots.
  * **Summon**: 4 shardlings + 1 wraith.
  * Phase 2 adds **Shard Rain**: 8 random circles every 4 s.

## 10. World
* **Bounds** ±60. Per-biome props/obstacles (pillars and dead trees / basalt spires and rocks / crystal spires and floating ruins), rebuilt during Rift Shift.
* **Rift Geodes:**
  * 8 live at a time, each respawning 25 s after it breaks. Element pool per act (§3).
  * Inert (`inert: true`): not auto-targeted, no statuses, no XP, no kill count. HP 30 × actHp.
  * Broken → **4.5 u burst** dealing 20 × actHp damage of its element, with statusPower 3 (applies status → reactions).
* **Shrines:**
  * One at a time. The first appears at 0:35 of each act; the next spawns ~50 s after one is claimed or expires (it expires after 40 s unclaimed). Placed 14–22 u from the player.
  * Stand within r 2.2 for 2.5 s (a progress ring shows) to claim a 25 s buff:

    | Shrine | Buff |
    |---|---|
    | Fury | +40% dmg |
    | Celerity | −30% cd, +15% speed |
    | Greed | magnetise all XP, +50% XP |
    | Aegis | +60 shield |

  * The HUD shows an edge arrow toward it.
* **Hazards** (damage everyone):
  * Act II **Lava Vents**: every 2.5 s, 2 vents at random spots within 14 u of the player (1.2 s telegraph, r 2.4), 15 × actDmg to the player, 40 × actHp to enemies, plus Burn.
  * Act III **Lightning Strikes**: every 1.6 s, 3 strikes within 12 u (1.0 s telegraph, r 1.8), 12 × actDmg to the player, 35 × actHp to enemies, plus Shock.

## 11. Look & feel
* Per-act **atmosphere**:

  | Act | Background | Hemisphere sky / ground | Moon | Grade tint |
  |---|---|---|---|---|
  | Verge | `#07080d` | `#8a9bff` / `#1a1020` | `#c4d0ff` 1.7 | cool |
  | Cinder | `#0d0605` | `#ff9a6a` / `#200a05` | `#ffb080` 1.5 | warm, high contrast |
  | Crown | `#0a0d14` | `#cfe8ff` / `#141a2a` | `#e0f0ff` 1.9 | cold, slightly desaturated |

* **Grade pass** after bloom: vignette (0.35), tint, saturation, low-HP red edge pulse with desaturation below 30% HP, and a chromatic-aberration kick on `pulse('hit'|'perfect'|'shift')`.
* **Class models** with distinct silhouettes (Pass 9). The staff orb glows with the last-cast element.
* **HUD**:
  * act bar (3 segments + skull markers, top centre)
  * HP bar with shield overlay
  * dash pips
  * trait meter
  * CHAIN ×N (right of centre)
  * relic tray (top-left)
  * shrine edge arrow
  * skill bar with radial cooldowns and key labels
  * boss bar with name and phase pip
* **Audio**:
  * Procedural music per act: drone + arpeggio. An intensity layer follows enemy count, and a boss layer plays during bosses.
  * SFX: dash, perfect dodge, relic open/pick, geode shatter, shrine claim, Rift Shift, boss phase, ward break, chain milestones (10/25/50).

## 12. Meta (Sanctum)
* **Rift Shards per run** = `floor(kills/30) + 15·actsReached + 40·bossesKilled + floor(maxChain/10)`, × (1 + 0.25·tier).
* **Attunements** (cost = 20 × next rank). Each lists the bonus per rank, then the maximum rank:

  | Attunement | Per rank | Max rank |
  |---|---|---|
  | Might | +4% dmg | 5 |
  | Vigor | +8 max HP | 5 |
  | Insight | +5% XP | 5 |
  | Swiftcast | −3% cd | 5 |
  | Fortune | +1 reroll | 3 |
  | Exile | +1 banish | 3 |

* **Rift Tier** 0–5 unlocks progressively: winning at tier N unlocks N+1.
* **Codex**: reactions 6, fusions 10, relics 18, classes 4.
* Saved in `localStorage['riftbound.meta.v1']`. `?unlockall` in the URL unlocks all classes (for testing).

## 13. Balance targets
* Levels: L5 at 1:00, L10 at the Act I boss, L18 at Act II's end, L26+ at the final boss. XP to next level: `8 + 10L` for L ≤ 4, else `25 + 28L + 0.55L²`.
* Player base: 100 HP, 0.3 HP/s regen. Health orb drop 1% (elites 25%). The playable arena is a circle of radius 55 inside the octagonal rift wall.
* Boss time-to-kill: 30–45 s / 45–60 s / 60–90 s.
* Average FPS ≥ 55 with 320 enemies on mid hardware.
