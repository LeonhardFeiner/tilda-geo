import { describe, expect, test } from 'vitest'
import {
  bikelaneGapKm,
  contextBand,
  medianOfSorted,
  percentileOf,
  buildRankingExportRows,
  buildTopFlopDisplayRows,
  computeViewBenchmark,
  effectiveRankingTopN,
  focusChainFromParentMap,
  inPlacePhrase,
  isFocusChainInTopOrFlopWindow,
  mergeFocusChains,
  rankingShowsAsAlle,
  computeStructuralModelPrediction,
} from './rankingDisplay'

const items = () => [...Array(30).keys()].map((i) => ({ id: `r${i + 1}` }))
const parents = new Map([
  ['r14', 'r4'],
  ['r4', 'r1'],
  ['r3', 'r1'],
])

describe('rankingDisplay', () => {
  test('uses top 8 only when focus chain is outside top and flop 11', () => {
    expect(effectiveRankingTopN({ mode: 'topflop', items: items(), focusChainIds: ['r14'] })).toBe(
      8,
    )
    expect(effectiveRankingTopN({ mode: 'topflop', items: items(), focusChainIds: ['r3'] })).toBe(
      11,
    )
    expect(effectiveRankingTopN({ mode: 'topflop', items: items(), focusChainIds: ['r26'] })).toBe(
      11,
    )
    expect(effectiveRankingTopN({ mode: 'topflop', items: items(), focusChainIds: [] })).toBe(11)
    expect(effectiveRankingTopN({ mode: 'all', items: items(), focusChainIds: ['r14'] })).toBeNull()
  })

  test('parent in top 11 keeps top 11 display', () => {
    const chain = focusChainFromParentMap('r14', parents)
    expect(chain).toEqual(['r14', 'r4', 'r1'])
    expect(isFocusChainInTopOrFlopWindow(items(), chain, 11)).toBe(true)
    expect(effectiveRankingTopN({ mode: 'topflop', items: items(), focusChainIds: chain })).toBe(11)
  })

  test('merge focus chains preserves order', () => {
    expect(
      mergeFocusChains([
        ['r14', 'r4'],
        ['r3', 'r1'],
      ]),
    ).toEqual(['r14', 'r4', 'r3', 'r1'])
  })

  test('rankingShowsAsAlle when mode all or list fits in top and flop blocks', () => {
    expect(rankingShowsAsAlle(30, 'all', null)).toBe(true)
    expect(rankingShowsAsAlle(16, 'topflop', 8)).toBe(true)
    expect(rankingShowsAsAlle(30, 'topflop', 8)).toBe(false)
  })

  test('export alle mode caps at 23 rows', () => {
    const rows = buildRankingExportRows(items(), {
      mode: 'all',
      topN: null,
      focusChainIds: [],
    })
    expect(rows.filter((r) => r.type === 'row')).toHaveLength(23)
    expect(rows.filter((r) => r.type === 'divider')).toHaveLength(0)
  })

  test('shows standard top and flop blocks', () => {
    const rows = buildTopFlopDisplayRows(items(), 8, [])
    const rowIndices = rows.filter((r) => r.type === 'row').map((r) => r.index)
    expect(rowIndices.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(rowIndices.slice(-8)).toEqual([22, 23, 24, 25, 26, 27, 28, 29])
    expect(rows.filter((r) => r.type === 'divider')).toHaveLength(1)
  })

  test('injects focus window between top and flop', () => {
    const rows = buildTopFlopDisplayRows(items(), 8, ['r14'])
    const rowIndices = rows.filter((r) => r.type === 'row').map((r) => r.index)
    expect(rowIndices).toContain(13)
    expect(rowIndices.filter((i) => i >= 11 && i <= 15)).toEqual([11, 12, 13, 14, 15])
    expect(rows.filter((r) => r.type === 'divider')).toHaveLength(2)
  })

  test('skips middle injection when focus is already in top block', () => {
    const rows = buildTopFlopDisplayRows(items(), 8, ['r3'])
    expect(rows.filter((r) => r.type === 'divider')).toHaveLength(1)
  })

  test('skips middle injection when focus is already in flop block', () => {
    const rows = buildTopFlopDisplayRows(items(), 8, ['r26'])
    expect(rows.filter((r) => r.type === 'divider')).toHaveLength(1)
  })
})

describe('computeViewBenchmark', () => {
  const stat = (
    id: string,
    roadSumKm: number,
    bikelaneSumKm: number,
  ): {
    id: string
    name: string
    roadSumKm: number
    bikelaneSumKm: number
    bikeSharePct: number | null
  } => ({
    id,
    name: id.toUpperCase(),
    roadSumKm,
    bikelaneSumKm,
    bikeSharePct: roadSumKm > 0 ? (bikelaneSumKm / roadSumKm) * 100 : null,
  })

  test('median with odd count and leader are picked from usable rows', () => {
    const bench = computeViewBenchmark([
      stat('a', 100, 2), // 2 %
      stat('b', 100, 10), // 10 %
      stat('c', 100, 6), // 6 %
    ])
    expect(bench).not.toBeNull()
    expect(bench?.count).toBe(3)
    expect(bench?.medianPct).toBeCloseTo(6)
    expect(bench?.leaderPct).toBeCloseTo(10)
    expect(bench?.leaderId).toBe('b')
    expect(bench?.leaderName).toBe('B')
  })

  test('median with even count averages the two middle values', () => {
    const bench = computeViewBenchmark([
      stat('a', 100, 2),
      stat('b', 100, 4),
      stat('c', 100, 8),
      stat('d', 100, 10),
    ])
    expect(bench?.medianPct).toBeCloseTo(6)
  })

  test('rows without road data are excluded from the benchmark', () => {
    const bench = computeViewBenchmark([
      stat('a', 100, 5), // 5 %
      stat('b', 0, 0), // no roads
      { id: 'c', name: 'C', roadSumKm: 0, bikelaneSumKm: 0, bikeSharePct: 0 }, // enrichFeature-style 0
    ])
    expect(bench?.count).toBe(1)
    expect(bench?.medianPct).toBeCloseTo(5)
  })

  test('returns null when nothing has road data', () => {
    expect(computeViewBenchmark([{ roadSumKm: 0, bikelaneSumKm: 0, bikeSharePct: 0 }])).toBeNull()
    expect(computeViewBenchmark([])).toBeNull()
  })
})

describe('bikelaneGapKm', () => {
  test('kilometres needed to reach the target share', () => {
    expect(bikelaneGapKm({ roadSumKm: 316.9, bikelaneSumKm: 5.2 }, 8.5)).toBeCloseTo(21.7365, 3)
  })

  test('is zero once the region already meets or beats the target', () => {
    expect(bikelaneGapKm({ roadSumKm: 100, bikelaneSumKm: 20 }, 15)).toBe(0)
    expect(bikelaneGapKm({ roadSumKm: 100, bikelaneSumKm: 15 }, 15)).toBe(0)
  })
})

describe('percentileOf / contextBand', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  test('is the share of the reference set below the value', () => {
    expect(percentileOf(sorted, 1)).toBeCloseTo(0.05)
    expect(percentileOf(sorted, 5.5)).toBeCloseTo(0.5)
    expect(percentileOf(sorted, 10)).toBeCloseTo(0.95)
    expect(percentileOf(sorted, 100)).toBe(1)
    expect(percentileOf(sorted, -3)).toBe(0)
  })

  test('counts ties half, so a pile of zeros reads as low rather than extreme', () => {
    const zeros = [0, 0, 0, 0, 0, 0, 5, 6, 7, 8]
    expect(percentileOf(zeros, 0)).toBeCloseTo(0.3)
    expect(contextBand(percentileOf(zeros, 0)!)).toBe('niedrig')
  })

  test('has no answer for an empty set or a non-number', () => {
    expect(percentileOf([], 3)).toBeNull()
    expect(percentileOf(sorted, Number.NaN)).toBeNull()
  })

  test('names the fifths', () => {
    expect([0.05, 0.25, 0.5, 0.7, 0.95].map(contextBand)).toEqual([
      'sehr niedrig',
      'niedrig',
      'mittel',
      'hoch',
      'sehr hoch',
    ])
  })

  test('median of an odd and an even set', () => {
    expect(medianOfSorted([1, 3, 9])).toBe(3)
    expect(medianOfSorted([1, 3, 5, 9])).toBe(4)
    expect(medianOfSorted([])).toBeNull()
  })
})

