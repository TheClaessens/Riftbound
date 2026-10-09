import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// =====================================================================================
//  Creature rig: procedurally modelled, procedurally animated, GPU-instanced creatures.
//
//  A creature is built once from primitive parts (PartBuilder). Every part is rigidly
//  attached to one bone. All parts merge into ONE BufferGeometry with per-vertex colour,
//  bone index (aBone) and emissive strength (aEmis).
//
//  At runtime every creature TYPE is one InstancedMesh (one draw call for all of them).
//  Each instance's bone matrices live in a float DataTexture (row = instance, 4 texels per
//  bone) that the vertex shader reads with texelFetch(gl_InstanceID). The CPU poses bones
//  every frame from the creature's animate() function (see CreatureRenderer).
//
//  Space conventions: model space, Y up, feet on y = 0, the creature faces +Z.
//  Its LEFT side is +X ('L' bones), its RIGHT side is -X ('R' bones).
// =====================================================================================

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();

// ------------------------------------------------------------------ PartBuilder

// Common part options:
//   bone   : bone name (default 'root')
//   color  : hex colour (sRGB)
//   emis   : emissive strength (0 = matte; 1.5–4 = glowing HDR part that blooms).
//            NEGATIVE = fixed-colour glow at |emis|: ignores the accent override and the glow ramp
//            (e.g. hero eyes that stay their colour while the focus takes the last-cast element).
//   pos    : [x, y, z]      rot: [x, y, z] (radians, XYZ order)      scale: number | [x, y, z]
//   flat   : true (default) = faceted low-poly normals; false = smooth normals
export class PartBuilder {
  constructor() { this.parts = []; }

  // Any BufferGeometry (ownership is taken).
  geo(geometry, o = {}) {
    this.parts.push({ geometry, o });
    return this;
  }

