#!/usr/bin/env bun
/**
 * Fetches and parses KBA (Kraftfahrt-Bundesamt) FZ 3 statistics on passenger car registrations
 * per municipality (Gemeinde, level 8) and district (Landkreis / kreisfreie Stadt, level 6).
 *
 * Source: KBA Reihe FZ 3 (Bestand an Kraftfahrzeugen und Kraftfahrzeuganhängern nach Gemeinden)
 * Computes:
 *   - cars: total passenger cars (Personenkraftwagen insgesamt)
 *   - commercialCars: commercial registrations (darunter gewerbliche Halterinnen und Halter)
 *   - carsPer1000: PKW per 1,000 inhabitants
 *   - commercialSharePct: share of commercial car registrations in %
 *
 * Output: output/car-density.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { read, utils } from 'xlsx'
import { downloadCachePath, writeDataset } from './fetchCommon'

export const KBA_FZ3_URL =
  'https://www.kba.de/SharedDocs/Downloads/DE/Statistik/Fahrzeuge/FZ3/fz3_2024.xlsx?__blob=publicationFile'
const CACHE_XLSX_PATH = downloadCachePath('fz3_2024.xlsx')

export type CarDensityMetrics = {
  cars: number
  commercialCars?: number
  carsPer1000?: number
  /** Residents the rate is based on (Destatis); lets the viewer skip tiny denominators. */
  population?: number
  commercialSharePct?: number
}

