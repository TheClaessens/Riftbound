// Skill + fusion + dash icons (48-grid, Crownforge style: 3 flat tones + 2u ink outline under
// the fill, lit from the upper-left, colours from --el / --el-lo / --el-hi). See design/UI.md §Icons.
//  - Projectiles fly lower-left -> upper-right. They are authored flying +x along y = 24 inside
//    DIAG (rotate -45), where local "up" is the screen's upper-left, i.e. the lit side. along()
//    re-places the same silhouettes anywhere, so fusions literally reuse their parents' shapes.
//  - Novas/auras are radial, ground-targeted spells sit on a ground ellipse.
//  - Two-element fusions paint their second Prime with fixed vars (pr('frost') etc.).
//  - Dashes always use their class Prime (fixed vars), a ">" chevron and an element trail,
//    moving left -> right (blink: two rift marks instead).
const INK = 'stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke';
const INK_T = 'stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke';
const VOID = 'var(--ink,#0c0a12)';

// Prime fallbacks (lo / mid / hi), same values as css/theme.css.
const HEX = {
  fire: ['#b23c0e', '#ff7a33', '#ffd0a8'],
  frost: ['#2b8fb8', '#7fe0ff', '#e2f8ff'],
  storm: ['#b58d14', '#ffe45c', '#fff7c8'],
  arcane: ['#6d3fc0', '#c08cff', '#e6d2ff'],
};
/** Element tri-tone bound by data-el (fallback = the skill's own Prime). */
const el = (e) => ({ lo: `var(--el-lo,${HEX[e][0]})`, md: `var(--el,${HEX[e][1]})`, hi: `var(--el-hi,${HEX[e][2]})` });
/** Fixed Prime tri-tone (second element of a fusion, dashes). */
const pr = (e) => ({ lo: `var(--${e}-lo,${HEX[e][0]})`, md: `var(--${e},${HEX[e][1]})`, hi: `var(--${e}-hi,${HEX[e][2]})` });
const FIRE = el('fire'), FROST = el('frost'), STORM = el('storm'), ARC = el('arcane');

// ---- geometry helpers ------------------------------------------------------------------
const r1 = (n) => Math.round(n * 10) / 10;
const rad = (d) => (d * Math.PI) / 180;
const P = (arr) => arr.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
/** Polygon; ink = 2u outline under the fill, 'thin' = 1.5u, false = flat facet. */
const pg = (fill, pts, ink = true) => {
  const s = ink === 'thin' ? `;${INK_T}` : ink ? `;${INK}` : '';
  return `<polygon style="fill:${fill}${s}" points="${typeof pts === 'string' ? pts : P(pts)}"/>`;
};
const ell = (fill, cx, cy, rx, ry, ink = true) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" style="fill:${fill}${ink ? ';' + INK : ''}"/>`;
const DIAG = (s) => `<g transform="rotate(-45 24 24)">${s}</g>`;

/** Map template points (u along p0->p1 in 0..1, v perpendicular in grid units * w). */
function place(tpl, p0, p1, w = 1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  return tpl.map(([u, v]) => [p0[0] + dx * u + nx * v * w, p0[1] + dy * u + ny * v * w]);
}
/** Map a DIAG-local shape (flying +x along y = 24, from x0 to x1) onto p0 -> p1, uniformly
 *  scaled. flip = -1 mirrors it so the lit side stays upper-left when flying leftwards. */
const along = (x0, x1, p0, p1, flip = 1) => (pts) => {
  const k = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / (x1 - x0);
  return place(pts.map(([x, y]) => [(x - x0) / (x1 - x0), (y - 24) * k * flip]), p0, p1);
};
/** Scale a DIAG-local shape about the centre: sx along the flight, sy across it (dx shifts along). */
const fit = (sx, sy, dx = 0) => (pts) => pts.map(([x, y]) => [24 + (x - 24) * sx + dx, 24 + (y - 24) * sy]);
/** Draw a layered shape [[tone, points, ink], …] with tones from T, through an optional map. */
const draw = (T, layers, map = (p) => p) => layers.map(([t, pts, ink = false]) => pg(T[t] ?? t, map(pts), ink)).join('');

