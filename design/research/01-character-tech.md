# 01 · Character tech: procedural models + procedural animation for 320 enemies (three r170)

Research report for Riftbound. Scope: how to build, animate and shade up to 320 procedurally modelled enemies at 60 fps, plus one detailed boss, with no build step and no model files.

**Verification status.** I checked every three.js API name used here against the r170 source on jsDelivr: `Skeleton.js`, `SkinnedMesh.js`, `InstancedMesh.js`, `BatchedMesh.js`, `Frustum.js`, `Material.js`, `CapsuleGeometry.js`, `WebGLRenderer.getProgram`, `WebGLObjects`, `WebGLShadowMap`, the shader chunks and `BufferGeometryUtils`. The drop-in code in Appendix B was executed in two ways:

1. **Node 24 against three r170.** All checks pass:
   - the bone solver matches `THREE.Matrix4` to within 2e-7;
   - all injection points exist in the Lambert, Toon, Standard, Depth and Basic shaders;
   - every normal has unit length.
2. **Headless Chrome (WebGL2 through SwiftShader) with the real r170 build from the CDN.** The scene had 320 animated enemies of 3 types plus 1 boss, sun with PCFSoft shadows, hull outlines and blob shadows. Results:
   - no shader errors and `gl.getError() == 0`;
   - **10 draw calls and 5 GPU programs in total**;
   - the screenshots show the expected outlines, status tint, hit-flash, rim light, blob shadows and boss shadow.

---

## TL;DR

1. **Architecture: "instanced rigid skinning."** Use **one `InstancedMesh` per enemy type**. Each type's geometry is all its primitive parts merged into one mesh, with a per-vertex `aBone` attribute and vertex colours.
2. **Per-instance bone matrices live in one `RGBA32F DataTexture` per type.** Row = instance slot. Each bone is 3 texels holding a 3×4 affine matrix, plus 1 extra texel per row for flash/tint. The vertex shader reads it with `texelFetch(..., gl_InstanceID)`, injected through `onBeforeCompile`.
3. **Poses are computed in plain JS** (`Pose.rot/off/scl` layered additively, then a flat-array solver), so animation is written like ordinary bone code. Measured CPU cost: **~0.21 ms per frame for 320 enemies**.
4. **The root transform (position, yaw, spawn-rise scale, death squash) goes in `instanceMatrix`.** Hit-flash and status tint use the FX texel, giving a per-instance `mix()` to the flash colour and an emissive add. Glowing eyes and runes use a per-vertex `aGlow` value above 1, so they bloom with no extra mesh.
5. **Draw calls:** 1 per type, +1 per type for the outline, +1 for all blob shadows. That is about 25 draws for 320 enemies, versus about 960 with the current 3 meshes per enemy. Bosses use the same class with `capacity: 1` and `castShadow: true`, which adds a `customDepthMaterial` with the same injection.
6. **Rejected:** a SkinnedMesh per enemy (320 draws, 320 skeleton updates and 320 bone-texture uploads per frame); a Group of meshes per enemy (2000+ draws); BatchedMesh (no per-part bones, needs `WEBGL_multi_draw`, which is missing on Firefox, and the fallback is one draw per instance); VAT (cannot blend per-instance procedural layers).
7. **Modelling:** use `PartBuilder` to place Box, tapered Box, Icosahedron, Capsule, Cone, Lathe and Extrude parts with a colour, a bone and an optional glow. It merges them into flat-shaded, non-indexed geometry of **200–450 triangles** per enemy (measured: husk 436, spider 380, bat 200).
8. **Animation:** advance the gait phase by **distance actually moved** divided by stride, where stride = `4·legLen·sin(swingAmp)`, so feet do not slide. Recipes are included for biped, quadruped (trot/walk/gallop), spider tetrapod, asymmetric wing flap with a lagging tip, spring-driven tail/neck chains, anticipation→strike→recovery attacks, hit recoil, breathing, hover, spawn rise and death squash.
9. **Shading:** `MeshLambertMaterial` with vertex colours, `flatShading`, a top-masked fresnel rim, 1.6 px inverted-hull outlines (cheap when instanced) and one InstancedMesh of soft blob shadows. Keep the flash colour below 1.0 so it never blooms. Consider `NeutralToneMapping` instead of ACES for the stylised palette.
10. **Gotchas:**
    - `Material.clone()` does **not** copy `onBeforeCompile`.
    - `InstancedMesh` and `SkinnedMesh` bounding spheres are computed once and go stale, so set `frustumCulled = false`.
    - Never share one material between an `InstancedMesh` and a plain `Mesh` (it recompiles every frame).
    - Set `instanceColor` before the first render.
    - A 2D `DataTexture` always re-uploads in full, so keep capacity tight.

---

## 1. Animation architecture for 300+ procedural characters

### 1.1 What r170 actually does per object (from source)

| Mechanism | r170 behaviour (file) | Consequence at 320 enemies |
|---|---|---|
| `SkinnedMesh` skeleton | `WebGLObjects.update()` calls `skeleton.update()` once per frame per skeleton. That multiplies `bone.matrixWorld × boneInverse` for every bone and sets `boneTexture.needsUpdate = true` (`Skeleton.js`). Each skeleton owns its own `DataTexture` (minimum 4×4 texels; `computeBoneTexture`). | 320 skeleton updates, **320 separate texture uploads** (`texSubImage2D`) and 320 texture binds per frame. Bones are `Object3D`s, so `updateMatrixWorld` also walks about 3,000 extra nodes. |
| `SkinnedMesh` culling | `Frustum.intersectsObject` uses `object.boundingSphere`. If it is null, `SkinnedMesh.computeBoundingSphere()` CPU-skins **every vertex** once and caches the result. | The sphere goes stale as the animation moves. Either set your own sphere or turn culling off. |
| `InstancedMesh` | `instanceMatrix` is an `InstancedBufferAttribute` (16 floats). `instanceColor` is created lazily by `setColorAt` and **multiplies** diffuse. Its `boundingSphere` is computed once over all instances, then cached. | One draw per type. You **must** set `frustumCulled = false`, or call `computeBoundingSphere()` every frame. Custom per-instance data must come from extra instanced attributes or a texture indexed by `gl_InstanceID`. |
| `BatchedMesh` | API: `addGeometry`, `addInstance`, `setMatrixAt`, `setColorAt`, `setVisibleAt`, `setGeometryIdAt`, `setInstanceCount`, `optimize`. Matrices live in a texture and are indexed by `getIndirectIndex(gl_DrawID)`. CPU-side per-instance culling and sorting are on by default. If `WEBGL_multi_draw` is unavailable, it falls back to one `drawArrays` call per instance. | Many geometries can share one draw. But there are no per-part bones unless **every part is its own instance** (≈2,500 instances). Firefox lacks multi-draw, so the fallback means about 2,500 draws. Custom per-instance data needs your own texture plus shader patching. |
| Program cache | `getProgram()` builds a key from the shader parameters plus `material.customProgramCacheKey()`, which defaults to `onBeforeCompile.toString()`. **Programs are shared across materials with the same key; uniforms are per material.** `onBeforeCompile` runs once per material per key. | All rig materials share **one** program, and each type's texture uniform stays separate. |

### 1.2 Options compared (320 enemies, about 8 bones and 400 triangles each)

| Option | Draw calls | CPU per frame | GPU uploads per frame | Animation authoring | Verdict |
|---|---|---|---|---|---|
| (a) `SkinnedMesh` per enemy, rigid skinning, shared geometry, `Skeleton` per instance | 320 (+320 for outlines) | `Object3D` bone traversal (~3k nodes) + 320 `skeleton.update` + per-draw uniform/texture binds. Roughly 2–5 ms in JS plus driver overhead. | 320 small texture uploads (≈1 KB each). Many small `texSubImage2D` calls are a known driver hot spot. | Excellent: real bones, `Object3D` API | Fine for **≤ 30** characters, not for 320 |
| (b) Group of separate meshes (today: 3 per enemy) | 960–2,500 | Scene-graph traversal + per-draw state changes | instance-free uniforms | Easy | Already the bottleneck |
| (c) `InstancedMesh` per type + **pure GPU** animation (part id and pivot per vertex, phase/state per instance, all motion formulas in GLSL) | 1 per type | Near zero | One small instanced attribute | Poor: every gait, attack and boss move is GLSL; layering and debugging are hard | Fastest, but too rigid for design iteration |
| **(c′) `InstancedMesh` per type + CPU-solved rigid bones in a float texture** (recommended) | **1 per type** (+1 for outline) | **0.21 ms measured** for 320 (pose + solve + write) | One texture per type (≈ capacity × (bones×3+1) × 16 B; 128 × 25 texels = 51 KB) + `instanceMatrix` (range-limited) | Excellent: JS pose functions, additive layers, any rig per type | **Recommended** |
| (d) `BatchedMesh` | 1 if multi-draw is supported, else N | CPU culling/sorting per instance | matrices texture + colour texture | Needs one instance per part (2.5k) or custom shader | Rejected: Firefox fallback, no per-instance emissive |
| (e) `InstancedMesh` + baked vertex-animation textures | 1 per type | ≈0 | none | Clips only. You lose per-instance layering (attack timing, hit recoil, aim, spawn/death blends) unless you bake many variants. | Rejected for procedural style; possible later LOD for distant fodder |

**Why (c′) wins under our constraints:**

- It keeps the authoring model of (a): a skeleton of pivots and JS code that rotates bones.
- It has the draw-call profile of (c). Per-type cost does not grow with enemy count, apart from one texture row and 64 B of `instanceMatrix` per enemy.
- It needs no extra library: about 250 lines and plain `onBeforeCompile`. It works with Lambert, Toon and Standard materials, shadow-depth materials and an outline hull, all reading the same texture.

The same technique is used by community "instanced skinned mesh" work (bone matrices in a texture row indexed by `gl_InstanceID`; see sources 3–6). `@three.ez/instanced-mesh` (InstancedMesh2) also implements skinning, but it pulls in `bvh.js`, targets glTF/AnimationMixer workflows and is far more machinery than a no-build project needs.

### 1.3 How each requirement maps onto (c′)

