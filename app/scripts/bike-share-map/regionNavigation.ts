/** Admin navigation: Gebiet → Untergebiet → Darstellung (choropleth presets). */

export const DEUTSCHLAND_GEBIET = 'deutschland' as const

/** OSM relation ids for Stadtstaaten (admin_level 4). */
export const STADTSTAAT_IDS = new Set([
  'relation/62422', // Berlin
  'relation/62782', // Hamburg
  'relation/62772', // Bremen
])

export type GebietValue = typeof DEUTSCHLAND_GEBIET | string

export type UntergebietValue =
  | ''
  | `rb:${string}`
  | `lk:${string}`
  | `kreisfrei:${string}`
  | `stadt:${string}`

export type DisplayPresetId =
  | 'bundeslaender'
  | 'regierungsbezirke'
  | 'landkreise'
  | 'kreisfreie'
  | 'landkreis_kreisfrei'
  | 'gemeindeverbaende'
  | 'gemeindeverbaende_kreisfrei'
  | 'gemeinden'
  | 'gemeinden_kreisfrei'
  | 'stadtbezirke'
  | 'stadtteile'

export type DisplayPreset = {
  id: DisplayPresetId
  label: string
  /** Finest primary admin level in this preset (for scope filtering). */
  minLevel: number
  /** OSM admin level used to sort large → small within a coverage group. */
  sortLevel: number
}

export type DarstellungPresetGroup = {
  coverage: 'full' | 'partial'
  label: string
  presets: DisplayPreset[]
}

export const DISPLAY_PRESETS = [
  { id: 'bundeslaender', label: 'Bundesländer', minLevel: 4, sortLevel: 4 },
  { id: 'regierungsbezirke', label: 'Regierungsbezirke', minLevel: 5, sortLevel: 5 },
  {
    id: 'landkreis_kreisfrei',
    label: 'Landkreise und kreisfreie Städte',
    minLevel: 6,
    sortLevel: 6,
  },
  { id: 'landkreise', label: 'Landkreise', minLevel: 6, sortLevel: 6 },
  { id: 'kreisfreie', label: 'Kreisfreie Städte', minLevel: 6, sortLevel: 6 },
  {
    id: 'gemeindeverbaende_kreisfrei',
    label: 'Gemeindeverbände, Einzelgemeinden und kreisfreie Städte',
    minLevel: 6,
    sortLevel: 7,
  },
  {
    id: 'gemeindeverbaende',
    label: 'Gemeindeverbände und Einzelgemeinden',
    minLevel: 7,
    sortLevel: 7,
  },
  {
    id: 'gemeinden_kreisfrei',
    label: 'Gemeinden und kreisfreie Städte',
    minLevel: 6,
    sortLevel: 8,
  },
  { id: 'gemeinden', label: 'Gemeinden', minLevel: 8, sortLevel: 8 },
  { id: 'stadtbezirke', label: 'Stadtbezirke', minLevel: 9, sortLevel: 9 },
  { id: 'stadtteile', label: 'Stadtteile', minLevel: 10, sortLevel: 10 },
] satisfies DisplayPreset[]

/** Old preset ids from URLs/bookmarks → current presets. */
const DARSTELLUNG_ALIASES: Record<string, DisplayPresetId> = {
  regierungsbezirke_und_stadtstaaten: 'regierungsbezirke',
  landkreise_und_stadtstaaten: 'landkreis_kreisfrei',
  gemeindeverbaende_und_stadtstaaten: 'gemeindeverbaende_kreisfrei',
  gemeinden_und_stadtstaaten: 'gemeinden_kreisfrei',
}

export type RegionRef = { id: string; name: string; level: string }

export type RegionFeatureProps = {
  id?: string
  name?: string
  level?: string
  parent_id?: string
  bundesland_id?: string
  landkreis_id?: string
}

export type StatsFeature = {
  type: string
  geometry?: unknown
  properties?: RegionFeatureProps
}

export type RegionIndex = {
  deutschlandId: string | null
  kreisfreieIds: Set<string>
  parentById: Map<string, string>
  byId: Map<string, StatsFeature>
  idsByLevel: Map<string, string[]>
  bundeslaender: RegionRef[]
  flaechenlaender: RegionRef[]
  stadtstaaten: RegionRef[]
}

