# RAID.md — v5 contract: Rift Obelisks & raid boss encounters

Design + numbers: `design/RAID_PASSES.md` (the spec; implement it). Research: `design/research/11-raid-boss-mechanics.md`, `12-boss-scores.md`, `13-risk-reward-summoning.md`. General rules: `ARCHITECTURE.md` (no build step, `.js` imports, never create geometry per frame, never add lights, hostile red only for danger, decals in the opaque pass at renderOrder 1–2 etc.), `design/VFX.md` (the `game.vfx` toolkit), `design/ART.md` (creature rig poses).

## File map & ownership (v5)
| File | Owner | What |
|---|---|---|
| `src/game/encounter.js` | core (orchestrator) | Encounter director: summon → Seal → fight → Echo → victory |
| `src/game/bosses/core.js`, `bosses/affixes.js`, `src/game/bosses.js` (facade) | core | `BossBase`, shapes, poise, phases, adds/objects/zones, affixes |
| `src/game/bosses/gorrak.js` + `src/game/creatures/bosses/gorrak.js` | Gorrak agent | script + model/poses |
| `src/game/bosses/vashkar.js` + `src/game/creatures/bosses/vashkar.js` | Vashkar agent | script + model/poses |
| `src/game/bosses/aurelith.js` + `src/game/creatures/bosses/aurelith.js` | Aurelith agent | script + model/poses |
| `src/game/bosses/legacy.js` | frozen | v4 bosses (fallback while a script has `static ready = false`) |
| `src/game/creatures/bosses/common.js`, `creatures/bossModels.js` (facade) | core | shared pose helpers — read-only for boss agents |
| `src/game/obelisks.js`, `src/game/relics.js`, `src/game/meta.js`, `src/game/progression.js`, `src/game/tutorial.js`, `src/dev/sim.js` | obelisks agent | obelisks, stakes, payouts, Boss Relics, Wrath Cache, tips, sim lanes |
| `src/game/arena/*.js` | arena agent | per-biome arena walls |
| `src/ui/hud.js`, `hud-fx.js`, `hud-util.js`, `css/hud.css`, `src/ui/icons/*` | HUD agent | boss frame, poise/cast bars, obelisk UI, icons |
| `src/game/audio.js` (+ new `src/game/audio/*.js`) | audio agent | boss scores + new SFX |
| `game.js`, `spawner.js`, `world.js`, `combat.js`, `enemies.js`, `fx.js`, `pickups.js`, `player.js` | core | ask the orchestrator for changes (report them; don't edit) |

## Flow
1. **Obelisks** rise at 0:50 of each act (`obelisks.js`). Channelling arms stakes in `game.run.stakes`. Haste calls `game.encounter.summon('haste')`.
2. **Summon** (`encounter.summon(reason)`, reason `'timer' | 'haste' | 'dev'`): `game.phase = 'boss'`, arena `{ center, r, r0, zoom }` set on `game.encounter.arena` and `world.setArena()` (soft collision for everything; 4 Rift Crystals at 0.6 R, respawn 18 s), hostile actors removed, the horde dissolves into XP (magnet), spawner/hazards/shrines stop, `obelisks.collapse()`, wall rises 1.5 s, Strain if `stakes.echo`. Emits `encounterStart`.
3. **Boss lands** after 1.5 s, 12 u from the player toward the centre. `game.boss` set; emits `bossSpawned { enemy, final, echo }` + `announce`.
4. **Fight.** Boss death → (Echo armed and not done) **Rift Mend** 3 s (`echoMend`; heal 20%, dash refilled, hostiles cleared) → the Echo spawns (`bossSpawned { echo: true }`), starting at Phase 2 with 55% HP and its own last gate at 50%.
5. **Victory**: `encounterEnd { victory, enemy, final, bossId }`, wall sinks 2.4 s, then `bossKilled { enemy, final }` → Rift Shift (acts I–II) or Victory (act III). The score's resolution plays in that 2.4 s window.

## Stakes (`game.run.stakes`, written by obelisks.js, read by encounter.js; reset per act)
```js
{ haste: null | { at, skipped }, echo: false, heat: 0, affixes: ['frenzied', ...],
  bossHpMult: 1, bossDmgMult: 1,
  chest: { extra: 0, bossRelics: 0 },          // first body's chest
  echoChest: { pool: 'boss', choices: 3 },     // Echo body's chest
  echoAffix: null }                            // optional extra affix for the Echo
```
Chests: `combat.killEnemy` passes `enemy.chestSpec` to the pickup; `game.queueChest(spec)`; `game._openChest()` calls **`rollRelics(game, n, spec)`** with `n = spec.choices ?? stats.chestChoices + (spec.extra ?? 0)` — relics.js must honour `spec.pool === 'boss'` (boss relics only) and `spec.bossRelics` (that many guaranteed boss-tag slots), and keep tag `boss` out of normal rolls.

## Events (new / changed)
| Event | Payload | Notes |
|---|---|---|
| `encounterStart` | `{ bossId, act, arena, stakes, reason }` | the Seal begins (music: cut act theme, riser) |
| `bossSpawned` | `{ enemy, final, echo }` | the landing (music: intro stinger) |
| `bossIntermission` | `{ enemy, index: 1\|2, dur }` | boss untargetable for `dur` |
| `bossPhase` | `{ enemy, phase: 2\|3 }` | end of an intermission (then `bossDowned` reason `winded`) |
| `bossDowned` | `{ enemy, dur, reason: 'stagger'\|'break'\|'winded' }` | |
| `bossRecovered` | `{ enemy }` | |
| `breakCheck` | `{ enemy, name, dur, threshold }` | named cast with a poise threshold |
| `breakCheckEnd` | `{ enemy, name, success }` | |
| `poise` | `{ enemy, amount, src }` | src = reaction type / 'frozen' / 'perfect' / 'crystal' / 'generator' … |
| `bossEnrage` | `{ enemy, level }` | first soft-enrage step |
| `bossImpact` | `{ enemy, pos, heavy }` | every resolved hostile shape (music ducks, SFX thud) |
| `echoMend` | `{ enemy, dur }` | the first body died; the Echo rises after `dur` |
| `encounterEnd` | `{ victory: true, enemy, final, bossId }` | victory beat begins |
| `bossKilled` | `{ enemy, final }` | **now emitted by encounter.js after the victory beat** |
| `obelisksRisen` | `{ obelisks }` | obelisks.js |
| `obeliskChannel` | `{ obelisk, progress }` | throttled (≤ 10 Hz) |
| `obeliskArmed` | `{ type: 'haste'\|'echo'\|'wrath', heat, affix }` | |
| `obeliskCollapse` | `{}` | encounter start |
Boss scripts may also emit `bossTell { enemy, kind, lead }` (big tells: music/SFX accents) and `bossWard { enemy, ward }` (Aurelith).

## Boss fields (HUD / audio read these on `game.boss`)
`name, hp, maxHp, phase (1..3), phases (3), gates [0.66, 0.33] (echo: [1, 0.5]), hpFloor, intermissionIdx (0|1|2), untargetable, downed, downedT, downedDur, exposedT (> 0 = EXPOSED), armor (0..0.9 generator DR), takenMult, poise { v, max, mult (threshold = max × mult), lockT (> 0 = recovering), threshold (Break Check mark, 0 = none) }, cast { name, t, dur, threshold, check } | null, enrage (0 = calm), affixes [defs {id,name,icon,desc}], isEcho, musicState ('p1'|'inter'|'p2'|'inter2'|'p3'), objects (Set of fight objects; obj.marker = true → HUD edge marker, obj.name, obj.hp/maxHp), ward / wardT / wardCycle (Aurelith)`. A legacy boss has only `phase 1|2` and no poise — guard with `?.`.

## BossBase API (src/game/bosses/core.js) — what a boss script uses
```js
class MyBoss extends BossBase {
  constructor(game, pos, opts) {
    super(game, CFG, pos, opts);   // CFG: { id, name, model, hp, radius, speed, stopGap, resist, deathColor,
                                   //        look: { scale, glow: [p1,p2,p3] }, cycle: [gap p1,p2,p3], downed: [4,5,6], enrageAt, turnRate, gates?, windedDur? (3) }
    this.moves = { slam: () => this.mSlam(), ... };   // each returns busy seconds
  }
  rotation(phase) { return ['slam', 'backhand', 'pods', ...]; }  // learnable loop; ready(name) can skip
  intermission(idx) { ...; return seconds; }                     // untargetable; afterwards Winded 3 s
  think(dt, mv) {}   move(dt, mv) {}   visuals(dt, anim) {}      // optional
  onPhase(phase) {}  onDowned(reason) {}  onRecovered() {}  onClearField() {}  onDispose(game) {}
}
```
* **Shapes** (resolve after `lead`; the player is hit if inside then; `o = { dmg (× base), how, onResolve(hit), safe, noEcho }`):
  `circle(at, r, lead, o)`, `cone(origin, dir, angle, r, lead, o)`, `donut(at, inner, outer, lead, o)`, `line(from, dir, len, width, lead, o)`; return handles (`cancel()`, `.mesh` to move a chasing telegraph). `safe: true` draws the gold "go here" style and never damages.
* `ringWave(center, { speed, width, from, maxR, dmg, how, gaps: [{ a, w }] })` — expanding dash-through ring (gaps = safe arcs).
* `zone(pos, 'hostile'|'safe', { radius, inner?, angle?, dir?, life, onInside(dt, z), onEnter, onExit, onExpire, tag })` — persistent decal zone actor; `z.setRadius(r)`, `z.end()`.
* `spawnAdd(typeId, pos, { hpMult, speedMult, goal, goalR, onGoal(game, e), elite, keepOnClear })` — 0 XP; `goal` makes a chaser run to a point (race adds).
* `spawnObject({ pos, radius, hp, mesh, targetable, solid, blocker, onDeath, onHit, update, keepOnClear, name, tag })` — destructible inert fight object (pods, banners, conduits, pillars); `blocker` → `shadowed(p, src)` line-of-sight test. Set `obj.marker = true` for an HUD edge marker.
* **Poise**: automatic from reactions / freeze / stun / perfect dodges / crystal bursts on the boss. Scripts add `this.addPoise(POISE.generator, 'generator')` etc. `breakCheck({ name, dur, threshold, action, onSuccess, onFail })` returns busy time. `down(sec, reason)`, `expose(sec)`, `castBar(name, dur)`.
* Helpers: `play(action, dur, tell, next, peak)` (rig action clock), `world([x,y,z])` (model → world), `face(p)`, `after(sec, fn, keep)`, `seq([[t, fn], …])`, `queue(name)`, `lead(id, base)` (first use × 1.4 — the teaching rule), `firstUse(id)`, `dmg(mult)`, `hitPlayer(mult, how)`, `arenaPoint(angle, frac)`, `this.arena` (`{ center, r }`), `game.encounter.setArenaRadius(r, sec)`, `clearField()`, `own(actor)` (any custom hostile actor: cleared at intermissions/death), `own_mat(m)` (disposed with the boss).
* Timers and pending telegraphs are cancelled by Downed and intermissions (zones and in-flight ring waves stay). Use `after(…, keep = true)` only for clean-up.
* Rig poses: every new move needs a body tell synced to its telegraph. Add actions to your boss's `*_ACT` table in `src/game/creatures/bosses/<boss>.js` — at least **`downed`** (staggered / slumped, readable from the iso camera), **`recover`** (0.6 s), and one pose per new move. Unknown action names are ignored (weight 0) — never leave a move without a pose.

## Readability rules (all agents)
* Hostile = one red (`HOSTILE_RED`), shapes from the shared telegraph shader. Gold `SAFE_GOLD 0xffc83a` (solid rim + diagonal stripes; telegraph `{ safe: true }` / `zone(…, 'safe', …)`) = "go here" only (safe pockets, cleanse pools, shelters, pillar shadows). Never gold for things to kill; dashed rims are crystals / friendly. Dash-through ring patterns ≥ 3.2 s apart. Steel-white `#e8eef8` = stagger/poise.
* Lead times: first use 1.3 s (use `lead()`), normal 0.9 s, announced follow-ups ≥ 0.6 s. ≤ 3 hostile shapes live at once. Dash-through patterns ≥ 2.2 s apart.
* Every add/object states its purpose in a code comment and in the design doc; adds give 0 XP.
* Never instant death; no single hit > `HIT_CAP` (player.js caps it anyway).

## Verification (mandatory for gameplay/visual agents)
* Server: http://localhost:8097/?unlockall (the shots server; already running). **Create your own tab once (`tabs_create`) and pass its tabId on every browser call. Never act on other tabs.** Freeze the real-time loop: `window.requestAnimationFrame = () => 0`.
* `const { jumpToBoss } = await import('/src/dev/sim.js?v=' + Date.now())` → `jumpToBoss(act, { echo, affixes, phase })` returns the boss with the Seal already stepped; then drive `window.__game.update(1/30)` yourself. Stub modals for scripted runs: `g.ui.showLevelUp = (c, pick) => pick(c[0])`, same for `showRelicPick`.
* Frames: `const S = await import('/src/dev/shot.js?v=' + Date.now()); await S.stage({ classId, act, zoom, enemies: false }); … await S.shot('raid-<you>-<what>')` → Read `dev/shots/raid-<you>-<what>.png`. Prefix every shot with `raid-<your-area>-`.
* Check the console (`read_console_messages`, onlyErrors) after every change. A full scripted fight (auto-cast, aim at the boss) must complete without errors.
