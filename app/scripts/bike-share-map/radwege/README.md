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
(`vorgaenge.json`; its `quote` field stays in the research archive). A finished route gets
`"built": true`. When a published entry changes (kind, date, route), add a line to `korrekturen`. After searching a source again, move its `bis` (and `bisText`) in `quellen`: the page says how far each source was searched, so a quiet stretch reads as "nothing found" only where it was looked at. Update `stand`, then `bun run bike-share-map:viewer`.

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
   `why`) fixes an end the plan only sketches; `replace` (`coords`, `why`) swaps the whole
   drawing of a built route for its real course, e.g. the Waldroute = OSM relation 16448191 plus
   Liebigstraße, also beyond the Gemeinde (verify.py then lists it as OFF, as intended);
   `line` (`coords`, optional `onto` = a road ref the match is limited to) adds a route the plan
   shows only as context, e.g. the Radweg along the St 2045 to Pfaffenhofen (netz `landkreis`). The
   `planlage.geojson` layer keeps the drawing. `befund` under `kurz|bestand` records what a check on site found where the
   plan draws an existing path: with `from`/`to` that stretch leaves the Bestand and becomes its own
   route (`route`, in `routes.json`) with `ausbau`, laid onto the road `onto` (e.g. the Gehweg in
   Holzhäuseln, no Radweg sign: "Freigabe nötig"); `at` alone puts the `hinweis` on the Bestand
   piece there. The page shows `hinweis` in the popup; add a line to `korrekturen` as well. Unassigned plan lines ≥ 150 m become `ohne-beschriftung-*`.
   Solid/dashed in 5/2 comes from the gaps along the path: dash gaps are 25–60 units (measured
   40–48), a run between two of them shorter than 250 units is a dash, a longer one solid.
   The plans are schematic (a route is drawn beside the road it uses, parallel lines are pushed
   apart), so each line is map-matched onto OSM: a hidden Markov model over the ways within 90 m
   of each 5 m sample (cost: squared distance, a way running across the line, switching ways and
   sideways jumps; motorways excluded; stays < 25 m dropped). Each piece gets the matched way's
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
   It also writes `planlage.geojson`: every plan line as drawn (georeferenced, not matched),
   which the page can show on request ("Lage wie im Plan gezeichnet").
5. `landkreis.py`: Radvorrangrouten (orange) and Basisradnetz (light green) of plan 5/2 →
   `landkreis.geojson`, a context layer on the page (the Landkreis plans them as Geh- und
   Radwege, Erläuterung 2.3.1).

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
offset they would show as a path on both sides of the road. Override `beside` (`ref`, `max`,
`why`) moves a drawing onto one road where the automatic rule does not apply (e.g. Güntersdorf:
the drawing touches the Blumenstraße only because of its offset from the PAF 6).
Spots checked by someone (aerial images or on site) go into `overrides.json` as `geprueft`
(`at`, `note`) and drop out of `pruefen.geojson`; with none left, the page hides the Prüfstellen row. `querung.py` writes `querungen.geojson`: where
the drawing of a new path changes the side of a Kreis-/Staatsstraße, a crossing at the junction
where the drawing crosses the road (an assumption, shown as such).