export type ViewScope = {
  gebiet: GebietValue
  untergebiet: UntergebietValue
  darstellung: DisplayPresetId
}

function regionLevel(f: StatsFeature) {
  return String(f.properties?.level ?? '')
}

function regionId(f: StatsFeature) {
  return String(f.properties?.id ?? '')
}

export function buildRegionIndex(features: StatsFeature[]): RegionIndex {
  const byId = new Map<string, StatsFeature>()
  const idsByLevel = new Map<string, string[]>()
  const parentById = new Map<string, string>()
  const childrenByParent = new Map<string, StatsFeature[]>()

  for (const f of features) {
    const id = regionId(f)
    if (!id) continue
    byId.set(id, f)
    const level = regionLevel(f)
    if (level) {
      const levelIds = idsByLevel.get(level) ?? []
      levelIds.push(id)
      idsByLevel.set(level, levelIds)
    }
    const parent = f.properties?.parent_id
    if (parent) {
      parentById.set(id, parent)
      const list = childrenByParent.get(parent) ?? []
      list.push(f)
      childrenByParent.set(parent, list)
    }
  }

  const landkreisWithGemeinden = new Set<string>()
  for (const f of features) {
    if (regionLevel(f) !== '8') continue
    const lk = f.properties?.landkreis_id
    if (lk) landkreisWithGemeinden.add(lk)
  }

  const kreisfreieIds = new Set<string>()
  for (const f of features) {
    if (regionLevel(f) !== '6') continue
    const id = regionId(f)
    if (!landkreisWithGemeinden.has(id)) kreisfreieIds.add(id)
  }

  let deutschlandId: string | null = null
  const bundeslaender: RegionRef[] = []
  for (const f of features) {
    if (regionLevel(f) !== '4') continue
    const id = regionId(f)
    const name = String(f.properties?.name ?? id)
    bundeslaender.push({ id, name, level: '4' })
  }
  bundeslaender.sort((a, b) => a.name.localeCompare(b.name, 'de'))

  for (const f of features) {
    if (regionLevel(f) === '2') {
      deutschlandId = regionId(f)
      break
    }
  }

  const flaechenlaender = bundeslaender.filter((b) => !STADTSTAAT_IDS.has(b.id))
  const stadtstaaten = bundeslaender.filter((b) => STADTSTAAT_IDS.has(b.id))

  return {
    deutschlandId,
    kreisfreieIds,
    parentById,
    byId,
    idsByLevel,
    bundeslaender,
    flaechenlaender,
    stadtstaaten,
  }
}

export function isKreisfrei(id: string, index: RegionIndex) {
  return index.kreisfreieIds.has(id)
}

export function isStadtstaatGebiet(gebiet: GebietValue) {
  return gebiet !== DEUTSCHLAND_GEBIET && STADTSTAAT_IDS.has(gebiet)
}

export function isStadtstaatFeature(f: StatsFeature) {
  return regionLevel(f) === '4' && STADTSTAAT_IDS.has(regionId(f))
}

/** All 16 Bundesländer (Flächenländer + Stadtstaaten), sorted by name. */
export function listAllBundeslaender(index: RegionIndex) {
  return [...index.bundeslaender]
}

/** Mixed presets that add Berlin/Hamburg/Bremen at level 4 when Gebiet = Deutschland. */
export function presetIncludesStadtstaatenUnits(preset: DisplayPresetId) {
  return (
    preset === 'landkreis_kreisfrei' ||
    preset === 'gemeindeverbaende_kreisfrei' ||
    preset === 'gemeinden_kreisfrei'
  )
}

export function presetLabelForScope(
  preset: DisplayPreset,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
) {
  if (!isDeutschlandScope(gebiet, untergebiet)) return preset.label
  if (preset.id === 'landkreis_kreisfrei') {
    return 'Landkreise, kreisfreie Städte und Stadtstaaten'
  }
  if (preset.id === 'gemeindeverbaende_kreisfrei') {
    return 'Gemeindeverbände, Einzelgemeinden, kreisfreie Städte und Stadtstaaten'
  }
  if (preset.id === 'gemeinden_kreisfrei') {
    return 'Gemeinden, kreisfreie Städte und Stadtstaaten'
  }
  return preset.label
}

