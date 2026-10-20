import { DATA_DOWNLOAD_COLUMNS } from './dataDownload'
import { POPULATION_BANDS, URBANIZATION_LABELS, type UrbanizationCode } from './demographicPeers'
import { BIKELANE_CLASS_LABELS, BIKELANE_CLASS_ORDER, ROAD_CLASS_LABELS } from './statsClassSums'

export type MethodologyPageInput = {
  /** "Stand" shown for the underlying OpenStreetMap data (geojson refresh date). */
  dataDateLabel: string
  /** Nationwide bike-infra share (%) under the default counting filter, or null if unknown. */
  nationalSharePct: number | null
  /** How many Gemeinden carry a demographic-peer comparison (0 = feature disabled this build). */
  peerGemeindeCount: number
  projectLead: string
  sourceRepoUrl: string
  /** Link back to the interactive map (relative). */
  viewerHref: string
  /** The per-region CSV written by buildViewer, or null when the build had no stats. */
  dataDownload?: { href: string; rowCount: number } | null
}

const OSM_TAGGING_URL = 'https://wiki.openstreetmap.org/wiki/DE:Fahrradinfrastruktur'
const TILDA_URL = 'https://tilda-geo.de'
const RADINFRA_URL = 'https://radinfra.de'
const RADINFRA_STATS_URL = 'https://radinfra.de/statistik/'
const DESTATIS_URL =
  'https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html'
const DEGURBA_URL = 'https://ec.europa.eu/eurostat/de/web/degree-of-urbanisation'

function li(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
}

function roadClassList(): string {
  return li([
    `<strong>${ROAD_CLASS_LABELS.motorway_like}</strong> – Autobahnen, Kraftfahrstraßen und ihre Zu-/Abfahrten`,
    `<strong>${ROAD_CLASS_LABELS.primary_like}</strong> – Bundes-, Land- und Kreisstraßen sowie wichtige innerörtliche Straßen (OSM <code>primary</code>–<code>tertiary</code>)`,
    `<strong>${ROAD_CLASS_LABELS.secondary_like}</strong> – nicht klassifizierte und Erschließungswege (OSM <code>unclassified</code>, <code>service</code>)`,
    `<strong>${ROAD_CLASS_LABELS.residential_like}</strong> – Wohn-, Spiel- und Fahrradstraßen, Fußgängerzonen mit Kfz-Verkehr`,
  ])
}

function bikelaneClassList(): string {
  return li(BIKELANE_CLASS_ORDER.map((c) => `<strong>${BIKELANE_CLASS_LABELS[c]}</strong>`))
}

function peerBandList(): string {
  const bands = POPULATION_BANDS.map((b) => b.label).join(' · ')
  const tiers = (Object.keys(URBANIZATION_LABELS) as UrbanizationCode[])
    .map((k) => URBANIZATION_LABELS[k])
    .join(', ')
  return li([
    `<strong>Einwohnerzahl</strong> in ${POPULATION_BANDS.length} Klassen: ${bands}`,
    `<strong>Grad der Verstädterung</strong> (Destatis / <a href="${DEGURBA_URL}">Eurostat DEGURBA</a>): ${tiers}`,
  ])
}

/**
 * Standalone "Methodik & Datenquellen" page — served next to the viewer at r-less
 * `methodik.html`, linked from the viewer footer. Deliberately conservative about what the
 * numbers do and don't say, so the map holds up when a journalist or a Gemeinde pushes back.
 */
