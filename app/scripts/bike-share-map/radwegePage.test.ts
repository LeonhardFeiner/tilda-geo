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

type Line = { properties: { routeId: string; status: string; plan: string; weg: string } }
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
  test('plan 5/1 along the PAF 25 has no way to release; the Landkreis network is there', () => {
    const ampertshausen = data.lines.features.filter(
      (f) => f.properties.routeId === 'ampertshausen-saulhof-kirchdorf',
    )
    const m = (a: string) =>
      ampertshausen.filter((f) => f.properties.ausbau === a).reduce((s, f) => s + f.properties.m, 0)
    expect(m('kein-weg')).toBeGreaterThan(2000)
    // matched onto the PAF 25 itself: today that is the carriageway of a Kreisstraße
    const onPaf25 = ampertshausen
      .filter((f) => f.properties.weg === 'kreisstrasse')
      .reduce((s, f) => s + f.properties.m, 0)
    expect(onPaf25).toBeGreaterThan(1500)
    expect(m('freigabe')).toBeGreaterThan(500)
    expect(ampertshausen.find((f) => f.properties.ausbau === 'kein-weg')!.properties.status).toBe(
      'kein-schritt',
    )
    const netz = new Set(data.landkreis!.features.map((f) => f.properties.netz))
    expect(netz).toEqual(new Set(['vorrang', 'basis']))
  })
})

