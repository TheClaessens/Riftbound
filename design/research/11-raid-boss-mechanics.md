# 11 - Raid-style solo boss mechanics for Riftbound

Scope: boss spawn = horde removed, boss becomes an isolated encounter. Research (MMO raids, Souls/Hades, Lost Ark/GW2 breakbars) translated for a single isometric mage (move 6.5 u/s, Phase Step blink 5.5 u with i-frames ~0.16-0.3 s, perfect-dodge window 0.25 s, 4 elements, reactions, bosses cap freeze 0.6 s / stun 0.3 s). Sources are numbered [n] and listed at the end. Where a claim is my own design inference rather than sourced, it is marked (inf.).

## 1. TL;DR

1. The MMO toolbox is small: telegraphed shapes + timed debuffs/positions + a damage-window economy. Our job is to keep the shapes and the "phase = new rule" structure, and delete everything that needs a second human [1][7].
2. Solo translation rule: every "N players do X" becomes "you do X, in sequence, against a timer" (soak towers -> one tower per cast, spread -> chasing circles, stack -> a puddle you must stand in). Mechanics that need role split, tether-to-another-player, tank swaps or healer checks are dropped.
3. Positioning must matter more than dodging: the dash is a panic button (1 charge, ~2.4 s), not the answer. Design every pattern so the correct answer is "stand here before it starts" (pillars, safe quadrants, puddles), with the dash as the correction layer.
4. Adds exist only as mechanics: race adds (kill before they reach the boss/banner), generator adds (shield/ward), puddle adds (death leaves a zone you need), debuff carriers. No filler adds, no horde.
5. Stagger is our headline reward: a visible Poise bar filled by REACTIONS (not raw dps) and by perfect dodges; full bar = boss Downed 4-6 s, +40% damage taken. This converts the mage's whole identity into the tactical layer (section 4) [3][4][5][6].
6. Boss CC caps stay (freeze 0.6 s, stun 0.3 s) but CC now adds Poise instead of being wasted (GW2 "hard CC damages the bar" model [3]).
7. 3 phases, HP-gated at 66% / 33%, with an 6-9 s intermission between: boss untargetable, arena-wide set-piece, ends in a guaranteed free-damage window (Hades absorbs overkill between phases so phases cannot be skipped [8]).
8. Teach with the "rule of three": introduce alone with long, generous telegraphs -> combine -> overlap/speed up. At most 2 new mechanics per phase [9].
9. Soft enrage only (cycle gap shrinks, arena creeps) with a distant hard backstop ~2x target time, to stop kite-stalling [10][8].
10. Arena: yes, a closed ring wall at r 24-28 (not the full r 55), raised on spawn, no instant-death edge; Act III gets one shrink step. Show with ground ring + rising themed wall + edge fade.

## 2. Telegraph and colour grammar (applies to every mechanic below)

Fixed by the project: hostile = red 0xff2a3d; enemy shots = magenta 0xff2a6d. Proposed additions so a player can parse "avoid / do / hit" instantly (inf.):

| Meaning | Colour / style | Notes |
|---|---|---|
| Avoid this area | red 0xff2a3d, fill-in animation: thin outline at t=0, solid fill grows to the edge (or radial from the centre) exactly at the hit time | one shared telegraph primitive; never use element colours for hostile areas |
| Lingering hostile zone | same red, dimmer, slow noisy pulse, particles rising | "stay out" |
| Go here / safe pocket / puddle you need / soak | warm white-gold 0xffe9a8, thick double ring + chevrons pointing in + rising motes | solid, never dashed (dashed element rings are already the Rift Crystal blast radius) |
| Hit this (adds, banners, conduits, pods) | white corner brackets + a tiny HP bar + a thin gold line to what it feeds (boss) | the line shows PURPOSE: "this feeds the boss" |
| Stagger/Poise bar | steel-white plate, amber fill, under the boss nameplate; pulsing when a break check is live | only bar not red/element coloured |

Shape vocabulary (one meaning each, so the shape alone teaches the answer):
* Circle = impact point, leave. Filled circle with centre dot = delayed memory/detonation marker.
* Line / rectangle = lane or beam; safe = off the lane or behind a pillar.
* Cone = cleave; safe = behind or beside the boss, or inside min range.
* Donut / ring (inner safe) = "get in"; inverse (inner hostile) = "get out". Always draw the safe region lightly gold-tinted so the ring is unambiguous (FFXIV donuts are confusing without this [1]).
* Expanding ring front = dash-through (existing FlameRing).
* Minimum telegraph lead: 1.2 s on first appearance of a shape, 0.9 s normal, 0.6 s only for chained follow-ups that were already announced. At 6.5 u/s a mage covers ~6 u in 0.9 s, which is the radius of a typical circle (r 5) - so 0.9 s is the "walk out" floor; shorter forces a dash. Elden Ring's own critics hate unreadable delayed attacks and too-short telegraphs [8], so keep delayed ones announced by a clock ring.
* Boss rig: every attack has a wind-up pose that begins at telegraph start and an "impact" pose on resolve (existing `_play(tell)` glow ramp). Add a held "commit" pose for 0.15 s before impact so perfect dodges are possible.

## 3. Catalogue of ~20 raid mechanics

Fit key: A = great solo, B = fine with changes, C = poor fit (use only in a reduced form or skip).

**1. Stack / share damage - C (reduced form: "Shelter Puddle")**
* MMO: group gathers in one spot to split a big hit [1].
* Solo: nobody to share with. Reduce to a gold puddle that appears for a few seconds during a raid-wide "Nova": inside = survive; outside = lethal-ish. Effectively a safe-spot mechanic.
* Read: gold ring appears BEFORE the red full-arena flash; countdown ring shrinks.
* Knobs: puddle count, radius (r 3.5 -> 2.5), time to reach (2.0 -> 1.2 s), position (near boss vs far).
* Mage: dash to puddle; frost slow on the boss does not matter; a Rift Crystal near it is a tempting trap (bait).

