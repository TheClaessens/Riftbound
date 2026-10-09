import * as THREE from 'three';
import { step } from '../textures.js';
import { CLOUD_STYLE } from '../clouds.js';

// a snow-laden squall cloud: bright top, slate-blue belly (registered into the toolkit's cloud styles)
CLOUD_STYLE.frostSquall = { lit: 0xf0f5fb, shadow: 0x8197b2, puffs: 9 };

// =====================================================================================
//  FROST element VFX (bundle B; design/VFX.md, bible 10 §2.3 / §4). Squall, rime, glacier ice, cold mist.
//  Every frost effect has three layers:
//    ground  rime decal ('frost') that creeps out with a navy front and RECEDES at the end
//    solid   faceted hex ICE (this file's IceSystem: toon 3-band, rime tips, navy inverted-hull
//            outline like the creatures; it holds, flashes a crack, then shatters into chips)
//    air     painted snow (streaks driven by wind, tumbling flakes, swirling spindrift) + cold mist
//
//  IceSystem: ONE instanced crystal mesh + its outline hull (2 draws for every ice object of every
//  frost skill: shard heads, spike rings, armor plates, road spikes, glacier spikes). It is ticked
//  through game.vfx.zones and cleared with game.vfx.clear() (runtime wrap, see ice()).
//
//  Exported helpers (reactions bundle, fusions):
//    frostCreep(game, pos, r, grow, life, o)  rime decal at exactly r            -> decal handle
//    spikeRing(game, pos, r, n, o)            n ice spikes standing ON radius r, tilted outward -> [handles]
//    iceShatter(game, pos, r, n, o)           n glassy chips + glints + crack star landing inside r
//    squall(game, pos, r, life, o)            a mini blizzard (cloud, snow, rime, spikes at r), merged
//                                             with any live squall within 1.5 u (spam rule)
//    frostMist(game, pos, r, n)               low painted cold-mist ring rolling out to r
//    frostSpike(game, pos, o) / iceHandle helpers: breakIce(h, delay), freeIce(h)
//    shardLook(game, o)                       Projectile visual hooks for an icicle (Ice Shard, Hailstorm)
//    frostTier(game)                          spam LOD tier 0 / 1 / 2 (bible §5.5, keyed off fx.heat)
// =====================================================================================

// ------------------------------------------------------------------ palette (bible 10 §2.2)
export const FROST = {
  core: 0xffffff, rime: 0xe8f6ff, ice: 0xbff4ff, body: 0x7fe0ff, glacier: 0x3fa8e0,
  shadow: 0x1f6fa8, navy: 0x1b3a5c, mist: 0xcfe8f4,
};

const FADE = [[0, 0], [0.06, 1], [0.85, 1], [1, 0]];

export const PARTICLES = {
  // snow whipping AROUND a zone (orbit mode: circles the centre, falls slowly, velocity-stretched)
  frostSwirl: { layer: 'paint', cell: 'streak', orient: 'orbit', life: [0.7, 1.0], size: [0.13, 0.18], stretch: 0.5,
    swirl: [0.75, 1.05], pull: [0.0, 0.05], rise: [-1.7, -1.0], color: 0xffffff, shade: 0xb4cbe2,
    alpha: FADE, fill: 0.95, ink: 0.9, erode: [[0, 0], [0.8, 0], [1, 0.8]] },
  // r5 Blizzard / squall pull: the same snow, sucked inward (~ -1 u/s at R 3.5)
  frostSwirlIn: { layer: 'paint', cell: 'streak', orient: 'orbit', life: [0.7, 1.0], size: [0.13, 0.18], stretch: 0.5,
    swirl: [0.9, 1.2], pull: [0.28, 0.36], rise: [-1.6, -0.9], color: 0xffffff, shade: 0xb4cbe2,
    alpha: FADE, fill: 0.95, ink: 0.9, erode: [[0, 0], [0.8, 0], [1, 0.8]] },
  // low spindrift gusts racing along the ground around the zone (comma curls, painted, alpha <= 0.5)
  frostSpindrift: { layer: 'paint', cell: 'curl', orient: 'orbit', life: [0.8, 1.15], size: [0.55, 0.85], stretch: 0.12,
    swirl: [0.85, 1.15], pull: [0.0, 0.04], rise: [-0.05, 0.08], color: 0xf6fbff, shade: 0xc0d6ea,
    alpha: [[0, 0], [0.2, 0.5], [0.7, 0.45], [1, 0]], fill: 0.8, ink: 0.65,
    erode: [[0, 0.5], [0.25, 0.05], [0.7, 0.15], [1, 1]] },
  // snow-drift ridge lumps along a zone edge (camera-facing toon puffs, sun-lit top, navy-grey ink)
  frostBank: { layer: 'paint', cell: 'puff', orient: 'ground', life: [1.0, 1.4], size: [0.42, 0.62], stretch: 2.6, spread: 0,
    color: 0xffffff, shade: 0xbcd2e8, alpha: [[0, 0], [0.12, 0.92], [0.78, 0.92], [1, 0]], fill: 0.95, ink: 0.9,
    sizeCurve: [[0, 0.45], [0.18, 1], [1, 0.8]], erode: [[0, 0.35], [0.15, 0], [0.7, 0.04], [1, 1]] },
  // low cold fog inside a zone (whiter than the toolkit's coldFog, alpha <= 0.3)
  frostFog: { layer: 'paint', cell: 'puff', life: [1.6, 2.2], size: [1.3, 1.9], spin: [-0.2, 0.2], drag: 0.6, spread: 0,
    color: 0xf4faff, shade: 0xdbe8f4, alpha: [[0, 0], [0.25, 0.2], [0.75, 0.18], [1, 0]], fill: 0.6, ink: 0,
    erode: [[0, 0.5], [0.3, 0.1], [0.7, 0.15], [1, 0.9]] },
  // small cold puff: sublimation, breath, impact mist, ski spray (painted, alpha <= 0.5)
  frostPuff: { layer: 'paint', cell: 'puff', life: [0.5, 0.8], size: [0.45, 0.7], speed: [0.3, 0.8], up: 0.6, drag: 2.5,
    gravity: -0.4, spin: [-0.5, 0.5], spread: 0.15, color: 0xf2f9ff, shade: 0xb4cce4,
    alpha: [[0, 0], [0.1, 0.5], [0.6, 0.45], [1, 0]], fill: 0.85, ink: 0.45,
    sizeCurve: [[0, 0.5], [1, 1.3]], erode: [[0, 0.1], [0.4, 0.1], [1, 1]] },
  // white crack-star (cast flash, pierce, split, spike crack): 1-3 frames, tiny HDR accent
  frostStar: { layer: 'glow', cell: 'star', count: 1, life: [0.07, 0.11], size: [0.55, 0.75], spin: [-1, 1], spread: 0,
    color: [[0, 0xffffff, 1.9], [1, 0xbff4ff, 1.4]], fill: 0.35, ink: 0.8, sizeCurve: [[0, 0.5], [0.3, 1], [1, 0.3]] },
  // icicle contrail segment: a painted streak, stretched along a slow forward velocity
  frostContrail: { layer: 'paint', cell: 'streak', life: [0.11, 0.15], size: [0.19, 0.23], stretch: 4.5, spread: 0,
    color: 0xeef8ff, shade: 0xc4dcef, alpha: [[0, 0.62], [1, 0]], fill: 0.75, ink: 0.4, erode: [[0, 0], [0.4, 0.2], [1, 0.9]] },
  // rime scratch on the ground under a shard's path (ground-flat streak pointing along the throw)
  frostRime: { layer: 'paint', cell: 'streak', orient: 'ground', life: [0.7, 0.9], size: [0.16, 0.22], stretch: 5, spread: 0,
    color: 0xe8f6ff, shade: 0xa8c8e4, alpha: [[0, 0], [0.08, 0.62], [0.6, 0.5], [1, 0]], fill: 0.85, ink: 0.85,
    erode: [[0, 0], [0.5, 0.1], [1, 1]] },
  // Absolute Zero: driven snow spiralling INTO the funnel (accelerates as it closes in)
  frostInspiral: { layer: 'paint', cell: 'streak', orient: 'orbit', life: [0.9, 1.2], size: [0.12, 0.16], stretch: 0.22,
    swirl: [1.6, 2.2], pull: [0.9, 1.3], rise: [0.6, 1.6], color: 0xffffff, shade: 0xb0c8e0,
    alpha: FADE, fill: 0.95, ink: 0.85, erode: [[0, 0], [0.75, 0], [1, 0.9]] },
};

