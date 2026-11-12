import { decode, encode } from '@msgpack/msgpack'
import type { StatsFeature } from '../bike-share-map/regionNavigation'
import {
  buildTopology,
  TOPOLOGY_COORD_SCALE,
  topologyToGeometries,
  type Topology,
} from './statsTopology'

/**
 * v1: plain GeoJSON features.
 * v2: same features, but each coordinate ring is a zigzag-varint byte string of 1e-5° deltas and
 *     the km maps in `LENGTH_PROP_KEYS` are whole metres. Roughly a third of v1's size.
 * v3: columns instead of 11k small objects, and polygons as a shared-border topology
 *     (statsTopology.ts, 1e-4°). The four length maps become one class dictionary plus a varint
 *     stream per key — the string keys repeated per feature were most of the Gemeinden pack — and
 *     borders between two regions are stored once instead of twice (a third of the core pack's
 *     bytes were copies). Decoding is a few loops over flat arrays, no object graph to walk.
 * Decoding accepts all three, so packs written before v3 still load.
 */
export const STATS_REGION_PACK_VERSION = 3

export type StatsRegionPack = {
  version: 1 | 2
  features: StatsFeature[]
}

const COORD_SCALE = 1e5
const LENGTH_PROP_KEYS = [
  'road_length',
  'bikelane_length',
  'road_length_by_authority',
  'bikelane_length_by_road',
] as const
/** The string-valued properties the export writes; anything else goes to the `rest` column. */
const STRING_PROP_KEYS = [
  'id',
  'name',
  'level',
  'regionalschluessel',
  'parent_id',
  'bundesland_id',
  'landkreis_id',
] as const
/** Nesting depth of the position arrays per geometry type (Point is stored as a 1-point line). */
const LINE_DEPTH: Record<string, number> = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3,
}

type Position = number[]
type PackedGeometry = { type: string; lines: unknown }

// ---- varint streams --------------------------------------------------------------------------

class VarintWriter {
  private out: number[] = []
  /** Unsigned. */
  push(n: number) {
    let z = n
    while (z >= 0x80) {
      this.out.push((z % 0x80) | 0x80)
      z = Math.floor(z / 0x80)
    }
    this.out.push(z)
  }
  /** Signed (zigzag). */
  pushSigned(n: number) {
    this.push(n < 0 ? -2 * n - 1 : 2 * n)
  }
  bytes() {
    return Uint8Array.from(this.out)
  }
}

class VarintReader {
  private pos = 0
  constructor(private readonly bytes: Uint8Array) {}
  next() {
    let z = 0
    let mul = 1
    for (;;) {
      const b = this.bytes[this.pos++]
      if (b === undefined) throw new Error('Ungültiges stats.msgpack (Varint-Strom endet zu früh)')
      z += (b & 0x7f) * mul
      if (!(b & 0x80)) return z
      mul *= 0x80
    }
  }
  nextSigned() {
    const z = this.next()
    return z % 2 ? -(z + 1) / 2 : z / 2
  }
}

function encodeLine(positions: Position[]) {
  const w = new VarintWriter()
  let px = 0
  let py = 0
  for (const [lng, lat] of positions) {
    const x = Math.round((lng ?? 0) * COORD_SCALE)
    const y = Math.round((lat ?? 0) * COORD_SCALE)
    w.pushSigned(x - px)
    w.pushSigned(y - py)
    px = x
    py = y
  }
  return w.bytes()
}

function decodeLine(bytes: Uint8Array) {
  const values: number[] = []
  let z = 0
  let mul = 1
  for (const b of bytes) {
    z += (b & 0x7f) * mul
    if (b & 0x80) {
      mul *= 0x80
    } else {
      values.push(z % 2 ? -(z + 1) / 2 : z / 2)
      z = 0
      mul = 1
    }
  }
  const positions: Position[] = []
  let x = 0
  let y = 0
  for (let i = 0; i + 1 < values.length; i += 2) {
    x += values[i]!
    y += values[i + 1]!
    positions.push([x / COORD_SCALE, y / COORD_SCALE])
  }
  return positions
}

function mapDepth(value: unknown, depth: number, fn: (line: never) => unknown): unknown {
  if (depth === 0) return fn(value as never)
  return (value as unknown[]).map((v) => mapDepth(v, depth - 1, fn))
}

