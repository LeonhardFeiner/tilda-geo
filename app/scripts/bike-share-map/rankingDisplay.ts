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