describe('inPlacePhrase', () => {
  test.each([
    ['Bayern', 'in Bayern'],
    ['Deutschland', 'in Deutschland'],
    ['Saarland', 'im Saarland'],
    ['Landkreis Konstanz', 'im Landkreis Konstanz'],
    ['Kreis Bergstraße', 'im Kreis Bergstraße'],
    ['Alb-Donau-Kreis', 'im Alb-Donau-Kreis'],
    ['Rhein-Kreis Neuss', 'im Rhein-Kreis Neuss'],
    ['Altmarkkreis Salzwedel', 'im Altmarkkreis Salzwedel'],
    ['Märkischer Kreis', 'im Märkischen Kreis'],
    ['Rheinisch-Bergischer Kreis', 'im Rheinisch-Bergischen Kreis'],
    ['Altenburger Land', 'im Altenburger Land'],
    ['Regierungsbezirk Arnsberg', 'im Regierungsbezirk Arnsberg'],
    ['Regionalverband Saarbrücken', 'im Regionalverband Saarbrücken'],
    ['Region Hannover', 'in der Region Hannover'],
    ['Städteregion Aachen', 'in der Städteregion Aachen'],
    ['Frankfurt am Main', 'in Frankfurt am Main'],
  ])('%s → %s', (name, expected) => {
    expect(inPlacePhrase(name)).toBe(expected)
  })
})

