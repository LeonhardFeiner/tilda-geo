import { describe, expect, test } from 'vitest'
import {
  routeComposition,
  splitCategoryLabel,
  STRESS_SCALE,
  type DetourGraph,
  type EdgeSet,
  bikeStress,
  CAR_SECONDS_PER_KM,
  buildAdjacency,
  CLOSE_FROM_SAFETY,
  CLOSED_STRESS,
  decodeDeltaPoints,
  decodeDetourGraph,
  detourTable,
  edgeCoordinates,
  encodeDeltaPoints,
  encodeDetourGraph,
  routeCoordinates,
  shortestPaths,
} from './detourRouting'

/**
 * A toy Landkreis: A and B are 1 km apart. Two bike options: the direct 100 km/h road (edge 0,
 * stress 1) or a 1.6 km detour over a cycleway via C (edges 1+2, stress 0, 30 m climb). Cars
 * only know the direct road. D hangs on a one-way edge from B.
 */
type EdgeSpec = { from: number[]; to: number[] } & Partial<
  Record<'len' | 'upF' | 'upB' | 'kmhF' | 'kmhB' | 'stress' | 'cat', number[]>
>

function edges([s]: [EdgeSpec]): EdgeSet {
  const n = s.from.length
  const zeros = () => Array.from({ length: n }, () => 0)
  return {
    count: n,
    from: Int32Array.from(s.from),
    to: Int32Array.from(s.to),
    len: Uint16Array.from(s.len ?? zeros()),
    upF: Uint16Array.from(s.upF ?? zeros()),
    upB: Uint16Array.from(s.upB ?? zeros()),
    kmhF: Uint8Array.from(s.kmhF ?? zeros()),
    kmhB: Uint8Array.from(s.kmhB ?? zeros()),
    stress: Uint8Array.from(s.stress ?? zeros()),
    cat: Uint8Array.from(s.cat ?? zeros()),
    geom: new Uint8Array(0),
    geomOffset: Uint32Array.from({ length: n + 1 }, () => 0),
  }
}

function toyGraph(): DetourGraph {
  // nodes: 0 = A, 1 = B, 2 = C, 3 = D
  const lon = Float64Array.from([11.5, 11.5136, 11.5068, 11.52])
  const lat = Float64Array.from([48.5, 48.5, 48.506, 48.5])
  const bike = edges([
    {
      from: [0, 0, 2, 1],
      to: [1, 2, 1, 3],
      len: [1000, 800, 800, 500],
      upF: [0, 30, 0, 0],
      upB: [0, 0, 30, 0],
      kmhF: [18, 18, 18, 18],
      kmhB: [18, 18, 18, 0],
      stress: [100, 0, 0, 10],
    },
  ])
  const car = edges([
    { from: [0, 1], to: [1, 3], len: [1000, 500], kmhF: [85, 30], kmhB: [85, 30], stress: [0, 0] },
  ])
  return {
    version: 1,
    meta: {
      landkreisId: 'relation/1',
      landkreisName: 'Test',
      osmDataFrom: null,
      builtAt: '2026-01-01T00:00:00Z',
      demSource: 'test',
      categories: ['mixedTrafficMotor', 'cycleway_adjoining'],
      roadClasses: ['primary', 'residential'],
      outline: [],
      bbox: [11.5, 48.5, 11.52, 48.506],
    },
    nodeCount: 4,
    lon,
    lat,
    elev: Int16Array.from([400, 400, 430, 400]),
    bike,
    car,
    places: [
      {
        id: 1,
        name: 'A',
        kind: 'village',
        lon: 11.5,
        lat: 48.5,
        population: null,
        gemeindeId: null,
        gemeinde: null,
        bikeNode: 0,
        carNode: 0,
      },
      {
        id: 2,
        name: 'B',
        kind: 'village',
        lon: 11.5136,
        lat: 48.5,
        population: null,
        gemeindeId: null,
        gemeinde: null,
        bikeNode: 1,
        carNode: 1,
      },
      {
        id: 3,
        name: 'D',
        kind: 'hamlet',
        lon: 11.52,
        lat: 48.5,
        population: null,
        gemeindeId: null,
        gemeinde: null,
        bikeNode: 3,
        carNode: 3,
      },
      {
        id: 4,
        name: 'Nowhere',
        kind: 'hamlet',
        lon: 11.6,
        lat: 48.6,
        population: null,
        gemeindeId: null,
        gemeinde: null,
        bikeNode: -1,
        carNode: -1,
      },
    ],
  }
}

