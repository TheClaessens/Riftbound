# Riftbound v2 — Visual Overhaul Contract

The game moves from a dark night look to a **vibrant, sunny, open fantasy world**: Act I **The Thornwood** (forest), Act II **The Sunscorch Barrens**, Act III **The Stormwater Reach** (riverlands). Abstract enemies become **goblins, trolls, spiders, orcs, wargs, ogres, boars, dragons, wyverns, drakes, naga, kobolds**.

* Creature design bible (what every creature looks like, parts, palettes, animation): `design/research/03-creature-art.md`. **Follow it.** Where this file and the bible disagree on *API*, this file wins.
* Rig code: `src/game/creatures/rig.js` (PartBuilder, defineCreature, Pose, helpers), `src/game/creatures/renderer.js` (instancing, handles), `src/game/creatures/index.js` (registry).
* Viewer: `http://localhost:8080/dev/creatures.html?set=<module>&poses=...` (see header of `src/dev/viewer.js`).

## 1. Creature module layout
```js
import { defineCreature, TAU, clamp01, smooth, bump, strikeCurve } from './rig.js';
export const goblinGrunt = defineCreature({ id: 'goblinGrunt', stride, bones, build(pb, B) {}, animate(P, s, B) {}, muzzle?, blob?, deathTime?, gradient? });
export const REGISTER = { husk: goblinGrunt, ... };   // enemy type id → def
```
* Faces **+Z**, Y up, feet at y = 0, metres. Creature's **left = +X** (bones `...L`), **right = −X** (`...R`). Weapon hand = right (−X).
* Size the model to the bible's metric proportions (they are scaled to the collision radius). Elites are scaled ×1.35 by the game; don't pre-scale.

