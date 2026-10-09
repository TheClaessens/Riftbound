# Riftbound — Architecture & Module Contracts (v5.0 — Rift Obelisks + raid-style boss encounters; v4.0 heroes on the rig + world-grounded spell VFX)

Read `DESIGN.md` for the game design (numbers are there). This file is the **contract** every module must respect.

## Ground rules
* Plain ES modules, **no build step**, no npm. Import Three.js as `import * as THREE from 'three';` and addons as `'three/addons/...'` (import map in `index.html`, three r170).
* Relative imports **must include `.js`**.
* The world is the XZ plane and **Y is up**. Ground is y = 0. Entities use `pos: THREE.Vector3` with `pos.y = 0`.
* Units: 1 unit ≈ 1 m. Player ~1.8 tall, radius 0.5. Arena ±60.
* Tone mapping is **Neutral** (exposure 1.3). Bloom thresholds the **peak channel** of pre-exposure linear HDR at 1.1 with a soft knee (`patchBloomHighPass` in engine.js): sunlit ground never blooms, HDR > 1.1 does. To make something glow on bright ground prefer `blendAddMaterial(color, { hdr, occ })` from `fx.js` (adds glow AND darkens what is behind) over plain additive `glowMaterial`. Keep spell bodies at ×1.4–1.8 HDR, small cores ×2–2.5.
* **Never add/remove `THREE.Light`s at runtime** (shader recompiles). Use `game.fx.light(pos, color, intensity, life)`.
* Reuse geometries from `GEO` (utils.js) or module-level constants. **Never create geometry per frame.** `dispose()` per-instance materials/geometries.
* Performance budget: ~320 enemies. Enemies are **GPU-instanced creature rigs** (one draw call per creature type + one outline draw; see "Creatures"). Never give an enemy its own meshes except small attachments on `enemy.mesh` (ward shell, relic marker).
* Readability palette:
  * Player spells use element colours (`ELEMENT_COLOR`).
  * **Enemy projectiles are hot magenta `0xff2a6d`**: opaque body, white-hot core, dark outline shell, ground shadow dot.
  * **Hostile telegraphs are one red, `HOSTILE_RED = 0xff2a3d`** (`fx.telegraph` ignores other colours unless `{ keepColor: true }`; player-cast telegraphs pass `{ friendly: true }` → dashed element-coloured rim). Ground decals use `depthTest: false` so grass never hides them, and render in the **opaque** pass (custom blending, renderOrder 1–2) after the grass and BEFORE creatures (3) and heroes (21), so they never wash over units.
  * The world is bright and mid-value: no red / pink / magenta props or flowers in the playfield (telegraph and bullet colours).
* `window.__game` exposes the game for debugging. A simulation harness drives `player.botMove = {x,z}` and `player.botDash = true`.

