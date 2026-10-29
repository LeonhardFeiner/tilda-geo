/**
 * The viewer's display options in the URL (basemap, overlays, colours, ranking, map metric, zoom
 * thresholds, map position): parsing and writing, as typed pure functions. The page script
 * (generateViewerHtml.ts) only moves values between these and its controls; it reaches this module
 * as the `ViewerUrl` global (viewerUrlOptions.bundle.ts).
 *
 * Reading never returns a default for a missing parameter: `null` means "not in the URL", and the
 * page decides whether that keeps the current control value (first load) or resets it (Back /
 * Forward, where a missing parameter means the default of the state being restored).
 */

export const MAP_METRICS = [
  'bikeShare',
  'modelGap',
  'mappingDepth',
  'busyFederalCovered',
  'cars',
  'rent',
  'density',
  'accidents',
  'commuters',
  'stationBike',
] as const
export type MapMetric = (typeof MAP_METRICS)[number]
export type RankingMode = 'topflop' | 'all'

export type ZoomLimits = { min: number; max: number }

export type ViewerUrlConfig = {
  basemapIds: readonly string[]
  colorScaleIds: readonly string[]
  overlayMinZoomLimits: ZoomLimits
  overlayRoadFullMinZoomLimits: ZoomLimits
  defaultOverlayMinZoom: { bikelane: number; roadMajor: number; roadFull: number }
}

/** What the URL says, per option; `null` = the parameter is absent or invalid. */
export type ViewerUrlOptions = {
  basemap: string | null
  bikelanes: boolean | null
  roads: boolean | null
  busyRoads: boolean | null
  trafficCounts: boolean | null
  rankingOpen: boolean | null
  rankingMode: RankingMode | null
  metric: MapMetric | null
  colors: string | null
  capPct: number | null
  capEnabled: boolean | null
  robustScale: boolean | null
  bikelaneColor: string | null
  roadColor: string | null
  bikelaneMinZoom: number | null
  roadMinZoomMajor: number | null
  roadMinZoomFull: number | null
}

/** "0", "false", "no", "off" are false; anything else non-empty is true. */
export function parseBoolParam(value: string | null | undefined, defaultValue: boolean): boolean
export function parseBoolParam(value: string | null | undefined, defaultValue: null): boolean | null
export function parseBoolParam(value: string | null | undefined, defaultValue: boolean | null) {
  if (value == null || value === '') return defaultValue
  const v = value.toLowerCase()
  return !(v === '0' || v === 'false' || v === 'no' || v === 'off')
}

/** "#1a2b3c" or "1a2b3c" → "#1a2b3c" (lower case); anything else → null. */
export function parseHexColorParam(value: string | null | undefined) {
  if (value == null || value === '') return null
  const v = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null
}

export function hexColorWithoutHash(value: string) {
  return value.replace(/^#/, '').toLowerCase()
}

export function clampOverlayMinZoom(value: unknown, fallback: number, limits: ZoomLimits) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(limits.min, Math.min(limits.max, Math.round(n)))
}

/** The first present, non-empty parameter among aliases (older names stay readable). */
function firstParam(params: URLSearchParams, ...names: string[]) {
  for (const name of names) {
    const v = params.get(name)
    if (v != null && v !== '') return v
  }
  return null
}