| Need | Where it lives |
|---|---|
| Position, facing yaw, spawn-rise y offset, spawn/death/hit scale | `instanceMatrix`. `RigType.push(x,y,z,yaw,sx,sy,sz,…)` writes a column-major T·Ry·S matrix directly; no `Matrix4` is allocated. three's instancing normal fix (dividing by squared column lengths) keeps lighting correct under squash. |
| Walk/run, idle breathing, attack wind-up/lunge, flap, hover, hit recoil | `Pose` (9 floats per bone: rot xyz, offset xyz, scale xyz, about the bone pivot, hierarchical). Layers stack: `bipedPose → bipedAttack → hitReact`. |
| Hit-flash (white, 0.08 s) | FX texel `.a` → fragment `outgoingLight = mix(outgoingLight, uFlashColor, a)` before tone mapping. `uFlashColor = 0.95`, so it never crosses the bloom threshold. |
| Status tint (emissive colour) | FX texel `.rgb` is added to `totalEmissiveRadiance`. Premultiply by intensity, e.g. frost `(0.0, 0.25, 0.5)`. |
| Elite/faction recolour without a new type | Optional: `mesh.setColorAt(i, color)` multiplies diffuse (built into three). Call it once at creation so the program never changes. |
| Glowing eyes or runes that bloom | Per-vertex `aGlow` (for example 2.5): `totalEmissiveRadiance += diffuseColor.rgb * vGlow`. |
| Boss (up to about 20 parts, richer rig) | Same `RigType` with `capacity: 1`, up to about 32 bones (texture width 97), `castShadow: true` (adds `customDepthMaterial` with the same vertex injection). Weapons can be separate bones of the same mesh, so a boss is 1 draw (+1 outline, +1 shadow). |

### 1.4 If you ever need real `SkinnedMesh` (for example a single hero or a boss with a glTF-like workflow)

This is rigid skinning in r170. It was not adopted for enemies, but here it is for completeness:

```js
// geometry from PartBuilder.build(); convert aBone → skinIndex/skinWeight once (shared by all instances)
const n = geo.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
for (let i = 0; i < n; i++) { si[i * 4] = geo.attributes.aBone.getX(i); sw[i * 4] = 1; }
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
// per instance: Bones positioned at pivots (relative to parent pivot), shared geometry + material
function makeSkinned(def, geo, mat) {
  const bones = def.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  def.bones.forEach((b, i) => {
    const p = b.pivot, pp = b.parent >= 0 ? def.bones[b.parent].pivot : [0, 0, 0];
    bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));      // computes boneInverses from current (bind) pose
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.5); // avoid CPU skinning of all verts
  return mesh;                                 // animate bones[i].rotation / .position / .scale
}
```

Each such mesh costs one draw, one skeleton update and one bone-texture upload per frame. Use it only for counts well below 50.

---

## 2. Modelling recipes from primitives (Quaternius / KayKit / Synty-style)

### 2.1 Readability rules for the camera

- **Pixel budget.** About 24 m are visible vertically at zoom 1, which gives **≈45 px/m** at 1080p (27–72 px/m across zoom 0.6–1.6). A 0.1 m detail is about 4 px.
  - Minimum part thickness: **0.08 m** (bat ears, spider legs).
  - Meaningful features (eyes, horns, weapon heads): **≥ 0.12 m**.
  - Eyes: 0.12–0.15 m glowing blobs. They read from across the screen.
- **Silhouette first.** Exaggerate one signature trait per enemy: brute = huge shoulders and tiny head, imp = big head and ears, charger = horns. Heads should be 1.2–1.5× realistic size; hands and feet chunky; weapons 1.3–1.6×.
- **Colour.** Use 3–5 flat colour blocks per enemy. Use value contrast (dark legs, mid body, light head/face) so the top-down camera reads the shape. Apply the faction palette to the dominant block, and keep a single bright, saturated accent (eyes, gem, rune) as the "target point".
- **Polycount.** Keep each type at **200–800 triangles**. Detail is invisible at 45–70 px, and the cost is per vertex × instances.
- **Flat shading.** Use flat shading everywhere for the faceted low-poly look. `PartBuilder` writes per-face normals, and `flatShading: true` (Lambert/Standard) also derives them in screen space, so they stay correct under any squash. Smooth shading suits only blobs, slimes and ghosts (`build({ flat: false })`).
- **Vertex colours vs material groups.** Always use **vertex colours** (one material, one draw). Groups mean one draw per group.

### 2.2 Primitive cookbook (unit primitives in `PRIM`, scaled per part)

| Body part | Primitive | Notes |
|---|---|---|
| Torso, pelvis | `taperedBox(w,h,d, topX, topZ, topShiftZ, botX, botZ)` | Wider shoulders (`topX` 1.1–1.3); hunch with `topShiftZ` 0.05–0.15 |
| Head | `IcosahedronGeometry(0.5, 1)` (80 triangles), squashed; or a Box for golems | Add a jaw box or brow box for character |
| Upper limbs | `CapsuleGeometry(0.5, 1, 2, 6)` scaled, or a tapered box | r170 signature is **`(radius, length, capSegments, radialSegments)`**; total height = length + 2·radius. Later releases add a `heightSegments` parameter, so do not copy newer code. |
| Fists, feet, knuckles, rocks | `Icosahedron(0.5, 0)` (20 triangles) or a Box | Chunky reads best |
| Horns, claws, teeth, spikes, spider legs | `ConeGeometry(0.5, 1, 4)` (8 triangles) | Rotate so the apex points outward |
| Wings, ears, fins, blades, capes | `ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false })` | Asymmetric shapes: mirror with `scale: [-1,1,1]`; `PartBuilder` flips winding |
| Shells, bellies, pots, helmets, skirts | `LatheGeometry(points, 6–8)` | Low radial count gives the faceted look |
| Tail, neck | Chain of tapered boxes, **one bone per segment** | Animate with `chainPose` |
| Shields, gems | `Cylinder(…, 6)`, `Octahedron` | |

### 2.3 r170 geometry API facts that matter