## File map & ownership
```
index.html, css/style.css
src/main.js                       loop
src/core/engine.js                renderer, iso camera, bloom, atmosphere + GRADE PASS        (graphics)
src/core/input.js, events.js, utils.js
src/game/game.js                  state machine, acts, chain, hit-stop, level-up/chest flow   (core)
src/game/player.js                class, dash, perfect dodge, traits, buffs, relics           (core)
src/game/heroes/hero.js           defineHero, layer writer L, pose/keys/addKeys/twoKey, shared layers (gait, aimTwist, cloth…)  (heroes core)
src/game/heroes/index.js          HEROES registry, HeroModel controller (h.hero channels), ground ring + aim notch          (heroes core)
src/game/heroes/{pyromancer,cryomancer,stormcaller,arcanist}.js   the four hero models + animate (design/HEROES.md)  (heroes)
src/game/combat.js                damage, statuses, 6 reactions, ward/resist/barrier          (core)
src/game/classes.js, acts.js, meta.js, relics.js, progression.js                              (core)
src/game/fx.js                    classic FX: round particles, rings, discs, lightning, telegraphs, lights, shake, texts (core)
src/game/vfx/index.js             game.vfx toolkit: particles, debris, shells, decals, ribbons, clouds, status overlays (design/VFX.md) (vfx core)
src/game/vfx/{textures,particles,debris,shells,decals,ribbons,clouds,presets,recipes}.js   toolkit systems + reference presets/recipes (vfx core)
src/game/vfx/elements/{fire,frost,storm,arcane,mixed}.js   per-element presets/recipes/debris/shells + shared helpers (vfx bundles)
src/game/vfx/hero/{fire,frost,storm,arcane}.js + heroFx.js   dashes, traits, idle element FX, cast flashes (dispatcher: heroFx.js)  (vfx bundles)
src/game/vfx/reactions.js, status.js   reaction / freeze / ward / kill visuals; status overlays on enemies (vfx bundle E)
src/game/pickups.js               xp, health, magnet, chest                                   (core)
src/game/enemies.js               archetypes × factions, EnemyBullet; drives creature rigs    (enemies)
src/game/bosses.js                facade: createBoss(game, id, pos, opts), AFFIXES, WARD_CYCLE  (bosses)
src/game/bosses/core.js           BossBase (shapes, poise, phases, adds, objects, zones), POISE, RingWave, Zone  (bosses core)
src/game/bosses/affixes.js        Wrath affixes (frenzied, bulwark, reverberating, rift storm, vengeful)  (bosses core)
src/game/bosses/{gorrak,vashkar,aurelith}.js   boss scripts: moves, rotation, intermissions  (boss agents)
src/game/bosses/legacy.js         v4 bosses, frozen (fallback while a script has `static ready = false`)  (frozen)
src/game/encounter.js             encounter director (v5): summon → Seal → fight → Echo → victory; ARENAS  (encounter)
src/game/obelisks.js              Rift Obelisks (v5): channel, stakes, Windfall, Wrath heat, payouts  (obelisks)
src/game/creatures/bosses/{common,gorrak,vashkar,aurelith}.js   boss rigs + poses; bossModels.js is the facade  (creatures)
src/game/arena/{wall,common,geo,verge,cinder,crown}.js   encounter walls per boss/biome (Thornwood hedge, basalt, crystal)  (arena)
src/game/spawner.js               act-aware spawning, beats, boss spawn                       (bosses)
src/game/creatures/rig.js         PartBuilder, defineCreature, Pose, shaders (instanced rig)  (creatures)
src/game/creatures/renderer.js    CreatureRenderer: instancing, bone texture, outlines, blobs (creatures)
src/game/creatures/index.js       enemy type → creature def registry                          (creatures)
src/game/creatures/greenskins.js  Act I models · warband.js Act II · wyrmkin.js Act III · bossModels.js
src/game/world.js                 World contract, Rift Crystals (geodes), shrines, hazards, boss arena (`setArena`); owns the biome    (world)
src/game/tutorial.js              Rift Primer (first-run tutorial) + one-time contextual tips; owns its DOM    (tutorial)
src/game/env/biome.js             buildBiome(def): ground, grass, water, props, motes          (env)
src/game/env/common.js            ENV uniforms, patchEnv (wind, haze, clouds, dither), noise   (env)
src/game/env/{ground,field,water,props,motes,lighting}.js   env systems                         (env)
src/game/env/biomes/{forest,barrens,river}.js + props_*.js  the three biome definitions        (env)
src/dev/sim.js, src/dev/viewer.js, dev/creatures.html        balance sim (runSim with `obelisks`, jumpToBoss), snap(), creature + hero viewer (dev)
src/dev/shot.js                   headless frames (pinned 1280×720) → dev/shots/*.png via the shots server (8097); stage/castAt/step (dev)
src/game/audio.js                 procedural SFX + music (base; Audio mixes in the modules below)  (audio)
src/game/audio/{scores,score,voices,sfx,offline}.js   boss scores (SCORES, BOSS_KEY), score engine, boss voices, raid SFX, DEV offline render  (audio)
src/ui/icons/set-raid.js          raid icon set (obelisks, poise / downed / break check, affixes, fight objects)  (ui-icons)
src/game/skills/*.js              skills (gameplay + their visuals); registry.js, common.js (Projectile), fusionCommon.js (core)
src/game/skills/fusions/*.js      one file per fusion skill
css/theme.css, src/ui/scale.js    Crownforge tokens + primitives (.cf-plate/-frame/-socket/-bar/-btn…), root unit   (ui-core)
src/ui/icons/index.js + set-*.js  SVG icon sprite: icon(id), ICON.*; sets: skills, relics, react, misc, raid           (ui-icons)
src/ui/hud.js, hud-fx.js, hud-util.js + css/hud.css   in-run HUD, event overlays, cached DOM setters + Meter (ui-hud)
src/ui/ui.js + css/modals.css     UI orchestrator; level-up, relic chest, pause (build/codex)  (ui-modals)
src/ui/menus.js + css/menus.css   title / Sanctum, game over / victory                        (ui-menus)
src/dev/uishots.js, dev/icons.html, dev/ui-kit.html   UI harness, icon gallery, primitives page  (dev)
```

