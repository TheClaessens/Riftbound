# 08 — World-grounded spell VFX toolkit (three r170, no assets)

**Problem.** Every player spell is built from round glowing dots, flat rings, flat discs, glowing spheres and Line2 lightning (`fx.js`, `skills/*.js`). Blizzard is a blue disc plus a ring plus falling dots. Meteor is pink spheres over rings. Singularity is a black ball plus purple rings. The creatures are chunky, outlined and toon-lit, so the spells read as UI, not as weather, fire or magic.

**Goal.** Effects should look like the actual phenomenon, drawn in the same low-poly, ink-outlined, toon-banded style as the creatures: a snow squall, frost creeping over the ground, a burning rock that craters, an arcane vortex sucking up debris, a thundercloud dropping bolts. They must stay cheap: about 10–15 draws and ≤1.5 ms of CPU in heavy combat.

This builds on `04-vfx-readability.md`: blend-add, the peak-channel bloom, HDR 1.4–1.8 for bodies, hostile red and magenta reserved, and point lights scaled to 0.3. None of that is repeated here.

> **Status: built and verified, not just proposed.** The toolkit in the appendix (`src/game/vfx/`, 11 modules, ~2,450 lines) was written and run against **three r170 from the same CDN import map**. The test ran in a headless Chrome on SwiftShader WebGL2, in a scene that reproduces the game's look: Neutral tone mapping ×1.3, the patched peak-channel bloom, the sun and hemisphere light, and the iso ortho camera.
>
> - **Shader compilation:** 0 shader or GL errors across 10 scenarios, including the real `greenskins` creature rigs with the §5 rig patch applied.
> - **CPU:** `vfx.update` averaged **0.11 ms** (max 0.5 ms) in a stress scene with 10 zones, 20 meteor impacts, 40 trails and 300 statused enemies.
> - **Draws:** **12** VFX draws plus 1 shadow-pass draw.
> - **Boot:** texture generation takes **72 ms** at startup.
>
> The harness is in Appendix B.

---

## TL;DR

1. **Replace the `Points` system with instanced quads** (one `InstancedBufferGeometry` with 4 vertices and N instances, in two layers: *paint* and *glow*). This allows velocity-stretched streaks, rotation, ground-flat sprites, inward spirals and atlas sprites. Points can't stretch, are capped by `ALIASED_POINT_SIZE_RANGE`, and waste about 10× fill on thin streaks.
2. **Make particles stateless on the GPU.** Motion is the exact integral of gravity plus linear drag (or a spiral). Colour, alpha, size, erosion, fill and ink over life come from a HalfFloat ramp texture. The CPU writes 16 floats **once at spawn** into a ring buffer and uploads only that range with `addUpdateRange`. There is no per-frame particle loop.
3. **Use a procedural 4×4 sprite atlas whose channels are data, not colour:** R = soft shape field, G = baked toon light, B = erosion noise, A = hot core. One threshold on R gives the silhouette, a **dark ink outline band** in a darker value of the effect's own hue, and noisy **alpha erosion**. That one trick makes white snow read on white sand and ties VFX to the outlined creatures.
4. **Paint first, glow second.** Painted, opaque-ish, two-tone, sun-lit sprites (snow, smoke, dust, toon fire, explosion puffs) carry shape and value. Additive glow is reserved for small accents (sparks, glints, runes, embers). Stacked additive puffs turned white in testing; opaque toon fire did not.
5. **Mesh primitives**, each one pooled draw:
   - **Debris:** instanced flat-shaded Lambert rocks, shards and embers with CPU bounce physics, plus crystals that *sprout* and later shatter. 2 draws.
   - **Noise shells:** cylinder, funnel, dome and torus with UV-scrolled noise, hard erosion and a **stepped** ramp with an ink edge. One instanced draw per geometry kind, ≤4.
   - **Ribbons:** trails and forked bolts in one pre-allocated dynamic mesh. 1 draw; this replaces Line2 allocations.
   - **Ground decals:** frost creep, scorch with cooling ember cracks, rune circle, sun-lit crater, puddle and cloud shadow, all in **one** instanced draw.
   - **Toon clouds:** instanced puffs plus an outline hull. 2 draws.
6. **Weather recipes.**
   - **Blizzard:** an upwind cloud lid, wind-slanted streaks spawned upwind so they *land* in the zone, tumbling flakes, ground gusts, low fog, a cold shadow, creeping frost, a low swirling snow wall, and ice spikes that sprout and then shatter.
   - **Thunderstorm:** a dark cloud pushed up-screen so it never hides the zone, rain, a wet stain, internal flicker, and forked bolts with scorch, spark star and clods.
   - Counts and draws are in §4.
7. **Status effects on 300 instanced rigs:** cheap always-on looks go in the rig shader through the **unused `iMisc.yzw`** (burn char and ember bands, frost on up-facing facets, a frozen ice tint with fresnel, a per-instance 24 Hz shock flicker; no new attribute). Overlays add one instanced ice-block shell per frozen enemy (plus a hull), flame tongues under a global 360/s budget, and shock arcs at 30/s.
8. **API:** `game.vfx.emit / emitter / debris / sprout / shell / decal / trail / bolt / cloud / zone / impact`, driven by preset data. `game.fx` stays intact. Skills swap their meshes for 1–3 calls (§6).
9. **Stylization rules (§3):** anticipation, then impact, then dissipation. Shrink and erode instead of fading. Use 2–3 hard colour bands and an ink edge. Keep big shapes opaque and low-HDR (only small cores above the 1.1 bloom threshold). Keep painted whites at linear ≤1.0. Use darker values of the same hue, never black. Wind and gravity must point somewhere.

---

## 1. Shaped particles

### 1.1 Points vs instanced quads

| | `THREE.Points` (today) | Instanced quads (recommended) |
|---|---|---|
| Draw calls | 1 | 1 per layer (2: paint + glow) |
| Vertices / particle | 1 | 4 (8192 × 4 = 32 k vertex invocations: trivial) |
| Shape | square, axis-aligned | any: rotated, **velocity-stretched**, ground-flat |
| Thin streak 0.1 × 0.7 m | needs a 0.7 × 0.7 m square, **~7× overdraw**, still can't orient | exactly 0.1 × 0.7 m, oriented along screen-space velocity |
| Max size | `ALIASED_POINT_SIZE_RANGE`. On some GPUs this is 64–256 px, and a 2.3 m fog puff at zoom 1.6 is ~165 px at 1080p | unbounded |
| Size scaling | needs `pixelsPerUnit()` uniform | world units, scales with zoom by itself |

**Recommendation: instanced quads, `InstancedBufferGeometry` + `ShaderMaterial` on a plain `Mesh`.** Verified in r170:

- `WebGLRenderer.renderBufferDirect` draws `min(geometry.instanceCount, geometry._maxInstanceCount)` instances.
- `_maxInstanceCount` is cached from `meshPerAttribute * count` the first time the geometry is bound, so keep the capacity fixed.
- `renderInstances` returns early when the count is 0.

Two layers keep the ordering sane: glow is always drawn over paint. Paint uses `renderOrder 9`, glow uses 13.

### 1.2 Stateless GPU particles (no per-frame CPU loop)

Per instance there are four `vec4`s: 16 floats, 64 B.

```
iA = p0.xyz, birth            (orbit: centre.x, y0, centre.z, birth)
iB = v0.xyz, life             (orbit: r0, angle0, angular speed, life)
iC = gravity, drag, size, rampRow      (orbit: rise, pull, size, row)
iD = rot0, spin, stretch, packed = cell + 16·orient + 64·mode
```

The vertex shader evaluates everything from `uTime`:

- **Motion.** It uses the exact solution of `dv/dt = g − k·v`: with `vt = g/k` and `e = exp(−k·t)`, `x = p0 + vt·t + (v0 − vt)(1 − e)/k` and `v = vt + (v0 − vt)·e`. When k < 1e-3 it uses the ballistic formula. It clamps to y ≥ 0.04.
- **Orbit mode** for vortices spirals inward: `r = r0·e^(−kt)`, `θ = θ0 + w0(e^(kt) − 1)/k`. Angular speed rises as the radius shrinks, so debris visibly accelerates into the funnel.
- **Looks over life.** Three rows of a 64-wide **HalfFloat** `RampAtlas` hold:
  - colour (rgb, HDR allowed) plus alpha;
  - size multiplier, erosion, fill/occlusion and ink strength;
  - the paint shadow colour.

  The ramps are sampled in the vertex shader (vertex texture fetch is core in WebGL2; RGBA16F is filterable in ES 3.0). `THREE.DataUtils.toHalfFloat` packs them, and its r170 export was checked.
- **Dead or unborn slots** output `gl_Position = vec4(2,2,2,1)`, which is clipped, so there is no fragment cost.

**CPU work:**

- **Spawn:** `ParticleLayer.spawn()` writes 16 floats at `head`, which wraps, so the oldest slot is recycled.
- **Upload:** `flush()` calls `attr.addUpdateRange(start·4, n·4)`, with two ranges if the ring wrapped, then `needsUpdate = true`. r170 merges adjacent ranges and clears them after upload (`WebGLAttributes.updateBuffer`).
- **Idle:** `mesh.visible = time < lastDeath`, so an idle layer costs nothing.
- **Capacity:** 8192 per layer, 512 KB. At 2,000 spawns/s that covers ≥4 s of history, longer than any preset life (fog 2.4 s).

### 1.3 Sprite atlas (procedural, 512² RGBA8, 4 × 4 cells of 128 px)

The cells are: `puff wisp flame streak / star snowflake iceChip flake / rune rune2 droplet ring / curl zigzag dot glint`.

Each cell is rasterised white-on-black with canvas paths, then processed CPU-side:

- 3 iterations of a separable box blur (r = 3), which approximates a gaussian with σ ≈ 2.5 px. The drawn edge sits at field 0.5.
- **G** is a light term computed from the field gradient, giving a fake normal lit from the upper left.
- **B** is periodic fbm noise.
- **A** is field³.

Packing happens in a `Uint8Array`, **never through canvas alpha**, because `putImageData` premultiplies and destroys RGB where A < 1. Mipmaps are on (`LinearMipmapLinear`). Every *stretchable* sprite is drawn pointing up (+v), and the shader aligns +v with velocity.

**Gotcha found while testing.** A thin capsule streak only fills ~20% of its quad width, so it rendered 1 px wide. Draw streaks *fat*: 60 of 128 px wide. The stretch makes them thin.

### 1.4 Fragment: silhouette, ink band, erosion, two blend modes in one state

```glsl
float v   = tx.r - erode * (1.25 * (1.0 - tx.b) + 0.2);       // noisy dissolve, thin parts first
float sil = smoothstep(0.30 - aa, 0.30 + aa, v);              // silhouette incl. ink band
float fill= smoothstep(0.47 - aa, 0.47 + aa, v);              // body (≈ drawn edge)
paint: base = mix(shadeColour, litColour, smoothstep(.44,.56, tx.g))   // 2-tone toon light
glow:  base *= 1 + 0.4 * smoothstep(0.7-aa, 0.7+aa, v)                 // hard-edged hot core band
ink  = min(colour, 1) * 0.18;  inkA = (sil - fill) * inkStrength
out  = vec4((base*fill*emitK + ink*inkA) * a, (fill*fillA + inkA) * a)  // emitK = fillA (paint) | 1 (glow)
```

Under `BLEND_ADD` (src One, dst OneMinusSrcAlpha):

- **Paint** is correct premultiplied normal blending.
- **Glow** adds rgb while its alpha occludes the ground.
- The ink band darkens what is behind it in both modes.

This is why white snow reads on Act II sand and Act III water: every flake carries a dark blue-grey outline of its own hue.

### 1.5 Presets (data only; see `presets.js`)

```js
snowStreak: { layer: 'paint', cell: 'streak', life: [0.5, 0.75], size: [0.13, 0.17], stretch: 0.8,
  color: 0xffffff, alpha: FADE, fill: 0.95, ink: 0.9, erode: [[0, 0], [0.85, 0], [1, 0.8]] },
flameLick:  { layer: 'paint', cell: 'flame', gravity: -6, ... color: [[0, 0xffe070, 1.25], ...],
  shade: [[0, 0xff7a1a, 1.05], ...], fill: 1, ink: [[0, .5], [1, .9]], erode: [[0, 0], [.5, .15], [1, 1]] },
```

Shipped presets:

- **Frost:** `snowStreak, snowflake, snowDrift (ground curl), coldFog, iceChip, frostGlint`
- **Fire:** `flameLick, ember, smoke, fireball (opaque toon puff→smoke), dustRing`
- **Arcane:** `arcaneMote (orbit), vortexDebris (orbit), runeGlyph`
- **Storm:** `spark, sparkStar, rain`

`vfx.define(name, {...})` derives variants. Each preset uses 3 ramp rows; the atlas holds 160.

---

## 2. Mesh-based primitives

### 2a. Debris (`debris.js`): 2 draws

- **Meshes:** two `InstancedMesh`es of 384 each. One is a *chunk*: a seeded jittered icosahedron, flat-shaded, which casts shadows and reads as a rock. The other is a *shard*: an octahedron stretched ×2–3 in Y, which reads as an ice or crystal splinter.
- **Material:** `MeshLambertMaterial({ flatShading })`, lit by the real sun and hemisphere, with `instanceColor`. An `onBeforeCompile` adds an `iEmis` vec3 attribute to `totalEmissiveRadiance`, so embers start at 0xff7a2a ×2.2 and cool quadratically to charcoal.
- **Physics:** structure-of-arrays state with swap-remove. Gravity is 20–26 m/s² (snappier than 9.8 reads better in iso). On a bounce the restitution is 0.3–0.35, and both XZ velocity and spin drop to 60%. Resting chunks get exp(−8t) friction. The fade is **shrink to 0 over the last 0.25 s**: no transparency, so debris stays in the opaque pass.
- **`sprout(kind)`:** a static crystal grows with easeOutBack over 0.22 s, holds, and at end of life spawns `k.shatter` pieces. This drives the blizzard ice spikes.
- **Albedo rule:** keep debris albedo ≤ ~0.7 linear. A white-ish `0xdff6ff` facet facing the sun is 1.38 linear and bloomed into a 15 m halo in testing.

### 2b. Noise shells (`shells.js`): ≤4 draws (one per geometry kind)

| Geometry | Notes | Used by |
|---|---|---|
| `cylinder` | open, base at y = 0 | snow wall, fire pillar |
| `funnel` | top r = 1, bottom r = 0.22 | tornado, vortex |
| `dome` | half sphere | blast |
| `torus` | flat | swirl ring |

- **Animation is all on the GPU.** Per-instance `iS0..iS3` (birth, life, seed, ramp row, tile, scroll, twist, erode, wobble, mode, fade-in/out, hdr, front alpha) are written once at spawn; the CPU writes a matrix only on spawn or move.
- **Fragment:**
  ```glsl
  uv.x += uv.y * twist;                                  // spiral
  n = R(uv*tile + scroll*t) * R(uv*tile*(2,1.5) + scroll*(1.7,1.3)*t) * 2;   // two LOW-freq octaves
  f = n * verticalProfile(uv.y) - (erode + (1 - envelope) * 0.8);          // erodes in AND out
  m = smoothstep(-aa, aa, f);  colour = ramp(row, f / 0.45)  // STEPPED ramp: ink → body → highlight
  front faces: alpha *= mix(1, frontAlpha, facing²)          // near wall never hides the contents
  ```
  **Gotcha:** using the high-frequency noise channel (period 16) as the second octave made the blast dome a fuzzy, hairy ball. Both octaves must be low-frequency (period 4).
- **`tile.x` must be an integer** or a seam appears where the UV wraps.
- **Styles:** `snowVeil` (low swirling snow wall, paint), `firePillar`, `vortexFunnel`, `blastDome` (**opaque toon fire dome**: ink, red, orange and a yellow core band; only the core exceeds the bloom threshold), `arcaneDome`, `frostRing`.
- **Pooling:** at most 32 instances per kind, swap-remove; `h.end(fade)` shortens life on the GPU.

### 2c. Ribbons (`ribbons.js`): 1 draw for every trail and bolt

- **Buffers:** one `BufferGeometry` pre-allocated for 96 ribbons × 16 points × 2 vertices, with a static index and dynamic `position`, `aSide` (u, side, alpha, style) and `aCol` (rgb, hdr).
- **Each frame:** for live ribbons the CPU builds a camera-facing strip, `side = tangent × viewDir`, with the width tapered as (1 − u)^0.6. Unused points collapse onto the last point, giving zero-area quads; without that, stale vertices smear.
- **Trails:** `trail(target)` reads `target.x/y/z` every frame, so you can pass `projectile.pos`. It pushes a point every `segLen` (0.3 m). After `stop()` the tail retracts at 60 points/s and the slot is freed. The fragment shader scrolls noise along u and erodes the tail into flecks.
- **Bolts:** `bolt(from, to)` builds a 12-point midpoint-displaced main strand with 2 forked branches. Across its width it has a white-hot core (×2.4), an element-coloured glow, and a **dark ink edge** (alpha 0.75) so it reads on sunlit ground. It flickers for 0.18 s.
- **Replacing `fx.lightning`:** the current version allocates a `LineGeometry`, which in turn allocates `InstancedInterleavedBuffer`s in `setPositions`, plus 2–3 `LineMaterial`s per call. The ribbon pool allocates nothing.

### 2d. Ground decals (`decals.js`): 1 instanced draw for all of them

- **Setup:** `PlaneGeometry(2,2)` laid on the ground, `depthTest: false`, `renderOrder 1` (below `fx.ring` = 2 and telegraphs), BLEND_ADD premultiplied (rgb = paint·a + emission). Per-instance `iD0..3`: birth, life, seed, kind; grow, fade, intensity, extra; colour A; colour B and hdr. The fragment shader branches on `kind`, which is per instance and therefore coherent.
- **Noise sampling:** polar samples use `textureLod(…, 1.0)`. At the `atan` seam the derivatives spike and select the smallest mip.

| kind | Mask |
|---|---|
| **frost** | Growth front `grow·(0.78 + 0.26·lobes(θ))` with dendrite fingers `(fing − .5)·0.25` near the edge. Worley facets (B ≤ 0.09) are drawn as white lines, with glints that twinkle per cell. An **ink band 0.14 m** wide on the advancing front. Melts through noise holes. |
| **scorch** | fbm blob of char (`0x24160f` at α 0.72). Worley ember cracks cool as `exp(−age·extra)` from yellow through red to off. |
| **rune** | Rings at r 0.93, 0.80 and 0.42; 14 sectors of procedural 3-stroke glyphs (hash, then 3×3 grid points, then `sdSegment`); a counter-rotating hexagram. Drawn on by an angular sweep. Glow strokes over a dark backing (α 0.5), so it reads on bright ground. |
| **crater** | Bowl plus raised lip **lit from the real sun direction**. The inner wall facing away from the sun is lit and the lip facing the sun is lit, so it reads as a depression in iso. Radial cracks come from polar-warped Worley `(θ·2, log r·0.35)`; ember glow is optional. |
| **wet** | Dark stain (`0x1d3550` at α 0.38), a sheen band at the edge, and three ripple rings popping at hashed points. |
| **shadow** | Soft cool shadow blob with a drifting edge, used for the cloud shadow. |

Capacity is 128 with swap-remove; `h.end(fade)` starts the melt early. **The fragment cost is the area**: keep frost and wet decals under radius 6 m.

### 2e. Clouds (`clouds.js`): 2 draws

- **Geometry:** `IcosahedronGeometry(1,1)` puffs squashed to 0.62 in Y. The vertex shader boils them by wobbling along the normal at 2.2 Hz.
- **Toon light:** a hard terminator, `smoothstep(.02,.1, n·sun)`, with a darker underside.
- **Outline:** an inverted-hull outline drawn with the shared `instanceMatrix`, like the creatures. Its colour is shadow ×0.26.
- **Flash:** an internal lightning flash per cloud.
- **Opaque with dithering.** Clouds stay in the opaque pass; see-through is a 4×4 Bayer screen-door driven by per-cloud alpha. **The cloud fades to 0.45 whenever the player stands in its screen footprint.** A point at height h hides the ground about 1.16·h further up-screen, because the camera elevation is atan(1.22/√2) = 40.8°.
- **`back` option:** pushes the cloud up-screen along `engine.forward` so it does not cover the zone it rains on.

---

## 3. Stylization: what the shipped games do, and 12 rules for Riftbound

### 3.1 Sources

Primary sources on Hades, Genshin, Torchlight and Last Epoch VFX internals could not be found. A Supergiant dev states Hades renders 3D-animated content to 2D frames, and its effects are mostly 2D animations. Items marked *(observed)* are from playing the games, not from a citation.

