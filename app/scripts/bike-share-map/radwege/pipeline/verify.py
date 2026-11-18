"""Checks the extracted route lines against the plan strokes they came from, independent of the
graph logic in assign.py. Prints a report; exit code 0 always (it is a review aid).

  verify.py <cache dir> <lines.geojson> <routes.json> <gemeinde.geojson>

Per route line (assigned.geojson, plan geometry before snapping onto OSM):
  ink    share of the line that lies on a stroke of its colour (solid ~1, dashed ~0.5-0.8);
         flags 'voll' below 0.85 and 'bestand-weg' above 0.9
  colour which plan colour the line mostly follows (blue = Haupt, cyan = Ergänzend, red = Bestand)
Per final line (lines.geojson, after map matching): share farther than 65 m from any route stroke.
Per plan: route strokes inside the Gemeinde (+300 m) that no final line covers ("missing") or
that only the leftover lines ohne-beschriftung-* cover ("unlabelled").
"""
import collections, json, math, sys

import numpy as np
from pyproj import Transformer
from shapely import STRtree, LineString, line_interpolate_point, transform
from shapely.geometry import shape

W, LINES, ROUTESF, GEMF = sys.argv[1:5]
G = json.load(open(f'{W}/georef.json'))
A, B, TX, TY = G['a'], G['b'], G['tx'], G['ty']
to_utm = Transformer.from_crs(4326, 25832, always_xy=True)
COLOURS = {'haupt': 'rgb(0%,0%,100%)|12', 'ergaenzend': 'rgb(0%,100%,100%)|12', 'bestand': 'rgb(100%,0%,0%)|12'}
NAMES = {'bestand': 'Bestand', 'haupt': 'Haupt', 'ergaenzend': 'Ergänzend'}
ROUTES = {r['id']: r for r in json.load(open(ROUTESF))['routes']}


def wgs2raw(lon, lat):
    x, y = to_utm.transform(lon, lat)
    E, N = x - TX, y - TY
    d = A * A + B * B
    return ((A * E + B * N) / d, (-B * E + A * N) / d)


def raw_line(coords):
    return LineString([wgs2raw(*c) for c in coords])


def samples(line, step):
    n = max(2, int(line.length / step) + 1)
    return line_interpolate_point(line, np.linspace(0, line.length, n))


gem = shape(json.load(open(GEMF))['geometry'])
strokes = {}
for plan in ('kurz', 'lang'):
    s = json.load(open(f'{W}/{plan}-strokes.json'))
    strokes[plan] = {k: [LineString(p) for _, p in s.get(v, []) if len(p) > 1] for k, v in COLOURS.items()}
trees = {plan: {k: STRtree(v) for k, v in d.items() if v} for plan, d in strokes.items()}

gem_raw = transform(gem, lambda a: np.array([wgs2raw(x, y) for x, y in a])).buffer(300)


def dist_to(plan, colour, pts):
    t = trees[plan].get(colour)
    if t is None: return np.full(len(pts), np.inf)
    _, d = t.query_nearest(pts, return_distance=True, all_matches=False)
    return d


def m(raw_len):
    return raw_len * math.hypot(A, B)


