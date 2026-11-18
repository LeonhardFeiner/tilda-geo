/**
 * Progress groups of the Radwege tracker (radwegePage.ts). The group of a line is derived from
 * the dated public events of its route (radwege/routes.json) and from what the plan says has to
 * be built there; it is never typed in by hand.
 */

/** Date of the municipal Radwegekonzept (WipflerPLAN, Lagepläne 5/1 and 5/2). */
export const CONCEPT_DATE = '2024-06-07'

/** Events that count as a step by the responsible body ("begonnen"). */
export const STEP_KINDS = [
  'Programm',
  'Beschluss',
  'Grunderwerb',
  'Planung',
  'Haushalt',
  'Bau',
  'Eröffnung',
] as const
/** Context only: shown in the timeline, never decides the group. */
export const CONTEXT_KINDS = ['Aussage', 'Ankündigung', 'Anfrage'] as const
export const EVENT_KINDS = [...STEP_KINDS, ...CONTEXT_KINDS] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export type RouteEvent = {
  /** YYYY, YYYY-MM or YYYY-MM-DD. */
  date: string
  kind: EventKind
  text: string
  source: string
  url: string
  /** The research could not tie the event to this route for sure ("möglicherweise verwandt"). */
  uncertain?: boolean
  paywall?: boolean
}

/**
 * How a line is meant to be realised:
 * - `freigabe`: short-term plan 5/1, which the concept defines as release and signage of existing ways
 * - `bestand-weg`: long-term plan 5/2, dashed ("best. asph. Weg")
 * - `voll`: long-term plan 5/2, solid ("Vollausbau")
 * - `bestand`: drawn as an existing asphalt Geh- und Radweg in plan 5/1
 * - `kein-weg`: plan 5/1, but the line follows no existing way, or only the carriageway of a
 *   Staats- or Kreisstraße, so there is nothing to release (radwege/pipeline/assign.py)
 */
export const AUSBAU = ['freigabe', 'bestand-weg', 'voll', 'bestand', 'kein-weg'] as const
export type Ausbau = (typeof AUSBAU)[number]

/** `hint`: one sentence for the legend and the detail view of the tracker page. */
export const STATUS_GROUPS = [
  {
    id: 'bestand',
    label: 'Vorhanden',
    hint: 'Der Weg ist gebaut und befahrbar.',
    colour: '#1a7f37',
  },
  {
    id: 'vor-konzept',
    label: 'Begonnen vor dem Konzept',
    hint: 'Erster dokumentierter Schritt (Beschluss, Grunderwerb, Planung, Programm, Haushalt) vor dem 07.06.2024.',
    colour: '#1f5fae',
  },
  {
    id: 'seit-konzept',
    label: 'Begonnen seit dem Konzept',
    hint: 'Erster dokumentierter Schritt am oder nach dem 07.06.2024.',
    colour: '#8e44ad',
  },
  {
    id: 'nur-freigabe',
    label: 'Nur Schilder/Freigabe nötig – nichts dokumentiert',
    hint: 'Laut Konzept genügt es, einen vorhandenen Weg für Räder freizugeben und zu beschildern; öffentlich dokumentiert ist dazu nichts.',
    colour: '#d68910',
  },
  {
    id: 'kein-schritt',
    label: 'Neubau nötig – nichts dokumentiert',
    hint: 'Hier gibt es keinen Weg, den man nur freigeben könnte: Plan 5/2 sieht einen Neubau vor, oder die Linie in Plan 5/1 folgt keinem vorhandenen Weg bzw. nur der Fahrbahn einer Kreis- oder Staatsstraße. Öffentlich dokumentiert ist dazu nichts.',
    colour: '#c0392b',
  },
] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]['id']

const isStep = (e: RouteEvent) => !e.uncertain && (STEP_KINDS as readonly string[]).includes(e.kind)

/** Last day a partial date can stand for: '2024' → '2024-12-31', '2024-02' → '2024-02-29'. */
export function dateUpperBound(date: string) {
  if (/^\d{4}$/.test(date)) return `${date}-12-31`
  const m = /^(\d{4})-(\d{2})$/.exec(date)
  if (m) {
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
    return `${date}-${String(last).padStart(2, '0')}`
  }
  return date
}

