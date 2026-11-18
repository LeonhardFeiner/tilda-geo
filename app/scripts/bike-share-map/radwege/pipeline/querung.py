"""Where a route has to cross a Kreis-/Staatsstraße: the plans draw a new path beside a road on
the side where it is to be built (assign.py: `seite`); where the drawing changes sides along the
same road, the road has to be crossed there. We put the crossing at the nearest junction of that
road (the stretch the drawing overshoots into a side street only says on which side of the
junction). An assumption from the drawing, not a planned Querungshilfe; the page says so.

Writes querungen.geojson (points) and, for a side change with no junction within REACH metres,
adds a point to pruefen.geojson.

  querung.py <cache dir> <lines.geojson> <pruefen.geojson> <out querungen.geojson>
"""
import collections, json, math, sys

from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.ops import linemerge

W, LINES, PRUEF, OUT = sys.argv[1:5]  # -v: print the side runs per road
to_utm = Transformer.from_crs(4326, 25832, always_xy=True)
to_wgs = Transformer.from_crs(25832, 4326, always_xy=True)
NEAR_END = 250  # the stable stretches on either side of a change lie at most this far apart
REACH = 150     # farthest a junction may lie from the side change

osm = json.load(open(f'{W}/osm-area.json'))
L = lambda c: LineString([to_utm.transform(*p) for p in c])
ways = [(w['tags'], L(w['coords'])) for w in osm['ways'] if len(w['coords']) > 1]
places = [(p['name'], Point(to_utm.transform(p['lon'], p['lat']))) for p in osm['places']
          if p['place'] in ('village', 'hamlet', 'town', 'suburb', 'isolated_dwelling')]


def ref_of(t):
    return (t.get('ref') or '').strip()


def junctions(ref):
    """[(point, name of the side way)] where another way meets the road `ref`."""
    road = [g for t, g in ways if ref_of(t) == ref]
    verts = {}
    for g in road:
        for c in g.coords:
            verts[(round(c[0], 1), round(c[1], 1))] = c
    out = []
    for t, g in ways:
        if ref_of(t) == ref or t.get('bikelane'):
            continue
        for c in (g.coords[0], g.coords[-1], *list(g.coords)[1:-1]):
            k = (round(c[0], 1), round(c[1], 1))
            if k in verts and not any(Point(c).distance(p) < 15 for p, _ in out):
                out.append((Point(c), t.get('name') or {'track': 'Feldweg', 'path': 'Weg', 'service': 'Zufahrt'}.get(t.get('highway'), 'Weg')))
    return out


drawn = collections.defaultdict(list)
for f in json.load(open(f'{W}/assigned.geojson'))['features']:
    q = f['properties']
    if not q.get('unassigned'):
        drawn[(q['routeId'], q['plan'])].append(L(f['geometry']['coordinates']))
roads = collections.defaultdict(list)
for t, g in ways:
    if ref_of(t) and (t.get('highway') in ('primary', 'secondary', 'tertiary') or ref_of(t).startswith(('St ', 'PAF '))):
        roads[ref_of(t)].append(g)
roads = {r: linemerge(gs) for r, gs in roads.items()}

# direction from the road to the drawing (unit vector), every 10 m along new paths on a road
samples = collections.defaultdict(list)  # (plan, ref) -> [(point, normal, routeId)]
road_list = [(ref, comp) for ref, R in roads.items() for comp in getattr(R, 'geoms', [R])]
for f in json.load(open(LINES))['features']:
    p = f['properties']
    if p['weg'] not in ('kreisstrasse', 'staatsstrasse') or p['ausbau'] not in ('voll', 'kein-weg'):
        continue
    D = drawn.get((p['routeId'], p['plan']))
    if not D:
        continue
    g = L(f['geometry']['coordinates'])
    for k in range(0, int(g.length) + 1, 10):
        q = g.interpolate(k)
        on = [ref for ref, comp in road_list if comp.distance(q) < 3]
        if not on:
            continue
        dd = min(D, key=lambda x: x.distance(q))
        dp = dd.interpolate(dd.project(q))
        vx, vy = dp.x - q.x, dp.y - q.y
        n = math.hypot(vx, vy)
        if not 5 <= n <= 90:
            continue
        for ref in {r.strip() for x in on for r in x.split(';')}:
            samples[(p['plan'], ref)].append((q, (vx / n, vy / n), p['routeId']))

