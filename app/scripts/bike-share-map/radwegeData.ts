import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { length as turfLength } from '@turf/turf'
import { z } from 'zod'
import { insideIndex, type LonLat, nearIndex, splitByKey } from './radwegeGeometry'
import {
  AUSBAU,
  announcedYear,
  type Bedarf,
  BELAG,
  type Belag,
  EVENT_KINDS,
  firstStep,
  lineBedarf,
  lineStatus,
  type RouteEvent,
  type StatusGroup,
  WEG,
  type Weg,
} from './radwegeStatus'

/**
 * Source data of the Radwege tracker (radwegePage.ts), committed in radwege/:
 * - routes.json: one entry per route of the Radwegekonzept with its dated public events,
 *   transcribed from schweitenkirchen-research (Radwege-Schweitenkirchen-Aussagen-der-Gemeinde.md,
 *   radwege-schweitenkirchen-2026-11-18.tar.gz → vorgaenge.json); events about the whole network
 *   are in `allgemein`
 * - lines.geojson: the route lines, extracted from the vector Lagepläne by
 *   radwege/extract_lageplan.py (see radwege/README.md)
 */
export const RADWEGE_DIR = join(import.meta.dirname, 'radwege')

const PartialDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
/** `landkreis`: the Landkreis network, which plan 5/2 shows "nachrichtlich" (radwege/landkreis.geojson). */
const Netz = z.enum(['haupt', 'ergaenzend', 'bestand', 'landkreis'])
const Plan = z.enum(['kurz', 'lang'])

const EventSchema = z.strictObject({
  date: PartialDate,
  kind: z.enum(EVENT_KINDS),
  text: z.string().min(1),
  source: z.string().min(1),
  url: z.url(),
  uncertain: z.boolean().optional(),
  /** The source is behind a paywall (link only, own summary). */
  paywall: z.boolean().optional(),
})

const RouteSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  road: z.string().optional(),
  plans: z.partialRecord(Plan, Netz),
  planLabels: z.array(z.string()),
  lengthConceptKm: z.number().positive().optional(),
  built: z.boolean().optional(),
  /** Built, but only as an interim solution (shown as a badge and note). */
  uebergang: z.string().optional(),
  baulast: z.enum(['Gemeinde', 'Landkreis', 'Freistaat', 'unklar']),
  baulastNote: z.string().optional(),
  konzeptHinweis: z.string().optional(),
  kusHorizont: z.string().optional(),
  documented: z.string().optional(),
  events: z.array(EventSchema),
})

export const RoutesFileSchema = z.strictObject({
  stand: PartialDate,
  conceptDate: PartialDate,
  sources: z.strictObject({
    konzeptseite: z.url(),
    erlaeuterung: z.url(),
    kurz: z.url(),
    lang: z.url(),
    kus: z.url(),
  }),
  routes: z.array(RouteSchema),
  /** Events about the network as a whole (concept, budget), not tied to one route. */
  allgemein: z.array(EventSchema).optional(),
  /** Since when each kind of source was searched; drawn under the duration view. */
  quellen: z
    .array(z.strictObject({ label: z.string(), from: PartialDate, note: z.string() }))
    .optional(),
})

const LineProps = z.strictObject({
  routeId: z.string(),
  plan: Plan,
  ausbau: z.enum(AUSBAU),
  /** What the line runs on today (matched OSM way) and its surface; see WEG / BELAG. */
  weg: z.enum(WEG.map((w) => w.id) as [Weg, ...Weg[]]),
  belag: z.enum(BELAG.map((b) => b.id) as [Belag, ...Belag[]]),
  /** Share of the line not matched to an OSM way, i.e. drawn from the plan (0..1). */
  fromPlan: z.number().min(0).max(1),
  osmWays: z.array(z.number()).optional(),
})
const Position = z.tuple([z.number(), z.number()])
export const LinesFileSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      properties: LineProps,
      geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(Position).min(2) }),
    }),
  ),
})

