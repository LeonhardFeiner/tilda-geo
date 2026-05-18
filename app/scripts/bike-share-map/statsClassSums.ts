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

export type ClassLengthRow = {
  id: string
  label: string
  km: number
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
    rows.push({ id: tag, label: tag, km })
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
    rows.push({ id: tag, label: tag, km })
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

export {
  computeChoroplethScaleRange,
  DEFAULT_IQR_MULTIPLIER,
  DEFAULT_MIN_ROAD_KM_FOR_SCALE,
  DEFAULT_PERCENTILE_HIGH,
  isLowRoadNetworkForScale,
} from './choroplethScale'
