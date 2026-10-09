// Raid (v5) icons: Rift Obelisks, Poise / Downed / Exposed / Break Check, boss affixes, boss-fight buffs
// and fight objects. Crownforge style (design/UI.md §Icons): 48-grid, 3 flat tones + ink outline under the fill,
// lit from the upper-left, colours through CSS custom properties with literal fallbacks.
//   ui-obelisk (= ui-crownshard)   the Crownshard: a faceted floating prism with a broken crown band
//   ui-obeliskHaste|Echo|Wrath     pact sigils (ids kept from v5): hourglass / twin rings / ember crown
//   ui-stagger, ui-downed, ui-exposed, ui-breakCheck   steel-white (#e8eef8 family) = poise; gold = a damage window
//   ui-affix (generic), ui-affixFrenzied|Bulwark|Reverb|Storm|Vengeful   boss affix sigils (def.icon = 'affixX')
//   ui-generator   a ward-stone on a pedestal (banner / conduit / pod edge marker)
//   buff-spores|sap|strain|rooted, ui-buff (generic fallback for unknown buff ids)
const INK = 'stroke:var(--ink,#0c0a12);stroke-width:2;stroke-linejoin:round;paint-order:stroke';
const INK_T = 'stroke:var(--ink,#0c0a12);stroke-width:1.5;stroke-linejoin:round;paint-order:stroke';
const F = (v, hex) => `fill:var(--${v},${hex})`;
const path = (style, d, ink = INK) => `<path style="${style}${ink ? ';' + ink : ''}" d="${d}"/>`;
const flat = (style, d) => `<path style="${style}" d="${d}"/>`;

const r2 = (n) => Math.round(n * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const D = (pts) => 'M' + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join('L') + 'Z';
const ngon = (cx, cy, r, n, a0 = -90) =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rad(a0 + (360 / n) * i)), cy + r * Math.sin(rad(a0 + (360 / n) * i))]);
/** Curved band (no head) from angle a0 to a1 (deg, clockwise on screen), centre radius r, width w. */
function arcBand(cx, cy, r, w, a0, a1, n = 10) {
  const o = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    o.push([cx + (r + w / 2) * Math.cos(a), cy + (r + w / 2) * Math.sin(a)]);
    inn.unshift([cx + (r - w / 2) * Math.cos(a), cy + (r - w / 2) * Math.sin(a)]);
  }
  return [...o, ...inn];
}
const ring = (cx, cy, ro, ri, n = 28) => `${D(ngon(cx, cy, ro, n))} ${D(ngon(cx, cy, ri, n).reverse())}`;

// ---- palette -------------------------------------------------------------------------------
const trio = (id, lo, md, hi) => ({ lo: F(`${id}-lo`, lo), md: F(id, md), hi: F(`${id}-hi`, hi) });
const STORM = trio('storm', '#b58d14', '#ffe45c', '#fff7c8');
const ARCANE = trio('arcane', '#6d3fc0', '#c08cff', '#e6d2ff');
const FIRE = trio('fire', '#b23c0e', '#ff7a33', '#ffd0a8');
const FROST = trio('frost', '#2b8fb8', '#7fe0ff', '#e2f8ff');
const STEEL = { lo: F('steel-lo', '#6e7a94'), md: F('steel', '#c4cee0'), hi: F('steel-hi', '#ffffff') };
const SAND = { lo: F('exposed-lo', '#b9801a'), md: F('exposed', '#ffc340'), hi: F('exposed-hi', '#fff0b8') };
const M_LO = F('metal-lo', '#4e3a24'), M_MD = F('metal', '#8c6c43'), M_HI = F('metal-hi', '#c8a874');
const GILT = F('cf-gilt', '#ecd9a6'), VOID = F('ink', '#0c0a12');
const IRON_LO = F('cf-plate-1', '#1c1826'), IRON = F('cf-plate-2', '#262033'), IRON_HI = F('cf-plate-3', '#332b44');
const BONE = F('cf-text', '#f2ece0'), BONE_LO = F('cf-dim', '#b9b0c4');
const ROCK_HI = F('cf-faint', '#8a8199'), ROCK = F('phys-lo', '#6b6378'), ROCK_LO = F('rock-lo', '#4a4456');
const HP = F('hp', '#e8413a'), HP_HI = F('hp-hi', '#ff8a6a'), HP_LO = F('hp-lo', '#7a1418');

