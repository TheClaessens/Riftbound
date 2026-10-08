import * as THREE from 'three';
import { patchEnv } from './common.js';

// =====================================================================================
//  Stylized water: opaque Lambert + patchEnv (receives sun, tree and cloud shadows, no sorting,
//  no depth texture). Geometry UVs: uv.x = metres to the nearest bank, uv.y = metres along the
//  flow. Colour = shallow->deep by bank distance, scrolling flow streaks, a wobbling bank foam
//  band, foam flecks and a few HDR sparkles (the only water pixels that reach the bloom knee).
// =====================================================================================

/** River ribbon along a centripetal Catmull-Rom through points [[x,z],...]. `overlap` extends under the banks. */
export function makeRiverGeometry(points, width, { y = -0.06, step = 1.0, overlap = 1.6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength(), n = Math.max(2, Math.ceil(len / step));
  const pos = [], uv = [], nrm = [], idx = [];
  const p = new THREE.Vector3(), tg = new THREE.Vector3();
  const half = width / 2 + overlap, X = [-1, -0.55, 0, 0.55, 1];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, p); curve.getTangentAt(u, tg);
    const l = Math.hypot(tg.x, tg.z) || 1, nx = -tg.z / l, nz = tg.x / l;
    for (const k of X) {
      pos.push(p.x + nx * half * k, y, p.z + nz * half * k);
      uv.push(width / 2 - Math.abs(k) * half, u * len);
      nrm.push(0, 1, 0);
    }
    if (i < n) {
      const a = i * X.length;
      for (let s = 0; s < X.length - 1; s++) {
        const q = a + s, r = q + X.length;
        idx.push(q, r, q + 1, q + 1, r, r + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  return g;
}

/** Pond disc (radius r, centre x,z). */
export function makePondGeometry(x, z, r, { y = -0.06, overlap = 1.6, seg = 40 } = {}) {
  const pos = [x, y, z], uv = [r, 0], nrm = [0, 1, 0], idx = [];
  const rings = [0.5, 0.85, 1];
  for (const f of rings) {
    const rr = f * (r + overlap);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr);
      uv.push(r - rr, a * r);
      nrm.push(0, 1, 0);
    }
  }
  for (let s = 0; s < seg; s++) idx.push(0, 1 + ((s + 1) % seg), 1 + s);
  for (let k = 0; k < rings.length - 1; k++) {
    const a0 = 1 + k * seg, a1 = 1 + (k + 1) * seg;
    for (let s = 0; s < seg; s++) {
      const s1 = (s + 1) % seg;
      idx.push(a0 + s, a0 + s1, a1 + s, a1 + s, a0 + s1, a1 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  return g;
}

// Make every triangle face +Y (CCW seen from above).
function fixWinding(g) {
  const p = g.attributes.position, ix = g.index.array;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const abx = p.getX(b) - p.getX(a), abz = p.getZ(b) - p.getZ(a);
    const acx = p.getX(c) - p.getX(a), acz = p.getZ(c) - p.getZ(a);
    if (abz * acx - abx * acz < 0) { ix[t + 1] = c; ix[t + 2] = b; }   // cross.y must be > 0
  }
}

/** Vertical waterfall ribbon; v = metres from the top. Place on a far-side cliff, rotateY to face the camera. */
export function makeWaterfallGeometry(width, height) {
  const g = new THREE.PlaneGeometry(width, height, 1, 8);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, width / 2 - Math.abs(uv.getX(i) - 0.5) * width, (1 - uv.getY(i)) * height);
  g.translate(0, height / 2, 0);
  return g;
}

const WATER_PARS = /* glsl */`
uniform vec3 uDeep, uShallow, uFoam;
uniform float uWidth, uSpeed, uSparkle, uLength, uFoamW;
varying vec2 vWUv;
float wFoam = 0.0;
`;

const WATER_COLOR = /* glsl */`
{
  float edgeM = max(vWUv.x, -2.0);                             // metres to the nearest bank
  vec2 fuv = vec2(vWUv.x, vWUv.y - uTime * uSpeed);
  vec2 wp = vEnvWorld.xz;
  float n1 = envNoise(wp * 0.5 + vec2(0.0, uTime * 0.2));
  float n2 = envNoise(fuv * vec2(1.3, 0.45) + vec2(5.2, uTime * 0.25));
  float streak = smoothstep(0.62, 0.7, envNoise(fuv * vec2(1.6, 0.12) + 3.0));
  vec3 c;
#ifdef WATERFALL
  c = mix(uShallow, uFoam, clamp(smoothstep(0.45, 0.75, n2) * 0.8 + streak * 0.6, 0.0, 1.0));
  wFoam = smoothstep(uLength - 1.5, uLength, vWUv.y);
  c = mix(c, uFoam, wFoam);
#else
  c = mix(uShallow, uDeep, smoothstep(0.2, max(0.6 * uWidth, 1.0), edgeM));
  c *= 0.94 + 0.12 * envNoise(wp * 0.35 - uTime * 0.05);
  c = mix(c, mix(uShallow, uFoam, 0.45), streak * 0.45 * smoothstep(0.2, 1.2, edgeM));
  float fe = uFoamW * (0.45 + 0.7 * n1) + 0.08 * sin(vWUv.y * 1.7 - uTime * 2.2);
  wFoam = 1.0 - smoothstep(fe, fe + 0.08, edgeM);
  wFoam = max(wFoam, step(0.84, n2) * (1.0 - smoothstep(0.3, 1.5, edgeM)) * 0.85);
  // soft line where water meets foam
  c = mix(c, uShallow * 1.08, (1.0 - smoothstep(fe + 0.08, fe + 0.5, edgeM)) * 0.5);
  c = mix(c, uFoam, wFoam);
#endif
  diffuseColor.rgb = c;
}
`;

const WATER_EMISSIVE = /* glsl */`
{
  vec2 sp = vEnvWorld.xz * 2.4;
  float s = envNoise(sp + vec2(uTime * 0.9, -uTime * 0.6)) * envNoise(sp * 1.37 - vec2(uTime * 0.7, uTime * 0.5));
  totalEmissiveRadiance += uFoam * uSparkle * smoothstep(0.6, 0.68, s) * (1.0 - wFoam) * smoothstep(0.4, 1.2, vWUv.x);
}
`;

/** pal: { deep, shallow, foam }. o: { width (nominal, for depth falloff), speed m/s, sparkle, foamWidth m, waterfall, length } */
export function createWaterMaterial(pal, { width = 6, speed = 0.8, sparkle = 0.9, foamWidth = 0.45, waterfall = false, length = 10 } = {}) {
  const uniforms = {
    uDeep: { value: new THREE.Color(pal.deep) }, uShallow: { value: new THREE.Color(pal.shallow) },
    uFoam: { value: new THREE.Color(pal.foam) }, uWidth: { value: width }, uFoamW: { value: foamWidth },
    uSpeed: { value: waterfall ? 6.0 : speed }, uSparkle: { value: waterfall ? 0 : sparkle }, uLength: { value: length },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (waterfall) mat.defines = { WATERFALL: '' };
  patchEnv(mat, {
    key: waterfall ? 'waterfall' : 'water', uniforms,
    vertexPars: 'varying vec2 vWUv;', vertexMain: 'vWUv = uv;',
    fragmentPars: WATER_PARS, colorFragment: WATER_COLOR, emissiveFragment: WATER_EMISSIVE,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}
