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
import { fetchAggregatedLengthRows } from '../stats-export/aggregatedLengthsExport'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'stats.geojson')

/** Simplification tolerance in metres (EPSG:3857). */
const SIMPLIFY_METRES = 150

const [rows, geoms] = await Promise.all([
  fetchAggregatedLengthRows(),
  geoDataClient.$queryRaw<
    Array<{
      id: string
      geometry: { type: string; coordinates: unknown }
    }>
  >`
    SELECT
      id,
      ST_AsGeoJSON(
        ST_Transform(
          ST_SimplifyPreserveTopology(
            ST_Transform(ST_MakeValid(geom), 3857),
            ${SIMPLIFY_METRES}
          ),
          4326
        ),
        6
      )::jsonb AS geometry
    FROM public.aggregated_lengths
  `,
])

const geometryById = new Map(geoms.map((g) => [g.id, g.geometry]))

const features = rows
  .map((row) => {
    const geometry = geometryById.get(row.id)
    if (!geometry) return null
    return feature(geometry as Geometry, {
      id: row.id,
      name: row.name ?? '',
      level: row.level ?? '',
      ...(row.parent_id ? { parent_id: row.parent_id } : {}),
      ...(row.bundesland_id ? { bundesland_id: row.bundesland_id } : {}),
      ...(row.landkreis_id ? { landkreis_id: row.landkreis_id } : {}),
      road_length: row.road_length,
      bikelane_length: row.bikelane_length,
    })
  })
  .filter((f) => f != null)

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, `${JSON.stringify(featureCollection(features))}\n`, 'utf8')
process.stdout.write(`${outPath} (${features.length} features)\n`)
await geoDataClient.$disconnect()
