import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { clamp } from './utils.js';

const _col = new THREE.Color();

// Hero readability layer (playtest round 1, issue #3). Everything that forms the player's "mark" (the hero rig
// and its ground ring) also lives on this layer; HeroMaskPass re-renders just that layer into one extra render
// target, and the grade pass compares it with the finished frame to see where the hero is covered.
export const HERO_LAYER = 5;

// Sun: front-left of the iso camera, ~52° elevation, so camera-facing sides are lit and shadows fall
// screen-right / up (a 6 m tree throws a ~4.7 m shadow). SUN_VIEW is the light's rotation (texel snap).
const SUN_OFFSET = new THREE.Vector3(-12, 34, 24).normalize().multiplyScalar(80);
const SUN_VIEW = new THREE.Matrix4().lookAt(SUN_OFFSET, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
const SUN_VIEW_INV = SUN_VIEW.clone().invert();
const _sv = new THREE.Vector3();
const SELF_SHAKE_MAX = 0.32;      // cap for player-caused shake (offset ≈ 0.09 u)

// Linear-space RGB from a hex colour (HDR grade works in linear before OutputPass).
const linHex = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// Screen-space feedback presets. amp = flash strength, aber = chromatic aberration, dur = decay (s).
const PULSES = {
  hit:     { amp: 0.35, aber: 0.4, dur: 0.3, color: [1.0, 0.12, 0.08] },
  perfect: { amp: 0.6, aber: 0.8, dur: 0.4, color: linHex(0x9dffb0) },
  shift:   { amp: 1.0, aber: 1.0, dur: 1.2, color: linHex(0xe6dcff) },
};

// Low-HP states in which the red edge pulse is active.
const LOW_HP_STATES = new Set(['playing', 'levelup', 'relic']);

// Grade defaults (setGrade fills missing fields from the current values).
const GRADE_DEFAULT = { tint: [1, 1, 1], saturation: 1.06, contrast: 1.03, vignette: 0.18 };

// Single full-screen grade pass, run after bloom and before OutputPass (tone mapping + sRGB).
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.18 },
    uLowHp: { value: 0 },
    uPulse: { value: 0 },
    uPulseColor: { value: new THREE.Vector3(1, 1, 1) },
    uAberration: { value: 0 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    // hero readability layer (HeroMaskPass)
    tHero: { value: null },
    tBloom: { value: null },                                // UnrealBloomPass composite (what bloom added)
    uHeroOn: { value: 0 },                                  // 1 while the mask is valid this frame
    uHeroBox: { value: new THREE.Vector4(0, 0, 0, 0) },     // mask region in uv (min.xy, max.xy)
    uHeroRim: { value: new THREE.Vector3(1, 1, 1) },        // light rim colour (class element, near white)
    uHeroPx: { value: new THREE.Vector2(1.6, 3.4) },        // rim radii in pixels (light band, dark band)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uLowHp;
    uniform float uPulse;
    uniform vec3 uPulseColor;
    uniform float uAberration;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform sampler2D tHero;
    uniform sampler2D tBloom;
    uniform float uHeroOn;
    uniform vec4 uHeroBox;
    uniform vec3 uHeroRim;
    uniform vec2 uHeroPx;
    varying vec2 vUv;

    // Hero mask (HeroMaskPass): a = 1 on the hero rig (opaque), ~0.9 on the ground ring's band;
    // rgb = PRE-BLOOM scene − the hero's own unoccluded colour (signed), i.e. what covers the hero.
    const float HERO_A = 0.985;
    const float RING_A = 0.8;

    // 0..1: how much a pixel differs from the hero's own colour, relative to the hero's brightness.
    // d = the difference to judge; own = the hero's own colour there.
    float heroCover(vec3 d, vec3 own) {
      float dm = max(abs(d.r), max(abs(d.g), abs(d.b)));
      float ref = max(own.r, max(own.g, own.b));
      return smoothstep(0.45, 1.1, dm / (0.5 * ref + 0.1));
    }

    void main() {
      vec2 centered = vUv - 0.5;
      // Aspect-corrected radius: about 0 at the centre and about 1 at the corners.
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 p = centered * vec2(aspect, 1.0);
      float d = length(p);

      // Radial chromatic aberration: R and B pushed apart, about 3 px at the corners at full strength.
      vec3 col;
      if (uAberration > 0.001) {
        vec2 off = centered * 6.0 * uAberration / uResolution;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }

      // Low-HP beat, about 2 Hz (edge glow + hero outline).
      float beat = 0.55 + 0.45 * sin(uTime * 12.566371);

      // ---- Hero readability layer (HeroMaskPass). Only inside the hero's screen box, so a calm frame is
      // untouched: where the hero is covered (own VFX, bloom wash, a cloud), its own colour is restored at
      // ~80 % and a thin two-tone rim (light, then dark ink) traces the covered silhouette. At low HP the
      // whole silhouette gets the rim and its light band pulses red with the edge glow.
      if (uHeroOn > 0.5 && vUv.x > uHeroBox.x && vUv.y > uHeroBox.y && vUv.x < uHeroBox.z && vUv.y < uHeroBox.w) {
        vec2 px = 1.0 / uResolution;
        // Per sample: diff = pre-bloom − hero (mask rgb), b = bloom added there, post = finished pixel.
        // own = post − b − diff (the hero's colour); "pre" cover = diff only (spell VFX, clouds, bodies in
        // front), "post" cover = diff + b (also the bloom wash from big blasts, but also the hero's own glow).
        // (1) one coverage estimate for the whole box (coherent fetches) gates everything, so grass over a
        // boot, a passing enemy's arm or the hero's own crystal glow never draws a rim.
        float hn = 0.0, hpre = 0.0, hpost = 0.0;
        for (int j = 0; j < 10; j++) {
          for (int i = 0; i < 6; i++) {
            vec2 q = mix(uHeroBox.xy, uHeroBox.zw, (vec2(float(i), float(j)) + 0.5) / vec2(6.0, 10.0));
            vec4 m = texture2D(tHero, q);
            if (m.a > HERO_A) {
              vec3 b = texture2D(tBloom, q).rgb;
              vec3 own = max(texture2D(tDiffuse, q).rgb - b - m.rgb, vec3(0.0));
              hn += 1.0; hpre += heroCover(m.rgb, own); hpost += heroCover(m.rgb + b, own);
            }
          }
        }
        // measured fractions: calm (all classes, own glow + cast flash) pre 0.01–0.02 / post ≤ 0.28;
        // peak-VFX cases pre 0.1–0.8 / post 0.24–0.93
        float gate = hn > 1.5 ? max(smoothstep(0.05, 0.2, hpre / hn), smoothstep(0.36, 0.55, hpost / hn)) : 0.0;
        float lowRim = clamp(uLowHp * 2.5, 0.0, 1.0) * (0.75 + 0.25 * beat);   // full outline at low HP
        // (2) this pixel: restore the hero / its ring through whatever covers it (col − diff − b = hero)
        vec4 m0 = texture2D(tHero, vUv);
        float isHero = step(HERO_A, m0.a);
        float isRing = step(RING_A, m0.a) * (1.0 - isHero);
        vec3 b0 = texture2D(tBloom, vUv).rgb;
        vec3 cov0 = m0.rgb + b0 * isHero;
        float c0 = heroCover(cov0, max(col - cov0, vec3(0.0)));
        float rk = c0 * (isHero * 0.8 * gate + isRing * 0.65);
        float cm = max(abs(cov0.r), max(abs(cov0.g), abs(cov0.b)));
        // keep a hint of the cover, compressed by its brightness: 20 % of an HDR blast would still bleach a
        // dark coat, so the remainder is ~(1 − rk) / (1 + 3·rk·|cover|)
        col = max(col - cov0 + cov0 * (1.0 - rk) / (1.0 + 3.0 * rk * cm), vec3(0.0));
        // (3) rim just outside the silhouette (12 directions, light band then dark band)
        if (isHero < 0.5 && (gate > 0.0 || lowRim > 0.0)) {
          float hin = 0.0, hout = 0.0, rc = 0.0, rn = 0.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 0.5235988;
            vec2 dir = vec2(cos(a), sin(a)) * px;
            vec4 mi = texture2D(tHero, vUv + dir * uHeroPx.x);
            vec2 qo = vUv + dir * uHeroPx.y;
            vec4 mo = texture2D(tHero, qo);
            float hi = step(HERO_A, mi.a), ho = step(HERO_A, mo.a);
            hin = max(hin, hi); hout = max(hout, ho);
            if (ho > 0.5) {
              vec3 cv = mo.rgb + texture2D(tBloom, qo).rgb;
              rc += heroCover(cv, max(texture2D(tDiffuse, qo).rgb - cv, vec3(0.0))); rn += 1.0;
            }
          }
          float local = rn > 0.0 ? smoothstep(0.1, 0.5, rc / rn) : 0.0;
          float rimK = max(local * gate, lowRim);
          // low HP: the light band beats from the class colour to a saturated red, in time with the edge glow
          float redK = clamp(uLowHp * 2.5, 0.0, 1.0) * (0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 12.566371)));
          vec3 lightC = mix(uHeroRim, vec3(1.25, 0.05, 0.035), redK);
          col = mix(col, lightC, hin * rimK);
          col = mix(col, vec3(0.012, 0.01, 0.02), max(hout - hin, 0.0) * rimK * 0.92);
        }
      }

      // Per-act tint (linear multiply).
      col *= uTint;

      // Saturation around luminance. Low HP drains colour only at the outer edge (the centre and the
      // hero stay fully readable; the old full-frame 40 % pull hid everything exactly when it mattered).
      float sat = uSaturation * (1.0 - 0.45 * uLowHp * smoothstep(0.55, 1.05, d));
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, sat);

      // Contrast around linear mid-grey.
      col = max((col - 0.18) * uContrast + 0.18, vec3(0.0));

      // Smooth radial vignette.
      float vig = smoothstep(0.35, 1.1, d);
      col *= 1.0 - uVignette * vig;

      // Low-HP red edge glow, pulsing at about 2 Hz.
      float redEdge = smoothstep(0.45, 1.0, d) * uLowHp * beat;
      col += vec3(0.55, 0.02, 0.015) * redEdge;

      // Short edge flash in the pulse colour.
      float flashEdge = mix(0.2, 1.0, smoothstep(0.2, 1.0, d));
      col += uPulseColor * uPulse * flashEdge;

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};

