import * as THREE from 'three';
import { defineCreature, TAU, clamp01, smooth, bump } from './rig.js';

// =====================================================================================
//  Wyrmkin (Act III · Riverlands)  — design/research/03-creature-art.md §6, design/ART.md
//  shardling → Dragon Whelp · colossus → Stone River Troll · voidSpitter → Naga Tidecaller
//  crystalRam → Crag Drake · wraith → Storm Wyvern · prismHexer → Kobold Prism-Shaman
// =====================================================================================

const PI = Math.PI;
const sin = Math.sin;
const cos = Math.cos;
const max = Math.max;

// palette
const WINE = 0x8c2234, WINE_HI = 0xa83245, OXBLOOD = 0x5e1a22;
const CREAM = 0xecd3a0, IVORY = 0xf2e6c8, SLATE = 0x5d6470, SLATE_HI = 0x8a909a;
const SAFFRON = 0xe08a3a, SAFFRON_HI = 0xee9d4c, SAFFRON_LO = 0xb0582a;
const PRISM = 0xe6f4ff;
const WOOD = 0xb49b78;

// ---------------------------------------------------------------- build helpers (not used per frame)

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

// Euler [x,y,z] that turns +Y into direction (dx,dy,dz).
function aim(dx, dy, dz) {
  _v.set(dx, dy, dz).normalize();
  _q.setFromUnitVectors(_up, _v);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}

// Tapered cylinder from point a (radius r0) to point b (radius r1).
function limb(pb, a, b, r0, r1, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  pb.cyl(r1, r0, len, { radial: 6, ...o, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: aim(dx, dy, dz) });
}

// Prism crystal: pointed hex/pent prism, base at -h/2, tip at +h/2 (pointing +Y before rot).
function crystal(pb, r, h, o = {}) {
  pb.lathe([[0, -h * 0.5], [r, -h * 0.2], [r, h * 0.16], [0, h * 0.5]], { radial: 5, ...o });
}
// Crystal centred at c, pointing along dir.
function shard(pb, c, dir, r, h, o = {}) {
  crystal(pb, r, h, { ...o, pos: c, rot: aim(dir[0], dir[1], dir[2]) });
}
// Cheap 8-tri octahedron (stretch with scale).
function oct(pb, r, o = {}) { pb.geo(new THREE.OctahedronGeometry(r), o); }

function shapeGeo(pts) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  return new THREE.ShapeGeometry(sh);
}
// Two-sided flat fan lying in the horizontal plane. pts = [outward x, forward z] relative to pos; sign mirrors.
function flat2(pb, pts, sign, pos, bone, color, o = {}) {
  pb.geo(shapeGeo(pts.map(([x, z]) => [x * sign, z])), { bone, pos, rot: [PI / 2, 0, 0], color, ...o });
  pb.geo(shapeGeo(pts.map(([x, z]) => [x * sign, -z])), { bone, pos, rot: [-PI / 2, 0, 0], color, ...o });
}
// Two-sided flat plate in the XY plane (faces ±Z). pts = [x, y] relative to pos; rx tilts it about X.
function fan2(pb, pts, pos, rx, bone, color, o = {}) {
  pb.geo(shapeGeo(pts), { bone, pos, rot: [rx, 0, 0], color, ...o });
  pb.geo(shapeGeo(pts.map(([x, y]) => [-x, y])), { bone, pos, rot: [rx, PI, 0], color, ...o });
}
// Thin strip from (x0,z0) to (x1,z1) (horizontal plane), width w; two-sided.
function strip2(pb, p0, p1, w, pos, bone, color, o = {}) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l * w / 2, nz = dx / l * w / 2;
  const pts = [[p0[0] + nx, p0[1] + nz], [p1[0] + nx * 0.4, p1[1] + nz * 0.4], [p1[0] - nx * 0.4, p1[1] - nz * 0.4], [p0[0] - nx, p0[1] - nz]];
  flat2(pb, pts, 1, pos, bone, color, o);
}

// ---------------------------------------------------------------- animation helpers

// easeOutBack: 0 → overshoot → 1
const ob = (x) => { x = clamp01(x) - 1; return 1 + 2.7 * x * x * x + 1.7 * x * x; };
const lerp = (a, b, t) => a + (b - a) * t;
const pow4 = (x) => { const x2 = x * x; return x2 * x2; };

// ======================================================================================
// 6.1  DRAGON WHELP  (shardling)  — swarmer flyer
// ======================================================================================
const WH = 0xa52a3a, WH_HI = 0xb83549;

export const shardling = defineCreature({
  id: 'shardling',
  stride: 1.2,
  blob: 0.5,
  deathTime: 0.5,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 1.0, 0] },
    { name: 'head', parent: 'body', pivot: [0, 1.06, 0.28] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.04, 0.34] },
    { name: 'wingL1', parent: 'body', pivot: [0.1, 1.1, 0.05] },
    { name: 'wingL2', parent: 'wingL1', pivot: [0.4, 1.1, 0.05] },
    { name: 'wingR1', parent: 'body', pivot: [-0.1, 1.1, 0.05] },
    { name: 'wingR2', parent: 'wingR1', pivot: [-0.4, 1.1, 0.05] },
    { name: 'tail1', parent: 'body', pivot: [0, 1.0, -0.2] },
    { name: 'tail2', parent: 'tail1', pivot: [0, 1.0, -0.5] },
  ],
  build(pb) {
    pb.sphere(0.19, { bone: 'body', pos: [0, 1.0, 0], scale: [1, 0.9, 1.5], color: WH, seg: [7, 5] });
    pb.sphere(0.14, { bone: 'body', pos: [0, 0.93, 0.03], scale: [1, 0.55, 1.4], color: CREAM, seg: [6, 3] });
    // big cute head
    pb.box(0.3, 0.26, 0.28, { bone: 'head', pos: [0, 1.11, 0.38], taper: [0.82, 0.8], color: WH_HI });
    pb.box(0.16, 0.11, 0.14, { bone: 'head', pos: [0, 1.07, 0.57], color: WH_HI });
    oct(pb, 0.055, { bone: 'head', pos: [0, 1.17, 0.58], scale: [1, 1.9, 1], rot: [0.45, 0, 0], color: PRISM, emis: 2.4 });
    pb.mirror((s, k) => {
      oct(pb, 0.05, { bone: 'head', pos: [0.11 * k, 1.15, 0.47], scale: [0.8, 1, 0.8], color: PRISM, emis: 2, trim: true });
      pb.cone(0.045, 0.2, { bone: 'head', pos: [0.09 * k, 1.23, 0.3], rot: [-1.15, 0, -0.3 * k], color: IVORY, radial: 4, trim: true });
      // elite crown: second pair of swept crystal horns
      pb.cone(0.055, 0.3, { bone: 'head', pos: [0.16 * k, 1.22, 0.22], rot: [-0.95, 0, -0.8 * k], color: IVORY, radial: 4, eliteOnly: true });
    });
    pb.box(0.2, 0.04, 0.15, { bone: 'jaw', pos: [0, 1.02, 0.46], color: WH_HI });
    // wings: leading-edge arm + two scalloped membranes
    pb.mirror((s, k) => {
      const b1 = 'wing' + s + '1', b2 = 'wing' + s + '2';
      pb.box(0.3, 0.035, 0.045, { bone: b1, pos: [0.25 * k, 1.1, 0.07], color: WH });
      pb.box(0.32, 0.03, 0.04, { bone: b2, pos: [0.56 * k, 1.1, 0.07], color: WH });
      flat2(pb, [[0, 0.06], [0.3, 0.05], [0.33, -0.12], [0.18, -0.2], [0.08, -0.34], [0, -0.24]], k, [0.1 * k, 1.1, 0.05], b1, SAFFRON, { gradient: false });
      flat2(pb, [[0, 0.05], [0.22, 0.08], [0.36, -0.02], [0.3, -0.14], [0.34, -0.3], [0.17, -0.22], [0.1, -0.38], [0, -0.17]], k, [0.4 * k, 1.1, 0.05], b2, SAFFRON_HI, { gradient: false });
    });
    // tail
    pb.cone(0.08, 0.32, { bone: 'tail1', pos: [0, 1.0, -0.38], rot: [-PI / 2, 0, 0], color: WH, radial: 5 });
    pb.cone(0.05, 0.22, { bone: 'tail2', pos: [0, 1.0, -0.63], rot: [-PI / 2, 0, 0], color: WH, radial: 5 });
    oct(pb, 0.05, { bone: 'tail2', pos: [0, 1.0, -0.78], scale: [1, 1, 2.2], color: PRISM, emis: 2, trim: true });
  },
  animate(P, s, B) {
    const t = s.t, m = s.move, hit = s.hit, sd = s.seed * TAU;
    const ph = t * 14 + sd;
    const fl = sin(ph), cph = cos(ph);
    let d = 0; // dive envelope
    if (s.action === 'attack') d = smooth(s.k / 0.14) * (1 - smooth((s.k - 0.3) / 0.55));
    const amp = 1 - d * 0.85;
    const w1 = (0.28 + 0.78 * fl) * amp - 1.1 * d + 0.5 * hit;
    const w2 = (-0.5 * cph + 0.1) * amp - 0.35 * d;
    P.rot(B.wingL1, 0, 0.32 * m, w1).rot(B.wingR1, 0, -0.32 * m, -w1);
    P.rot(B.wingL2, 0, 0, w2).rot(B.wingR2, 0, 0, -w2);
    // body: phase-locked bob (rises on the downstroke), erratic hover, dive, recoil
    P.move(B.body, sin(t * 3.1 + sd) * 0.07 * (1 - 0.5 * m), -0.06 * cph * amp + sin(t * 2.1 + sd) * 0.03 - 0.5 * d,
      cos(t * 2.6 + sd * 1.7) * 0.07 * (1 - 0.5 * m) - 0.12 * hit + 0.22 * d);
    P.rot(B.body, 0.3 * m + 0.7 * d - 0.45 * hit + 0.05 * cph, 0, sin(t * 3.1 + sd) * 0.08);
    // tail chain lags the flap
    P.rot(B.tail1, -0.12 * sin(ph - 0.8) * amp + 0.25 * hit, sin(t * 4 + sd) * 0.35, 0);
    P.rot(B.tail2, -0.15 * sin(ph - 1.5), sin(t * 4 - 0.9 + sd) * 0.45, 0);
    // head: curious tilt, counter pitch, yap / bite
    const yap = pow4(max(0, sin(t * 2.4 + s.seed * 7)));
    let jaw = 0.08 + 0.45 * yap;
    if (s.action === 'attack') jaw = 0.1 + 0.8 * smooth(s.k / 0.07) * (1 - smooth((s.k - 0.1) / 0.05));
    P.rot(B.head, -0.3 * m - 0.5 * d + 0.05 * cph - 0.1 * sin(t * 1.3 + sd), sin(t * 0.9 + sd) * 0.18 * (1 - m), sin(t * 1.7 + sd) * 0.2 * (1 - m));
    P.rot(B.jaw, jaw, 0, 0);
  },
});

