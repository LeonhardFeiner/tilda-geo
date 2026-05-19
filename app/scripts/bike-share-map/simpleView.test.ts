import { describe, expect, test } from 'vitest'
import { buildRegionIndex } from './regionNavigation'
import type { StatsFeature } from './regionNavigation'
import { neighborIndexFromPrecomputed } from './regionNeighbors'
import {
  computeSimpleAllowedIds,
  defaultSimplePresetForFocus,
  filterFeaturesForSimpleView,
  gemeindeUnitIdsInLandkreise,
  listSimplePresetsForFocus,
  resolveFocusContext,
  simplePresetLabel,
  simplePresetToViewScope,
} from './simpleView'

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
      id: 'relation/RB',
      name: 'Oberbayern',
      level: '5',
      parent_id: 'relation/BY',
      bundesland_id: 'relation/BY',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK',
      name: 'München',
      level: '6',
      parent_id: 'relation/RB',
      bundesland_id: 'relation/BY',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK2',
      name: 'Ebersberg',
      level: '6',
      parent_id: 'relation/RB',
      bundesland_id: 'relation/BY',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/KF',
      name: 'Ingolstadt',
      level: '6',
      parent_id: 'relation/BY',
      bundesland_id: 'relation/BY',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/G3',
      name: 'Ebersberg',
      level: '8',
      parent_id: 'relation/LK2',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK2',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/G',
      name: 'Garching',
      level: '8',
      parent_id: 'relation/LK',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/G2',
      name: 'Ismaning',
      level: '8',
      parent_id: 'relation/LK',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
] satisfies StatsFeature[]

