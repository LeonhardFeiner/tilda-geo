"""Ranks the route lines by signs of a wrong map matching, for review by someone who knows the
area: length against the drawn line (detours), share farther than 45 m from the drawing, sharp
reversals (zigzags); also the length on Staats-/Kreisstraßen. Optionally draws the top 12 over
the OSM ways (grey), the plan as drawn (light blue) and the match (black; red = no way in OSM).

  review.py <cache dir> <lines.geojson> <planlage.geojson> [<out.png>]

Routes with "adopt" pieces (overrides.json) score a high length ratio by construction, and a
match onto a road the plan draws beside is often right; the ranking only says where to look.
"""
import collections, json, math, sys

from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import unary_union

W, LINES, PLANLAGE = sys.argv[1:4]
OUTPNG = sys.argv[4] if len(sys.argv) > 4 else None
t = Transformer.from_crs(4326, 25832, always_xy=True)


def L(c):
    return LineString([t.transform(*p) for p in c])


drawn = [f for f in json.load(open(f'{W}/assigned.geojson'))['features'] if not f['properties'].get('unassigned')]
lines = json.load(open(LINES))['features']
plan, got, big = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(float)
for f in drawn:
    plan[(f['properties']['routeId'], f['properties']['plan'])].append(L(f['geometry']['coordinates']))
for f in lines:
    p = f['properties']
    g = L(f['geometry']['coordinates'])
    k = (p['routeId'], p['plan'])
    got[k].append(g)
    if p['weg'] in ('kreisstrasse', 'staatsstrasse'):
        big[k] += g.length

out = []
for k, gs in got.items():
    if k not in plan:
        continue
    P = unary_union(plan[k])
    lp = sum(g.length for g in plan[k])
    lm = sum(g.length for g in gs)
    far = n = 0
    for g in gs:
        for i in range(int(g.length // 10) + 1):
            n += 1
            far += g.interpolate(i * 10).distance(P) > 45
    spikes = 0
    for g in gs:
        c = list(g.coords)
        for a, b, d in zip(c, c[1:], c[2:]):
            v1, v2 = (b[0] - a[0], b[1] - a[1]), (d[0] - b[0], d[1] - b[1])
            n1, n2 = math.hypot(*v1), math.hypot(*v2)
            if n1 > 3 and n2 > 3 and (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2) < -0.7:
                spikes += 1
    score = (lm / lp - 1) * 2 + far / max(n, 1) * 3 + spikes * 0.2
    out.append((round(score, 2), k[0], k[1], round(lm / lp, 2), far * 10, spikes, round(big[k]), round(lm)))
out.sort(reverse=True)
print('score route plan length_ratio far_m spikes on_big_road_m length_m')
for o in out[:25]:
    print(*o)

if OUTPNG:
    from PIL import Image, ImageDraw

    osm = [(w['tags']['highway'], [t.transform(*c) for c in w['coords']]) for w in json.load(open(f'{W}/osm-area.json'))['ways']]
    drawn_lines = json.load(open(PLANLAGE))['features']
    T, tiles = 430, []
    for sc, rid, pl, *_ in out[:12]:
        mine = [f for f in lines if f['properties']['routeId'] == rid and f['properties']['plan'] == pl]
        pts = [t.transform(*c) for f in mine for c in f['geometry']['coordinates']]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        R = max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 80

        def px(p):
            return ((p[0] - cx + R) / (2 * R) * T, (cy + R - p[1]) / (2 * R) * T)

        im = Image.new('RGB', (T, T + 16), 'white')
        dr = ImageDraw.Draw(im)
        for hw, c in osm:
            if c and max(abs(c[0][0] - cx), abs(c[0][1] - cy)) < R * 3:
                b = hw in ('primary', 'secondary', 'tertiary')
                dr.line([px(p) for p in c], fill=(150, 150, 150) if b else (205, 205, 205), width=4 if b else 1)
        for f in drawn_lines:
            if f['properties']['plan'] == pl:
                dr.line([px(t.transform(*c)) for c in f['geometry']['coordinates']], fill=(0, 170, 255), width=2)
        for f in mine:
            col = (255, 0, 0) if f['properties']['weg'] == 'kein' else (0, 0, 0)
            dr.line([px(t.transform(*c)) for c in f['geometry']['coordinates']], fill=col, width=2)
        dr.rectangle((0, 0, T, 15), fill='white')
        dr.text((2, 2), f'{rid} {pl} score {sc}', fill=(0, 0, 0))
        tiles.append(im)
    cols = 3
    o = Image.new('RGB', (cols * (T + 6), (len(tiles) + cols - 1) // cols * (T + 22)), (235, 235, 235))
    for i, im in enumerate(tiles):
        o.paste(im, ((i % cols) * (T + 6), (i // cols) * (T + 22)))
    o.save(OUTPNG)
