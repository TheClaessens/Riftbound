// Procedural audio synthesizer for Riftbound using Web Audio API
// All sounds are synthesized with oscillators, noise, and filters — no audio files.

// ---------------------------------------------------------------- music constants
const MUSIC_LEVEL = 0.35;           // music bus level, relative to the SFX chain
const MUSIC_MAX_VOICES = 14;        // cap on live music oscillators / noise sources
const SCHEDULE_INTERVAL_MS = 25;    // lookahead scheduler tick (setInterval, not rAF)
const SCHEDULE_AHEAD = 0.12;        // seconds of notes queued ahead of currentTime

const SCALE_DORIAN = [0, 2, 3, 5, 7, 9, 10];     // D Dorian (Verge)
const SCALE_PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];   // E Phrygian (Cinder)
const SCALE_LYDIAN = [0, 2, 4, 6, 7, 9, 11];     // G Lydian (Crown)

// Arpeggio grids: 32 sixteenth-note steps (2 bars). Entries are scale degrees, or null for a rest.
const VERGE_ARP = [
  0, null, null, null,
  4, null, null, null,
  2, null, null, 6,
  null, null, null, null,
  3, null, null, null,
  5, null, null, 4,
  null, null, 1, null,
  null, null, 0, null,
];
const CINDER_ARP = [
  0, null, 1, null,
  null, null, 0, null,
  -2, null, 1, null,
  null, null, null, 0,
  0, null, 1, null,
  null, 3, null, null,
  4, null, 3, null,
  1, null, 0, null,
];
const CROWN_ARP = [
  0, null, 2, 4,
  7, null, 6, null,
  4, null, 2, null,
  0, null, null, 3,
  5, null, 4, null,
  2, null, 7, null,
  9, null, 7, 6,
  4, null, 2, null,
];
const CROWN_CHORDS = [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]];

// Per-theme music data. `layer` = the drone/pad bed; the rest drives the sequencer.
const THEMES = {
  title: {
    key: 'title', bpm: 84, scale: SCALE_DORIAN, rootLow: 73.42, rootMid: 293.66,
    droneCut: 260, level: 0.45, echo: 0.375,
    arp: null, pulse: null, ostinato: null, pads: false, lfo: null,
  },
  verge: {
    key: 'verge', bpm: 84, scale: SCALE_DORIAN, rootLow: 73.42, rootMid: 293.66,
    droneCut: 320, level: 1, echo: 0.375,
    arp: VERGE_ARP, arpWave: 'sine', arpDur: 2.8, arpGain: 0.09,
    arpPartial: { ratio: 2.76, gain: 0.35 }, arpFilter: null,
    pulse: null, ostinato: [0, 0, 3, 0, 0, 4, 2, 0], pads: false, lfo: null,
  },
  cinder: {
    key: 'cinder', bpm: 96, scale: SCALE_PHRYGIAN, rootLow: 82.41, rootMid: 329.63,
    droneCut: 300, level: 1, echo: 0.25,
    arp: CINDER_ARP, arpWave: 'triangle', arpDur: 1.6, arpGain: 0.07,
    arpPartial: null, arpFilter: 1600,
    pulse: 'tom', ostinato: [0, 0, 1, 0, 0, 2, 0, 1], pads: false, lfo: { rate: 0.07, depth: 160 },
  },
  crown: {
    key: 'crown', bpm: 104, scale: SCALE_LYDIAN, rootLow: 98.0, rootMid: 392.0,
    droneCut: 380, level: 1, echo: 0.33,
    arp: CROWN_ARP, arpWave: 'sine', arpDur: 1.1, arpGain: 0.06,
    arpPartial: { ratio: 3, gain: 0.25 }, arpFilter: null,
    pulse: 'tick', ostinato: [0, 2, 0, 4, 0, 2, 3, 0], pads: true, padBase: 196,
    chords: CROWN_CHORDS, lfo: { rate: 0.03, depth: 90 },
  },
};
const ACT_THEMES = ['verge', 'cinder', 'crown'];
const GEODE_PITCH = { arcane: 1568, fire: 1046.5, frost: 1975.5, storm: 2349.3 };

// Scale degree -> frequency. Degrees wrap by octave; negative degrees go down.
function degFreq(scale, base, deg) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return base * Math.pow(2, oct + scale[idx] / 12);
}