**2. Spread / "don't overlap" - B (as "Chasing circles")**
* MMO: each player gets a circle and must run apart so AoEs do not overlap [1].
* Solo: you are the only target, so the circles trail you: 3-5 circles drop at your position every 0.5 s and detonate 1.5 s later (mechanic 17 is the same family). Forces constant movement and punishes standing to cast.
* Read: red filled circle with clock ring; each a different phase of fill so overlap-timing is visible.
* Knobs: lead time, count, circle radius.
* Mage: auto-aim spells keep firing while moving; kiting is the mage's baseline so this is a tempo check not a punishment.

**3. Soak tower - B (as single timed tower)**
* MMO: towers that need N players inside, else a raid-wide wipe; sometimes ordered by debuff [1].
* Solo: one gold tower appears at a ring position (r 3) with a 6-8 s fuse and a visible meter. Stand in it to "soak": consume it for a reward (Poise damage on the boss, a buff) instead of a wipe-level failure. Failure = a big but survivable arena hit. This is a "pickup under pressure" while the boss is already attacking.
* Read: gold column of light + countdown ring; boss pose points at it.
* Knobs: fuse, tower distance from the safe route, simultaneous towers (2 at opposite sides = choose one).
* Mage: you cannot cast stationary spells at range while crossing the arena - a real cost; dash lets you shave 2 s off the run.

**4. Donut / in-out - A**
* MMO: boss weapon indicates the shape: axe = point-blank AoE, scythe = donut [1]. Often chained "out then in".
* Solo: ideal. Disclose the first shape, show the second 0.3 s later. Standing at the mid distance is a trap unless gold fill marks the correct one.
* Read: red band with gold-tinted safe interior/exterior; weapon pose telegraphs which (axe overhead = out zone; axe sweep = ring).
* Knobs: ring thickness, chain length (2 -> 4), gap between the pair.
* Mage: ranged playstyle sits outside; donut punishes the lazy outer position so the mage must periodically close in = built-in risk/reward. Dash i-frames to cross a thin ring.

**5. Cleave with safe side (cone) - A**
* MMO: frontal/rear cone; "behind the boss is safe" is the classic positioning rule [1].
* Solo: boss turns at a limited rate (e.g. 90 deg/s) so the safe side is gained by orbiting. Boss rotates slowly during a tell, then locks: "face lock" 0.3 s before swing.
* Read: wide red cone with a thin gold wedge at the rear/sides when in the "safe side" variant.
* Knobs: cone angle (90 -> 180 -> 270 deg), turn rate, back-hand follow-up on the opposite side.
* Mage: orbit-kiting is natural; the rear arc also lets you stand "in melee" for point-blank burst. Frost chill (-12% speed per stack) slows rotation if the boss turn speed is tied to speed (inf.).

**6. Line of sight behind pillars - A (the signature positioning mechanic)**
* MMO: line-of-sight (LoS) mechanic: hide behind a pillar from a gaze/beam/nova; pillars sometimes break [1].
* Solo: 3-5 pillars (r 1.2) on the arena; beams/novas are blocked by them; the shadow behind is safe. Pillars have 3 hits of HP (boss attacks chip them) so the arena erodes over the fight.
* Read: pillar silhouette with a faint gold "shadow wedge" drawn on the ground during the tell; red beam stops at the pillar with a spark.
* Knobs: pillar count, how fast they crack, nova duration.
* Mage: spells are also blocked by pillars (projectile collision) - brief but real downtime; arcane homing or aimed skills choose angle.

**7. Puddle baiting / placement - A**
* MMO: a debuffed player drops a hazard puddle at their feet when it expires; you drag them to the edge so the raid is not trapped [1 (tethers/debuff timers)].
* Solo: "Seeds" chase you; when popped (or when the timer ends) they leave a lingering hostile puddle at that spot. You choose WHERE: kite them to the rim/corner and clip the boss' area so the puddle becomes a zone-denial against the boss's charge path. Also "positive puddle" version: an add you kill leaves a gold pool that cleanses a debuff (mechanic 11).
* Read: seed = magenta orb with a red clock ring; puddle size preview as a faint ring around it.
* Knobs: seed count, speed, puddle lifetime (6 -> 10 s), puddles accumulate (arena fills = soft enrage).
* Mage: AoE reactions pop seeds from range - place puddles far from where you need to stand.

**8. Tether - B (reduced: boss-to-player and boss-to-adds)**
* MMO: link between players that must be stretched or crossed; breaks by distance [1].
* Solo: a tether between you and a Banner/Conduit/pod: if you stray beyond L the link snaps (bad) OR you must stay beyond L to stop a pulse. Use sparingly: forces a leash radius around a fixed point.
* Read: thin gold line while safe, turns red at 85% of max length with a hum, pulses to indicate pull.
* Knobs: leash length, pull force (slow pull 2 u/s - counterable by dash).
* Mage: dash cancels a pull; a tether-"drag" fights the mage's preferred max range (a feature).

**9. Knockback into wall / edge - B (never instant death)**
* MMO: knockback toward arena edge is lethal unless immune or backed by a barrier [1].
* Solo: wall slam deals 25% max HP + 0.6 s stun, never an instant kill (we have no raid-wipe tolerance). Safe "anchor" = stand with a pillar behind you, which stops the push; or dash i-frames through the shove.
* Read: red arrow chevrons along the push direction from the boss; the stop distance (u) displayed as an arrow length; gold anchor pillars.
* Knobs: push distance (8 -> 16 u), tell time, edge damage.
* Mage: a perfect dodge cancels the push; storm Overload knockback on the boss does nothing (bosses immune to knockback) - keep that rule.

