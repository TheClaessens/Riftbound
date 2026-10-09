# 02 — Environment: sunny, stylized, open-world biomes (three r170, no assets)

Research report for Riftbound. Scope: lighting/colour pipeline, ground, grass, props, water, sky/ambience, AO/outlines and per-biome palettes for **Act I Forest**, **Act II Barrens** and **Act III Riverlands**. The code is ES-module, no-build, and uses only `three@0.170.0` plus `three/addons`. It loads no external assets. All shader chunk names and APIs were checked against the r170 sources on jsdelivr (see §9).

---

## TL;DR

1. **Tone mapping: switch ACES → `THREE.NeutralToneMapping`** (Khronos PBR Neutral, exposure 1.0). It keeps albedo hue and saturation up to ~0.76 linear, then rolls highlights to white. That suits saturated stylized colour, and HDR spell cores still go white-hot. AgX desaturates too much. ACES shifts greens and oranges toward yellow.
2. **r170 light units:** the sun DirectionalLight runs at **2.6–3.4**, and the HemisphereLight at **1.2–1.6** with a blue-ish sky colour, which tints the shadows cool. Light intensity ≈ π × the old legacy value. Do not add lights. Lightning still pulses the hemi and the grade.
3. **Bloom: raise the threshold to 1.0** (smoothWidth 0.1) and cap environment albedo at ~0.75 linear luminance. Sunlit sand and bone then peak around 0.6–0.85 and never bloom. VFX must bloom by luminance, not by multiplier. Saturated red and magenta have luminance ≈ 0.24, so ×2.2 never blooms. Use `hdrColor(hex, 1.4)`, which works out to about ×6.
4. **Shadows:** keep PCFSoft at 2048 and set `shadow.intensity = 0.85` (new in r166+). Size the frustum by zoom, ±26…±48. **Texel-snap the light** so crisp shadows don't swim. Put the sun at `(-12, 34, 24)` (front-left, ~52° elevation). Shadows then fall to screen-right and stay visible.
5. **No `scene.fog`.** In an ortho iso view, depth varies only ±25 m and rising terrain is *closer* to the camera. Use a shared shader "haze" instead: radial haze outside the arena plus height haze below y=0. Set `scene.background` to the haze colour, add drifting **cloud shadows** that multiply only the direct sun term, and use a light vignette of 0.18.
6. **One patch helper (`patchEnv`) for every environment material** (MeshLambert + `onBeforeCompile`). It adds world position, cloud shadows, haze, vertex wind, wrap lighting and a player-occlusion **dither cut-out**. All materials share one uniforms object, so there is one update per frame.
7. **Ground:** a 260 m displaced plane, flat at y=0 inside r<56. Beyond that the far side (screen-top) rises +5 m and the near side (screen-bottom) drops −6 m, so nothing tall hides the player. A CPU-built 256² **layout DataTexture** feeds the shader splatting (R path, G water, B grass density, A height). Noise-thresholded edges give a painted look and nothing tiles.
8. **Grass: a camera-following window.** One `InstancedBufferGeometry` of ~48k 5-triangle blades sits in a 78×68 m window in camera-aligned axes. Instances wrap with `floor()` in the vertex shader, sample the layout mask (density and height), and get gust-noise wind and a player push. It costs **1 draw call, ~240k tris and ~1–2 ms** on a mid laptop. Flowers use the same code: 4k instances, 1 draw.
9. **Props:** procedural, flat-shaded, vertex-coloured geometry with baked AO gradients and face-jitter: broadleaf, pine, acacia, bush, rock, mesa with strata, and reeds. Each is **one InstancedMesh per species variant**. All non-swaying props merge into **one static mesh**. Tall trees sit only on the far half; near-side trees are at r≥62 or low. The dither cut-out covers the rest.
10. **Water:** a river ribbon (CatmullRom) whose UVs are across 0..1 and along in metres. It uses an opaque Lambert patch with flow noise, a bank foam band, flecks and HDR sparkles, and needs no depth or reflections. Waterfalls are vertical ribbons on far-side cliffs with fast streaks and a foam pool.
11. **AO and outlines:** skip SSAO by default. Use baked vertex AO, sun shadows and one instanced **blob-shadow** draw under enemies. N8AO@1.10.1 works with ortho and r170 (with postprocessing@6.36.6 in the import map) but costs ~1.5–3 ms and renders transparents twice, so treat it as an "Ultra" option only. GTAOPass re-renders the whole scene for normals, so it is a no. No outlines on the environment.
12. **Budget:** about 25 environment draw calls plus ~13 shadow draws, and ~450k triangles. Palettes in §8 keep the play area green, sand or meadow at mid value. **Barrens is the risk:** keep the playfield desaturated ochre, push the reds onto mesas outside the arena, and give telegraphs a dark rim and an HDR edge.

---

## 1. Lighting and colour pipeline