export function isDeutschlandScope(gebiet: GebietValue, untergebiet: UntergebietValue) {
  return gebiet === DEUTSCHLAND_GEBIET && !untergebiet
}

export function scopeLevelFor(gebiet: GebietValue, untergebiet: UntergebietValue) {
  if (gebiet === DEUTSCHLAND_GEBIET) return 2
  if (!untergebiet) return 4
  if (untergebiet.startsWith('rb:')) return 5
  if (
    untergebiet.startsWith('lk:') ||
    untergebiet.startsWith('kreisfrei:') ||
    untergebiet.startsWith('stadt:')
  ) {
    return 6
  }
  return 4
}

export function scopeIdFor(gebiet: GebietValue, untergebiet: UntergebietValue) {
  if (untergebiet.startsWith('rb:')) return untergebiet.slice(3)
  if (untergebiet.startsWith('lk:')) return untergebiet.slice(3)
  if (untergebiet.startsWith('kreisfrei:')) return untergebiet.slice(9)
  if (untergebiet.startsWith('stadt:')) return untergebiet.slice(6)
  if (gebiet === DEUTSCHLAND_GEBIET) return null
  return gebiet
}

function ancestorIds(featureId: string, index: RegionIndex) {
  const ids: string[] = []
  let current: string | undefined = featureId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const parent = index.parentById.get(current)
    if (!parent) break
    ids.push(parent)
    current = parent
  }
  return ids
}

/** Level-8 Gemeinde whose parent chain has no admin_level 7 Verwaltungsgemeinschaft. */
export function isStandaloneGemeinde(f: StatsFeature, index: RegionIndex) {
  if (regionLevel(f) !== '8') return false
  const id = regionId(f)
  for (const ancId of ancestorIds(id, index)) {
    const anc = index.byId.get(ancId)
    if (anc && regionLevel(anc) === '7') return false
  }
  const directParent = index.parentById.get(id)
  if (directParent) {
    const parent = index.byId.get(directParent)
    if (parent && regionLevel(parent) === '7') return false
  }
  return true
}

function matchesGemeindeverbaendeDarstellung(
  f: StatsFeature,
  preset: 'gemeindeverbaende' | 'gemeindeverbaende_kreisfrei',
  index: RegionIndex,
) {
  const level = regionLevel(f)
  const id = regionId(f)
  if (level === '7') return true
  if (isStandaloneGemeinde(f, index)) return true
  if (preset === 'gemeindeverbaende_kreisfrei' && level === '6' && index.kreisfreieIds.has(id)) {
    return true
  }
  return false
}

export function featureWithinScope(
  f: StatsFeature,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const id = regionId(f)
  if (!id || !f.geometry) return false

  const scopeId = scopeIdFor(gebiet, untergebiet)
  if (gebiet === DEUTSCHLAND_GEBIET && !untergebiet) return true

  if (!scopeId) return false

  if (id === scopeId) return true

  if (ancestorIds(id, index).includes(scopeId)) return true

  const level = regionLevel(f)
  const props = f.properties ?? {}

  if (scopeLevelFor(gebiet, untergebiet) === 4 && level > '4' && props.bundesland_id === scopeId) {
    return true
  }

  if (scopeLevelFor(gebiet, untergebiet) === 6 && level > '6' && props.landkreis_id === scopeId) {
    return true
  }

  return false
}

function matchesDisplayPreset(
  f: StatsFeature,
  preset: DisplayPresetId,
  index: RegionIndex,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
) {
  const level = regionLevel(f)
  const id = regionId(f)
  const kreisfrei = index.kreisfreieIds.has(id)
  const deutschland = isDeutschlandScope(gebiet, untergebiet)

  switch (preset) {
    case 'bundeslaender':
      return level === '4'
    case 'regierungsbezirke':
      return level === '5'
    case 'landkreise':
      return level === '6' && !kreisfrei
    case 'kreisfreie':
      return level === '6' && kreisfrei
    case 'landkreis_kreisfrei':
      return level === '6' || (deutschland && isStadtstaatFeature(f))
    case 'gemeindeverbaende':
      return matchesGemeindeverbaendeDarstellung(f, 'gemeindeverbaende', index)
    case 'gemeindeverbaende_kreisfrei':
      return (
        matchesGemeindeverbaendeDarstellung(f, 'gemeindeverbaende_kreisfrei', index) ||
        (deutschland && isStadtstaatFeature(f))
      )
    case 'gemeinden':
      return level === '8'
    case 'gemeinden_kreisfrei':
      return (
        level === '8' || (level === '6' && kreisfrei) || (deutschland && isStadtstaatFeature(f))
      )
    case 'stadtbezirke':
      return level === '9'
    case 'stadtteile':
      return level === '10'
    default:
      return false
  }
}

