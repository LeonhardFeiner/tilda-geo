#!/usr/bin/env bun
/**
 * Estimates terrain flatness per Gemeinde (level 8, from `public.aggregated_lengths`) as the
 * mean local slope (in %, i.e. rise/run × 100) sampled on a grid inside each Gemeinde polygon.
 *
 * Elevation source: Mapzen/Terrarium terrain-RGB tiles on the public AWS Open Data bucket
 * `elevation-tiles-prod` (no auth, derived from SRTM/ASTER/etc. — see
 * https://github.com/tilezen/joerd/blob/master/docs/formats.md). No PostGIS raster / GDAL
 * involved — this reads tiles with `sharp` and does the grid sampling + slope math in JS,
 * since this Postgres image doesn't have GDAL raster drivers and the repo has no
 * gdal/rasterio toolchain otherwise.
 *
 * Needs local Postgres with `public.aggregated_lengths` populated (level 8), and network
 * access to the tile bucket (~1,100 small PNGs at TILE_ZOOM=10 for all of Germany).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bbox as bboxFn, booleanPointInPolygon, point } from '@turf/turf'
import type { MultiPolygon, Polygon } from 'geojson'
import { Client } from 'pg'
import sharp from 'sharp'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'terrain-flatness.json')

/** Same bbox used for the publicTransport processing run (covers all of Germany). */
const GERMANY_BBOX = { minLon: 5.8663, minLat: 47.2701, maxLon: 15.0419, maxLat: 55.0992 }

/** ~150m/pixel at German latitudes — enough sub-Gemeinde resolution without tens of thousands of tile requests. */
const TILE_ZOOM = 10
/** Grid spacing for interior sample points, in degrees (~500m) — small vs. even compact Gemeinden. */
const SAMPLE_STEP_DEG = 0.005
/** Offset for the finite-difference slope estimate, in degrees (~150m, ~1 tile pixel). */
const SLOPE_EPS_DEG = 0.0015

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

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

/** Fetches and decodes all Terrarium tiles covering `bbox` at `zoom`, keyed by "x,y". */
async function fetchTiles(bbox: typeof GERMANY_BBOX, zoom: number) {
  const xMin = lonToTileX(bbox.minLon, zoom)
  const xMax = lonToTileX(bbox.maxLon, zoom)
  const yMin = latToTileY(bbox.maxLat, zoom)
  const yMax = latToTileY(bbox.minLat, zoom)
  const coords: Array<[number, number]> = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) coords.push([x, y])
  }

  const tiles = new Map<string, Tile>()
  const CONCURRENCY = 24
  let nextIndex = 0
  let fetched = 0
  async function worker() {
    for (;;) {
      const i = nextIndex++
      if (i >= coords.length) return
      const coord = coords[i]
      if (!coord) return
      const [x, y] = coord
      const res = await fetch(TILE_URL(zoom, x, y))
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
        tiles.set(`${x},${y}`, { data, width: info.width, channels: info.channels })
      }
      fetched++
      if (fetched % 100 === 0) {
        process.stdout.write(`  tiles: ${fetched}/${coords.length}\n`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stdout.write(`Fetched ${tiles.size}/${coords.length} tiles at zoom ${zoom}\n`)
  return tiles
}

/** Elevation sampler backed by the tile cache. Returns null outside covered tiles. */
function makeElevationSampler(tiles: Map<string, Tile>, zoom: number) {
  return function sampleElevation(lon: number, lat: number): number | null {
    const x = lonToTileX(lon, zoom)
    const y = latToTileY(lat, zoom)
    const tile = tiles.get(`${x},${y}`)
    if (!tile) return null
    const lonMin = tileXToLon(x, zoom)
    const lonMax = tileXToLon(x + 1, zoom)
    const latMax = tileYToLat(y, zoom)
    const latMin = tileYToLat(y + 1, zoom)
    const px = Math.min(tile.width - 1, Math.max(0, Math.floor(((lon - lonMin) / (lonMax - lonMin)) * tile.width)))
    const py = Math.min(tile.width - 1, Math.max(0, Math.floor(((latMax - lat) / (latMax - latMin)) * tile.width)))
    const idx = (py * tile.width + px) * tile.channels
    const r = tile.data[idx]
    const g = tile.data[idx + 1]
    const b = tile.data[idx + 2]
    if (r === undefined || g === undefined || b === undefined) return null
    return r * 256 + g + b / 256 - 32768
  }
}

/** Local slope magnitude (rise/run, unitless) at a point via central finite differences. */
function localSlope(sampleElevation: (lon: number, lat: number) => number | null, lon: number, lat: number) {
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

async function fetchGemeindeGeometries() {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
    const { rows } = await client.query<{ id: string; geometry: string }>(`
      SELECT id, ST_AsGeoJSON(ST_Transform(ST_MakeValid(geom), 4326)) AS geometry
      FROM public.aggregated_lengths
      WHERE level = '8'
    `)
    return rows
  } finally {
    await client.end()
  }
}

function meanSlopePercentForPolygon(
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
    const centerLon = (minLon + maxLon) / 2
    const centerLat = (minLat + maxLat) / 2
    candidates.push([centerLon, centerLat])
  }
  const slopes: number[] = []
  for (const [lon, lat] of candidates) {
    const slope = localSlope(sampleElevation, lon, lat)
    if (slope !== null) slopes.push(slope)
  }
  if (!slopes.length) return null
  const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length
  return mean * 100
}

if (import.meta.main) {
  const [regions, tiles] = await Promise.all([
    fetchGemeindeGeometries(),
    fetchTiles(GERMANY_BBOX, TILE_ZOOM),
  ])
  const sampleElevation = makeElevationSampler(tiles, TILE_ZOOM)

  const byId: Record<string, number> = {}
  let processed = 0
  for (const row of regions) {
    const geometry = JSON.parse(row.geometry) as Polygon | MultiPolygon
    const meanSlopePercent = meanSlopePercentForPolygon(geometry, sampleElevation)
    if (meanSlopePercent !== null) byId[row.id] = meanSlopePercent
    processed++
    if (processed % 2000 === 0) process.stdout.write(`  regions: ${processed}/${regions.length}\n`)
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), byId }))
  process.stdout.write(`${outPath} (${Object.keys(byId).length}/${regions.length} Gemeinden)\n`)
}
