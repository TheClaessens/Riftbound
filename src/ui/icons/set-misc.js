// Misc icons: element gems, passives, attunements, class sigils, buffs, UI glyphs.
// Crownforge style (design/UI.md §Icons): 48-grid (UI glyphs may use a 24-grid), 3 flat tones +
// ink outline under the fill, lit from the upper-left, colours only through CSS custom properties.
//   passive-*  engraved sigil cut into a round bronze token (+ at most one small accent)
//   attune-*   Sanctum runestones: bronze-bound iron tablet with a glowing rune (--acc, gilt)
//   class-*    a point of the Prism Crown holding the class Prime gem (fixed Prime vars)
//   buff-*     bold one-shape glyphs in the buff's own colour (shrine buffs echo the shrine rune)
//   ui-*       simple, bold glyphs (1–2 tones + ink)
const INK = 'stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke';
const INK_T = 'stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke';

// Element gems: the shape IS the element (colour-blind safe). Always drawn in their own Prime
// colours, so they read correctly with or without data-el.
const gem = (P, outer, hi, lo, extra = '') => `
  <g style="${INK}"><path style="fill:var(--${P})" d="${outer}"/></g>
  <path style="fill:var(--${P}-hi)" d="${hi}"/>
  <path style="fill:var(--${P}-lo)" d="${lo}"/>${extra}`;

