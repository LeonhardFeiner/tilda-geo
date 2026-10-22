export type LegalPageInput = {
  projectLead: string
  viewerHref: string
}

/**
 * Impressum + Datenschutz next to the viewer (`impressum.html`, linked from both footers).
 * Address and email are placeholders on purpose: fill in LEGAL_CONTACT before the site is used
 * in public, an Impressum without a postal address is not a valid one.
 */
export const LEGAL_CONTACT = {
  address: '[ANSCHRIFT EINTRAGEN: Straße Hausnummer, PLZ Ort]',
  email: '[E-MAIL EINTRAGEN]',
}

export function legalPageHtml(input: LegalPageInput): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Impressum &amp; Datenschutz – Radinfra-Vergleich</title>
<meta name="robots" content="noindex,follow" />
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; background: #f6f7f5; color: #1f2421;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 44rem; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.7rem; line-height: 1.25; margin: 0 0 24px; }
  h2 { font-size: 1.2rem; margin: 34px 0 8px; border-top: 1px solid #e2e4e0; padding-top: 22px; }
  p { margin: 0 0 12px; }
  ul { margin: 0 0 14px; padding-left: 1.3em; }
  li { margin: 3px 0; }
  a { color: #1b6e4b; }
  .back { display: inline-block; margin-bottom: 20px; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
  <a class="back" href="${input.viewerHref}">&larr; Zur Karte</a>
  <h1>Impressum &amp; Datenschutz</h1>

  <h2>Impressum</h2>
  <p>Angaben gemäß § 5 DDG; verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:</p>
  <p>${input.projectLead}<br />${LEGAL_CONTACT.address}<br />E-Mail: ${LEGAL_CONTACT.email}</p>
  <p>Der Radinfra-Vergleich ist ein privates, nicht-kommerzielles Projekt. Die Zahlen werden
  automatisch aus offenen Daten berechnet; Methodik und Quellen stehen auf der Seite
  <a href="./methodik.html">Methodik &amp; Datenquellen</a>.</p>

  <h2>Datenschutz</h2>
  <p>Diese Seite setzt keine Cookies, verwendet kein Tracking und keine Analysewerkzeuge.</p>
  <ul>
    <li><strong>Hosting:</strong> Die Seite liegt bei GitHub Pages (GitHub Inc., USA). Beim Aufruf
    verarbeitet GitHub technisch notwendige Daten wie die IP-Adresse, siehe die
    <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement">Datenschutzerklärung von GitHub</a>.</li>
    <li><strong>Hintergrundkarte:</strong> Die Kartenkacheln lädt Ihr Browser je nach gewählter
    Hintergrundkarte direkt von <a href="https://www.maptiler.com/privacy-policy/">MapTiler</a>
    (Schweiz), vom <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy">OpenStreetMap-Kartenserver</a>
    oder von <a href="https://www.openstreetmap.de/datenschutz.html">openstreetmap.de (FOSSGIS e.&nbsp;V.)</a>.
    Dabei werden Ihre IP-Adresse und der Kartenausschnitt an den jeweiligen Anbieter übertragen.
    Linien-Overlays kommen vom Kachelserver von <a href="https://tilda-geo.de">TILDA</a>.</li>
    <li><strong>Mein Standort:</strong> Nur wenn Sie die Funktion antippen, fragt der Browser nach
    Ihrem Standort. Er wird ausschließlich im Browser verwendet, um Ihre Gemeinde zu finden, und
    nicht übertragen.</li>
    <li><strong>Einstellungen:</strong> Die gewählte Schriftgröße wird im lokalen Speicher Ihres
    Browsers abgelegt und verlässt Ihr Gerät nicht.</li>
  </ul>
  <p>Rechtsgrundlage für die Übertragung an die Kartenanbieter ist das berechtigte Interesse an
  einer funktionierenden Kartendarstellung (Art. 6 Abs. 1 lit. f DSGVO). Sie haben das Recht auf
  Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Beschwerde bei einer
  Datenschutz-Aufsichtsbehörde. Kontakt: ${LEGAL_CONTACT.email}</p>
</main>
</body>
</html>
`
}
