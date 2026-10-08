# Riftbound

An isometric horde-survival action RPG in three acts, built with **Three.js** (WebGL) and no build step.

Pick one of four classes and descend through the Hollow Verge, the Cinder Wastes and the Shattered Crown. Weave the four elements into **six reactions**, fuse spells into **ten evolved forms**, bend your build with **relics**, and dash through telegraphs for **Perfect Dodges**. Shatter the Rift Heart to win.

## Run

ES modules need to be served over HTTP. A zero-dependency PowerShell server is included:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open http://localhost:8080. Add `?unlockall` to the URL to unlock every class and Rift Tier.

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

## Docs
* [DESIGN.md](DESIGN.md): the locked v1.0 game design spec
* [design/PASSES.md](design/PASSES.md): the 10 design passes that produced it
* [ARCHITECTURE.md](ARCHITECTURE.md): module contracts

## Balance simulation
From the browser console:

```js
const { runSim } = await import('/src/dev/sim.js');
await runSim({ classId: 'cryomancer', seconds: 700 });
```
