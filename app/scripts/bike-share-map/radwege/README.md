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
   a road or the Landkreisgrenze, the unlabelled PAF 25 piece). Unassigned plan lines ≥ 150 m
   become `ohne-beschriftung-*`. Lines are snapped to OSM ways within 15 m; `fromPlan` is the
   share left in plan geometry (drawn paler on the page).

```sh
scripts/bike-share-map/radwege/pipeline/run.sh \
  ../schweitenkirchen-research/reports ../schweitenkirchen-research/generated/radwege-tracker
```

The second argument writes check images (assigned lines in colour, unassigned in black, over the
plans). Look at them after any change to `routes.json` labels or `overrides.json`.
