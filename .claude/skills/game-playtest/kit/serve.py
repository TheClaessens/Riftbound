"""Playtest kit server (Python 3.8+, stdlib only). Serves the project root and accepts
  PUT /__playtest/out/<file>   -> writes <playtest dir>/out/<file>
Supports byte ranges (harmless for screenshots).
Usage: python playtest/kit/serve.py [--port 8098] [--root .] [--out playtest/out]
"""
import argparse, os, re, mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import unquote, urlparse

here = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8098)
ap.add_argument('--root', default=os.path.join(here, '..', '..'))
ap.add_argument('--out', default=os.path.join(here, '..', 'out'))
args = ap.parse_args()
ROOT = os.path.realpath(args.root)
OUT = os.path.realpath(args.out)
os.makedirs(OUT, exist_ok=True)
mimetypes.add_type('text/javascript', '.js'); mimetypes.add_type('text/javascript', '.mjs'); mimetypes.add_type('application/wasm', '.wasm')


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _rel(self):
        return unquote(urlparse(self.path).path).lstrip('/')

    def do_PUT(self):
        rel = self._rel(); name = os.path.basename(rel)
        if not rel.startswith('__playtest/out/') or not re.fullmatch(r'[\w.\-]+', name):
            self.send_response(403); self.end_headers(); return
        n = int(self.headers.get('Content-Length', 0))
        with open(os.path.join(OUT, name), 'wb') as f:
            while n > 0:
                chunk = self.rfile.read(min(n, 1 << 20))
                if not chunk: break
                f.write(chunk); n -= len(chunk)
        print('saved', name)
        self.send_response(201); self.end_headers()

    def do_GET(self):
        rel = self._rel()
        if rel.startswith('__playtest/out/'):
            full = os.path.join(OUT, os.path.basename(rel))
        else:
            if rel == '' or rel.endswith('/'): rel += 'index.html'
            full = os.path.realpath(os.path.join(ROOT, rel))
            if not full.startswith(ROOT):
                self.send_response(403); self.end_headers(); return
        if not os.path.isfile(full):
            self.send_response(404); self.end_headers(); return
        size = os.path.getsize(full); start, end, code = 0, size - 1, 200
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range', '') or '')
        if m:
            if m.group(1):
                start = int(m.group(1))
                if m.group(2): end = min(int(m.group(2)), size - 1)
            elif m.group(2): start = max(0, size - int(m.group(2)))
            code = 206
        self.send_response(code)
        self.send_header('Content-Type', mimetypes.guess_type(full)[0] or 'application/octet-stream')
        self.send_header('Cache-Control', 'no-store'); self.send_header('Accept-Ranges', 'bytes')
        if code == 206: self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1)); self.end_headers()
        with open(full, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(left, 1 << 16))
                if not chunk: break
                self.wfile.write(chunk); left -= len(chunk)


print(f'playtest server: http://localhost:{args.port}/  root={ROOT}  out={OUT}')
ThreadingHTTPServer(('localhost', args.port), H).serve_forever()
