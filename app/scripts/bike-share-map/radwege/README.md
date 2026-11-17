# Radwege tracker data

`routes.json` (hand-maintained) and `lines.geojson` (extracted) feed `radwegePage.ts`; see
"Radwege tracker" in `../README.md`.

## Recording progress

Add an event to the route in `routes.json`: `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `kind`
(steps: Programm, Beschluss, Grunderwerb, Planung, Haushalt, Bau, Eröffnung; context: Aussage,
Ankündigung, Anfrage), a short German `text` (quotes in „…“), `source` and a public `url`
(Komuna RIS links on meeting level: `https://ris.komuna.net/schweitenkirchen/app/sitzungen/<id>`,
TOP number in the text). `uncertain: true` keeps an event out of the group. A finished route gets
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
   40–48), a run between two of them shorter than 250 units is a dash, a longer one solid. Lines are snapped to OSM ways within 15 m; `fromPlan` is the
   share left in plan geometry (drawn paler on the page).

```sh
scripts/bike-share-map/radwege/pipeline/run.sh \
  ../schweitenkirchen-research/reports ../schweitenkirchen-research/generated/radwege-tracker
```

The second argument writes check images (assigned lines in colour, unassigned in black, over the
plans). Look at them after any change to `routes.json` labels or `overrides.json`.

`pipeline/verify.py` (last step of `run.sh`, report in `cache/verify.log`) checks the result
against the strokes, independent of `assign.py`: ink share of each 5/2 line (solid ~1, dashed
less), colour, final lines off the plan, plan strokes no line covers or only `ohne-beschriftung`
covers, and length against the concept. 2026-11-18, checked by eye against both plans as well:
off-plan 0.5 km (OSM snapping at three route ends); uncovered 5/2 strokes 0.14 km, 5/1 0.8 km
(short pieces, e.g. the last two dashes of Dietersdorf – Schweitenkirchen west of the PAF 25);
5/1 has ~5.5 km of Ergänzende connectors that carry no label in the plan either (left as
`ohne-beschriftung`). 5/1 lengths differ from the concept table, which gives 5/2 lengths.
