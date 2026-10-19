#!/usr/bin/env bun
/**
 * Fetches and parses Destatis Zensus 2022 regional tables for housing and demography:
 *   1. Regionaltabelle Gebäude und Wohnungen (sheet CSV-Wohnungen):
 *      - QMMIETE: Average net cold rent per square meter (€/m²) — prime proxy for land and housing value.
 *      - LEQ: Residential vacancy rate (Leerstandsquote in %).
 *   2. Regionaltabelle Demografie (sheet CSV-Demografie):
 *      - Youth share under 18 years (%) from Alter_infr__01 to Alter_infr__05.
 *      - Senior share 67+ years (%) from Alter_infr__10 and Alter_infr__11.
 *
 * Keys by official 12-digit Regionalschlüssel (Gemeinden) and 5-digit (Landkreise) / 2-digit (Bundesländer).
 * Maps directly to region id (relation/...) using stats-core.msgpack or stats.msgpack.
 *
 * Output: output/zensus-housing-demographics.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { read, utils } from 'xlsx'

export const ZENSUS_HOUSING_URL =
  'https://www.destatis.de/static/DE/zensus/gitterdaten/Regionaltabelle_Gebaeude_Wohnungen.xlsx'
export const ZENSUS_DEMO_URL =
  'https://www.destatis.de/static/DE/zensus/gitterdaten/Regionaltabelle_Demografie.xlsx'

const CACHE_HOUSING_XLSX = '/tmp/Regionaltabelle_Gebaeude_Wohnungen.xlsx'
const CACHE_DEMO_XLSX = '/tmp/Regionaltabelle_Demografie.xlsx'

export type ZensusHousingDemographics = {
  rentPerM2?: number
  vacancyRatePct?: number
  youthSharePct?: number
  seniorSharePct?: number
}

function parseNumber(val: unknown) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined
  if (typeof val === 'string') {
    const cleaned = val.replace(',', '.').trim()
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

export function normalizeRs(raw: unknown) {
  if (raw == null) return ''
  let s = String(raw).trim()
  if (s.length > 0 && s.length < 12 && /^\d+$/.test(s)) {
    if (s.length === 1 || s.length === 2) {
      s = s.padStart(2, '0')
    } else if (s.length <= 5) {
      s = s.padStart(5, '0')
    } else {
      s = s.padStart(12, '0')
    }
  }
  return s
}

export function parseZensusHousingRows(rows: unknown[][]) {
  const result = new Map<string, { rentPerM2?: number; vacancyRatePct?: number }>()
  if (!rows || rows.length < 2) return result

  const headers = rows[0] as string[]
  const rsIdx = headers.indexOf('_RS')
  const rentIdx = headers.indexOf('QMMIETE')
  const leqIdx = headers.indexOf('LEQ')

  if (rsIdx === -1) return result

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const rs = normalizeRs(row[rsIdx])
    if (!rs) continue

    const rent = rentIdx !== -1 ? parseNumber(row[rentIdx]) : undefined
    const leq = leqIdx !== -1 ? parseNumber(row[leqIdx]) : undefined

    if (rent !== undefined || leq !== undefined) {
      result.set(rs, {
        rentPerM2: rent !== undefined ? Math.round(rent * 100) / 100 : undefined,
        vacancyRatePct: leq !== undefined ? Math.round(leq * 10) / 10 : undefined,
      })
    }
  }
  return result
}

export function parseZensusDemographyRows(rows: unknown[][]) {
  const result = new Map<string, { youthSharePct?: number; seniorSharePct?: number }>()
  if (!rows || rows.length < 2) return result

  const headers = rows[0] as string[]
  const rsIdx = headers.indexOf('_RS')
  const popIdx = headers.indexOf('0_Insgesamt_')
  const a1Idx = headers.indexOf('Alter_infr__01')
  const a2Idx = headers.indexOf('Alter_infr__02')
  const a3Idx = headers.indexOf('Alter_infr__03')
  const a4Idx = headers.indexOf('Alter_infr__04')
  const a5Idx = headers.indexOf('Alter_infr__05')
  const a10Idx = headers.indexOf('Alter_infr__10')
  const a11Idx = headers.indexOf('Alter_infr__11')

  if (rsIdx === -1 || popIdx === -1) return result

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const rs = normalizeRs(row[rsIdx])
    if (!rs) continue

    const pop = parseNumber(row[popIdx])
    if (!pop || pop <= 0) continue

    let youthSum = 0
    let hasYouth = false
    for (const idx of [a1Idx, a2Idx, a3Idx, a4Idx, a5Idx]) {
      if (idx !== -1) {
        const v = parseNumber(row[idx])
        if (v !== undefined) {
          youthSum += v
          hasYouth = true
        }
      }
    }

    let seniorSum = 0
    let hasSenior = false
    for (const idx of [a10Idx, a11Idx]) {
      if (idx !== -1) {
        const v = parseNumber(row[idx])
        if (v !== undefined) {
          seniorSum += v
          hasSenior = true
        }
      }
    }

    const youthSharePct = hasYouth ? Math.round((youthSum / pop) * 1000) / 10 : undefined
    const seniorSharePct = hasSenior ? Math.round((seniorSum / pop) * 1000) / 10 : undefined

    if (youthSharePct !== undefined || seniorSharePct !== undefined) {
      result.set(rs, { youthSharePct, seniorSharePct })
    }
  }
  return result
}

async function getOrFetchBuffer(url: string, cachePath: string, label: string) {
  if (existsSync(cachePath)) {
    process.stdout.write(`Using cached ${label} (${cachePath})\n`)
    return readFileSync(cachePath)
  }
  process.stdout.write(`Downloading ${label} from ${url}...\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    writeFileSync(cachePath, buf)
  } catch {
    // cache write optional
  }
  return buf
}

if (import.meta.main) {
  const scriptDir = import.meta.dir
  const outDir = join(scriptDir, 'output')
  const outPath = join(outDir, 'zensus-housing-demographics.json')

  const [bufHousing, bufDemo] = await Promise.all([
    getOrFetchBuffer(ZENSUS_HOUSING_URL, CACHE_HOUSING_XLSX, 'Zensus Gebäude und Wohnungen'),
    getOrFetchBuffer(ZENSUS_DEMO_URL, CACHE_DEMO_XLSX, 'Zensus Demografie'),
  ])

  process.stdout.write('Parsing housing sheet CSV-Wohnungen...\n')
  const wbHousing = read(bufHousing, { type: 'buffer' })
  const sheetHousing = wbHousing.Sheets['CSV-Wohnungen']
  if (!sheetHousing) throw new Error('CSV-Wohnungen sheet missing in housing workbook')
  const rowsHousing = utils.sheet_to_json<unknown[]>(sheetHousing, { header: 1 })
  const housingByRs = parseZensusHousingRows(rowsHousing)

  process.stdout.write('Parsing demography sheet CSV-Demografie...\n')
  const wbDemo = read(bufDemo, { type: 'buffer' })
  const sheetDemo = wbDemo.Sheets['CSV-Demografie']
  if (!sheetDemo) throw new Error('CSV-Demografie sheet missing in demography workbook')
  const rowsDemo = utils.sheet_to_json<unknown[]>(sheetDemo, { header: 1 })
  const demoByRs = parseZensusDemographyRows(rowsDemo)

  // Merge by RS
  const allRs = new Set([...housingByRs.keys(), ...demoByRs.keys()])
  const byRs: Record<string, ZensusHousingDemographics> = {}
  for (const rs of allRs) {
    const h = housingByRs.get(rs)
    const d = demoByRs.get(rs)
    byRs[rs] = {
      rentPerM2: h?.rentPerM2,
      vacancyRatePct: h?.vacancyRatePct,
      youthSharePct: d?.youthSharePct,
      seniorSharePct: d?.seniorSharePct,
    }
  }

  // Map to region IDs (relation/...) using stats-core.msgpack or stats.msgpack
  process.stdout.write('Mapping RS to region IDs...\n')
  const statsMsgpackPath = existsSync(join(outDir, 'viewer', 'stats-core.msgpack'))
    ? join(outDir, 'viewer', 'stats-core.msgpack')
    : join(outDir, 'stats.msgpack')

  const byId: Record<string, ZensusHousingDemographics> = {}
  if (existsSync(statsMsgpackPath)) {
    const { decode } = await import('@msgpack/msgpack')
    const data = decode(readFileSync(statsMsgpackPath)) as {
      features?: Array<{ properties?: { id?: string; regionalschluessel?: string } }>
    }
    for (const f of data.features || []) {
      const p = f.properties || {}
      const id = String(p.id ?? '')
      const rs = normalizeRs(p.regionalschluessel)
      if (id && rs && byRs[rs]) {
        byId[id] = byRs[rs]
      }
    }
  }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({
      source: 'Destatis Zensus 2022 Regionaltabellen',
      fetchedAt: new Date().toISOString(),
      byRs,
      byId,
    }),
  )
  process.stdout.write(
    `Wrote ${outPath}: ${Object.keys(byRs).length} RS records, ${Object.keys(byId).length} mapped region IDs\n`,
  )
}