export const SHELLS = {
  // Absolute Zero: a howling snow funnel, wide at the ground (drawn with a negative height)
  frostFunnel: { geo: 'funnel', mode: 'paint', tile: [7, 1], scroll: [1.5, 0.5], twist: 0.9, erode: 0.45, wobble: 0.12,
    fade: [0.35, 0.25], frontAlpha: 1,
    color: step([[0, 0x2a4a70], [0.13, 0xd4e8fa], [0.5, 0xffffff]]), alpha: step([[0, 0.7], [0.13, 0.32], [0.5, 0.46]]) },
  // Absolute Zero: the violet shatter wave (a short glowing band sweeping out)
  frostArcaneWave: { geo: 'cylinder', mode: 'glow', tile: [12, 1], scroll: [0.8, -2.0], twist: 0.1, erode: 0.1, wobble: 0,
    fade: [0.03, 0.1], frontAlpha: 0.7, hdr: 1,
    color: step([[0, 0x1a0633], [0.12, 0x8a4dff, 1.25], [0.4, 0xc08cff, 1.55], [0.75, 0xe6d4ff, 1.9]]),
    alpha: step([[0, 0.7], [0.12, 0.45], [0.4, 0.35], [0.75, 0.3]]) },
};

// Shatter chips: short (<= 0.6 s on the ground so they never read as XP gems), pale, lit by the sun.
export const DEBRIS = {
  frostChip: { geo: 'shard', color: 0xa6d6f0, emis: [0x9fe9ff, 0.08], scale: [0.05, 0.1], stretch: 1.9, speed: [3, 6], up: 0.9,
    gravity: 20, bounce: 0.3, life: [0.35, 0.55] },
  frostChipV: { geo: 'shard', color: 0xb8c8f0, emis: [0xb67cff, 0.6], cool: 0.5, scale: [0.07, 0.14], stretch: 2.0, speed: [4, 8],
    up: 0.8, gravity: 20, bounce: 0.3, life: [0.4, 0.6] },
  frostHail: { geo: 'chunk', color: 0xcfe6f6, scale: [0.06, 0.09], speed: [1.2, 2.2], up: -3.6, gravity: 26, bounce: 0.35,
    life: [0.45, 0.58] },
};

// ------------------------------------------------------------------ small utils
const rnd = (a, b) => a + Math.random() * (b - a);
const _Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();
const _pt = { x: 0, y: 0, z: 0 };
const _vel = { x: 0, y: 0, z: 0 };
const _eo = { count: 1, scale: 1, vel: _vel, speed: 1 };
const _dir = { x: 0, y: 0, z: 0 };

// spam LOD tier (bible §5.5): 0 calm, 1 busy, 2 extreme. Keyed off the classic fx heat.
export function frostTier(game) {
  const h = game.fx?.heat ?? 0;
  return h < 80 ? 0 : h < 240 ? 1 : 2;
}

// One particle with an exact velocity (no allocation). scale = size multiplier.
function puff1(vfx, name, x, y, z, vx, vy, vz, scale = 1) {
  _pt.x = x; _pt.y = y; _pt.z = z;
  _vel.x = vx; _vel.y = vy; _vel.z = vz;
  _eo.count = 1; _eo.scale = scale; _eo.speed = 1; _eo.vel = _vel;
  vfx.emit(name, _pt, _eo);
}
export { puff1 as frostParticle };

// =====================================================================================
//  ICE SYSTEM: faceted hex crystals with a navy outline hull (2 draws total)
// =====================================================================================
const CAP = 320;
const TIP_RING = 0.62, BASE_RING = 0.16;

