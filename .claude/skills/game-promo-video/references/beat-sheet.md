# Beat sheet, titles and cue sheet

## Grid
Choose a BPM and cut only on beats. 120 BPM = 0.5 s beats, 2 s bars, which is easy arithmetic and feels energetic. Major cuts on bar lines; montage cuts on every beat; the end card on a bar line about 2 s before the end.

## 15 s template (120 BPM)
| t | Section | Title pattern | Plate |
|---|---|---|---|
| 0.0–1.5 | Cold open | Wordmark slam + tagline ("HORDE-SURVIVAL ACTION RPG") | Wide, beautiful, dimmed 0.35–0.5, blur-in |
| 1.5–3.5 | Feature 1 (core loop) | `01 · LABEL` / VERB / ACCENT LINE + live counter | The core loop at its most intense |
| 3.5–5.5 | Roster montage | `02 · FOUR CLASSES` + name per beat + `n/4` | 4 × 0.5 s close-ups |
| 5.5–7.5 | Feature 2 (system depth) | + live formula/combo chip | Dense interactions |
| 7.5–9.5 | Feature 3 (skill moment) | Prompt ("TIME YOUR DASH…") → impact label on the event | Event-synced slow-mo |
| 9.5–11.5 | Feature 4 (progression) | + recipe chips colliding into the result | Payoff of the upgrade |
| 11.5–13.0 | Content breadth | Lower third per subject + big numeral | 3 × 0.5 s (bosses, worlds) |
| 13.0–15.0 | End card | Wordmark, hook line, CTA pill, feature row | Iconic plate, dimmed + blurred |

For 30 s: double the feature count, add a slower 4 s establishing section after the cold open, and a second montage.

## Copy rules
- 1–3 words per line. Verb first ("SURVIVE", "WEAVE", "FUSE", "MASTER"), then an accent line with a number when you can ("6 REACTIONS", "10 EVOLVED SPELLS").
- Number the kickers (01, 02, …) so the sequence feels like a feature tour.
- Every title must be visibly true in its shot. If you can't stage it, cut the title.
- Prefer live read-outs over static claims: counters bound to `game.stats`, chips that update on events, an index that changes per montage cut.
- Don't invent distribution facts (price, platforms, release date). Use neutral CTAs ("PLAY NOW IN YOUR BROWSER") and flag them for the user.
- Pull exact names and colours from the game's data (class colours, act colours, element colours), so the motion design matches the game's palette.

## Layout
- Feature titles lower-left (x ≈ 118, baseline ≈ 812 at 1080p), live read-outs upper-right or lower-right, corner wordmark ("bug") top-right during features.
- Impact labels: lower third, centred, so the action at screen centre stays visible.
- Always stroke + shadow text (`inkText`) and add a soft dark `pool` behind blocks; gameplay plates are busy and bright.
- Enter fast (0.12–0.3 s, outExpo/outBack), hold, exit in the last 0.16 s before the cut (slide + fade). Stagger letters 18–30 ms.

## Cut accents (`CUTS`)
`{ t, punch, flash }`: major cuts `punch 0.07, flash 0.5`; montage cuts `0.05 / 0.3`; end card `0.08 / 0.7`; the cold open `0 / 0`.

## Cue sheet (`renderSoundtrack`)
Map the same timeline:
```js
export const CUE = {
  bpm: 120,
  intro: { end: 1.5 },
  groove: { from: 1.5, to: 13, progression: ['Am', 'F', 'C', 'G'], busyFrom: 9.5 },
  cuts: [1.5, 3.5, 5.5, 7.5, 9.5, 11.5].map((t) => ({ t, kind: 'major' }))
    .concat([3.5, 4.0, 4.5, 5.0].map((t) => ({ t, kind: 'minor' }))),
  slowmo: [{ t: 8.633, until: 9.0, release: 9.45 }],     // measured event time
  hits: [{ t: 9.95, kind: 'chime' }, ...[11.5, 12.0, 12.5].map((t) => ({ t, kind: 'boom' }))],
  outro: { at: 13, riser: 1.0, roll: 0.5, chord: 'Am', sparkle: 13.78 },
};
```
Bars start on major cuts, so chord changes coincide with scene changes. Put the riser into the end card and a sparkle under the CTA pop-in.
