#!/usr/bin/env python3
"""
Nearest station by bike, along the real path network, for every 100 m square of Germany.

The straight-line page (stationAreasPage.ts) splits Germany into Voronoi cells. This does the
same along the OSM network: one multi-source Dijkstra from all stations at once (scipy's
`min_only=True` labels every junction with its nearest station and the travel time to it), then
every square of a 100 m grid (aligned with the Zensus 2022 grid, EPSG:3035) is snapped to the
nearest point of a usable way and inherits that way's label.

Inputs
  cache/germany-latest.osm.pbf     copied from the processing Docker volume (see README.md)
  ../output/stations.json          bun run bike-share-map:stations
  cache/Zensus2022_...csv          downloaded on first run (population per 100 m square)

Outputs
  ../output/station-bike-areas.json     GeoJSON: where each station is the nearest by bike
                                        (committed; the unlisted naechste-station page shows it)
  ../output/station-bike-bands.json     GeoJSON: minutes by bike to the nearest station, in bands
  cache/bike-network.npz                parsed network, reused on later runs (delete to re-parse)
  cache/bike-grid.npz                   routed squares, reused for the polygon/output steps
                                        (delete to re-route)
  cache/bike-cells.csv.gz               populated squares: x, y (3035 centre), Einwohner, seconds,
                                        metres, station — read by fetchStationAccess.ts

Profile (bike, flat — no elevation yet): speeds per way type below; footways/pedestrian areas
without bicycle permission and riding against a one-way count as pushing (5 km/h); motorways,
motorroads, bicycle=no and private ways are not usable.
"""

from __future__ import annotations

import gzip
import io
import json
import math
import sys
import time
import urllib.request
import zipfile
from array import array
from pathlib import Path

import numpy as np
import osmium
import rasterio.features
import shapely
from pyproj import Transformer
from rasterio.transform import from_origin
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree
from shapely.geometry import mapping, shape

HERE = Path(__file__).resolve().parent
CACHE = HERE / 'cache'
PBF = CACHE / 'germany-latest.osm.pbf'
NETWORK = CACHE / 'bike-network.npz'
GRID = CACHE / 'bike-grid.npz'
OUTPUT = HERE.parent / 'output'
STATIONS = OUTPUT / 'stations.json'
ZENSUS_URL = 'https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip'
ZENSUS_CSV = 'Zensus2022_Bevoelkerungszahl_100m-Gitter.csv'

CELL = 100  # metres, EPSG:3035 — same grid as the Zensus population squares
PUSH_KMH = 5.0
OFF_NETWORK_KMH = 10.0  # from the square's centre to the nearest way, and station to its way
MIN_COMPONENT_NODES = 200  # smaller disconnected bits (car parks, isolated paths) aren't snapped to
BAND_MINUTES = [5, 10, 15, 20, 30, 45, 60]
# The squares give every border a 100 m staircase; simplifying the whole coverage at once (shared
# borders move together, no gaps) with a tolerance above the cell size smooths it away.
AREA_SIMPLIFY_M = 150
BAND_SIMPLIFY_M = 300
AREA_MIN_CELLS = 20  # 0.2 km² — smaller specks join their surroundings
BAND_CELL_FACTOR = 2  # bands use 200 m squares (2×2 mean): smoother, half the border detail
BAND_MIN_CELLS = 25  # 1 km² of 200 m squares

