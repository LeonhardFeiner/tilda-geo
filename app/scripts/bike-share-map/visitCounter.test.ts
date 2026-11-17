import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { COUNTED_HOST, GOATCOUNTER_ENDPOINT, visitCounterHeadScript } from './visitCounter'

type Page = { hostname?: string; pathname?: string; referrer?: string; visibilityState?: string }

/** Runs the inline script against a fake page; returns the count URLs it sent. */
function runCounter(page: Page = {}) {
  const body = visitCounterHeadScript()
    .replace(/^<script>/, '')
    .replace(/<\/script>$/, '')
  const sent: string[] = []
  runInNewContext(body, {
    location: { hostname: page.hostname ?? COUNTED_HOST, pathname: page.pathname ?? '/' },
    document: { referrer: page.referrer ?? '', visibilityState: page.visibilityState ?? 'visible' },
    navigator: { sendBeacon: (url: string) => (sent.push(url), true) },
    Image: class {},
    encodeURIComponent,
    Math,
  })
  return sent.map((url) => new URL(url))
}

describe('visitCounterHeadScript', () => {
  test('counts the viewer as "/" with only path and cache buster', () => {
    for (const pathname of ['/', '/index.html']) {
      const [url, ...rest] = runCounter({ pathname })
      expect(rest).toEqual([])
      expect(`${url?.origin}${url?.pathname}`).toBe(GOATCOUNTER_ENDPOINT)
      expect([...(url?.searchParams.keys() ?? [])]).toEqual(['p', 'rnd'])
      expect(url?.searchParams.get('p')).toBe('/')
    }
  })

  test('sends external referrers, drops internal ones', () => {
    const [external] = runCounter({
      pathname: '/methodik.html',
      referrer: 'https://www.google.com/',
    })
    expect(external?.searchParams.get('p')).toBe('/methodik.html')
    expect(external?.searchParams.get('r')).toBe('https://www.google.com/')
    const [internal] = runCounter({ referrer: `https://${COUNTED_HOST}/methodik.html` })
    expect(internal?.searchParams.has('r')).toBe(false)
  })

  test('does nothing on github.io, locally or while prerendering', () => {
    expect(runCounter({ hostname: 'leonhardfeiner.github.io' })).toEqual([])
    expect(runCounter({ hostname: 'localhost' })).toEqual([])
    expect(runCounter({ visibilityState: 'prerender' })).toEqual([])
  })
})
