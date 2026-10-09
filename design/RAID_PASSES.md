# Riftbound v5 — "Rift Obelisks & Raid Bosses" design passes

Inputs: user brief (2026-10-09), research `design/research/11-raid-boss-mechanics.md`, `12-boss-scores.md`, `13-risk-reward-summoning.md`.
Brief, in one line: **the player owns the risk/reward of when and how a boss comes; the boss is an isolated, scored, phased encounter where positioning and tactical play win.** Adds only when a mechanic needs them.

---

## Pass 0 — Audit (v4.2)

| Area | Verdict | Note |
|---|---|---|
| Boss timing | weak | Fixed 3:00 timer; zero player agency. |
| Boss isolation | weak | Horde keeps spawning at 35%, act hazards keep firing. The boss is "a big elite in a crowd": positioning is drowned by crowd-kiting. |
| Boss structure | weak | 3 random attacks each, 2 phases (50%), no intermission, no damage window, nothing to *learn*. |
| Adds | poor | "Summon 6 husks" / "4 whelps + wyvern": filler with no purpose, and they give XP. |
| Telegraph grammar | ok | Circles + lines in one hostile red read well. No cones, donuts, safe zones; no "go here" colour. |
| Reaction system vs bosses | under-used | Freeze/stun are capped on bosses, so the element game mostly turns into raw DPS. |
| Music | ok/weak | One boss "ostinato" layer over the act theme; no identity per boss, no phase arc, no stinger. |
| Boss models | good | Rigs are strong and already pose-driven (`_play(action, dur, tell)`); they need new poses for new moves. |

Diagnosis: the boss fights are the run's climax but play like the horde with a health bar. The fix is structural: an **encounter frame** (seal, arena, score, phases, stagger), a **summoning layer** (obelisks) on top, and **re-scripted bosses** inside the frame.

---

## Pass 1 — Run structure: who decides when the boss comes

**Critique.** A fixed timer is a good *anchor* (every balance target — L10/L18/L26, TTK bands, shard income — is defined against it) but a bad *ceiling* on agency.

**Decisions.**
1. **The 3:00 timer stays** as the default summon. Doing nothing is a valid, fully-balanced path.
2. **Rift Obelisks** rise at **0:50** of every act: the same three, always (learnable). Haste, Echo, Wrath. Placement 20–32 u from the player, ≥ 100° apart in bearing, ≥ 12 u from each other, inside r 48.
3. **Activation = channel** (the channel is the confirmation; no modal): stand inside r 3.0 for **4 s**. Progress decays at 0.25/s outside. During a channel, horde clusters spawn around the obelisk 14–20 u out (**Rift Pull**) — the act of choosing risk is itself risky.
4. Costs attach to the **encounter**, never to the clock (activating at 2:59 does not dodge them).
5. When the boss spawns (timer or Haste), every obelisk collapses.

| Obelisk | Effect | Cost | Pay |
|---|---|---|---|
| **Haste** — "Summon now" | 3 s warning, then the boss encounter starts immediately. | You skip the rest of the horde (XP, Elite Surge, Swarm still ahead). | **Windfall XP** = 30% of the act XP still ahead (estimated); **Haste Bounty** = `round(0.25 × secondsSkipped × [1,1.5,2][act])` shards; the boss chest offers **+1 relic choice**. |
| **Echo** — "The boss comes twice" | After the boss dies: 3 s **Rift Mend** (heal 20%, dash refilled, hostiles cleared), then its **Echo** rises in the same arena: spectral, **55% HP**, starts at its **Phase 2** script, 10% faster cycle. | **Strain**: +10% damage taken for the whole encounter (both bodies). Longer fight. | **Echo Chest**: pick 1 of 3 **Boss Relics** (§Pass 6). +15/22/30 shards. |
| **Wrath** — "Heat" (3 sigils, channel up to 3×) | Each channel = +1 Heat = one **boss affix**, pre-rolled and shown on the pillar before you channel. Heat 2: boss HP +15%. Heat 3: HP +30%, dmg +10%. | The affixes, and up to 12 s of channelling in a Rift Pull. | Heat 1: +1 relic choice. Heat 2: + **Wrath Cache** (+1 rank to a skill of your choice). Heat 3: one choice in the boss chest is a guaranteed **Boss Relic**. Shards 5/12/30 × actMult. |