ROAD_KMH = {
    'cycleway': 18,
    'primary': 18, 'primary_link': 18,
    'secondary': 18, 'secondary_link': 18,
    'tertiary': 18, 'tertiary_link': 18,
    'trunk': 18, 'trunk_link': 18,
    'unclassified': 18, 'residential': 18, 'road': 15,
    'living_street': 12, 'service': 15,
    'track': 12, 'path': 12,
    # Only ridden with explicit permission, otherwise pushed.
    'footway': 0, 'pedestrian': 0, 'bridleway': 0,
    'steps': 0,
}
TRACKTYPE_KMH = {'grade1': 16, 'grade2': 14, 'grade3': 12, 'grade4': 9, 'grade5': 8}
SURFACE_FACTOR = {
    'compacted': 0.9, 'fine_gravel': 0.85, 'gravel': 0.75, 'pebblestone': 0.7,
    'unpaved': 0.75, 'ground': 0.65, 'dirt': 0.65, 'earth': 0.65, 'grass': 0.55,
    'sand': 0.5, 'mud': 0.5, 'woodchips': 0.6,
    'sett': 0.8, 'cobblestone': 0.7, 'unhewn_cobblestone': 0.6, 'grass_paver': 0.7,
}
BIKE_OK = {'yes', 'designated', 'permissive', 'destination', 'use_sidepath'}
NO_ACCESS = {'no', 'private'}


def log(msg: str) -> None:
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


def way_speeds(tags) -> tuple[float, float] | None:
    """(forward, backward) km/h, or None when bikes can't use the way at all."""
    hw = tags.get('highway')
    if hw not in ROAD_KMH:
        return None
    bicycle = tags.get('bicycle')
    if bicycle in NO_ACCESS:
        return None
    if tags.get('motorroad') == 'yes':
        return None
    if tags.get('access') in NO_ACCESS and bicycle not in BIKE_OK:
        return None
    if tags.get('area') == 'yes' and hw != 'pedestrian':
        return None

    if hw == 'steps':
        kmh = 2.0
    elif ROAD_KMH[hw] == 0:
        kmh = 14.0 if bicycle in BIKE_OK else PUSH_KMH
    elif bicycle == 'dismount':
        kmh = PUSH_KMH
    else:
        kmh = float(TRACKTYPE_KMH.get(tags.get('tracktype'), ROAD_KMH[hw])) if hw == 'track' else float(ROAD_KMH[hw])
        kmh *= SURFACE_FACTOR.get(tags.get('surface'), 1.0)

    oneway = tags.get('oneway')
    if tags.get('junction') == 'roundabout' and oneway is None:
        oneway = 'yes'
    exempt = (
        tags.get('oneway:bicycle') == 'no'
        or tags.get('cycleway', '').startswith('opposite')
        or hw in ('cycleway', 'footway', 'path', 'track', 'steps')
    )
    if oneway in ('yes', 'true', '1') and not exempt:
        return kmh, min(kmh, PUSH_KMH)
    if oneway == '-1' and not exempt:
        return min(kmh, PUSH_KMH), kmh
    return kmh, kmh


# --------------------------------------------------------------------------- parse


def parse_network() -> dict[str, np.ndarray]:
    """Every usable way as a run of points; edges are split at shared nodes later."""
    node_ids = array('q')
    lons = array('d')
    lats = array('d')
    way_start = array('q')
    fwd = array('f')
    bwd = array('f')
    processor = (
        osmium.FileProcessor(str(PBF))
        .with_locations('flex_mem')
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter('highway'))
    )
    count = 0
    for way in processor:
        speeds = way_speeds(way.tags)
        if speeds is None:
            continue
        pts = [(n.ref, n.lon, n.lat) for n in way.nodes if n.location.valid()]
        if len(pts) < 2:
            continue
        way_start.append(len(node_ids))
        fwd.append(speeds[0])
        bwd.append(speeds[1])
        for ref, lon, lat in pts:
            node_ids.append(ref)
            lons.append(lon)
            lats.append(lat)
        count += 1
        if count % 2_000_000 == 0:
            log(f'  {count:,} ways, {len(node_ids):,} points')
    log(f'parsed {count:,} usable ways, {len(node_ids):,} points')
    return {
        'node_ids': np.frombuffer(node_ids, dtype=np.int64),
        'lon': np.frombuffer(lons, dtype=np.float64),
        'lat': np.frombuffer(lats, dtype=np.float64),
        'way_start': np.frombuffer(way_start, dtype=np.int64),
        'fwd_kmh': np.frombuffer(fwd, dtype=np.float32),
        'bwd_kmh': np.frombuffer(bwd, dtype=np.float32),
    }