- **Riot (League).** Give each effect one clear primary shape, with value and saturation supporting it. Avoid 0% and 100% value and saturation. A wider value range draws focus. Use one dominant hue (frost blue, healing green). Mix hand-painted soft and hard edges without stacking contradictory shapes. Add motion blur along travel. Timing is anticipation, payoff, then time to read. Keep effects short, because duration signals importance. ([VFX Apprentice digest of the Riot style guide](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips), [original dev post](https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/), now redirected.)
- **Stefan Jevremović, Nordeus, "VFX staples".**
  - Every effect weighs shape, colour and motion, usually leaning on one of them.
  - Use gradients as lookup tables over grey textures.
  - **Scroll textures on meshes instead of using many particles.**
  - Timing runs in three phases: anticipation (fade-in), climax (most elements, highest contrast and saturation), and dissipation (low contrast, low opacity, so it doesn't distract).
  - "Gameplay comes first."

  ([80.lv](https://80.lv/articles/vfx-staples-shape-color-and-motion/))
- **Simon Trümpler, *Stylized VFX in RiME*.** Fade through the texture's alpha by **thresholding (erosion)**, not by lowering opacity. The erosion mask should follow the form; RiME's matches the height of the sculpt that produced the normal map, so the volume survives the fade. ([simonschreibt.de](https://simonschreibt.de/gat/stylized-vfx-in-rime/), [Unreal Fest Europe 2018](https://www.unrealengine.com/events/unreal-fest-europe-2018/stylized-vfx-in-rime))
- **Trümpler, GDC VFX Summit, *How to (Not) Create Textures for VFX*.** Covers erosion, LUT and flow textures as distinct data channels; that is our R/G/B/A packing. ([GDC Vault](https://www.gdcvault.com/play/1027741))
- **Scrolling noise × mask.** Use two samples of the same noise with different panners and scales, multiply them and ×2, then multiply by a shape mask. Add a per-particle UV offset so instances never match. Scroll direction follows the element: cold smoke falls, fire rises. ([RealtimeVFX basics](https://realtimevfx.com/t/vfx-basics-creating-the-scrolling-texture-with-mask-setup/1966))
- **Toon fire.** Use a fixed threshold on a grey mask (step, not fade), unlit. Erosion is computed as `noise·mask − (1 − vertexAlpha)` with a smoothstep; some values look cel-shaded, others realistic. ([Duck in Town devlog](https://papaya-games.itch.io/duck-in-town/devlog/95149/how-to-make-an-stylized-fire-shader), [godotshaders, MinionsArt technique](https://godotshaders.com/shader/stylized-fire-3d/))
- **Toon smoke in three.js.** Real-time cartoon smoke built from small geometry so the shading steps are controllable, plus a silhouette outline. This is the academic version of our "paint layer + ink band". ([SIBGRAPI 2023](https://sol.sbc.org.br/index.php/sibgrapi/article/view/27342))
- **Diablo.**
  - **Diablo III:** VFX should tell the player instantly whether to avoid something or go toward it ([GDC 2013 recap](https://ubergizmo.com/2018/06/how-blizzard-created-diablo-3-visuals/amp)). Its "BlendAdd" (alpha darkens, rgb adds) is already our default ([notes](https://3dreference.notion.site/VFX-In-Diablo-29806517bc9f4330be3c0ece360eace0)).
  - **Diablo IV:** effects needing immediate attention stand out; environmental effects meld into the atmosphere ([quarterly update summary](https://www.wowhead.com/cn/news/physical-based-rendering-and-visual-effects-diablo-iv-quarterly-update-325416)).
- **Overwatch.** Stylized, hand-painted, basic effects; timing follows animation fundamentals; snappy is fun. ([VFX Voice](https://vfxvoice.com/rachel-day-the-game-changing-gamemaker-behind-overwatch/))
- **GDC 2017.** *Art Directing VFX for Stylized Games* (Epic, Volition, Double Fine, Motiga) and *Visual Effects Bootcamp: Artistic Principles* (League and Hearthstone case studies). ([1](https://gdcvault.com/play/1024715/Art-Directing-VFX-for-Stylized), [2](https://gdcvault.com/play/1023943/Visual-Effects-Bootcamp-Artistic-Principles))
- **Weather spell structure.** A UE5 frost storm built in phases: summoning circle, charge-up, shard burst, then a persistent storm of wind-driven snow, swirling clouds, decals and ice impacts, with each phase a separate emitter. ([Samy Mercurio](https://samymercurio.artstation.com/projects/oJD2em)). A fire tornado made from a noise-driven material on a tornado mesh with rings at the top and bottom, duplicated for two colours. ([RealtimeVFX](https://realtimevfx.com/t/fire-tornado-effect/25604))
- *(observed)*
  - Hades and League ultimates use opaque, hard-banded shapes with dark inner edges.
  - Genshin elemental bursts use 2–3 flat colour bands, white-hot cores only at the centre, and dissolve by erosion.
  - Torchlight and Last Epoch ground AoEs are textured *phenomena* (ice sheets, lava cracks, rune circles), not flat tinted discs.

### 3.2 Rules (enforced by the toolkit's defaults)

1. **Every cast has three beats.**
   - **Anticipation (0.1–0.35 s):** rune sweep, frost front, telegraph, cloud grow-in.
   - **Impact (1–3 frames of maximum contrast):** dome, star, flash, debris, shake.
   - **Dissipation (0.4–1.5 s, low contrast):** smoke, cooling cracks, melting frost, sinking debris.

   Skills must not spawn everything at full strength at t = 0.
2. **Erode, don't fade.** End-of-life is `erode` (noisy threshold) and/or `sizeCurve → 0`. Opacity fades are only for fog. Default `erode = [[0,0],[0.7,0],[1,1]]`.
3. **2–3 hard colour bands plus an ink band.** Shells and decals use stepped ramps (`step([...])`). Sprites use the two-tone G light, the hard core band and the ink band. No smooth radial gradients on big shapes.
4. **Ink is a darker value of the effect's own hue**: frost ink `0x4a6f99`, fire `col·0.18`, arcane `0x12051f`. Never pure black (Riot: avoid 0% value). It ties VFX to the outlined creatures and makes white read on white.
5. **Big shapes are paint; small accents are glow.** Domes, puffs, flames, snow and smoke are opaque premultiplied paint with HDR ≤ 1.25 (just the core band over the 1.1 threshold). Additive glow only for things under ~0.5 m: sparks, glints, runes, embers, bolt cores. Measured: 8 stacked additive fireball puffs at ×2.4 went white with a 6 m bloom halo, while the paint version stays orange.
6. **Paint whites stay at linear ≤ 1.0.** Status ice, frost and snow must never bloom. HDR is a gameplay signal reserved for the player's damage beats.
7. **Shape language per element** (silhouette first):

   | Element | Shapes | Motion |
   |---|---|---|
   | Frost | crystalline, faceted, straight-edged (Worley facets, octahedral shards, dendrites) | slow fall, sharp shatter |
   | Fire | teardrops and tongues pointing up | rising, flickering, ends in smoke |
   | Arcane | circles, glyphs, spirals | rotating, drawn inward |
   | Storm | zig-zags and stars | instantaneous, then crackle |
8. **Direction must be physical.** Snow falls *slanted by wind*: the default wind is screen-right, so the slant reads. Streaks are spawned upwind so they *land* in the zone. Fire rises (negative gravity), debris bounces with gravity at 22–26, vortex debris spirals in and speeds up.
9. **Secondary motion is free.** Cloud boil (vertex wobble), funnel twist (UV scroll), rune counter-rotation, glints twinkling, cooling cracks, fog drift and spin on flakes. All of it is GPU-time-driven with no CPU cost.
10. **Ground contact sells weight.** Every area effect writes a decal (frost, scorch, crater, wet, shadow), and every impact throws debris that casts real shadows. "A circle" becomes a *thing on the ground*.
11. **Hierarchy follows Riot's "scale of importance".** A basic projectile is a ribbon plus a few glints. An area spell has a decal, a shell and particles. An ultimate or fusion adds a cloud, debris and a shake. The hostile red `0xff2a3d` and magenta `0xff2a6d` hues are never used by player VFX: fire uses orange and yellow, arcane uses violet `0xb67cff`.
12. **Never cover the playfield.** Clouds are pushed up-screen (`back`) and dither to 0.45 alpha over the player. Cylinder walls drop their front-face alpha to 0.2–0.45 mid-silhouette. Shells are low: the snow wall is 1.4 m, not 3.4 m. A 3.4 m wall looked like a glass jar in testing.

---

## 4. Weather area effects: composition recipes (`recipes.js`)

Iso geometry used throughout:

- **Camera elevation** is 40.8°.
- **Height on screen:** an object at height h covers the ground about 1.16·h metres further up-screen, along `engine.forward = (−1,0,−1)/√2`.
- **Scale:** 30 px/m at 720p, 45 px/m at 1080p (zoom 1), ×0.6–1.6 with zoom.
- **Sun direction toward the sun**, from `SUN_OFFSET`, is (−12, 34, 24).

### 4.1 Blizzard, radius R = 3.5 m, life L = 4 s

| Element | Primitive | Numbers |
|---|---|---|
| Cold shadow | decal `shadow` | radius 1.25R, α 0.26, grows over 0.4 s |
| Frost creeping out | decal `frost` | radius 1.08R, grows over 0.6 s with a crystalline front, melts over 0.7 s after the zone ends |
| Cloud lid | `cloud('snow')` | 7 puffs, radius 0.7R, y = 4.2, **placed upwind** by 0.5 s of drift; dithers over the player |
| Low swirling snow wall | shell `snowVeil` (cylinder) | radius 0.98R, height 1.4 m, tile [5,1], scroll [−0.7, 0.45], twist 0.6, erode 0.36, front α 0.45 |
| Wind-driven streaks | emitter `snowStreak` | **26·R/s (≈91/s)**, y 3.4–4.0, v = wind·3.4 + (0, −7.5, 0), `land: true`, ≈55 alive |
| Tumbling flakes | emitter `snowflake` | 5·R/s, y 2–3.6, v = wind·2.0 + (0, −2.6, 0), spin ±3 rad/s |
| Ground gusts | emitter `snowDrift` (ground-flat curls) | 3·R/s, sliding along the wind at 5 m/s |
| Low fog | emitter `coldFog` | 1.2·R/s, 1.5–2.3 m puffs, α 0.32, ≈8 alive |
| Ice spikes | `sprout('iceSpike')` | 4 + R spikes (7), staggered from 0.2 to 0.9 s; shatter into 5 `ice` shards each when the zone ends |
| Cast beat | `frostGlint` ×8 (+ the skill's `fx.ring`) | — |

Per zone that is about 100 particles alive, 1 cloud (7 puffs), 1 shell, 2 decals and ≤7 sprouts. **Draw calls are shared**: 10 blizzards cost the same 12 draws as one. In the stress test, `vfx.update` took 0.11 ms with 5 blizzards, 5 vortices and 300 statused enemies.

### 4.2 Thunderstorm, R = 4, L = 5

| Element | Numbers |
|---|---|
| Dark cloud `storm` | 10 puffs, radius 0.85R, y = 5.2, **`back: 0.6R`**, so its screen footprint sits behind the zone and the bolts slant down-screen into it |
| Internal flicker | `flash(0.25–0.45)` every 0.25–0.75 s; a strike calls `flash(1)` |
| Shadow + wet stain | decal `shadow` 1.3R at α 0.34; decal `wet` 0.9R, growing over 1.2 s, with 3 ripple rings |
| Rain | emitter `rain` at 30·R/s, v (0.6, −11, 0.3), `land: true`, streak stretch 0.7 |
| `strike(target)` | forked bolt (main strand + 2 branches) from the cloud base, scorch 0.9 m (cooling 3/s), `sparkStar`, 8 `spark` streaks, 3 `dirt` clods; optional `fx.light` |

Static Field (no zone) uses `vfx.impact('skyStrike', e.pos)`: a bolt from 12 m up plus the same ground beats.

### 4.3 Meteor and vortex

- **Meteor fall (0.8 s):**
  - The rock is a shared-geometry mesh: dark flat-shaded rock, emissive 0.35, dark hull outline.
  - A fire ribbon 1.5 m wide follows it.
  - `flameLick` at 55/s and `smoke` at 16/s follow it.
- **Meteor impact:**
  - crater decal 0.75R and scorch decal 1.05R, with ember cracks cooling over about 1.5 s;
  - opaque toon `blastDome` (0.85R × 0.6R, 0.32 s);
  - `fireball` ×6, `ember` ×26, `smoke` ×8, a `dustRing` ×14 that expands along the ground;
  - debris: `rock` ×10 and `ember` ×8.
- **Vortex (Singularity):**
  - **Main body:** a rune circle decal (radius R) and a funnel shell (0.42R × 3 m, twist 1.2).
  - **Particles:** `arcaneMote` orbit at 30/s and `vortexDebris` orbit at 12/s; these spiral in and accelerate. `runeGlyph` rising at 2.5/s.
  - **Collapse:** `arcaneDome`, runes ×8 and `crystal` debris ×8.

---

## 5. Status visuals on 320 instanced creature rigs

**Recommendation: split by cost.** Anything that must show on *every* affected enemy goes in the rig shader, which costs zero extra draws. Anything that needs real shape goes in pooled instanced overlays (`status.js`). Statuses are gameplay information (Frozen leads to Shatter), so the frozen look is the loudest.

### 5.1 Rig shader channel: no new attribute

`iMisc` is `vec4(elite, -, -, -)`; only `.x` is read. Use **`iMisc.yzw = (burn, cold, shock)`**:

- **burn:** 0 or 1;
- **cold:** chill stacks × 0.12 up to 0.6, or 1 when frozen;
- **shock:** 0 or 1.

Then:

- **Chilled:** frost dusting on up-facing facets. `vUpN` is the world-normal y from the rigged normal and `instanceMatrix`, and up-facing facets are mixed toward `0.93, 0.97, 1.0`. The result is snow on heads and shoulders.
- **Frozen:** the body becomes ice-blue, `mix(diffuse, (0.45, 0.72, 0.95)·(0.55 + luma), 0.6)`, plus a cold fresnel.
- **Burning:** `diffuse ×(1 − 0.35)` chars the body. Ember bands creep up the lower body: `(1, .38, .08)·(0.04 + 0.4·flick·low²)`.
- **Shocked:** a whole-body on/off flicker at 24 Hz, computed in the vertex shader per `gl_InstanceID` so enemies are desynchronised. It is weighted toward the rim.

The patch is about 30 lines in `rig.js` and 5 in `renderer.js`; see Appendix A.12. It was verified compiling and rendering on the real greenskins rigs: grunt, troll, shaman and scamp. One shared `RIG_TIME` uniform object lives at module scope in `renderer.js`, and the cache key bumps to `rig-color-v4`.

Wire it in `enemies.js` `updateVisuals`, next to `h.tint`:

```js
const s = e.status;
const st = (h.stat ??= [0, 0, 0]);
st[0] = s.burn > 0 ? 1 : 0;
st[1] = s.frozen > 0 ? 1 : Math.min(0.6, s.chill * 0.12);
st[2] = s.shock > 0 ? 1 : 0;
```

Then drop burn, shock and chill from `statusTint`, keeping frozen (still useful as a colour wash), stun and barrier. Otherwise the old emissive wash (`tk` 0.17/0.34) stacks on top.

### 5.2 Overlays (`status.js`, owned by `game.vfx`, reading `game.enemies`)

- **Frozen ice block:** one `InstancedMesh` (cap 384), plus an inverted hull that shares `instanceMatrix`, so 2 draws.
  - **Geometry:** a jittered icosahedron that *encloses* the body, plus 6 octahedral crystals jutting out, normalised to xz [−1,1] and y [0,1]. Each instance is scaled to `max(.45, baseRadius·1.45)` × `topY·1.08`.
  - **Animation:** grows in with easeOutBack over 0.14 s on the GPU from a per-instance freeze time.
  - **Shading:** 3 hard facet bands from the sun in view space, a fresnel toward white, alpha 0.42 + 0.4·fresnel, and peak ≤ 1.0 so it never blooms.
  - **Thaw or death:** `impact('shatter')` spawns ice shards ×8, chips ×10 and 3 glints.
- **Burning flames:** `flameLick` (paint, opaque toon flame) at ≤10/s per enemy and **≤360/s in total**, round-robin across burning enemies. With 300 burning that is about 1.2 flames each per second, plus the shader glow.
- **Shock arcs:** 5-point mini bolts through the ribbon pool at **30/s total**, round-robin across shocked enemies, plus the shader flicker.

---

## 6. API, integration and pooling

### 6.1 Module layout (`src/game/vfx/`, new; owner: graphics)

| File | Contents |
|---|---|
| `index.js` | `class VFX` (game.vfx), `BLEND_ADD` |
| `textures.js` | sprite atlas, tileable noise (fbm ×2 + Worley edge and id), `RampAtlas` (HalfFloat), `step()`, `tintCurve()` |
| `particles.js` | `ParticleLayer` (stateless instanced quads) |
| `debris.js` | `DebrisSystem` + `DEBRIS` kinds |
| `shells.js` | `ShellSystem` |
| `decals.js` | `DecalSystem` + `DECAL` kinds |
| `ribbons.js` | `RibbonSystem` (trails + bolts) |
| `clouds.js` | `CloudSystem` |
| `status.js` | `StatusVFX` (ice shells, flames, arcs) |
| `presets.js` | `PARTICLES`, `SHELLS` (pure data, edited by skill authors) |
| `recipes.js` | `RECIPES` (blizzard, meteor, meteorImpact, vortex, storm, skyStrike, shatter) |

### 6.2 `game.js` wiring (keep `game.fx` untouched)

```js
import { VFX } from './vfx/index.js';
this.fx = new FX(this);
this.vfx = new VFX(this);                       // after fx; needs scene, engine.camera, player, enemies
// playing branch, next to this.fx.update(dt):
this.vfx.update(dt);                            // hit-stop / pause: don't call it (everything freezes, incl. GPU time)
// next to every this.fx.clear():
this.vfx.clear();
```

Warm up the shaders at boot (first use otherwise stalls for 20–60 ms per program). Do one `vfx.emit` per layer, one shell per kind, one decal, one cloud and one ribbon, render a frame off-screen (or call `renderer.compile(scene, camera)`), then `vfx.clear()`.

### 6.3 Skill rewrites (each 1–6 lines; the gameplay code is unchanged)

```js
// blizzard.js  FrostZone: delete disc/edge meshes + snow sparks
this.fxh = game.vfx.zone('blizzard', this.pos, { radius: this.radius, life: this.life });
dispose(game) { this.fxh.end(); }

// meteor.js: delete FallingRock + Crater meshes (keep the telegraph, damage and the Crater damage tick)
game.vfx.zone('meteor', pos, { radius: impactR, fallTime: FALL_TIME, noImpact: true });   // in launchMeteor
game.vfx.impact('meteorImpact', pos, { radius, life: craterLife + 0.5 });                  // in impact()
game.vfx.emitter('flameLick', { pos, radius: craterR * 0.7, rate: 14, y: [0.1, 0.3], life: craterLife });

// singularity.js  Vortex: delete floor/ring/tori/core meshes and the mote sparks
this.fxh = game.vfx.zone('vortex', pos, { radius: this.radius, life: this.life });       // collapses itself at `life`

// staticField.js strike(): replace fx.lightning + fx.ring
game.vfx.impact('skyStrike', e.pos);

// common.js Projectile: optional ribbon trail
if (opts.ribbon) this.ribbon = game.vfx.trail(this.pos, { color, width: opts.ribbon.width ?? 0.45, hdr: 1.5 });
// dispose(): this.ribbon?.stop();
```

### 6.4 Pool `fx.ring` and `fx.flashDisc` (cast 20+ times/s late game)

Today every call creates a `ShaderMaterial`, which costs a JS object plus a uniform upload. The program is cached, but GC churn at 20 casts/s and higher is avoidable:

```js
// constructor
this._pool = { ring: [], disc: [] };
// ring(): take or make
let e = this._pool.ring.pop();
if (!e) { const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() }, uInner: { value: 0 }, uFade: { value: 1 }, uOcc: { value: 0 }, uMode: { value: 0 } },
  vertexShader: FX_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, ...BLEND_ADD });
  e = { mat, mesh: new THREE.Mesh(GEO.ring, mat) }; e.mesh.rotation.x = -Math.PI / 2; e.mesh.renderOrder = 2; }
e.mesh.geometry = this._ringGeo(width);
const u = e.mat.uniforms; u.uColor.value.set(opts.color ?? 0xffffff).multiplyScalar(opts.hdr ?? (dust ? 1 : 1.7));
u.uInner.value = 1 - Math.max(0.02, Math.min(0.98, Math.round(width * 100) / 100)); u.uFade.value = 1; u.uOcc.value = opts.occ ?? (dust ? 0.7 : 0.45); u.uMode.value = dust ? 1 : 0;
// transient: { mesh: e.mesh, keepMaterials: true, onEnd: () => this._pool.ring.push(e), ... }
// clear(): for (const tr of this.transients) { this.scene.remove(tr.mesh); if (tr.keepMaterials) tr.onEnd?.(); }  (corpse transients also keep materials: give pooled ones a flag)
```

The same pattern applies to `flashDisc`, with key `disc`.

### 6.5 Budgets (measured, headless Chrome, SwiftShader; JS timings are CPU-representative)

| Scene | `vfx.update` avg / max | VFX draws (+ shadow pass) | Alive |
|---|---|---|---|
| all four spells + 12 trails | 0.06–0.08 / 0.5 ms | 12 (+1) | 394 paint + 100 glow particles, 10 decals, 22 ribbons, 2 clouds, 34 debris |
| **stress**: 5 blizzards + 5 vortices + 20 meteor impacts + 40 trails + 300 statuses | **0.11 / 0.5 ms** | **12 (+1)** | 2,203 + 892 particles spawned, 55 decals, 44 ribbons, 5 clouds, 146 debris, 75 ice shells |
| boot (atlas + noise + pools) | 72 ms once | — | — |

The GPU cost is fill rate: decal area, fog puffs and shells. Watch the decal radius (≤6 m) and the fog count (≤10 per zone). Particle vertex work, 2 × 8192 × 4 vertices with most of them clipped, is negligible.

### 6.6 Gotchas found during verification

- A thin streak sprite rendered 1 px wide. Draw stretchable sprites fat.
- Additive fire puffs stacked into white with a 6 m bloom halo. Big fire must be paint.
- White-ish Lambert debris (albedo 0.73) and HDR ice fresnel crossed the 1.1 bloom threshold and produced 15 m halos. Keep albedo and paint at ≤0.7 linear.
- A tall cylinder snow wall reads as a glass jar or snow globe. Keep it low (1.4 m) with front faces at 0.45 alpha.
- Snow falling on the world wind (0.8, 0.6) runs parallel to screen-down and the slant vanishes. Use a screen-right wind for the effect.
- A cloud directly above a zone hides its back half. Push it up-screen (`back`) or upwind, and dither over the player.
- In the ribbons, unused points must collapse onto the last point, or stale vertices smear.
- `LineSegmentsGeometry.setPositions` allocates new interleaved buffers on every call (r170). Never call it per frame or per bolt.
- The creature renderer's `Batch` constructor signature is being changed by another agent. Pass the rig time through a module-level uniform object, not a constructor argument.

---

## Appendix A: drop-in code (`src/game/vfx/`)

All files were verified together under three r170: shader compile, render and the measurements above. They import only `three` and `three/addons/utils/BufferGeometryUtils.js`.

### A.1 `src/game/vfx/index.js`

```js
import * as THREE from 'three';
import { buildSpriteAtlas, buildNoiseTexture, RampAtlas, CELL, tintCurve } from './textures.js';
import { ParticleLayer, ORIENT } from './particles.js';
import { DebrisSystem } from './debris.js';
import { ShellSystem } from './shells.js';
import { DecalSystem } from './decals.js';
import { RibbonSystem } from './ribbons.js';
import { CloudSystem } from './clouds.js';
import { PARTICLES, SHELLS } from './presets.js';
import { RECIPES } from './recipes.js';
import { StatusVFX } from './status.js';

// =====================================================================================
//  game.vfx: world-grounded spell VFX. Lives NEXT TO game.fx (which keeps its API).
//
//    vfx.emit(preset, pos, { count, scale, speed, dir, cone, vel, radius })      one-shot burst
//    vfx.emitter(preset, { pos, rate, radius, area, y, vel, land, life, follow }) -> { pos, rate, stop() }
//    vfx.debris(kind, pos, n, { scale, speed, dir, cone, color })               physical chunks
//    vfx.sprout(kind, pos, { scale, life, tilt })                               crystal growing from the ground
//    vfx.shell(style, pos, { radius, height, y, life, follow })                 -> { end(), touch() }
//    vfx.decal(kind, pos, radius, life, { grow, fade, color, alpha, accent, hdr, intensity, extra }) -> { end() }
//    vfx.trail(target, { color, width, hdr, segLen })                          -> { stop() }
//    vfx.bolt(from, to, { color, width, hdr, life, jag, branches })
//    vfx.cloud(pos, { radius, height, style, life, back })                      -> { flash(k), end() }
//    vfx.zone(recipe, pos, opts)                                                -> composite handle { end(), ... }
//    vfx.impact(recipe, pos, opts)                                              composite one-shot
//    vfx.status (StatusVFX) reads game.enemies every frame: ice shells, flame licks, shock arcs.
//  Draw calls: 2 particle layers + 2 debris + <=4 shell kinds + 1 decal + 1 ribbon + 2 cloud + 2 ice = 14 max;
//  only systems with something alive draw (measured: 12 in a 10-zone + 300-status stress scene).
//  game.js: construct after game.fx, call vfx.update(dt) next to fx.update(dt), vfx.clear() next to fx.clear().
// =====================================================================================

export const BLEND_ADD = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};

const rr = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r ?? 0);
const DEFAULT_ALPHA = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const DEFAULT_ERODE = [[0, 0], [0.7, 0], [1, 1]];
const SHADE_TINT = [0.6, 0.68, 0.86];


export class VFX {
  // game: needs scene, camera (or engine.camera); optional player (focus for cloud fading)
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.engine?.camera ?? game.camera;
    this.time = 0;
    this.uTime = { value: 0 };
    this.atlas = buildSpriteAtlas();
    this.noise = buildNoiseTexture();
    this.ramps = new RampAtlas(160);
    const shared = { uTime: this.uTime, atlas: this.atlas, noise: this.noise, ramps: this.ramps, blend: BLEND_ADD };
    this.paint = new ParticleLayer(this.scene, shared, { capacity: 8192, renderOrder: 9, name: 'vfx-paint' });
    this.glow = new ParticleLayer(this.scene, shared, { capacity: 8192, renderOrder: 13, name: 'vfx-glow' });
    this.debrisSys = new DebrisSystem(this.scene);
    this.shells = new ShellSystem(this.scene, shared);
    this.decals = new DecalSystem(this.scene, shared);
    this.ribbons = new RibbonSystem(this.scene, shared, this.camera);
    this.clouds = new CloudSystem(this.scene, shared);
    this.blend = BLEND_ADD;
    this.status = new StatusVFX(this);
    this._pp = {};                 // compiled particle presets
    this._sp = {};                 // compiled shell styles
    this.emitters = [];
    this.zones = [];
    this.heat = 0;                 // spawn pressure -> budget()
  }

  // 1 when calm, ~0.35 under extreme spawn pressure (mirrors fx.budget()).
  budget() { return 1 / (1 + this.heat / 2500); }

  // ---------------------------------------------------------------- presets
  preset(name) {
    let p = this._pp[name];
    if (p) return p;
    const d = PARTICLES[name];
    if (!d) throw new Error(`vfx: unknown particle preset '${name}'`);
    const row = this.ramps.addRow({ color: d.color ?? 0xffffff, alpha: d.alpha ?? DEFAULT_ALPHA });
    this.ramps.addRow({ x: d.sizeCurve ?? 1, y: d.erode ?? DEFAULT_ERODE, z: d.fill ?? 0.4, w: d.ink ?? 0.6 });
    // paint shadow colour (default: the lit colour pushed toward the cool sky fill)
    this.ramps.addRow({ color: d.shade ?? tintCurve(d.color ?? 0xffffff, SHADE_TINT), alpha: 1 });
    const orient = ORIENT[d.orient ?? 'camera'];
    const mode = d.layer === 'paint' ? 1 : 0;
    p = this._pp[name] = {
      d, row, orient, layer: mode ? this.paint : this.glow,
      packed: CELL[d.cell ?? 'dot'] + 16 * orient + 64 * mode,
    };
    return p;
  }
  // Register / derive a preset at runtime: vfx.define('fireLick_blue', { ...PARTICLES.flameLick, color: ... })
  define(name, def) { PARTICLES[name] = def; delete this._pp[name]; return name; }

  shellStyle(name) {
    let s = this._sp[name];
    if (s) return s;
    const d = SHELLS[name];
    if (!d) throw new Error(`vfx: unknown shell style '${name}'`);
    s = this._sp[name] = { ...d, row: this.ramps.addRow({ color: d.color, alpha: d.alpha ?? 1 }) };
    return s;
  }

  // ---------------------------------------------------------------- particles
  // One particle. (x,y,z) position; (vx,vy,vz) initial velocity; s = size multiplier.
  _one(p, x, y, z, vx, vy, vz, s) {
    const d = p.d;
    const life = rr(d.life ?? [0.4, 0.6]);
    const rot = d.rot === undefined || d.rot === 'random' ? Math.random() * 6.283 : d.rot;
    if (p.orient === 2) {
      // orbit: x,z = centre, (vx = r0, vz = start angle)
      p.layer.spawn(x, y, z, vx, vz, rr(d.swirl ?? [3, 3]), this.time, life,
        rr(d.rise ?? 0), rr(d.pull ?? 1), rr(d.size ?? 0.3) * s, p.row, rot, rr(d.spin ?? 0), d.stretch ?? 0, p.packed);
    } else {
      p.layer.spawn(x, y, z, vx, vy, vz, this.time, life,
        d.gravity ?? 0, d.drag ?? 0, rr(d.size ?? 0.3) * s, p.row, rot, rr(d.spin ?? 0), d.stretch ?? 0, p.packed);
    }
    this.heat += 1;
  }

  // opts: { count, scale, speed (mult), dir {x,y,z}, cone 0..1, vel {x,y,z} (added), radius (orbit) }
  emit(name, pos, opts = {}) {
    const p = this.preset(name), d = p.d;
    const n = Math.max(1, Math.round((opts.count ?? d.count ?? 8) * this.budget()));
    const s = opts.scale ?? 1, sm = opts.speed ?? 1;
    const spread = d.spread ?? 0.1;
    const y0 = pos.y ?? 0.5;
    for (let i = 0; i < n; i++) {
      if (p.orient === 2) {
        const r0 = (opts.radius ?? 2) * (0.6 + Math.random() * 0.4);
        this._one(p, pos.x, y0, pos.z, r0, 0, Math.random() * 6.283, s);
        continue;
      }
      // random direction with vertical bias `up`, optionally pulled into `dir` by `cone`
      const a = Math.random() * 6.283;
      const sp = rr(d.speed ?? [0, 0]) * sm;
      let dx = Math.cos(a), dy = Math.random() * 2 - 1 + (d.up ?? 0.3), dz = Math.sin(a);
      const dir = opts.dir ?? d.dir;
      if (dir) { const c = opts.cone ?? d.cone ?? 0.7; dx = dx * (1 - c) + dir.x * c; dy = dy * (1 - c) + (dir.y ?? 0) * c; dz = dz * (1 - c) + dir.z * c; }
      const l = Math.hypot(dx, dy, dz) || 1;
      const v = opts.vel;
      this._one(p,
        pos.x + (Math.random() * 2 - 1) * spread, y0 + (Math.random() * 2 - 1) * spread * 0.5, pos.z + (Math.random() * 2 - 1) * spread,
        dx / l * sp + (v?.x ?? 0), dy / l * sp + (v?.y ?? 0), dz / l * sp + (v?.z ?? 0), s);
    }
  }

  // Continuous emitter. opts: { pos (kept by reference if follow), rate (/s), radius, area 'disc'|'ring'|'point',
  //   y [min,max], vel {x,y,z} (fixed velocity + preset speed jitter), land (true: spawn upwind so the
  //   particle LANDS inside the area: for falling snow / rain), life (s), scale }
  emitter(name, opts = {}) {
    const p = this.preset(name);
    const e = {
      p, pos: opts.follow ? opts.pos : { x: opts.pos.x, y: opts.pos.y ?? 0, z: opts.pos.z },
      rate: opts.rate ?? 20, radius: opts.radius ?? 1, area: opts.area ?? 'disc', y: opts.y ?? [0.3, 0.6],
      vel: opts.vel ?? null, land: !!opts.land, life: opts.life ?? Infinity, scale: opts.scale ?? 1,
      age: 0, acc: 0, stopped: false,
      stop() { this.stopped = true; },
    };
    this.emitters.push(e);
    return e;
  }

  _tickEmitter(e, dt) {
    const p = e.p, d = p.d;
    e.acc += e.rate * dt * this.budget();
    while (e.acc >= 1) {
      e.acc -= 1;
      let x = e.pos.x, z = e.pos.z;
      const a = Math.random() * 6.283;
      const rad = e.area === 'point' ? 0 : e.area === 'ring' ? e.radius * (0.85 + Math.random() * 0.15) : e.radius * Math.sqrt(Math.random());
      if (p.orient === 2) { this._one(p, x, (e.pos.y ?? 0) + rr(e.y), z, Math.max(0.3, rad), 0, a, e.scale); continue; }
      x += Math.cos(a) * rad; z += Math.sin(a) * rad;
      let y = (e.pos.y ?? 0) + rr(e.y);
      let vx, vy, vz;
      if (e.vel) {
        const j = rr(d.speed ?? [0, 0]);
        vx = e.vel.x + (Math.random() * 2 - 1) * j; vy = e.vel.y + (Math.random() * 2 - 1) * j * 0.3; vz = e.vel.z + (Math.random() * 2 - 1) * j;
      } else {
        const b = Math.random() * 6.283, sp = rr(d.speed ?? [0, 0]);
        vx = Math.cos(b) * sp; vy = (d.up ?? 0.3) * sp; vz = Math.sin(b) * sp;
      }
      if (e.land && vy < -0.1) {
        const tf = y / -vy;                          // time to the ground: start upwind
        x -= vx * tf; z -= vz * tf;
      }
      this._one(p, x, y, z, vx, vy, vz, e.scale);
    }
  }

  // ---------------------------------------------------------------- other primitives
  debris(kind, pos, n, opts) { this.debrisSys.burst(kind, pos, Math.max(1, Math.round(n * this.budget())), opts); }
  sprout(kind, pos, opts) { this.debrisSys.sprout(kind, pos, opts); }
  shell(style, pos, opts = {}) { return this.shells.add(this.shellStyle(style), pos, opts, this.time); }
  decal(kind, pos, radius, life, opts) { return this.decals.add(kind, pos, radius, life, opts); }
  trail(target, opts) { return this.ribbons.trail(target, opts); }
  bolt(from, to, opts) { this.ribbons.bolt(from, to, opts); }
  cloud(pos, opts) { return this.clouds.add(pos, opts); }

  // Composite recipes (recipes.js). Zones update every frame until they end.
  zone(name, pos, opts = {}) {
    const z = RECIPES[name](this, pos, opts);
    this.zones.push(z);
    return z;
  }
  impact(name, pos, opts = {}) { return RECIPES[name](this, pos, opts); }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    this.uTime.value = this.time;
    this.heat *= Math.exp(-3 * dt);
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.update(dt) === false) this.zones.splice(i, 1);
    }
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.age += dt;
      if (e.stopped || e.age >= e.life) { this.emitters.splice(i, 1); continue; }
      this._tickEmitter(e, dt);
    }
    this.paint.flush(this.time);
    this.glow.flush(this.time);
    this.debrisSys.update(dt);
    this.shells.update(this.time);
    this.decals.update(this.time);
    this.ribbons.update(dt);
    this.clouds.update(dt, this.game.player?.pos ?? null);
    if (this.game.enemies) this.status.update(dt, this.game.enemies, this.camera);
  }

  clear() {
    this.emitters.length = 0;
    this.zones.length = 0;
    this.paint.clear(); this.glow.clear();
    this.debrisSys.clear(); this.shells.clear(); this.decals.clear();
    this.ribbons.clear(); this.clouds.clear(); this.status.clear();
  }
}
```

### A.2 `src/game/vfx/textures.js`

```js
import * as THREE from 'three';

// =====================================================================================
//  Procedural textures for the VFX toolkit (built once at boot, no asset files).
//
//  SPRITE ATLAS  512x512 RGBA8, 4x4 cells of 128 px. Channel packing (not colour!):
//    R = soft shape field (blurred mask; 0.5 = the drawn edge). Thresholding it at different
//        levels gives the silhouette, an ink outline band and the erosion front.
//    G = baked toon light (from the field gradient, sun from the upper left), 0.5 = terminator.
//    B = erosion noise (fbm). Shader: field - erode * (1 - B) eats the sprite from noisy holes.
//    A = hot core (field^3) for glow sprites.
//  Every stretchable sprite is drawn pointing UP (+v): the shader aligns +v with velocity.
//
//  NOISE  256x256 RGBA8, tileable: R = fbm (period 4), G = fbm (period 16),
//         B = Worley edge distance F2-F1 (period 8 cells; 0 on cell borders), A = Worley cell id.
//
//  Gotcha: never pack data through canvas alpha (putImageData premultiplies). The canvas is
//  only used to rasterise white-on-black masks; packing happens in a Uint8Array.
// =====================================================================================

export const CELL = {
  puff: 0, wisp: 1, flame: 2, streak: 3,
  star: 4, snowflake: 5, iceChip: 6, flake: 7,
  rune: 8, rune2: 9, droplet: 10, ring: 11,
  curl: 12, zigzag: 13, dot: 14, glint: 15,
};
export const ATLAS_GRID = 4;
const CS = 128;
const AS = CS * ATLAS_GRID;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Periodic value noise (period P lattice cells) and fbm on [0,1)^2.
function vnoiseP(x, y, P, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (i) => ((i % P) + P) % P;
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s);
  const c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbmP(x, y, P, oct, s) {
  let sum = 0, amp = 0.5, norm = 0, p = P;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoiseP(x * p, y * p, p, s + o * 17);
    norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

// ------------------------------------------------------------------ cell painters
// ctx: 128x128, black background, white fill/stroke. r: rng.
const C = CS / 2;
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function line(g, pts, w) {
  g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}
function blobPath(g, cx, cy, rad, wob, n, r) {
  g.beginPath();
  const ph = r() * 6.28;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (1 + wob * Math.sin(a * 3 + ph) * 0.6 + wob * Math.sin(a * 5 + ph * 2) * 0.4);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.fill();
}
function glyph(g, r, w) {
  // 3-4 strokes between points of a 3x3 grid: reads as a rune at 20 px.
  const P = (i) => [C + ((i % 3) - 1) * 30, C + (Math.floor(i / 3) - 1) * 36];
  let at = Math.floor(r() * 9);
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    let to = Math.floor(r() * 9);
    if (to === at) to = (to + 4) % 9;
    const a = P(at), b = P(to);
    line(g, [a[0], a[1], b[0], b[1]], w);
    at = to;
  }
}

const DRAW = {
  puff(g, r) {                                   // cumulus puff: overlapping circles, flat-ish base
    circle(g, C, C + 8, 34);
    circle(g, C - 26, C + 14, 24);
    circle(g, C + 27, C + 12, 26);
    circle(g, C - 8, C - 16, 28);
    circle(g, C + 16, C - 8, 22);
  },
  wisp(g, r) { blobPath(g, C, C, 40, 0.35, 48, r); },
  flame(g) {                                     // tongue: round base, S-curved point (points up)
    g.beginPath();
    g.moveTo(C, 10);
    g.bezierCurveTo(C + 18, 40, C + 44, 70, C + 34, 96);
    g.bezierCurveTo(C + 26, 118, C - 26, 118, C - 34, 96);
    g.bezierCurveTo(C - 42, 74, C - 6, 54, C, 10);
    g.fill();
  },
  streak(g) {                                    // fat tapered capsule pointing up (stretch makes it thin)
    g.beginPath();
    g.moveTo(C, 6);
    g.quadraticCurveTo(C + 40, 18, C + 30, 60);
    g.lineTo(C + 10, 122); g.lineTo(C - 10, 122); g.lineTo(C - 30, 60);
    g.quadraticCurveTo(C - 40, 18, C, 6);
    g.fill();
  },
  star(g) {                                      // 4-point spark star with thin rays
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? 56 : 12;
      const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  },
  snowflake(g) {                                 // 6-arm dendrite
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      line(g, [C, C, C + ca * 50, C + sa * 50], 9);
      for (const d of [22, 36]) {
        const bx = C + ca * d, by = C + sa * d, L = 16 - d * 0.15;
        for (const s of [-1, 1]) {
          const b = a + s * 0.9;
          line(g, [bx, by, bx + Math.cos(b) * L, by + Math.sin(b) * L], 7);
        }
      }
    }
    circle(g, C, C, 10);
  },
  iceChip(g, r) {                                // faceted shard, long axis up
    g.beginPath();
    g.moveTo(C + 4, 8); g.lineTo(C + 30, 70); g.lineTo(C + 10, 118);
    g.lineTo(C - 22, 104); g.lineTo(C - 28, 46);
    g.closePath(); g.fill();
  },
  flake(g) {                                     // leaf / ash flake
    g.beginPath();
    g.moveTo(C, 12);
    g.quadraticCurveTo(C + 46, 60, C, 116);
    g.quadraticCurveTo(C - 46, 60, C, 12);
    g.fill();
  },
  rune(g, r) { glyph(g, r, 11); },
  rune2(g, r) { glyph(g, r, 11); circle(g, C, C + 46, 6); },
  droplet(g) {                                   // teardrop, point up
    g.beginPath();
    g.moveTo(C, 10);
    g.bezierCurveTo(C + 10, 40, C + 34, 64, C + 34, 84);
    g.arc(C, 84, 34, 0, Math.PI);
    g.bezierCurveTo(C - 34, 64, C - 10, 40, C, 10);
    g.fill();
  },
  ring(g) { g.lineWidth = 12; g.beginPath(); g.arc(C, C, 46, 0, Math.PI * 2); g.stroke(); },
  curl(g) {                                      // wind gust: a tapered comma swirl
    g.lineCap = 'round';
    let px = C - 44, py = C + 30;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, a = Math.PI * (1.2 + 1.5 * t), rr = 44 * (1 - 0.6 * t);
      const x = C + Math.cos(a) * rr, y = C + 6 + Math.sin(a) * rr;
      line(g, [px, py, x, y], 14 * (1 - t) + 3);
      px = x; py = y;
    }
  },
  zigzag(g) { g.lineCap = 'round'; line(g, [C - 6, 8, C + 14, 44, C - 12, 74, C + 8, 120], 10); },
  dot(g) { circle(g, C, C, 40); },
  glint(g) {                                     // plus-shaped sparkle with soft centre
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? 58 : 7;
      const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    circle(g, C, C, 14);
  },
};

// Separable box blur, `iters` passes (3 passes ~ gaussian). a: in/out, tmp: scratch.
function blur(a, tmp, n, rad, iters) {
  const w = 1 / (2 * rad + 1);
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += a[y * n + Math.min(n - 1, Math.max(0, x + k))];
        tmp[y * n + x] = s * w;
      }
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += tmp[Math.min(n - 1, Math.max(0, y + k)) * n + x];
        a[y * n + x] = s * w;
      }
    }
  }
}

export function buildSpriteAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CS;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(AS * AS * 4);
  const f = new Float32Array(CS * CS), tmp = new Float32Array(CS * CS);
  const rng = mulberry32(1337);
  const L = [-0.55, 0.62, 0.56];                 // light in cell space (x right, y UP, z out)
  const ll = Math.hypot(L[0], L[1], L[2]);
  for (const [name, idx] of Object.entries(CELL)) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    DRAW[name](g, rng);
    const px = g.getImageData(0, 0, CS, CS).data;
    for (let i = 0; i < CS * CS; i++) f[i] = px[i * 4] / 255;
    blur(f, tmp, CS, 3, 3);                      // ~5 px soft field: 0.5 = original edge
    const cx = (idx % ATLAS_GRID) * CS, cy = Math.floor(idx / ATLAS_GRID) * CS;
    for (let y = 0; y < CS; y++) {
      for (let x = 0; x < CS; x++) {
        const i = y * CS + x;
        const v = f[i];
        // gradient of the field -> fake normal (canvas y is down; flip to cell-up)
        const gx = f[y * CS + Math.min(CS - 1, x + 1)] - f[y * CS + Math.max(0, x - 1)];
        const gy = f[Math.max(0, y - 1) * CS + x] - f[Math.min(CS - 1, y + 1) * CS + x];
        let nx = -gx * 6, ny = -gy * 6, nz = 0.35 + v;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const lit = Math.max(0, Math.min(1, 0.5 + 0.6 * (nx * L[0] + ny * L[1] + nz * L[2]) / ll - 0.12));
        const n = fbmP(x / CS, y / CS, 4, 3, idx * 31 + 7);
        // texture rows are bottom-up (flipY false): flip the cell vertically
        const o = ((cy + (CS - 1 - y)) * AS + cx + x) * 4;
        data[o] = Math.round(v * 255);
        data[o + 1] = Math.round(lit * 255);
        data[o + 2] = Math.round(n * 255);
        data[o + 3] = Math.round(Math.pow(v, 3) * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, AS, AS, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function buildNoiseTexture(N = 256) {
  const data = new Uint8Array(N * N * 4);
  const G = 8;                                   // Worley cells per side
  const fx = new Float32Array(G * G), fz = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    fx[j * G + i] = 0.15 + 0.7 * hash2(i, j, 91);
    fz[j * G + i] = 0.15 + 0.7 * hash2(i, j, 92);
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const r = fbmP(u, v, 4, 4, 11);
      const g = fbmP(u, v, 16, 3, 23);
      const px = u * G, py = v * G;
      const ix = Math.floor(px), iy = Math.floor(py);
      let f1 = 9, f2 = 9, id = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx, cy = iy + dy;
          const wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G;
          const qx = cx + fx[wy * G + wx], qy = cy + fz[wy * G + wx];
          const d = Math.hypot(qx - px, qy - py);
          if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, 93); } else if (d < f2) f2 = d;
        }
      }
      const o = (y * N + x) * 4;
      data[o] = Math.round(r * 255);
      data[o + 1] = Math.round(g * 255);
      data[o + 2] = Math.round(Math.min(1, (f2 - f1) * 1.6) * 255);
      data[o + 3] = Math.round(id * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ ramp atlas
// One row = 64 samples of a curve over t in [0,1]. HalfFloat RGBA so colours can be HDR and the
// GPU filters between samples. Rows are allocated on demand (presets are compiled lazily).
const RW = 64;
const _c = new THREE.Color();

// Mark a key list as stepped (hold each key until the next): toon bands instead of gradients.
export const step = (keys) => Object.assign(keys, { step: true });

// curve forms: number | [[t, v], ...]   (linear between keys; step([...]) = hold)
function evalCurve(curve, t) {
  if (typeof curve === 'number') return curve;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i][0]) {
      const [t0, v0] = curve[i - 1], [t1, v1] = curve[i];
      if (curve.step) return v0;
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * k;
    }
  }
  return curve[curve.length - 1][1];
}
// colour curve: hex | [[t, hex, hdr?], ...]  -> linear rgb * hdr
function evalColor(curve, t, out) {
  if (typeof curve === 'number') { _c.set(curve); out[0] = _c.r; out[1] = _c.g; out[2] = _c.b; return; }
  let i = 1;
  while (i < curve.length && t > curve[i][0]) i++;
  const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i)];
  const k = curve.step || b === a ? 0 : Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
  _c.set(a[1]).multiplyScalar(a[2] ?? 1);
  const r0 = _c.r, g0 = _c.g, b0 = _c.b;
  _c.set(b[1]).multiplyScalar(b[2] ?? 1);
  out[0] = r0 + (_c.r - r0) * k; out[1] = g0 + (_c.g - g0) * k; out[2] = b0 + (_c.b - b0) * k;
}

export class RampAtlas {
  constructor(rows = 128) {
    this.rows = rows;
    this.next = 0;
    this.data = new Uint16Array(RW * rows * 4);
    this.tex = new THREE.DataTexture(this.data, RW, rows, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this._rgb = [0, 0, 0];
  }
  // channels: { color: colourCurve, x?, y?, z?, w? } where x..w are scalar curves.
  // If color is given it fills rgb and `w` (or alpha) fills a. Returns the row index.
  addRow(ch) {
    if (this.next >= this.rows) { console.warn('RampAtlas full'); return this.rows - 1; }
    const row = this.next++;
    const H = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < RW; i++) {
      const t = i / (RW - 1);
      let r, g, b, a;
      if (ch.color !== undefined) {
        evalColor(ch.color, t, this._rgb);
        [r, g, b] = this._rgb;
        a = evalCurve(ch.alpha ?? 1, t);
      } else {
        r = evalCurve(ch.x ?? 0, t); g = evalCurve(ch.y ?? 0, t);
        b = evalCurve(ch.z ?? 0, t); a = evalCurve(ch.w ?? 0, t);
      }
      const o = (row * RW + i) * 4;
      this.data[o] = H(r); this.data[o + 1] = H(g); this.data[o + 2] = H(b); this.data[o + 3] = H(a);
    }
    this.tex.needsUpdate = true;
    return row;
  }
}
// GLSL: sample row `row` at t (call with the ramp's row count as uRampRows)
export const RAMP_GLSL = /* glsl */`
  uniform sampler2D uRamp; uniform float uRampRows;
  vec4 ramp(float row, float t) {
    return texture(uRamp, vec2(clamp(t, 0.0, 1.0) * (63.0 / 64.0) + 0.5 / 64.0, (row + 0.5) / uRampRows));
  }`;

// Multiply every key of a colour curve by an rgb tint (keeps step()). Used for default paint shadows.
export function tintCurve(curve, tint) {
  const c = new THREE.Color();
  const mul = (hex) => c.set(hex).multiply(new THREE.Color(tint[0], tint[1], tint[2])).getHex();
  if (typeof curve === 'number') return mul(curve);
  const out = curve.map(([t, hex, hdr]) => [t, mul(hex), hdr ?? 1]);
  if (curve.step) out.step = true;
  return out;
}
```

### A.3 `src/game/vfx/particles.js`

```js
import * as THREE from 'three';
import { RAMP_GLSL } from './textures.js';

// =====================================================================================
//  ParticleLayer: stateless GPU particles drawn as ONE instanced quad mesh.
//
//  The CPU only writes a particle once, at spawn (ring-buffer slot, partial upload via
//  addUpdateRange). Everything else is evaluated in the vertex shader from uTime:
//    motion   analytic gravity + linear drag (exact integral), or an inward-spiralling orbit
//    looks    colour/alpha and size/erosion/fill/ink over life from two RampAtlas rows
//    shape    sprite-atlas cell, rotation + spin, velocity-aligned stretch, ground-flat quads
//  Dead / not-yet-born slots collapse to a clipped point. No per-frame CPU loop, no sorting.
//
//  Per-instance attributes (vec4 each):
//    iA = p0.xyz, birth            (orbit: centre.x, y0, centre.z, birth)
//    iB = v0.xyz, life             (orbit: r0, angle0, angular speed, life)
//    iC = gravity, drag, size, row (orbit: rise speed, pull rate, size, row)
//    iD = rot0, spin, stretch, packed (cell + 16 * orient + 64 * mode)
//  orient: 0 camera billboard, 1 ground-flat, 2 orbit (camera billboard)
//  mode:   0 glow (blend-add: rgb emits, alpha occludes) | 1 paint (premultiplied, toon-lit)
// =====================================================================================

export const ORIENT = { camera: 0, ground: 1, orbit: 2 };

const VS = /* glsl */`
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
  uniform float uTime;
  ${RAMP_GLSL}
  varying vec2 vUv; varying vec4 vColor; varying vec4 vShape; varying vec3 vShade; varying float vMode;
  vec2 rot2(vec2 q, float a) { float c = cos(a), s = sin(a); return vec2(q.x * c - q.y * s, q.x * s + q.y * c); }
  void main() {
    float age = uTime - iA.w;
    float life = iB.w;
    vUv = vec2(0.0); vColor = vec4(0.0); vShape = vec4(0.0); vShade = vec3(0.0); vMode = 0.0;
    if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float t = age / life;
    float packed = iD.w + 0.5;
    float cell = mod(floor(packed), 16.0);
    float orient = mod(floor(packed / 16.0), 4.0);
    float mode = floor(packed / 64.0);
    vec3 pos; vec3 vel;
    if (orient > 1.5) {
      // inward spiral: r = r0 e^(-k t); angular speed grows as the radius shrinks (w = w0 e^(k t))
      float k = iC.y;
      float ek = exp(k * age);
      float r = iB.x / ek;
      float a = iB.y + iB.z * (k > 1e-3 ? (ek - 1.0) / k : age);
      float w = iB.z * ek;
      vec2 d = vec2(cos(a), sin(a));
      pos = vec3(iA.x + d.x * r, iA.y + iC.x * age, iA.z + d.y * r);
      vel = vec3(-d.y * r * w - d.x * k * r, iC.x, d.x * r * w - d.y * k * r);
    } else {
      // exact integral of dv/dt = g - k v
      vec3 g = vec3(0.0, -iC.x, 0.0);
      float k = iC.y;
      if (k < 1e-3) {
        pos = iA.xyz + iB.xyz * age + 0.5 * g * age * age;
        vel = iB.xyz + g * age;
      } else {
        vec3 vt = g / k;
        float e = exp(-k * age);
        pos = iA.xyz + vt * age + (iB.xyz - vt) * (1.0 - e) / k;
        vel = vt + (iB.xyz - vt) * e;
      }
      pos.y = max(pos.y, 0.04);
    }
    vec4 col = ramp(iC.w, t);           // rgb (linear, HDR ok), alpha
    vec4 shp = ramp(iC.w + 1.0, t);     // x size mult, y erosion, z fill alpha / occlusion, w ink
    float size = iC.z * shp.x;
    float ang = iD.x + iD.y * age;
    vec2 q = position.xy;               // quad corner, -0.5..0.5 (+y = sprite up)
    vec4 mv;
    if (orient > 0.5 && orient < 1.5) {
      // flat on the ground (ripples, gusts, scorch flecks); stretch aligns +y with XZ velocity
      vec2 o;
      if (iD.z > 0.0 && dot(vel.xz, vel.xz) > 1e-6) {
        float sp = length(vel.xz);
        vec2 ay = vel.xz / sp, ax = vec2(ay.y, -ay.x);
        o = ax * q.x * size + ay * q.y * size * (1.0 + iD.z * sp);
      } else {
        o = rot2(q, ang) * size;
      }
      mv = modelViewMatrix * vec4(pos.x + o.x, pos.y + 0.03, pos.z + o.y, 1.0);
    } else {
      mv = modelViewMatrix * vec4(pos, 1.0);
      vec2 o;
      if (iD.z > 0.0) {
        // velocity-aligned streak: +y follows the screen-space velocity, length grows with speed
        vec2 vv = (modelViewMatrix * vec4(vel, 0.0)).xy;
        float sp = length(vv);
        vec2 ay = sp > 1e-4 ? vv / sp : vec2(0.0, 1.0);
        vec2 ax = vec2(ay.y, -ay.x);
        o = ax * q.x * size + ay * q.y * size * (1.0 + iD.z * sp);
      } else {
        o = rot2(q, ang) * size;
      }
      mv.xy += o;
    }
    gl_Position = projectionMatrix * mv;
    vUv = (vec2(mod(cell, 4.0), floor(cell / 4.0)) + q + 0.5) * 0.25;
    vColor = col; vShape = shp; vMode = mode;
    vShade = mode > 0.5 ? ramp(iC.w + 2.0, t).rgb : vec3(0.0);   // paint: shadow colour over life
  }`;

const FS = /* glsl */`
  uniform sampler2D uAtlas;
  varying vec2 vUv; varying vec4 vColor; varying vec4 vShape; varying vec3 vShade; varying float vMode;
  void main() {
    vec4 tx = texture(uAtlas, vUv);
    // erosion eats the shape from the noisy, thin parts first (stylised dissolve, not a fade)
    float v = tx.r - vShape.y * (1.25 * (1.0 - tx.b) + 0.2);
    float aa = max(fwidth(tx.r) * 0.8, 1e-3);
    float sil = smoothstep(0.30 - aa, 0.30 + aa, v);          // silhouette incl. ink band
    if (sil < 0.003) discard;
    float fill = smoothstep(0.47 - aa, 0.47 + aa, v);         // body
    vec3 base = vColor.rgb;
    float emitK = 1.0;
    if (vMode > 0.5) {
      base = mix(vShade, base, smoothstep(0.44, 0.56, tx.g));   // 2-tone toon light: shadow colour | lit colour
      emitK = vShape.z;                                        // premultiplied paint
    } else {
      base *= 1.0 + 0.4 * smoothstep(0.7 - aa, 0.7 + aa, v);    // hard-edged hot core band (toon), blooms first
    }
    vec3 ink = min(vColor.rgb, vec3(1.0)) * 0.18;              // darker value of the same hue
    float inkA = (sil - fill) * vShape.w;
    float a = vColor.a;
    gl_FragColor = vec4((base * fill * emitK + ink * inkA) * a, (fill * vShape.z + inkA) * a);
  }`;

export class ParticleLayer {
  // shared: { uTime, atlas, ramps, blend }
  constructor(scene, shared, { capacity = 8192, renderOrder = 10, name = 'vfx-particles' } = {}) {
    this.cap = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aA = mk(); this.aB = mk(); this.aC = mk(); this.aD = mk();
    this.A = this.aA.array; this.B = this.aB.array; this.C = this.aC.array; this.D = this.aD.array;
    // never-born slots: life 0 -> clipped
    geo.setAttribute('iA', this.aA); geo.setAttribute('iB', this.aB);
    geo.setAttribute('iC', this.aC); geo.setAttribute('iD', this.aD);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uAtlas: { value: shared.atlas },
        uRamp: { value: shared.ramps.tex },
        uRampRows: { value: shared.ramps.rows },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: true,
      ...shared.blend,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = name;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.head = 0;
    this.spawned = 0;
    this.dirtyStart = 0;
    this.dirtyCount = 0;
    this.lastDeath = -1;
  }

  // Write one particle. Returns the slot. The oldest slot is recycled when the ring is full.
  spawn(px, py, pz, vx, vy, vz, birth, life, grav, drag, size, row, rot, spin, stretch, packed) {
    const i = this.head;
    this.head = (i + 1) % this.cap;
    if (this.dirtyCount === 0) this.dirtyStart = i;
    this.dirtyCount++;
    this.spawned++;
    const o = i * 4;
    const A = this.A, B = this.B, C = this.C, D = this.D;
    A[o] = px; A[o + 1] = py; A[o + 2] = pz; A[o + 3] = birth;
    B[o] = vx; B[o + 1] = vy; B[o + 2] = vz; B[o + 3] = life;
    C[o] = grav; C[o + 1] = drag; C[o + 2] = size; C[o + 3] = row;
    D[o] = rot; D[o + 1] = spin; D[o + 2] = stretch; D[o + 3] = packed;
    if (birth + life > this.lastDeath) this.lastDeath = birth + life;
    return i;
  }

  // Once per frame: upload only the slots written this frame (1-2 contiguous ranges).
  flush(time) {
    if (this.dirtyCount > 0) {
      const n = Math.min(this.dirtyCount, this.cap);
      for (const at of [this.aA, this.aB, this.aC, this.aD]) {
        if (n < this.cap) {
          const s = this.dirtyStart, e = s + n;
          if (e <= this.cap) at.addUpdateRange(s * 4, n * 4);
          else { at.addUpdateRange(s * 4, (this.cap - s) * 4); at.addUpdateRange(0, (e - this.cap) * 4); }
        }
        at.needsUpdate = true;
      }
      this.dirtyCount = 0;
    }
    this.geo.instanceCount = Math.min(this.cap, this.spawned);
    this.mesh.visible = time < this.lastDeath;
  }

  clear() {
    this.D.fill(0); this.B.fill(0);
    for (const at of [this.aB, this.aD]) { at.clearUpdateRanges(); at.needsUpdate = true; }
    this.head = 0; this.spawned = 0; this.dirtyCount = 0; this.lastDeath = -1;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}
```

### A.4 `src/game/vfx/presets.js`

```js
import { step } from './textures.js';

// =====================================================================================
//  Preset data. Skill authors add entries here; no shader knowledge needed.
//
//  PARTICLE preset (world metres, seconds; [a, b] = random range; curves = number | [[t, v], ...]
//  over normalised life, step([...]) = hard toon steps):
//    layer    'glow' (blend-add: rgb emits, alpha darkens ground) | 'paint' (opaque-ish painted,
//             2-tone sun-lit, reads WHITE on sand because of its ink edge)
//    cell     sprite: puff wisp flame streak star snowflake iceChip flake rune rune2 droplet ring
//             curl zigzag dot glint (streak/flame/droplet/iceChip/zigzag point UP = along velocity)
//    orient   'camera' (default) | 'ground' (flat decal-like) | 'orbit' (spirals into the emitter)
//    count, life, size, speed, up (vertical bias -1..1+), dir {x,y,z} + cone (0..1), spread (spawn
//    jitter radius), gravity (m/s^2, negative = rises), drag (1/s), stretch (velocity streak
//    factor, 0 = off), rot ('random' | number), spin (rad/s range)
//    orbit only: swirl (rad/s), pull (1/s radial decay), rise (m/s)
//    color    hex | [[t, hex, hdr]]  (glow wants hdr 1.4-2.4 for the bloom threshold of 1.1)
//    alpha    curve (default fade in 6% / out last 15%)
//    sizeCurve curve multiplier (default 1)
//    erode    curve 0..1 (stylised dissolve; default: none until the last 30%, then eats it)
//    fill     curve: glow = occlusion of the ground under the body (0.3-0.6), paint = opacity
//    ink      curve 0..1: dark outline band in a darker value of the same hue (the toon outline)
// =====================================================================================

const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];
const ERODE_END = [[0, 0], [0.7, 0], [1, 1]];

export const PARTICLES = {
  // ---------------------------------------------------------------- frost
  snowStreak: { layer: 'paint', cell: 'streak', life: [0.5, 0.75], size: [0.13, 0.17], stretch: 0.8,
    color: 0xffffff, alpha: FADE, fill: 0.95, ink: 0.9, erode: [[0, 0], [0.85, 0], [1, 0.8]] },
  snowflake: { layer: 'paint', cell: 'snowflake', life: [0.9, 1.4], size: [0.2, 0.32], spin: [-3, 3],
    color: 0xffffff, alpha: FADE, fill: 1, ink: 0.9, erode: ERODE_END },
  snowDrift: { layer: 'paint', cell: 'curl', orient: 'ground', life: [0.6, 0.9], size: [0.45, 0.8], stretch: 0.2,
    color: 0xf2f8ff, alpha: FADE, fill: 0.85, ink: 0.7, erode: [[0, 0.6], [0.2, 0], [0.7, 0.1], [1, 1]] },
  coldFog: { layer: 'paint', cell: 'puff', life: [1.6, 2.4], size: [1.5, 2.3], spin: [-0.2, 0.2], drag: 1,
    color: 0xeef6ff, alpha: [[0, 0], [0.25, 0.32], [0.75, 0.32], [1, 0]], fill: 0.6, ink: 0,
    erode: [[0, 0.5], [0.3, 0.1], [0.7, 0.15], [1, 0.9]] },
  iceChip: { layer: 'glow', cell: 'iceChip', count: 8, life: [0.4, 0.7], size: [0.14, 0.24], spin: [-8, 8],
    speed: [3, 6], up: 0.8, gravity: 14, drag: 1, color: [[0, 0xd8f6ff, 1.5], [1, 0x66d9ff, 1.25]], fill: 0.6, ink: 0.8, erode: ERODE_END },
  frostGlint: { layer: 'glow', cell: 'glint', count: 6, life: [0.3, 0.5], size: [0.3, 0.45], spin: [-1, 1], spread: 0.6,
    color: [[0, 0xe8fbff, 1.8], [1, 0x9fe9ff, 1.4]], fill: 0.3, ink: 0.5, sizeCurve: [[0, 0.3], [0.3, 1], [1, 0]] },
  // ---------------------------------------------------------------- fire
  // opaque toon flame: lit yellow / shadow orange / dark-red ink, HDR just over the bloom threshold
  flameLick: { layer: 'paint', cell: 'flame', life: [0.35, 0.55], size: [0.35, 0.55], gravity: -6, drag: 2, speed: [0.2, 0.8], up: 2,
    color: [[0, 0xffe070, 1.25], [0.35, 0xffb030, 1.15], [0.7, 0xff6a1a, 1.05], [1, 0x8a2a10, 0.9]],
    shade: [[0, 0xff7a1a, 1.05], [0.35, 0xe8501a, 1], [0.7, 0xb8300c, 1], [1, 0x4a1a10, 1]],
    fill: 1, ink: [[0, 0.5], [1, 0.9]], sizeCurve: [[0, 0.6], [0.3, 1], [1, 0.45]],
    erode: [[0, 0], [0.5, 0.15], [1, 1]] },
  ember: { layer: 'glow', cell: 'streak', count: 12, life: [0.5, 0.9], size: [0.06, 0.1], stretch: 0.12, speed: [3, 8], up: 1.2,
    gravity: 6, drag: 1.2, color: [[0, 0xffe08a, 2.4], [1, 0xff5a1a, 1.4]], fill: 0.3, ink: 0.4, erode: ERODE_END },
  smoke: { layer: 'paint', cell: 'puff', count: 6, life: [0.8, 1.3], size: [0.6, 1.0], spin: [-0.6, 0.6], gravity: -1.8, drag: 1.5,
    speed: [0.5, 1.5], up: 1, color: [[0, 0x4a3c37], [1, 0x8a807c]], alpha: [[0, 0], [0.1, 0.85], [1, 0.7]], fill: 0.85, ink: 0.35,
    sizeCurve: [[0, 0.5], [1, 1.4]], erode: [[0, 0], [0.4, 0.1], [1, 1]] },
  // opaque toon explosion puff that turns into smoke (stylised: no additive white-out when stacked)
  fireball: { layer: 'paint', cell: 'puff', count: 5, life: [0.3, 0.45], size: [1.1, 1.7], spin: [-1, 1], spread: 0.5, speed: [0.5, 2], up: 0.6,
    color: [[0, 0xffe070, 1.2], [0.35, 0xffa030, 1.1], [0.75, 0xb8481a, 1], [1, 0x4a3a36, 1]],
    shade: [[0, 0xf06a1a, 1], [0.35, 0xc8380c, 1], [0.75, 0x5a2410, 1], [1, 0x2a2220, 1]], fill: 1, ink: 0.7,
    sizeCurve: [[0, 0.4], [0.3, 1], [1, 1.1]], erode: [[0, 0], [0.3, 0], [1, 1]] },
  dustRing: { layer: 'paint', cell: 'puff', count: 12, life: [0.5, 0.8], size: [0.7, 1.1], speed: [6, 10], up: 0.05, drag: 4,
    spin: [-1, 1], color: 0xb59a72, alpha: [[0, 0.9], [1, 0.7]], fill: 0.85, ink: 0.5,
    sizeCurve: [[0, 0.4], [1, 1.3]], erode: [[0, 0], [0.5, 0.1], [1, 1]] },
  // ---------------------------------------------------------------- arcane
  arcaneMote: { layer: 'glow', cell: 'glint', orient: 'orbit', life: [0.9, 1.3], size: [0.18, 0.3], swirl: [2.5, 3.5], pull: [0.9, 1.3],
    rise: [0.3, 0.9], spin: [-2, 2], color: [[0, 0xd9b8ff, 1.8], [1, 0x8a4dff, 1.4]], fill: 0.4, ink: 0.7, erode: ERODE_END },
  vortexDebris: { layer: 'paint', cell: 'flake', orient: 'orbit', life: [1.0, 1.4], size: [0.16, 0.26], swirl: [3, 4], pull: [1, 1.4],
    rise: [0.4, 1.2], spin: [-6, 6], color: 0x6a5a4a, fill: 1, ink: 0.8, erode: ERODE_END },
  runeGlyph: { layer: 'glow', cell: 'rune', life: [0.7, 1.0], size: [0.35, 0.5], gravity: -1.5, drag: 2, speed: [0.2, 0.6], up: 2,
    color: [[0, 0xe8d8ff, 1.7], [0.3, 0xb67cff, 1.5], [1, 0x6a2adf, 1.1]], fill: 0.5, ink: 0.8, erode: [[0, 0], [0.6, 0], [1, 1]] },
  // ---------------------------------------------------------------- storm
  spark: { layer: 'glow', cell: 'streak', count: 10, life: [0.2, 0.35], size: [0.06, 0.1], stretch: 0.15, speed: [6, 12], up: 0.6,
    gravity: 10, drag: 2, color: [[0, 0xffffff, 2.4], [1, 0xffe14a, 1.6]], fill: 0.3, ink: 0.6 },
  sparkStar: { layer: 'glow', cell: 'star', count: 1, life: [0.12, 0.2], size: [0.9, 1.3], spin: [-2, 2],
    color: [[0, 0xfff6c0, 2.0], [1, 0xffe14a, 1.5]], fill: 0.4, ink: 0.8, sizeCurve: [[0, 0.6], [0.3, 1], [1, 0.2]] },
  rain: { layer: 'paint', cell: 'streak', life: [0.35, 0.45], size: [0.05, 0.07], stretch: 0.7,
    color: 0xc8dcf5, alpha: FADE, fill: 0.8, ink: 0.8 },
};

// SHELL styles: geo 'cylinder' | 'funnel' | 'dome' | 'torus'. ramp = colour by depth inside the shape
// (t = 0 at the eroded edge -> 1 deep inside), stepped for toon bands; alpha = occlusion (glow) or
// opacity (paint). tile[0] MUST be an integer (wraps around the mesh). scroll in tiles/s
// (+y scroll = features move DOWN, -y = rise). twist = spiral, erode = base threshold (0.1 dense ..
// 0.45 sparse), wobble = metres of boil at the top, frontAlpha = near-wall opacity mid-silhouette.
export const SHELLS = {
  snowVeil: { geo: 'cylinder', mode: 'paint', tile: [5, 1], scroll: [-0.7, 0.45], twist: 0.6, erode: 0.36, wobble: 0.06,
    fade: [0.4, 0.5], frontAlpha: 0.45,
    color: step([[0, 0x4a6f99], [0.14, 0xcfe6ff], [0.5, 0xffffff]]), alpha: step([[0, 0.85], [0.14, 0.5], [0.5, 0.65]]) },
  firePillar: { geo: 'cylinder', mode: 'glow', tile: [3, 1], scroll: [0.1, -1.4], twist: 0.2, erode: 0.2, wobble: 0.08,
    fade: [0.15, 0.4], frontAlpha: 0.7, hdr: 1,
    color: step([[0, 0x3a0a04], [0.15, 0xff5a1a, 1.3], [0.45, 0xffa040, 1.7], [0.75, 0xfff0b0, 2.2]]),
    alpha: step([[0, 0.8], [0.15, 0.45], [0.45, 0.35], [0.75, 0.3]]) },
  vortexFunnel: { geo: 'funnel', mode: 'glow', tile: [3, 1], scroll: [0.9, 0.35], twist: 1.2, erode: 0.24, wobble: 0.1,
    fade: [0.3, 0.3], frontAlpha: 0.55, hdr: 1,
    color: step([[0, 0x12051f], [0.15, 0x5a22c0, 1.0], [0.5, 0x9a5cff, 1.25], [0.8, 0xd8c0ff, 1.5]]),
    alpha: step([[0, 0.85], [0.15, 0.5], [0.5, 0.4], [0.8, 0.35]]) },
  // opaque toon fire dome (paint): dark ink edge, red, orange, yellow core; only the core is >1.1 (blooms)
  blastDome: { geo: 'dome', mode: 'paint', tile: [3, 1], scroll: [0, -1.4], twist: 0.3, erode: 0.12, wobble: 0,
    fade: [0.04, 0.26], frontAlpha: 0.9,
    color: step([[0, 0x4a1206], [0.1, 0xe0401a], [0.3, 0xff8a2a], [0.6, 0xffd060, 1.25]]),
    alpha: step([[0, 0.95], [0.1, 0.92], [0.3, 0.9], [0.6, 0.9]]) },
  arcaneDome: { geo: 'dome', mode: 'glow', tile: [4, 2], scroll: [0.6, -1.0], twist: 0.6, erode: 0.08, wobble: 0,
    fade: [0.04, 0.3], frontAlpha: 0.8, hdr: 1,
    color: step([[0, 0x12051f], [0.12, 0x8a4dff, 1.4], [0.4, 0xb67cff, 1.9], [0.7, 0xf4e8ff, 2.4]]),
    alpha: step([[0, 0.8], [0.12, 0.5], [0.4, 0.4], [0.7, 0.35]]) },
  frostRing: { geo: 'torus', mode: 'paint', tile: [6, 1], scroll: [1.2, 0.0], twist: 0, erode: 0.3, wobble: 0,
    fade: [0.15, 0.4], frontAlpha: 1,
    color: step([[0, 0x4a6f99], [0.14, 0xcfe6ff], [0.5, 0xffffff]]), alpha: step([[0, 0.9], [0.14, 0.7], [0.5, 0.85]]) },
};
```

### A.5 `src/game/vfx/recipes.js`

```js
import * as THREE from 'three';

// =====================================================================================
//  Composite recipes: anticipation -> impact -> dissipation, built only from the primitives.
//  Zones return { update(dt) -> bool, end(), ... } and are ticked by vfx.zone(); impacts are
//  fire-and-forget. Counts are per instance (see design/research/08-spell-vfx-tech.md §4).
// =====================================================================================

const WIND = { x: 0.9, z: -0.45 };               // default: mostly screen-right (engine.right = (1,0,-1)/sqrt2) so the slant reads

// ---------------------------------------------------------------- BLIZZARD
// cloud lid + cold shadow + snow veil + slanted wind-driven streaks + tumbling flakes + ground
// gusts + low fog + creeping frost + ice spikes that sprout and shatter at the end.
function blizzard(vfx, pos, o) {
  const R = o.radius ?? 3.5;
  let L = o.life ?? 4;
  const wl = Math.hypot((o.wind ?? WIND).x, (o.wind ?? WIND).z) || 1;
  const wx = (o.wind ?? WIND).x / wl * 3.4, wz = (o.wind ?? WIND).z / wl * 3.4;
  const p = { x: pos.x, y: 0, z: pos.z };
  const parts = {
    frost: vfx.decal('frost', p, R * 1.08, L + 0.8, { grow: 0.6, fade: 0.7 }),
    shade: vfx.decal('shadow', p, R * 1.25, L + 0.4, { grow: 0.4, fade: 0.5, alpha: 0.26 }),
    // the cloud sits upwind (where the streaks start: 4 m up at 7.5 m/s fall = 0.5 s of drift)
    cloud: vfx.cloud({ x: p.x - wx * 0.5, z: p.z - wz * 0.5 }, { radius: R * 0.7, height: 4.2, style: 'snow', life: L + 0.35 }),
    veil: vfx.shell('snowVeil', p, { radius: R * 0.98, height: 1.4, life: L }),
    streaks: vfx.emitter('snowStreak', { pos: p, radius: R * 0.95, rate: 26 * R, y: [3.4, 4.0], vel: { x: wx, y: -7.5, z: wz }, land: true, life: L }),
    flakes: vfx.emitter('snowflake', { pos: p, radius: R * 0.9, rate: 5 * R, y: [2.0, 3.6], vel: { x: wx * 0.6, y: -2.6, z: wz * 0.6 }, land: true, life: L }),
    drift: vfx.emitter('snowDrift', { pos: p, radius: R * 0.85, rate: 3 * R, y: [0, 0], vel: { x: wx * 1.5, y: 0, z: wz * 1.5 }, life: L }),
    fog: vfx.emitter('coldFog', { pos: p, radius: R * 0.7, rate: 1.2 * R, y: [0.4, 0.7], vel: { x: wx * 0.3, y: 0, z: wz * 0.3 }, life: Math.max(0.5, L - 1.2) }),
  };
  vfx.emit('frostGlint', { x: p.x, y: 0.6, z: p.z }, { count: 8 });
  const spikes = [];
  const nSpikes = Math.round(4 + R);
  for (let i = 0; i < nSpikes; i++) spikes.push(0.2 + (i / nSpikes) * 0.7);
  let t = 0, ended = false;
  return {
    pos: p, parts,
    update(dt) {
      t += dt;
      while (spikes.length && t >= spikes[0]) {
        spikes.shift();
        const a = Math.random() * 6.283, r = R * (0.3 + Math.random() * 0.55);
        vfx.sprout('iceSpike', { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }, { life: Math.max(0.3, L - t), scale: 0.8 + Math.random() * 0.5 });
      }
      return t < L + 0.8;
    },
    end() {
      if (ended) return; ended = true;
      L = Math.min(L, t);
      for (const k of ['streaks', 'flakes', 'drift', 'fog']) parts[k].stop();
      parts.veil.end(); parts.cloud.end(); parts.frost.end(0.6); parts.shade.end(0.4);
      spikes.length = 0;
    },
  };
}

// ---------------------------------------------------------------- METEOR (fall + impact)
let ROCK = null;
function rockAssets() {
  if (ROCK) return ROCK;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a3a32, emissive: 0xff5a1a, emissiveIntensity: 0.35, flatShading: true });
  const hull = new THREE.MeshBasicMaterial({ color: 0x1a0c06, side: THREE.BackSide });
  ROCK = { geo, mat, hull };
  return ROCK;
}

function meteor(vfx, target, o) {
  const fall = o.fallTime ?? 0.8, H = o.height ?? 22, R = o.radius ?? 3.2;
  const A = rockAssets();
  const group = new THREE.Group();
  const rock = new THREE.Mesh(A.geo, A.mat);
  const hull = new THREE.Mesh(A.geo, A.hull);
  hull.scale.setScalar(1.12);
  group.add(rock, hull);
  group.scale.setScalar(o.size ?? 0.7);
  vfx.scene.add(group);
  const rp = new THREE.Vector3(target.x - 4, H, target.z - 4);
  const trail = vfx.trail(rp, { color: 0xff7a2a, width: 1.5, hdr: 1.6, segLen: 0.6 });
  const fire = vfx.emitter('flameLick', { pos: rp, follow: true, area: 'point', rate: 55, y: [0, 0], scale: 1.6 });
  const smoke = vfx.emitter('smoke', { pos: rp, follow: true, area: 'point', rate: 16, y: [0, 0] });
  let t = 0, done = false;
  const finish = () => {
    if (done) return; done = true;
    vfx.scene.remove(group);
    trail.stop(); fire.stop(); smoke.stop();
  };
  return {
    update(dt) {
      t += dt;
      const k = Math.min(1, t / fall), a = 1 - k;
      rp.set(target.x - 4 * a, 0.6 + (H - 0.6) * a * a, target.z - 4 * a);
      group.position.copy(rp);
      rock.rotation.x += dt * 5; rock.rotation.y += dt * 3;
      hull.rotation.copy(rock.rotation);
      if (t >= fall) {
        finish();
        if (!o.noImpact) meteorImpact(vfx, target, { radius: R });
        return false;
      }
      return true;
    },
    end: finish,
  };
}

function meteorImpact(vfx, pos, o) {
  const R = o.radius ?? 3.2;
  const p = { x: pos.x, y: 0, z: pos.z };
  vfx.decal('crater', p, R * 0.75, o.life ?? 5, { extra: 0.8 });
  vfx.decal('scorch', p, R * 1.05, o.life ?? 5, { extra: 0.7 });
  vfx.shell('blastDome', p, { radius: R * 0.85, height: R * 0.6, life: 0.32 });
  vfx.emit('fireball', { x: p.x, y: 0.7, z: p.z }, { count: 6 });
  vfx.emit('ember', { x: p.x, y: 0.4, z: p.z }, { count: 26 });
  vfx.emit('smoke', { x: p.x, y: 0.6, z: p.z }, { count: 8, scale: 1.3 });
  vfx.emit('dustRing', { x: p.x, y: 0.25, z: p.z }, { count: 14 });
  vfx.debris('rock', p, 10);
  vfx.debris('ember', p, 8);
}

// ---------------------------------------------------------------- VORTEX (singularity)
function vortex(vfx, pos, o) {
  const R = o.radius ?? 5, L = o.life ?? 2.5;
  const p = { x: pos.x, y: 0, z: pos.z };
  const parts = {
    rune: vfx.decal('rune', p, R, L + 0.3, { grow: 0.35, fade: 0.3 }),
    funnel: vfx.shell('vortexFunnel', p, { radius: R * 0.42, height: 3.0, life: L }),
    motes: vfx.emitter('arcaneMote', { pos: p, radius: R, area: 'ring', rate: 30, y: [0.2, 1.6], life: L }),
    junk: vfx.emitter('vortexDebris', { pos: p, radius: R, area: 'ring', rate: 12, y: [0.1, 0.6], life: L }),
    glyphs: vfx.emitter('runeGlyph', { pos: p, radius: R * 0.8, area: 'ring', rate: 2.5, y: [0.3, 0.3], life: L }),
  };
  let t = 0, ended = false;
  const h = {
    pos: p, parts,
    update(dt) { t += dt; if (t >= L && !ended) h.collapse(); return t < L + 0.5; },
    collapse() {
      if (ended) return; ended = true;
      for (const k of ['motes', 'junk', 'glyphs']) parts[k].stop();
      parts.funnel.end(0.15); parts.rune.end(0.3);
      vfx.shell('arcaneDome', p, { radius: R * 0.6, height: R * 0.45, life: 0.3 });
      vfx.emit('runeGlyph', { x: p.x, y: 0.6, z: p.z }, { count: 8, speed: 4 });
      vfx.debris('crystal', p, 8);
    },
    end() { h.collapse(); },
  };
  return h;
}

// ---------------------------------------------------------------- THUNDERSTORM
function storm(vfx, pos, o) {
  const R = o.radius ?? 4, L = o.life ?? 5;
  const p = { x: pos.x, y: 0, z: pos.z };
  const parts = {
    cloud: vfx.cloud(p, { radius: R * 0.85, height: 5.2, style: 'storm', life: L, back: R * 0.6 }),
    shade: vfx.decal('shadow', p, R * 1.3, L, { alpha: 0.34 }),
    wet: vfx.decal('wet', p, R * 0.9, L + 1, { grow: 1.2 }),
    rain: vfx.emitter('rain', { pos: p, radius: R, rate: 30 * R, y: [4.6, 5.0], vel: { x: 0.6, y: -11, z: 0.3 }, land: true, life: L }),
  };
  let t = 0, flick = 0;
  const h = {
    pos: p, parts,
    update(dt) {
      t += dt; flick -= dt;
      if (flick <= 0) { flick = 0.25 + Math.random() * 0.5; parts.cloud.flash(0.25 + Math.random() * 0.2); }
      return t < L;
    },
    // a bolt from the cloud to `target` ({x,z}); returns nothing (damage is the skill's job)
    strike(target) {
      const c = parts.cloud.pos;
      skyStrike(vfx, target, { from: { x: c.x + (Math.random() - 0.5) * R * 0.6, y: c.y - 0.4, z: c.z + (Math.random() - 0.5) * R * 0.6 } });
      parts.cloud.flash(1);
    },
    end() { parts.rain.stop(); parts.cloud.end(); parts.shade.end(0.4); parts.wet.end(0.8); t = Math.max(t, L - 0.4); },
  };
  return h;
}

// Lightning strike: forked bolt + scorch + spark star + sparks + clods. opts.from overrides the sky point.
function skyStrike(vfx, target, o = {}) {
  const from = o.from ?? { x: target.x + 1.5, y: 12, z: target.z + 1.5 };
  vfx.bolt(from, { x: target.x, y: 0.5, z: target.z }, { color: o.color ?? 0xffe14a, branches: o.branches ?? 2 });
  vfx.decal('scorch', target, o.radius ?? 0.9, 2.2, { extra: 3, alpha: 0.55, grow: 0.05, fade: 1 });
  vfx.emit('sparkStar', { x: target.x, y: 0.7, z: target.z });
  vfx.emit('spark', { x: target.x, y: 0.4, z: target.z }, { count: 8 });
  vfx.debris('dirt', target, 3);
}

// Frozen enemy breaks: ice shards + chips + glint.
function shatter(vfx, pos, o = {}) {
  const s = o.scale ?? 1;
  vfx.debris('ice', pos, 8, { scale: s });
  vfx.emit('iceChip', { x: pos.x, y: 0.8 * s, z: pos.z }, { count: 10 });
  vfx.emit('frostGlint', { x: pos.x, y: 0.9 * s, z: pos.z }, { count: 3 });
}

export const RECIPES = { blizzard, meteor, meteorImpact, vortex, storm, skyStrike, shatter };
```

### A.6 `src/game/vfx/debris.js`

```js
import * as THREE from 'three';
import { mulberry32 } from './textures.js';

// =====================================================================================
//  Debris: physical chunks (rocks, ice shards, embers, crystal splinters) as TWO instanced,
//  flat-shaded MeshLambert draws lit by the scene sun/hemi (they sit in the world, not on top
//  of it). CPU physics (gravity, ground bounce, friction, tumble), fixed capacity, swap-remove.
//  Per-instance emissive (rgb) via a 3-float attribute so embers glow then cool to charcoal.
//  Fade-out = shrink to 0 (no transparency, stays in the opaque pass, casts shadows).
//
//  Kinds: { geo: 'chunk'|'shard', color, emis:[hex, hdr], cool (s), scale:[min,max],
//           stretch (y scale mult), speed:[min,max], up, gravity, bounce, life:[min,max] }
//  sprout(kind, pos, opts): a static crystal that grows out of the ground with overshoot,
//  holds, then shatters into `shatter` small pieces of the same kind.
// =====================================================================================

export const DEBRIS = {
  rock:     { geo: 'chunk', color: 0x7a6a58, scale: [0.12, 0.26], speed: [4, 8], up: 1.1, gravity: 26, bounce: 0.35, life: [0.9, 1.4] },
  dirt:     { geo: 'chunk', color: 0x5d4a36, scale: [0.07, 0.14], speed: [3, 6], up: 1.3, gravity: 26, bounce: 0.25, life: [0.6, 1.0] },
  ember:    { geo: 'chunk', color: 0x2a1a14, emis: [0xff7a2a, 2.2], cool: 0.9, scale: [0.07, 0.14], speed: [5, 10], up: 1.2, gravity: 22, bounce: 0.3, life: [0.8, 1.3] },
  ice:      { geo: 'shard', color: 0x9fd0ee, emis: [0x66d9ff, 0.15], scale: [0.08, 0.16], stretch: 2.2, speed: [4, 8], up: 0.9, gravity: 26, bounce: 0.3, life: [0.7, 1.1] },
  crystal:  { geo: 'shard', color: 0xa98ad8, emis: [0xb67cff, 0.9], cool: 1.5, scale: [0.08, 0.15], stretch: 2.4, speed: [4, 9], up: 0.8, gravity: 20, bounce: 0.3, life: [0.7, 1.1] },
  iceSpike: { geo: 'shard', color: 0xa8d8f2, emis: [0x66d9ff, 0.12], scale: [0.28, 0.42], stretch: 3.2, life: [2, 2], shatter: 'ice' },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function chunkGeometry() {
  // low-poly rock: icosahedron with seeded per-vertex jitter, non-indexed -> flat facets
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position');
  const rnd = mulberry32(7);
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const jit = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (!jit.has(k)) jit.set(k, 0.75 + rnd() * 0.45);
    const s = jit.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.8, pos.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

function patchEmissive(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iEmis;\nvarying vec3 vEmisD;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmisD = iEmis;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmisD;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmisD;');
  };
  mat.customProgramCacheKey = () => 'vfx-debris-v1';
}

class DebrisPool {
  constructor(scene, geo, cap, castShadow) {
    this.cap = cap;
    this.n = 0;
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    patchEmissive(mat);
    this.emis = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iEmis', this.emis);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // SoA state
    this.P = new Float32Array(cap * 3); this.V = new Float32Array(cap * 3);
    this.R = new Float32Array(cap * 3); this.W = new Float32Array(cap * 3);
    this.S = new Float32Array(cap * 3);              // base scale xyz
    this.T = new Float32Array(cap * 4);              // age, life, cool time, mode (0 physics, 1 sprout)
    this.E = new Float32Array(cap * 3);              // emissive rgb at birth
    this.K = new Array(cap).fill(null);              // kind def (for sprout shatter)
    this.F = new Float32Array(cap * 2);              // gravity, bounce
    this._arrs = [[this.P, 3], [this.V, 3], [this.R, 3], [this.W, 3], [this.S, 3], [this.T, 4], [this.E, 3], [this.F, 2]];
  }

  alloc() {
    if (this.n < this.cap) return this.n++;
    // full: recycle the oldest-by-age-fraction slot 0 (cheap; debris is short-lived)
    return 0;
  }

  _copy(from, to) {
    for (const [arr, w] of this._arrs) {
      for (let k = 0; k < w; k++) arr[to * w + k] = arr[from * w + k];
    }
    this.K[to] = this.K[from];
    const c = this.mesh.instanceColor.array;
    c[to * 3] = c[from * 3]; c[to * 3 + 1] = c[from * 3 + 1]; c[to * 3 + 2] = c[from * 3 + 2];
  }

  update(dt, onShatter) {
    const P = this.P, V = this.V, R = this.R, W = this.W, S = this.S, T = this.T, E = this.E, F = this.F;
    const inst = this.mesh.instanceMatrix.array, em = this.emis.array;
    let i = 0;
    while (i < this.n) {
      const t4 = i * 4;
      T[t4] += dt;
      const age = T[t4], life = T[t4 + 1];
      if (age >= life) {
        if (T[t4 + 3] > 0.5 && this.K[i]?.shatter) onShatter(this.K[i], P[i * 3], P[i * 3 + 1], P[i * 3 + 2], S[i * 3]);
        const last = --this.n;
        if (i !== last) this._copy(last, i);
        continue;
      }
      const i3 = i * 3;
      let grow = 1;
      if (T[t4 + 3] < 0.5) {
        // physics
        V[i3 + 1] -= F[i * 2] * dt;
        P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
        const floor = S[i3 + 1] * 0.6;
        if (P[i3 + 1] < floor) {
          P[i3 + 1] = floor;
          if (V[i3 + 1] < -1.5) {
            V[i3 + 1] *= -F[i * 2 + 1];
            V[i3] *= 0.6; V[i3 + 2] *= 0.6;
            W[i3] *= 0.6; W[i3 + 1] *= 0.6; W[i3 + 2] *= 0.6;
          } else {
            V[i3 + 1] = 0; V[i3] *= Math.exp(-8 * dt); V[i3 + 2] *= Math.exp(-8 * dt);
            W[i3] *= Math.exp(-6 * dt); W[i3 + 1] *= Math.exp(-6 * dt); W[i3 + 2] *= Math.exp(-6 * dt);
          }
        }
        R[i3] += W[i3] * dt; R[i3 + 1] += W[i3 + 1] * dt; R[i3 + 2] += W[i3 + 2] * dt;
      } else {
        // sprout: overshoot grow-in over 0.22 s (easeOutBack)
        const k = Math.min(1, age / 0.22), c1 = 1.9;
        grow = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      }
      const out = Math.min(1, (life - age) / 0.25);
      const s = Math.max(0, grow * (T[t4 + 3] > 0.5 ? 1 : out));
      _e.set(R[i3], R[i3 + 1], R[i3 + 2]);
      _q.setFromEuler(_e);
      _p.set(P[i3], P[i3 + 1], P[i3 + 2]);
      _s.set(S[i3] * s, S[i3 + 1] * s, S[i3 + 2] * s);
      _m.compose(_p, _q, _s);
      _m.toArray(inst, i * 16);
      const cool = T[t4 + 2] > 0 ? Math.max(0, 1 - age / T[t4 + 2]) : 1;
      const ck = cool * cool;
      em[i3] = E[i3] * ck; em[i3 + 1] = E[i3 + 1] * ck; em[i3 + 2] = E[i3 + 2] * ck;
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      this.emis.needsUpdate = true;
    }
  }
}

export class DebrisSystem {
  constructor(scene, { cap = 384 } = {}) {
    this.pools = {
      chunk: new DebrisPool(scene, chunkGeometry(), cap, true),
      shard: new DebrisPool(scene, new THREE.OctahedronGeometry(1, 0), cap, false),
    };
    this._shatter = (kind, x, y, z, sc) => this.burst(kind.shatter, { x, y: 0, z }, 5, { scale: Math.max(0.6, sc * 2.5), speed: 0.6 });
  }

  // n chunks flying out from pos. opts: { scale, speed, dir:{x,z}, cone (0..1 how much they follow dir), color }
  burst(kindId, pos, n, opts = {}) {
    const k = DEBRIS[kindId];
    if (!k) return;
    const pool = this.pools[k.geo];
    const sc = opts.scale ?? 1, sp = opts.speed ?? 1;
    for (let j = 0; j < n; j++) {
      const i = pool.alloc();
      const i3 = i * 3;
      const a = Math.random() * Math.PI * 2;
      const s = (k.speed?.[0] ?? 3) + Math.random() * ((k.speed?.[1] ?? 6) - (k.speed?.[0] ?? 3));
      let dx = Math.cos(a), dz = Math.sin(a);
      if (opts.dir) { const c = opts.cone ?? 0.6; dx = dx * (1 - c) + opts.dir.x * c; dz = dz * (1 - c) + opts.dir.z * c; }
      pool.P[i3] = pos.x + dx * 0.2; pool.P[i3 + 1] = (pos.y ?? 0) + 0.3; pool.P[i3 + 2] = pos.z + dz * 0.2;
      pool.V[i3] = dx * s * sp; pool.V[i3 + 1] = s * sp * (k.up ?? 1) * (0.6 + Math.random() * 0.6); pool.V[i3 + 2] = dz * s * sp;
      for (let q = 0; q < 3; q++) { pool.R[i3 + q] = Math.random() * 6.28; pool.W[i3 + q] = (Math.random() * 2 - 1) * 12; }
      this._common(pool, i, k, sc, opts, 0);
    }
  }

  // A crystal that grows out of the ground and holds; shatters into k.shatter at the end.
  sprout(kindId, pos, opts = {}) {
    const k = DEBRIS[kindId];
    const pool = this.pools[k.geo];
    const i = pool.alloc();
    const i3 = i * 3;
    pool.P[i3] = pos.x; pool.P[i3 + 2] = pos.z;
    pool.V[i3] = pool.V[i3 + 1] = pool.V[i3 + 2] = 0;
    pool.W[i3] = pool.W[i3 + 1] = pool.W[i3 + 2] = 0;
    const tilt = opts.tilt ?? 0.35;
    pool.R[i3] = (Math.random() * 2 - 1) * tilt; pool.R[i3 + 1] = Math.random() * 6.28; pool.R[i3 + 2] = (Math.random() * 2 - 1) * tilt;
    this._common(pool, i, k, opts.scale ?? 1, opts, 1);
    pool.T[i * 4 + 1] = opts.life ?? k.life[0];
    pool.P[i3 + 1] = pool.S[i3 + 1] * 0.55;          // half buried
  }

  _common(pool, i, k, sc, opts, mode) {
    const i3 = i * 3;
    const s = (k.scale[0] + Math.random() * (k.scale[1] - k.scale[0])) * sc;
    const st = k.stretch ?? 1;
    pool.S[i3] = s; pool.S[i3 + 1] = s * st; pool.S[i3 + 2] = s * (0.8 + Math.random() * 0.4);
    const t4 = i * 4;
    pool.T[t4] = 0;
    pool.T[t4 + 1] = k.life[0] + Math.random() * (k.life[1] - k.life[0]);
    pool.T[t4 + 2] = k.cool ?? 0;
    pool.T[t4 + 3] = mode;
    pool.F[i * 2] = k.gravity ?? 24; pool.F[i * 2 + 1] = k.bounce ?? 0.3;
    _c.set(opts.color ?? k.color);
    const v = 0.85 + Math.random() * 0.3;
    const col = pool.mesh.instanceColor.array;
    col[i3] = _c.r * v; col[i3 + 1] = _c.g * v; col[i3 + 2] = _c.b * v;
    if (k.emis) { _c.set(k.emis[0]).multiplyScalar(k.emis[1]); pool.E[i3] = _c.r; pool.E[i3 + 1] = _c.g; pool.E[i3 + 2] = _c.b; }
    else pool.E[i3] = pool.E[i3 + 1] = pool.E[i3 + 2] = 0;
    pool.K[i] = k;
  }

  update(dt) { for (const p of Object.values(this.pools)) p.update(dt, this._shatter); }
  clear() { for (const p of Object.values(this.pools)) { p.n = 0; p.mesh.count = 0; p.mesh.visible = false; } }
}
```

### A.7 `src/game/vfx/shells.js`

```js
import * as THREE from 'three';
import { RAMP_GLSL } from './textures.js';

// =====================================================================================
//  Shells: noise-scrolled mesh effects (fire pillar, snow veil, tornado / vortex funnel,
//  explosion dome, swirling torus). One InstancedMesh per geometry kind => at most 4 draws
//  however many are alive. All animation (scroll, twist, wobble, erosion in/out) runs on the
//  GPU from per-instance attributes written once; the CPU only writes a matrix on spawn / move.
//
//  Look: field = scrollingNoise * verticalProfile - threshold; pixels with field < 0 are cut
//  (hard alpha erosion, AA'd with fwidth), and the colour comes from a STEPPED ramp indexed
//  by how deep inside the shape the pixel is => dark ink band at every eroded edge, then 2-3
//  flat colour bands. Erosion threshold rises at birth and death (shape grows / burns away).
//  Front faces fade toward the middle of the silhouette so a cylinder never hides its contents.
//
//  Per-instance (vec4): iS0 = birth, life, seed, rampRow   iS1 = tileX (integer!), tileY, scrollX, scrollY
//                       iS2 = twist, erode, wobble, mode    iS3 = fadeIn, fadeOut, hdr, frontAlpha
// =====================================================================================

const VS = /* glsl */`
  attribute vec4 iS0; attribute vec4 iS1; attribute vec4 iS2; attribute vec4 iS3;
  uniform float uTime;
  varying vec2 vUv; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vS3;
  varying float vAge; varying vec3 vNrmV;
  void main() {
    vAge = uTime - iS0.x;
    vec3 p = position;
    float wob = iS2.z * uv.y;
    p.x += sin(uv.y * 6.0 + vAge * 3.1 + iS0.z * 7.0) * wob;
    p.z += cos(uv.y * 5.0 + vAge * 2.7 + iS0.z * 5.0) * wob;
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * wp;
    vNrmV = normalMatrix * (mat3(instanceMatrix) * normal);
    vUv = uv; vS0 = iS0; vS1 = iS1; vS2 = iS2; vS3 = iS3;
  }`;

const FS = /* glsl */`
  uniform sampler2D uNoise;
  uniform vec4 uProfile;          // per geometry kind: base fade-in [x..y], top fade-out [z..w] on uv.y
  ${RAMP_GLSL}
  varying vec2 vUv; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vS3;
  varying float vAge; varying vec3 vNrmV;
  void main() {
    float life = vS0.y;
    if (vAge < 0.0 || vAge > life) discard;
    vec2 uv = vUv;
    uv.x += uv.y * vS2.x;                                        // twist (spiral)
    vec2 sc = vS1.zw * vAge;
    float n1 = texture(uNoise, uv * vS1.xy + sc + vS0.z).r;
    float n2 = texture(uNoise, uv * vS1.xy * vec2(2.0, 1.5) + sc * vec2(1.7, 1.3) + vS0.z * 1.7 + 0.37).r;
    float n = n1 * n2 * 2.0;
    float prof = smoothstep(uProfile.x, uProfile.y, uv.y) * (1.0 - smoothstep(uProfile.z, uProfile.w, uv.y));
    float env = min(1.0, vAge / max(vS3.x, 1e-3)) * min(1.0, (life - vAge) / max(vS3.y, 1e-3));
    float f = n * prof - (vS2.y + (1.0 - env) * 0.8);
    float aa = max(fwidth(f), 1e-3);
    float m = smoothstep(-aa, aa, f);
    if (m < 0.003) discard;
    vec4 c = ramp(vS0.w, f / 0.45);                              // stepped ramp: ink -> body -> highlight
    float facing = abs(normalize(vNrmV).z);
    float front = gl_FrontFacing ? mix(1.0, vS3.w, facing * facing) : 1.0;
    float a = c.a * m * front;
    if (vS2.w > 0.5) gl_FragColor = vec4(c.rgb * a, a);          // paint (premultiplied)
    else gl_FragColor = vec4(c.rgb * vS3.z * m * front, a);      // glow: rgb emits, alpha occludes
  }`;

function geometryFor(kind) {
  switch (kind) {
    case 'cylinder': return new THREE.CylinderGeometry(1, 1, 1, 28, 4, true).translate(0, 0.5, 0);
    case 'funnel': return new THREE.CylinderGeometry(1, 0.22, 1, 28, 8, true).translate(0, 0.5, 0);
    case 'dome': return new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'torus': return new THREE.TorusGeometry(1, 0.22, 8, 40).rotateX(-Math.PI / 2);
    default: throw new Error(`unknown shell kind ${kind}`);
  }
}
const PROFILE = {
  cylinder: [0.0, 0.18, 0.55, 1.0],
  funnel: [0.0, 0.25, 0.75, 1.0],
  dome: [-0.1, 0.15, 0.9, 1.01],
  torus: [-1.0, -0.5, 2.0, 2.5],
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

class ShellPool {
  constructor(scene, kind, shared, cap) {
    this.kind = kind;
    this.cap = cap;
    this.n = 0;
    this.handles = [];
    const geo = geometryFor(kind);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(), mk(), mk(), mk()];
    ['iS0', 'iS1', 'iS2', 'iS3'].forEach((name, i) => geo.setAttribute(name, this.attrs[i]));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime, uNoise: { value: shared.noise },
        uRamp: { value: shared.ramps.tex }, uRampRows: { value: shared.ramps.rows },
        uProfile: { value: new THREE.Vector4(...PROFILE[kind]) },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, ...shared.blend,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  _write(i, h) {
    _q.setFromAxisAngle(_up, h.yaw);
    _p.set(h.pos.x, (h.pos.y ?? 0) + h.y, h.pos.z);
    _s.set(h.radius, h.height, h.radius);
    _m.compose(_p, _q, _s).toArray(this.mesh.instanceMatrix.array, i * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  add(h, st, time) {
    if (this.n >= this.cap) this._remove(0);
    const i = this.n++;
    h.slot = i;
    this.handles[i] = h;
    const [a0, a1, a2, a3] = this.attrs.map((a) => a.array);
    const o = i * 4;
    a0[o] = time; a0[o + 1] = h.life; a0[o + 2] = Math.random() * 10; a0[o + 3] = st.row;
    a1[o] = st.tile[0]; a1[o + 1] = st.tile[1]; a1[o + 2] = st.scroll[0]; a1[o + 3] = st.scroll[1];
    a2[o] = st.twist ?? 0; a2[o + 1] = st.erode ?? 0.2; a2[o + 2] = st.wobble ?? 0; a2[o + 3] = st.mode === 'paint' ? 1 : 0;
    a3[o] = st.fade?.[0] ?? 0.25; a3[o + 1] = st.fade?.[1] ?? 0.35; a3[o + 2] = st.hdr ?? 1; a3[o + 3] = st.frontAlpha ?? 1;
    for (const a of this.attrs) a.needsUpdate = true;
    this._write(i, h);
  }

  _remove(i) {
    const last = --this.n;
    const h = this.handles[i];
    if (h) h.slot = -1;
    if (i !== last) {
      for (const a of this.attrs) { const arr = a.array; for (let k = 0; k < 4; k++) arr[i * 4 + k] = arr[last * 4 + k]; a.needsUpdate = true; }
      const im = this.mesh.instanceMatrix.array;
      for (let k = 0; k < 16; k++) im[i * 16 + k] = im[last * 16 + k];
      this.mesh.instanceMatrix.needsUpdate = true;
      this.handles[i] = this.handles[last];
      this.handles[i].slot = i;
    }
    this.handles[last] = null;
  }

  update(time) {
    for (let i = this.n - 1; i >= 0; i--) {
      const h = this.handles[i];
      if (time - h.birth > h.life) { this._remove(i); continue; }
      if (h.follow || h.dirty) { this._write(i, h); h.dirty = false; }
    }
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
  }
}

export class ShellSystem {
  constructor(scene, shared, cap = 32) {
    this.scene = scene; this.shared = shared; this.cap = cap;
    this.pools = {};
    this.time = 0;
  }
  _pool(kind) { return this.pools[kind] ??= new ShellPool(this.scene, kind, this.shared, this.cap); }

  // st: compiled shell style (see presets.js). opts: { radius, height, y, life, yaw, follow }
  // Returns a handle: { pos (live if follow), radius, height, end(fadeOut?), alive }.
  add(st, pos, opts, time) {
    const pool = this._pool(st.geo);
    const sys = this;
    const h = {
      pos: opts.follow ? pos : { x: pos.x, y: pos.y ?? 0, z: pos.z },
      radius: opts.radius ?? 1, height: opts.height ?? opts.radius ?? 1, y: opts.y ?? 0,
      yaw: opts.yaw ?? Math.random() * 6.283, life: opts.life ?? 1, birth: time,
      follow: !!opts.follow, dirty: false, slot: -1, pool,
      get alive() { return this.slot >= 0; },
      // set radius/height then call touch() to re-upload the matrix
      touch() { this.dirty = true; },
      end(fadeOut = st.fade?.[1] ?? 0.35) {
        if (this.slot < 0) return;
        this.life = Math.min(this.life, sys.time - this.birth + fadeOut);
        pool.attrs[0].array[this.slot * 4 + 1] = this.life;
        pool.attrs[0].needsUpdate = true;
      },
    };
    pool.add(h, st, time);
    return h;
  }

  update(time) { this.time = time; for (const p of Object.values(this.pools)) p.update(time); }
  clear() { for (const p of Object.values(this.pools)) { while (p.n > 0) p._remove(p.n - 1); p.mesh.count = 0; p.mesh.visible = false; } }
}
```

### A.8 `src/game/vfx/decals.js`

```js
import * as THREE from 'three';

// =====================================================================================
//  Ground decals: ONE instanced draw for every live decal of every kind. Each instance is a
//  2x2 ground quad scaled to its radius; the fragment shader branches on the (per-instance,
//  so warp-coherent) kind and draws a procedural, animated mask:
//    0 frost   creeping crystalline front (polar noise lobes + dendrite fingers), Worley
//              facets, twinkling glints, dark ink band on the advancing edge, melts by noise
//    1 scorch  irregular char blob, glowing Worley ember cracks that cool from yellow to red to off
//    2 rune    rotating rune circle: rings, procedural 3-stroke glyphs per sector, hexagram,
//              drawn on by an angular sweep; glow strokes over a dark backing
//    3 crater  bowl + raised lip lit from the real sun direction (reads as a depression in iso),
//              polar-Worley radial cracks, optional cooling ember glow
//    4 wet     dark wet stain with ripple rings popping at random points
//    5 shadow  soft cool shadow blob (cloud shadow), slowly drifting edge
//  Premultiplied output under BLEND_ADD: rgb = paint * a + emission, a = how much ground is covered.
//  depthTest false (grass never hides it), renderOrder 1 (under fx.ring = 2 and telegraphs).
//
//  Per-instance: iD0 = birth, life, seed, kind   iD1 = grow (s), fade (s), intensity, extra
//                iD2 = colour A (paint rgb, alpha) iD3 = colour B (accent / glow rgb, hdr)
// =====================================================================================

export const DECAL = { frost: 0, scorch: 1, rune: 2, crater: 3, wet: 4, shadow: 5 };

const VS = /* glsl */`
  attribute vec4 iD0; attribute vec4 iD1; attribute vec4 iD2; attribute vec4 iD3;
  varying vec2 vP; varying vec2 vW; varying float vR;
  varying vec4 vD0; varying vec4 vD1; varying vec4 vD2; varying vec4 vD3;
  void main() {
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vP = position.xz;
    vW = wp.xz;
    vR = length(instanceMatrix[0].xyz);
    vD0 = iD0; vD1 = iD1; vD2 = iD2; vD3 = iD3;
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }`;

const FS = /* glsl */`
  uniform float uTime; uniform sampler2D uNoise; uniform vec2 uSunXZ;
  varying vec2 vP; varying vec2 vW; varying float vR;
  varying vec4 vD0; varying vec4 vD1; varying vec4 vD2; varying vec4 vD3;
  const float TAU = 6.2831853;
  float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
  float stroke(float d, float w) { float aa = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, d); }
  // polar samples jump at the atan seam: use an explicit LOD so mip selection does not spike
  vec4 nzP(vec2 q) { return textureLod(uNoise, q, 1.0); }
  vec4 nz(vec2 q) { return texture(uNoise, q); }

  vec4 frost(vec2 p, float r, float an, float age, float grow, float fadeK, float seed) {
    float big = nzP(vec2(an * 5.0, r * 0.25 + seed)).r;
    float fing = nzP(vec2(an * 23.0, r * 0.6 - seed)).g;
    float front = grow * (0.78 + 0.26 * big);
    float d = front - r + (fing - 0.5) * 0.25 * smoothstep(0.25, 1.0, r);
    float er = nz(vW * 0.11 + seed).r;
    d = min(d, (er - fadeK * 1.15) * 0.6);
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) return vec4(0.0);
    vec4 cell = nz(vW * 0.09 + seed * 0.37);
    float facet = 1.0 - smoothstep(0.0, 0.09, cell.b);
    float edgeBand = 1.0 - smoothstep(0.0, 0.14 / max(vR, 0.5), d);
    vec3 col = mix(vD2.rgb, vec3(1.0), facet * 0.65);
    col = mix(col, vD3.rgb, edgeBand * 0.9);
    float a = vD2.a * m * mix(0.8 + 0.2 * facet, 1.0, edgeBand);
    float tw = step(0.9, fract(cell.a * 7.0 + floor(uTime * 2.5 + cell.a * 10.0) * 0.618));
    vec3 emit = vec3(1.1, 1.4, 1.6) * tw * (1.0 - smoothstep(0.0, 0.25, cell.b)) * m * vD1.z;
    return vec4(col * a + emit, a);
  }

  vec4 scorch(vec2 p, float r, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.15 + seed).r;
    float d = grow * (0.72 + 0.4 * n) - r;
    d = min(d, (n - fadeK) * 0.5);
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) return vec4(0.0);
    float heat = exp(-age * vD1.w);
    float crack = 1.0 - smoothstep(0.0, 0.07, nz(vW * 0.22 + seed).b);
    float core = 1.0 - smoothstep(0.1, 0.8, r);
    vec3 ember = mix(vec3(0.55, 0.04, 0.0), vD3.rgb, heat) * vD3.w * heat * vD1.z;
    float a = vD2.a * m * mix(0.5, 1.0, 1.0 - smoothstep(0.3, 1.0, r));
    return vec4(vD2.rgb * a + ember * crack * core * m, a);
  }

  vec4 rune(vec2 p, float r, float an, float age, float grow, float fadeK, float seed) {
    float rotO = age * 0.35, rotI = -age * 0.6;
    float sweep = step(fract(an - 0.25 + 1.0), grow);
    float s = 0.0, back = 0.0;
    float dO = abs(r - 0.93); s += stroke(dO, 0.028) * sweep; back += stroke(dO, 0.07);
    float d2 = abs(r - 0.80); s += stroke(d2, 0.011) * sweep; back += stroke(d2, 0.04);
    float d3 = abs(r - 0.42); s += stroke(d3, 0.013) * sweep; back += stroke(d3, 0.04);
    // glyph band between the two outer rings
    const float N = 14.0;
    float sa = fract(an + rotO / TAU) * N;
    float id = floor(sa);
    vec2 lp = vec2((fract(sa) - 0.5) * (TAU * 0.865 / N), r - 0.865) / 0.05;
    float dg = 9.0;
    vec2 prev = vec2(floor(hash1(id + seed) * 3.0) - 1.0, floor(hash1(id * 1.7 + seed) * 3.0) - 1.0);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 nx = vec2(floor(hash1(id * 3.1 + fk * 7.3 + seed) * 3.0) - 1.0, floor(hash1(id * 5.3 + fk * 2.9 + seed) * 3.0) - 1.0);
      if (nx == prev) nx = -nx;
      dg = min(dg, sdSeg(lp, prev * vec2(0.55, 0.7), nx * vec2(0.55, 0.7)));
      prev = nx;
    }
    float inBand = step(abs(r - 0.865), 0.06);
    s += stroke(dg * 0.05, 0.009) * inBand * sweep;
    // hexagram (two triangles) rotating the other way
    float dh = 9.0;
    for (int k = 0; k < 6; k++) {
      float a0 = rotI + float(k) * TAU / 6.0, a1 = a0 + 2.0 * TAU / 6.0;
      dh = min(dh, sdSeg(p, 0.78 * vec2(cos(a0), sin(a0)), 0.78 * vec2(cos(a1), sin(a1))));
    }
    s += stroke(dh, 0.01) * smoothstep(0.4, 0.8, grow);
    back += stroke(dh, 0.035);
    s = min(s, 1.0); back = min(back, 1.0);
    float k = (1.0 - fadeK) * vD1.z * (0.85 + 0.15 * sin(age * 6.0));
    float tint = (1.0 - smoothstep(0.93, 0.96, r)) * 0.12;
    float a = max(back * vD2.a, tint) * k;
    return vec4(vD2.rgb * a + vD3.rgb * vD3.w * s * k, a);
  }

  vec4 crater(vec2 p, float r, float an, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.2 + seed).r;
    vec2 dir = p / max(r, 1e-3);
    float rr = r / max(grow, 0.05);
    float bowl = 1.0 - smoothstep(0.40, 0.48 + 0.06 * n, rr);
    float lip = smoothstep(0.36, 0.48, rr) * (1.0 - smoothstep(0.52, 0.66 + 0.1 * n, rr));
    float wallLit = clamp(dot(-dir, uSunXZ), 0.0, 1.0) * smoothstep(0.2, 0.45, rr);
    float lipLit = step(0.0, dot(dir, uSunXZ));
    float cr = nzP(vec2(an * 2.0, log(max(r, 0.05)) * 0.35 + seed)).b;
    float crack = (1.0 - smoothstep(0.0, 0.06, cr)) * smoothstep(0.42, 0.5, rr) * (1.0 - smoothstep(0.7, 1.0, r));
    float er = smoothstep(fadeK - 0.05, fadeK + 0.05, n * 0.9 + 0.05);
    vec3 dark = vD2.rgb, dust = vD3.rgb;
    vec3 col = mix(dark, dark * 1.8 + 0.05, wallLit);
    float a = bowl * vD2.a;
    vec3 lipCol = dust * mix(0.7, 1.15, lipLit);
    col = mix(col, lipCol, lip * (1.0 - bowl));
    a = max(a, lip * 0.75);
    col = mix(col, dark * 0.6, crack); a = max(a, crack * 0.8);
    a *= er;
    float heat = exp(-age * vD1.w) * vD1.z;
    vec3 emit = vec3(1.6, 0.55, 0.12) * heat * (crack + bowl * 0.35 * (1.0 - smoothstep(0.0, 0.4, rr))) * er;
    return vec4(col * a + emit, a);
  }

  vec4 wet(vec2 p, float r, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.18 + seed).r;
    float d = grow * (0.72 + 0.32 * n) - r;
    d = min(d, (n - fadeK) * 0.5);
    float aa = fwidth(d) + 1e-4;
    float m = smoothstep(-aa, aa, d);
    if (m <= 0.0) return vec4(0.0);
    float ring = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float ph = age * 0.9 + fk * 0.37;
      float cyc = floor(ph);
      vec2 c = vec2(hash1(cyc * 13.1 + fk + seed * 7.0), hash1(cyc * 7.7 + fk * 3.1 + seed * 3.0)) * 1.1 - 0.55;
      float rr = fract(ph) * 0.32;
      float dd = abs(length(p - c) - rr);
      ring += (1.0 - smoothstep(0.0, 0.025, dd)) * (1.0 - fract(ph));
    }
    float a = vD2.a * m;
    float sheen = (1.0 - smoothstep(0.0, 0.08, d)) * 0.5;
    return vec4(vD2.rgb * a + vD3.rgb * vD3.w * (ring + sheen) * m, a);
  }

  vec4 shadow(vec2 p, float r, float age, float grow, float fadeK, float seed) {
    float n = nz(vW * 0.08 + vec2(age * 0.05, 0.0) + seed).r;
    float m = (1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.35)) * grow * (1.0 - fadeK);
    float a = vD2.a * m;
    return vec4(vD2.rgb * a, a);
  }

  void main() {
    float age = uTime - vD0.x, life = vD0.y;
    if (age < 0.0 || age > life) discard;
    vec2 p = vP;
    float r = length(p);
    if (r > 1.0) discard;
    float an = atan(p.y, p.x) / TAU + 0.5;
    float g = clamp(age / max(vD1.x, 1e-3), 0.0, 1.0);
    float grow = 1.0 - (1.0 - g) * (1.0 - g) * (1.0 - g);
    float fadeK = clamp((age - (life - vD1.y)) / max(vD1.y, 1e-3), 0.0, 1.0);
    float seed = vD0.z, kind = vD0.w;
    vec4 o;
    if (kind < 0.5) o = frost(p, r, an, age, grow, fadeK, seed);
    else if (kind < 1.5) o = scorch(p, r, age, grow, fadeK, seed);
    else if (kind < 2.5) o = rune(p, r, an, age, grow, fadeK, seed);
    else if (kind < 3.5) o = crater(p, r, an, age, grow, fadeK, seed);
    else if (kind < 4.5) o = wet(p, r, age, grow, fadeK, seed);
    else o = shadow(p, r, age, grow, fadeK, seed);
    if (o.a < 0.002 && max(o.r, max(o.g, o.b)) < 0.002) discard;
    gl_FragColor = o;
  }`;

// Per-kind defaults: grow / fade seconds, colour A (paint, alpha), colour B (accent, hdr), intensity, extra.
const DEFAULTS = {
  frost:  { grow: 0.6, fade: 0.6, a: [0xcfe9ff, 0.72], b: [0x2f5f8f, 1], intensity: 1, extra: 0 },
  scorch: { grow: 0.12, fade: 0.8, a: [0x24160f, 0.72], b: [0xffc04a, 2.2], intensity: 1, extra: 0.9 },
  rune:   { grow: 0.35, fade: 0.3, a: [0x140a24, 0.5], b: [0xb67cff, 1.35], intensity: 1, extra: 0 },
  crater: { grow: 0.08, fade: 1.0, a: [0x2a2018, 0.8], b: [0xb59a72, 1], intensity: 1, extra: 1.2 },
  wet:    { grow: 0.4, fade: 0.8, a: [0x1d3550, 0.38], b: [0xcfe8ff, 0.9], intensity: 1, extra: 0 },
  shadow: { grow: 0.5, fade: 0.6, a: [0x1a2236, 0.32], b: [0x000000, 1], intensity: 1, extra: 0 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

export class DecalSystem {
  constructor(scene, shared, cap = 128) {
    this.cap = cap;
    this.n = 0;
    this.handles = [];
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(), mk(), mk(), mk()];
    ['iD0', 'iD1', 'iD2', 'iD3'].forEach((name, i) => geo.setAttribute(name, this.attrs[i]));
    // the sun's ground direction (toward the sun) from engine.js SUN_OFFSET (-12, 34, 24)
    this.sun = new THREE.Vector2(-12, 24).normalize();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uNoise: { value: shared.noise }, uSunXZ: { value: this.sun } },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: false, ...shared.blend,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.time = 0;
  }

  // kind: 'frost'|'scorch'|'rune'|'crater'|'wet'|'shadow'. opts: { grow, fade, color, alpha, accent, hdr,
  // intensity, extra (scorch/crater: cooling rate), seed, yaw, y }. Returns { end(fade?), alive, pos, radius }.
  add(kind, pos, radius, life, opts = {}) {
    const D = DEFAULTS[kind];
    if (this.n >= this.cap) this._remove(0);
    const i = this.n++;
    const h = { pos: { x: pos.x, z: pos.z }, radius, life, birth: this.time, slot: i, sys: this,
      get alive() { return this.slot >= 0; },
      end(fade) {
        if (this.slot < 0) return;
        const a0 = this.sys.attrs[0].array, a1 = this.sys.attrs[1].array;
        const age = this.sys.time - this.birth;
        const f = fade ?? a1[this.slot * 4 + 1];
        this.life = Math.min(this.life, age + f);
        a0[this.slot * 4 + 1] = this.life; a1[this.slot * 4 + 1] = f;
        this.sys.attrs[0].needsUpdate = this.sys.attrs[1].needsUpdate = true;
      },
    };
    this.handles[i] = h;
    const [a0, a1, a2, a3] = this.attrs.map((a) => a.array);
    const o = i * 4;
    a0[o] = this.time; a0[o + 1] = life; a0[o + 2] = opts.seed ?? Math.random() * 10; a0[o + 3] = DECAL[kind];
    a1[o] = opts.grow ?? D.grow; a1[o + 1] = Math.min(opts.fade ?? D.fade, life * 0.5);
    a1[o + 2] = opts.intensity ?? D.intensity; a1[o + 3] = opts.extra ?? D.extra;
    _c.set(opts.color ?? D.a[0]); a2[o] = _c.r; a2[o + 1] = _c.g; a2[o + 2] = _c.b; a2[o + 3] = opts.alpha ?? D.a[1];
    _c.set(opts.accent ?? D.b[0]); a3[o] = _c.r; a3[o + 1] = _c.g; a3[o + 2] = _c.b; a3[o + 3] = opts.hdr ?? D.b[1];
    for (const a of this.attrs) a.needsUpdate = true;
    _q.setFromAxisAngle(_up, kind === 'crater' ? 0 : (opts.yaw ?? Math.random() * 6.283));
    _p.set(pos.x, opts.y ?? 0.05, pos.z);
    _s.set(radius, 1, radius);
    _m.compose(_p, _q, _s).toArray(this.mesh.instanceMatrix.array, i * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    return h;
  }

  _remove(i) {
    const last = --this.n;
    this.handles[i].slot = -1;
    if (i !== last) {
      for (const a of this.attrs) { const arr = a.array; for (let k = 0; k < 4; k++) arr[i * 4 + k] = arr[last * 4 + k]; a.needsUpdate = true; }
      const im = this.mesh.instanceMatrix.array;
      for (let k = 0; k < 16; k++) im[i * 16 + k] = im[last * 16 + k];
      this.mesh.instanceMatrix.needsUpdate = true;
      this.handles[i] = this.handles[last];
      this.handles[i].slot = i;
    }
    this.handles[last] = null;
  }

  update(time) {
    this.time = time;
    for (let i = this.n - 1; i >= 0; i--) if (time - this.handles[i].birth > this.handles[i].life) this._remove(i);
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
  }

  clear() { while (this.n > 0) this._remove(this.n - 1); this.mesh.count = 0; this.mesh.visible = false; }
}
```

### A.9 `src/game/vfx/ribbons.js`

```js
import * as THREE from 'three';

// =====================================================================================
//  Ribbons: projectile trails AND lightning bolts in ONE pre-allocated dynamic mesh.
//  96 ribbons x 16 points, camera-facing strips built on the CPU each frame (~3k vertices),
//  no allocation after boot (replaces the per-call Line2 + LineGeometry + LineMaterial).
//    trail(target, opts)  follows target.pos / target (Vector3-like, read every frame); when
//                         stopped (projectile died) the tail retracts into the last point.
//    bolt(from, to, opts) midpoint-displaced forked lightning: white core, element glow,
//                         dark ink edge (reads on sunlit ground), flickers, fades in ~0.18 s.
//  Vertex attributes: position, aSide = (u along 0 head..1 tail, side -1..1, alpha, style),
//                     aCol = (rgb, hdr). style 0 = soft eroding trail, 1 = bolt.
// =====================================================================================

const SEG = 16;
const VS = /* glsl */`
  attribute vec4 aSide; attribute vec4 aCol;
  varying vec4 vSide; varying vec4 vCol;
  void main() { vSide = aSide; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */`
  uniform sampler2D uNoise; uniform float uTime;
  varying vec4 vSide; varying vec4 vCol;
  void main() {
    float u = vSide.x, s = abs(vSide.y), a = vSide.z;
    if (a < 0.003) discard;
    if (vSide.w < 0.5) {
      float n = texture(uNoise, vec2(u * 1.5 - uTime * 1.3, vSide.y * 0.2 + 0.37)).r;
      float body = 1.0 - smoothstep(0.55, 1.0, s);
      float core = 1.0 - smoothstep(0.1, 0.38, s);
      float keep = smoothstep(-0.06, 0.06, n + 0.3 - u * 0.95);       // the tail breaks into flecks
      float m = body * keep * a;
      if (m < 0.003) discard;
      vec3 rgb = vCol.rgb * vCol.w * (0.5 + 1.0 * core * (1.0 - u));
      gl_FragColor = vec4(rgb * m, m * 0.45);
    } else {
      float core = 1.0 - smoothstep(0.16, 0.28, s);
      float glow = 1.0 - smoothstep(0.42, 0.6, s);
      float ink = 1.0 - smoothstep(0.82, 1.0, s);
      vec3 rgb = mix(vCol.rgb * vCol.w * glow, vec3(2.4), core);
      gl_FragColor = vec4(rgb * a, ink * a * 0.75);
    }
  }`;

const _c = new THREE.Color();
const _v = new THREE.Vector3();

export class RibbonSystem {
  constructor(scene, shared, camera, max = 96) {
    this.max = max;
    this.camera = camera;
    const nv = max * SEG * 2;
    this.pos = new Float32Array(nv * 3);
    this.side = new Float32Array(nv * 4);
    this.col = new Float32Array(nv * 4);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSide = new THREE.BufferAttribute(this.side, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSide', this.aSide);
    geo.setAttribute('aCol', this.aCol);
    const idx = new Uint32Array(max * (SEG - 1) * 6);
    let k = 0;
    for (let r = 0; r < max; r++) {
      for (let i = 0; i < SEG - 1; i++) {
        const a = (r * SEG + i) * 2;
        idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + 2;
        idx[k++] = a + 1; idx[k++] = a + 3; idx[k++] = a + 2;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: shared.noise }, uTime: shared.uTime },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, ...shared.blend,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.slots = [];
    for (let r = 0; r < max; r++) this.slots.push({ id: r, live: false, pts: new Float32Array(SEG * 3), n: 0, age: 0 });
    this.free = this.slots.slice().reverse();
    this.live = [];
    this.viewDir = new THREE.Vector3(1, 1.22, 1).normalize();
  }

  _alloc() {
    let s = this.free.pop();
    if (!s) { s = this.live.shift(); this._clearSlot(s); }   // steal the oldest
    s.live = true; s.n = 0; s.age = 0; s.stopped = false; s.retract = 0;
    this.live.push(s);
    return s;
  }
  _clearSlot(s) {
    const base = s.id * SEG * 2;
    for (let v = 0; v < SEG * 2; v++) this.side[(base + v) * 4 + 2] = 0;
    this.pos.fill(0, base * 3, (base + SEG * 2) * 3);
    s.live = false;
  }

  // target: Vector3 / {x,y,z} read every frame (e.g. projectile.pos). opts: { color, width, hdr, life (max s), segLen }
  trail(target, opts = {}) {
    const s = this._alloc();
    s.style = 0; s.target = target;
    s.width = opts.width ?? 0.35; s.hdr = opts.hdr ?? 1.5; s.segLen = opts.segLen ?? 0.3;
    s.life = opts.life ?? 30;
    _c.set(opts.color ?? 0xffffff); s.r = _c.r; s.g = _c.g; s.b = _c.b;
    s.pts[0] = target.x; s.pts[1] = target.y ?? 0.9; s.pts[2] = target.z;
    s.pts[3] = target.x; s.pts[4] = target.y ?? 0.9; s.pts[5] = target.z;
    s.n = 2;
    return { stop: () => { s.stopped = true; }, slot: s };
  }

  // Forked lightning. opts: { color, width, hdr, life, jag, branches }
  bolt(from, to, opts = {}) {
    const main = this._boltStrand(from, to, Math.min(SEG, 12), opts.jag ?? 0.55, opts.width ?? 0.45, opts);
    const nb = opts.branches ?? 2;
    for (let b = 0; b < nb; b++) {
      const at = 2 + Math.floor(Math.random() * 6);
      const o = at * 3;
      const p = { x: main.pts[o], y: main.pts[o + 1], z: main.pts[o + 2] };
      const len = 1.2 + Math.random() * 1.6;
      const a = Math.random() * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * len, y: Math.max(0.2, p.y - len * (0.6 + Math.random() * 0.6)), z: p.z + Math.sin(a) * len };
      this._boltStrand(p, q, 6, 0.3, (opts.width ?? 0.45) * 0.55, opts);
    }
  }

  _boltStrand(from, to, n, jag, width, opts) {
    const s = this._alloc();
    s.style = 1; s.target = null; s.stopped = true;
    s.width = width; s.hdr = opts.hdr ?? 1.6; s.life = opts.life ?? 0.18;
    _c.set(opts.color ?? 0xffe14a); s.r = _c.r; s.g = _c.g; s.b = _c.b;
    const fy = from.y ?? 1, ty = to.y ?? 1;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const j = Math.sin(Math.PI * t) * jag;
      s.pts[i * 3] = from.x + (to.x - from.x) * t + (Math.random() * 2 - 1) * j;
      s.pts[i * 3 + 1] = fy + (ty - fy) * t + (Math.random() * 2 - 1) * j * 0.5;
      s.pts[i * 3 + 2] = from.z + (to.z - from.z) * t + (Math.random() * 2 - 1) * j;
    }
    s.n = n;
    return s;
  }

  update(dt) {
    if (this.camera) { this.camera.getWorldDirection(this.viewDir); this.viewDir.negate(); }
    const V = this.viewDir;
    for (let li = this.live.length - 1; li >= 0; li--) {
      const s = this.live[li];
      s.age += dt;
      const P = s.pts;
      if (s.style === 0) {
        if (!s.stopped) {
          // move the head; push a new point once it travelled segLen
          const tx = s.target.x, ty = s.target.y ?? 0.9, tz = s.target.z;
          const dx = tx - P[3], dy = ty - P[4], dz = tz - P[5];
          if (dx * dx + dy * dy + dz * dz > s.segLen * s.segLen) {
            const m = Math.min(s.n, SEG - 1);
            P.copyWithin(3, 0, m * 3);
            s.n = Math.min(SEG, s.n + 1);
          }
          P[0] = tx; P[1] = ty; P[2] = tz;
          if (s.age > s.life) s.stopped = true;
        } else {
          // retract: drop tail points at ~60 pts/s, then free
          s.retract += dt * 60;
          while (s.retract >= 1 && s.n > 1) { s.n--; s.retract -= 1; }
          if (s.n <= 1) { this._release(li); continue; }
        }
      } else if (s.age > s.life) { this._release(li); continue; }
      this._build(s, V);
    }
    this.aPos.needsUpdate = this.aSide.needsUpdate = this.aCol.needsUpdate = true;
    this.mesh.visible = this.live.length > 0;
  }

  _release(li) {
    const s = this.live[li];
    this.live.splice(li, 1);
    this._clearSlot(s);
    this.free.push(s);
  }

  _build(s, V) {
    const P = s.pts, n = s.n, base = s.id * SEG * 2;
    let alpha = 1;
    if (s.style === 1) {
      const k = s.age / s.life;
      alpha = (s.age < 0.04 ? 1 : (Math.random() < 0.7 ? 1 : 0.25)) * (1 - k * k);
    }
    for (let i = 0; i < SEG; i++) {
      const v0 = (base + i * 2) * 4, v1 = v0 + 4;
      if (i >= n) {
        // collapse unused points onto the last one (zero-area quads, nothing rasterised)
        const p0 = (base + i * 2) * 3, q = (n - 1) * 3;
        for (let k = 0; k < 3; k++) { this.pos[p0 + k] = P[q + k]; this.pos[p0 + 3 + k] = P[q + k]; }
        this.side[v0 + 2] = 0; this.side[v1 + 2] = 0;
        continue;
      }
      const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
      _v.set(P[ia * 3] - P[ib * 3], P[ia * 3 + 1] - P[ib * 3 + 1], P[ia * 3 + 2] - P[ib * 3 + 2]);
      // side = tangent x view (camera-facing strip)
      let sx = _v.y * V.z - _v.z * V.y, sy = _v.z * V.x - _v.x * V.z, sz = _v.x * V.y - _v.y * V.x;
      const l = Math.hypot(sx, sy, sz) || 1;
      const u = n > 1 ? i / (n - 1) : 0;
      const w = s.style === 0 ? s.width * Math.pow(1 - u, 0.6) * 0.5 + 0.01 : s.width * 0.5;
      sx *= w / l; sy *= w / l; sz *= w / l;
      const p0 = (base + i * 2) * 3, p1 = p0 + 3;
      this.pos[p0] = P[i * 3] + sx; this.pos[p0 + 1] = P[i * 3 + 1] + sy; this.pos[p0 + 2] = P[i * 3 + 2] + sz;
      this.pos[p1] = P[i * 3] - sx; this.pos[p1 + 1] = P[i * 3 + 1] - sy; this.pos[p1 + 2] = P[i * 3 + 2] - sz;
      this.side[v0] = u; this.side[v0 + 1] = -1; this.side[v0 + 2] = alpha; this.side[v0 + 3] = s.style;
      this.side[v1] = u; this.side[v1 + 1] = 1; this.side[v1 + 2] = alpha; this.side[v1 + 3] = s.style;
      this.col[v0] = this.col[v1] = s.r; this.col[v0 + 1] = this.col[v1 + 1] = s.g;
      this.col[v0 + 2] = this.col[v1 + 2] = s.b; this.col[v0 + 3] = this.col[v1 + 3] = s.hdr;
    }
  }

  clear() { for (let li = this.live.length - 1; li >= 0; li--) this._release(li); this.mesh.visible = false; }
}
```

### A.10 `src/game/vfx/clouds.js`

```js
import * as THREE from 'three';

// =====================================================================================
//  Clouds: stacked low-poly puffs, toon-lit (2 bands from the real sun direction, darker
//  undersides), boiling vertex wobble, dark outline hull like the creatures, internal
//  lightning flash. 2 instanced draws for ALL clouds (body + hull). Opaque, so they never
//  sort against other transparents; see-through is a screen-door dither (per-cloud alpha),
//  which the VFX uses to fade a cloud whenever the player stands in its screen footprint.
// =====================================================================================

const BAYER = /* glsl */`
  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    // 4x4 Bayer matrix, row-major, /16
    float m = 0.0;
    if (i < 1.0) m = 0.0; else if (i < 2.0) m = 8.0; else if (i < 3.0) m = 2.0; else if (i < 4.0) m = 10.0;
    else if (i < 5.0) m = 12.0; else if (i < 6.0) m = 4.0; else if (i < 7.0) m = 14.0; else if (i < 8.0) m = 6.0;
    else if (i < 9.0) m = 3.0; else if (i < 10.0) m = 11.0; else if (i < 11.0) m = 1.0; else if (i < 12.0) m = 9.0;
    else if (i < 13.0) m = 15.0; else if (i < 14.0) m = 7.0; else if (i < 15.0) m = 13.0; else m = 5.0;
    return (m + 0.5) / 16.0;
  }`;

const VS = /* glsl */`
  attribute vec4 iCl0; attribute vec4 iCl1;   // lit rgb + flash, shadow rgb + alpha
  uniform float uTime; uniform float uOutline;
  varying vec3 vN; varying vec4 vC0; varying vec4 vC1;
  void main() {
    float ph = float(gl_InstanceID) * 1.73;
    vec3 p = position + normal * 0.06 * sin(uTime * 2.2 + position.y * 4.0 + position.x * 3.0 + ph);
    #ifdef HULL
      float s = length(instanceMatrix[0].xyz);
      p += normal * uOutline / max(s, 0.01);
    #endif
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    vN = normalize(mat3(instanceMatrix) * normal);
    vC0 = iCl0; vC1 = iCl1;
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }`;

const FS = /* glsl */`
  uniform vec3 uSunDir;
  varying vec3 vN; varying vec4 vC0; varying vec4 vC1;
  ${BAYER}
  void main() {
    if (vC1.a < 0.999 && vC1.a < bayer4(gl_FragCoord.xy)) discard;
    #ifdef HULL
      gl_FragColor = vec4(vC1.rgb * 0.26 + vec3(1.0, 0.97, 0.85) * vC0.a * 0.15, 1.0);
    #else
      vec3 n = normalize(vN);
      float lit = smoothstep(0.02, 0.1, dot(n, uSunDir));
      float under = smoothstep(-0.15, -0.55, n.y);
      vec3 col = mix(vC1.rgb, vC0.rgb, lit) * (1.0 - 0.3 * under);
      col += vec3(1.0, 0.95, 0.75) * vC0.a * (0.45 - 0.25 * under);  // flash from inside (underside stays darker)
      gl_FragColor = vec4(col, 1.0);
    #endif
  }`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _c = new THREE.Color();

export const CLOUD_STYLE = {
  snow:  { lit: 0xf4f8ff, shadow: 0x9fb4d0, puffs: 7 },
  storm: { lit: 0x9aa3b8, shadow: 0x4a5266, puffs: 10 },
  ash:   { lit: 0x8c7f78, shadow: 0x4a3f3a, puffs: 8 },
};

export class CloudSystem {
  constructor(scene, shared, cap = 160) {
    this.cap = cap;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.a0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iCl0', this.a0);
    geo.setAttribute('iCl1', this.a1);
    // sun direction (toward the sun) from engine.js SUN_OFFSET
    const sun = new THREE.Vector3(-12, 34, 24).normalize();
    const common = { uTime: shared.uTime, uSunDir: { value: sun }, uOutline: { value: 0.06 }};
    this.uniforms = common;
    this.body = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: common, vertexShader: VS, fragmentShader: FS }), cap);
    this.hull = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: common, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, defines: { HULL: 1 } }), cap);
    this.hull.instanceMatrix = this.body.instanceMatrix;     // one upload drives both
    for (const m of [this.body, this.hull]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; m.visible = false;
      scene.add(m);
    }
    this.clouds = [];
  }

  // opts: { radius (m), height (m), style: 'snow'|'storm'|'ash', life, puffs, back (m: push the cloud up-screen,
  // along engine.forward, so it does not cover the zone it rains on) }
  add(pos, opts = {}) {
    const back = (opts.back ?? 0) * 0.7071;
    const st = CLOUD_STYLE[opts.style ?? 'snow'];
    const R = opts.radius ?? 3;
    const n = opts.puffs ?? st.puffs;
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const rr = i === 0 ? 0 : R * (0.35 + Math.random() * 0.45);
      const big = i === 0 ? 1.25 : 0.75 + Math.random() * 0.45;
      puffs.push({ a, rr, y: (Math.random() * 2 - 1) * 0.35 + (i === 0 ? 0.35 : 0), s: R * 0.36 * big, delay: i * 0.035 });
    }
    const c = {
      pos: { x: pos.x - back, y: opts.height ?? 4.5, z: pos.z - back }, R, puffs, st,
      age: 0, life: opts.life ?? 4, flashV: 0, alpha: 1, spin: (Math.random() < 0.5 ? -1 : 1) * 0.12, dead: false,
      flash(k = 1) { this.flashV = Math.max(this.flashV, k); },
      end() { this.life = Math.min(this.life, this.age + 0.35); },
    };
    this.clouds.push(c);
    return c;
  }

  // focus: ground point that must stay visible (player). A point at height h on the iso camera covers
  // the ground ~1.16 h further up-screen (camera elevation 40.8 deg), along engine.forward (-1,0,-1)/sqrt2.
  update(dt, focus) {
    const inst = this.body.instanceMatrix.array, A0 = this.a0.array, A1 = this.a1.array;
    let k = 0;
    for (let ci = this.clouds.length - 1; ci >= 0; ci--) {
      const c = this.clouds[ci];
      c.age += dt;
      if (c.age >= c.life) { this.clouds.splice(ci, 1); continue; }
      c.flashV *= Math.exp(-dt * 16);
      let want = 1;
      if (focus) {
        const off = 1.16 * c.pos.y * 0.7071;
        const gx = c.pos.x - off, gz = c.pos.z - off;
        const d = Math.hypot(focus.x - gx, focus.z - gz);
        want = d < c.R + 1.5 ? 0.45 : 1;
      }
      c.alpha += (want - c.alpha) * (1 - Math.exp(-dt * 6));
      const out = Math.min(1, (c.life - c.age) / 0.35);
      _c.set(c.st.lit); const lr = _c.r, lg = _c.g, lb = _c.b;
      _c.set(c.st.shadow);
      for (const p of c.puffs) {
        if (k >= this.cap) break;
        const g = Math.min(1, Math.max(0, (c.age - p.delay) / 0.3));
        const back = 1 + 2.2 * Math.pow(g - 1, 3) + 1.2 * Math.pow(g - 1, 2);   // easeOutBack
        const s = p.s * Math.max(0, back) * out;
        const a = p.a + c.age * c.spin;
        _p.set(c.pos.x + Math.cos(a) * p.rr, c.pos.y + p.y, c.pos.z + Math.sin(a) * p.rr);
        _e.set(0, a, 0); _q.setFromEuler(_e);
        _s.set(s, s * 0.62, s);
        _m.compose(_p, _q, _s).toArray(inst, k * 16);
        const o = k * 4;
        A0[o] = lr; A0[o + 1] = lg; A0[o + 2] = lb; A0[o + 3] = c.flashV;
        A1[o] = _c.r; A1[o + 1] = _c.g; A1[o + 2] = _c.b; A1[o + 3] = c.alpha;
        k++;
      }
    }
    for (const m of [this.body, this.hull]) { m.count = k; m.visible = k > 0; }
    if (k > 0) { this.body.instanceMatrix.needsUpdate = true; this.a0.needsUpdate = true; this.a1.needsUpdate = true; }
  }

  clear() { this.clouds.length = 0; for (const m of [this.body, this.hull]) { m.count = 0; m.visible = false; } }
}
```

### A.11 `src/game/vfx/status.js`

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// =====================================================================================
//  Status overlays for hundreds of GPU-instanced creatures.
//    Frozen   ONE instanced crystal-cluster shell (+ dark hull) per frozen enemy: grows in with
//             overshoot, toon-faceted translucent ice, shatters into ice debris on thaw.
//    Burning  flame-tongue particles licking off the body, round-robin under a global budget
//             (BURN_RATE spawns/s shared by all burning enemies) + the rig shader's ember glow.
//    Shocked  tiny 5-point arcs across the body through the ribbon pool (SHOCK_RATE arcs/s total).
//  The cheap always-on part (frost dusting, frozen tint, burn glow, shock flicker) belongs in
//  the rig shader (see 08-spell-vfx-tech.md §5: iStat attribute patch for creatures/).
//  Reads enemy fields: dead, pos, status.{frozen, burn, shock}, topY, baseRadius|radius, visScale.
// =====================================================================================

const BURN_RATE = 360;        // flame particles per second, all enemies together
const SHOCK_RATE = 30;        // arcs per second, all enemies together

function iceClusterGeometry() {
  // a faceted block that ENCLOSES the body (jittered icosahedron) + crystals jutting out of it
  const parts = [];
  const block = new THREE.IcosahedronGeometry(1, 0);
  const pa = block.getAttribute('position');
  const jit = new Map();
  for (let i = 0; i < pa.count; i++) {
    const k = `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
    if (!jit.has(k)) jit.set(k, 0.9 + 0.2 * (((i * 7919) % 97) / 97));
    const s = jit.get(k);
    pa.setXYZ(i, pa.getX(i) * s, pa.getY(i) * s, pa.getZ(i) * s);
  }
  block.scale(1, 1.45, 1).translate(0, 1.25, 0);
  parts.push(block);
  const add = (sx, sy, x, y, z, tx, tz) => {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(sx, sy, sx);
    g.rotateX(tx); g.rotateZ(tz);
    g.translate(x, y, z);
    parts.push(g);
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const y = i % 2 ? 1.5 : 0.35;
    add(0.22, 0.55, Math.cos(a) * 0.85, y, Math.sin(a) * 0.85, Math.sin(a) * 0.7, -Math.cos(a) * 0.7);
  }
  add(0.2, 0.5, 0.1, 2.25, 0, 0.2, 0.1);
  const g = mergeGeometries(parts);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const sxz = 1 / Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
  g.translate(0, -bb.min.y, 0);
  g.scale(sxz, 1 / (bb.max.y - bb.min.y), sxz);      // xz in [-1,1], y in [0,1]
  g.computeVertexNormals();
  return g;
}

const ICE_VS = /* glsl */`
  attribute vec2 iIce;          // freeze time, seed
  uniform float uTime; uniform float uOutline;
  varying vec3 vN;
  void main() {
    float k = clamp((uTime - iIce.x) / 0.14, 0.0, 1.0);
    float g = 1.0 + 2.7 * pow(k - 1.0, 3.0) + 1.7 * pow(k - 1.0, 2.0);   // easeOutBack
    vec3 p = position * g;
    #ifdef HULL
      float s = length(instanceMatrix[0].xyz);
      p += normal * uOutline / max(s, 0.01);
    #endif
    vN = normalMatrix * (mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const ICE_FS = /* glsl */`
  uniform vec3 uSunV;
  varying vec3 vN;
  void main() {
    #ifdef HULL
      gl_FragColor = vec4(0.07, 0.18, 0.3, 1.0);
    #else
      vec3 n = normalize(vN);
      float ndl = dot(n, uSunV);
      float band = ndl > 0.45 ? 1.0 : (ndl > 0.0 ? 0.62 : 0.32);       // 3 hard facet bands
      vec3 col = mix(vec3(0.3, 0.58, 0.85), vec3(0.88, 0.98, 1.0), band);
      float fres = pow(1.0 - abs(n.z), 2.0);
      col = mix(col, vec3(0.92, 0.99, 1.0), fres * 0.6);           // stays <= 1.0: status ice never blooms
      float a = 0.42 + 0.4 * fres;
      gl_FragColor = vec4(col * a, a);                                  // premultiplied
    #endif
  }`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _sunW = new THREE.Vector3(-12, 34, 24).normalize();

export class StatusVFX {
  constructor(vfx, cap = 384) {
    this.vfx = vfx;
    this.cap = cap;
    const geo = iceClusterGeometry();
    this.iIce = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iIce', this.iIce);
    const u = { uTime: vfx.uTime, uOutline: { value: 0.05 }, uSunV: { value: new THREE.Vector3() } };
    this.u = u;
    const front = new THREE.ShaderMaterial({ uniforms: u, vertexShader: ICE_VS, fragmentShader: ICE_FS,
      transparent: true, depthWrite: false, ...vfx.blend });
    const hull = new THREE.ShaderMaterial({ uniforms: u, vertexShader: ICE_VS, fragmentShader: ICE_FS, side: THREE.BackSide, defines: { HULL: 1 } });
    this.ice = new THREE.InstancedMesh(geo, front, cap);
    this.hull = new THREE.InstancedMesh(geo, hull, cap);
    this.hull.instanceMatrix = this.ice.instanceMatrix;
    for (const m of [this.ice, this.hull]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; m.visible = false;
      vfx.scene.add(m);
    }
    this.ice.renderOrder = 7;
    this.frozenAt = new Map();      // enemy -> freeze time
    this.burnAcc = 0; this.burnRR = 0;
    this.shockAcc = 0; this.shockRR = 0;
    this._burning = []; this._shocked = [];
  }

  update(dt, enemies, camera) {
    const vfx = this.vfx, now = vfx.time;
    if (camera) this.u.uSunV.value.copy(_sunW).transformDirection(camera.matrixWorldInverse);
    const inst = this.ice.instanceMatrix.array, ia = this.iIce.array;
    let n = 0;
    this._burning.length = 0; this._shocked.length = 0;
    for (const e of enemies) {
      if (e.dead || e.inert || !e.status) continue;
      const st = e.status, sc = e.visScale ?? 1;
      if (st.frozen > 0) {
        let t0 = this.frozenAt.get(e);
        if (t0 === undefined) { t0 = now; this.frozenAt.set(e, t0); vfx.emit('frostGlint', { x: e.pos.x, y: (e.topY ?? 1.5) * 0.6, z: e.pos.z }, { count: 2 }); }
        if (n < this.cap) {
          const rad = Math.max(0.45, (e.baseRadius ?? e.radius ?? 0.5) * 1.45) * sc;
          const h = Math.max(0.9, (e.topY ?? 1.5) * 1.08) * sc;
          _q.setFromAxisAngle(_up, (t0 * 7.3) % 6.283);
          _m.compose(_p.set(e.pos.x, 0, e.pos.z), _q, _s.set(rad, h, rad)).toArray(inst, n * 16);
          ia[n * 2] = t0; ia[n * 2 + 1] = 0;
          n++;
        }
      }
      if (st.burn > 0) this._burning.push(e);
      if (st.shock > 0) this._shocked.push(e);
    }
    // thaw / death: shatter the shell
    for (const [e, t0] of this.frozenAt) {
      if (e.dead || !(e.status?.frozen > 0)) {
        this.frozenAt.delete(e);
        vfx.impact('shatter', { x: e.pos.x, y: 0, z: e.pos.z }, { scale: Math.max(0.8, (e.topY ?? 1.5) / 1.5) });
      }
    }
    for (const m of [this.ice, this.hull]) { m.count = n; m.visible = n > 0; }
    if (n > 0) { this.ice.instanceMatrix.needsUpdate = true; this.iIce.needsUpdate = true; }

    // burning: global flame budget, round-robin so every burning enemy flickers
    const B = this._burning;
    if (B.length) {
      // <= 10 flames / s per enemy, <= BURN_RATE / s in total
      this.burnAcc += Math.min(BURN_RATE, 10 * B.length) * dt * vfx.budget();
      const spawns = Math.floor(this.burnAcc);
      this.burnAcc -= spawns;
      for (let k = 0; k < spawns; k++) {
        const e = B[this.burnRR++ % B.length];
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc, r = (e.baseRadius ?? e.radius ?? 0.5) * sc * 0.7;
        const a = Math.random() * 6.283;
        vfx.emit('flameLick', { x: e.pos.x + Math.cos(a) * r, y: top * (0.25 + Math.random() * 0.6), z: e.pos.z + Math.sin(a) * r }, { count: 1, scale: 1.25 * sc });
      }
    } else this.burnAcc = 0;

    // shocked: a few arcs per second across random shocked bodies
    const S = this._shocked;
    if (S.length) {
      this.shockAcc += SHOCK_RATE * dt;
      while (this.shockAcc >= 1) {
        this.shockAcc -= 1;
        const e = S[this.shockRR++ % S.length];
        const sc = e.visScale ?? 1, top = (e.topY ?? 1.5) * sc, r = (e.baseRadius ?? e.radius ?? 0.5) * sc;
        const a = Math.random() * 6.283;
        vfx.ribbons._boltStrand(
          { x: e.pos.x + Math.cos(a) * r, y: top * (0.3 + Math.random() * 0.5), z: e.pos.z + Math.sin(a) * r },
          { x: e.pos.x - Math.cos(a) * r, y: top * (0.3 + Math.random() * 0.5), z: e.pos.z - Math.sin(a) * r },
          5, 0.2, 0.16, { color: 0xffe14a, life: 0.12, hdr: 1.6 });
      }
    } else this.shockAcc = 0;
  }

  clear() { this.frozenAt.clear(); for (const m of [this.ice, this.hull]) { m.count = 0; m.visible = false; } }
}
```

### A.12 Creature rig patch (status channel; anchor-based, apply to the current files)

Also update the `iMisc` comment in `rig.js` to `iMisc = (elite 0/1, burn, cold, shock)`.

```diff
--- a/src/game/creatures/rig.js
+++ b/src/game/creatures/rig.js
@@ -289,6 +289,11 @@
 varying vec4 vFx;
 varying vec4 vRim;
 varying vec4 vAcc;
+varying vec3 vStat;     // status looks: burn, cold (chill <1, frozen = 1), shock  (iMisc.yzw)
+varying float vUpN;     // world-space normal.y (frost dusting on up-facing facets)
+varying float vRigY;    // model-space height (burn bands creep up the body)
+varying float vZap;     // shock flicker on/off (per instance)
+uniform float rigTime;  // seconds (renderer.js RIG_TIME); unset (0) in the depth / hull variants
 mat4 rigBone() {
   int x = int(aRig.x + 0.5) * 4;
   int y = gl_InstanceID;
@@ -301,6 +306,11 @@
 
 const FRAG_HEAD = /* glsl */`
 uniform vec4 rigRim;
+uniform float rigTime;
+varying vec3 vStat;
+varying float vUpN;
+varying float vRigY;
+varying float vZap;
 varying float vEmis;
 varying float vTrim;
 varying float vElite;
@@ -315,6 +325,7 @@
   mat.onBeforeCompile = (sh) => {
     sh.uniforms.boneTex = uniforms.boneTex;
     sh.uniforms.rigRim = uniforms.rigRim;
+    sh.uniforms.rigTime = uniforms.rigTime;
     sh.vertexShader = sh.vertexShader
       .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
       .replace('#include <beginnormal_vertex>', /* glsl */`#include <beginnormal_vertex>
@@ -326,11 +337,23 @@
         vEmis = aRig.y;
         vTrim = (aRig.z > 0.5 && iMisc.x > 0.5) ? 1.0 : 0.0;
         vElite = iMisc.x;
-        vFx = iFx; vRim = iRim; vAcc = iAcc;`);
+        vFx = iFx; vRim = iRim; vAcc = iAcc;
+        vStat = iMisc.yzw;
+        vRigY = transformed.y;
+        vUpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
+        // shock: whole-body 24 Hz on/off flicker, de-synchronised per instance
+        vZap = step(0.55, fract(sin(floor(rigTime * 24.0) * 12.9898 + float(gl_InstanceID) * 78.233) * 43758.5453));`);
     sh.fragmentShader = sh.fragmentShader
       .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
       .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
-        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.7, 0.16), vTrim);`)
+        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.7, 0.16), vTrim);
+        // ---- status looks (cheap, always on; the overlays in vfx/status.js add shells and flames)
+        float rigFrozen = step(0.99, vStat.y);
+        float rigFrost = smoothstep(0.35, 0.75, vUpN) * clamp(vStat.y * 1.6, 0.0, 1.0);
+        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), rigFrost);          // frost on heads and shoulders
+        float rigLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
+        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.72, 0.95) * (0.55 + rigLum), 0.6 * rigFrozen);
+        diffuseColor.rgb *= 1.0 - 0.35 * vStat.x;                                            // charred`)
       .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
       {
         vec3 rigV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
@@ -346,9 +369,15 @@
         totalEmissiveRadiance += vFx.rgb;
         totalEmissiveRadiance += rigRim.rgb * rigRim.a * rigF * matte;
         totalEmissiveRadiance += vRim.rgb * vRim.a * rigF;
+        // burn: ember bands creeping up the lower body; shock: hard 24 Hz flicker on the rim; frozen: cold fresnel
+        float rigFlick = 0.5 + 0.5 * sin(vRigY * 9.0 - rigTime * 11.0);
+        float rigLow = 1.0 - smoothstep(0.2, 1.4, vRigY);
+        totalEmissiveRadiance += vec3(1.0, 0.38, 0.08) * vStat.x * (0.04 + 0.4 * rigFlick * rigLow * rigLow);
+        totalEmissiveRadiance += vec3(1.0, 0.9, 0.35) * vStat.z * vZap * (0.12 + rigF * 1.4);
+        totalEmissiveRadiance += vec3(0.55, 0.85, 1.0) * rigF * 0.8 * rigFrozen;
       }`);
   };
-  mat.customProgramCacheKey = () => 'rig-color-v3';
+  mat.customProgramCacheKey = () => 'rig-color-v4';
 }
 
 function patchDepthMaterial(mat, uniforms) {
--- a/src/game/creatures/renderer.js
+++ b/src/game/creatures/renderer.js
@@ -32,6 +32,7 @@
 const _pos = new THREE.Vector3();
 const _scl = new THREE.Vector3();
 const _col = new THREE.Color();
+const RIG_TIME = { value: 0 };   // shared rigTime uniform (status flicker in the rig shader)
 
 function blobTexture() {
   const c = document.createElement('canvas');
@@ -53,7 +54,7 @@
     this.scene = scene;
     this.def = def;
     this.handles = [];
-    this.uniforms = { boneTex: { value: null }, rigRim: rimUniform, rigOutline: outlineUniform };
+    this.uniforms = { boneTex: { value: null }, rigRim: rimUniform, rigOutline: outlineUniform, rigTime: RIG_TIME };
     const mats = makeRigMaterials(this.uniforms, def.spec.material);
     this.material = mats.color;
     this.depthMaterial = mats.depth;
@@ -247,6 +248,7 @@
 
   update(dt, time) {
     this.time = time;
+    RIG_TIME.value = time % 1000;
     const cam = this.camera;
     if (cam && cam.isOrthographicCamera) this.outline.value = this.outlinePx * (cam.top - cam.bottom) / (cam.zoom * Math.max(1, innerHeight));
     const s = this._s;
@@ -337,6 +339,9 @@
         if (h.accent) { acc[o] = h.accent[0]; acc[o + 1] = h.accent[1]; acc[o + 2] = h.accent[2]; acc[o + 3] = h.accent[3]; }
         else acc[o + 3] = 0;
         misc[o] = h.elite ? 1 : 0;
+        // status looks: h.stat = [burn 0..1, cold 0..1 (1 = frozen), shock 0..1] or null
+        const st = h.dying > 0 ? null : h.stat;
+        misc[o + 1] = st ? st[0] : 0; misc[o + 2] = st ? st[1] : 0; misc[o + 3] = st ? st[2] : 0;
         const c = h.color;
         const dk = h.dying > 0 ? 1 - 0.35 * Math.min(1, h.dying / (h.def.spec.deathTime ?? DEATH_TIME)) : 1;
         col[i * 3] = c[0] * dk; col[i * 3 + 1] = c[1] * dk; col[i * 3 + 2] = c[2] * dk;
```