export type RadwegeRoute = z.infer<typeof RouteSchema> & {
  firstStep: RouteEvent | null
  /** Share (0..1) of a short-term-only route along the Landkreis network of plan 5/2. */
  landkreisShare: number | null
  /** Completion year announced in the KUS (kusHorizont), if it names one after `stand`. */
  announcedYear: number | null
  /** Measured length per plan, km. */
  km: Partial<Record<'kurz' | 'lang', number>>
}
export type RadwegeLineProps = z.infer<typeof LineProps> & {
  fid: number
  netz: z.infer<typeof Netz>
  status: StatusGroup
  bedarf: Bedarf
  m: number
  /** Part of the combined view: a short-term piece is left out where plan 5/2 or Bestand covers it. */
  kombi: boolean
  /** Inside the Gemeinde boundary (true when there is no boundary). */
  innen: boolean
}
export type RadwegeData = Omit<z.infer<typeof RoutesFileSchema>, 'routes'> & {
  routes: RadwegeRoute[]
  lines: {
    type: 'FeatureCollection'
    features: {
      type: 'Feature'
      id: number
      properties: RadwegeLineProps
      geometry: { type: 'LineString'; coordinates: [number, number][] }
    }[]
  }
  /** Gemeinde boundary (radwege/gemeinde.geojson), drawn as context. */
  outline: z.infer<typeof OutlineSchema> | null
  /** Landkreis network shown in Lageplan 5/2 (radwege/landkreis.geojson), drawn as context. */
  landkreis: z.infer<typeof LandkreisSchema> | null
  /** The route lines as drawn in the Lagepläne, georeferenced but not matched onto OSM. */
  planlage: z.infer<typeof PlanlageSchema> | null
}

const LandkreisSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      /** vorrang: Radvorrangroute, basis: Basisradnetz (Mobilitätskonzept des Landkreises, 2023) */
      properties: z.object({ netz: z.enum(['vorrang', 'basis']) }),
      geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(Position).min(2) }),
    }),
  ),
})

const PlanlageSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      properties: z.object({ plan: Plan, netz: Netz, dashed: z.boolean() }),
      geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(Position).min(2) }),
    }),
  ),
})

const OutlineSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({ name: z.string() }).loose(),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.unknown()),
  }),
})

/** Plan 5/1 pieces closer than this to a 5/2 or Bestand line count as the same way. */
const KOMBI_NEAR_M = 30