// =============================================================================================
//  The Crownshard + the three pact sigils (v6). The shard is a faceted floating prism tine in Rift
//  violet with a broken crown band (bronze) around its waist. The sigils are NOT pillars:
//    Haste = hourglass (pale cyan sand)      Echo = twin interlocked rings (violet + teal)
//    Wrath = ember crown with three lit notches
// =============================================================================================
/** Elliptical band (centre, radii, thickness w), angles in degrees: 0 = right, 90 = front (down), clockwise. */
function ellBand(cx, cy, rx, ry, w, a0, a1, n = 12) {
  const o = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), c = Math.cos(a), s = Math.sin(a);
    o.push([cx + (rx + w / 2) * c, cy + (ry + w * 0.36) * s]);
    inn.unshift([cx + (rx - w / 2) * c, cy + (ry - w * 0.36) * s]);
  }
  return D([...o, ...inn]);
}
/** A crown tine standing on the band at angle a (base half-width 2.9, height h). */
function tine(cx, cy, rx, ry, a, h = 10) {
  const x = cx + rx * Math.cos(rad(a)), y = cy + ry * Math.sin(rad(a)) - 1.2;
  return D([[x - 2.9, y + 2.2], [x - 0.6, y - h], [x + 2.9, y + 2.2]]);
}
/** Open polyline along a circle (for ink edges). */
const arcLine = (cx, cy, r, a0, a1, n = 8) => 'M' + Array.from({ length: n + 1 }, (_, k) => {
  const a = rad(a0 + ((a1 - a0) * k) / n);
  return `${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`;
}).join('L');

const SHARD_C = trio('arcane', '#6d3fc0', '#c08cff', '#e6d2ff');
const SC = { x: 24, y: 29, rx: 18.5, ry: 5.4 };
const CROWNSHARD =
  // back half of the crown band, with two tines standing out beside the prism
  path(M_MD, ellBand(SC.x, SC.y, SC.rx, SC.ry, 4.2, 196, 344))
  + path(M_MD, tine(SC.x, SC.y, SC.rx, SC.ry, 214)) + path(M_MD, tine(SC.x, SC.y, SC.rx, SC.ry, 326, 12))
  // the prism: ridge down the middle, left face lit, right face in shadow
  + path(SHARD_C.md, 'M24 2L34 14.5L30.4 33.6L24 42.5L17.6 33.6L14 14.5Z')
  + flat(SHARD_C.hi, 'M24 2L14 14.5L17.6 33.6L24 42.5V14.5Z')
  + flat(SHARD_C.lo, 'M24 2L34 14.5L30.4 33.6L24 42.5V14.5Z')
  + flat(F('rift-white', '#efe9ff'), 'M24 2L14 14.5H24Z')
  + flat(SHARD_C.md, 'M24 14.5H14L17.6 33.6L24 25Z')
  // front half of the band: broken (a gap at the front-right), so it reads as a shattered crown
  + path(M_HI, ellBand(SC.x, SC.y, SC.rx, SC.ry, 4.6, 100, 188))
  + path(M_HI, ellBand(SC.x, SC.y, SC.rx, SC.ry, 4.6, -12, 54))
  + flat(GILT, ellBand(SC.x, SC.y - 0.9, SC.rx, SC.ry, 1.5, 110, 184, 8))
  + flat(GILT, ellBand(SC.x, SC.y - 0.9, SC.rx, SC.ry, 1.5, -8, 50, 6))
  // a chip of the crown drifting loose in the gap
  + path(M_MD, 'M27.6 38.6L31.4 37.2L32.8 40.6L28.8 41.8Z', INK_T);

const SIGIL_HASTE_C = trio('haste', '#6fb4cc', '#bfefff', '#f0fcff');
const WHITE = F('rift-white', '#ffffff');
const SIGIL_HASTE =
  // the glass, then the sand, then the bronze caps
  path(F('haste-glass', '#5aa3bf'), 'M12 8H36L26.4 24L36 40H12L21.6 24Z')
  + flat(SIGIL_HASTE_C.lo, 'M12 8H20.4L24 14.4L21.6 24L12 40V8Z')
  + flat(F('haste-deep', '#2f6f8a'), 'M36 8L26.4 24L36 40V8Z')
  + flat(WHITE, 'M16.6 13.4H31.4L25.6 22.4H22.4Z')
  + flat(SIGIL_HASTE_C.hi, 'M23.2 24H24.8V33.4H23.2Z')
  + flat(WHITE, 'M15.6 39.4L24 31.4L32.4 39.4Z')
  + path(M_HI, 'M8.5 3H39.5V8.5H8.5Z') + flat(GILT, 'M8.5 3H39.5V4.8H8.5Z') + flat(M_LO, 'M24 8.5H39.5V3H24Z')
  + path(M_HI, 'M8.5 39.5H39.5V45H8.5Z') + flat(GILT, 'M8.5 39.5H39.5V41.3H8.5Z') + flat(M_LO, 'M24 45H39.5V39.5H24Z');

