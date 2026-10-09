# 10 — Ability VFX direction bible

**Scope.** This doc directs how every player ability, reaction, dash, trait, status and rank-up should look once the new VFX toolkit lands. The toolkit adds atlas sprite particles, velocity streaks, instanced debris, noise-scrolled shader shells, ribbons, growing ground decals, cloud puff clusters and status overlays on instanced enemies. It answers the playtest note: *"instead of drawing a circle to resemble a blizzard, can't we draw an actual blizzard in that zone?"* — for **every** effect, not only the named ones.

**Inputs read.**
- DESIGN.md §5–§7, §10, §11 and ARCHITECTURE.md (palette, FX contract).
- All of `src/game/skills/*.js`, the reactions and statuses in `combat.js`, the dashes and traits in `player.js`, and `fx.js` (particles, heat budget, telegraph shader).
- `world.js` hazards and crystals, `pickups.js` colours, the three biome headers, and `design/research/04-vfx-readability.md`, which this doc builds on.

**Gameplay numbers here come from the code** (which wins over DESIGN where DESIGN says "existing"). `×area` means `player.stats.area`. Visual radii must equal these numbers exactly.

---

## 0. TL;DR

1. **Every spell today is the same five things**: round glow dots (`fx.burst`/`spark`), a flat expanding `fx.ring`, a flat glow disc, a glowing sphere, and Line2 lightning. Element is carried by **hue alone**, so at low zoom or in overlap the four elements merge into "glowy coloured confetti". The fix is to give each element its own **shape, value structure, motion and residue**, with hue as only the fourth cue.
2. **Four element languages**, each tied to the world:
   - **Fire = the Ember Prime's forge.** Round, rising billows. White-hot core over **charcoal soot**, the darkest values in the game. Leaves scorch, slag and cooling embers. Fire *never* passes through red: it cools orange → brown → charcoal.
   - **Frost = squall and glacier.** Angular, hexagonal, spiky. High-key whites with **navy linework**. Falls, settles and creeps along the ground. Leaves rime that recedes.
   - **Storm = thunderheads.** Thin forked lines and 4-point stars over **slate cloud**. Instant, strobing, gone in ≤ 0.15 s. Leaves only scorch flecks.
   - **Arcane = the Rift prism.** Circles, glyphs and spirals. Low-key **void-violet pools** pricked by white starlight. Converges first, then pops. Leaves glyph after-images.
3. **Zones show their radius with a physical edge, never a glowing flat circle.**
   - Blizzard: a snow-drift ridge plus ice spikes.
   - Crater: a slag lip.
   - Singularity: a rune circle.
   - Thunderhead: the rain curtain.
   - The rule is **edge = gameplay radius ± 5%**, and the edge carries the value contrast while the interior stays at ≤ 0.25 alpha.
4. **"Glow = live."** Anything still dealing damage glows. When it stops, it loses its glow and becomes dead residue (scorch, melt) that fades within ≤ 1.2 s.
5. **Hierarchy:** hostile telegraphs and bullets > the player > enemy silhouettes > pickups > own impacts > own zones > ambient. Player ground layers fade to 30% inside active hostile telegraphs (a uniform mask, §5.3).
6. **Reserved and conflicting colours I found in the code (fix with this pass):**
   - **Combust uses pink `0xff5aa0` / `#ff7ab8`**, which is too close to enemy-bullet magenta `0xff2a6d`. Recolour it to "violet-wrapped ember".
   - **Tempest's sky strike uses an *orange* (fire) telegraph.** It should be dashed storm-lemon.
   - **Combust and Phase Step use Line2 *lightning***, which is storm language. Use ember arcs and a starlight path instead.
   - Storm lemon must stay clear of elite gold (`ELITE_RIM` ≈ `#ffb329`) and big XP gems (`0xffc83a`).
   - Frost ice chips must not sit on the ground long enough to read as small XP gems (`0x4fb8ff`).
   - Player storm bolts must stay distinct from the Act III **hostile** lightning hazard, which is white-blue `0xe8f6ff` with a red telegraph.
7. **Rank-ups escalate the secondary layers, never the gameplay footprint.** Rank 3 unlocks one "signature detail" and rank 5 unlocks a second one plus a white-hot core. Fusions get one world-scale element (sky, ground or weather) that no base skill has.
8. **Spam control:** three LOD tiers keyed off the existing `fx.heat` (§5.5), same-element ground decals that use `MAX` blending so overlaps don't stack darkness, visual merging of nearby repeated zones (Hailstorm, Wildfire), and starter projectiles ≤ 0.45 u wide.
9. **Priority** (frequency × weakness, §6): the top tier is statuses on enemies, Cinder Bolt (the free starter), Spirit Orbs, Spark and Arcane Bolt, then Wildfire, Flame Dash, Fireball, Steam Burst and Blizzard. There are **five implementation bundles**: one shared foundation, plus Fire, Frost, Storm and Arcane+Reactions.

---

## 1. Ground truths the art has to respect

| Fact | Value | Consequence |
|---|---|---|
| Camera | ortho iso, `viewSize` 24 u vertical, zoom 0.6–1.6 | 1 u ≈ 45 px at 1080p and zoom 1, **27 px at zoom 0.6**, 72 px at 1.6. A 0.1 u flake is 3 px at min zoom, so the smallest *meaningful* sprite is 0.12 u. |
| Sun | `SUN_OFFSET` (−12, 34, 24) | Real shadows fall toward +x/−z at 0.79 × height. A cloud at y 5 would cast its shadow 3.9 u off-centre. **For zones, fake the shadow as a decal centred on the zone** (gameplay truth beats physics). |
| Blend | `BLEND_ADD` (rgb adds, alpha darkens) | Every glow carries its own dark halo via `occ`. The new atlas sprites need two modes in one draw: **G** (blend-add glow) and **P** (painted, premultiplied normal: smoke, mist, soot). |
| Bloom | peak channel > 1.1 | Bodies ×1.4–1.8, cores ×2–2.5. Painted smoke ×1 never blooms. |
| Heat budget | `budget() = 1/(1+heat/120)`, heat decays e^(−3t) | Reused for the LOD tiers in §5.5. |
| Particles | one `Points` draw, 5,000 cap, round soft dots | Replaced by the atlas sprite system; keep a cap. |
| Statuses today | one `h.tint` wash (frozen 0.34, others 0.17) + frozen pose hold + burn puffs | Only one status is visible at a time and nothing shows Chill progress. |
| Lights | 6 pooled, ×0.3 | At most 1 light per impact; none per projectile. |

**Biome conflicts (playfield colours from the biome files):**

| Act | Ground | Ambient that collides | Watch-out |
|---|---|---|---|
| I Thornwood | greens `#44803a`–`#5c9440` | additive pollen motes `#fff0a8`, butter flowers `#f6d050`, periwinkle `#7c9cf0` | Storm lemon specks look like pollen, so storm particles must **flicker and streak** and never drift slowly. Frost reads well. |
| II Barrens | ochre `#a68e70`–`#c8ba9e`, salt `#ddd2b8`, geysers `#ffc860` + dark dirt | warm dust motes `#ead2a6`, fire geysers | Fire orange on ochre has little hue contrast, so **fire must carry charcoal soot**. Frost white vs salt pan: frost needs navy linework. |
| III Reach | cool greens, water `#1d6684`/`#3c9c9a`, prism crystals `#e6f4ff`, ambient rain `#d8e6f2` (thin, vertical, α 0.22), slate cloud shadows | hostile lightning `#e8f6ff` + red telegraph | Frost on water needs the navy outline. Storm bolts must stay **lemon-cored and slate-backed**, never white-blue. Player rain (Thunderhead) must be localised, slanted and sleet-flecked. |

---

## 2. Element visual languages

### 2.1 Summary card (distinct at 27 px/u and in greyscale)

| | **Fire — Ember Prime** | **Frost — Squall & Glacier** | **Storm — Thunderhead** | **Arcane — Rift Prism** |
|---|---|---|---|---|
| Silhouette | **Rounded billows; upward teardrops**; mushroom caps | **Angular**: hex flakes, spikes, faceted shards, dendritic edges | **Zig-zag lines**, forks, 4-point stars | **Circles, arcs, spirals, glyphs**; precise geometry |
| Greyscale read | widest value range: tiny white core, **black soot** | **high-key**: big white/pale masses, thin navy lines | **thin brightest lines** on **dark slate**, almost no area | **low-key**: dark void pools pricked by white star points |
| Motion | **rises** (gravity −1 to −3), billows ease-out, flicker 8–12 Hz | **falls, settles, creeps** (gravity +), slow ease-in-out, then **holds** (freeze frames) and **cracks** suddenly | **instant** (0–2 frames), 2–3 re-strikes at 40 ms, gone ≤ 0.15 s | **orbits and spirals**; **converges, then pops** (inward anticipation); constant smooth rotation |
| Residue | scorch, slag, cooling embers, ash flakes (longest) | rime, ice shards, cold fog; **recedes** edge → centre | scorch flecks, fulgurite lines (≤ 0.8 s) | glyph after-images that unwrite clockwise (≤ 0.5 s) |
| "Sound of the shape" | *whumpf — crackle — hiss* | *crack — tink — shhh* | *SNAP — tick-tick — rumble* | *hum — whoom (reversed) — chime* |
| Primary toolkit pieces | SHELL flame, SPR flame/ember/smoke/ash, DECAL scorch/crater, DEBRIS rock | DEBRIS ice, SPR snowflake/iceChip, SHELL snow sheet/funnel, DECAL frostCreep, CLOUD (white) | Line2 bolts (3-strand), SPR spark, STREAK, CLOUD (slate), SHELL rain curtain | DECAL runeCircle, SPR rune/spark, SHELL vortex/orb, RIBBON |

The low-zoom test: blur a screenshot to 8 px and convert it to greyscale.
- Fire is a dark plume with a white dot at its base.
- Frost is a white flat patch with spikes on its rim.
- Storm is a bright crack line that is gone next frame.
- Arcane is a dark disc with a bright ring and dots spiralling in.

These four never collapse into one another, even at equal hue saturation.

### 2.2 Colour ramps (hex)

Fire stays at hue ≥ 17°, arcane at hue ≤ 285°, and nothing sits in the reserved hostile band of **330°–15°** (telegraph `#ff2a3d` is 354°; bullet `#ff2a6d` is 342°).

