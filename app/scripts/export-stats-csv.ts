#!/usr/bin/env bun
/**
 * Writes `public.aggregated_lengths` to a **radinfra.de /statistics.csv-compatible** wide CSV
 * under `scripts/stats-export/`: `;` delimiter, quoted cells, `bikelane_length_*`, `bikelane_sum_*`,
 * `id`, `level`, `levelKey`, `name`, `parentId`, `road_length_*`, `road_sum_*`, `updated_at`.
 *
 * Sum buckets match FixMyBerlin/radinfra.de (`cms/statistics/getRoadSums.ts`, `getBikelaneSums.ts`).
 * Admin levels 2–9 (see `aggregatedLengthsLevels.ts`). `parentId` from direct parent via spatial join.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { geoDataClient } from '@/server/prisma-client.server'
import { getBikelaneSums, getRoadSums } from './bike-share-map/statsClassSums'
import {
  fetchAggregatedLengthRows,
  levelKeyFor,
  parentIdFor,
} from './stats-export/aggregatedLengthsExport'

function flattenNumberRecord(prefix: string, obj: Record<string, number>) {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}_${k.replaceAll('\r', '').replaceAll('\n', '_')}`
    out[key] = Number.isFinite(v) ? String(v) : ''
  }
  return out
}

function escapeCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '""'
  const stringValue = String(value).replaceAll('"', '""')
  return `"${stringValue}"`
}

function asLengthMap(value: unknown) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

function lengthCellsForUnion(
  prefix: 'road_length' | 'bikelane_length',
  keys: string[],
  lengths: Record<string, number>,
) {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const col = `${prefix}_${k.replaceAll('\r', '').replaceAll('\n', '_')}`
    const v = lengths[k]
    out[col] = v !== undefined && Number.isFinite(v) ? String(v) : ''
  }
  return out
}

async function main() {
  const rows = await fetchAggregatedLengthRows()

  const roadKeys = new Set<string>()
  const bikelaneKeys = new Set<string>()
  const parsed = rows.map((r) => {
    const road = asLengthMap(r.road_length)
    const bikelane = asLengthMap(r.bikelane_length)
    for (const k of Object.keys(road)) roadKeys.add(k)
    for (const k of Object.keys(bikelane)) bikelaneKeys.add(k)
    return { row: r, road, bikelane }
  })

  const roadKeyList = [...roadKeys].sort((a, b) => a.localeCompare(b))
  const bikelaneKeyList = [...bikelaneKeys].sort((a, b) => a.localeCompare(b))

  const updatedAt = new Date().toISOString()

  const rowRecords: Record<string, string>[] = []
  for (const { row, road, bikelane } of parsed) {
    const roadSum = getRoadSums(road)
    const bikelaneSum = getBikelaneSums(bikelane)
    const rec: Record<string, string> = {
      id: row.id,
      level: row.level ?? '',
      levelKey: levelKeyFor(row.level),
      name: row.name ?? '',
      parentId: parentIdFor(row),
      parentName: row.parent_name ?? '',
      bundesland_id: row.bundesland_id ?? '',
      bundesland_name: row.bundesland_name ?? '',
      landkreis_id: row.landkreis_id ?? '',
      landkreis_name: row.landkreis_name ?? '',
      updated_at: updatedAt,
      ...lengthCellsForUnion('bikelane_length', bikelaneKeyList, bikelane),
      ...flattenNumberRecord('bikelane_sum', bikelaneSum),
      ...lengthCellsForUnion('road_length', roadKeyList, road),
      ...flattenNumberRecord('road_sum', roadSum),
    }
    rowRecords.push(rec)
  }

  const allKeys = new Set<string>()
  for (const rec of rowRecords) for (const k of Object.keys(rec)) allKeys.add(k)
  const sortedKeys = [...allKeys].sort((a, b) => a.localeCompare(b))

  const outDir = join(import.meta.dir, 'stats-export')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '')
  const outPath = join(outDir, `statistics_${stamp}.csv`)

  const csvRows = rowRecords.map((rec) =>
    sortedKeys.map((key) => escapeCsvValue(rec[key] ?? '')).join(';'),
  )
  const csvString = [sortedKeys.join(';'), ...csvRows].join('\n')

  writeFileSync(outPath, `\uFEFF${csvString}\n`, 'utf8')
  process.stdout.write(`${outPath} (${rows.length} rows)\n`)

  const byLevel = new Map<string, number>()
  for (const row of rows) {
    const level = row.level ?? '?'
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1)
  }
  for (const level of [...byLevel.keys()].sort((a, b) => Number(a) - Number(b))) {
    process.stdout.write(`  level ${level}: ${byLevel.get(level)} rows\n`)
  }

  await geoDataClient.$disconnect()
}

await main()
