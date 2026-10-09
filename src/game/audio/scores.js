// =====================================================================================
//  Boss scores (Riftbound v5, design/research/12-boss-scores.md).
//  Pure data + a compiler. No audio nodes here. Three scores, each a stem matrix:
//    sections (intro, p1, inter, p2, p3) x stems (drums, bass, brass, choir, organ, bells ...)
//  Pattern vocabulary (a section's `stems: { stem: patName | [patName, paramOverride, gainMul] }`):
//    drums  string, one char per 16th step (see Audio._drum)
//    seq    [deg|null ...] per step, or { seq, gate }       (monophonic line, gate = length in steps)
//    notes  [[step, deg, lenSteps, vel?] ...]  (loops over ceil(end / bar) bars)
//    chords { prog, every, follow?, alt? }                   (override of the stem's defaults)
//    roll   { every, hit }                                   (crescendo, only plays while `exit` is set)
//  `deg` indexes the score scale (wraps by octave, negative = down); degFreq works for any length.
// =====================================================================================

export const SCALE_PENT_MIN = [0, 3, 5, 7, 10];
export const SCALE_PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];
export const SCALE_LYDIAN = [0, 2, 4, 6, 7, 9, 11];
export const SCALE_WHOLE = [0, 2, 4, 6, 8, 10];

// Scale degree -> frequency. Degrees wrap by octave; negative degrees go down.
export function degFreq(scale, base, deg) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  const idx = ((deg % n) + n) % n;
  return base * Math.pow(2, oct + scale[idx] / 12);
}

// Boss id (boss.id / encounter.bossId) -> score key
export const BOSS_KEY = { hollowWarden: 'boss:gorrak', vashkar: 'boss:vashkar', riftHeart: 'boss:aurelith' };
// Prism Ward element -> chord index (Aurelith)
export const WARD_INDEX = { fire: 0, frost: 1, storm: 2, arcane: 3 };