export function presetMinLevel(preset: DisplayPresetId) {
  const meta = DISPLAY_PRESETS.find((p) => p.id === preset)
  return meta?.minLevel ?? 99
}

function scopeHasKreisfreieInScope(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    if (!index.kreisfreieIds.has(regionId(f))) continue
    if (featureWithinScope(f, gebiet, untergebiet, index)) return true
  }
  return false
}

function scopeHasRegierungsbezirkePartition(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  if (untergebiet) return false
  if (gebiet === DEUTSCHLAND_GEBIET) return false
  let count = 0
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '5') continue
    if (f.properties?.bundesland_id !== gebiet) continue
    if (!featureWithinScope(f, gebiet, '', index)) continue
    count++
  }
  return count > 0
}

/** Whether polygons of this preset tile the whole scope without leaving holes. */
export function presetCoverageForScope(
  preset: DisplayPresetId,
  scopeLevel: number,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const hasKreisfrei = scopeHasKreisfreieInScope(gebiet, untergebiet, index)
  const rbPartition = scopeHasRegierungsbezirkePartition(gebiet, untergebiet, index)

  if (untergebiet.startsWith('kreisfrei:')) {
    if (preset === 'kreisfreie' || preset === 'gemeinden_kreisfrei') return 'full'
    if (preset === 'gemeinden' || preset === 'stadtbezirke' || preset === 'stadtteile') {
      return 'full'
    }
    return 'partial'
  }

  if (untergebiet.startsWith('stadt:')) {
    if (preset === 'stadtbezirke' || preset === 'stadtteile' || preset === 'gemeinden') {
      return 'full'
    }
    return 'partial'
  }

  switch (preset) {
    case 'bundeslaender':
      return scopeLevel <= 2 ? 'full' : 'partial'
    case 'landkreis_kreisfrei':
      return scopeLevel <= 2 || (scopeLevel <= 4 && !hasKreisfrei) ? 'full' : 'partial'
    case 'gemeinden_kreisfrei':
      return scopeLevel <= 2 ? 'full' : 'partial'
    case 'gemeindeverbaende_kreisfrei':
      return scopeLevel <= 2 ? 'full' : 'partial'
    case 'regierungsbezirke':
      if (scopeLevel <= 2) return 'partial'
      return rbPartition && scopeLevel <= 4 ? 'full' : 'partial'
    case 'landkreise':
      return hasKreisfrei ? 'partial' : 'full'
    case 'kreisfreie':
      return 'partial'
    case 'gemeindeverbaende':
      return hasKreisfrei && scopeLevel <= 4 ? 'partial' : 'full'
    case 'gemeinden':
      return scopeLevel <= 6 ? 'full' : 'partial'
    case 'stadtbezirke':
    case 'stadtteile':
      return 'partial'
    default:
      return 'partial'
  }
}

/** Lower = fewer gaps left in the scope (for sorting partial presets). */
export function partialGapRankForScope(
  preset: DisplayPresetId,
  scopeLevel: number,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  if (presetCoverageForScope(preset, scopeLevel, gebiet, untergebiet, index) === 'full') {
    return 0
  }

  const hasKreisfrei = scopeHasKreisfreieInScope(gebiet, untergebiet, index)

  switch (preset) {
    case 'regierungsbezirke':
      return scopeLevel <= 2 ? 50 : 10
    case 'landkreise':
      return 20
    case 'gemeindeverbaende':
      return hasKreisfrei && scopeLevel <= 4 ? 25 : 30
    case 'kreisfreie':
      return untergebiet.startsWith('kreisfrei:') ? 0 : 40
    case 'stadtbezirke':
      return 45
    case 'stadtteile':
      return 55
    case 'bundeslaender':
    case 'gemeinden':
    case 'gemeinden_kreisfrei':
    case 'gemeindeverbaende_kreisfrei':
    case 'landkreis_kreisfrei':
      return 60
    default:
      return 60
  }
}

