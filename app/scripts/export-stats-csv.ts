#!/usr/bin/env bun
/**
 * Writes `public.aggregated_lengths` to an Excel-friendly **wide** CSV under
 * `scripts/stats-export/`. Every distinct `road_length` / `bikelane_length` JSON key
 * becomes its own column (`road_<key>`, `bikelane_<key>`); missing values are `0`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { geoDataClient } from '@/server/prisma-client.server'

type AggregatedRow = {
  id: string
  name: string | null
  level: string | null
  road_length: unknown
  bikelane_length: unknown
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
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

function headerName(prefix: 'road' | 'bikelane', key: string) {
  const safeKey = key.replaceAll('\r', '').replaceAll('\n', '_')
  return `${prefix}_${safeKey}`
}

async function main() {
  const rows = await geoDataClient.$queryRaw<AggregatedRow[]>`
    SELECT id, name, level, road_length, bikelane_length
    FROM public.aggregated_lengths
    ORDER BY (level)::int NULLS LAST, name NULLS LAST
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

  const roadCols = [...roadKeys].sort((a, b) => a.localeCompare(b))
  const bikelaneCols = [...bikelaneKeys].sort((a, b) => a.localeCompare(b))
  const valueHeaders = [
    ...roadCols.map((k) => headerName('road', k)),
    ...bikelaneCols.map((k) => headerName('bikelane', k)),
  ]

  const outDir = join(import.meta.dir, 'stats-export')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '')
  const outPath = join(outDir, `aggregated_lengths_wide_${stamp}.csv`)

  const header = ['id', 'name', 'level', ...valueHeaders]
  const lines = [header.map((h) => csvCell(h)).join(',')]

  for (const { row, road, bikelane } of parsed) {
    const base = [csvCell(row.id), csvCell(row.name ?? ''), csvCell(row.level ?? '')]
    const nums = [
      ...roadCols.map((k) => String(road[k] ?? 0)),
      ...bikelaneCols.map((k) => String(bikelane[k] ?? 0)),
    ]
    lines.push([...base, ...nums].join(','))
  }

  // UTF-8 BOM so Excel (Windows) opens umlauts in `name` correctly when double-clicking the file.
  writeFileSync(outPath, `\uFEFF${lines.join('\n')}\n`, 'utf8')
  process.stdout.write(`${outPath}\n`)
  await geoDataClient.$disconnect()
}

await main()
