# Playtest round 2 — synthesis (v5 Rift Obelisks & raid bosses)

Build: `backup/riftbound-v5.0-playtest-r2.zip`. Panel: 6 personas (5 Sonnet, 1 Haiku), 31 runs + 40 + 32 bot sims. Reports: `01-rhea` … `06-dex` in this folder; lane batch `../raid-sims.md`.

## Executive summary
The structure lands: every persona called the seal and arena an *event*, the telegraphs honest, and the Break Check the best new mechanic. The obelisk cards teach Haste and Echo on their own. The problems sat in three places, all fixed in v5.1:
- **Tuning:** Stagger was free for reaction builds and impossible for single-element builds, Vashkar ran about 2× target, and obelisk payouts were thin.
- **One real fairness bug:** King's Wrath rings came 2.3 s apart in a sealed arena, while the slowest dash recharges in 3.0 s.
- **Communication:** stale death tips, undefined status words, overloaded gold, stacked banners, a stagger bar that emptied at a Break Check, and level-ups popping over the boss's arrival.

## Scorecard
| Persona | Hands | Fun | Domain | One line |
|---|---|---|---|---|
| 01 Rhea (challenge) | expert | 6 | 6 | Fair and readable, but reaction builds short-circuit Stagger and the fights drag |
| 02 Viktor (buildcraft) | expert | 7 | 5.5 | Good obelisk skeleton, lopsided numbers, death forfeits payouts silently |
| 03 Mila (casual) | casual | 7 | 6.5 | Gorgeous arenas, Echo moment lovely; arrival lost under level-up modals |
| 04 Noor (newcomer) | casual | 7 | 5 | Obelisk cards teach well; Stagger / Downed / gold zones never explained |
| 05 Ilse (readability) | average | 8 | 6.5 | Telegraphs honest; colour language muddy, banners collide, boss hides |
| 06 Dex (numbers) | sims | n/a | n/a | Gorrak ≈ target, Vashkar ≈ 2×, Wrath 3 the deadliest for the least pay |

## Verified claims
| Claim | Personas | Verdict | Evidence / fix |
|---|---|---|---|
| Backhand is undodgeable | Mila, Rhea, Dex | **Design flaw (partly)** | Instrumented 14 backhands: every 1.1 s one was dodged. The combo follow-up (0.6 s lead plus a 6 u lunge) was not: about 3 u to clear after reaction time. Fix: 0.85 s lead, 2 u step. |
| King's Wrath kills | Noor, Rhea, Mila | **Real bug** | Rings 2.3 s apart can't be outwalked in a sealed arena; Pyromancer dash cd is 3.0 s. Fix: 3.2 s apart (Aurelith frost rings too). |
| Stagger is free for reactions | Rhea, Viktor | **Design flaw** | staggerGained 25–130 per 5 s; Gorrak Downed most of P1. Fix: reaction fatigue (×1/(1 + f/4), τ 4 s). Perfect dodge and crystal 5/6 → 10. |
| Mono-element can't stagger | Viktor | **Design flaw** | Fix: status pressure +1.5 per 0.5 s while Burn / Chill / Shock is on the boss. |
| Freeze-lock | Vashkar agent | **Real bug** | Chained re-freezes held a boss at 99% frozen. Fix: no re-freeze for 4 s, stun at most every 1.5 s. |
| Stagger resets at a Break Check | Ilse | **Design flaw** | Fix: the bar carries over; target = max(base, bar + base), capped. |
| Arrival under level-up modals | Mila | **Design flaw** | Fix: modals wait through the Seal plus 2.5 s after the landing. |
| Death tip names the wrong move | Mila, Noor | **Real bug** (stale text) | Fix: 36 tips, per boss move. |
| Gold overloaded | Ilse, Noor | **Design flaw** | Fix: safe zones solid saturated gold with stripes; pods lime; Haste cyan. |
| Stale banners in the HUD text | Rhea, Viktor, Mila, Noor | Real (DOM left behind) plus a harness amplifier (frozen rAF) | Fix: HUD removes encounter elements on run/act start. |
| Elite Surge during Haste | Mila | **Real bug** | Fix: beats wait during the 3 s warning. |
| Wrath heat climbs while you stand | Viktor, Noor | **Design flaw** | Fix: step out and back in for each heat. |
| Vashkar about 2× target | Dex, Rhea | **Balance** (amplified by the bot ignoring banners) | Fix: HP 30k → 24k, banner DR 0.25 → 0.2 each. Gorrak 16k → 14.5k, Aurelith 92k → 86k. |
| Aurelith beam damage | Dex | **Bot limitation** | Beams sweep (not a ground telegraph); the hands can't use pillar shelter. Humans: Rhea/Ilse found it readable. |
| Boss hidden by canopy | Ilse | **Real** | Arena centred on the player includes trees; fix in env cut-out (arena agent). |
| Card numbers differ from payout | Viktor | Expected (live estimate) | Cards now prefix "≈". |
| No chest after the Act III win | Viktor | Expected (the run ends) | Act III perks now pay +20 shards each, and the card says so. |

