/**
 * Shared-border topology for the region polygons (the idea of TopoJSON, trimmed to what the
 * stats packs need). Adjacent regions store their common border twice as plain GeoJSON, and a
 * Land's outline repeats its Landkreise's outer borders a third time: 93 % of the positions in
 * the core pack were copies. Here every border between two junctions is one arc, rings are lists
 * of arc references (`~i` for an arc walked backwards, as in TopoJSON), and a positions-wide
 * simplification works on arcs, so neighbours still share exactly the same boundary afterwards.
 *
 * Coordinates are integers on a grid of 1/COORD_SCALE degrees (1e-4° ≈ 11 m north–south) — far
 * below the 150 m the export already simplifies to, and what makes identical points identical.
 */

export const TOPOLOGY_COORD_SCALE = 1e4

type Position = number[]
/** Quantized ring without the closing point; `[x0, y0, x1, y1, …]`. */
type QRing = number[]

export type TopologyGeometry =
  | { type: 'Polygon'; rings: number[][]; starts: number[] }
  | { type: 'MultiPolygon'; rings: number[][][]; starts: number[][] }

export type Topology = {
  /** Each arc as quantized `[x0, y0, x1, y1, …]`; shared by every ring that references it. */
  arcs: number[][]
  /** One entry per input geometry; `null` where the input had no polygon. */
  geometries: (TopologyGeometry | null)[]
}

const KEY_OFFSET = 1 << 21 // |lng| ≤ 180e4 < 2^21 and |lat| ≤ 90e4
const KEY_STRIDE = 1 << 22
const pointKey = (x: number, y: number) => (x + KEY_OFFSET) * KEY_STRIDE + (y + KEY_OFFSET)

function quantizeRing(ring: Position[], scale: number): QRing | null {
  const out: number[] = []
  for (const p of ring) {
    const x = Math.round((p[0] ?? 0) * scale)
    const y = Math.round((p[1] ?? 0) * scale)
    const n = out.length
    if (n && out[n - 2] === x && out[n - 1] === y) continue // collapsed by the grid
    out.push(x, y)
  }
  // drop the closing point (GeoJSON rings repeat their first position)
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) {
    out.length -= 2
  }
  return out.length >= 6 ? out : null
}

function polygonRings(geometry: unknown): Position[][][] | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null | undefined
  if (!g) return null
  if (g.type === 'Polygon') return [g.coordinates as Position[][]]
  if (g.type === 'MultiPolygon') return g.coordinates as Position[][][]
  return null
}

/**
 * Builds the topology of the given geometries (Polygon / MultiPolygon; anything else becomes
 * `null`). `simplifyMetres` > 0 additionally simplifies every arc (Douglas–Peucker) by that
 * tolerance; rings that collapse below three points are dropped.
 */
