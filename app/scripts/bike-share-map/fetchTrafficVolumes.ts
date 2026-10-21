#!/usr/bin/env bun
/**
 * Motor traffic per day (DTV) on counted rural road sections, and whether each busy one has bike
 * infrastructure next to it. Two results:
 *  - Bavaria, all classes (B, St, K) — official BAYSIS section geometry;
 *  - Germany, Bundesstraßen only — comparable everywhere: BAYSIS B sections in Bavaria, BASt
 *    sections elsewhere.
 *
 * Bavaria: Straßenverkehrszählung 2021 via the BAYSIS Verkehrsdaten WFS
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
 * Other Länder: BASt, SVZ 2021 results for Bundesstraßen (bast.de/svz, sheet "Zeilenformat").
 * BASt gives a counting point (UTM 32) and the section length, no line: the section is
 * approximated as the OSM ways with the same number (name_ref "B 4") within half the open-road
 * length around the point. Its km come from BASt (a dual carriageway would count twice in OSM);
 * OSM only supplies the share with a path. An approximation — documented on the methodology page.
 *
 * Coverage: each section is sampled every ~50 m; a sample counts as covered when bike
 * infrastructure (see COVERING_CATEGORIES) lies within ~20 m. BAYSIS geometry is the official
 * road network, a few metres off OSM at most.
 *
 * Needs local Postgres with the processing run behind the current stats (bikelanes, roads,
 * aggregated_lengths). Output: output/traffic-volumes.json (Bavaria, all classes, per region),
 * output/traffic-federal.json (Germany, Bundesstraßen, per region), output/busy-roads.geojson
 * (map lines) and output/traffic-sections-bayern.json (BAYSIS sections, no geometry).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { read, utils } from 'xlsx'
import { getBaseDatabaseUrl } from '@/server/database-url.server'
import { BAYERN_ID } from './constants'
import { downloadCachePath, writeDataset } from './fetchCommon'

const BAST_XLSX_URL =
  'https://www.bast.de/DE/Publikationen/Statistik/Verkehrsdaten/2021/Bundesstrassen-2021.xlsx?__blob=publicationFile&v=1'
const BAST_SVZ_PAGE =
  'https://www.bast.de/DE/Publikationen/Statistik/Verkehrsdaten/Manuelle-Zaehlung.html'
/** BASt "Land" number of Bavaria (1–16); Bavaria comes from BAYSIS instead. */
const BAST_LAND_BAYERN = 9
/** BASt section ids start here, so they never clash with BAYSIS OBJECTIDs. */
const BAST_ID_OFFSET = 1_000_000

const WFS_URL =
  'https://gisportal-stmb.bayern.de/server/services/WFS/BAYSIS_Verkehrsdaten/MapServer/WFSServer' +
  '?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeNames=BAYSIS_Verkehrsdaten:svz2021_zaehlstellenbereiche&outputFormat=GEOJSON'

export const ERA_DTV_THRESHOLD_100 = 2500
export const ERA_DTV_THRESHOLD_70 = 4000
const SAMPLE_STEP_M = 50
const COVER_DISTANCE_M = 20

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

export type BastSection = {
  id: number
  strasse: string
  anfang: string | null
  ende: string | null
  dtv: number
  /** Open-road length of the section in metres (BASt LängeFS). */
  lengthM: number
  /** Counting point, ETRS89 / UTM 32N. */
  x: number
  y: number
}

/** Open-road Bundesstraße sections outside Bavaria with a count, a length and a position. */
export function parseBastRows(rows: Array<Record<string, unknown>>): BastSection[] {
  const num = (v: unknown) =>
    typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return rows.flatMap((row, i) => {
    const strasse = String(row.Str ?? '').trim()
    const dtv = num(row.DTV)
    const lengthKm = num(row.LängeFS)
    const x = num(row.X_Koordinate)
    const y = num(row.Y_Koordinate)
    if (!/^B \d/.test(strasse) || num(row.Land) === BAST_LAND_BAYERN) return []
    if (row.FSOD !== 'FS' || !(dtv > 0) || !(lengthKm > 0) || !(x > 0) || !(y > 0)) return []
    return [
      {
        id: BAST_ID_OFFSET + i,
        strasse,
        anfang: row.Anfang == null ? null : String(row.Anfang),
        ende: row.Ende == null ? null : String(row.Ende),
        dtv,
        lengthM: lengthKm * 1000,
        x,
        y,
      },
    ]
  })
}

