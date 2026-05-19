import { geoDataClient } from '@/server/prisma-client.server'
import { STADTSTAAT_IDS } from '../bike-share-map/regionNavigation'
import type { PrecomputedNeighborsFile } from '../bike-share-map/regionNeighbors'

type NeighborRow = { id: string; neighbors: string[] }

/** Full-resolution boundaries in EPSG:3857; ST_DWithin bridges minor topology gaps. */
const NEIGHBOR_GEOM_3857 = 'ST_Transform(ST_MakeValid(geom), 3857)'
const NEIGHBOR_DWITHIN_METRES = 300
const GEMEINDE_DWITHIN_METRES = 150

function rowsToRecord(rows: NeighborRow[]) {
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    out[row.id] = row.neighbors
  }
  return out
}

const stadtstaatIdList = [...STADTSTAAT_IDS].map((id) => `'${id}'`).join(', ')

export async function fetchPrecomputedRegionNeighbors() {
  const [landkreisRows, landkreisStadtstaatRows, gemeindeRows, gemeindeStadtstaatRows] =
    await Promise.all([
      geoDataClient.$queryRawUnsafe<NeighborRow[]>(`
      WITH lk AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom,
          bl.id AS bundesland_id
        FROM public.aggregated_lengths a
        LEFT JOIN LATERAL (
          SELECT b.id
          FROM public.aggregated_lengths b
          WHERE
            b.level = '4'
            AND b.geom && a.geom
            AND ST_Contains(b.geom, ST_PointOnSurface(a.geom))
          LIMIT 1
        ) bl ON TRUE
        WHERE a.level = '6'
      )
      SELECT
        a.id,
        COALESCE(
          array_agg(DISTINCT b.id ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS neighbors
      FROM lk a
      LEFT JOIN lk b
        ON a.id <> b.id
        AND a.bundesland_id IS NOT NULL
        AND a.bundesland_id = b.bundesland_id
        AND a.geom && b.geom
        AND ST_DWithin(a.geom, b.geom, ${NEIGHBOR_DWITHIN_METRES})
      GROUP BY a.id
    `),
      geoDataClient.$queryRawUnsafe<NeighborRow[]>(`
      WITH lk AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom
        FROM public.aggregated_lengths a
        WHERE a.level = '6'
      ),
      ss AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom
        FROM public.aggregated_lengths a
        WHERE a.level = '4' AND a.id IN (${stadtstaatIdList})
      )
      SELECT
        lk.id,
        COALESCE(
          array_agg(DISTINCT ss.id ORDER BY ss.id) FILTER (WHERE ss.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS neighbors
      FROM lk
      LEFT JOIN ss
        ON lk.geom && ss.geom
        AND ST_DWithin(lk.geom, ss.geom, ${NEIGHBOR_DWITHIN_METRES})
      GROUP BY lk.id
    `),
      geoDataClient.$queryRawUnsafe<NeighborRow[]>(`
      WITH kreisfrei AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom
        FROM public.aggregated_lengths a
        WHERE
          a.level = '6'
          AND NOT EXISTS (
            SELECT 1
            FROM public.aggregated_lengths g
            WHERE
              g.level = '8'
              AND g.geom && a.geom
              AND ST_Contains(a.geom, ST_PointOnSurface(g.geom))
          )
      ),
      units AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom
        FROM public.aggregated_lengths a
        WHERE a.level = '8'
        UNION ALL
        SELECT id, geom FROM kreisfrei
      )
      SELECT
        a.id,
        COALESCE(
          array_agg(DISTINCT b.id ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS neighbors
      FROM units a
      LEFT JOIN units b
        ON a.id <> b.id
        AND a.geom && b.geom
        AND ST_DWithin(a.geom, b.geom, ${GEMEINDE_DWITHIN_METRES})
      GROUP BY a.id
    `),
      geoDataClient.$queryRawUnsafe<NeighborRow[]>(`
      WITH units AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom
        FROM public.aggregated_lengths a
        WHERE a.level = '8'
      ),
      ss AS (
        SELECT
          a.id,
          ${NEIGHBOR_GEOM_3857.replaceAll('geom', 'a.geom')} AS geom
        FROM public.aggregated_lengths a
        WHERE a.level = '4' AND a.id IN (${stadtstaatIdList})
      )
      SELECT
        u.id,
        COALESCE(
          array_agg(DISTINCT ss.id ORDER BY ss.id) FILTER (WHERE ss.id IS NOT NULL),
          ARRAY[]::text[]
        ) AS neighbors
      FROM units u
      LEFT JOIN ss
        ON u.geom && ss.geom
        AND ST_DWithin(u.geom, ss.geom, ${GEMEINDE_DWITHIN_METRES})
      GROUP BY u.id
    `),
    ])

  const gemeinde = rowsToRecord(gemeindeRows)
  for (const row of gemeindeStadtstaatRows) {
    if (!row.neighbors.length) continue
    const existing = new Set(gemeinde[row.id] ?? [])
    for (const id of row.neighbors) existing.add(id)
    gemeinde[row.id] = [...existing].sort()
  }

  return {
    version: 1 as const,
    landkreis: rowsToRecord(landkreisRows),
    landkreisStadtstaat: rowsToRecord(landkreisStadtstaatRows),
    gemeinde,
  } satisfies PrecomputedNeighborsFile
}
