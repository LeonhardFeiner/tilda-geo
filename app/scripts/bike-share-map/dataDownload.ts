import { DEFAULT_MIN_ROAD_KM_FOR_SCALE } from './choroplethScale'
import { UNFALLATLAS_YEAR } from './constants'
import { CONTEXT_METRIC_LABELS as L } from './contextMetrics'
import {
  aggregateResidualStdErrorPct,
  aggregateStructuralPredictions,
  computeStructuralModelPrediction,
  isAggregatedModelLevel,
  isStructuralModelLevel,
  MODEL_BAND_MIN_REGIONS,
  type StructuralModelPrediction,
  structuralModelInputs,
} from './rankingDisplay'
import {
  assessBikeDataQuality,
  computeFilteredLengths,
  csvField,
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
  calmed?: ById<{ calmedSharePct?: number; livingSharePct?: number; livingStreetSharePct?: number }>
  accidents?: ById<{
    bikeAccidents?: number
    bikeFatalOrSevere?: number
    bikeAccidentsPer10k?: number
  }>
  commuters?: ById<{ inCommuters?: number; outCommuters?: number; jobCentrality?: number }>
  mapping?: ById<{ indexPct?: number; speedPct?: number; surfacePct?: number; litPct?: number }>
  traffic?: ById<{ needKm?: number; coveredKm?: number; coveredPct?: number; sharePct?: number }>
  trafficFederal?: ById<{
    needKm?: number
    coveredKm?: number
    coveredPct?: number
    sharePct?: number
  }>
  /** Kreis-level regions with no Gemeinde inside: kreisfreie Städte (kreisfreieIdsOf). */
  kreisfreieIds?: Set<string>
  /** Summed predictions for Kreise, Bezirke, Gemeindeverbände (buildModelAggregates). */
  modelAggregates?: Map<string, ReturnType<typeof aggregateStructuralPredictions>>
}