function crystalGeometry() {
  // hex prism with pyramid caps along +Y, y 0..1, radius 1 (flat facets: non-indexed)
  const ring = (y, r) => { const o = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; o.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return o; };
  const A = ring(BASE_RING, 1), B = ring(TIP_RING, 1), bot = [0, 0, 0], top = [0, 1, 0];
  const pos = [];
  const tri = (a, b, c) => {
    // wind outward: compare the face normal with the direction from the crystal axis
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3 - 0.5, cz = (a[2] + b[2] + c[2]) / 3;
    if (nx * cx + ny * cy + nz * cz < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(bot, A[i], A[j]);
    tri(A[i], A[j], B[j]); tri(A[i], B[j], B[i]);
    tri(B[i], B[j], top);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const ICE_VS = /* glsl */`
  attribute vec4 iA;   // x rime (white), y crack flash, z live glow (tip), w hull light (hoarfrost)
  attribute vec4 iB;   // rgb body tint, w violet rim
  uniform float uOutline;
  varying vec3 vN; varying float vY; varying vec4 vA; varying vec4 vB;
  void main() {
    vec3 p = position;
    mat3 M = mat3(instanceMatrix);
    vec3 s2 = vec3(dot(M[0], M[0]), dot(M[1], M[1]), dot(M[2], M[2]));
    vN = normalize(M * (normal / max(s2, vec3(1e-6))));
    vec4 wp = instanceMatrix * vec4(p, 1.0);
    #ifdef HULL
      vec3 hd = normalize(M * (normalize(vec3(p.x, (p.y - 0.5) * 0.7, p.z) + 1e-5) / max(s2, vec3(1e-6))));
      wp.xyz += hd * uOutline * (1.0 + 0.4 * iA.w);
    #endif
    vY = p.y; vA = iA; vB = iB;
    gl_Position = projectionMatrix * modelViewMatrix * wp;
  }`;

const ICE_FS = /* glsl */`
  uniform vec3 uSun; uniform vec3 uView;
  uniform vec3 uLit; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uRime; uniform vec3 uNavy;
  varying vec3 vN; varying float vY; varying vec4 vA; varying vec4 vB;
  void main() {
    #ifdef HULL
      vec3 hc = mix(uNavy, uRime * 0.92, vA.w);
      gl_FragColor = vec4(hc, 1.0);
    #else
      vec3 n = normalize(vN);
      float l = dot(n, uSun);
      vec3 col = l > 0.3 ? uLit : (l > -0.15 ? uMid : uDeep);       // 3 toon bands from the real sun
      col *= vB.rgb;
      float up = smoothstep(0.5, 0.7, n.y);                         // rime settles on up-facing facets
      float tip = smoothstep(0.8, 0.93, vY);
      col = mix(col, uRime, clamp(max(up * 0.75, tip * 0.85) + vA.x, 0.0, 1.0));
      float fr = 1.0 - max(dot(n, uView), 0.0);
      col = mix(col, vec3(0.75, 0.55, 1.0), vB.w * smoothstep(0.35, 0.75, fr));   // violet rim (shatter-ready)
      col = mix(col, vec3(1.0), vA.y);                              // crack flash
      col += vec3(0.55, 0.85, 1.0) * vA.z * tip;                    // "glow = live": only the tip, small
      gl_FragColor = vec4(col, 1.0);
    #endif
  }`;

function lin(hex) { _c.set(hex); return new THREE.Vector3(_c.r, _c.g, _c.b); }

class IceSystem {
  constructor(vfx) {
    this.vfx = vfx;
    const geo = crystalGeometry();
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.aA); geo.setAttribute('iB', this.aB);
    const uni = {
      uSun: { value: new THREE.Vector3(-12, 34, 24).normalize() },
      uView: { value: new THREE.Vector3(1, 1.22, 1).normalize() },
      uLit: { value: lin(0xbdeeff) }, uMid: { value: lin(0x6cc2ec) }, uDeep: { value: lin(0x2f7cbc) },
      uRime: { value: lin(0xf2faff) }, uNavy: { value: lin(FROST.navy) },
      uOutline: { value: 0.036 },
    };
    this.body = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: ICE_VS, fragmentShader: ICE_FS }), CAP);
    this.hull = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: ICE_VS, fragmentShader: ICE_FS, side: THREE.BackSide, defines: { HULL: 1 } }), CAP);
    this.hull.instanceMatrix = this.body.instanceMatrix;
    for (const m of [this.body, this.hull]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0; m.visible = false;
      vfx.scene.add(m);
    }
    this.body.castShadow = true;
    this.body.name = 'frost-ice'; this.hull.name = 'frost-ice-hull';
    this.n = 0;
    this.live = [];
    this.free = [];
    for (let i = 0; i < CAP; i++) this.free.push(this._newRec());
    this.ticking = false;
    this.ticker = { update: (dt) => { this.update(dt); if (this.n === 0) { this.ticking = false; return false; } return true; } };
  }

  _newRec() {
    return { slot: -1, gen: 0, manual: false, px: 0, py: 0, pz: 0, q: new THREE.Quaternion(), sx: 1, sy: 1, sz: 1,
      age: 0, life: 1, grow: 0.12, endKind: 1, chips: 4, chipScale: 1, chipKind: 'frostChip', rise: 0,
      rime: 0, crack: 0, glow: 0, hullL: 0, tr: 1, tg: 1, tb: 1, violet: 0, star: true, brk: -1 };
  }

  ensure() { if (!this.ticking) { this.vfx.zones.push(this.ticker); this.ticking = true; } }

  _alloc() {
    let r = this.free.pop();
    if (!r) { r = this.live[0]; this._remove(0); this.free.pop(); }   // full: steal the oldest
    r.gen++;
    r.slot = this.n++;
    this.live[r.slot] = r;
    r.manual = false; r.age = 0; r.life = 1; r.grow = 0.12; r.endKind = 1; r.chips = 4; r.chipScale = 1;
    r.chipKind = 'frostChip'; r.rise = 0; r.rime = 0; r.crack = 0; r.glow = 0; r.hullL = 0;
    r.tr = r.tg = r.tb = 1; r.violet = 0; r.star = true; r.brk = -1;
    this.ensure();
    return r;
  }

  _remove(i) {
    const r = this.live[i];
    const last = --this.n;
    if (i !== last) { this.live[i] = this.live[last]; this.live[i].slot = i; }
    this.live[last] = null;
    r.slot = -1; r.gen++;
    this.free.push(r);
  }

  // A crystal growing out of the ground at (x, z). o: { h (height), w (half width), axis {x,y,z} (unit, default up),
  //  tilt (rad outward from up, toward dir), dir {x,z}, delay, life (s after appearing), grow (s), end: 'shatter'|'melt',
  //  chips, chipKind, rime, tint [r,g,b], hull (0 navy .. 1 hoarfrost), violet, bury (0..1) }
  sprout(x, z, o = {}) {
    const r = this._alloc();
    const h = o.h ?? 0.6, w = o.w ?? h * 0.2;
    r.sx = w; r.sy = h; r.sz = w * rnd(0.8, 1.05);
    if (o.axis) _v.set(o.axis.x, o.axis.y, o.axis.z).normalize();
    else {
      const t = o.tilt ?? 0;
      const dx = o.dir?.x ?? 0, dz = o.dir?.z ?? 0, dl = Math.hypot(dx, dz) || 1;
      _v.set(dx / dl * Math.sin(t), Math.cos(t), dz / dl * Math.sin(t));
    }
    r.q.setFromUnitVectors(_Y, _v).multiply(_q2.setFromAxisAngle(_Y, Math.random() * 6.283));
    const bury = o.bury ?? 0.22;
    r.px = x - _v.x * h * bury; r.py = (o.y ?? 0) - _v.y * h * bury; r.pz = z - _v.z * h * bury;
    r.age = -(o.delay ?? 0);
    r.life = o.life ?? 1;
    r.grow = o.grow ?? 0.12;
    r.endKind = o.end === 'melt' ? 2 : 1;
    r.chips = o.chips ?? 4; r.chipKind = o.chipKind ?? 'frostChip'; r.chipScale = o.chipScale ?? Math.max(0.6, h * 1.4);
    r.rime = o.rime ?? 0; r.hullL = o.hull ?? 0; r.violet = o.violet ?? 0; r.star = o.star ?? true;
    const t = o.tint; if (t) { r.tr = t[0]; r.tg = t[1]; r.tb = t[2]; }
    r.rise = o.rise ?? 0;
    return { rec: r, gen: r.gen };
  }

  // An instance positioned by its owner every frame (projectile heads, armor plates).
  manual(o = {}) {
    const r = this._alloc();
    r.manual = true; r.life = Infinity; r.age = 0;
    r.glow = o.glow ?? 0; r.rime = o.rime ?? 0; r.hullL = o.hull ?? 0;
    const t = o.tint; if (t) { r.tr = t[0]; r.tg = t[1]; r.tb = t[2]; }
    r.sx = r.sy = r.sz = 0;
    return { rec: r, gen: r.gen };
  }

  ok(h) { return h && h.rec.gen === h.gen && h.rec.slot >= 0; }
  // place a manual crystal: base point (x,y,z), unit axis (ax,ay,az), spin about the axis, length, half width
  place(h, x, y, z, ax, ay, az, spin, len, w) {
    if (!this.ok(h)) return;
    const r = h.rec;
    _v.set(ax, ay, az);
    r.q.setFromUnitVectors(_Y, _v).multiply(_q2.setFromAxisAngle(_Y, spin));
    r.px = x; r.py = y; r.pz = z; r.sx = w; r.sy = len; r.sz = w;
  }
  freeIce(h) { if (this.ok(h)) this._remove(h.rec.slot); }
  // crack + shatter after `delay` s (no-op if already gone)
  breakIce(h, delay = 0, o) {
    if (!this.ok(h)) return;
    const r = h.rec;
    if (o) { if (o.chips !== undefined) r.chips = o.chips; if (o.chipKind) r.chipKind = o.chipKind; if (o.violet !== undefined) r.violet = o.violet; if (o.star !== undefined) r.star = o.star; }
    r.endKind = o?.melt ? 2 : 1;
    if (r.manual) { r.manual = false; r.age = 0; r.grow = 0; }
    const at = Math.max(r.age, 0) + delay + (r.endKind === 1 ? 0.07 : 0.45);
    r.life = Math.min(r.life, at);
  }

  update(dt) {
    const vfx = this.vfx;
    const inst = this.body.instanceMatrix.array, A = this.aA.array, B = this.aB.array;
    for (let i = this.n - 1; i >= 0; i--) {
      const r = this.live[i];
      if (!r.manual) {
        r.age += dt;
        if (r.age >= r.life) {
          if (r.endKind === 1) this._shatter(r);
          this._remove(i);
          continue;
        }
      }
    }
    for (let i = 0; i < this.n; i++) {
      const r = this.live[i];
      let g = 1, crack = 0, sink = 0;
      if (!r.manual) {
        if (r.age < 0) g = 0;
        else if (r.grow > 0 && r.age < r.grow) {
          const k = r.age / r.grow, c1 = 1.7;
          g = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);   // easeOutBack: pops up
        }
        const left = r.life - r.age;
        if (r.endKind === 1 && left < 0.07) crack = 1;
        else if (r.endKind === 2 && left < 0.45) { sink = 1 - left / 0.45; }
      }
      const gy = g * (1 - sink * 0.85);
      _p.set(r.px, r.py + r.rise * Math.min(1, Math.max(0, r.age) * 4), r.pz);
      _s.set(r.sx * g * (1 - sink * 0.35), r.sy * gy, r.sz * g * (1 - sink * 0.35));
      _m.compose(_p, r.q, _s).toArray(inst, i * 16);
      const o = i * 4;
      A[o] = r.rime + sink * 0.5; A[o + 1] = crack; A[o + 2] = r.glow; A[o + 3] = r.hullL;
      B[o] = r.tr; B[o + 1] = r.tg; B[o + 2] = r.tb; B[o + 3] = r.violet;
    }
    for (const m of [this.body, this.hull]) { m.count = this.n; m.visible = this.n > 0; }
    if (this.n > 0) { this.body.instanceMatrix.needsUpdate = true; this.aA.needsUpdate = true; this.aB.needsUpdate = true; }
    void vfx;
  }

  _shatter(r) {
    const vfx = this.vfx;
    // tip-ish point of the crystal (chips burst from its middle)
    _v.set(0, 1, 0).applyQuaternion(r.q);
    const cx = r.px + _v.x * r.sy * 0.5, cy = Math.max(0, r.py + _v.y * r.sy * 0.5), cz = r.pz + _v.z * r.sy * 0.5;
    _pt.x = cx; _pt.y = Math.max(0, cy - 0.3); _pt.z = cz;
    if (r.chips > 0) vfx.debris(r.chipKind, _pt, r.chips, { scale: r.chipScale, speed: 0.55 + r.sy * 0.25 });
    if (r.star && r.sy > 0.35) { _pt.y = cy + 0.15; vfx.emit('frostStar', _pt, { count: 1, scale: Math.min(1, 0.3 + r.sy * 0.35) }); }
  }

  clear() {
    while (this.n > 0) this._remove(this.n - 1);
    for (const m of [this.body, this.hull]) { m.count = 0; m.visible = false; }
    this.ticking = false;
  }
}

