# Radwege tracker data

`routes.json` (hand-maintained) and `lines.geojson` (extracted) feed `radwegePage.ts`; see
"Radwege tracker" in `../README.md`.

## Recording progress

Add an event to the route in `routes.json`: `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `kind`
(steps: Programm, Beschluss, Grunderwerb, Planung, Haushalt, Bau, Eröffnung; context: Aussage,
Ankündigung, Anfrage), a short German `text` (quotes in „…“), `source` and a public `url`
(Komuna RIS links on meeting level: `https://ris.komuna.net/schweitenkirchen/app/sitzungen/<id>`,
TOP number in the text). `uncertain: true` keeps an event out of the group. `paywall: true`
marks a source behind a paywall (Pfaffenhofener Kurier Plus): the page shows our own short summary
and the link, never the article text or longer verbatim quotes (UrhG, Presseverleger-Leistungsschutz
§ 87f). Events about the whole network (concept, budget) go into the top-level `allgemein`.
2026-11-18: 51 events added from `schweitenkirchen-research/radwege-schweitenkirchen-2026-11-18.tar.gz`
(`vorgaenge.json`; its `quote` field stays in the research archive). A finished route gets
`"built": true`. Update `stand`, then `bun run bike-share-map:viewer`.

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
   leftover piece to a route. Unassigned plan lines ≥ 150 m become `ohne-beschriftung-*`.
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
   nötig"). Built routes keep `freigabe`. 2026-11-18: 3.3 of ~143 km left without a way.
5. `landkreis.py`: Radvorrangrouten (orange) and Basisradnetz (light green) of plan 5/2 →
   `landkreis.geojson`, a context layer on the page (the Landkreis plans them as Geh- und
   Radwege, Erläuterung 2.3.1).

```sh
scripts/bike-share-map/radwege/pipeline/run.sh \
  ../schweitenkirchen-research/reports ../schweitenkirchen-research/generated/radwege-tracker
```

The second argument writes check images (assigned lines in colour, unassigned in black, over the
plans). Look at them after any change to `routes.json` labels or `overrides.json`.

`pipeline/verify.py` (last step of `run.sh`, report in `cache/verify.log`) checks the result
against the strokes, independent of `assign.py`: ink share of each 5/2 line (solid ~1, dashed
less), colour, final lines off the plan, plan strokes no line covers or only `ohne-beschriftung`
covers, and length against the concept. 2026-11-18, also checked by eye against both plans:
nothing farther than 65 m from the plan strokes after map matching; uncovered strokes 5/2
0.06 km, 5/1 0.07 km; 5/1 has ~4 km of Ergänzende connectors that carry no label in the plan
either (left as `ohne-beschriftung`). 5/1 lengths differ from the concept table, which gives 5/2 lengths.
