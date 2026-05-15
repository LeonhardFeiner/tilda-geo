import { readFileSync } from 'node:fs'
import { booleanPointInPolygon, centroid } from '@turf/turf'
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson'
import { BAYERN_ID } from './constants'
import type { LandkreisRef } from './resolveLandkreis'
import type { RegionStat, StatsFilter } from './types'

function parseIntCell(value: string | undefined) {
  const n = Number.parseInt((value ?? '').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function sumPrefixedColumns(row: Record<string, string>, prefix: string) {
  let total = 0
  for (const [key, raw] of Object.entries(row)) {
    if (!key.startsWith(prefix)) continue
    total += parseIntCell(raw)
  }
  return total
}

function sumLengthRecord(value: unknown) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return 0
  let total = 0
  for (const raw of Object.values(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n)) total += n
  }
  return total
}

function rowMatchesFilter(row: Record<string, string>, filter: StatsFilter) {
  if (row.level !== filter.level) return false
  if (filter.landkreisId && row.landkreis_id !== filter.landkreisId) return false
  if (filter.bundeslandId && row.bundesland_id !== filter.bundeslandId) return false
  return true
}

export function parseStatsCsv(csvPath: string, filter: StatsFilter) {
  const text = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.length > 0)
  const headers = headerLine.split(',')

  const rows: Record<string, string>[] = []
  for (const line of lines) {
    const values = line.split(',')
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i] ?? ''] = values[i] ?? ''
    }
    rows.push(row)
  }

  const hasRoadSum = headers.includes('road_sum_sum')
  const hasBikelaneSum = headers.includes('bikelane_sum_sum')

  const stats: RegionStat[] = []
  for (const row of rows) {
    if (!rowMatchesFilter(row, filter)) continue

    const roadSumKm = hasRoadSum ? parseIntCell(row.road_sum_sum) : sumPrefixedColumns(row, 'road_')
    const bikelaneSumKm = hasBikelaneSum
      ? parseIntCell(row.bikelane_sum_sum)
      : sumPrefixedColumns(row, 'bikelane_')

    const bikeSharePct = roadSumKm > 0 ? (bikelaneSumKm / roadSumKm) * 100 : null

    stats.push({
      id: row.id,
      name: row.name,
      roadSumKm,
      bikelaneSumKm,
      bikeSharePct,
    })
  }

  stats.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return stats
}

function isPolygonGeometry(geometry: Geometry): geometry is Polygon | MultiPolygon {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'
}

function featureMatchesFilter(
  properties: Record<string, unknown>,
  filter: StatsFilter,
  bundeslandIdFromParent?: string,
) {
  const level = String(properties.level ?? '')
  if (level !== filter.level) return false
  if (filter.bundeslandId) {
    const bl = properties.bundesland_id ?? bundeslandIdFromParent
    if (bl !== filter.bundeslandId) return false
  }
  if (filter.landkreisId && properties.landkreis_id !== filter.landkreisId) return false
  return true
}

function findBayernFeature(geojson: FeatureCollection) {
  for (const feature of geojson.features) {
    const p = feature.properties
    if (!p || String(p.level) !== '4') continue
    if (p.id === BAYERN_ID || p.name === 'Bayern') {
      if (feature.geometry && isPolygonGeometry(feature.geometry)) return feature
    }
  }
  return null
}

function isInsideRegion(feature: Feature<Geometry>, region: Feature<Polygon | MultiPolygon>) {
  const c = centroid(feature)
  return booleanPointInPolygon(c, region)
}

function findLandkreisFeature(geojson: FeatureCollection, landkreis: LandkreisRef) {
  for (const feature of geojson.features) {
    const p = feature.properties
    if (!p || String(p.level) !== '6') continue
    if (p.id === landkreis.id) {
      if (feature.geometry && isPolygonGeometry(feature.geometry)) return feature
    }
  }
  for (const feature of geojson.features) {
    const p = feature.properties
    if (!p || String(p.level) !== '6') continue
    const name = String(p.name ?? '')
    if (
      name === landkreis.name ||
      name.toLowerCase().includes(landkreis.name.toLowerCase()) ||
      landkreis.name.toLowerCase().includes(name.toLowerCase())
    ) {
      if (feature.geometry && isPolygonGeometry(feature.geometry)) return feature
    }
  }
  return null
}