print('== 1. Ink and colour of every route line (plan geometry, before snapping)')
assigned = json.load(open(f'{W}/assigned.geojson'))['features']
per_route = collections.defaultdict(lambda: collections.defaultdict(float))
flags = []
for f in assigned:
    p = f['properties']
    if p.get('unassigned'): continue
    line = raw_line(f['geometry']['coordinates'])
    if line.length < 1: continue
    pts = samples(line, 2)
    d = {k: dist_to(p['plan'], k, pts) for k in COLOURS}
    own = 'bestand' if p['ausbau'] == 'bestand' else p['netz']
    ink = float(np.mean(d[own] < 3))
    best = min(COLOURS, key=lambda k: np.median(d[k]))
    L = m(line.length)
    per_route[(p['plan'], p['routeId'])][p['ausbau']] += L
    why = []
    if p['plan'] == 'lang' and p['ausbau'] == 'voll' and ink < 0.85 and L > 40: why.append(f'solid in data, ink {ink:.2f} (dashed in plan?)')
    # a single dash is fully inked; a dashed stretch longer than any dash must show gaps
    if p['plan'] == 'lang' and p['ausbau'] == 'bestand-weg' and ink > 0.9 and L > 270: why.append(f'dashed in data, ink {ink:.2f} (solid in plan?)')
    if best != own and np.median(d[own]) > 3: why.append(f'follows {NAMES[best]} strokes, not {NAMES[own]}')
    if why:
        c = f['geometry']['coordinates']
        flags.append((p['plan'], p['routeId'], p['ausbau'], round(L), why, c[len(c) // 2]))
for fl in flags: print('FLAG', *fl)
print(f'{len(flags)} flagged route lines')

print('\n== 2. Final lines (after map matching) farther than 65 m from any route stroke')
final = json.load(open(LINES))['features']
off_total = 0
for f in final:
    p = f['properties']
    line = raw_line(f['geometry']['coordinates'])
    pts = samples(line, 4)
    d = np.min([dist_to(p['plan'], k, pts) for k in COLOURS], axis=0)
    off = float(np.mean(d > 65 / math.hypot(A, B))) * m(line.length)
    off_total += off
    if off > 40: print('OFF', p['plan'], p['routeId'], p['ausbau'], f'{off:.0f} m of {m(line.length):.0f} m', f['geometry']['coordinates'][0])
print(f'total off-plan {off_total / 1000:.2f} km')

print('\n== 3. Route strokes no final line covers, and strokes only the leftover lines cover')
for plan in ('kurz', 'lang'):
    lab, rest = [], []
    for f in final:
        if f['properties']['plan'] != plan and f['properties']['ausbau'] != 'bestand': continue
        (rest if f['properties']['routeId'].startswith('ohne-beschriftung') else lab).append(raw_line(f['geometry']['coordinates']))
    tl, tr = STRtree(lab), STRtree(rest) if rest else None
    for k in COLOURS:
        if plan == 'lang' and k == 'bestand': continue
        segs = [s for s in strokes[plan][k] if gem_raw.intersects(s)]
        if not segs: continue
        pts = np.concatenate([samples(s, 4) for s in segs])
        pts = pts[[gem_raw.contains(q) for q in pts]]
        _, dl = tl.query_nearest(pts, return_distance=True, all_matches=False)
        dr = tr.query_nearest(pts, return_distance=True, all_matches=False)[1] if tr else np.full(len(pts), np.inf)
        tol = 65 / math.hypot(A, B)  # the plans draw lines beside their road
        miss = (dl > tol) & (dr > tol)
        unl = (dl > tol) & (dr <= tol)
        step = m(4)
        print(f'{plan}/{NAMES[k]}: {len(pts) * step / 1000:.1f} km of strokes, missing {miss.sum() * step / 1000:.2f} km, only unlabelled {unl.sum() * step / 1000:.2f} km')
        # clusters of missing strokes > 60 m
        for name, mask in (('MISSING', miss), ('UNLABELLED', unl)):
            P = pts[mask]
            if not len(P): continue
            xy = np.array([[q.x, q.y] for q in P])
            seen = np.zeros(len(xy), bool)
            for i in range(len(xy)):
                if seen[i]: continue
                stack, members = [i], []
                seen[i] = True
                while stack:
                    j = stack.pop(); members.append(j)
                    near = np.where(~seen & (np.hypot(*(xy - xy[j]).T) < 12))[0]
                    seen[near] = True; stack.extend(near.tolist())
                if len(members) * step >= 60:
                    cx, cy = xy[members].mean(axis=0)
                    E, N = A * cx - B * cy + TX, B * cx + A * cy + TY
                    lon, lat = Transformer.from_crs(25832, 4326, always_xy=True).transform(E, N)
                    print(f'  {name} {len(members) * step:.0f} m near {lon:.5f},{lat:.5f}')

print('\n== 4. Measured length against the concept (> 25 % apart)')
km = collections.defaultdict(float)
for f in final:
    p = f['properties']
    km[(p['plan'], p['routeId'])] += m(raw_line(f['geometry']['coordinates']).length) / 1000
for (plan, rid), v in sorted(km.items()):
    c = ROUTES[rid].get('lengthConceptKm')
    if c and abs(v - c) / c > 0.25: print('LEN', plan, rid, f'{v:.2f} km measured, concept {c} km')
