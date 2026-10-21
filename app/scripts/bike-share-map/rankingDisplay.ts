import { DEFAULT_MIN_ROAD_KM_FOR_SCALE } from './choroplethScale'

export type RankingDisplayItem = { id: string }

export type RankingDisplayRow = { type: 'row'; index: number; rank: number } | { type: 'divider' }

export const PORTRAIT_EXPORT = {
  width: 1080,
  height: 1920,
  padding: 56,
} as const

export const RANKING_WINDOW_CHECK_N = 11
export const RANKING_TOP_N_IN_WINDOW = 11
export const RANKING_TOP_N_OUTSIDE_WINDOW = 8
export const RANKING_EXPORT_ALLE_MAX_ROWS = 23

export function focusChainFromParentMap(
  startId: string | null | undefined,
  parentById: ReadonlyMap<string, string> | { get(id: string): string | undefined },
  depth = 3,
) {
  if (!startId) return []
  const out: string[] = []
  let current: string | undefined = startId
  for (let i = 0; i < depth && current; i++) {
    if (!out.includes(current)) out.push(current)
    current = parentById.get(current)
  }
  return out
}

export function mergeFocusChains(chains: string[][]) {
  const out: string[] = []
  for (const chain of chains) {
    for (const id of chain) {
      if (!out.includes(id)) out.push(id)
    }
  }
  return out
}

export function isFocusChainInTopOrFlopWindow(
  items: RankingDisplayItem[],
  focusChainIds: string[],
  windowN: number,
) {
  if (!focusChainIds.length) return false
  const n = items.length
  if (n <= windowN * 2) return true
  const visibleIds = new Set<string>()
  for (let i = 0; i < windowN; i++) {
    const id = items[i]?.id
    if (id) visibleIds.add(id)
  }
  for (let i = n - windowN; i < n; i++) {
    const id = items[i]?.id
    if (id) visibleIds.add(id)
  }
  return focusChainIds.some((id) => visibleIds.has(id))
}

export function focusIndexForChain(items: RankingDisplayItem[], focusChainIds: string[]) {
  for (const id of focusChainIds) {
    const index = items.findIndex((item) => item.id === id)
    if (index >= 0) return index
  }
  return -1
}

export function effectiveRankingTopN(options: {
  mode: 'topflop' | 'all'
  items: RankingDisplayItem[]
  focusChainIds: string[]
}) {
  if (options.mode !== 'topflop') return null
  if (!options.focusChainIds.length) return RANKING_TOP_N_IN_WINDOW
  if (isFocusChainInTopOrFlopWindow(options.items, options.focusChainIds, RANKING_WINDOW_CHECK_N)) {
    return RANKING_TOP_N_IN_WINDOW
  }
  return RANKING_TOP_N_OUTSIDE_WINDOW
}

export function rankingShowsAsAlle(
  itemCount: number,
  mode: 'topflop' | 'all',
  topN: number | null,
) {
  if (mode === 'all') return true
  if (topN == null) return true
  return itemCount <= topN * 2
}

export function buildRankingExportRows(
  items: RankingDisplayItem[],
  options: {
    mode: 'topflop' | 'all'
    topN: number | null
    focusChainIds: string[]
    maxAlleRows?: number
  },
) {
  const maxAlle = options.maxAlleRows ?? RANKING_EXPORT_ALLE_MAX_ROWS
  if (rankingShowsAsAlle(items.length, options.mode, options.topN)) {
    const limit = Math.min(items.length, maxAlle)
    return [...Array(limit).keys()].map((index) => ({
      type: 'row' as const,
      index,
      rank: index + 1,
    }))
  }
  return buildTopFlopDisplayRows(items, options.topN!, options.focusChainIds)
}

