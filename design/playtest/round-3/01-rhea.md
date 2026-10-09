# Rhea — challenge seeker · playtest round 3
**Verdict (in character).** The v5.1 raid layer is the best part of the game: every ground telegraph I could look at was readable, the Break Check is a real "now!" moment, and the death screen finally tells me what killed me and what to do about it. What stops me from calling it fair is HP: bosses hit in 15–30 chunks at a 90–130 HP pool, passive regen is ~0.7 HP/s, and there is nowhere in the arena to heal. A single bad intermission ends the run. Stagger still rewards reaction spam far more than it rewards my dodging. Vashkar turns into a 2.5-minute slog with the wrong class.
Fun: 7/10 · Would play again tomorrow: yes · Domain score (boss fairness, tactics, skill expression): 6.5/10

## Session log
Settings: persona `rhea`, expert hands, `?unlockall`, fresh save. The first run included the primer.

| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| 1 | Cryomancer T0 (natural) | **Killed Gorrak** in 123 s of fight (boss 3:12 to 5:15), lv 10 | Ice Shard 3 / Blizzard 3 / Frost Nova 2 / Hailstorm; Glacier Plate, Echo Stone, Stormglass Boots | n/a (abandoned in Act II) | HP 130/130 at the Seal, min 105, 109 at the kill. No obelisk. 3 War Horns, all failed. |
| 2 | Pyromancer T0 (natural, **Echo** armed) | **Died in the Echo fight**, 3:59, lv 11 | Cinder Bolt 5 / Fireball / Singularity / Meteor; Conductor's Ring, Glass Sigil (my script took it by default, max HP 90 to 54) | 49 | Main Gorrak died in 41 s. The Echo rose (full heal "Rift Mend"), then King's Wrath in its intermission killed me. |
| 3 | Stormcaller T0 (natural) | **Killed Gorrak** in 87 s, lv 11 | Chain Lightning 4 / Spark / Blizzard / Singularity / Nova; Echo Stone | n/a (abandoned) | Wrath attempt failed (see Bugs). HP 90/90 at the Seal, min 22, 27 at the kill. |
| 4 | Cryomancer T0 **[jumped]** Act II boss | **Killed Vashkar** in 118 s, lv 18 | 7-skill sprawl, Hailstorm 2, Fireball (resisted) | n/a | HP 130 at the Seal, min 102, 113 at the kill. Only 40 HP of damage in the whole fight. |
| 5 | Stormcaller T0 **[jumped]** Act III boss | **Killed Aurelith** in 116 s, VICTORY, lv 26 | Chain Lightning 5 / Tempest / Meteor 2 / Singularity 3 | 88 | HP 110 at the Seal, min 6, 33 at the kill. One Storm Wyvern hit for 50. Unlocked Rift Tier 1. |
| 6 | Arcanist T0 **[jumped]** Aurelith | **Died** 1:00 into the fight, lv 26 | Arcane Barrage 3 / Cataclysm / Chain Lightning / Blizzard | 0 | Two beams (30 each), a Nova (30) and a Prism Crash (30) on 100 HP. |
| 7 | Cryomancer T1 **[jumped]+[assisted 0.5]** Aurelith | **Killed Aurelith** in 185 s, lv 26 | Meteor 3 / Hailstorm 3 / Chain Lightning / Frostfire Comet | n/a | Damage was halved, so this one is only for fight length and stagger sources. |
| 8 | Arcanist T1 (natural, **Wrath 3**) | **Died in Gorrak's 2nd intermission**, 3:46, lv 11, 45 s into the fight | Arcane Bolt 2 / Meteor 2 / Singularity 2 / Fireball / Spirit Orbs; Echo Stone | 76 | Wrath 3 = Frenzied + Reverberating + Rift Storm. Slam + backhand combo = 60 HP in about 1.5 s. King's Wrath finished me. |
| 9 | Stormcaller T1 **[jumped]** Vashkar | **Died** to the soft enrage at 2:45, boss still at 52 % | Chain Lightning 3 / Blizzard 3 / Tempest 3 / Frost Nova | 0 | Banners never died, so the fight became a slog. HP 90 to 23 across the fight. |