## What to keep
- The Seal, the walls and the horde dissolving.
- Break Checks.
- Named damage sources.
- The three-phase rhythm with Winded windows.
- The Echo reveal.
- Molten Tide and Floodfall.
- The obelisk cards' cost/pay format.

## Design tensions (decisions, not noise)
- **Stagger as skill vs build.** Rhea wants dodging to matter more than reaction spam. Viktor wants every build to reach it. v5.1 does both: fatigue plus status pressure plus 10 for perfect dodges. Watch whether mono builds now feel equal.
- **Obelisk risk for casuals.** Mila found channelling under Rift Pull scary; Rhea found it toothless at expert. Kept as-is: it is opt-in risk.
- **Healing in the arena.** Noor and Rhea suggest a small heal after Break Checks. Not done; candidate for v5.2 if attrition deaths dominate.

## Backlog
- **Now (done in v5.1):** everything in the verified table.
- **Next:**
  - re-run this panel and diff the findings;
  - Dex lanes n ≥ 8 on v5.1;
  - colour-blind telegraph fill hatching;
  - a "reduce flash" option;
  - more boss-relic variety per boss.
- **Later:**
  - an in-arena heal source;
  - a ghosted second segment on the Echo bar;
  - per-boss affixes;
  - an Overtime / Tithe obelisk.

## Harness notes
- **Tab cap.** The browser holds about 9 tabs. Close finished agents' tabs before a panel; Rhea and Dex were blocked about 10 min.
- **Hands extended.** The kit's hands now handle cone and donut zones, wide-cone escape (nearest edge ray) and a function-valued arena (synced to the skill kit).
- **sim.js additions.** The bot uses `BossBase.danger()`; `player.god` replaces `relicDmgTaken` for god mode (a relic reset it).
- **Still blind.** The bot cannot dash-time rings or use pillar shelter.

## v5.1 check (after the fixes; `../raid-sims-v5.1.md`, 32 bot runs, god off, n = 8 per lane)
| Lane | Gorrak killed | Gorrak TTK mean | Deaths in boss (r2 → v5.1) | Obelisk shards (r2 → v5.1) |
|---|---|---|---|---|
| none | 7/8 | 68 s (target 60–75) | 0/8 → 2/8 | 0 → 0 |
| haste@90 | 6/8 | 89 s (−2.5 levels at spawn) | 3/8 → 2/8 | 13.6 → 22.1 |
| echo | 6/8 (+ Echo 6/8) | 101 s both bodies | 5/8 → 2/8 | 10.4 → 28.3 |
| wrath:3 | 1/8 | 83 s | 6/8 → 4/8 | 11.3 → 5.6 |
- **Vashkar:** the default-lane kill took 92 s (target 80–100), but that's n = 1; bots rarely reach him.
- **Wrath 3:** it stays the riskiest lane for the bot, which mostly dies channelling three times under Rift Pull. That's the intended "all-in" risk; expert personas survived it. Re-check with the next persona panel.
