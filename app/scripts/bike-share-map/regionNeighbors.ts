import { decode, encode } from '@msgpack/msgpack'
import bbox from '@turf/bbox'
import booleanIntersects from '@turf/boolean-intersects'
import booleanTouches from '@turf/boolean-touches'
import type { RegionIndex, StatsFeature } from './regionNavigation'

export const NEIGHBORS_PACK_VERSION = 1

export type PrecomputedNeighborsFile = {
  version: typeof NEIGHBORS_PACK_VERSION
  landkreis: Record<string, string[]>
  landkreisStadtstaat: Record<string, string[]>
  gemeinde: Record<string, string[]>
}

export function encodeNeighborsPack(data: PrecomputedNeighborsFile) {
  return encode(data)
}

export function decodeNeighborsPack(bytes: Uint8Array) {
  const data = decode(bytes) as Partial<PrecomputedNeighborsFile>
  if (data.version !== NEIGHBORS_PACK_VERSION || !data.landkreis) {
    throw new Error('Ungültiges neighbors.msgpack')
  }
  return {
    version: NEIGHBORS_PACK_VERSION,
    landkreis: data.landkreis,
    landkreisStadtstaat: data.landkreisStadtstaat ?? {},
    gemeinde: data.gemeinde ?? {},
  } satisfies PrecomputedNeighborsFile
}

function regionLevel(f: StatsFeature) {
  return String(f.properties?.level ?? '')
}

function regionId(f: StatsFeature) {
  return String(f.properties?.id ?? '')
}

type Bbox = [number, number, number, number]

export type NeighborIndex = {
  landkreisNeighbors: Map<string, readonly string[]>
  landkreisStadtstaatNeighbors: Map<string, readonly string[]>
  /** Lazy browser-built entries. */
  gemeindeNeighbors: Map<string, readonly string[]>
  /** Pre-exported graph; kept as record to avoid parsing ~11k Map entries on load. */
  gemeindeNeighborRecord: Record<string, readonly string[]> | null
  precomputed: boolean
}

function recordToMap(record: Record<string, string[]>) {
  return new Map(Object.entries(record))
}

function gemeindeNeighborList(neighbors: NeighborIndex, gemeindeId: string) {
  return (
    neighbors.gemeindeNeighbors.get(gemeindeId) ?? neighbors.gemeindeNeighborRecord?.[gemeindeId]
  )
}

export function neighborIndexFromPrecomputed(data: PrecomputedNeighborsFile) {
  return {
    landkreisNeighbors: recordToMap(data.landkreis),
    landkreisStadtstaatNeighbors: recordToMap(data.landkreisStadtstaat),
    gemeindeNeighbors: new Map(),
    gemeindeNeighborRecord: data.gemeinde,
    precomputed: true,
  } satisfies NeighborIndex
}

export function neighborIndexToPrecomputedFile(neighbors: NeighborIndex) {
  const gemeindeSource =
    neighbors.gemeindeNeighborRecord ??
    Object.fromEntries(
      [...neighbors.gemeindeNeighbors.entries()].map(([id, list]) => [id, [...list]]),
    )
  const gemeinde = Object.fromEntries(
    Object.entries(gemeindeSource).map(([id, list]) => [id, [...list]]),
  )
  return {
    version: NEIGHBORS_PACK_VERSION,
    landkreis: Object.fromEntries(
      [...neighbors.landkreisNeighbors.entries()].map(([id, list]) => [id, [...list]]),
    ),
    landkreisStadtstaat: Object.fromEntries(
      [...neighbors.landkreisStadtstaatNeighbors.entries()].map(([id, list]) => [id, [...list]]),
    ),
    gemeinde,
  } satisfies PrecomputedNeighborsFile
}

export function precomputedNeighborsFileFromJson(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<PrecomputedNeighborsFile>
  if (data.version !== NEIGHBORS_PACK_VERSION) return null
  if (!data.landkreis || typeof data.landkreis !== 'object') return null
  return {
    version: NEIGHBORS_PACK_VERSION,
    landkreis: data.landkreis,
    landkreisStadtstaat: data.landkreisStadtstaat ?? {},
    gemeinde: data.gemeinde ?? {},
  } satisfies PrecomputedNeighborsFile
}

export function parsePrecomputedNeighborsJson(raw: unknown) {
  const file = precomputedNeighborsFileFromJson(raw)
  return file ? neighborIndexFromPrecomputed(file) : null
}

export function parsePrecomputedNeighborsJsonText(text: string) {
  try {
    return precomputedNeighborsFileFromJson(JSON.parse(text))
  } catch {
    return null
  }
}

function featureBbox(f: StatsFeature): Bbox | null {
  if (!f.geometry) return null
  try {
    return bbox(f as GeoJSON.Feature) as Bbox
  } catch {
    return null
  }
}

function bboxesOverlap(a: Bbox, b: Bbox) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

