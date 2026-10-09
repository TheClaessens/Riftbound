# Ilse — comfort & readability · playtest round 2 (v5 raid bosses + Rift Obelisks)
**Verdict (in character).** The raid fights are the best-looking thing in the game. The ground telegraphs (lanes, cones, rings, beams) are big, red and honest, and I could find my hero most of the time. But the *rest* of the language is muddy. Gold means five different things, red means six, several moments stack three banners on top of each other in the middle of the screen, and the boss itself keeps disappearing (behind trees, inside a frost blob, inside bloom). A colour-blind player loses the fill of every telegraph and the Act III horde melts into the grass. Fun: 8/10 · Would play again tomorrow: yes · Domain score (readability): 6.5/10

## Session log
| Run | Class / tier | Result (act, time, level) | Build in one line | Shards | Note |
|---|---|---|---|---|---|
| 1 | Cryomancer / T0 (primer on) | Act I won, Gorrak killed (fight 185 s); **[jumped]** to Act II boss, died to Vashkar at 8% (9:36, lv 18) | Ice Shard, Blizzard, Frost Nova, Chain Lightning, Static Field; Superconduct spam | 110 | Gorrak played naturally; Vashkar jumped |
| 2 | Pyromancer / T0, assist 0.5 | **[jumped][assisted]** Aurelith, died to a beam at 67% (1:55) | Cinder Bolt, Meteor, Spirit Orbs, Thunderhead fusion | 0 | Ward Fire made most of my damage useless |
| 3 | Stormcaller / T0, assist 0.1 | **[jumped][assisted]** Aurelith killed, all 3 phases and both intermissions seen (3:15) | Storm Halo, Tempest, Meteor, Frost Nova | n/a | Full Floodfall and phase 3 beams |
| 4 | Stormcaller / T0, assist 0.3 | **[jumped]** Act III horde at 1:03, abandoned | peak-density check | n/a | Obelisks rising in the horde |
| 5 | Stormcaller / T0, assist 0.1 | **[jumped]** Vashkar to Intermission I, abandoned | colour-blind filter check | n/a | |
| 6 | Cryomancer / T0, assist 0.3 | Act I to 1:17, abandoned | obelisk approach card, channel | n/a | |

Screenshots are in `playtest/out/ilse-r2-*.png`. I also took HUD-inclusive screenshots through the browser pane, which are not saved to disk (see Harness caveats).

## Highlights (what worked — keep these)
- **Ground telegraph shapes are excellent.** Gorrak's Timberfall is a long red lane with a hard outline [seen] (`r2-gorrak-c1`). His Backhand is a crisp red wedge, so "stand behind him" is obvious [seen] (`r2-gorrak-f2`). Vashkar's Ashfall is a red cross of lanes [seen] (`r2-vash-c6`). Aurelith's beams are thick, saturated and glowing, with an X-shaped sweep in phase 3 [seen] (`r2-aur-g1`, `r2-aur-d5`).
- **The arena wall reads instantly.** There is a thorn-vine line with a glowing edge for Gorrak, a lava-rock ring with an orange edge for Vashkar, and a crystal wall with a cyan shimmer for Aurelith [seen] (`r2-gorrak-arrival`, `r2-vash-arrival`, `r2-aur-arrival`). The Molten Tide (lava ring closing in) and Floodfall (cyan swirling water around an island) are unmistakable. Water and lava are the clearest "this ground is gone" signals in the game [seen] (`r2-vash-f6`, `r2-aur-im2-3`).
- **Obelisks are visible from far away.** There is a tall light beam, a gold ring and an off-screen pointer with a distance ("Haste 17m") [seen] (`r2-obelisks-rise`, `r2-a3-wrath-near`).
- **The obelisk approach card is clear.** It has a title, a "≈ −2 LEVELS" chip and COST and PAY blocks with +/− icons. "Hold the ring to channel" is the last line, and a "CHANNELLING 33%" readout follows [seen/read].
- **The boss frame is compact and tidy when it is on its own.** Name, three phase pips, HP bar with phase ticks, STAGGER bar with a break-check marker, a cast bar that says "BREAK IT — STAGGER 60" with a countdown, and EXPOSED, DOWNED, SEALED and ENRAGED chips [seen] (HUD shots). The Axe Heat gauge sits neatly in the frame on Vashkar.
- **Banners do teach.** Tips such as "Every attack is telegraphed in red. Step out, or dash through it." and the death-screen line "next time Vashkar charges along a red line and leaves burning ground" are exactly right [read].
- **Boss colour tells work.** Aurelith's body and the pillar crystals recolour with the Prism Ward element (frost, fire, storm, arcane), which is a good non-text cue [seen] (`r2-aur-a6`, `r2-aur-g6`).

