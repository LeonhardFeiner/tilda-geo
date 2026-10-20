#!/usr/bin/env bun
/**
 * Bavaria only: motor traffic per day (DTV) on counted road sections, and whether each busy
 * rural section has bike infrastructure next to it.
 *
 * Source: Straßenverkehrszählung 2021 via the BAYSIS Verkehrsdaten WFS
 * (layer svz2021_zaehlstellenbereiche: ~9,400 sections of Bundes-, Staats- and Kreisstraßen and
 * Autobahnen, each with DTV_Kfz and FSOD = FS freie Strecke / OD Ortsdurchfahrt).
 * Licence: CC BY 4.0, © Bayerische Straßenbauverwaltung.
 *
 * Rule (ERA 2010, Landstraßen of category LS III / EKL 3, quoted in the Bavarian Musterblätter
 * Radverkehr 2024, which defer the choice of facility to ERA): a road-accompanying bike path is
 * advisable ("sinnvoll") from DTV > 2,500 Kfz/24h at 100 km/h, or > 4,000 Kfz/24h at 70 km/h.
 * Applied to open-road (FS) sections of B, St and K roads; Ortsdurchfahrten follow other rules
 * and Autobahnen carry no bikes. The speed is the nearest OSM road's maxspeed where tagged
 * (≤ 70 → 4,000), else the rural default 100 (→ 2,500).
 *
 * Coverage: each section is sampled every ~50 m; a sample counts as covered when bike
 * infrastructure (see COVERING_CATEGORIES) lies within ~20 m. BAYSIS geometry is the official
 * road network, a few metres off OSM at most.
 *
 * Needs local Postgres with the processing run behind the current stats (bikelanes, roads,
 * aggregated_lengths). Output: output/traffic-volumes.json (per region, levels 4–9 in Bavaria)
 * and output/traffic-sections-bayern.json (per section, no geometry).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

const WFS_URL =
  'https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer' +
  '?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeNames=BAYSIS_Verkehrsdaten:svz2021_zaehlstellenbereiche&outputFormat=GEOJSON'

export const ERA_DTV_THRESHOLD_100 = 2500
export const ERA_DTV_THRESHOLD_70 = 4000
const SAMPLE_STEP_M = 50
const COVER_DISTANCE_M = 20
const BAYERN_ID = 'relation/2145268'

/** Bike infrastructure a cyclist can use instead of the carriageway. */
export const COVERING_CATEGORIES = [
  'needsClarification',
  'footwayBicycleYes_isolated',
  'footwayBicycleYes_adjoining',
  'footwayBicycleYes_adjoiningOrIsolated',
  'footAndCyclewayShared_isolated',
  'footAndCyclewayShared_adjoining',
  'footAndCyclewayShared_adjoiningOrIsolated',
  'footAndCyclewaySegregated_adjoining',
  'footAndCyclewaySegregated_adjoiningOrIsolated',
  'footAndCyclewaySegregated_isolated',
  'cycleway_isolated',
  'cycleway_adjoining',
  'cycleway_adjoiningOrIsolated',
  'cyclewayOnHighway_exclusive',
  'cyclewayOnHighway_advisory',
  'cyclewayOnHighway_advisoryOrExclusive',
  'cyclewayOnHighwayBetweenLanes',
  'cyclewayOnHighwayProtected',
] as const

export const NEED_ROAD_CLASSES = ['B', 'St', 'K'] as const
export type NeedRoadClass = (typeof NEED_ROAD_CLASSES)[number]

/** DTV above which ERA 2010 calls a rural bike path advisable, by speed limit. */
export function eraDtvThreshold(maxspeedKmh: number | null) {
  return maxspeedKmh != null && maxspeedKmh <= 70 ? ERA_DTV_THRESHOLD_70 : ERA_DTV_THRESHOLD_100
}

/** Whether a counted section falls under the ERA rule (open road, B/St/K, busy enough). */
export function sectionNeedsBikePath(s: {
  klasse: string
  fsod: string
  dtv: number
  maxspeedKmh: number | null
}) {
  return (
    s.fsod === 'FS' &&
    (NEED_ROAD_CLASSES as readonly string[]).includes(s.klasse) &&
    s.dtv > eraDtvThreshold(s.maxspeedKmh)
  )
}

type WfsFeature = {
  properties: Record<string, unknown>
  geometry: unknown
}