I ran no tier 0 to 3 climb this round (the assignment was bosses). Gorrak was fought naturally four times with four classes; two obelisk lanes were used (Echo, Wrath 3).

## Highlights (what worked — keep these)
- **The ground telegraphs read.** Red lanes (Timberfall trees, Vashkar's charge, Aurelith's beam), red circles (club slam, banner pulse) and the pink King's Wrath ring are all clearly "danger" and clearly different from the scenery. [seen] (shots: `playtest/out/rhea-r3-gorrak-timberfall.png`, `rhea-va08.png`, `rhea-seq20.png`, `rhea-r3-gorrak-kingswrath-mid.png`)
- **Gold now means "go here".** Aurelith's striped wedges between sweep beams, the striped Prism Nova hiding strips and the Floodfall island ring are unmistakably safe space and never overlap red. On the Floodfall island I took 0 damage for the 8 s of intermission. [seen] (shots: `rhea-r3-aur-interm1.png`, `rhea-r3-aur-interm2.png`, `rhea-r3-aur-prism-nova.png`)
- **Break Checks feel great.** The cast bar, a number to hit, a 5–6 s window and a payoff of 6–8 s DOWNED. I broke 3 of 3 with the Stormcaller on Gorrak, 3 of 4 on Vashkar and 3 of 3 on Aurelith. The 3 War Horns I failed on Gorrak with the Cryomancer all hit me with "nothing" visible, so a fail costs little. A failed Prism Nova costs 30 HP, which is enough to matter. [data]
- **Soft per-fight lengths are about right for the fast classes.** Gorrak 41–87 s, Aurelith 116 s with Overload. [data]
- **The death screen is a big upgrade.** It names the move ("King's Wrath", "Prism Crash", "lava trail"), shows the last hits with timing, and gives a concrete next-time line: "dash through each ring, they come about 3 seconds apart, so your dash is back." It matches what killed me every time. [read]
- **Intermissions have identities**: Timberfall (dodge the lanes), King's Wrath (dash rings), Molten Tide (arena closing, fills the screen), Floodfall (get on the island). Floodfall and Molten Tide are the best fantasy moments. [seen]
- **Obelisk cards are legible.** Wrath showed the exact affix and cost before I committed ("Boss affix: Reverberating... Boss HP +15%", "Packs converge on you", "Step out and back in to add more Heat"), and each heat level announces itself. [read]
- **Boss landing and Seal read as an event.** The wall ring, the landing, the HUD frame with phase pips. [seen] (shot: `rhea-r3-gorrak-landing.png`)

