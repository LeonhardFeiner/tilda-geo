import { describe, expect, test } from 'vitest'
import {
  buildRankingExportRows,
  buildTopFlopDisplayRows,
  effectiveRankingTopN,
  focusChainFromParentMap,
  isFocusChainInTopOrFlopWindow,
  mergeFocusChains,
  rankingShowsAsAlle,
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
