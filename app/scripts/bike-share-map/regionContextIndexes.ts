/**
 * Region-level context indexes the viewer reads (gemeinde-peers / -density / -transit.json):
 * demographic peer buckets, population density and public-transport/motorway access, for
 * Gemeinden, Landkreise (summed from their Gemeinden, or the kreisfreie Stadt itself) and
 * Länder (summed, or the Stadtstaat's own Destatis rows). Pure, so it can be tested; buildViewer
 * does the file I/O.
 */
import {
  buildPeerGroupIndex,
  classifyLandkreisPeer,
  LANDKREIS_PEER_LABELS,
  type PeerDemographics,
} from './demographicPeers'

export type ContextFeature = {
  properties?: {
    id?: string
    level?: string
    regionalschluessel?: string
    landkreis_id?: string
    bundesland_id?: string
  }
}

export type DemographicsRow = {
  rs: string
  population: number
  urbanizationCode: PeerDemographics['urbanizationCode']
  densityPerKm2: number
  areaKm2: number
}

export type TransitSources = {
  counts?: Record<string, { stopCount?: number; avgDistanceToStationM?: number }>
  /** {mode: [minutes, km, % within 10 min]} per region (fetchStationAccess.ts). */
  access?: Record<string, Record<string, [number, number, number]>>
  highway?: Record<string, { avgDistanceToHighwayM?: number }>
}

export type TransitEntry = {
  density?: number
  avgDistanceToStationM?: number
  avgDistanceToHighwayM?: number
  access?: Record<string, [number, number, number]>
}

export function buildRegionContextIndexes(
  features: ContextFeature[],
  gemeinden: DemographicsRow[],
  transit: TransitSources | null,
) {
  const demoByRs = new Map(gemeinden.map((g) => [g.rs, g]))
  const demographicsByRs = new Map<string, PeerDemographics>(
    gemeinden.map((g) => [
      g.rs,
      { population: g.population, urbanizationCode: g.urbanizationCode },
    ]),
  )

  const rsById = new Map<string, string>()
  const areaById = new Map<string, number>()
  const popById = new Map<string, number>()
  const densityById: Record<string, number> = {}

  const gemsByLkId = new Map<string, ContextFeature[]>()
  const gemsByBlId = new Map<string, ContextFeature[]>()
  const push = (map: Map<string, ContextFeature[]>, key: string, f: ContextFeature) => {
    const arr = map.get(key) ?? []
    arr.push(f)
    map.set(key, arr)
  }
  for (const f of features) {
    const p = f.properties
    if (!p?.id || String(p.level) !== '8') continue
    const id = String(p.id)
    if (p.regionalschluessel) {
      const rs = String(p.regionalschluessel)
      rsById.set(id, rs)
      const d = demoByRs.get(rs)
      if (d) {
        areaById.set(id, d.areaKm2)
        popById.set(id, d.population)
        densityById[id] = d.densityPerKm2
      }
    }
    if (p.landkreis_id) push(gemsByLkId, String(p.landkreis_id), f)
    if (p.bundesland_id) push(gemsByBlId, String(p.bundesland_id), f)
  }

  const peers = buildPeerGroupIndex(rsById, demographicsByRs)
  const sumChildren = (children: ContextFeature[]) => {
    let pop = 0
    let area = 0
    for (const c of children) {
      pop += popById.get(String(c.properties?.id)) ?? 0
      area += areaById.get(String(c.properties?.id)) ?? 0
    }
    return { pop, area }
  }

  // Landkreise: summed from their Gemeinden; a kreisfreie Stadt (no Gemeinde inside) from its
  // own Destatis row.
  for (const f of features) {
    const p = f.properties
    if (!p?.id || String(p.level) !== '6') continue
    const id = String(p.id)
    const children = gemsByLkId.get(id) ?? []
    let { pop, area } = sumChildren(children)
    if (!children.length) {
      const rs = String(p.regionalschluessel ?? '')
      const item = demoByRs.get(rs) ?? gemeinden.find((g) => rs && g.rs.startsWith(rs))
      if (item) {
        pop = item.population
        area = item.areaKm2
      }
    }
    if (area > 0) {
      areaById.set(id, area)
      popById.set(id, pop)
      densityById[id] = pop / area
      peers.byId[id] = classifyLandkreisPeer(pop, area, children.length <= 1)
    }
  }
  for (const [k, lbl] of Object.entries(LANDKREIS_PEER_LABELS)) peers.groups[k] = lbl

  // Länder: summed from their Gemeinden; the Stadtstaaten (no level-8 Gemeinde) from every
  // Destatis row under their Regionalschlüssel prefix.
  for (const f of features) {
    const p = f.properties
    if (!p?.id || String(p.level) !== '4') continue
    const id = String(p.id)
    let { pop, area } = sumChildren(gemsByBlId.get(id) ?? [])
    if (pop === 0) {
      const rs = String(p.regionalschluessel ?? '')
      for (const g of gemeinden) {
        if (rs && g.rs.startsWith(rs)) {
          pop += g.population
          area += g.areaKm2
        }
      }
    }
    if (area > 0) {
      areaById.set(id, area)
      popById.set(id, pop)
      densityById[id] = pop / area
    }
  }

  // Stop density = stops / Destatis area; distances pass through (already population-weighted).
  let transitById: Record<string, TransitEntry> | null = null
  if (transit) {
    transitById = {}
    const counts = transit.counts ?? {}
    const access = transit.access ?? {}
    const highway = transit.highway ?? {}
    const allIds = new Set([
      ...Object.keys(counts),
      ...Object.keys(access),
      ...Object.keys(highway),
    ])
    for (const id of allIds) {
      const entry = counts[id]
      const areaKm2 = areaById.get(id)
      const out: TransitEntry = access[id] ? { access: access[id] } : {}
      if (typeof entry?.stopCount === 'number' && typeof areaKm2 === 'number' && areaKm2 > 0) {
        out.density = entry.stopCount / areaKm2
      }
      if (typeof entry?.avgDistanceToStationM === 'number') {
        out.avgDistanceToStationM = entry.avgDistanceToStationM
      }
      if (typeof highway[id]?.avgDistanceToHighwayM === 'number') {
        out.avgDistanceToHighwayM = highway[id].avgDistanceToHighwayM
      }
      if (Object.keys(out).length) transitById[id] = out
    }
  }

  return { peers, densityById, transitById }
}
