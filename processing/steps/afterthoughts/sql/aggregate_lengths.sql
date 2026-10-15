/* sql-formatter-disable */
-- WHAT IT DOES:
-- Statistik: kilometers of bikelanes (per category) and roads (per road class) for every
-- boundary, into public.aggregated_lengths (table shell: initialize_aggregated_lengths.sql).
-- A line that crosses a boundary counts on each side with the share of its length that lies there
-- (processing/measure/measure_functions.sql).
-- Kilometers are per direction: a line that is not oneway counts twice (`length_directions`).
-- INPUT: public.boundaries (admin_level 2-12), datasets `bikelanes` and `roads` (part roads only)
-- OUTPUT: public.aggregated_lengths (bikelane_length, road_length: {class: km}); read by /api/stats
--
-- Fork (bike-share-map) differences to upstream:
-- * Upstream aggregates admin levels 4 & 6 only. The viewer also needs 2-3, 5, 7-9
--   (Gemeinde/Gemeindebezirk) and the city levels 10-12 (Stadtteile, Quartiere); this only runs
--   against the local processing DB, and the viewer export decides which levels get shipped.
-- * Kilometers stay fractional (upstream rounds to whole km, which turns most Quartiere into 0).
-- * Re-runs also refresh name, level and geom.
-- aggregate_lengths_by_road.sql runs after this and splits these sums further.
--
DO $$ BEGIN
  RAISE NOTICE '[Afterthoughts][Statistics] Populate aggregated_lengths at %',
    clock_timestamp() AT TIME ZONE 'Europe/Berlin';
END $$;

WITH
areas AS (
  SELECT id, tags, geom FROM boundaries
  WHERE tags ->> 'admin_level' IN ('2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12')
),
kilometers AS (
  SELECT
    a.id,
    f.part,
    COALESCE(f.tags ->> 'category', f.tags ->> 'road') AS class,
    SUM(
      (f.tags ->> 'length_directions')::FLOAT
      * tilda_measure_share(a.geom, f.geom)
    ) / 1000.0 AS km
  FROM areas a
  CROSS JOIN LATERAL (
    SELECT * FROM tilda_measure_bikelanes(a.geom)
    UNION ALL
    SELECT * FROM tilda_measure_roads(a.geom) WHERE part = 'roads'
  ) f
  WHERE ST_Intersects(a.geom, f.geom)
  GROUP BY 1, 2, 3
)
INSERT INTO aggregated_lengths (id, name, level, geom, regionalschluessel, bikelane_length, road_length)
SELECT
  a.id,
  a.tags ->> 'name',
  a.tags ->> 'admin_level',
  a.geom,
  a.tags ->> 'regionalschluessel',
  (SELECT jsonb_object_agg(k.class, k.km) FROM kilometers k WHERE k.id = a.id AND k.part = 'bikelanes'),
  (SELECT jsonb_object_agg(k.class, k.km) FROM kilometers k WHERE k.id = a.id AND k.part = 'roads')
FROM areas a
ON CONFLICT (id)
  DO UPDATE SET
    name = EXCLUDED.name,
    level = EXCLUDED.level,
    geom = EXCLUDED.geom,
    regionalschluessel = EXCLUDED.regionalschluessel,
    bikelane_length = EXCLUDED.bikelane_length,
    road_length = EXCLUDED.road_length;

DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT count(*) INTO row_count FROM public.aggregated_lengths;
  RAISE NOTICE '[Afterthoughts][Statistics] Populated % rows at %',
    row_count,
    clock_timestamp() AT TIME ZONE 'Europe/Berlin';
END $$;