---

## Appendix B: verification harness (dev only)

Serve the repo, then put `dev/vfx.html` next to `src/` and point the import at `../src/game/vfx/index.js`. Open `?scene=blizzard|meteor|vortex|storm|status|rig|decals|debris|particles|trails|stress|all&t=1.2&zoom=1.6&ground=grass|sand|barrens`. The page simulates synchronously to `t`, then renders once, which also works in the hidden pane. It logs `{errors, calls, vfxDraws, vfxUpdateAvgMs, alive}` into `#log`.

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>vfx test</title>
<style>html,body{margin:0;background:#000;overflow:hidden}#log{position:absolute;left:0;top:0;color:#fff;font:10px monospace;white-space:pre;display:none}</style>
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }
</script></head>
<body><pre id="log"></pre>
<script type="module" src="./test.js"></script>
</body></html>
```

```js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VFX } from './vfx/index.js';
import { CreatureRenderer } from './game/creatures/renderer.js';
import { REGISTER as GREEN } from './game/creatures/greenskins.js';
const ticks = [];

const Q = new URLSearchParams(location.search);
const SCENE = Q.get('scene') ?? 'all';
const T = parseFloat(Q.get('t') ?? '1.2');
const ZOOM = parseFloat(Q.get('zoom') ?? '1.4');
const GROUND = Q.get('ground') ?? 'grass';
const log = { scene: SCENE, t: T, errors: [], warnings: [] };
const origErr = console.error, origWarn = console.warn;
console.error = (...a) => { log.errors.push(a.map(String).join(' ').slice(0, 1500)); origErr(...a); };
console.warn = (...a) => { log.warnings.push(a.map(String).join(' ').slice(0, 400)); origWarn(...a); };
addEventListener('error', (e) => log.errors.push('window: ' + e.message));