| Role | Fire | Frost | Storm | Arcane |
|---|---|---|---|---|
| Core (tiny, ×2–2.5) | `#FFF4D6` | `#FFFFFF` | `#FFFBE0` | `#FFFFFF` |
| Hot / highlight | `#FFD25A` | `#E8F6FF` (rime) | `#FFF3A0` | `#E6D4FF` |
| Body (×1.4–1.8) | `#FF7A2A` | `#BFF4FF` ice / `#7FE0FF` | `#FFE45C` | `#C08CFF` |
| Edge / deep | `#E0561C` (17.8°) | `#3FA8E0` glacier | `#C9B22E` | `#8A4DFF` |
| Cooling / shadow tint | `#A8441A` → `#6A3A20` ember-brown | `#1F6FA8` | — | `#4A2390` dusk |
| **Dark partner** (painted) | soot `#2A1A14`, char `#3A2A22`, smoke `#4A3A34` | **navy** `#1B3A5C` (linework, outlines, under-strands) | **slate** `#2E3648`, cloud belly `#3D4B63` | **void** `#1A0633` |
| Light painted layer | ash flake `#8A7F76` | mist `#CFE8F4` α ≤ 0.35 | cloud top `#E6ECF4`, rain `#9FB4C8` | — |
| Rare accent (≤ 10% of particles) | — | — | ozone glint `#D8F0FF` (tiny, never on bolts) | prism glints `#9FF3FF` / `#FFF3C0` (star twinkles only) |
| Never | red, pink, anything < 17° | saturated blue *on the ground* > 0.6 s (reads as XP gems) | white-blue bolts (the hostile hazard), gold `#FFB329`–`#FFC83A` (elite rim, XP gems) | pink/magenta (> 285°) |

### 2.3 Element notes

**Fire (Ember Prime).**
- The Prime is a forge: coal, molten rock and soot. Every fire effect has *three layers*: a white-yellow core, an orange flame body (toon-stepped in 3 bands, not a gradient), and a **charcoal soot layer above and behind**.
- Soot is what makes fire readable on Act II ochre and against the yellow-white Act II geysers. Geysers erupt *vertically* with dirt clods; player fire billows *outward and rises*.
- Embers are streaks, not dots: velocity-stretched, rising, and swaying sideways like heat convection.
- Debris is basalt (`#2A1A14` body with `#FF8A2A` emissive cracks).
- Cooling sequence: orange → `#A8441A` → `#6A3A20` → charcoal → ash flakes `#8A7F76` drifting up.

**Frost (squall, rime, glacier, cold mist).**
- Every frost effect has a *ground layer* (rime decal creeping with a dendritic edge), a *solid layer* (faceted ice debris, toon-lit, 2 tones, with a **navy inverted-hull outline** like the creatures, so ice reads on water and salt), and an *air layer* (6-point flakes falling or driven by wind, plus low painted mist).
- Frost holds still, then breaks: spikes stand, then crack and shatter into chips that fall with gravity 14 and fade within 0.6 s.
- Frost is the only element that **recedes**: decals melt from the edge to the centre at the end.

**Storm (thunderheads, forked bolts, rain sheets, ozone sparks).**
- Bolts are **3-strand Line2**:
  - under-strand: slate `#2E3648`, 8 px, α 0.6
  - glow: `#FFE45C`, 5 px
  - core: `#FFFBE0`, 2 px
- One segment per 0.6 u, jag 0.35–0.5, and 1–2 side twigs of 0.3–0.8 u that die a frame earlier. Re-randomise the jag at +40 ms and +80 ms (strobe), then show an afterimage for 60 ms (glow strand only, α 0.35), then nothing.
- Every bolt that hits the ground **grounds out**: 4–6 sparks that *bounce* once (gravity 12, restitution 0.4), a 0.35–0.5 u scorch fleck and a dust puff.
- Sky strikes come from a *visible* slate cloud puff, never from empty sky.
- Particles are 4-point stars and streaks, never round dots, so they can't be confused with pollen.

**Arcane (Rift violet-prism, glyphs, gravity, starlight).**
- Arcane is *geometric and gravitational*. Every arcane effect has a **void pool** (painted `#1A0633` α 0.35–0.5), a **glyph or ring structure** in `#C08CFF` (precise, rotating at a constant rate), and **starlight** (white 4-point stars and twinkles).
- Its signature motion is **converge → pop**: motes spawn on a circle and rush inward for 0.06–0.12 s, then a star flare pops outward. It is the only element whose anticipation points inward.
- Residue: glyphs "unwrite" clockwise (an arc-length mask from 1 → 0) over 0.3–0.5 s.

---

## 3. Toolkit shorthand used below

The toolkit is being researched in parallel. These names map to its primitives; sizes are world units.

| Tag | Meaning |
|---|---|
| `SPR:<frame> G\|P` | atlas sprite particle. Frames: `snowflake`, `smoke`, `flame`, `ember`, `spark` (4-point star), `iceChip`, `ash`, `rune`. **G** = blend-add glow, **P** = painted (normal, premultiplied). |
| `STREAK` | velocity-stretched sprite (length = speed × k, k ≈ 0.03 s unless given) |
| `DEBRIS:<kind>` | instanced physical mesh with gravity, bounce, spin and a toon shader: `rock` (basalt + ember cracks), `ice` (faceted spike/plate/chip, navy outline), `clod` (biome-tinted dirt/grass), `glyphShard` |
| `SHELL:<kind>` | noise-scrolled shader mesh with toon-stepped dissolve: `flame` (cone tongue), `flameOrb`, `orb` (fresnel cage), `funnel`, `vortex` (flat swirl disc), `snowSheet` (open cylinder band), `rainCurtain`, `wave` (vertical expanding band) |
| `RIBBON` | camera-facing trail strip (width curve, colour ramp) |
| `DECAL:<kind>` | ground decal with `grow(t)`/`recede(t)` and an **edge band**: `frostCreep`, `scorch`, `crater`, `runeCircle`, `wet`, `shadow` |
| `CLOUD` | puff cluster (instanced, toon 2-step: sunlit top, slate or white belly) |
| `OVERLAY:<status>` | per-instance status layer on creature rigs (renderer attribute + shader branch) |
| `BOLT` | 3-strand Line2 per §2.3 (pooled) |
| `light(I)` | `fx.light`, intensity I (already ×0.3 internally) |

Beat notation: **t** in seconds from cast/spawn. **A** = anticipation, **T** = travel/active, **I** = impact, **L** = linger, **D** = dissipate.

**Retired as primary visuals:**
- `fx.ring`: allowed only as a *dust shock* (`blend:'dark'`, earth colour, ≤ 0.2 s) or a ≤ 0.15 s shockwave accent.
- `fx.flashDisc`: allowed only as a ≤ 0.08 s impact flash, at ≤ 0.6 × the gameplay radius.
- Round `fx.burst` dots: allowed only for tiny secondary sparkle.

---

## 4. Per-ability specs

### 4.1 Starters (LMB, the most frequently seen)

#### Cinder Bolt — fire (Pyromancer, **free starter**)
*Gameplay:*
- cd .30/.28/.26/.24/.22
- bolts: 1 (r2 +1, r4 +1, + Volley)
- speed 22, range 14, hit r 0.4, jitter ±0.06 rad
- 8 dmg (r3 ×1.25); r5 pierce 1, statusPower 1.5

*Today:* orange sphere 0.18 + round spark trail. *Fantasy:* **a coal flicked off the forge**: a glowing cinder with a flame tongue and a thread of soot.

| Beat | t | Spec |
|---|---|---|
| A (muzzle) | 0–0.06 | `SPR:flame G` 0.5 × 0.25 u flicked along the aim from the staff orb, `#FFD25A`→`#FF7A2A`; 3 `STREAK` embers |
| T head | travel (0.64 s max) | `SPR:flame G` oriented to velocity, **0.42 × 0.2 u**; front 30% `#FFF4D6` ×2.2, body `#FF7A2A` ×1.6, tail `#E0561C`. Under it, `SPR:smoke P` `#2A1A14` α 0.35, 0.35 u, offset 0.15 u behind (the dark partner). |
| T trail | | `STREAK` embers **25/s**, 0.06 u wide, `#FFD25A`→`#FF7A2A`, gravity −1.5 (rise), sideways jitter 0.6 u/s, life 0.25–0.4. **Soot thread**: `SPR:smoke P` `#4A3A34` 10/s, 0.18→0.35 u, α 0.35→0, rise 0.6 u/s, life 0.5. |
| I (hit) | 0–0.4 | **Cinder splash**: 6 `STREAK` embers in a 120° cone *continuing the travel direction* (momentum), speed 3–5, gravity +6. They arc and land, then lie as glowing ground dots for 0.4 s. Also: `SPR:flame G` flash 0.45 u for 0.06 s, and 1 `SPR:smoke P` puff 0.4 u. |
| Expire (no hit) | | the cinder drops, bounces once and gutters out (0.3 s) |
| Real-thing detail | | embers rise and sway; the soot thread hangs in the air a moment after the bolt is gone, so a spray of bolts paints a *smoky wake* of the stream |

*Ranks:*
- r2/r4: more coals; the jitter makes it a spray.
- r3 (+25% dmg): head ×1.15, ember rate ×1.3.
- **r5 (pierce, Burn 1.5)**: front 50% white-hot; the soot thread is 2× longer. Each pierced foe gets an `SPR:ash` puff (4 flakes) as the coal punches through, and the impact gives 10 embers.

*Perf:* r5 + Volley ≈ 14 bolts/s, ~9 live → ~315 streak/s + 90 smoke/s at tier 0 (tier 1 halves the trail, tier 2 drops the soot thread). 0 extra draws (shared sprite draws).

#### Arcane Bolt — arcane (Arcanist)
*Gameplay:*
- cd .36→.27
- bolts 1/2/2/3/3; fan 0.12·(n−1)
- 14 dmg (+15% r2, +20% r4)
- pierce r3 1, r5 3; speed 21 (r5 26), range 16, hit r 0.45

*Fantasy:* **a sliver of starlight that leaves a dotted constellation.**
- **A:** 6 motes converge on the staff orb in 0.05 s, then a `SPR:spark G` 4-point star pops at 0.5 u, `#C08CFF` with a white core.
- **T:**
  - Head: `SPR:spark G` stretched to a **0.34 × 0.14 u diamond**, core `#FFFFFF` ×2.2, body `#C08CFF` ×1.6, spinning in the screen plane at 6 rad/s, over a `SPR:smoke P` `#1A0633` α 0.4, 0.4 u underlayer.
  - `RIBBON` 0.9 u, width 0.14→0, `#C08CFF`→`#8A4DFF`, α 0.7→0.
  - **Constellation dots:** 12/s `SPR:spark G` 0.08–0.12 u, white or `#E6D4FF`, velocity 0 (they hang where the bolt passed) and twinkle out over 0.35 s.
  - Every 0.12 s, a `SPR:rune` 0.16 u stamps in place and unwrites over 0.25 s.
