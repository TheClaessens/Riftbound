# Vendored dependencies

Served from the repo so the game makes no third-party requests (required for the CrazyGames build,
and it makes the web build work offline). Nothing here is edited by hand.

| Path | Source | License |
|---|---|---|
| `three/build/three.module.js`, `three/examples/jsm/**` | three@0.170.0 from jsdelivr, only the addons `src/` imports plus their own imports | MIT (`three/LICENSE`) |
| `fonts/**` | Google Fonts: Grenze, Grenze Gotisch, Alegreya Sans, Alegreya Sans SC; latin and latin-ext subsets; declared in `css/fonts.css` | SIL Open Font License 1.1 |

When `src/` starts importing a new `three/addons/...` file, copy it (and anything it imports) from
`https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/` into the same path here.
