#!/usr/bin/env python3
"""Local-only paired Hand fixture; use an installed Three r170 directory.

python3 tools/hand-realism-server.py --three /path/to/node_modules/three
No download, credentials or deployment. /__before/ reads the committed baseline.
"""
import argparse
import io
import subprocess
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--three', required=True, type=Path)
p.add_argument('--baseline', default='2f03ba02187419796185822e411901002cdb552f')
p.add_argument('--port', default=8200, type=int)
a = p.parse_args()
root = Path(__file__).resolve().parent.parent
three = a.three.resolve()
assert (three / 'build/three.module.js').is_file(), 'Expected installed Three r170'
subprocess.run(['git', 'cat-file', '-e', a.baseline + '^{commit}'], cwd=root, check=True)


@lru_cache(maxsize=64)
def baseline_file(relative):
    return subprocess.check_output(['git', 'show', a.baseline + ':' + relative], cwd=root)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        relative = unquote(urlsplit(self.path).path).lstrip('/')
        try:
            if relative.startswith('__before/'):
                relative = relative.removeprefix('__before/')
                if '..' in Path(relative).parts:
                    raise ValueError('Path outside fixture')
                data = baseline_file(relative)
            else:
                directory, relative = (three, relative.removeprefix('__three/')) if relative.startswith('__three/') else (root, relative)
                target = (directory / relative).resolve()
                if not target.is_relative_to(directory):
                    raise ValueError('Path outside fixture')
                if target.is_dir():
                    target /= 'index.html'
                data = target.read_bytes()
                relative = str(target)
        except (OSError, ValueError, subprocess.CalledProcessError):
            self.send_error(404)
            return None
        if Path(relative).suffix in ('.html', '.js'):
            data = data.replace(b'https://cdn.jsdelivr.net/npm/three@0.170.0/', b'/__three/')
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(relative))
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        return io.BytesIO(data)


print(f'Hand fixture: http://127.0.0.1:{a.port}; baseline {a.baseline}', flush=True)
ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()
