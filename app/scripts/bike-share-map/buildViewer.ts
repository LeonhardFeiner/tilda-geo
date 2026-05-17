#!/usr/bin/env bun
/**
 * Interactive viewer: one HTML, stats.geojson, switch region / basemap / overlay layers.
 */
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_STATS_CSV } from './constants'
import { generateViewerHtml } from './generateViewerHtml'
import { gemeindeIdsForLandkreisFromCsv } from './parseStats'
import { listLandkreiseFromCsv, type LandkreisRef } from './resolveLandkreis'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputRoot = join(scriptDir, 'output')
const viewerDir = join(outputRoot, 'viewer')

const statsCsv = process.argv.includes('--stats-csv')
  ? process.argv[process.argv.indexOf('--stats-csv') + 1]!
  : fileURLToPath(DEFAULT_STATS_CSV)

const allLevel6 = listLandkreiseFromCsv(statsCsv)
const landkreise: LandkreisRef[] = []
const kreisfreieStaedte: LandkreisRef[] = []
for (const lk of allLevel6) {
  if (gemeindeIdsForLandkreisFromCsv(statsCsv, lk.id).size === 0) {
    kreisfreieStaedte.push(lk)
  } else {
    landkreise.push(lk)
  }
}

mkdirSync(viewerDir, { recursive: true })

const statsPath = join(outputRoot, 'stats.geojson')
const viewerStatsLink = join(viewerDir, 'stats.geojson')
if (!existsSync(statsPath)) {
  process.stderr.write(
    `Warning: ${statsPath} missing – run: bun run bike-share-map:export-stats-geojson\n`,
  )
} else {
  if (existsSync(viewerStatsLink)) {
    try {
      if (lstatSync(viewerStatsLink).isSymbolicLink()) unlinkSync(viewerStatsLink)
    } catch {
      /* keep existing copy */
    }
  }
  if (!existsSync(viewerStatsLink)) {
    symlinkSync('../stats.geojson', viewerStatsLink)
  }
}

const manifest = {
  bayernId: 'relation/2145268',
  kreisfreieStaedteIds: kreisfreieStaedte.map((lk) => lk.id),
  views: [
    {
      id: 'bayern-landkreise-kreisfreie',
      label: 'Landkreise + kreisfreie Städte',
      group: 'overview',
    },
    {
      id: 'bayern-gemeinden-kreisfreie',
      label: 'Gemeinden + kreisfreie Städte',
      group: 'overview',
    },
    { id: 'bayern-landkreise', label: 'Alle Landkreise', group: 'overview' },
    { id: 'bayern-kreisfreie-staedte', label: 'Alle kreisfreien Städte', group: 'overview' },
    { id: 'bayern-gemeinden', label: 'Alle Gemeinden', group: 'overview' },
    ...landkreise.map((lk) => ({
      id: `landkreis:${lk.id}`,
      label: lk.name,
      group: 'landkreis',
    })),
    ...kreisfreieStaedte.map((lk) => ({
      id: `kreisfrei:${lk.id}`,
      label: lk.name,
      group: 'kreisfrei',
    })),
  ],
}

writeFileSync(
  join(outputRoot, 'landkreise.json'),
  `${JSON.stringify(landkreise, null, 2)}\n`,
  'utf8',
)
writeFileSync(
  join(outputRoot, 'kreisfreie-staedte.json'),
  `${JSON.stringify(kreisfreieStaedte, null, 2)}\n`,
  'utf8',
)
writeFileSync(join(viewerDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const bundleResult = await Bun.build({
  entrypoints: [join(scriptDir, 'statsClassSums.bundle.ts')],
  outdir: viewerDir,
  naming: 'statsClassSums.js',
  format: 'iife',
  minify: true,
})
if (!bundleResult.success) {
  for (const log of bundleResult.logs) process.stderr.write(`${log}\n`)
  process.exit(1)
}

writeFileSync(join(viewerDir, 'index.html'), generateViewerHtml(new Date().toISOString()), 'utf8')

process.stdout.write(`Viewer: ${viewerDir}/index.html\n`)
process.stdout.write(
  `Needs:  ${join(outputRoot, 'stats.geojson')} (bun run bike-share-map:export-stats-geojson)\n`,
)
process.stdout.write(`Open:   cd ${viewerDir} && python3 -m http.server 8766\n`)
process.stdout.write(`URL params (all optional):\n`)
process.stdout.write(
  `  view / gebiet     e.g. bayern-gemeinden-kreisfreie, landkreis:relation/62371\n`,
)
process.stdout.write(`  basemap          blank | de | light | muted | osm\n`)
process.stdout.write(`  radwege / bikelanes   1 | 0\n`)
process.stdout.write(`  strassen / roads      1 | 0\n`)
process.stdout.write(`  ranking          open | 1 | 0\n`)
process.stdout.write(`  colors / palette / farbskala   green | traffic\n`)
process.stdout.write(`  radfarbe / bikelaneColor       hex, e.g. b71c1c or #b71c1c\n`)
process.stdout.write(`  strassenfarbe / roadColor      hex, e.g. 78909c\n`)
process.stdout.write(`  radwegeMinZoom                 Radwege min zoom (4–14)\n`)
process.stdout.write(
  `  strassenMinZoomMajor / Full    Straßen Haupt (4–14) / Wohn (11–14, Kachel-Limit)\n`,
)
process.stdout.write(`  roadClasses / bikelaneClasses  comma-separated class ids (Zählung)\n`)
