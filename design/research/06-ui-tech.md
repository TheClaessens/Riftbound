# 06 — UI tech: ornate frames, SVG icons, meters, crisp scaling, HUD performance

**Scope.** This document covers the rendering techniques for the UI redesign: the HUD (`src/ui/hud.js`, `hud-fx.js`), the level-up, relic and pause modals (`src/ui/ui.js`), the menus (`src/ui/menus.js`), `css/ui.css` and `css/menus.css`. The art direction is still being decided in parallel (forged metal/stone with rift crystal, or illuminated manuscript). So everything below runs on **tokens**: one set of CSS custom properties for metal, plate, ink and accents, which either direction can fill. Constraints: three.js r170, plain ES modules, no build step, no raster images, Google Fonts through `<link>`, and modern Chromium as the primary target. Firefox and Safari caveats are noted where they apply.

**How the HUD works today.** `HUD.update(dt)` runs every frame and writes through the memoising setters in `hud-util.js`, which only touch the DOM when a value changes. The weak spots are in what gets written:

- HP, XP, boss, act segments, trait meters and buff bars all write **`width`** with a `width` transition. That forces layout and paint on every change (`ui.css` lines 407, 519, 808, 912, 923, 968).
- The chain counter writes **`fontSize`**, which forces layout and text reshaping.
- Low HP animates `border-color` and `box-shadow` (`hud-lowpulse`), which repaints every frame.
- Several infinite animations repaint every frame: `hud-glow` animates `filter: brightness`, `ui-card-shimmer` and `tut-glow` animate `box-shadow`, and `hud-rainbow` animates `color`.
- The shrine marker is a `will-change` layer with a stack of four `drop-shadow()` filters, and its contents (the `--p` conic) change every frame.
- `restartAnim()` forces a synchronous reflow (`void el.offsetWidth`) on every call.

None of these is fatal alone. Together they keep the main thread doing layout and paint work next to a 320-enemy WebGL frame. The redesign fixes all of them by construction.

---

## 0. TL;DR

