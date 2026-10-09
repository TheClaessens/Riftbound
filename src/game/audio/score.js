// =====================================================================================
//  Boss score engine (design/research/12-boss-scores.md section 3). Mixed into Audio.prototype.
//  A "stem matrix" state machine that rides the existing lookahead scheduler:
//    - sections (intro / p1 / inter / p2 / p3) are committed on a quantisation grid (bar or half bar)
//    - a phase change = hush -> riser ("pre", fitted to the time left) -> hit on the new downbeat
//    - overlays (not sections): Downed, Break Check, enrage, Echo ghost, Rift Mend hold, ward chord follow
//    - victory = cut -> silence beat -> resolution; defeat = tape stop
//  Everything is event driven (RAID.md events) with a poll of game.boss.musicState as a fallback.
// =====================================================================================
import { SCORES, BOSS_KEY, WARD_INDEX, degFreq } from './scores.js';

export const BOSS_MAX_VOICES = 26;
export const BOSS_MUSIC_LEVEL = 0.30;
const MUSIC_STATE = { p1: 'p1', inter: 'inter', inter1: 'inter', inter2: 'inter', p2: 'p2', p3: 'p3' };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

let subCurve = null;
function getSubCurve() {
  if (!subCurve) {
    subCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) subCurve[i] = Math.tanh(3 * ((i * 2) / 1024 - 1));
  }
  return subCurve;
}

