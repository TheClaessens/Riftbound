# 03 — Creature Art Bible (Riftbound)

Modelers follow this document when building every regular enemy and boss procedurally in code: primitives, merged, vertex-coloured, flat-shaded, with rigid parts on bones. Gameplay archetypes, ids and collision radii are fixed by `src/game/enemies.js` and `src/game/bosses.js`. This document decides how each creature looks and moves.

---

## 0. Coordinate and notation conventions

- Units are metres. The model root is at the feet (y = 0). +Y is up. The creature faces **+Z**, the same convention as the player model in `models.js`. The creature's **right hand is at −X** and its left hand is at +X. The weapon hand is always the right hand (−X).
- Part positions are **relative to their bone pivot** unless they are marked "(model)".
- Primitive shorthand:
  - `box w×h×d` is a box. `t=0.7` means the top face is scaled to 70% (a tapered box). `tz=` is the same taper on depth only.
  - `sph r` is a low sphere (6–8 width segments × 4–6 height segments). `sph r (sx,sy,sz)` is a sphere with non-uniform scale.
  - `cap r,len` is a capsule (4 cap segments, 6 radial segments).
  - `cone r,h` is a cone with 4–6 radial segments. Pointing direction is given.
  - `cyl rt/rb,h` is a cylinder with 6–8 radial segments.
  - `ico r` and `oct r` are an icosahedron and an octahedron. Use them for crystals.
  - `lathe` and `extrude` are used for blades and tusks where noted.
- **Triangle cost guide (flat shaded):** box 12, cone(5) 10, cyl(6) 24, sph(6×4) 40, sph(8×6) 80, cap 60, oct 8, ico 20. Regular enemies use ≤ 800 tris, swarmers ≤ 350, bosses ≤ 4000.
- **Scale at play:** a 1.8 m humanoid is 45–70 px tall, so **1 m ≈ 25–39 px**. Anything under 0.15 m (≈4–6 px) disappears. **No identity-critical feature may be smaller than 0.2 m.** Small details are fine as "texture", but the read must never depend on them.
- **Elites** are scaled ×1.35 in code (`ELITE_SCALE`). All numbers below are for the non-elite version.

---

## 1. Research summary (principles we are adopting)

