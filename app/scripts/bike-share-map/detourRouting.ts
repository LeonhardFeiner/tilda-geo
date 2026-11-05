/**
 * Detour map ("Umweg-Karte"): graph format, bike stress model and the shortest-path search that
 * runs in the browser. Pure — no DOM, no DB — so fetchDetourGraph.ts (build), the page
 * (detourPage.ts, via the detourRouting.js bundle) and the tests share one definition.
 *
 * The question the page answers: from one place, how much longer (km, climb, minutes) is a bike
 * route that avoids traffic than the usual car road to every other place of the Landkreis?
 * "Avoids traffic" is a slider: 0 = fastest legal bike route, 1 = stays off busy roads.
 *
 * Graph: one node array (lon/lat/elevation), two directed-capable edge sets over it — `bike`
 * from TILDA's `routing` table (every bike-legal segment with its category and speed context)
 * and `car` from `roads`. Edges carry length, climb per direction, speed per direction and, for
 * bikes, a precomputed stress score 0..100 — so the browser never needs the category tables.
 */
import { decode, encode } from '@msgpack/msgpack'

export const DETOUR_GRAPH_VERSION = 1

/** Node coordinates are stored as integers of this many degrees. */
export const COORD_SCALE = 1e6
/** Edge interior points: coarser (≈1 m), they are only drawn. */
export const GEOM_SCALE = 1e5

/** Stress is stored as 0..100; the cost formula uses it as 0..1. */
export const STRESS_SCALE = 100

/**
 * Cost = time × (1 + safety × STRESS_WEIGHT × stress). At safety 1 a 100 km/h road without a
 * cycleway (stress 1) counts seven times its time, a 50 km/h town street (stress 0.35) about
 * three times.
 */
export const STRESS_WEIGHT = 6

/** From this slider position on, edges at or above CLOSED_STRESS are not used at all. */
export const CLOSE_FROM_SAFETY = 0.8
export const CLOSED_STRESS = 0.7

/** Snapping a place to the network: beyond this it stays unrouted. */
export const SNAP_MAX_M = 400

/**
 * Car routes cost travel time plus this many seconds per km, like the distance term in OSRM's
 * or Valhalla's car profiles. Pure fastest-path picked 40 km motorway loops over 27 km direct
 * country roads to save a minute; nobody drives that, and it made bike detours look small.
 */
export const CAR_SECONDS_PER_KM = 30

export type PlaceKind = 'city' | 'town' | 'village' | 'hamlet'

export type DetourPlace = {
  /** OSM node id. */
  id: number
  name: string
  kind: PlaceKind
  lon: number
  lat: number
  population: number | null
  /** OSM id of the level-8 Gemeinde ("relation/…") and its name. */
  gemeindeId: string | null
  gemeinde: string | null
  /** Graph node the place is snapped to per network; -1 when nothing is within SNAP_MAX_M. */
  bikeNode: number
  carNode: number
}

export type EdgeSet = {
  count: number
  from: Int32Array
  to: Int32Array
  /** Metres. */
  len: Uint16Array
  /** Climb in metres along the edge, forward (from→to) and backward. */
  upF: Uint16Array
  upB: Uint16Array
  /** km/h per direction; 0 = not passable that way. */
  kmhF: Uint8Array
  kmhB: Uint8Array
  /** 0..100 (bike only; all 0 for cars). */
  stress: Uint8Array
  /** Index into `meta.categories` (bike) / `meta.roadClasses` (car). */
  cat: Uint8Array
  /**
   * Interior polyline points (between the two nodes) as zigzag-varint deltas of 1/GEOM_SCALE°
   * from the `from` node, concatenated; `geomOffset[e]..geomOffset[e+1]` is edge e's slice.
   */
  geom: Uint8Array
  geomOffset: Uint32Array
}

export type DetourGraphMeta = {
  landkreisId: string
  landkreisName: string
  osmDataFrom: string | null
  builtAt: string
  demSource: string
  /** Bike edge category labels, indexed by `bike.cat`. */
  categories: string[]
  /** Car edge road classes, indexed by `car.cat`. */
  roadClasses: string[]
  /** Simplified outline of the Landkreis, [lon, lat] rings. */
  outline: number[][][]
  bbox: [number, number, number, number]
}

