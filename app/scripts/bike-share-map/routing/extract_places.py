#!/usr/bin/env python3
"""
All OSM `place` nodes of the extract (city, town, village, hamlet, …) as one small JSON file —
the origins/destinations of the detour map (fetchDetourGraph.ts picks the ones inside a Landkreis).

Usage: extract_places.py            reads cache/germany-latest.osm.pbf (see README.md)
Writes cache/places-de.json: {"source": ..., "extractedAt": ..., "places": [[lon, lat, place, name, population], ...]}

Only nodes: in Germany villages and hamlets are mapped as nodes; place areas (relations/ways)
nearly always carry a label node too, and a few missing ones aren't worth a second pass.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import osmium

HERE = Path(__file__).resolve().parent
CACHE = HERE / 'cache'
PBF = CACHE / 'germany-latest.osm.pbf'
OUT = CACHE / 'places-de.json'

KEEP = {'city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'isolated_dwelling', 'farm'}


def main() -> None:
    t0 = time.time()
    places: list[list] = []
    fp = (
        osmium.FileProcessor(str(PBF))
        .with_filter(osmium.filter.EntityFilter(osmium.osm.NODE))
        .with_filter(osmium.filter.KeyFilter('place'))
    )
    for node in fp:
        place = node.tags.get('place')
        if place not in KEEP or not node.location.valid():
            continue
        name = node.tags.get('name')
        if not name:
            continue
        pop = node.tags.get('population')
        try:
            pop_n = int(pop.replace('.', '').replace(' ', '')) if pop else None
        except ValueError:
            pop_n = None
        places.append([round(node.location.lon, 6), round(node.location.lat, 6), place, name, pop_n, node.id])
    OUT.write_text(
        json.dumps(
            {
                'source': PBF.name,
                'extractedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'columns': ['lon', 'lat', 'place', 'name', 'population', 'osmId'],
                'places': places,
            },
            ensure_ascii=False,
        )
    )
    print(f'{len(places)} place nodes → {OUT} in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