  // Box. o.taper = [sx, sz] scales the TOP face (y > 0) in x / z; o.shift = [dx, dz] moves the top face.
  // o.bottom = [sx, sz] scales the bottom face.
  box(w, h, d, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.taper || o.shift || o.bottom) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y > 0) {
          if (o.taper) { p.setX(i, p.getX(i) * o.taper[0]); p.setZ(i, p.getZ(i) * o.taper[1]); }
          if (o.shift) { p.setX(i, p.getX(i) + o.shift[0]); p.setZ(i, p.getZ(i) + o.shift[1]); }
        } else if (o.bottom) {
          p.setX(i, p.getX(i) * o.bottom[0]); p.setZ(i, p.getZ(i) * o.bottom[1]);
        }
      }
    }
    return this.geo(g, o);
  }

  // Low-poly sphere / ellipsoid (use scale for ellipsoids). o.seg = [w, h] segments (default 8, 6).
  sphere(r, o = {}) {
    const [ws, hs] = o.seg ?? [8, 6];
    return this.geo(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, o.thetaLength ?? Math.PI), o);
  }

  // Faceted blob (icosahedron). detail 0 = 20 faces, 1 = 80 faces. o.jitter displaces vertices for organic rocks/moss.
  blob(r, o = {}) {
    let g = new THREE.IcosahedronGeometry(r, o.detail ?? 1);
    if (o.jitter) g = jitter(g, r * o.jitter, o.seed ?? 1);
    return this.geo(g, o);
  }

  // Cone pointing +Y, base centred at y = -h/2.
  cone(r, h, o = {}) {
    return this.geo(new THREE.ConeGeometry(r, h, o.radial ?? 6, 1, !!o.open), o);
  }

  // Cylinder (rTop, rBottom) along Y, centred.
  cyl(rTop, rBottom, h, o = {}) {
    return this.geo(new THREE.CylinderGeometry(rTop, rBottom, h, o.radial ?? 7, 1, !!o.open), o);
  }

  // Capsule along Y: radius, straight length (r170 signature: radius, length, capSegments, radialSegments).
  capsule(r, len, o = {}) {
    return this.geo(new THREE.CapsuleGeometry(r, len, o.cap ?? 2, o.radial ?? 7), o);
  }

  // Lathe around Y from [[r, y], ...] profile points.
  lathe(points, o = {}) {
    const v = points.map(([r, y]) => new THREE.Vector2(r, y));
    return this.geo(new THREE.LatheGeometry(v, o.radial ?? 8), o);
  }

  // Extruded flat shape from [[x, y], ...] in the XY plane, extruded `depth` along Z (centred).
  extrude(points, depth, o = {}) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelThickness: o.bevel ?? 0, bevelSize: o.bevel ?? 0, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return this.geo(g, o);
  }

  torus(r, tube, o = {}) {
    return this.geo(new THREE.TorusGeometry(r, tube, o.tubular ?? 4, o.radial ?? 10, o.arc ?? Math.PI * 2), o);
  }

  // Calls fn(side, sign) for 'L' (+X, sign = 1) and 'R' (-X, sign = -1).
  mirror(fn) {
    fn('L', 1);
    fn('R', -1);
    return this;
  }

  // Merge every part into one geometry. boneIndex: { name → index }.
  build(boneIndex, gradient = [0.7, 1.08]) {
    const geos = [];
    for (const { geometry, o } of this.parts) {
      // Weld by position → smooth normals (outline hull + `flat: false` parts). mergeVertices keeps
      // triangle order, so the non-indexed welded copy lines up with the faceted one.
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', geometry.attributes.position.clone());
      if (geometry.index) g.setIndex(geometry.index.clone());
      geometry.dispose();
      g = mergeVertices(g, 1e-4);
      g.computeVertexNormals();
      g = g.toNonIndexed();
      _p.fromArray(o.pos ?? [0, 0, 0]);
      _e.set(...(o.rot ?? [0, 0, 0]));
      _q.setFromEuler(_e);
      if (typeof o.scale === 'number') _s.setScalar(o.scale);
      else _s.fromArray(o.scale ?? [1, 1, 1]);
      _m.compose(_p, _q, _s);
      g.applyMatrix4(_m);
      if (_m.determinant() < 0) flipWinding(g);
      g = dropDegenerate(g); // cone / capsule / lathe poles make zero-area triangles
      const n = g.attributes.position.count;
      if (n === 0) continue;
      const smoothN = g.attributes.normal.array;
      const pa = g.attributes.position.array;
      const flatN = new Float32Array(n * 3);
      for (let t = 0; t < n; t += 3) {
        _va.fromArray(pa, t * 3); _vb.fromArray(pa, t * 3 + 3); _vc.fromArray(pa, t * 3 + 6);
        _vc.sub(_vb); _va.sub(_vb); _vc.cross(_va).normalize(); // CCW front face normal
        for (let k = 0; k < 3; k++) _vc.toArray(flatN, (t + k) * 3);
      }
      g.setAttribute('aSmooth', new THREE.BufferAttribute(new Float32Array(smoothN), 3));
      if (o.flat !== false) g.setAttribute('normal', new THREE.BufferAttribute(flatN, 3));
      const col = new Float32Array(n * 3);
      _c.setHex(o.color ?? 0xff00ff); // converted to linear (colour management)
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      const bone = boneIndex[o.bone ?? 'root'];
      if (bone === undefined) throw new Error(`PartBuilder: unknown bone "${o.bone}"`);
      // aRig = (bone index, emissive strength, trim: 0 none · 1 gold on elites · 2 elite-only part)
      const trim = o.eliteOnly ? 2 : o.trim ? 1 : 0;
      const rig = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { rig[i * 3] = bone; rig[i * 3 + 1] = o.emis ?? 0; rig[i * 3 + 2] = trim; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aRig', new THREE.BufferAttribute(rig, 3));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    // Baked top-lit value gradient (feet darker, head brighter) on matte parts.
    if (gradient) {
      const [lo, hi] = gradient;
      const pos = merged.attributes.position, col = merged.attributes.color, rig = merged.attributes.aRig;
      const y0 = merged.boundingBox.min.y, H = Math.max(0.01, merged.boundingBox.max.y - y0);
      for (let i = 0; i < pos.count; i++) {
        if (rig.getY(i) !== 0) continue;
        const k = lo + (hi - lo) * Math.min(1, Math.max(0, (pos.getY(i) - y0) / H));
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
    }
    return merged;
  }
}


function dropDegenerate(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, keep = [];
  for (let i = 0; i < p.length; i += 9) {
    _va.fromArray(p, i); _vb.fromArray(p, i + 3); _vc.fromArray(p, i + 6);
    _vc.sub(_vb); _va.sub(_vb);
    if (_vc.cross(_va).lengthSq() > 1e-12) keep.push(i);
  }
  if (keep.length * 9 === p.length) return g;
  const P = new Float32Array(keep.length * 9), N = new Float32Array(keep.length * 9);
  keep.forEach((src, k) => { P.set(p.subarray(src, src + 9), k * 9); N.set(n.subarray(src, src + 9), k * 9); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.dispose();
  return out;
}

function flipWinding(g) {
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name].array;
    for (let i = 0; i < a.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
    }
  }
}

// Deterministic vertex jitter for organic shapes (keeps shared vertices welded).
function jitter(geo, amount, seed) {
  const p = geo.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const off = new Map();
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    let d = off.get(k);
    if (!d) { d = [rnd() * amount, rnd() * amount, rnd() * amount]; off.set(k, d); }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  return geo;
}

// ------------------------------------------------------------------ creature definitions

// defineCreature({
//   id, bones: [{ name, parent?, pivot: [x,y,z] }],   // bone 0 must be 'root' (pivot [0,0,0])
//   build(pb, B) {},                                   // add parts; B = { boneName: index }
//   animate(P, s, B) {},                               // pose writer, anim state, bone indices
//   stride: metres per full gait cycle (default 1.6),
//   height: model height in metres (used for rim / labels), material: { roughness, metalness }
//   rim: [r, g, b, strength] default rim light,  shadow: true
// })
// The returned def is consumed by CreatureRenderer.
export function defineCreature(spec) {
  const bones = spec.bones ?? [{ name: 'root' }];
  if (bones[0].name !== 'root') bones.unshift({ name: 'root' });
  const B = {};
  bones.forEach((b, i) => { B[b.name] = i; });
  const parent = new Int16Array(bones.length);
  const pivot = new Float32Array(bones.length * 3);
  bones.forEach((b, i) => {
    parent[i] = b.parent === undefined ? (i === 0 ? -1 : 0) : B[b.parent];
    if (parent[i] === undefined || (i > 0 && parent[i] >= i)) throw new Error(`defineCreature ${spec.id}: bone "${b.name}" parent must be declared before it`);
    const pv = b.pivot ?? [0, 0, 0];
    pivot[i * 3] = pv[0]; pivot[i * 3 + 1] = pv[1]; pivot[i * 3 + 2] = pv[2];
  });
  return {
    id: spec.id,
    spec,
    B,
    boneCount: bones.length,
    parent,
    pivot,
    stride: spec.stride ?? 1.6,
    _geometry: null,
    get geometry() {
      if (!this._geometry) {
        const pb = new PartBuilder();
        spec.build(pb, B);
        this._geometry = pb.build(B, spec.gradient === undefined ? [0.7, 1.08] : spec.gradient);
      }
      return this._geometry;
    },
    animate: spec.animate ?? (() => {}),
  };
}

// ------------------------------------------------------------------ shader injection

// Per-vertex: aRig = (bone, emissive strength, trim flag).
// Per-instance: iFx = (emissive rgb [flash / status tint], glow 0..1+)
//               iRim = (rim rgb, strength)      iAcc = (accent override rgb, mix 0..1)
//               iMisc = (elite 0/1, burn, cold [chill <1, frozen = 1], shock)  — status looks (h.stat)
const VERT_HEAD = /* glsl */`
uniform highp sampler2D boneTex;
attribute vec3 aRig;
attribute vec4 iFx;
attribute vec4 iRim;
attribute vec4 iAcc;
attribute vec4 iMisc;
varying float vEmis;
varying float vTrim;
varying float vElite;
varying vec4 vFx;
varying vec4 vRim;
varying vec4 vAcc;
varying vec3 vStat;     // status looks: burn, cold (chill <1, frozen = 1), shock  (iMisc.yzw)
varying float vUpN;     // world-space normal.y (frost dusting on up-facing facets)
varying vec4 vRigY;     // status looks: x height / model height (0 feet .. 1 top), y height (m), z body-wrap coord (m), w instance seed
varying float vZap;     // shock crack-line strobe on/off (per instance, ~2 frames per 0.2 s)
uniform float rigTime;  // seconds (renderer.js RIG_TIME); unset (0) in the depth / hull variants
uniform float rigHeight; // model height of this creature type (m); 0 = unset (falls back to 1.7)
mat4 rigBone() {
  int x = int(aRig.x + 0.5) * 4;
  int y = gl_InstanceID;
  return mat4(texelFetch(boneTex, ivec2(x, y), 0), texelFetch(boneTex, ivec2(x + 1, y), 0),
              texelFetch(boneTex, ivec2(x + 2, y), 0), texelFetch(boneTex, ivec2(x + 3, y), 0));
}
// Elite-only parts (trim 2) collapse to nothing on regular instances.
float rigKeep() { return (aRig.z > 1.5 && iMisc.x < 0.5) ? 0.0 : 1.0; }
`;

const FRAG_HEAD = /* glsl */`
uniform vec4 rigRim;
uniform float rigTime;
varying vec3 vStat;
varying float vUpN;
varying vec4 vRigY;
varying float vZap;
varying float vEmis;
varying float vTrim;
varying float vElite;
varying vec4 vFx;
varying vec4 vRim;
varying vec4 vAcc;
`;

// Lit material (Lambert: matte, per-fragment, cheaper than Standard): bones bend normals
// (inverse-transpose, so bone scale is safe), plus emissive accents, elite trim and rim light.
function patchColorMaterial(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.boneTex = uniforms.boneTex;
    sh.uniforms.rigRim = uniforms.rigRim;
    sh.uniforms.rigTime = uniforms.rigTime;
    sh.uniforms.rigHeight = uniforms.rigHeight ?? { value: 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <beginnormal_vertex>', /* glsl */`#include <beginnormal_vertex>
        mat4 rigM = rigBone();
        { mat3 rA = mat3(rigM);
          objectNormal = rA * (objectNormal / max(vec3(dot(rA[0], rA[0]), dot(rA[1], rA[1]), dot(rA[2], rA[2])), vec3(1e-6))); }`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        transformed = (rigM * vec4(transformed * rigKeep(), 1.0)).xyz;
        vEmis = aRig.y;
        vTrim = (aRig.z > 0.5 && iMisc.x > 0.5) ? 1.0 : 0.0;
        vElite = iMisc.x;
        vFx = iFx; vRim = iRim; vAcc = iAcc;
        vStat = iMisc.yzw;
        { float rigSeed = fract(float(gl_InstanceID) * 0.618034 + 0.17);
          vRigY = vec4(transformed.y / (rigHeight > 0.0 ? rigHeight : 1.7), transformed.y, transformed.x * 0.8 + transformed.z * 0.6, rigSeed);
          // shock: crack-lines strobe on ~2 random frames per 0.2 s, de-synchronised per instance
          vZap = step(0.64, fract(sin(floor(rigTime * 30.0 + rigSeed * 13.0) * 12.9898 + rigSeed * 78.233) * 43758.5453)); }
        vUpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.7, 0.16), vTrim);
        // ---- status looks (cheap, always on; the overlays in vfx/status.js add shells and flames)
        //      (bible 10 §4.7; masks combine: burn = top band, chill = bottom-up rime, shock = lines over both)
        #define RIG_H(p) fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)
        #define RIG_N(q) mix(mix(RIG_H(floor(q)), RIG_H(floor(q) + vec2(1.0, 0.0)), smoothstep(0.0, 1.0, fract(q.x))), mix(RIG_H(floor(q) + vec2(0.0, 1.0)), RIG_H(floor(q) + vec2(1.0)), smoothstep(0.0, 1.0, fract(q.x))), smoothstep(0.0, 1.0, fract(q.y)))
        float rigFrozen = step(0.99, vStat.y);
        float rigFlame = 0.0, rigHot = 0.0, rigZapL = 0.0;
        float rigHn = vRigY.x, rigYm = vRigY.y, rigU = vRigY.z, rigSd = vRigY.w;
        float rigLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        if (vStat.y > 0.001 && rigFrozen < 0.5) {
          // CHILL: opaque rime climbing from the feet; its front = chill / freezeAt of the body (cold = 0.95 x that),
          // so one stack short of Frozen it reaches the shoulders. Navy fringe line at the front.
          vec2 rq = vec2(rigU * 4.0 + rigSd * 17.0, rigYm * 1.3);
          float front = 0.05 + 0.8 * clamp(vStat.y / 0.95, 0.0, 1.0) + (RIG_N(rq) - 0.5) * 0.12;
          float aa = fwidth(rigHn) + 1e-4;
          float rime = 1.0 - smoothstep(front - aa, front + aa, rigHn);
          float fringe = rime * smoothstep(front - 0.05 - aa, front - 0.05 + aa, rigHn);
          vec2 fq = vec2(rigU * 11.0, rigYm * 11.0);
          vec3 rimeCol = mix(vec3(0.52, 0.72, 0.88), vec3(0.72, 0.86, 0.95), step(0.5, RIG_N(fq)));   // painted, never blooms
          diffuseColor.rgb = mix(diffuseColor.rgb, rimeCol, rime * 0.88);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.13, 0.34), fringe * 0.95);
        }
        if (rigFrozen > 0.5) {
          // FROZEN: ice-blue body tint (#3FA8E0), rime on up-facing facets, white crack lines
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.38, 0.72) * (0.8 + rigLum * 0.9), 0.62);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.8, 0.92), smoothstep(0.55, 0.85, vUpN) * 0.3);
          vec2 cq = vec2(rigU * 3.2 + rigSd * 9.0, rigYm * 3.2);
          float crack = 1.0 - smoothstep(0.0, 0.03 + fwidth(cq.y) * 0.5, abs(RIG_N(cq) - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.91, 0.97), crack * 0.75);
        }
        if (vStat.x > 0.5) {
          // BURN: char at the base, toon flame band licking up the top 40% (world-y noise scrolling up, 10 Hz flicker)
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.042, 0.023, 0.016), 0.06 + 0.26 * (1.0 - smoothstep(0.05, 0.4, rigHn)));
          float fk = step(0.5, fract(rigTime * 10.0 + rigSd * 3.0));
          vec2 q1 = vec2(rigU * 2.6 + rigSd * 31.0, rigYm * 2.0 - rigTime * 3.2);
          vec2 q2 = vec2(rigU * 5.5 - rigSd * 7.0, rigYm * 4.4 - rigTime * 5.1);
          float n = RIG_N(q1) * 0.65 + RIG_N(q2) * 0.35;
          float f = n * (0.25 + 1.1 * smoothstep(0.5, 0.86, rigHn)) - 0.5 - 0.04 * fk;
          rigFlame = step(0.0, f);
          rigHot = step(0.13, f);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.62, 0.12), rigHot), rigFlame * 0.9);
        }
        if (vStat.z > 0.5 && vZap > 0.5) {
          // SHOCK: crawling lemon crack-lines, re-rolled every strobe frame (never a steady edge like the elite rim)
          float fi = floor(rigTime * 30.0);
          vec2 zq = vec2(rigU * 3.0 + fi * 1.73 + rigSd * 5.0, rigYm * 3.0 - fi * 0.91);
          rigZapL = 1.0 - smoothstep(0.0, 0.035 + fwidth(zq.y) * 0.6, abs(RIG_N(zq) - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.12), rigZapL * 0.85);
        }
        // ---- end status looks`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      {
        vec3 rigV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
        // fresnel, masked to upward-facing facets (downward slants would wash out grey)
        float rigF = pow(1.0 - clamp(dot(normal, rigV), 0.0, 1.0), 3.0) * smoothstep(-0.3, 0.5, normal.y);
        float rigEm = abs(vEmis);
        float matte = 1.0 - step(0.001, rigEm);
        // negative emis = fixed-colour glow: ignores the accent override and the glow ramp (hero eyes, embers)
        float accMix = vEmis < 0.0 ? 0.0 : vAcc.a;
        vec3 acc = mix(mix(vColor.rgb, vec3(1.0, 0.72, 0.2), 0.8 * vElite), vAcc.rgb, accMix); // elites: gold accents; wards override
        totalEmissiveRadiance += acc * rigEm * (vEmis < 0.0 ? 1.0 : 0.35 + vFx.a * 1.6);
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.12) * 0.3 * vTrim;
        totalEmissiveRadiance += vFx.rgb;
        totalEmissiveRadiance += rigRim.rgb * rigRim.a * rigF * matte;
        totalEmissiveRadiance += vRim.rgb * vRim.a * rigF;
        // status: burn = glowing flame band (+ a faint ember underglow); shock = lemon crack-lines x1.8 on strobe
        // frames; frozen = cold fresnel (kept low: status ice never blooms)
        totalEmissiveRadiance += mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.7, 0.22), rigHot) * rigFlame * 0.55 + vec3(0.5, 0.14, 0.02) * vStat.x * rigF * 0.5;
        totalEmissiveRadiance += vec3(1.0, 0.82, 0.2) * rigZapL * 1.8 + vec3(1.0, 0.9, 0.35) * vStat.z * vZap * rigF * 0.35;
        totalEmissiveRadiance += vec3(0.45, 0.8, 1.0) * rigF * 0.5 * rigFrozen;
      }`);
  };
  mat.customProgramCacheKey = () => 'rig-color-v4';
}

function patchDepthMaterial(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.boneTex = uniforms.boneTex;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = (rigBone() * vec4(transformed * rigKeep(), 1.0)).xyz;`);
  };
  mat.customProgramCacheKey = () => 'rig-depth-v3';
}