const SIGIL_ECHO_V = trio('arcane', '#6d3fc0', '#c08cff', '#e6d2ff');
const SIGIL_ECHO_T = { lo: F('echo-lo', '#1e9c86'), md: F('echo', '#4ff0d0'), hi: F('echo-hi', '#c4fff4') };
const echoRing = (cx, T) =>
  `<path fill-rule="evenodd" style="${T.md};${INK}" d="${ring(cx, 24, 14, 8, 30)}"/>`
  + flat(T.hi, D(arcBand(cx, 24, 11, 2.6, 196, 262)))
  + flat(T.lo, D(arcBand(cx, 24, 11, 2.6, 16, 82)));
const SIGIL_ECHO = echoRing(18, SIGIL_ECHO_V) + echoRing(30, SIGIL_ECHO_T)
  // the violet ring passes over the teal one at the top crossing: the rings are linked
  + flat(SIGIL_ECHO_V.md, D(arcBand(18, 24, 11, 6, -82, -32, 8)))
  + `<path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:2" d="${arcLine(18, 24, 15, -80, -34)}${arcLine(18, 24, 7, -80, -34)}"/>`
  + flat(SIGIL_ECHO_V.hi, D(arcBand(18, 24, 11, 2.2, -78, -50, 6)));

const NOTCH = (x) => path(FIRE.hi, `M${x} 32.6L${x + 3.6} 36L${x} 39.4L${x - 3.6} 36Z`, INK_T)
  + flat(F('rift-white', '#fff4d2'), `M${x} 33.8L${x + 1.6} 36L${x} 38.2L${x - 1.6} 36Z`);
const SIGIL_WRATH =
  // crown silhouette: three flame tines over a band
  path(FIRE.md, 'M7 41V12C10 14 13 18 16 25C17 16 22 12 24 3C26 12 31 16 32 25C35 18 38 14 41 12V41Z')
  + flat(FIRE.hi, 'M7 12C10 14 13 18 16 25H7Z') + flat(FIRE.hi, 'M24 3C22 12 17 16 16 25H24Z')
  + flat(FIRE.lo, 'M41 12C38 14 35 18 32 25H41Z') + flat(FIRE.lo, 'M24 3C26 12 31 16 32 25H24Z')
  + flat(FIRE.lo, 'M7 31H41V41H7Z') + flat(FIRE.md, 'M7 31H41V33H7Z')
  // three lit notches in the band: the three Heat steps
  + NOTCH(14) + NOTCH(24) + NOTCH(34);

// =============================================================================================
//  Poise family. Steel-white = stagger; gold = Exposed.
// =============================================================================================
const SHIELD = 'M24 3.5L40.5 8.5V25C40.5 33.5 33.5 40.5 24 45C14.5 40.5 7.5 33.5 7.5 25V8.5Z';
const STAGGER = path(STEEL.md, SHIELD)
  + flat(STEEL.hi, 'M24 3.5L7.5 8.5V25C7.5 29 9.2 32.8 12 36L24 33V3.5Z')
  + flat(STEEL.lo, 'M24 3.5L40.5 8.5V25C40.5 33.5 33.5 40.5 24 45L24 33Z')
  + flat(IRON_HI, 'M24 11.5L33.5 14.4V25C33.5 30 29.6 34.4 24 37.6C18.4 34.4 14.5 30 14.5 25V14.4Z')
  // the crack through the boss's poise
  + flat(STEEL.md, 'M28.4 14.4L24.6 22.2L29.6 24L23 36L25 26.4L20.4 24.6L26 14.4Z')
  + `<path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:1;stroke-linejoin:round" d="M28.4 14.4L24.6 22.2L29.6 24L23 36L25 26.4L20.4 24.6L26 14.4"/>`;

const DOWNED = path(STEEL.md, 'M17 4H31V19H40L24 37L8 19H17Z')
  + flat(STEEL.hi, 'M17 4H24V37L8 19H17Z')
  + flat(STEEL.lo, 'M31 4V19H40L24 37V19Z')
  + path(M_MD, 'M5 40H43L40 45H8Z') + flat(M_HI, 'M5 40H43L42.4 41.6H5.6Z')
  + path(STEEL.hi, 'M8.5 29L10.2 32.8L14 34.5L10.2 36.2L8.5 40L6.8 36.2L3 34.5L6.8 32.8Z', INK_T)
  + path(STEEL.hi, 'M39.5 29L41.2 32.8L45 34.5L41.2 36.2L39.5 40L37.8 36.2L34 34.5L37.8 32.8Z', INK_T);

