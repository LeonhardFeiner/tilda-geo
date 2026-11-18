"""Assign the plan line strokes to the routes of routes.json and write lines.geojson.

Usage: assign.py <work> <osm-area.json> <routes.json> <debug.geojson> <lines.geojson> <overrides.json>

Each route label of a plan (text layer, coloured blue/cyan) names its stops; the route is the
cheapest path through that plan colour's line graph between them. overrides.json gives explicit
stops (place name, [x, y] in PDF points from top-left, or "open" = open line end near the label)
where names alone are ambiguous. Leftover plan lines >= 150 m become ohne-beschriftung-*;
the red Bestand lines of plan 5/1 become route "bestand". Lines are snapped onto OSM ways
within 15 m; fromPlan is the share that stays plan geometry.
"""
import json, math, re, sys, html, heapq, collections
import numpy as np
from scipy.spatial import cKDTree
from pyproj import Transformer
from shapely.geometry import LineString, Point
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
    ways.append((w['id'], hw, w['tags'].get('name'), LineString([to_utm.transform(x, y) for x, y in w['coords']]), 'bikelane' in w['tags']))
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

SNAP = 15.0
# Plan 5/1 means "release existing ways". Where its line follows no way, or only the carriageway of
# a Staats- or Kreisstraße (no bike lane, no parallel track within SNAP), there is nothing to release.
BIG_ROADS = {'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link'}
MIN_RUN = 80  # m; shorter runs of one class join their neighbour (junctions, villages)

def point_class(q, w):
    if w < 0: return 'kein-weg'
    if ways[w][4] or ways[w][1] not in BIG_ROADS: return 'freigabe'
    d, i = wtree.query((q.x, q.y), k=12, distance_upper_bound=SNAP)
    for dd, j in zip(np.atleast_1d(d), np.atleast_1d(i)):
        if np.isfinite(dd):
            o = ways[int(wid[j])]
            if o[4] or o[1] not in BIG_ROADS: return 'freigabe'
    return 'kein-weg'  # only the carriageway of a Staats- or Kreisstraße

def snap(utm, classify=False):
    ls = LineString(utm)
    n = max(2, int(ls.length / 4) + 1)
    pts = [ls.interpolate(ls.length * k / (n - 1)) for k in range(n)]
    d, i = wtree.query([(q.x, q.y) for q in pts])
    wi = [int(wid[j]) if dd < SNAP else -1 for dd, j in zip(d, i)]
    # majority way in a window of 7 points, so parallel ways don't make it zigzag
    sm = []
    for k in range(n):
        win = [w for w in wi[max(0, k - 3):k + 4] if w >= 0]
        sm.append(collections.Counter(win).most_common(1)[0][0] if win and wi[k] >= 0 else -1)
    out, hit = [], []
    for q, w in zip(pts, sm):
        if w >= 0:
            wl = ways[w][3]; pr = wl.interpolate(wl.project(q))
            if pr.distance(q) < SNAP * 1.5:
                out.append((pr.x, pr.y)); hit.append(w); continue
        out.append((q.x, q.y)); hit.append(-1)
    cls = [point_class(q, w) if classify else None for q, w in zip(pts, hit)]
    if classify:
        step = ls.length / (n - 1)
        while True:
            runs = []
            for k, c in enumerate(cls):
                if runs and runs[-1][0] == c: runs[-1][2] = k + 1
                else: runs.append([c, k, k + 1])
            short = [r for r in runs if (r[2] - r[1]) * step < MIN_RUN]
            if len(runs) == 1 or not short: break
            r = min(short, key=lambda r: r[2] - r[1]); j = runs.index(r)
            nb = runs[j - 1] if j > 0 else runs[j + 1]
            for k in range(r[1], r[2]): cls[k] = nb[0]
    pieces, k0 = [], 0
    for k in range(1, n + 1):
        if k == n or cls[k] != cls[k0]:
            seg = slice(k0, min(k + 1, n))  # share the boundary point with the next piece
            hs = hit[k0:k]; ids = collections.Counter(ways[w][0] for w in hs if w >= 0)
            g = LineString(out[seg]) if len(out[seg]) > 1 else None
            if g is not None and g.length > 0:
                pieces.append((cls[k0], list(g.simplify(0.8).coords), 1 - sum(1 for w in hs if w >= 0) / len(hs), sorted(i for i, v in ids.items() if v >= 3)))
            k0 = k
    return pieces

geo = []
for f in final:
    built = next((r.get('built') for r in ROUTES if r['id'] == f['routeId']), False)
    split = f['plan'] == 'kurz' and f['ausbau'] == 'freigabe' and not built
    for cls, coords, fromPlan, wids in snap(f['utm'], classify=split):
        ll = [[round(v, 6) for v in to_wgs.transform(*c)] for c in coords]
        props = dict(routeId=f['routeId'], plan=f['plan'], ausbau=cls if split else f['ausbau'], fromPlan=round(fromPlan, 2))
        if wids: props['osmWays'] = wids
        geo.append(dict(type='Feature', properties=props, geometry=dict(type='LineString', coordinates=ll)))
json.dump(dict(type='FeatureCollection', features=geo), open(sys.argv[5], 'w'), separators=(',', ':'))
km = collections.Counter()
for g in geo: km[(g['properties']['plan'], g['properties']['ausbau'])] += LineString([to_utm.transform(*c) for c in g['geometry']['coordinates']]).length / 1000
print('km by plan/ausbau', {k: round(v, 1) for k, v in sorted(km.items())})
print('lines', len(geo), 'mean fromPlan', round(sum(g['properties']['fromPlan'] for g in geo) / len(geo), 2))
