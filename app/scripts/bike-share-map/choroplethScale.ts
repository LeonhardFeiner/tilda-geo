/** Choropleth max: ignore low-road areas and high-end outliers (forest Gemeinden, etc.). */

export const DEFAULT_MIN_ROAD_KM_FOR_SCALE = 5
export const DEFAULT_PERCENTILE_HIGH = 0.95
export const DEFAULT_IQR_MULTIPLIER = 1.5

export type ChoroplethFeatureScaleInput = {
  bikeSharePct: number
  roadSumKm: number
}

export type ChoroplethScaleOptions = {
  minRoadKmForScale?: number
  robustEnabled?: boolean
  percentileHigh?: number
  iqrMultiplier?: number
  manualCapEnabled?: boolean
  manualCapPct?: number
}

export function isLowRoadNetworkForScale(
  roadSumKm: number,
  minRoadKm = DEFAULT_MIN_ROAD_KM_FOR_SCALE,
) {
  return !(Number.isFinite(roadSumKm) && roadSumKm >= minRoadKm)
}

export function percentileSorted(sortedAsc: number[], p: number) {
  if (!sortedAsc.length) return Number.NaN
  if (sortedAsc.length === 1) return sortedAsc[0]!
  const idx = p * (sortedAsc.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const w = idx - lo
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w
}

export function computeChoroplethScaleRange(
  inputs: ChoroplethFeatureScaleInput[],
  options: ChoroplethScaleOptions = {},
) {
  const minRoadKm = options.minRoadKmForScale ?? DEFAULT_MIN_ROAD_KM_FOR_SCALE
  const robustEnabled = options.robustEnabled ?? true
  const percentileHigh = options.percentileHigh ?? DEFAULT_PERCENTILE_HIGH
  const iqrMult = options.iqrMultiplier ?? DEFAULT_IQR_MULTIPLIER
  const manualCapEnabled = options.manualCapEnabled ?? false
  const manualCapPct = options.manualCapPct ?? 50

  const withPct = inputs.filter((i) => Number.isFinite(i.bikeSharePct))
  if (!withPct.length) {
    return {
      min: 0,
      max: 20,
      dataMin: 0,
      dataMax: 20,
      scaleCapped: false,
      capPct: manualCapPct,
      representativeMax: 20,
      outlierCount: 0,
      excludedLowRoadCount: 0,
      robustApplied: false,
    }
  }

  const allVals = withPct.map((i) => i.bikeSharePct)
  const dataMin = Math.min(...allVals)
  const dataMax = Math.max(...allVals)

  const eligible = withPct.filter((i) => !isLowRoadNetworkForScale(i.roadSumKm, minRoadKm))
  const excludedLowRoadCount = withPct.length - eligible.length
  const vals = eligible.map((i) => i.bikeSharePct).sort((a, b) => a - b)

  let representativeMax = dataMax
  let outlierCount = 0
  let robustApplied = false

  if (robustEnabled && vals.length > 0) {
    robustApplied = true
    representativeMax = percentileSorted(vals, percentileHigh)
    if (vals.length >= 4) {
      const q1 = percentileSorted(vals, 0.25)
      const q3 = percentileSorted(vals, 0.75)
      const tukeyCap = q3 + iqrMult * (q3 - q1)
      representativeMax = Math.min(representativeMax, tukeyCap)
    }
    outlierCount = vals.filter((v) => v > representativeMax + 1e-9).length
  } else if (vals.length > 0) {
    representativeMax = vals[vals.length - 1]!
  }

  let max = representativeMax
  let scaleCapped = false
  const robustCapped = robustEnabled && dataMax > representativeMax + 0.01

  if (manualCapEnabled && max > manualCapPct) {
    max = manualCapPct
    scaleCapped = true
  } else if (robustCapped) {
    scaleCapped = true
  }

  const capPct = manualCapEnabled ? manualCapPct : representativeMax

  return {
    min: 0,
    max,
    dataMin,
    dataMax,
    scaleCapped,
    capPct,
    representativeMax,
    outlierCount,
    excludedLowRoadCount,
    robustApplied,
  }
}