const EXPOSED = `<path fill-rule="evenodd" style="${SAND.md};${INK}" d="${ring(24, 24, 18, 12.4)}"/>`
  + flat(SAND.hi, 'M8.2 14.5A18 18 0 0 1 24 6V11.6A12.4 12.4 0 0 0 13.6 17.5Z')
  + path(SAND.md, 'M22.2 2H25.8V9H22.2Z', INK_T) + path(SAND.md, 'M22.2 39H25.8V46H22.2Z', INK_T)
  + path(SAND.md, 'M2 22.2H9V25.8H2Z', INK_T) + path(SAND.md, 'M39 22.2H46V25.8H39Z', INK_T)
  + path(BONE, 'M24 16L29 24L24 32L19 24Z', INK_T) + flat(SAND.hi, 'M24 16L19 24H24Z')
  + flat(SAND.lo, 'M24 24H29L24 32Z');

const BREAK = `<g>${path(STEEL.md, D(arcBand(24, 24, 15.5, 6.4, 128, 232)))}${path(STEEL.md, D(arcBand(24, 24, 15.5, 6.4, 308, 412)))}</g>`
  + flat(STEEL.hi, D(arcBand(24, 24, 17.2, 2.4, 128, 232)))
  + flat(STEEL.hi, D(arcBand(24, 24, 17.2, 2.4, 308, 412)))
  + path(M_HI, D(arcBand(24, 24, 15.5, 4, 244, 296, 6)), INK_T)
  + path(SAND.md, 'M29.6 4L15.4 26.2H23.2L17.6 44L33.6 20.6H25.4Z') + flat(SAND.hi, 'M29.6 4L15.4 26.2H23.2L25.2 19.4Z')
  + flat(SAND.lo, 'M33.6 20.6L17.6 44L21.4 29.6H25.4Z');

// =============================================================================================
//  Boss affixes. One bold sigil each, in the affix's own hue on a dark ground-tone.
// =============================================================================================
const AFFIX_FRENZIED = path(HP, 'M24 2L29 13L41 8L36 20L46 25L35 30L39 42L27 37L24 46L21 37L9 42L13 30L2 25L12 20L7 8L19 13Z')
  + flat(HP_HI, 'M24 2L19 13L7 8L12 20L2 25L13 30L24 25Z')
  + flat(HP_LO, 'M46 25L35 30L39 42L27 37L24 46L24 25Z')
  + path(BONE, 'M26.6 11L16 26.4H22.6L19.4 38L32 21.6H25.2Z', INK_T) + flat(BONE_LO, 'M32 21.6L19.4 38L22.6 26.4H25.2Z');

const AFFIX_BULWARK = path(M_MD, 'M7 5H41V26C41 34 33.6 40.6 24 45C14.4 40.6 7 34 7 26Z')
  + flat(M_HI, 'M7 5H24V45C14.4 40.6 7 34 7 26Z') + flat(M_LO, 'M24 5H41V26C41 34 33.6 40.6 24 45Z')
  + path(IRON, 'M12 10H36V25.6C36 31 30.6 35.6 24 39C17.4 35.6 12 31 12 25.6Z', INK_T)
  + flat(IRON_HI, 'M12 10H24V39C17.4 35.6 12 31 12 25.6Z')
  + path(M_HI, 'M24 15L30 18.6V25L24 29.4L18 25V18.6Z', INK_T) + flat(M_MD, 'M24 15L30 18.6V25L24 29.4Z')
  + `<g style="${GILT};stroke:var(--ink,#0c0a12);stroke-width:1;paint-order:stroke"><circle cx="11" cy="9.4" r="1.9"/><circle cx="37" cy="9.4" r="1.9"/></g>`;

const AFFIX_REVERB = `<path fill-rule="evenodd" style="${ARCANE.lo};${INK_T}" d="${ring(24, 24, 21, 16.4, 36)}"/>`
  + `<path fill-rule="evenodd" style="${ARCANE.md};${INK_T}" d="${ring(24, 24, 14, 9.6, 32)}"/>`
  + flat(ARCANE.hi, D(arcBand(24, 24, 11.8, 2, 180, 270, 8)))
  + path(ARCANE.hi, 'M24 16.4L31.6 24L24 31.6L16.4 24Z', INK_T) + flat(BONE, 'M24 16.4L16.4 24H24Z')
  + flat(ARCANE.md, 'M24 24H31.6L24 31.6Z');

