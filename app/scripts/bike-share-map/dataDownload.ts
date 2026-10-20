import { DEFAULT_MIN_ROAD_KM_FOR_SCALE } from './choroplethScale'
import { computeStructuralModelPrediction } from './rankingDisplay'
import {
  assessBikeDataQuality,
  computeFilteredLengths,
  independentBikeKm,
  mainRoadBreakdown,
  RADINFRA_DEFAULT_FILTER,
  ROAD_AUTHORITY_ORDER,
} from './statsClassSums'

/** Folder (inside the viewer output) with the downloadable data files. */
export const DATA_DOWNLOAD_DIR = 'daten'

/** `radinfra-regionen-2026-10-16.csv` — named after the OSM data date so a citation stays exact. */
export function dataDownloadFileName(osmDataFrom: string | null | undefined) {
  const day = osmDataFrom && /^\d{4}-\d{2}-\d{2}/.exec(osmDataFrom)?.[0]
  return `radinfra-regionen${day ? `-${day}` : ''}.csv`
}

type ById<T> = Record<string, T | undefined>

/** The viewer's per-region `gemeinde-*.json` indexes; any can be missing in a partial build. */
export type DataDownloadContext = {
  /** Region id → name, for the Kreis/Bundesland name columns (Gemeinde names repeat). */
  names?: ById<string>
  density?: ById<number>
  terrain?: ById<{ road?: number; elevationMean?: number }>
  transit?: ById<{ avgDistanceToStationM?: number }>
  zensus?: ById<{ rentPerM2?: number }>
  cars?: ById<{ carsPer1000?: number }>
  calmed?: ById<{ calmedSharePct?: number; livingSharePct?: number }>
  accidents?: ById<{
    bikeAccidents?: number
    bikeFatalOrSevere?: number
    bikeAccidentsPer10k?: number
  }>
  commuters?: ById<{ inCommuters?: number; outCommuters?: number; jobCentrality?: number }>
  mapping?: ById<{ indexPct?: number; speedPct?: number; surfacePct?: number; litPct?: number }>
}

export type DataDownloadFeature = {
  properties?: {
    id?: string
    name?: string
    level?: string
    regionalschluessel?: string
    bundesland_id?: string
    landkreis_id?: string
    road_length?: unknown
    bikelane_length?: unknown
    road_length_by_authority?: unknown
    bikelane_length_by_road?: unknown
  }
}

type Cell = string | number | null

