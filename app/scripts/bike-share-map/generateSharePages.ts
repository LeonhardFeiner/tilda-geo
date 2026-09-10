#!/usr/bin/env bun
/**
 * Per-region share pages (see sharePages.ts for the text/HTML/SVG logic). Reads
 * output/stats.geojson (already produced by export-stats-geojson.ts) and, for every
 * Gemeinde/Landkreis/Bundesland that has at least one comparable peer, writes:
 *   output/viewer/r/<slug>.html  – OG-tagged stub that redirects into the live viewer
 *   output/viewer/r/<slug>.png   – rendered Open Graph card (only within SHARE_PAGE_OG_IMAGE_BUNDESLAENDER;
 *                                  everything else falls back to r/og-default.png)
 * Run standalone via `bun run bike-share-map:share-pages`, or automatically at the end of
 * `bike-share-map:viewer`.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { SHARE_PAGE_BASE_URL, SHARE_PAGE_OG_IMAGE_BUNDESLAENDER } from './constants'
import {
  buildDemographicPeerSummaries,
  type DemographicPeerSummary,
  type PeerDemographics,
} from './demographicPeers'
import {
  buildShareRegionSummaries,
  shareOgSvg,
  shareRedirectQuery,
  shareStubHtml,
  slugForId,
  type ShareRegionInput,
} from './sharePages'
import { RADINFRA_DEFAULT_FILTER, computeFilteredLengths } from './statsClassSums'

const scriptDir = import.meta.dir
const outDir = join(scriptDir, 'output')
const geojsonPath = join(outDir, 'stats.geojson')
const demographicsPath = join(outDir, 'gemeinde-demographics.json')
const shareDir = join(outDir, 'viewer', 'r')

type StatsFeature = {
  properties?: Record<string, unknown> | null
}

async function loadFeatures(): Promise<StatsFeature[]> {
  if (!existsSync(geojsonPath)) {
    process.stderr.write(
      `Skipping share pages: ${geojsonPath} missing – run bike-share-map:export-stats-geojson first.\n`,
    )
    return []
  }
  const raw = JSON.parse(await Bun.file(geojsonPath).text()) as { features?: StatsFeature[] }
  return raw.features ?? []
}

/** RS → population/urbanization from fetchGemeindeDemographics.ts; absent if not fetched yet. */
async function loadDemographicsByRs(): Promise<Map<string, PeerDemographics>> {
  if (!existsSync(demographicsPath)) {
    process.stderr.write(
      `No demographic peer comparison: ${demographicsPath} missing – ` +
        `run bike-share-map:gemeinde-demographics to enable it.\n`,
    )
    return new Map()
  }
  const raw = JSON.parse(await Bun.file(demographicsPath).text()) as {
    gemeinden?: Array<{
      rs: string
      population: number
      urbanizationCode: PeerDemographics['urbanizationCode']
    }>
  }
  return new Map(
    (raw.gemeinden ?? []).map((g) => [
      g.rs,
      { population: g.population, urbanizationCode: g.urbanizationCode },
    ]),
  )
}

function shareRegionInputFromFeature(f: StatsFeature): ShareRegionInput | null {
  const p = f.properties
  if (!p) return null
  const id = String(p.id ?? '')
  const level = String(p.level ?? '')
  if (!id || !level) return null
  const { roadKm, bikeKm } = computeFilteredLengths(
    p.road_length,
    p.bikelane_length,
    RADINFRA_DEFAULT_FILTER,
  )
  return {
    id,
    name: String(p.name ?? id),
    level,
    roadSumKm: roadKm,
    bikelaneSumKm: bikeKm,
    bikeSharePct: roadKm > 0 ? (bikeKm / roadKm) * 100 : null,
    bundeslandId: p.bundesland_id ? String(p.bundesland_id) : undefined,
    landkreisId: p.landkreis_id ? String(p.landkreis_id) : undefined,
  }
}

