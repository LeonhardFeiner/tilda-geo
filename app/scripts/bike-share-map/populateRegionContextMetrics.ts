#!/usr/bin/env bun
/**
 * Populates and aggregates context metrics (transit stop counts, station distance,
 * highway distance, and terrain flatness) for Landkreise (level 6) and Bundesländer (level 4).
 *
 * Runs once to update:
 *   - output/transit-stop-counts.json
 *   - output/highway-access.json
 *   - output/terrain-flatness.json
 *
 * buildViewer.ts then uses these to generate the viewer JSON files.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { bbox as bboxFn, booleanPointInPolygon, point } from '@turf/turf'
import type { MultiPolygon, Polygon } from 'geojson'
import { Client } from 'pg'
import sharp from 'sharp'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const scriptDir = import.meta.dir
const outDir = join(scriptDir, 'output')
const transitCountsPath = join(outDir, 'transit-stop-counts.json')
const highwayPath = join(outDir, 'highway-access.json')
const terrainPath = join(outDir, 'terrain-flatness.json')
const demographicsPath = join(outDir, 'gemeinde-demographics.json')
const statsMsgpackPath = join(outDir, 'viewer', 'stats-core.msgpack')

const cacheZipPath = '/tmp/Zensus2022_Bevoelkerungszahl.zip'

require('./output/viewer/statsMsgpack.js')
// @ts-expect-error StatsPack is global
const StatsPack = globalThis.StatsPack

function extractZipEntry(zip: Buffer, entryName: string) {
  const EOCD_SIGNATURE = 0x06054b50
  let eocdOffset = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) throw new Error('ZIP EOCD record not found')

  const centralDirOffset = zip.readUInt32LE(eocdOffset + 16)
  const totalEntries = zip.readUInt16LE(eocdOffset + 10)

  let offset = centralDirOffset
  for (let i = 0; i < totalEntries; i++) {
    const compressionMethod = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localHeaderOffset = zip.readUInt32LE(offset + 42)
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength)

    if (name === entryName) {
      const localNameLength = zip.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
      const compressed = zip.subarray(dataStart, dataStart + compressedSize)
      return compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed)
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`ZIP entry not found: ${entryName}`)
}

async function fetchPopulationGridPoints() {
  const zip = readFileSync(cacheZipPath)
  const csvBuf = extractZipEntry(zip, 'Zensus2022_Bevoelkerungszahl_100m-Gitter.csv')
  const lines = csvBuf.toString('utf8').split('\n')
  const xs: number[] = []
  const ys: number[] = []
  const einwohner: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const comma1 = line.indexOf(';')
    const comma2 = line.indexOf(';', comma1 + 1)
    const comma3 = line.indexOf(';', comma2 + 1)
    xs.push(Number(line.slice(comma1 + 1, comma2)))
    ys.push(Number(line.slice(comma2 + 1, comma3)))
    einwohner.push(Number(line.slice(comma3 + 1)))
  }
  return { xs, ys, einwohner }
}

const TILE_ZOOM = 10
const SAMPLE_STEP_DEG = 0.005
const SLOPE_EPS_DEG = 0.0015
const ROAD_SAMPLE_STEP_M = 300

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * 2 ** z)
}
function tileXToLon(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180
}
function tileYToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

type Tile = { data: Uint8Array; width: number; channels: number }

async function fetchTilesForBbox(minLon: number, minLat: number, maxLon: number, maxLat: number) {
  const xMin = lonToTileX(minLon, TILE_ZOOM)
  const xMax = lonToTileX(maxLon, TILE_ZOOM)
  const yMin = latToTileY(maxLat, TILE_ZOOM)
  const yMax = latToTileY(minLat, TILE_ZOOM)
  const coords: Array<[number, number]> = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) coords.push([x, y])
  }
  const tiles = new Map<string, Tile>()
  const CONCURRENCY = 24
  let nextIndex = 0
  async function worker() {
    for (;;) {
      const i = nextIndex++
      if (i >= coords.length) return
      const coord = coords[i]
      if (!coord) return
      const [x, y] = coord
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TILE_ZOOM}/${x}/${y}.png`
      const res = await fetch(url)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
        tiles.set(`${x},${y}`, { data, width: info.width, channels: info.channels })
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return tiles
}

function makeElevationSampler(tiles: Map<string, Tile>) {
  return function sampleElevation(lon: number, lat: number): number | null {
    const x = lonToTileX(lon, TILE_ZOOM)
    const y = latToTileY(lat, TILE_ZOOM)
    const tile = tiles.get(`${x},${y}`)
    if (!tile) return null
    const lonMin = tileXToLon(x, TILE_ZOOM)
    const lonMax = tileXToLon(x + 1, TILE_ZOOM)
    const latMax = tileYToLat(y, TILE_ZOOM)
    const latMin = tileYToLat(y + 1, TILE_ZOOM)
    const px = Math.min(
      tile.width - 1,
      Math.max(0, Math.floor(((lon - lonMin) / (lonMax - lonMin)) * tile.width)),
    )
    const py = Math.min(
      tile.width - 1,
      Math.max(0, Math.floor(((latMax - lat) / (latMax - latMin)) * tile.width)),
    )
    const idx = (py * tile.width + px) * tile.channels
    const r = tile.data[idx]
    const g = tile.data[idx + 1]
    const b = tile.data[idx + 2]
    if (r === undefined || g === undefined || b === undefined) return null
    return r * 256 + g + b / 256 - 32768
  }
}

function localSlope(
  sampleElevation: (lon: number, lat: number) => number | null,
  lon: number,
  lat: number,
) {
  const metersPerDegLat = 111_320
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180)
  const east = sampleElevation(lon + SLOPE_EPS_DEG, lat)
  const west = sampleElevation(lon - SLOPE_EPS_DEG, lat)
  const north = sampleElevation(lon, lat + SLOPE_EPS_DEG)
  const south = sampleElevation(lon, lat - SLOPE_EPS_DEG)
  if (east === null || west === null || north === null || south === null) return null
  const dzdx = (east - west) / (2 * SLOPE_EPS_DEG * metersPerDegLon)
  const dzdy = (north - south) / (2 * SLOPE_EPS_DEG * metersPerDegLat)
  return Math.sqrt(dzdx * dzdx + dzdy * dzdy)
}

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0
}

function areaTerrainStatsForPolygon(
  geometry: Polygon | MultiPolygon,
  sampleElevation: (lon: number, lat: number) => number | null,
) {
  const [minLon, minLat, maxLon, maxLat] = bboxFn({ type: 'Feature', properties: {}, geometry })
  const candidates: Array<[number, number]> = []
  for (let lon = minLon; lon <= maxLon; lon += SAMPLE_STEP_DEG) {
    for (let lat = minLat; lat <= maxLat; lat += SAMPLE_STEP_DEG) {
      if (booleanPointInPolygon(point([lon, lat]), geometry)) candidates.push([lon, lat])
    }
  }
  if (!candidates.length) {
    candidates.push([(minLon + maxLon) / 2, (minLat + maxLat) / 2])
  }
  const slopes: number[] = []
  const elevations: number[] = []
  for (const [lon, lat] of candidates) {
    const elevation = sampleElevation(lon, lat)
    if (elevation !== null) elevations.push(elevation)
    const slope = localSlope(sampleElevation, lon, lat)
    if (slope !== null) slopes.push(slope)
  }
  return {
    slopePercent: slopes.length ? mean(slopes) * 100 : null,
    elevationMeanM: elevations.length ? mean(elevations) : null,
    elevationRangeM: elevations.length ? Math.max(...elevations) - Math.min(...elevations) : null,
  }
}

async function main() {
  process.stdout.write('Connecting to database and reading existing files...\n')
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  await client.query('SET statement_timeout = 0')

  const features = StatsPack.decodeRegionFeatures(readFileSync(statsMsgpackPath)) as Array<{
    properties: {
      id: string
      name: string
      level: string
      regionalschluessel?: string
      landkreis_id?: string
      bundesland_id?: string
      road_length?: Record<string, number>
    }
  }>

  const demo = JSON.parse(readFileSync(demographicsPath, 'utf8')) as {
    gemeinden: Array<{
      rs: string
      population: number
      areaKm2: number
    }>
  }
  const demoByRs = new Map(demo.gemeinden.map((g) => [g.rs, g]))

  const transitData = JSON.parse(readFileSync(transitCountsPath, 'utf8')) as {
    fetchedAt: string
    byId: Record<string, { stopCount?: number; avgDistanceToStationM?: number }>
  }
  const highwayData = JSON.parse(readFileSync(highwayPath, 'utf8')) as {
    fetchedAt: string
    byId: Record<string, { avgDistanceToHighwayM?: number }>
  }
  const terrainData = JSON.parse(readFileSync(terrainPath, 'utf8')) as {
    fetchedAt: string
    byId?: Record<
      string,
      {
        area?: number
        road?: number
        roadSteepP95?: number
        elevationMean?: number
        elevationRange?: number
      }
    >
  }
  const terrainById = terrainData.byId ?? {}

  // Group child Gemeinden by landkreis_id and bundesland_id
  const gemsByLkId = new Map<string, typeof features>()
  const gemsByBlId = new Map<string, typeof features>()
  for (const f of features) {
    if (String(f.properties?.level) === '8') {
      const lk = f.properties.landkreis_id
      if (lk) {
        const arr = gemsByLkId.get(lk) ?? []
        arr.push(f)
        gemsByLkId.set(lk, arr)
      }
      const bl = f.properties.bundesland_id
      if (bl) {
        const arr = gemsByBlId.get(bl) ?? []
        arr.push(f)
        gemsByBlId.set(bl, arr)
      }
    }
  }

  // 1. Stop counts for levels 4 and 6
  process.stdout.write('Fetching stop counts for levels 4 and 6...\n')
  const { rows: stopRows } = await client.query<{ id: string; stop_count: number }>(`
    SELECT al.id, count(pt.*)::int AS stop_count
    FROM public.aggregated_lengths al
    LEFT JOIN public."publicTransport" pt ON ST_Contains(al.geom, pt.geom)
    WHERE al.level IN ('4', '6')
    GROUP BY al.id
  `)
  for (const row of stopRows) {
    transitData.byId[row.id] ??= {}
    transitData.byId[row.id]!.stopCount = row.stop_count
  }

  // Identify target cities (kreisfreie Städte with no child Gemeinden + 3 Stadtstaaten)
  const targetCityIds: string[] = []
  for (const f of features) {
    if (String(f.properties?.level) === '6' && !gemsByLkId.has(f.properties.id)) {
      targetCityIds.push(f.properties.id)
    }
    if (
      String(f.properties?.level) === '4' &&
      ['relation/62422', 'relation/62782', 'relation/62559'].includes(f.properties.id)
    ) {
      targetCityIds.push(f.properties.id)
    }
  }
  process.stdout.write(`Target cities requiring direct spatial queries: ${targetCityIds.length}\n`)

  // 2. Population grid for cities
  process.stdout.write('Loading population grid points...\n')
  const { xs, ys, einwohner } = await fetchPopulationGridPoints()
  await client.query(
    `
    CREATE TEMP TABLE _population_grid_pts AS
    SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 3035), 3857) AS geom,
           ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 3035), 4326)) AS lat,
           einwohner
    FROM UNNEST($1::float8[], $2::float8[], $3::int[]) AS t(x, y, einwohner)
    `,
    [xs, ys, einwohner],
  )
  await client.query(`CREATE INDEX ON _population_grid_pts USING gist(geom)`)

  // Query stations distance for cities
  process.stdout.write('Computing station distance for cities...\n')
  const { rows: stRows } = await client.query<{ id: string; avg_dist_m: number }>(
    `
    SELECT al.id,
           SUM(nearest.dist * cos(radians(pt.lat)) * pt.einwohner) / SUM(pt.einwohner) AS avg_dist_m
    FROM public.aggregated_lengths al
    JOIN _population_grid_pts pt ON pt.geom && al.geom
    CROSS JOIN LATERAL (
      SELECT geom <-> pt.geom AS dist FROM public."publicTransport" ORDER BY geom <-> pt.geom LIMIT 1
    ) nearest
    WHERE al.id = ANY($1::text[]) AND ST_Contains(al.geom, pt.geom)
    GROUP BY al.id
    `,
    [targetCityIds],
  )
  for (const row of stRows) {
    transitData.byId[row.id] ??= {}
    transitData.byId[row.id]!.avgDistanceToStationM = row.avg_dist_m
  }

  // Query highway distance for cities
  process.stdout.write('Computing highway distance for cities...\n')
  await client.query(`
    CREATE TEMP TABLE _highways AS
    SELECT geom FROM public.roads
    WHERE tags->>'road' IN ('motorway', 'trunk', 'motorway_link', 'trunk_link');
    CREATE INDEX ON _highways USING gist(geom);
  `)
  const { rows: hwRows } = await client.query<{ id: string; avg_dist_m: number }>(
    `
    SELECT al.id,
           SUM(nearest.dist * cos(radians(pt.lat)) * pt.einwohner) / SUM(pt.einwohner) AS avg_dist_m
    FROM public.aggregated_lengths al
    JOIN _population_grid_pts pt ON pt.geom && al.geom
    CROSS JOIN LATERAL (
      SELECT geom <-> pt.geom AS dist FROM _highways ORDER BY geom <-> pt.geom LIMIT 1
    ) nearest
    WHERE al.id = ANY($1::text[]) AND ST_Contains(al.geom, pt.geom)
    GROUP BY al.id
    `,
    [targetCityIds],
  )
  for (const row of hwRows) {
    highwayData.byId[row.id] ??= {}
    highwayData.byId[row.id]!.avgDistanceToHighwayM = row.avg_dist_m
  }

  // 3. Aggregate station and highway distances for Landkreise with child Gemeinden
  process.stdout.write(
    'Aggregating station and highway distances for Landkreise and Bundesländer...\n',
  )
  for (const lkId of gemsByLkId.keys()) {
    const gems = gemsByLkId.get(lkId) ?? []
    let sumPop = 0
    let sumDistSt = 0
    let sumDistHw = 0
    for (const g of gems) {
      const p = demoByRs.get(g.properties.regionalschluessel ?? '')?.population ?? 0
      const st = transitData.byId[g.properties.id]?.avgDistanceToStationM
      const hw = highwayData.byId[g.properties.id]?.avgDistanceToHighwayM
      if (p > 0) {
        sumPop += p
        if (typeof st === 'number') sumDistSt += st * p
        if (typeof hw === 'number') sumDistHw += hw * p
      }
    }
    if (sumPop > 0) {
      transitData.byId[lkId] ??= {}
      transitData.byId[lkId]!.avgDistanceToStationM = sumDistSt / sumPop
      highwayData.byId[lkId] ??= {}
      highwayData.byId[lkId]!.avgDistanceToHighwayM = sumDistHw / sumPop
    }
  }

  // Aggregate for Bundesländer (excluding Stadtstaaten which were already queried directly)
  for (const blId of gemsByBlId.keys()) {
    if (['relation/62422', 'relation/62782', 'relation/62559'].includes(blId)) continue
    const gems = gemsByBlId.get(blId) ?? []
    let sumPop = 0
    let sumDistSt = 0
    let sumDistHw = 0
    for (const g of gems) {
      const p = demoByRs.get(g.properties.regionalschluessel ?? '')?.population ?? 0
      const st = transitData.byId[g.properties.id]?.avgDistanceToStationM
      const hw = highwayData.byId[g.properties.id]?.avgDistanceToHighwayM
      if (p > 0) {
        sumPop += p
        if (typeof st === 'number') sumDistSt += st * p
        if (typeof hw === 'number') sumDistHw += hw * p
      }
    }
    if (sumPop > 0) {
      transitData.byId[blId] ??= {}
      transitData.byId[blId]!.avgDistanceToStationM = sumDistSt / sumPop
      highwayData.byId[blId] ??= {}
      highwayData.byId[blId]!.avgDistanceToHighwayM = sumDistHw / sumPop
    }
  }

  // 4. Terrain for cities
  process.stdout.write('Fetching geometries and road points for cities terrain...\n')
  const { rows: geoms } = await client.query<{ id: string; geometry: string }>(
    `
    SELECT id, ST_AsGeoJSON(ST_Transform(ST_MakeValid(geom), 4326)) AS geometry
    FROM public.aggregated_lengths
    WHERE id = ANY($1::text[])
    `,
    [targetCityIds],
  )
  await client.query(`
    CREATE TEMP TABLE _terrain_road_pts AS
    SELECT (ST_DumpPoints(
      ST_LineInterpolatePoints(
        r.geom,
        LEAST(0.5, GREATEST(0.05, ${ROAD_SAMPLE_STEP_M} / NULLIF((r.tags->>'length')::float8, 0)))::float8,
        true
      )
    )).geom AS geom
    FROM public.roads r
    WHERE r.geom IS NOT NULL
  `)
  await client.query(`CREATE INDEX ON _terrain_road_pts USING gist(geom)`)
  const { rows: roadPoints } = await client.query<{ city_id: string; lon: number; lat: number }>(
    `
    SELECT al.id AS city_id,
           ST_X(ST_Transform(pt.geom, 4326)) AS lon,
           ST_Y(ST_Transform(pt.geom, 4326)) AS lat
    FROM public.aggregated_lengths al
    JOIN _terrain_road_pts pt ON pt.geom && al.geom
    WHERE al.id = ANY($1::text[]) AND ST_Contains(al.geom, pt.geom)
    `,
    [targetCityIds],
  )
  await client.end()

  process.stdout.write('Fetching DEM tiles for cities...\n')
  const GERMANY_BBOX = { minLon: 5.8663, minLat: 47.2701, maxLon: 15.0419, maxLat: 55.0992 }
  const tiles = await fetchTilesForBbox(
    GERMANY_BBOX.minLon,
    GERMANY_BBOX.minLat,
    GERMANY_BBOX.maxLon,
    GERMANY_BBOX.maxLat,
  )
  const sampleElevation = makeElevationSampler(tiles)

  process.stdout.write('Computing area terrain stats for cities...\n')
  for (const row of geoms) {
    const geometry = JSON.parse(row.geometry) as Polygon | MultiPolygon
    const stats = areaTerrainStatsForPolygon(geometry, sampleElevation)
    terrainById[row.id] ??= {}
    if (stats.slopePercent !== null) terrainById[row.id]!.area = stats.slopePercent
    if (stats.elevationMeanM !== null) terrainById[row.id]!.elevationMean = stats.elevationMeanM
    if (stats.elevationRangeM !== null) terrainById[row.id]!.elevationRange = stats.elevationRangeM
  }

  process.stdout.write('Computing road terrain stats for cities...\n')
  const roadSlopesByCity = new Map<string, number[]>()
  for (const { city_id, lon, lat } of roadPoints) {
    const slope = localSlope(sampleElevation, lon, lat)
    if (slope !== null) {
      const arr = roadSlopesByCity.get(city_id) ?? []
      arr.push(slope)
      roadSlopesByCity.set(city_id, arr)
    }
  }
  for (const [id, slopes] of roadSlopesByCity) {
    terrainById[id] ??= {}
    terrainById[id]!.road = mean(slopes) * 100
    terrainById[id]!.roadSteepP95 = percentile(slopes, 0.95) * 100
  }

  // 5. Aggregate terrain for Landkreise with child Gemeinden
  process.stdout.write('Aggregating terrain for Landkreise and Bundesländer...\n')
  for (const lkId of gemsByLkId.keys()) {
    const gems = gemsByLkId.get(lkId) ?? []
    let sumArea = 0
    let sumRoad = 0
    let sumSlopeArea = 0
    let sumSlopeRoad = 0
    let sumSlopeSteep = 0
    let sumElev = 0
    let minElev = Infinity
    let maxElev = -Infinity

    for (const g of gems) {
      const a = demoByRs.get(g.properties.regionalschluessel ?? '')?.areaKm2 ?? 1
      const r =
        Object.values(g.properties.road_length ?? {}).reduce(
          (acc, v) => acc + (typeof v === 'number' ? v : 0),
          0,
        ) / 1000
      const t = terrainById[g.properties.id]
      if (t) {
        if (typeof t.area === 'number') {
          sumArea += a
          sumSlopeArea += t.area * a
        }
        if (typeof t.road === 'number' && r > 0) {
          sumRoad += r
          sumSlopeRoad += t.road * r
          if (typeof t.roadSteepP95 === 'number') sumSlopeSteep += t.roadSteepP95 * r
        }
        if (typeof t.elevationMean === 'number') {
          sumElev += t.elevationMean * a
          const range = t.elevationRange ?? 0
          minElev = Math.min(minElev, t.elevationMean - range / 2)
          maxElev = Math.max(maxElev, t.elevationMean + range / 2)
        }
      }
    }

    terrainById[lkId] ??= {}
    if (sumArea > 0) terrainById[lkId]!.area = sumSlopeArea / sumArea
    if (sumRoad > 0) {
      terrainById[lkId]!.road = sumSlopeRoad / sumRoad
      terrainById[lkId]!.roadSteepP95 = sumSlopeSteep / sumRoad
    }
    if (sumArea > 0 && Number.isFinite(minElev) && Number.isFinite(maxElev)) {
      terrainById[lkId]!.elevationMean = sumElev / sumArea
      terrainById[lkId]!.elevationRange = maxElev - minElev
    }
  }

  // Aggregate terrain for Bundesländer (excluding Stadtstaaten)
  for (const blId of gemsByBlId.keys()) {
    if (['relation/62422', 'relation/62782', 'relation/62559'].includes(blId)) continue
    const gems = gemsByBlId.get(blId) ?? []
    let sumArea = 0
    let sumRoad = 0
    let sumSlopeArea = 0
    let sumSlopeRoad = 0
    let sumSlopeSteep = 0
    let sumElev = 0
    let minElev = Infinity
    let maxElev = -Infinity

    for (const g of gems) {
      const a = demoByRs.get(g.properties.regionalschluessel ?? '')?.areaKm2 ?? 1
      const r =
        Object.values(g.properties.road_length ?? {}).reduce(
          (acc, v) => acc + (typeof v === 'number' ? v : 0),
          0,
        ) / 1000
      const t = terrainById[g.properties.id]
      if (t) {
        if (typeof t.area === 'number') {
          sumArea += a
          sumSlopeArea += t.area * a
        }
        if (typeof t.road === 'number' && r > 0) {
          sumRoad += r
          sumSlopeRoad += t.road * r
          if (typeof t.roadSteepP95 === 'number') sumSlopeSteep += t.roadSteepP95 * r
        }
        if (typeof t.elevationMean === 'number') {
          sumElev += t.elevationMean * a
          const range = t.elevationRange ?? 0
          minElev = Math.min(minElev, t.elevationMean - range / 2)
          maxElev = Math.max(maxElev, t.elevationMean + range / 2)
        }
      }
    }

    terrainById[blId] ??= {}
    if (sumArea > 0) terrainById[blId]!.area = sumSlopeArea / sumArea
    if (sumRoad > 0) {
      terrainById[blId]!.road = sumSlopeRoad / sumRoad
      terrainById[blId]!.roadSteepP95 = sumSlopeSteep / sumRoad
    }
    if (sumArea > 0 && Number.isFinite(minElev) && Number.isFinite(maxElev)) {
      terrainById[blId]!.elevationMean = sumElev / sumArea
      terrainById[blId]!.elevationRange = maxElev - minElev
    }
  }

  // Write updated files
  process.stdout.write('Writing updated JSON files...\n')
  writeFileSync(transitCountsPath, JSON.stringify(transitData))
  writeFileSync(highwayPath, JSON.stringify(highwayData))
  writeFileSync(
    terrainPath,
    JSON.stringify({ fetchedAt: new Date().toISOString(), byId: terrainById }),
  )

  process.stdout.write('Done! Updated transit-stop-counts, highway-access, and terrain-flatness.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
