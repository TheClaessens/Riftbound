# 04 — VFX readability on a bright, sunny world

**Scope.** Riftbound is moving from a night look ("darkness is the canvas, spells are the paint") to sunlit biomes: Act I lush greens, Act II orange-red barrens, Act III green riverlands with blue water. This document covers four things: why the current VFX break on bright ground, what shipped games do about it, the matching three.js r170 techniques, and a change list for `fx.js`, the skills, enemy bullets, pickups, the player ring and floating text, ordered by impact. It ends with the bloom, tone-mapping and exposure numbers to start from.

All code targets **three r170** (the importmap pins `three@0.170.0`). Snippets use the project's own names (`GEO`, `glowMaterial`, `this.transients`, …).

---

## 0. TL;DR

1. **Additive alone cannot work on a bright ground.** Additive blending can only make pixels brighter, so a saturated colour added to a mid-value ground moves toward white and pastel. Every effect that matters needs a *value* separation from the ground: either a dark under-layer, or a premultiplied **"blend-add"** where alpha darkens what is behind and RGB adds glow. Blizzard described this hybrid in its Diablo VFX talk as "BlendAdd".
2. **Cut the HDR multipliers** from 2.2–4 to about 1.2–1.8 for spell bodies. Keep small cores at 2–2.5. Multipliers of 3× and above under ACES push purple, cyan and yellow to near-white. Measured: arcane at 3× becomes `#f1d4f8` and frost at 3× becomes `#dff4f7` (see §1.3).
3. **Switch tone mapping to `NeutralToneMapping` with exposure ≈1.3.** Then change the bloom high-pass to use the **peak channel** (max RGB) with threshold ≈1.1 and a soft knee. Two problems drive this. First, saturated red, purple and magenta spells have low Rec.709 luminance (fire at 3× has luminance 0.95), so a luminance threshold cannot tell them apart from sunlit ground. Second, the stock high-pass copies the *whole* pixel once it crosses the threshold.
4. **Telegraphs need a new decal shader.** It should draw a dark outline band, a crisp bright rim that never pulses to zero, a *darkening* interior tint, and a growing fill with a bright leading edge that pulses faster near the end. The current red fill on Act II ground measures `#db6322`, against `#ce7122` for the bare ground, which is effectively invisible. Hostile and friendly telegraphs must look different: today meteor and fusions use the same decal as boss attacks.
5. **Rebuild enemy bullets** as a dark inverted-hull outline, an opaque saturated magenta body and a small white-hot core, plus a ground shadow dot. Measured: additive magenta at 2.5× over grass is `#ffc3c5` (pastel pink), while an opaque body at 1.25× is `#ff268b`.
6. **Smaller fixes:**
   - Point lights (`fx.light`) blow sunlit ground out to near-white; a 40-intensity light lifts grass from luminance 0.28 to 1.77. Scale them by about 0.3.
   - Use a dark text stroke on damage numbers.
   - Add a dark outline ring under the player ring.
   - Recolour the green XP gem, which is invisible on green grass.
   - Convert the dark-purple *additive* spawn ring, which is invisible on bright ground, into a darkening ring.

All of this is performance-neutral. No pass, render target or draw call is added, except one extra mesh per enemy bullet and one instanced draw for gem shadows.

---

## 1. Why the night VFX break in daylight

### 1.1 Additive blending only brightens

Today's `AdditiveBlending` with `premultipliedAlpha: false` is `glBlendFunc(SRC_ALPHA, ONE)` (three r170 `WebGLState.setBlending`). So `dst' = dst + src.rgb·src.a`. On black, the result equals the effect colour. On a ground of linear value 0.3, every channel gets +0.3, so hue contrast is lost and saturation drops. Valve's wiki notes that dark colours in an additive texture effectively vanish ([Valve Developer Community, $additive](https://developer.valvesoftware.com/wiki/$additive)). That is why the dark-purple spawn ring (`0x5a2aa0`, additive) and the muted death bursts (`deathColor` greens, additive) disappear on bright ground. A practitioner on RealtimeVFX hit the same problem: a red laser turned yellow over bright sand, and the fixes were alpha-composite (premultiplied) blending plus a darker backing layer behind the beam ([realtimevfx: influence of light on VFX](https://realtimevfx.com/t/how-to-turn-off-the-influence-of-light-on-vfx/28358)). A gamedev.net write-up reaches the same conclusion: additive "fails over the top of anything else besides dark backgrounds" ([gamedev.net](https://gamedev.net/blogs/entry/2167817-actually-programming)).

### 1.2 How UnrealBloomPass actually thresholds (r170)

The pipeline is `RenderPass → UnrealBloomPass → grade ShaderPass → OutputPass`.

- `EffectComposer` allocates its targets as **`HalfFloatType`** ([EffectComposer.js r170](https://github.com/mrdoob/three.js/blob/r170/examples/jsm/postprocessing/EffectComposer.js)). The RenderPass writes **scene-linear radiance without tone mapping**, because three only tone-maps when rendering to screen, and `OutputPass` does it here. Values above 1 survive.
- The bloom high-pass (`LuminosityHighPassShader`) computes `v = luminance(texel.rgb)` with the working-space Rec.709 weights (0.2126, 0.7152, 0.0722). It then computes `alpha = smoothstep(threshold, threshold + smoothWidth, v)` and outputs `mix(black, texel, alpha)` ([LuminosityHighPassShader.js r170](https://github.com/mrdoob/three.js/blob/r170/examples/jsm/shaders/LuminosityHighPassShader.js)). `UnrealBloomPass` hard-codes `smoothWidth = 0.01` and runs the high-pass at **half resolution** into a five-mip blur. It then adds the result back onto the read buffer *additively*, before tone mapping ([UnrealBloomPass.js r170](https://github.com/mrdoob/three.js/blob/r170/examples/jsm/postprocessing/UnrealBloomPass.js)). The official docs say the same ([UnrealBloomPass docs](https://threejs.org/docs/pages/UnrealBloomPass.html)).
- Consequences:
  - **(a)** The threshold compares *pre-exposure linear* values. `toneMappingExposure` is applied later in OutputPass, so changing exposure does **not** change what blooms.
  - **(b)** A pixel just over the threshold sends its **entire** value into the blur, so a sunlit patch at 0.86 against a threshold of 0.85 glows at full strength. This is a hard knee.
  - **(c)** Rec.709 luminance under-weights red and blue. Saturated reds, magentas and purples need huge multipliers to bloom, and those same multipliers whiten them in the tone mapper. The forum consensus is to push emissives above 1 and set the threshold at about 1 or more, so ordinary lit surfaces never bloom ([three.js forum: threshold](https://discourse.threejs.org/t/what-does-the-threshold-in-unrealbloompass-means-and-how-to-make-a-color-just-pass-that-threshold-a-bit-how-to-calculate-the-threshold-for-a-color/60984)).

**Sunlit ground radiance.** In r170 with physical lights, a Lambert surface gives approximately:

`L ≈ albedo_lin × (I_sun · cosθ + I_hemi) / π`

`BRDF_Lambert = diffuse/π`, and directional and hemisphere irradiance enter without a π factor. For a sun of 3 at cosθ 0.89 (today's light direction) and a hemisphere light of 1.2, that is **≈1.23 × albedo**.

| Surface (sRGB albedo) | Linear radiance | Rec.709 lum | Peak channel |
|---|---|---|---|
| Grass `#5f8f3a` | 0.14, 0.34, 0.05 | 0.28 | 0.34 |
| Barrens `#c0703a` | 0.65, 0.20, 0.05 | 0.28 | **0.65** |
| Water `#3a7fb0` | 0.05, 0.26, 0.53 | 0.24 | 0.53 |
| Fire spell `0xff6a1f ×3` | 3.00, 0.43, 0.04 | **0.95** | 3.00 |
| Arcane `0xb67cff ×3` | 1.40, 0.60, 3.00 | **0.95** | 3.00 |
| Enemy bullet `0xff2a6d ×2.5` | 2.50, 0.06, 0.38 | **0.60** | 2.50 |
| Frost `0x66d9ff ×3` | 0.40, 2.08, 3.00 | 1.79 | 3.00 |
| Storm `0xffe14a ×4` | 4.00, 3.01, 0.27 | 3.02 | 4.00 |

