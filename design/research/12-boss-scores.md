# 12. Boss scores: three isolated raid-style encounter themes (procedural Web Audio)

Scope: when a boss is summoned the act music is replaced by that boss's OWN score, which follows the fight (P1 -> intermission 1 -> P2 -> intermission 2 -> P3 -> soft enrage), marks the "Downed" burn window, and ends with a victory resolution. Everything stays oscillators + noise + biquads; no files.
Sibling doc: `11-raid-boss-mechanics.md` (phase gates 66/33 %, 7-9 s intermissions, Downed 4-6 s, soft enrage after 70-90 s, Gorrak war-horn Break Check; target fights Gorrak 60-75 s, Vashkar 80-100 s, Aurelith 100-120 s). The score has to be built for **short fights**: a section loop must be musical after ONE hearing (8-bar loops, melody by bar 2), and heat must build *inside* a section.
Marked (inf.) = my own inference/judgement, not a sourced fact. Sources are numbered and listed at the end.

## 0. What the current engine gives us (read from `src/game/audio.js`)
* One lookahead scheduler: `setInterval` 25 ms, `SCHEDULE_AHEAD` 0.12 s, a global 16th-step counter `this.step`, `stepDur` re-read from `th.bpm` on every step (so tempo can change per step). This is exactly the pattern in [1] (25 ms timer / ~100 ms lookahead).
* `THEMES` = drone bed (`_buildLayer`: saw+triangle through a lowpass, optional pads/LFO) + a 32-step arp + `pulse` + a boss `ostinato` on `bossBus`. `_switchLayer(key, now, fade)` crossfades beds and sets `this.theme`; `_fadeOutLayer` stops oscillators and `fadingLayers` frees nodes. `MUSIC_MAX_VOICES = 14`, checked in `_mTone`/`_mNoise`; the counter is incremented at node **creation**, not at note start (gotcha: never pre-schedule a long roll in one go, see 2.8).
* The only boss hooks today: `bossSpawned {enemy, final}` -> two 55 Hz saws + hit; `bossPhase {phase:2}` -> `_roar()` + `bossDouble` (ostinato at 16ths); `enemyKilled {enemy.boss}` -> sine 150->30 + noise; `bossKilled` -> game immediately calls `_beginShift()` (non-final, `riftShift` event, **SHIFT_DURATION = 2.5 s**) or `_end('victory')` (final, `runEnd`). Event order for a boss kill is `enemyKilled` -> `bossKilled` -> `riftShift`/`runEnd`, so audio must start the victory resolution from **`enemyKilled`** (it fires first).
* Master chain: `musicBus (0.35) -> masterGain (0.5) -> DynamicsCompressor(thr -30, knee 40, ratio 12, att 3 ms, rel 250 ms) -> destination`. SFX go straight to `masterGain`. This compressor is very hot (see 5).
* Boss ids in `bosses.js`: `hollowWarden` (Gorrak), `vashkar`, `riftHeart` (Aurelith). Aurelith's Prism Ward changes every `WARD_CYCLE = 10` s (4 wards).
* Existing act themes to stay clear of: Verge D dorian 84 bpm sine arp; Cinder E phrygian 96 bpm tom pulse; Crown G lydian 104 bpm sine arp + pads. Boss scores use other tonics, tempos, meters and timbres (saw/brass, formant choir, taiko/timpani, organ, FM bells) the act music never uses.

## 1. TL;DR
1. **One architecture: a "stem matrix" state machine inside the existing scheduler.** Each boss score = sections (`intro, p1, inter, p2, inter2, p3, win`), each section = a row of stem->pattern assignments (vertical layering *inside* a section, horizontal re-sequencing *between* sections). Section changes are committed on a quantisation grid (bar or half-bar), phase stingers are two-part: a riser that starts on the next beat ("pre") and a hit that lands on the new section's downbeat ("hit"). [2][3][4]
2. **Add `mode = 'boss'`**: the act drone fades in 0.2 s under the summon hit, `theme` becomes the boss score (a `THEMES`-style entry with `boss: true`), intensity layer and old `bossBus` ostinato are off, `voiceCap` rises 14 -> 26, new `scoreSus`/`scoreRhy` buses (so brass/choir can be pumped without touching drums/bass).
3. **Brass** = 2-3 detuned saws -> one lowpass with an "open then settle" cutoff envelope + 30-40 cent scoop [5][6]. **Choir** = saws into ONE shared 3-band bandpass formant bank (Csound table values) [7][8]: 3 biquads total no matter how many voices. **Organ** = ONE oscillator with a `PeriodicWave` of drawbar harmonics [9]. **Taiko/timpani** = pitch-swept sine + partials (timpani 1 : 1.5 : 1.98 : 2.44 [10]) + highpassed click. **Bells** = 2-oscillator FM, ratio 7:5 [11]. Drop-in code in section 2.
4. **Voice budget:** cap 26 normal / +4 for "essential" (downbeat drums, stingers) / -6 for "ornament" (shimmer, hats). Persistent beds (<= 7 sources) live outside the cap. Peak P3 estimate ~23 transient + ~7 bed sources, plus SFX <= 24.
5. **Distinctness:** Gorrak = F minor pentatonic, **6/8 at 150**, taiko + bone-horn + male chant, open fifths (no third). Vashkar = C phrygian-dominant, **4/4 at 138 -> 7/8 in P3**, snare/war drums + low saw brass + anvil. Aurelith = Eb lydian -> whole-tone, 4/4 at 96, organ pedal + soprano formant choir + FM crystal bells, timpani; chord follows the Prism Ward.
6. **Mixing:** music bus compressor + presence notch (3 kHz, -3 dB) so telegraph/SFX lanes stay open; event-driven "sidechain" ducks on the sustained stems (Web Audio has no sidechain input; use gain automation [12]); drums are NOT ducked, only bass/sub during the roar.
7. **Gameplay contract needed** (small): `boss.musicState` (`p1|inter1|p2|inter2|p3`), `boss.downed`, `boss.enrage` (0..1), `boss.stateLeft` (s), plus events `bossTell {kind,t}` and `bossImpact {kind,power}`. A fallback maps today's `boss.phase` to `p1/p2`.
8. **Non-final victory only has 2.5 s** before the Rift Shift whoosh: make the game hold `_beginShift` ~2.5-3 s after a boss kill (death beat), or keep Gorrak/Vashkar `win` stingers <= 2.4 s (specified below that way). Aurelith's `win` is ~8 s and plays under the victory screen.

## 2. Techniques: "epic" from oscillators + noise

### 2.1 Why these recipes (summary of sources)
* **Brass:** sawtooth carries most brass harmonics; stack several saws detuned a few cents; lowpass with a filter envelope that opens a little after the amp attack then falls to a sustain; some resonance; a sub-octave for weight [5][6]. The "blat" is that delayed cutoff open. (inf.: a 20-40 cent upward scoop at the attack adds the lip-bend of a real horn.)
* **Choir "aah":** a sawtooth source through 3 parallel bandpass filters at the vowel formants; formants stay at fixed frequencies independent of pitch, so ONE bank can serve every singer [7][8]. Csound's formant table gives F1-F5 (Hz / dB / bandwidth): soprano a 800/1150/2900 at 0/-6/-32 dB, bw 80/90/120; bass a 600/1040/2250 at 0/-7/-9 dB, bw 60/70/110; tenor o 400/800/2600 at 0/-10/-12 dB; tenor u 350/600/2700 at 0/-20/-17 dB [7]. Morphing vowels = `setTargetAtTime` on the three filters.
* **Taiko/war drum:** sine body with a fast downward sweep, a quieter partial, and a short highpassed noise click [13]. **Timpani:** radial modes at ~1.00 : 1.50 : 1.98 : 2.44 of the principal, not harmonic [10] (so a plain sine reads as a "tom", the partials make it a timpani).
* **Bells/crystal:** FM with a non-integer carrier:modulator ratio (e.g. 5:7 = 1:1.4) and a modulation index that decays faster than the amplitude gives a bright strike and a pure tail [11].
* **Organ/pipe stack:** drawbar harmonics are footage/frequency ratios 1, 2, 3, 4, 6, 8, 10, 12, 16 of the 16' pitch [9]; a `PeriodicWave` puts the entire stack in ONE oscillator (index n = harmonic n, `real` all zero). This is the cheapest "huge" sound available.
* Trailer-style boss cue vocabulary (low brass, string ostinatos, taiko, choir held back for the peak, stop-down before the final hit, percussion stripped for the breakdown) [14]; lydian = floating/wonder, phrygian = dark/exotic [15].

