"""Assign the plan line strokes to the routes of routes.json and write lines.geojson.

Usage: assign.py <work> <osm-area.json> <routes.json> <debug.geojson> <lines.geojson> <overrides.json>

Each route label of a plan (text layer, coloured blue/cyan) names its stops; the route is the
cheapest path through that plan colour's line graph between them. overrides.json gives explicit
stops (place name, [x, y] in PDF points from top-left, or "open" = open line end near the label)
where names alone are ambiguous. Leftover plan lines >= 150 m become ohne-beschriftung-*;
the red Bestand lines of plan 5/1 become route "bestand". The plans are schematic (lines drawn
beside their road, parallel lines pushed apart), so every line is map-matched onto the OSM ways
within 60 m (hidden Markov model, see match()); each piece gets the way's class (weg) and
surface (belag), and fromPlan is the share left in plan geometry where no way is near.
"""
import json, math, re, sys, html, heapq, collections
import numpy as np
from scipy.spatial import cKDTree
from pyproj import Transformer
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import substring

W, OSMF, ROUTESF, OUT = sys.argv[1:5]
G = json.load(open(f'{W}/georef.json'))
OSM = json.load(open(OSMF))
ROUTES = json.load(open(ROUTESF))['routes']
to_utm = Transformer.from_crs(4326, 25832, always_xy=True)
to_wgs = Transformer.from_crs(25832, 4326, always_xy=True)
A, B, TX, TY = G['a'], G['b'], G['tx'], G['ty']

def raw2utm(p):
    X, Y = p
    return (A * X - B * Y + TX, B * X + A * Y + TY)

def utm2raw(p):
    E, N = p[0] - TX, p[1] - TY
    d = A * A + B * B
    return ((A * E + B * N) / d, (-B * E + A * N) / d)

def pt2raw(x, y):
    return ((x - 11.334341) / 0.11994, (5677.823326 - y) / 0.11994)

KEYS = {'haupt': 'rgb(0%,0%,100%)|12', 'ergaenzend': 'rgb(0%,100%,100%)|12'}
LABELCOL = {'blue': 'haupt', 'cyan': 'ergaenzend'}
OVERRIDES = json.load(open(sys.argv[6]))
# Dashed lines of plan 5/2, raw units (~1.06 m each); see the dash rule in the route loop.
MIN_DASH_GAP, MAX_DASH, MAX_END_DASH = 25, 250, 100

def norm(s):
    s = s.replace(' / ', ' ').replace('/', ' ').replace('–', '-')
    s = re.sub(r'\s*-\s*', ' - ', s)
    return re.sub(r'\s+', ' ', s).strip().replace('a. d.', 'a.d.')

# OSM places (unique names) in raw coords
places = collections.defaultdict(list)
for p in OSM['places']:
    if p['name']: places[p['name']].append(utm2raw(to_utm.transform(p['lon'], p['lat'])))

# OSM ways for snapping
ways = []
for w in OSM['ways']:
    hw = w['tags'].get('highway')
    if hw in ('proposed', 'construction', 'platform', 'steps', 'corridor', 'elevator', 'bus_stop', 'raceway'): continue
    ways.append((w['id'], hw, w['tags'].get('name'), LineString([to_utm.transform(x, y) for x, y in w['coords']]), w['tags']))
IDX = {}
for i, w in enumerate(ways): IDX.setdefault(w[0], i)
WAY_INDEX_OF = lambda ids: [IDX[i] for i in ids if i in IDX]
wpts, wid = [], []
for i, (_, _, _, ls, _) in enumerate(ways):
    n = max(2, int(ls.length / 3) + 1)
    for k in range(n):
        q = ls.interpolate(ls.length * k / (n - 1)); wpts.append((q.x, q.y)); wid.append(i)
wtree = cKDTree(np.array(wpts)); wid = np.array(wid)

out_feats, report = [], []