- **I:** converge-pop. 6 motes spawn on a 0.6 u circle around the hit and rush in for 0.1 s, then a star flare (0.55 u, 0.08 s) and a `SPR:rune` glyph 0.4 u flash on the foe's chest (0.2 s). A pierce-through gets a smaller flare and no glyph.
- **Ranks:**
  - r3 (pierce): a leading needle `STREAK` 0.5 u, so the bolt is visibly sharper.
  - r5: white-hot head, ribbon 1.3 u, constellation density ×1.5, and every 4th dot gets a prism glint (`#9FF3FF`/`#FFF3C0`).
- **Perf:** ≤ 11 bolts/s → ~130 sprites/s; ribbons batched in 1 draw.

#### Ice Shard — frost (Cryomancer)
*Gameplay:*
- cd .50→.38
- shards 1/1/2/2/3 (fan 0.18)
- 16 dmg (r2 ×1.2), pierce 2 (r4 4), statusPower 2
- speed 20, range 15
- r5: each expiring shard splits into 3 minis (6 dmg, speed 16, range 5, fan 0.5)

*Today:* an elongated glowing octahedron (the best of the starters). *Fantasy:* **a thrown icicle that trails a contrail and rimes the ground under its path.**
- **A:** `SPR:snowflake` puff (5) and a 0.05 s white star at the orb.
- **T head:** `DEBRIS:ice` spike, **1.1 × 0.24 u**, 6 facets, toon two-tone (`#3FA8E0` body, `#BFF4FF` facets, white tip), **navy outline** `#1B3A5C`, spinning about its long axis at 8 rad/s (facet glint flicker).
- **T trail:**
  - `RIBBON` contrail: 1.2 u, width 0.22, *painted* `#E8F6FF` α 0.45.
  - `SPR:snowflake` 10/s, 0.1–0.14 u, gravity +1.5, life 0.6.
  - `SPR:iceChip G` glints 6/s.
- **Real-thing detail:** a **rime line** `DECAL:frostCreep`, 0.3 u wide, grows along the ground track under the shard and fades over 0.8 s. A volley leaves frost scratches on the ground pointing where you aimed.
- **Pierce:** 4 `DEBRIS:ice` chips (0.06–0.1 u) spray *forward*, plus a 0.06 s white star.
- **Stopped on its last pierce:** shatters into 6 chips plus a `SPR:smoke P` mist puff `#CFE8F4` 0.5 u.
- **Expire at range:** the shard **sticks into the ground** at 30° for 0.5 s, then crumbles into 5 chips and a snow puff.
- **r5 split:** a 0.05 s white crack-star 0.4 u, then 3 mini spikes (0.6 u long, same material).
- **Ranks:** r3 two shards. r4 (pierce +2): a hoarfrost fringe on the shard (outline brightened to `#E8F6FF`) and a rime line 1.5× longer. r5: the split.
- **Perf:** one instanced draw for all ice debris (shards + chips, cap 400); 1 decal strip per shard (pooled, ≤ 12 live).

#### Spark — storm (Stormcaller)
*Gameplay:*
- cd .32→.24; sparks 1 (r5 2)
- speed 30, range 12; 12 dmg (r3 ×1.25)
- on hit: forks to 2 (r2 3) foes within 4 (r4 6) u, at 75% damage

*Fantasy:* **a bead of ball lightning that snaps into forks.**
- **A:** a 1-frame flash plus a 2-segment `BOLT` from the staff orb to 0.6 u ahead (40 ms).
- **T:**
  - Head: `SPR:spark G` 4-point star, 0.34 u, core `#FFFBE0` ×2.4, body `#FFE45C`. Its size jumps ±30% every frame and it rotates 45° every 2nd frame (crackle).
  - **Tail:** not a smooth ribbon. A 2–3 segment `BOLT` from the head back 1.2 u, re-randomised every 50 ms (a zig-zag tail).
  - `STREAK` sparks 20/s, speed 6, life 0.12.
- **I / forks:**
  - Each fork is a full `BOLT` (§2.3), life 90 ms plus a 60 ms afterimage.
  - Fork ends **ground out** at the target's feet (the bolt kinks down 0.6 u into the ground): 4 bounce sparks and an ozone glint (`SPR:spark` `#FFF3A0` 0.12 u ×3).
- **Ranks:**
  - r2: +fork.
  - r4 (range 6): each fork grows one 1-segment twig.
  - r5: 2 sparks; the head gets a 3-point electric cage (two 0.3 u arcs orbiting it).
- **Perf:** ≤ 8 casts/s × 4 bolts ≈ 32 BOLTs/s, 0.15 s life → ~5 live (15 Line2). **Pool Line2 at 48.**

### 4.2 Shared skills

#### Fireball — fire
*Gameplay:*
- cd 1.1/1.0/.95/.9/.8; 1 ball (r4 2, spread 0.25)
- speed 15, range 15
- explosion r **2.2×area** (r3 ×1.25 = **2.75**), 24 dmg (r2 ×1.2), knockback 3
- r5: burning patch **r 1.2×area for 2.5 s**, 6 fire / 0.5 s

*Fantasy:* **a hurled blob of forge-fire that bursts into a soot mushroom.**

| Beat | t | Spec |
|---|---|---|
| A | 0–0.08 | flame tongue from the orb; the ball forms (scale 0.3 → 1) |
| T | ≤ 1.0 | `SHELL:flameOrb` 0.55 u, 3 toon bands (`#FFF4D6`/`#FFD25A`/`#FF7A2A`), edge `#E0561C`; trailing `SHELL:flame` cone 1.1 u stretched against velocity. `SPR:flame G` 30/s (0.3→0.1 u, 0.25 s), `SPR:smoke P` `#2A1A14`→`#4A3A34` 15/s (0.3→0.7 u, rise 0.8, life 0.7), embers 15/s. **Blob shadow** dot on the ground (P black α 0.25, 0.35 u) to sell the 0.9 u height. |
| I flash | 0–0.06 | `SPR:flame G` `#FFF4D6`, 0.8·r |
| I billow | 0–0.25 | 8 `SPR:flame` puffs pushed radially to 0.75·r, size 0.6→1.1 u, rising 1.5 u/s, colour stepping `#FFD25A`→`#FF7A2A`→`#E0561C` |
| I embers (edge read) | 0–0.5 | 14 `STREAK` embers launched outward at speed r/0.35, gravity 8, so **they land on the radius** |
| I dust shock | 0–0.18 | `fx.ring` dust shock `blend:'dark'`, earth colour of the biome (`#8A6A4A`), to r (knockback read) |
| L soot | 0.05–0.9 | 6 `SPR:smoke P` `#2A1A14`, 0.8→1.6 u, rising to 2.5 u (a mushroom cap), α 0.55→0 |
| L scorch | 0–1.5 | `DECAL:scorch`, **radius = r**, darker edge band 0.2 u (`#241A16` α 0.55) with 5–7 cooling ember dots (`#FF8A2A`→`#6A3A20` over 1.2 s); no glow after 0.4 s (glow = live) |

*r5 burning patch (r 1.2, 2.5 s):*
- `DECAL:scorch` r 1.2 with a **slag lip** at 1.2 u.
- 3 `SHELL:flame` tongues (0.5–0.8 u, swaying 1.5 Hz), embers 10/s.
- Flames shrink over the last 0.4 s, then the lip loses its glow.

*Ranks:* r3 radius (exact), r4 two balls, r5 patch. *Perf:* ≈ 60 sprites + 1 decal + `light(50)` per explosion; at r5 ×2 per 0.8 s → ~150 sprites/s.

#### Frost Nova — frost
*Gameplay:*
- cd 3.2/3.0/2.8/2.6/2.2, centred on the player
- r **4.5×area** (r3 ×1.25 = **5.63**), expands in **0.35 s**
- 12 dmg (r2 ×1.3), statusPower 2 (r4 3), knockback 5
- r5: a second pulse at +0.5 s

*Today:* one flat cyan ring plus 12 dots. *Fantasy:* **the ground flash-freezes outward from your feet and throws up a ring of ice.**

| Beat | t | Spec |
|---|---|---|
| A | 0–0.06 | white star at the feet; 8 snow motes sucked in (inward, 0.06 s) |
| T front | 0–0.35 | `DECAL:frostCreep` grows 0 → R, matching the damage front exactly. **Leading edge** 0.25 u bright `#FFFFFF`/`#BFF4FF` with a dendritic or voronoi crack pattern; interior rime `#E8F6FF` α 0.35 with navy cracks `#1B3A5C` α 0.4. `SHELL:snowSheet` wall 0.4 u high riding the front (white, dissolving top). |
| T mist | 0–0.5 | 12 `SPR:smoke P` `#E8F6FF` α 0.3, 1–1.4 u, y 0.25, pushed outward with the front, then slowing (cold-air skirt) |
| I **spike ring** (edge) | 0.30–0.40 | **16–20 `DEBRIS:ice` spikes erupt at exactly R** (height 0.5–0.9 u, tilted 25° outward, irregular spacing ±20%), popping up 0.1 s as the front reaches them |
| L | 0.4–1.0 | spikes stand; hit foes get rime (Chill overlay) |
| D | 1.0–1.3 | spikes crack (white line flash 1 frame), then shatter into 4 chips each, falling with gravity 14; the decal **recedes edge → centre** over 0.8 s with `SPR:smoke P` sublimation puffs ×10 |

*Ranks:*
- r3: radius.
- r4 (statusPower 3): spikes ×1.3 tall, glacier-blue cores `#3FA8E0`.
- **r5 second pulse:** a thinner "aftershock" front with a 2nd ring of shorter spikes (0.4 u) at R − 0.4 u, so two spike families read.

*Perf:* ≤ 100 debris instances, 1 decal, ~40 sprites per cast.

#### Chain Lightning — storm
*Gameplay:*
- cd 1.4→1.0; bounces 3/4/5/6/8, range 5.5
- 16 dmg ×0.92 per hop, scaling +15%/rank
- source at the orb (y 1.9); first target near the cursor (4 u), else nearest to the player (12 u)

*Fantasy:* **a real forked bolt jumping body to body, scorching where it lands.**
- **Per hop:**
  - `BOLT` (segments = length/0.6, jag 0.45, 1–2 twigs), life 0.12 s with re-strikes at 40/80 ms.
  - **Visual-only stagger of 25 ms per hop** (damage stays instant), so 8 hops draw over 0.2 s and the eye can follow the chain.
  - The target jolts (`OVERLAY:shock` jolt pulse) and grounds out: 4 bounce sparks, a scorch fleck `DECAL:scorch` 0.35 u (`#241A16` α 0.4, 1 s), ozone glints ×3.
- **Last target:** a short vertical grounding bolt (0.8 u) plus 6 sparks.
- **Lights:** `light(20)` only on the first and last hop (the pool is 6).
- **Fizzle (no target):** a 3 u bolt that dissipates into 6 sparks in the air.
- **Ranks:** hop count shows it. r5 (8 hops): core 3 px, plus an **ionised path** afterimage (`#FFE45C` α 0.25 for 0.25 s) along the whole chain.
- **Perf:** up to 8 BOLTs live for 0.2 s (24 Line2, pooled).

