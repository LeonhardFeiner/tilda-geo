import { describe, expect, test } from 'vitest'
import {
  aggregateTrafficClasses,
  aggregateTrafficRegions,
  withTrafficClasses,
  eraDtvThreshold,
  isCountedRoadRef,
  parseBastRows,
  roadNumberKey,
  sectionNeedsBikePath,
  withRoadShares,
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

  test('takes the heavy-vehicle count where BASt gives one', () => {
    expect(parseBastRows([row({ DTVSV: 812 })])[0]!.sv).toBe(812)
    expect(parseBastRows([row({})])[0]!.sv).toBeNull()
    expect(parseBastRows([row({ DTVSV: '' })])[0]!.sv).toBeNull()
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

  test('leaves the class split out where every section is a Bundesstraße anyway', () => {
    const byId = aggregateTrafficRegions(
      [{ region: 'r', klasse: 'B', need_km: 4, covered_km: 1 }],
      {
        withClasses: false,
      },
    )
    expect(byId.r).toEqual({ needKm: 4, coveredKm: 1, coveredPct: 25 })
  })
})

describe('aggregateTrafficClasses', () => {
  test('sums km and covered km per traffic class, one slot per class of the map layer', () => {
    const byId = aggregateTrafficClasses([
      { region: 'r', dtv_class: 0, km: 3, covered_km: 1 },
      { region: 'r', dtv_class: 0, km: 2, covered_km: 0.5 },
      { region: 'r', dtv_class: 4, km: 1, covered_km: 1 },
    ])
    expect(byId.r).toEqual([
      { km: 5, coveredKm: 1.5 },
      { km: 0, coveredKm: 0 },
      { km: 0, coveredKm: 0 },
      { km: 0, coveredKm: 0 },
      { km: 1, coveredKm: 1 },
    ])
  })

  test('attaches the split only to regions that have one', () => {
    const out = withTrafficClasses(
      { a: { needKm: 1, coveredKm: 0 }, b: { needKm: 0, coveredKm: 0 } },
      { a: [{ km: 1, coveredKm: 0 }] },
    )
    expect(out.a?.byDtv).toEqual([{ km: 1, coveredKm: 0 }])
    expect(out.b?.byDtv).toBeUndefined()
  })
})

describe('withRoadShares', () => {
  const regions = [
    { id: 'busy', roadKm: 80, bundeslandId: 'bl' },
    { id: 'quiet', roadKm: 50, bundeslandId: 'bl' },
    { id: 'roadless', roadKm: 0, bundeslandId: 'bl' },
  ]
  const byId = withRoadShares(
    { busy: { needKm: 4, coveredKm: 1, coveredPct: 25 }, elsewhere: { needKm: 9, coveredKm: 0 } },
    regions,
  )

  test('gives the busy km as a share of the road network in road km (half the per-direction km)', () => {
    expect(byId.busy).toEqual({ needKm: 4, coveredKm: 1, coveredPct: 25, sharePct: 10 })
  })

  test('writes 0 km / 0 % for a region without a busy road, with no covered share', () => {
    expect(byId.quiet).toEqual({ needKm: 0, coveredKm: 0, sharePct: 0 })
    expect(byId.quiet!.coveredPct).toBeUndefined()
  })

  test('has no share without roads and skips regions outside the area', () => {
    expect(byId.roadless).toEqual({ needKm: 0, coveredKm: 0, sharePct: undefined })
    expect(byId.elsewhere).toBeUndefined()
  })
})

describe('roadNumberKey', () => {
  test('matches BAYSIS numbers to OSM refs', () => {
    expect(roadNumberKey('K PAF 25')).toBe(roadNumberKey('PAF 25'))
    expect(roadNumberKey('St 2045')).toBe('st2045')
    expect(roadNumberKey('B 16A')).toBe(roadNumberKey('B 16a'))
  })

  test('keeps a district code that starts with K', () => {
    expect(roadNumberKey('K KEH 12')).toBe('keh12')
    expect(roadNumberKey('KEH 12')).toBe('keh12')
  })
})

describe('isCountedRoadRef', () => {
  test('accepts Bundes-, Staats- and Kreisstraßen numbers', () => {
    for (const ref of ['B 13', 'St 2045', 'PAF 25', 'FS 4', 'NEW 7', 'MÜ 3', 'A 12', ' B 16a ']) {
      expect(isCountedRoadRef(ref)).toBe(true)
    }
  })

  test('rejects names, unnumbered refs and lower-case prefixes', () => {
    for (const ref of ['Hauptstraße', 'GVS', 'PAF', 'st 2045', 'PAF 25 Nord']) {
      expect(isCountedRoadRef(ref)).toBe(false)
    }
  })
})
