#!/usr/bin/env bun
/**
 * Extracts and computes traffic calming and Tempo-30 road network metrics
 * per municipality, district, and federal state from TILDA / OSM aggregated_lengths.
 *
 * Metrics computed:
 *   - totalRoadKm: total road network length in km
 *   - calmedKm: length of residential, living street, bicycle road, pedestrian, and residential priority roads in km
 *   - calmedSharePct: share of residential and traffic-calmed streets over total road network in % (Tempo 30 zone proxy)
 *   - livingKm: length of explicit living streets (Verkehrsberuhigter Bereich), bicycle roads, and pedestrian zones in km
 *   - livingSharePct: share of living streets, bicycle roads, and pedestrian zones over total road network in %
 *   - livingStreetSharePct: share of living streets (Verkehrsberuhigter Bereich) alone, in %. The
 *     structural model uses this one: Fahrradstraßen and Fußgängerzonen with bicycle=yes are part
 *     of the bike-infra outcome, so they must not also be a predictor.
 *
 * Output: output/calmed-roads.json
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode } from '@msgpack/msgpack'
import { writeDataset } from './fetchCommon'

export type CalmedRoadMetrics = {
  totalRoadKm: number
  calmedKm: number
  calmedSharePct: number
  livingKm: number
  livingSharePct: number
  livingStreetSharePct: number
}

export type CalmedRoadsOutput = {
  metadata: {
    source: string
    generatedAt: string
    regionCount: number
  }
  byId: Record<string, CalmedRoadMetrics>
}

/** Road classification keys considered residential or traffic-calmed (Tempo 30 / slow speed zones). */
export const RESIDENTIAL_ROAD_KEYS = new Set([
  'residential',
  'residential_priority_road',
  'living_street',
  'bicycle_road',
  'pedestrian',
])

/** Road classification keys with explicit top-tier traffic calming (Spielstraße / Fahrradstraße / Fußgängerzone). */
export const LIVING_ROAD_KEYS = new Set(['living_street', 'bicycle_road', 'pedestrian'])

export function computeCalmedMetricsFromRoadLength(
  roadLength: Record<string, number> | null | undefined,
): CalmedRoadMetrics | null {
  if (!roadLength || typeof roadLength !== 'object' || Array.isArray(roadLength)) {
    return null
  }

  let totalKm = 0
  let calmedKm = 0
  let livingKm = 0
  let livingStreetKm = 0

  for (const [key, raw] of Object.entries(roadLength)) {
    const km = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
    if (!Number.isFinite(km) || km <= 0) continue

    totalKm += km
    if (RESIDENTIAL_ROAD_KEYS.has(key)) {
      calmedKm += km
    }
    if (LIVING_ROAD_KEYS.has(key)) {
      livingKm += km
    }
    if (key === 'living_street') {
      livingStreetKm += km
    }
  }

  if (totalKm < 0.2) return null

  const calmedSharePct = Math.round((calmedKm / totalKm) * 1000) / 10
  const livingSharePct = Math.round((livingKm / totalKm) * 1000) / 10
  const livingStreetSharePct = Math.round((livingStreetKm / totalKm) * 1000) / 10

  return {
    totalRoadKm: Math.round(totalKm * 10) / 10,
    calmedKm: Math.round(calmedKm * 10) / 10,
    calmedSharePct,
    livingKm: Math.round(livingKm * 10) / 10,
    livingSharePct,
    livingStreetSharePct,
  }
}

export async function fetchCalmedRoads(): Promise<CalmedRoadsOutput> {
  const byId: Record<string, CalmedRoadMetrics> = {}

  let loadedFromDb = false
  try {
    const { geoDataClient } = await import('@/server/prisma-client.server')
    const rows = await geoDataClient.$queryRaw<Array<{ id: string; road_length: unknown }>>`
      SELECT id, road_length
      FROM public.aggregated_lengths
      WHERE road_length IS NOT NULL
    `
    for (const row of rows) {
      const rl = row.road_length as Record<string, number> | null
      const metrics = computeCalmedMetricsFromRoadLength(rl)
      if (metrics) {
        byId[row.id] = metrics
      }
    }
    loadedFromDb = true
  } catch (err) {
    process.stderr.write(`Database query failed, falling back to stats.msgpack: ${err}\n`)
  }

  if (!loadedFromDb) {
    const statsPackPath = join(import.meta.dir, 'output', 'stats.msgpack')
    if (existsSync(statsPackPath)) {
      const buf = readFileSync(statsPackPath)
      const data = decode(buf) as {
        features?: Array<{ properties?: { id?: string; road_length?: Record<string, number> } }>
      }
      if (Array.isArray(data.features)) {
        for (const f of data.features) {
          const id = f.properties?.id
          const rl = f.properties?.road_length
          if (!id || !rl) continue
          // Note: In stats.msgpack v2, road_length values are in whole meters
          const kmRecord: Record<string, number> = {}
          for (const [k, v] of Object.entries(rl)) {
            kmRecord[k] = (typeof v === 'number' ? v : Number(v)) / 1000
          }
          const metrics = computeCalmedMetricsFromRoadLength(kmRecord)
          if (metrics) {
            byId[id] = metrics
          }
        }
      }
    }
  }

  return {
    metadata: {
      source: 'TILDA / OSM aggregated_lengths',
      generatedAt: new Date().toISOString(),
      regionCount: Object.keys(byId).length,
    },
    byId,
  }
}

if (import.meta.main) {
  const outputDir = join(import.meta.dir, 'output')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'calmed-roads.json')

  process.stdout.write('Calculating traffic calmed & Tempo-30 road metrics...\n')
  const result = await fetchCalmedRoads()
  writeDataset(
    outputPath,
    { source: result.metadata.source, metadata: result.metadata, byId: result.byId },
    { minCount: 20_000, pretty: true },
  )
  process.stdout.write(
    `Wrote traffic calmed road metrics for ${result.metadata.regionCount} regions to ${outputPath}\n`,
  )
}
