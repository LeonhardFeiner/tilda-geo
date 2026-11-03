import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  SITE_ICON_FILES,
  SITE_ICON_SVG,
  SITE_LOGO_SVG,
  siteIconHeadLinks,
  siteLogoInlineSvg,
  writeSiteIcons,
} from './siteIcon'

describe('siteIcon', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'site-icon-'))
    await writeSiteIcons(dir)
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  test('writes the SVG favicon and a 180 px touch icon', async () => {
    expect(readFileSync(join(dir, SITE_ICON_FILES.svg), 'utf8')).toBe(SITE_ICON_SVG)
    const meta = await sharp(readFileSync(join(dir, SITE_ICON_FILES.appleTouch))).metadata()
    expect([meta.width, meta.height, meta.format]).toEqual([180, 180, 'png'])
  })

  test('the icon is the brand colours on a white tile: teal ring, magenta chevrons', async () => {
    const { data, info } = await sharp(Buffer.from(SITE_ICON_SVG))
      .resize(1024, 1024)
      .raw()
      .toBuffer({ resolveWithObject: true })
    const rgb = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
    }
    expect(rgb(512, 60)).toEqual([255, 255, 255]) // tile
    expect(rgb(700 - 190, 512)).toEqual([0x17, 0x67, 0x8a]) // ring, left rim
    expect(rgb(400, 512)).toEqual([0xb0, 0x1a, 0x76]) // first chevron, between notch and tip
    expect(rgb(700, 512)).toEqual([255, 255, 255]) // inside the ring
  })

  test('the header logo keeps the full bike with the chevron gap in the rear wheel', async () => {
    const { data, info } = await sharp(Buffer.from(SITE_LOGO_SVG))
      .resize({ width: 962 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    // viewBox starts at (60, 380), rendered 1:1
    const alpha = (x: number, y: number) =>
      data[((y - 380) * info.width + (x - 60)) * info.channels + 3] ?? 0
    expect(alpha(840 - 140, 600)).toBeGreaterThan(200) // front wheel, left rim
    expect(alpha(420, 600 + 140)).toBeGreaterThan(200) // rear wheel, bottom rim
    // Rear rim along the second chevron's upper edge: 16 px from the edge sits inside the
    // 18 px gap band (hidden), 36 px from it the rim is drawn again.
    expect(alpha(294, 540)).toBe(0)
    expect(alpha(305, 520)).toBeGreaterThan(200)
  })

  test('head links and inline logo', () => {
    expect(siteIconHeadLinks('../')).toContain('href="../icon.svg"')
    expect(siteIconHeadLinks()).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png"',
    )
    const inline = siteLogoInlineSvg('site-logo', 'Radinfra-Vergleich')
    expect(
      inline.startsWith('<svg class="site-logo" role="img" aria-label="Radinfra-Vergleich" '),
    ).toBe(true)
    expect(
      siteLogoInlineSvg('site-logo').startsWith('<svg class="site-logo" aria-hidden="true" '),
    ).toBe(true)
    expect(SITE_LOGO_SVG).not.toContain('rx="200"')
  })
})