## The `game` object
| Member | Meaning |
|---|---|
| `scene`, `camera`, `engine`, `input`, `events` | as named |
| `state` | `'title' \| 'playing' \| 'levelup' \| 'relic' \| 'paused' \| 'shift' \| 'dead' \| 'victory'` |
| `phase` | `'horde' \| 'boss' \| 'shift'` |
| `time` | total run seconds |
| `act` (0..2), `actTime`, `actDef` | current act index, seconds into the act, and `ACTS[act]` (acts.js) |
| `tier` | Rift Tier 0..5 |
| `player`, `enemies`, `boss`, `fx`, `vfx`, `world`, `pickups`, `spawner`, `ui`, `audio` | `vfx` = the world-grounded spell VFX toolkit (src/game/vfx/, design/VFX.md) |
| `creatures`, `heroes` | CreatureRenderers: enemies + bosses (renderOrder 3), the player hero (2.0 px outline, renderOrder 21) |
| `encounter` | Encounter director (encounter.js, v5): `summon(reason)`, `arena` (`{ center, r, r0, zoom }`), `setArenaRadius(r, sec)`, `holdModals()`. `game.phase === 'boss'` while it runs |
| `obelisks` | Rift Obelisks (obelisks.js, v5): channel state; writes `game.run.stakes` (reset per act) |
| `chain` | current reaction Chain (0 = none) |
| `stats` | `{ kills, damageDealt, reactions:{type:n}, fusions:[names], level, time, maxChain, bossesKilled, act, classId, tier, … }`. At run end it also has `shardsEarned, unlocks:[classIds], tierUnlocked, totalShards, victory, relics:[names]` |
| `meta` | persistent save (meta.js): `{ shards, attune:{id:rank}, unlocked:{classId:true}, codex:{reactions,fusions,relics}, stats, maxTier, lastClass, lastTier, unlockAll, shake (1/0.5/0), tutorialDone, tips:[ids] }` |
| `codex` | `meta.codex` |
| `run` | `{ rerolls, banishes, banished:Set }` |
| `autoCast` | boolean (T) |
| `start({ classId, tier })` | start a run |
| `quitToTitle()` | abandon the run and show the title |
| `togglePause()`, `slowmo(dur, scale)`, `hitStop(sec)` | |
| `addActor(a)`, `addEnemy(e)`, `liveEnemyCount()` | |
| `queryEnemies(pos, r, out?)` | **Returns a reused array; `.slice()` it before dealing damage while iterating.** Includes inert geodes. |
| `nearestEnemy(pos, maxRange, excludeSet?)` | skips dead and **inert** |
| `queueChest()` | (pickups) a Relic Chest was collected |

