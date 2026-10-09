# Rhea — challenge seeker · playtest round 1
**Verdict (in character, 2–3 sentences).**  The telegraphs are good (thin red outlines, clear circles, a lit beam), so when I got hit it was mostly my own mistake or a pile-up, not a cheat. But there is almost nothing to master: Act I and Gorrak never touched an expert hand, Cryomancer took zero damage for whole runs at Tier 0 and Tier 3, and Aurelith is a wall that barely lost HP for minutes. The real threat is the horde and the stray War Boar charge, not the bosses, and those hits (40–48 on a 90–130 HP bar) land from inside a cloud of the player's own VFX.
Fun: 6/10 · Would play again tomorrow: maybe · Domain score: 5/10

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| 1 | Pyromancer / T0 | Died Act II, 6:48, L18, vs Vashkar 78% | Cinder Bolt + Meteor→Starfall + Chain Lightning + Singularity, Ember Heart | 191 | Gorrak killed in ~28 s without a scratch. Died in Vashkar's fight: flame ring 36 x2, boss contact 44, War Boar charge 46 |
| 2 | Cryomancer / T0 | Abandoned in Act III, 14:39, L34, 2 bosses dead | Ice Shard, Frost Nova, Chain Lightning, then Frostfire Comet/Storm Halo (I accidentally took Glass Sigil, max HP 154→92) | 0 (abandon) | **0 damage taken all run**. Gorrak 85 s, Vashkar 106 s. Aurelith stayed at 100% for 2:20+ |
| 3 | Stormcaller / T0 | Died Act III, 11:04, L34, vs Aurelith 95% | Chain Lightning r5 → Tempest, Meteor r5, Static Field r4, 9 relics | 347 | Gorrak 47 s, Vashkar 45 s. Killed by Aurelith beams (40 each, twice) + whelps |
| 4 | Stormcaller / T1 | Died Act II, 9:23, L16 | Weak draw: Spark, Chain Lightning r4, Static Field r3 | 196 | Gorrak took ~3 min, 319 enemies alive at the boss. Killed by an Ogre hit (39) at 16 HP, after a War Boar (48) |
| 5 | Cryomancer / T3 | Abandoned in Act III, 18:32, L32, Aurelith 66% | Chain Lightning, Frost Nova, Hailstorm, Blood Pact, Thorned Ward | 0 (abandon) | Gorrak ~160 s, Vashkar 129 s, both with 0 damage. Aurelith: 100→66% in 2:30, then frozen at 66% for 2+ min |
| J1 | Pyromancer / T0 [jumped] Aurelith | Died 0:07 | no relics | 47 | Surge+swarm spike: Storm Wyvern 34, Whelp 16, beam 40 |
| J2 | Stormcaller / T0 [jumped] Aurelith | Died 0:22 | Tempest/Singularity/Plasma Orb | 53 | Boss 93% in 20 s, then stalled |
| J3 | Arcanist / T0 [jumped] Aurelith | Died 0:12 | Precision r5, Might r5 | n/a | Crag Drake 63 + projectile 52 |
| J4 | Cryomancer / T0 [jumped] Gorrak | Left after 12 s (screenshots) | – | – | Telegraph shots only |

## Highlights (what worked — keep these)
- **Telegraphs are legible when I can see them.** Boss slam = red circle with glyph + pillar of light (shot: `dev/shots/pt-rhea-gj-3.png`, `gj-9.png`); Vashkar charge = thin red rectangle (`vc-5.png`, `vs-0.png`); meteor rain circles (`vash-0.png`); Aurelith beam = outlined bar, then lit bar (`ja-5.png` → `ja-6.png`); Shard Rain circles (`ja-5.png`). [seen]
- **Enemy projectiles are bright magenta orbs** with a clear silhouette against both the green and ochre biomes (`gor-1.png`, `ja-5.png`). [seen]
- **The Gorrak fight carries a clear mechanic read:** green horn ring (summon), red slam circle, volley rings. Phase 2 is announced in the event log (`3:11 enters phase 2`). [seen/data]
- **Act III lightning strikes** are a fair hazard: pale column + ground flare is visible before it lands (`c3-full.png`). [seen]
- **Dash / Perfect Dodge does something:** at T0 the bot logged 1–7 dashes and 0–5 perfect dodges per 10–20 s in mid-fights; in run 2 and run 5 those were the fights with 0 damage. [data]
- **Level pacing is on target** with an expert: L8–10 at the Act I boss, L16–19 at Vashkar, L29–30 at Aurelith (targets 10 / 18 / 26+). Run length to the Act III boss was 10:36 (Stormcaller T0) and 12:16 (Cryo T0). [data]
- **Boss TTK**: Gorrak 28 s (Pyro) / 47 s (Storm) hit target, Vashkar 45 s (Storm) hit target. [data]
- **Clear death readouts:** the damage-by-source log (`War Boar`, `boss flame ring`, `Crag Drake`...) made every death explainable. [data]

