#!/usr/bin/env bun
/**
 * Two figures per Gemeinde (level 8, from `public.aggregated_lengths`) about
 * `public."publicTransport"` points (rail/tram/ferry stations — see
 * processing/topics/publicTransport/helper/exit_processing.lua; no bus stops, that tag isn't
 * extracted into any table here). Needs local Postgres with both tables populated (the
 * publicTransport topic is not part of the default local processing run, see the
 * docs/bike-share-map skill).
 *
 * - `stopCount`: raw count of stations within the Gemeinde polygon. buildViewer.ts combines this
 *   with Destatis areaKm2 to get stops/km² — simple, but a station in an empty corner of a large
 *   rural Gemeinde counts the same as one next to where people actually live.
 * - `avgDistanceResidentialM`: mean distance (meters) from points sampled along *residential*
 *   roads only (OSM `road` tag: residential/living_street/pedestrian/bicycle_road/
 *   residential_priority_road/unspecified_road — the same "residential_like" grouping used in
 *   statsClassSums.ts) to the nearest station, ignoring Gemeinde boundaries for the nearest-search
 *   itself (a station just across the border still counts). Restricting to residential roads is a
 *   proxy for "where people live" — no buildings/address/population-grid table exists in this
 *   processing DB, so a station in the middle of a forest (reachable only by a motorway or a
 *   forestry track) doesn't pull the average down the way it would with a uniform area or
 *   all-roads sample. Still a per-road-length average, not per-resident: one farmhouse's street
 *   counts the same as a dense city block's.
 *
 * Both queries run entirely in SQL (no elevation-tile-style client-side work needed): segmentizing
 * `public.roads` into an indexed temp table first, then doing an index-assisted KNN lookup
 * (`ORDER BY geom <-> point LIMIT 1`) per point, mirroring the temp-table-then-join pattern in
 * fetchTerrainFlatness.ts — the same "materialize and index first" fix applies here.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const outDir = join(import.meta.dir, 'output')
const outPath = join(outDir, 'transit-stop-counts.json')

/** Same grouping as ROAD_CATEGORY_TO_CLASS['*'] === 'residential_like' in statsClassSums.ts. */
const RESIDENTIAL_LIKE_ROAD_TAGS = [
  'residential',
  'residential_priority_road',
  'bicycle_road',
  'living_street',
  'pedestrian',
  'unspecified_road',
]

/** Matches ROAD_SAMPLE_STEP_M in fetchTerrainFlatness.ts. */
const ROAD_SAMPLE_STEP_M = 300

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

async function fetchAvgDistanceToStation(client: Client) {
  await client.query(
    `
    CREATE TEMP TABLE _residential_road_pts AS
    SELECT (ST_DumpPoints(
      ST_LineInterpolatePoints(
        r.geom,
        LEAST(0.5, GREATEST(0.05, ${ROAD_SAMPLE_STEP_M} / NULLIF((r.tags->>'length')::float8, 0)))::float8,
        true
      )
    )).geom AS geom
    FROM public.roads r
    WHERE r.geom IS NOT NULL AND r.tags->>'road' = ANY($1)
    `,
    [RESIDENTIAL_LIKE_ROAD_TAGS],
  )
  await client.query(`CREATE INDEX ON _residential_road_pts USING gist(geom)`)
  const { rows } = await client.query<{ id: string; avg_dist_m: number; n: string }>(`
    SELECT al.id, AVG(nearest.dist) AS avg_dist_m, count(*) AS n
    FROM public.aggregated_lengths al
    JOIN _residential_road_pts pt ON pt.geom && al.geom
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

  const byId: Record<string, { stopCount: number; avgDistanceResidentialM?: number }> = {}
  for (const row of stopCountRows) byId[row.id] = { stopCount: Number(row.stop_count) }
  for (const row of distanceRows) {
    const entry = byId[row.id] ?? { stopCount: 0 }
    entry.avgDistanceResidentialM = row.avg_dist_m
    byId[row.id] = entry
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), byId }))
  const withStops = Object.values(byId).filter((v) => v.stopCount > 0).length
  const withDistance = Object.values(byId).filter((v) => v.avgDistanceResidentialM !== undefined).length
  process.stdout.write(
    `${outPath} (${stopCountRows.length} Gemeinden, ${withStops} with at least one stop, ` +
      `${withDistance} with a residential-road distance figure)\n`,
  )
}
