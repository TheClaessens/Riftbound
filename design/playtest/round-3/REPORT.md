# Playtest round 3 — synthesis (v5.1 raid bosses)

Build: v5.1, commit `79b24f5`. Brief: `ROUND.md` (addendum to `../BRIEF.md` and `../round-2/ROUND.md`).
Panel: 7 AI personas (6 Sonnet, 1 Haiku), about 45 played runs and 32 bot sims, plus **one human playtester's notes**
(`00-human.md`). The human's notes were weighted like one more persona report, not above the others. The personas did not
see them, so where they agree, the agreement is independent.

## Executive summary
v5.1 fixed what round 2 asked for in *communication*:
- every persona praised the Seal;
- players now name the killing move and get a usable tip;
- level-ups wait for the boss to land;
- tips teach Stagger, Downed, Break Check and Winded at the moment they happen. Noor, the newcomer, explained all five correctly without a doc.

Rhea calls the raid layer "the best part of the game".

Three problems now dominate. Each was raised by several sources and verified in code or in-engine:
1. **HP is a one-way budget inside the arena** (the human, Rhea, Mila, Dex, Viktor, Ola).
   - The Seal turns the horde into XP only.
   - Adds drop a health orb 1% of the time, and the boss's guaranteed orb only drops when it dies.
   - Inside the fight, the only healing is regen (0.3 HP/s base), Vitality, the Adrenaline relic and Echo's Rift Mend.
   - The fights deal 15–30 HP per hit against 90–130 HP pools.
