"""Patch cache/osm-area.json with ways changed in OSM after the DB extract (Overpass `newer:`),
so the tracker can show edits before the next Geofabrik extract. Tags are mapped the way
export_osm.sh / TILDA would for the common cases (road class, surface, footway + bicycle=yes,
cycle tracks tagged on the road, cycleway:*=track, as a line 5 m to that side); other bike lanes
derived from cycleway:* tags on roads are kept as they were. The next full run
(export_osm.sh on a fresh DB) replaces the patch.

usage: patch_osm.py osm-area.json changed.json  (Overpass JSON: way[highway](newer:…); out meta geom)
"""
import json, sys
from pyproj import Transformer
from shapely.geometry import LineString

to_utm = Transformer.from_crs(4326, 25832, always_xy=True)
to_wgs = Transformer.from_crs(25832, 4326, always_xy=True)

area_path, changed_path = sys.argv[1:3]
area = json.load(open(area_path))
changed = [e for e in json.load(open(changed_path))['elements'] if e['type'] == 'way']

SURFACE = {'dirt': 'ground', 'earth': 'ground'}


def road_class(t):
    h = t.get('highway')
    if h == 'service':
        return {'alley': 'service_alley', 'driveway': 'service_driveway'}.get(t.get('service'), 'service_road')
    if h == 'footway' and t.get('footway') in ('sidewalk', 'crossing'):
        return 'footway_' + t['footway']
    if h == 'steps':
        return 'footway_steps'
    return h


ids = {e['id'] for e in changed}
before = {w['id'] for w in area['ways']}
kept = [w for w in area['ways'] if w['id'] not in ids or w['tags'].get('bikelane') and not w['tags']['bikelane'].startswith('footwayBicycleYes')]
added = []
for e in changed:
    t = e['tags']
    coords = [[round(p['lon'], 7), round(p['lat'], 7)] for p in e['geometry']]
    tags = dict(highway=road_class(t), name=t.get('name'), surface=SURFACE.get(t.get('surface'), t.get('surface')), ref=t.get('ref'))
    added.append(dict(id=e['id'], tags=tags, coords=coords))
    if t.get('highway') in ('footway', 'path', 'bridleway') and t.get('bicycle') in ('yes', 'designated') and t.get('foot') != 'designated' or \
            t.get('highway') == 'footway' and t.get('bicycle') == 'designated':
        added.append(dict(id=e['id'], tags=dict(tags, bikelane='footwayBicycleYes_adjoiningOrIsolated'), coords=coords))
    elif t.get('highway') == 'path' and t.get('bicycle') == 'designated' and t.get('foot') == 'designated':
        added.append(dict(id=e['id'], tags=dict(tags, bikelane='footAndCyclewayShared_adjoiningOrIsolated'), coords=coords))
    # a cycle track tagged on the road (cycleway:left|right|both=track), as TILDA derives it: its own
    # line beside the road on that side (shared with pedestrians when segregated=no)
    for side, sign in (('left', 1), ('right', -1)):
        if 'track' not in (t.get(f'cycleway:{side}'), t.get('cycleway:both')): continue
        seg = t.get(f'cycleway:{side}:segregated') or t.get('cycleway:both:segregated') or t.get('cycleway:segregated')
        cat = 'footAndCyclewayShared_adjoining' if seg == 'no' else 'cycleway_adjoining'
        g = LineString([to_utm.transform(*c) for c in coords]).offset_curve(sign * 5.0)
        off = [[round(v, 7) for v in to_wgs.transform(*c)] for c in g.coords]
        # TILDA gives such a track only its own surface (cycleway:<side>:surface), never the road's
        surface = t.get(f'cycleway:{side}:surface') or t.get('cycleway:both:surface')
        added.append(dict(id=e['id'], tags=dict(tags, bikelane=cat, surface=SURFACE.get(surface, surface)), coords=off))
area['ways'] = kept + added
json.dump(area, open(area_path, 'w'))
print(f'patched {len(changed)} ways ({sum(1 for e in changed if e["id"] not in before)} new)', file=sys.stderr)