const AFFIX_STORM = path(IRON_HI, 'M13 34A9.6 9.6 0 0 1 11.4 15.2A11.6 11.6 0 0 1 33.6 12.6A9 9 0 0 1 36 34Z')
  + flat(ROCK, 'M13 34A9.6 9.6 0 0 1 11.4 15.2A11.6 11.6 0 0 1 24 8V34Z')
  + path(STORM.md, 'M28 22L17.4 34.6H23.4L19.6 46L32 30.6H25.6Z', INK_T)
  + flat(STORM.hi, 'M28 22L17.4 34.6H23.4L25.8 30.6Z') + flat(STORM.lo, 'M32 30.6L19.6 46L23.4 34.6H25.6Z');

const AFFIX_VENGEFUL = path(STEEL.md, 'M21.4 2H26.6L27.6 26H20.4Z')
  + flat(STEEL.hi, 'M21.4 2H24V26H20.4Z') + flat(STEEL.lo, 'M24 2H26.6L27.6 26H24Z')
  + path(M_MD, 'M13 26H35V30.4H13Z') + flat(M_HI, 'M13 26H35V28H13Z')
  + path(M_LO, 'M21.4 30.4H26.6V38.4H21.4Z') + path(M_MD, 'M19 38.4H29V43H19Z')
  + flat(HP, 'M24 6C26.4 9.4 27.4 11.6 27 13.6C26.7 15.2 25.5 16 24 16C22.5 16 21.3 15.2 21 13.6C20.6 11.6 21.6 9.4 24 6Z')
  + `<path style="fill:none;stroke:var(--ink,#0c0a12);stroke-width:1;stroke-linejoin:round" d="M24 6C26.4 9.4 27.4 11.6 27 13.6C26.7 15.2 25.5 16 24 16C22.5 16 21.3 15.2 21 13.6C20.6 11.6 21.6 9.4 24 6Z"/>`
  + flat(HP_HI, 'M24 7.6C22.8 9.8 22.2 11.4 22.4 12.6L24 13Z');

const AFFIX = path(M_MD, 'M24 3L43 24L24 45L5 24Z') + flat(M_HI, 'M24 3L5 24H24Z') + flat(M_LO, 'M24 24H43L24 45Z')
  + path(IRON, 'M24 11L36 24L24 37L12 24Z', INK_T)
  + flat(VOID, 'M22.4 15.4H25.6V26H22.4Z M22.4 28.4H25.6V31.6H22.4Z') + flat(GILT, 'M22.9 16H25.1V25.4H22.9Z M22.9 29H25.1V31H22.9Z');

// =============================================================================================
//  Fight object (generator) edge-marker icon: a ward-stone on a bronze pedestal.
// =============================================================================================
const GENERATOR = path(M_MD, 'M9 44V39L13 35H35L39 39V44Z') + flat(M_HI, 'M9 44V39L13 35H24V44Z')
  + path(M_LO, 'M21.4 35H26.6V30H21.4Z', INK_T)
  + path(ARCANE.md, 'M24 3L34 16L30.4 29H17.6L14 16Z') + flat(ARCANE.hi, 'M24 3L14 16L17.6 29H24Z')
  + flat(ARCANE.lo, 'M24 3L34 16L30.4 29H24Z')
  + flat(BONE, 'M22 9L19 16L21 17L23.2 11Z');

// =============================================================================================
//  Buffs used by boss scripts (resolved by buff id: buff-<id>), plus a generic fallback.
// =============================================================================================
const SPORE_G = trio('spore', '#4f8f12', '#b8ff3c', '#eaffb0');
const BUFF_SPORES = path(SPORE_G.md, 'M24 8C31 8 37 13 37 20C41 21 44 24.4 44 28.4C44 33.4 39.8 37 34.6 37H13.4C8.2 37 4 33.4 4 28.4C4 24.4 7 21 11 20C11 13 17 8 24 8Z')
  + flat(SPORE_G.hi, 'M24 8C17 8 11 13 11 20C7 21 4 24.4 4 28.4C4 31 5.2 33.2 7 34.8L24 34V8Z')
  + flat(SPORE_G.lo, 'M37 20C41 21 44 24.4 44 28.4C44 33.4 39.8 37 34.6 37H24V32C29 31 33 26 33 20Z')
  + `<g style="${SPORE_G.hi};stroke:var(--ink,#0c0a12);stroke-width:1.2;paint-order:stroke"><circle cx="12" cy="42" r="2.6"/><circle cx="24" cy="44" r="2.2"/><circle cx="35" cy="42" r="2.6"/><circle cx="18" cy="38.4" r="1.6"/><circle cx="30" cy="39" r="1.6"/></g>`;

