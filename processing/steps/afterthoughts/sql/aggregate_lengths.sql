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
-- The meters inside the area are computed per feature before grouping (OFFSET 0 keeps the planner
-- from moving the share into the aggregate): otherwise every row carries the area geometry
-- through the sort, which for the nested levels 2-12 (Germany outline × all lines) fills the disk.
kilometers AS (
  SELECT a.id, f.part, f.class, SUM(f.meters) / 1000.0 AS km
  FROM areas a
  CROSS JOIN LATERAL (
    SELECT
      m.part,
      COALESCE(m.tags ->> 'category', m.tags ->> 'road') AS class,
      (m.tags ->> 'length_directions')::FLOAT * tilda_measure_share(a.geom, m.geom) AS meters
    FROM (
      SELECT * FROM tilda_measure_bikelanes(a.geom)
      UNION ALL
      SELECT * FROM tilda_measure_roads(a.geom) WHERE part = 'roads'
    ) m
    WHERE ST_Intersects(a.geom, m.geom)
    OFFSET 0
  ) f
  GROUP BY 1, 2, 3
),
per_area AS (
  SELECT
    id,
    jsonb_object_agg(class, km) FILTER (WHERE part = 'bikelanes') AS bikelane_length,
    jsonb_object_agg(class, km) FILTER (WHERE part = 'roads') AS road_length
  FROM kilometers
  GROUP BY id
)
INSERT INTO aggregated_lengths (id, name, level, geom, regionalschluessel, bikelane_length, road_length)
SELECT
  a.id,
  a.tags ->> 'name',
  a.tags ->> 'admin_level',
  a.geom,
  a.tags ->> 'regionalschluessel',
  p.bikelane_length,
  p.road_length
FROM areas a
LEFT JOIN per_area p ON p.id = a.id
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
