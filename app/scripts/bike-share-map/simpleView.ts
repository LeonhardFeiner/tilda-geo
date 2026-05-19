import {
  DEUTSCHLAND_GEBIET,
  filterFeaturesForView,
  isStadtstaatFeature,
  listRegierungsbezirkeInGebiet,
  type DisplayPresetId,
  type GebietValue,
  type RegionIndex,
  type StatsFeature,
  type UntergebietValue,
  type ViewScope,
} from './regionNavigation'

export type SimpleViewPresetId =
  | 'de_bundeslaender'
  | 'de_landkreis_kreisfrei'
  | 'bl_regierungsbezirke'
  | 'bl_landkreis_kreisfrei'
  | 'bl_gemeinden_kreisfrei'
  | 'lk_gemeinden'
  | 'lk_neighbors_landkreise'
  | 'lk_neighbors_gemeinden'
  | 'gm_neighbors'

export type FocusKind = 'deutschland' | 'bundesland' | 'landkreis' | 'gemeinde'

export type FocusContext = {
  focusId: string
  focusName: string
  kind: FocusKind
  gebiet: GebietValue
  untergebiet: UntergebietValue
  bundeslandId: string
  landkreisId: string | null
  gemeindeId: string | null
}

export const SIMPLE_VIEW_PRESET_IDS = [
  'de_bundeslaender',
  'de_landkreis_kreisfrei',
  'bl_regierungsbezirke',
  'bl_landkreis_kreisfrei',
  'bl_gemeinden_kreisfrei',
  'lk_gemeinden',
  'lk_neighbors_landkreise',
  'lk_neighbors_gemeinden',
  'gm_neighbors',
] as const satisfies readonly SimpleViewPresetId[]

function regionDisplayName(id: string, index: RegionIndex) {
  const f = index.byId.get(id)
  return f ? String(f.properties?.name ?? id) : id
}

function bundeslandDisplayName(ctx: FocusContext, index: RegionIndex) {
  if (!ctx.bundeslandId) return 'Bundesland'
  return regionDisplayName(ctx.bundeslandId, index)
}

function landkreisDisplayName(ctx: FocusContext, index: RegionIndex) {
  const id = ctx.landkreisId ?? (ctx.kind === 'landkreis' ? ctx.focusId : null)
  if (!id) return 'Landkreis'
  return regionDisplayName(id, index)
}

function regionLevel(f: StatsFeature) {
  return String(f.properties?.level ?? '')
}

function regionId(f: StatsFeature) {
  return String(f.properties?.id ?? '')
}

function landkreisUntergebiet(id: string, index: RegionIndex): UntergebietValue {
  return index.kreisfreieIds.has(id) ? `kreisfrei:${id}` : `lk:${id}`
}

export function parseSimpleViewPreset(value: string | null | undefined) {
  if (!value) return null
  return SIMPLE_VIEW_PRESET_IDS.includes(value as SimpleViewPresetId)
    ? (value as SimpleViewPresetId)
    : null
}

export function resolveFocusContext(focusId: string | null | undefined, index: RegionIndex) {
  const normalized = focusId?.trim() || index.deutschlandId || DEUTSCHLAND_GEBIET
  if (normalized === DEUTSCHLAND_GEBIET || normalized === index.deutschlandId) {
    return {
      focusId: index.deutschlandId ?? DEUTSCHLAND_GEBIET,
      focusName: 'Deutschland',
      kind: 'deutschland',
      gebiet: DEUTSCHLAND_GEBIET,
      untergebiet: '',
      bundeslandId: '',
      landkreisId: null,
      gemeindeId: null,
    } satisfies FocusContext
  }

  const f = index.byId.get(normalized)
  if (!f) return null

  const id = regionId(f)
  const name = String(f.properties?.name ?? id)
  const level = regionLevel(f)

  if (level === '4') {
    return {
      focusId: id,
      focusName: name,
      kind: 'bundesland',
      gebiet: id,
      untergebiet: '',
      bundeslandId: id,
      landkreisId: null,
      gemeindeId: null,
    } satisfies FocusContext
  }

  if (level === '5') {
    const bl = String(f.properties?.bundesland_id ?? '')
    if (!bl) return null
    const blFeature = index.byId.get(bl)
    return {
      focusId: id,
      focusName: name,
      kind: 'bundesland',
      gebiet: bl,
      untergebiet: '',
      bundeslandId: bl,
      landkreisId: null,
      gemeindeId: null,
    } satisfies FocusContext
  }

  if (level === '6') {
    const bl = String(f.properties?.bundesland_id ?? gebietFromAncestors(id, index, '4') ?? '')
    if (!bl) return null
    return {
      focusId: id,
      focusName: name,
      kind: 'landkreis',
      gebiet: bl,
      untergebiet: landkreisUntergebiet(id, index),
      bundeslandId: bl,
      landkreisId: id,
      gemeindeId: null,
    } satisfies FocusContext
  }

  if (level === '8') {
    const lk = String(f.properties?.landkreis_id ?? '')
    const bl = String(f.properties?.bundesland_id ?? '')
    if (!lk || !bl) return null
    return {
      focusId: id,
      focusName: name,
      kind: 'gemeinde',
      gebiet: bl,
      untergebiet: landkreisUntergebiet(lk, index),
      bundeslandId: bl,
      landkreisId: lk,
      gemeindeId: id,
    } satisfies FocusContext
  }

  return null
}