## Pain points (ranked, worst first)
1. **Centre-screen banners stack into unreadable mush at the worst moments.**
   - Gorrak intermission 2: "INTERMISSION", "BROKEN! WAR HORN" and the "WAR HORN 6.6" cast bar are superimposed and read "INBROKENSION" [seen].
   - Vashkar phase change: the "Vashkar / The Ashen Warchief" title card sits on "MOLTEN OVERSWING BROKEN!" [seen].
   - Aurelith intermissions: "Aurelith", "BROKEN!", "INTERMISSION", "PRISM NOVA" and "It cannot be harmed. Survive." all share about 150 px of height [seen].
   - Victory: "Gorrak, The Troll King Falls", "BOSS SLAIN" and a ghosted "WAR HORN FAILED" overlap [seen].
   - Break-check verdicts ("BROKEN!", "FAILED") also stay up long after the check, and one appeared in the same frame as a fresh War Horn cast bar, which contradicts it [seen].
   - Impact: the intermission instruction ("It cannot be harmed. Survive.") is the one line a first-timer needs, and it is the line that gets buried. Severity: **major**. Caveat: the driver freezes rAF, so fade-outs may be slower than live. The simultaneous *spawn* of 3–4 elements in the same spot is real regardless.
2. **The colour language is overloaded: gold and red each mean several things.**
   - Gold is meant to mean "go here". It is also used for:
     - storm Rift Crystal rings (yellow dashed circles, same look as the gold go-here ring) [seen] (`r2-aur-e5`, `r2-aur-im2-1`);
     - un-ripe spore pods (gold-white eggs with a gold ring, which must be *killed*, not stood on) [seen] (`r2-gorrak-warhorn-p2`);
     - the Stormcaller's own player ring [seen] (`r2-aur-im1`);
     - the large gold ring on the boss during Prism Nova [seen] (`r2-aur-novastart`);
     - obelisk rings and conduit rings.
   - Red is meant to mean danger. It is also the Pyromancer's player ring (pale red under a red beam, `r2-aur-d6`), the Act III horde (red orcs, red mage-towers), pink-red enemy projectiles, the low-HP vignette, a full-screen red wash on King's Wrath hits (`r2-gorrak-kw2`) and the ENRAGED tint.
   - Teal is used for banner base rings, and Vashkar's banner links are cyan-teal lines. The Cryomancer's player ring is the same cyan, as are frost crystal rings [seen] (`r2-vash-b2`).
   - The actual safe zones are the weakest-coloured thing on screen. Aurelith's pillar shelters and Skyward wedges are khaki-olive strips with white dashes. They read as "path" or "dirt", not "gold, go here" [seen] (`r2-aur-a2`, `r2-aur-novastart`). Severity: **major**.
3. **Intermission I of Aurelith (Skyward) does not say which wedges are safe.** Alternate wedges are tinted olive-gold and the others are plain grass, and a red beam sweeps through an olive wedge [seen] (`r2-aur-im1`). The HUD strip only says "It cannot be harmed. Survive." A newcomer cannot tell whether the tinted wedge is the refuge or the hazard. Severity: **major** (for readability; I did not die here).
4. **The boss itself is often hard to see.**
   - Gorrak sits behind a foliage canopy for whole phases, with no silhouette or outline [seen] (`r2-gorrak-warhorn`, `r2-gorrak-seq5`, `r2-gorrak-e2`).
   - A frozen or Frost Nova'd boss is a featureless white blob, so Downed (DOWNED chip only) looks the same as Frozen [seen] (`r2-gorrak-d4`, `r2-vash-b2`, `r2-vash-d*`).
   - Aurelith is a blown-out white bloom when she is hit with stagger or Exposed effects [seen] (`r2-aur-arrival`, `r2-aur-e11`).
   - Storm clouds (Thunderhead) swallow the hero [seen] (`r2-aur-a6`, `r2-aur-b3`).
   - After a boss is frozen, a *leftover* white frost-ghost stays where he stood. I could not tell it from the boss [seen] (`r2-gorrak-f3`).
   Severity: **major**.
