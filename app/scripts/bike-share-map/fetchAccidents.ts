#!/usr/bin/env bun
/**
 * Fetches and aggregates Destatis Unfallatlas (Statistische Ämter des Bundes und der Länder)
 * traffic accident data with personal injuries, specifically focusing on bicycle accidents.
 *
 * Source: Destatis / Statistische Ämter des Bundes und der Länder – Unfallatlas 2023
 * URL: https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/Unfallorte2023_EPSG25832_CSV.zip
 *
 * Attributes per municipality (Gemeinde, level 8) and district (Landkreis, level 6):
 *   - totalAccidents: Personal injury accidents total
 *   - bikeAccidents: Bicycle accidents with personal injury
 *   - bikeFatal: Fatal bicycle accidents (Getötete)
 *   - bikeSevere: Severe bicycle injuries (Schwerverletzte)
 *   - bikeLight: Slight bicycle injuries (Leichtverletzte)
 *   - bikeFatalOrSevere: Fatal or severe bicycle injuries (Getötete & Schwerverletzte)
 *   - bikeAccidentsPer10k: Bicycle accidents per 10,000 inhabitants
 *
 * Output: output/accidents.json
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { downloadCachePath, writeDataset } from './fetchCommon'

export const UNFALLATLAS_2023_ZIP_URL =
  'https://www.opengeodata.nrw.de/produkte/transport_verkehr/unfallatlas/Unfallorte2023_EPSG25832_CSV.zip'
const CACHE_ZIP_PATH = downloadCachePath('Unfallorte2023_EPSG25832_CSV.zip')

export type AccidentMetrics = {
  /** Residents the rate is based on (Destatis); lets the viewer skip tiny denominators. */
  population?: number
  totalAccidents: number
  bikeAccidents: number
  bikeFatal: number
  bikeSevere: number
  bikeLight: number
  bikeFatalOrSevere: number
  bikeAccidentsPer10k?: number
}

export type ParsedAccidentEntry = {
  totalAccidents: number
  bikeAccidents: number
  bikeFatal: number
  bikeSevere: number
  bikeLight: number
  bikeFatalOrSevere: number
}

export function emptyAccidentEntry(): ParsedAccidentEntry {
  return {
    totalAccidents: 0,
    bikeAccidents: 0,
    bikeFatal: 0,
    bikeSevere: 0,
    bikeLight: 0,
    bikeFatalOrSevere: 0,
  }
}

export function parseUnfallatlasCsv(csvText: string): Map<string, ParsedAccidentEntry> {
  const result = new Map<string, ParsedAccidentEntry>()
  const lines = csvText.split(/\r?\n/)
  if (lines.length < 2) return result

  const header = lines[0] ?? ''
  const colNames = header.replace(/^\uFEFF/, '').split(';')

  const ulandIdx = colNames.indexOf('ULAND')
  const uregbezIdx = colNames.indexOf('UREGBEZ')
  const ukreisIdx = colNames.indexOf('UKREIS')
  const ugmdIdx = colNames.indexOf('UGEMEINDE')
  const ukatIdx = colNames.indexOf('UKATEGORIE')
  const istRadIdx = colNames.indexOf('IstRad')

  if (ulandIdx === -1 || ukreisIdx === -1 || ugmdIdx === -1 || istRadIdx === -1) {
    return result
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue

    const cols = line.split(';')
    const uland = cols[ulandIdx]?.trim() ?? ''
    const uregbez = uregbezIdx !== -1 ? (cols[uregbezIdx]?.trim() ?? '0') : '0'
    const ukreis = cols[ukreisIdx]?.trim() ?? ''
    const ugmd = cols[ugmdIdx]?.trim() ?? ''

    if (uland.length !== 2 || ukreis.length !== 2 || ugmd.length !== 3) {
      continue
    }

    const ags = `${uland}${uregbez}${ukreis}${ugmd}`
    const isRad = cols[istRadIdx]?.trim() === '1'
    const kat = ukatIdx !== -1 ? parseInt(cols[ukatIdx]?.trim() ?? '0', 10) : 0

    const entry = result.get(ags) ?? {
      totalAccidents: 0,
      bikeAccidents: 0,
      bikeFatal: 0,
      bikeSevere: 0,
      bikeLight: 0,
      bikeFatalOrSevere: 0,
    }

    entry.totalAccidents += 1
    if (isRad) {
      entry.bikeAccidents += 1
      if (kat === 1) {
        entry.bikeFatal += 1
        entry.bikeFatalOrSevere += 1
      } else if (kat === 2) {
        entry.bikeSevere += 1
        entry.bikeFatalOrSevere += 1
      } else if (kat === 3) {
        entry.bikeLight += 1
      }
    }

    result.set(ags, entry)
  }

  return result
}

