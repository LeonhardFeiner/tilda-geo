import * as TildaStats from './statsClassSums'

;(globalThis as typeof globalThis & { TildaStats: typeof TildaStats }).TildaStats = TildaStats