function gebietFromAncestors(id: string, index: RegionIndex, level: string) {
  let current: string | undefined = id
  while (current) {
    const f = index.byId.get(current)
    if (!f) break
    if (regionLevel(f) === level) return current
    current = index.parentById.get(current)
  }
  return null
}

function deutschlandSimplePresets() {
  return ['de_bundeslaender', 'de_landkreis_kreisfrei'] satisfies SimpleViewPresetId[]
}

function bundeslandSimplePresets(ctx: FocusContext, index: RegionIndex) {
  const out: SimpleViewPresetId[] = []
  if (listRegierungsbezirkeInGebiet(ctx.gebiet, index).length > 0) {
    out.push('bl_regierungsbezirke')
  }
  out.push('bl_landkreis_kreisfrei')
  out.push('bl_gemeinden_kreisfrei')
  return out
}

function landkreisSimplePresets() {
  return ['lk_gemeinden', 'lk_neighbors_landkreise'] satisfies SimpleViewPresetId[]
}

function gemeindeSimplePresets() {
  return ['gm_neighbors'] satisfies SimpleViewPresetId[]
}

export function listSimplePresetsForFocus(ctx: FocusContext, index: RegionIndex) {
  const out: SimpleViewPresetId[] = []
  const add = (ids: SimpleViewPresetId[]) => {
    for (const id of ids) {
      if (!out.includes(id)) out.push(id)
    }
  }
  add(deutschlandSimplePresets())
  if (ctx.kind !== 'deutschland') {
    add(bundeslandSimplePresets(ctx, index))
  }
  if (ctx.landkreisId) {
    add(landkreisSimplePresets())
  }
  if (ctx.gemeindeId) {
    add(gemeindeSimplePresets())
  }
  return out
}

export function defaultSimplePresetForFocus(ctx: FocusContext, index: RegionIndex) {
  const allowed = listSimplePresetsForFocus(ctx, index)
  if (ctx.kind === 'deutschland') {
    return allowed.includes('de_landkreis_kreisfrei')
      ? 'de_landkreis_kreisfrei'
      : 'de_bundeslaender'
  }
  if (ctx.kind === 'bundesland') return 'bl_landkreis_kreisfrei'
  if (ctx.landkreisId) return 'lk_gemeinden'
  return allowed.at(-1) ?? 'de_landkreis_kreisfrei'
}

export function simplePresetLabel(id: SimpleViewPresetId, ctx: FocusContext, index: RegionIndex) {
  switch (id) {
    case 'de_bundeslaender':
      return 'Bundesländer in Deutschland'
    case 'de_landkreis_kreisfrei':
      return 'Landkreise in Deutschland'
    case 'bl_regierungsbezirke':
      return 'Regierungsbezirke in ' + bundeslandDisplayName(ctx, index)
    case 'bl_landkreis_kreisfrei':
      return 'Landkreise in ' + bundeslandDisplayName(ctx, index)
    case 'bl_gemeinden_kreisfrei':
      return 'Gemeinden in ' + bundeslandDisplayName(ctx, index)
    case 'lk_gemeinden':
      return 'Gemeinden in ' + landkreisDisplayName(ctx, index)
    case 'lk_neighbors_landkreise':
    case 'lk_neighbors_gemeinden':
      return 'Nachbarn von ' + landkreisDisplayName(ctx, index)
    case 'gm_neighbors':
      return 'Nachbarn von ' + ctx.focusName
    default:
      return id
  }
}

export function presetUsesNeighborFilter(preset: SimpleViewPresetId) {
  return (
    preset === 'lk_neighbors_landkreise' ||
    preset === 'lk_neighbors_gemeinden' ||
    preset === 'gm_neighbors'
  )
}

export function simplePresetDarstellung(preset: SimpleViewPresetId): DisplayPresetId {
  switch (preset) {
    case 'de_bundeslaender':
      return 'bundeslaender'
    case 'de_landkreis_kreisfrei':
    case 'bl_landkreis_kreisfrei':
    case 'lk_neighbors_landkreise':
    case 'lk_neighbors_gemeinden':
      return 'landkreis_kreisfrei'
    case 'bl_regierungsbezirke':
      return 'regierungsbezirke'
    case 'bl_gemeinden_kreisfrei':
      return 'gemeinden_kreisfrei'
    case 'lk_gemeinden':
    case 'gm_neighbors':
      return 'gemeinden'
    default:
      return 'gemeinden'
  }
}

