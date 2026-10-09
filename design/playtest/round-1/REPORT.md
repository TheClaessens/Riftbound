# Riftbound — Simulated Playtest, Round 1 · Synthesis

**Build:** v4 (heroes + VFX), as of 2026-10-09 · **Method:** [PROTOCOL.md](../PROTOCOL.md) · **Personas:** [PERSONAS.md](../PERSONAS.md)
**Testers:** 7 AI personas (5 × Sonnet, 1 × Haiku analyst, 1 × Haiku completionist). They played ~45 hand-drafted
runs plus 40 bot-drafted batch runs, and took ~155 screenshots (`dev/shots/pt-*`). The orchestrator verified
the top claims in-engine.

## 1. Executive summary

1. **The final boss Aurelith can't be killed in a normal Act III fight. This is a confirmed bug and a blocker.** The orchestrator traced it to code: Kobold Prism-Shamans give every ally in range a barrier worth 30% of its max HP, and bosses are included (`src/game/enemies.js:574`, `castBarrier`). On Aurelith that is an 18,000-HP shield, refreshed every cast while shamans live.
   - Measured: the boss took exactly 0 HP damage for 25 s at close range with no ward up. With the barrier disabled it lost ~1%/s, which projects to ~100 s TTK.
   - The tanky Cryomancer also can't die, so runs **soft-lock**: the player's only way out is quitting, which pays 0 shards.
   - Downstream, this blocks Victory, Rift Tiers, and the Stormcaller unlock for many players.
2. **Chain runs away and breaks both the economy and the HUD.** Chain only resets after 2.5 s without a reaction, so in a dense horde it never resets (`game.js:212`). Max Chain reached 15,079. The uncapped `floor(maxChain/10)` term then makes up ~46% of Cryomancer shards, and the HUD shows "×2993" plus a wall of reaction chips.
3. **The hero disappears in the player's own spell VFX at peak density.** 4 of 7 personas found the hero lost under their own effects, and the low-HP red wash makes it worse. This breaks pillar 1, "readable chaos", exactly when it matters. One dissent: Viktor found Act III readable.
4. **Class balance is lopsided.** Cryomancer won 7/7 resolved batch runs. The other three classes won 0/30, and most died in Act II to burst hits (War Boar 36–48 dmg) and enemy projectiles. Arcanist, the *first* unlock, is the weakest class.
5. **The game looks and feels great; the visuals and juice are not the problem.**
   - Mila scored visuals 9/10, and the art direction, crowds, spell personality, card hints, primer and fusion forks are all praised.
   - The weak points are clarity (deaths, fusions, jargon) and long-term structure: the meta is exhausted by ~run 7, and higher tiers only add HP.

## 2. Scorecard

| Persona | Model | Runs | Fun | Again tomorrow? | Domain score | One-line verdict |
|---|---|---|---|---|---|---|
| 01 Mila · cozy casual | Sonnet | 5 | **8** | yes | 8 (visuals 9) | Gorgeous and addictive; loses her hero in the FX; Act II boss deaths feel random |
| 02 Viktor · hardcore buildcrafter | Sonnet | 9 | 7 | maybe | 6 | Real build game, but one archetype wins, the pool is clogged, and the meta is exhausted after ~7 runs |
| 03 Noor · genre newcomer | Sonnet | 3 | 6.5 | maybe | 6 | Primer + card hints teach reactions brilliantly; can't explain deaths; fusion text mis-teaches |
| 04 Rhea · challenge seeker | Sonnet | 5 + 4 jumps | 6 | maybe | 5 | Fair telegraphs, little to master; Aurelith a wall; burst hits hidden under VFX |
| 05 Ilse · comfort & readability | Sonnet | 6 (content review) | 7 | maybe | 5.5 | Projectiles and red telegraphs read well; hero lost in own VFX; geyser invisible; colour-only cues |
| 06 Dex · numbers analyst | Haiku | 40 batch + 2 probes | 5 | maybe | 4 | Only Cryomancer wins; Chain inflates shards; frost boss TTK 2–4× target |
| 07 Sam · completionist & lore | Haiku | 9 | 6 | maybe | 5 | Codex and flavour text are great; the goal ladder stops dead at Aurelith |
| **Mean** | | | **6.5** | 1 yes / 6 maybe | **5.6** | |

