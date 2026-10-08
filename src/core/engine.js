import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp } from './utils.js';

const _col = new THREE.Color();

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
    varying vec2 vUv;

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

      // Per-act tint (linear multiply).
      col *= uTint;

      // Saturation around luminance. Low HP pulls it toward 40 %.
      float sat = uSaturation * mix(1.0, 0.4, uLowHp);
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, sat);

      // Contrast around linear mid-grey.
      col = max((col - 0.18) * uContrast + 0.18, vec3(0.0));

      // Smooth radial vignette.
      float vig = smoothstep(0.35, 1.1, d);
      col *= 1.0 - uVignette * vig;

      // Low-HP red edge glow, pulsing at about 2 Hz.
      float beat = 0.55 + 0.45 * sin(uTime * 12.566371);
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
    // Bloom thresholds the PEAK channel of pre-exposure linear HDR with a soft knee: sunlit ground
    // (peak ≲ 0.7) never blooms, HDR spells (×1.4+) do. See design/research/04-vfx-readability.md §3.2.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.35, 1.1);
    patchBloomHighPass(this.bloom, 0.35);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.gradeU = this.grade.uniforms;
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
