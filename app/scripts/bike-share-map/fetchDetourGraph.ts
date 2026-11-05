/**
 * Builds the routing graph of one Landkreis for the detour map (umweg.html): bike edges from
 * TILDA's `routing` table, car edges from `roads`, climb per edge from the Mapzen/AWS Terrarium
 * tiles, and the OSM place nodes (town/village/hamlet) of the Landkreis as origins/destinations.
 *
 *   bun run bike-share-map:detour-graph -- --landkreis relation/62371 [--buffer-km 4]
 *
 * Needs the local processing DB and routing/cache/places-de.json (routing/extract_places.py).
 * Writes output/detour/<id>.msgpack (committed; ~1 MB per Landkreis) and updates
 * output/detour/index.json, which buildViewer reads to know which Landkreise have a graph.
 *
 * Both tables come from the same OSM geometry, so identical coordinates mean the same OSM node:
 * that is how the ways are stitched into one node set. A junction is a coordinate shared by two
 * different OSM ways (a road's own bike-lane rows share every coordinate with it and must not
 * split it), a way end, or the point nearest to a place (so a hamlet halfway along a long road
 * attaches where it really is).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import sharp from 'sharp'
import { getBaseDatabaseUrl } from '@/server/database-url.server'
import {
  type DetourGraph,
  type DetourPlace,
  type EdgeSet,
  type PlaceKind,
  GEOM_SCALE,
  SNAP_MAX_M,
  STRESS_SCALE,
  bikeStress,
  encodeDeltaPoints,
  encodeDetourGraph,
  haversineKm,
} from './detourRouting'
import {
  assertDatasetCount,
  currentOsmDataFrom,
  downloadCachePath,
  OUTPUT_DIR,
} from './fetchCommon'

const OUT_DIR = join(OUTPUT_DIR, 'detour')
const INDEX_PATH = join(OUT_DIR, 'index.json')
const PLACES_PATH = join(import.meta.dir, 'routing', 'cache', 'places-de.json')

const DEFAULT_LANDKREIS = 'relation/62371' // Landkreis Pfaffenhofen an der Ilm
const DEFAULT_BUFFER_KM = 4
/** ~13 m/px at 48°N — village-to-village climb needs more than the 150 m of the Gemeinde metric. */
const TILE_ZOOM = 13
const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const DEM_SOURCE = 'Mapzen/AWS Terrain Tiles (Terrarium, z13)'
/** Elevation sample spacing along an edge. */
const SAMPLE_STEP_M = 25
/** Mixed in only at the ends of the moving mean; climbs below this per sample are DEM noise. */
const MIN_STEP_M = 0.5
/** Interior polyline points are stored at this resolution (1e-5° ≈ 1 m) after simplifying. */
const GEOM_SIMPLIFY_M = 1.5
const PLACE_KINDS: ReadonlySet<string> = new Set(['city', 'town', 'village', 'hamlet'])

// --------------------------------------------------------------------------- speed profiles
//
// Same spirit as routing/station_access.py: rough on purpose, no traffic lights, no traffic.

const BIKE_KMH_BY_ROAD: Record<string, number> = {
  living_street: 12,
  service_road: 15,
  service_alley: 15,
  service_driveway: 15,
  service_uncategorized: 15,
  service_emergency_access: 15,
  service: 15,
  track: 12,
  path: 12,
  bicycle_road: 18,
  pedestrian: 5,
  footway: 5,
  footway_crossing: 8,
  footway_steps: 2,
  steps: 2,
  cycleway: 18,
}
const BIKE_DEFAULT_KMH = 18
const PUSH_KMH = 5
const SURFACE_FACTOR: Record<string, number> = {
  compacted: 0.9,
  fine_gravel: 0.85,
  gravel: 0.75,
  pebblestone: 0.7,
  unpaved: 0.75,
  ground: 0.65,
  dirt: 0.65,
  earth: 0.65,
  grass: 0.55,
  sand: 0.5,
  mud: 0.5,
  woodchips: 0.6,
  sett: 0.8,
  cobblestone: 0.7,
  unhewn_cobblestone: 0.6,
  grass_paver: 0.7,
}

