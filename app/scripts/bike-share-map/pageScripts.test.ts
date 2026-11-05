import { Script } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { detourPageHtml } from './detourPage'
import { generateViewerHtml } from './generateViewerHtml'
import { legalPageHtml } from './legalPage'
import { methodologyPageHtml } from './methodologyPage'
import { stationAreasPageHtml } from './stationAreasPage'
import { pageBundles } from './viewerHarness'

/**
 * Every generated page keeps its script in a TS template literal, so a JS '\n' written without
 * the extra backslash turns into a raw line break inside a string literal and the whole page is
 * blank. tsc and lint never see these scripts; this compiles each inline <script> of each page.
 */
const pages: Record<string, string> = {
  'index.html': generateViewerHtml('2026-10-11T00:00:00.000Z', '11.10.2026'),
  'umweg.html': detourPageHtml({
    landkreise: [{ id: 'relation/1', name: 'Test', file: 'relation-1.msgpack' } as never],
    dataBaseHref: './detour/',
    routingScriptHref: './detourRouting.js',
    dataDateLabel: '01.01.2026',
    methodikHref: './methodik.html',
    viewerHref: './index.html',
  }),
  'naechste-station.html': stationAreasPageHtml({
    dataHref: './naechste-station.json',
    dataDateLabel: '01.01.2026',
    accessBaseHref: './station-access/',
    accessFiles: { foot: ['areas', 'minutes', 'km'], bike: ['areas', 'minutes', 'km'] },
  }),
  'methodik.html': methodologyPageHtml({
    dataDateLabel: '01.01.2026',
    nationalSharePct: 12.3,
    peerGemeindeCount: 0,
    peerKreisCount: 0,
    projectLead: 'Test',
    sourceRepoUrl: 'https://example.org/repo',
    viewerHref: './index.html',
    dataDownload: { href: './daten/x.csv', excelHref: './daten/x-excel.csv', rowCount: 3 },
    modelFitDate: '2026-11-03',
    siteUrl: 'https://example.org/map/',
  }),
  'impressum.html': legalPageHtml({ projectLead: 'Test', viewerHref: './index.html' }),
}

const inlineScripts = (html: string) =>
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\stype="(?:application\/(?:ld\+)?json|importmap)"/.test(m[0].slice(0, 80)))
    .map((m) => m[1] ?? '')
    .filter((code) => code.trim())

describe.each(Object.entries(pages))('%s', (_name, html) => {
  test('every inline <script> parses', () => {
    for (const code of inlineScripts(html)) {
      // Compiles only; nothing runs.
      expect(() => new Script(code)).not.toThrow()
    }
  })
})

test('the pages with client logic do have inline scripts', () => {
  for (const name of ['index.html', 'umweg.html', 'naechste-station.html']) {
    expect(inlineScripts(pages[name]!).length).toBeGreaterThan(0)
  }
})

test('the smoke harness loads exactly the bundles each page links (vendor excluded)', () => {
  expect(pageBundles(pages['index.html']!)).toEqual([
    'statsClassSums.js',
    'regionNavigation.js',
    'statsMsgpack.js',
    'neighborView.js',
    'regionSearch.js',
    'rankingDisplay.js',
    'viewerUrlOptions.js',
  ])
  expect(pageBundles(pages['umweg.html']!)).toEqual(['detourRouting.js'])
})
