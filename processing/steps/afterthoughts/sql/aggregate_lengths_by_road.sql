-- Fork-only afterthought (bike-share-map viewer): run after aggregate_lengths.sql.
-- Attributes bike infrastructure to the road it runs along, so the viewer can show
-- "share of main roads with bike infrastructure" and who is responsible for those roads.
--
-- aggregated_lengths gains two JSONB columns (km, same oneway factor as aggregate_lengths.sql,
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
--   * other separate ways: nearest road within 30 m, else 'independent'
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

-- Lines only, one row per road, with what the bike matching and the authority sums need.
DROP TABLE IF EXISTS temp_roads_ref;
CREATE TABLE temp_roads_ref AS
  SELECT
    id,
    tags->>'road' AS road,
    atlas_road_authority(tags->>'name_ref') AS authority,
    CASE
      WHEN tags->>'oneway' = 'yes' THEN 1
      WHEN tags->>'oneway' = 'yes_dual_carriageway' THEN 1
      ELSE 2
    END AS factor,
    (tags->>'length')::FLOAT AS length,
    geom
  FROM roads;
CREATE INDEX temp_roads_ref_geom_idx ON temp_roads_ref USING gist(geom);
ANALYZE temp_roads_ref;

DROP TABLE IF EXISTS temp_roads_authority_segmentized;
CREATE TABLE temp_roads_authority_segmentized AS
  SELECT road || '|' || authority AS road_key, factor, (atlas_segmentize_linestring(geom, length, 100)).*
  FROM temp_roads_ref;
CREATE INDEX temp_roads_authority_segmentized_geom_idx
  ON temp_roads_authority_segmentized USING gist(geom);

DROP TABLE IF EXISTS temp_bikelanes_road_segmentized;
CREATE TABLE temp_bikelanes_road_segmentized AS
  SELECT
    tags ? '_parent_highway' AS on_road,
    tags->>'road' AS own_road,
    tags->>'_is_sidepath' AS sidepath,
    CASE
      WHEN tags->>'oneway' = 'yes' THEN 1
      WHEN tags->>'oneway' = 'implicit_yes' THEN 1
      ELSE 2
    END AS factor,
    (atlas_segmentize_linestring(geom, (tags->>'length')::FLOAT, 100)).*
  FROM bikelanes;

-- Nearest road per 100 m sample. EPSG:3857 units are metres / cos(lat), so the search
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
  FROM temp_bikelanes_road_segmentized s
  LEFT JOIN LATERAL (
    SELECT r.id, r.road, r.authority
    FROM temp_roads_ref r
    WHERE s.sidepath IS DISTINCT FROM 'assumed_no'
      AND r.road NOT IN ('motorway', 'motorway_link', 'pedestrian')
      -- An on-road lane's parent has the lane's own road class; anything else is a cross street.
      AND (NOT s.on_road OR r.road = s.own_road)
      AND ST_DWithin(
        r.geom,
        s.geom,
        (CASE WHEN s.on_road THEN 20 ELSE 30 END)
          / cos(radians(ST_Y(ST_Transform(s.geom, 4326))))
      )
    ORDER BY r.geom <-> s.geom
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

CREATE OR REPLACE FUNCTION atlas_sum_by_key(
  input_polygon Geometry(MultiPolygon, 3857),
  source_table REGCLASS,
  key_column TEXT,
  length_expr TEXT
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE format(
    'SELECT jsonb_object_agg(k, km) FROM (
       SELECT %1$I AS k, (SUM(%2$s) / 1000.0)::double precision AS km
       FROM %3$s WHERE ST_Intersects(geom, $1) GROUP BY %1$I
     ) t',
    key_column, length_expr, source_table
  )
  INTO result
  USING input_polygon;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

BEGIN;

UPDATE aggregated_lengths a
SET
  bikelane_length_by_road = atlas_sum_by_key(a.geom, 'temp_bikelanes_road_assigned', 'road_key', 'length'),
  road_length_by_authority = atlas_sum_by_key(a.geom, 'temp_roads_authority_segmentized', 'road_key', 'length * factor');

DROP TABLE temp_bikelanes_road_assigned;
DROP TABLE temp_roads_authority_segmentized;
DROP TABLE temp_roads_ref;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[Afterthoughts][Statistics by road] Done at %',
    clock_timestamp() AT TIME ZONE 'Europe/Berlin';
END $$;
