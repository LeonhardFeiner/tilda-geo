/**
 * Bike speed profile of the detour graph (fetchDetourGraph.ts), kept apart so it can be unit
 * tested without the database and Bun-only imports.
 */

// --------------------------------------------------------------------------- speed profiles
//
// Same spirit as routing/station_access.py: rough on purpose, no traffic lights, no traffic.

export const BIKE_KMH_BY_ROAD: Record<string, number> = {
  living_street: 12,
  service_road: 15,
  service_alley: 15,
  service_driveway: 15,
  service_uncategorized: 15,
  service_emergency_access: 15,
  service: 15,
  // track/path: see bikeKmh — the speed there depends on the surface, not the class.
  bicycle_road: 18,
  pedestrian: 5,
  footway: 5,
  footway_crossing: 8,
  footway_steps: 2,
  steps: 2,
  cycleway: 18,
}
/** Surfaces the detour page reports as unpaved (sett and cobblestone are paved, just rough). */
export const UNPAVED_SURFACES = new Set([
  'compacted',
  'fine_gravel',
  'gravel',
  'pebblestone',
  'unpaved',
  'ground',
  'dirt',
  'earth',
  'grass',
  'sand',
  'mud',
  'woodchips',
])
export const BIKE_DEFAULT_KMH = 18
export const PUSH_KMH = 5
/** Surfaces that ride like a road. */
const PAVED_SURFACES = new Set([
  'asphalt',
  'paved',
  'concrete',
  'concrete:plates',
  'concrete:lanes',
  'paving_stones',
  'chipseal',
])
/**
 * A track or path without a surface tag: in Bavaria mostly asphalted Wirtschaftswege, elsewhere
 * often gravel. Between the two on purpose (gravel would be 18 × 0.75 = 13.5).
 */
const UNTAGGED_TRACK_KMH = 15
/** TILDA categories that are dedicated bike infrastructure off the carriageway (ride at full speed). */
const DEDICATED_BIKE_WAY = /^(cycleway|footAndCycleway|bicycleRoad)/

/**
 * Cruising speed (km/h) on one bike edge before the one-way rule. Dedicated bike ways ride at
 * full speed whatever their highway tag (a shared Geh- und Radweg is usually highway=path);
 * tracks and paths go by their surface, so an asphalted Wirtschaftsweg is as fast as a road and
 * the surface penalty is applied once, not on top of a slow class default.
 */
export function bikeKmh({
  category,
  road,
  surface,
  access,
}: {
  category: string
  road: string | null
  surface: string | null
  access: string | null
}) {
  const surfaceFactor = SURFACE_FACTOR[surface ?? ''] ?? 1
  let kmh: number
  if (DEDICATED_BIKE_WAY.test(category)) kmh = BIKE_DEFAULT_KMH * surfaceFactor
  else if (category.startsWith('footwayBicycleYes') || category === 'pedestrianAreaBicycleYes')
    kmh = 14 * surfaceFactor
  else if (category === 'crossing') kmh = 10
  else if (category === 'mixedTrafficFoot' && (road === 'footway' || road === 'pedestrian'))
    kmh =
      access === 'yes' || access === 'designated' || access === 'permissive'
        ? 14 * surfaceFactor
        : PUSH_KMH
  else if (road === 'track' || road === 'path')
    kmh =
      surface == null || surface === ''
        ? UNTAGGED_TRACK_KMH
        : PAVED_SURFACES.has(surface)
          ? BIKE_DEFAULT_KMH
          : BIKE_DEFAULT_KMH * surfaceFactor
  else kmh = (BIKE_KMH_BY_ROAD[road ?? ''] ?? BIKE_DEFAULT_KMH) * surfaceFactor
  if (access === 'dismount') kmh = Math.min(kmh, PUSH_KMH)
  return kmh
}
export const SURFACE_FACTOR: Record<string, number> = {
  compacted: 0.9,
  fine_gravel: 0.85,
  gravel: 0.75,
  pebblestone: 0.7,
  unpaved: 0.75,
  ground: 0.65,
  dirt: 0.65,
  earth: 0.65,
  grass: 0.55,
  sand: 0.5,
  mud: 0.5,
  woodchips: 0.6,
  sett: 0.8,
  cobblestone: 0.7,
  unhewn_cobblestone: 0.6,
  grass_paver: 0.7,
}
