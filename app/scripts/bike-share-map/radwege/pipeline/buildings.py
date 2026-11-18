"""Building outlines around Schweitenkirchen, for check.py ("line runs through a building"), from
the public Overpass API (one query, ~30 MB; reading them from germany-latest.osm.pbf in Python
takes far too long). Multipolygon buildings are left out (few, mostly large halls).

  buildings.py <out.json>
"""
import json, sys, urllib.parse, urllib.request

OUT = sys.argv[1]
S, W, N, E = 48.40, 11.48, 48.62, 11.78
query = f'[out:json][timeout:120];way["building"]({S},{W},{N},{E});out geom;'
req = urllib.request.Request('https://overpass-api.de/api/interpreter',
                             data=urllib.parse.urlencode({'data': query}).encode(),
                             headers={'User-Agent': 'radwege-tracker-check'})
d = json.load(urllib.request.urlopen(req, timeout=180))
out = []
for el in d['elements']:
    g = el.get('geometry') or []
    if el['type'] != 'way' or len(g) < 4 or g[0] != g[-1]:
        continue
    out.append(dict(id=el['id'], building=el.get('tags', {}).get('building'),
                    coords=[(round(p['lon'], 7), round(p['lat'], 7)) for p in g]))
print('buildings', len(out), file=sys.stderr)
json.dump(dict(buildings=out), open(OUT, 'w'), separators=(',', ':'))