// ---- shared gem geometry (el-* uses it verbatim; classes set a smaller copy) -------------
const GEM = {
  fire: ['M24 3L37 21L39 31L33 40L24 45L15 40L9 31L11 21Z', 'M24 3L11 21L9 31L24 25Z', 'M24 25L39 31L33 40L24 45Z'],
  frost: ['M24 3L42 13.5V34.5L24 45L6 34.5V13.5Z', 'M6 13.5L24 3L42 13.5L24 24Z', 'M42 13.5V34.5L24 45L24 24Z'],
  storm: ['M24 3L44 24L24 45L4 24Z', 'M24 3L4 24L24 24Z', 'M44 24L24 45L24 24Z'],
  arcane: ['M24 2L29.5 18.5L46 24L29.5 29.5L24 46L18.5 29.5L2 24L18.5 18.5Z', 'M24 2L18.5 18.5L2 24L24 24Z', 'M24 24L46 24L29.5 29.5L24 46Z'],
};
const STORM_BOLT = (sw = 1) => `<path style="fill:#4a3606;stroke:var(--storm-hi);stroke-width:${sw};stroke-linejoin:round;paint-order:stroke" d="M27 11L18 26H24L20 38L31 22H25L29 11Z"/>`;
const PRIME_HEX = {
  fire: ['#b23c0e', '#ff7a33', '#ffd0a8'], frost: ['#2b8fb8', '#7fe0ff', '#e2f8ff'],
  storm: ['#b58d14', '#ffe45c', '#fff7c8'], arcane: ['#6d3fc0', '#c08cff', '#e6d2ff'],
};
/** A Prime gem centred on (cx, cy), `size` grid units tall, with a `sw`-unit ink outline. */
function gemAt(P, cx, cy, size, sw = 2) {
  const s = size / 44, [o, h, l] = GEM[P], [lo, md, hi] = PRIME_HEX[P];
  const k = (sw / s).toFixed(2);
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(4)}) translate(-24 -24)">
    <path style="fill:var(--${P},${md});stroke:var(--ink,#0c0a12);stroke-width:${k};stroke-linejoin:round;paint-order:stroke" d="${o}"/>
    <path style="fill:var(--${P}-hi,${hi})" d="${h}"/><path style="fill:var(--${P}-lo,${lo})" d="${l}"/>
    ${P === 'storm' ? `<path style="fill:#4a3606" d="M27 11L18 26H24L20 38L31 22H25L29 11Z"/>` : ''}</g>`;
}

// ---- geometry helpers ------------------------------------------------------------------
const r2 = (n) => Math.round(n * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
/** Closed polygon path data. */
const D = (pts) => 'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z';
const ngon = (cx, cy, r, n, a0 = -90) =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rad(a0 + (360 / n) * i)), cy + r * Math.sin(rad(a0 + (360 / n) * i))]);
/** Keep the part of a polygon where nx*x + ny*y <= c (Sutherland–Hodgman against one line). */
function clip(pts, nx, ny, c) {
  const out = [], f = (p) => nx * p[0] + ny * p[1] - c;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa <= 0) !== (fb <= 0)) { const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}
/** Upper-left half of a polygon, split on the 45° diagonal through (cx, cy) (+ offset). */
const ulHalf = (pts, cx, cy, off = 0) => clip(pts, 1, 1, cx + cy + off);
/** Mirror a left-half outline (base-left … apex on x = 24) into a full symmetric outline. */
const mirror = (L) => [...L, ...L.slice(0, -1).reverse().map(([x, y]) => [48 - x, y])];
/** Rotate points about (cx, cy). */
const rot = (pts, deg, cx = 24, cy = 24) => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};
/** Curved band from angle a0 to a1 (deg, clockwise on screen) with an arrowhead at a1. */
function arcArrow(cx, cy, r, w, a0, a1, head = 1.9, tip = 26) {
  const o = [], n = 10;
  for (let i = 0; i <= n; i++) { const a = rad(a0 + ((a1 - a0) * i) / n); o.push([cx + (r + w / 2) * Math.cos(a), cy + (r + w / 2) * Math.sin(a)]); }
  const A = rad(a1), T = rad(a1 + tip);
  const head3 = [
    [cx + (r + w / 2 + head) * Math.cos(A), cy + (r + w / 2 + head) * Math.sin(A)],
    [cx + r * Math.cos(T), cy + r * Math.sin(T)],
    [cx + (r - w / 2 - head) * Math.cos(A), cy + (r - w / 2 - head) * Math.sin(A)],
  ];
  const inn = [];
  for (let i = n; i >= 0; i--) { const a = rad(a0 + ((a1 - a0) * i) / n); inn.push([cx + (r - w / 2) * Math.cos(a), cy + (r - w / 2) * Math.sin(a)]); }
  return [...o, ...head3, ...inn];
}

/** Curved band (no head) from angle a0 to a1 (deg), centre radius r, width w. */
function arcBand(cx, cy, r, w, a0, a1, n = 10) {
  const o = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    o.push([cx + (r + w / 2) * Math.cos(a), cy + (r + w / 2) * Math.sin(a)]);
    inn.unshift([cx + (r - w / 2) * Math.cos(a), cy + (r - w / 2) * Math.sin(a)]);
  }
  return [...o, ...inn];
}

// ---- palette -----------------------------------------------------------------------------
const F = (v, hex) => `fill:var(--${v},${hex})`;
const M_LO = F('metal-lo', '#4e3a24'), M_MD = F('metal', '#8c6c43'), M_HI = F('metal-hi', '#c8a874');
const ACC = F('acc', '#ecd9a6'), GILT = F('cf-gilt', '#ecd9a6'), VOID = F('ink', '#0c0a12');
const IRON_LO = F('cf-plate-1', '#1c1826'), IRON = F('cf-plate-2', '#262033'), IRON_HI = F('cf-plate-3', '#332b44');
const ENAMEL = F('cf-enamel', '#2a2350'), ENAMEL_HI = F('cf-enamel-hi', '#463a86');
const BONE = F('cf-text', '#f2ece0'), BONE_LO = F('cf-dim', '#b9b0c4');
const STONE_HI = F('cf-faint', '#8a8199'), STONE = F('phys-lo', '#6b6378');
const HP = F('hp', '#e8413a'), HP_HI = F('hp-hi', '#ff8a6a'), HP_LO = F('hp-lo', '#7a1418');
const pr = (P) => ({ lo: F(`${P}-lo`, PRIME_HEX[P][0]), md: F(P, PRIME_HEX[P][1]), hi: F(`${P}-hi`, PRIME_HEX[P][2]) });
// Buff colours that are not Primes (fixed hues from world.js / player.js), overridable per id.
const bf = (id, lo, md, hi) => ({ lo: F(`buff-${id}-lo`, lo), md: F(`buff-${id}`, md), hi: F(`buff-${id}-hi`, hi) });
const ADREN = bf('adrenaline', '#25864a', '#9dffb0', '#e8ffed');
const FURY = bf('fury', '#9e1428', '#ff4d5e', '#ffc4ca');
const GREED = bf('greed', '#a2700a', '#ffd34d', '#fff3c2');

const path = (style, d, ink = INK) => `<path style="${style}${ink ? ';' + ink : ''}" d="${d}"/>`;
const flat = (style, d) => `<path style="${style}" d="${d}"/>`;

// =========================================================================================
//  Passives: a sigil engraved into a round bronze token. The cut is void-dark with its far
//  (lower-right) wall catching the light; rim lit upper-left. At most one small inlay accent.
// =========================================================================================
const CUT = F('ink', '#0c0a12');
const INLAY = 'stroke:var(--ink,#0c0a12);stroke-width:1;stroke-linejoin:round;paint-order:stroke';
/** Map template points (u along p0->p1 in 0..1, v perpendicular in grid units) to the grid. */
function place(tpl, p0, p1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  return tpl.map(([u, v]) => [p0[0] + dx * u + nx * v, p0[1] + dy * u + ny * v]);
}
/** Annulus as one nonzero path (inner ring wound the other way). */
const ring = (cx, cy, ro, ri, n = 32) => `${D(ngon(cx, cy, ro, n))} ${D(ngon(cx, cy, ri, n).reverse())}`;
const token = (id, cut, inlay = '', k = 1.22) => {
  const d = cut.join(' '), cid = `i-passive-${id}-c`;
  return `
  <circle cx="24" cy="24" r="20" style="${M_LO};${INK}"/>
  <path style="${M_HI}" d="M38.14 9.86A20 20 0 0 0 9.86 38.14Z"/>
  <circle cx="24" cy="24" r="17.2" style="${M_MD};${INK}"/>
  <defs><clipPath id="${cid}"><path d="${d}"/></clipPath></defs>
  <g transform="translate(24 24) scale(${k}) translate(-24 -24)">
    <path style="${CUT};stroke:var(--ink,#0c0a12);stroke-width:1.3;stroke-linejoin:round" d="${d}"/>
    <g clip-path="url(#${cid})"><path style="${M_HI}" d="${d}"/><path style="${CUT}" transform="translate(-1 -1)" d="${d}"/></g>
    ${inlay}</g>`;
};

const FEATHER = [[13.4, 34.6], [35, 13]];
const PASSIVES = {
  // Might: an upright sword, gilt pommel stone.
  might: [['M24 11.2L27 14.8V26.2H21V14.8Z', 'M16 27.6L17.6 26.2H30.4L32 27.6L30.4 29.2H17.6Z', 'M22.4 29.2H25.6V32.2H22.4Z'],
    `<path style="${GILT};${INLAY}" d="M24 31.2L26.6 33.9L24 36.6L21.4 33.9Z"/>`],
  // Haste: an hourglass, gilt sand run down.
  haste: [['M17.6 12.2H30.4L31.6 14L30.4 15.8H17.6L16.4 14Z', 'M17.6 32.2H30.4L31.6 34L30.4 35.8H17.6L16.4 34Z', 'M18.8 16.8H29.2L25.4 24L29.2 31.2H18.8L22.6 24Z'],
    `<path style="${GILT};${INLAY}" d="M24 26.6L27.6 31.4H20.4Z"/>`],
  // Swiftness: three forward chevrons, cut deep.
  swiftness: [[35.55, 29.05, 22.55].map((x) => D([[x, 24], [x - 6.5, 17], [x - 10.1, 17], [x - 3.6, 24], [x - 10.1, 31], [x - 6.5, 31]])), '', 1.15],
  // Vitality: a heart, red enamel inlay.
  vitality: [['M24 35L13.2 24.4L12.8 18.2L17 13.6H21L24 16.6L27 13.6H31L35.2 18.2L34.8 24.4Z'],
    `<path style="${HP};${INLAY}" d="M24 29.4L18.2 23.6L18 20.2L19.6 18.6H20.6L24 21.8L27.4 18.6H28.4L30 20.2L29.8 23.6Z"/>`],
  // Magnetism: a horseshoe magnet (split pole caps) drawing in an XP mote.
  magnetism: [['M15.4 18.6H21V25.2A3 3 0 0 0 27 25.2V18.6H32.6V25.2A8.6 8.6 0 0 1 15.4 25.2Z', 'M15.4 13.4H21V17.2H15.4Z', 'M27 13.4H32.6V17.2H27Z'],
    `<path style="${F('xp', '#9ff0d2')};${INLAY}" d="M24 15.6L26 18.8L24 22L22 18.8Z"/>`],
  // Amplify: a core sending out waves to either side.
  amplify: [[D(ngon(24, 24, 4.4, 8, -112.5)),
    ...[[7.6, 3.2], [12, 3.2]].flatMap(([r, w]) => [D(arcBand(24, 24, r, w, -42, 42)), D(arcBand(24, 24, r, w, 138, 222))])],
    `<path style="${GILT};${INLAY}" d="M24 21.4L26.6 24L24 26.6L21.4 24Z"/>`],
  // Catalyst: a flask, gilt reagent with a reaction seam.
  catalyst: [['M21 11.2H27V13.8H26V19L33.2 31.4L31.6 34.8H16.4L14.8 31.4L22 19V13.8H21Z'],
    `<path style="${GILT};${INLAY}" d="M19.6 26.2L21.6 25L23.6 26.2L25.6 25L27.6 26.2L28.4 25.8L30.8 30.4L30 32.2H18L17.2 30.4Z"/>`],
  // Precision: a keen eye, bronze iris, gilt slit pupil.
  precision: [[D([[11, 24], [17.2, 17.4], [24, 15.4], [30.8, 17.4], [37, 24], [30.8, 30.6], [24, 32.6], [17.2, 30.6]]) + ' ' + D(ngon(24, 24, 5.6, 24).reverse())],
    `<path style="${GILT};${INLAY}" d="M24 19.4L25.9 24L24 28.6L22.1 24Z"/>`],
  // Volley: three arrows fanned, loosed together.
  volley: [(() => {
    const arrow = (t, b) => [[24, t], [27.4, t + 6], [25.2, t + 6], [25.2, b], [22.8, b], [22.8, t + 6], [20.6, t + 6]];
    return [D(arrow(11.4, 36.4)), D(rot(arrow(17.6, 37), -20, 24, 48)), D(rot(arrow(17.6, 37), 20, 24, 48))];
  })(), '', 1.1],
};

// =========================================================================================
//  Attunements: bronze-bound iron rune tablet, rune glowing in --acc (gilt by default).
// =========================================================================================
const TAB_OUT = 'M12 9.4L24 2.6L36 9.4V39.5L31.5 44H16.5L12 39.5Z';
const TAB_HI = 'M12 39.5V9.4L24 2.6L36 9.4L32.4 11L24 6.4L15.6 11V38.4Z';
const TAB_FACE = 'M15.6 11L24 6.4L32.4 11V38.4L30.4 40.4H17.6L15.6 38.4Z';
const TAB_FACET = 'M15.6 11L24 6.4L28.2 8.7L15.6 27Z';
const runeStroke = (d) => `
  <path d="${d}" style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:5.6;stroke-linecap:square;stroke-linejoin:miter"/>
  <path d="${d}" style="fill:none;stroke:var(--acc,#ecd9a6);stroke-width:3.4;stroke-linecap:square;stroke-linejoin:miter"/>`;
const tablet = (rune) => `
  ${path(M_MD, TAB_OUT)}${flat(M_HI, TAB_HI)}
  ${path(IRON, TAB_FACE)}${flat(IRON_HI, TAB_FACET)}
  ${runeStroke(rune)}`;

const RUNES = {
  might: 'M24 13.5V35 M18.6 19.4L24 13.5L29.4 19.4',          // Tiwaz: the spear
  vigor: 'M24 14V35 M18.4 14.6L24 21.4L29.6 14.6',            // Algiz: life, the warding branch
  insight: 'M20.6 13.2V35.4 M20.6 14.4L28.2 20.2 M20.6 22.2L28.2 28', // Ansuz: wisdom
  swiftcast: 'M23 13.2L18.4 18.8L23 24.4 M25 23.6L29.6 29.2L25 34.8', // Jera: the turning year
  fortune: 'M19.6 13V35 M19.6 13.6L24.6 18.8L28.8 14.2 M19.6 34.4L24.6 29.2L28.8 33.8', // Perthro: the lot-cup
  exile: 'M24 13V35.4 M18.6 20.4L29.4 27.8',                  // Naudiz: the binding cut
};

// =========================================================================================
//  Classes: one point of the Prism Crown, its Prime gem set in a bronze bezel. The silhouette
//  of the point carries the class (flame tongues / icicle tines / a bolt / crescent horns).
// =========================================================================================
function crownPoint(full, P, { gy = 24.5, gs = 18.6, bezel = 9.4, lean = 0, extra = '' } = {}) {
  const lit = clip(full, 1, lean, 24 + lean * 20);
  return `
    ${path(M_MD, D(full))}${flat(M_HI, D(lit))}${extra}
    ${path(M_MD, 'M8.5 34H39.5L37.6 41.5H10.4Z')}
    ${flat(M_HI, 'M8.5 34H39.5L39 36H9Z')}${flat(M_LO, 'M10 39.8H38L37.6 41.5H10.4Z')}
    <circle cx="24" cy="${gy}" r="${bezel}" style="${M_LO};${INK}"/>
    ${flat(M_MD, D(ulHalf(ngon(24, gy, bezel, 32), 24, gy)))}
    ${gemAt(P, 24, gy, gs, 1.6)}`;
}
const CLASS = {
  // Pyromancer: flame-tongue tines curling outward.
  pyromancer: crownPoint(mirror([[12.5, 35], [8.2, 27], [8.6, 15.5], [13.4, 22.6], [15.6, 18], [16.8, 8.6], [20.6, 15.2], [24, 2.5]]), 'fire'),
  // Cryomancer: separate icicle tines with deep V notches.
  cryomancer: crownPoint(mirror([[11.5, 35], [6, 15], [14, 25.4], [16.2, 9], [20, 17.4], [24, 2]]), 'frost'),
  // Stormcaller: short side tines, the centre point is a rising lightning bolt.
  stormcaller: crownPoint([[11, 35], [8.2, 20.6], [15, 26.4], [17.6, 25.6], [22.4, 13.6], [19.6, 14.2], [27.2, 1.6], [25.8, 11.2],
    [29, 10.6], [30.6, 25.6], [33, 26.4], [39.8, 20.6], [37, 35]], 'storm', { lean: 0.25 }),
  // Arcanist: crescent horns cradling the gem, a slender spire with a bead finial.
  arcanist: crownPoint(mirror([[11, 35], [6.6, 26.5], [7, 17.6], [10.2, 11.6], [11.8, 20.2], [15.6, 24.6], [18.6, 15.4], [22, 9.4], [24, 7.4]]), 'arcane', {
    extra: `<circle cx="24" cy="6" r="3" style="${M_MD};${INK}"/><path style="${M_HI}" d="M21.9 8.1A3 3 0 0 1 26.1 3.9Z"/>`,
  }),
};

// =========================================================================================
//  Buffs: bold, one shape each, sized for 24–36 px under a radial timer.
// =========================================================================================
function burst(T) {
  // 8 chunky rays (long cardinals, shorter diagonals); every ray has a lit and a shaded facet.
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = -90 + i * 22.5, r = i % 2 ? 9.6 : (i % 4 === 0 ? 20.5 : 15.5);
    pts.push([24 + r * Math.cos(rad(a)), 24 + r * Math.sin(rad(a))]);
  }
  let s = path(T.md, D(pts));
  for (let i = 0; i < 16; i += 2) s += flat(T.lo, D([[24, 24], pts[i], pts[(i + 1) % 16]]));
  return s + path(T.hi, D(ngon(24, 24, 6.4, 8, -112.5)), INK_T) + flat(T.md, D([[24, 24], ...ngon(24, 24, 6.4, 8, -112.5).slice(1, 5)]));
}
const BUFFS = {
  // Adrenaline (Perfect Dodge): a green burst of energy.
  adrenaline: burst(ADREN),
  // Fury: three raking claw-slashes.
  fury: (() => {
    const SL = [[0, 0], [0.28, 4.4], [0.58, 6.6], [0.84, 4.6], [1, 0], [0.62, 1.2], [0.3, 0.8]];
    const SL_HI = [[0, 0], [0.28, 4.4], [0.58, 6.6], [0.58, 4.4], [0.28, 2.6]];
    const s = (p0, p1) => path(FURY.md, D(place(SL, p0, p1))) + flat(FURY.hi, D(place(SL_HI, p0, p1)));
    return s([18.5, 3], [5.5, 31.5]) + s([30.5, 3.5], [13, 43.5]) + s([42.5, 10.5], [26.5, 43.5]);
  })(),
  // Celerity: a double forward chevron, storm-quick.
  celerity: (() => {
    const T = pr('storm');
    const ch = (x) => path(T.md, `M${x} 24L${x - 12} 6.5H${x - 21}L${x - 9} 24L${x - 21} 41.5H${x - 12}Z`)
      + flat(T.lo, `M${x} 24L${x - 12} 41.5H${x - 21}L${x - 9} 24Z`)
      + flat(T.hi, `M${x - 12} 6.5H${x - 21}L${x - 18.8} 9.6H${x - 11.4}Z`);
    return ch(28) + ch(44);
  })(),
  // Greed: a cut gold gem (crown + pavilion facets).
  greed: path(GREED.md, 'M15 9H33L42.5 19.5L24 42L5.5 19.5Z')
    + flat(GREED.hi, 'M15 9L5.5 19.5H16.5Z') + flat(GREED.hi, 'M15 9H33L31.5 19.5H16.5Z')
    + flat(GREED.lo, 'M31.5 19.5H42.5L24 42Z')
    + `<path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:1.2;stroke-linejoin:round" d="M5.5 19.5H42.5 M16.5 19.5L15 9 M31.5 19.5L33 9 M16.5 19.5L24 42L31.5 19.5"/>`,
  // Aegis: a heater ward-shield with a raised frost boss.
  aegis: (() => {
    const T = pr('frost');
    return path(T.md, 'M24 4L39.5 10V27.5L24 44L8.5 27.5V10Z') + flat(T.lo, 'M24 4L39.5 10V27.5L24 44Z')
      + flat(T.hi, 'M24 4L8.5 10V27.5L11.6 26.2V12.2L24 7.4Z')
      + path(T.hi, 'M24 15L30 18.5V25.5L24 29L18 25.5V18.5Z', INK_T) + flat(T.md, 'M24 22L30 18.5V25.5L24 29Z');
  })(),
};