- `BufferGeometryUtils.mergeGeometries(geometries, useGroups = false)` requires **identical attribute sets** and **all indexed or all non-indexed** inputs (otherwise `console.error` and `null`). Lathe and Extrude carry `uv`; Polyhedron is non-indexed; Box/Sphere/Cylinder are indexed. That is why `PartBuilder` writes its own merge: it copies `position` only, welds, recomputes normals and appends.
- `mergeVertices(geometry, tolerance = 1e-4)` welds by **all** attributes. Strip `normal` and `uv` first to weld by position and get smooth normals (needed for the outline hull: a Box has 24 split vertices, and an unwelded hull cracks at the corners).
- `toNonIndexed()` on an already non-indexed geometry warns and returns `this`, so check `geometry.index` first.
- Lathe, Capsule and Cone poles create **zero-area triangles**, which give NaN face normals. `PartBuilder` drops them (found during verification: 24 degenerate triangles in the husk's capsules).
- A negative-determinant transform (mirroring) flips triangle winding, so back-face culling hides the part. Swap vertices 1 and 2 of each triangle.
- `Color.set(0xRRGGBB)` converts sRGB to the linear working space. Vertex colours are read as linear, so write `color.r/g/b` directly (this is what three expects).

### 2.4 Measured triangle counts (from `PartBuilder.build()`)

| Example | Triangles | Bones |
|---|---|---|
| Husk (biped, 8 bones) | 436 | 8 |
| Spider (8 legs) | 380 | 10 |
| Bat | 200 | 6 |

A 320-enemy crowd is about 140k triangles, or about 280k with outline hulls. That is trivial for any discrete or integrated GPU from the last 6 years.

---

## 3. Procedural animation recipes

All recipes are implemented in `anim.js` (Appendix B). Conventions: the model faces **+Z**, up is +Y, and the character's left is **+X**.

- A part hanging *below* its pivot (leg, arm): **negative rx swings it forward**.
- A part *above* its pivot (torso, neck): **positive rx leans it forward**.
- A part pointing +X (left wing or left spider leg): positive rz raises it, and negative ry swings it forward. Mirror both for −X parts.

### 3.1 Foot sliding: drive phase by distance, not time

- `phase += distanceMovedThisFrame / stride` (wrap to [0,1)). Amplitude scales with `speedN = smoothed(speed / maxSpeed)`, so at zero speed the legs settle and the idle layer takes over.
- **Stride per full cycle for a rigid leg** of hip-to-foot length `L` swinging ±`A` rad is `stride = 4·L·sin(A)` (stance sweeps `2L·sinA` per half-cycle). Example: husk L = 0.85 and A = 0.55 give 1.78 m.
- Knockback, slows and pushes therefore animate correctly, because a frozen or slowed enemy's legs slow down with it. This is the "stride wheel" idea (David Rosen, GDC; see sources 10–11).

### 3.2 Biped (`bipedPose`)

- **Legs:** `legL.rx = -sin(2πφ)·A`, `legR.rx = +sin(2πφ)·A`.
- **Arms:** opposite sign to the same-side leg, about 1.1× the leg amplitude.
- **Hip bob at 2× frequency:** `hips.y += bob·(0.5 + 0.5·cos(4πφ))·s`, lowest at contact and highest when passing.
- **Twist:** pelvis `ry = -sin·t`, torso `ry = +1.6·sin·t` (counter-twist), forward lean `torso.rx = lean·s`, and the head counter-pitches to keep the gaze level.
- **Idle (1 − s):** the torso breathes with scale y +4% at about 0.35 Hz (`sin(t·2.2)`), arms drift slightly and the head nods slightly.
- **Run vs walk:** the same function with a larger amplitude, more lean and more bob. Blend the parameters by `speedN`; there is no state switch.

### 3.3 Quadruped (`quadrupedPose`)

| Gait | Phase offsets (FL, FR, BL, BR) | Use for | Body motion |
|---|---|---|---|
| Trot (default) | 0, 0.5, 0.5, 0 | Diagonal pairs move together | Body pitch-rocks at 2× frequency |
| Walk (four-beat) | 0.25, 0.75, 0, 0.5 | Slow beasts | |
| Gallop | 0, 0.1, 0.5, 0.6 | Chargers | Body pitch ±0.14 rad at 1× frequency |

Legs lift by `max(0, cos(phase))·lift` during the forward swing.

### 3.4 Spider / insect (`spiderPose`)

- **Alternating tetrapod:** group A = L0 R1 L2 R3 and group B = R0 L1 R2 L3, half a cycle apart.
- Add a per-pair ripple offset of `i·0.06` so it reads as a wave.
- **Per leg:** swing `ry = ∓sin(p)·A`, lift `rz = ±max(0, cos p)·L`. The leg lifts exactly while it swings forward.
- The body bobs twice per cycle.

### 3.5 Wings (`wingPose`)

- **Asymmetric flap.** Warp the phase so the downstroke is fast and the upstroke slow: `θ = 2πφ − 0.45·sin(2πφ)`.
- **Secondary motion.** The wing tip is a child bone with phase lag (`sin(θ − 0.9)`), which gives the whip. The body rises on the downstroke (`−sin(θ+0.6)`) and pitches slightly.
- **Frequency:** 3.2 Hz × (1 + 0.4·speed). Add `hover()` for a height bob of about 0.12 m at about 0.33 Hz with a per-instance seed.

### 3.6 Tails and necks (`chainPose`, `aimChain`)

- Phase-offset sines: segment `i` gets `amp·w_i·sin(t·rate − i·lag)`, with weights increasing toward the tip.
- Add a damped **spring driven by the yaw rate**, so turning makes the tail swing out and settle. This is a cheap stand-in for verlet.
- **Bosses:** `aimChain` spreads the yaw error to the target over the neck bones (clamped per bone), so the head leads and the neck follows. For a dragon's breath pose: lift the neck (`rx` negative on the base), open the jaw bone (`rx` positive), and hold for the breath duration.

### 3.7 Attacks and hit reactions

- **`attackCurve(u, windup=0.5, strike=0.1)`** returns −1 (wound up) → +1.1 (strike overshoot) → 0. Sampled: `0, −0.5, −1, 0.84, 1.10, 0.55, 0`.
  - The wind-up is slow with ease-in-out, so it is a readable telegraph.
  - The strike is about 70 ms with ease-out cubic.
  - The recovery is a smooth settle.
  - Apply damage at `u = windup + strike·0.5`.
- **`bipedAttack`:** arm `rx = −2.6·wind − 0.9·hit` (overhead chop); torso leans back, then whips forward; root lunge `+z 0.35·hit`; crouch-squash during the wind-up.
- **Boss club slam:** use the same curve with a longer wind-up (0.6), both arms, a root squash of 0.85 at impact, and a camera shake at the hit frame. **Axe swing:** drive torso `ry` −1.2 → +1.0 and arm `rz` from the curve.
- **`hitReact`:** 0.18 s, `sin(π·√u)` profile (instant peak, smooth decay), root squash 14% plus a small backward offset, torso recoil −0.45 rad. Trigger it together with the 0.08 s flash.
- **`rootAnim`:**
  - Spawn rise (0.35 s): y goes from −height to 0 with ease-out cubic; scale 0.7 → 1 with a back overshoot; stretched while emerging.
  - Death squash (0.22 s): y-scale goes to 0.1 with ease-in cubic, xz bulges, then thins.

---

## 4. Shading for readability in a bright daytime scene

**Recommended set (all verified in the headless render):**

1. **`MeshLambertMaterial({ vertexColors: true, flatShading: true })`.** It is per-fragment since r151, cheaper than Standard, and matte reads best in a stylised daylight scene.
   - Keep the HemisphereLight sky/ground fill so the shadow side is not black.
   - Toon is optional: `MeshToonMaterial` with a 3-step `DataTexture` gradient map (`RedFormat`, `minFilter = magFilter = NearestFilter`, as the docs require). The same injection works; it was tested. Note that in r170 `MeshToonMaterial` has **no `flatShading` property** (it warns), but our geometry already carries flat normals. Toon bands on low-poly flat facets mostly look like Lambert with harder steps, so it is worth an A/B test, but not required.
2. **Top-masked fresnel rim** (in the injected fragment):
   ```glsl
   rim = pow(1 − saturate(dot(n, v)), 3.5) * smoothstep(−0.3, 0.5, n.y_view)
   ```
   Use colour ≈ (0.28, 0.30, 0.38). The view vector is `(0,0,1)` under ortho (`isOrthographic`). The mask matters: without it, downward-facing slanted facets (tapered torsos) wash out grey. That was visible in the first test render and is fixed.
3. **Inverted-hull outline**, **1.6 px**, colour `#14121c`.
   - A second `InstancedMesh` shares the geometry, `instanceMatrix` and bone texture. It uses `MeshBasicMaterial({ side: BackSide })` and extrudes along the welded smooth normal `aSmooth`.
   - Cost when instanced: **+1 draw per type** and about 2× vertex work. It is *not* 320×2 draws.
   - Keep the width constant in pixels: `outlineWidthForCamera(camera, viewportH, 1.6)` whenever zoom or resize changes.
   - This separates overlapping enemies inside a crowd. A depth/normal Sobel post-pass cannot do that well, because crowd members are at similar depth.
4. **Blob shadows.** Use one `InstancedMesh` of quads with a radial-falloff `ShaderMaterial`: `transparent`, `depthWrite: false`, per-instance alpha via `instanceColor.r`, lifted 3 cm. That is 1 draw for all enemies. Enemies keep `receiveShadow` (sun shadows from trees and walls fall on them) but do not cast. Only the boss casts.
5. **Glow and bloom discipline.**
   - Only `aGlow` parts (eyes, runes: 2–3) and spell VFX exceed 1.0, so only they bloom.
   - Flash colour 0.95 never blooms. Status tint emissive should stay ≤ 0.5.
   - This assumes the composer's RenderPass renders linear HDR (no tone mapping into the render target) and an OutputPass or grade pass tone-maps at the end.
6. **Tone mapping.** ACES darkens and hue-shifts saturated mid-tones (greens go olive, reds go orange). For a bright stylised palette, try `THREE.NeutralToneMapping` (r162+, Khronos PBR Neutral, present in r170 with value 7) or `AgXToneMapping`. Neutral keeps base colours closest to the authored hex values. The decision is cheap to test because it is one renderer flag.

**Not recommended:**

- **`OutlinePass`.** It is built for selection highlight: mask render, edge detect and several blur passes at full or half resolution.
- **Depth/normal Sobel post-pass for enemies.** It is one full-screen pass (cheap at 1080p), but it outlines terrain and props too, and fails between same-depth crowd members. Also, any pass that re-renders the scene with `scene.overrideMaterial` (normal or depth prepasses, SAO) will **not** run the rig vertex shader, so enemies render in bind pose at the instance origin.
- **`OutlineEffect`.** It re-renders the scene with generated outline materials, which also bypasses the injection.

---

## 5. Performance gotchas in r170

1. **`Material.clone()` does not copy `onBeforeCompile`** (`Material.copy` never touches it), nor an instance-level `customProgramCacheKey`. Cloned rig materials silently lose the injection. Create materials through `makeRigMaterial()` instead of cloning.
2. **Program sharing.** The cache key is shader params + `customProgramCacheKey()`, which defaults to `onBeforeCompile.toString()`. Identical function text means the program is shared, which is good. But if a closure bakes *different GLSL* per material under the same function text (for example a `#define BONES ${n}`), materials will **wrongly share** a program. Keep variable data in uniforms (we use `textureSize()`, so the shader has no constants) or return a distinct key.
3. **Recompile triggers** (from the `needsProgramChange` chain in `WebGLRenderer`): `instancing` flips (same material on an `InstancedMesh` *and* a `Mesh` recompiles every frame), `instanceColor` going null ↔ set, light count/shadow state changes (`lightsStateVersion`), fog on/off, `vertexColors`, `transparent`, `flatShading`, `toneMapping` and `outputColorSpace` changes. Toggling `material.transparent` for death fades recompiles. Use opaque death squash, or a dedicated transparent material made once. Warm up with `renderer.compile(scene, camera)` (or `compileAsync`) at act start, with every rig type present at count ≥ 1.
4. **Culling.** `InstancedMesh` and `SkinnedMesh` cache `boundingSphere` the first time it is needed and never refresh it, which causes random whole-type pop-out. Use `frustumCulled = false`. Off-screen instances only cost vertex work.
5. **Uploads.**
   - `BufferAttribute.clearUpdateRanges()` and `addUpdateRange(start, count)` (r159+) limit `instanceMatrix` uploads to the live range.
   - A 2D `DataTexture` re-uploads **completely** on `needsUpdate`, so size capacity to demand. `RigType` starts small and doubles. Each grow disposes the old `InstancedMesh` (which frees its instance buffer) and the old texture.
   - Set `DynamicDrawUsage` on per-frame attributes.
6. **`matrixAutoUpdate = false`** on the rig meshes, blobs and all static world props. A 320-enemy scene graph with 3 meshes each spends milliseconds in `updateMatrixWorld` alone. With (c′) the scene graph has about 10 objects for all enemies.
7. **No per-frame allocations.**
   - Hot paths (`push`, `_solve`, pose functions, `rootAnim`) use preallocated typed arrays and return shared scratch objects.
   - Avoid `new Vector3`, array spreads, closures and `forEach` with captured lambdas in per-enemy loops.
   - Keep animation state as flat numeric fields created once at spawn (`makeAnimState`).
8. **`count = 0`.** Set `visible = false` (`RigType.end()` does this) to skip the draw and state setup.
9. **Raycasting** an `InstancedMesh` uses undeformed geometry. Keep using the game's spatial grid for hits.
10. **WebGL2 only.** `texelFetch`, `gl_InstanceID` and `RGBA32F` textures are WebGL2 features. three r163+ is WebGL2-only anyway, and every r170 shader is compiled as `#version 300 es`.
11. **Shadow materials.** Directional and spot shadows use `object.customDepthMaterial` (`MeshDepthMaterial` with `RGBADepthPacking`, matching the default). Point lights use `customDistanceMaterial`, which would need the same injection if a boss is lit by a point light that casts shadows.
12. **Profiling.** Check `renderer.info.render.calls`, `.triangles` and `renderer.info.programs.length` in the dev overlay. Targets with (c′): about 25 calls for enemies and about 6 programs for all enemies.

---

## Appendix A: integration sketch (game side)

```js
import { RigType, RIG_SHARED, outlineWidthForCamera } from './rig/rig.js';
import { buildHusk } from './rig/creatures.js';
import * as A from './rig/anim.js';
import { BlobShadows } from './rig/blobShadows.js';

// --- once per type (at act load)
const huskDef = buildHusk({ skin: 0x7f9a6a });           // faction palette → different type or setColorAt
const rigs = { husk: new RigType({ ...huskDef, capacity: 64, outline: true, name: 'husk' }) };
for (const r of Object.values(rigs)) scene.add(r.object);
const blobs = new BlobShadows(512); scene.add(blobs.mesh);
renderer.compile(scene, camera);                          // warm programs (push 1 dummy first if count==0)

// --- on spawn
enemy.anim = A.makeAnimState(Math.random()); enemy.spawnAge = 0; enemy.deathAge = -1;
enemy.stride = A.strideLength(huskDef.meta.legLen, huskDef.meta.legSwing);
// --- on hit:  enemy.flashT = 0.08; A.startHit(enemy.anim);
// --- on attack start: A.startAttack(enemy.anim, 0.7)

// --- every frame, after enemy movement (enemy.moved = distance moved this frame)
RIG_SHARED.uOutlineWidth.value = outlineWidthForCamera(camera, renderer.domElement.height / renderer.getPixelRatio(), 1.6);
for (const r of Object.values(rigs)) r.begin();
blobs.begin();
for (const e of enemies) {                                 // includes dying ones until deathAge > DEATH_TIME
  const r = rigs[e.typeId];
  A.stepLocomotion(e.anim, e.moved, dt, e.stride, e.type.speed, e.yaw);
  const P = r.pose();
  A.bipedPose(P, r.B, e.anim); A.bipedAttack(P, r.B, e.anim); A.hitReact(P, r.B, e.anim);
  const ra = A.rootAnim(e.spawnAge, e.deathAge, 1.9);
  const flash = e.flashT > 0 ? 1 : 0;
  const tint = statusTintRGB(e);                           // e.g. [0, 0.25, 0.5] (linear, premultiplied) or [0,0,0]
  const k = e.elite ? 1.35 : 1;
  r.push(e.pos.x, ra.y, e.pos.z, e.yaw, ra.sx * k, ra.sy * k, ra.sz * k, P, tint[0], tint[1], tint[2], flash);
  blobs.push(e.pos.x, e.pos.z, e.type.radius * 1.2 * k, e.deathAge >= 0 ? 1 - e.deathAge / A.DEATH_TIME : 1);
}
for (const r of Object.values(rigs)) r.end();
blobs.end();
```

Notes:

- Facing: `yaw = Math.atan2(dir.x, dir.z)` (model faces +Z).
- Elite rim shell and ward shell: render them as a second `RigType` over the same geometry with an additive material, or more cheaply as a per-instance emissive pulse in the FX texel.
- Bosses: `new RigType({ ...bossDef, capacity: 1, outline: true, castShadow: true })`, then a single `push` per frame.

---

## Appendix B: drop-in code (verified against three r170)

Suggested location is `src/game/rig/`. Import paths assume the import map `three` / `three/addons/` from `index.html`. These files are byte-identical to the versions that passed the Node and headless-Chrome tests.

### `src/game/rig/partBuilder.js`

```js
// partBuilder.js — compose one low-poly creature from transformed primitives into ONE
// non-indexed BufferGeometry with per-vertex colour, bone index, glow and (optional) smooth
// "hull" normals for an inverted-hull outline.  three r170.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();

// ---------------------------------------------------------------- skeleton definition
// Bones are rigid pivots in MODEL space (bind pose). Parent index must be < own index.
export class SkeletonDef {
  constructor() { this.bones = []; this.index = {}; }
  /** bone(name, parentName|null, [px,py,pz]) → bone index */
  bone(name, parent, pivot = [0, 0, 0]) {
    const p = parent == null ? -1 : this.index[parent];
    if (p === undefined) throw new Error(`SkeletonDef: unknown parent "${parent}"`);
    const i = this.bones.length;
    this.bones.push({ name, parent: p, pivot: pivot.slice() });
    this.index[name] = i;
    return i;
  }
}

// ---------------------------------------------------------------- primitive helpers
/** Box whose top face is scaled (taper) and optionally shifted along z. Centered, height along y. */
export function taperedBox(w, h, d, topX = 1, topZ = 1, topShiftZ = 0, botX = 1, botZ = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setX(i, pos.getX(i) * (top ? topX : botX));
    pos.setZ(i, pos.getZ(i) * (top ? topZ : botZ) + (top ? topShiftZ : 0));
  }
  pos.needsUpdate = true;
  return g; // normals are recomputed by PartBuilder.build()
}

/** Shared low-poly primitive library (unit-sized; scale per part). Triangle counts in comments. */
export const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),                       // 12 tris
  ball: new THREE.IcosahedronGeometry(0.5, 1),               // 80 tris, diameter 1
  ballLo: new THREE.IcosahedronGeometry(0.5, 0),             // 20 tris (chunky gems, rocks, fists)
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),          // 24 tris
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),          // 32 tris
  cone4: new THREE.ConeGeometry(0.5, 1, 4),                  // 8 tris (horns, spikes, claws)
  cone6: new THREE.ConeGeometry(0.5, 1, 6),                  // 12 tris
  // r170 signature: CapsuleGeometry(radius, length, capSegments, radialSegments); total height = length + 2*radius
  capsule: new THREE.CapsuleGeometry(0.5, 1, 2, 6),          // ~60 tris, height 2
  lathe(points, segments = 8) { return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments); },
  extrude(shapePts, depth = 0.1, bevel = false) {
    const shape = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return g;
  },
};

// ---------------------------------------------------------------- part builder
export class PartBuilder {
  constructor() { this.parts = []; }

  /**
   * add(geometry, opts)
   *  opts.bone   : bone index (default 0)
   *  opts.color  : hex sRGB (default 0xffffff) – converted to linear like any THREE.Color
   *  opts.glow   : emissive multiplier of the vertex colour (0 = none, >1 blooms: eyes, runes)
   *  opts.pos    : [x,y,z] model-space position (bind pose)
   *  opts.rot    : [x,y,z] Euler XYZ radians
   *  opts.scale  : number | [x,y,z]   (negative components = true mirror; winding is fixed)
   */
  add(geometry, { bone = 0, color = 0xffffff, glow = 0, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    _e.set(rot[0], rot[1], rot[2], 'XYZ');
    _q.setFromEuler(_e);
    const matrix = new THREE.Matrix4().compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(s[0], s[1], s[2]));
    this.parts.push({ geometry, matrix, bone, color, glow });
    return this;
  }

  /** Adds the part, plus its mirror across the YZ plane (x → -x) on boneR. For symmetric primitives. */
  addPair(geometry, opts, boneR) {
    this.add(geometry, opts);
    const pos = opts.pos ?? [0, 0, 0], rot = opts.rot ?? [0, 0, 0];
    return this.add(geometry, { ...opts, bone: boneR ?? opts.bone, pos: [-pos[0], pos[1], pos[2]], rot: [rot[0], -rot[1], -rot[2]] });
  }

  /**
   * build({ flat = true, hull = false }) → THREE.BufferGeometry (non-indexed)
   * attributes: position(3) normal(3) color(3) aBone(1) aGlow(1) [aSmooth(3) when hull]
   */
  build({ flat = true, hull = false } = {}) {
    const prepared = [];
    let total = 0;
    for (const part of this.parts) {
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', part.geometry.attributes.position.clone());
      if (part.geometry.index) g.setIndex(part.geometry.index.clone());
      // weld by position only → smooth normals (used for !flat shading and the outline hull)
      g = mergeVertices(g, 1e-4);
      g.computeVertexNormals();
      g = g.toNonIndexed();
      g.applyMatrix4(part.matrix); // transforms position + normal (normal matrix, renormalised)
      if (part.matrix.determinant() < 0) flipWinding(g);
      g = dropDegenerate(g);       // lathe/capsule/cone poles produce zero-area triangles → NaN normals
      prepared.push({ g, part });
      total += g.attributes.position.count;
    }

    const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
    const Bn = new Float32Array(total), Gl = new Float32Array(total);
    const S = hull ? new Float32Array(total * 3) : null;
    let o = 0;
    for (const { g, part } of prepared) {
      const pa = g.attributes.position.array, na = g.attributes.normal.array, n = g.attributes.position.count;
      P.set(pa, o * 3);
      if (S) S.set(na, o * 3);
      if (flat) {
        for (let t = 0; t < n; t += 3) {
          _va.fromArray(pa, t * 3); _vb.fromArray(pa, t * 3 + 3); _vc.fromArray(pa, t * 3 + 6);
          _vc.sub(_vb); _va.sub(_vb); _vc.cross(_va).normalize(); // (c-b)x(a-b) = face normal, CCW front
          for (let k = 0; k < 3; k++) _vc.toArray(N, (o + t + k) * 3);
        }
      } else {
        N.set(na, o * 3);
      }
      _c.set(part.color); // sRGB hex → linear working space
      for (let i = 0; i < n; i++) {
        C[(o + i) * 3] = _c.r; C[(o + i) * 3 + 1] = _c.g; C[(o + i) * 3 + 2] = _c.b;
        Bn[o + i] = part.bone; Gl[o + i] = part.glow;
      }
      o += n;
      g.dispose();
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    out.setAttribute('aBone', new THREE.BufferAttribute(Bn, 1));
    out.setAttribute('aGlow', new THREE.BufferAttribute(Gl, 1));
    if (S) out.setAttribute('aSmooth', new THREE.BufferAttribute(S, 3));
    out.computeBoundingSphere();
    out.userData.triangles = total / 3;
    return out;
  }
}

function dropDegenerate(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, keep = [];
  for (let i = 0; i < p.length; i += 9) {
    _va.fromArray(p, i); _vb.fromArray(p, i + 3); _vc.fromArray(p, i + 6);
    _vc.sub(_vb); _va.sub(_vb);
    if (_vc.cross(_va).lengthSq() > 1e-12) keep.push(i);
  }
  if (keep.length * 9 === p.length) return g;
  const P = new Float32Array(keep.length * 9), N = new Float32Array(keep.length * 9);
  keep.forEach((src, k) => { P.set(p.subarray(src, src + 9), k * 9); N.set(n.subarray(src, src + 9), k * 9); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.dispose();
  return out;
}

function flipWinding(g) {
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name].array;
    for (let i = 0; i < a.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
    }
  }
}
```

### `src/game/rig/rig.js`

```js
// rig.js — "instanced rigid skinning": ONE InstancedMesh per enemy type, bones solved on the CPU
// in JS, uploaded as one RGBA32F DataTexture per type (row = instance slot, 3 texels per bone
// = rows of a 3x4 affine, + 1 trailing FX texel). Vertex shader fetches with gl_InstanceID.
// three r170 / WebGL2.
import * as THREE from 'three';

// Shared uniforms (same objects referenced by every rig material → set once per frame).
export const RIG_SHARED = {
  uRim: { value: new THREE.Vector4(0.28, 0.3, 0.38, 3.5) },   // rgb (linear, premultiplied), w = fresnel power
  uFlashColor: { value: new THREE.Color(0.95, 0.95, 0.95) },   // < 1.0 so a hit-flash never blooms
  uOutlineWidth: { value: 0.035 },                            // world units; see outlineWidthForCamera()
  uOutlineColor: { value: new THREE.Color(0x14121c) },
};

/** World-space width that yields `px` screen pixels with an OrthographicCamera. */
export function outlineWidthForCamera(camera, viewportHeightPx, px = 1.6) {
  return px * (camera.top - camera.bottom) / (camera.zoom * viewportHeightPx);
}

// ------------------------------------------------------------------ GLSL
const GLSL_PARS_V = /* glsl */`
attribute float aBone;
uniform highp sampler2D uRigTex;
void rigFetch( out mat3 A, out vec3 T ) {
	int x = int( aBone + 0.5 ) * 3;
	vec4 r0 = texelFetch( uRigTex, ivec2( x,     gl_InstanceID ), 0 );
	vec4 r1 = texelFetch( uRigTex, ivec2( x + 1, gl_InstanceID ), 0 );
	vec4 r2 = texelFetch( uRigTex, ivec2( x + 2, gl_InstanceID ), 0 );
	A = mat3( r0.x, r1.x, r2.x,  r0.y, r1.y, r2.y,  r0.z, r1.z, r2.z ); // columns
	T = vec3( r0.w, r1.w, r2.w );
}
`;

const GLSL_NORMAL_V = /* glsl */`
#include <beginnormal_vertex>
{
	mat3 rA; vec3 rT; rigFetch( rA, rT );
	// inverse-transpose for rotation * (non-uniform) scale, same trick three uses for instanceMatrix
	objectNormal = rA * ( objectNormal / vec3( dot( rA[ 0 ], rA[ 0 ] ), dot( rA[ 1 ], rA[ 1 ] ), dot( rA[ 2 ], rA[ 2 ] ) ) );
}
`;

const GLSL_BEGIN_V = /* glsl */`
#include <begin_vertex>
{
	mat3 rA; vec3 rT; rigFetch( rA, rT );
	transformed = rA * transformed + rT;
}
`;

function injectLit(shader) {
  shader.uniforms.uRigTex = this.userData.rigTex;          // per-type texture uniform object
  shader.uniforms.uRim = RIG_SHARED.uRim;
  shader.uniforms.uFlashColor = RIG_SHARED.uFlashColor;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_PARS_V + `
attribute float aGlow;
varying vec4 vRigFx;
varying float vGlow;`)
    .replace('#include <beginnormal_vertex>', GLSL_NORMAL_V)
    .replace('#include <begin_vertex>', GLSL_BEGIN_V + `
vRigFx = texelFetch( uRigTex, ivec2( textureSize( uRigTex, 0 ).x - 1, gl_InstanceID ), 0 );
vGlow = aGlow;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec4 uRim;
uniform vec3 uFlashColor;
varying vec4 vRigFx;
varying float vGlow;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vRigFx.rgb;                       // status tint (per instance)
totalEmissiveRadiance += diffuseColor.rgb * vGlow;         // per-vertex glow (eyes, runes) – >1 blooms
{
	vec3 rimV = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );
	float rimF = pow( 1.0 - saturate( dot( normal, rimV ) ), uRim.w );
	totalEmissiveRadiance += uRim.rgb * rimF * smoothstep( -0.3, 0.5, normal.y ); // top-lit rim only (view-space up)
}`)
    .replace('#include <opaque_fragment>', `outgoingLight = mix( outgoingLight, uFlashColor, vRigFx.a );   // hit flash
