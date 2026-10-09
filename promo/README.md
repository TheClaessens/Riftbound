# Riftbound promo (15 s)

Output: `out/riftbound-promo.mp4` (1920×1080, 60 fps, H.264 + AAC) and `out/riftbound-promo.wav` (the soundtrack).

Built with the `game-promo-video` skill (`.claude/skills/game-promo-video/`). The renderer drives the real game frame by frame on a virtual clock with a seeded RNG, so every frame is reproducible.

| File | What |
|---|---|
| `promo.js` | Riftbound adapter: boots the game without its loop, staging API `P`, floating-text overlay, renderer config |
| `shots.js` | the 12 gameplay shots (staging, player control, time ramps) |
| `titles.js` | titles built from `kit/motion.js`, cut accents (`CUTS`), soundtrack cue sheet (`CUE`) |
| `kit/` | copy of the skill's generic kit (shims, renderer, motion, soundtrack, servers) |

## Render

```
powershell -ExecutionPolicy Bypass -File promo/kit/serve.ps1 -Port 8096
```
(or `node promo/kit/serve.mjs` / `python promo/kit/serve.py`; the preview config is `riftbound-promo`)

Open http://localhost:8096/promo/ in Chrome or Edge, then in the console:

```js
await promo.still(8.7)                          // one frame -> out/still.jpg
await promo.sheet()                             // contact sheet -> out/sheet.jpg
promo.start({ name: 'riftbound-promo.mp4' })    // full render; poll promo.job
```

Keep the tab visible while rendering: a hidden tab freezes and the render stalls.
If you change the dodge shot's timing, re-measure `P.shot.perfectT` after `promo.still(9)` and update `PERFECT_T` in `titles.js`.

`kit/` is a copy. When you improve it here, copy the change back to `.claude/skills/game-promo-video/kit/` (or the other way round) so the skill keeps up.
