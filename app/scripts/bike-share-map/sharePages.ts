import type { DemographicPeerSummary } from './demographicPeers'
import { bikelaneGapKm, computeViewBenchmark, type ViewBenchmarkStat } from './rankingDisplay'
import { formatStatKm, formatStatPctUi, STAT_KM_BIKE_UI_DECIMALS } from './statsClassSums'

/**
 * Per-region share pages: a static `r/<slug>.html` stub per Gemeinde/Landkreis/Bundesland that
 * carries the region's real numbers in its Open Graph tags (so a shared link renders a real
 * headline instead of a blank card) and redirects into the live viewer. See generateSharePages.ts
 * for the I/O side (reading stats.geojson, writing files, rendering OG images).
 */

export type ShareRegionInput = {
  id: string
  name: string
  level: string
  roadSumKm: number
  bikelaneSumKm: number
  bikeSharePct: number | null
  bundeslandId?: string
  landkreisId?: string
}

export type ShareGroupKind =
  | 'gemeinden_in_landkreis'
  | 'landkreise_in_bundesland'
  | 'bundeslaender_in_deutschland'

export type ShareRegionSummary = ShareRegionInput & {
  bikeSharePct: number
  groupKind: ShareGroupKind
  groupName: string
  rank: number
  total: number
  medianPct: number
  gapKm: number
  behind: boolean
  leaderName: string | null
  leaderPct: number | null
  leaderGapKm: number | null
  /**
   * Optional: this region's rank among demographic peers nationwide (same population band +
   * urbanization tier — see demographicPeers.ts), regardless of Landkreis/Bundesland. Attached
   * by generateSharePages.ts after buildShareRegionSummaries, since it needs the separate
   * Destatis dataset. Closes off "we're just rural, of course we're behind".
   */
  peerGroup?: DemographicPeerSummary
}

/** A stub without at least this many peers has nothing to compare against — skip it. */
const MIN_STUB_GROUP = 2

function groupKindForLevel(level: string): ShareGroupKind | null {
  if (level === '8') return 'gemeinden_in_landkreis'
  if (level === '6') return 'landkreise_in_bundesland'
  if (level === '4') return 'bundeslaender_in_deutschland'
  return null
}

/** Groups a region with its natural peers: Gemeinden by Landkreis, Landkreise by Bundesland. */
export function comparisonGroupKey(
  r: Pick<ShareRegionInput, 'level' | 'bundeslandId' | 'landkreisId'>,
): string | null {
  if (r.level === '8') return r.landkreisId ? `lk:${r.landkreisId}` : null
  if (r.level === '6') return `bl:${r.bundeslandId || 'unbekannt'}`
  if (r.level === '4') return 'de'
  return null
}

function groupDisplayName(
  kind: ShareGroupKind,
  sample: ShareRegionInput,
  nameById: ReadonlyMap<string, string>,
) {
  if (kind === 'gemeinden_in_landkreis') {
    return nameById.get(sample.landkreisId ?? '') ?? 'diesem Landkreis'
  }
  if (kind === 'landkreise_in_bundesland') {
    return nameById.get(sample.bundeslandId ?? '') ?? 'diesem Bundesland'
  }
  return 'Deutschland'
}

/**
 * One summary per region that has ≥1 usable peer: its rank and the median/leader of its
 * comparison group, using the same benchmark math as the region-detail gap callout in the
 * viewer itself (computeViewBenchmark / bikelaneGapKm).
 */
