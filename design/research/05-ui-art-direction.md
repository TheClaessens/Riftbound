# 05 — UI Art Direction (Riftbound)

Research brief for replacing the current "Walnut & Brass" UI theme (`css/ui.css`, `css/menus.css`, `src/ui/*.js`). The theme uses brown gradient plates with gold borders, parchment cards, Cinzel and Inter, and unicode/emoji glyphs as icons. This brief says why that combination reads as machine-made, what the reference games do instead, and which direction to build. It also sets an icon style guide, a type system and a motion spec.

> **Sources.** Where a claim about a reference game rests on a public source, the source is linked. Where it is a description of the game's screens from play or common knowledge, it is marked *(obs.)*. Check those against the [Game UI Database](https://www.gameuidatabase.com/) ([about](https://80.lv/articles/game-ui-database-collecting-references-to-inspire-designers/)) before copying a layout.

---

## TL;DR

1. **The UI reads as AI-made because no decision shows.** It has one container (a rounded brown box with a gold border, an inner hairline and a drop shadow) at one weight everywhere. Gradients have no light source. It uses the statistically default fantasy pairing (Cinzel + Inter). Icons are emoji and dingbats from whatever font the OS has. Tags are pills. Every card is a paragraph.
2. **Recommended direction: "Crownforge".** Panels are cool, near-black **rift-iron** with **chamfered, flat-shaded facets** (to echo the low-poly world). Edges are **desaturated crown-bronze** with a 1 px gilt rim. The four Primes appear **only as gem/enamel inlays**, in literal "sockets" from the shattered Riftcrown. A prismatic four-colour crack is reserved for fusions, Aurelith and Rift moments.
3. **Why it wins:** a cool, dark plate (L ≈ 0.006) is complementary in hue to green and ochre ground and gets 4–7:1 value contrast on all three acts. Brown walnut is the *same hue* as the Barrens ground. The direction also gives every element colour a meaningful home, and it can all be built in CSS (`clip-path` chamfers, hard-stop facet gradients, an SVG 9-slice `border-image`) plus inline SVG. No raster images are needed.
4. **Fonts (all verified on Google Fonts' css2 API):**
   * **Grenze** 700/800 for headings: a roman/blackletter hybrid that looks forged, with nine weights.
   * **Grenze Gotisch** 700 only for hero type ≥ 32 px (act cards, boss intro, wordmark).
   * **Alegreya Sans SC** 700/800 for labels.
   * **Alegreya Sans** 500/700/800 for body and **all numbers** (lining figures by default; use `tabular-nums`).
   * Drop Cinzel, Cinzel Decorative and Inter.
5. **Palette core:**
   * Plates: `#14111c` / `#1c1826` / `#262033`.
   * Rift enamel: `#2a2350`.
   * Bronze: `#4e3a24` / `#8c6c43` / `#c8a874`, with a gilt rim of `#ecd9a6`.
   * Text: `#f2ece0` / `#b9b0c4`.
   * Primes: unchanged (`#c08cff #ff7a33 #7fe0ff #ffe45c`), each with lo/hi partners.
   * Reserved: **magenta = enemy shots** and **red-orange = telegraphs**. Never use them for decoration.
6. **Icons:** about 85 hand-made SVGs on a **48-unit grid** (40-unit live area).
   * Each icon is a **filled silhouette in 3 flat tones plus a 2-unit ink "cut" outline** (`paint-order: stroke`), lit from the upper-left as faceted planes, with no gradients.
   * The silhouette type tells you the category: **skills are energy, relics are objects, passives are engraved sigils, statuses are 1-tone pictograms.**
   * Element colour arrives through CSS custom properties (`--el`, `--el-lo`, `--el-hi`), which inherit through `<use>`.
7. **Hierarchy has 3 frame tiers:**
   * Tier 1, ornamented (boss bar, skill bar, modals).
   * Tier 2, plain chamfered plate (relic tray, tooltips).
   * Tier 3, frameless outlined text (timer, Chain, labels).
   Most of the HUD should be Tier 3.
8. **Motion:** two easings. *Forge* is `cubic-bezier(.2,.8,.2,1)` and *Stamp* is `cubic-bezier(.34,1.56,.64,1)`. Modal intros finish in ≤ 450 ms, and input is locked for 250 ms against misclicks. Each moment gets one hero motion. Animate only `transform`, `opacity` and `clip-path`, and honour `prefers-reduced-motion` and the Shake setting.

---

## 1. Why a game UI reads as "AI generated", and what an authored UI does instead

Practitioner write-ups on "AI slop" agree on one thing: no single choice is the tell. **The absence of decisions is.** Models sample the statistical centre of what they have seen, so every element ends up with the same radius, the same shadow and the same weight, and nothing leads ([ux-skill wiki](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design), [noqta](https://noqta.tn/blog/ai-design-slop-overused-ui-patterns-fix-2026), [vp0](https://vp0.com/blogs/why-does-my-ai-app-look-generic)). Those sources are about web apps. Below, the same diagnosis is applied to Riftbound's current HUD.

| # | Tell (present in Riftbound today) | Why it reads as generated | Authored alternative |
|---|---|---|---|
| 1 | **Emoji and unicode glyphs as icons** (🔥 ⚡ ❄ ✦ ⚗ 🩸 🏮 ⚙ ♛ ☄ 🜂 🜄 …) | They render in the OS emoji font, so 🔥 is Segoe on Windows and Apple elsewhere. They mix full-colour emoji with monochrome dingbats, have no shared stroke, scale, light or palette, and several skills share one glyph (❄ for both Frost Nova and Blizzard, ◈ is used 4×). It is the single loudest "nobody drew this" signal. | One hand-made SVG set with one grid, one light source, one outline weight and one tone count (§4). Each icon is unique, and the category reads from the silhouette. |
| 2 | **One container for everything**: a rounded box with a 2 px brass border, an inner gold hairline, an outer keyline and a drop shadow (`.hud-panel`) | Same weight everywhere means no hierarchy. The eye has nowhere to land, which is the opposite of "Readable chaos". | **Three frame tiers** (§3.4). Ornament is earned: only the skill bar, boss bar and modals get Tier 1. Most HUD text has **no frame**. |
| 3 | **Uniform `border-radius: 8px`** | A web-component default. Round corners also contradict a world built from flat-shaded, faceted primitives. | **Chamfers (cut corners) are the shape language**, matching the low-poly facets. Radius appears only on things that really are round: gems, orbs, pips. |
| 4 | **A gradient on every surface** (`--rb-panel` 180° walnut fade) | The gradient implies no light source, so it reads as a "make it look rich" filter. | **Flat facets**: 2–3 hard-stop planes lit from the upper-left, the way the 3D world is shaded. Smooth gradients only on things that emit light (glow, charge fills). |
| 5 | **Cinzel + Inter** | Cinzel is the default "epic" Trajan face. Inter is the default UI face of nearly every design tool. Together they are the most common pair in generated fantasy mock-ups. | Faces with a point of view that fit *this* world: **Grenze / Grenze Gotisch + Alegreya Sans (SC)** (§5). |
| 6 | **Centred, letter-spaced, title-case labels everywhere** | Spaced capitals as decoration, at the same size as the data. | Small caps for *labels*, prominent tabular numbers for *data*. Labels sit flush to their value, not centred over it. |
| 7 | **Pill tags** (capsule chip with a tinted background) | A SaaS dashboard pattern. | Tags become **stamped sigils**: a small engraved mark plus a small-caps word, sometimes set into the card frame's notch (§3.5). |
| 8 | **Soft glow and drop shadow on everything** (`0 0 18px rgba(gold)`) | Glow reads as "magic" only when it is rare. Everywhere, it becomes fog. | A **hard 1 px dark keyline outside and a 1 px light rim inside**: a cel-shaded edge that reads on both light and dark ground. Glow only on Prime gems, ready-flashes and the Chain counter. |
| 9 | **Brown-and-gold parchment palette** | The statistical centre of "fantasy UI". It is also the *same hue* as the Act II ground, so it disappears there. | A palette derived from the lore (rift-iron, crown-bronze, Prime gems) and chosen *against* the ground colours (§3.1). |
| 10 | **Text-heavy cards** (name + sentence + flavour + tag, all similar weight) | Shows content was generated before it was designed. | Lead with the icon, then **one number-led effect line** with the key number in the element colour ("**+40%** reaction damage"). Flavour lives only in the Codex. Rank goes in pips, not words. |
| 11 | **Decoration with no meaning** (✦ separators, generic corner flourishes) | Ornament as filler. | **Every ornament encodes something**: crown points mark rank, gem sockets mark element, a notch marks card type, and the prism crack marks a fusion. |
| 12 | **The same fade-and-slide 300 ms on every element** | Default transitions. | One hero motion per moment, with timing that matches the material: metal *stamps*, rift light *wipes* (§6). |
| 13 | **Generic copy** ("Choose an upgrade!", "Victory!") | No voice. | Diegetic verbs: "The Rift offers…", "Bind a relic", "Shatter the Heart". Keep it short. |
| 14 | **Translucent panels with blur over the 3D scene** (if any) | A modern-app (glassmorphism) tell. It also lets busy ground bleed into the text. | Opaque plates (≥ 0.94 alpha). Show the world *around* the HUD, not through it. |

---

## 2. Reference study

### 2.1 Per game

| Game | Frame material and motif | Health / resource | Skill bar | Boss bar | Rarity / tag language | Type | Icons | Principle we take |
|---|---|---|---|---|---|---|---|---|
| **Hades / Hades II** | Hand-illustrated ornamental borders, with the UI treated as part of the art direction rather than a layer on top. Hundreds of icons drawn in one consistent style ([Supergiant job post](https://www.supergiantgames.com/blog/job-opportunity-ui-illustrator-for-hades-ii); [UI animator post](https://www.workwithindies.com/careers/supergiant-games-ui-animator-hades-ii)). Won IGDA UI awards ([VGC](https://www.videogameschronicle.com/news/hades-wins-9-times-at-the-igda-global-industry-game-awards/)). | Thin red bar top-left with the number; Death Defiance as tokens *(obs.)* | Small god-emblem badges per slot: the *source* (god) is the frame, the effect is the glyph *(obs.)* | Wide top bar, name in display caps *(obs.)* | Rarity = frame colour: Common white, Rare blue, Epic purple, Heroic red; Duo and Legendary are separate tiers ([wiki summary](https://deltiasgaming.com/?p=357537)) | Custom/classical display for names, clean text face for rules; some sources guess Marcellus ([madegooddesigns](https://madegooddesigns.com/hades-font/)) | Painted, emblem-on-coin | **Two independent channels**: who it comes from (emblem/frame) and how strong it is (rarity colour). Numbers inside descriptions are coloured. |
| **Diablo II** | Carved stone console, statues flanking *(obs.)* | **Red/blue orbs**: liquid level reads at a glance, peripheral-friendly | Two big skill buttons beside the orbs | Name plate, top | Defined the white / blue / yellow / gold-unique / green-set ladder *(obs.)* | Exocet-style chiselled caps *(obs.)* | Painted, framed squares | Frame material = the world's material. Orbs suit **one or two** resources but cost a lot of screen. |
| **Diablo IV** | Darker, grittier metal. In 2020 the team moved the skill UI to bottom-centre after feedback and darkened the palette "to look grittier". Item icons were cut ~10–15% in size ([RPG Site](https://www.rpgsite.net/news/9492-diablo-iv-discusses-ui-design-coop-controller-support-and-cannibals-in-first-quarterly-update), [Blizzard Feb 2020](https://news.blizzard.com/en-us/article/23308274/diablo-iv-quarterly-updatefebruary-2020), [late-2020 summary](https://blizzplanet.substack.com/p/diablo-iv-last-2020-quarterly-update)) | Orbs again, flanking a centred bar *(obs.)* | 6 slots, centred, key caps under slots *(obs.)* | Top centre | Extended ladder (legendary orange, unique gold, mythic) *(obs.)* | Chiselled display caps + neutral body *(obs.)* | Painterly, high value contrast | **Centre the action UI for an isometric camera** (the eye lives at screen centre). Reduce chrome until it stops competing. |
| **Slay the Spire** | Painted card frames | Energy orb themed per character | — | HP under the enemy | **Shape = card type** (attack pentagon, skill rectangle, power circle) and **banner colour = rarity** (grey / blue / gold) ([wiki](https://slaythespire.wiki.gg/wiki/Card)) | Friendly serif for card text *(obs.)* | Painted relic objects on a top bar | **Separable channels**: shape, colour and position each carry *one* meaning. This is the core of our card design (§3.5). |
| **Darkest Dungeon** | Heavy black ink frames, crosshatch, blood red | Bars plus stress pips under portraits | Skill squares with a painted border | — | — | Distressed gothic display (Dwarven Axe BB per [designbeep](https://designbeep.com/2026/01/22/darkest-dungeon-font/)) | Same ink technique as the characters | **Draw the UI in the same technique as the world.** For us that means faceted, flat-shaded planes. |
| **Warcraft III / WoW Classic** | WC3: a **console material per faction** (orc wood and spikes, human stone and gold, elf wood and leaf, undead bone). WoW: stone and gold bar with gryphon end caps *(obs.)* | Unit frames (portrait + bars) | Square action buttons, 1 px bevel, keybind in the corner | Target frame | Grey/white/green/blue/purple/orange, the de-facto genre ladder *(obs.)* | Friz Quadrata for names, Morpheus for quest titles *(obs.)* | 64 px painted square icons, one object or energy per icon | **Frame material = faction / culture.** End caps give a bar identity. Rarity is learned, so reuse a familiar ladder. |
| **Hollow Knight** | No panel at all | Masks (a unit per hit) + Soul vessel; growth changes the HUD shape itself ([TrueAchievements](https://www.trueachievements.com/game/Hollow-Knight/walkthrough/2)) | — | Name only, at intro | — | Classical titling | Monochrome | **Restraint.** A muted HUD makes colour mean something ([Mechanics of Magic](https://mechanicsofmagic.com/2022/04/20/visual-design-of-games-59/)). Counts small enough to read as **pips** should be pips. |
| **Death's Door** | Almost none | Small pips for health and magic *(obs.)* | — | Thin bar | — | Small, crisp | Minimal | Pips for small integers (our **dash charges**, Frost Armor, Death Defiance-likes). A minimal HUD trend in action games is documented in [this study](https://bonndoc.ulb.uni-bonn.de/xmlui/handle/20.500.11811/14207?show=full). |
| **Tunic** | The **in-game manual** is the diegetic UI object, prototyped physically and scanned ([GameSpot](https://gamespot.com/articles/how-tunics-cool-in-game-manual-was-made/1100-6507719/), [Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-tunic-weaves-wondrous-unknowable-worlds-inspired-by-inscrutable-nes-manuals)) | Thin coloured bars top-left *(obs.)* | — | — | — | Rune script as a mystery layer | Cute, chunky | A **diegetic frame story for menus** (our Sanctum / Codex) can carry ornament the HUD cannot. |
| **Halls of Torment** | A deliberately 1997-Diablo console with old fonts; "archaic UI and antiquated fonts" sell the pastiche ([Rogueliker](https://rogueliker.com/halls-of-torment-review/)) | Orb | Bottom bar | Top | Diablo ladder | Old serif | Pre-rendered look | **A coherent era pastiche beats a generic "fantasy" style.** Our "era" is low-poly / faceted. |
| **Vampire Survivors** | Crude on purpose | Tiny HP bar under the player; XP bar spans the top *(obs.)* | Weapon and passive grid top-left | — | Evolution = a special frame | Pixel font, high contrast | Pixel sprites | Under extreme density, **meta info lives at the screen edge**, the centre stays clear, and HP sits *on the player*. |
| **Last Epoch** | Dark metal and bronze, a health globe, a centred skill bar ([community wiki](https://lastepoch.fandom.com/wiki/File:SkillsWindow.png); devs on reworking colour scheme and bar layout: [forum](https://forum.lastepoch.com/t/feedback-corner-the-user-interface/10889)) | Globe + mana bar | 5 centred slots | Top | Extended ladder | Neutral | Painted | Bronze on blackened metal reads as "ARPG" **without** brown parchment. |
| **Grim Dawn** | Rusted iron, Victorian-gothic *(obs.)* | Health/energy globes | Two rows of slots | Top | Ladder | Serif display | Painted | Material storytelling: rust = a dying world. Our material should say *crown and rift*. |
| **Torchlight I/II** | Chunky bevelled frames in a cartoon world *(obs.)* | Orbs | Centred | Top | Ladder | Rounded display | Saturated, chunky | **Our closest sibling** (a stylised, saturated world). Chunky worlds want **chunky, simple frames**, not fine filigree. |
| **Ravenswatch** | Illustrative and comic, aiming for "a screenshot that looks hand-drawn" ([Passtech AD](https://www.passtechgames.com/?p=4496)) | Bar | Centred 4 skills | Top | — | Brushy display | Inked | The UI is drawn **in the same medium as the 3D art**. |
| **Spiritfarer** | Soft, rounded, painterly, cosy *(obs.)* | — | — | — | — | Rounded hand-lettering | Soft | What **not** to do for a horde game: soft and low-contrast reads as cosy, not urgent. |

### 2.2 Principles we extract

1. **Frame material = the world's material** (Diablo II, WC3, Darkest Dungeon, Ravenswatch). Our world is **flat-shaded faceted geometry**, and our lore object is **a shattered crown set with four Prime gems**. The frame should be faceted metal with sockets.
2. **One channel, one meaning** (Slay the Spire, Hades). Shape = type, gem/enamel colour = element, pips/crown points = rank, frame notch = tag. Never encode two things in one channel.
3. **Colour is earned through restraint** (Hollow Knight). Make the chrome near-neutral so the four Primes, HP red, and the threat colours (magenta, red-orange) are the only saturated things on screen.
4. **Centre the action UI for an isometric camera** (Diablo IV). The skill bar and HP go bottom-centre, the boss bar top-centre. Everything else sits at the edges and is frameless.
5. **Pips for small integers, bars for continuous values** (Death's Door, Hollow Knight). Dash charges, Frost Armor, Rerolls/Banishes and boss phases are pips. HP, XP, Momentum and boss HP are bars.
6. **Orbs cost space.** In a horde game they cover the lower corners, where enemies come from. Use a **wide segmented HP bar under the skill bar** instead.
7. **Ornament scales with importance** (WoW end caps, Hades boon cards). Big moments (boss intro, act card, fusion offer) get the richest frames.
8. **Chunky world, chunky UI** (Torchlight). Filigree thinner than ~1.5 px at 1280×720 shimmers and vanishes. Ornament must survive at 0.67× scale.
9. **Menus can be diegetic, the HUD cannot** (Tunic). The Sanctum and Codex can carry storytelling (crown fragments on an altar). The HUD stays functional.
10. **Numbers are the UI**: tabular, lining, prominent. In descriptions, colour the key number in its element colour (Hades).

---

## 3. Three art directions

The ground the UI sits on, measured in `04-vfx-readability.md`:

| Ground | Colour | Relative luminance L |
|---|---|---|
| Thornwood grass | `#7bb147` / `#5f8f3a` | 0.36 / 0.22 |
| Barrens | `#ce7122` | 0.25 |
| Reach water | `#3a7fb0` | 0.19 |

All three are mid-value and saturated, so a HUD reads by **value** (dark plates) and **hue opposition**. The current walnut `#2b1a0e` (L 0.013) is ~25° of hue, the **same hue as the Barrens**, so in Act II it looks like a darker patch of ground.

### 3.A "Crownforge": the Riftwarden's Reliquary (**recommended**)

**Idea.** The UI is the reliquary that holds the pieces of the Riftcrown. Plates are **rift-iron**: blackened, slightly violet, cut in **chamfered facets** like the world's low-poly rocks. Edges are **crown-bronze**, desaturated so they don't compete with the Storm yellow or Fire orange, with a 1 px gilt rim. Each Prime is a **gem in a socket**. The crown's **prism crack** (a four-Prime gradient hairline) appears only where the crown's power is in play: fusions, Aurelith's Prism Ward, the Rift Shift, victory.

**Material language**
- **Rift-iron plate.** Near-black with a violet cast. Two flat facets per plate, split by a hard-stop gradient at ~160°: upper-left `#262033`, the rest `#1c1826`. Opacity 0.94–0.97.
- **Crown-bronze bezel.** 2 px band with a lo/mid/hi tri-tone. The **gilt rim** (`#ecd9a6`) is 1 px on the *inner upper-left* edges only (the light direction). A **void keyline** (`#0c0a12`) 1 px outside every Tier 1/2 frame.
- **Rift enamel** (`#2a2350`). The recessed field inside sockets and boss-bar troughs; a "cloisonné" field the gems sit in.
- **Prime gems.** Faceted cabochons (CSS: conic or hard-stop gradient on a hexagon or rhombus `clip-path`) in the element colours.
- **Prism crack.** `linear-gradient(90deg, #c08cff, #ff7a33, #ffe45c, #7fe0ff)` used as a 1–2 px jagged line (an SVG polyline). Rare by rule.

**Palette with contrast notes**

| Token | Hex | Notes |
|---|---|---|
| plate-0 / 1 / 2 / 3 | `#14111c` `#1c1826` `#262033` `#332b44` | L ≈ 0.006–0.03. Against ground L 0.19–0.36 that is **4.3:1 on water, 5.3:1 on Barrens, 7.3:1 on bright grass**. The violet cast is complementary to green and ochre and analogous to the Rift. |
| void | `#0c0a12` | The outside keyline. Separates the plate edge from dark canopy shadow. |
| enamel / enamel-hi | `#2a2350` `#463a86` | Socket fields. Never used as text colour, because it would be confused with Arcane. |
| bronze-lo / bronze / bronze-hi | `#4e3a24` `#8c6c43` `#c8a874` | Chroma kept low (~35%), so it does not read as the Storm or Fire element. |
| gilt | `#ecd9a6` | 1 px rim, rank pips, focus ring. L 0.70 lifts the frame off dark ground. |
| text / dim / faint | `#f2ece0` `#b9b0c4` `#8a8199` | On plate-1: **16:1 / 8.3:1 / 4.7:1**, all at least AA ([WCAG 2.1 1.4.3](https://www.w3.org/TR/WCAG21/#contrast-minimum)). |
| arcane lo / mid / hi | `#6d3fc0` `#c08cff` `#e6d2ff` | mid on plate-1 ≈ 7.3:1 |
| fire lo / mid / hi | `#b23c0e` `#ff7a33` `#ffd0a8` | mid ≈ 7.0:1 |
| frost lo / mid / hi | `#2b8fb8` `#7fe0ff` `#e2f8ff` | mid ≈ 12:1 |
| storm lo / mid / hi | `#b58d14` `#ffe45c` `#fff7c8` | mid ≈ 14:1 |
| rift-white | `#efe9ff` | Rift Shift flash, Perfect, prism crack core |
| hp / hp-hi / hp-lo / hp-chip | `#e8413a` `#ff8a6a` `#7a1418` `#f6e7d0` | HP is the only red in the chrome. Risk-tag relics take blood-garnet `#b8324a`, because they literally cost HP. |
| **reserved (never decoration)** | magenta `#ff2a6d`, telegraph red-orange | Threat identities from `04-vfx-readability.md`. |

**Frame motifs**
- **Chamfered corners, 6–10 px**, cut at 45°. They echo the facets on rocks and crystals. Tier 1 frames add a **crown point** (a small triangular spike with a bead) at top-centre or at the corners.
- **Sockets.** Skill icons sit in an octagonal bronze bezel over an enamel field. Gems mark element, and empty sockets are visibly empty (enamel only).
- **Rivets** only on Tier 1 frames, 2 per edge max, as 3 px faceted bronze dots. More than that reads as steampunk.
- **Prism crack**, as above. On the boss bar of Aurelith it crawls along the bar's top edge.
- **Shard ticks.** Bars are segmented with tiny chamfered tick notches (HP every 25%, boss bar at the 50% phase line, shown as a crown point).

**Typography.** Grenze / Grenze Gotisch / Alegreya Sans SC / Alegreya Sans (full system in §5).

**Icon style.** Faceted, flat-shaded silhouettes with an engraved ink outline (§4).

**How the elements sit in it.** The chrome is achromatic-cool. Elements appear **only** as gems, enamel tints (≤ 18% over the socket), icon bodies and coloured numbers in effect text. An Arcane gem on rift-iron is analogous; Fire and Storm pop as complements; Frost pops on value.

**Build feasibility (no raster).**
- **Tier 2 plate:** one element with three stacked layers: void (`clip-path` chamfer), `::before` inset 1 px in bronze, `::after` inset 3 px in plate with a hard-stop facet gradient. Content sits at `z-index: 1`.
- **Tier 1 frame:** an **inline-SVG 9-slice `border-image`** (a 48×48 data-URI SVG, `border-image-slice: 16 fill`). It stays crisp at any DPI and carries the crown points and rivets.
- **Gems:** a `clip-path` hexagon or rhombus with a 3-stop `conic-gradient`.
- **Icons:** an inline SVG sprite (§4.6).

### 3.B "Vael Grimoire": an illuminated codex

**Idea.** The UI is the field-grimoire of Vael's mages: vellum leaves, iron-gall ink, **rubrication** (red and blue initials), and gilded capitals for the four Primes.

- **Palette:**

  | Role | Hex |
  |---|---|
  | vellum | `#efe3c2` |
  | vellum-shade | `#d9c79a` |
  | ink | `#2a1d14` |
  | vermilion rubric | `#c8432b` |
  | ultramarine | `#2c4fa3` |
  | gilt | `#d4a640` |
  | verdigris | `#3f8f7a` |

  Contrast problems:
  * Vellum (L ≈ 0.75) on ochre Barrens (L ≈ 0.25) is only ~2.8:1, and their hues are adjacent.
  * Vermilion rubric collides with the **telegraph red-orange** and HP red.
  * The HUD would need ink-black strips anyway, which is direction A by another name.
- **Motifs:** deckled page edges (SVG), drop caps, marginal vines in act colours, and wax-seal tags.
- **Type:**
  * Display: **Texturina** 700 or **IM Fell English SC** 400.
  * Labels: **Alegreya SC** 700.
  * Body: **Alegreya** 500, with old-style figures in prose and `lining-nums tabular-nums` in data.
  * Initials: **Grenze Gotisch**.
- **Icons:** woodcut/engraving style with hatched shading. Lovely at 96 px, but it mushes at 24–32 px (hatching is exactly the "detail that turns to mush" that icon guides warn about: [Wayline](https://www.wayline.io/learn/game-ui-art), [gamineai](https://gamineai.com/blog/creating-game-icons-and-logos-design-principles-game-branding)).
- **Verdict:** excellent for the **Codex and Sanctum menus** as a sub-theme (pages *inside* the Crownforge frame), but a poor fit for an in-run HUD on bright ground. It also stays close to the parchment look the user is rejecting.

### 3.C "Waystones": carved runestone

**Idea.** The UI is carved slate standing stones. Chiselled bevels are flat-shaded like the world, and the Prime runes glow in carved channels. Per-act **lichen/moss** accents tint the stone edges (Thornwood green, Barrens dust, Reach moss-blue).

- **Palette:**

  | Role | Hex |
  |---|---|
  | slate-lo | `#171a20` |
  | slate | `#2b3038` |
  | slate-hi | `#4a525e` |
  | chisel highlight | `#c9d2dc` |
  | lichen (Thornwood) | `#7f9a4a` |
  | lichen (Barrens) | `#b08a5a` |
  | lichen (Reach) | `#5f8a8f` |
  | rune glow | element colours |

  Slate L ≈ 0.025 has fine value contrast, but cool grey next to saturated greens reads **drab**, and on the blue Reach the hue opposition is weak.
- **Motifs:** irregular faceted stone outlines (not rectangles), dolmen-style lintels over the skill bar, and rune channels that fill like liquid light for cooldowns.
- **Type:**
  * Display: **Metamorphous** 400 (Romanesque, carved feel) or **Inknut Antiqua** 700 (chunky).
  * Labels: **Alegreya Sans SC** 800.
  * Numbers: **Alegreya Sans** 800.
- **Icons:** debossed monoline runes (3-unit strokes) with element glow. Coherent, but **every icon becomes a line glyph**, so silhouettes converge and skills become hard to tell apart at 32 px.
- **Verdict:** the strongest *world* fit (faceting). It is weaker on lore (it doesn't say "crown"), heavier on screen, and its irregular outlines are fiddly in CSS. **Direction A borrows its facet lighting** as its bevel language.

### 3.D Recommendation: **Crownforge (A)**

| Criterion | A Crownforge | B Grimoire | C Waystones |
|---|---|---|---|
| Fit to the world (sunny, faceted low-poly, chunky) | ●●●○ (facets, chunky bezels) | ●●○○ | ●●●● |
| Fit to the lore (Riftcrown, four Primes, Rift) | ●●●● (sockets = Primes, prism crack = crown) | ●●○○ | ●●○○ |
| Readability on all 3 grounds | ●●●● (dark, cool, complementary to green and ochre) | ●○○○ | ●●●○ |
| Crispness at 1280×720 and 1920×1080 | ●●●● (flat facets, 1 px rims, SVG 9-slice) | ●●○○ (hatching) | ●●●○ |
| Pure CSS + inline SVG feasibility | ●●●● | ●●●○ | ●●○○ (irregular outlines) |
| Distance from "AI default fantasy" | ●●●○ | ●○○○ (parchment again) | ●●●○ |

**Pick A.** It is the only direction where the frame *means* something in the game's fiction. You literally slot Primes into the shattered crown, and fusions crack it with prism light. It is also the best performer on bright, busy ground. Use **B's vellum as an inner page** for the Codex and **C's facet lighting** as A's bevel recipe.

### 3.E Applying Crownforge to the Riftbound HUD

| Element | Spec |
|---|---|
| **Skill bar** (bottom-centre, Tier 1) | 5 octagonal sockets. LMB is 64 px and the rest 52 px at 1080p. Sockets sit on one chamfered plate with **bronze end caps shaped as crown points**. Key caps are small bronze tabs *below* each socket (Alegreya Sans SC 700, 12 px). Cooldown: a dark `conic-gradient` sweep over the icon, plus the remaining seconds (Alegreya Sans 800, 20 px, tabular) only while ≥ 1 s. Ready: a 180 ms gilt glint sweep across the bezel. **Auto skills** are **round** gems on the left of the bar (shape tells active from auto). |
| **HP** | A wide bar (≈ 420 px) directly under the skill plate, in an enamel trough, with ticks every 25%. Shield sits **over** it as pale plating (`#d9ecff`, hatched with a 45° repeating-linear-gradient). Damage chip: the lost segment stays `--hp-chip` for 400 ms, then drains over 250 ms. HP number centred in the bar (`142 / 180`, tabular). Below 30% the trough pulses `--hp-lo` (in sync with the grade-pass red edge). |
| **XP** | A 4 px band along the top edge of the skill plate, coloured to match the in-world XP gem (default token `--xp: #9ff0d2`; keep it distinct from Frost cyan). |
| **Dash pips** | Rhombus gems to the right of HP, gilt when full and enamel when empty. The Stormcaller's 2 charges are 2 pips. |
| **Trait meter** | A thin arc or bar in the class's element colour on the left of HP. Chain-based traits show the number. |
| **Chain ×N** | Tier 3, **frameless**: Grenze 800 at 44 px with a 2 px void text outline. The colour is the element of the last reaction. Milestones 10/25/50 add a crown point above. |
| **Act bar** (top-centre) | Three chamfered segments in act colours at 60% chroma, with boss markers as small crown glyphs (not skulls). The current segment fills, and the timer sits frameless beneath it (Alegreya Sans 800, 22 px, tabular). |
| **Boss bar** (top-centre, Tier 1) | A wide enamel trough. Nameplate above it: the boss name in **Grenze 700, 26 px**, with its epithet in Alegreya Sans SC 14 px. Phase line at 50% is a crown point. **Prism Ward** is a gem socket at the bar's left end that shows the warded element, and the crack sweeps when the ward breaks. |
| **Relic tray** (top-left, Tier 2) | 28 px object icons in a 2-row grid on one plate. A tag sigil in the corner of each, 8 px. |
| **Shrine arrow** | A faceted bronze arrow with the shrine's element gem. |

### 3.F Level-up and relic cards (shape = type, colour = element)

| Card type | Frame shape | Ornament |
|---|---|---|
| New skill | chamfered rectangle | element gem at top-centre, rank pips 0/5 |
| Rank-up | same | the existing pips fill and the new pip glints |
| **Fusion** | **double-notched** (notches at the mid-sides) | **prism crack** across the top. Both parent icons appear as small sockets in the notches, and the fusion icon sits large in the centre. Always first in the row. |
| Passive | **round medallion** | engraved sigil, rank pips |
| Filler (Rift Essence) | plain plate, no gem | — |
| Relic | **plinth** (trapezoid base) | object icon, with the **tag sigil stamped into the plinth** (e.g. reaction = two linked rings, risk = cracked rhombus, dodge = chevron, economy = shard, cast = 4-point star, safety = ward shield, element tags = that element's gem) |

---

## 4. Icon language (about 85 icons)

### 4.1 Inventory

| Set | Count | Notes |
|---|---|---|
| Elements | 4 | Faceted Prime gems: Arcane rhombus, Fire flame-cut gem, Frost hexagon, Storm bolt-cut gem. **Shape differs per element**, for colour-blind support. |
| Statuses | 7 | Burn, Chill, Frozen, Shock, Stun, Prism Ward, Barrier |
| Reactions | 6 | Steam Burst, Overload, Superconduct, Shatter, Combust, Arc Flash. Each is the two element gem *shapes* colliding. |
| Skills | 12 | 4 starters + 8 shared |
| Fusions | 10 | — |
| Passives | 9 | — |
| Relics | 18 | — |
| Class sigils | 4 | Each class = one **point of the Riftcrown** with its Prime gem |
| Meta / attunements | 6 | Currently ⚔ ♥ ◈ ⌛ ⟳ ⊘ in `meta.js` |
| UI glyphs | ~10 | reroll, banish, lock, close, Rift Shard, Rift Crystal, shrine, boss marker, chest, chain |

### 4.2 Grid and sizes
- **Author on `viewBox="0 0 48 48"`** with a **40-unit live area** (4-unit margin). Optical overshoot to 2 units is allowed for spikes.
- Display sizes: **24** (relic tray, buffs, statuses at 720p), **32** (cards, statuses at 1080p), **48–64** (skill sockets), **96** (card hero, Codex). They are integer multiples of the grid at 24, 48 and 96, so edges land on pixels.
- **Statuses and UI glyphs** use a separate **`viewBox="0 0 24 24"`** grid with 20 units live, because they are shown at 16–20 px.

### 4.3 Construction rules
1. **Filled silhouettes, not line icons.** Line icons look like web UI.
2. **Three flat tones + ink**: `lo` (shadow plane), `mid` (body), `hi` (lit plane), plus a **2-unit ink outline** drawn *under* the fill (`stroke: var(--ink); stroke-width: 2; paint-order: stroke; stroke-linejoin: round`). Overlapping shapes keep their own outlines, which gives the **engraved "cut" lines** between planes for free.
3. **Faceted, not smooth.** Highlights are polygons (flat-shaded planes), lit from the **upper-left**, always. No gradients and no SVG filters inside icons (they blur at small sizes and cost per frame).
4. **Minimum feature size 3 units** (≈ 1.5 px at 24 px). Nothing thinner than the outline.
5. **One idea per icon**, filling 60–75% of the live area. Pass the **black-fill test**: filled solid, it still reads ([madegooddesigns](https://madegooddesigns.com/?p=5494), [gamineai](https://gamineai.com/blog/creating-game-icons-and-logos-design-principles-game-branding)).
6. **The silhouette type tells you the category:**
   * **Skills = energy**, with direction encoded:
     * projectiles fly **lower-left → upper-right at 45°**;
     * novas and auras are **radial**, centred;
     * ground-targeted spells (Meteor, Blizzard, Singularity) show an **ellipse ground plane** at the bottom.
   * **Fusions** = parent A's silhouette with parent B's cut into it. The prism crack goes on the *card frame*, not in the icon.
   * **Relics = physical objects** (coil, lens, ring, boots, lantern) in **bronze tri-tone** with one **accent** in the tag colour.
   * **Passives = engraved sigils**: monoline 4-unit marks on a round bronze token.
   * **Statuses = single-tone pictograms** in element mid + ink outline. No hi/lo at 16 px.
7. **Element colour comes from CSS custom properties** (`--el`, `--el-lo`, `--el-hi`, `--ink`, `--metal*`) with hex fallbacks. Custom properties **inherit through `<use>`**, so one sprite symbol can be tinted per instance.
8. **States are done in CSS, not in separate icons:**
   * on cooldown: `filter: saturate(.25) brightness(.7)` plus the conic overlay;
   * locked: enamel silhouette only (`--el*` all set to `--cf-enamel-hi`);
   * new: gilt glint.
9. **Avoid:**
   * text or numerals inside icons;
   * perspective/3D (except the ground ellipse);
   * more than 3 tones + ink;
   * drop shadows inside the SVG;
   * magenta and telegraph red-orange;
   * outline-only shapes;
   * repeating a silhouette across two skills (for example, Frost Nova and Blizzard must differ: radial burst vs. cloud over a ground ellipse).

### 4.4 Element application per Prime

| Prime | Gem shape (also used in reactions and tags) | lo / mid / hi |
|---|---|---|
| Arcane | elongated rhombus | `#6d3fc0` / `#c08cff` / `#e6d2ff` |
| Fire | teardrop flame-cut | `#b23c0e` / `#ff7a33` / `#ffd0a8` |
| Frost | hexagon | `#2b8fb8` / `#7fe0ff` / `#e2f8ff` |
| Storm | bolt-cut (zig-zag) pentagon | `#b58d14` / `#ffe45c` / `#fff7c8` |

### 4.5 Exemplars
Three icons follow: **Fireball** (projectile skill), **Frost Nova** (radial skill) and **Alchemist's Coil** (relic object, reaction tag). Full code is in Appendix B.

### 4.6 Delivery (no build step)
- `src/ui/icons.js` exports `ICONS = { fireball: '<symbol id="i-fireball" viewBox="0 0 48 48">…</symbol>', … }` and injects one hidden `<svg>` sprite at boot.
- Markup: `<svg class="ico" data-el="fire"><use href="#i-fireball"/></svg>`.
- Data files swap `icon: '🔥'` for `icon: 'fireball'` (an id), and `hud.js` / `menus.js` render through a single `iconSVG(id, el)` helper.
- Prefix internal ids per icon (`i-frostnova-k`) to avoid collisions in one document.

---

## 5. Typography system

All families were verified on the Google Fonts css2 API on 2026-10-09: Grenze (400–800), Grenze Gotisch (500, 700), Alegreya Sans (400–800), Alegreya Sans SC (500–800). Grenze is an OFL roman/blackletter hybrid by Omnibus-Type in nine weights, designed to "combine the texture of blackletter with the readability of classical forms" ([Pimp my Type](https://pimpmytype.com/grenze/), [Google Fonts](https://fonts.google.com/specimen/Grenze/about), [Grenze Gotisch review](https://www.sessions.edu/notes-on-design/free-font-friday-grenze-gotisch/)). Its angular cuts look *forged*, which fits crown-bronze. Alegreya Sans is a humanist sans with calligraphic DNA and true small caps. Its default figures are **proportional lining**, with tabular and old-style available ([CTAN Alegreya README](https://tex.org.uk/fonts/alegreya/README), [TUG catalogue](https://tug.org/FontCatalogue/alegreyasans)).

```html
<link href="https://fonts.googleapis.com/css2?family=Grenze:wght@600;700;800&family=Grenze+Gotisch:wght@700&family=Alegreya+Sans+SC:wght@700;800&family=Alegreya+Sans:ital,wght@0,500;0,700;0,800;1,500&display=swap" rel="stylesheet">
```
(This replaces the Cinzel / Cinzel Decorative / Inter link in `index.html`.)

### 5.1 Roles

| Role | Family / weight | 1080p | 720p floor | Tracking | Case | Use |
|---|---|---|---|---|---|---|
| **Hero** | Grenze Gotisch 700 | 64–96 px | 44 px | 0 | Title | Act card ("The Thornwood"), boss intro name, title wordmark, VICTORY. **Never below 32 px.** |
| **Heading** | Grenze 700 (800 for the Chain counter) | 22–40 px | 18 px | +0.01em | Title case | Modal titles, card names, boss nameplate, Sanctum section heads |
| **Label** | Alegreya Sans SC 700 (800 on plates) | 13–15 px | 12 px | +0.06em | type lowercase and let the SC face do the caps | Key caps, tags, stat names, "RANK", "COOLDOWN", tab names |
| **Body** | Alegreya Sans 500; emphasis 700 | 16–18 px | 14 px | 0 | Sentence | Effect lines, tooltips, Codex. `line-height: 1.3`, max ~46ch |
| **Numbers** | Alegreya Sans 800, `font-variant-numeric: lining-nums tabular-nums` | HP 18, timer 22, cooldown 20, stat 16, Chain 44 (Grenze 800) | 14 / 16 / 15 / 13 / 32 | +0.02em | — | Everything that counts down or changes each frame |
| **Flavour** (Codex only) | Alegreya Sans 500 italic | 15 px | 13 px | 0 | Sentence | One line, `--cf-text-dim` |

### 5.2 Rules
- **Scale frames, floor text.** Keep the existing `--menu-u` idea (10 px at 720p, 15 px at 1080p) for frames and spacing. Text sizes use `clamp(<720p floor>, <scaled>, <max>)`, so labels never drop below 12 px and body never below 14 px. Linear scaling would put 16 px body at 10.7 px on 1280×720. Xbox's XAG 101 measures text by full body height and treats text inside icons as subject to the same minimums ([XAG 101](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101)).
- **Numeral legibility.** Alegreya Sans 800 at 12–14 px keeps open 3/6/9 apertures and a flagged 1 that doesn't read as 7. Use **tabular figures** so timers and cooldowns don't jitter. **Don't use Grenze for numbers below 20 px**: its angular cuts make 3/8 and 5/6 cluster at small sizes. Avoid Grenze Gotisch for any number.
- **Outline on world-facing text** (Chain, PERFECT, timer, damage pop-ups if they are DOM): use `-webkit-text-stroke: 4px #0c0a12; paint-order: stroke fill;`. This is the technique already used in `04-vfx-readability.md`, and it gives a clean 2 px outline.
- **Colour in text.** Key numbers in effect lines take the element `mid` colour. Keywords (Burn, Chill, Shock, reaction names) take the element colour plus a tiny inline gem shape. Never more than 2 coloured runs per line.
- **Rejected:**
  * **Cinzel / Cinzel Decorative / Marcellus SC:** Trajan-default "epic" (tell #5).
  * **Cormorant SC:** hairlines vanish at 720p.
  * **IM Fell:** rough, one weight, texture noise at small size.
  * **Uncial Antiqua:** Celtic, wrong culture, weak numbers.
  * **Pirata One:** reads "pirate".
  * **Macondo / Eagle Lake / Fondamento / Almendra:** whimsical or calligraphic and slow to read mid-fight.
  * **Philosopher:** reads sci-fi.
  * **Amarante:** art-nouveau.
  * **Spectral SC:** bookish and cool, fine for B.
  * **Strong alternates:** **Eczar** 700/800 (if Grenze feels too gothic) and **Inknut Antiqua** 700 (chunkier, more Torchlight).

---

## 6. Motion that feels authored

**Easing tokens**
```css
--ease-forge: cubic-bezier(.2, .8, .2, 1);     /* metal settling: fast in, long settle */
--ease-stamp: cubic-bezier(.34, 1.56, .64, 1); /* small overshoot: seals, pips, Chain bumps */
--ease-rift:  cubic-bezier(.7, 0, .84, 0);     /* rift pull: slow start, snap (exits, Rift Shift) */
```

**Rules**
1. **One hero motion per moment.** Everything else is a quiet fade. Juice is "maximum output for minimum input" ([Game Developer on Jonasson & Purho](https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-), [summary](https://rpgplayground.com/research-making-a-juicy-game/)).
2. **Metal stamps, light wipes.** Bronze and iron elements arrive with scale + `--ease-stamp`. Rift and prism elements reveal with `clip-path` wipes and a gilt or rift-white leading edge.
3. **Animate only** `transform`, `opacity`, `clip-path` and `filter: brightness()` (on ≤ 5 nodes).
4. Modal intro **≤ 450 ms** to interactive. **Input lock 250 ms** on level-up and relic cards, so a held click from combat cannot pick a card.
5. Stagger ≤ 60 ms. Nothing that blocks the arena centre during play lasts more than 300 ms.
6. Under `prefers-reduced-motion` or Shake = Off, translate/scale become 120 ms opacity and glints become a static rim highlight.

| Moment | Sequence (ms from trigger) |
|---|---|
| **Level-up** | 0: world dims (vignette to 0.55, 140 ms forge). 0–160: banner "The Rift offers" + "Level 7" (Grenze 700) **stamps** in, scale 1.12 → 1. 80/140/200: cards **deal up** from +28 px, rotate −2° → 0, 220 ms forge each, staggered 60 ms. 420: one gilt glint sweeps across each card rim (320 ms). Fusion cards' prism crack draws itself left → right (`clip-path`, 380 ms). Hover: lift −4 px, gem brightness 1.25, 120 ms. **Pick:** the chosen card scales to 1.05 (90 ms stamp), its icon **flies to its skill socket** (FLIP, 360 ms forge), the socket bezel does a 1.12 → 1 seat (140 ms stamp), and the other cards drop +16 px and fade (180 ms). |
| **Relic chest** | 0: chest light (rift-white radial in CSS) blooms 200 ms. 120–360: 3 relics rise onto their plinths (+24 px → 0, staggered 60 ms), each object icon scales .7 → 1 with a tag-colour flash on its gem (stamp). **Pick:** the relic arcs to the top-left tray (Bézier path via `offset-path` or a JS-driven transform, 450 ms forge, with a 3-dot trail). The tray slot seats with a 1.15 → 1 stamp and the tag sigil glints. |
| **Boss intro** (≤ 1.6 s, the game keeps running or slow-mo, per design) | 0: letterbox bars slide in 6% (240 ms forge). 200: the boss name **wipes in** left → right (Grenze Gotisch, `clip-path`, 420 ms) with a gilt leading edge. 520: the epithet fades up (Alegreya Sans SC, 200 ms). 700: the boss bar trough appears and the **fill sweeps 0 → 100%** (700 ms forge), with tick sounds at the 25% marks. 1400: the letterbox leaves (240 ms rift). For Aurelith, the prism crack races along the bar edge at 900 ms. |
| **Act card** (inside the 2.5 s Rift Shift) | 0: the act numeral "II" stamps (Grenze Gotisch, 1.3 → 1, 180 ms stamp). 120: an act-colour hairline grows from the centre outward (400 ms forge). 200: "The Sunscorch Barrens" wipes in (500 ms). Hold until 1900. Exit 2000–2300: lift −12 px + fade (rift easing). |
| **Chain** | Each +1: scale 1 → 1.18 → 1 (140 ms stamp) and a colour swap to the reaction element. At 10/25/50: a crown point pops above it (stamp) and a single ring pulse 260 ms. No bump when the Chain resets; just a 200 ms fade to dim. |
| **Perfect Dodge** | "PERFECT" in Grenze 800 with a rift-white rim. Scale 1.25 → 1 within the 0.35 s slow-mo, then a 300 ms fade. |
| **Skill ready** | A gilt glint across the bezel, 180 ms, once. Never loop. |
| **Low HP** | The HP trough pulses at 1.2 Hz, synchronised with the grade-pass red edge. Stops above 30%. |

---

## Appendix A: Crownforge tokens

```css
:root {
  /* rift-iron plates (cool, violet-cast near-black) */
  --cf-void:     #0c0a12;   /* outer keyline */
  --cf-plate-0:  #14111c;
  --cf-plate-1:  #1c1826;
  --cf-plate-2:  #262033;   /* lit facet */
  --cf-plate-3:  #332b44;   /* raised / hover facet */
  --cf-plate-a:  0.95;      /* plate opacity */

  /* rift enamel (socket fields; never text) */
  --cf-enamel:    #2a2350;
  --cf-enamel-hi: #463a86;

  /* crown-bronze (low chroma so it never reads as Storm or Fire) */
  --cf-bronze-lo: #4e3a24;
  --cf-bronze:    #8c6c43;
  --cf-bronze-hi: #c8a874;
  --cf-gilt:      #ecd9a6;  /* 1px inner rim, pips, focus ring */

  /* text */
  --cf-text:  #f2ece0;
  --cf-dim:   #b9b0c4;
  --cf-faint: #8a8199;

  /* the four Primes: lo / mid / hi */
  --arcane-lo: #6d3fc0; --arcane: #c08cff; --arcane-hi: #e6d2ff;
  --fire-lo:   #b23c0e; --fire:   #ff7a33; --fire-hi:   #ffd0a8;
  --frost-lo:  #2b8fb8; --frost:  #7fe0ff; --frost-hi:  #e2f8ff;
  --storm-lo:  #b58d14; --storm:  #ffe45c; --storm-hi:  #fff7c8;

  --rift-white: #efe9ff;
  --prism: linear-gradient(90deg, var(--arcane), var(--fire) 33%, var(--storm) 66%, var(--frost));

  /* acts (used only on the act bar and act-card hairline, at about 60% chroma in chrome) */
  --act-thornwood: #9be15d;
  --act-barrens:   #ffa04a;
  --act-reach:     #7fd4ff;

  /* meters */
  --hp:      #e8413a; --hp-hi: #ff8a6a; --hp-lo: #7a1418; --hp-chip: #f6e7d0;
  --shield:  #d9ecff;
  --xp:      #9ff0d2;   /* match the in-world XP gem; keep it off Frost cyan */
  --risk:    #b8324a;   /* risk-tag relics */

  /* reserved threat identities: NEVER decoration */
  --threat-shot: #ff2a6d;  /* enemy projectiles (04-vfx-readability) */
  /* telegraph red-orange lives in the decal shader */

  /* icon defaults */
  --ink:       var(--cf-void);
  --metal-lo:  var(--cf-bronze-lo);
  --metal:     var(--cf-bronze);
  --metal-hi:  var(--cf-bronze-hi);
  --glass:     #1b2030;

  /* type */
  --font-hero:  'Grenze Gotisch', 'Grenze', serif;
  --font-head:  'Grenze', Georgia, serif;
  --font-label: 'Alegreya Sans SC', 'Alegreya Sans', sans-serif;
  --font-body:  'Alegreya Sans', system-ui, sans-serif;

  /* motion */
  --ease-forge: cubic-bezier(.2, .8, .2, 1);
  --ease-stamp: cubic-bezier(.34, 1.56, .64, 1);
  --ease-rift:  cubic-bezier(.7, 0, .84, 0);
}

/* per-element binding for icons, gems, sockets */
[data-el="arcane"] { --el: var(--arcane); --el-lo: var(--arcane-lo); --el-hi: var(--arcane-hi); }
[data-el="fire"]   { --el: var(--fire);   --el-lo: var(--fire-lo);   --el-hi: var(--fire-hi); }
[data-el="frost"]  { --el: var(--frost);  --el-lo: var(--frost-lo);  --el-hi: var(--frost-hi); }
[data-el="storm"]  { --el: var(--storm);  --el-lo: var(--storm-lo);  --el-hi: var(--storm-hi); }

.num { font-family: var(--font-body); font-weight: 800; font-variant-numeric: lining-nums tabular-nums; }

/* Tier-2 plate: void keyline > bronze bezel > faceted iron, all chamfered */
.cf-plate {
  --c: 8px;
  --cut: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% calc(100% - var(--c)),
                 calc(100% - var(--c)) 100%, var(--c) 100%, 0 calc(100% - var(--c)), 0 var(--c));
  position: relative; isolation: isolate;
  background: var(--cf-void); clip-path: var(--cut);
}
.cf-plate::before, .cf-plate::after { content: ""; position: absolute; clip-path: var(--cut); z-index: -1; }
.cf-plate::before { inset: 1px; background: linear-gradient(135deg, var(--cf-bronze-hi), var(--cf-bronze) 30%, var(--cf-bronze-lo)); }
.cf-plate::after  { inset: 3px; background: linear-gradient(160deg, var(--cf-plate-2) 0 36%, var(--cf-plate-1) 36% 100%); } /* hard stop = flat facet */
```

## Appendix B: Exemplar icons

All three use the 48-unit grid, 3 flat tones + a 2-unit ink outline under the fill, light from the upper-left, and colours from custom properties with fallbacks.

### B.1 Fireball (skill, projectile: lower-left → upper-right)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
  <g style="stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke">
    <!-- outer flame (shadow plane): jagged tongues along both tail edges -->
    <path style="fill:var(--el-lo,#b23c0e)"
          d="M5 43 L15 30 L12 29 L20 21 Q22 9 34 7 Q43 7 42 17 Q41 27 28 31 L27 28 L17 37 L18 33 Z"/>
    <!-- body (mid) -->
    <path style="fill:var(--el,#ff7a33)"
          d="M12 37 L20 28 L18 27 L23 22 Q25 12 34 11 Q39 11 38 18 Q37 25 28 27 L27 25 Z"/>
    <!-- lit facet of the core (hi): a flat plane, not a gradient -->
    <path style="fill:var(--el-hi,#ffd0a8)" d="M26 21 L28 14 L35 13 L36 18 L31 23 Z"/>
  </g>
  <!-- two embers flung off the tail -->
  <g style="fill:var(--el,#ff7a33);stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke">
    <path d="M8 26 l3 -2 l1 3 l-3 2 Z"/>
    <path d="M23 40 l3 -2 l1 3 l-3 2 Z"/>
  </g>
</svg>
```

### B.2 Frost Nova (skill, radial: hex symmetry, spikes through a broken shock ring)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
  <defs>
    <!-- one spike: full kite in mid with ink, then its lit left half in hi -->
    <g id="i-frostnova-k">
      <path style="fill:var(--el,#7fe0ff);stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke"
            d="M24 5 L27.5 15 L24 19 L20.5 15 Z"/>
      <path style="fill:var(--el-hi,#e2f8ff)" d="M24 6.5 L24 18 L21.3 15 Z"/>
    </g>
  </defs>
  <!-- shock ring: 6 arcs, gaps centred on the spikes (period 60 deg). Ink pass is 1 unit longer per end. -->
  <g transform="rotate(-82.5 24 24)" fill="none">
    <circle cx="24" cy="24" r="19" style="stroke:var(--ink,#0c0a12);stroke-width:5.5;stroke-dasharray:16.9 3;stroke-dashoffset:1"/>
    <circle cx="24" cy="24" r="19" style="stroke:var(--el-lo,#2b8fb8);stroke-width:3;stroke-dasharray:14.9 5"/>
  </g>
  <!-- six spikes -->
  <use href="#i-frostnova-k"/>
  <use href="#i-frostnova-k" transform="rotate(60 24 24)"/>
  <use href="#i-frostnova-k" transform="rotate(120 24 24)"/>
  <use href="#i-frostnova-k" transform="rotate(180 24 24)"/>
  <use href="#i-frostnova-k" transform="rotate(240 24 24)"/>
  <use href="#i-frostnova-k" transform="rotate(300 24 24)"/>
  <!-- hexagonal core: lit (hi) with a mid lower-right facet -->
  <polygon style="fill:var(--el-hi,#e2f8ff);stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke"
           points="24,18 29.2,21 29.2,27 24,30 18.8,27 18.8,21"/>
  <polygon style="fill:var(--el,#7fe0ff)" points="24,24 29.2,21 29.2,27 24,30"/>
</svg>
```

### B.3 Alchemist's Coil (relic, object: bronze coil around a vial where two Primes react)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
  <g style="stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke">
    <!-- coil, back strand (behind the vial): shadow bronze -->
    <path style="fill:var(--metal-lo,#4e3a24)" d="M38 16 L10 24 L10 27.5 L38 19.5 Z"/>
    <!-- glass vial -->
    <rect x="18" y="9" width="12" height="31" rx="5" style="fill:var(--glass,#1b2030)"/>
  </g>
  <!-- reagent: frost above, fire below, meeting at a zig-zag seam (= a reaction) -->
  <path style="fill:var(--frost,#7fe0ff)" d="M19.5 18 L28.5 18 L28.5 25 L26.25 23.5 L24 25 L21.75 23.5 L19.5 25 Z"/>
  <path style="fill:var(--fire,#ff7a33)"  d="M19.5 25 L21.75 23.5 L24 25 L26.25 23.5 L28.5 25 L28.5 35 Q28.5 38.5 24 38.5 Q19.5 38.5 19.5 35 Z"/>
  <!-- the reaction spark at the seam -->
  <path style="fill:var(--rift-white,#efe9ff);stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke"
        d="M24 20 L25.2 23 L28 24.2 L25.2 25.4 L24 28.4 L22.8 25.4 L20 24.2 L22.8 23 Z"/>
  <g style="stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke">
    <!-- coil, front strands: mid bronze -->
    <path style="fill:var(--metal,#8c6c43)" d="M10 8 L38 16 L38 19.5 L10 11.5 Z"/>
    <path style="fill:var(--metal,#8c6c43)" d="M10 24 L38 32 L38 35.5 L10 27.5 Z"/>
    <!-- stopper and foot -->
    <path style="fill:var(--metal,#8c6c43)" d="M19.5 9 L20.5 5 L27.5 5 L28.5 9 Z"/>
    <path style="fill:var(--metal,#8c6c43)" d="M15 40 L33 40 L36 44 L12 44 Z"/>
  </g>
  <!-- lit planes (upper edge of each front strand, top of the foot): hi bronze, no stroke -->
  <g style="fill:var(--metal-hi,#c8a874)">
    <path d="M10 8 L38 16 L38 17.5 L10 9.5 Z"/>
    <path d="M10 24 L38 32 L38 33.5 L10 25.5 Z"/>
    <path d="M15 40 L33 40 L33.9 41.5 L14.1 41.5 Z"/>
    <path d="M20.5 5 L24 5 L23.6 9 L19.5 9 Z"/>
  </g>
</svg>
```

> **Verification still to do (in the browser pane, when free):** render all three at 24/32/48/96 px on the three ground colours and on `--cf-plate-1`. Run the black-fill test, and check that the Frost Nova ring gaps line up with the spikes and the coil reads as wrapping the vial at 24 px. If the coil mushes at 24 px, drop the back strand.

## Sources
- AI-slop tells: [ux-skill wiki](https://github.com/Laith0003/ux-skill/wiki/How-to-detect-AI-slop-in-your-design) · [noqta](https://noqta.tn/blog/ai-design-slop-overused-ui-patterns-fix-2026) · [vp0](https://vp0.com/blogs/why-does-my-ai-app-look-generic)
- Hades: [Supergiant UI illustrator post](https://www.supergiantgames.com/blog/job-opportunity-ui-illustrator-for-hades-ii) · [UI animator post](https://www.workwithindies.com/careers/supergiant-games-ui-animator-hades-ii) · [font notes](https://madegooddesigns.com/hades-font/) · [IGDA awards](https://www.videogameschronicle.com/news/hades-wins-9-times-at-the-igda-global-industry-game-awards/) · [rarity summary](https://deltiasgaming.com/?p=357537)
- Diablo IV: [RPG Site](https://www.rpgsite.net/news/9492-diablo-iv-discusses-ui-design-coop-controller-support-and-cannibals-in-first-quarterly-update) · [Blizzard Feb 2020](https://news.blizzard.com/en-us/article/23308274/diablo-iv-quarterly-updatefebruary-2020) · [late-2020 summary](https://blizzplanet.substack.com/p/diablo-iv-last-2020-quarterly-update)
- Slay the Spire: [card wiki](https://slaythespire.wiki.gg/wiki/Card)
- Hollow Knight: [TrueAchievements](https://www.trueachievements.com/game/Hollow-Knight/walkthrough/2) · [Mechanics of Magic](https://mechanicsofmagic.com/2022/04/20/visual-design-of-games-59/) · [minimal-HUD study](https://bonndoc.ulb.uni-bonn.de/xmlui/handle/20.500.11811/14207?show=full)
- Darkest Dungeon: [designbeep](https://designbeep.com/2026/01/22/darkest-dungeon-font/)
- Tunic: [GameSpot](https://gamespot.com/articles/how-tunics-cool-in-game-manual-was-made/1100-6507719/) · [Game Developer](https://www.gamedeveloper.com/road-to-igf-2023/how-tunic-weaves-wondrous-unknowable-worlds-inspired-by-inscrutable-nes-manuals)
- Death's Door: [Stevivor interview](https://stevivor.com/features/interviews/acid-nerve-talks-deaths-door-interview/)
- Halls of Torment: [Rogueliker](https://rogueliker.com/halls-of-torment-review/)
- Last Epoch: [forum](https://forum.lastepoch.com/t/feedback-corner-the-user-interface/10889) · [wiki](https://lastepoch.fandom.com/wiki/File:SkillsWindow.png)
- Ravenswatch: [Passtech](https://www.passtechgames.com/?p=4496)
- References database: [Game UI Database](https://www.gameuidatabase.com/) · [80.lv](https://80.lv/articles/game-ui-database-collecting-references-to-inspire-designers/)
- Type: [Grenze — Pimp my Type](https://pimpmytype.com/grenze/) · [Google Fonts Grenze](https://fonts.google.com/specimen/Grenze/about) · [Grenze Gotisch](https://www.sessions.edu/notes-on-design/free-font-friday-grenze-gotisch/) · [Alegreya README](https://tex.org.uk/fonts/alegreya/README) · [Alegreya Sans, TUG](https://tug.org/FontCatalogue/alegreyasans) · [Google Fonts css2 API](https://fonts.googleapis.com/css2?family=Grenze:wght@400;600;700;800&family=Alegreya+Sans+SC:wght@500;700;800&family=Alegreya+Sans:wght@400;500;700;800)
- Accessibility: [Xbox XAG 101](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/101) · [WCAG 2.1 1.4.3](https://www.w3.org/TR/WCAG21/#contrast-minimum)
- Icons: [madegooddesigns](https://madegooddesigns.com/?p=5494) · [Wayline](https://www.wayline.io/learn/game-ui-art) · [gamineai](https://gamineai.com/blog/creating-game-icons-and-logos-design-principles-game-branding)
- Juice: [Game Developer](https://www.gamedeveloper.com/design/video-is-your-game-juicy-enough-) · [RPG Playground](https://rpgplayground.com/research-making-a-juicy-game/) · [Kenney's list](https://kenney.nl/learn/must-see-videos-for-indie-developers)
- Project: `DESIGN.md` §1–3, §5–8, §11 · `design/research/04-vfx-readability.md` (ground values, threat colours, text-stroke recipe)
