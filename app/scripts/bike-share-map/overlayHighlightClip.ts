/**
 * Clip overlay lines to the selected region for the row pulse ("Kurz auf der Karte hervorheben").
 *
 * aggregate_lengths.sql counts a line that crosses the boundary with the share of its length
 * that lies inside (tilda_measure_share). MapLibre's `within` filter, which the pulse layers use,
 * only passes lines lying entirely inside the polygon, so border-crossing lines were missing from
 * the pulse even though their inside part is counted. This module handles exactly those lines on
 * the client: a line that crosses the border is cut at the border and only the pieces inside are
 * returned, as a GeoJSON FeatureCollection for a second pair of pulse layers. Lines without a
 * border crossing are skipped (fully inside: the GPU filter already draws them; fully outside:
 * nothing to draw), so the work stays proportional to the border, not to the region.
 *
 * Input features come from `map.querySourceFeatures`, i.e. one copy per tile, each clipped at the
 * tile edge plus the tile buffer. MapLibre stencils tile layers to the tile extent, a GeoJSON
 * source is not, so the pieces are cut back to their tile's bounds afterwards: otherwise the
 * buffer copies of neighbouring tiles would overlap and draw darker along every tile edge.
 */

export type Position = [number, number]
type LineCoords = Position[]
/** [west, south, east, north] */
export type Bbox = [number, number, number, number]

export type RegionGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }

export type LineGeometry =
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }

export type OverlayLine = {
  geometry: LineGeometry | { type: string; coordinates?: unknown } | null | undefined
  properties?: Record<string, unknown> | null
  /** Lon/lat bounds of the vector tile the copy came from; pieces are cut back to it. */
  tileBounds?: Bbox | null
}

export type ClippedFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: { type: 'MultiLineString'; coordinates: Position[][] }
}

export type ClippedFeatureCollection = { type: 'FeatureCollection'; features: ClippedFeature[] }

export const EMPTY_FEATURE_COLLECTION: ClippedFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

/** Lon/lat bounds of a Web Mercator tile (XYZ scheme). */
export function tileBoundsLonLat(z: number, x: number, y: number): Bbox {
  const n = 2 ** z
  const lonOf = (col: number) => (col / n) * 360 - 180
  const latOf = (row: number) => {
    const t = Math.PI * (1 - (2 * row) / n)
    return (Math.atan(Math.sinh(t)) * 180) / Math.PI
  }
  return [lonOf(x), latOf(y + 1), lonOf(x + 1), latOf(y)]
}

function polygonRings(geometry: RegionGeometry): Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates
  const rings: Position[][] = []
  for (const polygon of geometry.coordinates) rings.push(...polygon)
  return rings
}

/**
 * Even-odd ray cast over every ring of every polygon. Boundary multipolygons from OSM do not
 * overlap, so holes and islands come out right without tracking which ring belongs to which.
 */
export function pointInRegion(point: Position, rings: Position[][]) {
  const [px, py] = point
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!
      const [xj, yj] = ring[j]!
      if (yi > py !== yj > py) {
        const xCross = ((xj - xi) * (py - yi)) / (yj - yi) + xi
        if (px < xCross) inside = !inside
      }
    }
  }
  return inside
}

/** Grid-bucketed border edges, so each line only meets the edges near its own bbox. */
export class RegionBorderIndex {
  readonly rings: Position[][]
  private readonly edges: Position[] = [] // pairs: edges[2k], edges[2k+1]
  private readonly edgeBbox: Float64Array
  private readonly cells: Int32Array[]
  private readonly cols: number
  private readonly rows: number
  private readonly bbox: Bbox
  private stamp = new Int32Array(0)
  private stampValue = 0

