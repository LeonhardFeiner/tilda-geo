#!/usr/bin/env bash
# Build the offline copy of the viewer on this computer, everything straight from the internet
# (README.md). Run it in WSL Ubuntu (or any Linux/macOS shell) from the unpacked starter folder:
#
#   bash build-offline.sh              site, map for Germany (detail: Bayern / Landkreise PAF + FS), Luftbild
#   bash build-offline.sh --deutschland   also all of Germany in full detail (Docker + ~16 GB RAM, ~3 GB)
#
# Can be stopped and run again: what is already downloaded is skipped. Needs python3 (standard
# library only). Takes about an hour, most of it the aerial images (~23,000 tiles, ~800 MB).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
# a step that could not load everything (connection gone for > 10 min) runs again, up to 3 times
PY="retry python3 -I"
retry() {
  local i
  for i in 1 2 3; do
    "$@" && return 0
    echo "-- Verbindungsproblem, neuer Versuch in 60 s ($i/3)"
    sleep 60
  done
  echo "-- Abgebrochen. Später einfach 'bash build-offline.sh' nochmal starten: es geht dort weiter."
  exit 1
}
OFF="$HERE/offline"
mkdir -p "$OFF"

step() { printf '\n== %s (%s)\n' "$1" "$(date +%H:%M)"; }

step "Seiten und Daten (GitHub Pages, ~300 MB)"
$PY fetch_site.py "$HERE/site"

step "Schriften, Symbole, Relief"
$PY fetch_assets.py "$OFF/static"
$PY fetch_tiles.py ne2 "$OFF/ne2.mbtiles" -180 -85 180 85 0 4
$PY fetch_tiles.py ne2 "$OFF/ne2.mbtiles" 0 44 25 58 5 6

if [ "${1:-}" = "--deutschland" ] && [ ! -e "$OFF/.deutschland" ]; then
  step "Hintergrundkarte ganz Deutschland (Planetiler, Docker)"
  command -v docker >/dev/null || { echo "Docker fehlt: in WSL installieren oder ohne --deutschland starten"; exit 1; }
  mkdir -p "$HERE/planetiler"
  [ -s "$HERE/planetiler/germany-latest.osm.pbf" ] ||
    curl -fL -C - -o "$HERE/planetiler/germany-latest.osm.pbf" https://download.geofabrik.de/europe/germany-latest.osm.pbf
  mem_gb=$(awk '/MemTotal/ {print int($2 / 1024 / 1024)}' /proc/meminfo)
  docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx$((mem_gb / 2))g" -v "$HERE/planetiler:/data" \
    ghcr.io/onthegomap/planetiler:latest --osm-path=/data/germany-latest.osm.pbf \
    --download --output=/data/germany.mbtiles --force --storage=mmap
  mv "$HERE/planetiler/germany.mbtiles" "$OFF/basemap.mbtiles"
  rm -rf "$HERE/planetiler"
  touch "$OFF/.deutschland"
elif [ ! -e "$OFF/.deutschland" ]; then
  step "Hintergrundkarte: Deutschland grob, Bayern mittel, Landkreise Pfaffenhofen + Freising im Detail"
  $PY fetch_tiles.py ofm "$OFF/basemap.mbtiles" 5.8 47.2 15.1 55.1 0 10
  $PY fetch_tiles.py ofm "$OFF/basemap.mbtiles" 8.9 47.2 13.9 50.6 11 12
  $PY fetch_tiles.py ofm "$OFF/basemap.mbtiles" 11.26 48.24 12.06 48.84 13 14
fi

step "Luftbild Konzeptgebiet (DOP20, ~800 MB)"
$PY fetch_tiles.py dop "$OFF/dop.mbtiles" 11.52 48.45 11.69 48.575 10 18

step "Fertig. Starten: start-windows.bat doppelklicken (oder: python3 serve.py)"