const W = 1280, H = 720;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  log.errors.push('SHADER: ' + (gl.getShaderInfoLog(vs) || '') + ' | ' + (gl.getShaderInfoLog(fs) || '') + ' | ' + (gl.getProgramInfoLog(program) || ''));
};
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb5d6b8);
const cam = new THREE.OrthographicCamera(-12 * W / H, 12 * W / H, 12, -12, 0.1, 400);
cam.position.copy(new THREE.Vector3(1, 1.22, 1).normalize().multiplyScalar(120));
cam.lookAt(0, 0, 0);
cam.zoom = ZOOM; cam.updateProjectionMatrix();
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x5f7034, 1.2));
const sun = new THREE.DirectionalLight(0xfff0d6, 3.15);
sun.position.copy(new THREE.Vector3(-12, 34, 24).normalize().multiplyScalar(80));
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 20, far: 150 });
sun.shadow.intensity = 0.85; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const groundCol = GROUND === 'sand' ? 0xd9c9a0 : GROUND === 'barrens' ? 0xc0703a : 0x5f8f3a;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: groundCol }));
ground.receiveShadow = true;
scene.add(ground);
// a few grass tufts / rocks for scale
for (let i = 0; i < 60; i++) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), new THREE.MeshLambertMaterial({ color: GROUND === 'grass' ? 0x4f7f2a : 0xb8a578 }));
  m.position.set((Math.random() - 0.5) * 30, 0.2, (Math.random() - 0.5) * 30);
  scene.add(m);
}

