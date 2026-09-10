#!/usr/bin/env bun
/**
 * Interactive viewer: stats.msgpack + neighbors + HTML.
 */
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateViewerHtml } from './generateViewerHtml'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputRoot = join(scriptDir, 'output')
const viewerDir = join(outputRoot, 'viewer')

mkdirSync(viewerDir, { recursive: true })

const msgpackPath = join(outputRoot, 'stats.msgpack')
const neighborsMsgpackPath = join(outputRoot, 'neighbors.msgpack')
const neighborsJsonPath = join(outputRoot, 'neighbors.json')
const manifestPath = join(outputRoot, 'manifest.json')
const geojsonPath = join(outputRoot, 'stats.geojson')

function symlinkOutputFile(sourcePath: string, linkPath: string) {
  if (!existsSync(sourcePath)) return false
  if (existsSync(linkPath)) {
    try {
      if (lstatSync(linkPath).isSymbolicLink()) unlinkSync(linkPath)
    } catch {
      /* keep existing copy */
    }
  }
  if (!existsSync(linkPath)) symlinkSync(`../${basename(sourcePath)}`, linkPath)
  return true
}

if (!symlinkOutputFile(msgpackPath, join(viewerDir, 'stats.msgpack'))) {
  process.stderr.write(
    `Warning: ${msgpackPath} missing – run: bun run bike-share-map:export-stats-geojson\n`,
  )
}
const hasNeighborsMsgpack = symlinkOutputFile(
  neighborsMsgpackPath,
  join(viewerDir, 'neighbors.msgpack'),
)
symlinkOutputFile(neighborsJsonPath, join(viewerDir, 'neighbors.json'))
if (!hasNeighborsMsgpack) {
  process.stderr.write(
    `Warning: ${neighborsMsgpackPath} missing – Nachbar-Ansichten brauchen: bun run bike-share-map:export-stats-geojson\n`,
  )
}
symlinkOutputFile(manifestPath, join(viewerDir, 'manifest.json'))
symlinkOutputFile(geojsonPath, join(viewerDir, 'stats.geojson'))

const bundleTargets = [
  { entry: 'statsClassSums.bundle.ts', name: 'statsClassSums.js' },
  { entry: 'regionNavigation.bundle.ts', name: 'regionNavigation.js' },
  { entry: 'simpleView.bundle.ts', name: 'simpleView.js' },
  { entry: 'statsMsgpack.bundle.ts', name: 'statsMsgpack.js' },
  { entry: 'rankingDisplay.bundle.ts', name: 'rankingDisplay.js' },
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

for (const workerEntry of [
  'statsMsgpack.worker.ts',
  'neighbors.worker.ts',
  'neighborsBuild.worker.ts',
] as const) {
  const workerBundle = await Bun.build({
    entrypoints: [join(scriptDir, workerEntry)],
    outdir: viewerDir,
    naming: workerEntry.replace('.ts', '.js'),
    format: 'esm',
    minify: true,
  })
  if (!workerBundle.success) {
    for (const log of workerBundle.logs) process.stderr.write(`${log}\n`)
    process.exit(1)
  }
}

writeFileSync(join(viewerDir, 'index.html'), generateViewerHtml(new Date().toISOString()), 'utf8')

process.stdout.write(`Viewer: ${viewerDir}/index.html\n`)
process.stdout.write(`Needs:  ${msgpackPath} (bun run bike-share-map:export-stats-geojson)\n`)
process.stdout.write(`Open:   cd ${viewerDir} && python3 -m http.server 8766\n`)
process.stdout.write(`URL params (all optional):\n`)
process.stdout.write(`  gebiet           deutschland | relation/… (Bundesland)\n`)
process.stdout.write(`  untergebiet      rb:… | lk:… | kreisfreie:… | stadt:…\n`)
process.stdout.write(`  darstellung      bundeslaender | landkreis_kreisfrei | gemeinden | …\n`)
process.stdout.write(`  minimal / ui     minimal=1 or ui=minimal hides the control panel\n`)
process.stdout.write(`  ui=simple       simplified view (focus= relation id, simple= preset id)\n`)
process.stdout.write(
  `  region           relation/… – preselect that region's detail card on load\n`,
)
process.stdout.write(`  view / gebiet    legacy view ids still supported\n`)
process.stdout.write(`  basemap          blank | de | light | muted | osm\n`)
process.stdout.write(`  radwege / bikelanes   1 | 0\n`)
process.stdout.write(`  strassen / roads      1 | 0\n`)
process.stdout.write(`  ranking          open | 1 | 0\n`)
process.stdout.write(`  colors / palette / farbskala   green | traffic | colorblind\n`)
