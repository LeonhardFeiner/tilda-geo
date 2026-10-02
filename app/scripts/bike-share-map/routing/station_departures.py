#!/usr/bin/env python3
"""
Departures per station on one weekday, from the nationwide GTFS timetable, matched to the OSM
stations of output/stations.json — for sizing the station dots on the naechste-station page.

Source: gtfs.de "Deutschland gesamt" (free), built from DELFI e.V.'s NeTEx data, CC BY 4.0.
Downloaded to cache/gtfs-de.zip on first run (~300 MB; delete it to refresh).

A departure is a trip calling at a station with boarding allowed, not counting the trip's last
stop. Only rail, subway, tram and ferry trips count — the OSM stations don't include bus stops, and
a bus terminal next to a tram stop shouldn't make the tram stop look busy.

Matching: the timetable splits a station into many platforms; those are summed up to their parent
station first. Each (timetable station, mode) then goes to the nearest OSM station of a fitting
category within a radius (a tram departure never lands on the railway station across the
square). OSM stations nothing matched get null — "unknown", not "no service".

Usage: station_departures.py [YYYYMMDD]   (default: 20260929, a Tuesday)
Output: ../output/station-departures.json
"""

from __future__ import annotations

import csv
import io
import json
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np
from pyproj import Transformer
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
CACHE = HERE / 'cache'
GTFS = CACHE / 'gtfs-de.zip'
GTFS_URL = 'https://download.gtfs.de/germany/free/latest.zip'
STATIONS = HERE.parent / 'output' / 'stations.json'
OUT = HERE.parent / 'output' / 'station-departures.json'
DEFAULT_DATE = '20260929'

# GTFS route_type -> mode; OSM station categories (index into STATION_CATEGORIES in
# fetchStations.ts: 0 railway, 1 subway, 2 light_rail, 3 tram, 4 ferry) that may carry that mode,
# in order of preference, and how far apart timetable and OSM positions can be. A later category
# only applies when no earlier one is in range, so a regional train never lands on the tram stop in
# front of the real station. The fallbacks catch systems the two sources classify differently:
# light_rail is the S-Bahn in Berlin/Hamburg but the Stadtbahn in Stuttgart; Stadtbahn networks
# (Hannover, Dortmund, Düsseldorf) run as "subway" in the timetable but stop at OSM tram stops;
# Karlsruhe's tram-trains run as "rail".
RAIL, SUBWAY, TRAM, FERRY = 'rail', 'subway', 'tram', 'ferry'
ROUTE_TYPE_MODE = {'2': RAIL, '1': SUBWAY, '0': TRAM, '4': FERRY}
MODE_CATEGORIES = {RAIL: [[0], [2], [3]], SUBWAY: [[1], [2], [3]], TRAM: [[3], [2], [1]], FERRY: [[4]]}
MODE_RADIUS_M = {RAIL: 400, SUBWAY: 400, TRAM: 300, FERRY: 400}
# One big station is often several OSM points (München: "Hauptbahnhof (tief)", "München
# Hauptbahnhof" and the Starnberger/Holzkirchner wings; Berlin/Hamburg: S-Bahn and long-distance
# parts as separate stations). Railway/light-rail points this close count as one station complex,
# and each shows the complex's total — otherwise whichever point is nearest to the timetable's
# position gets everything and the others look unserved.
COMPLEX_RADIUS_M = 300
DEBUG_NAME = ''


def log(msg: str) -> None:
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


def rows(z: zipfile.ZipFile, name: str):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, 'utf-8-sig'))


def active_services(z: zipfile.ZipFile, day: str) -> set[str]:
    weekday = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][
        date(int(day[:4]), int(day[4:6]), int(day[6:])).weekday()
    ]
    active = {r['service_id'] for r in rows(z, 'calendar.txt') if r[weekday] == '1' and r['start_date'] <= day <= r['end_date']}
    for r in rows(z, 'calendar_dates.txt'):
        if r['date'] != day:
            continue
        if r['exception_type'] == '1':
            active.add(r['service_id'])
        elif r['exception_type'] == '2':
            active.discard(r['service_id'])
    return active


def count_departures(z: zipfile.ZipFile, day: str) -> dict[tuple[str, str], int]:
    """(stop_id, mode) -> departures that day."""
    route_mode = {r['route_id']: ROUTE_TYPE_MODE[r['route_type']] for r in rows(z, 'routes.txt') if r['route_type'] in ROUTE_TYPE_MODE}
    services = active_services(z, day)
    trip_mode = {
        r['trip_id']: route_mode[r['route_id']]
        for r in rows(z, 'trips.txt')
        if r['route_id'] in route_mode and r['service_id'] in services
    }
    log(f'{len(services):,} services on {day}; {len(trip_mode):,} rail/subway/tram/ferry trips')

    counts: dict[tuple[str, str], int] = defaultdict(int)
    last_stop: dict[str, tuple[int, str]] = {}
    with z.open('stop_times.txt') as f:
        text = io.TextIOWrapper(f, 'utf-8-sig')
        header = next(text).rstrip('\n').split(',')
        i_trip, i_stop, i_seq, i_pick = (header.index(c) for c in ('trip_id', 'stop_id', 'stop_sequence', 'pickup_type'))
        for n, line in enumerate(text):
            trip = line[: line.index(',')]
            mode = trip_mode.get(trip)
            if mode is None:
                continue
            cols = line.rstrip('\n').split(',')
            if cols[i_pick] == '1':
                continue
            stop = cols[i_stop]
            counts[(stop, mode)] += 1
            seq = int(cols[i_seq])
            prev = last_stop.get(trip)
            if prev is None or seq > prev[0]:
                last_stop[trip] = (seq, stop)
            if n % 20_000_000 == 0 and n:
                log(f'  {n:,} stop_times lines')
    # The final stop is an arrival, not a departure.
    for trip, (_, stop) in last_stop.items():
        key = (stop, trip_mode[trip])
        if counts.get(key):
            counts[key] -= 1
    return counts


