#!/usr/bin/env bun
import { createHash } from 'node:crypto'
/**
 * Interactive viewer: stats.msgpack + neighbors + HTML.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decodeStatsRegionPack,
  encodeStatsRegionPack,
  splitGemeindeGeometry,
  splitStatsFeaturesByLevel,
} from '../stats-export/statsRegionPack'
import {
  GEMEINDE_GEOMETRY_DIR,
  PROJECT_LEAD,
  DETOUR_DIR,
  DETOUR_PAGE_STEM,
  STATION_AREAS_PAGE_STEM,
  VIEWER_SOURCE_REPO_URL,
} from './constants'
import { VIEWER_FILES, VIEWER_PASS_THROUGH_DATASETS } from './constants'
import { readDataDateLabel } from './dataDate'
import {
  buildDataDownloadRow,
  buildModelAggregates,
  kreisfreieIdsOf,
  DATA_DOWNLOAD_DIR,
  type DataDownloadContext,
  dataDownloadCsv,
  dataDownloadFileName,
  excelDataDownloadFileName,
} from './dataDownload'
import { detourPageHtml } from './detourPage'
import type { DetourIndexEntry } from './fetchDetourGraph'
import { generateSharePages } from './generateSharePages'
import { generateViewerHtml } from './generateViewerHtml'
import { legalPageHtml } from './legalPage'
import { methodologyPageHtml } from './methodologyPage'
import { buildRegionContextIndexes, type DemographicsRow } from './regionContextIndexes'
import { buildRegionIndex, computeLazyDarstellungPresence } from './regionNavigation'
import { writeSiteIcons } from './siteIcon'
import { mergeHistory, type Snapshot, snapshotFromFeatures } from './snapshotHistory'
import { type StationAccessFiles, stationAreasPageHtml } from './stationAreasPage'
import { computeFilteredLengths, RADINFRA_DEFAULT_FILTER } from './statsClassSums'

type StatsGeoFeature = {
  properties?: {
    id?: string
    name?: string
    level?: string
    regionalschluessel?: string
    landkreis_id?: string
    bundesland_id?: string
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

function symlinkOutputFile(sourcePath: string, linkPath: string) {
  if (!existsSync(sourcePath)) return false
  // Replace whatever is there, a stale regular copy included: an old copy once kept a May
  // manifest.json in the deploy folder for months.
  rmSync(linkPath, { recursive: true, force: true })
  symlinkSync(`../${basename(sourcePath)}`, linkPath)
  return true
}

/**
 * Per-dataset stamps for manifest.json's `datasets` field: what fetchCommon.writeDataset put into
 * each output/<name>.json this build read (fetchedAt, aggregatedAt, osmDataFrom, source). Keyed by
 * the output file name without extension; a dataset without any stamp is left out.
 */
type DatasetStamp = {
  fetchedAt?: string
  aggregatedAt?: string
  osmDataFrom?: string
  source?: string
}
const datasetStamps: Record<string, DatasetStamp> = {}
function recordDatasetStamp(fileName: string, data: unknown) {
  if (!data || typeof data !== 'object') return
  const stamp: DatasetStamp = {}
  for (const key of ['fetchedAt', 'aggregatedAt', 'osmDataFrom', 'source'] as const) {
    const value = (data as Record<string, unknown>)[key]
    if (typeof value === 'string' && value) stamp[key] = value
  }
  if (Object.keys(stamp).length) datasetStamps[fileName.replace(/\.[^.]+$/, '')] = stamp
}