export function buildTopology(
  geometries: unknown[],
  options: { scale?: number; simplifyMetres?: number } = {},
): Topology {
  const scale = options.scale ?? TOPOLOGY_COORD_SCALE
  // 1. quantize
  const qPolys = geometries.map((geometry) => {
    const polys = polygonRings(geometry)
    if (!polys) return null
    const type = (geometry as { type: string }).type as 'Polygon' | 'MultiPolygon'
    return {
      type,
      polys: polys.map((rings) =>
        rings.map((ring) => quantizeRing(ring, scale)).filter((r): r is QRing => r !== null),
      ),
    }
  })
  // 2. junctions: a point whose two ring neighbours differ between the rings it appears in
  const neighbours = new Map<number, string>() // point → first neighbour pair key
  const junctions = new Set<number>()
  const pairKey = (a: number, b: number) => (a < b ? a + ',' + b : b + ',' + a)
  const visitRing = (ring: QRing) => {
    const n = ring.length / 2
    for (let i = 0; i < n; i++) {
      const k = pointKey(ring[2 * i]!, ring[2 * i + 1]!)
      const prev = (i + n - 1) % n
      const next = (i + 1) % n
      const pk = pairKey(
        pointKey(ring[2 * prev]!, ring[2 * prev + 1]!),
        pointKey(ring[2 * next]!, ring[2 * next + 1]!),
      )
      const seen = neighbours.get(k)
      if (seen === undefined) neighbours.set(k, pk)
      else if (seen !== pk) junctions.add(k)
    }
  }
  for (const q of qPolys)
    if (q) for (const rings of q.polys) for (const ring of rings) visitRing(ring)
  neighbours.clear()
  // 3. cut rings into arcs at the junctions and share equal arcs
  const arcs: number[][] = []
  const arcIndex = new Map<string, number>()
  const addArc = (points: number[]): number => {
    // canonical direction: the smaller end point first (for a closed arc, compare the second points)
    const n = points.length / 2
    let forward = true
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      const a = pointKey(points[2 * i]!, points[2 * i + 1]!)
      const b = pointKey(points[2 * j]!, points[2 * j + 1]!)
      if (a !== b) {
        forward = a < b
        break
      }
    }
    let canonical = points
    if (!forward) {
      canonical = []
      for (let i = n - 1; i >= 0; i--) canonical.push(points[2 * i]!, points[2 * i + 1]!)
    }
    const key = canonical.join(',')
    let index = arcIndex.get(key)
    if (index === undefined) {
      index = arcs.length
      arcs.push(canonical)
      arcIndex.set(key, index)
    }
    return forward ? index : ~index
  }
  const cutRing = (ring: QRing): { refs: number[]; start: number } => {
    const n = ring.length / 2
    const point = (i: number) => [ring[2 * (i % n)]!, ring[2 * (i % n) + 1]!] as const
    let firstJunction = -1
    for (let i = 0; i < n; i++) {
      if (junctions.has(pointKey(...point(i)))) {
        firstJunction = i
        break
      }
    }
    if (firstJunction < 0) {
      // a ring touching nothing: one closed arc, rotated to its smallest point so equal rings
      // (an enclave's outline is its host's hole) share it
      let minI = 0
      let minK = Infinity
      for (let i = 0; i < n; i++) {
        const k = pointKey(...point(i))
        if (k < minK) {
          minK = k
          minI = i
        }
      }
      const pts: number[] = []
      for (let i = 0; i <= n; i++) pts.push(...point(minI + i))
      return { refs: [addArc(pts)], start: (n - minI) % n }
    }
    const refs: number[] = []
    let pts: number[] = [...point(firstJunction)]
    for (let step = 1; step <= n; step++) {
      const i = firstJunction + step
      pts.push(...point(i))
      if (junctions.has(pointKey(...point(i)))) {
        refs.push(addArc(pts))
        pts = [...point(i)]
      }
    }
    return { refs, start: (n - firstJunction) % n }
  }
  const geometriesOut: (TopologyGeometry | null)[] = qPolys.map((q) => {
    if (!q) return null
    // a polygon whose outer ring collapsed on the grid (a sliver under ~11 m) is gone
    const cut = q.polys.filter((rings) => rings.length).map((rings) => rings.map(cutRing))
    if (!cut.length) return null
    if (q.type === 'Polygon') {
      const rings = cut[0]!
      return { type: 'Polygon', rings: rings.map((r) => r.refs), starts: rings.map((r) => r.start) }
    }
    return {
      type: 'MultiPolygon',
      rings: cut.map((rings) => rings.map((r) => r.refs)),
      starts: cut.map((rings) => rings.map((r) => r.start)),
    }
  })
  junctions.clear()
  arcIndex.clear()
  const topology: Topology = { arcs, geometries: geometriesOut }
  if (options.simplifyMetres && options.simplifyMetres > 0) {
    simplifyTopology(topology, options.simplifyMetres, scale)
  }
  return topology
}

