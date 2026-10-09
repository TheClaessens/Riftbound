# Riftbound v4 — Spell VFX contract (implementers)

**Goal (the playtester's words):** abilities must *look and feel part of the world*: "instead of drawing a circle to resemble a blizzard, draw an actual blizzard in that zone". This applies to **every** ability and effect.

**What it should look like:** `design/research/10-ability-vfx-bible.md`. It has an element language for each element (§2), per-ability beat sheets for every skill, fusion, reaction, dash and trait (§4), and readability law (§5). Follow it.

**How it's built:** `design/research/08-spell-vfx-tech.md` (§1–§6), the toolkit in `src/game/vfx/`. Where these docs disagree on **API**, this file wins.

## Hard rules
1. **Gameplay is frozen.** Never change damage, radius, duration, tick rate, cooldown, targeting, status power, knockback, the order of `damageEnemy` calls, events or ids. Change visuals only. If a visual needs gameplay data (e.g. the exact crater radius), read it; don't recompute it differently. A/B sims against `backup/riftbound-v3.0-preheroes.zip` will check this.
2. **Exclusive file ownership** (table below). Edit nothing else. If you need a change in a core file (toolkit, fx.js, rig, player.js), work around it in your own file and report it, or send a short message to `main` if it truly blocks you.
3. **Readability law** (bible 10 §5):
   - Never use red or magenta (hue 330°–15°).
   - Show zone edges with a physical feature at the gameplay radius (±5%), with interiors at ≤ 0.25 α.
   - "Glow = live."
   - Big shapes are painted (opaque toon), small accents glow.
   - Painted whites stay at linear ≤ 1.0 (no bloom).
   - Never hide the hero or hostile telegraphs and bullets.
   - Starters: head ≤ 0.45 u wide; respect `game.vfx.budget()` and `game.fx.budget()` under spam.
4. **Performance:**
   - No per-frame allocation in hot paths, and no new materials or geometries per cast unless pooled. Prefer `game.vfx.*`; it is pooled and costs no extra draw calls.
   - Use `game.fx.light` at most once per impact.
   - Keep `fx.lightning` (it allocates) for rare events only; prefer `game.vfx.bolt`.
5. **Reuse first.** Use the toolkit primitives and add data (presets, recipes) to **your element file**. Prefix every new registry name with your element (`fireEmber`, `frostSquall`…).

## Ownership
| Bundle | Files (exclusive) |
|---|---|
| **A Fire** | `skills/cinderBolt.js`, `skills/fireball.js`, `skills/meteor.js`, `skills/fusions/starfall.js`, `skills/fusions/cataclysm.js`, `skills/fusions/frostfireComet.js`, `vfx/elements/fire.js`, `vfx/hero/fire.js` |
| **B Frost** | `skills/iceShard.js`, `skills/frostNova.js`, `skills/blizzard.js`, `skills/fusions/hailstorm.js`, `skills/fusions/absoluteZero.js`, `vfx/elements/frost.js`, `vfx/hero/frost.js` |
| **C Storm** | `skills/spark.js`, `skills/chainLightning.js`, `skills/staticField.js`, `skills/fusions/thunderhead.js`, `skills/fusions/tempest.js`, `skills/fusions/plasmaOrb.js`, `skills/fusions/stormHalo.js`, `vfx/elements/storm.js`, `vfx/hero/storm.js` |
| **D Arcane** | `skills/arcaneBolt.js`, `skills/spiritOrbs.js`, `skills/singularity.js`, `skills/fusions/arcaneBarrage.js`, `vfx/elements/arcane.js`, `vfx/hero/arcane.js` |
| **E Reactions & statuses** (after A–D) | `vfx/reactions.js`, `vfx/elements/mixed.js`, `vfx/status.js` |
| orchestrator (core) | `vfx/index.js`, `textures.js`, `particles.js`, `debris.js`, `shells.js`, `decals.js`, `ribbons.js`, `clouds.js`, `presets.js`, `recipes.js`, `heroFx.js`, `fx.js`, `skills/common.js`, `skills/fusionCommon.js`, `combat.js`, `player.js`, the rig, the heroes |

`presets.js` / `recipes.js` hold the toolkit's reference presets and recipes (`blizzard`, `meteor`, `meteorImpact`, `vortex`, `storm`, `skyStrike`, `shatter`, `snowStreak`, `flameLick`, …). Use them as they are, or copy one into your element file under a new name and change it there.

## Toolkit API (`game.vfx`, see the header of `src/game/vfx/index.js`)
```js
vfx.emit(preset, pos, { count, scale, speed, dir, cone, vel, radius })                 // one-shot burst
vfx.emitter(preset, { pos, follow, rate, radius, area, y, vel, land, life, scale })    // → { pos, rate, stop() }
vfx.debris(kind, pos, n, { scale, speed, dir, cone, color })                            // rock dirt ember ice crystal + yours
vfx.sprout(kind, pos, { scale, life, tilt })                                            // crystal grows, holds, shatters
vfx.shell(style, pos, { radius, height, y, life, follow })                              // → { end(), touch() }
vfx.decal(kind, pos, radius, life, { grow, fade, color, alpha, accent, hdr, intensity, extra, yaw })  // kinds: frost scorch rune crater wet shadow → { end() }
vfx.trail(target, { color, width, hdr, segLen })                                        // target = any {x,y,z} (e.g. proj.pos) → { stop() }
vfx.bolt(from, to, { color, width, hdr, life, jag, branches })                          // pooled forked bolt with ink edge
vfx.cloud(pos, { radius, height, style, life, back })                                   // → { flash(k), end() }
vfx.zone(recipe, pos, opts) / vfx.impact(recipe, pos, opts)                             // composites from RECIPES
vfx.budget()                                                                             // 1 calm … ~0.35 heavy spawn pressure
```
- **Preset format:** the header of `vfx/presets.js` (layer, cell, orient, curves, ink, erode).
- **Sprite cells:** `puff wisp flame streak star snowflake iceChip flake rune rune2 droplet ring curl zigzag dot glint`.
- **Shell styles:** `vfx/presets.js` `SHELLS`.
- **Recipes:** `vfx/recipes.js`. Shows how zones are composed and updated, and how `end()` works.

Your element file exports `PARTICLES`, `SHELLS`, `RECIPES` and `DEBRIS`; they are merged into the registries at load.

**Projectiles** (`skills/common.js` `Projectile`):
- `mesh: null` for no default sphere, or your own Object3D.
- `ribbon: { color, width, hdr, segLen }` for a ribbon trail.
- `onUpdate(game, proj, dt)` per frame, `onDispose(game, proj)` once at the end. Plus the existing `onHit`/`onExpire`.
- The old `trail` (round dots) still exists. Replace it.

**Classic `game.fx`** (rings, discs, round bursts, `lightning`, `telegraph`, `light`, `shake`, `text`/`number`) still works. Bible 10 §3 limits rings, discs and round dots to small accents. Keep the existing *friendly* telegraphs (dashed rim, element colour). Keep `shake` and `light` calls at similar strength.

**Hero hooks** (`vfx/hero/<element>.js`, dispatched by `vfx/heroFx.js`):
- **Events:** `dashStart`, `dashTrail`, `dashHit`, `castFlash` (for any skill of your element; `point` = the casting hand or focus).
- **`idle(game, player, dt)`:** every frame for *your* class. Bible 09 §5 idle element FX, tied to `player.model.H.meter` / `.armor`.
- **Fire only:** `firePatch*` and `wildfire`.
- **Frost only:** `armorGain` / `armorBreak`.
- **Arcane only:** `perfectDodge`, plus `anyClass(game, player, dt)`, which runs for every class (Adrenaline motes) and draws the Arcanist's Resonance halo.

**World points on the hero (visual only):** `player.muzzle(out)` (the focus emitter), `player.hand(out)` (the hand that fired the last starter shot) and `player.model.emitter(name, out)`. The emitter names are:
- Pyromancer: `chimney`, `palm`, `coal`
- Cryomancer: `crystal`, `hem`
- Stormcaller: `tineL`, `tineR`, `hatPin`
- Arcanist: `wand`, `tome`, `halo`

Until a hero exists, a missing emitter falls back to the hero position.

## Verification (mandatory, iterate until it's genuinely good)
Shots server: `http://localhost:8097`. Use **your own browser tab**: `tabs_create`, then always pass that `tabId`. Never touch other tabs. The pane is usually hidden, so its own screenshots are stale. Save frames and **Read the PNGs**:
```js
// in your tab at http://localhost:8097/?unlockall
const S = await import('/src/dev/shot.js?v=' + Date.now());
await S.stage({ classId: 'cryomancer', act: 0, zoom: 1.4 });    // god-mode run, HUD hidden, 1280×720, enemies around
await S.castAt('blizzard', 5, 4, -2);                           // any skill / fusion id at rank, at player + (dx, dz)
S.step(0.4); await S.shot('frost-blizzard-t04');                // advance synchronously, save dev/shots/<name>.png
S.step(1.2); await S.shot('frost-blizzard-t16', { around: __game.player.pos, size: 9 });   // crop
```
- **Timeline:** shoot each ability at several moments (anticipation, impact, linger, end, and just after the end, to check cleanup).
- **Conditions:** shoot each at rank 1 and rank 5, at zoom 0.8 and 1.6, and in all three acts (`act: 0|1|2`: green, ochre and teal-green ground).
- **Fusions and autos:** for an auto skill, `__game.player.learnSkill(SKILLS[id])` (import `SKILLS` / `ALL_DEFS` from `/src/game/skills/registry.js`) and step. For a fusion, cast its def with `S.castAt('<fusionId>', 3, dx, dz)`.
- **Hero hooks:** dash with `__game.player.botDash = true; S.step(0.1)`, and set the class with `stage({ classId })`.
- **Stress test:** cast your skills repeatedly for 10 s with 200+ enemies (`act: 2`, step 20 s first). Measure `performance.now()` around `S.step(5)`, and report the draw calls `__game.engine.renderer.info.render.calls` after a render.
- **Console:** check for errors (`read_console_messages`).
- **Comparison:** compare every ability against its spec in bible 10 §4 and the "it's a real thing" detail. Then compare it with a monster at the same zoom: does it belong to the same world?

## Final report (< 40 lines)
Per ability: what it looks like now (one line), and the shot files worth looking at. Also report perf numbers, any deviations from the bible and why, helper functions you exported for the reactions bundle, and requests for core changes.
