import { decode, encode } from '@msgpack/msgpack'
import type { StatsFeature } from '../bike-share-map/regionNavigation'

/**
 * v1: plain GeoJSON features.
 * v2: same features, but each coordinate ring is a zigzag-varint byte string of 1e-5° deltas
 *     (~1 m, finer than the boundary simplification) and the km maps in `LENGTH_PROP_KEYS` are
 *     whole metres. Roughly a third of v1's size — this is the viewer's first-load download.
 * Decoding accepts both, so packs written before v2 still load.
 */
export const STATS_REGION_PACK_VERSION = 2

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

function encodeLine(positions: Position[]) {
  const out: number[] = []
  const push = (n: number) => {
    let z = n < 0 ? -2 * n - 1 : 2 * n
    while (z >= 0x80) {
      out.push((z % 0x80) | 0x80)
      z = Math.floor(z / 0x80)
    }
    out.push(z)
  }
  let px = 0
  let py = 0
  for (const [lng, lat] of positions) {
    const x = Math.round((lng ?? 0) * COORD_SCALE)
    const y = Math.round((lat ?? 0) * COORD_SCALE)
    push(x - px)
    push(y - py)
    px = x
    py = y
  }
  return Uint8Array.from(out)
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

export function encodeStatsRegionPack(features: StatsFeature[]) {
  const packed = features.map((f) => ({
    ...f,
    geometry: packGeometry(f.geometry),
    properties: mapLengthProps(f.properties, (km) => Math.round(km * 1000)),
  }))
  return encode({ version: STATS_REGION_PACK_VERSION, features: packed })
}

export function decodeStatsRegionPack(bytes: Uint8Array) {
  const data = decode(bytes) as Partial<StatsRegionPack>
  if ((data.version !== 1 && data.version !== 2) || !Array.isArray(data.features)) {
    throw new Error('Ungültiges stats.msgpack (Version oder features fehlen)')
  }
  if (data.version === 1) return data.features
  return data.features.map((f) => ({
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
