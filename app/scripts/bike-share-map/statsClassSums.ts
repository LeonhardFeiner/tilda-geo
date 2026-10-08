/** Road / bikelane class buckets – aligned with radinfra.de statistics (export-stats-csv). */

export const ROAD_CLASS_ORDER = [
  'motorway_like',
  'primary_like',
  'secondary_like',
  'residential_like',
] as const

export type RoadClass = (typeof ROAD_CLASS_ORDER)[number]

export const ROAD_CLASS_LABELS: Record<RoadClass, string> = {
  motorway_like: 'Autobahn & Kraftfahrstraßen',
  primary_like: 'Bundes- und Landesstraßen',
  secondary_like: 'Kreis- und Nebenstraßen',
  residential_like: 'Wohn- und Erschließungsstraßen',
}

export const highwayClassDefinition = {
  motorway: 'motorway_like',
  motorway_link: 'motorway_like',
  trunk: 'primary_like',
  trunk_link: 'primary_like',
  primary: 'primary_like',
  primary_link: 'primary_like',
  secondary: 'primary_like',
  secondary_link: 'primary_like',
  tertiary: 'primary_like',
  tertiary_link: 'primary_like',
  unclassified: 'secondary_like',
  service_road: 'secondary_like',
  service_uncategorized: 'secondary_like',
  service_alley: 'secondary_like',
  service_driveway: 'secondary_like',
  service_emergency_access: 'secondary_like',
  residential: 'residential_like',
  residential_priority_road: 'residential_like',
  bicycle_road: 'residential_like',
  living_street: 'residential_like',
  pedestrian: 'residential_like',
  unspecified_road: 'residential_like',
} satisfies Record<string, RoadClass>

export const BIKELANE_CLASS_ORDER = [
  'needsClarification',
  'bike_with_foot_traffic',
  'bike_with_car_traffic',
  'bike_next_to_foot_traffic',
  'bike_next_to_car_traffic',
  'separate_bike_traffic',
] as const

export type BikelaneClass = (typeof BIKELANE_CLASS_ORDER)[number]

export const BIKELANE_CLASS_LABELS: Record<BikelaneClass, string> = {
  needsClarification: 'Klärung nötig',
  bike_with_foot_traffic: 'Rad mit Fußverkehr',
  bike_with_car_traffic: 'Rad mit Kfz-Verkehr',
  bike_next_to_foot_traffic: 'Rad neben Fußverkehr',
  bike_next_to_car_traffic: 'Rad neben Kfz-Verkehr',
  separate_bike_traffic: 'Getrennter Radverkehr',
}

export const bikelaneCategoryTags: Record<BikelaneClass, readonly string[]> = {
  needsClarification: ['needsClarification'],
  bike_with_foot_traffic: [
    'footwayBicycleYes_isolated',
    'pedestrianAreaBicycleYes',
    'footwayBicycleYes_adjoining',
    'footwayBicycleYes_adjoiningOrIsolated',
  ],
  bike_with_car_traffic: [
    'sharedMotorVehicleLane',
    'bicycleRoad_vehicleDestination',
    'sharedBusLaneBusWithBike',
    'sharedBusLaneBikeWithBus',
  ],
  bike_next_to_foot_traffic: [
    'footAndCyclewayShared_isolated',
    'footAndCyclewayShared_adjoining',
    'footAndCyclewayShared_adjoiningOrIsolated',
  ],
  bike_next_to_car_traffic: [
    'cyclewayOnHighway_exclusive',
    'cyclewayOnHighwayBetweenLanes',
    'cyclewayLink',
    'crossing',
    'cyclewayOnHighway_advisory',
    'cyclewayOnHighway_advisoryOrExclusive',
  ],
  separate_bike_traffic: [
    'footAndCyclewaySegregated_adjoining',
    'footAndCyclewaySegregated_adjoiningOrIsolated',
    'cycleway_isolated',
    'cycleway_adjoining',
    'bicycleRoad',
    'footAndCyclewaySegregated_isolated',
    'cycleway_adjoiningOrIsolated',
    'cyclewayOnHighwayProtected',
  ],
}

export type LengthClassFilter = {
  road: Record<RoadClass, boolean>
  bikelane: Record<BikelaneClass, boolean>
}