// ------------------------------------------------------------------------------------- GORRAK
// "Hollow Throne": F minor pentatonic, 6/8 at 150, taiko + bone horn + male chant, open fifths (no third).
const GORRAK = {
  key: 'boss:gorrak', boss: true, id: 'hollowWarden', name: 'Hollow Throne',
  bpm: 150, bar: 12, beat: 6, quant: 12,            // 6/8: dotted-quarter = 0.6 s, bar = 1.2 s
  scale: SCALE_PENT_MIN, low: 87.31, mid: 174.61, rootLow: 87.31, drum: 87.31,
  droneCut: 240, level: 1, echo: 0.3,
  bed: { drone: [['sawtooth', 1, -9, 0.07], ['sawtooth', 1.5, 6, 0.04], ['triangle', 0.5, 0, 0.09], ['sine', 1, 0, 0.06]], vowel: 'o' },
  check: { f0: 90, f1: 300 },
  stems: {
    drums: { kind: 'drums', bus: 'rhy' },
    shake: { kind: 'drums', bus: 'rhy', hushable: true },
    bass:  { kind: 'seq', voice: 'brass', base: 'low', bus: 'rhy', gain: 0.115, gate: 2,
             p: { n: 2, spread: 10, open: 3, settle: 1.6, attack: 0.02, slide: 0.5, sus: 0.5, floor: 520, prio: 0 } },
    horn:  { kind: 'notes', voice: 'brass', base: 'mid', bus: 'sus', gain: 0.12, ghost: true,
             p: { n: 2, spread: 14, open: 2.6, settle: 1.8, attack: 0.07, slide: 2 } },
    chant: { kind: 'notes', voice: 'choir', base: 'low', oct: 1, bus: 'sus', gain: 0.16, hushable: true,
             p: { attack: 0.02, rel: 0.08, voices: 2 } },
    burn:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 1, bus: 'sus', gain: 0.065, when: 'downed', p: { n: 2, attack: 0.03 } },
    rage:  { kind: 'notes', voice: 'brass', base: 'mid', bus: 'sus', gain: 0.07, when: 'enrage',
             p: { n: 2, spread: 22, open: 5, settle: 3, attack: 0.012, sus: 0.3, Q: 4 } },
    roll:  { kind: 'roll', hit: 'taiko', every: 2, bus: 'rhy', when: 'exit' },
  },
  pats: {
    drumsP1: 'X.o.o.x.o.o.' + 'X.o.o.X.o.xo',
    drumsP2: 'X.o.xoX.o.xo' + 'X.xoxoXxoxxo',
    drumsP3: 'XoxoxoXoxoxo' + 'XoxoxoXoxoxx',
    heart:   'X.....x.....' + '............',
    roll16:  'o...o...o...o.o.o.o.oxox',
    shakeP1: 'h.h.h.h.h.h.', shakeP2: 'hhhhhhhhhhhh',
    bassP1:  [0, null, null, null, null, null, 0, null, null, 0, null, -1],
    bassP2:  [0, null, 0, null, -1, null, 0, null, 3, null, -1, null],
    bassP3:  [0, 0, null, 0, -1, 0, 0, 0, null, 0, 3, -1],
    pedal:   { seq: [0, null, null, null, null, null, null, null, null, null, null, null], gate: 12 },
    call:    [[0, 3, 5], [6, 2, 3], [9, 0, 3], [12, 3, 6], [18, 4, 3], [21, 3, 3]],
    call2:   [[0, 5, 5], [6, 4, 3], [9, 3, 3], [12, 5, 6], [18, 7, 3], [21, 5, 3]],
    introHorn: [[0, 3, 22]],
    echo:    [[0, 3, 5], [6, 2, 3], [9, 0, 6]],
    chantP1: [[4, 0, 2], [10, 0, 2], [16, 3, 2], [22, 0, 2]],
    drone:   [[0, 0, 24], [0, 3, 24]],
    burnP:   [[0, 5, 3], [6, 7, 3], [12, 5, 3], [18, 7, 3]],
    rageP:   [[0, 3, 3], [6, 3, 3], [0, 5, 3], [6, 5, 3]],
  },
  sections: {
    intro: { bars: 2, next: 'p1', bpm: 150, stems: { horn: 'introHorn', drums: 'roll16' } },
    p1:    { bars: 8, bpm: 150, stems: { drums: ['drumsP1', {}, 0.85], bass: 'bassP1', horn: 'call', chant: 'chantP1', shake: 'shakeP1', burn: 'burnP', rage: 'rageP' } },
    inter: { bars: 0, bpm: 120, quant: 6, vowel: 'u', stems: { drums: 'heart', bass: 'pedal', chant: ['drone', {}, 0.7], horn: ['echo', {}, 0.6], roll: 'on' } },
    p2:    { bars: 8, bpm: 160, stems: { drums: ['drumsP2', {}, 0.85], bass: 'bassP2', horn: 'call2', chant: 'chantP1', shake: 'shakeP2', burn: 'burnP', rage: 'rageP' } },
    p3:    { bars: 8, bpm: 168, stems: { drums: ['drumsP3', {}, 0.8], bass: 'bassP3', horn: ['call2', { n: 3, spread: 18 }], chant: 'chantP1', shake: 'shakeP2', burn: 'burnP', rage: 'rageP' } },
  },
  sectionSting: { p1: 'p1', inter: 'inter', p2: 'phase', p3: 'phase' },
  stings: {
    seal: { hit: [ { fn: 'riser', p: { dur: 1.4, f0: 70, f1: 260, gain: 0.1 } } ] },
    summon: { hit: [ { fn: 'impact', p: { f0: 80, f1: 34, dur: 1.8 } },
                     { fn: 'brass', at: 0.05, p: { freq: 130.8, dur: 1.4, gain: 0.1, attack: 0.1, n: 2, slide: 3 } } ] },
    p1:     { hit: [ { fn: 'impact', p: { f0: 85, f1: 36, dur: 1.2, gain: 0.35 } }, { fn: 'drum', at: 0, p: { c: 'X' } } ] },
    inter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 90, f1: 300 } } ],
              hit: [ { fn: 'impact', p: { f0: 70, f1: 30, dur: 2 } }, { fn: 'drum', at: 0, p: { c: 'X' } } ] },
    phase:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 110, f1: 440 } } ],
              hit: [ { fn: 'impact', p: { f0: 90, f1: 32, dur: 1.4 } },
                     { fn: 'brass', p: { freq: 174.6, dur: 0.9, gain: 0.11, n: 3, slide: 2, attack: 0.04 } },
                     { fn: 'drum', at: 0.15, p: { c: 'X' } }, { fn: 'drum', at: 0.3, p: { c: 'X' } } ] },
    echo:   { hit: [ { fn: 'impact', p: { f0: 80, f1: 32, dur: 1.6 } },
                     { fn: 'brass', p: { freq: 174.6, dur: 1.1, gain: 0.1, n: 3, slide: 2, attack: 0.05 } },
                     { fn: 'choir', at: 0.1, p: { freq: 349.2, dur: 1.6, gain: 0.07, attack: 0.3, voices: 1, detune: 17 } },
                     { fn: 'drum', at: 0.15, p: { c: 'X' } } ] },
    mend:   { hit: [ { fn: 'riser', p: { dur: 'fit', f0: 60, f1: 240, gain: 0.07 } },
                     { fn: 'choir', at: 0.2, p: { freq: 174.6, dur: 'fit', gain: 0.09, attack: 0.9 } },
                     { fn: 'choir', at: 0.2, p: { freq: 261.6, dur: 'fit', gain: 0.07, attack: 0.9 } },
                     { fn: 'drum', at: 0.2, p: { c: 'x' } }, { fn: 'drum', at: 1.2, p: { c: 'x' } } ] },
    win:    { len: 2.4, silence: 0.35, hit: [
              { fn: 'impact', at: 0.0, p: { f0: 72, f1: 36, dur: 1.9, gain: 0.4 } },
              { fn: 'brass', at: 0.0, p: { freq: 130.8, dur: 1.9, gain: 0.17, attack: 0.15, n: 3, slide: 3.5, sus: 0.7, floor: 600 } },
              { fn: 'choir', at: 0.1, p: { freq: 87.31, dur: 1.8, gain: 0.16, attack: 0.3, voices: 2 } },
              { fn: 'choir', at: 0.1, p: { freq: 130.81, dur: 1.8, gain: 0.13, attack: 0.3, voices: 2 } },
              { fn: 'drum', at: 0.0, p: { c: 'X' } }, { fn: 'drum', at: 0.7, p: { c: 'x' } }, { fn: 'drum', at: 1.6, p: { c: 'x' } } ] },
  },
};