**10. Arena shrink / hazard floor - B**
* MMO: Lost Ark raids shrink the arena (red fog, spiked ground) over phases [2]; FFXIV has death-edge arenas [1].
* Solo: one deliberate step in Phase 3 (Act II lava creeping, Act III floodwater): r 26 -> 20 with 4 s of visible rise and a 1.0 s lead warning. NOT continuous shrink.
* Read: ground ring in biome accent, hostile red zone on the lost area, camera framing follows.
* Knobs: how many steps (1 max), step distance, damage per second at edge (10% HP/s).
* Mage: reduces kiting room; counters mage's long-range comfort. Combine with donut/in-out so "near the boss" pays off.

**11. Add priority + "adds that carry a debuff you cleanse" - A**
* MMO: strict kill order (healers/casters first), reinforcement waves, add debuffs [10].
* Solo: 1-3 adds per wave, max ever 4 alive, each with a stated purpose (see section 5): Race add (reach boss -> heal/buff), Generator add (feeds a shield), Puddle add (death leaves gold cleanse/shelter pool), Carrier add (applies a debuff when it reaches you; the puddle cleans it).
* Read: adds have the white bracket + gold line to what they feed; a "race" add shows a gold arrow path to the boss.
* Knobs: count, speed (race adds 4.5 u/s vs player 6.5 u/s so they are catchable), HP (1-2 reactions).
* Mage: AoE/chain spells make it easy; the tactical question is positioning the boss so adds' path is long.

**12. Interrupt / Poise bar (break check) - A (see section 4)**
* MMO: GW2 defiance bar: CC drains the bar, empties -> boss stunned/vulnerable; some casts MUST be broken [3]. Lost Ark: stagger gauge, "stagger check" must break before a big attack, else it progresses to harder patterns [4]. FFXIV: interrupt/stun on cast bars; Sekiro posture [5]; MH Wilds offset/wounds [6].
* Solo: one bar, visible all the time; becomes a hard "check" during one big cast per phase.
* Read: steel plate under the nameplate; boss "cracks" glow as it fills; check = boss glows steel-white with a cast ring.
* Knobs: bar size, per-reaction value, decay, check timing, anti-spam rise (+25% per break) [6].
* Mage: this is where reactions pay (section 4).

**13. Shield / ward phases - A (we already have Prism Ward)**
* MMO: boss gains a shield or immunity that must be broken by a specific action [10].
* Solo: Aurelith ward by element (existing) plus Banner/Conduit generators on other bosses: while generators live, boss takes -50% damage. The reaction rule "any reaction breaks the ward" already exists - keep it.
* Read: ward shell coloured by element; generator beams as gold-white lines to the boss.
* Knobs: ward cycle (10 s), generator HP, generator regrowth.
* Mage: reactions are the answer; a ward at fire means you play frost/storm for Superconduct, and so on - build expression, not just a DPS check.

**14. Enrage timers - B (soft enrage only + far backstop)**
* MMO: hard enrage ends the fight at a clock; soft enrage ramps adds, damage, mechanic frequency [10].
* Solo: soft enrage in P3: cycle time -5% per 10 s past 70% of target duration, puddles persist longer. Hard backstop at ~2x target duration: boss casts "Rift Collapse" (arena-wide hit every 4 s growing). This is for anti-stall only (Hades II is criticised for fights that drag when you can sprint forever [8]).
* Read: nameplate shows a faint "Wrath" meter only once the soft enrage starts; arena gets a slow red vignette.
* Knobs: threshold, ramp rate.
* Mage: more dps = fewer enrage ramps; a Poise break is the "time buy".

**15. Intermission / transition - A**
* MMO: boss untargetable/99% reduction, mechanic-heavy, reposition [10].
* Solo: 6-9 s set-piece at 66% and 33%: arena-wide pattern (lanes, rotating beam with gaps, floor cracks). Ends with a "crash"/exhaustion = free damage window (Downed 3-4 s).
* Read: the boss leaves the combat rotation visibly (leap/fly/roar), HUD says "SURVIVE" quietly; the nameplate greys.
* Knobs: duration, density, damage.
* Mage: no damage taken from the boss during intermission is the default reward; a perfect dodge in it adds Poise for the next phase.

**16. Gaze / "look away" - B (as LoS cone, no facing)**
* MMO: gaze applies petrify unless you face away [1].
* Solo: our hero has no relevant facing. Translate to LoS: Aurelith's gaze is a cone with a 0.9 s tell; either break LoS behind a pillar or leave the cone.
* Read: cone with a bright slit-pupil at the apex; gold pillar shadow wedges.
* Knobs: cone width, pillar count.
* Mage: same as pillars.

**17. Delayed-detonation "memory" mechanic - A**
* MMO: marked spots/trails detonate later; players must remember or move [1].
* Solo: Vashkar's "Cinder Memory": every 0.6 s a small mark is left where you stood; all marks detonate 2.5 s after the first, in sequence. Stopping = stacked marks; moving in a straight line is safe-ish; backtracking is the trap. Rewards route planning.
* Read: small red circle with a pulsing numeral-less clock ring; marks detonate in the order laid, so the first one flashes.
* Knobs: lead time (2.5 -> 1.8 s), mark radius (1.4 -> 2.2), count.
* Mage: kiting in circles is lethal here; kiting back-and-forth is lethal; kiting "straight then arcing" works - tactical.

