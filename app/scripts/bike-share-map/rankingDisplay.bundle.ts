import * as RankingDisplay from './rankingDisplay'

;(globalThis as typeof globalThis & { RankingDisplay: typeof RankingDisplay }).RankingDisplay =
  RankingDisplay
