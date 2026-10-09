// Relic icons (48-grid, Crownforge style: physical objects in bronze tri-tone --metal-lo/--metal/
// --metal-hi (+ --glass) with ONE accent: --acc (the UI sets it from the relic tag colour) or a fixed
// Prime where the relic is element-bound; 2u ink outline under the fill; flat facets lit from the
// upper-left). Every relic has its own silhouette at 24 px. See design/UI.md §Icons.
const INK = 'stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke';
const INK15 = 'stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke';
const M = 'fill:var(--metal,#8c6c43)', ML = 'fill:var(--metal-lo,#4e3a24)', MH = 'fill:var(--metal-hi,#c8a874)';
const GL = 'fill:var(--glass,#1b2030)', AC = 'fill:var(--acc,#ecd9a6)';
const P = (n, t) => `fill:var(--${n}${t ? '-' + t : ''},${({
  fire: '#ff7a33', 'fire-lo': '#b23c0e', 'fire-hi': '#ffd0a8', frost: '#7fe0ff', 'frost-lo': '#2b8fb8', 'frost-hi': '#e2f8ff',
  storm: '#ffe45c', 'storm-lo': '#b58d14', 'storm-hi': '#fff7c8', risk: '#b8324a' })[n + (t ? '-' + t : '')]})`;

const ink = (style, d, w = INK) => `<path style="${style};${w}" d="${d}"/>`;
const flat = (style, d) => `<path style="${style}" d="${d}"/>`;
const r1 = (v) => Math.round(v * 100) / 100;
const pt = (cx, cy, r, deg) => [r1(cx + Math.cos((deg * Math.PI) / 180) * r), r1(cy + Math.sin((deg * Math.PI) / 180) * r)];
/** Annulus segment (a flat lit/shadow plane on a round part), clockwise from a0 to a1 (degrees, y down). */
function band(cx, cy, ro, ri, a0, a1) {
  const span = ((a1 - a0) % 360 + 360) % 360, big = span > 180 ? 1 : 0;
  const [x0, y0] = pt(cx, cy, ro, a0), [x1, y1] = pt(cx, cy, ro, a1);
  const [x2, y2] = pt(cx, cy, ri, a1), [x3, y3] = pt(cx, cy, ri, a0);
  return `M${x0} ${y0} A${ro} ${ro} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${ri} ${ri} 0 ${big} 0 ${x3} ${y3} Z`;
}
const ring = (cx, cy, ro, ri) =>
  `M${cx - ro} ${cy} A${ro} ${ro} 0 1 0 ${cx + ro} ${cy} A${ro} ${ro} 0 1 0 ${cx - ro} ${cy} Z `
  + `M${cx - ri} ${cy} A${ri} ${ri} 0 1 1 ${cx + ri} ${cy} A${ri} ${ri} 0 1 1 ${cx - ri} ${cy} Z`;
const disk = (cx, cy, r) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const poly = (pts) => 'M' + pts.map((p) => p.join(' ')).join(' L') + ' Z';

