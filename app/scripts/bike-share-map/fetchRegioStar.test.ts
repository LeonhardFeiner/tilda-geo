import { describe, expect, test } from 'vitest'
import { matchRegioStar, parseRegioStarRows, type RegioStarRow } from './fetchRegioStar'

const HEADER = [
  'gem_20',
  'gemrs_20',
  'name_20',
  'bev_20',
  'RegioStaR17',
  'RegioStaR7',
  'RegioStaRGem7',
]

describe('parseRegioStarRows', () => {
  test('keys rows by the 12-digit RS, restoring the leading zero', () => {
    const map = parseRegioStarRows([
      HEADER,
      [1001000, 10010000000, 'Flensburg, Stadt', 89934, 221, 75, 74],
      [9162000, 91620000000, 'München', 1488202, 111, 71, 71],
      [9999999, 99999999999, 'kaputt', 1, 0, 0, 0],
    ])
    expect(map.get('010010000000')).toEqual({
      r7: 75,
      r17: 221,
      gem7: 74,
      name: 'Flensburg, Stadt',
      population: 89934,
    })
    expect(map.get('091620000000')?.r7).toBe(71)
    expect(map.size).toBe(2)
  })

  test('also reads the older sheets, whose RS column is plain "gemrs"', () => {
    const map = parseRegioStarRows([
      ['gem', 'gemrs', 'gemname', 'gembev', 'RegioStaR17', 'RegioStaR7', 'RegioStaRGem7'],
      [1001000, 10010000000, 'Flensburg, Stadt', 1, 221, 75, 74],
    ])
    expect(map.get('010010000000')?.r17).toBe(221)
  })
})

describe('matchRegioStar', () => {
  const row = (name: string, population: number, r7: number): RegioStarRow => ({
    r7,
    r17: r7 * 3,
    gem7: r7,
    name,
    population,
  })
  const rows = new Map<string, RegioStarRow>([
    ['091620000000', row('München, Landeshauptstadt', 1_488_202, 71)],
    // Same AGS (09186113), other Verband since 2020.
    ['091865113113', row('Schweitenkirchen', 5_500, 74)],
    // Greiz was re-keyed; Berga and Wünschendorf merged; Kleinort merged into one of them.
    ['160760022022', row('Greiz, Stadt', 20_000, 76)],
    // Eisenach was kreisfrei (16056) in 2020, in the Wartburgkreis (16063) now.
    ['160560000000', row('Eisenach, Stadt', 42_000, 75)],
    ['160630001001', row('Frankenroda', 300, 77)],
    ['160765001001', row('Kleinort', 900, 77)],
    ['160765002002', row('Berga/Elster, Stadt', 3_000, 77)],
    ['160765003003', row('Wünschendorf/Elster', 3_000, 77)],
    // Hanau was in Main-Kinzig-Kreis (06435) in 2020, kreisfrei (06415) now.
    ['064350014014', row('Hanau, Brüder-Grimm-Stadt', 96_000, 72)],
    ['064350001001', row('Bruchköbel, Stadt', 20_000, 73)],
  ])
  const region = (id: string, level: string, rs: string, name: string, municipality = true) => ({
    id,
    level,
    rs,
    name,
    municipality,
  })

  test('exact RS, same AGS, merged predecessors by name, and a Kreis change by name in the Land', () => {
    const { byId, unmatched } = matchRegioStar(
      [
        region('muc', '6', '091620000000', 'München'),
        region('lk', '6', '09184', 'Landkreis München', false),
        // OSM keys Landkreis Greiz like a city; it is no municipality, so it gets no type.
        region('lkgreiz', '6', '160760000000', 'Greiz', false),
        region('land', '4', '09', 'Bayern', false),
        region('schw', '8', '091860113113', 'Schweitenkirchen'),
        region('greiz', '8', '160760000000', 'Greiz'),
        region('bw', '8', '160760094094', 'Berga-Wünschendorf'),
        region('hanau', '6', '064150000000', 'Hanau'),
        region('bk', '8', '064350001001', 'Bruchköbel'),
        region('eisenach', '8', '160630105105', 'Eisenach'),
      ],
      rows,
    )
    expect(byId.muc).toEqual({ r7: 71, r17: 213, gem7: 71 })
    expect(byId.lk).toBeUndefined()
    expect(byId.lkgreiz).toBeUndefined()
    expect(byId.land).toBeUndefined()
    expect(byId.schw).toMatchObject({ r7: 74, from: 'Schweitenkirchen' })
    expect(byId.greiz).toMatchObject({ r7: 76, from: 'Greiz, Stadt' })
    // A name match in the Land beats an unrelated predecessor in the new Kreis.
    expect(byId.eisenach).toMatchObject({ r7: 75, from: 'Eisenach, Stadt' })
    expect(byId.bw?.r7).toBe(77)
    expect(byId.hanau).toMatchObject({ r7: 72, from: 'Hanau, Brüder-Grimm-Stadt' })
    expect(byId.bk).toEqual({ r7: 73, r17: 219, gem7: 73 })
    expect(unmatched).toEqual([])
  })

  test('a Gemeinde with neither a row nor a vanished predecessor stays unmatched', () => {
    const { byId, unmatched } = matchRegioStar(
      [region('new', '8', '010010000000', 'Neustadt')],
      new Map([['091620000000', row('München', 1, 71)]]),
    )
    expect(byId.new).toBeUndefined()
    expect(unmatched.map((r) => r.id)).toEqual(['new'])
  })
})
