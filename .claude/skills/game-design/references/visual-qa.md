# Visual QA Checklist

Screenshot each of these, at a real desktop resolution (set the viewport to about 1440×900 first):
- title / class select
- every stage at mid-density
- a stage at **max density** (spawn up to the enemy cap)
- each boss
- the stage transition
- the level-up modal, the item modal and the pause/codex screen
- death and victory screens

Fix, re-screenshot, move on. Don't loop on polish.

## Problems we found, and the fixes

| Problem | How it showed | Fix |
|---|---|---|
| Ground noise | Thousands of tiny glowing sigils (40 per texture tile × 100 tiles) | Count decals *per tile × repeats*; keep 2–3 per tile and dim their emissive |
| Emissive blowout | Lava cracks so bright and dense the enemies vanished | Fewer, thinner cracks; darker colour map; emissive intensity < 1 |
| Ground/enemy value clash | Charred-black enemies on near-black ground | Ground in mid-dark warm tones; enemies darker or lighter than it, never equal |
| Bright biome kills bloom | Near-white marble ground made spells unreadable | Mid-tone ground (slate-blue) with bright veins only |
| Bloom white-out at density | A crowd of pale crystal enemies with glowing cores merged into one white mass | Dark saturated body, small bright accent, lower accent intensity |
| Player lost in effects | Couldn't find the character at peak combat | Ground ring always drawn on top (`depthTest: false`, high renderOrder), brighter, with a dark inner disc |
| Area effects bloom white | Overlapping frost zones read as solid white | Lower glow intensity/opacity on area effects; use a tinted fill, not a white one |
| Overlapping banners | Act title card, announcement, milestone and discovery banner all centred | Give each overlay its own vertical band (announcements ~21%, title card ~42%, milestones ~64%) |
| Giant shapes at the screen edge | Arena wall slabs filling a third of the screen | The player walked past the visual wall: make collision match the wall shape (circle inside the octagon) |
| Light beams too strong | Tall additive cylinder dominating the frame | Opacity ~0.06, intensity < 1 |
| Clustered map objects | All crystals spawned around the start | Minimum spacing between objects (retry the placement); larger minimum distance from the player |

## Measurement traps
- **Hidden browser panes throttle `requestAnimationFrame`.** Game time barely advances, screenshots can be stale (we saw an old game-over screen), and FPS measurements hang. Advance the game with synchronous `update()` loops, call `render()` before screenshotting, and check DOM state when a screenshot disagrees with it.
- For performance, time `update()` and `render()` (plus `gl.finish()`) per frame at the enemy cap instead of measuring rAF FPS.
- A screenshot taken right after a simulated fast-forward shows CSS animations that ran on wall-clock time (title cards overlapping later events). Those overlaps won't happen in real play, but still give each overlay its own band.

## Readability rules to verify on every screenshot
- Can you find the player in under a second?
- Are enemy projectiles a colour no player spell uses?
- Are enemy telegraphs distinct from player telegraphs?
- Are status effects visible on enemies (a tint)?
- Is the HUD free of overlaps at 1280×720?
