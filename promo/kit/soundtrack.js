// =====================================================================================
//  Offline promo soundtrack (OfflineAudioContext): a small synth kit + an arranger that
//  turns a cue sheet into a beat-locked track. No samples, no network.
//
//  const buf = await renderSoundtrack({
//    duration: 15, bpm: 120,
//    intro:  { end: 1.5 },                         // slam at 0.08, pad, hats creep in, whoosh into the groove
//    groove: { from: 1.5, to: 13, progression: ['Am', 'F', 'C', 'G'], barBeats: 4, busyFrom: 9.5 },
//    cuts:   [{ t: 1.5, kind: 'major' }, { t: 4.0, kind: 'minor' }],   // crash+boom / stab
//    hits:   [{ t: 9.95, kind: 'chime' }, { t: 11.5, kind: 'boom' }],  // extra accents
//    slowmo: [{ t: 8.633, until: 9.0, release: 9.45 }],               // lowpass duck + impact + chime
//    outro:  { at: 13, riser: 1.0, roll: 0.5, chord: 'Am', sparkle: 13.78 },
//  });
//  Or build your own with createKit(ctx) voices (kick, clap, hat, bass, pad, stab, boom, crash,
//  whoosh, riser, chime) and finish(ctx) for normalisation.
// =====================================================================================
const SR = 48000;

export const CHORDS = {
  Am: [220, 261.63, 329.63], F: [174.61, 220, 261.63], C: [261.63, 329.63, 392.0], G: [196.0, 246.94, 293.66],
  Dm: [146.83, 174.61, 220], Em: [164.81, 196.0, 246.94], E: [164.81, 207.65, 246.94], D: [146.83, 185.0, 220],
  Bb: [233.08, 293.66, 349.23],
};
// Bass root (low octave) per chord name: first letter + accidental.
const ROOT = { A: 55, B: 61.74, Bb: 58.27, C: 65.41, D: 73.42, E: 82.41, F: 43.65, G: 49.0 };
const rootOf = (name) => ROOT[name.replace(/m$/, '')] ?? ROOT[name[0]];

