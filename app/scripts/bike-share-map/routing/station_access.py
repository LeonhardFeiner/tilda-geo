#!/usr/bin/env python3
"""
Nearest station on foot, by bike and by car, along the real OSM network, for every 100 m square
of Germany — plus the straight-line distance for comparison.

The straight-line page view (stationAreasPage.ts) splits Germany into Voronoi cells. This does the
same along the network: per mode, one multi-source Dijkstra from all stations at once labels
every junction with its nearest station and the travel time to it, then every square of a 100 m
grid (aligned with the Zensus 2022 grid, EPSG:3035) is snapped to the nearest point of a way that
mode can use and inherits that way's label.

Each mode has its own network (see the *_speeds functions): a separately mapped cycleway or
sidewalk is part of the bike/foot network but not the car's, motorways only exist for cars, and a
square attaches to the nearest way of *that* mode — in a pedestrian zone the nearest car road can
be a few hundred metres further away than the nearest footway.

Usage: station_access.py [foot] [bike] [car] [straight]   (default: all)

Inputs
  cache/germany-latest.osm.pbf     copied from the processing Docker volume (see README.md)
  ../output/stations.json          bun run bike-share-map:stations
  cache/Zensus2022_...csv          downloaded on first run (population per 100 m square)

Outputs, per mode (foot, bike, car; straight only has km)
  ../output/station-access/<mode>-areas.json    GeoJSON: where each station is the nearest
  ../output/station-access/<mode>-minutes.json  GeoJSON: minutes to the nearest station, in bands
  ../output/station-access/<mode>-km.json       GeoJSON: km to the nearest station, in bands
  cache/<mode>-cells.csv.gz                     populated squares: x;y (3035 centre);Einwohner;
                                                seconds;metres — read by fetchStationAccess.ts
  cache/network.npz                             parsed ways with per-mode speeds (delete to re-parse)
  cache/<mode>-grid.npz                         routed squares (delete to re-route that mode)

The GeoJSON files are committed: CI only rebuilds the viewer from them.
"""

from __future__ import annotations

import gzip
import io
import json
import math
import re
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
NETWORK = CACHE / 'network.npz'
OUTPUT = HERE.parent / 'output'
OUT_DIR = OUTPUT / 'station-access'
STATIONS = OUTPUT / 'stations.json'
ZENSUS_URL = 'https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip'
ZENSUS_CSV = 'Zensus2022_Bevoelkerungszahl_100m-Gitter.csv'

MODES = ['foot', 'bike', 'car']  # column order of the speeds array: (mode fwd, mode bwd) pairs
CELL = 100  # metres, EPSG:3035 — same grid as the Zensus population squares
MIN_COMPONENT_NODES = 200  # smaller disconnected bits (car parks, isolated paths) aren't snapped to
# Getting from the square's centre to the nearest usable way, and from the network to the
# station: walking, except pushing/wheeling a bike a bit faster.
OFF_NETWORK_KMH = {'foot': 4.5, 'bike': 6.0, 'car': 4.5}

# Same bands for every mode, so a colour means the same in each view.
BAND_MINUTES = [5, 10, 15, 20, 30, 45, 60]
BAND_KM = [0.5, 1, 2, 3, 5, 10, 20]

# The squares give every border a 100 m staircase; simplifying the whole coverage at once (shared
# borders move together, no gaps) with a tolerance above the cell size smooths it away.
AREA_SIMPLIFY_M = 150
BAND_SIMPLIFY_M = 300
AREA_MIN_CELLS = 20  # 0.2 km² — smaller specks join their surroundings
BAND_CELL_FACTOR = 2  # bands use 200 m squares (2×2 mean): smoother, half the border detail
BAND_MIN_CELLS = 25  # 1 km² of 200 m squares


def log(msg: str) -> None:
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


# --------------------------------------------------------------------------- profiles
#
# Each returns (forward, backward) km/h; 0 in a direction means not allowed that way, None means
# the mode can't use the way at all. Rough on purpose: no slopes, no traffic lights, no traffic.

NO_ACCESS = {'no', 'private'}
OK_ACCESS = {'yes', 'designated', 'permissive', 'destination'}
FORBIDDEN_HIGHWAYS = {'construction', 'proposed', 'abandoned', 'razed', 'raceway', 'bus_guideway', 'escape'}