export type DataDownloadFeature = {
  properties?: {
    id?: string
    name?: string
    level?: string
    regionalschluessel?: string
    parent_id?: string
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
  vielbefahren_km:
    'Nur Bayern: Außerortsabschnitte von Bundes-, Staats- und Kreisstraßen über der ERA-2010-Schwelle (DTV > 2.500 Kfz/24h bei 100 km/h, > 4.000 bei 70 km/h; Zählung 2021), km Straße',
  vielbefahren_anteil_pct: 'vielbefahren_km / strassen_km (Standard-Zählfilter), %; 0 = keine',
  vielbefahren_mit_radweg_km: 'davon mit Radinfrastruktur daneben (innerhalb ~20 m), km',
  vielbefahren_mit_radweg_pct: 'vielbefahren_mit_radweg_km / vielbefahren_km, %',
  bundesstr_vielbefahren_km:
    'Ganz Deutschland, nur Bundesstraßen: Außerortsabschnitte über der ERA-2010-Schwelle (Zählung 2021; außerhalb Bayerns BASt-Abschnitte, aus OSM genähert), km Straße; 0 = keine',
  bundesstr_vielbefahren_anteil_pct:
    'bundesstr_vielbefahren_km / strassen_km (Standard-Zählfilter), %; geht ins Modell ein',
  bundesstr_vielbefahren_mit_radweg_km: 'davon mit Radinfrastruktur daneben (innerhalb ~20 m), km',
  bundesstr_vielbefahren_mit_radweg_pct:
    'bundesstr_vielbefahren_mit_radweg_km / bundesstr_vielbefahren_km, %',
  einwohner_je_km2: `${L.density}, Einwohner je km² (Destatis Gemeindeverzeichnis)`,
  miete_eur_m2: `${L.rent}, € je m²`,
  pkw_je_1000_ew: `${L.carDensity}: Pkw je 1.000 Einwohner (Statistik FZ 3)`,
  verkehrsberuhigt_pct: `${L.calmedShare}: Anteil von Wohn- und verkehrsberuhigten Straßen am Straßennetz (Näherung für Tempo-30-Zonen), %`,
  spielstrassen_pct:
    'Anteil verkehrsberuhigter Bereiche (Spielstraßen) am Straßennetz, %; geht ins Modell ein',
  beruhigt_fahrradstr_pct: `${L.livingShare}: Anteil am Straßennetz, %`,
  strassen_steigung_pct: 'Mittlere Geländeneigung entlang des Straßennetzes (DGM-Stichproben), %',
  hoehe_mittel_m: `${L.elevation}, m`,
  bahnhof_distanz_km:
    'Einwohnergewichtete mittlere Luftlinie (Zensus-100-m-Gitter) zur nächsten Bahn-, Tram- oder Fährstation, km',
  rad_unfaelle: `${L.bikeAccidents} (Unfallatlas ${UNFALLATLAS_YEAR}; 0 = keine erfasst)`,
  rad_unfaelle_schwer: 'davon mit Getöteten oder Schwerverletzten',
  rad_unfaelle_je_10k_ew: `${L.bikeAccidentsPer10k}`,
  einpendler: 'Sozialversicherungspflichtig Beschäftigte, Einpendler (BA)',
  auspendler: 'Sozialversicherungspflichtig Beschäftigte, Auspendler (BA)',
  arbeitsplatzzentralitaet: `${L.jobCentrality}: Beschäftigte am Arbeitsort / am Wohnort`,
  modell_erwartung_pct:
    'Struktureller Erwartungswert des Faktoren-Modells (siehe Methodik), %. Gemeinden: Modell; Gemeindeverbände, Kreise, Bezirke: Summe der Erwartungswerte ihrer Gemeinden (Länder: kein Wert, siehe Methodik)',
  modell_abweichung_pp: 'radinfra_anteil_pct − modell_erwartung_pct, Prozentpunkte',
  modell_ausserhalb_1se:
    '1, wenn die Abweichung größer ist als die typische Abweichung der Ebene (Gemeinden: Residualstandardfehler; auf der Karte kräftige Farbe), sonst 0',
  modell_begrenzt:
    '1, wenn das lineare Modell rechnerisch unter 0 % lag und die Erwartung auf 0 % gesetzt wurde (die Abweichung ist dann eine Untergrenze; bei Kreisen: mindestens eine Gemeinde betroffen), sonst 0',
  hinweise:
    'Mit „|“ getrennte Hinweise: anteil_ueber_100 = mehr Radinfra- als Straßen-km (Radwege werden je Fahrtrichtung gezählt, das Straßennetz ist sehr klein)',
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
 * Kreis-level regions no Gemeinde points to: kreisfreie Städte, which OSM maps only at that level.
 * They are municipalities, so the model treats them as Gemeinden (same rule as the viewer's
 * regionNavigation kreisfreieIds).
 */
export function kreisfreieIdsOf(features: DataDownloadFeature[]) {
  const withGemeinden = new Set(
    features.flatMap((f) =>
      f.properties?.level === '8' && f.properties.landkreis_id ? [f.properties.landkreis_id] : [],
    ),
  )
  return new Set(
    features.flatMap((f) =>
      f.properties?.level === '6' && f.properties.id && !withGemeinden.has(f.properties.id)
        ? [f.properties.id]
        : [],
    ),
  )
}

const isModelGemeinde = (p: DataDownloadFeature['properties'], ctx: DataDownloadContext) =>
  isStructuralModelLevel(p?.level) || (p?.level === '6' && !!p.id && !!ctx.kreisfreieIds?.has(p.id))

/** The Gemeinde model under the default counting filter — the same gate as the map. */
function gemeindeModelPrediction(feature: DataDownloadFeature, ctx: DataDownloadContext) {
  const p = feature.properties
  if (!p?.id || !isModelGemeinde(p, ctx) || !ctx.density || !ctx.terrain) return null
  const id = String(p.id)
  const { roadKm, bikeKm } = computeFilteredLengths(
    p.road_length,
    p.bikelane_length,
    RADINFRA_DEFAULT_FILTER,
  )
  if (roadKm < DEFAULT_MIN_ROAD_KM_FOR_SCALE) return null
  return computeStructuralModelPrediction({
    roadKm,
    bikeKm,
    ...structuralModelInputs(id, ctx),
    bundeslandId: String(p.bundesland_id || ''),
  })
}

/**
 * Kreise, Bezirke and Gemeindeverbände as the sum of their Gemeinden, each judged against
 * the typical deviation of its own level — the same rule as the map (generateViewerHtml).
 */
export function buildModelAggregates(features: DataDownloadFeature[], ctx: DataDownloadContext) {
  const byId = new Map(features.flatMap((f) => (f.properties?.id ? [[f.properties.id, f]] : [])))
  const partsById = new Map<string, StructuralModelPrediction[]>()
  for (const f of features) {
    const m = gemeindeModelPrediction(f, ctx)
    const p = f.properties
    if (!m || !p?.id) continue
    const ancestors = new Set<string>()
    for (const start of [p.parent_id, p.landkreis_id]) {
      let current = start
      for (let i = 0; current && i < 8; i++) {
        ancestors.add(current)
        current = byId.get(current)?.properties?.parent_id
      }
    }
    if (p.bundesland_id) ancestors.add(p.bundesland_id)
    for (const id of ancestors) {
      const list = partsById.get(id) ?? []
      list.push(m)
      partsById.set(id, list)
    }
  }
  const byLevel = new Map<string, Array<[string, StructuralModelPrediction[]]>>()
  for (const [id, parts] of partsById) {
    const level = String(byId.get(id)?.properties?.level ?? '')
    if (!isAggregatedModelLevel(level)) continue
    byLevel.set(level, [...(byLevel.get(level) ?? []), [id, parts]])
  }
  const result = new Map<string, ReturnType<typeof aggregateStructuralPredictions>>()
  for (const regions of byLevel.values()) {
    if (regions.length < MODEL_BAND_MIN_REGIONS) continue
    const ownOf = (id: string) => {
      const p = byId.get(id)?.properties
      return computeFilteredLengths(p?.road_length, p?.bikelane_length, RADINFRA_DEFAULT_FILTER)
    }
    // Single-Gemeinde regions keep the Gemeinde band and would only widen this one.
    const drafts = regions.flatMap(([id, parts]) => {
      if (parts.length < 2) return []
      const d = aggregateStructuralPredictions(parts, Infinity, ownOf(id))
      return d ? [{ diffPct: d.diffPct, roadKm: d.roadKm }] : []
    })
    const band = aggregateResidualStdErrorPct(drafts)
    if (band == null) continue
    for (const [id, parts] of regions) {
      result.set(id, aggregateStructuralPredictions(parts, band, ownOf(id)))
    }
  }
  return result
}

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
  const traffic = ctx.traffic?.[id]
  const trafficFederal = ctx.trafficFederal?.[id]

  // Same gate as the map (generateViewerHtml): no expected value below the ranking threshold.
  const model = isModelGemeinde(p, ctx)
    ? gemeindeModelPrediction(feature, ctx)
    : isAggregatedModelLevel(level)
      ? (ctx.modelAggregates?.get(id) ?? null)
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
    vielbefahren_km: round(traffic?.needKm, 1),
    vielbefahren_anteil_pct: round(traffic?.sharePct, 2),
    vielbefahren_mit_radweg_km: round(traffic?.coveredKm, 1),
    vielbefahren_mit_radweg_pct: round(traffic?.coveredPct, 1),
    bundesstr_vielbefahren_km: round(trafficFederal?.needKm, 1),
    bundesstr_vielbefahren_anteil_pct: round(trafficFederal?.sharePct, 2),
    bundesstr_vielbefahren_mit_radweg_km: round(trafficFederal?.coveredKm, 1),
    bundesstr_vielbefahren_mit_radweg_pct: round(trafficFederal?.coveredPct, 1),
    einwohner_je_km2: round(density, 1),
    miete_eur_m2: round(rent, 2),
    pkw_je_1000_ew: round(cars, 1),
    verkehrsberuhigt_pct: round(calmed?.calmedSharePct, 1),
    spielstrassen_pct: round(calmed?.livingStreetSharePct, 1),
    beruhigt_fahrradstr_pct: round(calmed?.livingSharePct, 1),
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
    modell_begrenzt: model ? (model.clamped ? 1 : 0) : null,
    hinweise: roadKm > 0 && bikeKm > roadKm ? 'anteil_ueber_100' : null,
  }
}