// =========================================================================================
//  UI glyphs (24-grid unless noted).
// =========================================================================================
const g24 = (body) => ({ vb: 24, body });
const ARC = pr('arcane');

// gear: an 8-tooth cog
function cogPts(cx, cy, n, rOut, rIn) {
  const pts = [], step = 360 / n;
  for (let i = 0; i < n; i++) {
    const a = -90 + i * step;
    for (const [da, r] of [[-0.3, rIn], [-0.17, rOut], [0.17, rOut], [0.3, rIn]]) {
      pts.push([cx + r * Math.cos(rad(a + da * step)), cy + r * Math.sin(rad(a + da * step))]);
    }
  }
  return pts;
}
const COG = cogPts(12, 12, 8, 10.4, 7.6);
const HUB = ngon(12, 12, 3.2, 8, -112.5);

// mouse: chamfered body, buttons split at y = 10
const MOUSE = 'M8.6 2H15.4L18.5 5.1V16.5L14.6 22H9.4L5.5 16.5V5.1Z';
const mouse = (side) => {
  const btn = side === 'l' ? 'M8.6 2H12V10.4H5.5V5.1Z' : 'M15.4 2H12V10.4H18.5V5.1Z';
  return path(STONE_HI, MOUSE, INK_T) + flat(GILT, btn)
    + `<path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:1.3" d="M12 2V10.4 M5.5 10.4H18.5"/>`
    + flat(F('cf-plate-3', '#332b44'), 'M5.5 16.5L9.4 22H14.6L18.5 16.5V18.4L15.2 22.6H8.8L5.5 18.4Z');
};

