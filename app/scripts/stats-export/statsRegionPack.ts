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
