#!/usr/bin/env bun
/**
 * Counts `public."publicTransport"` points (rail/tram/ferry stations — see
 * processing/topics/publicTransport/helper/exit_processing.lua; no bus stops, that tag isn't
 * extracted into any table here) per Gemeinde (level 8) in `public.aggregated_lengths`, via a
 * spatial join (needs local Postgres with both tables populated — the publicTransport topic is
 * not part of the default local processing run, see docs/bike-share-map skill).
 *
 * Output is raw counts, keyed by the same region id as aggregated_lengths/stats.geojson.
 * buildViewer.ts combines this with Destatis areaKm2 to get stops/km².
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'transit-stop-counts.json')

async function fetchStopCounts() {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
    const { rows } = await client.query<{ id: string; stop_count: string }>(`
      SELECT al.id, count(pt.*) AS stop_count
      FROM public.aggregated_lengths al
      LEFT JOIN public."publicTransport" pt ON ST_Contains(ST_MakeValid(al.geom), pt.geom)
      WHERE al.level = '8'
      GROUP BY al.id
    `)
    return rows
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  const rows = await fetchStopCounts()
  const byId: Record<string, number> = {}
  for (const row of rows) byId[row.id] = Number(row.stop_count)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), byId }))
  const withStops = Object.values(byId).filter((n) => n > 0).length
  process.stdout.write(
    `${outPath} (${rows.length} Gemeinden, ${withStops} with at least one stop)\n`,
  )
}
