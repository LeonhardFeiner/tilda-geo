#!/usr/bin/env bun
/**
 * Per Gemeinde (level 8): population-weighted mean distance (in meters) to the nearest
 * Autobahn / Kraftfahrstraße (motorway or trunk road), using the Zensus 2022 100m population grid.
 *
 * Output: output/highway-access.json (committed), merged into gemeinde-transit.json by buildViewer.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'highway-access.json')
const cacheZipPath = '/tmp/Zensus2022_Bevoelkerungszahl.zip'

const POPULATION_GRID_ZIP_URL =
  'https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip'
const POPULATION_GRID_CSV_ENTRY = 'Zensus2022_Bevoelkerungszahl_100m-Gitter.csv'

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
  let zip: Buffer
  if (existsSync(cacheZipPath)) {
    zip = readFileSync(cacheZipPath)
  } else {
    process.stdout.write('Downloading Zensus 2022 population grid...\n')
    const res = await fetch(POPULATION_GRID_ZIP_URL)
    if (!res.ok) throw new Error(`population grid download failed: HTTP ${res.status}`)
    zip = Buffer.from(await res.arrayBuffer())
    try {
      writeFileSync(cacheZipPath, zip)
    } catch {
      // cache write optional
    }
  }
  process.stdout.write('Extracting population grid CSV...\n')
  const csv = extractZipEntry(zip, POPULATION_GRID_CSV_ENTRY)

  const headerEnd = csv.indexOf(0x0a)
  const text = csv.toString('utf8', headerEnd + 1)
  const xs: number[] = []
  const ys: number[] = []
  const einwohner: number[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const [, x, y, e] = line.split(';')
    xs.push(Number(x))
    ys.push(Number(y))
    einwohner.push(Number(e))
  }
  return { xs, ys, einwohner }
}

async function fetchAvgDistanceToHighway(client: Client) {
  process.stdout.write('Creating temp table of highways...\n')
  await client.query(`
    CREATE TEMP TABLE _highways AS
    SELECT geom FROM public.roads
    WHERE tags->>'road' IN ('motorway', 'trunk', 'motorway_link', 'trunk_link');
    CREATE INDEX ON _highways USING gist(geom);
  `)

  process.stdout.write('Loading population grid into temp table...\n')
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

  process.stdout.write('Computing population-weighted distance to highway for each Gemeinde...\n')
  const { rows } = await client.query<{ id: string; avg_dist_m: number }>(`
    SELECT al.id,
           SUM(nearest.dist * cos(radians(pt.lat)) * pt.einwohner) / SUM(pt.einwohner) AS avg_dist_m
    FROM public.aggregated_lengths al
    JOIN _population_grid_pts pt ON pt.geom && al.geom
    CROSS JOIN LATERAL (
      SELECT geom <-> pt.geom AS dist FROM _highways ORDER BY geom <-> pt.geom LIMIT 1
    ) nearest
    WHERE al.level = '8' AND ST_Contains(al.geom, pt.geom)
    GROUP BY al.id
  `)
  return rows
}

if (import.meta.main) {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let distanceRows: Awaited<ReturnType<typeof fetchAvgDistanceToHighway>>
  try {
    await client.query('SET statement_timeout = 0')
    distanceRows = await fetchAvgDistanceToHighway(client)
  } finally {
    await client.end()
  }

  const byId: Record<string, { avgDistanceToHighwayM: number }> = {}
  for (const row of distanceRows) {
    if (Number.isFinite(row.avg_dist_m)) {
      byId[row.id] = { avgDistanceToHighwayM: Math.round(row.avg_dist_m * 10) / 10 }
    }
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), byId }))
  process.stdout.write(
    `${outPath} (${distanceRows.length} Gemeinden with population-weighted highway distance)\n`,
  )
}