export function buildTopFlopDisplayRows(
  items: RankingDisplayItem[],
  topN: number,
  focusChainIds: string[],
) {
  const n = items.length
  if (n <= topN * 2) {
    return items.map((_, index) => ({
      type: 'row',
      index,
      rank: index + 1,
    })) satisfies RankingDisplayRow[]
  }

  const topIndices = [...Array(topN).keys()]
  const flopIndices = [...Array(topN).keys()].map((i) => n - topN + i)
  const topSet = new Set(topIndices)
  const flopSet = new Set(flopIndices)

  const focusIndex = focusIndexForChain(items, focusChainIds)
  const rows: RankingDisplayRow[] = []

  for (const index of topIndices) {
    rows.push({ type: 'row', index, rank: index + 1 })
  }

  if (focusIndex >= 0 && !topSet.has(focusIndex) && !flopSet.has(focusIndex)) {
    const start = Math.max(0, focusIndex - 2)
    const end = Math.min(n - 1, focusIndex + 2)
    const middleIndices: number[] = []
    for (let index = start; index <= end; index++) {
      if (!topSet.has(index) && !flopSet.has(index)) middleIndices.push(index)
    }
    if (middleIndices.length) {
      rows.push({ type: 'divider' })
      for (const index of middleIndices) {
        rows.push({ type: 'row', index, rank: index + 1 })
      }
    }
  }

  rows.push({ type: 'divider' })
  for (const index of flopIndices) {
    rows.push({ type: 'row', index, rank: index + 1 })
  }

  return rows
}

export type ViewBenchmarkStat = {
  id?: string
  name?: string
  roadSumKm: number
  bikelaneSumKm: number
  bikeSharePct: number | null
}

export type ViewBenchmark = {
  /** Regions in the view that have enough road data to carry a comparable share. */
  count: number
  /** Median bike-infra share (%) across those regions. */
  medianPct: number
  /** Highest bike-infra share (%) in the view. */
  leaderPct: number
  leaderId?: string
  leaderName?: string
}

function hasComparableShare(
  stat: ViewBenchmarkStat,
): stat is ViewBenchmarkStat & { bikeSharePct: number } {
  return (
    typeof stat.bikeSharePct === 'number' &&
    Number.isFinite(stat.bikeSharePct) &&
    stat.roadSumKm >= DEFAULT_MIN_ROAD_KM_FOR_SCALE
  )
}

/**
 * Reference points for "how does this region compare" — the median and the leader of the
 * regions currently in view. Both are always available (no neighbour data needed) and both
 * move with the counting-class filter, since callers pass the same filtered stats the
 * ranking uses. Returns null when nothing in the view has usable road data.
 */
export function computeViewBenchmark(stats: ViewBenchmarkStat[]): ViewBenchmark | null {
  const usable = stats.filter(hasComparableShare)
  if (!usable.length) return null
  const sortedPct = usable.map((s) => s.bikeSharePct).sort((a, b) => a - b)
  const mid = Math.floor(sortedPct.length / 2)
  const medianPct =
    sortedPct.length % 2 === 0 ? (sortedPct[mid - 1]! + sortedPct[mid]!) / 2 : sortedPct[mid]!
  const leader = usable.reduce((best, s) => (s.bikeSharePct > best.bikeSharePct ? s : best))
  return {
    count: usable.length,
    medianPct,
    leaderPct: leader.bikeSharePct,
    leaderId: leader.id,
    leaderName: leader.name,
  }
}

/**
 * Kilometres of bike infrastructure `stat` would have to add — holding its road length
 * fixed — to reach `targetPct` share. Never negative (0 once the target is met).
 */
export function bikelaneGapKm(
  stat: { roadSumKm: number; bikelaneSumKm: number },
  targetPct: number,
): number {
  const target = (targetPct / 100) * stat.roadSumKm
  return Math.max(0, target - stat.bikelaneSumKm)
}

/**
 * Where a value sits among a reference set, as the share of that set below it (ties count
 * half, so a pile of zeros reads as "low", not as 0 % or 100 %). `sortedAsc` must be sorted.
 */
export function percentileOf(sortedAsc: number[], value: number) {
  const n = sortedAsc.length
  if (!n || !Number.isFinite(value)) return null
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedAsc[mid]! < value) lo = mid + 1
    else hi = mid
  }
  const below = lo
  let equalEnd = lo
  while (equalEnd < n && sortedAsc[equalEnd] === value) equalEnd++
  return (below + (equalEnd - below) / 2) / n
}

export type ContextBand = 'sehr niedrig' | 'niedrig' | 'mittel' | 'hoch' | 'sehr hoch'

/** Fifths of the distribution, in words: the number alone doesn't say what is a lot. */
export function contextBand(percentile: number): ContextBand {
  if (percentile < 0.2) return 'sehr niedrig'
  if (percentile < 0.4) return 'niedrig'
  if (percentile < 0.6) return 'mittel'
  if (percentile < 0.8) return 'hoch'
  return 'sehr hoch'
}