/** Column key → German description; the order here is the CSV column order. */
export const DATA_DOWNLOAD_COLUMNS = {
  osm_id: 'OpenStreetMap-Relation der Verwaltungsgrenze (relation/…)',
  name: 'Name laut OpenStreetMap',
  admin_level:
    'OSM admin_level: 2 Bund, 4 Land, 5 Regierungsbezirk, 6 Kreis, 7 Gemeindeverband, 8 Gemeinde, 9 Stadtbezirk',
  regionalschluessel:
    'Amtlicher Regionalschlüssel (de:regionalschluessel), sofern in OSM eingetragen',
  bundesland: 'Name des Bundeslands',
  kreis: 'Name des Kreises bzw. der kreisfreien Stadt',
  bundesland_id: 'OSM-Relation des Bundeslands',
  landkreis_id: 'OSM-Relation des Kreises',
  strassen_km: 'Straßennetz in km (Standard-Zählfilter)',
  radinfra_km: 'Radinfrastruktur in km (Standard-Zählfilter)',
  radinfra_anteil_pct: 'radinfra_km / strassen_km in %',
  radinfra_unklar_km: 'Davon „Klärung nötig“ (Radinfrastruktur ohne eindeutige Art), km',
  datenlage:
    'gut (< 15 % unklar), mittel (< 40 %), unsicher (≥ 40 %), kaum_erfasst (≥ 20 km Straße, < 0,5 km Radinfra); leer bei < 1 km Radinfra',
  kartierungstiefe_pct:
    'Mittel der drei folgenden Anteile: wie vollständig das Straßennetz in OSM attributiert ist (ohne Zufahrts- / Service-Wege und Autobahnen), %',
  kartiert_tempo_pct:
    'Anteil der Straßenlänge mit erfasstem Tempolimit (maxspeed- oder Zonen-Tag), %',
  kartiert_belag_pct: 'Anteil der Straßenlänge mit erfasstem Belag (surface), %',
  kartiert_licht_pct: 'Anteil der Straßenlänge mit erfasster Beleuchtung (lit), %',
  unabhaengig_km: 'Radinfrastruktur abseits von Straßen (Wege durch Feld, Wald, Park), km',
  hauptstr_km: 'Hauptverkehrsstraßen (OSM trunk, primary, secondary, tertiary) in km',
  hauptstr_radinfra_pct: 'Anteil der Hauptverkehrsstraßen mit Radinfrastruktur, %',
  hauptstr_bund_pct: 'dito, Baulastträger Bund',
  hauptstr_land_pct: 'dito, Baulastträger Land',
  hauptstr_kreis_pct: 'dito, Baulastträger Kreis',
  hauptstr_gemeinde_pct: 'dito, Baulastträger Gemeinde',
  einwohner_je_km2: 'Bevölkerungsdichte (Destatis Gemeindeverzeichnis)',
  miete_eur_m2: 'Durchschnittliche Nettokaltmiete je m² (Zensus 2022)',
  pkw_je_1000_ew: 'Pkw je 1000 Einwohner (KBA FZ 3)',
  verkehrsberuhigt_pct:
    'Anteil von Wohn- und verkehrsberuhigten Straßen am Straßennetz (Näherung für Tempo-30-Zonen), %',
  spielstrassen_pct:
    'Anteil von verkehrsberuhigten Bereichen, Fahrradstraßen und Fußgängerzonen am Straßennetz, %',
  strassen_steigung_pct: 'Mittlere Geländeneigung entlang des Straßennetzes (DGM-Stichproben), %',
  hoehe_mittel_m: 'Mittlere Geländehöhe, m',
  bahnhof_distanz_km:
    'Einwohnergewichtete mittlere Luftlinie (Zensus-100-m-Gitter) zur nächsten Bahn-, Tram- oder Fährstation, km',
  rad_unfaelle: 'Unfälle mit Personenschaden und Radbeteiligung (Unfallatlas 2023)',
  rad_unfaelle_schwer: 'davon mit Getöteten oder Schwerverletzten',
  rad_unfaelle_je_10k_ew: 'Radunfälle je 10.000 Einwohner',
  einpendler: 'Sozialversicherungspflichtig Beschäftigte, Einpendler (BA)',
  auspendler: 'Sozialversicherungspflichtig Beschäftigte, Auspendler (BA)',
  arbeitsplatzzentralitaet: 'Beschäftigte am Arbeitsort / am Wohnort',
  modell_erwartung_pct: 'Struktureller Erwartungswert des Faktoren-Modells (siehe Methodik), %',
  modell_abweichung_pp: 'radinfra_anteil_pct − modell_erwartung_pct, Prozentpunkte',
  modell_ausserhalb_1se:
    '1, wenn die Abweichung größer als ein Residualstandardfehler ist (auf der Karte farbig), sonst 0',
} as const

export type DataDownloadColumn = keyof typeof DATA_DOWNLOAD_COLUMNS
export type DataDownloadRow = Record<DataDownloadColumn, Cell>

const round = (value: number | null | undefined, digits: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(digits)) : null

const DATA_LEVEL_KEYS = {
  good: 'gut',
  mixed: 'mittel',
  poor: 'unsicher',
  sparse: 'kaum_erfasst',
} as const

/**
 * One row per region, using the same functions as the map so a downloaded number always matches
 * what the viewer shows under the default counting filter.
 */
