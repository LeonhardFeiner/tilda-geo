#!/usr/bin/env bun
/**
 * Choropleth map: bike infra km / road km per admin area + TILDA bikelane tiles (MapLibre HTML).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { featureCollection } from '@turf/helpers'
import { bbox, center } from '@turf/turf'
import type { FeatureCollection } from 'geojson'
import { type BasemapId, DEFAULT_BASEMAP, parseBasemapId } from './basemaps'
import { loadGemeindeBoundaries, mergeStatsWithBoundaries } from './boundaries'
import { BAYERN_SCOPES, DEFAULT_STATS_API_URL, DEFAULT_STATS_CSV } from './constants'
import { generateMapHtml } from './generateHtml'
import {
  buildFeatureCollectionFromStatsGeojson,
  buildLandkreisGemeindenFromStatsGeojson,
  gemeindeIdsForLandkreisFromCsv,
  loadStatsGeojson,
  parseStatsCsv,
} from './parseStats'
import { listLandkreiseFromCsv, resolveLandkreisFromCsv } from './resolveLandkreis'
import { buildLandkreisScope } from './scopeConfig'
import type { MapScopeConfig, MapScopeId } from './types'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outputRoot = join(scriptDir, 'output')
const defaultLocalStatsGeojson = join(outputRoot, 'stats.geojson')

function printHelp() {
  process.stdout.write(`Bike-share map builder (MapLibre HTML)

Scopes:
  landkreis (default)   Gemeinden in one Landkreis (--landkreis-id or --landkreis-name)
  bayern-landkreise     All Bavarian districts
  bayern-gemeinden      All Bavarian municipalities

Options:
  --scope <id>                  landkreis | bayern-landkreise | bayern-gemeinden
  --landkreis-id <osm-id>       e.g. relation/09162 (Landkreis München)
  --landkreis-name <name>       e.g. "Landkreis München"
  --list-landkreise             Print landkreise from CSV and exit
  --stats-csv <path>            Wide statistics CSV (default: latest export)
  --stats-geojson <path|url>    Geometries from /api/stats or export-stats-geojson
  --stats-api [url]             Fetch GeoJSON (default: ${DEFAULT_STATS_API_URL})
  --boundaries <geojson>        Optional local polygons (CSV path only, rare)
  --fetch-missing-boundaries    Overpass for missing polygons (--boundaries mode)
  --basemap <id>                blank | light (default) | muted | osm
  -h, --help

Examples:
  bun run bike-share-map --landkreis-name "Landkreis München" --stats-api
  bun run bike-share-map --landkreis-name "Landkreis München" --stats-geojson ./output/stats.geojson
  bun run bike-share-map --scope bayern-landkreise --stats-api
`)
}

function applyCenterFromFeatures(scope: MapScopeConfig, collection: FeatureCollection) {
  if (collection.features.length === 0) return scope
  const fc = featureCollection(
    collection.features.map((f) => ({
      type: 'Feature' as const,
      geometry: f.geometry,
      properties: {},
    })),
  )
  const c = center(fc)
  const [minX, minY, maxX, maxY] = bbox(fc)
  const span = Math.max(maxX - minX, maxY - minY)
  let zoom = 10
  if (span > 2) zoom = 7
  else if (span > 1) zoom = 8
  else if (span > 0.5) zoom = 9
  else if (span > 0.25) zoom = 10
  else zoom = 11

  return {
    ...scope,
    center: { lng: c.geometry.coordinates[0]!, lat: c.geometry.coordinates[1]! },
    zoom,
  }
}

function resolveStatsGeojsonSource(
  statsGeojson: string | undefined,
  statsApi: string | undefined,
  required: boolean,
) {
  if (statsGeojson) return statsGeojson
  if (statsApi) return statsApi
  if (existsSync(defaultLocalStatsGeojson)) {
    process.stdout.write(`Using local cache: ${defaultLocalStatsGeojson}\n`)
    return defaultLocalStatsGeojson
  }
  if (required) return DEFAULT_STATS_API_URL
  return undefined
}

function parseArgs(argv: string[]) {
  let scopeId: MapScopeId = 'landkreis'
  let statsCsv = fileURLToPath(DEFAULT_STATS_CSV)
  let boundariesGeojson: string | undefined
  let statsGeojson: string | undefined
  let statsApi: string | undefined
  let landkreisId: string | undefined
  let landkreisName: string | undefined
  let fetchMissing = false
  let listLandkreise = false
  let basemap: BasemapId = DEFAULT_BASEMAP

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
    if (arg === '--list-landkreise') {
      listLandkreise = true
    } else if (arg === '--scope' && argv[i + 1]) {
      scopeId = argv[++i] as MapScopeId
    } else if (arg === '--landkreis-id' && argv[i + 1]) {
      landkreisId = argv[++i]!
    } else if (arg === '--landkreis-name' && argv[i + 1]) {
      landkreisName = argv[++i]!
    } else if (arg === '--stats-csv' && argv[i + 1]) {
      statsCsv = resolve(argv[++i]!)
    } else if (arg === '--stats-geojson' && argv[i + 1]) {
      statsGeojson = argv[++i]!
    } else if (arg === '--stats-api') {
      statsApi = argv[i + 1] && !argv[i + 1]?.startsWith('--') ? argv[++i]! : DEFAULT_STATS_API_URL
    } else if (arg === '--boundaries' && argv[i + 1]) {
      boundariesGeojson = resolve(argv[++i]!)
    } else if (arg === '--fetch-missing-boundaries') {
      fetchMissing = true
    } else if (arg === '--basemap' && argv[i + 1]) {
      basemap = parseBasemapId(argv[++i])
    }
  }

  if (listLandkreise) {
    const landkreise = listLandkreiseFromCsv(statsCsv)
    for (const lk of landkreise) {
      process.stdout.write(`${lk.id}\t${lk.name}\n`)
    }
    process.exit(0)
  }

  return {
    scopeId,
    statsCsv,
    boundariesGeojson,
    statsGeojson,
    statsApi,
    landkreisId,
    landkreisName,
    fetchMissing,
    basemap,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  let scope: MapScopeConfig
  let featureCollection: FeatureCollection

  if (args.scopeId === 'landkreis') {
    const landkreis = resolveLandkreisFromCsv(args.statsCsv, {
      id: args.landkreisId,
      name: args.landkreisName,
    })
    scope = buildLandkreisScope(landkreis)

    if (args.boundariesGeojson) {
      process.stdout.write(`Stats CSV:    ${args.statsCsv}\n`)
      process.stdout.write(`Boundaries:   ${args.boundariesGeojson}\n`)
      const stats = parseStatsCsv(args.statsCsv, scope.filter)
      const boundaries = await loadGemeindeBoundaries({
        stats,
        boundariesPath: args.boundariesGeojson,
        fetchMissing: args.fetchMissing,
        cachePath: args.fetchMissing ? join(scriptDir, 'boundaries.cached.geojson') : undefined,
      })
      featureCollection = mergeStatsWithBoundaries(stats, boundaries)
    } else {
      const geojsonSource = resolveStatsGeojsonSource(args.statsGeojson, args.statsApi, true)
      const raw = await loadStatsGeojson(geojsonSource!)
      const gemeindeIds = gemeindeIdsForLandkreisFromCsv(args.statsCsv, landkreis.id)
      featureCollection = buildLandkreisGemeindenFromStatsGeojson(raw, landkreis, gemeindeIds)
    }

    process.stdout.write(
      `Landkreis: ${landkreis.name} (${landkreis.id}) – ${featureCollection.features.length} Gemeinden\n`,
    )
  } else {
    const bayernScope = BAYERN_SCOPES[args.scopeId]
    if (!bayernScope) {
      throw new Error(
        `Unknown scope "${args.scopeId}". Use: landkreis, ${Object.keys(BAYERN_SCOPES).join(', ')}`,
      )
    }
    scope = bayernScope

    const geojsonSource = resolveStatsGeojsonSource(args.statsGeojson, args.statsApi, true)
    const raw = await loadStatsGeojson(geojsonSource!)
    featureCollection = buildFeatureCollectionFromStatsGeojson(raw, scope.filter)
    process.stdout.write(`Regions from stats GeoJSON: ${featureCollection.features.length}\n`)
  }

  if (featureCollection.features.length === 0) {
    throw new Error('No features to render. Check landkreis name/id and stats GeoJSON source.')
  }

  scope = applyCenterFromFeatures(scope, featureCollection)

  const outputDir = join(outputRoot, scope.outputSubdir)
  mkdirSync(outputDir, { recursive: true })

  const geojsonPath = join(outputDir, 'regions_stats.geojson')
  const htmlPath = join(outputDir, 'index.html')
  const generatedAt = new Date().toISOString()

  writeFileSync(geojsonPath, `${JSON.stringify(featureCollection)}\n`, 'utf8')
  writeFileSync(
    htmlPath,
    generateMapHtml(featureCollection, scope, generatedAt, args.basemap),
    'utf8',
  )
  process.stdout.write(`Basemap: ${args.basemap}\n`)

  process.stdout.write(`\nWrote:\n  ${geojsonPath}\n  ${htmlPath}\n`)
  process.stdout.write(`\nOpen: cd ${outputDir} && python3 -m http.server 8765\n`)
}

await main()