// stats.msgpack is split into two packs so the viewer doesn't have to download everything up
// front: stats-core.msgpack (admin levels most visits actually browse) and stats-extra.msgpack
// (Gemeindeverbände/Stadtbezirke, ~40% of the combined size, behind two niche Darstellung
// options) — fetched lazily only once one of those is selected. See splitStatsFeaturesByLevel.
if (existsSync(msgpackPath)) {
  const packBytes = new Uint8Array(await Bun.file(msgpackPath).arrayBuffer())
  const fullFeatures = decodeStatsRegionPack(packBytes)
  const { core, extra } = splitStatsFeaturesByLevel(fullFeatures)
  // The Gemeinde polygons are over half of the first download and the default view never draws
  // one: keep them out of stats-core and write one small file per Landkreis the page fetches
  // when a view needs them.
  const { light, shards } = splitGemeindeGeometry(core)
  // The Gemeinden are three quarters of what is left; the plain landing page (Landkreise of
  // Germany) draws none of them, so they come in a second file that loads right after the first.
  const top = light.filter((f) => String(f.properties?.level) !== '8')
  const gemeinden = light.filter((f) => String(f.properties?.level) === '8')
  writeFileSync(join(viewerDir, VIEWER_FILES.statsCore), encodeStatsRegionPack(top))
  writeFileSync(join(viewerDir, VIEWER_FILES.statsGemeinden), encodeStatsRegionPack(gemeinden))
  writeFileSync(join(viewerDir, VIEWER_FILES.statsExtra), encodeStatsRegionPack(extra))
  const geometryDir = join(viewerDir, GEMEINDE_GEOMETRY_DIR)
  rmSync(geometryDir, { recursive: true, force: true })
  mkdirSync(geometryDir, { recursive: true })
  for (const [key, shardFeatures] of shards) {
    writeFileSync(join(geometryDir, `${key}.msgpack`), encodeStatsRegionPack(shardFeatures))
  }
  process.stdout.write(
    `Stats split: ${top.length} core + ${gemeinden.length} Gemeinden + ${extra.length} extra (Gemeindeverbände/Stadtbezirke) ` +
      `→ ${viewerDir}/stats-core.msgpack, stats-extra.msgpack; ` +
      `Gemeinde polygons in ${shards.size} files → ${geometryDir}/\n`,
  )

  // From the FULL (unsplit) feature set, so the Darstellung dropdown can list
  // Gemeindeverbände/Stadtbezirke options correctly before stats-extra.msgpack loads.
  const fullIndex = buildRegionIndex(fullFeatures)
  const lazyPresence = computeLazyDarstellungPresence(fullFeatures, fullIndex)
  writeFileSync(join(viewerDir, VIEWER_FILES.lazyDarstellungPresence), JSON.stringify(lazyPresence))
  process.stdout.write(`Lazy Darstellung presence → ${viewerDir}/lazy-darstellung-presence.json\n`)
} else {
  process.stderr.write(
    `Warning: ${msgpackPath} missing – run: bun run bike-share-map:export-stats-geojson\n`,
  )
}
const hasNeighborsMsgpack = symlinkOutputFile(
  neighborsMsgpackPath,
  join(viewerDir, VIEWER_FILES.neighborsMsgpack),
)
symlinkOutputFile(neighborsJsonPath, join(viewerDir, VIEWER_FILES.neighborsJson))
if (!hasNeighborsMsgpack) {
  process.stderr.write(
    `Warning: ${neighborsMsgpackPath} missing – Nachbar-Ansichten brauchen: bun run bike-share-map:export-stats-geojson\n`,
  )
}
// manifest.json is written at the end of the build (enriched with per-dataset stamps, see
// datasetStamps); drop any stale symlink/copy so a failed build can't leave the old one behind.
rmSync(join(viewerDir, VIEWER_FILES.manifest), { force: true })
// Map lines of the busy rural roads (fetchTrafficVolumes.ts), loaded only when switched on.
if (
  symlinkOutputFile(
    join(outputRoot, VIEWER_FILES.busyRoads),
    join(viewerDir, VIEWER_FILES.busyRoads),
  )
) {
  try {
    recordDatasetStamp(
      VIEWER_FILES.busyRoads,
      JSON.parse(readFileSync(join(outputRoot, VIEWER_FILES.busyRoads), 'utf8')),
    )
  } catch (err) {
    process.stderr.write(`${VIEWER_FILES.busyRoads} stamp skipped: ${err}\n`)
  }
}
// stats.geojson (49 MB) is a local analysis file only; the page reads the msgpack packs.
rmSync(join(viewerDir, 'stats.geojson'), { force: true })

// Third-party scripts are served from our own origin: a CDN outage used to leave a blank page
// (the inline script throws on `new maplibregl.Map` before any error UI exists).
rmSync(join(viewerDir, 'vendor'), { recursive: true, force: true })
cpSync(join(scriptDir, 'vendor'), join(viewerDir, 'vendor'), { recursive: true })

