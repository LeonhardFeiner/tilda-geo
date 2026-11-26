import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const formatDe = (date: Date) =>
  date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * "Stand" of the OSM data behind the stats, as dd.mm.yyyy. Prefers `osmDataFrom` that
 * export-stats-geojson copies from the processing DB's meta table into manifest.json; falls back to
 * the export file's mtime (= export day, not OSM day) for manifests written before that.
 * A hand patch of newer OSM edits (`osmCorrections`) is named: "23.11.2026 + Korrekturen bis …".
 */
export function readDataDateLabel(outputRoot: string) {
  const manifestPath = join(outputRoot, 'manifest.json')
  if (existsSync(manifestPath)) {
    const { osmDataFrom, osmCorrections } = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      osmDataFrom?: string
      osmCorrections?: { until?: string | null }
    }
    const date = osmDataFrom ? new Date(osmDataFrom) : null
    if (date && !Number.isNaN(date.getTime())) {
      const until = osmCorrections?.until ? new Date(osmCorrections.until) : null
      return until && !Number.isNaN(until.getTime())
        ? `${formatDe(date)} + Korrekturen bis ${formatDe(until)}`
        : formatDe(date)
    }
  }
  const geojsonPath = join(outputRoot, 'stats.geojson')
  return existsSync(geojsonPath) ? formatDe(statSync(geojsonPath).mtime) : ''
}
