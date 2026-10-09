# 09 — Hero Art Bible (Riftbound)

The sibling of `03-creature-art.md`, for the four playable heroes. The heroes are rebuilt on the **creature rig** (`src/game/creatures/rig.js`: PartBuilder parts, rigid bones, procedural `animate(P, s, B)`, vertex colours with the top-lit gradient, emissive accents, the 1.6 px inverted-hull outline). They replace the primitive stacks in `src/game/models.js`. Everything below is meant to be coded directly.

---

## TL;DR

1. **Today's heroes read as chess pawns.** They are a robe cone, a ball head, a cone hat and a stick, with no limbs and no gait. The monsters are chunky rigged creatures. The heroes move onto the **same rig, at the same bar**: 25–29 bones, about 1,200–1,700 tris (budget 2,500), the same outline, gradient and accent shader.
2. **Four orders of Vael, four bodies.** Each class is an order that forged a piece of the Riftcrown:
   - **Pyromancer**: Cinderwright forge-priest. Short and broad, with an ash-white beard, an ember-orange forge hood, a bronze **brazier-gauntlet** and a kiln backpack with a chimney.
   - **Cryomancer**: Stillwater Warden. Tall, with a white fur mantle in an A-frame, an ice tiara, and a **crook-staff with a hexagonal crystal**.
   - **Stormcaller**: Tempest Rider courier. Lean and leaning forward, with a **wide-brim hat disc**, a yellow scarf streaming behind and a **forked conductor's rod**.
   - **Arcanist**: Loomwarden archivist. Slender, with a white high collar, a floating **broken crown-halo**, a **floating tome** and orbiting glyph-stars.
3. **None of them is a robe plus a pointy hat.** They differ in body type, garment, focus (gauntlet / staff / rod / tome) and top-plane read at 50 px.
4. **Shared Crownforge material language:** rift-iron `#3a3350`, crown-bronze `#a07a48`/`#c8a874`, and the **Crownshard clasp**. The clasp is a bronze crown-point holding the class's Prime gem. It is the Riftbound mark and the in-world twin of the UI class sigils.
5. **Readability:**
   - Every hero sits at a **value extreme** on all three grounds: dark bulk at L\* 19–31 against ground at L\* 48–79, or a white top plane at L\* 92–95.
   - Every hero uses a **hue that the act faction does not**.
   - Every hero carries the **only always-blooming accent** on screen (the focus: base glow 0.45).
   - Add an element-tinted rim (0.45) and a **2.0 px outline** for the hero (the creatures stay at 1.6).
   - **Keep the ground ring.** Draw it under the hero, not over the boots, and add a crown-point **aim notch**.
6. **Upper/lower body split.**
   - The root faces the aim while casting. The hips yaw up to ±0.7 rad toward the movement, or toward its reverse when backpedalling, with hysteresis at 90°/110°.
   - The legs swing along the local move vector (`thigh.rx = −A·sinφ·cosμ`, `thigh.rz = 0.7·A·sinφ·sinμ`), so the same formula gives forward, strafe and backpedal.
   - The spine and chest counter-twist (−0.45ψ / −0.55ψ) so the chest stays on the aim.
7. **The rapid-cast loop is not a looping gesture.**
   - A held **cast stance** (attack 0.06 s, release 0.3 s) is combined with a tiny **per-shot recoil** (τ 70 ms, ≤ 0.5 rad).
   - The hands alternate where the class allows it.
   - Recoil is attenuated when shots come less than 0.28 s apart.
   - The torso never moves more than 0.15 rad per shot, so it does not look spastic.
8. **Full action set:**
   - heavy (raise, then slam, 0.55 s), throw (0.4 s), nova (0.45 s) and channel (loop)
   - one dash pose per class: Phase Step unfold, Flame Dash shoulder-charge, Glacial Slide ice-surf, Lightning Dash bolt-run
   - hit, death (topple, then **Rift recall** dissolve), idle fidgets and victory
9. **The element shows at rest, cheaply, and is tied to the trait meter:**
   - Pyromancer: chimney embers speed up with nearby Burn.
   - Cryomancer: **Frost Armor shards orbit the body**, one per armor charge.
   - Stormcaller: rod-tine sparks speed up with Momentum.
   - Arcanist: halo and glyph spin speed up with Chain.
   - Each hero emits at most 6 particles/s.
10. **New code.** All state and smoothing lives in a new `HeroAnim` controller (player side). `animate()` stays stateless and allocation-free and reads `s.h.hero`. The renderer already exposes `h.bones` and `h.matrix` for muzzle points.

---

## 0. Conventions

* **Space:** metres, Y up, feet at y = 0, faces **+Z**. **Left = +X** (`…L` bones) and right = −X (`…R`). The **focus hand is the right hand (−X)**, as for the creatures. The old models carried the staff on +X, so this is a deliberate flip.
* **Coordinates:** bone pivots and part positions are **model space**, at rest (ART.md §2). All tables below are already in model space.
* **Rotation signs** (XYZ euler, as in `greenskins.js`):

  | Rotation | Effect |
  |---|---|
  | +rot.x | pitches an upright segment's top **forward**, or swings a hanging limb **back**. So arm forward/up and thigh forward are **negative** rot.x. Knee flex is **+** shin.rx. |
  | +rot.y | turns the bone toward **+X** (its own left). The torso turned +y brings the **right** shoulder forward. |
  | +rot.z | moves a hanging limb toward **+X**. For the left arm that is outward (raise), so the right arm raises with −rot.z. An upright segment with +rot.z leans toward **−X**. |

* **Scale at play.** The camera is ortho at 40.8° elevation, with viewSize 24 u at zoom 1.
  * At 1080p that is 45 px/m horizontally, so a 2.0 m hero is ≈ **68 px** tall (45 px at 720p).
  * Features under 0.15 m (7 px) are texture only.
  * No identity-critical feature may be under 0.2 m (as in creature bible §0).
* **Shared helpers** (put them in `src/game/creatures/heroes.js`; `span`/`along` move from `greenskins.js` to a shared export in `rig.js`):

```js
import { defineCreature, TAU, clamp01, smooth, bump, span } from './rig.js';
// cylinder from p0 (radius r0) to p1 (radius r1)
const limb = (pb, r0, r1, p0, p1, o) => { const s = span(p0, p1); return pb.cyl(r1, r0, s.len, { radial: 7, ...o, pos: s.pos, rot: s.rot }); };
// 4-point star (the Arcane element shape from design/UI.md §1.2)
const STAR4 = (r, ri = r * 0.3) => [[0, r], [ri, ri], [r, 0], [ri, -ri], [0, -r], [-ri, -ri], [-r, 0], [-ri, ri]];
// crown point (the Crownforge ornament, design/UI.md §4 --orn-crown)
const CROWN_PT = [[-0.08, -0.05], [0.08, -0.05], [0.08, 0.025], [0.045, 0], [0, 0.065], [-0.045, 0], [-0.08, 0.025]];
const BOLT = [[-0.02, 0.07], [0.04, 0.07], [0.01, 0.01], [0.04, 0.01], [-0.03, -0.08], [-0.005, -0.01], [-0.035, -0.01]];
// the Riftbound mark: bronze crown-point clasp holding the class's Prime gem
function crownClasp(pb, bone, p, gem) {
  pb.extrude(CROWN_PT, 0.03, { bone, pos: p, color: BRONZE_HI });
  pb.sphere(0.042, { bone, pos: [p[0], p[1] + 0.005, p[2] + 0.025], seg: [4, 2], color: gem, emis: 2.6 });
}
```

* **Shared palette** (sRGB hex). L\* values were measured with the CIE formula.

| Token | Hex | L\* | Use |
|---|---|---|---|
| RIFT_IRON | `#3a3350` | 23 | all metal plates, fists, shafts (= UI `--cf-plate` family, violet-black) |
| RIFT_IRON_HI | `#5a4f78` | 36 | lit metal, staff shafts |
| BRONZE_LO / BRONZE / BRONZE_HI | `#6e5232` / `#a07a48` / `#c8a874` | 36 / 54 / 71 | crown-bronze (= UI `--cf-bronze*`): trims, pauldrons, clasps |
| GILT | `#ecd9a6` | 87 | pages, highlights (= `--cf-gilt`) |
| LEATHER / LEATHER_D / SOLE | `#5a3f2c` / `#2e2020` / `#221a1e` | 30 / 14 / 11 | straps, belts, soles |
| FIRE / FIRE_HI | `#ff7a33` / `#ffd0a8` | 66 / 87 | Pyromancer emissive (= `--fire`, `--fire-hi`) |
| FROST / FROST_HI | `#7fe0ff` / `#e2f8ff` | 85 / 97 | Cryomancer emissive |
| STORM / STORM_HI | `#ffe45c` / `#fff7c8` | 91 / 97 | Stormcaller emissive |
| ARCANE / ARCANE_HI | `#c08cff` / `#e6d2ff` | 67 / 87 | Arcanist emissive |

**Forbidden on heroes as large fields:**
* lime `#b8ff3c`, spirit teal `#1fe0c2` and prism-white **emissive** `#e6f4ff`. These are the enemy faction tells.
* elite gold `#ffc93a`.
* magenta `#ff2a6d` and telegraph red `#ff3344` / `#ff5a2a`.

---

## 1. World fit — who the four are

**Lore anchor (DESIGN §2).** Vael's mages tried to bind the four Primes into the Riftcrown. Each Prime was courted by an **order**, and each order made one part of the crown. When it shattered, a sliver of it lodged in each surviving mage and **tethered them to the Rift**. These are the Riftbound. The sliver is visible on every hero as the **Crownshard clasp**: a bronze crown-point holding a gem of the order's Prime. It pulses with the class meter and flashes prism-white on Rift Shift and on PERFECT. The UI class sigils (`class-*` = "a crown point with the class Prime gem", UI.md §5) are the same object. Hero and HUD share one emblem.

**Material language (Crownforge, UI.md §1).**
* **Rift-iron** (violet-black) is the only "metal grey". There is no neutral iron grey `#9aa0a6`, which is the goblin iron.
* **Crown-bronze** is used for trims, clasps, pauldrons and foci.
* **One Prime colour per hero**, and only as emissive gems, cores and tips.
* Cloth and leather carry the order's culture.
* Nobody wears gold. Gold is the elite tell.

| | **Pyromancer** — *Kindler of Ruin* | **Cryomancer** — *Keeper of Stillness* | **Stormcaller** — *Rider of the Tempest* | **Arcanist** — *Weaver of the Rift* |
|---|---|---|---|---|
| Order | **The Cinderwrights**, forge-priests of the Ember Prime. They cast the Riftcrown's bronze band in the forge-temples of the Sunscorch. | **The Stillwater Wardens**, keepers of the Frost Prime's glacier-vault at the source of the Stormwater. | **The Tempest Riders**, sky-couriers of the Storm Prime who carried the crown's parts between the orders along the storm roads. | **The Loomwardens of the Prism Archive**, who wrote the binding and still read the Rift like a loom. |
| Home biome | Act II Barrens. The orcs now camp in their plundered forge-temples (the reason the Warband resists fire). | Act III Reach. The cold headwaters above the drowned ruins. | All three. Weather-beaten travellers; the hat and coat are road gear. | Act I Thornwood. Grove-observatories and root-libraries inside the old forest. |
| Body | **Stocky, broad, short-legged.** Fire-plug brawler, 1.81 m head top, 1.97 m chimney top, shoulder span about 1.0 m. | **Tall and massive.** A white A-frame, 2.12 m to the tiara tip, mantle span about 1.0 m. | **Lean and athletic**, leans forward, 2.1 m to the hat tip, hat disc 0.72 m. | **Slender and tall**, upright and serene, 2.09 m to the halo top, shoulders 0.6 m. |
| Garments | Soot-leather coat, thick leather apron, ember-orange forge hood with a liripipe tail, bronze goggles, bronze shin greaves, steel-toe boots | White fur mantle and hood, rift-iron cuirass, cobalt robe split into 3 panels, cobalt cape with a fur hem, rift-iron greaves | Navy long coat with two swallow-tails and yellow lining, yellow scarf, tall boots, wide-brim hat with a bent tip and a bolt pin | Violet long-coat, white stole and tabard, high standing collar, soft pointed boots |
| Focus | **Brazier-gauntlet** (right forearm and fist): bronze bracer with a coal window behind rift-iron bars, a glowing palm core and knuckle flames | **Stillwater Crook**: 1.7 m rift-iron staff, bronze claw, **hexagonal** ice crystal (the UI frost shape) | **Conductor's rod**: 1.2 m rift-iron baton with a bronze **fork**; sparks arc between the tines | **Floating tome** (left) + **rift-key wand** (right) + **shattered crown-halo** |
| Signature (LoL "one primary read") | the oversized bronze fist | the white triangle with a glowing crystal | the dark hat disc with a yellow streamer | the halo ring with a floating gold book |
| Secondary | white beard, chimney spike | ice tiara, Frost Armor orbiters | swallow-tails, forked tip | white bun, orbiting stars |

