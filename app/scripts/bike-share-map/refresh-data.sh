#!/usr/bin/env bash
# The data refresh runbook (README.md, "Refreshing the data") as one command. Run from anywhere:
#
#   app/scripts/bike-share-map/refresh-data.sh                  # processing + everything below
#   app/scripts/bike-share-map/refresh-data.sh --skip-processing # DB already has the new run
#   app/scripts/bike-share-map/refresh-data.sh --with-routing    # also stations + travel times (~1 h)
#
# Steps: processing (boundaries, roads_bikelanes; downloads the current Geofabrik extract) →
# export → context datasets → populate-context → build → refit model → format → build → tests.
# It never commits or pushes: check the log, then commit output/** (including the new
# output/history/<date>.json snapshot) and the generated model config.
#
# Schedule it e.g. weekly with cron (Sunday 03:00, log next to the repo):
#   0 3 * * 0  /path/to/tilda-geo/app/scripts/bike-share-map/refresh-data.sh >/dev/null 2>&1
set -uo pipefail

SKIP_PROCESSING=0
WITH_ROUTING=0
for arg in "$@"; do
  case "$arg" in
    --skip-processing) SKIP_PROCESSING=1 ;;
    --with-routing) WITH_ROUTING=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO" || exit 1
LOG="$REPO/refresh-data.log"
exec > >(tee -a "$LOG") 2>&1
log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "ABORT: $*"; exit 1; }
# Plain compose hits the postgres-init.sql bind-mount error on this host (see the memory notes).
DC="docker compose --env-file .env -f docker-compose.db-minimal.yml"
run() { log "→ $*"; ( cd "$REPO/app" && "$@" ) || fail "$*"; }

before=$(docker exec db psql -d postgres -U postgres -Atc "select max(osm_data_from) from meta")
log "start; DB has OSM data from $before"

if [ "$SKIP_PROCESSING" = 0 ]; then
  log "backup aggregated_lengths"
  docker exec db psql -d postgres -U postgres -c \
    "DROP TABLE IF EXISTS aggregated_lengths_backup; CREATE TABLE aggregated_lengths_backup AS SELECT * FROM aggregated_lengths;" \
    || fail "backup"
  log "processing (boundaries, roads_bikelanes)"
  $DC build processing || fail "build processing image"
  $DC run --rm --no-deps -e SKIP_DOWNLOAD=0 -e PROCESS_ONLY_TOPICS=boundaries,roads_bikelanes processing \
    || fail "processing"
fi

after=$(docker exec db psql -d postgres -U postgres -Atc "select max(osm_data_from) from meta")
log "DB now has OSM data from $after"
if [ "$SKIP_PROCESSING" = 0 ] && [ "$after" = "$before" ]; then
  fail "processing did not bring newer OSM data"
fi

run bun run bike-share-map:export-stats-geojson -- --geojson

# Context datasets. Network ones re-read their cached downloads; the DB ones re-join to the export.
for script in calmed-roads mapping-completeness traffic-volumes highway-distance terrain-flatness \
  gemeinde-demographics zensus-housing car-density accidents commuters; do
  run bun run "bike-share-map:$script"
done
if [ "$WITH_ROUTING" = 1 ]; then
  run bun run bike-share-map:stations
  rm -f "$REPO/app/scripts/bike-share-map/routing/cache/"*-grid.npz "$REPO/app/scripts/bike-share-map/routing/cache/network.npz"
  log "copy the OSM extract out of the processing volume"
  docker run --rm -v tilda-geo_osmfiles:/data:ro alpine cat /data/downloads/germany-latest.osm.pbf \
    > "$REPO/app/scripts/bike-share-map/routing/cache/germany-latest.osm.pbf" || fail "copy extract"
  run scripts/bike-share-map/routing/.venv/bin/python scripts/bike-share-map/routing/station_access.py
  run bun run bike-share-map:station-access
  # A Tuesday inside the freshly downloaded timetable (valid about four weeks).
  rm -f "$REPO/app/scripts/bike-share-map/routing/cache/gtfs-de.zip"
  run scripts/bike-share-map/routing/.venv/bin/python scripts/bike-share-map/routing/station_departures.py \
    "$(date -d 'next tuesday' +%Y%m%d)"
fi
run bun run bike-share-map:populate-context

run bun run bike-share-map:viewer
run bun run bike-share-map:fit-model
run bun run format
run bun run bike-share-map:viewer
run bunx vitest run scripts/bike-share-map

log "DONE — OSM data from $after. Nothing committed: review 'git status', then commit output/** (incl. output/history/) and structuralModelConfigs.generated.ts."