## 2. Bones
`bones: [{ name: 'root' }, { name: 'hips', pivot: [x, y, z] }, { name: 'spine', parent: 'hips', pivot: [...] }, ...]`
* Pivots are in **model space** (rest pose). A parent must be listed before its children. Default parent = root.
* ≤ 16 bones for regular enemies, ≤ 32 for bosses.
* Parts are authored in **model space** at their rest position (NOT relative to the bone pivot — convert the bible's "rel. bone" positions by adding the pivot). Each part names its bone.

## 3. PartBuilder (`pb`)
All methods take `o = { bone, color, pos:[x,y,z], rot:[x,y,z], scale: n | [x,y,z], emis, trim, eliteOnly, flat }` (rot is XYZ euler radians, applied before translation; scale applied first).
| Method | Notes |
|---|---|
| `pb.box(w, h, d, o)` | `o.taper=[sx,sz]` scales the top face, `o.bottom=[sx,sz]` the bottom face, `o.shift=[dx,dz]` shears the top face |
| `pb.sphere(r, o)` | `o.seg=[w,h]` (default 8×6). Ellipsoids via `scale`. `o.thetaLength` for domes |
| `pb.blob(r, o)` | icosahedron, `o.detail` 0/1, `o.jitter` (fraction of r) + `o.seed` for lumpy organic shapes |
| `pb.cone(r, h, o)` | points +Y, centred; `o.radial` (default 6) |
| `pb.cyl(rTop, rBottom, h, o)` | along Y, centred; `o.radial` (default 7) |
| `pb.capsule(r, len, o)` | along Y; `o.cap`, `o.radial` |
| `pb.lathe([[r,y],...], o)` | around Y |
| `pb.extrude([[x,y],...], depth, o)` | shape in XY, extruded along Z (centred) — blades, wing membranes, ears |
| `pb.torus(r, tube, o)` | `o.arc`, `o.tubular`, `o.radial` |
| `pb.geo(bufferGeometry, o)` | anything else |
| `pb.mirror((side, sign) => ...)` | side 'L' (+X, sign 1) then 'R' (−X, sign −1) |
* **Colours** are sRGB hex. Matte parts get an automatic top-lit value gradient (feet ×0.70 → top ×1.08; disable with `gradient: false` or set `gradient: [lo, hi]`).
* **Emissive** (`emis`): accent/tell parts only (eyes, orbs, crystals, fuses, pustules). Authoring value **2–3**. In game: emitted = colour × emis × (0.35 + 1.6 × glow). So idle accents are subdued (no bloom) and wind-ups (glow → 1) bloom. Keep glowing area ≤ 5 % of the surface.
* **Elites:** `trim: true` parts (the bible's **(T)** parts) turn gold on elites. `eliteOnly: true` parts (crowns, plumes, banners) only appear on elites. Every creature must have ≥ 2 trim parts and 1 elite-only crown/plume part.
* **Wards** recolour the emissive parts to the ward element automatically (accent override). Nothing to do.
* Flat shading is the default (`flat: false` for smooth parts, e.g. bellies).
* Budgets: swarmers ≤ 350 tris, regular ≤ 800, bosses ≤ 4000 (the viewer prints triangle counts).

## 4. animate(P, s, B)
Called every frame per instance. **No allocations.** Write the pose with `P.rot(B.bone, x, y, z)`, `P.move(B.bone, x, y, z)` (metres), `P.scale(B.bone, sx, sy, sz)`; calls accumulate (rot/move add, scale multiplies). Rotation is local around the bone pivot, XYZ euler. Child bones inherit.
`s` fields:
| Field | Meaning |
|---|---|
| `s.t` | per-instance time (s); stops while the enemy is frozen |
| `s.walk` | gait phase in radians; advances `2π` per `stride` metres actually moved (no foot sliding) |
| `s.move` | 0..1 smoothed "is moving" |
| `s.speed` | current ground speed m/s |
| `s.action`, `s.k` | current action and its 0..1 progress (table below) |
| `s.hit` | 1 → 0 over ~0.17 s after taking damage (recoil) |
| `s.seed` | 0..1 per-instance random (desync idles) |
| `s.dying` | 0..1 during the death topple (the renderer already tips/sinks the whole body; you may add a flourish) |
| `s.h` | the handle (read-only use: `s.h.glow`, `s.h.elite`) |

Actions sent by `enemies.js` (k = 0..1 progress):
| Archetype | Action | Meaning |
|---|---|---|
| all melee (chaser, swarmer, tank, splitter, support/ranged if touching) | `'attack'` | 0.5 s swing that **starts when the hit lands**: make the strike land at k ≈ 0.08–0.2 (fast raise k 0→0.08, chop 0.08→0.2, recover 0.2→1) |
| ranged | `'cast'` | k 0→0.7 = 0.4 s wind-up (raise staff / rear head; glow ramps automatically), k 0.7→1 = 0.25 s release/thrust after the shot |
| charger | `'windup'` (0.7 s: paw the ground, lower head), `'charge'` (k = distance fraction, full gallop), `'recover'` (1.2 s: skid, shake head) |
| bomber | `'fuse'` | 1 s fuse before exploding: lift the keg, frantic run-in-place, shake harder as k → 1 |
| blinker | `'blink'` (0.5 s telegraph before teleport: wings snap up, coil), `'arrive'` (0.35 s after teleport: wings spread, land) |
| support | `'cast'` | 0.6 s barrier pulse: raise totem, slam it down at k ≈ 0.4 |
Flyers hover by moving their body bone up (the game keeps `pos.y = 0`; the blob shadow stays on the ground).

## 5. Optional spec fields
* `muzzle: [x, y, z]` — model-space point where ranged projectiles spawn (staff orb, mouth). Ranged creatures must set it.
* `blob: r` — blob shadow radius (default from the footprint).
* `deathTime: s` — corpse time (default 0.55; bosses ~1.6).
* `stride: m` — metres per full gait cycle.

## 6. Verification (mandatory)
Open your **own** browser tab (`tabs_create`, then `navigate` that tabId); never touch other tabs. In the viewer check, for every creature:
1. `zoom=1` on its biome `bg` (forest / barrens / river) — the real play scale: silhouette, value contrast, facing, size vs the reference mage on the left.
2. `zoom=3` close-up with `poses=idle,walk:0,walk:1.57,walk:3.14,<action>:<k>...` — every action at several k.
3. `rim=elite` (gold trim + elite-only crown), `ward=frost`.
4. `yaw=3.14` (back) and `yaw=1.57` (side).
Run the bible's §8 approval checklist. Iterate until it is genuinely good: chunky, readable, charming, not abstract.

## 7. Shading notes (rig v3)
* Material is **MeshLambert** (matte) with a top-masked fresnel rim, plus a **1.6 px dark inverted-hull outline** on every creature (one extra instanced draw per type, extruded along welded smooth normals). Disable per creature with `outline: false` (only if it genuinely looks wrong, e.g. hair-thin parts).
* Thin parts (< 0.05 m) get swallowed by the outline at play scale — make them chunkier or skip them.
* Degenerate triangles are dropped and mirrored (negative-scale) parts keep correct winding automatically.
* Tone mapping is Neutral at exposure 1.3; bloom triggers only on peak-channel HDR > 1.1 (so only glowing accents during wind-ups bloom).