#include <opaque_fragment>`);
}

function injectHull(shader) {
  shader.uniforms.uRigTex = this.userData.rigTex;
  shader.uniforms.uOutlineWidth = RIG_SHARED.uOutlineWidth;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_PARS_V + `
attribute vec3 aSmooth;
uniform float uOutlineWidth;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
{
	mat3 rA; vec3 rT; rigFetch( rA, rT );
	transformed = rA * transformed + rT + normalize( rA * aSmooth ) * uOutlineWidth;
}`);
}

function injectDepth(shader) {
  shader.uniforms.uRigTex = this.userData.rigTex;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_PARS_V)
    .replace('#include <begin_vertex>', GLSL_BEGIN_V);
}

/** Lit material for rigs. base: 'lambert' | 'toon' | 'standard'. One program is shared by all rig types. */
export function makeRigMaterial(rigTexUniform, { base = 'lambert', gradientMap = null } = {}) {
  // Geometry already carries flat (per-face) normals; flatShading additionally derives them from
  // screen-space derivatives (robust under squash). MeshToonMaterial has no flatShading in r170.
  const params = { vertexColors: true };
  if (base !== 'toon') params.flatShading = true;
  const mat = base === 'toon' ? new THREE.MeshToonMaterial({ ...params, gradientMap })
    : base === 'standard' ? new THREE.MeshStandardMaterial({ ...params, roughness: 0.85, metalness: 0 })
    : new THREE.MeshLambertMaterial(params);
  mat.userData.rigTex = rigTexUniform;
  mat.onBeforeCompile = injectLit;
  mat.customProgramCacheKey = () => 'rig-lit-1';
  return mat;
}