The fire and arcane spell bodies sit *at the same luminance as each other* and barely above a bright albedo-0.7 sand. Meanwhile the magenta bullet body never blooms at all; only its white core does. A luminance threshold cannot separate "spell" from "sunlit ground". A **peak-channel** threshold of about 1.1 can: ground peaks at ≤0.65 and spells at ≥1.4.

### 1.3 The tone mapper turns HDR saturated colours pastel

These values were computed with r170's exact `ACESFilmicToneMapping` (exposure 1.05, including three's 1/0.6 pre-scale) and `NeutralToneMapping` formulas. The output is sRGB.

| Input (linear) | ACES @1.05 (current) | Neutral @1.0 |
|---|---|---|
| Arcane ×3 | `#f1d4f8` (near-white) | `#c7a3fc` |
| Arcane ×1.5 | `#ddadef` (still pastel) | `#b582f8` |
| Frost ×3 | `#dff4f7` (white) | `#98e0fc` |
| Frost ×1.5 | `#bde6ed` | `#70d5f8` |
| Storm ×4 | `#fcf8d6` (white) | `#fde99e` |
| Fire ×1.3 | `#ff8e38` | `#f6713e` |
| Magenta ×2.5 **additive over grass** | `#ffc3c5` (pastel pink) | `#fc9597` |
| Magenta ×1.25 **opaque** | `#ff268b` | `#f63c6f` |
| Additive fire ×2.2 over barrens | `#ffcf84` (cream) | `#fc9e81` |
| Blend-add fire (×1.6, occ 0.4) over grass | `#efbb5b` | `#f29b32` |
| Grass ground | `#7bb147` | `#5b9622`; `#6aaa2d` at exposure 1.3 |
| Point light 40 at 1.5 m on grass | `#e9f4cd` (blown out) | `#b7fb8a` |