2. **Auto-cast ignores the adds that matter** (the human's bug, Ola, Rhea).
   - Auto-cast fires at the nearest enemy, and in a sealed arena that is the boss.
   - Runners healing Gorrak, Vashkar's banners, spore pods and Aurelith's conduits die only by accident.
   - Reproduced: auto-cast sent 14 of 14 casts at Gorrak while three runners, one of them 6 u away, ran in to heal him.
3. **The fight is quieter than the act around it.** The human "missed the chaos". Mila: "more tense, less powerful"; the chain counter drops to 0 and intermissions are a lull.
   - Fight length also swings 3–5× by build: Gorrak 37–177 s against a 60–75 s target.

One fix touches all three: put **purposeful fodder waves inside the arena**. They give chaos and sustain (orbs), and a reason for auto-cast to look away from the boss.

## Scorecard
| Source | Hands | Fun | Domain | One line |
|---|---|---|---|---|
| 00 Human | human | n/a | n/a | Missed the chaos; HP is the issue since nothing drops potions; auto-aim fails when the boss spawns adds |
| 01 Rhea (challenge) | expert | 7 | 6.5 | Best part of the game; telegraphs fair; no in-fight healing; intermission 2 is an HP cliff |
| 02 Viktor (buildcraft) | expert | 7 | 6 | Cards honest; only Haste was completable; Steam still owns Stagger; Act III Haste is free shards |
| 03 Mila (casual) | casual | 7.5 | 6.5 | The Seal is an event; fights 37–177 s; died in intermissions with nothing to heal |
| 04 Noor (newcomer) | casual | 7 | 6.5 (r2: 5) | Tips teach the raid layer; obelisk jargon; death screen doesn't link the obelisk bet |
| 05 Ilse (readability) | average | 7 | 7 (9 normal vision, ~4 deutan) | Fights read well in normal vision; red-green dependence; gold not only safe; runners and wyvern hard to spot |
| 06 Dex (numbers) | sims + PT | 6 | 5 | Gorrak on target (66 s); Vashkar lava spike; healing ≈ regen only |
| 07 Ola (motor a11y) | casual + auto-cast | 6 | 6 | Playable one-handed; auto-cast has no priorities; King's Wrath needs a timed dash |

Round-2 → round-3 movement: Noor's learnability went 5 → 6.5, Rhea's fun 6 → 7 and Viktor's domain 5.5 → 6. Mila's fun is flat (7 → 7.5).

## Verified claims
| Claim | Sources | Verdict | Evidence |
|---|---|---|---|
| Nothing heals you in the fight | Human, Rhea, Mila, Dex, Viktor, Ola | **Design flaw** | `encounter.js` seal: the horde becomes XP only, with no orb roll. `combat.js:207`: orb chance is 1% for a normal enemy (adds included), 25% elite, 100% boss (on death). Heals in a fight: regen, Vitality +0.4/s, Adrenaline relic, Echo Rift Mend 20% (`encounter.js:204`). Dex: Gorrak fights got 0 heal events. |
| Auto-aim doesn't work when the boss spawns adds | Human, Ola, Rhea (banners) | **Design flaw (felt as a bug)** | `player.js:425` auto-cast uses `nearestEnemy(pos, range)`, with no priority. Repro (Pyro L10, auto-cast on, `boss.runners(3)`): 14/14 casts went to Gorrak, 3.2 u away; the runners at 6.0, 13.1 and 14.7 u were never targeted and healed him 3% each. The "golems" are almost certainly Gorrak's runners ("Goblin Grunt"), or Vashkar's Orc Raiders. |
| Prism Conduits are gold | Rhea, Ilse | **Real bug** (breaks the colour rule) | `aurelith.js` `spawnConduits`: the conduit link beam uses `SAFE_GOLD` and the body `0xfff0c8`/emissive `0xc8902a`. These are objects to kill; gold is reserved for "go here". |
| Break Check target exceeds the bar ("stagger 171") | Ola, Viktor, Rhea, Mila | **Design flaw** (no bug) | The target is capped at the bar. But the bar grows ×1.25 after every Down (`core.js _recover`) and resets only at a phase change, so in a long phase it climbs 100 → 125 → 156 → 195. The HUD prints that as an absolute number ("stagger 137") next to a bar you read as 0–100%. |
| Echo/Wrath can't be channelled | Viktor, Noor, Mila | **Mostly bot limitation**, design tension | The game is sound: progress decays only 0.25/s outside the ring and isn't reset by modals. The `sim.js` bot reaches Wrath 3, and the orchestrator's expert Cryomancer armed Echo through a level-up and a relic pick. Casual/expert PT hands' threat avoidance pushes them out under Swarm/Surge. The pressure is real: Viktor lost 90 HP walking to Wrath through a Swarm. |
| Act III Haste is free shards | Viktor | **Design flaw** | Bounty = 0.25 × skipped s × 2 + 20 ≈ 75 shards. The cost is lost XP and levels, which is worthless when the run ends at the kill (and Windfall refunds 40%). |
| Starter skill never offered a rank-up | Viktor | **Not reproduced** (draw luck) | `progression.js` puts every owned skill below max rank in the pool, the starter with +0.3 weight. |
| Wrath 3 sims disagree with v5.1 (6/8 vs 1/8 Gorrak kills) | Dex | **Sampling difference** | Not the step-out rule: an orchestrator `runSim` reached heat 3. Dex ran Pyro + Cryo (Cryo is the strongest class); the v5.1 batch ran all 4 classes. Settle with n ≥ 8 per class per lane. |
| Death screen: "prism beam 100%" when Prism Crash killed | Rhea | Unverified (plausible: the breakdown and the killer are tracked separately) | — |
| Stale King's Wrath tip during Vashkar's intermission; stale primer text | Viktor, Noor | Unverified, probably harness (`PT.ui()` reads hidden DOM text) | Tips are one-time and timed in game time (`tutorial.js tip`). |
| A level-up cancels `PT.channel` | Noor | Harness-only and not reproduced | The orchestrator's channel persisted through two decisions. |

## Top issues (severity × sources × pillar impact)
1. **No sustain inside the arena** (major · 6 sources incl. the human · pillar: "lose because of a mistake").
   - Every bump becomes permanent. Deaths cluster at intermission 2 and phase 3 after attrition, not after a mistake.
   - Big HP pools (Cryo 130) beat skill, and Glass Sigil (−40% max HP, offered at the boss chest) is a trap.
2. **Objective adds are invisible to auto-cast and hard to see** (major · 4 sources incl. the human · accessibility and add design).
   - Ilse only noticed Gorrak's runners because his HP bar rose: they are plain tiny Goblin Grunts with no ring, tether or label. The wyvern is a ~40 px figure at the rim.
   - Adds "with a purpose" (runners, banners, pods, conduits) only have a purpose for a mouse-aiming player.
   - With a single-target build, banners stretched Vashkar into the soft enrage (Rhea: 79% after 70 s, then death).
3. **Intermission HP cliffs** (major · Rhea, Mila, Ola, Viktor, Dex).
   - King's Wrath rings (15–18 each, 41–51 HP total for the bot) need a timed dash; Ola: "the one input that excludes limited dexterity".
   - Vashkar's intermission lava did 23–80 HP while he was untargetable; Mila's "worst moment".
   - Aurelith's Prism Crash 30.
   - Partly a bot limitation: the hands can't dash-time. The design point stands for players who can't time it either.
4. **Fight length depends on the build, not on play** (major · Mila, Rhea, Viktor, Dex).
   - Gorrak 37–177 s; Aurelith 116–190 s; the targets are 60–75 and 100–120.
   - Burst builds skip the boss's script ("a skipped boss"); single-target builds drag into enrage.
5. **Stagger is still a build check** (major · Viktor, Rhea, Ola).
   - Reactions are 55–75% of Stagger; Perfect Dodge plus crystals 1–3%.
   - Mono-fire failed the War Horn 5/5.
   - The bar growing per Down and printed in absolute units makes the late-phase Break Checks unreadable and unreachable.
6. **The arena is calmer than the act** (minor–major · the human, Mila; a design tension, see below).
   - The chain counter resets to 0, the screen holds 1–4 foes, and the 7–9 s intermissions are a lull.
7. **Communication gaps** (minor · Noor, Mila, Rhea).
   - The death screen doesn't link the obelisk bet or the HP you entered with, and its damage list is run-wide (Mila's death blamed "Orc Spirit-Shaman 23%").
   - Obelisk jargon: Windfall, Strain, Heat; "≈ −2 levels after the Windfall" reads as a contradiction.
   - Rift Mend is never announced.
   - DOWNED / WINDED / EXPOSED / RECOVERING overlap.
