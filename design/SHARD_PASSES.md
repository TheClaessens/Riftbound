# Riftbound v6 — "The Crownshard" design passes

Input: the user's own playtest (2026-10-09). The risk/reward of the obelisks is the part they enjoy. **Reading the cards and then channelling an obelisk mid-fight is often impossible.** Their proposal: one entity in the map centre, the player spawns near it, it opens on a timer, a button press opens a paused choice screen with the three options + their risk/reward, and you can pick or skip (come back later / let the clock run out). Follow-up decisions by the user: **composable pact** (Echo + Wrath heat + Haste combine, as before) and **committing costs a Rift Pull**; "should it even be an obelisk? make it mightier, fit the world."

Contract for implementers: [SHARD.md](SHARD.md). The v5 obelisk spec it replaces: [RAID_PASSES.md](RAID_PASSES.md) Pass 1.

---

## Pass 0 — Audit of the v5 obelisks

| Area | Verdict | Why |
|---|---|---|
| Stakes (Haste / Echo / Wrath, payouts) | **Keep** | The bet itself is the fun part (user, playtest rounds 2–3). Numbers are tuned and sim-backed. |
| Finding them | Fail | Three pillars 20–32 u away in random bearings, re-rolled every act. You search instead of play. |
| Reading them | Fail | The approach card appears at ≤ 10 u, *while the horde is on you*. Dense text, small, moving camera. |
| Choosing | Fail | The decision is a 4 s channel under a Rift Pull: you commit before you could read, and you can't compare the three side by side. |
| Identity | Weak | "Obelisk" is a marker stone. Nothing in the fantasy says why a stone summons a boss or why there are three. |

Diagnosis: **the decision happens at the worst moment, in the worst place, with the least information.** Keep the bet; move the decision to a calm, paused, side-by-side screen; move the *risk* to getting there and to what the Rift sends after you commit.

---

## Pass 1 — Identity: not an obelisk, a Crownshard

**Critique.** An obelisk is a signpost. One central entity has to carry the act: it has to be the thing the boss is coming for.

**Decisions.**
1. **The Crownshard.** The fantasy already has the answer: Vael's mages shattered the **Riftcrown**, and the dragons "came to drink its light". Each land holds one great **shard of the Riftcrown**, driven into the earth at the land's heart. *The act boss is drawn to its light*: that is why it comes at 3:00. The timer is now diegetic.
2. **The Vael Circle.** The shard stands inside the broken binding circle the mages built to hold it: a cracked stone ring, three **binding-stones** (one per pact: Haste / Echo / Wrath) and chains from the stones to the shard. The paths of the land run into it (the centre already has a 7 u prop clearing and the forest and riverland paths cross it).
3. **Pacts, not obelisks.** You **commune** with the shard and **seal pacts** with the Rift: the Pact of Haste ("call the boss now"), of Echo ("it comes twice"), of Wrath ("feed it Heat"). Sealed pacts light their binding-stone and its chain.
4. **Why time stops.** The shard is a piece of the thing that tore the world. Touching it pulls you half into the Rift: the world drains of colour and freezes mid-stride. The pause is in the fiction, not a menu.
5. **Mightier.** One set piece instead of three props: a floating prism tine ~9 u tall over a lit crater, a light column you can see across the map, a slow rotation, prism refractions. Same silhouette every act (learnable); the circle's stone takes the biome (mossy forest granite, sandstone, drowned marble).

**Cut.** Per-act unique shard shapes (one silhouette, learnable). A lore codex entry (later). Boss emerging from the shard on the 3:00 path (keeps the arena centred on the player, the balanced default).

---

## Pass 2 — Run structure: where, when, how

**Decisions.**
1. **Place.** The shard is at the world origin (0, 0). Collision r 1.6. The player starts every act at (4.5, 0, 4.5) (≈ 6.4 u, camera side), so the shard is on screen from second 0. Acts II–III: the Rift Shift moves you there while the screen is white (the "you fall through the Rift" beat).
2. **Dormant 0:00–0:50.** Visible, chained, half-sunk, dim. Near it the prompt reads "Wakes at 0:50".
3. **Wakes at 0:50** (`SHARD_WAKE_AT = 50`, same beat as the obelisks): chains strain, the shard tears free and lifts, the column lights. Announce "THE CROWNSHARD WAKES". HUD edge marker while off screen.
4. **Commune = press F within r 4.5** of the centre, while the horde phase runs, not dashing. No channel. Opens the Pact screen; the game is paused (`state = 'pact'`).
5. **The Pact screen** (Pass 3). Leaving it never costs anything if you sealed nothing.
6. **Open until the boss.** You can come back as often as you like until the encounter starts. Sealed pacts are oaths: they stay sealed (no un-arming).
7. **Encounter start** (timer or Haste): the shard **ascends** into its light column and is gone for the rest of the act (its body would otherwise sit inside a boss arena). Next act: a new shard, dormant.

**Overrules** RAID_PASSES Pass 1 §2 (three obelisks, placement), §3 (channel), §5 ("collapse" → "ascend").

