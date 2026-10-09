// =====================================================================================
//  v5 raid SFX + v6 Crownshard SFX (shard, pact, arena wall, poise, stagger, break checks). Mixed into Audio.prototype.
//  They use the same helpers as the rest of the SFX (_tone / _noise -> sfx bus -> masterGain) and are rate limited.
// =====================================================================================

export const SFX = {
  // ---------------------------------------------------------------- arena wall
  _wallRise() {
    if (!this._canPlaySound('wallRise', 1, 600)) return;
    try {
      this._noise({ dur: 1.7, gain: 0.2, attack: 0.9, filterType: 'lowpass', freqStart: 140, freqEnd: 420, Q: 1.2 });
      this._tone({ type: 'sine', freq: 46, freqEnd: 60, dur: 1.7, gain: 0.16, attack: 0.9 });
      this._tone({ type: 'sawtooth', freq: 62, freqEnd: 80, dur: 1.5, gain: 0.05, attack: 0.9, filter: { type: 'lowpass', freq: 220, Q: 1 } });
      for (let i = 0; i < 3; i++) {   // stones grinding into place
        this._noise({ dur: 0.07, gain: 0.07, attack: 0.004, filterType: 'bandpass', freqStart: 380 + Math.random() * 500, Q: 3, delay: 0.3 + i * 0.42 + Math.random() * 0.1 });
      }
      this._tone({ type: 'sine', freq: 70, freqEnd: 32, dur: 0.6, gain: 0.22, attack: 0.004, delay: 1.5 });     // settle thud
    } catch (err) { console.error('Wall rise sound error:', err); }
  },

  _wallSink() {
    if (!this._canPlaySound('wallSink', 1, 600)) return;
    try {
      this._noise({ dur: 2.3, gain: 0.16, attack: 0.15, filterType: 'lowpass', freqStart: 420, freqEnd: 70, Q: 1 });
      this._tone({ type: 'sine', freq: 62, freqEnd: 34, dur: 2.2, gain: 0.14, attack: 0.1 });
      for (let i = 0; i < 3; i++) {
        this._noise({ dur: 0.08, gain: 0.05, attack: 0.004, filterType: 'bandpass', freqStart: 300 + Math.random() * 300, Q: 3, delay: 0.2 + i * 0.6 + Math.random() * 0.1 });
      }
    } catch (err) { console.error('Wall sink sound error:', err); }
  },

  // ---------------------------------------------------------------- boss stingers (SFX layer)
  _heavyThud() {
    if (!this._canPlaySound('bossThud', 1, 140)) return;
    try {
      this._tone({ type: 'sine', freq: 82, freqEnd: 34, dur: 0.38, gain: 0.26, attack: 0.004 });
      this._noise({ dur: 0.16, gain: 0.12, attack: 0.002, filterType: 'lowpass', freqStart: 700, freqEnd: 120 });
    } catch (err) { console.error('Heavy thud sound error:', err); }
  },

  // Poise break: clear steel-white "stagger" sting (bright metal ring + a falling body), distinct from damage sounds.
  _staggerSting(reason) {
    if (!this._canPlaySound('stagger', 1, 300)) return;
    try {
      const soft = reason === 'winded';
      const g = soft ? 0.6 : 1;
      this._noise({ dur: 0.18, gain: 0.14 * g, attack: 0.002, filterType: 'highpass', freqStart: 3200 });
      [[2093, 0.9], [3136, 0.7], [4186, 0.5]].forEach(([f, d], i) => {
        this._tone({ type: 'sine', freq: f, dur: d, gain: (0.09 - i * 0.02) * g, attack: 0.002, delay: i * 0.012 });
      });
      this._tone({ type: 'triangle', freq: 880, freqEnd: 110, dur: 0.5, gain: 0.13 * g, attack: 0.004 });
      this._tone({ type: 'sine', freq: 90, freqEnd: 38, dur: 0.45, gain: 0.24 * g, attack: 0.004 });
    } catch (err) { console.error('Stagger sound error:', err); }
  },

  _recoverSting() {
    if (!this._canPlaySound('bossRecover', 1, 300)) return;
    try {
      this._noise({ dur: 0.35, gain: 0.07, attack: 0.25, filterType: 'bandpass', freqStart: 300, freqEnd: 1400, Q: 1.2 });
      this._tone({ type: 'sine', freq: 330, freqEnd: 495, dur: 0.3, gain: 0.07, attack: 0.02 });
    } catch (err) { console.error('Recover sound error:', err); }
  },

  // ---------------------------------------------------------------- poise gain tick (subtle, rate limited)
  _onPoise(e) {
    if (!this._canPlaySound('poiseTick', 1, 110)) return;
    try {
      const amt = e && e.amount ? Math.min(30, e.amount) : 4;
      const hot = e && (e.src === 'perfect' || e.src === 'crystal' || e.src === 'generator');
      const f = 1500 + amt * 18 + (hot ? 500 : 0);
      this._tone({ type: 'sine', freq: f, freqEnd: f * 1.06, dur: 0.05, gain: hot ? 0.035 : 0.022, attack: 0.002 });
    } catch (err) { console.error('Poise sound error:', err); }
  },

  // ---------------------------------------------------------------- Crownshard (v6)
  // Pact and seal sounds must stay audible while the screen is open and every other SFX is ducked:
  // they are routed past the SFX duck bus (see Audio._sfxDest).
  _pactVoice(fn) {
    const was = this._bypassDuck;
    this._bypassDuck = true;
    try { this._bigVoice(fn); } finally { this._bypassDuck = was; }
  },

  // Long cinematic sounds (wake, answer, ascend, pact): their many voices do not count against the SFX voice cap,
  // so they neither starve nor are starved by the gameplay SFX. (Wired in audio.js: on('shardWake', big(...)).)
  _bigVoice(fn) {
    const was = this._cinematic;
    this._cinematic = true;
    try { fn(); } finally { this._cinematic = was; }
  },

  // The shard wakes (0:50): stone grinding, chains snapping one by one, then a rising crystalline tone.
  _onShardWake() {
    if (!this._canPlaySound('shardWake', 1, 600, true)) return;
    try {
      // stone grind
      this._noise({ dur: 2.4, gain: 0.2, attack: 0.6, filterType: 'bandpass', freqStart: 90, freqEnd: 240, Q: 3 });
      this._noise({ dur: 1.8, gain: 0.1, attack: 0.4, filterType: 'lowpass', freqStart: 520, freqEnd: 130 });
      this._tone({ type: 'sine', freq: 48, freqEnd: 66, dur: 2.4, gain: 0.2, attack: 0.6 });
      for (let i = 0; i < 6; i++) {
        this._noise({ dur: 0.07, gain: 0.06, attack: 0.003, filterType: 'bandpass', freqStart: 300 + Math.random() * 600, Q: 3, delay: 0.1 + i * 0.32 + Math.random() * 0.1 });
      }
      // chains snapping: a metal crack, a short ring and a dull thud each
      [0.7, 1.02, 1.4, 1.72].forEach((d, i) => {
        const ring = 2200 + i * 330 + Math.random() * 300;
        this._noise({ dur: 0.05, gain: 0.13, attack: 0.001, filterType: 'highpass', freqStart: 2800 + Math.random() * 800, delay: d });
        this._tone({ type: 'triangle', freq: ring, freqEnd: ring * 0.72, dur: 0.2, gain: 0.06, attack: 0.002, delay: d });
        this._tone({ type: 'sine', freq: 120, freqEnd: 58, dur: 0.14, gain: 0.09, attack: 0.003, delay: d + 0.01 });
      });
      // rising crystalline tone
      [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => {
        this._tone({ type: 'sine', freq: f * 0.5, freqEnd: f, dur: 2.4, gain: 0.05, attack: 1.4, delay: 0.5 + i * 0.15 });
      });
      [2637, 3951].forEach((f, i) => {
        this._tone({ type: 'sine', freq: f, dur: 1.2, gain: 0.03, attack: 0.05, delay: 2.0 + i * 0.1 });
      });
      this._tone({ type: 'sine', freq: 68, freqEnd: 34, dur: 0.5, gain: 0.2, attack: 0.004, delay: 1.95 });
    } catch (err) { console.error('Shard wake sound error:', err); }
  },

  // The Pact screen opens (game paused): a time-stop whoosh, then a low drone while it stays open.
  // Music is ducked in _controlTick, every other SFX on the duck bus.
  _onPactOpen() {
    this._pactEnd(true);
    if (!this._getOrInitAudioContext()) return;
    this._pactBegin();
    try {
      this._pactVoice(() => {
        // reverse swell that peaks as time freezes
        this._noise({ dur: 0.5, gain: 0.16, attack: 0.42, filterType: 'bandpass', freqStart: 250, freqEnd: 4200, Q: 1.2 });
        this._tone({ type: 'sawtooth', freq: 520, freqEnd: 60, dur: 0.75, gain: 0.07, attack: 0.02, filter: { type: 'lowpass', freq: 700, Q: 1 } });
        // the freeze: a deep thunk and a glassy tick
        this._tone({ type: 'sine', freq: 82, freqEnd: 36, dur: 0.55, gain: 0.22, attack: 0.004, delay: 0.46 });
        this._tone({ type: 'sine', freq: 2093, dur: 0.7, gain: 0.07, attack: 0.002, delay: 0.46 });
        this._tone({ type: 'sine', freq: 3136, dur: 0.5, gain: 0.035, attack: 0.002, delay: 0.47 });
      });
      this._startPactDrone();
    } catch (err) { console.error('Pact open sound error:', err); }
  },

  // The screen closes: stop the drone, release breath (a little weight if something was sealed).
  _onPactClose(e) {
    this._pactEnd();
    if (!this._canPlaySound('pactClose', 1, 300, true)) return;
    try {
      const sealed = !!(e && e.sealed), haste = !!(e && e.haste);
      this._pactVoice(() => {
        this._noise({ dur: 0.9, gain: sealed ? 0.1 : 0.07, attack: 0.08, filterType: 'bandpass', freqStart: 1800, freqEnd: 260, Q: 0.9 });
        this._tone({ type: 'sine', freq: 330, freqEnd: 165, dur: 0.7, gain: 0.05, attack: 0.02 });
        if (sealed) {
          this._tone({ type: 'sine', freq: 90, freqEnd: 40, dur: 0.5, gain: 0.2, attack: 0.004 });
          this._tone({ type: 'sine', freq: 1046.5, dur: 0.6, gain: 0.04, attack: 0.004, delay: 0.05 });
        }
        if (haste) {
          [1568, 2349, 3136].forEach((f, i) => this._tone({ type: 'sine', freq: f, dur: 0.5, gain: 0.03, attack: 0.004, delay: 0.12 + i * 0.06 }));
        }
      });
    } catch (err) { console.error('Pact close sound error:', err); }
  },

  // Duck all non-pact SFX while the screen is open.
  _pactBegin() {
    this.pactActive = true;
    this.pactAt = this._now();
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(0.06, this.pactAt, 0.05);
  },

  // Stop the drone and lift the duck. Idempotent; called on pactClose, runStart, runEnd and by the safety check in _pactTick.
  _pactEnd(quiet) {
    const was = this.pactActive || this.pactDrone;
    this.pactActive = false;
    if (!this.ctx || !was) return;
    const now = this._now();
    if (this.sfxBus) { this.sfxBus.gain.cancelScheduledValues(now); this.sfxBus.gain.setTargetAtTime(1, now, quiet ? 0.02 : 0.25); }
    const d = this.pactDrone;
    if (!d) return;
    this.pactDrone = null;
    try {
      d.out.gain.cancelScheduledValues(now);
      d.out.gain.setTargetAtTime(0.0001, now, 0.12);
      for (const o of d.oscs) { try { o.stop(now + 0.9); } catch { /* stopped */ } }
      setTimeout(() => { for (const n of d.nodes) { try { n.disconnect(); } catch { /* gone */ } } }, 1300);
    } catch (err) { console.error('Pact drone teardown error:', err); }
  },

  // The drone: a low fifth (A1 + E2) with a detuned, breathing filtered saw and a faint glassy partial. Not tied to game time.
  _startPactDrone() {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain || this.pactDrone) return;
    const now = this._now();
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const a = osc('sine', 55), b = osc('sawtooth', 55.35), c = osc('sine', 82.4), d = osc('triangle', 110.5), e = osc('sine', 1318.5);
    const lfo = osc('sine', 0.13), lfo2 = osc('sine', 0.09);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 1.5;
    const ga = ctx.createGain(), gb = ctx.createGain(), gc = ctx.createGain(), gd = ctx.createGain(), ge = ctx.createGain();
    const lg = ctx.createGain(), lg2 = ctx.createGain(), out = ctx.createGain();
    ga.gain.value = 0.5; gb.gain.value = 0.08; gc.gain.value = 0.22; gd.gain.value = 0.1; ge.gain.value = 0.008;
    lg.gain.value = 70; lg2.gain.value = 0.006;
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(0.11, now + 1.4);
    a.connect(ga); b.connect(gb); d.connect(gd); gb.connect(lp); gd.connect(lp); c.connect(gc); e.connect(ge);
    ga.connect(out); lp.connect(out); gc.connect(out); ge.connect(out); out.connect(this.masterGain);
    lfo.connect(lg); lg.connect(lp.frequency);          // the filter breathes
    lfo2.connect(lg2); lg2.connect(ge.gain);            // the glass partial swells now and then
    const oscs = [a, b, c, d, e, lfo, lfo2];
    for (const o of oscs) o.start(now);
    this.pactDrone = { out, oscs, t: now, nodes: [...oscs, lp, ga, gb, gc, gd, ge, lg, lg2, out] };
  },

  // Called every music control tick: if the game left the pact state without a pactClose (quit, run end), release.
  _pactTick(now) {
    if (!this.pactActive && !this.pactDrone) return;
    if (this.game.state !== 'pact' && now - (this.pactAt || 0) > 0.5) this._pactEnd();
  },

  // One sound per newly sealed stake. Several arrive in the same frame (Echo + Wrath 1 + Wrath 2):
  // they are queued back to back (up to ~1.6 s) instead of dropped, and routed past the pact duck.
  _onObeliskArmed(e) {
    if (!this._canPlaySound('obeliskArmed', 6, 400, true)) return;
    const type = e && e.type;
    const now = this._now();
    const d0 = Math.min(1.6, Math.max(0, (this._armedNext || 0) - now));
    this._armedNext = now + d0 + (type === 'wrath' ? 0.45 : 0.55);
    const T = (o) => this._tone({ ...o, delay: (o.delay || 0) + d0 });
    const N = (o) => this._noise({ ...o, delay: (o.delay || 0) + d0 });
    try {
      this._pactVoice(() => {
        if (type === 'haste') {
          // glass chime: three quick rising pings, then an inharmonic ring
          [1760, 2349, 3136].forEach((f, i) => T({ type: 'sine', freq: f, dur: 0.25, gain: 0.06, attack: 0.002, delay: i * 0.07 }));
          [[1, 0.1, 1.2], [2.32, 0.05, 0.8], [4.25, 0.025, 0.45]].forEach(([r, g, dur]) => {
            T({ type: 'sine', freq: 1568 * r, dur, gain: g, attack: 0.002, delay: 0.22 });
          });
          N({ dur: 0.12, gain: 0.05, attack: 0.002, filterType: 'highpass', freqStart: 6000, delay: 0.22 });
        } else if (type === 'echo') {
          // doubled bell: the same strike twice, the second detuned and late
          [[0, 880, 0.12], [0.16, 886.6, 0.08], [0.32, 880, 0.04]].forEach(([d, f, g]) => {
            T({ type: 'sine', freq: f, dur: 1.6, gain: g, attack: 0.003, delay: d });
            T({ type: 'sine', freq: f * 2.76, dur: 0.6, gain: g * 0.3, attack: 0.003, delay: d });
          });
          T({ type: 'sine', freq: 440, dur: 1.8, gain: 0.07, attack: 0.01 });
        } else {
          // wrath: ember roar, bigger and lower with every heat step
          const k = Math.max(1, Math.min(3, (e && e.heat) || 1));
          const s = 0.8 + (k - 1) * 0.2;
          T({ type: 'sawtooth', freq: 74 - (k - 1) * 8, freqEnd: 46 - (k - 1) * 5, dur: 1.1 + k * 0.15, gain: 0.14 * s, attack: 0.05, filter: { type: 'lowpass', freq: 380 + k * 60, Q: 2 } });
          N({ dur: 1.0 + k * 0.15, gain: 0.16 * s, attack: 0.08, filterType: 'bandpass', freqStart: 320, freqEnd: 700 + k * 250, Q: 1.5 });
          for (let i = 0; i < 2 + k * 2; i++) {
            N({ dur: 0.03, gain: 0.08, attack: 0.002, filterType: 'highpass', freqStart: 2200, delay: 0.1 + Math.random() * 0.9 });
          }
          T({ type: 'sine', freq: 70 - (k - 1) * 8, freqEnd: 32, dur: 0.5, gain: 0.2 * s, attack: 0.004 });
          if (k >= 2) T({ type: 'sine', freq: 46, freqEnd: 30, dur: 1.4, gain: 0.12, attack: 0.3 });
          if (k >= 3) T({ type: 'sawtooth', freq: 148, freqEnd: 92, dur: 0.9, gain: 0.05, attack: 0.1, delay: 0.1, filter: { type: 'lowpass', freq: 700, Q: 2 } });
        }
      });
    } catch (err) { console.error('Obelisk armed sound error:', err); }
  },

  // The Rift answers a seal: a pair of war-horn blasts over a swelling roar and a rolling drum.
  _onRiftAnswer(e) {
    if (!this._canPlaySound('riftAnswer', 1, 800, true)) return;
    try {
      const k = Math.min(1, Math.max(0.3, ((e && e.foes) || 8) / 24));
      const sw = Math.max(1.2, Math.min(3, (e && e.seconds) || 2));
      const horn = (f, delay, dur, g) => {
        [[1, 1], [1.5, 0.55], [2, 0.35]].forEach(([r, w]) => {
          this._tone({ type: 'sawtooth', freq: f * r, freqEnd: f * r * 0.97, dur, gain: 0.07 * g * w, attack: 0.25, delay, filter: { type: 'lowpass', freq: 750, Q: 1.4 } });
        });
        this._tone({ type: 'sine', freq: f, dur, gain: 0.1 * g, attack: 0.2, delay });
      };
      horn(110, 0, 1.5, 1);
      horn(146.8, 1.25, 1.9, 1.15);
      this._noise({ dur: sw + 0.8, gain: 0.16 + 0.08 * k, attack: sw * 0.7, filterType: 'bandpass', freqStart: 180, freqEnd: 900, Q: 1.1 });
      this._noise({ dur: sw + 0.4, gain: 0.1, attack: sw * 0.6, filterType: 'lowpass', freqStart: 400, freqEnd: 130 });
      for (let i = 0; i < 6; i++) {   // rolling war drum
        this._tone({ type: 'sine', freq: 95, freqEnd: 38, dur: 0.3, gain: 0.2, attack: 0.004, delay: 0.15 + i * 0.22 });
      }
      for (let i = 0; i < 3; i++) {   // the horde's cry
        this._noise({ dur: 0.45, gain: 0.07 * k, attack: 0.08, filterType: 'bandpass', freqStart: 650 + i * 150, freqEnd: 950 + i * 150, Q: 4, delay: 0.5 + i * 0.35 });
      }
    } catch (err) { console.error('Rift answer sound error:', err); }
  },

  // The shard ascends into its light column (encounter start): a rushing upward tone that ends in a bright sparkle.
  _onShardAscend() {
    if (!this._canPlaySound('shardAscend', 1, 600, true)) return;
    try {
      this._tone({ type: 'sine', freq: 70, freqEnd: 36, dur: 0.5, gain: 0.24, attack: 0.004 });
      this._noise({ dur: 2.4, gain: 0.2, attack: 1.6, filterType: 'bandpass', freqStart: 180, freqEnd: 7000, Q: 1.3 });
      this._tone({ type: 'sine', freq: 120, freqEnd: 1900, dur: 2.4, gain: 0.16, attack: 1.7 });
      this._tone({ type: 'sawtooth', freq: 150, freqEnd: 1200, dur: 2.4, gain: 0.05, attack: 1.6, filter: { type: 'lowpass', freq: 2400, Q: 1 } });
      [1318.5, 1976, 2637, 3951].forEach((f, i) => {
        this._tone({ type: 'sine', freq: f * 0.4, freqEnd: f, dur: 2.2, gain: 0.035, attack: 1.5, delay: i * 0.08 });
      });
      this._noise({ dur: 0.5, gain: 0.1, attack: 0.01, filterType: 'highpass', freqStart: 5000, delay: 2.1 });
      this._tone({ type: 'sine', freq: 3136, dur: 0.9, gain: 0.05, attack: 0.003, delay: 2.1 });
    } catch (err) { console.error('Shard ascend sound error:', err); }
  },
};
