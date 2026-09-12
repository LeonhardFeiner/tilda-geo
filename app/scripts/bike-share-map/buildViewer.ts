#!/usr/bin/env bun
/**
 * Interactive viewer: stats.msgpack + neighbors + HTML.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decodeStatsRegionPack,
  encodeStatsRegionPack,
  splitStatsFeaturesByLevel,
} from '../stats-export/statsRegionPack'
import { PROJECT_LEAD, VIEWER_SOURCE_REPO_URL } from './constants'
import { buildPeerGroupIndex, type PeerDemographics } from './demographicPeers'
import { generateSharePages } from './generateSharePages'
import { generateViewerHtml } from './generateViewerHtml'
import { methodologyPageHtml } from './methodologyPage'
import { buildRegionIndex, computeLazyDarstellungPresence } from './regionNavigation'
import { computeFilteredLengths, RADINFRA_DEFAULT_FILTER } from './statsClassSums'

type StatsGeoFeature = {
  properties?: {
    id?: string
    name?: string
    level?: string
    regionalschluessel?: string
    road_length?: unknown
    bikelane_length?: unknown
  }
}

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

// stats.msgpack is split into two packs so the viewer doesn't have to download everything up
// front: stats-core.msgpack (admin levels most visits actually browse) and stats-extra.msgpack
// (Gemeindeverbände/Stadtbezirke, ~40% of the combined size, behind two niche Darstellung
// options) — fetched lazily only once one of those is selected. See splitStatsFeaturesByLevel.
if (existsSync(msgpackPath)) {
  const packBytes = new Uint8Array(await Bun.file(msgpackPath).arrayBuffer())
  const fullFeatures = decodeStatsRegionPack(packBytes)
  const { core, extra } = splitStatsFeaturesByLevel(fullFeatures)
  writeFileSync(join(viewerDir, 'stats-core.msgpack'), encodeStatsRegionPack(core))
  writeFileSync(join(viewerDir, 'stats-extra.msgpack'), encodeStatsRegionPack(extra))
  process.stdout.write(
    `Stats split: ${core.length} core + ${extra.length} extra (Gemeindeverbände/Stadtbezirke) ` +
      `→ ${viewerDir}/stats-core.msgpack, stats-extra.msgpack\n`,
  )

  // From the FULL (unsplit) feature set, so the Darstellung dropdown can list
  // Gemeindeverbände/Stadtbezirke options correctly before stats-extra.msgpack loads.
  const fullIndex = buildRegionIndex(fullFeatures)
  const lazyPresence = computeLazyDarstellungPresence(fullFeatures, fullIndex)
  writeFileSync(join(viewerDir, 'lazy-darstellung-presence.json'), JSON.stringify(lazyPresence))
  process.stdout.write(`Lazy Darstellung presence → ${viewerDir}/lazy-darstellung-presence.json\n`)
} else {
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

// gemeinde-peers.json: {region id → demographic-peer bucket key} + {key → label}, for the
// region card's "compared to similar Gemeinden nationwide" line. The ranking is computed
// client-side from the loaded stats, so this stays small (~one line per Gemeinde). Absent
// when the Destatis dataset has not been fetched — the viewer just omits that line.
const geoFeatures: StatsGeoFeature[] = existsSync(geojsonPath)
  ? ((JSON.parse(await Bun.file(geojsonPath).text()) as { features?: StatsGeoFeature[] })
      .features ?? [])
  : []

/** Nationwide bike-infra share (%) under the default counting filter — for the methodology page. */
let nationalSharePct: number | null = null
{
  const de = geoFeatures.find((f) => String(f.properties?.level ?? '') === '2')
  if (de?.properties) {
    const { roadKm, bikeKm } = computeFilteredLengths(
      de.properties.road_length,
      de.properties.bikelane_length,
      RADINFRA_DEFAULT_FILTER,
    )
    if (roadKm > 0) nationalSharePct = (bikeKm / roadKm) * 100
  }
}

let peerGemeindeCount = 0
const demographicsPath = join(outputRoot, 'gemeinde-demographics.json')
if (existsSync(demographicsPath) && geoFeatures.length) {
  try {
    const rsById = new Map<string, string>()
    for (const f of geoFeatures) {
      const p = f.properties
      if (p?.id && p.level === '8' && p.regionalschluessel) {
        rsById.set(String(p.id), String(p.regionalschluessel))
      }
    }
    const demo = JSON.parse(await Bun.file(demographicsPath).text()) as {
      gemeinden?: Array<{
        rs: string
        population: number
        urbanizationCode: PeerDemographics['urbanizationCode']
      }>
    }
    const demographicsByRs = new Map<string, PeerDemographics>(
      (demo.gemeinden ?? []).map((g) => [
        g.rs,
        { population: g.population, urbanizationCode: g.urbanizationCode },
      ]),
    )
    const index = buildPeerGroupIndex(rsById, demographicsByRs)
    peerGemeindeCount = Object.keys(index.byId).length
    writeFileSync(join(viewerDir, 'gemeinde-peers.json'), JSON.stringify(index))
    process.stdout.write(
      `Peer groups: ${peerGemeindeCount} Gemeinden in ${Object.keys(index.groups).length} buckets → ${viewerDir}/gemeinde-peers.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-peers.json skipped: ${err}\n`)
  }
}

const dataDateLabel = existsSync(geojsonPath)
  ? statSync(geojsonPath).mtime.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  : ''
writeFileSync(
  join(viewerDir, 'methodik.html'),
  methodologyPageHtml({
    dataDateLabel,
    nationalSharePct,
    peerGemeindeCount,
    projectLead: PROJECT_LEAD,
    sourceRepoUrl: VIEWER_SOURCE_REPO_URL,
    viewerHref: './index.html',
  }),
  'utf8',
)
process.stdout.write(`Methodology: ${viewerDir}/methodik.html\n`)

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

const sharePages = await generateSharePages()
process.stdout.write(
  `Share pages: ${sharePages.stubCount} stubs, ${sharePages.imageCount} OG images, ` +
    `${sharePages.peerCount} with a demographic peer comparison → ${viewerDir}/r\n`,
)

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