1. **Frames: use CSS for the body and SVG masks for the ornaments.** Draw the plate and rim with plain CSS: a transparent border over a gradient border-box, an `outline` for the snapped hairline keyline, and `corner-shape: bevel` for chamfers and hexes with a `clip-path` fallback. Draw the corner and edge ornaments with **one pseudo-element carrying four `mask` layers** (SVG data URIs generated once at boot). Its `background` is the metal gradient, so recolouring stays 100% CSS-var driven. The data URI holds only geometry, never colour, which removes the "data URIs can't read vars" problem. A second pseudo-element with the same mask, offset 1px in ink, gives the emboss without any filter.
2. **Do not use `border-image`** for anything ornate. Its colours are baked into the image, `round`/`repeat` tiles seam at fractional DPR, it ignores `border-radius`, and `mask-border` doesn't exist in Firefox.
3. **Icons: one injected `<symbol>` sprite + `<svg class="ico"><use href="#i-id"/></svg>`.** Use `currentColor` for the main tone and `var(--el)` for the accent, both inherited into the `<use>` shadow tree. Bake the engraved or raised look into the symbol as **layered offset copies of the silhouette**, not SVG filters. Author on a **32-unit grid** with filled shapes and features of at least 1.5 units. Add a `iconMask(id)` data-URI variant for CSS pseudo-element glyphs.
4. **Meters: `transform: scaleX()` on a `will-change: transform` fill, never `width`.** Drive a trailing "ghost" chip from JS (hold 0.4 s, then exponential catch-up, frozen while paused). Draw the shield as `translateX(hp%) scaleX(sh)`. Ticks are a repeating gradient overlay. Low HP is an **opacity** pulse on a pre-drawn glow layer. Hit flashes use WAAPI instead of `restartAnim`.
5. **Radial cooldowns:** a `conic-gradient` with a **0.7° feather** (hard conic stops alias, and no single offset fixes it), plus a composited "clock hand" line that hides the leading edge. The ready flash is a WAAPI ring scale and fade.
6. **Numbers:** `font-variant-numeric: tabular-nums` (Inter has `tnum`; Cinzel does not, so render digits in Inter) plus `-webkit-text-stroke` at 2× width with **`paint-order: stroke fill`** (Chrome 123+, Firefox 60+, Safari 11+). That is one pass, crisp, and it hides the variable-font contour overlaps. Avoid 8-way `text-shadow` outlines.
7. **Scaling: one root unit.** `html { font-size: clamp(8px, min(100vw/128, 100vh/72), 22px) }` makes 1rem = 10 / 15 / 20 px at 720p / 1080p / 1440p. JS **snaps 1rem to whole device pixels**. Wrap pixel-critical sizes in `round(x, 1px)`. Never `transform: scale()` the UI (it blurs text). `zoom` is a crisp but coordinate-confusing alternative.
8. **Hairlines: use `border`/`outline`, never `box-shadow` spread.** Borders and outlines snap to whole device pixels at 1.25 and 1.5 DPR; box-shadows don't, so they render 1.25 px soft.
9. **Performance rules:** animate only `transform` and `opacity`. No `backdrop-filter` or `mix-blend-mode` over the live canvas. No filters on anything that changes per frame. `contain: layout style` (plus `size` where it's fixed) on HUD clusters. `will-change` only on the moving fills and hands. Use `content-visibility: hidden` for closed menus.
10. **Flourishes:** sheen sweep is a transformed pseudo-gradient. Rune pulse animates the opacity of a radial glow. Crystal glints are a clip-path star with scale, rotate and opacity. Card reveal is a 3D flip/rise ending at `transform: none`. Ink-bleed is an animated `mask-position` plus `filter: blur` (filter animations get the GPU path only while running). All of these are cheap.
11. **Fonts:** keep `preconnect`. Gate the title wordmark on `document.fonts.load()` with a 1.5 s timeout (fade in, no FOUT). Request the UI text with `display=swap`. Use `display=block` only for a dedicated wordmark request.

---

## 1. Ornamental frames without images

### 1.1 Options compared

| | (a) `border-image` + SVG data-URI 9-slice | (b) layered CSS (gradient border, outline, clip-path / corner-shape, pseudo corners) | (c) absolutely-positioned inline-SVG corner pieces | (d) CSS `mask-image` with SVG geometry |
|---|---|---|---|---|
| Crisp at DPR 1 / 1.25 / 1.5 / 2 | Corners OK (vector re-rasterised). Edges with `repeat`/`round` show hairline seams between tiles at fractional DPR. `stretch` smears ornate edges. | Yes. Borders and outlines **snap to device pixels**; gradients and clip edges are analytic | Yes (vector, AA'd per paint) | Yes (SVG masks rasterised at device scale) |
| Arbitrary sizes | Only via 9-slice rules; slice numbers are SVG user units | Fully fluid | Corners fixed-size, edges must be CSS | Fully fluid: corners fixed, body CSS |
| Recolour via CSS vars | **No.** The data URI is an isolated document, so you must regenerate the URI per colour or theme | Yes | Yes (`currentColor` / vars inherit into `<use>`) | **Yes.** The mask is geometry only; colour comes from `background`, which can be a var-driven metal *gradient* |
| DOM cost | 0 extra nodes | 0–2 pseudo-elements | **4–8 extra nodes per panel** | 2 pseudo-elements |
| Perf | Cheap (cached image) | Cheap. Big blurred `box-shadow` is the only real cost | Cheap but more nodes and style work | Cheap when static; a masked layer that repaints costs slightly more than unmasked |
| Gotchas | Ignores `border-radius`. `mask-border` (the recolourable variant) is not supported in Firefox at all | `clip-path` **clips the element's own box-shadow and outline**. Chamfer borders need the inner-layer trick unless `corner-shape` is available | Must align four pieces by hand; scales poorly with `--u` unless sizes are rounded | Ornaments overhanging the box mean **no `overflow: hidden` and no `contain: paint`** on the frame |

**Recommendation: (b) + (d).** The body, rim and keylines are plain CSS. The ornaments are one `::after` with four (or six) mask layers filled with the metal gradient, plus a `::before` with the same mask in ink, offset 1px down as the engraving shadow. Reserve **(c) inline SVG** for the few hero pieces that need several colours or internal animation: the modal crest, the title wordmark frame and the boss-bar skull. Those use the icon sprite (§2), so they cost one `<svg><use>` each.

Why (d) solves the colour problem: an SVG data URI used as an image is a separate document and cannot see the page's custom properties. Used as a **mask**, only its alpha matters, so the colour lives in the pseudo-element's `background: var(--metal-grad)`. That gives a real gradient-gilded ornament, retintable per act or element with one var. The URIs are generated once by JS (`installFrames()`, appendix B2) and stored as custom properties, so they are not hand-escaped strings in CSS.

### 1.2 Crispness rules for frames

- **Hairlines must be `border` or `outline`.** Per the CSS Values 4 snapping rule, border, outline and column-rule widths snap to whole device pixels before layout: 1px at 1.5 DPR computes to 0.667px and draws exactly one device pixel. `box-shadow` does **not** snap. A 5px inset shadow at 1.5 DPR renders 7.5 device px with a half-transparent last row ([Brosset, "Invasion of the border snappers"](https://patrickbrosset.com/articles/2024-06-21-invasion-of-the-border-snappers/)). So the bright gold inner hairline is an `outline` with a negative `outline-offset`. `box-shadow` is only for dark outer keylines (softness invisible on dark) and blurred glows.
- **Round the ornament box sizes** with `round(<rem>, 1px)` (Chrome 125, Firefox 118, Safari 15.4; [MDN round()](https://developer.mozilla.org/docs/Web/CSS/round)). With 1rem snapped to device pixels (§4), the ornaments land on the pixel grid at standard resolutions.
- **Chamfers:** `corner-shape: bevel` (Chrome 139+) makes the **border, background, outline and box-shadow all follow the cut**, so the rim keeps a constant width along the diagonal ([Smashing, Mar 2026](https://www.smashingmagazine.com/2026/03/beyond-border-radius-css-corner-shape-property-ui/)). `border-radius: 50% / 25%` with `corner-shape: bevel` gives a pointy-top **hexagon**, and `50%` gives a diamond. Firefox and Safari don't support it yet ([squircle.js.org](https://squircle.js.org/blog/squircles-in-css)), so wrap it in `@supports`. The fallback is `clip-path: polygon()` on an outer metal layer plus an inner plate layer inset by the border width. Ornaments sitting on the corners make a square fallback look intentional anyway.
- **No `border-image` with `round`/`repeat` for anything that needs to be seamless.**

### 1.3 Snippets

Full CSS is in **Appendix B**. It covers a framed panel `.fr`, the modal `.fr--modal`, the chamfered and hex skill slot `.slot`, the bar with end caps `.bar`, and the tooltip `.tip`. The JS that builds the ornament masks (`installFrames`) is in B2.

---

## 2. Icon system

### 2.1 Options compared

| | `<symbol>` sprite + `<use href="#i-x">` | Per-instance inline SVG strings | CSS mask icons (`mask: url(data:…)` + `background`) |
|---|---|---|---|
| Markup per instance | ~70 bytes | Full path data (0.5–2 KB) every time: codex lists, cards and the pause pane repeat it | 0 nodes (works on pseudo-elements) |
| Colours | `currentColor` + any number of inherited custom properties (two-tone, three-tone) | Anything, including per-part CSS selectors | **One** colour per layer (two with two stacked masks) |
| Style internals from outside | No: the `<use>` clone is a closed shadow tree. Inherited props (color, vars, fill) pass through ([CSS-Tricks](https://css-tricks.com/?p=186538), [FWeinb two-tone](https://codepen.io/FWeinb/post/quick-tip-svg-use-style-two-colors), [fvsch](https://fvsch.com/svg-css-vars)) | Yes | n/a |
| Animate parts | No (only via inherited vars) | Yes | No |
| Crispness | Vector | Vector | Vector raster at device scale |
| Perf | Clone per `<use>`. Never mutate a `<symbol>` after mount, because every instance re-clones | Heavier DOM and parse | Cheapest |

**Recommendation: the sprite.** Inject it once at boot (≈70 symbols, ~40–70 KB of string in a JS module) and use `icon(id, cls)` everywhere `def.icon` emoji are used today. Also generate **`iconMask(id)`** data URIs for decorative glyphs in CSS pseudo-elements (bullets, separators, tooltip tag glyphs). Use per-instance inline SVG only for the one or two hero pieces with internally animated parts.

### 2.2 Two-tone and three-tone colour

Each shape in a symbol gets a **tone token** instead of a colour. The builder rewrites `fill="@b"` into an inline `style` with a `var()`. Inline styles are copied into the clone, and the `var()` then resolves against the `<use>` host's inherited custom properties:

| token | resolves to | use |
|---|---|---|
| `@a` | `var(--ico-a, currentColor)` | main body |
| `@b` | `var(--ico-b, var(--el, currentColor))` | accent: element colour from `--el`, which slots already set |
| `@sh` | `var(--ico-sh, rgb(0 0 0 / .45))` | shade facets |
| `@hi` | `var(--ico-hi, rgb(255 255 255 / .5))` | highlight facets |
| `@ink` | `var(--ico-ink, #0d0805)` | outline / engraving |

Notes:

- Don't put `var()` in presentation attributes (`fill="var(--x)"`), because those aren't parsed as CSS. Use `style`, which is what the builder emits.
- **Gradients don't recolour per instance.** A `<linearGradient>` lives once in the sprite and resolves its `stop-color` in the sprite's context, not per `<use>`. Build the faceted metal and crystal look from flat tones plus `@sh` and `@hi` facet shapes instead.

### 2.3 Engraved / embossed look: layered paths, not filters

CSS and SVG filters on HTML content render on Chromium's **software (CPU) path** unless the element is already composited, and they re-run whenever the element repaints. Animated filters get the GPU only for the duration of the animation ([Chromium filter-effects design doc](https://www.chromium.org/developers/design-documents/image-filters/)). Thirty filtered icons in a HUD that repaints parts of itself every frame is wasted CPU.

Instead, the builder **bakes relief into the symbol**:

- *raised*: an ink copy of the silhouette at `translate(0, 1)` (opacity .75) under the body, and a pale copy at `translate(0, -0.75)` (opacity .3).
- *engraved*: the same two copies with offsets swapped.
- *halo*: an ink-stroked silhouette (`stroke-width` 2.5 units, round joins) for icons that float over the world, such as shrine markers, pickups and off-screen arrows.

This costs a few extra path draws and zero filters. A static CSS `filter: drop-shadow()` on large menu art is fine. Just never apply it to per-frame HUD elements or their ancestors.

### 2.4 Crisp at 20–64 px

- **Grid:** author on `viewBox="0 0 32 32"`. With the snapped root unit (§4), the primary HUD icon size `3.2rem` is **32 / 48 / 64 px at 720p / 1080p / 1440p**, so the scale is 1 / 1.5 / 2. Put key horizontal and vertical edges on **even units** so they land on whole pixels at all three (2 × 1.5 = 3 px).
- **Shapes over strokes.** Fantasy icons are silhouettes, and filled shapes survive off-grid scales well while thin strokes go mushy. The minimum feature is **1.5 units** (≈1 px at a 20 px render). Strokes are at least 2 units, with `stroke-linecap/linejoin: round`. Use `vector-effect: non-scaling-stroke` only for deliberate fixed-px outlines.
- **No `shape-rendering: crispEdges`** on icons. It turns off antialiasing and makes curves jaggy; it's only for axis-aligned rect art. Leave `auto` or `geometricPrecision`.
- **Size the box in whole pixels:** `width: round(3.2rem, 1px)`. Under 20 px, switch to a simplified symbol variant (`i-fire-s`) rather than shrinking detail.
- `overflow: visible` on `.ico` so halo and relief can spill one unit outside the viewBox.

API and code are in **Appendix C** (`src/ui/icons.js`).

---

## 3. Meters

### 3.1 Fill without layout thrash

`width` changes run layout and paint. `transform: scaleX()` on an element with `will-change: transform` is a **compositor-only** update: no layout, no paint ([web.dev, compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). Keep `transform-origin: left`. Without `will-change`, a transform change still skips layout but repaints, so promote just the ~10 fills, not everything (layers cost GPU memory, per the same article).

**scaleX stretches content.** Give fills only *vertical* gradients (gloss, shade), which scale invisibly. Horizontal texture and ticks live on a separate, unscaled overlay. A bar that must show unstretched texture can use `clip-path: inset(0 calc(100% - var(--p)) 0 0)` instead. That costs one paint of a small box per change, which is cheap at bar sizes but not free.

Quantise the written value (1/2048 steps) so the memo cache in `setCss` actually stops redundant writes.

### 3.2 Ghost bar (trailing damage chip)

Drive the ghost from **JS in `update(dt)`**, not a CSS `transition-delay`. CSS transitions keep running during pause and hit-stop, and they can't distinguish heal from damage.

On a drop, the ghost holds at the old value for 0.4 s, then catches up exponentially (`g = v + (g - v)·e^(−7·dt)`). On a heal, it snaps up. Colour it pale amber over a dark track so it reads as "lost". Optional heal preview: a second green ghost *ahead* of the fill.

### 3.3 Shield overlay

Use one element over the whole track: `transform: translateX(hp·100%) scaleX(shield)` with `transform-origin: left`. The scale applies first, then the translate, so the shield occupies `[hp, hp + sh]` of the track. Give it a crystal-blue fill with a diagonal-hatch overlay (`repeating-linear-gradient(135deg, …)` on an unscaled sibling, masked to the same span), or a plain light fill with a bright top edge.

### 3.4 Segmented ticks

Use an unscaled overlay with `background: linear-gradient(90deg, transparent calc(100% - 2px), rgb(0 0 0 / .45) 0) 0 0 / calc(100% / var(--n)) 100% repeat-x`, where `--n = maxHp / 100` (or phase thresholds on the boss bar). Ticks at fractional positions get one AA'd column. Making them 2px wide and dark-on-red hides it. The boss bar's phase threshold gets a real element (a gem marker) at `left: 50%`.

### 3.5 Low-HP pulse and hit flash

- **Pulse:** a `.bar-glow` child carries a **static** red `box-shadow`/inner glow. Only its `opacity` animates (`alternate infinite`), which is compositor work, replacing today's `border-color`/`box-shadow` keyframes.
- **Hit flash:** `el.animate([{opacity: .9}, {opacity: 0}], 180)` on a `.bar-flash` child (WAAPI, compositor). This avoids `restartAnim()`'s forced reflow on every hit. Rate-limit it to one flash per ~90 ms.

### 3.6 Liquid orb / vial

- A circle with `border-radius: 50%; overflow: clip; contain: strict`.
- The liquid is a full-size child moved with `translateY((1−p)·100%)` and `will-change: transform`.
- Two wave strips (an SVG wave as a **mask**, coloured by `background: var(--liq-hi)`) are 200% wide and loop with `translateX(-50%)`. That is an infinite compositor animation with zero main-thread cost.
- A static glass highlight sits on top (radial gradients).
- A **vial** is the same build with the container masked by a vial-silhouette SVG instead of the circle.
- Code is in Appendix D3.

### 3.7 Radial cooldowns

Hard-stop `conic-gradient` edges **alias**, and a fixed stop gap can't fix it because the angular gap maps to a different linear width at each radius (Tab Atkins, [CSSWG thread](https://lists.w3.org/Archives/Public/public-css-archive/2023Jul/0188.html)). Recipe:

1. Use a conic with a **0.7° feather** (`dark calc(var(--cd) - .7deg), transparent var(--cd)`). That is ≈0.5 px at the rim of a 48 px slot and fine everywhere visible.
2. Add a **clock-hand** element (1.5–2 px, rift-bright, `rotate: var(--cd)`, `will-change: transform`) along the edge. It hides residual aliasing and reads as "sweeping".
3. Register `@property --cd { syntax: '<angle>' }` so the gradient can also be transitioned when needed ([web.dev @property baseline](https://web.dev/blog/at-property-baseline): Chrome 85, Firefox 128, Safari 16.4).
4. Quantise to 0.5° steps.
5. For a **crisp ring** cooldown (the shrine progress ring), use an SVG `<circle pathLength="100">` with `stroke-dasharray`. That is analytic AA, unlike conic plus a radial mask.

**Ready flash:** detect the `cd > 0 → cd ≤ 0` edge in JS, then WAAPI a ring scaling 0.85 → 1.25 while fading 1 → 0 in the element colour, plus a sheen sweep (§6). Keep the last cooldown digit visible until the flash.

### 3.8 Numeric legibility

- **`font-variant-numeric: tabular-nums lining-nums`** stops HP and timers from jittering. Inter has `tnum`; **Cinzel has no tabular figures** (verify per font with the width check in D4), so render digits in Inter even inside Cinzel labels. Give the number box a `min-width` in `ch` too, so it doesn't relayout neighbours.
- **Outline:** `-webkit-text-stroke: 2w var(--ink); paint-order: stroke fill;` gives an outside-only stroke of width *w*. It also hides the internal contour overlaps that Google's **variable** font files show when stroked, because the fill covers them. Support for `paint-order` on HTML text: Chrome 123+, Firefox 60+, Safari 11+ ([caniuse](https://caniuse.com/mdn-css_properties_paint-order), [MDN](https://developer.mozilla.org/docs/Web/CSS/paint-order)).
- **Avoid 8-direction `text-shadow` outlines.** That is 8 glyph passes, with soft diagonal gaps at small sizes. Add *one* soft `text-shadow: 0 .1rem .3rem rgb(0 0 0 / .6)` for separation from bright ground.
- Don't combine `background-clip: text` with `text-shadow`: the shadow paints over the clipped gradient. Put a static `filter: drop-shadow` on a wrapper instead (menus only).
- Minimum sizes: Cinzel ≥ 1.2rem (it mushes below 12 px); Inter for everything smaller.

---

## 4. Crispness & scaling (1280×720 → 2560×1440)

### 4.1 Options compared

| | raw `clamp()`/`vmin` per property | **root unit (rem or `--u`)** | `transform: scale()` on `#ui` | `zoom` on `#ui` |
|---|---|---|---|---|
| Text crispness | Crisp (re-laid out) | Crisp | **Blurry.** Text is rasterised then resampled, worse on composited layers ([WebKit bug 120583](https://bugs.webkit.org/show_bug.cgi?id=120583)) | Crisp (re-layout at new size) |
| Authoring | Verbose, inconsistent | One unit everywhere. Menus already use `--menu-u` with the same formula | px | px (current HUD CSS keeps working) |
| JS coordinates | Normal | Normal | Must invert the scale | Must divide by zoom for world-anchored markers; DOM-rect semantics changed with zoom standardisation |
| Support | All | All | All | Baseline 2024 (Firefox 126+) ([MDN zoom](https://developer.mozilla.org/en-US/docs/Web/CSS/zoom)) |

**Recommendation: the root unit, set as the root font-size so everything is `rem`.** Use `html { font-size: clamp(8px, min(100vw / 128, 100vh / 72), 22px) }` (1rem = 10 / 15 / 20 px at 720p / 1080p / 1440p). Alias it for the existing menus with `--menu-u: 1rem`. Then a tiny JS (`applyUiScale`, Appendix A2) **snaps 1rem to whole device pixels** on resize and DPR change. Integer-rem sizes, and the 3.2rem icon box, then land on device pixels at the standard resolutions. Pixel-critical boxes still use `round(x, 1px)`.

### 4.2 Avoiding half-pixel blur

- **Static elements must sit on whole device pixels.** A composited layer at a fractional offset is resampled, so its text goes soft ([WebKit bug 120583](https://bugs.webkit.org/show_bug.cgi?id=120583), [Chromium raster-translation CL](https://codereview.chromium.org/1848613002)). Round JS-driven translates of anything that comes to rest: `snap = x => Math.round(x*dpr)/dpr`. The shrine marker and anchored tooltips should snap. Moving damage numbers don't need to.
- **`will-change: transform` is a layer request, not a speed-up flag.** Text in such a layer is rasterised once at the layer's scale. If you scale it up, it stays blurry until the layer re-rasters. Rules: put it only on things that animate continuously (fills, hands, waves), end every pop animation at `transform: none`, and never leave a resting `scale() ≠ 1` on text.
- **Text in the overlay is grayscale-AA anyway.** Text on non-opaque composited layers can't use LCD subpixel AA. So don't try `-webkit-font-smoothing` (it only works on macOS) or `text-rendering: geometricPrecision` (it disables hinting on some platforms). Leave `text-rendering: auto` (Chrome already kerns large text) and `font-optical-sizing: auto`.
- `image-rendering` doesn't matter: there are no rasters, and SVG ignores it. Don't set `pixelated` on the WebGL canvas.

### 4.3 Fonts: preload and FOUT

- Keep the two `preconnect`s. **Don't `<link rel=preload>` gstatic woff2 URLs.** They're UA-specific and versioned, so a hard-coded URL will silently double-download. Put the Google Fonts `<link>` first in `<head>`.
- Request with variable axis ranges (`wght@400..800`), which is one file per family ([Google Fonts CSS2 API](https://developers.google.com/fonts/docs/css2)). Use `display=swap` for UI text.
- **Title:** gate the wordmark and title menu on `document.fonts.load()` for the exact faces, raced against a 1.5 s timeout, then fade them in. The title never shows a fallback face, and a slow network can't hang it (Appendix A3).
- `display=block` and `text=RIFTBOUND` (Google can subset to the glyphs you list, up to 90% smaller) are only safe in a **separate request whose family and weight are used nowhere else**. A `text=` face has no `unicode-range`, so it would shadow the full face for other text.
- Background reading: [web.dev, Optimize web fonts](https://web.dev/learn/performance/optimize-web-fonts).

---

## 5. Performance: HUD over a 60 fps WebGL game

**How it works.** The canvas is its own compositor layer. The `#ui` overlay is composited above it, usually as one or a few layers. A DOM change inside the overlay costs:

- **style**, for the changed element and its subtree;
- **layout**, if geometry or text changed;
- **paint and raster** of the invalidated rectangle, including everything painted under it in that layer;
- **composite**.

So expensive pixels under a frequently changing rect are re-rasterised every time something in that rect changes.

### Do

- Animate and update only **`transform` and `opacity`** for anything per-frame ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)).
- Put **`will-change: transform`** on fills, ghost, shield, cooldown hands, orb liquid and waves. That is about 15–20 small layers, which is fine. Remove `will-change` from things that only animate once (cards): let the animation promote them temporarily.
- Use **`contain: layout style`** on each HUD cluster (top bar, core bars, skill bar, relic tray) so text changes don't relayout the HUD. Add `size` (`contain: strict`) on fixed-size boxes such as slots, orbs and bar tracks, but **not** on anything with overhanging ornaments or tooltips: paint containment clips descendants, including pseudo-elements ([MDN containment](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using)).
- Use **`content-visibility: hidden`** (not `display: none`) for big closed screens such as the codex and pause pane. Rendering is skipped but the layout cache is kept, so reopening is fast.
- Keep **static heavy decoration** (big blurred shadows, ornaments, gradients) on elements that never change, and keep per-frame text in small, separate, contained boxes.
- Quantise numbers before writing (0.5° angles, 1/2048 scales, whole seconds for timers). Write once per frame per element, as `hud-util` already does.
- Use **WAAPI** (`el.animate`) for one-shot flashes and pops instead of class re-add plus forced reflow.
- Measure with DevTools Rendering → *Paint flashing* and *Layer borders*, and check the Performance panel for "Layout" and "Paint" under `HUD.update`.

### Don't

- No **`width`, `left`, `height`, `font-size` or `top` writes per frame**, and no transitions on them. Fix this in `_updateHP`, `_updateAct`, `_updateBoss`, `_updateTrait`, `_updateBuffs` and `_updateChain`.
- No **`backdrop-filter`** over the canvas during runs. It re-samples and blurs the always-changing canvas every frame, proportional to area × radius. It's acceptable on a paused modal with a small radius, or replace it with an opaque vignette gradient.
- No **`mix-blend-mode`** on HUD elements over the canvas. It forces a separate render surface that blends with the canvas every frame. It's fine on static menus.
- No **`filter` (CSS or SVG `url(#…)`)** on anything that changes per frame or contains changing children. That includes the shrine marker's four stacked `drop-shadow`s on a changing `--p` conic: move the glow into a static pre-blurred sibling.
- No animated `box-shadow`, `border-color`, `filter: brightness`, `background-position` or `color` loops in the HUD. Today's `hud-lowpulse`, `hud-glow`, `ui-card-shimmer`, `tut-glow` and `hud-rainbow` all fall in this group. Convert each to an opacity-animated pre-drawn layer. `hud-rainbow` can be a `hue-rotate` on a tiny element, or 3–4 stacked coloured copies cross-fading in opacity.
- No `will-change` on `*` or on static panels.
- No `restartAnim()` in hot paths (forced reflow).
- No SVG `<symbol>` mutation after mount.
- No `@property`-animated custom properties feeding gradients on many HUD elements. Those animate on the main thread with a repaint every frame; one is fine on a modal.

---

## 6. Animated flourishes in pure CSS

All of these cost compositor work only, except where noted. Code is in Appendix E.

| Flourish | Technique | Cost |
|---|---|---|
| **Gilding sheen sweep** | `::after` with a 100° highlight gradient, 220% wide, `translateX(-60% → 60%)`, parent `overflow: clip` (follows `corner-shape`). Fires on hover, new item or skill ready, plus an idle variant that sweeps 15% of a 6 s cycle with `--i` stagger. | compositor |
| **Gilded text shimmer** (title only) | `background-clip: text` with a 250% metal gradient and `background-position` animation | **paint per frame**, so title and menus only |
| **Rune glow pulse** | `::before` radial glow at `color-mix(var(--el) 70%, transparent)`, animate `opacity` + `scale` | compositor |
| **Crystal facet glints** | 4-point star via `clip-path: polygon()`, keyframes `scale(.2 → 1 → .3)` + `rotate` + `opacity` in the last 30% of a 3.2 s cycle, `animation-delay: calc(var(--d) * 1s)` | compositor |
| **Card reveal** | `perspective` on the row, card `rotateY(180° → 0) translateY(3rem → 0)` with `backface-visibility: hidden` front and back faces, ending at `transform: none` (crisp text afterwards), stagger `--i × 90 ms` | compositor during the animation |
| **Ink-bleed text reveal** | `mask-image: linear-gradient(90deg, #000 40%, transparent 60%)`, `mask-size: 250%`, animate `mask-position` 100% → 0 plus `filter: blur(.25em) → none`. Remove the class on `animationend` so the mask doesn't persist. Uneven stops fake a ragged edge. | mask repaint per frame on one element; blur on the GPU while animating |

---

# Appendix: drop-in code

Everything targets modern Chromium (≥ 125; `corner-shape` needs 139 and has fallbacks). Firefox and Safari notes are inline. All sizes are in `rem` under the root-unit system of §4.

## A. Tokens, scale, fonts

### A1. `css/tokens.css` (load first)

```css
/* Root unit: 1rem = 10px @1280x720, 15px @1920x1080, 20px @2560x1440.
   applyUiScale() (A2) overwrites this with a device-pixel-snapped value. */
html {
  font-size: clamp(8px, min(100vw / 128, 100vh / 72), 22px);
}

:root {
  --menu-u: 1rem;                 /* legacy alias for css/menus.css */
  --dpx: 1px;                     /* one device pixel; set by applyUiScale() */

  /* palette tokens: the art-direction pass fills these */
  --ink: #0d0805;
  --metal-hi: #fff0c2;
  --metal: #d6a24a;
  --metal-lo: #8a5a1c;
  --metal-dk: #3a2108;
  --rift: #9a74ff;
  --rift-hi: #e6dbff;
  --plate-a: #2b1e15;
  --plate-b: #140d08;
  --text: #f6ead0;
  --text-dim: #cdb98f;

  --metal-grad: linear-gradient(180deg,
      var(--metal-hi) 0%, var(--metal) 34%, var(--metal-lo) 58%,
      var(--metal) 80%, var(--metal-dk) 100%);
  --plate: linear-gradient(180deg, var(--plate-a), var(--plate-b));
}

#ui {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 1.4rem;
  color: var(--text);
  text-rendering: auto;
}
```

### A2. `src/ui/scale.js`

```js
// Keeps 1rem on whole device pixels and exposes --dpx (one device pixel) to CSS.
let mq = null;

export function applyUiScale() {
  const root = document.documentElement;
  const dpr = window.devicePixelRatio || 1;
  const raw = Math.min(window.innerWidth / 128, window.innerHeight / 72);
  const u = Math.min(22, Math.max(8, raw));
  root.style.fontSize = `${Math.round(u * dpr) / dpr}px`;
  root.style.setProperty('--dpx', `${1 / dpr}px`);
}

export function installUiScale() {
  const onDpr = () => {
    applyUiScale();
    mq?.removeEventListener('change', onDpr);
    mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', onDpr);
  };
  window.addEventListener('resize', applyUiScale);
  onDpr();
}

// Snap a CSS-px coordinate to the device-pixel grid (use for resting translates).
export const snapPx = (x) => {
  const d = window.devicePixelRatio || 1;
  return Math.round(x * d) / d;
};
```

### A3. Fonts: `index.html` head and title gate

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500..900&family=Cinzel+Decorative:wght@700;900&family=Inter:wght@400..800&display=swap">
```

```js
// src/ui/fonts.js — call before showing the title screen.
export async function fontsReady(timeoutMs = 1500) {
  const faces = ['900 1em "Cinzel Decorative"', '700 1em "Cinzel"', '600 1em "Inter"'];
  try {
    await Promise.race([
      Promise.all(faces.map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch { /* fall through: never block the title on a font error */ }
  document.documentElement.classList.add('fonts-ready');
}
```

```css
.title-wordmark, .title-menu { opacity: 0; transition: opacity .45s ease; }
.fonts-ready .title-wordmark, .fonts-ready .title-menu { opacity: 1; }
```

## B. Frames

### B1. `css/frames.css`

```css
/* ------------------------------------------------------------------ B1.1 panel */
.fr {
  --bw: round(.3rem, 1px);            /* metal rim */
  --os: round(2.6rem, 1px);           /* corner ornament box */
  --oo: round(.7rem, 1px);            /* ornament overhang outside the border */
  --rim: var(--metal-grad);
  position: relative;
  isolation: isolate;                 /* ::before z-index:-1 stays inside the panel */
  padding: 1.2rem 1.6rem;
  border: var(--bw) solid transparent;
  background: var(--plate) padding-box, var(--rim) border-box;
  /* inner gilt hairline: outline snaps to device pixels (box-shadow would not) */
  outline: 1px solid rgb(255 236 190 / .3);
  outline-offset: calc(-1 * var(--bw) - 2px);
  box-shadow:
    0 0 0 1px var(--ink),                         /* outer dark keyline */
    0 .4rem 1.2rem rgb(0 0 0 / .45),              /* drop */
    inset 0 .2rem .8rem rgb(0 0 0 / .5);          /* plate depth */
  color: var(--text);
}

/* Ornaments: one mask stack, two pseudo-elements (shadow + metal). */
.fr::before,
.fr::after {
  content: "";
  position: absolute;
  inset: calc(-1 * (var(--bw) + var(--oo)));
  pointer-events: none;
  mask:
    var(--orn-tl, linear-gradient(#0000 0 0)) left  top    / var(--os) var(--os) no-repeat,
    var(--orn-tr, linear-gradient(#0000 0 0)) right top    / var(--os) var(--os) no-repeat,
    var(--orn-bl, linear-gradient(#0000 0 0)) left  bottom / var(--os) var(--os) no-repeat,
    var(--orn-br, linear-gradient(#0000 0 0)) right bottom / var(--os) var(--os) no-repeat;
}
.fr::before {                         /* engraved shadow, no filter */
  background: var(--ink);
  translate: 0 1px;
  z-index: -1;
}
.fr::after {                          /* gilded ornament, recolour via --orn-fill */
  background: var(--orn-fill, var(--metal-grad));
}

/* Chamfered variant: Chromium 139+ draws rim/outline/shadow along the bevel. */
@supports (corner-shape: bevel) {
  .fr--bevel { border-radius: var(--ch, .9rem); corner-shape: bevel; }
}

/* ------------------------------------------------------------------ B1.2 big modal */
.fr--modal {
  --bw: round(.5rem, 1px);
  --os: round(5.6rem, 1px);
  --oo: round(1.2rem, 1px);
  --ew: round(16rem, 2px);            /* top/bottom centre ornament */
  --eh: round(3.2rem, 2px);
  padding: 3.2rem 4rem;
  outline-color: color-mix(in oklab, var(--rift) 75%, transparent);  /* rift inner line */
  box-shadow:
    0 0 0 1px var(--ink),
    0 1.6rem 4rem rgb(0 0 0 / .6),
    inset 0 0 3rem color-mix(in oklab, var(--rift) 22%, transparent),
    inset 0 .3rem 1.2rem rgb(0 0 0 / .55);
}
.fr--modal::before,
.fr--modal::after {
  mask:
    var(--orn-tl, linear-gradient(#0000 0 0)) left  top    / var(--os) var(--os) no-repeat,
    var(--orn-tr, linear-gradient(#0000 0 0)) right top    / var(--os) var(--os) no-repeat,
    var(--orn-bl, linear-gradient(#0000 0 0)) left  bottom / var(--os) var(--os) no-repeat,
    var(--orn-br, linear-gradient(#0000 0 0)) right bottom / var(--os) var(--os) no-repeat,
    var(--orn-mt, linear-gradient(#0000 0 0)) center top    / var(--ew) var(--eh) no-repeat,
    var(--orn-mb, linear-gradient(#0000 0 0)) center bottom / var(--ew) var(--eh) no-repeat;
}
.fr-crest {                           /* multi-tone hero piece: inline sprite icon */
  position: absolute;
  left: 50%;
  top: 0;
  width: round(7.2rem, 2px);
  height: round(7.2rem, 2px);
  translate: -50% -58%;
  color: var(--metal);
  --ico-b: var(--rift);
  pointer-events: none;
}
.ui-modal-backdrop {                  /* no backdrop-filter over the live canvas */
  background: radial-gradient(ellipse at 50% 45%, rgb(8 4 2 / .45), rgb(8 4 2 / .82) 75%);
}

/* ------------------------------------------------------------------ B1.3 skill slot */
.slot {
  --sz: round(5.6rem, 2px);
  --bw: round(.3rem, 1px);
  --ch: 28%;
  position: relative;
  isolation: isolate;
  width: var(--sz);
  height: var(--sz);
  contain: size layout style;         /* no paint containment: the ready ring overhangs */
  border: var(--bw) solid transparent;
  background: var(--plate) padding-box, var(--metal-grad) border-box;
  outline: 1px solid var(--ink);
  display: grid;
  place-items: center;
}
.slot-in {                            /* clips cooldown + sheen to the slot shape */
  position: absolute;
  inset: 0;
  overflow: clip;
  border-radius: inherit;
  corner-shape: inherit;
}
.slot .ico { width: round(3.2rem, 1px); height: round(3.2rem, 1px); }

@supports (corner-shape: bevel) {
  .slot      { border-radius: var(--ch); corner-shape: bevel; }      /* octagon */
  .slot--hex { width: round(calc(var(--sz) * .866), 2px);
               border-radius: 50% / 25%; corner-shape: bevel; }      /* pointy-top hex */
}
@supports not (corner-shape: bevel) {
  /* Octagon fallback: metal outer layer + plate inner layer; inner chamfer reduced
     by bw * (sqrt2 - 1) so the diagonal rim keeps the same width as the straight rim. */
  .slot {
    --c: calc(var(--sz) * .28);
    border: 0;
    outline: 0;
    background: var(--metal-grad);
    clip-path: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c),
      100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, var(--c) 100%,
      0 calc(100% - var(--c)), 0 var(--c));
  }
  .slot::before {
    --ci: calc(var(--c) - var(--bw) * .414);
    content: "";
    position: absolute;
    inset: var(--bw);
    z-index: -1;
    background: var(--plate);
    clip-path: polygon(var(--ci) 0, calc(100% - var(--ci)) 0, 100% var(--ci),
      100% calc(100% - var(--ci)), calc(100% - var(--ci)) 100%, var(--ci) 100%,
      0 calc(100% - var(--ci)), 0 var(--ci));
  }
  .slot-in { inset: var(--bw); clip-path: inherit; }
  /* the ready ring (D2) is clipped by clip-path here; acceptable in the fallback */
}

/* ------------------------------------------------------------------ B1.4 bar with end caps */
.bar {
  --h: round(2.8rem, 2px);
  --bw: round(.25rem, 1px);
  --cap-w: round(2rem, 1px);
  --cap-h: round(3.6rem, 2px);
  position: relative;
  height: var(--h);
  margin-inline: calc(var(--cap-w) * .6);
}
.bar::before,
.bar::after {                         /* finials: SVG mask, metal fill */
  content: "";
  position: absolute;
  top: 50%;
  width: var(--cap-w);
  height: var(--cap-h);
  translate: 0 -50%;
  background: var(--metal-grad);
  z-index: 2;
  pointer-events: none;
}
.bar::before { left: calc(var(--cap-w) * -.6);
  mask: var(--cap-l, linear-gradient(#0000 0 0)) center / 100% 100% no-repeat; }
.bar::after  { right: calc(var(--cap-w) * -.6);
  mask: var(--cap-r, linear-gradient(#0000 0 0)) center / 100% 100% no-repeat; }

.bar-track {
  position: absolute;
  inset: 0;
  overflow: clip;
  contain: strict;
  border: var(--bw) solid transparent;
  border-radius: round(.4rem, 1px);
  background: linear-gradient(180deg, #0b0503, #1d0c08) padding-box,
              var(--metal-grad) border-box;
  outline: 1px solid var(--ink);
  box-shadow: inset 0 .2rem .6rem rgb(0 0 0 / .8);
}
.bar-track > i {
  position: absolute;
  inset: 0;
  transform-origin: 0 50%;
}
.bar-ghost  { background: #f3d9a0; opacity: .85; will-change: transform; }
.bar-fill   { will-change: transform;
  background: linear-gradient(180deg, rgb(255 255 255 / .35) 0 12%, transparent 48%, rgb(0 0 0 / .22)),
              var(--fill, #d8343a); }
.bar-shield { will-change: transform; transform: scaleX(0);
  background: linear-gradient(180deg, #e9fbff, #7fd6ff 40%, #3b8fd0); opacity: .9; }
.bar-ticks  { background: linear-gradient(90deg, transparent calc(100% - 2px), rgb(0 0 0 / .45) 0)
                0 0 / calc(100% / var(--n, 10)) 100% repeat-x; }
.bar-flash  { background: #fff; opacity: 0; }
.bar-glow   { opacity: 0; box-shadow: inset 0 0 1.4rem rgb(255 40 40 / .9); }
.bar.low .bar-glow { animation: bar-low .9s ease-in-out infinite alternate; }
@keyframes bar-low { from { opacity: .15; } to { opacity: 1; } }

.bar-num {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 3;
  font: 800 1.3rem/1 'Inter', system-ui, sans-serif;
  font-variant-numeric: tabular-nums lining-nums;
  -webkit-text-stroke: .36rem var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 .1rem .3rem rgb(0 0 0 / .6);
  color: #fff7ea;
}

/* ------------------------------------------------------------------ B1.5 tooltip */
.tip {
  position: absolute;
  max-width: 28rem;
  padding: .9rem 1.2rem;
  border: 1px solid var(--metal-lo);
  outline: 1px solid var(--ink);
  background: linear-gradient(180deg, rgb(36 25 17 / .97), rgb(17 11 7 / .98));
  box-shadow: 0 .6rem 1.6rem rgb(0 0 0 / .55);
  color: var(--text);
  font-size: 1.3rem;
  line-height: 1.35;
  pointer-events: none;
  z-index: 50;
}
.tip::before {                        /* L-shaped corner brackets: border masked to 4 corners */
  --k: round(.9rem, 1px);
  content: "";
  position: absolute;
  inset: -3px;
  border: 2px solid var(--metal);
  pointer-events: none;
  mask:
    linear-gradient(#000 0 0) left  top    / var(--k) var(--k) no-repeat,
    linear-gradient(#000 0 0) right top    / var(--k) var(--k) no-repeat,
    linear-gradient(#000 0 0) left  bottom / var(--k) var(--k) no-repeat,
    linear-gradient(#000 0 0) right bottom / var(--k) var(--k) no-repeat;
}
.tip::after {                         /* arrow */
  content: "";
  position: absolute;
  left: var(--ax, 50%);
  bottom: calc(round(-.5rem, 1px) - 1px);
  width: round(1rem, 2px);
  height: round(1rem, 2px);
  translate: -50% 0;
  rotate: 45deg;
  background: rgb(17 11 7);
  border-right: 1px solid var(--metal-lo);
  border-bottom: 1px solid var(--metal-lo);
}
```

### B2. `src/ui/frames.js`: ornament masks (geometry only, colour stays in CSS)

```js
// Builds SVG mask data URIs once and exposes them as custom properties.
// Shapes are drawn black; only alpha matters, so CSS backgrounds give them colour.
const enc = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
const svgDoc = (w, h, t, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
  `<g fill="#000"${t ? ` transform="${t}"` : ''}>${inner}</g></svg>`;

export function cornerUrls(inner, vb = 64) {
  return {
    tl: enc(svgDoc(vb, vb, '', inner)),
    tr: enc(svgDoc(vb, vb, `translate(${vb} 0) scale(-1 1)`, inner)),
    bl: enc(svgDoc(vb, vb, `translate(0 ${vb}) scale(1 -1)`, inner)),
    br: enc(svgDoc(vb, vb, `translate(${vb} ${vb}) scale(-1 -1)`, inner)),
  };
}

export function edgeUrls(inner, w = 128, h = 32) {
  return {
    t: enc(svgDoc(w, h, '', inner)),
    b: enc(svgDoc(w, h, `translate(0 ${h}) scale(1 -1)`, inner)),
  };
}

export function capUrls(inner, w = 32, h = 48) {
  return {
    l: enc(svgDoc(w, h, '', inner)),
    r: enc(svgDoc(w, h, `translate(${w} 0) scale(-1 1)`, inner)),
  };
}

/** sets: { default: { corner, edge?, cap? }, rune: { corner } … }
 *  'default' applies to :root; any other name to `.orn-<name>` (add the class to a .fr). */
export function installFrames(sets) {
  let css = '';
  for (const [name, s] of Object.entries(sets)) {
    const sel = name === 'default' ? ':root' : `.orn-${name}`;
    let body = '';
    if (s.corner) {
      const c = cornerUrls(s.corner, s.vb ?? 64);
      body += `--orn-tl:${c.tl};--orn-tr:${c.tr};--orn-bl:${c.bl};--orn-br:${c.br};`;
    }
    if (s.edge) {
      const e = edgeUrls(s.edge, s.ew ?? 128, s.eh ?? 32);
      body += `--orn-mt:${e.t};--orn-mb:${e.b};`;
    }
    if (s.cap) {
      const k = capUrls(s.cap, s.cw ?? 32, s.ch ?? 48);
      body += `--cap-l:${k.l};--cap-r:${k.r};`;
    }
    css += `${sel}{${body}}\n`;
  }
  let st = document.getElementById('rb-frames');
  if (!st) {
    st = document.createElement('style');
    st.id = 'rb-frames';
    document.head.appendChild(st);
  }
  st.textContent = css;
}

// Placeholder geometry: replace with the art-direction pass's shapes.
export const DEFAULT_FRAMES = {
  default: {
    // 64-unit corner, outer corner at (0,0): tapered L-bracket, rivet ring, two curls.
    corner:
      '<path d="M0 0H44L38 7H7V38L0 44Z"/>' +
      '<path d="M11 11H30V13H13V30H11Z"/>' +
      '<path fill-rule="evenodd" d="M9 2a7 7 0 1 1 0 14a7 7 0 1 1 0-14Zm0 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z"/>' +
      '<path fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" d="M44 0c6 0 10 4 10 9s-4 8-8 8c-3 0-5-2-5-4.5S43 9 45.5 9"/>' +
      '<path fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" d="M0 44c0 6 4 10 9 10s8-4 8-8c0-3-2-5-4.5-5S9 43 9 45.5"/>',
    // 128x32 centre crest for modal top/bottom edges.
    edge:
      '<path d="M64 2L75 16L64 30L53 16Z"/>' +
      '<path d="M0 14.5H49L53 16L49 17.5H0Z"/><path d="M128 14.5H79L75 16L79 17.5H128Z"/>' +
      '<circle cx="42" cy="16" r="3"/><circle cx="86" cy="16" r="3"/>',
    // 32x48 left finial; the right one is mirrored.
    cap: '<path d="M32 8V40H20L2 24L20 8Z"/>',
  },
};
// Boot: installFrames(DEFAULT_FRAMES);
```

Markup: `<div class="fr fr--modal"><svg class="ico fr-crest"><use href="#i-crest"/></svg>…</div>`. Never put `overflow: hidden` or `contain: paint` on a `.fr`, because the ornaments overhang.

## C. Icons: `src/ui/icons.js`

```js
// Inline SVG <symbol> sprite + <use>. Icons are authored on a 32-unit grid with tone
// tokens (fill="@a" / stroke="@b" …) that become CSS vars inherited into each <use>.
const NS = 'http://www.w3.org/2000/svg';
const defs = new Map();      // id -> { body, vb, relief, halo }
let sprite = null;

const TONES = {
  a:   'var(--ico-a, currentColor)',
  b:   'var(--ico-b, var(--el, currentColor))',
  sh:  'var(--ico-sh, rgb(0 0 0 / .45))',
  hi:  'var(--ico-hi, rgb(255 255 255 / .5))',
  ink: 'var(--ico-ink, #0d0805)',
};
const live = (t) => {
  const v = TONES[t];
  if (!v) throw new Error(`icons: unknown tone @${t}`);
  return v;
};
const solid = (c) => () => c;

// Rewrites fill="@x" / stroke="@x" on every tag into one inline style attribute.
// (Inline styles survive the <use> clone; var() in presentation attributes would not parse.)
function compile(body, tone) {
  return body.replace(/<([a-zA-Z]+)\b([^>]*?)(\/?)>/g, (m, tag, attrs, sc) => {
    let style = '';
    const rest = attrs.replace(/\s(fill|stroke)="@([\w-]+)"/g, (_, prop, t) => {
      style += `${prop}:${tone(t)};`;
      return '';
    });
    return style ? `<${tag}${rest} style="${style}"${sc}>` : m;
  });
}

function symbolMarkup(id, d) {
  const { body, vb } = d;
  const u = vb / 32;                       // one grid unit at the authored scale
  let out = `<symbol id="i-${id}" viewBox="0 0 ${vb} ${vb}">`;
  if (d.halo) {
    const sil = compile(body, solid(TONES.ink));
    out += `<g style="stroke:${TONES.ink}" stroke-width="${d.halo * u}" stroke-linejoin="round" stroke-linecap="round">${sil}</g>`;
  }
  if (d.relief) {
    const dark = compile(body, solid(TONES.ink));
    const lite = compile(body, solid('var(--ico-rim, #fff3d0)'));
    const s = d.relief === 'engraved' ? -1 : 1;
    out += `<g transform="translate(0 ${s * u})" opacity=".75">${dark}</g>`;
    out += `<g transform="translate(0 ${-s * 0.75 * u})" opacity=".3">${lite}</g>`;
  }
  return out + compile(body, live) + '</symbol>';
}

function ensureSprite() {
  if (sprite) return sprite;
  sprite = document.createElementNS(NS, 'svg');
  sprite.id = 'rb-icons';
  sprite.setAttribute('aria-hidden', 'true');
  sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.prepend(sprite);
  return sprite;
}

/** map: { id: '<path fill="@a" d="…"/>' | { body, vb = 32, relief: 'raised'|'engraved'|null, halo: 0 } } */
export function registerIcons(map, defaults = { relief: 'raised', halo: 0 }) {
  const sp = ensureSprite();
  let html = '';
  for (const [id, raw] of Object.entries(map)) {
    const d = { ...defaults, vb: 32, ...(typeof raw === 'string' ? { body: raw } : raw) };
    if (defs.has(id)) sp.querySelector(`#i-${CSS.escape(id)}`)?.remove();
    defs.set(id, d);
    html += symbolMarkup(id, d);
  }
  sp.insertAdjacentHTML('beforeend', html);   // parsed in the SVG namespace
}

/** HTML string for templates. label → role="img"; otherwise decorative. */
export function icon(id, cls = '', label = '') {
  if (!defs.has(id)) console.warn(`icons: missing "${id}"`);
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="ico${cls ? ' ' + cls : ''}" ${a11y} focusable="false"><use href="#i-${id}"/></svg>`;
}

/** Element version for imperative code. */
export function iconEl(id, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `ico${cls ? ' ' + cls : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${id}`);
  svg.appendChild(use);
  return svg;
}

/** Monochrome silhouette as a CSS url() for mask-image (pseudo-element glyphs). */
const maskCache = new Map();
export function iconMask(id) {
  let m = maskCache.get(id);
  if (m) return m;
  const d = defs.get(id);
  if (!d) return 'none';
  const svg = `<svg xmlns="${NS}" viewBox="0 0 ${d.vb} ${d.vb}">${compile(d.body, solid('#000'))}</svg>`;
  m = `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
  maskCache.set(id, m);
  return m;
}

// Format examples (32 grid). The real set (~70) lives in src/ui/icon-set.js.
export const SAMPLE_ICONS = {
  fireball:
    '<path fill="@a" d="M16 2C18 8 25 10 25 19A9 9 0 0 1 7 19C7 14 10 12 11 8C12 11 13 12 14 12C14 8 15 5 16 2Z"/>' +
    '<path fill="@b" d="M16 13c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 1-8Z"/>' +
    '<path fill="@hi" d="M19 11c2 2 3 4 3 7-1-2-2-4-3-7Z"/>',
  ward:
    '<path fill="@a" d="M16 3 27 7v8c0 7-5 12-11 14C10 27 5 22 5 15V7Z"/>' +
    '<path fill="@sh" d="M16 7 9 9.8V15c0 5 3 8 7 10Z"/>' +
    '<path fill="@b" d="M16 7v18c4-2 7-5 7-10V9.8Z"/>',
  skull: {
    halo: 2.5,
    body: '<path fill="@a" fill-rule="evenodd" d="M16 3C9.4 3 5 7.6 5 13.5c0 3.4 1.5 5.9 4 7.4V25a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.1c2.5-1.5 4-4 4-7.4C27 7.6 22.6 3 16 3Zm-5 10a2.8 2.8 0 1 0 0 5.6A2.8 2.8 0 0 0 11 13Zm10 0a2.8 2.8 0 1 0 0 5.6A2.8 2.8 0 0 0 21 13Zm-5 6.5-1.6 3h3.2Z"/>',
  },
};
```

```css
/* css/icons.css */
.ico {
  display: inline-block;
  flex: none;
  width: var(--ico-size, 1.25em);
  height: var(--ico-size, 1.25em);
  vertical-align: -.22em;
  overflow: visible;                 /* relief / halo may spill one unit */
  fill: currentColor;
  pointer-events: none;
}
.ico--s  { --ico-size: round(2.4rem, 1px); }
.ico--m  { --ico-size: round(3.2rem, 1px); }   /* 32 / 48 / 64 px at 720p / 1080p / 1440p */
.ico--l  { --ico-size: round(4.8rem, 1px); }
.ico--xl { --ico-size: round(6.4rem, 1px); }

/* CSS mask glyph for pseudo-elements: style="--m: ${iconMask('rune')}" */
.mico::before {
  content: "";
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -.15em;
  background: currentColor;
  mask: var(--m) center / contain no-repeat;
}
```

Usage in `hud.js`: `` `<div class="hud-slot-icon">${icon(s.def.id, 'ico--m')}</div>` `` (with `--el` already set on the slot box, so the accent tone follows the element).

## D. Meters

### D1. `src/ui/meter.js`

```js
import { setCss, setCls, clamp01 } from './hud-util.js';

const q = (x) => Math.round(x * 2048) / 2048;   // quantise so the setCss memo skips repeats

export class Meter {
  /** root: .bar element containing .bar-fill / .bar-ghost / [.bar-shield] / [.bar-flash] */
  constructor(root, { hold = 0.4, rate = 7, low = 0.3 } = {}) {
    this.root = root;
    this.fill = root.querySelector('.bar-fill');
    this.ghost = root.querySelector('.bar-ghost');
    this.shield = root.querySelector('.bar-shield');
    this.flashEl = root.querySelector('.bar-flash');
    this.v = 1;
    this.g = 1;
    this.t = 0;
    this.lastFlash = -1e9;
    Object.assign(this, { hold, rate, low });
  }

  /** dt in game seconds (0 while paused); v, s = fractions of the track. */
  update(dt, v, s = 0) {
    v = clamp01(v);
    s = clamp01(Math.min(s, 1 - v));
    if (v < this.v - 1e-4) {                // took damage
      this.t = this.hold;
      this.flash();
    }
    this.v = v;
    if (this.g < v) this.g = v;             // heal: ghost follows up at once
    else if (this.t > 0) this.t -= dt;      // hold the chip so the hit reads
    else this.g = v + (this.g - v) * Math.exp(-this.rate * dt);
    if (this.g - v < 0.001) this.g = v;

    setCss(this.fill, 'transform', `scaleX(${q(v)})`);
    setCss(this.ghost, 'transform', `scaleX(${q(this.g)})`);
    if (this.shield) {
      setCss(this.shield, 'transform', `translateX(${(q(v) * 100).toFixed(3)}%) scaleX(${q(s)})`);
    }
    setCls(this.root, 'low', v > 0 && v < this.low);
  }

  flash() {
    const now = performance.now();
    if (!this.flashEl || now - this.lastFlash < 90) return;
    this.lastFlash = now;
    this.flashEl.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' });
  }
}
```

HP integration (replaces the `width` writes in `_updateHP`):

```js
// constructor: this.hpMeter = new Meter(this.el.hp);   // .bar.bar--hp
const total = Math.max(max, hp + sh);
this.hpMeter.update(dt, hp / total, sh / total);
setVar(this.el.hp, '--n', String(Math.max(1, Math.round(total / 100))));  // tick every 100 HP
```

Markup:

```html
<div class="bar bar--hp" data-ref="hp">
  <div class="bar-track">
    <i class="bar-ghost"></i><i class="bar-fill"></i><i class="bar-shield"></i>
    <i class="bar-ticks"></i><i class="bar-flash"></i><i class="bar-glow"></i>
  </div>
  <span class="bar-num" data-ref="hpText"></span>
</div>
```

### D2. Radial cooldown + ready flash

```css
@property --cd {
  syntax: '<angle>';
  inherits: true;
  initial-value: 0deg;
}
.slot-cd {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: conic-gradient(rgb(6 3 1 / .78) calc(var(--cd) - .7deg), rgb(6 3 1 / 0) var(--cd));
}
.slot-hand {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 50%;
  margin-left: -1px;
  transform-origin: 50% 100%;
  rotate: var(--cd);
  will-change: rotate;
  background: linear-gradient(180deg, var(--rift-hi), transparent);
  opacity: 0;
  pointer-events: none;
}
.slot.cooling .slot-hand { opacity: .9; }
.slot-ring {                           /* ready flash, animated via WAAPI */
  position: absolute;
  inset: round(-.4rem, 1px);
  border-radius: inherit;
  corner-shape: inherit;
  box-shadow: 0 0 0 2px var(--el), 0 0 1.2rem var(--el);
  opacity: 0;
  pointer-events: none;
}
.slot-cdt {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font: 800 1.6rem/1 'Inter', system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  -webkit-text-stroke: .4rem var(--ink);
  paint-order: stroke fill;
  color: #fff;
}
```

```js
// in _updateSlots, per filled slot (parts = { cd, cdt, ring, wasCd })
const r = maxCd > 0 ? clamp01(s.cd / maxCd) : 0;
setVar(box, '--cd', (Math.round(r * 720) / 2) + 'deg');   // 0.5° steps
setText(parts.cdt, s.cd > 0.05 ? s.cd.toFixed(1) : '');
setCls(box, 'cooling', s.cd > 0);
if (parts.wasCd && s.cd <= 0) {
  parts.ring.animate(
    [{ opacity: 1, transform: 'scale(.85)' }, { opacity: 0, transform: 'scale(1.25)' }],
    { duration: 450, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
  parts.sheen?.animate([{ transform: 'translateX(-60%)' }, { transform: 'translateX(60%)' }], 600);
}
parts.wasCd = s.cd > 0;
```

Slot markup: `.slot > .slot-in > (icon, .slot-cd, .slot-hand, .sheen-layer), .slot-cdt, .slot-ring, .slot-key, .slot-pips`.

### D3. Liquid orb (and vial)

```css
.orb {
  --sz: round(9.6rem, 2px);
  --liq: #c8202f;
  --liq-hi: #ff7a63;
  --wave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 16' preserveAspectRatio='none'%3E%3Cpath d='M0 8Q25 0 50 8T100 8V16H0Z'/%3E%3C/svg%3E");
  position: relative;
  width: var(--sz);
  height: var(--sz);
  border-radius: 50%;
  overflow: clip;
  contain: strict;
  isolation: isolate;
  background: radial-gradient(circle at 50% 40%, #1f0e0b, #060302 72%);
  outline: round(.3rem, 1px) solid var(--metal);   /* or a .fr-style ring wrapper */
  outline-offset: 0;
}
.orb-liq {
  position: absolute;
  inset: 0;
  will-change: transform;
  transform: translateY(0%);
  background: linear-gradient(180deg, var(--liq-hi), var(--liq) 22%,
              color-mix(in oklab, var(--liq) 55%, #000));
}
.orb-wave {
  position: absolute;
  left: 0;
  top: round(-.8rem, 1px);
  width: 200%;
  height: round(1.6rem, 2px);
  background: var(--liq-hi);
  mask: var(--wave) 0 0 / 50% 100% repeat-x;
  animation: orb-wave 2.6s linear infinite;
}
.orb-wave--b {
  top: round(-.6rem, 1px);
  opacity: .5;
  animation-duration: 3.7s;
  animation-direction: reverse;
}
@keyframes orb-wave { to { transform: translateX(-50%); } }
.orb-glass {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(ellipse 55% 35% at 36% 22%, rgb(255 255 255 / .45), transparent 70%),
    radial-gradient(circle at 50% 50%, transparent 60%, rgb(0 0 0 / .5) 100%);
}
/* Vial: same parts; replace border-radius with a silhouette mask:
   .vial { border-radius: 0; mask: var(--vial-shape) center / 100% 100% no-repeat; } */
```

```js
// per frame: v = hp fraction
setCss(liqEl, 'transform', `translateY(${((1 - clamp01(v)) * 100).toFixed(2)}%)`);
```

### D4. Tabular-figure check (dev only)

```js
// true if the font has tabular digits: '1111' and '0000' must measure the same.
export function hasTabularDigits(font = '700 20px Cinzel') {
  const c = document.createElement('canvas').getContext('2d');
  c.font = font;
  const w1 = c.measureText('1111').width;
  const w0 = c.measureText('0000').width;
  return Math.abs(w1 - w0) < 0.5;
}
```

(Canvas 2D has no `font-variant-numeric`. This measures the font's **default** figures, which is enough to catch proportional-only display faces. For a CSS check, measure two `<span>`s with `tabular-nums` applied.)

## E. Flourishes

```css
/* E1. Sheen sweep (compositor). Parent needs overflow: clip (or .slot-in). */
.sheen { position: relative; overflow: clip; }
.sheen::after {
  content: "";
  position: absolute;
  inset: -20% -60%;
  background: linear-gradient(100deg, transparent 42%, rgb(255 244 210 / .55) 50%, transparent 58%);
  transform: translateX(-60%);
  opacity: 0;
  pointer-events: none;
}
.sheen.go::after, .sheen:hover::after { animation: sheen .9s cubic-bezier(.3,.1,.3,1) both; }
.sheen.idle::after { animation: sheen-idle 6s calc(var(--i, 0) * .37s) infinite; }
@keyframes sheen {
  0%   { transform: translateX(-60%); opacity: 0; }
  15%  { opacity: 1; }
  100% { transform: translateX(60%); opacity: 0; }
}
@keyframes sheen-idle {
  0%, 85% { transform: translateX(-60%); opacity: 0; }
  88%     { opacity: 1; }
  100%    { transform: translateX(60%); opacity: 0; }
}

/* E2. Gilded text shimmer (paints per frame: title/menus only) */
.gild {
  background: linear-gradient(100deg, var(--metal-dk) 0%, var(--metal) 18%, var(--metal-hi) 28%,
              var(--metal) 38%, var(--metal-lo) 60%, var(--metal) 80%, var(--metal-hi) 100%)
              0 0 / 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: gild 7s linear infinite;
}
.gild-wrap { filter: drop-shadow(0 2px 0 var(--ink)) drop-shadow(0 .3rem .8rem rgb(0 0 0 / .6)); }
@keyframes gild { to { background-position: -250% 0; } }

/* E3. Rune glow pulse */
.rune { position: relative; isolation: isolate; }
.rune::before {
  content: "";
  position: absolute;
  inset: -35%;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in oklab, var(--el, var(--rift)) 70%, transparent), transparent);
  opacity: .25;
  animation: rune-pulse 2.4s ease-in-out infinite alternate;
  pointer-events: none;
}
@keyframes rune-pulse { to { opacity: .9; transform: scale(1.08); } }

/* E4. Crystal facet glint: place a few per frame with --d = 0..3 */
.glint {
  position: absolute;
  width: round(1.4rem, 2px);
  aspect-ratio: 1;
  background: var(--rift-hi);
  clip-path: polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%);
  opacity: 0;
  transform: scale(.2);
  animation: glint 3.2s calc(var(--d, 0) * 1s) ease-out infinite;
  pointer-events: none;
}
@keyframes glint {
  0%, 70%   { opacity: 0; transform: scale(.2) rotate(0deg); }
  78%       { opacity: 1; transform: scale(1) rotate(45deg); }
  92%, 100% { opacity: 0; transform: scale(.3) rotate(90deg); }
}

/* E5. Card reveal: flip + rise, ends at transform:none (crisp text) */
.cards { perspective: 90rem; }
.card {
  position: relative;
  transform-style: preserve-3d;
  animation: card-in .6s cubic-bezier(.2,.8,.2,1) calc(var(--i, 0) * 90ms) both;
}
.card-face, .card-back { backface-visibility: hidden; }
.card-back { position: absolute; inset: 0; transform: rotateY(180deg); }
@keyframes card-in {
  0%   { opacity: 0; transform: translateY(3rem) rotateY(180deg) scale(.92); }
  35%  { opacity: 1; }
  100% { opacity: 1; transform: none; }
}

/* E6. Ink-bleed reveal: remove .ink-in on animationend so the mask doesn't linger */
.ink-in {
  mask-image: linear-gradient(90deg, #000 0 38%, rgb(0 0 0 / .6) 44%, #000 47%, transparent 62%);
  mask-size: 250% 100%;
  mask-repeat: no-repeat;
  mask-position: 100% 0;
  animation: ink-in 1.1s cubic-bezier(.3,.6,.3,1) both;
}
@keyframes ink-in {
  from { mask-position: 100% 0; filter: blur(.25em); }
  to   { mask-position: 0 0;    filter: none; }
}

@media (prefers-reduced-motion: reduce) {
  .sheen::after, .glint, .rune::before, .gild, .orb-wave { animation: none; }
  .card, .ink-in { animation-duration: .01s; }
}
```

```js
// E6 helper
el.classList.add('ink-in');
el.addEventListener('animationend', () => el.classList.remove('ink-in'), { once: true });
```

## F. Cross-browser caveats (summary)

| Feature | Chromium | Firefox | Safari | Fallback used here |
|---|---|---|---|---|
| `corner-shape` | 139+ | no | no | `clip-path` polygon + inner layer (B1.3); square + ornaments for panels |
| `round()` | 125+ | 118+ | 15.4+ | none needed |
| `@property` | 85+ | 128+ | 16.4+ | none needed |
| `paint-order` on HTML text | 123+ | 60+ | 11+ | none needed |
| unprefixed `mask` | 120+ | 53+ | 15.4+ | none needed |
| `mask-border` | partial | **no** | 17.2+ | not used |
| `zoom` | yes | 126+ | yes | not used (root rem instead) |
| `color-mix()` | 111+ | 113+ | 16.2+ | none needed |
| `translate` / `rotate` individual properties | 104+ | 72+ | 14.1+ | none needed |

---

## Sources

- Brosset, *Invasion of the border snappers* (device-pixel snapping of border/outline; box-shadow not snapped): https://patrickbrosset.com/articles/2024-06-21-invasion-of-the-border-snappers/
- Chromium WPT, *Snap border, outline, column-rule widths before layout*: https://chromium.googlesource.com/external/w3c/web-platform-tests/+/refs/tags/merge_pr_36189
- Smashing Magazine, *Beyond border-radius: corner-shape* (Mar 2026): https://www.smashingmagazine.com/2026/03/beyond-border-radius-css-corner-shape-property-ui/
- squircle.js.org, *corner-shape support 2026*: https://squircle.js.org/blog/squircles-in-css
- MDN `border-image-slice`: https://developer.mozilla.org/docs/Web/CSS/border-image-slice
- MDN `mask-border`: https://developer.mozilla.org/en-US/docs/Web/CSS/mask-border · caniuse: https://caniuse.com/mdn-css_properties_mask-border
- CSS-Tricks, styling `<use>` shadow content: https://css-tricks.com/?p=186538
- F. Weinberg, *SVG `<use>` two colours via currentColor*: https://codepen.io/FWeinb/post/quick-tip-svg-use-style-two-colors
- fvsch, *SVG icons with CSS variables*: https://fvsch.com/svg-css-vars
- Chromium design doc, *Filter Effects* (CPU vs GPU filter paths): https://www.chromium.org/developers/design-documents/image-filters/
- web.dev, *Stick to compositor-only properties and manage layer count*: https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- Tab Atkins on conic-gradient hard-stop aliasing (CSSWG): https://lists.w3.org/Archives/Public/public-css-archive/2023Jul/0188.html
- web.dev, *@property baseline*: https://web.dev/blog/at-property-baseline
- MDN `paint-order`: https://developer.mozilla.org/docs/Web/CSS/paint-order · caniuse: https://caniuse.com/mdn-css_properties_paint-order
- MDN `zoom`: https://developer.mozilla.org/en-US/docs/Web/CSS/zoom
- MDN `round()`: https://developer.mozilla.org/docs/Web/CSS/round
- WebKit bug 120583 (fractional-offset composited text blur): https://bugs.webkit.org/show_bug.cgi?id=120583
- Chromium CL, subpixel offset on composited layers: https://codereview.chromium.org/1848613002
- MDN, *Using CSS containment*: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using
- web.dev, *Optimize web fonts*: https://web.dev/learn/performance/optimize-web-fonts
- Google Fonts CSS2 API (`text=`, `display=`, axis ranges): https://developers.google.com/fonts/docs/css2