5. **Boss frame and banners cover the top of the arena.** The frame plus cast bar plus intermission strip take the top ~25% of the screen. Because the camera follows the player, the boss often stands right there, behind the frame (Gorrak at arrival, Aurelith up-screen during Prism Nova) [seen]. During the phase change the frame disappears and a title card takes over. Severity: **minor** to **major**.
6. **Colour-blind loss is significant.** I rendered the live game through deuteranopia and protanopia matrices (CSS filter on the page) [seen].
   - Telegraph *fills* become olive-tan. Only the thin outline survives (circles on grass look like faint yellow lines).
   - Vashkar's Ashfall lanes on sand become barely darker tan strips with a hairline edge.
   - The red Act III horde (the majority of the screen) melts into the grass, and only the pink projectiles (white core) keep contrast.
   - The shapes still carry (circle, lane, cone, X), so the game is playable, but the colour is doing nearly all of the "danger vs safe" work. Severity: **major** for CVD players.
7. **Flash and wash intensity.** A full-screen salmon-red wash hits when King's Wrath lands (about 8 s of heavy red), and a low-HP red vignette stays on the screen edges. The hero also flashes white on hit and becomes hard to see in that frame [seen] (`r2-gorrak-kw2`, `r2-gorrak-f*`, low-HP HUD shot). Severity: **minor/comfort**. There is no sign of strobing, but a reduce-flashes option is warranted.
8. **Peak density in Act III (horde plus obelisks) is the hardest thing to read in the game.** At 1:03 Act III I count in a single frame: ~15 pink projectiles, three red ground circles, one red lane, a purple halo ring, a dark vortex, five shielded foes with yellow and blue bubbles, the "THE RIFT OFFERS" banner centred over the hero, a "PERFECT" popup, a codex toast and a chain counter [seen] (`r2-a3-wrath-near`). The hero is still findable (gold ring plus brighter robe), but only because the Stormcaller ring is bright. The obelisk banner is still on screen 13–25 s after the obelisks rise (rAF caveat). Severity: **minor**, because the density is "earned" and the hero ring holds.
9. **Small text.** Computed HUD text sizes at 1280×720: 10 px (obelisk card "SUMMON NOW", "CHANNELLING"), 11 px (lv, space), 12 px (the "≈ −2 LEVELS" chip), 13 px (tips, off-screen "Wrath 34m"), 14 px (chain, reactions, strip title). The 10–12 px items are the ones that carry the obelisk trade. Severity: **minor**.

