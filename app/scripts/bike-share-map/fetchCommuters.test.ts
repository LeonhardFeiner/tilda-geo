import { describe, expect, test } from 'vitest'
import {
  computeCommuterMetrics,
  parseCommuterRows,
  type ParsedCommuterEntry,
} from './fetchCommuters'

describe('parseCommuterRows', () => {
  test('parses Gemeinde, Kreis, and Land rows with numeric values', () => {
    const rows = [
      ['Gemeindedaten aus der Beschäftigungsstatistik'],
      [
        'Schl.\nNr.',
        'Gemeinde',
        'Wohnort',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Arbeitsort',
        'Wohnort=Arbeitsort',
        'Einpendler',
        'Auspendler',
        'Betriebe',
      ],
      // Gemeinde Flensburg
      [
        '01001000',
        'Flensburg, Stadt',
        36345,
        19179,
        17166,
        29400,
        6945,
        583,
        3540,
        7648,
        46361,
        22419,
        23908,
        13926,
        2292,
      ],
      // Kreis Dithmarschen
      [
        '01051',
        'Dithmarschen',
        53000,
        27000,
        26000,
        48000,
        5000,
        800,
        4000,
        11000,
        47000,
        35000,
        12000,
        18000,
        4100,
      ],
      // Land Schleswig-Holstein
      [
        '01',
        'Schleswig-Holstein',
        1050000,
        550000,
        500000,
        950000,
        100000,
        15000,
        90000,
        220000,
        1020000,
        880000,
        140000,
        170000,
        75000,
      ],
      // Row with data privacy suppression '*'
      ['01051001', 'Tiny Village', '*', '*', '*', '*', '*', '*', '*', '*', '*', '*', '*', '*', '*'],
      // Invalid header / text row
      ['Total', 'Summe', 100, 50, 50, 90, 10, 5, 10, 20, 100, 80, 20, 20, 10],
    ]

    const result = parseCommuterRows(rows)

    expect(result.size).toBe(4)

    const flensburg = result.get('01001000')
    expect(flensburg).toBeDefined()
    expect(flensburg?.name).toBe('Flensburg, Stadt')
    expect(flensburg?.employedAtResidence).toBe(36345)
    expect(flensburg?.employedAtWorkplace).toBe(46361)
    expect(flensburg?.internalEmployed).toBe(22419)
    expect(flensburg?.inCommuters).toBe(23908)
    expect(flensburg?.outCommuters).toBe(13926)
    expect(flensburg?.workplaces).toBe(2292)

    const dithmarschen = result.get('01051')
    expect(dithmarschen).toBeDefined()
    expect(dithmarschen?.employedAtResidence).toBe(53000)

    const sh = result.get('01')
    expect(sh).toBeDefined()
    expect(sh?.employedAtResidence).toBe(1050000)

    const tiny = result.get('01051001')
    expect(tiny).toBeDefined()
    expect(tiny?.employedAtResidence).toBeUndefined()
    expect(tiny?.employedAtWorkplace).toBeUndefined()
  })

  test('returns empty map for empty or short input', () => {
    expect(parseCommuterRows([]).size).toBe(0)
    expect(parseCommuterRows([['Header']]).size).toBe(0)
  })
})

describe('computeCommuterMetrics', () => {
  test('derives netCommuters, shares, centrality, and rates', () => {
    const entry: ParsedCommuterEntry = {
      name: 'Flensburg, Stadt',
      employedAtResidence: 36345,
      employedAtWorkplace: 46361,
      internalEmployed: 22419,
      inCommuters: 23908,
      outCommuters: 13926,
      workplaces: 2292,
    }

    const metrics = computeCommuterMetrics(entry, 90000)

    expect(metrics.netCommuters).toBe(23908 - 13926) // 9982
    expect(metrics.inCommuterSharePct).toBeCloseTo(51.6, 1) // (23908 / 46361) * 100
    expect(metrics.outCommuterSharePct).toBeCloseTo(38.3, 1) // (13926 / 36345) * 100
    expect(metrics.jobCentrality).toBeCloseTo(1.28, 2) // 46361 / 36345
    expect(metrics.jobsPer1000Inhabitants).toBeCloseTo(515.1, 1) // (46361 / 90000) * 1000
    expect(metrics.workplaces).toBe(2292)
  })

  test('handles missing or zero values safely', () => {
    const entry: ParsedCommuterEntry = {
      name: 'Empty Village',
    }

    const metrics = computeCommuterMetrics(entry)

    expect(metrics.netCommuters).toBeUndefined()
    expect(metrics.inCommuterSharePct).toBeUndefined()
    expect(metrics.outCommuterSharePct).toBeUndefined()
    expect(metrics.jobCentrality).toBeUndefined()
    expect(metrics.jobsPer1000Inhabitants).toBeUndefined()
  })
})
