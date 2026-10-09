// =====================================================================================
//  v5 raid SFX (obelisks, arena wall, poise, stagger, break checks). Mixed into Audio.prototype.
//  They use the same helpers as the rest of the SFX (_tone / _noise -> masterGain) and are rate limited.
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

  // ---------------------------------------------------------------- obelisks
  _onObelisksRisen() {
    if (!this._canPlaySound('obeliskRise', 1, 600)) return;
    try {
      // low stone grind
      this._noise({ dur: 2.0, gain: 0.2, attack: 0.5, filterType: 'bandpass', freqStart: 110, freqEnd: 230, Q: 3 });
      this._noise({ dur: 1.6, gain: 0.1, attack: 0.3, filterType: 'lowpass', freqStart: 500, freqEnd: 140 });
      this._tone({ type: 'sine', freq: 52, freqEnd: 70, dur: 2.0, gain: 0.2, attack: 0.5 });
      for (let i = 0; i < 4; i++) {
        this._noise({ dur: 0.06, gain: 0.06, attack: 0.003, filterType: 'bandpass', freqStart: 300 + Math.random() * 600, Q: 3, delay: 0.2 + i * 0.4 + Math.random() * 0.12 });
      }
      // shimmer as the glyphs light
      [1318.5, 1760, 2093, 2637].forEach((f, i) => {
        this._tone({ type: 'sine', freq: f, dur: 1.4, gain: 0.04, attack: 0.25, delay: 0.9 + i * 0.12 });
      });
      this._tone({ type: 'sine', freq: 68, freqEnd: 34, dur: 0.5, gain: 0.2, attack: 0.004, delay: 1.9 });
    } catch (err) { console.error('Obelisks risen sound error:', err); }
  },

  // Channel hum: one persistent voice pair that rises with progress; faded out when the events stop (see _humTick).
  _onObeliskChannel(e) {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;
    try {
      const p = Math.max(0, Math.min(1, e && e.progress != null ? e.progress : 0));
      const now = this._now();
      const f = 82 * Math.pow(2, p * 1.6);
      let h = this.hum;
      if (!h) {
        const a = ctx.createOscillator(); a.type = 'sine';
        const b = ctx.createOscillator(); b.type = 'sawtooth';
        const c = ctx.createOscillator(); c.type = 'sine';
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 2;
        const ga = ctx.createGain(), gb = ctx.createGain(), gc = ctx.createGain(), out = ctx.createGain();
        ga.gain.value = 0.5; gb.gain.value = 0.1; gc.gain.value = 0;
        out.gain.setValueAtTime(0.0001, now); out.gain.linearRampToValueAtTime(0.1, now + 0.25);
        a.connect(ga); b.connect(gb); gb.connect(lp); c.connect(gc);
        ga.connect(out); lp.connect(out); gc.connect(out); out.connect(this.masterGain);
        a.frequency.value = f; b.frequency.value = f * 1.004; c.frequency.value = f * 6;
        a.start(now); b.start(now); c.start(now);
        h = this.hum = { a, b, c, lp, gc, out, nodes: [a, b, c, lp, ga, gb, gc, out] };
      }
      h.at = now;
      h.a.frequency.setTargetAtTime(f, now, 0.08);
      h.b.frequency.setTargetAtTime(f * 1.004, now, 0.08);
      h.c.frequency.setTargetAtTime(f * 6, now, 0.08);
      h.lp.frequency.setTargetAtTime(300 + p * 900, now, 0.1);
      h.gc.gain.setTargetAtTime(0.012 + p * 0.05, now, 0.1);            // shimmer partial grows with progress
      h.out.gain.setTargetAtTime(0.08 + p * 0.06, now, 0.1);
    } catch (err) { console.error('Obelisk channel sound error:', err); }
  },

  _humTick(now) {
    const h = this.hum;
    if (!h || now - h.at < 0.4) return;
    this.hum = null;
    try {
      h.out.gain.cancelScheduledValues(now);
      h.out.gain.setTargetAtTime(0.0001, now, 0.05);
      for (const n of [h.a, h.b, h.c]) { try { n.stop(now + 0.4); } catch { /* stopped */ } }
      setTimeout(() => { for (const n of h.nodes) { try { n.disconnect(); } catch { /* gone */ } } }, 600);
    } catch (err) { console.error('Hum teardown error:', err); }
  },

  _onObeliskArmed(e) {
    if (!this._canPlaySound('obeliskArmed', 1, 250)) return;
    const type = e && e.type;
    try {
      if (type === 'haste') {
        // ticking clock rush, then a bright bell
        let t = 0;
        for (let i = 0; i < 8; i++) {
          this._tone({ type: 'triangle', freq: i % 2 ? 1500 : 1900, freqEnd: 900, dur: 0.035, gain: 0.07, attack: 0.002, delay: t });
          t += Math.max(0.05, 0.19 - i * 0.02);
        }
        this._tone({ type: 'sine', freq: 1568, dur: 1.0, gain: 0.1, attack: 0.003, delay: t });
        this._tone({ type: 'sine', freq: 2349, dur: 0.8, gain: 0.05, attack: 0.003, delay: t });
      } else if (type === 'echo') {
        // doubled bell: the same strike twice, the second detuned and late
        [[0, 880, 0.12], [0.16, 886.6, 0.08], [0.32, 880, 0.04]].forEach(([d, f, g]) => {
          this._tone({ type: 'sine', freq: f, dur: 1.6, gain: g, attack: 0.003, delay: d });
          this._tone({ type: 'sine', freq: f * 2.76, dur: 0.6, gain: g * 0.3, attack: 0.003, delay: d });
        });
        this._tone({ type: 'sine', freq: 440, dur: 1.8, gain: 0.07, attack: 0.01 });
      } else {
        // wrath: ember roar
        this._tone({ type: 'sawtooth', freq: 74, freqEnd: 46, dur: 1.2, gain: 0.14, attack: 0.05, filter: { type: 'lowpass', freq: 380, Q: 2 } });
        this._noise({ dur: 1.1, gain: 0.16, attack: 0.08, filterType: 'bandpass', freqStart: 320, freqEnd: 900, Q: 1.5 });
        for (let i = 0; i < 4; i++) {
          this._noise({ dur: 0.03, gain: 0.08, attack: 0.002, filterType: 'highpass', freqStart: 2200, delay: 0.1 + Math.random() * 0.9 });
        }
        this._tone({ type: 'sine', freq: 70, freqEnd: 34, dur: 0.5, gain: 0.2, attack: 0.004 });
      }
    } catch (err) { console.error('Obelisk armed sound error:', err); }
  },

  _onObeliskCollapse() {
    if (!this._canPlaySound('obeliskCollapse', 1, 600)) return;
    try {
      this._noise({ dur: 1.8, gain: 0.22, attack: 0.02, filterType: 'lowpass', freqStart: 1600, freqEnd: 90, Q: 1 });
      this._tone({ type: 'sine', freq: 92, freqEnd: 28, dur: 1.5, gain: 0.3, attack: 0.006 });
      for (let i = 0; i < 5; i++) {
        this._noise({ dur: 0.1, gain: 0.08, attack: 0.003, filterType: 'bandpass', freqStart: 240 + Math.random() * 700, Q: 2.5, delay: 0.1 + i * 0.18 + Math.random() * 0.08 });
      }
      [1760, 2349].forEach((f, i) => this._tone({ type: 'sine', freq: f, freqEnd: f * 0.5, dur: 0.7, gain: 0.04, attack: 0.003, delay: i * 0.05 }));
    } catch (err) { console.error('Obelisk collapse sound error:', err); }
  },
};