async function loadSections(client: Client, features: WfsFeature[]) {
  const col = (key: string) => features.map((f) => f.properties[key] ?? null)
  await client.query(`
    CREATE TEMP TABLE svz (
      id int, strasse text, klasse text, anfang text, ende text, dtv float, fsod text, link text,
      geom geometry(MultiLineString, 3857)
    )
  `)
  await client.query(
    `
    INSERT INTO svz
    SELECT id, strasse, klasse, anfang, ende, dtv, fsod, link,
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g), 4326), 3857))
    FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::float8[],
      $7::text[], $8::text[], $9::text[]) AS t(id, strasse, klasse, anfang, ende, dtv, fsod, link, g)
    `,
    [
      col('OBJECTID'),
      col('Straße'),
      col('Straßenklasse'),
      col('Anfang'),
      col('Ende'),
      col('DTV_Kfz'),
      col('FSOD'),
      col('Link'),
      features.map((f) => JSON.stringify(f.geometry)),
    ],
  )
}

async function sampleSections(client: Client) {
  // Points every ~SAMPLE_STEP_M along each part, each weighted with its share of true length.
  // Web Mercator units are 1/cos(lat) metres, hence the scaled search radius.
  await client.query(`
    CREATE TEMP TABLE pts AS
    WITH parts AS (
      SELECT s.id, d.geom, ST_Length(ST_Transform(d.geom, 4326)::geography) AS len_m
      FROM svz s, ST_Dump(s.geom) d
    )
    SELECT p.id, p.len_m / k.n AS w, ST_LineInterpolatePoint(p.geom, (i - 0.5) / k.n) AS pt
    FROM parts p
    CROSS JOIN LATERAL (SELECT GREATEST(1, CEIL(p.len_m / ${SAMPLE_STEP_M}))::int AS n) k
    CROSS JOIN LATERAL generate_series(1, k.n) i
  `)
  await client.query(`CREATE INDEX ON pts USING gist (pt)`)
  await client.query(
    `
    CREATE TEMP TABLE pts_eval AS
    SELECT p.id, p.w, p.pt,
      EXISTS (
        SELECT 1 FROM public.bikelanes b
        WHERE ST_DWithin(b.geom, p.pt, r.radius)
          AND b.tags ->> 'category' = ANY ($1::text[])
      ) AS covered,
      (
        SELECT NULLIF(substring(rd.tags ->> 'maxspeed' FROM '^[0-9]+'), '')::int
        FROM public.roads rd
        WHERE ST_DWithin(rd.geom, p.pt, r.radius) AND rd.tags ? 'maxspeed'
        ORDER BY rd.geom <-> p.pt LIMIT 1
      ) AS maxspeed
    FROM pts p
    CROSS JOIN LATERAL (
      SELECT ${COVER_DISTANCE_M} / cos(radians(ST_Y(ST_Transform(p.pt, 4326)))) AS radius
    ) r
  `,
    [COVERING_CATEGORIES as unknown as string[]],
  )
  await client.query(`CREATE INDEX ON pts_eval USING gist (pt)`)
}

type SectionRow = {
  id: number
  strasse: string
  klasse: string
  anfang: string | null
  ende: string | null
  dtv: number
  fsod: string
  link: string | null
  km: number
  covered_km: number
  maxspeed: number | null
}

async function sectionResults(client: Client) {
  const { rows } = await client.query<SectionRow>(`
    SELECT s.id, s.strasse, s.klasse, s.anfang, s.ende, s.dtv, s.fsod, s.link,
      SUM(e.w) / 1000 AS km,
      COALESCE(SUM(e.w) FILTER (WHERE e.covered), 0) / 1000 AS covered_km,
      -- The speed most of the section's length carries (null where none is tagged).
      mode() WITHIN GROUP (ORDER BY e.maxspeed) AS maxspeed
    FROM svz s JOIN pts_eval e ON e.id = s.id
    GROUP BY s.id, s.strasse, s.klasse, s.anfang, s.ende, s.dtv, s.fsod, s.link
  `)
  return rows
}

async function regionSums(client: Client, needIds: number[]) {
  const { rows } = await client.query<{
    region: string
    klasse: string
    need_km: number
    covered_km: number
  }>(
    `
    WITH bayern AS (SELECT geom FROM public.aggregated_lengths WHERE id = $2),
    areas AS (
      SELECT al.id, ST_Subdivide(ST_MakeValid(al.geom), 255) AS g
      FROM public.aggregated_lengths al, bayern
      WHERE al.level IN ('4', '5', '6', '7', '8', '9') AND al.geom && bayern.geom
        AND ST_Intersects(bayern.geom, ST_PointOnSurface(al.geom))
    )
    SELECT a.id AS region, s.klasse,
      SUM(e.w) / 1000 AS need_km,
      COALESCE(SUM(e.w) FILTER (WHERE e.covered), 0) / 1000 AS covered_km
    FROM pts_eval e
    JOIN svz s ON s.id = e.id
    JOIN areas a ON ST_Intersects(a.g, e.pt)
    WHERE e.id = ANY ($1::int[])
    GROUP BY a.id, s.klasse
    `,
    [needIds, BAYERN_ID],
  )
  return rows
}