const SAP_G = trio('sap', '#b9801a', '#ffd86a', '#fff6cf');
const BUFF_SAP = path(SAP_G.md, 'M24 3C29 10 38 18 38 29C38 37.4 31.8 44 24 44C16.2 44 10 37.4 10 29C10 18 19 10 24 3Z')
  + flat(SAP_G.hi, 'M24 3C19 10 10 18 10 29C10 36 14.4 41.4 20 43.2L24 29V3Z')
  + flat(SAP_G.lo, 'M38 29C38 37.4 31.8 44 24 44L24 36C28.4 34 32 30 33 24C36 25.4 38 26.8 38 29Z')
  + path(BONE, 'M17 25C17 22 18.6 19.6 20.4 17.6C20.4 20 21.4 21.4 21.4 23.4C21.4 25.4 19.6 27 18 27C17.4 27 17 26.2 17 25Z', INK_T)
  + path(F('sap-hi', '#fff6cf'), 'M30 11L31 14L34 15L31 16L30 19L29 16L26 15L29 14Z', INK_T);

const STRAIN_G = trio('strain', '#6d3fc0', '#b08cff', '#e6d2ff');
const BUFF_STRAIN = path(STRAIN_G.md, 'M10 12H38L42 20H36C34 22 32.4 24.6 31.8 28H33L36 36H12L15 28H16.2C15.6 24.6 14 22 12 20H6Z')
  + flat(STRAIN_G.hi, 'M10 12H24V36H12L15 28H16.2C15.6 24.6 14 22 12 20H6Z')
  + flat(STRAIN_G.lo, 'M24 12H38L42 20H36C34 22 32.4 24.6 31.8 28H33L36 36H24Z')
  + path(M_MD, 'M7 36H41L44 42V45H4V42Z') + flat(M_HI, 'M7 36H41L42 38H6Z')
  + path(BONE, 'M24 14L28 19.6H25.6V25H22.4V19.6H20Z', INK_T);

const ROOT_G = trio('root', '#4a3a18', '#8a6a2c', '#c6a458');
const BUFF_ROOTED = path(F('root-lo', '#3b2c12'), 'M4 40H44V45H4Z')
  + path(ROOT_G.md, 'M6 40C6 30 10 22 16 18C14 22 15.4 26 18.4 26C18 20 21 12 28 8C26 14 27 18 30.4 20C34 22 37 28 38 40Z')
  + flat(ROOT_G.hi, 'M6 40C6 30 10 22 16 18C14 22 15.4 26 18.4 26C18 20 21 12 28 8L24 40Z')
  + flat(ROOT_G.lo, 'M30.4 20C34 22 37 28 38 40H30Z')
  + path(F('leaf', '#9bd44a'), 'M32 10C38 8 42 11 43 16C38 17.6 33.4 15.4 32 10Z', INK_T)
  + path(F('leaf', '#9bd44a'), 'M14 12C9 10 5.4 12.4 4.6 17C9 18.4 13 16.6 14 12Z', INK_T)
  + path(ROOT_G.md, 'M8 40C8 36 11 33.4 14 36C16 37.6 17 39 17 40Z M36 40C37 36 41 34 43 38C44 39 44 40 44 40Z', INK_T);

const BUFF = path(M_MD, 'M24 4L42 24L24 44L6 24Z') + flat(M_HI, 'M24 4L6 24H24Z') + flat(M_LO, 'M24 24H42L24 44Z')
  + path(GILT, 'M24 12L32 22H27V34H21V22H16Z', INK_T) + flat(F('cf-gilt-hi', '#fff4d2'), 'M24 12L16 22H21V34H24Z');