### Events (`game.events.on(name, fn)` → unsubscribe fn)
| Event | Payload |
|---|---|
| `runStart` | `{ classId, tier }` |
| `actStart` | `{ act, def }`. Also fires at run start for act 0. UI shows the act title card; spawner/world react. |
| `riftShift` | `{ from, to }`. Boss died; 2.5 s transition. `world.setBiome(nextId)` is called by game at 40%. |
| `runEnd` | `{ victory, stats }` |
| `tick` | `{ dt }`, every gameplay frame |
| `levelUp` | `{ level }` |
| `enemyKilled` | `{ enemy }` (not emitted for inert objects) |
| `enemyFrozen` | `{ enemy }` |
| `reaction` | `{ type: 'steam'\|'overload'\|'superconduct'\|'shatter'\|'combust'\|'arcflash', pos, enemy }` |
| `chainMilestone` | `{ chain: 10\|25\|50 }` |
| `chainEnd` | `{ chain }` |
| `wardBroken` | `{ enemy, element }` |
| `discovered` | `{ kind: 'reactions'\|'fusions'\|'relics', id }`, the first time ever |
| `fusion` | `{ def, recipe }` |
| `skillLearned` / `skillRankUp` | `{ def, rank? }` |
| `cast` | `{ def, rank, slot, echo }` |
| `dash` | `{ kind: 'blink'\|'flame'\|'frost'\|'storm' }` |
| `perfectDodge` | `{ source }` |
| `buff` | `{ id, duration, def }` (shrines, adrenaline) |
| `relicGained` | `{ def }` |
| `chestOpened` | `{ relics }` |
| `playerHit` | `{ amount, source }` |
| `playerDied` | `{}` |
| `bossSpawned` | `{ enemy, final, echo }`: emitted by encounter.js at the landing (1.5 s after the Seal). Sets `game.boss = enemy` first. |
| `bossPhase` | `{ enemy, phase: 2\|3 }`: emitted at the end of an intermission (gates at 66% and 33% HP) |
| `bossKilled` | `{ enemy, final }`: emitted by encounter.js after the victory beat (wall sinks 2.4 s), then Rift Shift or Victory |
| `encounterStart`, `encounterEnd` | the Seal begins / the victory beat begins. Full list: next section |
| `announce` | `{ text, sub?, color? }`: big centre-screen announcement |
| `shrineSpawned` / `shrineClaimed` | `{ type, pos }` |
| `geodeBroken` | `{ element, pos, hits }` (hits = foes caught in the blast) |
| `hazard` | `{ kind: 'lava'\|'lightning', pos }` (on impact) |
| `autoCastChanged` | `{ on }` |
| `xpCollected` / `itemCollected` | `{ value }` / `{ type: 'health'\|'magnet'\|'chest' }` |

### Raid encounter events (v5; payloads in `design/RAID.md` § Events)
| Event | Payload | Notes |
|---|---|---|
| `encounterStart` | `{ bossId, act, arena, stakes, reason }` | the Seal begins (music: cut act theme, riser) |
| `encounterEnd` | `{ victory: true, enemy, final, bossId }` | victory beat begins |
| `bossIntermission` | `{ enemy, index: 1\|2, dur }` | boss untargetable for `dur` |
| `bossDowned` | `{ enemy, dur, reason: 'stagger'\|'break'\|'winded' }` | |
| `bossRecovered` | `{ enemy }` | |
| `breakCheck` / `breakCheckEnd` | `{ enemy, name, dur, threshold }` / `{ enemy, name, success }` | named cast with a Stagger threshold |
| `poise` | `{ enemy, amount, src }` | src = reaction type, `frozen`, `perfect`, `crystal`, `generator`, … |
| `bossEnrage` | `{ enemy, level }` | first soft-enrage step |
| `bossImpact` | `{ enemy, pos, heavy }` | every resolved hostile shape (music ducks, SFX thud) |
| `echoMend` | `{ enemy, dur }` | the first body died; the Echo rises after `dur` |
| `bossTell` / `bossWard` | `{ enemy, kind, lead }` / `{ enemy, ward }` | big tells (music/SFX accents); Aurelith's ward |
| `obelisksRisen` | `{ obelisks }` | 0:50 of each act |
| `obeliskChannel` | `{ obelisk, progress }` | throttled (≤ 10 Hz) |
| `obeliskArmed` | `{ type: 'haste'\|'echo'\|'wrath', heat, affix }` | |
| `obeliskCollapse` | `{}` | encounter start |
| `obeliskPayout` | `{ shards, parts, lines }` | the payout summary, paid only on a won boss fight |
| `wrathCache` | `{ card }` | heat 2+: the Wrath Cache card (a decision of `kind: 'wrathCache'`) after the boss dies |

**Stakes** (`game.run.stakes`, written by obelisks.js, read by encounter.js; reset per act): `{ haste: null | { at, skipped }, echo, heat, affixes, bossHpMult, bossDmgMult, chest: { extra, bossRelics }, echoChest: { pool: 'boss', choices: 3 }, echoAffix }`. Chests: `enemy.chestSpec` → `game.queueChest(spec)` → `rollRelics(game, n, spec)`; relics.js honours `spec.pool === 'boss'` and `spec.bossRelics`, and keeps tag `boss` out of normal rolls.

### Actors
Anything with `update(dt, game) → boolean` (return `false` when finished) and optional `dispose(game)`. **Hostile actors (enemy bullets, boss hazards) must set `this.hostile = true`**, so the Rift Shift can clear them.

