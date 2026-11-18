/**
 * Small planar helpers for the Radwege tracker (radwegeData.ts). Coordinates are lon/lat around
 * Schweitenkirchen; distances use a local flat projection, exact to well under 1 % there.
 */
export type LonLat = [number, number]

const KX = 111_320 * Math.cos((48.5 * Math.PI) / 180)
const KY = 110_570
const xy = (p: LonLat) => [p[0] * KX, p[1] * KY] as const

/** Returns a test "is this lon/lat within `dist` metres of any of `targets`". */
export function nearIndex(targets: LonLat[][], dist: number) {
  const CELL = Math.max(dist * 2, 100)
  const grid = new Map<string, [number, number, number, number][]>()
  for (const t of targets) {
    for (let i = 1; i < t.length; i++) {
      const [ax, ay] = xy(t[i - 1]!),
        [bx, by] = xy(t[i]!)
      for (
        let gx = Math.floor(Math.min(ax, bx) / CELL);
        gx <= Math.floor(Math.max(ax, bx) / CELL);
        gx++
      )
        for (
          let gy = Math.floor(Math.min(ay, by) / CELL);
          gy <= Math.floor(Math.max(ay, by) / CELL);
          gy++
        ) {
          const k = gx + ',' + gy
          if (!grid.has(k)) grid.set(k, [])
          grid.get(k)!.push([ax, ay, bx, by])
        }
    }
  }
  return (p: LonLat) => {
    const [x, y] = xy(p)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const [ax, ay, bx, by] of grid.get(
          Math.floor(x / CELL) + dx + ',' + (Math.floor(y / CELL) + dy),
        ) ?? []) {
          const vx = bx - ax,
            vy = by - ay,
            L2 = vx * vx + vy * vy || 1
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2))
          if (Math.hypot(x - ax - t * vx, y - ay - t * vy) <= dist) return true
        }
    return false
  }
}

/** Point-in-polygon test for a GeoJSON Polygon or MultiPolygon (holes respected). */
export function insideIndex(geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }) {
  const polys = (
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  ) as LonLat[][][]
  const inRing = (p: LonLat, ring: LonLat[]) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!,
        [xj, yj] = ring[j]!
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
        inside = !inside
    }
    return inside
  }
  return (p: LonLat) =>
    polys.some((rings) => inRing(p, rings[0]!) && !rings.slice(1).some((h) => inRing(p, h)))
}

/**
 * Cuts a line where `keyAt` changes, sampled every STEP metres; runs shorter than `minRun` metres
 * take the key of their longer neighbour, so a line brushing a boundary is not cut into slivers.
 */
export function splitByKey<K>(coords: LonLat[], keyAt: (p: LonLat) => K, minRun = 40) {
  const STEP = 5
  const cum = [0]
  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = xy(coords[i - 1]!),
      [bx, by] = xy(coords[i]!)
    cum.push(cum[i - 1]! + Math.hypot(bx - ax, by - ay))
  }
  const total = cum[cum.length - 1]!
  const pointAt = (s: number): LonLat => {
    let i = 1
    while (i < cum.length - 1 && cum[i]! < s) i++
    const a = coords[i - 1]!,
      b = coords[i]!
    const t = cum[i]! > cum[i - 1]! ? (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]!) : 0
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
  }
  const n = Math.max(1, Math.ceil(total / STEP))
  const ss = Array.from({ length: n + 1 }, (_, k) => (k * total) / n)
  const keys = ss.map((s) => keyAt(pointAt(s)))
  // runs as [startSample, endSample) with their key
  let runs: { a: number; b: number; key: K }[] = []
  for (let k = 0; k < keys.length; k++) {
    const last = runs[runs.length - 1]
    if (last && last.key === keys[k]) last.b = k + 1
    else runs.push({ a: k, b: k + 1, key: keys[k]! })
  }
  const len = (r: { a: number; b: number }) => ((r.b - r.a) * total) / n
  for (;;) {
    if (runs.length < 2) break
    let iMin = -1
    for (let i = 0; i < runs.length; i++)
      if (len(runs[i]!) < minRun && (iMin < 0 || len(runs[i]!) < len(runs[iMin]!))) iMin = i
    if (iMin < 0) break
    const prev = runs[iMin - 1],
      next = runs[iMin + 1]
    const into = !prev ? next! : !next ? prev : len(prev) >= len(next) ? prev : next
    runs[iMin]!.key = into.key
    const merged: typeof runs = []
    for (const r of runs) {
      const last = merged[merged.length - 1]
      if (last && last.key === r.key) last.b = r.b
      else merged.push({ ...r })
    }
    runs = merged
  }
  return runs.map((r, i) => {
    // cut halfway between the last sample of one run and the first of the next
    const s0 = i === 0 ? 0 : (ss[r.a - 1]! + ss[r.a]!) / 2
    const s1 = i === runs.length - 1 ? total : (ss[r.b - 1]! + ss[r.b]!) / 2
    const c: LonLat[] = i === 0 ? [coords[0]!] : [pointAt(s0)]
    for (let v = 1; v < coords.length - 1; v++) if (cum[v]! > s0 && cum[v]! < s1) c.push(coords[v]!)
    c.push(i === runs.length - 1 ? coords[coords.length - 1]! : pointAt(s1))
    return { key: r.key, coords: c }
  })
}