describe('simpleView', () => {
  const index = buildRegionIndex(features)
  const neighbors = neighborIndexFromPrecomputed({
    version: 1,
    landkreis: { 'relation/LK': ['relation/LK2'], 'relation/LK2': ['relation/LK'] },
    landkreisStadtstaat: {},
    gemeinde: {
      'relation/G': ['relation/G2'],
      'relation/G2': ['relation/G3'],
    },
  })

  test('lists deutschland presets', () => {
    const ctx = resolveFocusContext('deutschland', index)
    expect(ctx?.kind).toBe('deutschland')
    expect(listSimplePresetsForFocus(ctx!, index)).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
    ])
  })

  test('lists bundesland presets with parent deutschland options', () => {
    const ctx = resolveFocusContext('relation/BY', index)
    expect(listSimplePresetsForFocus(ctx!, index, { features })).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
    ])
  })

  test('lists landkreis presets with parent options', () => {
    const ctx = resolveFocusContext('relation/LK', index)
    expect(listSimplePresetsForFocus(ctx!, index, { features, neighbors })).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
      'lk_gemeinden',
      'lk_neighbors_landkreise',
      'lk_neighbors_gemeinden',
    ])
    expect(defaultSimplePresetForFocus(ctx!, index)).toBe('lk_gemeinden')
  })

  test('gemeinde focus includes landkreis neighbor presets for parent landkreis', () => {
    const ctx = resolveFocusContext('relation/G', index)
    expect(listSimplePresetsForFocus(ctx!, index, { features, neighbors })).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
      'lk_gemeinden',
      'gm_neighbors',
      'lk_neighbors_landkreise',
      'lk_neighbors_gemeinden',
    ])
  })

  test('gemeinde neighbors_other uses gemeinde graph not landkreis units', () => {
    const ctx = resolveFocusContext('relation/G', index)!
    const neighbors = neighborIndexFromPrecomputed({
      version: 1,
      landkreis: {
        'relation/LK': ['relation/LK2', 'relation/KF'],
        'relation/LK2': ['relation/LK'],
      },
      landkreisStadtstaat: {},
      gemeinde: { 'relation/G': ['relation/G2', 'relation/KF'] },
    })
    const allowed = computeSimpleAllowedIds('neighbors_other', ctx, index, neighbors)
    const filtered = filterFeaturesForSimpleView(features, 'neighbors_other', ctx, index, allowed)
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/G',
      'relation/G2',
      'relation/KF',
    ])
    const landkreisOnly = new Set(['relation/LK', 'relation/LK2', 'relation/KF'])
    expect(
      filterFeaturesForSimpleView(features, 'neighbors_other', ctx, index, landkreisOnly).length,
    ).toBe(1)
  })

  test('gemeinde focus omits nachbarn when only gemeinde neighbors exist', () => {
    const ctx = resolveFocusContext('relation/G', index)!
    expect(listSimplePresetsForFocus(ctx, index, { features, neighbors })).not.toContain(
      'neighbors_other',
    )
  })

  test('gemeinde focus adds nachbarn when a neighbor is kreisfrei or stadtstaat', () => {
    const ctx = resolveFocusContext('relation/G', index)!
    const withKreisfreiNeighbor = neighborIndexFromPrecomputed({
      version: 1,
      landkreis: {
        'relation/LK': ['relation/LK2', 'relation/KF'],
        'relation/LK2': ['relation/LK'],
      },
      landkreisStadtstaat: {},
      gemeinde: { 'relation/G': ['relation/G2', 'relation/KF'] },
    })
    expect(
      listSimplePresetsForFocus(ctx, index, { features, neighbors: withKreisfreiNeighbor }),
    ).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
      'lk_gemeinden',
      'neighbors_other',
      'gm_neighbors',
      'lk_neighbors_other',
      'lk_neighbors_landkreise',
      'lk_neighbors_gemeinden',
    ])
    const allowed = computeSimpleAllowedIds('neighbors_other', ctx, index, withKreisfreiNeighbor)
    const filtered = filterFeaturesForSimpleView(features, 'neighbors_other', ctx, index, allowed)
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/G',
      'relation/G2',
      'relation/KF',
    ])
  })

  test('gemeinde focus adds nachbargemeinden when beyond landkreis gemeinden', () => {
    const ctx = resolveFocusContext('relation/G', index)!
    const crossLkNeighbors = neighborIndexFromPrecomputed({
      version: 1,
      landkreis: { 'relation/LK': ['relation/LK2'], 'relation/LK2': ['relation/LK'] },
      landkreisStadtstaat: {},
      gemeinde: { 'relation/G': ['relation/G3'] },
    })
    expect(
      listSimplePresetsForFocus(ctx, index, { features, neighbors: crossLkNeighbors }),
    ).toContain('gm_neighbors')
  })

  test('default preset for bundesland is landkreise im bundesland', () => {
    const ctx = resolveFocusContext('relation/BY', index)!
    expect(defaultSimplePresetForFocus(ctx, index)).toBe('bl_landkreis_kreisfrei')
  })

  test('default preset for gemeinde is gemeinden im landkreis', () => {
    const ctx = resolveFocusContext('relation/G', index)!
    expect(defaultSimplePresetForFocus(ctx, index)).toBe('lk_gemeinden')
  })

  test('contextual preset labels', () => {
    const lkCtx = resolveFocusContext('relation/LK', index)!
    expect(simplePresetLabel('de_bundeslaender', lkCtx, index)).toBe('Bundesländer in Deutschland')
    expect(simplePresetLabel('de_landkreis_kreisfrei', lkCtx, index)).toBe(
      'Landkreise in Deutschland',
    )
    expect(simplePresetLabel('bl_regierungsbezirke', lkCtx, index)).toBe(
      'Regierungsbezirke in Bayern',
    )
    expect(simplePresetLabel('bl_landkreis_kreisfrei', lkCtx, index)).toBe('Landkreise in Bayern')
    expect(simplePresetLabel('bl_gemeinden_kreisfrei', lkCtx, index)).toBe('Gemeinden in Bayern')
    expect(simplePresetLabel('lk_gemeinden', lkCtx, index)).toBe('Gemeinden in München')
    expect(simplePresetLabel('lk_neighbors_landkreise', lkCtx, index)).toBe(
      'Nachbarlandkreise von München',
    )

    const gmCtx = resolveFocusContext('relation/G', index)!
    expect(simplePresetLabel('gm_neighbors', gmCtx, index)).toBe('Nachbargemeinden von Garching')
    expect(simplePresetLabel('lk_neighbors_other', gmCtx, index)).toBe('Nachbarn von München')
  })

  test('lk gemeinden scope filters level 8 in landkreis', () => {
    const ctx = resolveFocusContext('relation/LK', index)!
    const scope = simplePresetToViewScope('lk_gemeinden', ctx)!
    const filtered = filterFeaturesForSimpleView(features, 'lk_gemeinden', ctx, index, null)
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual(['relation/G', 'relation/G2'])
    expect(scope.darstellung).toBe('gemeinden')
  })

  test('gemeinde units include kreisfreie in landkreis set', () => {
    expect(gemeindeUnitIdsInLandkreise(['relation/LK', 'relation/KF'], index).sort()).toEqual([
      'relation/G',
      'relation/G2',
      'relation/KF',
    ])
  })

  test('bl gemeinden kreisfrei includes gemeinden and kreisfreie in bundesland', () => {
    const ctx = resolveFocusContext('relation/BY', index)!
    const scope = simplePresetToViewScope('bl_gemeinden_kreisfrei', ctx)!
    expect(scope).toEqual({
      gebiet: 'relation/BY',
      untergebiet: '',
      darstellung: 'gemeinden_kreisfrei',
    })
    const filtered = filterFeaturesForSimpleView(
      features,
      'bl_gemeinden_kreisfrei',
      ctx,
      index,
      null,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/G',
      'relation/G2',
      'relation/G3',
      'relation/KF',
    ])
  })

  test('lk_neighbors without neighbor index uses landkreis id not gemeinde focus', () => {
    const ctx = resolveFocusContext('relation/G', index)!
    const allowed = computeSimpleAllowedIds('lk_neighbors_landkreise', ctx, index, null)
    expect(allowed?.has('relation/LK')).toBe(true)
    expect(allowed?.has('relation/G')).toBe(false)
    const filtered = filterFeaturesForSimpleView(
      features,
      'lk_neighbors_landkreise',
      ctx,
      index,
      allowed,
    )
    expect(filtered.map((f) => f.properties?.id)).toEqual(['relation/LK'])
  })

  test('neighbor landkreis preset shows regular landkreise only', () => {
    const ctx = resolveFocusContext('relation/LK', index)!
    const allowed = computeSimpleAllowedIds('lk_neighbors_landkreise', ctx, index, neighbors)
    const filtered = filterFeaturesForSimpleView(
      features,
      'lk_neighbors_landkreise',
      ctx,
      index,
      allowed,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual(['relation/LK', 'relation/LK2'])
  })

  test('nachbarn preset includes regular landkreise and kreisfreie staedte', () => {
    const ctx = resolveFocusContext('relation/LK', index)!
    const withKf = neighborIndexFromPrecomputed({
      version: 1,
      landkreis: {
        'relation/LK': ['relation/LK2', 'relation/KF'],
        'relation/LK2': ['relation/LK'],
      },
      landkreisStadtstaat: {},
      gemeinde: {},
    })
    expect(listSimplePresetsForFocus(ctx, index, { features, neighbors: withKf })).toContain(
      'neighbors_other',
    )
    const allowed = computeSimpleAllowedIds('neighbors_other', ctx, index, withKf)
    const filtered = filterFeaturesForSimpleView(features, 'neighbors_other', ctx, index, allowed)
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/KF',
      'relation/LK',
      'relation/LK2',
    ])
  })

  test('kreisfreie landkreis focus has no nachbarlandkreise preset', () => {
    const ctx = resolveFocusContext('relation/KF', index)!
    expect(listSimplePresetsForFocus(ctx, index, { features, neighbors })).not.toContain(
      'lk_neighbors_landkreise',
    )
  })

  test('omits neighbor preset when content matches gemeinden im landkreis', () => {
    const ctx = resolveFocusContext('relation/LK', index)!
    const onlyOwnGemeinden = neighborIndexFromPrecomputed({
      version: 1,
      landkreis: { 'relation/LK': [] },
      landkreisStadtstaat: {},
      gemeinde: {},
    })
    expect(
      listSimplePresetsForFocus(ctx, index, { features, neighbors: onlyOwnGemeinden }),
    ).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
      'lk_gemeinden',
      'lk_neighbors_landkreise',
      'lk_neighbors_gemeinden',
    ])
  })
})
