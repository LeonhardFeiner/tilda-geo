import { describe, expect, test } from 'vitest'
import { CONTEXT_METRIC_GROUPS, CONTEXT_METRIC_LABELS } from './contextMetrics'
import { DATA_DOWNLOAD_COLUMNS } from './dataDownload'

describe('context metric labels', () => {
  test('the CSV describes metrics with the same names as the card', () => {
    expect(DATA_DOWNLOAD_COLUMNS.rad_unfaelle_je_10k_ew).toBe(
      CONTEXT_METRIC_LABELS.bikeAccidentsPer10k,
    )
    expect(DATA_DOWNLOAD_COLUMNS.pkw_je_1000_ew.startsWith(CONTEXT_METRIC_LABELS.carDensity)).toBe(
      true,
    )
    expect(DATA_DOWNLOAD_COLUMNS.miete_eur_m2.startsWith(CONTEXT_METRIC_LABELS.rent)).toBe(true)
    expect(DATA_DOWNLOAD_COLUMNS.ab_67_pct.startsWith(CONTEXT_METRIC_LABELS.senior)).toBe(true)
    expect(
      DATA_DOWNLOAD_COLUMNS.eigentuemerquote_pct.startsWith(CONTEXT_METRIC_LABELS.ownerOccupier),
    ).toBe(true)
    expect(
      DATA_DOWNLOAD_COLUMNS.neubau_ab_2000_pct.startsWith(CONTEXT_METRIC_LABELS.newBuild),
    ).toBe(true)
    expect(
      DATA_DOWNLOAD_COLUMNS.raumtyp_regiostar7.startsWith(CONTEXT_METRIC_LABELS.regioStar),
    ).toBe(true)
  })
})

describe('context metric groups', () => {
  test('put every card metric in exactly one group', () => {
    const grouped = CONTEXT_METRIC_GROUPS.flatMap((g) => [...g.keys])
    expect(new Set(grouped).size).toBe(grouped.length)
    expect([...grouped].sort()).toEqual(Object.keys(CONTEXT_METRIC_LABELS).sort())
  })
})
