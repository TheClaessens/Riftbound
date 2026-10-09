// Reaction icons (48-grid, Crownforge style): the two element gem SHAPES colliding, with the burst
// of the reaction between them, in fixed Prime vars (never --el: a reaction is always the same
// pair). Gem shapes are the el-* vocabulary from set-misc.js (fire = flame-cut gem, frost = hexagon,
// storm = bolt-cut diamond, arcane = 4-point star), scaled down; the 2u ink stays 2u because the
// points are transformed in JS, not with an SVG transform. See design/UI.md §Icons.
const INK = 'stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke';
const HEX = {
  fire: ['#b23c0e', '#ff7a33', '#ffd0a8'], frost: ['#2b8fb8', '#7fe0ff', '#e2f8ff'],
  storm: ['#b58d14', '#ffe45c', '#fff7c8'], arcane: ['#6d3fc0', '#c08cff', '#e6d2ff'],
};
const f = (P, t) => `fill:var(--${P}${t === 0 ? '-lo' : t === 2 ? '-hi' : ''},${HEX[P][t]})`;
const WHITE = 'fill:var(--rift-white,#efe9ff)';

// el-* gem geometry on the 48 grid, centred on 24,24: outer, lit plane, shadow plane (+ storm bolt).
const GEM = {
  fire: { o: [[24, 3], [37, 21], [39, 31], [33, 40], [24, 45], [15, 40], [9, 31], [11, 21]],
    hi: [[24, 3], [11, 21], [9, 31], [24, 25]], lo: [[24, 25], [39, 31], [33, 40], [24, 45]] },
  frost: { o: [[24, 3], [42, 13.5], [42, 34.5], [24, 45], [6, 34.5], [6, 13.5]],
    hi: [[6, 13.5], [24, 3], [42, 13.5], [24, 24]], lo: [[42, 13.5], [42, 34.5], [24, 45], [24, 24]] },
  storm: { o: [[24, 3], [44, 24], [24, 45], [4, 24]],
    hi: [[24, 3], [4, 24], [24, 24]], lo: [[44, 24], [24, 45], [24, 24]],
    bolt: [[28, 9], [17, 26], [24, 26], [20, 39], [32, 21], [25, 21], [30, 9]] },
  arcane: { o: [[24, 2], [29.5, 18.5], [46, 24], [29.5, 29.5], [24, 46], [18.5, 29.5], [2, 24], [18.5, 18.5]],
    hi: [[24, 2], [18.5, 18.5], [2, 24], [24, 24]], lo: [[24, 24], [46, 24], [29.5, 29.5], [24, 46]] },
};
const r1 = (v) => Math.round(v * 10) / 10;
const pts = (list, cx, cy, s) => list.map(([x, y]) => `${r1(cx + (x - 24) * s)},${r1(cy + (y - 24) * s)}`).join(' ');

/** One element gem at (cx, cy), scale s (1 = the 42-unit el-* gem). */
function gem(P, cx, cy, s) {
  const g = GEM[P];
  return `<polygon style="${f(P, 1)};${INK}" points="${pts(g.o, cx, cy, s)}"/>`
    + `<polygon style="${f(P, 2)}" points="${pts(g.hi, cx, cy, s)}"/>`
    + `<polygon style="${f(P, 0)}" points="${pts(g.lo, cx, cy, s)}"/>`
    + (g.bolt ? `<polygon style="fill:var(--ink,#0c0a12)" points="${pts(g.bolt, cx, cy, s)}"/>` : '');
}

/** Collision flare: an n-ray star whose two rays along the anti-diagonal (upper-right / lower-left)
 *  are long, so the flash shoots out perpendicular to the impact and fills the empty corners. */
function flare(style, n, long, short, ri) {
  const out = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -45 + (i * 180) / n, rad = (a * Math.PI) / 180;
    const r = i % 2 ? ri : (i / 2) % (n / 2) === 0 ? long : short;
    out.push(`${r1(24 + Math.cos(rad) * r)},${r1(24 + Math.sin(rad) * r)}`);
  }
  return `<polygon style="${style};${INK}" points="${out.join(' ')}"/>`;
}