ACES skews hue and pushes blue and purple toward white quickly; this is a known issue ([three.js forum: tone-mapping guidance](https://discourse.threejs.org/t/pmndrs-post-processing-tone-mapping-guidance/59374/2)). AgX is deliberately *less* saturated than ACES out of the box ([three.js forum: AgX](https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609)), so it is the wrong fit for punchy VFX. Khronos PBR Neutral, which is `NeutralToneMapping` in three r162 and later, is linear below a peak of about 0.76. Above that it compresses with only 15% desaturation, so the art-directed albedo palette and moderately-HDR spells keep their hue.

### 1.4 Point lights scale with albedo

Day removes the darkness, but `fx.light` still flashes PointLights of intensity 20–120 at 1.5 m height. Ground irradiance from such a light is I/d^1.6, about 21 for I = 40, against about 4 from the sun. The pool of light reads as a white burn that also blooms. Under night lighting the same light was a pleasant glow, because the ground around it was dark.

---

## 2. What shipped games do

The sources are uneven. Riot published a full VFX style guide. Blizzard's Diablo VFX talk is available only as third-party notes. The other games are covered by practitioner commentary, and I found no primary source on Hades, Torchlight or Path of Exile internals. Items marked *(observed)* come from my knowledge of the games' visuals, not from a cited source.

- **League of Legends (Riot VFX style guide).**
  - The four goals are gameplay clarity, minimal clutter, theme, and surprise and delight. Visual impact must match gameplay impact: a basic attack is small, a game-changing ultimate is loud. Each effect has a **primary element** that communicates the gameplay, with secondary elements supporting through value and saturation ([Riot: LoL VFX style guide](https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/), [Riot: Clarity in League](https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/)).
  - VFX Apprentice's digest of the guide adds: a wider value range draws more focus; avoid 0% or 100% saturation so effects don't merge with the environment; and keep one dominant hue ([VFX Apprentice: 10 LoL VFX tips](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips)).
  - Hitboxes must match effects, and hard crowd-control effects should be the loudest. Riot also hides information to cut clutter: Morgana's R circle is shown only to Morgana and the affected targets ([realtimevfx: anatomy of a LoL missile](https://realtimevfx.com/t/anatomy-of-a-league-of-legends-missile-part-2-what-are-we-communicating-with-our-vfx/13062)).
  - *(observed)* Summoner's Rift is a bright, saturated green and brown map. Enemy ground indicators are red-edged with a dim fill, and ability VFX use dark smoke or alpha layers under bright cores.
- **Diablo III (Blizzard, GDC 2013 "Technical Artist Bootcamp: The VFX of Diablo").** The notes describe "BlendAdd": pure additive eventually turns layers white, while plain alpha keeps saturation but loses glow. The combined mode keeps both, with low overdraw ([notes on the Diablo VFX talk](https://3dreference.notion.site/VFX-In-Diablo-29806517bc9f4330be3c0ece360eace0); the RealtimeVFX thread above also cites D3 for premultiplied alpha). This is the premultiplied One / OneMinusSrcAlpha trick in §3.1.
- **Premultiplied alpha as a single blend state.** With `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`, alpha = 0 gives pure additive and alpha > 0 gives "over" compositing. Because one state does both, additive and alpha particles can share a single draw call ([dtrebilco/PreMulAlpha](https://github.com/dtrebilco/PreMulAlpha), [Wicked Engine: Which blend state for me?](https://wickedengine.net/2017/10/which-blend-state-for-me)).
- **Shmup and survivor bullets.** Enemy bullets must be distinct from everything else, which justifies breaking the game's palette and even flashing colours. They must render on top of most objects, and they must look different from player shots ([Game Developer: "Bright, slow and deadly"](https://www.gamedeveloper.com/design/bright-slow-and-deadly)). One developer added outlines to a shmup but had to stop the outline colours fading to white, because white merged into the background ([Sleigh Invaders devlog: outlines update](https://loubagel.itch.io/sleigh-invaders/devlog/858177/outlines-update)). *(observed)* Vampire Survivors and Brotato use small, hard-edged, high-value projectiles on mid-value ground; Brotato's enemy shots carry dark outlines.
- **Telegraph conventions.** *(observed)* WildStar, Lost Ark, FFXIV, Hades and Diablo IV all use a crisp rim that stays visible for the whole wind-up, a low-opacity fill, and a **growing inner fill or sweep that shows time-to-impact**, plus a final flash. When FFXIV recoloured its enemy indicator from red to beige, players complained that it read as "non-threatening" ([FFXIV forum thread](https://forum.square-enix.com/ffxiv/threads/147086-Red-enemy-skill-indicator-changed-to-beige)). Keep hostile = red, and solve contrast with **value** (dark band plus bright rim), not by changing the hue. ESO players also ask for adjustable telegraph colour for colour-blind accessibility ([ESO forum](https://forums.elderscrollsonline.com/en/discussion/comment/3951447/)), which is cheap to add later with a uniform.
- **Environment value budget.** The RealtimeVFX thread's last fix was to keep the environment in the midtones, because very bright, saturated environments leave no room for VFX. The same budget applies here: the ground should top out around albedo 0.6 linear, with the top value band reserved for VFX.

---

## 3. three.js r170 techniques

### 3.1 Blend-mode cheat sheet (from `WebGLState.setBlending`, r170)

| Material setting | GL blend func | Effect on bright ground |
|---|---|---|
| `NormalBlending`, `premultipliedAlpha:false` | `SRC_ALPHA, 1-SRC_ALPHA` (rgb) | Paints the colour over the ground. Keeps hue, no glow. |
| `NormalBlending`, `premultipliedAlpha:true` | `ONE, 1-SRC_ALPHA` | **Blend-add**: rgb is added, alpha darkens the ground. Only meaningful for a `ShaderMaterial` that writes un-premultiplied rgb deliberately; built-in materials multiply rgb by a. |
| `AdditiveBlending`, `premultipliedAlpha:false` (current) | `SRC_ALPHA, ONE` | Brightens only, so effects wash out. |
| `AdditiveBlending`, `premultipliedAlpha:true` | `ONE, ONE` | Brightens only. |
| `CustomBlending` | Your `blendSrc/blendDst/…` and equation. `premultipliedAlpha` is ignored. | Explicit blend-add (below). |

The blend-add state used throughout this document:

```js
// out.rgb = src.rgb + dst.rgb * (1 - src.a)   -> rgb = emission (added), a = occlusion (darkens what is behind)
// Destination alpha is left untouched.
export const BLEND_ADD = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};
```

`Material.setValues` accepts these keys, so `new THREE.ShaderMaterial({ ..., ...BLEND_ADD })` works. With `occ = 0` the output equals today's additive look, so the change is opt-in per effect.

**Two-mesh alternative.** You can put a dark `NormalBlending` mesh under an additive mesh. That costs two draws per effect and two materials. Prefer the single-pass blend-add shader. Use two meshes only where the shapes differ, for example a wider dark halo than the bright core.

### 3.2 Bloom: peak-channel high-pass with a soft knee (no extra passes)

Selective bloom through layers, as in [the three.js selective-bloom example](https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html), renders the scene **twice per frame**. It swaps every non-bloom material to black, renders the bloom composer, restores the materials, then renders the final composer. That doubles draw calls and scene traversal, and the second render would also re-render shadow maps unless `shadowMap.autoUpdate` is managed. **Not worth it here.** Because every spell is an unlit `MeshBasic` or `ShaderMaterial`, its HDR level is fully under our control, so a well-chosen threshold already acts as selective bloom. The only change is *what* gets thresholded:

```js
// engine.js — after creating this.bloom
function patchBloomHighPass(bloom, knee = 0.35) {
  bloom.highPassUniforms.smoothWidth.value = knee;   // soft knee instead of the hard-coded 0.01
  bloom.materialHighPassFilter.fragmentShader = /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 defaultColor;
    uniform float defaultOpacity;
    uniform float luminosityThreshold;
    uniform float smoothWidth;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      // Peak channel, not Rec.709 luminance: saturated red, purple and magenta HDR spells
      // bloom as easily as yellow ones, and mid-value sunlit ground (peak <= ~0.7) never does.
      float v = max( texel.r, max( texel.g, texel.b ) );
      float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );
      // Feed only the energy above the threshold into the blur, so large bright areas don't halo.
      vec3 excess = texel.rgb * clamp( ( v - luminosityThreshold ) / max( v, 1e-4 ), 0.0, 1.0 );
      gl_FragColor = vec4( mix( defaultColor, excess, alpha ), mix( defaultOpacity, texel.a, alpha ) );
    }`;
  bloom.materialHighPassFilter.needsUpdate = true;
}

// strength, radius, threshold (pre-exposure, linear, peak channel)
this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.35, 1.1);
patchBloomHighPass(this.bloom, 0.35);
```

Strength rises from 0.6 to 0.7 because only the *excess* above the threshold is blurred now. In practice that means less glow overall, concentrated on genuine HDR. Tune strength in the range 0.5–0.9.

**Rule for the threshold.** Keep it at least 1.3–1.5× the brightest sunlit diffuse peak channel:

`T ≥ 1.4 × max_channel(albedo_lin) × (I_sun·cosθ + I_hemi)/π`

Re-check it whenever the sun intensity changes. With sun 3 and hemisphere 1.2, the barrens peak is 0.65, so T = 1.1 leaves headroom for brighter sand, rocks and specular glints. Water sun-glints that exceed T *will* sparkle, which is fine and even desirable.

### 3.3 Particles: single-draw blend-add with per-particle occlusion

This is a drop-in for `FX.constructor` and `burst` / `spark`. It adds one float attribute and keeps one draw call.

```js
// constructor
this.pOcc = new Float32Array(MAX_PARTICLES);
g.setAttribute('occ', new THREE.BufferAttribute(this.pOcc, 1).setUsage(THREE.DynamicDrawUsage));
this.pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 30 } },
  vertexShader: /* glsl */`
    attribute float size; attribute float alpha; attribute float occ; attribute vec3 color;
    varying vec3 vColor; varying float vAlpha; varying float vOcc;
    uniform float uScale;
    void main(){
      vColor = color; vAlpha = alpha; vOcc = occ;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * uScale;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vColor; varying float vAlpha; varying float vOcc;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float s = smoothstep(0.5, 0.0, d);
      // rgb is ADDED (s*s matches the old SRC_ALPHA,ONE falloff); alpha DARKENS what is behind
      // over the wider s footprint, so every particle carries a soft dark halo on bright ground.
      gl_FragColor = vec4(vColor * (s * s * vAlpha), s * vAlpha * vOcc);
    }`,
  transparent: true,
  depthWrite: false,
  ...BLEND_ADD,
});
for (const n of ['position', 'color', 'size', 'alpha', 'occ']) { /* mark needsUpdate in update() as today */ }

// burst(): new options  occ (0 = pure glow, 1 = fully opaque smoke), backing (dark under-puffs)
const OCC_DEFAULT = 0.35, HDR_DEFAULT = 1.6;
burst(pos, opts = {}) {
  if (opts.backing) {   // dark puffs spawned FIRST so they sit under the glow in draw order
    this.burst(pos, { ...opts, backing: 0, color: opts.backingColor ?? 0x000000, hdr: 1, occ: opts.backing,
      count: Math.ceil((opts.count ?? 12) * 0.3), size: (opts.size ?? 0.35) * 1.8,
      speed: (opts.speed ?? 4) * 0.5, life: (opts.life ?? 0.5) * 1.3 });
  }
  const occ = opts.occ ?? OCC_DEFAULT;
  const hdr = opts.hdr ?? HDR_DEFAULT;
  // ... existing body, plus:  this.pOcc[i] = occ;
}
// spark(): this.pOcc[i] = opts.occ ?? 0.25;
// _copyParticle(): this.pOcc[to] = this.pOcc[from];
```

A dark-tinted `color` with high `occ` gives smoke or ash; a saturated `color` with `occ` 0.3–0.5 gives "glow with a dark core". Points blend in submission order. The swap-remove in `update()` reorders particles over time, which is invisible at these occlusion levels.

### 3.4 Shared mesh shaders for `ring` / `flashDisc` (blend-add)

`RingGeometry` and `CircleGeometry` UVs are planar, `uv = position.xy / (2·outer) + 0.5`, so `length(vUv*2-1)` is the normalised radius. No new geometry is needed.

```js
const FX_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RING_FS = /* glsl */`
  uniform vec3 uColor;   // linear, already x hdr
  uniform float uInner;  // geometry inner radius (0..1)
  uniform float uFade;   // 1 -> 0 over life
  uniform float uOcc;    // ground darkening (0 = pure additive)
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float t = clamp((r - uInner) / (1.0 - uInner), 0.0, 1.0);    // 0 inner edge .. 1 outer edge
    float core = pow(clamp(1.0 - abs(t - 0.6) / 0.6, 0.0, 1.0), 2.0);  // bright band, biased outward
    float body = smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.8, t);  // dark backing across the band
    gl_FragColor = vec4(uColor * core * uFade, uOcc * body * uFade);
  }`;

const DISC_FS = /* glsl */`
  uniform vec3 uColor; uniform float uFade; uniform float uOcc;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float glow = (1.0 - r * r);                   // hot centre, soft edge (no flat white slab)
    float occ = smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(uColor * glow * uFade, uOcc * occ * uFade);
  }`;

ring(pos, opts = {}) {
  const width = opts.width ?? 0.18;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff).multiplyScalar(opts.hdr ?? 1.7) },
      uInner: { value: 1 - width },
      uFade: { value: 1 },
      uOcc: { value: opts.occ ?? 0.45 },
    },
    vertexShader: FX_VS, fragmentShader: RING_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND_ADD,
  });
  const m = new THREE.Mesh(this._ringGeo(width), mat);   // cached per width (see below)
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, opts.y ?? 0.08, pos.z);
  m.renderOrder = 2;
  this.scene.add(m);
  const life = opts.life ?? 0.4, r1 = opts.radius ?? 3, r0 = opts.from ?? 0.2;
  this.transients.push({ mesh: m, t: 0, life, update: (tr, k) => {
    const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k));
    m.scale.set(r, r, r);
    mat.uniforms.uFade.value = 1 - k;
  } });
}