function statFromFeatureProperties(p: Record<string, unknown>) {
  const roadSumKm = sumLengthRecord(p.road_length)
  const bikelaneSumKm = sumLengthRecord(p.bikelane_length)
  const bikeSharePct = roadSumKm > 0 ? (bikelaneSumKm / roadSumKm) * 100 : null
  const name = String(p.name ?? p.id ?? '')
  const stat: RegionStat = {
    id: String(p.id ?? ''),
    name,
    roadSumKm,
    bikelaneSumKm,
    bikeSharePct,
  }
  return {
    ...stat,
    label: `${name}: ${bikeSharePct?.toFixed(1) ?? '–'} % Radinfra (an Straßen km)`,
  }
}

export function buildLandkreisGemeindenFromStatsGeojson(
  geojson: FeatureCollection,
  landkreis: LandkreisRef,
  gemeindeIdsFromCsv?: Set<string>,
) {
  const landkreisFeature = findLandkreisFeature(geojson, landkreis)
  if (!landkreisFeature) {
    throw new Error(
      `Landkreis polygon not found in stats GeoJSON: ${landkreis.name} (${landkreis.id})`,
    )
  }

  const features: Feature<Geometry, RegionStat & { label: string }>[] = []

  for (const feature of geojson.features) {
    if (!feature.geometry || !isPolygonGeometry(feature.geometry)) continue
    const p = feature.properties ?? {}
    if (String(p.level) !== '8') continue

    const id = String(p.id ?? '')
    const inCsv = gemeindeIdsFromCsv?.has(id) ?? false
    const inPolygon = isInsideRegion(feature, landkreisFeature)
    const landkreisIdMatch = String(p.landkreis_id ?? '') === landkreis.id

    if (!inCsv && !inPolygon && !landkreisIdMatch) continue

    features.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: statFromFeatureProperties(p),
    })
  }

  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))

  return {
    type: 'FeatureCollection',
    features,
  } satisfies FeatureCollection
}

export function gemeindeIdsForLandkreisFromCsv(csvPath: string, landkreisId: string) {
  const stats = parseStatsCsv(csvPath, { level: '8', landkreisId })
  return new Set(stats.map((s) => s.id))
}

export function buildFeatureCollectionFromStatsGeojson(
  geojson: FeatureCollection,
  filter: StatsFilter,
) {
  const bayernFeature = filter.bundeslandId === BAYERN_ID ? findBayernFeature(geojson) : null

  const features: Feature<Geometry, RegionStat & { label: string }>[] = []

  for (const feature of geojson.features) {
    if (!feature.geometry || !isPolygonGeometry(feature.geometry)) continue
    const p = feature.properties ?? {}
    const landkreisId = String(p.landkreis_id ?? '')
    const bundeslandId = String(p.bundesland_id ?? '')

    const props = { ...p, landkreis_id: landkreisId, bundesland_id: bundeslandId }
    if (!featureMatchesFilter(props, filter, bundeslandId)) {
      if (
        filter.bundeslandId === BAYERN_ID &&
        bayernFeature &&
        isInsideRegion(feature, bayernFeature)
      ) {
        if (String(p.level) !== filter.level) continue
      } else {
        continue
      }
    }

    features.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: statFromFeatureProperties(p),
    })
  }

  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))

  return {
    type: 'FeatureCollection',
    features,
  } satisfies FeatureCollection
}

export async function loadStatsGeojson(source: string) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    process.stdout.write(`Fetching stats GeoJSON: ${source}\n`)
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Failed to fetch stats GeoJSON: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as FeatureCollection
  }
  return JSON.parse(readFileSync(source, 'utf8')) as FeatureCollection
}
