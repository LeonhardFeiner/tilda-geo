import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const formatDe = (date: Date) =>
  date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * "Stand" of the OSM data behind the stats, as dd.mm.yyyy. Prefers `osmDataFrom` that
 * export-stats-geojson copies from the processing DB's meta table into manifest.json; falls back to
 * the export file's mtime (= export day, not OSM day) for manifests written before that.
 */
export function readDataDateLabel(outputRoot: string) {
  const manifestPath = join(outputRoot, 'manifest.json')
  if (existsSync(manifestPath)) {
    const { osmDataFrom } = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      osmDataFrom?: string
    }
    const date = osmDataFrom ? new Date(osmDataFrom) : null
    if (date && !Number.isNaN(date.getTime())) return formatDe(date)
  }
  const geojsonPath = join(outputRoot, 'stats.geojson')
  return existsSync(geojsonPath) ? formatDe(statSync(geojsonPath).mtime) : ''
}
