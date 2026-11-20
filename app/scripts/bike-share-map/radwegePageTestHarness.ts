import { join } from 'node:path'
import { PROJECT_LEAD, RADWEGE_PAGE_STEM } from './constants'
import { radwegePageHtml } from './radwegePage'
import type { ViewerPage } from './viewerHarness'

/**
 * Shared by the Radwege page tests. They are split over two files (radwegePage.test.ts,
 * radwegePageViews.test.ts) because Bun 1.3.13 (the pre-push hook runs vitest with --bun)
 * miscompiles a jsdom CSS tokenizer function once its FTL JIT tier kicks in: with all eight
 * page tests in one process, switching the colour mode never returned and the worker grew to
 * 40 GB (2026-11-18; BUN_JSC_useFTLJIT=0 made it pass). Keep each file's page tests few.
 */

export const dataFile = join(import.meta.dirname, 'output', 'viewer', `${RADWEGE_PAGE_STEM}.json`)
export const html = () =>
  radwegePageHtml({
    dataHref: `./${RADWEGE_PAGE_STEM}.json`,
    projectLead: PROJECT_LEAD,
    konzeptUrl: 'https://example.org/radwegekonzept',
  })

export type Line = {
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
export const shownLines = (p: ViewerPage) =>
  (
    p.window as unknown as { __map: { getSource: (id: string) => { data: { features: Line[] } } } }
  ).__map.getSource('radwege').data.features
export const ready = { ready: (p: ViewerPage) => p.q('#headline').textContent!.includes('Trassen') }
export const click = (p: ViewerPage, el: Element) =>
  el.dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }))
export const toggle = (p: ViewerPage, input: HTMLInputElement) => {
  input.checked = !input.checked
  input.dispatchEvent(new p.window.Event('change', { bubbles: true }))
}
