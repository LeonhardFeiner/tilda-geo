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

/** Values above this % use the max choropleth color; gradient runs 0 → this when data exceeds it. */
export const BIKE_SHARE_COLOR_CAP_PCT = 50

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