function parseInteger(val: unknown) {
  if (typeof val === 'number') return Math.round(val)
  if (typeof val === 'string') {
    const cleaned = val.replace(/\D/g, '')
    const n = parseInt(cleaned, 10)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

export type ParsedKbaRow = {
  type: 'gemeinde' | 'kreis'
  code: string // 8-digit AGS for gemeinde, 5-digit for kreis
  name: string
  cars: number
  commercialCars?: number
}

export function parseKbaFz3Rows(rows: unknown[][]) {
  const gemeinden = new Map<string, ParsedKbaRow>()
  const kreise = new Map<string, ParsedKbaRow>()
  if (!rows || rows.length < 10) return { gemeinden, kreise }

  let currentKreisCode = ''
  let currentKreisName = ''

  for (let i = 8; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const kreisCell = String(row[2] ?? '').trim()
    const gemCell = String(row[3] ?? '').trim()

    // Kreis header row or Kreis code
    const kreisMatch = kreisCell.match(/^(\d{5})\s+(.*)$/)
    if (kreisMatch) {
      currentKreisCode = kreisMatch[1] ?? ''
      currentKreisName = (kreisMatch[2] ?? '').trim()
    }

    const cars = parseInteger(row[5])
    const commercial = parseInteger(row[6])
    if (cars === undefined || cars < 0) continue

    // Check if this row is Kreis "ZUSAMMEN" total
    if (gemCell.toUpperCase().includes('ZUSAMMEN') && currentKreisCode) {
      kreise.set(currentKreisCode, {
        type: 'kreis',
        code: currentKreisCode,
        name: currentKreisName,
        cars,
        commercialCars: commercial,
      })
      continue
    }

    // Gemeinde row: e.g. "08115001 AIDLINGEN"
    const gemMatch = gemCell.match(/^(\d{8})\s*(.*)$/)
    if (gemMatch) {
      const ags = gemMatch[1] ?? ''
      const name = (gemMatch[2] ?? '').trim()
      gemeinden.set(ags, {
        type: 'gemeinde',
        code: ags,
        name,
        cars,
        commercialCars: commercial,
      })
    }
  }

  return { gemeinden, kreise }
}

async function getOrFetchKbaBuffer() {
  if (existsSync(CACHE_XLSX_PATH)) {
    process.stdout.write(`Using cached KBA FZ3 file (${CACHE_XLSX_PATH})\n`)
    return readFileSync(CACHE_XLSX_PATH)
  }
  process.stdout.write(`Downloading KBA FZ3 from ${KBA_FZ3_URL}...\n`)
  const res = await fetch(KBA_FZ3_URL)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${KBA_FZ3_URL}`)
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    writeFileSync(CACHE_XLSX_PATH, buf)
  } catch {
    // cache write optional
  }
  return buf
}

if (import.meta.main) {
  const scriptDir = import.meta.dir
  const outDir = join(scriptDir, 'output')
  const outPath = join(outDir, 'car-density.json')

  const buf = await getOrFetchKbaBuffer()
  process.stdout.write('Parsing KBA FZ 3.1 sheet...\n')
  const wb = read(buf, { type: 'buffer' })
  const sheet = wb.Sheets['FZ 3.1']
  if (!sheet) throw new Error('Sheet FZ 3.1 not found in KBA workbook')
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  const { gemeinden, kreise } = parseKbaFz3Rows(rows)
  process.stdout.write(
    `Parsed ${gemeinden.size} Gemeinden and ${kreise.size} Kreise from KBA FZ3\n`,
  )

  // Load demographics to look up population by RS / AGS
  const demoPath = join(outDir, 'gemeinde-demographics.json')
  const demo = existsSync(demoPath)
    ? (JSON.parse(readFileSync(demoPath, 'utf8')) as {
        gemeinden?: Array<{ rs: string; population: number; name: string }>
      })
    : { gemeinden: [] }

  const agsToGemeinde = new Map<string, { rs: string; population: number }>()
  const rsToGemeinde = new Map<string, { rs: string; population: number }>()
  for (const g of demo.gemeinden ?? []) {
    // 12-digit RS: Land(2)+RB(1)+Kreis(2)+VB(4)+Gem(3)
    // 8-digit AGS: Land(2)+RB(1)+Kreis(2)+Gem(3)
    if (g.rs.length === 12) {
      const ags = g.rs.slice(0, 5) + g.rs.slice(9, 12)
      agsToGemeinde.set(ags, g)
      rsToGemeinde.set(g.rs, g)
    }
  }

  // Load stats.msgpack or stats-core.msgpack for region ID mappings
  // The export itself, not the viewer's copy: that one is from the previous build.
  const statsMsgpackPath = join(outDir, 'stats.msgpack')

  const byId: Record<string, CarDensityMetrics> = {}
  const byCode: Record<string, CarDensityMetrics> = {}

  if (existsSync(statsMsgpackPath)) {
    const { decode } = await import('@msgpack/msgpack')
    const statsData = decode(readFileSync(statsMsgpackPath)) as {
      features?: Array<{
        properties?: { id?: string; level?: string; regionalschluessel?: string; name?: string }
      }>
    }

    // Population per Kreis and Land
    const popByKreisCode = new Map<string, number>()
    for (const g of demo.gemeinden ?? []) {
      const kreisCode = g.rs.slice(0, 5)
      popByKreisCode.set(kreisCode, (popByKreisCode.get(kreisCode) ?? 0) + g.population)
    }

    for (const f of statsData.features || []) {
      const p = f.properties || {}
      const id = String(p.id ?? '')
      const level = String(p.level ?? '')
      const rs = String(p.regionalschluessel ?? '')

      if (level === '8' && rs.length === 12) {
        const ags = rs.slice(0, 5) + rs.slice(9, 12)
        const kba = gemeinden.get(ags)
        const pop = rsToGemeinde.get(rs)?.population
        if (kba && pop && pop > 0) {
          const carsPer1000 = Math.round((kba.cars / pop) * 10000) / 10
          const commercialSharePct =
            kba.commercialCars !== undefined && kba.cars > 0
              ? Math.round((kba.commercialCars / kba.cars) * 1000) / 10
              : undefined
          const entry: CarDensityMetrics = {
            cars: kba.cars,
            commercialCars: kba.commercialCars,
            carsPer1000,
            commercialSharePct,
            population: pop,
          }
          byId[id] = entry
          byCode[ags] = entry
        }
      } else if (level === '6' && rs.length >= 5) {
        const kreisCode = rs.slice(0, 5)
        const kba = kreise.get(kreisCode)
        const pop = popByKreisCode.get(kreisCode)
        if (kba && pop && pop > 0) {
          const carsPer1000 = Math.round((kba.cars / pop) * 10000) / 10
          const commercialSharePct =
            kba.commercialCars !== undefined && kba.cars > 0
              ? Math.round((kba.commercialCars / kba.cars) * 1000) / 10
              : undefined
          const entry: CarDensityMetrics = {
            cars: kba.cars,
            commercialCars: kba.commercialCars,
            carsPer1000,
            commercialSharePct,
            population: pop,
          }
          byId[id] = entry
          byCode[kreisCode] = entry
        }
      } else if (level === '4' && rs.length >= 2) {
        const landCode = rs.slice(0, 2)
        let totalCars = 0
        let totalCommercial = 0
        let totalPop = 0
        for (const [kCode, k] of kreise.entries()) {
          if (kCode.startsWith(landCode)) {
            totalCars += k.cars
            totalCommercial += k.commercialCars ?? 0
            totalPop += popByKreisCode.get(kCode) ?? 0
          }
        }
        if (totalPop > 0 && totalCars > 0) {
          const carsPer1000 = Math.round((totalCars / totalPop) * 10000) / 10
          const commercialSharePct = Math.round((totalCommercial / totalCars) * 1000) / 10
          const entry: CarDensityMetrics = {
            cars: totalCars,
            commercialCars: totalCommercial,
            carsPer1000,
            commercialSharePct,
            population: totalPop,
          }
          byId[id] = entry
          byCode[landCode] = entry
        }
      }
    }
  }

  mkdirSync(outDir, { recursive: true })
  writeDataset(
    outPath,
    { source: 'Kraftfahrt-Bundesamt (KBA) Reihe FZ 3', byCode, byId },
    { minCount: 10_000 },
  )
  process.stdout.write(
    `Wrote ${outPath}: ${Object.keys(byCode).length} KBA code entries, ${Object.keys(byId).length} mapped region IDs\n`,
  )
}
