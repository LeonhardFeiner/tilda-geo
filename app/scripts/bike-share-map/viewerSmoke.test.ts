import { afterEach, describe, expect, test } from 'vitest'
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

      tileError(429) // the third auth/quota failure
      await page.waitFor(() => basemapStyles().length === 1, 'the fallback style')
      expect(basemapStyles()).toEqual(['background']) // the "blank" style
      expect(page.q('#basemap-hint').textContent).toContain('nicht erreichbar')
      // The visitor's choice (and so every share link) is left alone.
      expect(page.q<HTMLSelectElement>('#basemap-select').value).toBe('light')
      expect(page.errors).toEqual([])
    },
    TIMEOUT,
  )

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