// dummy enemies (capsule bodies) with statuses
const enemies = [];
const bodyGeo = new THREE.CapsuleGeometry(0.38, 0.8, 4, 8);
function enemy(x, z, status = {}) {
  const m = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x8aa83c }));
  m.position.set(x, 0.78, z); m.castShadow = true;
  const hull = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x15121a, side: THREE.BackSide }));
  hull.scale.setScalar(1.07); m.add(hull);
  scene.add(m);
  const e = { pos: new THREE.Vector3(x, 0, z), dead: false, inert: false, topY: 1.6, baseRadius: 0.45, visScale: 1,
    status: { frozen: 0, burn: 0, shock: 0, ...status }, mesh: m };
  enemies.push(e);
  return e;
}

const game = { scene, camera: cam, engine: { camera: cam }, player: { pos: new THREE.Vector3(-9, 0, 9) }, enemies };
const tBoot = performance.now();
const vfx = new VFX(game);
log.bootMs = +(performance.now() - tBoot).toFixed(1);
game.vfx = vfx;

// player marker
const pl = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0x3a6ad0 }));
pl.position.set(game.player.pos.x, 0.85, game.player.pos.z); pl.castShadow = true; scene.add(pl);

// ------------------------------------------------------------------ scenarios
const events = [];      // [time, fn]
const at = (t, fn) => events.push([t, fn]);
const projectiles = [];
function projectile(x, z, dx, dz, speed, color, t0) {
  at(t0, () => {
    const p = { pos: new THREE.Vector3(x, 0.9, z), dx, dz, speed, life: 1.4 };
    p.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8) }));
    scene.add(p.mesh);
    p.trail = vfx.trail(p.pos, { color, width: 0.45, hdr: 1.5 });
    projectiles.push(p);
  });
}