### 2.2 Shared helpers (replace the bodies in `audio.js`; defaults keep act music identical)
```js
const BOSS_MAX_VOICES = 26;                         // act music keeps MUSIC_MAX_VOICES = 14

// prio 0 = essential (+4 over cap), 1 = normal (cap), 2 = ornament (cap - 6)
_mRoom(n = 1, prio = 1) {
  return this.musicVoices + n <= this.voiceCap + (prio === 0 ? 4 : prio === 2 ? -6 : 0);
}

// Amp envelope. sus == null: attack then exponential decay (existing behaviour).
// sus = 0..1: attack, settle to gain*sus, hold, release in the last `rel` s. Returns stop offset.
_mEnv(g, when, dur, gain, attack, sus = null, rel = 0.12) {
  g.setValueAtTime(0.0001, when);
  g.linearRampToValueAtTime(gain, when + attack);
  if (sus == null) { g.exponentialRampToValueAtTime(0.0001, when + dur); return dur + 0.05; }
  g.setTargetAtTime(gain * sus, when + attack, 0.12);
  g.setTargetAtTime(0.0001, when + dur - rel, rel / 3);
  return dur + rel;
}

// Count a multi-oscillator voice; tear the shared chain down when its first source ends.
_mReg(oscs, chain) {
  this.musicVoices += oscs.length;
  oscs.forEach((o, i) => o.addEventListener('ended', () => {
    this.musicVoices--; o.disconnect();
    if (i === 0) for (const n of chain) { try { n.disconnect(); } catch { /* gone */ } }
  }));
}
```
`_mTone` patch (3 changes): signature gains `sweep = dur, prio = 1, detune = 0, sus = null, rel = 0.12`; `if (... || !this._mRoom(1, prio)) return;`; `exponentialRampToValueAtTime(freqEnd, when + sweep)` (a fast kick-style sweep with a long ring); `osc.detune.value = detune;`; replace the three envelope lines + `osc.stop(...)` by `const stop = this._mEnv(env.gain, when, dur, gain, attack, sus, rel); osc.stop(when + stop);`. `_mNoise` gets `prio = 1` and `_mRoom(1, prio)`. `_schedule` must read `th.boss ? this.bpmCur : th.bpm` for `stepDur`.

### 2.3 Brass (war horn, low brass, banner fanfare)
```js
// Detuned saws -> lowpass "blat" (opens after the attack, settles) with a pitch scoop.
_mBrass({ freq, dur, gain = 0.1, attack = 0.05, when, dest, n = 3, spread = 10, open = 4.5,
          settle = 2, Q = 2.5, sus = 0.8, rel = 0.12, slide = 0.35, prio = 1 }) {
  const ctx = this.ctx;
  if (!ctx || !dest || !this._mRoom(n, prio)) return;
  const env = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = Q;
  lp.frequency.setValueAtTime(freq * 1.2, when);
  lp.frequency.linearRampToValueAtTime(Math.min(9000, freq * open), when + attack * 1.6);
  lp.frequency.setTargetAtTime(freq * settle, when + attack * 1.6, 0.18);
  const stop = this._mEnv(env.gain, when, dur, gain / Math.sqrt(n), attack, sus, rel);
  env.connect(lp); lp.connect(dest);
  const oscs = [];
  for (let i = 0; i < n; i++) {
    const c = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, when);
    o.detune.setValueAtTime(c - slide * 100, when);               // scoop up into pitch
    o.detune.linearRampToValueAtTime(c, when + attack * 1.5);
    o.connect(env); o.start(when); o.stop(when + stop); oscs.push(o);
  }
  this._mReg(oscs, [env, lp]);
}
```
Recipes: **war horn / bone horn** `n 2, spread 14, open 2.6, settle 1.8, attack .07, slide 2 (a bent-up whole-tone), sus .85`. **Low brass riff (Vashkar)** `n 3, spread 12, open 4.5, settle 1.8, Q 3, attack .02, dur 2 steps`. **Stab** `dur 0.18, attack .015, sus null`-style by passing `sus: 0.3`. Budget: n voices per note, use n=2 for ornaments, n=3 for hero moments only.

### 2.4 Choir (shared formant bank) and organ
```js
const VOWELS = {                      // [freq, linear amp, bandwidth], Csound formant table [7]
  a: [[800, 1, 80], [1150, 0.5, 90], [2900, 0.12, 120]],   // soprano a (F3 raised from 0.025 for body, inf.)
  A: [[600, 1, 60], [1040, 0.45, 70], [2250, 0.35, 110]],  // bass a
  o: [[400, 1, 70], [800, 0.32, 80], [2600, 0.25, 100]],   // tenor o
  u: [[350, 1, 40], [600, 0.1, 60], [2700, 0.14, 100]],    // tenor u
};
_makeBank(dest, vowel = 'a', layer) {            // call once per boss bed; nodes go in layer.nodes
  const ctx = this.ctx, b = { in: ctx.createGain(), out: ctx.createGain(), f: [], g: [] };
  VOWELS[vowel].forEach(([fr, amp, bw]) => {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr;
    f.Q.value = Math.max(2, fr / (bw * 2));      // half the table Q: wider = forgiving on sparse harmonics (inf.)
    const g = ctx.createGain(); g.gain.value = amp;
    b.in.connect(f); f.connect(g); g.connect(b.out); b.f.push(f); b.g.push(g);
    layer.nodes.push(f, g);
  });
  b.out.gain.value = 2.2;                         // band-pass banks are quiet: make-up, tune by ear
  b.out.connect(dest);
  b.vib = ctx.createGain(); b.vib.gain.value = 14;           // cents, shared vibrato
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; lfo.connect(b.vib); lfo.start();
  layer.nodes.push(b.in, b.out, b.vib, lfo);      // _fadeOutLayer stops the lfo (it is an OscillatorNode)
  return b;
}
_setVowel(b, vowel, t, tc = 0.25) {               // "oo" -> "aa" morph, safe at any time
  VOWELS[vowel].forEach(([fr, amp, bw], i) => {
    b.f[i].frequency.setTargetAtTime(fr, t, tc);
    b.f[i].Q.setTargetAtTime(Math.max(2, fr / (bw * 2)), t, tc);
    b.g[i].gain.setTargetAtTime(amp, t, tc);
  });
}
_mChoir({ freq, dur, gain = 0.07, attack = 0.3, rel = 0.45, when, bank, voices = 2, spread = 8, prio = 1 }) {
  const ctx = this.ctx;
  if (!ctx || !bank || !this._mRoom(voices, prio)) return;
  const env = ctx.createGain();
  const stop = this._mEnv(env.gain, when, dur, gain / Math.sqrt(voices), attack, 0.85, rel);
  env.connect(bank.in);
  const oscs = [];
  for (let i = 0; i < voices; i++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, when);
    o.detune.value = voices === 1 ? 0 : (i / (voices - 1) - 0.5) * 2 * spread;
    o.connect(env); bank.vib.connect(o.detune);
    o.addEventListener('ended', () => { try { bank.vib.disconnect(o.detune); } catch { /* gone */ } });
    o.start(when); o.stop(when + stop); oscs.push(o);
  }
  this._mReg(oscs, [env]);
}
// Organ: ONE oscillator, drawbar harmonics 1,2,3,4,6,8 at 8,8,6,5,3,2 [9]. `freq` = the 8' pitch.
_organWave() {
  if (this._ow) return this._ow;
  const lv = { 1: 8, 2: 8, 3: 6, 4: 5, 6: 3, 8: 2 }, re = new Float32Array(17), im = new Float32Array(17);
  for (const h in lv) im[h] = lv[h] / 8;
  return (this._ow = this.ctx.createPeriodicWave(re, im));
}
_mOrgan({ freq, dur, gain = 0.07, attack = 0.04, rel = 0.25, when, dest, lp = 3200, prio = 1 }) {
  const ctx = this.ctx;
  if (!ctx || !dest || !this._mRoom(1, prio)) return;
  const o = ctx.createOscillator(), env = ctx.createGain(), f = ctx.createBiquadFilter();
  o.setPeriodicWave(this._organWave()); o.frequency.setValueAtTime(freq / 2, when);   // harmonic 2 = 8'
  f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5;
  const stop = this._mEnv(env.gain, when, dur, gain, attack, 0.9, rel);
  o.connect(env); env.connect(f); f.connect(dest); o.start(when); o.stop(when + stop);
  this._mReg([o], [env, f]);
}
```
Choir tips: soprano `a` for the lead line (octave 4-5), tenor/bass `o`/`u` for chant and drones (octave 2-3). Dyads (root+fifth, 2 voices each = 4 oscs) are enough; a full 4-note chord is a P3/finale-only luxury. Add a breath layer by feeding a quiet looped noise into `bank.in` (persistent, in the bed). Small laptop speakers cannot reproduce < 60 Hz: keep fundamentals >= 70 Hz for the choir.

### 2.5 Drums: taiko, timpani, snare, anvil
```js
_mTaiko({ when, dest, f0 = 80, vel = 1, kind = 'big' }) {     // big 3 voices, small 2, timp 4, rim 1
  if (kind === 'rim') {
    return this._mNoise({ dur: 0.05, gain: 0.16 * vel, attack: 0.001, filterType: 'bandpass',
      freqStart: 2300, Q: 2.5, when, dest, prio: 0 });
  }
  const t = kind === 'timp', big = kind === 'big' || t;
  this._mTone({ wave: 'sine', freq: f0 * (t ? 1.3 : 2.6), freqEnd: f0, sweep: t ? 0.12 : 0.07,
    dur: t ? 1.1 : big ? 0.62 : 0.3, gain: (big ? 0.55 : 0.34) * vel, attack: 0.002, when, dest, prio: 0 });
  if (big) this._mTone({ wave: 'sine', freq: f0 * 1.5 * 1.9, freqEnd: f0 * 1.5, sweep: 0.05,
    dur: t ? 0.7 : 0.28, gain: (t ? 0.2 : 0.16) * vel, attack: 0.002, when, dest, prio: 1 });
  if (t) this._mTone({ wave: 'sine', freq: f0 * 1.98, dur: 0.5, gain: 0.08 * vel, attack: 0.003, when, dest, prio: 2 });
  this._mNoise({ dur: big ? 0.09 : 0.05, gain: (big ? 0.2 : 0.12) * vel * (t ? 0.5 : 1), attack: 0.001,
    filterType: 'highpass', freqStart: t ? 1500 : big ? 1800 : 2600, when, dest, prio: 1 });
}
// snare: noise band + tonal triangle.  's' = full, 'g' = ghost (vel .35)
_mSnare({ when, dest, vel = 1 }) {
  this._mNoise({ dur: 0.13, gain: 0.16 * vel, attack: 0.001, filterType: 'bandpass', freqStart: 1800, Q: 0.8, when, dest, prio: 0 });
  this._mTone({ wave: 'triangle', freq: 190, freqEnd: 140, dur: 0.09, gain: 0.1 * vel, attack: 0.001, when, dest, prio: 1 });
}
```
Timpani **roll** = step-driven (2 hits per 16th, velocity crescendo `from + (to-from)*k^2`, `prio: 2` except the last): never pre-scheduled in one go (the voice counter increments at creation, a 4 s roll would be ~60 voices).

