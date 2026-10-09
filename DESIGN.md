# RIFTBOUND — Game Design v5 (v2 = vibrant world + creatures; v2.1 = playtest fixes; v3 = Crownforge UI; v4 = heroes on the creature rig + world-grounded spell VFX; v5 = Rift Obelisks + raid-style boss encounters)

> An isometric horde-survival ARPG in three acts. Pick a class, weave elements into reactions, bend your build with relics, and dash through the telegraphs. Descend through the Rift and shatter its Heart.

The rationale and the cut list are in [design/PASSES.md](design/PASSES.md). The v5 raid rework is in [design/RAID_PASSES.md](design/RAID_PASSES.md) (passes; Pass 8 = round-2 tuning) and its implementer contract is [design/RAID.md](design/RAID.md). This file is the **spec**: implement the numbers as written, then tune them with the simulation harness.

---

## 1. Pillars
1. **Readable chaos.** Hundreds of enemies, but your character, the threats (red-orange telegraphs, magenta enemy shots) and your combos are always readable.
2. **Combos are discovered, not memorised.** 4 elements × 6 reactions, 10 fusions, and a map you can combo with.
3. **Play-style is rewarded.** Class traits, relics, Chain and Perfect Dodge pay out for *how* you play, not just *what* you picked.

## 2. Fantasy
Vael's mages tried to bind the four elemental Primes into the **Riftcrown**. It shattered and tore Rifts into the world. You are **Riftbound**, tethered to the Rift and unable to truly die. Each run crosses three Rift-warped lands — a goblin forest, the orc-held barrens, and the riverlands where the crown fell and dragons came to drink its light — to slay the **Prism Dragon**. Death returns you to the **Sanctum** with **Rift Shards**.

## 3. Run structure
| Act | Biome | Faction | Boss | Hazard | Geodes |
|---|---|---|---|---|---|
| I | **The Thornwood** (sunlit goblin forest) | The Greenskins (goblins, trolls, spiders) | **Gorrak, the Troll King** | none | arcane, frost |
| II | **The Sunscorch Barrens** (ochre badlands, mesas, orc war camps) | The Warband (orcs, ogres, wargs; resist Fire 50%) | **Vashkar, the Ashen Warchief** (resist Fire 50%) | Fissure Geysers | frost, storm |
| III | **The Stormwater Reach** (stormy riverlands, drowned ruins, dragons) | The Wyrmkin (dragons, naga, kobolds; elites carry Prism Ward) | **Aurelith, the Prism Dragon** (rotating Prism Ward) | Lightning Strikes | all 4 |

* **Act clock**: 3:00 of horde (`ACT_LENGTH = 180`), then the boss spawns. That 3:00 summon is the default path; Rift Obelisks can bring the boss forward (§3b). Once the boss is summoned, the horde stops and the encounter frame runs (§9b).
* **Beats per act**:

  | Time | Beat |
  |---|---|
  | 0:00 | Act title card |
  | 0:50 | **Rift Obelisks** rise: Haste / Echo / Wrath (§3b) |
  | 1:30 | **Elite Surge**: 3 elites; the gold-marked **Relic Bearer** (×1.5 HP) drops a Relic Chest |
  | 2:15 | **Swarm**: a ring of 24 swarmers |
  | 3:00 | **Boss** (default summon; the encounter, §9b) |

* **Rift Shift** (boss killed, acts I–II; after the victory beat, §9b): 2.5 s transition.
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
* Boss HP (v5): Gorrak 14,500 · Vashkar 24,000 · Aurelith 86,000 (× (1 + 0.3·tier)). Bosses drop a chest (it flies to you during the Rift Shift), a health orb and a magnet. Obelisk payouts are paid only if you win that boss fight (§3b).

## 3b. Rift Obelisks (v5)
Three obelisks rise at **0:50** of every act (the same three, always): **Haste**, **Echo**, **Wrath**. Each stands 20–32 u from you, ≥ 100° apart in bearing and ≥ 12 u from each other, inside r 48. Haste is pale cyan `#bfefff` (gold is reserved for safe zones).
* **Activation = channel.** Stand in r 3.0 for **4 s** (progress decays 0.25/s outside). During a channel, horde packs spawn 14–20 u out around that obelisk (**Rift Pull**).
* Costs attach to the **encounter**, never to the clock: activating at 2:59 does not dodge them. When the boss spawns (timer or Haste), every obelisk collapses.

