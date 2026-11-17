#!/usr/bin/env bash
# OSM roads, paths and bike lanes around Schweitenkirchen from the local tilda-geo database
# (TILDA tables roads, roadsPathClasses, bikelanes), plus the OSM place nodes of
# routing/cache/places-de.json, as {"ways": [...], "places": [...]} for georef.py / assign.py.
# Also writes ../gemeinde.geojson (the Gemeinde boundary the page draws).
#
#   export_osm.sh <out.json>
set -euo pipefail
OUT="${1:?out.json}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PLACES="$HERE/../../routing/cache/places-de.json"
BBOX='11.50,48.40,11.78,48.62'

docker exec db psql -U postgres -Atc "
select json_build_object('ways', coalesce(json_agg(w order by w.id, w.coords::text), '[]'))
from (
  select osm_id as id, tags, ST_AsGeoJSON(ST_Transform(geom, 4326), 7)::json->'coordinates' as coords
  from (
    select osm_id, tags, (ST_Dump(geom)).geom as geom from roads
    union all select osm_id, tags, (ST_Dump(geom)).geom from \"roadsPathClasses\"
    union all select osm_id, tags, (ST_Dump(geom)).geom from bikelanes
  ) x
  where geom && ST_Transform(ST_MakeEnvelope($BBOX, 4326), 3857) and GeometryType(geom) = 'LINESTRING'
) w" > "$OUT.ways"

python3 -I - "$OUT.ways" "$PLACES" "$OUT" <<'EOF'
import json, sys
ways_file, places_file, out = sys.argv[1:4]
W, S, E, N = 11.48, 48.40, 11.78, 48.62
d = json.load(open(ways_file))
ways = []
for w in d['ways']:
    t = w['tags'] or {}
    # georef.py matches against the classified roads (motorway … tertiary): TILDA's `road` tag
    ways.append(dict(id=w['id'], tags=dict(highway=t.get('road') or t.get('category') or 'path', name=t.get('name')), coords=w['coords']))
places = [dict(lon=p[0], lat=p[1], place=p[2], name=p[3]) for p in json.load(open(places_file))['places']
          if W <= p[0] <= E and S <= p[1] <= N]
json.dump(dict(ways=ways, places=places), open(out, 'w'))
print(f'OSM: {len(ways)} ways, {len(places)} places', file=sys.stderr)
EOF
rm "$OUT.ways"

# Gemeinde boundary for the page (context layer), simplified to ~5 m
docker exec db psql -U postgres -Atc "
select json_build_object('type', 'Feature',
  'properties', json_build_object('name', tags->>'name', 'osm', 'relation/396557'),
  'geometry', ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom, 5), 4326), 5)::json)
from boundaries where osm_id = 396557" > "$HERE/../gemeinde.geojson"
