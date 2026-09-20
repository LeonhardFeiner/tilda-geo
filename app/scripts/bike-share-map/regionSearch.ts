import {
  isKreisfrei,
  isStadtstaatGebiet,
  type RegionIndex,
  type StatsFeature,
} from './regionNavigation'
import { sumLengthRecord } from './statsClassSums'

/**
 * Bundesländer, Landkreise/kreisfreie Städte and Gemeinden — the levels people search by name.
 * Deliberately not the lazy-loaded Gemeindeverbände/Stadtbezirke: including them would make the
 * list wait on a background fetch, for names almost nobody types.
 */
export const REGION_SEARCH_LEVELS = new Set(['4', '6', '8'])

export type RegionSearchEntry = {
  id: string
  name: string
  level: string
  /** Disambiguates the 11 Gemeinden called "Neuenkirchen" and the 16 names used on two levels. */
  parentName: string
  /** Total road length as a size proxy, to break ties towards the region people likely meant. */
  size: number
}

export type RankedRegionMatch = RegionSearchEntry & { score: number }

/** Exact name beats a prefix beats a word start beats a match in the middle of a word. */
export const MATCH_EXACT = 4
export const MATCH_PREFIX = 3
export const MATCH_WORD_START = 2
export const MATCH_SUBSTRING = 1
export const MATCH_NONE = 0

const UMLAUT_EXPANSIONS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** "Landkreis Neustadt …" should also be found by typing just "Neustadt". */
const ADMIN_PREFIX = /^(landkreis|kreis|stadtkreis|stadt|region|regionalverband|hansestadt)\s+/

const WORD_BOUNDARY = /[\s\-–/(),.]/

/**
 * Both German spellings of a name, because people type either: "muenchen" (ü → ue) and
 * "munchen" (accent dropped). A single normal form would answer one of them with nothing.
 * Admin prefixes are stripped into extra keys rather than replacing the full name, so
 * "Landkreis Rosenheim" still matches a search for "landkreis".
 */
export function regionSearchKeys(value: string) {
  const lowered = value.toLowerCase().trim()
  const expanded = lowered.replace(/[äöüß]/g, (c) => UMLAUT_EXPANSIONS[c] ?? c)
  const stripped = lowered
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
  const spellings = [expanded, stripped]
  const keys = new Set(spellings)
  for (const key of spellings) {
    const withoutPrefix = key.replace(ADMIN_PREFIX, '')
    if (withoutPrefix && withoutPrefix !== key) keys.add(withoutPrefix)
  }
  return [...keys]
}

export function scoreRegionMatch(entryKeys: string[], queryKeys: string[]) {
  let best = MATCH_NONE
  for (const entry of entryKeys) {
    for (const query of queryKeys) {
      if (!query) continue
      if (entry === query) return MATCH_EXACT
      if (entry.startsWith(query)) {
        best = Math.max(best, MATCH_PREFIX)
        continue
      }
      const at = entry.indexOf(query)
      if (at < 0) continue
      const wordStart = WORD_BOUNDARY.test(entry[at - 1] ?? '')
      best = Math.max(best, wordStart ? MATCH_WORD_START : MATCH_SUBSTRING)
    }
  }
  return best
}

function parentNameFor(f: StatsFeature, index: RegionIndex) {
  const props = f.properties ?? {}
  const level = String(props.level ?? '')
  const parentId =
    level === '8'
      ? String(props.landkreis_id ?? props.parent_id ?? '')
      : level === '6'
        ? String(props.bundesland_id ?? props.parent_id ?? '')
        : ''
  if (!parentId) return ''
  return String(index.byId.get(parentId)?.properties?.name ?? '')
}

/**
 * Mirrors what resolveFocusContext needs to place a region. 45 features fail it: border
 * municipalities that OSM spills over the national boundary (Słubice, Lauterbourg, Riehen,
 * Schärding, …) and "Küstengewässer", none of which carry a Bundesland. There is no view that
 * can show them, so listing them would only offer a result that does nothing when clicked.
 */
function canBeShown(props: StatsFeature['properties'], level: string) {
  if (level === '4') return true
  if (!props?.bundesland_id) return false
  return level !== '8' || !!props.landkreis_id
}

export function buildRegionSearchEntries(features: StatsFeature[], index: RegionIndex) {
  const byId = new Map<string, RegionSearchEntry>()
  for (const f of features) {
    const props = f.properties ?? {}
    const level = String(props.level ?? '')
    if (!REGION_SEARCH_LEVELS.has(level)) continue
    if (!canBeShown(props, level)) continue
    const id = String(props.id ?? '')
    const name = String(props.name ?? '')
    if (!id || !name) continue
    byId.set(id, {
      id,
      name,
      level,
      parentName: parentNameFor(f, index),
      size: sumLengthRecord(props.road_length),
    })
  }
  return [...byId.values()]
}

/** Coarse levels first, so a Landkreis outranks a Gemeinde that merely contains the string. */
function levelRank(level: string) {
  const parsed = Number(level)
  return Number.isFinite(parsed) ? parsed : 99
}

function compareMatches(a: RankedRegionMatch, b: RankedRegionMatch) {
  if (a.score !== b.score) return b.score - a.score
  const levels = levelRank(a.level) - levelRank(b.level)
  if (levels !== 0) return levels
  if (a.size !== b.size) return b.size - a.size
  return a.name.localeCompare(b.name, 'de')
}

/**
 * `perLevel` keeps one level from swallowing the whole list — "Neustadt" matches 22 regions, of
 * which 20 are Gemeinden, and without a cap the two Landkreise never appear. Slots left over
 * after the cap are refilled in plain rank order, so a query that only matches Gemeinden still
 * shows a full list.
 */
export function rankRegionSearchMatches(
  entries: RegionSearchEntry[],
  query: string,
  options?: { limit?: number; perLevel?: number },
) {
  const trimmed = query.trim()
  if (!trimmed) return []
  const limit = options?.limit ?? 8
  const perLevel = options?.perLevel ?? 4
  const queryKeys = regionSearchKeys(trimmed)

  const scored: RankedRegionMatch[] = []
  for (const entry of entries) {
    const score = scoreRegionMatch(regionSearchKeys(entry.name), queryKeys)
    if (score === MATCH_NONE) continue
    scored.push({ ...entry, score })
  }
  scored.sort(compareMatches)

  const picked: RankedRegionMatch[] = []
  const overflow: RankedRegionMatch[] = []
  const perLevelCount = new Map<string, number>()
  for (const match of scored) {
    if (picked.length >= limit && overflow.length >= limit) break
    const used = perLevelCount.get(match.level) ?? 0
    if (perLevel > 0 && used >= perLevel) {
      overflow.push(match)
      continue
    }
    perLevelCount.set(match.level, used + 1)
    if (picked.length < limit) picked.push(match)
  }
  for (const match of overflow) {
    if (picked.length >= limit) break
    picked.push(match)
  }
  return picked.sort(compareMatches)
}

export function regionSearchLevelLabel(level: string, id: string, index: RegionIndex | null) {
  if (level === '4') return isStadtstaatGebiet(id) ? 'Stadtstaat' : 'Bundesland'
  if (level === '6') return index && isKreisfrei(id, index) ? 'Kreisfreie Stadt' : 'Landkreis'
  return 'Gemeinde'
}