/** v2 line packing; v3 still uses it for the geometry types the topology does not cover. */
function packGeometry(geometry: unknown) {
  const g = geometry as { type?: string; coordinates?: unknown } | null | undefined
  const type = g?.type
  const depth = type ? LINE_DEPTH[type] : undefined
  if (!g || !type || depth === undefined) return geometry
  const coords = g.type === 'Point' ? [g.coordinates] : g.coordinates
  const lines = mapDepth(coords, Math.max(depth, 1) - 1, (line: Position[]) => encodeLine(line))
  return { type, lines } satisfies PackedGeometry
}

function unpackGeometry(packed: unknown) {
  const p = packed as Partial<PackedGeometry> | null | undefined
  const depth = p?.type ? LINE_DEPTH[p.type] : undefined
  if (!p || depth === undefined || !('lines' in p)) return packed
  const coords = mapDepth(p.lines, Math.max(depth, 1) - 1, (line: Uint8Array) => decodeLine(line))
  return { type: p.type, coordinates: p.type === 'Point' ? (coords as unknown[])[0] : coords }
}

function mapLengthProps(props: StatsFeature['properties'], fn: (v: number) => number) {
  if (!props) return props
  const out: Record<string, unknown> = { ...props }
  for (const key of LENGTH_PROP_KEYS) {
    const lengths = out[key]
    if (!lengths || typeof lengths !== 'object') continue
    out[key] = Object.fromEntries(
      Object.entries(lengths).map(([k, v]) => [k, typeof v === 'number' ? fn(v) : v]),
    )
  }
  return out as StatsFeature['properties']
}

// ---- v3 --------------------------------------------------------------------------------------

type LengthColumn = {
  /** Class names; `cls` indexes into it. */
  dict: string[]
  /** Varint stream: per feature the number of entries, or 0 when the map is absent. */
  counts: Uint8Array
  /** Varint stream: dictionary index per entry. */
  cls: Uint8Array
  /** Varint stream: whole metres per entry. */
  metres: Uint8Array
}

/** Topology arcs as one varint stream: per arc its point count, then zigzag deltas. */
function encodeArcs(arcs: number[][]) {
  const w = new VarintWriter()
  w.push(arcs.length)
  for (const arc of arcs) {
    const n = arc.length / 2
    w.push(n)
    let px = 0
    let py = 0
    for (let i = 0; i < n; i++) {
      const x = arc[2 * i]!
      const y = arc[2 * i + 1]!
      w.pushSigned(x - px)
      w.pushSigned(y - py)
      px = x
      py = y
    }
  }
  return w.bytes()
}

function decodeArcs(bytes: Uint8Array) {
  const r = new VarintReader(bytes)
  const count = r.next()
  const arcs: number[][] = []
  for (let a = 0; a < count; a++) {
    const n = r.next()
    const arc: number[] = []
    let x = 0
    let y = 0
    for (let i = 0; i < n; i++) {
      x += r.nextSigned()
      y += r.nextSigned()
      arc.push(x, y)
    }
    arcs.push(arc)
  }
  return arcs
}

type PackV3 = {
  version: 3
  n: number
  /** 'Feature' for all, or one type per feature. */
  types: string | string[]
  /** Only the keys at least one feature has; `null` where a feature lacks the key. */
  strings: Partial<Record<(typeof STRING_PROP_KEYS)[number], (string | null)[]>>
  lengths: Partial<Record<(typeof LENGTH_PROP_KEYS)[number], LengthColumn>>
  /** `[lng, lat]` to 1e-4 as integers, or null. Only present when some feature has a centre. */
  centers?: ([number, number] | null)[]
  /** Properties outside the known columns, per feature; only present when any exist. */
  rest?: (Record<string, unknown> | null)[]
  /** Features with no properties at all. Only present when there are any. */
  noProps?: number[]
  topology: { arcs: Uint8Array; geometries: Topology['geometries'] }
  /** Geometries the topology does not cover (points, lines), v2-packed, per feature; sparse. */
  otherGeometry?: Record<number, unknown>
}

export type EncodeOptions = {
  /** Simplify the polygon borders by this tolerance (Douglas–Peucker on shared arcs). */
  simplifyMetres?: number
}