const CAR_DEFAULT_LIMIT: Record<string, number> = {
  motorway: 130,
  motorway_link: 60,
  trunk: 100,
  trunk_link: 50,
  primary: 70,
  primary_link: 40,
  secondary: 60,
  secondary_link: 40,
  tertiary: 50,
  tertiary_link: 30,
  unclassified: 50,
  residential: 30,
  residential_priority_road: 30,
  unspecified_road: 30,
  living_street: 10,
  bicycle_road: 10,
  service_road: 20,
  service_alley: 15,
  service_driveway: 10,
  service_uncategorized: 15,
}

function parseMaxspeed(value: string | null | undefined) {
  if (!value) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Typical average speed for a speed limit, interpolated between the steps. Country roads lose
 * more to curves, villages and junctions than the old flat 0.85 assumed; town roads at 50 move
 * faster than 0.6 × limit. Together with the per-km cost in the router this stops the car
 * route from swinging onto the motorway for a minute's gain.
 */
const CAR_AVERAGE_BY_LIMIT: Array<[number, number]> = [
  [10, 6],
  [30, 18],
  [50, 35],
  [60, 45],
  [70, 55],
  [100, 75],
  [130, 110],
]

function carAverageKmh(limit: number) {
  const steps = CAR_AVERAGE_BY_LIMIT
  if (limit <= steps[0]![0]) return (limit * steps[0]![1]) / steps[0]![0]
  for (let i = 1; i < steps.length; i++) {
    const [x1, y1] = steps[i]!
    const [x0, y0] = steps[i - 1]!
    if (limit <= x1) return y0 + ((limit - x0) / (x1 - x0)) * (y1 - y0)
  }
  return steps[steps.length - 1]![1]
}

// --------------------------------------------------------------------------- geometry helpers

const R = 6378137
function mercatorToLonLat(x: number, y: number): [number, number] {
  return [
    (x / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
  ]
}

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * 2 ** z)
}

type Tile = { data: Uint8Array; width: number; channels: number }

async function fetchTiles(bbox: [number, number, number, number], zoom: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const coords: Array<[number, number]> = []
  for (let x = lonToTileX(minLon, zoom); x <= lonToTileX(maxLon, zoom); x++) {
    for (let y = latToTileY(maxLat, zoom); y <= latToTileY(minLat, zoom); y++) coords.push([x, y])
  }
  const tiles = new Map<string, Tile>()
  let next = 0
  async function worker() {
    for (;;) {
      const coord = coords[next++]
      if (!coord) return
      const [x, y] = coord
      const cached = downloadCachePath(join('terrarium', String(zoom), `${x}-${y}.png`))
      let buf: Buffer
      if (existsSync(cached)) {
        buf = readFileSync(cached)
      } else {
        const res = await fetch(TILE_URL(zoom, x, y))
        if (!res.ok) continue
        buf = Buffer.from(await res.arrayBuffer())
        mkdirSync(join(cached, '..'), { recursive: true })
        writeFileSync(cached, buf)
      }
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
      tiles.set(`${x},${y}`, { data, width: info.width, channels: info.channels })
    }
  }
  await Promise.all(Array.from({ length: 16 }, worker))
  process.stdout.write(`Terrain: ${tiles.size}/${coords.length} tiles at zoom ${zoom}\n`)
  return tiles
}

/** Bilinear elevation sampler; null outside the fetched tiles. */
function makeElevationSampler(tiles: Map<string, Tile>, zoom: number) {
  const scale = 2 ** zoom
  const pixelAt = (tile: Tile, px: number, py: number) => {
    const x = Math.min(tile.width - 1, Math.max(0, px))
    const y = Math.min(tile.width - 1, Math.max(0, py))
    const idx = (y * tile.width + x) * tile.channels
    return tile.data[idx]! * 256 + tile.data[idx + 1]! + tile.data[idx + 2]! / 256 - 32768
  }
  return (lon: number, lat: number): number | null => {
    const fx = ((lon + 180) / 360) * scale
    const latRad = (lat * Math.PI) / 180
    const fy = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * scale
    const tx = Math.floor(fx)
    const ty = Math.floor(fy)
    const tile = tiles.get(`${tx},${ty}`)
    if (!tile) return null
    const px = (fx - tx) * tile.width - 0.5
    const py = (fy - ty) * tile.width - 0.5
    const x0 = Math.floor(px)
    const y0 = Math.floor(py)
    const ax = px - x0
    const ay = py - y0
    const v00 = pixelAt(tile, x0, y0)
    const v10 = pixelAt(tile, x0 + 1, y0)
    const v01 = pixelAt(tile, x0, y0 + 1)
    const v11 = pixelAt(tile, x0 + 1, y0 + 1)
    return (v00 * (1 - ax) + v10 * ax) * (1 - ay) + (v01 * (1 - ax) + v11 * ax) * ay
  }
}

