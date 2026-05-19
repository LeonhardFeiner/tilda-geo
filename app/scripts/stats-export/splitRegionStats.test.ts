import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { StatsFeature } from '../bike-share-map/regionNavigation'
import { writeSplitRegionStats } from './splitRegionStats'

const features = [
  {
    type: 'Feature',
    properties: { id: 'relation/DE', name: 'Deutschland', level: '2' },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: { id: 'relation/BY', name: 'Bayern', level: '4' },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK',
      name: 'München',
      level: '6',
      bundesland_id: 'relation/BY',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/G',
      name: 'Garching',
      level: '8',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
] satisfies StatsFeature[]

describe('splitRegionStats', () => {
  test('writes deutschland without gemeinden and per-bundesland file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilda-split-'))
    const result = writeSplitRegionStats([...features], dir, { writeMonolithic: false })
    const de = JSON.parse(readFileSync(result.deutschlandPath, 'utf8')) as {
      features: Array<{ properties: { level?: string } }>
    }
    const levels = de.features.map((f) => f.properties.level)
    expect(levels).toContain('2')
    expect(levels).toContain('4')
    expect(levels).toContain('6')
    expect(levels).not.toContain('8')

    const bl = JSON.parse(
      readFileSync(join(dir, 'regions/bundesland/relation-BY.geojson'), 'utf8'),
    ) as { features: Array<{ properties: { level?: string } }> }
    const blLevels = bl.features.map((f) => f.properties.level)
    expect(blLevels).toContain('8')
    expect(result.manifest.version).toBe(3)
    expect(result.manifest.bundeslaender[0]?.landkreise[0]?.id).toBe('relation/LK')
  })
})
