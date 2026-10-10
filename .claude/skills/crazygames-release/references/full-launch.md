# Full Launch work (after a Basic Launch)

These are planned but not shipped in Riftbound, so everything here is untested. Effort estimates are for a no-build JS game with an event bus.

| Item | What | Effort |
|---|---|---|
| Ad freeze and mute | `platform.requestAd(type, { onStart, onEnd })`. `onStart` sets a hold flag that stops the game's update and input, and drives the master gain to 0. Never use the game's own mute toggle for this, because it is usually persisted. `onEnd` undoes both. | ½ day |
| `muteAudio` setting | `platform.onSettings(s => audio.platformMuted = s.muteAudio)`. Effective mute is `userMuted || platformMuted`. The platform mute is never saved and never overridden by the player. Test with `?muteAudio=true`. | 1–2 h |
| Data module | Route load and save through `platform.storage`, which is the SDK's data module only when `environment === 'crazygames'`. Copy existing localStorage keys over once. Saves usually load synchronously at boot, so `await platform.ready` before building the game. Tick "Progress Save" at submission. | ½ day |
| Midgame ads | Only at natural breaks: between runs ("Play again", "Start"), never mid-run or on menu buttons. The SDK enforces a ~3 min cooldown. Gate on runs started by the player, not by sims or bots. | 1–2 h |
| Rewarded ads (optional) | Opt-in only, and never required to progress. Grant the reward in `adFinished` only. Ideas from easiest to hardest: double the currency on the end screen, an extra reroll, an extra choice, a revive. Revives are the hardest because death cleanup is scattered. | ½–2 days |
| `happytime()` | Boss kills and wins. Use it sparingly. | minutes |
| Esc | It exits fullscreen on the portal. Offer another pause key (P) and show that one in hints. | 1 h |
| Legibility | Check the UI at 800×450 and 1080×607 with devicePixelRatio 1. | ½ day |