## Pain points (ranked, worst first)
1. **HP attrition has no outlet inside the fight.** At the Seal I had 90–130 HP; the encounter hits in 13–30 HP chunks (King's Wrath ring 15–18, slam 30, backhand 30, beam 30, crash 30, Wyvern 50). Passive regen is about +0.7 HP/s (130 to 109 took the whole of Gorrak). The only heals I saw: a single HEALTH pickup in one Gorrak fight, the Echo's full heal "Rift Mend" at its rising (a double-edged gift that sends you into phase 2), and the full heal AFTER the boss dies (27 to 82 HP on Gorrak, 33 to 68 on Aurelith). So the fight is a one-way HP budget: Stormcaller Gorrak 90 to 22, Arcanist Aurelith 100 to 24 by the end of intermission 1, then a Prism Crash for 30 killed me. There is no reward for playing clean mid-fight except surviving to the next unavoidable chunk. For a challenge-seeker this feels "fair but brittle", and it favours a big HP pool (Cryo 130) over skill. [data] · Severity: major
2. **Intermission 2 / phase-3 start is the HP cliff.** Gorrak's King's Wrath (3 rings, 15–18 each) came with 60 to 90 % of my HP already gone in three of my runs, and killed me in two (Pyro Echo, Arcanist Wrath 3). Aurelith's intermission 1 (beam sweep + Crash) did 66 damage to my Stormcaller and killed my Arcanist. These are the one spot where being unable to dash through rings hurts most. The expert hands can't do it, so I cannot say if a human can; the rings ARE visible, 3.2 s apart, and the tip text says so. [seen/data] · Severity: major (for bots), unknown (for humans)
3. **Stagger is still reaction-fed.** Per-source totals over whole fights: Cryo vs Aurelith steam 739 of about 1,300 (57 %); Stormcaller vs Gorrak superconduct 230 of about 350; Stormcaller vs Vashkar superconduct 649 of about 880. "status" (burning/chilled/shocked passive tick) is the second source at 10–20 %. Perfect Dodge and Crystal together were 9–19 across a whole fight (about 1–2 %). So the fatigue change did not make dodging a stagger source I would plan around; the bot rarely takes crystals or perfect dodges, so I can't tell whether a human would. What I can say: the numbers say reaction build is the stagger build. [data] · Severity: minor (design intent unclear)
4. **Vashkar's banners can turn the fight into a slog (and into a soft-enrage death).** With the Cryomancer (Blizzard/Hailstorm area spells) both banners died by 0:20 and the fight took 118 s. With the Stormcaller (single-target Chain Lightning) a banner stayed up for most of the fight: boss at 79 % after 70 s, 66 % after 100 s, and the soft enrage (2:39) killed me at 52 % with HP 90 to 0 through banner pulse 48, banner charge 27, lava 45, lava trail 26. A human would shoot the banner, but nothing in the HUD tells me "the shield is the thing to kill" other than the cyan beam to the boss. [seen/data] · Severity: major (readability of priorities)
5. **Gorrak combo slam + backhand can take 60 HP in about 1.5 s.** Run 8 (tier 1 + Frenzied): club slam 30 then backhand 30 back to back when I was near the arena rim. The telegraph shots show the red circle and the cone early enough for me to see them, but combined with a pocket against the wall there was no exit. Expert hands were still caught. [seen/data] · Severity: major
6. **Aurelith's tracking beam gives about 0.75 s of warning.** A thin red lane appears across the boss and my hero, then fires 0.75 s later for 30. I took 2 to 3 of these per fight (66 and 60 HP across two fights). It is visible, but it is the only telegraph I would call tight, because it re-aims at where you stand. [seen] (shots: `rhea-seq20.png`, `rhea-seq21.png`) · Severity: minor
7. **Fight length for single-target classes at Aurelith.** Cryo with assist took 185 s (target 100–120 s); Stormcaller 116 s. Fine for fast classes, a drag for others. [data] · Severity: minor
8. **Gorrak is too short for fast classes.** Pyromancer 41 s for the main body (target 60–75 s). Stormcaller 87 s, Cryo 123 s. The spread is 3x. [data] · Severity: minor

## Bugs & oddities
- **`PT.channel('wrath')` can park the hands 5–8 m away and never channel.** In run 3 (Stormcaller) I issued it at 0:50 and 70+ s later the hands were still orbiting at distance 5–8, `state: idle`, heat 0; `cancelChannel` and re-issuing did not help. In run 8 (Arcanist) it channelled and reached heat 3 at distance 1–3. Possibly the hands' own flee behaviour, not the game. [data]
- **Death screen percent bug.** Run 6: "Damage taken: Aurelith prism beam 100 %" while the killing blow was "prism crash" and 2 of 4 hits were not beams. [read]
- **Hero hard to find on Aurelith's rim.** The Arcanist's dark-purple silhouette on the purple/teal bridge area is nearly lost in `rhea-r3-aur2-prism-nova.png`. The ring under the hero helps. [seen]
- **Gold-coloured Prism Conduits with a gold link beam across the arena** share the "safe" colour code. They are objects to destroy or avoid, not "go here". Mild mixed message. [seen] (shot: `rhea-r3-aurelith-landing.png`)
- **Break Check numbers vs the bar**: the cast shows an absolute number ("stagger 109") while the bar is a percentage. 109 was reachable with a mono-frost build only with luck. The number is not the same unit as the bar I am watching. [read]
- **Echo**: "the boss falls... the Echo rises (Rift Mend)" heals me to full but the Echo is born in phase 2, and its first intermission arrives within about 5 s of rising. Healing a player who is about to take 3 rings is nice; healing right before is not the whole story. [data]
- **Glass Sigil** (max HP 90 to 54) was an available relic at the Gorrak chest. Not a bug; my draft script took the first card. I report it because a relic that halves your HP is a weird pick in a game where HP is the scarce thing.
- **Hazard text on Vashkar**: "RESISTS FIRE 50%" is clearly shown, and the announcement says "Fire will not hurt him much." Good.

## Recommendations (max 6, most impactful first)
| # | Change | Why (pain point) | Expected effect | Effort |
|---|---|---|---|---|
| 1 | Give a clean-play heal inside the arena: a heart on each phase gate (or on a successful Break Check), or +10 to 15 % of max HP when the boss is Downed by stagger | #1, #2 | Dodging and breaking checks become HP-positive, intermission 2 is survivable after a hard phase | S |
| 2 | Make the intermission 2 hits scale to a share of max HP (or reduce ring damage on tier 0) and consider a 1 s grace dash charge refill at the gate | #2 | The one unavoidable-for-bots cliff stops ending runs at 18 HP | S |
| 3 | Vashkar's banners: let area damage hit them (already true), make them take damage from auto-targeting, and add an on-screen "banner shield 20 %" chip on the boss frame; consider a 60 s timeout on a surviving banner | #4 | No more 2.5 min slogs with single-target builds; the HUD says what to kill | S/M |
| 4 | Make Perfect Dodge and Crystal blasts a bigger share of stagger (e.g. +20) and cut reaction contribution after the first 3 in a fight | #3 | Skilful play becomes the stagger plan, not just the build | S |
| 5 | Lengthen the Aurelith tracking-beam warning to at least 1.1 s (or have the lane lock on its aim 0.4 s before firing) | #6 | Beam becomes a pure movement test | S |
| 6 | Make Gorrak combo slam to backhand leave a 0.5 s gap when the player is within 3 m of the rim, or put the arena pockets away from the wall | #5 | Combos stay punishing but not unreadable | M |

## Domain deep-dive
**Per boss: is every hit telegraphed and avoidable?**
- **Gorrak.** Timberfall lanes, club slam circle, backhand cone, spore pods and King's Wrath rings are all visible. The Horn does nothing visible when it resolves (no damage seen). I could see every telegraph in the screenshots; two of my four runs ended on King's Wrath (rings dealt 15 to 18 each, 3 per intermission) because expert hands can't time the dash, which is a bot limit. With 3.2 s between rings and a dash recharge that fits, I believe a human can clear it; I couldn't verify that. The combo (slam 30 + backhand 30 in about 1.5 s) is the one hit pair I would not call "clean".
- **Vashkar.** I never got hit by a telegraphed axe combo (axe in/out) in either fight; what hurt was banner pulse (24 each, the ring turns red at the banner foot, with the hero standing next to it), banner charge (27), lava (11 each) and lava trail (13). These are floor effects and were readable. The Molten Tide intermission is the biggest visual of the game and has no damage on its own if you stay inside.
- **Aurelith.** Beam (30, 0.75 s warning), Nova (30, resolves if not broken or hidden from), Crash ring (30, 2 per intermission), Floodfall (harmless on the island), Wyvern hit (50, one occurrence, source not visible to me; I had no screenshot of its tell). Pillars and gold wedges are clear. Not all of those hits are avoidable for the bots, but the zones are fair.

**Does positioning matter?** Yes in the places where gold exists (Floodfall island, Nova strips, sweep wedges), and at the arena rim for Gorrak's combo. I could not test "behind Gorrak" or "in/out on Vashkar" because the hands choose, but a Gorrak run took 15 to 30 backhand damage every time the hands stood in front. Pillar cover on Aurelith could not be tested.

**Does Stagger reward dodging and crystals more than reaction spam?** Not in the numbers. Reactions were 55 to 75 % of Stagger in every full fight I logged; status ticks 10 to 20 %; crystals plus perfects ~1 to 3 %. The new self-building Stagger from a burning, chilled or shocked boss does let the Cryomancer reach it: Gorrak was DOWNED with 0 reactions in the first 15 s. If the goal is "plan a crystal blast and a dash through the Reverberation", the bar does not reward that yet. (Bot hands rarely pick crystals; a human could.)

**Do Break Checks still feel great?** Yes. They are the best mechanic. A named cast, an absolute number, a short window and a big payoff (6 to 8 s DOWNED). Failures were cheap on Gorrak and costly on Aurelith (Nova 30), which is the right way round. The Cryomancer's 3 War Horn failures on Gorrak were mostly due to a high starting threshold (109 / 69 / 72 / 70): it started from 7 to 26 % bar and needed 60 to 100 units in 5 s; the mono-frost build gains about 3 %/s.

**Best and cheapest/tedious mechanic.** Best: the Break Check, then Floodfall (gold island). Most cheap or tedious: Vashkar's banners when they survive (tedious), Aurelith's tight beam (almost cheap), and the Echo's heal-then-immediate-intermission pacing.

**Fight lengths and fun.** Gorrak 41 / 87 / 123 s (Pyro / Storm / Cryo), Vashkar 118 s (Cryo) and 165+ s without a kill (Storm), Aurelith 116 s (Storm) and 185 s (Cryo, assisted). Under 90 s is fun; over 150 s the intermissions repeat and it is attrition. The 8 to 9 s intermissions are a test, not a chore, at Gorrak and Aurelith; Vashkar's Molten Tide is a spectacle with no gameplay.

**Did HP attrition feel fair?** Where HP went (damage by source, run by run):
- Gorrak (Cryo): ~25 HP, 0 hits for 90 s. (Storm): King's Wrath 15 + 15 + backhand 27 = ~60 of 90. (Pyro): King's Wrath 51 and 48 in the Echo.
- Gorrak (Arcanist, Wrath 3): reverberation 15, slam 30, backhand 30, King's Wrath 36 = 111.
- Vashkar (Cryo): lava 22 + trail 17 = ~40 of 130. (Storm, T1): banner pulse 48, banner charge 27, lava 45, lava trail 26 = 146 of 90, healed ~50 by regen.
- Aurelith (Storm): beam 66, crash 33, Wyvern 50 = 149 of 110, ended at 33. (Arcanist): beam 60, nova 30, crash 30 = 120 of 100.

Ways to get it back: passive regen about +0.7 HP/s; post-kill full heal; Echo's Rift Mend. Nothing during the fight on my own initiative. It feels fair that bosses hurt; it does not feel fair that mastery cannot recover anything between phases.

## Harness caveats
- Expert hands stepped out of almost every ground telegraph and did not use dashes against rings, did not use pillars and did not shoot adds on purpose. So death causes (King's Wrath, Prism Crash, beams) are a bot limit. I used them only to describe visibility and size of the hits.
- I could not see the Gorrak backhand cone or the Aurelith wyvern's telegraph in a screenshot before it hit; I found the slam + backhand and the beam in shots only after damage events.
- `window.dmgBy` was not a global in this build; I read `r.window.dmgBy` per play chunk and summed it myself. A few early Gorrak fights are not broken down by source (Cryo Gorrak, Stormcaller phase 1 and 2).
- My drafting script defaulted to the first card on unknown options once (Glass Sigil on run 2, Hailstorm skipped twice in run 1). Builds in runs 4 to 9 were fusion-priority but not hand-optimised.
- "Jumped" fights skip the horde and Elite Surge; assisted fights halve damage taken. Run 7 is not evidence for difficulty.
- Boss fights with `PT.play` chunks of 1.5 to 2 s show events at chunk granularity; a hit and its telegraph can land in the same chunk.
- No audio judged.

## Findings (machine-readable)
```json
[
 { "area": "balance", "type": "issue", "severity": "major",
   "finding": "No in-fight healing: boss hits are 15-30 per chunk against 90-130 HP, regen is ~0.7 HP/s, full heal only after the kill (or the Echo's Rift Mend)",
   "evidence": "Stormcaller Gorrak 90->22 HP, Arcanist Aurelith 100->24 at intermission 1, 27 HP at kill; heals: 27->82 only after the kill",
   "recommendation": "Heart or percent heal on phase gate / Break Check break / stagger Down so clean play is HP-positive" },
 { "area": "bosses", "type": "issue", "severity": "major",
   "finding": "Intermission 2 / phase-3 start (King's Wrath at Gorrak, Crash at Aurelith) is the HP cliff and ended 4 of 9 runs",
   "evidence": "King's Wrath 15-18 per ring x3 killed Pyro-Echo (at 45 HP) and Arcanist Wrath 3 (at 18 HP); Prism Crash 30 killed Arcanist at 24 HP",
   "recommendation": "Scale to max HP or lower tier-0 damage; give a dash refill at the gate; keep the death-screen tip" },
 { "area": "bosses", "type": "issue", "severity": "major",
   "finding": "Vashkar banners shield 20% each and, if left alive (single-target builds), stretch the fight past the soft enrage",
   "evidence": "Stormcaller T1: boss 79% at 70 s, 66% at 100 s, enrage 2:39, died at 52%; Cryo with area spells cleared banners by 0:20 and killed in 118 s",
   "recommendation": "Show a shield chip on the boss frame, let auto-aim prefer banners, time-out surviving banners" },
 { "area": "combat", "type": "issue", "severity": "minor",
   "finding": "Stagger is dominated by reactions (55-75% of gain); Perfect Dodge and Crystal blasts are 1-3%",
   "evidence": "Cryo vs Aurelith steam 739 of ~1300; Stormcaller vs Vashkar superconduct 649 of ~880; perfect+crystal 19 total",
   "recommendation": "Raise perfect/crystal stagger or fatigue reactions harder after a few per fight" },
 { "area": "bosses", "type": "praise", "severity": "polish",
   "finding": "Break Checks are the best mechanic: named cast, number to hit, short window, big DOWNED payoff; failure cost scales with the boss",
   "evidence": "3/3 Gorrak (Storm), 3/4 Vashkar, 3/3 Aurelith broken; Prism Nova failure 30 damage",
   "recommendation": "Keep; show the threshold in the same unit as the bar (percent or marker)" },
 { "area": "readability", "type": "praise", "severity": "polish",
   "finding": "Telegraphs read: red lanes/circles/rings for danger; gold-striped wedges, strips and the Floodfall island for safety; gold never overlaps red",
   "evidence": "rhea-r3-gorrak-timberfall.png, rhea-r3-aur-interm1.png, rhea-r3-aur-interm2.png, rhea-r3-aur-prism-nova.png",
   "recommendation": "Keep the colour contract; re-colour Prism Conduits so gold stays reserved for safe zones" },
 { "area": "bosses", "type": "issue", "severity": "minor",
   "finding": "Aurelith's tracking beam has ~0.75 s warning and re-aims at the player; 2-3 per fight at 30 damage",
   "evidence": "rhea-seq20.png (lane) to rhea-seq21.png (fired) one 0.75 s step apart; beam 66 and 60 damage in two fights",
   "recommendation": "Lengthen warning to ~1.1 s or lock the aim 0.4 s before firing" },
 { "area": "bosses", "type": "issue", "severity": "major",
   "finding": "Gorrak combo club slam + backhand dealt 60 HP in about 1.5 s on tier 1 with Frenzied, near the arena rim",
   "evidence": "Run 8: club slam 30 + backhand 30 inside one 1.5 s step; shots rhea-gr05.png / rhea-gr06.png",
   "recommendation": "Add a short gap between slam and backhand near the rim or keep safe space off the wall" },
 { "area": "ui", "type": "bug", "severity": "polish",
   "finding": "Death screen 'Damage taken' lists prism beam 100% when the killing blow and 2 of 4 hits were Prism Nova/Crash",
   "evidence": "Run 6 death screen",
   "recommendation": "Fix the per-move breakdown bucket" },
 { "area": "bug", "type": "bug", "severity": "minor",
   "finding": "PT.channel('wrath') once parked the hands at distance 5-8 and never channelled for 70+ s (heat 0); worked in a later run",
   "evidence": "Run 3 Stormcaller; run 8 Arcanist reached heat 3",
   "recommendation": "Investigate ring radius vs hands' flee behaviour; could also affect real players on controller/auto-move" },
 { "area": "balance", "type": "issue", "severity": "minor",
   "finding": "Gorrak fight length varies 3x by class (41 s Pyro, 87 s Storm, 123 s Cryo); Aurelith 116 s (Storm) vs 185 s (Cryo, assisted)",
   "evidence": "bossFights and logs of runs 1-3, 5, 7",
   "recommendation": "Stagger-driven Downs shorten fights for reaction classes; consider a minimum fight pace or HP scaling by class DPS" }
]
```