const UI = {
  // Rift Shard: a violet crystal splinter with a chip broken off.
  shard: g24(path(ARC.md, 'M15 1.8L19.6 8.4L13.6 22.2L7.6 16.6L8 7.6Z', INK_T)
    + flat(ARC.hi, 'M15 1.8L8 7.6L7.6 16.6L12.4 11.6Z')
    + flat(ARC.lo, 'M12.4 11.6L7.6 16.6L13.6 22.2Z')
    + path(ARC.md, 'M18.6 14.6L21.6 16.6L20.6 20.8L17.2 19.4Z', INK_T) + flat(ARC.hi, 'M18.6 14.6L17.2 19.4L19.4 17.6Z')),

  // Rift Essence (heal card): a faceted phial of red essence, bronze-stoppered (48-grid).
  essence: path(M_MD, 'M19.8 3.5H28.2V9H19.8Z') + flat(M_HI, 'M19.8 3.5H28.2V5.4H19.8Z')
    + path(M_LO, 'M17 9H31L29.6 13H18.4Z')
    + path(HP, 'M18.4 13H29.6L36.5 24.5L35.8 34.6L28.6 43H19.4L12.2 34.6L11.5 24.5Z')
    + flat(HP_HI, 'M18.4 13H23.2L17.6 30.4L12.2 34.6L11.5 24.5Z')
    + flat(HP_LO, 'M36.5 24.5L35.8 34.6L28.6 43H19.4L24.6 34.4Z')
    + path(F('rift-white', '#efe9ff'), 'M17.2 20L18.4 23.2L21.4 24.4L18.4 25.6L17.2 28.8L16 25.6L13 24.4L16 23.2Z', INK_T),

  // Reroll: a bronze die, gilt pips on the diagonal.
  reroll: g24(path(M_MD, 'M5.5 2.5H18.5L21.5 5.5V18.5L18.5 21.5H5.5L2.5 18.5V5.5Z', INK_T)
    + flat(M_HI, 'M5.5 2.5H18.5L17.4 5H6.6L5 6.6V17.4L2.5 18.5V5.5Z')
    + flat(M_LO, 'M21.5 5.5V18.5L18.5 21.5H5.5L6.6 19H17.4L19 17.4V6.6Z')
    + `<g style="${GILT};stroke:var(--ink,#0c0a12);stroke-width:1.2;paint-order:stroke"><circle cx="8.2" cy="8.2" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="15.8" cy="15.8" r="2.1"/></g>`),

  // Banish: a level-up card sealed shut under red wax stamped with an X.
  banish: g24((() => {
    const wax = Array.from({ length: 12 }, (_, i) => {
      const a = -90 + i * 30, r = i % 2 ? 6.2 : 7.2;
      return [12 + r * Math.cos(rad(a)), 13.4 + r * Math.sin(rad(a))];
    });
    return path(M_MD, 'M6 1.4H18L20 3.4V20.6L18 22.6H6L4 20.6V3.4Z', INK_T)
      + flat(M_HI, 'M6 1.4H18L17 3.2H6.8L5.8 4.2V20L4 20.6V3.4Z')
      + path(IRON_HI, 'M7.4 4.4H16.6L17.4 5.2V19.4L16.6 20.2H7.4L6.6 19.4V5.2Z', 'stroke:var(--ink,#0c0a12);stroke-width:1;paint-order:stroke')
      + path(HP, D(wax), INK_T) + flat(HP_HI, D(ulHalf(wax, 12, 13.4)))
      + `<path style="fill:none;stroke:var(--hp-lo,#7a1418);stroke-width:2;stroke-linecap:round" d="M9.4 10.8L14.6 16 M14.6 10.8L9.4 16"/>`;
  })()),

  // Lock: a bronze padlock with a void keyhole.
  lock: g24(`<path fill-rule="evenodd" style="${STONE_HI};${INK_T}" d="M6.6 11V7.6A5.4 5.4 0 0 1 17.4 7.6V11H14.4V7.6A2.4 2.4 0 0 0 9.6 7.6V11Z"/>`
    + path(M_MD, 'M5.4 10.4H18.6L20 11.8V20.6L18.6 22H5.4L4 20.6V11.8Z', INK_T)
    + flat(M_HI, 'M5.4 10.4H18.6L20 11.8V13.2H4V11.8Z')
    + flat(VOID, 'M12 13.8A1.9 1.9 0 0 1 13 17.3L13.6 19.8H10.4L11 17.3A1.9 1.9 0 0 1 12 13.8Z')),

  // Relic Chest: a dark reliquary casket, gold seam, clasp and corner caps (48-grid).
  chest: path(IRON_HI, 'M7 24V15.5L12 9H36L41 15.5V24Z')
    + flat(ENAMEL_HI, 'M7 15.5L12 9H36L34.4 11.8H13.4L9.8 16.4V24H7Z')
    + path(IRON, 'M7 24H41V39.5L38.5 42H9.5L7 39.5Z')
    + flat(IRON_LO, 'M41 24V39.5L38.5 42H9.5L11 39.2H38.4V24Z')
    + path(GILT, 'M7 33.6L14.4 42H9.5L7 39.5Z', INK_T) + path(GILT, 'M41 33.6L33.6 42H38.5L41 39.5Z', INK_T)
    + path(GILT, 'M5.5 22H42.5V26H5.5Z', INK_T)
    + path(GILT, 'M19.5 18H28.5V29L24 33.5L19.5 29Z', INK_T) + flat(BONE, 'M19.5 18H24V33.5L19.5 29Z')
    + flat(VOID, 'M24 20.8A2 2 0 0 1 25.1 24.5L25.7 27.6H22.3L22.9 24.5A2 2 0 0 1 24 20.8Z'),

  // Elite Surge: a crowned great-helm.
  surge: g24(path(GILT, 'M6.2 8L7 2.6L9.6 5.2L12 1.4L14.4 5.2L17 2.6L17.8 8Z', INK_T)
    + path(M_MD, 'M6 7.6H18L20 10V16.4L15.8 22H8.2L4 16.4V10Z', INK_T)
    + flat(M_HI, 'M6 7.6H12V22H8.2L4 16.4V10Z')
    + flat(VOID, 'M5.6 12H18.4V14.6H5.6Z M10.8 14.6H13.2V19.6H10.8Z')),

  // Swarm: six barbed arrowheads converging on one point.
  swarm: g24(Array.from({ length: 6 }, (_, i) =>
    path(BONE_LO, D(rot([[12, 7.6], [15.4, 2.2], [12, 3.8], [8.6, 2.2]], i * 60, 12, 12)), INK_T)).join('')
    + path(GILT, D(ngon(12, 12, 2.6, 4, -90)), INK_T)),

  // Boss: a horned skull, ember eyes.
  boss: g24(path(M_HI, 'M8.4 8.6L3.6 7.2L1 1.4L5.6 4.2L9.4 5Z', INK_T) + path(M_HI, 'M15.6 8.6L20.4 7.2L23 1.4L18.4 4.2L14.6 5Z', INK_T)
    + flat(M_LO, 'M8.4 8.6L3.6 7.2L5 6.2L9 6.6Z M15.6 8.6L20.4 7.2L19 6.2L15 6.6Z')
    + path(BONE, 'M9 3.6H15L18.4 7.4L18.8 12.6L16.4 15.6V20.2L14.8 21.6H9.2L7.6 20.2V15.6L5.2 12.6L5.6 7.4Z', INK_T)
    + flat(BONE_LO, 'M18.8 12.6L16.4 15.6V20.2L14.8 21.6H12V15.4L15 14.4Z')
    + flat(VOID, 'M6.8 9.6L11 10.8L10.4 14H7.8Z M17.2 9.6L13 10.8L13.6 14H16.2Z M11.2 15.2H12.8L12 16.8Z')
    + flat(HP, 'M8 10.8L9.8 11.4L9.4 12.6H8.4Z M16 10.8L14.2 11.4L14.6 12.6H15.6Z')
    + flat(VOID, 'M9.6 18H10.6V21.6H9.6Z M11.5 18H12.5V21.6H11.5Z M13.4 18H14.4V21.6H13.4Z')),

  // Shrine: a broken-topped standing stone, rune glowing (tinted by --acc), pebbles ringing it (48-grid).
  shrine: `<ellipse cx="24" cy="40" rx="18.5" ry="5" style="${IRON};${INK}"/>`
    + path(STONE, 'M14.6 40.6L13.4 17.6L16.2 9L21.6 4L27.4 6.4L31.8 3.4L34.8 10.4L33.8 40.6Z')
    + flat(STONE_HI, 'M14.6 40.6L13.4 17.6L16.2 9L21.6 4L27.4 6.4L24.6 9.6H19.6L18.4 17.4L18.8 40.6Z')
    + flat(IRON_HI, 'M34.8 10.4L33.8 40.6H29.6L30.2 13.6Z')
    + path(ACC, 'M24.4 15.4L29.6 25.4L24.4 36.6L19.2 25.4Z', INK_T) + flat(BONE, 'M24.4 15.4L19.2 25.4H24.4Z')
    + [[7.8, 39.4, 2.7], [12.8, 43.6, 2.5], [35.2, 43.6, 2.5], [40.2, 39.4, 2.7]]
      .map(([x, y, r]) => path(STONE_HI, D(ngon(x, y, r, 6, -90)), INK_T)).join(''),

  // Auto-cast: two chasing arrows around a spark.
  auto: g24(path(M_HI, D(arcArrow(12, 12, 8.3, 3, -160, -40)), INK_T)
    + path(M_MD, D(arcArrow(12, 12, 8.3, 3, 20, 140)), INK_T)
    + path(GILT, 'M12 6.4L13.5 10.5L17.6 12L13.5 13.5L12 17.6L10.5 13.5L6.4 12L10.5 10.5Z', INK_T)),

  // Codex: a bound tome, gilt corners and sigil.
  tome: g24(path(ENAMEL_HI, 'M5.2 2.2H18.4L20 3.8V20.2L18.4 21.8H5.2Z', INK_T)
    + flat(BONE_LO, 'M18.4 3.8H20V20.2H18.4Z')
    + path(ENAMEL, 'M3.8 2.2H7.2V21.8H3.8Z', INK_T)
    + flat(GILT, 'M14.6 2.2H18.4L20 3.8V7.6Z M14.6 21.8H18.4L20 20.2V16.4Z')
    + path(GILT, 'M13 7.6L16.2 12L13 16.4L9.8 12Z', INK_T)),

  // Settings: a bronze cog.
  gear: g24(`<path fill-rule="evenodd" style="${M_MD};${INK_T}" d="${D(COG)} ${D([...HUB].reverse())}"/>`
    + `<path fill-rule="evenodd" style="${M_HI}" d="${D(ulHalf(COG, 12, 12))} ${D(ulHalf(HUB, 12, 12).reverse())}"/>`),

  'mouse-l': g24(mouse('l')),
  'mouse-r': g24(mouse('r')),

  // Rift Tier: a pointed stone arch holding a rift.
  tier: g24(path(M_MD, 'M3 22.4V10.6L6.4 5.4L12 1.6L17.6 5.4L21 10.6V22.4Z', INK_T)
    + flat(M_HI, 'M3 22.4V10.6L6.4 5.4L12 1.6V5L8.6 7.8L6.4 11.6V22.4Z')
    + path(ARC.lo, 'M6.4 22.4V11.6L9 7.6L12 5.4L15 7.6L17.6 11.6V22.4Z', INK_T)
    + flat(ARC.md, 'M12 5.4L15 7.6L17.6 11.6V22.4H13.4L14.2 17L11.4 13.4Z')
    + flat(F('rift-white', '#efe9ff'), 'M12 6.6L13 9.6L11.2 13.2L14.2 17L13 22.4H11.6L12.6 17.4L9.6 13.4L11.6 9.8Z')),

  // Run clock: a bronze stopwatch.
  clock: g24(path(M_MD, 'M10.2 0.8H13.8V3.6H10.2Z', INK_T)
    + `<circle cx="12" cy="13.4" r="9.4" style="${M_MD};${INK_T}"/>`
    + flat(M_HI, D(ulHalf(ngon(12, 13.4, 9.4, 40), 12, 13.4)))
    + `<circle cx="12" cy="13.4" r="6.6" style="${BONE};${INK_T}"/>`
    + flat(VOID, 'M11.1 13.4L12 7.8L12.9 13.4Z M12 12.5L16.6 14.2L12 14.3Z')
    + `<circle cx="12" cy="13.4" r="1.2" style="${VOID}"/>`),

  // Patch notes: a bone-parchment scroll between two bronze rods, inked lines.
  notes: g24(path(BONE, 'M6.2 4.4H17.8V19.6H6.2Z', INK_T)
    + flat(VOID, 'M8.6 8.2H15.4V9.4H8.6Z M8.6 11.4H15.4V12.6H8.6Z M8.6 14.6H13.2V15.8H8.6Z')
    + path(M_MD, 'M4.2 2.2H19.8V5.4H4.2Z', INK_T) + flat(M_HI, 'M4.2 2.2H19.8V3.6H4.2Z')
    + path(M_MD, 'M4.2 18.6H19.8V21.8H4.2Z', INK_T) + flat(M_HI, 'M4.2 18.6H19.8V20H4.2Z')),

  // Feedback: a chamfered bronze speech bubble with a tail, two inked lines of text.
  feedback: g24(path(M_MD, 'M5.4 3H18.6L21.4 5.8V14.2L18.6 17H12.6L7.8 21.4V17H5.4L2.6 14.2V5.8Z', INK_T)
    + flat(M_HI, 'M5.4 3H18.6L19.6 4H4.4L3.6 4.8V14.2L2.6 14.2V5.8Z')
    + flat(M_LO, 'M7.8 17H12.6L7.8 21.4Z')
    + flat(VOID, 'M7 8H17V9.4H7Z M7 11.2H13.4V12.6H7Z')),

  // Help: an octagonal bronze-rimmed enamel seal with a gilt "?" (the only glyph-shaped icon).
  help: g24((() => {
    const rim = ngon(12, 12, 11.2, 8, -112.5), face = ngon(12, 12, 8.6, 8, -112.5);
    return path(M_MD, D(rim), INK_T) + flat(M_HI, D(ulHalf(rim, 12, 12)))
      + `<path style="${ENAMEL};stroke:var(--ink,#0c0a12);stroke-width:1;paint-order:stroke" d="${D(face)}"/>`
      + `<path style="${GILT};stroke:var(--ink,#0c0a12);stroke-width:1;stroke-linejoin:round;paint-order:stroke" transform="translate(12 12) scale(0.92) translate(-12 -11.9)"
        d="M8.2 9.4L8.8 6.8L10.6 5.2H13.4L15.2 6.8L15.8 9.4L15.2 11.2L13.4 12.8V14.6H10.6V12L12.6 10.2L12.8 9L12.4 8H11.6L11.2 9V9.8Z M10.6 15.8H13.4V18.6H10.6Z"/>`;
  })()),
};

// =========================================================================================
const out = {
  'el-fire': gem('fire', ...GEM.fire),
  'el-frost': gem('frost', ...GEM.frost),
  'el-storm': gem('storm', ...GEM.storm, STORM_BOLT()),
  'el-arcane': gem('arcane', ...GEM.arcane),
};
for (const [id, [cut, inlay, k]] of Object.entries(PASSIVES)) out[`passive-${id}`] = token(id, cut, inlay, k);
for (const [id, d] of Object.entries(RUNES)) out[`attune-${id}`] = tablet(d);
for (const [id, s] of Object.entries(CLASS)) out[`class-${id}`] = s;
for (const [id, s] of Object.entries(BUFFS)) out[`buff-${id}`] = s;
for (const [id, s] of Object.entries(UI)) out[`ui-${id}`] = s;
export default out;