6. **Shard guard**: obelisk shards are capped at 60% of the run's base shards (before the tier multiplier).
7. **Bot/sim**: the timer path is unchanged, so `runSim` still measures the default lane. `runSim({ obelisks: ['haste@90', 'echo', 'wrath:2'] })` drives the other lanes.

**Cut.** Tithe (HP loan for a relic), Siege (stay-longer lane), Overtime (soft timer), per-boss affixes, re-rolling affixes, fusion catalyst cache.

---

## Pass 2 — The encounter frame (every boss)

**Critique.** Isolation is the user's core ask: no horde, a stage, a score.

**Decisions — the Rift Seal sequence** (`game.phase = 'boss'`), 2.5 s:
1. **Seal (0–1.5 s).** A themed ring wall rises around an **arena centred on the player** (centre clamped to r ≤ 55 − R − 2 from the world origin; the wall shoves the player inward gently if they are outside). Horde spawning stops (rate × 0). Hostile actors are cleared. Act hazards stop. The shrine (if any) sinks; an active shrine buff keeps running. Act music fades out under a riser.
2. **Reap.** All live enemies dissolve into XP that flies to the player (the Rift Shift dissolve). Pending level-up hands are drafted now (the boss waits for them).
3. **Stakes card** (only if any obelisk was armed; 2 s, non-blocking): Haste / Echo / Wrath icons + affix names.
4. **Boss entrance (1.5–2.5 s).** The boss rises/lands at the far side of the arena (12 u from the player towards the centre), plays its entrance pose; the **score's intro stinger** hits on the landing; nameplate drops in.

| Boss | Arena R | Camera zoom | Wall look |
|---|---|---|---|
| Gorrak | 20 | 0.90 | thorn hedge + root arches |
| Vashkar | 21 | 0.88 | basalt spikes with banner poles, ember glow |
| Aurelith | 22 | 0.85 | crystal shards + water curtain |

* Camera target during the encounter = lerp(player, arena centre, 0.3); zoom eases to the table value. The whole arena fits on screen at 16:9 (visible ground ≈ 43 × 50 u at zoom 0.85).
* The wall is solid for the player and the boss (pushed back, never damaging); enemy bullets die on it; player projectiles die on it.
* **Rift Crystals**: the world's geodes outside the arena go dormant; **4 crystals** stand inside the arena at r 0.6 R, respawning 18 s after breaking, elements from the act pool. They are the reaction fuel for Poise (Pass 3), so a pure-element build can still stagger.
* **Adds give 0 XP.** No horde XP during the fight; levels come from the Reap.
* **Victory**: boss dies → hit-stop, slow-mo 0.6 s, score resolution cadence, wall sinks over 2 s, chest + health + magnet drop. Acts I–II then go into the Rift Shift as today (after the wall falls); Act III → Victory.
* **Death during the fight** = run over (as today). No retry.

**Phases (all bosses).** 3 phases, gated at **66% and 33%** HP. Damage past a gate is absorbed (shield flash) until the intermission ends: you can't skip a phase.
* **Intermission** at each gate: 6–8 s, boss untargetable (`untargetable = true`, takes no damage), one *learned* shape at arena scale, ends with the boss **Winded** (Downed 3 s). Lingering puddles and adds are cleared at its start; the player gets +1 dash charge.
* **Soft enrage**: from `enrageAt` (Gorrak 75 s, Vashkar 95 s, Aurelith 120 s of fight time, excluding intermissions/Downed) the cycle speeds up 5% and damage +5% per 10 s; the score adds its enrage layer. No hard enrage.
* **Teaching rule**: the first use of each mechanic in a fight gets +40% telegraph time and is the only thing on the field. At most 2 new mechanics per phase; at most 3 hostile shapes live at once.
* **Telegraph lead times**: first use 1.3 s, normal 0.9 s, announced follow-ups 0.6 s. Dash-through patterns never repeat faster than 2.2 s (slowest dash cd 3.0 s, so one may be walked).

