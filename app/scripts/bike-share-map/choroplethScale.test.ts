import { describe, expect, test } from 'bun:test'
import {
  computeChoroplethScaleRange,
  isLowRoadNetworkForScale,
  percentileSorted,
} from './choroplethScale'

describe('percentileSorted', () => {
  test('interpolates between values', () => {
    expect(percentileSorted([10, 20, 30, 40], 0.5)).toBe(25)
  })
})

describe('computeChoroplethScaleRange', () => {
  test('ignores low-road areas for robust max', () => {
    const range = computeChoroplethScaleRange(
      [
        { bikeSharePct: 120, roadSumKm: 1 },
        { bikeSharePct: 15, roadSumKm: 50 },
        { bikeSharePct: 18, roadSumKm: 40 },
        { bikeSharePct: 20, roadSumKm: 60 },
      ],
      { robustEnabled: true },
    )
    expect(range.dataMax).toBe(120)
    expect(range.excludedLowRoadCount).toBe(1)
    expect(range.max).toBeLessThan(120)
  })

  test('caps below high outliers via percentile and IQR', () => {
    const inputs = Array.from({ length: 20 }, (_, i) => ({
      bikeSharePct: 10 + i * 0.5,
      roadSumKm: 100,
    }))
    inputs.push({ bikeSharePct: 95, roadSumKm: 100 })
    const range = computeChoroplethScaleRange(inputs, { robustEnabled: true })
    expect(range.dataMax).toBe(95)
    expect(range.max).toBeLessThan(95)
    expect(range.outlierCount).toBeGreaterThan(0)
    expect(range.scaleCapped).toBe(true)
  })

  test('manual cap applies on top of robust max', () => {
    const range = computeChoroplethScaleRange(
      [
        { bikeSharePct: 10, roadSumKm: 100 },
        { bikeSharePct: 80, roadSumKm: 100 },
      ],
      { robustEnabled: false, manualCapEnabled: true, manualCapPct: 50 },
    )
    expect(range.max).toBe(50)
    expect(range.scaleCapped).toBe(true)
  })

  test('isLowRoadNetworkForScale', () => {
    expect(isLowRoadNetworkForScale(4.9)).toBe(true)
    expect(isLowRoadNetworkForScale(5)).toBe(false)
  })
})