## Player (`src/game/player.js`)
* `pos, vel, facing, moveDir, radius, level, xp, xpToNext, hp, stats, invuln, dead`
* `cls` (CLASSES entry), `classId`, `traitId`, `skills`, `slots[0..4]` (slot 0 = starter), `passives`, `relics:[defs]`, `buffs: Map(id → {t, dur, name, icon, color, apply})`
* `shield`, `frostArmor` (0..3), `charge` (Momentum 0..100), `traitDamage`, `traitCdr`
* `dash = { def:{name,kind,cd,dist,dur,charges}, max, charges, recharge, t, window }`
* `model` (HeroModel, heroes/index.js): the rig body. The player calls `model.cast(def, slot)`, `dashStart(kind)`, `hit()`, `perfect()`, `channel(on)`; game calls `die()` / `victory()`. Visual world points: `player.muzzle(out)`, `player.hand(out)`, `player.model.emitter(name, out)`.
* Hero visuals go through `HERO_FX` (vfx/heroFx.js → vfx/hero/<element>.js): dashStart/dashTrail/dashHit, firePatch*, wildfire, armorGain/Break, perfectDodge, cast (flash), shieldBlock, death, update (idle element FX). Visual only.
* Methods:
  * `takeDamage(amount, source)`: handles perfect dodge, i-frames, armor, shield.
  * `heal(n)`, `gainXP(n)`
  * `addBuff(id, dur, {name, icon, color, apply(stats)})`, `addShield(n)`, `hasBuff(id)`
  * `addRelic(def)`

### Stats (`player.stats`)
```
damage, cdr (0..0.6), moveSpeed, maxHp, regen, pickupRadius, area, projectiles, reaction, crit, armor, xpMult,
burnDur, burnDmg, freezeAt, shockDur, shockAmp, overloadRadius, overloadStun,
dashCdr, echo, reactionEcho, chestChoices, reactionXp, dmgTaken
```

## Skill definition contract (`src/game/skills/*.js`)
```js
export const mySkill = {
  id: 'mySkill', name: 'My Skill', icon: '🔥',      // icon: ONE emoji or unicode glyph
  element: 'fire' | 'frost' | 'storm' | 'arcane',
  maxRank: 5,                    // fusions: 3
  range: 14,                     // auto-cast targeting range
  noAuto: false,
  hint: 'One-line combo tip shown on cards.',
  desc: (rank) => 'What this rank gives.',   // rank 1 = base description
  cooldown: (rank) => seconds,

  // ACTIVE skills (occupy a slot) implement cast():
  cast(game, ctx) {},   // ctx = { rank, origin: Vector3 (y=0), dir: Vector3 XZ unit, target: Vector3 ground point, player, state }

  // AUTO behaviour (skills WITHOUT cast() take no slot; max 2):
  init(game, state, rank) {}, update(game, dt, state, rank) {}, onRankUp(game, state, rank) {}, dispose(game, state) {},
};
```
* Damage **must** go through `damageEnemy(game, enemy, amount, { element, knockback, dir, statusPower, noReaction, noStatus, raw, noCrit, silent })` from `combat.js`. This triggers statuses and reactions, so always pass the right `element`.
* Helpers in `skills/common.js`: `Projectile` (opts: `pos, dir, speed, range, radius, damage, element, pierce, knockback, statusPower, color, size, height, mesh, trail, homing, homingRange, onHit, onExpire, hitCooldown, spin`), `timed(game, dur, fn(dt,t,k), onEnd)`, `damageArea(game, pos, r, dmg, opts)` → enemies hit, `fanDirections(dir, n, spread)`.
* Scale areas by `game.player.stats.area`. Add `game.player.stats.projectiles` to projectile counts.
* Target-at-cursor skills: clamp the target to the skill's range from `ctx.origin`.
* Visuals: draw with `game.vfx` (design/VFX.md) and the element helpers in `vfx/elements/<element>.js`. `Projectile` opts `mesh: null`, `ribbon`, `onUpdate`, `onDispose` for custom looks. Gameplay numbers live in the skill; never change them for looks.
* Reference skills: `cinderBolt.js` (projectile), `meteor.js`, `blizzard.js`, `singularity.js`, `staticField.js` (auto), `fusions/thunderhead.js`.

