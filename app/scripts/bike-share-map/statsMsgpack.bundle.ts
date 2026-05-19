import { decodeStatsRegionPack } from '../stats-export/statsRegionPack'

;(
  globalThis as typeof globalThis & {
    StatsPack: { decodeRegionFeatures: typeof decodeStatsRegionPack }
  }
).StatsPack = { decodeRegionFeatures: decodeStatsRegionPack }