def oneway_direction(tags, implied: bool = False) -> int:
    """1: only forward, -1: only backward, 0: both ways. 2: unusable (reversible)."""
    oneway = tags.get('oneway')
    if oneway is None and (implied or tags.get('junction') in ('roundabout', 'circular')):
        oneway = 'yes'
    if oneway in ('yes', 'true', '1'):
        return 1
    if oneway == '-1':
        return -1
    if oneway in ('reversible', 'alternating'):
        return 2
    return 0


FOOT_HIGHWAYS = {
    'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road',
    'track', 'path', 'footway', 'pedestrian', 'bridleway', 'steps', 'corridor', 'platform',
    'cycleway',
}


def foot_speeds(tags):
    hw = tags.get('highway')
    if hw not in FOOT_HIGHWAYS or tags.get('motorroad') == 'yes':
        return None
    foot = tags.get('foot')
    if foot in NO_ACCESS or foot == 'use_sidepath':
        return None
    if tags.get('access') in NO_ACCESS and foot not in OK_ACCESS:
        return None
    # A pure cycleway isn't for walking in Germany; shared paths carry foot=designated/yes.
    if hw == 'cycleway' and foot not in OK_ACCESS:
        return None
    kmh = 3.0 if hw == 'steps' else 4.5
    return kmh, kmh


BIKE_KMH = {
    'cycleway': 18,
    'primary': 18, 'primary_link': 18,
    'secondary': 18, 'secondary_link': 18,
    'tertiary': 18, 'tertiary_link': 18,
    'trunk': 18, 'trunk_link': 18,
    'unclassified': 18, 'residential': 18, 'road': 15,
    'living_street': 12, 'service': 15,
    'track': 12, 'path': 12,
    # Only ridden with explicit permission, otherwise pushed.
    'footway': 0, 'pedestrian': 0, 'bridleway': 0, 'steps': 0,
}
TRACKTYPE_KMH = {'grade1': 16, 'grade2': 14, 'grade3': 12, 'grade4': 9, 'grade5': 8}
SURFACE_FACTOR = {
    'compacted': 0.9, 'fine_gravel': 0.85, 'gravel': 0.75, 'pebblestone': 0.7,
    'unpaved': 0.75, 'ground': 0.65, 'dirt': 0.65, 'earth': 0.65, 'grass': 0.55,
    'sand': 0.5, 'mud': 0.5, 'woodchips': 0.6,
    'sett': 0.8, 'cobblestone': 0.7, 'unhewn_cobblestone': 0.6, 'grass_paver': 0.7,
}
PUSH_KMH = 5.0


def bike_speeds(tags):
    hw = tags.get('highway')
    if hw not in BIKE_KMH or tags.get('motorroad') == 'yes':
        return None
    bicycle = tags.get('bicycle')
    # use_sidepath: the blue sign on the separate cycleway makes the road itself off-limits; that
    # cycleway is mapped as its own way and carries the route instead.
    if bicycle in NO_ACCESS or bicycle == 'use_sidepath':
        return None
    if tags.get('access') in NO_ACCESS and bicycle not in OK_ACCESS:
        return None
    if tags.get('area') == 'yes' and hw != 'pedestrian':
        return None

    if hw == 'steps':
        kmh = 2.0
    elif BIKE_KMH[hw] == 0:
        kmh = 14.0 if bicycle in OK_ACCESS else PUSH_KMH
    elif bicycle == 'dismount':
        kmh = PUSH_KMH
    else:
        kmh = float(TRACKTYPE_KMH.get(tags.get('tracktype'), BIKE_KMH[hw])) if hw == 'track' else float(BIKE_KMH[hw])
        kmh *= SURFACE_FACTOR.get(tags.get('surface'), 1.0)

    exempt = (
        tags.get('oneway:bicycle') == 'no'
        or tags.get('cycleway', '').startswith('opposite')
        or hw in ('cycleway', 'footway', 'path', 'track', 'steps', 'pedestrian')
    )
    direction = 0 if exempt else oneway_direction(tags)
    if direction == 2:
        return None
    if direction == 1:  # against a one-way: push on the sidewalk
        return kmh, min(kmh, PUSH_KMH)
    if direction == -1:
        return min(kmh, PUSH_KMH), kmh
    return kmh, kmh


