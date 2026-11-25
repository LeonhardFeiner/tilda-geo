"""Download map tiles into an MBTiles file (SQLite), for the offline copy of the viewer (README.md).

  fetch_tiles.py dop  out/dop.mbtiles  <west> <south> <east> <north> <minzoom> <maxzoom>
      DOP20 aerial images of the Bayerische Vermessungsverwaltung (WMS, Open Data, CC BY 4.0),
      512 px tiles exactly as the konzept page requests them.
  fetch_tiles.py ofm  out/basemap.mbtiles <west> <south> <east> <north> <minzoom> <maxzoom>
      OpenFreeMap vector tiles (OpenMapTiles schema, the "Hell" basemap). Fine for a few
      Landkreise; for all of Germany build the file with Planetiler instead (README.md).
  fetch_tiles.py ne2  out/ne2.mbtiles <west> <south> <east> <north> <minzoom> <maxzoom>
      OpenFreeMap's shaded relief raster (Natural Earth), drawn by the style up to zoom 6.

Re-running resumes: tiles already in the file are skipped. Several bboxes can go into one file
by running it again with another bbox and zoom range. Standard library only.
"""
import concurrent.futures
import gzip
import json
import math
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # works under python -I too
from offline_http import Fetcher, GiveUp  # noqa: E402

DOP = (
    'https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
    '&LAYERS=by_dop20c&STYLES=&SRS=EPSG:3857&BBOX={bbox}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg'
)
HALF = 20037508.342789244


def tile_range(west, south, east, north, z):
    n = 2**z

    def tx(lon):
        return min(n - 1, max(0, int((lon + 180) / 360 * n)))

    def ty(lat):
        r = math.radians(lat)
        return min(n - 1, max(0, int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)))

    return range(tx(west), tx(east) + 1), range(ty(north), ty(south) + 1)


def bbox_3857(z, x, y):
    size = 2 * HALF / 2**z
    return f'{-HALF + x * size},{HALF - (y + 1) * size},{-HALF + (x + 1) * size},{HALF - y * size}'


FETCH = Fetcher({'Accept-Encoding': 'gzip'})


def get(url):
    """Bytes, None (no tile), or False (gave up; a re-run fetches it)."""
    try:
        return FETCH.get(url)
    except GiveUp as e:
        print('übersprungen:', e, flush=True)
        return False


def open_mbtiles(path, metadata):
    db = sqlite3.connect(path)
    db.execute('create table if not exists metadata (name text primary key, value text)')
    db.execute(
        'create table if not exists tiles (zoom_level integer, tile_column integer, tile_row integer,'
        ' tile_data blob, primary key (zoom_level, tile_column, tile_row))'
    )
    db.executemany('insert or replace into metadata values (?, ?)', metadata.items())
    db.commit()
    return db


def main():
    kind, out = sys.argv[1:3]
    west, south, east, north = map(float, sys.argv[3:7])
    zmin, zmax = map(int, sys.argv[7:9])
    if kind == 'dop':
        meta = {'name': 'DOP20 Bayern', 'format': 'jpg', 'attribution': 'Luftbild © Bayerische Vermessungsverwaltung (CC BY 4.0)'}

        def url(z, x, y):
            return DOP.format(bbox=bbox_3857(z, x, y))

    elif kind == 'ofm':
        raw = get('https://tiles.openfreemap.org/planet')
        tilejson = json.loads(gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw)
        template = tilejson['tiles'][0]
        meta = {
            'name': 'OpenFreeMap planet (Ausschnitt)',
            'format': 'pbf',
            'attribution': '© OpenFreeMap © OpenMapTiles © OpenStreetMap',
            'json': json.dumps({'vector_layers': tilejson['vector_layers']}),
            'source': template,
        }

        def url(z, x, y):
            return template.format(z=z, x=x, y=y)

    elif kind == 'ne2':
        meta = {'name': 'Natural Earth shaded relief', 'format': 'png', 'attribution': 'Natural Earth'}

        def url(z, x, y):
            return f'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'

    else:
        sys.exit(__doc__)

    db = open_mbtiles(out, meta)
    have = set(db.execute('select zoom_level, tile_column, tile_row from tiles'))
    todo = []
    for z in range(zmin, zmax + 1):
        xs, ys = tile_range(west, south, east, north, z)
        todo += [(z, x, y) for x in xs for y in ys if (z, x, 2**z - 1 - y) not in have]
    print(f'{len(todo)} tiles to fetch ({len(have)} already in {out})', flush=True)

    done = failed = 0
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        for (z, x, y), data in zip(todo, pool.map(lambda t: get(url(*t)), todo)):
            if data is False:
                failed += 1
            elif data:
                db.execute('insert or replace into tiles values (?, ?, ?, ?)', (z, x, 2**z - 1 - y, data))
            done += 1
            if done % 500 == 0:
                db.commit()
                print(f'{done}/{len(todo)}', flush=True)
    db.commit()
    print('done', db.execute('select count(*), sum(length(tile_data)) from tiles').fetchone())
    if failed:
        sys.exit(f'{failed} Kacheln nicht geladen (Verbindung?). Einfach nochmal starten, es geht dort weiter.')


if __name__ == '__main__':
    main()
