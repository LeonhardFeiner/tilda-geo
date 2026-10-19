import { describe, expect, test } from 'vitest'
import { computeCalmedMetricsFromRoadLength } from './fetchCalmedRoads'

describe('computeCalmedMetricsFromRoadLength', () => {
  test('returns null for null, empty or invalid road records', () => {
    expect(computeCalmedMetricsFromRoadLength(null)).toBeNull()
    expect(computeCalmedMetricsFromRoadLength(undefined)).toBeNull()
    expect(computeCalmedMetricsFromRoadLength({})).toBeNull()
    expect(computeCalmedMetricsFromRoadLength({ residential: 0.05 })).toBeNull()
  })

  test('correctly computes calmed and living street shares', () => {
    const roadLength = {
      motorway: 20,
      primary: 30,
      secondary: 50,
      residential: 90,
      living_street: 8,
      bicycle_road: 2,
    }
    // Total = 200 km
    // Calmed = 90 (residential) + 8 (living_street) + 2 (bicycle_road) = 100 km (50.0%)
    // Living = 8 + 2 = 10 km (5.0%)
    const metrics = computeCalmedMetricsFromRoadLength(roadLength)
    expect(metrics).not.toBeNull()
    expect(metrics?.totalRoadKm).toBe(200)
    expect(metrics?.calmedKm).toBe(100)
    expect(metrics?.calmedSharePct).toBe(50.0)
    expect(metrics?.livingKm).toBe(10)
    expect(metrics?.livingSharePct).toBe(5.0)
  })

  test('handles rural municipality without living streets', () => {
    const roadLength = {
      tertiary: 40,
      unclassified: 40,
      residential: 20,
    }
    // Total = 100 km
    // Calmed = 20 km (20.0%)
    // Living = 0 km (0.0%)
    const metrics = computeCalmedMetricsFromRoadLength(roadLength)
    expect(metrics).not.toBeNull()
    expect(metrics?.totalRoadKm).toBe(100)
    expect(metrics?.calmedKm).toBe(20)
    expect(metrics?.calmedSharePct).toBe(20.0)
    expect(metrics?.livingKm).toBe(0)
    expect(metrics?.livingSharePct).toBe(0.0)
  })
})
