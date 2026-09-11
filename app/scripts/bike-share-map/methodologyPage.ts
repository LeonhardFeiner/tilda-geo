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
}

const OSM_TAGGING_URL = 'https://wiki.openstreetmap.org/wiki/DE:Fahrradinfrastruktur'
const TILDA_URL = 'https://tilda-geo.de'
const RADINFRA_URL = 'https://radinfra.de'
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
  ])}

  <h2>Wie werden Straßen gezählt?</h2>
  <p>Aus den OSM-Straßentypen (<code>highway=*</code>) werden vier Gruppen gebildet:</p>
  ${roadClassList()}
  <p>Reine Fuß- und Radwege ohne begleitende Fahrbahn zählen <strong>nicht</strong> zur
  Straßenlänge – sonst würde ein gut ausgebautes Radnetz den eigenen Nenner vergrößern.</p>

  <h2>Wie wird Radinfrastruktur gezählt?</h2>
  <p>Die Klassifizierung folgt dem Schema von <a href="${RADINFRA_URL}">radinfra.de</a> bzw. TILDA
  (<a href="${OSM_TAGGING_URL}">OSM-Radverkehrs-Tagging</a>). Ein Straßenabschnitt gilt als mit
  Radinfrastruktur, wenn parallel eine der folgenden Kategorien erfasst ist:</p>
  ${bikelaneClassList()}
  <p>Beidseitige Radinfrastruktur wird als solche berücksichtigt; die Länge bezieht sich auf die
  Straße, nicht auf die Summe beider Seiten.</p>

  ${peerSection}

  <h2>Grenzen der Aussagekraft</h2>
  <div class="caveat">
  ${li([
    `<strong>OpenStreetMap ist nicht überall gleich vollständig.</strong> In gut kartierten Regionen sind sowohl Straßen als auch Radwege genauer erfasst. Wo wenig kartiert ist, kann der Anteil in beide Richtungen verzerrt sein.`,
    `<strong>Kleines Straßennetz:</strong> Bei Gemeinden mit sehr wenig erfasstem Straßennetz ist der Prozentwert instabil (wenige Kilometer verschieben ihn stark). Solche Fälle werden in der Karte markiert und aus der Farbskala herausgehalten.`,
    `<strong>Momentaufnahme:</strong> Die Karte zeigt den Stand eines Datenabzugs, keine Live-Daten. Neu eingetragene Radwege erscheinen erst mit der nächsten Aktualisierung.`,
    `<strong>Anteil ≠ Qualität:</strong> Ein Schutzstreifen zählt wie ein baulich getrennter Radweg, solange er nicht über den Filter ausgeschlossen wird.`,
    `<strong>Verwaltungsgrenzen aus OSM</strong> können in Einzelfällen von der amtlichen Abgrenzung abweichen.`,
  ])}
  </div>

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
