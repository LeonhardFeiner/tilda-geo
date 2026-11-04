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
 * (Bearbeitungsstand 13.01.2020, newest sheet = Gebietsstand 31.12.2020; BMV still serves this file,
 * the Destatis table has only totals per type). Gemeinden merged or re-keyed since 2020 inherit the
 * type of their 2020 predecessor (matchRegioStar). Kreisfreie Städte and Stadtstaaten are mapped
 * from their own Gemeinde row; Landkreise and Länder get none (the type describes a Gemeinde).
 *
 * Output: output/regiostar.json {byRs, byId: {id: {r7, r17, gem7, from?}}}
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { read, utils } from 'xlsx'
import { REGIOSTAR7_LABELS } from './contextMetrics'
import { downloadCachePath, OUTPUT_DIR, writeDataset } from './fetchCommon'
import { normalizeRs } from './fetchZensusHousingAndDemographics'

export const REGIOSTAR_URL =
  'https://www.bmv.de/SharedDocs/DE/Anlage/G/regiostar-referenzdateien.xlsx?__blob=publicationFile'
export const REGIOSTAR_SHEET = 'ReferenzGebietsstand2020'
export const REGIOSTAR_GEBIETSSTAND = '31.12.2020'

export type RegioStar = {
  r7: number
  r17: number
  gem7: number
  /** Set when the type comes from a 2020 Gemeinde with another key: that Gemeinde's name. */
  from?: string
}

/** One row of the reference sheet, with what the matching of merged Gemeinden needs. */
export type RegioStarRow = RegioStar & { name: string; population: number }

export function parseRegioStarRows(rows: unknown[][]) {
  const result = new Map<string, RegioStarRow>()
  const headers = (rows[0] ?? []).map((h) => String(h ?? '').toLowerCase())
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h))
  const rsIdx = find(/^gemrs(_\d+)?$/)
  const nameIdx = find(/^(name_\d+|gemname)$/)
  const popIdx = find(/^(bev_\d+|gembev)$/)
  const r7Idx = find(/^regiostar7$/)
  const r17Idx = find(/^regiostar17$/)
  const gem7Idx = find(/^regiostargem7$/)
  if (rsIdx === -1 || r7Idx === -1) return result
  for (const row of rows.slice(1)) {
    if (!row) continue
    const rs = normalizeRs(row[rsIdx])
    const r7 = Number(row[r7Idx])
    if (rs.length !== 12 || !REGIOSTAR7_LABELS[r7]) continue
    result.set(rs, {
      r7,
      r17: Number(row[r17Idx]),
      gem7: Number(row[gem7Idx]),
      name: nameIdx === -1 ? '' : String(row[nameIdx] ?? ''),
      population: popIdx === -1 ? 0 : Number(row[popIdx]) || 0,
    })
  }
  return result
}

/** Amtlicher Gemeindeschlüssel (8 digits) of a 12-digit Regionalschlüssel: without the Verband. */
const agsOf = (rs: string) => rs.slice(0, 5) + rs.slice(9)

/** Name words that identify a place: "Hanau, Brüder-Grimm-Stadt" → hanau, brüder, grimm. */
function nameWords(name: string) {
  return (
    name
      .toLowerCase()
      .split(',')[0]!
      .split(/[\s\-/()]+/)
      // "an der", "Stadt", "Markt" and the like say nothing about which place it is.
      .filter((w) => w.length >= 4 && !['stadt', 'markt', 'gemeinde', 'flecken'].includes(w))
  )
}

export type CurrentRegion = {
  id: string
  level: string
  rs: string
  name: string
  /** Level 8, or a level-6/4 region with no Gemeinde inside (kreisfreie Stadt, Stadtstaat). */
  municipality: boolean
}

/**
 * Current regions → RegioStaR type. Gemeinden, kreisfreie Städte and Stadtstaaten whose 12-digit
 * RS is in the 2020 sheet take that row. Since 2020 some Gemeinden changed their Verband (same
 * AGS, new RS) and some merged; for those, in this order:
 *   1. the 2020 row with the same AGS;
 *   2. a 2020 Gemeinde that no longer exists ("predecessor") sharing a name word with the new
 *      one, first in the same Kreis (Langelsheim, Rain), then in the same Land — Kreis changes:
 *      Eisenach (Wartburgkreis since 2021), Hanau (kreisfrei since 2026);
 *   3. else the most populous predecessor in the same Kreis (a merger keeps its centre's type).
 * Landkreise and Länder (5- / 2-digit keys) get none.
 */