/** Positive climb forward and backward along a polyline, from DEM samples every SAMPLE_STEP_M. */
function edgeClimb(
  coords: Array<[number, number]>,
  elevation: (lon: number, lat: number) => number | null,
) {
  const samples: number[] = []
  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]!
    if (i > 0) {
      const [plon, plat] = coords[i - 1]!
      const segM = haversineKm(plon, plat, lon, lat) * 1000
      const steps = Math.floor(segM / SAMPLE_STEP_M)
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1)
        const e = elevation(plon + (lon - plon) * t, plat + (lat - plat) * t)
        if (e !== null) samples.push(e)
      }
    }
    const e = elevation(lon, lat)
    if (e !== null) samples.push(e)
  }
  if (samples.length < 2) return { up: 0, down: 0 }
  // 3-sample moving mean takes the pixel staircase out before summing the climbs.
  const smooth = samples.map((v, i) => {
    const a = samples[i - 1] ?? v
    const b = samples[i + 1] ?? v
    return (a + v + b) / 3
  })
  let up = 0
  let down = 0
  for (let i = 1; i < smooth.length; i++) {
    const d = smooth[i]! - smooth[i - 1]!
    if (d > MIN_STEP_M) up += d
    else if (d < -MIN_STEP_M) down -= d
  }
  return { up, down }
}

function polylineMetres(coords: Array<[number, number]>) {
  let m = 0
  for (let i = 1; i < coords.length; i++) {
    const [alon, alat] = coords[i - 1]!
    const [blon, blat] = coords[i]!
    m += haversineKm(alon, alat, blon, blat) * 1000
  }
  return m
}

// --------------------------------------------------------------------------- graph assembly

type Way = {
  /** Coordinate keys (3857, cm) per vertex; the stitching identity. */
  keys: string[]
  coords: Array<[number, number]>
  parent: string
  /** Per-way attributes, resolved before splitting. */
  kmhF: number
  kmhB: number
  stress: number
  cat: number
}

type RoutingRow = {
  tags: Record<string, string | number | null | undefined>
  g: string
}
type RoadRow = {
  id: string
  road: string | null
  maxspeed: string | null
  oneway: string | null
  g: string
}

function parseLine(g: string) {
  const geom = JSON.parse(g) as { type: string; coordinates: number[][] }
  if (geom.type !== 'LineString') return null
  const keys: string[] = []
  const coords: Array<[number, number]> = []
  for (const [x, y] of geom.coordinates as Array<[number, number]>) {
    const key = `${x},${y}`
    if (keys.length && keys[keys.length - 1] === key) continue
    keys.push(key)
    coords.push(mercatorToLonLat(x, y))
  }
  return keys.length >= 2 ? { keys, coords } : null
}

/** Grid index over vertex coordinates for "nearest vertex of this network to a point". */
class VertexIndex {
  private cells = new Map<string, Array<{ key: string; lon: number; lat: number }>>()
  private cell = 0.005 // ≈ 400–550 m
  add(key: string, lon: number, lat: number) {
    const id = `${Math.floor(lon / this.cell)},${Math.floor(lat / this.cell)}`
    let list = this.cells.get(id)
    if (!list) this.cells.set(id, (list = []))
    list.push({ key, lon, lat })
  }
  nearest(lon: number, lat: number, maxM: number) {
    const cx = Math.floor(lon / this.cell)
    const cy = Math.floor(lat / this.cell)
    let best: { key: string; m: number } | null = null
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const v of this.cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const m = haversineKm(lon, lat, v.lon, v.lat) * 1000
          if (m <= maxM && (!best || m < best.m)) best = { key: v.key, m }
        }
      }
    }
    return best
  }
}