## Bugs & oddities
- **Stagger resets on Break Check start.** Gorrak's stagger bar reached 87–94% and then dropped to 0–8% the instant War Horn started (3:22→3:23 and 3:53→3:55), so a nearly full bar is wasted when the cast begins. Players will think the bar was reset by a bug [data].
- **Verdict text is stale.** "BROKEN! WAR HORN" or "FAILED WAR HORN" is displayed ~9–40 s after the check (Gorrak 5:23, 6:08, victory screen at 6:19; Vashkar at 0:44→1:06 in run 5) [seen]. At 6:08 it showed "BROKEN!" in the same frame a new War Horn bar read 5.0.
- **Unnamed damage.** Aurelith's beams and Nova show up in `dmgBy` as plain "Aurelith: hit" (20 and 27 damage), whereas Gorrak and Vashkar names are specific ("backhand", "banner charge", "lava trail", "cinder mark", "kings wrath"). The death screen says "Slain by Aurelith — contact" for a beam hit, and "Vashkar — contact" when the last hit was a banner charge [data].
- **War banners.** The red rings pulse on Vashkar's banners during the Overswing check (`r2-vash-b4`) with no label, so I could not tell whether that is "shielded", "about to ripen" or "targeted" [seen].
- **Prism Ward on the boss.** With Ward Fire up, my Pyromancer did ~0 to Aurelith for 10 s at a time (94% for 10 s, `r2-aur-a5`–`a8`). The boss frame has a round emblem at the far left with an "×" and a number (8 or 10), and I could not decode it [seen/inferred].
- **The channel verb loses the walk.** `PT.channel()` stopped steering after any level-up decision, so the hands wandered around a horde for 20 s without reaching an obelisk (distance 20–40 m the whole time) [data]. It needs re-issuing after each decision. I suspect a harness quirk, not a game bug.
- Stale DOM text: `PT.ui()` still lists old banner strings ("INTERMISSION · II · MOLTEN TIDE", "Gorrak, The Troll King Falls", "VICTORY FELLED IN 3:15", "Primer complete") long after they should be gone, in later acts and runs [read]. This may be the frozen-rAF artifact.
- The first Gorrak fight took 185 s for a Cryomancer with assist 1 (target 60–75 s). Not my domain, but the fight felt long with the same shape of cast repeating (War Horn three times) [data].

## Recommendations (max 6, most impactful first)
| # | Change | Why (which pain point) | Expected effect | Effort |
|---|---|---|---|---|
| 1 | **One banner lane with a priority queue.** Put the phase title in one place, the intermission instruction under the boss frame, and break-check verdicts as a 1.5 s flash *inside the cast bar* instead of centre-screen. Hard-dismiss each banner when a higher-priority one arrives, and remove the lingering "THE RIFT OFFERS" banner after ~3 s. | 1, 5, 8 | No more superimposed text. The "Survive" instruction becomes readable. | M |
| 2 | **Reserve gold for "go here" and give it a pattern.** Make shelter zones and safe wedges saturated gold with animated chevrons or a sparkle pulse, and add a small icon (shield or foot) on the safe wedge during Skyward. Recolour storm crystal rings, spore pods and the Stormcaller player ring away from that exact gold (e.g. white-violet), and give each class ring a hue that is not red, gold or teal. | 2, 3 | Gold stops being ambiguous, and "which wedge is safe" is answered at a glance. | M |
| 3 | **Keep the boss visible.** Fade foliage and rocks that overlap the boss (the existing dither effect does this for the player), add an always-on thin rim or silhouette outline, reduce the white frost blob to a ring plus tint, and add a small ground ring or pip under the boss that persists through Frost, Frozen and DOWNED. | 4 | The boss never "disappears" behind a tree or frost. | M |
| 4 | **Add a CVD-safe telegraph mode (and default some of it).** Add diagonal hatch or stripes in the telegraph fill, a thicker bright outline, and an animated marching-ants edge for the active danger. Offer a colour-blind palette toggle that swaps red and gold danger/safe for orange/blue or adds shapes (hazard icons in the middle of circles). Vary the Act III horde hues so the majority is not red-on-green. | 6 | Telegraphs survive a deuteranopia filter. | M |
| 5 | **Shrink the boss-frame footprint and add a reduce-flash option.** Collapse the cast bar into the frame, lower the opacity of the intermission strip during active mechanics, and cap the full-screen King's Wrath/hit wash at ~40% opacity (or add a setting). | 5, 7 | The top quarter of the arena is usable. The comfort risk goes down. | S |
| 6 | **Fix the Break Check stagger reset, name the beam and Nova hits, and bump the 10–12 px obelisk text to ≥13 px.** | Bugs, 9 | Fewer "why was my bar wasted" moments, clearer death screens, easier obelisk trade reading. | S |