**18. Proximity debuff / orbs to collect or avoid - B**
* MMO: stacking debuffs by standing near something; orbs to catch or avoid [1].
* Solo: "Spore" stacks from clouds (Gorrak) cleansed by the gold sap pool; "Prism Orbs" drift in from the rim: touch the gold-white orb of the NEXT ward element to gain Attunement (2 s of +statusPower for that element = easier reaction), red orbs to avoid.
* Read: orb colour = element tint with a ring; good orbs have the gold chevrons.
* Knobs: orb count, drift speed, stack threshold.
* Mage: ties directly into the reaction system - a "mage-native" version.

**19. Rotating safe quadrants - A**
* MMO: arena segmented in 4-8 slices, rotating hazard sweeps or blocks; safe slice rotates [1].
* Solo: Aurelith twin beam sweep (already exists) + quadrant cuts: 3 of 4 quadrants hazard; telegraphed order. Safe quadrant adjacent = hop (walk), across = dash.
* Read: quadrant outlines, hazard filled red, safe one gold-edged; the sequence is shown 1 s ahead with numbered tick marks.
* Knobs: slice count (4 -> 6), rotation speed, step interval.
* Mage: dash lets you cross a quadrant; spell range lets you attack from the safe slice.

**20. Chasing AoEs (boss-targeted tracking) - B**
* MMO: continuous circle follows the player then locks [1].
* Solo: "Tempest": 3 storm strikes that track the player 1.2 s, then lock 0.6 s and strike. Lightning-rod puddle (Aurelith's add) absorbs the strike if you stand in it.
* Read: red circle follows you; at lock it turns solid + sound.
* Knobs: tracking speed (< 6.5 u/s so you can out-move), lock time.
* Mage: dash on lock for perfect-dodge + Poise.

**21. Dash-through ring / wave - A (existing FlameRing)**
* MMO: "jump the wave" / expanding shockwave [1].
* Solo: already ours. Keep as the dash i-frames' signature check; use at most once per cycle; vary with a double ring (0.6 s apart).
* Read: red ring front; a gold "gap" tick marks where a hole opens in later versions.
* Knobs: speed 9 -> 12 u/s, width 0.8 -> 0.6.
* Mage: dash window is 0.25 s; two rings 0.6 s apart forces a dash and a hop (jump-over is not in our kit).

**22. Poor-fit list (skip or minimise)**
* Tank swap, tank busters on a "non-tank", role-split (healer/DPS) checks, split-group mechanics, player-to-player tethers, tower-count-by-party-size, raid-wide damage sized for healer mitigation (replace with Shelter Puddle), "kill order across two bosses" (one boss only), mandatory ultimate-length sequences (too long for 60-120 s), death-edge arenas.
* Soft fit: mounts/vehicles, resurrect/limit-break (we have a Death Defiance style revive only if added, skip), melee-range-only checks (the mage is ranged; keep minimum range < 8 u).

## 4. Breakbar / "Poise" proposal for the element-reaction system

Prior art: GW2 defiance bar (CC drains a bar, empties = stun/vulnerable; bosses ignore normal CC [3]); Lost Ark stagger (bar -> groggy window, some "stagger checks" gate a big attack or phase [4]); Sekiro posture (visible shared meter, regenerates inversely to HP, break = deathblow window [5]); MH Wilds (offset attacks build a hidden threshold; anti-spam via temporary resistance and rising threshold [6]).

**Name:** Poise (UI "STAGGER"). One bar per phase, 100 units, visible under the nameplate.

**Fill sources (not raw damage):**

| Event | Poise |
|---|---|
| Steam Burst / Combust / Overload | +10 |
| Superconduct (arc) | +8 (+2 per extra target arced) |
| Shatter | +14 (it needs Frost then Arcane: highest skill) |
| Arc Flash (the boss stun is capped at 0.3 s) | +8 |
| Boss stunned by anything | +4 (replaces the wasted 0.3 s) |
| Boss Frozen (0.6 s cap) | +6 (replaces the wasted duration) |
| Chain bonus | +0.5 per current Chain level (max +5) |
| Perfect dodge on a boss attack | +5 |
| Rift Crystal burst on the boss | +6 (+ status from the crystal, so the reaction follows) |
| Destroying a Generator add (Banner/Conduit) | +15 |

* Direct spell damage adds 0. This keeps the bar a mage-skill expression, not a stopwatch on dps. (inf.)
* Decay: 2/s starting 3 s after the last fill (Sekiro-style regen [5]) so a mage who stands still loses progress; decay is paused while the boss is casting its Break Check.
* Expected throughput: a mage landing a reaction every ~1.5 s with Chain 3 gets ~11.5 per reaction = ~7 poise/s peak, ~4/s realistic. 100 poise = ~15-25 s of "deliberate play". That is 1 break per ~25-30 s -> 2 free breaks + 1 forced check per phase. Tune in the sim harness.

**Two layers:**
1. **Passive Poise (always on):** when full -> **DOWNED**: boss locked in its stagger pose for 4 s (P1) / 5 s (P2) / 6 s (P3), takes +40% damage, cancels the current cast, all hostile telegraphs fade (except lingering hazards). Then **Recovery** 10 s: Poise locked at 0 and next break needs ×1.25 (MH Wilds-style rising threshold [6]).
2. **Break Check (once per phase, a named big cast):** a labelled cast (Gorrak: War Horn; Vashkar: Molten Overswing; Aurelith: Prism Nova) with a 5-6 s cast ring and a visible target mark on the Poise bar (e.g. "need 60 of 100 before the ring closes"). Success = cancelled + Downed with a bonus (+2 s). Failure = the cast resolves (a survivable arena-wide hit or the buff/summon above) and the next phase tightens by one notch (Lost Ark failure = harder patterns [4]). Always show the bar when a check is live; Lost Ark players complain when it is hidden [4].

**Boss-specific hooks for the reaction system:**
* Fire-resist Vashkar: fire reactions give only half poise (his resist halves the base) - nudge toward Frost/Storm/Arcane builds.
* Aurelith ward: when the ward is broken by a reaction, +10 poise extra and the next attack of that ward family is cancelled for the cycle. This makes the existing ward rule "bind" to the stagger layer.
* Never allow a stagger-lock chain: the Recovery period + rising threshold prevents it [6]. Tier mult: bar fills 15% slower at higher Rift Tier.

**Communicating it:** every fill event pops "+N" in steel-white on the boss and crackles the plate; the boss rig takes a progressive "cracked" glow at 50%/75%; Downed = rig pose on its knees/slumped, a steel-white ring on the ground, a clear sound sting, hit-stop 45 ms (matches existing hit-stop rules).

## 5. Phase structure guidance

**Fight length targets (solo):** Gorrak 60-75 s, Vashkar 80-100 s, Aurelith 100-120 s (excluding intermissions + downed windows are inside this time). Boss base HP will need re-tuning because the horde no longer supplies kill-assisted dps buffs, XP levels or shrines mid-fight; measure with the sim harness, aim for the average build killing in the middle of the target window. (inf.)

**Phase count:** 3. Rationale: P1 = fundamentals on a clean floor, P2 = multitask + new rule, P3 = urgency + synthesis [9]. HP gates 100 -> 66 -> 33 -> 0. Add one HP-gated "interrupt-proof" rule: damage over a gate is absorbed (Hades patch notes: excess damage is absorbed between phases to prevent skipping [8]).

**Intermission design:**
* Length 6-9 s; boss untargetable; arena-wide pattern uses one already-learned shape (so it is a test not a new lesson).
* Ends with the boss visibly spent (Downed 3-4 s) - the reward for surviving.
* Reset: clear all lingering puddles and adds at intermission start (a clean slate). Cooldowns recover a little (player gets +1 dash charge refund) so the player enters P2 ready.
* Signature beats the player can learn: Hades-style clarity - a distinct roar/pose/phase mark that precedes the new pattern [8].

**Burn windows vs pressure windows:** target 35-45% of fight time as a damage window (Downed, post-intermission, generator-down, ward-broken), 55-65% as pressure (WoW "burn windows" like Ula'tek's 20 s exposed heart, with extra damage taken and guidance to save cooldowns for it [10]). Show the window state on the boss: "EXPOSED" pulse + the nameplate tinted.

**Soft vs hard enrage:** soft enrage only inside P3; a hard backstop at ~2× target time (Rift Collapse). Do not make the hard enrage a dps check at normal difficulty - mark it as a failsafe. WoW definition: soft = ramp, hard = fixed end [10].

**Teaching:**
* First instance of a mechanic is generous: +40% telegraph time, a single instance, no overlap, nothing else on the field, damage 60% (survivable at any HP), with a post-hit "tip" in the log ("The glowing ring marks safe ground"). The same shape returns in P2 at normal speed, combined; in P3 it overlaps or speeds up. This is the rule-of-three (inf., consistent with [9]).
* Teach by shape grammar (section 2), not text.
* A fail never ends the run in P1; first-time boss attempts should leave the player able to see the next iteration (Gorrak is the tutorial boss: he teaches circle, cone, add-race, puddle, break check).

**Pacing within a phase:** 3-4 attacks in a 10-12 s "cycle" with a 1.5-2 s breathing gap after each heavy; the cycle ends with the signature mechanic. Never overlap two new things. Maximum 3 hostile shapes live at once (readability cap; Hades II is criticised for visual noise in late phases [8]).

## 6. Draft encounter outlines

General settings: arena closed ring (section 7); horde off; ambient act hazards (geysers/lightning) are off during boss fights (they are folded into boss mechanics); Rift Crystals: 4 stand in the arena ring, respawn 25 s (they are the player's reaction-fuel; each carries an element and a gold dashed ring already), so reaction-making is possible without a horde.
Rig poses referenced: idle, wind-up (raise), commit (hold 0.15 s), impact (slam), recover, stagger/downed, roar/summon, leap/fly.

### 6.1 Gorrak, the Troll King - Act I forest, teaching boss, 60-75 s
Arena r 24, thorn-hedge ring. 4 stump pillars (r 1.2) at 45/135/225/315 deg, r 13. Boss HP 8,000 base (retune).
Theme of mechanics: club (circle/cone), spore pods (kill timer), war horn (break check + race adds), puddles.

**Phase 1 (100-66%): "Club and Pods"** - teaching.
1. **Club Slam** (circle r 5 on you, lead 1.2 s first time then 0.9, 1.6x dmg). Pose: raise -> slam. Club stays stuck for 1.2 s: tiny bonus window (+15% damage). Teaches "leave the circle".
2. **Backhand Sweep** (cone 120 deg, r 9, 1.1 s). Safe: behind him; he turns at 70 deg/s. Pose: wide wind-up, back-hand. Teaches safe side.
3. **Spore Pods** (3 pods on ring positions, each a small object ~HP 1 reaction): ripen over 6 s with a visible gold-white fill ring; on ripen they burst into a hostile cloud r 4 for 6 s. PURPOSE of pods: "kill before ripe" or they zone you out; a pod killed early leaves a **Sap Pool** (gold, r 2.4, 10 s) - your cleanse for Spore (P2). In P1 the sap pool only gives +25% move speed, so the learning is free.
4. **War Horn Break Check** (once, ~P1 end): Gorrak raises the horn, 5 s cast, needs 60 Poise. Success: cancelled, Downed 4 s. Fail: 4 **Goblin Runners** spawn at the hedge and run to him: each one that arrives heals him 3% and gives him +10% damage for 8 s. PURPOSE of Runners: a race add; speed 4.5 u/s; die to one reaction. Their path is drawn as a gold arrow to Gorrak.

**Intermission 1 (66%, 7 s): "Timberfall."** He leaps to the hedge edge and hurls trees: 6 rectangles (width 3, whole-arena length) from alternating sides every 0.9 s, safe lane shifts (order shown 1 s ahead). Ends: he leaps back, landing on the player's position with a circle r 7 (dash it); he is winded 3 s (Downed, free damage).

**Phase 2 (66-33%): "Spore Rot"** - adds the debuff.
5. **Spore stacks:** each second in a cloud adds 1 Spore stack (+8% damage taken, -5% speed, max 5; at 5, rooted 1 s). The Sap Pool cleanses all stacks. The pods now ripen every 12 s in 2-3 positions; so the player decides: kill the pod (earn a pool, no cloud) or let it burst and be penalised.
6. **Combo: Slam + Backhand** on the same target, 0.5 s apart, circle then cone on the other side: you step out and around. Plus the first Break Check repeats with 70 Poise and a new Pod pair that ripens inside the check window.
7. **Stump hide:** "Boulder Toss" (line rectangle width 2.2) - stumps block it. Teaches LoS once, lightly.

**Intermission 2 (33%, 8 s): "King's Wrath."** Roar; 3 expanding dash-through rings from the centre (0.8 s apart) + pods all ripen at once at the rim; Downed 4 s on the end.

**Phase 3 (33-0%): "Troll Rage"** - synthesis, soft enrage.
8. Rage: cycle -20% and club sweeps become 180 deg cone; the war horn calls Runners EVERY check cycle. Spore stacks max 5 and pools last 8 s. Pods ripen every 8 s. All previous mechanics at full speed, none brand-new. Soft enrage after 70 s: cycle -5%/10 s.
9. **Last Stand (HP < 10%):** one Backhand-then-Slam-then-ring combo, then he's staggered at 3% = a final burn window.

Implementation note: circles, cone, rectangles, ring, goblin runner actors (existing grunt with a path-to-boss behaviour), pods (actor + fill ring), sap pool (zone actor), pillars (stump props with collision), cloud (hostile zone).

### 6.2 Vashkar, the Ashen Warchief - Act II barrens, 80-100 s
Arena r 26, mesa/basalt ring. 3 rock pillars (r 1.4). Boss resists fire 50% (fire poise halved). HP 20,000 base (retune).
Theme: molten greataxe with a Heat gauge, twin banners as generators, charges + lava, memory-detonation.

**Phase 1 (100-66%): "Twin Banners"**
1. **Axe Combo (in/out):** point-blank ring r 4.5 (axe overhead; telegraph lead 1.2 s) -> donut r 4.5-11 (axe sweep) 0.5 s later. Safe: stand outside r 4.5 for the first, then step inside r 4.5 (or dash in) for the second; the gold-tinted safe region is drawn for each. Teaches in-out. Each swing raises the Axe Heat gauge (visible glow on the axe, 0-100).
2. **Twin Banners (generators):** 2 banners at opposite arena edges. While alive, each gives Vashkar -25% damage taken (two = -50%) and emits a pulse ring every 7 s (donut warning). PURPOSE: shield generators + positioning pressure: you must draw him away from the banner you attack. Destroy both -> "Disarmed": Downed 5 s + 15 Poise each.
3. **Banner Charge:** the Warchief charges between the banners (line r 1.6, 26 u long, 0.9-1.2 s tell), leaving lava (2.5 s, existing LavaTrail). Phase 1: one charge. The charge destroys nothing; the lava limits floor space.
4. **Torchbearers (race add):** if a banner falls, 2 Torchbearer thralls (speed 4.5) run from the rim to re-light it (banner returns at 50% HP). PURPOSE: race add; kill before they reach the banner. This keeps banners a strategic target.
5. **Heat check:** at Axe Heat 100 -> **Molten Overswing**, the Break Check: 5 s cast, huge cone 200 deg, r 14. Needs 60 Poise (frost/storm reactions best: fire is resisted). Success: "Quenched": heat resets, Downed 4 s. Fail: the cone hits the lava floor and leaves a fire zone for 6 s.

**Intermission 1 (66%, 8 s): "Ashfall."** He leaps to a rim, planting the axe; 3 lava lanes (rectangles width 3) sweep across in sequence with a shown order; then the lava recedes and he's winded 3 s.

**Phase 2 (66-33%): "Cinder Memory"**
6. **Cinder Memory** (mechanic 17): marks left where you walked; detonate in sequence. Introduced with a 3-mark tutorial (lead 3 s), then at normal speed combined with the Axe Combo.
7. **Double Charge** (two charges in a row, diverging angle) and lava persists 3 s.
8. **Banners re-raised** at new positions (ring 90 deg offset) with HP +30%. A banner now also fires a thin tether to Vashkar; the tether snaps if you destroy the banner; while tethered, he takes -50% damage but heals on a charge.
9. **Warcry** (break check #2): 6 s, needs 70 Poise; failing summons 3 Ash Warriors (race adds: they run to him and give +10% speed to his charge cycle each).

**Intermission 2 (33%, 8 s): "Molten Tide."** Arena rim lava rises to r 22 (one step; 1.5 s warning, gold ring shows the new safe boundary); 4 meteor lines fall (rectangle lanes) in sequence; he is winded 4 s afterwards.

**Phase 3 (33-0%): "Warchief's Fury"**
10. **Floor is lava ring** (r 22 new safe boundary) + Meteor Rain (6 circles r 2.5) now arrive in 2 waves with the second wave offset from the first: you stay on the move.
11. All of Axe Combo + Cinder Memory + Banners (one banner only, tough) + Heat check every 35 s. Soft enrage from 70 s: charges leave 4 s lava, the memory marks count up.
12. **Last Stand:** he breaks his axe; Phase final "bare-hands" slams only (circles), a free kill window.

### 6.3 Aurelith, the Prism Dragon - Act III riverlands, 100-120 s
Arena r 28, drowned-ruin ring with waterfalls. 5 crystal pillars (r 1.2; beam-blocking; 3 hits). HP 60,000 base (retune). In raid mode Aurelith (slow, normally keeps ~5 u away) circles the arena (flying hover), turning slowly, so pillars can be used for LoS.
Theme: Prism Ward = telegraph of the attack family she's about to use; reactions break it; beams, shards.

**Ward-to-attack rule (teach in P1):** the ward colour tells you which attack she will cast next:
* fire ward = flame **lanes** (line rectangles); frost ward = expanding frost **rings** (dash through); storm ward = **chasing strikes** (Tempest); arcane ward = **shard** circles (delayed). Breaking the ward by a reaction cancels that family's next cast (and +10 Poise). Cycle 10 s (existing).

**Phase 1 (100-66%): "Refraction"**
1. **Twin Beams** (existing rotating beams, 22 u): 2 opposite beams, 1.2 s tell, sweeping 140 deg over 3 s. Pillars block beams: shadow wedge shown in gold. Teaches LoS.
2. **Ward cycle + family attacks** as above (one family live per cycle, so only one new shape at a time).
3. **Prism Conduits (generators):** 2 crystals at the rim feeding the ward; while alive the ward re-forms 3 s after a reaction breaks it (so Poise from reactions is not enough alone). PURPOSE: shield generator. Gold line conduit -> boss. Killing both: ward permanently down for 8 s, Downed 4 s.
4. **Prism Nova (Break Check):** 6 s cast: arena-wide flash; shelter = gold puddles 3 (r 3). If you break her Poise to 60 first: cancelled. Else take the nova unless sheltered; the pillar shadows ALSO shelter - two valid answers (positioning vs mage skill).

**Intermission 1 (66%, 8 s): "Skyward."** She lifts off to the centre, untargetable; a beam rotates with 3 gaps (speed 25 deg/s) for 5 s, then a crash ring (dash through). She falls: Downed 4 s.

**Phase 2 (66-33%): "Storm Reach"**
5. **Tempest (chasing strikes):** 3 strikes track you 1.2 s then lock. PURPOSE-add: **Stormcaller Wyvern** (one at a time): killing it leaves a **Lightning Rod** puddle (gold, r 2, 10 s); standing in the rod absorbs the strikes (they target the rod). The player chooses where to kill the wyvern, i.e. puddle placement (mechanic 7).
6. **Quadrant Prism:** 4 quadrants, 3 hazard in sequence (1 s each), safe quadrant shown by tick marks; combined with ward family.
7. **Whelp swarm (carrier):** 3 Ember Whelps rush you: on reaching you they apply Scorch (-15% reaction damage for 8 s, stacks to 3); a Lightning Rod or Cooling Pool cleanses (the whelp, killed by frost, leaves a Cooling Pool). PURPOSE: debuff carrier + cleanse. Max 3 alive.
8. Break check #2: Nova with beams: pillars now cracked (3 hits to break) - the pillar HP is part of the resource economy.

**Intermission 2 (33%, 9 s): "Shatterfall."** Floor cracks: 4 ring-sector hazards in sequence; the crystals in the arena rise (new pillars) while the old break; she crashes: Downed 5 s.

**Phase 3 (33-0%): "Prismatic Overload"**
9. **Floodwater rising:** arena r 28 -> 22 (one step, 1.5 s warning, gold ring shows new boundary).
10. **Ward cycle accelerates** to 7 s; two families can overlap (fire lanes during frost rings); the overlap is the only new thing, nothing else new.
11. **Quad Beam:** 4 beams rotating 160 deg/s 0.7 -> and the Conduits re-grow once. Soft enrage after 90 s: beam sweep +10% per 10 s.
12. **Last Stand (HP < 8%):** Prism Overload: the ward cycles each 3 s; reactions from any element break it and each break = +15 Poise = a downed finish.

Implementation note: telegraph primitives needed (circle, cone, line/rect, ring/donut, expanding ring); positive zones (gold puddle) with an "occupied" check; pillar props with collision and "beam occlusion" raycast on the ground plane; Poise bar HUD; arena ring wall actor; tether line renderer; race-add pathing to a target actor; generator link line.

## 7. Arena: should it close in?

**Yes: a closed ring wall, but not the whole r 55.** Reasons: (a) a raid fight needs a stage, not a field - the boss's telegraph lanes, pillars and safe pockets must be readable in one camera view; (b) no more infinite kiting - the Hades II complaint about fights that drag due to sprint-forever [8]; (c) a stable space makes safe-spot design (pillars, quadrants) deterministic; (d) at 6.5 u/s, a diameter-55 field is 17 s to cross, enough to hide.

Recommendations:
* **Radius:** Gorrak 24, Vashkar 26, Aurelith 28 (diameter ~50, ~8 s edge-to-edge at move speed; with a dash 1.5 s shorter). Hostile shapes are sized so no single shape covers more than ~35% of the area: circles r 5-7, cone r 9-14, beams 22 (beams reach the wall, which is intentional).
* **Placement:** arena centre = player position at boss spawn clamped so the ring lies inside the r 55 playable circle (no teleport). The boss spawns at the arena edge opposite the player's approach so the first 2 s are a free view.
* **Spawn sequence (2.0 s):** horde dissolves (existing Rift Shift style: enemies fade, XP/pickup drops fly to player), hostile bullets cleared, a glowing ground ring writes itself clockwise at the radius, then the wall rises (thorn hedge / basalt spikes / crystal-and-waterfall) with dust + a low rumble. The ground inside is brightened slightly; outside is dimmed (the existing edge fade).
* **Look:** themed wall height 3-4 u so it reads in iso without blocking the view; ground ring in biome accent (green / ember / cyan) - never red; the wall itself is a collider and blocks player + hostile shots.
* **Edge rule:** no instant death; touching the wall is just a stop. Wall-slam knockbacks deal 25% max HP + 0.6 s stun (mechanic 9). Slight inward pull (3 u/s) within 1 u of the wall prevents wall-hugging forever.
* **Shrink:** none for Gorrak; one step for Vashkar (lava rim to r 22) and Aurelith (floodwater to r 22) in P3, 1.5 s warning + a gold ring showing the new boundary. Never both a shrink and a new mechanic in the same 6 s.
* **Camera:** frame the arena (zoom out 10%, 30% dampened follow towards arena centre) so shapes at the far rim remain visible; the HUD edge arrows remain for off-screen objectives (existing).
* **Rift Crystals:** 4 stand around the ring at 90 deg, respawn 25 s: the reaction fuel and Poise supply - a tactical resource, "who is closest to the ward element I need".
* **Horde:** boss spawn rate = 0% (was 35%); act hazards off; relic/XP drops from the horde dissolve into the player at spawn so nothing is lost.
* **Death/retry:** the arena is not part of any checkpoint; failing resets the run as before.

## 8. Implementation priorities (cheapest first)

1. Shared telegraph primitives (circle/cone/rect/donut/ring) with fill-in animation + colour grammar. Wrap existing FlameRing, charge line.
2. Arena ring wall + horde-off + camera frame.
3. Poise bar + Poise events from the reaction system + Downed state + Break Check cast.
4. Phase machine (66/33 gates, intermission, damage absorb at gates).
5. Generator add + race add + gold puddle zone actors.
6. Per-boss scripts (Gorrak first as the tutorial).
7. Memory marks, chasing strikes, quadrants, LoS pillars with beam occlusion.

## Sources
[1] FFXIV raid terms and shapes - Icy Veins M3 Normal guide https://www.icy-veins.com/ffxiv/aac-heavyweight-m3-normal-raid-guide ; Materia "Beginners Guide to Raiding" https://materiaraiding.com/resources/beginnersguide ; Tenth Circle (tethers) https://www.icy-veins.com/ffxiv/the-tenth-circle-normal-raid-guide ; Omega Protocol (ordered towers) https://ffxiv.consolegameswiki.com/wiki/The_Omega_Protocol_(Ultimate) ; Gaze https://ffxiv.consolegameswiki.com/wiki/Gaze ; Furor death-edge and knockback https://ffxiv.consolegameswiki.com/wiki/Eden%27s_Verse:_Furor
[2] Lost Ark shrinking arenas: Mordum Gate 3 https://maxroll.gg/lost-ark/kazeros-raids/kazeros-raid-mordum-gate-3 ; Echidna Gate 1 https://maxroll.gg/lost-ark/kazeros-raids/echidna-gate-1 ; Serca Gate 1 https://maxroll.gg/lost-ark/shadow-raids/shadow-raid-serca-gate-1-guide
[3] GW2 defiance bar: https://wiki.guildwars2.com/wiki/Defiance_bar ; Snow Crows guide https://snowcrows.com/guides/getting-started/defiance-and-cc-guide
[4] Lost Ark stagger / stagger checks / destruction: https://guides.gamepressure.com/lost-ark/guide.asp?ID=63480 ; https://lostark.wiki.fextralife.com/Stagger_Damage ; https://www.mmogah.com/news/lost-ark/lost-ark-mechanics-guide-counter-stagger-weak-point
[5] Sekiro posture: https://twinfinite.net/guides/sekiro-posture-break-maintain-important-how/ ; https://www.gamedeveloper.com/design/how-i-broke-sekiro-shadows-die-twice ; http://whats-in-a-game.com/sekiros-genius-posture-mechanic/
[6] Monster Hunter Wilds offset/wounds/stagger anti-spam: https://www.thegamer.com/monster-hunter-wilds-offset-attacks-power-clash-explained/ ; https://monsterhunterwiki.org/wiki/Combat_(MHWilds) ; https://www.switchbladegaming.com/monster-hunter-wilds/wound-system/
[7] (design inference from [1][10]: building blocks = telegraphed shapes, groups, timed debuffs)
[8] Hades / Elden Ring readability & phase design: Supergiant patch notes (absorb overflow between phases) https://www.supergiantgames.com/blog/hades-updates/ ; Hades final boss analysis https://www.byteside.com/2020/10/lets-talk-about-that-boss-fight-in-hades-supergiant-games/ ; Game Developer "Designing for Difficulty: Readability in ARPGs" https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs ; Elden Ring critiques https://steamcommunity.com/app/1245620/discussions/0/3183487594844280958/ ; Hades II fights that drag https://steamcommunity.com/app/1145350/discussions/0/4358998752032359905/
[9] Phase purposes (P1 teach / P2 multitask / P3 urgency): Build a Boss guide https://buildaboss.top/en/guide/build-a-boss-beginner-guide ; WoW boss phases https://giorgionenyc.com/wow-raid-boss-phases-explained-surviving-the-toughest-fights/ ; Destiny 2 first-raid guidance https://www.gametruth.com/guides/destiny-2-raid-beginner-guide-mechanics-roles-and-lfg-etiquette/
[10] WoW enrage / add priority / intermissions / burn windows: https://warcraft.wiki.gg/wiki/Enrage_(mechanic) ; Icy Veins Vorasius https://www.icy-veins.com/wow/vorasius-raid-guide ; Method Sszorak https://www.method.gg/guides/the-venomous-abyss/sszorak-heroic ; Ula'tek https://expcarry.com/ula-tek-boss-guide
