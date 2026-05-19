import { describe, expect, test } from 'vitest'
import { buildRegionIndex } from './regionNavigation'
import type { StatsFeature } from './regionNavigation'
import {
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
    expect(listSimplePresetsForFocus(ctx!, index)).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
    ])
  })

  test('lists landkreis presets with parent options', () => {
    const ctx = resolveFocusContext('relation/LK', index)
    expect(listSimplePresetsForFocus(ctx!, index)).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
      'lk_gemeinden',
      'lk_neighbors_landkreise',
    ])
    expect(defaultSimplePresetForFocus(ctx!, index)).toBe('lk_gemeinden')
  })

  test('gemeinde focus includes parent presets and neighbors', () => {
    const ctx = resolveFocusContext('relation/G', index)
    expect(listSimplePresetsForFocus(ctx!, index)).toEqual([
      'de_bundeslaender',
      'de_landkreis_kreisfrei',
      'bl_regierungsbezirke',
      'bl_landkreis_kreisfrei',
      'bl_gemeinden_kreisfrei',
      'lk_gemeinden',
      'lk_neighbors_landkreise',
      'gm_neighbors',
    ])
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
    expect(simplePresetLabel('lk_neighbors_landkreise', lkCtx, index)).toBe('Nachbarn von München')

    const gmCtx = resolveFocusContext('relation/G', index)!
    expect(simplePresetLabel('gm_neighbors', gmCtx, index)).toBe('Nachbarn von Garching')
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

  test('neighbor landkreis preset shows landkreise and kreisfreie', () => {
    const ctx = resolveFocusContext('relation/LK', index)!
    const allowed = new Set(['relation/LK', 'relation/LK2', 'relation/KF'])
    const filtered = filterFeaturesForSimpleView(
      features,
      'lk_neighbors_landkreise',
      ctx,
      index,
      allowed,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/KF',
      'relation/LK',
      'relation/LK2',
    ])
  })
})