## 3. Verified by the orchestrator (in-engine, not just reported)

| Claim | Verdict | Evidence |
|---|---|---|
| Aurelith stalls at a fixed HP% | **Real bug** | `boss.barrier` = 16,616–18,000 with 6 Prism-Shamans alive. A direct 100-dmg frost hit dealt 0 with ward = null. Barrier forced to 0 → 93% → 73% in 31 s. |
| Chain never resets in a horde | **Real (design flaw)** | `game.js:212`: `chain = gap ≤ window ? chain+1 : 1`. Continuous reactions keep it open forever. The shard term `floor(maxChain/10)` in `meta.js computeShards` has no cap. |
| Second Wind "silent / didn't trigger" | **Works as designed** | Once per run (`player.js:251`); shows "SECOND WIND" text but emits no event, so the harness log missed it. A small UX gap remains: the relic still looks armed after use. |
| End screen shows "+0 shards" | **Harness artefact** | The count-up runs on `requestAnimationFrame`, which the driver freezes. `PT.end()` numbers match the §12 formula exactly (Sam verified 3 runs; Dex 1). |
| Fresh save shows locked Stormcaller selected | **Harness artefact (fixed)** | The title was drawn from the origin's save before the sandbox swap. `PT.init` now re-renders. |
| Title stale after a Sanctum buy | **Harness artefact (fixed)** | `PT.buy` didn't re-render; it now does. |
| Abandon pays 0 shards and doesn't count | **Real behaviour** | `quitToTitle()` skips `recordRun`. Whether it should pay is a design question (see §6). |

Not verified, worth a quick check:
- Rift Tier row disappearing from the title (Sam).
- "Primer complete…" text reappearing at Act II/III start in non-tutorial runs (Mila, Sam, Ilse).
- Relic chest offered at Vashkar's spawn with no visible source (Dex).

## 4. Top issues (ranked by severity × reach × pillar impact)

