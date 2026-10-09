# Riftbound v4 — Heroes & Spellcraft: design passes

The playtester's verdict on v3: *"both the playable characters, and their abilities, are lacking compared to the monsters"*. Two key questions: **do the characters fit in the world**, and **do their abilities look and feel part of the world** ("instead of drawing a circle to resemble a blizzard, can't we draw an actual blizzard effect in that zone?"). Every ability and effect is in scope, not only the ones named.

Gameplay numbers, ids, events and save data stay **identical** (DESIGN.md §5–§7). This is a look-and-feel overhaul, verified by A/B sims against `backup/riftbound-v3.0-preheroes.zip`.

---

## Pass 0 — Audit (v3.0, measured with `src/dev/shot.js` frames at zoom 1.4–1.8)

| Area | Verdict |
|---|---|
| Hero models | **Failing.** Each class is a primitive stack (`models.js`): a cylinder robe, a sphere head, a cone hat, a stick staff. No arms, no legs, no hands, no face. At play scale they read as chess pawns with a ground ring. They are the least detailed objects on screen, while the goblins next to them have faces, weapons, ears and gaits. |
| Hero animation | **Failing.** The whole body rotates to face the aim and bobs on a sine. There's a 0.28 rad lean while dashing. Casting only pulses the staff orb. There is no cast pose, no stride, no hit react and no death. The monsters have wind-ups, strikes, recoils and topples. |
| World fit | **Weak.** Monsters use the rig look (vertex colours, top-lit gradient, Lambert, 1.6 px outline, emissive accents that ramp on wind-up). Heroes use MeshStandard with metalness, so they look like plastic chess pieces lit differently from everything around them. The lore says they are mages of Vael bound to the Primes, but nothing in their kit says so: they are four generic "wizard in robe" variants. |
| Starter bolts | **Weak.** Glowing spheres plus a dot trail. Fire, frost and storm bolts differ only by hue. Ice Shard is not a shard and Spark is not a spark. |
| Ground zones (Blizzard, Meteor crater, Static Field, Singularity, Thunderhead, Hailstorm) | **Failing.** They are flat discs and rings with a handful of dots. Blizzard is a blue disc with a cyan ring and some falling dots. Singularity is a black ball in purple rings. Meteor is two pink spheres over rings: no rock, no fall, no crater. |
| Impacts / explosions | **Weak.** Every explosion is the same recipe (ring + flash disc + round particle burst). Fire, frost, storm and arcane blasts differ only in colour. Nothing is left on the ground afterwards. |
| Reactions | **Weak.** Same recipe in a different colour. Steam Burst has no steam, Shatter has no shards, and Overload has no shock dome. |
| Statuses on enemies | **Weak.** Burn is a few rising dots, Frozen is a light tint wash, and Shock shows nothing. You can't tell at a glance who is burning or frozen. |
| Dashes | **Weak.** A coloured dot burst, plus a lightning line for the blink. Flame Dash leaves a dot trail and no scorched ground. Glacial Slide leaves no ice. |
| Readability | **OK, keep.** Hostile red and magenta are reserved, ground decals draw over grass, and blend-add glows hold up on bright ground. The new look must not lose this. |
| FX tech | **Limiting.** There is one round-dot point system, plus rings and discs that create a new `ShaderMaterial` per call. There are no shaped particles, streaks, debris, shells, ribbons or animated decals, so no skill author *could* draw a blizzard. |

**Diagnosis:** the world and the monsters got two art passes, and the heroes and their spells got none. The fix is a toolkit problem before it is an art problem. The heroes need the creature rig, and the spells need a real VFX vocabulary (shaped particles, physical debris, shader shells, living ground decals, clouds, ribbons, status overlays). Only then can each ability become a real thing in the world.

---


## Pass 1 — Heroes belong to the world (art direction)
**Critique.** Four robe-and-hat wizards that differ only in hue. None of them is from Vael, and none matches the Crownforge UI.
**Decisions** (bible 09):
- Each class is an order of Vael that forged one part of the Riftcrown:
  - **Cinderwright** forge-priest: squat, with a bronze brazier-gauntlet, a kiln pack and a chimney spike.
  - **Stillwater Warden**: a tall white A-frame with a hex-crystal crook.
  - **Tempest Rider**: lean, with a dark hat disc, a yellow scarf and a forked rod.
  - **Loomwarden**: slender, with a floating broken crown-halo and a tome.