export type DetourGraph = {
  version: number
  meta: DetourGraphMeta
  nodeCount: number
  lon: Float64Array
  lat: Float64Array
  /** Metres above sea level, rounded. */
  elev: Int16Array
  bike: EdgeSet
  car: EdgeSet
  places: DetourPlace[]
}

// --------------------------------------------------------------------------- stress model

/**
 * TILDA routing categories grouped by how a cyclist shares the road. Anything not listed is
 * treated as mixed traffic with motor vehicles (the safe assumption for an unknown category).
 */
const SEPARATED = new Set([
  'cycleway_adjoining',
  'cycleway_isolated',
  'cycleway_adjoiningOrIsolated',
  'cyclewayOnHighwayProtected',
  'footAndCyclewayShared_adjoining',
  'footAndCyclewayShared_isolated',
  'footAndCyclewayShared_adjoiningOrIsolated',
  'footAndCyclewaySegregated_adjoining',
  'footAndCyclewaySegregated_isolated',
  'footAndCyclewaySegregated_adjoiningOrIsolated',
  'footwayBicycleYes_adjoining',
  'footwayBicycleYes_isolated',
  'footwayBicycleYes_adjoiningOrIsolated',
  'cyclewayLink',
  'crossing',
  'pedestrianAreaBicycleYes',
  'bicycleRoad',
  'bicycleRoad_vehicleDestination',
  'livingStreet',
  'mixedTrafficFoot',
])
const ON_ROAD_EXCLUSIVE = new Set([
  'cyclewayOnHighway_exclusive',
  'cyclewayOnHighway_advisoryOrExclusive',
  'cyclewayOnHighwayBetweenLanes',
])
const ON_ROAD_SHARED = new Set([
  'cyclewayOnHighway_advisory',
  'sharedMotorVehicleLane',
  'sharedBusLaneBusWithBike',
  'sharedBusLaneBikeWithBus',
  'needsClarification',
])

/** Stress share of a minor connecting road (`unclassified`) relative to a classified road at the same limit. */
export const MINOR_ROAD_FACTOR = 0.6

/** Mixed traffic: how stressful a speed limit feels; between the steps it is interpolated. */
const MIXED_BY_KMH: Array<[number, number]> = [
  [10, 0],
  [30, 0.1],
  [50, 0.35],
  [70, 0.7],
  [100, 1],
]

function interpolate(steps: Array<[number, number]>, x: number) {
  const first = steps[0]!
  const last = steps[steps.length - 1]!
  if (x <= first[0]) return first[1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < steps.length; i++) {
    const [x1, y1] = steps[i]!
    const [x0, y0] = steps[i - 1]!
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return last[1]
}

/**
 * Stress 0..1 of a bike edge from its TILDA category and the speed limit of the motor traffic
 * next to or around it. `limitKmh` is the (inferred) maxspeed of the carriageway; null when
 * unknown — then the road class decides (`ruralDefault`: rural main roads are 100 km/h).
 */
export function bikeStress(category: string, limitKmh: number | null, road: string | null) {
  if (SEPARATED.has(category)) return 0
  const kmh = limitKmh ?? defaultLimitForRoad(road)
  // Gemeindeverbindungsstraßen (unclassified) are legally 100 km/h out of town but carry little
  // traffic; as full-stress roads they would close most village links at high slider values.
  const mixed = interpolate(MIXED_BY_KMH, kmh) * (road === 'unclassified' ? MINOR_ROAD_FACTOR : 1)
  if (ON_ROAD_EXCLUSIVE.has(category)) return Math.min(1, mixed * 0.6)
  if (ON_ROAD_SHARED.has(category)) return Math.min(1, mixed * 0.8)
  return mixed
}

/** Speed limit to assume when none is tagged or inferred; 50 for anything not listed. */
const DEFAULT_LIMIT_BY_ROAD: Record<string, number> = {
  living_street: 10,
  pedestrian: 10,
  bicycle_road: 10,
  residential: 30,
  residential_priority_road: 30,
  service_road: 30,
  service_alley: 30,
  service_driveway: 30,
  service_uncategorized: 30,
  service_emergency_access: 30,
  service: 30,
  track: 30,
  path: 30,
  footway: 30,
  cycleway: 30,
  motorway: 130,
  trunk: 100,
  primary: 100,
  secondary: 100,
  tertiary: 100,
  unclassified: 100,
}

export function defaultLimitForRoad(road: string | null) {
  return (road && DEFAULT_LIMIT_BY_ROAD[road]) || 50
}

// --------------------------------------------------------------------------- packing

function packTyped(arr: ArrayBufferView) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
}