export function encodeStatsRegionPack(features: StatsFeature[], options: EncodeOptions = {}) {
  const n = features.length
  const types = features.map((f) => f.type)
  const strings: PackV3['strings'] = {}
  for (const key of STRING_PROP_KEYS) {
    const column = features.map((f) => {
      const v = f.properties?.[key]
      return typeof v === 'string' ? v : v == null ? null : String(v)
    })
    if (column.some((v) => v !== null)) strings[key] = column
  }
  const lengths: PackV3['lengths'] = {}
  for (const key of LENGTH_PROP_KEYS) {
    const dict: string[] = []
    const dictIndex = new Map<string, number>()
    const counts = new VarintWriter()
    const cls = new VarintWriter()
    const metres = new VarintWriter()
    let any = false
    for (const f of features) {
      const map = (f.properties as Record<string, unknown> | undefined)?.[key]
      if (!map || typeof map !== 'object') {
        counts.push(0)
        continue
      }
      any = true
      const entries = Object.entries(map as Record<string, unknown>)
      counts.push(entries.length)
      for (const [c, v] of entries) {
        let index = dictIndex.get(c)
        if (index === undefined) {
          index = dict.length
          dict.push(c)
          dictIndex.set(c, index)
        }
        cls.push(index)
        metres.push(
          typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v * 1000)) : 0,
        )
      }
    }
    if (any)
      lengths[key] = { dict, counts: counts.bytes(), cls: cls.bytes(), metres: metres.bytes() }
  }
  const centers = features.map((f) => {
    const c = f.properties?.center
    return Array.isArray(c) && c.length === 2
      ? ([Math.round(c[0] * 1e4), Math.round(c[1] * 1e4)] as [number, number])
      : null
  })
  const known = new Set<string>([...STRING_PROP_KEYS, ...LENGTH_PROP_KEYS, 'center'])
  const rest = features.map((f) => {
    if (!f.properties) return null
    const extra: Record<string, unknown> = {}
    let any = false
    for (const [k, v] of Object.entries(f.properties)) {
      if (known.has(k)) continue
      extra[k] = v
      any = true
    }
    return any ? extra : null
  })
  const noProps = features.flatMap((f, i) => (f.properties ? [] : [i]))
  const topology = buildTopology(
    features.map((f) => f.geometry),
    { simplifyMetres: options.simplifyMetres },
  )
  const otherGeometry: Record<number, unknown> = {}
  features.forEach((f, i) => {
    const type = (f.geometry as { type?: string } | null | undefined)?.type
    if (f.geometry && type !== 'Polygon' && type !== 'MultiPolygon') {
      otherGeometry[i] = packGeometry(f.geometry)
    }
  })
  const pack: PackV3 = {
    version: 3,
    n,
    types: types.every((t) => t === 'Feature') ? 'Feature' : types,
    strings,
    lengths,
    ...(centers.some((c) => c) && { centers }),
    ...(rest.some((r) => r) && { rest }),
    ...(noProps.length && { noProps }),
    topology: { arcs: encodeArcs(topology.arcs), geometries: topology.geometries },
    ...(Object.keys(otherGeometry).length && { otherGeometry }),
  }
  return encode(pack)
}

function decodeV3(pack: PackV3): StatsFeature[] {
  const n = pack.n
  const strings = pack.strings ?? {}
  const lengthReaders = Object.entries(pack.lengths ?? {}).map(([key, column]) => ({
    key,
    dict: column.dict,
    counts: new VarintReader(column.counts),
    cls: new VarintReader(column.cls),
    metres: new VarintReader(column.metres),
  }))
  const geometries = topologyToGeometries(
    {
      arcs: decodeArcs(pack.topology.arcs),
      geometries: pack.topology.geometries,
    },
    TOPOLOGY_COORD_SCALE,
  )
  const noProps = new Set(pack.noProps ?? [])
  const features: StatsFeature[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const properties: Record<string, unknown> = {}
    for (const key of STRING_PROP_KEYS) {
      const v = strings[key]?.[i]
      if (v != null) properties[key] = v
    }
    for (const reader of lengthReaders) {
      const count = reader.counts.next()
      if (!count) continue
      const map: Record<string, number> = {}
      for (let k = 0; k < count; k++) {
        map[reader.dict[reader.cls.next()]!] = reader.metres.next() / 1000
      }
      properties[reader.key] = map
    }
    const center = pack.centers?.[i]
    if (center) properties.center = [center[0] / 1e4, center[1] / 1e4]
    const rest = pack.rest?.[i]
    if (rest) Object.assign(properties, rest)
    const other = pack.otherGeometry?.[i]
    const geometry = other !== undefined ? unpackGeometry(other) : geometries[i]
    features[i] = {
      type: typeof pack.types === 'string' ? pack.types : pack.types[i]!,
      ...(noProps.has(i) ? {} : { properties }),
      geometry: geometry ?? null,
    }
  }
  return features
}

