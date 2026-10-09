# Riftbound v4 — Hero contract (implementers)

Heroes are built on the **creature rig** (same look as the monsters). The art and animation spec is **`design/research/09-hero-bible.md`**. Follow it: appendix A–D give bones, palette and paste-ready parts, and §4 gives every key pose. Where this file and the bible disagree on **API**, this file wins.

## Files
| File | Owner | What |
|---|---|---|
| `src/game/heroes/hero.js` | orchestrator | `defineHero`, the layer writer `L`, `pose()`, `keys()`, `twoKey()`, shared layers (`rest`, `idle`, `gait`, `aimTwist`, `wind`/`cloth`, `hit`, `deathCommon`, `stomp`) |
| `src/game/heroes/index.js` | orchestrator | `HEROES` registry, `HeroModel` controller (writes `h.hero` channels), ground ring + aim notch |
| `src/game/heroes/mannequin.js` | orchestrator | placeholder + the minimal reference `animate()` pipeline |
| `src/game/heroes/pyromancer.js` · `cryomancer.js` · `stormcaller.js` · `arcanist.js` | one implementer each | `export const <class>Hero = defineHero({...})` |
| `src/game/creatures/rig.js`, `renderer.js` | orchestrator | PartBuilder, shader, renderer (`boneWorld`, `track`, `hidden`, `outlinePx`, `renderOrder`) |

A class file may define private helpers and constants. It must not edit any other file. Report needed shared changes instead.

## defineHero(spec)
```js
export const pyromancerHero = defineHero({
  id: 'heroPyromancer',
  bones: [...],                 // bible appendix. MUST include the 18 core bones (names fixed):
                                // root hips spine chest head armL foreL handL armR foreR handR focus thighL shinL footL thighR shinR footR
                                // ≤ 32 bones total; extra bones are free-named (hood, beard, pack, chimney, shard, tome, halo…)
  stride: 1.95,                 // bible table
  gait: { A, K, bob, lean, arm, hy, focusArm },   // bible §4.4 table (focusArm = swing scale of the focus arm, default 0.5)
  castHands: 'alt' | 'R',       // 'alt': starter shots alternate focus hand / off hand (Pyromancer); default 'R'
  muzzle: { bone: 'focus', at: [x, y, z] },    // model-space point of the focus emitter (rest pose) — spells' visual origin
  hand:   { bone: 'handL', at: [x, y, z] },    // off-hand palm (used when castHands = 'alt' on even shots)
  emitters: { chimney: { bone: 'chimney', at: [0, 2.0, -0.36] } },   // named world points for idle FX (bible §5)
  build(pb, B) { ... },         // parts in MODEL space at rest (see design/ART.md §3; PartBuilder API in rig.js)
  animate(L, s, B, H) { ... },  // layered pose writer, stateless, NO allocations
});
```
Emissive: `emis: 2–3` = accent parts that take the **last-cast element** (accent override) and pulse with the glow channel (baseline 0.45, +0.9 on each shot). Use **negative emis** (e.g. `emis: -1.8`) for glows that must keep their own colour (eyes, coal window, chimney mouth). Keep glowing area ≤ 5 %.

## animate(L, s, B, H)
`s` is the creature anim state (`s.t`, `s.walk`, `s.move`, `s.speed`, `s.hit`, `s.seed`). `H` holds the hero channels (all always present):