### 2.6 Strings ostinato, bells, impacts, risers
```js
_mStr({ freq, dur, gain = 0.09, when, dest, cut = 1100, prio = 1 }) {   // spiccato saw pair, 2 voices
  for (const d of [-8, 8]) this._mTone({ wave: 'sawtooth', freq, dur, gain: gain * 0.7, attack: 0.012,
    when, dest, detune: d, filter: { type: 'lowpass', freq: cut, Q: 0.7 }, prio });
}
// FM crystal/bell: modulator ratio 1.4 (5:7 [11]); index decays faster than the amp => bright strike, pure tail
_mBell({ freq, dur = 2.2, gain = 0.07, ratio = 1.4, index = 5, when, dest, prio = 2 }) {
  const ctx = this.ctx;
  if (!ctx || !dest || !this._mRoom(2, prio)) return;
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), env = ctx.createGain();
  car.frequency.setValueAtTime(freq, when); mod.frequency.setValueAtTime(freq * ratio, when);
  mg.gain.setValueAtTime(freq * index, when);
  mg.gain.exponentialRampToValueAtTime(freq * 0.05, when + dur * 0.6);
  env.gain.setValueAtTime(0.0001, when); env.gain.linearRampToValueAtTime(gain, when + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  mod.connect(mg); mg.connect(car.frequency); car.connect(env); env.connect(dest);
  car.start(when); mod.start(when); car.stop(when + dur + 0.05); mod.stop(when + dur + 0.05);
  this._mReg([car, mod], [env, mg]);
}
// Impact / sub drop: fast-sweep sine + lowpassed noise boom + a 2x "punch" so small speakers hear it
_mImpact({ when, dest, f0 = 90, f1 = 34, dur = 1.6, gain = 0.5, noise = 0.25 }) {
  this._mTone({ wave: 'sine', freq: f0, freqEnd: f1, sweep: dur * 0.8, dur, gain, attack: 0.004, when, dest, prio: 0 });
  this._mNoise({ dur: dur * 0.55, gain: noise, attack: 0.002, filterType: 'lowpass', freqStart: 2400, freqEnd: 90, Q: 0.8, when, dest, prio: 0 });
  this._mTone({ wave: 'triangle', freq: f0 * 2, freqEnd: f1 * 2, sweep: 0.25, dur: 0.35, gain: gain * 0.35, attack: 0.002, when, dest, prio: 1 });
}
// Riser: swell (attack ~ whole duration) so it peaks at its end, then cuts. 3 voices.
_mRiser({ when, dur, dest, f0 = 110, f1 = 440, gain = 0.12 }) {
  for (const d of [-12, 12]) this._mTone({ wave: 'sawtooth', freq: f0, freqEnd: f1, dur, gain, attack: dur * 0.96,
    when, dest, detune: d, filter: { type: 'lowpass', freq: 1800, Q: 1 }, prio: 1 });
  this._mNoise({ dur, gain: gain * 1.6, attack: dur * 0.96, filterType: 'bandpass', freqStart: 300, freqEnd: 6000, Q: 1.2, when, dest, prio: 1 });
}
```
Make sub impacts audible on laptops: feed `scoreRhy` through a gentle `WaveShaper` (the existing `getDistortionCurve`, drive ~3) on a *parallel sub send* so a 40 Hz sine also yields 80/120 Hz harmonics (inf.).

### 2.7 CPU / voice budget
* Web Audio has no official voice limit; cost is DSP per block and per node (gain ~free, biquad costs more, panners more); one blog's rough numbers are 64-128 simple source nodes on desktop and 20-30 stressed mobile [16]; Padenot's performance notes are the canonical reference [17]. Treat those as starting points, then measure on a mid laptop (6).
* Current: cap 14. **Recommended: `BOSS_MAX_VOICES = 26` while `mode === 'boss'`** (act music stays 14). The boss bed replaces the act bed, intensity layer and old ostinato, so the sources it frees (drone 2 + pads 6 + arp tails + intensity) pay for the increase; net live sources are roughly +10.
* Priority classes keep the score coherent when saturated: **0 essential** (downbeat drums, bass, stingers, impacts) may exceed the cap by 4 (hard ceiling 30); **1 normal** up to 26; **2 ornament** (shimmer bells, shakers, roll hits, 2nd choir voice) stops at 20.
* Persistent bed (outside the counter, <= 7 sources): drone saw+triangle (2), fifth (1), sub sine (1), choir/organ shared infra (vibrato LFO 1, optional breath noise 1), bed LFO (1).
* Estimated live sources by stem at P3 (typical): drums 5, bass 2, brass 6, choir (dyads) 4, bells 4, strings 2 = ~23 transient + 7 bed = 30, plus the SFX pool (<= 24 by `_canPlaySound`) = ~54 sources. Acceptable on desktop (inf.); expose a lite switch: `voiceCap = 18` and drop prio-2 entirely, also auto-degrade: if the game's smoothed frame time > 22 ms for 3 s, `voiceCap = max(14, voiceCap - 6)`.
* Never create nodes you do not stop: every source gets `stop()` and an `ended` teardown (already the house style).
* Share, don't multiply: one choir bank (3 biquads), one organ `PeriodicWave` (cached), buses per class, one echo send (re-tune `echoDelay.delayTime` to a dotted-8th of the boss tempo via `th.echo`).

### 2.8 Roll/riser gotcha (restated)
`musicVoices` is incremented at creation. Anything that creates many future-dated voices at once (rolls, long arps, a stinger with 15 notes) can starve the cap. Rule: stingers <= 12 voices total; rolls and fills are emitted per step from the sequencer.

## 3. Adaptive structure

### 3.1 Choice: stem matrix + quantised commits (sections x stems)
Vertical-only (fade stems on a fixed loop) cannot change harmony, meter or tempo, and P3/enrage need all three; horizontal-only (jump between fixed cues) cannot do the continuous heat/Downed/enrage changes. The sources agree on the hybrid: re-sequence for large state changes, layer for finer intensity, and quantise to bar/phrase boundaries because a mid-bar change breaks the groove and harmony; the price of quantising is latency, mitigated by a short bridge/stinger [2][3][4]. A commercial boss-music pack also ships exactly this shape (intro/loops/stingers/outro, up to 8 states) [18].

Rules:
* **Grid:** 16th steps; per section `bar` (steps per bar, meter: 12 = 6/8, 16 = 4/4, 14 = 7/8), `beat` (6 / 4 / 4-or-6) and `quant` (commit grid; divisor of `bar`). Section-local counter `rel = sstep - secStep`.
* **Commit** a requested section only when `rel % quant === 0` of the *current* section. Quant: Gorrak 12 (bar = 1.2 s), Vashkar 8 (half bar = 0.87 s), Aurelith 8 (half bar = 1.25 s). Worst-case wait = one quant.
* **Stinger = pre + hit.** Event arrives -> `hush` (silence rhythm stems, sustain stems keep ringing; this is also the window for the existing `_roar()` SFX to be heard) -> on the next *beat* the `pre` riser starts, fitted to the remaining time -> at the commit the `hit` stinger lands with the new section's downbeat.
* **Intermission** = `inter` section: drums OUT (stop-down), bass becomes a pedal, sustained choir/organ/horn, slow "heartbeat" every bar, `pre` riser added only when `boss.stateLeft < 2 bars` (a gated stem). Exit = `hit` stinger into P2/P3. (Intermission lengths are 7-9 s [doc 11] = 5-6 Gorrak bars, 4-5 Vashkar bars, 3-4 Aurelith bars.)
* **Downed window** (4-6 s burn window) = an *overlay*, not a section: `boss.downed` fades in the `burn` stems (octave-up lead, 16th shaker, rising choir) on the current section, 150 ms, no commit needed. Reward feeling: the score pushes forward when the player should spend cooldowns.
* **Break Check / Gorrak war-horn cast (5 s)**: overlay `check`: hush shaker + chant, keep the heartbeat, slow riser over 5 s; success = cancel sting (reverse-cymbal + hit, "Downed" overlay starts), fail = horn blast stinger.
* **Soft enrage** = a continuous `boss.enrage` 0..1, not a section: `bpmTarget = sec.bpm * (1 + 0.12 * enrage)`, stems flagged `enrage: true` fade in at > 0.15, filter cut +, harmonic rhythm doubles (Aurelith), anvil/16th layer (Vashkar). Tempo glide per step: `bpmCur += (target - bpmCur) * 0.03`.
* **Victory** is not a section: at `enemyKilled(boss)` kill all stems in 60 ms (`scoreBus` gain ramp), 0.35-0.9 s of silence (the "stop-down" before the resolution [14]), then a fixed-length absolute-time resolution stinger (`stings.win`), then control returns to act music (non-final) / end (final).
* **Defeat** (`runEnd` victory:false while mode boss): tape-stop = `scoreBus` lowpass 9000 -> 180 Hz and gain -> 0 over 1.2 s, then the existing descending-minor sting.

