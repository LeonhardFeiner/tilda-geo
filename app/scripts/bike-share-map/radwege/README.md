# Radwege tracker data

`routes.json` (hand-maintained) and `lines.geojson` (extracted) feed `radwegePage.ts`; see
"Radwege tracker" in `../README.md`.

## Recording progress

Add an event to the route in `routes.json`: `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `kind`
(steps: Programm, Beschluss, Grunderwerb, Planung, Haushalt, Bau, Eröffnung; context: Aussage,
Ankündigung, Anfrage), a short German `text` (quotes in „…“), `source` and a public `url`
(Komuna RIS links on meeting level: `https://ris.komuna.net/schweitenkirchen/app/sitzungen/<id>`,
TOP number in the text). `uncertain: true` keeps an event out of the group. A listing in the Landkreis's KUS
Maßnahmenliste is an `Ankündigung` (it announces a measure and a horizon; no decision, money or
land), the KUS horizon goes into `kusHorizont`. A Gemeinderat answer that something is _not_
planned is an `Aussage`, not a `Beschluss`. `paywall: true`
marks a source behind a paywall (Pfaffenhofener Kurier Plus): the page shows our own short summary
and the link, never the article text or longer verbatim quotes (UrhG, Presseverleger-Leistungsschutz
§ 87f). Events about the whole network (concept, budget) go into the top-level `allgemein`.
2026-11-18: 51 events added from `schweitenkirchen-research/radwege-schweitenkirchen-2026-11-18.tar.gz`
(`vorgaenge.json`; its `quote` field stays in the research archive). 2026-11-22: 75 events from the
Landkreis-network research (`schweitenkirchen-research/research_notes/Landkreis-Radnetz/`, seven
strands, merge log `MERGED-2026-11-22.md` there): Landkreis investment programmes 2021–2026, the
state's Radweg programmes and the Staatliches Bauamt's Ausbauplan 2025–2030, the Gemeinde's RIS
since 12/2020, Rundschau 2015/16 and older PK articles via the Webarchiv. A finished route gets
`"built": true`. When a published entry changes (kind, date, route), add a line to `korrekturen`:
only for what a reader may have cited (an event's classification or date, a route's status, the
km figures), not for line geometry that changes neither; short, saying what is right now. A
changed rule goes into "So ist die Karte zu lesen" with its date instead. After searching a source again, move its `bis` (and `bisText`) in `quellen`: the page says how far each source was searched, so a quiet stretch reads as "nothing found" only where it was looked at. Update `stand`, then `bun run bike-share-map:viewer`.

## Lines from the Lagepläne

Both Lagepläne are vector PDFs: the routes are coloured strokes (5/1: blue Haupttrassen, cyan
ergänzende, red existing paths; 5/2: blue/cyan, solid = Vollausbau, dashed = existing asphalt
way) in metric CAD coordinates (~1.058 m per unit, no rotation). `pipeline/run.sh`:

1. `parse_svg.py`, `labels.py`: strokes by colour, route labels by colour (text layer + render)
2. `export_osm.sh`: OSM roads/paths/bike lanes from the local DB, place nodes from
   `routing/cache/places-de.json`
3. `georef.py`: similarity transform from place labels, refined by ICP of the plan's Autobahn,
   Staats- and Kreisstraßen against OSM (2026-11-17: median 4.0 m, p90 7.3 m)
