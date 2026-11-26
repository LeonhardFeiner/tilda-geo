/* sql-formatter-disable */
-- Fork-only (bike-share-map), runs after aggregate_lengths.sql. Needs public._settlement_areas
-- (landcover topic, PROCESS_ONLY_TOPICS=landcover; it changes rarely, so an older run is fine).
--
-- "Wahrscheinliche Fahrtrichtung": a bike path without a direction tag counts in one direction
-- (`oneway=implicit_yes`, StVO § 2 Abs. 4 for paths beside a road). Away from roads and outside
-- settlements most of them are two-way: in Bayern 91 % of the tagged paths away from roads and
-- 93 % of those outside settlement areas are two-way, but only 41 % inside (2026-11-26).
-- This table holds, per boundary and category, the kilometres such a path adds when it counts in
-- both directions: the part of every `implicit_yes` path (not lanes on the carriageway, bicycle
-- roads, shared lanes or pedestrian areas) that lies more than 25 m from a motor road or outside
-- the settlement areas. A path tagged on its road (`prefix`) is never "away from roads".
-- The viewer adds it to `bikelane_length` when "Radwege ohne Richtungsangabe außerorts in beide
-- Richtungen zählen" is on.
--
-- Method: 10-m sample points along each path, each carrying its share of the path length, so a
-- path that leaves a village counts with the part outside (same idea as tilda_measure_share).
-- OUTPUT: public.aggregated_lengths_likely (id = aggregated_lengths.id, extra: {category: km})

SET work_mem = '1GB';

DROP TABLE IF EXISTS _likely_points;
CREATE UNLOGGED TABLE _likely_points AS
WITH paths AS (
  SELECT b.id, b.tags ->> 'category' AS category, (b.tags ->> 'prefix') IS NOT NULL AS on_road,
    b.geom, ST_Length(ST_Transform(b.geom, 25832)) AS len
  FROM bikelanes b
  WHERE b.tags ->> 'oneway' = 'implicit_yes'
    AND b.tags ->> 'category' NOT LIKE 'cyclewayOnHighway%'
    AND b.tags ->> 'category' NOT LIKE 'shared%'
    AND b.tags ->> 'category' NOT LIKE 'bicycleRoad%'
    AND b.tags ->> 'category' NOT LIKE 'pedestrianArea%'
),
pts AS (
  SELECT id, category, on_road, len, (ST_DumpPoints(ST_Segmentize(geom, 10))).geom AS p FROM paths
),
n AS (SELECT id, count(*) AS cnt FROM pts GROUP BY id)
SELECT pts.id, pts.category, pts.on_road, pts.len / n.cnt AS meters, pts.p
FROM pts JOIN n USING (id);

-- away from roads: no motor road within 25 m
ALTER TABLE _likely_points ADD COLUMN away BOOLEAN, ADD COLUMN outside BOOLEAN;
UPDATE _likely_points s SET away = NOT s.on_road AND NOT EXISTS (
  SELECT 1 FROM roads rd
  WHERE rd.tags ->> 'road' IN ('primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'trunk',
      'living_street', 'residential_priority_road', 'primary_link', 'secondary_link', 'tertiary_link', 'service_road')
    AND ST_DWithin(rd.geom, s.p, 25));
-- outside settlements (_settlement_areas is EPSG:5243; a constant SRID keeps its index usable)
UPDATE _likely_points s SET outside = NOT EXISTS (
  SELECT 1 FROM _settlement_areas a WHERE ST_Intersects(a.geom, ST_Transform(s.p, 5243)));
CREATE INDEX ON _likely_points USING gist (p) WHERE away OR outside;
ANALYZE _likely_points;

-- Boundaries cut into small pieces: a point-in-polygon test against the whole of Germany (or a
-- Land) would walk hundreds of thousands of vertices per point. The pieces don't overlap, so a
-- point lies in at most one piece per boundary.
DROP TABLE IF EXISTS _likely_boundary_pieces;
CREATE UNLOGGED TABLE _likely_boundary_pieces AS
SELECT id, ST_Subdivide(geom, 256) AS geom FROM boundaries
WHERE tags ->> 'admin_level' IN ('2', '3', '4', '5', '6', '7', '8', '9');
CREATE INDEX ON _likely_boundary_pieces USING gist (geom);
ANALYZE _likely_boundary_pieces;

DROP TABLE IF EXISTS aggregated_lengths_likely;
CREATE TABLE aggregated_lengths_likely AS
WITH per_class AS (
  SELECT a.id, s.category, SUM(s.meters) / 1000.0 AS km
  FROM _likely_points s
  JOIN _likely_boundary_pieces a ON ST_Intersects(a.geom, s.p)
  WHERE s.away OR s.outside
  GROUP BY 1, 2
)
SELECT id, jsonb_object_agg(category, km) AS extra FROM per_class GROUP BY id;
ALTER TABLE aggregated_lengths_likely ADD PRIMARY KEY (id);

DO $$ DECLARE r RECORD; BEGIN
  SELECT count(*) AS regions,
    (SELECT round(sum(meters) FILTER (WHERE away OR outside) / 1000) FROM _likely_points) AS extra_km,
    (SELECT round(sum(meters) / 1000) FROM _likely_points) AS implicit_km
  INTO r FROM aggregated_lengths_likely;
  RAISE NOTICE '[likely] % regions; % of % km without a direction tag count twice', r.regions, r.extra_km, r.implicit_km;
END $$;

DROP TABLE _likely_points;
DROP TABLE _likely_boundary_pieces;