### 1.1 What r170 does with light numbers
- r155 turned off legacy lights and r165 removed `useLegacyLights`. Directional, hemisphere and ambient intensities are no longer multiplied by π internally. To match an old "intensity 1" look, use ≈ π. ([three.js forum: Updates to lighting in r155](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733))
- Lambert direct term (`lights_lambert_pars_fragment`, r170): `irradiance = dotNL * directLight.color` and `BRDF_Lambert = diffuse / π`. The hemisphere term adds `mix(groundColor, skyColor, 0.5·dot(N,up)+0.5) × intensity`, also divided by π. So for **flat ground**:
  `radiance ≈ albedo × (sunI · sin(elev) · lum(sunCol) + hemiI · lum(skyCol)) / π`
  - Forest (sun 3.1 at 52°, hemi 1.35 × #CFE6FF): ≈ **albedo × 1.03**. Faces pointing straight at the sun get ≈ albedo × 1.22.
  - Barrens (sun 3.4, hemi 1.2 × #B9D4FF): ≈ albedo × 0.93 on flat ground, ×1.11 facing the sun.
  - Riverlands (sun 2.6, hemi 1.6 × #9DB6E6): ≈ albedo × 0.79. That is darker and moodier; the grade lifts it.
- The shadow-to-light ratio on the ground is about 3:1, and the shadow colour is cool because the hemi sky is blue. That warm-sun / cool-shade split is the main source of the "painted" Hades / Torchlight feel.

### 1.2 Tone mapping
| Option | Verdict |
|---|---|
| **NeutralToneMapping** (r162+, Khronos PBR Neutral) | **Use it.** Linear up to `StartCompression = 0.76`, then compresses highlights and desaturates them toward white (`Desaturation 0.15`, checked in r170 `tonemapping_pars_fragment`). Albedo colours look as authored. HDR spells (lum 1.5–6) get white cores and keep coloured bloom halos. |
| ACESFilmic (current) | three's version multiplies by `exposure/0.6`, so 1.05 behaves like 1.75. It brightens midtones but skews saturated greens and oranges toward yellow and crushes the warm-palette differences you need in the Barrens. Still workable at exposure ≈ 0.8. |
| AgX | Clean highlights but clearly less saturated out of the box ([forum: Is AgX implemented correctly?](https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609)). Wrong for Wind Waker-style colour. |
| None + manual grade | Hard clipping of HDR VFX and ugly magenta→red clipping. No. |

Keep the existing grade ShaderPass. It runs in linear HDR before OutputPass, which is fine. Use saturation 1.05–1.1, contrast 1.03–1.05 and **vignette ≈ 0.18** (down from 0.35). Exposure is applied in OutputPass after bloom, so per-biome exposure tweaks don't change what blooms.

### 1.3 Bloom so the ground never blooms but spells do
`UnrealBloomPass` → `LuminosityHighPassShader` does `v = luminance(texel.rgb)` (Rec.709) on the **linear, pre-tone-map** HalfFloat buffer, then `smoothstep(threshold, threshold + smoothWidth, v)`. The pass hard-codes `smoothWidth` to 0.01.
- Measured linear luminance of candidate albedos: sand #D8B985 = 0.51, mesa cap #F2D3A0 = 0.68, bone #EDE3CC = 0.77, pure white flower #F4F1E6 = 0.88. Sunlit mesa caps reach ≈0.76–0.87, which **blooms at today's threshold of 0.85**.
- **Set `bloom.threshold = 1.0`** and `bloom.highPassUniforms.smoothWidth.value = 0.1`. Also **cap environment albedo at about 0.75 linear luminance**: no pure whites, so bone becomes #DCD2BC (0.65), white petals #ECE8DA and foam #DDF3EE.
- The VFX side is a real finding. `fx.js` uses `hdr` multipliers of 1.6–2.5, but the telegraph and bullet colours have luminance **0.24** (#ff3344, #ff2a6d) and 0.29 (#ff5a2a). ×2.2 gives 0.53, so they do **not** bloom today and won't at 1.0 either. Normalise by luminance instead:
  ```js
  export function hdrColor(hex, targetLum = 1.4) {           // linear luminance target for bloom
    const c = new THREE.Color(hex);
    const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return c.multiplyScalar(targetLum / Math.max(l, 1e-3));
  }
  ```
  With Neutral, red at targetLum 1.4 renders as a pink-white core with a red halo. Use 1.2 when the hue must stay readable, such as a telegraph fill, and 2–3 for impacts.
- Optional: make bloom slightly hue-aware so saturated colours bloom at a lower multiplier:
  ```js
  const hp = engine.bloom.materialHighPassFilter;
  hp.fragmentShader = hp.fragmentShader.replace('float v = luminance( texel.xyz );',
    'float v = max( luminance( texel.xyz ), 0.55 * max( texel.r, max( texel.g, texel.b ) ) );');
  hp.needsUpdate = true;
  ```
  Check before enabling: the brightest sunlit albedo max-channel × 0.55 × 1.22 must stay below 1.0. It does for all palettes in §8, where the max channel is ≤ 0.89.

### 1.4 Shadows (crisp but soft, ortho-friendly)
- Keep `PCFSoftShadowMap` and 2048². `PCFShadowMap` uses `shadow.radius` (checked in r170 `shadowmap_pars_fragment`), but PCFSoft ignores it. PCFSoft at 3–4 cm per texel gives the crisp stylized edge.
- `sun.shadow.intensity = 0.85`. This is `LightShadow.intensity` (r166+), passed as `shadowIntensity` into `getShadow`. Shadows then never go fully dark, which helps readability under 320 enemies.
- Use `bias -0.0005` and `normalBias 0.025`.
- **Frustum by zoom:** half-size = clamp(30/zoom, 26, 48), which is 3–5 cm per texel. ±32 is too small at zoom 0.6: the visible ground's half-diagonal is about 47 m, so tree shadows pop at the edges.
- **Texel snapping:** move the light target in light space in whole-texel steps (code in Appendix F). Without it, crisp shadows crawl every frame as the camera lerps.
- **Sun direction:** offset `(-12, 34, 24)` from the target. That is screen-left and slightly toward the camera, at 52° elevation. Front faces are lit and shadows fall to screen-right / up-right at about 0.8 × height (a 6 m tree throws a 4.7 m shadow). Avoid back-lighting: faces turned to the camera would be in shade.
- `castShadow` for the player, bosses and big enemies only. Small enemies get blob shadows (§7). Grass and flowers never cast. Trees cast without wind; the shadow pass uses the stock depth material, which looks fine at 0.18 m sway.

### 1.5 Fog / atmosphere with an ortho camera
- `vFogDepth = -mvPosition.z` (r170 `fog_vertex`). With the camera 120 m out at 41°, visible ground depth only spans ~120 ± 23 m. Linear fog would just be a weak top-of-screen gradient, and tall far-side cliffs get *less* fog because they rise toward the camera. **Don't use `scene.fog`**: it would also fog the VFX unless every material sets `fog:false`.
- **Use a custom haze in `patchEnv`** (`envHaze`) instead:
  - (a) **radial haze**: `smoothstep(62, 110, r) × 0.35`. The world outside the arena recedes and the playfield pops. This is the main "it's not an arena" trick.
  - (b) **height haze** for terrain below y=0 (the near-side drop and valleys).
  - Set `scene.background` to the haze colour, so if the ground ever ends you see haze, not black.
- The vignette stays, at ~0.18.

---

## 2. Ground / terrain

**Layout data** is one CPU-built `DataTexture` (256×256 over 256 m, 1 m per texel, Linear filtering; no canvas, so there is no premultiplied-alpha corruption).
- **R** = path field. 0.5 marks the edge.
- **G** = water: 1 in the channel, fading to 0 over 5 m of bank.
- **B** = grass density: removed on paths, water, slopes and prop footprints.
- **A** = terrain height, encoded `h·8+128` so that 0 is exact.

The **same data** drives the ground colour, the grass/flower density and grass height (vertex texture fetch), and CPU prop placement. Everything agrees by construction.

**Geometry** is a `PlaneGeometry(260, 260, 200, 200)` rotated flat and displaced on the CPU from `heightAt(x,z)`, followed by `computeVertexNormals()`. That is about 40k vertices and 80k triangles.
- **r < 56 is exactly y=0** (gameplay plane).
- From 56 to 66 m it ramps toward a side-dependent profile. `s = dot(dir, normalize(1,0,1))` is +1 on the camera side (screen-bottom).
  - **Far side** (s<0): +5 m hills plus noise, with cliffs and trees on top. These faces turn toward the camera and are visible.
  - **Near side** (s>0): drops to −6 m. Downward faces turn away from the camera and are invisible; you look down onto a lower valley with tree tops. Nothing near the bottom of the screen can cover the player.
- Rivers carve a 0.45 m channel. The water surface sits at +0.03 inside the arena, so entities at y=0 "wade" and their feet are hidden by opaque water.

**Shader splatting** (`MeshLambertMaterial` + `patchEnv`, Appendix B), all in world space with no texture repetition:
- Ground colour mixes A/B by low-frequency fBm (0.035 /m), plus mid-frequency dark patches (0.21 /m) and ±7 % fine mottling (1.7 /m).
- **Painted path edges:** `pathField + (midNoise−0.5)·0.35`, thresholded with a narrow `smoothstep(0.48, 0.53)`. That gives crisp, hand-drawn wobbly borders of about ±1.4 m, a 1–2 m "worn grass" halo, a wet bank colour from G, and a slope colour where normal.y < 0.9.
- Barrens adds **Voronoi cracked earth** (3×3 cell search, ~20 ALU).
- Cost: about 4 value-noise taps and 1 texture fetch per pixel, roughly 0.3 ms at 1080p. Cheaper than sampling three tiled canvas textures, with zero tiling artifacts.

**Why not canvas textures:** a 512² canvas tile repeated 10× over 150 m (today's approach) repeats visibly every 15 m from an iso view. Shader noise in world space never repeats. If a low-end GPU struggles, bake `envFbm` into a 256² tileable R8 DataTexture and sample it at two rotated scales.

**Painted rather than posterized:** a toon ramp on flat ground does nothing, because N·L is constant. The painted look comes from colour variation, crisp mask edges, warm sun against cool hemi, cloud shadows, and flat-shaded props with baked AO gradients. Props use **wrap lighting** (`dotNL = (N·L·0.6+0.4)²`, an `onBeforeCompile` replace of the r170 Lambert chunk) for soft, painterly terminators.

---

## 3. Grass and flowers

### Technique: a camera-following instanced window
- **Geometry:** one blade with 7 vertices and 5 triangles: 3 width levels (1.0, 0.78, 0.45) plus a tip. Normals are **forced to world-up**, so blades light like the ground: no dark back faces or speckle, and the stylized "carpet" read. DoubleSide is used, with a fragment `normal = normalize(vNormal)` fix so back faces don't flip.
- **Instances:** `InstancedBufferGeometry` on a plain `Mesh`. r170's `renderBufferDirect` draws `isInstancedBufferGeometry` instanced, with `frustumCulled = false`.
  - Attributes: `aOffset` (vec2 in [0,W)) and `aRand` (vec4: yaw, size/colour random, lean, per-clump cull threshold).
  - Blades are generated in **clumps** of 5–11 within 0.35 m, which gives the tuft look of KayKit / Wind Waker.
- **Wrapping:** the window lives in camera-aligned axes, U = screen-right (1,0,−1)/√2 and V = screen-up (−1,0,−1)/√2. Each instance takes the copy nearest the camera target:
  `q = aOffset + W·floor((centerUV − aOffset)/W + 0.5)`
  So 78×68 m of grass always covers the view at zoom 0.6 on 16:9. `fieldWindow()` computes this; rebuild on resize. The field is periodic, but density, height and colour come from **world-space** noise and the layout mask, so the period never shows.
- **Density:** `mask.B × patchNoise × uDensity`, compared with the per-clump random, gives meadows, bare patches and clean paths. Culled blades collapse to zero area: the vertex still runs, no pixels are drawn.
- **Height:** blades are 0.55 m × (0.65–1.35) × patch noise, and the base y comes from mask.A, so grass follows the hills outside the arena.
- **Wind:** a travelling gust (`envNoise(base·0.07 − windDir·t·0.6)`) plus a phase wave along the wind direction plus per-blade lean. The bend scales with `t²` (root fixed) and y shortens a little so blades don't stretch.
- **Interaction:** blades within 1.6 m of the player bend away. One `vec2` uniform; it can be extended to 8 enemy/skill positions if wanted.
- **Colour:** root→tip gradient. The root colour sits close to the ground colour so blades melt into the ground. Tips mix two colours by world noise (0.045 /m) and per-blade random, which gives large-scale sun-bleached swathes.
- **Lighting:** Lambert, receives shadows, applies cloud shadows. Never casts.

### Numbers and cost (per biome)
| | Forest | Barrens | Riverlands |
|---|---|---|---|
| blades in window | 48k (≈9.5/m²) | 14k dry tufts, taller (0.75 m), clump 4–8 | 56k |
| flowers | 4k (patches) | 0 (0.5k dry thistle optional) | 3k |
| triangles | 240k + 48k | 70k | 280k + 36k |

- **Vertex cost:** ~150 ALU and 1 vertex texture fetch per vertex. 336k vertices is about 0.4 ms on a GTX 1650-class GPU and ~1 ms on Iris Xe.
- **Fragment cost:** dominated by overdraw. At zoom 1 a blade covers ~5×19 px, so expect 1–2 ms total on a mid laptop.
- **Quality tiers:** 24k / 48k / 80k. On the Low tier set `receiveShadow = false` on grass, which removes the per-fragment shadow lookups.
- **Telegraph conflict:** grass blades will draw over ground decals. Render telegraphs and ground AoE with `depthTest:false, depthWrite:false, renderOrder: 10`; they are transparent anyway. Optionally flatten grass in active telegraphs by passing up to 8 circles.

### Flowers
Same shader with `#define FIELD_FLOWER`.
- **Geometry:** a 2-triangle stem plus a 10-triangle five-pointed star head (radius 0.12 m).
- **Colour:** custom `aCol`/`aTint` attributes, with petal colour taken from a `uPetal[4]` uniform by `int(aRand.y·3.999)`; GLSL ES 3.0 allows dynamic uniform-array indexing.
- **Placement:** clustered in beds by a second noise threshold.
- **No red, pink or magenta petals** (telegraph and bullet colours). Use white, butter yellow, periwinkle and lavender.

References: instanced grass with a wind shader ([forum: Simple instanced grass example](https://discourse.threejs.org/t/simple-instanced-grass-example/26694), fiddles [felixmariotto](https://jsfiddle.net/felixmariotto/hvrg721n/) and [prisoner849 noisy variant](https://jsfiddle.net/prisoner849/n1emstwd/)); Codrops ["How to Make The Fluffiest Grass With Three.js" (2025)](https://tympanus.net/codrops/?p=83092), which covers chunking, LOD and billboard vs blade trade-offs. Codrops returned 403 to the fetcher; the URL comes from the Codrops index.

---

## 4. Trees, bushes, rocks, mesas, reeds

### Recipes (Appendix D has the code)
All recipes are built from three primitives. The pipeline is `toNonIndexed` → delete uv/normal → **lump** (radial noise keyed by quantised position, so duplicated vertices move together and no cracks open) → **paint per face** (bottom→top gradient × baked AO (0.5–0.7 at the bottom) × ±8–10 % face jitter, plus optional moss on up-facing faces and strata bands) → `mergeGeometries` → `computeVertexNormals()`. On non-indexed geometry that last step gives face normals, i.e. flat shading with no `flatShading` derivative cost.

| Species | Recipe | Tris |
|---|---|---|
| **Broadleaf / oak** (Forest, Riverlands as alder/willow) | Trunk `Cylinder(0.16,0.3,2–2.8,6)`. Crown of 3–5 `Icosahedron(r 0.9–1.5, detail 1)` blobs, lump 16 %, y-scale 0.82, scattered 0.55–1.15 m around the trunk top. Crown gradient leafDark→leafLight. | ~350 |
| **Pine** | Trunk plus 3–4 stacked `Cone(r, 1.5r, 7)` tiers, each 0.74× the one below and overlapping by 55 %. | ~110 |
| **Birch** | Thin white trunk (paint with 20 % dark bark faces) plus 2–3 small, y-elongated (×1.4) light-green blobs. | ~250 |
| **Acacia** (Barrens) | Leaning trunk with two forked branches. Canopy is 3 icosahedrons y-scaled to **0.28**, giving the flat umbrella silhouette. Olive green, which reads against orange earth. | ~300 |
| **Bush / fern-ball** | 2–4 icosahedrons r 0.45–0.8, detail 0–1. | 40–240 |
| **Rock** | `Icosahedron(1, 0|1)`, lump 28 %, non-uniform scale (1–1.5, 0.55–0.9, 1–1.4), sunk 25 %. Moss/sand on faces with normal.y > 0.55. | 20–80 |
| **Mesa / pillar** (Barrens) | `Cylinder(rTop, r, h, 11, 7)`. Each ring vertex is pushed radially by fBm over (cosθ, sinθ, y), which is continuous with no seam. Painted with **strata bands** of 1.6 m (ragged ±0.15) and a dry-grass cap on faces with normal.y > 0.9. | ~300 |
| **Reeds** (Riverlands) | 7 tall tapered triangles (1–1.8 m) and 40 % cattail heads, DoubleSide. | ~40 |
| **Mushrooms / bones / ruins / bridge** | Cylinder plus half-sphere caps (tan or teal, **not red**). Bones are partial `Torus` arcs plus a sphere. Ruins are jittered boxes and broken cylinders. The bridge is merged boxes. | small |

### Instancing and draw calls
- **One `InstancedMesh` per species variant**, with 2 variants for the main species.
  - Per instance: yaw, scale 0.8–1.3 with a little y-stretch, tilt ≤ 0.08 rad.
  - `setColorAt` tint jitter of ±8 %. `instanceColor` multiplies vertex colour in r170 `color_vertex` when `vertexColors: true`.
- **Every prop that doesn't sway** (rocks, mesas, ruins, bridge, bones) is pre-transformed and **merged into one static mesh** per biome with the same material: 1 draw plus 1 shadow draw.
- **Distant canopy sea:** beyond r≈80, crowns only (no trunks), 300+ instances, `castShadow=false`. This is the "forest continues forever" filler.

### Wind sway (vertex)
`patchEnv(..., { wind: { height, amp, flutter } })`:
- Instance origin = `(modelMatrix·instanceMatrix)[3]`.
- Weight = `(localY/height)²`.
- Sway = two sines phased by the origin, plus a travelling gust noise.
- Flutter = a high-frequency sine of local position.
- The world-space offset is converted to local space with `transpose(R)/|R₀|²`, valid for rotation × uniform scale. Every tree then leans **the same way** whatever its yaw.

Values: trees 0.18 m / flutter 0.035, bushes 0.06 / 0.025, reeds 0.25 / 0.02.

### Not occluding the player (iso)
A vertical object of height H hides ground up to `H / tan(41°) ≈ 1.15·H` behind it on screen.
1. **Placement rule:** inside r<54 only props ≤ 1.2 m (rocks, bushes, stumps, ferns, flowers, ruins ≤ 1.5 m). Trees (5–8 m) go only on the **far half** (s<0.3) at r ≥ 56. On the **near half**, trees only at r ≥ 62 *and* standing on the −6 m drop (their tops end up near y=0), or use low bushes and rocks.
2. **Dither cut-out** (`fade: true`): per fragment, measure the distance from the fragment's world position to the line through the player chest along the camera direction (ortho, so one direction for all pixels). Only fragments in front of the player count. A 4×4 Bayer `discard` inside a 2.2 m radius with a 1.8 m feather gives a soft round window through canopies, like Diablo or Torchlight. It is per-fragment, so it works for instanced meshes in a single draw, and shadows stay intact. Similar systems: [Needle SeeThrough](https://engine.needle.tools/docs/api/SeeThrough) (alpha-hash fade), [Godot camera occlusion dither](https://godotshaders.com/shader/camera-occlusion-dither/).
3. Never let the camera collide with props. The ortho camera has nothing to collide with.

Reference recipe (r186+ TSL only, so read it, don't import it in r170): [three.js ForestGenerator docs](https://threejs.org/docs/pages/ForestGenerator.html), an icosphere "teardrop" with a baked dark-base/bright-top gradient in one draw call. It confirms the approach.

---

## 5. Water / river / waterfalls

- **Geometry:** a ribbon along a `CatmullRomCurve3` (centripetal), sampled every 1 m.
  - `uv.x` runs across (0..1); `uv.y` is arc length in metres, so the flow speed is in m/s.
  - Normals are set to up. Winding is checked so faces point +y.
  - y = `yFn(x,z)`: +0.03 in the arena, following the uncarved terrain outside.
  - The ground mask G gives the wet bank colour. Stones (static merge) and reeds line the banks.
- **Material:** opaque `MeshLambertMaterial` + `patchEnv`, so it receives shadows and cloud shadows and needs no sorting. The colour fragment:
  - **depth illusion:** shallow→deep by distance to the bank (`(1−|2u−1|)·width/2`), no depth buffer needed;
  - **flow streaks:** anisotropic value noise scrolling along `uv.y − t·speed`;
  - **bank foam band:** threshold of distance-to-bank against `0.25 + 0.45·noise + 0.12·sin(...)`, which wobbles and scrolls;
  - **foam flecks** near the banks;
  - **sparkles:** product of two scrolling noises > 0.62 written to `totalEmissiveRadiance` (×1.2). Only these few pixels pass the 1.0 bloom threshold, which gives cheap glitter. Lower it in the play area if lightning telegraphs are white.
- **Cost:** ~5 noise taps per pixel on a few % of the screen. Negligible.
- **Waterfalls:** a vertical `PlaneGeometry(w, h, 1, 8)` on a far-side cliff, rotated π/4 to face the camera.
  - Same material with `#define WATERFALL`: speed 6 m/s, streak-dominated, foam over the last 1.5 m.
  - A foam/mist burst at the pool from the existing particle system (one Points) and a few soft white sprites.
  - Always on the **far side**, so the waterfall faces the camera and never hides the player.

Related techniques: [Toon water for the web (Tuts+)](https://code.tutsplus.com/creating-toon-water-for-the-web-part-1--cms-30447t) and [forum: toon water with intersection foam](https://discourse.threejs.org/t/toon-water-shader-with-depth-based-fog-and-intersection-foam/35978). Both use depth-buffer foam; we replace it with a baked distance-to-bank so no depth texture is needed.

---

## 6. Sky, background and making it endless

- The ortho camera at 41° **never sees the horizon**, so a sky dome is wasted. The view is always ground.
- **Ground extent:** the visible footprint reaches about 47 m from the camera target at zoom 0.6. With the player at r=55 the view reaches r≈102, so the 260 m ground (r 130) is always enough. The radial haze dissolves the outer world into `scene.background = haze colour`.
- **What sells "open world":**
  1. Terrain rises on the far side and drops on the near side.
  2. Tree lines, mesas and cliffs **straddle** r=55 (trunk-line bushes at 54–58 make the barrier).
  3. Beyond r 75–110 there is a sparse continuation: a canopy sea, mesas, the river continuing, a distant ruin.
  4. Haze.
  5. Cloud shadows sweep across everything, inside and outside the arena.
  6. Ambient particles exist everywhere.
- **Cloud shadows:** `envCloud(xz)` = fBm at scale 0.016 /m (≈60 m clouds), drifting at 2–4 m/s, `smoothstep(cover, cover+0.12)` → multiplier 0.58–0.75. It is applied **only to `reflectedLight.directDiffuse/Specular`** after `#include <lights_fragment_end>`, so cloud shade looks like sky-lit shade, cool and correct. Patch the player and enemy materials with `patchEnv(mat, {haze:false})` too if they should darken under clouds (recommended).
- **Sun dapple / god rays:** Forest only. 6–10 large additive quads aligned with the sun direction (gradient canvas alpha, opacity 0.08–0.12, slow pulse), merged into one draw near canopy gaps at the arena edge. `depthWrite:false`, fog/haze off, luminance well below 1.0. Tree shadows already give dappling.
- **Ambient particles:** camera-window Points (Appendix G), each 1 draw.
  - Forest: pollen (#FFF1B8, 600, slow rise) and falling leaves.
  - Barrens: dust motes (#F0D2A6, faster horizontal drift) and occasional dust devils (an existing particle burst with swirl).
  - Riverlands: dandelion seeds, light rain streaks during storm phases, mist at waterfalls.
- **Riverlands "storm but colourful":** the sky is never seen, so the storm comes from:
  - bigger, darker, faster cloud shadows (cover 0.45, dark 0.58, 4 m/s) with warm sunlit gaps on saturated green, which is high colour contrast;
  - stronger wind (`uWindStrength` 1.0), so grass waves sweep across the screen;
  - a cooler hemi;
  - lightning: a 120 ms pulse of `hemi.intensity` +2.5 and `grade` flash (existing API). No new lights.

---

## 7. Ambient occlusion and outlines

| Option | Cost (1080p, mid laptop) | Verdict |
|---|---|---|
| **Baked vertex AO** in prop colours (gradient + face jitter) | 0 | **Yes**, already in the recipes. |
| **Blob contact shadows** under enemies, pickups and small props: one `InstancedMesh` of a ground quad with a radial-gradient `alphaMap`, `depthWrite:false`, opacity 0.35, matrices updated each frame | 1 draw, ~0.1 ms | **Yes.** Lets 300 small enemies skip `castShadow`, which saves shadow-pass draw calls. |
| **N8AO** `n8ao@1.10.1` (or 2.0.1) `N8AOPass(scene, camera, w, h)` | ~1–1.5 ms halfRes "Low" (+~1 ms depth-aware upsample) | Optional "Ultra". It **supports orthographic cameras** (README). Its beauty target is HalfFloat, so bloom still sees HDR. It replaces RenderPass, and you need `configuration.gammaCorrection = false` (OutputPass does sRGB). Watch out: transparent-aware mode **renders transparent objects twice** (heavy VFX), so set `transparencyAware = false`. Use `aoRadius ≈ 1.5`, `distanceFalloff 1`, `intensity 2.5`. |
| GTAOPass (r170 addon) | high | **No.** Supports ortho (`PERSPECTIVE_CAMERA 0` define), but without a supplied G-buffer it re-renders the whole scene with `MeshNormalMaterial`, doubling draw calls for 320 enemies. |
| SAO/SSAO | high | No. |

N8AO import map. Its dist imports `postprocessing` and `three/examples/jsm/postprocessing/Pass.js` at top level, even if you only use N8AOPass:
```html
"n8ao": "https://cdn.jsdelivr.net/npm/n8ao@1.10.1/dist/N8AO.js",
"postprocessing": "https://cdn.jsdelivr.net/npm/postprocessing@6.36.6/build/index.js",
"three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
```
`postprocessing@6.36.6` declares peer `three >= 0.157 < 0.173`, so r170 is OK. 6.36.4 stops at <0.171. That adds ~620 KB plus ~200 KB of JS downloads. Released 2025 and long since aged. Sources: [N8AO GitHub](https://github.com/N8python/n8ao), npm registry metadata.

**Outlines:** the targets (Torchlight, Hades, KayKit) read through **value and colour separation, not ink lines**, on environments.
- Inverted-hull outlines double vertex work and draws per species.
- A depth-Sobel post pass is ~0.3–0.5 ms, needs a `DepthTexture` on the composer target, and outlines grass into noise.
- `OutlinePass` is several full-screen passes per selection.

**Don't outline the environment.** If characters need pop, use a rim or Fresnel term on character materials, or an inverted hull on the player and bosses only.

---

## 8. Per-biome palettes (sRGB hex; THREE.Color converts to linear)

Rule: keep the **playfield mid-value and moderately saturated** (linear luminance 0.25–0.5). Saturation goes on props and the outside world. No env albedo above ~0.75 luminance.

| Slot | **Forest — Sunlit Glade** | **Barrens — Sunscorch Badlands** | **Riverlands — Stormbreak Meadows** |
|---|---|---|---|
| Ground A / B / dark | #5E9B3A / #7DB548 / #3F7A2E | #C9A46E / #D8B985 / #A9824F (cracks ×0.65) | #4E9A4C / #6DB25A / #33753C |
| Path / path edge | #B08A5A / #9AA552 | #E0C9A0 dry wash / #BFA06A | #A08866 gravel / #8C9A58 |
| Bank / slope | #6B5A3E / #7D7466 | #8E6A48 / #B5532E (rust cliffs) | #5B5340 / #6F7A78 slate |
| Grass root / tip A / tip B | #3C7A2A / #8CC94F / #B8D85A | #8A7A3A / #D6BC62 / #E8D48A (dry tufts) | #2C6A38 / #78C060 / #A6D46A |
| Flowers | #ECE8DA, #FFD95A, #8FA8FF, #B9A7FF | (thistle #C9B8E0, sparse) | #ECE8DA, #FFE07A, #A9B8FF, #F3E9A0 |
| Foliage dark / light | oak #2E6B30 / #6DBE4B; pine #24533A / #3F8A55; birch #9CCB52 / #C4E07A | acacia #5D7A2E / #93AE4A | alder/willow #2F6E45 / #6FB35A |
| Trunks | #5C4030 → #7A5A40; birch bark #E3DED0 | #4E3A2A → #6E5338 | #4F4038 → #6A5646 |
| Rocks / moss | #6A665E → #9A9488 / #6E9A45 | #7E5038 → #B07A52 / sand #D6C08A | #5E666C → #8C949A / #5F8F48 |
| Special | mushrooms cap #E2B66E, stem #EFE6D0 | mesa strata #B5532E #D0703F #E39A5C #C8643A #EBB27A, cap #D6C08A, bones #DCD2BC | reeds #5F7F3A → #C2BE72, wood #8A6440, ruins #B7B2A3 |
| Water deep / shallow / foam | #2F8FA3 / #5CC6C2 / #DDF3EE | (dry riverbed, no water) | #1F6E8C / #3FB0B8 / #DDF3EE |
| Sun colour / intensity | #FFF0D2 / 3.1 | #FFE6B8 / 3.4 | #FFE7C4 / 2.6 |
| Hemi sky / ground / intensity | #CFE6FF / #6B7A3A / 1.35 | #B9D4FF / #A5683E / 1.2 | #9DB6E6 / #4E6B45 / 1.6 |
| Haze = background | #BFE0C8 | #F0D2A6 | #8FA7B8 |
| Clouds cover / dark / speed | 0.56 / 0.74 / 2 m/s | 0.70 / 0.78 / 3 m/s (rare) | 0.45 / 0.58 / 4 m/s |
| Grade tint, sat, contrast, vignette | [1,1,0.98], 1.08, 1.04, 0.18 | [1.04,1,0.94], 1.0, 1.05, 0.2 | [0.97,1,1.04], 1.06, 1.05, 0.22 |

**Conflicts with telegraphs #ff3344 / #ff5a2a and bullets #ff2a6d:**
- **Forest:** red against green is complementary, so this is the best case. Banned near the play area: red/pink flowers, Amanita-red mushrooms, autumn foliage.
- **Barrens: HIGH risk.** Orange-red ground and orange telegraphs share a hue, and the "fissure eruption" hazard is naturally orange too. Mitigations:
  1. Keep the **playfield desaturated light ochre** (#C9A46E–#D8B985, luminance 0.4–0.5). The strong rust and red strata live only on mesas and cliffs outside r 56.
  2. Telegraphs use **value contrast**: a 0.15 m dark rim (#2A0A06 at 60 %), an HDR edge line via `hdrColor(..,1.4)` that blooms, and a 30–35 % fill. The red then reads darker *and* glowier than the sand.
  3. Give fissure eruptions a **distinct shape language**: dark crack lines (multiply) that grow, with yellow-white HDR seams (#FFD27A at lum 2.0) and dust puffs, not a filled orange disc.
  4. A blue hemi sky gives cool shadows that separate warm hazards.
  5. Grade saturation 1.0, not higher.
- **Riverlands:** red and magenta read well on green and blue. Risk: water **sparkles and white foam** against white or cyan lightning telegraphs. Keep sparkle at ≤ 0.8 inside the arena, give lightning a pulsing ring plus a vertical pre-strike beam, and avoid blue-white flowers near the arena centre.
- **Magenta bullets** have luminance 0.24, so they are darker than every sunlit ground in all biomes. They read as glowing dots only if they bloom, so use `hdrColor(0xff2a6d, 1.6)` for the core and keep the outer sprite saturated.

---

## 9. Verified r170 API facts used here
Sources fetched from `https://cdn.jsdelivr.net/npm/three@0.170.0/...`:
- `ShaderLib/meshlambert.glsl.js`
  - vertex order: `beginnormal_vertex` → … → `begin_vertex` → … → `project_vertex` → `worldpos_vertex` → `shadowmap_vertex` → `fog_vertex`;
  - fragment: `clipping_planes_fragment`, `map_fragment`, `color_fragment`, `normal_fragment_begin`, `emissivemap_fragment`, `lights_lambert_fragment`, `lights_fragment_begin/maps/end`, `aomap_fragment`, `opaque_fragment`, `tonemapping_fragment`, `colorspace_fragment`, `fog_fragment`.
  - `outputs` → `opaque_fragment` (r154+; `output_fragment` no longer exists).
- `ShaderChunk/begin_vertex`: `vec3 transformed = vec3( position );`. `project_vertex` applies `batchingMatrix`, `instanceMatrix` and `modelViewMatrix` to `transformed`. `worldpos_vertex` defines `worldPosition` only for envmap, shadow, transmission or spot-coords cases, which is why the patch computes its own `vEnvWorld`.
- `ShaderChunk/color_vertex`: `vColor *= instanceColor.xyz` under `USE_INSTANCING_COLOR`.
- `ShaderChunk/lights_lambert_pars_fragment`: exact string `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );` (the wrap-lighting replace target).
- `ShaderChunk/normal_fragment_begin`: `normal *= faceDirection` under `DOUBLE_SIDED` (the reason for the grass normal fix).
- `ShaderChunk/shadowmap_pars_fragment`: `getShadow(..., shadowIntensity, shadowBias, shadowRadius, ...)`. PCF uses radius; PCF_SOFT does not.
- `ShaderChunk/tonemapping_pars_fragment`: `NeutralToneMapping` (StartCompression 0.76, Desaturation 0.15). ACES multiplies by `exposure/0.6`. `constants.js`: `AgXToneMapping = 6`, `NeutralToneMapping = 7`.
- `webgl/WebGLProgram.js`: GLSL3 always (`#version 300 es`); prefix declares `attribute vec2 uv` unconditionally and `attribute vec3 color` only with vertex colours; `#define texture2D texture`.
- `WebGLRenderer.renderBufferDirect`: `geometry.isInstancedBufferGeometry` → `renderInstances(…, min(instanceCount, _maxInstanceCount))`. Tone mapping is `NoToneMapping` when rendering into a render target, so the composer's RenderPass output is linear HDR and OutputPass tone-maps.
- `postprocessing/OutputPass.js` supports `NEUTRAL_TONE_MAPPING`. `UnrealBloomPass.materialHighPassFilter`, `highPassUniforms.smoothWidth` (0.01) and HalfFloat targets. `LuminosityHighPassShader` line `float v = luminance( texel.xyz );`.
- `lights/LightShadow.js`: `intensity`, `radius` and `blurSamples` exist. `updateMatrices` does `shadowCamera.lookAt(target)` (the basis for texel snapping).
- `GTAOPass.js`: renders `normalMaterial` (MeshNormalMaterial) via `renderOverride` unless `setGBuffer(depthTexture, normalTexture)` is given.
- `onBeforeCompile` / `customProgramCacheKey`: three's default cache key uses `onBeforeCompile.toString()`. **Closures that differ only in captured values would share one program.** `patchEnv` therefore sets `customProgramCacheKey` from the injected strings and flags.

---

## Appendix — Drop-in code (r170, plain ES modules)

File layout suggestion: `src/env/common.js`, `ground.js`, `field.js`, `props.js`, `water.js`, `lighting.js`, `motes.js`. All imports use the existing import map.

### A. `src/env/common.js` — shared uniforms, GLSL noise, `patchEnv`, CPU noise, height and layout mask

```js
import * as THREE from 'three';

// ---------- shared uniforms: every patched material references these SAME objects ----------
export const ENV = {
  uTime:         { value: 0 },
  uWindDir:      { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 0.6 },
  uCloudScale:   { value: 0.016 },                       // 1/m  (~60 m cloud blobs)
  uCloudSpeed:   { value: new THREE.Vector2(2.0, 1.2) }, // m/s
  uCloudCover:   { value: 0.56 },                        // higher = fewer clouds
  uCloudDark:    { value: 0.74 },                        // direct-light multiplier in cloud shadow
  uHazeColor:    { value: new THREE.Color(0xbfe0c8) },
  uHazeLow:      { value: -7.0 },                        // y where height haze is full
  uEdgeHaze:     { value: new THREE.Vector2(62, 110) },  // radial haze start/end (m)
  uEdgeHazeMax:  { value: 0.35 },
  uFadeTarget:   { value: new THREE.Vector3(0, 1, 0) },  // player chest, world
  uCamDir:       { value: new THREE.Vector3(1, 1.22, 1).normalize() }, // target -> camera
  uFadeRadius:   { value: 2.2 },
};

export function updateEnv(dt, player) {
  ENV.uTime.value = (ENV.uTime.value + dt) % 3600;
  ENV.uFadeTarget.value.set(player.x, 1.0, player.z);
}

export function applyEnvSettings(s) {
  if (s.haze !== undefined) ENV.uHazeColor.value.set(s.haze);
  if (s.cloudCover !== undefined) ENV.uCloudCover.value = s.cloudCover;
  if (s.cloudDark !== undefined) ENV.uCloudDark.value = s.cloudDark;
  if (s.cloudScale !== undefined) ENV.uCloudScale.value = s.cloudScale;
  if (s.cloudSpeed) ENV.uCloudSpeed.value.set(s.cloudSpeed[0], s.cloudSpeed[1]);
  if (s.wind !== undefined) ENV.uWindStrength.value = s.wind;
}

// ---------- GLSL shared by vertex + fragment ----------
export const ENV_PARS = /* glsl */`
uniform float uTime;
uniform vec2  uWindDir;
uniform float uWindStrength;
uniform float uCloudScale;
uniform vec2  uCloudSpeed;
uniform float uCloudCover;
uniform float uCloudDark;
uniform vec3  uHazeColor;
uniform float uHazeLow;
uniform vec2  uEdgeHaze;
uniform float uEdgeHazeMax;
varying vec3  vEnvWorld;

float envHash(vec2 p) {                       // Dave Hoskins, hash without sine
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float envNoise(vec2 p) {                      // value noise, 0..1
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = envHash(i), b = envHash(i + vec2(1.0, 0.0));
  float c = envHash(i + vec2(0.0, 1.0)), d = envHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float envFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * envNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0; a *= 0.5; }
  return s / 0.9375;
}
float envCloud(vec2 xz) {
  float n = envFbm(xz * uCloudScale - uCloudSpeed * uCloudScale * uTime);
  return mix(1.0, uCloudDark, smoothstep(uCloudCover, uCloudCover + 0.12, n));
}
vec3 envHaze(vec3 col, vec3 wp) {
  float h = clamp(wp.y / uHazeLow, 0.0, 1.0);          // uHazeLow < 0
  h = h * h * (3.0 - 2.0 * h);
  float e = smoothstep(uEdgeHaze.x, uEdgeHaze.y, length(wp.xz)) * uEdgeHazeMax;
  return mix(col, uHazeColor, clamp(max(h * 0.75, e), 0.0, 1.0));
}
`;

const WIND_PARS = /* glsl */`
uniform float uWindHeight;  // local height where sway weight reaches 1
uniform float uWindAmp;     // metres at the top
uniform float uFlutter;     // leaf flutter metres
`;

const WIND_VERTEX = /* glsl */`
{
  #ifdef USE_INSTANCING
    mat4 envM = modelMatrix * instanceMatrix;
  #else
    mat4 envM = modelMatrix;
  #endif
  vec3 envO = envM[3].xyz;
  float wh = clamp(position.y / uWindHeight, 0.0, 1.0);
  wh *= wh;
  float ph = dot(envO.xz, vec2(0.37, 0.23));
  float gust = envNoise(envO.xz * 0.05 - uWindDir * uTime * 0.3);
  float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.4;
  vec3 off = vec3(uWindDir.x, 0.0, uWindDir.y) * (sway * 0.5 + gust) * uWindAmp * uWindStrength * wh;
  off += vec3(0.6, 0.25, 0.6) * sin(uTime * 6.0 + dot(position, vec3(4.1, 3.3, 3.7)) + ph) * uFlutter * wh;
  mat3 envR = mat3(envM);
  transformed += transpose(envR) * off / max(dot(envR[0], envR[0]), 1e-4); // world -> local (rot * uniform scale)
}
`;

const WORLD_VERTEX = /* glsl */`
#ifdef USE_INSTANCING
  vEnvWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vEnvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

const FADE_PARS = /* glsl */`
uniform vec3  uFadeTarget;
uniform vec3  uCamDir;
uniform float uFadeRadius;
`;

const FADE_FRAGMENT = /* glsl */`
{
  vec3 fr = vEnvWorld - uFadeTarget;
  float along = dot(fr, uCamDir);                     // > 0: between player and camera
  float perp = length(fr - along * uCamDir);
  float keep = smoothstep(uFadeRadius, uFadeRadius + 1.8, perp);
  keep = max(keep, 1.0 - smoothstep(0.3, 1.2, along));
  vec2 fc = mod(floor(gl_FragCoord.xy), 4.0);
  const float envBayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                                       3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  int bi = int(fc.x) + int(fc.y) * 4;
  if (keep < (envBayer[bi] + 0.5) / 16.0) discard;
}
`;

/**
 * Patch a MeshLambertMaterial (or MeshStandardMaterial) for the environment.
 * opts: cloud, haze, fade, wrap (Lambert only), normalFix (double-sided cards),
 *       wind: {height, amp, flutter}, uniforms, key,
 *       vertexPars, vertexMain, beginVertex (replaces begin_vertex), beginNormal (replaces beginnormal_vertex),
 *       fragmentPars, colorFragment (after color_fragment), emissiveFragment (after emissivemap_fragment)
 */
export function patchEnv(material, opts = {}) {
  const o = {
    cloud: true, haze: true, fade: false, wrap: false, normalFix: false, wind: null,
    uniforms: {}, key: '', vertexPars: '', vertexMain: '', beginVertex: null, beginNormal: null,
    fragmentPars: '', colorFragment: '', emissiveFragment: '', ...opts,
  };
  const windU = o.wind ? {
    uWindHeight: { value: o.wind.height ?? 4 },
    uWindAmp: { value: o.wind.amp ?? 0.15 },
    uFlutter: { value: o.wind.flutter ?? 0.03 },
  } : {};
  material.userData.envUniforms = { ...o.uniforms, ...windU };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENV, o.uniforms, windU);

    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\n${ENV_PARS}\n${o.wind ? WIND_PARS : ''}\n${o.vertexPars}`);
    if (o.beginNormal !== null) vs = vs.replace('#include <beginnormal_vertex>', o.beginNormal);
    if (o.beginVertex !== null) {
      vs = vs.replace('#include <begin_vertex>', o.beginVertex);          // must declare `transformed` and set vEnvWorld
    } else {
      vs = vs.replace('#include <begin_vertex>',
        `#include <begin_vertex>\n${o.wind ? WIND_VERTEX : ''}\n${o.vertexMain}\n${WORLD_VERTEX}`);
    }
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${ENV_PARS}\n${o.fade ? FADE_PARS : ''}\n${o.fragmentPars}`);
    if (o.fade) fs = fs.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FADE_FRAGMENT}`);
    if (o.colorFragment) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${o.colorFragment}`);
    if (o.normalFix) fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
    if (o.emissiveFragment) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${o.emissiveFragment}`);
    if (o.wrap) {
      fs = fs.replace('#include <lights_lambert_pars_fragment>', THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) * 0.6 + 0.4 ); dotNL *= dotNL;'));
    }
    if (o.cloud) {
      fs = fs.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nfloat envCl = envCloud( vEnvWorld.xz );\nreflectedLight.directDiffuse *= envCl;\nreflectedLight.directSpecular *= envCl;');
    }
    if (o.haze) fs = fs.replace('#include <opaque_fragment>', 'outgoingLight = envHaze( outgoingLight, vEnvWorld );\n#include <opaque_fragment>');
    shader.fragmentShader = fs;
  };

  const key = ['env', o.cloud, o.haze, o.fade, o.wrap, o.normalFix, !!o.wind, o.key,
    o.vertexPars, o.vertexMain, o.beginVertex, o.beginNormal, o.fragmentPars, o.colorFragment, o.emissiveFragment].join('|');
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

// ---------- CPU noise / helpers (deterministic) ----------
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.1, z * f - i * 9.7); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

// Camera-side ground direction (screen-bottom) for offset (1, 1.22, 1).
const NEAR_X = Math.SQRT1_2, NEAR_Z = Math.SQRT1_2;

/** Terrain: flat at y=0 inside flatR; far side rises, near (camera) side drops. */
export function makeHeightFn({ flatR = 56, ramp = 10, farRise = 5, nearDrop = -6, noiseAmp = 3, noiseFreq = 0.035, rivers = [] } = {}) {
  const base = (x, z) => {
    const r = Math.hypot(x, z);
    if (r <= flatR) return 0;
    const t = smooth(flatR, flatR + ramp, r);
    const side = smooth(-0.15, 0.55, (x * NEAR_X + z * NEAR_Z) / Math.max(r, 1e-3));
    const lvl = farRise + (nearDrop - farRise) * side;
    return t * (lvl + (fbm(x * noiseFreq, z * noiseFreq) - 0.5) * 2 * noiseAmp * (1 - 0.6 * side));
  };
  const fn = (x, z) => {
    let h = base(x, z);
    for (const rv of rivers) {
      const k = 1 - smooth(rv.width * 0.5 - 1, rv.width * 0.5 + 1.5, distToPolyline(x, z, rv.points));
      h = h * (1 - k) - 0.45 * k;                     // carve the channel
    }
    return h;
  };
  fn.uncarved = base;                                  // water surface follows this
  return fn;
}

/**
 * Layout mask: R path, G water(+bank falloff), B grass density, A height (h*8+128).
 * paths/rivers: [{ points: [[x,z],...], width }], obstacles: [{x,z,r}]
 */
export function buildLayoutMask({ meters = 256, res = 256, heightFn, paths = [], rivers = [], obstacles = [] }) {
  const half = meters / 2, cell = meters / res;
  const data = new Uint8Array(res * res * 4);
  const H = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    H[j * res + i] = heightFn(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell);
  }
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * cell, k = j * res + i;
      let pathV = 0, waterV = 0;
      for (const p of paths) {
        const d = distToPolyline(x, z, p.points);
        pathV = Math.max(pathV, 1 - smooth(p.width * 0.5 - 2, p.width * 0.5 + 2, d));
      }
      for (const rv of rivers) {
        const d = distToPolyline(x, z, rv.points);
        waterV = Math.max(waterV, 1 - smooth(rv.width * 0.5, rv.width * 0.5 + 5, d));
      }
      const hx = H[j * res + Math.min(i + 1, res - 1)] - H[j * res + Math.max(i - 1, 0)];
      const hz = H[Math.min(j + 1, res - 1) * res + i] - H[Math.max(j - 1, 0) * res + i];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const grass = Math.max(0, 1 - Math.max(pathV * 1.25, waterV * 1.1)) * (1 - smooth(0.45, 0.9, slope));
      data[k * 4] = Math.round(pathV * 255);
      data[k * 4 + 1] = Math.round(waterV * 255);
      data[k * 4 + 2] = Math.round(grass * 255);
      data[k * 4 + 3] = Math.min(255, Math.max(0, Math.round(H[k] * 8 + 128)));
    }
  }
  for (const o of obstacles) {                          // clear grass under trunks / rocks
    const rr = o.r + 0.5;
    const i0 = Math.max(0, Math.floor((o.x - rr + half) / cell)), i1 = Math.min(res - 1, Math.ceil((o.x + rr + half) / cell));
    const j0 = Math.max(0, Math.floor((o.z - rr + half) / cell)), j1 = Math.min(res - 1, Math.ceil((o.z + rr + half) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -half + (i + 0.5) * cell, z = -half + (j + 0.5) * cell;
      const k = (j * res + i) * 4 + 2;
      data[k] = Math.round(data[k] * smooth(o.r * 0.5, o.r + 0.5, Math.hypot(x - o.x, z - o.z)));
    }
  }
  const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);   // flipY=false: row 0 = z min
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  const sample = (x, z) => {
    const i = Math.min(res - 1, Math.max(0, Math.floor((x + half) / cell)));
    const j = Math.min(res - 1, Math.max(0, Math.floor((z + half) / cell)));
    const k = (j * res + i) * 4;
    return { path: data[k] / 255, water: data[k + 1] / 255, grass: data[k + 2] / 255, h: (data[k + 3] - 128) / 8 };
  };
  return { texture, origin: new THREE.Vector2(-half, -half), size: meters, sample };
}
```

### B. `src/env/ground.js` — ground mesh and splat shader

```js
import * as THREE from 'three';
import { patchEnv } from './common.js';

const GROUND_PARS = /* glsl */`
uniform sampler2D uMask;
uniform vec2  uMaskOrigin;
uniform float uMaskSize;
uniform vec3  uGroundA, uGroundB, uGroundDark, uPath, uPathEdge, uBank, uSlope;
uniform float uCracks;
varying float vEnvNY;
float envCrack(vec2 p) {                     // 1 on Voronoi cell borders
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(envHash(i + g), envHash(i + g + 31.7));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return 1.0 - smoothstep(0.02, 0.07, d2 - d1);
}
`;

const GROUND_COLOR = /* glsl */`
{
  vec2 xz = vEnvWorld.xz;
  vec4 m = texture(uMask, (xz - uMaskOrigin) / uMaskSize);
  float big  = envFbm(xz * 0.035);
  float mid  = envNoise(xz * 0.21);
  float fine = envNoise(xz * 1.7);
  vec3 c = mix(uGroundA, uGroundB, smoothstep(0.38, 0.62, big));
  c = mix(c, uGroundDark, smoothstep(0.6, 0.8, mid) * 0.45);
  c *= 0.93 + 0.14 * fine;
  c *= 1.0 - uCracks * 0.35 * envCrack(xz * 0.7) * smoothstep(0.35, 0.65, big);
  float pth  = m.r + (mid - 0.5) * 0.35;                 // noisy threshold = painted edge
  float worn = smoothstep(0.22, 0.42, pth);
  float path = smoothstep(0.48, 0.53, pth);
  c = mix(c, uPathEdge, worn * (1.0 - path) * 0.7);
  c = mix(c, uPath * (0.9 + 0.2 * fine), path);
  c = mix(c, uBank, smoothstep(0.25, 0.75, m.g));
  c = mix(c, uSlope * (0.85 + 0.3 * mid), 1.0 - smoothstep(0.72, 0.9, vEnvNY));
  diffuseColor.rgb = c;
}
`;

/** pal: { groundA, groundB, groundDark, path, pathEdge, bank, slope, cracks? } (hex) */
export function createGround({ mask, heightFn, pal, size = 260, segments = 200 }) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightFn(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();

  const C = (h) => new THREE.Color(h);
  const uniforms = {
    uMask: { value: mask.texture }, uMaskOrigin: { value: mask.origin }, uMaskSize: { value: mask.size },
    uGroundA: { value: C(pal.groundA) }, uGroundB: { value: C(pal.groundB) }, uGroundDark: { value: C(pal.groundDark) },
    uPath: { value: C(pal.path) }, uPathEdge: { value: C(pal.pathEdge) }, uBank: { value: C(pal.bank) },
    uSlope: { value: C(pal.slope) }, uCracks: { value: pal.cracks ?? 0 },
  };
  const mat = patchEnv(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
    key: 'ground', uniforms,
    vertexPars: 'varying float vEnvNY;', vertexMain: 'vEnvNY = normal.y;',
    fragmentPars: GROUND_PARS, colorFragment: GROUND_COLOR,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.userData.uniforms = uniforms;          // swap palette per biome by .value.set(hex)
  return mesh;
}
```

### C. `src/env/field.js` — camera-following instanced grass and flowers (with wind)

```js
import * as THREE from 'three';
import { patchEnv, mulberry32 } from './common.js';

export function makeBladeGeometry() {
  const W = [1.0, 0.78, 0.45], Y = [0.0, 0.42, 0.78], pos = [];
  for (let i = 0; i < 3; i++) pos.push(-0.5 * W[i], Y[i], 0, 0.5 * W[i], Y[i], 0);
  pos.push(0, 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = []; for (let i = 0; i < 7; i++) nrm.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  return g;
}

export function makeFlowerGeometry(petals = 5) {
  const pos = [], col = [], tint = [], idx = [];
  const stem = new THREE.Color(0x4f8a32), eye = new THREE.Color(0xf2c230), white = new THREE.Color(1, 1, 1);
  const push = (x, y, z, c, t) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); tint.push(t); return pos.length / 3 - 1; };
  const s0 = push(-0.15, 0, 0, stem, 0), s1 = push(0.15, 0, 0, stem, 0);
  const s2 = push(-0.1, 0.97, 0, stem, 0), s3 = push(0.1, 0.97, 0, stem, 0);
  idx.push(s0, s1, s2, s2, s1, s3);
  const c = push(0, 1.0, 0, eye, 0);
  const n = petals * 2, first = pos.length / 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = k % 2 === 0 ? 1.0 : 0.42;
    push(Math.cos(a) * r, 1.0, Math.sin(a) * r, white, 1);
  }
  for (let k = 0; k < n; k++) idx.push(c, first + ((k + 1) % n), first + k);   // faces +y
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  return g;
}

/** Window (U = screen-right, V = screen-up on the ground) that covers the view at minZoom. Rebuild on resize. */
export function fieldWindow(engine, minZoom = 0.6, margin = 6) {
  const vh = engine.viewSize / minZoom;
  const vw = vh * (innerWidth / innerHeight);
  const o = engine.isoOffset;
  const elev = Math.atan2(o.y, Math.hypot(o.x, o.z));
  return new THREE.Vector2(vw + margin, vh / Math.sin(elev) + margin);
}

const FIELD_VERTEX_PARS = /* glsl */`
attribute vec2 aOffset;
attribute vec4 aRand;                 // x yaw, y size/colour, z lean (-1..1), w clump cull threshold
uniform vec2 uCenter, uAxisU, uAxisV, uWindow, uMaskOrigin, uPlayer;
uniform float uMaskSize, uHeight, uWidth, uDensity, uPushRadius;
uniform sampler2D uMask;
varying float vFieldT;
varying float vFieldVar;
#ifdef FIELD_FLOWER
attribute vec3 aCol;
attribute float aTint;
uniform vec3 uPetal[4];
varying vec3 vFieldCol;
#endif
`;

const FIELD_BEGIN = /* glsl */`
vec3 transformed;
{
  vec2 fc = vec2(dot(uCenter, uAxisU), dot(uCenter, uAxisV));
  vec2 q = aOffset + uWindow * floor((fc - aOffset) / uWindow + 0.5);   // nearest periodic copy
  vec2 base = q.x * uAxisU + q.y * uAxisV;
  vec4 fm = texture(uMask, (base - uMaskOrigin) / uMaskSize);
  float patchN = envNoise(base * 0.11 + 3.7);
  float dens = fm.b * uDensity * smoothstep(0.2, 0.6, patchN + fm.b * 0.25);
  #ifdef FIELD_FLOWER
    dens *= smoothstep(0.58, 0.72, envNoise(base * 0.07 + 11.3));      // flower beds
  #endif
  float alive = step(aRand.w, dens);
  float h = uHeight * (0.65 + 0.7 * aRand.y) * (0.75 + 0.5 * patchN) * alive;
  float groundY = (fm.a * 255.0 - 128.0) / 8.0;
  float t = position.y;
  float ang = aRand.x * 6.2831853;
  vec2 rdir = vec2(cos(ang), sin(ang));
  vec2 rperp = vec2(-rdir.y, rdir.x);
  vec2 lxz = (rdir * position.x + rperp * position.z) * uWidth * (0.8 + 0.4 * aRand.y) * alive;
  float gust = envNoise(base * 0.07 - uWindDir * uTime * 0.6);
  float wave = sin(uTime * 2.4 - dot(base, uWindDir) * 0.45 + aRand.x * 3.0) * 0.3;
  vec2 bend = uWindDir * (gust * 0.9 + wave) * uWindStrength + rperp * aRand.z * 0.35;
  vec2 away = base - uPlayer;
  float pd = length(away);
  bend += away / max(pd, 0.001) * (1.0 - smoothstep(0.0, uPushRadius, pd)) * 1.2;
  float tt = t * t;
  transformed = vec3(base.x + lxz.x, groundY, base.y + lxz.y);
  transformed.xz += bend * h * tt;
  transformed.y += h * t * (1.0 - 0.3 * min(dot(bend, bend), 1.0) * tt);
  vFieldT = t;
  vFieldVar = clamp(envNoise(base * 0.045) * 0.7 + aRand.y * 0.3, 0.0, 1.0);
  #ifdef FIELD_FLOWER
    vFieldCol = mix(aCol, uPetal[int(aRand.y * 3.999)], aTint);
  #endif
  vEnvWorld = transformed;
}
`;

const FIELD_FRAG_PARS = /* glsl */`
uniform vec3 uRoot, uTipA, uTipB;
varying float vFieldT;
varying float vFieldVar;
#ifdef FIELD_FLOWER
varying vec3 vFieldCol;
#endif
`;

const FIELD_COLOR = /* glsl */`
#ifdef FIELD_FLOWER
  diffuseColor.rgb = vFieldCol;
#else
  {
    vec3 tipC = mix(uTipA, uTipB, vFieldVar);
    vec3 rootC = uRoot * (0.85 + 0.3 * vFieldVar);
    diffuseColor.rgb = mix(rootC, tipC, smoothstep(0.05, 1.0, vFieldT));
  }
#endif
`;

/**
 * opts: mask (from buildLayoutMask), window (Vector2), kind 'grass'|'flower', count, height (m), width (m),
 *       density, clump [min,max], clumpRadius, pushRadius, seed,
 *       colors: { root, tipA, tipB } or { petals: [hex...] }
 */
export function createField(opts) {
  const o = {
    kind: 'grass', count: 48000, window: new THREE.Vector2(78, 68), height: 0.55, width: 0.11, density: 1,
    clump: [5, 11], clumpRadius: 0.35, pushRadius: 1.6, seed: 7, colors: {}, ...opts,
  };
  const flower = o.kind === 'flower';
  const baseGeo = flower ? makeFlowerGeometry() : makeBladeGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = baseGeo.index;
  for (const name in baseGeo.attributes) geo.setAttribute(name, baseGeo.attributes[name]);

  const rng = mulberry32(o.seed), W = o.window;
  const off = new Float32Array(o.count * 2), rnd = new Float32Array(o.count * 4);
  for (let i = 0; i < o.count;) {
    const cu = rng() * W.x, cv = rng() * W.y, cr = rng();
    const n = o.clump[0] + Math.floor(rng() * (o.clump[1] - o.clump[0] + 1));
    for (let k = 0; k < n && i < o.count; k++, i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * o.clumpRadius;
      off[i * 2] = (((cu + Math.cos(a) * r) % W.x) + W.x) % W.x;
      off[i * 2 + 1] = (((cv + Math.sin(a) * r) % W.y) + W.y) % W.y;
      rnd[i * 4] = rng(); rnd[i * 4 + 1] = rng(); rnd[i * 4 + 2] = rng() * 2 - 1; rnd[i * 4 + 3] = cr;
    }
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = o.count;

  const s2 = Math.SQRT1_2;
  const petals = o.colors.petals ?? [0xffffff];
  const uniforms = {
    uCenter: { value: new THREE.Vector2() }, uPlayer: { value: new THREE.Vector2(1e5, 1e5) },
    uAxisU: { value: new THREE.Vector2(s2, -s2) },      // screen-right on ground
    uAxisV: { value: new THREE.Vector2(-s2, -s2) },     // screen-up on ground
    uWindow: { value: W.clone() },
    uMask: { value: o.mask.texture }, uMaskOrigin: { value: o.mask.origin }, uMaskSize: { value: o.mask.size },
    uHeight: { value: o.height }, uWidth: { value: o.width }, uDensity: { value: o.density }, uPushRadius: { value: o.pushRadius },
    uRoot: { value: new THREE.Color(o.colors.root ?? 0x3c7a2a) },
    uTipA: { value: new THREE.Color(o.colors.tipA ?? 0x8cc94f) },
    uTipB: { value: new THREE.Color(o.colors.tipB ?? 0xb8d85a) },
    uPetal: { value: [0, 1, 2, 3].map((i) => new THREE.Color(petals[i % petals.length])) },
  };
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  if (flower) mat.defines = { FIELD_FLOWER: '' };
  patchEnv(mat, {
    key: 'field', uniforms, normalFix: true,
    vertexPars: FIELD_VERTEX_PARS,
    beginNormal: 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );',
    beginVertex: FIELD_BEGIN,
    fragmentPars: FIELD_FRAG_PARS, colorFragment: FIELD_COLOR,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.uniforms = uniforms;
  mesh.userData.update = (center, player) => {           // call every frame
    uniforms.uCenter.value.set(center.x, center.z);
    uniforms.uPlayer.value.set(player.x, player.z);
  };
  return mesh;
}
```

### D. `src/env/props.js` — low-poly recipes, foliage wind materials, instancing

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchEnv, fbm, smooth } from './common.js';

function prep(g) {                                       // non-indexed, position only
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

function lump(geo, amount, rng) {                        // radial noise; duplicated verts move together
  const p = geo.attributes.position, seen = new Map(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${Math.round(v.x * 1e3)},${Math.round(v.y * 1e3)},${Math.round(v.z * 1e3)}`;
    let s = seen.get(key);
    if (s === undefined) { s = 1 + (rng() * 2 - 1) * amount; seen.set(key, s); }
    p.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  return geo;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/** Per-face colour: gradient * baked AO * jitter; optional moss on up faces; optional strata bands. */
function paintFaces(geo, bottom, top, rng, { jitter = 0.08, ao = 0.55, moss = null, mossAmt = 0.8, bands = null, bandH = 1.5 } = {}) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const cb = new THREE.Color(bottom), ct = new THREE.Color(top), c = new THREE.Color();
  const cm = moss !== null ? new THREE.Color(moss) : null;
  const bandCols = bands ? bands.map((h) => new THREE.Color(h)) : null;
  for (let f = 0; f < p.count; f += 3) {
    _a.fromBufferAttribute(p, f); _b.fromBufferAttribute(p, f + 1); _c.fromBufferAttribute(p, f + 2);
    const y = (_a.y + _b.y + _c.y) / 3;
    const t = (y - min.y) / Math.max(max.y - min.y, 1e-4);
    if (bandCols) {
      const L = bandCols.length, n = Math.floor(y / bandH + rng() * 0.15);
      c.copy(bandCols[((n % L) + L) % L]);
    } else {
      c.copy(cb).lerp(ct, t);
    }
    _b.sub(_a); _c.sub(_a);
    const ny = _b.cross(_c).normalize().y;
    if (cm && ny > 0.55) c.lerp(cm, mossAmt * smooth(0.55, 0.85, ny));
    c.multiplyScalar((ao + (1 - ao) * t) * (1 + (rng() * 2 - 1) * jitter));
    for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function finish(parts) { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; }  // flat normals

// pal fields used: trunk, trunkTop, leafDark, leafLight, rock, rockDark, moss, strata[], mesaCap, reedRoot, reedTip
export function makeBroadleaf(rng, pal) {
  const trunkH = 2.0 + rng() * 0.8;
  const trunk = prep(new THREE.CylinderGeometry(0.16, 0.3, trunkH, 6, 1));
  trunk.translate(0, trunkH / 2, 0);
  paintFaces(trunk, pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.6 });
  const blobs = [], n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.9 + rng() * 0.6;
    const g = lump(prep(new THREE.IcosahedronGeometry(r, 1)), 0.16, rng);
    g.scale(1, 0.82, 1);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : 0.55 + rng() * 0.6;
    g.translate(Math.cos(a) * d, trunkH + 0.5 + (i === 0 ? 0.6 : rng() * 0.9), Math.sin(a) * d);
    blobs.push(g);
  }
  const crown = paintFaces(mergeGeometries(blobs), pal.leafDark, pal.leafLight, rng, { ao: 0.5, jitter: 0.1 });
  return finish([trunk, crown]);
}

export function makePine(rng, pal) {
  const trunkH = 1.2 + rng() * 0.4;
  const trunk = prep(new THREE.CylinderGeometry(0.12, 0.22, trunkH + 1.0, 5, 1));
  trunk.translate(0, (trunkH + 1.0) / 2, 0);
  paintFaces(trunk, pal.trunk, pal.trunk, rng, { ao: 0.6 });
  const tiers = [], count = 3 + Math.floor(rng() * 2);
  let y = trunkH, r = 1.5 + rng() * 0.3;
  for (let i = 0; i < count; i++) {
    const h = r * 1.5;
    const cone = lump(prep(new THREE.ConeGeometry(r, h, 7, 1)), 0.08, rng);
    cone.rotateY(rng() * Math.PI);
    cone.translate(0, y + h / 2, 0);
    tiers.push(cone);
    y += h * 0.45; r *= 0.74;
  }
  const crown = paintFaces(mergeGeometries(tiers), pal.leafDark, pal.leafLight, rng, { ao: 0.45 });
  return finish([trunk, crown]);
}

export function makeAcacia(rng, pal) {
  const lean = (rng() - 0.5) * 0.35, topX = -Math.sin(lean) * 2.4;
  const wood = [];
  const trunk = prep(new THREE.CylinderGeometry(0.12, 0.22, 2.6, 5, 1));
  trunk.translate(0, 1.3, 0); trunk.rotateZ(lean);
  wood.push(trunk);
  for (let i = 0; i < 2; i++) {
    const b = prep(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 4, 1));
    b.translate(0, 0.8, 0);
    b.rotateZ((i ? 1 : -1) * (0.6 + rng() * 0.3));
    b.rotateY(rng() * Math.PI);
    b.translate(topX, 2.4, 0);
    wood.push(b);
  }
  const trunkG = paintFaces(mergeGeometries(wood), pal.trunk, pal.trunkTop ?? pal.trunk, rng, { ao: 0.65 });
  const top = [];
  for (let i = 0; i < 3; i++) {
    const r = 1.4 + rng() * 0.8;
    const g = lump(prep(new THREE.IcosahedronGeometry(r, 1)), 0.12, rng);
    g.scale(1, 0.28, 1);                                   // flat umbrella
    const a = (i / 3) * Math.PI * 2 + rng(), d = i === 0 ? 0 : 1.0 + rng() * 0.6;
    g.translate(topX + Math.cos(a) * d, 3.3 + rng() * 0.4, Math.sin(a) * d);
    top.push(g);
  }
  const canopy = paintFaces(mergeGeometries(top), pal.leafDark, pal.leafLight, rng, { ao: 0.45 });
  return finish([trunkG, canopy]);
}

export function makeBush(rng, pal) {
  const blobs = [], n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.45 + rng() * 0.35;
    const g = lump(prep(new THREE.IcosahedronGeometry(r, rng() < 0.5 ? 0 : 1)), 0.15, rng);
    const a = rng() * Math.PI * 2, d = i === 0 ? 0 : 0.35 + rng() * 0.3;
    g.translate(Math.cos(a) * d, r * 0.6, Math.sin(a) * d);
    blobs.push(g);
  }
  return finish([paintFaces(mergeGeometries(blobs), pal.leafDark, pal.leafLight, rng, { ao: 0.45 })]);
}

export function makeRock(rng, pal) {
  const g = lump(prep(new THREE.IcosahedronGeometry(1, rng() < 0.5 ? 0 : 1)), 0.28, rng);
  g.scale(1 + rng() * 0.5, 0.55 + rng() * 0.35, 1 + rng() * 0.4);
  g.translate(0, 0.25, 0);
  paintFaces(g, pal.rockDark, pal.rock, rng, { ao: 0.6, moss: pal.moss ?? null, mossAmt: 0.85 });
  g.computeVertexNormals();
  return g;
}

export function makeMesa(rng, pal, { radius = 8, height = 14 } = {}) {
  let g = new THREE.CylinderGeometry(radius * (0.8 + rng() * 0.15), radius, height, 11, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {                    // deterministic in position => caps match sides
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 1e-3) continue;
    const k = 1 + (fbm(x / r * 1.3 + 5 + y * 0.11, z / r * 1.3 - y * 0.07) - 0.5) * 0.5;
    p.setXYZ(i, x * k, y, z * k);
  }
  g = prep(g);
  g.translate(0, height / 2 - 0.5, 0);
  paintFaces(g, 0xffffff, 0xffffff, rng, { bands: pal.strata, bandH: 1.6, moss: pal.mesaCap, mossAmt: 1, ao: 0.7, jitter: 0.05 });
  g.computeVertexNormals();
  return g;
}

export function makeReeds(rng, pal, blades = 7) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const h = 1.0 + rng() * 0.8, w = 0.05;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, h, 0], 3));
    const bits = [blade];
    if (rng() < 0.4) { const cat = prep(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 5, 1)); cat.translate(0, h * 0.8, 0); bits.push(cat); }
    const g = mergeGeometries(bits);
    g.rotateZ((rng() - 0.5) * 0.35); g.rotateY(rng() * Math.PI); g.translate((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
    parts.push(g);
  }
  return finish([paintFaces(mergeGeometries(parts), pal.reedRoot, pal.reedTip, rng, { ao: 0.6 })]);
}

