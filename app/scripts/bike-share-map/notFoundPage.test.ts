import { describe, expect, test } from 'vitest'
import { notFoundPageHtml } from './notFoundPage'

/** Runs the page's redirect script against a fake location; returns where it sent the browser. */
function redirectFor(href: string) {
  const script = notFoundPageHtml().match(/<script>([\s\S]*?)<\/script>/)![1]!
  const url = new URL(href)
  let target: string | null = null
  const location = {
    pathname: url.pathname,
    hostname: url.hostname,
    replace: (to: string) => {
      target = to
    },
  }
  const window: Record<string, unknown> = {}
  new Function('location', 'window', script)(location, window)
  return { target, home: window.__radinfraHome }
}

describe('404.html', () => {
  test('a single word after the site root opens that place, on both hosts', () => {
    expect(redirectFor('https://radweg.bfschweitenkirchen.de/schweitenkirchen').target).toBe(
      '/index.html?ort=schweitenkirchen',
    )
    expect(redirectFor('https://radweg.bfschweitenkirchen.de/Schweitenkirchen/').target).toBe(
      '/index.html?ort=schweitenkirchen',
    )
    expect(redirectFor('https://leonhardfeiner.github.io/tilda-geo/m%C3%BCnchen').target).toBe(
      '/tilda-geo/index.html?ort=m%C3%BCnchen',
    )
  })
  test('a missing file or a deeper path is just "not found", with the right way home', () => {
    expect(redirectFor('https://radweg.bfschweitenkirchen.de/alt.html')).toEqual({
      target: null,
      home: '/',
    })
    expect(redirectFor('https://leonhardfeiner.github.io/tilda-geo/r/relation-1.html')).toEqual({
      target: null,
      home: '/tilda-geo/',
    })
    expect(redirectFor('https://radweg.bfschweitenkirchen.de/%E0%A4%A')).toEqual({
      target: null,
      home: '/',
    })
  })
})