/** Admin levels present in a preset, coarsest (smallest number) first. */
export function presetUnitLevels(
  preset: DisplayPresetId,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
) {
  const deutschland = isDeutschlandScope(gebiet, untergebiet)
  const stadtstaat = deutschland ? [4] : []
  const kreisfrei = [6] as const

  switch (preset) {
    case 'bundeslaender':
      return [4]
    case 'regierungsbezirke':
      return [5]
    case 'landkreise':
    case 'kreisfreie':
      return [6]
    case 'landkreis_kreisfrei':
      return [...stadtstaat, 6]
    case 'gemeindeverbaende':
      return [7, 8]
    case 'gemeindeverbaende_kreisfrei':
      return [...stadtstaat, ...kreisfrei, 7, 8]
    case 'gemeinden':
      return [8]
    case 'gemeinden_kreisfrei':
      return [...stadtstaat, ...kreisfrei, 8]
    case 'stadtbezirke':
      return [9]
    case 'stadtteile':
      return [10]
    default:
      return []
  }
}

/** Compare coarse → fine unit sizes (e.g. [4, 6] before [4, 6, 7, 8]). */
export function comparePresetUnitLevelHierarchy(
  levelsA: readonly number[],
  levelsB: readonly number[],
) {
  const maxLen = Math.max(levelsA.length, levelsB.length)
  for (let i = 0; i < maxLen; i++) {
    const a = levelsA[i]
    const b = levelsB[i]
    if (a === undefined && b === undefined) continue
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a !== b) return a - b
  }
  return 0
}

function comparePresetsForDarstellungList(
  a: DisplayPreset,
  b: DisplayPreset,
  scopeLevel: number,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const covA = presetCoverageForScope(a.id, scopeLevel, gebiet, untergebiet, index)
  const covB = presetCoverageForScope(b.id, scopeLevel, gebiet, untergebiet, index)
  if (covA !== covB) return covA === 'full' ? -1 : 1

  // Primary map unit (coarse → fine), e.g. Regierungsbezirk before Landkreis before Gemeinde.
  if (a.sortLevel !== b.sortLevel) return a.sortLevel - b.sortLevel

  const hierarchy = comparePresetUnitLevelHierarchy(
    presetUnitLevels(a.id, gebiet, untergebiet),
    presetUnitLevels(b.id, gebiet, untergebiet),
  )
  if (hierarchy !== 0) return hierarchy

  // Same unit mix: denser partial tiling first.
  if (covA === 'partial') {
    const gapA = partialGapRankForScope(a.id, scopeLevel, gebiet, untergebiet, index)
    const gapB = partialGapRankForScope(b.id, scopeLevel, gebiet, untergebiet, index)
    if (gapA !== gapB) return gapA - gapB
  }

  return a.label.localeCompare(b.label, 'de')
}

export function hasFeaturesForDarstellungPreset(
  features: StatsFeature[],
  view: ViewScope,
  preset: DisplayPresetId,
  index: RegionIndex,
) {
  const scopeLevel = scopeLevelFor(view.gebiet, view.untergebiet)
  const scopeId = scopeIdFor(view.gebiet, view.untergebiet)
  const pool = darstellungCandidateFeatures(features, { ...view, darstellung: preset }, index)

  for (const f of pool) {
    if (!matchesDisplayPreset(f, preset, index, view.gebiet, view.untergebiet)) continue
    if (!featureWithinScope(f, view.gebiet, view.untergebiet, index)) continue
    if (scopeId && regionId(f) === scopeId && presetMinLevel(preset) <= scopeLevel) continue
    return true
  }
  return false
}

export function listDarstellungPresetsForScope(
  view: ViewScope,
  index: RegionIndex,
  features: StatsFeature[],
) {
  const scopeLevel = scopeLevelFor(view.gebiet, view.untergebiet)
  const available = DISPLAY_PRESETS.filter((preset) => {
    if (!isPresetAllowedForScope(preset.id, scopeLevel, index, view.gebiet, view.untergebiet)) {
      return false
    }
    return hasFeaturesForDarstellungPreset(features, view, preset.id, index)
  })

  return available.sort((a, b) =>
    comparePresetsForDarstellungList(a, b, scopeLevel, view.gebiet, view.untergebiet, index),
  )
}