// Ring geometry cache: today every ring allocates and disposes a RingGeometry(…, 48).
_ringGeo(width) {
  const key = Math.round(width * 100);
  let g = this._ringGeos?.get(key);
  if (!g) { (this._ringGeos ??= new Map()).set(key, g = new THREE.RingGeometry(1 - key / 100, 1, 48)); SHARED_GEO.add(g); }
  return g;
}
// In update(): replace  !Object.values(GEO).includes(o.geometry)  with  !SHARED_GEO.has(o.geometry)
// where  const SHARED_GEO = new Set(Object.values(GEO));  at module scope.
```

`flashDisc` follows the same pattern with `DISC_FS`: `uColor = color × (opts.hdr ?? 1.2)`, `uOcc = 0.3`, and `uFade = (1-k)·fade`. `ShaderMaterial` programs are cached by source, so a new material per transient does not recompile.

### 3.5 Telegraph decal shader (circle + line)

**Design.** From the outside in:

1. A **dark outline band** (0.10 world units, near-black crimson, alpha 0.75). It gives value contrast on green, orange and blue alike.
2. A **bright rim** (0.14 world units). It never pulses below 80% alpha. Width is in world units, so small and large telegraphs read the same.
3. A **darkening interior tint**, using a dark version of the rim colour rather than an additive one.
4. A **growing fill** that marks time-to-impact, with a **bright leading edge**.
5. Over the last 30% of the wind-up, the fill and rim pulse faster: about 0.8 Hz rising to about 3.2 Hz (5 → 20 rad/s).

Friendly (player) telegraphs use the element colour, no dark band, a faint tint and a **dashed** rim, so they can never be mistaken for danger.

```js
const TELE_VS = FX_VS;

const TELE_COMMON = /* glsl */`
  uniform vec3 uRim;
  uniform vec3 uFill;
  uniform vec3 uOutline;
  uniform float uOutlineA;
  uniform float uFillA;     // fill alpha once "charged"
  uniform float uDashed;    // 1 = friendly dashed rim
  uniform float uProgress;  // 0..1
  uniform float uTime;
  varying vec2 vUv;
  const float OUTLINE_W = 0.10;   // world units
  const float RIM_W = 0.14;       // world units
  // d: distance from the outer edge (world units, inward positive)
  // edgeDist: signed distance to the progress front; filled: 1 behind the front; dashCoord: arc length
  vec4 teleShade(float d, float edgeDist, float filled, float dashCoord) {
    float aa = max(fwidth(d), 1e-4);
    if (d < -aa) discard;
    float inShape  = smoothstep(-aa, 0.0, d);
    float outline  = inShape * (1.0 - smoothstep(OUTLINE_W - aa, OUTLINE_W, d));
    float rim      = smoothstep(OUTLINE_W - aa, OUTLINE_W, d)
                   * (1.0 - smoothstep(OUTLINE_W + RIM_W - aa, OUTLINE_W + RIM_W, d));
    float interior = smoothstep(OUTLINE_W + RIM_W - aa, OUTLINE_W + RIM_W, d);
    rim *= mix(1.0, step(0.45, fract(dashCoord / 0.9)), uDashed);
    float urg   = smoothstep(0.7, 1.0, uProgress);
    float pulse = 0.5 + 0.5 * sin(uTime * mix(5.0, 20.0, urg));
    float edge  = interior * (1.0 - smoothstep(0.0, 0.12 + aa, abs(edgeDist))) * step(0.02, uProgress);
    vec4 c = vec4(uFill, interior * uFillA * mix(0.35, 1.0 + 0.25 * urg * pulse, filled));
    c = mix(c, vec4(uRim, 0.9), edge);
    c = mix(c, vec4(uRim, 0.8 + 0.2 * pulse), rim);
    c = mix(c, vec4(uOutline, uOutlineA), outline);
    return c;
  }`;

const TELE_CIRCLE_FS = TELE_COMMON + /* glsl */`
  uniform float uRadius;
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * (uRadius + 0.05);   // world units (plane is 0.05 larger than the circle)
    float r = length(p);
    float pr = uProgress * (uRadius - OUTLINE_W - RIM_W);
    float filled = 1.0 - smoothstep(pr - 0.02, pr, r);
    gl_FragColor = teleShade(uRadius - r, r - pr, filled, atan(p.y, p.x) * uRadius);
  }`;