# Assumed speed limit when maxspeed isn't tagged (urban/rural unknown, so in between).
CAR_DEFAULT_LIMIT = {
    'motorway': 130, 'motorway_link': 60, 'trunk': 100, 'trunk_link': 50,
    'primary': 70, 'primary_link': 40, 'secondary': 60, 'secondary_link': 40,
    'tertiary': 50, 'tertiary_link': 30, 'unclassified': 50, 'residential': 30,
    'living_street': 10, 'service': 20, 'road': 30, 'track': 20,
}
MAXSPEED_WORDS = {
    'de:urban': 50, 'de:rural': 100, 'de:motorway': 130, 'de:living_street': 10, 'walk': 10,
    'de:zone30': 30, 'de:zone:30': 30, 'de:bicycle_road': 30, 'none': 130,
}
CAR_FORBIDDEN = NO_ACCESS | {'agricultural', 'forestry', 'delivery', 'emergency', 'bus', 'psv', 'permit', 'customers'}


def parse_maxspeed(value: str | None) -> float | None:
    if not value:
        return None
    v = value.strip().lower()
    if v in MAXSPEED_WORDS:
        return MAXSPEED_WORDS[v]
    m = re.match(r'^(\d+(?:\.\d+)?)\s*(mph)?', v)
    if not m:
        return None
    return float(m.group(1)) * (1.609 if m.group(2) else 1.0)


def car_speeds(tags):
    hw = tags.get('highway')
    if hw not in CAR_DEFAULT_LIMIT or tags.get('area') == 'yes':
        return None
    # The most specific tag decides: motorcar > motor_vehicle > vehicle > access.
    rule = next(
        (tags.get(k) for k in ('motorcar', 'motor_vehicle', 'vehicle', 'access') if tags.get(k) is not None),
        None,
    )
    if rule in CAR_FORBIDDEN:
        return None
    # Farm/forest tracks are mostly closed to cars in practice even when untagged; only take
    # those with an explicit permission.
    if hw == 'track' and rule not in ('yes', 'permissive', 'destination', 'designated'):
        return None
    limit = parse_maxspeed(tags.get('maxspeed')) or CAR_DEFAULT_LIMIT[hw]
    limit = min(limit, 130.0)
    # Average speed well below the limit: junctions, lights and turns cost most on slow roads.
    kmh = limit * (0.85 if limit >= 100 else 0.75 if limit >= 70 else 0.6)
    if rule == 'destination':
        # Anlieger frei: fine to start or end there, so keep it, but slow enough that routes don't
        # cut through.
        kmh *= 0.5
    direction = oneway_direction(tags, implied=hw in ('motorway', 'motorway_link'))
    if direction == 2:
        return None
    if direction == 1:
        return kmh, 0.0
    if direction == -1:
        return 0.0, kmh
    return kmh, kmh


PROFILES = {'foot': foot_speeds, 'bike': bike_speeds, 'car': car_speeds}


# --------------------------------------------------------------------------- parse


def parse_network() -> dict[str, np.ndarray]:
    """Every way any mode can use, as a run of points, with (fwd, bwd) km/h per mode."""
    node_ids = array('q')
    lons = array('d')
    lats = array('d')
    way_start = array('q')
    speeds = array('f')
    processor = (
        osmium.FileProcessor(str(PBF))
        .with_locations('flex_mem')
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter('highway'))
    )
    count = 0
    for way in processor:
        tags = way.tags
        if tags.get('highway') in FORBIDDEN_HIGHWAYS:
            continue
        per_mode = [PROFILES[m](tags) for m in MODES]
        if all(s is None for s in per_mode):
            continue
        pts = [(n.ref, n.lon, n.lat) for n in way.nodes if n.location.valid()]
        if len(pts) < 2:
            continue
        way_start.append(len(node_ids))
        for s in per_mode:
            speeds.extend(s if s is not None else (0.0, 0.0))
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
        'speeds': np.frombuffer(speeds, dtype=np.float32).reshape(-1, 2 * len(MODES)),
    }


