# Radinfra-Vergleich (bike-share map)

A static site that shows, for every German administrative region, the share of the road network
with bike infrastructure, computed from OpenStreetMap via TILDA processing. Published to GitHub
Pages from the `local` branch of the fork by `.github/workflows/pages-viewer.yml`.

Everything here runs from `app/` (`bun run bike-share-map:<script>`).

## Layout

| Path                                           | What it is                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `buildViewer.ts`                               | The build: reads `output/*`, writes the site to `output/viewer/`. CI runs this.                            |
| `generateViewerHtml.ts`                        | `index.html`: markup, CSS and the inline page script (sections marked `// ====`).                          |
| `*.bundle.ts`                                  | Typed modules exposed to the page as globals (`TildaStats`, `RankingDisplay`, …).                          |
| `minifyPageHtml.ts`                            | The build's last step: minifies the inline scripts of the served pages (`BIKE_SHARE_NO_MINIFY=1` to skip). |
| `../stats-export/statsRegionPack.ts`           | The `stats-*.msgpack` format (v3: columns + shared-border topology in `statsTopology.ts`).                 |
| `methodologyPage.ts`, `sharePages.ts`, …       | The other pages: `methodik.html`, the per-region share stubs `r/`, `station.html`.                         |
| `fetch*.ts`, `populateRegionContextMetrics.ts` | Context datasets, each written to `output/<name>.json` through `fetchCommon.writeDataset`.                 |
| `fitExtendedModel.ts`                          | Fits the structural model; writes `structuralModelConfigs.generated.ts`.                                   |
| `routing/`                                     | Python: travel time to the nearest station, departures per station (own README).                           |
| `fetchDetourGraph.ts`, `detour*.ts`            | Detour map `umweg.html`: per-Landkreis routing graph, browser routing, page (see below).                   |
| `vendor/`                                      | MapLibre and d3-delaunay, served from our own origin.                                                      |
| `siteIcon.ts`                                  | Favicon, touch icon, header logo (BFS/SPD/Grüne chevrons + bike); `icon.svg` by build.                     |
| `constants.ts`                                 | `VIEWER_FILES` (output file names) and `VIEWER_PASS_THROUGH_DATASETS`.                                     |

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

   | Needs the DB                                                                                                                                           | Needs only the network (cached in `cache/`)                                                                         |
   | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
   | `calmed-roads`, `mapping-completeness`, `transit-stop-counts`, `terrain-flatness`, `highway-distance`, `traffic-volumes`, `stations`, `station-access` | `gemeinde-demographics`, `zensus-housing`, `car-density`, `accidents`, `commuters`, `regiostar`, `deutschlandatlas` |

   Then `bun run bike-share-map:populate-context` (needs the DB) for kreisfreie Städte, Kreise and
   Länder. After `stations`, also rerun `routing/station_departures.py`.

4. **Build**: `bun run bike-share-map:viewer`.
5. **Refit the model**: `bun run bike-share-map:fit-model`, then `bun run format`, then build again.
   `fitExtendedModel.test.ts` fails while the committed configs don't match the data.
6. **Check and commit**: `bunx vitest run scripts/bike-share-map`, commit `output/**` and the
   generated config, push to `local`. CI tests, builds and deploys to github.io (about 12
   minutes). The BFS subdomain (`radweg.bfschweitenkirchen.de`) only changes on a release:
   publish a GitHub Release on the fork, or run the workflow by hand with `mirror` ticked
   (`gh workflow run pages-viewer.yml --ref local -f mirror=true`). The mirror is the same build,
   local pages included (`/konzept`, `/station`, `/umweg`; GitHub Pages serves `x.html` at `/x`),
   but unlinked there: the `viewer-detour` and `viewer-local-pages` metas are flipped to `off`.
   The old name `radwege-schweitenkirchen.html` is a redirect stub
   (`PAGE_REDIRECTS` in `constants.ts`). Debug on github.io first. The
   workflow fails before uploading if the deploy folder exceeds 900 MB (GitHub Pages allows 1 GB;
   it is ~570 MB now), and the built `output/viewer/manifest.json` adds a `datasets` field with
   each context dataset's `fetchedAt`/`osmDataFrom`/`source` stamps next to the export's fields.