  constructor(geometry: RegionGeometry) {
    this.rings = polygonRings(geometry)
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const ring of this.rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]!
        const b = ring[i + 1]!
        if (a[0] === b[0] && a[1] === b[1]) continue
        this.edges.push(a, b)
        west = Math.min(west, a[0], b[0])
        east = Math.max(east, a[0], b[0])
        south = Math.min(south, a[1], b[1])
        north = Math.max(north, a[1], b[1])
      }
    }
    const edgeCount = this.edges.length / 2
    this.bbox = edgeCount ? [west, south, east, north] : [0, 0, 0, 0]
    this.edgeBbox = new Float64Array(edgeCount * 4)
    const side = Math.max(1, Math.min(128, Math.ceil(Math.sqrt(edgeCount))))
    this.cols = side
    this.rows = side
    const buckets: number[][] = Array.from({ length: side * side }, () => [])
    for (let k = 0; k < edgeCount; k++) {
      const a = this.edges[2 * k]!
      const b = this.edges[2 * k + 1]!
      const bb: Bbox = [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ]
      this.edgeBbox.set(bb, k * 4)
      const [c0, r0, c1, r1] = this.cellRange(bb)
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) buckets[r * side + c]!.push(k)
    }
    this.cells = buckets.map((list) => Int32Array.from(list))
    this.stamp = new Int32Array(edgeCount)
  }

  get edgeCount() {
    return this.edges.length / 2
  }

  private cellRange(bb: Bbox): [number, number, number, number] {
    const [west, south, east, north] = this.bbox
    const w = east - west || 1
    const h = north - south || 1
    const clampCol = (x: number) =>
      Math.max(0, Math.min(this.cols - 1, Math.floor(((x - west) / w) * this.cols)))
    const clampRow = (y: number) =>
      Math.max(0, Math.min(this.rows - 1, Math.floor(((y - south) / h) * this.rows)))
    return [clampCol(bb[0]), clampRow(bb[1]), clampCol(bb[2]), clampRow(bb[3])]
  }

  /** Indices of edges whose cells overlap `bb`; empty when `bb` misses the border entirely. */
  candidates(bb: Bbox): number[] {
    const out: number[] = []
    if (!this.edgeCount) return out
    const [west, south, east, north] = this.bbox
    if (bb[2] < west || bb[0] > east || bb[3] < south || bb[1] > north) return out
    this.stampValue += 1
    const [c0, r0, c1, r1] = this.cellRange(bb)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const k of this.cells[r * this.cols + c]!) {
          if (this.stamp[k] === this.stampValue) continue
          this.stamp[k] = this.stampValue
          out.push(k)
        }
      }
    }
    return out
  }

  edge(k: number): [Position, Position] {
    return [this.edges[2 * k]!, this.edges[2 * k + 1]!]
  }

  edgeOverlaps(k: number, bb: Bbox) {
    const o = k * 4
    return !(
      this.edgeBbox[o + 2]! < bb[0] ||
      this.edgeBbox[o]! > bb[2] ||
      this.edgeBbox[o + 3]! < bb[1] ||
      this.edgeBbox[o + 1]! > bb[3]
    )
  }
}

function lineBbox(coords: LineCoords): Bbox {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [x, y] of coords) {
    if (x < west) west = x
    if (x > east) east = x
    if (y < south) south = y
    if (y > north) north = y
  }
  return [west, south, east, north]
}

/** Parameter t along p→q where it crosses a→b, or null when parallel or not crossing. */
function segmentCrossing(p: Position, q: Position, a: Position, b: Position): number | null {
  const rx = q[0] - p[0]
  const ry = q[1] - p[1]
  const sx = b[0] - a[0]
  const sy = b[1] - a[1]
  const denominator = rx * sy - ry * sx
  if (denominator === 0) return null
  const dx = a[0] - p[0]
  const dy = a[1] - p[1]
  const t = (dx * sy - dy * sx) / denominator
  const u = (dx * ry - dy * rx) / denominator
  if (u < 0 || u > 1 || t < 0 || t > 1) return null
  return t
}

/** Cuts `coords` at every border crossing. Returns null when the line does not cross. */
function splitAtBorder(coords: LineCoords, index: RegionBorderIndex): LineCoords[] | null {
  if (coords.length < 2) return null
  const candidates = index.candidates(lineBbox(coords))
  if (!candidates.length) return null
  const pieces: LineCoords[] = []
  let current: LineCoords = [coords[0]!]
  let crossed = false
  for (let i = 0; i < coords.length - 1; i++) {
    const p = coords[i]!
    const q = coords[i + 1]!
    const segBbox: Bbox = [
      Math.min(p[0], q[0]),
      Math.min(p[1], q[1]),
      Math.max(p[0], q[0]),
      Math.max(p[1], q[1]),
    ]
    const ts: number[] = []
    for (const k of candidates) {
      if (!index.edgeOverlaps(k, segBbox)) continue
      const [a, b] = index.edge(k)
      const t = segmentCrossing(p, q, a, b)
      if (t !== null && t > 0 && t < 1) ts.push(t)
    }
    ts.sort((x, y) => x - y)
    let last = -1
    for (const t of ts) {
      if (t - last < 1e-12) continue
      last = t
      const cut: Position = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      current.push(cut)
      pieces.push(current)
      current = [cut]
      crossed = true
    }
    current.push(q)
  }
  if (!crossed) return null
  pieces.push(current)
  return pieces
}

