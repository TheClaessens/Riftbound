# Gotchas (with fixes)

## Tooling and browser
- **Tool calls time out at ~45 s.**
  - Never loop for minutes inside one `javascript_tool` call.
  - `PT.play` ≤ 60 s of game time per call; use 20–40 s late-game, when frames are heavy.
  - Batches run in the background: start them with `PT.batch()`, then call `await PT.batchWait(35000)` once per tool call.
  - After a timeout, the script may still be running. Check `PT.state()` before re-running.
- **Hidden tabs throttle timers.** Chrome throttles `setTimeout`/`setInterval` in hidden pages, down to about one wake-up per minute after a few minutes.
  - A batch that yields with `setTimeout(0)` crawls.
  - The core yields with a `MessageChannel` hop, and `batchWait` deadlines are checked inside the batch loop rather than by a timer.
  - Don't write `await new Promise(r => setTimeout(r, …))` polling loops in tool calls either.
- **The browser is shared.**
  - Every persona creates its own tab and passes its `tabId` to every call. Omitting it acts on whichever tab is in front, which may be another agent's.
  - The pane hit its tab limit at roughly 8 concurrent agents. Keep panels at 7 or fewer, or run them in two waves.
- **Tab screenshots can be stale or time out** while the pane is hidden or the page is busy. Canvas screenshots via `PT.shot` don't have this problem: they render a frame and upload it.
- **No Node/Python?** The kit ships a PowerShell server too. Use whichever runtime exists.

## Simulation speed
- **Layout reads per tick are poison.** Reading `offsetParent`, `innerText` or `getBoundingClientRect` every tick forces a reflow after each DOM-updating frame. It cut sim speed by an order of magnitude.
  - Sample at most every ~6 ticks with `ctx.every(6, key, fn)`.
  - Only sample while the thing can be visible.
- **Late game is heavier.** In the reference game the sim ran ~100× real time early and ~5× late, with 300 enemies and high combo counts. Tell personas to shorten `play` chunks late in a run.
- **Skip rendering while simulating.** Render once at the end of `play()` (`afterPlay`) and in `shot()`, not every tick.

## State and save
- **Sandbox persisted saves per persona.** Several tabs on the same origin share `localStorage`. The core remaps listed keys to `pt.<persona>.<key>`. Personas never touch the real save, but they do share the server origin, so use a dedicated port for playtesting.
- **Swapping the save leaves stale UI.** Menus rendered at boot from the original save show wrong selections, for example a locked character selected. Re-render menus in `onInit`, and again after meta purchases.
- **State can leak between runs.** Old HUD/toast nodes, tutorial panels and listeners can persist. Personas notice and report this. Decide whether it's real (a game bug) or only visible to `PT.ui()` (hidden DOM).

## Frozen loop side effects
- **rAF-driven UI doesn't animate.** End-screen count-ups read "+0", entrance tweens look half-done, and CSS/WAAPI animations still need real time. Tell personas to trust `PT.end()` numbers. For UI screenshots, wait real seconds first.
- **WAAPI `onfinish` cleanup never runs.** UI that removes DOM nodes in an animation's `onfinish` (feeds, toasts) piles up stale nodes under the sim, and personas report "duplicate chips". Verify before you file this as a UI bug. The game-side fix is to remove nodes on game time.
- **Hit-stop / slow-mo still apply.** Game-time effects work normally, so a "60 s" `play()` can advance less game time during slow-mo. Report game time from `time()`, not from steps.

## Bot hands
- **The bot's ceiling is low and uneven.** In the reference game:
  - All three hands levels usually died in Act I–II with three of four classes.
  - The tanky class won almost every time.
  - Expert vs average made little measurable difference.

  So calibrate, put the numbers in the brief, and stop personas from concluding "too hard" from bot deaths.
- **Sidestepping into melee.** Strong projectile avoidance pushed the bot into big melee enemies. Fix: pick the dodge side away from the crowd, give big hitters a wider berth, and cap the dodge weight.
- **Kiting instead of fighting the boss.** The bot circles the horde and leaves an off-screen boss alone. A `keepAt` boss orbit helps but isn't perfect. Treat long boss fights as a candidate *bot limitation* until verified.
- **Tutorials need bot help.** If a tutorial asks the player to shoot a specific object or press a key, special-case it in `target()`/`apply()`. Otherwise the tutorial stalls or times out.

## Crutches and reporting hygiene
- **Assist and jump are for seeing content, never for difficulty.**
  - Jumping straight to a boss can trigger every timed beat at once (elite surge + swarm + boss). That makes the fight unfair by construction.
  - Require tags on findings: **[assisted]**, **[jumped]**, **[forced]** (state edited by hand).
- **Personas auto-pick late in long runs to save calls.** Ask them to say so. Those picks aren't in character.
- **Verify the strong claims yourself.** In the reference round:
  - The "boss is unkillable" claim was a real bug. A support enemy's barrier also applied to bosses; this was proven by a probe hit dealing 0.
  - The "+0 shards" claim was a harness artefact.
  - Three oddities were the bot.

  Personas can't read source and shouldn't, so root-causing is the orchestrator's job.