export function createKit(ctx, { verbAmount = 0.32 } = {}) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
  const master = ctx.createGain(); master.gain.value = 0.9;
  comp.connect(master).connect(ctx.destination);
  const musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 20000; musicLP.Q.value = 0.9;
  const music = ctx.createGain();
  music.connect(musicLP).connect(comp);
  const fx = ctx.createGain(); fx.connect(comp);
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 2.4, 2.8);
  const verbOut = ctx.createGain(); verbOut.gain.value = verbAmount;
  verb.connect(verbOut).connect(comp);

  const noise = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = noise.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  const env = (g, t, a, peak, d, end = 0.0001) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  };
  const src = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.start(t, Math.random()); s.stop(t + dur); return s; };
  const send = (node, amt) => { const g = ctx.createGain(); g.gain.value = amt; node.connect(g).connect(verb); };
  const osc = (type, f, t, stop) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(stop); return o; };

  const k = {
    ctx, master, music, musicLP, fx, verb,
    kick(t, v = 1, bus = music) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      env(g, t, 0.002, v, 0.38); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.45);
      const hp = ctx.createBiquadFilter(), ng = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 3000; env(ng, t, 0.001, 0.25 * v, 0.015);
      src(t, 0.02).connect(hp).connect(ng).connect(bus);
    },
    clap(t, v = 0.55, bus = music) {
      for (let i = 0; i < 3; i++) {
        const bp = ctx.createBiquadFilter(), g = ctx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
        env(g, t + i * 0.011, 0.002, v * (i === 2 ? 1 : 0.6), i === 2 ? 0.18 : 0.03);
        src(t + i * 0.011, 0.25).connect(bp).connect(g).connect(bus);
        if (i === 2) send(g, 0.35);
      }
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      env(og, t, 0.002, v * 0.35, 0.08); o.connect(og).connect(bus); o.start(t); o.stop(t + 0.12);
    },
    hat(t, v = 0.18, open = false, bus = music) {
      const hp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 7500;
      env(g, t, 0.001, v, open ? 0.22 : 0.045);
      src(t, open ? 0.3 : 0.08).connect(hp).connect(g).connect(bus);
    },
    bass(t, f, d = 0.25, v = 0.42) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain(), sg = ctx.createGain();
      lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(220, t + d * 0.9);
      env(g, t + 0.012, 0.006, v, d * 0.9); sg.gain.value = 0.9;
      osc('sawtooth', f, t, t + d + 0.05).connect(lp).connect(g).connect(music);
      osc('sine', f / 2, t, t + d + 0.05).connect(sg).connect(g);
    },
    pad(t, freqs, d, v = 0.06, cutoff = 1500) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.25);
      g.gain.setValueAtTime(v, t + Math.max(0.3, d - 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
      lp.connect(g).connect(music); send(g, 0.6);
      for (const f of freqs) for (const det of [-9, 9]) { const o = osc('sawtooth', f, t, t + d + 0.6); o.detune.value = det; o.connect(lp); }
    },
    stab(t, freqs, v = 0.12) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
      env(g, t, 0.003, v, 0.22); lp.connect(g).connect(music); send(g, 0.5);
      for (const f of freqs) for (const det of [-12, 0, 12]) { const o = osc('sawtooth', f * 2, t, t + 0.3); o.detune.value = det; o.connect(lp); }
    },
    boom(t, v = 0.9, len = 1.2) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(28, t + len * 0.8);
      env(g, t, 0.003, v, len); o.connect(g).connect(fx); o.start(t); o.stop(t + len + 0.1);
      const lp = ctx.createBiquadFilter(), ng = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(120, t + len * 0.7);
      env(ng, t, 0.002, v * 0.5, len * 0.8);
      src(t, len).connect(lp).connect(ng).connect(fx); send(ng, 0.4);
    },
    crash(t, v = 0.22, len = 1.6) {
      const hp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 3500; env(g, t, 0.002, v, len);
      src(t, len).connect(hp).connect(g).connect(fx); send(g, 0.5);
    },
    whoosh(t0, t1, v = 0.35, from = 250, to = 6000) {
      const bp = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner();
      bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(from, t0); bp.frequency.exponentialRampToValueAtTime(to, t1);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1 + 0.03);
      pan.pan.setValueAtTime(-0.7, t0); pan.pan.linearRampToValueAtTime(0.7, t1);
      src(t0, t1 - t0 + 0.05).connect(bp).connect(g).connect(pan).connect(fx);
    },
    riser(t0, t1, v = 0.12) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain();
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(7000, t1);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.02);
      o.connect(lp).connect(g).connect(fx); send(g, 0.4); o.start(t0); o.stop(t1 + 0.05);
      k.whoosh(t0, t1, v * 2.2, 400, 9000);
    },
    chime(t, v = 0.16, base = 1318.5) {
      for (const [m, a] of [[1, 1], [1.5, 0.6], [2, 0.45], [3, 0.2]]) {
        const g = ctx.createGain(); env(g, t, 0.002, v * a, 1.4);
        osc('sine', base * m, t, t + 1.5).connect(g).connect(fx); send(g, 0.9);
      }
    },
    // Muffle the music bus (slow-motion moments): lowpass + duck from t until `until`, recover by `release`.
    duck(t, until, release = until + 0.45, cutoff = 420, level = 0.7) {
      const f = musicLP.frequency, gn = music.gain;
      f.setValueAtTime(20000, t - 0.18); f.exponentialRampToValueAtTime(cutoff, t); f.setValueAtTime(cutoff, until); f.exponentialRampToValueAtTime(20000, release);
      gn.setValueAtTime(1, t - 0.18); gn.linearRampToValueAtTime(level, t); gn.setValueAtTime(level, until); gn.linearRampToValueAtTime(1, release);
    },
    fadeOut(t0, t1) { master.gain.setValueAtTime(master.gain.value, t0); master.gain.linearRampToValueAtTime(0, t1); },
  };
  return k;
}

