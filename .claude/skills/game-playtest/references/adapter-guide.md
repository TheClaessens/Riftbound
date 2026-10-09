# Adapter guide

The adapter is the only game-specific code. Aim for ~200–400 lines. Read the game's code first and write down what you find; never guess an API.

## Audit checklist

| Need | Look for | Notes |
|---|---|---|
| Live game object | `window.game`, a module singleton, the app root | Expose one in a dev build if needed (e.g. `window.__game = game`). |
| Loop | Who calls `requestAnimationFrame`; where `update(dt)` lives | The core freezes rAF by default (`window.requestAnimationFrame = () => 0`). Override `freeze()` if the game uses its own ticker (Phaser `game.loop.stop()`, Pixi `app.ticker.stop()`). |
| One synchronous tick | `update(dt)`, `step()`, `tick()` | If logic and render are fused, call the fused function: rendering costs some speed but works. If time comes from `performance.now()` inside the loop, use a virtual clock (the game-promo-video skill's `shims.js` has one) and advance it per step. |
| Run lifecycle | `start(opts)`, `restart()`, the menu → play transition, win/lose flags, quit to menu | `status()` must map game states to `playing / menu / paused / won / lost`. |
| Choices the player makes | Level-up, shop, reward chest, map/route node, dialogue, card draft, talent tree | Wrap the function that **opens** the choice: call `ctx.offer({...})`, then still call the original (keeps the real DOM). The `pick(i)` you give must invoke the same callback the UI would. |
| Event bus | `events.on`, emitters, signal classes | If there is none, diff state in `afterStep` (HP dropped → damage; enemy count down → kills). |
| Damage sources | The function that hurts the player and what it receives as the source | Map to **player-facing names** (`enemy.name`, a lookup table by constructor). The digest's `dmgBy` is the most-used evidence in reports. |
| Telegraphs | Warning-circle/line/cone functions, "wind-up" states | Hook them into `hands.zone(...)`, so the bot dodges what a player could see. Cones: approximate with a circle at the cone centre or with several lines. |
| Projectiles | Hostile bullet arrays/actors | Provide position, unit direction, speed, radius. |
| Canvas & camera | The renderer's canvas; world→screen projection | WebGL: render immediately before reading the canvas (same task), or use `preserveDrawingBuffer`. 2D: `ctx.setTransform`-aware projection. |
| Persisted save | `localStorage` keys, IndexedDB | List keys in `storageKeys` (or a prefix in `storagePrefix`). IndexedDB isn't sandboxed by the core: add a per-persona DB name in `onInit` if needed. |
| Meta progression | Shop, unlocks, codex, difficulty tiers | Expose a compact `meta()` and verbs in `actions` (`buy`, `equip`, `selectTier`). Re-render menus after a save swap or purchase. |
| Debug hooks for crutches | God mode, teleport to level/act, give XP | Optional. A damage `assist` multiplier and a `jump` that grants the progression a player would have there let content reviewers see late content. |

## Adapter contract (fields)

**Required**
- `ready()` → boolean.
- `start(opts, ctx)` → info object, or `{ error }`.
- `step(dt, ctx)`: one synchronous tick.
- `status()` → `'playing' | 'menu' | 'paused' | 'won' | 'lost'`.
- `state(ctx)` → a compact object.
- `canvas()` → the game canvas.

**Lifecycle**
- `install(ctx)`: once, on the first `PT.init`.
- `onInit(opts, ctx)`: after the save sandbox swap.
- `freeze()`
- `dt`
- `time()`: the game clock, used for event-log timestamps.

**Per-tick and per-call**
- `afterStep(ctx)`: per tick.
- `afterPlay(ctx)`: once per `play()` call.
- `settle(ctx)`: after a choice, so a queued next choice can open.
- `lowHp(frac)` → boolean.

**Stops and ending**
- `stops`: `{ name: (ctx) => () => boolean }`. The factory runs at the start of each `play()`, so capture the "before" state there. Return true to stop.
- `end(ctx)` → run summary.
- `abandon(ctx)`

**Looking**
- `render()`
- `project(point)` → `{ x, y, pxPerUnit }`
- `focus(name)` → a world point
- `uiRoot()`
- `outDir`

**Progression and extras**
- `meta()`
- `actions`: `{ verb: (ctx, ...args) => result }`. Each becomes `PT.verb(...)`.

**Batches**
- `autoDecide(decision, ctx)` → option index.
- `batchPlan(opts)` → a list of start options.
- `batchBegin(ctx, opts)` / `batchEnd(ctx)`
- `batchTrack(ctx)` → `{ ..., stop() }`
- `batchRow(ctx, runOpts, tracked)` → row.
- `batchMaxSeconds`

**Save and bot**
- `storageKeys` / `storagePrefix`
- `hands`

**ctx** (passed to every hook)
- `offer(decision)`: decision shape is `{ kind, info?, options: [plain data], pick(i) }`. Extra fields on the offered object (such as the raw cards, or a reroll controller) stay private to the adapter and are reachable as `ctx.decision`.
- `event(text)`
- `tally(key, n, sub?)`
- `min(key, v)` / `max(key, v)`
- `every(n, key, fn)`
- `decision`, `run` (per-run scratch: `ctx.run.opts`, custom fields), `running`
- `persona`, `skill`, `dt`, `fmtTime`

## Batches and the save
- `PT.batch` snapshots the sandboxed `storageKeys` before the batch and restores them afterwards, so bot runs never count toward the persona's progression. Pass `keepSave: true` to opt out.
- If the game caches its save in memory, which most do, reload it in `batchEnd`. You can also force a run setup in `batchBegin`, such as unlocking everything or skipping the tutorial, and undo it in `batchEnd`. Riftbound and mini-arena both do this.

## Recipes by genre

**Real-time top-down action** (survivors-likes, twin-stick, ARPG): use `hands-topdown.js`.
- The bot writes into the game's input layer through `apply({ move, aim, fire, dash })`. Prefer a bot hook on the player object, as Riftbound does (`player.botMove`), over faking DOM key events: it is deterministic and cheap.
- If the game only reads key events, keep a fake key state and patch the input module's `isDown(key)`.
- Give `keepAt` a boss position so the bot fights bosses at casting range instead of kiting forever.

**Side-scrollers / platformers.** The top-down hands don't fit. Write small custom hands, `{ tick(ctx, level), reset() }`, that follow a waypoint list or the level's critical path, jump at gaps (raycast ahead) and attack nearby enemies. Or give personas only the decisions (shop, route, loadout) and treat the platforming as a crutch (`assist`, invulnerability) with a clear caveat.

**Turn-based / tactics / deckbuilders / puzzles.** No hands at all.
- Every move is a decision: `ctx.offer` the legal moves (or the hand of cards, or the puzzle actions) with short descriptions.
- `step` advances AI turns and animations instantly.
- A persona plays by alternating `PT.decision()` and `PT.choose(i)`, and `PT.play()` simply runs until the next decision.
- With large move spaces, summarise: group moves by unit or card, and offer "inspect" verbs in `actions` (e.g. `PT.inspect(unitId)`).
- `autoDecide` holds the baseline AI (random, greedy, or the game's own AI) for batches.

**Tower defense / RTS-lite.** Hands are usually unnecessary: placement *is* the decision. Offer placement and upgrade choices at wave breaks. Let `step` run waves, and stop at "wave cleared", "leak" and "boss wave".

**DOM / HTML games.** `canvas()` may not exist. For screenshots, render the relevant DOM to a canvas with a small `foreignObject`/SVG trick, or rely on `PT.ui()` text plus the browser tool's own screenshot of the persona's tab (it may be stale while the pane is hidden).

**Physics engines (matter.js, cannon, rapier).** Step the physics world with the same fixed `dt` the game uses. Don't change `dt` between calls: some solvers diverge.

## Calibration (do this before launching personas)
1. Batch-run each hands level on 2–4 representative characters/modes (n ≈ 3–5).
2. Record how far each level gets and its top damage sources.
3. If even `expert` dies very early to one specific source:
   - Check that the bot can *see* that source (a missing telegraph hook, projectiles without a direction).
   - Improve the hands a little, e.g. pick dodge sides away from the crowd, or give a wider berth to big hitters.
   - Stop there. A perfect bot is not the goal; honest calibration in the brief is.
4. Write the calibration into BRIEF.md's caveats.
