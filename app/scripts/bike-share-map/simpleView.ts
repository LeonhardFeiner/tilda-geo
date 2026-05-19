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
import {
  computeSimpleAllowedIds as computeNeighborAllowedIds,
  type NeighborIndex,
} from './regionNeighbors'

export {
  buildNeighborIndex,
  decodeNeighborsPack,
  neighborIndexFromPrecomputed,
  parsePrecomputedNeighborsJson,
  parsePrecomputedNeighborsJsonText,
  precomputedNeighborsFileFromJson,
  type NeighborIndex,
} from './regionNeighbors'

export type SimpleViewPresetId =
  | 'de_bundeslaender'
  | 'de_landkreis_kreisfrei'
  | 'bl_regierungsbezirke'
  | 'bl_landkreis_kreisfrei'
  | 'bl_gemeinden_kreisfrei'
  | 'lk_gemeinden'
  | 'neighbors_other'
  | 'gm_neighbors'
  | 'lk_neighbors_other'
  | 'lk_neighbors_landkreise'
  | 'lk_neighbors_gemeinden'

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

/** Dropdown order for simple view (broad → narrow, then neighbor variants). */
export const SIMPLE_VIEW_PRESET_IDS = [
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
] as const satisfies readonly SimpleViewPresetId[]

const HIERARCHY_SIMPLE_PRESETS = new Set<SimpleViewPresetId>([
  'de_bundeslaender',
  'de_landkreis_kreisfrei',
  'bl_regierungsbezirke',
  'bl_landkreis_kreisfrei',
  'bl_gemeinden_kreisfrei',
  'lk_gemeinden',
])

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
    const _blFeature = index.byId.get(bl)
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

function isRegularLandkreis(id: string, index: RegionIndex) {
  const f = index.byId.get(id)
  return !!f && regionLevel(f) === '6' && !index.kreisfreieIds.has(id)
}

function filterRegularLandkreisNeighborIds(allowed: Set<string>, index: RegionIndex) {
  const out = new Set<string>()
  for (const id of allowed) {
    if (isRegularLandkreis(id, index)) out.add(id)
  }
  return out
}

function filterGemeindeNeighborIds(allowed: Set<string>, index: RegionIndex) {
  const out = new Set<string>()
  for (const id of allowed) {
    const f = index.byId.get(id)
    if (f && regionLevel(f) === '8') out.add(id)
  }
  return out
}

function gemeindenLevel8InLandkreise(landkreisIds: Iterable<string>, index: RegionIndex) {
  return gemeindeUnitIdsInLandkreise(landkreisIds, index).filter((id) => {
    const f = index.byId.get(id)
    return !!f && regionLevel(f) === '8'
  })
}

function landkreisUnitsInAllowedIds(allowed: Set<string>, index: RegionIndex) {
  const out = new Set<string>()
  for (const id of allowed) {
    const f = index.byId.get(id)
    if (!f) continue
    if (isStadtstaatFeature(f) || regionLevel(f) === '6') out.add(id)
  }
  return out
}

function hasNeighborBeyondFocus(allowed: Set<string>, focusId: string) {
  return [...allowed].some((id) => id !== focusId)
}

function isNonGemeindeNeighborUnit(id: string, index: RegionIndex) {
  const f = index.byId.get(id)
  if (!f) return false
  if (isStadtstaatFeature(f)) return true
  const level = regionLevel(f)
  if (level === '6') return true
  return level !== '8'
}

function featureIdsForSimplePreset(
  preset: SimpleViewPresetId,
  ctx: FocusContext,
  index: RegionIndex,
  features: StatsFeature[],
  neighbors: NeighborIndex | null,
) {
  const scope = simplePresetToViewScope(preset, ctx)
  if (scope) {
    return new Set(
      filterFeaturesForView(features, scope, index)
        .map(regionId)
        .filter((id) => id.length > 0),
    )
  }
  const allowed = computeSimpleAllowedIds(preset, ctx, index, neighbors)
  return new Set(
    filterFeaturesForSimpleView(features, preset, ctx, index, allowed)
      .map(regionId)
      .filter((id) => id.length > 0),
  )
}

function presetContentSetsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

const SAME_TYPE_NEIGHBOR_PRESETS = new Set<SimpleViewPresetId>([
  'lk_neighbors_landkreise',
  'lk_neighbors_gemeinden',
  'gm_neighbors',
])

function dedupePresetsByDistinctContent(
  presets: SimpleViewPresetId[],
  ctx: FocusContext,
  index: RegionIndex,
  features: StatsFeature[],
  neighbors: NeighborIndex | null,
) {
  const out: SimpleViewPresetId[] = []
  const neighborSeen: Set<string>[] = []
  for (const preset of presets) {
    if (HIERARCHY_SIMPLE_PRESETS.has(preset)) {
      out.push(preset)
      continue
    }
    const ids = featureIdsForSimplePreset(preset, ctx, index, features, neighbors)
    if (SAME_TYPE_NEIGHBOR_PRESETS.has(preset)) {
      out.push(preset)
      neighborSeen.push(ids)
      continue
    }
    if (preset === 'neighbors_other' || preset === 'lk_neighbors_other') {
      if (neighborSeen.some((prev) => presetContentSetsEqual(prev, ids))) continue
      out.push(preset)
      neighborSeen.push(ids)
      continue
    }
    out.push(preset)
  }
  return out
}

function shouldOfferGemeindeAllNeighborsPreset(
  ctx: FocusContext,
  index: RegionIndex,
  neighbors: NeighborIndex | null,
) {
  if (!neighbors) return false
  if (ctx.kind !== 'gemeinde' || !ctx.gemeindeId || !ctx.landkreisId) return false
  if (!isRegularLandkreis(ctx.landkreisId, index)) return false
  const all = computeSimpleAllowedIds('neighbors_other', ctx, index, neighbors)
  if (!all || !hasNeighborBeyondFocus(all, ctx.gemeindeId)) return false
  return [...all].some((id) => id !== ctx.gemeindeId && isNonGemeindeNeighborUnit(id, index))
}

function shouldOfferLandkreisAllNeighborsPreset(
  ctx: FocusContext,
  index: RegionIndex,
  neighbors: NeighborIndex | null,
  preset: 'neighbors_other' | 'lk_neighbors_other',
) {
  if (!neighbors) return false
  const landkreisId =
    preset === 'lk_neighbors_other' && ctx.kind === 'gemeinde'
      ? ctx.landkreisId
      : ctx.kind === 'landkreis'
        ? ctx.landkreisId
        : null
  if (!landkreisId || !isRegularLandkreis(landkreisId, index)) return false
  const all = computeSimpleAllowedIds(preset, ctx, index, neighbors)
  if (!all || !hasNeighborBeyondFocus(all, landkreisId)) return false
  const sameType = computeSimpleAllowedIds('lk_neighbors_landkreise', ctx, index, neighbors)
  if (sameType && presetContentSetsEqual(all, sameType)) return false
  return true
}

function isSimplePresetApplicable(
  preset: SimpleViewPresetId,
  ctx: FocusContext,
  index: RegionIndex,
  neighbors: NeighborIndex | null,
) {
  switch (preset) {
    case 'de_bundeslaender':
    case 'de_landkreis_kreisfrei':
      return true
    case 'bl_regierungsbezirke':
      return (
        ctx.kind !== 'deutschland' && listRegierungsbezirkeInGebiet(ctx.gebiet, index).length > 0
      )
    case 'bl_landkreis_kreisfrei':
    case 'bl_gemeinden_kreisfrei':
      return ctx.kind !== 'deutschland'
    case 'lk_gemeinden':
      return !!ctx.landkreisId && isRegularLandkreis(ctx.landkreisId, index)
    case 'neighbors_other':
      if (ctx.kind === 'gemeinde') {
        return shouldOfferGemeindeAllNeighborsPreset(ctx, index, neighbors)
      }
      if (ctx.kind === 'landkreis') {
        return shouldOfferLandkreisAllNeighborsPreset(ctx, index, neighbors, 'neighbors_other')
      }
      return false
    case 'gm_neighbors':
      return !!ctx.gemeindeId
    case 'lk_neighbors_other':
      return (
        ctx.kind === 'gemeinde' &&
        shouldOfferLandkreisAllNeighborsPreset(ctx, index, neighbors, 'lk_neighbors_other')
      )
    case 'lk_neighbors_landkreise':
    case 'lk_neighbors_gemeinden':
      return (
        !!ctx.landkreisId &&
        isRegularLandkreis(ctx.landkreisId, index) &&
        (ctx.kind === 'landkreis' || ctx.kind === 'gemeinde')
      )
    default:
      return false
  }
}

