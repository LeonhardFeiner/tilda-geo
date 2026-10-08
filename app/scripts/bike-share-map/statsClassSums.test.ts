import { describe, expect, it } from 'vitest'
import {
  assessBikeDataQuality,
  BIKELANE_TAG_LABELS,
  bikelaneCategoryTags,
  highwayClassDefinition,
  listFilteredBikelaneTagLengths,
  listFilteredHighwayTagLengths,
  mainRoadBreakdown,
  mainRoadGapByAuthority,
  independentBikeKm,
  RADINFRA_DEFAULT_FILTER,
  ROAD_TAG_LABELS,
} from './statsClassSums'

const road = (km: number) => ({ residential: km })

describe('assessBikeDataQuality', () => {
  it('calls clearly tagged infrastructure good', () => {
    const q = assessBikeDataQuality(road(100), { cycleway_isolated: 9, needsClarification: 1 })
    expect(q).toMatchObject({ level: 'good', unclearKm: 1, bikeKm: 10 })
  })

  it('flags a mixed and a poor share at the thresholds', () => {
    expect(
      assessBikeDataQuality(road(100), { cycleway_isolated: 85, needsClarification: 15 })?.level,
    ).toBe('mixed')
    expect(
      assessBikeDataQuality(road(100), { cycleway_isolated: 6, needsClarification: 4 })?.level,
    ).toBe('poor')
  })

  it('does not judge tagging on a sliver of infrastructure', () => {
    expect(assessBikeDataQuality(road(10), { needsClarification: 0.9 })).toBeNull()
  })

  it('reports a real road network with almost no bike infrastructure as sparse', () => {
    expect(assessBikeDataQuality(road(60), { cycleway_isolated: 0.2 })).toMatchObject({
      level: 'sparse',
      roadKm: 60,
    })
    expect(assessBikeDataQuality(road(60), null)?.level).toBe('sparse')
  })

  it('leaves a tiny network without bike infrastructure alone', () => {
    expect(assessBikeDataQuality(road(5), null)).toBeNull()
  })
})

describe('readable type labels', () => {
  it('names every highway value and every bikelane category the classes are built from', () => {
    for (const tag of Object.keys(highwayClassDefinition))
      expect(ROAD_TAG_LABELS[tag], tag).toBeTruthy()
    for (const tags of Object.values(bikelaneCategoryTags)) {
      for (const tag of tags) expect(BIKELANE_TAG_LABELS[tag], tag).toBeTruthy()
    }
  })

  it('keeps the raw key next to the readable label', () => {
    const [road] = listFilteredHighwayTagLengths({ service_alley: 2 }, RADINFRA_DEFAULT_FILTER)
    expect(road).toMatchObject({
      id: 'service_alley',
      label: 'Gasse / Hinterhofzufahrt',
      key: 'service_alley',
    })
    const [bike] = listFilteredBikelaneTagLengths(
      { cyclewayOnHighway_advisory: 3 },
      RADINFRA_DEFAULT_FILTER,
    )
    expect(bike).toMatchObject({ label: 'Schutzstreifen', key: 'cyclewayOnHighway_advisory' })
  })
})

describe('mainRoadBreakdown', () => {
  const roads = {
    'primary|bund': 10,
    'secondary|land': 20,
    'tertiary|kreis': 30,
    'tertiary|gemeinde': 10,
    'residential|gemeinde': 200,
    'trunk|autobahn': 5,
  }
  const bikes = {
    'primary|bund': 5,
    'secondary|land': 2,
    'residential|gemeinde': 40,
    independent: 100,
  }

  it('counts only main roads and bike km along them', () => {
    const b = mainRoadBreakdown(roads, bikes)
    expect(b?.roadKm).toBe(75)
    expect(b?.bikeKm).toBe(7)
    expect(b?.pct).toBeCloseTo((7 / 75) * 100)
    expect(b?.byAuthority.map((r) => [r.authority, r.roadKm, r.bikeKm])).toEqual([
      ['bund', 15, 5],
      ['land', 20, 2],
      ['kreis', 30, 0],
      ['gemeinde', 10, 0],
    ])
  })

  it('is null without the per-road columns or without main roads', () => {
    expect(mainRoadBreakdown(undefined, undefined)).toBeNull()
    expect(mainRoadBreakdown({ 'residential|gemeinde': 5 }, {})).toBeNull()
  })

  it('splits the gap by each authority’s own shortfall', () => {
    const b = mainRoadBreakdown(roads, bikes)!
    const g = mainRoadGapByAuthority(b, 40)
    expect(g.totalGapKm).toBeCloseTo(0.4 * 75 - 7)
    // shortfalls: bund 1, land 6, kreis 12, gemeinde 4 → 23
    const byA = Object.fromEntries(g.byAuthority.map((r) => [r.authority, r.gapKm]))
    expect(byA.kreis).toBeCloseTo((23 * 12) / 23)
    expect(Object.values(byA).reduce((a, x) => a + x, 0)).toBeCloseTo(g.totalGapKm)
  })

  it('never reports a road as more than fully covered', () => {
    const b = mainRoadBreakdown(
      { 'primary|land': 0.01, 'tertiary|kreis': 10 },
      { 'primary|land': 1 },
    )
    expect(b?.byAuthority[0]).toMatchObject({ authority: 'land', bikeKm: 0.01, pct: 100 })
    expect(b?.bikeKm).toBeCloseTo(0.01)
  })

  it('reports bike km away from roads', () => {
    expect(independentBikeKm(bikes)).toBe(100)
    expect(independentBikeKm(null)).toBe(0)
  })
})