/** Copies so the view is aligned regardless of where msgpack placed the bytes. */
function unpackTyped<T extends ArrayBufferView>(
  bytes: Uint8Array,
  Ctor: new (buffer: ArrayBuffer) => T,
) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Ctor(copy.buffer)
}

function packEdges(set: EdgeSet) {
  return {
    count: set.count,
    from: packTyped(set.from),
    to: packTyped(set.to),
    len: packTyped(set.len),
    upF: packTyped(set.upF),
    upB: packTyped(set.upB),
    kmhF: set.kmhF,
    kmhB: set.kmhB,
    stress: set.stress,
    cat: set.cat,
    geom: set.geom,
    geomOffset: packTyped(set.geomOffset),
  }
}

type PackedEdges = Record<keyof EdgeSet, Uint8Array | number>

function unpackEdges(p: PackedEdges): EdgeSet {
  const u8 = (k: keyof EdgeSet) => p[k] as Uint8Array
  return {
    count: p.count as number,
    from: unpackTyped(u8('from'), Int32Array),
    to: unpackTyped(u8('to'), Int32Array),
    len: unpackTyped(u8('len'), Uint16Array),
    upF: unpackTyped(u8('upF'), Uint16Array),
    upB: unpackTyped(u8('upB'), Uint16Array),
    kmhF: u8('kmhF'),
    kmhB: u8('kmhB'),
    stress: u8('stress'),
    cat: u8('cat'),
    geom: u8('geom'),
    geomOffset: unpackTyped(u8('geomOffset'), Uint32Array),
  }
}

export function encodeDetourGraph(graph: DetourGraph): Uint8Array {
  const lon = new Int32Array(graph.nodeCount)
  const lat = new Int32Array(graph.nodeCount)
  for (let i = 0; i < graph.nodeCount; i++) {
    lon[i] = Math.round(graph.lon[i]! * COORD_SCALE)
    lat[i] = Math.round(graph.lat[i]! * COORD_SCALE)
  }
  return encode({
    version: DETOUR_GRAPH_VERSION,
    meta: graph.meta,
    nodeCount: graph.nodeCount,
    lon: packTyped(lon),
    lat: packTyped(lat),
    elev: packTyped(graph.elev),
    bike: packEdges(graph.bike),
    car: packEdges(graph.car),
    places: graph.places,
  })
}

export function decodeDetourGraph(bytes: Uint8Array): DetourGraph {
  const raw = decode(bytes) as {
    version: number
    meta: DetourGraphMeta
    nodeCount: number
    lon: Uint8Array
    lat: Uint8Array
    elev: Uint8Array
    bike: PackedEdges
    car: PackedEdges
    places: DetourPlace[]
  }
  if (raw?.version !== DETOUR_GRAPH_VERSION) {
    throw new Error(`Unbekannte Umweg-Graph-Version ${String(raw?.version)}`)
  }
  const lonI = unpackTyped(raw.lon, Int32Array)
  const latI = unpackTyped(raw.lat, Int32Array)
  const lon = new Float64Array(raw.nodeCount)
  const lat = new Float64Array(raw.nodeCount)
  for (let i = 0; i < raw.nodeCount; i++) {
    lon[i] = lonI[i]! / COORD_SCALE
    lat[i] = latI[i]! / COORD_SCALE
  }
  return {
    version: raw.version,
    meta: raw.meta,
    nodeCount: raw.nodeCount,
    lon,
    lat,
    elev: unpackTyped(raw.elev, Int16Array),
    bike: unpackEdges(raw.bike),
    car: unpackEdges(raw.car),
    places: raw.places,
  }
}