| # | Issue | Sev. | Raised by | Evidence | Recommended change | Effort |
|---|---|---|---|---|---|---|
| 1 | **Aurelith unkillable while Prism-Shamans live; Cryomancer runs soft-lock** | Blocker | Rhea, Sam, Viktor, Dex, Ilse | §3; Aurelith TTK 344–593 s (Viktor), never (Rhea, Sam ×3) | Exclude bosses from `castBarrier` (or cap boss barrier at a small flat value). Show the ward element on the boss bar. Add a stall backstop (enrage, or shamans flee). Off-screen boss edge arrow. | S |
| 2 | **Chain runaway → shard inflation, HUD noise, Prism Lens echo engine** | Major | Viktor, Dex, Ilse, Noor, Mila | maxChain 3k–15k; 46% of Cryo shards; "×2993"; ~14 reaction chips | Cap the shard term (e.g. `min(maxChain, 300)/10`). Make Chain decay, or cap it at ~100 with a hard reset. Stop echoes chaining echoes. Format big numbers; merge feed chips (≤ 4, 1.5 s merge window). | S |
| 3 | **Hero lost in own VFX; low-HP wash hides everything** | Major | Mila, Ilse, Rhea, Noor | `pt-ilse-a3-peak`, `a3-arc-hitstop`, `pt-mila-act2-chaos`, `pt-rhea-vash-low3` | Post-bloom hero outline + brighter under-foot ring. Fade own VFX within ~3 u of the hero. Low-HP feedback as an edge pulse, not a full wash. | M |
| 4 | **Cryomancer dominant / untouchable; Arcanist a trap first unlock** | Major | all 7 | Cryo 7/7 wins vs 0/30; 0 dmg over 3 acts (Rhea, Noor); Arcanist 0 reactions in a run (Viktor) | Audit Cryo's defensive stack (Permafrost armour, +30 HP, Glacier Plate, freeze-everything novas). Give Arcanist an early status source. Reconsider unlock order. | M |
| 5 | **Act II burst spike: War Boar / Ogre / flame ring hits of 36–48 on a 90–130 HP bar** | Major | Rhea, Viktor, Mila, Dex | War Boar damage windows of 83–208 HP; projectiles top killer in 19/30 non-Cryo deaths | Per-hit cap (~25% max HP) or 0.5 s i-frames after a big hit. Stagger charges. Brighter "aimed at you" telegraph. (Bot hands exaggerate this: directional.) | S–M |
| 6 | **"Why did I die?" unanswerable** | Major | Noor, Mila, Rhea | death screen names no killer; avatar hidden at low HP | Death recap: top 2–3 damage sources with names/icons, last 3 s of hits, one contextual tip (e.g. "Orcs resist fire"). | S–M |
| 7 | **Fusion messaging is wrong/incomplete** | Major | Noor, Mila, Sam, Viktor | Death-screen tip says "any two skills at rank 3"; hints don't name the partner; fusion card arrives one level-up late; "consumes both parents" not stated | Correct the copy. "Partner needed: X (r1/3)" on cards; progress pips. "(replaces both)" on fusion cards. All 10 recipes as codex silhouettes. Bias pool toward the missing parent. | S |
| 8 | **Meta exhausted by ~run 7; tiers only add HP** | Major | Viktor, Sam, Rhea | 1,440-shard total sink; 3,498 shards banked unspent; no new enemies/mechanics T0–T4 | Shard sinks (starting loadouts, relic/fusion unlocks, cosmetics, ascension affixes). One modifier per tier (new behaviour, not just HP). | M–L |
| 9 | **Draft dilution / dead cards** | Major | Viktor, Dex, Noor | ~6% all-weak hands; Magnetism/Swiftness/Amplify/Precision filler; Meteor first at L11; no frost card until L4 for Cryo | Pity rank-up for owned skills/fusion parents. Guarantee a starter-element card by L4. Rework dead passives. Banish should narrow the pool. | M |
| 10 | **Onboarding stops at 4 buttons; jargon wall; Chain explained 3 ways** | Major | Noor | primer covers LMB/WASD/Space/crystals only; "u", Chill, Echo, Adrenaline unexplained; Chain = XP (primer) vs +50% dmg (HUD) vs +0.5% XP (DESIGN) | 2–3 optional primer steps (2nd skill, first level-up with reroll/banish, first chest). Hover glossary. One Chain rule everywhere. | M |
| 11 | **Off-palette / colour-only threats** | Major | Ilse | Act II geyser = thin cream cracks on tan (unseen damage). Lime toxin ring on grass. Ward element = bubble colour only. | Geyser → filled red-orange pulsing disc. Glyphs on wards. Thicker rims. Colour-blind toggle with hatch fills. "Reduce flashes" option. | S–M |
| 12 | **XP droughts then floods; 3–5 level-up modals in a second** | Minor | Mila, Viktor, Noor | L7 at 1:57 and still L7 at 3:09; boss kills grant 3–5 levels instantly; L66 at victory | Flatten the early curve; spread boss XP. Batch multiple level-ups into one multi-pick. Convert late-game XP into something useful. | S–M |
| 13 | **Boss TTK spread too wide** (Gorrak 12 s → 160 s; trivial for fire, sponge for frost; ~300 foes alive at spawn) | Minor | Dex, Rhea, Mila | batch TTK arrays | After fixing #1 and #4, re-measure. Thin the field at boss spawn. Give Gorrak one must-dodge attack. | S |
| 14 | **Abandon pays nothing, silently** | Minor | Sam, Rhea, Noor | quit at Act III = 0 shards, run not counted, no Stormcaller | Warn on quit, or pay partial shards / count acts reached. | S |

