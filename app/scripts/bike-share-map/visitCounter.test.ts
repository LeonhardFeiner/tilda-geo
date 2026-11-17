import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import { COUNTED_HOST, GOATCOUNTER_CODE, visitCounterHeadScript } from './visitCounter'

/** Runs the inline loader against a fake page on `hostname`; returns the scripts it appended. */
function runLoader(hostname: string) {
  const body = visitCounterHeadScript()
    .replace(/^<script>/, '')
    .replace(/<\/script>$/, '')
  const appended: Array<{ src: string; async: boolean; attrs: Record<string, string> }> = []
  const document = {
    createElement: () => {
      const el = {
        src: '',
        async: false,
        attrs: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
          el.attrs[name] = value
        },
      }
      return el
    },
    head: { appendChild: (el: (typeof appended)[number]) => appended.push(el) },
  }
  runInNewContext(body, { location: { hostname }, document })
  return appended
}

describe('visitCounterHeadScript', () => {
  test('loads GoatCounter on the BFS subdomain', () => {
    const [script, ...rest] = runLoader(COUNTED_HOST)
    expect(rest).toEqual([])
    expect(script?.src).toBe('https://gc.zgo.at/count.js')
    expect(script?.async).toBe(true)
    expect(script?.attrs['data-goatcounter']).toBe(
      `https://${GOATCOUNTER_CODE}.goatcounter.com/count`,
    )
  })

  test('does nothing on github.io or locally', () => {
    expect(runLoader('leonhardfeiner.github.io')).toEqual([])
    expect(runLoader('localhost')).toEqual([])
  })
})
