-- Apply topological simplification on our boundaries.
-- They are way to detailed for our use case.
-- Simplifying the right away makes following processes faster.
-- This takes about 30 sec.
-- More: https://github.com/FixMyBerlin/private-issues/issues/2305

UPDATE boundaries
SET geom = ST_SimplifyPreserveTopology(
  geom,
  CASE
    WHEN (tags ->> 'admin_level')::int <= 3 THEN 50 -- land / coarse
    WHEN (tags ->> 'admin_level')::int = 4 THEN 30 -- bundesland
    WHEN (tags ->> 'admin_level')::int = 5 THEN 25 -- regierungsbezirk
    WHEN (tags ->> 'admin_level')::int = 6 THEN 20 -- landkreise
    WHEN (tags ->> 'admin_level')::int = 7 THEN 15 -- verwaltungsgemeinschaft
    ELSE 10 -- gemeinden level 8/9
  END
);

REINDEX INDEX boundaries_minzoom_geom_idx;
