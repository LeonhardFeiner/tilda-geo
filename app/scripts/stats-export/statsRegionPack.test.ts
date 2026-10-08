import { encode } from '@msgpack/msgpack'
import { describe, expect, test } from 'vitest'
import {
  decodeStatsRegionPack,
  encodeStatsRegionPack,
  splitStatsFeaturesByLevel,
} from './statsRegionPack'

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

  test('keeps polygon and multipolygon coordinates to ~1 m', () => {
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
      expect(x).toBeCloseTo(ring[i]![0]!, 5)
      expect(y).toBeCloseTo(ring[i]![1]!, 5)
    })
    expect(poly.coordinates[0]![0]).toEqual(poly.coordinates[0]![3])
    const multi = decoded[1]?.geometry as { coordinates: number[][][][] }
    expect(multi.coordinates.map((p) => p.length)).toEqual([2, 1])
    expect(multi.coordinates[0]![1]![1]![0]).toBeCloseTo(-0.5, 5)
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
    const p = decodeStatsRegionPack(encodeStatsRegionPack(features))[0]?.properties
    expect(p?.road_length).toEqual({ secondary: 13.017 })
    expect(p?.bikelane_length).toEqual({ needsClarification: 2.896 })
    expect(p?.name).toBe('A')
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