export function medianOfSorted(sortedAsc: number[]) {
  const n = sortedAsc.length
  if (!n) return null
  const mid = Math.floor(n / 2)
  return n % 2 ? sortedAsc[mid]! : (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2
}

/**
 * "in <place>" with the article German needs for admin-area names as OSM spells them:
 * "im Landkreis Konstanz", "im Rhein-Sieg-Kreis", "im Altenburger Land", "im Saarland",
 * "im Märkischen Kreis", "in der Region Hannover", but "in Bayern".
 */
export function inPlacePhrase(name: string) {
  const n = name.trim()
  if (/^(Region|Städteregion)\s/.test(n)) return `in der ${n}`
  if (
    /kreis(\s|$)/i.test(n) ||
    /^(Regierungsbezirk|Regionalverband|Stadtverband)\s/.test(n) ||
    /\sLand$/.test(n) ||
    n === 'Saarland'
  ) {
    // Adjective names take the dative ending: "Märkischer Kreis" → "im Märkischen Kreis".
    return `im ${n.replace(/ischer Kreis$/, 'ischen Kreis')}`
  }
  return `in ${n}`
}

export type StructuralModelType = 'standard' | 'primary'

export type StructuralModelDynamicBaselines = {
  nationalBaselinePct: number
  bundeslandBaselines?: Record<string, number>
}

export type StructuralModelParams = {
  roadKm: number
  bikeKm: number
  roadSlope: number | null
  elevMean: number | null
  density: number | null
  stDistKm: number | null
  rent?: number | null
  carsPer1000?: number | null
  livingSharePct?: number | null
  bundeslandId?: string | null
  modelType?: StructuralModelType
  dynamicBaselines?: StructuralModelDynamicBaselines | null
}

export type StructuralModelConfig = {
  name: string
  baselinePct: number
  residualStdErrorPct: number
  n: number
  r2TotalPct: number
  r2CvPct: number
  means: {
    roadSlope: number
    elevMean: number
    logDens: number
    stDist: number
    rent: number
    carsPer1000: number
    livingSharePct: number
  }
  betas: {
    roadSlope: number
    elevMean: number
    logDens: number
    stDist: number
    rent: number
    carsPer1000: number
    livingSharePct: number
  }
  bundeslandBaselines: Record<string, number>
  r2: {
    totalPct: number
    cvPct: number
  }
}

export const STRUCTURAL_MODEL_CONFIGS: Record<StructuralModelType, StructuralModelConfig> = {
  // Generated by fitExtendedModel.ts (Gemeinden + kreisfreie Städte); paste its output here.
  standard: {
    name: 'Gesamtnetz (Standard)',
    baselinePct: 11.97,
    residualStdErrorPct: 5.72,
    n: 10500,
    r2TotalPct: 61.9,
    r2CvPct: 61.3,
    means: {
      roadSlope: 3.53,
      elevMean: 258.78,
      logDens: 2.29,
      stDist: 3.72,
      rent: 6.19,
      carsPer1000: 648.67,
      livingSharePct: 2.53,
    },
    betas: {
      roadSlope: -0.4745,
      elevMean: -0.0018,
      logDens: 6.0474,
      stDist: 0.0258,
      rent: 1.051,
      carsPer1000: -0.0062,
      livingSharePct: 0.5119,
    },
    bundeslandBaselines: {
      'relation/62611': 8.36, // Baden-Württemberg
      'relation/2145268': 10.57, // Bayern
      'relation/62422': 28.09, // Berlin
      'relation/62504': 15.81, // Brandenburg
      'relation/62718': 42.59, // Bremen
      'relation/62782': 35.01, // Hamburg
      'relation/62650': 7.68, // Hessen
      'relation/28322': 15.99, // Mecklenburg-Vorpommern
      'relation/62771': 17.92, // Niedersachsen
      'relation/62761': 11.95, // Nordrhein-Westfalen
      'relation/62341': 7.82, // Rheinland-Pfalz
      'relation/62372': 9.22, // Saarland
      'relation/62467': 10.19, // Sachsen
      'relation/62607': 12.93, // Sachsen-Anhalt
      'relation/51529': 17.46, // Schleswig-Holstein
      'relation/62366': 9.1, // Thüringen
    },
    r2: {
      totalPct: 61.9,
      cvPct: 61.3,
    },
  },
  primary: {
    name: 'Hauptverkehrsstraßen',
    baselinePct: 41.41,
    residualStdErrorPct: 23.66,
    n: 10417,
    r2TotalPct: 67.7,
    r2CvPct: 67.1,
    means: {
      roadSlope: 3.71,
      elevMean: 265.85,
      logDens: 2.18,
      stDist: 4.07,
      rent: 5.98,
      carsPer1000: 657.63,
      livingSharePct: 2.15,
    },
    betas: {
      roadSlope: -1.7514,
      elevMean: -0.0044,
      logDens: 35.7939,
      stDist: 0.3779,
      rent: 4.6197,
      carsPer1000: -0.0273,
      livingSharePct: 2.625,
    },
    bundeslandBaselines: {
      'relation/62611': 24.4, // Baden-Württemberg
      'relation/2145268': 38.05, // Bayern
      'relation/62422': 100.0, // Berlin
      'relation/62504': 57.57, // Brandenburg
      'relation/62718': 100.0, // Bremen
      'relation/62782': 100.0, // Hamburg
      'relation/62650': 23.53, // Hessen
      'relation/28322': 58, // Mecklenburg-Vorpommern
      'relation/62771': 67.3, // Niedersachsen
      'relation/62761': 44.68, // Nordrhein-Westfalen
      'relation/62341': 24.48, // Rheinland-Pfalz
      'relation/62372': 26.76, // Saarland
      'relation/62467': 32.74, // Sachsen
      'relation/62607': 40.39, // Sachsen-Anhalt
      'relation/51529': 62.72, // Schleswig-Holstein
      'relation/62366': 30.47, // Thüringen
    },
    r2: {
      totalPct: 67.7,
      cvPct: 67.1,
    },
  },
}

export const STRUCTURAL_MODEL_CONFIG = STRUCTURAL_MODEL_CONFIGS.standard

/**
 * Bar length (0–1) for a ranking value: measured from zero, so a bar's length is proportional to
 * the value and an empty bar means 0 (not "lowest in view"). Values above `capValue` fill the bar.
 * Diverging metrics pass the magnitude and the bound of their side.
 */
export function barFractionFromZero(value: number, capValue: number) {
  if (!(value > 0) || !(capValue > 0)) return 0
  return Math.min(1, value / capValue)
}

export type StructuralModelPrediction = NonNullable<
  ReturnType<typeof computeStructuralModelPrediction>
>

const DELTA_KEYS = [
  'deltaLand',
  'deltaSlope',
  'deltaElev',
  'deltaTopo',
  'deltaDens',
  'deltaTransit',
  'deltaRent',
  'deltaCars',
  'deltaLiving',
] as const
const INPUT_KEYS = [
  'roadSlope',
  'elevMean',
  'density',
  'stDistKm',
  'rent',
  'carsPer1000',
  'livingSharePct',
] as const

/**
 * A Landkreis, Bezirk or Land as the sum of its Gemeinden: expected km add up, so the expected
 * share is their total over the Gemeinden's road km. Factor contributions are road-length
 * weighted means (a missing input contributed 0 to its Gemeinde, so it counts as 0 here too),
 * which keeps the breakdown adding up to the expected value. `residualStdErrorPct` is the band
 * for this level (aggregateResidualStdErrorPct), not the Gemeinde one — deviations partly cancel.
 */
export function aggregateStructuralPredictions(
  parts: StructuralModelPrediction[],
  residualStdErrorPct: number,
  /**
   * The region's own lengths. Compared against those, so the actual share matches the map even
   * where part of the region has no modelled Gemeinde (e.g. unincorporated forest areas).
   */
  own?: { roadKm: number; bikeKm: number },
) {
  const first = parts[0]
  if (!first) return null
  const roadKm = parts.reduce((a, m) => a + m.roadKm, 0)
  if (!(roadKm > 0)) return null
  const weighted = (get: (m: StructuralModelPrediction) => number | null) =>
    parts.reduce((a, m) => a + (get(m) ?? 0) * m.roadKm, 0) / roadKm
  const expectedPct = (parts.reduce((a, m) => a + m.expectedKm, 0) / roadKm) * 100
  const ownRoadKm = own && own.roadKm > 0 ? own.roadKm : roadKm
  const actualKm = own && own.roadKm > 0 ? own.bikeKm : parts.reduce((a, m) => a + m.actualKm, 0)
  const actualPct = (actualKm / ownRoadKm) * 100
  const expectedKm = (expectedPct / 100) * ownRoadKm
  const diffPct = actualPct - expectedPct
  // A region of a single Gemeinde (kreisfreie Stadt) varies like a Gemeinde: keep its band.
  const band = parts.length === 1 ? first.residualStdErrorPct : residualStdErrorPct
  const deltas = Object.fromEntries(DELTA_KEYS.map((k) => [k, weighted((m) => m[k])])) as Record<
    (typeof DELTA_KEYS)[number],
    number
  >
  const inputs = Object.fromEntries(
    INPUT_KEYS.map((k) => {
      const known = parts.filter((m) => m.inputs[k] != null)
      const w = known.reduce((a, m) => a + m.roadKm, 0)
      return [k, w > 0 ? known.reduce((a, m) => a + (m.inputs[k] ?? 0) * m.roadKm, 0) / w : null]
    }),
  ) as StructuralModelPrediction['inputs']
  return {
    ...first,
    ...deltas,
    baselinePct: weighted((m) => m.baselinePct),
    landBaselinePct: weighted((m) => m.landBaselinePct),
    expectedPct,
    expectedKm,
    actualPct,
    actualKm,
    roadKm: ownRoadKm,
    diffPct,
    diffKm: actualKm - expectedKm,
    behind: diffPct < -0.05,
    isWithin1Se: Math.abs(diffPct) <= band,
    residualStdErrorPct: band,
    inputs,
    gemeindeCount: parts.length,
  }
}

/**
 * Typical deviation for regions of one level: the road-length weighted root mean square of their
 * gaps, the same measure as the Gemeinde model's residual standard error.
 */
export function aggregateResidualStdErrorPct(gaps: Array<{ diffPct: number; roadKm: number }>) {
  const w = gaps.reduce((a, g) => a + g.roadKm, 0)
  if (!(w > 0)) return null
  return Math.sqrt(gaps.reduce((a, g) => a + g.roadKm * g.diffPct ** 2, 0) / w)
}

/**
 * Levels the Gemeinde predictions are summed up to (Bezirk, Kreis, Gemeindeverband). Not Länder:
 * the model has one baseline per Land, so a Land's Gemeinden deviate by ~0 on average by
 * construction and a Land-level gap would say nothing.
 */
export function isAggregatedModelLevel(level: unknown) {
  return ['5', '6', '7'].includes(String(level ?? ''))
}

/** Below this many regions of a level a typical deviation can't be measured. */
export const MODEL_BAND_MIN_REGIONS = 8

/**
 * Colour stops for the model gap: a continuous diverging scale whose light tints near zero still
 * show the sign, so a small deviation never looks like missing data. `bandPct` (±1 typical
 * deviation) marks where the tints turn into full colour.
 */
export function modelGapColorStops(bandPct: number, boundPct: number, colorblind: boolean) {
  const band = Math.max(0.1, bandPct)
  const bound = Math.max(boundPct, band + 0.1)
  const [low, lowBand, lowNear, highNear, highBand, high] = colorblind
    ? ['#b35806', '#f1a340', '#fde9c9', '#dbe8f3', '#7fa9d1', '#2166ac']
    : ['#b71c1c', '#e57373', '#fbe3e1', '#e1f1e2', '#81c784', '#1b5e20']
  return [
    [-bound, low],
    [-band, lowBand],
    [-0.001, lowNear],
    [0.001, highNear],
    [band, highBand],
    [bound, high],
  ] as Array<[number, string]>
}

/**
 * The model is fitted on Gemeinden (fitExtendedModel.ts), so it only predicts Gemeinden. Applied
 * to a Kreis or Land it would mix in averages over very different places — no expected value there.
 */
export function isStructuralModelLevel(level: unknown) {
  return String(level ?? '') === '8'
}

export function computeStructuralModelPrediction(params: StructuralModelParams) {
  const {
    roadKm,
    bikeKm,
    roadSlope,
    elevMean,
    density,
    stDistKm,
    rent = null,
    carsPer1000 = null,
    livingSharePct = null,
    bundeslandId = null,
    modelType = 'standard',
    dynamicBaselines = null,
  } = params
  if (!(roadKm > 0) || typeof bikeKm !== 'number') return null
  if (
    roadSlope == null &&
    elevMean == null &&
    density == null &&
    stDistKm == null &&
    rent == null &&
    carsPer1000 == null &&
    livingSharePct == null
  ) {
    return null
  }

  const c = STRUCTURAL_MODEL_CONFIGS[modelType] || STRUCTURAL_MODEL_CONFIGS.standard

  let baselinePct = c.baselinePct
  let landBaseline =
    bundeslandId && c.bundeslandBaselines[bundeslandId] != null
      ? c.bundeslandBaselines[bundeslandId]
      : baselinePct
  let scaleFactor = 1

  if (dynamicBaselines && dynamicBaselines.nationalBaselinePct > 0) {
    scaleFactor = dynamicBaselines.nationalBaselinePct / c.baselinePct
    baselinePct = dynamicBaselines.nationalBaselinePct
    if (bundeslandId && dynamicBaselines.bundeslandBaselines?.[bundeslandId] != null) {
      landBaseline = dynamicBaselines.bundeslandBaselines[bundeslandId]
    } else if (bundeslandId && c.bundeslandBaselines[bundeslandId] != null) {
      landBaseline = c.bundeslandBaselines[bundeslandId] * scaleFactor
    } else {
      landBaseline = baselinePct
    }
  }

  const deltaLand = landBaseline - baselinePct

  const deltaSlope =
    roadSlope != null ? c.betas.roadSlope * scaleFactor * (roadSlope - c.means.roadSlope) : 0
  const deltaElev =
    elevMean != null ? c.betas.elevMean * scaleFactor * (elevMean - c.means.elevMean) : 0
  const deltaTopo = deltaSlope + deltaElev

  const deltaDens =
    density != null
      ? c.betas.logDens * scaleFactor * (Math.log10(Math.max(1, density)) - c.means.logDens)
      : 0

  const deltaTransit =
    stDistKm != null ? c.betas.stDist * scaleFactor * (stDistKm - c.means.stDist) : 0

  const deltaRent = rent != null ? c.betas.rent * scaleFactor * (rent - c.means.rent) : 0
  const deltaCars =
    carsPer1000 != null
      ? c.betas.carsPer1000 * scaleFactor * (carsPer1000 - c.means.carsPer1000)
      : 0
  const deltaLiving =
    livingSharePct != null
      ? c.betas.livingSharePct * scaleFactor * (livingSharePct - c.means.livingSharePct)
      : 0

  const expectedPct = Math.max(
    0,
    Math.min(
      100,
      baselinePct +
        deltaLand +
        deltaTopo +
        deltaDens +
        deltaTransit +
        deltaRent +
        deltaCars +
        deltaLiving,
    ),
  )
  const expectedKm = (expectedPct / 100) * roadKm
  const actualPct = (bikeKm / roadKm) * 100
  const diffPct = actualPct - expectedPct
  const diffKm = bikeKm - expectedKm
  const residualStdErrorPct = c.residualStdErrorPct * scaleFactor
  const isWithin1Se = Math.abs(diffPct) <= residualStdErrorPct

  return {
    modelType,
    modelName: c.name,
    baselinePct,
    landBaselinePct: landBaseline,
    deltaLand: bundeslandId ? deltaLand : null,
    deltaSlope: roadSlope != null ? deltaSlope : null,
    deltaElev: elevMean != null ? deltaElev : null,
    deltaTopo,
    deltaDens,
    deltaTransit,
    deltaRent: rent != null ? deltaRent : null,
    deltaCars: carsPer1000 != null ? deltaCars : null,
    deltaLiving: livingSharePct != null ? deltaLiving : null,
    expectedPct,
    expectedKm,
    actualPct,
    actualKm: bikeKm,
    roadKm,
    diffPct,
    diffKm,
    behind: diffPct < -0.05,
    isWithin1Se,
    residualStdErrorPct,
    n: c.n,
    r2TotalPct: c.r2TotalPct,
    r2CvPct: c.r2CvPct,
    inputs: {
      roadSlope,
      elevMean,
      density,
      stDistKm,
      rent,
      carsPer1000,
      livingSharePct,
    },
    r2: c.r2,
  }
}