**Smaller polish:**
- Glass Sigil's −40% max HP isn't shown as a number on the card.
- Vashkar's fire-resist banner is too brief; add a resist icon on the boss bar.
- Perfect Dodge has no visible cue or reward.
- Prism Ward log spam.
- Smallest HUD text is 11.2 px.
- Rank-up cards show only the new value.
- Act III reads as sunny like Act I (Rhea; Mila liked it).

## 5. What to keep (consensus praise)
- **Art direction & world:** three distinct, charming biomes. Crowds are the star. Spells have personality (Mila 9/10, Ilse, Viktor).
- **Teaching devices:**
  - "Reacts with your fire: COMBUST" and "Fusion path: + X → Y" card hints (Noor, Mila, Viktor, Sam).
  - First-time reaction toasts that spell out the recipe.
  - The short primer.
- **Fusion forks** (Tempest vs Thunderhead, Cataclysm vs Starfall, Hailstorm vs Absolute Zero) are the best decisions in the game (Viktor).
- **Rerolls as a tool, and relics with identity** (Pyre Crown, Prism Lens, Ember Heart).
- **Combat readability basics:**
  - Magenta enemy projectiles with a white core.
  - Red ring/wedge telegraphs.
  - Beam outline → lit bar (Ilse, Rhea).
- **Comfort:** low screen shake and short hit-stop (Ilse).
- **Pacing beats** (Elite Surge 1:30, Swarm 2:15, boss 3:00) land to the second (Dex).
- **Shard formula** matches spec exactly (Sam, Dex).
- **Writing:** relic flavour lines ("Not yet.", "Paid in advance. Forever.") and a coherent act/boss arc (Sam).

## 6. Design tensions (persona disagreements = decisions to make, not noise)
| Tension | Casual / newcomer side | Hardcore side | Suggested resolution |
|---|---|---|---|
| **Difficulty** | Mila/Noor: Act II boss deaths feel random | Rhea/Viktor: Act I and Gorrak have no teeth; Cryo never threatened | Make threats *present but fair*: cap burst damage, give Gorrak one must-dodge attack, add tier modifiers instead of raw HP. |
| **VFX spectacle vs readability** | Mila: spells are the fun (9/10) | Ilse: own VFX hide the hero and telegraphs | Don't tone spells down globally; protect a readable bubble around the hero and keep telegraphs above VFX. |
| **Chain as juice vs economy** | Mila: the climbing counter is addictive | Viktor/Dex: it is the whole economy and breaks it | Keep the counter feel (milestones, banners); decouple payouts; cap/decay the number. |
| **Codex pace** | Noor: learned all reactions in run 1 (good teaching) | Sam: reaction codex done on day one, nothing left to chase | Keep reaction discovery fast; add mastery goals (e.g. Chain 50 with each reaction). Make fusions the long chase, with a visible map. |
| **Quitting** | Noor/Sam: quitting a stuck run wastes 15 min | design intent: shards reward finishing | Pay shards for acts reached on quit, or warn. Less needed once #1 is fixed. |

## 7. Recommended backlog

