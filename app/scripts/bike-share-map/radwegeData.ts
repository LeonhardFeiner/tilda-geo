import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { length as turfLength } from '@turf/turf'
import { z } from 'zod'
import {
  AUSBAU,
  announcedYear,
  BELAG,
  type Belag,
  EVENT_KINDS,
  firstStep,
  lineStatus,
  type RouteEvent,
  type StatusGroup,
  WEG,
  type Weg,
} from './radwegeStatus'

/**
 * Source data of the Radwege tracker (radwegePage.ts), committed in radwege/:
 * - routes.json: one entry per route of the Radwegekonzept with its dated public events,
 *   transcribed from schweitenkirchen-research (Radwege-Schweitenkirchen-Aussagen-der-Gemeinde.md)
 * - lines.geojson: the route lines, extracted from the vector Lagepläne by
 *   radwege/extract_lageplan.py (see radwege/README.md)
 */
export const RADWEGE_DIR = join(import.meta.dirname, 'radwege')

const PartialDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
const Netz = z.enum(['haupt', 'ergaenzend', 'bestand'])
const Plan = z.enum(['kurz', 'lang'])

const EventSchema = z.strictObject({
  date: PartialDate,
  kind: z.enum(EVENT_KINDS),
  text: z.string().min(1),
  source: z.string().min(1),
  url: z.url(),
  uncertain: z.boolean().optional(),
})

const RouteSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  road: z.string().optional(),
  plans: z.partialRecord(Plan, Netz),
  planLabels: z.array(z.string()),
  lengthConceptKm: z.number().positive().optional(),
  built: z.boolean().optional(),
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
  /** Completion year announced in the KUS (kusHorizont), if it names one after `stand`. */
  announcedYear: number | null
  /** Measured length per plan, km. */
  km: Partial<Record<'kurz' | 'lang', number>>
}
export type RadwegeLineProps = z.infer<typeof LineProps> & {
  fid: number
  netz: z.infer<typeof Netz>
  status: StatusGroup
  m: number
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

const OutlineSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({ name: z.string() }).loose(),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.unknown()),
  }),
})

/** Joins routes and lines, derives each line's group, checks that both files agree. */
export function buildRadwegeData(
  routesFile: unknown,
  linesFile: unknown,
  outlineFile: unknown = null,
  landkreisFile: unknown = null,
): RadwegeData {
  const { routes, ...meta } = RoutesFileSchema.parse(routesFile)
  const lines = LinesFileSchema.parse(linesFile)
  const byId = new Map(routes.map((r) => [r.id, r]))
  if (byId.size !== routes.length) throw new Error('radwege/routes.json: duplicate route id')

  const km = new Map<string, Partial<Record<'kurz' | 'lang', number>>>()
  const features = lines.features.map((f, fid) => {
    const route = byId.get(f.properties.routeId)
    if (!route) throw new Error(`radwege/lines.geojson: unknown route ${f.properties.routeId}`)
    const netz = route.plans[f.properties.plan]
    if (!netz) {
      throw new Error(
        `radwege/lines.geojson: ${route.id} has a line in plan ${f.properties.plan} but no entry in plans`,
      )
    }
    const m = Math.round(turfLength(f, { units: 'meters' }))
    const perPlan = km.get(route.id) ?? {}
    perPlan[f.properties.plan] = (perPlan[f.properties.plan] ?? 0) + m / 1000
    km.set(route.id, perPlan)
    return {
      type: 'Feature' as const,
      id: fid,
      properties: {
        ...f.properties,
        fid,
        netz,
        status: lineStatus(route, f.properties.ausbau),
        m,
      },
      geometry: f.geometry,
    }
  })

  for (const r of routes) {
    for (const plan of Object.keys(r.plans) as ('kurz' | 'lang')[]) {
      if (!km.get(r.id)?.[plan])
        throw new Error(`radwege: route ${r.id} has no line in plan ${plan}`)
    }
  }

  return {
    ...meta,
    routes: routes.map((r) => ({
      ...r,
      events: [...r.events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
      firstStep: firstStep(r.events),
      announcedYear: announcedYear(r.kusHorizont, meta.stand),
      km: Object.fromEntries(
        Object.entries(km.get(r.id) ?? {}).map(([k, v]) => [k, Math.round(v * 100) / 100]),
      ),
    })),
    lines: { type: 'FeatureCollection', features },
    outline: outlineFile == null ? null : OutlineSchema.parse(outlineFile),
    landkreis: landkreisFile == null ? null : LandkreisSchema.parse(landkreisFile),
  }
}

export function loadRadwegeData(dir = RADWEGE_DIR) {
  return buildRadwegeData(
    JSON.parse(readFileSync(join(dir, 'routes.json'), 'utf8')),
    JSON.parse(readFileSync(join(dir, 'lines.geojson'), 'utf8')),
    optionalJson(join(dir, 'gemeinde.geojson')),
    optionalJson(join(dir, 'landkreis.geojson')),
  )
}

const optionalJson = (path: string): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
