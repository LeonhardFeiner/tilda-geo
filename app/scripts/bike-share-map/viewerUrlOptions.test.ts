import { describe, expect, test } from 'vitest'
import {
  clampOverlayMinZoom,
  mapPositionFromUrl,
  parseBoolParam,
  parseHexColorParam,
  parseMapString,
  readViewerUrlOptions,
  type ViewerOptionDefaults,
  type ViewerOptionState,
  type ViewerUrlConfig,
  writeViewerUrlOptions,
} from './viewerUrlOptions'

const cfg: ViewerUrlConfig = {
  basemapIds: ['blank', 'de', 'light', 'muted', 'osm'],
  colorScaleIds: ['traffic', 'green', 'colorblind'],
  overlayMinZoomLimits: { min: 6, max: 16 },
  overlayRoadFullMinZoomLimits: { min: 11, max: 16 },
  defaultOverlayMinZoom: { bikelane: 10, roadMajor: 8, roadFull: 12 },
}

const defaults: ViewerOptionDefaults = {
  basemap: 'light',
  bikelanes: true,
  roads: false,
  busyRoads: false,
  rankingOpen: true,
  rankingMode: 'topflop',
  metric: 'bikeShare',
  colors: 'traffic',
  capPct: 20,
  capEnabled: false,
  robustScale: true,
  bikelaneColor: '#1b5e20',
  roadColor: '#555555',
  bikelaneMinZoom: 10,
  roadMinZoomMajor: 8,
  roadMinZoomFull: 12,
}

describe('parameter parsing', () => {
  test('booleans: off-words are false, absent is the fallback', () => {
    expect(parseBoolParam('0', true)).toBe(false)
    expect(parseBoolParam('OFF', true)).toBe(false)
    expect(parseBoolParam('1', false)).toBe(true)
    expect(parseBoolParam('', true)).toBe(true)
    expect(parseBoolParam(null, null)).toBeNull()
  })

  test('colours with or without #, anything else rejected', () => {
    expect(parseHexColorParam('1A2B3C')).toBe('#1a2b3c')
    expect(parseHexColorParam('#abcdef')).toBe('#abcdef')
    expect(parseHexColorParam('red')).toBeNull()
  })

  test('zoom thresholds are rounded and clamped', () => {
    expect(clampOverlayMinZoom('12.6', 10, cfg.overlayMinZoomLimits)).toBe(13)
    expect(clampOverlayMinZoom('99', 10, cfg.overlayMinZoomLimits)).toBe(16)
    expect(clampOverlayMinZoom('x', 10, cfg.overlayMinZoomLimits)).toBe(10)
  })

  test('older parameter names are still read', () => {
    const o = readViewerUrlOptions(
      new URLSearchParams('bikelaneColor=00ff00&roadMinZoom=9&strassenMinZoomVoll=13'),
      cfg,
    )
    expect(o.bikelaneColor).toBe('#00ff00')
    expect(o.roadMinZoomMajor).toBe(9)
    expect(o.roadMinZoomFull).toBe(13)
  })

  test('unknown basemaps, colour scales and metrics count as absent', () => {
    const o = readViewerUrlOptions(new URLSearchParams('basemap=x&colors=y&metrik=z'), cfg)
    expect([o.basemap, o.colors, o.metric]).toEqual([null, null, null])
  })
})

describe('writing', () => {
  const state: ViewerOptionState = { ...defaults, minimal: false }

  test('a default state writes nothing and clears stale parameters', () => {
    const params = new URLSearchParams('radwege=0&colors=green&gebiet=relation/1')
    writeViewerUrlOptions(params, state, defaults)
    expect(params.toString()).toBe('gebiet=relation%2F1')
  })

  test('every changed option survives a round trip', () => {
    const changed: ViewerOptionState = {
      minimal: true,
      basemap: 'osm',
      bikelanes: false,
      roads: true,
      busyRoads: true,
      rankingOpen: false,
      rankingMode: 'all',
      metric: 'modelGap',
      colors: 'colorblind',
      capPct: 15,
      capEnabled: true,
      robustScale: false,
      bikelaneColor: '#123456',
      roadColor: '#abcdef',
      bikelaneMinZoom: 12,
      roadMinZoomMajor: 9,
      roadMinZoomFull: 14,
    }
    const params = new URLSearchParams()
    writeViewerUrlOptions(params, changed, defaults)
    const { minimal: _minimal, ...expected } = changed
    expect(readViewerUrlOptions(params, cfg)).toEqual(expected)
    expect(params.get('minimal')).toBe('1')
  })
})

describe('map position', () => {
  test('hash form zoom/lat/lng with optional bearing and pitch', () => {
    expect(parseMapString('#map=10/48.5/11.5/20/90')).toEqual({
      zoom: 10,
      center: [11.5, 48.5],
      bearing: 20,
      pitch: 85,
    })
    expect(parseMapString('#map=30/48.5/11.5')).toBeNull()
  })

  test('hash wins over ?map=, which wins over lat/lng', () => {
    const params = new URLSearchParams('map=8/50/10&lat=1&lng=2')
    expect(mapPositionFromUrl('#map=9/48/11', params)?.zoom).toBe(9)
    expect(mapPositionFromUrl('', params)?.zoom).toBe(8)
    expect(mapPositionFromUrl('', new URLSearchParams('lat=48&lon=11'))).toEqual({
      zoom: 10,
      center: [11, 48],
      bearing: 0,
      pitch: 0,
    })
  })
})
