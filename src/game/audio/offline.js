// =====================================================================================
//  DEV: offline render + metrics for the boss scores (no ear required).
//    const O = await import('/src/game/audio/offline.js?v=' + Date.now());
//    const r = await O.renderSection('gorrak', 'p1', 12);          // one section, 12 s
//    const f = await O.renderFight('vashkar', { secs: 60 });       // a scripted fight: spawn, inter, p2, downed, ...
//    r.metrics  -> { peak, rmsDb, bands (%), windows [{ t, rms, peak }], voiceHigh, drops }
//    await O.uploadWav('raid-audio-gorrak-p1', r.buffer)           // -> dev/shots via the shots server (PUT /__promo/out/<name>.wav)
//    await O.selfTest()                                             // all three scores, asserts
//  The real Audio class is driven with `offline: true`: its voice counter uses [start, stop) intervals
//  and `clock` replaces ctx.currentTime, so every scheduling path is the production one.
// =====================================================================================
import { Audio } from '../audio.js';
import { Events } from '../../core/events.js';
import { SCORES, BOSS_KEY } from './scores.js';
import { BOSS_MUSIC_LEVEL } from './score.js';

const BANDS = [['sub<120', 0, 120], ['low120-500', 120, 500], ['mid500-2k', 500, 2000], ['pres2-4k', 2000, 4000], ['hi4-8k', 4000, 8000], ['air>8k', 8000, 1e9]];
const ID = { gorrak: 'hollowWarden', vashkar: 'vashkar', aurelith: 'riftHeart' };

function makeRig(key, { secs = 20, sr = 44100, muted = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
  const boss = { id: ID[key.replace('boss:', '')], musicState: 'p1', phase: 1, enrage: 0, downed: false, ward: null, intT: 0 };
  const game = { events: new Events(), boss: null, state: 'playing', encounter: { active: true, bossId: boss.id }, enemies: [] };
  const a = new Audio(game, { headless: true, offline: true });
  a.muted = muted;
  a._setupContext(ctx, false);
  if (key.startsWith('boss:')) a.musicBus.gain.value = BOSS_MUSIC_LEVEL;
  return { ctx, a, game, boss, sr, secs, vt: [] };
}

// Step the production scheduler path offline from t0 to secs. `script` = [{ at, fn(rig) }] sorted by time.
function run(rig, script = []) {
  const { a, secs } = rig;
  let t = 0.05, i = 0, last = 0;
  script = script.slice().sort((x, y) => x.at - y.at);
  while (t < secs - 0.05) {
    while (i < script.length && script[i].at <= t) { a.clock = script[i].at; script[i].fn(rig); i++; }
    a.clock = t;
    const th = a.theme;
    if (th) {
      a._scoreWatch(t, Math.max(0.025, t - last));
      a._playStep(t, a.step++);
      rig.vt.push([t, a._vActive(t + 0.02)]);
    }
    last = t;
    t += 60 / (th ? (th.boss ? a.bpmCur : th.bpm) : 90) / 4;
    if ((a.step & 63) === 0) a.vlog = a.vlog.filter((v) => v[1] > t - 4);       // keep the interval list short
  }
}

// ---------------------------------------------------------------- analysis
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// A-weighting power gain at f (Hz): what a listener on ordinary speakers hears (sub-bass counts for little)
function aw2(f) {
  const f2 = f * f, ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * ra * 1.2589;     // +2 dB normalisation at 1 kHz
}

export function analyse(buf, { win = 0.5, from = 0, to = null } = {}) {
  const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const s0 = Math.floor(from * sr), s1 = Math.min(buf.length, Math.floor((to ?? buf.duration) * sr));
  const wl = Math.floor(win * sr), windows = [];
  let peak = 0, sum = 0;
  for (let s = s0; s < s1; s += wl) {
    let ss = 0, pk = 0, n = 0;
    for (let i = s; i < Math.min(s + wl, s1); i++) {
      const l = L[i], r = R[i];
      ss += (l * l + r * r) * 0.5; n++;
      const m = Math.max(Math.abs(l), Math.abs(r));
      if (m > pk) pk = m;
    }
    windows.push({ t: Math.round(s / sr * 100) / 100, rms: Math.round(Math.sqrt(ss / Math.max(1, n)) * 10000) / 10000, peak: Math.round(pk * 1000) / 1000 });
    peak = Math.max(peak, pk); sum += ss;
  }
  // band energy (Hann-windowed 4096 FFT, hop 4096) as % of total
  const N = 4096, re = new Float32Array(N), im = new Float32Array(N), hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const acc = BANDS.map(() => 0), accA = BANDS.map(() => 0);
  let frames = 0;
  for (let s = s0; s + N <= s1; s += N) {
    for (let i = 0; i < N; i++) { re[i] = (L[s + i] + R[s + i]) * 0.5 * hann[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k];
      for (let b = 0; b < BANDS.length; b++) if (f >= BANDS[b][1] && f < BANDS[b][2]) { acc[b] += p; accA[b] += p * aw2(f); break; }
    }
    frames++;
  }
  const tot = acc.reduce((x, y) => x + y, 0) || 1;
  const bands = {};
  BANDS.forEach((b, i) => { bands[b[0]] = Math.round(acc[i] / tot * 1000) / 10; });
  const totA = accA.reduce((x, y) => x + y, 0) || 1e-12;
  const bandsA = {};
  BANDS.forEach((b, i) => { bandsA[b[0]] = Math.round(accA[i] / totA * 1000) / 10; });
  const rmsDb0 = 20 * Math.log10(Math.sqrt(sum / Math.max(1, s1 - s0)) || 1e-9);
  const dbA = Math.round((rmsDb0 + 10 * Math.log10(totA / tot)) * 10) / 10;
  const rms = Math.sqrt(sum / Math.max(1, s1 - s0));
  return { peak: Math.round(peak * 1000) / 1000, rms: Math.round(rms * 10000) / 10000, rmsDb: Math.round(20 * Math.log10(rms || 1e-9) * 10) / 10, bands, bandsA, dbA, windows };
}

export function toWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const wr = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  wr(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const d = [];
  for (let c = 0; c < ch; c++) d.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, d[c][i]));
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

