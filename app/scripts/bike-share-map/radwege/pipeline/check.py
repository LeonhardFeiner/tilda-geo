"""Spots where the map matching may be wrong, for someone who knows the area to look at; written
to pruefen.geojson, which the tracker page shows as a layer. One point per route and spot with a
reason (`grund`):

- gebaeude:   the line runs through a building (only possible where it keeps the drawing)
- strassenseite: the plan draws the route beside a road at a steady offset (in the plans that
                 means "a path on this side of the road"), but the match takes another way
- mehrdeutig: two parallel ways lie about equally close to the drawing
- abseits:    the match runs far from the drawing
- zickzack:   the match turns back on itself
- kurve:      the match bends or turns a corner (> 50° within ±40 m) where the drawing runs straight (< 20°)

  check.py <cache dir> <lines.geojson> <buildings.json> <out pruefen.geojson>
"""
import collections, json, math, sys

from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

W, LINES, BUILDINGS, OUT = sys.argv[1:5]
to_utm = Transformer.from_crs(4326, 25832, always_xy=True)
to_wgs = Transformer.from_crs(25832, 4326, always_xy=True)
STEP = 10
ROADS = ('staatsstrasse', 'kreisstrasse', 'ortsstrasse')


def L(c):
    return LineString([to_utm.transform(*p) for p in c])


# what each OSM way is, as in assign.py way_class (only the classes needed here)
def road_class(tags):
    hw, ref = tags.get('highway') or '', (tags.get('ref') or '').strip()
    if tags.get('bikelane'):
        return 'radweg'
    if ref.startswith(('St ', 'B ')) or hw in ('primary', 'secondary', 'trunk'):
        return 'staatsstrasse'
    if (ref and ref[0].isupper() and ' ' in ref) or hw == 'tertiary':
        return 'kreisstrasse'
    if hw in ('residential', 'unclassified', 'living_street', 'road'):
        return 'ortsstrasse'
    return 'weg'


osm = json.load(open(f'{W}/osm-area.json'))['ways']
WAYS = [(w['id'], road_class(w['tags']), (w['tags'].get('ref') or w['tags'].get('name') or '').strip(), L(w['coords']))
        for w in osm if len(w['coords']) > 1]
wtree = STRtree([w[3] for w in WAYS])
blds = [Polygon([to_utm.transform(*p) for p in b['coords']]) for b in json.load(open(BUILDINGS))['buildings']
        if b['building'] not in ('roof', 'carport', 'construction')]
blds = [b if b.is_valid else b.buffer(0) for b in blds]
btree = STRtree(blds)

drawn, matched = collections.defaultdict(list), collections.defaultdict(list)
for f in json.load(open(f'{W}/assigned.geojson'))['features']:
    p = f['properties']
    if not p.get('unassigned'):
        drawn[(p['routeId'], p['plan'])].append(L(f['geometry']['coordinates']))
for f in json.load(open(LINES))['features']:
    p = f['properties']
    matched[(p['routeId'], p['plan'])].append((L(f['geometry']['coordinates']), p))


def tangent(g, s):
    a, b = g.interpolate(max(0.0, s - 5)), g.interpolate(min(g.length, s + 5))
    dx, dy = b.x - a.x, b.y - a.y
    n = math.hypot(dx, dy) or 1.0
    return dx / n, dy / n


def runs(flags, min_len):
    """[(start index, end index)] of runs of True at least min_len metres long (STEP apart)."""
    out, a = [], None
    for i, v in enumerate(flags + [False]):
        if v and a is None:
            a = i
        elif not v and a is not None:
            if (i - a) * STEP >= min_len:
                out.append((a, i - 1))
            a = None
    return out