// The frost ice system of this game (created on first use; wraps vfx.clear() so it resets with a run).
export function ice(game) {
  const vfx = game.vfx;
  let s = vfx._frostIce;
  if (!s) {
    s = vfx._frostIce = new IceSystem(vfx);
    const clear = vfx.clear.bind(vfx);
    vfx.clear = () => { clear(); s.clear(); SQUALLS.length = 0; };
    try { game.engine?.renderer?.compile(vfx.scene, vfx.camera); } catch { /* first use compiles instead */ }
  }
  return s;
}
export function breakIce(game, h, delay, o) { ice(game).breakIce(h, delay, o); }
export function freeIce(game, h) { ice(game).freeIce(h); }

// A single ice spike sprouting at pos (see IceSystem.sprout for o).
export function frostSpike(game, pos, o) { return ice(game).sprout(pos.x, pos.z, o); }

// =====================================================================================
//  HELPERS (shared with the reactions bundle and the fusions)
// =====================================================================================

// Rime decal: pale crystalline frost creeping out to r with a navy front, glints while live.
// o: { alpha (interior, <= 0.3), fade (recede s), intensity (glints), seed }
export function frostCreep(game, pos, r, grow = 0.5, life = 2, o = {}) {
  return game.vfx.decal('frost', pos, r, life, {
    grow, fade: o.fade ?? Math.min(0.8, life * 0.4), color: o.color ?? FROST.rime, alpha: o.alpha ?? 0.28,
    accent: o.accent ?? FROST.navy, intensity: o.intensity ?? 1, seed: o.seed, yaw: o.yaw,
  });
}

// An annulus of rime from rIn to rOut, built from overlapping creep decals on its mid circle (decals can't
// be holed): keeps rime off the caster's feet. n = 0 picks enough decals to close the ring. -> [handles]
export function ringCreep(game, pos, rIn, rOut, n = 0, grow = 0.4, life = 2, alpha = 0.22) {
  const m = (rIn + rOut) * 0.5, h = Math.max(0.3, (rOut - rIn) * 0.5);
  const cnt = n || Math.max(5, Math.ceil((6.283 * m) / (1.35 * h)));
  const a0 = Math.random() * 6.283, out = [];
  for (let i = 0; i < cnt; i++) {
    const a = a0 + (i / cnt) * 6.283;
    _pt.x = pos.x + Math.cos(a) * m; _pt.z = pos.z + Math.sin(a) * m; _pt.y = 0;
    out.push(frostCreep(game, _pt, h * 1.06, grow, life, { alpha, fade: 0.6, intensity: 1.2 }));
  }
  return out;
}