// Classic lightning bolt (wide end at u = 0, point at u = 1), widths in grid units.
const BOLT = [[0, -1.6], [0.56, -5], [0.56, 0.6], [1, 0], [0.42, 5.6], [0.42, 0.2], [0, 1.6]];
const BOLT_HI = [[0, -1.6], [0.56, -5], [0.56, 0.6], [0.42, 0.2], [0, 0]];
const bolt = (T, p0, p1, w = 1, ink = true) =>
  pg(T.md, place(BOLT, p0, p1, w), ink) + pg(T.hi, place(BOLT_HI, p0, p1, w), false);
// Chain hop: an even-thickness Z segment tapering from the source (u = 0) to the target.
const HOP = [[0, -2.8], [0.42, 1.46], [0.58, -5.26], [1, 0], [0.58, -1.74], [0.42, 5.54], [0, 2.8]];
const HOP_HI = [[0, -2.8], [0.42, 1.46], [0.58, -5.26], [0.58, -3.5], [0.42, 3.5], [0, 0]];
// Kite shard (point at u = 1) and its lit half.
const SHARD = [[0, 0], [0.28, -1], [1, 0], [0.28, 1]];
const SHARD_HI = [[0, 0], [0.28, -1], [1, 0]];
const shard = (T, p0, p1, w, ink = true) => pg(T.md, place(SHARD, p0, p1, w), ink) + pg(T.hi, place(SHARD_HI, p0, p1, w), false);

/** Regular n-gon points (sy squashes it onto the ground plane). */
const ngon = (cx, cy, r, n, a0 = -90, sy = 1) =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rad(a0 + (360 / n) * i)), cy + sy * r * Math.sin(rad(a0 + (360 / n) * i))]);

/** Faceted orb: octagon body (mid) + upper-left lit facet (hi) + lower-right shade facet (lo). */
function orb(T, cx, cy, r, ink = true) {
  const o = ngon(cx, cy, r, 8, -112.5);
  return pg(T.md, o, ink)
    + pg(T.hi, [o[5], o[6], o[7], [cx + r * 0.05, cy - r * 0.35], [cx - r * 0.12, cy - r * 0.12], [cx - r * 0.35, cy + r * 0.05]], false)
    + pg(T.lo, [o[1], o[2], o[3], [cx - r * 0.2, cy + r * 0.62], [cx + r * 0.3, cy + r * 0.3], [cx + r * 0.62, cy - r * 0.2]], false);
}

/** Curved band along a circle/ellipse (vortex arms, orbit trails): angle a0 -> a1 (deg,
 *  clockwise), radius r0 -> r1, half-width wf(t); sy squashes it onto the ground plane. */
function band(cx, cy, a0, a1, r0, r1_, wf, sy = 1, n = 14) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = rad(a0 + (a1 - a0) * t), r = r0 + (r1_ - r0) * t, w = wf(t);
    out.push([cx + (r + w) * Math.cos(a), cy + sy * (r + w) * Math.sin(a)]);
    inn.push([cx + (r - w) * Math.cos(a), cy + sy * (r - w) * Math.sin(a)]);
  }
  return [...out, ...inn.reverse()];
}
const swell = (W) => (t) => W * Math.pow(Math.sin(Math.PI * t), 0.8);

/** Spiral vortex: curved arms from the core outwards around a void eye. */
function vortex(T, cx, cy, R, { arms = 4, sy = 1, rot = 0, eye = 0.3, w = 0.17 } = {}) {
  const tones = [T.hi, T.md, T.lo, T.md];
  let s = '';
  for (let i = 0; i < arms; i++) {
    const a0 = rot + (360 / arms) * i;
    s += pg(tones[i % 4], band(cx, cy, a0, a0 + 150, R * 0.28, R * 0.92, swell(R * w), sy));
  }
  return s + ell(VOID, cx, cy, r1(R * eye), r1(R * eye * sy), false);
}

/** Cloud: three faceted lumps on a flat base. */
function cloud(T, cx, cy, s = 1) {
  const L = (x, y, r) => ngon(cx + x * s, cy + y * s, r * s, 8, -112.5);
  const X = (x, y) => [cx + x * s, cy + y * s];
  return pg(T.lo, [X(-17, 1), X(17, 1), X(15, 7), X(-15, 7)])
    + pg(T.md, L(10, 0, 7.5)) + pg(T.md, L(-10, 1, 6.5)) + pg(T.md, L(-1, -3, 10))
    + pg(T.hi, [...L(-1, -3, 10).slice(5, 8), X(2, -6), X(-7, -1)], false)
    + pg(T.hi, [...L(-10, 1, 6.5).slice(5, 8), X(-9, 1)], false)
    + pg(T.lo, [X(-16, 3.5), X(16.5, 3.5), X(15, 7), X(-15, 7)], false);
}

