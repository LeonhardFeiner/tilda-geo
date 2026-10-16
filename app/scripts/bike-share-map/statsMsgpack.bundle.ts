import { decodeStatsRegionPack, gemeindeGeometryShardKey } from '../stats-export/statsRegionPack'

;(
  globalThis as typeof globalThis & {
    StatsPack: {
      decodeRegionFeatures: typeof decodeStatsRegionPack
      gemeindeGeometryShardKey: typeof gemeindeGeometryShardKey
    }
  }
).StatsPack = { decodeRegionFeatures: decodeStatsRegionPack, gemeindeGeometryShardKey }
