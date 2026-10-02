import { describe, expect, it } from 'vitest'
import {
  assessBikeDataQuality,
  BIKELANE_TAG_LABELS,
  bikelaneCategoryTags,
  highwayClassDefinition,
  listFilteredBikelaneTagLengths,
  listFilteredHighwayTagLengths,
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