// ---------- materials (create once; shared by all species) ----------
export function createPropMaterials() {
  const lam = (extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
  return {
    tree:   patchEnv(lam(), { key: 'tree', wind: { height: 5.5, amp: 0.18, flutter: 0.035 }, fade: true, wrap: true }),
    canopy: patchEnv(lam(), { key: 'canopy', wind: { height: 5.5, amp: 0.12, flutter: 0.02 }, wrap: true }),
    bush:   patchEnv(lam(), { key: 'bush', wind: { height: 1.4, amp: 0.06, flutter: 0.025 }, wrap: true }),
    stat:   patchEnv(lam(), { key: 'static', wrap: true }),                 // rocks, mesas, ruins, bridge (merged)
    reed:   patchEnv(lam({ side: THREE.DoubleSide }), { key: 'reed', wind: { height: 1.8, amp: 0.25, flutter: 0.02 } }),
  };
}

/** items: [{x, z, y?, s?, sy?, rotY?, tiltX?, tiltZ?}] */
export function instanceProps(geo, material, items, { castShadow = true, receiveShadow = true, tint = 0.08, rng = Math.random } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.tiltX ?? 0, it.rotY ?? rng() * Math.PI * 2, it.tiltZ ?? 0);
    q.setFromEuler(e);
    const sc = it.s ?? 1;
    s.set(sc, sc * (it.sy ?? 1), sc);
    p.set(it.x, it.y ?? 0, it.z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    const j = (rng() * 2 - 1) * tint;
    mesh.setColorAt(i, c.setRGB(1 + j, 1 + j * 0.6 + (rng() - 0.5) * tint, 1 + j * 0.3));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Bake many non-swaying props into ONE mesh (1 draw + 1 shadow draw). */
export function mergeStatic(entries /* [{geo, x, z, y?, s?, rotY?}] */) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const geos = entries.map((en) => {
    q.setFromAxisAngle(up, en.rotY ?? 0);
    m.compose(p.set(en.x, en.y ?? 0, en.z), q, s.setScalar(en.s ?? 1));
    return en.geo.clone().applyMatrix4(m);
  });
  return mergeGeometries(geos);
}
```

### E. `src/env/water.js` — stylized river and waterfall

```js
import * as THREE from 'three';
import { patchEnv } from './common.js';

/** points: [[x,z],...]; yFn(x,z) -> surface y. uv.x across 0..1, uv.y along in metres. */
export function makeRiverGeometry(points, width, yFn = () => 0.03, step = 1.0) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength(), n = Math.max(2, Math.ceil(len / step));
  const pos = [], uv = [], nrm = [], idx = [];
  const p = new THREE.Vector3(), tg = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, p); curve.getTangentAt(u, tg);
    const l = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / l, nz = tg.x / l;
    const y = yFn(p.x, p.z);
    for (let s = 0; s < 2; s++) {
      const k = s === 0 ? -0.5 : 0.5;
      pos.push(p.x + nx * width * k, y, p.z + nz * width * k);
      uv.push(s, u * len);
      nrm.push(0, 1, 0);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // faces +y
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geometry: g, curve, length: len };
}

