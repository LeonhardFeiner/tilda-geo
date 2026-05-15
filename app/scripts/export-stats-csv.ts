#!/usr/bin/env bun
/**
 * Writes `public.aggregated_lengths` to a **radinfra.de /statistics.csv-compatible** wide CSV
 * under `scripts/stats-export/`: `;` delimiter, quoted cells, `bikelane_length_*`, `bikelane_sum_*`,
 * `id`, `level`, `levelKey`, `name`, `parentId`, `road_length_*`, `road_sum_*`, `updated_at`.
 *
 * Sum buckets match FixMyBerlin/radinfra.de (`cms/statistics/getRoadSums.ts`, `getBikelaneSums.ts`).
 * `levelKey`: `bund` (4), `landkreis` (6), `gemeinde` (8). `parentId`: Bundesland id for Kreise,
 * Landkreis id for Gemeinden (spatial joins on `aggregated_lengths` geoms).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { geoDataClient } from '@/server/prisma-client.server'
import { getBikelaneSums, getRoadSums } from './bike-share-map/statsClassSums'

type AggregatedRow = {
  id: string
  name: string | null
  level: string | null
  bundesland_id: string | null
  bundesland_name: string | null
  landkreis_id: string | null
  landkreis_name: string | null
  road_length: unknown
  bikelane_length: unknown
}

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

function levelKeyFor(level: string | null) {
  if (level === '4') return 'bund'
  if (level === '6') return 'landkreis'
  if (level === '8') return 'gemeinde'
  return ''
}

function parentIdFor(row: AggregatedRow) {
  if (row.level === '6') return row.bundesland_id ?? ''
  if (row.level === '8') return row.landkreis_id ?? ''
  return ''
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
  const rows = await geoDataClient.$queryRaw<AggregatedRow[]>`
    SELECT
      a.id,
      a.name,
      a.level,
      bl.id AS bundesland_id,
      bl.name AS bundesland_name,
      lk.id AS landkreis_id,
      lk.name AS landkreis_name,
      a.road_length,
      a.bikelane_length
    FROM public.aggregated_lengths a
    LEFT JOIN LATERAL (
      SELECT b.id, b.name
      FROM public.aggregated_lengths b
      WHERE
        b.level = '4'
        AND a.level IN ('6', '8')
        AND ST_Contains(
          ST_MakeValid(b.geom),
          ST_PointOnSurface(ST_MakeValid(a.geom))
        )
      LIMIT 1
    ) bl ON TRUE
    LEFT JOIN LATERAL (
      SELECT b.id, b.name
      FROM public.aggregated_lengths b
      WHERE
        b.level = '6'
        AND a.level = '8'
        AND ST_Contains(
          ST_MakeValid(b.geom),
          ST_PointOnSurface(ST_MakeValid(a.geom))
        )
      ORDER BY ST_Area(b.geom) ASC NULLS LAST
      LIMIT 1
    ) lk ON TRUE
    ORDER BY (a.level)::int NULLS LAST, a.name NULLS LAST
  `

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
  process.stdout.write(`${outPath}\n`)
  await geoDataClient.$disconnect()
}

await main()