4. `assign.py`: each label's route = cheapest path through its colour's line graph between the
   named places; `overrides.json` pins stops where names are not enough (branching routes, ends at
   a road or the Landkreisgrenze, the unlabelled PAF 25 piece); its `adopt` points give a
   leftover piece to a route; `redraw` (cut at `from`, continue along `via`, with the source in
   `why`) fixes an end the plan only sketches; `ohneWeg` (`lines`, `why`) keeps the drawing where the nearest OSM way is not the one meant (the match takes no way within 12 m of those lines, e.g. Oberthann: a path parcel at the forest edge instead of the forest track); `replace` (`coords`, `why`) swaps the whole
   drawing of a built route for its real course, e.g. the Waldroute = OSM relation 16448191 plus
   Liebigstraße, also beyond the Gemeinde (verify.py then lists it as OFF, as intended);
   `line` (`coords`, optional `onto` = a road ref the match is limited to) adds a route the plan
   shows only as context, e.g. the Radweg along the St 2045 to Pfaffenhofen (netz `landkreis`). The
   `planlage.geojson` layer keeps the drawing. `befund` under `kurz|bestand` records what a check on site found where the
   plan draws an existing path: with `from`/`to` that stretch leaves the Bestand and becomes its own
   route (`route`, in `routes.json`) with `ausbau`, laid onto the road `onto` (e.g. the Gehweg in
   Holzhäuseln, no Radweg sign: "Freigabe nötig"); `at` alone puts the `hinweis` on the Bestand
   piece there. The page shows `hinweis` in the popup; add a line to `korrekturen` when it changes a status or the counts. On any other route, `"<plan>|<route>": {"hinweis": [{"at", "text"}]}` puts a note on the pieces within 30 m of `at` (e.g. where the plan draws a path along a Wegeflurstück that is farmland on the ground). Unassigned plan lines ≥ 150 m become `ohne-beschriftung-*`.
   Solid/dashed in 5/2 comes from the gaps along the path: dash gaps are 25–60 units (measured
   40–48), a run between two of them shorter than 250 units is a dash, a longer one solid.
   The plans are schematic (a route is drawn beside the road it uses, parallel lines are pushed
   apart), so each line is map-matched onto OSM: a hidden Markov model over the ways within 90 m
   of each 5 m sample (cost: squared distance, a way running across the line, switching ways and
   sideways jumps; motorways excluded; stays < 25 m dropped). Between two samples on the same way the line follows that way, so a bend away from the drawing (e.g. round a field corner west of Preinersdorf) is not cut off. Where it switches to another way, it goes through their junction if they meet there; if they do not meet and no OSM way runs along the jump (> 25 m, e.g. across the farmyard at Thomashecke), the jump is "no way" (`kein`). Each piece gets the matched way's
   class `weg` (radweg, feldweg, ortsstrasse, kreisstrasse by PAF/FS ref or tertiary,
   staatsstrasse by St/B ref or secondary+, kein) and surface `belag` (asphalt, schotter, natur,
   unbekannt; classified roads count as asphalt); runs < 60 m join their neighbour. `fromPlan` is
   the share with no way near (drawn paler). A plan 5/1 piece on no way or on a Staats-/
   Kreisstraße gets `ausbau: kein-weg` (nothing to release; the page counts it as "Neubau
   nötig"). Built routes keep `freigabe`, and for them (and the red Bestand lines) the matcher
   ignores Staats-/Kreisstraßen without a bike lane and looks only 35 m wide: an existing path
   does not run on the carriageway, so where OSM lacks it (e.g. the Waldroute beside the St 2045
   at Siebenecken) the plan geometry stays. 2026-11-18: 3.3 of ~143 km left without a way.
   2026-11-20: full run on OSM data of 19.11. 21:22 UTC (includes the StreetComplete surveys of
   18./19.11. and the Carl-Benz-Straße shared path, earlier patched in by hand). After a data
   refresh, check that the extract is really the new one (`refresh-data.log`: "DB now has OSM data
   from"): right after Geofabrik publishes, a mirror can still serve the previous day's file.
   Edits newer than the extract can go in before the next one: fetch the changed ways from
   Overpass (`way(bbox)[highway](newer:"<DB OSM date>"); out meta geom;`), apply them with
   `pipeline/patch_osm.py` to a copy of `cache/osm-area.json` and re-run from `assign.py`
   (2026-11-21: 109 ways surveyed or tagged from aerial images that day, Overpass state 21:37 UTC;
   2026-11-23: DB on the extract of 21.11. 21:20 UTC, plus 87 ways changed since, mostly surfaces
   and tracks from a survey ride, Overpass state 13:47 UTC). The next full run replaces the patch.
   It also writes `planlage.geojson`: every plan line as drawn (georeferenced, not matched),
   which the page can show on request ("Lage wie im Plan gezeichnet").
5. `landkreis.py` (runs before `assign.py`): Radvorrangrouten (orange) and Basisradnetz (light
   green) of plan 5/2 as drawn → `cache/landkreis-plan.geojson`. `assign.py` matches them like a
   new route (a drawing beside a Kreis-/Staatsstraße goes onto that road first) →
   `landkreis.geojson` with `weg`/`belag`, and `flur.py` adds `flur`. A context layer on the page
   (the Landkreis plans them as Geh- und Radwege, Erläuterung 2.3.1), coloured like the routes in
   the Wegart/Belag/Grundstück views but not counted. 2026-11-22: 37 of 50 km on Kreis-/
   Staatsstraßen, 0.4 km on an existing Radweg.

"Belag heute" on the page (`belagHeute` in `radwegeStatus.ts`): a piece on a Kreis-/Staatsstraße,
or a new path the plan draws beside a road (`seite`), shows "Nur Fahrbahn, Radweg fehlt" instead
of the road's surface; `lines.geojson` keeps the road's `belag` (Bedarf and the dashed "Vorhanden"
use it).

```sh
scripts/bike-share-map/radwege/pipeline/run.sh \
  ../schweitenkirchen-research/reports ../schweitenkirchen-research/generated/radwege-tracker
```

The second argument writes check images (assigned lines in colour, unassigned in black, over the
plans). Look at them after any change to `routes.json` labels or `overrides.json`.

`pipeline/review.py` ranks the matched lines by signs of a wrong match (detours against the
drawing, distance from it, zigzags) and, with a check folder, draws the top 12
(`matching-review.png`). It only says where to look; someone who knows the area decides. Known
OSM gaps show up as plan geometry ("Kein Weg in OpenStreetMap"); the fix is to map the way in
OSM and re-run the pipeline. Short detours onto ways running across the drawn line (< 150 m)
and stays < 50 m on one way are dropped.

`pipeline/verify.py` (step 6 of `run.sh`, report in `cache/verify.log`) checks the result
against the strokes, independent of `assign.py`: ink share of each 5/2 line (solid ~1, dashed
less), colour, final lines off the plan, plan strokes no line covers or only `ohne-beschriftung`
covers, and length against the concept. 2026-11-18, also checked by eye against both plans:
nothing farther than 65 m from the plan strokes after map matching; uncovered strokes 5/2
0.06 km, 5/1 0.07 km; 5/1 has ~4 km of Ergänzende connectors that carry no label in the plan
either (left as `ohne-beschriftung`). 5/1 lengths differ from the concept table, which gives 5/2 lengths.

## Prüfstellen and road side

`pipeline/check.py` writes `pruefen.geojson`: one point per route and spot where the matching may
be wrong — the line runs through a building (`pipeline/buildings.py`, Overpass, cached), the plan
draws the route at a steady offset beside a road but the match takes another way, the match bends
or turns a corner where the drawing is straight, runs > 45 m from the drawing, two parallel ways
are equally close, or the match runs out and back. Fix a confirmed one with an override.
`assign.py` sets `seite`/`richtung`/`strasse` on new paths (5/2 solid, 5/1 without a way) along
a road: the plans draw such a path on the side of the road where it is to be built.
Before matching, a drawing that runs ≥ 150 m at 8–60 m beside a Kreis-/Staatsstraße, with no
existing path within 8 m of it, is moved onto that road (gaps ≤ 120 m bridged), so the match
follows the road rather than side tracks; the side comes from the original drawing.
Stretches where a match runs out and back along itself are cut out (`drop_spurs`): with the side
offset they would show as a path on both sides of the road. Override `redraw` (`from`, `via`, `why`)
replaces the drawing from one point on; with `radweg` (lon/lat line) the samples along that line take
only cycle paths (e.g. the Schmiedhausen exit, where the drawing lies on the PAF 25 and the Radweg
beside it is short). Override `beside` (`ref`, `max`,
`why`) moves a drawing onto one road where the automatic rule does not apply (e.g. Güntersdorf:
the drawing touches the Blumenstraße only because of its offset from the PAF 6). Override
`andereSeite` (`at`, `radius`, `why`) marks where the plan draws a new path on the side of the road
opposite an existing cycle path that is meant (the plans are schematic): within `radius` of `at` the
drawing goes onto that path, the pieces on it count as `bestand` and carry `andereSeite: true`; add a
`hinweis` there so the popup says so (Oberthann – Schweitenkirchen at Giegenhausen, 2026-11-22). The
Landkreis network always prefers an existing path along its road (`beside_road(to_path=True)`). So do plan 5/1
lines (Freigabe means an existing way, and a cycle path beside the road is one). `osm-zusatz.json`
adds OSM ways TILDA leaves out of its road tables but a route uses (`id`, `highway`, `coords`,
`why`; e.g. the cemetery car park aisle at the Schmiedhauser Straße, `service=parking_aisle`); they
also count as connections between the pieces of a cycle path.
Spots checked by someone (aerial images or on site) go into `overrides.json` as `geprueft`
(`at`, `note`) and drop out of `pruefen.geojson`; with none left, the page hides the Prüfstellen row. `flur.py` (last step) checks the land under each line from open ALKIS data (Tatsächliche Nutzung
shapefiles per Landkreis, Parzellarkarte WMS; © Bayerische Vermessungsverwaltung, CC BY 4.0): on a
road or a narrow path-like parcel (`weg`), on a TN path area that has no parcel of its own
(`genutzt`, TN records the use, also inside field or forest plots), or neither (`kein`). It splits
the lines by class (`flur`), which the page shows as "Grundstück"; new paths are not assessed
there. It says nothing about ownership. `querung.py` writes `querungen.geojson`: where
the drawing of a new path changes the side of a Kreis-/Staatsstraße, a crossing at the junction
where the drawing crosses the road (an assumption, shown as such).
