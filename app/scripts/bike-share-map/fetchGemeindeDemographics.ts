#!/usr/bin/env bun
/**
 * Fetches Destatis' "Gemeindeverzeichnis" quarterly extract (population, area, and the
 * official "Grad der Verstädterung" — degree of urbanization — per Gemeinde) and writes a
 * compact JSON keyed by the 12-digit amtlicher Regionalschlüssel (Land+RB+Kreis+VB+Gem).
 * That's the same RS already stored on `public.aggregated_lengths.regionalschluessel`
 * (see aggregatedLengthsExport.ts / export-stats-geojson.ts), so it joins directly — no id
 * remapping needed. Used by generateSharePages.ts to compare a Gemeinde against demographic
 * peers nationwide (similar population, same urbanization tier) instead of only its own
 * Landkreis — the comparison that answers "we're just rural, of course we're behind".
 *
 * Source: Destatis' "always current" quarterly-refreshed URL (currently Gebietsstand
 * 31.12.2025). Re-run via `bun run bike-share-map:gemeinde-demographics` whenever you want
 * current numbers; the output is committed since it's small (~1MB) and changes only quarterly.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { read, utils } from 'xlsx'

const GEMEINDEVERZEICHNIS_URL =
  'https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/Administrativ/Archiv/GVAuszugQ/AuszugGV4QAktuell.xlsx?__blob=publicationFile'

/** Destatis "Grad der Verstädterung" (matches Eurostat DEGURBA): 01 dense, 02 intermediate, 03 rural. */
export type UrbanizationCode = '01' | '02' | '03'

export type GemeindeDemographics = {
  /** 12-digit amtlicher Regionalschlüssel. */
  rs: string
  name: string
  population: number
  areaKm2: number
  densityPerKm2: number
  urbanizationCode: UrbanizationCode
}

// Column indices in the "Onlineprodukt_Gemeinden…" sheet, 0-based, header row read with {header:1}.
const SATZART_COL = 0
const LAND_COL = 2
const RB_COL = 3
const KREIS_COL = 4
const VB_COL = 5
const GEM_COL = 6
const NAME_COL = 7
const AREA_KM2_COL = 8
const POPULATION_COL = 9
const DENSITY_COL = 12
const URBANIZATION_CODE_COL = 18

/** Satzart "60" rows are the actual Gemeinden (incl. kreisfreie Städte); other Satzarten are headers/subtotals. */
const GEMEINDE_SATZART = '60'

function isUrbanizationCode(value: unknown): value is UrbanizationCode {
  return value === '01' || value === '02' || value === '03'
}

/** Pure parser (no network) so the sheet layout can be tested against a fixture. */
export function parseGemeindeSheetRows(rows: unknown[][]): GemeindeDemographics[] {
  const out: GemeindeDemographics[] = []
  for (const row of rows) {
    if (row[SATZART_COL] !== GEMEINDE_SATZART) continue
    const urbanizationCode = row[URBANIZATION_CODE_COL]
    // A handful of rows (freshly merged/renamed Gemeinden) lack a classification — skip them.
    if (!isUrbanizationCode(urbanizationCode)) continue
    const population = row[POPULATION_COL]
    const areaKm2 = row[AREA_KM2_COL]
    if (typeof population !== 'number' || typeof areaKm2 !== 'number' || areaKm2 <= 0) continue
    const rs = `${row[LAND_COL]}${row[RB_COL]}${row[KREIS_COL]}${row[VB_COL]}${row[GEM_COL]}`
    if (!/^\d{12}$/.test(rs)) continue
    const density = row[DENSITY_COL]
    out.push({
      rs,
      name: String(row[NAME_COL] ?? ''),
      population,
      areaKm2,
      densityPerKm2: typeof density === 'number' ? density : population / areaKm2,
      urbanizationCode,
    })
  }
  return out
}

export async function fetchGemeindeDemographics() {
  const res = await fetch(GEMEINDEVERZEICHNIS_URL)
  if (!res.ok) {
    throw new Error(`Destatis Gemeindeverzeichnis fetch failed: HTTP ${res.status}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const workbook = read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames.find((n) => n.startsWith('Onlineprodukt_Gemeinden'))
  if (!sheetName) {
    throw new Error(
      `Destatis workbook has no "Onlineprodukt_Gemeinden…" sheet (found: ${workbook.SheetNames.join(', ')})`,
    )
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Destatis workbook: sheet "${sheetName}" missing`)
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true })
  const gemeinden = parseGemeindeSheetRows(rows)
  if (gemeinden.length < 10000) {
    throw new Error(
      `Only parsed ${gemeinden.length} Gemeinden from "${sheetName}" (expected ~11k) – ` +
        `Destatis may have changed the sheet layout; check the column indices in this file.`,
    )
  }
  return { sourceSheet: sheetName, gemeinden }
}

if (import.meta.main) {
  const outDir = join(import.meta.dir, 'output')
  const outPath = join(outDir, 'gemeinde-demographics.json')
  const { sourceSheet, gemeinden } = await fetchGemeindeDemographics()
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({
      source: GEMEINDEVERZEICHNIS_URL,
      sourceSheet,
      fetchedAt: new Date().toISOString(),
      gemeinden,
    }),
  )
  process.stdout.write(`${outPath} (${gemeinden.length} Gemeinden, from "${sourceSheet}")\n`)
}
