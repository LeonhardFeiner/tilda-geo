import { readFileSync } from 'node:fs'

export type LandkreisRef = { id: string; name: string }

function normalizeName(name: string) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function readCsvRows(csvPath: string) {
  const text = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.length > 0)
  if (!headerLine) return []
  const headers = headerLine.split(',')
  const rows: Record<string, string>[] = []
  for (const line of lines) {
    const values = line.split(',')
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i] ?? ''] = values[i] ?? ''
    }
    rows.push(row)
  }
  return rows
}

export function listLandkreiseFromCsv(csvPath: string) {
  const rows = readCsvRows(csvPath)
  const landkreise: LandkreisRef[] = []
  for (const row of rows) {
    if (row.level !== '6' || !row.id || !row.name) continue
    landkreise.push({ id: row.id, name: row.name })
  }
  landkreise.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return landkreise
}

export function resolveLandkreisFromCsv(
  csvPath: string,
  query: { id?: string; name?: string },
): LandkreisRef {
  const rows = readCsvRows(csvPath)
  const landkreise = rows.filter((row) => row.level === '6' && row.id && row.name)

  if (query.id) {
    const hit = landkreise.find((row) => row.id === query.id)
    if (!hit?.id || !hit.name) {
      throw new Error(`Landkreis not found in CSV: id=${query.id}`)
    }
    return { id: hit.id, name: hit.name } satisfies LandkreisRef
  }

  if (query.name) {
    const q = normalizeName(query.name)
    const hits = landkreise.filter((row) => {
      if (!row.name) return false
      const n = normalizeName(row.name)
      return n === q || n.includes(q) || q.includes(n)
    })
    if (hits.length === 1) {
      const hit = hits[0]
      if (!hit?.id || !hit.name) {
        throw new Error(`Landkreis row in CSV is missing id or name: name=${query.name}`)
      }
      return { id: hit.id, name: hit.name } satisfies LandkreisRef
    }
    if (hits.length > 1) {
      const names = hits.map((h) => `${h.name} (${h.id})`).join(', ')
      throw new Error(`Ambiguous landkreis name "${query.name}". Matches: ${names}`)
    }
    throw new Error(`Landkreis not found in CSV: name=${query.name}`)
  }

  throw new Error('Provide --landkreis-id or --landkreis-name')
}