flags = []  # (routeId, plan, grund, utm point, text, metres)
for key, ms in matched.items():
    rid, plan = key
    M = unary_union([g for g, _ in ms])
    # 1. through a building
    for g, p in ms:
        for i in btree.query(g, predicate='intersects'):
            inter = g.intersection(blds[i])
            if inter.length > 4:
                flags.append((rid, plan, 'gebaeude', inter.interpolate(0.5, normalized=True),
                              'Die Linie führt durch ein Gebäude (' + str(round(inter.length)) + ' m).', inter.length))
    # 5. turns back on itself: 20 m on, 20 m back (not at the ends, where the end is projected)
    ends = [Point(c) for g, _ in ms for c in (g.coords[0], g.coords[-1])]
    for g, p in ms:
        last = -100.0
        for k in range(20, int((g.length - 40) // 2)):
            s = k * 2.0
            if g.interpolate(s - 20).distance(g.interpolate(s + 20)) < 10 and s - last > 60 \
                    and min(e.distance(g.interpolate(s)) for e in ends) > 60:
                last = s
                flags.append((rid, plan, 'zickzack', g.interpolate(s), 'Die zugeordnete Linie läuft hier hin und wieder zurück; vermutlich ein Umweg über einen falschen Weg.', 0))
    if key not in drawn:
        continue
    # 6. a bend in the match where the drawing is straight
    def turn(g, s, w=40):
        (ax, ay), (bx, by) = tangent(g, max(5.0, s - w)), tangent(g, min(g.length - 5, s + w))
        return math.degrees(math.acos(max(-1.0, min(1.0, ax * bx + ay * by))))
    for g, p in ms:
        if g.length < 100 or p.get('fromPlan', 0) > 0.5:
            continue
        bent = []
        for k in range(int(g.length // STEP) + 1):
            s = min(g.length, k * STEP)
            q = g.interpolate(s)
            D = min(drawn[key], key=lambda d: d.distance(q))
            bent.append(turn(g, s) > 50 and turn(D, D.project(q)) < 20 and D.distance(q) < 90)
        for a, b in runs(bent, 30):
            flags.append((rid, plan, 'kurve', g.interpolate(((a + b) / 2) * STEP),
                          'Die zugeordnete Linie macht hier eine Kurve oder Ecke, die Zeichnung im Plan verläuft gerade – vermutlich ein anderer Weg gemeint.', (b - a + 1) * STEP))
    for D in drawn[key]:
        n = int(D.length // STEP) + 1
        far, side, amb = [], [], []
        side_txt, amb_txt = {}, {}
        for k in range(n):
            s = min(D.length, k * STEP)
            q = D.interpolate(s)
            tx, ty = tangent(D, s)
            # 4. the match is far from the drawing
            dm = M.distance(q)
            far.append(dm > 45)
            # nearby ways running alongside the drawing, nearest first
            near = []
            for i in wtree.query(q.buffer(50)):
                wid, cls, name, g = WAYS[i]
                t = g.project(q)
                pr = g.interpolate(t)
                d = pr.distance(q)
                if d > 50:
                    continue
                wx, wy = tangent(g, t)
                if abs(tx * wx + ty * wy) < 0.9:  # not parallel
                    continue
                near.append((d, cls, name, pr))
            near.sort(key=lambda x: x[0])
            # 2. a road at a steady offset beside the drawing, but the match is not on it
            road = next((x for x in near if x[1] in ROADS and 8 <= x[0] <= 40), None)
            on_road = road is not None and M.distance(road[3]) < 6
            side.append(road is not None and not on_road and not any(x[0] < 6 for x in near))
            if side[-1]:
                side_txt[k] = road[2] or {'staatsstrasse': 'Staatsstraße', 'kreisstrasse': 'Kreisstraße'}.get(road[1], 'Straße')
            # 3. two different parallel ways about equally close
            distinct = []
            for x in near:
                if x[0] > 35 or any(x[3].distance(y[3]) < 8 for y in distinct):
                    continue
                distinct.append(x)
            amb.append(len(distinct) >= 2 and distinct[1][0] - distinct[0][0] < 6 and distinct[0][0] > 4)
            if amb[-1]:
                amb_txt[k] = ' und '.join(x[2] or {'weg': 'Feldweg', 'radweg': 'Radweg'}.get(x[1], x[1]) for x in distinct[:2])
        for a, b in runs(far, 80):
            flags.append((rid, plan, 'abseits', D.interpolate(((a + b) / 2) * STEP), 'Die zugeordnete Linie liegt über ' + str((b - a + 1) * STEP) + ' m mehr als 45 m neben der Zeichnung im Plan.', (b - a + 1) * STEP))
        for a, b in runs(side, 120):
            name = collections.Counter(side_txt[k] for k in range(a, b + 1) if k in side_txt).most_common(1)[0][0]
            flags.append((rid, plan, 'strassenseite', D.interpolate(((a + b) / 2) * STEP),
                          'Der Plan zeichnet die Trasse über ' + str((b - a + 1) * STEP) + ' m in gleichmäßigem Abstand neben „' + name + '“ – das bedeutet meist einen Weg auf dieser Straßenseite. Zugeordnet ist aber ein anderer Weg.', (b - a + 1) * STEP))
        for a, b in runs(amb, 100):
            what = collections.Counter(amb_txt[k] for k in range(a, b + 1) if k in amb_txt).most_common(1)[0][0]
            flags.append((rid, plan, 'mehrdeutig', D.interpolate(((a + b) / 2) * STEP),
                          'Zwei parallele Wege liegen gleich nah an der Zeichnung (' + what + '); welcher gemeint ist, ist unklar.', (b - a + 1) * STEP))

# one point per route, reason and spot
ORDER = ['gebaeude', 'strassenseite', 'kurve', 'abseits', 'mehrdeutig', 'zickzack']
kept = []
for f in sorted(flags, key=lambda f: (ORDER.index(f[2]), -f[5])):
    if any(k[0] == f[0] and k[1] == f[1] and k[3].distance(f[3]) < 150 for k in kept):
        continue
    kept.append(f)
feats = [dict(type='Feature', properties=dict(routeId=r, plan=pl, grund=g, text=t),
              geometry=dict(type='Point', coordinates=[round(v, 6) for v in to_wgs.transform(q.x, q.y)]))
         for r, pl, g, q, t, _ in kept]
json.dump(dict(type='FeatureCollection', features=feats), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('prüfstellen', len(feats), dict(collections.Counter(f[2] for f in kept)))
