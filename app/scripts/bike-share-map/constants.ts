export const BAYERN_ID = 'relation/2145268'

export const TILDA_BIKELANES_TILES =
  'https://tiles.tilda-geo.de/atlas_generalized_bikelanes/{z}/{x}/{y}'

export const TILDA_ROADS_TILES = 'https://tiles.tilda-geo.de/atlas_generalized_roads/{z}/{x}/{y}'

export const DEFAULT_STATS_API_URL = 'https://tilda-geo.de/api/stats'

/**
 * Classes of the traffic-count map layer (Kfz/24h, Straßenverkehrszählung 2021), lowest first;
 * `min` is inclusive. 2,500 and 4,000 are not both edges: the ERA threshold depends on the speed,
 * which the popup states per section. Sequential light-to-dark, readable with colour-vision
 * deficiency without a separate palette.
 */
export const TRAFFIC_COUNT_CLASSES = [
  { min: 0, label: 'unter 1.000', color: '#fed976' },
  { min: 1000, label: '1.000–2.500', color: '#fd8d3c' },
  { min: 2500, label: '2.500–5.000', color: '#e31a1c' },
  { min: 5000, label: '5.000–10.000', color: '#a50f15' },
  { min: 10000, label: 'über 10.000', color: '#4a1486' },
] as const

export const TRAFFIC_UNCOUNTED_COLOR = '#6b7280'

/** A BAYSIS counting point's page: append the Zählstellennummer. */
export const BAYSIS_ZAEHLSTELLE_URL_PREFIX =
  'https://www.baysis.bayern.de/internet/verdat/svz/zaehlstelle/index.html?jahr=2021&zaehlstellennummer='

/** BASt page of the 2021 count results (no per-section pages). */
export const BAST_SVZ_PAGE =
  'https://www.bast.de/DE/Publikationen/Statistik/Verkehrsdaten/Manuelle-Zaehlung.html'

export const PROJECT_LEAD = 'Leonhard Feiner'

export const VIEWER_SOURCE_REPO_URL = 'https://github.com/LeonhardFeiner/tilda-geo'

/**
 * Absolute base URL the viewer is deployed to — needed for the per-region share pages, whose
 * `og:image` / canonical links must be absolute for link-preview crawlers. Override with
 * `BIKE_SHARE_PAGE_BASE_URL` when deploying the viewer somewhere else.
 */
export const SHARE_PAGE_BASE_URL =
  process.env.BIKE_SHARE_PAGE_BASE_URL || 'https://leonhardfeiner.github.io/tilda-geo/'

/**
 * Bundesländer (OSM relation ids) that get a rendered per-region Open Graph image on their
 * share pages; regions elsewhere fall back to the generic card. Default `all`: every German
 * region (~11k palette PNGs, ~250 MB, a few minutes per build). Narrow it with a comma-separated
 * `BIKE_SHARE_OG_BUNDESLAENDER`, e.g. the Bayern id for quick local builds.
 */
export const SHARE_PAGE_OG_IMAGE_BUNDESLAENDER: readonly string[] =
  process.env.BIKE_SHARE_OG_BUNDESLAENDER?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? ['all']

/** Folder (inside the viewer output) with the per-Landkreis Gemeinde polygon files. */
export const GEMEINDE_GEOMETRY_DIR = 'gemeinde-geometry'

/** Values above this % use the max choropleth color; gradient runs 0 → this when data exceeds it. */
export const BIKE_SHARE_COLOR_CAP_PCT = 50

/** Default line color for Straßen vector overlay in the interactive viewer. */
export const DEFAULT_ROAD_OVERLAY_COLOR = '#546e7a'

/** MapLibre minzoom for Radwege line overlay (tiles load from zoom 4). */
export const DEFAULT_OVERLAY_BIKELANE_MIN_ZOOM = 9

/** Straßen: Hauptstraßen vs. Wohnstraßen (aligned with tile generalization). */
export const DEFAULT_OVERLAY_ROAD_MIN_ZOOM_MAJOR = 9
export const DEFAULT_OVERLAY_ROAD_MIN_ZOOM_FULL = 11

/** Lower bound from processing/topics/roads_bikelanes/roads/RoadGeneralization.lua */
export const TILE_ROAD_RESIDENTIAL_MIN_ZOOM = 11

export const OVERLAY_LINE_MIN_ZOOM_LIMITS = { min: 4, max: 14 } as const

