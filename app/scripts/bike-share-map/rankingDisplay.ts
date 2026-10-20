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
}

export const STRUCTURAL_MODEL_CONFIG = {
  baselinePct: 10.59,
  residualStdErrorPct: 5.64,
  n: 10396,
  r2TotalPct: 53.7,
  r2CvPct: 53.3,
  means: {
    roadSlope: 3.67,
    elevMean: 267.7,
    logDens: 2.19,
    stDist: 4.02,
    rent: 6.04,
    carsPer1000: 662.87,
    livingSharePct: 2.21,
  },
  betas: {
    roadSlope: -0.386,
    elevMean: -0.0018,
    logDens: 4.3904,
    stDist: -0.0143,
    rent: 0.9342,
    carsPer1000: -0.0038,
    livingSharePct: 0.5545,
  },
  bundeslandBaselines: {
    'relation/2145268': 8.91, // Bayern
    'relation/28322': 14.31, // Mecklenburg-Vorpommern
    'relation/51529': 15.83, // Schleswig-Holstein
    'relation/62341': 6.39, // Rheinland-Pfalz
    'relation/62366': 7.99, // Thüringen
    'relation/62372': 8.45, // Saarland
    'relation/62422': 28.09, // Berlin
    'relation/62467': 8.74, // Sachsen
    'relation/62504': 14.42, // Brandenburg
    'relation/62607': 10.79, // Sachsen-Anhalt
    'relation/62611': 7.3, // Baden-Württemberg
    'relation/62650': 6.27, // Hessen
    'relation/62718': 42.59, // Bremen
    'relation/62761': 10.91, // Nordrhein-Westfalen
    'relation/62771': 16.72, // Niedersachsen
    'relation/62782': 35.01, // Hamburg
  } as Record<string, number>,
  r2: {
    totalPct: 53.7,
    cvPct: 53.3,
  },
} as const

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

  const c = STRUCTURAL_MODEL_CONFIG
  const landBaseline =
    bundeslandId && c.bundeslandBaselines[bundeslandId] != null
      ? c.bundeslandBaselines[bundeslandId]
      : c.baselinePct
  const deltaLand = landBaseline - c.baselinePct

  const deltaSlope = roadSlope != null ? c.betas.roadSlope * (roadSlope - c.means.roadSlope) : 0
  const deltaElev = elevMean != null ? c.betas.elevMean * (elevMean - c.means.elevMean) : 0
  const deltaTopo = deltaSlope + deltaElev

  const deltaDens =
    density != null ? c.betas.logDens * (Math.log10(Math.max(1, density)) - c.means.logDens) : 0

  const deltaTransit = stDistKm != null ? c.betas.stDist * (stDistKm - c.means.stDist) : 0

  const deltaRent = rent != null ? c.betas.rent * (rent - c.means.rent) : 0
  const deltaCars =
    carsPer1000 != null ? c.betas.carsPer1000 * (carsPer1000 - c.means.carsPer1000) : 0
  const deltaLiving =
    livingSharePct != null ? c.betas.livingSharePct * (livingSharePct - c.means.livingSharePct) : 0

  const expectedPct = Math.max(
    0,
    Math.min(
      100,
      c.baselinePct +
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
  const isWithin1Se = Math.abs(diffPct) <= c.residualStdErrorPct

  return {
    baselinePct: c.baselinePct,
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
    residualStdErrorPct: c.residualStdErrorPct,
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