## Tests

`bunx vitest run scripts/bike-share-map`. Besides unit tests, `generateViewerHtml.test.ts`
parses every inline script and `viewerSmoke.test.ts` boots the real page in jsdom
(`viewerHarness.ts`). The smoke test loads the _built_ bundles in `output/viewer/`, so rebuild
after changing a bundled module.

## Visit counts

Page views on `radweg.bfschweitenkirchen.de` go to GoatCounter (cookie-less, no stored IPs):
dashboard at `https://radweg-bfs.goatcounter.com`. `visitCounter.ts` adds the loader to the
viewer, Methodik, Impressum, station and detour pages; it only runs on that host, so github.io and
local builds never count. The share stubs under `r/` aren't counted (they redirect straight into
the viewer, which counts). Changing the site code or host: `visitCounter.ts`, and the Datenschutz
text in `legalPage.ts` describes the counting.

## Detour map (`umweg.html`)

Pick a place in a Landkreis and compare, for every other place, the fastest car road with a bike
route that avoids traffic (extra km, climb, minutes; a slider sets how much traffic is avoided).
Routing runs in the browser on one graph per Landkreis (`output/detour/<id>.msgpack`, ~1.4 MB
gzipped for Pfaffenhofen, committed); `output/detour/index.json` lists the Landkreise, and the
region card of their Gemeinden links to the page. Method on `methodik.html#umweg`.

```sh
# once per OSM extract: all place nodes (~1 min, needs routing/cache/germany-latest.osm.pbf)
scripts/bike-share-map/routing/.venv/bin/python scripts/bike-share-map/routing/extract_places.py
# per Landkreis (local DB, ~5 s; terrain tiles are cached in cache/terrarium/)
bun run bike-share-map:detour-graph -- --landkreis relation/62371
bun run bike-share-map:viewer
```

The stress model and cost formula live in `detourRouting.ts` (tested in `detourRouting.test.ts`);
after changing it, rebuild the viewer before running `detourPage.test.ts` — the page test loads
the built `detourRouting.js`.

## Radwege tracker (`konzept.html`, served at `/konzept`)

Every route of the Schweitenkirchen Radwegekonzept (WipflerPLAN, 07.06.2024, Lagepläne 5/1 and
5/2) on a map, with what has publicly happened to it. One plan at a time; a bar of the progress
groups is summary, legend and filter at once; "Neueste Vorgänge" lists the latest events; network,
Baulastträger and the route list sit under "Mehr Filter". A click on a line replaces the overview
with the route: status, latest event, announced date, then the timeline and the sources.
"Ansicht: Dauer" (`?ansicht=dauer`) shows, for the routes the filters let through, a solid bar from the
first to the last certain step (or the opening), pale from there to `stand`, the KUS-announced year dashed after it
(`announcedYear`), and the routes without a step counted from the concept date.
Unlisted and `noindex`; the mirror job in `pages-viewer.yml` deletes the page and its data.

- `radwege/routes.json`: the routes and their dated events (each with a public URL), transcribed
  from schweitenkirchen-research (`Radwege-Schweitenkirchen-Aussagen-der-Gemeinde.md`). Edit
  this to record progress; the build validates it (`radwegeData.ts`).
- `radwege/lines.geojson`: the route lines, extracted from the vector Lagepläne
  (`radwege/README.md`). Regenerate only when the plans or the route list change.
