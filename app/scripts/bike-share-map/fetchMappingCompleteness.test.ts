import { describe, expect, test } from 'vitest'
import { mappingCompletenessFromSums } from './fetchMappingCompleteness'

describe('mappingCompletenessFromSums', () => {
  test('turns metre sums into shares and their mean', () => {
    expect(
      mappingCompletenessFromSums({ m: 20_000, m_speed: 10_000, m_surface: 15_000, m_lit: 2_000 }),
    ).toEqual({ roadKm: 20, speedPct: 50, surfacePct: 75, litPct: 10, indexPct: 45 })
  })

  test('treats a missing sum (no tagged road at all) as 0 %', () => {
    expect(
      mappingCompletenessFromSums({ m: 8_000, m_speed: null, m_surface: 8_000, m_lit: null }),
    ).toMatchObject({ speedPct: 0, surfacePct: 100, litPct: 0 })
  })

  test('says nothing below 5 km of road', () => {
    expect(
      mappingCompletenessFromSums({ m: 4_999, m_speed: 4_999, m_surface: 4_999, m_lit: 4_999 }),
    ).toBeNull()
  })
})