const P2 = (r, deg) => [r1(24 + Math.cos((deg * Math.PI) / 180) * r), r1(24 + Math.sin((deg * Math.PI) / 180) * r)];
/** Overload: a big irregular starburst (12 jagged rays of uneven length). */
function jagged(style) {
  const R = [15, 9, 12.5, 8, 16, 9.5, 11, 8.5, 15.5, 9, 12, 8];
  const out = [];
  R.forEach((r, i) => { const a = -45 + i * 30; out.push(P2(r, a), P2(4.5, a + 15)); });
  return `<polygon style="${style};${INK}" points="${out.map((p) => p.join(',')).join(' ')}"/>`;
}
/** Combust: a three-tongued flame bursting out of the impact, thrown toward the upper-right. */
const tongues = (style, coreStyle) => `<g transform="rotate(45 24 24)">`
  + `<path style="${style};${INK}" d="M24 38 Q14 36 14 27 Q14 21 18 17 Q18 22 21 23.5 Q19 14 25.5 5 Q25.5 15 29.5 18.5 Q31 15 30 11 Q35 17 34 27 Q33 37 24 38 Z"/>`
  + `<path style="${coreStyle}" d="M24 34.5 Q19 33.5 19 28.5 Q19 25 22 23 Q22.5 26 24.5 26.5 Q24 21 27 17.5 Q27.5 22 29.5 24.5 Q30.5 29 29 31.5 Q27.5 34.5 24 34.5 Z"/></g>`;
/** Arc Flash: two zig-zag lightning rays thrown out along the anti-diagonal + a white stun core. */
const RAY = 'M21.8 21.5 L27.2 13.5 H24.6 L27.8 3 L19.8 15.5 H22.4 L19.2 21.5 Z';
const rays = (style) => `<g style="${style};${INK}"><path transform="rotate(45 24 24)" d="${RAY}"/><path transform="rotate(225 24 24)" d="${RAY}"/>`
  + `<circle cx="24" cy="24" r="5"/></g>`;
// Layout: gem A upper-left, gem B lower-right (the impact axis); the flare crosses it.
const S = 0.58, AX = 15, AY = 15, BX = 33, BY = 33;
// Shatter: the hexagon split along the line of impact (upper-left vertex → lower-right vertex).
const SH_U = [[6, 13.5], [24, 3], [42, 13.5], [42, 34.5], [30, 26], [22, 20], [18, 22]];
const SH_L = [[6, 13.5], [18, 22], [22, 20], [30, 26], [42, 34.5], [24, 45], [6, 34.5]];
const pair = (A, B, mid) => gem(A, AX, AY, S) + gem(B, BX, BY, S) + mid;
const CLOUD = [[34, 14, 4.5], [14, 34, 4.5], [29.5, 18.5, 5.5], [18.5, 29.5, 5.5], [24, 24, 7.5]];
const cloud = (style) => CLOUD.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 1}" style="fill:var(--ink,#0c0a12)"/>`).join('')
  + CLOUD.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" style="${style}"/>`).join('');

export default {
  // Steam Burst (fire + frost): a scalding cloud billowing out between flame gem and hexagon.
  'react-steam': pair('fire', 'frost',
    cloud(WHITE)
    + `<path style="fill:var(--frost-hi,#e2f8ff)" d="M31.5 24 A7.5 7.5 0 0 1 24 31.5 V28.5 A4.5 4.5 0 0 0 28.5 24 Z"/>`),
  // Overload (fire + storm): the big one — a wide, jagged twelve-ray detonation.
  'react-overload': pair('fire', 'storm', jagged(f('storm', 2))),
  // Superconduct (frost + storm): a cold six-ray spark (hex symmetry) arcing across.
  'react-superconduct': pair('frost', 'storm', flare(f('frost', 2), 6, 13.5, 7.5, 4)),
  // Shatter (arcane on frozen): the arcane star strikes the hexagon, which splits apart; shards fly.
  'react-shatter': `
    <polygon style="${f('frost', 1)};${INK}" points="${pts(SH_U, BX + 1.8, BY - 1.8, S)}"/>
    <polygon style="${f('frost', 2)}" points="${pts([[6, 13.5], [24, 3], [42, 13.5], [22, 20], [18, 22]], BX + 1.8, BY - 1.8, S)}"/>
    <polygon style="${f('frost', 0)}" points="${pts([[42, 13.5], [42, 34.5], [30, 26]], BX + 1.8, BY - 1.8, S)}"/>
    <polygon style="${f('frost', 1)};${INK}" points="${pts(SH_L, BX - 1.8, BY + 1.8, S)}"/>
    <polygon style="${f('frost', 0)}" points="${pts([[30, 26], [42, 34.5], [24, 45], [24, 24.5]], BX - 1.8, BY + 1.8, S)}"/>
    <g style="${f('frost', 2)};${INK}"><polygon points="37,5 44,4 41,11"/><polygon points="7,35 11,40 4,43"/></g>
    ${gem('arcane', AX + 1.5, AY + 1.5, S)}`,
  // Combust (arcane on burning): the star detonates the flame gem — a burst of licking flame tongues.
  'react-combust': pair('arcane', 'fire', tongues(f('fire', 2), f('fire', 1))),
  // Arc Flash (arcane on shocked): a white stun flash throwing zig-zag lightning rays.
  'react-arcflash': pair('arcane', 'storm', rays(WHITE)),
};