// =============================================================================================
//  Boss Relics (tag 'boss', --acc = boss gold-crimson from the UI): bronze tri-tone + one accent.
// =============================================================================================
const ACC = F('acc', '#ec9a3c');
const GL = F('glass', '#1b2030');
const ACC_LO = 'fill:color-mix(in oklab, var(--acc,#ec9a3c) 60%, #000)';
const RELIC_TUSK = path(BONE, 'M10 41C8 26 19 11 39 3C30 12 27 26 27 41Z')
  + flat(BONE_LO, 'M27 41C27 26 30 12 39 3C32 14 31 28 31 41Z')
  + flat(F('metal-hi', '#fff4d2'), 'M13 38C12 26 20 14 33 7C24 16 19 26 19 38Z')
  + path(M_MD, 'M8 36H30L32 41V45H6V41Z') + flat(M_HI, 'M8 36H19V45H6V41Z')
  + path(ACC, 'M17 38.4H21V42.6H17Z', INK_T)
  + path(ACC, 'M36 22Q42 28 38 36', 'fill:none;stroke:var(--acc,#ec9a3c);stroke-width:2.6;stroke-linecap:round')
  + path(ACC, 'M40.5 17Q47 26 42 38', 'fill:none;stroke:var(--acc,#ec9a3c);stroke-width:2;stroke-linecap:round;opacity:.7');
const RELIC_BRAND = path(M_LO, 'M21.5 24H26.5V44H21.5Z') + flat(M_MD, 'M21.5 24H24V44H21.5Z')
  + path(M_MD, 'M18.5 41H29.5V45H18.5Z')
  + path(M_MD, 'M8 4H40V26L34 30H14L8 26Z') + flat(M_HI, 'M8 4H24V30H14L8 26Z') + flat(M_LO, 'M24 4H40V26L34 30H24Z')
  + path(ACC, 'M24 8C26 12 31 14.6 29.8 19.6C29.2 22.4 27 24.4 24 24.4C21 24.4 18.8 22.4 18.2 19.8C17.8 17.6 19 15.8 20.6 14.4C20.8 16.2 21.8 17 22.8 17C21.8 13.8 22.8 10.8 24 8Z', INK_T)
  + flat(ACC_LO, 'M24 24.4C27 24.4 29.2 22.4 29.8 19.6C28.6 21.4 26.6 21.8 24 21.8Z');
const RELIC_SCALE = path(M_MD, 'M24 3L41 13V33L24 45L7 33V13Z') + flat(M_HI, 'M24 3L7 13V33L12 36.6V15.6L24 8.6Z') + flat(M_LO, 'M41 13V33L24 45V37L35 30V16Z')
  + path(GL, 'M24 11L35 17.5V30.5L24 37L13 30.5V17.5Z', INK_T)
  + flat(F('glass-hi', '#2c3552'), 'M24 11L13 17.5V30.5L24 24Z')
  + path(ACC, 'M24 17L29.2 24L24 31L18.8 24Z', INK_T) + flat(F('cf-gilt-hi', '#fff4d2'), 'M24 17L18.8 24H24Z') + flat(ACC_LO, 'M24 24H29.2L24 31Z');
const RELIC_SIGIL = path(M_MD, D(ngon(24, 24, 21, 12, -90)))
  + flat(M_HI, D(ngon(24, 24, 21, 12, -90).slice(8).concat([[24, 24]])))
  + path(GL, D(ngon(24, 24, 15, 12, -90)), INK_T)
  + path(ACC, 'M24 8.5L27.4 20.6L39.5 24L27.4 27.4L24 39.5L20.6 27.4L8.5 24L20.6 20.6Z', INK_T)
  + flat(VOID, 'M28 5L22.6 17.4L27 21.4L21 26.4L25.4 30.4L20 43L24.4 31.8L20.2 27.2L26.6 22L22 17.8Z');

// Ashen Standard: a war standard on a bronze pole, ash-dark cloth with an ember sigil, sparks drifting off.
const RELIC_STANDARD = path(M_LO, 'M11 3H14V45H11Z') + flat(M_HI, 'M11 3H12.6V45H11Z')
  + path(M_MD, 'M8.5 41H16.5V45H8.5Z') + path(ACC, D(ngon(12.5, 4, 3.4, 8)), INK_T)
  + path(IRON_HI, 'M14 7H40L35 15L40 23L36 31H14Z') + flat(IRON, 'M14 7H27L24 31H14Z') + flat(IRON_LO, 'M36 31L40 23L35 15L40 7H33L30 31Z')
  + path(ACC, 'M26 11C27.6 14 30.8 15.4 29.8 19.4C29.3 21.6 27.8 22.8 26 22.8C24.2 22.8 22.7 21.6 22.2 19.6C21.8 17.8 22.8 16.6 23.8 15.6C24 16.8 24.6 17.4 25.2 17.4C24.6 15 25.2 13 26 11Z', INK_T)
  + flat(ACC_LO, 'M26 22.8C27.8 22.8 29.3 21.6 29.8 19.4C28.6 20.8 27.4 21 26 21Z')
  + `<g style="${ACC};stroke:var(--ink,#0c0a12);stroke-width:1;paint-order:stroke"><circle cx="33" cy="36" r="1.9"/><circle cx="38.5" cy="40.5" r="1.4"/><circle cx="29" cy="42" r="1.2"/><circle cx="42" cy="33" r="1.1"/></g>`;
