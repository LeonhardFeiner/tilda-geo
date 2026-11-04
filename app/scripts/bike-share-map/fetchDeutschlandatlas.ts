#!/usr/bin/env bun
/**
 * Gemeinde indicators of the Deutschlandatlas (BMWSB/BBSR, release HA26), the federal open-data
 * collection of regional indicators. Only the ones published per Gemeinde or Gemeindeverband:
 *
 *   taxPerCapita       Steuereinnahmekraft je Einwohner 2024, € (Realsteuervergleich) — what the
 *                      municipality takes in from its own taxes; GEM1224 `st_einnkr`
 *   popGrowthPct       mean population change 2019–2024, % per year; GEM1224 `bev_entw`
 *   primarySchoolMin   car travel time to the nearest primary school, min (Thünen
 *                      Erreichbarkeitsmodell 2024); GEM1222 `p_grunds`
 *   secondarySchoolMin car travel time to the nearest Sekundarstufe-I school, min; `p_sek_1`
 *   supermarketMin     car travel time to the nearest supermarket / discounter, min; `p_markt`
 *   commuteKm          mean commuting distance of employees living there, km, 2024 — per
 *                      Gemeindeverband; VBGEM1224 `pendel`
 *   transitPct         population within 600 m (rail 1,200 m) of a stop with ≥ 20 departures a
 *                      day, %, 2025 — per Gemeindeverband; VBGEM1224 `oenv`
 *
 * Gemeinde files are keyed by the 8-digit AGS, the Verband file by the 9-digit Verband key; both
 * without leading zeros, Latin-1, `;`-separated, decimal comma, -99999 = missing. Gemeinden take
 * the value of their AGS (Verband values: of their Verband); Gemeindeverbände take their own
 * Verband value; Kreise, Regierungsbezirke and Länder the population-weighted mean of their
 * Gemeinden (Destatis Gemeindeverzeichnis populations) — for a per-capita figure like the tax
 * revenue that is exactly the total over the total. Gemeinden merged since the data's Gebietsstand
 * (31.12.2022 / 2024) have no value.
 *
 * Source: https://www.deutschlandatlas.bund.de (Vervielfältigung mit Quellenangabe gestattet).
 * Output: output/deutschlandatlas.json {byId: {id: {...}}}
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { downloadCachePath, OUTPUT_DIR, writeDataset } from './fetchCommon'
import { normalizeRs } from './fetchZensusHousingAndDemographics'

export const DEUTSCHLANDATLAS_RELEASE = 'HA26'
const fileUrl = (name: string) =>
  `https://www.deutschlandatlas.bund.de/fileadmin/Downloaddateien/${DEUTSCHLANDATLAS_RELEASE}/Deutschlandatlas_${name}_${DEUTSCHLANDATLAS_RELEASE}.csv`

export type AtlasValues = {
  taxPerCapita?: number
  popGrowthPct?: number
  primarySchoolMin?: number
  secondarySchoolMin?: number
  supermarketMin?: number
  commuteKm?: number
  transitPct?: number
}
export type AtlasKey = keyof AtlasValues

/** Indicator code per file → our key. */
const GEMEINDE_FILES: Record<string, Partial<Record<string, AtlasKey>>> = {
  GEM1224: { st_einnkr: 'taxPerCapita', bev_entw: 'popGrowthPct' },
  GEM1222: {
    p_grunds: 'primarySchoolMin',
    p_sek_1: 'secondarySchoolMin',
    p_markt: 'supermarketMin',
  },
}
const VERBAND_FILES: Record<string, Partial<Record<string, AtlasKey>>> = {
  VBGEM1224: { pendel: 'commuteKm', oenv: 'transitPct' },
}

/** Digits of precision kept per indicator. */
const DIGITS: Record<AtlasKey, number> = {
  taxPerCapita: 0,
  popGrowthPct: 2,
  primarySchoolMin: 1,
  secondarySchoolMin: 1,
  supermarketMin: 1,
  commuteKm: 1,
  transitPct: 1,
}

/** One Deutschlandatlas CSV → key (leading zeros restored to `keyLength`) → indicator values. */
export function parseAtlasCsv(
  text: string,
  columns: Partial<Record<string, AtlasKey>>,
  keyLength: number,
) {
  const out = new Map<string, AtlasValues>()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = (lines[0] ?? '').split(';').map((h) => h.trim())
  const picks = header.flatMap((h, i) => (columns[h] ? [[i, columns[h]!] as const] : []))
  for (const line of lines.slice(1)) {
    const cells = line.split(';')
    const key = (cells[0] ?? '').trim()
    if (!/^\d+$/.test(key)) continue
    const values: AtlasValues = {}
    for (const [i, name] of picks) {
      const v = Number((cells[i] ?? '').trim().replace(',', '.'))
      if (cells[i]?.trim() && Number.isFinite(v) && v > -99999) values[name] = v
    }
    if (Object.keys(values).length) out.set(key.padStart(keyLength, '0'), values)
  }
  return out
}

/** AGS of a 12-digit Regionalschlüssel (Land, Bezirk, Kreis + Gemeinde, without the Verband). */
export const agsOfRs = (rs: string) => rs.slice(0, 5) + rs.slice(9)

export type AtlasRegion = { id: string; level: string; rs: string }