export async function fetchUnfallatlasZip(): Promise<Buffer> {
  if (existsSync(CACHE_ZIP_PATH)) {
    return readFileSync(CACHE_ZIP_PATH)
  }

  process.stdout.write(`Downloading Destatis Unfallatlas 2023 from ${UNFALLATLAS_2023_ZIP_URL} …\n`)
  const res = await fetch(UNFALLATLAS_2023_ZIP_URL)
  if (!res.ok) {
    throw new Error(`Failed to download Unfallatlas: ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(CACHE_ZIP_PATH, buf)
  return buf
}

export function extractCsvFromZip(zipPath: string): string {
  const proc = spawnSync('unzip', ['-p', zipPath, 'csv/Unfallorte2023_LinRef.csv'], {
    maxBuffer: 100 * 1024 * 1024,
  })
  if (proc.status !== 0 || !proc.stdout) {
    throw new Error(`Failed to extract CSV from zip: ${proc.stderr?.toString('utf8')}`)
  }
  return proc.stdout.toString('utf8')
}

if (import.meta.main) {
  const outDir = join(import.meta.dir, 'output')
  const outPath = join(outDir, 'accidents.json')

  let csvText = ''
  try {
    await fetchUnfallatlasZip()
    csvText = extractCsvFromZip(CACHE_ZIP_PATH)
  } catch (err) {
    process.stderr.write(`Failed to load Unfallatlas zip: ${err}\n`)
    process.exit(1)
  }

  process.stdout.write(`Parsing Unfallatlas CSV (${csvText.length} bytes) …\n`)
  const gemeindenData = parseUnfallatlasCsv(csvText)
  process.stdout.write(`Found ${gemeindenData.size} municipalities with accident data\n`)

  // Aggregation per Kreis code (5-digit) and Land code (2-digit)
  const kreiseData = new Map<string, ParsedAccidentEntry>()
  const laenderData = new Map<string, ParsedAccidentEntry>()

  for (const [ags, data] of gemeindenData.entries()) {
    const kreisCode = ags.slice(0, 5)
    const landCode = ags.slice(0, 2)

    const kEntry = kreiseData.get(kreisCode) ?? emptyAccidentEntry()
    kEntry.totalAccidents += data.totalAccidents
    kEntry.bikeAccidents += data.bikeAccidents
    kEntry.bikeFatal += data.bikeFatal
    kEntry.bikeSevere += data.bikeSevere
    kEntry.bikeLight += data.bikeLight
    kEntry.bikeFatalOrSevere += data.bikeFatalOrSevere
    kreiseData.set(kreisCode, kEntry)

    const lEntry = laenderData.get(landCode) ?? emptyAccidentEntry()
    lEntry.totalAccidents += data.totalAccidents
    lEntry.bikeAccidents += data.bikeAccidents
    lEntry.bikeFatal += data.bikeFatal
    lEntry.bikeSevere += data.bikeSevere
    lEntry.bikeLight += data.bikeLight
    lEntry.bikeFatalOrSevere += data.bikeFatalOrSevere
    laenderData.set(landCode, lEntry)
  }

  // Read demographics for population normalization
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

  const byId: Record<string, AccidentMetrics> = {}
  const byCode: Record<string, AccidentMetrics> = {}

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

      if (level === '8' && rs.length === 12) {
        const ags = rs.slice(0, 5) + rs.slice(9, 12)
        const d = gemeindenData.get(ags)
        const pop = rsToGemeinde.get(rs)?.population
        // The atlas lists only Gemeinden with at least one accident. A Gemeinde with residents
        // in a Land the atlas covers had none, which is 0 and not "no data".
        const covered = laenderData.has(rs.slice(0, 2))
        const row = d ?? (covered && pop && pop > 0 ? emptyAccidentEntry() : undefined)
        if (row) {
          const bikeAccidentsPer10k =
            pop && pop > 0 ? Math.round((row.bikeAccidents / pop) * 100000) / 10 : undefined
          const entry: AccidentMetrics = {
            ...row,
            bikeAccidentsPer10k,
            population: pop,
          }
          byId[id] = entry
          byCode[ags] = entry
        }
      } else if (level === '6' && rs.length >= 5) {
        const kreisCode = rs.slice(0, 5)
        const d = kreiseData.get(kreisCode)
        const pop = popByKreisCode.get(kreisCode)
        if (d) {
          const bikeAccidentsPer10k =
            pop && pop > 0 ? Math.round((d.bikeAccidents / pop) * 100000) / 10 : undefined
          const entry: AccidentMetrics = {
            ...d,
            bikeAccidentsPer10k,
            population: pop,
          }
          byId[id] = entry
          byCode[kreisCode] = entry
        }
      } else if (level === '4' && rs.length >= 2) {
        const landCode = rs.slice(0, 2)
        const d = laenderData.get(landCode)
        const pop = popByLandCode.get(landCode)
        if (d) {
          const bikeAccidentsPer10k =
            pop && pop > 0 ? Math.round((d.bikeAccidents / pop) * 100000) / 10 : undefined
          const entry: AccidentMetrics = {
            ...d,
            bikeAccidentsPer10k,
            population: pop,
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
    { source: 'Statistische Ämter des Bundes und der Länder – Unfallatlas 2023', byCode, byId },
    { minCount: 9000 },
  )
  process.stdout.write(
    `Wrote ${outPath}: ${Object.keys(byCode).length} codes, ${Object.keys(byId).length} mapped region IDs\n`,
  )
}
