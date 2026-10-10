---
name: crazygames-release
description: Prepare and submit a browser game (JavaScript / ES modules / Three.js / canvas / WebGL, no-build or bundled) to the CrazyGames web portal. Covers the pitch and name check, the CrazyGames SDK v3 integration (init, loading and gameplay events, auto-start, ads, mute, data module), packaging for a fast cold load (one-file bundle, vendored deps, inlined CSS, boot loading screen), local verification, the store assets (covers and silent preview videos), the submission checklist and how to triage rejections. Use it whenever the user wants to publish, release, port or submit a web game to CrazyGames (or a similar curated portal such as Poki or GameDistribution), integrate a portal SDK, asks why a portal rejected their game, or wants to "make the game ready for CrazyGames", even if they don't say "skill".
---

# CrazyGames release

A full path from "I'd like this on CrazyGames" to a submission that clears the automatic checks. It
was distilled from a real release that was rejected four times: twice by an automatic check, once by
a 30 s cold load, and once by the concept. Most of that pain can be avoided by doing the steps
**in this order**: the cheap, decisive checks first, the engineering second.

## What's in `kit/`
| File | Role |
|---|---|
| `platform.js` | Platform layer to copy into `src/`, imported only by the entry module. <br>• SDK init, capped at 4 s; a late init still attaches. <br>• Guarded and logged calls, so the console shows `[platform] gameplayStart`. <br>• Gameplay start/stop polled per frame and coalesced to the SDK's 1 s throttle. <br>• `autoStart`, `hideLoading()`, boot-phase timings. <br>• Full Launch helpers, untested: `requestAd`, `onSettings` (muteAudio), `storage` (data module). |
| `package-portal.ps1` | Zero-dependency packager (PowerShell 5.1+). <br>• Builds one `bundle.js` from the entry module's graph plus import-mapped packages; each module runs as a blob ES module, with a fallback to the plain files. <br>• Prefers `.min.js` builds, inlines CSS and copies the files its `url()`s reference. <br>• Injects the SDK, init at the top of `<body>`, the platform flag and a boot loading screen. <br>• Zips with forward slashes and warns about other hosts. |
| `verify-mp4.js` | Checks a rendered MP4 without `<video>` (it never decodes in a hidden pane): duration, size, tracks (silent?), decoded frames as a check grid, and frame 0 for the cover. |

References: `references/requirements.md` (the rules, the SDK cheat sheet, asset specs, sources),
`references/rejections.md` (the case history and a triage tree), `references/store-assets.md`,
`references/full-launch.md`.

## Workflow

### 0. Pitch gate (before any code)
The final rejection said "the concept is quite close to existing titles, and we're currently
prioritizing differentiated experiences". It came after days of integration work. So check first:
- Search CrazyGames for the genre. If it is crowded (survivors-likes, idle clickers, .io clones),
  name the one thing your game does that those don't.
- Make sure the first 10 seconds of gameplay, the cover and the trailer show **that** thing, not the
  genre baseline.
- If you can't name it, tell the user honestly. Suggest other outlets (itch.io, Newgrounds,
  GameDistribution, Y8) or a design pass before spending effort on the portal.

### 1. Name check
Search the name across Steam, itch.io, CrazyGames, Poki, the app stores, books, board and card games,
and trademarks. A subagent works well for this: Sonnet, about 15 candidates, a table with a verdict
per name. Our first name turned out to be a major publisher's card game. Keep the name in one module
(`brand.js`: name, wordmark lines, the word used for heroes), so a rename costs one edit plus an
asset re-render. Never rename save keys.

