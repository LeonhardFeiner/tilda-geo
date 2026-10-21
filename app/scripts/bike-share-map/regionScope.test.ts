import { describe, expect, test } from 'vitest'
import { regionExclusionReason, regionalschluesselFor } from './regionScope'

const de = { bundesland_id: 'relation/62611' }

describe('regionExclusionReason', () => {
  test('keeps Germany and the Länder', () => {
    expect(regionExclusionReason({ id: 'relation/51477', level: '2' })).toBeNull()
    expect(regionExclusionReason({ id: 'relation/62611', level: '4' })).toBeNull()
  })
  test('keeps a regular Gemeinde', () => {
    expect(
      regionExclusionReason({ id: 'a', level: '8', regionalschluessel: '091780000000', ...de }),
    ).toBeNull()
  })
  test('drops foreign municipalities', () => {
    expect(regionExclusionReason({ id: 'relation/1683696', level: '8' })).toMatch(/outside/)
    expect(regionExclusionReason({ id: 'x', level: '9' })).toMatch(/outside/)
  })
  test('drops a level-8 duplicate without Regionalschlüssel', () => {
    expect(regionExclusionReason({ id: 'relation/21045625', level: '8', ...de })).toMatch(
      /Regionalschlüssel/,
    )
  })
  test('keeps Stadtbezirke without Regionalschlüssel', () => {
    expect(regionExclusionReason({ id: 'b', level: '9', ...de })).toBeNull()
  })
  test('drops coastal waters and the Luxembourg condominium', () => {
    expect(
      regionExclusionReason({ id: 'c', level: '8', regionalschluessel: '130009999999', ...de }),
    ).toBe('coastal waters')
    expect(regionExclusionReason({ id: 'relation/3659532', level: '6', ...de })).toBe('excluded id')
  })
  test('Greiz gets its Regionalschlüssel from the override', () => {
    const greiz = { id: 'relation/62445', level: '6', ...de }
    expect(regionExclusionReason(greiz)).toBeNull()
    expect(regionalschluesselFor(greiz)).toBe('160760000000')
  })
})
