"""Serve the viewer (the GitHub Pages artifact) on this computer with offline background maps.

  python3 serve.py [<folder>] [--port 8000]

<folder> (default: this script's folder) holds `site/` (the unpacked GitHub Pages artifact) and
`offline/`: basemap.mbtiles (OpenMapTiles vector tiles, from fetch_tiles.py ofm or Planetiler),
ne2.mbtiles (shaded relief), dop.mbtiles (aerial images, konzept area), static/fonts and
static/sprites (fetch_assets.py). Any of them may be missing; that layer then stays empty.

The pages are not changed on disk: when one is served, the URLs of the "Hell" basemap
(tiles.openfreemap.org) and the konzept page's Luftbild (geoservices.bayern.de WMS) are rewritten
to this server. Other basemaps (Gedeckt, OSM) still need the internet. Tiles outside the
downloaded area answer 204 (empty). Standard library only; listens on 127.0.0.1 only.
"""
import argparse
import http.server
import json
import mimetypes
import os
import re
import sys
import sqlite3
import threading
import urllib.parse
import webbrowser

OFM = 'https://tiles.openfreemap.org'
DOP_RE = re.compile(r'https://geoservices\.bayern\.de/od/wms/dop/v1/dop20\?[^"\']*?\{bbox-epsg-3857\}[^"\']*')
DOP_MAXZOOM_RE = re.compile(r'(/offline/dop/\{z\}/\{x\}/\{y\}\.jpg["\']\]\s*,\s*tileSize\s*:\s*512\s*,\s*maxzoom\s*:\s*)19')


class Tiles:
    """Read-only MBTiles (one connection per thread)."""

    def __init__(self, path):
        self.path = path if os.path.exists(path) else None
        self.local = threading.local()
        self.maxzoom = None
        self.meta = {}
        if self.path:
            db = self.db()
            self.meta = dict(db.execute('select name, value from metadata'))
            self.maxzoom = db.execute('select max(zoom_level) from tiles').fetchone()[0]

    def db(self):
        if not hasattr(self.local, 'db'):
            self.local.db = sqlite3.connect(f'file:{self.path}?mode=ro', uri=True, check_same_thread=False)
        return self.local.db

    def get(self, z, x, y):
        if not self.path:
            return None
        row = self.db().execute(
            'select tile_data from tiles where zoom_level=? and tile_column=? and tile_row=?',
            (z, x, 2**z - 1 - y),
        ).fetchone()
        return row[0] if row else None