/** Excel only detects UTF-8 (umlauts) when the file starts with a byte order mark. */
const UTF8_BOM = '\uFEFF'

type CsvDialect = { separator: ',' | ';'; decimalComma: boolean }

function csvCell(value: Cell, dialect: CsvDialect) {
  const s =
    typeof value === 'number' && dialect.decimalComma ? String(value).replace('.', ',') : value
  return csvField(s, dialect.separator)
}

/**
 * RFC 4180 by default: comma-separated, dot decimals, empty = no value. `excel` writes the variant
 * German Excel opens with a double-click (semicolon, decimal comma). Both start with a BOM.
 * Sorted by admin level, then name.
 */
export function dataDownloadCsv(
  rows: DataDownloadRow[],
  variant: 'standard' | 'excel' = 'standard',
) {
  const dialect: CsvDialect =
    variant === 'excel'
      ? { separator: ';', decimalComma: true }
      : { separator: ',', decimalComma: false }
  const columns = Object.keys(DATA_DOWNLOAD_COLUMNS) as DataDownloadColumn[]
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.admin_level ?? 99) - Number(b.admin_level ?? 99) ||
      String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de') ||
      String(a.osm_id).localeCompare(String(b.osm_id)),
  )
  const lines = [columns.join(dialect.separator)]
  for (const row of sorted) {
    lines.push(columns.map((c) => csvCell(row[c], dialect)).join(dialect.separator))
  }
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

/** `radinfra-regionen-2026-10-16-excel.csv` next to the standard file. */
export function excelDataDownloadFileName(osmDataFrom: string | null | undefined) {
  return dataDownloadFileName(osmDataFrom).replace(/\.csv$/, '-excel.csv')
}
