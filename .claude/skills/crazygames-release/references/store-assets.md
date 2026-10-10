# Store assets: covers and silent preview videos

Render them from the real game with the repo's `game-promo-video` skill kit (deterministic, frame by
frame, WebCodecs). Riftbound's implementation is `promo/store/` (shots.js, store.js, verify.js) and is
the worked example to copy.

## Specs
| Asset | Size | Notes |
|---|---|---|
| Cover, landscape | 1920×1080 | Use frame 0 of the landscape video, so the video opens on exactly this image |
| Cover, portrait | 800×1200 | Render at 2× (1600×2400) and downscale |
| Cover, square | 800×800 | Render at 2× (1600×1600) and downscale |
| Preview, landscape | 1920×1080, 15–20 s | No sound, no fast-forward, opens on the cover, ≤ 50 MB (≈ 12 Mbps H.264 at 60 fps gives 24 MB for 18 s) |
| Preview, portrait | 1080×1920, 15–20 s | Same rules |

## Cut that worked (18 s)
- **0–1.2 s**: the cover, frozen (`speed: () => 0`) with the logo.
- **1.2–17 s**: 6 shots of about 2.6 s each, all at real speed: horde, reactions, a class showcase, and 3 real boss
  fights.
- **17–18 s**: back to the cover, so the hover preview loops cleanly.
- Cuts get only a small flash and punch (0.18–0.45 flash, 0.02–0.03 punch). No titles over the gameplay.

## How
- **One page, any size.** The page reads its size from the URL (`?w=1080&h=1920`). The shims pin the size before any
  module loads.
- **Portrait framing.** The engine keeps the vertical world extent fixed, so tall frames crop the sides.
  - Widen the camera with an aspect factor (`zoomK` 0.78 for portrait, 0.86 for square).
  - Aim the camera between the hero and the boss (`frameBoss`), otherwise bosses fall off the edge.
- **Use the real systems.** Join real encounters (`encounter.summon('dev')` and warm-up) rather than forcing
  attacks through private APIs: the bosses get rewritten, and staged attacks break.
- **Pick moments with grids.** Render 8–12 candidates (seed × join time) into one contact image, then pick.
  A per-aspect camera offset keeps the subject in narrow frames.
- **Logo.** Draw it on the canvas to match the in-game wordmark (font, gilt gradient, outline), large enough
  to read on a small tile. Long titles go on two lines: the big word, then the rest.
- **Verify without `<video>`.** It never decodes in a hidden pane. Use `kit/verify-mp4.js`: check duration, size
  and tracks (`['vide']` = silent), decode frames into a check grid, and save frame 0 as the cover.

## Gotchas
- **Determinism.** Games often keep state across `start()` (world props, pooled VFX), so only the first
  render after a **fresh page load** is reproducible. Reload before every final render or cover. The
  symptom is the same seed giving a different frame on the second still.
- **Wall-clock deltas.** Environment code reading `performance.now()` deltas must be reset when staging
  (e.g. `world._lastNow = performance.now()`), or the first tick sees the gap since the last shot.
- **Real-time timers.** Real-time `setTimeout`s inside the game fire at random moments during a render. Use the kit's virtual
  timers (`timers: 'virtual'`).
- **Hidden pane.** It freezes the page: keep it busy with `browser_batch` wait steps while polling
  `promo.job`. A portrait 1080×1920 render took 90–125 s, landscape about 15 s.
- **Status tints.** A frozen boss renders white and becomes unrecognisable. Pick a class whose effects keep
  the boss readable for boss shots.