---

## Pass 3 — The Pact screen

**Decisions.**
1. **Layout.** Title "The Crownshard", sub "<Boss name> is drawn to its light · <m:ss> until it arrives". Three pact columns side by side, same anatomy: sigil, name, one-line effect, **Risk** list, **Reward** list (the v5 `preview()` lines, already plain-language after round 3).
2. **Echo**: a toggle. **Wrath**: a 0–3 stepper; each step shows the pre-rolled affix it adds (all three affixes are visible up front). Already-sealed levels are shown locked. **Haste**: not a toggle but the primary action, "Call it now".
3. **Three verbs + skip** (the user's "select one, or skip"):
   * **Call it now** (Haste): seals whatever is drafted *and* summons the boss in 3 s.
   * **Seal the pact**: seals the draft; the boss still comes at 3:00. Disabled when nothing new is drafted.
   * **Walk away** (Esc): nothing changes.
4. **Cost line under the buttons**: what sealing triggers now ("The horde answers: ~N foes converge on the shard").
5. **Keys**: 1 toggles Echo, 2 / 3 raise / lower Wrath, Enter seals, H calls (Haste), Esc walks away. Mouse for everything.
6. **Low HP** (< 40%): Haste carries the "Low HP: the boss arrives now" warning (v5.2).

**Cut.** Multi-page explanations, an "are you sure" confirm (the screen *is* the confirmation), un-sealing.

---

## Pass 4 — The cost of committing: the Horde Answers

**Critique.** A free paused choice removes v5's "choosing risk is itself risky". The risk has to come back without making reading costly.

**Decisions.**
1. **Rift Answer.** Sealing at least one *new* stake level (Echo = 1 level, each Wrath step = 1 level) makes the Rift answer when the game resumes: after a 0.8 s flare, **6 foes per new level** spawn in clusters 11–15 u around the shard (act roster, current scaling), and for **4 s per new level** normal horde spawns converge on the shard (the v5 Rift Pull, `pullCenter()`).
   * v5 equivalent: Echo + Wrath 3 = 16 s of channelling under a Rift Pull. v6: 4 levels = 24 foes + 16 s of pull, but you choose where you stand when it lands.
2. **Haste** triggers no Answer: the boss arrives in 3 s and the encounter reaps the horde anyway.
3. **Walk away** and an empty seal trigger nothing.
4. Opening the screen gives no protection: you resume exactly where you were (no i-frames). Opening needs the shard in range, so it can't be used as a panic pause.

---

## Pass 5 — Stakes and payouts

Unchanged from v5.2 (DESIGN.md §3b table): Haste (Windfall, Bounty, chest +1), Echo (Strain, Rift Mend, Echo Chest, shards), Wrath 1–3 (affixes, HP/dmg, perks, shards), the 60% shard cap, the Act III perk → shards rule. Costs still attach to the encounter, never to the clock. Sealing at 2:59 still counts, and still triggers the Answer (the boss reaps it a second later; the late seal is a known, harmless edge).

**Cut.** New pact types (Tithe, Siege …; still cut).

---

## Pass 6 — Feel: visuals, audio, HUD

1. **Shard model** (`src/game/shard/model.js`): see SHARD.md §3. States: dormant, waking, open, communing, calling (Haste 3 s), ascending, gone. Sealed pacts light their binding-stone + chain; while the Pact screen is open the *draft* glows faintly on the stones (you see your choice in the world behind the panel).
2. **Commune**: the grade drains (saturation ≈ 0.35, cool violet tint, stronger vignette) over 0.35 s; restored on close. The shard keeps turning while the world is frozen.
3. **Audio**: wake (stone + chains snapping + rising tone), commune (time-stop whoosh, low drone while open, music ducked), seal (per pact: Haste glass chime, Echo double toll, Wrath ember roar), the Answer (horn / war-cry swell), ascend (rushing upward tone).
4. **HUD**: no approach card. An edge marker (shard icon) while off screen; a world-anchored prompt above the shard in range ("F · Commune" / "Wakes in 0:12"); sealed pacts as chips under the act plate (from `run.stakes`); timeline beat "Shard wakes" at 0:50.

---

## Pass 7 — Bots, sims, tutorial, scope lock

1. **Sim lanes** keep their syntax: `runSim({ obelisks: ['haste@90', 'echo', 'wrath:2'] })`. The bot walks to the shard after 0:50 and calls `sealPact()` directly (no UI).
2. **Tutorial**: one tip at wake: "Press **F** at the Crownshard to strike a pact. Time stops while you choose."
3. **Balance check**: A/B against v5.2 (backup `riftbound-v5.2-preshard.zip`) on the default lane (no stakes) and on `echo` + `wrath:2`, n ≥ 8. The default lane must be unchanged (the shard is the only new obstacle; the start position moved ≈ 6 u).
4. **Scope lock**: everything above. Cut: per-act shard shapes, timer-path arena at the shard, codex entry, gamepad prompt.