// Favicon + touch icon (siteIcon.ts); every page's head links them relative to the viewer root.
await writeSiteIcons(viewerDir)

// gemeinde-peers.json: {region id → demographic-peer bucket key} + {key → label}, for the
// region card's "compared to similar Gemeinden nationwide" line. The ranking is computed
// client-side from the loaded stats, so this stays small (~one line per Gemeinde). Absent
// when the Destatis dataset has not been fetched — the viewer just omits that line.
const geoFeatures = (
  existsSync(msgpackPath)
    ? decodeStatsRegionPack(new Uint8Array(await Bun.file(msgpackPath).arrayBuffer()))
    : []
) as StatsGeoFeature[]

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
let peerKreisCount = 0
const demographicsPath = join(outputRoot, 'gemeinde-demographics.json')
if (existsSync(demographicsPath) && geoFeatures.length) {
  try {
    const readJson = async <T>(name: string) => {
      const path = join(outputRoot, name)
      if (!existsSync(path)) return null
      const data = JSON.parse(await Bun.file(path).text()) as T
      recordDatasetStamp(name, data)
      return data
    }
    const demo = (await readJson<{ gemeinden?: DemographicsRow[] }>('gemeinde-demographics.json'))!
    type ById<T> = { byId?: Record<string, T> }
    const counts = await readJson<ById<{ stopCount?: number; avgDistanceToStationM?: number }>>(
      'transit-stop-counts.json',
    )
    const access =
      await readJson<ById<Record<string, [number, number, number]>>>('station-access.json')
    const highway = await readJson<ById<{ avgDistanceToHighwayM?: number }>>('highway-access.json')
    const { peers, densityById, transitById } = buildRegionContextIndexes(
      geoFeatures,
      demo.gemeinden ?? [],
      counts || access || highway
        ? { counts: counts?.byId, access: access?.byId, highway: highway?.byId }
        : null,
    )

    const peerGroupKeys = Object.values(peers.byId)
    peerKreisCount = peerGroupKeys.filter((key) => key.startsWith('lk:')).length
    peerGemeindeCount = peerGroupKeys.length - peerKreisCount
    writeFileSync(join(viewerDir, VIEWER_FILES.peers), JSON.stringify(peers))
    process.stdout.write(
      `Peer groups: ${peerGemeindeCount} Gemeinden + ${peerKreisCount} Kreise in ${Object.keys(peers.groups).length} buckets → ${viewerDir}/${VIEWER_FILES.peers}\n`,
    )
    writeFileSync(join(viewerDir, VIEWER_FILES.density), JSON.stringify({ byId: densityById }))
    process.stdout.write(
      `Density: ${Object.keys(densityById).length} regions → ${viewerDir}/${VIEWER_FILES.density}\n`,
    )
    if (transitById) {
      writeFileSync(join(viewerDir, VIEWER_FILES.transit), JSON.stringify({ byId: transitById }))
      process.stdout.write(
        `Transit & highway access: ${Object.keys(transitById).length} regions → ${viewerDir}/${VIEWER_FILES.transit}\n`,
      )
    }
  } catch (err) {
    process.stderr.write(`${VIEWER_FILES.peers} / density / transit skipped: ${err}\n`)
  }
}

// Context datasets that are already keyed by region id: copied as {byId} (see
// VIEWER_PASS_THROUGH_DATASETS for the list and fetch*.ts for what each one holds).
for (const dataset of VIEWER_PASS_THROUGH_DATASETS) {
  const sourcePath = join(outputRoot, dataset.source)
  const target = VIEWER_FILES[dataset.key]
  if (!existsSync(sourcePath)) continue
  try {
    const data = JSON.parse(await Bun.file(sourcePath).text()) as {
      byId?: Record<string, unknown>
    }
    recordDatasetStamp(dataset.source, data)
    writeFileSync(join(viewerDir, target), JSON.stringify({ byId: data.byId ?? {} }))
    process.stdout.write(
      `${dataset.label}: ${Object.keys(data.byId ?? {}).length} regions → ${viewerDir}/${target}\n`,
    )
  } catch (err) {
    process.stderr.write(`${target} skipped: ${err}\n`)
  }
}

