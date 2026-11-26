import { join } from 'node:path'
import { $ } from 'bun'
import { logEnd, logStart } from '../../utils/logging'
import { toIsoWindow } from '../metadata'
import { afterthoughtSkipped } from './types'

const LOG_PREFIX = '[Afterthoughts][Statistics]'

/**
 * Afterthought: aggregate road and bikelane lengths per boundary into public.aggregated_lengths.
 * Called after Processing: Finished; feeds the app's /api/stats and region statistics UI.
 */
export async function aggregateLengths() {
  const sqlFile = join(import.meta.dir, 'sql', 'aggregate_lengths.sql')
  // Fork-only (bike-share-map): bike infra per road class / road authority.
  const byRoadSqlFile = join(import.meta.dir, 'sql', 'aggregate_lengths_by_road.sql')
  // Fork-only (bike-share-map): extra km when paths without a direction tag count both ways
  // away from roads and outside settlements. Needs public._settlement_areas (landcover topic).
  const likelySqlFile = join(import.meta.dir, 'sql', 'aggregate_lengths_likely.sql')
  const start = new Date()

  try {
    logStart('Afterthoughts: Statistics')
    await $`psql -v ON_ERROR_STOP=1 -f ${sqlFile}`
    await $`psql -v ON_ERROR_STOP=1 -f ${byRoadSqlFile}`
    await aggregateLikelyLengths(likelySqlFile)
    logEnd('Afterthoughts: Statistics')
    return toIsoWindow(start, new Date())
  } catch (error) {
    console.warn(`${LOG_PREFIX} WARN: aggregation failed — continuing.`, error)
    return afterthoughtSkipped('failed')
  }
}

/** Its own failure (or missing settlement areas) leaves the main statistics intact. */
async function aggregateLikelyLengths(sqlFile: string) {
  try {
    const present =
      await $`psql -Atc ${"SELECT to_regclass('public._settlement_areas') IS NOT NULL"}`.text()
    if (present.trim() !== 't') {
      console.warn(
        `${LOG_PREFIX} aggregated_lengths_likely skipped: no public._settlement_areas (run PROCESS_ONLY_TOPICS=landcover once).`,
      )
      return
    }
    await $`psql -v ON_ERROR_STOP=1 -f ${sqlFile}`
  } catch (error) {
    console.warn(`${LOG_PREFIX} WARN: aggregated_lengths_likely failed — continuing.`, error)
  }
}
