# Staging shots

A shot is a scripted, deterministic situation. Viewers get ~2 s per feature, so each frame of it must read instantly: the subject is framed, the action is mid-flow, and the title's claim is visibly happening.

```js
{
  id: 'horde', t0: 1.5,
  setup(P, shot) { P.stage({ hero: 'pyromancer', level: 0, seed: 21, zoom: 0.78 }); P.spawn(MOBS, 220, 6, 20, { hpMult: 14 }); P.warm(0.5); shot.kills0 = P.game.stats.kills; },
  step(P, t, shot) { P.aim(); P.moveScreen(1, 0.25); if (Math.round(t * 60) % 12 === 0) P.spawn(MOBS, 16, 12, 18, { hpMult: 14 }); },
  speed: (t) => 1,          // time ramp (slow-mo < 1)
  dim: (t) => 0,            // darken plate under titles
  filter: (t) => null,      // CSS filter on the plate, e.g. 'blur(3px) saturate(1.15)'
  zoomPost: (t) => 1,       // 2D push-in on the composited plate
  cuts: (shot) => [],       // extra punch/flash at shot-local times (e.g. when an event fired)
  texts: 'all',             // custom fields are fine; read them in your overlay hook
}
```

## A good `P.stage()` does
1. Reseed (`__promo.seed(seed)`) **first**, then reset the game to a clean run.
2. Jump straight to the level/biome/time-of-act you want, without menus or intros.
3. Turn off random spawners and scripted beats (announcements, elite waves, bosses) so the shot controls every entity.
4. Suppress modal UI (level-up cards, chests, tutorials): replace the open-modal method with "consume and continue".
5. Make the hero invulnerable *without* breaking the mechanic you want to show (e.g. let damage through only during the dodge window so the Perfect Dodge still triggers; otherwise drop hits so there's no hurt-flicker).
6. Give the build: abilities at max rank, passives, level (if numbers scale with level).
7. Set camera zoom/offset and snap the camera (no lerp from the previous shot).
8. Reset transient feedback: screen shake, flashes, time scale, hit-stop.

## Recipes

**The horde dies before the shot starts.** Strong builds clear the screen during warm-up. Raise `hpMult` (×5–15), shorten warm-up to 0.5 s, and stream reinforcement waves every ~0.2 s from just off-screen. Measure: on-screen enemy count at t = 0, 1, 2 s and kills per shot (aim for a full screen throughout and a counter that climbs fast).

**A feature needs two things to interact** (element reactions, combos). Spawn a dense pack *close* (r 3–12) with extra HP so statuses stack before death, and give the hero every ingredient at max rank. Listen to the game's event (`reaction`, `combo`) in `setup` and store events in `shot` so titles can show the real thing.

**Boss mid-attack at frame 0.** Spawn the boss at a screen-relative offset, push its attack timer far out, warm a moment, then force the specific attack (`boss.pick = () => 'slam'; boss.attack()`), warm again so the telegraph/charge is visible at t = 0. Push the timer out every step so it doesn't attack again.

**Status tints change the subject** (a frozen boss turns blue, a shocked one yellow). Pick a hero whose element doesn't recolour the subject, or lower its damage.

**Number clutter.** Busy and boss shots: show only crits and labels. Logo/end card: no floating text.

**Event-synced slow motion (e.g. Perfect Dodge).** Start the threat at setup end, trigger the player's response from *game time* (`game.time - threatT >= window`), ramp `speed(t)` down shortly before impact, and record the shot-local time when the event fires (`P.on('perfectDodge', () => shot.eventT ??= shot.t)`). Use `cuts: (s) => s.eventT != null ? [{ t: s.eventT, punch: 0.1, flash: 0.5 }] : []` and key the big title off `shot.eventT`. Then measure the global time once with a still render and hard-code it in the soundtrack cue. Clamp any screen pulse the event triggers (it decays on real dt and lasts ~1/speed longer).

**Screen-relative placement.** In isometric/3D views, convert "right/up on screen" to world offsets with the camera's right/forward basis. Easier to frame "boss above-left of the hero" this way.

**Camera.** Offset the follow target toward the subject (boss, crowd) instead of moving the hero. Use slow zoom drifts (±10% over the shot) and `zoomPost` for punchy 2D push-ins that don't affect gameplay.

**Montage cuts (0.5 s each).** Higher zoom (≈1.5×), 0.9 s warm-up, a dash on the first frames (`if (Math.abs(t - 0.1) < 0.5 / fps) P.dash()`), a different biome/colour per cut for variety.

**End card plate.** Something iconic (final boss) at reduced speed (0.6), dimmed ~0.4 and blurred ~3 px so the wordmark pops.

## Debugging a shot
- `await promo.still(T)` and read the JPEG. It's exact.
- Log state from the console after a still: `P.shot`, entity counts, event times.
- Quick numeric probes: run `P.stage(...)` + loops of `P.tick(1/60)` in the console and count on-screen entities with `P.project()`; compare parameter variants side by side before touching the shot file.
