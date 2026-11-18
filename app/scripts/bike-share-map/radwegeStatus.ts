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

/**
 * `hint`: one sentence for the legend and the detail view of the tracker page. In progress order;
 * the group of an unbuilt route follows its latest certain step, so a route whose last step lies
 * years back is not shown as moving.
 */
export const STATUS_GROUPS = [
  {
    id: 'bestand',
    label: 'Vorhanden',
    hint: 'Der Weg ist gebaut und befahrbar.',
    colour: '#1a7f37',
  },
  {
    id: 'seit-konzept',
    label: 'Schritte seit dem Konzept',
    hint: 'Mindestens ein öffentlich dokumentierter Schritt (Beschluss, Grunderwerb, Planung, Programm, Haushaltsansatz, Bau) am oder nach dem 07.06.2024.',
    colour: '#1f5fae',
  },
  {
    id: 'vor-konzept',
    label: 'Nur Schritte vor dem Konzept',
    hint: 'Dokumentiert sind Schritte nur aus der Zeit vor dem 07.06.2024, seitdem keiner mehr.',
    colour: '#b7791f',
  },
  {
    id: 'nichts',
    label: 'Kein Schritt gefunden',
    hint: 'In den ausgewerteten öffentlichen Quellen ist zu dieser Trasse kein Schritt dokumentiert (kein Beschluss, Grunderwerb, keine Planung, kein Programm, Haushaltsansatz oder Bau). Das heißt nicht, dass nichts geschehen ist.',
    colour: '#7c8594',
  },
] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]['id']

const isStep = (e: RouteEvent) => !e.uncertain && (STEP_KINDS as readonly string[]).includes(e.kind)

const byDate = (a: RouteEvent, b: RouteEvent) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/** The earliest certain step, or null. Partial dates sort by their first day. */
export function firstStep(events: readonly RouteEvent[]) {
  return events.filter(isStep).sort(byDate)[0] ?? null
}

