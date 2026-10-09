# Web / three.js lessons (verified in a shipped no-build r170 project)

Read before writing core rendering tech for a browser game. Each item was learned the hard way.

## Crowds of animated characters (hundreds on screen)
- **Instanced rigid skinning**: one `InstancedMesh` per creature *type*; all parts of a model merged into one geometry with a per-vertex bone index; bone matrices solved on the CPU in JS and written to a float `DataTexture` (row = instance, 4 texels per bone); the vertex shader fetches with `texelFetch(tex, ivec2(bone*4+i, gl_InstanceID))` via `onBeforeCompile` (inject at `beginnormal_vertex` and `begin_vertex`). ~1 draw call per type; 300 enemies ≈ 2 ms update + 1.6 ms render on a desktop GPU.
- Rejected: one `SkinnedMesh` per enemy (skeleton update + bone-texture upload + draw call each), `BatchedMesh` (no per-part bones), baked vertex-animation textures (can't layer procedural attack/hit motion).
- Per-instance channels via `InstancedBufferAttribute`s: hit flash/status tint emissive, glow ramp for wind-ups, rim light, accent recolour (e.g. elemental ward), elite flag (gold trim parts + elite-only parts collapsed to zero on regular instances).
- Shadows: `customDepthMaterial` with the same vertex injection. Outlines: a second `InstancedMesh` sharing geometry **and the same `instanceMatrix` attribute**, BackSide `MeshBasicMaterial`, extruded along *welded smooth normals* (separate attribute) by a constant screen width computed from the ortho camera each frame. Blob shadows: one shared instanced draw.
- Gait phase should advance by **distance actually moved** (no foot sliding); smooth yaw on the renderer side; hit squash + generic death topple in the instance matrix.
- Gotchas: `Material.clone()` drops `onBeforeCompile`; set `frustumCulled = false` on instanced meshes (stale bounding spheres); keep `customProgramCacheKey` distinct per shader variant; a 2D `DataTexture` re-uploads fully, so grow capacity by doubling; any pass using `scene.overrideMaterial` skips your injection.

## Procedural modelling
- A `PartBuilder` (box with taper/shift, sphere, icosa blob with seeded jitter, cone, cylinder, capsule, lathe, extrude, torus, `mirror(side, sign)`) that merges parts with colour/bone/emissive/trim attributes is enough for charming low-poly creatures.
- Drop zero-area triangles (cone/capsule/lathe poles give NaN normals); flip winding when the part matrix determinant is negative; compute flat normals per face but keep welded smooth normals for outlines; bake a vertical value gradient into vertex colours (feet ×0.7 → top ×1.08) for top-lit readability.
- Give modellers a viewer page: real game camera and scale, reference player model for size, URL params for poses/zoom/background/variants/yaw, and a row layout for many poses.

## Bright, sunny scenes
- **Tone mapping**: `NeutralToneMapping` keeps authored hues; ACES pushes saturated HDR (purple, cyan) to white; AgX desaturates.
- **Bloom**: `UnrealBloomPass` thresholds Rec.709 *luminance* with a hard knee before exposure, so saturated red/purple spells and sunlit ground look alike. Patch its high-pass to threshold the **peak channel** with a soft knee and feed only the energy above the threshold (≈1.1). Then only true HDR blooms.
- **VFX on bright ground**: additive blending washes to pastel/white. Use premultiplied **blend-add** (`CustomBlending`, src One, dst OneMinusSrcAlpha): rgb adds glow, alpha darkens what's behind. Cut spell HDR to ×1.4–1.8 (small cores ×2–2.5). Dark dust puffs (normal blending) read on bright ground; dark additive effects vanish.
- **Telegraphs**: a decal shader with dark band + crisp rim that never pulses to zero + darkening interior + growing fill; one hostile red; player-cast telegraphs look different (dashed rim). Use `depthTest: false` for ground decals once there is grass.
- **Enemy projectiles**: opaque saturated body + white-hot core + dark outline shell + ground shadow dot.
- **Point lights** tuned for night blow out daylit ground — scale them down (≈0.3).
- **Text**: dark text stroke (`-webkit-text-stroke` + `paint-order: stroke fill`) instead of glows.

## Environment
- No `scene.fog` with an ortho iso camera; use a shader haze (radial outside the arena + height) shared by all env materials through one `onBeforeCompile` helper that also adds world-space noise colour variation, drifting cloud shadows on the direct sun term, vertex wind and a dither cut-out where props occlude the player.
- Terrain flat on the playfield, rising on the far side and dropping on the camera side so nothing tall hides the player; disguise the arena edge with natural features.
- Grass: one instanced draw of tens of thousands of blade clumps in a **camera-following window** that wraps instances with `floor()` in the vertex shader; density from a CPU-built layout mask texture (paths, water, density, height). Make the window size NaN-safe (a 0×0 window at build time must recover).
- Props: recipes return vertex-coloured, flat-shaded geometry baked into world-space chunk meshes sharing one material; big props at the edge or far side.
- Sun shadows: texel-snapped frustum sized by zoom, `shadow.intensity` < 1, warm sun + cool sky hemisphere for painted-looking shadows.

## Harness
- Expose the game on `window`; provide `snap({ level, seconds, boss, zoom, hud })` that simulates synchronously and renders once (hidden browser panes stall `requestAnimationFrame`).
- Provide a bot `runSim()` that returns comparable metrics (time of death, level timeline, damage by source, boss time-to-kill) for A/B against an archived build.
