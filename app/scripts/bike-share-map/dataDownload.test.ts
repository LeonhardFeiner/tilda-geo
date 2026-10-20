import { describe, expect, it } from 'vitest'
import {
  buildDataDownloadRow,
  DATA_DOWNLOAD_COLUMNS,
  dataDownloadCsv,
  dataDownloadFileName,
} from './dataDownload'

const gemeinde = {
  properties: {
    id: 'relation/1',
    name: 'Musterstadt, "Alt"',
    level: '8',
    regionalschluessel: '091620000000',
    bundesland_id: 'relation/2145268',
    road_length: { residential: 80, primary: 20 },
    bikelane_length: { cycleway_adjoining: 9, needsClarification: 1 },
  },
}

describe('dataDownloadFileName', () => {
  it('names the file after the OSM data day', () => {
    expect(dataDownloadFileName('2026-10-16T20:21:21.000Z')).toBe(
      'radinfra-regionen-2026-10-16.csv',
    )
    expect(dataDownloadFileName(undefined)).toBe('radinfra-regionen.csv')
  })
})

describe('buildDataDownloadRow', () => {
  it('computes the share and data quality like the map', () => {
    const row = buildDataDownloadRow(gemeinde, {})
    expect(row).toMatchObject({
      osm_id: 'relation/1',
      admin_level: 8,
      strassen_km: 100,
      radinfra_km: 10,
      radinfra_anteil_pct: 10,
      radinfra_unklar_km: 1,
      datenlage: 'gut',
      modell_erwartung_pct: null,
    })
  })

  it('adds the model expectation once its inputs exist', () => {
    const row = buildDataDownloadRow(gemeinde, {
      density: { 'relation/1': 500 },
      terrain: { 'relation/1': { road: 3, elevationMean: 400 } },
    })
    expect(row?.modell_erwartung_pct).toEqual(expect.any(Number))
    expect(row?.modell_abweichung_pp).toBeCloseTo(10 - (row?.modell_erwartung_pct as number), 1)
    expect([0, 1]).toContain(row?.modell_ausserhalb_1se)
  })

  it('leaves the model out below the ranking threshold', () => {
    const small = { properties: { ...gemeinde.properties, road_length: { residential: 3 } } }
    const row = buildDataDownloadRow(small, {
      density: { 'relation/1': 500 },
      terrain: { 'relation/1': { road: 3, elevationMean: 400 } },
    })
    expect(row?.modell_erwartung_pct).toBeNull()
  })
})

describe('dataDownloadCsv', () => {
  it('writes every column, quotes where needed and leaves missing values empty', () => {
    const row = buildDataDownloadRow(gemeinde, {})!
    const [header, line] = dataDownloadCsv([row]).split('\r\n')
    expect(header).toBe(Object.keys(DATA_DOWNLOAD_COLUMNS).join(','))
    expect(line).toContain('"Musterstadt, ""Alt"""')
    expect(line?.split(',').length).toBeGreaterThan(Object.keys(DATA_DOWNLOAD_COLUMNS).length - 1)
  })

  it('sorts by admin level, then name', () => {
    const a = buildDataDownloadRow(
      { properties: { ...gemeinde.properties, id: 'relation/2', name: 'Zell' } },
      {},
    )!
    const b = buildDataDownloadRow(
      { properties: { ...gemeinde.properties, id: 'relation/3', name: 'Bayern', level: '4' } },
      {},
    )!
    const c = buildDataDownloadRow(
      { properties: { ...gemeinde.properties, id: 'relation/4', name: 'Aach' } },
      {},
    )!
    const names = dataDownloadCsv([a, b, c])
      .split('\r\n')
      .slice(1, -1)
      .map((l) => l.split(',')[1])
    expect(names).toEqual(['Bayern', 'Aach', 'Zell'])
  })
})
