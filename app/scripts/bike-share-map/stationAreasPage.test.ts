import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { stationAreasPageHtml } from './stationAreasPage'
import { bootPage, pageBundles, type ViewerPage } from './viewerHarness'

/**
 * The nearest-station page, generated from source, booted in jsdom against the built
 * output/viewer/naechste-station.json. MapLibre is stubbed.
 */

const dataFile = join(import.meta.dirname, 'output', 'viewer', 'naechste-station.json')
const html = () =>
  stationAreasPageHtml({
    dataHref: './naechste-station.json',
    dataDateLabel: '01.01.2026',
    accessBaseHref: './station-access/',
    accessFiles: { bike: ['areas', 'minutes', 'km'] },
  })

let page: ViewerPage | null = null
afterEach(() => {
  page?.close()
  page = null
})

/** MapLibre is stubbed; d3-delaunay is real (the straight-line areas are computed in the page). */
const bundles = () => ['vendor/d3-delaunay-6.0.4/d3-delaunay.min.js', ...pageBundles(html())]
const booted = { ready: (p: ViewerPage) => p.qAll('#categories input').length > 0 }
const checked = (p: ViewerPage) =>
  p.qAll('#categories input').map((el) => (el as HTMLInputElement).checked)

describe.skipIf(!existsSync(dataFile))('nearest-station page (jsdom)', () => {
  test('rail, U-Bahn and S-Bahn by default; trams and ferries opt-in', async () => {
    page = await bootPage(html(), bundles(), '', booted)
    const p = page
    expect(checked(p)).toEqual([true, true, true, false, false])
    expect(p.q('#categories-note').hidden).toBe(true)
    expect(p.errors).toEqual([])
  })
  test('time and distance say that they count every kind of station', async () => {
    page = await bootPage(html(), bundles(), '?mit=bike&zeigen=minutes', booted)
    const p = page
    await p.waitFor(() => !p.q('#categories-note').hidden, 'the note')
    expect(p.q('#categories-note').textContent).toContain('auch Straßenbahn und Fähre')
    expect(p.q<HTMLFieldSetElement>('#categories').disabled).toBe(true)
  })
})