## Pain points (ranked, worst first)
1. **Aurelith barely takes damage / stalls (possible wall).** Cryo T0: 100% for 2:20 at L33. Stormcaller T0: 100→93% in 20 s then flat. Cryo T3: 100→66% in ~2:30 then 66% for 2+ min with the boss fully alive. Target is 60–90 s. Boss HP never recovered the other way; it just stops moving. In the full frames the boss is often off-screen while the player kites the horde, so the damage goes to adds (4,400–5,100 kills). The Prism Ward reads as "invulnerable" from outside, and nothing on screen tells the player what to do about it. [data/seen] · Severity: **blocker**
2. **Cryomancer is untouchable; Gorrak harmless.** Cryo took 0 damage over Acts I–III at T0 (154 HP, run 2) and ~0 through Acts I–II at T3 (170 HP), vs the other classes losing 40–50 HP per charger hit. Gorrak did zero direct damage in 5 fights across three classes. For a challenge seeker the first act and first boss have no teeth. [data] · Severity: **major**
3. **Burst hits (36–48) from chargers and bosses are 30–40% of the HP bar in one hit, from inside VFX clutter.** War Boar 41–48 (4 times across runs), Ogre 39, Vashkar flame ring 36 (twice, each time hitting before the next frame), boss contact 44, Aurelith beam 40 (x3 across runs). The telegraph exists (e.g. `vs-0.png` shows the boar's line on the player), but the player sprite is tiny/white-flashed under steam, flames and lightning, so a human cannot read "this red line is mine" in time. Two-hit deaths follow. [data/seen] · Severity: **major**
4. **Player hard to find at low HP.** The low-HP red vignette washes out the whole screen (`vash-low3.png`, `sc-low.png`). In `vash-low3.png` I could not find the player at all; in `death3.png` the sweeping beam goes straight through a cluster of white VFX. [seen] · Severity: **major**
5. **Boss jumps are unfair by construction**, so I could not test phase 2 of Aurelith. Surge + swarm + boss within the first 5 s killed three different classes in 7–22 s. Harness caveat, but it also means the in-game "Elite Surge 1:30 then boss 3:00" ordering is quite different from what a boss-rush player would get. [data] · Severity: minor
6. **Dodging is mostly rewardless at low skill thresholds.** Perfect Dodge counts were similar in deaths and in clean runs (0–5 per 10 s in both); nothing indicates a visible payoff (damage, a cooldown refund, a "Perfect!" cue in the event log). I could only see the counter in the harness. [data/inferred] · Severity: minor
7. **Tier 1 is hard to read as scaling.** Same class, tier 0→1: died ~1 act earlier (11:04 Act III → 9:23 Act II) but my draft was worse (no Meteor), so I cannot separate class RNG from tier. Level at the Act I boss: T0 L8 vs T1 L7 vs T3 L7. [data] · Severity: minor
8. **Act III looks like Act I.** Sunlit green meadow with a river; only rain/lightning say "Stormwater Reach". Not a combat problem but it weakens the sense of escalation. [seen] · Severity: polish

## Bugs & oddities
- `PT.abandon()` then `PT.end()` returned an empty summary and **0 shards** for run 2 (Act III, 2 bosses killed). The player loses all progress for quitting; possibly by design.
- Draft `PT.choose(0)` default on a relic gave me **Glass Sigil** (max HP 154→92). I did not see the penalty text at choose time; worth a "this lowers max HP" tag in the card. [read after the fact]
- Aurelith held at exactly 66% for 2+ min at T3 while 320 enemies stayed alive (cap). Possibly the boss is out of range of every AoE; horde never thins while the boss lives. Repro: Cryomancer T3, take Chain Lightning/Frost Nova/Hailstorm, reach Act III (13:54).
- Several events were logged twice in the damage window: Vashkar `boss flame ring: 36` repeatedly appears for 2 frames in a row; unclear if that is one ring or two.
- HP jumped from 4/90 to 32/90 in 3 s during Vashkar's fight (health orb drop?) and later 74→114 in one second. Recovery is large and unannounced; it lets near-deaths reset.
- `PT.shot(... around:'boss')` sometimes frames empty ground when the boss is off-screen (`gorrak-start.png`).

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort guess S/M/L |
|---|---|---|---|---|
| 1 | Make Aurelith killable and visibly "breakable": show the current ward element on the boss's HP bar, give the boss a minimum damage floor, and pull the boss toward the player (or add an arena ring) so it cannot sit off-screen while the player kites adds. Check why it stalls at a fixed % | 1 | 60–90 s TTK, a boss you actually fight | M |
| 2 | Add a "your threat" marker: tint any telegraph aimed at the player brighter than all others, plus fade the player's own steam/flame VFX near the hero. Keep the hero silhouette on top | 3, 4 | Fewer "where was the line?" deaths, a fairer Hard feel | M |
| 3 | Add a damage cap on a single hit (e.g. 25% of max HP) or a 0.5 s i-frame after a charger hit; also stagger War Boar charges in Act II | 3 | Removes two-hit deaths from 90–130 HP bars | S |
| 4 | Add teeth to Act I / Gorrak and to Cryomancer: more Gorrak slam uses on a moving player (shorter cycle), Cryo defensive-tool nerf (it got 0 damage in 3 acts) | 2 | Challenge exists from minute 1 and every class is exposed to mistakes | M |
| 5 | Show a "Perfect Dodge!" tag + a small reward (cooldown refund / brief damage buff) and log it as an event | 6 | Skill expression becomes visible and desirable | S |
| 6 | Reduce the low-HP vignette strength / use a thin border pulse instead of a full-screen red wash | 4 | Keeps the hero findable when it matters most | S |

## Domain deep-dive
- **Which deaths felt fair?** Run 4 (Ogre at 16 HP after a 48 War Boar): fair, the bot was cornered by 150 melee enemies; it was my own build being thin. Run 3 (Aurelith): fair-ish, two 40-damage beam sweeps in 20 s on a 114 HP bar; the beam was fully telegraphed (`ja-5` → `ja-6`) but I was in a crowd. Run 1 (Vashkar): the flame ring hit me for 36 twice; the ring is a big pink band (`vash-1.png`) but it came from outside the frame crop and expanded over the whole screen with the horde and the meteor circles overlapping. Not "cheated", but the density made it feel like a coin flip.
- **Which attacks are unreadable or undodgeable?** The War Boar charge (40–48 dmg) is the only one I could not see coming in a crowd: the line exists (`vs-0.png`) but is clipped by flame VFX and appears on top of 2–3 other circles. Vashkar's flame ring is dodgeable (dash through) only if you know the dash is the answer; nothing on screen says so. Aurelith's beam is readable; its sweep speed (3 s) is fine. Aurelith's Prism Ward gives no player-facing instruction.
- **Per boss (attacks, phase 2, TTK vs target).**
  - *Gorrak:* slam circle (red, glyph + light pillar), horn ring (green) that spawns grunts, radial volley (pink orbs). Phase 2 triggers at 50% (logged `3:11`, `3:29`, `4:56`). TTK 28 s (Pyro, ahead of target by 2–17 s), 47 s (Storm, on target), 85 s (Cryo, over by ~40 s), ~160 s (Cryo T3). Never hit me directly: trivial for expert hands. [data]
  - *Vashkar:* charge line, meteor circles, flame ring (pink band). Phase 2 logged `7:09`, `8:14`. TTK 45 s (Storm, on target), 106 s (Cryo T0, 46 s over), 129 s (Cryo T3). Pyromancer's fire is resisted (ANNOUNCE text says so, good), and Pyro lost the fight. Damage on me: flame ring 36, contact 44, plus War Boars from the horde (45–48). Fair but the horde adds do most of the damage, not the boss. [data]
  - *Aurelith:* beam (40 per hit), whelp/wyvern summons (16 and 34 per hit), Crag Drake and projectile adds (47–63). Phase 2 never reached in any run, [jumped]/natural. TTK: none finished (Cryo T3 66% after ~4:40; Cryo T0 100% after 2:20+). A wall in this harness; see Pain point 1. [data]
- **Is any boss trivial or a wall?** Gorrak is trivial; Vashkar is on target for a hitter and long for Cryo; Aurelith is a wall.
- **Does skill expression (dodging) matter enough?** Partly. Perfect Dodge counts correlate with the clean fights, but I cannot see the effect in-game (no cue, no reward), and chargers hit for 30–40% HP anyway. Dash cooldown seems generous (up to 9 dashes in 10 s at T3). [data/inferred]
- **Tier scaling (T0→T1→T3).** T1 vs T0 same class: 1 level less at Gorrak, more chip damage in Act I (hp 90–130 minimum 84 at 2:31 vs 114 flat), died earlier. T3 Cryo: boss HP and horde (273 alive at Gorrak, 316–320 alive at Aurelith, i.e. the 320 cap) are the main change; damage taken stayed ~0 through Act II. So tier scaling hits time and the enemy cap but not the player's survival, which gives longer and more tedious fights, not harder ones. [data]
- **Elite Surge / Swarm spikes.** In natural runs the surge at 1:30 and swarm at 2:15 cost 40–60 HP in Act II (run 3: 114→62 at 8:15) and 0 in Act I. Fine. The jumped boss start stacked both on top of the boss and killed three classes in under 25 s, so jumped results are not a difficulty measure.

## Harness caveats
- Expert bot is both my hands and my eyes: it "kites" the horde, which is why Aurelith can stay far from the action and take no damage from me (and why Cryo took 0 damage). A human who stands near the boss would see very different TTK and different deaths.
- Boss jumps fire the Surge and Swarm at once: I only used them for screenshots and for the "did it die in 7 s" tag. Aurelith phase 2 was never reached, so Shard Rain (shown in `ja-5.png`) and the 4-beam phase are unobserved.
- I could not tell if `dmgBy` double-counts sweeping beams; 40 + 39 across two windows looks like two ticks of one sweep.
- Cryo's 0 damage may come from a specific combination (Thorned Ward, Frost Nova freezing everything near me) rather than a class property. I did not isolate it.
- Run 2's relic mistake (Glass Sigil) and the default choice of the first card when none matched my list made my builds slightly random. Note the Stormcaller T1 run (no Meteor) is a weaker sample.

## Findings (machine-readable)
```json
[
{"area":"bosses","type":"issue","severity":"blocker","finding":"Aurelith barely loses HP: Cryo T0 stayed 100% for 2:20+ at L33, Stormcaller T0 100->93% then flat, Cryo T3 100->66% in 2:30 then stuck at 66% for 2+ min. Target TTK is 60-90 s.","evidence":"Runs 2, 3, 5 timelines; shots pt-rhea-c3-full.png, aur-full.png","recommendation":"Make the ward breakable and visible, keep the boss within the arena/screen, check for a damage floor or stall"},
{"area":"balance","type":"issue","severity":"major","finding":"Cryomancer took 0 damage across all three acts at T0 and ~0 through Act II at T3; Gorrak never hit any class in 5 fights.","evidence":"Runs 2, 5 and Gorrak timelines","recommendation":"Add teeth to Act I/Gorrak; audit Cryo's defensive stack"},
{"area":"combat","type":"issue","severity":"major","finding":"Single hits of 36-48 (War Boar, Ogre, flame ring, Aurelith beam, boss contact) remove 30-40% of a 90-130 HP bar, enabling two-hit deaths.","evidence":"dmgBy logs in runs 1, 3, 4; shots vs-0.png, vash-low3.png, death3.png","recommendation":"Cap per-hit damage or add i-frames; stagger chargers"},
{"area":"readability","type":"issue","severity":"major","finding":"The player is hard to find under the player's own steam, fire and lightning VFX, and the low-HP vignette washes out the screen.","evidence":"pt-rhea-vash-low3.png, sc-low.png, death3.png","recommendation":"Keep the hero silhouette on top; tone the vignette down; tint telegraphs aimed at the player"},
{"area":"readability","type":"praise","severity":"minor","finding":"Telegraphs (slam circle with glyph, charge rectangle, beam outline then lit bar, meteor/shard circles) and magenta enemy projectiles are clear in isolation.","evidence":"gj-3.png, gj-9.png, vc-5.png, ja-5.png, ja-6.png","recommendation":"Keep this visual language"},
{"area":"feel","type":"idea","severity":"minor","finding":"Dash and Perfect Dodge give no visible payoff, so skill expression is invisible to the player.","evidence":"Perfect Dodge counts similar in clean runs and deaths; no on-screen cue seen in shots or events","recommendation":"Add a Perfect Dodge cue and a small reward"},
{"area":"balance","type":"issue","severity":"minor","finding":"Tier scaling mostly lengthens fights and fills the 320 enemy cap (273 alive at Gorrak T3, 316-320 at Aurelith) instead of raising lethality; Cryo T3 still took ~0 damage in Act II.","evidence":"Run 5 timeline","recommendation":"Scale enemy damage/pace more, or add tier-only modifiers"},
{"area":"bug","type":"bug","severity":"minor","finding":"PT.abandon after reaching Act III with 2 bosses killed paid 0 shards and returned an empty summary.","evidence":"Run 2 abandon + sanctum shards unchanged at 11","recommendation":"Confirm intended; consider partial shard payout"},
{"area":"ui","type":"issue","severity":"minor","finding":"Relic Glass Sigil silently dropped max HP 154->92 when picked as the default card.","evidence":"Run 2 state after Act II/III","recommendation":"State the drawback in the relic card"},
{"area":"visuals","type":"issue","severity":"polish","finding":"Act III reads as a sunlit green meadow like Act I; only rain and lightning mark the stormy riverlands.","evidence":"aur-1.png, c3-full.png","recommendation":"Darker sky/lighting for Act III"}
]
```
