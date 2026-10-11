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
})
