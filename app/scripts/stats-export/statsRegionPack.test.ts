import { describe, expect, test } from 'vitest'
import { decodeStatsRegionPack, encodeStatsRegionPack } from './statsRegionPack'

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