def station_positions(z: zipfile.ZipFile):
    """stop_id -> (station id, lat, lon): platforms resolve to their parent station."""
    stops = {r['stop_id']: r for r in rows(z, 'stops.txt')}

    def root(stop_id: str) -> str:
        seen = 0
        while stops[stop_id]['parent_station'] and stops[stop_id]['parent_station'] in stops and seen < 5:
            stop_id = stops[stop_id]['parent_station']
            seen += 1
        return stop_id

    return stops, root


def main(argv: list[str]) -> None:
    day = argv[0] if argv else DEFAULT_DATE
    if not GTFS.exists():
        log('downloading GTFS (gtfs.de, ~300 MB)')
        urllib.request.urlretrieve(GTFS_URL, GTFS)
    z = zipfile.ZipFile(GTFS)
    counts = count_departures(z, day)
    stops, root = station_positions(z)

    per_station: dict[tuple[str, str], int] = defaultdict(int)
    for (stop, mode), n in counts.items():
        if stop in stops and n > 0:
            per_station[(root(stop), mode)] += n
    log(f'{len(per_station):,} (timetable station, mode) pairs with departures; '
        f'{sum(per_station.values()):,} departures')

    data = json.loads(STATIONS.read_text())
    st = data['stations']
    to_3035 = Transformer.from_crs(4326, 3035, always_xy=True)
    ox, oy = to_3035.transform([s[0] for s in st], [s[1] for s in st])
    osm_xy = np.c_[ox, oy]
    osm_cat = np.array([s[2] for s in st])
    trees = {}
    for c in range(5):
        idx = np.flatnonzero(osm_cat == c)
        trees[c] = (idx, cKDTree(osm_xy[idx]) if len(idx) else None)

    by_mode = np.zeros((len(st), len(MODE_RADIUS_M)), dtype=np.int64)
    mode_col = {m: k for k, m in enumerate(MODE_RADIUS_M)}
    sources = defaultdict(list)
    lost = defaultdict(int)
    for (station, mode), n in per_station.items():
        s = stops[station]
        x, y = to_3035.transform(float(s['stop_lon']), float(s['stop_lat']))
        best = None
        for tier in MODE_CATEGORIES[mode]:
            for c in tier:
                idx, tree = trees[c]
                if tree is None:
                    continue
                d, i = tree.query((x, y), distance_upper_bound=MODE_RADIUS_M[mode])
                if np.isfinite(d) and (best is None or d < best[0]):
                    best = (d, idx[i])
            if best is not None:
                break
        if best is None:
            lost[mode] += n
            continue
        by_mode[best[1], mode_col[mode]] += n
        sources[int(best[1])].append((s['stop_name'], mode, n, int(best[0])))

    departures = by_mode.sum(axis=1)
    matched = departures > 0
    if DEBUG_NAME:
        for i, srcs in sources.items():
            if st[i][3] == DEBUG_NAME:
                log(f'debug {st[i][3]} [{st[i][2]}]: {srcs}')

    # Station complexes: union-find over close railway points, plus light-rail points that aren't
    # mainly a Stadtbahn stop (S-Bahn points as in Berlin/Hamburg, which mostly get no departures
    # of their own since rail prefers the railway point — in Stuttgart light_rail is the Stadtbahn,
    # which must not join the main station's total).
    rail_like = by_mode[:, mode_col[RAIL]] * 2 >= departures
    heavy = np.flatnonzero((osm_cat == 0) | ((osm_cat == 2) & rail_like))
    parent = np.arange(len(st))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b in cKDTree(osm_xy[heavy]).query_pairs(COMPLEX_RADIUS_M):
        ra, rb = find(heavy[a]), find(heavy[b])
        if ra != rb:
            parent[ra] = rb
    roots = np.array([find(i) for i in range(len(st))])
    complex_total = np.bincount(roots, weights=departures, minlength=len(st)).astype(np.int64)
    complex_matched = np.bincount(roots, weights=matched, minlength=len(st)) > 0
    sizes = np.bincount(roots, minlength=len(st))
    log(f'{(sizes[sizes > 1]).sum():,} railway/light-rail points merged into {(sizes > 1).sum():,} station complexes')
    departures = complex_total[roots]
    matched = complex_matched[roots]

    total = sum(per_station.values())
    log(f'departures matched to an OSM station: {(total - sum(lost.values())) / total:.1%} '
        f'(unmatched by mode: {dict(lost)})')
    names = ['railway', 'subway', 'light_rail', 'tram', 'ferry']
    for c in range(5):
        m = osm_cat == c
        log(f'  {names[c]:10s}: {matched[m].sum():,} of {m.sum():,} OSM stations have departures; '
            f'median {int(np.median(departures[m & matched])) if (m & matched).any() else 0}')
    order = np.argsort(-departures)[:5]
    log('busiest: ' + ', '.join(f'{st[i][3]} ({departures[i]})' for i in order))

    OUT.write_text(json.dumps({
        'date': day,
        'source': 'gtfs.de (DELFI e.V.), CC BY 4.0',
        'stationsFetchedAt': data.get('fetchedAt'),
        # Same order as stations.json; null where no timetable station matched.
        'departures': [int(departures[i]) if matched[i] else None for i in range(len(st))],
    }, separators=(',', ':')))
    log(f'{OUT}')


if __name__ == '__main__':
    main(sys.argv[1:])