| Channel | Meaning |
|---|---|
| `aimRel` | aim yaw relative to the root (rad). The root faces the aim while `casting` |
| `moveRel`, `psi`, `mu`, `back` | move yaw vs root, lower-body yaw ψ (±0.7), local move angle μ in the hips frame, backpedal frame |
| `moving` 0..1, `sp` 0..1, `standing` 0..1 | locomotion weight, speed / 6.5, 1 − moving (use as `lowerW` for full-body action keys) |
| `hold` 0..1, `shot` 1→0, `shotN` | starter stance weight, per-shot recoil (τ 70 ms), shot counter (`shotN & 1` alternates hands) |
| `casting` | the root is on the aim (stance, recent cast, or an action) |
| `act`, `k` | `''` \| `'throw'` 0.4 s \| `'heavy'` 0.55 s \| `'nova'` 0.45 s \| `'channel'` (k loops 0..1) \| `'dash'` (dash dur + exit) \| `'arrive'` 0.32 s (after a blink) \| `'death'` 1.4 s (holds k = 1) \| `'victory'` 1.6 s (holds k = 1: loop a calm variant on `s.t`) |
| `dashN` | dash counter (Stormcaller mirrors alternate dashes) |
| `meter` 0..1, `armor` 0..3 | class meter (Pyro: burning foes within 6 u / 5 · Cryo: armor / 3 · Storm: Momentum / 100 · Arcanist: Chain / 25), Frost Armor charges |
| `fidget` 0..1, `fidgetN` | idle flourish progress (0 = none, ~1.2 s), counter (alternate fidgets) |
| `stomp` 1→0 | footfall squash pulse |
| `perfect` 1→0 | after a Perfect Dodge (the controller already sets the green accent) |

Layer writer: `L.add/mv/scl` (additive), `L.put/putM/putS(b, x, y, z, w)` (blend toward an absolute key), `L.get(b, axis)`. Key poses: `const K = pose({ armR: [rx, ry, rz], 'hips.m': [mx, my, mz], 'root.s': [sx, sy, sz] })`, `keys(L, B, K, w, lowerW)`. Envelope: `const [w1, w2] = twoKey(k, t1, t2, tHold)`. Then `keys(L, B, K1, w1, lowerW); keys(L, B, K2, w2, lowerW)`.

Recommended order (bible §4.1): `rest(L, B, CLASS_REST)` → `idle(...)` → `gait(L, s, B, H, GAIT, freeArms)` → `aimTwist(L, s, B, H)` → cloth/secondary (`cloth()`, `wind(H)`) → stance + recoil (`keys(STANCE, H.hold)` + recoil adds × `H.shot`) → action keys (`H.act`) → dash/arrive → `stomp` → `hit(L, s, B, clothBones)` → death keys + `deathCommon(L, B, H.k)` / victory. See `mannequin.js` for a minimal working pipeline.

**Moving vs standing.** While running, an upper-body action uses w = 1 on the arms and chest and ×0.6 on the spine, and the legs keep running. `keys()` does this when you pass `lowerW = H.standing`.

## The controller gives you (don't re-implement)
Root yaw (aim while casting, movement otherwise; dash direction while dashing), the ψ/μ split with hysteresis, the stance and recoil timers, action timers, fidget scheduling, the class meter, last-cast element accent (0.9 s), Perfect Dodge accent, glow baseline + shot pulse, element-hi rim (0.45), 2.0 px outline, i-frame tint pulse (the hero never disappears), the ground ring with its aim notch drawn **under** the hero, the blink hide (0.06 s) before `arrive`, Rift recall tint (k > 0.75), and world points `player.muzzle(out)`, `player.hand(out)`, `player.model.emitter(name, out)`.

**Idle element FX** (bible §5: chimney embers, hem frost, tine arcs…) are spawned by `src/game/vfx/heroFx.js → HERO_FX.update(game, player, dt)`, owned by the VFX implementer, using your `emitters`. List every emitter you define in your final report.

## Budgets
≤ 32 bones · ≤ 2,500 tris (the viewer prints them) · emissive ≤ 5 % · no part thinner than 0.05 m · identity features ≥ 0.2 m · no allocations in `animate` · reserved colours never as fields (lime `#b8ff3c`, spirit teal `#1fe0c2`, prism-white emissive, elite gold `#ffc93a`, magenta `#ff2a6d`, telegraph red).

