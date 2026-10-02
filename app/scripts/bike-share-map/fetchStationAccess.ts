#!/usr/bin/env bun
/**
 * Per Gemeinde (level 8): how long residents need on foot, by bike and by car to their nearest
 * station, along the real network. Reads routing/cache/<mode>-cells.csv.gz from
 * routing/station_access.py (every populated Zensus 100 m square with its time/distance to the
 * nearest station) and averages it over the residents of each Gemeinde polygon in the local
 * Postgres `aggregated_lengths` — the same population weighting as avgDistanceToStationM in
 * fetchTransitStopCounts.ts, which is the straight-line counterpart of these figures.
 *
 * Output: output/station-access.json (committed), merged into gemeinde-transit.json by
 * buildViewer.ts as `access: {foot|bike|car: [minutes, km, % of residents within 10 min]}`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'station-access.json')
const cacheDir = join(import.meta.dir, 'routing', 'cache')

const MODES = ['foot', 'bike', 'car'] as const
type Mode = (typeof MODES)[number]

/** Share of residents within this many minutes, reported next to the mean. */
const WITHIN_MINUTES = 10

function readCells(path: string) {
  const text = gunzipSync(readFileSync(path)).toString('utf8')
  const xs: number[] = []
  const ys: number[] = []
  const einwohner: number[] = []
  const seconds: number[] = []
  const metres: number[] = []
  const lines = text.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    // x;y;einwohner;seconds;metres — x/y are square centres in EPSG:3035
    const [x, y, e, s, m] = line.split(';')
    xs.push(Number(x))
    ys.push(Number(y))
    einwohner.push(Number(e))
    seconds.push(Number(s))
    metres.push(Number(m))
  }
  return { xs, ys, einwohner, seconds, metres }
}

async function aggregateMode(client: Client, cells: ReturnType<typeof readCells>) {
  await client.query('DROP TABLE IF EXISTS _access_cells')
  await client.query(
    `
    CREATE TEMP TABLE _access_cells AS
    SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 3035), 3857) AS geom, einwohner, seconds, metres
    FROM UNNEST($1::float8[], $2::float8[], $3::int[], $4::float8[], $5::float8[])
      AS t(x, y, einwohner, seconds, metres)
    `,
    [cells.xs, cells.ys, cells.einwohner, cells.seconds, cells.metres],
  )
  await client.query(`CREATE INDEX ON _access_cells USING gist(geom)`)
  const { rows } = await client.query<{
    id: string
    avg_s: number
    avg_m: number
    within_share: number
  }>(
    `
    SELECT al.id,
           SUM(c.seconds * c.einwohner) / SUM(c.einwohner) AS avg_s,
           SUM(c.metres * c.einwohner) / SUM(c.einwohner) AS avg_m,
           SUM(CASE WHEN c.seconds <= $1 THEN c.einwohner ELSE 0 END)::float8 / SUM(c.einwohner) AS within_share
    FROM public.aggregated_lengths al
    JOIN _access_cells c ON c.geom && al.geom AND ST_Contains(al.geom, c.geom)
    WHERE al.level = '8'
    GROUP BY al.id
    HAVING SUM(c.einwohner) > 0
    `,
    [WITHIN_MINUTES * 60],
  )
  return rows
}

if (import.meta.main) {
  const modes = MODES.filter((m) => existsSync(join(cacheDir, `${m}-cells.csv.gz`)))
  if (!modes.length) {
    process.stderr.write(
      `No ${cacheDir}/<mode>-cells.csv.gz — run routing/station_access.py first\n`,
    )
    process.exit(1)
  }
  const byId: Record<string, Partial<Record<Mode, [number, number, number]>>> = {}
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
    for (const mode of modes) {
      const rows = await aggregateMode(client, readCells(join(cacheDir, `${mode}-cells.csv.gz`)))
      for (const row of rows) {
        const entry = (byId[row.id] ??= {})
        entry[mode] = [
          Math.round((row.avg_s / 60) * 10) / 10,
          Math.round((row.avg_m / 1000) * 100) / 100,
          Math.round(row.within_share * 1000) / 10,
        ]
      }
      process.stdout.write(`${mode}: ${rows.length} Gemeinden\n`)
    }
  } finally {
    await client.end()
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      withinMinutes: WITHIN_MINUTES,
      modes,
      byId,
    }),
  )
  process.stdout.write(`${outPath} (${Object.keys(byId).length} Gemeinden)\n`)
}
