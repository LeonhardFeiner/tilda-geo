/**
 * Shared plumbing for the `fetch*.ts` / context scripts that write `output/*.json`.
 *
 * Every dataset gets the same provenance fields, and a run that suddenly yields far fewer rows
 * than the file it replaces (an upstream sheet renamed, a column moved, a DB query that silently
 * matched nothing) fails instead of overwriting good data with an empty file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))

export const OUTPUT_DIR = join(scriptDir, 'output')

/** Raw upstream downloads (xlsx, zip). Gitignored; survives reboots, unlike /tmp. */
export const DOWNLOAD_CACHE_DIR = join(scriptDir, 'cache')

export function downloadCachePath(fileName: string) {
  mkdirSync(DOWNLOAD_CACHE_DIR, { recursive: true })
  return join(DOWNLOAD_CACHE_DIR, fileName)
}

/** The OSM extract the current stats were built from (output/manifest.json), if known. */
export function currentOsmDataFrom(): string | null {
  const path = join(OUTPUT_DIR, 'manifest.json')
  if (!existsSync(path)) return null
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { osmDataFrom?: string }).osmDataFrom ?? null
  } catch {
    return null
  }
}

/** Below this share of the previous row count a new run is treated as broken. */
export const MAX_SHRINK_RATIO = 0.8

/**
 * Throws when `count` is below `minCount`, or below 80 % of the file being replaced. Set
 * BIKE_SHARE_ALLOW_SHRINK=1 to accept a real drop on purpose.
 */
export function assertDatasetCount(
  label: string,
  count: number,
  previousCount: number | null,
  minCount: number,
  allowShrink = process.env.BIKE_SHARE_ALLOW_SHRINK === '1',
) {
  if (count < minCount) {
    throw new Error(`${label}: only ${count} rows, expected at least ${minCount}. Not written.`)
  }
  if (!allowShrink && previousCount && count < previousCount * MAX_SHRINK_RATIO) {
    throw new Error(
      `${label}: ${count} rows, the file it would replace has ${previousCount} ` +
        `(−${Math.round((1 - count / previousCount) * 100)} %). Not written; ` +
        'set BIKE_SHARE_ALLOW_SHRINK=1 if the drop is real.',
    )
  }
}

type Payload = Record<string, unknown>

const defaultCount = (p: Payload) => {
  const rows = p.byId ?? p.gemeinden ?? p.stations
  return Array.isArray(rows)
    ? rows.length
    : rows && typeof rows === 'object'
      ? Object.keys(rows).length
      : 0
}

/**
 * Writes `payload` plus `fetchedAt` (or `aggregatedAt` for derived files) and the `osmDataFrom`
 * the stats were built from, after checking the row count against `minCount` and the old file.
 */
export function writeDataset(
  path: string,
  payload: Payload,
  opts: {
    minCount: number
    count?: (p: Payload) => number
    /** Derived files keep the upstream `fetchedAt` they were built from. */
    stamp?: 'fetchedAt' | 'aggregatedAt'
    pretty?: boolean
  },
) {
  const count = (opts.count ?? defaultCount)(payload)
  let previousCount: number | null = null
  if (existsSync(path)) {
    try {
      previousCount = (opts.count ?? defaultCount)(
        JSON.parse(readFileSync(path, 'utf8')) as Payload,
      )
    } catch {
      previousCount = null
    }
  }
  assertDatasetCount(path.split('/').pop() ?? path, count, previousCount, opts.minCount)
  const stamped = {
    ...payload,
    [opts.stamp ?? 'fetchedAt']: new Date().toISOString(),
    osmDataFrom: payload.osmDataFrom ?? currentOsmDataFrom(),
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, opts.pretty ? JSON.stringify(stamped, null, 2) : JSON.stringify(stamped))
  return count
}
