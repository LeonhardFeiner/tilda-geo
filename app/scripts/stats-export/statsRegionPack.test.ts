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
