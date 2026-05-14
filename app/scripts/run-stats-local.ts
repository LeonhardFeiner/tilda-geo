#!/usr/bin/env bun
/**
 * Local stats pipeline: register SQL helpers (generalization), then run analysis
 * (`aggregateLengths` → `public.aggregated_lengths`). Requires Postgres with
 * `public.boundaries`, `public.roads`, and `public.bikelanes` (e.g. after processing).
 */
import { registerSQLFunctions } from '@/server/instrumentation/registerSQLFunctions.server'
import { analysis } from '@/server/statistics/analysis/analysis.server'

await registerSQLFunctions()
await analysis()
console.log('Stats pipeline finished (aggregated_lengths updated if source tables exist).')