### 3.2 Code: state, bed, events
```js
// constructor
this.voiceCap = MUSIC_MAX_VOICES; this.score = null; this.sec = null; this.secStep = 0; this.sstep = 0;
this.want = null; this.sting = null; this.stingPre = false; this.hush = false; this.bpmCur = 90;
this.scoreBus = this.scoreSus = this.scoreRhy = null;

// _initMusic (after musicBus exists)
this.scoreBus = ctx.createGain();
const notch = ctx.createBiquadFilter(); notch.type = 'peaking'; notch.frequency.value = 3000; notch.Q.value = 0.9; notch.gain.value = -3;
this.scoreSus = ctx.createGain(); this.scoreRhy = ctx.createGain();      // sustains (brass/choir/organ/bells) | drums+bass
this.scoreSus.connect(this.scoreBus); this.scoreRhy.connect(this.scoreBus);
this.scoreBus.connect(notch); notch.connect(this.musicBus);

// THEMES = { title, verge, cinder, crown, ...BOSS_THEMES }   (BOSS_THEMES keys 'boss:gorrak' ... each .boss = true)
// _controlTick: `else if (this.mode === 'boss') want = this.score ? this.score.key : null;`
//   fade = th.boss ? 0.2 : ...; intensityTarget = 0 unless mode === 'act' (already true); call this._scoreWatch();
// _buildLayer(th): if (th.boss) return this._buildBossBed(th, now, fade);   // drone recipe + this._makeBank(...)
// _playStep: `if (th.boss) return this._playBossStep(t, step);` BEFORE the muted check? No: AFTER pads, keep state running when muted.

const BOSS_KEY = { hollowWarden: 'boss:gorrak', vashkar: 'boss:vashkar', riftHeart: 'boss:aurelith' };
_onBossSpawned(e) {
  /* existing 55 Hz saw SFX: keep only the 100 Hz hit */
  const key = BOSS_KEY[e && e.enemy && e.enemy.id];
  if (!key || !this.ctx || !this.musicBus) return;
  this.score = THEMES[key]; this.mode = 'boss'; this.voiceCap = BOSS_MAX_VOICES;
  this.sec = null; this.sstep = 0; this.bpmCur = this.score.bpm;
  this.want = 'intro'; this.sting = 'summon'; this.hush = false;
  this._playSting(this.score.stings.summon.hit, this.ctx.currentTime + 0.06);   // hit now; grid starts at next step
}
_onActStart() { /* + */ this.voiceCap = MUSIC_MAX_VOICES; this.score = null; }
_onRiftShift() { /* if (this.winUntil > now) delay the whoosh to winUntil - 0.6 */ }
_onRunEnd(e) { /* if (this.winUntil > now) return; if (this.mode === 'boss') this._scoreTapeStop(); */ }

// game -> music state, polled every scheduler tick (no new events strictly required)
_scoreWatch() {
  const b = this.game.boss;
  if (this.mode !== 'boss' || !b || !this.score) return;
  const s = b.musicState || (b.phase === 2 ? 'p2' : 'p1');          // contract + fallback for the 2-phase boss
  const sec = s.startsWith('inter') ? 'inter' : s;
  if (this.want === 'intro' && sec === 'p1') return;                  // let the intro finish
  if (sec !== (this.want || (this.sec && this.sec.name))) this._scoreGo(sec, this.score.sectionSting[sec]);
  this.downed = !!b.downed; this.enrage = b.enrage || 0;
  const barSec = this.sec ? this.sec.bar * 15 / this.bpmCur : 2;          // seconds per bar (bar steps * 60/bpm/4)
  const soon = b.stateLeft != null && b.stateLeft < 2 * barSec;
  if (soon && !this.exitSoon) this.exitAt = this.sstep - (this.secStep || 0);   // roll crescendo starts here
  this.exitSoon = soon;
}
_scoreGo(sec, sting) { this.want = sec; this.sting = sting || null; this.stingPre = false; this.hush = !!sting; }
```
(`exitSoon` precisely = `b.stateLeft < 2 * barSeconds`; written loosely above, compute `barSeconds = sec.bar * 15 / this.bpmCur`.)

### 3.3 Code: the sequencer (called from `_playStep` for boss themes)
```js
_playBossStep(t, step) {
  const sc = this.score; if (!sc || this.theme !== sc) return;
  const s = this.sstep++, stepDur = 60 / this.bpmCur / 4;
  const sec = this.sec, rel = sec ? s - this.secStep : 0;
  const quant = sec ? sec.quant : 1, onQuant = !sec || rel % quant === 0;
  if (sec && sec.next && rel >= sec.bars * sec.bar) this.want = sec.next;      // finite sections (intro)
  this.bpmCur += ((sec ? sec.bpm : sc.bpm) * (1 + 0.12 * this.enrage) - this.bpmCur) * 0.03;

  if (this.want && (!sec || this.want !== sec.name)) {
    if (onQuant) this._scoreCommit(t, s);
    else if (this.sting && !this.stingPre && rel % sec.beat === 0) {
      this._playSting(sc.stings[this.sting].pre, t, (quant - (rel % quant)) * stepDur);
      this.stingPre = true;
    }
  }
  const cur = this.sec; if (!cur || this.muted) return;
  const r = s - this.secStep, lastBar = cur.bars > 0 && r >= (cur.bars - 1) * cur.bar;
  for (const st of cur.stems) {                                                  // compiled array
    if (this.hush && st.hushable) continue;
    if (st.when === 'downed' && !this.downed) continue;
    if (st.when === 'enrage' && this.enrage < 0.15) continue;
    if (st.when === 'exit' && !this.exitSoon) continue;
    this._bossStem(st, r, t, stepDur);
  }
}
_scoreCommit(t, s) {
  const sc = this.score, sec = sc.sections[this.want];
  const first = !this.sec;
  if (!sec) { this.want = null; return; }
  this.sec = sec; this.secStep = s; this.hush = false; this.stingPre = false;
  const hit = first ? null : sc.stings[this.sting || sec.sting];
  if (hit && hit.hit) this._playSting(hit.hit, t);
  this.sting = null; this.want = sec.next ? null : this.want;
}
_bossStem(st, r, t, stepDur) {
  const i = r % st.len;
  switch (st.kind) {
    case 'drums': { const c = st.pat[i]; if (c !== '.') this._drum(c, t); break; }
    case 'seq':   { const d = st.pat[i]; if (d !== null) this._bossNote(st, d, t, stepDur * st.gate); break; }
    case 'notes': { const ns = st.at[i]; if (ns) for (const n of ns) this._bossNote(st, n[0], t, stepDur * n[1], n[2]); break; }
    case 'chords': if (i % st.every === 0) {
      const ch = st.prog[(Math.floor(i / st.every) + (st.follow ? this._wardIdx() : 0)) % st.prog.length];
      for (const d of ch) this._bossNote(st, d, t, stepDur * st.every); } break;
    case 'roll':  { const k = Math.min(1, (r - this.exitAt) / st.len); this._roll(t, stepDur, k); break; }
  }
}
_bossNote(st, deg, t, dur, vel = 1) {                       // dispatch to the instrument recipe
  const sc = this.score, f = degFreq(sc.scale, st.base === 'low' ? sc.low : sc.mid, deg + (st.oct || 0) * sc.scale.length);
  const dest = st.bus === 'rhy' ? this.scoreRhy : this.scoreSus, g = st.gain * vel;
  switch (st.voice) {
    case 'brass':  this._mBrass({ freq: f, dur, gain: g, when: t, dest, ...st.p }); break;
    case 'str':    this._mStr({ freq: f, dur, gain: g, when: t, dest, ...st.p }); break;
    case 'choir':  this._mChoir({ freq: f, dur, gain: g, when: t, bank: this.layer.bank, ...st.p }); break;
    case 'organ':  this._mOrgan({ freq: f, dur, gain: g, when: t, dest, ...st.p }); break;
    case 'bell':   this._mBell({ freq: f, gain: g, when: t, dest: this.arpBus, ...st.p }); break;   // echo send
    case 'sub':    this._mTone({ wave: 'sine', freq: f, dur, gain: g, attack: 0.01, when: t, dest, sus: 0.9, prio: 0 }); break;
  }
}
_drum(c, t) {                                               // X big, x big soft, o small, r rim, s snare, g ghost, h shaker, a anvil, t timpani, T timpani soft, K kick
  const d = this.scoreRhy, f0 = this.score.drum;
  switch (c) {
    case 'X': this._mTaiko({ when: t, dest: d, f0, vel: 1 }); break;
    case 'x': this._mTaiko({ when: t, dest: d, f0, vel: 0.6 }); break;
    case 'o': this._mTaiko({ when: t, dest: d, f0: f0 * 1.5, vel: 0.55, kind: 'small' }); break;
    case 'r': this._mTaiko({ when: t, dest: d, kind: 'rim', vel: 1 }); break;
    case 't': this._mTaiko({ when: t, dest: d, f0, vel: 0.9, kind: 'timp' }); break;
    case 'T': this._mTaiko({ when: t, dest: d, f0, vel: 0.5, kind: 'timp' }); break;
    case 's': this._mSnare({ when: t, dest: d }); break;
    case 'g': this._mSnare({ when: t, dest: d, vel: 0.35 }); break;
    case 'h': this._mNoise({ dur: 0.04, gain: 0.07, attack: 0.002, filterType: 'highpass', freqStart: 6500, when: t, dest: d, prio: 2 }); break;
    case 'a': this._mBell({ freq: 1245, ratio: 2.76, index: 2, dur: 0.7, gain: 0.08, when: t, dest: d, prio: 1 }); break;
    case 'K': this._mTone({ wave: 'sine', freq: 110, freqEnd: 40, sweep: 0.08, dur: 0.3, gain: 0.5, attack: 0.002, when: t, dest: d, prio: 0 }); break;
  }
}
_playSting(list, t, fit = 1) {                              // items: {at (s), fn, p}; p.dur === 'fit' => remaining pre time
  for (const it of list) {
    const w = t + (it.at || 0), p = it.p && it.p.dur === 'fit' ? { ...it.p, dur: fit } : it.p;
    switch (it.fn) {
      case 'impact': this._mImpact({ when: w, dest: this.scoreRhy, ...p }); break;
      case 'riser':  this._mRiser({ when: w, dest: this.scoreSus, ...p }); break;
      case 'brass':  this._mBrass({ when: w, dest: this.scoreSus, prio: 0, ...p }); break;
      case 'choir':  this._mChoir({ when: w, bank: this.layer && this.layer.bank, prio: 0, ...p }); break;
      case 'organ':  this._mOrgan({ when: w, dest: this.scoreSus, prio: 0, ...p }); break;
      case 'bell':   this._mBell({ when: w, dest: this.arpBus, prio: 1, ...p }); break;
      case 'drum':   this._drum(p.c, w); break;
    }
  }
}
```
Compile once at load (`_compileScore`): turn pattern arrays into `{kind, pat, len, at: Map step->[[deg,len,vel]], base, bus, ...}` objects, resolve each section's `stems` to arrays, default `bar/beat/quant/bpm` from the score, so the audio thread path allocates nothing.
Victory/defeat helpers: `_scoreWin()` (called from `enemyKilled` boss): `scoreBus.gain` ramp to 0.0001 over 60 ms, then `_playSting(stings.win.hit, now + silence)`, set `this.winUntil = now + silence + stings.win.len`, set `mode = 'shift'` (non-final) after `winUntil` or leave `mode` boss until `runEnd` for final; restore `scoreBus.gain` to 1 on the next `_scoreStart`.