describe('bikeStress', () => {
  test('separated infrastructure is stress-free, mixed traffic grows with the speed limit', () => {
    expect(bikeStress('cycleway_adjoining', 100, 'primary')).toBe(0)
    expect(bikeStress('mixedTrafficFoot', null, 'track')).toBe(0)
    expect(bikeStress('mixedTrafficMotor', 30, 'residential')).toBeCloseTo(0.1)
    expect(bikeStress('mixedTrafficMotor', 50, 'tertiary')).toBeCloseTo(0.35)
    expect(bikeStress('mixedTrafficMotor', 100, 'primary')).toBe(1)
    expect(bikeStress('mixedTrafficMotor', 60, 'tertiary')).toBeGreaterThan(0.35)
    expect(bikeStress('mixedTrafficMotor', 60, 'tertiary')).toBeLessThan(0.7)
  })
  test('without a limit the road class decides: rural main roads count as 100 km/h', () => {
    expect(bikeStress('mixedTrafficMotor', null, 'tertiary')).toBe(1)
    expect(bikeStress('mixedTrafficMotor', null, 'residential')).toBeCloseTo(0.1)
  })
  test('quiet connecting roads (unclassified) stay below the closing threshold', () => {
    expect(bikeStress('mixedTrafficMotor', null, 'unclassified')).toBeCloseTo(0.6)
    expect(bikeStress('mixedTrafficMotor', 100, 'unclassified')).toBeLessThan(CLOSED_STRESS)
    expect(bikeStress('mixedTrafficMotor', 100, 'tertiary')).toBeGreaterThanOrEqual(CLOSED_STRESS)
  })
  test('on-road lanes soften but do not remove the traffic', () => {
    const mixed = bikeStress('mixedTrafficMotor', 50, 'secondary')
    expect(bikeStress('cyclewayOnHighway_exclusive', 50, 'secondary')).toBeLessThan(mixed)
    expect(bikeStress('cyclewayOnHighway_advisory', 50, 'secondary')).toBeLessThan(mixed)
    expect(bikeStress('cyclewayOnHighway_advisory', 50, 'secondary')).toBeGreaterThan(0)
  })
})