/** Douglas–Peucker on every arc; distances in metres via a local equirectangular scale. */
function simplifyTopology(topology: Topology, metres: number, scale: number) {
  const metresPerUnitLat = 111320 / scale
  topology.arcs = topology.arcs.map((arc) => {
    const n = arc.length / 2
    if (n <= 2) return arc
    let latSum = 0
    for (let i = 0; i < n; i++) latSum += arc[2 * i + 1]!
    const cosLat = Math.cos(((latSum / n) * Math.PI) / (180 * scale))
    const kx = metresPerUnitLat * cosLat
    const ky = metresPerUnitLat
    const tol2 = metres * metres
    const keep = new Uint8Array(n)
    keep[0] = keep[n - 1] = 1
    const closed = arc[0] === arc[2 * (n - 1)] && arc[1] === arc[2 * (n - 1) + 1]
    const stack: Array<[number, number]> = []
    if (closed) {
      // a closed arc has no chord: keep the point farthest from the start, then split there
      let far = 1
      let farD = -1
      for (let i = 1; i < n - 1; i++) {
        const dx = (arc[2 * i]! - arc[0]!) * kx
        const dy = (arc[2 * i + 1]! - arc[1]!) * ky
        const d = dx * dx + dy * dy
        if (d > farD) {
          farD = d
          far = i
        }
      }
      keep[far] = 1
      stack.push([0, far], [far, n - 1])
    } else {
      stack.push([0, n - 1])
    }
    while (stack.length) {
      const [s, e] = stack.pop()!
      if (e - s < 2) continue
      const ax = arc[2 * s]! * kx
      const ay = arc[2 * s + 1]! * ky
      const bx = arc[2 * e]! * kx
      const by = arc[2 * e + 1]! * ky
      const dx = bx - ax
      const dy = by - ay
      const l2 = dx * dx + dy * dy
      let best = -1
      let bi = -1
      for (let i = s + 1; i < e; i++) {
        const px = arc[2 * i]! * kx
        const py = arc[2 * i + 1]! * ky
        let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const ex = ax + t * dx - px
        const ey = ay + t * dy - py
        const d = ex * ex + ey * ey
        if (d > best) {
          best = d
          bi = i
        }
      }
      if (best > tol2) {
        keep[bi] = 1
        stack.push([s, bi], [bi, e])
      }
    }
    const out: number[] = []
    for (let i = 0; i < n; i++) if (keep[i]) out.push(arc[2 * i]!, arc[2 * i + 1]!)
    return out
  })
}

/** Turns a topology back into GeoJSON geometries (one per entry, `null` kept as `null`). */
export function topologyToGeometries(topology: Topology, scale = TOPOLOGY_COORD_SCALE) {
  const ring = (refs: number[], start: number): Position[] | null => {
    const pts: Position[] = []
    for (const ref of refs) {
      const arc = topology.arcs[ref < 0 ? ~ref : ref]!
      const n = arc.length / 2
      const first = pts.length ? 1 : 0 // the junction is the previous arc's last point
      for (let k = first; k < n; k++) {
        const i = ref < 0 ? n - 1 - k : k
        pts.push([arc[2 * i]! / scale, arc[2 * i + 1]! / scale])
      }
    }
    // pts is closed (last === first); rotate the open ring back to where the source started
    pts.pop()
    if (pts.length < 3) return null
    const n = pts.length
    const s = start % n // best effort once arcs were simplified: still a valid ring
    const rotated = s ? pts.slice(s).concat(pts.slice(0, s)) : pts
    rotated.push(rotated[0]!)
    return rotated
  }
  const polygon = (refs: number[][], starts: number[]) => {
    const rings: Position[][] = []
    for (let i = 0; i < refs.length; i++) {
      const r = ring(refs[i]!, starts[i] ?? 0)
      if (!r) {
        if (i === 0) return null // the outer ring collapsed: drop the polygon
        continue
      }
      rings.push(r)
    }
    return rings
  }
  return topology.geometries.map((g) => {
    if (!g) return null
    if (g.type === 'Polygon') {
      const rings = polygon(g.rings, g.starts)
      return rings ? { type: 'Polygon', coordinates: rings } : null
    }
    const polys = g.rings
      .map((refs, i) => polygon(refs, g.starts[i] ?? []))
      .filter((p): p is Position[][] => p !== null)
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null
  })
}
