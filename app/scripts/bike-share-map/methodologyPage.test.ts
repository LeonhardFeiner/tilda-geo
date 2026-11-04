import { describe, expect, test } from 'vitest'
import {
  COUNTING_VERSION_CHANGES,
  countingVersionMonth,
  formatIsoDateDe,
  methodologyPageHtml,
  readModelFitDate,
} from './methodologyPage'
import { COUNTING_VERSION } from './snapshotHistory'

const html = methodologyPageHtml({
  dataDateLabel: '16.10.2026',
  nationalSharePct: 12.3,
  peerGemeindeCount: 0,
  peerKreisCount: 0,
  projectLead: 'Test',
  sourceRepoUrl: 'https://example.org/repo',
  viewerHref: './index.html',
  dataDownload: { href: './daten/x.csv', excelHref: './daten/x-excel.csv', rowCount: 3 },
  modelFitDate: '2026-11-03',
  siteUrl: 'https://example.org/map/',
})

describe('version and citation', () => {
  test('names the counting version, OSM date, model date and a citation line', () => {
    expect(html).toContain('<h2 id="version">Version und Zitierweise</h2>')
    expect(html).toContain(`<code>${COUNTING_VERSION}</code>`)
    expect(html).toContain('geschätzt am 03.11.2026')
    expect(html).toContain(
      `Radinfra-Vergleich, Zählversion ${COUNTING_VERSION}, OSM-Daten vom 16.10.2026, Modell vom 03.11.2026, https://example.org/map/, abgerufen am [Datum].`,
    )
  })

  test('has a change entry for the current counting version, dated from the version string', () => {
    expect(COUNTING_VERSION_CHANGES.some((c) => c.version === COUNTING_VERSION)).toBe(true)
    expect(html).toContain('<h3>Änderungen</h3>')
    expect(html).toContain(
      `<code>${COUNTING_VERSION}</code> (${countingVersionMonth(COUNTING_VERSION)})`,
    )
    expect(countingVersionMonth('share-2026-10')).toBe('Oktober 2026')
    expect(countingVersionMonth('weird')).toBe('weird')
  })

  test('falls back gracefully without a model date', () => {
    const noModel = methodologyPageHtml({
      dataDateLabel: '16.10.2026',
      nationalSharePct: null,
      peerGemeindeCount: 0,
      peerKreisCount: 0,
      projectLead: 'Test',
      sourceRepoUrl: 'https://example.org/repo',
      viewerHref: './index.html',
      modelFitDate: null,
    })
    expect(noModel).toContain('Schätzdatum unbekannt')
    expect(noModel).not.toContain('Modell vom')
    expect(formatIsoDateDe('2026-11-03')).toBe('03.11.2026')
    expect(formatIsoDateDe(null)).toBeNull()
  })

  test('reads the fit date from the generated model config header', () => {
    expect(readModelFitDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('wording', () => {
  test('explains per-direction counting above 100 %', () => {
    expect(html).toContain('entsprechen 200&nbsp;%')
    expect(html).toContain('<code>hinweise=anteil_ueber_100</code>')
  })

  test('states that rent is not a causal factor', () => {
    expect(html).toContain(
      'Die Miete kann selbst\n  Folge guter Radinfrastruktur sein; ihr Beitrag ist deshalb kein ursächlicher Faktor.',
    )
  })

  test('says accidents per 10.000 residents are no risk measure', () => {
    expect(html).toContain('kein Risikomaß, weil das Radverkehrsaufkommen unbekannt ist')
  })
})