/**
 * Region → values. `gemeinden` are the current Gemeinden (12-digit RS) with their population;
 * values of a Kreis / Bezirk / Land are their population-weighted mean (see the file header).
 */
export function atlasByRegion(
  regions: readonly AtlasRegion[],
  byAgs: ReadonlyMap<string, AtlasValues>,
  byVerband: ReadonlyMap<string, AtlasValues>,
  population: ReadonlyMap<string, number>,
) {
  const gemeindeValues = (rs: string): AtlasValues => ({
    ...byAgs.get(agsOfRs(rs)),
    ...byVerband.get(rs.slice(0, 9)),
  })
  const gemeinden = [...population].map(([rs, pop]) => ({ rs, pop, v: gemeindeValues(rs) }))
  const weightedMean = (prefix: string): AtlasValues => {
    const out: AtlasValues = {}
    for (const key of Object.keys(DIGITS) as AtlasKey[]) {
      let sum = 0
      let w = 0
      for (const g of gemeinden) {
        const v = g.v[key]
        if (!g.rs.startsWith(prefix) || v == null || !(g.pop > 0)) continue
        sum += v * g.pop
        w += g.pop
      }
      if (w > 0) out[key] = sum / w
    }
    return out
  }
  const rounded = (v: AtlasValues) => {
    const out: AtlasValues = {}
    for (const [k, x] of Object.entries(v) as Array<[AtlasKey, number]>) {
      out[k] = Number(x.toFixed(DIGITS[k]))
    }
    return out
  }

  const byId: Record<string, AtlasValues> = {}
  for (const r of regions) {
    let v: AtlasValues = {}
    if (r.rs.length === 12 && (r.level === '8' || r.level === '6' || r.level === '4')) {
      // A Gemeinde, or a kreisfreie Stadt / Stadtstaat keyed by its single Gemeinde. Landkreise
      // that OSM keys like a city (Greiz: 160760000000) have no AGS row and fall through.
      v = gemeindeValues(r.rs)
      if (!Object.keys(v).length && r.level !== '8') v = weightedMean(r.rs.slice(0, 5))
    } else if (r.level === '7' && r.rs.length === 9) {
      v = { ...weightedMean(r.rs), ...byVerband.get(r.rs) }
    } else if (['6', '5', '4'].includes(r.level) && [5, 3, 2].includes(r.rs.length)) {
      v = weightedMean(r.rs)
    }
    if (Object.keys(v).length) byId[r.id] = rounded(v)
  }
  return byId
}

async function cachedText(name: string) {
  const path = downloadCachePath(`Deutschlandatlas_${name}_${DEUTSCHLANDATLAS_RELEASE}.csv`)
  if (!existsSync(path)) {
    process.stdout.write(`Downloading ${fileUrl(name)}...\n`)
    const res = await fetch(fileUrl(name))
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${fileUrl(name)}`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return new TextDecoder('latin1').decode(readFileSync(path))
}

if (import.meta.main) {
  const byAgs = new Map<string, AtlasValues>()
  for (const [name, cols] of Object.entries(GEMEINDE_FILES)) {
    for (const [ags, v] of parseAtlasCsv(await cachedText(name), cols, 8)) {
      byAgs.set(ags, { ...byAgs.get(ags), ...v })
    }
  }
  const byVerband = new Map<string, AtlasValues>()
  for (const [name, cols] of Object.entries(VERBAND_FILES)) {
    for (const [key, v] of parseAtlasCsv(await cachedText(name), cols, 9)) {
      byVerband.set(key, { ...byVerband.get(key), ...v })
    }
  }

  const demographics = JSON.parse(
    readFileSync(join(OUTPUT_DIR, 'gemeinde-demographics.json'), 'utf8'),
  ) as { gemeinden: Array<{ rs: string; population: number }> }
  const population = new Map(demographics.gemeinden.map((g) => [normalizeRs(g.rs), g.population]))

  // The export itself, not the viewer's copy: that one is from the previous build.
  const { decode } = await import('@msgpack/msgpack')
  const stats = decode(readFileSync(join(OUTPUT_DIR, 'stats.msgpack'))) as {
    features?: Array<{ properties?: { id?: string; level?: string; regionalschluessel?: string } }>
  }
  const regions: AtlasRegion[] = (stats.features ?? []).flatMap((f) => {
    const p = f.properties ?? {}
    const rs = normalizeRs(p.regionalschluessel)
    return p.id && rs ? [{ id: p.id, level: String(p.level ?? ''), rs }] : []
  })
  const byId = atlasByRegion(regions, byAgs, byVerband, population)
  const gemeinden = regions.filter((r) => r.level === '8')
  const missing = gemeinden.filter((r) => byId[r.id]?.taxPerCapita == null).length

  writeDataset(
    join(OUTPUT_DIR, 'deutschlandatlas.json'),
    { source: `Deutschlandatlas ${DEUTSCHLANDATLAS_RELEASE} (BMWSB/BBSR)`, byId },
    { minCount: 9_000 },
  )
  process.stdout.write(
    `Wrote deutschlandatlas.json: ${byAgs.size} Gemeinden, ${byVerband.size} Verbände in the files; ` +
      `${Object.keys(byId).length} regions; ${missing} of ${gemeinden.length} Gemeinden without a tax value\n`,
  )
}