/** Joins routes and lines, derives each line's group, checks that both files agree. */
export function buildRadwegeData(
  routesFile: unknown,
  linesFile: unknown,
  outlineFile: unknown = null,
  landkreisFile: unknown = null,
  planlageFile: unknown = null,
): RadwegeData {
  const { routes, ...meta } = RoutesFileSchema.parse(routesFile)
  const lines = LinesFileSchema.parse(linesFile)
  const byId = new Map(routes.map((r) => [r.id, r]))
  if (byId.size !== routes.length) throw new Error('radwege/routes.json: duplicate route id')

  const outline = outlineFile == null ? null : OutlineSchema.parse(outlineFile)
  const inside = outline
    ? insideIndex(outline.geometry as Parameters<typeof insideIndex>[0])
    : () => true
  const isBestand = (f: (typeof lines.features)[number]) =>
    f.properties.ausbau === 'bestand' || Boolean(byId.get(f.properties.routeId)?.built)
  // Combined view: Bestand first, then plan 5/2, then what plan 5/1 adds where 5/2 has nothing
  // only real Geh- und Radwege: an interim route (the Waldroute) does not stand in for a 5/2 line
  const nearBestand = nearIndex(
    lines.features
      .filter((f) => f.properties.ausbau === 'bestand')
      .map((f) => f.geometry.coordinates),
    KOMBI_NEAR_M,
  )
  const nearLang = nearIndex(
    lines.features.filter((f) => f.properties.plan === 'lang').map((f) => f.geometry.coordinates),
    KOMBI_NEAR_M,
  )

  const km = new Map<string, Partial<Record<'kurz' | 'lang', number>>>()
  const features: RadwegeData['lines']['features'] = []
  for (const f of lines.features) {
    const route = byId.get(f.properties.routeId)
    if (!route) throw new Error(`radwege/lines.geojson: unknown route ${f.properties.routeId}`)
    const netz = route.plans[f.properties.plan]
    if (!netz) {
      throw new Error(
        `radwege/lines.geojson: ${route.id} has a line in plan ${f.properties.plan} but no entry in plans`,
      )
    }
    const kurzBestand = f.properties.plan === 'kurz' && isBestand(f)
    const kombiAt = (p: LonLat) =>
      kurzBestand ||
      (f.properties.plan === 'lang' ? !nearBestand(p) : !nearBestand(p) && !nearLang(p))
    const pieces = splitByKey(
      f.geometry.coordinates,
      (p) => (kombiAt(p) ? 1 : 0) + (inside(p) ? 2 : 0),
    )
    for (const piece of pieces) {
      const geometry = { type: 'LineString' as const, coordinates: piece.coords }
      const m = Math.round(
        turfLength({ type: 'Feature', properties: {}, geometry }, { units: 'meters' }),
      )
      const perPlan = km.get(route.id) ?? {}
      perPlan[f.properties.plan] = (perPlan[f.properties.plan] ?? 0) + m / 1000
      km.set(route.id, perPlan)
      const fid = features.length
      features.push({
        type: 'Feature' as const,
        id: fid,
        properties: {
          ...f.properties,
          fid,
          netz,
          status: lineStatus(route, f.properties.ausbau),
          bedarf: lineBedarf(route, f.properties.ausbau),
          m,
          kombi: Boolean(piece.key & 1),
          innen: Boolean(piece.key & 2),
        },
        geometry,
      })
    }
  }

  for (const r of routes) {
    for (const plan of Object.keys(r.plans) as ('kurz' | 'lang')[]) {
      if (!km.get(r.id)?.[plan])
        throw new Error(`radwege: route ${r.id} has no line in plan ${plan}`)
    }
  }

  const landkreis = landkreisFile == null ? null : LandkreisSchema.parse(landkreisFile)
  const byDate = (a: { date: string }, b: { date: string }) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  return {
    ...meta,
    allgemein: [...(meta.allgemein ?? [])].sort(byDate),
    routes: routes.map((r) => ({
      ...r,
      events: [...r.events].sort(byDate),
      firstStep: firstStep(r.events),
      landkreisShare:
        landkreis && Object.keys(r.plans).join() === 'kurz' && !r.built
          ? shareNear(
              features
                .filter((f) => f.properties.routeId === r.id)
                .map((f) => f.geometry.coordinates),
              landkreis.features.map((f) => f.geometry.coordinates),
            )
          : null,
      announcedYear: announcedYear(r.kusHorizont, meta.stand),
      km: Object.fromEntries(
        Object.entries(km.get(r.id) ?? {}).map(([k, v]) => [k, Math.round(v * 100) / 100]),
      ),
    })),
    lines: { type: 'FeatureCollection', features },
    outline,
    landkreis,
    planlage: planlageFile == null ? null : PlanlageSchema.parse(planlageFile),
  }
}

export function loadRadwegeData(dir = RADWEGE_DIR) {
  return buildRadwegeData(
    JSON.parse(readFileSync(join(dir, 'routes.json'), 'utf8')),
    JSON.parse(readFileSync(join(dir, 'lines.geojson'), 'utf8')),
    optionalJson(join(dir, 'gemeinde.geojson')),
    optionalJson(join(dir, 'landkreis.geojson')),
    optionalJson(join(dir, 'planlage.geojson')),
  )
}

const optionalJson = (path: string): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null

/** Share of the length of `lines` within NEAR_M of any of `targets`, sampled every ~20 m. */
const NEAR_M = 60
function shareNear(lines: LonLat[][], targets: LonLat[][]) {
  const near = nearIndex(targets, NEAR_M)
  let total = 0,
    hit = 0
  for (const l of lines) {
    for (const piece of splitByKey(l, near, 0)) {
      const m = turfLength(
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: piece.coords },
        },
        { units: 'meters' },
      )
      total += m
      if (piece.key) hit += m
    }
  }
  return total ? Math.round((hit / total) * 100) / 100 : 0
}