8. **Act III Haste is free** (minor · Viktor). No other Act III choice competes with it.
9. **Gold is not only "safe", and danger relies on red vs green** (major under CVD · Rhea, Ilse).
   - Conduit tether, beam core, storm-crystal rings, the Stormcaller halo and pods are yellow or gold.
   - Under a deutan filter, Timberfall lanes, slam circles and Vashkar's ring almost vanish into the grass, and the damaging beam and the gold shelter stripes become the same yellow.
10. **The hero gets lost** (minor · Ilse, Rhea). Inside Frost Nova and boss-freeze VFX, at Act III peak density, and on Aurelith's purple rim. Tips, banners and the obelisk card sit over the arena.

## What to keep
- The Seal sequence and the boss announce (all personas).
- Level-ups held until the landing (Mila, Noor, Ola).
- Death screen with the killing move and a next-time tip (Noor, Mila: "best change in the build for a casual").
- One-time tips at the moment of first contact (Noor learned the raid layer from them alone).
- Break Checks as climaxes. Mila's best moment: a War Horn broken at 18 HP, boss at 7%.
- Ring waves 3.2 s apart and gold = safe (where applied).
- Obelisk cards' honest cost/pay format (Viktor).
- One-hand playability with auto-cast (Ola).

## Design tensions (decisions for the team, not noise)
- **Chaos vs focus.**
  - The human misses the horde's chaos inside the arena; Mila likes the change "in principle" (mindless horde, tense boss) but not the dead air.
  - Rhea wants the clean duel: "the raid layer is the best part".
  - A middle path: keep the duel readable, but add phase-scripted fodder waves (see *Now*) and carry the chain into the arena, so the power fantasy doesn't switch off at the Seal.
- **Sustain vs tension.**
  - Everyone wants a way back. Rhea wants it earned ("a clean-play heal"); Mila and Ola want it given (a heal at the Seal).
  - Recommended: earned but generous. Orbs from fodder waves and from a broken Break Check, plus a small top-up at each phase gate.
- **Smart auto-cast vs aim skill.**
  - A priority auto-cast makes adds trivial for auto-cast users.
  - It is an assist option (off by default for mouse aim), and adds still need positioning (runners race, pods ripen), so the cost is low.
- **Stagger: skill or build.**
  - Round 2 asked dodging to matter more. v5.1's +10 for a perfect dodge or crystal is still 1–3% of the bar in practice; reactions dominate.
  - Decide whether Stagger is a build check (accept it) or a skill check: then dodge and crystal need about 25 each, and reaction fatigue needs to bite harder.