// daten/radinfra-regionen-<OSM date>.csv: every region's numbers under the default counting
// filter, plus the context metrics and the model's expected value — the same functions the map
// uses, so a downloaded value always matches the card. Reads the gemeinde-*.json written above.
let dataDownload: { href: string; excelHref: string; rowCount: number } | null = null
if (geoFeatures.length) {
  const readById = <T>(name: string) => {
    const path = join(viewerDir, name)
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as { byId?: Record<string, T> }).byId
      : undefined
  }
  const ctx: DataDownloadContext = {
    names: Object.fromEntries(
      geoFeatures.flatMap((f) => (f.properties?.id ? [[f.properties.id, f.properties.name]] : [])),
    ),
    density: readById(VIEWER_FILES.density),
    terrain: readById(VIEWER_FILES.terrain),
    transit: readById(VIEWER_FILES.transit),
    zensus: readById(VIEWER_FILES.zensus),
    cars: readById(VIEWER_FILES.cars),
    calmed: readById(VIEWER_FILES.calmed),
    accidents: readById(VIEWER_FILES.accidents),
    commuters: readById(VIEWER_FILES.commuters),
    mapping: readById(VIEWER_FILES.mapping),
    traffic: readById(VIEWER_FILES.traffic),
    trafficFederal: readById(VIEWER_FILES.trafficFederal),
    regiostar: readById(VIEWER_FILES.regiostar),
    atlas: readById(VIEWER_FILES.atlas),
  }
  const osmDataFrom = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { osmDataFrom?: string }).osmDataFrom
    : undefined
  ctx.kreisfreieIds = kreisfreieIdsOf(geoFeatures)
  ctx.modelAggregates = buildModelAggregates(geoFeatures, ctx)
  const rows = geoFeatures.flatMap((f) => buildDataDownloadRow(f, ctx) ?? [])
  const fileName = dataDownloadFileName(osmDataFrom)
  const dataDir = join(viewerDir, DATA_DOWNLOAD_DIR)
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(dataDir, { recursive: true })
  const excelFileName = excelDataDownloadFileName(osmDataFrom)
  writeFileSync(join(dataDir, fileName), dataDownloadCsv(rows), 'utf8')
  writeFileSync(join(dataDir, excelFileName), dataDownloadCsv(rows, 'excel'), 'utf8')
  dataDownload = {
    href: `./${DATA_DOWNLOAD_DIR}/${fileName}`,
    excelHref: `./${DATA_DOWNLOAD_DIR}/${excelFileName}`,
    rowCount: rows.length,
  }
  process.stdout.write(`Data download: ${rows.length} regions → ${dataDir}/${fileName}\n`)
}

// output/history/<OSM date>.json: one snapshot per data release, kept in git (Pages keeps no old
// versions); merged into history.json for the card's "since <date>" line. See snapshotHistory.ts.
if (geoFeatures.length) {
  const osmDataFrom = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { osmDataFrom?: string }).osmDataFrom
    : undefined
  const historyDir = join(outputRoot, 'history')
  mkdirSync(historyDir, { recursive: true })
  const day = osmDataFrom?.slice(0, 10)
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const snapshotPath = join(historyDir, `${day}.json`)
    if (!existsSync(snapshotPath)) {
      writeFileSync(snapshotPath, JSON.stringify(snapshotFromFeatures(geoFeatures, osmDataFrom!)))
      process.stdout.write(`History: new snapshot ${snapshotPath} — commit it\n`)
    }
  }
  const snapshots = readdirSync(historyDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(historyDir, name), 'utf8')) as Snapshot)
  const history = mergeHistory(snapshots)
  writeFileSync(join(viewerDir, VIEWER_FILES.history), JSON.stringify(history))
  process.stdout.write(
    `History: ${history.dates.length} comparable snapshot(s) → ${viewerDir}/${VIEWER_FILES.history}\n`,
  )
}

