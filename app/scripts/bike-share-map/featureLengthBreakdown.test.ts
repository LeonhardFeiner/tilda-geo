import { describe, expect, test } from 'vitest'
import {
  combineMaplibreFilters,
  listFilteredHighwayTagLengths,
  listFilteredRoadClassLengths,
  maplibreBikelaneOverlayFilterForClass,
  maplibreRoadOverlayFiltersForClass,
  maplibreRoadOverlayFiltersForHighwayTag,
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
    expect(classes.find((r) => r.id === 'motorway_like')?.enabled).toBe(false)
    expect(classes.find((r) => r.id === 'residential_like')?.enabled).toBe(true)
    const tags = listFilteredHighwayTagLengths(road_length, filter)
    expect(tags.find((r) => r.id === 'motorway')?.enabled).toBe(false)
    expect(tags.find((r) => r.id === 'residential')?.enabled).toBe(true)
  })

  test('builds maplibre overlay filters for road class and highway tag', () => {
    const primary = maplibreRoadOverlayFiltersForClass('primary_like')
    expect(primary.major[2]).toContain('primary')
    expect(primary.residential).toEqual(['literal', false])

    const residential = maplibreRoadOverlayFiltersForClass('residential_like')
    expect(residential.major).toEqual(['literal', false])
    expect(residential.residential[2]).toContain('residential')

    const tag = maplibreRoadOverlayFiltersForHighwayTag('motorway')
    expect(tag.major).toEqual(['match', ['get', 'road'], ['motorway'], true, false])

    const bike = maplibreBikelaneOverlayFilterForClass('separate_bike_traffic')
    expect(bike[2]).toContain('cycleway_isolated')

    expect(combineMaplibreFilters(['literal', false], tag.major)).toEqual(tag.major)
  })
})