/** BASt sections as svz rows: the same-numbered OSM ways within half the length of the point. */
async function loadFederalSections(client: Client, sections: BastSection[]) {
  await client.query(
    `
    WITH b AS (
      SELECT id, strasse, anfang, ende, dtv, length_m,
        ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 25832), 3857) AS pt
      FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[],
        $7::float8[], $8::float8[]) AS t(id, strasse, anfang, ende, dtv, length_m, x, y)
    ),
    near AS (
      SELECT b.*, (b.length_m / 2) / cos(radians(ST_Y(ST_Transform(b.pt, 4326)))) AS radius
      FROM b
    )
    INSERT INTO svz (id, strasse, klasse, anfang, ende, dtv, fsod, link, target_m, geom)
    SELECT n.id, n.strasse, 'B', n.anfang, n.ende, n.dtv, 'FS', $9, n.length_m,
      ST_Multi(ST_CollectionExtract(ST_Intersection(ST_Collect(r.geom), ST_Buffer(n.pt, n.radius)), 2))
    FROM near n
    JOIN public.roads r ON r.tags ->> 'name_ref' = n.strasse AND ST_DWithin(r.geom, n.pt, n.radius)
    GROUP BY n.id, n.strasse, n.anfang, n.ende, n.dtv, n.length_m, n.pt, n.radius
    `,
    [
      sections.map((s) => s.id),
      sections.map((s) => s.strasse),
      sections.map((s) => s.anfang),
      sections.map((s) => s.ende),
      sections.map((s) => s.dtv),
      sections.map((s) => s.lengthM),
      sections.map((s) => s.x),
      sections.map((s) => s.y),
      BAST_SVZ_PAGE,
    ],
  )
  await client.query(`DELETE FROM svz WHERE geom IS NULL OR ST_IsEmpty(geom)`)
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
      -- Official length where the geometry is only an approximation (BASt); null = use geometry.
      target_m float,
      geom geometry(MultiLineString, 3857)
    )
  `)
  await client.query(
    `
    INSERT INTO svz (id, strasse, klasse, anfang, ende, dtv, fsod, link, geom)
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
      SELECT s.id, s.target_m, d.path[1] AS part, d.geom,
        ST_Length(ST_Transform(d.geom, 4326)::geography) AS len_m
      FROM svz s, ST_Dump(s.geom) d
    ),
    scaled AS (
      -- With an official length, the geometry only says where; its weights add up to that length.
      SELECT p.*, COALESCE(p.target_m / NULLIF(SUM(p.len_m) OVER (PARTITION BY p.id), 0), 1) AS scale
      FROM parts p
    )
    SELECT p.id, p.part, i, p.len_m / k.n * p.scale AS w,
      ST_LineInterpolatePoint(p.geom, (i - 0.5) / k.n) AS pt
    FROM scaled p
    CROSS JOIN LATERAL (SELECT GREATEST(1, CEIL(p.len_m / ${SAMPLE_STEP_M}))::int AS n) k
    CROSS JOIN LATERAL generate_series(1, k.n) i
  `)
  await client.query(`CREATE INDEX ON pts USING gist (pt)`)
  await client.query(
    `
    CREATE TEMP TABLE pts_eval AS
    SELECT p.id, p.part, p.i, p.w, p.pt,
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

/**
 * Map lines for the sections above the ERA threshold: per section, the stretches with and
 * without bike infrastructure. Consecutive samples (50 m apart) are joined into short lines that
 * take the first sample's status, then merged per status and simplified to ~10 m.
 */