found = []  # (plan, ref, point where the sides change, routes)
for (plan, ref), xs in samples.items():
    # a stable side: at least 6 samples within 60 m that agree
    stable = []
    for q, nv, rid in xs:
        nb = [x for x in xs if x[0].distance(q) <= 60]
        ax, ay = sum(x[1][0] for x in nb) / len(nb), sum(x[1][1] for x in nb) / len(nb)
        if len(nb) >= 6 and math.hypot(ax, ay) > 0.8:
            stable.append((q, (ax, ay), rid))
    pairs = []
    for i, (q1, n1, r1) in enumerate(stable):
        for q2, n2, r2 in stable[i + 1:]:
            d = q1.distance(q2)
            if d <= NEAR_END and n1[0] * n2[0] + n1[1] * n2[1] < -0.5:
                pairs.append((d, q1, q2, r1, r2))
    for d, q1, q2, r1, r2 in sorted(pairs, key=lambda x: x[0]):
        mid = Point((q1.x + q2.x) / 2, (q1.y + q2.y) / 2)
        if not any(f[0] == plan and f[1] == ref and f[2].distance(mid) < 150 for f in found):
            found.append((plan, ref, mid, sorted({r1, r2})))

JUNC = {}
feats, flags = [], []
for plan, ref, mid, rids in found:
    if ref not in JUNC:
        JUNC[ref] = junctions(ref)
    # where the drawing itself crosses the road decides the junction; the stretch it overshoots
    # into the other side only says on which side of the junction
    road = [comp for r, comp in road_list if ref in [x.strip() for x in r.split(';')] and comp.distance(mid) < 5]
    cross = []
    for rid in rids:
        for d in drawn.get((rid, plan), []):
            for comp in road:
                x = d.intersection(comp)
                for pt in getattr(x, 'geoms', [x]):
                    if not pt.is_empty and pt.geom_type == 'Point' and pt.distance(mid) < NEAR_END:
                        cross.append(pt)
    at = min(cross, key=lambda c: c.distance(mid)) if cross else mid
    near = sorted(((pt.distance(at), pt, name) for pt, name in JUNC[ref]), key=lambda x: x[0])
    place = min(places, key=lambda x: x[1].distance(mid))
    where = place[0] if place[1].distance(mid) < 1500 else None
    if near and near[0][0] <= REACH:
        _, pt, name = near[0]
        at_txt = ('an der Einmündung eines ' + {'Feldweg': 'Feldwegs', 'Weg': 'Wegs', 'Zufahrt': 'Zufahrtswegs'}[name]) if name in ('Feldweg', 'Weg', 'Zufahrt') else 'Höhe ' + name
        text = ('Querung der ' + ref + (' in ' + where if where else '') + ', ' + at_txt +
                ': Der Plan zeichnet den Weg hier auf der anderen Straßenseite weiter. Annahme aus der Seitenlage im Plan; ob und wie gequert wird, ist nicht festgelegt.')
        x, y = to_wgs.transform(pt.x, pt.y)
        feats.append(dict(type='Feature', properties=dict(plan=plan, strasse=ref, routeIds=rids, ort=where, hoehe=name, text=text),
                          geometry=dict(type='Point', coordinates=[round(x, 6), round(y, 6)])))
    else:
        x, y = to_wgs.transform(mid.x, mid.y)
        for rid in rids:
            flags.append(dict(type='Feature', properties=dict(routeId=rid, plan=plan, grund='strassenseite',
                              text='Der Plan wechselt hier die Seite der ' + ref + ', aber keine Einmündung liegt näher als ' + str(REACH) + ' m – wo gequert werden soll, ist unklar.'),
                              geometry=dict(type='Point', coordinates=[round(x, 6), round(y, 6)])))

json.dump(dict(type='FeatureCollection', features=feats), open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
if flags:
    pr = json.load(open(PRUEF))
    pr['features'] += flags
    json.dump(pr, open(PRUEF, 'w'), ensure_ascii=False, separators=(',', ':'))
print('querungen', len(feats), dict(collections.Counter(f['properties']['strasse'] for f in feats)), '| ohne Einmündung', len(flags))
for f in feats:
    print('  ', f['properties']['plan'], f['properties']['strasse'], f['properties']['ort'], f['properties']['hoehe'], f['properties']['routeIds'])