export const SCORE = {
  // ------------------------------------------------------------------ state
  _now() { return this.offline ? this.clock : (this.ctx ? this.ctx.currentTime : 0); },

  _scoreInitState() {
    this.voiceHigh = 0;
    this.voiceDrops = 0;
    this.voiceCap = this.voiceCapAct;
    this.lite = false;
    this.score = null;          // compiled score (a THEMES entry with boss: true)
    this.sec = null;            // compiled current section
    this.secStep = 0;           // sstep at which the current section started
    this.sstep = 0;             // score-local 16th counter
    this.want = null;           // section requested, committed on the quantisation grid
    this.sting = null;          // stings key played around the pending commit
    this.stingPre = false;
    this.hush = false;
    this.bpmCur = 90;
    this.bank = null;           // shared formant bank (choir)
    this.vowel = null;
    this.downed = false; this.downedUntil = 0;
    this.enrage = 0;
    this.exitSoon = false; this.exitRiser = false; this.rollK = 0; this.interEnd = 0;
    this.echoMode = false;
    this.holdUntil = 0;         // Rift Mend: stems silent until then
    this.check = null;          // Break Check overlay { until, rg }
    this.wardIdx = 0; this.wardKick = false;
    this.winUntil = 0; this.scoreDeadline = 0; this.tape = false;
    this.sealAt = 0;
    this.lastImpactDuck = -9;
    this.scoreLog = []; this.lastLog = 0; this.solo = null;
    this.scoreBus = this.scoreSus = this.scoreRhy = this.scoreBells = this.scoreLP = null;
  },

  _log(ev, info) {
    const l = this.scoreLog;
    this.lastLog = this._now();
    l.push({ t: Math.round(this.lastLog * 100) / 100, ev, info: info ?? null });
    if (l.length > 160) l.shift();
  },

  // Buses: sustains | drums+bass | bells  ->  scoreBus -> 3 kHz presence notch -> tape-stop lowpass -> glue compressor -> musicBus
  _initScoreGraph() {
    const ctx = this.ctx;
    const g = () => ctx.createGain();
    this.scoreSus = g(); this.scoreRhy = g(); this.scoreBells = g(); this.scoreBus = g();
    const notch = ctx.createBiquadFilter();
    notch.type = 'peaking'; notch.frequency.value = 3000; notch.Q.value = 0.9; notch.gain.value = -3;
    this.scoreLP = ctx.createBiquadFilter();
    this.scoreLP.type = 'lowpass'; this.scoreLP.frequency.value = 18000; this.scoreLP.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 24; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.3;
    this.scoreComp = comp;
    this.scoreSus.connect(this.scoreBus);
    this.scoreRhy.connect(this.scoreBus);
    this.scoreBells.connect(this.scoreSus);
    // bells also feed the shared echo send (dotted-8th delay)
    const send = g(); send.gain.value = 0.55;
    this.scoreBells.connect(send);
    if (this.echoIn) send.connect(this.echoIn);
    // parallel sub send: a gentle waveshaper makes 40 Hz hits audible on laptop speakers (2nd/3rd harmonics)
    const shaper = ctx.createWaveShaper(); shaper.curve = getSubCurve();
    const subLp = ctx.createBiquadFilter(); subLp.type = 'lowpass'; subLp.frequency.value = 260;
    const subG = g(); subG.gain.value = 0.2;
    this.scoreRhy.connect(shaper); shaper.connect(subLp); subLp.connect(subG); subG.connect(this.scoreBus);
    this.scoreBus.connect(notch); notch.connect(this.scoreLP); this.scoreLP.connect(comp); comp.connect(this.musicBus);
  },

  _scoreBusReset(now) {
    if (!this.scoreBus) return;
    const set = (p, v) => { p.cancelScheduledValues(now); p.setValueAtTime(v, now); };
    set(this.scoreBus.gain, 1); set(this.scoreSus.gain, 1); set(this.scoreRhy.gain, 1);
    set(this.scoreLP.frequency, 18000);
    if (this.echoOut) set(this.echoOut.gain, 1);
    if (this.echoFeedback) set(this.echoFeedback.gain, 0.42);
    this.tape = false;
  },

  // ------------------------------------------------------------------ bed (drone + lfo + crackle)
  _buildBossBed(th, now, fade) {
    const ctx = this.ctx;
    const layer = { th, gain: ctx.createGain(), nodes: [], pads: null, stopAt: 0 };
    layer.gain.gain.setValueAtTime(0, now);
    layer.gain.gain.linearRampToValueAtTime(th.level, now + Math.max(0.05, fade));
    layer.gain.connect(this.scoreSus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = th.droneCut; lp.Q.value = 0.8;
    lp.connect(layer.gain);
    layer.nodes.push(lp);
    for (const [type, mult, detune, gain] of th.bed.drone) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = th.rootLow * mult; o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(lp); o.start(now);
      layer.nodes.push(o, g);
    }
    if (th.bed.lfo) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = th.bed.lfo.rate;
      const depth = ctx.createGain(); depth.gain.value = th.bed.lfo.depth;
      lfo.connect(depth); depth.connect(lp.frequency); lfo.start(now);
      layer.nodes.push(lfo, depth);
    }
    if (th.bed.crackle && this.noiseBuffer) {        // fire texture: quiet gated noise, 5-8 kHz (clear of the 2-4 kHz lane)
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
      const cg = ctx.createGain(); cg.gain.value = 0.006;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7.3;
      const ld = ctx.createGain(); ld.gain.value = 0.005;
      lfo.connect(ld); ld.connect(cg.gain);
      src.connect(hp); hp.connect(cg); cg.connect(layer.gain);
      src.start(now); lfo.start(now);
      layer.nodes.push(src, hp, cg, lfo, ld);
    }
    return layer;
  },

  // ------------------------------------------------------------------ lifecycle
  _startScore(key, echo = false) {
    const sc = SCORES[key];
    if (!sc || !this.ctx || !this.scoreBus) return false;
    const now = this._now();
    if (this.bank) { this._disposeBank(this.bank); this.bank = null; }
    this._scoreBusReset(now);
    this.score = sc; this.mode = 'boss'; this.voiceCap = BOSS_MAX_VOICES;
    this.sec = null; this.sstep = 0; this.secStep = 0;
    this.want = echo ? 'p2' : 'intro'; this.sting = null; this.stingPre = false; this.hush = false;
    this.bpmCur = echo ? sc.sec.p2.bpm : sc.bpm;
    this.downed = false; this.downedUntil = 0; this.enrage = 0; this.exitSoon = false; this.exitRiser = false;
    this.echoMode = !!echo; this.holdUntil = 0; this.check = null; this.wardIdx = 0; this.wardKick = false;
    this.winUntil = 0; this.scoreDeadline = 0; this.tape = false;
    this.bank = this._makeBank(this.scoreSus, sc.bed.vowel);
    this.vowel = sc.bed.vowel;
    if (this.layerKey !== sc.key) this._switchLayer(sc.key, now, 0.2);
    const st = sc.stings[echo ? 'echo' : 'summon'];
    this._playSting(st.hit, now + 0.06);
    this._log('start', { key, echo });
    return true;
  },

  // The Echo rises: score continues (bank + bed kept), re-enters P2 with the detuned ghost layer.
  _scoreEcho() {
    const sc = this.score, now = this._now();
    this.echoMode = true; this.holdUntil = 0; this.sec = null; this.want = 'p2'; this.sting = null;
    this.hush = false; this.stingPre = false; this.bpmCur = sc.sec.p2.bpm; this.enrage = 0;
    this.downed = false; this.downedUntil = 0; this.check = null;
    this._scoreBusReset(now);
    this._playSting(sc.stings.echo.hit, now + 0.05);
    this._log('echo', null);
  },

  _leaveScore(grace) {
    this.scoreDeadline = Math.max(this.scoreDeadline, this._now() + grace);
  },

  // Quit to title / act start mid fight: fade the score out fast, free it shortly after.
  _abortScore(now) {
    if (!this.scoreBus) return;
    const g = this.scoreBus.gain;
    g.cancelScheduledValues(now); g.setTargetAtTime(0.0001, now, 0.06);
    this._leaveScore(0.7);
    this._log('abort', null);
  },

  _endScore() {
    if (!this.score) return;
    this._disposeBank(this.bank); this.bank = null;
    this.score = null; this.sec = null; this.want = null; this.sting = null; this.hush = false;
    this.voiceCap = this.voiceCapAct; this.echoMode = false; this.enrage = 0; this.downed = false;
    this.holdUntil = 0; this.check = null; this.winUntil = 0; this.scoreDeadline = 0;
    this._scoreBusReset(this._now());
    this._log('end', null);
  },

  // ------------------------------------------------------------------ per-tick watch (game -> music state)
  _scoreWatch(now, dt) {
    const sc = this.score, b = this.game.boss;
    if (this.mode !== 'boss' || !sc) return;
    // enrage: boss.enrage counts soft-enrage steps (0 = calm). First step already audible, saturating at 4.
    const eT = b && b.enrage > 0 ? Math.min(1, 0.55 + 0.15 * (b.enrage - 1)) : 0;
    this.enrage += (eT - this.enrage) * (1 - Math.exp(-dt / 1.2));
    this.downed = !!(b && b.downed) || now < this.downedUntil;
    if (this.check && now > this.check.until + 1) this.check = null;     // missed breakCheckEnd
    if (b && b.ward && WARD_INDEX[b.ward] != null && WARD_INDEX[b.ward] !== this.wardIdx) {
      this.wardIdx = WARD_INDEX[b.ward]; this.wardKick = true;
    }
    if (b && now >= this.holdUntil) {
      const ms = b.musicState || (b.phase === 3 ? 'p3' : b.phase === 2 ? 'p2' : 'p1');
      const name = MUSIC_STATE[ms];
      if (name && !(name === 'p1' && (!this.sec || this.sec.name === 'intro'))) this._scoreRequest(name, null);
    }
    // intermission exit: crescendo roll + a riser fitted to what is left
    const sec = this.sec;
    if (sec && sec.name === 'inter' && !this.want) {
      let left = b && typeof b.intT === 'number' ? b.intT : b && typeof b.stateLeft === 'number' ? b.stateLeft : this.interEnd - now;
      if (!(left > -1)) left = 0;
      const barSec = sec.bar * 15 / this.bpmCur;
      const soon = left > 0.25 && left < 2 * barSec;
      this.exitSoon = soon;
      if (soon) {
        this.rollK = clamp01(1 - left / (2 * barSec));
        if (!this.exitRiser) {
          this.exitRiser = true;
          const pre = sc.stings.inter.pre && sc.stings.inter.pre[0] ? sc.stings.inter.pre[0].p : { f0: 100, f1: 400 };
          this._mRiser({ when: now + 0.02, dur: left, dest: this.scoreSus, f0: pre.f0, f1: pre.f1, gain: 0.09, nz: 0.7 });
        }
      }
    } else this.exitSoon = false;
  },

  // Ask for a section. Idempotent. stingKey: stings entry (pre riser + hit); null -> sectionSting default.
  _scoreRequest(name, stingKey) {
    const sc = this.score;
    if (!sc || !sc.sec[name]) return;
    const cur = this.sec ? this.sec.name : null;
    if (this.want === name || (!this.want && cur === name)) return;
    const sting = stingKey || sc.sectionSting[name] || null;
    this.want = name; this.sting = sting; this.stingPre = false;
    this.hush = !!(sting && sc.stings[sting] && sc.stings[sting].pre);
    this._log('request', name);
  },

  // ------------------------------------------------------------------ the sequencer (called from _playStep)
  _playBossStep(t, step) {
    const sc = this.score;
    if (!sc || this.theme !== sc) return;
    const s = this.sstep++;
    const stepDur = 60 / this.bpmCur / 4;
    let sec = this.sec;
    const rel = sec ? s - this.secStep : 0;
    const onQuant = !sec || rel % sec.quant === 0;
    if (sec && sec.next && rel >= sec.bars * sec.bar && this.want !== sec.next) {   // finite section (intro)
      this.want = sec.next; this.sting = sc.sectionSting[sec.next] || null; this.stingPre = false; this.hush = false;
    }
    const tgt = (sec ? sec.bpm : sc.bpm) * (1 + 0.12 * this.enrage);
    this.bpmCur += (tgt - this.bpmCur) * 0.03;

    if (this.want && (!sec || this.want !== sec.name)) {
      if (onQuant) { this._scoreCommit(t, s); sec = this.sec; }
      else if (this.sting && !this.stingPre && rel % sec.beat === 0) {
        const st = sc.stings[this.sting];
        if (st && st.pre) this._playSting(st.pre, t, (sec.quant - (rel % sec.quant)) * stepDur);
        this.stingPre = true;
      }
    }
    if (!sec || this.muted || t < this.holdUntil) return;
    const r = s - this.secStep;
    const stems = sec.stems;
    for (let i = 0; i < stems.length; i++) {
      const c = stems[i];
      if (this.solo && !this.solo.has(c.name)) continue;       // dev: audition / meter single stems
      if (c.hushable && (this.hush || this.check)) continue;
      if (c.when) {
        if (c.when === 'downed' && !this.downed) continue;
        if (c.when === 'enrage' && this.enrage < 0.15) continue;
        if (c.when === 'exit' && !this.exitSoon) continue;
      }
      this._bossStem(c, r, t, stepDur, sec);
    }
    if (this.wardKick && r % sec.beat === 0) this.wardKick = false;
  },

  _scoreCommit(t, s) {
    const sc = this.score, sec = sc.sec[this.want];
    if (!sec) { this.want = null; return; }
    const first = !this.sec;
    this.sec = sec; this.secStep = s; this.hush = false; this.stingPre = false;
    this.exitRiser = false; this.exitSoon = false; this.rollK = 0;
    this.bpmCur = sec.bpm * (1 + 0.12 * this.enrage);     // tempo change lands on the downbeat with the hit (glide is for enrage only)
    const st = this.sting ? sc.stings[this.sting] : null;
    if (!first && st && st.hit) this._playSting(st.hit, t);
    this.sting = null; this.want = null;
    if (sec.vowel !== this.vowel && this.bank) { this._setVowel(this.bank, sec.vowel, t, 0.3); this.vowel = sec.vowel; }
    this._log('section', sec.name);
  },

  _bossStem(c, r, t, stepDur, sec) {
    switch (c.kind) {
      case 'drums': { const ch = c.pat[r % c.len]; if (ch !== '.') this._drum(ch, t, c.gm); break; }
      case 'seq': { const d = c.pat[r % c.len]; if (d !== null) this._bossNote(c, d, t, stepDur * c.gate, 1); break; }
      case 'notes': {
        const ns = c.at[r % c.len];
        if (ns) for (let i = 0; i < ns.length; i++) this._bossNote(c, ns[i][0], t, stepDur * ns[i][1], ns[i][2]);
        break;
      }
      case 'chords': {
        const every = c.every, onBar = r % every === 0;
        const kick = !onBar && c.follow && this.wardKick && r % sec.beat === 0;
        if (!onBar && !kick) break;
        const k = Math.floor(r / every);
        const idx = ((c.follow ? this.wardIdx : k) + (c.alt ? (k % 2) * c.alt : 0)) % c.prog.length;
        const dur = stepDur * (kick ? Math.max(4, every - (r % every)) : every);
        const ch = c.prog[idx];
        for (let i = 0; i < ch.length; i++) this._bossNote(c, ch[i], t, dur, 1);
        break;
      }
      case 'roll': if (r % c.rollEvery === 0) this._rollHit(c, t); break;
    }
  },

  _bossNote(c, deg, t, dur, vel) {
    const sc = this.score;
    const f = degFreq(c.scale, c.base === 'low' ? sc.low : sc.mid, deg + c.oct * c.scale.length);
    const dest = c.bus === 'rhy' ? this.scoreRhy : c.bus === 'bell' ? this.scoreBells : this.scoreSus;
    const g = c.gain * vel;
    switch (c.voice) {
      case 'brass': this._mBrass({ freq: f, dur, gain: g, when: t, dest, ...c.p }); break;
      case 'str': this._mStr({ freq: f, dur, gain: g, when: t, dest, ...c.p }); break;
      case 'choir': this._mChoir({ freq: f, dur, gain: g, when: t, bank: this.bank, ...c.p }); break;
      case 'organ': this._mOrgan({ freq: f, dur, gain: g, when: t, dest, ...c.p }); break;
      case 'bell': this._mBell({ freq: f, gain: g, when: t, dest, ...c.p }); break;
      case 'ping': this._mPing({ freq: f, gain: g, when: t, dest, ...c.p }); break;
    }
    if (this.echoMode && c.ghost) {     // the Echo: a detuned, octave-up choir shadow of the lead line
      this._mChoir({ freq: f * 2, dur, gain: g * 0.6, when: t, bank: this.bank, voices: 1, detune: 17, attack: 0.15, rel: 0.3, prio: 2 });
    }
  },

  // X big, x soft, o small, r rim, t timpani, T soft short timpani, u roll hit, s snare, g ghost snare, h shaker, a anvil, K kick
  _drum(ch, t, gm = 1) {
    const d = this.scoreRhy, f0 = this.score.drum;
    switch (ch) {
      case 'X': this._mTaiko({ when: t, dest: d, f0, vel: gm }); break;
      case 'x': this._mTaiko({ when: t, dest: d, f0, vel: 0.7 * gm, kind: 'soft' }); break;
      case 'o': this._mTaiko({ when: t, dest: d, f0: f0 * 1.5, vel: 0.55 * gm, kind: 'small' }); break;
      case 'r': this._mTaiko({ when: t, dest: d, kind: 'rim', vel: gm }); break;
      case 't': this._mTaiko({ when: t, dest: d, f0, vel: 0.9 * gm, kind: 'timp', sustain: 0.8 }); break;
      case 'T': this._mTaiko({ when: t, dest: d, f0, vel: 0.5 * gm, kind: 'timp', sustain: 0.4 }); break;
      case 'u': this._mTaiko({ when: t, dest: d, f0, vel: 0.55 * gm, kind: 'roll' }); break;
      case 's': this._mSnare({ when: t, dest: d, vel: gm }); break;
      case 'g': this._mSnare({ when: t, dest: d, vel: 0.35 * gm }); break;
      case 'h': this._mNoise({ dur: 0.04, gain: 0.06 * gm, attack: 0.002, filterType: 'highpass', freqStart: 6500, when: t, dest: d, prio: 2 }); break;
      case 'a': this._mBell({ freq: 1245, ratio: 2.76, index: 2, dur: 0.6, gain: 0.05 * gm, when: t, dest: d, prio: 1 }); break;
      case 'K': this._mTone({ wave: 'sine', freq: 110, freqEnd: 40, sweep: 0.08, dur: 0.3, gain: 0.5 * gm, attack: 0.002, when: t, dest: d, prio: 0 }); break;
    }
  },

  _rollHit(c, t) {
    const k = this.rollK, vel = 0.2 + 0.7 * k * k, d = this.scoreRhy, f0 = this.score.drum;
    if (c.hit === 'snare') this._mSnare({ when: t, dest: d, vel: 0.25 + 0.6 * k * k });
    else if (c.hit === 'timp') this._mTaiko({ when: t, dest: d, f0, vel, kind: 'roll' });
    else this._mTaiko({ when: t, dest: d, f0: f0 * 1.5, vel, kind: 'small' });
  },

  // Sting items: { at (s), fn, p }; p.dur === 'fit' -> the remaining time (pre risers, mend holds)
  _playSting(list, t, fit = 1) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const w = t + (it.at || 0);
      const p = it.p && it.p.dur === 'fit' ? { ...it.p, dur: Math.max(0.2, fit - (it.at || 0)) } : it.p;
      switch (it.fn) {
        case 'impact': this._mImpact({ when: w, dest: this.scoreRhy, ...p }); break;
        case 'riser': this._mRiser({ when: w, dest: this.scoreSus, ...p }); break;
        case 'brass': this._mBrass({ when: w, dest: this.scoreSus, prio: 0, ...p }); break;
        case 'choir': this._mChoir({ when: w, bank: this.bank, prio: 0, ...p }); break;
        case 'organ': this._mOrgan({ when: w, dest: this.scoreSus, prio: 0, ...p }); break;
        case 'bell': this._mBell({ when: w, dest: this.scoreBells, prio: 1, ...p }); break;
        case 'drum': this._drum(p.c, w); break;
      }
    }
  },

  // Event ducks: Web Audio has no sidechain input, so drive the bus gain from events.
  duckScore(depth = 0.5, { att = 0.02, hold = 0.12, rel = 0.35, bus = 'sus' } = {}) {
    const node = bus === 'rhy' ? this.scoreRhy : this.scoreSus;
    if (!node || !this.ctx || this.mode !== 'boss') return;
    const g = node.gain, now = this._now();
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.min(1, g.value || 1), now);    // no cancelAndHoldAtTime: Firefox lacks it
    g.setTargetAtTime(depth, now, att / 3);
    g.setTargetAtTime(1, now + att + hold, rel / 3);
  },

  // ------------------------------------------------------------------ event handlers
  _onEncounterStart(e) {
    this._wallRise();
    const key = BOSS_KEY[e && e.bossId];
    if (!key || !this.ctx || !this.scoreBus) return;
    try {
      const now = this._now();
      if (this.score) { this._disposeBank(this.bank); this.bank = null; this.score = null; this.voiceCap = this.voiceCapAct; }
      this._scoreBusReset(now);
      this.mode = 'seal'; this.sealAt = now;
      this._playSting(SCORES[key].stings.seal.hit, now + 0.02);      // the act theme fades out under a riser
      this._log('seal', key);
    } catch (err) { console.error('Seal music error:', err); }
  },

  _bossKeyOf(e) {
    const id = e && e.enemy && e.enemy.id;
    return BOSS_KEY[id] || BOSS_KEY[this.game.encounter && this.game.encounter.bossId] || null;
  },

  // Returns true when a score took over (the generic 55 Hz drone stinger is then skipped).
  _scoreBossSpawned(e) {
    const key = this._bossKeyOf(e);
    if (!key || !this.ctx || !this.scoreBus) return false;
    try {
      if (e.echo && this.score && this.score.key === key && this.mode === 'boss') this._scoreEcho();
      else this._startScore(key, !!e.echo);
      return true;
    } catch (err) { console.error('Boss score start error:', err); return false; }
  },

  _onBossIntermission(e) {
    if (this.mode !== 'boss') return;
    this.interEnd = this._now() + (e && e.dur ? e.dur : 7);
    this._scoreRequest('inter', 'inter');
  },

  _scorePhase(e) {
    if (this.mode !== 'boss' || !this.score) return;
    const ph = e && e.phase;
    if (ph === 2 || ph === 3) this._scoreRequest('p' + ph, null);
    this.duckScore(0.35, { att: 0.02, hold: 0.5, rel: 0.5 });
    this.duckScore(0.6, { att: 0.02, hold: 0.4, rel: 0.5, bus: 'rhy' });
  },

  _onBossDowned(e) {
    this._staggerSting(e && e.reason);
    if (this.mode !== 'boss') return;
    this.downedUntil = this._now() + (e && e.dur ? e.dur : 4);
    this.downed = true;
    this._log('downed', e && e.reason);
  },

  _onBossRecovered() {
    this._recoverSting();
    if (this.mode !== 'boss') return;
    this.downedUntil = 0; this.downed = false;
    this._log('recovered', null);
  },

  _onBreakCheck(e) {
    if (this.mode !== 'boss' || !this.score) return;
    const now = this._now(), dur = e && e.dur ? e.dur : 4;
    const ck = this.score.check || { f0: 90, f1: 300 };
    if (this.check && this.check.rg) this._cutRiser(this.check.rg, now);
    const rg = this._mRiser({ when: now + 0.05, dur: Math.max(0.5, dur - 0.1), dest: this.scoreSus, f0: ck.f0, f1: ck.f1, gain: 0.07, nz: 0.5 });
    this.check = { until: now + dur, rg };
    this._log('breakCheck', dur);
  },

  _cutRiser(rg, now) {
    try { rg.gain.cancelScheduledValues(now); rg.gain.setTargetAtTime(0, now, 0.03); } catch { /* gone */ }
  },

  _onBreakCheckEnd(e) {
    if (this.mode !== 'boss' || !this.score) return;
    const now = this._now(), sc = this.score;
    if (this.check && this.check.rg) this._cutRiser(this.check.rg, now);
    this.check = null;
    this._checkResult(sc, !!(e && e.success), now + 0.02);
    this._log('breakCheckEnd', !!(e && e.success));
  },

  // success: cymbal swell + gong.  fail: low brass blast.
  _checkResult(sc, ok, t) {
    if (ok) {
      this._mNoise({ dur: 1.1, gain: 0.12, attack: 0.012, filterType: 'highpass', freqStart: 5200, when: t, dest: this.scoreSus, prio: 0 });
      [[1, 2.4, 0.2], [1.51, 1.8, 0.1], [2.32, 1.2, 0.06]].forEach(([r, d, g]) => {
        this._mTone({ wave: 'sine', freq: sc.drum * 2 * r, dur: d, gain: g, attack: 0.004, when: t, dest: this.scoreRhy, prio: 0 });
      });
      this._mImpact({ when: t, dest: this.scoreRhy, f0: 85, f1: 38, dur: 1.0, gain: 0.35 });
    } else {
      this._mBrass({ freq: sc.low * 2, dur: 1.1, gain: 0.13, attack: 0.03, n: 3, spread: 14, open: 4, settle: 2, slide: -0.6, floor: 520, when: t, dest: this.scoreSus, prio: 0 });
      this._mImpact({ when: t, dest: this.scoreRhy, f0: 60, f1: 30, dur: 1.3, gain: 0.45 });
    }
  },

  _onBossEnrage() {
    if (this.mode !== 'boss' || !this.score) return;
    const now = this._now();
    this._playSting(this.score.stings.phase.hit, now + 0.05);
    this.duckScore(0.4, { att: 0.02, hold: 0.4, rel: 0.5 });
    this._log('enrage', null);
  },

  _onBossImpact(e) {
    const heavy = !!(e && e.heavy);
    if (heavy) this._heavyThud();
    if (this.mode !== 'boss') return;
    const now = this._now();
    if (now - this.lastImpactDuck < 0.18) return;
    this.lastImpactDuck = now;
    this.duckScore(heavy ? 0.5 : 0.78, { att: 0.015, hold: 0.1, rel: 0.35 });
  },

  _onBossTell(e) {
    if (this.mode !== 'boss') return;
    const lead = e && e.lead ? Math.min(2, e.lead) : 0.9;
    this.duckScore(0.78, { att: 0.05, hold: lead, rel: 0.3 });
  },

  _onBossWard(e) {
    const idx = e && WARD_INDEX[e.ward];
    if (idx == null || idx === this.wardIdx) return;
    this.wardIdx = idx; this.wardKick = true;
    this._log('ward', e.ward);
  },

  _onEchoMend(e) {
    if (this.mode !== 'boss' || !this.score) return;
    const now = this._now(), dur = e && e.dur ? e.dur : 3;
    this.holdUntil = now + dur; this.want = null; this.sting = null; this.hush = false; this.check = null;
    this._playSting(this.score.stings.mend.hit, now + 0.05, dur - 0.05);
    this._log('mend', dur);
  },

  _onEncounterEnd(e) {
    this._wallSink();
    if (e && e.victory === false) return;
    this._scoreWin(e);
  },

  // victory: cut everything, a silence beat, then the resolution (fits 2.4 s for acts I-II; Aurelith's is 8.5 s)
  _scoreWin() {
    const sc = this.score;
    if (!sc || this.mode !== 'boss' || !this.scoreBus) return;
    const now = this._now(), w = sc.stings.win, t0 = now + w.silence;
    const cut = (p, v) => { p.cancelScheduledValues(now); p.setTargetAtTime(0.0001, now, 0.02); p.setValueAtTime(v, t0 - 0.01); };
    cut(this.scoreBus.gain, 1);
    if (this.echoOut) cut(this.echoOut.gain, 1);
    if (this.echoFeedback) cut(this.echoFeedback.gain, 0.42);
    if (this.check && this.check.rg) this._cutRiser(this.check.rg, now);
    this.check = null;
    this.mode = 'win';
    this._switchLayer(null, now, 0.05);
    this._playSting(w.hit, t0);
    this.winUntil = t0 + w.len;
    this.scoreDeadline = this.winUntil + 2.5;
    this._log('win', w.len);
  },

  // defeat: tape stop (lowpass sweep + level fade); the existing descending sting plays on musicBus
  _scoreTapeStop() {
    if (!this.score || this.tape || !this.scoreBus) return;
    const now = this._now();
    this.tape = true;
    this.scoreLP.frequency.cancelScheduledValues(now);
    this.scoreLP.frequency.setTargetAtTime(160, now, 0.4);
    this.scoreBus.gain.cancelScheduledValues(now);
    this.scoreBus.gain.setTargetAtTime(0.0001, now + 0.2, 0.3);
    this._leaveScore(2.6);
    this._log('tape', null);
  },

  // per-tick housekeeping from _controlTick
  _scoreHousekeeping(now) {
    if (this.mode === 'seal' && now - this.sealAt > 8 && !this.game.boss) { this.mode = 'act'; this._log('seal-timeout', null); }
    if (this.score && this.mode !== 'boss' && this.mode !== 'seal') {
      if (!this.scoreDeadline) this.scoreDeadline = now + 3;
      if (now > this.scoreDeadline) this._endScore();
    }
    // watchdog: encounter ended without a victory (reset / quit): hand the music back to the act
    if (this.mode === 'boss' && !this.game.boss && now > this.holdUntil + 1 && now - this.lastLog > 6 && !(this.game.encounter && this.game.encounter.active) && this.game.state === 'playing') {
      this.mode = 'act'; this._abortScore(now);
    }
  },

  // ------------------------------------------------------------------ debug / tooling
  debugScore(id, state = 'p1', { echo = false } = {}) {
    const key = id.startsWith('boss:') ? id : 'boss:' + id;
    const sc = SCORES[key];
    if (!sc || !this._getOrInitAudioContext() || !this.scoreBus) return false;
    this._startScore(key, echo);
    this.sec = sc.sec[state] || sc.sec.p1; this.secStep = this.sstep; this.want = null;
    this.bpmCur = this.sec.bpm; this._setVowel(this.bank, this.sec.vowel, this._now(), 0.05); this.vowel = this.sec.vowel;
    return this.scoreState();
  },

  scoreState() {
    return {
      mode: this.mode, key: this.score && this.score.key, section: this.sec && this.sec.name, want: this.want,
      bpm: Math.round(this.bpmCur * 10) / 10, voices: this._vActive(), voiceHigh: this.voiceHigh, drops: this.voiceDrops,
      enrage: Math.round(this.enrage * 100) / 100, downed: this.downed, ward: this.wardIdx, echo: this.echoMode,
      cap: this.voiceCap, hold: this.holdUntil > this._now(),
    };
  },

  setLite(on) { this.lite = !!on; this.voiceCap = this.score ? (on ? 18 : BOSS_MAX_VOICES) : this.voiceCapAct; },
};
