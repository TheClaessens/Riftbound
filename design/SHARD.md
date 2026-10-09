# The Crownshard — implementer contract (v6)

Design and rationale: [SHARD_PASSES.md](SHARD_PASSES.md). This file is the API. If you need something that is not here, report it; don't edit a file you don't own.

## 1. Ownership

| File | Owner | What |
|---|---|---|
| `src/game/obelisks.js` | orchestrator | The Crownshard **director** (historic file / property name `game.obelisks`): states, commune, pact sealing, Rift Answer, stakes, payouts, Haste. |
| `src/game/game.js`, `encounter.js`, `spawner.js`, `tutorial.js`, `src/dev/sim.js` | orchestrator | Game state `'pact'`, F key, start position, Rift Shift move, sim lanes, tip. |
| `src/game/shard/model.js` | **shard-art agent** | `ShardVisual`: the 3D set piece + its animation + its one-shot FX. |
| `src/ui/pact.js`, `css/pact.css` | **ui agent** | The Pact screen. |
| `src/ui/hud.js`, `src/ui/hud-fx.js`, `css/hud.css`, `src/ui/icons/set-raid.js`, `src/ui/menus.js`, `src/ui/feedback.js` | **ui agent** | Prompt, edge marker, chips, timeline beat, icons, death-screen and feedback wording. |
| `src/game/audio/sfx.js`, `src/game/audio.js` | **audio agent** | Shard / pact sounds. |

## 2. World facts

* Shard centre `SHARD_POS = (0, 0, 0)`. Collision circle r **1.6** (an obstacle in `world.obstacles` while the shard stands). Commune range r **4.5**.
* Biome props keep r 7 around the origin clear (`env/biome.js` `free()` default `center: 7`). The forest and riverland paths run through the centre; that is intended (roads lead to the shard). Visual footprint of the circle ≤ r **6.6**.
* Player start every act: **(4.5, 0, 4.5)**. The iso camera sits at +X +Z, so the shard is up-screen of the player.
* Colours. Haste `#bfefff`, Echo `#b08cff` (teal accent `#4ff0d0`), Wrath `#ff7a33`, Rift violet `#e0c4ff`. **Never** red (hostile telegraphs) and never bright solid gold (`SAFE_GOLD` = "stand here"). Crown-bronze metal is fine as a dull material.
* Act index → biome: 0 forest (Thornwood), 1 barrens (Sunscorch), 2 river (Stormwater Reach). `game.world.biomeId` is the live id.

## 3. `ShardVisual` (src/game/shard/model.js)

```js
export class ShardVisual {
  constructor(game, pos /* THREE.Vector3 */, act /* 0..2 */)   // builds and adds itself to game.scene
  update(dt, time, S)   // every frame, ALSO while the game is paused in the Pact screen (dt = real dt then)
  burst(kind)           // one-shot FX: 'wake' | 'seal-echo' | 'seal-wrath' | 'seal-haste' | 'answer' | 'ascend'
  dispose()             // removes from the scene, frees per-instance GPU objects (shared geometry may stay cached)
}
```

`S` (written by the director, read-only for the visual):

| Field | Type | Meaning |
|---|---|---|
| `state` | `'dormant' \| 'waking' \| 'open' \| 'communing' \| 'calling' \| 'ascending' \| 'gone'` | see below |
| `k` | 0..1 | progress through a timed state: waking (1.8 s), calling (3 s Haste warning), ascending (1.4 s). 0 otherwise. |
| `near` | 0..1 | eased: player inside the commune range (and the shard is usable). Brighten / invite. |
| `sealed` | `{ echo: bool, heat: 0..3, haste: bool }` | sealed pacts (light the binding-stone + chain; Wrath shows 1–3 lit notches). |
| `draft` | `{ echo, heat, haste }` or `null` | while the Pact screen is open: the player's current draft (faint preview glow on the stones). |
| `answer` | 0..1 | Rift Answer flare envelope (0.8 s rise, decays). |
| `wakeIn` | seconds | time until it wakes (dormant only). |

State look:
* **dormant** (0:00–0:50): chained, tilted, half-sunk into the crater, dim; slow breathing glow. Readable as "a sleeping thing that will matter", not as an interactable yet.
* **waking** (k 0→1): chains strain and snap (or go slack), the shard tears free, rights itself and lifts to float; the crater floods with light; light column appears. `burst('wake')` is called at k = 0.
* **open**: floating, slowly rotating, prism glints, motes, column. `near` → rune ring at r 4.5 lights up (this ring IS the commune range; make it legible on all three biomes but quieter than hostile telegraphs).
* **communing**: open + stronger glow (the world around is desaturated by the grade, so the shard is the bright thing). `draft` glows.
* **calling** (Haste, k 0→1 over 3 s): the shard spins up, column intensifies, warning pulse (not red).
* **ascending** (k 0→1 over 1.4 s): it rises up its column and is gone; crater dims. `burst('ascend')` at k = 0.
* **gone**: the shard, splinters, column and motes are hidden; the broken circle stays as a cold ruin (low stone, no glow, chains lying in the crater, no collision). The director disposes the visual at the next act start.