def load_network() -> dict[str, np.ndarray]:
    if NETWORK.exists():
        log(f'reusing {NETWORK.name}')
        with np.load(NETWORK) as z:
            return {k: z[k] for k in z.files}
    log(f'parsing {PBF.name} (takes a while)')
    net = parse_network()
    np.savez(NETWORK, **net)
    return net


# --------------------------------------------------------------------------- graph


def build_graph(net: dict[str, np.ndarray]):
    """
    Junction graph: graph nodes are way ends and nodes shared by several ways; each edge is the
    run of points between two of them. Returns the graph plus, for every point, which edge it
    lies on and how far along it is — so squares can snap to the middle of a long rural road.
    """
    to_3035 = Transformer.from_crs(4326, 3035, always_xy=True)
    x, y = to_3035.transform(net['lon'], net['lat'])
    n_pts = len(x)
    way_start = net['way_start']
    way_of_pt = np.zeros(n_pts, dtype=np.int64)
    way_of_pt[way_start[1:]] = 1
    way_of_pt = np.cumsum(way_of_pt)

    _, node_idx, counts = np.unique(net['node_ids'], return_inverse=True, return_counts=True)
    is_last = np.zeros(n_pts, dtype=bool)
    is_last[np.r_[way_start[1:] - 1, n_pts - 1]] = True
    is_first = np.zeros(n_pts, dtype=bool)
    is_first[way_start] = True
    is_junction = (counts[node_idx] > 1) | is_first | is_last

    # Segment i joins point i to i+1 within the same way.
    seg_ok = ~is_last
    seg_len = np.zeros(n_pts)
    seg_len[:-1] = np.hypot(np.diff(x), np.diff(y))
    seg_len[~seg_ok] = 0.0

    # Each point lies on the edge that starts at the last junction at or before it (a way's last
    # point is special-cased below). A way's first point is always a junction, so this never
    # crosses into the previous way.
    idx = np.arange(n_pts)
    last_j = np.maximum.accumulate(np.where(is_junction, idx, 0))
    next_j = np.flip(np.minimum.accumulate(np.flip(np.where(is_junction, idx, n_pts))))
    # Running distance over all points; seg_len is 0 across way boundaries, so differences within
    # one way are exact.
    cum = np.cumsum(seg_len) - seg_len
    offset_in_edge = cum - cum[last_j]

    # Edges: one per (junction point that isn't a way's last point).
    starts = np.flatnonzero(is_junction & ~is_last)
    ends = next_j[np.minimum(starts + 1, n_pts - 1)]
    length = cum[ends] - cum[starts]
    way = way_of_pt[starts]
    u = node_idx[starts]
    v = node_idx[ends]
    keep = u != v
    log(f'{len(starts):,} edges, {keep.sum():,} without self-loops, {len(counts):,} distinct nodes')

    # Reversed time graph: Dijkstra from the stations then yields node -> station times.
    fwd_s = length / (net['fwd_kmh'][way] / 3.6)
    bwd_s = length / (net['bwd_kmh'][way] / 3.6)
    # traversing u->v costs fwd_s: reversed edge v->u; traversing v->u costs bwd_s: reversed u->v
    src = np.r_[v[keep], u[keep]]
    dst = np.r_[u[keep], v[keep]]
    wt = np.r_[fwd_s[keep], bwd_s[keep]]
    ln = np.r_[length[keep], length[keep]]
    order = np.lexsort((wt, dst, src))
    src, dst, wt, ln = src[order], dst[order], wt[order], ln[order]
    first = np.r_[True, (src[1:] != src[:-1]) | (dst[1:] != dst[:-1])]
    src, dst, wt, ln = src[first], dst[first], np.maximum(wt[first], 1e-3), ln[first]
    n_nodes = len(counts)
    g_time = csr_matrix((wt, (src, dst)), shape=(n_nodes, n_nodes))
    g_len = csr_matrix((ln, (src, dst)), shape=(n_nodes, n_nodes))

    # Point -> (edge start node, edge end node, metres from start, edge length).
    pt_edge_start = node_idx[last_j]
    pt_edge_end = node_idx[np.where(is_junction & ~is_last, next_j[np.minimum(idx + 1, n_pts - 1)], next_j)]
    pt_edge_len = cum[np.where(is_junction & ~is_last, next_j[np.minimum(idx + 1, n_pts - 1)], next_j)] - cum[last_j]
    # A way's last point is a junction; treat it as sitting at the end of the previous edge.
    last_pts = np.flatnonzero(is_last)
    prev_j = last_j[np.maximum(last_pts - 1, 0)]
    pt_edge_start[last_pts] = node_idx[prev_j]
    pt_edge_end[last_pts] = node_idx[last_pts]
    pt_edge_len[last_pts] = cum[last_pts] - cum[prev_j]
    offset_in_edge[last_pts] = pt_edge_len[last_pts]

    return {
        'x': x, 'y': y,
        'g_time': g_time, 'g_len': g_len, 'n_nodes': n_nodes,
        'pt_start': pt_edge_start, 'pt_end': pt_edge_end,
        'pt_off': offset_in_edge, 'pt_len': pt_edge_len,
        'pt_kmh': net['fwd_kmh'][way_of_pt].astype(np.float64),
    }


