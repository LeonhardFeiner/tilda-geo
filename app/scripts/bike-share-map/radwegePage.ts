import { buildBasemapStyleJson } from './basemaps'
import { AUTHOR_OSM_USER, LEGAL_CONTACT } from './legalPage'
import {
  BEDARF,
  BELAG,
  CONCEPT_DATE,
  PLAN_SAYS,
  STATUS_GROUPS,
  STEP_KINDS,
  vorhandenAuf,
  WEG,
} from './radwegeStatus'
import { siteIconHeadLinks } from './siteIcon'
import { visitCounterHeadScript } from './visitCounter'

export type RadwegePageInput = {
  /** radwege-schweitenkirchen.json (RadwegeData from radwegeData.ts), with ?v=. */
  dataHref: string
  /** Author, named on the page with the political affiliation (see legalPage.ts). */
  projectLead: string
}

const PLAN_LABEL = {
  kurz: 'Kurz- bis mittelfristig (Lageplan 5/1)',
  lang: 'Mittel- bis langfristig (Lageplan 5/2)',
} as const
const NETZ_LABEL = {
  haupt: 'Haupttrassen',
  ergaenzend: 'Ergänzende Trassen',
  bestand: 'Bestehende Geh- und Radwege',
  landkreis: 'Radnetz des Landkreises (nachrichtlich)',
} as const
const BAULAST = ['Gemeinde', 'Landkreis', 'Freistaat', 'unklar'] as const
const BAULAST_LABEL = {
  Gemeinde: 'Gemeinde',
  Landkreis: 'Landkreis',
  Freistaat: 'Freistaat (Staatliches Bauamt)',
  unklar: 'nicht angegeben',
} as const
const AUSBAU_LABEL = {
  freigabe: 'Vorhandener Weg, laut Lageplan 5/1 freigeben und beschildern; der Belag bleibt',
  'kein-weg':
    'Lageplan 5/1, aber kein Weg zum Freigeben: die Linie folgt keinem vorhandenen Weg oder nur der Fahrbahn einer Kreis- oder Staatsstraße',
  'bestand-weg': 'Bestehender asphaltierter Weg, nur Freigabe (gestrichelt in Lageplan 5/2)',
  voll: 'Vollausbau als Geh- und Radweg, Asphalt empfohlen (durchgezogen in Lageplan 5/2)',
  bestand: 'Bestehender asphaltierter Geh- und Radweg (Lageplan 5/1)',
} as const
/** Events shown before "Ältere Vorgänge" in the detail view; entries in "Neueste Vorgänge". */
const TIMELINE_OPEN = 3
const RECENT_COUNT = 8
const LANDKREIS = {
  vorrang: { label: 'Radvorrangroute des Landkreises', colour: '#0e7490', width: 10 },
  basis: { label: 'Basisradnetz des Landkreises', colour: '#64748b', width: 7 },
} as const

/**
 * Unlisted page (github.io only): every route of the Schweitenkirchen Radwegekonzept on a map,
 * with what has publicly happened to it. One plan at a time; a bar of the progress groups is
 * summary, legend and filter at once; a click on a line replaces the overview with that route.
 */