// Gear outline: n teeth between root radius rr and tip radius rt.
function gear(cx, cy, n, rr, rt, rot = 0) {
  const out = [], step = 360 / n;
  for (let k = 0; k < n; k++) {
    const a = rot + k * step;
    out.push(pt(cx, cy, rr, a - step * 0.3), pt(cx, cy, rt, a - step * 0.17), pt(cx, cy, rt, a + step * 0.17), pt(cx, cy, rr, a + step * 0.3));
  }
  return poly(out);
}
export default {
  // Alchemist's Coil (reaction): copper coil wound round a flask's neck; frost meets fire inside.
  'relic-alchemistsCoil': `
    ${ink(GL, 'M19.5 6 H28.5 V19.5 A12 12 0 1 1 19.5 19.5 Z')}
    ${flat(P('frost'), 'M15 31 A9 9 0 0 1 33 31 L29 33.5 L24 29.5 L19 33.5 Z')}
    ${flat(P('fire'), 'M15 31 L19 33.5 L24 29.5 L29 33.5 L33 31 A9 9 0 0 1 15 31 Z')}
    ${flat(P('frost', 'hi'), 'M16 28 A9 9 0 0 1 22 22.3 L22.5 24.5 A7 7 0 0 0 18 28.8 Z')}
    ${ink(AC, 'M24 25.5 L25.4 29.6 L29.5 31 L25.4 32.4 L24 36.5 L22.6 32.4 L18.5 31 L22.6 29.6 Z', INK15)}
    ${ink(M, 'M20 2.5 H28 L28.5 6.5 H19.5 Z')}
    ${flat(MH, 'M20 2.5 H24 V6.5 H19.5 Z')}
    ${ink(M, 'M16 11.5 L32 7.5 V11 L16 15 Z')}
    ${ink(M, 'M16 18 L32 14 V17.5 L16 21.5 Z')}
    ${flat(MH, 'M16 11.5 L32 7.5 V9 L16 13 Z M16 18 L32 14 V15.5 L16 19.5 Z')}`,

  // Prism Lens (reaction): a bronze hand-loupe; a prism sits in the glass (everything happens twice).
  'relic-prismLens': `
    <g transform="rotate(45 27 20)">
      ${ink(M, 'M24 37 H30 V47 L28.5 49 H25.5 L24 47 Z')}
      ${flat(MH, 'M24 37 H26.5 V48.5 H25.5 L24 47 Z')}
      ${ink(M, 'M21.5 31 H32.5 V37.5 H21.5 Z')}
      ${flat(MH, 'M21.5 31 H25 V37.5 H21.5 Z')}
    </g>
    ${ink(M, disk(27, 20, 13.5))}
    ${flat(MH, band(27, 20, 13.5, 9.5, 155, 295))}
    ${flat(ML, band(27, 20, 13.5, 9.5, 335, 115))}
    ${ink(GL, disk(27, 20, 9.5))}
    ${ink(AC, 'M27 12.5 L33.5 25 H20.5 Z', INK15)}
    ${flat(MH, 'M20 16 L23 12.5 L24 13.5 L21.2 17 Z')}`,

  // Unstable Core (reaction): a cracked, glowing crystal in a bronze cage, leaking two energy wisps.
  'relic-unstableCore': `
    ${ink(AC, 'M30 16 Q38 15 43 4.5 Q42 14 33.5 20 Z M18 32 Q10 33 5 43.5 Q6 34 14.5 28 Z')}
    ${ink(AC, 'M24 11.5 L34 24 L24 36.5 L14 24 Z')}
    <path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round" d="M27.5 16 L25 21 L28.5 24 L26 30"/>
    ${ink(M, 'M16.5 9.5 Q5.5 24 16.5 38.5 L20 38.5 Q10.5 24 20 9.5 Z')}
    ${ink(M, 'M31.5 9.5 Q42.5 24 31.5 38.5 L28 38.5 Q37.5 24 28 9.5 Z')}
    ${flat(MH, 'M16.5 9.5 Q5.5 24 16.5 38.5 L17.5 38.5 Q8 24 18 9.5 Z')}
    ${ink(M, 'M8.5 22 H39.5 V26 H8.5 Z')}
    ${flat(MH, 'M8.5 22 H39.5 V23.3 H8.5 Z')}
    ${ink(M, 'M16 5 H32 L34 10.5 H14 Z')}
    ${flat(MH, 'M16 5 H24 V10.5 H14 Z')}
    ${ink(M, 'M14 37.5 H34 L32 43 H16 Z')}
    ${flat(ML, 'M27 37.5 H34 L32 43 H27 Z')}`,

  // Ember Heart (fire): a faceted heart of living ember in a bronze reliquary clasp.
  'relic-emberHeart': `
    ${ink(P('fire'), 'M24 14 L29 8 L35 8 L41 14 L41 22 L24 41 L7 22 L7 14 L13 8 L19 8 Z')}
    ${flat(P('fire', 'hi'), 'M13 8 L19 8 L24 14 L24 26 L7 22 L7 14 Z')}
    ${flat(P('fire', 'lo'), 'M24 26 L41 22 L24 41 Z')}
    ${ink(M, 'M17.5 4.5 H30.5 L31 8.5 L24 16.5 L17 8.5 Z')}
    ${flat(MH, 'M17.5 4.5 H24 V16 L17 8.5 Z')}`,

  // Pyre Crown (fire): a three-pointed bronze crown, each point burning like a candle.
  'relic-pyreCrown': `
    ${ink(P('fire'), 'M24 2 L28.5 9 L28 14 L24 18 L20 14 L19.5 9 Z')}
    ${ink(P('fire'), 'M8 10 L11.5 15.5 L11 20 L8 23 L5 20 L4.5 15.5 Z')}
    ${ink(P('fire'), 'M40 10 L43.5 15.5 L43 20 L40 23 L37 20 L36.5 15.5 Z')}
    <g style="${P('fire', 'hi')}"><path d="M24 2 L19.5 9 L20 14 L24 18 Z"/><path d="M8 10 L4.5 15.5 L5 20 L8 23 Z"/><path d="M40 10 L36.5 15.5 L37 20 L40 23 Z"/></g>
    ${ink(M, 'M8 33 V21 L16 29 L24 15 L32 29 L40 21 V33 Z')}
    ${flat(MH, 'M8 21 L12 25 V33 H8 Z M24 15 V33 H16 V29 Z')}
    ${flat(ML, 'M40 21 V33 H36 V25 Z')}
    ${ink(M, 'M6 32 H42 V39 L40 41 H8 L6 39 Z')}
    ${flat(MH, 'M6 32 H42 V34.5 H6 Z')}
    ${ink(P('fire'), 'M24 33.5 L28.5 36.75 L24 40 L19.5 36.75 Z', INK15)}`,

  // Rime Shard (frost): a cluster of rime crystals rising from a bronze cup.
  'relic-rimeShard': `
    ${ink(P('frost'), 'M6 18 L12.5 16 L19 36 H12 Z')}
    ${flat(P('frost', 'hi'), 'M6 18 L9 17 L15.5 36 H12 Z')}
    ${ink(P('frost'), 'M42 21 L36 19.5 L29 36 H36 Z')}
    ${flat(P('frost', 'lo'), 'M42 21 L39 20.25 L32.5 36 H36 Z')}
    ${ink(P('frost'), 'M24 3 L31.5 12 V36 H16.5 V12 Z')}
    ${flat(P('frost', 'hi'), 'M24 3 L16.5 12 V36 H21.5 V11 Z')}
    ${flat(P('frost', 'lo'), 'M24 3 L31.5 12 V36 H26.5 V11 Z')}
    ${ink(M, 'M12 35 H36 L32.5 43 H15.5 Z')}
    ${flat(MH, 'M12 35 H36 L35.2 37 H12.8 Z')}
    ${flat(ML, 'M30 37 H35.2 L32.5 43 H29 Z')}`,

  // Glacier Plate (frost): a bronze cuirass with a frost hexagon set over the heart.
  'relic-glacierPlate': `
    ${ink(M, 'M6 10 L16 6 L19.5 11 H28.5 L32 6 L42 10 L38.5 15.5 Q36 19 37 24 L35 33 L24 42 L13 33 L11 24 Q12 19 9.5 15.5 Z')}
    ${flat(MH, 'M6 10 L16 6 L19.5 11 H24 V24 H11 Q12 19 9.5 15.5 Z')}
    ${flat(ML, 'M24 24 H37 L35 33 L24 42 Z')}
    ${ink(M, 'M12.3 30 H35.7 L35 33 L24 42 L13 33 Z', INK15)}
    ${flat(ML, 'M24 30 H35.7 L35 33 L24 42 Z')}
    ${ink(P('frost'), 'M24 15.5 L30.5 19.25 V26.75 L24 30.5 L17.5 26.75 V19.25 Z')}
    ${flat(P('frost', 'hi'), 'M17.5 19.25 L24 15.5 L30.5 19.25 L24 23 Z')}
    ${flat(P('frost', 'lo'), 'M30.5 19.25 V26.75 L24 30.5 V23 Z')}`,

  // Stormglass Boots (storm): a bronze boot with a stormglass greave and a bolt spur at the heel.
  'relic-stormglassBoots': `
    ${ink(P('storm'), 'M14 13 L4 12 L9 18.5 L3 24 L14 22 Z')}
    ${flat(P('storm', 'hi'), 'M14 13 L4 12 L9 18.5 L14 17 Z')}
    ${ink(M, 'M13 5 H30 L29 25 L38 28 L43 33 V38 L41 41 H12 V27 Z')}
    ${flat(MH, 'M13 9 H17 L16.5 37 H12 V27 Z')}
    ${flat(ML, 'M36 27.4 L38 28 L43 33 V37 H36 Z')}
    ${ink(ML, 'M12 37 H43 V38 L41 41 H12 Z')}
    ${ink(M, 'M12.5 4.5 H30.5 V10 H12.5 Z')}
    ${flat(MH, 'M12.5 4.5 H30.5 V6.5 H12.5 Z')}
    ${ink(P('storm'), 'M23.5 12 L28 19 L23.5 28 L19 19 Z', INK15)}
    ${flat(P('storm', 'hi'), 'M23.5 12 L19 19 H23.5 Z')}
    ${flat(P('storm', 'lo'), 'M28 19 L23.5 28 V19 Z')}`,

  // Conductor's Ring (storm): a heavy bronze band carrying a bolt-cut storm diamond.
  'relic-conductorsRing': `
    <path style="${M};${INK};fill-rule:evenodd" d="${ring(24, 30, 13.5, 7.5)}"/>
    ${flat(MH, band(24, 30, 13.5, 7.5, 150, 250))}
    ${flat(ML, band(24, 30, 13.5, 7.5, 330, 120))}
    ${ink(M, 'M15 17 H33 L30 23 H18 Z')}
    ${flat(MH, 'M15 17 H33 L32.3 18.5 H15.7 Z')}
    ${ink(P('storm'), 'M24 2 L33.5 11 L24 20 L14.5 11 Z')}
    ${flat(P('storm', 'hi'), 'M24 2 L14.5 11 H24 Z')}
    ${flat(P('storm', 'lo'), 'M33.5 11 L24 20 V11 Z')}
    <path style="fill:var(--ink,#0c0a12)" d="M26 5.5 L21 12 H24 L22 17 L27.5 10 H24.5 L27.5 5.5 Z"/>`,

  // Glass Sigil (risk): a bronze-framed glass triangle with a cracked blood-red sigil.
  'relic-glassSigil': `
    ${ink(M, 'M24 4 L44 40 H4 Z')}
    ${flat(MH, 'M24 4 L4 40 L12.5 35 L24 14.5 Z')}
    ${flat(ML, 'M4 40 H44 L35.5 35 H12.5 Z')}
    ${ink(GL, 'M24 14.5 L35.5 35 H12.5 Z')}
    ${ink(AC, 'M24 33 L30 22.5 H18 Z', INK15)}
    <path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round" d="M34 13 L29 21 L31.5 23.5 L25.5 30"/>`,

  // Blood Pact (risk): a bronze chalice brimming over with blood.
  'relic-bloodPact': `
    ${ink(M, 'M21 23 H27 V34 H21 Z')}
    ${ink(M, 'M18 27 H30 V30.5 H18 Z')}
    ${flat(MH, 'M18 27 H30 V28.3 H18 Z')}
    ${ink(M, 'M12 42 L17 34 H31 L36 42 Z')}
    ${flat(MH, 'M17 34 H31 L31.8 35.3 H16.2 Z')}
    ${flat(ML, 'M29 35.3 H31.8 L36 42 H31 Z')}
    ${ink(M, 'M8 9 H40 L38 18 L29 25 H19 L10 18 Z')}
    ${flat(MH, 'M8 9 H15 L17 23.5 L10 18 Z')}
    ${flat(ML, 'M33 9 H40 L38 18 L29 25 L31 22 Z')}
    ${ink(P('risk'), 'M8 9 Q24 1 40 9 L39.6 11 H35 V17 L33.5 19 L32 17 V11 H19 V20 L17.5 22 L16 20 V11 H8.4 Z')}`,

  // Duelist's Mark (dodge): a parrying dagger, point up and to the right, with a marked guard.
  'relic-duelistsMark': `
    <g transform="rotate(45 24 24)">
      ${ink(M, 'M24 1 L28 11 L27 31 H21 L20 11 Z')}
      ${flat(MH, 'M24 1 L20 11 L21 31 H24 Z')}
      ${ink(ML, 'M22 34 H26 V42 H22 Z')}
      ${ink(M, 'M24 40 L28 44 L24 48 L20 44 Z')}
      ${ink(M, 'M12 29.5 H36 L34 34.5 H14 Z')}
      ${flat(MH, 'M12 29.5 H36 L35.4 31 H12.6 Z')}
      ${ink(AC, 'M24 27 L28 32 L24 37 L20 32 Z', INK15)}
    </g>`,

  // Thorned Ward (dodge): a heater shield bristling with thorns, the dodge chevron on its face.
  'relic-thornedWard': `
    ${ink(ML, 'M12.5 8 L2.5 5.5 L12 15 Z M11.5 19 L2.5 20.5 L11.5 26.5 Z M14.5 30.5 L6 39.5 L19.5 36.5 Z')}
    ${ink(ML, 'M35.5 8 L45.5 5.5 L36 15 Z M36.5 19 L45.5 20.5 L36.5 26.5 Z M33.5 30.5 L42 39.5 L28.5 36.5 Z')}
    ${ink(M, 'M12 5.5 H36 L37 21 Q36.5 32 24 42.5 Q11.5 32 11 21 Z')}
    ${flat(MH, 'M12 5.5 H24 V21 H11 Z')}
    ${flat(ML, 'M24 21 H37 Q36.5 32 24 42.5 Z')}
    ${ink(AC, 'M16 14 L24 22 L32 14 V20.5 L24 28.5 L16 20.5 Z', INK15)}`,

  // Hoarder's Lantern (economy): a bronze lantern whose flame finds what others missed.
  'relic-hoardersLantern': `
    <path style="${M};${INK};fill-rule:evenodd" d="${ring(24, 7, 5, 2.5)}"/>
    ${ink(M, 'M15 15 L19 9.5 H29 L33 15 Z')}
    ${flat(MH, 'M15 15 L19 9.5 H24 V15 Z')}
    ${ink(M, 'M14 14.5 H34 V34 H14 Z')}
    ${ink(AC, 'M17.5 18 H30.5 V31 H17.5 Z')}
    ${ink('fill:var(--rift-white,#efe9ff)', 'M24 19.5 L27.5 24.5 L27 28 L24 30 L21 28 L20.5 24.5 Z', INK15)}
    ${flat(MH, 'M14 14.5 H17.5 V34 H14 Z')}
    ${ink(M, 'M12 33 H36 L34 40 H14 Z')}
    ${flat(MH, 'M12 33 H36 L35.4 35 H12.6 Z')}
    ${flat(ML, 'M30 35 H35.4 L34 40 H30 Z')}`,

  // Rift Magnet (economy): a bronze horseshoe magnet pulling a rift shard between its poles.
  'relic-riftMagnet': `
    ${ink(M, 'M7 13 H18 V27 A6 6 0 0 0 30 27 V13 H41 V27 A17 17 0 0 1 7 27 Z')}
    ${flat(MH, 'M7 13 H11 V27 A13 13 0 0 0 11.3 30 L7.3 31 A17 17 0 0 1 7 27 Z')}
    ${flat(ML, band(24, 27, 17, 12, 0, 100))}
    ${ink(AC, 'M7 7 H18 V13 H7 Z M30 7 H41 V13 H30 Z')}
    ${ink(AC, 'M24 6 L28 13 L24 21 L20 13 Z', INK15)}`,

  // Echo Stone (cast): a set stone whose sound comes back on both sides.
  'relic-echoStone': `
    ${ink(M, 'M10 13 L13 15 L7.5 24 L13 33 L10 35 L3.5 24 Z')}
    ${ink(M, 'M38 13 L35 15 L40.5 24 L35 33 L38 35 L44.5 24 Z')}
    ${ink(M, 'M24 5 L37 24 L24 43 L11 24 Z')}
    ${flat(MH, 'M24 5 L11 24 H16.5 L24 13 Z')}
    ${flat(ML, 'M37 24 L24 43 V35 L31.5 24 Z')}
    ${ink(AC, 'M24 13 L31.5 24 L24 35 L16.5 24 Z', INK15)}`,

  // Overclock (cast): an eight-toothed cog (every 8th cast) round a clock face, hands racing.
  'relic-overclock': `
    ${ink(M, gear(24, 24, 8, 15, 20, 0))}
    ${flat(MH, band(24, 24, 15, 10.5, 160, 290))}
    ${flat(ML, band(24, 24, 15, 10.5, 340, 110))}
    ${ink(AC, disk(24, 24, 10.5))}
    <g transform="rotate(35 24 24)">${ink(ML, 'M24 14 L27.8 19 L26 25.5 H22 L20.2 19 Z', INK15)}</g>
    <g transform="rotate(125 24 24)">${ink(ML, 'M24 17 L27.2 20.5 L26 25.5 H22 L20.8 20.5 Z', INK15)}</g>
    ${ink(MH, disk(24, 24, 2.5), INK15)}`,

  // Second Wind (safety): a white feather charm on a bronze ring. Not yet.
  'relic-secondWind': `
    <g transform="rotate(-40 24 24)">
      <path style="${M};${INK};fill-rule:evenodd" d="${ring(24, 43, 4.2, 2)}"/>
      ${ink(M, 'M22.5 36 H25.5 V40 H22.5 Z')}
      ${ink(AC, 'M26 1 L31 6 L33.5 13 L30.5 15.5 L34 19 L33 26 L30 28 L31.5 31 L26.5 37 H22.5 L18 33 L16 27.5 L18.5 25 L15 20.5 L15.5 14 L18.5 11.5 L18 7.5 Z')}
      ${flat(MH, 'M26 1 L18 7.5 L18.5 11.5 L15.5 14 L15 20.5 L18.5 25 L16 27.5 L18 33 L22.5 37 H23.6 L24.4 6 Z')}
      ${flat(ML, 'M25.6 5 L25.2 37 H22.8 L24.4 6 Z')}
      ${ink(M, 'M21 35.5 H27 V39.5 H21 Z')}
    </g>`,
};