// ======================================================================================
// 6.2  STONE RIVER TROLL  (colossus)  — tank
// ======================================================================================
const TSKIN = 0x3e5a62, TSKIN_HI = 0x587c86, TSKIN_LO = 0x2e464d;
const KELP = 0x3f5a2a;

export const colossus = defineCreature({
  id: 'colossus',
  stride: 2.4,
  blob: 1.35,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 1.05, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 1.25, -0.1] },
    { name: 'head', parent: 'spine', pivot: [0, 2.4, 0.7] },
    { name: 'jaw', parent: 'head', pivot: [0, 2.2, 0.95] },
    { name: 'armL', parent: 'spine', pivot: [0.98, 2.5, 0.25] },
    { name: 'foreL', parent: 'armL', pivot: [0.98, 1.55, 0.3] },
    { name: 'armR', parent: 'spine', pivot: [-0.98, 2.5, 0.25] },
    { name: 'foreR', parent: 'armR', pivot: [-0.98, 1.55, 0.3] },
    { name: 'legL', parent: 'hips', pivot: [0.45, 1.05, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.45, 1.05, 0] },
    { name: 'back', parent: 'spine', pivot: [0, 2.7, -0.5] },
  ],
  build(pb) {
    // smooth troll flesh, faceted river-stone growths
    const flesh = (r, o) => pb.sphere(r, { flat: false, ...o });
    const stone = (r, o) => pb.blob(r, { detail: 0, jitter: 0.2, ...o });
    // legs: stumpy columns + wide clawed feet
    pb.mirror((s, k) => {
      flesh(0.4, { bone: 'leg' + s, pos: [0.46 * k, 0.64, 0], scale: [1, 1.32, 1.05], seg: [5, 3], color: TSKIN });
      flesh(0.36, { bone: 'leg' + s, pos: [0.47 * k, 0.15, 0.14], scale: [1.12, 0.45, 1.42], seg: [4, 3], color: TSKIN_LO });
    });
    // waist: wine belt + hanging kelp strands
    pb.cyl(0.74, 0.7, 0.24, { bone: 'hips', pos: [0, 1.22, 0.05], radial: 6, scale: [1, 1, 0.82], color: WINE });
    for (let i = 0; i < 3; i++) {
      pb.box(0.24, 0.62 + (i % 2) * 0.12, 0.05, { bone: 'hips', pos: [(i - 1) * 0.32, 0.86 - (i % 2) * 0.06, 0.62], rot: [0.12, 0, (i - 1) * 0.06], color: KELP });
    }
    // torso: hunched hulk + paler gut
    flesh(0.95, { bone: 'spine', pos: [0, 2.08, -0.02], rot: [0.45, 0, 0], scale: [1.2, 0.82, 1.0], seg: [6, 5], color: TSKIN });
    flesh(0.6, { bone: 'spine', pos: [0, 1.6, 0.48], scale: [1.15, 0.95, 0.75], seg: [6, 4], color: TSKIN_HI });
    // head: low and forward — heavy brow, long nose, prism eyes, fin ears, underbite with tusks
    flesh(0.48, { bone: 'head', pos: [0, 2.68, 1.12], scale: [1.08, 0.85, 1.12], seg: [6, 4], color: TSKIN_HI });
    pb.box(0.98, 0.17, 0.3, { bone: 'head', pos: [0, 2.9, 1.5], rot: [-0.35, 0, 0], taper: [0.85, 0.8], color: TSKIN_LO });
    pb.cone(0.14, 0.5, { bone: 'head', pos: [0, 2.66, 1.78], rot: [PI / 2 + 0.45, 0, 0], radial: 5, color: TSKIN_HI });
    pb.mirror((s, k) => {
      oct(pb, 0.12, { bone: 'head', pos: [0.23 * k, 2.77, 1.6], scale: [1.3, 0.8, 0.8], color: PRISM, emis: 2.6, trim: true });
      pb.extrude(k > 0 ? [[0, 0], [0.5, 0.24], [0.1, 0.46]] : [[0, 0], [-0.5, 0.24], [-0.1, 0.46]], 0.09, { bone: 'head', pos: [0.46 * k, 2.6, 1.0], color: WINE });
      pb.cone(0.12, 0.5, { bone: 'jaw', pos: [0.3 * k, 2.46, 1.62], rot: [0.15, 0, -0.15 * k], color: IVORY, radial: 4 });
      // elite crown: swept crystal horns
      pb.cone(0.12, 0.7, { bone: 'head', pos: [0.34 * k, 3.04, 0.98], rot: [-0.7, 0, -0.55 * k], color: IVORY, radial: 3, eliteOnly: true });
    });
    flesh(0.46, { bone: 'jaw', pos: [0, 2.26, 1.36], scale: [1.15, 0.48, 1.0], seg: [5, 4], color: TSKIN_LO });
    // river-stone carapace fused to the back, prism crystals growing out of it
    stone(0.55, { bone: 'back', pos: [0, 2.92, -0.45], scale: [1.25, 0.5, 1.0], rot: [0.3, 0, 0], seed: 2, color: SLATE });
    stone(0.4, { bone: 'back', pos: [0.58, 2.72, -0.7], scale: [1.1, 0.6, 1.0], rot: [0.2, 0.3, -0.35], seed: 5, color: SLATE_HI });
    stone(0.4, { bone: 'back', pos: [-0.58, 2.72, -0.7], scale: [1.1, 0.6, 1.0], rot: [0.2, -0.3, 0.35], seed: 8, color: SLATE_HI });
    shard(pb, [0, 3.45, -0.5], [0, 1, -0.12], 0.19, 1.15, { bone: 'back', color: PRISM, emis: 2.4, trim: true, radial: 4 });
    shard(pb, [0.55, 3.22, -0.66], [0.45, 1, -0.2], 0.15, 0.88, { bone: 'back', color: PRISM, emis: 2.4, radial: 4 });
    shard(pb, [-0.55, 3.22, -0.66], [-0.45, 1, -0.2], 0.15, 0.88, { bone: 'back', color: PRISM, emis: 2.4, radial: 4 });
    shard(pb, [0.3, 3.05, -1.02], [0.25, 1, -0.7], 0.13, 0.72, { bone: 'back', color: PRISM, emis: 2.4, radial: 4 });
    shard(pb, [-0.3, 3.05, -1.02], [-0.25, 1, -0.7], 0.13, 0.72, { bone: 'back', color: PRISM, emis: 2.4, radial: 4 });
    // shoulders, long arms, stone bracers, boulder fists
    pb.mirror((s, k) => {
      const a = 'arm' + s, f = 'fore' + s;
      stone(0.34, { bone: 'spine', pos: [1.02 * k, 2.66, 0.05], scale: [1.1, 0.72, 1.0], jitter: 0.18, seed: 3 + (k > 0 ? 0 : 5), color: 0x7b8793 });
      flesh(0.36, { bone: a, pos: [0.98 * k, 2.02, 0.27], scale: [1.0, 1.42, 1.0], seg: [5, 4], color: TSKIN });
      flesh(0.4, { bone: f, pos: [0.98 * k, 1.1, 0.3], scale: [1.0, 1.25, 1.0], seg: [5, 4], color: TSKIN_HI });
      stone(0.44, { bone: f, pos: [0.98 * k, 1.28, 0.3], scale: [1.08, 0.5, 1.08], seed: 11 + k, color: SLATE, trim: true });
      stone(0.5, { bone: f, pos: [0.98 * k, 0.46, 0.36], scale: [1.0, 0.9, 1.05], jitter: 0.16, seed: 21 + k, color: SLATE });
      for (let i = 0; i < 2; i++) pb.box(0.24, 0.2, 0.2, { bone: f, pos: [(0.98 + (i - 0.5) * 0.3) * k, 0.62, 0.8], rot: [0.3, 0, 0], color: SLATE_HI, trim: true });
    });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, sd = s.seed * TAU, hit = s.hit;
    const sw = sin(w), cw = cos(w);
    const atk = s.action === 'attack';
    // legs: heavy stomp, swing leg lifts, hips drop as the legs spread (feet stay planted)
    const A = 0.42 * m;
    P.rot(B.legL, sw * A).rot(B.legR, -sw * A);
    P.move(B.legL, 0, max(0, -cw) * 0.1 * m).move(B.legR, 0, max(0, cw) * 0.1 * m);
    let hipY = -0.09 * sw * sw * m;
    // arms: knuckle-walk (fists planted on alternate steps), otherwise idle scrape
    let aL = -sw * 0.5 * m + 0.14 * sin(t * 0.8 + sd) * (1 - m);
    let aR = sw * 0.5 * m + 0.14 * sin(t * 0.8 + sd + 2.2) * (1 - m);
    let fL = aL > 0 ? -0.9 * aL : 0.7 * aL;
    let fR = aR > 0 ? -0.9 * aR : 0.7 * aR;
    let zIn = 0;
    let lean = 0.1 * m + 0.03 * sin(t * 1.3 + sd);
    let headX = 0;
    if (atk) {
      const k = s.k;
      let x, sl;
      if (k < 0.08) { x = -2.75 * smooth(k / 0.08); sl = -0.32 * smooth(k / 0.08); }
      else if (k < 0.2) { const u = smooth((k - 0.08) / 0.12); x = lerp(-2.75, -0.35, u); sl = lerp(-0.32, 0.38, u); }
      else { const u = smooth((k - 0.2) / 0.8); x = lerp(-0.35, 0, u); sl = lerp(0.38, 0, u); }
      aL = aR = x;
      fL = fR = k < 0.2 ? -0.5 * (k < 0.08 ? smooth(k / 0.08) : 1 - smooth((k - 0.08) / 0.12)) : 0;
      zIn = k < 0.2 ? smooth(min01(k / 0.08)) * (1 - smooth((k - 0.08) / 0.12)) : 0;
      lean = sl;
      hipY -= 0.12 * bump(k, 0.06, 0.4);
      headX = 0.25 * bump(k, 0.07, 0.5) - 0.2 * smooth(k / 0.08) * (1 - smooth((k - 0.08) / 0.1));
    }
    P.rot(B.armL, aL - 0.1, 0, 0.12 - 0.5 * zIn).rot(B.armR, aR - 0.1, 0, -0.12 + 0.5 * zIn);
    P.rot(B.foreL, fL, 0, 0).rot(B.foreR, fR, 0, 0);
    // body
    P.move(B.hips, 0, hipY, 0);
    P.rot(B.spine, lean - 0.08 * hit, sw * 0.12 * m, -sw * 0.05 * m);
    P.scale(B.spine, 1 + 0.008 * sin(t * 2.5 + sd), 1 + 0.02 * sin(t * 2.5 + sd), 1);
    P.rot(B.head, headX - 0.2 * hit + 0.04 * sw * m, sin(t * 0.5 + sd) * 0.22 * (1 - m), sin(t * 0.7 + sd) * 0.05);
    P.rot(B.jaw, 0.06 + 0.04 * sin(t * 2.5 + sd) + (atk ? 0.5 * bump(s.k, 0.0, 0.3) : 0), 0, 0);
    // crystals shimmer
    P.scale(B.back, 1, 1 + 0.035 * sin(t * 3 + sd), 1);
    P.rot(B.back, 0.02 * sin(t * 1.7 + sd) - 0.05 * sw * m, 0, 0);
  },
});

