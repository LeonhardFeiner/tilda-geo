/**
 * MapTiler key, shared with the main app (`src/.../Map/utils/maptilerApiKey.const.ts`).
 * MapTiler hosts the Positron/Voyager styles that CARTO's free basemap CDN no longer serves
 * without a key. This value ships in the generated static HTML; lock it to the viewer's
 * domain(s) in the MapTiler dashboard (Account → Keys → HTTP referrers).
 */
const MAPTILER_KEY = 'ECOoUBmpqklzSCASXxcu'

export type BasemapId = 'blank' | 'de' | 'light' | 'muted' | 'osm'

export type BasemapOption = {
  id: BasemapId
  label: string
  description: string
  attribution: string
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: 'blank',
    label: 'Leer',
    description: 'Neutraler Hintergrund – beste Lesbarkeit für Radnetz & Flächenfarben',
    attribution: '',
  },
  {
    id: 'light',
    label: 'Hell',
    description: 'Positron (MapTiler) – wenig Straßenkontrast, Orientierung möglich (Standard)',
    attribution: '© MapTiler © OpenStreetMap',
  },
  {
    id: 'muted',
    label: 'Gedeckt',
    description: 'Voyager (MapTiler) – etwas mehr Kontext als „hell“',
    attribution: '© MapTiler © OpenStreetMap',
  },
  {
    id: 'de',
    label: 'OSM Deutschland',
    description: 'OpenStreetMap mit deutschen Beschriftungen',
    attribution: '© OpenStreetMap Deutschland / FOSSGIS',
  },
  {
    id: 'osm',
    label: 'OSM international',
    description: 'Klassische OSM-Karte (oft englische Beschriftung) – viel Detail',
    attribution: '© OpenStreetMap',
  },
]

export const DEFAULT_BASEMAP: BasemapId = 'light'

export function parseBasemapId(value: string | undefined) {
  const id = (value ?? DEFAULT_BASEMAP) as BasemapId
  if (!BASEMAP_OPTIONS.some((b) => b.id === id)) {
    throw new Error(
      `Unknown basemap "${value}". Use: ${BASEMAP_OPTIONS.map((b) => b.id).join(', ')}`,
    )
  }
  return id
}

/** MapLibre style JSON (embedded in generated HTML). */
export function buildBasemapStyleJson(basemapId: BasemapId) {
  if (basemapId === 'blank') {
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#f2f2ec' },
        },
      ],
    }
  }

  const tiles =
    basemapId === 'de'
      ? 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'
      : basemapId === 'light'
        ? `https://api.maptiler.com/maps/positron/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
        : basemapId === 'muted'
          ? `https://api.maptiler.com/maps/voyager/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution =
    basemapId === 'de'
      ? '© OpenStreetMap Deutschland / FOSSGIS'
      : basemapId === 'osm'
        ? '© OpenStreetMap'
        : '© MapTiler © OpenStreetMap contributors'

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tiles],
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: 'basemap-raster',
        type: 'raster',
        source: 'basemap',
        paint: basemapId === 'osm' || basemapId === 'de' ? {} : { 'raster-opacity': 0.92 },
      },
    ],
  }
}