/** Matches radinfra.de `road_sum_sum` / `bikelane_sum_sum` (all classes). */
export const RADINFRA_DEFAULT_FILTER: LengthClassFilter = {
  road: {
    motorway_like: true,
    primary_like: true,
    secondary_like: true,
    residential_like: true,
  },
  bikelane: {
    needsClarification: true,
    bike_with_foot_traffic: true,
    bike_with_car_traffic: true,
    bike_next_to_foot_traffic: true,
    bike_next_to_car_traffic: true,
    separate_bike_traffic: true,
  },
}

/** Max decimals for km / % in viewer UI and CSV export. */
export const STAT_KM_MAX_DECIMALS = 3
export const STAT_PCT_MAX_DECIMALS = 3
/** One decimal for map UI (legend, ranking, scale hints, tooltips). */
export const STAT_PCT_UI_DECIMALS = 1
export const STAT_KM_BIKE_UI_DECIMALS = 1
export const STAT_KM_ROAD_UI_DECIMALS = 0

export function formatStatKm(value: number, maxFractionDigits = STAT_KM_MAX_DECIMALS) {
  if (!Number.isFinite(value)) return '–'
  return value.toLocaleString('de-DE', { maximumFractionDigits: maxFractionDigits })
}

export function formatStatPct(
  value: number,
  maxFractionDigits = STAT_PCT_MAX_DECIMALS,
  minFractionDigits = 0,
) {
  if (!Number.isFinite(value)) return '–'
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  })
}

export function formatStatPctUi(value: number) {
  return formatStatPct(value, STAT_PCT_UI_DECIMALS, STAT_PCT_UI_DECIMALS)
}

function sum(nums: Array<number | undefined | null>) {
  let t = 0
  for (const n of nums) {
    if (typeof n === 'number' && Number.isFinite(n)) t += n
  }
  return t
}

/** Total of a `{ class: length }` record such as road_length, tolerating anything unparsable. */
export function sumLengthRecord(value: unknown) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return 0
  let total = 0
  for (const raw of Object.values(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n)) total += n
  }
  return total
}

