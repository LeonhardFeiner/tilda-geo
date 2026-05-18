import { describe, expect, test } from 'bun:test'
import {
  listFilteredHighwayTagLengths,
  listFilteredRoadClassLengths,
  RADINFRA_DEFAULT_FILTER,
} from './statsClassSums'

describe('featureLengthBreakdown', () => {
  test('lists road classes and tags respecting filter', () => {
    const road_length = { motorway: 10, residential: 5, primary: 0 }
    const filter = {
      ...RADINFRA_DEFAULT_FILTER,
      road: { ...RADINFRA_DEFAULT_FILTER.road, motorway_like: false },
    }
    const classes = listFilteredRoadClassLengths(road_length, filter)
    expect(classes.map((r) => r.id)).not.toContain('motorway_like')
    expect(classes.some((r) => r.id === 'residential_like')).toBe(true)
    const tags = listFilteredHighwayTagLengths(road_length, filter)
    expect(tags.map((r) => r.id)).toEqual(['residential'])
  })
})