export async function uploadWav(name, buf) {
  const res = await fetch(`/__promo/out/${name}.wav`, { method: 'PUT', body: toWav(buf) });
  return res.status;
}

// ---------------------------------------------------------------- renders
async function finish(rig, tag) {
  const buffer = await rig.ctx.startRendering();
  const m = analyse(buffer);
  const vs = rig.vt.filter((x) => x[0] > 2).map((x) => x[1]).sort((x, y) => x - y);
  m.voicesSteady = { max: vs[vs.length - 1] ?? 0, p95: vs[Math.floor(vs.length * 0.95)] ?? 0, mean: Math.round(vs.reduce((x, y) => x + y, 0) / Math.max(1, vs.length) * 10) / 10 };
  m.voiceHigh = rig.a.voiceHigh; m.drops = rig.a.voiceDrops; m.cap = rig.a.voiceCap;
  return { buffer, metrics: m, log: rig.a.scoreLog.slice(), tag };
}

// One section looped for `secs` seconds (optionally with overlays: opts.downed / opts.enrage / opts.echo / opts.ward)
export async function renderSection(id, section, secs = 12, opts = {}) {
  const key = 'boss:' + id.replace('boss:', '');
  const rig = makeRig(key, { secs, ...opts });
  const { a, boss, game } = rig;
  game.boss = boss;
  boss.musicState = section === 'intro' ? 'p1' : section;
  a.debugScore(id, section, { echo: !!opts.echo });
  a.sec = SCORES[key].sec[section];
  if (opts.solo) a.solo = new Set(opts.solo);
  if (opts.downed) boss.downed = true;
  if (opts.enrage) { boss.enrage = opts.enrage; a.enrage = Math.min(1, 0.55 + 0.15 * (opts.enrage - 1)); }
  if (opts.ward != null) { a.wardIdx = opts.ward; }
  run(rig, opts.script || []);
  return finish(rig, `${id}-${section}`);
}

// A scripted fight emitting the real RAID events at plausible times (act I-II length):
//   spawn 0 | gate1 -> inter 16 (dur 7) | p2 @23 | downed 25-29 | breakCheck 33 (4 s, fail) | gate2 -> inter2 42 (dur 7) | p3 @49 | enrage 56
export async function renderFight(id, { secs = 66, ...opts } = {}) {
  const key = 'boss:' + id;
  const rig = makeRig(key, { secs, ...opts });
  const { a, game, boss } = rig;
  const E = (n, p = {}) => game.events.emit(n, { enemy: boss, ...p });
  const set = (o) => Object.assign(boss, o);
  const ward = ['fire', 'frost', 'storm', 'arcane'];
  const script = [
    { at: 0.0, fn: () => { game.events.emit('encounterStart', { bossId: boss.id, act: 0 }); } },
    { at: 1.5, fn: () => { game.boss = boss; E('bossSpawned', { final: false, echo: false }); } },
    { at: 16, fn: () => { set({ musicState: 'inter', intT: 7 }); E('bossIntermission', { index: 1, dur: 7 }); } },
    { at: 23, fn: () => { set({ musicState: 'p2', phase: 2, intT: 0 }); E('bossPhase', { phase: 2 }); E('bossDowned', { dur: 3, reason: 'winded' }); set({ downed: true }); } },
    { at: 26, fn: () => { set({ downed: false }); E('bossRecovered'); } },
    { at: 29, fn: () => { E('breakCheck', { name: 'Test', dur: 4, threshold: 30 }); } },
    { at: 33, fn: () => { E('breakCheckEnd', { name: 'Test', success: false }); } },
    { at: 36, fn: () => { E('bossDowned', { dur: 4, reason: 'break' }); set({ downed: true }); } },
    { at: 40, fn: () => { set({ downed: false }); E('bossRecovered'); } },
    { at: 42, fn: () => { set({ musicState: 'inter2', intT: 7 }); E('bossIntermission', { index: 2, dur: 7 }); } },
    { at: 49, fn: () => { set({ musicState: 'p3', phase: 3, intT: 0 }); E('bossPhase', { phase: 3 }); } },
    { at: 56, fn: () => { set({ enrage: 1 }); E('bossEnrage', { level: 1 }); } },
    { at: 60, fn: () => { game.events.emit('encounterEnd', { victory: true, enemy: boss, final: id === 'aurelith', bossId: boss.id }); game.boss = null; } },
  ];
  if (id === 'aurelith') for (let k = 0; k < 8; k++) script.push({ at: 1.5 + k * 10, fn: () => { set({ ward: ward[k % 4] }); E('bossWard', { ward: ward[k % 4] }); } });
  for (let k = 0; k < 20; k++) script.push({ at: 3 + k * 3, fn: () => E('bossImpact', { heavy: k % 3 === 0, pos: null }) });
  run(rig, script);
  return finish(rig, `${id}-fight`);
}