// ------------------------------------------------------------------------------------- VASHKAR
// "Ashen March": C phrygian-dominant, 4/4 half-time march at 138, 7/8 in P3, low saw brass, snare, anvil.
const VASHKAR = {
  key: 'boss:vashkar', boss: true, id: 'vashkar', name: 'Ashen March',
  bpm: 138, bar: 16, beat: 4, quant: 8,
  scale: SCALE_PHRYG_DOM, low: 65.41, mid: 261.63, rootLow: 65.41, drum: 65.41,
  droneCut: 280, level: 1, echo: 0.326,
  bed: { drone: [['sawtooth', 1, -12, 0.07], ['sawtooth', 1.5, 9, 0.035], ['sine', 1, 0, 0.12]], vowel: 'A', crackle: true },
  check: { f0: 80, f1: 260 },
  stems: {
    drums: { kind: 'drums', bus: 'rhy' },
    low:   { kind: 'seq', voice: 'brass', base: 'low', oct: 0, bus: 'rhy', gain: 0.13, gate: 2,
             p: { n: 3, spread: 12, open: 4.5, settle: 1.8, Q: 3, attack: 0.02, slide: 0.3, sus: 0.6, rel: 0.06, floor: 560, prio: 0 } },
    str:   { kind: 'seq', voice: 'str', base: 'low', oct: 1, bus: 'sus', gain: 0.1, gate: 1, hushable: true, p: { cut: 1300, n: 1 } },
    banner: { kind: 'notes', voice: 'brass', base: 'mid', bus: 'sus', gain: 0.11, ghost: true,
              p: { n: 3, spread: 9, open: 5, settle: 2.2, attack: 0.04, slide: 0.35 } },
    choir: { kind: 'chords', voice: 'choir', base: 'low', oct: 1, bus: 'sus', gain: 0.11, every: 16,
             prog: [[0, 4], [1, 5], [0, 4], [6, 4]], p: { attack: 0.4, voices: 1 } },
    anvil: { kind: 'drums', bus: 'rhy', when: 'enrage' },
    burn:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 1, bus: 'sus', gain: 0.065, when: 'downed', p: { n: 2 } },
    rage:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 1, bus: 'sus', gain: 0.06, when: 'enrage', p: { n: 2, open: 6, attack: 0.02 } },
    roll:  { kind: 'roll', hit: 'snare', every: 1, bus: 'rhy', when: 'exit' },
  },
  pats: {
    drumsP1: 'X...o...s...o.x.' + 'X.o.o...s..xs.o.',
    drumsP2: 'X.s.s.s.X.s.sxs.' + 'X.sgs.s.X.sgsxsg',
    drumsP3: 'X.o.X.o.s.xos.' + 'X.o.X.o.s.sgsx',
    anvilP:  'a.......a.......',
    anvilP3: 'a.....a.a.....',
    snareRoll: 'g...g...g...g...g.g.g.g.gsgsgsgs',
    pedalC:  { seq: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], gate: 16 },
    lowP1:   [0, null, null, 0, null, 0, null, null, 0, null, 1, null, 0, null, null, null],
    lowP2:   [0, null, 0, 0, null, 0, 1, null, 0, null, 0, 0, 2, null, 1, null],
    lowP3:   [0, null, 0, null, 1, null, 0, null, 0, 0, 1, null, 2, null],
    strP2:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    strP3:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    theme:   [[0, 5, 5], [6, 1, 1], [8, 2, 3], [12, 1, 2], [14, 0, 2], [16, 0, 4], [20, 1, 2], [22, 2, 2], [24, 3, 4], [28, 2, 2], [30, 1, 2]],
    themeHalf: [[16, 0, 4], [20, 1, 2], [22, 2, 2], [24, 3, 4], [28, 2, 2], [30, 1, 2]],
    themeP3: [[0, 3, 3], [4, 2, 2], [6, 1, 2], [8, 0, 6]],
    rageP:   [[0, 0, 2], [4, 1, 2], [8, 2, 2], [12, 3, 2]],
    choirP3: { prog: [[0, 4], [1, 5], [0, 4], [6, 4]], every: 14 },
  },
  sections: {
    intro: { bars: 2, next: 'p1', bpm: 138, stems: { drums: 'snareRoll', banner: 'themeHalf', low: 'pedalC' } },
    p1:    { bars: 8, bpm: 138, stems: { drums: 'drumsP1', low: 'lowP1', banner: 'theme', choir: 'on', burn: 'theme', anvil: 'anvilP', rage: 'rageP' } },
    inter: { bars: 0, bpm: 138, quant: 4, stems: { low: 'pedalC', choir: 'on', str: ['strP2', {}, 0.7], roll: 'on' } },
    p2:    { bars: 8, bpm: 144, stems: { drums: 'drumsP2', low: 'lowP2', str: 'strP2', banner: 'theme', choir: 'on', burn: 'theme', anvil: 'anvilP', rage: 'rageP' } },
    p3:    { bars: 8, bpm: 150, bar: 14, beat: 4, quant: 14, stems: { drums: 'drumsP3', low: 'lowP3', str: 'strP3', banner: 'themeP3', choir: 'choirP3', anvil: 'anvilP3', burn: 'themeP3', rage: 'rageP' } },
  },
  sectionSting: { p1: 'p1', inter: 'inter', p2: 'phase', p3: 'meter' },
  stings: {
    seal: { hit: [ { fn: 'riser', p: { dur: 1.4, f0: 60, f1: 220, gain: 0.1 } } ] },
    summon: { hit: [ { fn: 'impact', p: { f0: 70, f1: 30, dur: 1.8 } },
                     { fn: 'brass', at: 0.02, p: { freq: 65.41, dur: 1.6, gain: 0.12, n: 3, attack: 0.05, floor: 500 } },
                     { fn: 'drum', at: 0.4, p: { c: 'a' } } ] },
    p1:     { hit: [ { fn: 'impact', p: { f0: 75, f1: 32, dur: 1.1, gain: 0.35 } }, { fn: 'drum', at: 0, p: { c: 'a' } } ] },
    inter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 80, f1: 260 } } ],
              hit: [ { fn: 'impact', p: { f0: 75, f1: 30, dur: 2.2 } }, { fn: 'brass', p: { freq: 65.41, dur: 3, gain: 0.1, n: 3, attack: 0.12, floor: 500 } } ] },
    phase:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 100, f1: 500 } }, { fn: 'drum', at: 0, p: { c: 's' } } ],
              hit: [ { fn: 'impact', p: { f0: 85, f1: 30 } }, { fn: 'brass', p: { freq: 130.8, dur: 0.7, gain: 0.12, n: 3 } },
                     { fn: 'drum', p: { c: 'a' } } ] },
    meter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 100, f1: 600 } } ],
              hit: [ { fn: 'impact', p: { f0: 95, f1: 28, dur: 1.5 } }, { fn: 'brass', p: { freq: 98, dur: 0.8, gain: 0.12, n: 3 } } ] },
    echo:   { hit: [ { fn: 'impact', p: { f0: 80, f1: 30, dur: 1.6 } },
                     { fn: 'brass', p: { freq: 130.8, dur: 0.9, gain: 0.11, n: 3 } },
                     { fn: 'choir', at: 0.05, p: { freq: 261.6, dur: 1.6, gain: 0.07, attack: 0.3, voices: 1, detune: 17 } },
                     { fn: 'drum', p: { c: 'a' } } ] },
    mend:   { hit: [ { fn: 'riser', p: { dur: 'fit', f0: 70, f1: 200, gain: 0.07 } },
                     { fn: 'brass', at: 0.2, p: { freq: 65.41, dur: 'fit', gain: 0.08, n: 3, attack: 0.8, floor: 500 } },
                     { fn: 'choir', at: 0.3, p: { freq: 130.8, dur: 'fit', gain: 0.07, attack: 0.9 } },
                     { fn: 'drum', at: 0.2, p: { c: 'a' } } ] },
    win:    { len: 2.4, silence: 0.5, hit: [
              { fn: 'drum', at: 0, p: { c: 's' } }, { fn: 'drum', at: 0.18, p: { c: 'g' } },
              { fn: 'brass', at: 0.0, p: { freq: 130.8, dur: 1.9, gain: 0.17, n: 3, attack: 0.2, sus: 0.8, floor: 600 } },
              { fn: 'brass', at: 0.0, p: { freq: 164.8, dur: 1.9, gain: 0.13, n: 2, attack: 0.2 } },
              { fn: 'brass', at: 0.0, p: { freq: 196.0, dur: 1.9, gain: 0.13, n: 2, attack: 0.2 } },
              { fn: 'drum', at: 0.05, p: { c: 'a' } }, { fn: 'impact', at: 0.0, p: { f0: 60, f1: 36, dur: 1.6, gain: 0.3 } } ] },
  },
};

