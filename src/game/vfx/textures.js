import * as THREE from 'three';

// =====================================================================================
//  Procedural textures for the VFX toolkit (built once at boot, no asset files).
//
//  SPRITE ATLAS  512x512 RGBA8, 4x4 cells of 128 px. Channel packing (not colour!):
//    R = soft shape field (blurred mask; 0.5 = the drawn edge). Thresholding it at different
//        levels gives the silhouette, an ink outline band and the erosion front.
//    G = baked toon light (from the field gradient, sun from the upper left), 0.5 = terminator.
//    B = erosion noise (fbm). Shader: field - erode * (1 - B) eats the sprite from noisy holes.
//    A = hot core (field^3) for glow sprites.
//  Every stretchable sprite is drawn pointing UP (+v): the shader aligns +v with velocity.
//
//  NOISE  256x256 RGBA8, tileable: R = fbm (period 4), G = fbm (period 16),
//         B = Worley edge distance F2-F1 (period 8 cells; 0 on cell borders), A = Worley cell id.
//
//  Gotcha: never pack data through canvas alpha (putImageData premultiplies). The canvas is
//  only used to rasterise white-on-black masks; packing happens in a Uint8Array.
// =====================================================================================

export const CELL = {
  puff: 0, wisp: 1, flame: 2, streak: 3,
  star: 4, snowflake: 5, iceChip: 6, flake: 7,
  rune: 8, rune2: 9, droplet: 10, ring: 11,
  curl: 12, zigzag: 13, dot: 14, glint: 15,
};
export const ATLAS_GRID = 4;
const CS = 128;
const AS = CS * ATLAS_GRID;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Periodic value noise (period P lattice cells) and fbm on [0,1)^2.
function vnoiseP(x, y, P, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (i) => ((i % P) + P) % P;
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s);
  const c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbmP(x, y, P, oct, s) {
  let sum = 0, amp = 0.5, norm = 0, p = P;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoiseP(x * p, y * p, p, s + o * 17);
    norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

// ------------------------------------------------------------------ cell painters
// ctx: 128x128, black background, white fill/stroke. r: rng.
const C = CS / 2;
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function line(g, pts, w) {
  g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
}
function blobPath(g, cx, cy, rad, wob, n, r) {
  g.beginPath();
  const ph = r() * 6.28;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (1 + wob * Math.sin(a * 3 + ph) * 0.6 + wob * Math.sin(a * 5 + ph * 2) * 0.4);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.fill();
}
function glyph(g, r, w) {
  // 3-4 strokes between points of a 3x3 grid: reads as a rune at 20 px.
  const P = (i) => [C + ((i % 3) - 1) * 30, C + (Math.floor(i / 3) - 1) * 36];
  let at = Math.floor(r() * 9);
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    let to = Math.floor(r() * 9);
    if (to === at) to = (to + 4) % 9;
    const a = P(at), b = P(to);
    line(g, [a[0], a[1], b[0], b[1]], w);
    at = to;
  }
}

