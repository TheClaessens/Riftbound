import * as THREE from 'three';
import { patchEnv } from './common.js';

// =====================================================================================
//  Ground: one displaced 260 m plane (flat inside the arena) with a world-space splat shader
//  driven by the layout mask: two base colours by low-frequency fBm, darker patches, fine
//  mottling, painted path edges with a worn halo, wet banks, bare soil under props, slope rock.
//  Optional Voronoi cracked earth (barrens). No textures, nothing tiles.
// =====================================================================================

const GROUND_PARS = /* glsl */`
uniform sampler2D uMask;
uniform vec2  uMaskOrigin;
uniform float uMaskSize;
uniform vec3  uGroundA, uGroundB, uGroundDark, uGroundDry, uPath, uPathEdge, uBank, uSlope, uSoil, uSpeck;
uniform float uCracks, uSpeckAmt, uPathPebbles;
varying float vEnvNY;
float envCrack(vec2 p) {                     // 1 on Voronoi cell borders
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(envHash(i + g), envHash(i + g + 31.7));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return 1.0 - smoothstep(0.02, 0.07, d2 - d1);
}
`;

const GROUND_COLOR = /* glsl */`
{
  vec2 xz = vEnvWorld.xz;
  vec4 m = texture(uMask, (xz - uMaskOrigin) / uMaskSize);
  float big  = envFbm(xz * 0.028);
  float huge = envNoise(xz * 0.011 + 3.0);
  float mid  = envNoise(xz * 0.21);
  float fine = envNoise(xz * 1.9);
  vec3 c = mix(uGroundA, uGroundB, smoothstep(0.36, 0.64, big));
  c = mix(c, uGroundDark, smoothstep(0.58, 0.8, mid) * 0.45 + smoothstep(0.45, 0.8, 1.0 - huge) * 0.35);
  float dry = smoothstep(0.5, 0.8, envNoise(xz * 0.017 + 9.0));
  c = mix(c, uGroundDry, dry * 0.55);
  c *= 0.94 + 0.12 * fine;
  // speckles (leaf litter / pebbles), crisp dots
  float sp = envNoise(xz * 3.7 + 11.0);
  c = mix(c, uSpeck, step(0.86, sp) * uSpeckAmt);
  if (uCracks > 0.0) c *= 1.0 - uCracks * 0.4 * envCrack(xz * 0.55) * smoothstep(0.3, 0.6, big);
  // bare soil where props thinned the grass (B low but not path / water / slope)
  float soil = (1.0 - smoothstep(0.15, 0.7, m.b)) * (1.0 - smoothstep(0.2, 0.45, m.r)) * (1.0 - smoothstep(0.3, 0.45, m.g)) * smoothstep(0.85, 0.95, vEnvNY);
  c = mix(c, uSoil * (0.9 + 0.2 * fine), soil * 0.75);
  // painted path: noisy threshold gives a crisp hand-drawn border, worn halo around it
  float pth  = m.r + (mid - 0.5) * 0.3 + (fine - 0.5) * 0.08;
  float worn = smoothstep(0.2, 0.42, pth);
  float path = smoothstep(0.47, 0.52, pth);
  c = mix(c, uPathEdge, worn * (1.0 - path) * 0.75);
  vec3 pc = uPath * (0.9 + 0.2 * fine);
  pc = mix(pc, uPath * 0.72, step(0.8, envNoise(xz * 5.3)) * uPathPebbles);            // pebbles
  pc = mix(pc, uPath * 1.12, step(0.83, envNoise(xz * 4.1 + 7.0)) * uPathPebbles);
  c = mix(c, pc, path);
  // wet bank toward water
  c = mix(c, uBank * (0.9 + 0.2 * mid), smoothstep(0.3, 0.47, m.g + (fine - 0.5) * 0.04));
  // steep slopes: rock / earth
  c = mix(c, uSlope * (0.85 + 0.3 * mid), 1.0 - smoothstep(0.7, 0.88, vEnvNY));
  diffuseColor.rgb = c;
}
`;

/** pal: { groundA, groundB, groundDark, groundDry (large sun-bleached patches), path, pathEdge, bank, slope, soil, speck, speckAmt, cracks, pebbles } (hex) */
export function createGround({ mask, heightFn, pal, size = 260, segments = 200 }) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightFn(p.getX(i), p.getZ(i)));
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();

  const C = (h) => new THREE.Color(h);
  const uniforms = {
    uMask: { value: mask.texture }, uMaskOrigin: { value: mask.origin }, uMaskSize: { value: mask.size },
    uGroundA: { value: C(pal.groundA) }, uGroundB: { value: C(pal.groundB) }, uGroundDark: { value: C(pal.groundDark) }, uGroundDry: { value: C(pal.groundDry ?? pal.groundB) },
    uPath: { value: C(pal.path) }, uPathEdge: { value: C(pal.pathEdge) }, uBank: { value: C(pal.bank) },
    uSlope: { value: C(pal.slope) }, uSoil: { value: C(pal.soil ?? pal.pathEdge) }, uSpeck: { value: C(pal.speck ?? pal.groundDark) },
    uSpeckAmt: { value: pal.speckAmt ?? 0.35 }, uCracks: { value: pal.cracks ?? 0 }, uPathPebbles: { value: pal.pebbles ?? 0.6 },
  };
  const mat = patchEnv(new THREE.MeshLambertMaterial({ color: 0xffffff }), {
    key: 'ground', uniforms,
    vertexPars: 'varying float vEnvNY;', vertexMain: 'vEnvNY = normal.y;',
    fragmentPars: GROUND_PARS, colorFragment: GROUND_COLOR,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.name = 'env.ground';
  mesh.userData.uniforms = uniforms;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}