/** Zigzag-varint deltas of integer pairs, relative to (x0, y0). */
export function encodeDeltaPoints(points: Array<[number, number]>, x0: number, y0: number) {
  const out: number[] = []
  const push = (n: number) => {
    let z = n < 0 ? -2 * n - 1 : 2 * n
    while (z >= 0x80) {
      out.push((z % 0x80) | 0x80)
      z = Math.floor(z / 0x80)
    }
    out.push(z)
  }
  let px = x0
  let py = y0
  for (const [x, y] of points) {
    push(x - px)
    push(y - py)
    px = x
    py = y
  }
  return Uint8Array.from(out)
}

export function decodeDeltaPoints(
  bytes: Uint8Array,
  start: number,
  end: number,
  x0: number,
  y0: number,
) {
  const points: Array<[number, number]> = []
  let z = 0
  let mul = 1
  let x = x0
  let y = y0
  let pending: number | null = null
  for (let i = start; i < end; i++) {
    const b = bytes[i]!
    z += (b & 0x7f) * mul
    if (b & 0x80) {
      mul *= 0x80
      continue
    }
    const v = z % 2 ? -(z + 1) / 2 : z / 2
    z = 0
    mul = 1
    if (pending === null) {
      pending = v
    } else {
      x += pending
      y += v
      points.push([x, y])
      pending = null
    }
  }
  return points
}

/** Full polyline of an edge in the given direction, as [lon, lat] pairs. */
export function edgeCoordinates(graph: DetourGraph, set: EdgeSet, e: number, forward = true) {
  const a = set.from[e]!
  const b = set.to[e]!
  const x0 = Math.round(graph.lon[a]! * GEOM_SCALE)
  const y0 = Math.round(graph.lat[a]! * GEOM_SCALE)
  const interior = decodeDeltaPoints(set.geom, set.geomOffset[e]!, set.geomOffset[e + 1]!, x0, y0)
  const coords: Array<[number, number]> = [[graph.lon[a]!, graph.lat[a]!]]
  for (const [x, y] of interior) coords.push([x / GEOM_SCALE, y / GEOM_SCALE])
  coords.push([graph.lon[b]!, graph.lat[b]!])
  return forward ? coords : coords.reverse()
}

// --------------------------------------------------------------------------- search

export type Adjacency = {
  /** CSR: node n's outgoing entries are `first[n]..first[n+1]`. */
  first: Int32Array
  edge: Int32Array
  /** 1 = traversed from→to, 0 = to→from. */
  forward: Uint8Array
  target: Int32Array
}

/** Both traversal directions of every edge; impassable directions are left out. */
export function buildAdjacency(set: EdgeSet, nodeCount: number): Adjacency {
  const degree = new Int32Array(nodeCount + 1)
  for (let e = 0; e < set.count; e++) {
    if (set.kmhF[e]! > 0) degree[set.from[e]!]!++
    if (set.kmhB[e]! > 0) degree[set.to[e]!]!++
  }
  const first = new Int32Array(nodeCount + 1)
  for (let n = 0; n < nodeCount; n++) first[n + 1] = first[n]! + degree[n]!
  const fill = first.slice(0, nodeCount)
  const total = first[nodeCount]!
  const edge = new Int32Array(total)
  const forward = new Uint8Array(total)
  const target = new Int32Array(total)
  for (let e = 0; e < set.count; e++) {
    if (set.kmhF[e]! > 0) {
      const i = fill[set.from[e]!]!++
      edge[i] = e
      forward[i] = 1
      target[i] = set.to[e]!
    }
    if (set.kmhB[e]! > 0) {
      const i = fill[set.to[e]!]!++
      edge[i] = e
      forward[i] = 0
      target[i] = set.from[e]!
    }
  }
  return { first, edge, forward, target }
}