def load_network() -> dict[str, np.ndarray]:
    if NETWORK.exists():
        log(f'reusing {NETWORK.name}')
        with np.load(NETWORK) as z:
            net = {k: z[k] for k in z.files}
    else:
        log(f'parsing {PBF.name} (takes a while)')
        net = parse_network()
        np.savez(NETWORK, **net)
    to_3035 = Transformer.from_crs(4326, 3035, always_xy=True)
    net['x'], net['y'] = to_3035.transform(net['lon'], net['lat'])
    return net


def mode_ways(net: dict[str, np.ndarray], mode: str) -> dict[str, np.ndarray]:
    """The ways one mode can use (in either direction), with that mode's speeds."""
    m = MODES.index(mode)
    fwd = net['speeds'][:, 2 * m]
    bwd = net['speeds'][:, 2 * m + 1]
    keep_way = (fwd > 0) | (bwd > 0)
    n_pts = len(net['node_ids'])
    way_len = np.diff(np.r_[net['way_start'], n_pts])
    keep_pt = np.repeat(keep_way, way_len)
    kept_len = way_len[keep_way]
    log(f'{mode}: {keep_way.sum():,} ways, {keep_pt.sum():,} points')
    return {
        'node_ids': net['node_ids'][keep_pt],
        'x': net['x'][keep_pt],
        'y': net['y'][keep_pt],
        'way_start': np.r_[0, np.cumsum(kept_len)[:-1]],
        'fwd_kmh': fwd[keep_way].astype(np.float64),
        'bwd_kmh': bwd[keep_way].astype(np.float64),
    }


# --------------------------------------------------------------------------- graph


def build_graph(net: dict[str, np.ndarray]):
    """
    Junction graph: graph nodes are way ends and nodes shared by several ways; each edge is the
    run of points between two of them. Returns the graph plus, for every point, which edge it
    lies on and how far along it is — so squares can snap to the middle of a long rural road.
    """
    x, y = net['x'], net['y']
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

    # Only junctions become graph nodes; renumber them densely.
    junction_ids = np.unique(node_idx[is_junction])
    dense = np.full(len(counts), -1, dtype=np.int64)
    dense[junction_ids] = np.arange(len(junction_ids))
    n_nodes = len(junction_ids)

    # Segment i joins point i to i+1 within the same way.
    seg_len = np.zeros(n_pts)
    seg_len[:-1] = np.hypot(np.diff(x), np.diff(y))
    seg_len[is_last] = 0.0
    # Running distance over all points; seg_len is 0 across way boundaries, so differences within
    # one way are exact.
    cum = np.cumsum(seg_len) - seg_len

    # Each point lies on the edge that starts at the last junction at or before it (a way's last
    # point is special-cased below). A way's first point is always a junction, so this never
    # crosses into the previous way.
    idx = np.arange(n_pts)
    last_j = np.maximum.accumulate(np.where(is_junction, idx, 0))
    next_j = np.flip(np.minimum.accumulate(np.flip(np.where(is_junction, idx, n_pts))))
    offset_in_edge = cum - cum[last_j]

    # Edges: one per junction point that isn't a way's last point.
    starts = np.flatnonzero(is_junction & ~is_last)
    ends = next_j[starts + 1]
    length = cum[ends] - cum[starts]
    way = way_of_pt[starts]
    u = dense[node_idx[starts]]
    v = dense[node_idx[ends]]
    fwd_kmh = net['fwd_kmh'][way]
    bwd_kmh = net['bwd_kmh'][way]

    # Reversed time graph, so Dijkstra from the stations yields node -> station times:
    # travelling u->v (allowed when fwd > 0) becomes reversed edge v->u, and v->u becomes u->v.
    a = (u != v) & (fwd_kmh > 0)
    b = (u != v) & (bwd_kmh > 0)
    src = np.r_[v[a], u[b]]
    dst = np.r_[u[a], v[b]]
    wt = np.r_[length[a] / (fwd_kmh[a] / 3.6), length[b] / (bwd_kmh[b] / 3.6)]
    ln = np.r_[length[a], length[b]]
    order = np.lexsort((wt, dst, src))
    src, dst, wt, ln = src[order], dst[order], wt[order], ln[order]
    first = np.r_[True, (src[1:] != src[:-1]) | (dst[1:] != dst[:-1])]
    src, dst, wt, ln = src[first], dst[first], np.maximum(wt[first], 1e-3), ln[first]
    g_time = csr_matrix((wt, (src, dst)), shape=(n_nodes, n_nodes))
    g_len = csr_matrix((ln, (src, dst)), shape=(n_nodes, n_nodes))
    log(f'  {n_nodes:,} junctions, {len(src):,} directed edges')

    # Point -> (edge start node, edge end node, metres from start, edge length).
    edge_end_pt = np.where(is_junction & ~is_last, next_j[np.minimum(idx + 1, n_pts - 1)], next_j)
    pt_start = dense[node_idx[last_j]]
    pt_end = dense[node_idx[edge_end_pt]]
    pt_len = cum[edge_end_pt] - cum[last_j]
    # A way's last point is a junction; treat it as sitting at the end of the previous edge.
    last_pts = np.flatnonzero(is_last)
    prev_j = last_j[np.maximum(last_pts - 1, 0)]
    pt_start[last_pts] = dense[node_idx[prev_j]]
    pt_end[last_pts] = dense[node_idx[last_pts]]
    pt_len[last_pts] = cum[last_pts] - cum[prev_j]
    offset_in_edge[last_pts] = pt_len[last_pts]
    pt_kmh = np.maximum(net['fwd_kmh'], net['bwd_kmh'])[way_of_pt]

    return {
        'x': x, 'y': y,
        'g_time': g_time, 'g_len': g_len, 'n_nodes': n_nodes,
        'pt_start': pt_start, 'pt_end': pt_end,
        'pt_off': offset_in_edge, 'pt_len': pt_len, 'pt_kmh': pt_kmh,
    }


