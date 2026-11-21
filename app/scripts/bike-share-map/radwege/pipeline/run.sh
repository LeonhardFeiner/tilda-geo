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

# 5. the Landkreis network that plan 5/2 shows (Radvorrangrouten, Basisradnetz), context layer
"$PY" -I "$HERE/landkreis.py" "$WORK" "$RADWEGE/landkreis.geojson"

# 6. check against the plan strokes (review aid; see ../README.md)
"$PY" -I "$HERE/verify.py" "$WORK" "$RADWEGE/lines.geojson" "$RADWEGE/routes.json" \
  "$RADWEGE/gemeinde.geojson" > "$WORK/verify.log"
grep -E '^(FLAG|OFF|total|kurz/|lang/)' "$WORK/verify.log" || true

# 7. rank the lines by signs of a wrong map matching (detours, distance from the drawing, zigzags)
"$PY" -I "$HERE/review.py" "$WORK" "$RADWEGE/lines.geojson" "$RADWEGE/planlage.geojson" \
  ${CHECK:+"$CHECK/matching-review.png"} > "$WORK/review.log"
head -8 "$WORK/review.log"

# 7b. spots for a local check (through a building, beside a road but matched elsewhere, bend
# where the drawing is straight, …) → pruefen.geojson, a layer of the page. Buildings come from
# Overpass (cached; delete cache/buildings.json to refresh).
[ -s "$WORK/buildings.json" ] || "$PY" -I "$HERE/buildings.py" "$WORK/buildings.json"
"$PY" -I "$HERE/check.py" "$WORK" "$RADWEGE/lines.geojson" "$WORK/buildings.json" "$RADWEGE/pruefen.geojson"
# where the plan changes the side of a road: crossings (an assumption the page labels as such)
"$PY" -I "$HERE/querung.py" "$WORK" "$RADWEGE/lines.geojson" "$RADWEGE/pruefen.geojson" "$RADWEGE/querungen.geojson"

# 7c. land under each line (ALKIS Tatsächliche Nutzung + Parzellarkarte, CC BY 4.0): splits the
# lines by class (`flur`), so it runs last. TN per Landkreis (Pfaffenhofen, Freising), downloaded once.
for kreis in 09186 09178; do
  d="$WORK/alkis/tn_$kreis"
  if [ ! -s "$d/Nutzung.shp" ]; then
    mkdir -p "$d"
    curl -fsS -A "radwege-tracker/1.0" -o "$d.zip" "https://download1.bayernwolke.de/a/tn/lkr/tn_$kreis.zip"
    unzip -o -q "$d.zip" -d "$d" && rm "$d.zip"
  fi
done
"$PY" -I "$HERE/flur.py" "$WORK" "$RADWEGE/lines.geojson" "$RADWEGE/lines.geojson"

# 8. optional check images: assigned lines (colour per route) and unassigned ones (black) over the plans
if [ -n "$CHECK" ]; then
  mkdir -p "$CHECK"
  "$PY" -I "$HERE/topx.py" "$WORK" "$WORK/assigned.geojson" "$WORK/assigned-px.json"
  "$PY" -I "$HERE/render_check.py" "$WORK" "$WORK/assigned-px.json" "$CHECK"
fi

# the repo's formatter owns the layout of committed JSON (pre-commit hook would change it anyway)
REPO="$(cd "$RADWEGE/../../../.." && pwd)"
(cd "$REPO" && app/node_modules/.bin/oxfmt --write -c app/oxfmt.config.mjs \
  app/scripts/bike-share-map/radwege/lines.geojson app/scripts/bike-share-map/radwege/overrides.json \
  app/scripts/bike-share-map/radwege/gemeinde.geojson app/scripts/bike-share-map/radwege/landkreis.geojson \
  app/scripts/bike-share-map/radwege/planlage.geojson app/scripts/bike-share-map/radwege/pruefen.geojson \
  app/scripts/bike-share-map/radwege/querungen.geojson >/dev/null)
