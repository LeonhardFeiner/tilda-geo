#!/usr/bin/env bun
/**
 * Estimates terrain figures per Gemeinde (level 8, from `public.aggregated_lengths`):
 *  - `area` / `road`: mean local slope *magnitude* (%, i.e. rise/run × 100), sampled either on a
 *    uniform grid across the whole Gemeinde polygon or along the actual road network
 *    (`public.roads`). `area` includes land no one cycles on (forests, fields) and can be skewed
 *    by terrain far from where people travel; `road` is closer to what a cyclist experiences, but
 *    still an average over the whole network, not weighted by which roads people actually use.
 *  - `roadSteepP95`: the 95th percentile (rather than the raw maximum, which is too sensitive to
 *    single-pixel DEM noise — voids, tree canopy, tile-edge artifacts) of those same road-sample
 *    local slopes. Answers "how steep does it get at the steepest ~5% of sampled roadside spots"
 *    — closer to "is there an unavoidable climb" than the mean, which averages it away. An
 *    along-road elevation-gain-per-distance version was tried first and dropped: most OSM road
 *    ways are shorter than the ROAD_SAMPLE_STEP_M spacing (~1.7 points/road on average), so
 *    consecutive same-road point pairs would be too sparse to be reliable.
 *  - `elevationMeanM` / `elevationRangeM`: mean elevation and (max − min) over the same area grid,
 *    in meters. A high mean elevation does NOT imply steep terrain — a Gemeinde can sit on a broad
 *    plateau (locally flat, e.g. Schweitenkirchen in Landkreis Pfaffenhofen an der Ilm) while a
 *    lower-lying neighbor cut by a river valley (e.g. Ilmmünster there) is far steeper on average.
 *    These two figures make that distinction visible instead of leaving "steep" and "high" to be
 *    confused with each other.
 *
 * Elevation source: Mapzen/Terrarium terrain-RGB tiles on the public AWS Open Data bucket
 * `elevation-tiles-prod` (no auth, derived from SRTM/ASTER/etc. — see
 * https://github.com/tilezen/joerd/blob/master/docs/formats.md). No PostGIS raster / GDAL
 * involved — this reads tiles with `sharp` and does the grid sampling + slope math in JS,
 * since this Postgres image doesn't have GDAL raster drivers and the repo has no
 * gdal/rasterio toolchain otherwise.
 *
 * Needs local Postgres with `public.aggregated_lengths` and `public.roads` populated, and
 * network access to the tile bucket (~1,100 small PNGs at TILE_ZOOM=10 for all of Germany).
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
/** Target spacing between road sample points, in meters — finer than the area grid since it only has to cover the road network, not the whole polygon. */
const ROAD_SAMPLE_STEP_M = 300

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

/** Local slope magnitude (rise/run, unitless) at a point via central finite differences. */
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

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Value at percentile `p` (0-1) of `values`, nearest-rank — good enough for a rough proxy. */
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
    const centerLon = (minLon + maxLon) / 2
    const centerLat = (minLat + maxLat) / 2
    candidates.push([centerLon, centerLat])
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

/**
 * Sample points (in WGS84) along every `public.roads` linestring, spaced ~ROAD_SAMPLE_STEP_M
 * apart, tagged with whichever Gemeinde (level 8) polygon contains them.
 *
 * Segmentizing directly against `aggregated_lengths` in one query (no intermediate table) was
 * catastrophically slow — Postgres called ST_LineInterpolatePoints per bbox-overlap candidate
 * row with no index to prune the per-point ST_Contains checks. Materializing the segmentized
 * points into an indexed temp table first (mirroring the `temp_roads_segmentized` pattern in
 * processing/steps/afterthoughts/sql/aggregate_lengths.sql) turns it into an index-assisted join
 * and brings the whole-of-Germany run down to well under a minute.
 */
async function fetchRoadSamplePoints() {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
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
    const { rows } = await client.query<{ gemeinde_id: string; lon: number; lat: number }>(`
      SELECT al.id AS gemeinde_id,
             ST_X(ST_Transform(pt.geom, 4326)) AS lon,
             ST_Y(ST_Transform(pt.geom, 4326)) AS lat
      FROM public.aggregated_lengths al
      JOIN _terrain_road_pts pt ON pt.geom && al.geom
      WHERE al.level = '8' AND ST_Contains(al.geom, pt.geom)
    `)
    return rows
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  const [regions, tiles, roadPoints] = await Promise.all([
    fetchGemeindeGeometries(),
    fetchTiles(GERMANY_BBOX, TILE_ZOOM),
    fetchRoadSamplePoints(),
  ])
  const sampleElevation = makeElevationSampler(tiles, TILE_ZOOM)

  const areaById: Record<
    string,
    { slopePercent: number; elevationMeanM: number; elevationRangeM: number }
  > = {}
  let processed = 0
  for (const row of regions) {
    const geometry = JSON.parse(row.geometry) as Polygon | MultiPolygon
    const stats = areaTerrainStatsForPolygon(geometry, sampleElevation)
    if (
      stats.slopePercent !== null &&
      stats.elevationMeanM !== null &&
      stats.elevationRangeM !== null
    ) {
      areaById[row.id] = {
        slopePercent: stats.slopePercent,
        elevationMeanM: stats.elevationMeanM,
        elevationRangeM: stats.elevationRangeM,
      }
    }
    processed++
    if (processed % 2000 === 0)
      process.stdout.write(`  area regions: ${processed}/${regions.length}\n`)
  }

  const roadSlopesByGemeinde = new Map<string, number[]>()
  let roadPointsProcessed = 0
  for (const { gemeinde_id, lon, lat } of roadPoints) {
    const slope = localSlope(sampleElevation, lon, lat)
    if (slope !== null) {
      const arr = roadSlopesByGemeinde.get(gemeinde_id) ?? []
      arr.push(slope)
      roadSlopesByGemeinde.set(gemeinde_id, arr)
    }
    roadPointsProcessed++
    if (roadPointsProcessed % 2_000_000 === 0) {
      process.stdout.write(`  road points: ${roadPointsProcessed}/${roadPoints.length}\n`)
    }
  }
  const roadById: Record<string, { slopePercent: number; steepP95Percent: number }> = {}
  for (const [id, slopes] of roadSlopesByGemeinde) {
    roadById[id] = {
      slopePercent: mean(slopes) * 100,
      steepP95Percent: percentile(slopes, 0.95) * 100,
    }
  }

  const byId: Record<
    string,
    {
      area?: number
      road?: number
      roadSteepP95?: number
      elevationMean?: number
      elevationRange?: number
    }
  > = {}
  for (const id of new Set([...Object.keys(areaById), ...Object.keys(roadById)])) {
    const entry: (typeof byId)[string] = {}
    const area = areaById[id]
    const road = roadById[id]
    if (area) {
      entry.area = area.slopePercent
      entry.elevationMean = area.elevationMeanM
      entry.elevationRange = area.elevationRangeM
    }
    if (road) {
      entry.road = road.slopePercent
      entry.roadSteepP95 = road.steepP95Percent
    }
    byId[id] = entry
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), byId }))
  process.stdout.write(
    `${outPath} (${Object.keys(areaById).length} area, ${Object.keys(roadById).length} road, ` +
      `${regions.length} Gemeinden total, ${roadPoints.length} road sample points)\n`,
  )
}