/** @deprecated Use {@link listDarstellungPresetsForScope} – coverage groups are no longer shown in the UI. */
export function listDarstellungPresetGroupsForScope(
  view: ViewScope,
  index: RegionIndex,
  features: StatsFeature[],
) {
  const presets = listDarstellungPresetsForScope(view, index, features)
  return presets.length ? [{ coverage: 'full' as const, label: '', presets }] : []
}

export function preferredDarstellungPresetForScope(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
) {
  if (isDeutschlandScope(gebiet, untergebiet)) return 'landkreis_kreisfrei'
  if (untergebiet.startsWith('lk:')) return 'gemeinden'
  if (untergebiet.startsWith('rb:')) return 'landkreis_kreisfrei'
  if (gebiet !== DEUTSCHLAND_GEBIET && !untergebiet) return 'landkreis_kreisfrei'
  return null
}

export function defaultDarstellungPresetForScope(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
  features: StatsFeature[],
) {
  const presets = listDarstellungPresetsForScope(
    { gebiet, untergebiet, darstellung: 'bundeslaender' },
    index,
    features,
  )
  const allowed = new Set(presets.map((p) => p.id))
  const preferred = preferredDarstellungPresetForScope(gebiet, untergebiet)
  if (preferred && allowed.has(preferred)) return preferred
  if (presets[0]) return presets[0].id
  return 'bundeslaender'
}

export function isPresetAllowedForScope(
  preset: DisplayPresetId,
  scopeLevel: number,
  index: RegionIndex,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
) {
  const minLevel = presetMinLevel(preset)
  if (minLevel <= scopeLevel) return false

  const scopeId = scopeIdFor(gebiet, untergebiet)
  if (gebiet === DEUTSCHLAND_GEBIET && !untergebiet) {
    if (preset === 'regierungsbezirke') {
      return featuresCountAtLevel(index, '5', DEUTSCHLAND_GEBIET, '', index) > 0
    }
    return true
  }

  if (!scopeId) return false

  if (preset === 'regierungsbezirke') {
    return countChildrenLevel(scopeId, '5', index) > 0
  }

  if (preset === 'stadtbezirke') {
    return countDescendantsLevel(scopeId, '9', index) > 0
  }

  if (preset === 'stadtteile') {
    return countDescendantsLevel(scopeId, '10', index) > 0
  }

  return true
}

function countChildrenLevel(parentId: string, level: string, index: RegionIndex) {
  let n = 0
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== level) continue
    if (f.properties?.parent_id === parentId) n++
  }
  return n
}

function countDescendantsLevel(scopeId: string, level: string, index: RegionIndex) {
  let n = 0
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== level) continue
    const id = regionId(f)
    if (id === scopeId) continue
    if (ancestorIds(id, index).includes(scopeId)) n++
    else if (f.properties?.bundesland_id === scopeId) n++
    else if (f.properties?.landkreis_id === scopeId) n++
  }
  return n
}

function featuresCountAtLevel(
  index: RegionIndex,
  level: string,
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  _idx: RegionIndex,
) {
  let n = 0
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== level) continue
    if (featureWithinScope(f, gebiet, untergebiet, index)) n++
  }
  return n
}

function darstellungCandidateFeatures(
  features: StatsFeature[],
  view: ViewScope,
  index: RegionIndex,
) {
  const deutschland = isDeutschlandScope(view.gebiet, view.untergebiet)
  const levelsForPreset = (preset: DisplayPresetId) => {
    switch (preset) {
      case 'bundeslaender':
        return ['4']
      case 'regierungsbezirke':
        return ['5']
      case 'landkreise':
      case 'kreisfreie':
        return ['6']
      case 'landkreis_kreisfrei':
        return deutschland ? ['4', '6'] : ['6']
      case 'gemeinden':
        return ['8']
      case 'gemeinden_kreisfrei':
        return deutschland ? ['4', '6', '8'] : ['6', '8']
      case 'stadtbezirke':
        return ['9']
      case 'stadtteile':
        return ['10']
      case 'gemeindeverbaende':
      case 'gemeindeverbaende_kreisfrei':
        return null
      default:
        return null
    }
  }

  const levels = levelsForPreset(view.darstellung)
  if (!levels) return features

  const out: StatsFeature[] = []
  const seen = new Set<string>()
  for (const level of levels) {
    for (const id of index.idsByLevel.get(level) ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      const f = index.byId.get(id)
      if (f) out.push(f)
    }
  }
  return out
}