function makeHullMaterial(rigTexUniform) {
  const mat = new THREE.MeshBasicMaterial({ color: RIG_SHARED.uOutlineColor.value, side: THREE.BackSide });
  mat.userData.rigTex = rigTexUniform;
  mat.onBeforeCompile = injectHull;
  mat.customProgramCacheKey = () => 'rig-hull-1';
  return mat;
}

function makeDepthMaterial(rigTexUniform) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.userData.rigTex = rigTexUniform;
  mat.onBeforeCompile = injectDepth;
  mat.customProgramCacheKey = () => 'rig-depth-1';
  return mat;
}

// ------------------------------------------------------------------ Pose (per-bone local deltas)
// 9 floats per bone: rx ry rz (Euler XYZ, radians, about the bone pivot), ox oy oz (offset), sx sy sz.
// rot/off ADD and scl MULTIPLIES, so locomotion + attack + hit layers simply stack.
export class Pose {
  constructor(boneCount) { this.n = boneCount; this.d = new Float32Array(boneCount * 9); this.reset(); }
  reset() {
    const d = this.d; d.fill(0);
    for (let i = 0; i < this.n; i++) { d[i * 9 + 6] = 1; d[i * 9 + 7] = 1; d[i * 9 + 8] = 1; }
    return this;
  }
  rot(b, x, y, z) { const d = this.d, o = b * 9; d[o] += x; d[o + 1] += y; d[o + 2] += z; return this; }
  off(b, x, y, z) { const d = this.d, o = b * 9 + 3; d[o] += x; d[o + 1] += y; d[o + 2] += z; return this; }
  scl(b, x, y, z) { const d = this.d, o = b * 9 + 6; d[o] *= x; d[o + 1] *= y; d[o + 2] *= z; return this; }
}

// ------------------------------------------------------------------ RigType
export class RigType {
  /**
   * @param {object} o
   *  o.geometry  BufferGeometry from PartBuilder.build()
   *  o.skeleton  SkeletonDef
   *  o.capacity  initial instance capacity (grows ×2 automatically)
   *  o.outline   true → inverted-hull outline mesh (needs build({hull:true}))
   *  o.castShadow  bosses only (adds a customDepthMaterial)
   *  o.material  optional: makeRigMaterial(...) options { base, gradientMap }
   */
  constructor({ geometry, skeleton, capacity = 32, outline = false, castShadow = false, receiveShadow = true, material = {}, name = 'rig' }) {
    this.name = name;
    this.geometry = geometry;
    this.bones = skeleton.bones;
    this.B = skeleton.index;                                 // name → bone index
    this.nb = this.bones.length;
    this.texW = this.nb * 3 + 1;                             // +1 FX texel
    this.world = new Float32Array(this.nb * 12);             // solved 3x4 per bone (row-major)
    this.scratchPose = new Pose(this.nb);
    this.rigTex = { value: null };                           // uniform object shared by all 3 materials
    this.material = makeRigMaterial(this.rigTex, material);
    this.hullMaterial = outline ? makeHullMaterial(this.rigTex) : null;
    this.depthMaterial = castShadow ? makeDepthMaterial(this.rigTex) : null;
    this.castShadow = castShadow; this.receiveShadow = receiveShadow;
    this.object = new THREE.Group();
    this.object.name = name;
    this.capacity = 0;
    this.mesh = null; this.hull = null; this.tex = null;
    this.n = 0;
    this._allocate(capacity);
  }

