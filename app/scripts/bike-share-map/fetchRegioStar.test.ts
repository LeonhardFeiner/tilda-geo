import { describe, expect, test } from 'vitest'
import { parseRegioStarRows, regioStarForRegion } from './fetchRegioStar'

const HEADER = ['gem_20', 'gemrs_20', 'name_20', 'RegioStaR17', 'RegioStaR7', 'RegioStaRGem7']

describe('parseRegioStarRows', () => {
  test('keys rows by the 12-digit RS, restoring the leading zero', () => {
    const map = parseRegioStarRows([
      HEADER,
      [1001000, 10010000000, 'Flensburg, Stadt', 221, 75, 74],
      [9162000, 91620000000, 'München', 111, 71, 71],
      [9999999, 99999999999, 'kaputt', 0, 0, 0],
    ])
    expect(map.get('010010000000')).toEqual({ r7: 75, r17: 221, gem7: 74 })
    expect(map.get('091620000000')?.r7).toBe(71)
    expect(map.size).toBe(2)
  })

  test('also reads the older sheets, whose RS column is plain "gemrs"', () => {
    const map = parseRegioStarRows([
      ['gem', 'gemrs', 'RegioStaR17', 'RegioStaR7', 'RegioStaRGem7'],
      [1001000, 10010000000, 221, 75, 74],
    ])
    expect(map.get('010010000000')?.r17).toBe(221)
  })
})

describe('regioStarForRegion', () => {
  const byRs = new Map([['091620000000', { r7: 71, r17: 111, gem7: 71 }]])
  test('Gemeinden and kreisfreie Städte by their own RS, Kreise and Länder not at all', () => {
    expect(regioStarForRegion('8', '091620000000', byRs)?.r7).toBe(71)
    expect(regioStarForRegion('6', '091620000000', byRs)?.r7).toBe(71)
    expect(regioStarForRegion('6', '09162', byRs)?.r7).toBe(71)
    expect(regioStarForRegion('6', '09184', byRs)).toBeUndefined()
    expect(regioStarForRegion('4', '09', byRs)).toBeUndefined()
  })
})
