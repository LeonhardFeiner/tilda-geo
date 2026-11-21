"""Land check of the matched lines: does each stretch run on a path or road plot?

For every 5 m of lines.geojson:
- `weg`: on a road (ALKIS Tatsächliche Nutzung Straßenverkehr/Platz within 4 m) or by a narrow
  parcel, typically a Wegeflurstück, read from the ALKIS Parzellarkarte in two ways: two
  neighbouring parcel boundaries 1.5-20 m apart on the cross-section through the point (within
  10 m), or a parcel area that is at most 20 m wide and at least six times as long (within 6 m;
  this also catches parcels where the cross-section misses one boundary). OSM ways often lie a few
  metres beside the cadastre, hence the margins;
- `genutzt`: not that, but a Tatsächliche Nutzung area of type Weg within 6 m: a path in use that
  has no plot of its own (it crosses a field or forest plot). TN Weg alone is not taken as a path
  plot: TN records the use, also inside larger plots;
- `kein`: neither.
Each point takes the majority class of the points within 30 m along the line (single points
are mostly noise), then runs shorter than 20 m join their neighbours. Each line is split where the class changes and
gets it as `flur` (the page's "Grundstück" view); everything else stays as it was.

Sources (CC BY 4.0, Bayerische Vermessungsverwaltung): TN shapefile of the Landkreis
(cache/alkis/tn_<Kreis>/Nutzung.*, from https://download1.bayernwolke.de/a/tn/lkr/tn_09186.zip
for Pfaffenhofen and …/tn_09178.zip for Freising) and the
Parzellarkarte WMS (outline layer), cached as 500 m tiles in cache/alkis/parz/; the distance to the
nearest narrow parcel area per tile in cache/alkis/stripdist/.

usage: flur.py cache_dir lines.geojson out.geojson  (run.sh writes lines.geojson in place)
"""
import json, math, os, sys, glob, urllib.request, collections
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import shapefile
from PIL import Image
from scipy import ndimage
from pyproj import Transformer
from shapely.geometry import LineString, shape, box
from shapely.strtree import STRtree
from shapely.ops import substring

work, lines_path, out_path = sys.argv[1:4]
to_utm = Transformer.from_crs(4326, 25832, always_xy=True).transform
to_wgs = Transformer.from_crs(25832, 4326, always_xy=True).transform
STEP, TILE, RES = 5.0, 500, 0.25  # sample spacing m, tile size m, raster m/px
WAY_USE = {'Weg', 'Straßenverkehr', 'Platz'}
TOL_ROAD, TOL_WEG, TOL_STRIP, TOL_AREA = 4.0, 6.0, 10.0, 6.0  # m; OSM ways lie beside the cadastre
STRIP_MIN, STRIP_MAX = 1.5, 20.0  # width of a path or road plot, m
SMOOTH = 6  # majority over +-6 samples (30 m)

feats = json.load(open(lines_path))['features']
geoms = [LineString([to_utm(*c) for c in f['geometry']['coordinates']]) for f in feats]
xs = [c for g in geoms for c in g.bounds[0::2]]; ys = [c for g in geoms for c in g.bounds[1::2]]
area = box(min(xs) - 100, min(ys) - 100, max(xs) + 100, max(ys) + 100)

# --- TN: path/road areas near the lines
ways = []; kinds = []
for shp in sorted(glob.glob(os.path.join(work, 'alkis', 'tn_*', 'Nutzung.shp'))):
    for sr in shapefile.Reader(shp[:-4]).iterShapeRecords(fields=['nutzart']):
        if sr.record[0] not in WAY_USE: continue
        bb = sr.shape.bbox
        if bb[2] < area.bounds[0] or bb[0] > area.bounds[2] or bb[3] < area.bounds[1] or bb[1] > area.bounds[3]: continue
        g = shape(sr.shape.__geo_interface__)
        if g.is_valid or (g := g.buffer(0)).is_valid: ways.append(g); kinds.append(sr.record[0])
tree = STRtree(ways)
print(f'TN: {len(ways)} path/road areas', file=sys.stderr)

