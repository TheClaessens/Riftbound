# Ola — motor accessibility · playtest round 3
**Verdict (in character, 2–3 sentences).** With auto-cast on I can play a whole boss fight with one hand on WASD + Space (the level-up cards take 1/2/3), and that is a real achievement: the game never asks me to click or aim. But "auto-cast" is "fire at the nearest foe", so it has no concept of banners, pods, crystals or break checks, and the one mechanic I truly cannot do, dashing through King's Wrath's rings, hit me for the same ~50 HP in every Gorrak fight and killed me three times out of four. I'd keep playing, but I'd stop at the second intermission every time until the game lets me survive it without a timed dash.
Fun: 6/10 · Would play again tomorrow: maybe · Domain score: 6/10

## Session log
Settings: persona `ola`, casual hands, `?unlockall`, `PT.autoCast(true)` after every start (verified via `window.__game.autoCast`) except run 6. "Kit" = what my drafting policy produced (prefer new skills that need no cursor, then ranks, then passives).

| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| 1 | Cryomancer T1, auto-cast, no obelisk, Primer on | Died Act I 9:50 L10, boss 25% (phase 3/3). Gorrak landed 4:34, fight **316 s**, enraged at ~95 s | Ice Shard r1, Spirit Orbs r1, Frost Nova r1 + Vitality x2/Haste/Volley (my policy over-picked passives, a weak build) | 43 | War Horn 0/5 broken (required stagger 60 → 171 as the enrage stacked). HP 170 → 0 over five minutes |
| 2 | Pyromancer T1, auto-cast, no obelisk | Died Act I 4:26 L11, boss 23% (phase 3/3). Entered the seal at 58/90 HP, fight **85 s** | Cinder Bolt r3, Orbs r2, Fireball, Static Field, Meteor; 90 reactions (Overload) | 66 | King's Wrath took 34+17 in intermission 2 (90 → 19 HP), backhand finished me |
| 3 | Arcanist T1 (+Vigor/Might), auto-cast, **Haste** channelled | Died Act I 2:22 L8, boss 23%. Fight ~55 s | Arcane Bolt r2, Orbs, Fireball, Frost Nova r3, Chain Lightning | 30 | War Horn **broken**. King's Wrath 17+34, then backhand 35 on 14 HP |
| 4 | Stormcaller [jumped][assisted 0.5] Act II boss | Died 1:20 into the fight, Vashkar 37% | Spark r4, Chain Lightning, Frost Nova, Fireball, Static Field, 17 levels drafted | n/a | Molten Overswing check failed. Last two hits were "Vashkar: contact" 26 and 24 |
| 5 | Cryomancer [jumped][assisted 0.5] Act III boss | **Won**, Aurelith, fight **195 s**, L26, 246 HP | Ice Shard, Chain Lightning, Orbs r5, Static Field, Fireball r5, Vitality r5 | n/a | 3/3 Prism Novas broken, never below 206/246 HP |
| 6 | Pyromancer T1, **auto-cast OFF** (comparison), no obelisk | Died Act I 4:18 L10, boss 24%. Entered at 64/106 HP, fight **77 s** | Cinder Bolt, Singularity r2, Fireball, Orbs, Blizzard | n/a | War Horn 1 broken / 1 failed; King's Wrath 17+34 again, backhand 32 killed |
| 7 | Stormcaller [jumped][assisted 0.5] Act I boss, auto-cast | **Won**, fight **56 s**, ended 85/106 HP | Spark, Fireball r5, Chain Lightning, Frost Nova, Static Field | n/a | War Horn broken at 0:52 |
| 8 | Cryomancer [jumped][assisted 0.5] Act I boss, passives-first build | **Won**, fight **108 s**, ended 116/146 HP | Ice Shard r2, Fireball, Static Field + Catalyst/Amplify r3 | n/a | Watched for pods/runners: none listed in the HUD, one ripened pod burst into a red sap pool (shot) |

