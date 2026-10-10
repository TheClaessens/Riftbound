# Riftbound promo (15 s)

Output: `out/riftbound-promo.mp4` (1920×1080, 60 fps, H.264 + AAC) and `out/riftbound-promo.wav` (the soundtrack).

Built with the `game-promo-video` skill (Studio plugin). The renderer drives the real game frame by frame on a virtual clock with a seeded RNG, so every frame is reproducible.

| File | What |
|---|---|
| `promo.js` | Riftbound adapter: boots the game without its loop, staging API `P`, floating-text overlay, renderer config |
| `shots.js` | the 12 gameplay shots (staging, player control, time ramps) |
| `titles.js` | titles built from the promo Kit's `motion.js`, cut accents (`CUTS`), soundtrack cue sheet (`CUE`) |

## Render

Start the Studio (launch config `studio`). It serves the promo Kit at `/__studio/kits/promo/` and writes renders to `promo/out/`.

Open http://localhost:5170/promo/ in Chrome or Edge, then in the console:

```js
await promo.still(8.7)                          // one frame -> out/still.jpg
await promo.sheet()                             // contact sheet -> out/sheet.jpg
promo.start({ name: 'riftbound-promo.mp4' })    // full render; poll promo.job
```

Keep the tab visible while rendering: a hidden tab freezes and the render stalls.
If you change the dodge shot's timing, re-measure `P.shot.perfectT` after `promo.still(9)` and update `PERFECT_T` in `titles.js`.

The Kit lives in the Studio repo and is never copied here: improve it there.

## Store assets (CrazyGames)

`store/` renders the portal assets from the same staging layer (`stage.js`, shared with `promo.js`): three covers and two 18 s silent preview videos (real-speed gameplay, opening and closing on the cover).

| Output (`out/`) | Page | How |
|---|---|---|
| `riftbound-preview-landscape.mp4` (1920×1080) | `/promo/store/?w=1920&h=1080` | `promo.start({ name, bitrate: 12e6 })` |
| `riftbound-cover-landscape-1920x1080.jpg` | same | `store.verify('riftbound-preview-landscape.mp4', '<cover>.jpg')`: frame 0 of the video |
| `riftbound-preview-portrait.mp4` (1080×1920) | `/promo/store/?w=1080&h=1920` | `promo.start(...)`, then `store.verify(...)` |
| `riftbound-cover-portrait-800x1200.jpg` | `/promo/store/?w=1600&h=2400` | `store.cover(name, { w: 800, h: 1200 })` |
| `riftbound-cover-square-800x800.jpg` | `/promo/store/?w=1600&h=1600` | `store.cover(name, { w: 800, h: 800 })` |

- **Reload before every final render or cover.** The game keeps some world state across runs (geodes, debris VFX), so only the first pass after a fresh page load is reproducible.
- `store.verify()` checks a video without a `<video>` element (those never decode in a hidden browser pane): duration, size, track list (video only = silent), decoded frames → `<name>-check.jpg`.
- Cover framing: `COVER` in `store/shots.js` (seed, join time, zoom, per-aspect camera). The wordmark is drawn on the canvas to match the title screen (`css/menus.css` `.mn-mark`).
- The store page uses the vendored three.js and fonts and virtual timers.
