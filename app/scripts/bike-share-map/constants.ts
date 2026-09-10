import type { MapScopeConfig } from './types'

export const BAYERN_ID = 'relation/2145268'

export const DEFAULT_STATS_CSV = new URL(
  '../stats-export/aggregated_lengths_wide_2026-05-14_204302.csv',
  import.meta.url,
)

export const TILDA_BIKELANES_TILES =
  'https://tiles.tilda-geo.de/atlas_generalized_bikelanes/{z}/{x}/{y}'

export const TILDA_ROADS_TILES = 'https://tiles.tilda-geo.de/atlas_generalized_roads/{z}/{x}/{y}'

export const DEFAULT_STATS_API_URL = 'https://tilda-geo.de/api/stats'

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
 * share pages; regions elsewhere fall back to the generic card. Rendering every German region
 * is ~10k images per build, so this stays scoped by default. Override with a comma-separated
 * `BIKE_SHARE_OG_BUNDESLAENDER` (or `all`).
 */
export const SHARE_PAGE_OG_IMAGE_BUNDESLAENDER: readonly string[] =
  process.env.BIKE_SHARE_OG_BUNDESLAENDER?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [BAYERN_ID]

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

export const BAYERN_SCOPES = {
  'bayern-landkreise': {
    id: 'bayern-landkreise',
    title: 'Bayern – Landkreise & kreisfreie Städte',
    filter: { bundeslandId: BAYERN_ID, level: '6' },
    center: { lng: 11.5, lat: 48.9 },
    zoom: 7,
    outputSubdir: 'bayern-landkreise',
    labelMinZoom: 8,
    bikelanesMinZoom: 9,
  },
  'bayern-gemeinden': {
    id: 'bayern-gemeinden',
    title: 'Bayern – Gemeinden',
    filter: { bundeslandId: BAYERN_ID, level: '8' },
    center: { lng: 11.5, lat: 48.9 },
    zoom: 7,
    outputSubdir: 'bayern-gemeinden',
    labelMinZoom: 10,
    bikelanesMinZoom: 11,
  },
} satisfies Record<string, MapScopeConfig>
