import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GEO, randRange } from '../core/utils.js';

const MAX_PARTICLES = 5000;
const MAX_NUMBERS = 90;

// ---------------------------------------------------------------------------------------------
//  Daylight VFX (design/research/04-vfx-readability.md).
//  BLEND_ADD ("blend-add"): out.rgb = src.rgb + dst.rgb * (1 - src.a). rgb = emission (added),
//  a = occlusion (darkens what is behind), so glows keep a value separation from bright ground.
//  occ = 0 reproduces classic additive. Spread into a ShaderMaterial: { ...BLEND_ADD }.
// ---------------------------------------------------------------------------------------------
export const BLEND_ADD = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};
// One unified hostile colour for every damaging ground telegraph.
export const HOSTILE_RED = 0xff2a3d;

const HDR_DEFAULT = 1.6;          // particle / spark brightness
const OCC_DEFAULT = 0.35;         // particle ground-darkening
const LIGHT_SCALE = 0.3;          // point lights wash out sunlit ground; scale all of them
const DUST_OCC = 0.8;             // default occlusion for blend:'normal' dust / smoke

const SHARED_GEO = new Set(Object.values(GEO));

const FX_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Ring: bright band over a dark backing (blend-add) or a flat painted band (uMode = 1, dust).
const RING_FS = /* glsl */`
  uniform vec3 uColor; uniform float uInner; uniform float uFade; uniform float uOcc; uniform float uMode;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float t = clamp((r - uInner) / max(1.0 - uInner, 1e-3), 0.0, 1.0);
    float core = pow(clamp(1.0 - abs(t - 0.6) / 0.6, 0.0, 1.0), 2.0);
    float body = smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.8, t);
    float a = uOcc * body * uFade;
    vec3 emit = uColor * core * uFade;
    vec3 paint = uColor * a;
    gl_FragColor = vec4(mix(emit, paint, uMode), a);
  }`;

const DISC_FS = /* glsl */`
  uniform vec3 uColor; uniform float uFade; uniform float uOcc; uniform float uMode;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float glow = 1.0 - r * r;
    float a = uOcc * smoothstep(1.0, 0.55, r) * uFade;
    gl_FragColor = vec4(mix(uColor * glow * uFade, uColor * a, uMode), a);
  }`;

// Telegraph decal. From the outside in: dark outline band, bright never-zero rim, darkening
// interior tint, growing fill with a bright leading edge that pulses faster near the end.
// Friendly (player) telegraphs: element colour, no dark band, faint tint, DASHED rim.
const TELE_COMMON = /* glsl */`
  uniform vec3 uRim; uniform vec3 uFill; uniform vec3 uOutline;
  uniform float uOutlineA; uniform float uFillA; uniform float uDashed;
  uniform float uProgress; uniform float uTime;
  varying vec2 vUv;
  const float OUTLINE_W = 0.10;
  const float RIM_W = 0.14;
  vec4 teleShade(float d, float edgeDist, float filled, float dashCoord) {
    float aa = max(fwidth(d), 1e-4);
    if (d < -aa) discard;
    float inShape  = smoothstep(-aa, 0.0, d);
    float outline  = inShape * (1.0 - smoothstep(OUTLINE_W - aa, OUTLINE_W, d));
    float rim      = smoothstep(OUTLINE_W - aa, OUTLINE_W, d)
                   * (1.0 - smoothstep(OUTLINE_W + RIM_W - aa, OUTLINE_W + RIM_W, d));
    float interior = smoothstep(OUTLINE_W + RIM_W - aa, OUTLINE_W + RIM_W, d);
    rim *= mix(1.0, step(0.45, fract(dashCoord / 0.9)), uDashed);
    float urg   = smoothstep(0.7, 1.0, uProgress);
    float pulse = 0.5 + 0.5 * sin(uTime * mix(5.0, 20.0, urg));
    float edge  = interior * (1.0 - smoothstep(0.0, 0.12 + aa, abs(edgeDist))) * step(0.02, uProgress);
    vec4 c = vec4(uFill, interior * uFillA * mix(0.35, 1.0 + 0.25 * urg * pulse, filled));
    c = mix(c, vec4(uRim, 0.9), edge);
    c = mix(c, vec4(uRim, 0.8 + 0.2 * pulse), rim);
    c = mix(c, vec4(uOutline, uOutlineA), outline);
    return c;
  }`;
