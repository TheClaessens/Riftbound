# Rejections: what they meant and how to triage them

A real case history. Riftbound, later renamed "Scions of the Prism Crown", is an isometric Three.js
survivors-like with raid bosses, submitted for Basic Launch in October 2026. It was rejected four times.

| # | What we changed before submitting | Result | What it actually was |
|---|---|---|---|
| 1 | SDK integrated; game opened on a title screen | Rejected within ~5 s: "The overall quality of the game does not yet meet the expectations of our platform" | The automatic "First gameplay start" row was **No**: nobody had started a run in the preview, so `gameplayStart` never fired. A 4 s init timeout bug could also drop the SDK for the whole session. |
| 2 | Same build | Same instant rejection | Same. |
| 3 | Skip the menu (straight into a run); renamed (the old name was a Riot Games trademark) | Same instant rejection, though the gameplay row now read Yes | The uncached preview took **~30 s** to reach gameplay, against a ≤ 20 s requirement. Cause: ~170 files, ~150 of them ES modules fetched as an import waterfall from a cold CDN. |
| 4 | One-file bundle, early SDK init, minified three, inlined CSS: about 1 s locally, 10 requests | Rejected, with a real reason this time: "the concept is quite close to existing titles, and we're currently prioritizing differentiated experiences" | The pitch. Survivors-likes are saturated on the portal. |

## Lessons
1. **The generic quality message hides automatic failures.** A rejection in seconds means no human
   played it. Check the automatic rows (download size, first gameplay start) and the load time before
   you touch anything else.
2. **Read the preview console.** Log every SDK call (`[platform] gameplayStart`) and the boot phases
   (`[platform] boot: code · sdk · built · first frame`). Ask whoever previews it for those lines.
3. **Measure uncached.** A warm cache or localhost hides a file-count problem completely. Bundle before
   the first submission, not after the third.
4. **Name check before anything else.** Search the stores, books, board and card games, and trademarks. A
   colliding name is a reason to reject on its own, and the fix ripples into assets.
5. **Concept check before any integration work.** The final, human verdict was about positioning,
   not quality. In the first 10 seconds of gameplay, in the cover and in the trailer, show the thing
   no other game on the portal has. If you can't name that thing, polish won't save the submission.
6. Don't brute-force resubmissions. After two instant rejections, write to Developer Support
   (https://developer.crazygames.com/support) with the preview link and the console lines. Their FAQ
   says rejected games can be resubmitted after "meaningful improvements".

## Triage tree
- **Rejected in seconds**: look for an automatic failure.
  - Is any automatic panel row red?
  - Does the console show `gameplayStart`?
  - Is the cold load under 20 s?
  - Is the name free?
  - Is the environment `crazygames` (not `disabled`)?
- **Rejected after a while with the generic message**: it's a quality judgement.
  - Onboarding
  - Legibility at 800×450
  - Performance
  - Clutter
  - Esc usage
  - Contact support for specifics.
- **Rejected with "close to existing titles"**: it's positioning. Rework the pitch (what's new, shown
  first), publish elsewhere (itch.io, Newgrounds, GameDistribution, Y8), or move on.
