import { describe, expect, test } from 'vitest'
import { agsOfRs, atlasByRegion, parseAtlasCsv } from './fetchDeutschlandatlas'

describe('parseAtlasCsv', () => {
  test('restores leading zeros, reads decimal commas and drops -99999', () => {
    const text = [
      'Regionalschlüssel;Gemeindename;bev_dicht;bev_entw;st_einnkr',
      '1001000;Flensburg, Stadt;1697,97;0,75;1600',
      '9186113;Schweitenkirchen;100;1,17;-99999',
      ';Fußnote;;;',
    ].join('\r\n')
    const map = parseAtlasCsv(text, { st_einnkr: 'taxPerCapita', bev_entw: 'popGrowthPct' }, 8)
    expect(map.get('01001000')).toEqual({ taxPerCapita: 1600, popGrowthPct: 0.75 })
    expect(map.get('09186113')).toEqual({ popGrowthPct: 1.17 })
    expect(map.size).toBe(2)
  })
})

describe('atlasByRegion', () => {
  test('Gemeinden by AGS plus their Verband, Kreise and Länder population-weighted', () => {
    expect(agsOfRs('091865113113')).toBe('09186113')
    const byAgs = new Map([
      ['09186113', { taxPerCapita: 2000, primarySchoolMin: 5 }],
      ['09186117', { taxPerCapita: 1000, primarySchoolMin: 3 }],
      ['09162000', { taxPerCapita: 3000 }],
    ])
    const byVerband = new Map([
      ['091865113', { commuteKm: 30 }],
      ['091620000', { commuteKm: 10 }],
    ])
    const population = new Map([
      ['091865113113', 1000],
      ['091865113117', 3000],
      ['091620000000', 1_500_000],
    ])
    const byId = atlasByRegion(
      [
        { id: 'g1', level: '8', rs: '091865113113' },
        { id: 'vg', level: '7', rs: '091865113' },
        { id: 'lk', level: '6', rs: '09186' },
        { id: 'muc', level: '6', rs: '091620000000' },
        { id: 'by', level: '4', rs: '09' },
        { id: 'none', level: '8', rs: '010010000000' },
      ],
      byAgs,
      byVerband,
      population,
    )
    expect(byId.g1).toEqual({ taxPerCapita: 2000, primarySchoolMin: 5, commuteKm: 30 })
    // Verband: its own commute value, the rest weighted over its Gemeinden (1000 × 2000 + 3000 × 1000).
    expect(byId.vg).toEqual({ taxPerCapita: 1250, primarySchoolMin: 3.5, commuteKm: 30 })
    expect(byId.lk).toEqual({ taxPerCapita: 1250, primarySchoolMin: 3.5, commuteKm: 30 })
    expect(byId.muc).toEqual({ taxPerCapita: 3000, commuteKm: 10 })
    expect(byId.by?.taxPerCapita).toBe(
      Math.round((1000 * 2000 + 3000 * 1000 + 1_500_000 * 3000) / 1_504_000),
    )
    expect(byId.none).toBeUndefined()
  })
})
