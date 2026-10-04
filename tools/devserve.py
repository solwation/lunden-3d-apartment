#!/usr/bin/env python3
"""Local dev server for sandboxes where cdn.jsdelivr.net is blocked (cloud sessions).

Serves a checkout like `python3 -m http.server`, but rewrites the import map's
https://cdn.jsdelivr.net/npm/three@<ver>/ to /__three/ and serves three from the npm
tarball (registry.npmjs.org is reachable), cached in ~/.cache/three-<ver>. No caching
headers, so headless Chrome never serves an old module.

  python3 tools/devserve.py [port=8137] [root=repo root]
"""
import http.server, io, os, re, sys, tarfile, urllib.request

ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
VER = re.search(rb'cdn\.jsdelivr\.net/npm/three@([\d.]+)/', open(os.path.join(ROOT, 'index.html'), 'rb').read()).group(1).decode()
CDN = f'https://cdn.jsdelivr.net/npm/three@{VER}/'.encode()
THREE = os.path.expanduser(f'~/.cache/three-{VER}')

if not os.path.isfile(os.path.join(THREE, 'build', 'three.module.js')):
    data = urllib.request.urlopen(f'https://registry.npmjs.org/three/-/three-{VER}.tgz').read()
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        for m in t.getmembers():
            if m.name.startswith('package/') and m.isfile():
                dest = os.path.join(THREE, m.name[len('package/'):])
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, 'wb') as f: f.write(t.extractfile(m).read())

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split('?')[0].split('#')[0]
        if p.startswith('/__three/'): return os.path.join(THREE, p[len('/__three/'):])
        return super().translate_path(path)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) and os.path.isfile(os.path.join(path, 'index.html')): path = os.path.join(path, 'index.html')
        if os.path.isfile(path) and path.endswith(('.html', '.js')) and not path.startswith(THREE):
            data = open(path, 'rb').read().replace(CDN, b'/__three/')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8' if path.endswith('.html') else 'text/javascript')
            self.send_header('Content-Length', str(len(data))); self.end_headers()
            return io.BytesIO(data)
        return super().send_head()
    def log_message(self, *a): pass

os.chdir(ROOT)
http.server.ThreadingHTTPServer(('', PORT), H).serve_forever()