/** Vertical waterfall ribbon; v = metres from the top. Place on a far-side cliff, rotateY(PI/4) to face the camera. */
export function makeWaterfallGeometry(width, height) {
  const g = new THREE.PlaneGeometry(width, height, 1, 8);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (1 - uv.getY(i)) * height);
  g.translate(0, height / 2, 0);
  return g;
}

const WATER_PARS = /* glsl */`
uniform vec3 uDeep, uShallow, uFoam;
uniform float uWidth, uSpeed, uSparkle, uLength;
varying vec2 vWUv;
float wFoam = 0.0;
`;

const WATER_COLOR = /* glsl */`
{
  float across = abs(vWUv.x - 0.5) * 2.0;
  float edgeM = (1.0 - across) * 0.5 * uWidth;                 // metres to the nearest bank
  vec2 fuv = vec2(vWUv.x * uWidth, vWUv.y - uTime * uSpeed);
  float n1 = envNoise(fuv * vec2(0.55, 0.22));
  float n2 = envNoise(fuv * vec2(1.4, 0.45) + vec2(5.2, uTime * 0.35));
  float streak = smoothstep(0.6, 0.68, envNoise(fuv * vec2(1.1, 0.1)));
  vec3 c;
#ifdef WATERFALL
  c = mix(uShallow, uFoam, clamp(smoothstep(0.45, 0.75, n2) * 0.8 + streak * 0.5, 0.0, 1.0));
  wFoam = smoothstep(uLength - 1.5, uLength, vWUv.y);
  c = mix(c, uFoam, wFoam);
#else
  c = mix(uShallow, uDeep, smoothstep(0.0, 0.5 * uWidth, edgeM));
  c = mix(c, mix(uShallow, uFoam, 0.35), streak * 0.4);
  float fe = 0.25 + 0.45 * n1 + 0.12 * sin(vWUv.y * 1.7 - uTime * 2.5);
  wFoam = 1.0 - smoothstep(fe, fe + 0.12, edgeM);
  wFoam = max(wFoam, step(0.86, n2) * (1.0 - smoothstep(0.4, 1.8, edgeM)));
  c = mix(c, uFoam, wFoam);
#endif
  diffuseColor.rgb = c;
}
`;