describe('shortestPaths', () => {
  const g = toyGraph()
  const adj = buildAdjacency(g.bike, g.nodeCount)

  test('safety 0 takes the direct road, high safety takes the cycleway detour', () => {
    const fast = shortestPaths(g.bike, adj, g.nodeCount, 0, 0)
    expect(fast.metres[1]).toBe(1000)
    expect(fast.climb[1]).toBe(0)
    const safe = shortestPaths(g.bike, adj, g.nodeCount, 0, 0.5)
    expect(safe.metres[1]).toBe(1600)
    expect(safe.climb[1]).toBe(30)
    expect(safe.seconds[1]).toBeCloseTo(1600 / 5, 3)
  })

  test('the cost is monotone in the slider', () => {
    let previous = -1
    for (let s = 0; s <= 1; s += 0.1) {
      const r = shortestPaths(g.bike, adj, g.nodeCount, 0, s)
      expect(r.cost[1]).toBeGreaterThanOrEqual(previous)
      previous = r.cost[1]!
    }
  })

  test('above the closing threshold busy edges are not used even when nothing else exists', () => {
    const noDetour = edges([
      { from: [0], to: [1], len: [1000], kmhF: [18], kmhB: [18], stress: [100] },
    ])
    const a = buildAdjacency(noDetour, 2)
    expect(shortestPaths(noDetour, a, 2, 0, CLOSE_FROM_SAFETY - 0.05).cost[1]).toBeLessThan(
      Infinity,
    )
    expect(shortestPaths(noDetour, a, 2, 0, CLOSE_FROM_SAFETY).cost[1]).toBe(Infinity)
  })

  test('the per-km cost drops a long fast loop that only saves a little time', () => {
    // 0 → 1 direct: 27 km at 75 km/h = 1296 s. Via 2: 2 × 20 km at 120 km/h = 1200 s, so the
    // loop is 96 s faster but 13 km longer — 390 s of per-km cost at 30 s/km.
    const set = edges([
      {
        from: [0, 0, 2],
        to: [1, 2, 1],
        len: [27000, 20000, 20000],
        kmhF: [75, 120, 120],
        kmhB: [75, 120, 120],
      },
    ])
    const a = buildAdjacency(set, 3)
    expect(shortestPaths(set, a, 3, 0, 0).metres[1]).toBe(40000)
    const usual = shortestPaths(set, a, 3, 0, 0, CAR_SECONDS_PER_KM)
    expect(usual.metres[1]).toBe(27000)
    // Reported minutes stay travel time; the per-km term only steers the choice.
    expect(usual.seconds[1]).toBeCloseTo(27000 / (75 / 3.6), 3)
  })

  test('one-way edges are only passable in their direction', () => {
    const fromA = shortestPaths(g.bike, adj, g.nodeCount, 0, 0)
    expect(fromA.metres[3]).toBe(1500)
    const fromD = shortestPaths(g.bike, adj, g.nodeCount, 3, 0)
    expect(fromD.cost[1]).toBe(Infinity)
  })

  test('climb is counted per direction', () => {
    // C sits 30 m above A and B: climbing to C costs 30, leaving it costs nothing.
    const fromA = shortestPaths(g.bike, adj, g.nodeCount, 0, 1)
    const fromC = shortestPaths(g.bike, adj, g.nodeCount, 2, 1)
    expect(fromA.climb[2]).toBe(30)
    expect(fromC.climb[0]).toBe(0)
    expect(fromC.climb[1]).toBe(0)
  })

  test('route coordinates run from source to target through the chosen nodes', () => {
    const safe = shortestPaths(g.bike, adj, g.nodeCount, 0, 1)
    const coords = routeCoordinates(g, g.bike, adj, safe, 1)
    expect(coords).toEqual([
      [11.5, 48.5],
      [11.5068, 48.506],
      [11.5136, 48.5],
    ])
    // D hangs behind B: A → C → B → D.
    expect(routeCoordinates(g, g.bike, adj, safe, 3).length).toBe(4)
    expect(
      routeCoordinates(g, g.bike, adj, shortestPaths(g.bike, adj, g.nodeCount, 3, 0), 0),
    ).toEqual([])
  })
})

describe('detourTable', () => {
  test('compares bike and car per place and marks unreachable ones', () => {
    const g = toyGraph()
    const car = shortestPaths(g.car, buildAdjacency(g.car, g.nodeCount), g.nodeCount, 0, 0)
    const bike = shortestPaths(g.bike, buildAdjacency(g.bike, g.nodeCount), g.nodeCount, 0, 1)
    const rows = detourTable(g, 0, car, bike)
    expect(rows.map((r) => r.place.name)).toEqual(['B', 'D', 'Nowhere'])
    const b = rows[0]!
    expect(b.ref?.km).toBe(1)
    expect(b.bike?.km).toBe(1.6)
    expect(b.extraKm).toBeCloseTo(0.6)
    expect(b.extraClimbM).toBe(30)
    expect(b.factor).toBeCloseTo(1.6)
    expect(b.airKm).toBeCloseTo(1, 1)
    expect(rows[2]!.ref).toBeNull()
    expect(rows[2]!.bike).toBeNull()
    expect(rows[2]!.extraKm).toBeNull()
  })

  test('compares with the fastest bike route when the reference is a bike search', () => {
    const g = toyGraph()
    const adj = buildAdjacency(g.bike, g.nodeCount)
    const fast = shortestPaths(g.bike, adj, g.nodeCount, 0, 0)
    const safe = shortestPaths(g.bike, adj, g.nodeCount, 0, 1)
    const b = detourTable(g, 0, fast, safe, 'bikeNode')[0]!
    // Fastest: the direct 1 km road; safe: the 1.6 km cycleway over C (30 m up).
    expect(b.ref?.km).toBe(1)
    expect(b.extraKm).toBeCloseTo(0.6)
    expect(b.extraClimbM).toBe(30)
    // Same search on both sides: no detour at all.
    const same = detourTable(g, 0, fast, fast, 'bikeNode')[0]!
    expect(same.extraKm).toBe(0)
    expect(same.factor).toBe(1)
  })
})

