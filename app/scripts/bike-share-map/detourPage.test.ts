import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { detourPageHtml } from './detourPage'
import type { DetourIndexEntry } from './fetchDetourGraph'
import { bootPage, type ViewerPage } from './viewerHarness'

/**
 * The detour page, generated from source, booted in jsdom against the committed Pfaffenhofen
 * graph (output/detour/) and the built detourRouting.js bundle — rebuild the viewer after
 * changing detourRouting.ts. Routing runs for real; only MapLibre is stubbed.
 */

const outputRoot = join(import.meta.dirname, 'output')
const indexPath = join(outputRoot, 'detour', 'index.json')
const landkreise: DetourIndexEntry[] = existsSync(indexPath)
  ? (JSON.parse(readFileSync(indexPath, 'utf8')) as { landkreise: DetourIndexEntry[] }).landkreise
  : []
const PAF = landkreise.find((l) => l.id === 'relation/62371')
const TIMEOUT = 60_000

const html = () =>
  detourPageHtml({
    landkreise,
    dataBaseHref: './detour/',
    routingScriptHref: './detourRouting.js',
    dataDateLabel: '01.01.2026',
    methodikHref: './methodik.html',
    viewerHref: './index.html',
  })

let page: ViewerPage | null = null
afterEach(() => {
  page?.close()
  page = null
})

const loaded = { ready: (p: ViewerPage) => p.q('#status').textContent!.includes('Dörfer') }
const rows = (p: ViewerPage) => p.qAll('#table tbody tr')

describe.skipIf(!PAF)('detour page (jsdom, real routing on the Pfaffenhofen graph)', () => {
  test(
    'boots, lists the places and routes from Schweitenkirchen without errors',
    async () => {
      page = await bootPage(html(), ['detourRouting.js'], '', loaded)
      const p = page
      await p.waitFor(() => p.q('#status').textContent!.includes('Dörfer'), 'the graph to load')
      expect(p.errors).toEqual([])
      expect(p.q('#origin-box').hidden).toBe(true)
      expect(p.qAll('#place-list option').length).toBeGreaterThan(100)

      const search = p.q<HTMLInputElement>('#origin-search')
      search.value = 'Schweitenkirchen'
      search.dispatchEvent(new p.window.Event('change', { bubbles: true }))
      await p.waitFor(() => rows(p).length > 0, 'the destination table')
      expect(p.errors).toEqual([])
      expect(p.q('#origin-box').hidden).toBe(false)
      expect(p.q('#summary').textContent).toContain('Schweitenkirchen')
      expect(p.q('#summary').textContent).toMatch(/im Median [+−±]\d+,\d km/)
      // Default: hamlets hidden, so only villages and towns are listed.
      expect(rows(p).length).toBeGreaterThan(50)
      expect(rows(p).length).toBeLessThan(200)
      expect(p.window.location.search).toContain('von=')

      // Hamlets toggle adds rows.
      const before = rows(p).length
      const hamlets = p.q<HTMLInputElement>('#hamlets')
      hamlets.checked = true
      hamlets.dispatchEvent(new p.window.Event('change', { bubbles: true }))
      expect(rows(p).length).toBeGreaterThan(before)
      expect(p.window.location.search).toContain('weiler=1')
    },
    TIMEOUT,
  )

  test(
    'the slider changes the result and a destination shows both routes',
    async () => {
      page = await bootPage(html(), ['detourRouting.js'], '?von=0', loaded)
      const p = page
      await p.waitFor(() => p.q('#status').textContent!.includes('Dörfer'), 'the graph to load')
      const search = p.q<HTMLInputElement>('#origin-search')
      search.value = 'Ilmmünster'
      search.dispatchEvent(new p.window.Event('change', { bubbles: true }))
      await p.waitFor(() => rows(p).length > 0, 'the destination table')
      const firstCells = () => rows(p).map((tr) => tr.children[3]!.textContent)
      const at70 = firstCells()

      const slider = p.q<HTMLInputElement>('#safety')
      slider.value = '0'
      slider.dispatchEvent(new p.window.Event('input', { bubbles: true }))
      await p.waitFor(
        () => p.window.location.search.includes('sicherheit=0'),
        'the slider to apply',
      )
      expect(p.q('#safety-note').textContent).toContain('Schnellste')
      const at0 = firstCells()
      expect(at0).not.toEqual(at70)

      // Pick the first destination: pair box + both route sources filled.
      rows(p)[0]!.click()
      expect(p.q('#pair').hidden).toBe(false)
      expect(p.q('#pair h2').textContent).toContain('Ilmmünster →')
      const map = p.window.__map as unknown as {
        getSource: (id: string) => {
          data: { type: string; features?: unknown[]; geometry?: { coordinates: unknown[] } }
        }
      }
      expect(map.getSource('route-bike').data.features!.length).toBeGreaterThan(0)
      expect(map.getSource('route-car').data.geometry!.coordinates.length).toBeGreaterThan(1)
      expect(p.window.location.search).toContain('nach=')
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )

  test(
    "?gemeinde= from the viewer card starts at the Gemeinde's main place",
    async () => {
      page = await bootPage(
        html(),
        ['detourRouting.js'],
        '?lk=relation/62371&gemeinde=relation/396557',
        loaded,
      )
      const p = page
      await p.waitFor(() => rows(p).length > 0, 'the destination table')
      expect(p.q<HTMLInputElement>('#origin-search').value).toBe('Schweitenkirchen')
      expect(p.window.location.search).not.toContain('gemeinde=')
      expect(p.errors).toEqual([])
    },
    TIMEOUT,
  )
})