let storm = null, vort = null;
const S = SCENE;
if (S === 'blizzard' || S === 'all') {
  const c = S === 'all' ? { x: -6, z: -4 } : { x: 0, z: 0 };
  at(0, () => vfx.zone('blizzard', c, { radius: 3.5, life: 4 }));
  enemy(c.x + 1, c.z + 0.5, { frozen: 2 }); enemy(c.x - 1.4, c.z - 0.6, {}); enemy(c.x + 0.2, c.z - 1.8, { frozen: 2 });
}
if (S === 'meteor' || S === 'all') {
  const c = S === 'all' ? { x: 5, z: -5 } : { x: 0, z: 0 };
  at(0, () => vfx.zone('meteor', c, { radius: 3.2 }));
  enemy(c.x + 2.5, c.z + 1, { burn: 3 }); enemy(c.x - 2.2, c.z + 1.2, { burn: 3 });
}
if (S === 'vortex' || S === 'all') {
  const c = S === 'all' ? { x: 6, z: 5 } : { x: 0, z: 0 };
  at(0, () => { vort = vfx.zone('vortex', c, { radius: 5, life: 2.5 }); });
  enemy(c.x + 1.5, c.z, {}); enemy(c.x - 1, c.z + 1.4, { shock: 3 });
}
if (S === 'storm' || S === 'all') {
  const c = S === 'all' ? { x: -5, z: 6 } : { x: 0, z: 0 };
  const a = enemy(c.x + 1.2, c.z + 0.4, { shock: 3 }), b = enemy(c.x - 1.5, c.z - 1, { shock: 3 }), d = enemy(c.x + 0.3, c.z - 2, {});
  at(0, () => { storm = vfx.zone('storm', c, { radius: 4, life: 5 }); });
  at(0.6, () => storm.strike(a.pos)); at(T - 0.08, () => storm.strike(b.pos)); at(T - 0.03, () => storm.strike(d.pos));
}
if (S === 'status') {
  for (let i = 0; i < 24; i++) {
    const x = (i % 6) * 2.2 - 5.5, z = Math.floor(i / 6) * 2.2 - 3.3;
    enemy(x, z, i % 3 === 0 ? { frozen: 2 } : i % 3 === 1 ? { burn: 3 } : { shock: 3 });
  }
}
if (S === 'trails' || S === 'all') {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    projectile(0, 0, Math.cos(a), Math.sin(a), 14, [0xff6a1f, 0x66d9ff, 0xb67cff, 0xffe14a][i % 4], T - 0.6 + (i % 3) * 0.05);
  }
}
if (S === 'debris') {
  at(0.0, () => { vfx.debris('rock', { x: 0, z: 0 }, 14); vfx.debris('ember', { x: 0, z: 0 }, 10); vfx.debris('ice', { x: 3, z: 0 }, 12); vfx.debris('crystal', { x: -3, z: 0 }, 12); });
  at(0.0, () => { for (let i = 0; i < 6; i++) vfx.sprout('iceSpike', { x: -2 + i * 0.8, z: 3 }, { life: 3 }); });
}
if (S === 'decals') {
  at(0, () => {
    vfx.decal('frost', { x: -8, z: 0 }, 3, 10); vfx.decal('scorch', { x: -2, z: -5 }, 2.5, 10);
    vfx.decal('rune', { x: 4, z: -1 }, 3, 10); vfx.decal('crater', { x: -2, z: 4 }, 2.2, 10);
    vfx.decal('wet', { x: 6, z: 6 }, 2.5, 10); vfx.decal('shadow', { x: 8, z: -6 }, 3, 10);
  });
}
if (S === 'particles') {
  const names = ['snowflake', 'flameLick', 'smoke', 'fireball', 'iceChip', 'runeGlyph', 'sparkStar', 'frostGlint', 'ember', 'dustRing', 'spark', 'coldFog'];
  names.forEach((n, i) => {
    const x = (i % 4) * 4 - 6, z = Math.floor(i / 4) * 4 - 4;
    at(T - 0.12, () => vfx.emit(n, { x, y: 0.8, z }, { count: n === 'coldFog' ? 3 : 8, speed: 0.4 }));
  });
}
if (S === 'stress') {
  for (let k = 0; k < 10; k++) at(0, () => vfx.zone(k % 2 ? 'blizzard' : 'vortex', { x: (k % 5) * 6 - 12, z: Math.floor(k / 5) * 8 - 4 }, { radius: 3.5, life: 10 }));
  for (let i = 0; i < 300; i++) enemy((Math.random() - 0.5) * 36, (Math.random() - 0.5) * 22, [{ frozen: 9 }, { burn: 9 }, { shock: 9 }, {}][i % 4]);
  for (let i = 0; i < 40; i++) projectile(0, 0, Math.cos(i), Math.sin(i), 14, 0xff6a1f, (i % 20) * 0.05 + 0.5);
  for (let i = 0; i < 20; i++) at(0.3 + i * 0.05, () => vfx.impact('meteorImpact', { x: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 12 }, { radius: 3 }));
}
if (S === 'rig') {
  const cr = new CreatureRenderer(scene, cam);
  const kinds = ['husk', 'brute', 'spitter', 'imp'];
  const stats = [null, [1, 0, 0], [0, 0.5, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 20; i++) {
    const def = GREEN[kinds[i % 4]];
    const x = (i % 5) * 2.6 - 5.2, z = Math.floor(i / 5) * 2.6 - 4;
    const h = cr.add(def, { pos: new THREE.Vector3(x, 0, z), yaw: 0.8 });
    const s = stats[i % 5];
    h.stat = s;
    enemies.push({ pos: h.pos, dead: false, topY: 1.4, baseRadius: def.id === 'brute' ? 0.8 : 0.45, visScale: 1,
      status: { frozen: s && s[1] >= 1 ? 9 : 0, burn: s && s[0] > 0 ? 9 : 0, shock: s && s[2] > 0 ? 9 : 0 }, mesh: { visible: true } });
  }
  ticks.push((dt, t) => cr.update(dt, t));
}
events.sort((a, b) => a[0] - b[0]);

// ------------------------------------------------------------------ simulate to T
const dt = 1 / 60;
let t = 0, ei = 0, updMs = 0, updN = 0, maxMs = 0;
while (t < T - 1e-6) {
  while (ei < events.length && events[ei][0] <= t + 1e-6) events[ei++][1]();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.pos.x += p.dx * p.speed * dt; p.pos.z += p.dz * p.speed * dt; p.life -= dt;
    p.mesh.position.copy(p.pos);
    if (p.life <= 0) { p.trail.stop(); scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
  for (const e of enemies) e.mesh.visible = true;
  for (const f of ticks) f(dt, t);
  const t0 = performance.now();
  vfx.update(dt);
  const ms = performance.now() - t0;
  if (t > 0.25) { updMs += ms; updN++; maxMs = Math.max(maxMs, ms); }
  t += dt;
}
while (ei < events.length && events[ei][0] <= t + 1e-6) events[ei++][1]();

// draw-call count of the scene itself (no post)
renderer.info.autoReset = false;
renderer.info.reset();
renderer.render(scene, cam);
log.calls = renderer.info.render.calls;
log.triangles = renderer.info.render.triangles;
let vfxCalls = 0;
scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && o.name.startsWith('vfx')) vfxCalls++; });
log.vfxUpdateAvgMs = updN ? +(updMs / updN).toFixed(3) : 0;
log.vfxUpdateMaxMs = +maxMs.toFixed(3);
log.alive = {
  paintSpawned: vfx.paint.spawned, glowSpawned: vfx.glow.spawned,
  shells: Object.fromEntries(Object.entries(vfx.shells.pools).map(([k, p]) => [k, p.n])),
  decals: vfx.decals.n, ribbons: vfx.ribbons.live.length, clouds: vfx.clouds.clouds.length,
  debris: Object.fromEntries(Object.entries(vfx.debrisSys.pools).map(([k, p]) => [k, p.n])),
  ice: vfx.status.ice.count,
};
renderer.info.autoReset = true;
{
  const ms = [vfx.paint.mesh, vfx.glow.mesh, ...Object.values(vfx.debrisSys.pools).map((p) => p.mesh), ...Object.values(vfx.shells.pools).map((p) => p.mesh),
    vfx.decals.mesh, vfx.ribbons.mesh, vfx.clouds.body, vfx.clouds.hull, vfx.status.ice, vfx.status.hull];
  log.vfxDraws = ms.filter((m) => m.visible).length;
  log.vfxShadowDraws = ms.filter((m) => m.visible && m.castShadow).length;
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.35, 1.1);
bloom.highPassUniforms.smoothWidth.value = 0.35;
bloom.materialHighPassFilter.fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity;
  uniform float luminosityThreshold; uniform float smoothWidth; varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float v = max(texel.r, max(texel.g, texel.b));
    float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
    vec3 excess = texel.rgb * clamp((v - luminosityThreshold) / max(v, 1e-4), 0.0, 1.0);
    gl_FragColor = vec4(mix(defaultColor, excess, alpha), mix(defaultOpacity, texel.a, alpha));
  }`;
bloom.materialHighPassFilter.needsUpdate = true;
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.render();
const gl = renderer.getContext();
log.glError = gl.getError();
log.renderer = gl.getParameter(gl.VERSION);
document.getElementById('log').textContent = JSON.stringify(log);
document.title = 'DONE';
```