type EdgeDraft = {
  aKey: string
  bKey: string
  coords: Array<[number, number]>
  kmhF: number
  kmhB: number
  stress: number
  cat: number
}

/** Cuts every way at its junctions. */
function draftEdges(ways: Way[], isJunction: (key: string) => boolean) {
  const drafts: EdgeDraft[] = []
  for (const way of ways) {
    let start = 0
    for (let i = 1; i < way.keys.length; i++) {
      if (i < way.keys.length - 1 && !isJunction(way.keys[i]!)) continue
      drafts.push({
        aKey: way.keys[start]!,
        bKey: way.keys[i]!,
        coords: way.coords.slice(start, i + 1),
        kmhF: Math.round(way.kmhF),
        kmhB: Math.round(way.kmhB),
        stress: Math.round(way.stress * STRESS_SCALE),
        cat: way.cat,
      })
      start = i
    }
  }
  return drafts
}

/**
 * OSM splits ways where a name, lit or similar tag changes — nothing the router cares about.
 * A node that only joins two edges with identical attributes (and isn't a place's snap point)
 * disappears, the two edges become one. Cuts the edge count by about a third.
 */
function mergeChains(drafts: EdgeDraft[], protectedKeys: ReadonlySet<string>) {
  const alive = drafts.map(() => true)
  const incident = new Map<string, number[]>()
  const addIncident = (key: string, i: number) => {
    let list = incident.get(key)
    if (!list) incident.set(key, (list = []))
    list.push(i)
  }
  drafts.forEach((d, i) => {
    addIncident(d.aKey, i)
    addIncident(d.bKey, i)
  })
  const sameAttrs = (x: EdgeDraft, y: EdgeDraft, flipped: boolean) =>
    x.stress === y.stress &&
    x.cat === y.cat &&
    (flipped ? x.kmhF === y.kmhB && x.kmhB === y.kmhF : x.kmhF === y.kmhF && x.kmhB === y.kmhB)
  const flip = (d: EdgeDraft) => {
    d.coords.reverse()
    ;[d.aKey, d.bKey] = [d.bKey, d.aKey]
    ;[d.kmhF, d.kmhB] = [d.kmhB, d.kmhF]
  }
  let merged = 0
  for (const [key, list] of incident) {
    if (protectedKeys.has(key)) continue
    const ids = [...new Set(list)].filter((i) => alive[i])
    if (ids.length !== 2) continue
    const [i, j] = ids as [number, number]
    const x = drafts[i]!
    const y = drafts[j]!
    if (x.aKey === x.bKey || y.aKey === y.bKey) continue
    // Orient both so that x ends at key and y starts there.
    if (x.aKey === key) flip(x)
    if (y.bKey === key) flip(y)
    if (x.bKey !== key || y.aKey !== key) continue
    if (!sameAttrs(x, y, false)) continue
    if (x.aKey === y.bKey) continue // would form a loop edge
    x.coords = x.coords.concat(y.coords.slice(1))
    x.bKey = y.bKey
    alive[j] = false
    // y's far end now belongs to x.
    const far = incident.get(y.bKey)!
    far[far.indexOf(j)] = i
    merged++
  }
  return { drafts: drafts.filter((_, i) => alive[i]), merged }
}

/** Douglas–Peucker on lon/lat with a metre tolerance; end points always stay. */
function simplifyCoords(coords: Array<[number, number]>, toleranceM: number) {
  if (coords.length <= 2) return coords
  const cosLat = Math.cos((coords[0]![1] * Math.PI) / 180)
  const mPerDegLat = 111_320
  const px = (c: [number, number]) => c[0] * mPerDegLat * cosLat
  const py = (c: [number, number]) => c[1] * mPerDegLat
  const keep = new Uint8Array(coords.length)
  keep[0] = 1
  keep[coords.length - 1] = 1
  const stack: Array<[number, number]> = [[0, coords.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    const ax = px(coords[s]!)
    const ay = py(coords[s]!)
    const bx = px(coords[e]!)
    const by = py(coords[e]!)
    const dx = bx - ax
    const dy = by - ay
    const ll = dx * dx + dy * dy
    let worst = -1
    let worstD = toleranceM
    for (let i = s + 1; i < e; i++) {
      const x = px(coords[i]!)
      const y = py(coords[i]!)
      const t = ll === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ll))
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([s, worst], [worst, e])
    }
  }
  return coords.filter((_, i) => keep[i])
}