describe('computeStructuralModelPrediction', () => {
  test('returns baseline expectation when predictors are at national means', () => {
    const res = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 10.59,
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88, // 10^2.19 ≈ 154.88
      stDistKm: 4.02,
      rent: 6.04,
      carsPer1000: 662.87,
      livingSharePct: 2.21,
    })
    expect(res).not.toBeNull()
    expect(res!.expectedPct).toBeCloseTo(10.59, 1)
    expect(res!.expectedKm).toBeCloseTo(10.59, 1)
    expect(res!.diffPct).toBeCloseTo(0, 1)
    expect(res!.diffKm).toBeCloseTo(0, 1)
    expect(res!.behind).toBe(false)
    expect(res!.isWithin1Se).toBe(true)
    expect(res!.residualStdErrorPct).toBe(5.64)
    expect(res!.n).toBe(10396)
    expect(res!.r2TotalPct).toBe(53.7)
    expect(res!.r2CvPct).toBe(53.3)
  })

  test('applies Bundesland baseline fixed effect', () => {
    // Niedersachsen baseline is 16.72% (+6.13%p)
    const resNds = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 16.72,
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
      rent: 6.04,
      carsPer1000: 662.87,
      livingSharePct: 2.21,
      bundeslandId: 'relation/62771', // Niedersachsen
    })
    expect(resNds).not.toBeNull()
    expect(resNds!.expectedPct).toBeCloseTo(16.72, 1)
    expect(resNds!.deltaLand).toBeCloseTo(6.13, 1)

    // Hessen baseline is 6.27% (-4.32%p)
    const resHe = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 6.27,
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
      rent: 6.04,
      carsPer1000: 662.87,
      livingSharePct: 2.21,
      bundeslandId: 'relation/62650', // Hessen
    })
    expect(resHe).not.toBeNull()
    expect(resHe!.expectedPct).toBeCloseTo(6.27, 1)
    expect(resHe!.deltaLand).toBeCloseTo(-4.32, 1)
  })

  test('correctly identifies whether gap is within 1 standard error (SE = 5.64%p)', () => {
    const within = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 14.0, // +3.41%p gap (within 5.64%p)
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
    })
    expect(within!.isWithin1Se).toBe(true)

    const outlierAhead = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 20.0, // +9.41%p gap (> 5.64%p)
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
    })
    expect(outlierAhead!.isWithin1Se).toBe(false)
    expect(outlierAhead!.behind).toBe(false)

    const outlierBehind = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 2.0, // -8.59%p gap (< -5.64%p)
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
    })
    expect(outlierBehind!.isWithin1Se).toBe(false)
    expect(outlierBehind!.behind).toBe(true)
  })

  test('high rent and living streets increase expected bike share', () => {
    const res = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 15.0,
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
      rent: 10.04, // +4 €/m² over mean
      carsPer1000: 500, // lower motorization
      livingSharePct: 5.0, // higher traffic calming
    })
    expect(res).not.toBeNull()
    expect(res!.deltaRent).toBeGreaterThan(3.0)
    expect(res!.deltaCars).toBeGreaterThan(0)
    expect(res!.deltaLiving).toBeGreaterThan(1.0)
    expect(res!.expectedPct).toBeGreaterThan(15.0)
  })

  test('steep mountain terrain reduces expected bike share', () => {
    const res = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 3.0,
      roadSlope: 8.0, // steeper than 3.67%
      elevMean: 700, // higher than 267.7m
      density: 100,
      stDistKm: 5.0,
    })
    expect(res).not.toBeNull()
    expect(res!.deltaTopo).toBeLessThan(0)
    expect(res!.expectedPct).toBeLessThan(10.59)
    expect(res!.actualPct).toBe(3.0)
  })

  test('flat high-density town increases expected bike share', () => {
    const res = computeStructuralModelPrediction({
      roadKm: 500,
      bikeKm: 120,
      roadSlope: 1.5, // much flatter than 3.67%
      elevMean: 40, // lower than 267.7m
      density: 3000, // much denser than 155
      stDistKm: 1.0, // very close to station
      rent: 9.0, // higher rent typical for dense city
    })
    expect(res).not.toBeNull()
    expect(res!.deltaTopo).toBeGreaterThan(0)
    expect(res!.deltaDens).toBeGreaterThan(0)
    expect(res!.deltaTransit).toBeGreaterThan(0)
    expect(res!.deltaRent).toBeGreaterThan(0)
    expect(res!.expectedPct).toBeGreaterThan(15.0)
    expect(res!.expectedKm).toBe((res!.expectedPct / 100) * 500)
    expect(res!.diffKm).toBe(120 - res!.expectedKm)
  })

  test('supports primary roads model configuration', () => {
    const res = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 35.68,
      roadSlope: 3.81,
      elevMean: 272.7,
      density: 125.89, // 10^2.1 ≈ 125.89
      stDistKm: 4.32,
      rent: 5.86,
      carsPer1000: 668.57,
      livingSharePct: 1.89,
      modelType: 'primary',
    })
    expect(res).not.toBeNull()
    expect(res!.modelType).toBe('primary')
    expect(res!.modelName).toBe('Hauptverkehrsstraßen')
    expect(res!.expectedPct).toBeCloseTo(35.68, 1)
    expect(res!.residualStdErrorPct).toBe(22.44)
    expect(res!.r2TotalPct).toBe(59.7)
    expect(res!.r2CvPct).toBe(59.4)
    expect(res!.isWithin1Se).toBe(true)
  })

  test('dynamically scales baseline and SE for custom counting filters', () => {
    // Custom filter shifts national average to 20%
    const res = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 20.0,
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
      rent: 6.04,
      carsPer1000: 662.87,
      livingSharePct: 2.21,
      dynamicBaselines: {
        nationalBaselinePct: 20.0,
        bundeslandBaselines: {
          'relation/62771': 25.0, // Niedersachsen higher under this filter
        },
      },
    })
    expect(res).not.toBeNull()
    expect(res!.baselinePct).toBe(20.0)
    expect(res!.expectedPct).toBeCloseTo(20.0, 1)
    expect(res!.isWithin1Se).toBe(true)
    // SE scales by 20.0 / 10.59 ≈ 1.888: 5.64 * 1.888 ≈ 10.65
    expect(res!.residualStdErrorPct).toBeCloseTo(10.65, 0.5)

    // With Bundesland ID
    const resNds = computeStructuralModelPrediction({
      roadKm: 100,
      bikeKm: 25.0,
      roadSlope: 3.67,
      elevMean: 267.7,
      density: 154.88,
      stDistKm: 4.02,
      rent: 6.04,
      carsPer1000: 662.87,
      livingSharePct: 2.21,
      bundeslandId: 'relation/62771',
      dynamicBaselines: {
        nationalBaselinePct: 20.0,
        bundeslandBaselines: {
          'relation/62771': 25.0,
        },
      },
    })
    expect(resNds).not.toBeNull()
    expect(resNds!.expectedPct).toBeCloseTo(25.0, 1)
    expect(resNds!.deltaLand).toBeCloseTo(5.0, 1)
  })

  test('returns null when roadKm <= 0 or all predictors are missing', () => {
    expect(
      computeStructuralModelPrediction({
        roadKm: 0,
        bikeKm: 0,
        roadSlope: 4.0,
        elevMean: 200,
        density: 100,
        stDistKm: 5.0,
      }),
    ).toBeNull()

    expect(
      computeStructuralModelPrediction({
        roadKm: 100,
        bikeKm: 5,
        roadSlope: null,
        elevMean: null,
        density: null,
        stDistKm: null,
      }),
    ).toBeNull()
  })
})
