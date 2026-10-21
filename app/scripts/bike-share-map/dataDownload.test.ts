import { describe, expect, it } from 'vitest'
import {
  buildDataDownloadRow,
  buildModelAggregates,
  kreisfreieIdsOf,
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

  it('passes the mapping completeness through', () => {
    const row = buildDataDownloadRow(gemeinde, {
      mapping: { 'relation/1': { indexPct: 45.04, speedPct: 50, surfacePct: 75, litPct: 10 } },
    })
    expect(row).toMatchObject({
      kartierungstiefe_pct: 45,
      kartiert_tempo_pct: 50,
      kartiert_belag_pct: 75,
      kartiert_licht_pct: 10,
    })
  })

  it('gives no model values above Gemeinde level', () => {
    const kreis = { properties: { ...gemeinde.properties, level: '6' } }
    const row = buildDataDownloadRow(kreis, {
      density: { 'relation/1': 500 },
      terrain: { 'relation/1': { road: 3, elevationMean: 400 } },
    })
    expect(row?.modell_erwartung_pct).toBeNull()
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

describe('buildModelAggregates', () => {
  it('sums Gemeinden into their Kreis, but not into the Land', () => {
    const ctxFor = (ids: string[]) => ({
      density: Object.fromEntries(ids.map((id) => [id, 300])),
      terrain: Object.fromEntries(ids.map((id) => [id, { road: 3, elevationMean: 400 }])),
    })
    const features = []
    const ids: string[] = []
    for (let k = 0; k < 8; k++) {
      features.push({ properties: { id: `kreis/${k}`, level: '6', bundesland_id: 'land/1' } })
      for (let g = 0; g < 2; g++) {
        const id = `gem/${k}/${g}`
        ids.push(id)
        features.push({
          properties: {
            id,
            level: '8',
            parent_id: `kreis/${k}`,
            landkreis_id: `kreis/${k}`,
            bundesland_id: 'land/1',
            road_length: { residential: 50 + 10 * g },
            bikelane_length: { cycleway_adjoining: k + g },
          },
        })
      }
    }
    features.push({ properties: { id: 'land/1', level: '4' } })
    const agg = buildModelAggregates(features, ctxFor(ids))
    expect(agg.get('kreis/0')?.gemeindeCount).toBe(2)
    expect(agg.get('kreis/0')?.roadKm).toBe(110)
    // Länder get no value: their Gemeinden average out to ~0 by construction.
    expect(agg.has('land/1')).toBe(false)
    const row = buildDataDownloadRow(features[0]!, { ...ctxFor(ids), modelAggregates: agg })
    expect(row?.modell_erwartung_pct).toEqual(expect.any(Number))
  })
})

describe('kreisfreieIdsOf', () => {
  it('finds Kreis-level regions no Gemeinde belongs to', () => {
    const ids = kreisfreieIdsOf([
      { properties: { id: 'lk/1', level: '6' } },
      { properties: { id: 'stadt/1', level: '6' } },
      { properties: { id: 'gem/1', level: '8', landkreis_id: 'lk/1' } },
    ])
    expect([...ids]).toEqual(['stadt/1'])
  })

  it('lets the model treat a kreisfreie Stadt as a Gemeinde', () => {
    const stadt = { properties: { ...gemeinde.properties, id: 'stadt/1', level: '6' } }
    const ctx = {
      density: { 'stadt/1': 2000 },
      terrain: { 'stadt/1': { road: 2, elevationMean: 300 } },
    }
    expect(buildDataDownloadRow(stadt, ctx)?.modell_erwartung_pct).toBeNull()
    expect(
      buildDataDownloadRow(stadt, { ...ctx, kreisfreieIds: new Set(['stadt/1']) })
        ?.modell_erwartung_pct,
    ).toEqual(expect.any(Number))
  })
})
