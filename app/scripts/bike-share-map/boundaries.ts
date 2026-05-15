import { readFileSync, writeFileSync } from 'node:fs'
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson'
import type { RegionStat } from './types'

type BoundaryProperties = {
  id: string
  name: string
}

type BoundaryFeature = Feature<Polygon | MultiPolygon, BoundaryProperties>

const NAME_ALIASES: Record<string, string[]> = {
  'Rohrbach an der Ilm': ['Rohrbach'],
}

function normalizeName(name: string) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function loadGeoJsonFile(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as FeatureCollection
}

async function fetchBoundaryFromOverpass(osmId: string) {
  const numericId = osmId.replace(/^relation\//, '')
  const query = `
    [out:json][timeout:60];
    relation(${numericId});
    out geom;
  `
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!response.ok) {
    throw new Error(`Overpass ${response.status} for ${osmId}`)
  }

  const data = (await response.json()) as {
    elements: Array<{
      type: string
      id: number
      members?: Array<{
        type: string
        role: string
        geometry?: Array<{ lat: number; lon: number }>
      }>
    }>
  }

  const relation = data.elements.find((el) => el.type === 'relation')
  if (!relation?.members) return null

  const outerRings: number[][][] = []
  for (const member of relation.members) {
    if (member.role !== 'outer' || !member.geometry?.length) continue
    outerRings.push(member.geometry.map((p) => [p.lon, p.lat]))
  }
  if (outerRings.length === 0) return null

  const geometry: Polygon | MultiPolygon =
    outerRings.length === 1
      ? { type: 'Polygon', coordinates: [outerRings[0]!] }
      : { type: 'MultiPolygon', coordinates: outerRings.map((ring) => [ring]) }

  return geometry
}

export async function loadGemeindeBoundaries(options: {
  stats: RegionStat[]
  boundariesPath: string
  fetchMissing: boolean
  cachePath?: string
}) {
  const file = loadGeoJsonFile(options.boundariesPath)
  const byId = new Map<string, BoundaryFeature>()
  const byName = new Map<string, BoundaryFeature>()

  for (const feature of file.features) {
    if (!feature.geometry) continue
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue
    const id = String(feature.properties?.id ?? '')
    const name = String(feature.properties?.gemeinde ?? feature.properties?.name ?? '')
    const boundary: BoundaryFeature = {
      type: 'Feature',
      geometry: feature.geometry,
      properties: { id, name },
    }
    if (id) byId.set(id, boundary)
    if (name) byName.set(normalizeName(name), boundary)
  }

  const missing: RegionStat[] = []
  const resolved: BoundaryFeature[] = []

  for (const stat of options.stats) {
    let feature = byId.get(stat.id)
    if (!feature) {
      feature = byName.get(normalizeName(stat.name))
    }
    if (!feature) {
      for (const alias of NAME_ALIASES[stat.name] ?? []) {
        feature = byName.get(normalizeName(alias))
        if (feature) break
      }
    }
    if (feature) {
      if (feature.properties.id && feature.properties.id !== stat.id) {
        process.stderr.write(
          `  Boundary id mismatch for ${stat.name}: geojson has ${feature.properties.id}, stats ${stat.id} (using name match; prefer --fetch-missing-boundaries or /api/stats geometries)\n`,
        )
      }
      resolved.push({
        ...feature,
        properties: { id: stat.id, name: stat.name },
      })
    } else {
      missing.push(stat)
    }
  }

  if (missing.length > 0 && options.fetchMissing) {
    for (const stat of missing) {
      process.stdout.write(`Fetching boundary ${stat.name} (${stat.id})…\n`)
      const geometry = await fetchBoundaryFromOverpass(stat.id)
      if (!geometry) {
        process.stderr.write(`  No geometry from Overpass for ${stat.id}\n`)
        continue
      }
      const feature: BoundaryFeature = {
        type: 'Feature',
        geometry,
        properties: { id: stat.id, name: stat.name },
      }
      resolved.push(feature)
      await new Promise((r) => setTimeout(r, 1100))
    }

    if (options.cachePath) {
      const merged: FeatureCollection = {
        type: 'FeatureCollection',
        features: resolved.map((f) => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: { gemeinde: f.properties.name, id: f.properties.id },
        })),
      }
      writeFileSync(options.cachePath, `${JSON.stringify(merged)}\n`, 'utf8')
      process.stdout.write(`Wrote cached boundaries: ${options.cachePath}\n`)
    }
  } else if (missing.length > 0) {
    process.stderr.write(
      `Missing boundaries for ${missing.length} Gemeinden (use --fetch-missing-boundaries):\n`,
    )
    for (const stat of missing) {
      process.stderr.write(`  - ${stat.name} (${stat.id})\n`)
    }
  }

  return resolved
}

export function mergeStatsWithBoundaries(stats: RegionStat[], boundaries: BoundaryFeature[]) {
  const statById = new Map(stats.map((s) => [s.id, s]))
  const features: Feature<Geometry, RegionStat & { label: string }>[] = []

  for (const boundary of boundaries) {
    const stat = statById.get(boundary.properties.id)
    if (!stat) continue
    features.push({
      type: 'Feature',
      geometry: boundary.geometry,
      properties: {
        ...stat,
        label: `${stat.name}: ${stat.bikeSharePct?.toFixed(1) ?? '–'} % Radinfra (an Straßen km)`,
      },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  } satisfies FeatureCollection
}
