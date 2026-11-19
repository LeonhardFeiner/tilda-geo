import { existsSync } from 'node:fs'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { afterEach, describe, expect, test } from 'vitest'
import { loadRadwegeData } from './radwegeData'
import { click, dataFile, html, ready, shownLines, toggle } from './radwegePageTestHarness'
import { bootPage, type ViewerPage } from './viewerHarness'

/**
 * The Radwege tracker, generated from source, booted in jsdom against the data file the build
 * writes to output/viewer/ (rebuild the viewer after changing radwege/). MapLibre is stubbed, so
 * the tests read what the page hands to the 'radwege' source.
 */

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
  test('the Waldroute is built; St 2045 and PAF 6 have steps since the concept', () => {
    const group = (id: string) =>
      new Set(
        data.lines.features
          .filter((f) => f.properties.routeId === id)
          .map((f) => f.properties.status),
      )
    expect(group('pfaffenhofen-schweitenkirchen')).toEqual(new Set(['bestand']))
    expect(group('st2045-preinersdorf-landkreisgrenze')).toEqual(new Set(['seit-konzept']))
    expect(group('guentersdorf-noerting')).toEqual(new Set(['seit-konzept']))
    // a deferral in 2019 is no step; a listing in the Landkreis's KUS is an announcement
    expect(group('preinersdorf-st2045')).toEqual(new Set(['nichts']))
    expect(group('giegenhausen-schweitenkirchen')).toEqual(new Set(['nichts']))
    expect(group('winden-niederthann')).toEqual(new Set(['nichts']))
    expect(data.korrekturen!.length).toBeGreaterThan(0)
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
    // the plan changes the side of the PAF 6 at Güntersdorf: a crossing there
    const q = data.querungen!.features.filter((f) =>
      f.properties.routeIds.includes('guentersdorf-noerting'),
    )
    expect(
      q.some((f) => f.properties.strasse === 'PAF 6' && f.properties.ort === 'Güntersdorf'),
    ).toBe(true)
    const ids = new Set(data.routes.map((r) => r.id))
    expect(data.pruefen!.features.every((f) => ids.has(f.properties.routeId))).toBe(true)
    // the new path along the St 2045 to Sünzhausen is drawn on one side of the road
    const st = data.lines.features.filter(
      (f) => f.properties.routeId === 'st2045-preinersdorf-landkreisgrenze' && f.properties.seite,
    )
    expect(st.length).toBeGreaterThan(0)
    expect(st.every((f) => f.properties.strasse === 'St 2045')).toBe(true)
  })
  test('combined view with a Trassen filter: a route ergänzend in 5/2 keeps its 5/1 Haupt line', () => {
    // Dietersdorf–Schweitenkirchen: Haupttrasse in 5/1, ergänzend in 5/2. "Beide" + "nur Haupt"
    // must not drop the 5/1 line for a 5/2 line that filter hides.
    const ds = data.lines.features.filter(
      (x) => x.properties.routeId === 'dietersdorf-schweitenkirchen',
    )
    const km = (fs: typeof ds) => fs.reduce((s, x) => s + x.properties.m, 0) / 1000
    const kurz = ds.filter((x) => x.properties.plan === 'kurz')
    expect(km(kurz.filter((x) => !x.properties.kombi))).toBeGreaterThan(1)
    expect(km(kurz.filter((x) => x.properties.kombiHaupt))).toBeCloseTo(km(kurz), 1)
    expect(kurz.every((x) => x.properties.kombiErgaenzend === x.properties.kombi)).toBe(true)
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
      /davon Aus-\/Neubau [\d,]+\skm · Freigabe/,
    )
    expect(p.q('#groups [data-group="vor-konzept"]').textContent).toContain('davon')
    // km only; the shares are in the bar
    expect(p.q('#groups [data-group="nichts"]').textContent).toMatch(/[\d,]+\skm$/)
    expect(p.q('#groups').textContent).not.toContain('%')
    expect(p.q('#status').textContent).toBe('')
    // the total, the plan and the scope are said above the bar; numbers stop at the boundary
    expect(p.q('#headline').textContent).toMatch(
      /^[\d,]+\skm in \d+ Trassen .*Lageplan 5\/1.*innerhalb der Gemeinde/,
    )
    expect(shownLines(p).every((f) => f.properties.innen)).toBe(true)
    // the interim Waldroute is said apart from the real paths
    expect(p.q('#groups [data-group="bestand"]').textContent).toContain('Übergangslösung')
    // who made the page, and where to report errors
    expect(p.q('#about').textContent).toContain('BFS/SPD/Grüne')
    expect(p.q('#korrekturen').hidden).toBe(false)
    // every event since the concept on request
    // foldable, open on a desktop; the title says how fresh the list is
    expect(p.q<HTMLDetailsElement>('#recent-box').open).toBe(true)
    expect(p.q('#recent-title').textContent).toMatch(
      /^Neueste Vorgänge \(zuletzt \d\d\.\d\d\.\d{4}\)$/,
    )
    click(p, p.q('#recent-more'))
    expect(p.window.location.search).toContain('seit=2024-06-07')
    expect(p.qAll('#recent li').length).toBeGreaterThan(8)
    click(p, p.q('#recent-more'))
    expect(p.qAll('#recent li').length).toBe(8)
    expect(p.qAll('#bar button').length).toBeGreaterThanOrEqual(4)
    expect(p.qAll('#recent li').length).toBe(8)
    expect(p.q('#detail').hidden).toBe(true)
  })

  test('every layer the page adds is valid MapLibre style', async () => {
    // the map stub accepts anything; MapLibre drops an invalid layer with only a console error
    page = await bootPage(html(), [], '', ready)
    const p = page
    await p.waitFor(() => shownLines(p).length > 0, 'the lines on the map')
    const st = (
      p.window as unknown as {
        __map: {
          getStyle: () => {
            layers: { id: string }[]
            sources: Record<string, Record<string, unknown>>
          }
        }
      }
    ).__map.getStyle()
    const sources = Object.fromEntries(
      Object.entries(st.sources).map(([id, src]) => {
        const { setData: _s, data: _d, ...rest } = src
        return [
          id,
          rest.type === 'geojson'
            ? { ...rest, data: { type: 'FeatureCollection', features: [] } }
            : rest,
        ]
      }),
    )
    const style = { version: 8, sources, layers: JSON.parse(JSON.stringify(st.layers)) }
    const errors = validateStyleMin(style as Parameters<typeof validateStyleMin>[0]).map(
      (e) => e.message,
    )
    expect(errors).toEqual([])
    expect(st.layers.map((l) => l.id)).toEqual(
      expect.arrayContaining(['landkreis', 'luftbild', 'radwege-solid', 'pruefen', 'querungen']),
    )
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

    // the Landkreis network is drawn on plan 5/2 only: off with 5/1 unless switched on
    const lk = p.q<HTMLInputElement>('#lk-toggle')
    expect(lk.checked).toBe(false)
    toggle(p, lk)
    expect(p.window.location.search).toContain('landkreis=an')
    const lang = p.q<HTMLInputElement>('input[name=plan][value=lang]')
    lang.checked = true
    lang.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(lk.checked).toBe(true)
    expect(p.window.location.search).not.toContain('landkreis=')
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
    expect(p.q('#howto').textContent).toContain('aus Plan 5/1 kommt nur hinzu')
    expect(p.window.location.search).toContain('plan=beide')
    expect(p.q('#headline').textContent).toMatch(/in beiden Plänen.*innerhalb der Gemeinde:$/)

    // only the main routes: the switch at the top
    const haupt = p.q<HTMLInputElement>('input[name=netz][value=haupt]')
    haupt.checked = true
    haupt.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).toContain('netz=haupt')
    const nets = new Set(shownLines(p).map((f) => (f.properties as { netz?: string }).netz))
    expect(nets.has('ergaenzend')).toBe(false)
    expect(nets.has('haupt')).toBe(true)
    // aerial images as background
    const luft = p.q<HTMLInputElement>('input[name=view][value=luftbild]')
    luft.checked = true
    luft.dispatchEvent(new p.window.Event('change', { bubbles: true }))
    expect(p.window.location.search).toContain('ansicht=luftbild')
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

    // also the parts outside the Gemeinde
    toggle(p, p.q<HTMLInputElement>('#innen-toggle'))
    expect(shownLines(p).some((f) => !f.properties.innen)).toBe(true)
    expect(p.window.location.search).toContain('gemeinde=alle')
    expect(p.q('#headline').textContent).toMatch(
      /außerhalb der Gemeinde \(davon [\d,]+\skm innerhalb\)/,
    )
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
    expect(detail.textContent).toContain('Schritte seit dem Konzept')
    const summary = detail.querySelector('.summary')!.textContent!
    expect(summary).toContain('2029')
    expect(summary).toMatch(/Letzter dokumentierter Schritt: 22\.01\.2026 \(Grunderwerb\)/)
    expect(summary).toContain('Grunderwerb: Gemeinde')
    // keyboard focus moves into the details and back
    expect(p.window.document.activeElement).toBe(detail.querySelector('h2'))
    // newest first, the rest folded away
    expect(p.qAll('#detail > .timeline li').length).toBe(3)
    expect(p.qAll('#detail details .timeline li').length).toBeGreaterThan(3)
    expect(
      p.qAll('#detail a[href^="https://ris.komuna.net/schweitenkirchen/app/sitzungen/"]').length,
    ).toBeGreaterThan(0)
    expect(p.window.location.search).toContain('trasse=guentersdorf-noerting')

    p.q<HTMLButtonElement>('#detail-close').focus()
    click(p, p.q('#detail-close'))
    expect(p.q('#overview').hidden).toBe(false)
    expect(p.q('#detail').hidden).toBe(true)
    expect(p.window.location.search).not.toContain('trasse=')
    // back to a control for that route in the overview, not to the top of the page
    expect(p.q('#overview').contains(p.window.document.activeElement)).toBe(true)

    // on the map: a click selects the route under it, a second click on it closes it again
    const map = (
      p.window as unknown as {
        __map: Record<string, unknown> & { fire: (t: string, e?: object) => void }
      }
    ).__map
    const under = (id: string) => {
      map.queryRenderedFeatures = () => [{ properties: { routeId: id } }]
    }
    const clickMap = () => map.fire('click', { point: { x: 100, y: 100 } })
    under('guentersdorf-noerting')
    clickMap()
    expect(p.q('#detail').hidden).toBe(false)
    clickMap()
    expect(p.q('#detail').hidden).toBe(true)
    expect(p.window.location.search).not.toContain('trasse=')
    // another route under the click switches to it
    clickMap()
    under('oberthann-guentersdorf')
    clickMap()
    expect(p.window.location.search).toContain('trasse=oberthann-guentersdorf')
    expect(p.errors).toEqual([])
  })
})
