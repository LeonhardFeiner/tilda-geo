#!/usr/bin/env bun
/**
 * Interactive viewer: one HTML, stats.geojson, three-level region navigation.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateViewerHtml } from './generateViewerHtml'
import { buildRegionIndex } from './regionNavigation'
import type { StatsFeature } from './regionNavigation'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputRoot = join(scriptDir, 'output')
const viewerDir = join(outputRoot, 'viewer')

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

let manifest: Record<string, unknown> = { version: 2 }
if (existsSync(statsPath)) {
  const geojson = JSON.parse(readFileSync(statsPath, 'utf8')) as { features?: StatsFeature[] }
  const index = buildRegionIndex(geojson.features ?? [])
  manifest = {
    version: 2,
    deutschlandId: index.deutschlandId,
    kreisfreieStaedteIds: [...index.kreisfreieIds],
    stadtstaatIds: [...index.stadtstaaten.map((s) => s.id)],
    featureCount: geojson.features?.length ?? 0,
  }
}

writeFileSync(join(viewerDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const bundleTargets = [
  { entry: 'statsClassSums.bundle.ts', name: 'statsClassSums.js' },
  { entry: 'regionNavigation.bundle.ts', name: 'regionNavigation.js' },
] as const

for (const target of bundleTargets) {
  const bundleResult = await Bun.build({
    entrypoints: [join(scriptDir, target.entry)],
    outdir: viewerDir,
    naming: target.name,
    format: 'iife',
    minify: true,
  })
  if (!bundleResult.success) {
    for (const log of bundleResult.logs) process.stderr.write(`${log}\n`)
    process.exit(1)
  }
}

writeFileSync(join(viewerDir, 'index.html'), generateViewerHtml(new Date().toISOString()), 'utf8')

process.stdout.write(`Viewer: ${viewerDir}/index.html\n`)
process.stdout.write(
  `Needs:  ${join(outputRoot, 'stats.geojson')} (bun run bike-share-map:export-stats-geojson)\n`,
)
process.stdout.write(`Open:   cd ${viewerDir} && python3 -m http.server 8766\n`)
process.stdout.write(`URL params (all optional):\n`)
process.stdout.write(`  gebiet           deutschland | relation/… (Bundesland)\n`)
process.stdout.write(`  untergebiet      rb:… | lk:… | kreisfreie:… | stadt:…\n`)
process.stdout.write(`  darstellung      bundeslaender | landkreis_kreisfrei | gemeinden | …\n`)
process.stdout.write(`  minimal / ui     minimal=1 or ui=minimal hides the control panel\n`)
process.stdout.write(`  view / gebiet    legacy view ids still supported\n`)
process.stdout.write(`  basemap          blank | de | light | muted | osm\n`)
process.stdout.write(`  radwege / bikelanes   1 | 0\n`)
process.stdout.write(`  strassen / roads      1 | 0\n`)
process.stdout.write(`  ranking          open | 1 | 0\n`)
process.stdout.write(`  colors / palette / farbskala   green | traffic\n`)