export type SearchResult = {
  /** Generalised cost (seconds-equivalent); Infinity = unreachable. */
  cost: Float64Array
  /** Plain travel time in seconds, path length in metres and climb in metres along the chosen route. */
  seconds: Float64Array
  metres: Float64Array
  climb: Float64Array
  /** Adjacency entry used to reach each node, -1 for the source / unreached. */
  via: Int32Array
}

/**
 * Travel-time Dijkstra from `source`. `safety` ∈ [0, 1] weights the edge stress (see
 * STRESS_WEIGHT); for the car set stress is 0 and `safety` has no effect.
 */
export function shortestPaths(
  set: EdgeSet,
  adj: Adjacency,
  nodeCount: number,
  source: number,
  safety: number,
  /** Extra cost in seconds per km on top of travel time (see CAR_SECONDS_PER_KM); 0 = pure time. */
  secondsPerKm = 0,
): SearchResult {
  const cost = new Float64Array(nodeCount).fill(Number.POSITIVE_INFINITY)
  const seconds = new Float64Array(nodeCount)
  const metres = new Float64Array(nodeCount)
  const climb = new Float64Array(nodeCount)
  const via = new Int32Array(nodeCount).fill(-1)
  const result = { cost, seconds, metres, climb, via }
  if (source < 0 || source >= nodeCount) return result
  const closeBusy = safety >= CLOSE_FROM_SAFETY
  const closedStress = CLOSED_STRESS * STRESS_SCALE
  const weight = safety * STRESS_WEIGHT

  // Binary heap of (cost, node); stale entries are skipped on pop.
  let heapKeys = new Float64Array(1024)
  let heapNodes = new Int32Array(1024)
  let size = 0
  const push = (k: number, n: number) => {
    if (size === heapKeys.length) {
      const nk = new Float64Array(size * 2)
      nk.set(heapKeys)
      heapKeys = nk
      const nn = new Int32Array(size * 2)
      nn.set(heapNodes)
      heapNodes = nn
    }
    let i = size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heapKeys[p]! <= k) break
      heapKeys[i] = heapKeys[p]!
      heapNodes[i] = heapNodes[p]!
      i = p
    }
    heapKeys[i] = k
    heapNodes[i] = n
  }
  const pop = () => {
    const topNode = heapNodes[0]!
    size--
    if (size > 0) {
      const k = heapKeys[size]!
      const n = heapNodes[size]!
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= size) break
        if (c + 1 < size && heapKeys[c + 1]! < heapKeys[c]!) c++
        if (heapKeys[c]! >= k) break
        heapKeys[i] = heapKeys[c]!
        heapNodes[i] = heapNodes[c]!
        i = c
      }
      heapKeys[i] = k
      heapNodes[i] = n
    }
    return topNode
  }

  cost[source] = 0
  push(0, source)
  const done = new Uint8Array(nodeCount)
  while (size > 0) {
    const key = heapKeys[0]!
    const u = pop()
    if (done[u]) continue
    if (key > cost[u]!) continue
    done[u] = 1
    for (let i = adj.first[u]!; i < adj.first[u + 1]!; i++) {
      const e = adj.edge[i]!
      const fwd = adj.forward[i] === 1
      const kmh = fwd ? set.kmhF[e]! : set.kmhB[e]!
      if (kmh === 0) continue
      const stress = set.stress[e]!
      if (closeBusy && stress >= closedStress) continue
      const len = set.len[e]!
      const time = len / (kmh / 3.6)
      const edgeCost = time * (1 + weight * (stress / STRESS_SCALE)) + (len / 1000) * secondsPerKm
      const v = adj.target[i]!
      const next = cost[u]! + edgeCost
      if (next < cost[v]!) {
        cost[v] = next
        seconds[v] = seconds[u]! + time
        metres[v] = metres[u]! + len
        climb[v] = climb[u]! + (fwd ? set.upF[e]! : set.upB[e]!)
        via[v] = i
        push(next, v)
      }
    }
  }
  return result
}