const dataDateLabel = readDataDateLabel(outputRoot)
writeFileSync(
  join(viewerDir, 'methodik.html'),
  methodologyPageHtml({
    dataDateLabel,
    dataDownload,
    nationalSharePct,
    peerGemeindeCount,
    peerKreisCount,
    projectLead: PROJECT_LEAD,
    sourceRepoUrl: VIEWER_SOURCE_REPO_URL,
    viewerHref: './index.html',
  }),
  'utf8',
)
process.stdout.write(`Methodology: ${viewerDir}/methodik.html\n`)

writeFileSync(
  join(viewerDir, 'impressum.html'),
  legalPageHtml({ projectLead: PROJECT_LEAD, viewerHref: './index.html' }),
  'utf8',
)
process.stdout.write(`Impressum: ${viewerDir}/impressum.html\n`)

// Unlisted nearest-station map: needs output/stations.json (bun run bike-share-map:stations);
// the foot/bike/car views additionally output/station-access/ (routing/station_access.py).
const stationsPath = join(outputRoot, 'stations.json')
if (existsSync(stationsPath)) {
  const stationsData = JSON.parse(await Bun.file(stationsPath).text()) as Record<string, unknown>
  recordDatasetStamp('stations.json', stationsData)
  // Departures per station (routing/station_departures.py), matched by "lng,lat,category" so a
  // re-fetched stations.json still lines up. Older files only had the positional array, which is
  // only valid for the exact station list it was computed for.
  const departuresPath = join(outputRoot, 'station-departures.json')
  if (existsSync(departuresPath)) {
    const dep = JSON.parse(await Bun.file(departuresPath).text()) as {
      date: string
      source: string
      stationsFetchedAt?: string
      departures?: Array<number | null>
      byStation?: Record<string, number>
    }
    const stationKey = (s: unknown[]) => `${s[0]},${s[1]},${s[2]}`
    if (dep.byStation) {
      const byStation = dep.byStation
      stationsData.departures = (stationsData.stations as unknown[][]).map(
        (s) => byStation[stationKey(s)] ?? null,
      )
      stationsData.departuresDate = dep.date
    } else if (dep.departures && dep.stationsFetchedAt === stationsData.fetchedAt) {
      stationsData.departures = dep.departures
      stationsData.departuresDate = dep.date
    } else {
      process.stderr.write(
        `station-departures.json is for another stations.json – rerun routing/station_departures.py\n`,
      )
    }
  }
  writeFileSync(join(viewerDir, `${STATION_AREAS_PAGE_STEM}.json`), JSON.stringify(stationsData))
  const accessDir = join(outputRoot, 'station-access')
  const accessFiles: StationAccessFiles = {}
  if (existsSync(accessDir)) {
    symlinkOutputFile(accessDir, join(viewerDir, 'station-access'))
    for (const name of readdirSync(accessDir).sort()) {
      const m = /^(foot|bike|car|straight)-(areas|minutes|km)\.json$/.exec(name)
      if (m)
        (accessFiles[m[1] as keyof StationAccessFiles] ??= []).push(
          m[2] as 'areas' | 'minutes' | 'km',
        )
    }
  }
  writeFileSync(
    join(viewerDir, `${STATION_AREAS_PAGE_STEM}.html`),
    stationAreasPageHtml({
      dataHref: `./${STATION_AREAS_PAGE_STEM}.json`,
      dataDateLabel,
      accessBaseHref: './station-access/',
      accessFiles,
    }),
    'utf8',
  )
  process.stdout.write(`Nearest-station map: ${viewerDir}/${STATION_AREAS_PAGE_STEM}.html\n`)
}

// Unlisted detour map: needs output/detour/index.json + one graph per Landkreis
// (bun run bike-share-map:detour-graph -- --landkreis relation/…).
const detourIndexPath = join(outputRoot, DETOUR_DIR, 'index.json')
const detourLandkreise: DetourIndexEntry[] = existsSync(detourIndexPath)
  ? (JSON.parse(readFileSync(detourIndexPath, 'utf8')) as { landkreise: DetourIndexEntry[] })
      .landkreise
  : []