## Domain deep-dive
**Can I always find my character?** Mostly yes.
- The hero has a bright ring and robe, the camera is centred on him, and the arena is open.
- I lost him four times [seen]:
  - inside a Thunderhead storm cloud (`r2-aur-b3`, `r2-aur-a6`);
  - at the arena edge, partly behind rock (Vashkar `r2-vash-a5`, `r2-vash-b4`). The dither effect helps, but the ring is the only thing that stays visible;
  - during the hit flash at King's Wrath (`r2-gorrak-kw2`), when the hero turns white and almost invisible against the wash;
  - the Pyromancer ring under a red beam (`r2-aur-d6`), because both are pink-red.
- The Cryomancer's cyan ring matches banner rings and frost crystal rings, so it competes with Vashkar's banners [seen].

**Can I find the boss?** Not reliably.
- Gorrak hid behind a tree canopy for most of the intermission and War Horn frames. Vashkar was fine on the sand but became a frost blob under cryo. Aurelith is bright bloom, but is easy to see in the open.
- The boss frame helps (name, HP, chips), but the frame also covers where the boss often stands.

**Telegraphs and safe zones.**
- Red telegraphs read clearly on every ground in colour: grass, sand, and the flooded island [seen]. Rectangles, wedges and circles are mutually distinguishable.
- Safe zones: Gorrak's sap pool is an amber disk (orange), which many players will read as "bad"; I could not tell whether it was a hazard or a go-here (amber disk with a lighter ring) [seen]. The Aurelith pillar shelters and Skyward wedges are olive and weak. The conduits have a clear gold ring and a connecting gold line, which is the one place where gold is strong and unambiguous.
- Aurelith's phase 2 Floodfall mixes two languages in one frame: red circles (hit zones) and purple hex-glyphs (an unexplained "lightning circle"), and the player has to guess which to avoid [seen] (`r2-aur-im2-1`). The tip text says "Mind the lightning circles" but the purple glyph is not named as such.

**Anything red that is not danger / gold that is not safe?** Yes, see pain point 2. Red: Pyromancer ring, red horde, pink projectiles (dangerous but not a "zone"), wash/vignette. Gold: storm crystals, unripe pods, Stormcaller ring, the gold ring over Aurelith at Prism Nova, banner and obelisk rings (go-here or not).

**HUD boss frame.**
- Cast bar: readable ("WAR HORN · BREAK IT — STAGGER 70 · 5.0"), with a marker on the stagger bar. The marker is a small diamond and is easy to miss, but the instruction text compensates.
- Stagger: the bar is readable. Value readouts as text (stagger 25% etc.) are only in the data layer, not the HUD.
- Phase pips: three small diamonds above the frame, with phase ticks on the HP bar, readable.
- Chips: EXPOSED, DOWNED, SEALED, ENRAGED are clear. The DOWNED chip is the only cue for the damage window when the boss is in a frost blob.
- Does it cover the arena? Yes, about the top 25% with the cast bar and intermission strip, and a title card replaces it during phase changes.

**Clutter at peak (Floodfall, Meteor Rain, King's Wrath).**
- Floodfall: busy but legible. A small island, ~10 red circles, ~6 purple hexes, the boss and the player in one frame, and the player at the edge. The island boundary is the clearest element [seen].
- King's Wrath: soft pink expanding ring, readable, but the screen-wide red wash and shake hit at the same time [seen]. I did not see anything called "Meteor Rain" in any of my boss fights (jumped fights end before it, or it is not visible to me under that name). My densest frame is the Act III horde, see pain point 8.
- Frame budget (the sim runs about 50 times real time without rendering, so this is not a real frame-time measurement): 20–35 s of Act III game time took about 0.4 s, and boss fights ran at the same rate [data]. I cannot say anything about real frame rate.

**Colour-blind reliance.** See pain point 6. The *shapes* carry the information, the *colours* carry the urgency, and the "which ground is safe" cue is the weakest part (khaki vs green, which is itself a red-green axis).

**Text sizes (`PT.ui()` + computed styles).** 10–18 px at 1280×720. The key HUD strings (boss name, cast bar title, countdown) are 14–18 px. The obelisk card header and chip are 10–12 px. Captions on the screen are not scaled with the viewport in the pane I used (800×600 screenshot of a 1280×720 canvas).

**Screen shake / flash.** No stroboscopic effects. The heavy items are the King's Wrath full-screen wash, the hit-flash hero blink, and the low-HP red vignette, and they stack at the worst moment (low HP plus King's Wrath). A reduce-flash/shake toggle is recommended.

