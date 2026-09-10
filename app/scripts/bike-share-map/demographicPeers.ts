import type { UrbanizationCode } from './fetchGemeindeDemographics'
import { bikelaneGapKm, computeViewBenchmark, type ViewBenchmarkStat } from './rankingDisplay'

/**
 * Compares a Gemeinde against demographic peers nationwide — same population band and
 * urbanization tier — instead of only its own Landkreis (sharePages.ts). A Landkreis mixes a
 * market town with its surrounding villages; this groups Schweitenkirchen against other small,
 * rural Gemeinden across Germany, closing off "we're just rural, of course we're behind".
 */

export type PopulationBand = { min: number; max: number; label: string }

/** Roughly log-scaled so bucket sizes stay usable at both ends (~80 to ~4000 Gemeinden each). */
export const POPULATION_BANDS: readonly PopulationBand[] = [
  { min: 0, max: 1000, label: 'unter 1.000' },
  { min: 1000, max: 2000, label: '1.000–2.000' },
  { min: 2000, max: 3000, label: '2.000–3.000' },
  { min: 3000, max: 5000, label: '3.000–5.000' },
  { min: 5000, max: 10000, label: '5.000–10.000' },
  { min: 10000, max: 20000, label: '10.000–20.000' },
  { min: 20000, max: 50000, label: '20.000–50.000' },
  { min: 50000, max: 100000, label: '50.000–100.000' },
  { min: 100000, max: Infinity, label: 'über 100.000' },
]

export function populationBandIndex(population: number): number {
  const idx = POPULATION_BANDS.findIndex((b) => population >= b.min && population < b.max)
  return idx === -1 ? POPULATION_BANDS.length - 1 : idx
}

/** Destatis' own wording for its "Grad der Verstädterung" (matches Eurostat DEGURBA). */
export const URBANIZATION_LABELS: Record<UrbanizationCode, string> = {
  '01': 'städtisch geprägt',
  '02': 'mittlere Bevölkerungsdichte',
  '03': 'ländlich geprägt',
}

export type PeerDemographics = { population: number; urbanizationCode: UrbanizationCode }

export function peerGroupKey(demo: PeerDemographics) {
  return `${demo.urbanizationCode}:${populationBandIndex(demo.population)}`
}

export function peerGroupLabel(demo: PeerDemographics) {
  const band = POPULATION_BANDS[populationBandIndex(demo.population)]!
  return `${URBANIZATION_LABELS[demo.urbanizationCode]}, ${band.label} Einwohner`
}

export type PeerGroupIndex = {
  /** peerGroupKey → human-readable group label. */
  groups: Record<string, string>
  /** region id → peerGroupKey; only regions with a demographics match. */
  byId: Record<string, string>
}

/**
 * Compact lookup shipped to the interactive viewer: which demographic-peer bucket each
 * Gemeinde belongs to. The ranking itself is done client-side from the already-loaded
 * stats, so this only needs the bucket assignment, not the numbers.
 */
export function buildPeerGroupIndex(
  regionRsById: ReadonlyMap<string, string>,
  demographicsByRs: ReadonlyMap<string, PeerDemographics>,
): PeerGroupIndex {
  const groups: Record<string, string> = {}
  const byId: Record<string, string> = {}
  for (const [id, rs] of regionRsById) {
    const demo = demographicsByRs.get(rs)
    if (!demo) continue
    const key = peerGroupKey(demo)
    byId[id] = key
    groups[key] ??= peerGroupLabel(demo)
  }
  return { groups, byId }
}

export type PeerRegionStat = {
  id: string
  roadSumKm: number
  bikelaneSumKm: number
  bikeSharePct: number | null
}

export type DemographicPeerSummary = {
  groupLabel: string
  rank: number
  total: number
  medianPct: number
  gapKm: number
  behind: boolean
}

/** Below this many peers, a rank/median comparison isn't meaningful — mirrors MIN_BENCHMARK_REGIONS in the viewer. */
const MIN_PEER_GROUP = 4

/**
 * One summary per region with a demographics match, ranked against every other German
 * Gemeinde in the same population band + urbanization tier (regardless of Landkreis/Bundesland).
 */
export function buildDemographicPeerSummaries<T extends PeerRegionStat>(
  regions: T[],
  demographicsByRs: ReadonlyMap<string, PeerDemographics>,
  rsById: ReadonlyMap<string, string>,
): Map<string, DemographicPeerSummary> {
  const groups = new Map<string, Array<T & { demo: PeerDemographics }>>()
  for (const r of regions) {
    const rs = rsById.get(r.id)
    const demo = rs ? demographicsByRs.get(rs) : undefined
    if (!demo) continue
    const key = peerGroupKey(demo)
    const entry = { ...r, demo }
    const list = groups.get(key)
    if (list) list.push(entry)
    else groups.set(key, [entry])
  }

  const out = new Map<string, DemographicPeerSummary>()
  for (const group of groups.values()) {
    if (group.length < MIN_PEER_GROUP) continue
    const first = group[0]
    if (!first) continue
    const bench = computeViewBenchmark(group as ViewBenchmarkStat[])
    if (!bench) continue
    const ranked = group
      .filter((r): r is typeof r & { bikeSharePct: number } => typeof r.bikeSharePct === 'number')
      .sort((a, b) => b.bikeSharePct - a.bikeSharePct)
    const rankById = new Map(ranked.map((r, i) => [r.id, i + 1]))
    const groupLabel = peerGroupLabel(first.demo)

    for (const r of ranked) {
      const rank = rankById.get(r.id)
      if (!rank) continue
      out.set(r.id, {
        groupLabel,
        rank,
        total: ranked.length,
        medianPct: bench.medianPct,
        gapKm: bikelaneGapKm(r, bench.medianPct),
        behind: r.bikeSharePct < bench.medianPct - 0.05,
      })
    }
  }
  return out
}
