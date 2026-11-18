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
const html = () => radwegePageHtml({ dataHref: `./${RADWEGE_PAGE_STEM}.json` })

type Line = {
  properties: {
    routeId: string
    status: string
    plan: string
    weg: string
    kombi: boolean
    innen: boolean
    m: number
  }
}
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
    const keinWeg = ampertshausen.find((f) => f.properties.ausbau === 'kein-weg')!.properties
    expect(keinWeg.status).toBe('nichts')
    expect(keinWeg.bedarf).toBe('neubau')
    expect(data.planlage!.features.length).toBeGreaterThan(100)
    const netz = new Set(data.landkreis!.features.map((f) => f.properties.netz))
    expect(netz).toEqual(new Set(['vorrang', 'basis']))
  })
  test('the Radweg along the St 2045 to Pfaffenhofen is its own route, on the road', () => {
    const st = data.lines.features.filter(
      (f) => f.properties.routeId === 'st2045-pfaffenhofen-schweitenkirchen',
    )
    expect(st.every((f) => f.properties.weg === 'staatsstrasse')).toBe(true)
    expect(st.every((f) => f.properties.plan === 'lang' && f.properties.netz === 'landkreis')).toBe(
      true,
    )
    expect(
      st.every((f) => f.properties.status === 'nichts' && f.properties.bedarf === 'neubau'),
    ).toBe(true)
    // the interim Waldroute does not hide it in the combined view
    expect(st.every((f) => f.properties.kombi)).toBe(true)
  })
  test('spots to check and the side of the road come with the data', () => {
    const grund = new Set(data.pruefen!.features.map((f) => f.properties.grund))
    expect(grund.has('gebaeude')).toBe(true)
    expect(grund.has('kurve')).toBe(true)
    const ids = new Set(data.routes.map((r) => r.id))
    expect(data.pruefen!.features.every((f) => ids.has(f.properties.routeId))).toBe(true)
    // the new path along the St 2045 to Sünzhausen is drawn on one side of the road
    const st = data.lines.features.filter(
      (f) => f.properties.routeId === 'st2045-preinersdorf-landkreisgrenze' && f.properties.seite,
    )
    expect(st.length).toBeGreaterThan(0)
    expect(st.every((f) => f.properties.strasse === 'St 2045')).toBe(true)
  })
  test('combined view takes each stretch once; lines are cut at the Gemeinde boundary', () => {
    const f = data.lines.features
    const km = (fs: typeof f) => fs.reduce((s, x) => s + x.properties.m, 0) / 1000
    const lang = f.filter((x) => x.properties.plan === 'lang')
    const kombi = f.filter((x) => x.properties.kombi)
    // all of plan 5/2 not on a Bestand line is in; plan 5/1 only where 5/2 has nothing
    expect(km(lang.filter((x) => x.properties.kombi))).toBeGreaterThan(km(lang) * 0.7)
    const kurzIn = km(
      kombi.filter((x) => x.properties.plan === 'kurz' && x.properties.status !== 'bestand'),
    )
    const kurzAll = km(
      f.filter((x) => x.properties.plan === 'kurz' && x.properties.status !== 'bestand'),
    )
    expect(kurzIn).toBeLessThan(kurzAll * 0.85)
    expect(kurzIn).toBeGreaterThan(kurzAll * 0.4)
    // the Waldroute to Pfaffenhofen leaves the Gemeinde
    const wald = f.filter((x) => x.properties.routeId === 'pfaffenhofen-schweitenkirchen')
    expect(new Set(wald.map((x) => x.properties.innen))).toEqual(new Set([true, false]))
    // every piece is split cleanly, no slivers
    expect(f.every((x) => x.properties.m >= 1)).toBe(true)
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
    // progress only; what has to be built is a separate split under each group
    expect(p.qAll('#groups [data-group="nichts"]').length).toBe(1)
    expect(p.q('#groups [data-group="nichts"]').textContent).toMatch(
      /davon Neubau [\d,]+ km · Freigabe/,
    )
    expect(p.q('#groups [data-group="vor-konzept"]').textContent).toContain('davon')
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
    // shift-click adds a second group
    p.q('#groups [data-group="nichts"]').dispatchEvent(
      new p.window.MouseEvent('click', { bubbles: true, shiftKey: true }),
    )
    expect(decodeURIComponent(p.window.location.search)).toContain('stand=vor-konzept,nichts')
    expect(new Set(shownLines(p).map((f) => f.properties.status))).toEqual(
      new Set(['vor-konzept', 'nichts']),
    )
    click(p, p.q('#only-reset'))
    expect(shownLines(p).length).toBe(all)

    const lang = p.q<HTMLInputElement>('input[name=plan][value=lang]')
    lang.checked = true
    lang.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(
      shownLines(p).every((f) => f.properties.plan === 'lang' || f.properties.status === 'bestand'),
    ).toBe(true)
    expect(p.window.location.search).toContain('plan=lang')
    expect(p.q('#line-legend').hidden).toBe(false)

    const beide = p.q<HTMLInputElement>('input[name=plan][value=beide]')
    beide.checked = true
    beide.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(shownLines(p).every((f) => f.properties.kombi)).toBe(true)
    expect(new Set(shownLines(p).map((f) => f.properties.plan))).toEqual(new Set(['kurz', 'lang']))
    expect(p.q('#kombi-note').hidden).toBe(false)
    expect(p.window.location.search).toContain('plan=beide')
    expect(p.q('#status').textContent).toMatch(/davon [\d,]+ km innerhalb der Gemeinde/)

    // only the main routes: the switch at the top
    const haupt = p.q<HTMLInputElement>('input[name=netz][value=haupt]')
    haupt.checked = true
    haupt.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).toContain('netz=haupt')
    const nets = new Set(shownLines(p).map((f) => (f.properties as { netz?: string }).netz))
    expect(nets.has('ergaenzend')).toBe(false)
    expect(nets.has('haupt')).toBe(true)
    // aerial images as background
    const luft = p.q<HTMLInputElement>('input[name=bg][value=luftbild]')
    luft.checked = true
    luft.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).toContain('hintergrund=luftbild')
    // the fuller choice is on the right
    expect(p.qAll('input[name=netz]').map((i) => (i as HTMLInputElement).value)).toEqual([
      'haupt',
      'ergaenzend',
      'alle',
    ])
    const erg = p.q<HTMLInputElement>('input[name=netz][value=ergaenzend]')
    erg.checked = true
    erg.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    const nets2 = new Set(shownLines(p).map((f) => (f.properties as { netz?: string }).netz))
    expect(nets2.has('haupt')).toBe(false)
    expect(nets2.has('ergaenzend')).toBe(true)
    // the spots to check can be switched on
    toggle(p, p.q<HTMLInputElement>('#pr-toggle'))
    expect(p.window.location.search).toContain('pruefen=an')
    expect(Number(p.q('#pr-count').textContent)).toBeGreaterThan(0)

    toggle(p, p.q<HTMLInputElement>('#innen-toggle'))
    expect(shownLines(p).every((f) => f.properties.innen)).toBe(true)
    expect(p.window.location.search).toContain('gemeinde=innen')
    expect(p.q('#status').textContent).toMatch(/km innerhalb der Gemeinde\.$/)
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
    expect(wald.textContent).toMatch(/nach [\d,]+ (Monaten|Jahren?) eröffnet/)
    expect(p.q('#dauer-chart').textContent).toContain('Ohne dokumentierten Schritt')
    expect(p.q('#dauer-chart').textContent).toContain('Quellenlage')
    expect(wald.textContent).toContain('Übergangslösung')

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
    // the plan geometry as drawn can be switched on
    const pl = p.q<HTMLInputElement>('#pl-toggle')
    toggle(p, pl)
    expect(p.window.location.search).toContain('planlage=an')
    // switching the mode drops the filter
    const belag = p.q<HTMLInputElement>('input[name=farbe][value=belag]')
    belag.checked = true
    belag.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).not.toContain('nur=')
    expect(p.qAll('#groups [data-group="unbekannt"]').length).toBe(1)
    expect(p.errors).toEqual([])
  })
})
