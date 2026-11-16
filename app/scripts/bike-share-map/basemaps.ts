import OPENFREEMAP_POSITRON from './openfreemap-positron.style.json'
/**
 * MapTiler key of the viewer's own account (not the main app's key in
 * `src/.../Map/utils/maptilerApiKey.const.ts`), used for the Voyager raster tiles only. This
 * value ships in the generated static HTML, so the key is locked to leonhardfeiner.github.io and
 * radweg.bfschweitenkirchen.de in the MapTiler dashboard (API keys → Allowed HTTP Origins); other
 * origins get 403, and the key has a monthly quota.
 */
const MAPTILER_KEY = 'dqv1OYKsRa6PDhSk0rNV'

/**
 * The default "Hell" basemap: the Positron style as vector tiles from OpenFreeMap — no key, no
 * quota. Snapshot of https://tiles.openfreemap.org/styles/positron (tiles, glyphs and sprites
 * stay on tiles.openfreemap.org); refresh the file to pick up upstream style changes.
 */

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
    description: 'Positron (OpenFreeMap) – wenig Straßenkontrast, Orientierung möglich (Standard)',
    attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap',
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

  if (basemapId === 'light') {
    // A copy per call: the generated pages embed and may mutate it.
    return JSON.parse(JSON.stringify(OPENFREEMAP_POSITRON)) as typeof OPENFREEMAP_POSITRON
  }

  const tiles =
    basemapId === 'de'
      ? 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'
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