function min01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// ======================================================================================
// 6.3  NAGA TIDECALLER  (voidSpitter)  — ranged, 3-shot spread
// ======================================================================================
const NAGA_HI = 0xa8455a, SHELL = 0x5e7f86;

function ribPts(alpha, len, w) {
  const dx = sin(alpha), dy = cos(alpha), nx = dy * w / 2, ny = -dx * w / 2;
  return [[nx, ny], [dx * len + nx * 0.5, dy * len + ny * 0.5], [dx * len - nx * 0.5, dy * len - ny * 0.5], [-nx, -ny]];
}

export const voidSpitter = defineCreature({
  id: 'voidSpitter',
  stride: 1.6,
  blob: 0.85,
  muzzle: [-0.4, 2.4, 2.1],
  bones: [
    { name: 'root' },
    { name: 'coil', pivot: [0, 0.15, 0] },
    { name: 'rise1', parent: 'coil', pivot: [0, 0.3, 0] },
    { name: 'rise2', parent: 'rise1', pivot: [0, 0.78, 0.06] },
    { name: 'spine', parent: 'rise2', pivot: [0, 1.15, 0.05] },
    { name: 'head', parent: 'spine', pivot: [0, 1.62, 0.1] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.7, 0.22] },
    { name: 'crest', parent: 'head', pivot: [0, 1.72, -0.05] },
    { name: 'armL', parent: 'spine', pivot: [0.3, 1.5, 0.05] },
    { name: 'foreL', parent: 'armL', pivot: [0.34, 1.25, 0.15] },
    { name: 'armR', parent: 'spine', pivot: [-0.3, 1.5, 0.05] },
    { name: 'foreR', parent: 'armR', pivot: [-0.32, 1.25, 0.12] },
    { name: 'weapon', parent: 'foreR', pivot: [-0.32, 1.05, 0.3] },
    { name: 'pcC', parent: 'weapon', pivot: [-0.32, 2.68, 0.3] },
    { name: 'pcL', parent: 'weapon', pivot: [-0.13, 2.62, 0.3] },
    { name: 'pcR', parent: 'weapon', pivot: [-0.51, 2.62, 0.3] },
  ],
  build(pb) {
    // ground coil: a ring no other enemy has
    pb.torus(0.46, 0.18, { bone: 'coil', pos: [0, 0.18, 0], rot: [PI / 2, 0, 0], arc: 1.75 * PI, tubular: 5, radial: 11, color: WINE });
    limb(pb, [0.33, 0.18, -0.33], [0.56, 0.12, -0.08], 0.18, 0.04, { bone: 'coil', color: WINE, radial: 5 });
    pb.torus(0.3, 0.16, { bone: 'coil', pos: [0, 0.45, 0], rot: [PI / 2, 0, 2.3], arc: 1.5 * PI, tubular: 5, radial: 9, color: WINE_HI });
    // rising body
    limb(pb, [0, 0.4, 0.0], [0, 0.88, 0.06], 0.22, 0.18, { bone: 'rise1', color: WINE, radial: 7 });
    pb.box(0.1, 0.44, 0.05, { bone: 'rise1', pos: [0, 0.64, 0.2], rot: [0.12, 0, 0], color: CREAM });
    limb(pb, [0, 0.8, 0.06], [0, 1.48, 0.05], 0.18, 0.16, { bone: 'rise2', color: WINE, radial: 7 });
    pb.box(0.09, 0.42, 0.05, { bone: 'rise2', pos: [0, 1.0, 0.22], rot: [-0.06, 0, 0], color: CREAM });
    // dorsal fins (read from behind)
    for (const [y, z, r, h] of [[0.62, -0.17, 0.08, 0.26], [0.98, -0.16, 0.075, 0.24], [1.28, -0.16, 0.07, 0.22]]) {
      pb.cone(r, h, { bone: y > 0.9 ? 'rise2' : 'rise1', pos: [0, y, z], rot: [-0.9, 0, 0], radial: 4, color: SAFFRON });
    }
    // torso
    pb.box(0.62, 0.54, 0.4, { bone: 'spine', pos: [0, 1.4, 0.06], taper: [1.15, 1.1], color: NAGA_HI });
    pb.box(0.2, 0.38, 0.06, { bone: 'spine', pos: [0, 1.38, 0.28], color: CREAM });
    pb.mirror((s, k) => {
      pb.sphere(0.17, { bone: 'spine', pos: [0.31 * k, 1.6, 0.05], scale: [1.2, 0.7, 1], color: SHELL, seg: [6, 4] });
    });
    // head + hood
    pb.box(0.36, 0.34, 0.36, { bone: 'head', pos: [0, 1.82, 0.16], taper: [0.85, 0.8], color: WINE });
    pb.box(0.18, 0.14, 0.2, { bone: 'head', pos: [0, 1.75, 0.38], color: WINE });
    pb.box(0.15, 0.05, 0.2, { bone: 'jaw', pos: [0, 1.69, 0.36], color: CREAM });
    pb.mirror((s, k) => {
      oct(pb, 0.055, { bone: 'head', pos: [0.1 * k, 1.84, 0.3], scale: [0.8, 1, 0.9], color: PRISM, emis: 2.4, trim: true });
      pb.cone(0.05, 0.34, { bone: 'head', pos: [0.13 * k, 2.0, 0.08], rot: [-0.7, 0, -0.5 * k], color: IVORY, radial: 4, eliteOnly: true });
    });
    const hood = [[-0.1, -0.14], [-0.3, -0.04], [-0.38, 0.14], [-0.3, 0.32], [-0.15, 0.42], [0, 0.46], [0.15, 0.42], [0.3, 0.32], [0.38, 0.14], [0.3, -0.04], [0.1, -0.14]];
    fan2(pb, hood, [0, 1.74, -0.12], -0.1, 'crest', WINE, { gradient: false });
    fan2(pb, hood.map(([x, y]) => [x * 0.82, y * 0.82 + 0.02]), [0, 1.74, -0.095], -0.1, 'crest', SAFFRON, { gradient: false, trim: true });
    for (const a of [-0.85, 0, 0.85]) fan2(pb, ribPts(a, 0.4, 0.06), [0, 1.74, -0.08], -0.1, 'crest', PRISM, { emis: 2, gradient: false });
    // arms
    limb(pb, [-0.3, 1.52, 0.05], [-0.32, 1.25, 0.12], 0.08, 0.07, { bone: 'armR', color: WINE, radial: 5 });
    limb(pb, [-0.32, 1.25, 0.12], [-0.32, 1.05, 0.3], 0.07, 0.065, { bone: 'foreR', color: WINE, radial: 5 });
    pb.box(0.13, 0.13, 0.13, { bone: 'foreR', pos: [-0.32, 1.05, 0.3], color: WINE_HI });
    limb(pb, [0.3, 1.52, 0.05], [0.34, 1.25, 0.15], 0.08, 0.07, { bone: 'armL', color: WINE, radial: 5 });
    limb(pb, [0.34, 1.25, 0.15], [0.3, 1.08, 0.36], 0.07, 0.065, { bone: 'foreL', color: WINE, radial: 5 });
    pb.box(0.13, 0.13, 0.13, { bone: 'foreL', pos: [0.3, 1.06, 0.36], color: WINE_HI });
    // trident
    pb.cyl(0.045, 0.045, 1.9, { bone: 'weapon', pos: [-0.32, 1.25, 0.3], radial: 5, color: WOOD });
    pb.box(0.14, 0.12, 0.14, { bone: 'weapon', pos: [-0.32, 2.22, 0.3], color: IVORY, trim: true });
    pb.box(0.46, 0.08, 0.08, { bone: 'weapon', pos: [-0.32, 2.3, 0.3], color: IVORY, trim: true });
    pb.cone(0.06, 0.36, { bone: 'weapon', pos: [-0.32, 2.5, 0.3], color: IVORY, radial: 4 });
    pb.cone(0.055, 0.3, { bone: 'weapon', pos: [-0.13, 2.47, 0.3], color: IVORY, radial: 4 });
    pb.cone(0.055, 0.3, { bone: 'weapon', pos: [-0.51, 2.47, 0.3], color: IVORY, radial: 4 });
    oct(pb, 0.1, { bone: 'pcC', pos: [-0.32, 2.74, 0.3], scale: [1, 1.6, 1], color: PRISM, emis: 3 });
    oct(pb, 0.09, { bone: 'pcL', pos: [-0.13, 2.67, 0.3], scale: [1, 1.6, 1], color: PRISM, emis: 3 });
    oct(pb, 0.09, { bone: 'pcR', pos: [-0.51, 2.67, 0.3], scale: [1, 1.6, 1], color: PRISM, emis: 3 });
  },
  animate(P, s, B) {
    const t = s.t, m = s.move, sd = s.seed * TAU, hit = s.hit, k = s.k;
    const cast = s.action === 'cast', atk = s.action === 'attack';
    const wv = t * (2.6 + 1.6 * m) + sd;
    P.rot(B.coil, 0, sin(t * 0.9 + sd) * 0.12 + 0.12 * sin(wv) * m, 0);
    let r1x = 0.08 * m, r2x = 0, spX = 0, hdX = 0, up = 0, spZ = 0, crest = 1 + 0.05 * sin(t * 2.2 + sd);
    // trident / arms (net trident tilt is solved against the arm chain)
    let aR = 0.1 * sin(t * 1.3 + sd) - 0.25 * m * sin(wv), fR = 0, net = 0.03 * sin(t * 1.3 + sd);
    let aLx = -0.1 + 0.15 * sin(t * 1.1 + sd + 1), aLz = 0.05, fLx = -0.2;
    let pC = 1, pL = 1, pR = 1;
    let spY = sin(t * 1.1 + sd) * 0.14, hdY = -spY * 0.6 + sin(t * 0.7 + sd) * 0.2 * (1 - m);
    let reach = 0;
    if (cast) {
      const u = smooth(k / 0.45);                  // rear up, raise the trident overhead
      const aim = smooth((k - 0.4) / 0.3);          // level the prongs at the target
      const rel = k > 0.7 ? (k - 0.7) / 0.3 : 0;
      const th = k > 0.7 ? smooth(rel / 0.2) * (1 - smooth((rel - 0.2) / 0.8)) : 0; // thrust envelope
      const rest = 1 - smooth(max(0, rel - 0.25) / 0.75);
      up = 0.2 * u * rest;
      r1x = -0.2 * u * rest * (1 - aim) + 0.08 * th;
      r2x = -0.1 * u * rest * (1 - aim) + 0.04 * th;
      spX = -0.1 * u * rest * (1 - aim) + 0.02 * th;
      hdX = -0.15 * u * rest * (1 - aim) + 0.1 * th;
      crest = 1 + 0.4 * u * rest;
      aR = (-2.0 + 0.5 * aim + 0.15 * th) * u * rest;
      fR = -0.3 * u * rest;
      net = lerp(0.03, lerp(0.03 + 0.47 * u, 1.25, aim), rest);
      aLx = lerp(aLx, -1.9, u * rest);
      aLz = lerp(aLz, -0.55, u * rest);
      fLx = lerp(fLx, -0.5, u * rest);
      spY *= 1 - u;
      hdY *= 1 - u;
      reach = th;
      const rl = 1 - smooth((k - 0.72) / 0.28);
      pL = 1 + 0.9 * smooth((k - 0.1) / 0.2) * rl; pC = 1 + 0.9 * smooth((k - 0.23) / 0.2) * rl; pR = 1 + 0.9 * smooth((k - 0.36) / 0.2) * rl;
    } else if (atk) {
      const q = bump(k, 0, 0.5);
      r1x += 0.3 * q; spX += 0.15 * q; hdX += 0.2 * q;
      aR = -0.5 * q; net = 0.4 * q;
    }
    P.move(B.spine, 0, up + sin(t * 2 + sd) * 0.012, 0.25 * reach);
    P.rot(B.rise1, r1x - 0.05 * hit, 0, sin(wv - 0.8) * (0.08 + 0.1 * m));
    P.rot(B.rise2, r2x, 0, sin(wv - 1.6) * (0.1 + 0.1 * m));
    P.rot(B.spine, spX - 0.2 * hit, spY, sin(wv - 2.4) * (0.08 + 0.08 * m));
    P.rot(B.head, hdX + 0.3 * hit, hdY, sin(wv - 3.2) * 0.06);
    P.rot(B.jaw, 0.06 + (cast ? 0.35 * smooth(k / 0.7) * (k > 0.7 ? 1 - smooth((k - 0.7) / 0.1) : 1) : 0), 0, 0);
    P.scale(B.crest, crest, 1, 1);
    P.rot(B.armR, aR, 0, 0).rot(B.foreR, fR, 0, 0).rot(B.weapon, net - aR - fR, 0, 0);
    P.rot(B.armL, aLx, 0, aLz).rot(B.foreL, fLx, 0, 0);
    P.scale(B.pcC, pC, pC, pC).scale(B.pcL, pL, pL, pL).scale(B.pcR, pR, pR, pR);
  },
});

