# Riftbound — UI Design Passes (v2.1 "Walnut & Brass" → v3 UI)

Same method as `PASSES.md`: each pass takes one subject, critiques, decides, overrules earlier passes when needed, and **cuts** something. The result is locked in `design/UI.md` (spec + contracts for implementers).

Research inputs: `design/research/05-ui-art-direction.md`, `06-ui-tech.md`, `07-hud-information-design.md`.

---

## Pass 0 — Audit of v2.1 (baseline)

Captured in the browser pane at 800×450 CSS px (scaled pane) and read the code (`src/ui/*`, `css/ui.css` 2.4k lines, `css/menus.css` 1.1k lines). Backup: `backup/riftbound-v2.1-preui.zip`.

| Area | Verdict |
|---|---|
| Identity | **Generic.** Every surface is the same rounded walnut gradient box with a brass border and an inner gold hairline. Nothing says "Vael", "Rift", "Riftcrown" or "elemental Primes". It could be any fantasy template. |
| Icons | **The single biggest tell.** Unicode/emoji glyphs (🔥 ⚡ ❄ ✦ ⚗ 🩸 🏮 ⚙ ♛ ☁). They render in different fonts per OS, mix flat emoji with line glyphs, and many are reused (❄ = Blizzard *and* Frost Nova, ⚡ = Chain Lightning *and* Tempest, ◈ = Spirit Orbs, Echo Stone, Insight, Aegis). |
| Typography | Cinzel + Inter: the default "fantasy" pairing. Cinzel caps everywhere (headings, buttons, labels, names) so nothing stands out; Inter body feels like a SaaS dashboard. |
| Bottom HUD | **Too big and too fragmented.** Trait panel + long HP bar + XP bar + a separate skill panel stack into a block ~22% of screen height. HP is a 450 px wide bar far from the character. The dash is a text label ("Flame Dash") with a tiny pip. |
| Top HUD | Act timer + 3-segment bar is fine conceptually, but the beats (Elite Surge 1:30, Swarm 2:15) are invisible. The **boss bar is a small sub-panel** under the act bar: a 3-act boss gets the same visual weight as the kill counter. |
| Skill slots | Square boxes with an emoji, small key caps above. Cooldown numbers OK. Rank pips tiny. Fusion status barely visible. Empty slots show "—". |
| Level-up / relic | Parchment cards on a walnut modal. Text-heavy, the icon is a small emoji in a circle. Rank change ("Rank 3") does not show what changes. Modal covers the whole play field. |
| Pause / codex | A form: three brown boxes of rows. Works, but reads like a settings page. |
| Title / Sanctum | Busy: 4 text-heavy class cards, tier chips, a 6-row shop, a codex block, a controls strip and 4 checkboxes all at once. The world behind is nice; the menu does not feel like a place. |
| End screens | Clear but plain: header box + two stat boxes. |
| Bugs seen | Shrine edge-arrow label draws over the skill bar (EDGE_MARGIN ignores the HUD). "Auto-cast ON" label floats unanchored. |

**Diagnosis:** the information is mostly there, but the presentation is a uniform template with emoji icons, so nothing feels authored or of this world, and the hierarchy is flat (everything is a same-weight brown box). The redesign needs (1) a material language that comes from the lore, (2) a real icon set, (3) a typographic system with clear roles, and (4) a HUD hierarchy that puts glance-critical info where the eye already is.

---

## Pass 1 — Identity & material

**Critique.** "Walnut & Brass" is the statistical centre of fantasy UI, and walnut has the same hue as the Act II ground.
**Decisions.** **Crownforge**: the UI is the reliquary of the shattered Riftcrown. Cool violet-black rift-iron plates, chamfered flat facets lit from the upper-left (like the low-poly world), crown-bronze bezel, 1 px void keyline, the four Primes only as gems/enamel. The prism crack is reserved for crown moments. Three frame tiers; most of the HUD is frameless outlined text.
**Overrules.** The v2.1 theme entirely.
**Cut.** Parchment cards, walnut, rounded corners, pills, glow-on-chrome, soft gradients, the inner gold hairline on everything. Vellum "grimoire" pages are cut too (they were only an option for the Codex).

## Pass 2 — Type & scale

**Critique.** Cinzel caps everywhere means nothing leads. Labels are 9–11 px at 720p, and everything is fixed px.
**Decisions.**
- Fonts: Grenze Gotisch for hero type (≥ 32u, never numbers), Grenze for names/titles/buttons, Alegreya Sans SC for labels, Alegreya Sans with tabular figures for body and every number.
- One root unit: 1rem = 12/15/20 px at 720p/1080p/1440p, snapped to device pixels. Authors write `calc(N * var(--u))` in 1080p pixels.
**Cut.** Cinzel, Cinzel Decorative, Inter, growing font sizes (Chain), cooldown decimals.