def build_graph(polys):
    key = lambda p: (round(p[0] / 2), round(p[1] / 2))
    coord, adj = {}, collections.defaultdict(list)
    segs = []
    for poly in polys:
        for p, q in zip(poly, poly[1:]):
            if key(p) != key(q): segs.append([tuple(p), tuple(q)])
    # T-junctions: a dangling endpoint lying on another segment splits it there
    ends = collections.Counter(key(e) for sg in segs for e in sg)
    dang = [e for sg in segs for e in sg if ends[key(e)] == 1]
    splits = collections.defaultdict(list)
    mids = np.array([((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in segs])
    mt = cKDTree(mids)
    for e in dang:
        best = None
        for j in mt.query_ball_point(e, 260):
            a, b = segs[j]
            if key(a) == key(e) or key(b) == key(e): continue
            ab = (b[0] - a[0], b[1] - a[1]); L2 = ab[0] ** 2 + ab[1] ** 2
            t = max(0, min(1, ((e[0] - a[0]) * ab[0] + (e[1] - a[1]) * ab[1]) / L2))
            pr = (a[0] + t * ab[0], a[1] + t * ab[1]); d = math.dist(e, pr)
            if d < 12 and (best is None or d < best[0]): best = (d, j, t, pr)
        if best and 0.02 < best[2] < 0.98: splits[best[1]].append((best[2], best[3], e))
    edges = []
    def add(p, q, kind, L=None):
        a, b = key(p), key(q)
        if a == b: return
        coord.setdefault(a, p); coord.setdefault(b, q)
        e = len(edges); edges.append((a, b, L if L is not None else math.dist(p, q), kind))
        adj[a].append((b, e)); adj[b].append((a, e))
    for j, (a, b) in enumerate(segs):
        pts = [a] + [pr for _, pr, _ in sorted(splits.get(j, []))] + [b]
        for p, q in zip(pts, pts[1:]): add(p, q, 'line')
        for _, pr, e in splits.get(j, []): add(pr, e, 'join', 0.1)
    # bridge gaps between dangling nodes (dashes ~45 units; joints up to 120 with a penalty)
    nodes = list(coord); arr = np.array([coord[n] for n in nodes]); t = cKDTree(arr)
    for n in nodes:
        if len(adj[n]) != 1: continue
        for d, j in zip(*t.query(coord[n], k=8, distance_upper_bound=120)):
            if not np.isfinite(d) or nodes[j] == n or d < 1: continue
            if any(m == nodes[j] for m, _ in adj[n]): continue
            add(coord[n], coord[nodes[j]], 'gap' if d <= 60 else 'joint')
            break
    return coord, adj, edges, nodes, t

def dijkstra(adj, edges, srcs, dsts):
    """srcs/dsts: {node: start cost}. Returns edge list of the cheapest path."""
    dist = dict(srcs); prev = {}; h = [(c, u) for u, c in srcs.items()]; heapq.heapify(h)
    best = None
    while h:
        d, u = heapq.heappop(h)
        if d > dist[u]: continue
        if u in dsts:
            tot = d + dsts[u]
            if best is None or tot < best[0]: best = (tot, u)
        if best and d > best[0]: break
        for v, e in adj[u]:
            k = edges[e][3]
            nd = d + edges[e][2] * (1.6 if k == 'gap' else 4 if k == 'joint' else 1)
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = (u, e); heapq.heappush(h, (nd, v))
    if not best: return None
    path = []; u = best[1]
    while u in prev: u, e = prev[u]; path.append(e)
    return path[::-1], best[1]

PLANPLACES = collections.defaultdict(list)
for lab in json.load(open(f'{W}/kurz-labels.json')):
    if lab['color'] == 'dark' and ' - ' not in lab['text'] and not lab['text'].endswith('-'):
        x0, y0, x1, y1 = lab['bbox']; PLANPLACES[lab['text'].split(' / ')[0]].append(pt2raw((x0 + x1) / 2, (y0 + y1) / 2))

def centre(name, label_raw):
    cands = places.get(name) or [c for k, v in PLANPLACES.items() if k.startswith(name) for c in v]
    if not cands: return None
    c = min(cands, key=lambda p: math.dist(p, label_raw))
    return c if math.dist(c, label_raw) < 4000 else None

def endpoint(name, label_raw, coord, nodes, tree):
    """Candidate graph nodes for a named place: {node: cost} within ~1 km of the place."""
    c = centre(name, label_raw)
    if c is None: return None
    idx = tree.query_ball_point(c, 950)
    if not idx: return None
    return {nodes[j]: 4.0 * math.dist(coord[nodes[j]], c) for j in idx}

for plan in ('kurz', 'lang'):
    strokes = json.load(open(f'{W}/{plan}-strokes.json'))
    labels = json.load(open(f'{W}/{plan}-labels.json'))
    for cls, keyname in KEYS.items():
        polys = [p for _, p in strokes[keyname] if max(x for x, _ in p) < 8800]
        coord, adj, edges, nodes, tree = build_graph(polys)
        used = collections.Counter()
        linedeg = collections.Counter(n for e in edges if e[3] == 'line' for n in e[:2])
        dangling = [n for n in nodes if linedeg[n] == 1]
        seen = set()
        jobs = []
        for lab in labels:
            if LABELCOL.get(lab['color']) != cls: continue
            text = norm(lab['text'])
            if len(text) < 4: continue
            x0, y0, x1, y1 = lab['bbox']; lraw = pt2raw((x0 + x1) / 2, (y0 + y1) / 2)
            route = next((r for r in ROUTES if r['plans'].get(plan) == cls and any(norm(l) == text for l in r['planLabels'])), None)
            if not route:
                report.append(f'{plan}/{cls}: label without route: {text}'); continue
            if route['id'] in seen: continue
            seen.add(route['id'])
            ov = OVERRIDES.get(f'{plan}|{route["id"]}', {})
            names = [n.strip() for n in re.sub(r'\(.*?\)', '', text).split(' - ') if n.strip()]
            jobs.append((route, text, lraw, ov.get('branches') or [names]))
        for key, ov in OVERRIDES.items():
            pl, rid = key.split('|')
            r = next(r for r in ROUTES if r['id'] == rid)
            if pl == plan and rid not in seen and r['plans'].get(plan) == cls and 'branches' in ov:
                seen.add(rid)
                jobs.append((r, r['name'], pt2raw(*ov['label']), ov['branches']))
        for route, text, lraw, branches in jobs:
          path = []
          ok = True
          for names in branches:
            stops = []
            for n in names:
                if isinstance(n, list):
                    q = pt2raw(*n); idx = tree.query_ball_point(q, 120) or [tree.query(q)[1]]
                    stops.append({nodes[j]: 4.0 * math.dist(coord[nodes[j]], q) for j in idx})
                elif n == 'open': stops.append(None)
                else: stops.append(endpoint(n, lraw, coord, nodes, tree))
            if stops[0] is None: stops, names = stops[::-1], names[::-1]
            if any(st is None for st in stops[:-1]):
                report.append(f'{plan}/{cls}: {text}: unresolved stop in {names}'); ok = False; break
            if stops[-1] is None:
                stops[-1] = {n: 0.5 * math.dist(coord[n], lraw) for n in dangling if math.dist(coord[n], lraw) < 3500 and n not in stops[0]}
            end = None
            for s, t2 in zip(stops, stops[1:]):
                if end is not None: s = {end: 0}  # next leg starts where this one ended
                r = dijkstra(adj, edges, s, t2)
                if r is None:
                    # Interrupted in the plan: ride each side as far towards the other as it goes
                    tc = np.mean([coord[n] for n in t2], axis=0)
                    r1 = dijkstra(adj, edges, s, {n: 3 * math.dist(coord[n], tc) for n in nodes})
                    xc = coord[r1[1]]
                    r2 = dijkstra(adj, edges, t2, {n: 3 * math.dist(coord[n], xc) for n in nodes})
                    if not r1 or not r2: ok = False; break
                    path += r1[0] + r2[0]; end = min(t2, key=t2.get)
                    report.append(f'   {text}: interrupted, gap {math.dist(xc, coord[r2[1]]) * A:.0f} m')
                    continue
                p, end = r
                path += p
            if not ok: break
          if not ok:
              report.append(f'{plan}/{cls}: {text}: no path'); continue
          for e in path: used[e] += 1
          # Dashes (plan 5/2): the plans draw every line as short pieces; a dashed line leaves gaps
          # of 25-60 units between dashes (measured 40-48), a solid one only drawing gaps of a few
          # units. A run of strokes between two dash gaps is a dash if shorter than MAX_DASH, a run
          # with a dash gap on one side only (end of a route, start of a dashed stretch) if
          # shorter than MAX_END_DASH. Drawing gaps and T-junction joins do not break a run;
          # joints (60-120) and a leg or branch change do.
          dashed_edges = set()
          if plan == 'lang':
              runs, cur, prev = [], None, None
              for e in path:
                  a, b, L, kind = edges[e]
                  if kind == 'gap' and L < MIN_DASH_GAP: kind = 'join'
                  if kind in ('gap', 'joint'):
                      if cur: cur['after'] = kind == 'gap'; runs.append(cur); cur = None
                      prev = kind; continue
                  if cur and not ({a, b} & cur['ends']):
                      runs.append(cur); cur = None; prev = None
                  if cur is None: cur = dict(edges=[], before=prev == 'gap', after=False, ends=set(), L=0.0)
                  cur['edges'].append(e); cur['ends'] = {a, b}
                  if kind == 'line': cur['L'] += L
                  prev = kind
              if cur: runs.append(cur)
              for r in runs:
                  both = r['before'] and r['after']
                  one = r['before'] or r['after']
                  if (both and r['L'] < MAX_DASH) or (one and r['L'] < MAX_END_DASH):
                      dashed_edges.update(r['edges'])
          parts = []
          for e in path:
              a, b, L, kind = edges[e]
              if kind in ('gap', 'join', 'joint'): continue
              pa, pb = coord[a], coord[b]
              # edges are undirected: orient each one along the path before merging
              if parts and math.dist(parts[-1][1], pb) < math.dist(parts[-1][1], pa): pa, pb = pb, pa
              parts.append((pa, pb, e in dashed_edges))
          lenm = sum(math.dist(raw2utm(p), raw2utm(q)) for p, q, _ in parts)
          dashedm = sum(math.dist(raw2utm(p), raw2utm(q)) for p, q, d in parts if d)
          # merge consecutive parts into lines by dashed flag
          lines = []
          for p, q, d in parts:
              if lines and lines[-1][1] == d and math.dist(lines[-1][0][-1], p) < 130:
                    if math.dist(lines[-1][0][-1], p) >= 3: lines[-1][0].append(p)
                    lines[-1][0].append(q)
              else: lines.append(([p, q], d))
          for pts, d in lines:
              ll = [list(map(lambda v: round(v, 6), to_wgs.transform(*raw2utm(p)))) for p in pts]
              out_feats.append(dict(type='Feature', properties=dict(routeId=route['id'], plan=plan, netz=cls, label=text, ausbau='bestand-weg' if d else ('voll' if plan == 'lang' else 'freigabe')),
                                    geometry=dict(type='LineString', coordinates=ll)))
          report.append(f'OK {plan}/{cls}: {text}: {lenm/1000:.2f} km (dashed {dashedm/1000:.2f}) concept {route.get("lengthConceptKm")}')
        tot = sum(e[2] for e in edges if e[3] == 'line'); un = sum(e[2] for i, e in enumerate(edges) if e[3] == 'line' and not used[i])
        report.append(f'== {plan}/{cls}: unassigned {un/tot*100:.0f}% of {tot*A/1000:.1f} km')
        for i, e in enumerate(edges):
            if e[3] == 'line' and not used[i]:
                out_feats.append(dict(type='Feature', properties=dict(unassigned=True, plan=plan, netz=cls), geometry=dict(type='LineString', coordinates=[list(to_wgs.transform(*raw2utm(coord[e[0]]))), list(to_wgs.transform(*raw2utm(coord[e[1]])))])))

json.dump(dict(type='FeatureCollection', features=out_feats), open(OUT, 'w'))
print('\n'.join(report))

# ---------------------------------------------------------------- Bestand, leftovers, OSM snap
from shapely.geometry import MultiLineString
from shapely.ops import linemerge

def utm_line(coords_wgs):
    return [to_utm.transform(*c) for c in coords_wgs]

final = []
# existing asphalt Geh- und Radwege (red in plan 5/1)
strokes = json.load(open(f'{W}/kurz-strokes.json'))
red = [p for _, p in strokes['rgb(100%,0%,0%)|12'] if max(x for x, _ in p) < 8800]
merged = linemerge(MultiLineString([[raw2utm(q) for q in p] for p in red]))
for g in (merged.geoms if hasattr(merged, 'geoms') else [merged]):
    if g.length >= 40: final.append(dict(routeId='bestand', plan='kurz', ausbau='bestand', utm=list(g.coords)))
# leftover unassigned lines: connected pieces >= 150 m
for plan in ('kurz', 'lang'):
    for netz in ('haupt', 'ergaenzend'):
        segs = [utm_line(f['geometry']['coordinates']) for f in out_feats if f['properties'].get('unassigned') and f['properties']['plan'] == plan and f['properties']['netz'] == netz]
        if not segs: continue
        merged = linemerge(MultiLineString(segs))
        for g in (merged.geoms if hasattr(merged, 'geoms') else [merged]):
            if g.length >= 150:
                # "adopt" overrides: a leftover piece through a given point belongs to that route
                rid = next((k.split('|')[1] for k, ov in OVERRIDES.items() if k.startswith(plan + '|')
                            for lon, lat in ov.get('adopt', []) if g.distance(Point(to_utm.transform(lon, lat))) < 30), None)
                final.append(dict(routeId=rid or f'ohne-beschriftung-{netz}', plan=plan, ausbau='voll' if plan == 'lang' else 'freigabe', utm=list(g.coords)))
for f in out_feats:
    p = f['properties']
    if p.get('unassigned'): continue
    final.append(dict(routeId=p['routeId'], plan=p['plan'], ausbau=p['ausbau'], utm=utm_line(f['geometry']['coordinates'])))

# ---------------------------------------------------------------- map matching onto OSM
# The Lagepläne are schematic: a route is drawn beside the road it uses so both stay visible, and
# parallel routes are pushed apart. So each line is matched onto the OSM ways near the drawn line
# (match()); only where no way is within CORR does the plan geometry stay ("kein Weg").
CORR = 90.0     # m; ways farther from the drawn line are not candidates
STEP = 5.0      # m, sampling of the plan line
MIN_RUN = 60    # m; shorter runs of one class join their neighbour (junctions, villages)

BIG = {'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk', 'trunk_link'}
TOWN = {'residential', 'unclassified', 'service_road', 'service_alley', 'service_driveway', 'service_uncategorized',
        'service_emergency_access', 'living_street', 'bicycle_road', 'residential_priority_road', 'pedestrian'}
PAVED = {'asphalt', 'concrete', 'paved', 'paving_stones', 'sett', 'concrete:plates', 'concrete:lanes', 'chipseal', 'metal'}
LOOSE = {'gravel', 'fine_gravel', 'compacted', 'pebblestone'}
NATURAL = {'ground', 'dirt', 'grass', 'earth', 'mud', 'sand', 'unpaved', 'grass_paver', 'wood', 'woodchips'}

def way_class(wi):
    """(weg, belag) of an OSM way; see radwegeStatus.ts WEG / BELAG."""
    _, hw, _, _, t = ways[wi]
    bl = t.get('bikelane')
    ref = (t.get('ref') or '').strip()
    if bl and not bl.startswith('cyclewayOnHighway') and not bl.startswith('bicycleRoad') and bl != 'crossing':
        weg = 'radweg'
    elif re.match(r'^(St|B) \d', ref) or hw in ('primary', 'secondary', 'primary_link', 'secondary_link', 'trunk', 'trunk_link'):
        weg = 'staatsstrasse'
    elif re.match(r'^[A-Z]{1,3} \d', ref) or hw in BIG:
        weg = 'kreisstrasse'
    elif hw in TOWN:
        weg = 'ortsstrasse'
    else:
        weg = 'feldweg'
    sf = t.get('surface')
    if sf in PAVED: belag = 'asphalt'
    elif sf in LOOSE: belag = 'schotter'
    elif sf in NATURAL: belag = 'natur'
    elif weg in ('staatsstrasse', 'kreisstrasse'): belag = 'asphalt'  # classified roads are paved
    else: belag = 'unbekannt'
    return weg, belag

CORR_BUILT = 35.0  # m; built paths exist where drawn, so look closer (no detours via other ways)
NO_BIKES = {i for i, w in enumerate(ways) if w[1] in ('motorway', 'motorway_link', 'trunk', 'trunk_link')}
SIGMA = 25.0    # m; emission cost (d / SIGMA)^2
ANGLE = 4.0     # extra emission cost of a way running across the drawn line
NONE_COST = (70 / SIGMA) ** 2  # "no way" beats a way farther than ~70 m (with the angle term, less)

def match(utm, built=False, onto=None):
    """Pieces [(weg, belag, coords, fromPlan, osm way ids)] of one plan line: a hidden Markov
    model over the OSM ways near each sample point (Viterbi). Staying on a way is free, switching
    costs a little plus the square of the jump between the two projections, so the match follows
    connected ways and does not zigzag between parallel ones; "no way" wins beyond CORR."""
    line = LineString(utm)
    n = max(2, int(line.length / STEP) + 1)
    pts = [line.interpolate(line.length * k / (n - 1)) for k in range(n)]
    cands = []  # per point: list of (way index or -1, projected (x, y), emission cost)
    for k, q in enumerate(pts):
        a, b = pts[max(0, k - 2)], pts[min(n - 1, k + 2)]
        dx, dy = b.x - a.x, b.y - a.y; dn = math.hypot(dx, dy) or 1.0
        ws = {int(wid[j]) for j in wtree.query_ball_point((q.x, q.y), 200 if onto else CORR_BUILT if built else CORR)} - NO_BIKES
        # an existing bike path does not run on the carriageway of a Staats-/Kreisstraße: where OSM
        # lacks the path beside the road, keep the plan geometry instead
        if built: ws = {w for w in ws if way_class(w)[0] not in ('kreisstrasse', 'staatsstrasse')}
        # a route meant to run directly along one road ("onto": its ref) is matched onto that road only
        if onto: ws = {w for w in ws if (ways[w][4].get('ref') or '').strip() == onto}
        c = [(-1, (q.x, q.y), (200 / SIGMA) ** 2 if onto else NONE_COST, 0.0)]
        for wi in ws:
            ls = ways[wi][3]; t = ls.project(q); pr = ls.interpolate(t); d = pr.distance(q)
            if d > (200 if onto else CORR): continue
            p0, p1 = ls.interpolate(max(0.0, t - 3)), ls.interpolate(min(ls.length, t + 3))
            wx, wy = p1.x - p0.x, p1.y - p0.y; wn = math.hypot(wx, wy) or 1.0
            sin2 = 1 - ((dx * wx + dy * wy) / (dn * wn)) ** 2  # 0 parallel, 1 across the line
            em = (d / SIGMA) ** 2 + ANGLE * sin2
            # a separate bike path beats the carriageway beside it
            c.append((wi, (pr.x, pr.y), em * (0.8 if way_class(wi)[0] == 'radweg' else 1.0), sin2))
        cands.append(c)
    cost = [c[2] for c in cands[0]]; back = []
    for k in range(1, n):
        prev, cur = cands[k - 1], cands[k]
        nc, nb = [], []
        for wi, xy, em, _ in cur:
            best, arg = math.inf, 0
            for j, (pw, pxy, *_) in enumerate(prev):
                if pw == wi: tr = 0.0
                elif pw == -1 or wi == -1: tr = 8.0
                else: tr = 3.0 + (max(0.0, math.dist(pxy, xy) - STEP) / 4) ** 2
                v = cost[j] + tr
                if v < best: best, arg = v, j
            nc.append(best + em); nb.append(arg)
        cost = nc; back.append(nb)
    j = int(np.argmin(cost)); path = [j]
    for k in range(n - 2, -1, -1):
        j = back[k][j]; path.append(j)
    path.reverse()
    state = [cands[k][j][0] for k, j in enumerate(path)]
    across = [cands[k][j][3] for k, j in enumerate(path)]
    # stays shorter than MIN_STAY on one way (or off all ways) go to the way before them
    MIN_STAY = 50
    changed = True
    while changed:
        changed = False
        runs, k = [], 0
        while k < n:
            j = k
            while j < n and state[j] == state[k]: j += 1
            runs.append((k, j)); k = j
        for r, (k0, k1) in enumerate(runs):
            rl = (k1 - k0) * line.length / (n - 1)
            # short stays, and short detours onto ways running across the drawn line (side streets)
            if len(runs) > 1 and (rl < MIN_STAY or (rl < 150 and state[k0] >= 0 and sum(across[k0:k1]) / (k1 - k0) > 0.5)):
                nb = runs[r - 1] if r > 0 else runs[r + 1]
                for k in range(k0, k1): state[k] = state[nb[0]]
                changed = True; break
    seq = []  # (x, y, weg, belag, way id or None)
    prev = None  # (way index, position along it) of the last sample on a way
    for k, wi in enumerate(state):
        q = pts[k]
        if wi >= 0:
            ls = ways[wi][3]; t = ls.project(q); pr = ls.interpolate(t)
            xy = (pr.x, pr.y) if pr.distance(q) <= CORR * 1.5 else None
            if xy is None: wi = -1
        if wi < 0: xy = (q.x, q.y)
        if wi < 0: seq.append((xy[0], xy[1], 'kein', 'kein', None)); prev = None
        else:
            weg, belag = way_class(wi)
            # two samples on the same way: follow the way between them, so a bend of the way away
            # from the drawing (e.g. round a field corner) is not cut off by a straight chord
            if prev and prev[0] == wi and seq:
                along = abs(t - prev[1]); chord = math.dist(seq[-1][:2], xy)
                if chord + 2 < along <= max(3 * chord, chord + 80):
                    for v in substring(ls, prev[1], t).coords[1:-1]:
                        seq.append((v[0], v[1], weg, belag, ways[wi][0]))
            seq.append((xy[0], xy[1], weg, belag, ways[wi][0])); prev = (wi, t)
    # smooth classes along the line: runs shorter than MIN_RUN join their neighbour
    cls = [(w, b) for _, _, w, b, _ in seq]
    dist = [0.0]
    for a, b in zip(seq, seq[1:]): dist.append(dist[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    while True:
        runs = []
        for k, c in enumerate(cls):
            if runs and runs[-1][0] == c: runs[-1][2] = k + 1
            else: runs.append([c, k, k + 1])
        rl = lambda r: dist[min(r[2], len(dist) - 1)] - dist[r[1]]
        short = [r for r in runs if rl(r) < MIN_RUN]
        if len(runs) == 1 or not short: break
        r = min(short, key=rl); j = runs.index(r)
        nb = runs[j - 1] if j > 0 else runs[j + 1]
        for k in range(r[1], r[2]): cls[k] = nb[0]
    pieces, k0 = [], 0
    for k in range(1, len(seq) + 1):
        if k == len(seq) or cls[k] != cls[k0]:
            part = seq[k0:min(k + 1, len(seq))]
            g = LineString([(x, y) for x, y, *_ in part]) if len(part) > 1 else None
            if g is not None and g.length > 0.5:
                plan_share = sum(1 for p in part if p[4] is None) / len(part)
                ids = collections.Counter(p[4] for p in part if p[4] is not None)
                pieces.append((cls[k0][0], cls[k0][1], list(g.simplify(0.5).coords), plan_share, sorted(i for i, v in ids.items() if v >= 2)))
            k0 = k
    return pieces

# "redraw" overrides: where a source says the route runs elsewhere than the schematic drawing
# (e.g. along a street the plan only hints at), the drawn line is cut at `from` and continues along
# `via`; the matching then follows that. planlage.geojson below still shows the drawing.
# "line" overrides: a route the plan shows only as context (the Landkreis network in 5/2) gets
# the course of that drawing, given as lon/lat points; it is matched like any other line.
for key, ov in OVERRIDES.items():
    if 'line' not in ov: continue
    pl, rid = key.split('|')
    final.append(dict(routeId=rid, plan=pl, ausbau='voll' if pl == 'lang' else 'freigabe',
                      utm=[to_utm.transform(*q) for q in ov['line']['coords']], onto=ov['line'].get('onto'),
                      not_drawn=True))

# "replace" overrides: a built route whose real course is known (e.g. an OSM route relation) takes
# that course instead of the drawing, also beyond the Gemeinde; its other drawn pieces are dropped.
for key, ov in OVERRIDES.items():
    if 'replace' not in ov: continue
    pl, rid = key.split('|')
    items = [f for f in final if f['routeId'] == rid and f['plan'] == pl]
    if not items: continue
    keep = max(items, key=lambda f: LineString(f['utm']).length)
    keep['utm_matched'] = [to_utm.transform(*q) for q in ov['replace']['coords']]
    for f in items:
        if f is not keep: f['skip_match'] = True

redrawn = []
for key, ov in OVERRIDES.items():
    if 'redraw' not in ov: continue
    pl, rid = key.split('|')
    cut = to_utm.transform(*ov['redraw']['from'])
    items = [f for f in final if f['routeId'] == rid and f['plan'] == pl]
    if not items: continue
    f = min(items, key=lambda f: LineString(f['utm']).distance(Point(cut)))
    i = min(range(len(f['utm'])), key=lambda k: math.dist(f['utm'][k], cut))
    redrawn.append((f, f['utm']))
    f['utm_matched'] = f['utm'][:i + 1] + [to_utm.transform(*q) for q in ov['redraw']['via']]

# A new path drawn at a steady offset beside a Kreis-/Staatsstraße means "a path on this side of
# that road" (the plans are schematic). Where no existing path follows the drawing more closely,
# the drawing is moved onto the road before matching, so the match follows the road instead of
# side tracks; the side is kept from the drawing (road_side below).
BESIDE_MIN, BESIDE_MAX, BESIDE_RUN, BESIDE_GAP = 8, 60, 150, 12


def nearest_on_ref(q, ref):
    best = None
    for wi in {int(wid[j]) for j in wtree.query_ball_point((q.x, q.y), BESIDE_MAX + 30)}:
        if ways[wi][4].get('ref') != ref or way_class(wi)[0] not in ('kreisstrasse', 'staatsstrasse'): continue
        pr = ways[wi][3].interpolate(ways[wi][3].project(q))
        if best is None or pr.distance(q) < best.distance(q): best = pr
    return best or q


def beside_road(utm):
    line = LineString(utm)
    n = max(2, int(line.length // 10) + 1)
    pts = [line.interpolate(line.length * k / (n - 1)) for k in range(n)]
    hit = []
    for k, q in enumerate(pts):
        a, b = pts[max(0, k - 2)], pts[min(n - 1, k + 2)]
        dx, dy = b.x - a.x, b.y - a.y; dn = math.hypot(dx, dy) or 1.0
        best, other = None, math.inf
        for wi in {int(wid[j]) for j in wtree.query_ball_point((q.x, q.y), BESIDE_MAX + 5)}:
            ls = ways[wi][3]; t = ls.project(q); pr = ls.interpolate(t); d = pr.distance(q)
            p0, p1 = ls.interpolate(max(0.0, t - 5)), ls.interpolate(min(ls.length, t + 5))
            wx, wy = p1.x - p0.x, p1.y - p0.y; wn = math.hypot(wx, wy) or 1.0
            if abs((dx * wx + dy * wy) / (dn * wn)) < 0.9: continue  # not alongside
            if way_class(wi)[0] in ('kreisstrasse', 'staatsstrasse'):
                if BESIDE_MIN <= d <= BESIDE_MAX and (best is None or d < best[0]): best = (d, pr, ways[wi][4].get('ref'))
            else:
                other = min(other, d)
        # an existing path right on the drawing is what the plan means
        hit.append(best if best and other > min(8, best[0]) else None)
    # bridge short gaps (a crossing, a field path touching the drawing) within one road's run
    for k in range(1, n):
        if hit[k] is None and hit[k - 1] is not None:
            j = k
            while j < n and hit[j] is None and j - k < BESIDE_GAP: j += 1
            if j < n and hit[j] is not None and hit[j][2] == hit[k - 1][2]:
                for i in range(k, j):
                    ls_ref = hit[k - 1]
                    hit[i] = (ls_ref[0], nearest_on_ref(pts[i], ls_ref[2]), ls_ref[2])
    out, k, moved = [], 0, 0
    while k < n:
        if hit[k] is None: out.append((pts[k].x, pts[k].y)); k += 1; continue
        j = k
        while j < n and hit[j] is not None and hit[j][2] == hit[k][2]: j += 1
        if (j - k) * 10 >= BESIDE_RUN:
            out += [(hit[i][1].x, hit[i][1].y) for i in range(k, j)]; moved += (j - k) * 10
        else:
            out += [(pts[i].x, pts[i].y) for i in range(k, j)]
        k = j
    return out, moved


def onto_ref(utm, ref, max_d):
    """Override "beside": every point of the drawing within max_d of the road `ref` moves onto it."""
    road = [ways[wi][3] for wi in range(len(ways)) if (ways[wi][4].get('ref') or '') == ref]
    line = LineString(utm); n = max(2, int(line.length // 10) + 1); out = []
    for k in range(n):
        q = line.interpolate(line.length * k / (n - 1))
        best = min(road, key=lambda g: g.distance(q)) if road else None
        out.append((best.interpolate(best.project(q)).coords[0]) if best is not None and best.distance(q) <= max_d else (q.x, q.y))
    return out


# "befund" overrides on the Bestand lines ("kurz|bestand"): what a check on site found where the
# plan draws an existing path. With `from`/`to` the stretch between them leaves the Bestand and
# becomes route `route` (ausbau `ausbau`, laid onto the road `onto` within `max` m, e.g. a
# Gehweg without a Radweg sign beside that road); `at` alone only attaches the `hinweis`.
for bf in OVERRIDES.get('kurz|bestand', {}).get('befund', []):
    if 'from' not in bf: continue
    a, b = to_utm.transform(*bf['from']), to_utm.transform(*bf['to'])
    items = [f for f in final if f['routeId'] == 'bestand']
    f = min(items, key=lambda f: LineString(f['utm']).distance(Point(a)))
    line = LineString(f['utm'])
    ta, tb = sorted((line.project(Point(a)), line.project(Point(b))))
    final.remove(f)
    for lo, hi, mid in ((0, ta, False), (ta, tb, True), (tb, line.length, False)):
        if hi - lo < 20: continue
        utm = list(substring(line, lo, hi).coords)
        if not mid:
            final.append(dict(f, utm=utm)); continue
        final.append(dict(routeId=bf['route'], plan='kurz', ausbau=bf['ausbau'], utm=utm,
                          utm_matched=onto_ref(utm, bf['onto'], bf['max']) if bf.get('onto') else utm,
                          force_ausbau=bf['ausbau'], hinweis=bf.get('hinweis')))

built_set = {r['id'] for r in ROUTES if r.get('built')}
moved = 0
for f in final:
    if 'utm_matched' in f or f.get('not_drawn') or f['routeId'] in built_set: continue
    ov = OVERRIDES.get(f"{f['plan']}|{f['routeId']}", {}).get('beside')
    if ov:
        f['utm_beside'] = onto_ref(f['utm'], ov['ref'], ov['max']); continue
    if f['ausbau'] not in ('voll', 'freigabe'): continue
    new, m = beside_road(f['utm'])
    if m: f['utm_beside'] = new; moved += m
print('drawing moved onto the road beside it:', round(moved / 1000, 1), 'km')

# the plan geometry as drawn (georeferenced, not matched), for the page's "Lage wie im Plan" layer
NETZ_OF = {r['id']: r['plans'] for r in ROUTES}
plan_geo = []
for f in final:
    if f.get('not_drawn'): continue  # not a route stroke of the plan
    netz = 'bestand' if f['ausbau'] == 'bestand' else NETZ_OF.get(f['routeId'], {}).get(f['plan']) or f['routeId'].split('-')[-1]
    g = LineString(f['utm']).simplify(1.0)  # always the drawing, also where redrawn
    plan_geo.append(dict(type='Feature', properties=dict(plan=f['plan'], netz=netz, dashed=f['ausbau'] == 'bestand-weg'),
                         geometry=dict(type='LineString', coordinates=[[round(v, 6) for v in to_wgs.transform(*c)] for c in g.coords])))
json.dump(dict(type='FeatureCollection', features=plan_geo), open(sys.argv[5].replace('lines.geojson', 'planlage.geojson'), 'w'), separators=(',', ':'))

def drop_spurs(coords):
    """Removes stretches where the line runs out and back along itself (a match that overshoots a
    junction and returns). Invisible as a plain line, but with the road-side offset its two halves
    would be drawn on both sides of the road. Returns (coords, metres removed)."""
    g = LineString(coords)
    if g.length < 20: return coords, 0.0
    n = int(g.length // 2) + 1
    pts = [g.interpolate(g.length * k / (n - 1)) for k in range(n)]
    xy = [(q.x, q.y) for q in pts]
    removed, i = 0.0, 0
    while i < len(xy) - 5:
        cut = None
        for j in range(len(xy) - 1, i + 4, -1):  # farthest return first
            if math.dist(xy[i], xy[j]) < 3:
                loop = xy[i:j + 1]
                if len(loop) >= 4 and Polygon(loop).buffer(0).area / (2 * (j - i)) < 1.5:
                    cut = j
                    break
        if cut is not None:
            if cut >= len(xy) - 15:  # within 30 m of the end
                # out and back at the end: the outward leg reaches the end, the way back is the error
                k = max(range(i, cut + 1), key=lambda m: math.dist(xy[i], xy[m]))
                removed += 2 * (cut - k); xy = xy[:k + 1]
            elif i <= 15:  # within 30 m of the start
                # the same at the start: begin at the turning point
                k = max(range(i, cut + 1), key=lambda m: math.dist(xy[cut], xy[m]))
                removed += 2 * k; xy = xy[k:]; i = 0; continue
            else:
                removed += 2 * (cut - i); xy = xy[:i + 1] + xy[cut + 1:]
        else:
            i += 1
    if removed == 0: return coords, 0.0
    return list(LineString(xy).simplify(0.5).coords), removed


def road_side(coords, drawing):
    """Which side of the matched road the plan draws a new path on: ('links'|'rechts' along the
    line, compass word) when the drawing keeps one side at 5-80 m over 70 % of the length, else
    None. The plans draw a path beside its road on the side where it is to be built."""
    g = LineString(coords)
    if g.length < 60: return None
    n = int(g.length // 10) + 1; votes = []; nx = ny = 0.0
    for k in range(n):
        s = min(g.length, k * 10)
        p, a, b = g.interpolate(s), g.interpolate(max(0.0, s - 5)), g.interpolate(min(g.length, s + 5))
        d = drawing.interpolate(drawing.project(p))
        vx, vy = d.x - p.x, d.y - p.y; dist = math.hypot(vx, vy)
        if not 5 <= dist <= 80: continue
        cross = (b.x - a.x) * vy - (b.y - a.y) * vx
        votes.append(1 if cross > 0 else -1); nx += vx / dist; ny += vy / dist
    if len(votes) < 0.7 * n: return None
    left = votes.count(1) / len(votes)
    if 0.15 < left < 0.85: return None
    ang = math.degrees(math.atan2(nx, ny)) % 360  # 0 = north
    word = ['nördlich', 'östlich', 'südlich', 'westlich'][int(((ang + 45) % 360) // 90)]
    return ('links' if left >= 0.85 else 'rechts', word)


def side_split(coords, drawing):
    """Where a long piece has the drawing on one side of the road for one stretch and on the other
    side for the next (e.g. the St 2045 at Sünzhausen), the distance along it to cut at, else None.
    Both stretches must be >= 150 m and get a side from road_side on their own."""
    g = LineString(coords)
    if g.length < 300: return None
    best = None
    for k in range(15, int(g.length // 10) - 14):
        s = k * 10.0
        a, b = road_side(list(substring(g, 0, s).coords), drawing), road_side(list(substring(g, s, g.length).coords), drawing)
        if a and b and a[0] != b[0]:
            # the cut nearest the middle of the switch: keep the first and last valid cut
            best = (best[0], s) if best else (s, s)
    return None if best is None else (best[0] + best[1]) / 2


spurs = []
geo = []
built_ids = {r['id'] for r in ROUTES if r.get('built')}
for f in final:
    if f.get('skip_match'): continue
    for weg, belag, coords, fromPlan, wids in match(f.get('utm_matched', f.get('utm_beside', f['utm'])), built=f['routeId'] in built_ids or f['ausbau'] == 'bestand', onto=f.get('onto')):
        ausbau = f.get('force_ausbau') or f['ausbau']
        # plan 5/1 means releasing an existing way: nothing to release without one, or on the
        # carriageway of a Staats-/Kreisstraße
        if ausbau == 'freigabe' and not f.get('force_ausbau') and f['routeId'] not in built_ids and weg in ('kein', 'kreisstrasse', 'staatsstrasse'):
            ausbau = 'kein-weg'
        coords, spur = drop_spurs(coords)
        if spur: spurs.append((f['routeId'], f['plan'], round(spur), to_wgs.transform(*coords[0])))
        if len(coords) < 2: continue
        ll = [[round(v, 6) for v in to_wgs.transform(*c)] for c in coords]
        props = dict(routeId=f['routeId'], plan=f['plan'], ausbau=ausbau, weg=weg, belag=belag, fromPlan=round(fromPlan, 2))
        if wids: props['osmWays'] = wids
        if f.get('hinweis'): props['hinweis'] = f['hinweis']
        # a new path beside a road: keep the side the plan draws it on (not for redrawn lines)
        parts = [(coords, ll)]
        if ausbau in ('voll', 'kein-weg') and weg in ('staatsstrasse', 'kreisstrasse', 'ortsstrasse') \
                and 'utm_matched' not in f and not f.get('not_drawn'):
            drawing = LineString(f['utm'])
            # the drawing switches sides along the piece: one feature per side
            def split_sides(c):
                cut = side_split(c, drawing)
                if cut is None: return [c]
                g = LineString(c)
                return split_sides(list(substring(g, 0, cut).coords)) + split_sides(list(substring(g, cut, g.length).coords))
            cs = split_sides(coords)
            if len(cs) > 1: parts = [(c, [[round(v, 6) for v in to_wgs.transform(*q)] for q in c]) for c in cs]
            strasse = next((ways[wi][4].get('ref') or ways[wi][2] for wi in WAY_INDEX_OF(wids) if ways[wi][4].get('ref') or ways[wi][2]), None) if wids else None
            for c, l in parts:
                pp = dict(props)
                rs = road_side(c, drawing)
                if rs: pp['seite'], pp['richtung'] = rs
                if rs and strasse: pp['strasse'] = strasse
                geo.append(dict(type='Feature', properties=pp, geometry=dict(type='LineString', coordinates=l)))
            continue
        geo.append(dict(type='Feature', properties=props, geometry=dict(type='LineString', coordinates=ll)))
for bf in OVERRIDES.get('kurz|bestand', {}).get('befund', []):
    if 'at' not in bf: continue
    q = Point(to_utm.transform(*bf['at']))
    for g in geo:
        if g['properties']['routeId'] == 'bestand' and LineString([to_utm.transform(*c) for c in g['geometry']['coordinates']]).distance(q) < 25:
            g['properties']['hinweis'] = bf['hinweis']
# a note on any route: overrides "<plan>|<route>": {"hinweis": [{"at": [lon, lat], "text": …}]}
# goes onto that route's pieces within 30 m of `at` (shown in the map popup)
for key, ov in OVERRIDES.items():
    for h in ov.get('hinweis', []) if isinstance(ov, dict) else []:
        plan, rid = key.split('|', 1)
        q = Point(to_utm.transform(*h['at']))
        for g in geo:
            pr = g['properties']
            if pr['routeId'] == rid and pr['plan'] == plan and LineString([to_utm.transform(*c) for c in g['geometry']['coordinates']]).distance(q) < 30:
                pr['hinweis'] = h['text']
json.dump(dict(type='FeatureCollection', features=geo), open(sys.argv[5], 'w'), separators=(',', ':'))
km = collections.Counter(); kw = collections.Counter(); kb = collections.Counter()
for g in geo:
    L = LineString([to_utm.transform(*c) for c in g['geometry']['coordinates']]).length / 1000
    p = g['properties']; km[(p['plan'], p['ausbau'])] += L; kw[p['weg']] += L; kb[p['belag']] += L
print('out-and-back stretches removed:', len(spurs), 'pieces,', round(sum(x[2] for x in spurs)), 'm')
for x in sorted(spurs, key=lambda x: -x[2])[:30]: print('  spur', *x)
print('km by plan/ausbau', {k: round(v, 1) for k, v in sorted(km.items())})
print('km by weg', {k: round(v, 1) for k, v in kw.most_common()})
print('km by belag', {k: round(v, 1) for k, v in kb.most_common()})
print('lines', len(geo), 'mean fromPlan', round(sum(g['properties']['fromPlan'] for g in geo) / len(geo), 2))
