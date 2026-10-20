#!/usr/bin/env bun
/**
 * How thoroughly the road network of each region is mapped in OpenStreetMap — a hint whether a
 * low bike-infra share might partly be missing data rather than missing infrastructure.
 *
 * Per region (levels 2–9 of `public.aggregated_lengths`), the share of road length that carries
 * an explicitly mapped
 *   - speed limit (`maxspeed_source` = a maxspeed tag or a zone tag; not `inferred_from_highway`),
 *   - surface (`surface_source = 'tag'`),
 *   - lighting (`lit` set, yes or no).
 * `indexPct` is their mean. Service roads and motorways are left out: service roads are hardly
 * attributed anywhere (noise), motorways almost always (no signal). A road counts in the region
 * that contains its point on surface — good enough for a share, and a single pass (~1 min for
 * Germany instead of the length split aggregate_lengths.sql does).
 *
 * Why these tags: they are mapped street by street by people surveying on the ground, like bike
 * infrastructure, but are independent of whether a street has any. Road-network density was
 * tried first and rejected (statsClassSums.ts, assessBikeDataQuality): it mostly measures
 * terrain. These tags still lean urban — country roads legitimately carry `lit` less often, and
 * an untagged rural maxspeed is often just the default 100 — so compare within peer groups.
 *
 * Needs local Postgres with the processing run that produced the current stats.
 * Output: output/mapping-completeness.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

/** Below this much attributed road a share says nothing. */
export const MAPPING_COMPLETENESS_MIN_ROAD_KM = 5

export type MappingCompleteness = {
  roadKm: number
  speedPct: number
  surfacePct: number
  litPct: number
  indexPct: number
}

export type MappingCompletenessSums = {
  m: number
  m_speed: number | null
  m_surface: number | null
  m_lit: number | null
}

const pct = (part: number | null, whole: number) => Number((((part ?? 0) / whole) * 100).toFixed(1))

export function mappingCompletenessFromSums(row: MappingCompletenessSums) {
  if (!(row.m >= MAPPING_COMPLETENESS_MIN_ROAD_KM * 1000)) return null
  const speedPct = pct(row.m_speed, row.m)
  const surfacePct = pct(row.m_surface, row.m)
  const litPct = pct(row.m_lit, row.m)
  return {
    roadKm: Number((row.m / 1000).toFixed(1)),
    speedPct,
    surfacePct,
    litPct,
    indexPct: Number(((speedPct + surfacePct + litPct) / 3).toFixed(1)),
  } satisfies MappingCompleteness
}

async function fetchSums(client: Client) {
  const { rows } = await client.query<{ id: string } & MappingCompletenessSums>(`
    -- Subdivided areas so the big polygons (Germany, Länder) hit the road index in small
    -- pieces; a road whose point on surface lies in a piece counts once for that area.
    WITH areas AS (
      SELECT id, ST_Subdivide(ST_MakeValid(geom), 255) AS g
      FROM public.aggregated_lengths
      WHERE level IN ('2', '4', '5', '6', '7', '8', '9')
    ),
    hits AS (
      SELECT
        a.id,
        (r.tags ->> 'length')::float AS m,
        r.tags ->> 'maxspeed_source' IN
          ('maxspeed_tag', 'zone', 'maxspeed:forward_tag', 'maxspeed:backward_tag') AS has_speed,
        r.tags ->> 'surface_source' = 'tag' AS has_surface,
        r.tags ? 'lit' AS has_lit
      FROM areas a
      JOIN public.roads r
        ON ST_Intersects(a.g, r.geom) AND ST_Intersects(a.g, ST_PointOnSurface(r.geom))
      WHERE r.tags ->> 'road' NOT LIKE 'service%'
        AND r.tags ->> 'road' NOT IN ('motorway', 'motorway_link')
    )
    SELECT id,
      SUM(m) AS m,
      SUM(m) FILTER (WHERE has_speed) AS m_speed,
      SUM(m) FILTER (WHERE has_surface) AS m_surface,
      SUM(m) FILTER (WHERE has_lit) AS m_lit
    FROM hits
    GROUP BY id
  `)
  return rows
}

if (import.meta.main) {
  const outDir = join(import.meta.dir, 'output')
  const outPath = join(outDir, 'mapping-completeness.json')
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let rows: Awaited<ReturnType<typeof fetchSums>>
  let osmDataFrom: string | null = null
  try {
    await client.query('SET statement_timeout = 0')
    rows = await fetchSums(client)
    // The column is UTC without a zone; formatted in SQL so node can't shift it to local time.
    const meta = await client.query<{ osm_data_from: string }>(
      `SELECT to_char(osm_data_from, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS osm_data_from
       FROM public.meta ORDER BY id DESC LIMIT 1`,
    )
    osmDataFrom = meta.rows[0]?.osm_data_from ?? null
  } finally {
    await client.end()
  }

  const byId: Record<string, MappingCompleteness> = {}
  for (const row of rows) {
    const entry = mappingCompletenessFromSums({
      m: Number(row.m),
      m_speed: row.m_speed == null ? null : Number(row.m_speed),
      m_surface: row.m_surface == null ? null : Number(row.m_surface),
      m_lit: row.m_lit == null ? null : Number(row.m_lit),
    })
    if (entry) byId[row.id] = entry
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), osmDataFrom, byId }))
  process.stdout.write(`${outPath} (${Object.keys(byId).length} regions, OSM ${osmDataFrom})\n`)
}
