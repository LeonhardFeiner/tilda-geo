import { afterEach, describe, expect, test } from 'vitest'
import { pointInRegion } from './overlayHighlightClip'
import { bootViewer, type ViewerPage } from './viewerHarness'

/**
 * The viewer page, generated from the current source, booted for real in jsdom — see viewerHarness.ts.
 * generateViewerHtml.test.ts proves the inline script *parses*; this proves it *runs*: the page
 * loads its data, fills the ranking, and the selection / navigation / share flows work, with no
 * uncaught error. A blank live site (twice so far) would fail here, before a push.
 */

const SCHWEITENKIRCHEN = 'relation/396557'
// Landkreis Pfaffenhofen an der Ilm in Bayern, its Gemeinden, Schweitenkirchen selected.
const IN_LANDKREIS = `?gebiet=relation/2145268&untergebiet=lk:relation/62371&darstellung=gemeinden&region=${SCHWEITENKIRCHEN}`
const TIMEOUT = 90_000

let page: ViewerPage | null = null
afterEach(() => {
  page?.close()
  page = null
})

const names = (p: ViewerPage) =>
  p.qAll('#ranking-list li[data-ranking-id] .ranking-name').map((el) => el.textContent)

describe('viewer smoke test (page from source, jsdom)', () => {
  test(
    'boots, lists regions and shows the national context without errors',
    async () => {
      page = await bootViewer()
      expect(page.errors).toEqual([])
      expect(page.qAll('#ranking-list li[data-ranking-id]').length).toBeGreaterThan(10)
      expect(page.q('#national-context').textContent).toMatch(
        /Bundesweit: \d+,\d[  ]km je 100[  ]km Straße/,
      )
      expect(page.q('#region-breadcrumb').textContent).toContain('Deutschland')
    },
    TIMEOUT,
  )

  test(
    'the landing page draws from stats-core alone and loads the Gemeinden right after',
    async () => {
      page = await bootViewer()
      const p = page
      const core = p.window.__fetches.findIndex((url) => url.startsWith('stats-core.msgpack'))
      await p.waitFor(
        () => p.window.__fetches.some((url) => url.startsWith('stats-gemeinden.msgpack')),
        'the stats-gemeinden fetch',
      )
      const gemeinden = p.window.__fetches.findIndex((url) =>
        url.startsWith('stats-gemeinden.msgpack'),
      )
      expect(core).toBeGreaterThanOrEqual(0)
      expect(gemeinden).toBeGreaterThan(core)
      // A Gemeinde view after that has its regions.
      const select = p.q<HTMLSelectElement>('#darstellung-select')
      await p.waitFor(
        () =>
          [...select.options].some(
            (o) => o.value === 'gemeinden_kreisfrei' || o.value === 'gemeinden',
          ),
        'a Gemeinden option',
      )
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a Gemeindeverbände view loads the extra stats pack and ranks its regions',
    async () => {
      page = await bootViewer(
        '?gebiet=relation/2145268&untergebiet=lk:relation/62371&darstellung=gemeindeverbaende',
      )
      const p = page
      await p.waitFor(
        () => p.window.__fetches.some((url) => url.startsWith('stats-extra.msgpack')),
        'the stats-extra fetch',
      )
      await p.waitFor(() => names(p).length > 0, 'a ranked Gemeindeverband')
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'busy roads (verkehr=1) load as a layer, and clicking one explains it instead of selecting',
    async () => {
      page = await bootViewer(`${IN_LANDKREIS}&verkehr=1`)
      const { window } = page
      type StubMap = {
        getLayer(id: string): unknown
        queryRenderedFeatures: (p: unknown, o?: { layers?: string[] }) => unknown[]
        fire(type: string, e: unknown): void
      }
      const w = window as unknown as { __map: StubMap; __popup?: HTMLElement; __fetches: string[] }
      await page.waitFor(() => !!w.__map.getLayer('busy-roads'), 'the busy-roads layer')
      expect(w.__fetches.some((f) => f.includes('busy-roads.geojson'))).toBe(true)
      expect(page.q<HTMLInputElement>('#toggle-busy-roads').checked).toBe(true)
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')

      w.__map.queryRenderedFeatures = (_p, o) =>
        o?.layers?.[0] === 'busy-roads'
          ? [
              {
                properties: {
                  strasse: 'K PAF 9',
                  anfang: 'St 2232',
                  ende: 'Geisenhausen',
                  dtv: 3158,
                  maxspeed: 100,
                  covered: false,
                  coveredPct: 0,
                  link: 'https://www.baysis.bayern.de/',
                },
              },
            ]
          : []
      w.__map.fire('click', {
        point: { x: 10, y: 10 },
        lngLat: { lng: 11.6, lat: 48.5 },
        originalEvent: { detail: 1 },
      })
      const text = w.__popup?.textContent ?? ''
      expect(text).toContain('K PAF 9')
      expect(text).toContain('3.158 Kfz pro Tag')
      expect(text).toContain('ohne Radweg')
      expect(text).toContain('ab 2.500 Kfz/Tag')
      // The click went to the road, not to the region below: the card stays open.
      expect(window.document.body.dataset.regionDetail).toBe('1')
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a Landkreis shows the model gap summed over its Gemeinden',
    async () => {
      // Bayern by Landkreise, Landkreis Pfaffenhofen selected.
      page = await bootViewer(
        '?gebiet=relation/2145268&darstellung=landkreis_kreisfrei&region=relation/62371',
      )
      const { window } = page
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      await page.waitFor(
        () => !page!.q('#region-detail-model-gap').hidden,
        'the model gap callout for the Landkreis',
      )
      const text = page.q('#region-detail-model-gap').textContent ?? ''
      expect(text).toMatch(/aus den erwarteten Kilometern von \d+ Gemeinden/)
      expect(text).toMatch(/Erwartet: \d+,\d[  ]km je 100[  ]km/)
      // A Kreis mixes RegioStaR types: the breakdown names none.
      expect(text).toContain('Raumtyp (RegioStaR)gemischt')
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'the "Mehr Zahlen" title names only what the region has; the model map opens it',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      const summary = () => page!.q('#region-detail-more-summary').textContent ?? ''
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      await page.waitFor(() => summary().includes('Erwartungswert'), 'the model gap in the title')
      expect((page.q('#region-detail-more') as HTMLDetailsElement).open).toBe(false)
      page.close()

      // Bayern itself has no model value (the Land fixed effects make it zero by construction).
      page = await bootViewer('?darstellung=bundeslaender&region=relation/2145268')
      await page.waitFor(
        () => page!.window.document.body.dataset.regionDetail === '1',
        'the Land card',
      )
      expect(summary()).toMatch(/^Mehr Zahlen: .*Aufschlüsselung$/)
      expect(summary()).not.toContain('Erwartungswert')
      page.close()

      page = await bootViewer(IN_LANDKREIS + '&metrik=modelGap')
      await page.waitFor(
        () => (page!.q('#region-detail-more') as HTMLDetailsElement).open,
        'the fold opened for the model map',
      )
      expect(page.q('#region-detail-model-gap').hidden).toBe(false)
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'every map mode colours the regions, ranks them and labels the legend without errors',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      const select = page.q('#map-metric-select') as HTMLSelectElement
      const values = [...select.options].map((o) => o.value)
      expect(values).toEqual(
        expect.arrayContaining(['mappingDepth', 'busyFederalCovered', 'density', 'stationBike']),
      )
      expect(page.qAll('#map-metric-select optgroup').length).toBe(3)
      const title = () => page!.q('#choropleth-legend-title').textContent
      const seen = new Set<string | null>()
      for (const metric of values.filter((v) => v !== 'bikeShare')) {
        const before = title()
        seen.add(before)
        select.value = metric
        select.dispatchEvent(new window.Event('change'))
        await page.waitFor(
          () => title() !== before && page!.qAll('#ranking-list li[data-ranking-id]').length > 0,
          'the legend and ranking for ' + metric,
        )
        expect(seen.has(title()), metric + ' has a legend title of its own').toBe(false)
        const legend = page.q('#legend-labels').textContent ?? ''
        expect(legend, metric).not.toMatch(/NaN|undefined|Infinity/)
        expect(page.q('#cml-min').textContent, metric).not.toMatch(/NaN|undefined/)
        const firstAria = page.q('#ranking-list li[data-ranking-id]').getAttribute('aria-label')
        expect(firstAria, metric).not.toMatch(/keine Daten|NaN|undefined/)
      }
      // Rank 1 on the bike-to-station map is the shortest ride.
      select.value = 'stationBike'
      select.dispatchEvent(new window.Event('change'))
      await page.waitFor(
        () =>
          title() === 'Flächenfarbe (Mit dem Rad zum Bahnhalt)' &&
          /min mit dem Rad/.test(
            page!.q('#ranking-list li[data-ranking-id]')?.getAttribute('aria-label') ?? '',
          ),
        'the stationBike ranking',
      )
      const minutes = page
        .qAll('#ranking-list li[data-ranking-id]')
        .map((li) =>
          Number(/([\d,]+) min/.exec(li.getAttribute('aria-label') ?? '')?.[1]?.replace(',', '.')),
        )
        .filter((v) => Number.isFinite(v))
      expect(minutes.length).toBeGreaterThan(1)
      expect(minutes[0]!).toBeLessThanOrEqual(minutes.at(-1)!)
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'Mehr Zahlen lists age, ownership and building age with bars, and the RegioStaR type without',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      const more = page.q('#region-detail-more') as HTMLDetailsElement
      more.open = true
      more.dispatchEvent(new window.Event('toggle'))
      const rowOf = (label: string) =>
        page!
          .qAll('#region-detail-extra .ctx-row')
          .find((row) => row.querySelector('.ctx-label')?.textContent?.startsWith(label))
      await page.waitFor(() => !!rowOf('Raumtyp'), 'the RegioStaR row')
      // RegioStaR comes with the model inputs; the Deutschlandatlas only with the fold.
      await page.waitFor(() => !!rowOf('Steuereinnahmekraft'), 'the Deutschlandatlas rows')

      const type = rowOf('Raumtyp')!
      // Schweitenkirchen: a village in the Munich region (RegioStaR 74).
      expect(type.querySelector('.ctx-value')?.textContent).toBe(
        'Stadtregion – Kleinstädtischer, dörflicher Raum',
      )
      expect(type.querySelector('.ctx-track')).toBeNull()
      expect(type.classList.contains('ctx-row--plot')).toBe(false)
      for (const label of ['Ältere', 'Eigentümerquote', 'Wohnungen in Neubauten']) {
        const row = rowOf(label)
        expect(row, label).toBeDefined()
        expect(row!.querySelector('.ctx-value')?.textContent).toMatch(/^\d+,\d %/)
        expect(row!.querySelector('.ctx-track'), label).not.toBeNull()
      }
      // Deutschlandatlas rows (Schweitenkirchen: 2.465 €/Einw., +1,17 %/Jahr, 5 min, 27,7 km).
      const value = (label: string) =>
        rowOf(label)?.querySelector('.ctx-value')?.firstChild?.textContent
      expect(value('Steuereinnahmekraft')).toBe('2.465 €')
      expect(value('Bevölkerungsentwicklung')).toBe('+1,17 % pro Jahr')
      expect(value('Fahrzeit zur Grundschule')).toBe('5 min')
      expect(value('Ø Pendeldistanz')).toBe('27,7 km')
      // Rows come in groups, each under its heading, in the order of CONTEXT_METRIC_GROUPS.
      const headings = page.qAll('#region-detail-extra .ctx-group').map((h) => h.textContent)
      expect(headings).toEqual([
        'Datenlage',
        'Vielbefahrene Straßen',
        'Bevölkerung & Lage',
        'Wohnen',
        'Arbeit, Pendeln & Finanzen',
        'Verkehr & Sicherheit',
        'Erreichbarkeit',
        'Gelände',
      ])
      const after = (heading: string) => {
        const h = page!
          .qAll('#region-detail-extra .ctx-group')
          .find((x) => x.textContent === heading)
        return h?.nextElementSibling?.querySelector('.ctx-label')?.textContent
      }
      expect(after('Wohnen')).toMatch(/^Ø Nettokaltmiete/)
      expect(after('Gelände')).toMatch(/^Höhenlage/)
      // Within a group, the order of its keys: job centrality before the tax revenue.
      expect(after('Arbeit, Pendeln & Finanzen')).toMatch(/^Arbeitsplatzzentralität/)
      // The type is a model input too: its own row in the breakdown.
      expect(page.q('#region-detail-model-gap').textContent).toContain(
        'Raumtyp (RegioStaR)Stadtregion – Kleinstädtischer, dörflicher Raum',
      )
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'the context switch "Wichtigste | Alle" folds the extra rows and sits above them',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      const more = page.q('#region-detail-more') as HTMLDetailsElement
      more.open = true
      more.dispatchEvent(new window.Event('toggle'))
      const visibleRows = () =>
        page!.qAll('#region-detail-extra .ctx-row').filter((row) => !row.hidden).length
      const buttons = () => page!.qAll('#region-detail-extra .ctx-scope-toggle .detail-mode-btn')
      await page.waitFor(() => buttons().length === 2, 'the context switch')
      // The Deutschlandatlas rows come with the fold, a moment later.
      await page.waitFor(
        () =>
          page!
            .qAll('#region-detail-extra .ctx-label')
            .some((l) => l.textContent?.startsWith('Steuereinnahmekraft')),
        'the Deutschlandatlas rows',
      )
      const allRows = page.qAll('#region-detail-extra .ctx-row').length
      expect(buttons().map((b) => b.textContent)).toEqual(['Wichtigste', `Alle (${allRows})`])
      expect(buttons()[0]!.getAttribute('aria-pressed')).toBe('true')
      const coreRows = visibleRows()
      expect(coreRows).toBeLessThan(allRows)
      // Above the first row, not below the list like the old button.
      const toggle = page.q('#region-detail-extra .ctx-scope-toggle')
      const firstRow = page.q('#region-detail-extra .ctx-row')
      expect(
        toggle.compareDocumentPosition(firstRow) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()

      buttons()[1]!.click()
      expect(visibleRows()).toBe(allRows)
      expect(buttons()[1]!.getAttribute('aria-pressed')).toBe('true')
      expect(window.document.activeElement).toBe(buttons()[1])
      buttons()[0]!.click()
      expect(visibleRows()).toBe(coreRows)

      // The PDF is the full data sheet: every row, whatever the switch says, and no switch.
      page.q('#export-item-pdf').click()
      const umfeld = () =>
        page!
          .qAll('#print-sheet .ps-section')
          .find((s) => s.querySelector('h2')?.textContent === 'Umfeld')
      await page.waitFor(() => !!umfeld(), 'the printed Umfeld section')
      expect(umfeld()!.querySelectorAll('.ctx-row').length).toBe(allRows)
      expect(umfeld()!.querySelector('.detail-mode, [hidden]')).toBeNull()
      expect(umfeld()!.querySelectorAll('.ctx-group').length).toBe(
        page.qAll('#region-detail-extra .ctx-group').length,
      )
      // jsdom has no canvas and no createObjectURL: the map picture and plot rasters fail there.
      const jsdomGaps = /print map TypeError: .*drawImage|createObjectURL is not a function/
      expect(page.errors.filter((e) => !jsdomGaps.test(e))).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'clicking a street row highlights that street type, in both breakdowns',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      const rowsOf = (title: string) =>
        page!
          .qAll('#region-detail-body .region-detail-section')
          .find((sec) => sec.querySelector('h4')?.textContent === title)
          ?.querySelectorAll<HTMLElement>('li.region-detail-row-clickable') ?? []
      const map = (window as unknown as { __map: { getLayer(id: string): unknown } }).__map

      const [byClass] = rowsOf('Straßen nach Klasse')
      expect(byClass).toBeDefined()
      byClass!.click()
      expect(byClass!.classList.contains('region-detail-row-active')).toBe(true)
      expect(page.q<HTMLInputElement>('#toggle-roads').checked).toBe(true)
      expect(map.getLayer('roads-highlight-lines')).toBeDefined()

      const detailBtn = page
        .qAll('#region-detail-body .detail-mode-btn')
        .find((b) => b.textContent === 'Detailliert')!
      detailBtn.click()
      await page.waitFor(() => rowsOf('Straßen nach Typ').length > 0, 'the detailed street rows')
      const [byTag] = rowsOf('Straßen nach Typ')
      byTag!.click()
      expect(byTag!.dataset.highlightKind).toBe('road-tag')
      expect(byTag!.classList.contains('region-detail-row-active')).toBe(true)
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'the street pulse also shows the inside part of streets that cross the region border',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      type Fc = {
        type: 'FeatureCollection'
        features: { geometry: { coordinates: number[][][] } }[]
      }
      type StubMap = {
        getLayer(id: string): unknown
        getSource(id: string): { data: Fc } | undefined
        querySourceFeatures: (source: string, params: unknown) => unknown[]
        fire(type: string, event?: object): void
      }
      const map = (window as unknown as { __map: StubMap }).__map
      // The selected Gemeinde's polygon, as the page drew it for the selection outline.
      const region = map.getSource('regions-selected')!.data.features[0]!.geometry as unknown as {
        type: string
        coordinates: number[][][] | number[][][][]
      }
      const ring = (
        region.type === 'Polygon' ? region.coordinates[0] : region.coordinates[0]![0]
      ) as number[][]
      const lons = ring.map((p) => p[0]!)
      const lats = ring.map((p) => p[1]!)
      const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
      const rings = (
        region.type === 'Polygon'
          ? region.coordinates
          : (region.coordinates as number[][][][]).flat()
      ) as [number, number][][]
      let inside: [number, number] | null = null
      for (let i = 1; i < 40 && !inside; i++) {
        for (let j = 1; j < 40 && !inside; j++) {
          const p: [number, number] = [
            bbox[0]! + ((bbox[2]! - bbox[0]!) * i) / 40,
            bbox[1]! + ((bbox[3]! - bbox[1]!) * j) / 40,
          ]
          if (pointInRegion(p, rings)) inside = p
        }
      }
      expect(inside).not.toBeNull()
      // A street from inside the Gemeinde to well beyond its bbox: counted with its inside share,
      // and MapLibre's `within` would drop it entirely.
      // The z10 tile the inside point lies in: the pieces are cut back to its bounds.
      const z = 10
      const tileX = Math.floor(((inside![0] + 180) / 360) * 2 ** z)
      const latRad = (inside![1] * Math.PI) / 180
      const tileY = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
      )
      const queries: unknown[] = []
      map.querySourceFeatures = (source, params) => {
        queries.push([source, params])
        return [
          {
            geometry: { type: 'LineString', coordinates: [inside, [bbox[2]! + 0.5, inside![1]]] },
            properties: { road: 'residential' },
            _vectorTileFeature: { _z: z, _x: tileX, _y: tileY },
          },
        ]
      }

      const rows = page
        .qAll('#region-detail-body .region-detail-section')
        .find((sec) => sec.querySelector('h4')?.textContent === 'Straßen nach Klasse')!
        .querySelectorAll<HTMLElement>('li.region-detail-row-clickable')
      rows[0]!.click()
      expect(queries).toHaveLength(1)
      expect((queries[0] as [string, { sourceLayer: string; filter: unknown }])[0]).toBe('roads')
      expect(
        (queries[0] as [string, { sourceLayer: string; filter: unknown }])[1].sourceLayer,
      ).toBe('roads')
      expect(map.getLayer('roads-highlight-clipped-lines')).toBeDefined()
      const clipped = map.getSource('roads-highlight-clipped')!
      expect(clipped.data.features).toHaveLength(1)
      for (const piece of clipped.data.features[0]!.geometry.coordinates) {
        expect(piece.length).toBeGreaterThanOrEqual(2)
        for (const [lon, lat] of piece as [number, number][]) {
          // Every drawn point lies in the region's bbox (the far end at bbox[2] + 0.5 is gone).
          expect(lon).toBeLessThanOrEqual(bbox[2]! + 1e-9)
          expect(lat).toBeLessThanOrEqual(bbox[3]! + 1e-9)
          expect(lat).toBeGreaterThanOrEqual(bbox[1]! - 1e-9)
        }
      }

      // Tiles arriving or a pan during the pulse re-read the tiles (debounced).
      map.fire('moveend')
      await page.waitFor(() => queries.length === 2, 'a second tile read after moveend')
      map.fire('sourcedata', { sourceId: 'bikelanes', tile: {} })
      map.fire('sourcedata', { sourceId: 'roads', tile: {} })
      await page.waitFor(() => queries.length === 3, 'a tile read after roads tiles loaded')

      // When the pulse ends the clipped pieces go away too.
      await page.waitFor(() => clipped.data.features.length === 0, 'the pulse to end', 10_000)
      expect(rows[0]!.classList.contains('region-detail-row-active')).toBe(false)
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'searching a Gemeinde selects it, opens its card and shows the whole area',
    async () => {
      page = await bootViewer()
      const { window } = page
      const input = page.q<HTMLInputElement>('#region-search-input')
      input.value = 'Schweitenkirchen'
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      await page.waitFor(
        () =>
          page!
            .qAll('#region-search-results li')
            .some((li) => /Schweitenkirchen/.test(li.textContent ?? '')),
        'a search result for Schweitenkirchen',
      )
      const result = page
        .qAll('#region-search-results li')
        .find((li) => /Schweitenkirchen/.test(li.textContent ?? ''))!
      result.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
      result.click()
      await page.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')

      expect(page.q('#region-detail-title').textContent).toBe('Schweitenkirchen')
      // The ranking now shows the Landkreis's Gemeinden, with the selection marked.
      await page.waitFor(
        () => page!.qAll('#ranking-list li.ranking-row-selected').length === 1,
        'the marked row',
      )
      expect(page.q('#ranking-list li.ranking-row-selected .ranking-name').textContent).toBe(
        'Schweitenkirchen',
      )
      // Searching shows the area; it must not zoom into the Gemeinde (the old behaviour fit it at max zoom 12).
      expect(page.cameraCalls().some((c) => c.startsWith('fitBounds'))).toBe(true)
      expect(page.cameraCalls().some((c) => / max12\b/.test(c))).toBe(false)
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a selection survives going up a level and is carried by the area that contains it',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(
        () => window.document.body.dataset.regionDetail === '1',
        'the region card from the URL',
      )
      expect(names(page)).toContain('Schweitenkirchen')

      const crumbs = page.qAll('#region-breadcrumb a, #region-breadcrumb button')
      crumbs[crumbs.length - 2]!.click() // one level up: Bayern
      await page.waitFor(
        () => page!.qAll('#ranking-list .ranking-focus-note').length === 1,
        'the container row note',
      )

      expect(page.q('#ranking-list .ranking-focus-note').textContent).toBe(
        'enthält Schweitenkirchen',
      )
      // Still the focus: the card stays, and the map re-fits to the wider area.
      expect(window.document.body.dataset.regionDetail).toBe('1')
      expect(page.q('#region-detail-title').textContent).toBe('Schweitenkirchen')
      expect(page.cameraCalls().at(-1)).toMatch(/^fitBounds/)
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'sharing a selected region hands out its own preview page',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const { window } = page
      await page.waitFor(
        () => window.document.body.dataset.regionDetail === '1',
        'the region card from the URL',
      )
      await new Promise((resolve) => setTimeout(resolve, 100)) // the preview page is probed after selecting

      page.q('#share-fab').click()
      page.q('#export-item-share').click()
      await page.waitFor(() => window.__shares.length === 1, 'the share sheet')

      const [shared] = window.__shares
      expect(shared?.url).toMatch(/\/r\/relation-396557\.html$/)
      expect(shared?.text).toContain('Schweitenkirchen')
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'falls back to the neutral background when the keyed basemap stops answering',
    async () => {
      page = await bootViewer()
      const { window } = page
      const basemapStyles = () => window.__calls.filter((c) => c[0] === 'setStyle').map((c) => c[1])
      const tileError = (status: number, sourceId = 'basemap') =>
        window.__map.fire('error', { sourceId, error: { status } })

      // Not enough, or not the basemap, or not an auth/quota failure: nothing happens.
      tileError(403)
      tileError(403)
      tileError(404)
      tileError(403, 'regions')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(basemapStyles()).toEqual([])

      tileError(429) // the third failure (auth, quota, or a network error without status)
      await page.waitFor(() => basemapStyles().length === 1, 'the fallback style')
      expect(basemapStyles()).toEqual(['background']) // the "blank" style
      expect(page.q('#basemap-hint').textContent).toContain('nicht erreichbar')
      // The visitor's choice (and so every share link) is left alone.
      expect(page.q<HTMLSelectElement>('#basemap-select').value).toBe('light')
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  describe('Gemeinde polygons are fetched per Landkreis, not up front', () => {
    const polygonFiles = (p: ViewerPage) =>
      p.window.__fetches.filter((url) => url.startsWith('gemeinde-geometry/'))

    test(
      'the default view downloads no Gemeinde polygon',
      async () => {
        page = await bootViewer()
        expect(polygonFiles(page)).toEqual([])
        expect(page.errors).toEqual([])
      },
      TIMEOUT,
    )

    test(
      'a Gemeinde of one Landkreis fetches only that Landkreis, and its card still works',
      async () => {
        page = await bootViewer(IN_LANDKREIS)
        const { window } = page
        await page.waitFor(
          () => window.document.body.dataset.regionDetail === '1',
          'the region card',
        )
        expect(polygonFiles(page)).toEqual(['gemeinde-geometry/relation-62371.msgpack'])
        // Needs the other Gemeinden's centres, which now travel as properties, not polygons.
        expect(page.q('#region-detail-peer-gap').textContent).toContain(
          'Vergleichbare Gemeinde in der Nähe',
        )
        expect(page.errors).toEqual([])
      },
      TIMEOUT,
    )

    test(
      '"Mein Standort" finds the Gemeinde from just the nearby Landkreise',
      async () => {
        // A point inside Schweitenkirchen (Landkreis Pfaffenhofen an der Ilm).
        page = await bootViewer('', { geolocation: { lng: 11.6103, lat: 48.5183 } })
        const { window } = page
        page.q('#region-locate').click()
        await page.waitFor(
          () => window.document.body.dataset.regionDetail === '1',
          'the located region',
        )
        expect(page.q('#region-detail-title').textContent).toBe('Schweitenkirchen')
        const files = polygonFiles(page)
        expect(files).toContain('gemeinde-geometry/relation-62371.msgpack')
        expect(files.length).toBeLessThanOrEqual(4) // the Landkreise around the point, not Germany
        expect(page.errors).toEqual([])
      },
      TIMEOUT,
    )

    test(
      'a failing polygon file shows an error instead of a broken map',
      async () => {
        page = await bootViewer(IN_LANDKREIS, { failGemeindeGeometry: true })
        await page.waitFor(
          () => Boolean(page!.q('#load-error').textContent),
          'the failed polygon request to be reported',
        )
        expect(page.q('#load-error').textContent).toContain(
          'Gemeindegrenzen konnten nicht geladen werden',
        )
      },
      TIMEOUT,
    )
  })

  test(
    'the phone layout boots into a collapsed bottom sheet',
    async () => {
      page = await bootViewer('', { phone: true })
      expect(page.window.document.body.dataset.sheet).toBe('peek')
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a Gemeinde in a Landkreis with a routing graph links to the detour map; others do not',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const p = page
      await p.waitFor(() => !p.q('#region-detail').hidden, 'the region card')
      const link = p.q<HTMLAnchorElement>('#region-detail-detour')
      expect(link.getAttribute('href')).toBe(
        `./umweg.html?lk=relation%2F62371&gemeinde=${encodeURIComponent(SCHWEITENKIRCHEN)}`,
      )
      p.close()
      // Landkreis Freising (no graph): no link.
      page = await bootViewer(
        '?gebiet=relation/2145268&untergebiet=lk:relation/62633&darstellung=gemeinden&region=relation/30015',
      )
      const q = page
      await q.waitFor(() => !q.q('#region-detail').hidden, 'the region card')
      expect(q.window.document.getElementById('region-detail-detour')).toBeNull()
      expect(q.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'the search is a combobox: arrows move a highlight, Enter picks, focus stays in the field',
    async () => {
      page = await bootViewer()
      const p = page
      const { window } = p
      const doc = window.document
      const input = p.q<HTMLInputElement>('#region-search-input')
      const key = (k: string) =>
        input.dispatchEvent(
          new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
        )
      const type = (text: string) => {
        input.focus()
        input.value = text
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      type('Schweitenk')
      await p.waitFor(
        () => p.qAll('#region-search-results li[role="option"]').length > 0,
        'results',
      )

      key('ArrowDown')
      const first = p.qAll('#region-search-results li[role="option"]')[0]!
      expect(doc.activeElement).toBe(input)
      expect(input.getAttribute('aria-activedescendant')).toBe(first.id)
      expect(first.getAttribute('aria-selected')).toBe('true')

      key('Escape')
      expect(input.value).toBe('')
      expect(p.q('#region-search-results').hidden).toBe(true)
      expect(input.hasAttribute('aria-activedescendant')).toBe(false)

      // Enter with nothing highlighted takes the first (here: the only) suggestion.
      type('Schweitenk')
      await p.waitFor(
        () => p.qAll('#region-search-results li[role="option"]').length > 0,
        'results',
      )
      key('Enter')
      await p.waitFor(() => doc.body.dataset.regionDetail === '1', 'the region card')
      expect(p.q('#region-detail-title').textContent).toBe('Schweitenkirchen')
      expect(doc.activeElement).not.toBe(doc.body)
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'without WebGL the page says so and search, ranking and region card still work',
    async () => {
      page = await bootViewer('', { webgl: false })
      const p = page
      const { window } = p
      expect(p.q('.no-webgl-notice').textContent).toContain('WebGL')
      expect(p.q('#load-error').textContent).toBe('')
      expect(p.qAll('#ranking-list li[data-ranking-id]').length).toBeGreaterThan(10)
      const input = p.q<HTMLInputElement>('#region-search-input')
      input.value = 'Schweitenkirchen'
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      await p.waitFor(
        () => p.qAll('#region-search-results li[role="option"]').length > 0,
        'results',
      )
      p.qAll('#region-search-results li[role="option"]')[0]!.click()
      await p.waitFor(() => window.document.body.dataset.regionDetail === '1', 'the region card')
      expect(p.q('#region-detail-title').textContent).toBe('Schweitenkirchen')
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a deep link with unknown parameters says so and cleans the address',
    async () => {
      page = await bootViewer('?gebiet=relation/999999999&darstellung=quatsch&region=relation/1')
      const p = page
      const feedback = p.q('#copy-view-link-feedback')
      expect(feedback.hidden).toBe(false)
      expect(feedback.textContent).toContain('Gebiet')
      expect(feedback.textContent).toContain('Darstellung')
      expect(feedback.textContent).toContain('Region')
      expect(p.window.location.search).not.toMatch(/gebiet|darstellung|region/)
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a valid deep link raises no notice',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const p = page
      await p.waitFor(() => !p.q('#region-detail').hidden, 'the region card')
      expect(p.q('#copy-view-link-feedback').hidden).toBe(true)
      expect(p.window.location.search).toContain('region=')
    },
    TIMEOUT,
  )

  test(
    'clicking the selected region on the map again keeps it selected',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const p = page
      const { window } = p
      await p.waitFor(() => !p.q('#region-detail').hidden, 'the region card')
      const map = window.__map as unknown as {
        fire: (t: string, e?: object) => void
        queryRenderedFeatures: () => unknown[]
      }
      map.queryRenderedFeatures = () => [{ properties: { id: SCHWEITENKIRCHEN } }]
      map.fire('click', { point: { x: 10, y: 10 }, originalEvent: { detail: 1 } })
      await new Promise((r) => setTimeout(r, 50))
      expect(window.document.body.dataset.regionDetail).toBe('1')
      expect(p.q('#region-detail').hidden).toBe(false)
      // A click on empty map still clears it.
      map.queryRenderedFeatures = () => []
      map.fire('click', { point: { x: 10, y: 10 }, originalEvent: { detail: 1 } })
      await p.waitFor(() => !window.document.body.dataset.regionDetail, 'the card to close')
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    'a scale that stops short of the data says so at its end',
    async () => {
      page = await bootViewer()
      const p = page
      // The Deutschland view clips its colours at a percentile; the city states lie above.
      expect(p.q('#legend-labels .legend-label--end').textContent).toMatch(/^≥ \d/)
      expect(p.q('#cml-max').textContent).toMatch(/^≥ \d/)
      expect(p.q('#legend-labels .legend-label--start').textContent).not.toMatch(/^[≤≥]/)
    },
    TIMEOUT,
  )
  test(
    'the main metric reads km je 100 km everywhere, never %',
    async () => {
      page = await bootViewer(IN_LANDKREIS)
      const p = page
      await p.waitFor(() => !p.q('#region-detail').hidden, 'the region card')
      const noPercent = (selector: string) => {
        const text = p.q(selector).textContent ?? ''
        expect(text, selector).not.toContain('%')
        return text
      }
      noPercent('#legend-labels')
      noPercent('#cml-max')
      expect(noPercent('#cml-def')).toBe('km je 100 km Straße')
      noPercent('#ranking-list')
      expect(noPercent('#region-detail-meta')).toContain('je 100 km')
      noPercent('#region-detail-gap')
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )
})