Rules and budgets:
* One silhouette every act (learnable). The ring stones / crater take the biome (mossy granite / sandstone / drowned pale marble). Same style as the world: low-poly faceted, vertex-coloured via `env/props.js` `prep / lump / paint`, materials patched with `env/common.js` `patchEnv` (see the v5 obelisk code in `obelisks.js` for working examples of every helper, the blend-add instanced material and the light-column shader).
* Height: floating shard top ≈ 8.5–10 u. Slim enough that a hero behind it is not lost (the hero x-ray silhouette exists, but don't build a wall).
* ≤ 8k triangles total, ≤ 16 draw calls, **no per-frame allocation**, no new lights except `game.fx.light()` flashes in `burst()`. Glows are blend-add (bright ground: see design/VFX.md + design/ART.md).
* Ground layers (crater glow, rune ring): opaque pass with custom blending at renderOrder 1–2, `depthWrite: false` (design/VFX.md layering rules), so they don't wash over units.
* Collision is the director's job (r 1.6). Keep solid-looking parts outside r 1.6 low (≤ 1 u) or obviously non-blocking (floating).

## 4. Director API (`game.obelisks`, src/game/obelisks.js)

State
* `shard` → `{ pos, state, k, near, wakeAt, wakeIn, usable }` or `null` (between acts / before a run).
* `stakes` → `game.run.stakes` (unchanged shape: `{ haste, echo, heat, affixes[], bossHpMult, bossDmgMult, chest, echoChest, wrathCache }`).
* `summoning` → true during Haste's 3 s warning (spawner holds its beats).
* `canCommune()` → bool (in range, open, horde phase, playing, not dashing, no encounter).

Pact screen data
* `pactView()` →
  ```js
  {
    act, bossName, timeLeft /* s until 3:00 */, lowHp,
    sealed: { echo, heat },
    affixes: [def, def, def],          // the 3 pre-rolled Wrath affixes in order (def: { id, name, desc, icon })
    haste: preview('haste'),           // { title, tag, cost[], pay[], levelsDelta, skipped, windfall }
    echo:  preview('echo'),            // { title, tag, cost[], pay[] }
    wrath: [null, pv1, pv2, pv3],      // preview of reaching heat n: { heat, nextAffix, cost[], pay[] }
    answerPerLevel /* foes per new level */, pullPerLevel /* s */,
  }
  ```
* `answerPreview(draft)` → `{ levels, foes, seconds }` for a draft `{ echo, heat }` (0s when nothing new).
* `setDraft(draft | null)` → mirrors the draft onto the shard visual.

Actions
* `commune()` → opens the screen (`game.state = 'pact'`, grade drain, `ui.showPact(view, handlers)`). Returns false if `!canCommune()`.
* `sealPact({ echo, heat, haste })` → seals what is new (never lowers), closes the screen, resumes. `haste: true` starts the 3 s call. Otherwise, if anything new was sealed, the Rift Answer runs.
* `closePact()` → walk away: closes, resumes, nothing changes.

Events
| Event | Payload | Note |
|---|---|---|
| `shardWake` | `{ pos }` | replaces `obelisksRisen` |
| `pactOpen` | `{}` | game is now paused |
| `pactClose` | `{ sealed: bool, haste: bool }` | resumed |
| `obeliskArmed` | `{ type, heat, affix }` | kept: once per newly sealed stake (Wrath: once per heat step) |
| `riftAnswer` | `{ pos, foes, seconds }` | the horde answers |
| `shardAscend` | `{}` | replaces `obeliskCollapse`; encounter start |
| `obeliskPayout`, `wrathCache` | unchanged | |
| `announce` | `{ kind: 'obelisk', text, sub, color }` | kept kind id |

## 5. UI hook (`game.ui`)

`ui.showPact(view, { onSeal(draft), onCall(draft), onLeave(), onDraft(draft) })` / `ui.hidePact()`. The UI agent implements these in `src/ui/pact.js` and attaches them to `UI` (`src/ui/ui.js` already imports and delegates; the orchestrator pre-wired it). While the screen is open `game.state === 'pact'`; Escape must close the pact screen, not open the pause menu.
