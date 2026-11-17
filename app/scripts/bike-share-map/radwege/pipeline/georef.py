"""Fit raw CAD coords of the Lagepläne -> UTM32 (EPSG:25832) with a similarity transform.

Usage: georef.py <work dir> <osm-area.json>
Writes <work>/georef.json {a,b,tx,ty} meaning E = a*X - b*Y + tx, N = b*X + a*Y + ty
"""
import json, math, re, sys, html
import numpy as np
from scipy.spatial import cKDTree
from pyproj import Transformer

W = sys.argv[1]; OSM = json.load(open(sys.argv[2]))
to_utm = Transformer.from_crs(4326, 25832, always_xy=True)

def pt_to_raw(x, y):
    return ((x - 11.334341) / 0.11994, (5677.823326 - y) / 0.11994)

# 1. place labels (single dark words/lines) from the short-term plan text layer
s = open(f'{W}/kurz-bbox.html').read()
labels = []
for ln in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', s, re.S):
    x0, y0, x1, y1 = map(float, ln.groups()[:4])
    if x0 > 1000: continue
    words = [html.unescape(w) for w in re.findall(r'<word[^>]*>(.*?)</word>', ln.group(5))]
    labels.append((' '.join(words).strip(), pt_to_raw((x0 + x1) / 2, (y0 + y1) / 2)))

places = {}
for p in OSM['places']:
    if p['name']: places.setdefault(p['name'], []).append(to_utm.transform(p['lon'], p['lat']))

pairs = []
for name, raw in labels:
    if name.endswith('-') or name not in places or len(places[name]) != 1: continue
    pairs.append((name, raw, places[name][0]))
print('label pairs', len(pairs))

def fit(src, dst):
    src = np.asarray(src); dst = np.asarray(dst)
    ms, md = src.mean(0), dst.mean(0); s0 = src - ms; d0 = dst - md
    den = (s0 ** 2).sum()
    a = (s0[:, 0] * d0[:, 0] + s0[:, 1] * d0[:, 1]).sum() / den
    b = (s0[:, 0] * d0[:, 1] - s0[:, 1] * d0[:, 0]).sum() / den
    tx = md[0] - (a * ms[0] - b * ms[1]); ty = md[1] - (b * ms[0] + a * ms[1])
    return a, b, tx, ty

def apply(T, P):
    a, b, tx, ty = T; P = np.asarray(P)
    return np.c_[a * P[:, 0] - b * P[:, 1] + tx, b * P[:, 0] + a * P[:, 1] + ty]

use = pairs
for it in range(6):
    T = fit([p[1] for p in use], [p[2] for p in use])
    res = np.hypot(*(apply(T, [p[1] for p in pairs]) - np.array([p[2] for p in pairs])).T)
    lim = max(250, np.median(res) * 2.5)
    use = [p for p, r in zip(pairs, res) if r < lim]
print('label fit: scale', round(math.hypot(T[0], T[1]), 5), 'rot deg', round(math.degrees(math.atan2(T[1], T[0])), 3),
      'median residual m', round(float(np.median(res)), 1), 'used', len(use))

# 2. ICP on classified road centrelines
strokes = json.load(open(f'{W}/kurz-strokes.json'))
ROADKEYS = ['rgb(96.09375%,0%,88.28125%)|17', 'rgb(0%,100%,0%)|17', 'rgb(86.326599%,51.171875%,7.788086%)|17']
def densify(poly, step):
    out = []
    for p, q in zip(poly, poly[1:]):
        n = max(1, int(math.dist(p, q) / step))
        for i in range(n): out.append((p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n))
    return out
src = []
for k in ROADKEYS:
    for _, poly in strokes[k]:
        if max(x for x, _ in poly) > 8800: continue  # legend
        src += densify(poly, 15)
src = np.array(src)
tgt = []
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary'}
for w in OSM['ways']:
    if w['tags'].get('highway') not in MAJOR: continue
    c = [to_utm.transform(x, y) for x, y in w['coords']]
    tgt += densify(c, 4)
tgt = np.array(tgt); tree = cKDTree(tgt)
for it, lim in enumerate([150, 100, 60, 40, 30, 25, 25, 25]):
    P = apply(T, src); d, i = tree.query(P)
    m = d < lim
    T = fit(src[m], tgt[i[m]])
d, _ = tree.query(apply(T, src))
print('ICP: scale', round(math.hypot(T[0], T[1]), 5), 'rot deg', round(math.degrees(math.atan2(T[1], T[0])), 3),
      'median dist m', round(float(np.median(d)), 2), 'p90', round(float(np.percentile(d, 90)), 1), 'n', len(src))
json.dump(dict(a=T[0], b=T[1], tx=T[2], ty=T[3], medianM=float(np.median(d)), p90M=float(np.percentile(d, 90))), open(f'{W}/georef.json', 'w'))