---

## Sources

**Stylized VFX practice**
- Riot Games, *LoL VFX style guide* (original post, now redirected): https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/. Digest: VFX Apprentice, *10 LoL VFX design tips*: https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips
- Stefan Jevremović (Nordeus), *VFX staples: shape, colour and motion*: https://80.lv/articles/vfx-staples-shape-color-and-motion/
- Simon Trümpler, *Stylized VFX in RiME*: https://simonschreibt.de/gat/stylized-vfx-in-rime/ and https://www.unrealengine.com/events/unreal-fest-europe-2018/stylized-vfx-in-rime
- Simon Trümpler, GDC VFX Summit, *How to (Not) Create Textures for VFX*: https://www.gdcvault.com/play/1027741
- GDC 2017, *Art Directing VFX for Stylized Games*: https://gdcvault.com/play/1024715/Art-Directing-VFX-for-Stylized
- GDC 2017, *Visual Effects Bootcamp: Artistic Principles*: https://gdcvault.com/play/1023943/Visual-Effects-Bootcamp-Artistic-Principles
- RealtimeVFX, *Scrolling texture with mask setup*: https://realtimevfx.com/t/vfx-basics-creating-the-scrolling-texture-with-mask-setup/1966
- RealtimeVFX, *Fire tornado effect*: https://realtimevfx.com/t/fire-tornado-effect/25604
- Papaya Games, *How to make a stylized fire shader*: https://papaya-games.itch.io/duck-in-town/devlog/95149/how-to-make-an-stylized-fire-shader
- godotshaders, *Stylized fire (3D)* (MinionsArt erosion): https://godotshaders.com/shader/stylized-fire-3d/
- SIBGRAPI 2023, *Real-Time Cartoon Shaded Smoke Rendered with Transparency and Silhouette* (three.js): https://sol.sbc.org.br/index.php/sibgrapi/article/view/27342
- Samy Mercurio, frost storm spell (phased emitters): https://samymercurio.artstation.com/projects/oJD2em
- Blizzard, Diablo III GDC 2013 recap: https://ubergizmo.com/2018/06/how-blizzard-created-diablo-3-visuals/amp ; notes: https://3dreference.notion.site/VFX-In-Diablo-29806517bc9f4330be3c0ece360eace0
- Diablo IV quarterly update (VFX philosophy) summary: https://www.wowhead.com/cn/news/physical-based-rendering-and-visual-effects-diablo-iv-quarterly-update-325416
- VFX Voice, *Rachel Day (Overwatch)*: https://vfxvoice.com/rachel-day-the-game-changing-gamemaker-behind-overwatch/

