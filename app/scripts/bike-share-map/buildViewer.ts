#!/usr/bin/env bun
/**
 * Interactive viewer: stats.msgpack + neighbors + HTML.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
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
  STATION_AREAS_PAGE_STEM,
  VIEWER_SOURCE_REPO_URL,
} from './constants'
import { readDataDateLabel } from './dataDate'
import {
  buildDataDownloadRow,
  DATA_DOWNLOAD_DIR,
  type DataDownloadContext,
  dataDownloadCsv,
  dataDownloadFileName,
} from './dataDownload'
import {
  buildPeerGroupIndex,
  classifyLandkreisPeer,
  LANDKREIS_PEER_LABELS,
  type PeerDemographics,
} from './demographicPeers'
import { generateSharePages } from './generateSharePages'
import { generateViewerHtml } from './generateViewerHtml'
import { methodologyPageHtml } from './methodologyPage'
import { buildRegionIndex, computeLazyDarstellungPresence } from './regionNavigation'
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
  // The Gemeinde polygons are over half of the first download and the default view never draws
  // one: keep them out of stats-core and write one small file per Landkreis the page fetches
  // when a view needs them.
  const { light, shards } = splitGemeindeGeometry(core)
  writeFileSync(join(viewerDir, 'stats-core.msgpack'), encodeStatsRegionPack(light))
  writeFileSync(join(viewerDir, 'stats-extra.msgpack'), encodeStatsRegionPack(extra))
  const geometryDir = join(viewerDir, GEMEINDE_GEOMETRY_DIR)
  rmSync(geometryDir, { recursive: true, force: true })
  mkdirSync(geometryDir, { recursive: true })
  for (const [key, shardFeatures] of shards) {
    writeFileSync(join(geometryDir, `${key}.msgpack`), encodeStatsRegionPack(shardFeatures))
  }
  process.stdout.write(
    `Stats split: ${core.length} core + ${extra.length} extra (Gemeindeverbände/Stadtbezirke) ` +
      `→ ${viewerDir}/stats-core.msgpack, stats-extra.msgpack; ` +
      `Gemeinde polygons in ${shards.size} files → ${geometryDir}/\n`,
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
    const demo = JSON.parse(await Bun.file(demographicsPath).text()) as {
      gemeinden?: Array<{
        rs: string
        population: number
        urbanizationCode: PeerDemographics['urbanizationCode']
        densityPerKm2: number
        areaKm2: number
      }>
    }
    const demoByRs = new Map((demo.gemeinden ?? []).map((g) => [g.rs, g]))
    const demographicsByRs = new Map<string, PeerDemographics>(
      (demo.gemeinden ?? []).map((g) => [
        g.rs,
        { population: g.population, urbanizationCode: g.urbanizationCode },
      ]),
    )

    const rsById = new Map<string, string>()
    const areaById = new Map<string, number>()
    const popById = new Map<string, number>()
    const densityById: Record<string, number> = {}

    // Group child Gemeinden by landkreis_id and bundesland_id
    const gemsByLkId = new Map<string, typeof geoFeatures>()
    const gemsByBlId = new Map<string, typeof geoFeatures>()
    for (const f of geoFeatures) {
      const p = f.properties
      if (p?.id && String(p.level) === '8') {
        const id = String(p.id)
        if (p.regionalschluessel) {
          const rs = String(p.regionalschluessel)
          rsById.set(id, rs)
          const d = demoByRs.get(rs)
          if (d) {
            areaById.set(id, d.areaKm2)
            popById.set(id, d.population)
            densityById[id] = d.densityPerKm2
          }
        }
        if (p.landkreis_id) {
          const lk = String(p.landkreis_id)
          const arr = gemsByLkId.get(lk) ?? []
          arr.push(f)
          gemsByLkId.set(lk, arr)
        }
        if (p.bundesland_id) {
          const bl = String(p.bundesland_id)
          const arr = gemsByBlId.get(bl) ?? []
          arr.push(f)
          gemsByBlId.set(bl, arr)
        }
      }
    }

    const index = buildPeerGroupIndex(rsById, demographicsByRs)

    // Landkreise: populate population, area, density and peer classification
    for (const f of geoFeatures) {
      const p = f.properties
      if (p?.id && String(p.level) === '6') {
        const id = String(p.id)
        const children = gemsByLkId.get(id) ?? []
        let pop = 0
        let area = 0
        if (children.length > 0) {
          for (const c of children) {
            pop += popById.get(String(c.properties?.id)) ?? 0
            area += areaById.get(String(c.properties?.id)) ?? 0
          }
        } else {
          // Kreisfreie Stadt
          const rs = String(p.regionalschluessel ?? '')
          const item = demoByRs.get(rs) ?? demo.gemeinden?.find((g) => rs && g.rs.startsWith(rs))
          if (item) {
            pop = item.population
            area = item.areaKm2
          }
        }
        if (area > 0) {
          areaById.set(id, area)
          popById.set(id, pop)
          densityById[id] = pop / area
          const isKreisfrei = children.length <= 1
          const lkPeerKey = classifyLandkreisPeer(pop, area, isKreisfrei)
          index.byId[id] = lkPeerKey
        }
      }
    }
    for (const [k, lbl] of Object.entries(LANDKREIS_PEER_LABELS)) {
      index.groups[k] = lbl
    }

    // Bundesländer: populate population, area, density
    for (const f of geoFeatures) {
      const p = f.properties
      if (p?.id && String(p.level) === '4') {
        const id = String(p.id)
        const children = gemsByBlId.get(id) ?? []
        let pop = 0
        let area = 0
        for (const c of children) {
          pop += popById.get(String(c.properties?.id)) ?? 0
          area += areaById.get(String(c.properties?.id)) ?? 0
        }
        if (pop === 0) {
          // Stadtstaaten (Berlin, Hamburg, Bremen)
          const rs = String(p.regionalschluessel ?? '')
          for (const g of demo.gemeinden ?? []) {
            if (rs && g.rs.startsWith(rs)) {
              pop += g.population
              area += g.areaKm2
            }
          }
        }
        if (area > 0) {
          areaById.set(id, area)
          popById.set(id, pop)
          densityById[id] = pop / area
        }
      }
    }

    peerGemeindeCount = Object.keys(index.byId).length
    writeFileSync(join(viewerDir, 'gemeinde-peers.json'), JSON.stringify(index))
    process.stdout.write(
      `Peer groups: ${peerGemeindeCount} regions in ${Object.keys(index.groups).length} buckets → ${viewerDir}/gemeinde-peers.json\n`,
    )

    writeFileSync(join(viewerDir, 'gemeinde-density.json'), JSON.stringify({ byId: densityById }))
    process.stdout.write(
      `Density: ${Object.keys(densityById).length} regions → ${viewerDir}/gemeinde-density.json\n`,
    )

    // gemeinde-transit.json: {id → {density?, avgDistanceToStationM?, access?}}, from
    // fetchTransitStopCounts.ts's raw counts + Destatis areaKm2 (density = stopCount / areaKm2;
    // avgDistanceToStationM passes through as-is, already a population-weighted average). Same
    // experimental, ?extra=1-only treatment as density above. Absent when
    // transit-stop-counts.json hasn't been fetched (the publicTransport topic isn't part of the
    // default local processing run).
    const transitCountsPath = join(outputRoot, 'transit-stop-counts.json')
    const accessPath = join(outputRoot, 'station-access.json')
    const highwayPath = join(outputRoot, 'highway-access.json')
    if (existsSync(transitCountsPath) || existsSync(accessPath) || existsSync(highwayPath)) {
      const counts = existsSync(transitCountsPath)
        ? (JSON.parse(await Bun.file(transitCountsPath).text()) as {
            byId?: Record<string, { stopCount?: number; avgDistanceToStationM?: number }>
          })
        : {}
      // Time/distance to the nearest station on foot, by bike and by car along the network
      // (fetchStationAccess.ts): {mode: [minutes, km, % within 10 min]}.
      const accessById = existsSync(accessPath)
        ? ((
            JSON.parse(await Bun.file(accessPath).text()) as {
              byId?: Record<string, Record<string, [number, number, number]>>
            }
          ).byId ?? {})
        : {}
      const highwayById = existsSync(highwayPath)
        ? ((
            JSON.parse(await Bun.file(highwayPath).text()) as {
              byId?: Record<string, { avgDistanceToHighwayM?: number }>
            }
          ).byId ?? {})
        : {}
      type TransitEntry = {
        density?: number
        avgDistanceToStationM?: number
        avgDistanceToHighwayM?: number
        access?: Record<string, [number, number, number]>
      }
      const transitById: Record<string, TransitEntry> = {}
      const allIds = new Set([
        ...Object.keys(counts.byId ?? {}),
        ...Object.keys(accessById),
        ...Object.keys(highwayById),
      ])
      for (const id of allIds) {
        const entry = counts.byId?.[id]
        const hwEntry = highwayById[id]
        const areaKm2 = areaById.get(id)
        const out: TransitEntry = accessById[id] ? { access: accessById[id] } : {}
        if (
          entry &&
          typeof entry.stopCount === 'number' &&
          typeof areaKm2 === 'number' &&
          areaKm2 > 0
        ) {
          out.density = entry.stopCount / areaKm2
        }
        if (entry && typeof entry.avgDistanceToStationM === 'number') {
          out.avgDistanceToStationM = entry.avgDistanceToStationM
        }
        if (hwEntry && typeof hwEntry.avgDistanceToHighwayM === 'number') {
          out.avgDistanceToHighwayM = hwEntry.avgDistanceToHighwayM
        }
        if (Object.keys(out).length) transitById[id] = out
      }
      writeFileSync(join(viewerDir, 'gemeinde-transit.json'), JSON.stringify({ byId: transitById }))
      process.stdout.write(
        `Transit & highway access: ${Object.keys(transitById).length} regions → ${viewerDir}/gemeinde-transit.json\n`,
      )
    }
  } catch (err) {
    process.stderr.write(
      `gemeinde-peers.json / gemeinde-density.json / gemeinde-transit.json skipped: ${err}\n`,
    )
  }
}

// gemeinde-terrain.json: {id → {area?, road?, roadSteepP95?, elevationMean?, elevationRange?}},
// from fetchTerrainFlatness.ts. Already keyed by region id (no Destatis RS join needed). Same
// experimental, ?extra=1-only treatment. Absent when terrain-flatness.json hasn't been fetched.
const terrainPath = join(outputRoot, 'terrain-flatness.json')
if (existsSync(terrainPath)) {
  try {
    const terrain = JSON.parse(await Bun.file(terrainPath).text()) as {
      byId?: Record<
        string,
        {
          area?: number
          road?: number
          roadSteepP95?: number
          elevationMean?: number
          elevationRange?: number
        }
      >
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-terrain.json'),
      JSON.stringify({ byId: terrain.byId ?? {} }),
    )
    process.stdout.write(
      `Terrain: ${Object.keys(terrain.byId ?? {}).length} Gemeinden → ${viewerDir}/gemeinde-terrain.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-terrain.json skipped: ${err}\n`)
  }
}

// gemeinde-zensus.json: {id → {rentPerM2?, vacancyRatePct?, youthSharePct?, seniorSharePct?}}
const zensusPath = join(outputRoot, 'zensus-housing-demographics.json')
if (existsSync(zensusPath)) {
  try {
    const zensus = JSON.parse(await Bun.file(zensusPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-zensus.json'),
      JSON.stringify({ byId: zensus.byId ?? {} }),
    )
    process.stdout.write(
      `Zensus housing & demographics: ${Object.keys(zensus.byId ?? {}).length} regions → ${viewerDir}/gemeinde-zensus.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-zensus.json skipped: ${err}\n`)
  }
}

// gemeinde-cars.json: {id → {cars, commercialCars?, carsPer1000?, commercialSharePct?}}
const carsPath = join(outputRoot, 'car-density.json')
if (existsSync(carsPath)) {
  try {
    const carsData = JSON.parse(await Bun.file(carsPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-cars.json'),
      JSON.stringify({ byId: carsData.byId ?? {} }),
    )
    process.stdout.write(
      `KBA car density: ${Object.keys(carsData.byId ?? {}).length} regions → ${viewerDir}/gemeinde-cars.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-cars.json skipped: ${err}\n`)
  }
}

// gemeinde-calmed.json: {id → {totalRoadKm, calmedKm, calmedSharePct, livingKm, livingSharePct}}
const calmedPath = join(outputRoot, 'calmed-roads.json')
if (existsSync(calmedPath)) {
  try {
    const calmedData = JSON.parse(await Bun.file(calmedPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-calmed.json'),
      JSON.stringify({ byId: calmedData.byId ?? {} }),
    )
    process.stdout.write(
      `Traffic calmed road share: ${Object.keys(calmedData.byId ?? {}).length} regions → ${viewerDir}/gemeinde-calmed.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-calmed.json skipped: ${err}\n`)
  }
}

// gemeinde-accidents.json: {id → {totalAccidents, bikeAccidents, bikeFatal, bikeSevere, bikeLight, bikeFatalOrSevere, bikeAccidentsPer10k}}
const accidentsPath = join(outputRoot, 'accidents.json')
if (existsSync(accidentsPath)) {
  try {
    const accidentsData = JSON.parse(await Bun.file(accidentsPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-accidents.json'),
      JSON.stringify({ byId: accidentsData.byId ?? {} }),
    )
    process.stdout.write(
      `Destatis Unfallatlas: ${Object.keys(accidentsData.byId ?? {}).length} regions → ${viewerDir}/gemeinde-accidents.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-accidents.json skipped: ${err}\n`)
  }
}

// gemeinde-commuters.json: {id → {employedAtResidence, employedAtWorkplace, inCommuters, outCommuters, netCommuters, inCommuterSharePct, outCommuterSharePct, jobCentrality, workplaces, jobsPer1000Inhabitants}}
const commutersPath = join(outputRoot, 'commuters.json')
if (existsSync(commutersPath)) {
  try {
    const commutersData = JSON.parse(await Bun.file(commutersPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-commuters.json'),
      JSON.stringify({ byId: commutersData.byId ?? {} }),
    )
    process.stdout.write(
      `BA commuter statistics: ${Object.keys(commutersData.byId ?? {}).length} regions → ${viewerDir}/gemeinde-commuters.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-commuters.json skipped: ${err}\n`)
  }
}

// gemeinde-mapping.json: {id → {roadKm, speedPct, surfacePct, litPct, indexPct}}, from
// fetchMappingCompleteness.ts — how much of the road network carries surveyed attributes.
const mappingPath = join(outputRoot, 'mapping-completeness.json')
if (existsSync(mappingPath)) {
  try {
    const mappingData = JSON.parse(await Bun.file(mappingPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-mapping.json'),
      JSON.stringify({ byId: mappingData.byId ?? {} }),
    )
    process.stdout.write(
      `OSM mapping completeness: ${Object.keys(mappingData.byId ?? {}).length} regions → ${viewerDir}/gemeinde-mapping.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-mapping.json skipped: ${err}\n`)
  }
}

// gemeinde-traffic.json: {id → {needKm, coveredKm, coveredPct, byClass}}, Bavaria only, from
// fetchTrafficVolumes.ts — busy rural sections (ERA 2010 threshold) and how many have a bike path.
const trafficPath = join(outputRoot, 'traffic-volumes.json')
if (existsSync(trafficPath)) {
  try {
    const trafficData = JSON.parse(await Bun.file(trafficPath).text()) as {
      byId?: Record<string, unknown>
    }
    writeFileSync(
      join(viewerDir, 'gemeinde-traffic.json'),
      JSON.stringify({ byId: trafficData.byId ?? {} }),
    )
    process.stdout.write(
      `BAYSIS traffic volumes: ${Object.keys(trafficData.byId ?? {}).length} regions → ${viewerDir}/gemeinde-traffic.json\n`,
    )
  } catch (err) {
    process.stderr.write(`gemeinde-traffic.json skipped: ${err}\n`)
  }
}

// daten/radinfra-regionen-<OSM date>.csv: every region's numbers under the default counting
// filter, plus the context metrics and the model's expected value — the same functions the map
// uses, so a downloaded value always matches the card. Reads the gemeinde-*.json written above.
let dataDownload: { href: string; rowCount: number } | null = null
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
    density: readById('gemeinde-density.json'),
    terrain: readById('gemeinde-terrain.json'),
    transit: readById('gemeinde-transit.json'),
    zensus: readById('gemeinde-zensus.json'),
    cars: readById('gemeinde-cars.json'),
    calmed: readById('gemeinde-calmed.json'),
    accidents: readById('gemeinde-accidents.json'),
    commuters: readById('gemeinde-commuters.json'),
    mapping: readById('gemeinde-mapping.json'),
    traffic: readById('gemeinde-traffic.json'),
  }
  const osmDataFrom = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { osmDataFrom?: string }).osmDataFrom
    : undefined
  const rows = geoFeatures.flatMap((f) => buildDataDownloadRow(f, ctx) ?? [])
  const fileName = dataDownloadFileName(osmDataFrom)
  const dataDir = join(viewerDir, DATA_DOWNLOAD_DIR)
  rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, fileName), dataDownloadCsv(rows), 'utf8')
  dataDownload = { href: `./${DATA_DOWNLOAD_DIR}/${fileName}`, rowCount: rows.length }
  process.stdout.write(`Data download: ${rows.length} regions → ${dataDir}/${fileName}\n`)
}

const dataDateLabel = readDataDateLabel(outputRoot)
writeFileSync(
  join(viewerDir, 'methodik.html'),
  methodologyPageHtml({
    dataDateLabel,
    dataDownload,
    nationalSharePct,
    peerGemeindeCount,
    projectLead: PROJECT_LEAD,
    sourceRepoUrl: VIEWER_SOURCE_REPO_URL,
    viewerHref: './index.html',
  }),
  'utf8',
)
process.stdout.write(`Methodology: ${viewerDir}/methodik.html\n`)

// Unlisted nearest-station map: needs output/stations.json (bun run bike-share-map:stations);
// the foot/bike/car views additionally output/station-access/ (routing/station_access.py).
const stationsPath = join(outputRoot, 'stations.json')
if (existsSync(stationsPath)) {
  const stationsData = JSON.parse(await Bun.file(stationsPath).text()) as Record<string, unknown>
  // Departures per station (routing/station_departures.py), only when computed for this exact
  // station list — it is matched by position in the list.
  const departuresPath = join(outputRoot, 'station-departures.json')
  if (existsSync(departuresPath)) {
    const dep = JSON.parse(await Bun.file(departuresPath).text()) as {
      date: string
      source: string
      stationsFetchedAt?: string
      departures: Array<number | null>
    }
    if (dep.stationsFetchedAt === stationsData.fetchedAt) {
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

const bundleTargets = [
  { entry: 'statsClassSums.bundle.ts', name: 'statsClassSums.js' },
  { entry: 'regionNavigation.bundle.ts', name: 'regionNavigation.js' },
  { entry: 'simpleView.bundle.ts', name: 'simpleView.js' },
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

writeFileSync(
  join(viewerDir, 'index.html'),
  generateViewerHtml(new Date().toISOString(), dataDateLabel),
  'utf8',
)

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