| Principle | What we take from it | Source |
|---|---|---|
| **Silhouette first, recognisable from above, and it shows facing** | Every creature gets one "signature shape" visible from the 41° camera (ears, keg, tusks, wings, staff, crystal back). Facing must be readable: snouts, weapons and tusks point forward. | Valve, *Dota 2 Workshop Character Art Guide* ([Steam KB](https://help.steampowered.com/faqs/view/0688-7692-4D5A-1935), [PDF](http://media.steampowered.com/apps/dota2/workshop/Dota2CharacterArtGuide.pdf), [summary, CG Channel](https://www.cgchannel.com/2012/06/valve-releases-useful-character-design-guide)) |
| **Value matters more than hue. Top-lit value patterning: lighter head and shoulders, darker feet** | Bake a vertical value gradient into vertex colours: the top 100% bright, the feet 70%. Never make feet as bright as the head. | Valve Dota 2 guide (as above). Forum discussion of the guide on [Polycount](https://polycount.com/discussion/comment/2790930) |
| **Areas of rest vs detail. Small detail patches don't read in play** | Big, flat colour fields with one or two detail clusters (the face and the weapon). No noisy multi-colour patches. | Valve Dota 2 guide; [Bugnet, "Readable game art: why clarity beats detail"](https://bugnet.io/blog/readable-game-art-why-clarity-beats-detail) |
| **Judge assets in context, at game camera, not in a turntable** | Every model is approved only from a screenshot at gameplay zoom on its biome ground, among 50+ others. | Valve Dota 2 guide; Diablo IV dev blog, which judges silhouettes "at the default game camera" ([Wowhead repost of the June 2021 quarterly update](https://www.wowhead.com/news=323142/diablo-iv-quarterly-update-for-june-2021-character-art-story-cutscenes-wardrobe)) |
| **Blizzard house style: strong silhouettes, bold colour, dynamic animation, exaggerated physiques** | Oversized hands, weapons, shoulders, heads and horns. Animation must be snappy, with anticipation and overshoot. | Christian Lichtner, Diablo III art GDC talk ([CG Channel](https://www.cgchannel.com/2012/04/video-christian-lichtner-on-the-art-of-diablo-iii/)); Samwise Didier's exaggerated physiques ([Game Informer WC3 concept gallery](https://www.gameinformer.com/2018/11/14/explore-warcraft-iiis-origins-in-this-rare-concept-art-gallery)) |
| **RTS crowd readability with low polys: each unit distinguishable, team-colour by palette swap** | Faction = palette. Archetype = silhouette. A palette swap must never be the only difference between two archetypes. | ["Back in the good old days", Wowhead on WC3 models](https://www.wowhead.com/news/back-in-the-good-old-days-54185); [Blizzard WC3 forum on Reforged units losing silhouette when clumped](https://us.forums.blizzard.com/en/warcraft3/t/artstyle-raises-concerns/473); top-down three-quarter silhouettes ([Eurogamer / Samwise interview via Blizzplanet](https://www.blizzplanet.com/blog/comments/eurogamer_interviews_samwise_didier)) |
| **Monster families: visual design follows the combat role** | Each archetype has a shape code (see §2.4) that is shared across acts, so a player who learned "staff-raised = ranged" in Act I recognises it in Act III. | Diablo IV quarterly update (above); Torchlight 2 reviews note that monster shape signals challenge, e.g. brutes with oversized axes and hunched rat-men fodder ([VideoGamer review](https://www.videogamer.com/?p=168284)) |
| **Crisp characters on top of a busier background** | Characters use crisper, more saturated, higher-contrast colour than the ground. The ground stays lower-contrast. | Torchlight art director Jason Beck: painterly background + crisp comic-book characters for "clean separation" ([Engadget, "An insight into the art of Torchlight"](https://www.engadget.com/2009-09-10-an-insight-into-the-art-of-torchlight.html)) |
| **Melee / ranged / siege creeps differ by held object** | The grunt carries a cleaver, the caster a staff, the bomber a keg. The held object *is* the role tell. | Dota 2 lane creeps: melee carry swords, ranged carry staffs ([Liquipedia, Lane creep](https://liquipedia.net/dota2/Lane_creep)) |
| **Shape language: triangles = threat and speed, squares = sturdy, circles = soft/vulnerable. State changes should change shape, not just colour** | Swarmers are forward-pointing wedges. Tanks are blocky. Splitters are round. Wind-ups change the pose (raise, crouch, rear), not only a glow. | [RocketBrush, shape language in game character design](https://rocketbrush.com/blog/shape-language-in-game-character-design-how-to-make-characters-readable-and-consistent); [Bugnet](https://bugnet.io/blog/readable-game-art-why-clarity-beats-detail) |
| **Readability holds when particles explode. Brightness and detail density guide the eye** | Enemies keep emissive area small (≤5% of surface), so player spells and enemy bullets stay the brightest things on screen. | Hades art-direction commentary ([MCV/Develop on Supergiant](https://mcvuk.com/?p=216051), [Shacknews Best Art Style 2020](https://shacknews.com/article/122029/shacknews-best-art-style-of-2020-hades)). This is secondary commentary, treated as a soft guide. |
| **Low-poly kit style reference** | KayKit: chunky chibi proportions (head ≈ ⅓ of height), one gradient-atlas texture, with weapons as separate props. Quaternius: monster families built from simple, blobby, rounded primitives. Our vertex-colour flat style sits between them. | [KayKit Skeletons (itch.io)](https://kaylousberg.itch.io/kaykit-skeletons), [Godot asset listing](https://godotengine.org/asset-library/asset/2566); [Quaternius Ultimate Monsters (Sketchfab)](https://sketchfab.com/3d-models/ultimate-monsters-pack-fd72e114d119488da71fe3a16f216c4f), [Quaternius](https://quaternius.itch.io/) |

Caveat: I could not text-extract the Valve PDF (it is image-based) or the full D4 blog body. Those principles are taken from the summaries and discussions linked above, plus standard practice. Hades claims come from secondary commentary.

---

## 2. Global rules

### 2.1 Reserved colours (enemies must not use these as large fields)

| Use | Hex | Rule for enemy models |
|---|---|---|
| Enemy projectile | `#ff2a6d` + white core | Never on a body. It may appear only as the *last 0.1 s* flash on a muzzle, orb or mouth at the release frame. |
| Enemy telegraph | `#ff3344`, `#ff5a2a` | Ground decals only. Bodies avoid saturated red-orange in large areas. Dark wine or oxblood is OK. |
| Player arcane / fire / frost / storm | `#b67cff` / `#ff6a1f` / `#66d9ff` / `#ffe14a` | Never as an enemy *emissive*, **except** the ward system (§2.6), which deliberately borrows them. Matte, desaturated, dark versions are allowed (e.g. a dark rust loincloth). |
| Elite | gold `#ffc93a` | Only elites have gold trim. |
| Player ground ring | (class colour) | Enemies never get a coloured ground ring. They get a dark blob shadow. |

### 2.2 Faction palettes

Each faction has **body colours** (matte, ~70% of surface), **one secondary** (bone, iron and similar), and **one accent "tell" colour**. The accent is emissive, covers ≤5% of the surface, and is used for eyes, casting orbs and wind-up glows. The accent is the only thing that ramps during a wind-up.

| Faction | Act | Body | Secondary | Accent (emissive tell) | Why |
|---|---|---|---|---|---|
| **Greenskins** (goblins, trolls, forest spiders) | I Forest | Goblin skin yellow-olive `#a3bd3c` (lighter than grass) · leather `#4a2f1d` (darker than grass) · troll slate-teal `#4f7d88` · spider aubergine `#2e2236` | Bone `#eadcb4`, rust cloth `#8a3b22`, iron `#9aa0a6` | **Toxic lime `#b8ff3c`** | A green faction on green ground has to win on **value** ("light skin + dark leather" sandwich), not hue. Lime is greener than storm-yellow `#ffe14a` (Δhue ≈ 35°) and is never used as a large field. |
| **Warband** (orcs, ogres, wargs, boars, sapper goblins) | II Barrens | Orc skin deep olive `#4f6b2a` · blackened iron `#2b2a2e` · dark leather `#3d2618` · ogre slate-blue `#5d6a78` | Bone `#eadfc4`, rust edge `#8a4a2a` | **Spirit teal `#1fe0c2`** (war-paint, eyes, shaman spirit-fire) | Green and teal are complementary to orange-red earth. That gives maximum hue contrast while staying darker than golden grass. Teal (hue ≈170°) stays clearly greener than frost cyan `#66d9ff` (≈195°). |
| **Wyrmkin** (dragons, drakes, wyverns, kobolds, naga, stone trolls) | III Riverlands | Wine-crimson scales `#8c2234` · oxblood `#5e1a22` · cream belly `#ecd3a0` · stone slate `#5d6470` · wing membrane saffron `#e08a3a` | Ivory horn/claw `#f2e6c8` | **Prism white `#e6f4ff`** crystals (horn tips, spine shards, throat). A warded creature's crystals take the ward element colour. | Warm wine-red and saffron sit against green meadow and blue river (complementary). Prism white is the highest value on screen and clashes with no gameplay hue. The ward-tint is how the "prism" faction fantasy shows. |

**Value ladder per biome.** These are reference ground colours; re-measure from `world.js` once the vibrant world lands.

| Biome | Ground mid (approx. L\*) | Enemy bulk must be | Top-plane identity must be |
|---|---|---|---|
| Forest grass `#4f8a34` (L≈52), undergrowth `#2f5a24` (L≈34) | mid | **≥ 18 L\* darker** (leather, troll slate, spider black), *or* | **≥ 15 L\* lighter** (goblin skin, bone caps, troll mohawk) |
| Barrens earth `#b4552c` (L≈48), golden grass `#d6a23e` (L≈70) | mid-to-light | **dark** (iron, olive skin, L 25–40) | bone/teal highlights (L 75–85) |
| Riverlands meadow `#6aaa45` (L≈63), river `#3b7fc4` (L≈51), banks `#9a958a` | mid-light, cool (stormy light) | **dark-warm** (wine L≈30, oxblood L≈22) | cream/ivory/prism white (L 85–95), saffron wings (L≈65, warm against cool) |

### 2.3 Readability against the biome (render-side rules)

1. **Baked vertical value gradient.** When vertex colours are written, multiply by `lerp(0.70, 1.08, clamp(y / H, 0, 1))`, where H is the model height. Feet come out dark and head and shoulders bright (Dota "top-lit" patterning). For flyers, use y relative to body bottom/top.
2. **Top planes carry identity.** At 41° elevation the top of head, shoulders, back, and anything held up cover roughly half the visible pixels. Put the signature colour there: hoods, skull caps, mohawks, keg lids, crystal backs, wing tops.
3. **Blob shadow (mandatory).** Use a dark ellipse decal at y = 0.02: radius = `1.15 × r` (flyers `0.9 × r`, scaled by `1 − 0.25 × hoverHeight/2`), colour `#000000`, opacity 0.45, soft edge (radial gradient texture). One shared InstancedMesh for all enemies. It anchors flyers and makes dark-on-dark units still pop.
4. **Rim light.** Add a cheap view-space fresnel rim in the enemy material: `rim = pow(1 − dot(N, V), 3) × 0.35`, coloured warm-white `#fff1d6` in Forest/Barrens and cool-white `#e6f0ff` in Riverlands. Elites replace it with gold (§2.5). This separates dark bodies from dark undergrowth or river.
5. **Saturation.** Enemy body colours are **slightly more saturated and darker** than the ground they stand on. Never desaturate an enemy to grey on a saturated ground, because it reads as a rock.
6. **Hit flash.** On hit, flash white (existing tint) and squash-stretch (scale y 0.85 / xz 1.1, 0.08 s). This keeps the value change, not just the colour.
7. **No enemy uses a coloured ground ring or a glowing robe-cone silhouette** (both are player tells).

### 2.4 Archetype shape code (consistent across acts)

| Archetype | Shape code (reads at 50 px) | Act I | Act II | Act III |
|---|---|---|---|---|
| chaser | Upright biped, one visible melee weapon held out to the side | Goblin Grunt | Orc Raider | — |
| swarmer | Small **forward wedge**: low, horizontal, no weapon, fast leg blur | Goblin Scamp | Warg | Dragon Whelp |
| tank | **Block**: 2–3× the width of a chaser, huge shoulders and arms, slow heavy sway | Forest Troll | Ogre | Stone River Troll |
| ranged | **Vertical staff/totem over the head**, with an orb or brazier at the top that glows during the wind-up | Goblin Shaman | Orc Spirit-Shaman | Naga Tidecaller |
| splitter | **Round sac** with visible "contents" (eggs) | Broodmother | — | — |
| charger | **Quadruped with a battering front** (tusks, crest) pointing forward | — | War Boar | Crag Drake |
| bomber | **Object held over the head** with a sparking fuse | — | Goblin Sapper | — |
| blinker | **Hovering, with a big wingspan**, bobbing | — | — | Storm Wyvern |
| support | **Small body + oversized totem crystal** that pulses | — | — | Kobold Prism-Shaman |

### 2.5 Elites

The current code already does ×1.35 scale and a gold rim aura. Add three things so an elite reads even when the aura is occluded:

1. **Gold trim.** Swap the "trim" parts (weapon edge, helmet band, pauldron rim, crystal tips) to gold `#ffc93a` with emissive 0.3. Each creature's table marks trim parts with **(T)**.
2. **Crown silhouette add-on.** One extra part on the head bone, ≈0.25×H tall:
   - Greenskins: a bone-and-antler crown (3 cones, gold-tipped).
   - Warband: a horned iron helm with a tall teal plume, or a back-banner pole 0.6×H with a cloth flag `#eadfc4` bearing a teal sigil.
   - Wyrmkin: a second pair of swept crystal horns in gold.
3. **Eyes turn gold** instead of the faction accent. The wind-up still ramps the faction accent on the casting object.

### 2.6 Warded enemies (elemental Prism Ward)

- Keep the existing rotating icosahedron shell, but make it **fresnel-edge only**: inner alpha 0.08, edges and facets alpha 0.6, additive, radius `1.35 × r × visScale`, rotation 0.6 rad/s. The creature silhouette must stay visible inside it.
- **Body tie-in.** Every vertex flagged `accent` (eyes, crystals, orbs) lerps to the ward element colour at 70%. On Wyrmkin this recolours the crystal spines, which is the faction fantasy.
- Element colours: fire `#ff6a1f`, frost `#66d9ff`, storm `#ffe14a`, arcane `#b67cff`. These deliberately match the player's spells: "it's wearing frost, hit it with something else".
- Ward break: the shell shatters into 8–12 triangle shards (fx burst) and the accent snaps back to the faction colour.

### 2.7 Readability against the player

The player is a **vertical cone** (robe, hood/hat, ~2.1 m), the brightest emissive object (staff orb), on a coloured ground ring.

- **Enemies are horizontal or block-shaped.** Goblins are short and wide-headed, orcs and trolls are wide-shouldered, beasts are long. No enemy has a robe cone that flares to the ground. Shaman casters wear short loincloths and fur shawls with bare legs visible.
- **Enemy staffs end in a skull, a brazier or a crystal**, never a plain sphere orb on a straight pole like the player's. Their glow is lime, teal or prism-white, never violet.
- **Size relation.** Regular chasers stand 1.35–1.8 m, at or below the player's shoulder, so the hero reads as the tallest "person" in the crowd. Tanks exceed the player, and that is their point.
- **Emissive budget.** The player orb and spells are 100%. Enemy accents idle at 25–40% intensity and peak during wind-ups only. Enemy projectiles are the separate magenta channel.
- **Value.** The player robe should sit at one extreme of the ground value. Enemies may share that extreme, but must differ in silhouette.

### 2.8 Build and performance notes

- **Rigid skinning.** Merge all parts into one BufferGeometry with `skinIndex = boneId` and `skinWeight = (1,0,0,0)`. Use a SkinnedMesh, or better, an **InstancedMesh per type with a bone-matrix DataTexture** (one draw call per enemy type for 320 enemies). Budget ≤ 16 bones per regular enemy and ≤ 32 per boss.
- **Accent channel.** Add a per-vertex float `aAccent` (0 = body, 1 = accent). Shader: `emissive = accentColor * aAccent * uGlow` with per-instance `uGlow`. Wind-ups animate `uGlow` from 0.3 to 3.0. The ward recolour lerps `accentColor`.
- **Flat shading.** Use `toNonIndexed()` + `computeVertexNormals()` before merge, or `flatShading: true`.
- **Facet count.** Keep ≥ 2 faces per visible plane so flat shading shows form. A cube head with a 0.7 taper reads better than a 6-segment sphere at 40 px.

---

## 3. Rigs

All pivots are in model space for the reference height H. Scale proportionally per creature (each creature lists its own key pivots).

### 3.1 Humanoid rig (chasers, tanks, casters, bosses)

```
root (0,0,0)                         — yaw only; blob shadow attaches here (not to hips)
└─ hips (0, 0.40H, 0)                — vertical bob, roll, hit-squash
   ├─ legL (+0.12W… hip joint)  pivot (+hw, 0.40H, 0)   — rot.x swing; optional knee not used (rigid)
   ├─ legR (−hw, 0.40H, 0)
   └─ spine (0, 0.45H, 0)            — lean (rot.x), twist (rot.y), breathe (scale.y)
      ├─ head (0, 0.78H, +0.04H)     — neck pivot; look/nod; jaw child
      │  └─ jaw (0, −0.06H, +0.08H) rel. head  — open rot.x +0.4 for roar/spit
      ├─ armL (+sw, 0.72H, 0)        — shoulder pivot; rot.x swing, rot.z raise
      │  └─ foreL (0, −0.24H, 0) rel. — elbow (OPTIONAL: casters, bosses, tanks)
      ├─ armR (−sw, 0.72H, 0)
      │  └─ foreR (0, −0.24H, 0) rel.
      │     └─ weapon (0, −0.22H, +0.04H) rel.   — at the fist; held object
      └─ back (0, 0.70H, −0.15H)     — OPTIONAL: banners, kegs, crystals, spore pods
```

`hw` = hip half-width, `sw` = shoulder half-width. **Regular enemies use upper arms only** (arm + weapon on the fist end) to save bones. Casters, tanks and bosses use upper + fore so they can raise a staff overhead and do two-handed swings.

Procedural cycle (all humanoids). `phase += moveSpeed·dt / stride`, where `stride = 1.6 × legLength`.
- legs: `legL.rot.x = sin(2πφ)·A`, `legR = −legL` (A = 0.7 goblins, 0.55 orcs, 0.35 tanks)
- arms: counter-swing `armL.rot.x = −0.6·legL.rot.x` (the weapon arm swings at half that)
- hips: `y += |sin(2πφ)|·0.05H`, `rot.z = sin(2πφ)·0.05` (tanks 0.12 with a slower, heavier phase)
- spine: `rot.x = lean` (forward 0.15 while moving, 0.35 for swarmers), `rot.y = sin(2πφ)·0.1`
- idle: spine `scale.y = 1 + 0.02·sin(t·3)`, head `rot.y` small random glance every 2–4 s
- melee attack (contact): anticipation 0.12 s (weapon arm rot.x −2.0, spine lean back −0.2) → strike 0.06 s (rot.x +0.9, spine +0.25) → recover 0.2 s with ease-out overshoot
- death: (existing fx) plus topple: rot.x to ±1.4 over 0.25 s, then sink and scale down

### 3.2 Quadruped rig (warg, boar, drake, dragon body)

```
root (0,0,0)
└─ body (0, shoulderH·0.85, 0)        — bob, pitch (rot.x) for charge lean, roll
   ├─ neck/head (0, +0.1, +0.5L) rel. — head pitch (lower for charge), yaw for look
   │  └─ jaw (0, −0.08, +0.12) rel.
   ├─ legFL (+hw, 0, +0.35L) rel. body — shoulder pivot, swing rot.x
   ├─ legFR (−hw, 0, +0.35L)
   ├─ legBL (+hw, 0, −0.35L)
   ├─ legBR (−hw, 0, −0.35L)
   ├─ tail1 (0, +0.05, −0.5L) rel. → tail2 (0,0,−seg) → tail3 (optional)
   └─ rider / back (0, +0.25, 0)     — saddle bone for goblin rider, dragon wings, spine crystals
```

Gait: trot (diagonal pairs) `FL = BR = sin(2πφ)·A`, `FR = BL = −…`. Gallop or charge: front pair in phase, back pair in phase offset by 0.5, with A ×1.6 and `body.rot.x = sin(4πφ)·0.08`. Tail: `tail1.rot.y = sin(t·4)·0.3`, and each child segment lags by 0.25 rad.

### 3.3 Flyer rig (whelp, wyvern, Prism Dragon wings)

```
root (0,0,0)                          — ground; blob shadow
└─ body (0, hoverH, 0)                — bob: y += sin(t·ω)·0.08; pitch with speed
   ├─ head (0, +0.05, +0.45L) rel.  → jaw
   ├─ wingL1 (+0.15W, +0.1, +0.05L)  — shoulder: flap rot.z
   │  └─ wingL2 (+span1, 0, 0) rel.  — wrist: follows with lag (rot.z × 0.6, delayed 0.12 cycle)
   ├─ wingR1 / wingR2 (mirrored)
   ├─ tail1 → tail2 → tail3           — chained lag sway
   ├─ legL / legR (dangling, ±0.25 rad sway)  — wyvern & dragon only
```

Flap: `wing1.rot.z = ±(0.25 + 0.75·sin(t·f))` (f = 14 rad/s for the whelp, 7 for the wyvern, 3 for the dragon). Body bob is phase-locked to the flap: the body rises on the downstroke, `body.y += 0.06·sin(t·f − π/2)`. Wing membranes are thin extruded triangles (fans), double-sided.

### 3.4 Spider rig (Broodmother, Spiderlings)

```
root
└─ body/cephalothorax (0, legLift, 0) — bob, yaw jitter
   ├─ abdomen (0, +0.05, −0.35L) rel. — pulse scale (1 ± 0.05), splitter "throb"
   ├─ fangs/jaw (0, −0.05, +0.2L)     — chelicerae open/close
   └─ leg1L..leg4L, leg1R..leg4R      — pivot at body edge; each leg = upper (rot.z lift, rot.y swing) + lower child (fixed bend, rigid)
```

Gait: alternating tetrapod. Legs {1L, 2R, 3L, 4R} are in phase and the other four are offset by 0.5. `leg.rot.y = sin(2πφ)·0.35`, `leg.rot.z(lift) = max(0, sin(2πφ))·0.35`. Body yaw jitter `sin(t·25)·0.03` gives a skittering look.

### 3.5 Serpent rig (Naga)

```
root
└─ coil (0, 0.15, 0)    — static ground coil (torus segment); slow rot.y undulation ±0.15
   └─ tail-rise1 (0, 0.3, +0.1) → rise2 → torso (spine) → head/jaw, armL/armR (+fore)
```

Undulation: `riseN.rot.z = sin(t·3 − N·0.8)·0.15` (an S-sway travelling up the body).

---

## 4. ACT I — Forest · Greenskins

Faction quick-ref: skin `#a3bd3c` · leather `#4a2f1d` · rust cloth `#8a3b22` · bone `#eadcb4` · iron `#9aa0a6` · troll slate `#4f7d88` · accent lime `#b8ff3c`.

### 4.1 Goblin Grunt — `husk` (chaser, r 0.5, hp 18)

**Fantasy:** a knee-high-to-a-troll goblin with a rusty cleaver and more teeth than sense.
**Silhouette (50 px):** a big head flanked by **two long horizontal ears**, which from above read as a "T-bar", plus a cleaver blade sticking out on the right. Dark leather body, light skin head.
**Proportions:** H = 1.35 m (ear tips at 1.2 m, spanning 1.05 m tip to tip). Head 0.46 w × 0.40 h (≈30% of H, chibi). Torso 0.55 wide, hunched. Arms 0.55 long (fist near the knee). Legs 0.45. Cleaver 0.65 long, blade 0.28 wide.
**Rig:** hips (0,0.45,0) · spine (0,0.5,0) · head (0,0.95,0.08) · jaw · armL (+0.3,0.88,0) · armR (−0.3,0.88,0) · weapon on armR end · legL/R (±0.12,0.45,0). 10 bones.
**Parts:**

| Part | Prim | Dims | Pos (rel. bone) | Colour | Bone |
|---|---|---|---|---|---|
| Torso | box 0.55×0.45×0.4, t=0.8, tilted fwd 0.25 rad | | (0,0.22,0.02) | leather `#4a2f1d` | spine |
| Belly | sph 0.22 (1,0.9,0.8) | | (0,0.08,0.1) | skin `#a3bd3c` | spine |
| Loincloth | box 0.4×0.25×0.32, t=1.2 | | (0,−0.08,0) | rust `#8a3b22` | hips |
| Head | box 0.46×0.38×0.42, t=0.75 (bevelled by taper) | | (0,0.2,0.04) | skin | head |
| Ears ×2 | cone 0.1,0.42 pointing ±X, tilted up 0.3 | | (±0.3,0.24,−0.02) | skin, tip darker `#7f9a2c` | head |
| Nose | cone 0.07,0.18 pointing +Z | | (0,0.16,0.24) | skin | head |
| Eyes ×2 | oct 0.05 | | (±0.1,0.24,0.21) | **lime `#b8ff3c` (accent)** | head |
| Jaw | box 0.36×0.1×0.3, two bone cone fangs 0.04,0.1 | | (0,−0.02,0.1) | skin / bone `#eadcb4` | jaw |
| Leather cap | sph 0.2 (1.2,0.5,1.1), top of head | | (0,0.36,0) | leather (T: band gold) | head |
| Arm L / R | cap 0.08,0.42 | | (0,−0.22,0) | skin | armL/R |
| Fists | box 0.15³ | | (0,−0.48,0) | skin, darker `#7f9a2c` | armL/R |
| Shoulder pad (right) | sph 0.17 (1.2,0.7,1), with bone spike cone 0.05,0.18 | | (−0.04,0.04,0) | leather / bone | armR |
| Legs | cap 0.09,0.32 | | (0,−0.2,0) | skin → feet leather | legL/R |
| Feet | box 0.16×0.08×0.24 | | (0,−0.42,0.05) | leather | legL/R |
| Cleaver handle | cyl 0.03/0.03,0.3 | | (0,0,0.15), along +Z | wood `#6b4426` | weapon |
| Cleaver blade | box 0.05×0.28×0.42 (extruded, notched) | | (0,0.08,0.45) | iron `#9aa0a6`, edge `#d9dde0` (T) | weapon |

≈ 420 tris.
**Palette / contrast:** skin `#a3bd3c` (L≈72) above grass (L≈52), leather `#4a2f1d` (L≈21) below it. Light-dark sandwich. Tell: lime eyes.
**Animation:**
- idle: hunched breathing, ears twitch (rot.z ±0.15, random 0.1 s flicks), cleaver tapped on the shoulder.
- move: bouncy waddle, A = 0.7, hips bob 0.06, head bob lags the hips by 0.1 cycle. Ears flop with `rot.x = −|sin|·0.2`.
- attack tell (contact swing): 0.12 s cleaver raised overhead (armR rot.x −2.4), ears pin back (rot.y 0.4), jaw opens. Chop down.
- hit: ears flatten for 0.2 s.

### 4.2 Goblin Scamp — `imp` (swarmer, r 0.4, hp 12, fast)

**Fantasy:** a sprinting goblin runt wearing an animal skull, running on all fours when excited.
**Silhouette:** a **forward-pointing wedge**: low, near-horizontal torso, a **bone-white skull cap** on top (the top plane is white where the grunt's is brown), and ears swept straight back like a dart. No weapon.
**Proportions:** length 0.85, H 0.75 (crouched). Head 0.34 w. Ears 0.32, swept back. Arms 0.45 (used as front legs while sprinting). Legs 0.35.
**Rig:** humanoid with no weapon bone. hips (0,0.35,−0.05) · spine pitched forward 0.9 rad · head (0,0.62,0.3) · armL/R (±0.2,0.55,0.15) · legL/R (±0.1,0.35,−0.05). Plus a tail? No. 8 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Torso | box 0.32×0.36×0.28 t=0.75 | | (0,0.16,0) | leather `#4a2f1d` | spine |
| Head | box 0.34×0.28×0.32 t=0.75 | | (0,0.12,0.06) | skin, lighter `#b9cf52` | head |
| Skull cap | sph 0.2 (1,0.55,1.25) + 2 small horn cones 0.04,0.14 back | | (0,0.24,0.0) | **bone `#eadcb4`** (T: horn tips gold) | head |
| Ears ×2 | cone 0.07,0.32 pointing −Z, splayed ±0.4 rad | | (±0.16,0.16,−0.1) | skin | head |
| Eyes | oct 0.05 ×2 (large, bright) | | (±0.08,0.14,0.16) | **lime** | head |
| Grin | box 0.22×0.05×0.05 + 4 bone teeth | | (0,0.03,0.17) | bone | head |
| Arms | cap 0.06,0.32 | | (0,−0.18,0) | skin | armL/R |
| Hands | box 0.1³ | | (0,−0.36,0) | skin dark | armL/R |
| Legs | cap 0.07,0.24 + foot box 0.12×0.06×0.18 | | (0,−0.15,0) | skin / leather | legL/R |
| Rag scarf (trails behind) | box 0.18×0.04×0.3, tilted | | (0,0.3,−0.18) | rust `#8a3b22` | spine |

≈ 280 tris.
**Animation:**
- move: **gallop**, with arms and legs paired like a quadruped (arms in phase, legs in phase, the two pairs half a cycle apart). Spine pitch 0.9. Head stays level (counter-rotate). Scarf flaps `rot.x = sin(t·20)·0.3`. Speed blur: stretch along Z ×1.08 at top speed.
- idle (rare): stands half-up, skull looks around, giggle shake (`hips.rot.z = sin(t·30)·0.05` bursts).
- attack (contact): pounce, hips +0.25 m arc over 0.15 s, arms forward.

### 4.3 Forest Troll — `brute` (tank, r 0.9, hp 90, kb resist)

**Fantasy:** a moss-backed forest troll dragging a log club, with a rust-orange mohawk and huge tusks.
**Silhouette:** a **block**: shoulders as wide as it is tall-from-above, a small forward-thrust head, **two ivory tusks**, an **orange mohawk stripe** down the head, and a log club on the ground at the right.
**Proportions:** H = 2.7 m (hunched; standing would be 3.1). Shoulder span 1.7. Head 0.5 w (small, about 18% of H). Arms 1.45 long with huge fists (0.35). Legs 0.85, thick. Club 1.7 long × 0.32 r at the head.
**Rig:** hips (0,0.9,0) · spine (0,1.0,−0.05) · head (0,2.1,0.45) · jaw · armL (+0.8,2.0,0) → foreL (0,−0.7,0) · armR (−0.8,2.0,0) → foreR → weapon · legL/R (±0.32,0.9,0). 12 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Chest | box 1.4×1.0×0.9, t=1.25 (wider at top = big shoulders), pitched fwd 0.35 | | (0,0.6,0.1) | slate-teal `#4f7d88` | spine |
| Belly | sph 0.5 (1,0.85,0.9) | | (0,0.2,0.2) | lighter `#6e9aa3` | spine |
| Shoulder moss ×2 | sph 0.38 (1.2,0.5,1.1) | | (±0.55,1.05,−0.05) | moss `#7da83a` + darker `#55782a` lumps | spine |
| Back moss + mushrooms | 3× cone 0.12,0.12 cap red-brown `#a0452a` + stalk | | top of back | `#a0452a` / `#eadcb4` | spine |
| Head | box 0.5×0.45×0.55, t=0.8 | | (0,0.1,0.15) | slate | head |
| Mohawk | 4× cone 0.09,0.3 in a row along Z | | (0,0.35,−0.1…0.2) | **rust orange `#c9602a`** | head |
| Brow | box 0.5×0.1×0.15 | | (0,0.2,0.4) | slate dark `#3b5f68` | head |
| Eyes | oct 0.05 ×2 | | (±0.12,0.13,0.43) | lime | head |
| Nose | cone 0.08,0.22, long, drooping +Z | | (0,0.08,0.46) | slate | head |
| Jaw + tusks | box 0.45×0.15×0.4; 2 tusks = cone 0.07,0.4 curved up/out (or lathe) | | jaw (0,−0.12,0.1); tusks (±0.15,0.05,0.25) | slate / **bone** (T: gold tusk caps) | jaw |
| Upper arms | cap 0.2,0.6 | | (0,−0.35,0) | slate | armL/R |
| Forearms | cap 0.24,0.55 (thicker than the upper arm, Popeye) | | (0,−0.3,0) | slate | foreL/R |
| Fists | box 0.35×0.32×0.35 t=0.85 | | (0,−0.7,0.02) | slate dark | foreL/R |
| Wrist wraps | cyl 0.26/0.26,0.12 | | (0,−0.5,0) | leather `#4a2f1d` | foreL/R |
| Loincloth | box 0.9×0.5×0.6 t=1.3 + belt cyl 0.55,0.12 | | (0,−0.2,0) | leather / rust | hips |
| Legs | cap 0.24,0.55 | | (0,−0.38,0) | slate | legL/R |
| Feet | box 0.4×0.15×0.5 | | (0,−0.82,0.1) | slate dark | legL/R |
| Log club | cyl 0.18/0.32,1.6, along fist axis, head end down/forward | | (0,−0.1,0.6) | bark `#5b3a22` + end ring `#c8a46a` (cut wood) | weapon |
| Club moss + stones | 2× sph 0.14 moss, 2× box 0.12 stones embedded | | club head | moss / stone `#8c8c84` (T: iron band gold) | weapon |

≈ 760 tris.
**Animation:**
- idle: heavy breathing (spine scale.y ±0.03, 0.4 Hz). The club rests on the ground, its tip dragging. Scratches its head every 6 s (armL raise).
- move: slow lumber (A = 0.35, stride 1.6 m). Hips roll ±0.12, shoulders counter-roll. The club tip drags along the ground (weapon rot keeps the tip at y≈0.1). Each footfall squashes the whole model y 0.97 for 0.05 s.
- attack tell (contact): 0.25 s two-handed overhead raise (both arms rot.x −2.6, spine lean back −0.25), then slam (0.08 s) with a dust-puff fx at the club head.
- knockback-resist read: while pushed it only sways (spine rot.x ±0.1); it never staggers back.

### 4.4 Goblin Shaman — `spitter` (ranged, r 0.55, hp 30, 0.4 s wind-up)

**Fantasy:** a hunched goblin witch-doctor in an antlered skull mask, shaking a bone staff that spits hexes.
**Silhouette:** a goblin body with a **tall staff rising above the head** (staff top 1.9 m against body 1.3 m), topped by a **skull and lime orb**. **Antlers** on the mask. A wide fur shawl. Ranged = "stick over head" (shape code).
**Proportions:** H 1.3 (antler tips 1.6). Head 0.44. Staff 1.75 long. Skull 0.22. Orb 0.12 r (idle) → 0.22 (wind-up peak). Fur shawl span 0.8.
**Rig:** goblin humanoid + foreR (for staff raising) + weapon (staff). Pivots as the grunt, with armR → foreR (0,−0.25,0).
**Parts (in addition to the goblin base: torso, head, ears, legs, arms as in 4.1, skin `#a3bd3c`):**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Fur shawl | cyl 0.42/0.3,0.25 open (cone frustum) over shoulders | | (0,0.42,0) | dark fur `#3a2a20` with bone beads | spine |
| Skull mask | sph 0.22 (1,0.9,1.1) front of head | | (0,0.2,0.12) | bone `#eadcb4` | head |
| Antlers ×2 | 3 cones each (main 0.05,0.4 + 2 tines 0.03,0.18) | | (±0.12,0.38,0) angled out 0.5 | bone, tips lime emissive 20% | head |
| Feathers | 2× box 0.04×0.25×0.08 | | behind ears | rust `#8a3b22` | head |
| Staff pole | cyl 0.03/0.04,1.75, gnarled (2 offset segments) | | grip at (0,0,0), extends +Y 1.2 / −Y 0.55 | wood `#6b4426` | weapon |
| Staff skull | sph 0.12 (1,0.9,1.15) + jaw box | | (0,1.25,0) | bone | weapon |
| Orb (in skull jaws / eye sockets) | ico 0.12 | | (0,1.38,0.05) | **lime `#b8ff3c` accent** (T: orb cage gold) | weapon |
| Hanging fetishes | 2× box 0.05×0.12×0.05 on strings | | (±0.1,1.1,0) | rust / bone | weapon |
| Loincloth | box 0.4×0.28×0.32 t=1.2 | | hips | rust | hips |
| Pouch belt | 2× sph 0.07 | | hips side | leather | hips |

≈ 520 tris.
**Animation:**
- idle / kite: keeps distance, sidesteps with a shuffling gait (A 0.5). The staff is planted and bobs. Antlers sway.
- **wind-up (0.4 s, must read):** at t=0, armR+foreR raise the staff overhead (staff pole vertical, skull 0.6 m above the head). The spine leans back 0.2. Orb `uGlow` ramps 0.3 → 3.0 and its scale ramps 1 → 1.8. Antler tips glow with it. The jaw opens. Over the last 0.08 s the orb colour lerps lime → white-magenta `#ff8ab0`.
- release: the staff thrusts toward the player (rot.x +1.2 in 0.06 s). The projectile spawns from the orb. Recoil step back 0.1 m.
- hit: mask tilts, staff wobbles.

### 4.5 Broodmother — `bloater` (splitter, r 0.75, hp 45 → 3 spiderlings)

**Fantasy:** a bloated forest spider dragging an egg-heavy abdomen, which bursts into spiderlings when killed.
**Silhouette:** the **round sac** (shape code). From above: a huge round abdomen with a **bone-white skull marking** and **glowing lime egg-pustules**, 8 radiating legs, and a small front body.
**Proportions:** body top at 0.95. Abdomen sph r 0.55 (dominant, about 60% of the top view). Cephalothorax 0.32. Leg span 2.0 m (legs extend past the collision radius; OK). Fangs 0.18.
**Rig:** spider rig. body (0,0.45,0.25) · abdomen (0,0.15,−0.45) rel. · jaw · 8 legs (upper + lower = 16 bones; for budget, merge the lower leg into the upper as a single bent part = 8 bones). ≈ 11–19 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Cephalothorax | sph 0.32 (1,0.7,1.2) | | (0,0,0) | aubergine `#2e2236` | body |
| Eyes cluster | 4× oct 0.05 (2 big, 2 small) | | (±0.07,0.12,0.3) | **lime** | body |
| Fangs/chelicerae ×2 | cone 0.06,0.2 pointing −Y/+Z | | (±0.07,−0.08,0.33) | bone `#eadcb4` | jaw |
| Abdomen | sph 0.55 (1,0.8,1.15), 8×6 segs | | (0,0.1,0) | aubergine, belly `#4a3550` | abdomen |
| Skull marking | box 0.3×0.02×0.3 (inset on the top) + 2 eye sockets | | (0,0.45,0) | **bone** (top-plane identity) | abdomen |
| Egg pustules | 5× sph 0.1, flattened, around the sides/top | | ring on abdomen | **lime** accent 60% (T: gold webbing band) | abdomen |
| Spinnerets | cone 0.08,0.15 rear | | (0,0,−0.6) | aubergine dark | abdomen |
| Legs ×8 | upper cap 0.05,0.6 angled up 0.6 rad; lower cone 0.05,0.7 angled down | | pivots around body ±0.25 X, Z −0.15…+0.2 | aubergine, knee bands `#6a4a74`, tips bone | leg_i |
| Hair tufts | 3 cones 0.04,0.12 per leg upper (optional) | | | dark | leg_i |

≈ 640 tris.
**Animation:**
- idle: abdomen throbs (scale 1 ± 0.05, 1.2 Hz). Egg pustules pulse with it (`uGlow` 0.3–0.7). Fangs click.
- move: tetrapod gait (A 0.35), body yaw jitter. The abdomen lags the body (rot.x spring) so it wobbles like a waterbed.
- attack (contact): rears the front up (body rot.x −0.5), the front leg pair raises, fangs open, lunge.
- low HP (<35%): the pustules glow at 1.5 and the abdomen throb speeds to 3 Hz. This is the "about to burst" tell.
- death: the abdomen scales 1.3 in 0.08 s, then bursts (lime + bone shards fx). The 3 spiderlings spawn from the pustule positions.

### 4.6 Spiderling — `mite` (swarmer, r 0.3, hp 5)

**Fantasy:** the Broodmother's skittering brood.
**Silhouette:** a tiny 8-legged star with a **lime-striped abdomen** and lime eyes. Read as "a dark dot with legs plus a lime dot".
**Proportions:** body top 0.28. Abdomen sph 0.16. Cephalothorax 0.1. Leg span 0.7.
**Rig:** spider rig with 8 single-segment legs (11 bones), or 4 leg bones moving L/R pairs if the budget is tight.
**Parts:** cephalothorax sph 0.1 aubergine `#2e2236`; abdomen sph 0.16 (1,0.8,1.2) aubergine with a **lime stripe** box 0.04×0.02×0.25 on top (accent 40%); eyes oct 0.03 ×2 lime; legs ×8 = cone 0.025,0.35 bent (upper and lower merged as a 2-box bend), aubergine with bone tips. ≈ 200 tris.
**Animation:** frantic tetrapod gait (stride 0.25, φ rate ×2). Body jitter amplitude ×2. Hops 0.1 m on attack. On spawn: tumble out of the burst (rot.x 2π over 0.3 s).

### 4.7 BOSS — Gorrak, the Troll King (`hollowWarden`, r 1.8)

Proposed rename: **"Gorrak the Mossbound, Troll King"**.
**Fantasy:** an ancient troll king, half overgrown into the forest, with a crown of antlers and branches, swinging an uprooted tree with its root-ball still attached, and a war horn on his belt.
**Silhouette:** a huge block of shoulders. A **crown of branching antlers/branches** (a wide spiky top-plane, unmistakable). An **uprooted tree** with a root-ball as his weapon. A **mossy back covered in glowing spore-pods** (fires the radial volley). A curved bone **war horn** on his left hip (summon tell).
**Proportions:** H 5.2 m (crown tips 6.0). Shoulder span 3.2. Head 0.85 w. Arms 2.7 long. Legs 1.6. Tree club 3.6 long; root-ball 0.9 r; trunk 0.35 r. Horn 0.9 long.
**Rig:** full humanoid with fore-arms and a back bone. hips (0,1.7,0) · spine (0,1.85,−0.1) · head (0,4.0,0.8) · jaw · armL (+1.5,3.8,0) → foreL · armR (−1.5,3.8,0) → foreR → weapon · legL/R (±0.6,1.7,0) · back (0,3.6,−0.6) for spore pods · horn (child of hips, can be grabbed by foreL). Plus 6 pod bones (to pop them individually). ≈ 20 bones.
**Parts (key):**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Chest | box 2.6×1.9×1.7, t=1.25, pitched 0.4 | | (0,1.2,0.2) | troll slate `#4f7d88` (older, mossier: `#5a8580`) | spine |
| Belly | sph 0.95 | | (0,0.4,0.35) | `#6e9aa3` | spine |
| Bark pauldrons ×2 | box 1.0×0.5×1.0 t=0.7 + 3 bark cones | | (±1.1,1.95,0) | bark `#5b3a22` | spine |
| Back moss mat | sph 1.1 (1.3,0.45,1.1) | | (0,1.9,−0.5) | moss `#7da83a` | back |
| Spore pods ×6 | sph 0.22 (1,1.3,1) on stalks cyl 0.05,0.3 | | arranged in a ring on the back | `#5b3a22` stalks, **pod caps lime accent** | pod_i |
| Head | box 0.85×0.75×0.9 t=0.8 | | (0,0.2,0.25) | slate | head |
| Crown | ring of 5 branch-antlers: main cone 0.08,1.0 + 2 tines each, plus a bone circlet torus 0.45 | | top of head | bark + bone `#eadcb4` (elite-like gold tips always on for the boss) | head |
| Mohawk | 6 cones 0.15,0.45 | | along the head top inside the crown | rust `#c9602a` | head |
| Beard of moss/vines | 3× cone 0.15,0.6 pointing down | | under jaw | moss | jaw |
| Tusks | lathe/cone 0.13,0.8 curved | | (±0.3,0.1,0.45) | bone | jaw |
| Eyes | oct 0.09 | | | lime | head |
| Arms / forearms / fists | cap 0.38,1.1 / cap 0.45,1.0 / box 0.65 | | | slate; vine wraps green | arm/fore |
| War horn | lathe cone 0.18,0.9, curled 0.8 rad, bone with iron bands | | (+0.75,0.1,0.35) on hip | bone / iron `#9aa0a6` | hips (handed to foreL during summon) |
| Loincloth | box 1.6×0.9×1.2 t=1.3, hide `#8a6a4a` + skull belt buckle | | | | hips |
| Tree club trunk | cyl 0.3/0.38,3.0 | | grip at 0.4 from base | bark `#5b3a22` | weapon |
| Root-ball | ico 0.9 (1,0.9,1.1) + 6 root cones 0.1,0.8 + 3 embedded stones | | club head | earth `#4a3424`, roots `#6b4426`, stones `#8c8c84` | weapon |
| Leaves on club | 2× sph 0.35 squashed | | branch stub | leaf `#4f8a34` lighter `#7cbf4a` | weapon |

≈ 3200 tris.
**Animation / tells:**
- idle: slow heavy breathing, crown sways. Spore pods idle-glow 0.3 with a staggered pulse (a "heartbeat" around the ring).
- move: very slow lumber (A 0.3). The ground-shake fx on each step is cosmetic. The root-ball drags.
- **Slam at player position (r5):** 0.6–0.8 s. Both hands grab the trunk. The arms raise overhead (rot.x −2.8). The body leans back 0.35, then rises onto its toes (hips +0.3 m). The root-ball reaches the apex at the moment the red telegraph is full, then crashes down. Hold the impact pose 0.3 s with dust ring fx.
- **Radial volley (12/24):** the boss **hunches forward** (spine rot.x +0.6) to show his back. The six pods swell (scale 1 → 1.5) and glow lime 0.3 → 3.0, ramping over the telegraph. At release each pod pops (flatten to scale 0.6, puff fx) and the magenta projectiles leave from the pod positions. For 24 shots, pods fire in two waves.
- **Summon 6 grunts:** the left hand grabs the war horn (horn bone reparent / IK-lite: armL rot to the mouth), the head tilts back 0.5, the jaw opens, and he blows (horn mouth flashes lime, 3 expanding sound-ring fx). The grunts drop from the canopy or run in.
- Phase 2 (if any): moss falls off (hide the moss parts) and slate turns darker with a lime glow in cracks (accent 0.6).

---

## 5. ACT II — Barrens · Warband

Faction quick-ref: orc skin `#4f6b2a` · iron `#2b2a2e` · rust edge `#8a4a2a` · dark leather `#3d2618` · bone `#eadfc4` · ogre slate-blue `#5d6a78` · accent **spirit teal `#1fe0c2`**. Fire resistance shows as soot-blackened iron and charred cloth edges (`#1a1412`), not as fire glow.

### 5.1 Orc Raider — `ashHusk` (chaser, r 0.5, hp 20)

**Fantasy:** a broad-shouldered Warband raider with a notched chopper and teal war-paint across the face.
**Silhouette:** **wide shoulders** (where the goblin had a big head), one **spiked iron pauldron** on the left, a **top-knot** on a small head, and a chopper held out right. Hunched forward.
**Proportions:** H 1.8 m (hunched; top-knot to 1.85). Shoulder span 0.95. Head 0.36 (20% of H). Arms 0.8, hands 0.18. Legs 0.75. Chopper 0.85 long with a 0.3 blade.
**Rig:** humanoid. hips (0,0.78,0) · spine (0,0.85,0) · head (0,1.45,0.15) · jaw · armL/R (±0.45,1.38,0) · weapon · legL/R (±0.16,0.78,0). 10 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Chest | box 0.85×0.6×0.5, t=1.2 (V-taper), pitched 0.3 | | (0,0.35,0.05) | orc skin `#4f6b2a` | spine |
| Leather harness | box 0.88×0.12×0.52 diagonal strap + belt | | | leather `#3d2618` | spine |
| Teal war-paint | 2 thin boxes across the chest (0.3×0.05) | | front of chest | **teal `#1fe0c2`** (matte 0.15 emissive) | spine |
| Pauldron L | sph 0.26 (1.2,0.7,1.1) + 2 spikes cone 0.06,0.25 | | (+0.05,0.05,0) | iron `#2b2a2e`, rim rust `#8a4a2a` (T: rim gold) / spikes bone | armL |
| Head | box 0.36×0.36×0.38 t=0.85 | | (0,0.16,0.04) | orc skin | head |
| Heavy brow | box 0.38×0.08×0.12 | | (0,0.24,0.18) | skin dark `#3c5420` | head |
| Top-knot | cone 0.08,0.3 up, tilted back + binding cyl | | (0,0.38,−0.08) | black `#1a1412` + bone ring | head |
| Eyes | oct 0.04 ×2 | | | **teal** | head |
| Face paint | box 0.3×0.05×0.02 across the eyes | | | teal 30% | head |
| Jaw + tusks | box 0.36×0.12×0.32 + cone 0.045,0.14 ×2 up | | | skin / bone | jaw |
| Arms | cap 0.11,0.55 | | (0,−0.3,0) | skin | armL/R |
| Bracer R | cyl 0.13/0.13,0.15 | | (0,−0.5,0) | leather | armR |
| Fists | box 0.18³ | | (0,−0.68,0) | skin dark | armL/R |
| Kilt | box 0.6×0.35×0.45 t=1.25, charred hem | | (0,−0.12,0) | leather / soot `#1a1412` | hips |
| Legs + boots | cap 0.12,0.5; box 0.2×0.14×0.3 | | | skin / leather | legL/R |
| Chopper | handle cyl 0.035,0.4; blade extrude 0.05×0.32×0.5, notched tip | | out along +Z from the fist | wood / iron `#55565c` edge `#cfd2d6` (T) | weapon |

≈ 520 tris.
**Animation:** move with an aggressive forward-leaning stride (A 0.55, lean 0.25). The chopper arm is held out and slightly raised. Attack tell: 0.12 s backhand wind (armR rot.y −1.2, spine twist −0.4), then a horizontal sweep. Idle: rolls its shoulders and bangs the chopper against the pauldron (a tiny 0.05 s spark is optional).

### 5.2 Warg — `cinderling` (swarmer, r 0.4, hp 12, very fast)

**Fantasy:** a lean, soot-furred hyena-wolf that runs the Warband's flanks in packs.
**Silhouette:** a long **horizontal wedge** with a **spiky black mane ridge** along the spine (from above: a dark arrow with a serrated stripe), **high shoulders sloping down to the hips** (hyena), and a big jaw forward.
**Proportions:** length 1.25 (nose to rump) + tail 0.35. Shoulder height 0.7, hip 0.5. Head 0.32 long. Legs 0.5 front, 0.4 back.
**Rig:** quadruped. body (0,0.55,0) · head (0,0.65,0.55) · jaw · legFL/FR (±0.12,0.55,0.32) · legBL/BR (±0.12,0.45,−0.35) · tail1 (0,0.5,−0.5). 9 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Chest | box 0.36×0.42×0.45 t=0.9 | | (0,0.05,0.2) | ash-brown fur `#4a3d36` | body |
| Barrel / hips | box 0.3×0.3×0.55, tz taper, sloping down 0.25 rad | | (0,−0.05,−0.22) | fur, belly lighter `#7a6656` | body |
| Mane ridge | 6× cone 0.06,0.22, pointing up/back | | along spine Z +0.35…−0.3 | **black `#1f1a18`** | body |
| Head | box 0.24×0.22×0.3 t=0.8 | | (0,0.02,0.12) | fur | head |
| Snout | box 0.16×0.12×0.2 | | (0,−0.03,0.3) | bone-white muzzle `#d9c9a8` | head |
| Ears | cone 0.05,0.14 ×2 | | (±0.08,0.15,0.0) | black | head |
| Eyes | oct 0.035 ×2 | | | **teal** | head |
| Jaw + fangs | box 0.14×0.06×0.2 + 2 bone cones | | | fur / bone | jaw |
| Legs ×4 | cap 0.05,0.4 (front), 0.045,0.32 (back, bent back) | | | fur dark `#2f2622` (paws) | leg_i |
| Tail | cone 0.07,0.4 pointing −Z, bushy tip sph 0.07 black | | | fur / black | tail1 |
| Iron collar | cyl 0.15/0.15,0.06 + spike cones | | neck | iron `#2b2a2e` / bone (T: gold) | body |

≈ 330 tris.
**Animation:** **gallop** at all times when moving (front pair in phase, back pair offset 0.5, A 0.8). Body pitch oscillation 0.1. Head stays level. Tail streams straight back. Idle: hunched, head low, laugh-shake (jaw open/close 8 Hz in short bursts). Attack (contact): lunge-bite, head forward 0.2 m and jaw snap.

### 5.3 Ogre — `obsidianBrute` (tank, r 0.95, hp 110)

**Fantasy:** a pot-bellied ogre enforcer in scavenged black iron, swinging a spiked iron-banded maul.
**Silhouette:** a **block** with a big **round belly** (circle inside the block) and a **tiny head with a single iron horn-helm**. The maul head is a big dark rectangle. It differs from the Forest Troll by the round belly, the cool slate-blue skin, the iron (black, not wood) weapon and the absence of a mohawk.
**Proportions:** H 3.0. Shoulder span 1.8. Belly sph 0.75. Head 0.45 (15% of H). Arms 1.3 with fists 0.38. Legs 0.95, stumpy. Maul 1.9 long; head 0.5×0.45×0.7.
**Rig:** humanoid with fore-arms. hips (0,1.0,0) · spine (0,1.1,0) · head (0,2.55,0.3) · jaw · armL/R (±0.85,2.3,0) → fore · weapon · legL/R (±0.38,1.0,0). 12 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Upper body | box 1.5×1.0×1.0 t=1.15 | | (0,0.9,0) | slate-blue `#5d6a78` | spine |
| Belly | sph 0.75 (1,0.9,0.95) | | (0,0.25,0.25) | lighter `#7b8794` | spine |
| Breastplate (half) | box 0.9×0.5×0.15 strapped on the upper chest | | (0,1.0,0.45) | iron `#2b2a2e`, rivets rust | spine |
| Pauldrons ×2 | box 0.5×0.3×0.55 t=0.7 + spike cone 0.08,0.35 | | (±0.75,1.45,0) | iron / bone (T: rims gold) | spine |
| Teal war-paint hand-print | box 0.35×0.35×0.02 on the belly | | belly front | **teal** 20% | spine |
| Head | box 0.45×0.42×0.45 | | (0,0.15,0.1) | slate-blue | head |
| Horn-helm | cyl 0.26/0.24,0.2 cap + 1 forward-curved horn cone 0.08,0.45 | | (0,0.33,0) | iron / bone horn | head |
| Eyes | oct 0.05 | | | teal | head |
| Underbite jaw | box 0.42×0.15×0.38 + 2 tusk cones 0.06,0.18 | | | slate / bone | jaw |
| Arms | cap 0.22,0.6 / fore cap 0.26,0.55 / fist box 0.38 | | | slate; iron bracer on R | arm/fore |
| Loincloth | box 0.9×0.5×0.8 t=1.3, charred | | hips | leather `#3d2618` / soot | hips |
| Legs | cap 0.28,0.55; foot box 0.45×0.18×0.55 | | | slate / iron toe caps | legL/R |
| Maul shaft | cyl 0.06,1.5 | | from the fist +Z | wood dark `#3a2618` with iron bands | weapon |
| Maul head | box 0.5×0.45×0.7 + 6 spike cones 0.07,0.2 | | shaft end | iron `#2b2a2e` / spikes bone (T: gold bands) | weapon |

≈ 720 tris.
**Animation:** waddle (A 0.3, hip roll 0.15). The belly jiggles (spring on the belly scale, 0.04). The maul is carried on the right shoulder (weapon rotated back) while walking. Attack tell: 0.3 s, the maul swings off the shoulder and raises behind the head, the belly pushes out, then a ground-slam. Knockback resist: belly-bounce instead of sliding.

### 5.4 Orc Spirit-Shaman — `emberSpitter` (ranged, r 0.55, hp 30, fiery trail shot)

**Fantasy:** an old orc shaman in a warg-skull headdress who pours spirit-fire from a brazier-staff.
**Silhouette:** an orc torso with a **brazier-topped staff above the head**, **two fetish poles with skulls on the back** (twin vertical spikes; from above a "V" behind the head), and a **warg-skull hood**.
**Proportions:** H 1.8. Staff 2.1 (brazier top at 2.25). Brazier bowl 0.2 r. Back poles 0.9 tall above the shoulders. Head 0.36.
**Rig:** orc humanoid (as 5.1) + foreR + back bone (poles). 12 bones.
**Parts (beyond the base orc body of 5.1, without the pauldron):**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Warg-skull hood | box 0.4×0.28×0.45 t=0.75 + snout box 0.22×0.12×0.25 + 2 ear cones | | over the head | bone `#eadfc4` | head |
| Fur mantle | cyl 0.55/0.4,0.3 open | | shoulders | soot fur `#2a211c` | spine |
| Beads/necklace | 5× oct 0.04 | | chest | teal 20% | spine |
| Back fetish poles ×2 | cyl 0.025,1.1 + small skull sph 0.08 + rag flag box 0.02×0.2×0.15 | | (±0.18,0.2,−0.25), tilted out 0.2 | wood / bone / leather | back |
| Staff | cyl 0.035/0.045,2.1, gnarled | | fist | wood `#3a2618` + bone rings | weapon |
| Brazier | cyl 0.2/0.12,0.18 open-top + 3 iron claw cones | | staff top | iron `#2b2a2e` (T: gold) | weapon |
| Spirit flame | 3× cone 0.1,0.3 (+ inner cone white) | | in the brazier, flicker | **teal `#1fe0c2`** core `#d6fff6` | weapon |
| Loin + robe flap (short, knee length, NOT to the ground) | box 0.5×0.45×0.4 t=1.2 | | hips | leather, charred hem | hips |

≈ 600 tris.
**Animation:**
- idle: staff planted, the flame flickers (cone scale y 1 ± 0.2 at 10 Hz), back poles sway with lag.
- **wind-up (0.4 s):** sweeps the staff back over the right shoulder (foreR rot.x −2.2, spine twist −0.5). The flame grows ×2.2 in height and shifts teal → white-hot. The jaw roars open. In the last 0.08 s the flame core flashes magenta-white.
- release: an overhand fling of the staff toward the player (spine twist +0.5). The projectile (magenta, with fiery trail) leaves the brazier. The flame drops to 0.5 for 0.3 s ("spent").

### 5.5 War Boar (with Goblin Outrider) — `magmaRam` (charger, r 0.7, hp 60, 0.7 s wind-up, 10 m charge)

**Fantasy:** an iron-masked war boar with huge tusks, ridden by a shrieking goblin carrying a teal-sigil pennant.
**Silhouette:** a **quadruped with a battering front**: an iron face-plate and **two big curved ivory tusks** pointing forward, a high bristle ridge, and the **rider's pennant pole** rising vertically over the back (a top-plane flag that is easy to spot).
**Proportions:** length 1.9, shoulder 1.05, hips 0.9. Head 0.55 long. Tusks 0.45 long, 0.08 r. Legs 0.55 (short, thick). Rider: goblin at 0.65 scale of the grunt, seated (0.6 m above the saddle). Pennant pole 1.2 tall. Top of the flag at about 2.4 m.
**Rig:** quadruped + rider bone. body (0,0.8,0) · head (0,0.85,0.75) · jaw · 4 legs (±0.22, 0.6, ±0.5) · tail · rider (0,1.05,−0.05) → riderArmR → pennant. ≈ 12 bones. *Budget option:* the rider can be one rigid part on the rider bone, with only the arm animated.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Body | box 0.75×0.75×1.4, t=0.85, tz front taller | | (0,0,0) | dark bristle-brown `#4a2e22` | body |
| Belly | box 0.6×0.2×1.1 | | (0,−0.35,0) | lighter `#6e4a36` | body |
| Bristle ridge | 7× cone 0.06,0.25 | | along the top | black `#1a1412` | body |
| Saddle + straps | box 0.6×0.12×0.5 + 2 straps | | (0,0.4,−0.05) | leather `#3d2618` / iron buckle | body |
| Head | box 0.5×0.45×0.55 t=0.8 | | (0,0,0.2) | bristle-brown | head |
| Snout disc | cyl 0.14/0.16,0.12 along Z | | (0,−0.1,0.5) | pink-tan `#b07a62` | head |
| Iron face-plate | box 0.52×0.35×0.06 + central spike cone 0.08,0.25 | | (0,0.1,0.45) | iron `#2b2a2e` (T: gold) / teal sigil stripe 20% | head |
| Tusks ×2 | lathe/cone 0.08,0.45 curving up and out (or 2 cones each) | | (±0.18,−0.12,0.45) | **ivory `#eadfc4`** | jaw |
| Eyes | oct 0.04 | | under the plate | teal | head |
| Ears | box 0.12×0.04×0.18 flopping | | | brown | head |
| Legs ×4 | cap 0.12,0.4 + hoof box 0.16×0.1×0.18 | | | brown / black hoof | leg_i |
| Tail | cone 0.03,0.25 curled | | rear | brown | tail1 |
| Rider body | goblin torso box 0.35×0.3×0.25 + head box 0.3 + ears cones 0.25 + goggles 2 cyl | | rider | goblin skin `#a3bd3c` / leather / goggles iron+teal lens | rider |
| Rider arm + pennant | cap 0.05,0.3; pole cyl 0.025,1.2; flag box 0.02×0.35×0.45 | | | wood / **bone flag with teal sigil** | riderArmR |

≈ 680 tris.
**Animation:**
- move (trot): A 0.45. The body bobs 0.04. The rider bounces with lag and the pennant waves (`rot.x = sin(t·8)·0.15`).
- **charge wind-up (0.7 s, must read):** (1) 0–0.15 s: the boar **lowers its head** (head rot.x +0.45) so the tusks point at the player, and the rear rises (body rot.x +0.12). (2) 0.15–0.6 s: the front right hoof **paws the ground twice** (legFR rot.x −0.8 → +0.3, twice), with a dust puff fx per paw. The snout emits 2 snort-puffs. The rider **lowers the pennant like a lance** (riderArmR rotates the pole forward to horizontal). (3) Over the last 0.1 s the body compresses (scale z 0.92, y 0.95) like a spring. The face-plate teal stripe ramps to `uGlow` 2.5.
- charge: gallop with A 1.0 and stretch scale z 1.08. Bristles flatten (rot.x −0.4). Dust trail.
- post-charge stagger (if it hits a wall or ends): shakes its head (head rot.y ±0.4, 3 times) and the rider wobbles.

### 5.6 Goblin Sapper — `pyreBomber` (bomber, r 0.55, hp 25, 1 s fuse, r 2.8 boom)

**Fantasy:** a goggled goblin sprinting at you with a lit powder keg held over its head and a terrible grin.
**Silhouette:** **object over the head** (shape code). From above it reads as a **round keg lid with a bone-white skull painted on it** and a **sparking fuse**. The goblin's big ears stick out under it.
**Proportions:** goblin H 1.15 (smaller than the grunt). Keg cyl r 0.32, h 0.55, held with its top at 1.85 (overhead, arms up). Fuse 0.2.
**Rig:** goblin humanoid with fore-arms (arms locked up holding the keg). The keg is on its own bone (child of spine, so it bounces). hips (0,0.4,0) · spine · head (0,0.8,0.06) · armL/R (±0.26,0.78,0) → fore · keg (0,1.35,0) · legs. 11 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Goblin body | as 4.1, scaled 0.85 | | | skin `#a3bd3c` / leather | — |
| Goggles | 2× cyl 0.07/0.07,0.05 along Z + strap | | eyes | iron `#2b2a2e`, lenses **teal** | head |
| Soot face | box (darken the snout) | | | `#6a7a2a` | head |
| Bandolier | box 0.05×0.5×0.05 diagonal + 3 small cyl kegs | | chest | leather / wood | spine |
| Keg body | cyl 0.3/0.32,0.55, 8 segs | | (0,0,0) | wood dark-red `#7a2e1e` | keg |
| Keg bands ×2 | cyl 0.33/0.33,0.05 | | ±0.18 | iron `#2b2a2e` (T: gold) | keg |
| Keg lid skull | box 0.3×0.02×0.3 (inset paint) | | (0,0.28,0) | **bone `#eadfc4`** (top-plane identity) | keg |
| Fuse | cyl 0.015,0.2 bent | | (0.1,0.32,0) | black | keg |
| Fuse spark | oct 0.06 + 2 tiny oct sparks (scale-flicker) | | fuse tip | **white-yellow `#fff2a0`** emissive | keg |
| Keg glow band (hidden until fuse) | cyl 0.325,0.04, emissive | | middle | `#ff5a2a` (matches telegraph) | keg |

≈ 520 tris.
**Animation:**
- move (run): fast, high-knee sprint (A 0.85, φ rate ×1.4). The keg bobs on the arms with lag (keg y spring 0.06). The fuse spark flickers at 6 Hz with random scale 0.7–1.3. The ears flap back. A spark trail fx drops every 0.1 s.
- **fuse (1 s, when close):** stops and plants its feet. The keg is **lifted higher** (arms fully up) and **shakes** (keg rot.z ±0.15 at 18 Hz, rising). The spark flicker rate rises 6 → 20 Hz and its size ×2. The keg glow band ramps 0 → 3 (red-orange, matching the ground telegraph). The goblin's legs jitter. Over the last 0.15 s the whole model scales 1 → 1.15 (bulge), then it explodes.
- (Death before fuse: the keg drops and rolls, then a small fizzle. Gameplay decides whether it explodes.)

### 5.7 BOSS — Vashkar, the Ashen Warchief (`vashkar`, r 2.2)

Keep "Vashkar". Retitle: **"Vashkar the Ashen Warchief"**. He is still the "cinder" fire boss, now made a character.
**Fantasy:** the Warband's giant warchief in soot-black plate with skull pauldrons and twin trophy banners on his back, wielding a molten-edged greataxe that sets the ground ablaze.
**Silhouette:** a huge inverted triangle: **enormous skull pauldrons**, a **horned helm with forward-curving horns** (bull-rush tell), **two tall back banners** (from above, two flags behind him: an instant Warband boss read), and a **greataxe with a crescent blade glowing along its edge**.
**Proportions:** H 6.0 (banner tops 8.0). Shoulder span 4.0 (pauldrons). Head 0.85 + horns 1.0 each. Arms 2.8. Legs 2.0. Greataxe 3.2 long, blade 1.3 tall × 1.0 deep.
**Rig:** full humanoid + fore-arms + back (banners, 2 bones for sway) + jaw. hips (0,2.1,0) · spine (0,2.3,0) · head (0,4.9,0.6) · armL/R (±1.75,4.6,0) → fore → weapon (axe is two-handed: parent to foreR, with foreL IK-faked to stay on the haft) · legL/R (±0.75,2.1,0) · bannerL/R (±0.5,5.0,−0.9). ≈ 16 bones.
**Parts (key):**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Torso | box 3.0×2.2×1.8 t=1.25 | | | orc skin `#4f6b2a` (darker elder `#425a22`) | spine |
| Chest plate | box 2.4×1.4×0.3 + 3 rivet rows | | front | iron `#2b2a2e`, rust edges | spine |
| Teal war-paint | 3 claw stripes box 0.15×0.9×0.02 | | over the plate | **teal** 30% | spine |
| Skull pauldrons ×2 | box 1.3×0.8×1.3 t=0.7 + giant skull (sph 0.45 + jaw) + 3 spikes cone 0.12,0.7 | | (±1.6,2.0,0) | iron / bone `#eadfc4` / spikes bone | spine |
| Helm | box 0.95×0.8×0.95 t=0.8 + face guard + 2 horns (lathe or 3-cone chains, 1.0 long, curving forward) | | head | iron / horns bone, tips soot | head |
| Eyes (through visor) | oct 0.1 ×2 | | | teal (P2: shift to ember `#ff5a2a`) | head |
| Tusks | cone 0.12,0.4 | | jaw | bone | jaw |
| Arms/fore/fists | cap 0.45/0.5 / box 0.7 + spiked bracers | | | skin / iron | |
| War-kilt | 4× box plates 0.7×1.0×0.1 hanging + belt with a skull buckle | | hips | iron / leather `#3d2618`, charred | hips |
| Legs + greaves | cap 0.55,1.4 + box greaves | | | skin / iron | legs |
| Back banners ×2 | pole cyl 0.06,4.0 + crossbar + cloth box 0.04×1.6×1.1 (2 segments for sway) + skull finial | | back | wood / **bone cloth with teal Warband sigil** / ragged soot hem | bannerL/R |
| Greataxe haft | cyl 0.09,3.2 | | | dark wood, iron bands | weapon |
| Greataxe blade | extrude crescent 1.3×1.0, thickness 0.12 (2 blades, double-bit) | | haft top | iron `#2b2a2e`, **edge strip `#ff5a2a` emissive** (enemy-hazard family, matches his burning ground) | weapon |
| Ember cracks in the blade | 3 thin boxes emissive | | | `#ffb040` | weapon |

≈ 3600 tris.
**Animation / tells:**
- idle: the banners wave (2-segment lag). Shoulder roll. The axe rests on the right shoulder. Breath steam puffs (fx).
- move: slow powerful stride (A 0.35). The armour clanks (pauldron rot.z ±0.05).
- **Bull-rush (26 m, leaves burning ground):** 0.7–0.9 s wind-up. He **lowers the horned helm** (head rot.x +0.5, spine +0.4), sweeps the axe back and low behind him (both arms rot.x +1.0, the axe trailing), and **scrapes his right foot twice** (legR rot.x −0.6 → +0.2, dust fx). The banners whip forward. The helm eyes and the axe edge ramp `uGlow` to 3.0. During the rush: hunched gallop-run (A 0.8), horns forward, the axe dragging and **sparking a fire trail** at its blade tip (this is where the burning ground visually comes from).
- **Meteor rain (6 circles):** **raises the greataxe skyward with both hands** (arms rot.x −3.0, the axe vertical). The blade flares white-orange. The jaw opens to roar, the head tilts back. Hold for the circle telegraph duration, then **thrust down** (the axe points at the ground) when the meteors fall.
- **Expanding flame rings:** a two-handed overhead **ground slam**: the axe buries into the ground in front of him (axe rot to −0.3 below horizontal, spine +0.6). On impact, a cracked-earth decal and the ring originates from the axe head, not his feet. Anticipation 0.4 s: rising on toes, axe behind his head.
- Phase 2: the banners catch fire (cloth vertex colour → charcoal, small flame fx), the eyes turn ember, and the war-paint brightens to 0.8.

---

## 6. ACT III — Riverlands · Wyrmkin

Faction quick-ref: wine scales `#8c2234` · oxblood `#5e1a22` · cream belly `#ecd3a0` · ivory horn `#f2e6c8` · stone slate `#5d6470` · membrane saffron `#e08a3a` · accent **prism white `#e6f4ff`** (tinted to the ward element when warded). Stormy lighting is cooler, so keep the warm body colours slightly more saturated than in other acts.

### 6.1 Dragon Whelp — `shardling` (swarmer, r 0.4, hp 12)

**Fantasy:** a yappy, cat-sized red whelp with a crystal nub on its nose, flapping like mad.
**Silhouette:** from above, **big saffron wings in a wide "X/plus"** around a small wine body, with a big head. It flies, so a shadow sits under it. The swarmer wedge comes from wings swept back during the dive.
**Proportions:** body length 0.55 (+ tail 0.45). Wingspan 1.2. Head 0.26 (big, cute). Hover height 1.0 (dives to 0.5 on attack).
**Rig:** flyer. body (0,1.0,0) · head (0,0.08,0.3) rel · jaw · wingL1/R1 (±0.1,0.1,0.05) → wing2 (±0.3,0,0) · tail1 → tail2. 10 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Body | sph 0.18 (1,0.9,1.5) | | (0,0,0) | wine `#a52a3a` (brighter juvenile) | body |
| Belly | sph 0.14 (1,0.7,1.3), offset down | | (0,−0.05,0.02) | cream `#ecd3a0` | body |
| Head | box 0.24×0.2×0.26 t=0.8 + snout box 0.14×0.1×0.14 | | head | wine | head |
| Horns ×2 | cone 0.04,0.16 swept back | | (±0.07,0.12,−0.06) | ivory | head |
| Nose crystal | oct 0.05 | | snout top | **prism white** | head |
| Eyes | oct 0.035 (big) | | | prism white 60% | head |
| Wing arm | cap 0.025,0.3 | | wing1 | wine | wing1 |
| Wing membrane inner | extrude triangle 0.32×0.28 | | wing1 | **saffron `#e08a3a`** | wing1 |
| Wing membrane outer | extrude triangle 0.3×0.25 + finger cones | | wing2 | saffron, edge wine | wing2 |
| Tail | cone 0.07,0.3 → cone 0.04,0.2 + tip crystal oct 0.04 | | tail1/2 | wine / prism | tail1/2 |
| Little legs | 2× cone 0.03,0.12 tucked | | under body | wine | body |

≈ 300 tris.
**Animation:** flap 14 rad/s with the phase-locked bob. Erratic hover: add noise `x/z += sin(t·3.1 + seed)·0.08`. Moving: pitch forward 0.3 and wings sweep back 0.3 rad (the wedge). Attack: wings fold (rot.z −1.2) for a 0.2 s dive to y 0.5 with a bite, then flap back up. Idle: tail curls, head tilts curiously.

### 6.2 Stone River Troll — `colossus` (tank, r 1.1, hp 140)

**Fantasy:** a hulking river troll whose back has fused with river-stone and grown prism crystals. It fights with boulder fists.
**Silhouette:** a **block** with a **stone-plated hunchback bristling with 5 tall prism crystals** (from above: a crystal crown on the back, a unique top-plane) and **two huge stone-knuckled fists**. No weapon (it differs from the Forest Troll's club and the Ogre's maul).
**Proportions:** H 3.3 (crystal tips 3.9). Shoulder span 2.1. Head 0.55, set low and forward. Arms 1.8 (knuckle-walking stance). Fists 0.55. Legs 1.0.
**Rig:** humanoid with fore-arms + back bone (crystals). hips (0,1.05,0) · spine (0,1.15,−0.1) · head (0,2.4,0.7) · jaw · armL/R (±1.0,2.5,0) → fore · legL/R (±0.4,1.05,0) · back (0,2.7,−0.5). 12 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Torso | box 1.8×1.3×1.3 t=1.2, pitched 0.5 | | | river-troll skin deep teal-grey `#3e5a62` | spine |
| Stone carapace | 4× box plates 0.7×0.25×0.6, rotated irregularly over the back | | back | stone slate `#5d6470`, lighter top `#8a909a` | back |
| Prism crystals ×5 | oct 0.12 stretched (1,4,1), 0.5–0.9 tall, splayed | | out of the carapace | **prism white**, base tint pale `#bfd8f0` (T: gold) | back |
| Head | box 0.55×0.45×0.6 t=0.8 | | | skin | head |
| Fin-ears ×2 | extrude triangle 0.3×0.25 | | head sides | wine `#8c2234` (Wyrmkin family tie) | head |
| Eyes | oct 0.06 | | | prism white | head |
| Jaw + underbite fangs | box 0.5×0.18×0.45 + 4 cones | | | skin / ivory | jaw |
| Arms / fore | cap 0.28,0.75 / cap 0.32,0.7 | | | skin; stone bracers on the forearms | arm/fore |
| Stone fists | box 0.55×0.5×0.55 t=0.85 + 3 knuckle boxes | | fore end | slate stone `#5d6470` | fore |
| Kelp/weed loincloth | 5× box 0.12×0.6×0.04 hanging | | hips | kelp green-brown `#3f5a2a` | hips |
| Legs | cap 0.32,0.6; foot box 0.5×0.2×0.6 | | | skin | legs |

≈ 680 tris.
**Animation:** knuckle-walk lumber: fists contact the ground on alternate steps (arms swing A 0.5, fist y kept ≥ 0.05). The crystals shimmer (accent `uGlow` 0.3–0.6 slow pulse). Attack tell (0.3 s): rears up (spine rot.x −0.5), both fists overhead clasped, then a double-fist smash with stone-debris fx. Idle: scrapes the ground with its fists, crystal pulse.

### 6.3 Naga Tidecaller — `voidSpitter` (ranged, r 0.55, hp 32, 3-shot spread)

**Fantasy:** a serpent-bodied river witch rising from her coils, with a fanned crest-hood, flinging three tide-orbs at once.
**Silhouette:** a **coiled tail ring on the ground** (from above: a circle "base" no other enemy has), an upright torso, and a **fanned crest-hood** behind the head. Her **staff is a trident** whose three prongs each hold a crystal (three tips = three shots).
**Proportions:** H 1.9 (crest top 2.1). Coil torus R 0.45, tube 0.16. Torso 0.5 wide. Head 0.3. Crest-hood 0.6 wide × 0.5 tall. Trident 1.9 (top at about 2.4 when raised).
**Rig:** serpent rig. coil (0,0.15,0) · rise1 (0,0.3,0.15) · rise2 (0,0.7,0.2) · spine/torso (0,1.1,0.2) · head (0,1.6,0.25) · jaw · armL/R (±0.28,1.45,0.2) → fore · weapon. 12 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Ground coil | torus R 0.45, r 0.16, 10×6 (partial arc 1.6π) | | (0,0,0) | wine scales `#8c2234`, belly cream on the inner side | coil |
| Tail rise 1/2 | cyl 0.16/0.18,0.45 each, bent | | | wine / cream front stripe | rise1/2 |
| Torso | box 0.45×0.5×0.3 t=1.15 | | | lighter scale `#a8455a`, cream chest | spine |
| Crest-hood | extrude fan 0.6×0.5 (3 ribs) | | behind the head | wine, rib edges **prism white** | head |
| Head | box 0.26×0.28×0.3 t=0.8 + snout | | | wine | head |
| Eyes | oct 0.04 | | | prism white | head |
| Arms / fore / hands | cap 0.07,0.3 / 0.06,0.28 / box 0.1 | | | wine | arms |
| Shell pauldrons | sph 0.14 (1.2,0.6,1) | | shoulders | river-shell teal-grey `#5e7f86` | spine |
| Trident shaft | cyl 0.03,1.9 | | right hand | driftwood `#b49b78` | weapon |
| Trident head | 3 prong cones 0.035,0.3 + crossbar box | | shaft top | ivory | weapon |
| Prong crystals ×3 | oct 0.07 | | prong tips | **prism white** accent (ward-tinted) | weapon |

≈ 560 tris.
**Animation:**
- idle / move: glides, the coil slides (no legs). Undulation waves rise up the body. The torso sways ±0.15. The hood flares a little in rhythm.
- **wind-up (0.4 s):** the body **rears up** (rise bones straighten, +0.2 m height). The **crest-hood fans fully open** (scale x 1 → 1.4). The trident raises overhead with both hands, prongs forward. The three prong crystals ramp `uGlow` 0.3 → 3.0 **one after another** (0.1 s stagger), giving a "1-2-3" read that matches the 3-shot spread. In the last 0.08 s they flash magenta-white.
- release: thrust forward. Three projectiles leave the three prongs in a fan. The hood relaxes.

### 6.4 Crag Drake — `crystalRam` (charger, r 0.7, hp 65, 0.7 s wind-up)

**Fantasy:** a wingless, low-slung armoured dragon-lizard with a crystal-studded battering crest.
**Silhouette:** a **quadruped with a battering front**: a **wide shovel crest** (a bone-ivory plate fanning up and back from the snout) with a **forward prism horn**, a low splayed lizard stance, and a thick tapering tail. From above: an arrowhead (the crest) plus a long tail.
**Proportions:** length 2.4 (incl. tail 0.9). Shoulder height 0.85. Crest 0.7 wide × 0.5 tall. Horn 0.35. Legs 0.45, splayed out 0.3 rad. Head 0.5 long.
**Rig:** quadruped with a 3-segment tail. body (0,0.55,0) · head (0,0.6,0.75) · jaw · legs (±0.35,0.45,±0.45) · tail1/2/3. 12 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Body | box 0.7×0.55×1.3 t=0.8 | | | oxblood `#5e1a22` | body |
| Back plates | 5× box 0.35×0.08×0.25 overlapping | | along the spine | stone slate `#5d6470` | body |
| Spine shards | 3× oct 0.06 stretched y ×3 | | between the plates | prism white | body |
| Belly | box 0.55×0.12×1.1 | | below | cream `#ecd3a0` | body |
| Head | box 0.4×0.32×0.5 t=0.85 | | | oxblood | head |
| Battering crest | box 0.7×0.5×0.1 t=1.3 tilted back 0.6 + 2 side frill cones | | head top/front | **ivory `#f2e6c8`** (T: gold rim) | head |
| Prism horn | oct 0.1 stretched z ×3.5 | | snout, pointing +Z | **prism white** accent | head |
| Eyes | oct 0.04 | | under the crest | prism white | head |
| Jaw | box 0.35×0.1×0.4 + teeth cones | | | oxblood / ivory | jaw |
| Legs ×4 | cap 0.12,0.35 splayed + claw foot box 0.2×0.08×0.22 + 3 ivory claw cones | | | oxblood / ivory | leg_i |
| Tail ×3 | cone-ish cyl 0.25→0.15→0.06, lengths 0.35/0.3/0.25 | | | oxblood, plates slate on tail1 | tail_i |

≈ 600 tris.
**Animation:**
- move: lizard trot (diagonal pairs, A 0.45). Body yaw S-curve `body.rot.y = sin(2πφ)·0.12`. The tail counter-waves.
- **charge wind-up (0.7 s):** **sinks low** (body y −0.15, legs splay further). The head lowers and the crest tilts forward so the horn levels at the player. The front claws dig (front legs rot.x −0.3, dust). The tail lashes side to side (tail1 rot.y ±0.6 at 6 Hz). The horn and spine shards ramp `uGlow` 0.3 → 3.0. Over the last 0.15 s it rears its head slightly back (anticipation, head rot.x −0.15).
- charge: gallop (front and back pairs, A 1.0). Head locked low. The tail stiffens straight (rotations → 0). A crystal sparkle trail.
- recovery: shakes its head, horn flicker fades.

### 6.5 Storm Wyvern — `wraith` (blinker, r 0.5, hp 28, 0.5 s blink telegraph)

**Fantasy:** a two-legged storm-wyvern that hangs in the air on huge saffron wings, then folds into a crackle of prism light and strikes from beside you.
**Silhouette:** **hovering with a big wingspan** (shape code). From above, **broad saffron wings** (2.2 m, about twice the whelp's and with a different flap rhythm), a long **barbed tail with a crystal stinger**, and dangling legs. Its blob shadow is offset under it.
**Proportions:** body 0.8 long. Head 0.38 + neck 0.3. Wingspan 2.2. Tail 1.0 in 3 segments. Hover height 1.7 (bob ±0.2). Legs 0.45 dangling.
**Rig:** flyer with neck, legs and tail. body (0,1.7,0) · neck→head (0,0.15,0.45) · jaw · wingL1/R1 (±0.15,0.12,0.05) → wing2 (±0.55,0,0) · tail1/2/3 · legL/R (±0.12,−0.15,−0.05). 15 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Body | sph 0.25 (1,0.85,1.6) | | | wine `#8c2234` | body |
| Belly | sph 0.2 (1,0.7,1.4) offset down | | | cream | body |
| Neck | cyl 0.1/0.14,0.35 tilted up/forward | | | wine | body |
| Head | box 0.24×0.2×0.38 t=0.7 + jaw | | | wine | head |
| Swept horns ×2 | cone 0.05,0.35 back | | | ivory | head |
| Crest crystal | oct 0.08 stretched y ×2 | | head top | **prism white** | head |
| Eyes | oct 0.04 | | | prism white | head |
| Wing arms | cap 0.04,0.55 / 0.03,0.6 | | wing1/2 | wine | wing1/2 |
| Membranes | extrude 0.55×0.45 (inner), 0.6×0.4 (outer, 3 finger ribs) | | | **saffron `#e08a3a`**, darker trailing edge `#b0582a` | wing1/2 |
| Legs | cap 0.06,0.3 + 3 ivory talon cones | | | wine / ivory | legL/R |
| Tail | cyl 0.12→0.07→0.04 | | | wine | tail1/2/3 |
| Stinger | oct 0.08 stretched z ×2.5 + 2 barb cones | | tail3 end | **prism white** accent | tail3 |

≈ 560 tris.
**Animation:**
- hover / move: slow heavy flap (7 rad/s). The body rises on the downstroke. Bob ±0.2 at 1 Hz on top. The tail sways in a lagged S. Head tracks the player.
- **blink telegraph (0.5 s, must read):** (1) **wings snap straight up and together** (wing1 rot.z → +1.3, wing2 folds −0.8), making the silhouette suddenly narrow and vertical. (2) The body **coils**: tail curls under (tail rot.x +0.6 each), head pulls back. (3) Crest crystal, stinger and eyes ramp to 3.0, **membranes flash to prism white** (vertex-colour lerp 0 → 0.7). (4) Over the last 0.08 s it scales to 0 with a twist (rot.y +π). The existing violet burst is replaced by prism-white + magenta sparkle (keep magenta minimal).
- arrival: it appears beside the player with wings **snapped wide open** (scale 0 → 1.1 → 1 over 0.15 s) and a stinger strike forward (tail whip).
- hit: a wing flinches.

### 6.6 Kobold Prism-Shaman — `prismHexer` (support, r 0.55, hp 40, barrier every 6 s)

**Fantasy:** a small dragon-blooded kobold priest hauling a towering totem staff crowned by a huge prism crystal that shields its kin.
**Silhouette:** **small body + oversized totem** (shape code). The totem pole (2.0 m, almost twice the kobold) has a **big rotating prism octahedron** at the top, the brightest white point among the enemies. A long snout and frilled head.
**Proportions:** H 1.15. Head 0.34 with snout 0.2. Tail 0.6. Totem 2.0. Crystal oct 0.3 (scale pulses to 0.4). Rings around the crystal 0.35 r.
**Rig:** humanoid with a tail and fore-arms (two-handed totem). hips (0,0.45,0) · spine · head (0,0.85,0.08) · jaw · armL/R (±0.2,0.78,0) → fore · weapon (totem) · legL/R (digitigrade look via angled feet) · tail1/2. 13 bones.
**Parts:**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Torso | box 0.36×0.42×0.28 t=0.85 | | | wine `#8c2234` (kobold lighter `#a33a3e`) | spine |
| Hide shawl + bone beads | cyl 0.28/0.22,0.18 open + 6 oct 0.03 | | shoulders | pale hide `#c9b28a` / ivory | spine |
| Head | box 0.28×0.26×0.3 t=0.8 | | | wine | head |
| Snout | box 0.16×0.12×0.22 | | | wine, cream underside | head |
| Frill | extrude fan 0.4×0.25 behind the head | | | saffron `#e08a3a` | head |
| Small horns ×2 | cone 0.03,0.15 | | | ivory | head |
| Eyes | oct 0.035 | | | prism white | head |
| Arms / legs | cap 0.05,0.25 / cap 0.07,0.28 + angled feet with ivory claws | | | wine | arms/legs |
| Loin wrap (short) | box 0.3×0.18×0.25 | | hips | hide | hips |
| Tail | cone 0.08,0.35 → cone 0.04,0.25 | | | wine | tail1/2 |
| Totem pole | cyl 0.04/0.05,2.0 with 3 carved ring cyls 0.07 | | held in both hands | driftwood `#b49b78` / ivory rings | weapon |
| Totem claw-cradle | 4× cone 0.03,0.25 curving up around the crystal | | pole top | ivory (T: gold) | weapon |
| Prism crystal | oct 0.3 (1,1.5,1), slowly rotating | | (0,1.1,0) above the cradle | **prism white**, accent 100% | weapon (child spin) |
| Orbiting rings (optional) | torus 0.35, tube 0.015 ×2 | | around the crystal | prism white 40% | weapon |
| Hanging scales | 3× box 0.06×0.1×0.01 on strings | | under the cradle | wine / saffron | weapon |

≈ 560 tris.
**Animation:**
- idle / kite: walks with the totem leaned forward (an old-pilgrim gait, A 0.5). Tail sways. The crystal spins 0.8 rad/s and pulses 0.4–0.7.
- **barrier cast (every 6 s), 0.5 s anticipation:** **plants the totem** (the pole goes vertical and stamps down 0.15 m, dust). Both arms raise it high (fore rot −1.6). The crystal **spins up** (0.8 → 8 rad/s), scales 1 → 1.35 and ramps `uGlow` to 3.5. The frill flares open (scale 1 → 1.3). At release: a white flash plus the existing ring, and thin prism lines (fx) from the crystal to each shielded ally.
- hit: hides behind the totem (spine lean, head down).

### 6.7 BOSS — The Prism Dragon (`riftHeart`, r 2.4)

Proposed title: **"Aurelith, the Prism Dragon"** (or keep "The Rift Heart" as the encounter name, with the dragon as its body; its crystal heart is visible in its chest).
**Fantasy:** an ancient four-legged winged dragon whose spine, horns and chest have crystallised into a living prism. Its scales shimmer to whatever element its ward currently holds, and it breathes sweeping beams from its crystal heart.
**Silhouette:** a classic **four-legged dragon with half-spread wings** (span 9 m spread, 5 m half-folded). A **row of tall crystal spines** along the back (top-plane signature). **Swept crystal horns.** A **glowing faceted heart** visible in the chest. A long tail with a crystal-shard club tip.
**Proportions (r 2.4):** body length 4.2 + neck 1.6 + tail 4.0, about 9.8 total. Shoulder height 2.4. Head top 4.2 when raised (neck up). Head 1.2 long. Wingspan 9.0 spread, 5.0 half-folded at rest. Legs 1.6 front, 1.8 back (thick). Spine crystals 0.4–1.2 tall.
**Rig:** quadruped + flyer combined. body (0,2.0,0) · chest · neck1/neck2 (2 bones) · head · jaw · 4 legs (+ fore segments for the front legs: 6 bones) · wingL1/L2, wingR1/R2 · tail1–4 · heart (child of chest, for pulse) · crystal row (back bone). ≈ 22 bones.
**Parts (key):**

| Part | Prim | Dims | Pos | Colour | Bone |
|---|---|---|---|---|---|
| Body | box 1.8×1.6×3.4 t=0.85, tz taper | | | **iridescent base**: dark slate-wine `#3a2232` (base). Per-vertex "facet" colours alternate ±8% so the ward tint reads as shimmer | body |
| Chest | sph 1.0 (1,1,1.2) | | front | same | chest |
| Chest plates | 6× box 0.9×0.1×0.35 stacked | | under the chest/belly | cream `#ecd3a0` | chest |
| Heart crystal | ico 0.45 (1,1.3,1), set into the chest, half exposed + cage of 4 rib cones | | chest front | **prism white → ward element**, accent 100% | heart |
| Spine crystals ×9 | oct 0.15–0.3 stretched y ×3–4, graded tall at the shoulders and smaller toward the tail | | along the back and tail1 | prism (ward-tinted, 70%) | body/tail1 |
| Neck | 2× cyl 0.45/0.55,0.8 with ridge cones | | | base | neck1/2 |
| Head | box 0.8×0.6×1.2 t=0.75 + snout box 0.5×0.35×0.5 | | | base, jaw underside cream | head |
| Horns | 2 main lathe/cone chains 0.12,1.3 swept back + 4 small cones; tips = crystal oct | | | ivory `#f2e6c8` / prism tips | head |
| Eyes | oct 0.1 | | | prism (ward) | head |
| Jaw | box 0.6×0.2×0.9 + teeth cones (ivory) + inner throat ico 0.15 (accent, glows on breath) | | | base / ivory / accent | jaw |
| Legs ×4 | upper cap 0.35,0.8 / lower cap 0.3,0.7 / foot box 0.6×0.25×0.7 + 3 ivory claws each | | | base / ivory | legs |
| Wing arms | cap 0.12,1.8 (wing1) / cap 0.09,2.2 (wing2) + 3 finger cylinders 0.05 | | | base | wing1/2 |
| Wing membranes | extrude fans: inner 1.8×1.6, outer 2.2×1.8 (3 panels each) | | | membrane **saffron `#e08a3a` → ward-tinted 40%**, trailing edge darker | wing1/2 |
| Wing crystals | 3 small oct per wing on the wrist | | | prism (ward) — the fan-of-shots origin points | wing2 |
| Tail | 4 segments cyl 0.5→0.1 + club of 5 crystal oct 0.25 at the tip | | | base / prism | tail1–4 |

≈ 3800 tris.
**Ward shimmer:** the boss cycles its ward every 10 s. Instead of only the icosa shell, **tint the whole accent channel** (heart, spines, horns, eyes, wing crystals) to the element, and lerp the membrane tint 40% and the body base 15% to it. Transition over 0.6 s with a ripple: the colour change travels from the heart outward along the spine (each spine crystal changes 0.05 s after the previous one). Element order is shown in gameplay. Keep shell alpha low on the boss (it is big): use edge-only facets.

**Animation / tells:**
- idle / slow advance (keeps ~5 m): heavy quadruped walk (A 0.3) with the neck in a slow S-sway. Wings half-folded and breathing (wing1 rot.z ±0.08). The heart pulses at 0.8 Hz (scale 1 ± 0.06, `uGlow` 0.6–1.2).
- **Sweeping beams (2 / 4), the breath:** 0.6 s wind-up. It **rears its head back** (neck1 rot.x −0.5, head rot.x −0.4) and **plants its front feet wide** (legs splay). The heart, then the throat, then the jaw glow ramps in sequence (heart 3.0 → throat 3.0 → mouth): a visible "charge travelling up the neck", with the neck crystals lighting in order. The jaw opens to 0.7. During the beam the head sweeps with the beam direction (the head yaw *is* the sweep), and the wings are spread for bracing. For 4 beams, the wings' wrist crystals emit the extra 2 beams (so you see where they come from).
- **Fans of shots:** **wings snap fully open** (spread 9 m), the wing crystals flare in a left-to-right sequence, and the shots leave the wing crystals with a magenta flash at release.
- **Summon whelps:** a roar (jaw open, head up, neck straight), the spine crystals pulse, and 3–5 crystal shards break off the back (fx). The whelps "hatch" from those shards.
- **Phase 2 (rains circles):** **takes to a low hover** (body y +1.2 over 1 s, heavy flapping 3 rad/s, legs dangling). The tail club swings. Circles fall while it hovers. It lands between volleys (dust ring).
- hit: crystals flicker white for 0.05 s.

---

## 7. Quick reference — sizes and signature reads

| Id | Creature | r | Height / length | Signature (top view at 50 px) | Accent tell |
|---|---|---|---|---|---|
| husk | Goblin Grunt | 0.5 | H 1.35 | T-bar ears + cleaver right | lime eyes |
| imp | Goblin Scamp | 0.4 | H 0.75, L 0.85 | white skull cap, low wedge, swept ears | lime eyes |
| brute | Forest Troll | 0.9 | H 2.7 | wide block, orange mohawk, tusks, log | lime eyes |
| spitter | Goblin Shaman | 0.55 | H 1.3, staff 1.9 | antlers + skull staff over head | lime orb (wind-up) |
| bloater | Broodmother | 0.75 | top 0.95, span 2.0 | round sac with bone skull + lime eggs | lime pustules |
| mite | Spiderling | 0.3 | span 0.7 | dark dot with legs + lime stripe | lime |
| hollowWarden | Gorrak the Troll King | 1.8 | H 5.2 | antler crown, tree club, spore-pod back | lime pods, horn |
| ashHusk | Orc Raider | 0.5 | H 1.8 | wide shoulders, spiked pauldron, top-knot | teal eyes/paint |
| cinderling | Warg | 0.4 | L 1.25 | dark wedge with spiky black mane ridge | teal eyes |
| obsidianBrute | Ogre | 0.95 | H 3.0 | block with round belly, tiny horned head, iron maul | teal paint |
| emberSpitter | Orc Spirit-Shaman | 0.55 | H 1.8, staff 2.25 | brazier staff + twin back fetish poles | teal flame (wind-up) |
| magmaRam | War Boar + Outrider | 0.7 | L 1.9, flag 2.4 | tusks forward, pennant on top | teal plate stripe |
| pyreBomber | Goblin Sapper | 0.55 | H 1.15, keg top 1.85 | keg lid with skull overhead, sparking fuse | white spark → red band |
| vashkar | Vashkar the Ashen Warchief | 2.2 | H 6.0 | skull pauldrons, twin banners, molten greataxe | teal eyes, ember edge |
| shardling | Dragon Whelp | 0.4 | span 1.2, hover 1.0 | saffron X-wings, small red body | prism nose |
| colossus | Stone River Troll | 1.1 | H 3.3 | crystal-spiked stone hunchback, boulder fists | prism crystals |
| voidSpitter | Naga Tidecaller | 0.55 | H 1.9 | ground coil ring + fan hood + trident | 3 prong crystals (staggered) |
| crystalRam | Crag Drake | 0.7 | L 2.4 | ivory shovel crest + prism horn, long tail | prism horn |
| wraith | Storm Wyvern | 0.5 | span 2.2, hover 1.7 | broad saffron wings + crystal stinger tail | membranes flash white |
| prismHexer | Kobold Prism-Shaman | 0.55 | H 1.15, totem 2.0 | tiny body, giant spinning prism on a pole | prism crystal spin-up |
| riftHeart | Aurelith, the Prism Dragon | 2.4 | L 9.8, span 9 | four-legged dragon, crystal spine row, glowing heart | whole accent = ward element |

---

## 8. Approval checklist (run for every model)

1. **Gameplay-camera screenshot** on its biome ground at 1080p, with 40 copies of itself plus 20 of each other enemy of the act. Can you name each type in under 0.5 s?
2. **Silhouette test:** render all of the act's enemies as flat black. Every archetype must still be distinguishable (no two share a silhouette).
3. **Greyscale test:** desaturate the screenshot. The enemy bulk must differ from the ground by ≥ 15–20 L\* on either the bulk or the top plane.
4. **Facing test:** from the top, can you tell which way it faces? Snouts, weapons, tusks and crests must point +Z.
5. **Tell test:** record the wind-up. The pose change must be visible with the glow disabled, and the glow must be visible with the pose frozen.
6. **Player test:** with the player in the middle of the pack, is the player still the most vertical, brightest, ringed object?
7. **Budget:** tris ≤ budget, bones ≤ 16 (regular) / 32 (boss), emissive area ≤ 5% (bosses ≤ 10%).
8. **Elite and ward variants:** gold trim, crown add-on and gold eyes are present. The ward shell does not hide the silhouette, and the accent recolours.

---

## 9. Sources

- Valve — Dota 2 Workshop Character Art Guide: https://help.steampowered.com/faqs/view/0688-7692-4D5A-1935 · PDF: http://media.steampowered.com/apps/dota2/workshop/Dota2CharacterArtGuide.pdf · summary: https://www.cgchannel.com/2012/06/valve-releases-useful-character-design-guide · discussion: https://polycount.com/discussion/comment/2790930
- Dota 2 lane creeps (role by held weapon): https://liquipedia.net/dota2/Lane_creep
- Christian Lichtner, Diablo III art (strong silhouettes, bold colour, dynamic animation): https://www.cgchannel.com/2012/04/video-christian-lichtner-on-the-art-of-diablo-iii/
- Diablo IV quarterly update, June 2021 (monster art, silhouette at game camera, gameplay-driven design): https://www.wowhead.com/news=323142/diablo-iv-quarterly-update-for-june-2021-character-art-story-cutscenes-wardrobe
- Warcraft III concept art / Samwise Didier style: https://www.gameinformer.com/2018/11/14/explore-warcraft-iiis-origins-in-this-rare-concept-art-gallery
- WC3 model philosophy (distinguishable units, palette swaps, low polys): https://www.wowhead.com/news/back-in-the-good-old-days-54185
- WC3 Reforged silhouettes when clumped: https://us.forums.blizzard.com/en/warcraft3/t/artstyle-raises-concerns/473
- Samwise Didier on top-down three-quarter silhouettes (StarCraft II): https://www.blizzplanet.com/blog/comments/eurogamer_interviews_samwise_didier
- Torchlight art direction (crisp characters on a painterly background): https://www.engadget.com/2009-09-10-an-insight-into-the-art-of-torchlight.html · Torchlight II review on monster readability: https://www.videogamer.com/?p=168284
- Hades (design-led art, colour script): https://mcvuk.com/?p=216051 · https://shacknews.com/article/122029/shacknews-best-art-style-of-2020-hades
- Readable game art / grayscale and flat-silhouette tests / state changes via shape: https://bugnet.io/blog/readable-game-art-why-clarity-beats-detail
- Shape language: https://rocketbrush.com/blog/shape-language-in-game-character-design-how-to-make-characters-readable-and-consistent
- KayKit Skeletons (chunky stylised low-poly, gradient atlas): https://kaylousberg.itch.io/kaykit-skeletons · https://godotengine.org/asset-library/asset/2566
- Quaternius Ultimate Monsters: https://sketchfab.com/3d-models/ultimate-monsters-pack-fd72e114d119488da71fe3a16f216c4f · https://quaternius.itch.io/