export function radwegePageHtml({ dataHref, projectLead }: RadwegePageInput) {
  const style = JSON.stringify(buildBasemapStyleJson('light'))
  const conceptDe = CONCEPT_DATE.split('-').reverse().join('.')
  const checkbox = (name: string, value: string, label: string) =>
    `<label><input type="checkbox" name="${name}" value="${value}" checked /><span>${label}</span></label>`
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Radwege Schweitenkirchen – Stand der Umsetzung</title>
  <meta name="description" content="Jede Trasse des Radwegekonzepts der Gemeinde Schweitenkirchen vom ${conceptDe} mit allen öffentlich dokumentierten Schritten und Quellen." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Radwege Schweitenkirchen – Stand der Umsetzung" />
  <meta property="og:description" content="Was aus dem Radwegekonzept vom ${conceptDe} geworden ist: jede Trasse mit allen öffentlich dokumentierten Schritten und Quellen." />
  ${siteIconHeadLinks()}
  ${visitCounterHeadScript()}
  <link href="./vendor/maplibre-gl-4.7.1/maplibre-gl.css" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff;
      --fg: #1c1f23;
      --muted: #5a6068;
      --border: #d5d8dc;
      --accent: #1f5fae;
      --row-hover: #eef3fa;
      --shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme='light']) {
        --bg: #1e2125;
        --fg: #eceef0;
        --muted: #a9afb6;
        --border: #3a3f45;
        --accent: #7fb0ec;
        --row-hover: #2a3038;
        --shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      }
    }
    :root[data-theme='dark'] {
      --bg: #1e2125;
      --fg: #eceef0;
      --muted: #a9afb6;
      --border: #3a3f45;
      --accent: #7fb0ec;
      --row-hover: #2a3038;
      --shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }
    html, body { margin: 0; height: 100%; }
    body {
      background: var(--bg);
      color: var(--fg);
      font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    #map { position: absolute; inset: 0; }
    #panel {
      position: absolute;
      top: 12px;
      left: 12px;
      width: 390px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 24px);
      max-height: calc(100dvh - 24px);
      overflow: auto;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
      box-sizing: border-box;
    }
    #panel > summary {
      cursor: pointer;
      padding: 10px 14px;
      font-weight: 600;
      font-size: 16px;
      list-style: none;
    }
    #panel > summary::-webkit-details-marker { display: none; }
    #panel > summary::after { content: '▾'; float: right; color: var(--muted); }
    #panel:not([open]) > summary::after { content: '▸'; }
    #panel > summary h1 { display: inline; font-size: inherit; margin: 0; }
    .body { padding: 0 14px 12px; }
    p { margin: 0 0 8px; }
    .muted { color: var(--muted); font-size: 12px; }
    a { color: var(--accent); }
    fieldset { border: 0; padding: 0; margin: 0 0 10px; }
    legend { font-weight: 600; margin-bottom: 4px; padding: 0; }
    label { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
    label .km { margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sw { display: inline-block; width: 14px; height: 4px; border-radius: 2px; flex: none; }
    .sw.band { height: 8px; opacity: 0.45; }
    #lk-row, #pl-row, #pr-row { font-size: 12px; }
    #status:empty { display: none; }
    .sw.dash { background: none !important; height: 0; border-top: 3px dashed; }
    input[type='search'] {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--fg);
      font: inherit;
    }
    .seg { display: flex; flex-wrap: wrap; gap: 4px; }
    .seg label { padding: 0; }
    .seg input { position: absolute; opacity: 0; pointer-events: none; }
    .seg span {
      display: inline-block;
      padding: 3px 9px;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 13px;
    }
    .seg input:checked + span { background: var(--accent); border-color: var(--accent); color: var(--bg); }
    .seg input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
    .btn {
      font: inherit;
      font-size: 13px;
      padding: 3px 9px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--fg);
      cursor: pointer;
    }
    .btn:hover { background: var(--row-hover); }
    .row-btns { display: flex; gap: 6px; margin: 4px 0; }
    h2 { font-size: 14px; margin: 12px 0 4px; }
    .intro { font-size: 13px; }
    #howto { font-size: 13px; margin: 0 0 8px; }
    #howto > summary { cursor: pointer; color: var(--accent); }
    #howto ul { margin: 4px 0 0; padding-left: 18px; }
    #howto li { margin-bottom: 3px; }
    .page-nav { margin: 0 0 6px; font-size: 12px; }
    #headline { margin: 10px 0 0; font-size: 13px; }
    #keyfact { margin: 6px 0 8px; padding: 6px 8px; border-left: 3px solid #c0392b; background: var(--row-hover); font-size: 13px; }
    #recent-box > summary { cursor: pointer; }
    #recent-box > summary h2 { display: inline; }
    #about { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 6px; font-size: 12px; }
    #about > p { margin: 0 0 6px; }
    #about details > summary { cursor: pointer; color: var(--accent); }
    #about ul { margin: 4px 0 6px; padding-left: 18px; }
    #bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; margin: 8px 0 4px; }
    #bar button { all: unset; display: block; height: 100%; cursor: pointer; min-width: 2px; }
    #bar button.dim { opacity: 0.25; }
    #bar button:focus-visible { outline: 2px solid var(--fg); outline-offset: -2px; }
    #groups { list-style: none; padding: 0; margin: 0 0 4px; }
    #groups button {
      all: unset;
      box-sizing: border-box;
      display: flex;
      width: 100%;
      gap: 8px;
      align-items: baseline;
      padding: 3px 4px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    #groups button:hover, #groups button[aria-pressed='true'] { background: var(--row-hover); }
    #groups button.dim { opacity: 0.45; }
    #groups button:focus-visible { outline: 2px solid var(--accent); }
    #groups .sw { width: 12px; height: 12px; border-radius: 3px; align-self: center; }
    #groups .km { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
    #filter-note { font-size: 12px; }
    #recent { list-style: none; padding: 0; margin: 0; font-size: 13px; }
    #recent li { padding: 4px 0; border-bottom: 1px solid var(--border); }
    #recent .when { font-variant-numeric: tabular-nums; color: var(--muted); }
    #more { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 6px; }
    #more > summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
    #routes { max-height: 240px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; margin-top: 4px; }
    #routes label { padding: 3px 6px; font-size: 13px; }
    #routes label:hover, #routes label.selected { background: var(--row-hover); }
    #routes .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    #routes .name { cursor: pointer; text-decoration: underline dotted; }
    .linkbtn { all: unset; color: var(--accent); cursor: pointer; text-decoration: underline; }
    .linkbtn:focus-visible { outline: 2px solid var(--accent); }
    #detail { font-size: 13px; }
    #detail h2 { font-size: 16px; margin: 8px 0 4px; }
    #detail h3 { font-size: 13px; margin: 12px 0 4px; }
    #detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 10px; margin: 6px 0; }
    #detail dt { color: var(--muted); }
    #detail dd { margin: 0; }
    #detail .summary { background: var(--row-hover); border-radius: 6px; padding: 6px 8px; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 999px; color: #fff; font-size: 12px; }
    .timeline { list-style: none; padding: 0; margin: 6px 0; }
    .timeline li { border-left: 3px solid var(--border); padding: 2px 0 6px 8px; }
    .timeline li.step { border-left-color: var(--accent); }
    .timeline li.uncertain { opacity: 0.75; }
    .timeline .when { font-weight: 600; font-variant-numeric: tabular-nums; }
    /* the heading only takes focus so that keyboard and screen readers land in the details */
    #detail h2:focus { outline: none; }
    .kind { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-left: 4px; }
    #detail details > summary { cursor: pointer; color: var(--accent); margin: 4px 0; }
    .note { background: var(--row-hover); border-radius: 6px; padding: 6px 8px; font-size: 12px; }
    #dauer {
      position: absolute;
      top: 12px;
      right: 12px;
      bottom: 12px;
      left: 414px;
      overflow: auto;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 12px 16px;
      box-sizing: border-box;
    }
    #dauer h2 { margin-top: 0; font-size: 16px; }
    #dauer h3 { font-size: 13px; margin: 14px 0 2px; }
    .d-axis, .d-track { position: relative; display: block; }
    .d-axis { height: 30px; font-size: 11px; color: var(--muted); border-bottom: 1px solid var(--border); margin: 8px 0 2px; }
    .d-axis span { position: absolute; bottom: 2px; transform: translateX(-50%); font-variant-numeric: tabular-nums; }
    .d-axis span.mark { bottom: auto; top: 0; color: var(--fg); }
    .d-row { all: unset; display: block; box-sizing: border-box; width: 100%; padding: 3px 0; border-radius: 4px; cursor: pointer; }
    .d-row:hover, .d-row.selected { background: var(--row-hover); }
    .d-row:focus-visible { outline: 2px solid var(--accent); }
    .d-head { display: flex; flex-wrap: wrap; gap: 0 8px; font-size: 13px; }
    .d-head .dur { margin-left: auto; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .d-track { height: 12px; margin-top: 2px; }
    .d-grid { background-image: linear-gradient(to right, var(--border) 1px, transparent 1px); }
    .d-bar, .d-plan { position: absolute; top: 2px; height: 8px; border-radius: 4px; box-sizing: border-box; }
    .d-plan { background: none; border: 1.5px dashed; }
    .d-idle { position: absolute; top: 4px; height: 4px; border-radius: 2px; opacity: 0.35; }
    .d-line { position: absolute; top: -3px; bottom: -3px; width: 0; border-left: 2px solid var(--fg); opacity: 0.55; }
    .d-ev { position: absolute; top: 1px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; box-sizing: border-box; border: 2px solid var(--fg); background: var(--bg); }
    .d-ev.step { background: var(--fg); border-color: var(--bg); }
    #dauer details > summary { cursor: pointer; color: var(--accent); font-size: 13px; }
    #dauer details p { font-size: 13px; }
    .maplibregl-popup-content { font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 6px 8px; color: #1c1f23; }
    [hidden] { display: none !important; }
    @media (pointer: coarse) {
      label { min-height: 40px; }
      .seg span { padding: 8px 12px; }
      .btn { padding: 8px 12px; }
      #groups button { padding: 10px 4px; }
      /* the bar is too thin to hit with a finger; the legend under it does the same */
      #bar { pointer-events: none; }
      #panel > summary { padding: 13px 14px; }
      #more > summary, #howto > summary, #about summary, #detail details > summary { padding: 10px 0; }
      #recent li { padding: 8px 0; }
      /* iOS zooms into inputs under 16px */
      input[type='search'] { font-size: 16px; }
    }
    @media (max-width: 600px) {
      #panel { top: auto; bottom: 24px; left: 12px; right: 12px; width: auto; max-height: 55vh; max-height: 55dvh; }
      #dauer { left: 12px; bottom: calc(55vh + 36px); bottom: calc(55dvh + 36px); padding: 10px; }
      #panel:not([open]) + #dauer { bottom: 84px; }
      .d-head .dur { margin-left: 0; white-space: normal; }
    }
    /* phones held sideways: a narrower side panel leaves the map room */
    @media (max-height: 500px) and (min-width: 601px) {
      #panel { width: min(390px, 48vw); }
      #dauer { left: calc(min(390px, 48vw) + 24px); }
    }
    @media print {
      #map, #dauer-close, #detail-close, #f-view, .row-btns, #bar, #copy-link { display: none !important; }
      #panel, #dauer { position: static; width: auto; max-width: none; max-height: none; overflow: visible; box-shadow: none; border: 0; }
      #panel > summary::after { content: none; }
      a { color: inherit; }
    }
    @media (max-width: 900px) {
      .d-axis span.minor { display: none; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <noscript><p style="position:absolute;top:60px;left:16px;right:16px;background:#fff;padding:8px">Diese Seite braucht JavaScript für Karte und Liste. Die Quellen stehen im <a href="${dataHref}">Datensatz (JSON)</a>.</p></noscript>
  <details id="panel" open>
    <summary><h1>Radwege Schweitenkirchen</h1></summary>
    <div class="body">
      <div id="overview">
        <p class="muted page-nav"><a href="./index.html?region=relation%2F396557">&larr; Schweitenkirchen im Radinfra-Vergleich</a></p>
        <p class="intro">Was aus dem Radwegekonzept der Gemeinde vom ${conceptDe} geworden ist: jede geplante Trasse mit allen öffentlich dokumentierten Schritten und ihren Quellen. Eine Linie anklicken für Details.</p>
        <details id="howto">
          <summary>So ist die Karte zu lesen</summary>
          <ul>
            <li><strong>Farbe</strong> = der letzte öffentlich dokumentierte Schritt: Beschluss, Grunderwerb, Planung, Programm, Haushaltsansatz oder Bau. Aussagen, Ankündigungen (auch die Maßnahmenliste des Landkreises, KUS) und Anfragen zählen nicht als Schritt; sie stehen in den Details.</li>
            <li><strong>„Kein Schritt dokumentiert“</strong> heißt: in den ausgewerteten öffentlichen Quellen nichts gefunden (welche und bis wann: unten unter „Stand der Recherche“). Nichtöffentliche Tagesordnungspunkte, etwa zum Grunderwerb, und die Arbeit der Verwaltung sind nicht bekannt; es kann also mehr geschehen sein.</li>
            <li><strong>Zwei Pläne:</strong> kurzfristig (Lageplan 5/1) vor allem vorhandene Wege für Räder freigeben und beschildern, langfristig (Lageplan 5/2) ausbauen. „Beide“ zeigt jede Strecke einmal: wo Plan 5/2 oder ein vorhandener Weg dieselbe Strecke führt, gilt dieser; aus Plan 5/1 kommt nur hinzu, was dort nicht liegt.</li>
            <li><strong>Zahlen</strong> sind Kilometer, zunächst nur innerhalb der Gemeindegrenze.</li>
            <li><strong>Zuständig:</strong> Radwege an Kreis- und Staatsstraßen plant und baut der Landkreis bzw. das Staatliche Bauamt; den Grunderwerb übernimmt dort oft die Gemeinde.</li>
            <li><strong>Lage:</strong> Die Lagepläne zeichnen schematisch. Jede Trasse ist deshalb auf den passenden Weg in OpenStreetMap gelegt (bis 60 m vom gezeichneten Verlauf); blasser gezeichnet: kein Weg in der Nähe, Lage nur aus dem Plan.</li>
          </ul>
        </details>
        <p id="headline" aria-live="polite"></p>
        <div id="bar" aria-hidden="true"></div>
        <ul id="groups"></ul>
        <p id="keyfact" hidden></p>
        <p id="since" class="muted" hidden></p>
        <p id="filter-note" hidden></p>
        <fieldset class="seg" id="f-plan">
          <legend>Plan</legend>
          <label><input type="radio" name="plan" value="kurz" checked><span>Kurzfristig (5/1)</span></label>
          <label><input type="radio" name="plan" value="lang"><span>Langfristig (5/2)</span></label>
          <label><input type="radio" name="plan" value="beide"><span>Beide</span></label>
        </fieldset>
        <fieldset class="seg" id="f-netz">
          <legend>Trassen</legend>
          <label><input type="radio" name="netz" value="haupt"><span>Haupttrassen</span></label>
          <label><input type="radio" name="netz" value="ergaenzend"><span>Ergänzende</span></label>
          <label><input type="radio" name="netz" value="alle" checked><span>Alle</span></label>
        </fieldset>
        <fieldset class="seg" id="f-view">
          <legend>Ansicht</legend>
          <label><input type="radio" name="view" value="karte" checked><span>Karte</span></label>
          <label><input type="radio" name="view" value="luftbild"><span>Luftbild</span></label>
          <label><input type="radio" name="view" value="dauer"><span>Dauer</span></label>
        </fieldset>
        <fieldset class="seg" id="f-farbe">
          <legend>Einfärben nach</legend>
          <label><input type="radio" name="farbe" value="stand" checked><span>Stand</span></label>
          <label><input type="radio" name="farbe" value="bedarf"><span>Was zu tun ist</span></label>
          <label><input type="radio" name="farbe" value="weg"><span>Wegart heute</span></label>
          <label><input type="radio" name="farbe" value="belag"><span>Belag heute</span></label>
        </fieldset>
        <p id="status" class="muted" aria-live="polite">Lade Daten …</p>
        <label class="muted" id="innen-row"><input type="checkbox" id="innen-toggle" /><span>Nur innerhalb der Gemeindegrenze</span></label>
        <label class="muted" id="lk-row"><input type="checkbox" id="lk-toggle" checked /><span>Radnetz des Landkreises: <i class="sw band" style="background:${LANDKREIS.vorrang.colour}"></i> Vorrangroute <i class="sw band" style="background:${LANDKREIS.basis.colour}"></i> Basisnetz</span></label>
        <p class="muted" id="line-legend" hidden></p>
        <details id="recent-box" open>
          <summary><h2 id="recent-title">Neueste Vorgänge</h2></summary>
          <ul id="recent"></ul>
          <p class="muted" id="recent-bis" hidden></p>
          <p class="muted" style="margin:4px 0 0"><button class="linkbtn" type="button" id="recent-more"></button></p>
        </details>
        <details id="more">
          <summary>Mehr Filter und Trassenliste</summary>
          <label class="muted" id="pr-row" hidden><input type="checkbox" id="pr-toggle" /><span>Unsichere Stellen: <i class="sw" style="background:#c026d3;border-radius:50%"></i> <span id="pr-count"></span> Stellen, an denen die Lage auf OpenStreetMap unsicher ist (vor Ort zu prüfen)</span></label>
          <label class="muted" id="pl-row"><input type="checkbox" id="pl-toggle" /><span>Lage wie im Plan gezeichnet (ohne Anpassung an Wege): <i class="sw" style="background:#1d4ed8"></i> Haupt <i class="sw" style="background:#0891b2"></i> ergänzend <i class="sw" style="background:#dc2626"></i> Bestand</span></label>
          <fieldset id="f-baulast">
            <legend>Zuständig für Bau und Unterhalt (Baulast)</legend>
            ${BAULAST.map((b) => checkbox('baulast', b, BAULAST_LABEL[b])).join('\n            ')}
          </fieldset>
          <fieldset>
            <legend><label for="route-search" style="padding:0">Trassen</label></legend>
            <input id="route-search" type="search" placeholder="Trasse oder Ort suchen" autocomplete="off" />
            <div class="row-btns"><button class="btn" type="button" id="all-on">alle</button><button class="btn" type="button" id="all-off">keine</button><button class="btn" type="button" id="csv" style="margin-left:auto">CSV</button></div>
            <div id="routes" role="group" aria-label="Trassen ein- und ausblenden"></div>
          </fieldset>
        </details>
        <footer id="about">
          <p>Stand der Recherche: <span id="stand"></span>.<span id="quellen-bis"></span> Quellen: Gemeinderat (Protokolle, Ratsinformationssystem), Rundschau, Landkreis, Landtag, Pfaffenhofener Kurier – jeder Vorgang mit Link. Karte © OpenStreetMap-Mitwirkende.</p>
          <p><strong>Wer steht dahinter?</strong> Ein privates, nicht-kommerzielles Projekt von ${projectLead}, Kandidat auf der Liste BFS/SPD/Grüne in Schweitenkirchen. Damit das nachprüfbar bleibt, steht bei jedem Vorgang die Quelle, und die Einteilung folgt einer festen Regel (siehe „So ist die Karte zu lesen“). ${projectLead} trägt selbst zu OpenStreetMap bei (Benutzer <a href="https://www.openstreetmap.org/user/${AUTHOR_OSM_USER}/history">${AUTHOR_OSM_USER}</a>). <a href="./impressum.html">Impressum &amp; Datenschutz</a></p>
          <p><strong>Fehler gefunden oder ein Vorgang fehlt?</strong> Bitte an ${LEGAL_CONTACT.email}, mit Quelle. Korrekturen werden hier mit Datum vermerkt.</p>
          <details id="korrekturen" hidden><summary>Korrekturen (<span id="korr-count"></span>)</summary><ul id="korr-list"></ul></details>
        </footer>
      </div>
      <div id="detail" hidden></div>
    </div>
  </details>
  <section id="dauer" hidden aria-labelledby="dauer-title">
    <p style="float:right;margin:0"><button class="btn" type="button" id="dauer-close">Zur Karte</button></p>
    <h2 id="dauer-title">Seit wann gibt es öffentliche Schritte?</h2>
    <p class="muted">Kräftiger Balken: vom ersten bis zum letzten dokumentierten Schritt (oder bis zur Eröffnung); blass: seit dem letzten Schritt bis heute. Gestrichelt: der im Landkreis-Steckbrief (KUS) angekündigte Termin.</p>
    <details><summary>Mehr zur Darstellung</summary><p>Schritte sind Programm, Beschluss, Planung, Grunderwerb, Haushaltsansatz und Bau – gleich ob Gemeinde, Landkreis oder Freistaat zuständig ist. Punkte: einzelne Vorgänge (gefüllt: Schritt, hohl: Aussage, Ankündigung oder Anfrage). Senkrechte Linie: Radwegekonzept vom ${conceptDe}. Es gelten die Filter im Seitenfeld; eine Zeile anklicken für Details und Quellen.</p></details>
    <div id="dauer-chart"></div>
  </section>
  <script src="./vendor/maplibre-gl-4.7.1/maplibre-gl.js"></script>
  <script>
  (async function () {
    const DATA_HREF = ${JSON.stringify(dataHref)};
    const GROUPS = ${JSON.stringify(STATUS_GROUPS)};
    const STEP_KINDS = ${JSON.stringify(STEP_KINDS)};
    const PLAN_LABEL = ${JSON.stringify(PLAN_LABEL)};
    const NETZ_LABEL = ${JSON.stringify(NETZ_LABEL)};
    const AUSBAU_LABEL = ${JSON.stringify(AUSBAU_LABEL)};
    const PLAN_SAYS = ${JSON.stringify(PLAN_SAYS)};
    const VORHANDEN_AUF = ${JSON.stringify(Object.fromEntries((['bestand', 'freigabe'] as const).map((a) => [a, Object.fromEntries(WEG.map((w) => [w.id, vorhandenAuf(a, w.id)]))])))};
    const TIMELINE_OPEN = ${TIMELINE_OPEN};
    const RECENT_COUNT = ${RECENT_COUNT};
    const CONCEPT_DATE = ${JSON.stringify(CONCEPT_DATE)};
    const LANDKREIS = ${JSON.stringify(LANDKREIS)};
    const BAULAST_LABEL = ${JSON.stringify(BAULAST_LABEL)};
    const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
    const ORDER = GROUPS.map((g) => g.id);
    /** Colour modes: which line property the bar, legend, filter and map colours follow. */
    const MODES = {
      stand: { key: 'status', cats: GROUPS, param: 'stand' },
      bedarf: { key: 'bedarf', cats: ${JSON.stringify(BEDARF)}, param: 'nur' },
      weg: { key: 'weg', cats: ${JSON.stringify(WEG)}, param: 'nur' },
      belag: { key: 'belag', cats: ${JSON.stringify(BELAG)}, param: 'nur' },
    };
    for (const m of Object.values(MODES)) m.byId = Object.fromEntries(m.cats.map((c) => [c.id, c]));
    const $ = (id) => document.getElementById(id);
    const escHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const km = (m) => (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '\u00a0km';
    const deDate = (d) => d.split('-').reverse().join('.');
    const link = (url, text) => '<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>';
    /** Source link of an event; paywalled sources are marked. */
    const evLink = (e) => link(e.url, e.source) + (e.paywall ? ' <span class="muted">(Bezahlschranke)</span>' : '');
    const short = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\\s+\\S*$/, '') + ' …' : t);

    /** Fractional year of a (partial) date, at the start of its period. */
    const fy = (d) => {
      const p = d.split('-').map(Number);
      return p[0] + ((p[1] || 1) - 1) / 12 + ((p[2] || 1) - 1) / 365;
    };
    /** Months between two dates, worded for "seit …" / "nach …" (dative). */
    function dur(a, b) {
      const mo = Math.max(0, Math.round((fy(b) - fy(a)) * 12));
      if (mo === 0) return 'weniger als einem Monat';
      if (mo < 12) return mo + (mo === 1 ? ' Monat' : ' Monaten');
      const y = Math.round(mo / 6) / 2;
      return y.toLocaleString('de-DE') + (y === 1 ? ' Jahr' : ' Jahren');
    }

    // ---- state (URL keeps only what differs from the default view)
    const params = new URLSearchParams(location.search);
    const offList = (k) => new Set((params.get(k) || '').split(',').filter(Boolean));
    const state = {
      plan: ['lang', 'beide'].includes(params.get('plan')) ? params.get('plan') : 'kurz',
      farbe: MODES[params.get('farbe')] ? params.get('farbe') : 'stand',
      only: null,
      off: { baulast: offList('ohne-baulast') },
      // vorhandene Wege und das Landkreisnetz bleiben immer sichtbar; wählbar ist nur, ob die ergänzenden Trassen dazukommen
      netz: ['haupt', 'ergaenzend'].includes(params.get('netz')) ? params.get('netz') : offList('ohne-netz').has('ergaenzend') ? 'haupt' : 'alle',
      hidden: offList('ohne'),
      selected: params.get('trasse') || null,
      search: '',
      // Karte or Luftbild (the same map on aerial images), or the duration chart
      view: ['dauer', 'luftbild'].includes(params.get('ansicht')) ? params.get('ansicht') : params.get('hintergrund') === 'luftbild' ? 'luftbild' : 'karte',
      // the Landkreis network is drawn on plan 5/2 only: shown there by default, off with 5/1;
      // null follows the plan, a click sets it until the plan changes
      landkreis: params.get('landkreis') === 'an' ? true : params.get('landkreis') === 'aus' ? false : null,
      planlage: params.get('planlage') === 'an',
      // the concept is the Gemeinde's: by default map and numbers stop at its boundary
      innen: params.get('gemeinde') !== 'alle',
      // the recent list: the latest few, or every event since this date
      seit: /^\\d{4}(-\\d{2}(-\\d{2})?)?$/.test(params.get('seit') || '') ? params.get('seit') : null,
      pruefen: params.get('pruefen') === 'an',
    };
    const mode = () => MODES[state.farbe];
    {
      // one or more categories, comma-separated
      // nur=freigabe predates the split by surface
      const ids = (params.get(mode().param) || '').split(',').flatMap((id) => (state.farbe === 'bedarf' && id === 'freigabe' ? ['freigabe-asphalt', 'freigabe-unbefestigt', 'freigabe-unbekannt'] : [id])).filter((id) => mode().byId[id]);
      if (ids.length) state.only = ids;
    }
    /** Other routes under the last map click, offered in the detail view. */
    let others = [];
    const URL_KEYS = { baulast: 'ohne-baulast' };
    const landkreisDefault = () => state.plan !== 'kurz';
    const landkreisOn = () => (state.landkreis === null ? landkreisDefault() : state.landkreis);
    function syncUrl() {
      const p = new URLSearchParams();
      if (state.plan !== 'kurz') p.set('plan', state.plan);
      if (state.view !== 'karte') p.set('ansicht', state.view);
      if (state.landkreis !== null && state.landkreis !== landkreisDefault()) p.set('landkreis', state.landkreis ? 'an' : 'aus');
      if (state.planlage) p.set('planlage', 'an');
      if (!state.innen) p.set('gemeinde', 'alle');
      if (state.seit) p.set('seit', state.seit);
      if (state.netz !== 'alle') p.set('netz', state.netz);
      if (state.pruefen) p.set('pruefen', 'an');
      if (state.farbe !== 'stand') p.set('farbe', state.farbe);
      if (state.only) p.set(mode().param, state.only.join(','));
      for (const [k, key] of Object.entries(URL_KEYS)) if (state.off[k].size) p.set(key, [...state.off[k]].join(','));
      if (state.hidden.size) p.set('ohne', [...state.hidden].join(','));
      if (state.selected) p.set('trasse', state.selected);
      const q = p.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }

    // the data download starts before the map is built
    const dataP = fetch(DATA_HREF).then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
    // Without WebGL MapLibre throws; the overview, the details and the CSV still work.
    let map = null;
    try {
      map = new maplibregl.Map({
        container: 'map',
        style: ${style},
        bounds: [[11.53, 48.45], [11.68, 48.56]],
        hash: 'karte',
        maxZoom: 18,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    } catch (e) {
      console.warn(e);
      map = null;
    }

    let data;
    try {
      data = await dataP;
    } catch (e) {
      console.error(e);
      $('status').innerHTML = 'Die Daten konnten nicht geladen werden. <button class="linkbtn" type="button" id="retry">Erneut versuchen</button>';
      $('retry').addEventListener('click', () => location.reload());
      return;
    }
    const routes = data.routes;
    const routeById = new Map(routes.map((r) => [r.id, r]));
    const features = data.lines.features;
    if (state.selected && !routeById.has(state.selected)) state.selected = null;
    $('stand').textContent = deDate(data.stand);
    // how far each source was searched: an empty stretch at the end means "not searched yet", not "nothing happened"
    {
      const q = data.quellen || [];
      const bis = (x) => x.bisText || 'bis ' + deDate(x.bis);
      if (q.length && q.every((x) => x.bis)) {
        $('quellen-bis').textContent = ' Ausgewertet: ' + q.map((x) => x.label + ' ab ' + deDate(x.from) + ', ' + bis(x)).join('; ') + '.';
        $('recent-bis').textContent = 'Durchgesehen: ' + q.map((x) => x.label.replace(/ \\(.*\\)$/, '') + ' ' + bis(x)).join(' · ') + '. Was danach geschah, fehlt hier noch.';
        $('recent-bis').hidden = false;
      }
    }

    // ---- filters
    /** Existing paths belong to both plans; "beide" takes each stretch once (kombi, against the 5/2 lines the Trassen filter shows); optionally only inside the Gemeinde. */
    const inPlan = (p) => (state.plan === 'beide' ? (state.netz === 'haupt' ? p.kombiHaupt : state.netz === 'ergaenzend' ? p.kombiErgaenzend : p.kombi) : p.plan === state.plan || p.status === 'bestand') && (!state.innen || p.innen);
    function passesOther(p) {
      const r = routeById.get(p.routeId);
      // existing paths always show; "Nur Ergänzende" also leaves out the Landkreis route
      const netzOk = state.netz === 'alle' || p.netz === 'bestand' || (state.netz === 'haupt' ? p.netz !== 'ergaenzend' : p.netz === 'ergaenzend');
      return inPlan(p) && netzOk && !state.off.baulast.has(r.baulast) && !state.hidden.has(p.routeId);
    }
    const passes = (p) => passesOther(p) && (!state.only || state.only.includes(p[mode().key]));
    const visible = () => features.filter((f) => passes(f.properties));
    /** Progress groups (or, with a key, the categories of that property) of a route's lines in the current plan, in legend order. */
    function routeGroups(id, key) {
      const k = key || 'status';
      const ids = Object.values(MODES).find((m) => m.key === k).cats.map((c) => c.id);
      const gs = new Set();
      for (const f of features) if (f.properties.routeId === id && inPlan(f.properties)) gs.add(f.properties[k]);
      return [...gs].sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    }

    // ---- controls
    for (const input of document.querySelectorAll('input[name=plan]')) {
      input.checked = input.value === state.plan;
      input.addEventListener('change', () => {
        state.plan = input.value;
        state.landkreis = null;
        render();
      });
    }
    for (const input of document.querySelectorAll('input[name=farbe]')) {
      input.checked = input.value === state.farbe;
      input.addEventListener('change', () => {
        state.farbe = input.value;
        state.only = null;
        render();
      });
    }
    // closing the chart returns to the map view it was opened from
    let lastMap = state.view === 'dauer' ? 'karte' : state.view;
    function setView(v) {
      if (v !== 'dauer') lastMap = v;
      state.view = v;
      // phones: the chart needs the screen the bottom sheet would cover
      if (v === 'dauer' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches) $('panel').open = false;
      for (const input of document.querySelectorAll('input[name=view]')) input.checked = input.value === v;
      render();
    }
    for (const input of document.querySelectorAll('input[name=view]')) {
      input.checked = input.value === state.view;
      input.addEventListener('change', () => setView(input.value));
    }
    $('dauer-close').addEventListener('click', () => setView(lastMap));
    $('pl-toggle').checked = state.planlage;
    $('pl-toggle').addEventListener('change', (e) => {
      state.planlage = e.target.checked;
      render();
    });
    $('pr-row').hidden = !data.pruefen;
    // the checking aids sit in "Mehr Filter": a link with one switched on opens it
    if (state.pruefen || state.planlage) $('more').open = true;
    $('pr-toggle').checked = state.pruefen;
    $('pr-toggle').addEventListener('change', (e) => {
      state.pruefen = e.target.checked;
      render();
    });
    $('innen-toggle').checked = state.innen;
    $('innen-toggle').addEventListener('change', (e) => {
      state.innen = e.target.checked;
      render();
    });
    $('lk-toggle').addEventListener('change', (e) => {
      state.landkreis = e.target.checked;
      render();
    });
    if (state.view === 'dauer' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches) $('panel').open = false;
    for (const [k] of Object.entries(URL_KEYS)) {
      for (const input of document.querySelectorAll('input[name=' + k + ']')) {
        input.checked = !state.off[k].has(input.value);
        input.addEventListener('change', () => {
          if (input.checked) state.off[k].delete(input.value);
          else state.off[k].add(input.value);
          render();
        });
      }
    }
    if (state.off.baulast.size || state.hidden.size) $('more').open = true;
    for (const input of document.querySelectorAll('input[name=netz]')) {
      input.checked = input.value === state.netz;
      input.addEventListener('change', () => {
        state.netz = input.value;
        render();
      });
    }
    $('route-search').addEventListener('input', (e) => {
      state.search = e.target.value.trim().toLowerCase();
      renderList();
    });
    const listed = () => routes.filter((r) => !state.search || (r.name + ' ' + (r.road || '')).toLowerCase().includes(state.search));
    $('all-on').addEventListener('click', () => {
      for (const r of listed()) state.hidden.delete(r.id);
      render();
    });
    $('all-off').addEventListener('click', () => {
      for (const r of listed()) state.hidden.add(r.id);
      render();
    });
    $('csv').addEventListener('click', downloadCsv);
    /** Click: only this category (again: all). Shift/Ctrl/Cmd-click: add or remove it. */
    function toggleOnly(id, add) {
      if (add) {
        const set = new Set(state.only || []);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        state.only = set.size ? mode().cats.map((c) => c.id).filter((c) => set.has(c)) : null;
      } else {
        state.only = state.only && state.only.length === 1 && state.only[0] === id ? null : [id];
      }
      render();
    }
    const isAdd = (e) => e.shiftKey || e.ctrlKey || e.metaKey;
    // Delegated: links to a route anywhere in the panel (recent list, "auch hier")
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('[data-select]');
      if (!a) return;
      e.preventDefault();
      select(a.dataset.select, true);
    });

    // ---- map
    const EMPTY = { type: 'FeatureCollection', features: [] };
    const colourExpr = () => ['match', ['get', mode().key], ...mode().cats.flatMap((g) => [g.id, g.colour]), '#888'];
    const COLOUR = colourExpr();
    // Dashes only mean something in plan 5/2 (existing way, release only)
    // dashed: plan 5/2 "existing way, release only" and existing lines that are no usable cycle
    // path in the progress views; "no way" in the OSM views
    const dashedExpr = () => state.farbe === 'stand' || state.farbe === 'bedarf' ? ['any', ['==', ['get', 'ausbau'], 'bestand-weg'], ['get', 'ohneRadweg']] : ['==', ['get', 'weg'], 'kein'];
    const DASHED = dashedExpr();
    const width = (w) => ['interpolate', ['linear'], ['zoom'], 11, w, 16, w * 2];
    // a new path beside a road sits on the side the plan draws it on (positive = right of the line direction)
    const side = (px) => ['match', ['get', 'seite'], 'links', -px, 'rechts', px, 0];
    const OFFSET = ['interpolate', ['linear'], ['zoom'], 11, side(2), 16, side(7)];
    const LINE_LAYERS = ['radwege-solid', 'radwege-dashed'];
    let mapReady = false;
    let hoverPopup = null;
    let tapPopup = null;
    /** Popup text of the context layers; on hover with a mouse, on tap with a finger. */
    const POPUP = {
      landkreis: (p) => '<strong>' + escHtml(LANDKREIS[p.netz].label) + '</strong><br>Mobilitätskonzept des Landkreises (2023), im Radwegekonzept nachrichtlich übernommen; als Geh- und Radweg vorgesehen.',
      querungen: (p) => '<strong>Querung (Annahme)</strong><br>' + escHtml(p.text),
      pruefen: (p) => '<strong>Unsichere Stelle: ' + escHtml(routeById.get(p.routeId).name) + '</strong><br>' + escHtml(p.text),
    };
    function onMapReady(fn) {
      if (!map) {
        $('status').textContent += ' Die Karte kann in diesem Browser nicht angezeigt werden (WebGL fehlt); Übersicht und Details funktionieren.';
        return;
      }
      if (map.isStyleLoaded()) fn();
      else map.once('load', fn);
    }
    onMapReady(() => {
      // Luftbild: amtliche Orthophotos (DOP20) der Bayerischen Vermessungsverwaltung, Open Data;
      // unter den Beschriftungen der Grundkarte, über ihren Flächen. Lädt erst beim Einschalten.
      map.addSource('luftbild', {
        type: 'raster',
        // 512 px tiles: half the requests, and sharp on high-resolution screens
        tiles: ['https://geoservices.bayern.de/od/wms/dop/v1/dop20?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=by_dop20c&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg'],
        tileSize: 512,
        maxzoom: 19,
        attribution: 'Luftbild © <a href="https://geodaten.bayern.de/opengeodata/">Bayerische Vermessungsverwaltung</a> (CC BY 4.0)',
      });
      const firstLabel = (map.getStyle().layers || []).find((l) => l.type === 'symbol');
      map.addLayer({ id: 'luftbild', type: 'raster', source: 'luftbild', layout: { visibility: 'none' } }, firstLabel ? firstLabel.id : undefined);
      if (data.outline) {
        map.addSource('gemeinde', { type: 'geojson', data: data.outline });
        map.addLayer({ id: 'gemeinde', type: 'line', source: 'gemeinde', paint: { 'line-color': '#5a6068', 'line-width': 1.5, 'line-dasharray': [4, 2], 'line-opacity': 0.8 } });
      }
      if (data.landkreis) {
        map.addSource('landkreis', { type: 'geojson', data: data.landkreis });
        map.addLayer({ id: 'landkreis', type: 'line', source: 'landkreis', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
          'line-color': ['match', ['get', 'netz'], 'vorrang', LANDKREIS.vorrang.colour, LANDKREIS.basis.colour],
          // zoom must be the outer expression: MapLibre rejects an interpolate inside a match
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'netz'], 'vorrang', LANDKREIS.vorrang.width, LANDKREIS.basis.width], 16, ['match', ['get', 'netz'], 'vorrang', LANDKREIS.vorrang.width * 2, LANDKREIS.basis.width * 2]],
          'line-opacity': 0.4,
        } });
        map.on('mousemove', 'landkreis', (e) => {
          // the route lines on top have their own popup
          if (map.queryRenderedFeatures(e.point, { layers: LINE_LAYERS }).length) return;
          const p = e.features && e.features[0] && e.features[0].properties;
          if (!p) return;
          if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          hoverPopup.setLngLat(e.lngLat).setHTML(POPUP.landkreis(p)).addTo(map);
        });
        map.on('mouseleave', 'landkreis', () => hoverPopup && hoverPopup.remove());
      }
      map.addSource('radwege', { type: 'geojson', data: EMPTY, promoteId: 'fid' });
      map.addLayer({ id: 'radwege-selected', type: 'line', source: 'radwege', filter: ['==', ['get', 'routeId'], ''], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-offset': OFFSET, 'line-color': '#ffd400', 'line-width': width(10), 'line-opacity': 0.6 } });
      map.addLayer({ id: 'radwege-casing', type: 'line', source: 'radwege', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-offset': OFFSET, 'line-color': '#fff', 'line-width': width(6), 'line-opacity': 0.9 } });
      map.addLayer({ id: 'radwege-solid', type: 'line', source: 'radwege', filter: ['!', DASHED], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-offset': OFFSET, 'line-width': width(3.5), 'line-color': COLOUR } });
      map.addLayer({ id: 'radwege-dashed', type: 'line', source: 'radwege', filter: DASHED, layout: { 'line-join': 'round' }, paint: { 'line-offset': OFFSET, 'line-width': width(3.5), 'line-dasharray': [2, 1.2], 'line-color': COLOUR } });
      if (data.planlage) {
        map.addSource('planlage', { type: 'geojson', data: data.planlage });
        const plColour = ['match', ['get', 'netz'], 'haupt', '#1d4ed8', 'ergaenzend', '#0891b2', '#dc2626'];
        map.addLayer({ id: 'planlage', type: 'line', source: 'planlage', filter: ['!', ['get', 'dashed']], layout: { 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': plColour, 'line-width': width(1.6) } });
        map.addLayer({ id: 'planlage-dashed', type: 'line', source: 'planlage', filter: ['get', 'dashed'], layout: { 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': plColour, 'line-width': width(1.6), 'line-dasharray': [3, 2] } });
      }
      if (data.querungen) {
        map.addSource('querungen', { type: 'geojson', data: data.querungen });
        map.addLayer({ id: 'querungen', type: 'circle', source: 'querungen', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 16, 7], 'circle-color': '#fff', 'circle-stroke-color': '#1f2328', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 3] } });
        map.on('mousemove', 'querungen', (e) => {
          const p = e.features && e.features[0] && e.features[0].properties;
          if (!p) return;
          if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          hoverPopup.setLngLat(e.lngLat).setHTML(POPUP.querungen(p)).addTo(map);
        });
        map.on('mouseleave', 'querungen', () => hoverPopup && hoverPopup.remove());
      }
      if (data.pruefen) {
        map.addSource('pruefen', { type: 'geojson', data: data.pruefen });
        map.addLayer({ id: 'pruefen', type: 'circle', source: 'pruefen', layout: { visibility: 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 8], 'circle-color': '#c026d3', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
        map.on('mousemove', 'pruefen', (e) => {
          const p = e.features && e.features[0] && e.features[0].properties;
          if (!p) return;
          map.getCanvas().style.cursor = 'pointer';
          if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          hoverPopup.setLngLat(e.lngLat).setHTML(POPUP.pruefen(p)).addTo(map);
        });
        map.on('mouseleave', 'pruefen', () => {
          map.getCanvas().style.cursor = '';
          if (hoverPopup) hoverPopup.remove();
        });
      }
      for (const id of LINE_LAYERS) {
        map.setPaintProperty(id, 'line-opacity', ['case', ['>', ['get', 'fromPlan'], 0.5], 0.6, 1]);
        map.on('mousemove', id, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const p = e.features && e.features[0] && e.features[0].properties;
          if (!p) return;
          const r = routeById.get(p.routeId);
          if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          hoverPopup.setLngLat(e.lngLat).setHTML('<strong>' + escHtml(r.name) + '</strong>' + (state.plan === 'beide' && p.status !== 'bestand' ? ' <span style="color:#5a6068">(' + (p.plan === 'kurz' ? 'Plan 5/1' : 'Plan 5/2') + ')</span>' : '') + '<br>' + escHtml(GROUP_BY_ID[p.status].label) + (p.status === 'bestand' && VORHANDEN_AUF[p.ausbau === 'bestand' ? 'bestand' : 'freigabe'][p.weg] ? '<br>' + escHtml(VORHANDEN_AUF[p.ausbau === 'bestand' ? 'bestand' : 'freigabe'][p.weg]) : '') + (p.ausbau === 'bestand' ? '' : '<br>' + escHtml(PLAN_SAYS[p.ausbau])) + (p.richtung ? '<br>Laut Plan neuer Weg ' + escHtml(p.richtung) + (p.strasse ? ' der ' + escHtml(p.strasse) : ' der Straße') : '') + (p.hinweis ? '<br>' + escHtml(p.hinweis) : '') + '<br><span style="color:#5a6068">Heute: ' + escHtml(MODES.weg.byId[p.weg].label) + ', ' + escHtml(MODES.belag.byId[p.belag].label) + '</span>').addTo(map);
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
          if (hoverPopup) hoverPopup.remove();
        });
      }
      map.on('click', (e) => {
        const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
        const hits = map.queryRenderedFeatures(box, { layers: map.getLayer('pruefen') && state.pruefen ? ['pruefen', ...LINE_LAYERS] : LINE_LAYERS });
        const ids = [...new Set(hits.map((h) => h.properties.routeId))];
        if (tapPopup) tapPopup.remove();
        // a click on the selected route again closes it
        if (state.selected && ids.includes(state.selected)) closeDetail();
        else if (ids.length) select(ids[0], false, ids.slice(1));
        else {
          // no route here: the context layers answer a tap (touch screens have no hover)
          const ctx = ['pruefen', 'querungen', 'landkreis'].filter((id) => map.getLayer(id) && (id === 'querungen' || (id === 'pruefen' ? state.pruefen : landkreisOn())));
          const hit = ctx.length ? map.queryRenderedFeatures(box, { layers: ctx })[0] : null;
          if (hit && hit.layer && POPUP[hit.layer.id]) {
            if (hoverPopup) hoverPopup.remove();
            tapPopup = new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setHTML(POPUP[hit.layer.id](hit.properties)).addTo(map);
          }
        }
      });
      mapReady = true;
      render();
    });

    // ---- rendering
    function render() {
      syncUrl();
      $('lk-toggle').checked = landkreisOn();
      const vis = visible();
      if (mapReady) {
        const src = map.getSource('radwege');
        if (src) src.setData({ type: 'FeatureCollection', features: vis });
        map.setFilter('radwege-selected', ['==', ['get', 'routeId'], state.selected || '']);
        map.setPaintProperty('radwege-solid', 'line-color', colourExpr());
        map.setPaintProperty('radwege-dashed', 'line-color', colourExpr());
        map.setFilter('radwege-solid', ['!', dashedExpr()]);
        map.setFilter('radwege-dashed', dashedExpr());
        for (const id of ['planlage', 'planlage-dashed']) {
          if (!map.getLayer(id)) continue;
          map.setLayoutProperty(id, 'visibility', state.planlage ? 'visible' : 'none');
          const inPlanExpr = state.plan === 'beide' ? true : ['any', ['==', ['get', 'plan'], state.plan], ['==', ['get', 'netz'], 'bestand']];
          map.setFilter(id, ['all', inPlanExpr, id === 'planlage' ? ['!', ['get', 'dashed']] : ['get', 'dashed']]);
        }
        if (map.getLayer('luftbild')) map.setLayoutProperty('luftbild', 'visibility', state.view === 'luftbild' ? 'visible' : 'none');
        if (map.getLayer('querungen')) {
          const ids = [...new Set(vis.map((f) => f.properties.routeId))];
          // routeIds is an array: shown when any of its routes is shown, in the plan(s) on view
          map.setFilter('querungen', ['all', ['any', ...ids.map((id) => ['in', id, ['get', 'routeIds']]), false], state.plan === 'beide' ? true : ['==', ['get', 'plan'], state.plan]]);
        }
        if (map.getLayer('pruefen')) {
          map.setLayoutProperty('pruefen', 'visibility', state.pruefen ? 'visible' : 'none');
          map.setFilter('pruefen', ['all', ['in', ['get', 'routeId'], ['literal', [...new Set(vis.map((f) => f.properties.routeId))]]], state.plan === 'beide' ? true : ['==', ['get', 'plan'], state.plan]]);
        }
        if (map.getLayer('landkreis')) map.setLayoutProperty('landkreis', 'visibility', landkreisOn() ? 'visible' : 'none');
      }
      if (data.pruefen) {
        const ids = new Set(vis.map((f) => f.properties.routeId));
        $('pr-count').textContent = String(data.pruefen.features.filter((f) => ids.has(f.properties.routeId) && (state.plan === 'beide' || f.properties.plan === state.plan)).length);
      }
      const progress = state.farbe === 'stand' || state.farbe === 'bedarf';
      const dash = (text) => '<i class="sw dash" style="border-color:var(--fg)"></i> ' + text;
      // dashes for Stand/Bedarf: plan 5/2's release-only ways and, in any plan, existing lines
      // without a usable cycle path; for the OSM modes: no way
      const legend = [];
      if (!progress) legend.push(dash('gestrichelt: kein Weg in OpenStreetMap'));
      if (progress && state.plan !== 'kurz') legend.push(dash('gestrichelt: vorhandener Weg, nur Freigabe'));
      if (progress && vis.some((f) => f.properties.ohneRadweg)) legend.push(dash('gestrichelt bei „Vorhanden“: kein eigener Radweg (Fahrbahn, Schotter oder kein Weg erfasst)'));
      if (data.querungen) legend.push('<i class="sw" style="background:#fff;border:2px solid var(--fg);border-radius:50%;box-sizing:border-box"></i> Querung (angenommen)');
      $('line-legend').hidden = !legend.length;
      $('line-legend').innerHTML = legend.join('<br>');
      renderGroups();
      // the totals are in the headline; the status line keeps only notes such as a missing WebGL
      $('status').textContent = $('status').textContent.replace('Lade Daten …', '').trim();
      renderRecent();
      renderList();
      renderDetail();
      renderDauer(vis);
    }

    // ---- duration view: first documented step → opening or research date, per route
    function renderDauer(vis) {
      const box = $('dauer');
      box.hidden = state.view !== 'dauer';
      if (box.hidden) return;
      const metres = new Map();
      for (const f of vis) metres.set(f.properties.routeId, (metres.get(f.properties.routeId) || 0) + f.properties.m);
      const rows = [];
      const waiting = new Map();
      for (const [id, m] of metres) {
        const r = routeById.get(id);
        const opened = r.events.find((e) => e.kind === 'Eröffnung' && !e.uncertain);
        if (r.firstStep && (!r.built || opened)) rows.push({ r, start: r.firstStep.date, end: opened ? opened.date : data.stand, opened });
        else if (!r.built) {
          const g = routeGroups(id, 'bedarf').find((x) => x !== 'vorhanden') || 'neubau';
          if (!waiting.has(g)) waiting.set(g, { routes: [], m: 0 });
          waiting.get(g).routes.push(r);
          waiting.get(g).m += m;
        }
      }
      rows.sort((a, b) => fy(a.start) - fy(b.start) || a.r.name.localeCompare(b.r.name, 'de'));
      let y0 = Math.floor(fy(CONCEPT_DATE));
      let y1 = Math.floor(fy(data.stand)) + 1;
      for (const x of rows) {
        y0 = Math.min(y0, Math.floor(fy(x.start)));
        if (x.r.announcedYear && !x.opened) y1 = Math.max(y1, x.r.announcedYear + 1);
      }
      const span = y1 - y0;
      const pos = (v) => ((100 * (v - y0)) / span).toFixed(2) + '%';
      const gridStyle = ' style="background-size:' + (100 / span).toFixed(4) + '% 100%"';
      const lineAt = (d) => '<i class="d-line" style="left:' + pos(fy(d)) + '"></i>';
      let h = '<div class="d-axis" aria-hidden="true">';
      for (let y = y0; y < y1; y++) h += '<span class="' + (y % 5 && y !== y0 ? 'minor' : '') + '" style="left:' + pos(y + 0.5) + '">' + y + '</span>';
      h += '<span class="mark" style="left:' + pos(fy(CONCEPT_DATE)) + '">Konzept</span></div>';
      const track = (inner) => '<span class="d-track d-grid"' + gridStyle + '>' + lineAt(CONCEPT_DATE) + inner + '</span>';
      if (!rows.length) h += '<p class="muted">Keine der angezeigten Trassen hat einen dokumentierten Schritt' + (state.only || state.hidden.size || state.off.baulast.size || state.netz !== 'alle' ? ' (Filter im Seitenfeld beachten)' : '') + '.</p>';
      for (const x of rows) {
        const r = x.r;
        const g = GROUP_BY_ID[x.opened ? 'bestand' : routeGroups(r.id).find((x) => x !== 'bestand') || 'seit-konzept'];
        const a = fy(x.start), b = fy(x.end);
        // solid while steps follow each other, pale from the last step to today
        const last = x.opened ? b : fy(r.lastStep.date);
        let inner = '<i class="d-bar" style="left:' + pos(a) + ';width:max(4px,' + pos(y0 + last - a) + ');background:' + g.colour + '"></i>';
        if (!x.opened && b > last) inner += '<i class="d-idle" style="left:' + pos(last) + ';width:' + pos(y0 + b - last) + ';background:' + g.colour + '"></i>';
        let text = x.opened
          ? 'nach ' + dur(x.start, x.end) + ' eröffnet' + (r.uebergang ? ' (Übergangslösung)' : '')
          : 'seit ' + dur(x.start, x.end) + ' · letzter Schritt vor ' + dur(r.lastStep.date, data.stand);
        if (r.announcedYear && !x.opened) {
          inner += '<i class="d-plan" style="left:' + pos(b) + ';width:' + pos(y0 + r.announcedYear + 0.5 - b) + ';border-color:' + g.colour + '"></i>';
          text += ' · angekündigt ' + r.announcedYear;
        }
        for (const e of r.events) {
          if (e.uncertain) continue;
          inner += '<i class="d-ev' + (STEP_KINDS.includes(e.kind) ? ' step' : '') + '" style="left:' + pos(fy(e.date)) + '" title="' + escHtml(deDate(e.date) + ' · ' + e.kind + ': ' + short(e.text, 120)) + '"></i>';
        }
        const label = r.name + (r.road ? ' (' + r.road + ')' : '');
        h += '<button type="button" class="d-row' + (r.id === state.selected ? ' selected' : '') + '" data-select="' + escHtml(r.id) + '" title="' + escHtml(g.label + ' · erster Schritt ' + deDate(x.start) + ' (' + r.firstStep.kind + '), letzter ' + deDate(r.lastStep.date) + ' (' + r.lastStep.kind + ')') + '">'
          + '<span class="d-head"><span>' + escHtml(label) + '</span><span class="dur">' + escHtml(text) + '</span></span>' + track(inner) + '</button>';
      }
      if (waiting.size) {
        h += '<h3>Ohne dokumentierten Schritt</h3><p class="muted" style="margin:0 0 4px">Gezählt ab dem Konzept vom ' + deDate(CONCEPT_DATE) + ', das diese Trassen vorsieht.</p>';
        for (const g of MODES.bedarf.cats) {
          const w = waiting.get(g.id);
          if (!w) continue;
          const a = fy(CONCEPT_DATE), b = fy(data.stand);
          const inner = '<i class="d-bar" style="left:' + pos(a) + ';width:' + pos(y0 + b - a) + ';background:' + g.colour + ';opacity:0.55"></i>';
          h += '<div class="d-row" style="cursor:default"><span class="d-head"><span>' + escHtml(g.label) + ': ' + w.routes.length + ' Trassen, ' + km(w.m) + '</span><span class="dur">seit ' + escHtml(dur(CONCEPT_DATE, data.stand)) + '</span></span>' + track(inner) + '</div>';
          h += '<details><summary>Trassen anzeigen</summary><p>' + w.routes.map((r) => '<a href="#" data-select="' + escHtml(r.id) + '">' + escHtml(r.name) + '</a>').join(', ') + '</p></details>';
        }
      }
      // which sources the research could search for which years: gaps mean "not searchable", not "nothing happened"
      if (data.quellen && data.quellen.length) {
        h += '<h3>Quellenlage</h3><p class="muted" style="margin:0 0 4px">Welcher Zeitraum der Quellen ausgewertet ist. Wo ein Balken fehlt, gibt es keine durchsuchbaren Unterlagen; dass dort nichts eingetragen ist, heißt nicht, dass nichts geschah.</p>';
        for (const q of data.quellen) {
          const a = Math.max(y0, fy(q.from)), b = q.bis ? Math.min(fy(data.stand), fy(q.bis) + (q.bis.length === 4 ? 1 : q.bis.length === 7 ? 1 / 12 : 0)) : fy(data.stand);
          const inner = a < b ? '<i class="d-bar" style="left:' + pos(a) + ';width:' + pos(y0 + b - a) + ';background:var(--muted);opacity:0.35"></i>' : '';
          h += '<div class="d-row" style="cursor:default" title="' + escHtml(q.note) + '"><span class="d-head"><span>' + escHtml(q.label) + '</span><span class="dur">' + escHtml('ab ' + deDate(q.from) + (q.bis ? ', ' + (q.bisText || 'bis ' + deDate(q.bis)) : '')) + '</span></span>' + track(inner) + '<span class="muted" style="font-size:11px">' + escHtml(q.note) + '</span></div>';
        }
      }
      h += '<p class="muted" style="margin-top:10px">Stand der Recherche: ' + escHtml(deDate(data.stand)) + '. Ein Vorgang mit Jahr oder Monat ist am Anfang des Zeitraums eingezeichnet.</p>';
      $('dauer-chart').innerHTML = h;
    }

    let longPressed = false;
    /** Bar + legend: km per group among the lines that pass every filter except the group. */
    function renderGroups() {
      const md = mode();
      const m = Object.fromEntries(md.cats.map((g) => [g.id, 0]));
      // in the progress view, each group also says how much of it is Aus-/Neubau and how much
      // Freigabe; for what exists, how much of it is no usable cycle path (dashed)
      const split = {};
      const routeIds = new Set();
      let innenM = 0;
      for (const f of features) {
        if (!passesOther(f.properties)) continue;
        m[f.properties[md.key]] += f.properties.m;
        routeIds.add(f.properties.routeId);
        if (f.properties.innen) innenM += f.properties.m;
        if (state.farbe === 'stand') {
          const s = (split[f.properties.status] = split[f.properties.status] || {});
          const k = f.properties.status === 'bestand' ? (f.properties.ohneRadweg ? 'ohne' : 'fest') : f.properties.bedarf.startsWith('freigabe') ? 'freigabe' : f.properties.bedarf;
          s[k] = (s[k] || 0) + f.properties.m;
        }
      }
      const SPLIT_LABEL = { neubau: 'Aus-/Neubau ', freigabe: 'Freigabe ', ohne: 'ohne eigenen Radweg (gestrichelt) ' };
      const splitText = (id) => {
        const s = split[id];
        if (!s) return '';
        const parts = ['neubau', 'freigabe', 'ohne'].filter((id) => s[id]).map((id) => SPLIT_LABEL[id] + km(s[id]));
        return parts.length ? '<br><small class="muted">davon ' + parts.join(' · ') + '</small>' : '';
      };
      const sum = Object.values(m).reduce((a, b) => a + b, 0);
      const total = sum || 1;
      const PLAN_TEXT = { kurz: 'im kurzfristigen Plan (Lageplan 5/1)', lang: 'im langfristigen Plan (Lageplan 5/2)', beide: 'in beiden Plänen, jede Strecke einmal' };
      // the OSM modes say where their colours come from (the © is in the map attribution)
      const OSM_TEXT = { weg: ', Wegart heute laut OpenStreetMap', belag: ', Belag heute laut OpenStreetMap' };
      $('headline').innerHTML = '<strong>' + km(sum) + '</strong> in ' + routeIds.size + ' Trassen und vorhandenen Wegen ' + PLAN_TEXT[state.plan] + (state.innen ? ', innerhalb der Gemeinde' : ', einschließlich der Stücke außerhalb der Gemeinde' + (innenM < sum ? ' (davon ' + km(innenM) + ' innerhalb)' : '')) + (state.netz === 'alle' ? '' : state.netz === 'haupt' ? ', nur Haupttrassen' : ', nur ergänzende Trassen') + (OSM_TEXT[state.farbe] || '') + ':';
      const pct = (v) => {
        const x = (100 * v) / total;
        return (x > 0 && x < 1 ? '< 1' : Math.round(x)) + ' %';
      };
      const bar = $('bar'), list = $('groups');
      bar.textContent = '';
      list.textContent = '';
      for (const g of md.cats) {
        const dim = state.only && !state.only.includes(g.id);
        if (m[g.id] > 0) {
          const seg = document.createElement('button');
          seg.type = 'button';
          seg.style.background = g.colour;
          seg.style.width = (100 * m[g.id]) / total + '%';
          seg.title = g.label + ': ' + km(m[g.id]) + ' (' + pct(m[g.id]) + ')';
          // the legend below is the accessible control; the bar is a shortcut for the mouse
          seg.tabIndex = -1;
          if (dim) seg.classList.add('dim');
          seg.addEventListener('click', (e) => toggleOnly(g.id, isAdd(e)));
          bar.appendChild(seg);
        }
        // groups this view has no line of are left out, unless they are the active filter
        if (!m[g.id] && !(state.only && state.only.includes(g.id))) continue;
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.group = g.id;
        b.title = g.hint;
        b.setAttribute('aria-pressed', String(Boolean(state.only && state.only.includes(g.id))));
        if (dim) b.classList.add('dim');
        b.innerHTML = '<i class="sw" style="background:' + g.colour + '"></i><span>' + escHtml(g.label) + splitText(g.id) + '</span><span class="km">' + (m[g.id] > 0 && m[g.id] < 50 ? '<\u00a00,1\u00a0km' : km(m[g.id])) + '</span>';
        b.addEventListener('click', (e) => {
          // the legend is rebuilt by the long press; swallow the click that ends it
          if (longPressed) return void (longPressed = false);
          toggleOnly(g.id, isAdd(e));
        });
        // touch screens have no Shift: a long press adds or removes the group
        let pressTimer = null;
        b.addEventListener('pointerdown', (e) => {
          longPressed = false;
          if (e.pointerType === 'mouse') return;
          pressTimer = setTimeout(() => {
            longPressed = true;
            toggleOnly(g.id, true);
          }, 500);
        });
        for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, () => clearTimeout(pressTimer));
        b.addEventListener('contextmenu', (e) => e.pointerType !== 'mouse' && e.preventDefault());
        li.appendChild(b);
        list.appendChild(li);
      }
      // the fair lead: what has to be built and how much of it has no documented step. Freigabe
      // needs no Beschluss to be started, so it is named but not counted; plan pieces no labelled
      // route could be tied to (ohne-beschriftung-*) are left out of the "no step" figure.
      const kf = $('keyfact');
      kf.hidden = !(state.farbe === 'stand' || state.farbe === 'bedarf');
      if (!kf.hidden) {
        let bau = 0, bauNichts = 0, frei = 0, unbeschriftet = 0;
        const bauNichtsRoutes = new Set();
        for (const f of features) {
          const p = f.properties;
          if (!passesOther(p)) continue;
          if (p.bedarf.startsWith('freigabe')) frei += p.m;
          if (p.bedarf !== 'neubau') continue;
          bau += p.m;
          if (p.status !== 'nichts') continue;
          if (p.routeId.startsWith('ohne-beschriftung')) unbeschriftet += p.m;
          else {
            bauNichts += p.m;
            bauNichtsRoutes.add(p.routeId);
          }
        }
        kf.hidden = !bau;
        kf.innerHTML = 'Aus- oder Neubau nötig: <strong>' + km(bau) + '</strong>. Davon ist bei <strong>' + km(bauNichts) + '</strong> (' + bauNichtsRoutes.size + (bauNichtsRoutes.size === 1 ? ' Trasse' : ' Trassen') + ') kein Schritt dokumentiert.'
          + (unbeschriftet >= 50 ? ' Nicht mitgezählt sind ' + km(unbeschriftet) + ', die im Plan keiner beschrifteten Trasse zugeordnet sind.' : '')
          + (frei ? ' <span class="muted">Für ' + km(frei) + ' genügen laut Plan Freigabe und Schilder.</span>' : '');
      }
      const note = $('filter-note');
      note.hidden = !state.only;
      if (state.only) {
        const sel = state.only.map((id) => md.byId[id]);
        const what = sel.length === 1 ? sel[0].label + ' – ' + sel[0].hint : sel.map((c) => c.label).join(' + ');
        note.innerHTML = '<strong>Nur:</strong> ' + escHtml(what) + ' <button class="linkbtn" type="button" id="only-reset">Alle zeigen</button>';
        $('only-reset').addEventListener('click', () => {
          state.only = null;
          render();
        });
      }
    }

    function renderRecent() {
      const all = [];
      for (const r of routes) for (const e of r.events) if (!e.uncertain) all.push({ r, e });
      // events about the whole network (concept, budget) have no route
      for (const e of data.allgemein || []) if (!e.uncertain) all.push({ r: null, e });
      all.sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : 0));
      const seen = new Set();
      const unique = [];
      for (const x of all) {
        // the same document often concerns two routes: list it once
        const key = x.e.date + '|' + x.e.text;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(x);
      }
      const sinceConcept = unique.filter((x) => x.e.date >= CONCEPT_DATE).length;
      const items = state.seit ? unique.filter((x) => x.e.date >= state.seit) : unique.slice(0, RECENT_COUNT);
      // folded, the title still says how fresh the list is
      $('recent-title').textContent = state.seit ? 'Vorgänge seit dem ' + deDate(state.seit) + ' (' + items.length + ')' : 'Neueste Vorgänge' + (items.length ? ' (zuletzt ' + deDate(items[0].e.date) + ')' : '');
      $('recent-more').textContent = state.seit ? 'Nur die neuesten zeigen' : 'Alle ' + sinceConcept + ' Vorgänge seit dem Konzept zeigen';
      $('recent').innerHTML = items
        .map(({ r, e }) => '<li><span class="when">' + escHtml(deDate(e.date)) + '</span> · ' + (r ? '<a href="#" data-select="' + escHtml(r.id) + '">' + escHtml(r.name) + '</a>' : 'Radwegenetz allgemein') + '<br>' + escHtml(short(e.text, 140)) + ' ' + evLink(e) + '</li>')
        .join('');
    }

    function renderKorrekturen() {
      const k = (data.korrekturen || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      $('korrekturen').hidden = !k.length;
      $('korr-count').textContent = String(k.length);
      $('korr-list').innerHTML = k.map((c) => '<li><span class="when">' + escHtml(deDate(c.date)) + '</span> ' + escHtml(c.text) + '</li>').join('');
    }
    renderKorrekturen();
    // Since the concept, in one line: which steps, how many, on how many routes. A document about
    // two routes counts once, as in "Neueste Vorgänge"; network-wide events count without a route.
    {
      const seen = new Set();
      const byKind = new Map();
      const sinceRoutes = new Set();
      let network = false;
      const add = (r, e) => {
        if (e.uncertain || !STEP_KINDS.includes(e.kind) || e.date < CONCEPT_DATE) return;
        if (r) sinceRoutes.add(r.id);
        else network = true;
        const key = e.date + '|' + e.text;
        if (seen.has(key)) return;
        seen.add(key);
        byKind.set(e.kind, (byKind.get(e.kind) || 0) + 1);
      };
      for (const r of routes) for (const e of r.events) add(r, e);
      for (const e of data.allgemein || []) add(null, e);
      const parts = STEP_KINDS.filter((k) => byKind.get(k)).map((k) => byKind.get(k) + ' × ' + k);
      const since = $('since');
      since.innerHTML = 'Seit dem Konzept vom ' + deDate(CONCEPT_DATE) + ' dokumentiert: ' + (parts.length ? parts.join(', ') : 'kein Schritt') + (byKind.get('Beschluss') ? '' : ', kein Beschluss') + (sinceRoutes.size ? ' – zu ' + sinceRoutes.size + (sinceRoutes.size === 1 ? ' Trasse' : ' Trassen') + (network ? ' und zum Radwegenetz allgemein' : '') : '') + '. <button class="linkbtn" type="button" id="since-list">Alle Vorgänge seitdem</button>';
      since.hidden = false;
      $('since-list').addEventListener('click', () => {
        state.seit = CONCEPT_DATE;
        $('recent-box').open = true;
        render();
        $('recent-box').scrollIntoView?.({ block: 'start' });
      });
    }
    // phones start with the list folded (the bottom sheet shows the legend first); a ?seit= link is
    // shared for the list, so it opens
    if (!state.seit && window.matchMedia && window.matchMedia('(max-width: 600px)').matches) $('recent-box').open = false;
    $('recent-more').addEventListener('click', () => {
      state.seit = state.seit ? null : CONCEPT_DATE;
      render();
    });

    function renderList() {
      const box = $('routes');
      box.textContent = '';
      for (const r of listed()) {
        const g = mode().byId[routeGroups(r.id, mode().key)[0]];
        const lab = document.createElement('label');
        lab.dataset.route = r.id;
        if (r.id === state.selected) lab.classList.add('selected');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !state.hidden.has(r.id);
        cb.setAttribute('aria-label', r.name + ' anzeigen');
        cb.addEventListener('change', () => {
          if (cb.checked) state.hidden.delete(r.id);
          else state.hidden.add(r.id);
          render();
        });
        const dot = document.createElement('i');
        dot.className = 'dot';
        dot.style.background = g ? g.colour : 'transparent';
        dot.title = g ? g.label : 'nicht in diesem Plan';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = r.name + (r.road ? ' (' + r.road + ')' : '');
        name.addEventListener('click', (e) => {
          e.preventDefault();
          select(r.id, true);
        });
        lab.append(cb, dot, name);
        lab.addEventListener('mouseenter', () => mapReady && map.setFilter('radwege-selected', ['in', ['get', 'routeId'], ['literal', [r.id, state.selected || '']]]));
        lab.addEventListener('mouseleave', () => mapReady && map.setFilter('radwege-selected', ['==', ['get', 'routeId'], state.selected || '']));
        box.appendChild(lab);
      }
    }

    function select(id, zoom, more) {
      const r = routeById.get(id);
      if (!r) return;
      state.selected = id;
      others = more || [];
      state.hidden.delete(id);
      // A route only in the other plan: switch plans instead of showing an empty selection
      if (!r.built && id !== 'bestand' && state.plan !== 'beide' && !r.plans[state.plan]) {
        state.plan = r.plans.kurz ? 'kurz' : 'lang';
        state.landkreis = null;
        for (const input of document.querySelectorAll('input[name=plan]')) input.checked = input.value === state.plan;
      }
      // The group filter must not hide what was just picked
      if (state.only && !routeGroups(id, mode().key).some((g) => state.only.includes(g))) state.only = null;
      render();
      $('panel').open = true;
      $('panel').scrollTop = 0;
      // keyboard and screen readers continue in the details, not at the top of the page
      const h = $('detail').querySelector('h2');
      if (h) h.focus({ preventScroll: true });
      if (zoom && map) {
        const fs = features.filter((f) => f.properties.routeId === id && inPlan(f.properties));
        let w = 180, s = 90, e = -180, n = -90;
        for (const f of fs) for (const [x, y] of f.geometry.coordinates) { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }
        if (fs.length) map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 15, duration: 500 });
      }
    }

    function closeDetail() {
      const id = state.selected;
      const hadFocus = $('detail').contains(document.activeElement);
      state.selected = null;
      others = [];
      render();
      // back to where the route was opened from, else to the panel's title
      if (hadFocus) {
        const back = (id && document.querySelector('#overview [data-select="' + id + '"], #routes [data-route="' + id + '"] input')) || $('panel').querySelector('summary');
        back.focus();
      }
    }

    function renderDetail() {
      const box = $('detail');
      const r = state.selected && routeById.get(state.selected);
      box.hidden = !r;
      $('overview').hidden = Boolean(r);
      if (!r) return;
      const fs = features.filter((f) => f.properties.routeId === r.id && inPlan(f.properties));
      const groups = routeGroups(r.id);
      const latest = r.events.filter((e) => !e.uncertain).slice(-1)[0];
      let h = '<p class="row-btns"><button class="btn" type="button" id="detail-close">&larr; Übersicht</button><button class="btn" type="button" id="copy-link" style="margin-left:auto">Link kopieren</button></p>';
      if (others.length) {
        h += '<p class="muted">Hier liegen auch: ' + others.map((id) => '<a href="#" data-select="' + escHtml(id) + '">' + escHtml(routeById.get(id).name) + '</a>').join(', ') + '</p>';
      }
      h += '<h2 tabindex="-1">' + escHtml(r.name) + (r.road ? ' <span class="muted">' + escHtml(r.road) + '</span>' : '') + '</h2>';
      h += '<p>' + groups.map((g) => '<span class="badge" style="background:' + GROUP_BY_ID[g].colour + '">' + escHtml(GROUP_BY_ID[g].label) + '</span>').join(' ') + (r.uebergang ? ' <span class="badge" style="background:#6b7280">Übergangslösung</span>' : '') + '</p>';
      if (r.uebergang) h += '<p class="note"><strong>Übergangslösung:</strong> ' + escHtml(r.uebergang) + '</p>';
      h += '<dl class="summary">';
      const stand = r.lastStep && !r.built
        ? 'Letzter dokumentierter Schritt: ' + deDate(r.lastStep.date) + ' (' + r.lastStep.kind + '), vor ' + dur(r.lastStep.date, data.stand) + ' – ' + (r.lastStep.date >= CONCEPT_DATE ? 'nach' : 'vor') + ' dem Konzept vom ' + deDate(CONCEPT_DATE) + '.'
          + (r.firstStep.date !== r.lastStep.date ? ' Erster: ' + deDate(r.firstStep.date) + ' (' + r.firstStep.kind + ').' : ' Davor ist kein Schritt dokumentiert.')
        : groups.length === 1 ? GROUP_BY_ID[groups[0]].hint
        : groups.length ? groups
          .map((g) => ({ g, m: fs.filter((f) => f.properties.status === g).reduce((a, f) => a + f.properties.m, 0) }))
          .sort((a, b) => b.m - a.m)
          .map((x) => km(x.m) + ' ' + GROUP_BY_ID[x.g].label.split(' – ')[0])
          .join(', ') + (r.events.some((e) => !e.uncertain) ? '.' : '; öffentlich dokumentiert ist nichts.')
        : '–';
      h += '<dt>Stand</dt><dd>' + escHtml(stand) + '</dd>';
      // who builds and who buys the land are often not the same body
      h += '<dt>Zuständig</dt><dd>Bau und Unterhalt: ' + escHtml(BAULAST_LABEL[r.baulast]) + (r.grunderwerb ? '<br>Grunderwerb: ' + escHtml(r.grunderwerb) : '') + (r.baulastNote ? '<br><span class="muted">' + escHtml(r.baulastNote) + '</span>' : '') + '</dd>';
      {
        const by = {};
        for (const f of fs) by[f.properties.bedarf] = (by[f.properties.bedarf] || 0) + f.properties.m;
        const parts = MODES.bedarf.cats.filter((c) => by[c.id]).map((c) => c.label + (Object.keys(by).length > 1 ? ' ' + km(by[c.id]) : ''));
        if (parts.length) h += '<dt>Laut Plan</dt><dd>' + escHtml(parts.join(', ')) + '</dd>';
      }
      h += '<dt>Zuletzt</dt><dd>' + (latest ? '<strong>' + escHtml(deDate(latest.date)) + '</strong><span class="kind">' + escHtml(latest.kind) + '</span> ' + escHtml(short(latest.text, 160)) + ' ' + evLink(latest) : 'Kein öffentlicher Vorgang gefunden.') + '</dd>';
      if (r.kusHorizont) h += '<dt>Angekündigt</dt><dd>' + escHtml(r.kusHorizont) + ' ' + link(data.sources.kus, 'Landkreis-Steckbrief (KUS)') + '</dd>';
      h += '</dl>';
      if (r.events.length) {
        const evs = r.events.slice().reverse();
        const item = (e) => {
          const step = STEP_KINDS.includes(e.kind) && !e.uncertain;
          return '<li class="' + (step ? 'step' : '') + (e.uncertain ? ' uncertain' : '') + '"><span class="when">' + escHtml(deDate(e.date)) + '</span><span class="kind">' + escHtml(e.kind) + (e.uncertain ? ' · Zuordnung unsicher, zählt nicht' : '') + '</span><br>' + escHtml(e.text) + ' ' + evLink(e) + '</li>';
        };
        h += '<h3>Vorgänge (' + evs.length + ')</h3><ul class="timeline">' + evs.slice(0, TIMELINE_OPEN).map(item).join('') + '</ul>';
        if (evs.length > TIMELINE_OPEN) {
          h += '<details><summary>Ältere Vorgänge (' + (evs.length - TIMELINE_OPEN) + ')</summary><ul class="timeline">' + evs.slice(TIMELINE_OPEN).map(item).join('') + '</ul></details>';
        }
      }
      h += '<h3>Fakten</h3><dl>';
      const plans = Object.entries(r.plans).map(([p, n]) => escHtml(PLAN_LABEL[p]) + ': ' + escHtml(NETZ_LABEL[n]));
      const inKurz = Boolean(r.plans.kurz), inLang = Boolean(r.plans.lang);
      let planHint = '';
      if (inKurz && inLang) planHint = 'In beiden Plänen: kurzfristig auf vorhandenen Wegen, langfristig ausgebaut.';
      else if (r.plans.lang === 'landkreis') planHint = 'Im langfristigen Plan nur nachrichtlich, als Radnetz des Landkreises; zuständig sind Landkreis oder Freistaat, nicht die Gemeinde.';
      else if (inLang) planHint = 'Nur im langfristigen Plan: eine neue Verbindung, für die kurzfristig nichts vorgesehen ist.';
      else if (inKurz && r.landkreisShare != null && r.landkreisShare >= 0.6) planHint = 'Nur im kurzfristigen Plan: langfristig verläuft hier das Radnetz des Landkreises (' + Math.round(r.landkreisShare * 100) + ' % der Strecke), das als Geh- und Radweg vorgesehen ist – Sache von Landkreis oder Freistaat.';
      else if (inKurz && !r.built && r.id !== 'bestand') planHint = 'Nur im kurzfristigen Plan: eine Zwischenlösung auf vorhandenen Wegen; der langfristige Plan führt diese Verbindung nicht weiter.';
      if (plans.length) h += '<dt>Plan</dt><dd>' + plans.join('<br>') + (planHint ? '<br><span class="muted">' + escHtml(planHint) + '</span>' : '') + '</dd>';
      const len = [];
      if (r.lengthConceptKm) len.push('Erläuterung zum Konzept ca. ' + r.lengthConceptKm.toLocaleString('de-DE') + ' km (Länge laut Lageplan 5/2)');
      for (const [p, v] of Object.entries(r.km)) len.push((p === 'kurz' ? 'Lageplan 5/1' : 'Lageplan 5/2') + ' gemessen ' + v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' km');
      if (len.length) h += '<dt>Länge</dt><dd>' + len.join('<br>') + '</dd>';
      const ausbau = {};
      for (const f of fs) ausbau[f.properties.ausbau] = (ausbau[f.properties.ausbau] || 0) + f.properties.m;
      if (fs.length) h += '<dt>Ausbau</dt><dd>' + Object.entries(ausbau).map(([a, m]) => escHtml(AUSBAU_LABEL[a]) + ': ' + km(m)).join('<br>') + '</dd>';
      // what the line runs on today (matched OSM ways), largest share first
      for (const [k, title] of [['weg', 'Heute'], ['belag', 'Belag']]) {
        const by = {};
        for (const f of fs) by[f.properties[k]] = (by[f.properties[k]] || 0) + f.properties.m;
        const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, m]) => escHtml(MODES[k].byId[c].label) + ': ' + km(m));
        if (parts.length) h += '<dt>' + title + '</dt><dd>' + parts.join('<br>') + '</dd>';
      }
      {
        const by = {};
        for (const f of fs) if (f.properties.richtung) { const k = f.properties.richtung + ' der ' + (f.properties.strasse || 'Straße'); by[k] = (by[k] || 0) + f.properties.m; }
        const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, m]) => escHtml(k) + ': ' + km(m));
        if (parts.length) h += '<dt>Straßenseite</dt><dd>' + parts.join('<br>') + '<br><span class="muted">Wo der Plan einen neuen Weg neben einer Straße zeichnet, gibt die Seite der Zeichnung an, auf welcher Straßenseite er gebaut werden soll; die Karte zeigt die Linie dort versetzt.</span></dd>';
      }
      if (r.konzeptHinweis) h += '<dt>Konzept</dt><dd>' + escHtml(r.konzeptHinweis) + '</dd>';
      h += '</dl>';
      if (r.documented) h += '<p class="note">' + escHtml(r.documented) + '</p>';
      const qs = (data.querungen ? data.querungen.features : []).filter((f) => f.properties.routeIds.includes(r.id) && (state.plan === 'beide' || f.properties.plan === state.plan));
      const qSeen = new Set();
      const qTexts = qs.map((f) => f.properties.text.split(':')[0]).filter((t) => !qSeen.has(t) && qSeen.add(t));
      if (qTexts.length) h += '<p class="note"><strong>Querungen (Annahme aus der Seitenlage im Plan):</strong> ' + qTexts.map(escHtml).join('<br>') + '</p>';
      const checks = (data.pruefen ? data.pruefen.features : []).filter((f) => f.properties.routeId === r.id && (state.plan === 'beide' || f.properties.plan === state.plan));
      if (checks.length) h += '<p class="note"><strong>Zuordnung prüfen (' + checks.length + '):</strong> ' + checks.map((f) => escHtml(f.properties.text)).join('<br>') + ' <button class="linkbtn" type="button" id="show-checks">Auf der Karte zeigen</button></p>';
      const fromPlanM = fs.reduce((s, f) => s + f.properties.m * f.properties.fromPlan, 0);
      const totalM = fs.reduce((s, f) => s + f.properties.m, 0);
      if (fromPlanM > 0.05 * totalM) h += '<p class="muted">' + km(fromPlanM) + ' der Linie folgen keinem Weg in OpenStreetMap und sind nur aus dem Lageplan übertragen (Lage ungefähr).</p>';
      const links = [];
      if (r.plans.kurz || r.id === 'bestand') links.push(link(data.sources.kurz, 'Lageplan 5/1'));
      if (r.plans.lang) links.push(link(data.sources.lang, 'Lageplan 5/2'));
      links.push(link(data.sources.erlaeuterung, 'Erläuterung'));
      h += '<p>Konzept: ' + links.join(' · ') + '</p>';
      box.innerHTML = h;
      $('detail-close').addEventListener('click', closeDetail);
      $('copy-link').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const url = location.origin + location.pathname + '?trasse=' + encodeURIComponent(r.id);
        const done = (ok) => { btn.textContent = ok ? 'Link kopiert' : 'Link: Adresszeile'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
        else done(false);
      });
      if ($('show-checks')) $('show-checks').addEventListener('click', () => { state.pruefen = true; $('pr-toggle').checked = true; render(); });
    }

    function downloadCsv() {
      const rows = [['Trasse', 'Straße', 'Plan', 'Netz', 'Ausbau', 'Stand', 'Wegart heute', 'Belag heute', 'Baulastträger', 'Grunderwerb', 'Länge (m)', 'In der Gemeinde', 'Erster Schritt', 'Quelle', 'Letzter Schritt', 'Quelle']];
      for (const f of visible()) {
        const p = f.properties, r = routeById.get(p.routeId);
        rows.push([r.name, r.road || '', PLAN_LABEL[p.plan], NETZ_LABEL[p.netz], AUSBAU_LABEL[p.ausbau], GROUP_BY_ID[p.status].label, MODES.weg.byId[p.weg].label, MODES.belag.byId[p.belag].label, r.baulast, r.grunderwerb || '', String(p.m), p.innen ? 'ja' : 'nein', r.firstStep ? r.firstStep.date + ' ' + r.firstStep.kind : '', r.firstStep ? r.firstStep.url : '', r.lastStep ? r.lastStep.date + ' ' + r.lastStep.kind : '', r.lastStep ? r.lastStep.url : '']);
      }
      const csv = rows.map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\\r\\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'radwege-schweitenkirchen.csv';
      a.click();
    }

    document.addEventListener('keydown', (e) => {
      // Escape in the search box clears the search, not the selection
      if (e.key === 'Escape' && state.selected && !(e.target && e.target.matches && e.target.matches('input, textarea'))) closeDetail();
    });
    render();
    if (state.selected && !location.hash.includes('karte=')) select(state.selected, true);
  })();
  </script>
</body>
</html>
`
}