### 2. Audit
Run two parallel subagents (Sonnet):
1. **Requirements researcher.** Re-check `references/requirements.md` against the live docs.
2. **Codebase auditor.** Find, with file:line:
   - entry and loop
   - the state machine (where a run starts, pauses and ends; where the natural breaks are)
   - audio (master gain, mute, whether it's persisted)
   - persistence (keys, sync loading)
   - loading
   - external links and CDN requests
   - input (scroll keys, Esc)
   - test harnesses that construct the game and must keep working

Then give the user an effort estimate split by Basic and Full Launch.

### 3. Prepare the game
- **Vendor every CDN dependency** (three.js core plus only the addons you import, crawling their
  imports; fonts as latin and latin-ext woff2). Point the import map at relative paths. The packager
  refuses CDN targets.
- **Add `kit/platform.js`** and wire it into the entry module (the sketch is at the top of the file).
  - `isGameplay` counts only runs a person started, not sims or bots. It excludes pause, menus and end screens.
  - Hide links that leave the game with `data-external` plus
    `html[data-platform="crazygames"] [data-external] { display: none }`.
- **Auto-start on the portal.** Load straight into a run, using the title screen's own default choice.
  The menu stays one click away from the end screen. This makes the automatic "First gameplay start"
  check pass by itself and meets the Full Launch "≤ 1 click to gameplay" rule.
- **Input.** `preventDefault` on arrows, Space and the wheel. Offer a pause key other than Esc.

### 4. Package and verify locally
- **Copy the packager** to `tools/` and run
  `powershell -ExecutionPolicy Bypass -File tools/package-portal.ps1 -Name <slug> -Version <v> -FlagVar <your flag var> -Title … -Mark … -Sub …`.
  - Add `-Assets` for files loaded at runtime that the crawler can't see.
  - Give each upload its own version label, e.g. 6.2.
- **Serve `dist/crazygames/` on localhost.** Add a launch config with a static server that has a root option. The SDK runs in its
  `local` environment there. Check:
  - **Boot.** The loading screen fades into a run with no click. The console shows SDK ready, then
    `loadingStart`, `loadingStop`, `gameplayStart`, then `[platform] boot: … first frame N ms`.
  - **Requests.** About 10: page, bundle, SDK and fonts. Not 150 or more.
  - **Slow-SDK test.** Make a copy of the page with a fake SDK whose `init` takes 6 s. The game must
    boot after the cap and still send `gameplayStart` once init lands.
  - **Fallback test.** Make a copy with `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' https://sdk.crazygames.com">`.
    The loader must warn, load the plain files and still boot.
  - **The web build.** No SDK, links visible, unchanged.
- **Hidden browser pane.** `requestAnimationFrame` doesn't run there. Take a screenshot to pump frames,
  or call `platform.update()` by hand in tests.

### 5. Store assets
See `references/store-assets.md`. Produce three covers and two 18 s silent previews from the real game
with the `game-promo-video` kit. The landscape cover is frame 0 of the landscape video. Check each
render with `kit/verify-mp4.js`.

### 6. Submit
1. Upload the zip and open the preview **uncached** (private window or Ctrl+Shift+R) with the console
   open.
2. Confirm the `[platform]` lines:
   - environment `crazygames`
   - `gameplayStart` fires
   - first frame well under 20 s
3. Confirm every automatic panel row is green.
4. Fill in the listing:
   - **Description:** genre hook first, then setting, then systems, then a feature list with numbers the
     game really has.
   - **Controls:** one line per input.
   - **Orientation and devices:** declare desktop-only if there's no touch support.

### 7. When it's rejected
Use the triage tree in `references/rejections.md`. In short:
- **Seconds:** an automatic failure. Check the panel rows, `gameplayStart`, the cold load and the name.
- **The generic quality text after a while:** quality. Ask support.
- **"Close to existing titles":** positioning (see step 0).

Don't burn resubmissions on guesses. After two unexplained rejections, write to Developer Support with
the preview link and the console lines.

### 8. Full Launch
After the soft launch: ad freeze and mute, `muteAudio`, the data module, midgame and rewarded ads, Esc.
See `references/full-launch.md`.

## Gotchas
- **`SDK.init()` in `<head>`** throws `null.appendChild` (it needs `document.body`) and never resolves.
  Start it at the top of `<body>`.
- **`gameplayStart`/`gameplayStop` less than 1 s apart** are dropped silently, which desyncs the
  portal on a quick pause and unpause. Coalesce them.
- **A hard init timeout must not discard a late SDK.** Keep the init promise and attach when it lands.
- **SDK methods can't be monkey-patched for spying.** Swap `platform.sdk` for a stub, or read the
  SDK's own `local` console logs.
- **`localStorage` keys are not imported** by the data module. In local mode it may share
  `localStorage`, which can break test harnesses that sandbox keys. Use the data module only when
  `environment === 'crazygames'`.
- **PowerShell 5.1 pitfalls:**
  - `Get-Content` reads UTF-8 files as ANSI unless told otherwise: use `[IO.File]::ReadAllText(path, UTF8)`.
  - `Compress-Archive` writes backslash zip entries.
  - `"$var:"` inside strings needs `${var}`.
  - `Select-Object -First 1` on a child script reports exit code 255.
- **Don't trust a warm cache.** One cold-CDN load of a 170-file module graph took 30 s, while
  localhost took 1 s.
