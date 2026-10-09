// Playtest kit server (Node 18+, no dependencies). Serves the project root and accepts
//   PUT /__playtest/out/<file>   -> writes <playtest dir>/out/<file>
// Supports byte ranges (harmless for screenshots).
// Usage: node playtest/kit/serve.mjs [--port 8098] [--root .] [--out playtest/out]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const port = +arg('port', 8098);
const root = path.resolve(arg('root', path.join(here, '..', '..')));
const outDir = path.resolve(arg('out', path.join(here, '..', 'out')));
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  if (req.method === 'PUT') {
    const name = path.basename(rel);
    if (!rel.startsWith('__playtest/out/') || !/^[\w.-]+$/.test(name)) { res.writeHead(403).end(); return; }
    const ws = fs.createWriteStream(path.join(outDir, name));
    req.pipe(ws);
    ws.on('finish', () => { console.log('saved', name); res.writeHead(201).end(); });
    ws.on('error', () => res.writeHead(500).end());
    return;
  }
  let full;
  if (rel.startsWith('__playtest/out/')) full = path.join(outDir, path.basename(rel));
  else {
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    full = path.resolve(root, rel);
    if (!full.startsWith(root)) { res.writeHead(403).end(); return; }
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    const headers = { 'Content-Type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (m) {
      if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], st.size - 1); } else if (m[2]) start = Math.max(0, st.size - +m[2]);
      code = 206; headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(code, headers);
    fs.createReadStream(full, { start, end }).pipe(res);
  });
}).listen(port, () => console.log(`playtest server: http://localhost:${port}/  root=${root}  out=${outDir}`));
