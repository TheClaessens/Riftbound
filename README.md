# Riftbound

An isometric horde-survival action RPG in three acts, built with **Three.js** (WebGL) and no build step. Everything — the sunny stylized world, the goblins, orcs, trolls and dragons, every animation — is generated procedurally in code: no model or texture files.

Pick one of four classes and fight through the goblin-haunted **Thornwood**, the orc-held **Sunscorch Barrens** and the dragon-nested **Stormwater Reach**. Weave the four elements into **six reactions**, fuse spells into **ten evolved forms**, bend your build with **relics**, and dash through telegraphs for **Perfect Dodges**. Slay Aurelith, the Prism Dragon, to win.

**Play it:** https://theclaessens.github.io/Riftbound/ · **Patch notes:** https://theclaessens.github.io/Riftbound/changelog/ (source: [changelog/index.html](changelog/index.html); newest release on top, also linked from the title screen).

## Rift Obelisks & raid bosses (v5)
* **Rift Obelisks** rise at 0:50 of every act. **Haste** summons the boss now (Windfall XP, shards and an extra relic choice). **Echo** brings the boss back once more, stronger, for a Boss Relic chest. **Wrath** adds boss affixes and a tougher boss for better loot (up to three heats). Stand in a ring for 4 s to arm one. Doing nothing is fine: the boss still comes at 3:00.
* **Raid-style boss fights**: the arena seals around you, the horde turns into XP, and the boss fights alone with its own score. Three phases with intermissions, a **Stagger** bar (filled by reactions, freezes, stuns, perfect dodges and crystal blasts), **Downed** windows, named **Break Checks**, and gold "go here" safe zones.
* **Six Boss Relics** (tag `boss`), offered only by Echo Chests and Wrath heat 3.
* Design: [design/RAID_PASSES.md](design/RAID_PASSES.md) (the passes; Pass 8 is the round-2 tuning) and [design/RAID.md](design/RAID.md) (the implementer contract).

## Run

ES modules need to be served over HTTP (opening `index.html` directly won't work). An internet connection is needed on first load (Three.js and fonts come from a CDN).

* **Any OS with Node.js 18+**: in this folder run `npm start` (no dependencies to install).
* **Windows without Node**: double-click `start.bat`, or run `powershell -ExecutionPolicy Bypass -File serve.ps1`.

Then open http://localhost:8080. To play every class at any Rift Tier, tick **Unlock all** on the title screen (or add `?unlockall` / `#unlockall` to the URL). Switching it off restores your earned unlocks.

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Aim |
| LMB | Class starter skill |
| RMB / Q / E / R | Skill slots |
| Space | Dash (Perfect Dodge: dash just before a hit) |
| T | Toggle auto-cast |
| Wheel | Zoom |
| Esc / P | Pause, build and Codex |
| M | Mute |
| 1–3 / F / X | Level-up: pick a card / reroll / banish |

## Docs
* [DESIGN.md](DESIGN.md): the game design spec (v5)
* [design/RAID_PASSES.md](design/RAID_PASSES.md) and [design/RAID.md](design/RAID.md): the v5 raid design passes and contract
* [design/PASSES.md](design/PASSES.md): the 10 design passes that produced it
* [ARCHITECTURE.md](ARCHITECTURE.md): module contracts
* [design/UI.md](design/UI.md): the v3 "Crownforge" UI spec (tokens, primitives, icons, screens); [design/UI_PASSES.md](design/UI_PASSES.md): the UI design passes

## Balance simulation
From the browser console:

```js
const { runSim } = await import('/src/dev/sim.js');
await runSim({ classId: 'cryomancer', seconds: 700 });
```

Obelisk lanes (v5) and a direct boss fight:

```js
await runSim({ classId: 'cryomancer', seconds: 800, obelisks: ['haste@90', 'echo', 'wrath:2'] });
const { jumpToBoss } = await import('/src/dev/sim.js');
jumpToBoss(1, { echo: true, affixes: ['frenzied'], phase: 2, god: true });
```

## Visual tech (v2)
* **Creatures**: procedurally modelled low-poly creatures on a GPU-instanced rig (one draw call per creature type, bone matrices in a float texture, procedural animation, inverted-hull outlines, blob shadows). See `design/ART.md`.
* **World**: data-driven biomes in `src/game/env/` — terrain splat shader, camera-following wind-blown grass and flowers, swaying foliage, stylized water and waterfalls, cloud shadows and haze.
* **Look**: Neutral tone mapping, peak-channel bloom (only real HDR glows), blend-add VFX tuned for bright ground.
* Creature viewer: http://localhost:8080/dev/creatures.html?set=greenskins&zoom=2 (sets: greenskins, warband, wyrmkin, bossModels).
* Research behind it: `design/research/01–04`. The v1.0 (dark) build is archived in `backup/riftbound-v1.0.zip`.

## UI (v3 "Crownforge")
* The UI is the reliquary of the shattered Riftcrown: chamfered rift-iron plates, crown-bronze bezels, the four Primes as gems, a prism crack for crown moments. Fonts: Grenze Gotisch / Grenze / Alegreya Sans (SC).
* ~95 hand-authored SVG icons in one sprite (`src/ui/icons/`), no emoji. Gallery: http://localhost:8080/dev/icons.html?filter=relic- · primitives: http://localhost:8080/dev/ui-kit.html
* UI harness (console): `const U = await import('/src/dev/uishots.js'); await U.hud({ act: 2, boss: true, chain: 30 }); U.levelUp(); U.relicPick(4); U.pause('codex'); U.title(); U.victory();`
* Research behind it: `design/research/05–07`. The v2.1 UI is archived in `backup/riftbound-v2.1-preui.zip`.

## Heroes + spell VFX (v4)
* **Heroes** are rigged characters on the same instanced rig as the monsters. Each class is one order of Vael:
  * Cinderwright Pyromancer
  * Stillwater Warden Cryomancer
  * Tempest Rider Stormcaller
  * Loomwarden Arcanist

  They have a twin-stick aim split (legs follow the movement, chest follows the aim), stance-plus-recoil rapid casting, heavy/throw/nova/dash poses, death into a Rift recall, and victory. The selected hero stands in the world on the title screen. Code: `src/game/heroes/`. Contract: [design/HEROES.md](design/HEROES.md).
* **Spell VFX**: every ability is drawn as a real phenomenon. `game.vfx` (`src/game/vfx/`) provides:
  * stateless GPU particles with an ink-outlined sprite atlas
  * debris
  * noise shells
  * one-draw ground decals
  * ribbons and forked bolts
  * toon clouds
  * enemy status looks in the rig shader

  Per-element looks live in `vfx/elements/*` and hero effects in `vfx/hero/*`. Contract: [design/VFX.md](design/VFX.md).
* Hero viewer: http://localhost:8080/dev/creatures.html?set=../heroes/pyromancer&poses=idle,run:1.6,strafe:1.6,shot:0,heavy:0.36,dash:0.5,death:0.6,victory:1
* Headless frames (pane hidden): start the `riftbound-shots` server (port 8097), open http://localhost:8097/?unlockall, then run `const S = await import('/src/dev/shot.js'); await S.stage({ classId: 'cryomancer', act: 0 }); await S.castAt('blizzard', 5, 4, -2); S.step(1); await S.shot('blizzard')`. Frames are saved to `dev/shots/`.
* Design passes: [design/HERO_PASSES.md](design/HERO_PASSES.md). Research: `design/research/08–10`. Before/after frames: `design/shots-v4/`. The v3.0 build is archived in `backup/riftbound-v3.0-preheroes.zip`.
