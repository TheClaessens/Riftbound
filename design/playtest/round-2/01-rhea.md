# Rhea — challenge seeker · playtest round 2 (v5 raid bosses & obelisks)
**Verdict (in character).** The raid bosses are a big step up in presentation: the thorn wall, the phase pips, the gold "go here" wedges and the named Break Checks all read well, and every hit I could attribute was something I could have seen coming. But for a skill-seeker they are too easy to short-circuit. A reaction build keeps the Stagger bar filling by itself, so Gorrak spends most of the fight Downed or stunned and the only things that ever kill you are the few mechanics that cannot be dodged by skill alone (King's Wrath rings, backhand cone). Fights also run well over target length.
Fun: 6/10 · Would play again tomorrow: maybe · Domain score (boss fairness & tactics): 6/10

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| 1 | Cryomancer T0 (primer on) | Won Gorrak, Act I, boss fight 137 s, L11; abandoned at 5:33 in Act II | Ice Shard, Meteor, Blizzard, Frost Nova, Chain Lightning, Spirit Orbs (reaction-heavy), no obelisks | 0 (abandoned) | Lost only 40 of 150 HP, all to backhand cone |
| 2 | Pyromancer T2 | Died to Gorrak (Act I), 4:15, L11, boss at 33% | Reaction build; Wrath x3 (Rift Storm, Vengeful, Bulwark) + Echo | 104 | 90 max HP; hits of 27 each; died to two King's Wrath waves in intermission 2 |
| 3 | Cryomancer T1, jumped to Act II boss [jumped] | Won Vashkar, 174 s, L18 | fireball/meteor/orbs mix, no relics | n/a | Fight lost 86 of 150 HP; relic pick (Glass Sigil, my draft script) dropped max HP to 90 afterwards |
| 4 | Cryomancer T1, jumped to Act III boss [jumped] | Died to Aurelith at 0:40, boss 97% | Ice Shard/Static Field/Blizzard/Absolute Zero/Storm Halo | n/a | Dealt almost no damage in 40 s while ward cycled frost/fire/storm. Inconclusive (see caveats) |
| 5 | Stormcaller T0, assist 0.5, jumped to Aurelith [assisted][jumped] | Won Aurelith, 128 s, L26 | Spark/Blizzard/Frost Nova/Meteor/Static Field/Orbs | n/a | Smooth fight; 2-3 hits of 20-40 |
| 6 | Stormcaller T3 | Died to Gorrak, Act I, 5:27, L11, boss 29% | Lightning reaction build (superconduct, arcflash) | ~91 | No damage at all until 4:39, then backhand 27, King's Wrath 20 x 3, backhand 27 |
| 7 | Pyromancer T2, jumped to Vashkar [jumped] | Died 1:09 into Vashkar, boss 69% | Cinder Bolt/Meteor/Orbs etc. | 50 | Banner charge 27, lava trail 27 + 13, banner pulse 27, ground fire |

Screenshots: `playtest/out/rhea-r2-gorrak-arrival.png`, `-gorrak-breakcheck`, `-vashkar-banners`, `-vashkar-intermission`, `-aurelith-fight`, `-aurelith-intermission`, `-bh-0`, `-bh-2`, `-g3-16`, `-g3-29`.

## Highlights (what worked — keep these)
- **The seal is an event.** The thorn/crystal/lava ring closes around you and the horde melts away. It also reads as a hard fight boundary. [seen] (shot: `rhea-r2-gorrak-arrival.png`)
- **Break Checks are the best new mechanic.** "War Horn - fill Stagger to 60 within 5s" with an on-screen STAGGER N / BREAK IT bar is clear and tense, and breaking one gives a flat, rewarding Down window. The requirement scales with phase (60, then 70) and with Bulwark (91). [read][data]
- **Gold wedge "go here" zones on Aurelith** next to the red beam are clearly distinct from the red threat. The beam is wide and bright, and the sweep reads long before it connects. [seen] (shot: `rhea-r2-aurelith-intermission.png`)
- **Gorrak's club raise is legible.** In `rhea-r2-bh-2.png` the club is up and the King's Wrath ring appears under him about 0.8 s later. The telegraph exists. [seen]
- **Phase/intermission structure gives the fight shape.** "Boss untargetable, 8 s, arena pattern" followed by a WINDED 3 s opening is a good rhythm. The three-pip frame keeps you oriented. [data][read]
- **Molten Tide intermission on Vashkar** (the huge expanding orange ring) is dramatic and unmissable. [seen] (shot: `rhea-r2-vashkar-intermission.png`)
- **Damage names are fair and clear** (`Gorrak: backhand`, `Vashkar: banner charge`, `Aurelith: frost ring`), which makes fairness auditing easy. [data]

## Pain points (ranked, worst first)
1. **Stagger is effectively free for reaction builds, so the fights are trivial until a non-dodgeable mechanic kills you.** With Cryomancer and Stormcaller reaction builds, `staggerGained` sat at 25-130 per 5 s from steam/superconduct/overload alone. Gorrak was Downed or stunned for most of phase 1. Stormcaller T3 took **zero** damage for 100+ s, then died in ~50 s to King's Wrath and backhand. There is no skill expression in the stagger loop: it fills whether or not you dodge, aim at the crystal, or perfect-dodge. [data][seen] · Severity: major
2. **King's Wrath (and any ring in an intermission) is the one real wall.** At T2 and T3 the waves do 20-27 each (23-30% of a 90 HP caster), come back-to-back, and during the intermission you cannot hit the boss, so there is no way to shorten the pattern. Run 2 and run 6 both died here. The bot cannot time dashes through rings (per calibration), so this is weak evidence of unfairness, but the damage-to-HP ratio at T2+ means one missed dash is a third of your health, and HP barely regenerates inside the arena. [data] · Severity: major (pending a human check)
3. **Fight length overshoots targets.** Gorrak 137 s (target 60-75) and Vashkar 174 s (80-100) are about 2x. Aurelith 128 s is nearly on target (100-120). Much of Gorrak's 137 s was waiting out Down/Exposed windows with low damage. Vashkar's banners shield him, and the bot never kills them. [data] · Severity: major
4. **Fire-immunity messaging vs element mismatch.** Vashkar's tip says "Fire will not hurt him much". With a Pyromancer the fight crept at about 0.4%/s (run 7: 31% in 69 s) while I took banner/lava/pulse damage. A fire class vs the Act II boss should come with a better indicator of effective damage, and a no-nonsense way to swap. [data][read] · Severity: major
5. **Backhand cone keeps landing on a kiting caster.** It was the only Gorrak damage in run 1 (6 hits of 13) and in run 6 (27 each). "Stand behind him" is not something ranged builds can do without leaving their range band, and it fires fast after the slam. It is readable but its cost-vs-reward for a ranged hero is poor. [data] · Severity: minor/major
6. **Banner pulse / lava trail / banner charge on Vashkar hit an expert-hands bot for 27 each at T2.** The calibration says expert hands are not hit by his telegraphs. Here three different sources landed within 20 s (run 7). Either these are less visible than the circles, or they are the ones that are not telegraphed in the same way. Needs a human look. [data] · Severity: major (unverified)
7. **Aurelith ward cycling is hard to parse.** At the fight start (run 4) the ward was "frost" then "fire" then "storm" within 30 s with my cryo/storm build dealing almost nothing (boss 97% at 40 s). I cannot tell whether ward immunity is meant to block damage or whether the bot just aimed poorly. A player with one element would be locked out for long stretches. [data][inferred] · Severity: major (needs checking)
8. **Stale HUD text.** After a new run/jump, `PT.ui()` still listed `Vashkar ... Falls`, `INTERMISSION II MOLTEN TIDE`, `STAKES ACT I ECHO ... WRATH x3` and `FELLED IN 2:51` from the previous run alongside the live boss frame. Might be hidden DOM, might be visible. [read] · Severity: polish/bug

## Bugs & oddities
- Stale encounter cards (see 8). Repro: finish a Gorrak fight with Echo+Wrath, `PT.abandon()`, `PT.start` + `PT.jump(2,{boss:true})`, `PT.ui()`.
- `PT.jump` boss entry lands you at the boss with arena sealed instantly; no problem, just noting stakes text says "stakes: none" correctly.
- A relic draft with "Glass Sigil" is offered at the Act II/III boss chest. It dropped max HP 150 to 90 permanently. As a challenge seeker I might pick it, but the card's description should say how large the HP cost is. (My auto-draft script picked it twice; I then excluded it.)
- Wrath heat 3 took 25 s of channelling and no damage was taken in the two Wrath channels I ran (Goblin Shaman took 15 and Goblin Grunt 8.9 as the only sources), so "packs converge on you" had no bite for an expert. [data]

## Recommendations (max 6, most impactful first)
| # | Change | Why | Expected effect | Effort |
|---|---|---|---|---|
| 1 | Make Stagger gain from reactions diminish with repeated use (or per-source cap per 5 s), and give perfect dodges / crystal blasts a larger share | Pain 1 | Boss attacks more, dodging matters, fights stop being a punching bag for reaction spam | S |
| 2 | Give King's Wrath rings a clearer, longer ground telegraph (ring forms 1 s before it expands, with a gold "dash now" marker) and cap the damage (about 15% of max HP per ring) | Pain 2 | A human can read and time it; one miss is not a third of your HP | M |
| 3 | Cut Gorrak/Vashkar Down windows by about 25% or raise their damage window multiplier and trim boss HP to hit 60-75 s / 80-100 s | Pain 3 | Fights land on target without removing the Break Check loop | S |
| 4 | Add an HUD hint on Vashkar's resist state (a "Fire 50%" chip) and make banner pulse, lava trail and charge telegraphs match the telegraph style of the circles | Pains 4 and 6 | Fire builds know what they are up against; no "invisible" damage | S/M |
| 5 | Put a tiny recovery source into the arena (pickup after each Break Check or Down) | Pains 2, 5 | Attrition does not decide the fight; mistakes are punished but not terminal | S |
| 6 | Clear all encounter/stakes cards on a new run; show max-HP loss on Glass Sigil cards | Bugs | No stale text; informed risky picks | S |

## Domain deep-dive (round-2 questions)

**Gorrak (natural fight, runs 1, 2, 6).** Telegraphs: club slam, backhand cone, King's Wrath and War Horn all have visible tells. I could see the raised club about 0.8 s before King's Wrath ([seen] `r2-bh-2.png`), and the ring itself showed up as a thin pink circle ([seen] `r2-bh-0.png`). Spore pods are visible as pale glowing eggs scattered around the arena. I never saw them ripen because the bot never targeted them. The cheap-feeling mechanic is the **backhand**: it came up in every run and is the dominant source of damage for a ranged build. The great-feeling one is the **War Horn Break Check**. Positioning "behind Gorrak" matters in theory, but a caster that must keep range cannot exploit it, so it reads as flavour rather than a tactic. King's Wrath is the true wall at T2+.

**Vashkar (jumped, runs 3, 7).** Axe in/out combo, banner charge, lava trail, Molten Tide and Molten Overswing all appear. The Molten Overswing check (needs 60-70 stagger) was broken every time in run 3 and failed in run 7 (the pyromancer died while it resolved). Twin banners shield him ([seen] teal tether line in `r2-vashkar-banners.png`), and the bot ignored them, so the fight dragged to 174 s. Banner pulse hits 27 for a 90 HP caster, which feels punishing for a mechanic that exists mainly to shield the boss. In run 3 I took 86 HP of damage over 174 s, which is reasonable. In run 7 I took 90 HP in 69 s.

**Aurelith (jumped/assisted, runs 4, 5).** Beam sweeps have a bright red line and gold wedge shelters ([seen]). The Prism Nova Break Check was broken three times in run 5. Colour tell for the ward is on the dragon, but I saw only the HUD string `ward frost/fire/storm`. In run 4 (cryo, T1, unassisted) I could not damage her at all in 40 s, so I cannot claim this is fair or not. In run 5 with a storm/frost mixture the fight went smoothly (3 hits, 128 s). **Does positioning matter?** Pillars did not obviously save me in either run (the bot does not use them), but the wedge layout makes a human strategy plausible.

**Stagger / Downed / Break Checks.** They *reward* skilled play on paper (perfect dodges, crystal blasts, reactions) but in practice *reaction spam* floods the bar. They make the fight **more structured** (clear moments to dump damage) but also **longer** because Down windows only partly compensate for the 3 phases plus intermissions. A better target: a bar that rewards varied sources and punishes spam.

**Intermissions.** On Gorrak they felt like a test only because King's Wrath hits there. On Vashkar (Molten Tide) and Aurelith (flood/beam) they felt like a spectacle with some risk, and for a seeker they are the best part. I wanted to be able to do something while waiting (kill pods/banners), and the bot cannot, so that is a harness limit.

**Adds.** Pods, banners and conduits have a clear purpose on paper. I never saw a pod ripen, never saw a runner heal the boss, and never saw the wyvern/lightning rod. Only the banner pulse and charge made themselves felt. A human would obviously prioritise banners; the bot just shoots the boss. If the banner shield is the thing that doubled Vashkar's fight length, say so in a tip.

**Fight length vs fun.** Gorrak 137 s, Vashkar 174 s, Aurelith 128 s. The first half of each fight is fun; the last 40% feels like a grind for a bot that has already seen every pattern. Aim at 75/95/115 s.

**Obelisks as difficulty (run 2).** Wrath x3 + Echo made every hit 27 instead of 13, which is a clean +100% damage, but because I didn't take damage in the channelling itself the risk is all paid at the boss. At T2 with 90 HP that was the difference between winning and dying. Legible: yes, the cards say what they do.

## Harness caveats
- Bot hands cannot time dashes through rings, cannot use pillar shelter deliberately, and ignore pods/banners/conduits. Anything from King's Wrath or Aurelith beams is **not** proof of unfairness; I flag only the ratio of damage to max HP.
- Several fights used my own auto-draft script (reaction bias, later excluded Glass Sigil/Blood Pact/Unstable Core), so builds are not tuned like a skilled human's.
- Aurelith run 4 (0 damage dealt in 40 s) could be a bot targeting problem during ward cycling; I could not tell.
- Jumped/assisted fights (runs 3, 4, 5, 7) show telegraph readability and fight length only; difficulty claims rest on runs 1, 2 and 6.
- The screenshots have no HUD, so I did not judge the boss frame from images; the text came from `PT.ui()`.
- Tier scaling was only sampled at T0 (run 1), T1, T2, T3 (runs 2, 6, 7). Different classes also changed max HP (150/130/110/90), so I cannot separate tier from class.

## Findings (machine-readable)
```json
[
 {"area":"bosses","type":"praise","severity":"polish","finding":"Break Checks (War Horn, Molten Overswing, Prism Nova) are clear, named, scale by phase, and give a satisfying Down window.","evidence":"PT.ui 'BREAK IT - STAGGER 70', breakChecks BROKEN lines in runs 1, 3, 5","recommendation":"Keep as is."},
 {"area":"bosses","type":"issue","severity":"major","finding":"Reaction builds fill Stagger on their own, so Gorrak is Downed or stunned for most of the fight and fights become dodge-free until a non-dodgeable mechanic hits.","evidence":"staggerGained 25-130 per 5 s from steam/superconduct/overload; Stormcaller T3 took 0 dmg for 100+ s","recommendation":"Add diminishing returns per source and weight perfect dodges / crystal blasts higher."},
 {"area":"balance","type":"issue","severity":"major","finding":"King's Wrath waves (20-27 each, repeated during an untargetable intermission) took 60+ HP of a 90 HP caster; two of my deaths.","evidence":"runs 2 and 6: dmgBy 'Gorrak: kings wrath' 20-27 x 2-3","recommendation":"Longer, clearer ring telegraph, a 'dash now' marker, and lower per-ring damage."},
 {"area":"balance","type":"issue","severity":"major","finding":"Boss fight lengths overshoot targets: Gorrak 137 s, Vashkar 174 s, Aurelith 128 s.","evidence":"boss killed lines in runs 1, 3, 5","recommendation":"Trim Down windows or boss HP so Gorrak 60-75, Vashkar 80-100."},
 {"area":"combat","type":"issue","severity":"major","finding":"Vashkar banner pulse / banner charge / lava trail hit an expert-hands pyromancer for 27 each within 20 s at T2, contradicting the calibration that expert hands dodge his telegraphs.","evidence":"run 7 dmgBy list; died 1:09","recommendation":"Verify telegraph visibility for these three sources with a human; add the same ground-warning style as the circles."},
 {"area":"readability","type":"issue","severity":"minor","finding":"Backhand cone is the dominant damage source for kiting casters and 'stand behind him' is not practical for ranged builds.","evidence":"runs 1 and 6: backhand 13/27 repeatedly","recommendation":"Longer wind-up or shorter cone; give ranged builds a clear counter-tell."},
 {"area":"ui","type":"bug","severity":"polish","finding":"Previous encounter/stakes cards ('Falls', 'FELLED IN', 'STAKES ACT I ECHO WRATH x3', 'INTERMISSION II MOLTEN TIDE') remain in PT.ui() on later runs.","evidence":"runs 3-5 PT.ui output","recommendation":"Clear encounter/payout/stakes cards at run start and on encounter end."},
 {"area":"progression","type":"issue","severity":"minor","finding":"Glass Sigil (and similar risky relics) shows no concrete HP cost on its offer card; picking it dropped max HP 150 to 90.","evidence":"runs 3, 5 post-boss relic picks","recommendation":"Show the exact HP penalty on the card."},
 {"area":"bosses","type":"praise","severity":"polish","finding":"Gold wedges on Aurelith and the bright beam are readable and distinct from red threats; Molten Tide is dramatic and unmistakable.","evidence":"shots r2-aurelith-intermission, r2-vashkar-intermission","recommendation":"Keep the gold = safe / red = danger language."}
]
```
