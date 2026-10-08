#!/usr/bin/env bun
/**
 * Dump /api/stats-equivalent region stats from public.aggregated_lengths (needs local Postgres).
 * Primary viewer format: single binary stats.msgpack (MessagePack). Optional stats.geojson for build.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { feature, featureCollection } from '@turf/helpers'
import type { Geometry } from 'geojson'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'
import { geoDataClient } from '@/server/prisma-client.server'
import { fetchAggregatedLengthRows } from '../stats-export/aggregatedLengthsExport'
import { fetchPrecomputedRegionNeighbors } from '../stats-export/regionNeighborsExport'
import { encodeStatsRegionPack } from '../stats-export/statsRegionPack'
import { buildRegionIndex } from './regionNavigation'
import { encodeNeighborsPack } from './regionNeighbors'
import { MAIN_ROAD_CLASS, roadClassForKey } from './statsClassSums'

const outDir = join(import.meta.dir, 'output')
const msgpackPath = join(outDir, 'stats.msgpack')
const geojsonPath = join(outDir, 'stats.geojson')
const neighborsMsgpackPath = join(outDir, 'neighbors.msgpack')
const neighborsJsonPath = join(outDir, 'neighbors.json')
const manifestPath = join(outDir, 'manifest.json')

const writeGeojson = process.argv.includes('--geojson')
const skipNeighbors = process.argv.includes('--skip-neighbors')
const skipNeighborsJson = process.argv.includes('--skip-neighbors-json')

/** Simplification tolerance in metres (EPSG:3857). */
const SIMPLIFY_METRES = 150

type GeomRow = { id: string; geometry: { type: string; coordinates: unknown } }

/**
 * Fetch simplified geometries one admin level at a time. MakeValid + double-transform +
 * topology-preserving simplify over all of Germany (levels 2–9) is far too slow for the
 * 60s statement_timeout the app puts on the geo connection, so use a dedicated pg client
 * without that cap and keep each statement to one admin level.
 */
async function fetchGeometries() {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
    const levels = ['2', '3', '4', '5', '6', '7', '8', '9']
    const out: GeomRow[] = []
    for (const level of levels) {
      const { rows: chunk } = await client.query<GeomRow>(
        `
        SELECT
          id,
          ST_AsGeoJSON(
            ST_Transform(
              ST_SimplifyPreserveTopology(
                ST_Transform(ST_MakeValid(geom), 3857),
                $1
              ),
              4326
            ),
            6
          )::jsonb AS geometry
        FROM public.aggregated_lengths
        WHERE level = $2
      `,
        [SIMPLIFY_METRES, level],
      )
      out.push(...chunk)
    }
    return out
  } finally {
    await client.end()
  }
}

/**
 * The viewer only reads the main-road entries (plus 'independent') of the per-road columns;
 * the residential/service ones would add ~0.8 MB gzip to the first load for nothing.
 */
function mainRoadEntriesOnly(value: unknown) {
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) =>
        key === 'independent' || roadClassForKey(key.split('|')[0] ?? '') === MAIN_ROAD_CLASS,
    ),
  )
}

const [rows, geoms, osmDataFrom] = await Promise.all([
  fetchAggregatedLengthRows(),
  fetchGeometries(),
  geoDataClient.$queryRaw<
    { osm_data_from: Date | null }[]
  >`SELECT max(osm_data_from) AS osm_data_from FROM public.meta`
    .then((r) => r[0]?.osm_data_from?.toISOString() ?? null)
    .catch(() => null),
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
      ...(row.regionalschluessel ? { regionalschluessel: row.regionalschluessel } : {}),
      ...(row.parent_id ? { parent_id: row.parent_id } : {}),
      ...(row.bundesland_id ? { bundesland_id: row.bundesland_id } : {}),
      ...(row.landkreis_id ? { landkreis_id: row.landkreis_id } : {}),
      road_length: row.road_length,
      bikelane_length: row.bikelane_length,
      ...(row.road_length_by_authority
        ? { road_length_by_authority: mainRoadEntriesOnly(row.road_length_by_authority) }
        : {}),
      ...(row.bikelane_length_by_road
        ? { bikelane_length_by_road: mainRoadEntriesOnly(row.bikelane_length_by_road) }
        : {}),
    })
  })
  .filter((f) => f != null)

mkdirSync(outDir, { recursive: true })

const msgpackBytes = encodeStatsRegionPack(features)
writeFileSync(msgpackPath, msgpackBytes)

const index = buildRegionIndex(features)
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      version: 2,
      deutschlandId: index.deutschlandId,
      kreisfreieStaedteIds: [...index.kreisfreieIds],
      stadtstaatIds: index.stadtstaaten.map((s) => s.id),
      featureCount: features.length,
      ...(osmDataFrom ? { osmDataFrom } : {}),
    },
    null,
    2,
  )}\n`,
)
let neighborCounts: { lk: number; gm: number } | null = null
if (!skipNeighbors) {
  process.stdout.write('Nachbarn aus DB (nach stats.msgpack)…\n')
  const neighbors = await fetchPrecomputedRegionNeighbors()
  neighborCounts = {
    lk: Object.keys(neighbors.landkreis).length,
    gm: Object.keys(neighbors.gemeinde).length,
  }
  writeFileSync(neighborsMsgpackPath, Buffer.from(encodeNeighborsPack(neighbors)))
  if (!skipNeighborsJson) {
    writeFileSync(neighborsJsonPath, `${JSON.stringify(neighbors)}\n`)
  }
}

if (writeGeojson) {
  writeFileSync(geojsonPath, `${JSON.stringify(featureCollection(features))}\n`)
}

const msgpackMb = (msgpackBytes.byteLength / 1024 / 1024).toFixed(1)
process.stdout.write(`${msgpackPath} (${features.length} features, ${msgpackMb} MiB)\n`)
process.stdout.write(`${manifestPath}\n`)
if (neighborCounts) {
  process.stdout.write(
    `${neighborsMsgpackPath} (LK ${neighborCounts.lk}, GM ${neighborCounts.gm})\n`,
  )
}
if (writeGeojson) {
  process.stdout.write(`${geojsonPath} (legacy GeoJSON, optional)\n`)
} else {
  process.stdout.write(`Tip: pass --geojson to also write ${geojsonPath} for build.ts\n`)
}
await geoDataClient.$disconnect()