// Arrange a beat-locked promo track from a cue sheet (see header).
export async function renderSoundtrack(cue = {}) {
  const duration = cue.duration ?? 15, bpm = cue.bpm ?? 120, BEAT = 60 / bpm;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  const k = createKit(ctx);
  const chord = (n) => CHORDS[n] ?? CHORDS.Am;

  // intro: slam + pad + creeping hats + whoosh into the groove
  const intro = cue.intro ?? { end: 0 };
  if (intro.end > 0) {
    const s = intro.slam ?? 0.08;
    k.kick(s, 1.2, k.fx); k.boom(s, 1.0, 1.4); k.crash(s, 0.28, 1.8);
    k.pad(s, chord(intro.chord ?? 'Am'), intro.end - s, 0.05, 1100);
    for (let t = intro.end / 2; t < intro.end; t += BEAT / 2) k.hat(t, 0.06 + (t - intro.end / 2) * 0.12);
    k.whoosh(intro.end - 0.4, intro.end, 0.4);
  }

  // groove: four-on-the-floor, claps on 2 & 4, off-beat hats, 8th-note bass, pad per bar
  const gr = cue.groove;
  if (gr) {
    const bar = BEAT * (gr.barBeats ?? 4), prog = gr.progression ?? ['Am', 'F', 'C', 'G'];
    for (let t = gr.from; t < gr.to - 1e-6; t += BEAT) {
      const b = Math.round((t - gr.from) / BEAT);
      k.kick(t, 1);
      if (b % 2 === 1) k.clap(t);
      k.hat(t + BEAT / 2, 0.16, b % 4 === 3);
      if (gr.busyFrom != null && t >= gr.busyFrom) { k.hat(t + BEAT / 4, 0.08); k.hat(t + 3 * BEAT / 4, 0.08); }
    }
    for (let i = 0, t0 = gr.from; t0 < gr.to - 1e-6; i++, t0 += bar) {
      const name = prog[i % prog.length], root = rootOf(name);
      k.pad(t0, chord(name), Math.min(bar, gr.to - t0), 0.045);
      for (let j = 0; j < (gr.barBeats ?? 4) * 2; j++) {
        const t = t0 + j * BEAT / 2;
        if (t >= gr.to - 1e-6) break;
        k.bass(t, j % 4 === 3 ? root * 1.5 : j % 2 ? root * 2 : root, BEAT / 2);
      }
    }
  }

  // cuts: majors get crash + low hit + whoosh in front, minors get a rising stab
  let minor = 0;
  for (const c of cue.cuts ?? []) {
    if (c.kind === 'minor') { k.stab(c.t, chord(c.chord ?? (gr?.progression ?? ['Am', 'F', 'C', 'G'])[minor % 4]), 0.11 + (minor++ % 4) * 0.015); continue; }
    if (c.t <= 0.01) continue;
    k.crash(c.t, 0.2); k.boom(c.t, 0.45, 0.6);
    if (c.whoosh !== false) k.whoosh(c.t - 0.3, c.t, 0.3);
  }

  for (const s of cue.slowmo ?? []) {
    k.duck(s.t, s.until ?? s.t + 0.4, s.release);
    k.whoosh(s.t - 0.3, s.t, 0.38, 300, 8000);
    k.boom(s.t, 1.0, 1.3); k.chime(s.t, 0.2, 1567.98); k.crash(s.t, 0.18, 1.2);
  }

  for (const h of cue.hits ?? []) {
    if (h.kind === 'chime') { k.chime(h.t, h.v ?? 0.17, h.base ?? 1318.5); k.boom(h.t, 0.6, 0.8); k.whoosh(h.t - 0.25, h.t, 0.25, 600, 9000); }
    else if (h.kind === 'boom') { k.boom(h.t, h.v ?? 0.8, 0.7); k.stab(h.t, chord(h.chord ?? 'F').map((f) => f / 2), 0.1); }
    else if (h.kind === 'stab') k.stab(h.t, chord(h.chord ?? 'Am'), h.v ?? 0.12);
    else if (h.kind === 'crash') k.crash(h.t, h.v ?? 0.22);
  }

  const out = cue.outro;
  if (out) {
    if (out.riser) k.riser(out.at - out.riser, out.at, 0.13);
    if (out.roll) for (let t = out.at - out.roll; t < out.at - 1e-6; t += BEAT / 4) k.clap(t, 0.2 + (t - (out.at - out.roll)) * 0.7);
    k.kick(out.at, 1.3, k.fx); k.boom(out.at, 1.1, 1.8); k.crash(out.at, 0.3, 2.0);
    const ch = chord(out.chord ?? 'Am');
    k.pad(out.at, [...ch, ch[0] * 2], Math.max(0.5, duration - out.at - 0.2), 0.06, 1800);
    k.bass(out.at, rootOf(out.chord ?? 'Am'), Math.min(1.6, duration - out.at), 0.4);
    if (out.sparkle) k.chime(out.sparkle, 0.13, 1760);
  }

  k.fadeOut(duration - 0.6, duration);
  return finish(await ctx.startRendering());
}

// Peak-normalise to about -0.6 dBFS.
export function finish(buf, peakTo = 0.93) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const g = peak > 0 ? peakTo / peak : 1;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return buf;
}

function impulse(ctx, seconds, decay) {
  const n = Math.floor(seconds * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return b;
}
