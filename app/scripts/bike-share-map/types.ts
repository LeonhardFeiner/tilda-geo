export type RegionStat = {
  id: string
  name: string
  roadSumKm: number
  bikelaneSumKm: number
  bikeSharePct: number | null
}

export type StatsFilter = {
  level: '6' | '8'
  bundeslandId?: string
  landkreisId?: string
}

export type MapScopeId = 'landkreis' | 'bayern-landkreise' | 'bayern-gemeinden'

export type MapScopeConfig = {
  id: MapScopeId
  title: string
  filter: StatsFilter
  center: { lng: number; lat: number }
  zoom: number
  outputSubdir: string
  labelMinZoom?: number
  bikelanesMinZoom?: number
}
