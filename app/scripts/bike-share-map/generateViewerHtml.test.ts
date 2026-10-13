import { Script } from 'node:vm'
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

  test('authority table renders Baulastträger columns without fehlt column', () => {
    expect(html).toContain("for (const text of ['Baulastträger', 'Straße', 'mit Radinfra'])")
    expect(html).not.toContain("gap ? 'fehlt' : ''")
    expect(html).not.toContain('id="scorecard-dialog"')
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

  test('unified export dialog provides sharing and export with instant feedback', () => {
    expect(html).toContain('id="share-fab"')
    expect(html).toContain('id="export-dialog"')
    expect(html).toContain('✓ Link kopiert!')
    expect(html).not.toContain("exportButton.textContent = 'Teilen & Exportieren'")
  })

  test('basemap switching preserves user camera bearing and pitch', () => {
    expect(html).toContain('const bearing = map.getBearing();')
    expect(html).toContain('const pitch = map.getPitch();')
    expect(html).toContain('map.jumpTo({ center, zoom, bearing, pitch });')
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

  test('places printable fact sheet outside app-root main and configures media print styles', () => {
    const appRootPos = html.indexOf('<main id="app-root">')
    const appRootClosePos = html.indexOf('</main>')
    const printSheetPos = html.indexOf('<div id="print-sheet" class="print-sheet"></div>')

    expect(appRootPos).toBeGreaterThan(-1)
    expect(appRootClosePos).toBeGreaterThan(appRootPos)
    expect(printSheetPos).toBeGreaterThan(appRootClosePos)

    expect(html).toContain('@media print')
    expect(html).toContain('body.printing > :not(#print-sheet) { display: none !important; }')
    expect(html).toContain('body.printing #print-sheet {')
    expect(html).toContain('print-color-adjust: exact;')
    expect(html).toContain('html, body.printing {')
    expect(html).toContain('Drucken / PDF')
    expect(html).toContain('async function printRegionSheet(feature)')
    expect(html).toContain("section('Rangliste', buildPrintRanking(feature))")
    expect(html).toContain('function buildPrintRanking(feature)')
    expect(html).toContain('.print-sheet .ps-ranking-list')
    expect(html).toContain('.print-sheet .ps-ranking-row--current')
    expect(html).toContain("document.body.classList.add('printing')")
  })

  test('unifies map image, ranking image, and pdf export into a single dialog triggered from map corner', () => {
    expect(html).toContain('id="export-item-map"')
    expect(html).toContain('id="export-item-ranking"')
    expect(html).toContain('id="export-item-pdf"')
    expect(html).toContain('id="share-fab"')
    expect(html).not.toContain('id="panel-export-btn"')
  })

  test('includes population-weighted walking and bike time to next station in context metrics', () => {
    expect(html).toContain("stationAccessMetric('foot', 'Ø zu Fuß zur nächsten Haltestelle')")
    expect(html).toContain("stationAccessMetric('bike', 'Ø mit dem Rad zur nächsten Haltestelle')")
    expect(html).toContain("note: 'entlang der Wege, einwohnergewichtet'")
    expect(html).toContain('transitIndex?.byId[id]?.access?.[mode]?.[0]')
    expect(html).not.toContain("key: 'stationAccess'")
  })

  test('preloads MapLibre JS and preconnects to map tile origins for faster Core Web Vitals', () => {
    expect(html).toContain(
      '<link rel="preload" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" as="script"',
    )
    expect(html).toContain('<link rel="preconnect" href="https://api.maptiler.com"')
    expect(html).toContain('<link rel="preconnect" href="https://tiles.tilda-geo.de"')
    expect(html).toContain('<link rel="dns-prefetch" href="https://tile.openstreetmap.de"')
  })

  test('prevents mobile sheet scroll jumping on filter changes by guarding scrollTop resets and ranking scroll', () => {
    expect(html).toContain("if (freshSelection && (wasPeek || wasFull)) setSheetState('half');")
    expect(html).toContain('if (freshSelection && panelMain) panelMain.scrollTop = 0;')
    expect(html).toContain('if (opts && opts.scrollIntoView) {')
    expect(html).toContain('const prevScrollTop = panelMain ? panelMain.scrollTop : 0;')
  })

  test('shares view natively via navigator.share on mobile and falls back to clipboard copy', () => {
    expect(html).toContain("typeof navigator.share === 'function'")
    expect(html).toContain('Ansicht teilen')
    expect(html).toContain('✓ Geteilt!')
    expect(html).toContain('✓ Link kopiert!')
  })
})

describe('generateViewerHtml inline script', () => {
  // The page script is a TS template literal: a JS '\n' written as '\n' (not '\\n') becomes a
  // real line break inside a string literal, the whole script fails to parse and the site is
  // blank. Happened twice; parse every inline script so it can't ship again.
  test('every inline <script> parses', () => {
    const html = generateViewerHtml('2026-10-11T00:00:00.000Z', '11.10.2026')
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1] ?? '')
      .filter((code) => code.trim())
    expect(scripts.length).toBeGreaterThan(0)
    for (const code of scripts) {
      // Compiles only; nothing runs.
      expect(() => new Script(code)).not.toThrow()
    }
  })
})
