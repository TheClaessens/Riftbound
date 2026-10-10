// =====================================================================================
//  Verify a rendered MP4 without a <video> element (those never decode in a hidden browser pane
//  or background tab) (crazygames-release skill kit; also used for store preview videos):
//  parse the boxes for duration, size and track handlers (video only = silent), then decode chosen frames
//  with WebCodecs and build a check grid. Returns frame 0 as a canvas: the exact frame the video opens on,
//  so the cover image can be saved from it pixel for pixel.
//
//    const { info, frame0, grid } = await inspectMp4({ url: "/out/preview.mp4" });
//    // grid / frame0 are OffscreenCanvas: await grid.convertToBlob({ type: "image/jpeg" }) and save it
// =====================================================================================
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

export async function inspectMp4({ url, times = [0, 0.6, 2.5, 5.5, 8, 10.5, 13, 15.5, 17.5], fps = 60 } = {}) {
  const buf = new Uint8Array(await (await fetch(url, { cache: 'no-store' })).arrayBuffer());
  const dv = new DataView(buf.buffer);
  const str = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  const tracks = [];
  let cur = null, mvhd = null;
  (function walk(s, e) {
    for (let o = s; o < e;) {
      const size = dv.getUint32(o), type = str(o + 4);
      if (size < 8) break;
      const b = o + 8;
      if (type === 'trak') { cur = {}; tracks.push(cur); }
      else if (type === 'mvhd') mvhd = { ts: dv.getUint32(b + 12), dur: dv.getUint32(b + 16) };
      else if (type === 'hdlr') cur.handler = str(b + 8);
      else if (type === 'tkhd') { cur.w = dv.getUint32(b + 76) / 65536; cur.h = dv.getUint32(b + 80) / 65536; }
      else if (type === 'stsd') {
        const ent = b + 8, es = dv.getUint32(ent);
        for (let p = ent + 86; p < ent + es;) {
          const sz = dv.getUint32(p);
          if (str(p + 4) === 'avcC') {
            cur.avcC = buf.slice(p + 8, p + sz);
            cur.codec = 'avc1.' + [1, 2, 3].map((i) => cur.avcC[i].toString(16).padStart(2, '0')).join('');
          }
          p += sz;
        }
      }
      else if (type === 'stsz') { const n = dv.getUint32(b + 8); cur.sizes = Array.from({ length: n }, (_, i) => dv.getUint32(b + 12 + i * 4)); }
      else if (type === 'stco') { const n = dv.getUint32(b + 4); cur.offs = Array.from({ length: n }, (_, i) => dv.getUint32(b + 8 + i * 4)); }
      else if (type === 'stsc') { const n = dv.getUint32(b + 4); cur.stsc = Array.from({ length: n }, (_, i) => [dv.getUint32(b + 8 + i * 12), dv.getUint32(b + 12 + i * 12)]); }
      else if (type === 'stss') { const n = dv.getUint32(b + 4); cur.sync = Array.from({ length: n }, (_, i) => dv.getUint32(b + 8 + i * 4) - 1); }
      if (CONTAINERS.has(type)) walk(b, o + size);
      o += size;
    }
  })(0, buf.length);

  const v = tracks.find((t) => t.handler === 'vide');
  // byte offset of every sample (stsc maps chunks to sample counts, stco gives chunk offsets)
  const offsets = [];
  let si = 0;
  for (let c = 0; c < v.offs.length; c++) {
    let per = v.stsc[0][1];
    for (const [first, spc] of v.stsc) if (c + 1 >= first) per = spc;
    let o = v.offs[c];
    for (let k = 0; k < per && si < v.sizes.length; k++, si++) { offsets.push(o); o += v.sizes[si]; }
  }

  const frames = v.sizes.length;
  const want = times.map((t) => Math.min(frames - 1, Math.round(t * fps)));
  const got = new Map();
  const dec = new VideoDecoder({
    output: (f) => {
      const i = Math.round(f.timestamp / (1e6 / fps));
      if (want.includes(i) && !got.has(i)) {
        const c = new OffscreenCanvas(f.displayWidth, f.displayHeight);
        c.getContext('2d').drawImage(f, 0, 0);
        got.set(i, c);
      }
      f.close();
    },
    error: (e) => console.error(e),
  });
  dec.configure({ codec: v.codec, description: v.avcC });
  for (const w of want) {
    const key = [...(v.sync ?? [0])].reverse().find((s) => s <= w) ?? 0;
    for (let i = key; i <= w; i++) {
      dec.decode(new EncodedVideoChunk({ type: i === key ? 'key' : 'delta', timestamp: Math.round(i * 1e6 / fps), data: buf.subarray(offsets[i], offsets[i] + v.sizes[i]) }));
    }
    await dec.flush();
  }

  const tw = 360, th = Math.round(tw * v.h / v.w), cols = v.w >= v.h ? 3 : 5;
  const grid = new OffscreenCanvas(tw * cols, Math.ceil(want.length / cols) * (th + 18));
  const gg = grid.getContext('2d');
  gg.fillStyle = '#111'; gg.fillRect(0, 0, grid.width, grid.height);
  want.forEach((w, i) => {
    const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + 18);
    const c = got.get(w);
    if (c) gg.drawImage(c, x, y + 18, tw, th);
    gg.fillStyle = '#fff'; gg.font = '600 13px sans-serif'; gg.fillText(times[i] + 's', x + 4, y + 13);
  });
  return {
    info: { duration: +(mvhd.dur / mvhd.ts).toFixed(3), tracks: tracks.map((t) => t.handler), size: [v.w, v.h], codec: v.codec, frames, mb: +(buf.length / 1048576).toFixed(1), decoded: got.size },
    frame0: got.get(0),
    grid,
  };
}
