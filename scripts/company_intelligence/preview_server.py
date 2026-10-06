#!/usr/bin/env python3
"""Loopback-only preview of tracked UI and a separate generated intelligence export."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data', type=Path, default=ROOT / '.company-intelligence/public/company-intelligence/data')
    p.add_argument('--port', type=int, default=8766)
    args = p.parse_args()
    data = args.data.resolve()
    ui = ROOT / 'company-intelligence'
    class Handler(SimpleHTTPRequestHandler):
        def translate_path(self, path):
            raw = unquote(urlsplit(path).path)
            if '..' in raw.split('/'):
                return str(ui / 'NO_SUCH_PATH')
            if raw.startswith('/company-intelligence/data/'):
                result = (data / raw.removeprefix('/company-intelligence/data/')).resolve()
                return str(result) if result.is_relative_to(data) else str(ui / 'NO_SUCH_PATH')
            if raw in ('/', '/company-intelligence/', '/company-intelligence/index.html'):
                return str(ui / 'index.html')
            allowed = {'/company-intelligence/api/contract.js': ui / 'api/contract.js', '/company-intelligence/preview.css': ui / 'preview.css', '/company-intelligence/preview.js': ui / 'preview.js'}
            return str(allowed.get(raw, ui / 'NO_SUCH_PATH'))
        def list_directory(self, path):
            self.send_error(404)
        def log_message(self, *args):
            pass
        def end_headers(self):
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()
    print(f'http://127.0.0.1:{args.port}/company-intelligence/?preview=1&ticker=AAPL', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
