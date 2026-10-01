import { describe, expect, it } from 'vitest'
import { assessBikeDataQuality } from './statsClassSums'

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
