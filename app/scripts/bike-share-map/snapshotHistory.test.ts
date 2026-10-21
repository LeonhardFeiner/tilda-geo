import { describe, expect, it } from 'vitest'
import {
  changeSinceFirst,
  COUNTING_VERSION,
  mergeHistory,
  type Snapshot,
  snapshotFromFeatures,
} from './snapshotHistory'

const snap = (date: string, byId: Snapshot['byId'], countingVersion = COUNTING_VERSION) => ({
  osmDataFrom: date,
  countingVersion,
  byId,
})

describe('snapshotFromFeatures', () => {
  it('stores road and bike km under the default filter', () => {
    const s = snapshotFromFeatures(
      [
        {
          properties: {
            id: 'a',
            road_length: { residential: 100.12345 },
            bikelane_length: { cycleway_adjoining: 10 },
          },
        },
        { properties: { id: 'empty' } },
      ],
      '2026-10-16T20:21:21Z',
    )
    expect(s.byId).toEqual({ a: [100.123, 10] })
    expect(s.countingVersion).toBe(COUNTING_VERSION)
  })
})

describe('changeSinceFirst', () => {
  it('compares the newest snapshot with the oldest comparable one', () => {
    const h = mergeHistory([
      snap('2026-12-01T00:00:00Z', { a: [100, 12] }),
      snap('2026-10-16T00:00:00Z', { a: [100, 10] }),
    ])
    expect(h.dates[0]).toBe('2026-10-16T00:00:00Z')
    const c = changeSinceFirst(h, 'a')!
    expect(c.bikeKmDelta).toBeCloseTo(2)
    expect(c.pctPointsDelta).toBeCloseTo(2)
    expect(c.days).toBe(46)
  })

  it('says nothing about a few days, or across a change in counting', () => {
    expect(
      changeSinceFirst(
        mergeHistory([
          snap('2026-10-16T00:00:00Z', { a: [100, 10] }),
          snap('2026-10-20T00:00:00Z', { a: [100, 11] }),
        ]),
        'a',
      ),
    ).toBeNull()
    expect(
      changeSinceFirst(
        mergeHistory([
          snap('2026-05-01T00:00:00Z', { a: [100, 5] }, 'old-rounding'),
          snap('2026-10-20T00:00:00Z', { a: [100, 11] }),
        ]),
        'a',
      ),
    ).toBeNull()
  })

  it('starts a region at its first appearance', () => {
    const h = mergeHistory([
      snap('2026-10-01T00:00:00Z', {}),
      snap('2026-11-01T00:00:00Z', { b: [50, 5] }),
      snap('2026-12-01T00:00:00Z', { b: [50, 6] }),
    ])
    expect(changeSinceFirst(h, 'b')?.sinceDate).toBe('2026-11-01T00:00:00Z')
  })
})