// ======================================================================================
// 6.4  CRAG DRAKE  (crystalRam)  — charger quadruped
// ======================================================================================
const DK = 0x741e2b, DK_LO = 0x5e1a22;

export const crystalRam = defineCreature({
  id: 'crystalRam',
  stride: 1.7,
  blob: 1.0,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 0.58, 0] },
    { name: 'head', parent: 'body', pivot: [0, 0.62, 0.45] },
    { name: 'jaw', parent: 'head', pivot: [0, 0.5, 0.62] },
    { name: 'crest', parent: 'head', pivot: [0, 0.8, 0.66] },
    { name: 'legFL', parent: 'body', pivot: [0.38, 0.5, 0.35] },
    { name: 'legFR', parent: 'body', pivot: [-0.38, 0.5, 0.35] },
    { name: 'legBL', parent: 'body', pivot: [0.38, 0.5, -0.4] },
    { name: 'legBR', parent: 'body', pivot: [-0.38, 0.5, -0.4] },
    { name: 'tail1', parent: 'body', pivot: [0, 0.57, -0.55] },
    { name: 'tail2', parent: 'tail1', pivot: [0, 0.55, -0.95] },
    { name: 'tail3', parent: 'tail2', pivot: [0, 0.5, -1.25] },
  ],
  build(pb) {
    pb.sphere(0.56, { bone: 'body', pos: [0, 0.62, -0.08], scale: [0.86, 0.62, 1.16], seg: [8, 5], color: DK });
    pb.sphere(0.4, { bone: 'body', pos: [0, 0.44, 0.0], scale: [0.95, 0.42, 1.3], seg: [6, 3], color: CREAM });
    [[0.36, 0.4], [0.12, 0.42], [-0.12, 0.4], [-0.36, 0.34], [-0.58, 0.28]].forEach(([z, w]) => {
      pb.box(w, 0.1, 0.2, { bone: 'body', pos: [0, 0.94, z], rot: [0.08, 0, 0], color: SLATE });
    });
    shard(pb, [0, 1.0, 0.26], [0, 1, -0.2], 0.065, 0.34, { bone: 'body', color: PRISM, emis: 2.4 });
    shard(pb, [0, 0.99, 0.02], [0, 1, -0.2], 0.065, 0.34, { bone: 'body', color: PRISM, emis: 2.4 });
    shard(pb, [0, 0.96, -0.22], [0, 1, -0.2], 0.06, 0.3, { bone: 'body', color: PRISM, emis: 2.4 });
    // head
    pb.box(0.54, 0.44, 0.54, { bone: 'head', pos: [0, 0.62, 0.78], taper: [0.85, 0.78], color: DK });
    pb.box(0.32, 0.24, 0.24, { bone: 'head', pos: [0, 0.55, 1.1], color: DK });
    shard(pb, [0, 0.66, 1.3], [0, 0.05, 1], 0.11, 0.58, { bone: 'head', color: PRISM, emis: 2.6, trim: true });
    pb.box(0.34, 0.1, 0.4, { bone: 'jaw', pos: [0, 0.45, 0.88], color: DK_LO });
    for (const [x, z] of [[0.15, 1.04], [-0.15, 1.04], [0.15, 0.8], [-0.15, 0.8]]) {
      pb.cone(0.045, 0.14, { bone: 'jaw', pos: [x, 0.53, z], color: IVORY, radial: 4 });
    }
    pb.mirror((s, k) => {
      oct(pb, 0.06, { bone: 'head', pos: [0.22 * k, 0.72, 0.92], color: PRISM, emis: 2.4, trim: true });
      pb.cone(0.08, 0.34, { bone: 'crest', pos: [0.3 * k, 0.86, 0.6], rot: [-1.2, 0, -0.9 * k], color: IVORY, radial: 4 });
      // elite crown: second pair of swept horns
      pb.cone(0.09, 0.5, { bone: 'crest', pos: [0.22 * k, 1.12, 0.45], rot: [-0.6, 0, -0.35 * k], color: IVORY, radial: 4, eliteOnly: true });
    });
    // battering crest: ivory shovel
    pb.extrude([[-0.17, 0], [-0.42, 0.18], [-0.42, 0.42], [-0.26, 0.36], [-0.22, 0.58], [0, 0.44], [0.22, 0.58], [0.26, 0.36], [0.42, 0.42], [0.42, 0.18], [0.17, 0]], 0.1,
      { bone: 'crest', pos: [0, 0.8, 0.7], rot: [-0.55, 0, 0], scale: [1.25, 1.2, 1], color: IVORY, trim: true });
    // legs
    const legs = [['legFL', 1, 0.35], ['legFR', -1, 0.35], ['legBL', 1, -0.4], ['legBR', -1, -0.4]];
    for (const [b, k, z] of legs) {
      limb(pb, [0.4 * k, 0.6, z], [0.52 * k, 0.1, z + 0.04], 0.2, 0.15, { bone: b, color: DK });
      if (z < 0) pb.sphere(0.27, { bone: b, pos: [0.42 * k, 0.56, z - 0.02], scale: [0.85, 1.0, 1.1], seg: [5, 3], color: DK });
      pb.box(0.36, 0.1, 0.4, { bone: b, pos: [0.54 * k, 0.05, z + 0.08], color: DK_LO });
      for (let i = -1; i <= 1; i++) pb.cone(0.05, 0.18, { bone: b, pos: [(0.54 + i * 0.11) * k, 0.07, z + 0.36], rot: [PI / 2, 0, 0], radial: 4, color: IVORY });
    }
    // tail
    limb(pb, [0, 0.6, -0.5], [0, 0.55, -0.95], 0.29, 0.21, { bone: 'tail1', color: DK, radial: 6 });
    pb.box(0.34, 0.08, 0.26, { bone: 'tail1', pos: [0, 0.82, -0.72], rot: [-0.1, 0, 0], color: SLATE });
    limb(pb, [0, 0.55, -0.95], [0, 0.5, -1.25], 0.21, 0.13, { bone: 'tail2', color: DK, radial: 6 });
    limb(pb, [0, 0.5, -1.25], [0, 0.47, -1.55], 0.13, 0.05, { bone: 'tail3', color: DK_LO, radial: 6 });
    pb.cone(0.07, 0.3, { bone: 'tail3', pos: [0, 0.46, -1.68], rot: [-PI / 2, 0, 0], radial: 4, color: IVORY, trim: true });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, sd = s.seed * TAU, hit = s.hit, k = s.k, a = s.action;
    const sw = sin(w), cw = cos(w);
    let A = 0.45 * m;
    let bY = 0, bP = 0, bYaw = sin(w) * 0.12 * m, bZ = 0;
    let hX = 0.05 * sin(t * 1.4 + sd), hY = sin(t * 0.6 + sd) * 0.2 * (1 - m), crX = 0, jaw = 0.05;
    let splay = 0, scrapeL = 0, scrapeR = 0, tailY = sin(t * 1.3 + sd) * 0.25 + (-sw * 0.25 * m), tailStiff = 1;
    let gallop = 0;
    let fx = 0, bx = 0, fx2 = 0, bx2 = 0; // leg swings FL,FR,BL,BR
    if (a === 'charge') {
      gallop = 1;
      A = 1.0;
      bP = sin(w * 2) * 0.08;
      hX = 0.32; crX = 0.45;
      tailStiff = 0.1;
      bYaw = 0;
      bY = abs2(sin(w)) * 0.05;
    } else if (a === 'windup') {
      const e = smooth(k / 0.45);
      const ant = smooth((k - 0.78) / 0.22);
      bY = -0.15 * e;
      splay = 0.18 * e;
      hX = 0.5 * e - 0.55 * ant;
      crX = 0.55 * e - 0.3 * ant;
      bP = 0.08 * e - 0.1 * ant;
      scrapeL = e * max(0, sin(k * 22));
      scrapeR = e * max(0, sin(k * 22 + PI));
      tailY = sin(k * 0.7 * 37.7) * 0.6 * e;
      jaw = 0.15 * e;
      bZ = -0.05 * ant;
    } else if (a === 'recover') {
      const sk = bump(k, 0, 0.3) + (k < 0.15 ? 0.4 : 0);
      const shake = smooth((k - 0.22) / 0.1) * (1 - smooth((k - 0.8) / 0.2));
      bP = -0.12 * sk;
      hX = -0.1 * sk + 0.15 * shake;
      hY = sin(k * 1.2 * 33) * 0.55 * shake;
      bYaw = sin(k * 1.2 * 33 + 0.5) * 0.1 * shake;
      fx = fx2 = -0.55 * sk;
      bx = bx2 = -0.2 * sk;
      jaw = 0.2 * shake;
      tailY = sin(k * 1.2 * 20) * 0.4 * shake;
      crX = -0.1 * sk;
    } else if (a === 'attack') {
      const lunge = smooth(k / 0.08) * (1 - smooth((k - 0.2) / 0.4));
      hX = -0.3 * (1 - smooth(k / 0.08)) * 1 + 0.55 * bump(k, 0.05, 0.4);
      jaw = 0.8 * smooth(k / 0.08) * (1 - smooth((k - 0.1) / 0.06)) + 0.05;
      bZ = 0.2 * lunge; bP = 0.12 * lunge;
    }
    // leg swings
    if (gallop) {
      const g1 = sin(w) * A, g2 = sin(w + PI) * A;
      P.rot(B.legFL, g1 * 0.9).rot(B.legFR, g1 * 0.9).rot(B.legBL, g2).rot(B.legBR, g2);
      P.move(B.legFL, 0, max(0, -cos(w)) * 0.12).move(B.legFR, 0, max(0, -cos(w)) * 0.12);
      P.move(B.legBL, 0, max(0, cos(w)) * 0.12).move(B.legBR, 0, max(0, cos(w)) * 0.12);
    } else {
      P.rot(B.legFL, sw * A + fx - 0.3 * scrapeL * 0 - 0.35 * (a === 'windup' ? smooth(k / 0.45) : 0) + 0.8 * scrapeL).rot(B.legBR, sw * A + bx);
      P.rot(B.legFR, -sw * A + fx2 - 0.35 * (a === 'windup' ? smooth(k / 0.45) : 0) + 0.8 * scrapeR).rot(B.legBL, -sw * A + bx2);
      P.move(B.legFL, 0, max(0, -cw) * 0.07 * m).move(B.legBR, 0, max(0, -cw) * 0.07 * m);
      P.move(B.legFR, 0, max(0, cw) * 0.07 * m).move(B.legBL, 0, max(0, cw) * 0.07 * m);
    }
    P.rot(B.legFL, 0, 0, splay).rot(B.legBL, 0, 0, splay).rot(B.legFR, 0, 0, -splay).rot(B.legBR, 0, 0, -splay);
    // body
    P.move(B.body, 0, bY + abs2(cw) * 0.035 * m + sin(t * 2.2 + sd) * 0.01, bZ - 0.1 * hit);
    P.rot(B.body, bP - 0.15 * hit, bYaw, sin(t * 1.1 + sd) * 0.015);
    P.rot(B.head, hX + 0.25 * hit, hY, 0);
    P.rot(B.crest, crX, 0, 0);
    P.rot(B.jaw, jaw + 0.03 * sin(t * 2.2 + sd), 0, 0);
    // tail: counter-wave, stiff in the charge
    const tw = tailStiff;
    P.rot(B.tail1, 0, tailY * tw, 0).rot(B.tail2, 0, tailY * tw * 0.9 + sin(t * 2 - 0.9 + sd) * 0.2 * tw, 0).rot(B.tail3, 0, tailY * tw * 0.9 + sin(t * 2 - 1.8 + sd) * 0.25 * tw, 0);
  },
});

