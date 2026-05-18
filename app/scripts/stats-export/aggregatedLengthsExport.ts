import { geoDataClient } from '@/server/prisma-client.server'
import { levelKeyForAdminLevel } from '@/server/statistics/aggregatedLengthsLevels'

export type AggregatedLengthExportRow = {
  id: string
  name: string | null
  level: string | null
  parent_id: string | null
  parent_name: string | null
  bundesland_id: string | null
  bundesland_name: string | null
  landkreis_id: string | null
  landkreis_name: string | null
  road_length: unknown
  bikelane_length: unknown
}

export { levelKeyForAdminLevel as levelKeyFor }

export function parentIdFor(row: AggregatedLengthExportRow) {
  return row.parent_id ?? ''
}

export async function fetchAggregatedLengthRows() {
  return geoDataClient.$queryRaw<AggregatedLengthExportRow[]>`
    SELECT
      a.id,
      a.name,
      a.level,
      parent.id AS parent_id,
      parent.name AS parent_name,
      bl.id AS bundesland_id,
      bl.name AS bundesland_name,
      lk.id AS landkreis_id,
      lk.name AS landkreis_name,
      a.road_length,
      a.bikelane_length
    FROM public.aggregated_lengths a
    LEFT JOIN LATERAL (
      SELECT b.id, b.name
      FROM public.aggregated_lengths b
      WHERE
        (b.level)::int < (a.level)::int
        AND b.geom && a.geom
        AND ST_Contains(b.geom, ST_PointOnSurface(a.geom))
      ORDER BY (b.level)::int DESC, ST_Area(b.geom) ASC NULLS LAST
      LIMIT 1
    ) parent ON TRUE
    LEFT JOIN LATERAL (
      SELECT b.id, b.name
      FROM public.aggregated_lengths b
      WHERE
        b.level = '4'
        AND (a.level)::int > 4
        AND b.geom && a.geom
        AND ST_Contains(b.geom, ST_PointOnSurface(a.geom))
      LIMIT 1
    ) bl ON TRUE
    LEFT JOIN LATERAL (
      SELECT b.id, b.name
      FROM public.aggregated_lengths b
      WHERE
        b.level = '6'
        AND (a.level)::int > 6
        AND b.geom && a.geom
        AND ST_Contains(b.geom, ST_PointOnSurface(a.geom))
      ORDER BY ST_Area(b.geom) ASC NULLS LAST
      LIMIT 1
    ) lk ON TRUE
    ORDER BY (a.level)::int NULLS LAST, a.name NULLS LAST
  `
}