// n ice spikes standing ON radius r (±4%), tilted outward. o: { h:[min,max], tilt, delay:[min,max] | number,
//  life (hold, s), tint, rime, hull, chips, jitter (angular, 0..1), end } -> array of handles
export function spikeRing(game, pos, r, n, o = {}) {
  const sys = ice(game), out = [];
  const hr = o.h ?? [0.3, 0.5];
  const a0 = Math.random() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + (Math.random() - 0.5) * (o.jitter ?? 0.4)) / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const rr = r * rnd(0.97, 1.02);
    const h = rnd(hr[0], hr[1]);
    const d = Array.isArray(o.delay) ? rnd(o.delay[0], o.delay[1]) : (o.delay ?? 0);
    out.push(sys.sprout(pos.x + c * rr, pos.z + s * rr, {
      h, w: h * (o.wk ?? 0.2), tilt: (o.tilt ?? 0.44) * rnd(0.75, 1.15), dir: { x: c, z: s }, delay: d,
      life: (o.life ?? 1) + rnd(-0.06, 0.06), grow: o.grow ?? 0.1, tint: o.tint, rime: o.rime ?? 0.3, hull: o.hull,
      chips: o.chips ?? 3, end: o.end, violet: o.violet,
    }));
  }
  return out;
}

// n glassy chips + glints + a crack star; pieces land inside r (gravity 20, gone <= 0.6 s).
export function iceShatter(game, pos, r = 1.2, n = 8, o = {}) {
  const vfx = game.vfx;
  const p = { x: pos.x, y: o.y ?? 0.4, z: pos.z };
  vfx.debris(o.violet ? 'frostChipV' : 'frostChip', p, n, { scale: o.scale ?? 1.3, speed: Math.min(1.4, 0.45 + r * 0.32) });
  p.y = (o.y ?? 0.4) + 0.5;
  vfx.emit('iceChip', p, { count: Math.ceil(n * 0.6), scale: 0.7, speed: Math.min(1.3, 0.4 + r * 0.3) });
  if (o.star !== false) vfx.emit('frostStar', p, { count: 1, scale: o.starScale ?? 1 });
}

// Low painted cold-mist ring rolling out to r (stops there: drag).
export function frostMist(game, pos, r, n = 10, o = {}) {
  const vfx = game.vfx;
  const sp = r * 2.2 * (o.speed ?? 1);
  const a0 = Math.random() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + rnd(-0.2, 0.2);
    const c = Math.cos(a), s = Math.sin(a);
    puff1(vfx, 'frostPuff', pos.x + c * (o.r0 ?? 0.4), o.y ?? 0.3, pos.z + s * (o.r0 ?? 0.4), c * sp, 0.15, s * sp, o.scale ?? rnd(1.6, 2.1));
  }
}

// =====================================================================================
//  ICICLE LOOK (Ice Shard, its r5 minis, Hailstorm): Projectile visual hooks
//    const L = shardLook(game, { len, wid, rime, hoar, mini })
//    new Projectile(game, { ...gameplay, mesh: null, onUpdate: L.onUpdate, onDispose: L.onDispose, onHit: L.onHit, ... })
//    L.expire(game, proj, { stick, stickLife })   // call from onExpire (visual only)
// =====================================================================================
export function shardLook(game, o = {}) {
  const len = o.len ?? 1.1, wid = o.wid ?? 0.12;
  const st = { h: null, spin: Math.random() * 6.283, rimeAcc: 0, flakeAcc: Math.random(), glintAcc: Math.random(), ox: 0, oy: 0, oz: 0, init: false, lx: 0, lz: 0 };
  const sys = ice(game);
  const look = {
    onUpdate(g, p, dt) {
      const vfx = g.vfx;
      if (!st.init) {
        st.init = true;
        st.h = sys.manual({ glow: o.mini ? 0.6 : 1.0, hull: o.hoar ? 0.85 : 0, rime: o.rime ?? -0.35 });
        if (o.from) { st.ox = o.from.x - p.pos.x; st.oy = o.from.y - p.pos.y; st.oz = o.from.z - p.pos.z; }
        st.lx = p.pos.x; st.lz = p.pos.z;
      }
      st.spin += dt * 8;
      const k = Math.max(0, 1 - p.age / 0.1);                       // leave the hand, settle on the gameplay line
      const dx = p.dir.x, dz = p.dir.z;
      const hx = p.pos.x + st.ox * k, hy = p.pos.y + st.oy * k, hz = p.pos.z + st.oz * k;
      // tip leads the hit point slightly; base trails
      sys.place(st.h, hx - dx * len * 0.65, hy, hz - dz * len * 0.65, dx, 0, dz, st.spin, len, wid);
      const tier = frostTier(g);
      // contrail: one painted streak segment per frame at the tail
      puff1(vfx, 'frostContrail', hx - dx * len * 0.55, hy, hz - dz * len * 0.55, dx * 1.1, 0, dz * 1.1, o.mini ? 0.7 : 1);
      if (tier >= 2) return;
      // flakes shed from the shard, and a few glints
      st.flakeAcc += dt * (o.mini ? 4 : 10);
      while (st.flakeAcc >= 1) { st.flakeAcc -= 1; puff1(vfx, 'snowflake', hx - dx * len * 0.4, hy - 0.05, hz - dz * len * 0.4, -dx * 0.6 + rnd(-0.4, 0.4), -0.9, -dz * 0.6 + rnd(-0.4, 0.4), rnd(0.42, 0.55)); }
      if (tier === 0) {
        st.glintAcc += dt * (o.mini ? 3 : 6);
        while (st.glintAcc >= 1) { st.glintAcc -= 1; puff1(vfx, 'frostGlint', hx - dx * len * 0.3, hy, hz - dz * len * 0.3, 0, 0.2, 0, 0.45); }
      }
      // rime scratch on the ground under the path
      if (!o.noRime) {
        const mx = p.pos.x - st.lx, mz = p.pos.z - st.lz;
        st.rimeAcc += Math.hypot(mx, mz);
        st.lx = p.pos.x; st.lz = p.pos.z;
        const gap = o.mini ? 0.9 : 0.6;
        while (st.rimeAcc >= gap) {
          st.rimeAcc -= gap;
          const back = st.rimeAcc;                                    // place it where we were
          puff1(vfx, 'frostRime', p.pos.x - dx * back + rnd(-0.06, 0.06), 0.06, p.pos.z - dz * back + rnd(-0.06, 0.06), dx * 0.35, 0, dz * 0.35, (o.hoar ? 1.35 : 1) * (o.mini ? 0.7 : 1));
        }
      }
    },
    onDispose(g) { sys.freeIce(st.h); st.h = null; void g; },
    // pierced a foe: chips spray FORWARD + a 0.06 s white star
    onHit(g, e, p) {
      const vfx = g.vfx, tier = frostTier(g);
      _pt.x = p.pos.x; _pt.y = 0.6; _pt.z = p.pos.z;
      vfx.emit('frostStar', _pt, { count: 1, scale: o.mini ? 0.35 : 0.5 });
      if (tier >= 2) return;
      _dir.x = p.dir.x; _dir.z = p.dir.z;
      vfx.debris('frostChip', _pt, o.mini ? 2 : 4, { dir: _dir, cone: 0.75, scale: 0.9, speed: 0.9 });
      void e;
    },
    // the shard's end. o2: { stick (range expiry: bury at 30 deg), split (r5: crack star only) }
    expire(g, p, o2 = {}) {
      const vfx = g.vfx;
      const dx = p.dir.x, dz = p.dir.z;
      _pt.x = p.pos.x; _pt.y = 0.8; _pt.z = p.pos.z;
      if (o2.split) {
        vfx.emit('frostStar', _pt, { count: 1, scale: 0.75 });
        iceShatter(g, p.pos, 0.8, 3, { star: false, scale: 0.9 });
        return;
      }
      const ranged = p.travelled >= p.range - 1e-6;
      if (ranged && o2.stick !== false && frostTier(g) < 2) {
        // sticks into the ground at 30 deg, holds, crumbles into chips + a snow puff
        const c30 = 0.72, s30 = 0.69;   // ~44 deg: stands clear of the grass
        const tipX = p.pos.x + dx * 0.4, tipZ = p.pos.z + dz * 0.4;
        const hs = sys.sprout(tipX, tipZ, { axis: { x: dx * c30, y: -s30, z: dz * c30 }, h: len * (o2.scale ?? 1), w: wid * (o2.scale ?? 1),
          bury: 0, y: 0.06, delay: 0, grow: 0.0, life: o2.stickLife ?? 0.5, chips: o.mini ? 2 : 5, chipScale: 1, hull: o.hoar ? 0.85 : 0,
          rise: 0, star: false });
        // the crystal's origin is its root: move the root back so the TIP is in the ground
        const h = hs.rec, L8 = len * (o2.scale ?? 1) * 0.8;
        h.px = tipX - dx * c30 * L8; h.py = s30 * L8; h.pz = tipZ - dz * c30 * L8;
        _pt.x = tipX; _pt.y = 0.15; _pt.z = tipZ;
        vfx.emit('frostPuff', _pt, { count: o.mini ? 1 : 2, scale: 0.7 });
        return;
      }
      // stopped on its last pierce: shatters in the air + a mist puff
      iceShatter(g, p.pos, 0.9, o.mini ? 3 : 6, { y: 0.6, star: true, starScale: 0.6, scale: 1 });
      vfx.emit('frostPuff', _pt, { count: 1, scale: 1.0 });
    },
  };
  return look;
}

