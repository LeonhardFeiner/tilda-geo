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
  senior: 'Ältere (ab 67 Jahre)',
  vacancy: 'Wohnungsleerstand',
  ownerOccupier: 'Eigentümerquote (Zensus 2022)',
  newBuild: 'Wohnungen in Neubauten (ab 2000)',
  regioStar: 'Raumtyp (RegioStaR 7)',
  taxPerCapita: 'Steuereinnahmekraft je Einwohner',
  popGrowth: 'Bevölkerungsentwicklung',
  commuteKm: 'Ø Pendeldistanz',
  transitServed: 'Einwohner nahe gut bedienter Haltestelle',
  primarySchool: 'Fahrzeit zur Grundschule',
  secondarySchool: 'Fahrzeit zur weiterführenden Schule',
  supermarket: 'Fahrzeit zum Supermarkt',
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
  stationDistance: 'Ø Luftlinie zum nächsten Bahn-/Tramhalt',
  highwayDistance: 'Ø Distanz zur nächsten Autobahn/Kraftfahrstraße',
  elevation: 'Höhenlage (Ø)',
  areaSlope: 'Geländesteigung (Ø, Fläche)',
  roadSlope: 'Straßensteigung (Ø)',
  roadSteep: 'Steilste Straßenabschnitte',
} as const

/**
 * RegioStaR 7 codes (fetchRegioStar.ts): BMVI/BBSR codeplan wording. Ordered from the most to the
 * least urban, so the code works as an ordinal scale.
 */
export const REGIOSTAR7_LABELS: Record<number, string> = {
  71: 'Stadtregion – Metropole',
  72: 'Stadtregion – Regiopole und Großstadt',
  73: 'Stadtregion – Mittelstadt, städtischer Raum',
  74: 'Stadtregion – Kleinstädtischer, dörflicher Raum',
  75: 'Ländliche Region – Zentrale Stadt',
  76: 'Ländliche Region – Städtischer Raum',
  77: 'Ländliche Region – Kleinstädtischer, dörflicher Raum',
}

export type ContextMetricKey = keyof typeof CONTEXT_METRIC_LABELS

/**
 * Headings of the card's "Mehr Zahlen" list, in display order: the card sorts its rows by these
 * groups and starts each with its title. Every metric is in exactly one group (tested).
 */
export const CONTEXT_METRIC_GROUPS = [
  { title: 'Datenlage', keys: ['mappingDepth'] },
  {
    title: 'Vielbefahrene Straßen',
    keys: [
      'busyRoadsKm',
      'busyRoadsShare',
      'busyFederalKm',
      'busyFederalShare',
      'busyRoadsCovered',
      'busyFederalCovered',
    ],
  },
  {
    title: 'Bevölkerung & Lage',
    keys: ['density', 'regioStar', 'popGrowth', 'youth', 'senior'],
  },
  { title: 'Wohnen', keys: ['rent', 'vacancy', 'ownerOccupier', 'newBuild'] },
  {
    title: 'Arbeit, Pendeln & Finanzen',
    keys: [
      'jobCentrality',
      'netCommuters',
      'commuterRates',
      'employedAtWorkplace',
      'commuteKm',
      'taxPerCapita',
    ],
  },
  {
    title: 'Verkehr & Sicherheit',
    keys: [
      'carDensity',
      'calmedShare',
      'livingShare',
      'bikeAccidents',
      'bikeAccidentsPer10k',
      'bikeFatalOrSevere',
    ],
  },
  {
    title: 'Erreichbarkeit',
    keys: [
      'stops',
      'stationDistance',
      'transitServed',
      'highwayDistance',
      'primarySchool',
      'secondarySchool',
      'supermarket',
    ],
  },
  { title: 'Gelände', keys: ['elevation', 'areaSlope', 'roadSlope', 'roadSteep'] },
] as const satisfies ReadonlyArray<{ title: string; keys: readonly ContextMetricKey[] }>

/**
 * Rows "Mehr Zahlen" shows before "Alle Kennzahlen": the inputs of the expected-value model, how
 * completely the area is mapped, and bike accidents. The rest is one click away.
 */
export const CONTEXT_CORE_KEYS: readonly ContextMetricKey[] = [
  'mappingDepth',
  'busyFederalShare',
  'density',
  'regioStar',
  'rent',
  'carDensity',
  'livingShare',
  'bikeAccidentsPer10k',
  'stationDistance',
  'elevation',
  'roadSlope',
]