**Particle and renderer references**
- three.quarks (billboard / stretched billboard / mesh / trail renderers, batched): https://npmjs.com/package/three.quarks
- Unity *Particle System Renderer* (stretched billboard semantics): https://docs.unity3d.com/es/2017.1/Manual/PartSysRendererModule.html
- MDN `getParameter` (`ALIASED_POINT_SIZE_RANGE`): https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter
- Inigo Quilez, *Voronoi edges* (F2−F1 edge distance): https://iquilezles.org/articles/voronoilines/

**three r170 source checked**
- `WebGLProgram.js` (`instanceMatrix` / `instanceColor` declared for ShaderMaterial under `USE_INSTANCING`): https://unpkg.com/three@0.170.0/src/renderers/webgl/WebGLProgram.js
- `WebGLRenderer.js` (InstancedBufferGeometry `instanceCount`, `_maxInstanceCount`): https://unpkg.com/three@0.170.0/src/renderers/WebGLRenderer.js
- `WebGLBindingStates.js`: https://unpkg.com/three@0.170.0/src/renderers/webgl/WebGLBindingStates.js
- `WebGLBufferRenderer.js` (`primcount === 0` early-out): https://unpkg.com/three@0.170.0/src/renderers/webgl/WebGLBufferRenderer.js
- `BufferAttribute.js` (`addUpdateRange` / `clearUpdateRanges`, element units): https://unpkg.com/three@0.170.0/src/core/BufferAttribute.js
- `WebGLAttributes.js` (range merge and clear): https://unpkg.com/three@0.170.0/src/renderers/webgl/WebGLAttributes.js
- `DataUtils.js` (`toHalfFloat`): https://unpkg.com/three@0.170.0/src/extras/DataUtils.js
- `color_vertex.glsl.js` (`instanceColor` into `vColor`): https://unpkg.com/three@0.170.0/src/renderers/shaders/ShaderChunk/color_vertex.glsl.js
- `LineSegmentsGeometry.js` (`setPositions` allocates per call): https://unpkg.com/three@0.170.0/examples/jsm/lines/LineSegmentsGeometry.js
