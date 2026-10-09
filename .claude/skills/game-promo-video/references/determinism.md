# Determinism checklist

Goal: frame N looks identical whether it was rendered in a still, a contact sheet or the final MP4. That is what makes the preview → fix → re-render loop work.

## What `kit/shims.js` covers (load it first, as a classic script)

| Source | Shim |
|---|---|
| `innerWidth`, `innerHeight`, `outerWidth/Height`, `devicePixelRatio` | Fixed to `PROMO.width/height`, DPR 1. Code that sizes canvases, cameras, shadow frusta or text from the window gets the video size. |
| `performance.now()` | Virtual clock, advanced only by the renderer (`__promo.advance(ms)`). Fixes environment animation (wind, water, UI tweens) that reads wall-clock time. |
| `Date.now()` | `PROMO.epoch + virtual ms`. Use `__promo.realNow()` when you need real time (progress timers). |
| `Math.random()` | mulberry32 seeded with `PROMO.seed`; reseed per shot with `__promo.seed(n)`. |
| `requestAnimationFrame` | `raf: 'manual'`: callbacks are queued and only run on `__promo.pumpRAF()` with the virtual timestamp. Stops the game's own loop from racing the renderer. |
| `setTimeout/setInterval` | `timers: 'virtual'` (opt-in): fire when the virtual clock passes them. Use when gameplay schedules with timers. Leave `'real'` if libraries need real timers at boot. |

## Not covered: check the game for these
- **Own PRNG classes** (seeded from `Date.now()` or `crypto`): fine if seeded from `Date.now()` (shimmed); otherwise seed them in `P.stage`.
- **`crypto.getRandomValues` / `crypto.randomUUID`**: patch if used for gameplay.
- **Web Workers / physics in workers**: they don't see the shims. Run physics on the main thread for the promo, or step the worker synchronously.
- **AudioContext time** driving gameplay (rhythm games): replace with the virtual clock for the promo.
- **Frame-time-dependent logic** (`dt = now - last` clamped): pass the renderer's fixed `dt`, and sub-step (`maxStep`, default 1/60) so slow-motion and fast-forward stay stable.
- **Real-time de-dupe/throttles** (`if (now - last < 220) return`): harmless, now on virtual time.
- **Lazy/async loading** (textures, GLTF, fonts): wait for them before the first frame (`await` the loader in `promo.js` before `createRenderer`, and list fonts in `fonts: []`).
- **State that survives a reset**: caches, label maps, pooled objects, event listeners. `P.stage` should reset whatever leaks between shots. Use `shot.cleanup.push(off)` for listeners added in `setup`.

## Driving the game

**A. You call update yourself (preferred).** Import the game's classes, build them without the main loop (or never call its `start()`), and in `tick(dt)` call `game.update(dt)`; in `render()` call the renderer. Full control over dt, input and state.

**B. The update lives inside the game's rAF loop.** Load the game's normal entry module with `PROMO.raf = 'manual'`. In `tick(dt)`, call `__promo.pumpRAF()` once. The renderer has already advanced the virtual clock by `dt`, so the game computes `dt` from the timestamp. Sub-steps call `tick` several times, giving several frames of game logic per video frame; fine for most games. For input, write to the same state the game's input handler fills (or dispatch synthetic `KeyboardEvent`s).

## Input without a human
Write directly into the input layer the game reads: pressed-key sets, `mouse` world position, "bot" hooks. Expose small verbs in `P`: `aim(target)`, `move(x, y)` (screen-relative is easiest to reason about), `dash()`, `cast(slot)`.

## Rendering pitfalls
- WebGL canvases are cleared after compositing; `drawImage(glCanvas)` must happen in the same task as `render()`. The kit does `render()` then `compose()` synchronously. Never `await` between them.
- Keep the game canvas mounted (off-screen with `left:-5000px`, not `display:none`), or some engines stop rendering.
- If the game sizes its renderer on `resize` only, call its resize once after boot.