export function matchRegioStar(
  regions: readonly CurrentRegion[],
  rows: ReadonlyMap<string, RegioStarRow>,
) {
  // OSM keys some Landkreise like a city (Greiz: 160760000000), so the level alone can't tell.
  const keyOf = (r: CurrentRegion) => {
    if (!r.municipality) return null
    if (r.rs.length === 12) return r.rs
    if (r.rs.length === 5) return `${r.rs}0000000`
    return null
  }
  const currentAgs = new Set(regions.flatMap((r) => (keyOf(r) ? [agsOf(keyOf(r)!)] : [])))
  const rowsByAgs = new Map([...rows].map(([rs, row]) => [agsOf(rs), row]))
  const vanished = [...rows].filter(([rs]) => !currentAgs.has(agsOf(rs)))
  const plain = (row: RegioStarRow): RegioStar => ({ r7: row.r7, r17: row.r17, gem7: row.gem7 })
  const inherited = (row: RegioStarRow): RegioStar => ({ ...plain(row), from: row.name })
  const biggest = (cands: Array<[string, RegioStarRow]>) =>
    cands.reduce<RegioStarRow | null>(
      (best, [, row]) => (!best || row.population > best.population ? row : best),
      null,
    )

  const byId: Record<string, RegioStar> = {}
  const unmatched: CurrentRegion[] = []
  for (const r of regions) {
    const key = keyOf(r)
    if (!key) continue
    const exact = rows.get(key)
    if (exact) {
      byId[r.id] = plain(exact)
      continue
    }
    const sameAgs = rowsByAgs.get(agsOf(key))
    if (sameAgs) {
      byId[r.id] = inherited(sameAgs)
      continue
    }
    const words = nameWords(r.name)
    const named = ([, row]: [string, RegioStarRow]) =>
      nameWords(row.name).some((w) => words.includes(w))
    const inKreis = vanished.filter(([rs]) => rs.slice(0, 5) === key.slice(0, 5))
    const inLand = vanished.filter(([rs]) => rs.slice(0, 2) === key.slice(0, 2))
    const found =
      biggest(inKreis.filter(named)) ?? biggest(inLand.filter(named)) ?? biggest(inKreis)
    if (found) byId[r.id] = inherited(found)
    else unmatched.push(r)
  }
  return { byId, unmatched }
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
    features?: Array<{
      properties?: {
        id?: string
        level?: string
        regionalschluessel?: string
        name?: string
        landkreis_id?: string
      }
    }>
  }
  const kreiseWithGemeinden = new Set(
    (stats.features ?? []).flatMap((f) =>
      String(f.properties?.level) === '8' && f.properties?.landkreis_id
        ? [f.properties.landkreis_id]
        : [],
    ),
  )
  const regions: CurrentRegion[] = (stats.features ?? []).flatMap((f) => {
    const p = f.properties ?? {}
    const level = String(p.level ?? '')
    const rs = normalizeRs(p.regionalschluessel)
    return p.id && rs
      ? [
          {
            id: p.id,
            level,
            rs,
            name: String(p.name ?? ''),
            municipality:
              level === '8' ||
              (level === '6' && !kreiseWithGemeinden.has(p.id)) ||
              (level === '4' && rs.length === 12),
          },
        ]
      : []
  })
  const { byId, unmatched } = matchRegioStar(regions, byRsMap)
  const inheritedCount = Object.values(byId).filter((v) => v.from).length

  writeDataset(
    join(OUTPUT_DIR, 'regiostar.json'),
    {
      source: `BMDV/BBSR RegioStaR, Gebietsstand ${REGIOSTAR_GEBIETSSTAND}`,
      byRs: Object.fromEntries(
        [...byRsMap].map(([rs, { r7, r17, gem7 }]) => [rs, { r7, r17, gem7 }]),
      ),
      byId,
    },
    { minCount: 9_000 },
  )
  process.stdout.write(
    `Wrote regiostar.json: ${byRsMap.size} Gemeinden in the file, ${Object.keys(byId).length} regions mapped, ` +
      `${inheritedCount} of them from a 2020 Gemeinde with another key; unmatched: ${
        unmatched.map((r) => r.name).join(', ') || 'none'
      }\n`,
  )
}