**Reference notes (what makes a hero read at iso scale):**
* **League of Legends:** the silhouette is "the single most important thing for champion recognition". Each champion has one defining primary feature that shows its **source of power** (a staff means spellcaster), and facing must read at a glance ([Riot, *Clarity in League*](https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/)). That is why each hero's focus *is* its signature, and why the focus is oversized.
* **Diablo IV:** "bigger shapes" on armour and "reduce things that affect readability", judged at the game camera ([GameBanshee, June 2021 quarterly update](https://gamebanshee.com/ar4pw), [GameSpot](https://gamespot.com/articles/diablo-4s-art-direction-emphasizes-hand-crafted-details-plenty-of-customization-and-just-enough-realism/1100-6493411/)). So there are no noisy straps or tiny buckles. Each hero has 3–4 big colour fields.
* **Hades:** readable action comes from pose, timing and silhouette, with brightness and detail density kept under control. This is secondary commentary ([MCV/Develop](https://mcvuk.com/?p=216051)). It is the basis for the strong key poses for casting and dashing.
* **Torchlight:** crisp, saturated characters over a softer painterly ground ([Engadget on Torchlight's art](https://www.engadget.com/2009-09-10-an-insight-into-the-art-of-torchlight.html)). Runic "chunked up the detail" of armour sets for readability ([Runic blog](https://www.runicgames.com/blog/2012/05/03/armor-set-contest-winners-update/)).
* **Warcraft III** *(observed)*: hero units are scaled up over regular units, have unique silhouettes, and often carry a glowing weapon, while regular units are palette swaps ([Wowhead on WC3 models](https://www.wowhead.com/news/back-in-the-good-old-days-54185)). Our hero is likewise the tallest "person" and the only always-glowing one.
* **KayKit Adventurers** (mage, knight, rogue, barbarian): chunky proportions with oversized head, hands and feet, and props as separate pieces ([itch.io](https://kaylousberg.itch.io/kaykit-adventurers)). Our heroes are semi-chibi: head ≈ 18% of height, hands 0.12–0.25 m, feet 0.25–0.29 m long.

---

## 2. Readability at iso scale

**Goal:** among 300 monsters the hero is found in under 0.3 s and identified in under 0.5 s. Six layers, from strongest to weakest:

1. **Ground ring (keep it).** It is the one channel no enemy has (creature bible §2.1). Changes:
   * **Draw order.** The ring (renderOrder 19/20, depthTest off) currently paints *over the boots*. Give the hero mesh `renderOrder = 21` so it draws after the ring. Enemies still get covered by the ring, which is intended.
   * **Aim notch.** Add a small crown-point chevron, 0.18 × 0.14 m, in the element colour, sitting on the ring at the **aim** angle (outer radius + 0.06). With the upper/lower split the legs no longer always show where you shoot, so the notch does.
   * **Pulse.** On each cast the ring scale pulses `1.15 → 1.22 → 1.15` over 0.12 s.
2. **Value extreme vs the ground.** Measured ground L\*:
   * Thornwood grass 48–56 (undergrowth 35)
   * Barrens earth 60–76, golden grass tips 79
   * Reach meadow 56–65, water 40–60, banks 52

   Every hero has a **bulk at L\* 19–31** (dark) and/or a **top plane at L\* 85–95** (light). Both differ from every ground by at least 19 L\*.
3. **A hue the act faction doesn't own.** The table below gives the details.
4. **Always-on bloom.** The hero focus is the only accent that blooms at rest. Use `h.glow` baseline **0.45**, so a focus at emis 2.8 emits about 3.0× its colour and crosses the 1.1 bloom threshold. Enemy accents idle at glow 0 (0.35×) and bloom only during wind-ups.
5. **Element-tinted rim + 2.0 px outline.**
   * `h.rim = [element-hi (linear), 0.45]` (creatures use 0.35–0.4 warm/cool white). The values are fire-hi `#ffd0a8`, frost-hi `#e2f8ff`, storm-hi `#fff7c8` and arcane-hi `#e6d2ff`.
   * Put heroes in a dedicated `CreatureRenderer` with `outlinePx = 2.0`.
6. **Height and pose.**
   * The hero is 1.97–2.12 m. Act I goblins are 1.35 m and orcs 1.8 m.
   * The hero is the only figure whose **arm points at the cursor** in the cast stance.

**Bright head / hat.** The camera sees the top plane: head, shoulders, hat and anything held up cover roughly half the pixels (creature bible §2.3.2). Three heroes put **light identity on top**:
* Cryomancer: white hood and mantle, L\* 95.
* Arcanist: white bun, white collar and gilt tome, L\* 87–94.
* Pyromancer: bronze pauldrons (L\* 54/71), ember hood (51) and white beard (84) in front.

The Stormcaller deliberately inverts this. Its top is a **dark disc** (L\* 19) ringed by a yellow band (85). No enemy has a large dark disc top, and all grounds are mid-light. The top-lit gradient stays at `[0.7, 1.08]` (feet ×0.7).

| Hero | Bulk L\* | Top / identity L\* | Signature hue | Thornwood (green 48–56; goblin olive 73 / leather 22) | Barrens (beige 60–79; orc olive 42 / iron 17 / teal) | Reach (meadow 56–65, water 40–60; wine 32 / cream 85 / saffron 65) |
|---|---|---|---|---|---|---|
| Pyromancer | soot 19, apron 33 | hood 51, bronze 54–71, beard 84, fist glow | ember orange + bronze (20–35°) | bulk −33 ✓. Same light/dark sandwich as goblins, but separated by orange/bronze hue, height, the fist and glow. | bulk −45 ✓. **Hardest case:** dark like the orcs, so the orange hood, bronze, white beard, chimney embers and fire rim must carry it. | bulk −41 ✓. Orange L51 vs wine L32: different hue *and* value. |
| Cryomancer | robe 31, cuirass 23 | fur 95, crystal 90 | white + cobalt (215°) + frost cyan | top +43 ✓ | top +19…+35 and bulk −33 ✓ (the two-tone reads on light ground) | top +34 ✓. Cream bellies are small, and prism crystals are white not cyan. |
| Stormcaller | coat 25, hat 19 | scarf 85, lining 77 | navy (225°) + lemon yellow (51°) | hat −33, scarf +33 ✓ | hat −45 ✓, scarf +10…+25 (weak, but the hat carries it) | hat −41 ✓. Lemon 51° vs saffron 28°. |
| Arcanist | robe 27 | stole 92, hair 94, gilt 87 | violet (265°) + white | robe −25, collar +40 ✓; violet is complementary to green | robe −37 ✓ | robe −33 ✓. Violet vs wine is a ~85° hue gap, plus the white collar. |

**Hue rule.** No hero uses green, olive, teal, beige or wine as a large field. Each hero's one saturated field (ember hood, lemon scarf, violet robe, cobalt robe) is 1.3–1.6× more saturated than the ground under it (Torchlight's crisp-on-soft).

**Emissive budget.** Each hero keeps glowing area at **≤ 5%** of its surface (focus + gem + eyes + small tips). Big spells stay the brightest thing; the hero is the second-brightest.

---

## 3. Per-hero build spec (summary; full tables in Appendices A–D)

All four share one **hero skeleton**:

| Group | Bones |
|---|---|
| Torso | root → hips → spine → chest → head (+ one head child: hood / crown / hat / bun) |
| Arms | arm/fore/hand L and R |
| Focus | `focus` on handR (+ one child where needed) |
| Legs | thigh/shin/foot L and R |
| Cloth | 2–4 cloth bones |
| Mark | `shard` (the clasp) |
| Secondary | 0–3 secondary-motion bones |

Totals: Pyromancer 25, Cryomancer 29, Stormcaller 27, Arcanist 28 (limit 32). Collision radius 0.5 everywhere. Every hero has `muzzle` set to the focus emitter.

| | Pyromancer | Cryomancer | Stormcaller | Arcanist |
|---|---|---|---|---|
| Hip / waist / chest / neck y | 0.78 / 0.90 / 1.10 / 1.44 | 0.90 / 1.02 / 1.24 / 1.60 | 0.86 / 0.98 / 1.18 / 1.50 | 0.92 / 1.04 / 1.24 / 1.58 |
| Shoulder pivot | ±0.31, 1.36 | ±0.29, 1.50 | ±0.25, 1.42 | ±0.23, 1.48 |
| Head box | 0.34×0.32×0.32 at y 1.61 | 0.32×0.34×0.32 at 1.77 | 0.32×0.34×0.32 at 1.67 | 0.30×0.33×0.30 at 1.745 |
| Top | chimney 1.97 (hood 1.88) | tiara 2.12 | hat tip ~2.1 | halo 2.09 (bun 2.08) |
| Leg length (hip→sole) | 0.78 | 0.90 | 0.86 | 0.92 |
| Stride (m / gait cycle) | 1.95 | 1.85 | 2.45 | 1.95 |
| Tris (est.) | ≈ 1,450 | ≈ 1,650 | ≈ 1,250 | ≈ 1,350 |
| Muzzle | palm core (−0.355, 0.58, 0.12) → in stance it faces the aim | crystal (−0.33, 2.0, 0.08) | tine midpoint (−0.28, 1.82, 0.06) | wand star (−0.26, 1.39, 0.06) |
| Emissive parts | palm core, knuckle flames, coal window, chimney mouth, goggle lenses, eyes, clasp gem | crystal (1.0 body, 2.4 tip), tiara tips, eyes, clasp, armor shards (when active) | tine tips, eyes, clasp | wand star, halo stars, tome sigil, bun gem, glyph-stars, eyes, clasp |

**Spec fields per def:**
* `stride` as in the table.
* `blob: 0.6`.
* `gradient: [0.7, 1.08]`.
* `deathTime: 1.4`. Heroes play their own death; don't use the renderer's corpse topple.
* `height: 2.1`.
* `outline` on.

**Elite channels reused as cosmetics (optional).** `trim: true` is set on the bronze trims, so `h.elite = true` can show an "Ascended" look at Rift Tier ≥ 3. Heroes have **no** `eliteOnly` parts.

---

## 4. Animation set

### 4.1 Architecture

* **Controller (new, `src/game/heroAnim.js`).** It is called from `Player.update(dt)`, owns every bit of state and smoothing, and writes `h.yaw`, `h.pos`, `h.glow`, `h.rim`, `h.accent`, `h.action`/`h.k` and `h.hero`:

```js
h.hero = {
  aimRel: 0,    // wrap(aimYaw − rootYaw), rad
  moveRel: 0,   // wrap(moveYaw − rootYaw) = δ
  psi: 0,       // lower-body yaw ψ (smoothed, ±0.7)
  mu: 0,        // local move angle in the hips frame μ = δ − ψ
  back: false,  // backpedal leg frame (hysteresis)
  hold: 0,      // starter cast stance 0..1
  shot: 0,      // per-shot recoil 1 → 0 (τ 70 ms)
  shotN: 0,     // shot counter (hand alternation)
  dashN: 0,     // dash counter (Stormcaller mirror)
  meter: 0,     // class meter 0..1 (Momentum/100, Chain/25, burning-near/5, armor/3)
  armor: 0,     // Cryomancer Frost Armor 0..3
  fidget: 0,    // idle flourish progress 0..1 (0 = none)
  stomp: 0,     // Pyromancer footfall squash 1 → 0 over 0.06 s (set when |sin φ| crosses 0.95)
}
```

* **`animate(P, s, B)` is stateless.** It reads `s.walk`, `s.move`, `s.speed`, `s.t`, `s.hit`, `s.action`, `s.k` and `s.h.hero`. It does no allocation.
* **Layer order (override weights):**

  | Order | Layer | Kind |
  |---|---|---|
  | 1 | idle | base |
  | 2 | locomotion | base |
  | 3 | aim twist | added |
  | 4 | free-arm swing | base |
  | 5 | cast stance and shot recoil | overrides the arms by `hold` |
  | 6 | throw / heavy / nova / channel | overrides the upper body by w, and the lower body only when standing |
  | 7 | dash / arrive | overrides the full body |
  | 8 | hit | added |
  | 9 | death / victory | overrides the full body |

  Write the layers into module-level scratch arrays and flush once:

```js
const R = new Float32Array(32 * 9);            // rx ry rz mx my mz sx sy sz per bone
const reset = (n) => { for (let b = 0; b < n; b++) { const o = b * 9; R.fill(0, o, o + 6); R[o + 6] = R[o + 7] = R[o + 8] = 1; } };
const add = (b, x, y, z) => { const o = b * 9; R[o] += x; R[o + 1] += y; R[o + 2] += z; };
const mv  = (b, x, y, z) => { const o = b * 9 + 3; R[o] += x; R[o + 1] += y; R[o + 2] += z; };
const put = (b, x, y, z, w) => { const o = b * 9; R[o] += (x - R[o]) * w; R[o + 1] += (y - R[o + 1]) * w; R[o + 2] += (z - R[o + 2]) * w; }; // blend toward a key pose
const flush = (P, n) => { for (let b = 0; b < n; b++) { const o = b * 9; P.rot(b, R[o], R[o + 1], R[o + 2]); P.move(b, R[o + 3], R[o + 4], R[o + 5]); P.scale(b, R[o + 6], R[o + 7], R[o + 8]); } };
```

* **Key-pose tables** below give **absolute** local rotations for `put()` (rest = 0 unless stated). `w` is the layer weight.

### 4.2 Rest pose (all heroes)

| Bone | Rest rotation |
|---|---|
| armL / armR | (0, 0, +0.12) / (0, 0, −0.12) |
| foreL / foreR | (−0.18, 0, 0) |
| shinL / shinR | (+0.06, 0, 0) |
| spine | (+0.04, 0, 0) |
| head | (−0.04, 0, 0) |

Per class:

| Class | Rest additions |
|---|---|
| Pyromancer | thighL rz +0.10, thighR rz −0.10 (wide stance); spine +0.10 (hunch); head −0.10; armR rz −0.20 (heavy fist hangs out) |
| Cryomancer | staff kept vertical: `focus.rx = −(armR.rx + foreR.rx)`, `focus.rz = −armR.rz`; armL (−0.3, 0, 0.15), foreL (−1.2, 0, 0) (forearm across the waist) |
| Stormcaller | spine +0.12 (always leaning in); rod angled forward: focus.rx −0.35 |
| Arcanist | spine −0.02 (upright); wand: focus.rx −0.5; tome floats (see idle) |

### 4.3 Idle

| | Breath (chest.scale.y) | Sway / weight shift | Head | Cloth | Fidget (every 7–10 s after 3 s idle; `hero.fidget` 0→1) |
|---|---|---|---|---|---|
| All | `1 + a·sin(t·f)` | `hips.rz = 0.03·sin(t·0.8)`; `hips.mx = 0.015·sin(t·0.8)`; `shinL.rx += 0.05·max(0, sin(t·0.8))`, `shinR.rx += 0.05·max(0, −sin(t·0.8))` | glance `head.ry = 0.25·sin(t·0.37)·sin(t·0.93)` (replaced by the aim follow, see 4.5) | cloth bones `rx += 0.04·sin(t·2.1 + i·0.6)` | — |
| Pyromancer | a 0.025, f 1.6 (heavy) | ×1.0 | — | apron, coat, liripipe | **Knuckle crack**, 1.2 s: armR (−1.0, 0, −0.1), foreR (−1.2); armL (−0.9, 0, −0.3), foreL (−1.3) (palm cups the fist); `handR.ry = 0.3·sin(k·4π)` over k 0.4–0.8; one chimney puff of 4 dark particles at k 0.6 |
| Cryomancer | a 0.015, f 1.2 (still) | ×0.5 | — | cape1 0.03 | **Staff tap**, 1.0 s: focus moves up 0.08 m (k 0–0.4), drops at k 0.55; frost ring fx r 0.9 at the butt |
| Stormcaller | a 0.02, f 2.6 (restless) | ×1.3, plus heel bounce `hips.my = 0.012·max(0, sin(t·5))` | — | scarf, tails | **Rod twirl**: `focus.ry` 0→2π over 0.6 s with armR (−0.7, 0, −0.2). Every other fidget, a **hat tip**: armL (−2.3, 0, 0.3), foreL (−1.6), `hat.rx = +0.2·bump(k, 0.3, 0.8)` |
| Arcanist | a 0.015, f 1.8 | ×0.6 | — | coat back | **Page flip**: `tome.rz` flicks ±0.25 three times over 1.0 s; halo spins ×4. Always on: `tome.my = 0.03·sin(t·1.8)`, `tome.ry = 0.1·sin(t·0.7)`, `halo.rz = t·(0.25 + 1.0·meter)`, halo bob `my = 0.015·sin(t·1.8 + 1)` |

### 4.4 Walk / run (gait), with strafe and backpedal built in

Let `φ = s.walk`, `m = s.move`, `sp = min(1, s.speed / 6.5)`, `ψ = hero.psi`, `μ = hero.mu`, `fx = cos μ`, `fz = sin μ`, and `A = G.A · m · (0.55 + 0.45·sp)`.

```
hips.ry   += ψ                                   // lower body faces the movement (or its reverse)
thighL.rx += −A·sinφ·fx ;  thighL.rz += +0.7·A·sinφ·fz
thighR.rx += +A·sinφ·fx ;  thighR.rz += −0.7·A·sinφ·fz
shinL.rx  += G.K·m·max(0,  cosφ)^1.3 + 0.08·m    // knee flexes during that leg's swing (any direction)
shinR.rx  += G.K·m·max(0, −cosφ)^1.3 + 0.08·m
footL.rx  += −0.6·(thighL.rx + shinL.rx) ; footR likewise
hips.my   += G.bob·m·(|cosφ| − 0.6)              // highest as the legs pass
hips.rz   += 0.05·m·sinφ  − 0.10·m·sp·fz         // gait roll + lean into a strafe
hips.ry   += G.hy·m·sinφ·fx ;  chest.ry += −1.3·G.hy·m·sinφ·fx   // pelvis twist, shoulder counter
spine.rx  += G.lean·m·sp·(fx > 0 ? fx : 0.5·fx)  // forward lean; backpedal leans back at half
free arm(s): armL.rx += G.arm·A·sinφ·fx (opposite the same-side leg) ; armR.rx += −G.arm·A·sinφ·fx (×0.5 if it holds the focus)
```

| | G.A | G.K | G.bob | G.lean | G.arm | G.hy | Extras |
|---|---|---|---|---|---|---|---|
| Pyromancer | 0.80 | 1.10 | 0.060 | 0.20 | 0.65 | 0.12 | **Footfall stomp**: at each contact (`|sinφ|` crosses 0.95) root scale y 0.96 for 0.06 s (renderer `squashT`-style, write via `hero.stomp`); dust puff every 2nd step; apronF.rx = −0.6·max(thighL.rx, thighR.rx magnitudes)… see 4.9 |
| Cryomancer | 0.60 | 0.80 | 0.035 | 0.08 | 0.35 | 0.06 | skirtL.rx = 0.7·thighL.rx, skirtR.rx = 0.7·thighR.rx; skirtB.rx = 0.4·max(thighL.rx, thighR.rx, 0); staff stays vertical (counter-rotate as at rest); rime flashDisc at each footfall |
| Stormcaller | 0.95 | 1.35 | 0.070 | 0.26 | 0.90 | 0.14 | the left arm pumps fully; the rod arm at ×0.5; `hat.rx = −0.12·m·sp` (the brim lifts in the wind) |
| Arcanist | 0.62 | 0.90 | 0.035 | 0.10 | 0.40 | 0.08 | glide: the tome trails `tome.mz = −0.12·m·sp`; `halo.rx = 0.15·m·sp`; coatB lags |

**No foot sliding.** With `stride ≈ 4·legLen·sin(G.A)` the values above are consistent. The renderer advances `s.walk` by distance, so cadence follows speed automatically. Teleports over 2.5 m are ignored (the blink is safe).

### 4.5 Strafing / backpedal: upper/lower body split (controller side)

This is a twin-stick layered aim. The lower body follows locomotion, the upper body follows the aim, and the split sits at the spine. Hips can't turn 360°, so the legs switch to a backward frame instead of twisting past the limit ([doce.sh, twin-stick animations](https://doce.sh/blog/twin-stick-animations); [layered aim, Unreal forum](https://answers.unrealengine.com/questions/856267/view.html)). We project the leg swing continuously instead of snapping to 8 clips.

```js
// in HeroAnim.update(dt), after Player.update:
const aimYaw  = Math.atan2(p.facing.x, p.facing.z);
const spd     = Math.hypot(p.vel.x, p.vel.z), moving = spd > 1;
const moveYaw = moving ? Math.atan2(p.vel.x, p.vel.z) : aimYaw;
const casting = H.hold > 0.05 || game.time - this.lastCast < 0.5 || h.action === 'heavy' || h.action === 'throw' || h.action === 'nova' || h.action === 'channel';
h.yaw = dashing ? dashYaw : (casting || !moving) ? aimYaw : moveYaw;   // renderer smooths with turnRate 14 (dash: 40)
const root = h._yaw;
H.aimRel  = wrap(aimYaw - root);
const d   = moving ? wrap(moveYaw - root) : 0;  H.moveRel = d;
if (!H.back && Math.abs(d) > 1.92) H.back = true;          // > 110° → backpedal frame
else if (H.back && Math.abs(d) < 1.57) H.back = false;     // < 90°  → forward frame
const tgt = moving ? clamp(H.back ? wrap(d - Math.PI) : d, -0.7, 0.7) : 0;
H.psi += (tgt - H.psi) * (1 - Math.exp(-10 * dt));
H.mu   = d - H.psi;
```

In `animate`:
* `spine.ry += −0.45·ψ` and `chest.ry += −0.55·ψ`, so the chest is back on the root, which is the aim.
* **Twist limit.** The hips-to-chest twist is |ψ| ≤ 0.7 (40°) plus the gait counter-swing of up to 0.18, so it never exceeds 1.05 (60°).
* **Not casting, so the root follows the movement.** The hero glances at the mouse: `head.ry += 0.6·clamp(aimRel, ±0.9)` and `chest.ry += 0.4·clamp(aimRel, ±0.5)`. That shows where the next shot goes.
* **Casting while the root is still turning.** `chest.ry += clamp(aimRel, ±0.6)` until the root catches up (turnRate 14, ≈ 0.15 s).

| Movement vs aim | What you see |
|---|---|
| 0° (run at the cursor) | ψ 0, full forward run, lean 0.12–0.26 |
| 45° | hips turned 40° toward the movement, legs run nearly straight, chest on the aim |
| 90° (strafe) | hips 40°, legs swing diagonally (fx 0.77, fz 0.64), side-lean into the movement |
| 135° | backward frame: hips −40° from the aim's reverse, legs swing backward-diagonal |
| 180° (backpedal) | ψ 0, legs step backwards (fx −1), lean back by half, shorter step (A is the same, but the lean reads as "careful") |

**Cloth reacts to the true movement.** For cloth that streams, use the velocity in the chest frame: `vb = sp·max(0, cos δ)` (wind from the front) and `vs = sp·sin δ`:
* `cape1.rx = 0.12 + 1.0·vb` (back-swing; never below −0.05, so it never clips into the legs)
* `cape1.rz = 0.45·vs` (streams to the side opposite the movement; for left-side cloth the sign flips)
* children: ×0.6 of the parent, plus a flutter `0.08·sin(2φ − 0.6·i)`
* backpedal (cos δ < 0): `rx = 0.05`, flutter ×1.5 (the cloth presses against the back)

### 4.6 Starter rapid-cast (LMB held, 2.2–4.5 casts/s)

**Principle: a held stance plus a tiny recoil, never a replayed gesture.** The controller sets:
* `hold` → 1 in 0.06 s while slot 0 has fired within its cooldown + 0.1 s; → 0 in 0.3 s after release. The stance therefore never drops between shots (all starter cooldowns ≤ 0.5 s).
* On every starter cast: `shot = min(1, Δt / 0.28)`, where Δt is the time since the previous shot (attenuation for very fast fire), then `shotN++`.
* `shot` decays as `exp(−dt / 0.07)`, so 95% is gone in 0.2 s. Each recoil is a 70 ms spring-back, not a swing.

**Anti-spastic rules:**
1. The spine moves ≤ 0.15 rad per shot. Hips move ≤ 0.03 m. The head never recoils.
2. Hands alternate (`shotN & 1`) when the class has two casting hands. Each arm then fires at half the rate (≤ 2.3 Hz).
3. Recoil amplitude ≤ 0.5 rad on the forearm and focus, and ≤ 0.3 on the upper arm.
4. The legs layer is untouched, so running stays smooth under fire.
5. The focus scale pulses `1 + 0.25·shot` and the glow adds `+0.9·shot`. The **glow** carries the cadence, not the body.

**Stance key poses** (`put(…, hold)`; the arm pose is relative to the chest, which faces the aim):

| | armR | foreR | focus / handR | armL | foreL | chest / spine | Recoil per shot (added × `shot`) |
|---|---|---|---|---|---|---|---|
| Pyromancer *(jab-jab)* | (−1.25, 0.15, −0.25) | (−0.55, 0, 0) | handR (−0.3, 0, 0) palm to the target | (−0.70, 0, 0.30) guard | (−1.20, 0, 0) | chest.ry +0.20, spine.rx +0.12 | **odd** (gauntlet): foreR.rx +0.5, armR.rx −0.15, chest.ry +0.15, hips.mz −0.025 · **even** (left flick): foreL.rx +0.9, armL.rx −0.4, handL.rx −0.5, chest.ry −0.15. The muzzle flash appears at the active hand. |
| Cryomancer *(lance)* | (−1.00, 0, −0.15) | (−0.30, 0, 0) | focus.rx −1.0 (staff tilts 60° forward, crystal leads) | (−1.20, 0, 0.25) open palm | (−0.20, 0, 0) | chest.ry +0.15 | armR.rx −0.2, foreR.rx +0.3, focus.mz +0.06 (thrust), crystal scale 1 + 0.2·shot. One hand only, but the cooldown is 0.38–0.5 s. |
| Stormcaller *(fencer)* | (−1.45, −0.10, −0.10) | (−0.10, 0, 0) | focus.rx −1.2 (rod points along the aim, tines ahead) | (+0.40, 0, 0.35) back for balance | (−0.60, 0, 0) | chest.ry +0.30 (side-on fencing stance), spine.rx +0.10 | focus.rx −0.35 (snap), `handR.ry = ±0.2` alternating by shotN (forks left/right), chest.ry +0.10 |
| Arcanist *(scribe)* | (−1.35, 0, −0.10) | (−0.20, 0, 0) | focus.rx −1.0 (wand forward) | (−0.90, 0, 0.35) | (−0.90, 0, 0) | chest.ry +0.10 | **2 of 3** shots: focus.rx −0.4 (wand flick). **Every 3rd** shot: the tome fires (tome scale 1.15, `tome.rz ±0.15`, glyph orbit speed ×2 for 0.3 s). Stance: `tome` moves (−0.12, +0.15, +0.10) to the chest front-left. |

### 4.7 Active casts: throw / heavy / nova / channel

**Mapping** (a lookup table in `HeroAnim`; no skill files change):

| Pose | Skills |
|---|---|
| `shot` | the starter and its LMB fusions (Cinder Bolt, Ice Shard, Spark, Arcane Bolt, Starfall, Hailstorm, Tempest, Arcane Barrage) |
| `throw` | Fireball, Chain Lightning, Plasma Orb, Frostfire Comet |
| `heavy` | Meteor, Blizzard, Singularity, Cataclysm, Absolute Zero |
| `nova` | Frost Nova |
| none | auto skills (Spirit Orbs, Static Field, Storm Halo, Thunderhead): accent pulse `glow +0.3` for 0.15 s only |

The cast is instantaneous in code, so the anticipation must be **fast**: the raise lasts ≤ 0.1 s and reads as the cause. While moving, an upper-body action uses w = 1 on the arms and chest, and ×0.6 on the spine. The legs keep running and the knee-bend and hips keys below are skipped. Standing, the full body plays. A dash cancels any action.

**`heavy` — 0.55 s** (K1 at k 0.18 = raise, K2 at k 0.36 = impact, hold to k 0.6, recover to 1 with `smooth`):

| | K1 raise | K2 impact |
|---|---|---|
| Pyromancer — **Forge Slam** | armR (−2.8, 0, −0.2), foreR (−0.4); armL (−2.6, 0, 0.2), foreL (−0.6) (both fists overhead); spine −0.30; head −0.30; hips.my +0.06 | armR (−0.9, 0, −0.1), foreR (−0.1); armL (−0.8, 0, 0.1); spine +0.55; hips.my −0.16; thighL −0.7 / shinL +1.1, thighR +0.35 / shinR +0.9 (lunge-kneel, gauntlet into the ground); head +0.2; focus scale 1.4 |
| Cryomancer — **Stillwater Plant** | armR (−2.6, 0, −0.15), foreR (−0.3); armL (−2.2, 0, 0.4); staff vertical overhead (counter-rotate); spine −0.20; hips.my +0.04; crystal scale 1.2 | armR (−0.7, 0, −0.1), foreR (−0.5); staff vertical, focus.my −0.15 (butt strikes the ground); spine +0.35; hips.my −0.10; thighL rz +0.25 / thighR rz −0.25, shins +0.5 (wide stance); crystal scale 1.4 |
| Stormcaller — **Skycall** | armR (−3.0, 0, −0.1), foreR 0, focus.rx 0 (rod straight up); armL (+0.3, 0, 1.0) flung out; spine −0.25; head −0.50 (looks up); thighL −0.9 / shinL +1.4 (knee up); hips.my +0.05 | armR (−1.4, 0, −0.1), focus.rx −1.2 (rod points at the target); spine +0.35; hips.my −0.12; thighL 0 / shinL +0.6, thighR +0.3 / shinR +0.5; `hat.my +0.04` (the hat pops) |
| Arcanist — **Conductor** | armL (−2.7, 0, 0.3), foreL (−0.3), tome moves (−0.4, +0.95, −0.1) (held overhead); armR (−2.4, 0, −0.4); spine −0.25; hips.my +0.08 (rises); halo scale 1.25 | armL (−0.6, 0, 1.3), armR (−0.6, 0, −1.3), fores −0.3 (arms sweep out and down: "pull"); spine +0.25; hips.my −0.06; halo scale 1.4; `halo.rz` +3 rad over 0.3 s; tome covers snap shut (tome scale x 0.4) |

**`throw` — 0.4 s** (K1 at k 0.2 = wind, K2 at k 0.35 = release):
* **K1:** chest.ry −0.5 (the right shoulder goes back); armR (+0.4, 0, −0.6); foreR (−1.2); armL (−0.6, 0, 0.3).
* **K2:** chest.ry +0.45; armR (−1.6, 0, −0.1); foreR (−0.05); armL (−1.2, 0, 0.2); spine +0.2; standing only: thighL −0.4, thighR +0.3 (a step).

Class variants:

| Class | Variant |
|---|---|
| Pyromancer | overhand hook with the gauntlet: K1 armR (−2.4, 0, −0.4), foreR (−1.6) |
| Cryomancer | staff thrust: focus.rx −1.4 at K2 |
| Stormcaller | rod whip: focus.rx +0.6 at K1, −1.4 at K2 |
| Arcanist | two-palm push: both arms (−1.5, 0, ±0.15) at K2, tome to the front |

**`nova` — 0.45 s** (K1 at k 0.25 = gather, K2 at k 0.4 = burst):
* **K1:** hips.my −0.18; spine +0.5; arms crossed (armL (−1.0, 0, −0.5), armR (−1.0, 0, 0.5), fores −1.4).
* **K2:** spine −0.25; head −0.3; arms flung out (armL (−0.4, 0, 1.6), armR (−0.4, 0, −1.6)); hips.my +0.06; cloth flares (cape1.rx −0.4, skirts ±0.3 outward); all heroes.

**`channel` — loop.** Used for shrine claiming (2.5 s), the Rift Shift (2.5 s), the boss intro hold, and optionally while Singularity or Blizzard is active:
* armR (−1.1, 0, −0.2), foreR (−1.2); armL (−1.0, 0, 0.35), foreL (−1.3) (hands around the focus at chest height)
* spine −0.08, head −0.15, `hips.my = 0.02·sin(t·3)`
* focus jitter `rx 0.03·sin(t·23)`
* cloth lifted: cape and scarf rx −0.2, flutter ×2
* glow `1.0 + 0.3·sin(t·8)`
* Arcanist floats: hips.my +0.15
* Stormcaller: hat.my +0.03·sin(t·9) (static)
* Rift Shift only: accent override is prism-white `#efe9ff`, mix 0.6.

### 4.8 Dash poses

**Common timing:**
* `action = 'dash'` with k = elapsed / (dash dur + exit). The pose weight rises in 0.03 s.
* The root yaw snaps to the dash direction (turnRate 40) and returns to the aim afterwards.
* Gait is frozen: the leg layer weight is 0 while the dash weight is > 0.5.
* Root stretch is written as scale on `root`.

| Dash | Duration (+exit) | Key pose (w = 1) | Exit |
|---|---|---|---|
| **Phase Step** (Arcanist, blink 0.06 s) | departure 0.06 + `arrive` 0.32 | **Departure** (barely seen): root scale (0.6, 1.3, 0.6), `h.tint` arcane-hi. **Arrive** at k 0: crouch, hips.my −0.16, spine +0.45, head +0.2; armL (+0.6, 0, 0.5), armR (+0.6, 0, −0.5) (swept back); thighs −0.5, shins +1.0; halo scale 0.6; tome scale 0.8; root scale (1.15, 0.8, 1.15). **Arrive** at k 0.3: **unfold**, spine −0.2; arms (−0.5, 0, ±1.4) (flung open, synced with the arrival burst); hips.my +0.04; halo scale 1.35; glow +1.5; root scale (0.95, 1.08, 0.95) | k 0.3 → 1: smooth back to neutral |
| **Flame Dash** (Pyromancer, 0.16 s) | 0.16 + 0.14 | **Shoulder-charge:** spine +0.6; chest.ry +0.35 (the gauntlet shoulder leads); armR (−1.6, 0, −0.1), foreR −0.1 (fist punches ahead); armL (+0.9, 0, 0.4) trailing; thighL −0.9 / shinL +0.6, thighR +0.8 / shinR +0.9; hips.my −0.08; root scale (0.95, 0.95, 1.2); apronF.rx +0.8, coatB.rx +1.0, hood.rx +0.6, chimney.rx +0.3 (everything streams back); focus scale 1.5 | **Skid:** spine −0.2 (brake), thighL −0.5 / shinL +0.2 (front foot planted), thighR +0.3, armR (−0.8, 0, −0.2); 3-particle dust burst at the feet |
| **Glacial Slide** (Cryomancer, 0.2 s) | 0.2 + 0.15 | **Ice-surf:** hips.ry +1.1 (lower body side-on); chest.ry −0.4; thighL (−0.3, 0, +0.4), thighR (+0.3, 0, −0.4); shins +0.7; hips.my −0.2; spine +0.25; armL (−1.2, 0, 0.6) forward for balance; armR (−0.2, 0, −0.9) with focus.rx +0.9 (the crystal trails, dragging low); cape1 +0.9, cape2 +0.3; skirtL +0.4, skirtR −0.3 | Rise over 0.15 s; staff-butt tap with a frost ring r 0.9 |
| **Lightning Dash** (Stormcaller, 0.12 s, 2 charges) | 0.12 + 0.10 | **Bolt-run:** spine +0.75; head −0.55 (eyes stay forward); armL (+1.2, 0, 0.25), armR (+1.1, 0, −0.25), fores +0.2 (swept back); focus.rx +1.0 (rod trails horizontal); thighL −1.1 / shinL +1.4, thighR +0.9 / shinR +0.6; hips.my +0.06; root scale (0.85, 0.92, 1.45); hat.rx +0.35; scarf1 +1.5, scarf2/3 +0.1; tails +1.3. **2nd charge within 0.5 s:** mirror the legs and roll root rz ±0.25 alternating (`hero.dashN & 1`) | Hop landing: hips.my −0.06, shins +0.4 |

**PERFECT dodge.** For 0.35 s the accent override is `#9dffb0`, mix 0.6, and the clasp gem flashes prism-white. Add no extra pose; the slow-mo shows the dash pose.

### 4.9 Secondary motion bones

| Bone | Formula (additive) |
|---|---|
| Pyromancer apronF | `rx = −0.7·min(thighL.rx, thighR.rx, 0)` (pushed by the leg moving forward) `+ 0.05·sin(2φ)·m` |
| Pyromancer coatB | `rx = 0.15 + 0.6·vb + 0.06·sin(2φ − 0.5)·m` |
| Pyromancer hood (liripipe) | `rx = 0.3·vb + 0.08·sin(t·2.3)`, `rz = −0.3·vs` |
| Pyromancer beard | `rx = −0.4·hips.my_vel` (lag); hit: `rx +0.3·hit` |
| Pyromancer pack / chimney | `pack.my = 0.5·hips bob` (delayed 0.1 cycle); `chimney.rx = 0.12·sin(φ·2 − 0.8)·m + 0.15·vb` |
| Cryomancer skirts | see 4.4 |
| Cryomancer cape1 / cape2 | 4.5 cloth rule; cape2 = 0.6 × cape1 + flutter |
| Cryomancer crystal | `ry = t·0.6` (slow spin); scale `1 + 0.04·sin(t·1.4)` |
| Stormcaller tails L / R (+2) | `tailX.rx = 0.1 + 1.2·vb + 0.1·sin(2φ + (L ? 0 : π))·m`; `rz = ∓0.35·vs`; tail2 = 0.5 × tail + 0.1·sin(2φ − 1) |
| Stormcaller scarf1 / 2 / 3 | `scarf1.rx = 0.1 + 1.25·vb + 0.12·sin(t·9)·vb`; scarf2 = 0.25·sin(t·11 − 0.7)·vb + 0.1; scarf3 = 0.3·sin(t·11 − 1.4)·vb (a travelling wave when running) |
| Stormcaller hat | `rx = −0.12·m·sp + 0.03·sin(t·1.7)` |
| Arcanist tabard | `rx = −0.8·min(thighL.rx, thighR.rx, 0)` |
| Arcanist coatB1 / B2 | cloth rule ×0.7; B2 = 0.6 × B1 + flutter |
| Arcanist halo | `rz = t·(0.25 + meter)`; `rx = 0.15·m·sp` |
| Arcanist glyph1–3 | `ry = t·1.2·(1 + 2·meter) + n·2.094`; `my = 0.05·sin(t·2 + n·2.1)` |
| Cryomancer armor1–3 | `ry = t·1.6 + n·2.094`; `scale = armor ≥ n ? 1 : 0` (0.15 s pop with overshoot to 1.25) |

### 4.10 Hit react, death, victory

* **Hit.** `s.hit` goes 1 → 0 over 0.17 s; the renderer adds the white flash and the squash.
  * spine −0.30·hit, head −0.25·hit, hips.mz −0.08·hit
  * armL rz +0.3·hit, armR rz −0.3·hit (flinch)
  * cloth +0.2·hit
  * The hit does **not** break the cast stance (gameplay continues).
  * Replace the old **i-frame invisibility blink** (`body.visible` toggling) with a 10 Hz `h.tint` pulse in the element-hi colour. The hero never disappears.
* **Death** (`action = 'death'`, 1.4 s; `deathTime: 1.4`). Each hero has its own fall; all of them end in a **Rift recall**:

  | k | Beat | All heroes | Pyromancer | Cryomancer | Stormcaller | Arcanist |
  |---|---|---|---|---|---|---|
  | 0–0.15 | stagger back | spine −0.4, head −0.4, hips.mz −0.1, arms flung (rz ±0.8) | — | — | — | — |
  | 0.15–0.5 | collapse | — | drops to one knee, the gauntlet fist planted on the ground (armR (−0.6, 0, −0.1), spine +0.6) | leans on the staff, then kneels | spins half a turn (`root.ry +π` over 0.35) and falls back; the **hat flies off** (`hat.my +0.5`, `hat.rx −1.5`) | rises 0.2 m, arms go limp; the tome falls to the ground (`tome.my −0.9`, `rz 1.2`) |
  | 0.5–0.75 | hold | slump: head +0.4, glow → 0 | — | — | — | — |
  | 0.75–1 | **Rift recall** ("unable to truly die", DESIGN §2) | root scale (1.15 → 0.2, 1 → 0.05, 1.15 → 0.2); `h.tint` rift-white `#efe9ff` ramps up; one prism-shard fx burst (12 particles, the 4 Prime colours) at k 0.8 | — | — | — | — |

  The existing class-colour death burst can stay.
* **Victory** (`action = 'victory'`, 1.6 s, then loops a calm variant):

  | Class | Victory |
  |---|---|
  | Pyromancer | the gauntlet fist goes straight up (armR (−3.0, 0, −0.1)), a flame burst from the knuckles, the chimney puffs a 6-particle ring, then crossed arms |
  | Cryomancer | plants the staff and bows the head (head +0.4, spine +0.15); 3 frost armor shards orbit at full speed regardless of the armor count |
  | Stormcaller | the rod goes up to the sky, a fx.lightning strike lands on the tines at k 0.3, and the hat is tipped |
  | Arcanist | floats 0.25 m with arms open (±1.3); the halo expands ×1.3 and spins; the tome opens wide (covers rz ±0.6) |

  The Sanctum class-select preview plays the victory loop.

---

## 5. Element identity on the body (at rest)

Rules:
* **≤ 6 particles/s per hero at rest**, size 0.12–0.35 m, `occ ≥ 0.3` so they read on bright ground (research 04 §3.4).
* No additive halos over 0.3 m.
* All slow motion stays under 1 Hz; only sparks and flames flicker.
* Each effect is **tied to the class meter** (`hero.meter`), so the body shows trait state without HUD reading.
* Emitter points come from `h.matrix × h.bones[bone] × localPoint` (the renderer already copies both when `h.bones` and `h.matrix` are set).

| Hero | Rest effect (exact) | Meter link |
|---|---|---|
| **Pyromancer** | **Chimney embers:** every 0.2 s `fx.burst(chimneyTop (0, 2.0, −0.36), { color: 0xff7a33, count: 1, speed: 0.4, life: 0.9, size: 0.16, up: 1.6, gravity: −1.2, occ: 0.3 })`. **Smoke puff** every 0.7 s `{ color: 0x2a201c, count: 1, size: 0.35, life: 1.2, up: 0.8, occ: 0.85 }`. **Gauntlet:** focus bone scale `1 + 0.06·sin(t·8.2)` (coal breathing); knuckle flames scale y `0.8 + 0.45·noise(t·9)`. | meter = burning foes within 6 u / 5. Ember interval `0.2 / (1 + 1.5·meter)` (the forge breathes harder the more is burning, i.e. Wildfire is primed); the clasp pulses at `2 + 4·meter` Hz. |
| **Cryomancer** | **Hem frost:** every 0.25 s while idle, one mote at a random point on the hem ring (r 0.42, y 0.15): `{ color: 0xe2f8ff, count: 1, speed: 0.2, life: 0.8, size: 0.18, up: 0.1, gravity: 0.5, occ: 0.5 }`. **Rime footprints:** each footfall `fx.flashDisc(foot, { color: 0x7fe0ff, radius: 0.35, life: 0.5 })`. **Breath:** every 2.8 s one white puff (size 0.25, life 0.6) 0.25 m in front of the mouth. The crystal turns slowly. | **Frost Armor 0–3 is shown as 3 orbiting hexagonal shards** (bones armor1–3, radius 0.62 at y 1.3). They pop in when gained and shatter (fx burst frost, 8) when spent. This replaces reading the HUD pips. |
| **Stormcaller** | **Tine arc:** `fx.lightning(tipL, tipR, { color: 0xffe45c, strands: 1, jag: 0.25, life: 0.07 })` every `lerp(1.2, 0.15, meter)` s (± 30% jitter). At meter ≥ 0.8, also a 2-particle spark burst from the hat pin and the tail tips every 0.4 s. | meter = Momentum / 100. Standing still (Momentum draining) the rod goes quiet, which is literally the trait. |
| **Arcanist** | **3 glyph-stars** orbit the waist (r 0.52, y 1.0, 1.2 rad/s, bob ±0.05). The **halo** turns at 0.25 rad/s, and its 3 gap stars glow. The tome sigil hovers over the open pages. No particles at rest. | meter = min(1, Chain / 25). Orbit speed ×(1 + 2·meter), halo spin `0.25 + meter` rad/s, and at Chain ≥ 10 the halo gap stars get +0.6 glow (Resonance visible on the body). |

**Last-cast element (DESIGN §11, "the orb glows with the last-cast element").** After casting an off-element skill, set `h.accent = [elementLinearRGB, 0.7]` for 0.6 s, then fade the mix to 0 over 0.3 s. The whole accent channel (focus, eyes, clasp) briefly takes the cast element: an Arcanist weaving fire then frost visibly flickers through both. The ward-recolour path does this for free.

---

## 6. Integration notes (orchestrator)

1. **New `src/game/creatures/heroes.js`.** It holds the four `defineCreature` defs (Appendices A–D) plus the shared helpers, and exports `HEROES = { pyromancer, cryomancer, stormcaller, arcanist }`.
2. **New `src/game/heroAnim.js` (the controller, §4.1/§4.5).**
   * It creates `heroRenderer = new CreatureRenderer(scene, camera)` with `outlinePx = 2.0`, then `h = heroRenderer.add(HEROES[classId], { turnRate: 14, seed: 0.5 })`.
   * Set `h.bones = new Float32Array(boneCount·16)` and `h.matrix = new THREE.Matrix4()` for muzzles and emitters.
   * Set `h.rim`.
   * Keep the batch hull and color mesh at `renderOrder = 21`.
3. **`player.js`.**
   * Replace `buildPlayerModel` / `body` / `orb` usage with `HeroAnim`. `update(dt, player, castInfo)` takes over the facing, bob, castPulse, orb colour and the blink.
   * `cast` events → `heroAnim.onCast(def, slot)`.
   * `dash` → `onDash(kind, dir)`.
   * `takeDamage` → `h.flash()`.
   * `playerDied` → `action 'death'`.
   * Victory → `action 'victory'`.
   * The ground ring stays in `models.js` (`groundRing`) and gains the aim notch.
   * Keep `buildPlayerModel` as a fallback behind `?oldhero` for one release.
4. **Muzzle.** Purely visual: cast-flash fx at the muzzle world point. Projectile origins stay at `player.pos` (gameplay unchanged).
5. **Viewer.** `dev/creatures.html?set=heroes&bg=forest|barrens|river&poses=idle,walk:0,walk:1.57,walk:3.14,shot:0.2,heavy:0.18,heavy:0.36,dash:0.5,arrive:0,arrive:0.3,death:0.4,victory:0.3`.
   * Add viewer params `aim=<rad>` and `move=<rad>` that fill `h.hero.aimRel/psi/mu` to check strafes, plus `hold=1` for the cast stance.
6. **Creature bible §2.7** must be updated. The player is no longer "a vertical cone with a sphere orb". The player tells are now:
   * the **ring and aim notch**
   * the **tallest humanoid**
   * the **only always-blooming accent**
   * **Prime-coloured accents**
   * the **arm-pointed-at-the-cursor stance**

   Enemies still must not use ground rings or the Prime colours as emissive (wards excepted).

---

## 7. Approval checklist (run for every hero)

1. **Find-the-hero test.** Take a 1080p gameplay screenshot at zoom 1 in each of the 3 biomes, with 300 enemies of that act and your own spells firing. Can a fresh viewer point at the hero in under 0.3 s? Repeat with the ring hidden: it must still be found in under 1 s (by silhouette, value and the blooming focus).
2. **Hero silhouette test.** Render the 4 heroes as flat black at 68 px. Each must be nameable from the shape alone (fist + chimney / triangle + crystal / hat disc + tails / halo + book). Then flat black among the act's creatures: the hero must not match any archetype shape code (creature bible §2.4).
3. **Greyscale test.** Bulk *or* top plane differs from the ground by ≥ 19 L\* in every biome (table §2). Re-check the Pyromancer in Act II and the Stormcaller's scarf in Act II.
4. **Facing / aim test.** Record the 8 move directions × aim fixed:
   * The legs go where the hero moves.
   * The chest and focus point at the cursor.
   * The twist is never over 60°.
   * There is no pop at the 90°/110° hysteresis.
   * Foot slide is ≤ 5 cm per step.
   * Cloth never clips through the legs while backpedalling.
5. **Rapid-cast test.** Hold LMB for 5 s while circling at full speed (record at 60 fps and review at 25% speed).
   * The torso moves ≤ 0.15 rad per shot.
   * The stance never drops between shots.
   * The hands alternate (Pyromancer, Arcanist tome).
   * The cadence reads from the glow.
   * At 100% speed nothing jitters.
6. **Action test.** Each dash pose, the heavy (raise → slam), throw and nova are identifiable **with the glow disabled**, and the glow is visible with the pose frozen. Phase Step's arrival unfold lands on the same frame as the arrival burst.
7. **Element-at-rest test.** With the ring and HUD hidden, the class element is named from the idle within 2 s. The meter link visibly changes the effect: Momentum 0 vs 100, Chain 0 vs 25, armor 0 vs 3, burning 0 vs 5.
8. **Material language test.** The hero has rift-iron, crown-bronze, one Prime colour and the Crownshard clasp. There are no reserved colours: lime, spirit teal, prism-white emissive, elite gold `#ffc93a`, magenta, telegraph red. No neutral grey iron is used.
9. **Budget.** Tris ≤ 2,500, bones ≤ 32, emissive area ≤ 5%, no allocations in `animate()`, no part thinner than 0.05 m (the outline swallows it), and all identity features ≥ 0.2 m.
10. **Hit / death / victory.** The i-frame pulse never hides the hero. The death reads as fall → Rift recall. The victory loops cleanly in the Sanctum.

---

## 8. Sources

- Riot Games, *Clarity in League* (silhouette first, primary feature = power source, facing, VFX hierarchy): https://www.leagueoflegends.com/en-gb/news/dev/clarity-in-league/ · *Ask Riot: Let's Talk Clarity*: https://www.leagueoflegends.com/en-gb/news/dev/ask-riot-let-s-talk-clarity/
- Diablo IV June 2021 quarterly update (character art balanced against the game camera, bigger shapes, reduce readability-hurting elements): https://gamebanshee.com/ar4pw · https://gamespot.com/articles/diablo-4s-art-direction-emphasizes-hand-crafted-details-plenty-of-customization-and-just-enough-realism/1100-6493411/
- Hades art direction (secondary commentary; pose/timing/silhouette, brightness control): https://mcvuk.com/?p=216051
- Torchlight (crisp characters on a painterly ground): https://www.engadget.com/2009-09-10-an-insight-into-the-art-of-torchlight.html · Runic, chunking detail for readability: https://www.runicgames.com/blog/2012/05/03/armor-set-contest-winners-update/
- Warcraft III unit and model philosophy: https://www.wowhead.com/news/back-in-the-good-old-days-54185
- KayKit Adventurers (chunky low-poly hero proportions): https://kaylousberg.itch.io/kaykit-adventurers
- Twin-stick directional locomotion (move vs aim, hip limits, 8-direction choice): https://doce.sh/blog/twin-stick-animations · layered upper-body aim over a locomotion blend: https://answers.unrealengine.com/questions/856267/view.html
- David Rosen, *An Indie Approach to Procedural Animation* (GDC 2014; few key poses + procedural blending): https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation
- Internal: `design/research/03-creature-art.md` (rig, palettes, shape codes, checklist), `design/research/04-vfx-readability.md` (ring, blend-add, occ), `design/UI.md` (Crownforge tokens, element shapes), `src/game/env/biomes/*.js` (ground colours used for L\*).

---

# Appendix A — Pyromancer (Cinderwright)

**Silhouette (68 px):** a squat dark block with a **huge bronze fist on the right** and a **chimney spike behind the head** (a vertical tick visible over the head from the 41° camera). There is an ember-orange hood, a white beard in front and bronze pauldrons. Facing reads from the beard, the fist and the goggles, which all point +Z.

**Palette:**

| Token | Hex | L\* | Use |
|---|---|---|---|
| SOOT | `#3b2a24` | 19 | coat, sleeves |
| APRON | `#6a4428` | 33 | apron, bib, straps |
| CHAR | `#241814` | 9 | scorched hems |
| HOOD / HOOD_D | `#c8561e` / `#9e4218` | 51 / 40 | forge hood / cowl |
| SKIN_PY / SKIN_PY_D | `#c68a62` / `#a8704c` | 63 / 52 | face, left arm |
| ASH / ASH_D | `#d8d0c4` / `#b8b0a4` | 84 / 73 | beard, brows |
| LINEN | `#d8c8a8` | 81 | arm wraps |
| TROUSER | `#3e3230` | 22 | |
| BOOT / BOOT_L | `#2e2220` / `#4a3428` | 15 / 24 | |
| WOOD | `#6b4426` | 33 | hammer handle |
| shared | — | — | RIFT_IRON, BRONZE*, LEATHER_D, FIRE, FIRE_HI |

**Bones (25):**
```js
bones: [
  { name: 'root' },
  { name: 'hips',   pivot: [0, 0.78, 0] },
  { name: 'spine',  parent: 'hips',   pivot: [0, 0.90, 0] },
  { name: 'chest',  parent: 'spine',  pivot: [0, 1.10, 0] },
  { name: 'head',   parent: 'chest',  pivot: [0, 1.44, 0.06] },
  { name: 'hood',   parent: 'head',   pivot: [0, 1.84, -0.08] },   // liripipe tail
  { name: 'beard',  parent: 'head',   pivot: [0, 1.52, 0.20] },
  { name: 'armL',   parent: 'chest',  pivot: [0.31, 1.36, 0] },
  { name: 'foreL',  parent: 'armL',   pivot: [0.34, 1.06, 0.02] },
  { name: 'handL',  parent: 'foreL',  pivot: [0.35, 0.82, 0.03] },
  { name: 'armR',   parent: 'chest',  pivot: [-0.31, 1.36, 0] },
  { name: 'foreR',  parent: 'armR',   pivot: [-0.34, 1.06, 0.02] },   // the brazier bracer
  { name: 'handR',  parent: 'foreR',  pivot: [-0.35, 0.80, 0.04] },   // the iron fist
  { name: 'focus',  parent: 'handR',  pivot: [-0.355, 0.70, 0.12] },  // palm core + knuckle flames (breathing scale)
  { name: 'thighL', parent: 'hips',   pivot: [0.13, 0.76, 0] },
  { name: 'shinL',  parent: 'thighL', pivot: [0.135, 0.42, 0.01] },
  { name: 'footL',  parent: 'shinL',  pivot: [0.14, 0.10, 0.02] },
  { name: 'thighR', parent: 'hips',   pivot: [-0.13, 0.76, 0] },
  { name: 'shinR',  parent: 'thighR', pivot: [-0.135, 0.42, 0.01] },
  { name: 'footR',  parent: 'shinR',  pivot: [-0.14, 0.10, 0.02] },
  { name: 'apronF', parent: 'hips',   pivot: [0, 0.90, 0.19] },
  { name: 'coatB',  parent: 'hips',   pivot: [0, 0.90, -0.17] },
  { name: 'pack',   parent: 'chest',  pivot: [0, 1.30, -0.22] },
  { name: 'chimney',parent: 'pack',   pivot: [0, 1.46, -0.36] },
  { name: 'shard',  parent: 'spine',  pivot: [0, 0.92, 0.29] },       // the clasp is his belt boss
],
stride: 1.95, blob: 0.62, deathTime: 1.4, muzzle: [-0.355, 0.58, 0.12],
```

**Parts** (model space; `k` = mirror sign; `S` = 'L' | 'R'):
```js
// ---- torso
pb.box(0.56, 0.42, 0.38, { bone: 'chest', pos: [0, 1.24, 0], taper: [1.08, 1.0], bottom: [0.92, 0.95], color: SOOT });
pb.box(0.36, 0.34, 0.05, { bone: 'chest', pos: [0, 1.22, 0.19], color: APRON });                         // apron bib
pb.mirror((S, k) => pb.box(0.06, 0.24, 0.05, { bone: 'chest', pos: [0.13 * k, 1.43, 0.1], rot: [-0.6, 0, 0], color: APRON })); // bib straps
pb.mirror((S, k) => pb.box(0.06, 0.32, 0.05, { bone: 'chest', pos: [0.16 * k, 1.30, -0.2], color: LEATHER_D }));               // pack straps
pb.cyl(0.25, 0.36, 0.16, { bone: 'chest', pos: [0, 1.47, 0], radial: 8, color: HOOD_D });                 // hood cowl over the shoulders
pb.box(0.48, 0.20, 0.34, { bone: 'spine', pos: [0, 0.98, 0.01], color: SOOT });
pb.cyl(0.27, 0.27, 0.09, { bone: 'spine', pos: [0, 0.92, 0], radial: 8, color: LEATHER_D });              // belt
pb.box(0.10, 0.13, 0.10, { bone: 'spine', pos: [0.26, 0.86, 0.08], color: APRON });                      // pouch
crownClasp(pb, 'shard', [0, 0.92, 0.29], FIRE);                                                         // belt boss = Crownshard
// forge hammer at the left hip (small, a texture-level read)
pb.cyl(0.028, 0.028, 0.26, { bone: 'hips', pos: [0.27, 0.70, -0.04], radial: 5, color: WOOD });
pb.box(0.08, 0.07, 0.14, { bone: 'hips', pos: [0.27, 0.58, -0.04], color: RIFT_IRON });
// ---- apron / coat skirts
pb.box(0.40, 0.46, 0.05, { bone: 'apronF', pos: [0, 0.66, 0.2], bottom: [1.12, 1], color: APRON });
pb.box(0.45, 0.05, 0.06, { bone: 'apronF', pos: [0, 0.44, 0.2], color: CHAR });
pb.box(0.52, 0.52, 0.06, { bone: 'coatB',  pos: [0, 0.64, -0.18], bottom: [1.18, 1], color: SOOT });
pb.mirror((S, k) => pb.box(0.07, 0.42, 0.30, { bone: 'hips', pos: [0.27 * k, 0.70, -0.02], bottom: [1, 1.1], color: SOOT }));
// ---- head, hood, goggles
pb.box(0.34, 0.32, 0.32, { bone: 'head', pos: [0, 1.61, 0.09], taper: [0.9, 0.92], color: SKIN_PY });
pb.box(0.09, 0.10, 0.08, { bone: 'head', pos: [0, 1.60, 0.27], taper: [0.8, 0.8], color: SKIN_PY_D });     // big nose
pb.mirror((S, k) => {
  pb.box(0.055, 0.035, 0.02, { bone: 'head', pos: [0.075 * k, 1.645, 0.25], color: FIRE_HI, emis: 1.8 });  // eyes
  pb.box(0.12, 0.045, 0.05, { bone: 'head', pos: [0.075 * k, 1.685, 0.245], rot: [0, 0, -0.22 * k], color: ASH }); // brows
  pb.box(0.05, 0.26, 0.26, { bone: 'head', pos: [0.19 * k, 1.60, 0.04], color: HOOD });                   // hood side flaps
  pb.cyl(0.065, 0.065, 0.05, { bone: 'head', pos: [0.08 * k, 1.77, 0.21], rot: [1.2, 0, 0], radial: 6, color: BRONZE_HI }); // goggle rims
  pb.sphere(0.048, { bone: 'head', pos: [0.08 * k, 1.78, 0.235], seg: [5, 3], color: FIRE_HI, emis: 1.4 });  // lenses
});
pb.sphere(0.215, { bone: 'head', pos: [0, 1.70, 0.06], scale: [1.08, 0.85, 1.12], seg: [8, 3], thetaLength: Math.PI / 2, color: HOOD }); // hood cap
pb.box(0.38, 0.30, 0.10, { bone: 'head', pos: [0, 1.60, -0.10], taper: [0.9, 1], color: HOOD });          // hood back
pb.box(0.40, 0.06, 0.30, { bone: 'head', pos: [0, 1.75, 0.06], color: LEATHER_D });                       // goggle strap
pb.cone(0.11, 0.24, { bone: 'hood', pos: [0, 1.86, -0.16], rot: [-1.15, 0, 0], radial: 5, color: HOOD });  // liripipe
// ---- beard (front read: white)
pb.box(0.32, 0.30, 0.14, { bone: 'beard', pos: [0, 1.41, 0.22], bottom: [0.55, 0.75], color: ASH });
pb.box(0.28, 0.06, 0.07, { bone: 'beard', pos: [0, 1.545, 0.26], color: ASH });                          // moustache
pb.cyl(0.04, 0.05, 0.16, { bone: 'beard', pos: [0, 1.20, 0.24], radial: 5, color: ASH_D });               // braid
pb.cyl(0.06, 0.06, 0.05, { bone: 'beard', pos: [0, 1.25, 0.24], radial: 6, color: BRONZE_HI, trim: true });// bead
// ---- left arm (bare forearm)
limb(pb, 0.10, 0.09, [0.31, 1.36, 0], [0.34, 1.06, 0.02], { bone: 'armL', color: SOOT });
pb.cyl(0.11, 0.11, 0.07, { bone: 'armL', pos: [0.335, 1.10, 0.015], radial: 7, color: APRON });          // rolled cuff
pb.sphere(0.17, { bone: 'armL', pos: [0.34, 1.42, 0], scale: [1.25, 0.75, 1.15], seg: [6, 3], thetaLength: Math.PI / 2, color: BRONZE, trim: true });
limb(pb, 0.085, 0.075, [0.34, 1.06, 0.02], [0.35, 0.84, 0.03], { bone: 'foreL', color: SKIN_PY });
pb.cyl(0.09, 0.09, 0.09, { bone: 'foreL', pos: [0.348, 0.90, 0.03], radial: 6, color: LINEN });
pb.box(0.16, 0.15, 0.16, { bone: 'handL', pos: [0.35, 0.74, 0.04], color: SKIN_PY_D });
// ---- right arm: BRAZIER-GAUNTLET (signature)
limb(pb, 0.105, 0.095, [-0.31, 1.36, 0], [-0.34, 1.06, 0.02], { bone: 'armR', color: SOOT });
pb.sphere(0.21, { bone: 'armR', pos: [-0.35, 1.43, 0], scale: [1.3, 0.8, 1.2], seg: [8, 3], thetaLength: Math.PI / 2, color: BRONZE });
for (let i = -1; i <= 1; i++) pb.box(0.03, 0.10, 0.16, { bone: 'armR', pos: [-0.35 + 0.08 * i, 1.55, 0], color: BRONZE_LO }); // vent fins
pb.torus(0.26, 0.03, { bone: 'armR', pos: [-0.35, 1.43, 0], rot: [Math.PI / 2, 0, 0], scale: [1.05, 1, 0.95], tubular: 3, radial: 10, color: BRONZE_HI, trim: true });
pb.cyl(0.13, 0.155, 0.30, { bone: 'foreR', pos: [-0.345, 0.93, 0.03], radial: 8, color: BRONZE });     // bracer body
pb.cyl(0.14, 0.14, 0.04, { bone: 'foreR', pos: [-0.345, 1.07, 0.03], radial: 8, color: BRONZE_HI });
pb.cyl(0.165, 0.165, 0.04, { bone: 'foreR', pos: [-0.345, 0.79, 0.03], radial: 8, color: BRONZE_HI, trim: true });
pb.box(0.17, 0.16, 0.04, { bone: 'foreR', pos: [-0.345, 0.94, 0.165], color: FIRE, emis: 2.4 });        // coal window
for (let i = 0; i < 3; i++) pb.box(0.20, 0.035, 0.05, { bone: 'foreR', pos: [-0.345, 0.88 + 0.06 * i, 0.175], color: RIFT_IRON }); // grille
pb.box(0.25, 0.22, 0.25, { bone: 'handR', pos: [-0.355, 0.69, 0.06], taper: [1.05, 1.05], color: RIFT_IRON }); // fist
pb.box(0.26, 0.08, 0.10, { bone: 'handR', pos: [-0.355, 0.66, 0.18], color: BRONZE_HI });               // knuckle plate
pb.box(0.08, 0.11, 0.09, { bone: 'handR', pos: [-0.235, 0.71, 0.12], color: RIFT_IRON });                 // thumb
pb.sphere(0.065, { bone: 'focus', pos: [-0.355, 0.58, 0.12], seg: [5, 3], color: FIRE, emis: 3.0 });     // palm core (muzzle)
for (const dx of [-0.07, 0.07]) pb.cone(0.045, 0.16, { bone: 'focus', pos: [-0.355 + dx, 0.88, 0.15], radial: 4, color: FIRE_HI, emis: 2.6 }); // knuckle flames
// ---- legs
pb.mirror((S, k) => {
  limb(pb, 0.115, 0.095, [0.13 * k, 0.76, 0], [0.135 * k, 0.42, 0.01], { bone: 'thigh' + S, color: TROUSER });
  limb(pb, 0.10, 0.09, [0.135 * k, 0.42, 0.01], [0.14 * k, 0.12, 0.02], { bone: 'shin' + S, color: BOOT });
  pb.cyl(0.11, 0.11, 0.06, { bone: 'shin' + S, pos: [0.135 * k, 0.42, 0.01], radial: 7, color: BOOT_L });
  pb.box(0.13, 0.20, 0.05, { bone: 'shin' + S, pos: [0.137 * k, 0.30, 0.10], taper: [1.1, 1], color: BRONZE }); // greave
  pb.box(0.17, 0.13, 0.29, { bone: 'foot' + S, pos: [0.14 * k, 0.065, 0.06], taper: [0.9, 0.85], color: BOOT });
  pb.box(0.17, 0.08, 0.08, { bone: 'foot' + S, pos: [0.14 * k, 0.045, 0.19], color: RIFT_IRON });          // steel toe
});
// ---- kiln pack + chimney (back silhouette spike)
pb.cyl(0.17, 0.20, 0.38, { bone: 'pack', pos: [0, 1.26, -0.34], radial: 8, color: BRONZE });
pb.cyl(0.205, 0.205, 0.04, { bone: 'pack', pos: [0, 1.10, -0.34], radial: 8, color: RIFT_IRON });
pb.cyl(0.18, 0.18, 0.04, { bone: 'pack', pos: [0, 1.42, -0.34], radial: 8, color: RIFT_IRON });
pb.box(0.17, 0.14, 0.03, { bone: 'pack', pos: [0, 1.20, -0.545], color: RIFT_IRON });                     // door frame
pb.box(0.12, 0.08, 0.03, { bone: 'pack', pos: [0, 1.20, -0.56], color: FIRE, emis: 2.2 });               // fire door (seen from behind)
pb.cyl(0.06, 0.075, 0.46, { bone: 'chimney', pos: [0, 1.67, -0.36], radial: 6, color: RIFT_IRON });
pb.cyl(0.11, 0.065, 0.08, { bone: 'chimney', pos: [0, 1.92, -0.36], radial: 6, color: BRONZE_HI, trim: true });
pb.cyl(0.07, 0.07, 0.02, { bone: 'chimney', pos: [0, 1.965, -0.36], radial: 6, color: FIRE, emis: 2.5 }); // ember mouth (emitter 0, 2.0, −0.36)
```
**Emissive** (≈ 3.5% of surface): palm core, 2 knuckle flames, coal window (mostly behind bars), chimney mouth, fire door, 2 lenses, 2 eyes, clasp gem.

---

# Appendix B — Cryomancer (Stillwater Warden)

**Silhouette:** a tall **white triangle**: a wide fur shoulder ring and hood flaring over a cobalt robe. Three **ice prisms** rise from the brow. A tall dark staff on the right ends in a **glowing hexagonal crystal** held by a bronze claw. Up to 3 frost shards orbit at chest height. Facing reads from the face opening, the tiara front prism and the breastplate.

**Palette:**

| Token | Hex | L\* | Use |
|---|---|---|---|
| FUR / FUR_SH | `#eef2f4` / `#c4d4e0` | 95 / 84 | mantle, hood, hems / cape upper |
| ROBE / ROBE_D | `#2c4a78` / `#22385e` | 31 / 24 | robe panels, sleeves / cape lower, thighs |
| FROST_PALE | `#a8d8ee` | 84 | sash |
| CRYSTAL | `#bfeaff` | 90 | matte ice, pauldron spikes, tiara prisms |
| SKIN_CR | `#f0d0bc` | 86 | |
| HAIR_CR | `#dfe6ee` | 91 | silver braids |
| shared | — | — | RIFT_IRON (cuirass, greaves, gauntlets), RIFT_IRON_HI (staff shaft, breastplate), BRONZE*, LEATHER_D, FROST, FROST_HI |

**Bones (29):**
```js
bones: [
  { name: 'root' },
  { name: 'hips',   pivot: [0, 0.90, 0] },
  { name: 'spine',  parent: 'hips',   pivot: [0, 1.02, 0] },
  { name: 'chest',  parent: 'spine',  pivot: [0, 1.24, 0] },
  { name: 'head',   parent: 'chest',  pivot: [0, 1.60, 0.03] },
  { name: 'crown',  parent: 'head',   pivot: [0, 1.93, 0.07] },
  { name: 'armL',   parent: 'chest',  pivot: [0.29, 1.50, 0] },
  { name: 'foreL',  parent: 'armL',   pivot: [0.31, 1.20, 0.01] },
  { name: 'handL',  parent: 'foreL',  pivot: [0.32, 0.94, 0.02] },
  { name: 'armR',   parent: 'chest',  pivot: [-0.29, 1.50, 0] },
  { name: 'foreR',  parent: 'armR',   pivot: [-0.31, 1.20, 0.01] },
  { name: 'handR',  parent: 'foreR',  pivot: [-0.32, 0.94, 0.04] },
  { name: 'focus',  parent: 'handR',  pivot: [-0.33, 0.92, 0.08] },   // staff grip
  { name: 'crystal',parent: 'focus',  pivot: [-0.33, 1.86, 0.08] },
  { name: 'thighL', parent: 'hips',   pivot: [0.12, 0.88, 0] },
  { name: 'shinL',  parent: 'thighL', pivot: [0.125, 0.48, 0.01] },
  { name: 'footL',  parent: 'shinL',  pivot: [0.13, 0.10, 0.02] },
  { name: 'thighR', parent: 'hips',   pivot: [-0.12, 0.88, 0] },
  { name: 'shinR',  parent: 'thighR', pivot: [-0.125, 0.48, 0.01] },
  { name: 'footR',  parent: 'shinR',  pivot: [-0.13, 0.10, 0.02] },
  { name: 'skirtL', parent: 'hips',   pivot: [0.12, 0.95, 0.06] },
  { name: 'skirtR', parent: 'hips',   pivot: [-0.12, 0.95, 0.06] },
  { name: 'skirtB', parent: 'hips',   pivot: [0, 0.95, -0.12] },
  { name: 'cape1',  parent: 'chest',  pivot: [0, 1.48, -0.20] },
  { name: 'cape2',  parent: 'cape1',  pivot: [0, 0.98, -0.27] },
  { name: 'armor1', pivot: [0, 1.30, 0] },                           // Frost Armor orbiters (parent root)
  { name: 'armor2', pivot: [0, 1.30, 0] },
  { name: 'armor3', pivot: [0, 1.30, 0] },
  { name: 'shard',  parent: 'chest',  pivot: [0, 1.38, 0.20] },
],
stride: 1.85, blob: 0.65, deathTime: 1.4, muzzle: [-0.33, 2.0, 0.08],
```

**Parts:**
```js
// ---- cuirass + waist
pb.box(0.46, 0.42, 0.32, { bone: 'chest', pos: [0, 1.34, 0], taper: [1.1, 1.0], color: RIFT_IRON });
pb.box(0.34, 0.30, 0.05, { bone: 'chest', pos: [0, 1.33, 0.165], taper: [1.05, 1], color: RIFT_IRON_HI });
pb.box(0.36, 0.045, 0.06, { bone: 'chest', pos: [0, 1.19, 0.165], color: BRONZE_HI, trim: true });
crownClasp(pb, 'shard', [0, 1.38, 0.2], FROST);
pb.box(0.40, 0.20, 0.30, { bone: 'spine', pos: [0, 1.10, 0], color: ROBE });
pb.cyl(0.235, 0.235, 0.08, { bone: 'spine', pos: [0, 1.03, 0], radial: 8, color: FROST_PALE });          // sash
pb.box(0.10, 0.10, 0.06, { bone: 'spine', pos: [0.10, 1.03, 0.22], color: FROST_PALE });                 // sash knot
// ---- robe panels (follow the thighs) + side panels
pb.mirror((S, k) => {
  pb.box(0.24, 0.74, 0.07, { bone: 'skirt' + S, pos: [0.125 * k, 0.57, 0.07], bottom: [1.2, 1.1], color: ROBE });
  pb.box(0.30, 0.06, 0.10, { bone: 'skirt' + S, pos: [0.13 * k, 0.20, 0.07], color: FUR });              // snow hem
  pb.box(0.07, 0.70, 0.24, { bone: 'hips', pos: [0.24 * k, 0.60, -0.03], bottom: [1, 1.15], color: ROBE_D });
});
pb.box(0.52, 0.76, 0.07, { bone: 'skirtB', pos: [0, 0.57, -0.13], bottom: [1.25, 1], color: ROBE });
pb.box(0.66, 0.06, 0.10, { bone: 'skirtB', pos: [0, 0.20, -0.13], color: FUR });
// ---- fur mantle + ice pauldrons (top-plane identity: white)
pb.cyl(0.32, 0.46, 0.22, { bone: 'chest', pos: [0, 1.50, -0.02], radial: 8, color: FUR });
pb.mirror((S, k) => {
  pb.sphere(0.20, { bone: 'chest', pos: [0.32 * k, 1.55, -0.02], scale: [1.15, 0.65, 1.1], seg: [6, 4], color: FUR });
  pb.cone(0.065, 0.30, { bone: 'chest', pos: [0.42 * k, 1.70, -0.06], rot: [-0.15, 0, -0.55 * k], radial: 6, color: CRYSTAL });
  pb.cone(0.05, 0.20, { bone: 'chest', pos: [0.36 * k, 1.68, 0.08], rot: [0.2, 0, -0.35 * k], radial: 6, color: CRYSTAL });
});
// ---- cape (white upper, cobalt lower, bronze hex sigil = frost shape)
pb.box(0.66, 0.54, 0.07, { bone: 'cape1', pos: [0, 1.24, -0.24], bottom: [1.12, 1], color: FUR_SH });
pb.box(0.72, 0.60, 0.06, { bone: 'cape2', pos: [0, 0.69, -0.30], bottom: [1.12, 1], color: ROBE_D });
pb.box(0.82, 0.06, 0.09, { bone: 'cape2', pos: [0, 0.38, -0.30], color: FUR });
pb.cyl(0.11, 0.11, 0.03, { bone: 'cape2', pos: [0, 0.78, -0.34], rot: [Math.PI / 2, 0, 0], radial: 6, color: BRONZE_HI, trim: true });
// ---- head + hood + braids
pb.box(0.32, 0.34, 0.32, { bone: 'head', pos: [0, 1.77, 0.05], taper: [0.9, 0.92], color: SKIN_CR });
pb.box(0.06, 0.08, 0.07, { bone: 'head', pos: [0, 1.75, 0.225], color: SKIN_CR });
pb.sphere(0.235, { bone: 'head', pos: [0, 1.84, 0.03], scale: [1.08, 0.75, 1.1], seg: [8, 3], thetaLength: Math.PI / 2, color: FUR });
pb.box(0.40, 0.34, 0.10, { bone: 'head', pos: [0, 1.74, -0.12], color: FUR });
pb.mirror((S, k) => {
  pb.box(0.055, 0.035, 0.02, { bone: 'head', pos: [0.075 * k, 1.79, 0.215], color: FROST_HI, emis: 1.8 });
  pb.box(0.06, 0.30, 0.26, { bone: 'head', pos: [0.19 * k, 1.75, 0.04], color: FUR });                   // hood flaps
  pb.cyl(0.035, 0.045, 0.38, { bone: 'head', pos: [0.12 * k, 1.50, 0.17], radial: 5, color: HAIR_CR });  // braids
  pb.cyl(0.05, 0.05, 0.04, { bone: 'head', pos: [0.12 * k, 1.31, 0.17], radial: 5, color: BRONZE_HI });
});
// ---- ice tiara (crown bone; tips glow)
pb.torus(0.20, 0.025, { bone: 'crown', pos: [0, 1.92, 0.05], rot: [Math.PI / 2, 0, 0], tubular: 3, radial: 8, color: BRONZE_HI, trim: true });
pb.cyl(0.055, 0.055, 0.14, { bone: 'crown', pos: [0, 1.97, 0.17], radial: 6, color: CRYSTAL });
pb.cone(0.055, 0.08, { bone: 'crown', pos: [0, 2.08, 0.17], radial: 6, color: FROST, emis: 2.2 });
pb.mirror((S, k) => {
  pb.cyl(0.042, 0.042, 0.13, { bone: 'crown', pos: [0.12 * k, 1.97, 0.14], rot: [0, 0, -0.35 * k], radial: 6, color: CRYSTAL });
  pb.cone(0.042, 0.07, { bone: 'crown', pos: [0.145 * k, 2.06, 0.14], rot: [0, 0, -0.35 * k], radial: 6, color: FROST, emis: 2.2 });
});
// ---- arms (bell sleeves, fur cuffs, rift-iron gauntlets)
pb.mirror((S, k) => {
  limb(pb, 0.095, 0.085, [0.29 * k, 1.50, 0], [0.31 * k, 1.20, 0.01], { bone: 'arm' + S, color: ROBE });
  limb(pb, 0.09, 0.13, [0.31 * k, 1.20, 0.01], [0.32 * k, 0.98, 0.02], { bone: 'fore' + S, color: ROBE });
  pb.cyl(0.14, 0.14, 0.06, { bone: 'fore' + S, pos: [0.32 * k, 0.99, 0.02], radial: 7, color: FUR });
  pb.box(0.14, 0.14, 0.14, { bone: 'hand' + S, pos: [0.32 * k, 0.88, 0.03], color: RIFT_IRON });
});
// ---- legs (mostly hidden by panels; greaves show in the gaps and the slide)
pb.mirror((S, k) => {
  limb(pb, 0.10, 0.09, [0.12 * k, 0.88, 0], [0.125 * k, 0.48, 0.01], { bone: 'thigh' + S, color: ROBE_D });
  limb(pb, 0.095, 0.085, [0.125 * k, 0.48, 0.01], [0.13 * k, 0.12, 0.02], { bone: 'shin' + S, color: RIFT_IRON });
  pb.sphere(0.08, { bone: 'shin' + S, pos: [0.125 * k, 0.47, 0.07], seg: [5, 3], color: BRONZE });
  pb.box(0.15, 0.12, 0.29, { bone: 'foot' + S, pos: [0.13 * k, 0.06, 0.06], taper: [0.9, 0.85], color: RIFT_IRON });
  pb.box(0.15, 0.05, 0.06, { bone: 'foot' + S, pos: [0.13 * k, 0.03, 0.20], color: RIFT_IRON_HI });
});
// ---- the Stillwater Crook
pb.cyl(0.035, 0.04, 1.60, { bone: 'focus', pos: [-0.33, 0.90, 0.08], radial: 6, color: RIFT_IRON_HI });   // y 0.10–1.70
pb.cyl(0.048, 0.048, 0.16, { bone: 'focus', pos: [-0.33, 0.92, 0.08], radial: 6, color: LEATHER_D });
pb.cone(0.045, 0.10, { bone: 'focus', pos: [-0.33, 0.06, 0.08], rot: [Math.PI, 0, 0], radial: 5, color: BRONZE });
pb.cyl(0.075, 0.05, 0.09, { bone: 'focus', pos: [-0.33, 1.71, 0.08], radial: 6, color: BRONZE });
for (let i = 0; i < 3; i++) { const a = i * TAU / 3;                                                   // bronze claw
  pb.cone(0.035, 0.26, { bone: 'focus', pos: [-0.33 + 0.09 * Math.sin(a), 1.84, 0.08 + 0.09 * Math.cos(a)], rot: [0.35 * Math.cos(a), 0, -0.35 * Math.sin(a)], radial: 4, color: BRONZE_HI, trim: true }); }
pb.cyl(0.11, 0.11, 0.18, { bone: 'crystal', pos: [-0.33, 1.88, 0.08], radial: 6, color: CRYSTAL, emis: 1.0 });   // hex prism
pb.cone(0.11, 0.14, { bone: 'crystal', pos: [-0.33, 2.04, 0.08], radial: 6, color: FROST, emis: 2.4 });
pb.cone(0.11, 0.08, { bone: 'crystal', pos: [-0.33, 1.75, 0.08], rot: [Math.PI, 0, 0], radial: 6, color: CRYSTAL, emis: 1.0 });
// ---- Frost Armor shards (hidden by scale 0 until earned)
for (let n = 1; n <= 3; n++) {
  pb.cyl(0.055, 0.055, 0.13, { bone: 'armor' + n, pos: [0, 1.30, 0.62], radial: 6, color: FROST, emis: 2.0 });
  pb.cone(0.055, 0.07, { bone: 'armor' + n, pos: [0, 1.40, 0.62], radial: 6, color: FROST, emis: 2.0 });
  pb.cone(0.055, 0.07, { bone: 'armor' + n, pos: [0, 1.20, 0.62], rot: [Math.PI, 0, 0], radial: 6, color: FROST, emis: 2.0 });
}
```
**Emissive** (≈ 4.5% at full armor, 3% without): crystal (body 1.0, tip 2.4), 3 tiara tips, eyes, clasp, armor shards. **Note:** with baseline glow 0.45 the crystal body (emis 1.0) stays under the bloom threshold and only the tip blooms. On a cast (glow ≥ 1) the whole crystal blooms.

---

# Appendix C — Stormcaller (Tempest Rider)

**Silhouette:** a lean figure **leaning forward** under a **0.72 m dark hat disc** with a yellow band and a crooked tip pointing back like a weather vane. A **yellow scarf** runs down the back and streams out when running. Two navy **swallow-tails** flutter. A **forked rod** sits in the right hand. From the top, a dark disc with a yellow ring and a yellow streamer behind it is unmistakable. Facing reads from the front-raised brim, the face and the rod tines.

**Palette:**

| Token | Hex | L\* | Use |
|---|---|---|---|
| COAT / COAT_D | `#233a6e` / `#1a2a52` | 25 / 18 | coat, sleeves / pauldrons |
| HAT | `#1e2c52` | 19 | hat |
| SCARF / SCARF_D | `#f2d43a` / `#c89a1c` | 85 / 66 | scarf, hat band (lemon, hue 51°: away from saffron `#e08a3a` and elite gold `#ffc93a`) |
| LINING | `#e8b828` | 77 | lapels, cuffs, tail trims |
| SHIRT | `#e8e0d0` | 90 | shirt V |
| SKIN_ST | `#d8a07a` | 70 | |
| HAIR_ST | `#f2eacb` | 93 | static-spiked hair under the brim |
| TROUSER | `#2e3448` | 22 | |
| BOOT / BOOT_L | `#3a2a20` / `#5a4030` | 19 / 29 | |
| shared | — | — | LEATHER, LEATHER_D, SOLE, RIFT_IRON_HI, BRONZE*, STORM, STORM_HI |

**Bones (27):**
```js
bones: [
  { name: 'root' },
  { name: 'hips',   pivot: [0, 0.86, 0] },
  { name: 'spine',  parent: 'hips',   pivot: [0, 0.98, 0] },
  { name: 'chest',  parent: 'spine',  pivot: [0, 1.18, 0] },
  { name: 'head',   parent: 'chest',  pivot: [0, 1.50, 0.02] },
  { name: 'hat',    parent: 'head',   pivot: [0, 1.86, 0] },
  { name: 'armL',   parent: 'chest',  pivot: [0.25, 1.42, 0] },
  { name: 'foreL',  parent: 'armL',   pivot: [0.27, 1.13, 0] },
  { name: 'handL',  parent: 'foreL',  pivot: [0.28, 0.87, 0.01] },
  { name: 'armR',   parent: 'chest',  pivot: [-0.25, 1.42, 0] },
  { name: 'foreR',  parent: 'armR',   pivot: [-0.27, 1.13, 0] },
  { name: 'handR',  parent: 'foreR',  pivot: [-0.28, 0.87, 0.01] },
  { name: 'focus',  parent: 'handR',  pivot: [-0.28, 0.82, 0.06] },   // rod grip
  { name: 'thighL', parent: 'hips',   pivot: [0.11, 0.84, 0] },
  { name: 'shinL',  parent: 'thighL', pivot: [0.115, 0.47, 0] },
  { name: 'footL',  parent: 'shinL',  pivot: [0.12, 0.10, 0.01] },
  { name: 'thighR', parent: 'hips',   pivot: [-0.11, 0.84, 0] },
  { name: 'shinR',  parent: 'thighR', pivot: [-0.115, 0.47, 0] },
  { name: 'footR',  parent: 'shinR',  pivot: [-0.12, 0.10, 0.01] },
  { name: 'tailL',  parent: 'spine',  pivot: [0.10, 1.00, -0.15] },
  { name: 'tailL2', parent: 'tailL',  pivot: [0.11, 0.62, -0.19] },
  { name: 'tailR',  parent: 'spine',  pivot: [-0.10, 1.00, -0.15] },
  { name: 'tailR2', parent: 'tailR',  pivot: [-0.11, 0.62, -0.19] },
  { name: 'scarf1', parent: 'chest',  pivot: [0, 1.46, -0.14] },
  { name: 'scarf2', parent: 'scarf1', pivot: [0, 1.13, -0.18] },
  { name: 'scarf3', parent: 'scarf2', pivot: [0, 0.84, -0.18] },
  { name: 'shard',  parent: 'chest',  pivot: [0, 1.30, 0.155] },
],
stride: 2.45, blob: 0.55, deathTime: 1.4, muzzle: [-0.28, 1.82, 0.06],
```

**Parts:**
```js
// ---- coat torso
pb.box(0.40, 0.36, 0.27, { bone: 'chest', pos: [0, 1.29, 0], taper: [1.12, 1], color: COAT });
pb.box(0.08, 0.20, 0.03, { bone: 'chest', pos: [0, 1.34, 0.135], color: SHIRT });
pb.mirror((S, k) => pb.box(0.07, 0.30, 0.03, { bone: 'chest', pos: [0.075 * k, 1.30, 0.14], rot: [0, 0, 0.22 * k], color: LINING }));
crownClasp(pb, 'shard', [0, 1.30, 0.155], STORM);
pb.mirror((S, k) => {
  pb.sphere(0.13, { bone: 'arm' + S, pos: [0.27 * k, 1.45, 0], scale: [1.25, 0.6, 1.15], seg: [6, 3], thetaLength: Math.PI / 2, color: COAT_D });
  pb.box(0.06, 0.06, 0.06, { bone: 'arm' + S, pos: [0.29 * k, 1.50, 0], rot: [0, 0.785, 0], color: BRONZE_HI, trim: true });
});
pb.box(0.34, 0.20, 0.25, { bone: 'spine', pos: [0, 1.07, 0], color: COAT });
pb.cyl(0.19, 0.19, 0.07, { bone: 'spine', pos: [0, 1.00, 0], radial: 8, color: LEATHER_D });
pb.mirror((S, k) => pb.box(0.08, 0.10, 0.08, { bone: 'spine', pos: [0.19 * k, 0.95, 0.05], color: LEATHER }));
pb.mirror((S, k) => pb.box(0.16, 0.30, 0.05, { bone: 'hips', pos: [0.10 * k, 0.82, 0.12], bottom: [1.15, 1], color: COAT })); // short front skirts
// ---- swallow-tails
pb.mirror((S, k) => {
  pb.box(0.20, 0.42, 0.05, { bone: 'tail' + S, pos: [0.10 * k, 0.81, -0.17], bottom: [1.15, 1], color: COAT });
  pb.box(0.23, 0.34, 0.045, { bone: 'tail' + S + '2', pos: [0.11 * k, 0.45, -0.20], bottom: [1.15, 1], color: COAT });
  pb.box(0.26, 0.045, 0.055, { bone: 'tail' + S + '2', pos: [0.11 * k, 0.29, -0.20], color: LINING });
});
// ---- scarf (neck wrap + 3-segment streamer down the back)
pb.cyl(0.17, 0.20, 0.10, { bone: 'chest', pos: [0, 1.49, 0], radial: 8, color: SCARF });
pb.box(0.10, 0.08, 0.06, { bone: 'chest', pos: [0.06, 1.45, 0.17], color: SCARF });
pb.box(0.17, 0.34, 0.05, { bone: 'scarf1', pos: [0, 1.30, -0.17], color: SCARF });
pb.box(0.16, 0.30, 0.045, { bone: 'scarf2', pos: [0, 0.98, -0.18], color: SCARF });
pb.box(0.15, 0.20, 0.04, { bone: 'scarf3', pos: [0, 0.74, -0.18], color: SCARF });
pb.cone(0.08, 0.12, { bone: 'scarf3', pos: [0, 0.58, -0.18], rot: [Math.PI, 0, 0], scale: [1, 1, 0.35], radial: 4, color: SCARF_D });
// ---- head
pb.box(0.32, 0.34, 0.32, { bone: 'head', pos: [0, 1.67, 0.03], taper: [0.92, 0.94], color: SKIN_ST });
pb.box(0.06, 0.08, 0.07, { bone: 'head', pos: [0, 1.64, 0.21], color: SKIN_ST });
pb.mirror((S, k) => {
  pb.box(0.055, 0.035, 0.02, { bone: 'head', pos: [0.075 * k, 1.69, 0.195], color: STORM_HI, emis: 1.8 });
  pb.cone(0.07, 0.20, { bone: 'head', pos: [0.17 * k, 1.76, -0.04], rot: [0, 0, -1.2 * k], radial: 4, color: HAIR_ST }); // static spikes
});
pb.cone(0.08, 0.22, { bone: 'head', pos: [0, 1.74, -0.19], rot: [-1.3, 0, 0], radial: 4, color: HAIR_ST });
// ---- hat (the top-plane signature)
pb.cyl(0.36, 0.36, 0.035, { bone: 'hat', pos: [0, 1.87, 0], rot: [-0.16, 0, 0], radial: 10, color: HAT });         // brim, front raised
pb.cyl(0.14, 0.18, 0.17, { bone: 'hat', pos: [0, 1.96, -0.02], rot: [-0.16, 0, 0], radial: 8, color: HAT });
pb.cyl(0.185, 0.185, 0.045, { bone: 'hat', pos: [0, 1.90, -0.01], rot: [-0.16, 0, 0], radial: 8, color: SCARF });   // band
pb.cone(0.14, 0.20, { bone: 'hat', pos: [0, 2.07, -0.10], rot: [-1.0, 0, 0], radial: 8, color: HAT });              // bent tip → back
pb.extrude(BOLT, 0.03, { bone: 'hat', pos: [0.08, 1.92, 0.17], color: BRONZE_HI, trim: true });                     // bolt pin
// ---- arms
pb.mirror((S, k) => {
  limb(pb, 0.075, 0.068, [0.25 * k, 1.42, 0], [0.27 * k, 1.13, 0], { bone: 'arm' + S, color: COAT });
  limb(pb, 0.068, 0.06, [0.27 * k, 1.13, 0], [0.28 * k, 0.90, 0.01], { bone: 'fore' + S, color: COAT });
  pb.cyl(0.085, 0.085, 0.08, { bone: 'fore' + S, pos: [0.28 * k, 0.93, 0.01], radial: 7, color: LINING });
  pb.box(0.12, 0.13, 0.12, { bone: 'hand' + S, pos: [0.28 * k, 0.81, 0.02], color: LEATHER });
});
// ---- legs
pb.mirror((S, k) => {
  limb(pb, 0.085, 0.072, [0.11 * k, 0.84, 0], [0.115 * k, 0.47, 0], { bone: 'thigh' + S, color: TROUSER });
  limb(pb, 0.08, 0.07, [0.115 * k, 0.47, 0], [0.12 * k, 0.12, 0.01], { bone: 'shin' + S, color: BOOT });
  pb.cyl(0.095, 0.095, 0.07, { bone: 'shin' + S, pos: [0.115 * k, 0.46, 0], radial: 7, color: BOOT_L });
  pb.box(0.05, 0.04, 0.03, { bone: 'shin' + S, pos: [0.12 * k, 0.30, 0.085], color: BRONZE_HI });
  pb.box(0.13, 0.11, 0.27, { bone: 'foot' + S, pos: [0.12 * k, 0.055, 0.05], taper: [0.9, 0.85], color: BOOT });
  pb.box(0.14, 0.03, 0.28, { bone: 'foot' + S, pos: [0.12 * k, 0.015, 0.05], color: SOLE });
});
// ---- conductor's rod (fork = the storm "bolt-cut" read)
pb.cyl(0.028, 0.034, 0.90, { bone: 'focus', pos: [-0.28, 1.06, 0.06], radial: 6, color: RIFT_IRON_HI });   // y 0.61–1.51
pb.cyl(0.042, 0.042, 0.16, { bone: 'focus', pos: [-0.28, 0.84, 0.06], radial: 6, color: LEATHER });
pb.sphere(0.05, { bone: 'focus', pos: [-0.28, 0.60, 0.06], seg: [5, 3], color: BRONZE });
for (const y of [1.20, 1.35]) pb.cyl(0.042, 0.042, 0.03, { bone: 'focus', pos: [-0.28, y, 0.06], radial: 6, color: BRONZE });
pb.box(0.24, 0.06, 0.07, { bone: 'focus', pos: [-0.28, 1.52, 0.06], color: BRONZE_HI, trim: true });        // yoke
for (const t of [-1, 1]) {
  pb.cyl(0.03, 0.036, 0.26, { bone: 'focus', pos: [-0.28 + 0.095 * t, 1.67, 0.06], radial: 5, color: BRONZE_HI });
  pb.sphere(0.045, { bone: 'focus', pos: [-0.28 + 0.095 * t, 1.82, 0.06], seg: [4, 2], color: STORM, emis: 2.8 }); // tine tips (arc endpoints)
}
```
**Emissive** (≈ 1.5%): 2 tine tips, 2 eyes, clasp. The arcs are fx. This is the least glowing hero; it compensates with the strongest value read (dark disc) and the moving yellow.

---

# Appendix D — Arcanist (Loomwarden)

**Silhouette:** a slender violet column with a **bright white standing collar and stole**. A **white top-knot** sits pierced by a bronze pin. A **bronze broken ring** (the Riftcrown halo, 3 arcs with violet stars in the gaps) hangs behind the head. A **floating open book** with gilt pages sits at the left hip, and 3 violet stars orbit the waist. The right hand holds a short bronze key-wand. Facing reads from the face, the stole, the tabard and the halo's tilt (it leans back).

**Palette:**

| Token | Hex | L\* | Use |
|---|---|---|---|
| ROBE_AR / ROBE_AR_D | `#4b2f86` / `#3a2268` | 27 / 20 | coat / coat lower |
| STOLE | `#ece6f8` | 92 | stole, collar, tabard, cuffs |
| SKIN_AR | `#8a5a3c` | 43 | |
| HAIR_AR | `#f0ecf6` | 94 | |
| TROUSER_AR | `#2a2238` | 15 | |
| BOOT_AR | `#2a2030` | 14 | |
| GLYPH_MATTE | `#6d3fc0` | 37 | tabard star (matte = `--arcane-lo`) |
| shared | — | — | RIFT_IRON (tome covers, sash), BRONZE*, GILT (pages), ARCANE, ARCANE_HI |

**Bones (28):**
```js
bones: [
  { name: 'root' },
  { name: 'hips',   pivot: [0, 0.92, 0] },
  { name: 'spine',  parent: 'hips',   pivot: [0, 1.04, 0] },
  { name: 'chest',  parent: 'spine',  pivot: [0, 1.24, 0] },
  { name: 'head',   parent: 'chest',  pivot: [0, 1.58, 0.02] },
  { name: 'bun',    parent: 'head',   pivot: [0, 1.90, -0.04] },
  { name: 'armL',   parent: 'chest',  pivot: [0.23, 1.48, 0] },
  { name: 'foreL',  parent: 'armL',   pivot: [0.25, 1.19, 0.01] },
  { name: 'handL',  parent: 'foreL',  pivot: [0.26, 0.93, 0.02] },
  { name: 'armR',   parent: 'chest',  pivot: [-0.23, 1.48, 0] },
  { name: 'foreR',  parent: 'armR',   pivot: [-0.25, 1.19, 0.01] },
  { name: 'handR',  parent: 'foreR',  pivot: [-0.26, 0.93, 0.02] },
  { name: 'focus',  parent: 'handR',  pivot: [-0.26, 0.86, 0.06] },   // rift-key wand
  { name: 'tome',   parent: 'chest',  pivot: [0.44, 1.08, 0.24] },    // floats, follows the aim twist
  { name: 'halo',   parent: 'chest',  pivot: [0, 1.80, -0.20] },
  { name: 'thighL', parent: 'hips',   pivot: [0.10, 0.90, 0] },
  { name: 'shinL',  parent: 'thighL', pivot: [0.105, 0.49, 0.01] },
  { name: 'footL',  parent: 'shinL',  pivot: [0.11, 0.10, 0.02] },
  { name: 'thighR', parent: 'hips',   pivot: [-0.10, 0.90, 0] },
  { name: 'shinR',  parent: 'thighR', pivot: [-0.105, 0.49, 0.01] },
  { name: 'footR',  parent: 'shinR',  pivot: [-0.11, 0.10, 0.02] },
  { name: 'tabard', parent: 'hips',   pivot: [0, 0.98, 0.14] },
  { name: 'coatB1', parent: 'hips',   pivot: [0, 1.00, -0.14] },
  { name: 'coatB2', parent: 'coatB1', pivot: [0, 0.56, -0.17] },
  { name: 'glyph1', pivot: [0, 1.0, 0] },                             // orbiters (parent root)
  { name: 'glyph2', pivot: [0, 1.0, 0] },
  { name: 'glyph3', pivot: [0, 1.0, 0] },
  { name: 'shard',  parent: 'chest',  pivot: [0, 1.42, 0.165] },
],
stride: 1.95, blob: 0.55, deathTime: 1.4, muzzle: [-0.26, 1.39, 0.06],
```

**Parts:**
```js
// ---- torso: violet coat, white stole + collar (top-plane identity)
pb.box(0.38, 0.40, 0.26, { bone: 'chest', pos: [0, 1.34, 0], taper: [1.12, 1], color: ROBE_AR });
pb.box(0.16, 0.44, 0.04, { bone: 'chest', pos: [0, 1.30, 0.14], color: STOLE });
pb.mirror((S, k) => pb.box(0.12, 0.05, 0.26, { bone: 'chest', pos: [0.12 * k, 1.535, 0], color: STOLE }));      // stole over shoulders
pb.cyl(0.17, 0.20, 0.16, { bone: 'chest', pos: [0, 1.56, -0.01], radial: 8, color: STOLE });                 // collar ring (closed; top hidden in the head)
pb.box(0.34, 0.26, 0.05, { bone: 'chest', pos: [0, 1.66, -0.15], rot: [-0.3, 0, 0], bottom: [0.75, 1], color: STOLE }); // standing collar
for (const y of [1.30, 1.22]) pb.box(0.10, 0.03, 0.02, { bone: 'chest', pos: [0, y, 0.163], color: BRONZE_HI, trim: true });
crownClasp(pb, 'shard', [0, 1.42, 0.165], ARCANE);
pb.box(0.32, 0.20, 0.24, { bone: 'spine', pos: [0, 1.10, 0], color: ROBE_AR });
pb.cyl(0.18, 0.18, 0.07, { bone: 'spine', pos: [0, 1.04, 0], radial: 8, color: RIFT_IRON });
pb.extrude(STAR4(0.06), 0.03, { bone: 'spine', pos: [0, 1.04, 0.185], color: BRONZE_HI });                 // star buckle
pb.box(0.15, 0.24, 0.04, { bone: 'spine', pos: [0, 1.06, 0.135], color: STOLE });
// ---- skirts: side panels, front tabard, back coat (2 segments)
pb.mirror((S, k) => pb.box(0.07, 0.48, 0.22, { bone: 'hips', pos: [0.17 * k, 0.76, -0.03], bottom: [1, 1.15], color: ROBE_AR }));
pb.box(0.15, 0.50, 0.04, { bone: 'tabard', pos: [0, 0.72, 0.14], bottom: [1.1, 1], color: STOLE });
pb.box(0.17, 0.045, 0.05, { bone: 'tabard', pos: [0, 0.47, 0.14], color: BRONZE_HI });
pb.extrude(STAR4(0.05), 0.02, { bone: 'tabard', pos: [0, 0.62, 0.165], color: GLYPH_MATTE });
pb.box(0.38, 0.46, 0.05, { bone: 'coatB1', pos: [0, 0.78, -0.16], bottom: [1.2, 1], color: ROBE_AR });
pb.box(0.44, 0.38, 0.045, { bone: 'coatB2', pos: [0, 0.37, -0.18], bottom: [1.15, 1], color: ROBE_AR_D });
pb.box(0.50, 0.04, 0.06, { bone: 'coatB2', pos: [0, 0.19, -0.18], color: BRONZE_HI, trim: true });
// ---- head, white hair, bun + crown-pin
pb.box(0.30, 0.33, 0.30, { bone: 'head', pos: [0, 1.745, 0.04], taper: [0.9, 0.92], color: SKIN_AR });
pb.box(0.055, 0.08, 0.06, { bone: 'head', pos: [0, 1.73, 0.20], color: SKIN_AR });
pb.sphere(0.175, { bone: 'head', pos: [0, 1.86, 0.02], scale: [1, 0.6, 1.05], seg: [8, 3], thetaLength: Math.PI / 2, color: HAIR_AR });
pb.box(0.28, 0.26, 0.06, { bone: 'head', pos: [0, 1.74, -0.13], color: HAIR_AR });
pb.mirror((S, k) => {
  pb.box(0.05, 0.03, 0.02, { bone: 'head', pos: [0.07 * k, 1.77, 0.195], color: ARCANE_HI, emis: 2.0 });
  pb.box(0.05, 0.22, 0.14, { bone: 'head', pos: [0.155 * k, 1.74, -0.01], color: HAIR_AR });
});
pb.sphere(0.10, { bone: 'bun', pos: [0, 1.97, -0.05], scale: [1, 1.15, 1], seg: [6, 4], color: HAIR_AR });
pb.box(0.30, 0.04, 0.04, { bone: 'bun', pos: [0, 1.98, -0.05], rot: [0, 0, 0.35], color: BRONZE_HI });
pb.extrude(STAR4(0.045), 0.025, { bone: 'bun', pos: [0.14, 2.03, -0.05], color: ARCANE, emis: 2.2 });
// ---- the Shattered Halo (3 bronze arcs, 3 star gems in the gaps; ring tilted back 0.3)
for (let i = 0; i < 3; i++) {
  pb.torus(0.27, 0.032, { bone: 'halo', pos: [0, 1.80, -0.20], rot: [-0.3, 0, 0.32 + i * 2.094], tubular: 4, radial: 5, arc: 1.6, color: BRONZE_HI, trim: true });
  const th = 2.167 + i * 2.094;                                    // gap centre angle
  pb.extrude(STAR4(0.06), 0.03, { bone: 'halo', pos: [0.27 * Math.cos(th), 1.80 + 0.258 * Math.sin(th), -0.20 - 0.08 * Math.sin(th)], rot: [-0.3, 0, 0], color: ARCANE, emis: 2.6 });
}
// ---- floating tome (open V, gilt pages, hovering sigil)
pb.mirror((S, c) => {
  pb.box(0.20, 0.03, 0.27, { bone: 'tome', pos: [0.44 + 0.10 * c, 1.10, 0.24], rot: [0, 0, 0.22 * c], color: RIFT_IRON });
  pb.box(0.18, 0.035, 0.25, { bone: 'tome', pos: [0.44 + 0.095 * c, 1.115, 0.24], rot: [0, 0, 0.22 * c], color: GILT });
});
pb.cyl(0.028, 0.028, 0.27, { bone: 'tome', pos: [0.44, 1.075, 0.24], rot: [Math.PI / 2, 0, 0], radial: 6, color: BRONZE });
pb.extrude(STAR4(0.07), 0.02, { bone: 'tome', pos: [0.44, 1.20, 0.24], rot: [-Math.PI / 2, 0, 0], color: ARCANE, emis: 2.4 });
// ---- arms (flared sleeves, white cuffs)
pb.mirror((S, k) => {
  limb(pb, 0.07, 0.064, [0.23 * k, 1.48, 0], [0.25 * k, 1.19, 0.01], { bone: 'arm' + S, color: ROBE_AR });
  limb(pb, 0.068, 0.11, [0.25 * k, 1.19, 0.01], [0.26 * k, 0.97, 0.02], { bone: 'fore' + S, color: ROBE_AR });
  pb.cyl(0.115, 0.115, 0.045, { bone: 'fore' + S, pos: [0.26 * k, 0.98, 0.02], radial: 8, color: STOLE });
  pb.box(0.11, 0.12, 0.11, { bone: 'hand' + S, pos: [0.26 * k, 0.87, 0.03], color: SKIN_AR });
});
// ---- legs (soft pointed boots)
pb.mirror((S, k) => {
  limb(pb, 0.08, 0.07, [0.10 * k, 0.90, 0], [0.105 * k, 0.49, 0.01], { bone: 'thigh' + S, color: TROUSER_AR });
  limb(pb, 0.072, 0.062, [0.105 * k, 0.49, 0.01], [0.11 * k, 0.12, 0.02], { bone: 'shin' + S, color: BOOT_AR });
  pb.box(0.12, 0.10, 0.24, { bone: 'foot' + S, pos: [0.11 * k, 0.05, 0.05], taper: [0.9, 0.85], color: BOOT_AR });
  pb.cone(0.05, 0.12, { bone: 'foot' + S, pos: [0.11 * k, 0.045, 0.21], rot: [Math.PI / 2, 0, 0], radial: 5, color: BOOT_AR });
});
// ---- rift-key wand
pb.cyl(0.03, 0.036, 0.50, { bone: 'focus', pos: [-0.26, 1.08, 0.06], radial: 6, color: BRONZE });          // y 0.83–1.33
pb.torus(0.055, 0.022, { bone: 'focus', pos: [-0.26, 0.79, 0.06], tubular: 4, radial: 8, color: BRONZE_HI }); // key bow
pb.box(0.10, 0.05, 0.04, { bone: 'focus', pos: [-0.21, 1.24, 0.06], color: BRONZE_HI });                 // key bit
pb.box(0.07, 0.05, 0.04, { bone: 'focus', pos: [-0.225, 1.15, 0.06], color: BRONZE_HI });
pb.extrude(STAR4(0.065), 0.03, { bone: 'focus', pos: [-0.26, 1.39, 0.06], color: ARCANE, emis: 2.8 });   // muzzle
// ---- orbiting glyph-stars
for (let n = 1; n <= 3; n++) pb.extrude(STAR4(0.08), 0.025, { bone: 'glyph' + n, pos: [0, 1.0, 0.52], color: ARCANE, emis: 2.2 });
```
**Emissive** (≈ 4%): wand star, 3 halo stars, tome sigil, bun gem, 3 glyph-stars, eyes, clasp. All are small, star-shaped and in the Arcane shape language.

---

*Next step for the orchestrator:*
1. Build `heroes.js` and `heroAnim.js`.
2. Check each hero in the creature viewer on the three backgrounds (`bg=forest|barrens|river`) at zoom 1 and zoom 3.
3. Run the §7 checklist in game with `?unlockall`, one class at a time.
4. Update creature bible §2.7, as described in §6.6.