export function filterFeaturesForView(
  features: StatsFeature[],
  view: ViewScope,
  index: RegionIndex,
) {
  const scopeLevel = scopeLevelFor(view.gebiet, view.untergebiet)
  const scopeId = scopeIdFor(view.gebiet, view.untergebiet)
  const pool = darstellungCandidateFeatures(features, view, index)

  return pool.filter((f) => {
    if (!matchesDisplayPreset(f, view.darstellung, index, view.gebiet, view.untergebiet)) {
      return false
    }
    if (!featureWithinScope(f, view.gebiet, view.untergebiet, index)) return false
    if (scopeId && regionId(f) === scopeId && presetMinLevel(view.darstellung) <= scopeLevel) {
      return false
    }
    return true
  })
}

export function listRegierungsbezirkeInGebiet(gebiet: GebietValue, index: RegionIndex) {
  const out: RegionRef[] = []
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '5') continue
    if (gebiet !== DEUTSCHLAND_GEBIET && f.properties?.bundesland_id !== gebiet) continue
    if (!featureWithinScope(f, gebiet, '', index)) continue
    out.push({ id: regionId(f), name: String(f.properties?.name ?? regionId(f)), level: '5' })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return out
}

export function listLandkreiseInGebiet(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const out: RegionRef[] = []
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    if (index.kreisfreieIds.has(regionId(f))) continue
    if (!featureWithinScope(f, gebiet, untergebiet, index)) continue
    out.push({ id: regionId(f), name: String(f.properties?.name ?? regionId(f)), level: '6' })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return out
}

export function listKreisfreieInGebiet(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const out: RegionRef[] = []
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '6') continue
    if (!index.kreisfreieIds.has(regionId(f))) continue
    if (!featureWithinScope(f, gebiet, untergebiet, index)) continue
    out.push({ id: regionId(f), name: String(f.properties?.name ?? regionId(f)), level: '6' })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return out
}