function abs2(x) { return x < 0 ? -x : x; }

// ======================================================================================
// 6.5  STORM WYVERN  (wraith)  — blinker flyer
// ======================================================================================
export const wraith = defineCreature({
  id: 'wraith',
  stride: 1.6,
  blob: 0.9,
  deathTime: 0.5,
  bones: [
    { name: 'root' },
    { name: 'body', pivot: [0, 1.7, 0] },
    { name: 'neck', parent: 'body', pivot: [0, 1.76, 0.28] },
    { name: 'head', parent: 'neck', pivot: [0, 1.98, 0.52] },
    { name: 'jaw', parent: 'head', pivot: [0, 1.94, 0.6] },
    { name: 'wingL1', parent: 'body', pivot: [0.15, 1.82, 0.05] },
    { name: 'wingL2', parent: 'wingL1', pivot: [0.65, 1.82, 0.1] },
    { name: 'wingR1', parent: 'body', pivot: [-0.15, 1.82, 0.05] },
    { name: 'wingR2', parent: 'wingR1', pivot: [-0.65, 1.82, 0.1] },
    { name: 'tail1', parent: 'body', pivot: [0, 1.7, -0.35] },
    { name: 'tail2', parent: 'tail1', pivot: [0, 1.64, -0.72] },
    { name: 'tail3', parent: 'tail2', pivot: [0, 1.56, -1.02] },
    { name: 'legL', parent: 'body', pivot: [0.14, 1.58, -0.05] },
    { name: 'legR', parent: 'body', pivot: [-0.14, 1.58, -0.05] },
  ],
  build(pb) {
    pb.sphere(0.27, { bone: 'body', pos: [0, 1.7, 0], scale: [1, 0.9, 1.55], color: WINE, seg: [7, 5] });
    pb.sphere(0.2, { bone: 'body', pos: [0, 1.6, 0.03], scale: [1, 0.55, 1.45], color: CREAM, seg: [6, 3] });
    limb(pb, [0, 1.74, 0.26], [0, 2.0, 0.52], 0.15, 0.11, { bone: 'neck', color: WINE, radial: 5 });
    pb.box(0.3, 0.26, 0.42, { bone: 'head', pos: [0, 2.03, 0.72], taper: [0.78, 0.7], color: WINE_HI });
    pb.box(0.2, 0.07, 0.3, { bone: 'jaw', pos: [0, 1.93, 0.8], color: WINE_HI });
    shard(pb, [0, 2.22, 0.6], [0, 1, -0.55], 0.065, 0.34, { bone: 'head', color: PRISM, emis: 2.4 });
    pb.mirror((s, k) => {
      pb.cone(0.06, 0.4, { bone: 'head', pos: [0.1 * k, 2.12, 0.54], rot: [-1.25, 0, -0.2 * k], color: IVORY, radial: 4, trim: true });
      oct(pb, 0.055, { bone: 'head', pos: [0.14 * k, 2.07, 0.87], scale: [0.8, 1, 0.9], color: PRISM, emis: 2.4, trim: true });
      pb.cone(0.065, 0.55, { bone: 'head', pos: [0.18 * k, 2.18, 0.46], rot: [-0.95, 0, -0.7 * k], color: IVORY, radial: 4, eliteOnly: true });
      // wings
      const b1 = 'wing' + s + '1', b2 = 'wing' + s + '2';
      limb(pb, [0.15 * k, 1.82, 0.08], [0.65 * k, 1.84, 0.13], 0.07, 0.055, { bone: b1, color: WINE, radial: 5 });
      limb(pb, [0.65 * k, 1.84, 0.13], [1.17 * k, 1.82, -0.02], 0.055, 0.04, { bone: b2, color: WINE, radial: 5 });
      flat2(pb, [[0, 0.06], [0.5, 0.1], [0.52, -0.06], [0.42, -0.28], [0.46, -0.52], [0.27, -0.42], [0.14, -0.64], [0, -0.52]], k, [0.15 * k, 1.82, 0.05], b1, SAFFRON, { gradient: false });
      flat2(pb, [[0, 0.05], [0.26, 0.02], [0.54, -0.12], [0.42, -0.26], [0.48, -0.52], [0.3, -0.42], [0.22, -0.74], [0.1, -0.5], [0, -0.46]], k, [0.65 * k, 1.82, 0.1], b2, SAFFRON_HI, { gradient: false });
      strip2(pb, [0, 0], [0.46, -0.42], 0.07, [0.65 * k, 1.825, 0.1], b2, SAFFRON_LO, { gradient: false, flip: k });
      shard(pb, [0.66 * k, 1.97, 0.14], [0.15 * k, 1, 0.45], 0.065, 0.3, { bone: b2, color: PRISM, emis: 2.4, trim: true });
      // legs
      limb(pb, [0.14 * k, 1.6, -0.05], [0.17 * k, 1.28, -0.16], 0.08, 0.055, { bone: 'leg' + s, color: WINE, radial: 5 });
      pb.box(0.12, 0.07, 0.22, { bone: 'leg' + s, pos: [0.17 * k, 1.23, -0.1], color: IVORY });
      for (let i = -1; i <= 1; i++) pb.cone(0.04, 0.16, { bone: 'leg' + s, pos: [(0.17 + i * 0.045) * k, 1.22, 0.06], rot: [PI / 2, 0, 0], radial: 3, color: IVORY });
      pb.cone(0.04, 0.2, { bone: 'tail3', pos: [0.08 * k, 1.5, -1.3], rot: [-PI / 2 + 0.2, 0, -0.5 * k], radial: 3, color: IVORY, trim: true });
    });
    limb(pb, [0, 1.7, -0.35], [0, 1.64, -0.72], 0.15, 0.1, { bone: 'tail1', color: WINE, radial: 5 });
    limb(pb, [0, 1.64, -0.72], [0, 1.56, -1.02], 0.1, 0.075, { bone: 'tail2', color: WINE, radial: 5 });
    limb(pb, [0, 1.56, -1.02], [0, 1.5, -1.3], 0.075, 0.05, { bone: 'tail3', color: WINE, radial: 5 });
    shard(pb, [0, 1.48, -1.5], [0, -0.1, -1], 0.08, 0.38, { bone: 'tail3', color: PRISM, emis: 2.6 });
  },
  animate(P, s, B) {
    const t = s.t, m = s.move, sd = s.seed * TAU, hit = s.hit, k = s.k, a = s.action;
    const ph = t * 7 + sd, fl = sin(ph), cph = cos(ph);
    let w1 = 0.2 + 0.75 * fl, w2 = -0.55 * cph + 0.1, sweep = 0.22 * m;
    let bY = -0.08 * cph + sin(t * 5.7 + sd) * 0.12, bP = 0.15 * m, bRy = 0, bScale = 1;
    let t1 = 0.12 * sin(ph - 0.8), t2 = 0.15 * sin(ph - 1.5), t3 = 0.2 * sin(ph - 2.2), ty = sin(t * 1.8 + sd) * 0.2;
    let nX = 0.05 * sin(ph), hX = 0.1 * sin(ph - 0.6), hY = sin(t * 0.8 + sd) * 0.25, jaw = 0.06 + 0.05 * sin(t * 2 + sd);
    let lg = 0.25 + 0.12 * sin(ph - 0.5) - 0.35 * m;
    let wLflinch = 0;
    if (a === 'blink') {
      const sn = ob(k / 0.22);
      w1 = lerp(w1, 1.35, sn) + sin(t * 70) * 0.04 * sn;
      w2 = lerp(w2, 0.25, sn);
      sweep = 0;
      bY = lerp(bY, -0.15, sn) + 0.04 * sin(t * 60) * sn;
      bP = lerp(bP, 0.2, sn);
      t1 = lerp(t1, -0.6, sn); t2 = lerp(t2, -0.6, sn); t3 = lerp(t3, -0.7, sn); ty *= 1 - sn;
      nX = -0.3 * sn; hX = 0.4 * sn; hY *= 1 - sn;
      lg = lerp(lg, 0.8, sn);
      jaw = 0.3 * sn;
      const u = smooth((k - 0.84) / 0.16);
      bScale = 1 - 0.92 * u; bRy = PI * u;
    } else if (a === 'arrive') {
      const sc = ob(k / 0.43);
      bScale = sc;
      const open = lerp(0.12, 0.4, smooth(k / 0.3));
      w1 = lerp(open + 0.15 * sin(k * 20), w1, smooth((k - 0.4) / 0.6));
      w2 = lerp(0.05, w2, smooth((k - 0.4) / 0.6));
      const wh = bump(k, 0, 0.55);
      t1 = 0.9 * wh; t2 = 0.8 * wh; t3 = 0.7 * wh; ty = 0.5 * sin(k * 14) * (1 - k);
      nX = 0.2 * wh; hX = 0.3 * wh; jaw = 0.4 * wh;
      bY += 0.05 * wh;
    } else if (a === 'attack') {
      const q = bump(k, 0, 0.5);
      bP += 0.4 * q; hX += 0.3 * q; jaw = 0.6 * bump(k, 0, 0.3); t1 += 0.5 * q;
    }
    wLflinch = hit;
    P.rot(B.wingL1, 0, sweep, w1 - 0.7 * wLflinch).rot(B.wingR1, 0, -sweep, -w1 + 0.15 * wLflinch);
    P.rot(B.wingL2, 0, 0, w2).rot(B.wingR2, 0, 0, -w2);
    P.move(B.body, 0, bY, -0.12 * hit);
    P.rot(B.body, bP - 0.3 * hit, bRy, sin(t * 1.5 + sd) * 0.05 + 0.15 * hit);
    if (bScale !== 1) P.scale(B.body, bScale, bScale, bScale);
    P.rot(B.neck, nX, 0, 0).rot(B.head, hX, hY, 0).rot(B.jaw, jaw, 0, 0);
    P.rot(B.tail1, t1, ty, 0).rot(B.tail2, t2, ty * 1.1, 0).rot(B.tail3, t3, ty * 1.2, 0);
    P.rot(B.legL, lg, 0, 0).rot(B.legR, lg, 0, 0);
  },
});