**Now (bugs and blockers, all S):** done 2026-10-09; see "Now fixes applied" below.
1. Bosses excluded from Prism-Shaman barriers, plus ward element on the boss bar and an off-screen boss arrow (#1).
2. Cap the Chain shard term and stop echo-of-echo. Merge/cap reaction feed chips and abbreviate Chain (#2).
3. Fix the fusion copy ("specific pairs", "replaces both", partner name) (#7).
4. Geyser telegraph in the red-orange family (#11).
5. Quit warning (#14).

**Now fixes applied (2026-10-09), verified in-engine:**

| # | Change | Where | Verification |
|---|---|---|---|
| 1 | `castBarrier` skips bosses. Off-screen boss edge marker (red skull + distance) added to the HUD marker pool. The ward gem on the boss bar already existed. | `enemies.js castBarrier`, `hud.js _updateMarkers` | Aurelith (jumped, Cryo): barrier stayed 0 while 18 nearby foes held barriers; boss died ~13 s after spawning. Cryo batch, n = 3 expert: 3/3 wins, Aurelith TTK 63 / 153 / 109 s (round 1: 344–593 s or never). Marker seen at the screen edge reading "30m". |
| 2 | Shard Chain term capped: `floor(min(maxChain, 300)/10)`, max 30 shards (`CHAIN_SHARD_CAP`). Echoes only fire for reactions the player caused directly (`reactionDepth === 0`), not for reactions an echo set off. Chain counter and feed counts abbreviated (`1.2k`, `15k`). Expired feed chips leave the DOM on game time, not on a WAAPI `onfinish`. | `meta.js`, `combat.js`, `hud-util.js fmtCount`, `hud.js`, `hud-fx.js`, `DESIGN.md §12` | `computeShards`: maxChain 15,079 now pays the same as 300 (+30). Cryo batch maxChain 1,145 / 3,084 / 1,660 (round 1 wins: 2,133–7,040; n = 3, directional). **Reclassified:** Ilse's "~14 duplicate chips" was mostly a harness artefact. The feed already merged by type and capped at 4, but faded rows were only removed by `onfinish`, which never fires while the sim drives the HUD; the fix makes it robust either way. |
| 3 | Fusion copy. Rank-up hint names the partner and its rank ("Fusion path: Blizzard r2/3 → Thunderhead"). New-skill hint adds "both rank 3". Ready hint says "at your next level-up". Fusion card hint adds "· replaces both". The death screen, pause "fusions in reach" and codex empty states say "a specific pair of skills, both at rank 3". | `progression.js`, `menus.js`, `ui.js` | Seen on a live level-up modal. |
| 4 | Geyser crack seams glow red-orange (`SEAM_HOT`) inside the red telegraph ring, then cool to dark ember after the eruption (1.0 s, was a 1.4 s cream glow). Act II tip updated. **Reclassified:** the red ring already existed. The cream cracks lingering after an eruption, with no ring, read as an unmarked hazard. | `world.js _updateFissures`, `tutorial.js` | `playtest/out/dev-geyser-tele.png` vs `dev-geyser-after.png`. |
| 5 | Abandon confirm names the loss: "Forfeit N shards?", with a tooltip explaining it pays nothing and does not count. Partial payout stays a design decision (§6). | `ui.js _onAbandonClick` | Paused mid-run, armed button read "Forfeit 50 shards?". |

Still open from #2: Chain itself still runs into the thousands in dense hordes (the 2.5 s window never lapses). The economy no longer depends on it, but decay or a cap is a design call for the Next batch, together with #10's "one Chain rule".

**Next (core clarity & balance, M):** done 2026-10-09; see "Next fixes applied" below.
6. Hero readability layer + low-HP edge pulse (#3).
7. Death recap (#6).
8. Cryomancer defensive audit + Arcanist early status source + unlock order (#4).
9. Per-hit cap / post-hit i-frames, War Boar stagger (#5).
10. Draft pity + starter-element guarantee + dead-passive rework (#9).
11. XP smoothing and multi-pick level-ups (#12).
12. Then **re-run Dex's batch** (n ≥ 8 per cell) to re-baseline boss TTK and class win rates (#13).

**Next fixes applied (2026-10-09).** Contracts and file ownership are in `NEXT.md`. Two Sonnet agents built the recap and the draft work, and an Opus agent built readability; the orchestrator did the plumbing and balance. Everything was verified in-engine, and the pre-change build is `backup/riftbound-v4.1-pre-next.zip`.

| # | Change | Where | Verification |
|---|---|---|---|
| 3 | **Hero readability.** A hero-layer mask pass runs after the main render and before bloom. When the player's own VFX or bloom cover the hero, it restores the hero's colour and draws a class-coloured light rim plus a dark ink rim; the under-foot ring always shows through. Own VFX (particles, shells, clouds, ribbons, decals, arcane glyphs) fade to 0.35× near the hero, only while the screen is busy. Low HP: the full-frame 40% desaturation is gone; only the edge desaturates, with the red edge pulse plus a pulsing red hero outline. Hostile projectiles and telegraphs are never faded. | `engine.js`, `heroes/index.js`, new `vfx/heroYield.js`, VFX bundle files | `dev/shots/next-read-*`. Stress frame with 172 enemies: hero invisible with the layer off, obvious with it on (`next-read-stress172-{off,on}`). Calm frames are pixel-identical. +0.10 ms GPU, one half-float target. Also fixed: arcane glyphs persisted into the next run. |
| 6 | **Death recap.** Headline "Slain by War Boar · charge · 41" ("Caught by Fissure Geyser" for hazards). Top 3 damage sources with share bars. "The last moments": the last 5 hits with HP after each. One tip from a 14-entry table. Data: `player.takeDamage(amount, source, how)` → `playerHit {name, how}` → `stats.hurt {by, recent, killer}`. Enemy projectiles now carry their shooter's name. | `menus.js`, `menus.css`, `uishots.js`; plumbing in `player.js`, `game.js`, `enemies.js`, `bosses.js`, `world.js` | `dev/shots/next-recap-*` at 1280×720 and 800×600, plus a real in-game death. The playtest digest now names shooters too ("Orc Spirit-Shaman", not "enemy projectile"). |
| 4 | **Cryomancer:** Frost Armor absorbs 60% of a hit instead of the whole hit. **Arcanist:** every 3rd Arcane Bolt volley is *Prismatic* (Fire → Storm → Frost), so it sets up its own Combust, Arc Flash and Shatter. **Unlock order:** Cryomancer = beat Gorrak (first unlock), Arcanist = discover 4 reactions. The title order follows. | `player.js`, `arcaneBolt.js`, `classes.js` | Arcanist with Arcane-only skills: Combust ×12 and Arc Flash ×12 in its first 3 min (round 1: one run with 0 reactions). |
| 5 | **Per-hit cap:** 30% of max HP, after armour. **Charge stagger:** charge wind-ups across all chargers start ≥ 0.6 s apart. | `player.js`, `enemies.js` | War Boar is the top damage source in 1 of 24 non-Cryomancer deaths (round 1: a top-2 source in most Act II deaths). |
| 9 | **Draft:**<br>• Pity: every hand holds a fusion, a new skill or a rank-up while one exists; 0% passive/heal-only hands (was 2–5%).<br>• Class-element guarantee at L3: first element card at mean L2.5 (was L3.7).<br>• The fusion-parent ×2 bias applies only from L8.<br>• Banish also stops rank-ups and fusion hints.<br>• Reworked passives:<br>  – Swiftness: +6% move, −6% dash cooldown.<br>  – Magnetism: +25% pickup radius, +5% XP, +15% reaction-kill XP.<br>  – Amplify: +8% area, +2% cast echo.<br>  – Precision: +6% crit, +3% damage.<br>Rift Magnet's reaction XP is now additive. | `progression.js`, `registry.js` PASSIVES, `relics.js` | See the regression note below. Banish fuzz: 4,500 hands, 0 leaks. |
| 12 | **XP:** L5–L11 ease from the early ramp into the main curve; the L4→L5 cliff (48 → 178 XP) is gone. **Multi-pick:** queued level-ups deal hand after hand in one open modal with an "N of M" stamp, and reroll/banish work per hand. The adapter still gets one decision per hand, now tagged `hand: "2 of 3"`. | `player.js xpForLevel`, `game.js _openLevelUp`, `ui.js`, `modals.css`, `playtest/adapter.js` | Screenshots of hands 1/3 and 2/3 checked; a 13-level burst surfaced as 13 decisions. |

**A regression caught in integration.** The first draft version counted only rank-ups and fusion parents as "advancing". Pity then swapped rank-ups into hands of fresh skills, and greedy drafting fused away the starter by about L9. In the class batch, 4/8 Stormcaller runs died in Act I. An A/B of old vs new `rollCards` on identical player states (50 drafts per class, L2–L12):

| | Skills at L12 | Fused by L12 |
|---|---|---|
| Old | 5.1–5.3 | 22–32% |
| Buggy new | 2.2–3.5 | 60–95% |
| Fixed | 5.2–5.5 | 26–40% |

Fix: any new skill counts as advancing, and the fusion bias waits until L8.

**Class batch** (average bot, n = 8 per class, tier 0):

| Class | Round 1 (n = 5) | After "Now" + balance | Final build |
|---|---|---|---|
| Cryomancer | 4 wins of 4 finished (+1 cut off by the time cap) | 3/8 wins | 2/8 wins; dies in Act III (Naga Tidecaller) |
| Pyromancer | 0/5, Act II | 0/8, Act II | 0/8, Act II, median 6:40 |
| Stormcaller | 0/5, Act I–II | 0/8, Act II | 0/8, median 8:00 (2 reached Act III) |
| Arcanist | 0/5, Act I–III | 0/8, Act II | 0/8, median 6:37 (1 reached Act III); Gorrak median 21 s |

**Still open:**
- **Projectiles.** Ranged-enemy projectiles (Orc Spirit-Shaman, Naga Tidecaller) are now the top damage source in 21 of 24 non-Cryomancer deaths. This is partly the bot's weak dodging, but it is the next readability/balance check (bolt speed or count in Act II).
- **Cryomancer boss damage** is still low: Gorrak median 102 s, with one 693 s outlier (likely bot kiting).
- The Cryomancer is still the only class that wins with bot hands.
- Re-run the persona panel (round 2) to judge these changes with player eyes.

**Later (retention, M–L):**
13. Shard sinks and tier modifiers (#8).
14. Primer extension + glossary + one Chain rule (#10).
15. Colour-blind toggle and "Reduce flashes" option (#11).
16. Fusion codex map and reaction mastery goals.

## 8. Harness caveats & round-2 improvements
- **Bot hands are a proxy.**
  - Every skill level usually dies in Act I–II, except with Cryomancer. Expert vs average made no clear difference (Dex, n = 5), so the bot's ceiling is low.
  - The bot also kites the horde rather than chasing an off-screen boss, which inflates boss TTK beyond the barrier bug.
  - Treat difficulty numbers as directional. *What* hurt and *whether it was visible* are solid.
- **Crutches and auto-picks.** Assisted/jumped runs (Ilse, Rhea, parts of Viktor) were tagged and were not used for difficulty claims. Several personas used auto-pickers late in long runs to save calls; those picks are not in character.
- **Not evaluated:** audio, real-time input feel, and HUD visuals beyond text (canvas shots carry no HUD).
- **Round 2 improvements:**
  - Teach the bot to approach the boss when the field is calm.
  - Add a "the boss hasn't lost HP in 30 s" stop reason.
  - Emit events for Second Wind / Perfect Dodge.
  - Optional HUD composite screenshots.
  - Raise the batch cap above 21 min (3 Cryomancer runs were censored).
- **Cost:** ~1.7 M subagent tokens across the 7 personas (Sam the largest at ~470 k), and 7–21 min wall time each, run in parallel.

## Appendix — persona reports
[01 Mila](01-mila.md) · [02 Viktor](02-viktor.md) · [03 Noor](03-noor.md) · [04 Rhea](04-rhea.md) · [05 Ilse](05-ilse.md) · [06 Dex](06-dex.md) ([data](06-dex-data.json)) · [07 Sam](07-sam.md)
Each report ends with a machine-readable `Findings` JSON block (area / type / severity / evidence / recommendation). Round 2 can diff against it.
