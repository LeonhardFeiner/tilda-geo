# Radinfra-Vergleich (bike-share map)

A static site that shows, for every German administrative region, the share of the road network
with bike infrastructure, computed from OpenStreetMap via TILDA processing. Published to GitHub
Pages from the `local` branch of the fork by `.github/workflows/pages-viewer.yml`.

Everything here runs from `app/` (`bun run bike-share-map:<script>`).

## Layout

| Path                                           | What it is                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `buildViewer.ts`                               | The build: reads `output/*`, writes the site to `output/viewer/`. CI runs this.             |
| `generateViewerHtml.ts`                        | `index.html`: markup, CSS and the inline page script (sections marked `// ====`).           |
| `*.bundle.ts`                                  | Typed modules exposed to the page as globals (`TildaStats`, `RankingDisplay`, …).           |
| `methodologyPage.ts`, `sharePages.ts`, …       | The other pages: `methodik.html`, the per-region share stubs `r/`, `naechste-station.html`. |
| `fetch*.ts`, `populateRegionContextMetrics.ts` | Context datasets, each written to `output/<name>.json` through `fetchCommon.writeDataset`.  |
| `fitExtendedModel.ts`                          | Fits the structural model; writes `structuralModelConfigs.generated.ts`.                    |
| `routing/`                                     | Python: travel time to the nearest station, departures per station (own README).            |
| `vendor/`                                      | MapLibre and d3-delaunay, served from our own origin.                                       |
| `constants.ts`                                 | `VIEWER_FILES` (output file names) and `VIEWER_PASS_THROUGH_DATASETS`.                      |

`output/` is committed except `output/stats.geojson`, `output/viewer/r/`, `output/viewer/daten/`
and `output/viewer/vendor/`, which the build regenerates.

## Refreshing the data

`refresh-data.sh` runs all of the steps below in order (`--skip-processing` if the DB is already
current, `--with-routing` to also refresh stations and travel times). It never commits; its header
has a cron line for a weekly run. The individual steps:

Order matters: every context dataset is joined to the region ids and Regionalschlüssel of the
current export, so run the export first.

1. **Processing run** (local Postgres, a current `germany-latest.osm.pbf`, at least the topics
   `boundaries,roads_bikelanes`). It ends with `aggregate_lengths.sql` and the fork-only
   `aggregate_lengths_by_road.sql`.
2. **Export** (needs the DB): `bun run bike-share-map:export-stats-geojson`. Writes
   `output/stats.msgpack`, `neighbors.*` and `manifest.json` (with `osmDataFrom`). It drops
   foreign and duplicate polygons (`regionScope.ts`) and logs each one.
3. **Context datasets** — re-run what is affected. Each refuses to overwrite its file with a
   result more than 20 % smaller (set `BIKE_SHARE_ALLOW_SHRINK=1` if a drop is real).

   | Needs the DB                                                                                                                                           | Needs only the network (cached in `cache/`)                                        |
   | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
   | `calmed-roads`, `mapping-completeness`, `transit-stop-counts`, `terrain-flatness`, `highway-distance`, `traffic-volumes`, `stations`, `station-access` | `gemeinde-demographics`, `zensus-housing`, `car-density`, `accidents`, `commuters` |

   Then `bun run bike-share-map:populate-context` (needs the DB) for kreisfreie Städte, Kreise and
   Länder. After `stations`, also rerun `routing/station_departures.py`.

4. **Build**: `bun run bike-share-map:viewer`.
5. **Refit the model**: `bun run bike-share-map:fit-model`, then `bun run format`, then build again.
   `fitExtendedModel.test.ts` fails while the committed configs don't match the data.
6. **Check and commit**: `bunx vitest run scripts/bike-share-map`, commit `output/**` and the
   generated config, push to `local`. CI tests, builds and deploys (about 12 minutes).

## Tests

`bunx vitest run scripts/bike-share-map`. Besides unit tests, `generateViewerHtml.test.ts`
parses every inline script and `viewerSmoke.test.ts` boots the real page in jsdom
(`viewerHarness.ts`). The smoke test loads the _built_ bundles in `output/viewer/`, so rebuild
after changing a bundled module.