// Renderer, isometric orthographic camera, lights, bloom and the grade pass.
export class Engine {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb5d6b8);   // = biome haze colour (world.js sets it per biome)

    // Isometric camera. viewSize = world units visible vertically at zoom 1.
    this.viewSize = 24;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.isoOffset = new THREE.Vector3(1, 1.22, 1).normalize().multiplyScalar(120);
    this.camTarget = new THREE.Vector3();
    this.camera.position.copy(this.isoOffset);
    this.camera.lookAt(0, 0, 0);
    this.zoom = 1;
    this.targetZoom = 1;

    // Ground-plane basis for camera-relative movement.
    this.forward = new THREE.Vector3(-1, 0, -1).normalize(); // screen-up
    this.right = new THREE.Vector3(1, 0, -1).normalize();    // screen-right

    // Lights (fixed set: never add/remove lights at runtime). Daylight: warm sun + blue-sky hemisphere
    // (cool shadows). `moon` is the historical name of the sun DirectionalLight; `sun` aliases it.
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5f7034, 1.2);
    this.scene.add(this.hemi);
    this.moon = this.sun = new THREE.DirectionalLight(0xfff0d6, 3.15);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const s = this.moon.shadow.camera;
    s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.near = 20; s.far = 150;
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 0.03;
    this.moon.shadow.intensity = 0.85;                     // r166+: shadows never go fully dark
    this.moon.position.copy(SUN_OFFSET);
    this.scene.add(this.moon, this.moon.target);
    this._skyFlash = 0;                                    // lightning: transient hemisphere boost

    // Post processing: render -> bloom -> grade -> output (tone mapping + sRGB).
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Hero mask (readability layer): re-renders the hero layer into one extra target, scissored to the hero.
    this.heroRead = true;                                  // dev A/B switch: false = no mask, no composite
    this.heroPass = new HeroMaskPass(this);
    this.composer.addPass(this.heroPass);
    // Bloom thresholds the PEAK channel of pre-exposure linear HDR with a soft knee: sunlit ground
    // (peak ≲ 0.7) never blooms, HDR spells (×1.4+) do. See design/research/04-vfx-readability.md §3.2.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.35, 1.1);
    patchBloomHighPass(this.bloom, 0.35);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.gradeU = this.grade.uniforms;
    this.gradeU.tHero.value = this.heroPass.rt.texture;
    this.gradeU.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;   // its final composite (r170)
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    // Grade state: live values plus the lerp target (see setGrade).
    this._g = { tint: GRADE_DEFAULT.tint.slice(), saturation: GRADE_DEFAULT.saturation, contrast: GRADE_DEFAULT.contrast, vignette: GRADE_DEFAULT.vignette };
    this._gFrom = null; this._gTo = null; this._gT = 0; this._gDur = 0;
    // Pulse envelopes: flash (colour + strength) and chromatic aberration.
    this._flash = { amp: 0, dur: 1, t: 0, color: [1, 1, 1] };
    this._aber = { amp: 0, dur: 1, t: 0 };
    this._time = 0;

    this.trauma = 0;
    this._shakeOff = new THREE.Vector3();

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    const v = this.viewSize / 2;
    this.camera.left = -v * aspect; this.camera.right = v * aspect;
    this.camera.top = v; this.camera.bottom = -v;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.gradeU.uResolution.value.set(w * pr, h * pr);
  }

  // Pixels per world unit on screen (used by point sprites).
  pixelsPerUnit() {
    return (this.renderer.domElement.height / (this.camera.top - this.camera.bottom)) * this.camera.zoom;
  }

  // Two shake channels. 'threat' (you got hit, boss slams, hazards, Rift Shift) reads at full
  // strength. 'self' (your own reactions, impacts and blasts) is feedback: each kick is damped by
  // how much self-shake happened in the last second and the channel saturates low, so a late-game
  // build firing dozens of reactions a second never blurs the screen. shakeScale is the player
  // setting (1 full, 0.5 reduced, 0 off).
  shake(amount, kind = 'self') {
    const k = this.shakeScale ?? 1;
    if (k <= 0) return;
    if (kind === 'threat') { this.trauma = clamp(this.trauma + amount * k, 0, 1); return; }
    this._selfLoad = (this._selfLoad ?? 0) + amount;
    const add = amount * k / (1 + Math.max(0, this._selfLoad - amount) * 4);   // a lone kick lands in full
    this._selfTrauma = Math.min(SELF_SHAKE_MAX * k, (this._selfTrauma ?? 0) + add);
  }

  follow(target, dt, wheel = 0) {
    if (wheel) this.targetZoom = clamp(this.targetZoom * (wheel > 0 ? 0.9 : 1.1), 0.6, 1.6);
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-10 * dt));
    if (Math.abs(this.camera.zoom - this.zoom) > 1e-4) { this.camera.zoom = this.zoom; this.camera.updateProjectionMatrix(); }

    this.camTarget.lerp(target, 1 - Math.exp(-8 * dt));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this._selfTrauma = Math.max(0, (this._selfTrauma ?? 0) - dt * 2.4);
    this._selfLoad = (this._selfLoad ?? 0) * Math.exp(-dt * 1.5);
    const st = this._selfTrauma;
    const sh = (this.trauma * this.trauma + st * st) * 0.9;
    this._shakeOff.set((Math.random() * 2 - 1) * sh, 0, (Math.random() * 2 - 1) * sh);
    this.camera.position.copy(this.camTarget).add(this.isoOffset).add(this._shakeOff);
    this.camera.lookAt(this.camTarget.x + this._shakeOff.x, 0, this.camTarget.z + this._shakeOff.z);

    this._followSun();
  }

  // Sun shadow frustum: sized by zoom (crisp 3-5 cm texels), centred on the camera target and snapped
  // to whole shadow texels in light space so crisp shadow edges don't crawl while the camera lerps.
  _followSun() {
    const sun = this.moon, cam = sun.shadow.camera;
    const aspect = innerWidth / Math.max(1, innerHeight);
    const half = clamp(15 * Math.max(1, aspect) / this.zoom + 6, 24, 52);
    if (Math.abs(cam.right - half) > 0.5) {
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
    const texel = (2 * cam.right) / sun.shadow.mapSize.x;
    _sv.copy(this.camTarget).applyMatrix4(SUN_VIEW_INV);
    _sv.x = Math.round(_sv.x / texel) * texel;
    _sv.y = Math.round(_sv.y / texel) * texel;
    _sv.applyMatrix4(SUN_VIEW);
    sun.target.position.copy(_sv);
    sun.position.copy(_sv).add(SUN_OFFSET);
    sun.target.updateMatrixWorld();
  }

  // Lightning / sky flash: brief additive hemisphere boost (k ≈ 1 = strong), decays in ~0.25 s.
  skyFlash(k = 1) { this._skyFlash = Math.max(this._skyFlash, k); }

  // ---- Atmosphere / grading API (used by world.js biomes and by gameplay feedback) ----
  // atmos: { background, hemiSky, hemiGround, hemiIntensity, moon, moonIntensity, grade?: { tint:[r,g,b], saturation, contrast, vignette } }
  // Colors are hex numbers. Lerps over `seconds` (0 = instant).
  setAtmosphere(atmos, seconds = 0) {
    if (this._skyBoost) { this.hemi.intensity -= this._skyBoost; this._skyBoost = 0; }
    const from = {
      background: this.scene.background.clone(), hemiSky: this.hemi.color.clone(), hemiGround: this.hemi.groundColor.clone(),
      hemiIntensity: this.hemi.intensity, moon: this.moon.color.clone(), moonIntensity: this.moon.intensity,
    };
    this._atmos = { from, to: atmos, t: 0, dur: Math.max(1e-4, seconds) };
    if (atmos.grade) this.setGrade?.(atmos.grade, seconds);
    if (seconds <= 0) this._stepAtmos(1e9);
  }
  _stepAtmos(dt) {
    const a = this._atmos;
    if (!a) return;
    a.t = Math.min(a.dur, a.t + dt);
    const k = a.t / a.dur, f = a.from, to = a.to;
    const c = (dst, src, hex) => { if (hex !== undefined) dst.copy(src).lerp(_col.set(hex), k); };
    c(this.scene.background, f.background, to.background);
    c(this.hemi.color, f.hemiSky, to.hemiSky);
    c(this.hemi.groundColor, f.hemiGround, to.hemiGround);
    c(this.moon.color, f.moon, to.moon);
    if (to.hemiIntensity !== undefined) this.hemi.intensity = f.hemiIntensity + (to.hemiIntensity - f.hemiIntensity) * k;
    if (to.moonIntensity !== undefined) this.moon.intensity = f.moonIntensity + (to.moonIntensity - f.moonIntensity) * k;
    if (a.t >= a.dur) this._atmos = null;
  }

  // Grade: grade = { tint:[r,g,b], saturation, contrast, vignette }. Missing fields keep their current value.
  // seconds > 0 lerps from the current value; 0 applies instantly.
  setGrade(grade = {}, seconds = 0) {
    const cur = this._g;
    const to = {
      tint: Array.isArray(grade.tint) ? grade.tint.slice(0, 3) : cur.tint.slice(),
      saturation: grade.saturation ?? cur.saturation,
      contrast: grade.contrast ?? cur.contrast,
      vignette: grade.vignette ?? cur.vignette,
    };
    if (seconds > 0) {
      this._gFrom = { tint: cur.tint.slice(), saturation: cur.saturation, contrast: cur.contrast, vignette: cur.vignette };
      this._gTo = to; this._gT = 0; this._gDur = seconds;
    } else {
      this._g = to; this._gFrom = null; this._gTo = null;
    }
  }
  _stepGrade(dt) {
    if (!this._gTo) return;
    this._gT = Math.min(this._gDur, this._gT + dt);
    const k = this._gT / this._gDur, e = k * k * (3 - 2 * k); // smoothstep
    const f = this._gFrom, t = this._gTo, g = this._g;
    for (let i = 0; i < 3; i++) g.tint[i] = f.tint[i] + (t.tint[i] - f.tint[i]) * e;
    g.saturation = f.saturation + (t.saturation - f.saturation) * e;
    g.contrast = f.contrast + (t.contrast - f.contrast) * e;
    g.vignette = f.vignette + (t.vignette - f.vignette) * e;
    if (k >= 1) { this._gFrom = null; this._gTo = null; }
  }

  // Current strength of a decaying pulse envelope (quadratic falloff).
  _env(e) {
    const k = e.dur > 0 ? e.t / e.dur : 0;
    return e.amp * k * k;
  }
  // Short screen-space feedback: 'hit' | 'perfect' | 'shift'. A weaker pulse does not interrupt a stronger one.
  pulse(kind) {
    const P = PULSES[kind];
    if (!P) return;
    if (P.amp >= this._env(this._flash)) {
      this._flash.amp = P.amp; this._flash.dur = P.dur; this._flash.t = P.dur; this._flash.color = P.color;
    }
    if (P.aber >= this._env(this._aber)) {
      this._aber.amp = P.aber; this._aber.dur = P.dur; this._aber.t = P.dur;
    }
  }

  // Per-frame (real dt). game may be in any state.
  update(dt, game) {
    this._game = game;
    if (this._skyBoost) { this.hemi.intensity -= this._skyBoost; this._skyBoost = 0; }
    this._stepAtmos(dt);
    if (this._skyFlash > 0.001) {
      this._skyBoost = 2.4 * this._skyFlash;
      this.hemi.intensity += this._skyBoost;
      this._skyFlash *= Math.exp(-dt * 14);
    }
    this._stepGrade(dt);
    this._flash.t = Math.max(0, this._flash.t - dt);
    this._aber.t = Math.max(0, this._aber.t - dt);
    this._time += dt;

    const u = this.gradeU, g = this._g, fc = this._flash.color;
    u.uTint.value.set(g.tint[0], g.tint[1], g.tint[2]);
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uVignette.value = g.vignette;
    u.uPulse.value = this._env(this._flash);
    u.uPulseColor.value.set(fc[0], fc[1], fc[2]);
    u.uAberration.value = this._env(this._aber);
    u.uTime.value = this._time;
    u.uLowHp.value = lowHpAmount(game);
  }

  render() { this.composer.render(); }
}

