/**
 * Display names of the region card's context metrics. The card (generateViewerHtml, via the
 * RankingDisplay bundle), the CSV column descriptions (dataDownload.ts) and so the methodology
 * page read them from here, so one metric has one name everywhere.
 */
export const CONTEXT_METRIC_LABELS = {
  mappingDepth: 'Kartierungstiefe (OSM)',
  busyRoadsKm: 'Vielbefahrene Landstraßen (Bayern)',
  busyRoadsShare: 'Vielbefahrene Landstraßen, Anteil am Netz (Bayern)',
  busyRoadsCovered: 'Vielbefahrene Landstraßen mit Radweg (Bayern)',
  busyFederalKm: 'Vielbefahrene Bundesstraßen',
  busyFederalShare: 'Vielbefahrene Bundesstraßen, Anteil am Netz',
  busyFederalCovered: 'Vielbefahrene Bundesstraßen mit Radweg',
  density: 'Bevölkerungsdichte',
  rent: 'Ø Nettokaltmiete (Zensus 2022)',
  youth: 'Kinder & Jugendliche (< 18 Jahre)',
  vacancy: 'Wohnungsleerstand',
  carDensity: 'Pkw-Dichte (KBA)',
  calmedShare: 'Wohn- & Tempo-30-Netz',
  livingShare: 'Spielstraßen, Fahrradstraßen & Fußgängerzonen',
  bikeAccidents: 'Fahrradunfälle mit Personenschaden',
  bikeAccidentsPer10k: 'Fahrradunfälle je 10.000 Einw.',
  bikeFatalOrSevere: 'Schwere Fahrradunfälle (Getötete & Schwerverletzte)',
  jobCentrality: 'Arbeitsplatzzentralität',
  netCommuters: 'Pendlersaldo',
  commuterRates: 'Ein- / Auspendlerquote',
  employedAtWorkplace: 'Sozialvers. Beschäftigte am Arbeitsort',
  stops: 'Bahn-/Tram-/Fährhaltestellen',
  stationDistance: 'Ø Luftlinie zur nächsten Haltestelle',
  highwayDistance: 'Ø Distanz zur nächsten Autobahn/Kraftfahrstraße',
  elevation: 'Höhenlage (Ø)',
  areaSlope: 'Geländesteigung (Ø, Fläche)',
  roadSlope: 'Straßensteigung (Ø)',
  roadSteep: 'Steilste Straßenabschnitte',
} as const

export type ContextMetricKey = keyof typeof CONTEXT_METRIC_LABELS