/** Dash chevron ">" with its tip at (x, y): upper arm lit, lower arm mid. */
const chevron = (T, x, y, w, h, t) =>
  pg(T.md, [[x, y], [x - w, y - h], [x - w - t, y - h], [x - t, y], [x - w - t, y + h], [x - w, y + h]])
  + pg(T.hi, [[x, y], [x - w, y - h], [x - w - t, y - h], [x - t, y]], false);

/** Struck-target node: a faceted storm-cut diamond (lit upper-left, shaded lower-right). */
const node = (T, x, y, r) => pg(T.md, [[x, y - r], [x + r, y], [x, y + r], [x - r, y]])
  + pg(T.hi, [[x, y - r], [x - r, y], [x, y]], false) + pg(T.lo, [[x + r, y], [x, y + r], [x, y]], false);
/** Small diamond spark / ember / snow mote. */
const chip = (fill, x, y, r, ink = 'thin') => pg(fill, [[x, y - r], [x + r, y], [x, y + r], [x - r, y]], ink);

// ---- parent silhouettes (DIAG-local, flying +x) -----------------------------------------
// Arcane Bolt: the arcane 4-point star as a dart head on a wedge trail. x 3..45.
const S_ARCBOLT = [
  ['lo', [[30, 15], [10, 20.5], [3, 24], [10, 27.5], [30, 33]], true],
  ['md', [[28, 19.5], [12, 23], [12, 25], [28, 28.5]]],
  ['md', [[45, 24], [35.5, 20.5], [32, 9.5], [28.5, 20.5], [17, 24], [28.5, 27.5], [32, 38.5], [35.5, 27.5]], true],
  ['hi', [[32, 24], [45, 24], [35.5, 20.5], [32, 9.5], [28.5, 20.5], [17, 24]]],
  ['lo', [[32, 24], [45, 24], [35.5, 27.5], [32, 38.5]]],
];
// Cinder Bolt: a flame-cut ember head on a swept, tongued flame. x 2..45.
const S_CINDER = [
  ['lo', [[45, 24], [36, 15.5], [27, 16], [15, 9.5], [19, 17.5], [5, 17.5], [15, 22.5], [2, 27], [16, 28.5], [10, 35.5], [26, 31.5], [36, 32.5]], true],
  ['md', [[26, 19.5], [16, 19.5], [20, 22.5], [10, 25.5], [20, 27], [17, 30], [26, 28.5]]],
  ['md', [[44, 24], [35.5, 18.5], [25, 19.5], [21, 24], [25, 28.5], [35.5, 29.5]], true],
  ['hi', [[44, 24], [35.5, 18.5], [25, 19.5], [21, 24]]],
];
// Ice Shard: a long hex-prism icicle with a broken back end, three facet bands. x 6..46.
const S_ICE = [
  ['md', [[46, 24], [36, 16], [14, 17], [8, 20], [12, 23], [5, 27], [13, 30], [36, 32]], true],
  ['hi', [[46, 24], [36, 16], [14, 17], [8, 20], [12, 23], [36, 22.3]]],
  ['lo', [[46, 24], [36, 26.8], [8.5, 26.8], [5, 27], [13, 30], [36, 32]]],
];
// Meteor: a dark stone boulder split by molten cracks, a short flame behind it (screen space,
// falling down-left onto the ground). Stone is fixed warm charcoal; only the fire is --el.
const STONE = { lo: 'var(--stone-lo,#2b221f)', md: 'var(--stone,#4a3c34)', hi: 'var(--stone-hi,#76614f)' };
const S_ROCK = [
  ['md', [[22, 14], [33, 3], [33, 9], [45, 3], [38, 13], [46, 14], [34, 24]], true],
  ['hi', [[27, 13], [33, 8], [33, 11], [39, 9], [36, 14], [40, 15], [33, 19]]],
  [STONE.lo, [[5, 28], [8, 16], [17, 9], [29, 9], [36, 17], [35, 30], [26, 39], [12, 39]], true],
  [STONE.md, [[5, 28], [8, 16], [19, 23], [13, 33]]],
  [STONE.md, [[29, 9], [36, 17], [19, 23]]],
  [STONE.hi, [[8, 16], [17, 9], [29, 9], [19, 23]]],
  // molten cracks: a main seam across the shadow face, a branch up into the lit face
  ['md', [[8.5, 33], [16.5, 24.5], [21, 27], [30.5, 19.5], [32, 22.5], [21.5, 30.5], [17, 28.5], [11, 35]]],
  ['hi', [[16, 25.5], [13.5, 17.5], [16, 17], [18.5, 25.5]]],
  ['hi', [[21.5, 30], [25, 36.5], [27, 35.5], [23.5, 29]]],
];