export function buildDataDownloadRow(
  feature: DataDownloadFeature,
  ctx: DataDownloadContext,
): DataDownloadRow | null {
  const p = feature.properties
  if (!p?.id) return null
  const id = String(p.id)
  const level = String(p.level ?? '')
  const { roadKm, bikeKm } = computeFilteredLengths(
    p.road_length,
    p.bikelane_length,
    RADINFRA_DEFAULT_FILTER,
  )
  const quality = assessBikeDataQuality(p.road_length, p.bikelane_length)
  const main = mainRoadBreakdown(p.road_length_by_authority, p.bikelane_length_by_road)
  const mainPct = (authority: (typeof ROAD_AUTHORITY_ORDER)[number]) =>
    round(main?.byAuthority.find((row) => row.authority === authority)?.pct, 2)

  const density = ctx.density?.[id]
  const terrain = ctx.terrain?.[id]
  const stationM = ctx.transit?.[id]?.avgDistanceToStationM
  const rent = ctx.zensus?.[id]?.rentPerM2
  const cars = ctx.cars?.[id]?.carsPer1000
  const calmed = ctx.calmed?.[id]
  const accidents = ctx.accidents?.[id]
  const commuters = ctx.commuters?.[id]
  const mapping = ctx.mapping?.[id]

  // Same gate as the map (generateViewerHtml): no expected value below the ranking threshold.
  const model =
    ctx.density && ctx.terrain && roadKm >= DEFAULT_MIN_ROAD_KM_FOR_SCALE
      ? computeStructuralModelPrediction({
          roadKm,
          bikeKm,
          roadSlope: terrain?.road ?? null,
          elevMean: terrain?.elevationMean ?? null,
          density: density ?? null,
          stDistKm: typeof stationM === 'number' ? stationM / 1000 : null,
          rent: rent ?? null,
          carsPer1000: cars ?? null,
          livingSharePct: calmed?.livingSharePct ?? null,
          bundeslandId: String(p.bundesland_id || (level === '4' ? id : '')),
        })
      : null

  return {
    osm_id: id,
    name: p.name ?? null,
    admin_level: level ? Number(level) : null,
    regionalschluessel: p.regionalschluessel ?? null,
    bundesland: (p.bundesland_id && ctx.names?.[p.bundesland_id]) || null,
    kreis: (p.landkreis_id && ctx.names?.[p.landkreis_id]) || null,
    bundesland_id: p.bundesland_id ?? null,
    landkreis_id: p.landkreis_id ?? null,
    strassen_km: round(roadKm, 3),
    radinfra_km: round(bikeKm, 3),
    radinfra_anteil_pct: roadKm > 0 ? round((bikeKm / roadKm) * 100, 2) : null,
    radinfra_unklar_km: quality && quality.level !== 'sparse' ? round(quality.unclearKm, 3) : null,
    datenlage: quality ? DATA_LEVEL_KEYS[quality.level] : null,
    kartierungstiefe_pct: round(mapping?.indexPct, 1),
    kartiert_tempo_pct: round(mapping?.speedPct, 1),
    kartiert_belag_pct: round(mapping?.surfacePct, 1),
    kartiert_licht_pct: round(mapping?.litPct, 1),
    unabhaengig_km: p.bikelane_length_by_road
      ? round(independentBikeKm(p.bikelane_length_by_road), 3)
      : null,
    hauptstr_km: round(main?.roadKm, 3),
    hauptstr_radinfra_pct: round(main?.pct, 2),
    hauptstr_bund_pct: mainPct('bund'),
    hauptstr_land_pct: mainPct('land'),
    hauptstr_kreis_pct: mainPct('kreis'),
    hauptstr_gemeinde_pct: mainPct('gemeinde'),
    einwohner_je_km2: round(density, 1),
    miete_eur_m2: round(rent, 2),
    pkw_je_1000_ew: round(cars, 1),
    verkehrsberuhigt_pct: round(calmed?.calmedSharePct, 1),
    spielstrassen_pct: round(calmed?.livingSharePct, 1),
    strassen_steigung_pct: round(terrain?.road, 2),
    hoehe_mittel_m: round(terrain?.elevationMean, 0),
    bahnhof_distanz_km: typeof stationM === 'number' ? round(stationM / 1000, 2) : null,
    rad_unfaelle: accidents?.bikeAccidents ?? null,
    rad_unfaelle_schwer: accidents?.bikeFatalOrSevere ?? null,
    rad_unfaelle_je_10k_ew: round(accidents?.bikeAccidentsPer10k, 1),
    einpendler: commuters?.inCommuters ?? null,
    auspendler: commuters?.outCommuters ?? null,
    arbeitsplatzzentralitaet: round(commuters?.jobCentrality, 2),
    modell_erwartung_pct: round(model?.expectedPct, 2),
    modell_abweichung_pp: round(model?.diffPct, 2),
    modell_ausserhalb_1se: model ? (model.isWithin1Se ? 0 : 1) : null,
  }
}

function csvCell(value: Cell) {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** RFC 4180: comma-separated, dot decimals, empty = no value. Sorted by admin level, then name. */
export function dataDownloadCsv(rows: DataDownloadRow[]) {
  const columns = Object.keys(DATA_DOWNLOAD_COLUMNS) as DataDownloadColumn[]
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.admin_level ?? 99) - Number(b.admin_level ?? 99) ||
      String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de') ||
      String(a.osm_id).localeCompare(String(b.osm_id)),
  )
  const lines = [columns.join(',')]
  for (const row of sorted) lines.push(columns.map((c) => csvCell(row[c])).join(','))
  return `${lines.join('\r\n')}\r\n`
}