const WATER_EMISSIVE = /* glsl */`
{
  vec2 sp = vEnvWorld.xz * 2.6;
  float s = envNoise(sp + vec2(uTime * 0.9, -uTime * 0.6)) * envNoise(sp * 1.37 - vec2(uTime * 0.7, uTime * 0.5));
  totalEmissiveRadiance += uFoam * uSparkle * smoothstep(0.62, 0.7, s) * (1.0 - wFoam);
}
`;

/** pal: { deep, shallow, foam }. Opaque; receives sun + cloud shadows. */
export function createWaterMaterial(pal, { width = 8, speed = 0.8, sparkle = 1.2, waterfall = false, length = 10 } = {}) {
  const uniforms = {
    uDeep: { value: new THREE.Color(pal.deep) }, uShallow: { value: new THREE.Color(pal.shallow) },
    uFoam: { value: new THREE.Color(pal.foam) }, uWidth: { value: width },
    uSpeed: { value: waterfall ? 6.0 : speed }, uSparkle: { value: waterfall ? 0 : sparkle }, uLength: { value: length },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (waterfall) mat.defines = { WATERFALL: '' };
  patchEnv(mat, {
    key: waterfall ? 'waterfall' : 'water', uniforms,
    vertexPars: 'varying vec2 vWUv;', vertexMain: 'vWUv = uv;',
    fragmentPars: WATER_PARS, colorFragment: WATER_COLOR, emissiveFragment: WATER_EMISSIVE,
  });
  return mat;
}
```

### F. `src/env/lighting.js` — biome atmospheres (engine `setAtmosphere` format), tone mapping, bloom, sun follow

```js
import * as THREE from 'three';
import { applyEnvSettings } from './common.js';

// Matches Engine.setAtmosphere(): moon = sun. `env` goes to applyEnvSettings().
export const BIOME_ATMOS = {
  forest: {
    background: 0xbfe0c8, hemiSky: 0xcfe6ff, hemiGround: 0x6b7a3a, hemiIntensity: 1.35,
    moon: 0xfff0d2, moonIntensity: 3.1,
    grade: { tint: [1.0, 1.0, 0.98], saturation: 1.08, contrast: 1.04, vignette: 0.18 },
    env: { haze: 0xbfe0c8, cloudCover: 0.56, cloudDark: 0.74, cloudScale: 0.016, cloudSpeed: [2.0, 1.2], wind: 0.55 },
  },
  barrens: {
    background: 0xf0d2a6, hemiSky: 0xb9d4ff, hemiGround: 0xa5683e, hemiIntensity: 1.2,
    moon: 0xffe6b8, moonIntensity: 3.4,
    grade: { tint: [1.04, 1.0, 0.94], saturation: 1.0, contrast: 1.05, vignette: 0.2 },
    env: { haze: 0xf0d2a6, cloudCover: 0.7, cloudDark: 0.78, cloudScale: 0.014, cloudSpeed: [3.0, 0.8], wind: 0.8 },
  },
  riverlands: {
    background: 0x8fa7b8, hemiSky: 0x9db6e6, hemiGround: 0x4e6b45, hemiIntensity: 1.6,
    moon: 0xffe7c4, moonIntensity: 2.6,
    grade: { tint: [0.97, 1.0, 1.04], saturation: 1.06, contrast: 1.05, vignette: 0.22 },
    env: { haze: 0x8fa7b8, cloudCover: 0.45, cloudDark: 0.58, cloudScale: 0.018, cloudSpeed: [4.0, 1.5], wind: 1.0 },
  },
};

export function applyBiomeAtmos(engine, id, seconds = 0) {
  const a = BIOME_ATMOS[id];
  engine.setAtmosphere(a, seconds);
  applyEnvSettings(a.env);
}

/** Call once after Engine construction. */
export function applySunnyPipeline(engine) {
  const r = engine.renderer;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  engine.bloom.threshold = 1.0;
  engine.bloom.strength = 0.55;
  engine.bloom.radius = 0.45;
  engine.bloom.highPassUniforms.smoothWidth.value = 0.1;
  const sun = engine.moon;
  sun.shadow.intensity = 0.85;            // r166+
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
}

/** Luminance-normalised HDR colour for VFX (bloom threshold 1.0). */
export function hdrColor(hex, targetLum = 1.4) {
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(targetLum / Math.max(l, 1e-3));
}

// ---- sun follow with texel snapping (replace the moon lines in Engine.follow) ----
export const SUN_OFFSET = new THREE.Vector3(-12, 34, 24);     // front-left, ~52 deg elevation
const _lm = new THREE.Matrix4().lookAt(SUN_OFFSET, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
const _lmInv = _lm.clone().invert();
const _v = new THREE.Vector3();

export function followSun(sun, target, zoom) {
  const half = Math.min(48, Math.max(26, 30 / zoom));
  const cam = sun.shadow.camera;
  if (cam.right !== half) {
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
  }
  const texel = (2 * half) / sun.shadow.mapSize.x;
  _v.copy(target).applyMatrix4(_lmInv);                       // world -> light space (rotation only)
  _v.x = Math.round(_v.x / texel) * texel;
  _v.y = Math.round(_v.y / texel) * texel;
  _v.applyMatrix4(_lm);
  sun.target.position.copy(_v);
  sun.position.copy(_v).add(SUN_OFFSET);
}

/** Lightning: pulse existing lights only (never add lights). */
export function lightningPulse(engine, k /* 0..1 envelope */) {
  engine.hemi.intensity = BIOME_ATMOS.riverlands.hemiIntensity + 2.5 * k;
}
```

### G. `src/env/motes.js` — ambient pollen, dust and seeds (camera-window Points, 1 draw)

```js
import * as THREE from 'three';
import { ENV } from './common.js';

export function createMotes({ count = 600, window, color = 0xfff1b8, size = 0.1, height = 4, drift = new THREE.Vector2(0.4, 0.2), intensity = 0.9 }) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * window.x; pos[i * 3 + 1] = 0.3 + Math.random() * height; pos[i * 3 + 2] = Math.random() * window.y;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const s2 = Math.SQRT1_2;
  const uniforms = {
    uTime: ENV.uTime, uCenter: { value: new THREE.Vector2() }, uWindow: { value: window.clone() },
    uAxisU: { value: new THREE.Vector2(s2, -s2) }, uAxisV: { value: new THREE.Vector2(-s2, -s2) },
    uDrift: { value: drift }, uPPU: { value: 40 }, uSize: { value: size },
    uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uPPU, uSize;
      uniform vec2 uCenter, uWindow, uAxisU, uAxisV, uDrift;
      varying float vA;
      void main() {
        vec2 o = position.xz + uDrift * uTime + vec2(sin(uTime * 0.7 + position.y * 3.1), cos(uTime * 0.5 + position.x)) * 0.6;
        vec2 fc = vec2(dot(uCenter, uAxisU), dot(uCenter, uAxisV));
        vec2 q = o + uWindow * floor((fc - o) / uWindow + 0.5);
        vec2 w = q.x * uAxisU + q.y * uAxisV;
        float y = position.y + sin(uTime * 0.9 + position.x * 0.37) * 0.3;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(w.x, y, w.y, 1.0);
        gl_PointSize = uSize * uPPU;
        vA = 0.5 + 0.5 * sin(uTime * 2.0 + position.x * 7.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor * (1.0 - smoothstep(0.0, 0.5, d)) * vA, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (center, ppu) => { uniforms.uCenter.value.set(center.x, center.z); uniforms.uPPU.value = ppu; };
  return pts;
}
```

### H. Integration sketch (world.js / engine.js)

```js
// engine.js (constructor, after composer creation)
import { applySunnyPipeline, followSun } from '../env/lighting.js';
applySunnyPipeline(this);
// engine.js follow(): replace the two `this.moon.position/target` lines with
followSun(this.moon, this.camTarget, this.zoom);

// world.js setBiome('forest')
import { ENV, updateEnv, makeHeightFn, buildLayoutMask } from '../env/common.js';
import { createGround } from '../env/ground.js';
import { createField, fieldWindow } from '../env/field.js';
import { createPropMaterials, makeBroadleaf, makePine, makeBush, makeRock, instanceProps, mergeStatic } from '../env/props.js';
import { applyBiomeAtmos } from '../env/lighting.js';

const stream = { points: [[-70, -20], [-30, -8], [0, 4], [30, 18], [70, 30]], width: 5 };
const path   = { points: [[-60, 40], [-20, 12], [10, -10], [55, -45]], width: 4 };
const heightFn = makeHeightFn({ farRise: 5, nearDrop: -6, rivers: [stream] });
const obstacles = [/* {x,z,r} of every rock/tree/bush you place, from your placement pass */];
const mask = buildLayoutMask({ heightFn, paths: [path], rivers: [stream], obstacles });
const ground = createGround({ mask, heightFn, pal: { groundA: 0x5e9b3a, groundB: 0x7db548, groundDark: 0x3f7a2e,
  path: 0xb08a5a, pathEdge: 0x9aa552, bank: 0x6b5a3e, slope: 0x7d7466 } });
const win = fieldWindow(engine);
const grass = createField({ mask, window: win, count: 48000, colors: { root: 0x3c7a2a, tipA: 0x8cc94f, tipB: 0xb8d85a } });
const flowers = createField({ mask, window: win, kind: 'flower', count: 4000, height: 0.35, width: 0.12, clump: [3, 6],
  clumpRadius: 0.5, colors: { petals: [0xece8da, 0xffd95a, 0x8fa8ff, 0xb9a7ff] } });
scene.add(ground, grass, flowers);
applyBiomeAtmos(engine, 'forest');

// per frame
updateEnv(dt, player.pos);
grass.userData.update(engine.camTarget, player.pos);
flowers.userData.update(engine.camTarget, player.pos);
```

---

## Draw-call and triangle budget (per biome, worst case Forest)

| Item | Main draws | Shadow draws | Tris |
|---|---|---|---|
| Ground (260 m, 200²) | 1 | 0 | 80k |
| Grass / flowers | 2 | 0 | 240k / 48k |
| Trees 3 species × 2 variants (~120 inst.) | 6 | 6 | 40k |
| Canopy sea beyond r 80 | 1 | 0 | 25k |
| Bushes ×2, reeds/ferns ×1 | 3 | 2 | 15k |
| Static merge (rocks, mesas, ruins, bridge, bones) | 1 | 1 | 10–20k |
| Water (river + stream merged) + waterfalls | 2 | 0 | 1k |
| Ambient particles ×2, god-ray quads ×1 | 3 | 0 | – |
| Blob contact shadows | 1 | 0 | 0.6k |
| **Total** | **~20–25** | **~9–13** | **~450k** |

Well under the 60 draw-call target, which leaves headroom for 320 enemies and VFX.

## Sources
- three r170 sources (jsdelivr): `src/renderers/shaders/ShaderLib/meshlambert.glsl.js`, `ShaderChunk/{begin_vertex,project_vertex,worldpos_vertex,color_vertex,color_fragment,opaque_fragment,normal_fragment_begin,lights_lambert_pars_fragment,lights_fragment_end,shadowmap_pars_fragment,tonemapping_pars_fragment,uv_pars_vertex,fog_vertex}.glsl.js`, `src/renderers/webgl/WebGLProgram.js`, `src/renderers/WebGLRenderer.js`, `src/lights/LightShadow.js`, `examples/jsm/postprocessing/{OutputPass,UnrealBloomPass,GTAOPass}.js`, `examples/jsm/shaders/LuminosityHighPassShader.js`. Base: https://cdn.jsdelivr.net/npm/three@0.170.0/ (GitHub: https://github.com/mrdoob/three.js/tree/r170)
- Lighting units: https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
- PBR Neutral: https://www.khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products · AgX saturation: https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609
- N8AO: https://github.com/N8python/n8ao (README: ortho support, halfRes, transparency renders twice) · npm `n8ao` 1.10.1 / 2.0.1, `postprocessing` 6.36.6 peer `three >=0.157 <0.173`
- Grass: https://discourse.threejs.org/t/simple-instanced-grass-example/26694 · https://jsfiddle.net/felixmariotto/hvrg721n/ · https://jsfiddle.net/prisoner849/n1emstwd/ · https://tympanus.net/codrops/?p=83092
- Trees: https://threejs.org/docs/pages/ForestGenerator.html · https://discourse.threejs.org/t/procedural-instanced-forest-high-performance-real-trees/88610
- Occlusion fade: https://engine.needle.tools/docs/api/SeeThrough · https://godotshaders.com/shader/camera-occlusion-dither/
- Toon water: https://code.tutsplus.com/creating-toon-water-for-the-web-part-1--cms-30447t · https://discourse.threejs.org/t/toon-water-shader-with-depth-based-fog-and-intersection-foam/35978
- Hash without sine (Dave Hoskins): https://www.shadertoy.com/view/4djSRW