export function listStadtbezirkeInGebiet(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const out: RegionRef[] = []
  for (const f of index.byId.values()) {
    if (regionLevel(f) !== '9') continue
    if (!featureWithinScope(f, gebiet, untergebiet, index)) continue
    out.push({ id: regionId(f), name: String(f.properties?.name ?? regionId(f)), level: '9' })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return out
}

export function defaultDarstellungForScope(
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
  features: StatsFeature[] = [...index.byId.values()],
) {
  return defaultDarstellungPresetForScope(gebiet, untergebiet, index, features)
}

export function viewLabel(view: ViewScope, index: RegionIndex) {
  const parts: string[] = []
  if (view.gebiet === DEUTSCHLAND_GEBIET) {
    parts.push('Deutschland')
  } else {
    const bl = index.byId.get(view.gebiet)
    parts.push(String(bl?.properties?.name ?? view.gebiet))
  }

  if (view.untergebiet.startsWith('rb:')) {
    const id = view.untergebiet.slice(3)
    parts.push(String(index.byId.get(id)?.properties?.name ?? id))
  } else if (view.untergebiet.startsWith('lk:')) {
    const id = view.untergebiet.slice(3)
    parts.push(String(index.byId.get(id)?.properties?.name ?? id))
  } else if (view.untergebiet.startsWith('kreisfrei:')) {
    const id = view.untergebiet.slice(9)
    parts.push(String(index.byId.get(id)?.properties?.name ?? id))
  } else if (view.untergebiet.startsWith('stadt:')) {
    const id = view.untergebiet.slice(6)
    parts.push(String(index.byId.get(id)?.properties?.name ?? id))
  }

  const preset = DISPLAY_PRESETS.find((p) => p.id === view.darstellung)
  parts.push(preset ? presetLabelForScope(preset, view.gebiet, view.untergebiet) : view.darstellung)
  return parts.join(' · ')
}

export function viewShowsManyGemeinden(view: ViewScope) {
  return (
    view.darstellung === 'gemeinden' ||
    view.darstellung === 'gemeinden_kreisfrei' ||
    view.darstellung === 'gemeindeverbaende' ||
    view.darstellung === 'gemeindeverbaende_kreisfrei' ||
    view.darstellung === 'stadtbezirke' ||
    view.darstellung === 'stadtteile'
  )
}

export function viewShowsGemeindenLevel(view: ViewScope) {
  return viewShowsManyGemeinden(view)
}

export function parseUntergebietParam(value: string | null): UntergebietValue {
  if (!value) return ''
  const decoded = decodeURIComponent(value)
  if (
    decoded.startsWith('rb:') ||
    decoded.startsWith('lk:') ||
    decoded.startsWith('kreisfrei:') ||
    decoded.startsWith('stadt:')
  ) {
    return decoded as UntergebietValue
  }
  return ''
}

export function parseGebietParam(value: string | null, index: RegionIndex): GebietValue {
  if (!value || value === 'deutschland' || value === 'de') return DEUTSCHLAND_GEBIET
  const decoded = decodeURIComponent(value)
  if (index.byId.has(decoded)) return decoded
  return DEUTSCHLAND_GEBIET
}

export function parseDarstellungParam(value: string | null): DisplayPresetId | null {
  if (!value) return null
  const raw = decodeURIComponent(value)
  const id = (DARSTELLUNG_ALIASES[raw] ?? raw) as DisplayPresetId
  return DISPLAY_PRESETS.some((p) => p.id === id) ? id : null
}

/** Legacy view= URLs → ViewScope */
export function viewScopeFromLegacyViewId(viewId: string, index: RegionIndex): ViewScope | null {
  if (viewId === 'bayern-landkreise-kreisfreie' || viewId === 'bayern-landkreise') {
    const bayern = 'relation/2145268'
    return {
      gebiet: bayern,
      untergebiet: '',
      darstellung:
        viewId.includes('kreisfrei') && !viewId.includes('landkreise-kreisfreie')
          ? 'landkreise'
          : 'landkreis_kreisfrei',
    }
  }
  if (viewId === 'bayern-gemeinden-kreisfreie') {
    return { gebiet: 'relation/2145268', untergebiet: '', darstellung: 'gemeinden_kreisfrei' }
  }
  if (viewId === 'bayern-gemeinden') {
    return { gebiet: 'relation/2145268', untergebiet: '', darstellung: 'gemeinden' }
  }
  if (viewId === 'bayern-kreisfreie-staedte') {
    return { gebiet: 'relation/2145268', untergebiet: '', darstellung: 'kreisfreie' }
  }
  if (viewId.startsWith('landkreis:')) {
    return {
      gebiet: 'relation/2145268',
      untergebiet: `lk:${viewId.slice('landkreis:'.length)}`,
      darstellung: 'gemeinden',
    }
  }
  if (viewId.startsWith('kreisfrei:')) {
    return {
      gebiet: 'relation/2145268',
      untergebiet: `kreisfrei:${viewId.slice('kreisfrei:'.length)}`,
      darstellung: 'gemeinden_kreisfrei',
    }
  }
  if (index.byId.has(viewId)) {
    const f = index.byId.get(viewId)!
    const level = regionLevel(f)
    if (level === '4') {
      return {
        gebiet: viewId,
        untergebiet: '',
        darstellung: defaultDarstellungForScope(viewId, '', index),
      }
    }
  }
  return null
}

export function scopeBoundsFeatures(
  features: StatsFeature[],
  gebiet: GebietValue,
  untergebiet: UntergebietValue,
  index: RegionIndex,
) {
  const scopeId = scopeIdFor(gebiet, untergebiet)
  if (scopeId) {
    const scopeFeature = index.byId.get(scopeId)
    if (scopeFeature?.geometry) return [scopeFeature]
  }
  if (gebiet === DEUTSCHLAND_GEBIET) {
    const land = index.deutschlandId ? index.byId.get(index.deutschlandId) : null
    if (land?.geometry) return [land]
    return features.filter((f) => regionLevel(f) === '4')
  }
  const bl = index.byId.get(gebiet)
  return bl?.geometry ? [bl] : []
}