export function simplePresetToViewScope(
  preset: SimpleViewPresetId,
  ctx: FocusContext,
): ViewScope | null {
  if (presetUsesNeighborFilter(preset)) return null
  const darstellung = simplePresetDarstellung(preset)
  if (preset.startsWith('de_')) {
    return { gebiet: DEUTSCHLAND_GEBIET, untergebiet: '', darstellung }
  }
  if (preset.startsWith('bl_')) {
    return { gebiet: ctx.gebiet, untergebiet: '', darstellung }
  }
  if (preset === 'lk_gemeinden') {
    return { gebiet: ctx.gebiet, untergebiet: ctx.untergebiet, darstellung }
  }
  return null
}

export function landkreisIdsInBundesland(bundeslandId: string, index: RegionIndex) {
  const ids: string[] = []
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    if (String(f.properties?.bundesland_id ?? '') !== bundeslandId) continue
    ids.push(regionId(f))
  }
  return ids
}

export function gemeindeUnitIdsInLandkreise(landkreisIds: Iterable<string>, index: RegionIndex) {
  const lkSet = new Set(landkreisIds)
  const ids: string[] = []
  for (const f of index.byId.values()) {
    const id = regionId(f)
    const level = regionLevel(f)
    if (level === '8') {
      const lk = String(f.properties?.landkreis_id ?? '')
      if (lkSet.has(lk)) ids.push(id)
      continue
    }
    if (level === '6' && index.kreisfreieIds.has(id) && lkSet.has(id)) {
      ids.push(id)
    }
  }
  return ids
}

export function gemeindenIdsInLandkreise(landkreisIds: Iterable<string>, index: RegionIndex) {
  return gemeindeUnitIdsInLandkreise(landkreisIds, index)
}

export function gemeindenIdsInLandkreis(landkreisId: string, index: RegionIndex) {
  return gemeindeUnitIdsInLandkreise([landkreisId], index)
}

export function stadtstaatCandidateIds(index: RegionIndex) {
  return index.stadtstaaten.map((s) => s.id)
}

export function neighborCandidateIds(
  preset: SimpleViewPresetId,
  ctx: FocusContext,
  index: RegionIndex,
) {
  if (preset === 'lk_neighbors_landkreise' || preset === 'lk_neighbors_gemeinden') {
    if (!ctx.landkreisId) return []
    return landkreisIdsInBundesland(ctx.bundeslandId, index)
  }
  return []
}

function matchesLandkreisNeighborFeature(
  f: StatsFeature,
  allowedIds: Set<string>,
  index: RegionIndex,
) {
  const id = regionId(f)
  if (!id || !allowedIds.has(id)) return false
  const level = regionLevel(f)
  if (level === '6') return true
  if (isStadtstaatFeature(f)) return true
  return false
}

function matchesGemeindeUnitFeature(f: StatsFeature, allowedIds: Set<string>, index: RegionIndex) {
  const id = regionId(f)
  if (!id || !allowedIds.has(id)) return false
  const level = regionLevel(f)
  if (level === '8') return true
  if (level === '6' && index.kreisfreieIds.has(id)) return true
  if (isStadtstaatFeature(f)) return true
  return false
}

export function filterFeaturesForSimpleView(
  features: StatsFeature[],
  preset: SimpleViewPresetId,
  ctx: FocusContext,
  index: RegionIndex,
  allowedIds: Set<string> | null,
) {
  const darstellung = simplePresetDarstellung(preset)
  const scope = simplePresetToViewScope(preset, ctx)
  if (scope) {
    return filterFeaturesForView(features, scope, index)
  }
  if (!allowedIds?.size) return []

  return features.filter((f) => {
    const id = regionId(f)
    if (!id || !allowedIds.has(id)) return false
    if (preset === 'lk_neighbors_landkreise' || preset === 'lk_neighbors_gemeinden') {
      return matchesLandkreisNeighborFeature(f, allowedIds, index)
    }
    if (preset === 'gm_neighbors') {
      return matchesGemeindeUnitFeature(f, allowedIds, index)
    }
    return matchesDarstellungLevel(f, darstellung, index, ctx)
  })
}

function matchesDarstellungLevel(
  f: StatsFeature,
  darstellung: DisplayPresetId,
  index: RegionIndex,
  ctx: FocusContext,
) {
  const scope = {
    gebiet: ctx.gebiet,
    untergebiet: ctx.untergebiet,
    darstellung,
  } satisfies ViewScope
  return filterFeaturesForView([f], scope, index).length > 0
}

export function expertViewScopeFromFocus(focusId: string, index: RegionIndex) {
  const ctx = resolveFocusContext(focusId, index)
  if (!ctx) return null
  const preset = defaultSimplePresetForFocus(ctx, index)
  const scope = simplePresetToViewScope(preset, ctx)
  if (scope) return scope
  if (ctx.kind === 'landkreis' && ctx.landkreisId) {
    return {
      gebiet: ctx.gebiet,
      untergebiet: ctx.untergebiet,
      darstellung: 'gemeinden',
    } satisfies ViewScope
  }
  if (ctx.kind === 'gemeinde') {
    return {
      gebiet: ctx.gebiet,
      untergebiet: ctx.untergebiet,
      darstellung: 'gemeinden',
    } satisfies ViewScope
  }
  return null
}