- `radwege/gemeinde.geojson`: the Gemeinde boundary drawn as context (written by the extraction).
- The group of a line is derived, never typed in (`radwegeStatus.ts`): built → "Vorhanden"; else
  the latest certain step (Programm, Beschluss, Grunderwerb, Planung, Haushalt, Bau, Eröffnung)
  on/after 07.06.2024 → "Schritte seit dem Konzept", before it → "Nur Schritte vor dem Konzept"
  (a partial date counts as "since" only if all of it lies after), none → "Kein Schritt
  gefunden". The latest step, not the first, so a route with one Beschluss in 2019 and nothing
  since does not look like it is moving. "Was zu tun ist" (`?farbe=bedarf`) is the separate
  question of what the plan needs: lines on an existing way (plan 5/1, dashed in 5/2) only need a
  Freigabe, split by the surface the way keeps (asphalt / unbefestigt / nicht erfasst, from OSM; a
  dashed 5/2 line without an OSM surface counts as asphalt, as its legend says), the rest "Aus-
  oder Neubau nötig" (solid in 5/2, and 5/1 pieces that follow no way or only a
  Staats-/Kreisstraße). There is no "Belag/Wegart geplant" mode on purpose: 5/1 paves nothing and
  5/2 only recommends asphalt for new paths, so it would repeat this view; the map popup says per
  piece what the plan says (`PLAN_SAYS`). A "Vorhanden" line that is no usable cycle path is
  dashed in both views and listed apart in the totals (`vorhandenOhneRadweg`): usable is a path of
  its own, signed or not, or an asphalt farm track; not usable is the carriageway, gravel/earth
  (the Waldroute) or no OSM way. The Landkreis network of plan 5/2
  (`radwege/landkreis.geojson`) is a context layer, on by default with plan 5/2
  and "Beide" and off with 5/1 (the Lageplan 5/1 does not draw it); `?landkreis=an|aus` overrides
  that until the plan changes.
- Numbers and map stop at the Gemeinde boundary by default (`?gemeinde=alle` shows the parts
  outside). Above the bar: the total km, number of routes, plan and scope (in the OSM modes also
  "laut OpenStreetMap"); each group with km only, the shares are in the bar (tooltip). The checking
  aids (Unsichere Stellen, Lage wie im Plan) sit in "Mehr Filter"; a link with one on opens it.
- `baulast` is who builds and maintains; `grunderwerb` who buys the land, where a source says so
  (often the Gemeinde for a Radweg along a Kreis- or Staatsstraße). The detail view shows both.
- `korrekturen` in `routes.json`: dated corrections, listed under "Wer steht dahinter?" with the
  author's disclosure and the contact for errors. Add one whenever a published entry changes.
- "Neueste Vorgänge" shows the latest 8; `?seit=YYYY-MM-DD` (or the link under the list) every
  event since that date.
- "Einfärben nach" (`?farbe=weg|belag`, filter `?nur=`) colours bar, legend and lines by what
  the route runs on today instead: OSM way class (`WEG`) or surface (`BELAG`), from the map
  matching in `radwege/pipeline/assign.py`.
- "Plan: Beide" (`?plan=beide`) shows each stretch once: Bestand, then plan 5/2, then what plan
  5/1 adds where neither lies within 30 m (`kombi`); with "Trassen" set to Haupt or ergänzend, only the 5/2 lines of that kind count
  (`kombiHaupt`, `kombiErgaenzend`), since a route can be Haupttrasse in one plan and ergänzend in
  the other (Dietersdorf–Schweitenkirchen). "Nur innerhalb der Gemeindegrenze"
  (`?gemeinde=innen`) hides what lies outside (`innen`) from map and all numbers. Both flags come
  from cutting the lines in `radwegeData.ts` (`radwegeGeometry.ts`).
- "Trassen" (`?netz=haupt|ergaenzend`): only the Haupt- or only the ergänzende Trassen (the
  latter also without the Landkreis route); Bestand always shows. "Ansicht: Luftbild"
  (`?ansicht=luftbild`): DOP20 orthophotos of the Bayerische Vermessungsverwaltung (open data). A new path beside a road is drawn offset to the side the plan
  draws it on (`seite`, `richtung`, `strasse` from `assign.py`). "Prüfstellen" (`?pruefen=an`,
  `radwege/pruefen.geojson` from `pipeline/check.py`) marks where the matching may be wrong.
  Statements, citizen questions, announcements and events marked `uncertain` never count.

`buildViewer.ts` writes the page and `konzept.json`; tests:
`radwegeStatus.test.ts`, `radwegePage.test.ts` (jsdom, needs the built data file).
