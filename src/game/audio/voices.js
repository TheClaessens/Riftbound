// =====================================================================================
//  Music voices for the boss scores (design/research/12-boss-scores.md section 2). Mixed into Audio.prototype.
//  Everything is oscillators + noise + biquads. Every method takes an ABSOLUTE `when` (AudioContext time).
//  Voice accounting: every source is counted (`musicVoices` live, or `vlog` intervals when `this.offline`);
//  prio 0 = essential (+4 over the cap), 1 = normal, 2 = ornament (cap - 6, dropped entirely in lite mode).
// =====================================================================================

// Csound formant table: [freq Hz, linear amp, bandwidth Hz]
export const VOWELS = {
  a: [[800, 1, 80], [1150, 0.5, 90], [2900, 0.12, 120]],     // soprano a
  A: [[600, 1, 60], [1040, 0.45, 70], [2250, 0.35, 110]],    // bass a
  o: [[400, 1, 70], [800, 0.32, 80], [2600, 0.25, 100]],     // tenor o
  u: [[350, 1, 40], [600, 0.1, 60], [2700, 0.14, 100]],      // tenor u
};

export const VOICES = {
  // ---- voice accounting ----------------------------------------------------------------
  _vActive(when) {
    if (!this.offline) return this.musicVoices;
    const w = when == null ? this.clock : when;
    let c = 0;
    const v = this.vlog;
    for (let i = 0; i < v.length; i++) if (v[i][0] <= w && v[i][1] > w) c++;
    return c;
  },

  _mRoom(n = 1, prio = 1, when) {
    if (prio === 2 && this.lite) { this.voiceDrops++; return false; }
    const cap = this.voiceCap + (prio === 0 ? 4 : prio === 2 ? -6 : 0);
    const act = this._vActive(when);
    if (act + n > cap) { this.voiceDrops++; return false; }
    if (act + n > this.voiceHigh) this.voiceHigh = act + n;
    return true;
  },

  // Register n sources. Live: counter + teardown of the shared chain when the first source ends.
  // Offline: record [start, stop) intervals (the 'ended' event never fires before startRendering()).
  _vReg(oscs, when, stop, chain) {
    if (this.offline) {
      for (let i = 0; i < oscs.length; i++) this.vlog.push([when, stop]);
      return;
    }
    this.musicVoices += oscs.length;
    oscs.forEach((o, i) => o.addEventListener('ended', () => {
      this.musicVoices--;
      try { o.disconnect(); } catch { /* gone */ }
      if (i === 0 && chain) for (const n of chain) { try { n.disconnect(); } catch { /* gone */ } }
    }));
  },

  // Amp envelope. sus == null: attack then exponential decay (act music behaviour).
  // sus = 0..1: attack, settle to gain*sus, hold, release over the last `rel` s. Returns the stop offset.
  _mEnv(g, when, dur, gain, attack, sus = null, rel = 0.12) {
    g.setValueAtTime(0.0001, when);
    g.linearRampToValueAtTime(gain, when + attack);
    if (sus == null) {
      g.exponentialRampToValueAtTime(0.0001, when + dur);
      return dur + 0.05;
    }
    g.setTargetAtTime(Math.max(0.0002, gain * sus), when + attack, 0.12);
    g.setTargetAtTime(0.0001, when + Math.max(attack, dur - rel), rel / 3);
    return dur + rel * 1.4;
  },

  // ---- brass: detuned saws -> "blat" lowpass (opens after the attack, settles) with a pitch scoop ----
  _mBrass({ freq, dur, gain = 0.1, attack = 0.05, when, dest, n = 3, spread = 10, open = 4.5, settle = 2,
            Q = 2.5, sus = 0.8, rel = 0.12, slide = 0.35, prio = 1, floor = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !dest || !this._mRoom(n, prio, when)) return;
    try {
      const env = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = Q;
      const hi = Math.min(9000, Math.max(freq * open, floor)), lo = Math.max(freq * settle, floor * 0.55);
      lp.frequency.setValueAtTime(Math.max(60, Math.min(hi, freq * 1.2 + floor * 0.3)), when);
      lp.frequency.linearRampToValueAtTime(hi, when + attack * 1.6);
      lp.frequency.setTargetAtTime(lo, when + attack * 1.6, 0.18);
      const stop = this._mEnv(env.gain, when, dur, gain / Math.sqrt(n), attack, sus, rel);
      env.connect(lp); lp.connect(dest);
      const oscs = [];
      for (let i = 0; i < n; i++) {
        const c = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq, when);
        o.detune.setValueAtTime(c - slide * 100, when);                  // scoop up into pitch
        o.detune.linearRampToValueAtTime(c, when + attack * 1.5);
        o.connect(env); o.start(when); o.stop(when + stop); oscs.push(o);
      }
      this._vReg(oscs, when, when + stop, [env, lp]);
    } catch (err) { console.error('Brass error:', err); }
  },

  // ---- choir: ONE shared formant bank (3 bandpass filters) serves every singer ----
  _makeBank(dest, vowel = 'a') {
    const ctx = this.ctx;
    const b = { in: ctx.createGain(), out: ctx.createGain(), f: [], g: [], nodes: [], lfo: null };
    VOWELS[vowel].forEach(([fr, amp, bw]) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr;
      f.Q.value = Math.max(2, fr / (bw * 2));
      const g = ctx.createGain(); g.gain.value = amp;
      b.in.connect(f); f.connect(g); g.connect(b.out);
      b.f.push(f); b.g.push(g); b.nodes.push(f, g);
    });
    b.out.gain.value = 2.2;                                   // band-pass banks are quiet: make-up
    b.out.connect(dest);
    b.vib = ctx.createGain(); b.vib.gain.value = 14;          // cents, shared vibrato
    b.lfo = ctx.createOscillator(); b.lfo.frequency.value = 5.2; b.lfo.connect(b.vib); b.lfo.start();
    b.nodes.push(b.in, b.out, b.vib);
    return b;
  },

  _setVowel(b, vowel, t, tc = 0.25) {                          // "oo" -> "aa" morph, safe at any time
    if (!b || !VOWELS[vowel]) return;
    VOWELS[vowel].forEach(([fr, amp, bw], i) => {
      b.f[i].frequency.setTargetAtTime(fr, t, tc);
      b.f[i].Q.setTargetAtTime(Math.max(2, fr / (bw * 2)), t, tc);
      b.g[i].gain.setTargetAtTime(amp, t, tc);
    });
  },

  _disposeBank(b) {
    if (!b) return;
    try { b.lfo.stop(); } catch { /* not started / stopped */ }
    try { b.lfo.disconnect(); } catch { /* gone */ }
    for (const n of b.nodes) { try { n.disconnect(); } catch { /* gone */ } }
  },

  _mChoir({ freq, dur, gain = 0.07, attack = 0.3, rel = 0.45, when, bank, voices = 2, spread = 8, detune = 0, prio = 1 }) {
    const ctx = this.ctx;
    if (!ctx || !bank || !this._mRoom(voices, prio, when)) return;
    try {
      const env = ctx.createGain();
      const stop = this._mEnv(env.gain, when, dur, gain / Math.sqrt(voices), attack, 0.85, rel);
      env.connect(bank.in);
      const oscs = [];
      for (let i = 0; i < voices; i++) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, when);
        o.detune.value = detune + (voices === 1 ? 0 : (i / (voices - 1) - 0.5) * 2 * spread);
        o.connect(env); bank.vib.connect(o.detune);
        if (!this.offline) o.addEventListener('ended', () => { try { bank.vib.disconnect(o.detune); } catch { /* gone */ } });
        o.start(when); o.stop(when + stop); oscs.push(o);
      }
      this._vReg(oscs, when, when + stop, [env]);
    } catch (err) { console.error('Choir error:', err); }
  },

  // ---- organ: ONE oscillator with drawbar harmonics 1,2,3,4,6,8 (16' fundamental) ----
  _organWave() {
    if (this._ow) return this._ow;
    const lv = { 1: 8, 2: 8, 3: 6, 4: 5, 6: 3, 8: 2 }, re = new Float32Array(17), im = new Float32Array(17);
    for (const h in lv) im[h] = lv[h] / 8;
    return (this._ow = this.ctx.createPeriodicWave(re, im));
  },

  _mOrgan({ freq, dur, gain = 0.07, attack = 0.04, rel = 0.25, when, dest, lp = 3200, prio = 1 }) {
    const ctx = this.ctx;
    if (!ctx || !dest || !this._mRoom(1, prio, when)) return;
    try {
      const o = ctx.createOscillator(), env = ctx.createGain(), f = ctx.createBiquadFilter();
      o.setPeriodicWave(this._organWave()); o.frequency.setValueAtTime(freq / 2, when);   // harmonic 2 = 8'
      f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5;
      const stop = this._mEnv(env.gain, when, dur, gain, attack, 0.9, rel);
      o.connect(env); env.connect(f); f.connect(dest); o.start(when); o.stop(when + stop);
      this._vReg([o], when, when + stop, [env, f]);
    } catch (err) { console.error('Organ error:', err); }
  },

  // ---- drums ----
  // kinds: big (3 voices), soft (2), small (2), timp (3), roll (1), rim (1)
  _mTaiko({ when, dest, f0 = 80, vel = 1, kind = 'big', sustain = 1 }) {
    if (kind === 'rim') {
      return this._mNoise({ dur: 0.05, gain: 0.1 * vel, attack: 0.001, filterType: 'bandpass',
        freqStart: 1900, Q: 2.5, when, dest, prio: 1 });
    }
    if (kind === 'roll') {
      return this._mTone({ wave: 'sine', freq: f0 * 1.9, freqEnd: f0 * 1.1, sweep: 0.05, dur: 0.2 * sustain,
        gain: 0.38 * vel, attack: 0.002, when, dest, prio: 1 });
    }
    if (kind === 'timp') {
      this._mTone({ wave: 'sine', freq: f0 * 1.3, freqEnd: f0, sweep: 0.12, dur: 1.0 * sustain,
        gain: 0.5 * vel, attack: 0.003, when, dest, prio: 0 });
      if (sustain >= 0.6) this._mTone({ wave: 'sine', freq: f0 * 1.5, dur: 0.45 * sustain, gain: 0.14 * vel, attack: 0.003, when, dest, prio: 1 });
      this._mNoise({ dur: 0.05, gain: 0.07 * vel, attack: 0.001, filterType: 'highpass', freqStart: 1500, when, dest, prio: 2 });
      return;
    }
    const big = kind === 'big';
    this._mTone({ wave: 'sine', freq: f0 * 2.6, freqEnd: f0, sweep: 0.07, dur: (big ? 0.5 : kind === 'soft' ? 0.3 : 0.2) * sustain,
      gain: (big ? 0.55 : 0.4) * vel, attack: 0.002, when, dest, prio: big ? 0 : 1 });
    if (big) this._mTone({ wave: 'sine', freq: f0 * 2.85, freqEnd: f0 * 1.5, sweep: 0.05, dur: 0.2,
      gain: 0.15 * vel, attack: 0.002, when, dest, prio: 1 });
    this._mNoise({ dur: big ? 0.07 : 0.04, gain: (big ? 0.18 : 0.1) * vel, attack: 0.001,
      filterType: 'highpass', freqStart: big ? 1800 : 2600, when, dest, prio: big ? 1 : 2 });
  },

  _mSnare({ when, dest, vel = 1 }) {
    this._mNoise({ dur: 0.13, gain: 0.15 * vel, attack: 0.001, filterType: 'bandpass', freqStart: 1700, Q: 0.8, when, dest, prio: vel > 0.5 ? 0 : 1 });
    this._mTone({ wave: 'triangle', freq: 190, freqEnd: 140, dur: 0.09, gain: 0.1 * vel, attack: 0.001, when, dest, prio: 1 });
  },

  // ---- strings ostinato (spiccato saw pair, 2 voices) ----
  _mStr({ freq, dur, gain = 0.09, when, dest, cut = 1100, prio = 1, n = 2 }) {
    for (const d of n === 1 ? [0] : [-8, 8]) this._mTone({ wave: 'sawtooth', freq, dur, gain: gain * (n === 1 ? 1 : 0.7), attack: 0.012,
      when, dest, detune: d, filter: { type: 'lowpass', freq: cut, Q: 0.7 }, prio });
  },

  // single-oscillator ping (1 voice): the cheap shimmer for whole-tone cascades
  _mPing({ freq, dur = 0.8, gain = 0.05, when, dest, prio = 2 }) {
    this._mTone({ wave: 'sine', freq, dur, gain, attack: 0.003, when, dest, prio });
  },

  // ---- FM crystal bell: modulator ratio 1.4 (5:7); index decays faster than the amp ----
  _mBell({ freq, dur = 2.2, gain = 0.07, ratio = 1.4, index = 5, when, dest, prio = 2 }) {
    const ctx = this.ctx;
    if (!ctx || !dest || !this._mRoom(2, prio, when)) return;
    try {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), env = ctx.createGain();
      car.frequency.setValueAtTime(freq, when); mod.frequency.setValueAtTime(freq * ratio, when);
      mg.gain.setValueAtTime(freq * index, when);
      mg.gain.exponentialRampToValueAtTime(freq * 0.05, when + dur * 0.6);
      env.gain.setValueAtTime(0.0001, when); env.gain.linearRampToValueAtTime(gain, when + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      mod.connect(mg); mg.connect(car.frequency); car.connect(env); env.connect(dest);
      car.start(when); mod.start(when); car.stop(when + dur + 0.05); mod.stop(when + dur + 0.05);
      this._vReg([car, mod], when, when + dur + 0.05, [env, mg]);
    } catch (err) { console.error('Bell error:', err); }
  },

  // ---- impact / sub drop: fast-sweep sine + lowpassed noise boom + a 2x "punch" for small speakers ----
  _mImpact({ when, dest, f0 = 90, f1 = 34, dur = 1.6, gain = 0.5, noise = 0.25 }) {
    this._mTone({ wave: 'sine', freq: f0, freqEnd: f1, sweep: dur * 0.8, dur, gain, attack: 0.004, when, dest, prio: 0 });
    this._mNoise({ dur: dur * 0.55, gain: noise, attack: 0.002, filterType: 'lowpass', freqStart: 2400, freqEnd: 90, Q: 0.8, when, dest, prio: 0 });
    this._mTone({ wave: 'triangle', freq: f0 * 2, freqEnd: f1 * 2, sweep: 0.25, dur: 0.35, gain: gain * 0.35, attack: 0.002, when, dest, prio: 1 });
  },

  // ---- riser: swell that peaks at its end then cuts. Returns the group gain (ramp it to 0 to cancel). ----
  _mRiser({ when, dur, dest, f0 = 110, f1 = 440, gain = 0.12, nz = 1 }) {
    const ctx = this.ctx;
    if (!ctx || !dest) return null;
    dur = Math.max(0.15, dur);
    const rg = ctx.createGain();
    rg.connect(dest);
    for (const d of [-12, 12]) this._mTone({ wave: 'sawtooth', freq: f0, freqEnd: f1, dur, gain, attack: dur * 0.96,
      when, dest: rg, detune: d, filter: { type: 'lowpass', freq: 1800, Q: 1 }, prio: 1 });
    this._mNoise({ dur, gain: gain * 1.4 * nz, attack: dur * 0.96, filterType: 'bandpass', freqStart: 300, freqEnd: 5200, Q: 1.2, when, dest: rg, prio: 1 });
    if (!this.offline && typeof setTimeout === 'function') {
      const ms = Math.max(0, (when - this._now() + dur + 0.4)) * 1000;
      setTimeout(() => { try { rg.disconnect(); } catch { /* gone */ } }, ms);
    }
    return rg;
  },
};