/** The latest certain step, or null. */
export function lastStep(events: readonly RouteEvent[]) {
  return events.filter(isStep).sort(byDate).at(-1) ?? null
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
 * Progress group of one line. A built route is `bestand`; otherwise the latest certain step decides
 * since/before the concept ("since" only if the whole period of a partial date lies on or after
 * it, so "2024" or "2024-06" count as before); without a step `nichts`. What has to be built there
 * is a separate question: lineBedarf.
 */
export function lineStatus(
  route: { built?: boolean; events: readonly RouteEvent[] },
  ausbau: Ausbau,
): StatusGroup {
  if (route.built || ausbau === 'bestand') return 'bestand'
  const step = lastStep(route.events)
  if (step) return step.date >= CONCEPT_DATE ? 'seit-konzept' : 'vor-konzept'
  return 'nichts'
}

/**
 * What a line needs according to the plans, independent of progress. A release keeps the way as it
 * is, so the Freigabe group is split by the surface it keeps: in plan 5/1 that is most of the
 * interim network, and the plan paves nothing.
 */
export const BEDARF = [
  {
    id: 'vorhanden',
    label: 'Vorhanden',
    hint: 'Der Weg ist gebaut und befahrbar.',
    colour: '#1a7f37',
  },
  {
    id: 'freigabe-asphalt',
    label: 'Freigabe, Weg asphaltiert',
    hint: 'Laut Plan gibt es einen Weg, der nur für Räder freigegeben und beschildert werden muss (Plan 5/1 auf einem vorhandenen Weg, Plan 5/2 gestrichelt). Er ist asphaltiert oder gepflastert (OpenStreetMap; in Plan 5/2 gestrichelt laut Legende „best. asph. Weg“).',
    colour: '#d68910',
  },
  {
    id: 'freigabe-unbefestigt',
    label: 'Freigabe, Weg bleibt unbefestigt',
    hint: 'Nur Freigabe und Schilder, aber der Weg ist laut OpenStreetMap Schotter, wassergebunden oder Naturboden. Der Plan sieht dort keinen Ausbau vor; der Belag bliebe so.',
    colour: '#8e4a1c',
  },
  {
    id: 'freigabe-unbekannt',
    label: 'Freigabe, Belag nicht erfasst',
    hint: 'Nur Freigabe und Schilder; in OpenStreetMap ist für diesen Weg kein Belag eingetragen, ob er asphaltiert ist, ist offen.',
    colour: '#e6c690',
  },
  {
    id: 'neubau',
    label: 'Aus- oder Neubau nötig',
    hint: 'Aus dem Plan abgeleitet: Plan 5/2 sieht einen Vollausbau vor (durchgezogen; oft auf einem vorhandenen Feldweg oder einer Ortsstraße; das Konzept empfiehlt Asphalt), oder die Linie in Plan 5/1 folgt keinem vorhandenen Weg bzw. nur der Fahrbahn einer Kreis- oder Staatsstraße – dort gibt es nichts freizugeben.',
    colour: '#c0392b',
  },
] as const
export type Bedarf = (typeof BEDARF)[number]['id']

/**
 * Freigabe lines by the surface of their OSM way. A dashed 5/2 line without a surface in OSM counts
 * as asphalt, since the plan's legend says so ("best. asph. Weg"); where OSM records gravel or soil
 * there, OSM wins and the conflict shows.
 */
export function lineBedarf(route: { built?: boolean }, ausbau: Ausbau, belag: Belag): Bedarf {
  if (route.built || ausbau === 'bestand') return 'vorhanden'
  if (ausbau === 'voll' || ausbau === 'kein-weg') return 'neubau'
  if (belag === 'asphalt') return 'freigabe-asphalt'
  if (belag === 'schotter' || belag === 'natur') return 'freigabe-unbefestigt'
  return ausbau === 'bestand-weg' ? 'freigabe-asphalt' : 'freigabe-unbekannt'
}

/** One line for the map popup: what the concept says about this piece. */
export const PLAN_SAYS: Record<Ausbau, string> = {
  freigabe: 'Lageplan 5/1: Weg bleibt, wie er ist; nur Freigabe und Schilder',
  'kein-weg': 'Lageplan 5/1: kein Weg zum Freigeben, Ausbau nicht beschrieben',
  'bestand-weg': 'Lageplan 5/2: vorhandener asphaltierter Weg, mitbenutzt',
  voll: 'Lageplan 5/2: neuer Geh- und Radweg, Asphalt empfohlen',
  bestand: 'Bestehender Geh- und Radweg',
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
    label: 'Kein Weg in OpenStreetMap',
    hint: 'In OpenStreetMap liegt hier kein passender Weg; die Linie ist nur aus dem Lageplan übertragen. Bei neuen Trassen gibt es den Weg noch nicht, bei vorhandenen fehlt er in OpenStreetMap.',
    colour: '#8a8f98',
  },
] as const
export type Weg = (typeof WEG)[number]['id']

/**
 * Popup line for a line counted as "Vorhanden": what one rides on there. An opened route can run
 * on a road or a farm track, without a cycle path of its own; a Bestand line of the plan that
 * OSM matches onto a road has no path mapped there. Empty where the line is a cycle path.
 */
export function vorhandenAuf(ausbau: Ausbau, weg: Weg) {
  if (weg === 'radweg') return ''
  if (ausbau === 'bestand') {
    return 'Laut Plan ein vorhandener Radweg; in OpenStreetMap ist hier keiner erfasst'
  }
  if (weg === 'feldweg') return 'Kein eigener Radweg: gefahren wird auf einem Feld- oder Waldweg'
  if (weg === 'kein') return ''
  return 'Kein eigener Radweg: gefahren wird auf der Fahrbahn'
}

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
    label: 'Kein Weg in OpenStreetMap',
    hint: 'In OpenStreetMap liegt hier kein passender Weg; die Linie ist nur aus dem Lageplan übertragen. Bei neuen Trassen gibt es den Weg noch nicht, bei vorhandenen fehlt er in OpenStreetMap.',
    colour: '#8a8f98',
  },
] as const
export type Belag = (typeof BELAG)[number]['id']