export function decodeStatsRegionPack(bytes: Uint8Array): StatsFeature[] {
  const data = decode(bytes) as { version?: number; features?: unknown }
  if (data.version === 3) return decodeV3(data as unknown as PackV3)
  if ((data.version !== 1 && data.version !== 2) || !Array.isArray(data.features)) {
    throw new Error('Ungültiges stats.msgpack (Version oder features fehlen)')
  }
  const features = data.features as StatsFeature[]
  if (data.version === 1) return features
  return features.map((f) => ({
    ...f,
    geometry: unpackGeometry(f.geometry),
    properties: mapLengthProps(f.properties, (m) => m / 1000),
  }))
}

/**
 * Admin levels split into a separate pack: Gemeindeverbände (7) and Stadtbezirke (9) power two
 * niche Darstellung dropdown options that most visits never touch, yet make up ~40% of the
 * combined payload (mostly geometry for ~11k Stadtbezirke). Splitting them out means the first
 * paint no longer blocks on them — the viewer fetches this pack in the background right after
 * the core one, instead of bundling it into the initial download everyone pays for up front.
 */
export const LAZY_STATS_LEVELS: ReadonlySet<string> = new Set(['7', '9'])

export function splitStatsFeaturesByLevel(features: StatsFeature[]) {
  const core: StatsFeature[] = []
  const extra: StatsFeature[] = []
  for (const f of features) {
    ;(LAZY_STATS_LEVELS.has(String(f.properties?.level ?? '')) ? extra : core).push(f)
  }
  return { core, extra }
}

/** The admin level whose polygons are kept out of the first download: ~10.9k Gemeinden. */
export const DEFERRED_GEOMETRY_LEVEL = '8'

/**
 * Which polygon file a Gemeinde's geometry lives in: one per Landkreis (~27 Gemeinden, a few KB),
 * so a view of one Landkreis fetches one small file instead of every Gemeinde in Germany.
 * Gemeinden without a Landkreis share `none`.
 */
export function gemeindeGeometryShardKey(
  properties: { landkreis_id?: string | null } | null | undefined,
) {
  const landkreis = properties?.landkreis_id
  return landkreis ? landkreis.split('/').join('-') : 'none'
}

function bboxCenter(geometry: unknown): [number, number] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      minX = Math.min(minX, value[0])
      maxX = Math.max(maxX, value[0])
      minY = Math.min(minY, value[1])
      maxY = Math.max(maxY, value[1])
      return
    }
    for (const inner of value) visit(inner)
  }
  visit((geometry as { coordinates?: unknown } | null | undefined)?.coordinates)
  if (!Number.isFinite(minX)) return null
  const round = (n: number) => Math.round(n * 1e4) / 1e4
  return [round((minX + maxX) / 2), round((minY + maxY) / 2)]
}

/**
 * Takes the Gemeinde polygons out of a pack. `light` is the same features without geometry but
 * with their `center`; `shards` maps a shard key to the geometry-only features of that Landkreis.
 * Polygons are over half of the first download, and the default view (Landkreise) never draws a
 * Gemeinde; the page fetches a Landkreis's shard when a view needs it.
 */
export function splitGemeindeGeometry(features: StatsFeature[]) {
  const light: StatsFeature[] = []
  const shards = new Map<string, StatsFeature[]>()
  for (const f of features) {
    if (String(f.properties?.level ?? '') !== DEFERRED_GEOMETRY_LEVEL || !f.geometry) {
      light.push(f)
      continue
    }
    const center = bboxCenter(f.geometry)
    light.push({ ...f, geometry: null, properties: { ...f.properties, ...(center && { center }) } })
    const key = gemeindeGeometryShardKey(f.properties)
    const shard = shards.get(key) ?? []
    shard.push({ type: f.type, properties: { id: f.properties?.id }, geometry: f.geometry })
    shards.set(key, shard)
  }
  return { light, shards }
}