async function needLines(client: Client, needIds: number[]) {
  const { rows } = await client.query<{ id: number; covered: boolean; g: string }>(
    `
    WITH ordered AS (
      SELECT e.id, e.covered, e.pt,
        LEAD(e.pt) OVER (PARTITION BY e.id, e.part ORDER BY e.i) AS next_pt
      FROM pts_eval e
      WHERE e.id = ANY ($1::int[])
    )
    SELECT id, covered,
      ST_AsGeoJSON(
        ST_Transform(
          ST_SimplifyPreserveTopology(ST_LineMerge(ST_Collect(ST_MakeLine(pt, next_pt))), 15),
          4326
        ),
        5
      ) AS g
    FROM ordered
    WHERE next_pt IS NOT NULL
    GROUP BY id, covered
    `,
    [needIds],
  )
  return rows
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
    bavaria: boolean
    need_km: number
    covered_km: number
  }>(
    `
    WITH bayern AS (SELECT geom FROM public.aggregated_lengths WHERE id = $3),
    areas AS (
      SELECT al.id, al.level,
        al.level <> '2' AND ST_Intersects(bayern.geom, ST_PointOnSurface(al.geom)) AS in_bayern,
        ST_Subdivide(ST_MakeValid(al.geom), 255) AS g
      FROM public.aggregated_lengths al, bayern
      WHERE al.level IN ('2', '4', '5', '6', '7', '8', '9')
    )
    -- bavaria: the all-classes result, only for Bavarian regions; every row also feeds the
    -- Bundesstraßen result (filtered to klasse B by the caller).
    SELECT a.id AS region, s.klasse, a.in_bayern AND s.id < $2 AS bavaria,
      SUM(e.w) / 1000 AS need_km,
      COALESCE(SUM(e.w) FILTER (WHERE e.covered), 0) / 1000 AS covered_km
    FROM pts_eval e
    JOIN svz s ON s.id = e.id
    JOIN areas a ON ST_Intersects(a.g, e.pt)
    WHERE e.id = ANY ($1::int[])
    GROUP BY a.id, s.klasse, a.in_bayern AND s.id < $2
    `,
    [needIds, BAST_ID_OFFSET, BAYERN_ID],
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

/** Per region: km above the threshold and km with a path, in total and per road class. */
export function aggregateTrafficRegions(
  rows: Array<{ region: string; klasse: string; need_km: number; covered_km: number }>,
) {
  const byId: Record<string, TrafficRegion> = {}
  for (const row of rows) {
    const entry = (byId[row.region] ??= { needKm: 0, coveredKm: 0, coveredPct: 0, byClass: {} })
    const need = Number(row.need_km)
    const covered = Number(row.covered_km)
    entry.needKm += need
    entry.coveredKm += covered
    const cls = (entry.byClass[row.klasse as NeedRoadClass] ??= { needKm: 0, coveredKm: 0 })
    cls.needKm = r1(cls.needKm + need)
    cls.coveredKm = r1(cls.coveredKm + covered)
  }
  for (const entry of Object.values(byId)) {
    entry.coveredPct = entry.needKm > 0 ? r1((entry.coveredKm / entry.needKm) * 100) : 0
    entry.needKm = r1(entry.needKm)
    entry.coveredKm = r1(entry.coveredKm)
  }
  return byId
}

if (import.meta.main) {
  const outDir = join(import.meta.dir, 'output')
  // The 2021 census does not change, and BAYSIS has blocked hosts that fetch it repeatedly:
  // download once, then reuse. Delete the cache file to fetch again (e.g. for SVZ 2026).
  const cachePath = downloadCachePath('baysis-svz2021-zaehlstellenbereiche.geojson')
  if (!existsSync(cachePath)) {
    const res = await fetch(WFS_URL)
    if (!res.ok) throw new Error(`BAYSIS WFS: HTTP ${res.status}`)
    writeFileSync(cachePath, await res.text())
  }
  const { features } = JSON.parse(readFileSync(cachePath, 'utf8')) as { features: WfsFeature[] }
  process.stdout.write(`BAYSIS: ${features.length} counted sections\n`)

  const bastPath = downloadCachePath('bast-svz2021-bundesstrassen.xlsx')
  if (!existsSync(bastPath)) {
    const res = await fetch(BAST_XLSX_URL)
    if (!res.ok) throw new Error(`BASt SVZ 2021: HTTP ${res.status}`)
    writeFileSync(bastPath, Buffer.from(await res.arrayBuffer()))
  }
  const bastBook = read(readFileSync(bastPath), { sheets: ['Zeilenformat'] })
  const bastSections = parseBastRows(
    utils.sheet_to_json<Record<string, unknown>>(bastBook.Sheets.Zeilenformat!),
  )
  process.stdout.write(
    `BASt: ${bastSections.length} open-road Bundesstraße sections outside Bavaria\n`,
  )

  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  let sections: SectionRow[]
  let regions: Awaited<ReturnType<typeof regionSums>>
  let lines: Awaited<ReturnType<typeof needLines>>
  try {
    await client.query('SET statement_timeout = 0')
    await loadSections(client, features)
    await loadFederalSections(client, bastSections)
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
    lines = await needLines(client, needIds)
  } finally {
    await client.end()
  }

  const byId = aggregateTrafficRegions(regions.filter((row) => row.bavaria))
  const federalById = aggregateTrafficRegions(regions.filter((row) => row.klasse === 'B'))

  const meta = {
    source: 'Straßenverkehrszählung 2021, BAYSIS (© Bayerische Straßenbauverwaltung, CC BY 4.0)',
    rule: `ERA 2010, Landstraße LS III: Radweg sinnvoll ab DTV > ${ERA_DTV_THRESHOLD_100} Kfz/24h (100 km/h) bzw. > ${ERA_DTV_THRESHOLD_70} (70 km/h)`,
    fetchedAt: new Date().toISOString(),
  }
  mkdirSync(outDir, { recursive: true })
  writeDataset(join(outDir, 'traffic-volumes.json'), { ...meta, byId }, { minCount: 1000 })
  writeDataset(
    join(outDir, 'traffic-federal.json'),
    {
      ...meta,
      source:
        'Straßenverkehrszählung 2021: BAYSIS (Bayern, CC BY 4.0) und BASt (übrige Länder, Bundesstraßen)',
      byId: federalById,
    },
    { minCount: 1000 },
  )
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  writeFileSync(
    join(outDir, 'busy-roads.geojson'),
    JSON.stringify({
      type: 'FeatureCollection',
      ...meta,
      features: lines.flatMap((l) => {
        const s = sectionById.get(l.id)
        if (!s) return []
        return [
          {
            type: 'Feature',
            geometry: JSON.parse(l.g),
            properties: {
              id: s.id,
              strasse: s.strasse,
              anfang: s.anfang,
              ende: s.ende,
              dtv: Math.round(s.dtv),
              maxspeed: s.maxspeed,
              covered: l.covered,
              coveredPct: s.km > 0 ? Math.round((Number(s.covered_km) / Number(s.km)) * 100) : 0,
              link: s.link,
              quelle: s.id >= BAST_ID_OFFSET ? 'BASt' : 'BAYSIS',
            },
          },
        ]
      }),
    }),
  )
  writeFileSync(
    join(outDir, 'traffic-sections-bayern.json'),
    JSON.stringify({
      ...meta,
      sections: sections
        .filter((s) => s.id < BAST_ID_OFFSET)
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
  const need = sections.filter(
    (s) =>
      s.id < BAST_ID_OFFSET &&
      sectionNeedsBikePath({ klasse: s.klasse, fsod: s.fsod, dtv: s.dtv, maxspeedKmh: s.maxspeed }),
  )
  const needKm = need.reduce((a, s) => a + Number(s.km), 0)
  const coveredKm = need.reduce((a, s) => a + Number(s.covered_km), 0)
  process.stdout.write(
    `Bavaria: ${need.length} sections above the ERA threshold, ${needKm.toFixed(0)} km, ` +
      `${((coveredKm / needKm) * 100).toFixed(1)} % with bike infrastructure; ` +
      `${Object.keys(byId).length} regions → output/traffic-volumes.json\n`,
  )
  const de = Object.entries(federalById).find(([id]) => id === 'relation/51477')?.[1]
  if (de) {
    process.stdout.write(
      `Germany, Bundesstraßen: ${de.needKm} km above the threshold, ${de.coveredPct} % with ` +
        `bike infrastructure; ${Object.keys(federalById).length} regions → output/traffic-federal.json\n`,
    )
  }
}