export function buildShareRegionSummaries(
  regions: ShareRegionInput[],
  nameById: ReadonlyMap<string, string>,
): Map<string, ShareRegionSummary> {
  const groups = new Map<string, ShareRegionInput[]>()
  for (const r of regions) {
    const key = comparisonGroupKey(r)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  const out = new Map<string, ShareRegionSummary>()
  for (const group of groups.values()) {
    if (group.length < MIN_STUB_GROUP) continue
    const first = group[0]
    if (!first) continue
    const kind = groupKindForLevel(first.level)
    if (!kind) continue
    const bench = computeViewBenchmark(group as ViewBenchmarkStat[])
    if (!bench) continue

    const ranked = group
      .filter(
        (r): r is ShareRegionInput & { bikeSharePct: number } => typeof r.bikeSharePct === 'number',
      )
      .sort((a, b) => b.bikeSharePct - a.bikeSharePct)
    const rankById = new Map(ranked.map((r, i) => [r.id, i + 1]))
    const groupName = groupDisplayName(kind, first, nameById)

    for (const r of ranked) {
      const rank = rankById.get(r.id)
      if (!rank) continue
      const leaderIsSelf = bench.leaderId === r.id
      out.set(r.id, {
        ...r,
        groupKind: kind,
        groupName,
        rank,
        total: ranked.length,
        medianPct: bench.medianPct,
        gapKm: bikelaneGapKm(r, bench.medianPct),
        behind: r.bikeSharePct < bench.medianPct - 0.05,
        leaderName: leaderIsSelf ? null : (bench.leaderName ?? null),
        leaderPct: leaderIsSelf ? null : bench.leaderPct,
        leaderGapKm: leaderIsSelf ? null : bikelaneGapKm(r, bench.leaderPct),
      })
    }
  }
  return out
}

export function shareRankPhrase(s: Pick<ShareRegionSummary, 'rank' | 'total'>) {
  if (s.total > 1 && s.rank === s.total) return 'letzter Platz'
  return `Platz ${s.rank} von ${s.total}`
}

export function groupLocationPhrase(s: Pick<ShareRegionSummary, 'groupKind' | 'groupName'>) {
  if (s.groupKind === 'gemeinden_in_landkreis') {
    // The OSM relation name is usually already "Landkreis X" — don't say it twice.
    return s.groupName.startsWith('Landkreis ')
      ? `im ${s.groupName}`
      : `im Landkreis ${s.groupName}`
  }
  if (s.groupKind === 'landkreise_in_bundesland') return `in ${s.groupName}`
  return 'in Deutschland'
}

export function shareHeadline(s: ShareRegionSummary) {
  const pct = formatStatPctUi(s.bikeSharePct)
  const prefix = s.behind ? 'nur ' : ''
  return `${s.name}: ${prefix}${pct} % Radinfra – ${shareRankPhrase(s)} ${groupLocationPhrase(s)}`
}

/**
 * The Landkreis/Bundesland comparison above can be dismissed as "of course, we're rural" —
 * this adds the harder-to-dismiss one: rank among Gemeinden nationwide with a similar
 * population and the same urbanization tier (see demographicPeers.ts).
 */
function peerGroupSentence(s: ShareRegionSummary): string {
  const peer = s.peerGroup
  if (!peer) return ''
  if (peer.behind) {
    return ` Auch unter vergleichbaren Gemeinden bundesweit (${peer.groupLabel}) reicht es nur zu ${shareRankPhrase(peer)}.`
  }
  return ` Unter vergleichbaren Gemeinden bundesweit (${peer.groupLabel}) liegt ${s.name} über dem Median.`
}

export function shareDescription(s: ShareRegionSummary, dataDateLabel: string) {
  const pct = formatStatPctUi(s.bikeSharePct)
  const median = formatStatPctUi(s.medianPct)
  const base = `${pct} % der Straßen in ${s.name} haben Radinfrastruktur (${shareRankPhrase(s)} ${groupLocationPhrase(s)}).`
  const peerSentence = peerGroupSentence(s)
  if (s.behind) {
    const gapKm = formatStatKm(s.gapKm, STAT_KM_BIKE_UI_DECIMALS)
    return `${base} Bis zum Mittelwert (${median} %) fehlen rund ${gapKm} km.${peerSentence} Daten: OpenStreetMap, Stand ${dataDateLabel}.`
  }
  return `${base} Median: ${median} %.${peerSentence} Daten: OpenStreetMap, Stand ${dataDateLabel}.`
}

export function slugForId(id: string) {
  return id.replace(/[^a-zA-Z0-9]+/g, '-')
}

/** URL params for the live viewer that focus the region's comparison group and open its card. */
export function shareRedirectParams(
  s: Pick<ShareRegionSummary, 'id' | 'groupKind' | 'bundeslandId'>,
  deutschlandId: string,
): Record<string, string> {
  if (s.groupKind === 'gemeinden_in_landkreis') {
    return { ui: 'simple', focus: s.id, simple: 'lk_gemeinden', region: s.id }
  }
  if (s.groupKind === 'landkreise_in_bundesland') {
    return {
      ui: 'simple',
      focus: s.bundeslandId || deutschlandId,
      simple: 'bl_landkreis_kreisfrei',
      region: s.id,
    }
  }
  return { ui: 'simple', focus: deutschlandId, simple: 'de_bundeslaender', region: s.id }
}

export function shareRedirectQuery(
  s: Pick<ShareRegionSummary, 'id' | 'groupKind' | 'bundeslandId'>,
  deutschlandId: string,
) {
  return new URLSearchParams(shareRedirectParams(s, deutschlandId)).toString()
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type ShareStubOptions = {
  baseUrl: string
  redirectQuery: string
  /** Filename under r/ to use as og:image, e.g. "relation-396557.png"; falls back to the generic card. */
  ogImageFile: string | null
  dataDateLabel: string
}

/**
 * A tiny static page: rich OG/Twitter tags with this region's real numbers (for link-preview
 * crawlers, which don't run JS), a meta-refresh + JS redirect into the live viewer for humans,
 * and a plain fallback card in case both redirects are blocked.
 */
export function shareStubHtml(s: ShareRegionSummary, opts: ShareStubOptions) {
  const headline = escapeHtml(shareHeadline(s))
  const description = escapeHtml(shareDescription(s, opts.dataDateLabel))
  const redirectUrl = `../index.html?${opts.redirectQuery}`
  const canonical = `${opts.baseUrl}index.html?${opts.redirectQuery}`
  const ogImageUrl = `${opts.baseUrl}r/${opts.ogImageFile ?? 'og-default.png'}`
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${headline}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${headline}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${headline}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${ogImageUrl}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectUrl)}" />
<script>location.replace(${JSON.stringify(redirectUrl)});</script>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, sans-serif; background: #0d3b2e; color: #fff; padding: 24px; box-sizing: border-box; }
  main { max-width: 480px; text-align: center; }
  h1 { font-size: 20px; line-height: 1.4; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.5; color: #cfe8dd; margin: 0 0 20px; }
  a { display: inline-block; background: #fff; color: #0d3b2e; text-decoration: none;
    font-weight: 600; padding: 10px 20px; border-radius: 6px; }
</style>
</head>
<body>
  <main>
    <h1>${headline}</h1>
    <p>${description}</p>
    <a href="${escapeHtml(redirectUrl)}">Zur Karte →</a>
  </main>
</body>
</html>
`
}

const OG_TEXT_MAX_WIDTH = 1080 // 1200 canvas minus the 60px side margins

/**
 * Rough width estimate for bold sans-serif at `size` (no canvas available at build time) —
 * shrinks a line's font size until it should clear `OG_TEXT_MAX_WIDTH`, so long Landkreis/
 * Gemeinde names (or a wider SHARE_PAGE_OG_IMAGE_BUNDESLAENDER scope than the default) don't
 * silently run off the card.
 */
function fitFontSize(text: string, baseSize: number, minSize: number) {
  let size = baseSize
  while (size > minSize && text.length * size * 0.56 > OG_TEXT_MAX_WIDTH) size -= 2
  return size
}

/** 1200×630 (the standard summary_large_image ratio) Open Graph card for one region. */
export function shareOgSvg(s: ShareRegionSummary) {
  const pct = formatStatPctUi(s.bikeSharePct)
  const accent = s.behind ? '#ff6b5b' : '#7ee787'
  const bg = s.behind ? '#3a1414' : '#0d3b2e'
  const rankLineText = `${shareRankPhrase(s)} ${groupLocationPhrase(s)}`
  const subLineText = s.behind
    ? `Es fehlen rund ${formatStatKm(s.gapKm, STAT_KM_BIKE_UI_DECIMALS)} km bis zum Mittelwert (${formatStatPctUi(s.medianPct)} %)`
    : `Median dieser Auswahl: ${formatStatPctUi(s.medianPct)} %`
  const peer = s.peerGroup
  const peerLineText = peer
    ? peer.behind
      ? `Vergleichbare Gemeinden bundesweit (${peer.groupLabel}): ${shareRankPhrase(peer)}`
      : `Vergleichbare Gemeinden bundesweit (${peer.groupLabel}): über dem Median`
    : ''
  const nameSize = fitFontSize(s.name, 38, 22)
  const rankSize = fitFontSize(rankLineText, 32, 20)
  const subSize = fitFontSize(subLineText, 25, 17)
  const peerSize = fitFontSize(peerLineText, 24, 15)
  const name = escapeHtml(s.name)
  const rankLine = escapeHtml(rankLineText)
  const subLine = escapeHtml(subLineText)
  const peerLine = peerLineText
    ? `<text x="60" y="512" font-family="Arial, sans-serif" font-size="${peerSize}" fill="#9fc7ba">${escapeHtml(peerLineText)}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${bg}" />
  <text x="60" y="110" font-family="Arial, sans-serif" font-size="${nameSize}" font-weight="700" fill="#ffffff">${name}</text>
  <text x="60" y="280" font-family="Arial, sans-serif" font-size="150" font-weight="800" fill="${accent}">${pct} %</text>
  <text x="60" y="330" font-family="Arial, sans-serif" font-size="28" fill="#ffffff">Radinfrastruktur an Straßen (km)</text>
  <text x="60" y="410" font-family="Arial, sans-serif" font-size="${rankSize}" font-weight="600" fill="#ffffff">${rankLine}</text>
  <text x="60" y="458" font-family="Arial, sans-serif" font-size="${subSize}" fill="#cfe8dd">${subLine}</text>
  ${peerLine}
  <text x="60" y="580" font-family="Arial, sans-serif" font-size="21" fill="#8fb9ab">Radinfra-Vergleich · Daten: OpenStreetMap</text>
</svg>`
}