def make_handler(root):
    site = os.path.join(root, 'site')
    off = os.path.join(root, 'offline')
    basemap = Tiles(os.path.join(off, 'basemap.mbtiles'))
    ne2 = Tiles(os.path.join(off, 'ne2.mbtiles'))
    dop = Tiles(os.path.join(off, 'dop.mbtiles'))
    static = os.path.join(off, 'static')

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def send(self, status, body=b'', ctype='application/octet-stream', extra=None):
            self.send_response(status)
            if status != 204:
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-cache')
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if body and self.command != 'HEAD':
                self.wfile.write(body)

        def base(self):
            return 'http://' + (self.headers.get('Host') or f'127.0.0.1:{self.server.server_port}')

        def rewrite(self, text):
            b = self.base() + '/offline'
            text = text.replace(OFM + '/planet', b + '/planet.json')
            text = text.replace(OFM + '/fonts/', b + '/fonts/')
            text = text.replace(OFM + '/sprites/', b + '/sprites/')
            text = text.replace(OFM + '/natural_earth/ne2sr/', b + '/ne2/')
            text = DOP_RE.sub(b + '/dop/{z}/{x}/{y}.jpg', text)
            if dop.maxzoom:
                # beyond the downloaded zoom the map scales the last tiles up instead of going blank
                text = DOP_MAXZOOM_RE.sub(lambda m: m.group(1) + str(dop.maxzoom), text)
            return text

        def tile(self, tiles, parts, ctype):
            try:
                z, x, y = int(parts[0]), int(parts[1]), int(parts[2].split('.')[0])
            except (ValueError, IndexError):
                return self.send(400)
            data = tiles.get(z, x, y)
            if data is None:
                return self.send(204)
            extra = {'Content-Encoding': 'gzip'} if data[:2] == b'\x1f\x8b' else None
            self.send(200, data, ctype, extra)

        def offline(self, rest):
            parts = rest.split('/')
            if rest == 'planet.json':
                meta = json.loads(basemap.meta.get('json') or '{}')
                tilejson = {
                    'tilejson': '3.0.0',
                    'tiles': [self.base() + '/offline/tiles/{z}/{x}/{y}.pbf'],
                    'minzoom': 0,
                    'maxzoom': basemap.maxzoom or 14,
                    'vector_layers': meta.get('vector_layers', []),
                    'attribution': basemap.meta.get('attribution', '© OpenMapTiles © OpenStreetMap'),
                }
                return self.send(200, json.dumps(tilejson).encode(), 'application/json')
            if parts[0] == 'tiles':
                return self.tile(basemap, parts[1:], 'application/x-protobuf')
            if parts[0] == 'ne2':
                return self.tile(ne2, parts[1:], 'image/png')
            if parts[0] == 'dop':
                return self.tile(dop, parts[1:], 'image/jpeg')
            if parts[0] in ('fonts', 'sprites'):
                return self.file(os.path.join(static, *parts), rewrite=False, missing=204)
            self.send(404)

        def file(self, path, rewrite=True, missing=404):
            real = os.path.realpath(path)
            if not os.path.isfile(real):
                return self.send(missing)
            with open(real, 'rb') as f:
                body = f.read()
            ctype = mimetypes.guess_type(real)[0] or 'application/octet-stream'
            if path.endswith('.pbf'):
                ctype = 'application/x-protobuf'
            if rewrite and real.endswith('.html'):
                body = self.rewrite(body.decode('utf-8')).encode('utf-8')
                ctype = 'text/html; charset=utf-8'
            elif ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
                ctype += '; charset=utf-8'
            self.send(200, body, ctype)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
            if path.startswith('/offline/'):
                return self.offline(path[len('/offline/'):])
            rel = os.path.normpath(path.lstrip('/')) if path.strip('/') else 'index.html'
            if rel.startswith('..'):
                return self.send(403)
            target = os.path.join(site, rel)
            if os.path.isdir(target):
                target = os.path.join(target, 'index.html')
            elif not os.path.exists(target) and os.path.exists(target + '.html'):
                target += '.html'  # GitHub Pages serves x.html at /x
            if not os.path.exists(target):
                # like GitHub Pages: 404.html (it forwards /<name> to ?ort=<name>)
                with open(os.path.join(site, '404.html'), 'rb') as f:
                    body = self.rewrite(f.read().decode('utf-8')).encode('utf-8')
                return self.send(404, body, 'text/html; charset=utf-8')
            self.file(target)

    return Handler, {'basemap': basemap, 'ne2': ne2, 'dop': dop}


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # the map cancels tile requests it no longer needs (panning, zooming): not an error
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folder', nargs='?', default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--no-browser', action='store_true')
    args = ap.parse_args()
    if not os.path.isfile(os.path.join(args.folder, 'site', 'index.html')):
        raise SystemExit(f'{args.folder}/site/index.html not found (unpack the GitHub Pages artifact into site/)')
    handler, tiles = make_handler(args.folder)
    for name, t in tiles.items():
        print(f'{name:8} {"offline bis Zoom " + str(t.maxzoom) if t.path else "fehlt (bleibt leer)"}')
    server = Server(('127.0.0.1', args.port), handler)
    url = f'http://localhost:{args.port}/'
    print(f'\nKarte:   {url}\nKonzept: {url}konzept\nBeenden mit Strg+C')
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url + 'konzept')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