const TELE_LINE_FS = TELE_COMMON + /* glsl */`
  uniform vec2 uSize;   // (width, length), world units
  void main() {
    float x = (vUv.x - 0.5) * uSize.x;
    float y = (1.0 - vUv.y) * uSize.y;   // 0 at the origin end: plane +Y maps to -Z after rotation.x = -PI/2
    float d = min(0.5 * uSize.x - abs(x), min(y, uSize.y - y));
    float pr = uProgress * uSize.y;
    float filled = 1.0 - smoothstep(pr - 0.02, pr, y);
    gl_FragColor = teleShade(d, y - pr, filled, y + abs(x));
  }`;

const HOSTILE_RED = 0xff2a3d;

_teleMat(fragmentShader, opts) {
  const friendly = !!opts.friendly;
  const base = new THREE.Color(opts.color ?? (friendly ? 0xffffff : HOSTILE_RED));
  return new THREE.ShaderMaterial({
    uniforms: {
      uRim: { value: base.clone().multiplyScalar(friendly ? 1.1 : 1.0) },   // crisp, ~no bloom
      uFill: { value: base.clone().multiplyScalar(friendly ? 0.6 : 0.22) }, // hostile: DARK tint
      uOutline: { value: new THREE.Color(0x14000a) },
      uOutlineA: { value: friendly ? 0.0 : 0.75 },
      uFillA: { value: friendly ? 0.18 : 0.42 },
      uDashed: { value: friendly ? 1 : 0 },
      uProgress: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: TELE_VS, fragmentShader,
    transparent: true, depthWrite: false,   // NormalBlending: straight alpha
  });
}

telegraph(pos, radius, duration, opts = {}) {
  const mat = this._teleMat(TELE_CIRCLE_FS, opts);
  mat.uniforms.uRadius = { value: radius };
  const m = new THREE.Mesh(GEO.plane, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(2 * (radius + 0.05));
  m.position.set(pos.x, 0.07, pos.z);
  m.renderOrder = opts.friendly ? 3 : 8;   // hostile above player ground FX, below particles (10)
  this.scene.add(m);
  const handle = { done: false, cancel: () => { handle.done = true; } };
  this.transients.push({
    mesh: m, t: 0, life: duration,
    update: (tr, k) => {
      if (handle.done) { tr.t = tr.life; return; }
      mat.uniforms.uProgress.value = k;
      mat.uniforms.uTime.value = tr.t;
    },
    onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
  });
  return handle;
}

lineTelegraph(from, dir, length, width, duration, opts = {}) {
  const mat = this._teleMat(TELE_LINE_FS, opts);
  mat.uniforms.uSize = { value: new THREE.Vector2(width, length) };
  const m = new THREE.Mesh(GEO.plane, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(width, length, 1);
  m.position.z = length / 2;
  const group = new THREE.Group();
  group.add(m);
  group.position.set(from.x, 0.07, from.z);
  group.rotation.y = Math.atan2(dir.x, dir.z);
  m.renderOrder = opts.friendly ? 3 : 8;
  this.scene.add(group);
  const handle = { done: false, cancel: () => { handle.done = true; } };
  this.transients.push({
    mesh: group, t: 0, life: duration,
    update: (tr, k) => {
      if (handle.done) { tr.t = tr.life; return; }
      mat.uniforms.uProgress.value = k;
      mat.uniforms.uTime.value = tr.t;
    },
    onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
  });
  return handle;
}
```

How each layer reads on each ground (Neutral tone mapping):

- **Dark interior tint (`0x5a0010` at 0.34).** Barrens drop from `#ce7122` to `#af5919`, grass from `#5b9622` to `#597919`, and water darkens similarly. It reads as a "stain" on any hue.
- **Outline band.** Gives near-black against every ground.
- **Rim.** Pure red at full alpha supplies the hue.

The *current* fill (`#ff3344` at 0.25, normal blending) turns barrens into `#db6322` against `#ce7122` for the bare ground, which is invisible. That is the main reason for the rewrite.

Costs are the same as today. Each telegraph becomes one mesh and one material instead of a group with two meshes and two materials. `fwidth` is native in WebGL2. The API contract is unchanged: `onDone` still fires at k = 1 and `cancel()` still works.

### 3.6 Enemy bullet that reads on every ground

```js
// enemies.js — shared, never disposed
const BULLET_OUTLINE = new THREE.MeshBasicMaterial({ color: 0x16000c, side: THREE.BackSide });  // inverted hull
const BULLET_CORE = glowMaterial(0xffffff, 2.2);                    // small white-hot core: the only part that blooms
const BULLET_SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
function bulletMat(color) {
  let m = _bulletMats.get(color);
  if (!m) { m = glowMaterial(color, 1.4); _bulletMats.set(color, m); }  // OPAQUE, saturated (no additive)
  return m;
}

// EnemyBullet constructor
const shell = new THREE.Mesh(GEO.sphereLow, BULLET_OUTLINE);
shell.scale.setScalar(size * 1.38);                // ~1.5-2 px dark ring at 1080p; visual ≈ hit radius
const outer = new THREE.Mesh(GEO.sphereLow, bulletMat(color));
outer.scale.setScalar(size);
const core = new THREE.Mesh(GEO.sphereLow, BULLET_CORE);
core.scale.setScalar(size * 0.45);
const shadow = new THREE.Mesh(GEO.disc, BULLET_SHADOW);   // true ground position (bullets fly at y = 0.8)
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -0.78;
shadow.scale.setScalar(size * 1.1);
this.mesh.add(shell, outer, core, shadow);
// trail: game.fx.spark(this.pos, _vel, { color: this.trailColor, size: 0.2, life: 0.4, hdr: 1.4, occ: 0.5 });
```

- **Colour.** Keep **magenta `#ff2a6d`** as the hostile-projectile identity. It is complementary to Act I and Act III greens and well away from water blue. On Act II orange it is only about 40° of hue away, so the dark shell carries contrast there. If playtests still show trouble in Act II, shift that act to a pinker `#ff2ad4`.
- **Trail.** Never give a hostile trail the player's fire orange. `emberSpitter` uses `trail: 0xff7a2a` today; make it magenta, or dark smoke with `occ` 0.8.
- **Visual size.** The visual radius should match the hit radius. Today the visual is 0.28 against a hit radius of 0.35; the shell at 0.39 closes that gap.
- **Ground shadow.** The shadow dot fixes an iso-specific problem. A body drawn at y = 0.8 appears offset up-screen from the XZ point that actually hits the player.
- **Cost.** The shell is opaque with depth write, so it costs nothing extra in sorting. It adds one mesh per bullet. If bullet counts grow, the next step is an `InstancedMesh` per layer.

### 3.7 Floating text (DOM)

`.ftext` uses three blurred black shadows, and `.label` uses a `0 0 10px currentColor` glow. On a sunlit ground the coloured glow *lowers* legibility. Replace both with a stroke:

```css
.ftext { position: absolute; left: 0; top: 0; font-weight: 800; font-size: 16px; white-space: nowrap;
  will-change: transform, opacity;
  -webkit-text-stroke: 4px #120a1a; paint-order: stroke fill;   /* stroke drawn under fill => clean 2 px outline */
  text-shadow: 0 2px 0 rgba(0, 0, 0, .45); }
.ftext.crit { font-size: 22px; -webkit-text-stroke-width: 5px; }
.ftext.label { font-family: 'Cinzel', serif; font-size: 18px; letter-spacing: 1px;
  -webkit-text-stroke: 4px #120a1a; text-shadow: 0 2px 0 rgba(0, 0, 0, .5), 0 0 12px rgba(0, 0, 0, .35); }
.ftext.label.big { font-size: 30px; -webkit-text-stroke-width: 5px; }
```

`paint-order` on HTML text has been Baseline since March 2024, with Chrome 123 the last browser to add it ([MDN paint-order](https://developer.mozilla.org/docs/Web/CSS/paint-order), [caniuse](https://caniuse.com/mdn-css_properties_paint-order)). Older browsers degrade gracefully to a thinner, centred stroke. A hard stroke is also cheaper to repaint than three blurred shadows on up to 90 animating nodes.

---

## 4. Audit of the current code and the change list

**P0** = breaks readability or gameplay on bright ground. **P1** = clearly degraded. **P2** = polish.

| # | Where | Today | Problem on bright ground | Change |
|---|---|---|---|---|
| **P0-1** | `fx.telegraph` / `fx.lineTelegraph` (fx.js 202–257) | Normal blending. Ring at `color×1.6` pulses opacity `0.5±0.5·sin(30k)`, so it **hits 0**. Fill `#ff3344` at 0.25 / 0.30. Ring width is 6% of the radius. | Red fill on orange barrens is invisible (§3.5). The rim blinks out. Small-radius rings are 2–3 px. Hostile and friendly look identical. | Adopt the §3.5 shader. Callers: **hostile** = enemies.js 516, 595, 623, bosses.js 416/428, world.js 1228/1233 (lava and strike hazards). Unify hostile damage telegraphs to `HOSTILE_RED`; bomber `0xff5a2a` and lava `0xff5a2a` are orange on orange. The blinker's purple destination marker may stay purple but keeps the hostile outline. **Friendly** (`friendly: true`) = meteor.js 63, fusions2.js 223, 289, 342, 389. |
| **P0-2** | `EnemyBullet` (enemies.js 106–114, 828–866) | Additive magenta ×2.5 plus additive white ×3. Magenta or orange trail sparks. | Becomes a pastel pink blob (`#ffc3c5` on grass). On Act II it blends with ground and player fire. | §3.6: opaque magenta ×1.4, dark inverted-hull shell, white core ×2.2, ground shadow dot, magenta trail with `occ`. |
| **P0-3** | Engine tone mapping and bloom (engine.js 118–119, 156) | ACES at 1.05; bloom 0.6 / 0.5 / **0.85 luminance**, hard knee. | Saturated spells go pastel. Bloom catches bright sand, point-lit ground and emissive ground cracks. Red and purple spells don't bloom unless they stack. | `NeutralToneMapping`, exposure 1.3. Bloom 0.7 / 0.35 / 1.1 with the peak-channel soft-knee high-pass (§3.2). If the art team prefers ACES contrast, keep ACES at 1.0, but the HDR cuts in P0-5 become mandatory. |
| **P0-4** | `fx.light` (fx.js 271; 23 call sites, intensities 20–120) | PointLights at 1.5 m, decay 1.6. | Lifts grass from luminance 0.28 to 1.77: a white burn plus bloom. | Add `this.lightScale = 0.3` (daytime) and multiply in `light()`. Alternatively drop lights for effects below about 2 m radius, keeping them for meteor, boss and reaction explosions. The pool stays fixed at 6, so there are no recompiles. |
| **P0-5** | `fx.burst` / `fx.spark` (fx.js 87–132, shader 34–57) | Additive, `hdr` default **2.2**. | Every burst over ground adds 0.3–0.6 to all channels and turns cream or white (fire on barrens `#ffcf84`). | §3.3: blend-add shader, `HDR_DEFAULT = 1.6`, `OCC_DEFAULT = 0.35`, new `occ` and `backing` options. Explicit callers with `hdr: 0.8` (combat.js 212) stay as they are. |
| **P0-6** | `fx.flashDisc` (fx.js 153–166) | Additive full disc ×1.6 at 0.7 over the whole AoE radius. | Large flat bright slab: the main whiteout source in combat. | `DISC_FS` blend-add: radial `glow`, `hdr` 1.2, `occ` 0.3. Keep the `heat > 260` cap and `budget()` fade. |
| **P1-1** | `fx.ring` (fx.js 136–150) | Additive ×2.5. New `RingGeometry` per call. | Washes out; thin rings vanish on grass. | §3.4 `RING_FS` blend-add (`hdr` 1.7, `occ` 0.45), cached geometry, `renderOrder` 2. |
| **P1-2** | Spawn portal (enemies.js 333–334) | Additive ring `0x5a2aa0` and burst `0x3c1f70`. | Dark colour × additive = **invisible**, so enemies seem to pop in. | `fx.ring(..., { color: 0x5a2aa0, hdr: 0.8, occ: 0.85 })` and `fx.burst(..., { color: 0x3c1f70, hdr: 1, occ: 0.85 })`: a dark rift "hole" that reads on every ground. |
| **P1-3** | Death bursts (combat.js 187) | Additive muted greens and browns (`deathColor`). | Invisible on grass. | Add `occ: 0.75, hdr: 1.0` so they read as dark debris chunks. Reactions and crits keep the bright glow. |
| **P1-4** | Player `groundRing` (models.js 93–107) | Additive ×1.4 at 0.7, `depthTest:false`, `renderOrder` 20, inner black disc at 0.35. | Storm and frost rings go pale (`#e9e69b` on grass under ACES). | Code below. **Keep** `depthTest:false` and `renderOrder` 20: they keep the player findable. |
| **P1-5** | Hostile boss hazards (bosses.js 98 FlameRing `0xff6a1f`, 137 fire trail, 201 beams) | Additive glow. FlameRing uses the **player's** fire orange. | Indistinguishable from player fire, especially on Act II. | Give hazards the hostile language: blend-add (`occ` 0.5) plus a dark under-band. Hue toward `0xff3a1a` / `HOSTILE_RED`, never the player's element orange. |
| **P1-6** | XP gems (pickups.js 10–14, 131) | Unlit `MeshBasic` ×2.2. Small blue `0x4fb8ff`, **big green `0x5dff9a`**, huge pink `0xff5ad1`. | The green gem disappears on Act I and Act III grass. Pink is close to the hostile bullet magenta. Up to 1500 gems ×2.2 is a bloom carpet. | Big → gold `0xffc83a`, huge → white `0xffffff` at ×2.5 (blooms, size ×2.1). Base multiplier 1.5. Add one `InstancedMesh` of shadow blobs (code below). |
| **P1-7** | DOM numbers and labels (css/style.css 10–14) | Blurred black shadows; labels glow in `currentColor`. | Low contrast, especially yellow storm numbers on sunlit grass. | §3.7 stroke CSS. |
| **P1-8** | Elite rim and Prism Ward shells (enemies.js 94, 100) | Additive at 0.35 / 0.32. | Faint on bright ground, but the ward colour is gameplay information (which element the enemy is immune to). | `NormalBlending`, opacity 0.5–0.55, `color×1.2`. Optionally add a fresnel `ShaderMaterial` later. |
| **P2-1** | `fx.lightning` (fx.js 169–199) | `LineBasicMaterial` (always 1 px), additive ×4 / ×2. | 1 px yellow on sunlit grass is nearly invisible. | Use `Line2` with two layers: a dark 6 px `NormalBlending` strand at 0.6 under a 3 px colour strand at ×1.8 with blend-add (code below). Keep the impact burst and give it `occ` 0.3. |
| **P2-2** | Player projectiles: `Projectile` default `glowMaterial(color, 3)` (common.js 42), arcane bolt and orbs ×3.5, iceShard ×2 | Opaque unlit, ×3–4. | Pastel under ACES; fine under Neutral at lower HDR. | Body ×1.8. Trails pass `occ: 0.25`. |
| **P2-3** | Additive halos and auras: meteor halo (93, 148), fusions2 halos (75, 184, 235–236), fusions.js 117–120, singularity rings (58–59), staticField (36–38), blizzard edge (52), chest beacon (pickups 72) | Additive at 0.1–0.6 opacity. | Faint or invisible. | Swap to `BLEND_ADD` `ShaderMaterial`s with `occ` 0.3–0.5, or `NormalBlending` at about 1.5× the current opacity. Keep the existing **dark** layers (singularity floor `0x1a0633` at 0.6, meteor char `0x2a0f06` at 0.6): they already work in daylight. |
| **P2-4** | Grade pass (engine.js 92–103) | Vignette 0.35. Low-HP edge is **additive** red. Pulse flashes are additive. | The red edge barely registers over a bright frame, and pulses clip to white. | Vignette 0.2. Low HP: `col = mix(col, col * vec3(1.0, 0.25, 0.2), redEdge);` (darken and tint, reads on bright frames). Halve the pulse `amp` in daylight. |
| **P2-5** | World ground emissive (world.js 33/43/53 `groundGlow` 0.6–0.85) | Glowing cracks for the night look. | At day exposure they bloom and wash out under VFX. | Set `groundGlow` to 0–0.15 in sunny biomes. This belongs to the world pass; noted here because it feeds bloom. |

### 4.1 Snippets for the less obvious items

**Player ring (models.js).** Saturated normal-blend ring over a dark outline ring:

```js
G.ringOutline = new THREE.RingGeometry(0.55, 0.8, 32);   // add to the shared G table

function groundRing(color) {
  // Always on top (no depth test) so the player stays findable inside dense combat.
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  mat.color.multiplyScalar(1.15);
  const ring = new THREE.Mesh(G.ring, mat);
  ring.rotation.x = -HALF_PI; ring.position.y = 0.04;
  ring.scale.setScalar(1.15);
  ring.renderOrder = 20;
  // dark outline under the coloured band: value contrast on green, orange and blue ground
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0812, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false });
  const outline = new THREE.Mesh(G.ringOutline, outlineMat);
  outline.renderOrder = 19;
  ring.add(outline);
  // inner soft disc (contact shadow), slightly lighter than before
  const discMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
  const disc = new THREE.Mesh(GEO.disc, discMat);
  disc.scale.setScalar(0.62 / 1.15); disc.position.z = -0.01;
  ring.add(disc);
  return ring;
}
```

**Gem shadow blobs (pickups.js).** One extra draw call:

```js
// constructor
const blobGeo = GEO.disc.clone().rotateX(-Math.PI / 2);      // bake the flat orientation into the geometry
this.blobs = new THREE.InstancedMesh(blobGeo,
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), MAX_SHARDS);
this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.blobs.count = 0; this.blobs.frustumCulled = false;
game.scene.add(this.blobs);
this._qId = new THREE.Quaternion();
this._bp = new THREE.Vector3(); this._bs = new THREE.Vector3();

// update(), inside the shard loop next to setMatrixAt(n, …)
this._m.compose(this._bp.set(s.pos.x, 0.03, s.pos.z), this._qId, this._bs.setScalar(0.2 * sc));
this.blobs.setMatrixAt(n, this._m);
// after the loop
this.blobs.count = n; this.blobs.instanceMatrix.needsUpdate = true;
// colours
this.inst.setColorAt(n, this._c.set(huge ? 0xffffff : big ? 0xffc83a : 0x4fb8ff));
// reset(): this.blobs.count = 0;
```

**Lightning with a dark under-strand (P2-1).** Uses r170 addons. `LineSegments2.onBeforeRender` sets the `resolution` uniform from the viewport.

```js
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// inside lightning(), per strand, after building pts
const flat = pts.flatMap((p) => [p.x, p.y, p.z]);
const geo = new LineGeometry(); geo.setPositions(flat);
const dark = new LineMaterial({ color: 0x140a24, linewidth: 6, transparent: true, opacity: 0.6, depthWrite: false });
const glow = new LineMaterial({ color: opts.color ?? 0xffe14a, linewidth: 3, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending });
glow.color.multiplyScalar(strand === 0 ? 1.8 : 1.2);
const under = new Line2(geo, dark); under.renderOrder = 9;
const over = new Line2(geo, glow); over.renderOrder = 11;
group.add(under, over); mats.push(dark, glow);
// update(): for (const m of mats) m.opacity = (m === dark ? 0.6 : 1) * (1 - k);
// The geometry is shared by both lines; the transient traverse disposes it twice, which is harmless.
```

### 4.2 Render-order plan (transparent queue, lower draws first)

| renderOrder | Contents |
|---|---|
| 0–1 | Persistent ground decals (blizzard disc, singularity floor, crater) |
| 2 | Player ground FX (`fx.ring`, `fx.flashDisc`) |
| 3 | Friendly telegraphs |
| 6 | World ambient points (already 6) |
| **8** | **Hostile telegraphs**: drawn after player ground FX, so player spam cannot bury them |
| 9 / 11 | Lightning under / over strands |
| 10 | Particles |
| 19 / 20 | Player ring outline / ring (depthTest off) |

Bullets are opaque, so `renderOrder` does not lift them above occluders. If canopy hides bullets, handle it in the world pass with tree fade near the player, rather than with `depthTest:false` on bullets.

### 4.3 What must NOT change (gameplay depends on it)

- **Hostile = red telegraphs, hostile projectiles = magenta with a white core.** Fix contrast with *value* (dark bands), not by recolouring. The FFXIV beige backlash is the cautionary tale.
- **The telegraph timing contract.** The fill reaches the edge exactly when `onDone` fires (k = 1), `cancel()` works, and handles are tracked by bosses and world hazards. The new shader only changes how it looks.
- **The player ring stays drawn on top** (`depthTest:false`, `renderOrder` ≥ 19).
- **The `heat` and `budget()` throttle** and the `MAX_PARTICLES` / `MAX_NUMBERS` caps. They prevent whiteout in chain reactions and matter *more* in daylight.
- **Bullet hitbox radius** (0.35). The new shell makes the visual match it; do not shrink the hitbox to match the old visual.
- **The pooled 6 PointLights.** Scale their intensity, but keep the count fixed so shaders don't recompile.
- **Existing dark layers** (singularity floor, meteor char). These are already the right technique.

---

## 5. Recommended numbers (starting point for the sunlit acts)

| Setting | Night (current) | **Day (recommended)** | Notes |
|---|---|---|---|
| `renderer.toneMapping` | ACESFilmic | **NeutralToneMapping** | Keeps the albedo palette and HDR spell hue. Fallback: ACES at exposure 1.0 plus the HDR cuts. |
| `toneMappingExposure` | 1.05 | **1.25–1.35** | Neutral is about linear below 0.76; at 1.3, grass `#5f8f3a` renders `#6aaa2d`, barrens `#e7812e`, water `#2d95d3`. Exposure does not change what blooms. |
| Sun (DirectionalLight) intensity | moon 1.5–1.9 | **2.8–3.2** | With hemisphere light, lit ground ≈ 1.2 × albedo (linear). |
| Hemisphere intensity | 0.9 | **1.0–1.3** | Sky tint per act; warm ground colour for bounce. |
| Ground albedo (linear peak channel) | — | **≤ 0.6** (sRGB about ≤ `#cbcbcb` per channel) | The value budget: keep ground in the mid-tones and leave the top for VFX. |
| Bloom strength / radius / threshold | 0.6 / 0.5 / 0.85 (luminance) | **0.7 / 0.35 / 1.1 (peak channel)**, knee 0.35 | Threshold ≥ 1.4 × brightest sunlit diffuse peak. Tighter radius suits daylight. |
| Spell body HDR (`glowMaterial`, projectiles) | ×2.5–4 | **×1.4–1.8** | Peak 1.4–1.8 clears the 1.1 threshold; hue survives Neutral. |
| Small hot cores (bullet core, orb, eyes) | ×3–4 | **×2–2.5** | The only near-white elements, kept tiny. |
| Particles default `hdr` / `occ` | 2.2 / — | **1.6 / 0.35** | Use `occ` 0.7–0.9 for smoke, debris and spawn effects. |
| `fx.ring` `hdr` / `occ` | 2.5 / — | **1.7 / 0.45** | |
| `fx.flashDisc` `hdr` / `occ` | 1.6 flat ×0.7 | **1.2 radial / 0.3** | |
| Telegraph rim / fill / outline | ×1.6 / 0.25 / — | **×1.0 / dark tint 0.42 / 0.75** | Crisp, not glowing. The rim never drops below 0.8 alpha. |
| `fx.light` scale | 1 | **0.3** | Or remove for small effects. |
| Grade vignette | 0.35 | **0.2** | The low-HP edge darkens and tints instead of adding. |

**Verification in the sim harness** (hidden browser pane, per the memory notes):

1. **Bloom audit.** Temporarily set `engine.bloom.strength = 3`. Walk each act and screenshot. Nothing on bare ground, trees or water should glow except water glints. Fix any offender's albedo or emissive, not the threshold.
2. **Telegraph test.** Spawn a bomber (circle) and a magmaRam (line) on Act II barrens, and spawn the lava hazard. The rim, dark band and fill progress must be visible in a 50%-scaled screenshot.
3. **Bullet test.** Run 30 Spitter bullets over grass, barrens and water while the player casts fireball and meteor. Bullets must be distinguishable from player fire in a greyscale screenshot; this is the value check.
4. **Heat test.** Trigger a chain-reaction wave with more than 100 bursts. Average frame luminance should not exceed about 0.8 (no whiteout), and the player ring must stay visible.
5. **Perf.** Draw calls should rise only by the bullet count plus one (gem blobs). Frame time should be unchanged within noise.

---

## Sources

- Riot Games, *LoL VFX Style Guide* (dev post and PDF): https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/
- Riot Games, *Clarity in League*: https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/
- VFX Apprentice, *10 design tips from the LoL VFX style guide*: https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips
- RealtimeVFX, *Anatomy of a League of Legends missile, part 2*: https://realtimevfx.com/t/anatomy-of-a-league-of-legends-missile-part-2-what-are-we-communicating-with-our-vfx/13062
- Notes on Blizzard GDC 2013, *Technical Artist Bootcamp: The VFX of Diablo* (BlendAdd): https://3dreference.notion.site/VFX-In-Diablo-29806517bc9f4330be3c0ece360eace0
- RealtimeVFX, *red over bright sand; premultiplied alpha and dark backing*: https://realtimevfx.com/t/how-to-turn-off-the-influence-of-light-on-vfx/28358
- gamedev.net, *additive fails except over dark backgrounds*: https://gamedev.net/blogs/entry/2167817-actually-programming
- Valve Developer Community, `$additive`: https://developer.valvesoftware.com/wiki/$additive
- D. Trebilco, *PreMulAlpha* (additive and alpha in one blend state): https://github.com/dtrebilco/PreMulAlpha
- Wicked Engine, *Which blend state for me?*: https://wickedengine.net/2017/10/which-blend-state-for-me
- Game Developer, *Bright, slow and deadly* (enemy projectile design): https://www.gamedeveloper.com/design/bright-slow-and-deadly
- Sleigh Invaders devlog, *Outlines update*: https://loubagel.itch.io/sleigh-invaders/devlog/858177/outlines-update
- FFXIV forum, *red enemy indicator changed to beige*: https://forum.square-enix.com/ffxiv/threads/147086-Red-enemy-skill-indicator-changed-to-beige
- ESO forum, *telegraph colour options*: https://forums.elderscrollsonline.com/en/discussion/comment/3951447/
- three.js r170 source: `UnrealBloomPass.js` https://github.com/mrdoob/three.js/blob/r170/examples/jsm/postprocessing/UnrealBloomPass.js, `LuminosityHighPassShader.js` https://github.com/mrdoob/three.js/blob/r170/examples/jsm/shaders/LuminosityHighPassShader.js, `EffectComposer.js` https://github.com/mrdoob/three.js/blob/r170/examples/jsm/postprocessing/EffectComposer.js, `WebGLState.js` https://github.com/mrdoob/three.js/blob/r170/src/renderers/webgl/WebGLState.js, `tonemapping_pars_fragment.glsl.js` https://github.com/mrdoob/three.js/blob/r170/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js
- three.js docs, UnrealBloomPass: https://threejs.org/docs/pages/UnrealBloomPass.html
- three.js example, selective bloom: https://threejs.org/examples/webgl_postprocessing_unreal_bloom_selective.html
- three.js forum, *UnrealBloomPass threshold*: https://discourse.threejs.org/t/what-does-the-threshold-in-unrealbloompass-means-and-how-to-make-a-color-just-pass-that-threshold-a-bit-how-to-calculate-the-threshold-for-a-color/60984
- three.js forum, *tone-mapping guidance (ACES hue shift)*: https://discourse.threejs.org/t/pmndrs-post-processing-tone-mapping-guidance/59374/2
- three.js forum, *AgX less saturated than ACES*: https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609
- MDN, `paint-order`: https://developer.mozilla.org/docs/Web/CSS/paint-order and caniuse: https://caniuse.com/mdn-css_properties_paint-order

*The tone-mapped colour values in §1.3 and §3.5 were computed offline from r170's ACES and Neutral formulas. They assume an sRGB albedo under sun 3 / hemisphere 1.2 lighting and ignore shadows and texture detail, so treat them as relative comparisons, not final pixels.*