## Verification (mandatory)
Shots server: `http://localhost:8097` (launch config `riftbound-shots`). Use **your own browser tab** (`tabs_create`, then always pass that tabId). Never touch other tabs. The pane is usually hidden. Never trust the pane's own screenshot; save frames with `shot()` and **Read the PNG**.
1. **Viewer:** `/dev/creatures.html?set=../heroes/<class>&layout=rows&zoom=…&bg=forest|barrens|river&poses=…` then in JS: `await new Promise(r => setTimeout(r, 2000)); await window.shot('<class>-<what>')` → Read `dev/shots/<class>-<what>.png`. Re-render without reloading: `await view({ poses: '…', zoom: '3', yaw: '1.57' }); await shot('…')`.
   - zoom 1 (real play scale) on all 3 backgrounds; zoom 3 close-ups; `yaw=1.57` and `yaw=3.14`.
   - poses `idle,walk:0,walk:1.57,run:3.14,strafe:1.6,diag:1.6,back:1.6,hold,shot:0,shot:0.5,throw:0.2,throw:0.35,heavy:0.18,heavy:0.36,heavy:0.6,nova:0.25,nova:0.4,channel:0.3,dash:0.15,dash:0.5,arrive:0,arrive:0.3,death:0.3,death:0.6,death:0.85,victory:0.4,victory:1,fidget:0.5`. Params `aim=0.5`, `meter=1`, `armor=3`, `dashN=1`.
2. **In game:** open `http://localhost:8097/?unlockall` in your tab, then:
   ```js
   const S = await import('/src/dev/shot.js?v=' + Date.now());
   await S.stage({ classId: '<class>', act: 0, zoom: 1.6 });      // god-mode run, HUD hidden, pinned 1280×720
   __game.player.botMove = { x: 1, z: 0 }; S.step(0.6);          // run; botMove null to stop
   await S.castAt('<skill>', 3, 4, 2); S.step(0.2);               // cast at an offset (any skill id)
   await S.shot('<class>-ingame', { around: __game.player.pos, size: 6 });   // crop around the hero
   ```
   Check acts 0/1/2 (`act: 1` …), among enemies, and read console errors (`read_console_messages`).
3. Run the bible §7 checklist. Iterate until it's genuinely good (chunky, readable, charming, clearly the hero, clearly *this* class).
4. Testing only changes `meta.lastClass` (harmless). Don't change other settings or save data.

## Lessons from the Pyromancer (the quality bar: read `src/game/heroes/pyromancer.js` first)
- **Torso entries in stances and actions are additive.** `keys()` puts absolute values; on chest and spine that erases the aim twist and the gait. Use `addKeys()` for chest, spine and head-yaw deltas and `keys()` for limbs. The Pyromancer's pattern is `key2(put, add)` plus `applyKey` / `action2`.
- **Bible sign errors** (verified visually):
  - In §4.9, cloth driven by legs uses `+k·min(thigh.rx, 0)`, because +rx swings a hanging part back.
  - Things that lean back in wind or dash (chimney, plumes, hat tips) take a **negative** rx when they stand up from the body. Check every secondary-motion sign in the viewer.
  - Some K1 keys need the arms' rz inward so the hands meet.
- **Scale.** Next to the 1.8 m orcs the bible's sizes looked small. The Pyromancer is scaled ×1.12 (stride too), so the hero stands tallest. Aim for the hero being the tallest humanoid on screen (about 2.1–2.35 m top).
- **Silhouette.** An asymmetric silhouette helps (fist low-right, chimney high-left). Each hero needs one oversized signature read at 50 px.
- **Emitters.** Name them in `emitters`; the VFX owners use them for idle FX:
  - Pyromancer: `chimney`, `palm`, `coal`, `knuckles`, `door`, `footL`, `footR`, `hand`
  - Cryomancer (expected): `crystal`, `hem`, `footL`, `footR`
  - Stormcaller (expected): `tineL`, `tineR`, `hatPin`, `footL`, `footR`
  - Arcanist (expected): `wand`, `tome`, `halo`, `footL`, `footR`
- **Tooling.**
  - `S.castAt(id, rank, dx, dz, slot?)` now also plays the hero cast pose (`model.cast`) and the cast flash, and aims the hero.
  - The viewer has `shotN=1` for odd starter shots.