# --------------------------------------------------------------------------- routing


def load_stations():
    data = json.loads(STATIONS.read_text())
    st = np.array([[s[0], s[1]] for s in data['stations']], dtype=np.float64)
    to_3035 = Transformer.from_crs(4326, 3035, always_xy=True)
    sx, sy = to_3035.transform(st[:, 0], st[:, 1])
    return data, np.c_[sx, sy]


def route(graph, station_xy, off_kmh: float):
    g_time, n_nodes = graph['g_time'], graph['n_nodes']
    n_comp, labels = connected_components(g_time, directed=False)
    comp_size = np.bincount(labels)
    big_node = comp_size[labels] >= MIN_COMPONENT_NODES
    log(f'  {n_comp:,} components; {big_node.sum():,} of {n_nodes:,} junctions in components >= {MIN_COMPONENT_NODES}')

    # Points that sit on the main network, for snapping.
    pts = np.flatnonzero(big_node[graph['pt_start']] & big_node[graph['pt_end']])
    tree = cKDTree(np.c_[graph['x'][pts], graph['y'][pts]])

    # Stations attach to the nearer end of the edge they snap to (stations sit on or next to a
    # junction almost always).
    d, i = tree.query(station_xy, workers=-1)
    p = pts[i]
    near_start = graph['pt_off'][p] <= graph['pt_len'][p] / 2
    station_node = np.where(near_start, graph['pt_start'][p], graph['pt_end'][p])
    along = np.where(near_start, graph['pt_off'][p], graph['pt_len'][p] - graph['pt_off'][p])
    station_extra = d / (off_kmh / 3.6) + along / (graph['pt_kmh'][p] / 3.6)

    # Several stations can land on one node; keep the one with the smallest access time.
    order = np.lexsort((station_extra, station_node))
    uniq = np.r_[True, station_node[order][1:] != station_node[order][:-1]]
    src_nodes = station_node[order][uniq]
    src_station = order[uniq]
    log(f'  {len(station_xy):,} stations on {len(src_nodes):,} distinct junctions; median snap {np.median(d):.0f} m')

    # Seed each station with its access time via a virtual super-source: one extra node with an
    # edge to every station junction, weighted by that station's access leg.
    n = n_nodes + 1
    gt = g_time.tocoo()
    seed_w = np.maximum(station_extra[src_station], 1e-3)
    g = csr_matrix(
        (np.r_[gt.data, seed_w], (np.r_[gt.row, np.full(len(src_nodes), n_nodes)], np.r_[gt.col, src_nodes])),
        shape=(n, n),
    )
    dist, pred = dijkstra(g, directed=True, indices=n_nodes, return_predecessors=True)
    dist, pred = dist[:n_nodes], pred[:n_nodes]
    log(f'  dijkstra reached {np.isfinite(dist).sum():,} junctions')

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
    station_of_root = np.full(n_nodes, -1, dtype=np.int64)
    station_of_root[src_nodes] = src_station
    node_station = station_of_root[anc]
    node_station[~np.isfinite(dist)] = -1
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