// The three raid scores: distinct, non-silent, non-clipping, within the voice budget.
export async function selfTest({ secs = 16 } = {}) {
  const out = {};
  for (const id of ['gorrak', 'vashkar', 'aurelith']) {
    out[id] = {};
    for (const sec of ['p1', 'p2', 'p3', 'inter']) {
      const r = await renderSection(id, sec, secs, { enrage: 0 });
      const m = r.metrics;
      out[id][sec] = { rmsDb: m.rmsDb, peak: m.peak, voices: m.voiceHigh, drops: m.drops, bands: m.bands };
    }
  }
  return out;
}

// Reference: an act theme (verge | cinder | crown) rendered the same way, to compare levels with the boss scores.
export async function renderAct(theme = 'verge', secs = 12, { intensity = 0 } = {}) {
  const rig = makeRig('boss:gorrak', { secs });
  const { a } = rig;
  a.mode = 'act'; a.intensity = intensity; a.musicBus.gain.value = 0.35;
  a._switchLayer(theme, 0, 0.05);
  run(rig, []);
  return finish(rig, `act-${theme}`);
}

// ---- compact tables for the console ----
const fmt = (m) => `rms${m.rmsDb} A${m.dbA} pk${m.peak} v:mean${m.voicesSteady.mean}/p95 ${m.voicesSteady.p95}/max ${m.voicesSteady.max} hi${m.voiceHigh} drops${m.drops} bandsA(sub/low/mid/pres/hi/air)%:${Object.values(m.bandsA).join('/')}`;
export async function sumTable(ids = ['gorrak', 'vashkar', 'aurelith'], secs = 14, sections = ['p1', 'p2', 'p3', 'inter'], o = {}) {
  const out = {};
  for (const id of ids) for (const s of sections) out[`${id}-${s}`] = fmt((await renderSection(id, s, secs, o)).metrics);
  return out;
}
export async function stemTable(id, section, stems, secs = 14, o = {}) {
  const out = {};
  for (const st of [[], ...stems.map((x) => [x])]) out[st.join('+') || 'bed'] = fmt((await renderSection(id, section, secs, { solo: st, ...o })).metrics);
  return out;
}

export async function fightReport(id, opts = {}) {
  const r = await renderFight(id, opts), m = r.metrics;
  const win = (r.log.find((l) => l.ev === 'win') || {}).t;
  const tail = win != null ? analyse(r.buffer, { win: 0.25, from: win - 0.5, to: Math.min(r.buffer.duration, win + 3.2) }).windows.map((w) => `${(w.t - win).toFixed(2)}:${w.rms}`).join(' ') : '';
  return {
    pk: m.peak, rmsDb: m.rmsDb, A: m.dbA, voices: m.voicesSteady, hi: m.voiceHigh, drops: m.drops,
    log: r.log.map((l) => `${l.t}:${l.ev}${l.info != null ? '=' + (typeof l.info === 'object' ? JSON.stringify(l.info) : l.info) : ''}`).join(' | '),
    winTail: tail,
  };
}

// Strongest spectral peaks of a buffer segment (Hz, relative dB) - used to verify chords / pitch content.
export function peaks(buf, from = 0, to = null, n = 10) {
  const sr = buf.sampleRate, N = 16384, L = buf.getChannelData(0), s0 = Math.floor(from * sr);
  const s1 = Math.min(buf.length, Math.floor((to ?? buf.duration) * sr)), re = new Float32Array(N), im = new Float32Array(N);
  const mag = new Float32Array(N / 2);
  for (let s = s0; s + N <= s1; s += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = L[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))); im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] += re[k] * re[k] + im[k] * im[k];
  }
  const list = [];
  for (let k = 3; k < N / 2 - 1; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && k * sr / N < 3000) list.push([k * sr / N, mag[k]]);
  list.sort((x, y) => y[1] - x[1]);
  const top = list[0] ? list[0][1] : 1;
  return list.slice(0, n).map(([f, m]) => `${Math.round(f)}Hz(${Math.round(10 * Math.log10(m / top))}dB)`);
}