## VFX toolkit (`game.vfx`, `src/game/vfx/`)
The world-grounded spell VFX: stateless GPU particles with an ink-outlined sprite atlas, instanced debris and sprouting crystals, noise shells, one-draw ground decals (frost, scorch, rune, crater, wet, shadow), pooled ribbons and forked bolts, toon clouds, status looks in the rig shader (`h.stat` = burn/cold/shock) plus overlays. ~12–14 draw calls total, all pooled. API and rules: **`design/VFX.md`**; tech: `design/research/08-spell-vfx-tech.md`; direction per ability: `design/research/10-ability-vfx-bible.md`. Shaders are warmed up at boot (`vfx.warmup()`).

## FX (`src/game/fx.js`)
Everything is tuned for **bright ground**: the default blend is "blend-add" (`BLEND_ADD`: rgb adds glow, alpha darkens what is behind), so effects keep saturation and contrast on green, ochre and blue.
| Method | Notes |
|---|---|
| `burst(pos, { color, count, speed, life, size, gravity, up, drag, spread, hdr, occ, blend, backing, backingColor })` | `blend`: `'blendAdd'` (default) \| `'add'` \| `'normal'` / `'dark'` (painted dust). `occ` = how much it darkens the ground. `backing: true` adds a dark puff under the glow |
| `spark(pos, vel, { color, size, life, hdr, occ, blend })` | |
| `ring(pos, { color, radius, from, life, width, hdr, y, occ, blend })` | `depthTest: false` (draws over grass) |
| `flashDisc(pos, { color, radius, life, hdr, occ, blend })` | |
| `lightning(from, to, { color, life, jag, strands, segments })` | dark under-strand + glowing strand (Line2); `from`/`to` may carry `.y` |
| `telegraph(pos, radius, duration, { color, onDone, friendly, keepColor })` | → `{ cancel() }`. Decal shader: dark band, crisp rim, growing fill. Hostile = `HOSTILE_RED` |
| `lineTelegraph(from, dir, length, width, duration, { color, onDone, friendly, keepColor })` | → `{ cancel() }` |
| `coneTelegraph(origin, dir, angle, radius, duration, opts)` | cone telegraph → `{ cancel() }`. Hostile red by default; `opts.safe` = gold "go here". |
| `donutTelegraph(pos, inner, outer, duration, opts)` | donut telegraph (in-and-out patterns) → `{ cancel() }`. Same colour rules. |
| `zone(pos, shape, kind = 'hostile' \| 'safe', opts)` | persistent ground-decal zone. `shape`: `{ radius }` circle, `{ radius, inner }` donut, `{ radius, angle, dir }` cone. Hostile = red (spore cloud, fire); safe = gold (sap pool, lightning rod, shelter). |
| `opts.safe` (telegraphs and zones) | draws the gold `SAFE_GOLD` style (solid rim + diagonal stripes) and never damages. `SAFE_GOLD = 0xffc83a` is exported by fx.js. Hostile red stays the only colour for danger. |
| `corpse(mesh, life, { onEnd })` | for non-rig meshes only (enemies use the rig death topple) |
| `light(pos, color, intensity, life, distance)` | intensities are scaled ×0.3 internally (daylight); pool of 6 |
| `shake(amount, kind = 'self')` | `'threat'` for anything hurting the player (hits, boss attacks, hazards, Rift Shift); default `'self'` for the player's own impacts, which are damped and capped (engine.js) |
| `number(pos, value, { color, crit })`, `text(pos, str, color, big)` | DOM text with a dark stroke |
Exports: `BLEND_ADD`, `HOSTILE_RED`, `SAFE_GOLD`, `blendAddMaterial(color, { hdr, occ, opacity, side, depthWrite, depthTest })` (drop-in for additive `MeshBasicMaterial`; `.color` / `.opacity` work).