/** A point strictly inside the piece, away from its end points which may sit on the border. */
function interiorPoint(piece: LineCoords): Position {
  let best = 0
  let bestLength = -1
  for (let i = 0; i < piece.length - 1; i++) {
    const dx = piece[i + 1]![0] - piece[i]![0]
    const dy = piece[i + 1]![1] - piece[i]![1]
    const length = dx * dx + dy * dy
    if (length > bestLength) {
      bestLength = length
      best = i
    }
  }
  const a = piece[best]!
  const b = piece[best + 1]!
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Liang–Barsky per segment; the parts inside the rectangle, joined where they continue. */
export function clipLineToBbox(coords: LineCoords, bb: Bbox): LineCoords[] {
  const [west, south, east, north] = bb
  const pieces: LineCoords[] = []
  let current: LineCoords | null = null
  const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
  for (let i = 0; i < coords.length - 1; i++) {
    const p = coords[i]!
    const q = coords[i + 1]!
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    let t0 = 0
    let t1 = 1
    let visible = true
    for (const [denominator, numerator] of [
      [-dx, p[0] - west],
      [dx, east - p[0]],
      [-dy, p[1] - south],
      [dy, north - p[1]],
    ] as const) {
      if (denominator === 0) {
        if (numerator < 0) {
          visible = false
          break
        }
        continue
      }
      const t = numerator / denominator
      if (denominator < 0) {
        if (t > t1) {
          visible = false
          break
        }
        if (t > t0) t0 = t
      } else {
        if (t < t0) {
          visible = false
          break
        }
        if (t < t1) t1 = t
      }
    }
    if (!visible) {
      current = null
      continue
    }
    const start: Position = t0 === 0 ? p : [p[0] + dx * t0, p[1] + dy * t0]
    const end: Position = t1 === 1 ? q : [p[0] + dx * t1, p[1] + dy * t1]
    if (same(start, end)) continue
    if (current && same(current[current.length - 1]!, start)) {
      current.push(end)
    } else {
      current = [start, end]
      pieces.push(current)
    }
    if (t1 !== 1) current = null
  }
  return pieces
}

function lineStrings(geometry: OverlayLine['geometry']): LineCoords[] {
  if (!geometry) return []
  if (geometry.type === 'LineString') return [geometry.coordinates as LineCoords]
  if (geometry.type === 'MultiLineString') return geometry.coordinates as LineCoords[]
  return []
}

/**
 * The inside parts of every line that crosses the region border. Lines that do not cross are
 * left out on purpose (see the file comment). `index` can be passed to reuse it across calls
 * for the same region.
 */
export function clipCrossingLinesToRegion(
  lines: OverlayLine[],
  region: RegionGeometry | null | undefined,
  index?: RegionBorderIndex,
): ClippedFeatureCollection {
  if (!region || (region.type !== 'Polygon' && region.type !== 'MultiPolygon')) {
    return EMPTY_FEATURE_COLLECTION
  }
  const border = index ?? new RegionBorderIndex(region)
  const features: ClippedFeature[] = []
  for (const line of lines) {
    const kept: LineCoords[] = []
    for (const coords of lineStrings(line.geometry)) {
      const pieces = splitAtBorder(coords, border)
      if (!pieces) continue
      for (const piece of pieces) {
        if (piece.length < 2) continue
        if (!pointInRegion(interiorPoint(piece), border.rings)) continue
        if (line.tileBounds) kept.push(...clipLineToBbox(piece, line.tileBounds))
        else kept.push(piece)
      }
    }
    if (!kept.length) continue
    features.push({
      type: 'Feature',
      properties: line.properties ?? {},
      geometry: { type: 'MultiLineString', coordinates: kept },
    })
  }
  return { type: 'FeatureCollection', features }
}