function featuresTouch(a: StatsFeature, b: StatsFeature) {
  try {
    return (
      booleanTouches(a as GeoJSON.Feature, b as GeoJSON.Feature) ||
      booleanIntersects(a as GeoJSON.Feature, b as GeoJSON.Feature)
    )
  } catch {
    return false
  }
}

function addSymmetricNeighbor(adj: Map<string, Set<string>>, a: string, b: string) {
  if (a === b) return
  const setA = adj.get(a) ?? new Set<string>()
  setA.add(b)
  adj.set(a, setA)
  const setB = adj.get(b) ?? new Set<string>()
  setB.add(a)
  adj.set(b, setB)
}

function freezeAdjacency(adj: Map<string, Set<string>>) {
  const out = new Map<string, readonly string[]>()
  for (const [id, neighbors] of adj) {
    out.set(id, [...neighbors])
  }
  return out
}

function gemeindeUnitIdsInLandkreise(landkreisIds: Iterable<string>, index: RegionIndex) {
  const lkSet = new Set(landkreisIds)
  const ids: string[] = []
  for (const f of index.byId.values()) {
    const id = regionId(f)
    const level = regionLevel(f)
    if (level === '8') {
      const lk = String(f.properties?.landkreis_id ?? '')
      if (lkSet.has(lk)) ids.push(id)
      continue
    }
    if (level === '6' && index.kreisfreieIds.has(id) && lkSet.has(id)) {
      ids.push(id)
    }
  }
  return ids
}

function landkreisIdsByBundesland(index: RegionIndex) {
  const byBl = new Map<string, string[]>()
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    const id = regionId(f)
    const bl = String(f.properties?.bundesland_id ?? '')
    if (!bl) continue
    const list = byBl.get(bl) ?? []
    list.push(id)
    byBl.set(bl, list)
  }
  return byBl
}

function buildLandkreisBboxes(index: RegionIndex) {
  const bboxes = new Map<string, Bbox>()
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    const id = regionId(f)
    const box = featureBbox(f)
    if (id && box) bboxes.set(id, box)
  }
  return bboxes
}

function buildLandkreisNeighbors(index: RegionIndex, bboxes: Map<string, Bbox>) {
  const adj = new Map<string, Set<string>>()
  const byBl = landkreisIdsByBundesland(index)

  for (const ids of byBl.values()) {
    for (let i = 0; i < ids.length; i++) {
      const idA = ids[i]!
      const fA = index.byId.get(idA)
      const boxA = bboxes.get(idA)
      if (!fA || !boxA) continue
      for (let j = i + 1; j < ids.length; j++) {
        const idB = ids[j]!
        const fB = index.byId.get(idB)
        const boxB = bboxes.get(idB)
        if (!fB || !boxB) continue
        if (!bboxesOverlap(boxA, boxB)) continue
        if (featuresTouch(fA, fB)) addSymmetricNeighbor(adj, idA, idB)
      }
    }
  }

  return freezeAdjacency(adj)
}

function buildLandkreisStadtstaatNeighbors(index: RegionIndex, bboxes: Map<string, Bbox>) {
  const stadtstaatIds = index.stadtstaaten.map((s) => s.id)
  const stadtstaatBboxes = new Map<string, Bbox>()
  for (const ssId of stadtstaatIds) {
    const f = index.byId.get(ssId)
    const box = f ? featureBbox(f) : null
    if (box) stadtstaatBboxes.set(ssId, box)
  }

  const out = new Map<string, readonly string[]>()
  for (const [lkId, boxLk] of bboxes) {
    const fLk = index.byId.get(lkId)
    if (!fLk) continue
    const touching: string[] = []
    for (const ssId of stadtstaatIds) {
      const boxSs = stadtstaatBboxes.get(ssId)
      const fSs = index.byId.get(ssId)
      if (!boxSs || !fSs) continue
      if (!bboxesOverlap(boxLk, boxSs)) continue
      if (featuresTouch(fLk, fSs)) touching.push(ssId)
    }
    if (touching.length) out.set(lkId, touching)
  }

  return out
}

/** Browser fallback when neighbors.json is missing (~few thousand Turf checks). */
export function buildNeighborIndex(index: RegionIndex): NeighborIndex {
  const bboxes = buildLandkreisBboxes(index)
  return {
    landkreisNeighbors: buildLandkreisNeighbors(index, bboxes),
    landkreisStadtstaatNeighbors: buildLandkreisStadtstaatNeighbors(index, bboxes),
    gemeindeNeighbors: new Map(),
    gemeindeNeighborRecord: null,
    precomputed: false,
  }
}

function neighborSet(id: string, neighbors: Map<string, readonly string[]>, includeSelf = true) {
  const out = new Set<string>()
  if (includeSelf) out.add(id)
  for (const n of neighbors.get(id) ?? []) out.add(n)
  return out
}

