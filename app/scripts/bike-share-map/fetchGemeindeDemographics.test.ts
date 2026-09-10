import { describe, expect, test } from 'vitest'
import { parseGemeindeSheetRows } from './fetchGemeindeDemographics'

/**
 * Rows shaped like `utils.sheet_to_json(sheet, { header: 1 })` output for the Destatis
 * "Onlineprodukt_Gemeinden…" sheet. Only the columns the parser reads are filled
 * (Satzart 0, Land 2, RB 3, Kreis 4, VB 5, Gem 6, Name 7, area 8, population 9,
 * density 12, urbanization 18); the gaps stand in for columns we ignore.
 */
function gemeindeRow(over: {
  satzart?: string
  land?: string
  rb?: string
  kreis?: string
  vb?: string
  gem?: string
  name?: string
  areaKm2?: unknown
  population?: unknown
  density?: unknown
  urbanization?: unknown
}): unknown[] {
  const row: unknown[] = Array.from({ length: 19 })
  row[0] = over.satzart ?? '60'
  row[2] = over.land ?? '09'
  row[3] = over.rb ?? '1'
  row[4] = over.kreis ?? '86'
  row[5] = over.vb ?? '0152'
  row[6] = over.gem ?? '152'
  row[7] = over.name ?? 'Schweitenkirchen'
  row[8] = 'areaKm2' in over ? over.areaKm2 : 45.62
  row[9] = 'population' in over ? over.population : 5517
  row[12] = 'density' in over ? over.density : 121
  row[18] = 'urbanization' in over ? over.urbanization : '03'
  return row
}

describe('parseGemeindeSheetRows', () => {
  test('parses a Gemeinde (Satzart 60) into an RS-keyed record', () => {
    const [g] = parseGemeindeSheetRows([gemeindeRow({})])
    expect(g).toEqual({
      rs: '091860152152',
      name: 'Schweitenkirchen',
      population: 5517,
      areaKm2: 45.62,
      densityPerKm2: 121,
      urbanizationCode: '03',
    })
  })

  test('skips non-Gemeinde Satzarten (headers, Kreis/Land subtotals)', () => {
    const rows = [
      gemeindeRow({ satzart: '10', name: 'Bayern' }),
      gemeindeRow({ satzart: '40', name: 'Landkreis Pfaffenhofen a.d.Ilm' }),
      gemeindeRow({ satzart: '60', name: 'Schweitenkirchen' }),
    ]
    expect(parseGemeindeSheetRows(rows).map((g) => g.name)).toEqual(['Schweitenkirchen'])
  })

  test('drops rows without a usable classification or population', () => {
    const rows = [
      gemeindeRow({ gem: '001', name: 'Ohne Verstädterungsgrad', urbanization: '' }),
      gemeindeRow({ gem: '002', name: 'Ohne Einwohnerzahl', population: undefined }),
      gemeindeRow({ gem: '003', name: 'Nullfläche', areaKm2: 0 }),
      gemeindeRow({ gem: '152', name: 'Schweitenkirchen' }),
    ]
    expect(parseGemeindeSheetRows(rows).map((g) => g.name)).toEqual(['Schweitenkirchen'])
  })

  test('falls back to population / area when the density column is blank', () => {
    const [g] = parseGemeindeSheetRows([
      gemeindeRow({ population: 1000, areaKm2: 25, density: undefined }),
    ])
    expect(g?.densityPerKm2).toBe(40)
  })

  test('rejects a Regionalschlüssel that is not 12 digits', () => {
    expect(parseGemeindeSheetRows([gemeindeRow({ gem: 'XX' })])).toEqual([])
  })
})