const TELE_CIRCLE_FS = TELE_COMMON + /* glsl */`
  uniform float uRadius;
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * (uRadius + 0.05);
    float r = length(p);
    float pr = uProgress * (uRadius - OUTLINE_W - RIM_W);
    float filled = 1.0 - smoothstep(pr - 0.02, pr, r);
    gl_FragColor = teleShade(uRadius - r, r - pr, filled, atan(p.y, p.x) * uRadius);
  }`;
const TELE_LINE_FS = TELE_COMMON + /* glsl */`
  uniform vec2 uSize;
  void main() {
    float x = (vUv.x - 0.5) * uSize.x;
    float y = (1.0 - vUv.y) * uSize.y;
    float d = min(0.5 * uSize.x - abs(x), min(y, uSize.y - y));
    float pr = uProgress * uSize.y;
    float filled = 1.0 - smoothstep(pr - 0.02, pr, y);
    gl_FragColor = teleShade(d, y - pr, filled, y + abs(x));
  }`;

// Cone (sector) from the mesh centre: half-angle uHalf (rad) around local +Y of the plane (= world +Z
// after the group's yaw), radius uRadius. Fills outward like the circle.
const TELE_CONE_FS = TELE_COMMON + /* glsl */`
  uniform float uRadius; uniform float uHalf;
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * (uRadius + 0.05);
    float r = length(p);
    float a = abs(atan(p.x, p.y));
    // distance to the two straight edges (perpendicular, valid inside the wedge) and to the arc
    float side = r * sin(uHalf - a);
    if (a > uHalf) side = -r * sin(min(a - uHalf, 1.5707));
    float d = min(uRadius - r, side);
    float pr = uProgress * (uRadius - OUTLINE_W - RIM_W);
    float filled = 1.0 - smoothstep(pr - 0.02, pr, r);
    gl_FragColor = teleShade(d, r - pr, filled, a * r + r);
  }`;
// Donut (annulus) uInner..uRadius. Fills from the inner edge outward.
const TELE_DONUT_FS = TELE_COMMON + /* glsl */`
  uniform float uRadius; uniform float uInner;
  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * (uRadius + 0.05);
    float r = length(p);
    float d = min(uRadius - r, r - uInner);
    float pr = uInner + uProgress * (uRadius - uInner - OUTLINE_W - RIM_W);
    float filled = 1.0 - smoothstep(pr - 0.02, pr, r);
    gl_FragColor = teleShade(d, r - pr, filled, atan(p.y, p.x) * uRadius);
  }`;

// "Go here" colour for safe pockets, cleanse pools, shelters (design/RAID.md). Never used for danger.
export const SAFE_GOLD = 0xffe9a8;