// ======================================================================================
// 6.6  KOBOLD PRISM-SHAMAN  (prismHexer)  — support
// ======================================================================================
const KB = 0xa33a3e, KB_LO = 0x7a2a34, HIDE = 0xc9b28a;

export const prismHexer = defineCreature({
  id: 'prismHexer',
  stride: 1.0,
  blob: 0.7,
  bones: [
    { name: 'root' },
    { name: 'hips', pivot: [0, 0.45, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 0.5, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 0.9, 0.05] },
    { name: 'jaw', parent: 'head', pivot: [0, 0.93, 0.2] },
    { name: 'frill', parent: 'head', pivot: [0, 1.0, -0.06] },
    { name: 'armL', parent: 'spine', pivot: [0.22, 0.84, 0.02] },
    { name: 'foreL', parent: 'armL', pivot: [0.2, 0.64, 0.12] },
    { name: 'armR', parent: 'spine', pivot: [-0.22, 0.84, 0.02] },
    { name: 'foreR', parent: 'armR', pivot: [-0.22, 0.62, 0.1] },
    { name: 'weapon', parent: 'foreR', pivot: [-0.2, 0.5, 0.3] },
    { name: 'crystal', parent: 'weapon', pivot: [-0.2, 2.3, 0.3] },
    { name: 'legL', parent: 'hips', pivot: [0.1, 0.45, 0] },
    { name: 'legR', parent: 'hips', pivot: [-0.1, 0.45, 0] },
    { name: 'tail1', parent: 'hips', pivot: [0, 0.45, -0.12] },
    { name: 'tail2', parent: 'tail1', pivot: [0, 0.42, -0.5] },
  ],
  build(pb) {
    pb.box(0.38, 0.44, 0.32, { bone: 'spine', pos: [0, 0.72, 0.02], taper: [0.88, 0.85], color: KB });
    pb.box(0.24, 0.3, 0.05, { bone: 'spine', pos: [0, 0.68, 0.19], color: CREAM });
    pb.cyl(0.24, 0.32, 0.2, { bone: 'spine', pos: [0, 0.88, 0.02], radial: 7, color: HIDE });
    pb.box(0.34, 0.2, 0.3, { bone: 'hips', pos: [0, 0.47, 0], color: HIDE });
    // head
    pb.box(0.4, 0.34, 0.34, { bone: 'head', pos: [0, 1.04, 0.1], taper: [0.85, 0.8], color: KB });
    pb.box(0.22, 0.15, 0.26, { bone: 'head', pos: [0, 0.99, 0.35], color: KB });
    pb.box(0.2, 0.06, 0.26, { bone: 'jaw', pos: [0, 0.92, 0.34], color: CREAM });
    fan2(pb, [[-0.1, 0], [-0.3, 0.02], [-0.36, 0.2], [-0.2, 0.34], [0, 0.38], [0.2, 0.34], [0.36, 0.2], [0.3, 0.02], [0.1, 0]], [0, 1.0, -0.08], -0.3, 'frill', SAFFRON, { gradient: false, trim: true });
    pb.mirror((s, k) => {
      oct(pb, 0.055, { bone: 'head', pos: [0.14 * k, 1.09, 0.26], scale: [0.8, 1, 0.9], color: PRISM, emis: 2.4, trim: true });
      pb.cone(0.05, 0.22, { bone: 'head', pos: [0.1 * k, 1.24, 0.04], rot: [-0.8, 0, -0.3 * k], color: IVORY, radial: 4 });
      pb.cone(0.06, 0.4, { bone: 'head', pos: [0.18 * k, 1.28, 0.0], rot: [-0.6, 0, -0.6 * k], color: IVORY, radial: 4, eliteOnly: true });
    });
    // arms (left hand grips the totem higher up)
    limb(pb, [-0.22, 0.84, 0.02], [-0.22, 0.62, 0.1], 0.065, 0.06, { bone: 'armR', color: KB, radial: 5 });
    limb(pb, [-0.22, 0.62, 0.1], [-0.2, 0.5, 0.3], 0.06, 0.055, { bone: 'foreR', color: KB, radial: 5 });
    pb.box(0.12, 0.12, 0.12, { bone: 'foreR', pos: [-0.2, 0.5, 0.3], color: KB_LO });
    limb(pb, [0.22, 0.84, 0.02], [0.2, 0.66, 0.12], 0.065, 0.06, { bone: 'armL', color: KB, radial: 5 });
    limb(pb, [0.2, 0.66, 0.12], [-0.13, 0.8, 0.3], 0.06, 0.055, { bone: 'foreL', color: KB, radial: 5 });
    pb.box(0.12, 0.12, 0.12, { bone: 'foreL', pos: [-0.14, 0.8, 0.3], color: KB_LO });
    // legs
    pb.mirror((s, k) => {
      limb(pb, [0.1 * k, 0.5, 0], [0.12 * k, 0.3, 0.07], 0.09, 0.07, { bone: 'leg' + s, color: KB, radial: 5 });
      limb(pb, [0.12 * k, 0.3, 0.07], [0.11 * k, 0.07, -0.02], 0.07, 0.055, { bone: 'leg' + s, color: KB, radial: 5 });
      pb.box(0.15, 0.08, 0.26, { bone: 'leg' + s, pos: [0.11 * k, 0.04, 0.07], color: KB_LO });
      pb.cone(0.04, 0.14, { bone: 'leg' + s, pos: [0.11 * k, 0.05, 0.25], rot: [PI / 2, 0, 0], radial: 3, color: IVORY, trim: true });
    });
    // tail
    limb(pb, [0, 0.5, -0.1], [0, 0.42, -0.5], 0.11, 0.065, { bone: 'tail1', color: KB, radial: 5 });
    limb(pb, [0, 0.42, -0.5], [0, 0.37, -0.82], 0.065, 0.035, { bone: 'tail2', color: KB, radial: 5 });
    // totem
    pb.cyl(0.05, 0.06, 1.95, { bone: 'weapon', pos: [-0.2, 0.975, 0.3], radial: 5, color: WOOD });
    for (const y of [0.9, 1.3, 1.7]) pb.cyl(0.1, 0.1, 0.09, { bone: 'weapon', pos: [-0.2, y, 0.3], radial: 6, color: IVORY, trim: y > 1.0 });
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      pb.cone(0.05, 0.36, { bone: 'weapon', pos: [-0.2 + dx * 0.13, 2.03, 0.3 + dz * 0.13], rot: aim(dx * 0.35, 1, dz * 0.35), radial: 4, color: IVORY, trim: true });
    }
    crystal(pb, 0.21, 0.78, { bone: 'crystal', pos: [-0.2, 2.34, 0.3], radial: 6, color: PRISM, emis: 3 });
  },
  animate(P, s, B) {
    const t = s.t, w = s.walk, m = s.move, sd = s.seed * TAU, hit = s.hit, k = s.k;
    const cast = s.action === 'cast', atk = s.action === 'attack';
    const sw = sin(w), cw = cos(w);
    const A = 0.5 * m;
    P.rot(B.legL, sw * A).rot(B.legR, -sw * A);
    P.move(B.legL, 0, max(0, -cw) * 0.05 * m).move(B.legR, 0, max(0, cw) * 0.05 * m);
    let hipY = -0.05 * sw * sw * m, lean = 0.12 * m, headX = 0.04 * sin(t * 1.5 + sd), env = 0;
    // arm chain, net totem lean solved against the arm rotations
    let rr = -0.12 + 0.18 * sw * m, fr = 0, net = 0.1 + 0.07 * sw * m + 0.02 * sin(t * 1.2 + sd);
    let aL = 0, fL = 0, spin = t * 0.8 + sd, cs = 1 + 0.05 * sin(t * 2.4 + sd), jaw = 0.04;
    let tailY = sin(t * 2 + sd) * 0.3 + sin(w) * 0.3 * m;
    if (cast) {
      const up = smooth(k / 0.4);
      const sl = smooth((k - 0.4) / 0.08);
      const rel = smooth((k - 0.72) / 0.28);
      env = up * (1 - rel);
      const raised = up * (1 - sl);
      const held = sl * (1 - rel);
      rr = lerp(rr, -1.5, raised) + (-0.45 - rr) * held * 0 - 0.4 * held;
      fr = -0.7 * raised - 0.2 * held;
      net = lerp(net, 0.05, raised) + 0.0 * held;
      aL = -1.4 * (raised + held * 0.5) * (1 - rel);
      fL = -0.5 * (raised + held) * (1 - rel);
      lean = -0.18 * raised + 0.3 * held + lean * (1 - raised - held);
      hipY -= 0.12 * held * (1 - smooth((k - 0.55) / 0.2));
      spin += 6 * PI * smooth(k);
      cs = 1 + 0.4 * env;
      headX += 0.1 * raised;
      jaw = 0.2 * env;
    } else if (atk) {
      const q = bump(k, 0, 0.4);
      rr -= 0.5 * q; lean += 0.2 * q; jaw = 0.4 * q;
    }
    lean += 0.35 * hit; headX += 0.3 * hit;
    P.move(B.hips, 0, hipY, 0);
    P.rot(B.spine, lean, sw * 0.08 * m, 0.03 * sin(t * 1.3 + sd));
    P.rot(B.head, headX, sin(t * 0.7 + sd) * 0.25 * (1 - m), 0);
    P.rot(B.jaw, jaw, 0, 0);
    P.scale(B.frill, 1 + 0.3 * env + 0.04 * sin(t * 2 + sd), 1 + 0.1 * env, 1);
    P.rot(B.armR, rr, 0, 0).rot(B.foreR, fr, 0, 0).rot(B.weapon, net - rr - fr, 0, 0);
    P.rot(B.armL, aL, 0, 0.05).rot(B.foreL, fL, 0, 0);
    P.rot(B.crystal, 0, spin, 0).scale(B.crystal, cs, cs, cs);
    P.rot(B.tail1, 0.05 * sin(t * 1.4 + sd), tailY, 0).rot(B.tail2, 0, tailY * 0.8 + 0.15 * sin(t * 2 - 1 + sd), 0);
  },
});

export const REGISTER = { shardling, colossus, voidSpitter, crystalRam, wraith, prismHexer };
