import { describe, expect, test } from 'vitest'
import { generateViewerHtml } from './generateViewerHtml'
import { minifyInlineScripts } from './minifyPageHtml'

describe('minifyInlineScripts', () => {
  test('minifies inline scripts, leaves src scripts and markup alone', async () => {
    const html = [
      '<p>a</p>',
      '<script src="./x.js?v=1"></script>',
      // a page writes "<\/script" inside script text, as JavaScript reads it the same
      '<script>\n  // comment\n  function hello() {\n    return "<\\/script>";\n  }\n  window.__x = hello();\n</script>',
      '<div>b</div>',
      '<script>\n  const n = 1 + 2;\n  window.__y = n;\n</script>',
    ].join('\n')
    const out = await minifyInlineScripts(html)
    expect(out).toContain('<p>a</p>\n<script src="./x.js?v=1"></script>')
    expect(out).toContain('<div>b</div>')
    const scripts = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '')
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).not.toContain('comment')
    expect(scripts[0]).toContain('<\\/script')
    for (const s of scripts) expect(() => new Function(s)).not.toThrow()
    const window: Record<string, unknown> = {}
    new Function('window', scripts[0]!)(window)
    new Function('window', scripts[1]!)(window)
    expect(window).toEqual({ __x: '</script>', __y: 3 })
  })

  test('BIKE_SHARE_NO_MINIFY leaves the page as generated', async () => {
    process.env.BIKE_SHARE_NO_MINIFY = '1'
    try {
      expect(await minifyInlineScripts('<script>\n  // keep\n</script>')).toContain('// keep')
    } finally {
      delete process.env.BIKE_SHARE_NO_MINIFY
    }
  })

  test('the generated viewer page survives it', async () => {
    const html = generateViewerHtml('2026-01-01T00:00:00.000Z', '01.01.2026', [])
    const out = await minifyInlineScripts(html)
    expect(out.length).toBeLessThan(html.length * 0.7)
    const scripts = [...out.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(
      (m) => m[1] ?? '',
    )
    const controller = scripts.sort((a, b) => b.length - a.length)[0]!
    expect(() => new Function(controller)).not.toThrow()
    expect(controller).toContain('__viewerBooted')
    expect(out).toContain('<script src="./statsMsgpack.js?v=')
  })
})