// 0..1 red-edge strength: ramps up below 30 % HP while the run is active.
function lowHpAmount(game) {
  const p = game?.player;
  if (!p || !LOW_HP_STATES.has(game.state)) return 0;
  const max = p.stats?.maxHp || 1;
  return clamp((0.3 - p.hp / max) / 0.3, 0, 1);
}

// Hero readability mask. After the main render pass (so this frame's shadow map is reused, not redrawn),
// re-render only HERO_LAYER (hero rig + outline hull + ground ring, lit by the same lights) into one
// half-float target, scissored to the hero's screen box, then subtract it from the pre-bloom frame in
// place. The grade pass reads that difference: where it is large, the hero is covered.
// Cost: one scissored draw of ~5 small meshes + one scissored quad.
const _hb = new THREE.Vector3();
const _hc = new THREE.Color();
class HeroMaskPass extends Pass {
  constructor(engine) {
    super();
    this.engine = engine;
    this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    });
    this.rt.texture.name = 'HeroMask';
    this.rt.scissorTest = true;
    this._w = 1; this._h = 1;
    this._frame = 0;
    // second step, same target: rgb = pre-bloom scene − hero colour (FUNC_SUBTRACT on a signed half-float
    // target), alpha kept. Comparing BEFORE bloom keeps the hero's own glow halo from counting as cover.
    this.diff = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tScene; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tScene, vUv).rgb, 0.0); }',
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.SubtractEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }));
  }

  setSize(w, h) { this._w = w; this._h = h; this.rt.setSize(w, h); }
  dispose() { this.rt.dispose(); this.diff.dispose(); }

  render(renderer, writeBuffer, readBuffer) {
    const e = this.engine, u = e.gradeU;
    u.uHeroOn.value = 0;
    const p = e._game?.player, model = p?.model;
    if (!e.heroRead || !model || model.h?.hidden || !model.root?.visible) return;
    const cam = e.camera, scene = e.scene, W = this._w, H = this._h;

    // screen box: hero (≤ 2.9 m with raised arms / hats) + ground ring (r ≈ 1 m)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _hb.set(p.pos.x + (i & 1 ? 1.15 : -1.15), i & 2 ? 2.9 : 0, p.pos.z + (i & 4 ? 1.15 : -1.15)).project(cam);
      const sx = (_hb.x * 0.5 + 0.5) * W, sy = (_hb.y * 0.5 + 0.5) * H;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    const pr = renderer.getPixelRatio();
    const rIn = 1.6 * pr, rOut = 3.4 * pr;
    u.uHeroPx.value.set(rIn, rOut);
    // the composite box is padded by the rim; the scissor by twice that, so rim taps never read stale texels
    const pb = rOut + 2, ps = 2 * rOut + 4;
    const sx0 = Math.max(0, Math.floor(x0 - ps)), sy0 = Math.max(0, Math.floor(y0 - ps));
    const sx1 = Math.min(W, Math.ceil(x1 + ps)), sy1 = Math.min(H, Math.ceil(y1 + ps));
    if (sx1 - sx0 < 2 || sy1 - sy0 < 2) return;          // off screen

    // every light also lights the hero layer (fixed light set; re-checked now and then)
    if ((this._frame++ % 120) === 0) scene.traverse((o) => { if (o.isLight) o.layers.enable(HERO_LAYER); });

    const prevRT = renderer.getRenderTarget();
    const autoClear = renderer.autoClear, shadowAuto = renderer.shadowMap.autoUpdate;
    const bg = scene.background, layers = cam.layers.mask;
    renderer.getClearColor(_hc); const clearA = renderer.getClearAlpha();
    this.rt.scissor.set(sx0, sy0, sx1 - sx0, sy1 - sy0);
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    cam.layers.set(HERO_LAYER);
    renderer.render(scene, cam);
    cam.layers.mask = layers;
    scene.background = bg;
    this.diff.material.uniforms.tScene.value = readBuffer.texture;   // the main render, before bloom
    this.diff.render(renderer);
    renderer.shadowMap.autoUpdate = shadowAuto;
    renderer.autoClear = autoClear;
    renderer.setClearColor(_hc, clearA);
    renderer.setRenderTarget(prevRT);

    u.uHeroBox.value.set((x0 - pb) / W, (y0 - pb) / H, (x1 + pb) / W, (y1 + pb) / H);
    const rim = model.readRim;
    if (rim) u.uHeroRim.value.set(rim.r, rim.g, rim.b);
    u.uHeroOn.value = 1;
  }
}

// Replace UnrealBloomPass's luminance high-pass with a peak-channel, soft-knee one that only
// feeds the energy ABOVE the threshold into the blur (no halos around large bright areas).
function patchBloomHighPass(bloom, knee = 0.35) {
  bloom.highPassUniforms.smoothWidth.value = knee;
  bloom.materialHighPassFilter.fragmentShader = /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 defaultColor;
    uniform float defaultOpacity;
    uniform float luminosityThreshold;
    uniform float smoothWidth;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float v = max(texel.r, max(texel.g, texel.b));
      float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
      vec3 excess = texel.rgb * clamp((v - luminosityThreshold) / max(v, 1e-4), 0.0, 1.0);
      gl_FragColor = vec4(mix(defaultColor, excess, alpha), mix(defaultOpacity, texel.a, alpha));
    }`;
  bloom.materialHighPassFilter.needsUpdate = true;
}
