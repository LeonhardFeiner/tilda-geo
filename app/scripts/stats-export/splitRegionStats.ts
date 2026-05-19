import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { featureCollection } from '@turf/helpers'
import type { Feature, Geometry, GeoJsonProperties } from 'geojson'
import {
  DEUTSCHLAND_GEBIET,
  STADTSTAAT_IDS,
  type RegionRef,
  type StatsFeature,
} from '../bike-share-map/regionNavigation'

export type RegionStatsManifestV3 = {
  version: 3
  deutschlandId: string | null
  deutschlandUrl: string
  stadtstaatIds: string[]
  kreisfreieStaedteIds: string[]
  bundeslaender: BundeslandManifestEntry[]
}

export type RegionNavRef = RegionRef & {
  parentId?: string
}

export type BundeslandManifestEntry = {
  id: string
  name: string
  featuresUrl: string
  regierungsbezirke: RegionNavRef[]
  landkreise: RegionNavRef[]
  kreisfreie: RegionNavRef[]
  stadtbezirke: RegionNavRef[]
}

function regionLevel(f: StatsFeature) {
  return String(f.properties?.level ?? '')
}

function regionId(f: StatsFeature) {
  return String(f.properties?.id ?? '')
}

function bundeslandIdFor(f: StatsFeature) {
  return String(f.properties?.bundesland_id ?? '')
}

function statsFeatureCollection(features: StatsFeature[]) {
  return featureCollection(features as Feature<Geometry, GeoJsonProperties>[])
}

export function safeRegionFilename(id: string) {
  return id.replace(/\//g, '-')
}

export function writeSplitRegionStats(
  features: StatsFeature[],
  outDir: string,
  options?: { writeMonolithic?: boolean },
) {
  const regionsDir = join(outDir, 'regions')
  const bundeslandDir = join(regionsDir, 'bundesland')
  mkdirSync(bundeslandDir, { recursive: true })

  let deutschlandId: string | null = null
  const deutschlandFeatures: StatsFeature[] = []
  const byBundesland = new Map<string, StatsFeature[]>()
  const bundeslandMeta = new Map<string, { name: string }>()

  for (const f of features) {
    const id = regionId(f)
    const level = regionLevel(f)
    if (!id) continue

    if (level === '2') {
      deutschlandId = id
      deutschlandFeatures.push(f)
      continue
    }

    if (level === '4') {
      deutschlandFeatures.push(f)
      bundeslandMeta.set(id, { name: String(f.properties?.name ?? id) })
      if (!byBundesland.has(id)) byBundesland.set(id, [])
      byBundesland.get(id)?.push(f)
      continue
    }

    if (level === '5' || level === '6') {
      deutschlandFeatures.push(f)
    }

    const bl = bundeslandIdFor(f)
    if (bl) {
      if (!byBundesland.has(bl)) byBundesland.set(bl, [])
      byBundesland.get(bl)?.push(f)
    }
  }

  for (const f of features) {
    const level = regionLevel(f)
    if (level === '2' || level === '4' || level === '5' || level === '6') continue
    const bl = bundeslandIdFor(f)
    if (!bl) continue
    if (!byBundesland.has(bl)) byBundesland.set(bl, [])
    byBundesland.get(bl)?.push(f)
  }

  const deutschlandPath = join(regionsDir, 'deutschland.geojson')
  writeFileSync(deutschlandPath, `${JSON.stringify(statsFeatureCollection(deutschlandFeatures))}\n`)

  const landkreisWithGemeinden = new Set<string>()
  for (const f of features) {
    if (regionLevel(f) !== '8') continue
    const lk = f.properties?.landkreis_id
    if (lk) landkreisWithGemeinden.add(lk)
  }

  const kreisfreieIds = new Set<string>()
  for (const f of features) {
    if (regionLevel(f) !== '6') continue
    const id = regionId(f)
    if (!landkreisWithGemeinden.has(id)) kreisfreieIds.add(id)
  }

  const bundeslaender: BundeslandManifestEntry[] = []

  for (const [blId, blFeatures] of byBundesland) {
    const meta = bundeslandMeta.get(blId)
    const name = meta?.name ?? blId
    const fileName = `${safeRegionFilename(blId)}.geojson`
    const filePath = join(bundeslandDir, fileName)
    writeFileSync(filePath, `${JSON.stringify(statsFeatureCollection(blFeatures))}\n`)

    const regierungsbezirke: RegionNavRef[] = []
    const landkreise: RegionNavRef[] = []
    const kreisfreie: RegionNavRef[] = []
    const stadtbezirke: RegionNavRef[] = []

    for (const f of blFeatures) {
      const id = regionId(f)
      const level = regionLevel(f)
      const parentId = f.properties?.parent_id ? String(f.properties.parent_id) : undefined
      const ref = {
        id,
        name: String(f.properties?.name ?? id),
        level,
        ...(parentId ? { parentId } : {}),
      }
      if (level === '5') regierungsbezirke.push(ref)
      else if (level === '6') {
        if (kreisfreieIds.has(id)) kreisfreie.push(ref)
        else landkreise.push(ref)
      } else if (level === '9' || level === '10') stadtbezirke.push(ref)
    }

    const sortByName = (a: RegionNavRef, b: RegionNavRef) => a.name.localeCompare(b.name, 'de')
    regierungsbezirke.sort(sortByName)
    landkreise.sort(sortByName)
    kreisfreie.sort(sortByName)
    stadtbezirke.sort(sortByName)

    bundeslaender.push({
      id: blId,
      name,
      featuresUrl: `./regions/bundesland/${fileName}`,
      regierungsbezirke,
      landkreise,
      kreisfreie,
      stadtbezirke,
    })
  }

  bundeslaender.sort((a, b) => a.name.localeCompare(b.name, 'de'))

  const manifest: RegionStatsManifestV3 = {
    version: 3,
    deutschlandId,
    deutschlandUrl: './regions/deutschland.geojson',
    stadtstaatIds: bundeslaender.filter((b) => STADTSTAAT_IDS.has(b.id)).map((b) => b.id),
    kreisfreieStaedteIds: [...kreisfreieIds],
    bundeslaender,
  }

  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  if (options?.writeMonolithic !== false) {
    writeFileSync(join(outDir, 'stats.geojson'), `${JSON.stringify(statsFeatureCollection(features))}\n`)
  }

  return {
    manifest,
    deutschlandFeatureCount: deutschlandFeatures.length,
    bundeslandFileCount: bundeslaender.length,
    deutschlandPath,
  }
}

export function manifestEntryForGebiet(manifest: RegionStatsManifestV3, gebiet: string) {
  if (gebiet === DEUTSCHLAND_GEBIET) return null
  return manifest.bundeslaender.find((b) => b.id === gebiet) ?? null
}