- Shared Crownforge materials: rift-iron and crown-bronze. Each hero wears the **Crownshard clasp**, the in-world twin of the UI class sigils.
- Readability among 300 monsters:
  - every hero has a value extreme against every biome ground;
  - every hero uses a hue its act's faction doesn't;
  - the focus is the only accent that blooms at rest;
  - heroes get an element rim and a 2.0 px outline (monsters stay at 1.6 px).
- **Keep the ground ring.** Draw it under the boots and add an aim notch.
**Overrules v3 Pass 9:** the "distinct silhouettes" of the primitive models.
**Cut:** cosmetic skins, gear swaps and the Tier ≥ 3 "Ascended" trim are left for later.

## Pass 2 — Heroes move like characters (animation)
**Critique.** The whole body rotated to the aim and bobbed. Casting was an orb pulse.
**Decisions:**
- Heroes use the same instanced rig as the monsters (`src/game/heroes/`, on its own renderer).
- The controller (`HeroModel`) owns all state. Each class's `animate()` is stateless, built from layers in `hero.js`.
- **Twin-stick split.** The root faces the aim while casting. The hips yaw up to 0.7 rad toward the movement, with a backpedal frame (hysteresis at 90°/110°). The legs swing along the local move vector.
- **Rapid cast:** a held stance plus a 70 ms recoil per shot. Hands alternate where the class has two casting hands. The glow carries the rhythm.
- **Pose per skill:**
  - throw: Fireball, Chain Lightning, the projectile fusions
  - heavy: Meteor, Blizzard, Singularity, Cataclysm, Absolute Zero
  - nova: Frost Nova
  - channel: shrine claims and the Rift Shift
- **Other poses:** one per dash, hit react, a death that ends in a **Rift recall**, and victory.
- The i-frame blink becomes a tint pulse, so the hero never disappears.
**Cut:** IK foot planting (stride-matched gait is enough at iso scale) and a cloth simulation (procedural cloth bones instead).

## Pass 3 — A real VFX vocabulary (toolkit)
**Critique.** Effects were made of five primitives, and only hue told the elements apart. No skill author *could* draw a blizzard.
**Decisions** (research 08), in `src/game/vfx/`:
- stateless GPU instanced-quad particles with a procedural ink-outlined sprite atlas and erosion;
- instanced debris and sprouting crystals;
- noise shells: snow veil, fire pillar, funnel, blast dome;
- one-draw ground decals: frost creep, scorch, rune, crater, wet, shadow;
- pooled ribbons for trails and forked bolts;
- toon clouds that dither over the player;
- status looks in the rig shader (`iMisc.yzw`: char and embers, frost dusting, ice body, shock flicker), plus ice-block, flame and arc overlays.

The whole toolkit is about 12–14 draw calls in total.
**Cut:** a GPU particle simulation (stateless motion suffices), screen-space distortion and real volumetrics.

## Pass 4 — Every ability is a real thing (direction)
**Decisions** (bible 10):
- **Element languages:**
  - Fire: forge billows with charcoal soot; never red.
  - Frost: angular whites with navy ink; it falls, creeps, holds and cracks.
  - Storm: lemon forks on slate cloud, gone in ≤ 0.15 s.
  - Arcane: void pools, glyphs and starlight; it converges, then pops.
- **Zones** show their radius with a physical edge (drift ridge, slag lip, rune circle, rain curtain), never a flat circle.
- "Glow = live."
- **Rank escalation:** r3 adds a signature layer, r5 adds a second one plus a white-hot core, and fusions add one world-scale element.
- **Colour fixes:** Combust moves off pink; Tempest's telegraph gets the storm colour.
**Ownership:** bundles A Fire, B Frost, C Storm and D Arcane run in parallel. E (reactions and statuses) follows, reusing their published helpers.
**Cut for this pass:** the hostile-telegraph mask uniform, the same-element MAX blending for decals, and the coverage readback tooling. These are backlog, revisited only if verification shows a readability problem.
