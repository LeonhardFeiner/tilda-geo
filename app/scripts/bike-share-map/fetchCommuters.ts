#!/usr/bin/env bun
/**
 * Fetches and processes commuter statistics from the Bundesagentur für Arbeit (BA).
 *
 * Source: Statistik der Bundesagentur für Arbeit – Gemeindedaten der sozialversicherungspflichtig
 * Beschäftigten nach Wohn- und Arbeitsort (Stichtag 30. Juni 2025, Revision 2026).
 * URL: https://statistik.arbeitsagentur.de/Statistikdaten/Detail/202506/iiia6/beschaeftigung-sozbe-gemband/gemband-dlk-0-202506-xlsx.xlsx?__blob=publicationFile&v=1
 *
 * Metrics per municipality (Gemeinde, level 8), district (Landkreis, level 6), and state (Bundesland, level 4):
 *   - employedAtResidence: Sozialversicherungspflichtig Beschäftigte am Wohnort
 *   - employedAtWorkplace: Sozialversicherungspflichtig Beschäftigte am Arbeitsort
 *   - inCommuters: Einpendler (zur Arbeit einpendelnd)
 *   - outCommuters: Auspendler (zur Arbeit auspendelnd)
 *   - internalEmployed: Innerörtlich Beschäftigte (Wohnort = Arbeitsort)
 *   - netCommuters: Pendlersaldo (Einpendler minus Auspendler)
 *   - inCommuterSharePct: Einpendlerquote (%) = Einpendler ÷ Arbeitsplätze
 *   - outCommuterSharePct: Auspendlerquote (%) = Auspendler ÷ Beschäftigte am Wohnort
 *   - jobCentrality: Arbeitsplatzzentralität = Arbeitsplätze ÷ Beschäftigte am Wohnort
 *   - workplaces: Betriebe / Arbeitsstätten
 *   - jobsPer1000Inhabitants: Arbeitsplätze je 1.000 Einwohner
 *
 * Output: output/commuters.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { downloadCachePath, writeDataset } from './fetchCommon'

export const BA_COMMUTER_2025_XLSX_URL =
  'https://statistik.arbeitsagentur.de/Statistikdaten/Detail/202506/iiia6/beschaeftigung-sozbe-gemband/gemband-dlk-0-202506-xlsx.xlsx?__blob=publicationFile&v=1'
const CACHE_XLSX_PATH = downloadCachePath('gemband-dlk-0-202506-xlsx.xlsx')

export type CommuterMetrics = {
  employedAtResidence?: number
  employedAtWorkplace?: number
  inCommuters?: number
  outCommuters?: number
  internalEmployed?: number
  netCommuters?: number
  inCommuterSharePct?: number
  outCommuterSharePct?: number
  jobCentrality?: number
  workplaces?: number
  jobsPer1000Inhabitants?: number
}

export type ParsedCommuterEntry = {
  name: string
  employedAtResidence?: number
  employedAtWorkplace?: number
  internalEmployed?: number
  inCommuters?: number
  outCommuters?: number
  workplaces?: number
}

function parseNumericCell(val: unknown) {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/\s+/g, '')
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned)
  }
  return undefined
}

export function parseCommuterRows(rows: unknown[][]) {
  const result = new Map<string, ParsedCommuterEntry>()
  if (!Array.isArray(rows) || rows.length < 2) return result

  for (const row of rows) {
    if (!row || !Array.isArray(row) || row.length < 14) continue
    const agsRaw = row[0]
    if (agsRaw == null) continue
    const ags = String(agsRaw).trim()
    if (!ags || !/^\d+$/.test(ags) || (ags.length !== 8 && ags.length !== 5 && ags.length !== 2)) {
      continue
    }

    const name = typeof row[1] === 'string' ? row[1].trim() : ''

    const employedAtResidence = parseNumericCell(row[2])
    const employedAtWorkplace = parseNumericCell(row[10])
    const internalEmployed = parseNumericCell(row[11])
    const inCommuters = parseNumericCell(row[12])
    const outCommuters = parseNumericCell(row[13])
    const workplaces = parseNumericCell(row[14])

    result.set(ags, {
      name,
      employedAtResidence,
      employedAtWorkplace,
      internalEmployed,
      inCommuters,
      outCommuters,
      workplaces,
    })
  }

  return result
}

export function computeCommuterMetrics(entry: ParsedCommuterEntry, population?: number) {
  const res: CommuterMetrics = {
    employedAtResidence: entry.employedAtResidence,
    employedAtWorkplace: entry.employedAtWorkplace,
    inCommuters: entry.inCommuters,
    outCommuters: entry.outCommuters,
    internalEmployed: entry.internalEmployed,
    workplaces: entry.workplaces,
  }

  if (typeof entry.inCommuters === 'number' && typeof entry.outCommuters === 'number') {
    res.netCommuters = entry.inCommuters - entry.outCommuters
  } else if (
    typeof entry.employedAtWorkplace === 'number' &&
    typeof entry.employedAtResidence === 'number'
  ) {
    res.netCommuters = entry.employedAtWorkplace - entry.employedAtResidence
  }

  if (
    typeof entry.inCommuters === 'number' &&
    typeof entry.employedAtWorkplace === 'number' &&
    entry.employedAtWorkplace > 0
  ) {
    res.inCommuterSharePct = Math.round((entry.inCommuters / entry.employedAtWorkplace) * 1000) / 10
  }

  if (
    typeof entry.outCommuters === 'number' &&
    typeof entry.employedAtResidence === 'number' &&
    entry.employedAtResidence > 0
  ) {
    res.outCommuterSharePct =
      Math.round((entry.outCommuters / entry.employedAtResidence) * 1000) / 10
  }

  if (
    typeof entry.employedAtWorkplace === 'number' &&
    typeof entry.employedAtResidence === 'number' &&
    entry.employedAtResidence > 0
  ) {
    res.jobCentrality =
      Math.round((entry.employedAtWorkplace / entry.employedAtResidence) * 100) / 100
  }

  if (
    typeof entry.employedAtWorkplace === 'number' &&
    typeof population === 'number' &&
    population > 0
  ) {
    res.jobsPer1000Inhabitants = Math.round((entry.employedAtWorkplace / population) * 10000) / 10
  }

  return res
}

export async function fetchCommutersXlsx() {
  if (existsSync(CACHE_XLSX_PATH)) {
    return readFileSync(CACHE_XLSX_PATH)
  }

  process.stdout.write(
    `Downloading BA commuter statistics 2025 from ${BA_COMMUTER_2025_XLSX_URL} …\n`,
  )
  const res = await fetch(BA_COMMUTER_2025_XLSX_URL)
  if (!res.ok) {
    throw new Error(`Failed to download BA commuter statistics: ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(CACHE_XLSX_PATH, buf)
  return buf
}

if (import.meta.main) {
  const outDir = join(import.meta.dir, 'output')
  const outPath = join(outDir, 'commuters.json')

  let xlsxBuffer: Buffer
  try {
    xlsxBuffer = await fetchCommutersXlsx()
  } catch (err) {
    process.stderr.write(`Failed to load BA commuter workbook: ${err}\n`)
    process.exit(1)
  }

  process.stdout.write(`Reading BA commuter workbook (${xlsxBuffer.length} bytes) …\n`)
  const wb = XLSX.read(xlsxBuffer, { type: 'buffer' })
  const sheet = wb.Sheets['Gemeindedaten']
  if (!sheet) {
    process.stderr.write(`Sheet 'Gemeindedaten' not found in workbook\n`)
    process.exit(1)
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
  const parsedMap = parseCommuterRows(rows)
  process.stdout.write(`Parsed ${parsedMap.size} regions from BA commuter spreadsheet\n`)

  // Read demographics for population normalization (jobs per 1,000 inhabitants)
  const demoPath = join(outDir, 'gemeinde-demographics.json')
  const rsToGemeinde = new Map<string, { population: number }>()
  const popByKreisCode = new Map<string, number>()
  const popByLandCode = new Map<string, number>()

  if (existsSync(demoPath)) {
    const demo = JSON.parse(readFileSync(demoPath, 'utf8')) as {
      gemeinden?: Array<{ rs: string; population: number }>
    }
    for (const g of demo.gemeinden ?? []) {
      rsToGemeinde.set(g.rs, g)
      const kCode = g.rs.slice(0, 5)
      const lCode = g.rs.slice(0, 2)
      popByKreisCode.set(kCode, (popByKreisCode.get(kCode) ?? 0) + g.population)
      popByLandCode.set(lCode, (popByLandCode.get(lCode) ?? 0) + g.population)
    }
  }

  const byId: Record<string, CommuterMetrics> = {}
  const byCode: Record<string, CommuterMetrics> = {}

  // Populate byCode
  for (const [code, entry] of parsedMap.entries()) {
    let pop: number | undefined
    if (code.length === 8) {
      // Find matching RS from demo
      for (const [rs, g] of rsToGemeinde.entries()) {
        const ags = rs.slice(0, 5) + rs.slice(9, 12)
        if (ags === code) {
          pop = g.population
          break
        }
      }
    } else if (code.length === 5) {
      pop = popByKreisCode.get(code)
    } else if (code.length === 2) {
      pop = popByLandCode.get(code)
    }

    byCode[code] = computeCommuterMetrics(entry, pop)
  }

  // Populate byId using stats.msgpack
  // The export itself, not the viewer's copy: that one is from the previous build.
  const statsMsgpackPath = join(outDir, 'stats.msgpack')

  if (existsSync(statsMsgpackPath)) {
    const { decode } = await import('@msgpack/msgpack')
    const statsData = decode(readFileSync(statsMsgpackPath)) as {
      features?: Array<{
        properties?: { id?: string; level?: string; regionalschluessel?: string }
      }>
    }

    for (const f of statsData.features || []) {
      const p = f.properties || {}
      const id = String(p.id ?? '')
      const level = String(p.level ?? '')
      const rs = String(p.regionalschluessel ?? '')

      let metrics: CommuterMetrics | undefined
      if (level === '8' && rs.length === 12) {
        const ags = rs.slice(0, 5) + rs.slice(9, 12)
        metrics = byCode[ags]
      } else if (level === '6' && rs.length >= 5) {
        // The BA sheet lists Landkreise by their 5-digit code but kreisfreie Städte only as a
        // Gemeinde (8-digit AGS, e.g. 09162000 for München), so fall back to that.
        const kreisCode = rs.slice(0, 5)
        metrics =
          byCode[kreisCode] ?? (rs.length === 12 ? byCode[kreisCode + rs.slice(9, 12)] : undefined)
      } else if (level === '4' && rs.length >= 2) {
        const landCode = rs.slice(0, 2)
        metrics = byCode[landCode]
      }

      if (metrics) {
        byId[id] = metrics
      }
    }
  }

  mkdirSync(outDir, { recursive: true })
  writeDataset(
    outPath,
    {
      source:
        'Bundesagentur für Arbeit (BA) – Gemeindedaten der sozialversicherungspflichtig Beschäftigten nach Wohn- und Arbeitsort (Stichtag 30.06.2025)',
      byCode,
      byId,
    },
    { minCount: 10_000 },
  )
  process.stdout.write(
    `Wrote ${outPath}: ${Object.keys(byCode).length} codes, ${Object.keys(byId).length} mapped region IDs\n`,
  )
}
