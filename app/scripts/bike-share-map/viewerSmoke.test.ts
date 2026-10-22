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
      expect(page.q('#national-context').textContent).toMatch(/Bundesweit: \d+,\d %/)
      expect(page.q('#region-breadcrumb').textContent).toContain('Deutschland')
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
      expect(text).toMatch(/Summe der Erwartungswerte von \d+ Gemeinden/)
      expect(text).toMatch(/Erwartet: \d+,\d %/)
      expect(page.errors).toEqual([])
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
})
