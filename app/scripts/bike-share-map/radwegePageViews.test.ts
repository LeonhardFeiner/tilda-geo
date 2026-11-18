import { existsSync } from 'node:fs'
import { afterEach, describe, expect, test } from 'vitest'
import { click, dataFile, html, ready, shownLines, toggle } from './radwegePageTestHarness'
import { bootPage, type ViewerPage } from './viewerHarness'

/** The Radwege tracker in jsdom, second half: see radwegePageTestHarness.ts for why it is split. */

let page: ViewerPage | null = null
afterEach(() => {
  page?.close()
  page = null
})

describe.skipIf(!existsSync(dataFile))('radwege page views (jsdom)', () => {
  test('a route from the latest events opens; a long-term-only route switches the plan', async () => {
    page = await bootPage(html(), [], '?trasse=holzhausen-loipersdorf', ready)
    const p = page
    await p.waitFor(() => !p.q('#detail').hidden, 'the detail view')
    expect(p.q<HTMLInputElement>('input[name=plan][value=lang]').checked).toBe(true)
    expect(shownLines(p).some((f) => f.properties.routeId === 'holzhausen-loipersdorf')).toBe(true)
    expect(p.q('#detail').textContent).toContain('Aus- oder Neubau nötig')
    expect(p.q('#detail').textContent).toContain('Kein öffentlicher Vorgang gefunden')

    click(p, p.q('#detail-close'))
    click(p, p.q('#recent a[data-select]'))
    expect(p.q('#detail').hidden).toBe(false)
    expect(p.errors).toEqual([])
  })
  test('?seit= lists every event since that date', async () => {
    page = await bootPage(html(), [], '?seit=2025-01-01&planlage=an', ready)
    const p = page
    await p.waitFor(() => p.qAll('#recent li').length > 0, 'the event list')
    expect(p.q<HTMLDetailsElement>('#recent-box').open).toBe(true)
    // a switched-on checking aid opens "Mehr Filter", where it sits
    expect(p.q<HTMLDetailsElement>('#more').open).toBe(true)
    expect(p.q('#recent-title').textContent).toMatch(/^Vorgänge seit dem 01\.01\.2025 \(\d+\)$/)
    const dates = p.qAll('#recent .when').map((e) => e.textContent!.split('.').reverse().join('-'))
    expect(dates.every((d) => d >= '2025')).toBe(true)
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
    expect(noerting.textContent).toMatch(
      /seit [\d,]+ Jahren · letzter Schritt vor \d+ Monaten · angekündigt 2029/,
    )
    // a route whose last step lies years back: pale from then on
    const st = rows.find((r) => r.dataset.select === 'st2045-preinersdorf-landkreisgrenze')!
    expect(st.querySelector('.d-bar')).not.toBeNull()
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
    expect(p.q('#headline').textContent).toContain('Wegart heute laut OpenStreetMap')
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
    // "Was zu tun ist" splits the release by the surface the way keeps
    const bedarf = p.q<HTMLInputElement>('input[name=farbe][value=bedarf]')
    bedarf.checked = true
    bedarf.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.qAll('#groups [data-group="freigabe-asphalt"]').length).toBe(1)
    expect(p.qAll('#groups [data-group="freigabe-unbekannt"]').length).toBe(1)
    expect(p.qAll('#groups [data-group="freigabe"]').length).toBe(0)
    expect(p.errors).toEqual([])
  })
})
