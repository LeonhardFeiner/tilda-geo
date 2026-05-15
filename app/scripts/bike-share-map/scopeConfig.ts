import type { MapScopeConfig } from './types'

export function slugifyOutputDir(name: string) {
  const n = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return n.slice(0, 80) || 'landkreis'
}

export function buildLandkreisScope(landkreis: { id: string; name: string }) {
  return {
    id: 'landkreis',
    title: landkreis.name,
    filter: { landkreisId: landkreis.id, level: '8' },
    center: { lng: 10.5, lat: 48.8 },
    zoom: 10,
    outputSubdir: slugifyOutputDir(landkreis.name),
    labelMinZoom: 11,
    bikelanesMinZoom: 10,
  } satisfies MapScopeConfig
}