// Hollow Heartstone: a faceted crystal heart with a hollow core, a thin gold setting.
const HEART = 'M24 43C12 33 5 26.5 5 18.4C5 11.8 10 7.5 15.4 7.5C19.2 7.5 22.2 9.6 24 12.6C25.8 9.6 28.8 7.5 32.6 7.5C38 7.5 43 11.8 43 18.4C43 26.5 36 33 24 43Z';
const RELIC_HEARTSTONE = path(ACC, HEART)
  + flat(F('cf-gilt-hi', '#fff4d2'), 'M24 12.6C22.2 9.6 19.2 7.5 15.4 7.5C10 7.5 5 11.8 5 18.4C5 22.4 7.6 26 12 30L24 24Z')
  + flat(ACC_LO, 'M24 43C36 33 43 26.5 43 18.4C43 15 41.6 12.2 39.4 10.2L24 24Z')
  + path(GL, 'M24 16.2C22.6 14.2 20.6 13 18.4 13C15.2 13 12.6 15.4 12.6 18.6C12.6 22.6 16.8 26.4 24 32C31.2 26.4 35.4 22.6 35.4 18.6C35.4 15.4 32.8 13 29.6 13C27.4 13 25.4 14.2 24 16.2Z', INK_T)
  + flat(F('glass-hi', '#2c3552'), 'M24 16.2C22.6 14.2 20.6 13 18.4 13C15.2 13 12.6 15.4 12.6 18.6C12.6 22.6 16.8 26.4 24 32Z')
  + `<path style="fill:none;stroke:var(--metal,#8c6c43);stroke-width:2;stroke-linejoin:round" d="${HEART}"/>`
  + path(ACC, 'M24 19L26 22.4L24 25.8L22 22.4Z', INK_T);

const WIND = { lo: F('wind-lo', '#4f6a94'), md: F('wind', '#9fb4d6'), hi: F('wind-hi', '#e4edfb') };
const WINDED = path(WIND.md, 'M4 14H28C34 14 37 8 32 6C29.6 5 27 6.6 27 9H23C23 3.4 29 0.8 34 2.6C42 5.6 40 18 28 18H4Z')
  + flat(WIND.hi, 'M4 14H28V16H4Z') + path(WIND.md, 'M4 25H36C43 25 46 33 40 36C37 37.4 33.6 36 33.6 32.4H29.6C29.6 38.8 36.6 42 42 39.4C49 36 47.5 21 36 21H4Z')
  + flat(WIND.lo, 'M4 25H36V27H4Z') + path(WIND.md, 'M10 31H24C28 31 29.6 36 26 37.4C24 38.2 22 37 22 35H18.4C18.4 40 25 42.4 29 40C34 37 31 27.4 24 27.4H10Z');

export default {
  'ui-winded': WINDED,
  'relic-ashenStandard': RELIC_STANDARD,
  'relic-hollowHeartstone': RELIC_HEARTSTONE,
  'relic-gorraksTusk': RELIC_TUSK,
  'relic-vashkarsBrand': RELIC_BRAND,
  'relic-aurelithsScale': RELIC_SCALE,
  'relic-riftbreakersSigil': RELIC_SIGIL,
  'ui-obelisk': CROWNSHARD,
  'ui-crownshard': CROWNSHARD,
  'ui-obeliskHaste': SIGIL_HASTE,
  'ui-obeliskEcho': SIGIL_ECHO,
  'ui-obeliskWrath': SIGIL_WRATH,
  'ui-stagger': STAGGER,
  'ui-downed': DOWNED,
  'ui-exposed': EXPOSED,
  'ui-breakCheck': BREAK,
  'ui-affix': AFFIX,
  'ui-affixFrenzied': AFFIX_FRENZIED,
  'ui-affixBulwark': AFFIX_BULWARK,
  'ui-affixReverb': AFFIX_REVERB,
  'ui-affixStorm': AFFIX_STORM,
  'ui-affixVengeful': AFFIX_VENGEFUL,
  'ui-generator': GENERATOR,
  'buff-spores': BUFF_SPORES,
  'buff-sap': BUFF_SAP,
  'buff-strain': BUFF_STRAIN,
  'buff-rooted': BUFF_ROOTED,
  'ui-buff': BUFF,
};