#### Spirit Orbs — arcane, auto
*Gameplay:*
- orbs 2/3/3/4/5, orbit r 2.2×area (r5 2.8)
- 2.6 rad/s, y 1.0 ± 0.15, contact r 0.55
- 9 dmg (+25% r3, +25% r5), 0.5 s per-foe cooldown, knockback 3

*Fantasy:* **tiny bound moons of starlight, each a miniature galaxy.**
- **Body:**
  - `SHELL:orb` 0.45 u: fresnel rim `#C08CFF`, interior swirl noise `#1A0633`→`#4A2390`, and a `SPR:spark` white core 0.18 u ×2.2.
  - One `SPR:rune` 0.12 u satellite orbits each moon at 0.35 u, 4 rad/s.
- **Orbit read without a circle:** each orb drags a `RIBBON` 1.4 u along its orbit (width 0.12, `#8A4DFF`→0). The arcs of 2–5 orbs sketch the orbit radius.
- **Hit:** the orb squashes to 0.8 for 0.05 s, then a converge-pop (5 motes) and a glyph flash on the foe.
- **Ranks:**
  - count shows it; r3/r5 damage brightens the shell ×1.15.
  - **r5:** ribbons 1.8 u, plus faint **constellation lines** (Line2 1 px, `#C08CFF` α 0.2) between consecutive orbs, so a star polygon rotates around you.
- **Perf:** 5 shells (instance them), 1 ribbon draw, ~10 sprites/s per orb.

#### Meteor — fire
*Gameplay:*
- cd 4.5→3.2, range 14, fall 0.8 s
- impact r **3.2×area** (r5 ×1.3), 60 dmg (r2 ×1.25), knockback 8
- crater r **2.6×area** (r5 ×1.3) for 2.5 s (r4 4 s), 8 fire / 0.5 s
- r3: a 2nd meteor 3 u away at +0.25 s

*Today:* the closest to real (dashed telegraph, glowing icosa falling, crater disc). *Fantasy:* **a chunk of the Ember Prime falls out of the sky, punches a crater and leaves cooling slag.**

| Beat | t | Spec |
|---|---|---|
| A | 0–0.8 | Keep the friendly dashed telegraph (exact r). **Growing shadow** at the centre: P black α 0.15→0.45, r 0.4→1.6 u (true height read). The rock: `DEBRIS:rock` 0.9 u basalt `#2A1A14` with emissive crack network `#FF8A2A` ×1.8, tumbling. `SHELL:flame` comet tail 3 u, plus a **smoke `RIBBON` P** `#4A3A34` width 0.8, 6 u long, so a dark scar across the sky reads on bright ground. |
| I | 0.8 | flash `SPR:flame` `#FFF4D6` 1.4 u / 0.06 s; `light(60)`; shake 0.25 |
| I debris (edge) | 0.8–1.6 | 10–14 `DEBRIS:rock` chunks (0.15–0.35 u) launched 6–9 u/s, gravity 18, one bounce, **landing inside r**; they stay 1.2 s, then sink |
| I dust ring | 0.8–1.05 | 10 `SPR:smoke P` (biome dust: `#8A7A6A` Act II, `#6E6A5A` I/III) rolling out along the ground to **exactly r**, then lifting |
| I flame column | 0.8–1.1 | 3 `SHELL:flame` tongues 2.5 u tall, dissolving; 20 `STREAK` embers |
| L crater | → life | `DECAL:crater` r = craterR: charcoal bowl `#241A16`, **molten crack network** `#FF8A2A` ×1.6 cooling toward `#6A3A20` over the life, **raised slag lip** at the crater radius (lighter `#8A6A4A` with a dark outline). 3–5 `SHELL:flame` tongues (0.5–0.9 u) in the cracks, embers 16/s, heat smoke P 4/s. |
| D | last 40% | cracks dim, flames gutter; at end-of-damage the glow is gone; the decal holds 1 s as dead scorch, then fades |

*Ranks:* r3 second rock (its own shadow and telegraph); r4 longer slag; r5 the rock is ×1.3 and debris ×1.3. *Perf:* debris shares the instanced pool; 2 decals; ~80 sprites per impact.

#### Blizzard — frost (the playtest's example)
*Gameplay:*
- cd 7→5, range 14
- r **3.5×area** (r2 ×1.15 = **4.03**), 4 s (r3 **6 s**)
- tick 0.33 s, 5 frost (r4 ×1.4), statusPower 1
- r5: pull 2 u/s

*Today:* a flat blue disc, a pulsing ring, falling dots. *Fantasy:* **an actual squall parks over the zone.**

| Beat | t | Spec |
|---|---|---|
| A / form | 0–0.35 | `CLOUD` of 7–9 puffs condenses at y 4.5 (scale 0.3 → 1, puffs rolling inward): top `#F4F8FC`, belly `#9FB4C8`, toon 2-step, cluster diameter 1.1·R. A **cool shadow** `DECAL:shadow` centred on the zone: `#1B3A5C` α 0 → 0.22, radius R, soft edge 0.6 u. |
| T ground | 0–0.6 | `DECAL:frostCreep` grows centre → R in 0.6 s with a dendritic edge |
| T snow | active | `SPR:snowflake` 0.12–0.18 u, **60/s** (r3+ 80/s), spawned under the cloud (r ≤ 0.9·R), falling at 2.2 u/s. **Wind:** tangential velocity 2.5 u/s × (r/R), so flakes swirl around the centre with a 35° slant. 30% are `STREAK` snow (length 0.35) for driven snow. Life is set so flakes land inside R. |
| T sheets | active | 2 × `SHELL:snowSheet` open cylinder bands, radii 0.6·R and **0.97·R**, height 2.2 u, toon-stepped alpha with gaps (≤ 0.35), counter-rotating ±0.6 rad/s. The outer band is the **snow curtain at the boundary**. |
| T fog | active | 10 `SPR:smoke P` `#E8F6FF` α 0.3, 1.2–1.8 u, y 0.25, drifting tangentially, kept inside 0.85·R |
| **Edge** | 0.4–0.8 → | `DECAL` edge band = **snow-drift ridge** 0.3 u wide at R: `#FFFFFF` α 0.7 over a navy under-line `#1B3A5C` α 0.45. Plus **10–14 small `DEBRIS:ice` spikes** (0.25–0.45 u) sprouting at R between 0.4 and 0.8 s, irregular, tilted outward. |
| Foes inside | | `OVERLAY:chill` rime climbs with stacks (§4.7); frost breath puffs on the tick (1 `SPR:smoke P` per 3 foes per tick) |
| D | last 0.5 s | cloud dissolves (toon dissolve), snow rate → 0, sheets fade, spikes crumble to chips, creep **recedes edge → centre**, fog lifts and thins |

*Ranks:*
- r2: radius.
- r3: 6 s, cloud of 11 puffs.
- **r4** (+40% dmg): flakes ×1.2, plus **hail**: 6/s `DEBRIS:ice` pellets falling fast (8 u/s), bouncing once.
- **r5 pull:** snow and fog gain an inward radial velocity of −1 u/s; the sheets **tilt into a funnel** (top radius 0.8× bottom); the cloud slowly rotates.

*Perf:* ~120 live flakes, 2 shells, 1 cloud (9–11 instances), 2 decals, 14 spikes → ~6 draws per blizzard (shared draws when several are active).

#### Static Field — storm, auto
*Gameplay:*
- every 1.3/1.2/1.1/1.0/0.9 s, strikes 1/1/2/2/3 random foes within 10×area
- 22 dmg (r4 ×1.3); the halo is r 1.1

*Fantasy:* **you carry a charged sky.**
- **Aura** (replaces the flat ring):
  - 6–10 tiny ground arcs (Line2, 0.3–0.6 u, 2 segments) crawling around the feet at r 0.6–1.1 and flickering (50% duty).
  - `SPR:spark` motes rising 6/s.
- **Pre-roll (gameplay timing unchanged):** pick targets **0.15 s early** (at `cd ≤ 0.15`). Over each target, a slate `CLOUD` puff trio (0.6 u, `#3D4B63` belly, `#E6ECF4` top) forms at y 7.
- **Strike** on the original tick:
  - The cloud lights from inside (`#FFF3A0`, 50 ms).
  - `BOLT` from the cloud to the target with 2 twigs; a ground-out of 6 bounce sparks, a 0.5 u scorch fleck and a dust puff P.
  - The cloud dissipates over 0.3 s.
- **Ranks:**
  - strike count.
  - r4 (+30%): scorch flecks gain glowing fulgurite lines (`#FFE45C` → dark over 0.6 s); bolts 3 px core.
  - r5: aura arc count ×1.5.
- **Hostile distinction:** the Act III hazard is a white-blue bolt with a red telegraph and no cloud. Player strikes are lemon-cored, slate-backed and always come from a visible puff.
- **Perf:** per strike, 3 Line2 + 3 cloud instances + ~12 sprites.

#### Singularity — arcane
*Gameplay:*
- cd 9/8.5/8/7.5/6, range 14
- r **5×area** (r2 ×1.2 = **6**), 2.5 s (r3 **3.5 s**)
- pull up to 7 u/s (25–100% by distance), 4 arcane / 0.25 s
- then **collapse r 3×area**, 30 dmg (r4 60)

*Fantasy:* **a tear in the world's fabric: an event horizon with an accretion disc, starlight and ground debris spiralling in.**

| Beat | t | Spec |
|---|---|---|
| A / open | 0–0.35 | `DECAL:runeCircle` **at R** inscribes itself clockwise over 0.35 s (glyph band 0.25 u, `#C08CFF` ×1.4 on void `#1A0633` α 0.5), rotating 0.3 rad/s while live. A **second inner glyph ring at 3·area** (the collapse radius) is drawn faintly at α 0.3. |
| T core | active | Black sphere 0.7 u (event horizon) inside `SHELL:vortex` accretion disc r 1.6 u at y 1.2, tilted 15° toward the camera: inner `#FFFFFF`/`#E6D4FF`, mid `#C08CFF`, outer `#8A4DFF` → 0; spins 4 rad/s. A thin bright **Einstein ring** (Line2 circle 0.9 u, `#E6D4FF`). |
| T ground | active | `SHELL:vortex` flat spiral on the ground, radius R: painted `#1A0633` α 0.4 with violet arm highlights, rotating 1.2 rad/s |
| T matter (real-thing) | active | **8–12 `DEBRIS:clod`** (biome-tinted pebbles, grass tufts, 0.1–0.25 u) lift from random points inside R and spiral up and in, shrinking into the core. `STREAK` starlight 36/s spawned at 0.85–1.0·R with tangential 3.5 + inward 3.0 u/s velocity (tangent-stretched streaks, not dots). |
| A (collapse) | last 0.5 s | the **inner ring brightens** α 0.3 → 1 and spins up (tells where the burst lands) |
| I collapse | life → +0.12 | everything snaps to the core (disc → 0, debris absorbed) |
| I pop | +0.12 | white star flare 1.2 u; the inner ring shatters into 12 `SPR:rune` glyphs flying outward to r 3; 16 `STREAK` sparks; a painted void wave `SHELL:wave` (`#1A0633`) expanding to **exactly 3·area** in 0.18 s; `light(50)`; shake 0.15 |
| D | +0.12–0.6 | outer circle unwrites clockwise; ground swirl fades |

