import { describe, expect, test } from 'vitest'
import { generateViewerHtml } from './generateViewerHtml'

describe('generateViewerHtml mobile zoom prevention and redirection', () => {
  const html = generateViewerHtml('2026-10-11T00:00:00.000Z', '11.10.2026')

  test('viewport meta tag disables user scaling', () => {
    expect(html).toContain('user-scalable=no')
    expect(html).toContain('maximum-scale=1')
  })

  test('CSS applies touch-action restrictions on the bottom sheet and overlays', () => {
    expect(html).toContain('touch-action: pan-y;')
    expect(html).toContain('touch-action: none;')
  })

  test('cancels iOS Safari gesture events to prevent native page zoom', () => {
    expect(html).toContain("'gesturestart'")
    expect(html).toContain("'gesturechange'")
    expect(html).toContain("'gestureend'")
  })

  test('intercepts 2-finger pinches on UI elements and redirects zoom to map camera', () => {
    expect(html).toContain('startUiPinch')
    expect(html).toContain('applyUiPinch')
    expect(html).toContain('calculateAnchoredCameraOptions')
    expect(html).toContain('isTouchOnMapCanvas')
  })

  test('scrim is active only on full sheet, leaving half sheet interactive like Google Maps', () => {
    expect(html).toContain(
      'body[data-sheet="full"] #sheet-scrim { opacity: 1; pointer-events: auto; }',
    )
    expect(html).not.toContain('body[data-sheet="half"] #sheet-scrim')
  })

  test('search FAB remains visible in half sheet and during region detail view', () => {
    expect(html).toContain('body[data-sheet="full"] #search-fab { display: none; }')
    expect(html).not.toContain('body[data-sheet="half"] #search-fab,')
    expect(html).not.toContain('body[data-region-detail] #search-fab')
  })

  test('search input uses type="search" and enterkeyhint for native mobile ergonomics', () => {
    expect(html).toContain('type="search"')
    expect(html).toContain('enterkeyhint="search"')
  })

  test('sheet drag includes velocity tracking and smooth glide camera framing', () => {
    expect(html).toContain('velocityY')
    expect(html).toContain('isSheetDragTarget')
    expect(html).toContain('turf.center(selected).geometry.coordinates')
    expect(html).toContain('map.easeTo({ center')
  })

  test('desktop scale bar is added and offset when region detail is open', () => {
    expect(html).toContain('new maplibregl.ScaleControl')
    expect(html).toContain('body[data-region-detail] .maplibregl-ctrl-bottom-right')
  })

  test('desktop panel features sticky search block', () => {
    expect(html).toContain('position: sticky; top: -12px;')
  })

  test('desktop camera padding accounts for left panel and right detail card', () => {
    expect(html).toContain('desktopMapPadding')
    expect(html).toContain('map.setPadding(targetPadding)')
  })

  test('bidirectional hover highlights sync between ranking list and map polygons', () => {
    expect(html).toContain('regions-hover')
    expect(html).toContain('setHoveredRegionId')
    expect(html).toContain('ranking-row-hovered')
  })

  test('bottom sheet preserves region selection on peek and displays name and share in peek bar', () => {
    expect(html).toContain("panelSummaryPreview.textContent = name + ' · ' + pct")
  })

  test('canvas mini-legend is rendered and updated dynamically on color scale changes', () => {
    expect(html).toContain('id="canvas-mini-legend"')
    expect(html).toContain('id="cml-bar"')
    expect(html).toContain('id="cml-min"')
    expect(html).toContain('id="cml-max"')
    expect(html).toContain('cmlBar.style.background = scale.legendGradient')
  })

  test('region detail primary actions are elevated above breakdown and gap analysis', () => {
    const metaPos = html.indexOf('id="region-detail-meta"')
    const actionsPos = html.indexOf('id="region-detail-actions"')
    const gapPos = html.indexOf('id="region-detail-gap"')
    expect(metaPos).toBeGreaterThan(-1)
    expect(actionsPos).toBeGreaterThan(metaPos)
    expect(gapPos).toBeGreaterThan(actionsPos)
  })

  test('neighbor view renders a floating exit chip to restore standard view', () => {
    expect(html).toContain('id="exit-neighbor-view"')
    expect(html).toContain('‹ Ansicht wiederherstellen')
    expect(html).toContain('exitNeighborBtn.hidden = !isNeighborView()')
    expect(html).toContain('exitNeighborView()')
  })

  test('search results container contains overscroll and height bounds for mobile virtual keyboards', () => {
    expect(html).toContain('overscroll-behavior: contain;')
    expect(html).toContain('updateSearchResultsPosition')
    expect(html).toContain('window.visualViewport')
  })

  test('methodology link opens an inline accessible dialog modal preserving map state', () => {
    expect(html).toContain('id="methodology-dialog"')
    expect(html).toContain('openMethodologyModal')
    expect(html).toContain('a[href$="methodik.html"]')
  })

  test('parses exact map position, bearing, and pitch from URL hash and parameters', () => {
    expect(html).toContain('function parseMapString(')
    expect(html).toContain('function getMapPositionFromUrl()')
    expect(html).toContain("clean.startsWith('map=')")
    expect(html).toContain('parts.length >= 3')
  })

  test('initializes map with explicit camera position when present in URL', () => {
    expect(html).toContain('const initialMapPos = getMapPositionFromUrl();')
    expect(html).toContain('center: initialMapPos ? initialMapPos.center : [11.5, 48.9],')
    expect(html).toContain('zoom: initialMapPos ? initialMapPos.zoom : 7,')
    expect(html).toContain('bearing: initialMapPos ? initialMapPos.bearing : 0,')
    expect(html).toContain('pitch: initialMapPos ? initialMapPos.pitch : 0,')
  })

  test('listens to map moveend event to schedule URL state synchronization', () => {
    expect(html).toContain("map.on('moveend', () => {")
    expect(html).toContain('scheduleUrlSync();')
  })

  test('formats current map position with bearing and pitch into URL hash', () => {
    expect(html).toContain('function currentMapHash()')
    expect(html).toContain("return '#map=' + z + '/' + lat + '/' + lng + '/' + b + '/' + p;")
    expect(html).toContain("return '#map=' + z + '/' + lat + '/' + lng;")
    expect(html).toContain('buildShareUrl()')
    expect(html).toContain('+ currentMapHash()')
  })

  test('preserves explicit camera coordinates from being overwritten on boot', () => {
    expect(html).toContain('if (explicitMapPositionPending) {')
    expect(html).toContain('!explicitMapPositionPending')
    expect(html).toContain('explicitMapPositionPending = false;')
  })

  test('listens to hashchange and popstate to smoothly ease map to target position', () => {
    expect(html).toContain("window.addEventListener('hashchange',")
    expect(html).toContain('function isMapAtPosition(')
    expect(html).toContain('map.easeTo({')
  })

  test('region detail actions provide an in-place Ansicht teilen button with instant feedback', () => {
    expect(html).toContain("shareButton.textContent = 'Ansicht teilen'")
    expect(html).toContain("shareButton.textContent = '✓ Link kopiert!'")
  })

  test('basemap switching preserves user camera bearing and pitch', () => {
    expect(html).toContain('const bearing = map.getBearing();')
    expect(html).toContain('const pitch = map.getPitch();')
    expect(html).toContain('map.jumpTo({ center, zoom, bearing, pitch });')
  })

  test('renders 1200x630 social share scorecard canvas with key metrics and benchmark bar', () => {
    expect(html).toContain('function drawRegionScorecardCanvas(')
    expect(html).toContain('const width = 1200;')
    expect(html).toContain('const height = 630;')
    expect(html).toContain('RADINFRA-VERGLEICH 2026')
    expect(html).toContain('RADWEGE-ANTEIL')
    expect(html).toContain('Hauptverkehrsstraßen')
    expect(html).toContain('barGrad.addColorStop(0,')
  })

  test('normalizes scorecard PNG filename from region name', () => {
    expect(html).toContain('function scorecardFilename(')
    expect(html).toContain("'-scorecard.png'")
  })

  test('provides Scorecard export in toolbar and region detail actions with native share support', () => {
    expect(html).toContain('id="share-scorecard-image"')
    expect(html).toContain("scorecardButton.textContent = 'Scorecard (Bild)'")
    expect(html).toContain('function shareRegionScorecard(')
    expect(html).toContain('shareScorecardImageBtn?.addEventListener')
  })

  test('includes social sharing cards, favicon, theme-color, and canonical URL in head', () => {
    expect(html).toContain('<meta name="theme-color" content="#1e293b" />')
    expect(html).toContain('<link rel="icon"')
    expect(html).toContain('<link rel="canonical"')
    expect(html).toContain('<meta property="og:image"')
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<meta name="twitter:image"')
  })

  test('wraps primary app layout in semantic main element and establishes valid WCAG heading hierarchy', () => {
    expect(html).toContain('<main id="app-root">')
    expect(html).toContain('</main>')
    expect(html).toContain(
      '<div id="map" role="region" aria-label="Interaktive Karte der Radinfrastruktur">',
    )
    expect(html).toContain('<h2 class="settings-heading">Was zählt als Radinfrastruktur?</h2>')
    expect(html).toContain('<h2 class="settings-heading">Karte</h2>')
    expect(html).toContain('<h2 id="region-detail-title"></h2>')
    expect(html).toContain('<h2 id="methodology-title">Methodik &amp; Datenquellen</h2>')
    expect(html).toContain('aria-labelledby="methodology-title"')
    expect(html).not.toContain('<h3')
  })

  test('respects prefers-reduced-motion in CSS transitions and disables camera animations in JS', () => {
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('animation-duration: 0.01ms !important;')
    expect(html).toContain('transition-duration: 0.01ms !important;')
    expect(html).toContain('function prefersReducedMotion()')
    expect(html).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(html).toContain('const shouldAnimate = Boolean(animate) && !prefersReducedMotion();')
    expect(html).toContain('duration: prefersReducedMotion() ? 0 : 350')
  })

  test('provides accessible 44px minimum touch targets and high-contrast text', () => {
    expect(html).toContain('min-height: 44px; height: 44px;')
    expect(html).toContain('.region-detail-close::after')
    expect(html).toContain('.methodology-close::after')
    expect(html).toContain('#share-fab::after')
    expect(html).toContain('color: #475569;')
  })

  test('preloads MapLibre JS and preconnects to map tile origins for faster Core Web Vitals', () => {
    expect(html).toContain(
      '<link rel="preload" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" as="script"',
    )
    expect(html).toContain('<link rel="preconnect" href="https://api.maptiler.com"')
    expect(html).toContain('<link rel="preconnect" href="https://tiles.tilda-geo.de"')
    expect(html).toContain('<link rel="dns-prefetch" href="https://tile.openstreetmap.de"')
  })
})