const DRAW = {
  puff(g, r) {                                   // cumulus puff: overlapping circles, flat-ish base
    circle(g, C, C + 8, 34);
    circle(g, C - 26, C + 14, 24);
    circle(g, C + 27, C + 12, 26);
    circle(g, C - 8, C - 16, 28);
    circle(g, C + 16, C - 8, 22);
  },
  wisp(g, r) { blobPath(g, C, C, 40, 0.35, 48, r); },
  flame(g) {                                     // tongue: round base, S-curved point (points up)
    g.beginPath();
    g.moveTo(C, 10);
    g.bezierCurveTo(C + 18, 40, C + 44, 70, C + 34, 96);
    g.bezierCurveTo(C + 26, 118, C - 26, 118, C - 34, 96);
    g.bezierCurveTo(C - 42, 74, C - 6, 54, C, 10);
    g.fill();
  },
  streak(g) {                                    // fat tapered capsule pointing up (stretch makes it thin)
    g.beginPath();
    g.moveTo(C, 6);
    g.quadraticCurveTo(C + 40, 18, C + 30, 60);
    g.lineTo(C + 10, 122); g.lineTo(C - 10, 122); g.lineTo(C - 30, 60);
    g.quadraticCurveTo(C - 40, 18, C, 6);
    g.fill();
  },
  star(g) {                                      // 4-point spark star with thin rays
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? 56 : 12;
      const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  },
  snowflake(g) {                                 // 6-arm dendrite
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      line(g, [C, C, C + ca * 50, C + sa * 50], 9);
      for (const d of [22, 36]) {
        const bx = C + ca * d, by = C + sa * d, L = 16 - d * 0.15;
        for (const s of [-1, 1]) {
          const b = a + s * 0.9;
          line(g, [bx, by, bx + Math.cos(b) * L, by + Math.sin(b) * L], 7);
        }
      }
    }
    circle(g, C, C, 10);
  },
  iceChip(g, r) {                                // faceted shard, long axis up
    g.beginPath();
    g.moveTo(C + 4, 8); g.lineTo(C + 30, 70); g.lineTo(C + 10, 118);
    g.lineTo(C - 22, 104); g.lineTo(C - 28, 46);
    g.closePath(); g.fill();
  },
  flake(g) {                                     // leaf / ash flake
    g.beginPath();
    g.moveTo(C, 12);
    g.quadraticCurveTo(C + 46, 60, C, 116);
    g.quadraticCurveTo(C - 46, 60, C, 12);
    g.fill();
  },
  rune(g, r) { glyph(g, r, 11); },
  rune2(g, r) { glyph(g, r, 11); circle(g, C, C + 46, 6); },
  droplet(g) {                                   // teardrop, point up
    g.beginPath();
    g.moveTo(C, 10);
    g.bezierCurveTo(C + 10, 40, C + 34, 64, C + 34, 84);
    g.arc(C, 84, 34, 0, Math.PI);
    g.bezierCurveTo(C - 34, 64, C - 10, 40, C, 10);
    g.fill();
  },
  ring(g) { g.lineWidth = 12; g.beginPath(); g.arc(C, C, 46, 0, Math.PI * 2); g.stroke(); },
  curl(g) {                                      // wind gust: a tapered comma swirl
    g.lineCap = 'round';
    let px = C - 44, py = C + 30;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, a = Math.PI * (1.2 + 1.5 * t), rr = 44 * (1 - 0.6 * t);
      const x = C + Math.cos(a) * rr, y = C + 6 + Math.sin(a) * rr;
      line(g, [px, py, x, y], 14 * (1 - t) + 3);
      px = x; py = y;
    }
  },
  zigzag(g) { g.lineCap = 'round'; line(g, [C - 6, 8, C + 14, 44, C - 12, 74, C + 8, 120], 10); },
  dot(g) { circle(g, C, C, 40); },
  glint(g) {                                     // plus-shaped sparkle with soft centre
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? 58 : 7;
      const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    circle(g, C, C, 14);
  },
};

// Separable box blur, `iters` passes (3 passes ~ gaussian). a: in/out, tmp: scratch.
function blur(a, tmp, n, rad, iters) {
  const w = 1 / (2 * rad + 1);
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += a[y * n + Math.min(n - 1, Math.max(0, x + k))];
        tmp[y * n + x] = s * w;
      }
    }
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += tmp[Math.min(n - 1, Math.max(0, y + k)) * n + x];
        a[y * n + x] = s * w;
      }
    }
  }
}

export function buildSpriteAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = CS;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(AS * AS * 4);
  const f = new Float32Array(CS * CS), tmp = new Float32Array(CS * CS);
  const rng = mulberry32(1337);
  const L = [-0.55, 0.62, 0.56];                 // light in cell space (x right, y UP, z out)
  const ll = Math.hypot(L[0], L[1], L[2]);
  for (const [name, idx] of Object.entries(CELL)) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    DRAW[name](g, rng);
    const px = g.getImageData(0, 0, CS, CS).data;
    for (let i = 0; i < CS * CS; i++) f[i] = px[i * 4] / 255;
    blur(f, tmp, CS, 3, 3);                      // ~5 px soft field: 0.5 = original edge
    const cx = (idx % ATLAS_GRID) * CS, cy = Math.floor(idx / ATLAS_GRID) * CS;
    for (let y = 0; y < CS; y++) {
      for (let x = 0; x < CS; x++) {
        const i = y * CS + x;
        const v = f[i];
        // gradient of the field -> fake normal (canvas y is down; flip to cell-up)
        const gx = f[y * CS + Math.min(CS - 1, x + 1)] - f[y * CS + Math.max(0, x - 1)];
        const gy = f[Math.max(0, y - 1) * CS + x] - f[Math.min(CS - 1, y + 1) * CS + x];
        let nx = -gx * 6, ny = -gy * 6, nz = 0.35 + v;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const lit = Math.max(0, Math.min(1, 0.5 + 0.6 * (nx * L[0] + ny * L[1] + nz * L[2]) / ll - 0.12));
        const n = fbmP(x / CS, y / CS, 4, 3, idx * 31 + 7);
        // texture rows are bottom-up (flipY false): flip the cell vertically
        const o = ((cy + (CS - 1 - y)) * AS + cx + x) * 4;
        data[o] = Math.round(v * 255);
        data[o + 1] = Math.round(lit * 255);
        data[o + 2] = Math.round(n * 255);
        data[o + 3] = Math.round(Math.pow(v, 3) * 255);
      }
    }
  }
  const tex = new THREE.DataTexture(data, AS, AS, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function buildNoiseTexture(N = 256) {
  const data = new Uint8Array(N * N * 4);
  const G = 8;                                   // Worley cells per side
  const fx = new Float32Array(G * G), fz = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    fx[j * G + i] = 0.15 + 0.7 * hash2(i, j, 91);
    fz[j * G + i] = 0.15 + 0.7 * hash2(i, j, 92);
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const r = fbmP(u, v, 4, 4, 11);
      const g = fbmP(u, v, 16, 3, 23);
      const px = u * G, py = v * G;
      const ix = Math.floor(px), iy = Math.floor(py);
      let f1 = 9, f2 = 9, id = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx, cy = iy + dy;
          const wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G;
          const qx = cx + fx[wy * G + wx], qy = cy + fz[wy * G + wx];
          const d = Math.hypot(qx - px, qy - py);
          if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, 93); } else if (d < f2) f2 = d;
        }
      }
      const o = (y * N + x) * 4;
      data[o] = Math.round(r * 255);
      data[o + 1] = Math.round(g * 255);
      data[o + 2] = Math.round(Math.min(1, (f2 - f1) * 1.6) * 255);
      data[o + 3] = Math.round(id * 255);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ ramp atlas
