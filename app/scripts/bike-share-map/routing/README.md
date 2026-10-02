# Nearest station by bike

`station_access.py` routes along the OSM path network from every rail/tram/ferry station at once
and assigns each 100 m square of Germany to the station it reaches fastest by bike. It feeds the
bike views of the unlisted `naechste-station.html` page and the per-Gemeinde figure in the viewer's
region card.

Run from `app/`:

```sh
# 1. stations + Germany outline (local Postgres)
bun run bike-share-map:stations

# 2. Germany extract from the processing volume (Docker can't mount this network drive,
#    so stream it out)
mkdir -p scripts/bike-share-map/routing/cache
docker run --rm -v tilda-geo_osmfiles:/data:ro alpine cat /data/downloads/germany-latest.osm.pbf \
  > scripts/bike-share-map/routing/cache/germany-latest.osm.pbf

# 3. Python env + routing (~15 min, ~40 GB RAM; the parsed network is cached as
#    cache/bike-network.npz — delete it after replacing the extract)
uv venv scripts/bike-share-map/routing/.venv
uv pip install --python scripts/bike-share-map/routing/.venv/bin/python -r scripts/bike-share-map/routing/requirements.txt
scripts/bike-share-map/routing/.venv/bin/python scripts/bike-share-map/routing/station_access.py

# 4. per-Gemeinde averages (local Postgres), then rebuild the viewer
bun run bike-share-map:station-access
bun run bike-share-map:viewer
```

Writes `output/station-bike-areas.json`, `output/station-bike-bands.json` and
`output/station-access-bike.json` (all committed — CI only rebuilds the viewer from them).
