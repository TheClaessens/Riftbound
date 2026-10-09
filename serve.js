// Zero-dependency static file server for local play (Node 18+).
// Usage:  npm start            (or: node serve.js [port])
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || process.env.PORT || 8080);
const root = path.resolve(__dirname);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, ''); }
  catch { res.writeHead(400).end(); return; }
  if (rel === '') rel = 'index.html';
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, 'localhost', () => {
  console.log(`Riftbound: http://localhost:${port}/  (Ctrl+C to stop)`);
});
