import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Minifies the inline `<script>` blocks of a generated page. The viewer's controller is a
 * ~400 KB template literal shipped as written (comments, names and all); minified it is 180 KB,
 * 59 KB instead of 103 KB gzipped, and the browser parses it in a fraction of the time. The page
 * is generated unminified (generateViewerHtml) — tests parse and boot that — and the build minifies
 * what it writes. `BIKE_SHARE_NO_MINIFY=1` skips this to debug the served page.
 */
export async function minifyInlineScripts(html: string): Promise<string> {
  if (process.env.BIKE_SHARE_NO_MINIFY) return html
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  if (!blocks.length) return html
  const dir = mkdtempSync(join(tmpdir(), 'viewer-minify-'))
  try {
    let out = ''
    let last = 0
    for (const [i, block] of blocks.entries()) {
      const source = block[1] ?? ''
      const entry = join(dir, `script-${i}.js`)
      writeFileSync(entry, source, 'utf8')
      const outfile = join(dir, `script-${i}.min.js`)
      // The bun CLI rather than Bun.build: the build runs under bun, the tests under node.
      try {
        execFileSync(
          'bun',
          ['build', entry, '--minify', '--format=iife', '--target=browser', `--outfile=${outfile}`],
          { stdio: ['ignore', 'ignore', 'pipe'] },
        )
      } catch (error) {
        const stderr = String((error as { stderr?: Buffer }).stderr ?? error)
        throw new Error(`minifyInlineScripts: inline script ${i + 1} failed to minify:\n${stderr}`)
      }
      const minified = readFileSync(outfile, 'utf8')
        .trimEnd()
        // "</script" inside a JS string or regex would end the HTML element early; "<\/script"
        // means the same to JavaScript wherever it can occur
        .replace(/<\/script/gi, '<\\/script')
      out += html.slice(last, block.index!) + '<script>' + minified + '</script>'
      last = block.index! + block[0].length
    }
    return out + html.slice(last)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
