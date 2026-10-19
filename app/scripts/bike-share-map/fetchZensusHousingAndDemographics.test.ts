import { describe, expect, test } from 'vitest'
import {
  normalizeRs,
  parseZensusDemographyRows,
  parseZensusHousingRows,
} from './fetchZensusHousingAndDemographics'

describe('normalizeRs', () => {
  test('pads 1-2 digits to 2 (Bundesland)', () => {
    expect(normalizeRs('9')).toBe('09')
    expect(normalizeRs('09')).toBe('09')
  })

  test('pads 3-5 digits to 5 (Landkreis / kreisfreie Stadt)', () => {
    expect(normalizeRs('8425')).toBe('08425')
    expect(normalizeRs('08425')).toBe('08425')
  })

  test('pads 6-12 digits to 12 (Gemeinde)', () => {
    expect(normalizeRs('91860000000')).toBe('091860000000')
    expect(normalizeRs('091860000000')).toBe('091860000000')
  })
})

describe('parseZensusHousingRows', () => {
  test('parses rentPerM2 and vacancyRatePct from CSV-Wohnungen rows', () => {
    const rows = [
      ['_RS', 'QMMIETE', 'LEQ'],
      ['091860000000', 9.42, 3.1],
      ['08425', '11,50', '2,4'],
      ['empty', null, null],
    ]
    const map = parseZensusHousingRows(rows)
    expect(map.get('091860000000')).toEqual({
      rentPerM2: 9.42,
      vacancyRatePct: 3.1,
    })
    expect(map.get('08425')).toEqual({
      rentPerM2: 11.5,
      vacancyRatePct: 2.4,
    })
  })

  test('handles missing or malformed columns gracefully', () => {
    const rows = [['OTHER_COL'], ['value']]
    const map = parseZensusHousingRows(rows)
    expect(map.size).toBe(0)
  })
})

describe('parseZensusDemographyRows', () => {
  test('parses youthSharePct and seniorSharePct from CSV-Demografie rows', () => {
    const rows = [
      [
        '_RS',
        '0_Insgesamt_',
        'Alter_infr__01',
        'Alter_infr__02',
        'Alter_infr__03',
        'Alter_infr__04',
        'Alter_infr__05',
        'Alter_infr__10',
        'Alter_infr__11',
      ],
      [
        '091860000000',
        1000,
        20,
        30,
        40,
        50,
        60, // sum = 200 (20.0%)
        150,
        100, // sum = 250 (25.0%)
      ],
    ]
    const map = parseZensusDemographyRows(rows)
    expect(map.get('091860000000')).toEqual({
      youthSharePct: 20.0,
      seniorSharePct: 25.0,
    })
  })
})