export type TrafficRegion = {
  needKm: number
  coveredKm: number
  coveredPct: number
  byClass: Partial<Record<NeedRoadClass, { needKm: number; coveredKm: number }>>
}

const r1 = (v: number) => Number(v.toFixed(1))

if (import.meta.main) {
  const outDir = join(import.meta.dir, 'output')
  const res = await fetch(WFS_URL)
  if (!res.ok) throw new Error(`BAYSIS WFS: HTTP ${res.status}`)
  const { features } = (await res.json()) as { features: WfsFeature[] }
  process.stdout.write(`BAYSIS: ${features.length} counted sections\n`)

  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let sections: SectionRow[]
  let regions: Awaited<ReturnType<typeof regionSums>>
  try {
    await client.query('SET statement_timeout = 0')
    await loadSections(client, features)
    await sampleSections(client)
    sections = await sectionResults(client)
    const needIds = sections
      .filter((s) =>
        sectionNeedsBikePath({
          klasse: s.klasse,
          fsod: s.fsod,
          dtv: s.dtv,
          maxspeedKmh: s.maxspeed,
        }),
      )
      .map((s) => s.id)
    regions = await regionSums(client, needIds)
  } finally {
    await client.end()
  }

  const byId: Record<string, TrafficRegion> = {}
  for (const row of regions) {
    const entry = (byId[row.region] ??= { needKm: 0, coveredKm: 0, coveredPct: 0, byClass: {} })
    entry.needKm += Number(row.need_km)
    entry.coveredKm += Number(row.covered_km)
    entry.byClass[row.klasse as NeedRoadClass] = {
      needKm: r1(Number(row.need_km)),
      coveredKm: r1(Number(row.covered_km)),
    }
  }
  for (const entry of Object.values(byId)) {
    entry.coveredPct = entry.needKm > 0 ? r1((entry.coveredKm / entry.needKm) * 100) : 0
    entry.needKm = r1(entry.needKm)
    entry.coveredKm = r1(entry.coveredKm)
  }

  const meta = {
    source: 'Straßenverkehrszählung 2021, BAYSIS (© Bayerische Straßenbauverwaltung, CC BY 4.0)',
    rule: `ERA 2010, Landstraße LS III: Radweg sinnvoll ab DTV > ${ERA_DTV_THRESHOLD_100} Kfz/24h (100 km/h) bzw. > ${ERA_DTV_THRESHOLD_70} (70 km/h)`,
    fetchedAt: new Date().toISOString(),
  }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'traffic-volumes.json'), JSON.stringify({ ...meta, byId }))
  writeFileSync(
    join(outDir, 'traffic-sections-bayern.json'),
    JSON.stringify({
      ...meta,
      sections: sections
        .sort((a, b) => a.id - b.id)
        .map((s) => ({
          id: s.id,
          strasse: s.strasse,
          klasse: s.klasse,
          anfang: s.anfang,
          ende: s.ende,
          fsod: s.fsod,
          dtv: s.dtv,
          maxspeed: s.maxspeed,
          km: Number(Number(s.km).toFixed(2)),
          coveredKm: Number(Number(s.covered_km).toFixed(2)),
          needsBikePath: sectionNeedsBikePath({
            klasse: s.klasse,
            fsod: s.fsod,
            dtv: s.dtv,
            maxspeedKmh: s.maxspeed,
          }),
          link: s.link,
        })),
    }),
  )
  const need = sections.filter((s) =>
    sectionNeedsBikePath({ klasse: s.klasse, fsod: s.fsod, dtv: s.dtv, maxspeedKmh: s.maxspeed }),
  )
  const needKm = need.reduce((a, s) => a + Number(s.km), 0)
  const coveredKm = need.reduce((a, s) => a + Number(s.covered_km), 0)
  process.stdout.write(
    `Bavaria: ${need.length} sections above the ERA threshold, ${needKm.toFixed(0)} km, ` +
      `${((coveredKm / needKm) * 100).toFixed(1)} % with bike infrastructure; ` +
      `${Object.keys(byId).length} regions → output/traffic-volumes.json\n`,
  )
}
