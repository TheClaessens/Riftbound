# CrazyGames requirements digest

Checked against docs.crazygames.com in October 2026. Re-check before relying on any number: the
portal changes its rules. The Developer Portal's own checklist is the final word.

## Launch stages
- **Basic Launch**: a soft launch to a small share of players. The SDK is optional; if you integrate
  it, `gameplayStart` is required. Ads are disabled and QA is basic. It ends after ≥ 7 days and
  500 plays, or automatically after 21 days.
- **Full Launch**: the SDK is mandatory and you get ads and revenue share. There is a second QA review.
  - Requires `gameplayStart`/`gameplayStop`.
  - Requires the `data` module if the game saves progress, and the `user` module "if applicable".
  - HTML5 games must honour `settings.muteAudio`.
  - The player must reach gameplay in at most one click.
- Sources: https://docs.crazygames.com/requirements/intro/ and https://docs.crazygames.com/requirements/technical/

## The Basic Launch checklist (portal panel)
Some rows are automatic and some are self-declared:
- Initial download < 50 MB (automatic)
- First gameplay start (automatic, measured during *your* preview)
- First gameplay start implemented correctly
- Complies to Gameplay requirements
- Runs on all CrazyGames domains
- Browser checks
- No external ads
- Does not offer external login options
- In-game mention of Terms & Conditions / Privacy Policy (N/A if you collect no personal data)

The "First gameplay start" row only turns Yes after the preview has actually received
`gameplayStart`. If the game opens on a menu, someone has to start a run in the preview first.

## Technical
- **Size and file count**:
  - Initial download ≤ 50 MB, or ≤ 20 MB to be eligible for the mobile homepage. With the SDK, it is measured up to the first `gameplayStart`.
  - Total ≤ 250 MB and ≤ 1,500 files.
- **Load time**: ≤ 20 s to gameplay. Test uncached (private window or hard reload). Portal CDN caches start cold, so per-file latency multiplies with the number of files.
- **Paths**: relative paths only. Avoid third-party requests and vendor your dependencies.
- **Browsers**: Chrome and Edge are required. Games that run badly on Safari are disabled there. Touch support only if you declare mobile. Orientation is set at submission.
- **Fullscreen**: CrazyGames provides it. Custom in-game fullscreen buttons are prohibited.
- **Language**: English is required. `user.systemInfo.locale` can drive translations.
- **Physics** must behave the same at 144 Hz and 165 Hz.
- **Text** must be legible at devicePixelRatio 1 and in small iframes (800×450 mobile, 1080×607 tablet).
- **Keys and scrolling**: prevent page scroll on arrows, Space and the wheel (`preventDefault`). Quality guidelines advise against Esc (it exits fullscreen) and Ctrl/Cmd+W, and recommend adapting to keyboard layouts.
- **Sitelock**: the SDK's environment is `disabled` on any non-CrazyGames domain, and every SDK call throws there. It is `local` on localhost/127.0.0.1, or with `?useLocalSdk=true`.

## Content and links
- **Cross-promotion** is not allowed. Exceptions, as long as they are not the main call to action: community links (Discord, a dev site with no playable web build), Steam/Epic links (desktop only), links to other games in the same series, privacy policy and terms.
- **App store links** are never allowed. Hide patch-notes or GitHub-issue links on the portal build.
- **Content**: PEGI 12 and original. Names must not be easily confused with other games, and generic names only work if you own the IP.
- **Quality guidelines**:
  - Fast onboarding
  - Clear goals
  - Responsive controls
  - Consistent high-quality art and audio
  - "Uniqueness"
- Sources: https://docs.crazygames.com/requirements/gameplay/ and https://docs.crazygames.com/requirements/quality/

## SDK v3 cheat sheet
Load `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">`, then `await window.CrazyGames.SDK.init()`. Call init at the top of `<body>`, because it appends to `document.body`.

- `SDK.environment`: `'local' | 'crazygames' | 'disabled'`
- `SDK.game`:
  - `loadingStart()` / `loadingStop()`
  - `gameplayStart()` / `gameplayStop()`: fire on play, resume and new level, and stop on menus, pause and level end. Do not fire on focus loss. Calls less than 1 s apart are throttled and dropped silently.
  - `happytime()`
  - `settings` (`muteAudio`, `disableChat`) and `addSettingsChangeListener(cb)`
- `SDK.ad.requestAd('midgame' | 'rewarded', { adStarted, adFinished, adError })`:
  - Mute and pause in `adStarted`; undo in `adFinished` and `adError`. Grant rewards only in `adFinished`.
  - Errors: `adsDisabledBasicLaunch`, `unfilled`, `adblock`, `adCooldown`, `other`.
  - The midgame cooldown is about 3 min. Ads are only allowed at natural breaks, never on menu or shop buttons. The game must work with an adblocker.
- `SDK.banner.*`: never during gameplay, at most 2 per screen.
- `SDK.user`: `isUserAccountAvailable`, `getUser()`, `showAuthPrompt()`, `getUserToken()` (verify the JWT server-side), `systemInfo`.
- `SDK.data`: `getItem` / `setItem` / `removeItem` / `clear`.
  - String values, 1 MB limit, debounced saves.
  - Enable "Progress Save" at submission.
  - Pre-existing localStorage keys are **not** imported; copy them over once.
- Local test URL parameters: `?useLocalSdk=true`, `?muteAudio=true`, `?disableChat=true`, `?user_account_available=false`.
- Sources: https://docs.crazygames.com/sdk/intro/ and the pages under /sdk/ (game, video-ads, banners, user, data)

## Store assets
- **Covers**: landscape 1920×1080 (16:9), portrait 800×1200 (2:3) and square 800×800 (1:1).
- **Preview videos**: 15–20 s, ≤ 50 MB, no sound, both landscape and portrait at 1080p. No fast-forward. The first frame should be the static cover.
- **Listing**: description and controls fields.
- Source: https://docs.crazygames.com/requirements/game-covers/
