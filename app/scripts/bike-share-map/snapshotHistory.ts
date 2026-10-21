/**
 * Change over time from our own data releases. Every viewer build stores a snapshot (road and
 * bike km per region, radinfra.de default filter) per OSM data date in output/history/, which is
 * committed — GitHub Pages keeps no old versions. Only snapshots with the same COUNTING_VERSION
 * are compared: a change in how lengths are measured must never show up as a change on the
 * ground (the reason ohsome trends were dropped).
 */
import { computeFilteredLengths, RADINFRA_DEFAULT_FILTER } from './statsClassSums'

/**
 * Bump when aggregate_lengths.sql or the length classes change what a km means. Since
 * 2026-10-16 lengths are split by share at boundaries and kept fractional (135a33405).
 */
export const COUNTING_VERSION = 'share-2026-10'

/** A change is shown only against a snapshot at least this much older than the current one. */
export const MIN_HISTORY_DAYS = 14

export type Snapshot = {
  osmDataFrom: string
  countingVersion: string
  /** region id → [road km, bike km] under the default counting filter. */
  byId: Record<string, [number, number]>
}

export type History = {
  countingVersion: string
  /** OSM data dates, oldest first. */
  dates: string[]
  /** region id → per date [road km, bike km], or null where the region was missing. */
  byId: Record<string, Array<[number, number] | null>>
}

type LengthFeature = {
  properties?: { id?: string; road_length?: unknown; bikelane_length?: unknown }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

export function snapshotFromFeatures(features: LengthFeature[], osmDataFrom: string): Snapshot {
  const byId: Snapshot['byId'] = {}
  for (const f of features) {
    const p = f.properties
    if (!p?.id) continue
    const { roadKm, bikeKm } = computeFilteredLengths(
      p.road_length,
      p.bikelane_length,
      RADINFRA_DEFAULT_FILTER,
    )
    if (roadKm > 0 || bikeKm > 0) byId[p.id] = [r3(roadKm), r3(bikeKm)]
  }
  return { osmDataFrom, countingVersion: COUNTING_VERSION, byId }
}

/** The comparable snapshots (current counting version), merged oldest first. */
export function mergeHistory(snapshots: Snapshot[]): History {
  const comparable = snapshots
    .filter((s) => s.countingVersion === COUNTING_VERSION)
    .sort((a, b) => a.osmDataFrom.localeCompare(b.osmDataFrom))
  const byId: History['byId'] = {}
  comparable.forEach((s, i) => {
    for (const [id, v] of Object.entries(s.byId)) {
      byId[id] ??= Array.from({ length: comparable.length }, () => null)
      byId[id][i] = v
    }
  })
  return { countingVersion: COUNTING_VERSION, dates: comparable.map((s) => s.osmDataFrom), byId }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Change of a region from the oldest comparable snapshot to the newest, or null while no snapshot
 * is at least MIN_HISTORY_DAYS older (a few days' difference is mapping noise, not news).
 */
export function changeSinceFirst(history: History, id: string) {
  const series = history.byId[id]
  if (!series) return null
  const last = history.dates.length - 1
  const current = series[last]
  if (!current) return null
  const firstIndex = series.findIndex((v) => v != null)
  if (firstIndex < 0 || firstIndex === last) return null
  const first = series[firstIndex]!
  const days = (Date.parse(history.dates[last]!) - Date.parse(history.dates[firstIndex]!)) / DAY_MS
  if (!(days >= MIN_HISTORY_DAYS)) return null
  const pct = ([road, bike]: [number, number]) => (road > 0 ? (bike / road) * 100 : 0)
  return {
    sinceDate: history.dates[firstIndex]!,
    days: Math.round(days),
    bikeKmDelta: current[1] - first[1],
    pctPointsDelta: pct(current) - pct(first),
  }
}
