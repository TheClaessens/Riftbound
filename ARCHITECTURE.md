# Riftbound — Architecture & Module Contracts (v2.0 — vibrant world)

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
  * **Hostile telegraphs are one red, `HOSTILE_RED = 0xff2a3d`** (`fx.telegraph` ignores other colours unless `{ keepColor: true }`; player-cast telegraphs pass `{ friendly: true }` → dashed element-coloured rim). Ground decals use `depthTest: false` so grass never hides them.
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
src/game/models.js                buildPlayerModel(classId)                                  (graphics)
src/game/combat.js                damage, statuses, 6 reactions, ward/resist/barrier          (core)
src/game/classes.js, acts.js, meta.js, relics.js, progression.js                              (core)
src/game/fx.js                    particles, rings, lightning, telegraphs, corpse, texts      (core; graphics may extend)
src/game/pickups.js               xp, health, magnet, chest                                   (core)
src/game/enemies.js               archetypes × factions, EnemyBullet; drives creature rigs    (enemies)
src/game/bosses.js                createBoss(game, id, pos, opts): 3 bosses on boss rigs      (bosses)
src/game/spawner.js               act-aware spawning, beats, boss spawn                       (bosses)
src/game/creatures/rig.js         PartBuilder, defineCreature, Pose, shaders (instanced rig)  (creatures)
src/game/creatures/renderer.js    CreatureRenderer: instancing, bone texture, outlines, blobs (creatures)
src/game/creatures/index.js       enemy type → creature def registry                          (creatures)
src/game/creatures/greenskins.js  Act I models · warband.js Act II · wyrmkin.js Act III · bossModels.js
src/game/world.js                 World contract, Rift Crystals (geodes), shrines, hazards; owns the biome    (world)
src/game/tutorial.js              Rift Primer (first-run tutorial) + one-time contextual tips; owns its DOM    (tutorial)
src/game/env/biome.js             buildBiome(def): ground, grass, water, props, motes          (env)
src/game/env/common.js            ENV uniforms, patchEnv (wind, haze, clouds, dither), noise   (env)
src/game/env/{ground,field,water,props,motes,lighting}.js   env systems                         (env)
src/game/env/biomes/{forest,barrens,river}.js + props_*.js  the three biome definitions        (env)
src/dev/sim.js, src/dev/viewer.js, dev/creatures.html        balance sim, snap(), creature viewer (dev)
src/game/audio.js                 procedural SFX + music                                      (audio)
src/game/skills/*.js              skills; registry.js (core)
src/ui/ui.js + css/ui.css         HUD, level-up, relic pick, pause/codex, banners             (ui-hud)
src/ui/menus.js + css/menus.css   title, class select, sanctum, game over / victory          (ui-menus)
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
| `player`, `enemies`, `boss`, `fx`, `world`, `pickups`, `spawner`, `ui`, `audio` | |
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
| `bossSpawned` | `{ enemy, final }`: emitted by spawner. Set `game.boss = enemy` first. |
| `bossPhase` | `{ enemy, phase: 2 }`: emitted by the boss at 50% HP |
| `bossKilled` | `{ enemy, final }`: emitted by spawner when the boss dies |
| `announce` | `{ text, sub?, color? }`: big centre-screen announcement |
| `shrineSpawned` / `shrineClaimed` | `{ type, pos }` |
| `geodeBroken` | `{ element, pos, hits }` (hits = foes caught in the blast) |
| `hazard` | `{ kind: 'lava'\|'lightning', pos }` (on impact) |
| `autoCastChanged` | `{ on }` |
| `xpCollected` / `itemCollected` | `{ value }` / `{ type: 'health'\|'magnet'\|'chest' }` |

### Actors
Anything with `update(dt, game) → boolean` (return `false` when finished) and optional `dispose(game)`. **Hostile actors (enemy bullets, boss hazards) must set `this.hostile = true`**, so the Rift Shift can clear them.

## Player (`src/game/player.js`)
* `pos, vel, facing, moveDir, radius, level, xp, xpToNext, hp, stats, invuln, dead`
* `cls` (CLASSES entry), `classId`, `traitId`, `skills`, `slots[0..4]` (slot 0 = starter), `passives`, `relics:[defs]`, `buffs: Map(id → {t, dur, name, icon, color, apply})`
* `shield`, `frostArmor` (0..3), `charge` (Momentum 0..100), `traitDamage`, `traitCdr`
* `dash = { def:{name,kind,cd,dist,dur,charges}, max, charges, recharge, t, window }`
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
* Reference skills: `arcaneBolt.js` (projectile), `fireball.js`, `frostNova.js`, `chainLightning.js`, `spiritOrbs.js` (auto), `fusions.js`.

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
| `corpse(mesh, life, { onEnd })` | for non-rig meshes only (enemies use the rig death topple) |
| `light(pos, color, intensity, life, distance)` | intensities are scaled ×0.3 internally (daylight); pool of 6 |
| `shake(amount, kind = 'self')` | `'threat'` for anything hurting the player (hits, boss attacks, hazards, Rift Shift); default `'self'` for the player's own impacts, which are damped and capped (engine.js) |
| `number(pos, value, { color, crit })`, `text(pos, str, color, big)` | DOM text with a dark stroke |
Exports: `BLEND_ADD`, `HOSTILE_RED`, `blendAddMaterial(color, { hdr, occ, opacity, side, depthWrite, depthTest })` (drop-in for additive `MeshBasicMaterial`; `.color` / `.opacity` work).

## Creatures (`src/game/creatures/`)
Every enemy and boss body is a **creature rig**: a procedurally modelled, procedurally animated creature drawn with GPU instancing (one `InstancedMesh` per creature type + one inverted-hull outline mesh, bone matrices in a float texture read by `gl_InstanceID`, soft blob shadows in one shared draw). Full modelling/animation contract: `design/ART.md`; creature designs: `design/research/03-creature-art.md`.
* `defineCreature({ id, bones, build(pb, B), animate(P, s, B), stride, muzzle, blob, deathTime, gradient, outline })`.
* `game.creatures` (`CreatureRenderer`): `add(def, { pos, yaw, scale, seed })` → handle `h` with `pos` (shared Vector3), `yaw`, `scale`, `lift`, `action`/`k` (0..1), `glow`, `tint`, `rim`, `accent`, `elite`, `frozen`, `flash()`; `remove(h, { corpse })`; `setRim(hex, strength)`; `update(dt, time)` (game.js calls it every frame, dt 0 = hold pose).
* Enemy → creature mapping: `creatures/index.js` `creatureFor(typeId)`; bosses: `bossCreatureFor(bossId)`.
* Dev viewer: `/dev/creatures.html?set=<module>&poses=idle,walk:0,attack:0.2&zoom=1..6&bg=forest|barrens|river&rim=elite&ward=frost&yaw=..&layout=rows`.

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

## Boss contract (`src/game/bosses.js`)
`createBoss(game, id: 'hollowWarden'|'vashkar'|'riftHeart', pos, opts: { hpMult, damageScale, final })`. It returns an enemy-contract object with `boss: true, name, phase (1|2)` and emits `bossPhase` at 50%. Ids are unchanged; they are **Gorrak, the Troll King**, **Vashkar, the Ashen Warchief** and **Aurelith, the Prism Dragon**. Every attack plays a body tell synced to its telegraph (`_play(action, dur, tellTime)`).

## World contract (`src/game/world.js`)
```js
class World {
  constructor(game)
  bounds, obstacles: [{x, z, r}]
  setBiome(id: 'verge'|'cinder'|'crown', instant: boolean)  // Thornwood / Sunscorch Barrens / Stormwater Reach: buildBiome(def), atmosphere, rim
  reset()                         // new run: clear geodes/shrines/hazards
  spawnCrystal(el, pos, { hp })   // a one-off Rift Crystal outside the respawning slots (tutorial)
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

## UI contract (`src/ui/ui.js`, which owns a `Menus` from `src/ui/menus.js`)
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
