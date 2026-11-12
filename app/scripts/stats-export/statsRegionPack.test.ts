import { decode, encode } from '@msgpack/msgpack'
import { describe, expect, test } from 'vitest'
import {
  decodeStatsRegionPack,
  encodeStatsRegionPack,
  gemeindeGeometryShardKey,
  splitGemeindeGeometry,
  splitStatsFeaturesByLevel,
} from './statsRegionPack'

/** Reads the arc count at the head of a v3 arc stream. */
class VarintCount {
  arcs: number
  constructor(bytes: Uint8Array) {
    let z = 0
    let mul = 1
    let i = 0
    for (;;) {
      const b = bytes[i++]!
      z += (b & 0x7f) * mul
      if (!(b & 0x80)) break
      mul *= 0x80
    }
    this.arcs = z
  }
}

/** A v2 coordinate line: zigzag varints of 1e-5° deltas. */
function v2Line(positions: number[][]) {
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
    const x = Math.round(lng! * 1e5)
    const y = Math.round(lat! * 1e5)
    push(x - px)
    push(y - py)
    px = x
    py = y
  }
  return Uint8Array.from(out)
}

describe('statsRegionPack', () => {
  test('round-trips feature collection', () => {
    const features = [
      {
        type: 'Feature',
        properties: { id: 'relation/1', name: 'Test', level: '8', road_length: { primary: 1 } },
        geometry: { type: 'Point', coordinates: [11, 48] },
      },
    ]
    const bytes = encodeStatsRegionPack(features)
    const decoded = decodeStatsRegionPack(bytes)
    expect(decoded).toHaveLength(1)
    expect(decoded[0]?.properties?.id).toBe('relation/1')
  })

  test('keeps polygon and multipolygon coordinates to ~10 m (1e-4°)', () => {
    const ring = [
      [10.123456789, 48.987654321],
      [10.2, 48.9],
      [-0.5, -0.25],
      [10.123456789, 48.987654321],
    ]
    const features = [
      {
        type: 'Feature',
        properties: { id: 'a' },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
      {
        type: 'Feature',
        properties: { id: 'b' },
        geometry: { type: 'MultiPolygon', coordinates: [[ring, ring.slice().reverse()], [ring]] },
      },
    ]
    const decoded = decodeStatsRegionPack(encodeStatsRegionPack(features))
    const poly = decoded[0]?.geometry as { type: string; coordinates: number[][][] }
    expect(poly.type).toBe('Polygon')
    expect(poly.coordinates[0]).toHaveLength(4)
    poly.coordinates[0]!.forEach(([x, y], i) => {
      expect(Math.abs(x! - ring[i]![0]!)).toBeLessThanOrEqual(0.5e-4)
      expect(Math.abs(y! - ring[i]![1]!)).toBeLessThanOrEqual(0.5e-4)
    })
    expect(poly.coordinates[0]![0]).toEqual(poly.coordinates[0]![3])
    const multi = decoded[1]?.geometry as { coordinates: number[][][][] }
    expect(multi.coordinates.map((p) => p.length)).toEqual([2, 1])
    expect(multi.coordinates[0]![1]![1]![0]).toBeCloseTo(-0.5, 4)
  })

  test('stores lengths to the metre and leaves other props alone', () => {
    const features = [
      {
        type: 'Feature',
        properties: {
          id: 'a',
          name: 'A',
          level: '8',
          road_length: { secondary: 13.016987500000003 },
          bikelane_length: { needsClarification: 2.8957885714285716 },
        },
        geometry: null,
      },
    ]
    const p = decodeStatsRegionPack(encodeStatsRegionPack(features))[0]?.properties as
      | Record<string, unknown>
      | undefined
    expect(p?.road_length).toEqual({ secondary: 13.017 })
    expect(p?.bikelane_length).toEqual({ needsClarification: 2.896 })
    expect(p?.name).toBe('A')
  })

  test('neighbours share their border: it is stored once, and both get it back unchanged', () => {
    // two squares side by side, the right one drawn the other way round
    const left = [
      [10, 48],
      [11, 48],
      [11, 49],
      [10, 49],
      [10, 48],
    ]
    const right = [
      [11, 48],
      [11, 49],
      [12, 49],
      [12, 48],
      [11, 48],
    ]
    const features = [
      {
        type: 'Feature',
        properties: { id: 'l' },
        geometry: { type: 'Polygon', coordinates: [left] },
      },
      {
        type: 'Feature',
        properties: { id: 'r' },
        geometry: { type: 'Polygon', coordinates: [right] },
      },
      {
        type: 'Feature',
        properties: { id: 'both' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [10, 48],
              [11, 48],
              [12, 48],
              [12, 49],
              [11, 49],
              [10, 49],
              [10, 48],
            ],
          ],
        },
      },
    ]
    const bytes = encodeStatsRegionPack(features)
    const pack = decode(bytes) as { topology: { arcs: Uint8Array; geometries: unknown[] } }
    // the shared border 11,48–11,49 is one arc; the outer halves of left and right are two
    // more, and the outline of 'both' is made of exactly those two — no new arc for it
    expect(new VarintCount(pack.topology.arcs).arcs).toBe(3)
    const decoded = decodeStatsRegionPack(bytes)
    expect(decoded.map((f) => f.geometry)).toEqual(features.map((f) => f.geometry))
  })

  test("an enclave is its host's hole: one arc for both", () => {
    const inner = [
      [10.2, 48.2],
      [10.4, 48.2],
      [10.4, 48.4],
      [10.2, 48.4],
      [10.2, 48.2],
    ]
    const outer = [
      [10, 48],
      [11, 48],
      [11, 49],
      [10, 49],
      [10, 48],
    ]
    const features = [
      {
        type: 'Feature',
        properties: { id: 'host' },
        geometry: { type: 'Polygon', coordinates: [outer, inner.slice().reverse()] },
      },
      {
        type: 'Feature',
        properties: { id: 'enclave' },
        geometry: { type: 'Polygon', coordinates: [inner] },
      },
    ]
    const bytes = encodeStatsRegionPack(features)
    expect(
      new VarintCount((decode(bytes) as { topology: { arcs: Uint8Array } }).topology.arcs).arcs,
    ).toBe(2)
    expect(decodeStatsRegionPack(bytes).map((f) => f.geometry)).toEqual(
      features.map((f) => f.geometry),
    )
  })

  test('simplifyMetres thins borders but keeps neighbours identical along them', () => {
    const wiggly = (x0: number) => {
      const pts: number[][] = [[x0, 48]]
      for (let i = 1; i < 20; i++) pts.push([x0 + 0.5 + (i % 2) * 0.0005, 48 + i * 0.05])
      pts.push([x0 + 0.5, 49], [x0, 49], [x0, 48])
      return pts
    }
    const a = wiggly(10)
    const b = a.map(([x, y]) => [x! + 0.5, y!]) // shares a's right side as its left side
    const features = [
      { type: 'Feature', properties: { id: 'a' }, geometry: { type: 'Polygon', coordinates: [a] } },
      {
        type: 'Feature',
        properties: { id: 'b' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              a[1]!,
              ...b.slice(1, 21).map(([x, y]) => [x! - 0.5 + 0.5, y!]),
              [10.5, 49],
              a[22]!,
              a[1]!,
            ],
          ],
        },
      },
    ]
    const plain = decodeStatsRegionPack(encodeStatsRegionPack(features))
    const thin = decodeStatsRegionPack(encodeStatsRegionPack(features, { simplifyMetres: 200 }))
    const ringOf = (f: { geometry?: unknown }) =>
      (f.geometry as { coordinates: number[][][] }).coordinates[0]!
    expect(ringOf(thin[0]!).length).toBeLessThan(ringOf(plain[0]!).length)
    expect(ringOf(thin[0]!).length).toBeGreaterThanOrEqual(4)
    // every point of the thinned shared side is on both polygons
    const keys = (r: number[][]) => new Set(r.map((p) => p.join(',')))
    const sideA = ringOf(thin[0]!).filter(([x]) => Math.abs(x! - 10.5) < 0.001)
    expect(sideA.length).toBeGreaterThan(0)
    const bKeys = keys(ringOf(thin[1]!))
    for (const p of sideA) expect(bKeys.has(p.join(','))).toBe(true)
  })

  test('still reads v2 packs', () => {
    const features = [
      {
        type: 'Feature',
        properties: { id: 'a', road_length: { primary: 1.234 } },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [10, 48],
              [11, 48],
              [11, 49],
              [10, 48],
            ],
          ],
        },
      },
    ]
    const v2 = encode({
      version: 2,
      features: [
        {
          ...features[0],
          properties: { id: 'a', road_length: { primary: 1234 } },
          geometry: { type: 'Polygon', lines: [v2Line(features[0]!.geometry.coordinates[0]!)] },
        },
      ],
    })
    expect(decodeStatsRegionPack(v2)).toEqual(features)
  })

  test('still reads v1 packs', () => {
    const features = [
      {
        type: 'Feature',
        properties: { id: 'a', road_length: { primary: 1.23456 } },
        geometry: { type: 'Point', coordinates: [11.123456789, 48] },
      },
    ]
    const decoded = decodeStatsRegionPack(encode({ version: 1, features }))
    expect(decoded).toEqual(features)
  })
})

