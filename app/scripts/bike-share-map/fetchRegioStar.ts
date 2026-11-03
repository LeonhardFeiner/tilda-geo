#!/usr/bin/env bun
/**
 * Fetches the BMDV/BBSR "Regionalstatistische Raumtypologie" (RegioStaR) reference file: each
 * Gemeinde's spatial type for mobility research. Unlike population density or the Destatis
 * urbanization tier it combines the Gemeinde's own size and function with the region around it,
 * so a village in a metropolitan region and one in a peripheral rural region are told apart.
 *
 *   RegioStaR 7  (71–77): region type × Gemeinde type, from "Stadtregion – Metropole" to
 *                         "Ländliche Region – Kleinstädtischer, dörflicher Raum". Ordinal.
 *   RegioStaR 17 (111–225): finer version of the same.
 *   RegioStaR Gem7 (71–77): Gemeinde type only (Metropole … Kleinstädtischer, dörflicher Raum).
 *
 * Source: https://bmdv.bund.de/SharedDocs/DE/Anlage/G/regiostar-referenzdateien.xlsx
 * (Bearbeitungsstand 13.01.2020, newest sheet = Gebietsstand 31.12.2020). Gemeinden merged since
 * 2020 have no row and stay without a type. Kreisfreie Städte and Stadtstaaten are mapped from
 * their own Gemeinde row; Landkreise and Länder get none (the type describes a Gemeinde).
 *
 * Output: output/regiostar.json {byRs, byId: {id: {r7, r17, gem7}}}
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { read, utils } from 'xlsx'
import { REGIOSTAR7_LABELS } from './contextMetrics'
import { downloadCachePath, OUTPUT_DIR, writeDataset } from './fetchCommon'
import { normalizeRs } from './fetchZensusHousingAndDemographics'

export const REGIOSTAR_URL =
  'https://bmdv.bund.de/SharedDocs/DE/Anlage/G/regiostar-referenzdateien.xlsx?__blob=publicationFile'
export const REGIOSTAR_SHEET = 'ReferenzGebietsstand2020'
export const REGIOSTAR_GEBIETSSTAND = '31.12.2020'

export type RegioStar = { r7: number; r17: number; gem7: number }

export function parseRegioStarRows(rows: unknown[][]) {
  const result = new Map<string, RegioStar>()
  const headers = (rows[0] ?? []).map((h) => String(h ?? '').toLowerCase())
  const col = (name: string) => headers.findIndex((h) => h === name.toLowerCase())
  const rsIdx = headers.findIndex((h) => /^gemrs(_\d+)?$/.test(h))
  const r7Idx = col('RegioStaR7')
  const r17Idx = col('RegioStaR17')
  const gem7Idx = col('RegioStaRGem7')
  if (rsIdx === -1 || r7Idx === -1) return result
  for (const row of rows.slice(1)) {
    if (!row) continue
    const rs = normalizeRs(row[rsIdx])
    const r7 = Number(row[r7Idx])
    if (rs.length !== 12 || !REGIOSTAR7_LABELS[r7]) continue
    result.set(rs, { r7, r17: Number(row[r17Idx]), gem7: Number(row[gem7Idx]) })
  }
  return result
}

/**
 * Region RS → RegioStaR row: Gemeinden by their 12-digit RS; kreisfreie Städte (level 6) and
 * Stadtstaaten (level 4) carry their single Gemeinde's 12-digit RS (or the 5-digit Kreis key).
 * Landkreise and Länder have only 5- / 2-digit keys and get none.
 */
export function regioStarForRegion(
  level: string,
  rs: string,
  byRs: ReadonlyMap<string, RegioStar>,
) {
  if (rs.length === 12)
    return level === '8' || level === '6' || level === '4' ? byRs.get(rs) : undefined
  if (level === '6' && rs.length === 5) return byRs.get(`${rs}0000000`)
  return undefined
}

if (import.meta.main) {
  const cachePath = downloadCachePath('regiostar-referenzdateien.xlsx')
  let buf: Buffer
  if (existsSync(cachePath)) {
    process.stdout.write(`Using cached RegioStaR file (${cachePath})\n`)
    buf = readFileSync(cachePath)
  } else {
    process.stdout.write(`Downloading ${REGIOSTAR_URL}...\n`)
    const res = await fetch(REGIOSTAR_URL)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${REGIOSTAR_URL}`)
    buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(cachePath, buf)
  }
  const sheet = read(buf, { type: 'buffer' }).Sheets[REGIOSTAR_SHEET]
  if (!sheet) throw new Error(`${REGIOSTAR_SHEET} sheet missing in RegioStaR workbook`)
  const byRsMap = parseRegioStarRows(utils.sheet_to_json<unknown[]>(sheet, { header: 1 }))

  // The export itself, not the viewer's copy: that one is from the previous build.
  const { decode } = await import('@msgpack/msgpack')
  const stats = decode(readFileSync(join(OUTPUT_DIR, 'stats.msgpack'))) as {
    features?: Array<{ properties?: { id?: string; level?: string; regionalschluessel?: string } }>
  }
  const byId: Record<string, RegioStar> = {}
  let gemeinden = 0
  let unmatched = 0
  for (const f of stats.features ?? []) {
    const p = f.properties ?? {}
    if (!p.id || !p.regionalschluessel) continue
    const level = String(p.level ?? '')
    const hit = regioStarForRegion(level, normalizeRs(p.regionalschluessel), byRsMap)
    if (level === '8') {
      gemeinden++
      if (!hit) unmatched++
    }
    if (hit) byId[p.id] = hit
  }

  writeDataset(
    join(OUTPUT_DIR, 'regiostar.json'),
    {
      source: `BMDV/BBSR RegioStaR, Gebietsstand ${REGIOSTAR_GEBIETSSTAND}`,
      byRs: Object.fromEntries(byRsMap),
      byId,
    },
    { minCount: 9_000 },
  )
  process.stdout.write(
    `Wrote regiostar.json: ${byRsMap.size} Gemeinden in the file, ${Object.keys(byId).length} regions mapped ` +
      `(${unmatched} of ${gemeinden} OSM Gemeinden without a 2020 row — merged since)\n`,
  )
}