function computeLandkreisNeighborIds(landkreisId: string, index: RegionIndex) {
  const fA = index.byId.get(landkreisId)
  if (!fA) return [] as readonly string[]
  const bl = String(fA.properties?.bundesland_id ?? '')
  const touching: string[] = []
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    const idB = regionId(f)
    if (!idB || idB === landkreisId) continue
    if (bl && String(f.properties?.bundesland_id ?? '') !== bl) continue
    if (featuresTouch(fA, f)) touching.push(idB)
  }
  return touching
}

/** Resolves LK neighbors; fills cache when precomputed export omitted this Landkreis. */
function landkreisNeighborSet(landkreisId: string, index: RegionIndex, neighbors: NeighborIndex) {
  let list = neighbors.landkreisNeighbors.get(landkreisId)
  if (list === undefined) {
    list = computeLandkreisNeighborIds(landkreisId, index)
    neighbors.landkreisNeighbors.set(landkreisId, list)
  }
  const out = neighborSet(landkreisId, neighbors.landkreisNeighbors)
  for (const id of neighbors.landkreisStadtstaatNeighbors.get(landkreisId) ?? []) {
    out.add(id)
  }
  return out
}

function touchingStadtstaatenForFeature(
  featureId: string,
  index: RegionIndex,
  featureBboxes: Map<string, Bbox>,
) {
  const f = index.byId.get(featureId)
  const box = featureBboxes.get(featureId) ?? (f ? featureBbox(f) : null)
  if (!f || !box) return []
  if (featureBboxes.get(featureId) === undefined && box) {
    featureBboxes.set(featureId, box)
  }

  const touching: string[] = []
  for (const { id: ssId } of index.stadtstaaten) {
    const fSs = index.byId.get(ssId)
    if (!fSs) continue
    let boxSs = featureBboxes.get(ssId)
    if (!boxSs) {
      boxSs = featureBbox(fSs) ?? undefined
      if (boxSs) featureBboxes.set(ssId, boxSs)
    }
    if (!boxSs || !bboxesOverlap(box, boxSs)) continue
    if (featuresTouch(f, fSs)) touching.push(ssId)
  }
  return touching
}

function gemeindeNeighborsForFocus(
  gemeindeId: string,
  landkreisId: string,
  index: RegionIndex,
  neighbors: NeighborIndex,
) {
  const cached = gemeindeNeighborList(neighbors, gemeindeId)
  if (cached !== undefined) return new Set([gemeindeId, ...cached])

  const focus = index.byId.get(gemeindeId)
  if (!focus?.geometry) return new Set([gemeindeId])

  const touchingLk = landkreisNeighborSet(landkreisId, index, neighbors)
  const candidateIds = gemeindeUnitIdsInLandkreise(touchingLk, index)
  const featureBboxes = new Map<string, Bbox>()
  const focusBox = featureBbox(focus)
  if (focusBox) featureBboxes.set(gemeindeId, focusBox)

  const touching = new Set<string>([gemeindeId])
  for (const id of candidateIds) {
    if (id === gemeindeId) continue
    const f = index.byId.get(id)
    if (!f?.geometry) continue
    let box = featureBboxes.get(id)
    if (!box) {
      box = featureBbox(f) ?? undefined
      if (box) featureBboxes.set(id, box)
    }
    if (!box || !focusBox || !bboxesOverlap(focusBox, box)) continue
    if (featuresTouch(focus, f)) touching.add(id)
  }

  for (const ssId of touchingStadtstaatenForFeature(gemeindeId, index, featureBboxes)) {
    touching.add(ssId)
  }

  const withoutSelf = [...touching].filter((id) => id !== gemeindeId)
  neighbors.gemeindeNeighbors.set(gemeindeId, withoutSelf)
  return touching
}

export type LandkreisNeighborPresetId = 'lk_neighbors_landkreise' | 'lk_neighbors_gemeinden'

export function computeSimpleAllowedIds(
  preset: LandkreisNeighborPresetId | 'gm_neighbors' | 'neighbors_other' | 'lk_neighbors_other',
  ctx: {
    focusId: string
    landkreisId: string | null
    gemeindeId: string | null
    bundeslandId: string
  },
  index: RegionIndex,
  neighbors: NeighborIndex,
) {
  if (
    preset === 'lk_neighbors_other' ||
    ((preset === 'lk_neighbors_landkreise' ||
      preset === 'lk_neighbors_gemeinden' ||
      preset === 'neighbors_other') &&
      ctx.landkreisId &&
      !(preset === 'neighbors_other' && ctx.gemeindeId))
  ) {
    if (!ctx.landkreisId) return new Set([ctx.focusId])
    return landkreisNeighborSet(ctx.landkreisId, index, neighbors)
  }

  if (
    (preset === 'gm_neighbors' || preset === 'neighbors_other') &&
    ctx.gemeindeId &&
    ctx.landkreisId
  ) {
    return gemeindeNeighborsForFocus(ctx.gemeindeId, ctx.landkreisId, index, neighbors)
  }

  if (preset === 'gm_neighbors' && ctx.gemeindeId) {
    return new Set([ctx.gemeindeId])
  }
  return new Set([ctx.focusId])
}