// Soft-clip curve for the boss roar (tanh, normalised to +-1).
let distortionCurveCache = null;
function getDistortionCurve() {
  if (!distortionCurveCache) {
    const drive = 6;
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
    }
    distortionCurveCache = curve;
  }
  return distortionCurveCache;
}

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.muted = this._loadMuteState();
    this.activeVoices = [];
    this.soundLimiters = new Map(); // sound name -> { count, resetTime }
    this.lastBossSpawnSound = 0;
    this.lastGongAt = -99;          // shared throttle between act gong and announce gong
    this.modalHoldUntil = -1;       // music ducks until this ctx time (modal just opened)

    // Music state
    this.musicBus = null;
    this.intensityBus = null;
    this.bossBus = null;
    this.arpBus = null;
    this.echoIn = null;
    this.echoDelay = null;
    this.mode = 'title';            // 'title' | 'act' | 'shift' (silence) | 'end' (silence + sting)
    this.musicAct = 0;
    this.layer = null;              // current drone/pad bed
    this.layerKey = null;           // THEMES key of this.layer, null = silence
    this.theme = null;              // THEMES entry driving the sequencer
    this.fadingLayers = [];
    this.intensity = 0;             // 0..1, smoothed, follows live enemy count
    this.bossLevel = 0;             // 0..1, smoothed, follows game.boss
    this.bossDouble = false;        // set on bossPhase: ostinato runs at 16ths
    this.duck = 1;                  // 0..1 smoothed music duck
    this.musicVoices = 0;
    this.schedTimer = null;
    this.nextStepTime = 0;
    this.step = 0;
    this.lastCtrl = 0;

    // Subscribe to game events
    game.events.on('cast', (e) => this._onCast(e));
    game.events.on('reaction', (e) => this._onReaction(e));
    game.events.on('enemyKilled', (e) => this._onEnemyKilled(e));
    game.events.on('xpCollected', (e) => this._onXpCollected(e));
    game.events.on('levelUp', (e) => this._onLevelUp(e));
    game.events.on('fusion', (e) => this._onFusion(e));
    game.events.on('discovered', (e) => this._onDiscovered(e));
    game.events.on('playerHit', (e) => this._onPlayerHit(e));
    game.events.on('playerDied', (e) => this._onPlayerDied(e));
    game.events.on('bossSpawned', (e) => this._onBossSpawned(e));
    game.events.on('announce', (e) => this._onAnnounce(e));
    game.events.on('itemCollected', (e) => this._onItemCollected(e));
    game.events.on('actStart', (e) => this._onActStart(e));
    game.events.on('riftShift', (e) => this._onRiftShift(e));
    game.events.on('runEnd', (e) => this._onRunEnd(e));
    game.events.on('chestOpened', (e) => this._onChestOpened(e));
    game.events.on('relicGained', (e) => this._onRelicGained(e));
    game.events.on('dash', (e) => this._onDash(e));
    game.events.on('perfectDodge', (e) => this._onPerfectDodge(e));
    game.events.on('geodeBroken', (e) => this._onGeodeBroken(e));
    game.events.on('shrineClaimed', (e) => this._onShrineClaimed(e));
    game.events.on('shrineSpawned', (e) => this._onShrineSpawned(e));
    game.events.on('bossPhase', (e) => this._onBossPhase(e));
    game.events.on('wardBroken', (e) => this._onWardBroken(e));
    game.events.on('chainMilestone', (e) => this._onChainMilestone(e));
    game.events.on('hazard', (e) => this._onHazard(e));

    // Lazy-init on user input. Listeners stay attached so a context created before the
    // first gesture (and left suspended) is resumed on the next one.
    window.addEventListener('pointerdown', () => this._ensureAudioContext());
    window.addEventListener('keydown', () => this._ensureAudioContext());

    // Mute toggle on KeyM
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        this.toggleMute();
      }
    });
  }

  // ==================== Audio Context & Mute ====================

  _loadMuteState() {
    try {
      const val = localStorage.getItem('riftbound.muted');
      return val === 'true';
    } catch {
      return false;
    }
  }

  _saveMuteState() {
    try {
      localStorage.setItem('riftbound.muted', String(this.muted));
    } catch {
      /* ignore */
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this._saveMuteState();
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.5;
    }
  }

  setVolume(v) {
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : Math.max(0, Math.min(1, v));
    }
  }

  _ensureAudioContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = audioContext;

      // Master chain: masterGain → compressor → destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.5;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -30;
      this.compressor.knee.value = 40;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Pre-generate white noise buffer (1 second, 44.1 kHz)
      const bufLen = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;

      // Music graph + lookahead scheduler (fails soft: SFX keep working without it)
      this._initMusic();

      // Resume audio context if suspended
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {
      console.error('Audio context init failed:', e);
    }
  }

  _getOrInitAudioContext() {
    if (!this.ctx) this._ensureAudioContext();
    return this.ctx;
  }

  // ==================== Voice Management ====================

  _pruneVoices() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.activeVoices = this.activeVoices.filter((v) => v.endTime > now);
  }

  _canPlaySound(soundName, maxPerMs = 3, msWindow = 100) {
    this._pruneVoices();

    // Check global voice limit
    if (this.activeVoices.length >= 24) {
      return false;
    }

    // Check per-sound throttle
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (!this.soundLimiters.has(soundName)) {
      this.soundLimiters.set(soundName, { count: 0, resetTime: now });
    }

    const limiter = this.soundLimiters.get(soundName);
    const windowSeconds = msWindow / 1000;

    if (now >= limiter.resetTime + windowSeconds) {
      limiter.count = 0;
      limiter.resetTime = now;
    }

    if (limiter.count >= maxPerMs) {
      return false;
    }

    limiter.count++;
    return true;
  }

  _registerVoice(endTime) {
    this.activeVoices.push({ endTime });
  }

  // ==================== Sound Helpers ====================

  _getRandomPitch() {
    // ±6% pitch variation
    return Math.pow(2, (Math.random() - 0.5) * 0.12);
  }

  _tone({
    type = 'sine',
    freq,
    freqEnd = freq,
    dur,
    gain = 0.1,
    attack = 0.01,
    delay = 0,
    filter = null,
  }) {
    const ctx = this._getOrInitAudioContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    osc.type = type;

    const gainNode = ctx.createGain();
    osc.connect(gainNode);

    let output = gainNode;

    // Apply filter if provided
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq || 8000;
      f.Q.value = filter.Q || 1;
      gainNode.connect(f);
      output = f;
    }

    output.connect(this.masterGain);

    const now = ctx.currentTime + delay;
    const startFreq = freq * this._getRandomPitch();
    const endFreq = freqEnd * this._getRandomPitch();

    osc.frequency.setValueAtTime(startFreq, now);
    if (freqEnd !== freq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    }

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.start(now);
    osc.stop(now + dur);

    osc.addEventListener('ended', () => {
      osc.disconnect();
      gainNode.disconnect();
    });

    this._registerVoice(now + dur);
  }

  _noise({
    dur,
    gain = 0.1,
    attack = 0.01,
    filterType = null,
    freqStart = null,
    freqEnd = null,
    Q = 1,
    delay = 0,
  }) {
    const ctx = this._getOrInitAudioContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime + delay;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const gainNode = ctx.createGain();
    src.connect(gainNode);

    let output = gainNode;

    // Apply filter if specified
    if (filterType) {
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.Q.value = Q;
      gainNode.connect(f);
      output = f;

      if (freqStart !== null && freqEnd !== null) {
        f.frequency.setValueAtTime(freqStart, now);
        f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
      } else if (freqStart !== null) {
        f.frequency.value = freqStart;
      }
    }

    output.connect(this.masterGain);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.start(now);
    src.stop(now + dur);

    src.addEventListener('ended', () => {
      src.disconnect();
      gainNode.disconnect();
    });

    this._registerVoice(now + dur);
  }

  // ==================== Cast Sounds ====================

  _onCast(e) {
    const { def } = e;
    const element = def.element || 'arcane';

    if (!this._canPlaySound(element, 2, 100)) return;

    try {
      switch (element) {
        case 'arcane':
          // Short bright sine/triangle 'pew' with fast downward pitch sweep (900→400 Hz, 80 ms)
          this._tone({
            type: 'triangle',
            freq: 900,
            freqEnd: 400,
            dur: 0.08,
            gain: 0.15,
            attack: 0.005,
          });
          break;

        case 'fire':
          // Whoosh (bandpassed noise sweep 400→1200 Hz, 180 ms) + low thump
          this._noise({
            dur: 0.18,
            gain: 0.14,
            attack: 0.02,
            filterType: 'bandpass',
            freqStart: 400,
            freqEnd: 1200,
            Q: 2,
          });
          this._tone({
            type: 'sine',
            freq: 110,
            dur: 0.12,
            gain: 0.08,
            attack: 0.01,
          });
          break;

        case 'frost':
          // Crystalline shimmer (2–3 high sines 1800–2600 Hz with quick decay + filtered noise hiss)
          this._tone({
            type: 'sine',
            freq: 1800,
            dur: 0.12,
            gain: 0.09,
            attack: 0.005,
          });
          this._tone({
            type: 'sine',
            freq: 2200,
            dur: 0.1,
            gain: 0.08,
            attack: 0.006,
            delay: 0.02,
          });
          this._tone({
            type: 'sine',
            freq: 2600,
            dur: 0.08,
            gain: 0.07,
            attack: 0.007,
            delay: 0.04,
          });
          this._noise({
            dur: 0.15,
            gain: 0.06,
            attack: 0.02,
            filterType: 'highpass',
            freqStart: 2000,
          });
          break;

        case 'storm':
          // Crackle (short bursts of highpassed noise, 150 ms) + zap (square 120→60 Hz)
          this._noise({
            dur: 0.15,
            gain: 0.12,
            attack: 0.01,
            filterType: 'highpass',
            freqStart: 3000,
          });
          this._tone({
            type: 'square',
            freq: 120,
            freqEnd: 60,
            dur: 0.15,
            gain: 0.1,
            attack: 0.01,
          });
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('Cast sound error:', err);
    }
  }

  // ==================== Reaction Sounds ====================

  _onReaction(e) {
    const { type } = e;

    if (!this._canPlaySound(`reaction_${type}`, 2, 100)) return;

    try {
      switch (type) {
        case 'steam':
          // Hissing burst (noise through bandpass sweeping 3000→600 Hz, 400 ms) + soft boom
          this._noise({
            dur: 0.4,
            gain: 0.16,
            attack: 0.05,
            filterType: 'bandpass',
            freqStart: 3000,
            freqEnd: 600,
            Q: 1.5,
          });
          this._tone({
            type: 'sine',
            freq: 80,
            dur: 0.15,
            gain: 0.1,
            attack: 0.02,
            delay: 0.05,
          });
          break;

        case 'overload':
          // Big boom (sine 110→40 Hz pitch drop, 350 ms) + lowpassed noise burst
          this._tone({
            type: 'sine',
            freq: 110,
            freqEnd: 40,
            dur: 0.35,
            gain: 0.2,
            attack: 0.03,
          });
          this._noise({
            dur: 0.25,
            gain: 0.14,
            attack: 0.01,
            filterType: 'lowpass',
            freqStart: 800,
            delay: 0.02,
          });
          break;

        case 'superconduct':
          // Electric chirp chain (3 quick square blips 600/900/1300 Hz) + icy shimmer
          this._tone({
            type: 'square',
            freq: 600,
            dur: 0.06,
            gain: 0.12,
            attack: 0.005,
          });
          this._tone({
            type: 'square',
            freq: 900,
            dur: 0.06,
            gain: 0.12,
            attack: 0.005,
            delay: 0.07,
          });
          this._tone({
            type: 'square',
            freq: 1300,
            dur: 0.06,
            gain: 0.12,
            attack: 0.005,
            delay: 0.14,
          });
          // Icy shimmer
          this._tone({
            type: 'sine',
            freq: 2000,
            dur: 0.2,
            gain: 0.07,
            attack: 0.01,
            delay: 0.05,
          });
          break;

        case 'shatter':
          // Glass break (several short high-frequency 'tinks' 2000–5000 Hz + highpassed noise crack)
          this._tone({
            type: 'sine',
            freq: 2000,
            dur: 0.04,
            gain: 0.11,
            attack: 0.002,
          });
          this._tone({
            type: 'sine',
            freq: 3200,
            dur: 0.035,
            gain: 0.1,
            attack: 0.002,
            delay: 0.04,
          });
          this._tone({
            type: 'sine',
            freq: 4500,
            dur: 0.03,
            gain: 0.09,
            attack: 0.002,
            delay: 0.08,
          });
          this._noise({
            dur: 0.12,
            gain: 0.12,
            attack: 0.005,
            filterType: 'highpass',
            freqStart: 3000,
            delay: 0.02,
          });
          break;

        case 'combust':
          // Whoompf (pitch-dropping thump) + sizzle (bandpassed noise with crackling highs)
          this._tone({
            type: 'sine',
            freq: 90,
            freqEnd: 35,
            dur: 0.35,
            gain: 0.2,
            attack: 0.005,
          });
          this._noise({
            dur: 0.5,
            gain: 0.12,
            attack: 0.02,
            filterType: 'bandpass',
            freqStart: 2500,
            freqEnd: 800,
            Q: 1,
            delay: 0.04,
          });
          this._noise({
            dur: 0.3,
            gain: 0.05,
            attack: 0.005,
            filterType: 'highpass',
            freqStart: 6000,
            delay: 0.1,
          });
          break;

        case 'arcflash':
          // Bright electric snap (square tick + highpassed crack) with a fast downward chirp
          this._tone({
            type: 'square',
            freq: 2400,
            dur: 0.03,
            gain: 0.1,
            attack: 0.001,
          });
          this._noise({
            dur: 0.06,
            gain: 0.15,
            attack: 0.002,
            filterType: 'highpass',
            freqStart: 5000,
          });
          this._tone({
            type: 'sine',
            freq: 3000,
            freqEnd: 1200,
            dur: 0.12,
            gain: 0.07,
            attack: 0.002,
            delay: 0.01,
          });
          break;
      }
    } catch (err) {
      console.error('Reaction sound error:', err);
    }
  }

  // ==================== Enemy & Combat Sounds ====================

  _onEnemyKilled(e) {
    const { enemy } = e;

    try {
      if (enemy.boss) {
        if (!this._canPlaySound('boss_killed', 1, 100)) return;
        // Big deep explosion + descending rumble (1.5 s)
        this._tone({
          type: 'sine',
          freq: 150,
          freqEnd: 30,
          dur: 1.5,
          gain: 0.25,
          attack: 0.05,
        });
        this._noise({
          dur: 0.6,
          gain: 0.18,
          attack: 0.02,
          filterType: 'lowpass',
          freqStart: 1200,
        });
      } else {
        if (!this._canPlaySound('enemy_killed', 3, 100)) return;
        // Very soft short 'pop' (sine 300→120 Hz, 50 ms)
        this._tone({
          type: 'sine',
          freq: 300,
          freqEnd: 120,
          dur: 0.05,
          gain: 0.06,
          attack: 0.005,
        });
      }
    } catch (err) {
      console.error('Enemy killed sound error:', err);
    }
  }

  _onXpCollected(e) {
    if (!this._canPlaySound('xp_collected', 4, 100)) return;

    try {
      // Tiny high 'tick' (sine 1200–1600 Hz, 30 ms) with rising pitch on combo
      // Combo effect: after 400 ms of silence, reset pitch baseline
      if (!this._xpLastTime) this._xpLastTime = 0;
      if (!this._xpComboRise) this._xpComboRise = 0;

      const now = this.ctx ? this.ctx.currentTime : 0;
      if (now - this._xpLastTime > 0.4) {
        this._xpComboRise = 0;
      }

      this._xpLastTime = now;
      const baseFreq = 1200 + this._xpComboRise * 100;
      this._xpComboRise = Math.min(4, this._xpComboRise + 1);

      this._tone({
        type: 'sine',
        freq: baseFreq,
        freqEnd: baseFreq + 200,
        dur: 0.03,
        gain: 0.04,
        attack: 0.005,
      });
    } catch (err) {
      console.error('XP collected sound error:', err);
    }
  }

  _onPlayerHit(e) {
    try {
      // Dull thud + short low-passed noise
      this._tone({
        type: 'sine',
        freq: 80,
        dur: 0.08,
        gain: 0.15,
        attack: 0.01,
      });
      this._noise({
        dur: 0.1,
        gain: 0.12,
        attack: 0.005,
        filterType: 'lowpass',
        freqStart: 400,
      });
    } catch (err) {
      console.error('Player hit sound error:', err);
    }
  }

  // ==================== Level & Progression Sounds ====================

  _onLevelUp(e) {
    this.holdDuck(1.0);
    try {
      // Ascending arpeggio (C5 E5 G5 C6 triangle notes, 70 ms apart) + shimmer tail
      // C5=523.25, E5=659.25, G5=783.99, C6=1046.5 Hz
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        this._tone({
          type: 'triangle',
          freq,
          dur: 0.15,
          gain: 0.12,
          attack: 0.01,
          delay: i * 0.07,
        });
      });
      // Soft shimmer tail
      this._tone({
        type: 'sine',
        freq: 2000,
        dur: 0.4,
        gain: 0.07,
        attack: 0.05,
        delay: 0.28,
      });
    } catch (err) {
      console.error('Level up sound error:', err);
    }
  }

  _onFusion(e) {
    try {
      // Epic: low swell (sawtooth through lowpass sweeping open over 0.6 s) + major chord
      this._tone({
        type: 'sawtooth',
        freq: 55,
        dur: 0.6,
        gain: 0.18,
        attack: 0.1,
        filter: {
          type: 'lowpass',
          freq: 200,
        },
      });

      // Major chord bell tones (sine, long 1.5 s decay): C (262Hz), E (330Hz), G (392Hz)
      const chordFreqs = [262, 330, 392];
      chordFreqs.forEach((freq, i) => {
        this._tone({
          type: 'sine',
          freq,
          dur: 1.5,
          gain: 0.1,
          attack: 0.1,
          delay: i * 0.1,
        });
      });
    } catch (err) {
      console.error('Fusion sound error:', err);
    }
  }

  _onDiscovered(e) {
    try {
      // Short magical 3-note chime
      const notes = [800, 1000, 1200];
      notes.forEach((freq, i) => {
        this._tone({
          type: 'sine',
          freq,
          dur: 0.15,
          gain: 0.1,
          attack: 0.01,
          delay: i * 0.08,
        });
      });
    } catch (err) {
      console.error('Discovered sound error:', err);
    }
  }

  _onPlayerDied(e) {
    try {
      // Long descending tone (sawtooth 400→60 Hz over 1.5 s through closing lowpass)
      this._tone({
        type: 'sawtooth',
        freq: 400,
        freqEnd: 60,
        dur: 1.5,
        gain: 0.2,
        attack: 0.05,
        filter: {
          type: 'lowpass',
          freq: 400,
        },
      });
    } catch (err) {
      console.error('Player died sound error:', err);
    }
  }

  _onBossSpawned(e) {
    this.bossDouble = false;
    try {
      // Ominous low drone stinger (two detuned sawtooth at ~55 Hz, 2.5 s fade) + deep hit
      this._tone({
        type: 'sawtooth',
        freq: 55,
        dur: 2.5,
        gain: 0.15,
        attack: 0.1,
      });
      this._tone({
        type: 'sawtooth',
        freq: 57,
        dur: 2.5,
        gain: 0.14,
        attack: 0.1,
      });
      // Deep hit
      this._tone({
        type: 'sine',
        freq: 100,
        dur: 0.2,
        gain: 0.12,
        attack: 0.02,
      });
      this.lastBossSpawnSound = this.ctx ? this.ctx.currentTime : 0;
    } catch (err) {
      console.error('Boss spawned sound error:', err);
    }
  }

  _onAnnounce(e) {
    try {
      // Soft gong-ish tone (sine 220 + 440 + 660 partials, 1.2 s decay)
      // Skip if a bossSpawned sound played within last 500 ms
      const now = this.ctx ? this.ctx.currentTime : 0;
      if (now - this.lastBossSpawnSound < 0.5) {
        return;
      }
      if (now - this.lastGongAt < 0.6) {
        return;
      }
      this.lastGongAt = now;

      const partials = [220, 440, 660];
      partials.forEach((freq) => {
        this._tone({
          type: 'sine',
          freq,
          dur: 1.2,
          gain: 0.07,
          attack: 0.08,
        });
      });
    } catch (err) {
      console.error('Announce sound error:', err);
    }
  }

  // ==================== Item Sounds ====================

  _onItemCollected(e) {
    const { type } = e;

    try {
      if (type === 'health') {
        // Warm rising two-note
        this._tone({
          type: 'sine',
          freq: 400,
          dur: 0.1,
          gain: 0.11,
          attack: 0.01,
        });
        this._tone({
          type: 'sine',
          freq: 600,
          dur: 0.12,
          gain: 0.1,
          attack: 0.01,
          delay: 0.08,
        });
      } else if (type === 'magnet') {
        // Whooshing sweep up
        this._noise({
          dur: 0.15,
          gain: 0.12,
          attack: 0.02,
          filterType: 'bandpass',
          freqStart: 400,
          freqEnd: 1600,
          Q: 1.5,
        });
      }
    } catch (err) {
      console.error('Item collected sound error:', err);
    }
  }

  // ==================== Music: graph & scheduler ====================

  _initMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;
    try {
      // musicBus -> masterGain (so mute and setVolume apply to music too)
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_LEVEL;
      this.musicBus.connect(this.masterGain);

      // Intensity layer (percussion that follows enemy count) and boss layer (ostinato)
      this.intensityBus = ctx.createGain();
      this.intensityBus.gain.value = 0;
      this.intensityBus.connect(this.musicBus);

      this.bossBus = ctx.createGain();
      this.bossBus.gain.value = 0;
      this.bossBus.connect(this.musicBus);

      // Arpeggio send with a simple feedback echo
      this.arpBus = ctx.createGain();
      this.arpBus.gain.value = 0.8;
      this.arpBus.connect(this.musicBus);

      this.echoIn = ctx.createGain();
      this.echoIn.gain.value = 0.5;
      this.echoDelay = ctx.createDelay(1.5);
      this.echoDelay.delayTime.value = 0.375;
      const echoFeedback = ctx.createGain();
      echoFeedback.gain.value = 0.42;
      const echoTone = ctx.createBiquadFilter();
      echoTone.type = 'lowpass';
      echoTone.frequency.value = 2200;
      this.arpBus.connect(this.echoIn);
      this.echoIn.connect(this.echoDelay);
      this.echoDelay.connect(echoFeedback);
      echoFeedback.connect(this.echoDelay);
      this.echoDelay.connect(echoTone);
      echoTone.connect(this.musicBus);

      this._startScheduler();
    } catch (err) {
      console.error('Music init failed:', err);
    }
  }

  _startScheduler() {
    if (this.schedTimer || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.nextStepTime = now + 0.1;
    this.step = 0;
    this.lastCtrl = now;
    this.schedTimer = setInterval(() => this._schedule(), SCHEDULE_INTERVAL_MS);
  }

  // Lookahead scheduler: runs every ~25 ms and queues 16th-note steps SCHEDULE_AHEAD seconds ahead.
  _schedule() {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.musicBus || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      this._controlTick(now);

      // Fell behind (background-tab throttling or a suspended context): resync, do not burst notes
      if (this.nextStepTime < now) this.nextStepTime = now + 0.05;

      const horizon = now + SCHEDULE_AHEAD;
      while (this.nextStepTime < horizon) {
        const th = this.theme;
        const stepDur = 60 / (th ? th.bpm : 90) / 4;
        this._playStep(this.nextStepTime, this.step);
        this.nextStepTime += stepDur;
        this.step++;
      }
    } catch (err) {
      console.error('Music scheduler error:', err);
    }
  }

  // Runs every scheduler tick: mode -> layer, boss/intensity smoothing, ducking, layer cleanup.
  _controlTick(now) {
    const game = this.game;
    const dt = Math.min(0.25, Math.max(0, now - this.lastCtrl));
    this.lastCtrl = now;

    // Back on the title screen (initial load or quitToTitle): ambient drone
    if (game.state === 'title' && this.mode !== 'title') this.mode = 'title';

    let want = null;
    if (this.mode === 'title') want = 'title';
    else if (this.mode === 'act') want = ACT_THEMES[this.musicAct] ?? null;
    if (want !== this.layerKey) {
      const fade = want === 'title' ? 1.5 : want ? 2.0 : this.mode === 'end' ? 1.2 : 0.8;
      this._switchLayer(want, now, fade);
    }

    // Boss layer and intensity (live enemy count, plus a boss bonus)
    if (!game.boss) this.bossDouble = false;
    const bossTarget = game.boss && this.mode === 'act' ? 1 : 0;
    this.bossLevel += (bossTarget - this.bossLevel) * (1 - Math.exp(-dt / 0.6));
    const n = game.enemies ? game.enemies.length : 0;
    const base = Math.min(1, Math.max(0, (n - 40) / 160));
    const intensityTarget = this.mode === 'act' ? Math.min(1, base + 0.3 * this.bossLevel) : 0;
    this.intensity += (intensityTarget - this.intensity) * (1 - Math.exp(-dt / 0.8));

    // Duck under modals (level-up, relic pick) and while paused
    let duckTarget = 1;
    if (game.state === 'levelup' || game.state === 'relic' || now < this.modalHoldUntil) duckTarget = 0.6;
    else if (game.state === 'paused') duckTarget = 0.7;
    this.duck += (duckTarget - this.duck) * (1 - Math.exp(-dt / 0.3));

    this.musicBus.gain.value = MUSIC_LEVEL * this.duck;
    this.intensityBus.gain.value = this.intensity * 0.55;
    this.bossBus.gain.value = this.bossLevel * 0.8;

    // Free layers whose fade-out has finished
    if (this.fadingLayers.length) {
      this.fadingLayers = this.fadingLayers.filter((l) => {
        if (now < l.stopAt) return true;
        for (const node of l.nodes) {
          try { node.disconnect(); } catch { /* already gone */ }
        }
        try { l.gain.disconnect(); } catch { /* already gone */ }
        return false;
      });
    }
  }

  holdDuck(sec) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.modalHoldUntil = now + sec;
  }

  // Crossfade the drone/pad bed to a new theme (key) or to silence (null).
  _switchLayer(key, now, fade) {
    if (this.layer) this._fadeOutLayer(this.layer, now, fade);
    const th = key ? THEMES[key] : null;
    this.layer = th ? this._buildLayer(th, now, fade) : null;
    this.layerKey = key;
    this.theme = th;
    if (th && this.echoDelay) this.echoDelay.delayTime.setTargetAtTime(th.echo, now, 0.4);
  }

  // Drone (+ pads, + LFO filter sweep) bed for one theme. Fades in over `fade` seconds.
  _buildLayer(th, now, fade) {
    const ctx = this.ctx;
    const layer = { th, gain: ctx.createGain(), nodes: [], pads: null, stopAt: 0 };
    layer.gain.gain.setValueAtTime(0, now);
    layer.gain.gain.linearRampToValueAtTime(th.level, now + Math.max(0.05, fade));
    layer.gain.connect(this.musicBus);

    const mk = (type, freq, detune, gain, dest) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(dest);
      o.start(now);
      layer.nodes.push(o, g);
      return o;
    };

    // Drone: detuned saw + triangle through a lowpass
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = th.droneCut;
    lp.Q.value = 0.8;
    lp.connect(layer.gain);
    layer.nodes.push(lp);
    mk('sawtooth', th.rootLow, -7, 0.1, lp);
    mk('triangle', th.rootLow, 7, 0.14, lp);

    // Slow filter sweep (Cinder, Crown)
    if (th.lfo) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = th.lfo.rate;
      const depth = ctx.createGain();
      depth.gain.value = th.lfo.depth;
      lfo.connect(depth);
      depth.connect(lp.frequency);
      lfo.start(now);
      layer.nodes.push(lfo, depth);
    }

    // Airy pad: three chord voices, each a pair of detuned sines
    if (th.pads) {
      const padBus = ctx.createGain();
      padBus.gain.value = 0.03;
      padBus.connect(layer.gain);
      layer.nodes.push(padBus);
      layer.pads = [];
      for (let i = 0; i < 3; i++) {
        layer.pads.push({
          a: mk('sine', th.padBase, 0, 1, padBus),
          b: mk('sine', th.padBase, 7, 1, padBus),
        });
      }
      this._setPadChord(layer, th.chords[0], now);
    }

    return layer;
  }

  _setPadChord(layer, chord, t) {
    const th = layer.th;
    for (let i = 0; i < layer.pads.length; i++) {
      const f = degFreq(th.scale, th.padBase, chord[i % chord.length]);
      const pair = layer.pads[i];
      pair.a.frequency.setTargetAtTime(f, t, 0.3);
      pair.b.frequency.setTargetAtTime(f, t, 0.3);
    }
  }

  _fadeOutLayer(layer, now, fade) {
    const g = layer.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, Math.max(0.05, fade / 3));
    layer.stopAt = now + fade * 1.6 + 0.1;
    for (const node of layer.nodes) {
      if (node instanceof OscillatorNode) {
        try { node.stop(layer.stopAt); } catch { /* not started */ }
      }
    }
    this.fadingLayers.push(layer);
  }

  // One 16th-note step: arpeggio, base pulse, intensity percussion, boss ostinato.
  _playStep(t, step) {
    const th = this.theme;
    if (!th) return;

    // Pads move to the next chord on each bar (cheap; runs even when muted so state stays right)
    if (th.pads && this.layer && this.layer.pads && step % 16 === 0) {
      this._setPadChord(this.layer, th.chords[Math.floor(step / 16) % th.chords.length], t);
    }

    if (this.muted) return;

    if (th.arp) {
      const deg = th.arp[step % th.arp.length];
      if (deg !== null && deg !== undefined) this._arpNote(t, th, deg);
    }

    if (th.pulse === 'tom' && step % 4 === 0) {
      // Low tom-like pulse on each beat (sine pitch drop)
      this._mTone({
        wave: 'sine', freq: th.rootLow * 1.5, freqEnd: th.rootLow * 0.55,
        dur: 0.32, gain: 0.2, attack: 0.004, when: t, dest: this.musicBus,
      });
    }
    if (th.pulse === 'tick' && step % 2 === 0) {
      // Faster eighth-note pulse (Crown), accented on the bar
      this._mTone({
        wave: 'triangle', freq: step % 8 === 0 ? 1320 : 990, freqEnd: 660,
        dur: 0.07, gain: 0.04, attack: 0.002, when: t, dest: this.musicBus,
      });
    }

    // Intensity layer: kick on beats, hats on the off-beats (bus gain follows enemy count)
    if (this.intensity > 0.03) {
      if (step % 4 === 0) {
        this._mTone({
          wave: 'sine', freq: 100, freqEnd: 38, dur: 0.22, gain: 0.4, attack: 0.003,
          when: t, dest: this.intensityBus,
        });
      } else if (step % 4 === 2) {
        this._mNoise({
          dur: 0.035, gain: 0.09, attack: 0.002, filterType: 'highpass', freqStart: 7000,
          when: t, dest: this.intensityBus,
        });
      }
    }

    // Boss layer: driving low ostinato (8ths, or 16ths once the boss enters phase 2)
    if (th.ostinato && this.bossLevel > 0.05) {
      const every = this.bossDouble ? 1 : 2;
      if (step % every === 0) {
        const deg = th.ostinato[Math.floor(step / every) % th.ostinato.length];
        const stepDur = 60 / th.bpm / 4;
        this._mTone({
          wave: 'sawtooth', freq: degFreq(th.scale, th.rootLow, deg),
          dur: stepDur * every * 0.9, gain: 0.12, attack: 0.008, when: t, dest: this.bossBus,
          filter: { type: 'lowpass', freq: 320, Q: 2 },
        });
      }
    }
  }

  _arpNote(t, th, deg) {
    const freq = degFreq(th.scale, th.rootMid, deg);
    const filter = th.arpFilter ? { type: 'lowpass', freq: th.arpFilter, Q: 0.7 } : null;
    this._mTone({
      wave: th.arpWave, freq, dur: th.arpDur, gain: th.arpGain, attack: 0.008,
      when: t, dest: this.arpBus, filter,
    });
    if (th.arpPartial) {
      this._mTone({
        wave: 'sine', freq: freq * th.arpPartial.ratio, dur: th.arpDur * 0.45,
        gain: th.arpGain * th.arpPartial.gain, attack: 0.004, when: t, dest: this.arpBus,
      });
    }
  }

  // Music oscillator with an ADSR-ish envelope at absolute time `when`. Self-disconnects when done.
  _mTone({ wave = 'sine', freq, freqEnd = freq, dur, gain = 0.1, attack = 0.01, when, dest, filter = null }) {
    const ctx = this.ctx;
    if (!ctx || !dest || this.musicVoices >= MUSIC_MAX_VOICES) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, when);
      if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.linearRampToValueAtTime(gain, when + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(env);

      let out = env;
      let f = null;
      if (filter) {
        f = ctx.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.value = filter.freq || 2000;
        f.Q.value = filter.Q ?? 1;
        env.connect(f);
        out = f;
      }
      out.connect(dest);

      osc.start(when);
      osc.stop(when + dur + 0.05);
      this.musicVoices++;
      osc.addEventListener('ended', () => {
        this.musicVoices--;
        osc.disconnect();
        env.disconnect();
        if (f) f.disconnect();
      });
    } catch (err) {
      console.error('Music tone error:', err);
    }
  }

  // Music noise burst at absolute time `when` (used for hats and the rift whoosh).
  _mNoise({ dur, gain = 0.1, attack = 0.01, filterType = null, freqStart = null, freqEnd = null, Q = 1, when, dest }) {
    const ctx = this.ctx;
    if (!ctx || !dest || !this.noiseBuffer || this.musicVoices >= MUSIC_MAX_VOICES) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.linearRampToValueAtTime(gain, when + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(env);

      let out = env;
      let f = null;
      if (filterType) {
        f = ctx.createBiquadFilter();
        f.type = filterType;
        f.Q.value = Q;
        env.connect(f);
        out = f;
        if (freqStart !== null) f.frequency.setValueAtTime(freqStart, when);
        if (freqStart !== null && freqEnd !== null) f.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);
      }
      out.connect(dest);

      src.start(when);
      src.stop(when + dur + 0.05);
      this.musicVoices++;
      src.addEventListener('ended', () => {
        this.musicVoices--;
        src.disconnect();
        env.disconnect();
        if (f) f.disconnect();
      });
    } catch (err) {
      console.error('Music noise error:', err);
    }
  }

  // ==================== Music: state events ====================

  _onActStart(e) {
    this.mode = 'act';
    this.musicAct = e && e.act != null ? e.act : 0;
    this.bossDouble = false;
    try {
      this._playGong();
    } catch (err) {
      console.error('Act start sound error:', err);
    }
  }

  _onRiftShift() {
    this.mode = 'shift';
    this.bossDouble = false;
    if (!this.ctx || !this.musicBus) return;
    try {
      const t = this.ctx.currentTime;
      // Music: rising filter sweep, then the bed fades out (see _controlTick) until the next actStart
      this._mNoise({
        dur: 2.6, gain: 0.28, attack: 2.0, filterType: 'bandpass', freqStart: 150, freqEnd: 5000,
        Q: 1.5, when: t, dest: this.musicBus,
      });
      // SFX: huge downward sweep, then an impact
      this._tone({
        type: 'sawtooth', freq: 700, freqEnd: 35, dur: 1.4, gain: 0.16, attack: 0.02,
        filter: { type: 'lowpass', freq: 1800, Q: 1 },
      });
      this._tone({ type: 'sine', freq: 300, freqEnd: 30, dur: 1.4, gain: 0.2, attack: 0.01 });
      this._noise({ dur: 1.2, gain: 0.15, attack: 0.02, filterType: 'lowpass', freqStart: 2500, freqEnd: 200 });
      this._tone({ type: 'sine', freq: 70, freqEnd: 28, dur: 1.0, gain: 0.35, attack: 0.005, delay: 1.3 });
      this._noise({ dur: 0.7, gain: 0.25, attack: 0.003, filterType: 'lowpass', freqStart: 1400, delay: 1.3 });
    } catch (err) {
      console.error('Rift shift sound error:', err);
    }
  }

  _onRunEnd(e) {
    this.mode = 'end';
    this.bossDouble = false;
    if (!this.ctx || !this.musicBus) return;
    try {
      const t = this.ctx.currentTime + 0.05;
      if (e && e.victory) {
        // Victory: major arpeggio up
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this._mTone({ wave: 'triangle', freq: f, dur: 1.4, gain: 0.14, attack: 0.01, when: t + i * 0.11, dest: this.musicBus });
        });
        this._mTone({ wave: 'sine', freq: 2093, dur: 2.0, gain: 0.05, attack: 0.02, when: t + 0.45, dest: this.musicBus });
      } else {
        // Death: low descending minor
        [196, 174.61, 146.83, 110].forEach((f, i) => {
          this._mTone({
            wave: 'sawtooth', freq: f, dur: 1.8, gain: 0.1, attack: 0.02, when: t + i * 0.42,
            dest: this.musicBus, filter: { type: 'lowpass', freq: 600, Q: 0.8 },
          });
        });
      }
    } catch (err) {
      console.error('Run end sound error:', err);
    }
  }

  // ==================== New SFX ====================

  _playGong() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (!this.ctx || now - this.lastGongAt < 0.6) return;
    this.lastGongAt = now;
    // Low inharmonic gong: partials at 1, 1.51, 2.32, 2.76 x 82.4 Hz
    const base = 82.41;
    [[1, 3.2, 0.2], [1.51, 2.4, 0.1], [2.32, 1.6, 0.06], [2.76, 1.1, 0.04]].forEach(([ratio, dur, gain]) => {
      this._tone({ type: 'sine', freq: base * ratio, dur, gain, attack: 0.005 });
    });
    this._noise({ dur: 0.6, gain: 0.03, attack: 0.1, filterType: 'highpass', freqStart: 7000 });
  }

  _onDash(e) {
    const kind = e ? e.kind : undefined;
    if (!this._canPlaySound(`dash_${kind}`, 3, 120)) return;
    try {
      switch (kind) {
        case 'flame':
          // Whoosh + crackle bursts
          this._noise({ dur: 0.22, gain: 0.13, attack: 0.02, filterType: 'bandpass', freqStart: 300, freqEnd: 900, Q: 1.5 });
          for (let i = 0; i < 4; i++) {
            this._noise({
              dur: 0.02, gain: 0.1, attack: 0.002, filterType: 'highpass', freqStart: 2500,
              delay: 0.03 + Math.random() * 0.17,
            });
          }
          break;

        case 'frost':
          // Icy shimmer
          this._tone({ type: 'sine', freq: 2400, freqEnd: 3300, dur: 0.25, gain: 0.05, attack: 0.03 });
          this._noise({ dur: 0.2, gain: 0.05, attack: 0.05, filterType: 'highpass', freqStart: 4000 });
          break;

        case 'storm':
          // Zap
          this._tone({ type: 'square', freq: 1200, freqEnd: 300, dur: 0.09, gain: 0.06, attack: 0.002 });
          this._noise({ dur: 0.08, gain: 0.08, attack: 0.003, filterType: 'highpass', freqStart: 3000, delay: 0.01 });
          break;

        case 'blink':
          // Phasey sine sweep (two detuned sines)
          this._tone({ type: 'sine', freq: 500, freqEnd: 1800, dur: 0.22, gain: 0.1, attack: 0.01 });
          this._tone({ type: 'sine', freq: 510, freqEnd: 1836, dur: 0.22, gain: 0.08, attack: 0.01 });
          break;

        default:
          this._noise({ dur: 0.18, gain: 0.12, attack: 0.03, filterType: 'bandpass', freqStart: 400, freqEnd: 1400, Q: 1.2 });
          break;
      }
    } catch (err) {
      console.error('Dash sound error:', err);
    }
  }

  _onPerfectDodge() {
    if (!this._canPlaySound('perfectDodge', 2, 150)) return;
    try {
      // Reverse whoosh (swell that peaks at its end) landing on a bright time-stop chime
      this._noise({ dur: 0.36, gain: 0.14, attack: 0.3, filterType: 'bandpass', freqStart: 300, freqEnd: 3200, Q: 1.2 });
      this._tone({ type: 'sine', freq: 1760, dur: 0.7, gain: 0.12, attack: 0.003, delay: 0.32 });
      this._tone({ type: 'sine', freq: 2637, dur: 0.6, gain: 0.06, attack: 0.003, delay: 0.32 });
      this._tone({ type: 'triangle', freq: 3520, dur: 0.4, gain: 0.03, attack: 0.003, delay: 0.34 });
    } catch (err) {
      console.error('Perfect dodge sound error:', err);
    }
  }

  _onChestOpened() {
    this.holdDuck(1.0);
    try {
      // Deep thunk + sparkle
      this._tone({ type: 'sine', freq: 95, freqEnd: 38, dur: 0.55, gain: 0.26, attack: 0.005 });
      this._noise({ dur: 0.25, gain: 0.14, attack: 0.005, filterType: 'lowpass', freqStart: 500 });
      [2093, 2637, 3136, 3951].forEach((freq, i) => {
        this._tone({ type: 'sine', freq, dur: 0.35, gain: 0.05, attack: 0.003, delay: 0.1 + i * 0.06 });
      });
    } catch (err) {
      console.error('Chest sound error:', err);
    }
  }

  _onRelicGained() {
    try {
      // Golden chime: C6 E6 G6 rolled, with a shimmer
      [1046.5, 1318.5, 1568].forEach((freq, i) => {
        this._tone({ type: 'sine', freq, dur: 0.7, gain: 0.1, attack: 0.005, delay: i * 0.07 });
      });
      this._tone({ type: 'triangle', freq: 2093, dur: 0.5, gain: 0.04, attack: 0.005, delay: 0.2 });
      this._tone({ type: 'sine', freq: 3136, dur: 0.6, gain: 0.03, attack: 0.02, delay: 0.12 });
    } catch (err) {
      console.error('Relic sound error:', err);
    }
  }

  _onGeodeBroken(e) {
    if (!this._canPlaySound('geodeBroken', 3, 120)) return;
    try {
      const element = e ? e.element : undefined;
      const base = GEODE_PITCH[element] ?? GEODE_PITCH.arcane;
      // Crystal shatter: four rising tinks + a highpassed crack
      [1, 1.5, 2.1, 2.8].forEach((r, i) => {
        this._tone({ type: 'sine', freq: base * r, dur: 0.18, gain: 0.08, attack: 0.002, delay: i * 0.025 });
      });
      this._noise({ dur: 0.15, gain: 0.1, attack: 0.003, filterType: 'highpass', freqStart: 3500, delay: 0.01 });
      if (element === 'fire') {
        this._noise({ dur: 0.25, gain: 0.07, attack: 0.02, filterType: 'bandpass', freqStart: 1200, Q: 2, delay: 0.03 });
      } else if (element === 'storm') {
        this._tone({ type: 'square', freq: 1800, freqEnd: 400, dur: 0.06, gain: 0.04, attack: 0.002, delay: 0.02 });
      }
    } catch (err) {
      console.error('Geode sound error:', err);
    }
  }

  _onShrineClaimed() {
    if (!this._canPlaySound('shrineClaimed', 1, 400)) return;
    try {
      // Choir-ish pad swell (C4 E4 G4 C5, slow attack, lowpassed like distant voices)
      [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
        this._tone({ type: 'sine', freq, dur: 2.6, gain: 0.07, attack: 0.7, delay: i * 0.03, filter: { type: 'lowpass', freq: 1400, Q: 0.7 } });
        this._tone({ type: 'triangle', freq, dur: 2.2, gain: 0.02, attack: 0.9, delay: i * 0.03, filter: { type: 'lowpass', freq: 900, Q: 0.7 } });
      });
    } catch (err) {
      console.error('Shrine claimed sound error:', err);
    }
  }

  _onShrineSpawned() {
    if (!this._canPlaySound('shrineSpawned', 1, 400)) return;
    try {
      // Soft distant bell with a quieter echo
      this._tone({ type: 'sine', freq: 1318.5, dur: 1.6, gain: 0.06, attack: 0.005, filter: { type: 'lowpass', freq: 3000, Q: 0.7 } });
      this._tone({ type: 'sine', freq: 2637, dur: 0.9, gain: 0.015, attack: 0.005, filter: { type: 'lowpass', freq: 3000, Q: 0.7 } });
      this._tone({ type: 'sine', freq: 1318.5, dur: 1.2, gain: 0.02, attack: 0.005, delay: 0.4, filter: { type: 'lowpass', freq: 1500, Q: 0.7 } });
    } catch (err) {
      console.error('Shrine spawned sound error:', err);
    }
  }

  _onBossPhase() {
    this.bossDouble = true;
    try {
      this._roar();
    } catch (err) {
      console.error('Boss phase sound error:', err);
    }
  }

  // Boss roar: distorted, pitch-dropping saw body + lowpassed noise growl
  _roar() {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.9);

    const shaper = ctx.createWaveShaper();
    shaper.curve = getDistortionCurve();

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.9);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);

    osc.connect(shaper);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 1.05);
    osc.addEventListener('ended', () => {
      osc.disconnect();
      shaper.disconnect();
      lp.disconnect();
      g.disconnect();
    });

    this._noise({ dur: 0.9, gain: 0.2, attack: 0.05, filterType: 'lowpass', freqStart: 900, freqEnd: 180, Q: 2 });
  }

  _onWardBroken(e) {
    if (!this._canPlaySound('wardBroken', 2, 150)) return;
    try {
      // Glass break, pitched by the ward element
      const base = (GEODE_PITCH[e ? e.element : undefined] ?? GEODE_PITCH.arcane) * 1.4;
      [1, 1.5, 2.1].forEach((r, i) => {
        this._tone({ type: 'sine', freq: base * r, dur: 0.12, gain: 0.1, attack: 0.002, delay: i * 0.03 });
      });
      this._noise({ dur: 0.14, gain: 0.1, attack: 0.003, filterType: 'highpass', freqStart: 3500 });
    } catch (err) {
      console.error('Ward broken sound error:', err);
    }
  }

  _onChainMilestone(e) {
    if (!this._canPlaySound('chainMilestone', 1, 300)) return;
    try {
      // Rising arpeggio; longer for higher milestones (10 -> 3 notes, 25 -> 5, 50 -> 7)
      const chain = e && e.chain ? e.chain : 10;
      const count = chain >= 50 ? 7 : chain >= 25 ? 5 : 3;
      const steps = [0, 4, 7, 12, 16, 19, 24];   // major arpeggio in semitones
      const base = 523.25;
      for (let i = 0; i < count; i++) {
        this._tone({
          type: 'triangle', freq: base * Math.pow(2, steps[i] / 12), dur: 0.3,
          gain: 0.1, attack: 0.005, delay: i * 0.055,
        });
      }
    } catch (err) {
      console.error('Chain milestone sound error:', err);
    }
  }

  _onHazard(e) {
    const kind = e ? e.kind : undefined;
    if (kind !== 'lava' && kind !== 'lightning') return;
    if (!this._canPlaySound(`hazard_${kind}`, 2, 150)) return;
    try {
      if (kind === 'lava') {
        // Rumble burst
        this._noise({ dur: 0.9, gain: 0.2, attack: 0.1, filterType: 'lowpass', freqStart: 260 });
        this._tone({ type: 'sine', freq: 55, freqEnd: 38, dur: 0.9, gain: 0.14, attack: 0.08 });
      } else {
        // Lightning crack + thunder tail
        this._noise({ dur: 0.12, gain: 0.22, attack: 0.002, filterType: 'highpass', freqStart: 2500 });
        this._tone({ type: 'square', freq: 900, freqEnd: 150, dur: 0.1, gain: 0.08, attack: 0.002 });
        this._tone({ type: 'sine', freq: 60, freqEnd: 35, dur: 0.6, gain: 0.12, attack: 0.02, delay: 0.05 });
      }
    } catch (err) {
      console.error('Hazard sound error:', err);
    }
  }
}