// ------------------------------------------------------------------------------------- AURELITH
// "Prismatic Chorale": Eb lydian, organ pedal + soprano choir + FM bells + timpani; chord follows the Prism Ward.
const AURELITH = {
  key: 'boss:aurelith', boss: true, id: 'riftHeart', name: 'Prismatic Chorale',
  bpm: 96, bar: 16, beat: 4, quant: 8,
  scale: SCALE_LYDIAN, low: 77.78, mid: 311.13, rootLow: 77.78, drum: 77.78,
  droneCut: 420, level: 1, echo: 0.3125,
  bed: { drone: [['sawtooth', 1, -6, 0.035], ['sawtooth', 1, 6, 0.035], ['sine', 1, 0, 0.09], ['triangle', 0.5, 0, 0.04]], vowel: 'a', lfo: { rate: 0.05, depth: 180 } },
  check: { f0: 150, f1: 700 },
  stems: {
    pedal: { kind: 'chords', voice: 'organ', base: 'low', bus: 'sus', gain: 0.06, every: 32, prog: [[0]], p: { lp: 1800, attack: 0.3, rel: 0.6 } },
    organ: { kind: 'chords', voice: 'organ', base: 'mid', bus: 'sus', gain: 0.045, every: 16, follow: true,
             prog: [[0, 4], [1, 5], [5, 9], [4, 8]], p: { lp: 2600, attack: 0.15, rel: 0.35 } },
    choir: { kind: 'chords', voice: 'choir', base: 'mid', bus: 'sus', gain: 0.07, every: 16, follow: true,
             prog: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [4, 6, 8]], p: { attack: 0.5, rel: 0.4, voices: 1 } },
    lead:  { kind: 'notes', voice: 'choir', base: 'mid', oct: 1, bus: 'sus', gain: 0.07, ghost: true, p: { attack: 0.08, rel: 0.35, voices: 1 } },
    brass: { kind: 'notes', voice: 'brass', base: 'low', oct: 1, bus: 'sus', gain: 0.075, p: { n: 2, spread: 8, open: 3.2, settle: 2, attack: 0.1, slide: 0.2, floor: 480 } },
    timp:  { kind: 'drums', bus: 'rhy' },
    bells: { kind: 'notes', voice: 'bell', base: 'mid', oct: 1, bus: 'bell', gain: 0.05, hushable: true, p: { dur: 1.4, ratio: 1.4, index: 4 } },
    shim:  { kind: 'notes', voice: 'ping', base: 'mid', oct: 1, bus: 'bell', gain: 0.045, hushable: true, scale: 'whole', p: { dur: 0.5 } },
    burn:  { kind: 'notes', voice: 'brass', base: 'mid', oct: 0, bus: 'sus', gain: 0.065, when: 'downed', p: { n: 2, attack: 0.04 } },
    scream: { kind: 'notes', voice: 'choir', base: 'mid', oct: 1, bus: 'sus', gain: 0.05, when: 'enrage', p: { attack: 0.05, rel: 0.3, voices: 2 } },
    rage:  { kind: 'drums', bus: 'rhy', when: 'enrage' },
    roll:  { kind: 'roll', hit: 'timp', every: 2, bus: 'rhy', when: 'exit' },
  },
  pats: {
    timpP1:  'T.......t.......' + 'T.......t...T...',
    timpP2:  't...T...t...T.t.' + 't...T...t.T.t.Tt',
    timpP3:  't.T.t.T.t.T.tTtT',
    rageP:   'u.u.u.u.u.u.u.u.',
    lead:    [[0, 0, 8], [8, 2, 4], [12, 4, 4], [16, 3, 10], [26, 4, 2], [28, 2, 4]],
    leadP3:  [[0, 4, 4], [4, 6, 4], [8, 7, 8], [16, 6, 4], [20, 4, 4], [24, 3, 8]],
    bellsP1: [[0, 0, 1], [8, 2, 1], [16, 4, 1], [24, 3, 1]],
    shimP2:  [[2, 0, 1], [3, 1, 1], [4, 2, 1], [5, 3, 1], [6, 4, 1], [7, 5, 1], [10, 3, 1], [11, 2, 1], [12, 1, 1]],
    cascadeUp: [[0, 0, 1], [2, 1, 1], [4, 2, 1], [6, 3, 1], [8, 4, 1], [10, 5, 1], [12, 6, 1], [14, 7, 1]],
    brassP3: [[0, 0, 3], [4, 0, 3], [8, 0, 3], [12, 0, 3]],
    cluster: { prog: [[0, 3, 6]], every: 16, follow: false },
    fast:    { prog: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [4, 6, 8]], every: 8, follow: true, alt: 1 },
  },
  sections: {
    intro: { bars: 2, next: 'p1', stems: { pedal: 'on', choir: 'cluster', shim: 'cascadeUp' } },
    p1:    { bars: 8, bpm: 96,  stems: { pedal: 'on', organ: 'on', choir: 'on', lead: 'lead', bells: 'bellsP1', timp: 'timpP1', burn: 'lead', rage: 'rageP', scream: 'leadP3' } },
    inter: { bars: 0, bpm: 96,  quant: 4, vowel: 'u', stems: { pedal: 'on', choir: 'cluster', shim: 'shimP2', roll: 'on', bells: 'bellsP1' } },
    p2:    { bars: 8, bpm: 104, stems: { pedal: 'on', organ: 'on', choir: 'on', lead: 'lead', brass: 'brassP3', bells: 'bellsP1', shim: 'shimP2', timp: 'timpP2', burn: 'lead', rage: 'rageP', scream: 'leadP3' } },
    p3:    { bars: 8, bpm: 112, stems: { pedal: 'on', organ: 'on', choir: 'fast', lead: 'leadP3', brass: 'brassP3', bells: 'bellsP1', shim: 'shimP2', timp: 'timpP3', burn: 'leadP3', rage: 'rageP', scream: 'leadP3' } },
  },
  sectionSting: { p1: 'p1', inter: 'inter', p2: 'phase', p3: 'phase' },
  stings: {
    seal: { hit: [ { fn: 'riser', p: { dur: 1.4, f0: 110, f1: 600, gain: 0.09 } } ] },
    summon: { hit: [ { fn: 'impact', p: { f0: 70, f1: 30, dur: 2.5 } },
                     { fn: 'organ', at: 0.02, p: { freq: 155.6, dur: 3.5, gain: 0.09, attack: 0.5 } },
                     { fn: 'choir', at: 0.3, p: { freq: 311.1, dur: 3.2, gain: 0.08, attack: 0.9 } },
                     { fn: 'choir', at: 0.3, p: { freq: 440.0, dur: 3.2, gain: 0.07, attack: 0.9 } },
                     { fn: 'bell', at: 1.2, p: { freq: 2489, dur: 2.6, gain: 0.04 } }, { fn: 'bell', at: 1.4, p: { freq: 3136, dur: 2.6, gain: 0.035 } } ] },
    p1:     { hit: [ { fn: 'impact', p: { f0: 80, f1: 34, dur: 1.4, gain: 0.3 } }, { fn: 'drum', at: 0, p: { c: 't' } } ] },
    inter:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 150, f1: 900 } } ],
              hit: [ { fn: 'impact', p: { f0: 80, f1: 30, dur: 2.2 } }, { fn: 'organ', p: { freq: 311.1, dur: 3, gain: 0.08, attack: 0.3 } } ] },
    phase:  { pre: [ { fn: 'riser', p: { dur: 'fit', f0: 120, f1: 700 } } ],
              hit: [ { fn: 'impact', p: { f0: 85, f1: 30 } }, { fn: 'brass', p: { freq: 155.6, dur: 1.2, gain: 0.1, n: 3, attack: 0.05 } },
                     { fn: 'bell', at: 0.05, p: { freq: 2093, dur: 2.5, gain: 0.04 } } ] },
    echo:   { hit: [ { fn: 'impact', p: { f0: 80, f1: 30, dur: 2 } },
                     { fn: 'organ', p: { freq: 311.1, dur: 2.5, gain: 0.08, attack: 0.2 } },
                     { fn: 'choir', at: 0.1, p: { freq: 622.3, dur: 2.2, gain: 0.07, attack: 0.5, voices: 1, detune: 17 } },
                     { fn: 'bell', at: 0.1, p: { freq: 2093, dur: 2.5, gain: 0.04 } }, { fn: 'bell', at: 0.25, p: { freq: 2118, dur: 2.5, gain: 0.03 } } ] },
    mend:   { hit: [ { fn: 'riser', p: { dur: 'fit', f0: 200, f1: 1100, gain: 0.07 } },
                     { fn: 'organ', at: 0.1, p: { freq: 233.1, dur: 'fit', gain: 0.08, attack: 0.8 } },
                     { fn: 'choir', at: 0.2, p: { freq: 311.1, dur: 'fit', gain: 0.07, attack: 0.9 } },
                     { fn: 'choir', at: 0.2, p: { freq: 440.0, dur: 'fit', gain: 0.06, attack: 0.9 } },
                     { fn: 'bell', at: 0.6, p: { freq: 1568, dur: 2.5, gain: 0.04 } } ] },
    win:    { len: 8.5, silence: 0.9, hit: [
              { fn: 'organ', at: 0.0, p: { freq: 155.6, dur: 7, gain: 0.13, attack: 0.5, rel: 2 } },
              { fn: 'organ', at: 0.0, p: { freq: 311.1, dur: 7, gain: 0.07, attack: 0.5, rel: 2 } },
              { fn: 'choir', at: 0.1, p: { freq: 311.1, dur: 6.5, gain: 0.13, attack: 0.9, rel: 2 } },
              { fn: 'choir', at: 0.1, p: { freq: 392.0, dur: 6.5, gain: 0.12, attack: 0.9, rel: 2 } },
              { fn: 'choir', at: 0.1, p: { freq: 466.2, dur: 6.5, gain: 0.12, attack: 0.9, rel: 2 } },
              { fn: 'choir', at: 0.7, p: { freq: 587.3, dur: 5.9, gain: 0.09, attack: 0.9, rel: 2 } },
              { fn: 'bell', at: 1.1, p: { freq: 1244.5, dur: 3, gain: 0.045 } }, { fn: 'bell', at: 1.4, p: { freq: 1568, dur: 3, gain: 0.045 } },
              { fn: 'bell', at: 1.7, p: { freq: 1864.7, dur: 3, gain: 0.04 } }, { fn: 'bell', at: 2.0, p: { freq: 2489, dur: 4, gain: 0.035 } },
              { fn: 'drum', at: 3.5, p: { c: 'T' } } ] },
  },
};

