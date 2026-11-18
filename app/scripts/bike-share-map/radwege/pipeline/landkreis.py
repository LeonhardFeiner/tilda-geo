"""The Landkreis network that Lageplan 5/2 shows "nachrichtlich" (Mobilitätskonzept zum Radverkehr im
Landkreis Pfaffenhofen, 2023): Radvorrangrouten (orange) and Basisradnetz (light green), as plan
geometry in WGS 84. Context layer of the tracker page; the routes are the Landkreis's, planned as
Geh- und Radwege (Erläuterung 2.3.1).

  landkreis.py <cache dir> <out landkreis.geojson>
"""
import json, math, sys

import numpy as np
from pyproj import Transformer
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge

W, OUT = sys.argv[1:3]
G = json.load(open(f'{W}/georef.json'))
A, B, TX, TY = G['a'], G['b'], G['tx'], G['ty']
to_wgs = Transformer.from_crs(25832, 4326, always_xy=True)
KEYS = {'vorrang': 'rgb(100%,44.897461%,0%)|17', 'basis': 'rgb(46.897888%,84.764099%,46.897888%)|17'}
LEGEND_X = 8800  # raw x beyond the map frame (legend), as for the red Bestand lines in assign.py
GAP = 60  # raw units (~63 m): dash gaps and drawing gaps are bridged
MIN_LEN = 150  # m; shorter leftovers are legend swatches or junction stubs


def raw2utm(p):
    X, Y = p
    return (A * X - B * Y + TX, B * X + A * Y + TY)


strokes = json.load(open(f'{W}/lang-strokes.json'))
features = []
for netz, key in KEYS.items():
    polys = [[tuple(q) for q in p] for _, p in strokes[key] if len(p) > 1 and max(x for x, _ in p) < LEGEND_X]
    segs = [list(p) for p in polys]
    # bridge each dangling end to the nearest end of another stroke within GAP
    ends = [(i, p[0]) for i, p in enumerate(polys)] + [(i, p[-1]) for i, p in enumerate(polys)]
    deg = {}
    for _, e in ends: deg[e] = deg.get(e, 0) + 1
    dangling = [(i, e) for i, e in ends if deg[e] == 1]
    tree = cKDTree(np.array([e for _, e in dangling]))
    for a, (i, e) in enumerate(dangling):
        for d, b in zip(*tree.query(e, k=4, distance_upper_bound=GAP)):
            if np.isfinite(d) and d > 0 and dangling[b][0] != i and a < b:
                segs.append([e, dangling[b][1]]); break
    merged = linemerge(MultiLineString([[raw2utm(q) for q in s] for s in segs]))
    n = 0
    for g in (merged.geoms if hasattr(merged, 'geoms') else [merged]):
        if g.length < MIN_LEN: continue
        g = g.simplify(2.0)
        ll = [[round(v, 6) for v in to_wgs.transform(*c)] for c in g.coords]
        features.append(dict(type='Feature', properties=dict(netz=netz), geometry=dict(type='LineString', coordinates=ll)))
        n += g.length
    print(f'{netz}: {n / 1000:.1f} km', file=sys.stderr)
json.dump(dict(type='FeatureCollection', features=features), open(OUT, 'w'), separators=(',', ':'))
