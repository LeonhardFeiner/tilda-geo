import { describe, expect, test } from 'vitest'
import {
  buildRegionIndex,
  comparePresetUnitLevelHierarchy,
  DEUTSCHLAND_GEBIET,
  filterFeaturesForView,
  isPresetAllowedForScope,
  isStandaloneGemeinde,
  listAllBundeslaender,
  listDarstellungPresetsForScope,
  parseDarstellungParam,
  presetCoverageForScope,
  presetIncludesStadtstaatenUnits,
  presetLabelForScope,
  presetUnitLevels,
  scopeLevelFor,
  STADTSTAAT_IDS,
} from './regionNavigation'
import { DISPLAY_PRESETS } from './regionNavigation'
import type { StatsFeature } from './regionNavigation'

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
    properties: { id: 'relation/62422', name: 'Berlin', level: '4' },
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
      id: 'relation/VG',
      name: 'VG München-Nord',
      level: '7',
      parent_id: 'relation/LK',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/G',
      name: 'Garching',
      level: '8',
      parent_id: 'relation/VG',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/G2',
      name: 'Einzelhausen',
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
      id: 'relation/KF',
      name: 'Ingolstadt',
      level: '6',
      parent_id: 'relation/BY',
      bundesland_id: 'relation/BY',
    },
    geometry: { type: 'Polygon', coordinates: [] },
  },
] satisfies StatsFeature[]