function packEdgeSet(
  drafts: EdgeDraft[],
  nodeId: (key: string, coord: [number, number]) => number,
  elevation: (lon: number, lat: number) => number | null,
): EdgeSet {
  const from: number[] = []
  const to: number[] = []
  const len: number[] = []
  const upF: number[] = []
  const upB: number[] = []
  const kmhF: number[] = []
  const kmhB: number[] = []
  const stress: number[] = []
  const cat: number[] = []
  const geomParts: Uint8Array[] = []
  const geomOffset: number[] = [0]
  let geomTotal = 0
  for (const d of drafts) {
    const coords = d.coords
    const a = nodeId(d.aKey, coords[0]!)
    const b = nodeId(d.bKey, coords[coords.length - 1]!)
    const climb = edgeClimb(coords, elevation)
    from.push(a)
    to.push(b)
    len.push(Math.min(65535, Math.round(polylineMetres(coords))))
    upF.push(Math.min(65535, Math.round(climb.up)))
    upB.push(Math.min(65535, Math.round(climb.down)))
    kmhF.push(d.kmhF)
    kmhB.push(d.kmhB)
    stress.push(d.stress)
    cat.push(d.cat)
    const simplified = simplifyCoords(coords, GEOM_SIMPLIFY_M)
    const q = (c: [number, number]) =>
      [Math.round(c[0] * GEOM_SCALE), Math.round(c[1] * GEOM_SCALE)] as [number, number]
    const first = q(coords[0]!)
    const packed = encodeDeltaPoints(simplified.slice(1, -1).map(q), first[0], first[1])
    geomParts.push(packed)
    geomTotal += packed.length
    geomOffset.push(geomTotal)
  }
  const geom = new Uint8Array(geomTotal)
  let off = 0
  for (const part of geomParts) {
    geom.set(part, off)
    off += part.length
  }
  return {
    count: from.length,
    from: Int32Array.from(from),
    to: Int32Array.from(to),
    len: Uint16Array.from(len),
    upF: Uint16Array.from(upF),
    upB: Uint16Array.from(upB),
    kmhF: Uint8Array.from(kmhF),
    kmhB: Uint8Array.from(kmhB),
    stress: Uint8Array.from(stress),
    cat: Uint8Array.from(cat),
    geom,
    geomOffset: Uint32Array.from(geomOffset),
  }
}

function enumIndex(list: string[], lookup: Map<string, number>, value: string) {
  let i = lookup.get(value)
  if (i === undefined) {
    i = list.length
    list.push(value)
    lookup.set(value, i)
  }
  return i
}

// --------------------------------------------------------------------------- main

type Args = { landkreis: string; bufferKm: number }

function parseArgs(argv: string[]): Args {
  const args: Args = { landkreis: DEFAULT_LANDKREIS, bufferKm: DEFAULT_BUFFER_KM }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--landkreis' && argv[i + 1]) args.landkreis = argv[++i]!
    else if (argv[i] === '--buffer-km' && argv[i + 1]) args.bufferKm = Number(argv[++i])
  }
  return args
}