/** The earliest certain step, or null. Partial dates sort by their first day. */
export function firstStep(events: readonly RouteEvent[]) {
  const steps = events.filter(isStep)
  steps.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return steps[0] ?? null
}

/**
 * First year named in a KUS horizon that lies after the research date ("ab 2028 ff." → 2028), for
 * the announced part of the duration view; null when the text names no future year.
 */
export function announcedYear(horizon: string | undefined, stand: string) {
  const standYear = Number(stand.slice(0, 4))
  // 2020–2039 only, and not a road number ("St 2045", "PAF 2045")
  for (const m of (horizon ?? '').matchAll(/(?<![A-Z]{2,3}\s?)\b(20[23]\d)\b/g)) {
    if (Number(m[1]) > standYear) return Number(m[1])
  }
  return null
}

/**
 * Group of one line. A built route is `bestand`; otherwise the first certain step decides
 * before/since the concept ("before" only if the whole period of a partial date lies before it);
 * without a step, lines on an existing way are `nur-freigabe`, the rest (`voll`, `kein-weg`)
 * `kein-schritt`.
 */
export function lineStatus(
  route: { built?: boolean; events: readonly RouteEvent[] },
  ausbau: Ausbau,
): StatusGroup {
  if (route.built || ausbau === 'bestand') return 'bestand'
  const step = firstStep(route.events)
  if (step) return dateUpperBound(step.date) < CONCEPT_DATE ? 'vor-konzept' : 'seit-konzept'
  return ausbau === 'voll' || ausbau === 'kein-weg' ? 'kein-schritt' : 'nur-freigabe'
}

/**
 * What a line runs on today, from the OSM way it is matched onto (radwege/pipeline/assign.py),
 * ordered from separated from motor traffic to the busiest road. Independent of the plans.
 */
export const WEG = [
  {
    id: 'radweg',
    label: 'Eigener Geh- und Radweg',
    hint: 'Getrennt vom Kfz-Verkehr.',
    colour: '#0b7a4b',
  },
  {
    id: 'feldweg',
    label: 'Feld- oder Waldweg',
    hint: 'Kaum Kfz-Verkehr, vor allem Landwirtschaft und Anlieger.',
    colour: '#7a9a01',
  },
  {
    id: 'ortsstrasse',
    label: 'Gemeinde- oder Ortsstraße',
    hint: 'Mischverkehr mit Autos auf Gemeindeverbindungs-, Orts- und Erschließungsstraßen.',
    colour: '#1f5fae',
  },
  {
    id: 'kreisstrasse',
    label: 'Kreisstraße (PAF …)',
    hint: 'Mischverkehr auf der Fahrbahn einer Kreisstraße, ohne eigenen Radweg.',
    colour: '#e8590c',
  },
  {
    id: 'staatsstrasse',
    label: 'Staatsstraße (St …)',
    hint: 'Mischverkehr auf der Fahrbahn einer Staats- oder Bundesstraße, ohne eigenen Radweg.',
    colour: '#9c1c3c',
  },
  {
    id: 'kein',
    label: 'Kein Weg vorhanden',
    hint: 'In OpenStreetMap liegt hier kein Weg; die Linie ist nur aus dem Lageplan übertragen.',
    colour: '#8a8f98',
  },
] as const
export type Weg = (typeof WEG)[number]['id']

/** Surface of that OSM way; classified roads without a tag count as asphalt. */
export const BELAG = [
  { id: 'asphalt', label: 'Asphalt oder Pflaster', hint: 'Befestigt.', colour: '#1f5fae' },
  {
    id: 'schotter',
    label: 'Schotter oder wassergebunden',
    hint: 'Kies, Splitt, verdichteter Belag.',
    colour: '#b07d00',
  },
  {
    id: 'natur',
    label: 'Naturboden oder Wiese',
    hint: 'Erde, Gras, unbefestigt.',
    colour: '#8e4a1c',
  },
  {
    id: 'unbekannt',
    label: 'Belag nicht erfasst',
    hint: 'In OpenStreetMap ist für diesen Weg kein Belag eingetragen.',
    colour: '#c3c7cc',
  },
  {
    id: 'kein',
    label: 'Kein Weg vorhanden',
    hint: 'In OpenStreetMap liegt hier kein Weg; die Linie ist nur aus dem Lageplan übertragen.',
    colour: '#8a8f98',
  },
] as const
export type Belag = (typeof BELAG)[number]['id']
