# 07 — HUD and information design

**Scope.** Riftbound's HUD, level-up and relic screens, pause/build/codex, and the Sanctum title screen. The game has hundreds of enemies on screen, a small character in the centre of a bright sunlit world, and a lot of systems to communicate: act clock and beats, boss phases and wards, four class traits, dash charges, 5 skill slots plus 2 auto skills with ranks and fusions, Chain, reactions, relics, buffs, shrines, Rift Crystals, Perfect Dodge, level-ups with reroll and banish, Rift Tier, attunements and the codex. This document covers what ships today (§1), what reference games do (§2), a ranking of every piece of information (§3), the specs for each zone (§4–§9), accessibility numbers (§10), the full layout spec (§11), the list of things to remove (§12), and implementation notes (§13).

All pixel numbers are at the **1920×1080 reference**. 1280×720 numbers come from the UI scale in §11.1, which is 0.8 at 720p.

---

## 0. TL;DR

1. **Organise the screen by question, one zone per question.**
   * Top: *time and the enemy* (act timeline, boss).
   * Bottom: *what I can do* (HP, dash, skills, buffs).
   * Left edge: *what I have* (relics, objective).
   * Right edge: *what I'm achieving* (Chain, reactions, discoveries).
   * Centre: only the character's own status and world markers. Today Chain, milestones, banners and announcements all land in the playfield around the character, where the telegraphs are.
2. **Put a mini status cluster under the character.** It holds an HP bar (72×7 px), dash pips, Frost Armor pips and the Momentum strip. Every camera-centred horde game does this (Vampire Survivors puts HP under the sprite). It is the only place the eye already is.
3. **Shrink the bottom block from about 180–207 px (25–29% of 720p) to 90 px of core HUD (10% at 720p).** One 600 px action bar has the dash slot plus LMB/RMB/Q/E/R (64 px slots), the auto skills (48 px) and a 352×16 HP bar with a 4 px XP line. Delete the trait text panel and the auto-cast text pill.
4. **Make the boss bar a real boss bar.**
   * 880×20 px, top centre.
   * Name in 28 px Cinzel, with the epithet on a second line.
   * A phase notch at 50%.
   * A **ward badge with a 10 s countdown ring** on the left end. In Act III it tells you which element works.
   * The act timeline collapses to a 28 px strip above it.
5. **Make the act timeline show the beats.** Use one bar for 0:00–3:00 with icons at 1:30 (crown, Elite Surge), 2:15 (ring, Swarm) and 3:00 (skull, Boss), a 32 px timer, and a "SWARM IN 0:08" ribbon in the last 10 s before each beat. Today the three segments are the three *acts*, and the beats don't show at all.
6. **Move Chain to the right lane, merge the reaction feed into it, and add the Arcanist's Resonance meter there.**
   * Chain: 64 px numerals at x≈1556–1896, y≈300.
   * Milestones become a stamp next to the number, not a pill at 64% height under the character.
   * Remove magenta from the Chain colour ramp, because magenta means "hostile".
7. **Move discovery banners off the centre column** into a right-lane toast stack. The centre is reserved for the act title card, the boss intro, PERFECT (0.4 s) and the Rift Shift.
8. **Skill slots.**
   * Clockwise dark sweep.
   * Integer seconds only when ≥ 1 s remains. No decimals, so the LMB number doesn't flicker.
   * A 120 ms white rim flash on ready.
   * Key cap inside the top-left corner, 5 rank pips inside the bottom edge.
   * Fusion slots get a gold double frame. Auto skills get no key and a "proc" pulse instead of a sweep.
9. **Level-up cards are 340×420.** Each has a 112 px element-shaped medallion, a ≤ 20-character name, a **rank before → after pip row**, an effect of ≤ 2 lines and ≤ 56 characters with the deltas in bold, and **one** synergy chip (reaction partner or fusion progress). Show the current loadout strip under the cards. Keys: 1–3 to pick, F to reroll, X to banish.
10. **Encode each element as a colour plus a shape:** fire ▲, frost ⬢, storm ◆ with a bolt, arcane ✦. Measured ΔE under deuteranopia: fire/storm drops from 58 to **22**, frost/arcane from 70 to **27**. UI gold vs storm yellow is **ΔE 11–16 even with normal vision**.
11. **Contrast.** Every coloured HUD text fails over the ground (white on sunlit grass is 2.0:1, on sand 1.6:1). On a walnut plate it is 6.2–16.7:1. Rule: HUD text sits on plates, and world-anchored text gets the 4 px dark stroke from doc 04.
12. **Fonts.** The minimum at the reference is 16 px for labels and 18 px for body text (XAG: 18 px body height on a 1080p PC). That is ≥ 13 px at 720p. Today's 9–11 px labels (key caps, trait, dash name, act sub-line) are about half the minimum.
13. **Persistent HUD budget: ≤ 9% of pixels in normal play and ≤ 12% in a boss fight.** The proposal is 8.5% / 11.5%. Today the bottom block alone is about 17% of a 720p screen.

---

## 1. What ships today (audit)

Read from `src/ui/hud.js`, `hud-fx.js`, `ui.js`, `menus.js`, `src/game/tutorial.js` and `css/ui.css`. All sizes are fixed CSS px with no UI scale, so the HUD covers 2.25× more of the screen, proportionally, at 720p than at 1080p.

| Element | Where / size today | Problem |
|---|---|---|
| Act bar | Top centre, 440 px panel (`.hud-top`), act name 13 px Cinzel, timer 22 px, 3 segments = **3 acts**, sub-line "Lv · kills" 11 px | The beats (1:30 / 2:15 / 3:00) aren't shown. The act name is static text that takes space every frame. Kills are rarely useful. 13 px Cinzel caps are hard to read. |
| Boss bar | Stacked under the act panel inside the same 440 px column. Name 13 px, bar 14 px tall, phase = two 9 px dots, ward = 10 px text pill "WARD · FROST" | The boss bar is the most important thing on screen during a boss fight, and it's the smallest bar in the HUD. The ward, which in Act III decides what damage works, is 10 px text with no countdown. |
| Relic tray | Top-left, 40 px tiles, wrap at 250 px. `pointer-events: auto` with hover tooltips | Fine as a size. **Hover tooltips pop while you aim** into the top-left corner. Stateful relics (Second Wind used, the Overclock 8-cast counter) don't show their state. |
| Buffs | Under the relics. Text pills: icon, name, seconds, bar | They're timers, but they're read as text, far from HP. Name text is redundant with the icon. |
| Chain | `left: 50%+170px; top: 34%`, 34–59 px | It sits **in the playfield**, up and right of the character, where enemies and telegraphs are. The colour ramp goes gold → **magenta** (`#ff3dbb`) at Chain 10–25, which is the hostile-projectile hue (doc 04 §4.3). |
| Chain milestone | Centre, `top: 64%`, 26 px pill | That is **directly under the character**, on top of the ground telegraphs that matter most. |
| Reaction feed | Right edge, `top: 40%`, 20 px text rows | A good place. It's disconnected from Chain, and each row is text only. |
| Announcements / discovery banners | Centre column, `top: max(21%, 200px)` (44 px) and `max(30%, 258px)` (21 px). Banners queued at 3.4 s each | A string of discoveries (first run: reaction + fusion + relic) puts 10 s of banners above the character. |
| Bottom block | `.hud-bottom` 940 px wide, stacked: auto-cast pill (~20 px), trait panel 230 px + HP 28 px + XP 15 px (row ≈ 68 px), skill panel (60 px slots + padding + pip overhang ≈ 89 px), 14 px margin | **About 180–207 px tall**, which is 25–29% of 720p (the orchestrator measured about 22%). The trait panel is mostly static prose ("Burning foes erupt when they fall"). **Frost Armor is shown twice** (`armorRow` in the core and `trPips` in the trait panel). |
| Dash | 168 px box: "SPACE" key, 38 px glyph, dash **name** text 11 px, pips 18×7 | Too wide for a glance item. The name is static. |
| Skill slots | 60 px, key tab 9 px above the slot, cooldown text 16 px with **one decimal** (`s.cd.toFixed(1)`), rank pips 5 px below the slot | The decimals flicker on 0.3 s starter cooldowns. 9 px keys are illegible at 1080p. |
| Autos | 42 px chips, rank as a number | Fine. They're inconsistent with the pip ranks on slots. |
| Shrine marker | Edge arrow, 56 px margin, with a text label | Its clamp rect ignores the HUD, so at the bottom edge **the label overlaps the skill bar**. |
| Level-up cards | Parchment, 74 px emoji icon, name 18 px, tag 10.5 px, description 13.5 px, keys 1–3, reroll/banish buttons | The icon is an emoji (inconsistent weight and colour across platforms). The text is the main read. There's no before → after. The tag text at 10.5 px carries the most important fact (NEW vs RANK). |
| Tutorial panel | Left, `top: 40%`, 330 px | A good place. Keep it. Its `_glow` hooks target `.hud-slots`, `.hud-dash` and `.hud-chain`, so **keep those class names**. |