export function readViewerUrlOptions(
  params: URLSearchParams,
  cfg: ViewerUrlConfig,
): ViewerUrlOptions {
  const basemap = params.get('basemap')
  const rankingMode = params.get('rankingMode')
  const metric = params.get('metrik')
  const colors = params.get('colors')
  const cap = firstParam(params, 'cap')
  const capNum = cap == null ? Number.NaN : Number(cap)
  const bikeZoom = firstParam(params, 'radwegeMinZoom', 'bikelaneMinZoom', 'radwegeMinzoom')
  const roadMajor = firstParam(
    params,
    'strassenMinZoomMajor',
    'strassenMinZoom',
    'roadMinZoom',
    'strassenMinzoom',
  )
  const roadFull = firstParam(params, 'strassenMinZoomFull', 'strassenMinZoomVoll')
  return {
    basemap: basemap && cfg.basemapIds.includes(basemap) ? basemap : null,
    bikelanes: parseBoolParam(params.get('radwege'), null),
    roads: parseBoolParam(params.get('strassen'), null),
    busyRoads: parseBoolParam(params.get('verkehr'), null),
    trafficCounts: parseBoolParam(params.get('zaehlung'), null),
    rankingOpen: parseBoolParam(params.get('ranking'), null),
    rankingMode: rankingMode === 'all' || rankingMode === 'topflop' ? rankingMode : null,
    metric:
      metric && (MAP_METRICS as readonly string[]).includes(metric) ? (metric as MapMetric) : null,
    colors: colors && cfg.colorScaleIds.includes(colors) ? colors : null,
    capPct: Number.isFinite(capNum) ? capNum : null,
    capEnabled: parseBoolParam(params.get('capEnabled'), null),
    robustScale: parseBoolParam(params.get('robustScale'), null),
    bikelaneColor: parseHexColorParam(
      firstParam(params, 'radfarbe', 'radwegeFarbe', 'bikelaneColor'),
    ),
    roadColor: parseHexColorParam(
      firstParam(params, 'strassenfarbe', 'strassenFarbe', 'roadColor'),
    ),
    bikelaneMinZoom:
      bikeZoom == null
        ? null
        : clampOverlayMinZoom(
            bikeZoom,
            cfg.defaultOverlayMinZoom.bikelane,
            cfg.overlayMinZoomLimits,
          ),
    roadMinZoomMajor:
      roadMajor == null
        ? null
        : clampOverlayMinZoom(
            roadMajor,
            cfg.defaultOverlayMinZoom.roadMajor,
            cfg.overlayMinZoomLimits,
          ),
    roadMinZoomFull:
      roadFull == null
        ? null
        : clampOverlayMinZoom(
            roadFull,
            cfg.defaultOverlayMinZoom.roadFull,
            cfg.overlayRoadFullMinZoomLimits,
          ),
  }
}

/** The page's current option values, as the controls hold them. */
export type ViewerOptionState = {
  minimal: boolean
  basemap: string
  bikelanes: boolean
  roads: boolean
  busyRoads: boolean
  trafficCounts: boolean
  rankingOpen: boolean
  rankingMode: RankingMode
  metric: MapMetric
  colors: string
  capPct: number
  capEnabled: boolean
  robustScale: boolean
  bikelaneColor: string
  roadColor: string
  bikelaneMinZoom: number
  roadMinZoomMajor: number
  roadMinZoomFull: number
}

/** Defaults the URL leaves out; cap/robust/bike colour depend on the view and the colour scale. */
export type ViewerOptionDefaults = Omit<ViewerOptionState, 'minimal'>

/**
 * Writes every option that differs from its default and removes the ones that don't, so a link
 * only spells out what the visitor changed.
 */
