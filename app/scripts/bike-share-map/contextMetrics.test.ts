import { describe, expect, test } from 'vitest'
import { CONTEXT_METRIC_LABELS } from './contextMetrics'
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
  })
})