# --- Parzellarkarte outlines as tiles (alpha > 0 = a boundary line or label)
pdir = os.path.join(work, 'alkis', 'parz'); os.makedirs(pdir, exist_ok=True)
need = set()
for g in geoms:
    x0, y0, x1, y1 = g.bounds
    for ix in range(int(x0 // TILE), int(x1 // TILE) + 1):
        for iy in range(int(y0 // TILE), int(y1 // TILE) + 1):
            if g.distance(box(ix * TILE, iy * TILE, (ix + 1) * TILE, (iy + 1) * TILE)) < STRIP_MAX + TOL_STRIP: need.add((ix, iy))
N = int(TILE / RES)


def fetch(t):
    fn = os.path.join(pdir, f'{t[0]}_{t[1]}.png')
    if os.path.exists(fn): return
    x0, y0 = t[0] * TILE, t[1] * TILE
    url = ('https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
           f'&LAYERS=by_alkis_parzellarkarte_umr_gelb&STYLES=&SRS=EPSG:25832&BBOX={x0},{y0},{x0 + TILE},{y0 + TILE}'
           f'&WIDTH={N}&HEIGHT={N}&FORMAT=image/png&TRANSPARENT=true')
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'radwege-tracker/1.0'}), timeout=120).read()
    open(fn + '.tmp', 'wb').write(data); os.replace(fn + '.tmp', fn)


with ThreadPoolExecutor(4) as ex: list(ex.map(fetch, sorted(need)))
print(f'Parzellarkarte: {len(need)} tiles', file=sys.stderr)
tiles = {}


def boundary(x, y):
    t = (int(x // TILE), int(y // TILE))
    if t not in tiles:
        fn = os.path.join(pdir, f'{t[0]}_{t[1]}.png')
        tiles[t] = np.array(Image.open(fn).convert('RGBA'))[:, :, 3] > 40 if os.path.exists(fn) else None
    a = tiles[t]
    if a is None: return False
    px, py = int((x - t[0] * TILE) / RES), int(((t[1] + 1) * TILE - y) / RES)
    return 0 <= px < N and 0 <= py < N and bool(a[py, px])


# narrow parcel areas: label the areas between boundary lines (0.5 m pixels, the tile with its
# neighbours so parcels are not cut at the tile edge), keep those at most STRIP_MAX wide (twice
# the largest distance to their edge) and at least six times as long; per tile the distance to
# the nearest such area, in quarter metres (uint8, capped at 63.75 m)
sdir = os.path.join(work, 'alkis', 'stripdist'); os.makedirs(sdir, exist_ok=True)
F = 2; n = N // F; PX = RES * F
masks = {}


def outline(t):
    if t not in masks:
        fn = os.path.join(pdir, f'{t[0]}_{t[1]}.png')
        masks[t] = (np.array(Image.open(fn).convert('RGBA'))[:, :, 3] > 40).reshape(n, F, n, F).max(axis=(1, 3)) if os.path.exists(fn) else None
    return masks[t]


for t in sorted(need):
    fn = os.path.join(sdir, f'{t[0]}_{t[1]}.png')
    if os.path.exists(fn) and os.path.getmtime(fn) >= os.path.getmtime(os.path.join(pdir, f'{t[0]}_{t[1]}.png')): continue
    big = np.zeros((3 * n, 3 * n), bool); known = np.zeros((3 * n, 3 * n), bool)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            m = outline((t[0] + dx, t[1] + dy))
            r0, c0 = (1 - dy) * n, (dx + 1) * n  # image rows run north to south
            if m is not None: big[r0:r0 + n, c0:c0 + n] = m; known[r0:r0 + n, c0:c0 + n] = True
    lab, k = ndimage.label(~big)
    idx = np.arange(1, k + 1)
    w = 2 * ndimage.maximum(ndimage.distance_transform_edt(~big) * PX, lab, idx)
    area = ndimage.sum(np.ones_like(lab), lab, idx) * PX * PX
    unknown = ndimage.maximum((~known).astype(np.uint8), lab, idx)
    narrow = np.zeros(k + 1, bool)
    narrow[1:] = (w >= 1) & (w <= STRIP_MAX) & (area / np.maximum(w, 1e-6) >= 6 * w) & (unknown == 0)
    d = ndimage.distance_transform_edt(~narrow[lab]) * PX
    Image.fromarray(np.clip(d[n:2 * n, n:2 * n] * 4, 0, 255).astype(np.uint8)).save(fn)
sdist = {}


def area_strip(x, y):
    t = (int(x // TILE), int(y // TILE))
    if t not in sdist:
        fn = os.path.join(sdir, f'{t[0]}_{t[1]}.png')
        sdist[t] = np.array(Image.open(fn)) if os.path.exists(fn) else None
    a = sdist[t]
    if a is None: return 99.0
    return a[min(n - 1, int(((t[1] + 1) * TILE - y) / PX)), min(n - 1, int((x - t[0] * TILE) / PX))] / 4


def strips(p, d):
    """Narrow parcels across the line: pairs of neighbouring parcel boundaries on the
    perpendicular through p, as (near edge, far edge) in signed metres (OSM ways often lie a few
    metres beside the cadastre)."""
    nx, ny = -d[1], d[0]; hits = []
    for k in range(-int((STRIP_MAX + TOL_STRIP) / RES), int((STRIP_MAX + TOL_STRIP) / RES) + 1):
        s = k * RES
        if boundary(p.x + nx * s, p.y + ny * s):
            if hits and s - hits[-1][1] <= 0.75: hits[-1][1] = s
            else: hits.append([s, s])
    edges = [(a + b) / 2 for a, b in hits]
    return [(a, b) for a, b in zip(edges, edges[1:]) if STRIP_MIN <= b - a <= STRIP_MAX]


res = []
for f, g in zip(feats, geoms):
    n = max(2, int(g.length // STEP) + 1); cls = []
    for k in range(n):
        s = g.length * k / (n - 1); p = g.interpolate(s)
        a, b = g.interpolate(max(0, s - 3)), g.interpolate(min(g.length, s + 3))
        L = math.hypot(b.x - a.x, b.y - a.y) or 1; d = ((b.x - a.x) / L, (b.y - a.y) / L)
        near = [(ways[i].distance(p), kinds[i]) for i in tree.query(p.buffer(TOL_WEG))]
        if any(x < TOL_ROAD and t != 'Weg' for x, t in near) or area_strip(p.x, p.y) <= TOL_AREA \
                or any(a - TOL_STRIP <= 0 <= b + TOL_STRIP for a, b in strips(p, d)):
            cls.append('weg')
        else:
            cls.append('genutzt' if any(x < TOL_WEG and t == 'Weg' for x, t in near) else 'kein')
    cls = [collections.Counter(cls[max(0, k - SMOOTH):k + SMOOTH + 1]).most_common(1)[0][0] for k in range(len(cls))]
    # runs; short ones join the longer neighbour
    runs = []
    for k, c in enumerate(cls):
        if runs and runs[-1][0] == c: runs[-1][2] = k
        else: runs.append([c, k, k])
    changed = True
    while changed and len(runs) > 1:
        changed = False
        for i, (c, a, b) in enumerate(runs):
            if (b - a + 1) * g.length / (n - 1) < 20:
                j = i - 1 if i == len(runs) - 1 or (i > 0 and runs[i - 1][2] - runs[i - 1][1] >= runs[i + 1][2] - runs[i + 1][1]) else i + 1
                lo, hi = min(runs[i][1], runs[j][1]), max(runs[i][2], runs[j][2]); runs[j][1:] = [lo, hi]; del runs[i]
                merged = []
                for r2 in runs:
                    if merged and merged[-1][0] == r2[0]: merged[-1][2] = r2[2]
                    else: merged.append(r2)
                runs = merged; changed = True; break
    for c, a, b in runs:
        lo, hi = g.length * a / (n - 1), g.length * min(n - 1, b + 1) / (n - 1)
        seg = substring(g, lo, hi)
        if seg.length < 1: continue
        pr = dict(f['properties'], flur=c)
        res.append(dict(type='Feature', properties=pr, geometry=dict(type='LineString', coordinates=[[round(v, 6) for v in to_wgs(*q)] for q in seg.coords])))
json.dump(dict(type='FeatureCollection', features=res), open(out_path, 'w'), separators=(',', ':'))
km = collections.Counter()
for x in res: km[(x['properties'].get('plan', 'landkreis'), x['properties']['flur'])] += LineString([to_utm(*c) for c in x['geometry']['coordinates']]).length / 1000
print('km', {f'{p}/{c}': round(v, 1) for (p, c), v in sorted(km.items())}, file=sys.stderr)
