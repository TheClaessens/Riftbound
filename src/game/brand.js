// Player-facing name of the game and of its heroes: the one place to change for a rebrand.
// Follows automatically: the title-screen wordmark and labels, the end-screen unlock callout, the
// browser tab title (main.js), the CrazyGames loading screen and <title> (tools/package-crazygames.ps1
// reads this file) and the store covers (promo/store/store.js).
// Not tied to it on purpose: the localStorage keys ('riftbound.*'), so saves survive a rename.
// (Renamed from "Riftbound" in 6.1: that name belongs to Riot Games' League of Legends TCG.)
export const GAME_NAME = 'Scions of the Prism Crown';
// The wordmark sets the name on two lines: the big blackletter word, then the small line under it.
export const WORDMARK_MAIN = 'Scions';
export const WORDMARK_SUB = 'of the Prism Crown';
export const HERO_TERM = 'Scion';   // what the game calls a playable hero: "Choose your …", "new …"