  _allocate(cap) {
    const oldMesh = this.mesh, oldHull = this.hull, oldTex = this.tex;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;                              // InstancedMesh bounds are computed once and go stale
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow;
    if (this.depthMaterial) mesh.customDepthMaterial = this.depthMaterial;
    mesh.count = 0;
    const data = new Float32Array(this.texW * cap * 4);
    const tex = new THREE.DataTexture(data, this.texW, cap, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;                                  // Nearest filter / no mipmaps are DataTexture defaults
    let hull = null;
    if (this.hullMaterial) {
      hull = new THREE.InstancedMesh(this.geometry, this.hullMaterial, cap);
      hull.instanceMatrix = mesh.instanceMatrix;             // share the attribute → uploaded once
      hull.frustumCulled = false; hull.matrixAutoUpdate = false; hull.count = 0;
    }
    if (oldMesh) {
      mesh.instanceMatrix.array.set(oldMesh.instanceMatrix.array);
      data.set(oldTex.image.data);
      this.object.remove(oldMesh); oldMesh.dispose();       // frees its instanceMatrix GL buffer
      if (oldHull) { this.object.remove(oldHull); }
      oldTex.dispose();
    }
    this.object.add(mesh);
    if (hull) this.object.add(hull);
    this.mesh = mesh; this.hull = hull; this.tex = tex; this.rigTex.value = tex; this.capacity = cap;
  }

  /** Start a frame: subsequent push() calls fill slots 0..n-1. */
  begin() { this.n = 0; }

  /** Scratch pose reset to identity; fill it, then call push(). */
  pose() { return this.scratchPose.reset(); }

  /**
   * Write one instance. Root transform = translate(x,y,z) · rotY(yaw) · scale(sx,sy,sz).
   * fx: emissive tint rgb (linear, premultiplied by intensity) and flash amount 0..1.
   */
  push(x, y, z, yaw, sx, sy, sz, pose, fr = 0, fg = 0, fb = 0, flash = 0) {
    if (this.n >= this.capacity) this._allocate(this.capacity * 2);
    const i = this.n++;
    // --- root: column-major 4x4
    const m = this.mesh.instanceMatrix.array, o = i * 16, c = Math.cos(yaw), s = Math.sin(yaw);
    m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    // --- bones
    this._solve(pose.d);
    const t = this.tex.image.data, row = i * this.texW * 4, w = this.world;
    for (let b = 0; b < this.nb; b++) {
      const src = b * 12, dst = row + b * 12;                // 3 texels × 4 floats = 12, same layout
      for (let k = 0; k < 12; k++) t[dst + k] = w[src + k];
    }
    const f = row + (this.texW - 1) * 4;
    t[f] = fr; t[f + 1] = fg; t[f + 2] = fb; t[f + 3] = flash;
    return i;
  }

  /** Finish the frame: set counts and flag uploads (only the used part of instanceMatrix). */
  end() {
    const n = this.n;
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (this.hull) { this.hull.count = n; this.hull.visible = n > 0; }
    if (n === 0) return;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    this.tex.needsUpdate = true;                             // whole texture: keep capacity tight (grows ×2)
  }

  // local L = T(p + off) · R · S · T(-p);  world = parentWorld · L   (3x4, row-major: [A | t])
  _solve(d) {
    const w = this.world, bones = this.bones;
    for (let b = 0; b < this.nb; b++) {
      const o = b * 9, rx = d[o], ry = d[o + 1], rz = d[o + 2];
      const sx = d[o + 6], sy = d[o + 7], sz = d[o + 8];
      const a = Math.cos(rx), bb = Math.sin(rx), c = Math.cos(ry), dd = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
      const ae = a * e, af = a * f, be = bb * e, bf = bb * f;
      // R (Euler XYZ, identical to Matrix4.makeRotationFromEuler) times diag(s)
      const l00 = c * e * sx, l01 = -c * f * sy, l02 = dd * sz;
      const l10 = (af + be * dd) * sx, l11 = (ae - bf * dd) * sy, l12 = -bb * c * sz;
      const l20 = (bf - ae * dd) * sx, l21 = (be + af * dd) * sy, l22 = a * c * sz;
      const p = bones[b].pivot, px = p[0], py = p[1], pz = p[2];
      const l03 = px + d[o + 3] - (l00 * px + l01 * py + l02 * pz);
      const l13 = py + d[o + 4] - (l10 * px + l11 * py + l12 * pz);
      const l23 = pz + d[o + 5] - (l20 * px + l21 * py + l22 * pz);
      const q = b * 12, par = bones[b].parent;
      if (par < 0) {
        w[q] = l00; w[q + 1] = l01; w[q + 2] = l02; w[q + 3] = l03;
        w[q + 4] = l10; w[q + 5] = l11; w[q + 6] = l12; w[q + 7] = l13;
        w[q + 8] = l20; w[q + 9] = l21; w[q + 10] = l22; w[q + 11] = l23;
      } else {
        const P = par * 12;
        for (let r = 0; r < 3; r++) {
          const p0 = w[P + r * 4], p1 = w[P + r * 4 + 1], p2 = w[P + r * 4 + 2], p3 = w[P + r * 4 + 3];
          w[q + r * 4] = p0 * l00 + p1 * l10 + p2 * l20;
          w[q + r * 4 + 1] = p0 * l01 + p1 * l11 + p2 * l21;
          w[q + r * 4 + 2] = p0 * l02 + p1 * l12 + p2 * l22;
          w[q + r * 4 + 3] = p0 * l03 + p1 * l13 + p2 * l23 + p3;
        }
      }
    }
  }

  dispose() {
    this.mesh.dispose(); this.tex.dispose(); this.material.dispose();
    this.hullMaterial?.dispose(); this.depthMaterial?.dispose(); this.geometry.dispose();
    this.object.removeFromParent();
  }
}
```

### `src/game/rig/anim.js`

```js
// anim.js — procedural animation helpers for RigType poses. Zero allocations per frame.
// Conventions: model faces +Z, up +Y, character's LEFT is +X.
//  * A part hanging BELOW its pivot (leg, arm): negative rx swings it FORWARD (+Z).
//  * A part ABOVE its pivot (torso, neck): positive rx leans it FORWARD.
//  * A part pointing +X (left wing / left spider leg): positive rz raises it, negative ry swings it forward.
//    Mirror for -X parts: negate rz and ry.
export const TAU = Math.PI * 2;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeOutCubic = (x) => 1 - (1 - clamp01(x)) ** 3;
export const easeInCubic = (x) => clamp01(x) ** 3;
export const easeOutBack = (x, k = 1.7) => { x = clamp01(x) - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
/** Frame-rate independent exponential smoothing toward target. */
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/** Distance covered by one FULL gait cycle for a rigid leg of length L swinging ±amp radians.
 *  stance sweeps 2·L·sin(amp) per half-cycle, two half-cycles per cycle → 4·L·sin(amp). */
export const strideLength = (legLen, amp) => 4 * legLen * Math.sin(amp);

/** Per-enemy animation state. Create once at spawn (plain object, no per-frame allocs). */
export function makeAnimState(seed = Math.random()) {
  return {
    seed, phase: seed, speedN: 0,     // gait phase [0,1) and normalised speed (smoothed)
    t: seed * 10,                     // local clock (idle/breath/hover)
    flap: seed,                       // wing phase [0,1)
    attackT: -1, attackDur: 0.7,      // attack progress (−1 = idle)
    hitT: 0,                          // hit-react timer (counts down)
    yawPrev: 0, yawRate: 0,           // for tail/neck secondary motion
    tailX: 0, tailV: 0,               // spring state for tail sway
  };
}

/** Advance gait by ACTUAL distance moved this frame (no foot sliding). */
export function stepLocomotion(st, dist, dt, stride, maxSpeed, yaw) {
  st.t += dt;
  st.phase = (st.phase + dist / stride) % 1;
  const speed = dt > 0 ? dist / dt : 0;
  st.speedN = damp(st.speedN, Math.min(speed / maxSpeed, 1.25), 12, dt);
  let dy = yaw - st.yawPrev;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  st.yawRate = damp(st.yawRate, dt > 0 ? dy / dt : 0, 10, dt);
  st.yawPrev = yaw;
  if (st.attackT >= 0) { st.attackT += dt / st.attackDur; if (st.attackT >= 1) st.attackT = -1; }
  if (st.hitT > 0) st.hitT = Math.max(0, st.hitT - dt);
}

export const startAttack = (st, dur = 0.7) => { st.attackT = 0; st.attackDur = dur; };
export const HIT_DUR = 0.18;
export const startHit = (st) => { st.hitT = HIT_DUR; };

/**
 * Anticipation → strike → recovery. Returns −1 (fully wound up) … +1 (strike, with overshoot ~1.1) … 0.
 * windup: fraction of the duration spent winding up (slow, ease-in-out = readable telegraph)
 * strike: fraction for the hit itself (very fast, ease-out)
 */
export function attackCurve(u, windup = 0.5, strike = 0.1) {
  if (u < 0) return 0;
  if (u < windup) return -smooth(u / windup);
  if (u < windup + strike) return -1 + 2.1 * easeOutCubic((u - windup) / strike);
  return 1.1 * (1 - smooth((u - windup - strike) / (1 - windup - strike)));
}

/** Hit recoil amount 0..1 (sharp attack, smooth decay). */
export const hitAmount = (st) => (st.hitT > 0 ? Math.sin(Math.PI * (1 - st.hitT / HIT_DUR) ** 0.5) : 0);

/** Damped spring toward target, in-place on st[x]/st[v]. */
export function spring(st, x, v, target, k, c, dt) {
  st[v] += (k * (target - st[x]) - c * st[v]) * dt;
  st[x] += st[v] * dt;
  return st[x];
}

// ------------------------------------------------------------------ gaits
/** Biped: bones root, hips, torso, head, armL, armR, legL, legR. */
export function bipedPose(P, B, st, o = {}) {
  const s = Math.min(st.speedN, 1), ph = st.phase * TAU, sw = Math.sin(ph);
  const leg = (o.legSwing ?? 0.55) * s, arm = (o.armSwing ?? 0.6) * s;
  P.rot(B.legL, -sw * leg, 0, 0).rot(B.legR, sw * leg, 0, 0);
  P.rot(B.armL, sw * arm, 0, 0.12).rot(B.armR, -sw * arm, 0, -0.12);     // opposite arm, slight A-pose
  // hip bob at 2× frequency: lowest at contact (legs spread), highest when passing
  P.off(B.hips, 0, (o.bob ?? 0.07) * s * (0.5 + 0.5 * Math.cos(2 * ph)), 0);
  P.rot(B.hips, 0, -sw * (o.twist ?? 0.12) * s, 0);                      // pelvis twist
  P.rot(B.torso, (o.lean ?? 0.18) * s, sw * (o.twist ?? 0.12) * 1.6 * s, 0); // lean + counter-twist shoulders
  P.rot(B.head, -(o.lean ?? 0.18) * s * 0.6, -sw * 0.08 * s, 0);          // keep the gaze level
  // idle breathing fades in as speed drops
  const idle = 1 - s, br = Math.sin(st.t * (o.breathRate ?? 2.2));
  P.scl(B.torso, 1 + 0.025 * br * idle, 1 + 0.04 * br * idle, 1 + 0.025 * br * idle);
  P.rot(B.armL, 0, 0, 0.05 * br * idle).rot(B.armR, 0, 0, -0.05 * br * idle);
  P.rot(B.head, 0.04 * br * idle, 0, 0);
}

/** Overhead chop / lunge layered on top of the biped. */
export function bipedAttack(P, B, st, o = {}) {
  if (st.attackT < 0) return;
  const a = attackCurve(st.attackT, o.windup, o.strike), wind = Math.max(-a, 0), hit = Math.max(a, 0);
  const arm = o.arm === 'L' ? B.armL : B.armR;
  P.rot(B.torso, -0.35 * wind + 0.5 * hit, 0, 0);
  P.rot(arm, -2.6 * wind - 0.9 * hit, 0, 0);                  // raise overhead, chop down-forward
  P.rot(o.arm === 'L' ? B.armR : B.armL, -0.6 * hit, 0, 0);
  P.off(B.root, 0, 0, (o.lunge ?? 0.35) * hit);              // lunge forward (local +Z)
  P.scl(B.root, 1 + 0.06 * wind, 1 - 0.06 * wind, 1 + 0.06 * wind); // crouch-squash during wind-up
}

/** Hit react: recoil back + squash. Works for any rig with root (+ optional torso). */
export function hitReact(P, B, st) {
  const h = hitAmount(st);
  if (h <= 0) return;
  P.scl(B.root, 1 + 0.14 * h, 1 - 0.14 * h, 1 + 0.14 * h);
  P.off(B.root, 0, 0, -0.12 * h);
  if (B.torso !== undefined) P.rot(B.torso, -0.45 * h, 0, 0);
}

/** Quadruped: root, body, head, legFL, legFR, legBL, legBR (+ optional tail0..). gait: 'trot' | 'walk' | 'gallop'. */
export function quadrupedPose(P, B, st, o = {}) {
  const s = Math.min(st.speedN, 1), A = (o.legSwing ?? 0.5) * s, ph = st.phase;
  const off = o.gait === 'walk' ? [0.25, 0.75, 0, 0.5]           // FL FR BL BR (4-beat lateral sequence)
    : o.gait === 'gallop' ? [0.0, 0.1, 0.5, 0.6]
    : [0.0, 0.5, 0.5, 0.0];                                       // trot: diagonal pairs
  const legs = [B.legFL, B.legFR, B.legBL, B.legBR];
  for (let i = 0; i < 4; i++) {
    const p = (ph + off[i]) * TAU;
    P.rot(legs[i], -Math.sin(p) * A, 0, 0);
    P.off(legs[i], 0, Math.max(0, Math.cos(p)) * (o.lift ?? 0.08) * s, 0); // lift during forward swing
  }
  const rock = o.gait === 'gallop' ? Math.sin(ph * TAU) * 0.14 : Math.sin(ph * TAU * 2) * 0.035;
  P.rot(B.body, rock * s, 0, 0);
  P.off(B.body, 0, Math.abs(Math.sin(ph * TAU * 2)) * (o.bob ?? 0.05) * s, 0);
  P.rot(B.head, -rock * s * 0.7, 0, 0);
  const br = Math.sin(st.t * 2.0) * (1 - s);
  P.scl(B.body, 1 + 0.03 * br, 1 + 0.03 * br, 1);
}

/** Spider / insect: 8 legs (legL0..3 point +X, legR0..3 point −X), alternating tetrapod + ripple. */
export function spiderPose(P, B, st, o = {}) {
  const s = Math.min(st.speedN, 1), A = (o.legSwing ?? 0.4) * s, L = (o.lift ?? 0.45) * s;
  for (let i = 0; i < 4; i++) {
    for (let side = 0; side < 2; side++) {
      const groupB = (i + side) % 2 === 1;                   // L0 R1 L2 R3 | R0 L1 R2 L3
      const p = (st.phase + (groupB ? 0.5 : 0) + i * 0.06) * TAU;
      const swing = Math.sin(p) * A, lift = Math.max(0, Math.cos(p)) * L;
      const b = side === 0 ? B['legL' + i] : B['legR' + i];
      if (side === 0) P.rot(b, 0, -swing, lift); else P.rot(b, 0, swing, -lift);
    }
  }
  P.off(B.body, 0, Math.abs(Math.sin(st.phase * TAU * 2)) * 0.04 * s, 0);
  const idle = (1 - s) * Math.sin(st.t * 3) * 0.04;            // idle leg twitch / breathing
  P.scl(B.body, 1 + idle, 1 - idle, 1 + idle);
}

/** Wings: wingL/wingLTip point +X, wingR/wingRTip −X. Asymmetric flap (fast downstroke) + lagging tip. */
export function wingPose(P, B, st, dt, o = {}) {
  st.flap = (st.flap + dt * (o.freq ?? 3.2) * (1 + 0.4 * Math.min(st.speedN, 1))) % 1;
  const q = st.flap * TAU, th = q - 0.45 * Math.sin(q);        // phase warp → downstroke faster
  const A = o.amp ?? 0.85, base = o.base ?? 0.15;
  const root = base + A * Math.sin(th), tip = (A * 0.6) * Math.sin(th - 0.9); // tip lags → whip
  P.rot(B.wingL, 0, 0, root).rot(B.wingR, 0, 0, -root);
  if (B.wingLTip !== undefined) P.rot(B.wingLTip, 0, 0, tip).rot(B.wingRTip, 0, 0, -tip);
  // body rises on the downstroke, slight pitch — opposite phase with lag
  P.off(B.root, 0, -(o.bob ?? 0.12) * Math.sin(th + 0.6), 0);
  P.rot(B.body ?? B.root, 0.08 * Math.cos(th), 0, 0);
}

/** Hover bob (ghosts, wisps, flyers). height in metres. */
export function hover(P, B, st, height = 1.2, amp = 0.12, rate = 2.1) {
  P.off(B.root, 0, height + amp * Math.sin(st.t * rate + st.seed * TAU), 0);
}

/**
 * Tail / neck chain: phase-offset sines + spring driven by turning (yawRate) → lagging follow.
 * bones: array of bone indices root→tip. axis: 'y' (sway) | 'x' (curl).
 */
export function chainPose(P, bones, st, dt, o = {}) {
  const amp = o.amp ?? 0.25, lag = o.lag ?? 0.7, rate = o.rate ?? 3.0;
  const sway = spring(st, 'tailX', 'tailV', -st.yawRate * (o.follow ?? 0.12), 60, 9, dt);
  for (let i = 0; i < bones.length; i++) {
    const w = (i + 1) / bones.length;
    const a = amp * w * Math.sin(st.t * rate - i * lag) + sway * (0.6 + w);
    if (o.axis === 'x') P.rot(bones[i], a, 0, 0); else P.rot(bones[i], 0, a, 0);
  }
}

/** Aim a neck chain toward a world yaw (bosses): spreads the yaw error over the chain, clamped. */
export function aimChain(P, bones, bodyYaw, targetYaw, maxPerBone = 0.45) {
  let err = Math.atan2(Math.sin(targetYaw - bodyYaw), Math.cos(targetYaw - bodyYaw));
  const per = Math.max(-maxPerBone, Math.min(maxPerBone, err / bones.length));
  for (const b of bones) P.rot(b, 0, per, 0);
}

// ------------------------------------------------------------------ root (spawn rise / death squash)
export const SPAWN_TIME = 0.35, DEATH_TIME = 0.22;
const _root = { y: 0, sx: 1, sy: 1, sz: 1 };
/** spawnAge: seconds since spawn; deathAge: seconds since death (−1 alive). height: model height. Returns a shared object. */
export function rootAnim(spawnAge, deathAge, height = 1.8) {
  _root.y = 0; _root.sx = _root.sy = _root.sz = 1;
  if (spawnAge < SPAWN_TIME) {
    const u = spawnAge / SPAWN_TIME;
    _root.y = -height * (1 - easeOutCubic(u));                // rise out of the ground
    const k = 0.7 + 0.3 * easeOutBack(u);
    _root.sx = _root.sz = k; _root.sy = k * (1 + 0.15 * (1 - u)); // stretched while emerging
  }
  if (deathAge >= 0) {
    const u = clamp01(deathAge / DEATH_TIME);
    _root.sy *= 1 - 0.9 * easeInCubic(u);                     // squash flat
    const w = 1 + 0.45 * Math.sin(Math.PI * Math.min(u * 1.3, 1)); // bulge then thin
    _root.sx *= w * (1 - 0.6 * u * u); _root.sz *= w * (1 - 0.6 * u * u);
  }
  return _root;
}
```

### `src/game/rig/blobShadows.js`

```js
// blobShadows.js — every enemy's contact shadow in ONE draw call.
import * as THREE from 'three';

export class BlobShadows {
  constructor(capacity = 512, { opacity = 0.38, lift = 0.03 } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uOpacity: { value: opacity } },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying float vA;
        void main() {
          vUv = uv * 2.0 - 1.0;
          vA = 1.0;
          #ifdef USE_INSTANCING_COLOR
            vA = instanceColor.r;            // per-instance alpha (fade on spawn/death)
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; varying vec2 vUv; varying float vA;
        void main() {
          float d = dot( vUv, vUv );
          float a = ( 1.0 - smoothstep( 0.35, 1.0, d ) ) * uOpacity * vA;
          if ( a < 0.004 ) discard;
          gl_FragColor = vec4( 0.0, 0.0, 0.0, a );
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));     // allocates instanceColor (do before first render)
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = -1;                             // first among transparents
    this.mesh.count = 0;
    this.lift = lift; this.n = 0;
  }
  begin() { this.n = 0; }
  /** radius in metres (≈ enemy collision radius × 1.2); alpha 0..1 */
  push(x, z, radius, alpha = 1, groundY = 0) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    const i = this.n++, m = this.mesh.instanceMatrix.array, o = i * 16, d = radius * 2;
    m.fill(0, o, o + 16);
    m[o] = d; m[o + 5] = 1; m[o + 10] = d; m[o + 12] = x; m[o + 13] = groundY + this.lift; m[o + 14] = z; m[o + 15] = 1;
    this.mesh.instanceColor.array[i * 3] = alpha;
  }
  end() {
    const n = this.n, mesh = this.mesh;
    mesh.count = n; mesh.visible = n > 0;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
  }
}
```

### `src/game/rig/creatures.js`

```js
// creatures.js — example rig definitions (biped "husk", 8-leg "spider", winged "bat").
// Each returns { skeleton, geometry, meta } ready for new RigType({...}).
import * as THREE from 'three';
import { SkeletonDef, PartBuilder, PRIM, taperedBox } from './partBuilder.js';