// Inverted-hull outline: back faces pushed out along the welded smooth normal by a constant
// screen-space width (uniforms.outline = { value: worldWidth }).
function patchHullMaterial(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.boneTex = uniforms.boneTex;
    sh.uniforms.rigOutline = uniforms.rigOutline;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}\nattribute vec3 aSmooth;\nuniform float rigOutline;`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        { mat4 rM = rigBone();
          float keep = rigKeep();
          vec3 nrm = normalize(mat3(rM) * aSmooth);
          float s = length(instanceMatrix[0].xyz);
          transformed = (rM * vec4(transformed * keep, 1.0)).xyz + nrm * keep * rigOutline / max(s, 0.01); }`);
  };
  mat.customProgramCacheKey = () => 'rig-hull-v3';
}

export function makeRigMaterials(uniforms, opts = {}) {
  const color = new THREE.MeshLambertMaterial({ vertexColors: true });
  patchColorMaterial(color, uniforms);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchDepthMaterial(depth, uniforms);
  const hull = new THREE.MeshBasicMaterial({ color: opts.outline ?? 0x15121a, side: THREE.BackSide });
  patchHullMaterial(hull, uniforms);
  return { color, depth, hull };
}

// ------------------------------------------------------------------ pose writer

// Per-bone local transform: rotation (XYZ euler, radians), offset (metres), scale.
// Layout per bone (10 floats): rx ry rz ox oy oz sx sy sz _
export const POSE_STRIDE = 10;

