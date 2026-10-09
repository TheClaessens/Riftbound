# v4 review log (orchestrator)

Issues found while reviewing handbacks. Each one has an owner and a fix pass.

## For bundle E (reactions + statuses: `vfx/status.js`, `vfx/reactions.js`)
- **Frozen ice blocks are far too loud.** In `storm-stress-a2.png` (Thunderhead + Tempest → constant Superconduct → mass Frozen), the white faceted shells around frozen foes merge into one opaque white mass that hides the horde, the hero area and the hostile telegraphs.
  - Make them a **crust**, not a block: about ×1.1–1.2 the body radius instead of ×1.45, mostly translucent cyan-white with an ink edge.
  - Lower the opacity once more than about 12 are frozen (LOD), and never cover hostile telegraphs or the hero.
  - Bible 10 §4.7: the frozen look is a fresnel shell plus a body tint plus a small ground footprint.

## Core requests (orchestrator, later polish; agents have local workarounds)
- ribbons.js: a public persistent-strand API (storm's `Strand` uses `_alloc` / slot internals).
- decals.js: `handle.move(x, z)` (storm's `moveDecal` writes the instance matrix directly).
- clouds.js: a style registry (storm adds `CLOUD_STYLE.stormHead` / `stormPuff` from its own file).
- ribbons.js: an optional core colour and strength per bolt (the core is a fixed white 2.4; storm scales hdr ×0.72).

## Heroes
- Pyromancer, Stormcaller, Cryomancer accepted (quality bar met). The Cryomancer's face glow inside the hood is a little busy; acceptable.

## Review round 1 (after the A–D bundles and the 4 heroes)
- **Frost Nova:** the rime and mist centred on the hero wash over the hero for about 0.3 s (`frost-nova-r1-t04`). Clear a radius of about 0.8 u around the caster, or keep the mist below the knees.
- **Blizzard:** accepted. Possible polish: the interior rime reads a little like a pale disc. More ground texture (drift curls) would help, with less flat alpha.
- **Arcanist in game** (`arc-hero-ig1-h-wide`) looked washed-out white in one frame. Check the glow/tint during play.
- **Arcanist request "depart" squash before the blink:** declined. Phase Step moves the player instantly, so a depart pose would play at the arrival point. The arcane VFX already marks the departure point.
- **Core requests from Frost:**
  - Ramp atlas: done (384 rows).
  - `vfx.addSystem()`, MaxEquation decal blending, linear decal grow, frame-rate-independent ribbon length: backlog.