export function buildHusk({ skin = 0x7f9a6a, cloth = 0x4a3b30, eye = 0xffd27a, hull = true } = {}) {
  const sk = new SkeletonDef();
  const root = sk.bone('root', null, [0, 0, 0]);
  const hips = sk.bone('hips', 'root', [0, 0.85, 0]);
  const torso = sk.bone('torso', 'hips', [0, 0.95, 0]);
  const head = sk.bone('head', 'torso', [0, 1.55, 0.05]);
  const armL = sk.bone('armL', 'torso', [0.36, 1.45, 0]);
  const armR = sk.bone('armR', 'torso', [-0.36, 1.45, 0]);
  const legL = sk.bone('legL', 'hips', [0.16, 0.85, 0]);
  const legR = sk.bone('legR', 'hips', [-0.16, 0.85, 0]);

  const pb = new PartBuilder();
  // torso: tapered box, wider at the shoulders, hunched forward (top shifted +z)
  pb.add(taperedBox(0.62, 0.62, 0.38, 1.15, 1.0, 0.08, 0.8, 0.9), { bone: torso, color: skin, pos: [0, 1.22, 0] });
  pb.add(taperedBox(0.5, 0.22, 0.34, 1, 1, 0, 0.9, 0.9), { bone: hips, color: cloth, pos: [0, 0.88, 0] });   // loincloth/pelvis
  // head: low-poly ball, slightly squashed, jaw box, glowing eyes (glow > 1 → blooms)
  pb.add(PRIM.ball, { bone: head, color: skin, pos: [0, 1.74, 0.06], scale: [0.42, 0.38, 0.42] });
  pb.add(PRIM.box, { bone: head, color: skin, pos: [0, 1.6, 0.14], scale: [0.3, 0.12, 0.22] });
  pb.addPair(PRIM.ballLo, { bone: head, color: eye, glow: 2.5, pos: [0.09, 1.76, 0.24], scale: 0.07 });
  // arms (pivot at shoulder, hang down): long, chunky fists
  pb.addPair(PRIM.capsule, { bone: armL, color: skin, pos: [0.38, 1.12, 0], scale: [0.16, 0.28, 0.16] }, armR);
  pb.addPair(PRIM.ballLo, { bone: armL, color: skin, pos: [0.4, 0.74, 0.02], scale: 0.2 }, armR);
  // legs
  pb.addPair(taperedBox(0.2, 0.75, 0.22, 1.1, 1.1), { bone: legL, color: cloth, pos: [0.16, 0.45, 0] }, legR);
  pb.addPair(PRIM.box, { bone: legL, color: 0x2b2420, pos: [0.16, 0.05, 0.06], scale: [0.22, 0.1, 0.32] }, legR);

  const geometry = pb.build({ flat: true, hull });
  return { skeleton: sk, geometry, meta: { height: 1.95, legLen: 0.85, legSwing: 0.55 } };
}

