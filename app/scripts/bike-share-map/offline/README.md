# Offline copy of the viewer

The deployed site, plus its background maps, running on one computer without the internet.

## On the laptop (starter zip, everything downloaded there)

The starter zip (~1 MB: this folder) builds the copy where it is used, straight from the
internet, instead of moving 4 GB over a VPN. In WSL Ubuntu, in the unpacked folder:

```bash
bash build-offline.sh                # ~1.5 GB, about an hour (mostly the aerial images)
bash build-offline.sh --deutschland  # Germany in full detail via Planetiler (Docker, ~16 GB RAM)
```

Stopping and re-running resumes. Then double-click `start-windows.bat`. The site comes file by
file from leonhardfeiner.github.io using `site-files.txt` (written from the Pages artifact,
without the 376 MB of share preview PNGs in `r/`). A page or data file added to the site later
needs a fresh `site-files.txt`; for a newer site, delete `site/` and run the script again.

Starter zip: `zip -j offline-karte-starter.zip README.md build-offline.sh fetch_*.py offline_http.py serve.py
site-files.txt start-windows.bat` (built from a site folder:
`find . -type f ! -path './r/*.png' | sed 's|^\./||' | LC_ALL=C sort > site-files.txt`).

## Folder layout

```
offline-karte/
  serve.py              local web server (Python 3 standard library)
  start-windows.bat     double-click on Windows: WSL python3, else Windows Python
  site/                 the unpacked GitHub Pages artifact (github-pages → artifact.tar)
  offline/
    basemap.mbtiles     "Hell" basemap, OpenMapTiles vector tiles (gzip pbf)
    ne2.mbtiles         shaded relief, low zooms
    dop.mbtiles         DOP20 aerial images (Luftbild on /konzept)
    static/fonts, static/sprites
```

`serve.py` serves `site/` at http://localhost:8000/ and rewrites the basemap and Luftbild URLs
in the HTML it serves to `/offline/…` (the files on disk stay as deployed). Only "Hell" and the
konzept page's Luftbild work offline; the other basemaps still need the internet. Tiles
outside the downloaded area come back empty (HTTP 204).

## Building it

```bash
OUT=…/offline-karte; S=app/scripts/bike-share-map/offline
cp $S/serve.py $S/start-windows.bat $S/README.md $OUT/
# the site: artifact of the latest Pages run (kept 1 day)
gh run download <run id> -R LeonhardFeiner/tilda-geo -n github-pages -D $OUT/dl
mkdir -p $OUT/site && tar -xf $OUT/dl/artifact.tar -C $OUT/site && rm -r $OUT/dl
python3 -I $S/fetch_assets.py $OUT/offline/static
python3 -I $S/fetch_tiles.py ne2 $OUT/offline/ne2.mbtiles -180 -85 180 85 0 4
python3 -I $S/fetch_tiles.py ne2 $OUT/offline/ne2.mbtiles 0 44 25 58 5 6
# basemap: Germany at low zooms, Landkreise Pfaffenhofen + Freising in full detail
python3 -I $S/fetch_tiles.py ofm $OUT/offline/basemap.mbtiles 5.8 47.2 15.1 55.1 0 9
python3 -I $S/fetch_tiles.py ofm $OUT/offline/basemap.mbtiles 11.26 48.24 12.06 48.84 10 14
# aerial images: konzept area (lines.geojson + ~1 km), native DOP20 resolution at zoom 18
python3 -I $S/fetch_tiles.py dop $OUT/offline/dop.mbtiles 11.52 48.45 11.69 48.575 10 18
```

All of Germany in full detail is ~200k tiles: don't scrape OpenFreeMap for that. Build
`basemap.mbtiles` from `germany-latest.osm.pbf` with Planetiler (OpenMapTiles profile, the
schema OpenFreeMap serves) instead; `serve.py` reads its MBTiles as is. 2026-11-25: 8 minutes on
48 cores, 3.3 GB:

```bash
docker run --rm -e JAVA_TOOL_OPTIONS=-Xmx60g -v tilda-geo_osmfiles:/osm:ro -v <work>:/data \
  ghcr.io/onthegomap/planetiler:latest --osm-path=/osm/downloads/germany-latest.osm.pbf \
  --download --output=/data/germany.mbtiles --force
cp <work>/germany.mbtiles $OUT/offline/basemap.mbtiles
```

Attribution: © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors; Luftbild ©
Bayerische Vermessungsverwaltung (CC BY 4.0); Natural Earth (public domain).