// Drop-in replacement for an additive MeshBasicMaterial on halos / shells / flat decals.
// Exposes .color (THREE.Color; multiply for HDR) and .opacity like a MeshBasicMaterial.
// o: { hdr = 1, occ = 0.35, opacity = 1, side, depthWrite, depthTest (pass false for flat ground decals so grass can't hide them) }
export function blendAddMaterial(color, o = {}) {
  const u = {
    uColor: { value: new THREE.Color(color).multiplyScalar(o.hdr ?? 1) },
    uOcc: { value: o.occ ?? OCC_DEFAULT },
    uOpacity: { value: o.opacity ?? 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOcc; uniform float uOpacity;
      void main() { gl_FragColor = vec4(uColor * uOpacity, uOcc * uOpacity); }`,
    transparent: true, depthWrite: o.depthWrite ?? false, depthTest: o.depthTest ?? true, side: o.side ?? THREE.FrontSide, ...BLEND_ADD,
  });
  m.color = u.uColor.value;
  Object.defineProperty(m, 'opacity', { get: () => u.uOpacity.value, set: (v) => { u.uOpacity.value = v; }, configurable: true });
  return m;
}

const _dashed = (opts) => !!opts.friendly;

// Visual effects: GPU point particles, expanding rings, lightning, pooled lights,
// ground telegraphs and DOM-based floating combat text.
export class FX {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.engine = game.engine;
    this.layer = document.getElementById('fx-layer');

    // ---- particles ----
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMax = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    this.pDrag = new Float32Array(MAX_PARTICLES);
    this.pSize0 = new Float32Array(MAX_PARTICLES);
    this.pOcc = new Float32Array(MAX_PARTICLES);
    this.pMode = new Float32Array(MAX_PARTICLES);   // 0 = glow (blend-add), 1 = painted dust / smoke
    this.pCount = 0;
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('occ', new THREE.BufferAttribute(this.pOcc, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('mode', new THREE.BufferAttribute(this.pMode, 1).setUsage(THREE.DynamicDrawUsage));
    this.pGeo = g;
    this.pMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 30 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute float occ; attribute float mode; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; varying float vOcc; varying float vMode;
        uniform float uScale;
        void main(){
          vColor = color; vAlpha = alpha; vOcc = occ; vMode = mode;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha; varying float vOcc; varying float vMode;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float s = smoothstep(0.5, 0.0, d);
          // glow: rgb ADDED (s*s falloff), alpha darkens what is behind over the wider footprint.
          // dust (mode 1): premultiplied normal blending, a soft painted puff.
          float a = s * vAlpha * vOcc;
          vec3 emit = vColor * (s * s * vAlpha);
          vec3 paint = vColor * a;
          gl_FragColor = vec4(mix(emit, paint, vMode), a);
        }`,
      transparent: true,
      depthWrite: false,
      ...BLEND_ADD,
    });
    this.points = new THREE.Points(g, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);

    // ---- transient meshes (rings, lightning, telegraphs) ----
    this.transients = [];
    this._ringGeos = new Map();

    // ---- pooled point lights (fixed count => no shader recompiles) ----
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      l.position.set(0, -100, 0);
      this.scene.add(l);
      this.lights.push({ light: l, life: 0, max: 1, intensity: 0 });
    }

    // ---- floating text ----
    this.texts = [];
    this.labelTimes = new Map();
    // "heat" rises with every effect spawned and decays over time; heavy
    // combat scales particle counts and flashes down to avoid white-out.
    this.heat = 0;
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // ---------- Particles ----------
  // opts: color (hex), count, speed, life, size, gravity, up (vertical bias), drag, spread (pos jitter),
  //   hdr (brightness; default 1.6, dust 1), occ (0 pure glow .. 1 opaque; default 0.35, dust 0.8),
  //   blend ('add'|'blendAdd' default glow with dark halo | 'normal'|'dark' painted dust / smoke),
  //   backing (0..1: also spawns dark under-puffs of that opacity; backingColor)
  burst(pos, opts = {}) {
    const dust = opts.blend === 'normal' || opts.blend === 'dark';
    if (opts.backing) {
      this.burst(pos, { ...opts, backing: 0, blend: 'normal', color: opts.backingColor ?? 0x000000, hdr: 1, occ: opts.backing,
        count: Math.ceil((opts.count ?? 12) * 0.3), size: (opts.size ?? 0.35) * 1.8,
        speed: (opts.speed ?? 4) * 0.5, life: (opts.life ?? 0.5) * 1.3 });
    }
    const count = Math.max(1, Math.round((opts.count ?? 12) * this.budget()));
    this.heat += count;
    const speed = opts.speed ?? 4;
    const life = opts.life ?? 0.5;
    const size = opts.size ?? 0.35;
    const gravity = opts.gravity ?? 0;
    const up = opts.up ?? 0.6;
    const drag = opts.drag ?? 2;
    const spread = opts.spread ?? 0.1;
    const hdr = opts.hdr ?? (dust ? 1 : HDR_DEFAULT);
    const occ = opts.occ ?? (dust ? DUST_OCC : OCC_DEFAULT);
    const mode = dust ? 1 : 0;
    this._c.set(opts.color ?? 0xffffff).multiplyScalar(hdr);
    const y = pos.y ?? 0;
    for (let n = 0; n < count; n++) {
      if (this.pCount >= MAX_PARTICLES) return;
      const i = this.pCount++;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const vy = (Math.random() * 2 - 1 + up) * s * 0.6;
      this.pPos[i * 3] = pos.x + randRange(-spread, spread);
      this.pPos[i * 3 + 1] = y + 0.5 + randRange(-spread, spread);
      this.pPos[i * 3 + 2] = pos.z + randRange(-spread, spread);
      this.pVel[i * 3] = Math.cos(a) * s;
      this.pVel[i * 3 + 1] = vy;
      this.pVel[i * 3 + 2] = Math.sin(a) * s;
      this.pCol[i * 3] = this._c.r; this.pCol[i * 3 + 1] = this._c.g; this.pCol[i * 3 + 2] = this._c.b;
      const l = life * (0.6 + Math.random() * 0.4);
      this.pLife[i] = l; this.pMax[i] = l;
      this.pSize0[i] = size * (0.6 + Math.random() * 0.6);
      this.pGrav[i] = gravity; this.pDrag[i] = drag;
      this.pOcc[i] = occ; this.pMode[i] = mode;
    }
  }

  // A single particle with explicit velocity (for trails). opts: color, size, life, gravity, drag, hdr, occ, blend
  spark(pos, vel, opts = {}) {
    if (this.pCount >= MAX_PARTICLES) return;
    const i = this.pCount++;
    const dust = opts.blend === 'normal' || opts.blend === 'dark';
    this._c.set(opts.color ?? 0xffffff).multiplyScalar(opts.hdr ?? (dust ? 1 : HDR_DEFAULT));
    this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
    this.pVel[i * 3] = vel?.x ?? 0; this.pVel[i * 3 + 1] = vel?.y ?? 0; this.pVel[i * 3 + 2] = vel?.z ?? 0;
    this.pCol[i * 3] = this._c.r; this.pCol[i * 3 + 1] = this._c.g; this.pCol[i * 3 + 2] = this._c.b;
    const l = opts.life ?? 0.4;
    this.pLife[i] = l; this.pMax[i] = l;
    this.pSize0[i] = opts.size ?? 0.3;
    this.pGrav[i] = opts.gravity ?? 0; this.pDrag[i] = opts.drag ?? 1;
    this.pOcc[i] = opts.occ ?? (dust ? DUST_OCC : 0.25);
    this.pMode[i] = dust ? 1 : 0;
  }

  // ---------- Rings / shockwaves ----------
  _ringGeo(width) {
    const key = Math.max(2, Math.min(98, Math.round(width * 100)));
    let g = this._ringGeos.get(key);
    if (!g) {
      g = new THREE.RingGeometry(1 - key / 100, 1, 48);
      SHARED_GEO.add(g);
      this._ringGeos.set(key, g);
    }
    return g;
  }

  // Expanding flat ring on the ground. opts: color, radius, life, from (start radius), width (0..1 thickness),
  // hdr (default 1.7), occ (ground darkening; default 0.45, dust 0.7), y,
  // blend ('add' default blend-add glow | 'normal'|'dark' painted band for dust / spawn puffs)
  ring(pos, opts = {}) {
    const dust = opts.blend === 'normal' || opts.blend === 'dark';
    const width = opts.width ?? 0.18;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color ?? 0xffffff).multiplyScalar(opts.hdr ?? (dust ? 1 : 1.7)) },
        uInner: { value: 1 - Math.max(0.02, Math.min(0.98, Math.round(width * 100) / 100)) },
        uFade: { value: 1 },
        uOcc: { value: opts.occ ?? (dust ? 0.7 : 0.45) },
        uMode: { value: dust ? 1 : 0 },
      },
      vertexShader: FX_VS, fragmentShader: RING_FS,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, ...BLEND_ADD,
    });
    const m = new THREE.Mesh(this._ringGeo(width), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, (opts.y ?? 0.08), pos.z);
    m.renderOrder = 2;
    this.scene.add(m);
    const life = opts.life ?? 0.4, r1 = opts.radius ?? 3, r0 = opts.from ?? 0.2;
    this.transients.push({
      mesh: m, t: 0, life,
      update: (tr, k) => { const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k)); m.scale.set(r, r, r); mat.uniforms.uFade.value = 1 - k; },
    });
  }

  // Filled glowing disc that fades (explosion core). opts: color, radius, life, hdr (default 1.2), occ (default 0.3)
  flashDisc(pos, opts = {}) {
    this.heat += 12;
    if (this.heat > 260) return;
    const fade = this.budget();
    const dust = opts.blend === 'normal' || opts.blend === 'dark';
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color ?? 0xffffff).multiplyScalar(opts.hdr ?? (dust ? 1 : 1.2)) },
        uFade: { value: 1 },
        uOcc: { value: opts.occ ?? (dust ? 0.6 : 0.3) },
        uMode: { value: dust ? 1 : 0 },
      },
      vertexShader: FX_VS, fragmentShader: DISC_FS,
      transparent: true, depthWrite: false, depthTest: false, ...BLEND_ADD,
    });
    const m = new THREE.Mesh(GEO.disc, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.06, pos.z);
    m.renderOrder = 2;
    const r = opts.radius ?? 2;
    m.scale.setScalar(r);
    this.scene.add(m);
    this.transients.push({ mesh: m, t: 0, life: opts.life ?? 0.25, update: (tr, k) => { mat.uniforms.uFade.value = (1 - k) * fade; m.scale.setScalar(r * (0.7 + 0.3 * k)); } });
  }

  // Jagged lightning between two points. opts: color, life, jag, strands, segments
  // Fat screen-space lines: a dark under-strand (reads on sunlit ground) beneath a glowing colour strand.
  lightning(from, to, opts = {}) {
    const segs = opts.segments ?? 8;
    const jag = opts.jag ?? 0.45;
    const life = opts.life ?? 0.16;
    const y0 = from.y ?? 1, y1 = to.y ?? 1;
    const group = new THREE.Group();
    const mats = [];
    const flat = new Array((segs + 1) * 3);
    for (let strand = 0; strand < (opts.strands ?? 2); strand++) {
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const j = i === 0 || i === segs ? 0 : jag;
        flat[i * 3] = from.x + (to.x - from.x) * t + randRange(-j, j);
        flat[i * 3 + 1] = y0 + (y1 - y0) * t + randRange(-j, j) * 0.6;
        flat[i * 3 + 2] = from.z + (to.z - from.z) * t + randRange(-j, j);
      }
      const geo = new LineGeometry();
      geo.setPositions(flat);
      const main = strand === 0;
      if (main) {
        const dark = new LineMaterial({ color: 0x140a24, linewidth: 8, transparent: true, opacity: 0.7, depthWrite: false });
        const under = new Line2(geo, dark);
        under.renderOrder = 9;
        group.add(under);
        mats.push({ m: dark, a: 0.7 });
      }
      const glow = new LineMaterial({ color: opts.color ?? 0xffe14a, linewidth: main ? 4.5 : 3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      glow.color.multiplyScalar(main ? 1.8 : 1.3);
      const over = new Line2(geo, glow);
      over.renderOrder = 11;
      group.add(over);
      mats.push({ m: glow, a: 1 });
    }
    this.scene.add(group);
    this.transients.push({
      mesh: group, t: 0, life, group: true,
      update: (tr, k) => { for (const e of mats) e.m.opacity = e.a * (1 - k); },
    });
    // Sparks at the impact point
    this.burst({ x: to.x, y: 0.5, z: to.z }, { color: opts.color ?? 0xffe14a, count: 5, speed: 5, life: 0.25, size: 0.25, occ: 0.3 });
  }

  // Shared telegraph material. Hostile = unified red regardless of `color` unless keepColor; friendly = element colour, dashed.
  _teleMat(fragmentShader, opts) {
    const safe = !!opts.safe;
    const friendly = !!opts.friendly && !safe;
    const base = new THREE.Color(safe ? SAFE_GOLD : friendly || opts.keepColor ? (opts.color ?? 0xffffff) : HOSTILE_RED);
    if (!friendly && !safe && !opts.keepColor) {
      // slightly tweak hue-neutral base so identical hostile telegraphs always match
      base.set(HOSTILE_RED);
    }
    // safe (gold "go here"): bright rim, warm low fill, dark-brown outline, dashed like a friendly marker
    return new THREE.ShaderMaterial({
      uniforms: {
        uRim: { value: friendly || safe ? base.clone().lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(safe ? 1.5 : 1.1) : base.clone() },
        uFill: { value: base.clone().multiplyScalar(friendly ? 0.6 : safe ? 0.5 : 0.16) },
        uOutline: { value: new THREE.Color(safe ? 0x1a1000 : 0x14000a) },
        uOutlineA: { value: friendly ? 0.5 : safe ? 0.7 : 0.8 },
        uFillA: { value: friendly ? 0.22 : safe ? 0.3 : 0.55 },
        uDashed: { value: _dashed(opts) || safe ? 1 : 0 },
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: FX_VS, fragmentShader,
      transparent: true, depthWrite: false, depthTest: false,   // ground decals stay visible over grass blades
    });
  }

  // Ground circle that fills up over `duration`, then calls onDone. Returns handle with cancel().
  // opts: onDone, friendly (player-cast: element `color`, dashed rim, no danger styling),
  //   keepColor (hostile but keep `color`, e.g. shrines), color (ignored for hostile unless keepColor)
  telegraph(pos, radius, duration, opts = {}) {
    const mat = this._teleMat(TELE_CIRCLE_FS, opts);
    mat.uniforms.uRadius = { value: radius };
    const m = new THREE.Mesh(GEO.plane, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(2 * (radius + 0.05));
    m.position.set(pos.x, 0.07, pos.z);
    m.renderOrder = opts.friendly ? 3 : 8;
    this.scene.add(m);
    const handle = { done: false, mesh: m, cancel: () => { handle.done = true; } };
    this.transients.push({
      mesh: m, t: 0, life: duration,
      update: (tr, k) => {
        if (handle.done) { tr.t = tr.life; return; }
        mat.uniforms.uProgress.value = k;
        mat.uniforms.uTime.value = tr.t;
      },
      onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
    });
    return handle;
  }

  // Rectangular ground telegraph from `from` along `dir` (XZ unit). Fills along its length over `duration`,
  // then calls opts.onDone. Returns handle with cancel(). opts: color, onDone, friendly, keepColor (see telegraph)
  lineTelegraph(from, dir, length, width, duration, opts = {}) {
    const mat = this._teleMat(TELE_LINE_FS, opts);
    mat.uniforms.uSize = { value: new THREE.Vector2(width, length) };
    const m = new THREE.Mesh(GEO.plane, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(width, length, 1);
    m.position.z = length / 2;
    m.renderOrder = opts.friendly ? 3 : 8;
    const group = new THREE.Group();
    group.add(m);
    group.position.set(from.x, 0.07, from.z);
    group.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(group);
    const handle = { done: false, mesh: group, cancel: () => { handle.done = true; } };
    this.transients.push({
      mesh: group, t: 0, life: duration, group: true,
      update: (tr, k) => {
        if (handle.done) { tr.t = tr.life; return; }
        mat.uniforms.uProgress.value = k;
        mat.uniforms.uTime.value = tr.t;
      },
      onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
    });
    return handle;
  }

  // Shared transient driver for the shaped telegraphs below. handle.mesh is the placed object (move it to
  // make a chasing telegraph). handle.cancel() removes it without calling onDone.
  _teleTransient(obj, mat, duration, opts, group = false) {
    this.scene.add(obj);
    const handle = { done: false, mesh: obj, cancel: () => { handle.done = true; } };
    this.transients.push({
      mesh: obj, t: 0, life: duration, group,
      update: (tr, k) => {
        if (handle.done) { tr.t = tr.life; return; }
        mat.uniforms.uProgress.value = k;
        mat.uniforms.uTime.value = tr.t;
      },
      onEnd: () => { if (!handle.done) { handle.done = true; opts.onDone?.(); } },
    });
    return handle;
  }

  // Cone / sector telegraph: apex at `origin`, centred on `dir` (XZ unit), total angle `angle` (rad), radius.
  // opts as telegraph() (+ safe: gold "go here").
  coneTelegraph(origin, dir, angle, radius, duration, opts = {}) {
    const mat = this._teleMat(TELE_CONE_FS, opts);
    mat.uniforms.uRadius = { value: radius };
    mat.uniforms.uHalf = { value: Math.min(Math.PI - 0.01, angle / 2) };
    const m = new THREE.Mesh(GEO.plane, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(2 * (radius + 0.05));
    m.renderOrder = opts.friendly || opts.safe ? 3 : 8;
    const group = new THREE.Group();
    group.add(m);
    group.position.set(origin.x, 0.07, origin.z);
    group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; // plane +Y (uv up) maps to world -Z before the yaw
    return this._teleTransient(group, mat, duration, opts, true);
  }

  // Donut telegraph: the annulus inner..outer around `pos` is hit; the hole is safe.
  donutTelegraph(pos, inner, outer, duration, opts = {}) {
    const mat = this._teleMat(TELE_DONUT_FS, opts);
    mat.uniforms.uRadius = { value: outer };
    mat.uniforms.uInner = { value: inner };
    const m = new THREE.Mesh(GEO.plane, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(2 * (outer + 0.05));
    m.position.set(pos.x, 0.07, pos.z);
    m.renderOrder = opts.friendly || opts.safe ? 3 : 8;
    return this._teleTransient(m, mat, duration, opts);
  }

  // Persistent ground zone (not a transient): a fully filled telegraph decal that stays until disposed.
  // kind 'hostile' (red: spore cloud, fire ground) | 'safe' (gold: sap pool, lightning rod, shelter).
  // shape: { radius } circle | { radius, inner } donut | { radius, angle, dir } cone.
  // Returns { mesh, setRadius(r), setOpacity(a), dispose() }. Callers own it (boss zone actors).
  zone(pos, shape, kind = 'hostile', opts = {}) {
    const o = { ...opts, safe: kind === 'safe' };
    const fs = shape.inner !== undefined ? TELE_DONUT_FS : shape.angle !== undefined ? TELE_CONE_FS : TELE_CIRCLE_FS;
    const mat = this._teleMat(fs, o);
    const r = shape.radius;
    mat.uniforms.uRadius = { value: r };
    if (shape.inner !== undefined) mat.uniforms.uInner = { value: shape.inner };
    if (shape.angle !== undefined) mat.uniforms.uHalf = { value: Math.min(Math.PI - 0.01, shape.angle / 2) };
    mat.uniforms.uProgress.value = 1;
    const m = new THREE.Mesh(GEO.plane, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(2 * (r + 0.05));
    m.renderOrder = kind === 'safe' ? 3 : 7;
    const group = new THREE.Group();
    group.add(m);
    group.position.set(pos.x, 0.06, pos.z);
    if (shape.dir) group.rotation.y = Math.atan2(shape.dir.x, shape.dir.z) + Math.PI;
    this.scene.add(group);
    const fillA = mat.uniforms.uFillA.value, outA = mat.uniforms.uOutlineA.value;
    return {
      mesh: group,
      setRadius: (nr) => {
        mat.uniforms.uRadius.value = nr;
        m.scale.setScalar(2 * (nr + 0.05));
      },
      setOpacity: (a) => { mat.uniforms.uFillA.value = fillA * a; mat.uniforms.uOutlineA.value = outA * a; },
      dispose: () => { this.scene.remove(group); mat.dispose(); },
    };
  }

  // Take ownership of a dead enemy's mesh: white-ish squash + shrink over `life`, then remove it.
  // Materials are NOT disposed here (enemies may share them); pass opts.onEnd to dispose clones.
  corpse(mesh, life = 0.12, opts = {}) {
    const s0 = mesh.scale.clone();
    this.transients.push({
      mesh, t: 0, life, keepMaterials: true,
      update: (tr, k) => { mesh.scale.set(s0.x * (1 + 0.4 * k), s0.y * (1 - 0.9 * k), s0.z * (1 + 0.4 * k)); },
      onEnd: opts.onEnd,
    });
  }

  // Short-lived dynamic light (pooled; at most 6 at once). Intensities are authored for night; scaled
  // down globally (LIGHT_SCALE) because point lights burn sunlit ground to white.
  light(pos, color = 0xffffff, intensity = 30, life = 0.25, distance = 10) {
    let slot = this.lights.find((l) => l.life <= 0) || this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    intensity *= LIGHT_SCALE;
    slot.light.color.set(color);
    slot.light.distance = distance;
    slot.light.position.set(pos.x, 1.5, pos.z);
    slot.intensity = intensity; slot.life = life; slot.max = life;
    slot.light.intensity = intensity;
  }

  // 1 when calm, falls toward ~0.25 in massive chain reactions.
  budget() { return 1 / (1 + this.heat / 120); }

  shake(amount, kind) { this.engine.shake(amount, kind); }

  // ---------- Floating text ----------
  number(pos, value, opts = {}) {
    if (this.texts.length >= MAX_NUMBERS) return;
    const v = Math.round(value);
    if (v <= 0) return;
    this._text(pos, String(v), opts.color ?? '#ffffff', opts.crit ? 'crit' : 'dmg', opts.crit ? 0.8 : 0.6);
  }
  // Big label (reaction names, "LEVEL UP", etc.)
  text(pos, str, color = '#ffffff', big = false) {
    const now = performance.now();
    if (now - (this.labelTimes.get(str) ?? -1e9) < 220) return;
    this.labelTimes.set(str, now);
    this._text(pos, str, color, big ? 'label big' : 'label', big ? 1.4 : 1.0);
  }
  _text(pos, str, color, cls, life) {
    const el = document.createElement('div');
    el.className = 'ftext ' + cls;
    el.textContent = str;
    el.style.color = color;
    this.layer.appendChild(el);
    this.texts.push({ el, x: pos.x + randRange(-0.3, 0.3), y: (pos.y ?? 0) + 1.6, z: pos.z + randRange(-0.3, 0.3), t: 0, life, vy: 1.8 });
  }

  update(dt) {
    this.heat *= Math.exp(-3 * dt);
    // particles (swap-remove dead)
    let i = 0;
    while (i < this.pCount) {
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        const last = --this.pCount;
        if (i !== last) this._copyParticle(last, i);
        continue;
      }
      const i3 = i * 3;
      const d = Math.exp(-this.pDrag[i] * dt);
      this.pVel[i3] *= d; this.pVel[i3 + 2] *= d;
      this.pVel[i3 + 1] = this.pVel[i3 + 1] * d - this.pGrav[i] * dt;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (this.pPos[i3 + 1] < 0.05) { this.pPos[i3 + 1] = 0.05; this.pVel[i3 + 1] *= -0.3; }
      const k = this.pLife[i] / this.pMax[i];
      this.pAlpha[i] = Math.min(1, k * 2);
      this.pSize[i] = this.pSize0[i] * (0.4 + 0.6 * k);
      i++;
    }
    this.pGeo.setDrawRange(0, this.pCount);
    for (const n of ['position', 'color', 'size', 'alpha', 'occ', 'mode']) this.pGeo.attributes[n].needsUpdate = true;
    this.pMat.uniforms.uScale.value = this.engine.pixelsPerUnit();

    // transients
    for (let t = this.transients.length - 1; t >= 0; t--) {
      const tr = this.transients[t];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.life);
      tr.update(tr, k);
      if (tr.t >= tr.life) {
        this.scene.remove(tr.mesh);
        if (!tr.keepMaterials) tr.mesh.traverse((o) => { if (o.geometry && !SHARED_GEO.has(o.geometry)) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.transients.splice(t, 1);
        tr.onEnd?.();
      }
    }

    // lights
    for (const l of this.lights) {
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity = Math.max(0, l.intensity * (l.life / l.max));
        if (l.life <= 0) l.light.intensity = 0;
      }
    }

    this.updateTexts(dt);
  }

  // Texts are positioned even while paused so they don't freeze mid-air oddly.
  updateTexts(dt) {
    const cam = this.engine.camera;
    for (let t = this.texts.length - 1; t >= 0; t--) {
      const tx = this.texts[t];
      tx.t += dt;
      tx.y += tx.vy * dt;
      tx.vy *= Math.exp(-3 * dt);
      const k = tx.t / tx.life;
      if (k >= 1) { tx.el.remove(); this.texts.splice(t, 1); continue; }
      this._v.set(tx.x, tx.y, tx.z).project(cam);
      const sx = (this._v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-this._v.y * 0.5 + 0.5) * innerHeight;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      tx.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${pop})`;
      tx.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
  }

  _copyParticle(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pPos[t3 + k] = this.pPos[f3 + k];
      this.pVel[t3 + k] = this.pVel[f3 + k];
      this.pCol[t3 + k] = this.pCol[f3 + k];
    }
    this.pLife[to] = this.pLife[from]; this.pMax[to] = this.pMax[from];
    this.pSize0[to] = this.pSize0[from]; this.pGrav[to] = this.pGrav[from]; this.pDrag[to] = this.pDrag[from];
    this.pSize[to] = this.pSize[from]; this.pAlpha[to] = this.pAlpha[from];
    this.pOcc[to] = this.pOcc[from]; this.pMode[to] = this.pMode[from];
  }

  clear() {
    this.pCount = 0;
    for (const tr of this.transients) this.scene.remove(tr.mesh);
    this.transients.length = 0;
    for (const tx of this.texts) tx.el.remove();
    this.texts.length = 0;
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
  }
}