// =====================================================================================
//  BLIZZARD (recipe 'frostBlizzard'): an actual squall parked over the zone.
//    cloud lid (upwind, pushed up-screen) + cold shadow + creeping rime + wind-slanted driven snow
//    + tumbling flakes + snow whipping round the boundary + low spindrift gusts + a snow-drift ridge
//    and ice spikes exactly at R + low fog. Dissolves: snow thins, cloud boils away, spikes crumble,
//    rime recedes. opts: { radius, life, rank }
// =====================================================================================
const WIND = { x: 0.9, z: -0.45 };   // mostly screen-right so the slant reads

function frostBlizzard(vfx, pos, o) {
  const game = vfx.game;
  const R = o.radius ?? 3.5, rank = o.rank ?? 1;
  let L = o.life ?? 4;
  const dens = 0.8 + 0.1 * (rank - 1);                // bible §4.8: r1 80% … r5 120%
  const wl = Math.hypot(WIND.x, WIND.z);
  const wx = WIND.x / wl * 3.4, wz = WIND.z / wl * 3.4;
  const p = { x: pos.x, y: 0, z: pos.z };
  const pull = rank >= 5;
  const ringR = R * 0.97;
  const parts = {
    shade: vfx.decal('shadow', p, R * 1.05, L + 0.6, { grow: 0.35, fade: 0.5, alpha: 0.2, color: FROST.navy }),
    frost: frostCreep(game, p, R * 0.99, 0.6, L + 0.9, { alpha: 0.1, fade: 0.8, intensity: 1.1 }),
    cloud: vfx.cloud({ x: p.x - wx * 0.3, z: p.z - wz * 0.3 }, { radius: R * 0.66, height: 4.3, style: 'frostSquall', life: L + 0.35,
      puffs: rank >= 3 ? 13 : 11, back: R * 0.3 }),
    streaks: vfx.emitter('snowStreak', { pos: p, radius: R * 0.88, rate: 28 * R * dens, y: [3.0, 3.9], vel: { x: wx, y: -7.5, z: wz }, land: true, life: L, scale: 1.2 }),
    flakes: vfx.emitter('snowflake', { pos: p, radius: R * 0.85, rate: 9 * R * dens, y: [1.4, 3.2], vel: { x: wx * 0.6, y: -2.4, z: wz * 0.6 }, land: true, life: L, scale: 0.7 }),
    swirl: vfx.emitter(pull ? 'frostSwirlIn' : 'frostSwirl', { pos: p, radius: ringR, area: 'ring', rate: 30 * R * dens, y: [0.3, 2.6], life: L }),
    inner: vfx.emitter(pull ? 'frostSwirlIn' : 'frostSwirl', { pos: p, radius: R * 0.62, area: 'ring', rate: 7 * R * dens, y: [0.3, 2.0], life: L }),
    drift: vfx.emitter('frostSpindrift', { pos: p, radius: ringR, area: 'ring', rate: 6 * R * dens, y: [0.1, 0.4], life: L }),
    gust: vfx.emitter('snowDrift', { pos: { x: p.x - wx * 0.35, y: 0, z: p.z - wz * 0.35 }, radius: R * 0.55, rate: 3 * R * dens, y: [0.06, 0.06], vel: { x: wx * 0.8, y: 0, z: wz * 0.8 }, life: L }),
    fog: vfx.emitter('frostFog', { pos: p, radius: R * 0.55, rate: 0.4 * R, y: [0.3, 0.5], vel: { x: wx * 0.25, y: 0, z: wz * 0.25 }, life: Math.max(0.5, L - 1.0) }),
  };
  if (pull) parts.cloud.spin = 0.55;                   // r5: the cloud slowly wheels
  vfx.emit('frostGlint', { x: p.x, y: 0.6, z: p.z }, { count: 6 });
  // edge spikes AT R, sprouting between 0.4 and 0.8 s, irregular, tilted outward
  const nSp = Math.round(Math.min(14, 7 + R * 1.3));
  const spikes = spikeRing(game, p, R, nSp, { h: rank >= 4 ? [0.65, 1.05] : [0.55, 0.9], wk: 0.21, delay: [0.4, 0.8], life: L + 2, tilt: 0.5,
    chips: 2, rime: 0.3, tint: rank >= 4 ? [0.85, 0.92, 1] : undefined });
  const bankBase = 18 * R * dens;
  // patchy rime inside (the ground shows between the patches; the ridge + spikes at R carry the edge)
  const patches = [];
  for (let i = 0, n = Math.round(4 + R * 0.8); i < n; i++) {
    const a = Math.random() * 6.283, rr = R * 0.72 * Math.sqrt((i + Math.random()) / n);
    _pt.x = p.x + Math.cos(a) * rr; _pt.z = p.z + Math.sin(a) * rr;
    patches.push(frostCreep(game, _pt, R * rnd(0.17, 0.28), rnd(0.5, 1.1), L + 0.9, { alpha: 0.17, fade: 0.7, intensity: 1.2 }));
  }
  let driftAcc = 0;
  let t = 0, ended = false, bankAcc = 0, hailAcc = 0;
  const z = {
    pos: p, parts,
    update(dt) {
      t += dt;
      const k = ended ? 0 : Math.max(0, Math.min(1, (L - t) / 0.5, t / 0.25));   // snow thins in the last 0.5 s
      for (const key of ['streaks', 'flakes', 'swirl', 'inner', 'drift', 'gust']) {
        const e = parts[key]; if (!e._base) e._base = e.rate; e.rate = e._base * k;
      }
      // the snow-drift ridge: lumps of snow piling and blowing ALONG the edge (tangential drift)
      const b = vfx.budget();
      bankAcc += dt * bankBase * b * Math.min(1, t / 0.5) * (t < L ? 1 : 0);
      while (bankAcc >= 1) {
        bankAcc -= 1;
        const a = Math.random() * 6.283, c = Math.cos(a), s = Math.sin(a);
        const rr = R * rnd(0.975, 1.02);
        const tv = rnd(0.35, 0.7) * (pull ? 1 : 1);
        puff1(vfx, 'frostBank', p.x + c * rr, 0.06, p.z + s * rr, -s * tv + (pull ? -c * 0.25 : 0), 0, c * tv + (pull ? -s * 0.25 : 0), rnd(0.85, 1.15));
      }
      // small drifts skating across the inside with the wind (texture; the ground shows between them)
      driftAcc += dt * 3.2 * R * b * k;
      while (driftAcc >= 1) {
        driftAcc -= 1;
        const a = Math.random() * 6.283, rr = R * 0.8 * Math.sqrt(Math.random());
        puff1(vfx, 'frostBank', p.x + Math.cos(a) * rr - wx * 0.15, 0.06, p.z + Math.sin(a) * rr - wz * 0.15, wx * 0.3, 0, wz * 0.3, rnd(0.5, 0.8));
      }
      // r4: hail pellets dropping out of the squall and bouncing once
      if (rank >= 4 && t < L) {
        hailAcc += dt * 6 * b;
        while (hailAcc >= 1) {
          hailAcc -= 1;
          const a = Math.random() * 6.283, rr = R * 0.85 * Math.sqrt(Math.random());
          _pt.x = p.x + Math.cos(a) * rr - wx * 0.12; _pt.y = 2.6; _pt.z = p.z + Math.sin(a) * rr - wz * 0.12;
          vfx.debris('frostHail', _pt, 1, {});
        }
      }
      if (!ended && t >= L) z.end();
      return t < L + 1.0;
    },
    end() {
      if (ended) return; ended = true;
      L = Math.min(L, t);
      for (const key of ['streaks', 'flakes', 'swirl', 'inner', 'drift', 'gust', 'fog']) parts[key].stop();
      parts.cloud.end(); parts.frost.end(0.8); parts.shade.end(0.5);
      for (const d of patches) d.end(rnd(0.6, 1.0));
      const sys = ice(game);
      for (const h of spikes) sys.breakIce(h, rnd(0, 0.35), { chips: 2 });
      frostMist(game, p, R * 0.5, 5, { speed: 0.4, y: 0.4 });
    },
  };
  return z;
}