**Cut.** Arena shrinking in every fight (only Aurelith's flood in P3 shrinks it), hard enrage, wall damage, knockback-into-wall deaths, retries.

---

## Pass 3 — Tactical layer: Poise, Downed, Break Checks

**Critique.** Bosses cap freeze (0.6 s) and stun (0.3 s), so the element/reaction game — the core of Riftbound — goes quiet in the fights that matter most.

**Decisions.**
* **Poise** (UI label "STAGGER"): a 0–100 bar under the boss nameplate, filled by *play*, not DPS:

  | Event on the boss | Poise |
  |---|---|
  | Shatter | +14 |
  | Steam / Overload / Combust | +10 |
  | Superconduct / Arc Flash | +8 |
  | Boss frozen (the 0.6 s cap) | +6 |
  | Boss stunned | +4 |
  | Perfect Dodge of a boss attack | +5 |
  | Rift Crystal burst catching the boss | +6 |
  | Destroying a generator add (banner, conduit) | +15 |
  | Chain bonus on any reaction above | +0.5 × Chain, max +5 |

  Vashkar's fire resist halves poise from fire-led reactions (Combust, Steam). Decay 3/s starting 3 s after the last gain (paused during Break Checks). Rift Tier: gains × (1 − 0.05·tier).
* **Downed** (bar full): the boss drops into its stagger pose for **4 s / 5 s / 6 s** (P1/P2/P3), takes **+40% damage**, its current cast and its hostile telegraphs are cancelled (lingering zones stay). Then **Recovery** 8 s: poise locked at 0, next threshold × 1.25 (resets per phase).
* **Break Check** (once per phase, the boss's signature cast): a named cast bar (4.5–6 s) with a threshold marker on the Poise bar ("WAR HORN — 60"). Fill past the marker before the cast ends → cancelled + Downed (+2 s). Fail → the cast resolves (a survivable but costly effect, never instant death).
* **Exposed windows**: generator destroyed, ward broken, post-intermission — the nameplate glows and the boss takes +20% damage. Target: 35–45% of the fight is a damage window.

**Overrules.** DESIGN §6 boss CC caps stay; Poise converts the capped CC into value instead of raising caps.
**Cut.** Per-element poise tables per boss, poise from raw damage, Sekiro-style regen scaling with HP.

---

## Pass 4 — The three encounters

General: each mechanic names its shape (circle / cone / line / donut / ring-wave / safe zone) and every add names its **purpose**. Base HP is re-tuned in Pass 7 (no horde-assisted levelling mid-fight; Downed windows raise DPS).

### Gorrak, the Troll King (Act I, teaching boss, target 60–75 s, arena R 20)
Teaches: leave a circle, safe side of a cone, kill-timer objects, break check, race adds.
* **P1 "Club and Pods"**
  1. *Club Slam* — circle r 5 on the player, 1.3 → 0.9 s; the club sticks 1.2 s (Exposed +20%).
  2. *Backhand* — cone 120°, r 9, from Gorrak toward the player, 1.1 s; safe = behind him / outside r 9.
  3. *Spore Pods* — he flings 3 pods (small inert-ish objects, 2 hits) to ring positions; each ripens over 7 s (gold-white fill ring on the pod). Ripe → **spore cloud** hostile zone r 4 for 8 s. Killed early → **Sap Pool** (safe gold zone r 2.4, 10 s): standing in it gives +25% move speed. **Purpose:** kill-timer objects that zone the arena; teaches the gold "go here" zone.
  4. *Break Check: War Horn* — 5 s cast, threshold 60. Fail → 4 **Goblin Runners** (husk rig, fast, 1 reaction kills) sprint from the wall to him along a drawn path; each that arrives heals him 3% and gives +10% damage for 8 s. **Purpose:** race adds that punish a failed check.
* **Intermission 1 "Timberfall"** (7 s): he leaps to the wall and hurls 6 uprooted trees: line telegraphs (w 3, full arena) from alternating sides every 0.9 s, the next one shown 1 s ahead. Ends with a leap back onto the player: circle r 6 (dash it). Winded 3 s.
* **P2 "Spore Rot"** (new: Spore stacks, Slam→Backhand combo)
  5. Spore clouds now give **Spore** stacks (1/s inside; +8% damage taken and −5% speed per stack, max 5; 5 stacks = rooted 1 s). Sap Pools cleanse all stacks. Pods every 12 s, 2–3 at a time.
  6. *Slam → Backhand combo*: circle on you, then the cone 0.5 s later toward where you went.
  7. War Horn again, threshold 70.
* **Intermission 2 "King's Wrath"** (7 s): roar; 3 expanding **ring-waves** from him 2.3 s apart (dash through or outrun); all live pods ripen at once. Winded 3 s.
* **P3 "Troll Rage"** (no new mechanic): cycle −20%, the Backhand becomes 180°, War Horn every cycle-loop (threshold 70) with Runners on fail. Soft enrage at 75 s.

### Vashkar, the Ashen Warchief (Act II, target 80–100 s, arena R 21; resists fire 50%)
Teaches: in/out, generators, lava floor control, memory.
* **P1 "Twin Banners"**
  1. *Axe Combo (in/out)* — circle r 4.5 around him (1.2 s), then a **donut** r 4.5–11 0.5 s later. Safe: out, then in. Each combo adds +25 **Axe Heat** (glow on the axe).
  2. *Twin Banners* — two war banners planted at opposite sides of the arena (r 0.7 R). Each living banner: Vashkar takes −25% damage; it pulses a ring-wave r 0→6 every 7 s. **Purpose:** generators — damage them while baiting him away. Both down → **Disarmed**: Downed 5 s, +15 poise each.
  3. *Banner Charge* — line telegraph (w 3) toward the player, 0.9 s; leaves the lava trail (existing). One charge in P1.
  4. *Torchbearers* — when a banner falls, 2 orc thralls run from the wall to re-light it (banner returns at 50% HP if one arrives). **Purpose:** race adds that make banners a priority decision.
  5. *Break Check: Molten Overswing* — at Axe Heat 100: 5 s cast, threshold 60; resolves as a cone 200° r 14 that leaves fire on the ground for 6 s. Success → "Quenched", heat 0, Downed.
* **Intermission 1 "Ashfall"** (8 s): he plants the axe at the centre; 3 lava lanes (line w 3, full arena) sweep in a shown order 1.6 s apart. Winded 3 s.
* **P2 "Cinder Memory"** (new: memory marks, double charge)
  6. *Cinder Memory* — every 0.5 s for 3 s an ember mark drops where you stand (6 marks, circle r 2); then they detonate in the order dropped, 0.35 s apart. First time: 3 marks, 2 s lead.
  7. *Double Charge* — two charges, the second re-aimed; lava lasts 3.5 s.
  8. Banners re-raised at positions rotated 90°, +30% HP. Overswing threshold 70.
* **Intermission 2 "Molten Tide"** (8 s): lava rises at the rim — the arena becomes R 16 for the rest of the fight (1.5 s warning, a gold ring shows the new edge); 4 meteor lanes in sequence. Winded 3 s.
* **P3 "Warchief's Fury"** (no new mechanic): Meteor Rain (6 circles r 2.5, 1.1 s) in two offset waves; one banner only (+60% HP); Overswing every 30 s. Soft enrage at 95 s.

### Aurelith, the Prism Dragon (Act III final, target 100–120 s, arena R 22)
Teaches: read the ward → predict the attack; line of sight behind pillars; generator; puddle placement.
* **Ward language**: the Prism Ward colour (cycle 10 s) names her *next* special: fire → **flame lanes** (3 parallel lines), frost → **frost ring-waves** (2, dash through), storm → **Tempest** (3 strikes that chase you 1.2 s then lock, circles r 2.2), arcane → **shard circles** (6 delayed circles r 2.2). A reaction on her breaks the ward: that family's next cast is cancelled, +10 poise.
* **Arena**: 4 crystal pillars (r 1.2, collision) at r 0.55 R. Pillars block beams; the shadow wedge behind each pillar is drawn as a gold safe zone while a beam is live.
* **P1 "Refraction"**
  1. *Twin Beams* — existing sweep (2 beams, 1.2 s tell, 140° over 3 s); pillars block.
  2. *Ward specials* — one family per ward cycle.
  3. *Prism Conduits* — 2 crystal generators at the wall, a gold line to her. While either lives the ward re-forms 3 s after it is broken. Both down → ward down 8 s, Downed 4 s. **Purpose:** generators that gate the ward-break reward.
  4. *Break Check: Prism Nova* — 6 s cast, threshold 60. Fail → arena-wide nova (60% max-HP-scaled hit) except inside pillar shadows. Two answers: stagger her, or hide.
* **Intermission 1 "Skyward"** (8 s): she lifts to the centre (untargetable); one beam rotates 360° over 5 s with 3 gaps marked by safe wedges; then a crash ring-wave. Winded 4 s.
* **P2 "Storm Reach"** (new: Lightning Rod, quadrant)
  5. *Stormcaller Wyvern* — one at a time; killing it leaves a **Lightning Rod** (safe gold zone r 2, 10 s). While you stand in the rod, Tempest strikes hit the rod instead. **Purpose:** you choose where the puddle lands by where you kill it.
  6. *Quadrant Prism* — 3 of 4 quadrants (cones 90°) fire in sequence, the safe one marked gold.
  7. Nova again, threshold 70; pillars crack (3 hits from her beams destroy one — fewer shelters).
* **Intermission 2 "Floodfall"** (8 s): the river rises — arena R 22 → 17 (gold ring warning 1.5 s); shard rain (8 circles every 1.5 s ×3). Winded 4 s.
* **P3 "Prismatic Overload"** (no brand-new shapes): ward cycle 7 s and two families can overlap; Quad Beams (4 beams). At < 8% HP the ward cycles every 3 s and every break gives +15 poise (a final stagger). Soft enrage at 120 s.

**Cut** (from research): Gorrak stump line-of-sight, boulder toss; Vashkar tethers, Warcry check, bare-hands last stand; Aurelith Ember Whelps/Scorch, Shatterfall cracks, pillar regrowth.

---

## Pass 5 — Music: one score per boss

(See `design/research/12-boss-scores.md`.) Each boss gets its own score that **replaces** the act music when the Seal closes: intro stinger on the landing → Phase 1 → (intermission: drums drop, sustained pad + riser) → Phase 2 (more layers) → Phase 3 (full) → enrage layer → death resolution cadence. Phase changes quantise to the next bar. Echo fights replay the score at P2 with a detuned "ghost" choir layer. Scores are data objects + a small set of new instruments (brass, choir, war drum, timpani, bell) on the existing lookahead scheduler.

**Cut.** Sample playback, per-mechanic musical cues beyond stingers (phase, downed, break-check success/fail).

---

## Pass 6 — Rewards: Boss Relics

New relic tag `boss` (gold-crimson), never in normal chests; offered by Echo Chests and Heat 3 chests.

| Relic | Effect |
|---|---|
| **Gorrak's Tusk** | Your dash ends in a shockwave (r 3, stun 0.5 s, knockback) and has −25% cooldown. |
| **Vashkar's Brand** | Foes' fire resistance is ignored; Burning foes spread Burn to 2 others on death. |
| **Aurelith's Scale** | Every 12 s your next reaction is guaranteed to echo and breaks Prism Wards. |
| **Riftbreaker's Sigil** | +60% Poise gain; Downed bosses take +20% more damage from you. |

---

## Pass 7 — HUD, balance, verification, scope lock

* **HUD**: nameplate shows 3 phase pips + notches at 66/33; Poise bar under it (steel-white, threshold marker during a Break Check, "DOWNED" state); a cast bar for Break Checks / named casts; affix pips (Wrath) and an Echo ghost pip; "EXPOSED" glow. Obelisks: edge markers, an approach card at ≤ 10 u (name, cost, pay, computed "≈ −N levels" for Haste, the rolled affix for Wrath), a channel ring, armed chips on the act timeline; the timeline's boss marker slides to "now" on Haste.
* **Balance targets** (sim, n ≥ 8 per lane): default lane TTK Gorrak 60–75 s, Vashkar 80–100 s, Aurelith 100–120 s, bot death rate not worse than v4.2 by > 10 pts in god-off A/B. Haste@1:30: TTK ≤ 1.35× target. Poise: 1 natural Downed per ~25–30 s for a reaction build.
* **Verification**: every boss phase + intermission captured with `src/dev/shot.js`; `jumpToBoss(id, { phase, echo, heat })` dev helper.
* **Scope lock**: everything above; everything in the Cut lists is out of v5.

---

## Pass 8 — Playtest round 2 tuning (v5.1)

Round 2 (six personas: Rhea, Viktor, Mila, Noor, Ilse, Dex; reports in `design/playtest/round-2/`) ran the v5 build. The numbers below override Passes 1–7 where they differ; `design/RAID.md` and the DESIGN.md sections §3b and §9b carry the v5.1 values. Reasons cite the reports.

| Area | Passes said | v5.1 | Reason (round 2) |
|---|---|---|---|
| Haste Windfall | 30% of act XP still ahead | **40%** | Haste was a net loss, −2 to −4 levels, "never a good pick" (Viktor) |
| Echo pay | +15 / 22 / 30 shards | **25 × actMult** shards | payouts were thin: Echo 15, Wrath 3 at 30 shards in Act I (Viktor) |
| Wrath pay | 5 / 12 / 30 × actMult | **8 / 20 / 45 × actMult** (total at that heat) | same as above |
| Act III chest and cache perks | relic choice / Boss Relic | **+20 shards each** | the run ends at the kill, so the perk is worth shards there (**reason not in the reports; confirm**) |
| Wrath channel | up to 3 channels in the ring | **step out and back in** after each heat | standing in the ring overshot to heat 3 in 12 s (Viktor) |
| Boss HP | not set (re-tune in Pass 7) | Gorrak **14,500** · Vashkar **24,000** · Aurelith **86,000** (× (1 + 0.3·tier)) | sim-calibrated; **open:** round-2 fights ran long (Gorrak 137 s, Vashkar 174 s), so confirm the direction of this change |
| Vashkar banner DR | −25% per banner | **−20%** per banner | banners shielded him and the bot never killed them; the fight ran 174 s (Rhea) |
| Reaction Stagger | flat per reaction | × 1 / (1 + fatigue/4); +1 fatigue per reaction, decays τ 4 s | reaction spam filled the bar on its own: 98 Stagger in 10 s, 7 of 7 War Horns broken in ~2 s (Viktor, Rhea) |
| Status pressure (new) | — | +1.5 every 0.5 s while the boss carries Burn, Chill or Shock | mono-element builds failed 7 Break Checks in a row (Viktor): a single-element path is needed |
| Perfect Dodge on a boss attack | +5 | **+10** | Stagger ignored dodging: "fills whether or not you dodge" (Rhea) |
| Rift Crystal blast on the boss | +6 | **+10** | crystal blasts are the skill expression for non-reaction builds (Rhea) |
| Gorrak Stagger bar | 100 | **110** | Gorrak was Downed or stunned for most of phase 1 (Rhea) |
| Break Check target | fixed threshold per phase | **max(base, current bar + base), capped at the bar** | reaction builds broke 7 of 7 War Horns in ~2 s (Viktor) |
| Freeze and stun on bosses | freeze 0.6 s; stun cap 0.3 s | no re-freeze for **4 s** after a freeze; stun **once per 1.5 s** | bosses stayed stunned through phase 1 (Rhea) |
| Intermissions | 6–8 s | **7–9 s** | King's Wrath killed two runs inside one intermission and the pattern was unexplained (Rhea, Noor); more time to read it |
| King's Wrath ring spacing | 2.3 s apart | **3.2 s apart** | back-to-back waves did 20–27 each, 60+ HP of a 90 HP caster (Rhea) |
| Dash-through ring patterns | ≥ 2.2 s apart | **≥ 3.2 s apart** | same as above |
| Aurelith frost ring-waves | 2 waves (spacing open) | **3.2 s apart** | same as above |
| Gorrak combo backhand | 0.5 s after the slam | **0.85 s** lead | the backhand fired fast after the slam; ranged builds could not get behind him (Rhea) |
| Safe-zone gold | pale gold `0xffe9a8`, no stripes | **`SAFE_GOLD` `#ffc83a`, solid rim + diagonal stripes**; gold only for safe | pale gold read as khaki; gold discs looked like crystal rings (Noor, Ilse) |
| Haste colour | gold | **pale cyan `#bfefff`** | gold is reserved for safe zones; the gold Haste ring sat among the other gold rings, which Noor could not tell apart |
| Level-up and chest modals | not held during the boss | **held** during the Seal and for 2.5 s after the landing | the boss landed under open modals and the arrival was lost (Mila) |
| Boss Relics | 4 | **6** (+ Ashen Standard, Hollow Heartstone) | a pool of 3 felt like the same choice; Echo and heat-3 choices need range (Viktor) |
| Death and one-time tips | not specified | the death screen names the killing move; one-time tips for Stagger, intermissions, Winded, Break Checks and King's Wrath | "backhand" killed with no warning and no tip (Mila); DOWNED and WINDED undefined (Noor) |

**Open (for the orchestrator):** (1) the HP increase against the round-2 overshoot (see the Boss HP row); (2) the reason for the Act III +20 shards rule; (3) round-2 Vashkar banner pulses, lava and charge hit an expert-hands bot for 27 each, which contradicts the calibration (Rhea): verify before the next round.

---

## Pass 9 — Playtest round 3 (v5.2)

Round 3 (seven AI personas: Rhea, Viktor, Mila, Noor, Ilse, Dex, Ola; plus one human playtester's notes; reports and synthesis in `design/playtest/round-3/`, plan in `PLAN-v5.2.md`) ran the v5.1 build. Verification sims (128 runs per build, auto-cast bot, v5.1 baseline vs v5.2) are in `design/raid-sims-v5.2.md`. The numbers below override Passes 1–8 where they differ; `design/RAID.md` carries the v5.2 contracts and DESIGN.md §3b and §9b carry the v5.2 values. Reasons cite the reports.

| Area | v5.1 | v5.2 | Reason (round 3) |
|---|---|---|---|
| Arena fodder (new) | Adds only when a mechanic needs them; none spawn during the fight | Phase-scripted waves at each phase start and every 18 / 20 / 22 s (Gorrak 3–4–5 imps and spitters; Vashkar 3–4–5 cinderlings and magma rams; Aurelith 4–5–6 shardlings). Normal XP, 8% orb chance, XP paid when the field clears. Paused during Break Checks, never in intermissions | "Missed the chaos" (human); "more tense, less powerful" and the chain counter at 0 in the lull (Mila); "the arena is calmer than the act" (round-3 synthesis) |
| Health inside the fight | Adds 1% orb, boss orb on death only, regen 0.3 HP/s, Echo Rift Mend | Fodder orbs 8%; a broken Break Check drops an orb 30% of the time; each intermission end heals 12% max HP; all dash charges refilled at the start of an intermission (was +1 charge at its end) | "Nothing heals you in the fight" (human, Rhea, Mila, Dex, Viktor, Ola); Mila died in intermissions with nothing to heal. Rhea wants it earned, Mila and Ola want it given: earned but generous |
| Auto-cast target with a boss up | Nearest enemy in range (the boss, inside a sealed arena) | Goal adds (runners, torchbearers) 3 > Rift Crystal next to the boss 2.5 > mechanic objects (ripening pods, banners, conduits, wyvern) 2 > fodder 1 > boss 0.5. Nearest-first outside boss fights | Auto-cast fired at Gorrak 14 of 14 times while three runners healed him (human, Ola, Rhea); "auto-cast has no priorities" (Ola) |
| Objective marks (new) | Runners, banners, pods, conduits and wyvern unmarked; a runner is a small figure with no ring | A ground ring and tether to the boss in the add's colour (runners and torchbearers orange, banners cyan, pods lime, conduits violet, wyvern pale cyan), plus HUD edge arrows for off-screen objectives | Ilse only noticed Gorrak's runners when his bar rose; the wyvern is a ~40 px figure at the rim. Marks also tell auto-cast users where to steer (Ola) |
| Gold | Conduit body and link beam, beam core, storm ward (`#ffe14a`), storm bolts, pods, storm crystal ring, Stormcaller ring, big XP gem all gold or yellow | Gold only for safe: conduits violet, beam core white, storm ward lime `#9cff3a`, tempest bolts `#c8ff6a`, pods lime, big XP gem violet, storm crystal and Stormcaller rings `#cfe0ff` | "Gold is not only 'safe'" (Rhea, Ilse); under deutan vision the damaging beam and the gold shelter stripes became one yellow (Rhea, Ilse) |
| Break Check target | Absolute number that could pass the bar ("stagger 171"); bar grows ×1.25 after every Down | Shown as a % of the bar ("break 60%"); per-Down growth capped at ×1.5 per phase | Viktor, Ola, Rhea, Mila: the target climbed 100 → 125 → 156 → 195 in a long phase and printed as an absolute number next to a 0–100 bar |
| King's Wrath rings | Full rings, ring damage 0.6, no walkable gap | 0.7 rad gold striped gap per ring, tracking the player's side wave by wave; ring damage 0.5 | "The one input that excludes limited dexterity" (Ola); King's Wrath needs a timed dash (Ola, Rhea) |
| Vashkar intermission lava | Lanes w 3 (Molten Tide 3.4), telegraph hit 1.2, lava tick 0.28; no safe pocket | Lanes w 2.25 (Tide 2.55), telegraph hit 0.5, lava tick 0.16; one gold safe pocket (r 2.8) per intermission; the whole intermission capped at 30% max HP | Vashkar's intermission lava did 23–80 HP while he was untargetable; "worst moment" (Mila); lava spike (Dex) |
| Aurelith Prism Crash | Uncapped; one crash took 30 HP in round 3 | At most 22% of max HP | Intermission HP cliffs (Rhea, Mila, Ola, Viktor, Dex) |
| Phase minimum time (new) | HP gate only; Gorrak fights 37–177 s against 60–75 s | `minPhase` Gorrak 12 s, Vashkar 18 s, Aurelith 30 s of fight time per phase; the gate holds until it has run; Downed time doesn't count | "Fight length depends on the build, not on play" (Mila, Rhea, Viktor, Dex); burst builds skipped the script ("a skipped boss") |
| Boss HP | Gorrak 14,500 · Vashkar 24,000 · Aurelith 86,000 | Gorrak **12,000** · Vashkar **21,500** · Aurelith 86,000 (unchanged) | Sim-calibrated (`design/raid-sims-v5.2.md`): fodder waves and the auto-cast priority took about a third of the bot's casts off the boss, so lane-none fights grew from 64 to 88 s (Gorrak) and 98 to 113 s (Vashkar). After the cut: Gorrak 76 s, Vashkar 108 s (auto-cast bot; mouse aim is faster) |
| Vashkar banner DR | −20% per living banner | **−15%** per banner | Banners stretched Vashkar into the soft enrage with a single-target build (Rhea) |
| Vashkar soft enrage | 95 s | **115 s** | Same as above; the phase minimum floors the unenraged script near 80 s |
| Stagger: Perfect Dodge and Rift Crystal | +10 and +10 on a boss | **+20** and **+20** | Reactions were 55–75% of Stagger; dodges and crystals were 1–3% (Viktor, Rhea, Ola). Decided as "lean skill" by the orchestrator |
| Reaction fatigue | × 1 / (1 + fatigue / 4) | × 1 / (1 + fatigue / 3) | Mono-fire failed War Horn 5 of 5 (Viktor); reactions were 55–75% of Stagger (Viktor, Rhea, Ola) |
| Obelisk cards | Player text uses Windfall, Strain and Heat; "≈ −2 levels after the Windfall"; Wrath reads "Heat" | Plain words: "net −2 levels by the boss", Wrath tagged "Danger" and "boss gets harder", Echo reads "You take +10% damage", Haste warns "Low HP: the boss arrives now" below 40% HP, Echo card lists Rift Mend | Obelisk jargon and the contradictory "−2 levels after the Windfall" (Noor). The Haste low-HP warning is a round-3 backlog item (REPORT.md, Next); no single persona is cited |
| Act III Haste | Bounty ≈ 75 shards on a Haste skip (includes the +20 perk); chest line on the card | No shard bounty in the final act; the chest line is dropped | "Act III Haste is free shards" (Viktor): the lost XP and levels are worth nothing when the run ends at the kill |
| Rift Mend | Never announced | Announced "Rift Mend: +20% HP, dash refilled"; one-time tip | "Rift Mend is never announced" (Noor, Mila) |
| Death screen | Run-wide damage list ("Orc Spirit-Shaman 23%"); no obelisk bet, no entry HP; killer row unverified ("prism beam 100%", Rhea) | "This fight" damage only; a "Your bets" block (obelisks armed, entry HP, shards lost); killer row matches the fight's breakdown; tips for the phase top-up and Rift Mend | The death screen doesn't link the obelisk bet (Noor); Mila's death blamed a run-wide source |

**Open (for the orchestrator):** (1) fight lengths after the HP cut, auto-cast bot, no obelisks: Gorrak 76 s (median 74, target 60–75), Vashkar 108 s (median 109, target 80–100), against 64 s and 98 s in v5.1. Both are within 25% of target, so no further retune; Vashkar still runs long, so check it on the next human run. Victories fell from 2 to 0 across the batch (one run per build hit the 900 s cap). (2) Storm ward lime `#9cff3a` breaks the element-colour link: storm is yellow elsewhere, and the ward no longer matches it. (3) Elite Surge's Relic Bearer is still gold-marked, which is outside the arena and breaks the "gold means safe" rule; decide whether to recolour it. (4) Stagger direction was decided as "lean skill" by the orchestrator, not by the team: confirm before the next round, since the other reading is "accept the build check" with no change to the Stagger numbers.
