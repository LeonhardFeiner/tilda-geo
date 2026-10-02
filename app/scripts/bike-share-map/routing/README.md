# Nearest station on foot, by bike and by car

`station_access.py` routes along the OSM network from every rail/tram/ferry station at once and
assigns each 100 m square of Germany to the station it reaches fastest — once per mode, each on its
own network (foot, bike, car), plus the straight-line distance. It feeds the unlisted
`naechste-station.html` page and the "Ø zur nächsten Haltestelle" line in the viewer's region card.

Run from `app/`:

```sh
# 1. stations + Germany outline (local Postgres)
bun run bike-share-map:stations

# 2. Germany extract from the processing volume (Docker can't mount this network drive,
#    so stream it out)
mkdir -p scripts/bike-share-map/routing/cache
docker run --rm -v tilda-geo_osmfiles:/data:ro alpine cat /data/downloads/germany-latest.osm.pbf \
  > scripts/bike-share-map/routing/cache/germany-latest.osm.pbf

# 3. Python env + routing (~30 min for all modes, ~25 GB RAM). The parsed network is cached as
#    cache/network.npz and each mode's routed grid as cache/<mode>-grid.npz — delete them after
#    replacing the extract or changing a profile. Modes can be given: station_access.py car
uv venv scripts/bike-share-map/routing/.venv
uv pip install --python scripts/bike-share-map/routing/.venv/bin/python -r scripts/bike-share-map/routing/requirements.txt
scripts/bike-share-map/routing/.venv/bin/python scripts/bike-share-map/routing/station_access.py

# 4. per-Gemeinde averages (local Postgres), then rebuild the viewer
bun run bike-share-map:station-access
bun run bike-share-map:viewer
```

Writes `output/station-access/<mode>-{areas,minutes,km}.json` and `output/station-access.json`
(all committed — CI only rebuilds the viewer from them).

## Departures per station (dot size)

`station_departures.py` counts departures per station on one weekday (default Tue 2026-09-29;
pass `YYYYMMDD`) from the nationwide GTFS timetable (gtfs.de, DELFI e.V., CC BY 4.0 — downloaded
to `cache/gtfs-de.zip`, ~300 MB, valid about four weeks: pick a date inside the feed) and matches
them to `output/stations.json`. Rail/subway/tram/ferry only. Writes
`output/station-departures.json` (committed); `buildViewer.ts` only uses it when it was computed
for the current `stations.json` — rerun it after `bun run bike-share-map:stations`.

```sh
scripts/bike-share-map/routing/.venv/bin/python scripts/bike-share-map/routing/station_departures.py
```
