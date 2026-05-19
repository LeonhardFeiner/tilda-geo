import { describe, expect, test } from 'vitest'
import { buildRegionIndex, type StatsFeature } from './regionNavigation'
import {
  buildNeighborIndex,
  computeSimpleAllowedIds,
  neighborIndexFromPrecomputed,
} from './regionNeighbors'

const square = (minX: number, minY: number, size: number) =>
  ({
    type: 'Polygon',
    coordinates: [
      [
        [minX, minY],
        [minX + size, minY],
        [minX + size, minY + size],
        [minX, minY + size],
        [minX, minY],
      ],
    ],
  }) satisfies StatsFeature['geometry']

const features = [
  {
    type: 'Feature',
    properties: { id: 'relation/BL', name: 'Bayern', level: '4' },
    geometry: square(0, 0, 10),
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK-A',
      name: 'LK A',
      level: '6',
      bundesland_id: 'relation/BL',
    },
    geometry: square(0, 0, 2),
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK-B',
      name: 'LK B',
      level: '6',
      bundesland_id: 'relation/BL',
    },
    geometry: square(2, 0, 2),
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK-C',
      name: 'LK C',
      level: '6',
      bundesland_id: 'relation/BL',
    },
    geometry: square(10, 10, 2),
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/GM-A1',
      name: 'Gemeinde A1',
      level: '8',
      bundesland_id: 'relation/BL',
      landkreis_id: 'relation/LK-A',
    },
    geometry: square(0, 0, 1),
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/GM-A2',
      name: 'Gemeinde A2',
      level: '8',
      bundesland_id: 'relation/BL',
      landkreis_id: 'relation/LK-A',
    },
    geometry: square(1, 0, 1),
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/GM-B1',
      name: 'Gemeinde B1',
      level: '8',
      bundesland_id: 'relation/BL',
      landkreis_id: 'relation/LK-B',
    },
    geometry: square(2, 0, 1),
  },
] satisfies StatsFeature[]

describe('regionNeighbors', () => {
  const index = buildRegionIndex(features)
  const neighbors = buildNeighborIndex(index)

  test('detects touching landkreise in the same bundesland', () => {
    const allowed = computeSimpleAllowedIds(
      'lk_neighbors_landkreise',
      {
        focusId: 'relation/LK-A',
        landkreisId: 'relation/LK-A',
        gemeindeId: null,
        bundeslandId: 'relation/BL',
      },
      index,
      neighbors,
    )
    expect(allowed.has('relation/LK-A')).toBe(true)
    expect(allowed.has('relation/LK-B')).toBe(true)
    expect(allowed.has('relation/LK-C')).toBe(false)
  })

  test('precomputed file matches browser-built landkreis neighbors', () => {
    const fromFile = neighborIndexFromPrecomputed({
      version: 1,
      landkreis: { 'relation/LK-A': ['relation/LK-B'] },
      landkreisStadtstaat: {},
      gemeinde: { 'relation/GM-A2': ['relation/GM-A1', 'relation/GM-B1'] },
    })
    const allowed = computeSimpleAllowedIds(
      'lk_neighbors_landkreise',
      {
        focusId: 'relation/LK-A',
        landkreisId: 'relation/LK-A',
        gemeindeId: null,
        bundeslandId: 'relation/BL',
      },
      index,
      fromFile,
    )
    expect(allowed.has('relation/LK-B')).toBe(true)
  })

  test('detects gemeinde neighbors across touching landkreise', () => {
    const allowed = computeSimpleAllowedIds(
      'gm_neighbors',
      {
        focusId: 'relation/GM-A2',
        landkreisId: 'relation/LK-A',
        gemeindeId: 'relation/GM-A2',
        bundeslandId: 'relation/BL',
      },
      index,
      neighbors,
    )
    expect(allowed.has('relation/GM-A2')).toBe(true)
    expect(allowed.has('relation/GM-B1')).toBe(true)
    expect(allowed.has('relation/GM-A1')).toBe(true)
  })
})