---

## 2. Reference layouts

**Confidence key.** (S) means the placement is stated in a cited source. (M) means it comes from memory of the shipped game, so check it on [Game UI Database](https://www.gameuidatabase.com/) before quoting it in a pitch. Web sources rarely describe HUD positions, so most rows are (M). Treat the *patterns* as the takeaway, not the exact pixels.

| Game | HP | Resource / ammo | XP | Timer | Skills + cooldowns | Dash | Boss bar | Build summary | Conf. |
|---|---|---|---|---|---|---|---|---|---|
| **Vampire Survivors** | Small red bar **under the sprite** | — | Full-width strip on the **top edge**, "LV n" at the right | Large, top centre, under the XP strip | None (all auto) | — | — | Two rows of small icons at the top-left (weapons, passives) | M; level-up from the [wiki](https://vampire.survivors.wiki/w/Level_up) (S) |
| **Halls of Torment** | Under the character, plus a bar in the HUD | — | Top strip | Top | Mostly auto; abilities as an icon row | — | Top | Icon rows with levels | M (low) |
| **Brotato** | Top-left bar with numbers | Materials (= XP + gold) counter, top-left | Top-left bar under HP | "WAVE n" + countdown, top centre | Auto weapons, none shown | — | — | A separate stats/shop screen between waves | M |
| **20 Minutes Till Dawn** | Hearts, top-left | **Ammo** pips, top-left. Reload is the manual rhythm ([wiki](https://20-minutes-till-dawn.fandom.com/wiki/Ammo)) | Top strip | Top centre | — | Dash | — | Upgrade icons | M |
| **Hades** | Bottom-left bar with numbers + Death Defiance pips | Cast ammo, bottom-left | — | — | Bottom-right: Attack / Special / Cast / Dash / Call buttons **carrying the god emblem of the boon on each** | In the button cluster | Top centre, name + bar | **The boon emblems on the action buttons are the build summary.** Full list on a button press | M; rarity colours ([wiki](https://hades.wiki.fextralife.com/Artemis'+Aid)) |
| **Hades II** | As Hades, + Magick bar under HP | Magick | — | — | As Hades | As Hades | Top | As Hades | M |
| **Diablo IV** | Health globe left of the skill bar | Resource globe right of it | Thin line on the bar | — | 6 slots bottom centre, sweep + optional numbers | Evade on the bar | Top centre; phase breakpoints on the bar, stagger bar under it | Buff row above the skill bar | S: [PureDiablo](https://www.purediablo.com/diablo4/HUD), [Destructoid](https://www.destructoid.com/how-to-change-your-hud-in-diablo-4/) (centred vs left-corner HUD) |
| **Path of Exile 2** | Life globe, bottom-left | Mana globe, bottom-right | Thin strip along the bottom | — | Bottom-right next to mana | Dodge roll on the bar | Top centre, name + bar | Buff icons, top-left | M |
| **Last Epoch** | Orb left of a centred 5-slot bar | Mana orb right | Line above the bar | — | **5 slots**, numeric cooldowns | Traversal skill in a slot | Top centre | Buffs above the bar | M |
| **Ravenswatch** | Portrait + HP, bottom-left | — | Level badge | Day/night clock, top | Next to the portrait | Slot | Top | — | M (low) |
| **Death Must Die** | Bottom centre | — | Bottom | Top | Item/skill icons, bottom | Slot | Top | Item tray | M (low) |
| **Soulstone Survivors** | Under the character + a bottom bar | — | Top | Top centre | Bottom-centre bar with cooldown sweeps for actives | Slot | Top centre | Corner icons | M (low) |
| **Hero Siege** | D2-style globe | Globe | Strip | — | D2 bottom panel | Slot | Top | — | M |

### 2.1 What the good ones agree on

1. **Bosses go top centre, wide, and name-plated.** Every ARPG above does this. Diablo IV adds **phase breakpoints on the bar itself** (marker ticks that flip when passed) and a secondary meter directly under it. Riftbound's phase pip should be a notch on the bar, and the ward is that secondary meter.
2. **In camera-centred horde games, HP lives under the character** (VS, Halls, Soulstone). The player's eyes never leave the character because that's where the dodging happens. Hades and the ARPGs park HP in a corner, but they have a fraction of the enemy density and big HP numbers. Riftbound is a horde game with dash-dodging, so it needs both: a **mini bar under the character for the glance, and the main bar on the action bar for the number.**
3. **Skills belong in one compact bottom-centre bar, with HP and the resource attached to it** (Diablo IV, Last Epoch). The eye makes one trip down for "can I cast / how hurt am I". Riftbound has no resource, so HP and XP sit on the bar.
4. **The build summary rides on the controls** (Hades: the god emblem on each button). The full list is a press away. Riftbound's slots already carry the skill icon and rank. Relics stay in a small corner tray that nobody needs mid-fight.
5. **Survivors games leave the middle 70–80% of the screen empty of HUD.** VS puts only the HP bar there, and it follows the character.
6. **Timers are top centre and big** (VS, Brotato, 20MTD). The clock is the run's heartbeat.

### 2.2 Screen-real-estate budgets

Rough budgets for persistent (always-on) HUD, from the references and the proposal:

| | Persistent HUD area at 1080p | Notes |
|---|---|---|
| Vampire Survivors | ≈ 5–6% | XP strip + icon rows + timer + under-sprite HP |
| Diablo IV (centred) | ≈ 10–12% | Bottom cluster with globes |
| PoE2 | ≈ 12–14% | Globes in both corners |
| **Riftbound today** | ≈ 10% at 1080p, **≈ 20%+ at 720p** | 940×~190 bottom + 440×~100 top (+70 with boss) + tray. No scaling, so 720p suffers. |
| **Riftbound proposal** | **8.5% normal, 11.5% boss** | §11.3 |

Target ≤ 9% normal and ≤ 12% in boss fights, with **no persistent HUD inside the central 60%×60% of the screen** except the character cluster.

---

## 3. Information hierarchy

How often the player needs each item mid-fight:
* **G**, glance-critical: several times a second to every few seconds, and acting on it saves your life.
* **P**, periodic: every 10–30 s, plans the next move.
* **R**, rare: build-level, read when paused or between fights.

| Info | Tier | Why | Zone | Form |
|---|---|---|---|---|
| Telegraphs, enemy shots | G | They kill you | World | Doc 04 decals (not HUD) |
| **HP (+ shield)** | G | Dodge vs face-tank | **Under the character** (mini) + action bar (number) | Bar; shield = hatched overlay |
| **Dash charges / recharge** | G | Dash is the defence; Perfect Dodge refunds it | **Under the character** (pips) + dash slot | Pips with fill |
| **Frost Armor (Permafrost)** | G | Each pip = one free hit | Under the character | 3 hex pips |
| Momentum charge | G/P | "Keep moving" pressure, it decays when still | Under the character | 72×3 strip in the class colour |
| Boss HP, phase | G (boss) | Burst windows; phase 2 changes patterns | Top centre | 880 px bar, notch at 50% |
| **Boss / elite ward element** | G (Act III) | Decides which element works | Boss bar left end + on the creature (doc 03) | Element-shaped badge + 10 s countdown ring |
| Skill ready / cooldown | G (manual) / P (auto-cast on) | Timing big spells | Action bar | Sweep + ready flash |
| Chain count | P (G for the Arcanist) | Resonance damage, XP bonus | Right lane | 64 px numerals |
| Resonance (Arcanist) | P | Is the same thing as Chain | Right lane, under Chain | 25-tick meter |
| Reactions happening | P | Feedback on the combo | World pop + right-lane feed | Element-glyph pair + name |
| XP / level | P | Next level-up timing | Action bar | 4 px line + level chip |
| Act clock, next beat | P | Prepare for Surge / Swarm / Boss | Top centre | Timeline + ribbon |
| Buffs (shrine, Adrenaline) | P | Timed windows to push damage | Above the HP bar | 36 px icon + radial timer |
| Shrine direction | P | Optional detour | Screen edge / world | Edge marker with icon + distance |
| Relic Bearer / dropped chest direction | P | Reward you might miss | Screen edge | Same marker system, gold crown / chest icon |
| Rift Crystals | P | Combo tool | World only | DESIGN §10 visuals (floating crystal + blast ring), no HUD |
| Perfect Dodge | event | Reward | Near the character, 0.4 s | "PERFECT" stamp |
| Discoveries (reaction / fusion / relic) | event | Teaching moment | Right-lane toast | 72 px toast, 3.4 s |
| Act title, boss intro, Rift Shift | event | Pacing | Centre (enemies are sparse or paused then) | Full-width cards |
| Relics owned | R | Build | Top-left tray (tiles), pause (text) | 36 px tiles |
| Passive ranks, skill details | R | Build | Pause | Full text |
| Auto-cast state | R | Changes rarely | Action bar badge | 32 px "T" toggle chip |
| Kills, level number, run time | R | Stats | Pause / end screen | — |
| Codex, attunements, Rift Tier | R | Meta | Sanctum / pause | — |

**Why HP lives near the character.** A survivors player spends most of a fight looking at a ring about 300 px around the character. At 1080p the old bottom HP bar sat 400–450 px below the character. That is a saccade plus a refixation, ≈ 200–300 ms, at the moment you most need to watch telegraphs. Community feedback on corner HP bars is consistent: players ask to have them near the action ([itch.io thread](https://itch.io/post/8359014), [Eitr dev on moving stamina to the character](https://redlib.belloworld.it/r/Eitr/comments/gfocxo/mini_dev_stamina_bar/fqz6p7m/?context=3)). Keep the big number bar too, for the "exactly how much" read when you have a second.

---

## 4. Centre: the character status cluster

Screen-space DOM is anchored each frame to the projected player feet. `_updateShrine` already does this projection.

```
                 (character, ~48–64 px tall at default zoom)
            ┌──────────────────────────────┐  y = feet + 16
            │█████████████▓▓▓░░░░░░░░░░░░░│  HP 72×7, shield = hatched white overlay
            └──────────────────────────────┘
            ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░   Momentum 72×3 (Stormcaller only)
               ◖■■◗ ◖■□◗    ⬢ ⬢ ⬡           dash pips 14×5 (fill = recharge) · Frost Armor 9 px hex pips
```

* **Size:** 72 px wide (≈ 1.3× the character). It sits 16 px below the feet, so it never covers the character or the ring right next to it.
* **Visibility:**
  * Always on, at 70% opacity.
  * 100% opacity plus a 150 ms white flash on damage taken, on a dash charge spent or regained, and below 50% HP.
  * Below 30% HP, the bar pulses at 1 Hz. This pairs with the existing low-HP vignette.
  * Setting: *Character HP bar: Always / When hurt / Off*.
* **No numbers** in the cluster. Numbers go on the action bar.
* **Trait mapping:**
  * Permafrost: armor pips here (delete both current displays).
  * Stormcaller: Momentum strip here. It glows at > 80, matching the current `hot` class.
  * Arcanist: Resonance goes to the right lane (§6).
  * Pyromancer: Wildfire gets **nothing persistent**. It's a passive that shows itself in the world (the explosions). Show it in the pause build view.
* **Perfect Dodge** stamps "PERFECT" 64 px above the head, 40 px Cinzel with a 4 px dark stroke, for 0.4 s. The dash pips refill with a white sweep, which is the real information.
* **Hidden during** level-up, relic and pause modals.

---

## 5. Top: act timeline and boss bar

### 5.1 Act timeline (horde phase)

```
x: 640                                                                   1280
  ◆ ◆ ◇   ├───────────────────────────────█────────♛─────────◎───────☠┤   2:07
  I  II III        0:00 ………… elapsed fill (act colour) ………  1:30     2:15    3:00
                                    ┌─────────────────────────┐
                                    │  ◎  SWARM IN 0:08        │   ← ribbon, y 80–112, only ≤10 s before a beat
                                    └─────────────────────────┘
```

* **Box:** x 640–1280, y 16–76 (640×60), a walnut plate at 88% opacity.
* **Act pips (left, 92 px):** three 20 px diamonds. Done = gold fill. Current = act colour, pulsing at 0.5 Hz. Upcoming = hollow. The roman numerals under them are 14 px. **This replaces "ACT I · THE THORNWOOD"**, which the title card and pause screen already carry.
* **Timeline:** 420×10 px. The fill is the act colour. Beat icons are 20 px glyphs sitting on the bar at 50% (♛ crown = Elite Surge), 75% (◎ ring = Swarm) and 100% (☠ = Boss). Past beats dim to 40%.
* **Timer:** right, 32 px tabular numerals (Cinzel or the HUD sans).
  * During the Rift Primer clock hold it reads "PRIMER" with a pause glyph, 18 px.
  * During the boss phase it reads "BOSS" in hostile red.
* **Beat ribbon** (y 80–112, 20 px):
  * Before a beat: "ELITE SURGE IN 0:09" for the last 10 s. The beat icon pulses at 1 Hz.
  * At the beat: "ELITE SURGE · gold Relic Bearer" for 3 s.
  * This **replaces** the centre-screen announce for beats. Keep a centre announce only for "THE BOSS AWAKENS", and only for 1.2 s.
* **Delete** the "Lv · kills" sub-line.

### 5.2 Boss bar

```
x: 476   520                                                                       1400
  ┌────┐                       G O R R A K                                      ●  ○
  │ ⬢  │                    the Troll King                                    phase
  │ 7s │ ┌───────────────────────────────────────┬───────────────────────────────────────┐
  └────┘ │███████████████████████████████████████│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░│  880×20
  ward   └───────────────────────────────────────┴───────────────────────────────────────┘
  badge                                         50% notch (phase 2)
```

* **When a boss lives, the act timeline collapses** to y 12–40 (28 px): the pips plus "BOSS". The boss block takes y 48–124.
* **Name plate:** 28 px Cinzel with letter-spacing 4 for "GORRAK". The epithet "the Troll King" is 16 px italic on a second line. Split `bossName` at the comma. The name is centred over the bar.
* **Bar:** x 520–1400 (880×20), hostile-red fill with a dark 2 px outline.
  * Damage "chip" trail: a lighter segment that drains 400 ms after the hit, which shows burst.
  * **Phase notch** at 50%: a 3 px dark gap plus a 10 px tick above and below. When it's passed, the tick turns grey and the right-hand phase pip fills (the Diablo IV breakpoint pattern).
* **Ward badge:** 44×56 px at x 468–512, overlapping the left end of the bar.
  * Element-shaped frame (§10.3) in the ward colour, with the element glyph inside.
  * **A countdown ring for Aurelith's 10 s ward cycle**, plus a seconds number at 14 px.
  * On `wardBroken`, the badge shatters (180 ms) and becomes a grey "BROKEN" chip until the next cycle.
  * Shown only when `b.ward` is set.
* **Boss intro:** at spawn, the name plate appears in the centre (y 300, 56 px) for 1.2 s, then slides and scales into its slot over 300 ms. The spawn moment is when the eye needs to learn where the bar lives.
* **Barrier / stagger:** not used today. If boss barriers come, add a 4 px cyan line under the HP bar (the Diablo IV stagger-bar slot).

---

## 6. Right lane: Chain, reactions, milestones, discoveries

The right lane is x 1556–1896 (340 px, right-aligned, 24 px margin). It sits outside the central 60% so it never covers a telegraph near the character, and it's close enough to the centre (≈ 600 px) that a 64 px number still shows up in peripheral vision.

```
                                   CHAIN            ← 18 px label
                                     ×23            ← 64 px numerals, y 300–380
                               ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯   ← Arcanist: 25 ticks 240×8, "+46%" 16 px
                          ▲⬢  STEAM BURST   ×3     ← feed rows 26 px, max 4, y 404–520
                          ✦▲  COMBUST       ×1
                          ◆⬢  SUPERCONDUCT  ×2

                     ┌──────────────────────────┐   ← toasts y 560–700, 360×72 each, max 2 visible
                     │ NEW REACTION             │
                     │ ✦◆ ARC FLASH             │
                     │ Arcane + Storm: stuns    │
                     └──────────────────────────┘
```

* **Chain:**
  * Hidden below ×2, as now. Pop at scale 1.12 for 120 ms, at most once per 120 ms (coalesce).
  * **Colour ramp:** white (2) → gold (10) → **prism** (25+: the numerals take a 4-colour element gradient that slowly rotates) → full prism + glow (50).
  * **No magenta.** Magenta and red are reserved for hostile things (doc 04 §4.3).
  * Font size: fixed at 64 px. The current growing size (34 + n·0.5) shifts the layout. Use the colour ramp and the milestone stamp for escalation instead.
* **Milestones (10/25/50):** a 28 px "×25!" stamp rotated −8° to the left of the number, for 1.2 s, with the existing SFX. **Delete the centre pill at 64% height.**
* **Resonance (Arcanist only):** 25 ticks under the number plus a "+46% dmg" readout, 16 px. It's the same data as Chain, so it lives with Chain. The bottom trait panel goes away.
* **Reaction feed:** the existing logic (2.5 s per type, ×n). Each row is two 18 px element glyphs (in the reaction's colours), the name at 18 px Cinzel, and the count. Max 4 rows, newest on top.
* **Discovery toasts (new reaction / fusion forged / relic discovered):**
  * Slide in from the right edge, 360×72: kicker 14 px, title 22 px, one line ≤ 40 characters at 16 px.
  * Up to 2 stacked. The queue logic from `hud-fx.js` stays, but the "wait for title card" check is no longer needed because the two don't share space.
  * The full description stays in the codex.
* **Left lane** (for completeness):
  * Relic tray at the top-left (§11).
  * Tutorial / tip panel stays at x 24–384, y 380–620. Make its text ≥ 18 px.

---

## 7. Bottom: the action bar

### 7.1 Layout (1080p)

```
x: 660                                                                          1260
          ┌──┐┌──┐┌──┐                                                          y 922–958 buffs (36 px, only when active)
          │✹ ││⚔ ││🛡│
          └14┘└ 3┘└22┘
 ┌──────┐ ┌───────────────────────────────────────────────────┐               y 962–982
 │ LV12 │ │██████████████████████████▓▓▓▓▓░░░░░░░░░░░░░ 112   │  HP 352×16 (+shield hatch), number 14 px
 └──────┘ │▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│  XP 352×4 (y 984–988)
          └───────────────────────────────────────────────────┘
 ┌──────┐   ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐   ┌────┐┌────┐ ┌──┐      y 992–1056
 │SPACE │   │🖱L   ││🖱R  ││Q     ││E     ││R     │   │ ◎  ││ ⚡ │ │T │
 │  ⟶   │   │  ▲   ││  ⬢   ││  ◆  4││  ✦   ││  +   │   │    ││    │ │A │
 │▰▰ ▰▱ │   │▪▪▪▫▫ ││▪▪▫▫▫ ││▪▫▫▫▫ ││▪▪▪▪▪ ││      │   │▪▪▪ ││▪▫▫ │ └──┘
 └──────┘   └──────┘└──────┘└──────┘└──────┘└──────┘   └────┘└────┘
  dash 64     LMB      RMB      Q        E        R(empty)  auto 48×2    auto-cast
 660–724    744–808  816–880  888–952  960–1024 1032–1096 1116–1164,1172–1220  1228–1260
```

* **HP bar:**
  * x 744–1096, 352×16, sitting over the 5 skill slots.
  * Fill is HP red (`--rb-hp-a/b`). Shield is a **white-cyan diagonal-hatched** overlay appended after HP, as now. The hatch makes it readable without colour.
  * Number: "112" at 14 px, inside the right end. The max is only in pause. A setting can show "112/150".
  * A damage chip trail like the boss bar's.
  * The LV chip (64×24) sits at the left end above the dash slot (x 660–724, y 960–984), "LV 12" at 16 px. A level-up fills it gold for 0.5 s.
* **XP:** a 4 px line under HP (y 984–988), the same width. It's only a rate cue. The level-up modal is the real event.
* **Buffs:**
  * A row of 36 px icon squares, left-aligned at x 744, y 922–958.
  * Each has a clockwise dark radial sweep for time left, seconds at 14 px in a corner badge, and a border in the buff colour.
  * No names. The name shows on the first claim as a 1.2 s label over the shrine.
  * Adrenaline (Perfect Dodge, 3 s) uses the same row.
* **Edge-marker safe rect:** bottom inset = 1080 − 912 = 168 px (§11.2), so the shrine arrow never lands on the bar.

### 7.2 Slot anatomy (64 px)

| Part | Spec |
|---|---|
| Frame | 2 px border. Element colour when ready, 40% element colour on cooldown. **Fusion slot:** double gold frame (2 + 1 px) plus a small ✦ in the top-right. **Empty:** dashed 1 px brass, dim "+" 20 px, key cap still shown. |
| Icon | 40 px, centred, the skill's own icon (replace emoji with SVG/atlas icons when art allows). On cooldown it shows at 45% brightness, desaturated. **The element shape glyph** (14 px) sits in the bottom-right corner on every slot (§10.3). |
| Key cap | Inside the top-left: an 18 px-high tab with 14 px text. LMB/RMB as **mouse glyphs** (a 12 px mouse outline with the left or right half filled) instead of the letters "LMB", which are wider and slower to read. Q/E/R/SPACE as letters. |
| Cooldown | A dark (60% black) **clockwise sweep** from 12 o'clock, a CSS conic-gradient (as now). **Number:** centred, 22 px bold with a 3 px dark stroke. Show `Math.ceil(cd)` only while `cd ≥ 1.0 s`; hide it below that. Never show decimals. The starter (≤ 0.5 s) never shows a number or a sweep. It only dims the icon to 80% between shots (the sweep would strobe at 3+ Hz). |
| Ready moment | When the cooldown reaches 0 (for `maxCd ≥ 1.5 s`), the rim flashes white for 120 ms and the icon pops to 1.08 for 120 ms. **One flash, no looping glow.** This is the "ding" that lets the player keep their eyes centred. Pair it with the existing (or a new) soft UI tick, and allow muting it. |
| Rank pips | Inside the bottom edge: 5 × (7×5 px) pips with a 2 px gap, centred, on a 40% dark strip. Filled = element colour. Fusions show 3 pips in gold. |
| Auto-cast on | Slots 1–4 get a 10 px circular-arrows badge in the top-right, and the T chip at the right end is lit. |
| Dash slot | Same frame. The glyph is the class dash glyph. **Charges are pips inside the bottom edge** (24×6 each, fill = recharge progress, as `--p` now). It's also mirrored under the character. The dash name is deleted. |
| Auto skills | 48 px: no key cap, no sweep. A soft rim "proc pulse" (80 ms) each time it fires, capped at 4 Hz visually. Rank as pips, the same as slots, to match. |

**Size rationale.** 64 px at 1080p gives a 40 px icon (Diablo IV and Last Epoch slots are ≈ 56–72 px at 1080p, M). At the 0.8 scale it's 51 px at 720p, which still gives a 32 px icon. Bigger slots buy nothing: ranks and cooldowns are pre-attentive features (fill and darkness), and the icons are recognised by colour and shape after a few runs.

**Numbers on cooldown: yes, for cooldowns ≥ 1 s and in whole seconds.** Meteor (3–4.5 s), Blizzard and Singularity (6–9 s) and the fusions (5.5–8 s) are planning cooldowns, and "2" next to an almost-full sweep tells the player whether to wait or dash. Decimals turn into unreadable noise.

---

## 8. Level-up and relic choice screens

### 8.1 What good roguelites do

* **Vampire Survivors:** 3 options (4 with Luck). Each row is icon, name, "New!" or level, and the description of *this level's* change. Evolution hints sit on the panels. Reroll, Skip and Banish appear as buttons when unlocked ([VS wiki](https://vampire.survivors.wiki/w/Level_up); [Banish](https://gmdq.substack.com/p/vampire-survivors-banish-mechanic)). The level-up describes the **delta**, not the skill.
* **Hades / Hades II:**
  * Three horizontal rows, the **god icon dominant on the left**, rarity as the frame colour (Common white, Rare blue, Epic purple, Heroic red, [wiki](https://hades.wiki.fextralife.com/Artemis'+Aid)).
  * The key number is highlighted inside the sentence. Pom upgrades show the value going up (M).
  * Players still confuse rank and rarity ([PC Invasion guide](https://www.pcinvasion.com/hades-guide-olympian-god-boons-skills/2/)). A fan mod exists only to make "already have / can get" state obvious ([Improved Boon Info UI](https://thunderstore.io/c/hades-ii/p/SMarBe/Improved_Boon_Info_UI/v/1.2.0/)).
  * Lesson: **state relative to your build is the most-wanted information** on a choice card.
* **Brotato:** 4 stat cards: icon, name, "+n Stat", tier colour. Reroll with a cost at the bottom. The current stats panel stays visible on the right (M).
* **Slay the Spire:** cost in the corner, art, type line, ≤ 3 lines of text with keywords bolded. Card readability comes from extreme text economy (M).

**Shared rules:**
1. The icon is recognised first.
2. NEW vs UPGRADE is visible without reading.
3. The effect is one sentence written as a delta.
4. Your current build is visible during the choice.
5. Number keys work.

### 8.2 Riftbound level-up card (340×420 at 1080p, 3 cards, 28 px gaps → 1076 px, x 422–1498, y 300–720)

```
┌───────────────────────────────────────┐
│ [1]                         RANK UP ▸ │  keycap 32 px · type ribbon 14 px caps (NEW / RANK UP / FUSION / PASSIVE / RESTORE)
│                                       │
│              ╱▔▔▔▔▔▔╲                 │
│             ▕  ICON   ▏               │  112 px element-shaped medallion (▲ fire frame), icon 72 px
│              ╲______╱                 │
│                                       │
│            CINDER BOLT                │  name 26 px Cinzel, ≤ 20 chars, 1 line
│        ▪ ▪ ▫ ▫ ▫  →  ▪ ▪ ▣ ▫ ▫       │  rank pips before → after (new pip glowing) · "Rank 2 → 3" 16 px
│                                       │
│   +25% damage                         │  effect 20 px, ≤ 2 lines, ≤ 56 chars; numbers bold
│   (8 → 10 per bolt)                   │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ ✦ Fusion: + Meteor r3 → STARFALL  │ │  synergy chip 16 px, ONE line, ≤ 34 chars
│ └───────────────────────────────────┘ │
│ ▲ Fire · Active · LMB                 │  footer 14 px dim: element shape+name · type · slot it goes to
└───────────────────────────────────────┘
```

**Text budget per card** (at 1080p; ×0.8 at 720p):

| Field | Size | Budget | Rule |
|---|---|---|---|
| Keycap | 32 px tile, 20 px digit | 1 | Top-left. Same position on every card. |
| Type ribbon | 14 px caps | ≤ 9 chars | NEW · RANK UP · FUSION · PASSIVE · RESTORE. Colour + **shape** (NEW = star burst, FUSION = double frame). |
| Medallion | 112 px | — | Element-shaped frame; passives use a neutral round brass frame; fusion = gold double. |
| Name | 26 px | ≤ 20 chars | No wrap; shrink to 22 px if over. |
| Rank row | pips 10 px + 16 px text | — | **Before → after**. NEW shows "▫▫▫▫▫ → ▣▫▫▫▫". Passives the same (max 5; Volley max 2). |
| Effect | 20 px | ≤ 56 chars, ≤ 2 lines | **Delta only**: "+1 bolt (2 → 3)", "Haste: −14% → −21% cooldown". New skills get a ≤ 56-char *what it does* line. Bold the numbers. |
| Synergy chip | 16 px | ≤ 34 chars, max 1 | Priority: (1) **fusion progress** "Fusion: + Meteor r3 → STARFALL" or "Meteor needs r3 (now r1)"; (2) **reaction partner** for a *new element*: "Reacts with your ▲ Fire → STEAM BURST" (an undiscovered reaction shows as "▲ + ⬢ → ???", which keeps pillar 2 "discovered, not memorised"); (3) slot destination for a new active when slots are full: "Replaces nothing · goes to AUTO". |
| Footer | 14 px | ≤ 30 chars | Element shape + name · Active/Auto · slot key. |

**Screen around the cards:**

* **Title:** "LEVEL 12", 40 px at y 210. The sub-line "Choose one" is 16 px. Drop "keys 1 2 3"; the keycaps show it.
* **Under the cards (y 744–792):**
  * `⟳ Reroll (2)  [F]` and `⊘ Banish (1)  [X]`, 200×48 buttons centred, 24 px apart.
  * Banish mode turns the card borders hostile-red-dashed, swaps the ribbon to "BANISH?", and the next 1–3 press banishes. X or Esc cancels.
* **Loadout strip (y 840–920):** your current action bar (dash + 5 slots + autos) at 0.75 scale, with ranks. Passives are 28 px icons with rank numbers to the right. **The slot a card would change highlights while that card is hovered or keyed.** This is the "current build visible" rule (Brotato, VS).
* **Input safety:**
  * Keep the 350 ms ignore window, but also ignore any key or button that was **already down when the modal opened**. Players are holding LMB and Q/E/R when a level-up pops.
  * Never bind reroll or banish to a combat key (R is a skill slot, so reroll is F).
* **Primer footer tip** (DESIGN §11b): keep it as a 16 px line above the buttons.
* **Backdrop:** dim the game to 50% with a 4 px blur. The cards are the parchment; the backdrop is not.

### 8.3 Relic chest (300×400 per card, 3–4 cards)

The same frame, with these differences:

| Field | Spec |
|---|---|
| Medallion | 96 px. The **tag** sets the frame shape and colour: reaction = prism ✦, fire ▲, frost ⬢, storm ◆, risk = cracked red square with ⚠, dodge = chevron, economy = coin circle, cast = rune square, safety = shield. |
| Name | 24 px, ≤ 20 chars |
| Tag ribbon | 14 px caps, tag colour |
| Effect | 20 px, ≤ 64 chars, ≤ 2 lines |
| Synergy chip | "You have 2 reaction relics" / "Boosts your ▲ Fire skills" / "Risk: −40% max HP (150 → 90)". One line. |
| Flavour | **Cut from the card.** It belongs in the codex and the pause relic list (a flavour line delays the decision). |
| Keys | 1–4 |

---

## 9. Pause / build / codex and the Sanctum

### 9.1 Pause (Esc)

What players need while paused, in order:
1. "What does my stuff do?"
2. "What can I fuse next?"
3. "Which reactions exist?"
4. Resume / abandon.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  PAUSED                                              [Resume ⏎]   [Abandon run]    │
│  [ Build ]  [ Codex ]  [ Settings ]                                                │
├──────────────────────────────┬─────────────────────────┬───────────────────────────┤
│ LOADOUT (mirror of the bar)  │   ELEMENT SQUARE        │ RELICS (6)                │
│ SPACE ⟶ Phase Step  2.4 s    │ ▲ Fire ──OVERLOAD── ◆Stm│ ⚗ Alchemist's Coil       │
│ LMB  ▲ Cinder Bolt ▪▪▪▫▫     │  │ ╲COMBUST  SUPERC╱ │  │   +40% reaction damage    │
│ RMB  ⬢ Frost Nova  ▪▪▫▫▫     │ STEAM     ╳     ARC FL. │   "Copper wound by…"      │
│ ...                          │  │ ╱             ╲   │  │ …                         │
│ PASSIVES  Might 3 · Haste 1  │ ⬢ Frost ──SHATTER── ✦Arc│                           │
│ FUSIONS IN REACH             │   (discovered = lit,    │ RUN  4:12 · 612 kills ·   │
│  Fireball r3 + Frost Nova r2 │    undiscovered = ???)  │ peak Chain 31             │
│  → FROSTFIRE COMET (1 rank)  │                         │                           │
└──────────────────────────────┴─────────────────────────┴───────────────────────────┘
```

* **The element square is the codex's best diagram.** 4 elements choose 2 gives 6 pairs, which are exactly the 6 reactions. Put the elements on the corners: fire top-left, storm top-right, frost bottom-left, arcane bottom-right. The 4 sides are Overload, Steam Burst, Shatter and Arc Flash; the 2 diagonals are Combust (fire–arcane) and Superconduct (storm–frost). Discovered reactions are lit with their name. It teaches the whole combo system at a glance. Reuse it in the Codex tab and the tutorial step 5 tip.
* **Fusions in reach:** for each fusion where you own ≥ 1 parent, show the parents with their ranks and "needs r3". This planning information doesn't exist anywhere today.
* **Codex tab:** the element square (reactions 6). Fusions as **recipe tiles** (icon + icon = icon); undiscovered shows the silhouettes of known parents. Relics as an 18-tile grid with silhouettes, not "???" text. Classes (4) with unlock conditions.
* **Settings tab:** move the title-screen checkboxes here (shake, auto-cast default, character HP bar, reduce HUD motion, UI scale 80–150%, damage numbers on/off).

### 9.2 Sanctum / title: make it a place, not a form

Today it's a header, 4 text-heavy class cards (each has 6 text blocks), an attunement list with Buy buttons, a codex text row, a controls footer and 4 settings checkboxes. It works, but it reads as a form.

**References for a hub that feels like a place:**
* **Hades:** the House of Hades. Meta upgrades sit in the Mirror of Night, which is still a menu, but it's framed as an object you walk to (M).
* **Hades II:** the Crossroads (M).
* **Dead Cells:** the Collector (M).
* **Rogue Legacy 2:** the manor (M).
* Vampire Survivors is the counter-example: its power-up screen is a plain grid, and it works because the game's identity is mechanical, not place-based.

**80/20 for Riftbound** (it already has a three.js world and class models):
1. **A live diorama behind the menu.**
   * The camera looks at a small floating rift island with the **selected class model idling** at centre-left (doc 01 rigs), the sky of the act you last reached, and drifting motes.
   * Selecting a class plays a short element burst and swaps the model.
   * This alone moves it from form to place.
2. **Class select:**
   * 4 portrait medallions along the bottom (96 px, element-shaped frames, keys 1–4, a lock glyph + unlock line for locked ones).
   * **One** details panel for the selected class (right side, 420 px): name, title, starter, dash, trait, at 18 px.
   * This deletes ¾ of the duplicated card text.
3. **Attunements** are six runestones on a semicircle in the diorama, or a compact 2×3 grid of 120×120 tiles (icon, rank pips, cost gem). Hover or focus shows the description. Buying lights the stone.
4. **Rift Tier** is a portal-arch dial (0–5): the glow intensity and colour heat up with the tier, and the modifiers show in one line under it. **"Begin Quest" is the portal**, the biggest button on the screen (320×64), with Enter as the key.
5. **Codex** is a tome icon with "21/38" that opens the pause codex overlay. Records go on the tome tooltip.
6. **Rift Shards** go top-right as a big gem counter (as now).
7. **Settings** go behind a gear icon. **Controls** go behind a "?" overlay (the primer teaches them anyway).

---

## 10. Accessibility and readability

### 10.1 Font sizes

The Xbox Accessibility Guidelines (XAG 101) give a **minimum 18 px body height for PC at 1080p** (26 px for console/TV at 1080p, 36 px for PC at 4K), measured from the lowest descender to the highest ascender, and players should be able to scale text to 200% ([XAG 101](https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md)). Game Accessibility Guidelines cite 28 px at 1080p for 10-foot TV viewing, as a floor rather than a target ([GAG](https://gameaccessibilityguidelines.com/use-an-easily-readable-default-font-size/)). Riftbound is a desk-distance browser game, so the PC row applies.

| Role | 1080p (u = 1) | 720p (u = 0.8) | Today |
|---|---|---|---|
| Key caps, pip labels, tiny badges | 14 px (allowed only for single glyphs / ≤ 3 chars) | 11 px | **9 px** |
| Labels (ribbons, footers, buff seconds) | 16 px | 13 px | 10–11 px |
| Body / effect text | 18–20 px | 14–16 px | 13.5 px |
| Numerals that matter (timer, HP number, cooldown) | 22–32 px | 18–26 px | 13–22 px |
| Names (cards, boss) | 26–28 px | 21–22 px | 13–18 px |

* **Cinzel only at ≥ 18 px.** Its all-caps serif setting loses legibility below that. Use the HUD sans for small labels and numbers, with `font-variant-numeric: tabular-nums` for anything that ticks.
* Offer **UI scale 80–150%** (the `--u` multiplier) in Settings.

### 10.2 Contrast over the bright ground (measured, WCAG contrast ratio)

| Background | `#ffffff` | parchment text `#fbf1d9` | dim `#d8c49b` | fire `#ff7a33` | frost `#7fe0ff` | storm `#ffe45c` | arcane `#c08cff` |
|---|---|---|---|---|---|---|---|
| Walnut plate `#2b1a0e` | 16.7 | 14.9 | 9.8 | 6.4 | 11.1 | 13.1 | 6.7 |
| Grass `#6f9a3e` | 3.3 | 2.9 | 1.9 | 1.3 | 2.2 | 2.6 | 1.3 |
| Sunlit grass `#9cc45a` | 2.0 | 1.8 | 1.2 | 1.3 | 1.3 | 1.6 | 1.2 |
| Ochre (Act II) `#d9a35c` | 2.2 | 2.0 | 1.3 | 1.2 | 1.5 | 1.8 | 1.1 |
| Sand `#e8c98a` | 1.6 | 1.4 | 1.1 | 1.6 | 1.1 | 1.3 | 1.6 |
| Water `#4f8fb0` | 3.6 | 3.2 | 2.1 | 1.4 | 2.4 | 2.8 | 1.4 |

XAG 102 requires 4.5:1 for normal text and 3:1 for large text and UI elements, measured against the **lowest-contrast part** of a busy background. It recommends backing plates and outlines ([XAG 102](https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-102-contrast.md)). **Nothing coloured passes over the Riftbound ground.**

* **Rules:**
  * All HUD text and bars sit on **plates**: walnut `#2b1a0e` at ≥ 85% opacity with a 1 px `--rb-outline`. Every element colour passes on it (6.4–13.1:1).
  * World-anchored text (damage numbers, PERFECT, IMMUNE, the character cluster) uses the **4 px dark stroke with `paint-order: stroke fill`** from doc 04 §3.7. The stroke is the local plate.
  * The character mini-HP bar gets a 2 px `#140a04` outline plus a 50% black backing. Without it, a red bar over Act II ochre measures about 1.2:1.
* **Plates beat outlines for clusters.** Outlines alone still let a busy, high-frequency ground show through the counters of numerals. Plates beat glows always: a coloured glow *lowers* contrast on bright ground (doc 04).

### 10.3 Element encoding: colour plus shape

Simulated colour-vision deficiency (Machado 2009 severity 1.0, CIELAB ΔE76; ΔE < ~25 is "confusable at a glance at small sizes"):

| Pair | Normal | Protan | Deutan | Tritan |
|---|---|---|---|---|
| fire / storm | 58 | 35 | **22** | 58 |
| frost / arcane | 70 | 40 | **27** | 58 |
| storm / arcane | 129 | 128 | 118 | 34 |
| frost / storm | 93 | 92 | 94 | 51 |
| fire / frost | 109 | 79 | 91 | 123 |
| fire / hostile red `#ff2a3d` | 35 | 31 | **14** | 29 |
| UI gold `#f2c75c` / storm `#ffe45c` | **16** | **15** | **12** | **11** |
| Chain magenta `#ff3dbb` / hostile magenta `#ff2a6d` | 40 | 38 | 41 | **26** |

Red-green deficiency affects roughly 8–10% of males, and GAG's rule is to never convey essential information by colour alone. Pair it with a shape, symbol or pattern ([GAG](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-colour-alone/)).

**Element shapes** (used on slot corners, card medallions, ward badges, reaction feed glyphs, codex, and status pips over enemies if those come):

| Element | Colour | Shape | Why it's distinct |
|---|---|---|---|
| Fire | `#ff7a33` | **▲** upward triangle (flame) | vs storm's diamond: 3 vs 4 corners, flat base |
| Frost | `#7fe0ff` | **⬢** hexagon (snowflake / ice) | Convex, vs arcane's concave star |
| Storm | `#ffe45c` | **◆** diamond with a zigzag bolt cut | |
| Arcane | `#c08cff` | **✦** 4-point concave star | |

* **UI gold vs storm yellow** is confusable even with normal vision (ΔE 16).
  * Give UI accents (Chain gold, level chip, elite / Relic Bearer, economy relics) a **warmer amber `#e0a030`**.
  * **Never** let gold carry element meaning. Elite gold always comes with the crown shape.
* **Fire vs hostile red:** never use fire orange for warnings. Danger UI (low HP, boss bar, ward-immune) uses hostile red **plus** a skull / ⚠ glyph or hazard hatching.
* **Colour-blind setting** (cheap, later): a palette swap for the four element colours plus the telegraph colour as one uniform, as doc 04 suggested for telegraphs.

### 10.4 Motion limits

* **No HUD element flashes more than 3 times per second.** That is WCAG 2.3.1 ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes.html)), and it applies to the starter cooldown sweep: hence "no sweep under 1 s".
* The low-HP pulse stays ≤ 1 Hz (today it's 1.1 s, OK). The beat icon pulse is 1 Hz and the act pip 0.5 Hz.
* **Pops:** scale ≤ 1.15, ≤ 150 ms, coalesced to at most one per 120 ms per element.
* **The centre 40% of the screen gets transient HUD text only for:** PERFECT (0.4 s), boss intro (1.2 s), the act title card, and the Rift Shift.
* **Chain prism / rainbow:** hue cycle ≤ 0.5 Hz.
* **Reduce HUD motion** setting. Default on when `prefers-reduced-motion`. It disables pops, the rainbow, slides (toasts fade instead) and the beat pulse. It is independent of Shake.

---

## 11. The layout spec

### 11.1 Scale

```css
:root { --u: clamp(0.8, min(100vw / 1920px, 100vh / 1080px) * var(--ui-user, 1), 1.5); }
/* every HUD size = calc(N * var(--u) * 1px); compute --u in JS on resize if calc() unit division is unavailable */
```

At 1280×720 the raw ratio is 0.667. The 0.8 floor deliberately makes the HUD *relatively* 20% bigger at 720p, so 14 px key caps stay ≥ 11 px and 18 px body text stays ≥ 14 px. At 1366×768 `--u` is 0.8, and at 2560×1440 it's 1.33.

### 11.2 Full mockup (1920×1080; 1 column ≈ 24 px, 1 row ≈ 40 px)

```
0        240       480       720       960       1200      1440      1680      1920
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│▣▣▣▣▣▣                     ◆◆◇ ├────────█──♛────◎───☠┤ 2:07                     │ 16–76   relics · act timeline
│▣▣▣                                ◎ SWARM IN 0:08                              │ 80–112  beat ribbon (≤10 s before a beat)
│                                                                               │
│ ·  ·  ·  ·  ·  ·  ·  ·  ·  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                    │
│                                                                        CHAIN  │ 300–380 Chain
│                             │                              │            ×23  │
│ ┌────────────────┐                                              ▮▮▮▮▮▮▮▮▯▯▯  │ 384–392 Resonance (Arcanist)
│ │ RIFT PRIMER 3/5│          │    NO PERSISTENT HUD          │  ▲⬢ STEAM BURST ×3│ 404–520 reaction feed
│ │ Shoot the      │               (central 60% × 60%)             ✦▲ COMBUST  ×1│
│ │ crystal while… │          │           ☺                  │                  │ character
│ └────────────────┘                   ▬▬▬▬▬ ◖■◗◖■◗ ⬢⬢⬡                          │ char cluster (feet + 16)
│  380–620 tutorial/tips      │                              │ ┌──────────────┐ │
│                                                              │ NEW REACTION │ │ 560–700 toasts
│                             └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │ ✦◆ ARC FLASH │ │
│                                                              └──────────────┘ │
│                                                                               │
│                              ✹14 ⚔3                                           │ 922–958 buffs
│                         LV12 ██████████████▓▓▓░░░░░░ 112                      │ 962–988 HP + XP
│                         [⟶] [▲][⬢][◆][✦][+]  (◎)(⚡) T                        │ 992–1056 action bar
└───────────────────────────────────────────────────────────────────────────────┘
edge-marker safe rect: x 48–1872, y 128–912 (shrine ⛩ / Relic Bearer ♛ / chest ▣ arrows clamp here)
```

**Boss-fight variant (top only):**

```
│▣▣▣▣▣▣              ◆◆◆ BOSS                                                   │ 12–40   collapsed act strip
│▣▣▣               ┌──┐            A U R E L I T H                        ● ○   │ 48–84   name plate 28 px + epithet 16 px
│                  │✦ │      the Prism Dragon                                   │
│                  │7s│ ██████████████████████████████│▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  │ 92–112  bar 880×20, notch at 50%
│                  └──┘                                                          │ ward badge x 468–512, y 72–128
```

### 11.3 Box table

| Box | x (1080p) | y (1080p) | w×h (1080p) | w×h (720p, u = 0.8) | Plate | Notes |
|---|---|---|---|---|---|---|
| Relic tray | 24 | 24 | 252×126 (6 per row, 36 px tiles, 6 gap) | 202×101 | per tile | `pointer-events: none` in play. State overlays (Second Wind used = grey + ✓; Overclock = 8 tick ring). New relic: 600 ms gold rim. |
| Act timeline | 640 | 16 | 640×60 | 512×48 | yes | Collapses to 640×28 at y 12 in boss fights |
| Beat ribbon | 760 | 80 | 400×32 | 320×26 | yes | Only ≤ 10 s before a beat and 3 s after it |
| Boss name plate | 520 | 48 | 880×36 | 704×29 | no (stroke) | 28 px name + 16 px epithet |
| Boss bar | 520 | 92 | 880×20 | 704×16 | yes | Notch at 50%; phase pips at right x 1408–1440 |
| Ward badge | 468 | 72 | 44×56 | 35×45 | yes | Only with `b.ward` |
| Chain | 1556 | 300 | 340×80 | 272×64 | no (stroke) | Right-aligned |
| Resonance | 1656 | 384 | 240×8 + label | 192×6 | yes | Arcanist only |
| Reaction feed | 1556 | 404 | 340×116 (4 rows × 26 + gaps) | 272×93 | row plates 60% | |
| Toasts | 1536 | 560 | 360×72 (×2 max) | 288×58 | yes | Slide from the right |
| Tutorial / tips | 24 | 380 | 360×240 | 288×192 | yes | Existing panel, text ≥ 18 px |
| Character cluster | feet −36 | feet +16 | 72×24 | 58×19 | backing 50% | Screen-space, follows the player |
| Buffs | 744 | 922 | n×(36 + 6) | n×34 | per icon | Only when active |
| LV chip | 660 | 960 | 64×24 | 51×19 | yes | |
| HP bar | 744 | 962 | 352×16 (+ 4 XP) | 282×13 (+3) | yes | |
| Dash slot | 660 | 992 | 64×64 | 51×51 | yes | `.hud-dash` (tutorial hook) |
| Skill slots ×5 | 744 → 1096 | 992 | 64×64, 8 gap | 51×51 | yes | `.hud-slots` (tutorial hook) |
| Auto skills ×2 | 1116, 1172 | 1000 | 48×48 | 38×38 | yes | |
| Auto-cast chip | 1228 | 1008 | 32×32 | 26×26 | yes | Click / T toggles |
| Edge-marker safe rect | 48–1872 | 128–912 | — | scaled | — | Markers: 40 px icon disk + 16 px distance "18m" + arrow notch. No text label. |

**Area check** (1080p, 2.07 Mpx):

* Normal play: action bar 600×134 (80 k) + act 640×96 (61 k) + relics (32 k) + cluster (2 k) ≈ 175 k = **8.5%**.
  * The Chain lane is transient, ≈ 75 k when active.
* Boss fight: + 63 k = **11.5%**.
* Today at 720p: bottom ≈ 940×190 = 179 k of 922 k = **19%**, plus the top and tray.

---

## 12. What to remove from the current HUD

1. **The trait text panel** (`.hud-trait`): the "Resonance"/"Momentum" labels, "x / 25 · +y% DMG" text, and the static Wildfire sentence. Resonance moves to Chain (§6), Momentum and Frost Armor move to the character cluster (§4), and Wildfire moves to the pause view only.
2. **The duplicate Frost Armor display.** Both `armorRow` (core) and `trPips` (trait panel) show it today. Keep only the character-cluster pips.
3. **"ACT I · THE THORNWOOD"** text on the act bar during play (act pips + title card + pause carry it).
4. **"Lv N · K kills"** sub-line under the act bar.
5. **The three act segments as the main bar.** Replace them with the 0:00–3:00 act timeline plus beat icons. The act progression becomes 3 small pips.
6. **The HP text "123 / 150 +40"** at 13 px. Replace it with the current HP number only (max in pause, optional setting).
7. **The dash name text** ("Phase Step") and the 168 px dash box. Replace them with a 64 px slot with pips.
8. **The "[T] AUTO-CAST ON/OFF" text pill** above the bar. Replace it with the T chip plus slot badges.
9. **Buff name text in the buff pills.** Replace with icon + radial timer + seconds.
10. **Cooldown decimals** (`toFixed(1)`). Replace with whole seconds ≥ 1 s, and no number or sweep on sub-second starters.
11. **The centre-screen Chain milestone pill at `top: 64%`**, which sits under the character. Replace it with the right-lane stamp.
12. **Discovery banners in the centre column** (`top: max(30%, 258px)`). Replace them with right-lane toasts.
13. **Centre announcements for beats** (Elite Surge, Swarm). Replace them with the act-bar ribbon. Keep the centre announcement only for the boss awakening (1.2 s).
14. **The text label on the shrine edge arrow.** Replace it with an icon + distance, and clamp to the safe rect.
15. **Relic hover tooltips during play** (`pointer-events: auto` on `.hud-relics`). Show them only in pause.
16. **Magenta in the Chain colour ramp** (`CHAIN_MAGENTA`) and the milestone `#ff4fd8`. Replace with white → amber → prism.
17. **The growing Chain font size** (34 + n·0.5 px). Use a fixed 64 px and escalate through colour and the stamp.
18. **Auto-skill rank as a number** (`<i>${s.rank}</i>`). Replace with pips, matching the slots.
19. **Flavour text on relic choice cards.** Show it in the codex and pause only.
20. **On the title screen:** the controls footer line, the 4 checkboxes (move them to Settings), and 6 text blocks × 4 class cards (replace with one selected-class panel).

---

## 13. Implementation notes (for the implementer)

* **Ownership:**
  * `src/ui/hud.js` (layout, character cluster, slots, boss, act timeline).
  * `src/ui/hud-fx.js` (toasts, feed + Chain merge, milestone stamp, boss intro).
  * `src/ui/ui.js` (level-up, relic, pause).
  * `src/ui/menus.js` (Sanctum).
  * `css/ui.css`.
* **Keep these selectors** for the tutorial `_glow`: `.hud-slots`, `.hud-dash`, `.hud-chain`. If you add a glow for HP, use `.hud-hp`.
* **Character cluster:**
  * Project `player.pos` (y = 0) with the same math as `_updateShrine`.
  * `translate3d` one container per frame, and don't touch layout properties. Add 16 px × `--u` below the feet.
  * Hide it when the projection is off-screen (it never should be).
* **Edge markers:**
  * Generalise `_updateShrine` into `EdgeMarkers` with a list of `{pos, icon, color}`: shrine, Relic Bearer (while alive), any unopened chest.
  * The clamp uses the safe rect from §11.3, not a flat 56 px margin.
* **Data the HUD needs that may not exist yet:**
  * `boss.wardT` (time left in the ward cycle).
  * The ward-broken-until-cycle flag.
  * The beat schedule from `acts.js` (1:30 / 2:15 / 3:00) exported as data.
  * The primer clock-hold flag.
  * Relic runtime state (`secondWindUsed`, `overclockCount`).
  * For level-up cards: `card.rankFrom` / `rankTo`, `card.delta` (a short delta string per rank, written alongside each skill's rank table), and `card.synergy` (computed in the card builder: fusion partner owned + ranks, or a reaction partner among owned elements, with the reaction named only if it's in `codex.reactions`).
* **Icons:** emoji render differently per OS and have uneven visual weight. Plan an SVG sprite for the 4 element shapes, ~25 skills, 18 relics, 4 buffs and 3 beat glyphs. The shapes from §10.3 work as fallbacks today with plain Unicode (▲ ⬢ ◆ ✦) in the HUD font.
* **Verification:**
  * Screenshot at 1280×720 and 1920×1080 in each act, in a boss fight, and at Chain ≥ 25.
  * Measure: bottom HUD ≤ 92 px tall at 720p; no HUD box intersects the central 60%×60% except the cluster; no text < 11 px at 720p.
  * Use the hidden-pane harness (memory: riftbound-sim-harness).

---

## Sources

* Xbox Accessibility Guidelines 101, text display (font size table, body-height measurement): https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md
* Xbox Accessibility Guidelines 102, contrast (4.5:1 / 3:1, worst-case background, plates and outlines): https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-102-contrast.md
* Xbox handheld guidelines (14 px minimum / 18 px recommended at 1080p handheld): https://devdocs.xbox.com/build/gdk-and-engines/handheld/handheld-guidelines-and-testcases
* Game Accessibility Guidelines, readable default font size (28 px, 10-foot): https://gameaccessibilityguidelines.com/use-an-easily-readable-default-font-size/
* Game Accessibility Guidelines, no information by colour alone: https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-colour-alone/
* W3C, Understanding WCAG 2.3.1, three flashes: https://www.w3.org/WAI/WCAG21/Understanding/three-flashes.html
* Okabe–Ito / Wong colour-blind-safe palette reference: https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference
* Vampire Survivors wiki, level up: https://vampire.survivors.wiki/w/Level_up
* Vampire Survivors banish mechanic: https://gmdq.substack.com/p/vampire-survivors-banish-mechanic
* Diablo IV HUD (bottom bar, centred / left-corner configuration): https://www.purediablo.com/diablo4/HUD , https://www.destructoid.com/how-to-change-your-hud-in-diablo-4/
* Hades rarity colours (wiki): https://hades.wiki.fextralife.com/Artemis'+Aid
* Hades boon rank vs rarity confusion: https://www.pcinvasion.com/hades-guide-olympian-god-boons-skills/2/
* Hades II "Improved Boon Info UI" mod (build-state on choice screens): https://thunderstore.io/c/hades-ii/p/SMarBe/Improved_Boon_Info_UI/v/1.2.0/
* 20 Minutes Till Dawn ammo: https://20-minutes-till-dawn.fandom.com/wiki/Ammo
* Player feedback on corner vs near-character bars: https://itch.io/post/8359014 , https://redlib.belloworld.it/r/Eitr/comments/gfocxo/mini_dev_stamina_bar/fqz6p7m/?context=3
* Game UI Database (verify the (M) placements): https://www.gameuidatabase.com/
* Internal: `design/research/04-vfx-readability.md` (hostile colour language, text stroke), DESIGN.md §3–§12.
* CVD and contrast numbers: computed for this doc (Machado et al. 2009 severity-1.0 matrices in linear sRGB, CIELAB ΔE76; WCAG relative-luminance contrast). The background swatches are representative biome ground colours, not sampled from renders. Re-measure on real screenshots.