| Obelisk | Effect | Cost | Pay (only if you win that boss fight) |
|---|---|---|---|
| **Haste** "Summon now" | 3 s warning ("THE HEART STIRS"; Elite Surge and Swarm don't fire during it), then the boss encounter starts. | The rest of the act's horde (XP, Elite Surge, Swarm). | **Windfall XP** = 40% of the act XP still ahead; **Haste Bounty** = `round(0.25 × seconds skipped × actMult)` shards; the boss chest offers 4 relics instead of 3. |
| **Echo** "The boss comes twice" | After the kill: 3 s **Rift Mend** (heal 20%, dash refilled), then the boss returns as an **Echo**: 55% HP, starts at Phase 2, faster. | **Strain**: +10% damage taken for the whole encounter (both bodies). | **Echo Chest**: pick 1 of 3 **Boss Relics** + 25 × actMult shards. |
| **Wrath** "Heat" (channel up to 3×) | Each channel = +1 Heat = one **boss affix**, pre-rolled and shown on the pillar before you channel (Frenzied, Bulwark, Reverberating, Rift Storm, Vengeful). Heat 2: boss HP +15%. Heat 3: HP +30%, damage +10%. | The affixes; channelling under a Rift Pull. After each heat you must step out of the ring and back in to channel again. | Heat 1: +1 relic choice. Heat 2: + **Wrath Cache** (+1 rank to a skill of your choice). Heat 3: one boss-chest choice is a guaranteed **Boss Relic**. Shards 8 / 20 / 45 × actMult (total at that heat). |

* `actMult` = [1, 1.5, 2] for acts I–III.
* **Shard guard**: obelisk shards are capped at 60% of the run's base shards (before the tier multiplier).
* **Act III**: chest and cache perks become +20 shards each instead (the run ends at the kill).
* The 3:00 path is unchanged and remains the fully balanced default.

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
| Trait | **Resonance**: every 3rd Arcane Bolt volley is *Prismatic* (carries Fire → Storm → Frost in turn, so the Arcanist sets up its own reactions); +2% dmg and +1% CDR per Chain (max 25); the Chain window is 4 s instead of 2.5 s | **Wildfire**: a burning foe that dies explodes (r 2.2 × area, 50% reaction base, fire, can react) | **Permafrost**: Frozen foes take +35% dmg; freezing a foe grants 1 Frost Armor (max 3, ≥ 1.2 s apart; each armor absorbs 60% of one hit) | **Momentum**: Charge 0–100 (+28/s moving, −60/s still); +0.5% dmg per Charge |
| Stat tilt | — | +10% dmg, −10 HP | +30 HP, −5% move | +10% move, −10 HP |
| Unlock | discover 4 reactions | **free (starter)** | defeat Gorrak, the Troll King | reach Act III |

**Why the Pyromancer starts (playtest v2.1).** The Arcanist's trait pays out per Chain, which a new player who hasn't learned reactions yet never builds. Wildfire works from the first kill: a burning foe dies and the blast spreads Burn. Act I crystals (frost, arcane) react with fire (Steam Burst, Combust), so a new player's first reactions happen on their own. The Arcanist moved to the Gorrak unlock and got a longer Chain window to make Resonance easier to hold.

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
| Frost | Chill (stacks) | −12% speed per stack; at `freezeAt` (5) stacks → **Frozen** 1.6 s (bosses 0.6 s; a boss can't be re-frozen for 4 s after a freeze) |
| Storm | Shock | 4 s × `shockDur`; takes +`shockAmp` (20%) dmg |
| Arcane | — | **Detonator**: consumes other statuses |
| — | **Stun** | can't move/attack; +25% dmg taken; bosses cap at 0.3 s and can't be stunned more than once per 1.5 s |

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
* **Hit-stop:** 45 ms on Shatter, Overload or Combust (at most once per 0.25 s, and only while Chain ≤ 3).
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
Might +12% dmg · Haste −7% cd · Swiftness +6% move and −6% dash cd · Vitality +20 HP and +0.4 regen · Magnetism +25% pickup, +5% XP and +15% reaction-kill XP · Amplify +8% area and +2% cast echo · Catalyst +25% reaction dmg · Precision +6% crit and +3% dmg · **Volley** +1 projectile (max rank 2).

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
| Gorrak's Tusk | boss | Your dash ends in a shockwave (r 3, stuns 0.5 s, knockback) and recharges 25% faster |
| Vashkar's Brand | boss | Foes' Fire resistance is ignored; Burning foes spread Burn to 2 nearby foes when they die |
| Aurelith's Scale | boss | Every 12 s your next reaction is guaranteed to echo and breaks Prism Wards |
| Riftbreaker's Sigil | boss | +60% Poise gain; Downed bosses take 20% more damage from you |
| Ashen Standard | boss | A Perfect Dodge triggers a fire burst (r 5) that burns, stuns 0.4 s and adds Stagger to bosses |
| Hollow Heartstone | boss | Every 15 s the first hit over 15% max HP is half refunded |

Boss Relics (tag `boss`) never appear in normal chests. Echo Chests and Wrath heat 3 offer them (§3b).

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

**Act III Prism Ward:** every elite, and 12% of non-swarmer Wyrmkin, gets a random ward element.

**Spawn rosters** (weight, available from act-second):

| Act | Roster |
|---|---|
| I | husk 6 @0 · imp 3 @20 · bloater 1.5 @50 · spitter 1.5 @70 · brute 1 @100 |
| II | ashHusk 5 @0 · cinderling 3 @0 · emberSpitter 1.5 @20 · pyreBomber 1.5 @35 · magmaRam 1.2 @60 · obsidianBrute 1 @90 |
| III | shardling 4 @0 · wraith 2 @0 · voidSpitter 1.5 @15 · crystalRam 1.2 @30 · prismHexer 0.8 @50 · colossus 1 @80 |

**Visual language (v2):**
* Every enemy is a procedurally modelled, procedurally animated creature (GPU-instanced rig, dark outline, blob shadow); see `design/ART.md` and `design/research/03-creature-art.md`.
  * **Greenskins** (Act I): Goblin Grunt (husk), Goblin Scamp (imp), Forest Troll (brute), Goblin Shaman (spitter), Broodmother (bloater) → Spiderlings (mite). Light olive skin over dark leather; lime accents.
  * **Warband** (Act II): Orc Raider (ashHusk), Warg (cinderling), Ogre (obsidianBrute), Orc Spirit-Shaman (emberSpitter), War Boar + goblin rider (magmaRam), Goblin Sapper (pyreBomber). Dark olive and iron; spirit-teal accents.
  * **Wyrmkin** (Act III): Dragon Whelp (shardling), Stone River Troll (colossus), Naga Tidecaller (voidSpitter), Crag Drake (crystalRam), Storm Wyvern (wraith), Kobold Prism-Shaman (prismHexer). Wine-crimson scales, saffron wings; prism-white crystals.
* Archetypes share a shape code across acts (chaser = weapon out, swarmer = low wedge, tank = block, ranged = staff over the head, charger = battering front, bomber = object overhead, blinker = big wingspan, support = oversized totem).
* Every wind-up is a pose change plus an accent glow ramp. Elites: ×1.35, gold trim, an elite-only crown/plume, gold eyes, pulsing gold rim light. Ward: fresnel-edge shell + accents recoloured to the ward element.
* Spawn-in: rises from the ground over 0.35 s in a dust puff. Death: hit-flash, then the creature topples and sinks (0.55 s).

### Bosses (v5 raid encounters; every attack telegraphed; 3 phases each)
Each boss runs inside the encounter frame (§9b). HP, arena radius and target fight length are in each heading. Full move specs and rig poses: `design/RAID_PASSES.md` Pass 4 (with the v5.1 changes in Pass 8).

**Gorrak, the Troll King** (Act I; the teaching boss; HP 14,500; arena R 20; target 60–75 s; Stagger bar 110). Teaches: leave a circle, the safe side of a cone, kill-timer objects, break checks, race adds.
* **P1 "Club and Pods"**: *Club Slam* (circle r 5 on you, 1.3 → 0.9 s; the club sticks 1.2 s, EXPOSED). *Backhand* (cone 120°, r 9, from him toward you, 1.1 s; safe = behind him or outside r 9). *Spore Pods* (3 pods flung to ring positions; each ripens over 7 s into a red spore cloud r 4 for 8 s; killed early it leaves a gold **Sap Pool**, r 2.4 for 10 s, +25% move speed). *Break Check: War Horn* (5 s, threshold 60; a fail sends 4 Goblin Runners from the wall to him; each one that arrives heals him 3% and gives him +10% damage for 8 s).
* **Intermission 1 "Timberfall"** (7 s): he leaps to the wall and hurls uprooted trees: line telegraphs (w 3) from alternating sides every 0.9 s, each shown 1 s ahead; ends with a leap onto you (circle r 6). Winded 3 s.
* **P2 "Spore Rot"**: spore clouds give Spore stacks (1/s inside; +8% damage taken and −5% speed per stack, max 5; 5 stacks roots for 1 s); Sap Pools cleanse them. Pods every 12 s, 2–3 at a time. *Slam → Backhand combo* (the backhand follows 0.85 s later toward where you went). War Horn again, threshold 70.
* **Intermission 2 "King's Wrath"** (7 s): a roar, then 3 expanding ring-waves 3.2 s apart (dash through them); all live pods ripen at once. Winded 3 s.
* **P3 "Troll Rage"** (no new mechanic): cycle −20%, Backhand 180°, War Horn every loop (threshold 70), Runners on a fail. Soft enrage at 75 s.

**Vashkar, the Ashen Warchief** (Act II; resists Fire 50%; HP 24,000; arena R 21; target 80–100 s). Teaches: in/out, generators, lava control, memory.
* **P1 "Twin Banners"**: *Axe Combo* (circle r 4.5 on him, 1.2 s, then a donut r 4.5–11 0.5 s later; safe = out, then in; each combo adds +25 Axe Heat). *Twin War Banners* at opposite sides (r 0.7 R): each living banner gives Vashkar −20% damage and pulses a ring-wave r 0→6 every 7 s; both down → **Disarmed** (Downed 5 s, +15 Stagger each). *Banner Charge* (line w 3, 0.9 s, leaves a lava trail). *Torchbearers*: when a banner falls, 2 orc thralls run from the wall to relight it (it returns at 50% HP if one arrives). *Break Check: Molten Overswing* (at Axe Heat 100; 5 s, threshold 60; success → "Quenched", heat 0, Downed; fail → cone 200° r 14 that leaves fire for 6 s).
* **Intermission 1 "Ashfall"** (8 s): he plants the axe at the centre; 3 lava lanes (w 3, full arena) sweep in a shown order 1.6 s apart. Winded 3 s.
* **P2 "Cinder Memory"**: an ember mark drops where you stand every 0.5 s for 3 s (6 marks, r 2), then they detonate in drop order 0.35 s apart (first time: 3 marks, 2 s lead). *Double Charge* (the second re-aimed; lava lasts 3.5 s). Banners re-raised rotated 90° at +30% HP; Overswing threshold 70.
* **Intermission 2 "Molten Tide"** (8 s): lava rises at the rim and the arena becomes R 16 for the rest of the fight (1.5 s gold-ring warning); 4 meteor lanes in sequence. Winded 3 s.
* **P3 "Warchief's Fury"** (no new mechanic): Meteor Rain (6 circles r 2.5, 1.1 s) in two offset waves; one banner only (+60% HP); Overswing every 30 s. Soft enrage at 95 s.

**Aurelith, the Prism Dragon** (Act III final; HP 86,000; arena R 22; target 100–120 s). Teaches: read the ward to predict the attack; line of sight behind pillars; generators; puddle placement.
* **Ward language**: the Prism Ward colour (cycle 10 s; 7 s in P3) names her *next* special: fire → flame lanes (3 parallel lines); frost → frost ring-waves (3.2 s apart, dash through); storm → Tempest (3 strikes that chase you 1.2 s, then lock; circles r 2.2); arcane → shard circles (6 delayed circles r 2.2). A reaction on her breaks the ward: that family's next cast is cancelled, +10 Stagger.
* **Arena**: 4 crystal pillars (r 1.2, solid) at 0.55 R. Pillars block beams; the shadow behind each one is a gold safe zone while a beam is live.
* **P1 "Refraction"**: *Twin Beams* (1.2 s tell, 140° sweep over 3 s; pillars block). Ward specials. *Prism Conduits* (2 crystal generators at the wall, a gold line to her; the ward re-forms 3 s after one breaks; both down → ward down 8 s, Downed 4 s). *Break Check: Prism Nova* (6 s, threshold 60; a fail is an arena-wide nova except inside pillar shadows).
* **Intermission 1 "Skyward"** (8 s): she lifts to the centre (untargetable); one beam rotates 360° over 5 s with 3 safe gaps, then a crash ring-wave. Winded 4 s.
* **P2 "Storm Reach"**: *Stormcaller Wyvern* (one at a time); its death leaves a **Lightning Rod** (gold r 2, 10 s; while you stand in it, Tempest strikes hit the rod instead). *Quadrant Prism* (3 of 4 quadrant cones, 90°, fire in sequence; the safe one is gold). Nova again at threshold 70; pillars crack (3 hits from her beams destroy one).
* **Intermission 2 "Floodfall"** (8 s): the river rises, arena R 22 → 17 (gold ring 1.5 s warning); shard rain (8 circles every 1.5 s, ×3). Winded 4 s.
* **P3 "Prismatic Overload"** (no brand-new shapes): ward cycle 7 s, and two families can overlap; Quad Beams (4). Under 8% HP the ward cycles every 3 s and every break gives +15 Stagger (a final stagger). Soft enrage at 120 s.

**Adds and objects** each have a purpose: pods (kill them before they ripen), banners (shield the boss), conduits (gate the ward), runners and thralls (race to heal or relight), wyverns (their death places a lightning rod). Adds give 0 XP.

## 9b. Encounter frame & Stagger (v5)

### Seal, landing, victory
* **Summon** (timer, Haste, or dev): the arena is set centred on you (radius Gorrak 20 / Vashkar 21 / Aurelith 22; camera zoom 0.9 / 0.88 / 0.85; camera biased 30% toward the arena centre). The wall rises over 1.5 s (thorn hedge and root arches; basalt spikes with banner poles and ember glow; crystal shards with a water curtain). The horde dissolves into XP; spawning, hazards and shrines stop. 4 **Rift Crystals** stand inside at 0.6 R (respawn 18 s).
* **Landing**: the boss lands 12 u from you toward the centre, plays its entrance pose and the intro stinger hits. Level-up and chest modals wait during the Seal and for 2.5 s after the landing.
* **Echo**: after the first body dies, a 3 s **Rift Mend** (heal 20%, dash refilled, hostiles cleared), then the Echo rises at 55% HP, starting at Phase 2.
* **Victory**: boss dies → hit-stop, slow-mo 0.6 s, the score's resolution plays; the wall sinks over 2.4 s; `encounterEnd`, then `bossKilled` → Rift Shift (acts I–II) or Victory (Act III). Chest, health orb and magnet drop. **Death during the fight ends the run.** No retry.

### Phases and intermissions
* 3 phases, gated at **66% and 33%** HP. Damage past a gate is absorbed until the intermission ends: you can't skip a phase.
* **Intermissions** 7–9 s: the boss is untargetable, runs one learned pattern at arena scale, and ends **Winded** (3 s; Aurelith 4 s) with +1 dash charge.
* **Soft enrage** from 75 s (Gorrak) / 95 s (Vashkar) / 120 s (Aurelith) of active fight: +5% damage and 5% faster per 10 s. No hard enrage.
* A boss can't be re-frozen for 4 s after a freeze, and can't be stunned more than once per 1.5 s.

### Stagger (Poise)
A 0–100 bar under the nameplate (Gorrak 110), filled by play, not raw damage:

| Source on the boss | Stagger |
|---|---|
| Shatter | +14 |
| Steam / Overload / Combust | +10 |
| Superconduct / Arc Flash | +8 |
| Frozen | +6 |
| Stunned | +4 |
| Perfect Dodge of a boss attack | +10 |
| Rift Crystal blast catching the boss | +10 |
| Generator destroyed (banner, conduit) | +15 |
| Status pressure: boss carries Burn / Chill / Shock | +1.5 every 0.5 s |
| Chain bonus on any reaction | +0.5 × Chain (max +5) |

* **Fatigue**: reactions on a boss are scaled by `1 / (1 + fatigue / 4)`. Each reaction adds +1 fatigue; fatigue decays with τ 4 s.
* Vashkar halves Stagger from fire-led reactions (Combust, Steam).
* Decay 3/s, starting 3 s after the last gain (paused during Break Checks). Rift Tier: gains × (1 − 0.05·tier).
* **DOWNED** (bar full): the boss drops into its stagger pose for **4 / 5 / 6 s** (P1/P2/P3), takes **+40% damage**, and its current cast and hostile telegraphs are cancelled (lingering zones stay). Then **Recovery** 8 s: the bar is locked at 0 and the next threshold × 1.25 (reset each phase).
* **EXPOSED** windows (generator destroyed, ward broken, post-intermission): the boss takes +20% damage. Target: 35–45% of a fight is a damage window.

### Break Checks
* Once per phase, the boss's signature cast (4.5–6 s), shown as a named cast bar with a threshold marker on the Stagger bar ("WAR HORN — 60").
* Target = max(base, current bar + base), capped at the bar.
* **Success** (bar past the marker before the cast ends) → cast cancelled and Downed +2 s. **Failure** → the cast resolves: a survivable but costly effect, never instant death.

### Telegraph grammar
* **Hostile red** (one colour) = danger.
* **Gold** `SAFE_GOLD` `#ffc83a`, a solid rim with diagonal stripes = "go here" (sap pools, lightning rods, pillar shelters, safe quadrants). Gold is never used for anything else.
* **Dashed rims** = Rift Crystals and friendly things.
* Lead times: first use ×1.4 (the teaching rule), normal 0.9 s, announced follow-ups ≥ 0.6 s (Gorrak's combo backhand 0.85 s). Dash-through ring patterns are ≥ 3.2 s apart. At most 3 hostile shapes live at once.

## 10. World
* **Bounds** ±60 (playable circle r 55). An open world look: the arena edge is disguised by natural features (forest tree line / canyon mesas / cliffs and waterfalls) and the ground continues into haze. Per-biome props and obstacles (trees, rocks, logs / acacias, boulders, skulls / willows, ruins, boulders), rebuilt during Rift Shift. See `src/game/env/`.
* **Boss arenas** (v5): on a boss summon a themed wall seals an arena centred on you (§9b). Inside it the horde, hazards, shrines and spawning are off.
* **Rift Crystals** (internally "geodes"):
  * 8 live at a time, each respawning 25 s after it breaks. Element pool per act (§3).
  * During a boss encounter the outside geodes go dormant; 4 Rift Crystals stand inside the arena at 0.6 R, respawning 18 s after they break (§9b).
  * Inert (`inert: true`): not auto-targeted, no statuses, no XP, no kill count. HP 10 × actHp (one or two hits).
  * Broken → **4.5 u burst** dealing 20 × actHp damage of its element, with statusPower 3 (applies status → reactions).
  * **Look (playtest v2.1):** playtesters read the old rock-with-crystals as an ore node to mine. Now a tall crystal floats and turns over a glowing rift scar, with three shards orbiting it. There is no rock base. A dashed ground ring in the element colour marks the exact blast radius. While a foe stands inside it, the ring lights up, and the crystal pulses and jitters faster ("shoot it now"). The burst's shockwave lands exactly on the ring.
* **Shrines:**
  * One at a time. The first appears at 0:35 of each act; the next spawns ~50 s after one is claimed or expires (it expires after 40 s unclaimed). Placed 14–22 u from the player.
  * Stand within r 2.2 for 2.5 s (a progress ring shows) to claim a 25 s buff:

    | Shrine | Buff |
    |---|---|
    | Fury | +40% dmg |
    | Celerity | −30% cd, +15% speed |
    | Greed | magnetise all XP, +50% XP |
    | Aegis | +60 shield |

  * The HUD shows an edge arrow toward it. Shrines stop during boss encounters.
* **Hazards** (damage everyone; paused during boss encounters):
  * Act II **Fissure Geysers**: every 2.5 s, 2 vents at random spots within 14 u of the player (1.2 s telegraph, r 2.4), 15 × actDmg to the player, 40 × actHp to enemies, plus Burn.
  * Act III **Lightning Strikes**: every 1.6 s, 3 strikes within 12 u (1.0 s telegraph, r 1.8), 12 × actDmg to the player, 35 × actHp to enemies, plus Shock.

## 11. Look & feel
* Per-act **daylight atmosphere** (sun = the `moon` DirectionalLight; warm sun, cool blue sky light so shadows read cool; Neutral tone mapping; shader haze instead of fog; drifting cloud shadows). Values live in each biome definition (`src/game/env/biomes/*.js`):

  | Act | Mood |
  |---|---|
  | Thornwood | warm late-morning sun, lush layered greens, dappled light, pollen and butterflies |
  | Sunscorch Barrens | hot golden afternoon, ochre ground, red-rock mesas outside the arena, dust |
  | Stormwater Reach | stormy dramatic sky with sun breaks, cool light, river and waterfalls, lightning flashes |

* **Grade pass** after bloom: vignette (≈0.18), tint, saturation, low-HP red edge pulse with desaturation below 30% HP, and a chromatic-aberration kick on `pulse('hit'|'perfect'|'shift')`.
* **Screen shake (playtest v2.1):** there are two channels.
  * **Threat** shake comes from anything that hurts you: hits, boss attacks, hazards, the Rift Shift. It uses full trauma.
  * **Self** shake comes from your own reactions, impacts and blasts. It is capped at trauma 0.32. Each kick is damped by the self-shake of the last ~second, but a lone kick lands in full.
  * A late-game fight used to shake hard on ~20% of frames. With the two channels it's ~2%, and average shake is ~8× lower.
  * Reaction hit-stop only plays at Chain ≤ 3, so high Chains don't stutter.
  * Title-screen setting: Shake Full / Reduced / Off (`meta.shake`).
* **Heroes (v4)** are creature-rig characters, one order of Vael per class (full spec `design/research/09-hero-bible.md`, contract `design/HEROES.md`):
  * Pyromancer = **Cinderwright** forge-priest: squat, with a bronze brazier-gauntlet, a kiln pack and a chimney.
  * Cryomancer = **Stillwater Warden**: a white fur A-frame with a hex-crystal crook and Frost Armor shards orbiting.
  * Stormcaller = **Tempest Rider**: a dark hat disc, a lemon scarf and swallow-tails, and a forked conductor's rod.
  * Arcanist = **Loomwarden**: a floating broken crown-halo, a floating tome and orbiting glyph-stars.
  * Each wears the Crownshard clasp. The body faces the aim while casting and the legs follow the movement (strafe and backpedal).
  * The focus glows with the last-cast element. The element shows at rest, tied to the class meter (embers / armor shards / tine arcs / halo spin).
* **Spell VFX (v4)**: every ability is drawn as a real phenomenon of the world. Fire is forge billows with soot; frost is a squall, rime and spikes; storm is slate thunderheads and forked bolts; arcane is rune circles, void and starlight. Zone edges are physical features at the exact gameplay radius, never flat circles. See `design/VFX.md` and `design/research/10-ability-vfx-bible.md`.
* **HUD** (v3 "Crownforge", full spec in `design/UI.md`, rationale in `design/UI_PASSES.md`):
  * top centre: act timeline (act gems, 0:00–3:00 track with Elite Surge / Swarm / Boss markers, timer) + a beat ribbon ("Elite Surge in 0:08"); in boss fights the boss frame: name, 3 phase pips with notches at 66% and 33%, the Prism Ward badge (element gem + countdown, Aurelith), a STAGGER bar (steel-white, with a threshold marker during a Break Check and a DOWNED state), a cast bar for Break Checks and named casts, Wrath affix pips, an Echo pip, and SEALED / DOWNED / WINDED / EXPOSED chips. Obelisks: edge markers, an approach card at ≤ 10 u (cost, pay, the net level estimate for Haste, the rolled affix for Wrath), a channel ring, and armed chips on the act timeline (the boss marker slides to "now" on Haste)
  * bottom centre: one compact action bar: level, HP (shield hatch, damage ghost), XP line, dash socket with charge pips, 5 skill sockets with cooldown sweeps and rank pips, auto-skill gems, auto-cast toggle, buffs with radial timers
  * under the character: mini HP, dash pips, Frost Armor pips / Momentum strip (replaces the old trait panel)
  * right lane: CHAIN ×N (white → amber → prism), milestone stamps, Arcanist Resonance meter, reaction feed, discovery toasts
  * top-left relic tray; edge markers for shrines, the Relic Bearer and dropped chests
  * level-up: keys 1–3, **F** reroll, **X** banish; cards show rank pips before → after and the change, plus the current loadout
* **Audio**:
  * Procedural music per act: drone + arpeggio. An intensity layer follows enemy count. Each boss has its own score (`src/game/audio/scores.js`): sections intro / p1 / inter / p2 / inter2 / p3, plus Downed, Break Check, enrage and Echo overlays and a victory resolution.
    * Gorrak: F minor pentatonic, 6/8, taiko and bone horn.
    * Vashkar: C phrygian-dominant march, moving to 7/8 in P3.
    * Aurelith: Eb lydian, organ and choir; the chord follows the Prism Ward.
  * SFX: dash, perfect dodge, relic open/pick, geode shatter, shrine claim, Rift Shift, boss phase, ward break, chain milestones (10/25/50), Seal and landing, Break Check success/fail, Downed, obelisk arm and payout.

## 11b. Onboarding: the Rift Primer (playtest v2.1)
The Rift Primer is a first-run tutorial (`src/game/tutorial.js`) played inside Act I itself. It has no separate level, no modal and no pause. A small objective panel on the left walks through one step at a time:
* a progress pip row
* the HUD element the step is about pulses gold
* "Skip tutorial" link

While the primer runs it **holds the act clock** at 0:00, at most 150 s. The shrine, Elite Surge and boss wait, and the spawner stays at its gentlest rate.

| # | Objective | Completes when |
|---|---|---|
| 1 | Hold LMB to cast your starter. Your bolts leave foes Burning (or your element's status). | 5 kills |
| 2 | Press Space to dash. Mid-dash you can't be hit. Dash as an attack lands for a PERFECT dodge. | a dash |
| 3 | A Rift Crystal of the complementary element (fire → frost, frost → fire, storm → frost, arcane → fire) spawns 8 u toward the cursor, with a 6-goblin pack (3.5× HP) on its far side and a bobbing **SHOOT IT** marker. "Shoot it while foes are inside its ring." | the crystal breaks with foes in the blast |
| 4 | "Now hit the Chilled foes with your Fire! Two elements on one foe set off a REACTION." | any reaction (0.9 s slow-mo) |
| 5 | Names the reaction (e.g. STEAM BURST = Fire + Frost) and explains Chain and that crystals keep coming. | 7 s |

* If the blast hits nobody, or the marked foes die without reacting (9 s), step 3 repeats with a "try again" hint, at most 3 times.
* If foes are already Burning, the blast itself sets off the reaction, and step 4 is skipped.
* On the primer run's first level-up, the card footer explains that a skill of another element lets you make reactions yourself.
* `meta.tutorialDone` is set when the primer finishes or is skipped. Dying mid-primer replays it next run. The title-screen **Tutorial** checkbox replays it and also resets the tips. Saves with runs from before v2.1 count as done.
* **One-time tips** (`meta.tips`) use the same panel, are shown once per profile, and never interrupt the primer:
  * the first Rift Crystal you walk near (for players who skipped the primer)
  * the first Shrine
  * the first boss (red telegraphs, dash through)
  * v5 boss tips: Stagger, intermissions, Winded, Break Checks and King's Wrath (one-time each). The death screen names the move that killed you.
  * Act II (orcs resist Fire 50%, geysers)
  * Act III (Prism Wards, any reaction breaks them)

## 12. Meta (Sanctum)
* **Rift Shards per run** = `floor(kills/30) + 15·actsReached + 40·bossesKilled + floor(min(maxChain, 300)/10)`, × (1 + 0.25·tier). The Chain term caps at 30 shards.
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
* Levels: L5 at 1:00, L10 at the Act I boss, L18 at Act II's end, L26+ at the final boss. XP to next level: `8 + 10L` for L ≤ 4, L ≥ 12 `25 + 28L + 0.55L²`; L5–L11 blend linearly from `48 + 40(L−4)` into that curve. Queued level-ups are drafted hand after hand in one modal ("N of M").
* Player base: 100 HP, 0.3 HP/s regen. Health orb drop 1% (elites 25%). The playable arena is a circle of radius 55 inside the octagonal rift wall.
* Boss fight length (default lane, sim n ≥ 8): Gorrak 60–75 s, Vashkar 80–100 s, Aurelith 100–120 s (v4 bands were 30–45 / 45–60 / 60–90 s). Poise: about 1 natural Downed per 25–30 s for a reaction build. Haste at 1:30: fight length ≤ 1.35× the target. Bot death rate not worse than v4.2 by more than 10 points in a god-off A/B.
* Average FPS ≥ 55 with 320 enemies on mid hardware.
