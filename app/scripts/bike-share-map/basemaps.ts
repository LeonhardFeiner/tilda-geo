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
    description: 'Carto Positron – wenig Straßenkontrast, Orientierung möglich (Standard)',
    attribution: '© CARTO © OpenStreetMap',
  },
  {
    id: 'muted',
    label: 'Gedeckt',
    description: 'Carto Voyager – etwas mehr Kontext als „hell“',
    attribution: '© CARTO © OpenStreetMap',
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
        ? 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        : basemapId === 'muted'
          ? 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution =
    basemapId === 'de'
      ? '© OpenStreetMap Deutschland / FOSSGIS'
      : basemapId === 'osm'
        ? '© OpenStreetMap'
        : '© CARTO © OpenStreetMap contributors'

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