export default {
  // ======================= STARTERS (class basic attacks) =======================
  // Arcane Bolt: an arcane star dart on a wedge trail.
  // Starters are drawn larger than their fusion copies (fit) so they hold a 64 px socket.
  'skill-arcaneBolt': DIAG(draw(ARC, S_ARCBOLT, fit(1.13, 1.32))),

  // Cinder Bolt: a slim ember dart in a swept flame (a dart, where Fireball is a ball).
  'skill-cinderBolt': DIAG(draw(FIRE, S_CINDER, fit(1.1, 1.38, -0.5))),

  // Ice Shard: a piercing hex-prism icicle.
  'skill-iceShard': DIAG(draw(FROST, S_ICE, fit(1.16, 1.42, -0.8))),

  // Spark: a crackling storm star with a lightning tail and forks out front.
  'skill-spark':
    bolt(STORM, [27, 20], [3, 45], 1.65)
    + bolt(STORM, [36, 11], [43, 1.5], 0.75, 'thin')
    + bolt(STORM, [37, 12], [47, 8], 0.7, 'thin')
    + pg(STORM.md, '30,1.5 34.5,11 45,15.5 34.5,20 30,30 25.5,20 15,15.5 25.5,11')
    + pg(STORM.hi, '30,1.5 25.5,11 15,15.5 30,15.5', false)
    + pg(STORM.lo, '30,15.5 45,15.5 34.5,20 30,30', false),

  // ======================= SHARED SKILLS =======================
  // Fireball: a chunky faceted fire core with a short, thick, tongued tail.
  'skill-fireball': DIAG(
    pg(FIRE.lo, '31,11 40,14.5 44,24 40,33.5 31,37 22,35.5 9,35.5 15.5,29.5 3,24 15.5,18.5 9,12.5 22,12.5')
    + pg(FIRE.md, '32,15 38.5,17.5 41,24 38.5,30.5 32,33 23.5,32 14,30.5 20,26.5 9.5,24 20,21.5 14,17.5 23.5,16')
    + pg(FIRE.hi, '26.5,19.5 31,16 37,18 38.5,23 33,26.5 27.5,25.5', false),
  ),

  // Frost Nova: six spikes through a broken shock ring around a hex core.
  'skill-frostNova': `
    <defs><g id="i-skill-frostNova-k">
      <path style="fill:var(--el,#7fe0ff);${INK}" d="M24 5 L27.5 15 L24 19 L20.5 15 Z"/>
      <path style="fill:var(--el-hi,#e2f8ff)" d="M24 6.5 L24 18 L21.3 15 Z"/>
    </g></defs>
    <g transform="rotate(-82.5 24 24)" fill="none">
      <circle cx="24" cy="24" r="19" style="stroke:var(--ink,#0c0a12);stroke-width:5.5;stroke-dasharray:16.9 3;stroke-dashoffset:1"/>
      <circle cx="24" cy="24" r="19" style="stroke:var(--el-lo,#2b8fb8);stroke-width:3;stroke-dasharray:14.9 5"/>
    </g>
    <use href="#i-skill-frostNova-k"/><use href="#i-skill-frostNova-k" transform="rotate(60 24 24)"/>
    <use href="#i-skill-frostNova-k" transform="rotate(120 24 24)"/><use href="#i-skill-frostNova-k" transform="rotate(180 24 24)"/>
    <use href="#i-skill-frostNova-k" transform="rotate(240 24 24)"/><use href="#i-skill-frostNova-k" transform="rotate(300 24 24)"/>
    <polygon style="fill:var(--el-hi,#e2f8ff);${INK}" points="24,18 29.2,21 29.2,27 24,30 18.8,27 18.8,21"/>
    <polygon style="fill:var(--el,#7fe0ff)" points="24,24 29.2,21 29.2,27 24,30"/>`,

  // Chain Lightning: one bolt hopping between three struck targets.
  'skill-chainLightning':
    // Hop order = bolt taper (wide at the source, point at the target) + shrinking targets.
    pg(STORM.md, place(HOP, [22, 13], [40, 31], 1.45)) + pg(STORM.hi, place(HOP_HI, [22, 13], [40, 31], 1.45), false)
    + pg(STORM.md, place(HOP, [9, 36], [21, 11], 1.45)) + pg(STORM.hi, place(HOP_HI, [9, 36], [21, 11], 1.45), false)
    + node(STORM, 9, 37, 7.5) + node(STORM, 21, 11, 6.5) + node(STORM, 40, 31, 5.8),

  // Meteor: an angular burning boulder plunging onto a ground ellipse.
  'skill-meteor':
    ell(FIRE.lo, 24, 40.5, 20, 5.5) + ell(VOID, 22, 40.5, 13, 3.2, false) + ell(FIRE.md, 21, 41, 7, 1.6, false)
    + draw(FIRE, S_ROCK),

  // Blizzard: a frost cloud driving slanted ice down onto a ground ellipse.
  'skill-blizzard':
    ell(FROST.lo, 24, 41, 18, 4.5)
    + shard(FROST, [21, 25], [14, 39], 3) + shard(FROST, [31, 25], [24, 40], 3) + shard(FROST, [41, 24], [35, 36], 3)
    + chip(FROST.hi, 8, 29, 2.2) + chip(FROST.hi, 40, 40, 2)
    + cloud(FROST, 24, 11, 1.1),

  // Singularity: a spiral vortex with a void eye, over its ground ellipse.
  'skill-singularity':
    ell(ARC.lo, 24, 40, 17, 4.5)
    + vortex(ARC, 24, 22, 18, { arms: 4, rot: 200 }),

  // Spirit Orbs: three faceted orbs on an orbit with crescent trails around a star.
  'skill-spiritOrbs': (() => {
    let s = '';
    for (const a of [-90, 30, 150]) s += pg(ARC.lo, band(24, 24, a - 85, a, 13.5, 13.5, (t) => 5.2 * t));
    s += pg(ARC.md, '24,17 26,22 31,24 26,26 24,31 22,26 17,24 22,22') + pg(ARC.hi, '24,17 22,22 17,24 24,24', false);
    for (const a of [-90, 30, 150]) s += orb(ARC, 24 + 13.5 * Math.cos(rad(a)), 24 + 13.5 * Math.sin(rad(a)), 6.8);
    return s;
  })(),

  // Static Field: a sky strike landing on the ground, crackling along it.
  'skill-staticField':
    ell(STORM.lo, 24, 40, 19, 5.5)
    + shard(STORM, [20, 39], [5, 33], 2.6) + shard(STORM, [20, 38], [11, 26], 2.6)
    + shard(STORM, [22, 38], [33, 27], 2.6) + shard(STORM, [22, 39], [41, 34], 2.6)
    + bolt(STORM, [31, 1], [21, 40], 1.55),

  // ======================= FUSIONS =======================
  // Frostfire Comet (Fireball + Frost Nova): fireball body, frost-crystal head with nova spikes.
  'skill-frostfireComet': (() => {
    const F = pr('frost');
    const hex = ngon(31, 24, 10.5, 6, 0);
    return DIAG(
      pg(FIRE.lo, '30,8 9,10 15,16 0,18 12,22 -2,26.5 13,29 5,36.5 17,35 13,41 30,40')
      + pg(FIRE.md, '28,13 14,14 19,18.5 7,21 18,24.5 7,29 19,30 15,35 28,35')
      + pg(F.md, '47,24 41,20.5 41,27.5') + pg(F.md, '40,8.5 39,17 33,15') + pg(F.md, '40,39.5 33,33 39,31')
      + pg(F.md, hex)
      + pg(F.hi, [[31, 24], hex[3], hex[4], hex[5]], false)
      + pg(F.lo, [[31, 24], hex[0], hex[1], hex[2]], false),
    );
  })(),

  // Plasma Orb (Fireball + Chain Lightning): a storm orb on a fire tail, zapping outwards.
  'skill-plasmaOrb': (() => {
    const F = pr('fire');
    return DIAG(
      pg(F.lo, '30,11.5 10,13 16,19 4,24 16,29 10,35 30,36.5')
      + pg(F.md, '29,15.5 16,17 20.5,21 11,24 20.5,27 16,31 29,32.5')
      + bolt(STORM, [33, 15], [36, 2], 0.45, 'thin')
      + bolt(STORM, [40, 24], [50, 21], 0.45, 'thin')
      + bolt(STORM, [33, 33], [37, 46], 0.45, 'thin')
      + orb(STORM, 31, 24, 11),
    );
  })(),

  // Storm Halo (Chain Lightning + Spirit Orbs): arcane wisps linked by a ring of lightning.
  'skill-stormHalo': (() => {
    const A = pr('arcane');
    const R = 15, pts = [-90, 0, 90, 180].map((a) => [24 + R * Math.cos(rad(a)), 24 + R * Math.sin(rad(a))]);
    let s = '';
    for (let i = 0; i < 4; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % 4];
      const out = [24 + ((p0[0] + p1[0]) / 2 - 24) * 1.3, 24 + ((p0[1] + p1[1]) / 2 - 24) * 1.3];
      s += bolt(STORM, p0, out, 0.85) + bolt(STORM, out, p1, 0.85);
    }
    for (const p of pts) s += orb(A, p[0], p[1], 6.6);
    return s + chip(STORM.md, 24, 24, 4.5, true) + pg(STORM.hi, '24,19.5 19.5,24 24,24', false);
  })(),

  // Arcane Barrage (Arcane Bolt + Spirit Orbs): an orb loosing a fan of arcane bolts.
  'skill-arcaneBarrage': (() => {
    // A staggered volley along the 45° flight line: off = sideways shift, back = held back, L = length.
    const m = (off, back, L) => {
      const hx = 38 + off * 0.707 - back * 0.707, hy = 10 + off * 0.707 + back * 0.707;
      return draw(ARC, S_ARCBOLT, along(3, 45, [hx - L * 0.707, hy + L * 0.707], [hx, hy]));
    };
    return m(-12.5, 7, 22) + m(12.5, 7, 22) + m(0, 0, 26) + orb(ARC, 11, 37, 7.5);
  })(),

  // Absolute Zero (Frost Nova + Singularity): a twelve-point ice star around an arcane vortex.
  'skill-absoluteZero': (() => {
    const A = pr('arcane');
    let s = '';
    for (let i = 0; i < 6; i++) {
      const a = -60 + 60 * i;
      s += pg(FROST.lo, place(SHARD, [24, 24], [24 + 13 * Math.cos(rad(a)), 24 + 13 * Math.sin(rad(a))], 3.6), 'thin');
    }
    for (let i = 0; i < 6; i++) {
      const a = -90 + 60 * i, tip = [24 + 21 * Math.cos(rad(a)), 24 + 21 * Math.sin(rad(a))];
      s += pg(FROST.md, place([[0.35, 0], [0.55, -1], [1, 0], [0.55, 1]], [24, 24], tip, 4.2))
        + pg(FROST.hi, place([[0.35, 0], [0.55, -1], [1, 0]], [24, 24], tip, 4.2), false);
    }
    return s + pg(FROST.hi, ngon(24, 24, 9.5, 6, -90)) + vortex(A, 24, 24, 9, { arms: 3, rot: 30, eye: 0.32, w: 0.2 });
  })(),

  // Cataclysm (Meteor + Singularity): the meteor plunging into an arcane ground vortex.
  'skill-cataclysm': (() => {
    const A = pr('arcane');
    const big = (pts) => pts.map(([x, y]) => [x * 1.08 - 0.5, y * 1.08 - 3]);
    return ell(A.lo, 24, 39, 20, 6.5)
      + vortex(A, 24, 39, 19, { arms: 4, sy: 0.32, rot: 10, eye: 0.3, w: 0.16 })
      + draw(FIRE, S_ROCK, big);
  })(),

  // Thunderhead (Blizzard + Static Field): a dark frost cloud splitting a storm bolt onto chilled ground.
  'skill-thunderhead': (() => {
    const F = pr('frost');
    return ell(F.lo, 24, 41, 17, 4.5)
      + bolt(STORM, [27, 16], [19, 42], 1.3)
      + chip(F.hi, 35, 33, 2.5) + chip(F.hi, 9, 31, 2.2)
      + cloud({ hi: F.md, md: F.lo, lo: VOID }, 24, 12, 1.25);
  })(),

  // Starfall (Cinder Bolt + Meteor): a volley of cinder bolts raining onto the ground.
  'skill-starfall':
    // One idea: a pair of cinder bolts raining down in parallel onto the ground.
    ell(FIRE.lo, 24, 41, 19, 4.5) + ell(VOID, 22, 41, 9, 2, false)
    + draw(FIRE, S_CINDER, along(2, 45, [46, 15], [28, 35], -1))
    + draw(FIRE, S_CINDER, along(2, 45, [34, 2], [10, 28], -1)),

  // Hailstorm (Ice Shard + Blizzard): a fan of ice shards over a frozen ground ellipse.
  'skill-hailstorm': (() => {
    const o = [6, 41];
    const s = (a, L) => draw(FROST, S_ICE, along(6, 46, [o[0] + 4 * Math.cos(rad(a)), o[1] + 4 * Math.sin(rad(a))],
      [o[0] + L * Math.cos(rad(a)), o[1] + L * Math.sin(rad(a))]));
    return ell(FROST.lo, 25, 41, 19, 4.5)
      + chip(FROST.hi, 41, 36, 2.4) + chip(FROST.hi, 32, 43, 2)
      + s(-78, 35) + s(-12, 35) + s(-45, 42);
  })(),

  // Tempest (Spark + Static Field): a heavy forked spark bolt with a sky strike crashing in.
  'skill-tempest':
    // Spark's star + bolt, with Static Field's sky strikes hammering the ground on both sides.
    ell(STORM.lo, 24, 41.5, 20, 4.5)
    + bolt(STORM, [12, 2], [8, 41], 1.05)
    + bolt(STORM, [43, 22], [39, 42], 0.85)
    + bolt(STORM, [31, 16], [14, 41], 1.4)
    + pg(STORM.md, '34,2 37.5,9.5 46,13 37.5,16.5 34,25 30.5,16.5 22,13 30.5,9.5')
    + pg(STORM.hi, '34,2 30.5,9.5 22,13 34,13', false)
    + pg(STORM.lo, '34,13 46,13 37.5,16.5 34,25', false),

  // ======================= DASHES (class Prime, motion left -> right) =======================
  // Phase Step: an arcane rift step: a departure rift, motes, and the arrival rift.
  'dash-blink': (() => {
    const A = pr('arcane');
    // A torn rift: jagged rim, lit upper-left edge, a void lens inside. body = rim tone.
    const rift = (x, y, h, w, body) => {
      const o = [[x, y - h], [x + w * 0.5, y - h * 0.45], [x + w * 0.25, y - h * 0.15], [x + w, y + h * 0.1], [x, y + h],
        [x - w * 0.5, y + h * 0.45], [x - w * 0.25, y + h * 0.15], [x - w, y - h * 0.1]];
      return pg(body, o) + pg(A.hi, [o[7], o[0], [x, y]], false)
        + pg(VOID, [[x, y - h * 0.68], [x + w * 0.32, y], [x, y + h * 0.68], [x - w * 0.32, y]], false);
    };
    // One idea: step out of one rift and out of the other, joined by a single swept arc.
    const arc = band(26, 33, -165, -62, 17, 17, (t) => 0.6 + 3.4 * t);
    return rift(10, 33, 11, 7, A.lo) + pg(A.md, arc) + rift(34, 24, 18, 11, A.md);
  })(),

  // Flame Dash: a burning chevron trailing flame tongues.
  'dash-flame': (() => {
    const F = pr('fire');
    return pg(F.lo, '30,10 4,13 14,18 2,24 14,30 4,35 30,38')
      + pg(F.md, '28,16 12,18 18,21.5 9,24 18,26.5 12,30 28,32', false)
      + chevron(F, 45, 24, 15, 16, 10);
  })(),

  // Glacial Slide: a frost chevron trailing blades of ice (frozen speed lines).
  'dash-frost': (() => {
    const F = pr('frost');
    return shard(F, [31, 13], [3, 15], 3) + shard(F, [31, 35], [3, 33], 3) + shard(F, [32, 24], [1, 24], 3.6)
      + chevron(F, 45, 24, 15, 16, 10);
  })(),

  // Lightning Dash: a storm chevron trailing a lightning streak.
  'dash-storm': (() => {
    const S = pr('storm');
    return bolt(S, [33, 24], [2, 27], 1.7) + chevron(S, 45, 24, 15, 16, 10);
  })(),
};
