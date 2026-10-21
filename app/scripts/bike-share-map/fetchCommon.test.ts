import { describe, expect, test } from 'vitest'
import { assertDatasetCount } from './fetchCommon'

describe('assertDatasetCount', () => {
  test('accepts a normal refresh', () => {
    expect(() => assertDatasetCount('x', 10_500, 10_600, 1000, false)).not.toThrow()
    expect(() => assertDatasetCount('x', 10_500, null, 1000, false)).not.toThrow()
  })
  test('rejects a result below the minimum', () => {
    expect(() => assertDatasetCount('x', 3, null, 1000, false)).toThrow(/at least 1000/)
  })
  test('rejects a large drop against the old file unless allowed', () => {
    expect(() => assertDatasetCount('x', 5000, 10_000, 100, false)).toThrow(/−50 %/)
    expect(() => assertDatasetCount('x', 5000, 10_000, 100, true)).not.toThrow()
  })
})