### 3.4 Gameplay contract (boss side, small)
* `boss.musicState`: `'p1' | 'inter1' | 'p2' | 'inter2' | 'p3'`; `boss.stateLeft` seconds for timed states; `boss.downed` bool; `boss.enrage` 0..1; `boss.check` (`'warhorn'|null`).
* Events: `bossTell {kind, t}` at every telegraph start (kind = slam, volley, summon, charge, ring, meteor, beams, shardrain...), `bossImpact {kind, power 0..1}` when it resolves, `bossWard {ward, idx}` (Aurelith). Used for ducks/hush (5), not for note triggering.
* Hold `_beginShift` ~2.5-3 s after a non-final boss kill, or accept the <= 2.4 s resolutions below.

## 4. The three scores
Notation: scale degrees index into `scale` (wrap by octave, negative = down; `degFreq` works for any scale length, so pentatonic/hexatonic need no code). `notes`: `[step, deg, lenSteps, vel?]`. Bass `seq` arrays: degree or `null` per 16th. Drum strings: one char per 16th (see `_drum`). A pattern's length = steps per bar x bars; sections loop it. "p" blocks are instrument params passed to the voice.

Authoring conventions for the data below: a section's `stems: { stemName: patName }` value `'on'` means "the stem's default pattern" (the chord progression, or a held pedal); pattern names that are not spelled out (`intro`, `drone`, `echo`, `cluster`, `fast`, `cascadeUp`, `snareRoll`, `snareRollExit`, `themeHalf`, `pedalC`, `roll16`, `roll`, `exit`) are one-line variants to author at implementation (a held note, the call at half density, a stacked whole-tone cluster, chords every 8 steps, a 16th snare crescendo, etc.). `roll`-kind stems are crescendos driven by `exitAt` (gated by `when: 'exit'`). A stem with `scaleOverride: 'whole'` resolves its degrees through `SCALE_WHOLE` instead of the score scale. `inter` has `bars: 0` = loop until the game changes `musicState`.

