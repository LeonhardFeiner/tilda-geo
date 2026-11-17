#!/usr/bin/env bash
# Extract the route lines of the Schweitenkirchen Radwegekonzept from its two vector Lagepläne
# into ../lines.geojson (see ../README.md). Run from anywhere:
#
#   radwege/pipeline/run.sh <folder with the Lageplan PDFs> [<folder for check images>]
#
# Needs poppler-utils (pdftocairo, pdftoppm, pdftotext), the local tilda-geo database (Docker
# container "db", for the OSM roads and paths) and routing/cache/places-de.json
# (routing/extract_places.py). Python env: radwege/.venv from ../requirements.txt.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RADWEGE="$(dirname "$HERE")"
PDFS="${1:?folder with Lageplan_Konzept_*.pdf}"
CHECK="${2:-}"
WORK="$RADWEGE/cache"
PY="$RADWEGE/.venv/bin/python"
mkdir -p "$WORK"

if [ ! -x "$PY" ]; then
  uv venv "$RADWEGE/.venv"
  uv pip install --python "$PY" -r "$RADWEGE/requirements.txt"
fi

# 1. vector paths (SVG), raster for label colours (110 dpi), text layer with boxes
for pair in kurz:Lageplan_Konzept_kurz-_bis_mittelfristig lang:Lageplan_Konzept_mittel-_bis_langfristig; do
  key="${pair%%:*}"
  pdf="$PDFS/${pair#*:}.pdf"
  # The PDFs carry one broken inline image; poppler reports it and goes on.
  pdftocairo -svg "$pdf" "$WORK/$key.svg" 2>/dev/null
  pdftoppm -r 110 -png "$pdf" "$WORK/$key" 2>/dev/null
  pdftotext -bbox-layout "$pdf" "$WORK/$key-bbox.html" 2>/dev/null
  "$PY" -I "$HERE/parse_svg.py" "$WORK/$key.svg" "$WORK/$key-strokes.json"
done
"$PY" -I "$HERE/labels.py" "$WORK" > "$WORK/labels.txt"

# 2. OSM roads, paths and bike lanes around the Gemeinde (local DB) + place nodes
"$HERE/export_osm.sh" "$WORK/osm-area.json"

# 3. plan coordinates → UTM 32 (similarity transform: place labels, then ICP on road centrelines)
"$PY" -I "$HERE/georef.py" "$WORK" "$WORK/osm-area.json"

# 4. routes, Bestand, leftovers, snapped onto OSM
"$PY" -I "$HERE/assign.py" "$WORK" "$WORK/osm-area.json" "$RADWEGE/routes.json" \
  "$WORK/assigned.geojson" "$RADWEGE/lines.geojson" "$RADWEGE/overrides.json" | tee "$WORK/assign.log"

# 5. check against the plan strokes (review aid; see ../README.md)
"$PY" -I "$HERE/verify.py" "$WORK" "$RADWEGE/lines.geojson" "$RADWEGE/routes.json" \
  "$RADWEGE/gemeinde.geojson" > "$WORK/verify.log"
grep -E '^(FLAG|OFF|total|kurz/|lang/)' "$WORK/verify.log" || true

# 6. optional check images: assigned lines (colour per route) and unassigned ones (black) over the plans
if [ -n "$CHECK" ]; then
  mkdir -p "$CHECK"
  "$PY" -I "$HERE/topx.py" "$WORK" "$WORK/assigned.geojson" "$WORK/assigned-px.json"
  "$PY" -I "$HERE/render_check.py" "$WORK" "$WORK/assigned-px.json" "$CHECK"
fi

# the repo's formatter owns the layout of committed JSON (pre-commit hook would change it anyway)
REPO="$(cd "$RADWEGE/../../../.." && pwd)"
(cd "$REPO" && app/node_modules/.bin/oxfmt --write -c app/oxfmt.config.mjs \
  app/scripts/bike-share-map/radwege/lines.geojson app/scripts/bike-share-map/radwege/overrides.json \
  app/scripts/bike-share-map/radwege/gemeinde.geojson >/dev/null)