/** Route from the search source to `target` as [lon, lat] pairs; empty when unreachable. */
export function routeCoordinates(
  graph: DetourGraph,
  set: EdgeSet,
  adj: Adjacency,
  result: SearchResult,
  target: number,
) {
  if (target < 0 || !Number.isFinite(result.cost[target]!)) return [] as Array<[number, number]>
  const segments: Array<Array<[number, number]>> = []
  let n = target
  let guard = graph.nodeCount + 1
  while (result.via[n]! >= 0 && guard-- > 0) {
    const i = result.via[n]!
    const e = adj.edge[i]!
    const fwd = adj.forward[i] === 1
    segments.push(edgeCoordinates(graph, set, e, fwd))
    n = fwd ? set.from[e]! : set.to[e]!
  }
  segments.reverse()
  const coords: Array<[number, number]> = []
  for (const seg of segments) {
    for (let k = coords.length ? 1 : 0; k < seg.length; k++) coords.push(seg[k]!)
  }
  return coords
}

/** Edge indices of the route (in travel order) with their direction, for colouring by stress. */
export function routeEdges(set: EdgeSet, adj: Adjacency, result: SearchResult, target: number) {
  const out: Array<{ edge: number; forward: boolean }> = []
  if (target < 0 || !Number.isFinite(result.cost[target]!)) return out
  let n = target
  let guard = result.via.length + 1
  while (result.via[n]! >= 0 && guard-- > 0) {
    const i = result.via[n]!
    const e = adj.edge[i]!
    const fwd = adj.forward[i] === 1
    out.push({ edge: e, forward: fwd })
    n = fwd ? set.from[e]! : set.to[e]!
  }
  return out.reverse()
}

// --------------------------------------------------------------------------- per-place table

export type DetourRow = {
  index: number
  place: DetourPlace
  /** Straight line, km. */
  airKm: number
  /** The route the bike route is compared with: the usual car route or the fastest bike route. */
  ref: { km: number; min: number } | null
  bike: { km: number; min: number; climbM: number } | null
  /** Extra km / climb / minutes of the bike route over the reference; null when either is missing. */
  extraKm: number | null
  extraClimbM: number | null
  extraMin: number | null
  /** bike km ÷ reference km. */
  factor: number | null
}

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number) {
  const d2r = Math.PI / 180
  const dLat = (lat2 - lat1) * d2r
  const dLon = (lon2 - lon1) * d2r
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h))
}

/**
 * One row per place other than the origin. `ref` is the search the bike route is compared with:
 * the car search (`refNode` 'carNode', the default) or a bike search at safety 0 ('bikeNode') —
 * then the row answers what the low-traffic route costs over the fastest bike route. Extra climb
 * compares the two routes, not the bike route with zero.
 */
export function detourTable(
  graph: DetourGraph,
  originIndex: number,
  ref: SearchResult,
  bike: SearchResult,
  refNode: 'carNode' | 'bikeNode' = 'carNode',
): DetourRow[] {
  const origin = graph.places[originIndex]!
  const rows: DetourRow[] = []
  graph.places.forEach((place, index) => {
    if (index === originIndex) return
    const rn = place[refNode]
    const refOk = rn >= 0 && Number.isFinite(ref.cost[rn]!)
    const bikeOk = place.bikeNode >= 0 && Number.isFinite(bike.cost[place.bikeNode]!)
    const refRow = refOk ? { km: ref.metres[rn]! / 1000, min: ref.seconds[rn]! / 60 } : null
    const bikeRow = bikeOk
      ? {
          km: bike.metres[place.bikeNode]! / 1000,
          min: bike.seconds[place.bikeNode]! / 60,
          climbM: bike.climb[place.bikeNode]!,
        }
      : null
    const both = refRow && bikeRow
    rows.push({
      index,
      place,
      airKm: haversineKm(origin.lon, origin.lat, place.lon, place.lat),
      ref: refRow,
      bike: bikeRow,
      extraKm: both ? bikeRow.km - refRow.km : null,
      extraClimbM: both ? bikeRow.climbM - ref.climb[rn]! : null,
      extraMin: both ? bikeRow.min - refRow.min : null,
      factor: both && refRow.km > 0 ? bikeRow.km / refRow.km : null,
    })
  })
  return rows
}