### 4.1 GORRAK, the Troll King: "Hollow Throne" (primal / tribal)
Identity: no third anywhere (open F-C fifths, the "bone" sound), 6/8 hemiola stomp, taiko chest-beats, a bone horn calling and a male chant answering. Act I is D dorian/84 bpm/sine arp; this is F minor pentatonic/150 bpm/saw+drum, nothing shared.
```js
const SCALE_PENT_MIN = [0, 3, 5, 7, 10];
const GORRAK = {
  key: 'boss:gorrak', boss: true, id: 'hollowWarden',
  bpm: 150, bar: 12, beat: 6, quant: 12,            // 6/8: dotted-quarter = 0.6 s, bar = 1.2 s
  scale: SCALE_PENT_MIN, low: 87.31, mid: 174.61, rootLow: 87.31,   // F2 / F3
  drum: 87.31, droneCut: 240, level: 1, echo: 0.3,
  bed: { drone: [['sawtooth', 1, -9, 0.10], ['sawtooth', 1.5, 6, 0.06], ['triangle', 0.5, 0, 0.16]], vowel: 'o' },
  stems: {                                           // recipes
    drums: { kind: 'drums', bus: 'rhy' },
    shake: { kind: 'drums', bus: 'rhy', hushable: true },
    bass:  { kind: 'seq', voice: 'brass', base: 'low', bus: 'rhy', gain: 0.11, gate: 2,
             p: { n: 2, spread: 10, open: 3, settle: 1.6, attack: 0.02, slide: 0.5, sus: 0.5 } },
    horn:  { kind: 'notes', voice: 'brass', base: 'mid', bus: 'sus', gain: 0.09,
             p: { n: 2, spread: 14, open: 2.6, settle: 1.8, attack: 0.07, slide: 2 } },
    chant: { kind: 'notes', voice: 'choir', base: 'low', oct: 1, bus: 'sus', gain: 0.10, hushable: true,
             p: { attack: 0.02, rel: 0.08, voices: 2 } },
    burn:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 1, bus: 'sus', gain: 0.07, when: 'downed', p: { n: 2, attack: 0.03 } },
  },
  pats: {
    drumsP1: 'X.o.o.x.o.o.' + 'X.o.o.X.o.xo',                       // 2 bars: stomp on 1 and 4, weak 8ths between
    drumsP2: 'X.o.xoX.o.xo' + 'X.xoxoXxoxxo',
    drumsP3: 'XoxoxoXoxoxo' + 'XoxoxoXoxoxx',
    heart:   'X.....x.....' + '............',                         // intermission: lub-dub every 2 bars
    shakeP1: 'h.h.h.h.h.h.', shakeP2: 'hhhhhhhhhhhh',
    bassP1:  [0,null,null,null,null,null, 0,null,null,0,null,-1],     // F . . . . . F . . F . Eb
    bassP2:  [0,null,0,null,-1,null, 0,null,3,null,-1,null],
    bassP3:  [0,0,null,0,-1,0, 0,0,null,0,3,-1],                       // gallop
    pedal:   [0,null,null,null,null,null,null,null,null,null,null,null],
    call:  [[0,3,5],[6,2,3],[9,0,3],[12,3,6],[18,4,3],[21,3,3]],       // C4(5) Bb3 F3 | C4(6) Eb4 C4  = falling call
    call2: [[0,5,5],[6,4,3],[9,3,3],[12,5,6],[18,7,3],[21,5,3]],       // answer an octave up, then parallel fifths in P3
    chantP1: [[4,0,2],[10,0,2],[16,3,2],[22,0,2]],                      // "huh" stabs on the weak 8ths
    burnP:   [[0,5,3],[6,7,3],[12,5,3],[18,7,3]],
  },
  sections: {
    intro: { bars: 2, next: 'p1', bpm: 150, stems: { horn: 'intro', drums: 'roll16' } },   // horn long C, taiko roll in, hit on p1 bar 1
    p1:    { bars: 8, bpm: 150, stems: { drums: 'drumsP1', bass: 'bassP1', horn: 'call', chant: 'chantP1', shake: 'shakeP1', burn: 'burnP' } },
    inter: { bars: 0, bpm: 120, stems: { drums: 'heart', bass: 'pedal', chant: 'drone', horn: 'echo', roll: 'exit' } },
    p2:    { bars: 8, bpm: 160, stems: { drums: 'drumsP2', bass: 'bassP2', horn: 'call2', chant: 'chantP1', shake: 'shakeP2', burn: 'burnP' } },
    p3:    { bars: 8, bpm: 168, stems: { drums: 'drumsP3', bass: 'bassP3', horn: 'call2', chant: 'chantP1', shake: 'shakeP2', burn: 'burnP' } },
  },
  sectionSting: { inter: 'inter', p2: 'phase', p3: 'phase' },
  stings: {   // times in seconds; hits go to scoreRhy/scoreSus
    summon: { hit: [ { fn: 'impact', p: { f0: 80, f1: 34, dur: 1.8 } },
                     { fn: 'brass', at: 0.05, p: { freq: 130.8, dur: 1.4, gain: 0.1, attack: 0.1, n: 2, slide: 3 } } ] },
    inter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 90, f1: 300 } } ],
              hit: [ { fn: 'impact', p: { f0: 70, f1: 30, dur: 2 } }, { fn: 'drum', at: 0, p: { c: 'X' } } ] },
    phase:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 110, f1: 440 } } ],
              hit: [ { fn: 'impact', p: { f0: 90, f1: 32, dur: 1.4 } },
                     { fn: 'brass', p: { freq: 174.6, dur: 0.9, gain: 0.11, n: 3, slide: 2, attack: 0.04 } },
                     { fn: 'drum', at: 0.15, p: { c: 'X' } }, { fn: 'drum', at: 0.3, p: { c: 'X' } } ] },
    win:    { len: 2.4, silence: 0.35, hit: [   // dying heartbeat + horn settles on the open fifth F-C
              { fn: 'brass', at: 0.35, p: { freq: 130.8, dur: 1.9, gain: 0.1, attack: 0.15, n: 2, slide: 3.5, sus: 0.7 } },
              { fn: 'choir', at: 0.45, p: { freq: 87.31, dur: 1.8, gain: 0.1, attack: 0.3 } },
              { fn: 'choir', at: 0.45, p: { freq: 130.81, dur: 1.8, gain: 0.08, attack: 0.3 } },
              { fn: 'drum', at: 0.35, p: { c: 'X' } }, { fn: 'drum', at: 1.05, p: { c: 'x' } }, { fn: 'drum', at: 1.95, p: { c: 'x' } } ] },
  },
};
```
* **Layers by phase:** P1 = stomp drums + bass stomp + horn call every 2 bars + chant stabs + light shaker. P2 (Gorrak's tribe arrives) = tempo 160, drums double, horn moves up an octave, shaker 16ths. P3 "Troll Rage" = 168 bpm, 16th gallop bass, taiko almost every step, horn in parallel fifths (`n` -> add a second `horn` stem at deg+2... or just call the same notes with `p.n = 3`).
* **Intermission (Timberfall / King's Wrath):** drums stop-down to a lub-dub heartbeat every 2 bars (the chest-beat), bass on a held F, chant holds an F-C fifth in `u` (via `_setVowel(bank,'u')`), the horn echoes the last call; when `stateLeft < 2 bars` the `roll` stem crescendos taiko hits into the exit sting.
* **Downed / break-check / enrage:** `burn` stem (horn up-octave, 3 s motif) during Downed. War-horn cast: hush shaker + chant, riser 5 s. Enrage: tempo up to +12 %, shaker 16ths, `stems.rage` (extra) = distorted horn stab on every dotted beat.
* **Mix lane:** tell tone should avoid F+C overtones; ~2-4 kHz is clear (notch).

### 4.2 VASHKAR, the Ashen Warchief: "Ashen March" (martial / brutal)
Identity: C phrygian-dominant (b2 and a MAJOR 3rd = augmented second, the "war-banner" snake), 4/4 half-time march at 138 bpm, snare + low war drums, three-saw low brass riff, anvil on the off beats, **P3 drops to 7/8 (2+2+3)** so the march "loses its footing". Cinder (Act II) is E phrygian, 96 bpm, sine/triangle arp: no overlap.
```js
const SCALE_PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];            // C Db E F G Ab Bb
const VASHKAR = {
  key: 'boss:vashkar', boss: true, id: 'vashkar',
  bpm: 138, bar: 16, beat: 4, quant: 8,                    // bar = 1.74 s, commit on the half bar
  scale: SCALE_PHRYG_DOM, low: 65.41, mid: 261.63, rootLow: 65.41, drum: 65.41, droneCut: 280, level: 1, echo: 0.326,
  bed: { drone: [['sawtooth', 1, -12, 0.10], ['sawtooth', 1.5, 9, 0.05], ['sine', 0.5, 0, 0.18]], vowel: 'A', noiseCrackle: true },
  stems: {
    drums: { kind: 'drums', bus: 'rhy' },
    low:   { kind: 'seq', voice: 'brass', base: 'low', oct: 0, bus: 'rhy', gain: 0.12, gate: 3,
             p: { n: 3, spread: 12, open: 4.5, settle: 1.8, Q: 3, attack: 0.02, slide: 0.3, sus: 0.6 } },
    str:   { kind: 'seq', voice: 'str', base: 'low', oct: 1, bus: 'sus', gain: 0.08, gate: 1, hushable: true, p: { cut: 1300 } },
    banner:{ kind: 'notes', voice: 'brass', base: 'mid', bus: 'sus', gain: 0.085,
             p: { n: 3, spread: 9, open: 5, settle: 2.2, attack: 0.04, slide: 0.35 } },
    choir: { kind: 'chords', voice: 'choir', base: 'low', oct: 1, bus: 'sus', gain: 0.07, every: 16, prog: [[0,4],[1,5],[0,4],[6,4]], p: { attack: 0.4, voices: 2 } },
    anvil: { kind: 'drums', bus: 'rhy', when: 'enrage' },
    burn:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 1, bus: 'sus', gain: 0.07, when: 'downed', p: { n: 2 } },
  },
  pats: {
    // 16 steps / bar. p1: half-time march. p2: double-time with snare rolls + ghost notes. 7/8 = 14 steps.
    drumsP1: 'X...o...s...o.x.' + 'X.o.o...s..xs.o.',
    drumsP2: 'X.s.s.s.X.s.sxs.' + 'X.sgs.s.X.sgsxsg',
    drumsP3: 'X.o.X.o.s.xos.'  + 'X.o.X.o.s.sgsx',           // 7/8 = 2+2+3 eighths: strong at 0, 4, 8
    anvilP:  'a.......a.......',
    lowP1:   [0,null,null,0,null,0,null,null, 0,null,1,null,0,null,null,null],      // C . . C . C . . C . Db . C
    lowP2:   [0,null,0,0,null,0,1,null, 0,null,0,0,2,null,1,null],                    // E (aug-2 above Db) snakes
    lowP3:   [0,null,0,null,1,null,0,null, 0,0,1,null,2,null],                        // 14 steps
    strP2:   [0,0,0,0,0,0,0,0, 0,0,0,0,1,1,0,0],                                      // 16th spiccato C pedal
    theme: [[0,5,5],[6,1,1],[8,2,3],[12,1,2],[14,0,2],[16,0,4],[20,1,2],[22,2,2],[24,3,4],[28,2,2],[30,1,2]],  // 2 bars: C . Db E Db C | C Db E F E Db
    themeP3: [[0,3,3],[4,2,2],[6,1,2],[8,0,6]],                                        // 7/8 stabbed, 14 steps
  },
  sections: {
    intro: { bars: 2, next: 'p1', bpm: 138, stems: { drums: 'snareRoll', banner: 'themeHalf', low: 'pedalC' } },
    p1:    { bars: 8, bpm: 138, stems: { drums: 'drumsP1', low: 'lowP1', banner: 'theme', choir: 'on', burn: 'theme', anvil: 'anvilP' } },
    inter: { bars: 0, bpm: 138, stems: { low: 'pedalC', choir: 'on', str: 'strP2', drums: 'snareRollExit' } },
    p2:    { bars: 8, bpm: 144, stems: { drums: 'drumsP2', low: 'lowP2', str: 'strP2', banner: 'theme', choir: 'on', burn: 'theme', anvil: 'anvilP' } },
    p3:    { bars: 8, bpm: 150, bar: 14, beat: 4, quant: 14, stems: { drums: 'drumsP3', low: 'lowP3', str: 'strP2', banner: 'themeP3', choir: 'on', anvil: 'anvilP' } },
  },
  sectionSting: { inter: 'inter', p2: 'phase', p3: 'meter' },
  stings: {
    summon: { hit: [ { fn: 'impact', p: { f0: 70, f1: 30, dur: 1.8 } },
                     { fn: 'brass', at: 0.02, p: { freq: 65.41, dur: 1.6, gain: 0.12, n: 3, attack: 0.05 } },
                     { fn: 'drum', at: 0.4, p: { c: 'a' } } ] },
    inter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 80, f1: 260 } } ],
              hit: [ { fn: 'impact', p: { f0: 75, f1: 30, dur: 2.2 } }, { fn: 'brass', p: { freq: 65.41, dur: 3, gain: 0.1, n: 3, attack: 0.12 } } ] },
    phase:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 100, f1: 500 } }, { fn: 'drum', at: 0, p: { c: 's' } } ],
              hit: [ { fn: 'impact', p: { f0: 85, f1: 30 } }, { fn: 'brass', p: { freq: 130.8, dur: 0.7, gain: 0.12, n: 3 } },
                     { fn: 'drum', p: { c: 'a' } } ] },
    meter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 100, f1: 600 } } ],     // then a bar of 7: the stumble IS the stinger
              hit: [ { fn: 'impact', p: { f0: 95, f1: 28, dur: 1.5 } }, { fn: 'brass', p: { freq: 98, dur: 0.8, gain: 0.12, n: 3 } } ] },
    win:    { len: 2.4, silence: 0.5, hit: [   // march stutters out; phrygian E (b2->3) lifts to a major C triad (Picardy), one gong
              { fn: 'drum', at: 0, p: { c: 's' } }, { fn: 'drum', at: 0.18, p: { c: 'g' } },
              { fn: 'brass', at: 0.5, p: { freq: 130.8, dur: 1.9, gain: 0.1, n: 3, attack: 0.2, sus: 0.8 } },
              { fn: 'brass', at: 0.5, p: { freq: 164.8, dur: 1.9, gain: 0.08, n: 2, attack: 0.2 } },
              { fn: 'brass', at: 0.5, p: { freq: 196.0, dur: 1.9, gain: 0.08, n: 2, attack: 0.2 } },
              { fn: 'drum', at: 0.55, p: { c: 'a' } }, { fn: 'impact', at: 0.5, p: { f0: 60, f1: 36, dur: 2, gain: 0.3 } } ] },
  },
};
```
* **P1 "Twin Banners":** half-time march (taiko on 1, snare on 3, small-tom fills), three-saw low brass riff, banner-brass theme every 2 bars, anvil on beat 1 + 3, choir `A` (bass "ah") holds a bar-long dyad per bar following the progression I - bII - I - bVII.
* **P2 "Cinder Memory":** 144 bpm, snare doubles with ghost notes, 16th spiccato pedal under the riff.
* **P3 "Warchief's Fury":** **7/8** at 150 (`bar: 14`), commit `quant 14`, with the `meter` stinger (riser then a bar that is one eighth short). Last-Stand "bare-hands" moment (doc 11): drop `low`/`banner`, keep drums + choir only.
* **Intermission (Ashfall / Molten Tide):** drums stop-down to a snare-roll crescendo only in the last two bars (`exit`), low brass pedal on C, choir holds, noise-crackle fire texture in the bed (a quiet looped noise through a 2 kHz highpass with random gain).
* **Enrage:** `anvil` every beat, tempo +12 %, `banner` octave up.
* **Fire/lava mix:** the world's lava `hazard` SFX is a lowpass rumble at 55 Hz: duck `low` + sub by 6 dB for 400 ms on every `hazard` lava event.

### 4.3 AURELITH, the Prism Dragon: "Prismatic Chorale" (majestic and dreadful, final boss)
Identity: organ pedal + soprano formant choir + FM crystal bells + timpani. Eb lydian (the raised fourth A natural against an Eb pedal is the dread tritone), a whole-tone shimmer layer in P2, chord = the active Prism Ward (4 wards = 4 chords, a ward is exactly 4 bars at 96 bpm), harmonic rhythm doubles in P3. Act III (Crown) is G lydian/104 bpm with a sine arp and `tick`; Aurelith uses no arp, no tick, different tonic, different timbres.
```js
const SCALE_WHOLE = [0, 2, 4, 6, 8, 10];
const AURELITH = {
  key: 'boss:aurelith', boss: true, id: 'riftHeart',
  bpm: 96, bar: 16, beat: 4, quant: 8,                    // bar = 2.5 s: ward cycle 10 s = 4 bars
  scale: SCALE_LYDIAN, low: 77.78, mid: 311.13, rootLow: 77.78, drum: 77.78, droneCut: 420, level: 1, echo: 0.3125,
  bed: { drone: [['sawtooth', 0.5, -6, 0.07], ['sawtooth', 0.5, 6, 0.07], ['triangle', 0.25, 0, 0.16]], vowel: 'a', lfo: { rate: 0.05, depth: 180 } },
  stems: {
    pedal: { kind: 'chords', voice: 'organ', base: 'low', bus: 'sus', gain: 0.07, every: 16, prog: [[0],[0],[0],[0]], p: { lp: 1800, attack: 0.3, rel: 0.8 } },
    organ: { kind: 'chords', voice: 'organ', base: 'mid', bus: 'sus', gain: 0.045, every: 16, follow: true, prog: [[0,2,4],[1,3,5],[5,7,9],[4,6,8]], p: { lp: 2600, attack: 0.15, rel: 0.6 } },
    choir: { kind: 'chords', voice: 'choir', base: 'mid', oct: 0, bus: 'sus', gain: 0.075, every: 16, follow: true, prog: [[0,2,4],[1,3,5],[5,7,9],[4,6,8]], p: { attack: 0.6, rel: 0.9, voices: 2 } },
    lead:  { kind: 'notes', voice: 'choir', base: 'mid', oct: 1, bus: 'sus', gain: 0.07, p: { attack: 0.08, rel: 0.4, voices: 2 } },
    brass: { kind: 'notes', voice: 'brass', base: 'low', oct: 1, bus: 'sus', gain: 0.08, p: { n: 3, spread: 8, open: 3.2, settle: 2, attack: 0.1, slide: 0.2 } },
    timp:  { kind: 'drums', bus: 'rhy' },
    bells: { kind: 'notes', voice: 'bell', base: 'mid', oct: 1, bus: 'sus', gain: 0.06, hushable: true, p: { dur: 2.2, ratio: 1.4, index: 5 } },
    shim:  { kind: 'notes', voice: 'bell', base: 'mid', oct: 2, bus: 'sus', gain: 0.04, hushable: true, scaleOverride: 'whole', p: { dur: 1.2, index: 3 } },
    burn:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 0, bus: 'sus', gain: 0.07, when: 'downed', p: { n: 2, attack: 0.04 } },
  },
  pats: {
    timpP1:  'T.......t.......' + 'T.......t...T...',
    timpP2:  't...T...t...T.t.' + 't...T...t.T.t.Tt',
    timpP3:  'ttTtttTttTtttTtt',
    lead: [[0,0,8],[8,2,4],[12,4,4],[16,3,10],[26,4,2],[28,2,4]],       // Eb G Bb | A(tritone, 10) Bb G
    leadP3: [[0,4,4],[4,6,4],[8,7,8],[16,6,4],[20,4,4],[24,3,8]],       // the hymn climbing to the top
    bellsP1: [[0,0,1],[8,2,1],[16,4,1],[24,3,1]],                        // lydian pings on the half notes (#4 = idx 3)
    shimP2:  [[2,0,1],[3,1,1],[4,2,1],[5,3,1],[6,4,1],[7,5,1],[10,3,1],[11,2,1],[12,1,1]],   // whole-tone cascade (scale override)
    brassP3: [[0,0,3],[4,0,3],[8,0,3],[12,0,3]],                         // pedal-point stabs
  },
  sections: {
    intro: { bars: 2, next: 'p1', stems: { pedal: 'on', choir: 'cluster', shim: 'cascadeUp' } },
    p1:    { bars: 8, bpm: 96,  stems: { pedal: 'on', organ: 'on', choir: 'on', lead: 'lead', bells: 'bellsP1', timp: 'timpP1', burn: 'lead' } },
    inter: { bars: 0, bpm: 96,  stems: { pedal: 'on', choir: 'cluster', shim: 'shimP2', timp: 'roll', bells: 'bellsP1' } },
    p2:    { bars: 8, bpm: 104, stems: { pedal: 'on', organ: 'on', choir: 'on', lead: 'lead', brass: 'brassP3', bells: 'bellsP1', shim: 'shimP2', timp: 'timpP2', burn: 'lead' } },
    p3:    { bars: 8, bpm: 112, stems: { pedal: 'on', organ: 'on', choir: 'fast', lead: 'leadP3', brass: 'brassP3', bells: 'bellsP1', shim: 'shimP2', timp: 'timpP3', burn: 'leadP3' } },
  },
  sectionSting: { inter: 'inter', p2: 'phase', p3: 'phase' },
  stings: {
    summon: { hit: [ { fn: 'impact', p: { f0: 70, f1: 30, dur: 2.5 } },
                     { fn: 'organ', at: 0.02, p: { freq: 155.6, dur: 3.5, gain: 0.09, attack: 0.5 } },
                     { fn: 'choir', at: 0.3, p: { freq: 311.1, dur: 3.2, gain: 0.08, attack: 0.9 } },   // Eb + A cluster: dread
                     { fn: 'choir', at: 0.3, p: { freq: 440.0, dur: 3.2, gain: 0.07, attack: 0.9 } },
                     { fn: 'bell', at: 1.2, p: { freq: 2489, dur: 2.6 } }, { fn: 'bell', at: 1.4, p: { freq: 3136, dur: 2.6 } } ] },
    inter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 150, f1: 900 } } ],
              hit: [ { fn: 'impact', p: { f0: 80, f1: 30, dur: 2.2 } }, { fn: 'organ', p: { freq: 311.1, dur: 3, gain: 0.08, attack: 0.3 } } ] },
    phase:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 120, f1: 700 } } ],
              hit: [ { fn: 'impact', p: { f0: 85, f1: 30 } }, { fn: 'brass', p: { freq: 155.6, dur: 1.2, gain: 0.1, n: 3, attack: 0.05 } },
                     { fn: 'bell', at: 0.05, p: { freq: 2093, dur: 2.5 } } ] },
    win:    { len: 8.5, silence: 0.9, hit: [   // 0.9 s of silence, then the dread resolves: A natural -> Bb, whole-tone cluster -> pure Eb major 9
              { fn: 'organ', at: 0.9, p: { freq: 155.6, dur: 7, gain: 0.09, attack: 0.5, rel: 2 } },
              { fn: 'choir', at: 1.0, p: { freq: 311.1, dur: 6.5, gain: 0.09, attack: 0.9, rel: 2 } },
              { fn: 'choir', at: 1.0, p: { freq: 392.0, dur: 6.5, gain: 0.08, attack: 0.9, rel: 2 } },
              { fn: 'choir', at: 1.0, p: { freq: 466.2, dur: 6.5, gain: 0.08, attack: 0.9, rel: 2 } },
              { fn: 'choir', at: 1.6, p: { freq: 587.3, dur: 5.9, gain: 0.06, attack: 0.9, rel: 2 } },   // 9th, shine
              { fn: 'bell', at: 2.0, p: { freq: 1244.5, dur: 3 } }, { fn: 'bell', at: 2.3, p: { freq: 1568, dur: 3 } },
              { fn: 'bell', at: 2.6, p: { freq: 1864.7, dur: 3 } }, { fn: 'bell', at: 2.9, p: { freq: 2489, dur: 4 } },
              { fn: 'drum', at: 4.4, p: { c: 'T' } } ] },
  },
};
```
* **Phase concept:** P1 "Refraction" = slow organ pedal + choir chords, ward-following chord every bar-of-4, lead hymn, half-time timpani, bells on the half notes. P2 "Storm Reach" = 104 bpm, timpani 8ths, brass pedal stabs, whole-tone shimmer cascade ("shard rain", doubled with the shard rain's 4 s cycle). P3 "Prismatic Overload" = 112 bpm, choir `fast` (chord every 8 steps = harmonic rhythm doubles), lead climbs, organ + brass full, timpani near-constant rolls.
* **Ward link:** `_wardIdx()` returns `game.boss.wardIdx`; chord `prog[wardIdx]` so fire = I (Eb), frost = II (F, major, the lydian signature), storm = vi (Cm), arcane = V (Bb). Because the commit grid is a half bar, the chord follows the visual ward change within <= 1.25 s; for tight sync emit `bossWard` and treat it as a `quant: 8` commit of the `chords` index only. Do not rely on the 10 s = 4 bars coincidence after phase tempo changes.
* **Intermission (Skyward / Shatterfall):** drums stop-down, pedal + vowel morph (`_setVowel(bank,'u')` -> `'a'` at exit), whole-tone cascade rising, last 2 bars timpani roll crescendo + riser; exit = organ + brass blast. During "Shatterfall" the cracking floor gets a bell glissando up the whole-tone scale.
* **Enrage (Rift Collapse backstop):** tempo +12 %, choir shifts to the screamed `a` octave, 16th timpani, organ through a mild waveshaper.
* **Victory (final):** runs under the victory overlay; make `runEnd` skip its generic arpeggio when `winUntil > now`. Resolution = the A natural of the leitmotif finally goes up to Bb (Eb major add9), choir `a`->`o`, bells in the Eb major pentatonic, the single soft timpani as full stop.

## 5. Mixing with SFX
Observed: SFX peak at ~0.1-0.25 per voice into `masterGain 0.5`; no telegraph SFX exists today (only `hazard`, `_roar`, `playerHit`); the master compressor (thr -30 dB, ratio 12, 3 ms attack) will be driven hard by a dense score and will visibly pump every SFX.
1. **Level targets (inf.):** score RMS ~ -24 dBFS, SFX transients ~ -12 dBFS, boss impacts ~ -8. Start `MUSIC_LEVEL` at 0.30 while `mode === 'boss'` (the score is denser than the act bed) and measure with an `AnalyserNode` on `musicBus` vs `masterGain` (`getFloatTimeDomainData`, RMS).
2. **Pre-compress the music, relax the master:** add a gentle compressor on `musicBus` output (thr -22, knee 24, ratio 2.5, att 20 ms, rel 300 ms) and raise the master compressor to thr -18 / ratio 4. Otherwise the score "breathes" SFX away. (needs ear + RMS A/B)
3. **Presence notch:** `scoreBus` peaking -3 dB at 3 kHz Q 0.9 (static) = the lane for player casts, hit blips, telegraph tells; drop another -3 dB while any `bossTell` is active (`bossTell` -> duck `scoreSus` to 0.7 for the tell length, restore 250 ms after).
4. **Event ducks (no sidechain input exists in Web Audio, so drive gain from events [12][19]):**
```js
duckScore(depth = 0.5, { att = 0.02, hold = 0.12, rel = 0.35, bus = 'sus' } = {}) {
  const g = (bus === 'rhy' ? this.scoreRhy : this.scoreSus)?.gain; if (!g || !this.ctx) return;
  const now = this.ctx.currentTime;
  g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);   // no cancelAndHoldAtTime: Firefox lacks it
  g.setTargetAtTime(depth, now, att / 3);
  g.setTargetAtTime(1, now + att + hold, rel / 3);
}
```
   | event | ducks | depth / att / hold / rel |
   |---|---|---|
   | `bossImpact` (slam, ring, meteor, beam start) | `sus` | 0.45 / 15 ms / 120 ms / 350 ms ("pump" on the hit; the drum that matches stays loud) |
   | `bossPhase` roar (`_roar`) | `sus` + `rhy` (bass only) | 0.3 / 20 ms / 700 ms / 500 ms, and `hush` (drums out) |
   | `playerHit` (> 10 % maxHp) | `sus` | 0.6 / 10 ms / 80 ms / 250 ms |
   | `hazard` lava | `rhy` bass/sub (`low` stem gain only) | 0.5 / 30 ms / 300 ms / 400 ms |
   | `bossTell` lethal shape | high percussion stems (`h`, `a`) mute for the tell | gate `hushable` stems |
   | `levelup`/pause (existing) | whole `musicBus` | unchanged (0.6 / 0.7) |
5. **Spectral ownership:** < 120 Hz = bass/sub/taiko (only these may be ducked by the roar); 120-800 = brass/organ/choir body; 800-2900 = choir F1-F3 and snare: this overlaps player spell timbres, hence the notch; > 5 kHz = shaker/bells (ornament prio, first to be dropped by the voice cap).
6. **Voice stealing priority** (higher survives): tells > player hit > stingers > downbeat drums > bass > choir/brass > bells/shaker. The score's own cap is separate from the SFX cap (`activeVoices` 24); keep both.
7. **Never mask a telegraph:** while a damaging telegraph fills, (a) no new stinger riser longer than 1 beat, (b) no choir attack < 0.1 s, (c) the 2.4-5 kHz band stays free of score notes except the `bells` (which ring slowly, low gain). Telegraph tell tones for the future SFX pass: a short rising two-tone at 1760/2349 Hz for Gorrak, a saw "hiss" sweep 400 -> 1500 for Vashkar, a high glass ping 2637 Hz for Aurelith, each 0.15 s so the score never needs to compete.
8. **Mute/modal/pause:** keep `duck`/`holdDuck` behaviour on `musicBus`; `this.muted` already short-circuits note scheduling but the section state machine continues (stay in sync when unmuted).

## 6. Verification plan (no human ear required for first passes)
* **Offline render test:** `new OfflineAudioContext(2, 44100*30, 44100)`, instantiate the voice helpers against it, call `_playBossStep(t, n)` for N steps with explicit `t`, `startRendering()`, then report peak, RMS and a cheap spectrum (per-band energy) per section; track a high-water mark of `musicVoices` (assert <= 30) and section transitions at the expected times.
* **In-engine:** add `game.audio.debugScore(id, state)` to jump to a section; with the sim/playtest harness spawn each boss and force `musicState` through p1/inter/p2/inter/p3/win while logging `musicVoices`, `this.sec.name`, scheduler lateness (`nextStepTime - ctx.currentTime` should stay > 0).
* Tune by ear last: choir make-up gain (`out.gain` 2.2), notch depth, hush length, kick/snare levels. Check on laptop speakers and headphones.
* Edge cases to test: boss killed in the middle of a stinger; death during `inter`; tab hidden for 10 s (scheduler resync must not burst notes); unmute mid-section; `quitToTitle` mid-fight (set `mode='title'`, `voiceCap = 14`, `score = null`); boss spawned while `modalHoldUntil` active.

## Sources
1. A tale of two clocks (Chris Wilson): https://web.dev/articles/audio-scheduling (25 ms timer / ~100 ms lookahead; JS timers skew by 10 ms+)
2. Adaptive music beginner's guide (vertical layering, horizontal re-sequencing, quantised transitions, stingers masking the seam): https://bugnet.io/blog/adaptive-music-a-beginners-guide
3. ADX2 horizontal sequencing (transition at bar boundaries): https://blog.criware.com/?p=2907
4. Adaptive music in competitive games: https://www.gamedeveloper.com/audio/adaptive-music-in-competitive-games ; horizontal re-sequencing glossary https://sounddesign.irpr.agency/glossary/horizontal-resequencing/
5. Brass programming guide (detuned saws, filter-envelope blat, sub-osc): https://www.soundonsound.com/techniques/creating-analogue-sounds-digital-synths-part-3 ; https://www.bonedo.de/artikel/brass-sounds-auf-dem-synthesizer-bauen
6. Syntorial brass recipe (4 voices, 9 cents detune): https://www.syntorial.com/preset-recipe/van-halen-jump-brass/
7. Csound formant values appendix (bass/tenor/alto/soprano a, o, u): https://csound.com/docs/manual/MiscFormants.html
8. Web Audio vowel/formant bandpass demos: https://github.com/AppGeo/web-audio-examples ; https://github.com/tmhglnd/vowel-formants-graph ; Sound on Sound formant synthesis https://www.soundonsound.com/techniques/formant-synthesis
9. Hammond drawbar harmonics (1,2,3,4,6,8,10,12,16): https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/instruments/chapter_7_section_14.html ; `createPeriodicWave`: https://developer.mozilla.org/docs/Web/API/BaseAudioContext/createPeriodicWave
10. Timpani partials ~1.00:1.50:1.98:2.44 (Sound on Sound, practical percussion synthesis: timpani): https://www.soundonsound.com/techniques/practical-percussion-synthesis-timpani
11. FM bell (non-integer ratio, decaying index; ratio 5:7): Chowning 1973 https://web.eecs.umich.edu/~fessler/course/100/misc/chowning-73-tso.pdf ; Max FM tutorial https://docs.cycling74.com/api/latest/max8/tutorials/06_synthesischapter05
12. Ducking via gain automation (Packt recipe): https://www.packtpub.com/en-CZ/learning/how-to-tutorials/automating-audio-parameters-how-it-works ; `setTargetAtTime`: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime
13. Kick/taiko layers (sine sweep + short attack + highpassed noise click): https://app.cinevva.com/tutorials/tone-js-game-audio
14. Trailer/boss cue vocabulary (low brass, string ostinato, taiko, choir for the peak, stop-down): https://www.youngcomposers.com/t31542/creating-fast-paced-epictrailer-music/
15. Modes: lydian https://markslater.net/unlocking-the-power-of-the-lydian-mode/ ; phrygian https://emastered.com/ro/blog/phrygian-mode
16. Web game audio performance (rough voice-count estimates, unverified): https://www.abratabia.com/web-game-audio/audio-performance.php
17. Web Audio performance notes (Padenot): https://padenot.github.io/web-audio-perf/
18. Phased boss-music packs (intro/loops/stingers/outro, dual-phase to 8 states): https://intersonic-sound.itch.io/dark-fantasy-music-boss-battles
19. WAA clock / scheduling background: https://github.com/sebpiq/WAAClock
