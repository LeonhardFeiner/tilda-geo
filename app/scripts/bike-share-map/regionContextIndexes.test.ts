import { describe, expect, test } from 'vitest'
import { buildRegionContextIndexes, type DemographicsRow } from './regionContextIndexes'

const row = (rs: string, population: number, areaKm2: number): DemographicsRow => ({
  rs,
  population,
  areaKm2,
  densityPerKm2: population / areaKm2,
  urbanizationCode: '03',
})

const features = [
  { properties: { id: 'land', level: '4', regionalschluessel: '09' } },
  { properties: { id: 'stadtstaat', level: '4', regionalschluessel: '04' } },
  { properties: { id: 'lk', level: '6', regionalschluessel: '091780000000' } },
  { properties: { id: 'stadt', level: '6', regionalschluessel: '091620000000' } },
  ...[1, 2].map((n) => ({
    properties: {
      id: `gem${n}`,
      level: '8',
      regionalschluessel: `09178000000${n}`,
      landkreis_id: 'lk',
      bundesland_id: 'land',
    },
  })),
]
const gemeinden = [
  row('091780000001', 1000, 10),
  row('091780000002', 3000, 30),
  row('091620000000', 1_500_000, 310),
  row('040110000000', 570_000, 325),
  row('040120000000', 115_000, 94),
]

describe('buildRegionContextIndexes', () => {
  const { densityById, transitById, peers } = buildRegionContextIndexes(features, gemeinden, {
    counts: { lk: { stopCount: 8, avgDistanceToStationM: 2500 } },
    highway: { gem1: { avgDistanceToHighwayM: 900 } },
  })

  test('sums a Landkreis from its Gemeinden', () => {
    expect(densityById.lk).toBe(4000 / 40)
  })
  test('takes a kreisfreie Stadt from its own row', () => {
    expect(densityById.stadt).toBeCloseTo(1_500_000 / 310)
  })
  test('sums a Land from its Gemeinden, a Stadtstaat from its RS prefix', () => {
    expect(densityById.land).toBe(4000 / 40)
    expect(densityById.stadtstaat).toBeCloseTo(685_000 / 419)
  })
  test('stop density uses the Destatis area; distances pass through', () => {
    expect(transitById?.lk).toEqual({ density: 8 / 40, avgDistanceToStationM: 2500 })
    expect(transitById?.gem1).toEqual({ avgDistanceToHighwayM: 900 })
  })
  test('classifies Gemeinden and Landkreise into peer buckets', () => {
    expect(peers.byId.gem1).toEqual(expect.any(String))
    expect(peers.byId.lk).toEqual(expect.any(String))
  })
  test('no transit file at all gives no transit index', () => {
    expect(buildRegionContextIndexes(features, gemeinden, null).transitById).toBeNull()
  })
})