function asLengthRecord(value: unknown) {
  if (value == null) return {}
  if (typeof value === 'string') {
    try {
      return asLengthRecord(JSON.parse(value) as unknown)
    } catch {
      return {}
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

export function roadClassForKey(key: string) {
  return highwayClassDefinition[key as keyof typeof highwayClassDefinition] ?? 'secondary_like'
}

export function getRoadSums(road_length: Record<string, number>) {
  const values = (roadClass: RoadClass) =>
    Object.entries(road_length)
      .map(([highwayTag, value]) => (roadClassForKey(highwayTag) === roadClass ? value : undefined))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  return {
    sum: sum(Object.values(road_length)),
    motorway_like: sum(values('motorway_like')),
    primary_like: sum(values('primary_like')),
    secondary_like: sum(values('secondary_like')),
    residential_like: sum(values('residential_like')),
  }
}

export function getBikelaneSums(bikelane_length: Record<string, number> | null) {
  const input = bikelane_length ?? {}
  const values = (bikelaneClass: BikelaneClass) =>
    Object.entries(input)
      .map(([tag, value]) => {
        const categories = bikelaneCategoryTags[bikelaneClass] ?? []
        return categories.includes(tag) ? value : undefined
      })
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  return {
    sum: sum(Object.values(input)),
    needsClarification: sum(values('needsClarification')),
    bike_with_foot_traffic: sum(values('bike_with_foot_traffic')),
    bike_with_car_traffic: sum(values('bike_with_car_traffic')),
    bike_next_to_foot_traffic: sum(values('bike_next_to_foot_traffic')),
    bike_next_to_car_traffic: sum(values('bike_next_to_car_traffic')),
    separate_bike_traffic: sum(values('separate_bike_traffic')),
  }
}

/** Who builds and maintains a road, read off its number (B/L/K …) during aggregation. */
export const ROAD_AUTHORITY_ORDER = ['bund', 'land', 'kreis', 'gemeinde'] as const
export type RoadAuthority = (typeof ROAD_AUTHORITY_ORDER)[number]
export const ROAD_AUTHORITY_LABELS: Record<RoadAuthority, string> = {
  bund: 'Bund (B-Straßen)',
  land: 'Land (L-/S-/St-Straßen)',
  kreis: 'Landkreis (K-Straßen)',
  gemeinde: 'Gemeinde (ohne Straßennummer)',
}

/** Roads where separate bike infrastructure is the expectation, not a bonus. */
export const MAIN_ROAD_CLASS: RoadClass = 'primary_like'

export type MainRoadAuthorityRow = {
  authority: RoadAuthority
  roadKm: number
  bikeKm: number
  pct: number
}

/**
 * Share of main roads (MAIN_ROAD_CLASS) with bike infrastructure along them, overall and per
 * road authority. Unlike the headline share, bike km only count when they run along such a
 * road, so paths through fields or residential streets can't flatter it. Null when the region
 * has no main roads or predates the per-road aggregation.
 */
export function mainRoadBreakdown(roadLengthByAuthority: unknown, bikelaneLengthByRoad: unknown) {
  const roads = asLengthRecord(roadLengthByAuthority)
  const bikes = asLengthRecord(bikelaneLengthByRoad)
  if (!Object.keys(roads).length) return null
  const road = new Map<RoadAuthority, number>()
  const bike = new Map<RoadAuthority, number>()
  const add = (target: Map<RoadAuthority, number>, key: string, km: number) => {
    const [roadKey = '', rawAuthority = ''] = key.split('|')
    if (roadClassForKey(roadKey) !== MAIN_ROAD_CLASS) return
    // A trunk road with an A number is federal like any B road.
    const authority = (rawAuthority === 'autobahn' ? 'bund' : rawAuthority) as RoadAuthority
    if (!ROAD_AUTHORITY_ORDER.includes(authority)) return
    target.set(authority, (target.get(authority) ?? 0) + km)
  }
  for (const [key, km] of Object.entries(roads)) add(road, key, km)
  for (const [key, km] of Object.entries(bikes)) add(bike, key, km)
  const roadKm = sum([...road.values()])
  if (!(roadKm > 0)) return null
  const byAuthority: MainRoadAuthorityRow[] = []
  for (const authority of ROAD_AUTHORITY_ORDER) {
    const r = road.get(authority) ?? 0
    if (!(r > 0)) continue
    // The aggregation caps bike km per road, but a region boundary can still cut a road so that
    // its bike samples land inside and its road samples outside: never more than fully covered.
    const b = Math.min(bike.get(authority) ?? 0, r)
    byAuthority.push({ authority, roadKm: r, bikeKm: b, pct: (b / r) * 100 })
  }
  const bikeKm = sum(byAuthority.map((row) => row.bikeKm))
  return { roadKm, bikeKm, pct: (bikeKm / roadKm) * 100, byAuthority }
}

/**
 * Splits the km missing to reach `targetPct` on main roads across the authorities, in proportion
 * to each one's own shortfall against that target. Authorities already at the target get 0.
 */
export function mainRoadGapByAuthority(
  breakdown: NonNullable<ReturnType<typeof mainRoadBreakdown>>,
  targetPct: number,
) {
  const totalGap = Math.max(0, (targetPct / 100) * breakdown.roadKm - breakdown.bikeKm)
  const shortfalls = breakdown.byAuthority.map((row) =>
    Math.max(0, (targetPct / 100) * row.roadKm - row.bikeKm),
  )
  const shortfallSum = sum(shortfalls)
  return {
    totalGapKm: totalGap,
    byAuthority: breakdown.byAuthority.map((row, i) => ({
      authority: row.authority,
      gapKm: shortfallSum > 0 ? (totalGap * (shortfalls[i] ?? 0)) / shortfallSum : 0,
    })),
  }
}

/** Bike km not along any road (field/forest/park paths); 0 when not aggregated. */
export function independentBikeKm(bikelaneLengthByRoad: unknown) {
  return asLengthRecord(bikelaneLengthByRoad).independent ?? 0
}

export function computeFilteredLengths(
  road_length: unknown,
  bikelane_length: unknown,
  filter: LengthClassFilter,
) {
  const roadSums = getRoadSums(asLengthRecord(road_length))
  const bikeSums = getBikelaneSums(asLengthRecord(bikelane_length))

  let roadKm = 0
  for (const c of ROAD_CLASS_ORDER) {
    if (filter.road[c]) roadKm += roadSums[c]
  }
  let bikeKm = 0
  for (const c of BIKELANE_CLASS_ORDER) {
    if (filter.bikelane[c]) bikeKm += bikeSums[c]
  }

  return { roadKm, bikeKm }
}

/**
 * How far the bike-infrastructure figure can be trusted, judged from the data alone.
 *
 * The signal that actually separates regions is tagging: infrastructure that exists in OSM but
 * whose tags don't say what kind it is lands in "needsClarification". Across Gemeinden that
 * share is 0 for most and above 40 % for roughly one in seven. (Road-network density was tried
 * as a completeness proxy and rejected: its lowest values are Alpine and tiny places, so it
 * mostly measures terrain.)
 */
export const TAGGING_MIXED_SHARE = 0.15
export const TAGGING_POOR_SHARE = 0.4
/** Below this much mapped bike infrastructure a share of it says nothing. */
export const TAGGING_MIN_BIKE_KM = 1
/** A real road network with next to no bike infrastructure on it: absent, or just not mapped. */
export const SPARSE_MIN_ROAD_KM = 20
export const SPARSE_MAX_BIKE_KM = 0.5

export type BikeDataQuality =
  | { level: 'sparse'; bikeKm: number; roadKm: number }
  | {
      level: 'good' | 'mixed' | 'poor'
      unclearKm: number
      bikeKm: number
      unclearShare: number
    }

/** Independent of the counting filter: it describes the data, not the current definition. */
export function assessBikeDataQuality(
  road_length: unknown,
  bikelane_length: unknown,
): BikeDataQuality | null {
  const roadKm = getRoadSums(asLengthRecord(road_length)).sum
  const bike = getBikelaneSums(asLengthRecord(bikelane_length))
  if (roadKm >= SPARSE_MIN_ROAD_KM && bike.sum < SPARSE_MAX_BIKE_KM) {
    return { level: 'sparse', bikeKm: bike.sum, roadKm }
  }
  if (bike.sum < TAGGING_MIN_BIKE_KM) return null
  const unclearShare = bike.needsClarification / bike.sum
  const level =
    unclearShare >= TAGGING_POOR_SHARE
      ? 'poor'
      : unclearShare >= TAGGING_MIXED_SHARE
        ? 'mixed'
        : 'good'
  return {
    level,
    unclearKm: bike.needsClarification,
    bikeKm: bike.sum,
    unclearShare,
  }
}

export type ClassLengthRow = {
  id: string
  label: string
  km: number
  /** The raw OSM / TILDA key behind a readable label, for a tooltip. */
  key?: string
}

/** German names for the OSM highway values the road lengths are keyed by. */
export const ROAD_TAG_LABELS: Record<string, string> = {
  motorway: 'Autobahn',
  motorway_link: 'Autobahn (Zu-/Abfahrt)',
  trunk: 'Kraftfahrstraße',
  trunk_link: 'Kraftfahrstraße (Zu-/Abfahrt)',
  primary: 'Bundesstraße',
  primary_link: 'Bundesstraße (Zu-/Abfahrt)',
  secondary: 'Landesstraße',
  secondary_link: 'Landesstraße (Zu-/Abfahrt)',
  tertiary: 'Kreisstraße',
  tertiary_link: 'Kreisstraße (Zu-/Abfahrt)',
  unclassified: 'Sonstige Straße',
  service_road: 'Erschließungsweg',
  service_uncategorized: 'Sonstiger Betriebsweg',
  service_alley: 'Gasse / Hinterhofzufahrt',
  service_driveway: 'Grundstückszufahrt',
  service_emergency_access: 'Rettungszufahrt',
  residential: 'Wohnstraße',
  residential_priority_road: 'Vorfahrtstraße im Wohngebiet',
  bicycle_road: 'Fahrradstraße',
  living_street: 'Verkehrsberuhigter Bereich',
  pedestrian: 'Fußgängerzone (mit Kfz-Verkehr)',
  unspecified_road: 'Straße (nicht näher bestimmt)',
}

/** German names for the TILDA bikelane categories the bike lengths are keyed by. */
export const BIKELANE_TAG_LABELS: Record<string, string> = {
  needsClarification: 'Klärung nötig',
  footwayBicycleYes_isolated: 'Gehweg, Rad frei (eigenständig)',
  footwayBicycleYes_adjoining: 'Gehweg, Rad frei (straßenbegleitend)',
  footwayBicycleYes_adjoiningOrIsolated: 'Gehweg, Rad frei',
  pedestrianAreaBicycleYes: 'Fußgängerzone, Rad frei',
  sharedMotorVehicleLane: 'Gemeinsame Fahrspur mit Kfz',
  bicycleRoad_vehicleDestination: 'Fahrradstraße (Anlieger frei)',
  sharedBusLaneBusWithBike: 'Busspur, Rad frei',
  sharedBusLaneBikeWithBus: 'Radspur, Bus frei',
  footAndCyclewayShared_isolated: 'Gemeinsamer Geh- und Radweg (eigenständig)',
  footAndCyclewayShared_adjoining: 'Gemeinsamer Geh- und Radweg (straßenbegleitend)',
  footAndCyclewayShared_adjoiningOrIsolated: 'Gemeinsamer Geh- und Radweg',
  cyclewayOnHighway_exclusive: 'Radfahrstreifen',
  cyclewayOnHighwayBetweenLanes: 'Radfahrstreifen zwischen Fahrspuren',
  cyclewayOnHighway_advisory: 'Schutzstreifen',
  cyclewayOnHighway_advisoryOrExclusive: 'Schutz- oder Radfahrstreifen',
  cyclewayLink: 'Radweg-Verbindung',
  crossing: 'Querung (Radfurt)',
  footAndCyclewaySegregated_adjoining: 'Getrennter Geh- und Radweg (straßenbegleitend)',
  footAndCyclewaySegregated_isolated: 'Getrennter Geh- und Radweg (eigenständig)',
  footAndCyclewaySegregated_adjoiningOrIsolated: 'Getrennter Geh- und Radweg',
  cycleway_isolated: 'Radweg (eigenständig)',
  cycleway_adjoining: 'Radweg (straßenbegleitend)',
  cycleway_adjoiningOrIsolated: 'Radweg',
  bicycleRoad: 'Fahrradstraße',
  cyclewayOnHighwayProtected: 'Geschützter Radfahrstreifen',
}

export function listFilteredRoadClassLengths(road_length: unknown, filter: LengthClassFilter) {
  const sums = getRoadSums(asLengthRecord(road_length))
  const rows: ClassLengthRow[] = []
  for (const c of ROAD_CLASS_ORDER) {
    if (!filter.road[c]) continue
    const km = sums[c]
    if (km > 0) rows.push({ id: c, label: ROAD_CLASS_LABELS[c], km })
  }
  return rows
}

export function listFilteredBikelaneClassLengths(
  bikelane_length: unknown,
  filter: LengthClassFilter,
) {
  const sums = getBikelaneSums(asLengthRecord(bikelane_length))
  const rows: ClassLengthRow[] = []
  for (const c of BIKELANE_CLASS_ORDER) {
    if (!filter.bikelane[c]) continue
    const km = sums[c]
    if (km > 0) rows.push({ id: c, label: BIKELANE_CLASS_LABELS[c], km })
  }
  return rows
}

const bikelaneTagToClass = new Map<string, BikelaneClass>(
  Object.entries(bikelaneCategoryTags).flatMap(([cls, tags]) =>
    tags.map((tag) => [tag, cls as BikelaneClass]),
  ),
)

export function listFilteredHighwayTagLengths(road_length: unknown, filter: LengthClassFilter) {
  const record = asLengthRecord(road_length)
  const rows: ClassLengthRow[] = []
  for (const [tag, km] of Object.entries(record)) {
    if (!(km > 0)) continue
    const roadClass = roadClassForKey(tag)
    if (!filter.road[roadClass]) continue
    rows.push({ id: tag, label: ROAD_TAG_LABELS[tag] ?? tag, km, key: tag })
  }
  rows.sort((a, b) => b.km - a.km)
  return rows
}

export function listFilteredBikelaneTagLengths(
  bikelane_length: unknown,
  filter: LengthClassFilter,
) {
  const record = asLengthRecord(bikelane_length)
  const rows: ClassLengthRow[] = []
  for (const [tag, km] of Object.entries(record)) {
    if (!(km > 0)) continue
    const cls = bikelaneTagToClass.get(tag)
    if (!cls || !filter.bikelane[cls]) continue
    rows.push({ id: tag, label: BIKELANE_TAG_LABELS[tag] ?? tag, km, key: tag })
  }
  rows.sort((a, b) => b.km - a.km)
  return rows
}

export function enabledRoadHighwayTags(filter: LengthClassFilter) {
  const tags: string[] = []
  for (const [highway, roadClass] of Object.entries(highwayClassDefinition)) {
    if (filter.road[roadClass]) tags.push(highway)
  }
  return tags
}

const ROAD_CLASSES_MAJOR = ['motorway_like', 'primary_like', 'secondary_like'] as const
const ROAD_CLASSES_RESIDENTIAL = ['residential_like'] as const

export function enabledMajorRoadHighwayTags(filter: LengthClassFilter) {
  const tags: string[] = []
  for (const roadClass of ROAD_CLASSES_MAJOR) {
    if (!filter.road[roadClass]) continue
    for (const [highway, cls] of Object.entries(highwayClassDefinition)) {
      if (cls === roadClass) tags.push(highway)
    }
  }
  return tags
}

export function enabledResidentialRoadHighwayTags(filter: LengthClassFilter) {
  const tags: string[] = []
  for (const roadClass of ROAD_CLASSES_RESIDENTIAL) {
    if (!filter.road[roadClass]) continue
    for (const [highway, cls] of Object.entries(highwayClassDefinition)) {
      if (cls === roadClass) tags.push(highway)
    }
  }
  return tags
}

export function enabledBikelaneCategoryTags(filter: LengthClassFilter) {
  const tags: string[] = []
  for (const c of BIKELANE_CLASS_ORDER) {
    if (!filter.bikelane[c]) continue
    tags.push(...bikelaneCategoryTags[c])
  }
  return tags
}

/** MapLibre filter: show features whose `property` is in `values` (empty → hide all). */
export function maplibrePropertyInFilter(property: string, values: string[]) {
  if (!values.length) return ['literal', false]
  return ['match', ['get', property], values, true, false]
}

export function highwayTagsForRoadClass(roadClass: RoadClass) {
  const tags: string[] = []
  for (const [highway, cls] of Object.entries(highwayClassDefinition)) {
    if (cls === roadClass) tags.push(highway)
  }
  return tags
}

export function maplibreRoadOverlayFiltersForClass(roadClass: RoadClass) {
  const tags = highwayTagsForRoadClass(roadClass)
  const isResidential = roadClass === 'residential_like'
  return {
    major: maplibrePropertyInFilter('road', isResidential ? [] : tags),
    residential: maplibrePropertyInFilter('road', isResidential ? tags : []),
  }
}

export function maplibreRoadOverlayFiltersForHighwayTag(tag: string) {
  const roadClass = roadClassForKey(tag)
  const isResidential = roadClass === 'residential_like'
  return {
    major: maplibrePropertyInFilter('road', isResidential ? [] : [tag]),
    residential: maplibrePropertyInFilter('road', isResidential ? [tag] : []),
  }
}

export function maplibreBikelaneOverlayFilterForClass(cls: BikelaneClass) {
  return maplibrePropertyInFilter('category', [...bikelaneCategoryTags[cls]])
}

export function maplibreBikelaneOverlayFilterForTag(tag: string) {
  return maplibrePropertyInFilter('category', [tag])
}

export function combineMaplibreFilters(...filters: unknown[]) {
  const active = filters.filter((f) => {
    if (!f) return false
    if (Array.isArray(f) && f[0] === 'literal' && f[1] === false) return false
    return true
  })
  if (!active.length) return ['literal', false]
  if (active.length === 1) return active[0]
  return ['all', ...active]
}

export {
  computeChoroplethScaleRange,
  DEFAULT_IQR_MULTIPLIER,
  DEFAULT_MIN_ROAD_KM_FOR_SCALE,
  DEFAULT_PERCENTILE_HIGH,
  isLowRoadNetworkForScale,
} from './choroplethScale'
