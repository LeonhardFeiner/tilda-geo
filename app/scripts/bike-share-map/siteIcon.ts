/**
 * Site icon and header logo: the BFS chevrons running into a bike. Both share one geometry —
 * two wheels three radii apart, a frame with no saddle or handlebar (they turn to noise below
 * 32 px), and two chevrons whose tips cross the rear wheel the way the chevrons cross the
 * letters in the BFS logo. A mask cuts a gap into the wheel around the chevrons so the overlap
 * reads as deliberate at any size.
 *
 * `SITE_LOGO_SVG` is the full mark in the brand colours on a transparent background, for the
 * panel header. `SITE_ICON_SVG` is the favicon / touch icon: the same chevrons running into a
 * single wheel ring, on a white rounded tile. The frame is dropped because it turns to noise at
 * 16 px; the white tile keeps the magenta and teal readable on dark tab bars too.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const MAGENTA = '#b01a76'
const TEAL = '#17678a'

const WHEEL_STROKE = 42
const CHEVRON_GAP = 18
const chevronXs = [80, 185]

const chevronPoints = (x: number) =>
  `${x},450 ${x + 45},450 ${x + 120},600 ${x + 45},750 ${x},750 ${x + 75},600`

const chevrons = (fill: string, extraAttrs = '') =>
  `<g fill="${fill}"${extraAttrs}>${chevronXs.map((x) => `<polygon points="${chevronPoints(x)}"/>`).join('')}</g>`

const wheels = (stroke: string) =>
  `<g mask="url(#chevron-gap)" fill="none" stroke="${stroke}" stroke-width="${WHEEL_STROKE}">` +
  `<circle cx="420" cy="600" r="140"/><circle cx="840" cy="600" r="140"/></g>`

const frame = (stroke: string) =>
  `<g fill="none" stroke="${stroke}" stroke-width="${WHEEL_STROKE}" stroke-linecap="round" stroke-linejoin="round">` +
  `<polyline points="420,600 470,410 790,410 740,600 420,600"/>` +
  `<polyline points="470,410 740,600"/><polyline points="790,410 840,600"/></g>`

// The wheel is hidden inside a band CHEVRON_GAP wide around each chevron.
const gapMask =
  `<defs><mask id="chevron-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">` +
  `<rect width="1024" height="1024" fill="#fff"/>` +
  chevrons('#000', ` stroke="#000" stroke-width="${CHEVRON_GAP * 2}" stroke-linejoin="miter"`) +
  `</mask></defs>`

const svgDocument = (viewBox: string, body: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${attrs}>${body}</svg>`

// Icon geometry: larger chevrons (no frame to leave room for) and one wheel ring on the right.
const iconChevronPoints = (x: number) =>
  `${x},300 ${x + 120},300 ${x + 330},512 ${x + 120},724 ${x},724 ${x + 210},512`
const iconChevrons = [110, 330].map((x) => `<polygon points="${iconChevronPoints(x)}"/>`).join('')

export const SITE_ICON_SVG = svgDocument(
  '0 0 1024 1024',
  `<rect width="1024" height="1024" rx="200" fill="#fff"/>` +
    `<circle cx="700" cy="512" r="190" fill="none" stroke="${TEAL}" stroke-width="64"/>` +
    `<g fill="${MAGENTA}">${iconChevrons}</g>`,
)

/** Transparent mark, viewBox trimmed to the drawing so it sizes by height in the header. */
export const SITE_LOGO_SVG = svgDocument(
  '60 380 962 400',
  gapMask + wheels(TEAL) + frame(MAGENTA) + chevrons(MAGENTA),
)

export const SITE_ICON_FILES = {
  svg: 'icon.svg',
  appleTouch: 'apple-touch-icon.png',
} as const

/** `<link>` tags for a page's head; `prefix` is the path from that page to the viewer root. */
export const siteIconHeadLinks = (prefix = './') =>
  `<link rel="icon" type="image/svg+xml" href="${prefix}${SITE_ICON_FILES.svg}" />\n` +
  `<link rel="apple-touch-icon" sizes="180x180" href="${prefix}${SITE_ICON_FILES.appleTouch}" />`

/** Inline copy of the logo for markup; without a label it is decorative (text follows it). */
export const siteLogoInlineSvg = (className: string, label?: string) =>
  SITE_LOGO_SVG.replace(
    '<svg ',
    `<svg class="${className}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} `,
  )

export async function writeSiteIcons(viewerDir: string) {
  mkdirSync(viewerDir, { recursive: true })
  writeFileSync(join(viewerDir, SITE_ICON_FILES.svg), SITE_ICON_SVG)
  // iOS ignores SVG touch icons and draws its own rounded corners, so the PNG is the tile
  // rendered square: the white already fills the whole 1024 box behind the radius.
  const png = await sharp(Buffer.from(SITE_ICON_SVG.replace(' rx="200"', '')))
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toBuffer()
  writeFileSync(join(viewerDir, SITE_ICON_FILES.appleTouch), png)
}