export function methodologyPageHtml(input: MethodologyPageInput): string {
  const national =
    input.nationalSharePct == null
      ? null
      : input.nationalSharePct.toLocaleString('de-DE', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })

  const nationalBlock = national
    ? `<p class="lead">Bundesweit haben rund <strong>${national}&nbsp;%</strong> der Straßen (nach Länge) eine straßenbegleitende Radinfrastruktur – Stand der OpenStreetMap-Daten: ${input.dataDateLabel}.</p>`
    : ''

  const peerSection =
    input.peerGemeindeCount > 0
      ? `<h2>Vergleich mit ähnlichen Gemeinden</h2>
<p>Ein Landkreis mischt die Kreisstadt mit ihren Dörfern. Damit „wir sind halt ländlich“ nicht
als Erklärung reicht, wird jede Gemeinde zusätzlich bundesweit mit Gemeinden <em>derselben
Größenklasse und Verstädterung</em> verglichen:</p>
${peerBandList()}
<p>Grundlage ist das <a href="${DESTATIS_URL}">Gemeindeverzeichnis des Statistischen Bundesamts</a>
(vierteljährlich). Der Vergleich erscheint für ${input.peerGemeindeCount.toLocaleString('de-DE')}
Gemeinden; sehr kleine Vergleichsgruppen (unter vier) werden nicht gezeigt. Auf den geteilten
Vorschau-Seiten wird der Standard-Zählfilter verwendet, in der interaktiven Karte der gerade
eingestellte – beide Werte können daher leicht voneinander abweichen.</p>`
      : ''

  const downloadSection = input.dataDownload
    ? `<h2>Daten herunterladen</h2>
<p><a href="${input.dataDownload.href}" download><strong>Alle Gebiete als CSV</strong></a>
(${input.dataDownload.rowCount.toLocaleString('de-DE')} Zeilen, Stand der OpenStreetMap-Daten:
${input.dataDateLabel}). Eine Zeile je Verwaltungseinheit vom Bund bis zum Stadtbezirk, gerechnet
mit dem Standard-Zählfilter – dieselben Werte wie in der Karte mit Standard-Einstellungen.
Komma-getrennt, Dezimalpunkt, UTF-8; leere Felder bedeuten „kein Wert“. Der Dateiname enthält das
Datum des OSM-Datenstands. Mit der nächsten Aktualisierung wird die Datei ersetzt – wer die Zahlen
zitiert, speichert sich bitte eine eigene Kopie.</p>
<details><summary>Spalten</summary>
${li(Object.entries(DATA_DOWNLOAD_COLUMNS).map(([key, text]) => `<code>${key}</code> – ${text}`))}
</details>
<p><strong>Quellen &amp; Lizenzen:</strong></p>
${li([
  `Längen, Grenzen: © OpenStreetMap-Mitwirkende, <a href="https://opendatacommons.org/licenses/odbl/">ODbL</a> – die CSV ist damit eine Datenbank unter ODbL.`,
  `Bevölkerungsdichte, Miete, Radunfälle: © Statistisches Bundesamt (Destatis) bzw. Statistische Ämter des Bundes und der Länder (Gemeindeverzeichnis, Zensus 2022, Unfallatlas 2023), <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>.`,
  `Pkw-Dichte: Kraftfahrt-Bundesamt, Statistik FZ 3.`,
  `Pendler: Statistik der Bundesagentur für Arbeit.`,
  `Geländehöhe und -neigung: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen/AWS Terrain Tiles</a> (u.&nbsp;a. SRTM, EU-DEM).`,
])}`
    : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Methodik &amp; Datenquellen – Radinfra-Vergleich</title>