## Backlog
**Now (v5.2)**
1. **Arena fodder waves.** Each phase and intermission end, spawn a small themed wave (Gorrak: goblins; Vashkar: orc raiders; Aurelith: wisps) at the wall.
   - Normal XP, and a raised orb chance (about 8%) so a fight yields 2–4 orbs.
   - Answers the human's chaos and potions points, gives auto-cast targets and keeps the chain alive. *(owner: `encounter.js` + each boss script)*
2. **Earned heals.** A broken Break Check drops a health orb (30%); each phase gate tops you up 10–15%. Show both on the boss frame.
3. **Auto-cast priority.** When the boss is up, prefer, within range:
   1. runners and goal-seeking adds;
   2. objects tagged `marker` (banners, conduits, ripening pods) when the boss is shielded or the object is the mechanic;
   3. crystals when the boss is in their ring;
   4. the boss.

   Keep plain nearest-first outside fights. *(owner: `player.js` auto-cast plus a `priority` field on adds/objects)*
4. **Gold only for safe, and a mark on objective adds.**
   - Recolour the conduit body and tether, the beam core and the hero halos away from gold.
   - Give runners, the wyvern and pods a ring, a tether to the boss and an off-screen pointer (Ilse). This also tells auto-cast users what to steer toward.
5. **Break Check readability.** Show the target as the bar's marker only (drop the absolute number) or as %. Cap the per-Down growth (e.g. at most ×1.5 per phase).

**Next**
- **King's Wrath and intermission damage.** Add one walkable gap lane per ring (the rings rotate), or let intermission damage scale with max HP; refill dash at the gate. Vashkar's intermission lava: thinner, with a gold safe pocket.
- **Fight length.** Give each phase a minimum duration (an HP floor until X s, like the gates) so burst builds still see the script. Look at banner DR and soft enrage for single-target builds.
- **Death screen.** Add a "Your bets" block (obelisks armed, entry HP, payout lost) and show *this fight's* damage, not the run's.
- **Obelisk cards in plain words.** Drop Windfall, Strain and Heat; write "net −2 levels by the boss"; say "boss gets harder" on Wrath; warn on Haste at low HP; announce Rift Mend.
- **Act III Haste.** Cap or remove the Bounty in the final act, or make Haste cost boss HP there.
- **Stagger.** Decide the tension above, then retune.
- **Sims.** Re-run the lane batch with n ≥ 8 *per class* per lane on the same harness (rAF frozen) to settle Wrath 3 and Echo.

**Later**
- Colour-blind safety: hue-independent danger (edge plus hatch, higher fill opacity) and a high-contrast telegraph toggle (Ilse; carried over from round 2).
- An outlined hero halo drawn above VFX; move tips, banners and the obelisk card off the play area.
- Death advice for contact hits shouldn't say "attacks show on the ground first".
- Unify the Downed/Winded/Exposed vocabulary.
- Give the three obelisks distinct world colours and icons.
- Accessibility panel: remap, toggles, relaxed telegraph speed, dash assist.
- Glass Sigil: warn on the card when taken mid-fight, or don't offer it at the boss chest.
- Mono-element draft depth (on-element guarantee past L8).

## Harness caveats and improvements
- **New verb `PT.autoCast(on)`** (adapter): the game's own auto-cast picks targets, and the hands only move and dash. It found the auto-cast gap independently of the human.
- **The PT hands' channel logic** (threat avoidance beats a weak 0.4 in-ring goal weight) makes Echo/Wrath look harder than they are for casual hands. Next round: raise the in-ring goal weight while channelling, so obelisk findings measure the game, not the bot.
- **Brief error:** `window.dmgBy` is the per-call digest field `r.window.dmgBy`, not a global (Rhea lost early breakdowns). Fix the ROUND/BRIEF text.
- `PT.play` returns `{ error, decision }` rather than throwing when a decision is pending. Dex's first loop spun on it; document it in the brief.
- The hands still can't dash-time rings or use pillar cover. Ring damage remains a bot limitation for difficulty claims; it counts for accessibility (Ola).
- Persona draft policies sometimes took the first card (Glass Sigil twice). Tell analysts to skip −max-HP relics unless testing them.
