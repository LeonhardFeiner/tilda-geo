import { describe, expect, test } from 'vitest'
import { parseKbaFz3Rows } from './fetchCarDensity'

describe('parseKbaFz3Rows', () => {
  test('parses Gemeinde rows and Kreis summary rows from FZ 3.1 sheet', () => {
    const rows: unknown[][] = [
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      // Row 8: headers
      ['', 'Land', 'Zulassungsbezirk', 'Gemeinde', 'Krafträder', 'Personenkraftwagen', 'darunter gewerblich'],
      // Row 9: Stuttgart Stadt
      ['', 'BADEN-WÜRTTEMBERG', '08111 STUTTGART,STADT', '08111000 STUTTGART,LANDESHAUPTSTADT', 28000, 300000, 75000],
      // Row 10: Stuttgart Zusammen
      ['', '', '', 'ZUSAMMEN', 28000, 300000, 75000],
      // Row 11: Boeblingen Kreis & Aidlingen Gemeinde
      ['', '', '08115 BOEBLINGEN', '08115001 AIDLINGEN', 700, 6000, 300],
      // Row 12: Altdorf Gemeinde
      ['', '', '', '08115002 ALTDORF', 300, 3000, 100],
      // Row 13: Boeblingen Zusammen
      ['', '', '', 'ZUSAMMEN', 1000, 9000, 400],
    ]

    const { gemeinden, kreise } = parseKbaFz3Rows(rows)

    expect(gemeinden.size).toBe(3)
    expect(gemeinden.get('08115001')).toEqual({
      type: 'gemeinde',
      code: '08115001',
      name: 'AIDLINGEN',
      cars: 6000,
      commercialCars: 300,
    })
    expect(gemeinden.get('08115002')).toEqual({
      type: 'gemeinde',
      code: '08115002',
      name: 'ALTDORF',
      cars: 3000,
      commercialCars: 100,
    })

    expect(kreise.size).toBe(2)
    expect(kreise.get('08111')).toEqual({
      type: 'kreis',
      code: '08111',
      name: 'STUTTGART,STADT',
      cars: 300000,
      commercialCars: 75000,
    })
    expect(kreise.get('08115')).toEqual({
      type: 'kreis',
      code: '08115',
      name: 'BOEBLINGEN',
      cars: 9000,
      commercialCars: 400,
    })
  })
})