if (detourLandkreise.length) {
  symlinkOutputFile(join(outputRoot, DETOUR_DIR), join(viewerDir, DETOUR_DIR))
  writeFileSync(
    join(viewerDir, `${DETOUR_PAGE_STEM}.html`),
    detourPageHtml({
      landkreise: detourLandkreise,
      dataBaseHref: `./${DETOUR_DIR}/`,
      routingScriptHref: './detourRouting.js',
      dataDateLabel,
      methodikHref: './methodik.html',
      viewerHref: './index.html',
    }),
    'utf8',
  )
  process.stdout.write(
    `Detour map: ${viewerDir}/${DETOUR_PAGE_STEM}.html (${detourLandkreise.map((l) => l.name).join(', ')})\n`,
  )
}

const bundleTargets = [
  { entry: 'statsClassSums.bundle.ts', name: 'statsClassSums.js' },
  { entry: 'detourRouting.bundle.ts', name: 'detourRouting.js' },
  { entry: 'regionNavigation.bundle.ts', name: 'regionNavigation.js' },
  { entry: 'neighborView.bundle.ts', name: 'neighborView.js' },
  { entry: 'regionSearch.bundle.ts', name: 'regionSearch.js' },
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
  'neighbors.worker.ts',
  'neighborsBuild.worker.ts',
  'statsDecode.worker.ts',
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

// Content hash per asset the page links to, so an unchanged file stays cached across deploys
// (the ?v= used to be the build time, which invalidated everything on every push).
function assetContentVersions(): Record<string, string> {
  const versions: Record<string, string> = {}
  const hashOf = (paths: string[]) => {
    const h = createHash('sha1')
    for (const p of paths) h.update(readFileSync(p))
    return h.digest('hex').slice(0, 10)
  }
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === GEMEINDE_GEOMETRY_DIR) {
          const files = readdirSync(full)
            .filter((f) => f.endsWith('.msgpack'))
            .sort()
            .map((f) => join(full, f))
          versions[GEMEINDE_GEOMETRY_DIR] = hashOf(files)
        } else if (entry.name === 'vendor' || dir !== viewerDir) {
          // vendor/<lib>/<files>: the only nested folder the page links into
          walk(full)
        }
        continue
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      if (!/\.(js|css|json|msgpack|geojson)$/.test(entry.name)) continue
      try {
        versions[relative(viewerDir, full)] = hashOf([full])
      } catch {
        // a dangling symlink: the page falls back to the build timestamp
      }
    }
  }
  walk(viewerDir)
  return versions
}

writeFileSync(
  join(viewerDir, 'index.html'),
  generateViewerHtml(
    new Date().toISOString(),
    dataDateLabel,
    detourLandkreise.map((l) => l.id),
    assetContentVersions(),
  ),
  'utf8',
)

// manifest.json: the export's manifest (version, ids, featureCount, osmDataFrom – unchanged) plus
// `datasets`, the fetchedAt/aggregatedAt/osmDataFrom/source stamps of every context dataset this
// build read, so the served site says how old each input is. A regular file, not a symlink: the
// one in output/ stays the export's.
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const manifestTarget = join(viewerDir, VIEWER_FILES.manifest)
  rmSync(manifestTarget, { force: true }) // never write through a leftover symlink into output/
  writeFileSync(
    manifestTarget,
    JSON.stringify({ ...manifest, datasets: datasetStamps }, null, 2),
    'utf8',
  )
  process.stdout.write(
    `Manifest: ${Object.keys(datasetStamps).length} dataset stamp(s) → ${manifestTarget}\n`,
  )
} else {
  process.stderr.write(`Warning: ${manifestPath} missing – manifest.json not written\n`)
}

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
process.stdout.write(
  `  minimal          minimal=1 (or embed=1, chrome=0) hides the control panel\n`,
)
process.stdout.write(
  `  focus + simple  neighbour view (focus= relation id, simple= neighbour preset id)\n`,
)
process.stdout.write(
  `  region           relation/… – preselect that region's detail card on load\n`,
)
process.stdout.write(`  basemap          blank | de | light | muted | osm\n`)
process.stdout.write(`  radwege          1 | 0\n`)
process.stdout.write(`  strassen         1 | 0\n`)
process.stdout.write(`  ranking          1 | 0\n`)
process.stdout.write(`  colors           traffic (default) | green | colorblind\n`)
