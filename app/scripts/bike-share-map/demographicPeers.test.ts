import { describe, expect, test } from 'vitest'
import {
  buildDemographicPeerSummaries,
  buildPeerGroupIndex,
  peerGroupKey,
  peerGroupLabel,
  populationBandIndex,
  type PeerRegionStat,
} from './demographicPeers'

describe('populationBandIndex', () => {
  test('bins population into the right band, including the open-ended top band', () => {
    expect(populationBandIndex(500)).toBe(0)
    expect(populationBandIndex(999)).toBe(0)
    expect(populationBandIndex(1000)).toBe(1)
    expect(populationBandIndex(5517)).toBe(4) // Schweitenkirchen
    expect(populationBandIndex(3_685_265)).toBe(8) // Berlin — falls into the open-ended top band
  })
})

describe('peerGroupKey / peerGroupLabel', () => {
  test('groups by urbanization tier and population band together', () => {
    expect(peerGroupKey({ population: 5517, urbanizationCode: '03' })).toBe('03:4')
    expect(peerGroupKey({ population: 500, urbanizationCode: '01' })).not.toBe(
      peerGroupKey({ population: 500, urbanizationCode: '03' }),
    )
  })

  test('label reads as a plain German comparison group', () => {
    expect(peerGroupLabel({ population: 5517, urbanizationCode: '03' })).toBe(
      'ländlich geprägt, 5.000–10.000 Einwohner',
    )
  })
})

describe('buildDemographicPeerSummaries', () => {
  const rsById = new Map([
    ['relation/396557', '091860152152'], // Schweitenkirchen
    ['relation/1', '000000000001'],
    ['relation/2', '000000000002'],
    ['relation/3', '000000000003'],
    ['relation/4', '000000000004'], // different band — not a peer
  ])
  const demographicsByRs = new Map([
    ['091860152152', { population: 5517, urbanizationCode: '03' as const }],
    ['000000000001', { population: 6000, urbanizationCode: '03' as const }],
    ['000000000002', { population: 7000, urbanizationCode: '03' as const }],
    ['000000000003', { population: 8000, urbanizationCode: '03' as const }],
    ['000000000004', { population: 50000, urbanizationCode: '01' as const }],
  ])
  const stat = (id: string, roadSumKm: number, bikelaneSumKm: number): PeerRegionStat => ({
    id,
    roadSumKm,
    bikelaneSumKm,
    bikeSharePct: roadSumKm > 0 ? (bikelaneSumKm / roadSumKm) * 100 : null,
  })
  const regions = [
    stat('relation/396557', 316.9, 5.2), // ~1.64 %, last
    stat('relation/1', 100, 10), // 10 %
    stat('relation/2', 100, 6), // 6 %
    stat('relation/3', 100, 8), // 8 %
    stat('relation/4', 100, 50), // different peer group entirely
  ]

  test('ranks a Gemeinde against its population/urbanization peers, not its Landkreis', () => {
    const summaries = buildDemographicPeerSummaries(regions, demographicsByRs, rsById)
    const sk = summaries.get('relation/396557')
    expect(sk).toBeDefined()
    expect(sk?.rank).toBe(4)
    expect(sk?.total).toBe(4)
    expect(sk?.behind).toBe(true)
    expect(sk?.groupLabel).toBe('ländlich geprägt, 5.000–10.000 Einwohner')
    expect(sk?.gapKm).toBeGreaterThan(0)
    // the region in a different band/tier is not part of this group at all
    expect(summaries.has('relation/4')).toBe(false)
  })

  test('drops a region with no demographics match', () => {
    const summaries = buildDemographicPeerSummaries(
      [stat('relation/unknown', 100, 10)],
      demographicsByRs,
      new Map(),
    )
    expect(summaries.size).toBe(0)
  })

  test('drops a peer group with fewer than 4 members', () => {
    const summaries = buildDemographicPeerSummaries(regions.slice(0, 3), demographicsByRs, rsById)
    expect(summaries.size).toBe(0)
  })
})

describe('buildPeerGroupIndex', () => {
  test('maps each matched region to its bucket key and collects one label per key', () => {
    const index = buildPeerGroupIndex(
      new Map([
        ['relation/1', '000000000001'],
        ['relation/2', '000000000002'],
        ['relation/3', '000000000003'],
        ['relation/x', '999999999999'], // no demographics — skipped
      ]),
      new Map([
        ['000000000001', { population: 5517, urbanizationCode: '03' }],
        ['000000000002', { population: 6200, urbanizationCode: '03' }], // same bucket as 1
        ['000000000003', { population: 120000, urbanizationCode: '01' }],
      ]),
    )
    expect(index.byId).toEqual({
      'relation/1': '03:4',
      'relation/2': '03:4',
      'relation/3': '01:8',
    })
    expect(index.groups['03:4']).toBe('ländlich geprägt, 5.000–10.000 Einwohner')
    expect(index.groups['01:8']).toBe('städtisch geprägt, über 100.000 Einwohner')
    expect(Object.keys(index.groups)).toHaveLength(2)
  })
})