export function listSimplePresetsForFocus(
  ctx: FocusContext,
  index: RegionIndex,
  options?: { features?: StatsFeature[]; neighbors?: NeighborIndex | null },
) {
  const features = options?.features ?? [...index.byId.values()]
  const neighbors = options?.neighbors ?? null
  const candidates = SIMPLE_VIEW_PRESET_IDS.filter((preset) =>
    isSimplePresetApplicable(preset, ctx, index, neighbors),
  )
  return dedupePresetsByDistinctContent(candidates, ctx, index, features, neighbors)
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
      return `Regierungsbezirke in ${bundeslandDisplayName(ctx, index)}`
    case 'bl_landkreis_kreisfrei':
      return `Landkreise in ${bundeslandDisplayName(ctx, index)}`
    case 'bl_gemeinden_kreisfrei':
      return `Gemeinden in ${bundeslandDisplayName(ctx, index)}`
    case 'lk_gemeinden':
      return `Gemeinden in ${landkreisDisplayName(ctx, index)}`
    case 'neighbors_other':
      return `Nachbarn von ${ctx.focusName}`
    case 'gm_neighbors':
      return `Nachbargemeinden von ${ctx.focusName}`
    case 'lk_neighbors_other':
      return `Nachbarn von ${landkreisDisplayName(ctx, index)}`
    case 'lk_neighbors_landkreise':
      return `Nachbarlandkreise von ${landkreisDisplayName(ctx, index)}`
    case 'lk_neighbors_gemeinden':
      return `Nachbargemeinden von ${landkreisDisplayName(ctx, index)}`
    default:
      return id
  }
}

export type NeighborFilterPreset = Extract<
  SimpleViewPresetId,
  | 'lk_neighbors_landkreise'
  | 'lk_neighbors_gemeinden'
  | 'lk_neighbors_other'
  | 'neighbors_other'
  | 'gm_neighbors'
>

export function presetUsesNeighborFilter(
  preset: SimpleViewPresetId,
): preset is NeighborFilterPreset {
  return (
    preset === 'lk_neighbors_landkreise' ||
    preset === 'lk_neighbors_gemeinden' ||
    preset === 'lk_neighbors_other' ||
    preset === 'neighbors_other' ||
    preset === 'gm_neighbors'
  )
}