*Ranks:* r2 R; r3 duration; **r4 collapse ×2**: the inner ring gets a double glyph band and the pop is ×1.4; r5 shorter cd (no visual change). *Perf:* 2 decals, 2 shells, ≤ 12 debris, ~50 sprites/s.

### 4.3 Fusions

Every fusion has one **world-scale element** no base skill has.

#### Frostfire Comet (Fireball + Frost Nova) — fire, cd 1.6/1.4/1.2
*Gameplay:*
- 1 comet (r3 2, fan 0.3); speed 13, range 20, hit r 0.9, pierce ∞
- per hit: 26 frost (statusPower 2) + 14 fire (r2 ×1.3)
- expire blast r **3×area**, 30 fire

*Fantasy:* **a molten core cased in glacier ice, with twin tails (one flame, one frost) that hiss steam where they cross.**
- **Head:** `DEBRIS:ice` faceted casing 1.0 u (navy outline) with a `SHELL:flameOrb` core 0.5 u glowing through the cracks.
- **Tails:** two `RIBBON`s braided in a helix (radius 0.3, 3 turns/s): fire `#FF7A2A`→`#E0561C` and frost `#BFF4FF`→`#3FA8E0`. `SPR:smoke P` steam `#F4ECE6` 20/s billows where they cross.
- **World element:** a **melt trail** (`DECAL:wet` α 0.18, 1.5 s, with frost crystals on its edges) along the path.
- **Hits:** steam puff, 4 ice chips, 4 embers.
- **Expire:** the casing shatters (14 ice shards), a Fireball-style billow at r 3, and a ring of steam rolling to r 3.
- **Ranks:** r2 tails ×1.3; r3 2 comets.

#### Plasma Orb (Fireball + Chain Lightning) — storm, cd 2.6/2.3/2.0
*Gameplay:*
- speed 5 to the cursor (max 14)
- zaps every 0.25 s up to 3 (r2 5) foes within **4.5×area**, 10 storm
- detonation r **3.5×area** (r3 4.5), 40 fire

*Fantasy:* **a contained miniature sun: a fire core inside a crackling storm cage.**
- **Body:** a `SHELL:flameOrb` core 0.5 u (`#FFD25A`) inside a `SHELL:orb` cage 0.9 u (fresnel `#FFE45C`, stepped energy bands), plus 3 thin great-circle wires rotating on different axes.
- **Zap radius without a circle:** 4 idle **feeler tendrils** (2-segment `BOLT`s, α 0.6) constantly reach out to **4.5 u** and fizzle. When a foe is in range a tendril locks on as a full `BOLT`. The tendril reach *is* the radius.
- **Detonation (Overload language):** a fire billow to r; **6–8 ground arcs** crawling radially along the ground and ending exactly at r; a `DECAL:scorch` r with fulgurite lines; soot mushroom; dust shock.
- **Ranks:** r2 more tendrils lock; r3 bigger detonation.

#### Storm Halo (Chain Lightning + Spirit Orbs) — storm, auto
*Gameplay:*
- wisps 4/5/6, orbit **2.6×area**, 3.2 rad/s
- contact r 0.6: 14 storm, chains to 2 within 4 (8 dmg)
- each wisp zaps the nearest foe within 7 every 1.2 s (12 dmg)

*Fantasy:* **a crown of ball-lightning moons tethered by arcs.**
- **Wisp:** `SPR:spark` core 0.3 u plus a 2-arc jittering cage (r 0.3, re-randomised every 50 ms).
- **World element / orbit read:** faint **tether arcs** between consecutive wisps (Line2 1–2 px, `#FFE45C` α 0.25, 50% flicker), so a polygon of lightning rotates at 2.6 u.
- **Periodic zap:** the wisp flares ×1.5 for 80 ms first, then a `BOLT`.
- **Contact:** a snap plus small chain bolts.

#### Arcane Barrage (Arcane Bolt + Spirit Orbs) — arcane, cd .55/.5/.45
*Gameplay:*
- 2 + rank missiles (+ Volley), fan 0.9; speed 16, range 22, homing 7 rad/s within 10; 15 dmg (r2 ×1.15)
- 3 orbs at r 1.8, 2 rad/s, 8 contact dmg, each fires a missile every 2.0 s (r3 1.4)

*Fantasy:* **a flock of starlight darts that curve like birds, launched from three rune moons.**
- **Launch:** a vertical rune disc 0.8 u flashes behind the caster for 0.2 s; the missiles burst out of it.
- **Missiles:** an Arcane Bolt head at 0.7× size with a **curving `RIBBON`** 1.2 u. Homing arcs are the beauty here, so keep the ribbon.
- **Rune moons:** like Spirit Orbs, but each shows a rotating 0.35 u `SPR:rune` face. Before firing, the glyph spins up and glows for 0.15 s, then a missile pops out.
- **Hits:** a small converge-pop.

#### Absolute Zero (Frost Nova + Singularity) — frost, cd 8/7/6
*Gameplay:*
- range 12; R **6×area**
- 1.2 s pull (7.5 u/s), then freeze all (statusPower 6)
- +0.3 s: arcane pulse 40 (r2 ×1.3) → mass Shatter; r3 a 2nd pulse at +0.8 s

*Fantasy:* **the air itself freezes: a howling frost funnel drags them in, the zone flash-freezes into glacier, a violet shockwave shatters it.**

| Beat | t | Spec |
|---|---|---|
| A / pull | 0–1.2 | Keep the dashed friendly telegraph (exact R). `SHELL:funnel`: white snow sheet narrowing upward, base R, top 0.3·R at y 5, spinning 3 rad/s. `STREAK` snow spiralling inward 80/s. **Frost creep grows from the edge *inward*** over 1.2 s (it matches the pull). |
| I freeze | 1.2 | 50 ms hit-stop (existing). The decal snaps to solid glacier (bright, navy crack network). **18–24 `DEBRIS:ice` spikes** 1.4–2.4 u radiate (replacing the 10 cones). Cold-mist ring P rolls to R. Frozen foes get the ice-block overlay. White flash ≤ 0.6·R. |
| I pulse | 1.5 (r3 +2.0) | `DECAL:runeCircle` at R flashes violet. **`SHELL:wave`**: a 0.6 u tall violet light band (`#C08CFF` core, `#E6D4FF` rim) sweeps 0 → R in 0.2 s. As it passes, each spike and frozen shell **cracks and shatters** (3 shards per spike, ice with a violet rim light), and the Shatter reactions pop in sequence. |
| D | +1.0 s | glacier recedes edge → centre, mist lifts |

#### Cataclysm (Meteor + Singularity) — fire, cd 7/6.2/5.5
*Gameplay:*
- range 12; pull 1.5 s (r **6×area**, 6 u/s)
- meteor fall 0.8, r **5×area**, 160 dmg (r2 ×1.3), knockback 12
- crater **r 4×area for 4 s**, 12 fire / 0.5 s
- r3: three 50-dmg meteors, r 2.2, 3.2 u out, at +0.4/+0.75/+1.1 s, fall 0.6

*Fantasy:* **Singularity rips open the sky and a mountain of molten Prime-rock is dragged through.**
- **A (pull):** a rune circle at R 6 plus a dark ground swirl. **World element:** a **rift tear in the sky**: a vertical `SHELL:vortex` disc 2.5 u at y 14 over the target, violet edges with a molten glow inside, opening over 1.5 s. The giant rock emerges from it at 1.5 s.
- **T:** `DEBRIS:rock` 1.9 scale; a flame tail 5 u; a smoke ribbon width 1.6; a growing shadow to r 2.5.
- **I:** Meteor impact ×1.6 (20 rocks, dust ring at **r 5**, 4 u flame column, shake 0.5).
- **L:** **lava pool crater** r 4: molten centre `#FFD25A` under drifting toon crust plates (charcoal), with a slag lip at 4. Flames 6, embers 24/s.
- **r3:** three meteorites drop from the *same* rift, each with its own dashed telegraph r 2.2.

#### Thunderhead (Blizzard + Static Field) — storm, auto
*Gameplay:*
- cloud follows with lag (damp 2.2), r **6×area** (r2 ×1.2), y 5
- frost 4 to all inside every 0.4 s
- strike 30 storm on a random foe inside every 0.9 s (r3 0.6)

