#!/usr/bin/env bun
/**
 * Two figures per Gemeinde (level 8, from `public.aggregated_lengths`) about
 * `public."publicTransport"` points (rail/tram/ferry stations — see
 * processing/topics/publicTransport/helper/exit_processing.lua; no bus stops, that tag isn't
 * extracted into any table here). Needs local Postgres with both tables populated (the
 * publicTransport topic is not part of the default local processing run, see the
 * docs/bike-share-map skill), and network access to download the population grid below.
 *
 * - `stopCount`: raw count of stations within the Gemeinde polygon. buildViewer.ts combines this
 *   with Destatis areaKm2 to get stops/km² — simple, but a station in an empty corner of a large
 *   rural Gemeinde counts the same as one next to where people actually live.
 * - `avgDistanceToStationM`: population-weighted mean distance (meters) from where people
 *   actually live to the nearest station, using the Zensus 2022 100m population grid
 *   (Bevölkerungszahl je Gitterzelle, ~3.09M populated cells for all of Germany — downloaded
 *   fresh each run, not checked into the repo: 18MB zip, 153MB CSV). Replaces an earlier
 *   residential-road-sample proxy now that real population data is available — a cell with 400
 *   residents counts 100x a cell with 4, and a station reachable only via a forestry track
 *   through an empty forest simply has no populated cells nearby to pull down.
 *   Source: https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip
 *   Licence: Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0). Attribution:
 *   "© Statistische Ämter des Bundes und der Länder, 2024".
 *
 * Both queries run entirely in SQL (no per-point JS work needed, unlike the elevation lookups in
 * fetchTerrainFlatness.ts): grid cell centers (given in ETRS89-LAEA Europe, EPSG:3035 — the
 * dataset's native CRS) are loaded into an indexed Postgres temp table and reprojected via
 * ST_Transform to 3857 to match aggregated_lengths/publicTransport, then an index-assisted KNN
 * lookup (`ORDER BY geom <-> point LIMIT 1`) finds each cell's nearest station — the same
 * "materialize and index first" fix as the road sampling in fetchTerrainFlatness.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'transit-stop-counts.json')

const POPULATION_GRID_ZIP_URL =
  'https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip'
const POPULATION_GRID_CSV_ENTRY = 'Zensus2022_Bevoelkerungszahl_100m-Gitter.csv'

async function fetchStopCounts(client: Client) {
  const { rows } = await client.query<{ id: string; stop_count: string }>(`
    SELECT al.id, count(pt.*) AS stop_count
    FROM public.aggregated_lengths al
    LEFT JOIN public."publicTransport" pt ON ST_Contains(ST_MakeValid(al.geom), pt.geom)
    WHERE al.level = '8'
    GROUP BY al.id
  `)
  return rows
}

/**
 * Minimal ZIP central-directory reader — just enough to pull one stored/deflated entry out of a
 * plain (non-ZIP64) archive, to avoid adding an npm dependency for this one-off script.
 */
function extractZipEntry(zip: Buffer, entryName: string): Buffer {
  const EOCD_SIGNATURE = 0x06054b50
  let eocdOffset = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP end-of-central-directory record not found')

  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  let centralDirOffset = zip.readUInt32LE(eocdOffset + 16)
  for (let i = 0; i < entryCount; i++) {
    if (zip.readUInt32LE(centralDirOffset) !== 0x02014b50) {
      throw new Error('malformed ZIP central directory entry')
    }
    const compressionMethod = zip.readUInt16LE(centralDirOffset + 10)
    const compressedSize = zip.readUInt32LE(centralDirOffset + 20)
    const nameLength = zip.readUInt16LE(centralDirOffset + 28)
    const extraLength = zip.readUInt16LE(centralDirOffset + 30)
    const commentLength = zip.readUInt16LE(centralDirOffset + 32)
    const localHeaderOffset = zip.readUInt32LE(centralDirOffset + 42)
    const name = zip.toString('utf8', centralDirOffset + 46, centralDirOffset + 46 + nameLength)

    if (name === entryName) {
      const localNameLength = zip.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
      const compressed = zip.subarray(dataStart, dataStart + compressedSize)
      return compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed)
    }
    centralDirOffset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`ZIP entry not found: ${entryName}`)
}

async function fetchPopulationGridPoints() {
  const res = await fetch(POPULATION_GRID_ZIP_URL)
  if (!res.ok) throw new Error(`population grid download failed: HTTP ${res.status}`)
  const zip = Buffer.from(await res.arrayBuffer())
  const csv = extractZipEntry(zip, POPULATION_GRID_CSV_ENTRY)

  const headerEnd = csv.indexOf(0x0a)
  const text = csv.toString('utf8', headerEnd + 1)
  const xs: number[] = []
  const ys: number[] = []
  const einwohner: number[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    // GITTER_ID_100m;x_mp_100m;y_mp_100m;Einwohner — id column unused, x/y already meters in
    // the dataset's native CRS (ETRS89-LAEA Europe, EPSG:3035).
    const [, x, y, e] = line.split(';')
    xs.push(Number(x))
    ys.push(Number(y))
    einwohner.push(Number(e))
  }
  return { xs, ys, einwohner }
}

async function fetchAvgDistanceToStation(client: Client) {
  const { xs, ys, einwohner } = await fetchPopulationGridPoints()
  await client.query(
    `
    CREATE TEMP TABLE _population_grid_pts AS
    SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 3035), 3857) AS geom, einwohner
    FROM UNNEST($1::float8[], $2::float8[], $3::int[]) AS t(x, y, einwohner)
    `,
    [xs, ys, einwohner],
  )
  await client.query(`CREATE INDEX ON _population_grid_pts USING gist(geom)`)
  const { rows } = await client.query<{ id: string; avg_dist_m: number; population: string }>(`
    SELECT al.id,
           SUM(nearest.dist * pt.einwohner) / SUM(pt.einwohner) AS avg_dist_m,
           SUM(pt.einwohner) AS population
    FROM public.aggregated_lengths al
    JOIN _population_grid_pts pt ON pt.geom && al.geom
    CROSS JOIN LATERAL (
      SELECT geom <-> pt.geom AS dist FROM public."publicTransport" ORDER BY geom <-> pt.geom LIMIT 1
    ) nearest
    WHERE al.level = '8' AND ST_Contains(al.geom, pt.geom)
    GROUP BY al.id
  `)
  return rows
}

if (import.meta.main) {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let stopCountRows: Awaited<ReturnType<typeof fetchStopCounts>>
  let distanceRows: Awaited<ReturnType<typeof fetchAvgDistanceToStation>>
  try {
    await client.query('SET statement_timeout = 0')
    stopCountRows = await fetchStopCounts(client)
    distanceRows = await fetchAvgDistanceToStation(client)
  } finally {
    await client.end()
  }

  const byId: Record<string, { stopCount: number; avgDistanceToStationM?: number }> = {}
  for (const row of stopCountRows) byId[row.id] = { stopCount: Number(row.stop_count) }
  for (const row of distanceRows) {
    const entry = byId[row.id] ?? { stopCount: 0 }
    entry.avgDistanceToStationM = row.avg_dist_m
    byId[row.id] = entry
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), byId }))
  const withStops = Object.values(byId).filter((v) => v.stopCount > 0).length
  const withDistance = Object.values(byId).filter(
    (v) => v.avgDistanceToStationM !== undefined,
  ).length
  process.stdout.write(
    `${outPath} (${stopCountRows.length} Gemeinden, ${withStops} with at least one stop, ` +
      `${withDistance} with a population-weighted distance figure)\n`,
  )
}
