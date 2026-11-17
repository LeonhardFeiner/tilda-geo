import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { RADWEGE_PAGE_STEM } from './constants'
import { loadRadwegeData } from './radwegeData'
import { radwegePageHtml } from './radwegePage'
import { bootPage, type ViewerPage } from './viewerHarness'

/**
 * The Radwege tracker, generated from source, booted in jsdom against the data file the build
 * writes to output/viewer/ (rebuild the viewer after changing radwege/). MapLibre is stubbed, so
 * the tests read what the page hands to the 'radwege' source.
 */

const dataFile = join(import.meta.dirname, 'output', 'viewer', `${RADWEGE_PAGE_STEM}.json`)
const html = () =>
  radwegePageHtml({ dataHref: `./${RADWEGE_PAGE_STEM}.json`, viewerHref: './index.html' })

type Line = { properties: { routeId: string; status: string; plan: string } }
const shownLines = (p: ViewerPage) =>
  (
    p.window as unknown as { __map: { getSource: (id: string) => { data: { features: Line[] } } } }
  ).__map.getSource('radwege').data.features
const ready = { ready: (p: ViewerPage) => p.q('#status').textContent!.includes('Trassen') }
const click = (p: ViewerPage, el: Element) =>
  el.dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }))
const toggle = (p: ViewerPage, input: HTMLInputElement) => {
  input.checked = !input.checked
  input.dispatchEvent(new p.window.Event('change', { bubbles: true }))
}

let page: ViewerPage | null = null
afterEach(() => {
  page?.close()
  page = null
})

describe('radwege data (radwege/routes.json + lines.geojson)', () => {
  const data = loadRadwegeData()
  test('every route has lines, every event a public link', () => {
    for (const r of data.routes) {
      expect(Object.keys(r.km).length, r.id).toBeGreaterThan(0)
      for (const e of r.events) expect(e.url).toMatch(/^https:\/\//)
    }
  })
  test('the Waldroute is built, St 2045 started before the concept, PAF 6 too', () => {
    const group = (id: string) =>
      new Set(
        data.lines.features
          .filter((f) => f.properties.routeId === id)
          .map((f) => f.properties.status),
      )
    expect(group('pfaffenhofen-schweitenkirchen')).toEqual(new Set(['bestand']))
    expect(group('st2045-preinersdorf-landkreisgrenze')).toEqual(new Set(['vor-konzept']))
    expect(group('guentersdorf-noerting')).toEqual(new Set(['vor-konzept']))
  })
})

describe.skipIf(!existsSync(dataFile))('radwege page (jsdom)', () => {
  test('boots, filters by group and route, shows a route with its sources', async () => {
    page = await bootPage(html(), [], '', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')
    expect(p.errors).toEqual([])
    const all = shownLines(p).length
    expect(p.qAll('#routes label').length).toBeGreaterThan(40)

    // Switch off "nur Freigabe": those lines leave the map, the URL keeps the choice
    toggle(p, p.q<HTMLInputElement>('input[name=status][value=nur-freigabe]'))
    expect(shownLines(p).some((f) => f.properties.status === 'nur-freigabe')).toBe(false)
    expect(shownLines(p).length).toBeLessThan(all)
    expect(p.window.location.search).toContain('ohne-stand=nur-freigabe')

    // One route off via its checkbox
    const row = p.q('#routes [data-route="guentersdorf-noerting"]')
    toggle(p, row.querySelector('input')!)
    expect(shownLines(p).some((f) => f.properties.routeId === 'guentersdorf-noerting')).toBe(false)
    expect(p.window.location.search).toContain('ohne=guentersdorf-noerting')

    // Selecting it from the list shows it again, with timeline and RIS links
    click(p, p.q('#routes [data-route="guentersdorf-noerting"] .name'))
    expect(shownLines(p).some((f) => f.properties.routeId === 'guentersdorf-noerting')).toBe(true)
    const detail = p.q('#detail')
    expect(detail.hidden).toBe(false)
    expect(detail.textContent).toContain('Güntersdorf – Nörting')
    expect(detail.textContent).toContain('Begonnen vor dem Konzept')
    expect(p.qAll('#detail .timeline li').length).toBeGreaterThan(5)
    expect(
      p.qAll('#detail a[href^="https://ris.komuna.net/schweitenkirchen/app/sitzungen/"]').length,
    ).toBeGreaterThan(0)
    expect(p.window.location.search).toContain('trasse=guentersdorf-noerting')
    expect(p.errors).toEqual([])
  })

  test('a shared URL restores filters and the selected route', async () => {
    page = await bootPage(html(), [], '?ohne-plan=kurz&trasse=holzhausen-loipersdorf', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')
    expect(shownLines(p).every((f) => f.properties.plan === 'lang')).toBe(true)
    expect(p.q<HTMLInputElement>('input[name=plan][value=kurz]').checked).toBe(false)
    expect(p.q('#detail').textContent).toContain('Kein öffentlicher Schritt dokumentiert')
    expect(p.errors).toEqual([])
  })
})