*Today:* 5 grey spheres plus a disc plus a ring. *Fantasy:* **your own thunderstorm: a dark anvil trailing you, sleeting, dropping bolts.**
- **Cloud:** `CLOUD` of 12–16 puffs, top `#E6ECF4` (sunlit), belly `#3D4B63`, footprint 0.9·R, churning (puffs bob, roll and slowly rotate).
- **Edge = rain curtain:** `SHELL:rainCurtain` (open cylinder, radius R, noise-scrolled vertical streaks `#9FB4C8` α 0.35, white sleet flecks, slanted 15° toward the cloud's lag direction). The rain stops exactly at R.
- **Ground:**
  - `DECAL:wet` (`#1B2A3A` α 0.18) plus `DECAL:shadow` (slate α 0.2), both radius R.
  - Tiny splash sprites 20/s at random points inside R.
- **Frost tick:** `SPR:iceChip` sleet 30/s, plus rime overlays on the foes.
- **Strike:** the belly flashes from inside (`#FFF3A0`, 60 ms), then a `BOLT` from y 4.6 with 2 twigs and a ground-out.
- **Not ambient rain:** the Act III ambient rain is global, thin, vertical, α 0.22. Thunderhead rain is local, slanted, heavier and sleet-flecked.
- **Ranks:** r2 radius (the curtain moves out); r3 strike rate.

#### Starfall (Cinder Bolt + Meteor, Pyromancer LMB) — fire, cd 0.22
*Gameplay:*
- 3 bolts (+ Volley), fan 0.2·(n−1), speed 22, range 14, pierce 1, statusPower 1.5, 10 dmg (r2 ×1.3)
- every 4th hit (r3 3rd) calls a meteor after a 0.5 s fall: r **2.6×area**, 45 dmg

*Fantasy:* **every few cinders call down a shooting star.**
- **Bolts:** the Cinder Bolt r5 look, plus a tiny white 4-point twinkle on the head (the fusion tell).
- **Counter made visible (world element):** each counted hit sends a star mote rising from the hit to a **small constellation 4 u above the player**. 1–3 stars collect there. On the 4th (or 3rd), they join with a line flash and the shooting star launches.
- **Falling star:**
  - `DEBRIS:rock` small with a white-gold head (`#FFF4D6`) and a 3 u `STREAK` tail, at a steep angle.
  - The dashed **fire** telegraph r 2.6.
  - The impact is a Meteor at 0.8× scale, with a dead-scorch decal (no glow, 1.2 s) because it leaves no crater.

#### Hailstorm (Ice Shard + Blizzard, Cryomancer LMB) — frost, cd 0.45
*Gameplay:*
- 5 (r3 7) shards (+ Volley), fan 0.2·(n−1), speed 20, range 15, pierce 3, 18 dmg (r2 ×1.3), statusPower 2
- each expiry leaves a mini-blizzard **r 2×area, 2 s**, 4 frost / 0.33 s

*Fantasy:* **hailstones that each bring a little squall where they land.**
- **Shards:** the Ice Shard look at 0.85×.
- **On expiry:** the shard embeds in the ground (it stays as the squall's anchor) and a mini-squall forms:
  - `CLOUD` 3 puffs at y 2.6, `SPR:snowflake` 18/s.
  - `DECAL:frostCreep` r 2 growing over 0.25 s.
  - 6 small spikes at **r 2**, 3 fog puffs.
- **Spam rule (critical):** up to ~15 squalls/s and ~25 live.
  - A new squall within 1.5 u of a live one **refreshes that one's visuals** (gameplay zones stay separate).
  - Cap 8 squalls with full visuals. Beyond that they get decal + spikes + snow only, and cloud puffs on every 3rd.
  - Same-element decals use `MAX` blending (§5.4).

#### Tempest (Spark + Static Field, Stormcaller LMB) — storm, cd 0.3
*Gameplay:*
- 1 spark (+ Volley), speed 30, range 10
- chains up to 6 (r3 8) foes within 5.5×area, 14 per jump (r2 ×1.3)
- 25% per jump: sky strike after a 0.3 s telegraph r 1.1, 30 storm

*Fantasy:* **a lightning whip that runs through the crowd; sometimes the sky answers.**
- **Chain:** the Chain Lightning look, 15 ms visual stagger, 2 px core.
- **Sky strike:**
  - **Fix the telegraph colour:** dashed storm-lemon, not `ORANGE`.
  - During the 0.3 s, a slate puff trio forms over the target (the Static Field pre-roll), then a `BOLT` and a ground-out.

### 4.4 Reactions

Reactions are the payoff moments: louder than the skills that trigger them, shorter than zones. All of them keep their gameplay radius exactly and stay ≤ 0.6 s of bright content.

| Reaction | Gameplay | Fantasy | Beat sheet and primitives | Edge read |
|---|---|---|---|---|
| **Steam Burst** (fire ↔ frost) | r **2.8×area**, 1.0× base, consumes both | superheated vapour explodes from the foe | **0–0.05**: hiss flash, white `#FFFAF2` 0.6 u. **0–0.25**: 10 `SPR:smoke P` billows (`#FFF6EE` core → `#FFD9C2` peach edge, α ≤ 0.6), ease-out to **exactly r** at 0.25 s, rising. **0.05–0.4**: 6 `STREAK` droplets `#E8F6FF` flung to r, falling. Ice chips on the foe **sizzle into vapour**. **L**: `DECAL:wet` r, 1 s. **D 0.3–1.2**: billows rise and dissolve (noise). Shake 0.18. | billow front = r; the wet ring dries from the edge |
| **Overload** (fire ↔ storm) | r **3.2×area×overloadRadius**, 1.3×, knockback 14 (Unstable Core: stun 0.6) | a thunderclap fireball, full of lightning | **0**: white-gold flash 1 u; `light(60)`. **0–0.2**: fire billow to r; **5–7 ground arcs** (`BOLT` flattened, y 0.1) crawling radially and **ending at r**; dust shock ring to r. **Knockback**: 6 `DEBRIS:clod` thrown outward. **L**: `DECAL:scorch` r with yellow **fulgurite** lines cooling over 1.2 s; soot column. With Unstable Core: arcs linger 0.6 s on stunned foes. Shake 0.3. | arc tips + dust ring |
| **Superconduct** (frost ↔ storm) | arcs to 4 foes within **6.5×area**, 0.6×, re-chills | ice-blue lightning that frosts what it touches | **Source**: ice-chip burst (8) + `DECAL:frostCreep` r 2 (0.6 s, recedes). **Arcs**: `BOLT` recoloured: glow `#9FF3FF`, under-strand **navy** `#1B3A5C`, core `#FFFBE0` with **lemon flecks** (storm signature), plus frost crystals sprinkled along the path (`SPR:iceChip` ×4 per arc, falling). **Each target**: rime flash + 3 chips. | — (targeted) |
| **Shatter** (arcane → frozen) | ×2.5 hit; shards r **2.2×area**, 0.4× | the frozen shell explodes into glass | **0**: hit-stop (existing); 1-frame white flash on the body; violet crack-star `SPR:spark` 0.8 u. **0–0.4**: **12–16 `DEBRIS:ice` shards** (0.15–0.4 u, ice with violet rim light) blasted outward, gravity 14, **landing inside r**; 10 white glitter sparks. **L**: `DECAL:frostCreep` splinter pattern (radial cracks) r, 0.8 s. | shard landings |
| **Combust** (arcane → burn) | `max(0.8×base, remainingBurn×3)`; 50% splash r **2.2×area**; spreads Burn to the 3 nearest within 4 | the burn implodes, then erupts | **Recolour (fix):** core `#FFF4D6`, body `#FF7A2A`, rim/glyph `#C08CFF`; **drop pink `0xff5aa0`**; text `#ffb070`. **0–0.06**: the foe's flames *converge* into it (arcane inward motion). **0.06**: flame flash 0.8 u, 8 `SPR:flame` tongues erupting in a ring to **r**, `DECAL:runeCircle` r flash (0.25 s). **Spread**: **ember arcs**, not lightning: 3 `STREAK`+`RIBBON` fire fuses on 0.25 s parabolas to the recipients, each igniting a flame puff. | flame-tongue ring + glyph flash |
| **Arc Flash** (arcane → shock) | stuns foes within **3×area** for 1.2 s, 0.5× | a flashbulb | **0–0.06**: white flash sprite 1.5 u (hdr 2.5, **never fullscreen**); 8 radial light-ray billboards `#F4E8FF` for 0.12 s. **0–0.3**: violet glyph ring at **r 3** draws and fades. Stunned foes get the Stun overlay. | glyph ring |

**Chain feedback:** at Chain ≥ 10, reaction text grows (HUD side). In the world, keep reaction FX the **same size** (the area is gameplay) but add one prism glint per 5 Chain to the flash (cap 5). Hit-stop still stops at Chain > 3.

### 4.5 Dashes

| Dash | Gameplay | Today | Spec |
|---|---|---|---|
| **Phase Step** (arcane) | blink 5.5 u, i-frames, arrival burst r **2×area**, 10 dmg, knockback 4 | lightning Line2 (storm language) + ring + burst | **Depart (0–0.08)**: 12 motes implode onto the origin; a `SPR:rune` glyph stays on the ground at the origin, unwriting over 0.4 s. **Path**: a 1-frame thin starlight `RIBBON`, then **6 white star points** along the path that twinkle out over 0.3 s (constellation). **Arrive**: converge-pop: `DECAL:runeCircle` at **r 2** flashes and unwrites (0.3 s); 10 `STREAK` sparks outward; dust shock to r 2. |
| **Flame Dash** (fire) | 5 u / 0.16 s; fire patches every 0.9 u, r **1.2×area**, 2 s, 4 dmg / 0.4 s | burst dots + one ember puff per patch | **During**: `SHELL:flame` tongues stream back off the player (0.16 s); smoke P puffs ×4. **Trail**: one continuous `DECAL:scorch` strip, width **2.4×area** (2r), with a slag edge; `SHELL:flame` tongues (0.4–0.7 u, swaying) every 0.6 u; embers 8/s per metre. **D**: flames die **in age order** (start of trail first), the strip loses its glow, then holds 0.8 s as dead scorch. |
| **Glacial Slide** (frost) | 5 u / 0.2 s; chills foes within **1.6×area** of the path (6 dmg, statusPower 2) | burst dots only | **During**: an **ice road** `DECAL:frostCreep` spreading sideways from the feet to **±1.6 u** in 0.15 s; `SPR:snowflake` **skier's spray** 40/s kicked up behind the feet; 6 small `DEBRIS:ice` spikes heaved up along the road edges. **D**: the road melts over 1.2 s (recede), spikes crumble. |
| **Lightning Dash** (storm) | 6 u / 0.12 s, **2 charges**; shocks foes within **1.3×area** (8 dmg) | burst dots + arcs | **During**: a thick `BOLT` from start to end (0.1 s, 2 re-strikes); the player gets a lemon outline flash; arcs to every foe hit (existing). **Residue**: a fulgurite line `DECAL:scorch` 0.3 u wide, glowing `#FFE45C` → dark over 0.8 s; bounce sparks 6 at the end. **Charges**: the 2nd dash within 0.5 s draws a re-strike that connects the two bolts' end points. |

All dashes keep the existing class-colour start burst at 0.6× count. **Do not hide or blur the player model**: the body stays the most readable thing during i-frames.

### 4.6 Perfect Dodge, Adrenaline and traits

**Perfect Dodge** (0.35 s slow-mo ×0.3, 90 ms hit-stop, Adrenaline +30% for 3 s or 6 s; colour mint `#9DFFB0`, element-neutral and reserved for this)
- Replace the flat 3.5 u ground ring with a **camera-facing** event (it is about *you*, not the ground):
  - **0** (frozen frame): a crisp mint-white silhouette flash on the player.
  - 12 **radial speed-line rays** (`STREAK` billboards, 1.2–2 u, from 0.6 u out), the parry read.
  - 6 class-colour sparks.
- **Slow-mo:** 3 mint afterimage ghosts along the dash path (α 0.4/0.25/0.12).
- **Adrenaline:** mint rim on the player model plus 4/s mint motes rising. They end with a small fizz.

**Wildfire** (Pyromancer; a burning foe dies → explosion r **2.2×area**, 0.5× reaction base; up to 6 per frame)
- **0–0.08:** the corpse's burn flames flare to 1.6×.
- **0.08–0.3:** a **ground-licking gas flash**: 6 `SHELL:flame`/`SPR:flame` tongues running radially along the ground to **r**, a soot puff, and `DECAL:scorch` r (glow 0.4 s, then dead scorch).
- The Burns it spreads show through the overlay.
- **Spam:** at tier ≥ 1, use decal + 3 tongues only. Merge explosions within 1.2 u into one visual.

**Permafrost** (Frost Armor 0–3; gained on freeze, ≥ 1.2 s apart)
- **World-visible armor:** 1–3 **hex ice plates** (`DEBRIS:ice` flat, 0.35 u, navy outline) orbiting the player at 0.9 u, y 1.1, 1.2 rad/s. A faint rime decal r 0.8 sits under the feet while ≥ 1.
- **Gain:** the plate *condenses* from 6 converging snow motes plus a glint.
- **Absorb:** the plate shatters (8 chips) toward the attacker; the "ARMOR" text stays.
- This replaces the flat 1.2 u ring.

**Momentum** (Charge 0–100)
- **> 30:** static ticks at the feet (2 tiny arcs per second).
- **> 60:** arcs crawl on the staff.
- **100:** a running **spark wake** (`STREAK` sparks kicked behind the feet 20/s) plus a lemon ground ribbon 1.5 u behind.
- Standing still: the crackle visibly bleeds off (sparks fall and die). The HUD strip stays the precise read; the world shows *state*.

**Resonance** (Chain → +2% dmg, +1% CDR per Chain, max 25)
- An orbiting glyph halo at waist height: Chain ≥ 5 one `SPR:rune`; ≥ 10 three; **25 a full ring of 6 plus starlight motes**.
- On `chainEnd`, the glyphs drop and unwrite (0.4 s).

### 4.7 Statuses on enemies (`OVERLAY` on instanced rigs; the most-seen VFX in the game)

These need renderer support: a per-instance `iStatus` vec4 (burn, chill/5, frozen, shock) plus a stun flag, and shader branches that use **world-y masks** on the creature mesh. Keep the existing tint wash as the fallback, at half strength.

| Status | Gameplay | Overlay (shader, 0 extra draws) | Particles (budgeted) | Must not look like |
|---|---|---|---|---|
| **Burn** | 3 s × burnDur; ticks 0.5 s | flame band on the **top 40%** of the body: world-y noise scrolling up, toon 2-step `#FF7A2A`/`#FFD25A`, flickering at 10 Hz; char darkening (multiply `#3A2A22` 15%) at the base | 2–3/s `SPR:flame G` from random body points, rising; 1/s soot P. **> 40 burning foes**: particles only on the nearest 40. | the elite gold rim (a constant edge) |
| **Chill** 1–4 stacks | −12% speed/stack; freezes at `freezeAt` (5, Rime Shard 3) | **rime climbing from the feet**: frost coverage height = stacks / freezeAt of body height; `#E8F6FF` noise with a navy fringe line at the frost front. At freezeAt − 1 it reaches the shoulders: "one more and they freeze". Animation slows already. | breath puff P every 1.5 s (≤ 30 foes) | Frost **ward** (thin fresnel rim + recoloured accents): chill is *bottom-up opaque frost*, a ward is an *edge-only shell* |
| **Frozen** | 1.6 s (bosses 0.6); pose held | full **ice block**: faceted fresnel shell `#BFF4FF` rim, body tint `#3FA8E0` 0.34, crack-line texture; **ground ice footprint** decal r = 1.4 × radius with 3 tiny spikes (debris) | **freeze moment**: 8 chips + white crack flash (replaces the round burst). **Thaw** (last 0.3 s): drips and cracks propagating. **Ends without Shatter**: 6 chips fall. | frost ward (see above) |
| **Shock** | 4 s × shockDur, +20% (40% Conductor's) dmg taken | **crawling crack-lines**: voronoi-edge lines in `#FFE45C` ×1.8 on 2 random frames per 0.2 s (strobe, not steady) | **between-foe arcs**: a 2 px `BOLT` between shocked foes within 2 u, at most 6 live, 1 per 0.3 s each | elite gold rim (steady); shock **flickers** |
| **Stun** | 1.2 s (bosses 0.3); +25% dmg taken | 30% desaturation | 3 `SPR:spark` stars `#F4E8FF` 0.12 u orbiting the head (r 0.4, 6 rad/s) | — |

Stacking: overlays combine by masks (burn top band, rime bottom band, shock lines over both), so mixed states read before a reaction consumes them, which is exactly the "what can I react here?" information the combo pillar needs. **Barrier** (Prism Hexer) keeps its lavender `#C8A8FF` bubble; arcane stays clear of it because arcane has no status overlay.

### 4.8 How rank-ups escalate (all skills)

| Rank | Rule | Example |
|---|---|---|
| 1 | base kit, at 80% particle density | Blizzard: 9-puff cloud, 60 flakes/s |
| 2–4 | gameplay numbers change the **footprint** (radius, count, duration) exactly; density +10% per rank | Frost Nova r3: the spike ring moves out to 5.63 |
| **3** | **signature detail #1** (one new layer that hints at the rank's mechanic) | Arcane Bolt: needle (pierce); Ice Shard: hoarfrost fringe; Blizzard: denser cloud |
| **5** | **signature detail #2** plus **white-hot core** (+0.4 core hdr, core area ×1.5) | Cinder: white-hot coal and long soot; Spirit Orbs: constellation lines; Blizzard: funnel |
| Fusion r1–3 | fusions start *above* base r5 richness and carry one world-scale element; rank 2–3 scale it | Thunderhead's rain curtain, Cataclysm's sky rift, Starfall's constellation |

Never grow a radius visually beyond its gameplay value to "look stronger". Escalate density, layers, value range and core heat instead (LoL rule: visual impact matches gameplay impact).

---

## 5. Readability rules

### 5.1 Hierarchy (draw order and attention)

1. **Hostile telegraphs** (red, renderOrder 8) and **enemy bullets** (magenta, opaque, white core, dark shell). Nothing of ours may cover them at > 30% opacity (§5.3).
2. **The player**: model, ring (renderOrder 19/20), HP. No player VFX covers the player model with > 0.35 alpha. Dashes never hide the body.
3. **Enemy silhouettes and their status overlays.** Overlays sit on the body (0 area added).
4. **Pickups** (gems, chests, health). No player residue may look like a gem: ice chips last ≤ 0.6 s on the ground, and storm sparks never rest on the ground.
5. **Own impacts and reactions** (≤ 0.6 s of bright content).
6. **Own zones** (blizzard, crater, singularity, thunderhead), painted low (interior ≤ 0.25 α) with a contrasty edge.
7. Ambient world FX (pollen, dust, rain, mist).

### 5.2 Colour law

- **Never red or magenta.** No player colour in hue 330°–15°. Fire floors at 17° (`#E0561C`) and cools to brown/charcoal. Arcane caps at 285°.
- **Fix now:**
  - Combust (`0xff5aa0` → orange + violet rim; text `#ff7ab8` → `#ffb070`).
  - Tempest sky-strike telegraph (orange → storm).
- Player telegraphs stay **dashed, element-coloured** (existing `friendly: true`).
- Storm stays lemon (~52°), never gold (≤ 45°), to keep elite rims and XP gems distinct. Storm bolts are never white-blue (the Act III hostile hazard).

### 5.3 Hostile-telegraph mask

`fx` already tracks hostile telegraph handles. Each frame, push up to **8 circles** (x, z, r) and **4 lines** into a shared uniform block. Every *player* ground decal, cloud shadow, painted smoke and shell samples it and **fades to 30% alpha inside a hostile telegraph** (soft 0.3 u edge). The cost is one loop in the fragment shader of the decal/shell materials and zero draws. This guarantees that a red boss slam under your Blizzard always reads.

### 5.4 Coverage and stacking

- **Steady-state player VFX coverage ≤ 35%** of screen pixels at zoom 1 with α > 0.2; bursts may reach 60% for ≤ 0.3 s. Measure it in the sim harness with an offscreen alpha-coverage readback (P2 tooling).
- **Zone interiors ≤ 0.25 α**; the edge band holds the contrast (up to 0.7 α plus a dark under-line).
- **Same-element ground decals** draw in one layer with **`THREE.MaxEquation`**, so ten overlapping frost patches look like one big frost field, not a black hole. Different elements stack normally.
- **Painted smoke never hides an enemy:** cap every painted (P) sprite at α ≤ 0.5. A global cap is enough; no per-enemy distance test is needed.
- **Glow = live:** a damaging zone glows; when damage stops it becomes dead residue without emissive and fades within 1.2 s.

### 5.5 Spam LOD (keyed off the existing `fx.heat`)

| Tier | heat | What changes |
|---|---|---|
| **0** | < 80 | full spec |
| **1** | 80–240 | trails at 50%; debris at 50%; secondary sparkle off; status particles only on the nearest 40 foes; Wildfire and Hailstorm visual merge radius ×1.5 |
| **2** | > 240 | starters show **head + short streak only** (no soot, no constellation, no rime line); impacts become 1 flash sprite + 4 streaks; no debris for starters; reactions keep their edge read but halve their billow counts; max 6 live player decals (oldest fade in 0.2 s); BOLT twigs off |

Plus:
- **Starter size cap:** the head is ≤ 0.45 u wide. With ≥ 3 projectiles per cast, scale each head ×0.85.
- **Per-source fairness:** an auto skill may never use more than 20% of the live sprite cap. Starters get 30%; actives, reactions and fusions share the rest.
- **Repeated zones merge visually** (Hailstorm squalls, Flame Dash patches, Wildfire): a new instance within 1.5 u of a live one refreshes it instead of spawning new visuals. Gameplay zones stay separate.
- **Pooled caps:**
  - live sprites ≤ 4,000 (player ≤ 3,000)
  - Line2 pool 48 (16 BOLTs)
  - debris instances ≤ 400 (1 draw ice, 1 rock/clod)
  - decals ≤ 24 (instanced or atlas)
  - shells ≤ 16
  - clouds ≤ 6 clusters
- **Draw-call target:** ≤ 60 for all player VFX at the peak late-game.

### 5.6 Timing law

- Anticipation is visible but never delays gameplay. Where a pre-roll is needed (Static Field, Tempest sky strike), pick the target early and keep the damage on its original tick.
- Impacts land on the frame of damage. Bright content of any single effect is ≤ 0.6 s. Lingering zones carry their glow only while they deal damage.
- Storm ≤ 0.15 s per strike, fire residue ≤ 1.5 s, frost recedes in 0.5–0.8 s, and arcane unwrites in ≤ 0.5 s.

### 5.7 Verification (sim harness, hidden pane)

1. **Greyscale + 8 px blur screenshot** per element at zoom 0.6 on all three biomes: the four elements must be identifiable (§2.1).
2. **Hostile-under-spam:** cast Blizzard + Meteor onto a bomber's fuse circle and a boss slam. The red rim must be visible at 50% screenshot scale.
3. **Late-game heat test:** Pyromancer with Starfall + Wildfire, or Cryomancer with Hailstorm, at 300+ enemies. FPS ≥ 55, coverage ≤ 35% steady, player ring always visible.
4. **Edge test:** for each zone, overlay the debug gameplay circle. The edge feature must sit within ±5% of it.

---

## 6. Priority list

Score = **how often the player sees it** (1–5) × **how weak or generic it looks today** (1–5).

| # | Ability | Seen | Weak | Score | Note |
|---|---|---|---|---|---|
| 1 | **Statuses on enemies** (Burn, Chill, Frozen, Shock, Stun) | 5 | 5 | 25 | on hundreds of foes, all game; one tint today; Chill progress invisible |
| 2 | **Cinder Bolt** | 5 | 4 | 20 | the free starter; first thing every new player sees |
| 3 | **Spirit Orbs** | 5 | 4 | 20 | always on screen once taken; plain spheres |
| 4 | **Spark** | 5 | 4 | 20 | starter |
| 5 | **Arcane Bolt** | 5 | 4 | 20 | starter |
| 6 | **Wildfire** | 4 | 4 | 16 | Pyromancer: fires on most kills |
| 7 | **Flame Dash** (and the other dashes) | 4 | 4 | 16 | every 2–3 s; Phase Step uses storm language |
| 8 | **Fireball** | 4 | 4 | 16 | common early pick |
| 9 | **Steam Burst** | 4 | 4 | 16 | the first reaction a new player sees (Act I crystals) |
| 10 | **Blizzard** | 3 | 5 | 15 | the playtest's named example |
| 11 | **Frost Nova** | 3 | 5 | 15 | flat ring |
| 12 | **Static Field** | 5 | 3 | 15 | auto; constant strikes |
| 13 | **Ice Shard** | 5 | 3 | 15 | starter, already shard-shaped |
| 14 | **Combust** | 3 | 4 | 12 (+fix) | **pink is a palette violation, so fix first** |
| 15 | Overload / Superconduct / Shatter | 3 | 4 | 12 | |
| 16 | Chain Lightning | 4 | 3 | 12 | |
| 17 | Thunderhead | 3 | 4 | 12 | grey spheres |
| 18 | Hailstorm | 3 | 4 | 12 | needs the spam rule |
| 19 | Storm Halo / Arcane Barrage / Frostfire Comet | 3 | 4 | 12 | |
| 20 | Permafrost armor | 3 | 4 | 12 | armor not visible in the world |
| 21 | Momentum | 3 | 4 | 12 | no world read |
| 22 | Resonance | 2 | 5 | 10 | |
| 23 | Starfall / Tempest | 3 | 3 | 9 | Tempest needs the colour fix |
| 24 | Arc Flash, Plasma Orb | 2 | 4 | 8 | |
| 25 | Perfect Dodge | 2 | 3 | 6 | already has hit-stop, slow-mo and chroma |
| 26 | Singularity, Meteor, Absolute Zero | 2 | 3/2/3 | 6/4/6 | already the best-looking |
| 27 | Cataclysm | 2 | 2 | 4 | |

## 7. Implementation bundles

Bundle 0 must land first, because the element bundles depend on it. Bundles A–D can then run in parallel with exclusive file ownership. Order them A → B → C → D if serial (A covers the free starter class).

| Bundle | Owner files | Contents | Effort |
|---|---|---|---|
| **0 — Foundation** (orchestrator / toolkit owner) | `fx.js` (+ new `fx/` modules), `creatures/renderer.js` (status attribute + shader), `combat.js` (palette fixes only), new `vfxPalette.js` | Element ramps as constants (§2.2); **status overlays** (§4.7, the #1 priority); hostile-telegraph mask uniform (§5.3); LOD tiers (§5.5); `BOLT` 3-strand + Line2 pool; same-element `MAX` decal layer; "glow = live" fade helper; **Combust recolour**; frozen/freeze moment chips | L |
| **A — Fire / Ember Prime** | `cinderBolt.js`, `fireball.js`, `meteor.js`, `player.js` (Flame Dash `FirePatch`, Wildfire), Starfall in `fusions2.js` | Cinder Bolt, Fireball (+ r5 patch), Meteor, Flame Dash, Wildfire, Starfall. Shared: flame shell, soot sprite, scorch/crater decal, rock debris, ember streaks | M–L |
| **B — Frost / Squall** | `iceShard.js`, `frostNova.js`, `blizzard.js`, `player.js` (Glacial Slide, Permafrost plates), Hailstorm + Absolute Zero in `fusions2.js` | Ice Shard, Frost Nova, **Blizzard**, Glacial Slide, Permafrost, Hailstorm (spam rule), Absolute Zero. Shared: frostCreep decal with recede, ice debris + navy outline, snow sheets, white cloud | L |
| **C — Storm / Thunderhead** | `spark.js`, `chainLightning.js`, `staticField.js`, `player.js` (Lightning Dash, Momentum), Thunderhead + Tempest in `fusions2.js`, Plasma Orb + Storm Halo in `fusions.js` | Spark, Chain Lightning, Static Field (pre-roll cloud), Lightning Dash, Momentum, Thunderhead (rain curtain), **Tempest telegraph fix**, Plasma Orb, Storm Halo. Shared: BOLT, slate cloud puffs, fulgurite decal, bounce sparks | M–L |
| **D — Arcane + Reactions** | `arcaneBolt.js`, `spiritOrbs.js`, `singularity.js`, `player.js` (Phase Step, Resonance, Perfect Dodge), `combat.js` reaction FX blocks, Arcane Barrage + Frostfire Comet in `fusions.js`, Cataclysm in `fusions2.js` | Arcane Bolt, Spirit Orbs, Singularity, Phase Step, Resonance, Perfect Dodge, Arcane Barrage; **all 6 reactions** (they mix elements, so they come after A–C have published their sub-effects as helpers: `fireBillow()`, `iceShatter()`, `groundArcs()`, `runeFlash()`); Frostfire Comet, Cataclysm | L |

**Shared helpers to publish from each bundle** (so D and the fusions reuse them, not copy them):
- A: `fireBillow(pos, r)`, `scorch(pos, r, glowLife)`, `emberSplash(pos, dir)`.
- B: `frostCreep(pos, r, grow, life)`, `spikeRing(pos, r, n)`, `iceShatter(pos, r, n)`, `squall(pos, r, life)`.
- C: `bolt(from, to, opts)`, `groundOut(pos)`, `skyPuff(pos, lead)`, `groundArcs(pos, r, n)`.
- D: `convergePop(pos, s)`, `runeCircle(pos, r, life)`, `unwrite(handle)`.

`player.js` is touched by A, B, C and D in separate functions. Give the dash/trait FX to **one owner (D)**, or split the file first so each dash kind's FX lives in `src/game/fx/dashes.js` with one function per kind (preferred: no merge conflicts).

---

## 8. Sources

Primary or official:
- Riot Games, *League of Legends VFX Style Guide* (shape, value, timing, primary vs secondary elements, "visual impact matches gameplay impact"): https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/ and PDF https://nexus.leagueoflegends.com/wp-content/uploads/2017/10/VFX_Styleguide_final_public_hidpjqwx7lqyx0pjj3ss.pdf
- Riot Games, *Clarity in League* (hitbox must match the effect; big ground circles overstate dodgeability; attention matches importance): https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/
- Oli McDonald (Riot), *Anatomy of a League of Legends missile, part 1: areas of focus* (one focal point with the highest value range, saturation and edge sharpness; the trail stays secondary): https://realtimevfx.com/t/anatomy-of-a-league-of-legends-missile-part-1-creating-areas-of-focus/11614
- *Part 2: what are we communicating* (shared language per function; importance 1–10 per viewer; Morgana's R circle shown only to those it affects): https://realtimevfx.com/t/anatomy-of-a-league-of-legends-missile-part-2-what-are-we-communicating-with-our-vfx/13062
- Blizzard GDC 2013, Julian Love, *Technical Artist Bootcamp: The VFX of Diablo* (BlendAdd; "fast tempo reads aggressive"; avoid/approach messaging), coverage: https://www.ubergizmo.com/2018/06/how-blizzard-created-diablo-3-visuals and notes: https://3dreference.notion.site/VFX-In-Diablo-29806517bc9f4330be3c0ece360eace0
- JangaFX, *Exploring and modernizing the VFX methods of Diablo 3* (alpha multiplication `T1.a·T2.a·2` for non-repeating motion, power-of-two octave scales, lit-side painted smoke for a fixed iso sun): https://jangafx.com/insights/diablo-3-vfx-experiments
- Disney Animation, *Myth: A Frozen Tale — stylized effects for real-time* (SIGGRAPH 2020; whiteout storm from camera-facing flakes plus a density volume for clarity): https://media.disneyanimation.com/technology/publications/2020/siggraph_2020_MYTH_FX_talk.pdf
- Simon Trümpler, *Stylized VFX in RiME* (Unreal Fest Europe 2018; simple shapes + UV distortion for stylized fire): https://www.unrealengine.com/events/unreal-fest-europe-2018/stylized-vfx-in-rime

Practitioner breakdowns:
- VFX Apprentice, *10 LoL VFX design tips* (mid-value palettes, one dominant hue, short effects, anticipation → impact → time to read): https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips
- Samy Mercurio, *Frost storm spell* (phases: circle → charge → shard burst → persistent wind-driven snow, swirling clouds, decals): https://samymercurio.artstation.com/projects/oJD2em
- Raffi Ribeiro, *Stylized fire after Trümpler* (two-noise distortion + LUT; erosion channel): https://raffribeiro.artstation.com/projects/eRWLmJ
- Godot Shaders, *Stylized fire (3D)* (noise × mask alpha through a smoothstep edge, toon-able): https://godotshaders.com/shader/stylized-fire-3d/
- RealtimeVFX, *Simple fire shader breakdown* (one noise sampled twice at different tiling and speed): https://realtimevfx.com/t/simple-fire-shader-breakdown/11213
- Path of Exile forum, *Visual Clarity* (player chilled ground identical to enemy chilled ground → confusion; ask for outlines and source colour coding): https://www.pathofexile.com/forum/view-thread/3598854
- Path of Exile 3.1.3 notes (Burning Ground rebuilt for performance): https://pathofexile.fandom.com/wiki/Version_3.1.3
- Earlier project research: `design/research/04-vfx-readability.md` (blend-add, bloom threshold, telegraph shader, render order) and the sources it lists.

*Caveat.* I found no primary published breakdowns of Diablo IV, Last Epoch or Hades ability VFX. Where this doc borrows from them (D4's ground-hugging frost and fire residue, Hades' short bright boon flashes over painted ground, PoE's ground-effect clarity problems), it is from observation of the games, not a cited source.
