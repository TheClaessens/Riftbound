// =====================================================================================
//  Promo renderer: steps a game shot by shot on the virtual clock (shims.js), composites
//  the game canvas + overlays + motion titles on a 2D canvas, and encodes H.264/AAC MP4
//  with WebCodecs + mp4-muxer. Saves through the kit server (PUT /__promo/out/<file>).
//
//  const R = createRenderer({
//    width: 1920, height: 1080, fps: 60, duration: 15,
//    source: () => gameCanvas,            // canvas sampled after render()
//    shots: SHOTS,                        // see below
//    tick: (dt) => game.update(dt),       // advance the game by dt seconds (clock already advanced)
//    render: () => renderer.render(),     // draw the game into `source`
//    overlay: (g, f) => {},               // optional: game-space overlays drawn on the plate (DOM text replicas…)
//    titles: (g, f) => {},                // motion-design layer, drawn above the plate
//    cuts: [{ t, punch, flash }],         // cut accents: zoom punch + white flash
//    soundtrack: async (duration) => AudioBuffer,   // optional
//    context: P,                          // passed to shot hooks (your staging API)
//    fonts: ['900 100px Inter', ...],     // loaded before rendering
//  });
//  window.promo = R;   // R.still(t), R.sheet(), R.render(), R.soundtrack()
//
//  Shot: { id, t0, setup(P, shot), step(P, t, shot), speed(t), dim(t), filter(t), zoomPost(t),
//          cuts(shot) -> extra [{t (shot-local), punch, flash}] }
//  `shot` is per-shot scratch state ({ t, cleanup: [] }). Push teardown fns to shot.cleanup.
//  f (frame info) = { T, t, shot, def, P, W, H }.
// =====================================================================================
const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs';