## Creatures (`src/game/creatures/`)
Every enemy and boss body is a **creature rig**: a procedurally modelled, procedurally animated creature drawn with GPU instancing (one `InstancedMesh` per creature type + one inverted-hull outline mesh, bone matrices in a float texture read by `gl_InstanceID`, soft blob shadows in one shared draw). Full modelling/animation contract: `design/ART.md`; creature designs: `design/research/03-creature-art.md`.
* `defineCreature({ id, bones, build(pb, B), animate(P, s, B), stride, muzzle, blob, deathTime, gradient, outline })`.
* `game.creatures` (`CreatureRenderer`): `add(def, { pos, yaw, scale, seed })` → handle `h` with `pos` (shared Vector3), `yaw`, `scale`, `lift`, `action`/`k` (0..1), `glow`, `tint`, `rim`, `accent`, `elite`, `frozen`, `flash()`; `remove(h, { corpse })`; `setRim(hex, strength)`; `update(dt, time)` (game.js calls it every frame, dt 0 = hold pose).
* Enemy → creature mapping: `creatures/index.js` `creatureFor(typeId)`; bosses: `bossCreatureFor(bossId)`.
* Dev viewer: `/dev/creatures.html?set=<module>&poses=idle,walk:0,attack:0.2&zoom=1..6&bg=forest|barrens|river&rim=elite&ward=frost&yaw=..&layout=rows`.

* Rig v4 additions: negative `emis` = fixed-colour glow (ignores accent and glow ramp); `h.stat = [burn, cold, shock]` drives the status looks in the shader (`iMisc.yzw`); `h.hidden`; `add(def, { track: true })` + `boneWorld(h, bone, local, out)`; `new CreatureRenderer(scene, camera, { outlinePx, renderOrder })`.

## Heroes (`src/game/heroes/`)
The four playable heroes are creature-rig instances on their own renderer (`game.heroes`). Each class file declares its bones (18 fixed core bone names + extras, ≤ 32) and a stateless `animate(L, s, B, H)` built from the layer library in `hero.js`. `HeroModel` (index.js) owns all state and writes the channels in `h.hero`: aim / move split (ψ, μ, backpedal), stance + per-shot recoil, actions (`throw`, `heavy`, `nova`, `channel`, `dash`, `arrive`, `death`, `victory`), class meter, fidgets, stomp, Perfect Dodge. It also drives glow, accent (last-cast element), rim, i-frame tint pulse, and the ground ring with the aim notch. Contract: **`design/HEROES.md`**; art bible: `design/research/09-hero-bible.md`; quality-bar reference: `pyromancer.js`. Viewer: `/dev/creatures.html?set=../heroes/<class>&poses=idle,run:1.6,strafe:1.6,shot:0,heavy:0.36,dash:0.5,death:0.6,victory:1`.

## Enemy contract (`src/game/enemies.js`)
```js
export const ENEMY_TYPES = { husk: {...}, ... }   // see DESIGN §9 (ids unchanged; names are the new creatures)
export function createEnemy(game, typeId, pos, opts = {}) // opts: { elite, hpMult, damageScale, xpMult, ward, resist, noSpawnAnim }
export class EnemyBullet  // new EnemyBullet(game, pos, dir, damage, opts?) — actor, hostile = true; opts.y = spawn height
```
The enemy object has:
```
type, archetype, faction, pos, radius, hp, maxHp, xp, damage, speed, status (makeStatus()), knock (Vector3), kbResist,
dead, elite, boss, final, inert (false), resist ({fire:.5} | null), ward (element | null), barrier (0),
deathColor, mesh (attachment Group), rig (creature handle), topY, center, update(dt, game), flash(), dispose(game), onDeath?(game)
```
* `update`: call `updateStatuses(game, this, dt)` first. It returns a movement multiplier; **0 = frozen/stunned: no movement and no attacks**.
* `updateVisuals` maps behaviour state to rig actions: `attack` (melee swing, strike lands early), `cast` (ranged windup 0..0.7, release 0.7..1; support pulse), `fuse`, `windup`/`charge`/`recover`, `blink`/`arrive`.
* Ranged shots spawn from the creature's `muzzle` (model space, rotated by yaw).
* Never remove itself from `game.enemies`. Game removes dead enemies and calls `dispose` (killed → death topple corpse).

