#!/usr/bin/env bun
/**
 * Dump /api/stats-equivalent GeoJSON from public.aggregated_lengths (needs local Postgres).
 * Geometries are simplified in Web Mercator (~150 m) so Landkreis borders stay recognizable.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { feature, featureCollection } from '@turf/helpers'
import type { Geometry } from 'geojson'
import { geoDataClient } from '@/server/prisma-client.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'stats.geojson')

/** Simplification tolerance in metres (EPSG:3857). */
const SIMPLIFY_METRES = 150

const raw = await geoDataClient.$queryRaw<
  Array<{
    id: string
    name: string | null
    level: string | null
    bundesland_id: string | null
    landkreis_id: string | null
    road_length: unknown
    bikelane_length: unknown
    geometry: { type: string; coordinates: unknown }
  }>
>`
  SELECT
    a.id,
    a.name,
    a.level,
    bl.id AS bundesland_id,
    lk.id AS landkreis_id,
    a.road_length,
    a.bikelane_length,
    ST_AsGeoJSON(
      ST_Transform(
        ST_SimplifyPreserveTopology(
          ST_Transform(ST_MakeValid(a.geom), 3857),
          ${SIMPLIFY_METRES}
        ),
        4326
      ),
      6
    )::jsonb AS geometry
  FROM public.aggregated_lengths a
  LEFT JOIN LATERAL (
    SELECT b.id
    FROM public.aggregated_lengths b
    WHERE
      b.level = '4'
      AND a.level IN ('6', '8')
      AND ST_Contains(ST_MakeValid(b.geom), ST_PointOnSurface(ST_MakeValid(a.geom)))
    LIMIT 1
  ) bl ON TRUE
  LEFT JOIN LATERAL (
    SELECT b.id
    FROM public.aggregated_lengths b
    WHERE
      b.level = '6'
      AND a.level = '8'
      AND ST_Contains(ST_MakeValid(b.geom), ST_PointOnSurface(ST_MakeValid(a.geom)))
    ORDER BY ST_Area(b.geom) ASC NULLS LAST
    LIMIT 1
  ) lk ON TRUE
`

const features = raw.map((row) =>
  feature(row.geometry as Geometry, {
    id: row.id,
    name: row.name ?? '',
    level: row.level ?? '',
    ...(row.bundesland_id ? { bundesland_id: row.bundesland_id } : {}),
    ...(row.landkreis_id ? { landkreis_id: row.landkreis_id } : {}),
    road_length: row.road_length,
    bikelane_length: row.bikelane_length,
  }),
)

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, `${JSON.stringify(featureCollection(features))}\n`, 'utf8')
process.stdout.write(`${outPath} (${features.length} features)\n`)
await geoDataClient.$disconnect()