**Obelisks (readability slice).**
- They rise with a beam and a gold ring, and the pointers show distance. The card says what you pay and what you get, in two bulleted blocks, and the Haste chip gives the net levels (the net estimate said "−2 LEVELS" but the cost line says "about −4 levels / about −3 levels" and the pay says "+2 / +1", so the three numbers are consistent only if you do the subtraction yourself).
- The three rings are all gold, and only the pointer icon and the card title tell Haste from Echo from Wrath when you are standing between them. Different ring accent colours would help, but must not collide with gold = go-here, so use pattern or icon rather than hue.

## Harness caveats
- The driver freezes `requestAnimationFrame`. Banner fade-outs, shard counters and some UI animations therefore do not run, and I believe at least part of the "banner still on screen 13–25 s later" and the stale text in `PT.ui()` is that artifact. The *overlaps* are real in the sense that the same screen region receives multiple banners within ~1 s of each other, but their duration may be shorter live.
- Shots from `PT.shot` are canvas-only (1280×720). My HUD observations come from browser-pane screenshots (800×600 scaling of the same viewport), so HUD text looks smaller than it is.
- The game ran at accelerated time, so I could not observe animation timing of telegraphs (how long a red lane shows before it hits). I only see what the frame shows at the sampled instants (every 1.5–3 s). I also cannot say whether a beam is a "warning" line or the damage line, because I only sampled it at the moment it was already solid.
- Bosses in runs 2–5 were **jumped** and fought with **assist** (0.1–0.5), so none of my difficulty impressions count. Gorrak was fought naturally (Cryomancer, assist 1 = normal damage, primer on). Vashkar in run 1 was jumped (full damage).
- Colour-blind views are an approximation (Machado matrices via a CSS filter), not a real CVD assessment. They are enough to see which cues survive.
- I did not see Gorrak's Club Slam, spore-pod explosion damage, or Meteor Rain as named. Cinder Memory marks appeared only in the damage log ("cinder mark" 16), not in a frame I looked at.
- Bot-hand behaviour with obelisks was unreliable for me (channel steering), so I never completed a channel. The channel progress readout ("CHANNELLING 33%") I did see.