## Boss contract (v5 raid encounters: `design/RAID.md`)
* A boss is a `BossBase` subclass (`src/game/bosses/core.js`) in `src/game/bosses/{gorrak,vashkar,aurelith}.js`. The facade `src/game/bosses.js` exports `createBoss(game, id, pos, opts)` (ids `hollowWarden` = Gorrak, `vashkar`, `riftHeart` = Aurelith), `AFFIXES` and `WARD_CYCLE`. A script with `static ready = false` falls back to `bosses/legacy.js`.
* Scripts declare `CFG` (id, hp, radius, cycle, downed, enrageAt, …), a `rotation(phase)`, `moves`, `intermission(idx)`, and optional `think / move / visuals / onPhase / onDowned / onRecovered / onClearField / onDispose`.
* The toolkit: shapes (`circle`, `cone`, `donut`, `line`, `ringWave`), `zone`, `spawnAdd`, `spawnObject`, poise (`addPoise`, `breakCheck`, `down`, `expose`, `castBar`), `own` / `own_mat`. Full signatures and the rules for lead times and readability: **`design/RAID.md` § BossBase API and § Readability rules**.
* Every attack plays a body tell synced to its telegraph (`play(action, dur, tell)`). Every new move needs a rig pose in `src/game/creatures/bosses/<boss>.js` (at least `downed`, `recover`).
* The HUD and audio read the boss fields on `game.boss` (`poise`, `cast`, `phase`, `gates`, `exposedT`, `enrage`, `objects`, `ward`); they are listed in `design/RAID.md` § Boss fields. Legacy bosses have no poise, so guard with `?.`.

## World contract (`src/game/world.js`)
```js
class World {
  constructor(game)
  bounds, obstacles: [{x, z, r}]
  setBiome(id: 'verge'|'cinder'|'crown', instant: boolean)  // Thornwood / Sunscorch Barrens / Stormwater Reach: buildBiome(def), atmosphere, rim
  reset()                         // new run: clear geodes/shrines/hazards
  spawnCrystal(el, pos, { hp })   // a one-off Rift Crystal outside the respawning slots (tutorial)
  setArena(arena | null)          // boss encounter arena { center, r }; Rift Crystals move inside it (4 at 0.6 R); null = off
  collide(pos, radius)            // push out of obstacles, clamp to bounds (mutates)
  randomSpawnPoint(center, minDist, maxDist) → Vector3
  heightAt(x, z)                  // terrain height (0 on the playfield)
  update(dt, time)                // ambient + geodes/shrines/hazards (only act on gameplay when game.state === 'playing')
  shrine                          // null | { type, pos, progress 0..1, timeLeft } — HUD reads it
}
```
Biomes are data: see the header of `src/game/env/biome.js` (palette, atmos, env haze/clouds/wind, terrain, layout, ground, grass, flowers, water, motes, `props(ctx)` recipe).

## Engine (`src/core/engine.js`)
`setAtmosphere({ background, hemiSky, hemiGround, hemiIntensity, moon (= the sun), moonIntensity, grade }, seconds)`, `setGrade({ tint:[r,g,b], saturation, contrast, vignette }, seconds)`, `pulse('hit'|'perfect'|'shift')`, `skyFlash(k)` (lightning sky boost), `update(dt, game)`, `shake(a, kind)` (two channels; `shakeScale` is the player setting), `follow(...)` (also moves the sun and its texel-snapped, zoom-sized shadow frustum), `render()`.

## UI contract (`src/ui/ui.js`, which owns a `HUD` from `src/ui/hud.js` and a `Menus` from `src/ui/menus.js`)
The look ("Crownforge"), scale unit, primitives, icon ids and per-screen specs are in **`design/UI.md`**. Boot (`src/main.js`) calls `installUiScale()` (1rem = 12/15/20 px at 720p/1080p/1440p, author sizes as `calc(N * var(--u))`) and `ensureIcons()` (injects the sprite). Never use emoji/unicode glyphs as UI icons: `icon(ICON.skill(id), { el, fallback })`. Data hooks for the HUD: `BEATS` (spawner.js), `WARD_CYCLE` (bosses.js), `announce` events carry `kind` (`surge`, `swarm`, `boss`, `bossDown`).
```js
class UI {
  constructor(game)
  update(dt)
  showTitle()                                  // → menus.showTitle()
  showLevelUp(cards, onPick, ctl)              // ctl: { rerolls, banishes, reroll() → cards|null, banish(card) → cards|null }
  hideLevelUp()
  showRelicPick(relics, onPick)                // relic defs (relics.js); call onPick(def) once
  hideRelicPick()
  showPause(), hidePause()                     // pause + codex (+ "Quit to Sanctum" → game.quitToTitle())
  showGameOver(stats), showVictory(stats)      // → menus
}
class Menus {   // src/ui/menus.js
  constructor(game, root)
  showTitle(), hideTitle()                     // title + class select + sanctum + tier select; START → game.start({classId, tier})
  showGameOver(stats), showVictory(stats), hideEnd()
}
```