export async function buildDetourGraph(client: Client, { landkreis, bufferKm }: Args) {
  const t0 = Date.now()
  const lk = (
    await client.query<{ id: string; name: string; outline: string; bbox: string }>(
      `SELECT id, tags->>'name' AS name,
              ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom, 40), 4326), 5) AS outline,
              ST_AsGeoJSON(ST_Transform(ST_Envelope(ST_Expand(geom, $2)), 4326), 5) AS bbox
       FROM public.boundaries WHERE id = $1`,
      [landkreis, bufferKm * 1000],
    )
  ).rows[0]
  if (!lk) throw new Error(`${landkreis} not in boundaries`)
  const envelope = JSON.parse(lk.bbox) as { coordinates: number[][][] }
  const ring = envelope.coordinates[0]!
  const bbox: [number, number, number, number] = [
    Math.min(...ring.map((p) => p[0]!)),
    Math.min(...ring.map((p) => p[1]!)),
    Math.max(...ring.map((p) => p[0]!)),
    Math.max(...ring.map((p) => p[1]!)),
  ]
  const outlineGeom = JSON.parse(lk.outline) as { type: string; coordinates: unknown }
  const outline = (
    outlineGeom.type === 'Polygon'
      ? [outlineGeom.coordinates as number[][][]]
      : (outlineGeom.coordinates as number[][][][])
  ).map((poly) => poly[0]!)
  process.stdout.write(`${lk.name} (${lk.id}), bbox ${bbox.map((v) => v.toFixed(3)).join(' ')}\n`)

  // ---- ways
  const bikeRows = (
    await client.query<RoutingRow>(
      `WITH lk AS MATERIALIZED (SELECT ST_Buffer(geom, $2) AS geom FROM public.boundaries WHERE id = $1)
       SELECT r.tags, ST_AsGeoJSON(r.geom, 2) AS g FROM public.routing r
       WHERE r.geom && (SELECT geom FROM lk) AND ST_Intersects(r.geom, (SELECT geom FROM lk))`,
      [landkreis, bufferKm * 1000],
    )
  ).rows
  const roadRows = (
    await client.query<RoadRow>(
      `WITH lk AS MATERIALIZED (SELECT ST_Buffer(geom, $2) AS geom FROM public.boundaries WHERE id = $1)
       SELECT r.id, r.tags->>'road' AS road, r.tags->>'maxspeed' AS maxspeed, r.tags->>'oneway' AS oneway,
              ST_AsGeoJSON(r.geom, 2) AS g
       FROM public.roads r
       WHERE r.geom && (SELECT geom FROM lk) AND ST_Intersects(r.geom, (SELECT geom FROM lk))`,
      [landkreis, bufferKm * 1000],
    )
  ).rows
  process.stdout.write(`DB: ${bikeRows.length} routing rows, ${roadRows.length} roads rows\n`)
  const roadById = new Map(roadRows.map((r) => [r.id, r]))

  const categories: string[] = []
  const categoryIndex = new Map<string, number>()
  const roadClasses: string[] = []
  const roadClassIndex = new Map<string, number>()

  const bikeWays: Way[] = []
  for (const row of bikeRows) {
    const line = parseLine(row.g)
    if (!line) continue
    const t = row.tags
    const access = (t.access_bicycle as string | null) ?? null
    if (access === 'no' || access === 'use_sidepath') continue
    const category = String(t.category ?? 'unknown')
    const road = (t.road as string | null) ?? null
    const source = String(t.source_table ?? '')
    const parentRoad =
      roadById.get(String(t.parent_id ?? '')) ?? roadById.get(String(t.source_id ?? ''))
    const limit =
      parseMaxspeed(t.maxspeed as string | null) ??
      parseMaxspeed(t.adjoining_maxspeed as string | null) ??
      parseMaxspeed(parentRoad?.maxspeed) ??
      null
    let kmh = BIKE_KMH_BY_ROAD[road ?? ''] ?? BIKE_DEFAULT_KMH
    if (category.startsWith('footwayBicycleYes') || category === 'pedestrianAreaBicycleYes')
      kmh = 14
    else if (category === 'crossing') kmh = 10
    else if (category === 'mixedTrafficFoot' && (road === 'footway' || road === 'pedestrian')) {
      kmh = access === 'yes' || access === 'designated' || access === 'permissive' ? 14 : PUSH_KMH
    }
    if (access === 'dismount') kmh = Math.min(kmh, PUSH_KMH)
    kmh *= SURFACE_FACTOR[String(t.surface ?? '')] ?? 1
    const onewayBike = t.oneway === 'yes' && t.oneway_motor !== 'yes'
    // The categories keep the carriageway-vs-infrastructure distinction; the road class is what
    // the speed default and the page's legend need.
    const stress =
      source === 'roads' || category === 'mixedTrafficMotor'
        ? bikeStress('mixedTrafficMotor', limit, road)
        : bikeStress(category, limit, road)
    bikeWays.push({
      ...line,
      parent: String(t.parent_id ?? t.source_id ?? ''),
      kmhF: kmh,
      kmhB: onewayBike ? Math.min(kmh, PUSH_KMH) : kmh,
      stress,
      cat: enumIndex(categories, categoryIndex, category),
    })
  }

  const carWays: Way[] = []
  for (const row of roadRows) {
    const line = parseLine(row.g)
    if (!line) continue
    const road = row.road ?? ''
    const defaultLimit = CAR_DEFAULT_LIMIT[road]
    if (defaultLimit === undefined) continue // pedestrian, paths, …
    const limit = Math.min(130, parseMaxspeed(row.maxspeed) ?? defaultLimit)
    let kmh = carAverageKmh(limit)
    if (road === 'bicycle_road' || road === 'living_street') kmh = Math.min(kmh, 8)
    const oneway = row.oneway === 'yes' || road === 'motorway' || road === 'motorway_link'
    carWays.push({
      ...line,
      parent: row.id,
      kmhF: kmh,
      kmhB: oneway ? 0 : kmh,
      stress: 0,
      cat: enumIndex(roadClasses, roadClassIndex, road),
    })
  }

  // ---- junctions: a coordinate used by two different OSM ways, or a way end
  const junction = new Set<string>()
  const owner = new Map<string, string>()
  const bikeIndex = new VertexIndex()
  const carIndex = new VertexIndex()
  const note = (way: Way, index: VertexIndex) => {
    way.keys.forEach((key, i) => {
      if (i === 0 || i === way.keys.length - 1) junction.add(key)
      const o = owner.get(key)
      if (o === undefined) owner.set(key, way.parent)
      else if (o !== way.parent) junction.add(key)
      index.add(key, way.coords[i]![0], way.coords[i]![1])
    })
  }
  bikeWays.forEach((w) => note(w, bikeIndex))
  carWays.forEach((w) => note(w, carIndex))

  // ---- places: OSM place nodes inside the Landkreis, with their Gemeinde
  if (!existsSync(PLACES_PATH)) {
    throw new Error(`${PLACES_PATH} missing – run routing/extract_places.py first`)
  }
  const placesFile = JSON.parse(readFileSync(PLACES_PATH, 'utf8')) as {
    places: Array<[number, number, string, string, number | null, number]>
  }
  const candidates = placesFile.places.filter(
    ([lon, lat, kind]) =>
      PLACE_KINDS.has(kind) && lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3],
  )
  const inside = await client.query<{
    i: number
    gemeinde_id: string | null
    gemeinde: string | null
  }>(
    `WITH p AS (
       SELECT i, ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3857) AS pt
       FROM unnest($1::float8[], $2::float8[], $3::int[]) AS t(lon, lat, i)
     ), lk AS (SELECT geom FROM public.boundaries WHERE id = $4)
     SELECT p.i, g.id AS gemeinde_id, g.tags->>'name' AS gemeinde
     FROM p CROSS JOIN lk
     LEFT JOIN LATERAL (
       SELECT id, tags FROM public.boundaries b
       WHERE b.tags->>'admin_level' = '8' AND ST_Contains(b.geom, p.pt)
       LIMIT 1
     ) g ON true
     WHERE ST_Contains(lk.geom, p.pt)`,
    [
      candidates.map((c) => c[0]),
      candidates.map((c) => c[1]),
      candidates.map((_, i) => i),
      landkreis,
    ],
  )
  const places: DetourPlace[] = []
  const snapKeys = { bike: new Map<number, string>(), car: new Map<number, string>() }
  let unsnapped = 0
  for (const row of inside.rows) {
    const [lon, lat, kind, name, population, osmId] = candidates[row.i]!
    const nearBike = bikeIndex.nearest(lon, lat, SNAP_MAX_M)
    const nearCar = carIndex.nearest(lon, lat, SNAP_MAX_M)
    if (nearBike) {
      junction.add(nearBike.key)
      snapKeys.bike.set(osmId, nearBike.key)
    }
    if (nearCar) {
      junction.add(nearCar.key)
      snapKeys.car.set(osmId, nearCar.key)
    }
    if (!nearBike || !nearCar) unsnapped++
    places.push({
      id: osmId,
      name,
      kind: kind as PlaceKind,
      lon,
      lat,
      population,
      gemeindeId: row.gemeinde_id,
      gemeinde: row.gemeinde,
      bikeNode: -1,
      carNode: -1,
    })
  }
  places.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  process.stdout.write(
    `Places: ${places.length} inside (${unsnapped} not within ${SNAP_MAX_M} m of a network)\n`,
  )

  // ---- terrain
  const tiles = await fetchTiles(bbox, TILE_ZOOM)
  const elevation = makeElevationSampler(tiles, TILE_ZOOM)

  // ---- edges
  const protectedKeys = new Set([...snapKeys.bike.values(), ...snapKeys.car.values()])
  const isJunction = (key: string) => junction.has(key)
  const bikeDrafts = mergeChains(draftEdges(bikeWays, isJunction), protectedKeys)
  const carDrafts = mergeChains(draftEdges(carWays, isJunction), protectedKeys)
  const nodeKeys: string[] = []
  const nodeOf = new Map<string, number>()
  const nodeCoord: Array<[number, number]> = []
  const nodeId = (key: string, coord: [number, number]) => {
    let id = nodeOf.get(key)
    if (id === undefined) {
      id = nodeKeys.length
      nodeOf.set(key, id)
      nodeKeys.push(key)
      nodeCoord.push(coord)
    }
    return id
  }
  const bike = packEdgeSet(bikeDrafts.drafts, nodeId, elevation)
  const car = packEdgeSet(carDrafts.drafts, nodeId, elevation)
  process.stdout.write(`Merged ${bikeDrafts.merged} bike and ${carDrafts.merged} car edge chains\n`)
  for (const place of places) {
    const bk = snapKeys.bike.get(place.id)
    const ck = snapKeys.car.get(place.id)
    place.bikeNode = bk !== undefined ? (nodeOf.get(bk) ?? -1) : -1
    place.carNode = ck !== undefined ? (nodeOf.get(ck) ?? -1) : -1
  }
  const nodeCount = nodeKeys.length
  const lon = new Float64Array(nodeCount)
  const lat = new Float64Array(nodeCount)
  const elev = new Int16Array(nodeCount)
  for (let i = 0; i < nodeCount; i++) {
    lon[i] = nodeCoord[i]![0]
    lat[i] = nodeCoord[i]![1]
    elev[i] = Math.round(elevation(lon[i]!, lat[i]!) ?? 0)
  }
  process.stdout.write(
    `Graph: ${nodeCount} nodes, ${bike.count} bike edges, ${car.count} car edges ` +
      `(${((Date.now() - t0) / 1000).toFixed(0)} s)\n`,
  )

  const graph: DetourGraph = {
    version: 1,
    meta: {
      landkreisId: lk.id,
      landkreisName: lk.name,
      osmDataFrom: currentOsmDataFrom(),
      builtAt: new Date().toISOString(),
      demSource: DEM_SOURCE,
      categories,
      roadClasses,
      outline,
      bbox,
    },
    nodeCount,
    lon,
    lat,
    elev,
    bike,
    car,
    places,
  }
  return graph
}