def square_centres(inside, origin):
    x0, y1 = origin
    rows, cols = np.nonzero(inside)
    return rows, cols, x0 + (cols + 0.5) * CELL, y1 - (rows + 0.5) * CELL


def assign_cells(graph, routed, inside, origin, off_kmh: float):
    rows, cols, cx, cy = square_centres(inside, origin)
    d, i = routed['tree'].query(np.c_[cx, cy], workers=-1)
    p = routed['pts'][i]
    s, e = graph['pt_start'][p], graph['pt_end'][p]
    off, ln, kmh = graph['pt_off'][p], graph['pt_len'][p], graph['pt_kmh'][p]
    via_s = routed['dist'][s] + off / (kmh / 3.6)
    via_e = routed['dist'][e] + (ln - off) / (kmh / 3.6)
    use_s = via_s <= via_e
    secs = np.where(use_s, via_s, via_e) + d / (off_kmh / 3.6)
    metres = np.where(use_s, routed['metres'][s] + off, routed['metres'][e] + ln - off) + d
    station = np.where(use_s, routed['node_station'][s], routed['node_station'][e])
    ok = np.isfinite(secs) & (station >= 0)
    return to_rasters(inside.shape, rows[ok], cols[ok], station[ok], secs[ok], metres[ok])


def straight_cells(station_xy, inside, origin):
    rows, cols, cx, cy = square_centres(inside, origin)
    d, i = cKDTree(station_xy).query(np.c_[cx, cy], workers=-1)
    return to_rasters(inside.shape, rows, cols, i, np.full(len(d), np.nan), d)


def to_rasters(shape_, rows, cols, station, secs, metres):
    station_r = np.full(shape_, -1, dtype=np.int32)
    secs_r = np.full(shape_, np.nan, dtype=np.float32)
    metres_r = np.full(shape_, np.nan, dtype=np.float32)
    station_r[rows, cols] = station
    secs_r[rows, cols] = secs
    metres_r[rows, cols] = metres
    log(f'  {len(rows):,} squares assigned; median {np.nanmedian(secs) / 60 if np.isfinite(secs).any() else float("nan"):.1f} min, '
        f'{np.median(metres) / 1000:.1f} km')
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
    log(f'  {len(pairs):,} touching station pairs, {colour.max() + 1} colours')
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
    return out