/** UI range for Wohnstraßen – cannot go below tile generalization. */
export const OVERLAY_ROAD_FULL_MIN_ZOOM_LIMITS = {
  min: TILE_ROAD_RESIDENTIAL_MIN_ZOOM,
  max: OVERLAY_LINE_MIN_ZOOM_LIMITS.max,
} as const

/**
 * Unlisted "nearest station" map (stationAreasPage.ts) — linked from nowhere and marked
 * noindex. Its data file uses the same stem.
 */
export const STATION_AREAS_PAGE_STEM = 'naechste-station'

/**
 * Unlisted detour map (detourPage.ts): safe bike route vs. usual car road between the places
 * of a Landkreis. Linked only from the region card of Gemeinden whose Landkreis has a graph in
 * output/detour/ (fetchDetourGraph.ts).
 */
export const DETOUR_PAGE_STEM = 'umweg'
export const DETOUR_DIR = 'detour'

/**
 * File names inside output/viewer/ that the build writes and the page fetches. One place, so the
 * build, the page (generateViewerHtml CONFIG), the CSV and the model fit can't drift apart.
 */
export const VIEWER_FILES = {
  statsCore: 'stats-core.msgpack',
  /** The Gemeinden (level 8) of stats-core, fetched right after it so the first map is faster. */
  statsGemeinden: 'stats-gemeinden.msgpack',
  statsExtra: 'stats-extra.msgpack',
  lazyDarstellungPresence: 'lazy-darstellung-presence.json',
  neighborsMsgpack: 'neighbors.msgpack',
  neighborsJson: 'neighbors.json',
  manifest: 'manifest.json',
  peers: 'gemeinde-peers.json',
  density: 'gemeinde-density.json',
  transit: 'gemeinde-transit.json',
  terrain: 'gemeinde-terrain.json',
  zensus: 'gemeinde-zensus.json',
  cars: 'gemeinde-cars.json',
  calmed: 'gemeinde-calmed.json',
  accidents: 'gemeinde-accidents.json',
  commuters: 'gemeinde-commuters.json',
  mapping: 'gemeinde-mapping.json',
  traffic: 'gemeinde-traffic.json',
  trafficFederal: 'gemeinde-traffic-federal.json',
  regiostar: 'gemeinde-regiostar.json',
  atlas: 'gemeinde-atlas.json',
  busyRoads: 'busy-roads.geojson',
  trafficCounts: 'traffic-counts.geojson',
  history: 'history.json',
} as const

/**
 * Context datasets copied from output/<source> into output/viewer/<VIEWER_FILES[key]> as
 * {byId}. Each is optional: absent until its fetch script has run, and the page then omits it.
 */
/** The sibling file with a context dataset's Gemeindeverbände/Stadtbezirke entries. */
export const contextExtraFile = (file: string) => file.replace(/\.json$/, '-extra.json')

export const VIEWER_PASS_THROUGH_DATASETS = [
  { key: 'terrain', source: 'terrain-flatness.json', label: 'Terrain' },
  {
    key: 'zensus',
    source: 'zensus-housing-demographics.json',
    label: 'Zensus housing & demographics',
  },
  { key: 'cars', source: 'car-density.json', label: 'KBA car density' },
  { key: 'calmed', source: 'calmed-roads.json', label: 'Traffic calmed road share' },
  { key: 'accidents', source: 'accidents.json', label: 'Destatis Unfallatlas' },
  { key: 'commuters', source: 'commuters.json', label: 'BA commuter statistics' },
  { key: 'mapping', source: 'mapping-completeness.json', label: 'OSM mapping completeness' },
  { key: 'traffic', source: 'traffic-volumes.json', label: 'BAYSIS traffic volumes (Bayern)' },
  {
    key: 'trafficFederal',
    source: 'traffic-federal.json',
    label: 'Traffic volumes on Bundesstraßen (Germany)',
  },
  { key: 'regiostar', source: 'regiostar.json', label: 'BMDV RegioStaR spatial types' },
  { key: 'atlas', source: 'deutschlandatlas.json', label: 'Deutschlandatlas Gemeinde indicators' },
] as const satisfies ReadonlyArray<{
  key: keyof typeof VIEWER_FILES
  source: string
  label: string
}>

/** Year of the Destatis Unfallatlas release used (fetchAccidents.ts); labels read it from here. */
export const UNFALLATLAS_YEAR = 2025

/** KBA FZ 3 release (stock on 1 January of that year) used by fetchCarDensity.ts. */
export const KBA_FZ3_YEAR = 2026