# --------------------------------------------------------------------------- routing


def load_stations():
    data = json.loads(STATIONS.read_text())
    st = np.array([[s[0], s[1]] for s in data['stations']], dtype=np.float64)
    to_3035 = Transformer.from_crs(4326, 3035, always_xy=True)
    sx, sy = to_3035.transform(st[:, 0], st[:, 1])
    return data, np.c_[sx, sy]


def route(graph, station_xy):
    g_time, n_nodes = graph['g_time'], graph['n_nodes']
    n_comp, labels = connected_components(g_time, directed=False)
    comp_size = np.bincount(labels)
    big_node = comp_size[labels] >= MIN_COMPONENT_NODES
    log(f'{n_comp:,} components; {big_node.sum():,} of {n_nodes:,} nodes in components >= {MIN_COMPONENT_NODES}')

    # Points that sit on the main network, for snapping.
    pt_ok = big_node[graph['pt_start']] & big_node[graph['pt_end']]
    pts = np.flatnonzero(pt_ok)
    tree = cKDTree(np.c_[graph['x'][pts], graph['y'][pts]])
    log('snap tree built')

    # Stations attach to the nearer end of the edge they snap to (good enough: stations sit on
    # or next to a junction almost always).
    d, i = tree.query(station_xy, workers=-1)
    p = pts[i]
    near_start = graph['pt_off'][p] <= graph['pt_len'][p] / 2
    station_node = np.where(near_start, graph['pt_start'][p], graph['pt_end'][p])
    station_extra = d / (OFF_NETWORK_KMH / 3.6) + np.where(
        near_start, graph['pt_off'][p], graph['pt_len'][p] - graph['pt_off'][p]
    ) / (18 / 3.6)

    # Several stations can land on one node; Dijkstra takes unique sources, so keep the one
    # with the smallest access time per node (station_extra is applied by seeding below).
    order = np.lexsort((station_extra, station_node))
    uniq = np.r_[True, station_node[order][1:] != station_node[order][:-1]]
    src_nodes = station_node[order][uniq]
    src_station = order[uniq]
    log(f'{len(station_xy):,} stations on {len(src_nodes):,} distinct nodes; median snap {np.median(d):.0f} m')

    # Seed each source with its access time via a virtual super-source: add one extra node with
    # an edge to every station node weighted by that station's access leg.
    n = n_nodes + 1
    gt = g_time.tocoo()
    seed_w = np.maximum(station_extra[src_station], 1e-3)
    g = csr_matrix(
        (np.r_[gt.data, seed_w], (np.r_[gt.row, np.full(len(src_nodes), n_nodes)], np.r_[gt.col, src_nodes])),
        shape=(n, n),
    )
    log('dijkstra …')
    dist, pred = dijkstra(g, directed=True, indices=n_nodes, return_predecessors=True)
    dist, pred = dist[:n_nodes], pred[:n_nodes]
    log(f'reached {np.isfinite(dist).sum():,} nodes')

    # Which station each node leads to, and the path length in metres: walk up the shortest-path
    # tree by pointer jumping (log(depth) numpy rounds instead of a Python loop per node).
    ids = np.arange(n_nodes)
    parent = pred.astype(np.int64)
    is_root = (parent == n_nodes) | (parent < 0)
    parent[is_root] = ids[is_root]
    edge_m = np.zeros(n_nodes)
    child = np.flatnonzero(~is_root)
    edge_m[child] = edge_lengths(graph['g_len'], parent[child], child)

    acc = edge_m
    anc = parent
    while True:
        nxt = anc[anc]
        acc = acc + acc[anc]  # roots carry 0, so a finished node stops growing
        if np.array_equal(nxt, anc):
            break
        anc = nxt
    # The loop adds acc[root] (=0) once more after convergence, harmless.
    station_of_root = np.full(n_nodes, -1, dtype=np.int64)
    station_of_root[src_nodes] = src_station
    node_station = station_of_root[anc]
    node_station[~np.isfinite(dist)] = -1
    log(f'path lengths done; median node {np.median(dist[np.isfinite(dist)]) / 60:.1f} min')
    return {'tree': tree, 'pts': pts, 'dist': dist, 'metres': acc, 'node_station': node_station}