/** Runs `items` through `task` with at most `concurrency` in flight at once. */
async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]!
      await task(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

function ogImageIsInScope(region: ShareRegionInput) {
  if (SHARE_PAGE_OG_IMAGE_BUNDESLAENDER.includes('all')) return true
  const bundeslandId = region.level === '4' ? region.id : region.bundeslandId
  return !!bundeslandId && SHARE_PAGE_OG_IMAGE_BUNDESLAENDER.includes(bundeslandId)
}

export async function generateSharePages() {
  const features = await loadFeatures()
  if (!features.length) return { stubCount: 0, imageCount: 0, peerCount: 0 }

  const nameById = new Map<string, string>()
  const rsById = new Map<string, string>()
  let deutschlandId = ''
  const regions: ShareRegionInput[] = []
  for (const f of features) {
    const p = f.properties
    if (!p) continue
    const id = String(p.id ?? '')
    if (id) nameById.set(id, String(p.name ?? id))
    if (id && p.regionalschluessel) rsById.set(id, String(p.regionalschluessel))
    if (String(p.level ?? '') === '2') deutschlandId = id
    const input = shareRegionInputFromFeature(f)
    if (input && ['4', '6', '8'].includes(input.level)) regions.push(input)
  }

  const summaries = buildShareRegionSummaries(regions, nameById)
  if (!summaries.size) return { stubCount: 0, imageCount: 0, peerCount: 0 }

  const demographicsByRs = await loadDemographicsByRs()
  const peerSummaries: Map<string, DemographicPeerSummary> = demographicsByRs.size
    ? buildDemographicPeerSummaries(
        regions.filter((r) => r.level === '8'),
        demographicsByRs,
        rsById,
      )
    : new Map()
  for (const [id, peerGroup] of peerSummaries) {
    const summary = summaries.get(id)
    if (summary) summary.peerGroup = peerGroup
  }

  mkdirSync(shareDir, { recursive: true })

  const dataDateLabel = existsSync(geojsonPath)
    ? statSync(geojsonPath).mtime.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : ''

  writeFileSync(
    join(shareDir, 'og-default.png'),
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
          <rect width="1200" height="630" fill="#0d3b2e" />
          <text x="60" y="300" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff">Radinfra-Vergleich</text>
          <text x="60" y="380" font-family="Arial, sans-serif" font-size="34" fill="#cfe8dd">Wie viel Prozent der Straßen haben Radwege?</text>
          <text x="60" y="580" font-family="Arial, sans-serif" font-size="21" fill="#8fb9ab">Daten: OpenStreetMap</text>
        </svg>`,
      ),
    )
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )

  const entries = [...summaries.values()]
  let imageCount = 0
  await runPool(entries, 8, async (summary) => {
    const slug = slugForId(summary.id)
    const inScope = ogImageIsInScope(summary)
    const ogImageFile = inScope ? `${slug}.png` : null
    const html = shareStubHtml(summary, {
      baseUrl: SHARE_PAGE_BASE_URL,
      redirectQuery: shareRedirectQuery(summary, deutschlandId),
      ogImageFile,
      dataDateLabel,
    })
    writeFileSync(join(shareDir, `${slug}.html`), html, 'utf8')
    if (inScope) {
      const png = await sharp(Buffer.from(shareOgSvg(summary)))
        .png({ compressionLevel: 9 })
        .toBuffer()
      writeFileSync(join(shareDir, `${slug}.png`), png)
      imageCount++
    }
  })

  writeFileSync(
    join(shareDir, 'index.json'),
    JSON.stringify(
      entries.map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
        slug: slugForId(s.id),
        rank: s.rank,
        total: s.total,
        ...(s.peerGroup ? { peerRank: s.peerGroup.rank, peerTotal: s.peerGroup.total } : {}),
      })),
    ),
    'utf8',
  )

  return { stubCount: entries.length, imageCount, peerCount: peerSummaries.size }
}

if (import.meta.main) {
  const { stubCount, imageCount, peerCount } = await generateSharePages()
  process.stdout.write(
    `Share pages: ${stubCount} stubs, ${imageCount} OG images, ${peerCount} with a demographic peer comparison → ${shareDir}\n`,
  )
}