// ------------------------------------------------------------------------------------- compiler
function maxEnd(list) {
  let m = 0;
  for (const n of list) m = Math.max(m, n[0] + (n[2] || 1));
  return m;
}

// Resolve one `stems[name]` assignment of a section into an allocation-free runtime record.
function compileStem(sc, sec, name, assign) {
  const def = sc.stems[name];
  if (!def) throw new Error(`score ${sc.key}: unknown stem ${name}`);
  const patName = Array.isArray(assign) ? assign[0] : assign;
  const pOver = Array.isArray(assign) ? assign[1] || null : null;
  const gainMul = Array.isArray(assign) && assign[2] != null ? assign[2] : 1;
  const raw = patName === 'on' ? undefined : sc.pats[patName];
  if (patName !== 'on' && raw === undefined) throw new Error(`score ${sc.key}: unknown pattern ${patName} (stem ${name})`);
  const c = {
    name, kind: def.kind, voice: def.voice, base: def.base, oct: def.oct || 0, bus: def.bus || 'sus',
    gain: (def.gain ?? 0.08) * gainMul, gm: gainMul, hushable: !!def.hushable, when: def.when || null, ghost: !!def.ghost,
    scale: def.scale === 'whole' ? SCALE_WHOLE : sc.scale, p: pOver ? { ...(def.p || {}), ...pOver } : (def.p || {}),
    len: 1, pat: null, at: null, gate: def.gate || 1, every: def.every || 16, prog: def.prog || null,
    follow: !!def.follow, alt: 0, hit: def.hit || 'taiko', rollEvery: def.every || 2,
  };
  switch (def.kind) {
    case 'drums':
      if (typeof raw !== 'string') throw new Error(`score ${sc.key}: drums pattern ${patName} must be a string`);
      c.pat = raw; c.len = raw.length; break;
    case 'seq': {
      const s = Array.isArray(raw) ? { seq: raw } : raw;
      c.pat = s.seq; c.len = s.seq.length; c.gate = s.gate || def.gate || 1; break;
    }
    case 'notes': {
      const list = Array.isArray(raw) ? raw : raw.notes;
      const bar = sec.bar;
      c.len = Math.max(bar, Math.ceil(maxEnd(list) / bar) * bar);
      c.at = new Array(c.len).fill(null);
      for (const n of list) (c.at[n[0]] || (c.at[n[0]] = [])).push([n[1], n[2] || 1, n[3] == null ? 1 : n[3]]);
      break;
    }
    case 'chords': {
      if (raw) {
        c.prog = raw.prog || c.prog; c.every = raw.every || c.every;
        if (raw.follow != null) c.follow = !!raw.follow;
        c.alt = raw.alt || 0;
      }
      c.len = c.every; break;
    }
    case 'roll': break;
    default: throw new Error(`score ${sc.key}: unknown stem kind ${def.kind}`);
  }
  return c;
}

export function compileScore(sc) {
  sc.sec = {};
  for (const [name, s] of Object.entries(sc.sections)) {
    const sec = {
      name, bars: s.bars, bar: s.bar || sc.bar, beat: s.beat || sc.beat, quant: s.quant || sc.quant,
      bpm: s.bpm || sc.bpm, next: s.next || null, vowel: s.vowel || sc.bed.vowel, stems: [],
    };
    for (const [stem, assign] of Object.entries(s.stems)) sec.stems.push(compileStem(sc, sec, stem, assign));
    sc.sec[name] = sec;
  }
  return sc;
}

export const SCORES = {};
for (const sc of [GORRAK, VASHKAR, AURELITH]) SCORES[sc.key] = compileScore(sc);