// One row = 64 samples of a curve over t in [0,1]. HalfFloat RGBA so colours can be HDR and the
// GPU filters between samples. Rows are allocated on demand (presets are compiled lazily).
const RW = 64;
const _c = new THREE.Color();

// Mark a key list as stepped (hold each key until the next): toon bands instead of gradients.
export const step = (keys) => Object.assign(keys, { step: true });

// curve forms: number | [[t, v], ...]   (linear between keys; step([...]) = hold)
function evalCurve(curve, t) {
  if (typeof curve === 'number') return curve;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i][0]) {
      const [t0, v0] = curve[i - 1], [t1, v1] = curve[i];
      if (curve.step) return v0;
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * k;
    }
  }
  return curve[curve.length - 1][1];
}
// colour curve: hex | [[t, hex, hdr?], ...]  -> linear rgb * hdr
function evalColor(curve, t, out) {
  if (typeof curve === 'number') { _c.set(curve); out[0] = _c.r; out[1] = _c.g; out[2] = _c.b; return; }
  let i = 1;
  while (i < curve.length && t > curve[i][0]) i++;
  const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i)];
  const k = curve.step || b === a ? 0 : Math.min(1, Math.max(0, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
  _c.set(a[1]).multiplyScalar(a[2] ?? 1);
  const r0 = _c.r, g0 = _c.g, b0 = _c.b;
  _c.set(b[1]).multiplyScalar(b[2] ?? 1);
  out[0] = r0 + (_c.r - r0) * k; out[1] = g0 + (_c.g - g0) * k; out[2] = b0 + (_c.b - b0) * k;
}

export class RampAtlas {
  constructor(rows = 128) {
    this.rows = rows;
    this.next = 0;
    this.data = new Uint16Array(RW * rows * 4);
    this.tex = new THREE.DataTexture(this.data, RW, rows, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this._rgb = [0, 0, 0];
  }
  // channels: { color: colourCurve, x?, y?, z?, w? } where x..w are scalar curves.
  // If color is given it fills rgb and `w` (or alpha) fills a. Returns the row index.
  addRow(ch) {
    if (this.next >= this.rows) { console.warn('RampAtlas full'); return this.rows - 1; }
    const row = this.next++;
    const H = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < RW; i++) {
      const t = i / (RW - 1);
      let r, g, b, a;
      if (ch.color !== undefined) {
        evalColor(ch.color, t, this._rgb);
        [r, g, b] = this._rgb;
        a = evalCurve(ch.alpha ?? 1, t);
      } else {
        r = evalCurve(ch.x ?? 0, t); g = evalCurve(ch.y ?? 0, t);
        b = evalCurve(ch.z ?? 0, t); a = evalCurve(ch.w ?? 0, t);
      }
      const o = (row * RW + i) * 4;
      this.data[o] = H(r); this.data[o + 1] = H(g); this.data[o + 2] = H(b); this.data[o + 3] = H(a);
    }
    this.tex.needsUpdate = true;
    return row;
  }
}
// GLSL: sample row `row` at t (call with the ramp's row count as uRampRows)
export const RAMP_GLSL = /* glsl */`
  uniform sampler2D uRamp; uniform float uRampRows;
  vec4 ramp(float row, float t) {
    return texture(uRamp, vec2(clamp(t, 0.0, 1.0) * (63.0 / 64.0) + 0.5 / 64.0, (row + 0.5) / uRampRows));
  }`;

// Multiply every key of a colour curve by an rgb tint (keeps step()). Used for default paint shadows.
export function tintCurve(curve, tint) {
  const c = new THREE.Color();
  const mul = (hex) => c.set(hex).multiply(new THREE.Color(tint[0], tint[1], tint[2])).getHex();
  if (typeof curve === 'number') return mul(curve);
  const out = curve.map(([t, hex, hdr]) => [t, mul(hex), hdr ?? 1]);
  if (curve.step) out.step = true;
  return out;
}