<meta name="description" content="Wie der Radinfra-Vergleich rechnet: Datenquellen, Zählweise und die Grenzen der Aussagekraft." />
<meta name="robots" content="index,follow" />
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; background: #f6f7f5; color: #1f2421;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 44rem; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.7rem; line-height: 1.25; margin: 0 0 4px; }
  .sub { color: #5c6560; margin: 0 0 24px; }
  h2 { font-size: 1.2rem; margin: 34px 0 8px; border-top: 1px solid #e2e4e0; padding-top: 22px; }
  p { margin: 0 0 12px; }
  ul { margin: 0 0 14px; padding-left: 1.3em; }
  li { margin: 3px 0; }
  code { background: #eceee9; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
  a { color: #1b6e4b; }
  .lead {
    background: #e9f3ee; border: 1px solid #bfe0cd; border-radius: 8px;
    padding: 12px 14px; font-size: 1.05rem;
  }
  .back { display: inline-block; margin-bottom: 20px; font-weight: 600; text-decoration: none; }
  .caveat { background: #fdf6e9; border: 1px solid #efd9ac; border-radius: 8px; padding: 12px 14px; }
  table.model-table { width: 100%; border-collapse: collapse; margin: 14px 0 18px; font-size: 0.95rem; }
  table.model-table th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
  table.model-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  table.model-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.model-table th.num { text-align: right; }
  footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid #e2e4e0; color: #5c6560; font-size: 0.9rem; }
</style>
</head>
<body>
<main>
  <a class="back" href="${input.viewerHref}">&larr; Zur Karte</a>
  <h1>Methodik &amp; Datenquellen</h1>
  <p class="sub">Was die Zahlen sagen – und was nicht.</p>

  ${nationalBlock}

  <h2>Was zeigt die Karte?</h2>
  <p>Für jede Verwaltungseinheit den <strong>Anteil der Straßen (nach Länge in km), an denen eine
  Radinfrastruktur verläuft</strong> – also die Kilometer Radinfrastruktur geteilt durch die
  Kilometer Straße. Ein Wert von 20&nbsp;% heißt: entlang von einem Fünftel des Straßennetzes
  gibt es Radwege, Schutzstreifen, Fahrradstraßen o.&nbsp;Ä.</p>
  <p>Der Anteil misst <em>Vorhandensein</em>, nicht Qualität, Breite oder Netzzusammenhang. Über
  den Zählfilter lassen sich einzelne Kategorien (z.&nbsp;B. nur baulich getrennte Radwege) ein-
  und ausschließen.</p>

  <h2>Datenquellen</h2>
  ${li([
    `<strong>Straßen und Radinfrastruktur:</strong> <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL), aufbereitet mit <a href="${input.sourceRepoUrl}">tilda-geo</a> / <a href="${TILDA_URL}">TILDA</a>. Stand der hier verwendeten Auswertung: ${input.dataDateLabel}.`,
    `<strong>Verwaltungsgrenzen:</strong> OpenStreetMap-Relationen (<code>boundary=administrative</code>) auf den Ebenen Land, Regierungsbezirk, (Land-)Kreis und Gemeinde.`,
    `<strong>Einwohnerzahl &amp; Verstädterung:</strong> <a href="${DESTATIS_URL}">Gemeindeverzeichnis</a> des Statistischen Bundesamts, über den amtlichen Regionalschlüssel mit den OSM-Gemeinden verknüpft.`,
    `<strong>Siehe auch:</strong> die <a href="${RADINFRA_STATS_URL}">Statistik von radinfra.de</a>, auf deren Zählschema diese Auswertung aufbaut.`,
  ])}

  <h2>Wie werden Straßen gezählt?</h2>
  <p>Aus den OSM-Straßentypen (<code>highway=*</code>) werden vier Gruppen gebildet:</p>
  ${roadClassList()}
  <p>Reine Fuß- und Radwege ohne begleitende Fahrbahn zählen <strong>nicht</strong> zur
  Straßenlänge – sonst würde ein gut ausgebautes Radnetz den eigenen Nenner vergrößern.</p>

  <h2>Wie wird Radinfrastruktur gezählt?</h2>
  <p>Die Klassifizierung folgt dem Schema von <a href="${RADINFRA_URL}">radinfra.de</a> bzw. TILDA
  (<a href="${OSM_TAGGING_URL}">OSM-Radverkehrs-Tagging</a>). Gezählt wird die Länge aller Wege
  dieser Kategorien:</p>
  ${bikelaneClassList()}
  <p>Der Hauptwert setzt die <strong>gesamte</strong> Länge der Radinfrastruktur ins Verhältnis zur
  Straßenlänge – auch selbstständige Wege abseits von Straßen (z.&nbsp;B. durch Felder oder Parks)
  zählen mit. Längen werden je Fahrtrichtung gezählt: Eine Straße mit Gegenverkehr zählt doppelt,
  ebenso ein Zweirichtungsradweg; ein Radfahrstreifen auf jeder Seite zählt je Seite einfach.
  Beidseitige Radinfrastruktur an einer Straße mit Gegenverkehr entspricht so 100&nbsp;%.
  Ein Weg, der über eine Gemeinde- oder Kreisgrenze führt, zählt auf jeder Seite mit dem Teil seiner
  Länge, der dort liegt.</p>

  <h2>Hauptverkehrsstraßen und Zuständigkeit</h2>
  <p>Eigenständige Radwege abseits von Straßen zählen im Hauptwert voll mit – oft sind sie sogar
  die angenehmere Verbindung. Ergänzend zeigt die Detailkarte, wie gut die
  <strong>Hauptverkehrsstraßen</strong> selbst ausgestattet sind: den Anteil der Hauptverkehrsstraßen (OSM <code>trunk</code>, <code>primary</code>,
  <code>secondary</code>, <code>tertiary</code>) mit Radinfrastruktur daneben oder darauf. Dafür wird
  jeder Radweg der Straße zugeordnet, an der er verläuft: Radfahrstreifen auf der Fahrbahn über ihre
  Straße, eigenständig erfasste straßenbegleitende Wege über die nächste Straße im Umkreis von etwa
  30&nbsp;m. Wege ohne Straße in der Nähe zählen hier nicht. Die Karte und die Rangliste verwenden
  immer den Wert über alle Straßen; der Anteil der Hauptverkehrsstraßen steht als Zusatzangabe in der
  Detailkarte und im Datenblatt. Die eigene Zählung aus den Einstellungen gilt nur für den Hauptwert.</p>
  <p>Die Zuständigkeit (Baulastträger) wird aus der Straßennummer abgeleitet: B → Bund,
  L/S/St → Land, K oder Kreiskürzel (z.&nbsp;B. „RO&nbsp;35“) → Landkreis, ohne Nummer → Gemeinde.
  Das ist eine Näherung: Ortsdurchfahrten von Bundes- und Landesstraßen liegen in größeren Städten
  meist in der Baulast der Stadt, und fehlende Nummern in OpenStreetMap landen bei der Gemeinde.</p>

  ${peerSection}

  <h2>Strukturelles Erwartungswert-Modell</h2>
  <p>Topografie, Siedlungsdichte und Landespolitik beeinflussen die Rahmenbedingungen für
  Radinfrastruktur massiv: Eine hügelige Mittelgebirgsgemeinde im ländlichen Hessen steht vor anderen
  Aufgaben als eine flache Küstengemeinde in Schleswig-Holstein. Um lokale Prioritäten von diesen
  Rahmenbedingungen zu trennen, schätzt ein <strong>multivariates Regressionsmodell</strong>
  den statistischen Erwartungswert für jede Gemeinde.</p>

  <p><strong>Wichtig: Der Erwartungswert ist ein statistischer Vergleichswert, kein planerisches Ziel.</strong>
  Das Modell beschreibt bestehende Zusammenhänge im bundesweiten Straßennetz – es liefert keine
  Normvorgabe für eine verkehrswendegerechte Infrastruktur. Eine positive Abweichung („über Erwartungswert“)
  bedeutet, dass vor Ort mehr Radinfrastruktur vorhanden ist, als sich durch Geografie, Dichte, Kaufkraft
  und Landesniveau statistisch erklären lässt.</p>

  <p><strong>Modellgüte &amp; Zählfilter-Varianten:</strong></p>
  <ul>
    <li><strong>Standard-Modell (Gesamtnetz):</strong> <code>n = 10.396</code> Gemeinden mit einem Straßennetz ab 5&nbsp;km. Gewichtung nach Netzlänge (604.809&nbsp;km). <strong>R² = 53,7&nbsp;%</strong> (In-Sample), 10-fache Kreuzvalidierung: <strong>R²_cv = 53,3&nbsp;%</strong>. Residualstandardfehler <strong>SE = ±5,64&nbsp;%-Punkte</strong>.</li>
    <li><strong>Modell für Hauptverkehrsstraßen:</strong> Werden in den Zähleinstellungen nur Hauptverkehrsstraßen ausgewählt (Bundes-, Land- und Kreisstraßen), greift ein eigenes Modell (<code>n = 10.313</code>, <strong>R² = 59,7&nbsp;%</strong>, <strong>R²_cv = 59,4&nbsp;%</strong>, Basiswert <strong>35,7&nbsp;%</strong>, <strong>SE = ±22,4&nbsp;%-Punkte</strong>). Hangneigung und städtische Dichte wirken hier noch stärker trennend als im Nebennetz.</li>
    <li><strong>Dynamische Anpassung bei freien Zählfiltern:</strong> Werden Straßen- oder Radwegetypen individuell abgewählt (z.&nbsp;B. ohne Autobahnen oder nur bauliche Radwege), passen sich Bundes- und Landesbaselines sowie das Streuband dynamisch an das tatsächliche Niveau des gewählten Filters an, um Verzerrungen durch reine Nenner-Verschiebungen zu verhindern.</li>
    <li><strong>Modellunsicherheit:</strong> Liegt die Abweichung einer Gemeinde innerhalb des modelltypischen Streubands (±1 SE), wird sie auf der Karte neutral (grau) dargestellt. Nur statistisch deutliche Ausreißer jenseits von ±1 SE erhalten Farbe.</li>
  </ul>

  <table class="model-table">
    <thead>
      <tr>
        <th>Einflussfaktor</th>
        <th>Beschreibung / Quelle</th>
        <th class="num">Koeffizient (β)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Bundesland-Baselines (α_L)</strong></td>
        <td>Feste Effekte für Landesrichtlinien, Förderprogramme und Meldekulturen (Niedersachsen 16,7&nbsp;%, Schleswig-Holstein 15,8&nbsp;%, Brandenburg 14,4&nbsp;%, Mecklenburg-Vorpommern 14,3&nbsp;%, NRW 10,9&nbsp;%, Sachsen-Anhalt 10,8&nbsp;%, Bundesmittel 10,6&nbsp;%, Bayern 8,9&nbsp;%, Sachsen 8,7&nbsp;%, Saarland 8,5&nbsp;%, Thüringen 8,0&nbsp;%, Baden-Württemberg 7,3&nbsp;%, Rheinland-Pfalz 6,4&nbsp;%, Hessen 6,3&nbsp;%)</td>
        <td class="num">Basis</td>
      </tr>
      <tr>
        <td><strong>Mittlere Straßensteigung</strong></td>
        <td>Hangneigung des Straßennetzes in Grad (aus Copernicus DEM)</td>
        <td class="num">−0,3860 / °</td>
      </tr>
      <tr>
        <td><strong>Mittlere Geländehöhe</strong></td>
        <td>Höhe über Normalnull in Metern (Copernicus DEM)</td>
        <td class="num">−0,0018 / m</td>
      </tr>
      <tr>
        <td><strong>Siedlungsdichte (log10)</strong></td>
        <td>Einwohner je km² Fläche (Destatis), logarithmische Skalierung</td>
        <td class="num">+4,3904 / Dekade</td>
      </tr>
      <tr>
        <td><strong>ÖPNV-Bahnhofsnähe</strong></td>
        <td>Mittlere Luftliniendistanz zu Personenbahnhöfen in km</td>
        <td class="num">−0,0143 / km</td>
      </tr>
      <tr>
        <td><strong>Mietniveau &amp; Kaufkraft</strong></td>
        <td>Ø Nettokaltmiete in €/m² (Zensus 2022)</td>
        <td class="num">+0,9342 / (€/m²)</td>
      </tr>
      <tr>
        <td><strong>PKW-Dichte</strong></td>
        <td>Gemeldete PKW je 1.000 Einwohner (KBA)</td>
        <td class="num">−0,0038 / (PKW/1k)</td>
      </tr>
      <tr>
        <td><strong>Verkehrsberuhigung</strong></td>
        <td>Anteil verkehrsberuhigter Bereiche / Spielstraßen am Straßennetz in %</td>
        <td class="num">+0,5545 / %-Punkt</td>
      </tr>
    </tbody>
  </table>

  <h2>Grenzen der Aussagekraft</h2>
  <div class="caveat">
  ${li([
    `<strong>OpenStreetMap ist nicht überall gleich vollständig.</strong> In gut kartierten Regionen sind sowohl Straßen als auch Radwege genauer erfasst. Wo wenig kartiert ist, kann der Anteil in beide Richtungen verzerrt sein.`,
    `<strong>Unklar getaggte Radwege:</strong> Manche Wege sind in OpenStreetMap als Radinfrastruktur erkennbar, aber so getaggt, dass sich nicht sagen lässt, um welche Art es sich handelt („Klärung nötig“). Sie zählen im Radinfra.de-Standard mit. Die Karte zeigt je Gebiet, wie groß dieser Anteil ist (Datenlage <em>gut</em> unter 15&nbsp;%, <em>mittel</em> bis 40&nbsp;%, <em>unsicher</em> darüber) und nennt bei <em>mittel</em> und <em>unsicher</em> den Anteil ohne diese Wege. Der wahre Wert liegt dann dazwischen.`,
    `<strong>Kaum Radinfrastruktur erfasst:</strong> Bei einem Straßennetz ab 20&nbsp;km mit weniger als 0,5&nbsp;km erfasster Radinfrastruktur lässt sich nicht unterscheiden, ob es keine gibt oder ob sie in OpenStreetMap fehlt. Solche Gebiete sind als „kaum erfasst“ markiert.`,
    `<strong>Kleines Straßennetz:</strong> Bei Gemeinden mit sehr wenig erfasstem Straßennetz ist der Prozentwert instabil (wenige Kilometer verschieben ihn stark). Gebiete mit weniger als 5&nbsp;km erfasster Straße bekommen deshalb keinen Rang und fließen weder in die Farbskala noch in Median und Spitzenwert der Vergleiche ein; auf der Karte und in der Detailkarte sind sie weiterhin zu sehen.`,
    `<strong>Momentaufnahme:</strong> Die Karte zeigt den Stand eines Datenabzugs, keine Live-Daten. Neu eingetragene Radwege erscheinen erst mit der nächsten Aktualisierung.`,
    `<strong>Anteil ≠ Qualität:</strong> Ein Schutzstreifen zählt wie ein baulich getrennter Radweg, solange er nicht über den Filter ausgeschlossen wird.`,
    `<strong>Verwaltungsgrenzen aus OSM</strong> können in Einzelfällen von der amtlichen Abgrenzung abweichen.`,
  ])}
  </div>

  ${downloadSection}

  <h2>Fehler gefunden? Mitmachen.</h2>
  <p>Wenn ein Radweg fehlt oder eine Straße falsch erfasst ist, lässt sich das direkt in
  OpenStreetMap korrigieren – die Karte übernimmt die Änderung bei der nächsten Aktualisierung.
  Ein guter Einstieg ist der <a href="https://www.openstreetmap.org/edit">OSM-Editor</a> oder die
  App <a href="https://wiki.openstreetmap.org/wiki/StreetComplete">StreetComplete</a>.</p>

  <footer>
    Radinfra-Vergleich · Daten © OpenStreetMap-Mitwirkende (ODbL) ·
    Aufbereitung auf Basis von <a href="${input.sourceRepoUrl}">tilda-geo</a> ·
    erstellt von ${input.projectLead}
  </footer>
</main>
</body>
</html>
`
}
