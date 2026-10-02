#!/usr/bin/env bun
/**
 * Per Gemeinde (level 8): how long residents need by bike to their nearest station, along the
 * real path network. Reads routing/cache/bike-cells.csv.gz from routing/station_access.py (every
 * populated Zensus 100 m square with its bike time/distance to the nearest station) and averages
 * it over the residents of each Gemeinde polygon in the local Postgres `aggregated_lengths` —
 * the same population weighting as avgDistanceToStationM in fetchTransitStopCounts.ts, which is
 * the straight-line counterpart of this figure.
 *
 * Output: output/station-access-bike.json (committed), merged into gemeinde-transit.json by
 * buildViewer.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'station-access-bike.json')
const cellsPath = join(import.meta.dir, 'routing', 'cache', 'bike-cells.csv.gz')

/** Share of residents within this many minutes by bike, reported next to the mean. */
const WITHIN_MINUTES = 10

function readCells() {
  const text = gunzipSync(readFileSync(cellsPath)).toString('utf8')
  const xs: number[] = []
  const ys: number[] = []
  const einwohner: number[] = []
  const seconds: number[] = []
  const metres: number[] = []
  const lines = text.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    // x;y;einwohner;seconds;metres;station — x/y are square centres in EPSG:3035
    const [x, y, e, s, m] = line.split(';')
    xs.push(Number(x))
    ys.push(Number(y))
    einwohner.push(Number(e))
    seconds.push(Number(s))
    metres.push(Number(m))
  }
  return { xs, ys, einwohner, seconds, metres }
}

if (import.meta.main) {
  const cells = readCells()
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let rows: Array<{ id: string; avg_s: number; avg_m: number; within_share: number }>
  try {
    await client.query('SET statement_timeout = 0')
    await client.query(
      `
      CREATE TEMP TABLE _bike_cells AS
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 3035), 3857) AS geom, einwohner, seconds, metres
      FROM UNNEST($1::float8[], $2::float8[], $3::int[], $4::float8[], $5::float8[])
        AS t(x, y, einwohner, seconds, metres)
      `,
      [cells.xs, cells.ys, cells.einwohner, cells.seconds, cells.metres],
    )
    await client.query(`CREATE INDEX ON _bike_cells USING gist(geom)`)
    ;({ rows } = await client.query(
      `
      SELECT al.id,
             SUM(c.seconds * c.einwohner) / SUM(c.einwohner) AS avg_s,
             SUM(c.metres * c.einwohner) / SUM(c.einwohner) AS avg_m,
             SUM(CASE WHEN c.seconds <= $1 THEN c.einwohner ELSE 0 END)::float8 / SUM(c.einwohner) AS within_share
      FROM public.aggregated_lengths al
      JOIN _bike_cells c ON c.geom && al.geom AND ST_Contains(al.geom, c.geom)
      WHERE al.level = '8'
      GROUP BY al.id
      HAVING SUM(c.einwohner) > 0
      `,
      [WITHIN_MINUTES * 60],
    ))
  } finally {
    await client.end()
  }

  const byId: Record<string, { bikeMinutes: number; bikeKm: number; bikeWithinPct: number }> = {}
  for (const row of rows) {
    byId[row.id] = {
      bikeMinutes: Math.round((row.avg_s / 60) * 10) / 10,
      bikeKm: Math.round((row.avg_m / 1000) * 100) / 100,
      bikeWithinPct: Math.round(row.within_share * 1000) / 10,
    }
  }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({ fetchedAt: new Date().toISOString(), withinMinutes: WITHIN_MINUTES, byId }),
  )
  process.stdout.write(`${outPath} (${rows.length} Gemeinden)\n`)
}