export function buildSpider({ body = 0x2c2633, mark = 0xc0392b, eye = 0xff4040, hull = true } = {}) {
  const sk = new SkeletonDef();
  sk.bone('root', null, [0, 0, 0]);
  const bodyB = sk.bone('body', 'root', [0, 0.45, 0]);
  const legs = [];
  const zs = [0.28, 0.1, -0.1, -0.28];
  for (let i = 0; i < 4; i++) legs.push(sk.bone('legL' + i, 'body', [0.22, 0.45, zs[i]]));
  for (let i = 0; i < 4; i++) legs.push(sk.bone('legR' + i, 'body', [-0.22, 0.45, zs[i]]));

  const pb = new PartBuilder();
  pb.add(PRIM.ball, { bone: bodyB, color: body, pos: [0, 0.55, -0.35], scale: [0.7, 0.55, 0.8] });    // abdomen
  pb.add(PRIM.ballLo, { bone: bodyB, color: mark, pos: [0, 0.78, -0.4], scale: [0.3, 0.12, 0.35] });  // back marking
  pb.add(PRIM.ball, { bone: bodyB, color: body, pos: [0, 0.48, 0.15], scale: [0.45, 0.35, 0.45] });   // cephalothorax
  pb.addPair(PRIM.ballLo, { bone: bodyB, color: eye, glow: 3, pos: [0.08, 0.55, 0.36], scale: 0.07 });
  for (let i = 0; i < 4; i++) {
    const splay = (i - 1.5) * 0.35;                         // fan legs front→back (yaw)
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1, b = legs[side * 4 + i];
      // upper segment rises outward, lower segment drops to the ground: two tapered boxes
      pb.add(taperedBox(0.5, 0.1, 0.1, 0.8, 0.8), { bone: b, color: body, pos: [sx * 0.45, 0.58, zs[i] + Math.sin(splay) * 0.2 * sx], rot: [0, -splay * sx, sx * 0.5] });
      pb.add(PRIM.cone4, { bone: b, color: body, pos: [sx * 0.78, 0.36, zs[i] + Math.sin(splay) * 0.4 * sx], rot: [0, 0, -sx * 2.7], scale: [0.12, 0.62, 0.12] });
    }
  }
  const geometry = pb.build({ flat: true, hull });
  return { skeleton: sk, geometry, meta: { height: 0.9, legLen: 0.5, legSwing: 0.4 } };
}

export function buildBat({ fur = 0x3a2f45, membrane = 0x5b3d6e, eye = 0xff6a3a, hull = true } = {}) {
  const sk = new SkeletonDef();
  sk.bone('root', null, [0, 0, 0]);
  const body = sk.bone('body', 'root', [0, 0, 0]);
  const wL = sk.bone('wingL', 'body', [0.15, 0, 0]);
  const wLt = sk.bone('wingLTip', 'wingL', [0.6, 0, 0]);
  const wR = sk.bone('wingR', 'body', [-0.15, 0, 0]);
  const wRt = sk.bone('wingRTip', 'wingR', [-0.6, 0, 0]);
  const pb = new PartBuilder();
  pb.add(PRIM.ball, { bone: body, color: fur, scale: [0.35, 0.32, 0.4] });
  pb.addPair(PRIM.cone4, { bone: body, color: fur, pos: [0.09, 0.2, 0.05], scale: [0.08, 0.18, 0.08] });     // ears
  pb.addPair(PRIM.ballLo, { bone: body, color: eye, glow: 3, pos: [0.07, 0.04, 0.17], scale: 0.06 });
  // wings: flat extruded membrane shapes (asymmetric → mirror with scale -1; winding auto-fixed)
  const wingIn = PRIM.extrude([[0, 0.05], [0.45, 0.12], [0.45, -0.2], [0.2, -0.12], [0, -0.08]], 0.03);
  const wingOut = PRIM.extrude([[0, 0.12], [0.5, 0.18], [0.35, -0.08], [0.18, -0.02], [0, -0.2]], 0.03);
  const flatX = [Math.PI / 2, 0, 0];                         // shape lies in XZ plane (span along X)
  pb.add(wingIn, { bone: wL, color: membrane, pos: [0.15, 0, 0], rot: flatX });
  pb.add(wingIn, { bone: wR, color: membrane, pos: [-0.15, 0, 0], rot: flatX, scale: [-1, 1, 1] });
  pb.add(wingOut, { bone: wLt, color: membrane, pos: [0.6, 0, 0], rot: flatX });
  pb.add(wingOut, { bone: wRt, color: membrane, pos: [-0.6, 0, 0], rot: flatX, scale: [-1, 1, 1] });
  const geometry = pb.build({ flat: true, hull });
  return { skeleton: sk, geometry, meta: { height: 0.5, hover: 1.4 } };
}
```

---

## Sources

1. three.js r170 source (verified files): https://cdn.jsdelivr.net/npm/three@0.170.0/src/ — `objects/Skeleton.js` (`update`, `computeBoneTexture`), `objects/SkinnedMesh.js`, `objects/InstancedMesh.js`, `objects/BatchedMesh.js`, `math/Frustum.js` (`intersectsObject`), `materials/Material.js` (`customProgramCacheKey`, `copy`), `geometries/CapsuleGeometry.js`, `renderers/WebGLRenderer.js` (`getProgram`, `needsProgramChange`), `renderers/webgl/WebGLObjects.js`, `renderers/webgl/WebGLShadowMap.js`, `renderers/webgl/WebGLProgram.js`, `renderers/shaders/ShaderLib/meshlambert.glsl.js`, `ShaderChunk/project_vertex`, `defaultnormal_vertex`, `normal_fragment_begin`.
2. BufferGeometryUtils r170: https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js
3. Animated Instanced Skinned Meshes (bone texture rows indexed by `gl_InstanceID`): https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958?page=2
4. Instance animated skinned mesh: https://discourse.threejs.org/t/instance-animated-skinned-mesh/48489
5. InstancedSkinnedMesh write-up (hundreds of characters): https://dev.to/sagacheng/using-instancedskinnedmesh-in-threejs-enabling-the-rendering-of-hundreds-of-3d-characters-on-screen-simultaneously-15gm
6. InstancedMesh2 / @three.ez/instanced-mesh (skinning, per-instance uniforms; depends on bvh.js): https://discourse.threejs.org/t/three-ez-instancedmesh2-enhanced-instancedmesh-with-frustum-culling-fast-raycasting-bvh-sorting-visibility-management-lod-skinning-and-more/69344
7. BatchedMesh docs: https://threejs.org/docs/pages/BatchedMesh.html. Per-instance data via DataTexture in BatchedMesh: https://discourse.threejs.org/t/how-can-i-use-datatexture-for-batchedmesh-to-access-per-instance-data-in-shader/72996. Multi-draw perf and Firefox notes: https://discourse.threejs.org/t/why-did-the-performance-worsen-significantly-when-i-used-multidrawinstances-in-batchedmesh/78581. InstancedMesh vs BatchedMesh: https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221
8. MeshToonMaterial docs (gradientMap needs NearestFilter): https://threejs.org/docs/pages/MeshToonMaterial.html
9. Outline approaches: OutlinePass https://threejs.org/docs/pages/OutlinePass.html; OutlineEffect vs OutlinePass https://discourse.threejs.org/t/outlinepass-with-effectcomposer-or-outlineeffect/19790; depth/normal edge detection https://discourse.threejs.org/t/edge-detection-with-normal-and-depth/7929
10. Stride wheel / surveyor wheel (distance-driven gait, after David Rosen's GDC procedural animation talk): https://forum.unity.com/threads/surveyor-wheel-technique.251435/
11. Distance-driven walk cycles and foot sliding (Blender stride bone): https://lists.blender.org/pipermail/bf-animsys/2014-August/000151.html
