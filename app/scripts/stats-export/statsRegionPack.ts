import { decode, encode } from '@msgpack/msgpack'
import type { StatsFeature } from '../bike-share-map/regionNavigation'

export const STATS_REGION_PACK_VERSION = 1

export type StatsRegionPack = {
  version: typeof STATS_REGION_PACK_VERSION
  features: StatsFeature[]
}

export function encodeStatsRegionPack(features: StatsFeature[]) {
  const pack = { version: STATS_REGION_PACK_VERSION, features } satisfies StatsRegionPack
  return encode(pack)
}

export function decodeStatsRegionPack(bytes: Uint8Array) {
  const data = decode(bytes) as Partial<StatsRegionPack>
  if (data.version !== STATS_REGION_PACK_VERSION || !Array.isArray(data.features)) {
    throw new Error('Ungültiges stats.msgpack (Version oder features fehlen)')
  }
  return data.features
}

/**
 * Admin levels split into a separate pack: Gemeindeverbände (7) and Stadtbezirke (9) power two
 * niche Darstellung dropdown options that most visits never touch, yet make up ~40% of the
 * combined payload (mostly geometry for ~11k Stadtbezirke). Splitting them out means the first
 * paint no longer blocks on them — the viewer fetches this pack in the background right after
 * the core one, instead of bundling it into the initial download everyone pays for up front.
 */
export const LAZY_STATS_LEVELS: ReadonlySet<string> = new Set(['7', '9'])

export function splitStatsFeaturesByLevel(features: StatsFeature[]) {
  const core: StatsFeature[] = []
  const extra: StatsFeature[] = []
  for (const f of features) {
    ;(LAZY_STATS_LEVELS.has(String(f.properties?.level ?? '')) ? extra : core).push(f)
  }
  return { core, extra }
}