export class Pose {
  constructor() { this.a = null; }
  reset(arr, n) {
    this.a = arr;
    for (let b = 0; b < n; b++) {
      const o = b * POSE_STRIDE;
      arr[o] = arr[o + 1] = arr[o + 2] = arr[o + 3] = arr[o + 4] = arr[o + 5] = 0;
      arr[o + 6] = arr[o + 7] = arr[o + 8] = 1;
    }
  }
  rot(b, x = 0, y = 0, z = 0) { const o = b * POSE_STRIDE, a = this.a; a[o] += x; a[o + 1] += y; a[o + 2] += z; return this; }
  move(b, x = 0, y = 0, z = 0) { const o = b * POSE_STRIDE + 3, a = this.a; a[o] += x; a[o + 1] += y; a[o + 2] += z; return this; }
  scale(b, x = 1, y = x, z = x) { const o = b * POSE_STRIDE + 6, a = this.a; a[o] *= x; a[o + 1] *= y; a[o + 2] *= z; return this; }
}

// Writes the model-space matrix of every bone (column-major, 16 floats each) into out[off..].
// world[b] = world[parent] * T(pivot + offset) * R * S * T(-pivot)
const _W = new Float32Array(64 * 16);
export function solvePose(def, pose, out, off) {
  const n = def.boneCount, P = def.pivot, par = def.parent, W = _W;
  for (let b = 0; b < n; b++) {
    const o = b * POSE_STRIDE;
    const rx = pose[o], ry = pose[o + 1], rz = pose[o + 2];
    const sx = pose[o + 6], sy = pose[o + 7], sz = pose[o + 8];
    const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
    // R = Rx * Ry * Rz (three.js 'XYZ' order), column-major entries
    const r00 = cy * cz, r01 = -cy * szr, r02 = syr;
    const r10 = cx * szr + sxr * syr * cz, r11 = cx * cz - sxr * syr * szr, r12 = -sxr * cy;
    const r20 = sxr * szr - cx * syr * cz, r21 = sxr * cz + cx * syr * szr, r22 = cx * cy;
    // L = R*S, columns scaled
    const l00 = r00 * sx, l10 = r10 * sx, l20 = r20 * sx;
    const l01 = r01 * sy, l11 = r11 * sy, l21 = r21 * sy;
    const l02 = r02 * sz, l12 = r12 * sz, l22 = r22 * sz;
    const px = P[b * 3], py = P[b * 3 + 1], pz = P[b * 3 + 2];
    const tx = px + pose[o + 3] - (l00 * px + l01 * py + l02 * pz);
    const ty = py + pose[o + 4] - (l10 * px + l11 * py + l12 * pz);
    const tz = pz + pose[o + 5] - (l20 * px + l21 * py + l22 * pz);
    const w = b * 16;
    const pb = par[b];
    if (pb < 0) {
      W[w] = l00; W[w + 1] = l10; W[w + 2] = l20; W[w + 3] = 0;
      W[w + 4] = l01; W[w + 5] = l11; W[w + 6] = l21; W[w + 7] = 0;
      W[w + 8] = l02; W[w + 9] = l12; W[w + 10] = l22; W[w + 11] = 0;
      W[w + 12] = tx; W[w + 13] = ty; W[w + 14] = tz; W[w + 15] = 1;
    } else {
      const q = pb * 16;
      const a00 = W[q], a10 = W[q + 1], a20 = W[q + 2];
      const a01 = W[q + 4], a11 = W[q + 5], a21 = W[q + 6];
      const a02 = W[q + 8], a12 = W[q + 9], a22 = W[q + 10];
      const a03 = W[q + 12], a13 = W[q + 13], a23 = W[q + 14];
      W[w] = a00 * l00 + a01 * l10 + a02 * l20;
      W[w + 1] = a10 * l00 + a11 * l10 + a12 * l20;
      W[w + 2] = a20 * l00 + a21 * l10 + a22 * l20;
      W[w + 3] = 0;
      W[w + 4] = a00 * l01 + a01 * l11 + a02 * l21;
      W[w + 5] = a10 * l01 + a11 * l11 + a12 * l21;
      W[w + 6] = a20 * l01 + a21 * l11 + a22 * l21;
      W[w + 7] = 0;
      W[w + 8] = a00 * l02 + a01 * l12 + a02 * l22;
      W[w + 9] = a10 * l02 + a11 * l12 + a12 * l22;
      W[w + 10] = a20 * l02 + a21 * l12 + a22 * l22;
      W[w + 11] = 0;
      W[w + 12] = a00 * tx + a01 * ty + a02 * tz + a03;
      W[w + 13] = a10 * tx + a11 * ty + a12 * tz + a13;
      W[w + 14] = a20 * tx + a21 * ty + a22 * tz + a23;
      W[w + 15] = 1;
    }
  }
  out.set(W.subarray(0, n * 16), off);
}

// ------------------------------------------------------------------ animation helpers

export const TAU = Math.PI * 2;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// 0 → 1 → 0 bump over [a, b]
export const bump = (x, a, b) => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
// Anticipation → strike → recover curve for k in 0..1 (windup until w, strike until w + 0.15).
// Returns negative values (pull back) during windup and positive (strike) after.
export function strikeCurve(k, w = 0.6) {
  if (k < w) return -smooth(k / w);
  const s = (k - w) / (1 - w);
  if (s < 0.25) return -1 + 2.4 * smooth(s / 0.25);
  return 1.4 * (1 - smooth((s - 0.25) / 0.75));
}