export function simplePresetDarstellung(
  preset: SimpleViewPresetId,
  ctx?: FocusContext | null,
): DisplayPresetId {
  switch (preset) {
    case 'de_bundeslaender':
      return 'bundeslaender'
    case 'de_landkreis_kreisfrei':
    case 'bl_landkreis_kreisfrei':
    case 'lk_neighbors_landkreise':
    case 'lk_neighbors_other':
      return 'landkreis_kreisfrei'
    case 'neighbors_other':
      return ctx?.kind === 'gemeinde' ? 'gemeinden_kreisfrei' : 'landkreis_kreisfrei'
    case 'lk_neighbors_gemeinden':
      return 'gemeinden'
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
  if (
    preset === 'lk_neighbors_landkreise' ||
    preset === 'lk_neighbors_gemeinden' ||
    preset === 'lk_neighbors_other' ||
    preset === 'neighbors_other'
  ) {
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
  return isRegularLandkreis(id, index)
}

function matchesGemeindeNeighborFeature(f: StatsFeature, allowedIds: Set<string>) {
  const id = regionId(f)
  if (!id || !allowedIds.has(id)) return false
  return regionLevel(f) === '8'
}

function matchesAllNeighborsFeature(
  f: StatsFeature,
  allowedIds: Set<string>,
  index: RegionIndex,
  ctx: FocusContext,
) {
  const id = regionId(f)
  if (!id || !allowedIds.has(id)) return false
  if (ctx.kind === 'gemeinde') return matchesGemeindeUnitFeature(f, allowedIds, index)
  return isStadtstaatFeature(f) || regionLevel(f) === '6'
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

function neighborAllowedIdsWithoutIndex(
  preset: NeighborFilterPreset,
  ctx: FocusContext,
  index: RegionIndex,
) {
  if (
    (preset === 'lk_neighbors_landkreise' ||
      preset === 'lk_neighbors_gemeinden' ||
      preset === 'lk_neighbors_other' ||
      (preset === 'neighbors_other' && ctx.kind === 'landkreis')) &&
    ctx.landkreisId
  ) {
    if (preset === 'lk_neighbors_gemeinden') {
      return new Set(gemeindenLevel8InLandkreise([ctx.landkreisId], index))
    }
    return new Set([ctx.landkreisId])
  }
  if (
    (preset === 'gm_neighbors' || (preset === 'neighbors_other' && ctx.kind === 'gemeinde')) &&
    ctx.gemeindeId
  ) {
    return new Set([ctx.gemeindeId])
  }
  return new Set([ctx.focusId])
}

export function computeSimpleAllowedIds(
  preset: SimpleViewPresetId,
  ctx: FocusContext,
  index: RegionIndex,
  neighbors: NeighborIndex | null,
) {
  if (!presetUsesNeighborFilter(preset)) return null
  if (!neighbors) return neighborAllowedIdsWithoutIndex(preset, ctx, index)
  const allowed = computeNeighborAllowedIds(preset, ctx, index, neighbors)
  if (preset === 'lk_neighbors_landkreise' && ctx.landkreisId) {
    return filterRegularLandkreisNeighborIds(allowed, index)
  }
  if (preset === 'lk_neighbors_gemeinden' && ctx.landkreisId) {
    const lkIds = filterRegularLandkreisNeighborIds(allowed, index)
    return new Set(gemeindenLevel8InLandkreise(lkIds, index))
  }
  if (
    (preset === 'neighbors_other' && ctx.kind === 'landkreis') ||
    preset === 'lk_neighbors_other'
  ) {
    if (!ctx.landkreisId) return allowed
    return landkreisUnitsInAllowedIds(allowed, index)
  }
  if (preset === 'gm_neighbors') {
    return filterGemeindeNeighborIds(allowed, index)
  }
  return allowed
}

export function filterFeaturesForSimpleView(
  features: StatsFeature[],
  preset: SimpleViewPresetId,
  ctx: FocusContext,
  index: RegionIndex,
  allowedIds: Set<string> | null,
) {
  const scope = simplePresetToViewScope(preset, ctx)
  if (scope) {
    return filterFeaturesForView(features, scope, index)
  }
  if (!allowedIds?.size) return []

  return features.filter((f) => {
    const id = regionId(f)
    if (!id || !allowedIds.has(id)) return false
    if (preset === 'lk_neighbors_landkreise') {
      return matchesLandkreisNeighborFeature(f, allowedIds, index)
    }
    if (preset === 'lk_neighbors_gemeinden') {
      return matchesGemeindeNeighborFeature(f, allowedIds)
    }
    if (preset === 'neighbors_other') {
      return matchesAllNeighborsFeature(f, allowedIds, index, ctx)
    }
    if (preset === 'lk_neighbors_other') {
      const id = regionId(f)
      if (!id || !allowedIds.has(id)) return false
      return isStadtstaatFeature(f) || regionLevel(f) === '6'
    }
    if (preset === 'gm_neighbors') {
      return matchesGemeindeNeighborFeature(f, allowedIds)
    }
    return false
  })
}

function _matchesDarstellungLevel(
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