## Findings (machine-readable)
```json
[
 { "area": "readability", "type": "issue", "severity": "major",
   "finding": "Boss banners (phase title, break-check verdict, intermission label, instruction line, obelisk announcement) spawn in the same centre-screen spot and overlap into unreadable text, including the 'It cannot be harmed. Survive.' instruction.",
   "evidence": "r2-gorrak HUD shot at 5:23 ('INBROKENSION'), Vashkar phase-change shot, Aurelith intermission 1 and 2 HUD shots, victory screenshot (BOSS SLAIN over FAILED WAR HORN)",
   "recommendation": "One prioritised banner lane; verdicts inside the cast bar; hard-dismiss lower-priority banners; time-limit the obelisk banner." },
 { "area": "readability", "type": "issue", "severity": "major",
   "finding": "Gold is used for 'go here' but also for storm crystal rings, unripe spore pods, the Stormcaller player ring, the Prism Nova boss ring and obelisk/conduit rings; red is danger but also the Pyromancer ring, the Act III horde, projectiles, hit wash and low-HP vignette; the real safe zones (pillar shelters, Skyward wedges) are weak olive-khaki.",
   "evidence": "r2-aur-novastart, r2-aur-im1, r2-aur-e5, r2-gorrak-warhorn-p2, r2-aur-d6",
   "recommendation": "Reserve a saturated, patterned gold for safe zones only; recolour crystals, pods and player rings; add icon/chevron animation on safe zones." },
 { "area": "bosses", "type": "issue", "severity": "major",
   "finding": "Aurelith's Skyward intermission shows olive-tinted wedges and a sweeping beam but never says which wedges are safe; a beam passes through a tinted wedge.",
   "evidence": "r2-aur-im1, HUD text 'It cannot be harmed. Survive.'",
   "recommendation": "Mark safe wedges with the safe-gold style plus a shield icon; name the rule in the strip ('Stand in the gold')." },
 { "area": "visuals", "type": "issue", "severity": "major",
   "finding": "The boss is often hard to find: Gorrak behind tree canopy, any frozen boss is a white blob (and an old frost ghost lingers where he stood), Aurelith is bloom, and Thunderhead clouds hide the hero.",
   "evidence": "r2-gorrak-warhorn, r2-gorrak-seq5, r2-gorrak-f3, r2-vash-b2, r2-aur-arrival, r2-aur-b3",
   "recommendation": "Dither foliage over the boss, add a permanent rim/silhouette or ground pip, shrink the frost blob to ring+tint, make storm clouds translucent over the hero." },
 { "area": "ui", "type": "issue", "severity": "minor",
   "finding": "Boss frame + cast bar + intermission strip occupy the top ~25% of the arena view where the boss often stands; a title card replaces the frame during phase changes.",
   "evidence": "Gorrak arrival HUD shot, Aurelith Prism Nova HUD shot",
   "recommendation": "Merge the cast bar into the frame, reduce opacity during mechanics, keep the frame visible through phase titles." },
 { "area": "readability", "type": "issue", "severity": "major",
   "finding": "Under deuteranopia/protanopia filters the telegraph fills vanish to thin outlines, the red Act III horde blends into the grass and Vashkar's red lanes on sand almost disappear; shapes remain readable but colour carries the urgency.",
   "evidence": "Deut/prot-filtered screenshots of the Act III horde at 1:03 and Vashkar Ashfall (intermission I)",
   "recommendation": "Hatch/stripe telegraph fills, thicker animated outlines, hazard glyphs, optional CVD palette; vary Act III horde hues." },
 { "area": "feel", "type": "issue", "severity": "minor",
   "finding": "King's Wrath (and low-HP) produce a full-screen salmon-red wash plus a white hero flash that stack at the worst moment.",
   "evidence": "r2-gorrak-kw2, low-HP HUD shot at Gorrak 6:08",
   "recommendation": "Cap wash opacity, add a reduce-flash/shake toggle." },
 { "area": "bug", "type": "bug", "severity": "minor",
   "finding": "Gorrak's stagger bar (87-94%) resets to 0 when a Break Check begins, and break-check verdict banners ('BROKEN!', 'FAILED') stay up long after, once alongside a fresh cast bar.",
   "evidence": "events 3:22->3:23 and 3:53->3:55; HUD shot at 6:08",
   "recommendation": "Keep or carry over stagger into the check, or show an explicit 'stagger reset' cue; clear verdicts on the next cast." },
 { "area": "bug", "type": "bug", "severity": "polish",
   "finding": "Aurelith's beam and Nova damage is logged and shown as generic 'hit/contact'; Vashkar's banner charge death shows as 'contact'.",
   "evidence": "dmgBy 'Aurelith: hit' 20 and 27; death screen 'Slain by Aurelith contact' and 'Vashkar contact'",
   "recommendation": "Name each move (beam sweep, prism nova, banner charge) in the death recap." },
 { "area": "ui", "type": "issue", "severity": "minor",
   "finding": "Obelisk card/channel text is 10-12 px; all three obelisk rings are the same gold so only the pointer icon and card title distinguish Haste/Echo/Wrath.",
   "evidence": "Computed font sizes (10 px 'Summon now', 'Channelling'); r2-obelisk-approach, r2-obelisks-rise",
   "recommendation": "Raise to >=13 px; differentiate obelisks by icon/pattern on the ring, not hue." },
 { "area": "visuals", "type": "praise", "severity": "polish",
   "finding": "Ground telegraphs (lanes, cones, rings, beams) and the arena boundaries (thorn wall, lava ring, flood water) are large, clear and well-shaped.",
   "evidence": "r2-gorrak-c1, r2-gorrak-f2, r2-vash-c6, r2-aur-g1, r2-vash-f6, r2-aur-im2-3",
   "recommendation": "Keep as the template for any new mechanic." }
]
```