describe('splitStatsFeaturesByLevel', () => {
  test('routes Gemeindeverbände (7) and Stadtbezirke (9) to extra, everything else to core', () => {
    const feature = (level: string) => ({
      type: 'Feature',
      properties: { id: 'relation/' + level, level },
      geometry: { type: 'Point', coordinates: [0, 0] },
    })
    const { core, extra } = splitStatsFeaturesByLevel(
      ['2', '4', '5', '6', '7', '8', '9'].map(feature),
    )
    expect(core.map((f) => f.properties?.level)).toEqual(['2', '4', '5', '6', '8'])
    expect(extra.map((f) => f.properties?.level)).toEqual(['7', '9'])
  })

  test('treats a missing level as core', () => {
    const { core, extra } = splitStatsFeaturesByLevel([
      { type: 'Feature', properties: {}, geometry: null },
    ])
    expect(core).toHaveLength(1)
    expect(extra).toHaveLength(0)
  })
})

describe('splitGemeindeGeometry', () => {
  const square = (x: number, y: number) => ({
    type: 'Polygon',
    coordinates: [
      [
        [x, y],
        [x + 0.2, y],
        [x + 0.2, y + 0.4],
        [x, y + 0.4],
        [x, y],
      ],
    ],
  })
  const feature = (id: string, level: string, geometry: unknown, landkreis?: string) => ({
    type: 'Feature',
    properties: { id, name: id, level, ...(landkreis && { landkreis_id: landkreis }) },
    geometry,
  })
  const features = [
    feature('relation/6', '6', square(10, 48)),
    feature('relation/81', '8', square(11, 48), 'relation/6'),
    feature('relation/82', '8', square(12, 49), 'relation/6'),
    feature('relation/83', '8', square(13, 50), 'relation/7'),
    feature('relation/84', '8', square(14, 51)),
  ]

  test('only Gemeinde polygons are taken out; everything else is untouched', () => {
    const { light } = splitGemeindeGeometry(features)
    expect(light).toHaveLength(5)
    expect(light[0]).toEqual(features[0]) // the Landkreis keeps its polygon
    for (const f of light.slice(1)) {
      expect(f.geometry).toBeNull()
      expect(f.properties?.name).toBe(f.properties?.id) // statistics stay
    }
  })

  test('a Gemeinde keeps its centre, the middle of its bounding box', () => {
    const { light } = splitGemeindeGeometry(features)
    expect(light[1]?.properties?.center).toEqual([11.1, 48.2])
    expect(light[4]?.properties?.center).toEqual([14.1, 51.2])
  })

  test('polygons go into one shard per Landkreis; strays share "none"', () => {
    const { shards } = splitGemeindeGeometry(features)
    expect([...shards.keys()].sort()).toEqual(['none', 'relation-6', 'relation-7'])
    expect(shards.get('relation-6')?.map((f) => f.properties?.id)).toEqual([
      'relation/81',
      'relation/82',
    ])
    expect(shards.get('none')?.map((f) => f.properties?.id)).toEqual(['relation/84'])
  })

  test('shard key is the Landkreis id as a file name, and the same for every caller', () => {
    expect(gemeindeGeometryShardKey({ landkreis_id: 'relation/62371' })).toBe('relation-62371')
    expect(gemeindeGeometryShardKey({})).toBe('none')
    expect(gemeindeGeometryShardKey(null)).toBe('none')
  })

  test('a shard restores the polygon exactly as the full pack would have had it', () => {
    const { shards } = splitGemeindeGeometry(features)
    const restored = decodeStatsRegionPack(encodeStatsRegionPack(shards.get('relation-6') ?? []))
    const original = decodeStatsRegionPack(encodeStatsRegionPack(features))
    expect(restored.map((f) => f.geometry)).toEqual([original[1]?.geometry, original[2]?.geometry])
  })

  test('the light pack is much smaller than the full one', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      feature(
        `relation/${100 + i}`,
        '8',
        square(8 + (i % 20) * 0.01, 47 + Math.floor(i / 20) * 0.01),
        'relation/6',
      ),
    )
    const full = encodeStatsRegionPack(many).length
    const light = encodeStatsRegionPack(splitGemeindeGeometry(many).light).length
    expect(light).toBeLessThan(full)
  })
})
