import { describe, expect, test } from 'vitest'
import { bikeKmh } from './detourSpeed'

const kmh = (
  category: string,
  road: string | null,
  surface: string | null = null,
  access: string | null = null,
) => bikeKmh({ category, road, surface, access })

describe('bikeKmh', () => {
  test('a shared Geh- und Radweg (highway=path) rides as fast as a cycleway', () => {
    expect(kmh('footAndCyclewayShared_adjoiningOrIsolated', 'path')).toBe(18)
    expect(kmh('footAndCyclewaySegregated_adjoining', 'path')).toBe(18)
    expect(kmh('cycleway_isolated', 'cycleway')).toBe(18)
  })

  test('tracks go by their surface: asphalt like a road, gravel penalised once', () => {
    expect(kmh('mixedTrafficFoot', 'track', 'asphalt')).toBe(18)
    expect(kmh('mixedTrafficFoot', 'track', 'gravel')).toBeCloseTo(13.5)
    // Not 12 × 0.75 = 9: the class no longer carries its own unpaved discount.
    expect(kmh('mixedTrafficFoot', 'track', 'gravel')).toBeGreaterThan(
      kmh('mixedTrafficMotor', 'residential', 'grass'),
    )
  })

  test('an untagged track sits between asphalt and gravel', () => {
    const untagged = kmh('mixedTrafficFoot', 'track')
    expect(untagged).toBeLessThan(kmh('mixedTrafficFoot', 'track', 'asphalt'))
    expect(untagged).toBeGreaterThan(kmh('mixedTrafficFoot', 'track', 'gravel'))
  })

  test('roads keep their class speed times the surface factor', () => {
    expect(kmh('mixedTrafficMotor', 'secondary')).toBe(18)
    expect(kmh('mixedTrafficMotor', 'living_street')).toBe(12)
    expect(kmh('mixedTrafficMotor', 'residential', 'sett')).toBeCloseTo(14.4)
  })

  test('footways: ride with permission, push without; dismount always pushes', () => {
    expect(kmh('mixedTrafficFoot', 'footway', null, 'designated')).toBe(14)
    expect(kmh('mixedTrafficFoot', 'footway')).toBe(5)
    expect(kmh('cycleway_isolated', 'cycleway', null, 'dismount')).toBe(5)
  })
})