// =====================================================================================
//  SQUALL: the mini blizzard (Hailstorm, reactions). Spam rule (bible §4.3): a new squall within
//  1.5 u (x1.5 when busy) of a live one refreshes that one's visuals instead; beyond 8 full squalls
//  the rest get rime + spikes + snow only, and a cloud on every 3rd.
// =====================================================================================
const SQUALLS = [];
const tierA = (game) => [0.22, 0.17, 0.13][frostTier(game)];      // overlapping squall rime stays light under spam
let squallSerial = 0;

export function squall(game, pos, r = 2, life = 2, o = {}) {
  const vfx = game.vfx, now = vfx.time;
  const tier = frostTier(game);
  const mr = 1.5 * (tier >= 1 ? 1.5 : 1);
  for (const s of SQUALLS) {
    if (s.dead || s.ending) continue;
    if (Math.abs(s.p.x - pos.x) < mr && Math.abs(s.p.z - pos.z) < mr && Math.hypot(s.p.x - pos.x, s.p.z - pos.z) < mr) {
      s.refresh(now + life);
      return s;
    }
  }
  let full = 0;
  for (const s of SQUALLS) if (s.full && !s.dead) full++;
  const isFull = full < 8 && tier < 2;
  const s = makeSquall(game, pos, r, life, isFull, isFull || (squallSerial++ % 3 === 0), o);
  SQUALLS.push(s);
  return s;
}

function makeSquall(game, pos, r, life, full, withCloud, o) {
  const vfx = game.vfx;
  const p = { x: pos.x, y: 0, z: pos.z };
  const sys = ice(game);
  const MAXL = 7;                                         // decal / cloud life cap; refreshed past it
  const s = {
    p, r, full, dead: false, ending: false, endT: vfx.time + life, born: vfx.time,
    decal: frostCreep(game, p, r * 0.99, 0.25, MAXL, { alpha: tierA(game), fade: 0.6 }),
    cloud: withCloud ? vfx.cloud(p, { radius: r * 0.55, height: 2.8, style: 'frostSquall', life: life + 0.35, puffs: 4, back: r * 0.25 }) : null,
    snow: vfx.emitter('snowflake', { pos: p, radius: r * 0.8, rate: 16, y: [1.2, 2.4], vel: { x: 0.8, y: -2.2, z: -0.4 }, land: true, scale: 0.55 }),
    streak: vfx.emitter('snowStreak', { pos: p, radius: r * 0.8, rate: full ? 12 : 6, y: [2.0, 2.5], vel: { x: 2.4, y: -6.5, z: -1.2 }, land: true, scale: 0.85 }),
    swirl: full ? vfx.emitter(o.pull ? 'frostSwirlIn' : 'frostSwirl', { pos: p, radius: r * 0.95, area: 'ring', rate: 14, y: [0.25, 1.4], scale: 0.85 }) : null,
    drift: full ? vfx.emitter('frostSpindrift', { pos: p, radius: r * 0.95, area: 'ring', rate: 4, y: [0.1, 0.3], scale: 0.7 }) : null,
    spikes: spikeRing(game, p, r, full ? 5 : 3, { h: [0.35, 0.55], wk: 0.2, delay: [0.08, 0.25], life: 30, tilt: 0.5, chips: 2 }),
    refresh(until) {
      s.endT = Math.max(s.endT, until);
      if (s.cloud) s.cloud.life = Math.max(s.cloud.life, s.cloud.age + (s.endT - vfx.time) + 0.35);
      if (!s.decal.alive || s.decal.birth + s.decal.life < s.endT + 0.7) {
        // the rime outlived its cap: lay a fresh sheet (instant) and let the old one go
        const old = s.decal;
        s.decal = frostCreep(game, p, r * 0.99, 0.02, MAXL, { alpha: tierA(game), fade: 0.6 });
        old.end(0.25);
      }
    },
  };
  if (full) vfx.emit('frostFog', { x: p.x, y: 0.4, z: p.z }, { count: 2, scale: 0.55 });
  vfx.zones.push({
    update() {
      if (s.dead) return false;
      const now = vfx.time;
      if (!s.ending && now >= s.endT) {
        s.ending = true;
        for (const e of [s.snow, s.streak, s.swirl, s.drift]) e?.stop();
        s.cloud?.end();
        s.decal.end(0.6);
        for (const h of s.spikes) sys.breakIce(h, rnd(0, 0.2), { chips: 2, star: false });
        s.deadAt = now + 0.7;
      }
      if (s.ending && now >= s.deadAt) {
        s.dead = true;
        const i = SQUALLS.indexOf(s); if (i >= 0) SQUALLS.splice(i, 1);
        return false;
      }
      return true;
    },
    end() { s.endT = Math.min(s.endT, vfx.time); },
  });
  return s;
}