export function createRenderer(o) {
  const W = o.width ?? 1920, H = o.height ?? 1080, FPS = o.fps ?? 60, DURATION = o.duration ?? 15;
  const FRAMES = Math.round(DURATION * FPS);
  const maxStep = o.maxStep ?? 1 / 60;
  const P = o.context ?? {};
  const cuts = o.cuts ?? [];
  const shots = o.shots.slice().sort((a, b) => a.t0 - b.t0);
  const clock = window.__promo;
  if (!clock) throw new Error('kit/shims.js must load before the game (classic <script> in <head>)');

  const comp = o.canvas ?? Object.assign(document.createElement('canvas'), { width: W, height: H });
  if (!comp.isConnected && o.mount !== false) document.body.appendChild(comp);
  const ctx = comp.getContext('2d');
  const statusEl = o.statusEl ?? document.getElementById('status');
  const status = (s) => { if (statusEl) statusEl.textContent = s; };

  // ---------------------------------------------------------------- timeline
  const shotAt = (T) => { for (let i = shots.length - 1; i >= 0; i--) if (T >= shots[i].t0 - 1e-6) return shots[i]; return shots[0]; };
  let current = null, scratch = null, lastFrame = -1;

  function tick(dt) { clock.advance(dt * 1000); o.tick(dt); }

  function enter(def) {
    for (const fn of scratch?.cleanup ?? []) { try { fn(); } catch (e) { console.error(e); } }
    current = def;
    scratch = { t: 0, cleanup: [] };
    P.shot = scratch;
    def.setup?.(P, scratch);
    lastFrame = Math.round(def.t0 * FPS) - 1;
  }

  function stepTo(f) {
    const T = f / FPS;
    const def = shotAt(T);
    if (def !== current || f < lastFrame) enter(def);
    while (lastFrame < f) {
      lastFrame++;
      const t = lastFrame / FPS - def.t0;
      scratch.t = t;
      def.step?.(P, t, scratch);
      const dt = (def.speed?.(t) ?? 1) / FPS;
      const n = Math.max(1, Math.ceil(dt / maxStep - 1e-9));
      for (let i = 0; i < n; i++) tick(dt / n);
    }
    return { T, t: T - def.t0, shot: scratch, def, P, W, H };
  }

  // ---------------------------------------------------------------- compositor
  const outCubic = (x) => 1 - (1 - x) ** 3;
  function cutFx(T, info) {
    let scale = 1, flash = 0;
    const extra = (info.def.cuts?.(info.shot) ?? []).map((c) => ({ ...c, t: info.def.t0 + c.t }));
    for (const c of extra.length ? cuts.concat(extra) : cuts) {
      const d = T - c.t;
      if (d < 0 || d > 0.35) continue;
      scale = Math.max(scale, 1 + (c.punch ?? 0) * (1 - outCubic(Math.min(1, d / 0.3))));
      flash = Math.max(flash, (c.flash ?? 0) * Math.max(0, 1 - d / 0.14));
    }
    return { scale, flash };
  }

  function compose(info) {
    const g = ctx, { T, t, def } = info;
    g.save();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const { scale, flash } = cutFx(T, info);
    const s = scale * (def.zoomPost?.(t) ?? 1);
    g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2);
    const fil = def.filter?.(t);
    if (fil) g.filter = fil;
    g.drawImage(o.source(), 0, 0, W, H);
    g.filter = 'none';
    o.overlay?.(g, info);
    g.restore();
    const dim = def.dim?.(t) ?? 0;
    if (dim > 0) { g.fillStyle = `rgba(8,5,16,${dim})`; g.fillRect(0, 0, W, H); }
    g.save(); o.titles?.(g, info); g.restore();
    if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, W, H); }
  }

  // Render must happen in the same task as drawImage (WebGL drawing buffers are cleared after).
  function renderFrame(f) {
    const info = stepTo(f);
    o.render();
    compose(info);
    return info;
  }

  // ---------------------------------------------------------------- IO
  async function put(name, blob) {
    const r = await fetch(`/__promo/out/${name}`, { method: 'PUT', body: blob });
    if (!r.ok) throw new Error(`save ${name}: HTTP ${r.status} (is the kit server running?)`);
    return `out/${name}`;
  }
  const toBlob = (c, type = 'image/jpeg', q = 0.9) => new Promise((res) => c.toBlob(res, type, q));
  // Yield without timers: hidden tabs throttle setTimeout to >= 1 s.
  const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const fontsReady = () => Promise.all((o.fonts ?? []).map((f) => document.fonts.load(f)));

  // ---------------------------------------------------------------- API
  async function still(T, name = 'still.jpg') {
    await fontsReady();
    const f = Math.round(T * FPS);
    current = null;
    const def = shotAt(f / FPS);
    for (let i = Math.round(def.t0 * FPS); i < f; i++) stepTo(i);
    const info = renderFrame(f);
    const path = await put(name, await toBlob(comp));
    return { path, shot: def.id, t: +info.t.toFixed(3) };
  }

  async function sheet({ every = 0.25, cols = 6, name = 'sheet.jpg', from = 0, to = DURATION, thumb = 320 } = {}) {
    await fontsReady();
    const times = [];
    for (let T = from + every / 2; T < to; T += every) times.push(T);
    const tw = thumb, th = Math.round(thumb * H / W), rows = Math.ceil(times.length / cols);
    const sc = Object.assign(document.createElement('canvas'), { width: cols * tw, height: rows * (th + 18) });
    const sg = sc.getContext('2d');
    sg.fillStyle = '#111'; sg.fillRect(0, 0, sc.width, sc.height);
    current = null;
    let prev = Math.round(from * FPS) - 1;
    for (let i = 0; i < times.length; i++) {
      const f = Math.round(times[i] * FPS);
      for (let k = prev + 1; k < f; k++) stepTo(k);
      renderFrame(f); prev = f;
      const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + 18);
      sg.drawImage(comp, x, y + 18, tw, th);
      sg.fillStyle = '#ddd'; sg.font = '600 13px sans-serif'; sg.fillText(times[i].toFixed(2) + 's', x + 4, y + 13);
      status(`sheet ${i + 1}/${times.length}`);
      await yieldNow();
    }
    return put(name, await toBlob(sc, 'image/jpeg', 0.85));
  }

  async function render({ name = 'promo.mp4', audio = !!o.soundtrack, bitrate = 20e6, codec = 'avc1.64002A', keyEvery = 2 } = {}) {
    await fontsReady();
    const { Muxer, ArrayBufferTarget } = await import(MUXER_URL);
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      audio: audio ? { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let fail = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { fail = e; } });
    const vcfg = { codec, width: W, height: H, bitrate, framerate: FPS, bitrateMode: 'variable', latencyMode: 'quality', avc: { format: 'avc' } };
    if (!(await VideoEncoder.isConfigSupported(vcfg)).supported) throw new Error(`VideoEncoder does not support ${codec} at ${W}x${H}@${FPS}`);
    venc.configure(vcfg);

    if (audio) {
      status('rendering soundtrack…');
      const buf = await o.soundtrack(DURATION);
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { fail = e; } });
      aenc.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 48000, bitrate: 192000 });
      const L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0), N = 1024;
      for (let i = 0; i < buf.length; i += N) {
        const n = Math.min(N, buf.length - i);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: buf.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / buf.sampleRate * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush();
      await put(name.replace(/\.mp4$/, '.wav'), wavBlob(buf));
    }

    current = null;
    const keyAt = new Set(cuts.map((c) => Math.round(c.t * FPS)));
    const t0 = clock.realNow();
    for (let f = 0; f < FRAMES; f++) {
      if (fail) throw fail;
      renderFrame(f);
      const vf = new VideoFrame(comp, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: f % Math.round(keyEvery * FPS) === 0 || keyAt.has(f) });
      vf.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => venc.addEventListener('dequeue', r, { once: true }));
      if (f % 15 === 0) { status(`frame ${f}/${FRAMES}  ${((clock.realNow() - t0) / 1000).toFixed(0)}s`); await yieldNow(); }
    }
    await venc.flush();
    muxer.finalize();
    const path = await put(name, new Blob([muxer.target.buffer], { type: 'video/mp4' }));
    status(`saved ${path}`);
    return { path, seconds: (clock.realNow() - t0) / 1000, bytes: muxer.target.buffer.byteLength };
  }

  async function soundtrack(name = 'soundtrack.wav') {
    if (!o.soundtrack) throw new Error('no soundtrack configured');
    return put(name, wavBlob(await o.soundtrack(DURATION)));
  }

  // Start a render in the background; poll R.job (useful when tool calls time out).
  function start(opts) {
    R.job = { state: 'running' };
    render(opts).then((r) => { R.job = { state: 'done', ...r }; }, (e) => { R.job = { state: 'error', error: String(e?.stack ?? e) }; });
    return 'started — poll promo.job';
  }

  const R = { still, sheet, render, start, soundtrack, renderFrame, stepTo, put, canvas: comp, W, H, FPS, DURATION, job: null };
  status('ready — promo.still(t) / promo.sheet() / promo.start()');
  return R;
}

export function wavBlob(buf) {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let p = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); out.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7fff, true); p += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