export function detourGraphFileName(landkreisId: string) {
  return `${landkreisId.replace('/', '-')}.msgpack`
}

export type DetourIndexEntry = {
  id: string
  name: string
  file: string
  places: number
  builtAt: string
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2))
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
    const graph = await buildDetourGraph(client, args)
    mkdirSync(OUT_DIR, { recursive: true })
    const fileName = detourGraphFileName(graph.meta.landkreisId)
    const index: { landkreise: DetourIndexEntry[] } = existsSync(INDEX_PATH)
      ? (JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as { landkreise: DetourIndexEntry[] })
      : { landkreise: [] }
    const previous = index.landkreise.find((e) => e.id === graph.meta.landkreisId)
    assertDatasetCount(
      `detour places ${graph.meta.landkreisId}`,
      graph.places.length,
      previous?.places ?? null,
      5,
    )
    const bytes = encodeDetourGraph(graph)
    writeFileSync(join(OUT_DIR, fileName), bytes)
    index.landkreise = index.landkreise
      .filter((e) => e.id !== graph.meta.landkreisId)
      .concat({
        id: graph.meta.landkreisId,
        name: graph.meta.landkreisName,
        file: fileName,
        places: graph.places.length,
        builtAt: graph.meta.builtAt,
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`)
    process.stdout.write(
      `Wrote ${join(OUT_DIR, fileName)} (${(bytes.length / 1024).toFixed(0)} KB), index updated\n`,
    )
  } finally {
    await client.end()
  }
}