describe('regionNavigation', () => {
  const index = buildRegionIndex(features)

  test('detects kreisfreie without gemeinden', () => {
    expect(index.kreisfreieIds.has('relation/KF')).toBe(true)
    expect(index.kreisfreieIds.has('relation/LK')).toBe(false)
  })

  test('stadtstaat ids', () => {
    expect(STADTSTAAT_IDS.has('relation/62422')).toBe(true)
  })

  test('filters landkreise under bayern', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: 'relation/BY',
        untergebiet: '',
        darstellung: 'landkreise',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id)).toEqual(['relation/LK'])
  })

  test('does not offer bundeslaender under landkreis scope', () => {
    expect(
      isPresetAllowedForScope(
        'bundeslaender',
        scopeLevelFor('relation/BY', 'lk:relation/LK'),
        index,
        'relation/BY',
        'lk:relation/LK',
      ),
    ).toBe(false)
  })

  test('gemeinden under landkreis', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: 'relation/BY',
        untergebiet: 'lk:relation/LK',
        darstellung: 'gemeinden',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual(['relation/G', 'relation/G2'])
  })

  test('standalone gemeinde detection', () => {
    const garching = features.find((f) => f.properties?.id === 'relation/G')
    const einzelhausen = features.find((f) => f.properties?.id === 'relation/G2')
    expect(garching && isStandaloneGemeinde(garching, index)).toBe(false)
    expect(einzelhausen && isStandaloneGemeinde(einzelhausen, index)).toBe(true)
  })

  test('gemeindeverbaende includes VG and standalone gemeinden', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: 'relation/BY',
        untergebiet: 'lk:relation/LK',
        darstellung: 'gemeindeverbaende',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual(['relation/G2', 'relation/VG'])
  })

  test('deutschland bundeslaender', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: DEUTSCHLAND_GEBIET,
        untergebiet: '',
        darstellung: 'bundeslaender',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual(['relation/62422', 'relation/BY'])
  })

  test('bundeslaender list includes stadtstaaten', () => {
    expect(
      listAllBundeslaender(index)
        .map((b) => b.id)
        .sort(),
    ).toEqual(['relation/62422', 'relation/BY'])
  })

  test('stadtstaaten only in mixed presets at deutschland scope', () => {
    expect(presetIncludesStadtstaatenUnits('landkreis_kreisfrei')).toBe(true)
    expect(presetIncludesStadtstaatenUnits('gemeinden_kreisfrei')).toBe(true)
    expect(presetIncludesStadtstaatenUnits('regierungsbezirke')).toBe(false)
    expect(isPresetAllowedForScope('landkreis_kreisfrei', 2, index, DEUTSCHLAND_GEBIET, '')).toBe(
      true,
    )
    expect(isPresetAllowedForScope('landkreis_kreisfrei', 4, index, 'relation/BY', '')).toBe(true)
  })

  test('landkreis_kreisfrei at deutschland includes stadtstaaten', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: DEUTSCHLAND_GEBIET,
        untergebiet: '',
        darstellung: 'landkreis_kreisfrei',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/62422',
      'relation/KF',
      'relation/LK',
    ])
  })

  test('gemeindeverbaende_kreisfrei at deutschland includes stadtstaaten', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: DEUTSCHLAND_GEBIET,
        untergebiet: '',
        darstellung: 'gemeindeverbaende_kreisfrei',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/62422',
      'relation/G2',
      'relation/KF',
      'relation/VG',
    ])
  })

  test('gemeinden_kreisfrei at deutschland includes gemeinden, kreisfrei and stadtstaaten', () => {
    const filtered = filterFeaturesForView(
      features,
      {
        gebiet: DEUTSCHLAND_GEBIET,
        untergebiet: '',
        darstellung: 'gemeinden_kreisfrei',
      },
      index,
    )
    expect(filtered.map((f) => f.properties?.id).sort()).toEqual([
      'relation/62422',
      'relation/G',
      'relation/G2',
      'relation/KF',
    ])
  })

  test('preset labels mention stadtstaaten only for deutschland', () => {
    const landkreis = DISPLAY_PRESETS.find((p) => p.id === 'landkreis_kreisfrei')!
    expect(presetLabelForScope(landkreis, DEUTSCHLAND_GEBIET, '')).toContain('Stadtstaaten')
    expect(presetLabelForScope(landkreis, 'relation/BY', '')).not.toContain('Stadtstaaten')
    const gemeinden = DISPLAY_PRESETS.find((p) => p.id === 'gemeinden_kreisfrei')!
    expect(presetLabelForScope(gemeinden, DEUTSCHLAND_GEBIET, '')).toBe(
      'Gemeinden, kreisfreie Städte und Stadtstaaten',
    )
    expect(presetLabelForScope(gemeinden, 'relation/BY', '')).toBe(
      'Gemeinden und kreisfreie Städte',
    )
  })

  test('darstellung aliases from old urls', () => {
    expect(parseDarstellungParam('landkreise_und_stadtstaaten')).toBe('landkreis_kreisfrei')
    expect(parseDarstellungParam('gemeinden_und_stadtstaaten')).toBe('gemeinden_kreisfrei')
  })

  test('unit level hierarchy: coarser before finer mixed presets', () => {
    expect(
      comparePresetUnitLevelHierarchy(
        presetUnitLevels('landkreis_kreisfrei', DEUTSCHLAND_GEBIET, ''),
        presetUnitLevels('gemeindeverbaende_kreisfrei', DEUTSCHLAND_GEBIET, ''),
      ),
    ).toBeLessThan(0)
    expect(
      comparePresetUnitLevelHierarchy(
        presetUnitLevels('regierungsbezirke', 'relation/BY', ''),
        presetUnitLevels('gemeinden', 'relation/BY', ''),
      ),
    ).toBeLessThan(0)
  })

  test('darstellung order: full coverage first, then coarsest units', () => {
    const presets = listDarstellungPresetsForScope(
      { gebiet: 'relation/BY', untergebiet: '', darstellung: 'landkreis_kreisfrei' },
      index,
      features,
    )
    const ids = presets.map((p) => p.id)
    const scopeLevel = scopeLevelFor('relation/BY', '')

    const fullIds = ids.filter(
      (id) => presetCoverageForScope(id, scopeLevel, 'relation/BY', '', index) === 'full',
    )
    const partialIds = ids.filter(
      (id) => presetCoverageForScope(id, scopeLevel, 'relation/BY', '', index) === 'partial',
    )
    expect(fullIds.length).toBeGreaterThan(0)
    expect(partialIds.length).toBeGreaterThan(0)
    expect(ids.indexOf(fullIds[0]!)).toBeLessThan(ids.indexOf(partialIds[0]!))
    expect(fullIds.indexOf('regierungsbezirke')).toBeLessThan(fullIds.indexOf('gemeinden'))
    expect(ids).not.toContain('landkreise_und_stadtstaaten')
  })
})