def band_polygons(values_r: np.ndarray, bins: list[float], origin):
    """Bands of a continuous raster (minutes or km), on coarser squares to keep them smooth."""
    k = BAND_CELL_FACTOR
    h, w = (values_r.shape[0] // k) * k, (values_r.shape[1] // k) * k
    blocks = values_r[:h, :w].reshape(h // k, k, w // k, k)
    with np.errstate(invalid='ignore'), np.testing.suppress_warnings() as sup:
        sup.filter(RuntimeWarning)
        coarse = np.nanmean(blocks, axis=(1, 3))
    valid = np.isfinite(coarse)
    band = np.digitize(np.nan_to_num(coarse, nan=0), bins).astype(np.int32)
    band[~valid] = -1
    transform = from_origin(origin[0], origin[1], CELL * k, CELL * k)
    return polygons(band, valid, transform, BAND_MIN_CELLS, BAND_SIMPLIFY_M)


def write_geojson(path: Path, features) -> None:
    fc = {
        'type': 'FeatureCollection',
        'features': [{'type': 'Feature', 'properties': props, 'geometry': mapping(g)} for g, props in features],
    }
    path.write_text(json.dumps(fc, separators=(',', ':')))
    log(f'  {path.name}: {len(features):,} polygons, {path.stat().st_size / 1e6:.1f} MB')


def population_cells():
    csv_path = CACHE / ZENSUS_CSV
    if not csv_path.exists():
        log('downloading Zensus population grid')
        with urllib.request.urlopen(ZENSUS_URL) as r:
            zipfile.ZipFile(io.BytesIO(r.read())).extract(ZENSUS_CSV, CACHE)
    arr = np.loadtxt(csv_path, delimiter=';', skiprows=1, usecols=(1, 2, 3), dtype=np.float64)
    return arr[:, 0], arr[:, 1], arr[:, 2]


def write_population_cells(mode, pop_cells, station_r, secs_r, metres_r, origin):
    px, py, pop = pop_cells
    x0, y1 = origin
    col = np.floor((px - x0) / CELL).astype(np.int64)
    row = np.floor((y1 - py) / CELL).astype(np.int64)
    inb = (col >= 0) & (row >= 0) & (col < station_r.shape[1]) & (row < station_r.shape[0])
    col, row = np.where(inb, col, 0), np.where(inb, row, 0)
    secs_p = np.where(inb, secs_r[row, col], np.nan)
    metres_p = np.where(inb, metres_r[row, col], np.nan)
    ok = np.isfinite(metres_p)
    w = pop[ok]
    mean_min = np.average(np.nan_to_num(secs_p[ok]), weights=w) / 60
    log(f'  population: {w.sum():,.0f} of {pop.sum():,.0f} residents; weighted mean '
        f'{mean_min:.1f} min, {np.average(metres_p[ok], weights=w) / 1000:.2f} km')
    with gzip.open(CACHE / f'{mode}-cells.csv.gz', 'wt') as f:
        f.write('x;y;einwohner;seconds;metres\n')
        for x, y, e, s_, m_ in zip(px[ok], py[ok], pop[ok], secs_p[ok], metres_p[ok]):
            f.write(f'{x:.0f};{y:.0f};{e:.0f};{"" if np.isnan(s_) else f"{s_:.0f}"};{m_:.0f}\n')


def main(argv: list[str]) -> None:
    wanted = argv or MODES + ['straight']
    unknown = set(wanted) - set(MODES) - {'straight'}
    if unknown:
        sys.exit(f'unknown mode(s): {", ".join(sorted(unknown))}')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stations, station_xy = load_stations()
    n_stations = len(stations['stations'])
    inside, transform, origin = germany_mask()
    pop_cells = population_cells()
    net = None

    for mode in wanted:
        log(f'== {mode}')
        grid_path = CACHE / f'{mode}-grid.npz'
        if grid_path.exists():
            log(f'  reusing {grid_path.name}')
            with np.load(grid_path) as z:
                station_r, secs_r, metres_r = z['station'], z['seconds'], z['metres']
        elif mode == 'straight':
            station_r, secs_r, metres_r = straight_cells(station_xy, inside, origin)
            np.savez(grid_path, station=station_r, seconds=secs_r, metres=metres_r)
        else:
            if net is None:
                net = load_network()
            graph = build_graph(mode_ways(net, mode))
            routed = route(graph, station_xy, OFF_NETWORK_KMH[mode])
            station_r, secs_r, metres_r = assign_cells(graph, routed, inside, origin, OFF_NETWORK_KMH[mode])
            del graph, routed
            np.savez(grid_path, station=station_r, seconds=secs_r, metres=metres_r)

        if mode != 'straight':
            # Straight-line areas are drawn in the browser (Voronoi), with the category filter.
            colour = colour_stations(station_r, n_stations)
            areas = polygons(station_r, station_r >= 0, transform, AREA_MIN_CELLS, AREA_SIMPLIFY_M)
            write_geojson(OUT_DIR / f'{mode}-areas.json', [(g, {'s': v, 'c': int(colour[v])}) for g, v in areas])
            write_geojson(OUT_DIR / f'{mode}-minutes.json',
                          [(g, {'b': v}) for g, v in band_polygons(secs_r / 60, BAND_MINUTES, origin)])
        write_geojson(OUT_DIR / f'{mode}-km.json',
                      [(g, {'b': v}) for g, v in band_polygons(metres_r / 1000, BAND_KM, origin)])
        write_population_cells(mode, pop_cells, station_r, secs_r, metres_r, origin)


if __name__ == '__main__':
    main(sys.argv[1:])