export function writeViewerUrlOptions(
  params: URLSearchParams,
  state: ViewerOptionState,
  defaults: ViewerOptionDefaults,
) {
  const put = (name: string, value: string | null) => {
    if (value == null) params.delete(name)
    else params.set(name, value)
  }
  put('minimal', state.minimal ? '1' : null)
  put('basemap', state.basemap !== defaults.basemap ? state.basemap : null)
  put('radwege', state.bikelanes !== defaults.bikelanes ? (state.bikelanes ? '1' : '0') : null)
  put('strassen', state.roads !== defaults.roads ? (state.roads ? '1' : '0') : null)
  put('verkehr', state.busyRoads !== defaults.busyRoads ? (state.busyRoads ? '1' : '0') : null)
  put(
    'zaehlung',
    state.trafficCounts !== defaults.trafficCounts ? (state.trafficCounts ? '1' : '0') : null,
  )
  put(
    'ranking',
    state.rankingOpen !== defaults.rankingOpen ? (state.rankingOpen ? '1' : '0') : null,
  )
  put('rankingMode', state.rankingMode !== defaults.rankingMode ? state.rankingMode : null)
  put('metrik', state.metric !== defaults.metric ? state.metric : null)
  put('colors', state.colors !== defaults.colors ? state.colors : null)
  put('cap', state.capPct !== defaults.capPct ? String(state.capPct) : null)
  put(
    'capEnabled',
    state.capEnabled !== defaults.capEnabled ? (state.capEnabled ? '1' : '0') : null,
  )
  put(
    'robustScale',
    state.robustScale !== defaults.robustScale ? (state.robustScale ? '1' : '0') : null,
  )
  const bike = state.bikelaneColor.toLowerCase()
  put('radfarbe', bike !== defaults.bikelaneColor.toLowerCase() ? hexColorWithoutHash(bike) : null)
  const road = state.roadColor.toLowerCase()
  put('strassenfarbe', road !== defaults.roadColor.toLowerCase() ? hexColorWithoutHash(road) : null)
  put(
    'radwegeMinZoom',
    state.bikelaneMinZoom !== defaults.bikelaneMinZoom ? String(state.bikelaneMinZoom) : null,
  )
  put(
    'strassenMinZoomMajor',
    state.roadMinZoomMajor !== defaults.roadMinZoomMajor ? String(state.roadMinZoomMajor) : null,
  )
  put(
    'strassenMinZoomFull',
    state.roadMinZoomFull !== defaults.roadMinZoomFull ? String(state.roadMinZoomFull) : null,
  )
}

export type MapPosition = {
  zoom: number
  center: [number, number]
  bearing: number
  pitch: number
}

function validPosition(zoom: number, lat: number, lng: number, bearing: number, pitch: number) {
  if (![zoom, lat, lng].every(Number.isFinite)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || zoom < 0 || zoom > 24) return null
  return {
    zoom,
    center: [lng, lat] as [number, number],
    bearing: Number.isFinite(bearing) ? bearing : 0,
    pitch: Number.isFinite(pitch) ? Math.max(0, Math.min(85, pitch)) : 0,
  }
}

/** "#map=zoom/lat/lng[/bearing[/pitch]]" (also "zoom,lat,lng") → position, else null. */
export function parseMapString(str: string | null | undefined): MapPosition | null {
  if (!str) return null
  let clean = str.trim()
  if (clean.startsWith('#')) clean = clean.slice(1).trim()
  if (clean.startsWith('map=')) clean = clean.slice(4).trim()
  const parts = clean.split(/[/,]/).map((s) => Number.parseFloat(s.trim()))
  if (parts.length < 3) return null
  const [zoom = Number.NaN, lat = Number.NaN, lng = Number.NaN, bearing = 0, pitch = 0] = parts
  return validPosition(zoom, lat, lng, bearing, pitch)
}

/** Map position from the hash, `?map=`, or `?lat=&lng=&zoom=` (in that order of preference). */
export function mapPositionFromUrl(hash: string, params: URLSearchParams): MapPosition | null {
  const fromHash = hash ? parseMapString(hash) : null
  if (fromHash) return fromHash
  const fromQuery = parseMapString(params.get('map'))
  if (fromQuery) return fromQuery
  const lat = params.get('lat')
  const lng = params.get('lng') || params.get('lon')
  if (!lat || !lng) return null
  const zoom = params.get('zoom') || params.get('z')
  return validPosition(
    zoom ? Number.parseFloat(zoom) : 10,
    Number.parseFloat(lat),
    Number.parseFloat(lng),
    Number.parseFloat(params.get('bearing') || '0'),
    Number.parseFloat(params.get('pitch') || '0'),
  )
}