def edge_lengths(g: csr_matrix, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """g[rows[k], cols[k]] for many pairs at once, via sorted (row, col) keys."""
    g.sort_indices()
    n = g.shape[1]
    entry_rows = np.repeat(np.arange(g.shape[0], dtype=np.int64), np.diff(g.indptr))
    keys = entry_rows * n + g.indices.astype(np.int64)
    want = rows.astype(np.int64) * n + cols.astype(np.int64)
    pos = np.searchsorted(keys, want)
    assert np.array_equal(keys[pos], want), 'shortest-path edge missing from length graph'
    return g.data[pos]


# --------------------------------------------------------------------------- grid


def germany_mask():
    data = json.loads(STATIONS.read_text())
    to_3035 = Transformer.from_crs(4326, 3035, always_xy=True)
    geom = shapely.transform(shape(data['germany']), lambda xy: np.c_[to_3035.transform(xy[:, 0], xy[:, 1])])
    minx, miny, maxx, maxy = geom.bounds
    x0 = math.floor(minx / CELL) * CELL
    y1 = math.ceil(maxy / CELL) * CELL
    width = math.ceil((maxx - x0) / CELL)
    height = math.ceil((y1 - miny) / CELL)
    transform = from_origin(x0, y1, CELL, CELL)
    inside = rasterio.features.geometry_mask([mapping(geom)], (height, width), transform, invert=True)
    return inside, transform, (x0, y1)


def assign_cells(graph, routed, inside, origin):
    x0, y1 = origin
    rows, cols = np.nonzero(inside)
    cx = x0 + (cols + 0.5) * CELL
    cy = y1 - (rows + 0.5) * CELL
    log(f'snapping {len(cx):,} squares')
    d, i = routed['tree'].query(np.c_[cx, cy], workers=-1)
    p = routed['pts'][i]
    s, e = graph['pt_start'][p], graph['pt_end'][p]
    off, ln, kmh = graph['pt_off'][p], graph['pt_len'][p], graph['pt_kmh'][p]
    via_s = routed['dist'][s] + off / (kmh / 3.6)
    via_e = routed['dist'][e] + (ln - off) / (kmh / 3.6)
    use_s = via_s <= via_e
    secs = np.where(use_s, via_s, via_e) + d / (OFF_NETWORK_KMH / 3.6)
    metres = np.where(use_s, routed['metres'][s] + off, routed['metres'][e] + ln - off) + d
    station = np.where(use_s, routed['node_station'][s], routed['node_station'][e])
    ok = np.isfinite(secs) & (station >= 0)

    shape_ = inside.shape
    station_r = np.full(shape_, -1, dtype=np.int32)
    secs_r = np.full(shape_, np.nan, dtype=np.float32)
    metres_r = np.full(shape_, np.nan, dtype=np.float32)
    station_r[rows[ok], cols[ok]] = station[ok]
    secs_r[rows[ok], cols[ok]] = secs[ok]
    metres_r[rows[ok], cols[ok]] = metres[ok]
    log(f'{ok.sum():,} squares assigned; median {np.median(secs[ok]) / 60:.1f} min, '
        f'{np.median(metres[ok]) / 1000:.1f} km')
    return station_r, secs_r, metres_r


# --------------------------------------------------------------------------- outputs


def colour_stations(station_r: np.ndarray, n_stations: int) -> np.ndarray:
    """Greedy colouring (smallest-last order) of stations whose areas touch."""
    a = np.r_[station_r[:, :-1].ravel(), station_r[:-1, :].ravel()]
    b = np.r_[station_r[:, 1:].ravel(), station_r[1:, :].ravel()]
    m = (a != b) & (a >= 0) & (b >= 0)
    pairs = np.unique(np.sort(np.c_[a[m], b[m]], axis=1), axis=0)
    neighbours = [[] for _ in range(n_stations)]
    for u, v in pairs:
        neighbours[u].append(v)
        neighbours[v].append(u)
    degree = [len(nb) for nb in neighbours]
    buckets: dict[int, set[int]] = {}
    for v, deg in enumerate(degree):
        buckets.setdefault(deg, set()).add(v)
    removed = [False] * n_stations
    order = []
    for _ in range(n_stations):
        d = 0
        while not buckets.get(d):
            d += 1
        v = buckets[d].pop()
        removed[v] = True
        order.append(v)
        for u in neighbours[v]:
            if removed[u]:
                continue
            buckets[degree[u]].discard(u)
            degree[u] -= 1
            buckets.setdefault(degree[u], set()).add(u)
    colour = np.full(n_stations, -1, dtype=np.int16)
    for v in reversed(order):
        used = {colour[u] for u in neighbours[v]}
        c = 0
        while c in used:
            c += 1
        colour[v] = c
    log(f'{len(pairs):,} touching station pairs, {colour.max() + 1} colours')
    return colour


def polygons(values: np.ndarray, valid: np.ndarray, transform, min_cells: int, tolerance: float):
    """Raster -> simplified polygons in EPSG:4326, after removing specks under min_cells."""
    sieved = rasterio.features.sieve(values, size=min_cells, mask=valid)
    shapes = list(rasterio.features.shapes(sieved, mask=valid & (sieved >= 0), transform=transform))
    geoms = shapely.coverage_simplify(np.array([shape(g) for g, _ in shapes]), tolerance)
    to_4326 = Transformer.from_crs(3035, 4326, always_xy=True)
    out = []
    for g, (_, value) in zip(geoms, shapes):
        if g.is_empty:
            continue
        g = shapely.transform(g, lambda xy: np.round(np.c_[to_4326.transform(xy[:, 0], xy[:, 1])], 4))
        out.append((g, int(value)))
    log(f'  {len(shapes):,} pieces after removing specks under {min_cells} squares')
    return out


def write_geojson(path: Path, features) -> None:
    fc = {
        'type': 'FeatureCollection',
        'features': [{'type': 'Feature', 'properties': props, 'geometry': mapping(g)} for g, props in features],
    }
    path.write_text(json.dumps(fc, separators=(',', ':')))
    log(f'{path.name}: {len(features):,} polygons, {path.stat().st_size / 1e6:.1f} MB')


def population_cells():
    csv_path = CACHE / ZENSUS_CSV
    if not csv_path.exists():
        log('downloading Zensus population grid')
        with urllib.request.urlopen(ZENSUS_URL) as r:
            zipfile.ZipFile(io.BytesIO(r.read())).extract(ZENSUS_CSV, CACHE)
    arr = np.loadtxt(csv_path, delimiter=';', skiprows=1, usecols=(1, 2, 3), dtype=np.float64)
    return arr[:, 0], arr[:, 1], arr[:, 2]


def main() -> None:
    stations, station_xy = load_stations()
    inside, transform, origin = germany_mask()
    if GRID.exists():
        log(f'reusing {GRID.name}')
        with np.load(GRID) as z:
            station_r, secs_r, metres_r = z['station'], z['seconds'], z['metres']
    else:
        net = load_network()
        graph = build_graph(net)
        del net
        routed = route(graph, station_xy)
        station_r, secs_r, metres_r = assign_cells(graph, routed, inside, origin)
        del graph, routed
        np.savez(GRID, station=station_r, seconds=secs_r, metres=metres_r)
    valid = station_r >= 0

    n_stations = len(stations['stations'])
    colour = colour_stations(station_r, n_stations)
    areas = polygons(station_r, valid, transform, AREA_MIN_CELLS, AREA_SIMPLIFY_M)
    write_geojson(OUTPUT / 'station-bike-areas.json', [(g, {'s': v, 'c': int(colour[v])}) for g, v in areas])

    k = BAND_CELL_FACTOR
    h, w = (secs_r.shape[0] // k) * k, (secs_r.shape[1] // k) * k
    blocks = secs_r[:h, :w].reshape(h // k, k, w // k, k)
    with np.errstate(invalid='ignore'):
        coarse = np.nanmean(blocks, axis=(1, 3))
    coarse_valid = np.isfinite(coarse)
    band = np.digitize(np.nan_to_num(coarse, nan=0) / 60, BAND_MINUTES).astype(np.int32)
    band[~coarse_valid] = -1
    coarse_transform = from_origin(origin[0], origin[1], CELL * k, CELL * k)
    bands = polygons(band, coarse_valid, coarse_transform, BAND_MIN_CELLS, BAND_SIMPLIFY_M)
    write_geojson(OUTPUT / 'station-bike-bands.json', [(g, {'b': v}) for g, v in bands])

    px, py, pop = population_cells()
    x0, y1 = origin
    col = np.floor((px - x0) / CELL).astype(np.int64)
    row = np.floor((y1 - py) / CELL).astype(np.int64)
    inb = (col >= 0) & (row >= 0) & (col < station_r.shape[1]) & (row < station_r.shape[0])
    col, row = np.where(inb, col, 0), np.where(inb, row, 0)
    secs_p = np.where(inb, secs_r[row, col], np.nan)
    metres_p = np.where(inb, metres_r[row, col], np.nan)
    st_p = np.where(inb, station_r[row, col], -1)
    ok = np.isfinite(secs_p)
    weights = pop[ok]
    log(f'population: {weights.sum():,.0f} of {pop.sum():,.0f} residents on assigned squares; '
        f'weighted mean {np.average(secs_p[ok], weights=weights) / 60:.1f} min, '
        f'{np.average(metres_p[ok], weights=weights) / 1000:.2f} km')
    with gzip.open(CACHE / 'bike-cells.csv.gz', 'wt') as f:
        f.write('x;y;einwohner;seconds;metres;station\n')
        for x, y, e, s_, m_, st in zip(px[ok], py[ok], pop[ok], secs_p[ok], metres_p[ok], st_p[ok]):
            f.write(f'{x:.0f};{y:.0f};{e:.0f};{s_:.0f};{m_:.0f};{st}\n')
    log('bike-cells.csv.gz written')


if __name__ == '__main__':
    sys.exit(main())