## Pass 3 — Icons

**Critique.** Emoji and dingbats are the loudest tell, and several are reused across different things.
**Decisions.** About 95 hand-made SVG symbols on a 48 grid, 3 flat tones + ink. The category reads from the silhouette (skills = energy, relics = objects, passives = engraved tokens). Element shapes double as colour-blind encoding: fire flame-cut, frost hexagon, storm bolt-diamond, arcane 4-point star.
**Overrules.** Research 05's arcane rhombus, which clashed with storm's diamond; it becomes the star from research 07.
**Cut.** Status icons (no status UI exists yet), separate small-size variants (the 48 grid with chunky silhouettes covers 24 px).

## Pass 4 — HUD hierarchy & layout

**Critique.** A flat hierarchy: the bottom block is 19%+ of the screen at 720p, HP is far from the eyes, the boss is a small sub-panel, beats are invisible, and centre pills land under the character.
**Decisions.**
- One zone per question: top = time and the enemy, bottom = what you can do, left = what you have, right = what you're achieving.
- A character status cluster: mini HP, dash pips, armor/momentum.
- One compact Tier 1 action bar.
- An act timeline with beat markers and a ribbon.
- A big boss bar with phase notch and ward badge.
- Right-lane Chain, feed and toasts.
- Generalised edge markers with a safe rect.
**Overrules.** Research 05 §3.E put HP under the slots; it goes above the slots instead (research 07).
**Cut.** The trait text panel, the duplicate Frost Armor row, "ACT I · NAME" text, the kills line, the auto-cast text pill, buff names, the centre milestone pill, centre beat announcements, relic hover tooltips during play, auto-skill rank numbers, the full-screen red low-HP tint.

## Pass 5 — Choice screens

**Critique.** Text-heavy parchment cards, a small emoji, "Rank 3" without saying what changes, and flavour delaying the decision.
**Decisions.**
- Icon-dominant cards with a type-shaped frame (fusion is double-notched with the prism crack, passive is a medallion).
- Rank pips shown before → after, and the effect as a delta (changed numbers render `old → new`).
- One synergy line, plus a loadout strip so the build is visible during the choice.
- Keys: 1–3 to pick, F reroll, X banish.
- Relics sit on plinth cards with a tag sigil.
**Cut.** Flavour on relic cards; the "keys 1 2 3" subtitle (the key caps show it).

## Pass 6 — Pause & codex

**Critique.** A form of three boxes. Nothing answers "what can I fuse next?" or "which reactions exist?".
**Decisions.** The Build tab shows the loadout, the element square (4 gems, 6 reactions as edges), fusions in reach, and relics with flavour. The Codex tab has recipe tiles and a relic icon grid.
**Cut.** A full Settings tab (only a small shake/auto-cast row if it fits).

## Pass 7 — Title / Sanctum

**Critique.** It reads as a form: four 6-block class cards, a shop list, checkboxes and a controls strip all at once.
**Decisions.**
- Wordmark, then 4 class medallions plus ONE details panel.
- A tier gem dial, attunement tiles, and Begin Quest as the hero button.
- Shards top-right, a codex tome chip, settings behind a gear popover and controls behind a "?" popover.
- The live world stays visible.
**Cut.** A live 3D class diorama (it needs engine work; the world already renders behind the menu).

## Pass 8 — Motion & juice

**Critique.** The same fade-and-slide everywhere, plus looping glows and colour cycles that repaint every frame.
**Decisions.**
- Two easings, forge (settle) and stamp (overshoot), plus rift (exits). One hero motion per moment.
- Cards deal up with a stagger; titles stamp; the act card is a numeral stamp followed by a hairline wipe.
- The boss name stamps then settles into the bar.
- A skill coming ready gets one gilt glint.
- The Chain ramps white → amber → prism.
- Only `transform` and `opacity` animate, and `prefers-reduced-motion` is honoured.
**Cut.** Looping glows, the rainbow hue cycle above 0.5 Hz, `restartAnim` in hot paths.

## Pass 9 — End screens

**Critique.** Clear but plain: a header box and two stat boxes of pills.
**Decisions.** A hero line in Grenze Gotisch, a counting shard reward, an engraved stat ledger, reactions as element-gem pairs, fusions and relics as icons. The prism crack appears on victory only.
**Cut.** Chip pills, the "Enter: quest again" footer (the key cap goes on the button instead).

**Locked in `design/UI.md`.**