## Highlights (what worked — keep these)
- **A fully mouse-free, one-hand run is possible.** The controls panel lists WASD move, mouse "aim and cast your starter", Q/E/R "cast learned skills", Space dash, T toggle auto-cast, Esc pause. With auto-cast on I never needed the mouse in play; the level-up cards show 1/2/3 key hints. [read] [data]
- **The Auto-cast setting is easy to find and clearly worded**: a toggle in the settings ("Skills fire at the nearest foe. Toggle in a run with T") and a HUD chip with its own T key. It is on from the first screen, not buried. [read]
- **Reaction/Stagger build engine works for an aim-less player.** In auto-cast fights the bar was filled by `status`, `steam`, `overload`, `combust`, plus Rift Crystal blasts (`crystal` +9.5 in three separate auto-cast fights, I never aimed at one). Stagger Downs came every 10–20 s, and Aurelith's Prism Nova was broken 3 of 3 times. v5.1's "a burning/chilled/shocked boss builds Stagger on its own" clearly lets an auto-caster get there. [data]
- **Break Checks are survivable without aiming when the build is healthy**: broken 1/1 (run 3), 1/1 (run 7), 3/3 (run 5), 1/2 (manual run 6). They fail when the bar can't reach the number in 5 s, not because of aim. [data]
- **Intermissions are mostly safe to ride out** (Timberfall cost 14–32 HP, Aurelith's intermissions 0–50 HP) and the 7–9 s length gives a casual player a breath. The "INTERMISSION · I · TIMBERFALL 1.1" strip in the HUD names what is coming. [data] [read]
- **Level-up modals now wait for the boss to land**, and pause the fight, so card reading is untimed. [seen]
- **Safe zones read well in the Aurelith shot**: solid gold striped bars behind the pillars, a red beam clearly different, hero small but ringed. (shot: `playtest/out/ola-r3-aurelith-objects.png`)

## Pain points (ranked, worst first)
1. **King's Wrath cannot be survived without a timed dash, and it is the same fixed bill every fight.** In all four Gorrak natural fights the Wrath rings cost 41–51 HP (34+17, 17+34, 17+34, 28+13), roughly half the HP of Pyromancer/Arcanist (90–116), and the next backhand (27–35) finished me with the boss at 23–25% in three of four runs (including the manual-aim one). It is delivered in intermission 2 right after I have had my HP drained by phase 2, so there is no way to be at full HP going in. For someone who cannot time a dash through a ring (or who plays with a switch, delayed input, or tremor), this is the wall. The tip explains the verb, but not what to do if you cannot do it. [data] [seen death screen: "Slain by Gorrak backhand… The last moments: kings wrath −17, −35, backhand 0 hp"] · Severity: **major** (blocker for dash-limited players)
2. **Auto-cast = "nearest foe", with no boss priority and no object targeting.** It worked in these fights because Gorrak, Vashkar and Aurelith were almost always the only living foe (`en1` in ~90% of samples). It never targeted banners (Vashkar's single banner survived 0:12–0:48 untouched, and was only removed when area spells happened to cover it), conduits (both Aurelith conduits survived about a minute; one died around 0:50), pods (a ripened pod bursting into a red sap pool, run 8 shot) or crystals (hit only incidentally: `crystal 9.5` three times). If an add stands closer than the boss, auto-cast will shoot the add; if a banner is behind the boss it is never selected. [data] [seen] [inferred] · Severity: **major**
3. **The Break Check number can outrun an auto-caster in a long fight.** In the slow run (weak build) War Horn demanded stagger 60, 73, 160, 70, 137, 99, 171 over the fight (enrage raises it), and I failed all of them (0 of 5+). Failing resolves into big damage and a longer fight, which snowballed: 316 s total. The stagger bar tops out at 100% on screen, so "fill to 171" is not something a player can read on the bar. [data] [read] · Severity: **major**
4. **Slow-build fights balloon and enrage (316 s Gorrak).** With a below-par build the fight is not a test any more, it is an endurance run, and an auto-cast player is the one most likely to hold a weak build (cards that need cursor aim look worse, so I avoided them). Gorrak enraged ~95 s in. [data] · Severity: **minor/major**
5. **No input assist options beyond auto-cast.** No key remap, no hold-vs-toggle choice (not seen in settings: Unlock all, Auto-cast, Tutorial, Screen shake Full/Low/Off), no dash assist, no slow-mo/"relaxed" toggle, no one-key "retarget boss". [read] · Severity: **major** for the domain
6. **Pre-boss HP is not restored and not shown as a decision.** I entered the seal at 58/90 and 64/106 HP in the two pyromancer runs, and for casual hands that decides the fight. A free "seal heal" or a visible pre-boss recover moment would help everyone. [data] · Severity: **minor**
7. **Primer text assumes mouse and key holds** ("Hold lmb to cast Ice Shard. Move with wasd.") even though auto-cast is on; it still needs `space` timing taught on step 2 ("Dash just as an attack lands for a PERFECT dodge"). [read] · Severity: **polish**
8. **Stale tip during a boss fight**: "Some foes carry a Prism Ward — immune to one element. Mind the lightning circles." sat under the Gorrak frame in Act I. [read] · Severity: **polish**

## Bugs & oddities
- Boss HP **rises** between samples in the slow fight (run 1: 91% → 95%, 85% → 87%, 58% → 60%) with `en` 3–5 at the same time. Looks like healing runners/pods that auto-cast ignored; the HUD never listed them (the "objects:" readout only shows for Vashkar/Aurelith). [data] [inferred]
- For Gorrak, `state.boss` never listed objects even though a pod was visible in two shots (`ola-r3-gorrak1-mid.png` yellow egg; `ola-r3-gorrak5-u3.png` burst pod with red/green pool). The pod is not in the HUD's object list; its sap pool is red, which is correct danger colour but looks the same as an enemy attack ring. [seen]
- A War Horn that "resolves" and a boss that is `ENRAGED` still show the same "stagger N" label; the requirement grew from 60 to 171 with no on-screen warning that it is scaling. [data]
- My Cryomancer start was in the Primer (tutorial). Primer step texts appear while auto-cast is on and still say "Hold lmb". [read]
- Vashkar's killing blows were "Vashkar: contact" 26 and 24 at 106 max HP / assist 0.5. Contact damage is not telegraphed like his swings. [data]

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Give King's Wrath an input-free route: e.g. when a ring is coming and the player is standing in a "gap" lane/gold safe pocket, or give the rings a no-dash option (walk-through at reduced damage, or a larger gap you can simply stand in). Or add a general **dash assist** ("auto-dash" to a perfect dodge on a telegraphed lethal hit, with a cooldown) in settings. | #1 | Removes the one mechanic that excluded me; every class survives intermission 2 without a timed press | M |
| 2 | **Smart auto-cast priority** (setting: "Auto-cast: nearest / boss-first / smart"): boss when the boss is targetable, otherwise runners → pods → banners/conduits → crystals when a Break Check is active and the bar is short. | #2, #3 | Auto-cast completes add priorities without aim; Stagger breaks more reliably | M |
| 3 | Show the Break Check requirement on the Stagger bar itself (a marker, already described in the tip), and cap the enrage scaling of the requirement so a slow fight is not a death spiral. | #3, #4 | The player can see "I need 60 more" instead of "171"; slow builds can still win | S |
| 4 | Add an accessibility panel: remap keys, **toggle** instead of hold wherever held, "relaxed" telegraph timing (+25–50% lead on cones/rings), optional pause-and-resume or slow-down during intermission patterns. | #5 | Opens the game to switch/one-hand/tremor players | M |
| 5 | Heal to a floor (e.g. 70%) when the Seal closes, or drop a heal-pool in the arena before phase 2. | #6 | Pre-boss HP stops deciding the fight for casual hands | S |
| 6 | Update the Primer for auto-cast: if on, skip "hold lmb"; teach "stand in gold, Space only when X". Replace the Act I "Prism Ward" tip with the boss tip of the moment. | #7, #8 | Clearer onboarding for the same audience | S |

## Domain deep-dive
**Q: Does auto-cast pick sensible targets during a boss fight?**
- *The boss:* yes, in practice, because in these boss rooms the horde is cleared ("the horde vanishes into XP") and the boss is usually the only foe. In 8 runs the HUD showed `en1` in the great majority of 4–8 s samples. [data]
- *The in-game description is honest:* "Skills fire at the nearest foe." That is the whole rule. It has no boss priority, no object priority. [read]
- *Adds that matter:* runners racing to heal the boss, as best I can read them: in the slow Gorrak run the boss's HP went up four times between samples while `en` was 3–5, i.e. they were not killed before they arrived. Pods: a pod ripened and burst (sap pool in the shot) and I picked up `spores` once at 9:06. Banners (Vashkar): 2 banners at the start, one gone by 0:12 (area spells), the other survived until intermission; phase 2 respawned two banners, one died ~1:05. So banners die only by accident of area spells. Conduits (Aurelith): two alive from the start; one gone at ~0:50, the other gone later; also by accident. Wyvern (Aurelith): damage "Storm Wyvern: hit" 5.6 was logged once, killed/ignored unknown; no lightning rod evidence. [data] [seen] [inferred]
- *Crystals:* hit by incidental fire (`crystal` stagger +9.5 in three fights, never aimed). Reliable only if the crystal is in line with the boss. [data]
- *Counter-test with auto-cast off:* the bot manually aimed at the boss; the outcomes were the same (boss 24%, King's Wrath 51 HP, backhand kill). The only visible difference was one extra Break Check broken (1/2 vs 0/1). So for this build auto-cast cost almost nothing, and the bot hands can't tell me whether a human's manual aim would be better. [data] [harness caveat]

**Q: Can a player who relies on auto-cast complete every mechanic?**
| Mechanic | Needs | Auto-cast completes it? |
|---|---|---|
| Kill the boss | stay in range, any damage | Yes |
| Break Check (War Horn, Molten Overswing, Prism Nova) | enough Stagger in 5–6 s: reaction/status builds fill it, crystals help | Mostly (6 of 10 broken). Fails with weak or non-reaction builds |
| Rift Crystal blasts | shoot crystal while the boss stands in the ring | Incidental only |
| Spore pods | kill before ripening, or leave the sap pool | Not targeted; avoid the red pool by walking |
| Runners racing to heal | kill them | Only if nearest (probably) |
| War banners (shield 20%) | kill them or ignore | Incidental |
| Prism conduits | kill/avoid | Incidental |
| Intermissions: Timberfall, Molten Tide, Floodfall | walk away from circles | Yes, with WASD |
| **King's Wrath rings** | **dash through each wave at the right moment (3.2 s apart)** | **No. Needs a timed Space press for each ring** |
| Aurelith's sweeping beams / pillars | walk to a pillar's gold stripe | Possible with WASD, no aim |
| Perfect dodge for Stagger | timed Space on an incoming hit | No, optional |

**Q: What has to be held, timed or aimed? (full input list)**
- **Held:** WASD (movement, continuous; the whole fight depends on it). With auto-cast off, LMB held to cast the starter skill and Q/E/R for learned skills; with auto-cast on, none of these. Channelling an obelisk (stand 4 s in its ring) is "hold position", which PT.channel did for me; it is the only held-position mechanic.
- **Timed:** Space dash for King's Wrath rings (each ring, ~3 s apart) and for perfect dodges. Level-up cards (keys 1/2/3) are untimed (modal pauses). Break Check is a 5–6 s window, but you fill it by existing builds, not presses.
- **Aimed:** nothing with auto-cast on. Without it, the skills aim at the mouse cursor and Q/E/R fire where the cursor points; **Singularity is "at the cursor"**, so I avoided it.
- **Minimum input load to succeed:** one hand (WASD) + one finger for Space + T once. Keys 1/2/3 for cards. No mouse. [read] [data]

**Q: What is the minimum input load, and which mechanic excludes limited dexterity?** WASD + Space; the exclusion is **the timed dash through King's Wrath** (and any "perfect dodge" optional play). Dash is "nothing can hit you mid-dash", so it is a pure timing check, not a spatial one.

**What I'd need as a player who can't aim or time precisely:**
1. A boss-first / smart auto-cast mode (or a "lock target on boss" key) and a Break-Check-aware mode.
2. An auto-dash or dash-assist for lethal telegraphed hits, or ring waves that can be waited out by position.
3. Toggle-not-hold options, key remap, and a "relaxed" slow telegraph speed.
4. A visible Break Check marker on the bar and the requirement frozen when I'm enraged.
5. A heal on Seal, or visible heal pools, since I will take unavoidable damage somewhere.
6. Larger, higher-contrast pods/banners/conduits with a "kill this" pulse, so I can steer toward them with WASD (auto-cast shoots whatever is nearest, so movement is my only aiming tool).

**Round-3 changes that landed for me:** Stagger reachable with status-only builds (yes, 6/10 breaks). Gorrak's 0.85 s backhand lead (I could not tell; the bot hands took backhand 20–35 several times, and it was the killing blow in 3/4 natural fights). Ring waves 3.2 s apart (still need a dash). Intermissions 7–9 s (good). Gold = go-here (readable in the Aurelith shot). Level-up modal waits for boss landing (yes). One-time tips (yes; the Stagger/Downed/Break Check tips showed at the right times, and the death screen's "next time Backhand is a red cone… step behind him" is a good line, though it names the backhand when the real damage was the earlier King's Wrath).

## Harness caveats
- Bot hands are not my hands. Casual bot hands dodge badly, and do not "dash through rings" at all, so King's Wrath damage is partially a bot limitation. I treat it as a finding only because the question is precisely about players who cannot time a dash.
- With manual aim the bot always shoots the boss; the manual-vs-auto comparison (run 6) therefore says nothing about a human's aim and little about target choice.
- Jumped/assisted runs (4, 5, 7, 8) are not evidence on difficulty. Act II and Act III were seen via jump with 50% damage.
- My drafting policy was a script (new skills first, then ranks, then passives), so run 1's weak build was partly my doing. It does show what a cautious auto-caster gets, though.
- `window.dmgBy` etc. were not exposed on `window`; I read `PT.play().window` instead (dmgBy, breakChecks, staggerGained, bossDowned).
- Shots have no HUD, so add and object counts come from `state.boss` and `en`, which does not list Gorrak's pods or runners.

## Findings (machine-readable)
```json
[
  { "area": "combat", "type": "issue", "severity": "major",
    "finding": "King's Wrath rings can only be avoided by a timed dash; casual/no-dash play loses 41-51 HP in intermission 2 every Gorrak fight and then dies to the next backhand.",
    "evidence": "4/4 natural Gorrak fights: kings wrath 28+13, 34+17, 17+34, 17+34; deaths at boss 23-25% in 3 of 4; death screens list 'kings wrath' in the last moments.",
    "recommendation": "Add a no-timing route (gap lane / safe pocket), or an opt-in dash assist, or make rings walkable at reduced damage." },
  { "area": "bosses", "type": "issue", "severity": "major",
    "finding": "Auto-cast fires at the nearest foe only; it has no boss priority and never targets banners, conduits, pods, runners or crystals deliberately.",
    "evidence": "Settings text 'Skills fire at the nearest foe'. Vashkar banner survived 0:12-0:48; Aurelith conduits survived ~50 s; Gorrak HP rose 91->95% while en 3-5 in run 1; crystal stagger only incidental (+9.5).",
    "recommendation": "Add an auto-cast mode: boss first, then runners/pods/banners/conduits/crystals when a Break Check or heal threat is active." },
  { "area": "bosses", "type": "issue", "severity": "major",
    "finding": "Break Check requirement scales with enrage and exceeds the visible bar (up to 171), and failing it snowballs a slow fight.",
    "evidence": "Run 1: War Horn requirements 60,73,160,70,137,99,171; 0 of 5+ broken; fight length 316 s.",
    "recommendation": "Show the marker on the bar, cap or freeze the requirement under enrage, and give a second chance (a short Downed window) for a near miss." },
  { "area": "ui", "type": "issue", "severity": "major",
    "finding": "No remap, hold-vs-toggle, dash assist or relaxed-telegraph option; the only accessibility setting is auto-cast (plus screen shake).",
    "evidence": "Settings panel: Unlock all, Auto-cast, Tutorial, Screen shake Full/Low/Off. Controls: wasd, mouse, qer, space, t, esc.",
    "recommendation": "Add an Accessibility panel with remap, toggles, slower telegraphs and dash assist." },
  { "area": "ui", "type": "praise", "severity": "polish",
    "finding": "The game can be completed one-handed with no mouse: WASD + Space + T, cards on 1/2/3. Auto-cast is on by default and well described.",
    "evidence": "Controls panel; 8 runs with PT.autoCast(true), no aim input; level-up keys 1-3 listed.",
    "recommendation": "Keep; advertise it in the Primer and the title screen." },
  { "area": "bosses", "type": "praise", "severity": "polish",
    "finding": "Stagger/Downed/Break Check work for aim-less, reaction-based builds (6 of 10 Break Checks broken, 3/3 on Aurelith) and crystals and statuses feed the bar without aiming.",
    "evidence": "staggerGained: steam/overload/combust/crystal across auto-cast runs; bossDowned stagger/break events every 10-20 s.",
    "recommendation": "Keep the self-building status stagger." },
  { "area": "balance", "type": "issue", "severity": "minor",
    "finding": "HP at the Seal is not restored, so casual hands enter with 58/90 or 64/106 and cannot absorb a King's Wrath.",
    "evidence": "Runs 2 and 6: 58/90 and 64/106 at boss landing.",
    "recommendation": "Floor-heal at the Seal, or drop heal pools in phase 1." },
  { "area": "onboarding", "type": "issue", "severity": "polish",
    "finding": "Primer says 'Hold lmb to cast' even with auto-cast on; an Act I boss tip about Prism Ward is stale in the Gorrak fight.",
    "evidence": "Primer panel 1/5 text; PT.ui() during Gorrak 1 and 7.",
    "recommendation": "Make primer and tip text auto-cast-aware and context-aware." },
  { "area": "readability", "type": "issue", "severity": "minor",
    "finding": "Boss HUD object list omits Gorrak's pods and runners, and the pod's sap pool is red like an attack telegraph.",
    "evidence": "state.boss never listed objects in Gorrak fights though pods are visible in ola-r3-gorrak1-mid.png and ola-r3-gorrak5-u3.png.",
    "recommendation": "List pods/runners in the boss frame and give pods a pulse + timer ring." }
]
```
