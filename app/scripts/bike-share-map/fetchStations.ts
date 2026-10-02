#!/usr/bin/env bun
/**
 * Station points + a simplified Germany outline for the unlisted "nearest station" map
 * (stationAreasPage.ts). Reads `public."publicTransport"` (rail/tram/ferry stations, no bus
 * stops — see fetchTransitStopCounts.ts) and the level-2 row of `public.aggregated_lengths`
 * from the local Postgres; the page itself computes the Voronoi cells in the browser so the
 * category filter can redraw them.
 *
 * OSM maps many tram stops as one node per direction, which would split one stop's area into
 * two slivers — same-name stations of the same category within 400 m are merged into their
 * centroid. Unnamed stations stay as they are.
 *
 * Output: output/stations.json (committed, like transit-stop-counts.json).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'stations.json')

/** Index into this list is what each station row carries. */
export const STATION_CATEGORIES = [
  'railway_station',
  'subway_station',
  'light_rail_station',
  'tram_station',
  'ferry_station',
] as const

const MERGE_DISTANCE_M = 400
const OUTLINE_SIMPLIFY_M = 150

async function fetchStations(client: Client) {
  const { rows } = await client.query<{
    category: string
    name: string | null
    lon: number
    lat: number
  }>(
    `
    WITH clustered AS (
      SELECT tags->>'category' AS category, tags->>'name' AS name, geom,
        CASE WHEN tags->>'name' IS NULL THEN id
             ELSE ST_ClusterDBSCAN(geom, $1, 1) OVER (PARTITION BY tags->>'category', tags->>'name')::text
        END AS cluster
      FROM public."publicTransport"
      WHERE geom IS NOT NULL
    )
    SELECT category, name,
           ST_X(ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)) AS lon,
           ST_Y(ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)) AS lat
    FROM clustered
    GROUP BY category, name, cluster
    ORDER BY category, name
    `,
    [MERGE_DISTANCE_M],
  )
  return rows
}

async function fetchGermanyOutline(client: Client) {
  const { rows } = await client.query<{ geojson: string }>(
    `
    SELECT ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom, $1), 4326), 4) AS geojson
    FROM public.aggregated_lengths
    WHERE level = '2'
    LIMIT 1
    `,
    [OUTLINE_SIMPLIFY_M],
  )
  if (!rows[0]) throw new Error('no level-2 row in aggregated_lengths')
  return JSON.parse(rows[0].geojson) as GeoJSON.Polygon | GeoJSON.MultiPolygon
}

if (import.meta.main) {
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let stationRows: Awaited<ReturnType<typeof fetchStations>>
  let germany: Awaited<ReturnType<typeof fetchGermanyOutline>>
  try {
    await client.query('SET statement_timeout = 0')
    stationRows = await fetchStations(client)
    germany = await fetchGermanyOutline(client)
  } finally {
    await client.end()
  }

  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const stations: Array<[number, number, number, string | null]> = []
  for (const row of stationRows) {
    const categoryIndex = (STATION_CATEGORIES as readonly string[]).indexOf(row.category)
    if (categoryIndex < 0) continue
    stations.push([round(row.lon), round(row.lat), categoryIndex, row.name])
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      categories: STATION_CATEGORIES,
      stations,
      germany,
    }),
  )
  process.stdout.write(`${outPath} (${stations.length} stations after merging)\n`)
}