// =====================================================================================
//  FROST NOVA (recipe 'frostNova'): the ground flash-freezes outward from the feet and throws up
//  a ring of ice spikes exactly at R. opts: { radius, dur (front 0.35 s), rank, second (r5 aftershock) }
// =====================================================================================
function frostNova(vfx, pos, o) {
  const game = vfx.game;
  const R = o.radius ?? 4.5, dur = o.dur ?? 0.35, rank = o.rank ?? 1, second = !!o.second;
  const p = { x: pos.x, y: 0, z: pos.z };
  const r4 = rank >= 4;
  const CLEAR = 0.9;                                  // the caster stands here: no paint, no rime over the hero
  // A: a small white star at the feet, a few glints
  vfx.emit('frostStar', { x: p.x, y: 0.12, z: p.z }, { count: 1, scale: second ? 0.6 : 0.9 });
  vfx.emit('frostGlint', { x: p.x, y: 0.3, z: p.z }, { count: 3 });
  // T front: rime races out to R with the damage front as two rings of rime (inner one first), holed
  // around the caster's feet so the hero never sits under a pale wash. The aftershock adds no rime.
  const rimeA = second ? [] : ringCreep(game, p, CLEAR, R * 0.62, 0, dur * 0.6, 2.0, 0.22);
  const rimeB = [];
  if (!second) frostMist(game, p, R * 0.85, 10, { speed: 1.25, y: 0.3, scale: 1.7, r0: CLEAR + 0.5 });
  else frostMist(game, p, R * 0.85, 5, { speed: 1.0, y: 0.25, scale: 1.3, r0: Math.max(CLEAR + 0.5, R * 0.6) });
  // I: the spike ring erupts at exactly R as the front arrives (second pulse: shorter, R - 0.4).
  //    Each slot is a main spike leaning out plus a smaller one beside it, so the ring reads as a jagged wall.
  const hk = r4 ? 1.3 : 1;
  const tint = r4 ? [0.72, 0.84, 1.0] : undefined;
  const nS = Math.round(Math.min(20, 12 + R));
  if (second) {
    spikeRing(game, p, Math.max(0.6, R - 0.4), nS - 2, { h: [0.4, 0.55], wk: 0.2, delay: [dur * 0.88, dur * 1.08], life: 0.6, tilt: 0.5, chips: 3, tint, rime: 0.15 });
  } else {
    spikeRing(game, p, R, nS, { h: [0.85 * hk, 1.3 * hk], wk: 0.19, delay: [dur * 0.85, dur * 1.05], life: 0.62, tilt: 0.45, chips: 4, tint, rime: 0.18 });
    spikeRing(game, p, R * 0.985, nS, { h: [0.4 * hk, 0.65 * hk], wk: 0.22, delay: [dur * 0.9, dur * 1.1], life: 0.6, tilt: 0.75, chips: 2, tint, rime: 0.25 });
  }
  let t = 0, sub = false, spray = false, outer = false;
  return {
    pos: p,
    update(dt) {
      t += dt;
      if (!second && !outer && t >= dur * 0.4) {
        outer = true;
        rimeB.push(...ringCreep(game, p, R * 0.55, R, 0, dur * 0.62, 1.7, 0.22));
      }
      // the front: snow kicked up and rolled outward exactly where the damage front is (never on the hero)
      if (t < dur + 0.02 && t / dur * R > CLEAR + 0.3) {
        const k = Math.min(1, t / dur), rr = k * R;
        const n = Math.min(second ? 7 : 12, Math.ceil(6.283 * rr / 0.8)) * vfx.budget();
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, c = Math.cos(a), s = Math.sin(a);
          if (i & 1) puff1(vfx, 'snowflake', p.x + c * rr, 0.2, p.z + s * rr, c * 2.5, rnd(1.5, 3.2), s * 2.5, 0.6);
          else puff1(vfx, 'frostPuff', p.x + c * rr, 0.22, p.z + s * rr, c * 2.2, rnd(0.3, 0.9), s * 2.2, second ? 0.8 : rnd(0.9, 1.25));
        }
      }
      // spikes heave the ground: a skirt of snow at their feet
      if (!spray && t >= dur * 0.9) {
        spray = true;
        const n = second ? 8 : 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.283 + rnd(-0.2, 0.2), c = Math.cos(a), s = Math.sin(a);
          const rr = (second ? R - 0.4 : R) * rnd(0.98, 1.04);
          puff1(vfx, 'frostPuff', p.x + c * rr, 0.15, p.z + s * rr, c * 0.8, 0.5, s * 0.8, rnd(0.8, 1.1));
          puff1(vfx, 'snowStreak', p.x + c * rr, 0.3, p.z + s * rr, c * 2, rnd(3, 5), s * 2, 0.8);
        }
      }
      // D: the rime recedes edge -> centre (outer ring first); sublimation puffs lift off (not on the hero)
      if (!sub && t >= 0.95) {
        sub = true;
        for (const d of rimeB) d.end(0.6);
        for (const d of rimeA) d.end(0.85);
        if (!second) for (let i = 0; i < 10; i++) {
          const a = Math.random() * 6.283, rr = CLEAR + 0.5 + (R * 0.9 - CLEAR - 0.5) * Math.sqrt(Math.random());
          puff1(vfx, 'frostPuff', p.x + Math.cos(a) * rr, 0.2, p.z + Math.sin(a) * rr, 0, 0.5, 0, rnd(1.0, 1.4));
        }
      }
      return t < 1.2;
    },
    end() {},
  };
}

export const RECIPES = { frostBlizzard, frostNova };
