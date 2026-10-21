-- Fork-only afterthought (bike-share-map viewer): run after aggregate_lengths.sql.
-- Attributes bike infrastructure to the road it runs along, so the viewer can show
-- "share of main roads with bike infrastructure" and who is responsible for those roads.
--
-- aggregated_lengths gains two JSONB columns (km, measured like aggregate_lengths.sql: oneway rule
-- from tilda_measure_directions, a line counts in an area by the share of its length inside it;
-- so road_length_by_authority sums to road_length; bikelane_length_by_road can be lower than
-- bikelane_length where matched bike km were capped at their road's length). Keys are
-- '<roads.tags.road key>|<authority>', authority one of autobahn | bund | land | kreis | gemeinde:
--   road_length_by_authority   road km per road key and authority
--   bikelane_length_by_road    bike km per road (key and authority) it runs along,
--                              plus 'independent' for ways not along a road
--
-- Attribution:
--   * on-road lanes (have _parent_highway): road key from their own `road` tag (exact);
--     authority from the nearest road within 20 m
--   * separate ways with _is_sidepath = assumed_no: 'independent' (not along a road)
--   * other separate ways: nearest road within 30 m, else 'independent'. Where TILDA's sidepath
--     processing named the road class the way runs along (`adjoining_road`, from is_sidepath:of or
--     the sidepath estimation CSV), the nearest road of that class wins, so a path along a
--     Kreisstraße doesn't snap to a closer parallel or crossing residential street.
-- Bike ways are matched in ~100 m pieces (a long path can run along several roads); each piece
-- is matched by its midpoint and counts in an area by its share, like any other line.
-- Authority comes from the road number (roads.tags.name_ref): A → autobahn, B → bund,
-- L/St/S → land, K or a district code ("RO 35") → kreis, none → gemeinde. An approximation:
-- e.g. through-roads in larger towns are often the town's responsibility despite a B/L number.

DO $$ BEGIN
  RAISE NOTICE '[Afterthoughts][Statistics by road] Start at %',
    clock_timestamp() AT TIME ZONE 'Europe/Berlin';
END $$;

ALTER TABLE aggregated_lengths
  DROP COLUMN IF EXISTS bikelane_by_road,
  DROP COLUMN IF EXISTS road_by_authority,
  DROP COLUMN IF EXISTS bikelane_by_authority,
  ADD COLUMN IF NOT EXISTS road_length_by_authority JSONB,
  ADD COLUMN IF NOT EXISTS bikelane_length_by_road JSONB;

CREATE OR REPLACE FUNCTION atlas_road_authority(ref TEXT)
RETURNS TEXT
IMMUTABLE
AS $$
  SELECT CASE
    WHEN ref IS NULL OR btrim(ref) = '' THEN 'gemeinde'
    WHEN ref ~ '(^|;)\s*A\s?[0-9]' THEN 'autobahn'
    WHEN ref ~ '(^|;)\s*B\s?[0-9]' THEN 'bund'
    WHEN ref ~ '(^|;)\s*(L|St|S)\s?[0-9]' THEN 'land'
    WHEN ref ~ '(^|;)\s*[A-ZÄÖÜ]{1,3}\s?[0-9]' THEN 'kreis'
    ELSE 'gemeinde'
  END;
$$ LANGUAGE sql;

-- Cuts a line into n ≈ length/res equal pieces, each carrying length/n meters.
-- (Own name: upstream used to ship atlas_segmentize_linestring and now drops it in parking QA.)
CREATE OR REPLACE FUNCTION atlas_line_pieces(input_geom geometry, input_length FLOAT, res INT)
RETURNS TABLE(length FLOAT, geom geometry)
IMMUTABLE
AS $$
  SELECT
    input_length / n,
    ST_LineSubstring(input_geom, (i - 1)::FLOAT / n, i::FLOAT / n)
  FROM (SELECT greatest(round(input_length / res), 1)::INT AS n) c,
    generate_series(1, n) AS i;
$$ LANGUAGE sql;

-- Lines only, one row per road, with what the bike matching and the authority sums need.
DROP TABLE IF EXISTS temp_roads_ref;
CREATE TABLE temp_roads_ref AS
  SELECT
    id,
    tags->>'road' AS road,
    atlas_road_authority(tags->>'name_ref') AS authority,
    tilda_measure_directions(tags) AS factor,
    (tags->>'length')::FLOAT AS length,
    geom
  FROM roads;
CREATE INDEX temp_roads_ref_geom_idx ON temp_roads_ref USING gist(geom);
ANALYZE temp_roads_ref;

DROP TABLE IF EXISTS temp_bikelanes_road_segmentized;
CREATE TABLE temp_bikelanes_road_segmentized AS
  SELECT
    tags ? '_parent_highway' AS on_road,
    tags->>'road' AS own_road,
    tags->>'adjoining_road' AS adjoining_road,
    tags->>'_is_sidepath' AS sidepath,
    tilda_measure_directions(tags) AS factor,
    (atlas_line_pieces(geom, (tags->>'length')::FLOAT, 100)).*
  FROM bikelanes;

-- Nearest road per 100 m piece, searched from the piece's midpoint. EPSG:3857 units are metres / cos(lat), so the search
-- radius is scaled per point to stay ~20 m / ~30 m on the ground.
DROP TABLE IF EXISTS temp_bikelanes_road_assigned;
CREATE TABLE temp_bikelanes_road_assigned AS
  SELECT
    s.length * s.factor AS length,
    s.geom,
    n.id AS road_id,
    CASE
      WHEN s.on_road THEN s.own_road || '|' || coalesce(n.authority, 'gemeinde')
      WHEN n.road IS NOT NULL THEN n.road || '|' || n.authority
      ELSE 'independent'
    END AS road_key
  FROM (
    SELECT *, ST_LineInterpolatePoint(geom, 0.5) AS mid FROM temp_bikelanes_road_segmentized
  ) s
  LEFT JOIN LATERAL (
    SELECT r.id, r.road, r.authority
    FROM temp_roads_ref r
    WHERE s.sidepath IS DISTINCT FROM 'assumed_no'
      AND r.road NOT IN ('motorway', 'motorway_link', 'pedestrian')
      -- An on-road lane's parent has the lane's own road class; anything else is a cross street.
      AND (NOT s.on_road OR r.road = s.own_road)
      AND ST_DWithin(
        r.geom,
        s.mid,
        (CASE WHEN s.on_road THEN 20 ELSE 30 END)
          / cos(radians(ST_Y(ST_Transform(s.mid, 4326))))
      )
    -- TILDA's own match first (its road class), then plain distance.
    ORDER BY (s.adjoining_road IS NOT NULL AND r.road = s.adjoining_road) DESC, r.geom <-> s.mid
    LIMIT 1
  ) n ON true;
-- A road can't be more than fully covered: two-way paths on both sides, or a path mapped twice,
-- would otherwise push a road (and the main-road share) past 100 %. Scale each road's matched
-- bike km down to its own length (same oneway factor as the road sums).
WITH per_road AS (
  SELECT a.road_id, SUM(a.length) AS bike_m, MAX(r.length * r.factor) AS road_m
  FROM temp_bikelanes_road_assigned a
  JOIN temp_roads_ref r ON r.id = a.road_id
  GROUP BY a.road_id
)
UPDATE temp_bikelanes_road_assigned a
SET length = a.length * (p.road_m / p.bike_m)
FROM per_road p
WHERE a.road_id = p.road_id AND p.bike_m > p.road_m;

CREATE INDEX temp_bikelanes_road_assigned_geom_idx
  ON temp_bikelanes_road_assigned USING gist(geom);

DROP TABLE temp_bikelanes_road_segmentized;

DROP FUNCTION IF EXISTS atlas_sum_by_key(Geometry(MultiPolygon, 3857), REGCLASS, TEXT, TEXT);

-- Meters per feature are computed before grouping (OFFSET 0), so the sort never carries the
-- area geometry (see aggregate_lengths.sql).
WITH
road_km AS (
  SELECT f.id, f.road_key, SUM(f.meters) / 1000.0 AS km
  FROM aggregated_lengths a
  CROSS JOIN LATERAL (
    SELECT a.id, r.road || '|' || r.authority AS road_key,
      r.length * r.factor * tilda_measure_share(a.geom, r.geom) AS meters
    FROM temp_roads_ref r
    WHERE ST_Intersects(a.geom, r.geom)
    OFFSET 0
  ) f
  GROUP BY 1, 2
),
bike_km AS (
  SELECT f.id, f.road_key, SUM(f.meters) / 1000.0 AS km
  FROM aggregated_lengths a
  CROSS JOIN LATERAL (
    SELECT a.id, b.road_key, b.length * tilda_measure_share(a.geom, b.geom) AS meters
    FROM temp_bikelanes_road_assigned b
    WHERE ST_Intersects(a.geom, b.geom)
    OFFSET 0
  ) f
  GROUP BY 1, 2
),
per_area AS (
  SELECT id, jsonb_object_agg(road_key, km) AS by_key, 'road' AS kind FROM road_km GROUP BY id
  UNION ALL
  SELECT id, jsonb_object_agg(road_key, km), 'bike' FROM bike_km GROUP BY id
)
UPDATE aggregated_lengths a
SET
  bikelane_length_by_road = b.by_key,
  road_length_by_authority = r.by_key
FROM aggregated_lengths a2
LEFT JOIN per_area b ON b.id = a2.id AND b.kind = 'bike'
LEFT JOIN per_area r ON r.id = a2.id AND r.kind = 'road'
WHERE a2.id = a.id;

DROP TABLE temp_bikelanes_road_assigned;
DROP TABLE temp_roads_ref;

DO $$ BEGIN
  RAISE NOTICE '[Afterthoughts][Statistics by road] Done at %',
    clock_timestamp() AT TIME ZONE 'Europe/Berlin';
END $$;