describe.skipIf(!existsSync(dataFile))('radwege page (jsdom)', () => {
  test('boots with the short-term plan, the group bar and the latest events', async () => {
    page = await bootPage(html(), [], '', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')
    expect(p.errors).toEqual([])
    // one plan at a time: 5/1 plus the existing paths
    expect(
      shownLines(p).every((f) => f.properties.plan === 'kurz' || f.properties.status === 'bestand'),
    ).toBe(true)
    // only groups with lines in this plan are listed
    expect(p.qAll('#groups button').length).toBeGreaterThanOrEqual(4)
    // plan 5/1 lines without a way to release count as "Neubau nötig"
    expect(p.qAll('#groups [data-group="kein-schritt"]').length).toBe(1)
    expect(p.qAll('#bar button').length).toBeGreaterThanOrEqual(4)
    expect(p.qAll('#recent li').length).toBe(8)
    expect(p.q('#detail').hidden).toBe(true)
  })

  test('the legend filters by group, the switch changes the plan', async () => {
    page = await bootPage(html(), [], '', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')
    const all = shownLines(p).length

    click(p, p.q('#groups [data-group="vor-konzept"]'))
    expect(shownLines(p).length).toBeGreaterThan(0)
    expect(shownLines(p).every((f) => f.properties.status === 'vor-konzept')).toBe(true)
    expect(p.window.location.search).toContain('stand=vor-konzept')
    expect(p.q('#filter-note').hidden).toBe(false)
    click(p, p.q('#groups [data-group="vor-konzept"]'))
    expect(shownLines(p).length).toBe(all)

    const lang = p.q<HTMLInputElement>('input[name=plan][value=lang]')
    lang.checked = true
    lang.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(
      shownLines(p).every((f) => f.properties.plan === 'lang' || f.properties.status === 'bestand'),
    ).toBe(true)
    expect(p.window.location.search).toContain('plan=lang')
    expect(p.q('#line-legend').hidden).toBe(false)
    expect(p.errors).toEqual([])
  })

  test('a route can be hidden, and selecting it replaces the overview with its details', async () => {
    page = await bootPage(html(), [], '', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')

    const row = p.q('#routes [data-route="guentersdorf-noerting"]')
    toggle(p, row.querySelector('input')!)
    expect(shownLines(p).some((f) => f.properties.routeId === 'guentersdorf-noerting')).toBe(false)
    expect(p.window.location.search).toContain('ohne=guentersdorf-noerting')

    click(p, p.q('#routes [data-route="guentersdorf-noerting"] .name'))
    expect(shownLines(p).some((f) => f.properties.routeId === 'guentersdorf-noerting')).toBe(true)
    expect(p.q('#overview').hidden).toBe(true)
    const detail = p.q('#detail')
    expect(detail.hidden).toBe(false)
    expect(detail.textContent).toContain('Güntersdorf – Nörting')
    expect(detail.textContent).toContain('Begonnen vor dem Konzept')
    expect(detail.querySelector('.summary')!.textContent).toContain('2029')
    // newest first, the rest folded away
    expect(p.qAll('#detail > .timeline li').length).toBe(3)
    expect(p.qAll('#detail details .timeline li').length).toBeGreaterThan(3)
    expect(
      p.qAll('#detail a[href^="https://ris.komuna.net/schweitenkirchen/app/sitzungen/"]').length,
    ).toBeGreaterThan(0)
    expect(p.window.location.search).toContain('trasse=guentersdorf-noerting')

    click(p, p.q('#detail-close'))
    expect(p.q('#overview').hidden).toBe(false)
    expect(p.q('#detail').hidden).toBe(true)
    expect(p.window.location.search).not.toContain('trasse=')
    expect(p.errors).toEqual([])
  })

  test('a route from the latest events opens; a long-term-only route switches the plan', async () => {
    page = await bootPage(html(), [], '?trasse=holzhausen-loipersdorf', ready)
    const p = page
    await p.waitFor(() => !p.q('#detail').hidden, 'the detail view')
    expect(p.q<HTMLInputElement>('input[name=plan][value=lang]').checked).toBe(true)
    expect(shownLines(p).some((f) => f.properties.routeId === 'holzhausen-loipersdorf')).toBe(true)
    expect(p.q('#detail').textContent).toContain('Neubau nötig')
    expect(p.q('#detail').textContent).toContain('Kein öffentlicher Vorgang gefunden')

    click(p, p.q('#detail-close'))
    click(p, p.q('#recent a[data-select]'))
    expect(p.q('#detail').hidden).toBe(false)
    expect(p.errors).toEqual([])
  })
  test('the duration view lists started routes oldest first and the ones without a step', async () => {
    page = await bootPage(html(), [], '?ansicht=dauer', ready)
    const p = page
    await p.waitFor(() => p.qAll('#dauer-chart .d-row').length > 0, 'the duration chart')
    expect(p.q('#dauer').hidden).toBe(false)
    const rows = p.qAll('#dauer-chart button.d-row')
    // St 2045 has the oldest documented step (2015); the Waldroute opened within months
    expect(rows[0]!.dataset.select).toBe('st2045-preinersdorf-landkreisgrenze')
    const noerting = rows.find((r) => r.dataset.select === 'guentersdorf-noerting')!
    expect(noerting.textContent).toMatch(/seit [\d,]+ Jahren · angekündigt 2029/)
    expect(noerting.querySelector('.d-plan')).not.toBeNull()
    const wald = rows.find((r) => r.dataset.select === 'pfaffenhofen-schweitenkirchen')!
    expect(wald.textContent).toMatch(/nach \d Monaten eröffnet/)
    expect(p.q('#dauer-chart').textContent).toContain('Ohne dokumentierten Schritt')

    click(p, noerting)
    expect(p.q('#detail').hidden).toBe(false)
    expect(p.window.location.search).toContain('ansicht=dauer')
    click(p, p.q('#dauer-close'))
    expect(p.q('#dauer').hidden).toBe(true)
    expect(p.window.location.search).not.toContain('ansicht=')
    expect(p.errors).toEqual([])
  })
  test('colour by Wegart: the bar and the filter follow the OSM way class', async () => {
    page = await bootPage(html(), [], '', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')
    const weg = p.q<HTMLInputElement>('input[name=farbe][value=weg]')
    weg.checked = true
    weg.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).toContain('farbe=weg')
    expect(p.q('#mode-note').hidden).toBe(false)
    expect(p.qAll('#groups [data-group="kreisstrasse"]').length).toBe(1)
    click(p, p.q('#groups [data-group="kreisstrasse"]'))
    expect(p.window.location.search).toContain('nur=kreisstrasse')
    expect(shownLines(p).length).toBeGreaterThan(0)
    expect(shownLines(p).every((f) => f.properties.weg === 'kreisstrasse')).toBe(true)
    // switching the mode drops the filter
    const belag = p.q<HTMLInputElement>('input[name=farbe][value=belag]')
    belag.checked = true
    belag.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).not.toContain('nur=')
    expect(p.qAll('#groups [data-group="unbekannt"]').length).toBe(1)
    expect(p.errors).toEqual([])
  })
})