describe('packing', () => {
  test('delta points round-trip', () => {
    const pts: Array<[number, number]> = [
      [1150001, 4850000],
      [1150100, 4849950],
      [1149990, 4850010],
    ]
    const bytes = encodeDeltaPoints(pts, 1150000, 4850000)
    expect(decodeDeltaPoints(bytes, 0, bytes.length, 1150000, 4850000)).toEqual(pts)
  })

  test('a graph survives encode → decode, including edge geometry', () => {
    const g = toyGraph()
    // Give edge 1 (A→C) one interior point so edgeCoordinates has something to decode.
    const interior = encodeDeltaPoints(
      [[1150340, 4850300]],
      Math.round(11.5 * 1e5),
      Math.round(48.5 * 1e5),
    )
    g.bike.geom = interior
    g.bike.geomOffset = Uint32Array.from([0, 0, interior.length, interior.length, interior.length])
    const back = decodeDetourGraph(encodeDetourGraph(g))
    expect(back.nodeCount).toBe(4)
    expect(Array.from(back.lon)).toEqual(Array.from(g.lon))
    expect(Array.from(back.bike.len)).toEqual(Array.from(g.bike.len))
    expect(Array.from(back.car.kmhF)).toEqual(Array.from(g.car.kmhF))
    expect(back.places[1]!.name).toBe('B')
    expect(back.meta.categories).toEqual(g.meta.categories)
    expect(edgeCoordinates(back, back.bike, 1)).toEqual([
      [11.5, 48.5],
      [11.5034, 48.503],
      [11.5068, 48.506],
    ])
    expect(edgeCoordinates(back, back.bike, 1, false)[0]).toEqual([11.5068, 48.506])
  })
})

describe('routeComposition', () => {
  test('splits a route by kind of way and adds flags', () => {
    expect(splitCategoryLabel('mixedTrafficFoot|track|unpaved')).toEqual({
      category: 'mixedTrafficFoot',
      track: true,
      unpaved: true,
    })
    const meta = {
      categories: [
        'cycleway_isolated',
        'mixedTrafficFoot|track|unpaved',
        'mixedTrafficMotor',
        'mixedTrafficFoot',
      ],
    }
    const set = {
      len: Uint16Array.from([100, 200, 300, 400, 50]),
      stress: Uint8Array.from([0, 0, 1 * STRESS_SCALE, 0.35 * STRESS_SCALE, 0]),
      cat: Uint8Array.from([0, 1, 2, 2, 3]),
      kmhF: Uint8Array.from([18, 9, 18, 18, 5]),
      kmhB: Uint8Array.from([18, 9, 18, 18, 5]),
    }
    const edges = [0, 1, 2, 3, 4].map((edge) => ({ edge, forward: true }))
    const c = routeComposition(
      { meta } as unknown as Parameters<typeof routeComposition>[0],
      set as unknown as Parameters<typeof routeComposition>[1],
      edges,
    )
    expect(c).toEqual({
      totalM: 1050,
      infraM: 100,
      trackM: 200,
      quietM: 50,
      townM: 400,
      busyM: 300,
      pushedM: 50,
      unpavedM: 200,
    })
  })
})
