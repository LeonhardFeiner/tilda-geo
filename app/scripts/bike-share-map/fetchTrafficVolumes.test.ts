import { describe, expect, test } from 'vitest'
import {
  aggregateTrafficRegions,
  eraDtvThreshold,
  parseBastRows,
  sectionNeedsBikePath,
} from './fetchTrafficVolumes'

describe('eraDtvThreshold', () => {
  test('uses 2,500 Kfz/24h at the rural default and 4,000 at 70 km/h or less', () => {
    expect(eraDtvThreshold(null)).toBe(2500)
    expect(eraDtvThreshold(100)).toBe(2500)
    expect(eraDtvThreshold(80)).toBe(2500)
    expect(eraDtvThreshold(70)).toBe(4000)
    expect(eraDtvThreshold(60)).toBe(4000)
  })
})

describe('sectionNeedsBikePath', () => {
  const base = { klasse: 'K', fsod: 'FS', dtv: 3000, maxspeedKmh: null }

  test('flags a busy open-road Kreisstraße', () => {
    expect(sectionNeedsBikePath(base)).toBe(true)
  })

  test('respects the higher threshold at 70 km/h', () => {
    expect(sectionNeedsBikePath({ ...base, maxspeedKmh: 70 })).toBe(false)
    expect(sectionNeedsBikePath({ ...base, maxspeedKmh: 70, dtv: 4100 })).toBe(true)
  })

  test('ignores quiet roads, through-town sections and Autobahnen', () => {
    expect(sectionNeedsBikePath({ ...base, dtv: 2500 })).toBe(false)
    expect(sectionNeedsBikePath({ ...base, fsod: 'OD' })).toBe(false)
    expect(sectionNeedsBikePath({ ...base, klasse: 'A', dtv: 50000 })).toBe(false)
  })
})

describe('parseBastRows', () => {
  const row = (over: Record<string, unknown>) => ({
    Str: 'B 4',
    Land: 1,
    FSOD: 'FS',
    DTV: 9909,
    LängeFS: 1.895,
    X_Koordinate: 560121.2,
    Y_Koordinate: 5949420.9,
    Anfang: 'Bönningstedt (K 5)',
    Ende: 'Hasloh (K 6)',
    ...over,
  })

  test('keeps open-road Bundesstraße sections outside Bavaria, with length in metres', () => {
    const [s] = parseBastRows([row({})])
    expect(s).toMatchObject({
      strasse: 'B 4',
      dtv: 9909,
      lengthM: 1895,
      anfang: 'Bönningstedt (K 5)',
    })
    expect(s!.id).toBeGreaterThanOrEqual(1_000_000)
  })

  test('drops Bavaria (BAYSIS has it), through-town sections and rows without position', () => {
    expect(parseBastRows([row({ Land: 9 })])).toEqual([])
    expect(parseBastRows([row({ FSOD: 'OD' })])).toEqual([])
    expect(parseBastRows([row({ X_Koordinate: null })])).toEqual([])
    expect(parseBastRows([row({ Str: 'A 7' })])).toEqual([])
  })
})

describe('aggregateTrafficRegions', () => {
  test('sums classes per region and derives the covered share', () => {
    const byId = aggregateTrafficRegions([
      { region: 'r', klasse: 'B', need_km: 10, covered_km: 5 },
      { region: 'r', klasse: 'K', need_km: 10, covered_km: 0 },
    ])
    expect(byId.r).toEqual({
      needKm: 20,
      coveredKm: 5,
      coveredPct: 25,
      byClass: { B: { needKm: 10, coveredKm: 5 }, K: { needKm: 10, coveredKm: 0 } },
    })
  })
})
