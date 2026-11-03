#!/usr/bin/env bash
# One-off: wait for a Geofabrik extract newer than the OSM edit, then
# re-run processing (boundaries + roads_bikelanes) and rebuild the viewer. Does NOT commit or push.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=rerun-after-midnight.log
exec > >(tee -a "$LOG") 2>&1
DC="docker compose --env-file .env -f docker-compose.db-minimal.yml"  # same as the Oct 1-2 run; plain compose hits the postgres-init.sql bind-mount error
log() { echo "[$(date '+%F %T')] $*"; }
NEED_AFTER="2026-10-15T20:53:03Z"   # LeonhardFeiner's edit v6 of way 375967033 (bicycle=yes, oneway=no)

# The file's own header timestamp is what counts (state.txt and mirrors can lag behind the .pbf).
pbf_ts() {
  local d; d=$(mktemp -d)
  curl -sL -m 120 -r 0-4194303 -o "$d/h.osm.pbf" https://download.geofabrik.de/europe/germany-latest.osm.pbf
  docker run --rm --entrypoint osmium -v "$d:/d:ro" processing:latest fileinfo -g header.option.timestamp /d/h.osm.pbf 2>/dev/null | tail -1
  rm -rf "$d"
}
need=$(date -u -d "$NEED_AFTER" +%s)
log "waiting for a .pbf with header timestamp newer than $NEED_AFTER"
ok=0
for _ in $(seq 1 432); do   # up to 36h, every 5 min
  ts=$(pbf_ts)
  if [ -n "$ts" ] && [ "$(date -u -d "$ts" +%s)" -gt "$need" ]; then log "fresh data in .pbf header: $ts"; ok=1; break; fi
  log "pbf header still at '${ts}'"; sleep 300
done
[ "$ok" = 1 ] || { log "ABORT: no fresh data"; exit 1; }

log "backup aggregated_lengths"
docker exec db psql -d postgres -U postgres -c "DROP TABLE IF EXISTS aggregated_lengths_backup; CREATE TABLE aggregated_lengths_backup AS SELECT * FROM aggregated_lengths;" || exit 1

log "build processing image"
$DC build processing || exit 1

log "processing"
$DC run --rm --no-deps -e SKIP_DOWNLOAD=0 -e PROCESS_ONLY_TOPICS=boundaries,roads_bikelanes processing || { log "ABORT: processing failed"; exit 1; }

got=$(docker exec db psql -d postgres -U postgres -Atc "select max(osm_data_from) from meta")
log "processed OSM data from: $got"
[ "$(date -u -d "$got" +%s)" -gt "$need" ] || { log "ABORT: processing used stale data ($got), skipping export"; exit 1; }

log "export stats + build viewer"
( cd app && bun run bike-share-map:export-stats-geojson -- --geojson && bun run bike-share-map:viewer ) || { log "ABORT: export failed"; exit 1; }
docker exec db psql -d postgres -U postgres -Atc "select max(osm_data_from) from meta"
log "DONE (nothing committed)"
