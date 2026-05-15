#!/usr/bin/env bun
/**
 * Dump /api/stats-equivalent GeoJSON from public.aggregated_lengths (needs local Postgres).
 * Use the file with: build.ts --scope bayern-landkreise --stats-geojson <path>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { feature, featureCollection } from '@turf/helpers'
import type { Geometry } from 'geojson'
import { geoDataClient } from '@/server/prisma-client.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'stats.geojson')

const raw = await geoDataClient.$queryRaw<
  Array<{
    id: string
    name: string | null
    level: string | null
    road_length: unknown
    bikelane_length: unknown
    geometry: { type: string; coordinates: unknown }
  }>
>`
  SELECT
    id,
    name,
    level,
    road_length,
    bikelane_length,
    ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), 1),
      6
    )::jsonb AS geometry
  FROM public.aggregated_lengths
`

const features = raw.map((row) =>
  feature(row.geometry as Geometry, {
    id: row.id,
    name: row.name ?? '',
    level: row.level ?? '',
    road_length: row.road_length,
    bikelane_length: row.bikelane_length,
  }),
)

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, `${JSON.stringify(featureCollection(features))}\n`, 'utf8')
process.stdout.write(`${outPath}\n`)
await geoDataClient.$disconnect()
