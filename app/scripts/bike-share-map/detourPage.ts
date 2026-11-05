import { buildBasemapStyleJson } from './basemaps'
import { CLOSE_FROM_SAFETY, STRESS_WEIGHT } from './detourRouting'
import type { DetourIndexEntry } from './fetchDetourGraph'
import { siteIconHeadLinks } from './siteIcon'

export type DetourPageInput = {
  /** Landkreise with a graph file (output/detour/index.json). */
  landkreise: DetourIndexEntry[]
  /** Folder (relative, trailing slash) holding the graph files. */
  dataBaseHref: string
  /** The detourRouting.js bundle (global `DetourRouting`). */
  routingScriptHref: string
  dataDateLabel: string
  methodikHref: string
  viewerHref: string
}

/** Colour stops per metric: value → colour, interpolated; values below the first stop take its colour. */
const METRICS = {
  km: { label: 'Mehr Kilometer', unit: 'km', stops: [0, 1, 3], digits: 1 },
  hm: { label: 'Mehr Höhenmeter', unit: 'Hm', stops: [0, 30, 100], digits: 0 },
  min: { label: 'Mehr Minuten', unit: 'min', stops: [0, 15, 40], digits: 0 },
  faktor: { label: 'Längenfaktor', unit: '×', stops: [1, 1.3, 2], digits: 2 },
} as const

/**
 * What the bike route is compared with. `auto`: the usual car route (the page's original
 * question — is cycling there a real alternative?). `rad`: the fastest bike route, i.e. the same
 * bike search at slider 0 — what does avoiding traffic cost the cyclist?
 */
const REFERENCES = {
  rad: {
    label: 'Schnellste Radroute',
    head: 'Schnellst',
    dative: 'der schnellsten Radroute',
    legend: 'Schnellste Radroute',
  },
  auto: { label: 'Auto', head: 'Auto', dative: 'dem Auto', legend: 'Auto' },
} as const
const SCALE_COLOURS = ['#1a9850', '#fee08b', '#d73027']
const UNREACHABLE_COLOUR = '#9aa0a6'
/** Bike route colour by edge stress (0..100). */
const STRESS_STOPS = [0, 35, 70, 100]
const STRESS_COLOURS = ['#1a9850', '#fdd835', '#f46d43', '#b2182b']

/**
 * Unlisted page: pick a place, see for every other place of the Landkreis how much longer a bike
 * route that avoids traffic is than the usual car road (time + CAR_SECONDS_PER_KM) — km, climb, minutes. Routing happens in
 * the browser (detourRouting.ts) on a small per-Landkreis graph, so the safety slider is
 * continuous and both routes can be drawn.
 */
export function detourPageHtml({
  landkreise,
  dataBaseHref,
  routingScriptHref,
  dataDateLabel,
  methodikHref,
  viewerHref,
}: DetourPageInput) {
  const style = JSON.stringify(buildBasemapStyleJson('light'))
  const closePct = Math.round(CLOSE_FROM_SAFETY * 100)
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Umwege per Rad</title>
  ${siteIconHeadLinks()}
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
      width: 380px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 24px);
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
    .page-nav { font-size: 13px; }
    a { color: var(--accent); }
    fieldset { border: 0; padding: 0; margin: 0 0 10px; }
    legend { font-weight: 600; margin-bottom: 4px; padding: 0; }
    label { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
    input[type='search'], select {
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
    #safety { width: 100%; margin: 4px 0; }
    .slider-ends { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
    #safety-note { font-size: 12px; color: var(--muted); min-height: 2.6em; }
    #origin-box { border-top: 1px solid var(--border); padding-top: 8px; }
    #origin-box strong { font-size: 15px; }
    .btn {
      font: inherit;
      font-size: 13px;
      padding: 4px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--fg);
      cursor: pointer;
    }
    .btn:hover { background: var(--row-hover); }
    .legend { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 4px 0 8px; }
    .legend .bar { flex: 1; height: 10px; border-radius: 3px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
    #summary { font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
    th, td { text-align: right; padding: 3px 4px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    th:first-child, td:first-child { text-align: left; white-space: normal; }
    th { font-weight: 600; color: var(--muted); font-size: 12px; }
    th[aria-sort] { color: var(--fg); }
    .th-sort { all: unset; cursor: pointer; text-decoration: underline dotted; }
    .th-sort:focus-visible { outline: 2px solid var(--fg); outline-offset: 1px; }
    th[aria-sort] .th-sort::after { content: ' ▾'; }
    tbody tr { cursor: pointer; }
    tbody tr:focus-visible { outline: 2px solid var(--fg); outline-offset: -2px; }
    tbody tr:hover, tbody tr.selected { background: var(--row-hover); }
    tbody tr.unreachable td { color: var(--muted); }
    td .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.25); }
    td .gm { display: block; font-size: 11px; color: var(--muted); }
    #pair { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px; font-size: 13px; }
    #pair h2 { font-size: 14px; margin: 0 0 4px; }
    .route-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; margin: 4px 0; }
    .route-legend i { display: inline-block; width: 18px; height: 4px; vertical-align: middle; margin-right: 4px; border-radius: 2px; }
    .route-legend i.car { background: #555; height: 0; border-top: 3px dashed #555; }
    #status { font-size: 13px; }
    [hidden] { display: none !important; }
    @media (pointer: coarse) {
      label { min-height: 36px; }
      .seg span { padding: 8px 12px; }
      .btn { padding: 8px 12px; }
    }
    @media (max-width: 600px) {
      #panel { top: auto; bottom: 24px; left: 12px; right: 12px; width: auto; max-height: 55vh; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <details id="panel" open>
    <summary><h1>Umwege per Rad</h1></summary>
    <div class="body">
      <p class="page-nav"><a href="${viewerHref}">&larr; Zur Karte</a> · <a href="${methodikHref}#umweg">Methodik</a></p>
      <p class="muted">Wie viel länger, höher und langsamer ist eine verkehrsarme Radroute als die übliche Autostrecke oder die schnellste Radroute — von einem Ort zu allen anderen im Landkreis.</p>
      <p id="status" aria-live="polite">Lade Daten …</p>
      <fieldset id="lk-box" hidden>
        <legend>Landkreis</legend>
        <select id="lk-select" aria-label="Landkreis"></select>
      </fieldset>
      <fieldset>
        <legend><label for="origin-search" style="padding:0">Startort</label></legend>
        <input id="origin-search" type="search" list="place-list" placeholder="Ort suchen oder auf der Karte antippen" autocomplete="off" />
        <datalist id="place-list"></datalist>
        <p id="origin-hint" class="muted" aria-live="polite" hidden></p>
      </fieldset>
      <fieldset class="seg" id="ref-box">
        <legend>Vergleich mit</legend>
        ${Object.entries(REFERENCES)
          .map(
            ([key, r], i) =>
              `<label><input type="radio" name="vergleich" value="${key}"${i === 0 ? ' checked' : ''}><span>${r.label}</span></label>`,
          )
          .join('\n        ')}
      </fieldset>
      <fieldset>
        <legend><label for="safety" style="padding:0">Wie verkehrsarm soll die Radroute sein?</label></legend>
        <input id="safety" type="range" min="0" max="100" step="5" value="70" />
        <div class="slider-ends"><span>schnellste Route</span><span>verkehrsarm</span></div>
        <div id="safety-note"></div>
      </fieldset>
      <fieldset class="seg" id="metric-box">
        <legend>Farbe der Orte</legend>
        ${Object.entries(METRICS)
          .map(
            ([key, m], i) =>
              `<label><input type="radio" name="zeige" value="${key}"${i === 0 ? ' checked' : ''}><span>${m.label}</span></label>`,
          )
          .join('\n        ')}
      </fieldset>
      <div class="legend" id="legend" hidden><span id="legend-min"></span><div class="bar" id="legend-bar"></div><span id="legend-max"></span><i style="background:${UNREACHABLE_COLOUR}"></i><span>nicht erreichbar</span></div>
      <label><input type="checkbox" id="hamlets" /> Weiler (place=hamlet) mit anzeigen</label>
      <div id="origin-box" hidden>
        <p id="summary" aria-live="polite"></p>
        <div id="pair" hidden></div>
        <p><label for="sort" style="display:inline">Sortieren:</label>
          <select id="sort" style="width:auto;display:inline-block">
            <option value="air">Nähe</option>
            <option value="km">Mehr Kilometer</option>
            <option value="hm">Mehr Höhenmeter</option>
            <option value="min">Mehr Minuten</option>
            <option value="faktor">Längenfaktor</option>
          </select>
          <button class="btn" id="csv" type="button" style="float:right">CSV</button></p>
        <div style="overflow-x:auto"><table id="table"><thead><tr><th scope="col">Ort</th><th scope="col" data-sort="air" title="Luftlinie"><button type="button" class="th-sort">Luft</button></th><th scope="col" id="ref-head" title="Auto: km / min">Auto</th><th scope="col" title="Rad: km / min">Rad</th><th scope="col" data-sort="km" title="Mehr Kilometer"><button type="button" class="th-sort">+km</button></th><th scope="col" data-sort="hm" title="Mehr Höhenmeter bergauf"><button type="button" class="th-sort">+Hm</button></th><th scope="col" data-sort="min" title="Mehr Minuten"><button type="button" class="th-sort">+min</button></th></tr></thead><tbody></tbody></table></div>
      </div>
      <p class="muted" style="margin-top:8px">Daten: © OpenStreetMap-Mitwirkende${dataDateLabel ? `, Stand ${dataDateLabel}` : ''}; Radinfrastruktur-Kategorien: TILDA; Höhen: Mapzen/AWS Terrain Tiles. Annahmen: siehe <a href="${methodikHref}#umweg">Methodik</a>.</p>
    </div>
  </details>
  <script src="./vendor/maplibre-gl-4.7.1/maplibre-gl.js"></script>
  <script src="${routingScriptHref}"></script>
  <script>
  (async function () {
    const LANDKREISE = ${JSON.stringify(landkreise)};
    const DATA_BASE = ${JSON.stringify(dataBaseHref)};
    const METRICS = ${JSON.stringify(METRICS)};
    const REFERENCES = ${JSON.stringify(REFERENCES)};
    const SCALE_COLOURS = ${JSON.stringify(SCALE_COLOURS)};
    const UNREACHABLE = ${JSON.stringify(UNREACHABLE_COLOUR)};
    const STRESS_STOPS = ${JSON.stringify(STRESS_STOPS)};
    const STRESS_COLOURS = ${JSON.stringify(STRESS_COLOURS)};
    const CLOSE_PCT = ${closePct};
    const STRESS_WEIGHT = ${STRESS_WEIGHT};
    const R = DetourRouting;
    const $ = (id) => document.getElementById(id);
    const deNum = (v, digits) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const escHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const signed = (v, digits) => (v > 0 ? '+' : v < 0 ? '−' : '±') + deNum(Math.abs(v), digits);
    const KIND_LABEL = { city: 'Stadt', town: 'Stadt', village: 'Dorf', hamlet: 'Weiler' };

    const params = new URLSearchParams(location.search);
    const state = {
      lk: LANDKREISE.some((l) => l.id === params.get('lk')) ? params.get('lk') : (LANDKREISE[0] || {}).id,
      origin: params.get('von') ? Number(params.get('von')) : null,
      dest: params.get('nach') ? Number(params.get('nach')) : null,
      safety: Math.max(0, Math.min(100, Number(params.get('sicherheit') || 70))),
      metric: METRICS[params.get('zeige')] ? params.get('zeige') : 'km',
      // Default: the fastest bike route. Against the car, most of the extra time is just that
      // bikes are slower than cars; against the fastest bike route it is the price of avoiding traffic.
      ref: params.get('vergleich') === 'auto' ? 'auto' : 'rad',
      hamlets: params.get('weiler') === '1',
      sort: 'air',
    };
    const status = $('status');
    if (!LANDKREISE.length) {
      status.textContent = 'Für keinen Landkreis liegen Routing-Daten vor.';
      return;
    }
    if (LANDKREISE.length > 1) {
      $('lk-box').hidden = false;
      for (const l of LANDKREISE) {
        const o = document.createElement('option');
        o.value = l.id;
        o.textContent = l.name;
        o.selected = l.id === state.lk;
        $('lk-select').appendChild(o);
      }
      $('lk-select').addEventListener('change', () => {
        state.lk = $('lk-select').value;
        state.origin = null;
        state.dest = null;
        syncUrl();
        location.reload();
      });
    }
    $('safety').value = state.safety;
    $('hamlets').checked = state.hamlets;
    document.querySelector('input[name=zeige][value=' + state.metric + ']').checked = true;
    document.querySelector('input[name=vergleich][value=' + state.ref + ']').checked = true;

    function syncUrl() {
      const p = new URLSearchParams();
      if (LANDKREISE.length > 1) p.set('lk', state.lk);
      if (state.origin != null) p.set('von', String(state.origin));
      if (state.dest != null) p.set('nach', String(state.dest));
      if (state.safety !== 70) p.set('sicherheit', String(state.safety));
      if (state.metric !== 'km') p.set('zeige', state.metric);
      if (state.ref !== 'rad') p.set('vergleich', state.ref);
      if (state.hamlets) p.set('weiler', '1');
      const q = p.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }

    const entry = LANDKREISE.find((l) => l.id === state.lk);
    const map = new maplibregl.Map({
      container: 'map',
      style: ${style},
      bounds: [[5.8, 47.2], [15.1, 55.1]],
      hash: 'karte',
      maxZoom: 17,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    let graph;
    try {
      const res = await fetch(DATA_BASE + entry.file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      graph = R.decodeDetourGraph(new Uint8Array(await res.arrayBuffer()));
    } catch (e) {
      console.error(e);
      status.textContent = 'Die Routing-Daten konnten nicht geladen werden.';
      return;
    }
    const adjBike = R.buildAdjacency(graph.bike, graph.nodeCount);
    const adjCar = R.buildAdjacency(graph.car, graph.nodeCount);
    const places = graph.places;
    const indexById = new Map(places.map((p, i) => [p.id, i]));
    // From the viewer's region card: ?gemeinde=<OSM id> starts at the Gemeinde's main place —
    // the one named like the Gemeinde, else its largest (town before village before hamlet).
    const gemeindeParam = params.get('gemeinde');
    if (state.origin == null && gemeindeParam) {
      const rank = { city: 0, town: 1, village: 2, hamlet: 3 };
      const inGemeinde = places.filter((p) => p.gemeindeId === gemeindeParam);
      const main =
        inGemeinde.find((p) => p.gemeinde && (p.name === p.gemeinde || p.gemeinde.startsWith(p.name))) ||
        inGemeinde.slice().sort((a, b) => rank[a.kind] - rank[b.kind] || (b.population || 0) - (a.population || 0))[0];
      if (main) state.origin = main.id;
    }
    // Validate the URL's places before anything renders (the map may already be loaded).
    if (state.origin == null || !indexById.has(state.origin)) {
      state.origin = null;
      state.dest = null;
    } else if (state.dest != null && !indexById.has(state.dest)) {
      state.dest = null;
    }
    const placeCount = { village: 0, hamlet: 0, town: 0 };
    for (const p of places) placeCount[p.kind === 'city' ? 'town' : p.kind] = (placeCount[p.kind === 'city' ? 'town' : p.kind] || 0) + 1;
    status.innerHTML =
      '<strong>' + escHtml(entry.name) + '</strong>: ' + placeCount.town + ' Städte, ' + placeCount.village + ' Dörfer, ' + placeCount.hamlet + ' Weiler.';

    // Search: datalist of all places; a matching name selects the origin.
    const list = $('place-list');
    for (const p of places) {
      const o = document.createElement('option');
      o.value = p.name + (p.gemeinde && p.gemeinde !== p.name ? ' (' + p.gemeinde + ')' : '');
      o.dataset.id = p.id;
      list.appendChild(o);
    }
    const search = $('origin-search');
    function placeByLabel(text) {
      const t = text.trim().toLowerCase();
      if (!t) return -1;
      for (const o of list.options) if (o.value.toLowerCase() === t) return indexById.get(Number(o.dataset.id));
      const exact = places.filter((p) => p.name.toLowerCase() === t);
      // Several places share the name (e.g. Fürholzen): don't pick one silently.
      if (exact.length > 1) return -2;
      if (exact.length === 1) return places.indexOf(exact[0]);
      return places.findIndex((p) => p.name.toLowerCase().startsWith(t));
    }
    search.addEventListener('change', () => {
      const i = placeByLabel(search.value);
      const hint = $('origin-hint');
      hint.hidden = i !== -2;
      hint.textContent = i === -2 ? 'Diesen Ortsnamen gibt es mehrfach – bitte einen Eintrag mit Gemeinde aus der Liste wählen.' : '';
      if (i >= 0) setOrigin(i, true);
    });

    function visible(p) {
      return state.hamlets || p.kind !== 'hamlet';
    }

    // ---- routing (reference cached per origin and kind; the bike search also per slider value)
    let refResult = null;
    let fastResult = null;
    let bikeResult = null;
    let bikeSafety = -1;
    let rows = [];
    function compute() {
      if (state.origin == null) return;
      const oi = indexById.get(state.origin);
      if (oi === undefined) return;
      const o = places[oi];
      if (!refResult) {
        refResult =
          state.ref === 'rad'
            ? R.shortestPaths(graph.bike, adjBike, graph.nodeCount, o.bikeNode, 0)
            : R.shortestPaths(graph.car, adjCar, graph.nodeCount, o.carNode, 0, R.CAR_SECONDS_PER_KM);
      }
      // The fastest bike route: what the cyclist has to ride without a detour (summary + route box).
      if (!fastResult) {
        fastResult = state.ref === 'rad' ? refResult : R.shortestPaths(graph.bike, adjBike, graph.nodeCount, o.bikeNode, 0);
      }
      if (bikeSafety !== state.safety) {
        bikeResult = R.shortestPaths(graph.bike, adjBike, graph.nodeCount, o.bikeNode, state.safety / 100);
        bikeSafety = state.safety;
      }
      rows = R.detourTable(graph, oi, refResult, bikeResult, state.ref === 'rad' ? 'bikeNode' : 'carNode');
    }

    function metricValue(row, key) {
      if (key === 'km') return row.extraKm;
      if (key === 'hm') return row.extraClimbM;
      if (key === 'min') return row.extraMin;
      return row.factor;
    }

    function colourFor(v, key) {
      const m = METRICS[key];
      if (v == null) return UNREACHABLE;
      const s = m.stops;
      if (v <= s[0]) return SCALE_COLOURS[0];
      if (v >= s[2]) return SCALE_COLOURS[2];
      const [a, b, i] = v <= s[1] ? [s[0], s[1], 0] : [s[1], s[2], 1];
      return mix(SCALE_COLOURS[i], SCALE_COLOURS[i + 1], (v - a) / (b - a));
    }
    function mix(c1, c2, t) {
      const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const a = p(c1), b = p(c2);
      return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
    }

    // ---- map layers
    const EMPTY = { type: 'FeatureCollection', features: [] };
    function dotsData() {
      const byIndex = new Map(rows.map((r) => [r.index, r]));
      return {
        type: 'FeatureCollection',
        features: places
          .map((p, i) => {
            if (!visible(p) && i !== indexById.get(state.origin)) return null;
            const r = byIndex.get(i);
            const v = r ? metricValue(r, state.metric) : null;
            return {
              type: 'Feature',
              id: i,
              properties: {
                name: p.name,
                kind: p.kind,
                colour: state.origin == null ? '#3b6fb6' : i === indexById.get(state.origin) ? '#000' : r && r.ref && r.bike ? colourFor(v, state.metric) : UNREACHABLE,
                origin: i === indexById.get(state.origin) ? 1 : 0,
                dest: i === indexById.get(state.dest) ? 1 : 0,
                r: p.kind === 'hamlet' ? 4 : p.kind === 'village' ? 6 : 8,
              },
              geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            };
          })
          .filter(Boolean),
      };
    }

    /** Sources exist only once the style has loaded (a deep link can render before that). */
    function setSourceData(id, data) {
      const source = map.getSource(id);
      if (source) source.setData(data);
    }

    function onMapReady(fn) {
      if (map.isStyleLoaded()) fn();
      else map.once('load', fn);
    }
    const outline = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: graph.meta.outline.map((ring) => [ring]) } };
    const bb = graph.meta.bbox;
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 20, duration: 0 });

    onMapReady(() => {
      map.addSource('outline', { type: 'geojson', data: outline });
      map.addLayer({ id: 'outline', type: 'line', source: 'outline', paint: { 'line-color': '#444', 'line-width': 1.5, 'line-dasharray': [3, 2] } });
      map.addSource('route-ref', { type: 'geojson', data: EMPTY });
      map.addSource('route-bike', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'route-ref', type: 'line', source: 'route-ref', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#555', 'line-width': 4, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-bike-halo', type: 'line', source: 'route-bike', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.8 } });
      map.addLayer({ id: 'route-bike', type: 'line', source: 'route-bike', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['interpolate', ['linear'], ['get', 'stress'], ...STRESS_STOPS.flatMap((s, i) => [s, STRESS_COLOURS[i]])], 'line-width': 4 } });
      map.addSource('dots', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'dots',
        type: 'circle',
        source: 'dots',
        paint: {
          'circle-radius': ['+', ['get', 'r'], ['*', 4, ['get', 'origin']], ['*', 2, ['get', 'dest']]],
          'circle-color': ['get', 'colour'],
          'circle-stroke-color': ['case', ['==', ['get', 'dest'], 1], '#000', '#fff'],
          'circle-stroke-width': ['case', ['==', ['get', 'dest'], 1], 2.5, 1],
        },
      });
      map.addLayer({
        id: 'dot-labels',
        type: 'symbol',
        source: 'dots',
        minzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['case', ['==', ['get', 'kind'], 'hamlet'], 10, 12],
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#222', 'text-halo-color': '#fff', 'text-halo-width': 1.2 },
      });
      map.on('click', 'dots', (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const i = f.id;
        if (state.origin == null || i === indexById.get(state.origin)) setOrigin(i, false);
        else setDest(i);
      });
      map.on('mouseenter', 'dots', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'dots', () => (map.getCanvas().style.cursor = ''));
      render();
    });

    // ---- rendering
    function setOrigin(i, pan) {
      const p = places[i];
      state.origin = p.id;
      state.dest = null;
      refResult = null;
      fastResult = null;
      bikeSafety = -1;
      search.value = p.name;
      if (pan) map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 11) });
      render();
    }
    function setDest(i) {
      state.dest = places[i].id;
      render();
    }

    function safetyNote() {
      const s = state.safety;
      if (s === 0) return 'Schnellste erlaubte Radroute — Landstraßen ohne Radweg werden genutzt.';
      if (s < CLOSE_PCT) return 'Straßen mit Autoverkehr zählen bis zum ' + deNum(1 + (s / 100) * STRESS_WEIGHT, 1) + '-Fachen ihrer Fahrzeit (bei 100 km/h ohne Radweg); kürzere Umwege lohnen sich dann.';
      return 'Landstraßen ab 70 km/h ohne Radweg sind gesperrt (wenig befahrene Gemeindeverbindungsstraßen nicht); bleibt kein anderer Weg, gilt der Ort als nicht erreichbar.';
    }

    function render() {
      $('safety-note').textContent = safetyNote();
      const head = $('ref-head');
      head.textContent = REFERENCES[state.ref].head;
      head.title = REFERENCES[state.ref].label + ': km / min';
      syncUrl();
      compute();
      const legend = $('legend');
      legend.hidden = state.origin == null;
      const m = METRICS[state.metric];
      $('legend-min').textContent = '≤ ' + deNum(m.stops[0], m.digits) + ' ' + m.unit;
      $('legend-max').textContent = '≥ ' + deNum(m.stops[2], m.digits) + ' ' + m.unit;
      $('legend-bar').style.background = 'linear-gradient(to right, ' + SCALE_COLOURS.join(', ') + ')';
      if (map.getSource('dots')) map.getSource('dots').setData(dotsData());
      const box = $('origin-box');
      box.hidden = state.origin == null;
      if (state.origin == null) {
        $('pair').hidden = true;
        if (map.getSource('route-ref')) {
          map.getSource('route-ref').setData(EMPTY);
          map.getSource('route-bike').setData(EMPTY);
        }
        return;
      }
      const shown = rows.filter((r) => visible(r.place));
      renderSummary(shown);
      renderTable(shown);
      renderPair();
    }

    function median(values) {
      const v = values.filter((x) => x != null).sort((a, b) => a - b);
      if (!v.length) return null;
      const mid = v.length >> 1;
      return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    }

    function renderSummary(shown) {
      const o = places[indexById.get(state.origin)];
      const both = shown.filter((r) => r.ref && r.bike);
      const unreachable = shown.filter((r) => !r.bike).length;
      const parts = [];
      parts.push('<strong>' + escHtml(o.name) + '</strong>' + (o.gemeinde && o.gemeinde !== o.name ? ' (' + escHtml(o.gemeinde) + ')' : '') + ', ' + (KIND_LABEL[o.kind] || o.kind) + '.');
      // What the routes run on (detourRouting.routeComposition), median over the places shown.
      const comps = shown
        .filter((r) => r.bike && r.place.bikeNode >= 0 && Number.isFinite(fastResult.cost[r.place.bikeNode]))
        .map((r) => ({
          fast: R.routeComposition(graph, graph.bike, R.routeEdges(graph.bike, adjBike, fastResult, r.place.bikeNode)),
          safe: R.routeComposition(graph, graph.bike, R.routeEdges(graph.bike, adjBike, bikeResult, r.place.bikeNode)),
        }))
        .filter((c) => c.fast.totalM > 0 && c.safe.totalM > 0);
      if (comps.length) {
        const pctOf = (key, which) => deNum(median(comps.map((c) => (c[which][key] / c[which].totalM) * 100)), 0) + ' %';
        parts.push('Die schnellste Radroute zu den ' + comps.length + ' anderen Orten führt im Median zu <strong>' + pctOf('busyM', 'fast') + ' über Straßen mit Tempo 70–100 ohne Radweg</strong>.');
        if (state.safety > 0) {
          parts.push('Die verkehrsarme Route führt im Median zu ' + pctOf('trackM', 'safe') + ' über Feld- und Wirtschaftswege und zu ' + pctOf('infraM', 'safe') + ' über Radwege.');
        }
      }
      if (both.length) {
        parts.push('Zu den ' + both.length + ' anderen Orten ist die Radroute im Median ' + signed(median(both.map((r) => r.extraKm)), 1) + ' km, ' + signed(median(both.map((r) => r.extraClimbM)), 0) + ' Hm und ' + signed(median(both.map((r) => r.extraMin)), 0) + ' min gegenüber ' + REFERENCES[state.ref].dative + '; Faktor ' + deNum(median(both.map((r) => r.factor)), 2) + '.');
      }
      if (state.ref === 'rad' && state.safety === 0) parts.push('Der Regler steht auf „schnellste Route“ — Rad- und Vergleichsroute sind gleich; nach rechts schieben, um den Preis verkehrsarmer Wege zu sehen.');
      if (unreachable) parts.push(unreachable + ' Orte sind mit dieser Einstellung per Rad nicht erreichbar.');
      $('summary').innerHTML = parts.join(' ');
    }

    function sortRows(list) {
      const key = state.sort;
      const val = (r) => (key === 'air' ? r.airKm : metricValue(r, key));
      return list.slice().sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return a.airKm - b.airKm;
        if (va == null) return 1;
        if (vb == null) return -1;
        return key === 'air' ? va - vb : vb - va;
      });
    }

    function renderTable(shown) {
      const tbody = $('table').querySelector('tbody');
      tbody.replaceChildren();
      for (const th of $('table').querySelectorAll('th[data-sort]')) {
        if (th.dataset.sort === state.sort) th.setAttribute('aria-sort', state.sort === 'air' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      }
      for (const r of sortRows(shown)) {
        const tr = document.createElement('tr');
        tr.dataset.index = r.index;
        if (!r.ref || !r.bike) tr.className = 'unreachable';
        if (r.place.id === state.dest) tr.classList.add('selected');
        const v = metricValue(r, state.metric);
        const cells = [
          '<span class="dot" style="background:' + (r.ref && r.bike ? colourFor(v, state.metric) : UNREACHABLE) + '"></span>' + escHtml(r.place.name) + (r.place.gemeinde && r.place.gemeinde !== r.place.name ? '<span class="gm">' + escHtml(r.place.gemeinde) + '</span>' : ''),
          deNum(r.airKm, 1),
          r.ref ? deNum(r.ref.km, 1) + ' / ' + deNum(r.ref.min, 0) : '–',
          r.bike ? deNum(r.bike.km, 1) + ' / ' + deNum(r.bike.min, 0) : '–',
          r.extraKm != null ? signed(r.extraKm, 1) : '–',
          r.extraClimbM != null ? signed(r.extraClimbM, 0) : '–',
          r.extraMin != null ? signed(r.extraMin, 0) : '–',
        ];
        tr.innerHTML = cells.map((c) => '<td>' + c + '</td>').join('');
        tr.tabIndex = 0;
        tr.setAttribute('aria-label', 'Route nach ' + r.place.name + ' zeigen');
        tr.addEventListener('click', () => setDest(r.index));
        tr.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          setDest(r.index);
        });
        tbody.appendChild(tr);
      }
    }

    function renderPair() {
      const pair = $('pair');
      if (state.dest == null || !indexById.has(state.dest)) {
        pair.hidden = true;
        setSourceData('route-ref', EMPTY);
        setSourceData('route-bike', EMPTY);
        return;
      }
      const di = indexById.get(state.dest);
      const r = rows.find((x) => x.index === di);
      const d = places[di];
      const o = places[indexById.get(state.origin)];
      const refBike = state.ref === 'rad';
      const refCoords = r && r.ref
        ? (refBike
          ? R.routeCoordinates(graph, graph.bike, adjBike, refResult, d.bikeNode)
          : R.routeCoordinates(graph, graph.car, adjCar, refResult, d.carNode))
        : [];
      const bikeEdges = r && r.bike ? R.routeEdges(graph.bike, adjBike, bikeResult, d.bikeNode) : [];
      setSourceData('route-ref', refCoords.length ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: refCoords } } : EMPTY);
      setSourceData('route-bike', {
        type: 'FeatureCollection',
        features: bikeEdges.map(({ edge, forward }) => ({
          type: 'Feature',
          properties: { stress: graph.bike.stress[edge], cat: graph.meta.categories[graph.bike.cat[edge]] },
          geometry: { type: 'LineString', coordinates: R.edgeCoordinates(graph, graph.bike, edge, forward) },
        })),
      });
      // What each route runs on, in km (detourRouting.routeComposition).
      const kmOf = (m) => deNum(m / 1000, 1) + ' km';
      function compositionText(c) {
        const parts = [
          [c.busyM, 'Straße mit Tempo 70–100 ohne Radweg'],
          [c.townM, 'Straße mit Verkehr (meist Tempo 50, auch wenig befahrene Verbindungsstraßen)'],
          [c.infraM, 'Radweg oder Radstreifen'],
          [c.trackM, 'Feld- und Wirtschaftsweg'],
          [c.quietM, 'sonstige ruhige Wege und Straßen'],
        ].filter((x) => x[0] >= 50).map((x) => kmOf(x[0]) + ' ' + x[1]);
        const extra = [];
        if (c.unpavedM >= 50) extra.push(kmOf(c.unpavedM) + ' mit erfasstem unbefestigtem Belag');
        if (c.pushedM >= 50) extra.push(kmOf(c.pushedM) + ' schieben');
        return parts.join(', ') + (extra.length ? '; davon ' + extra.join(', ') : '') + '.';
      }
      const fastEdges = fastResult && d.bikeNode >= 0 && Number.isFinite(fastResult.cost[d.bikeNode])
        ? R.routeEdges(graph.bike, adjBike, fastResult, d.bikeNode) : [];
      const fastComp = fastEdges.length ? R.routeComposition(graph, graph.bike, fastEdges) : null;
      const safeComp = bikeEdges.length ? R.routeComposition(graph, graph.bike, bikeEdges) : null;
      const html = ['<h2>' + escHtml(o.name) + ' → ' + escHtml(d.name) + '</h2>'];
      const refLabel = REFERENCES[state.ref].label;
      if (r && r.ref) html.push('<p>' + refLabel + ': ' + deNum(r.ref.km, 1) + ' km, ' + deNum(r.ref.min, 0) + ' min.</p>');
      else html.push(refBike ? '<p>Auch die schnellste Radroute erreicht den Ort nicht (kein Anschluss im Radnetz).</p>' : '<p>Mit dem Auto nicht erreichbar (kein Straßenanschluss im Graphen).</p>');
      if (r && r.bike) {
        html.push('<p>Verkehrsarme Radroute: ' + deNum(r.bike.km, 1) + ' km, ' + deNum(r.bike.min, 0) + ' min, ' + deNum(r.bike.climbM, 0) + ' Hm bergauf' + (r.extraKm != null ? ' — <strong>' + signed(r.extraKm, 1) + ' km, ' + signed(r.extraClimbM, 0) + ' Hm, ' + signed(r.extraMin, 0) + ' min</strong> gegenüber ' + REFERENCES[state.ref].dative : '') + '.</p>');
        if (safeComp) html.push('<p class="muted">Diese Radroute (' + kmOf(safeComp.totalM) + '): ' + compositionText(safeComp) + '</p>');
        if (fastComp && state.safety > 0) html.push('<p class="muted">Schnellste Radroute (' + kmOf(fastComp.totalM) + '): ' + compositionText(fastComp) + '</p>');
      } else {
        html.push('<p>Per Rad mit dieser Einstellung nicht erreichbar — Regler nach links schieben.</p>');
      }
      html.push('<div class="route-legend"><span><i class="car"></i>' + REFERENCES[state.ref].legend + '</span>' + STRESS_COLOURS.map((c, i) => '<span><i style="background:' + c + '"></i>' + ['Radweg / ruhig', 'Ort, Verkehr', '70 km/h', 'Landstraße'][i] + '</span>').join('') + '</div>');
      html.push('<p><button class="btn" id="swap" type="button">' + escHtml(d.name) + ' als Startort</button> <button class="btn" id="clear-dest" type="button">Route ausblenden</button></p>');
      pair.innerHTML = html.join('');
      pair.hidden = false;
      $('swap').addEventListener('click', () => setOrigin(di, false));
      $('clear-dest').addEventListener('click', () => { state.dest = null; render(); });
    }

    // ---- controls
    let sliderTimer = 0;
    $('safety').addEventListener('input', () => {
      state.safety = Number($('safety').value);
      $('safety-note').textContent = safetyNote();
      clearTimeout(sliderTimer);
      sliderTimer = setTimeout(render, 120);
    });
    $('metric-box').addEventListener('change', () => {
      state.metric = document.querySelector('input[name=zeige]:checked').value;
      render();
    });
    $('ref-box').addEventListener('change', () => {
      state.ref = document.querySelector('input[name=vergleich]:checked').value;
      refResult = null;
      render();
    });
    $('hamlets').addEventListener('change', () => {
      state.hamlets = $('hamlets').checked;
      render();
    });
    $('sort').addEventListener('change', () => {
      state.sort = $('sort').value;
      render();
    });
    // Column headers sort the same way as the select (descending, nearest first for Luft).
    document.querySelectorAll('#table th[data-sort] .th-sort').forEach((button) => {
      button.addEventListener('click', () => {
        state.sort = button.parentElement.dataset.sort;
        $('sort').value = state.sort;
        render();
      });
    });
    $('csv').addEventListener('click', () => {
      const o = places[indexById.get(state.origin)];
      const refHead = REFERENCES[state.ref].label;
      const head = ['Ziel', 'Gemeinde', 'Art', 'Luftlinie km', refHead + ' km', refHead + ' min', 'Rad km', 'Rad min', 'Rad Hm bergauf', 'Mehr km', 'Mehr Hm', 'Mehr min', 'Faktor'];
      const line = (r) => [r.place.name, r.place.gemeinde || '', r.place.kind, r.airKm.toFixed(2), r.ref ? r.ref.km.toFixed(2) : '', r.ref ? r.ref.min.toFixed(1) : '', r.bike ? r.bike.km.toFixed(2) : '', r.bike ? r.bike.min.toFixed(1) : '', r.bike ? r.bike.climbM.toFixed(0) : '', r.extraKm != null ? r.extraKm.toFixed(2) : '', r.extraClimbM != null ? r.extraClimbM.toFixed(0) : '', r.extraMin != null ? r.extraMin.toFixed(1) : '', r.factor != null ? r.factor.toFixed(2) : ''];
      const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
      const csv = ['# Start: ' + o.name + '; Sicherheit ' + state.safety + '; Vergleich: ' + REFERENCES[state.ref].label + '; ' + entry.name + (state.hamlets ? '; mit Weilern' : '; ohne Weiler'), head.map(esc).join(';'), ...sortRows(rows.filter((r) => visible(r.place))).map((r) => line(r).map(esc).join(';'))].join('\\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'umweg-' + o.name.replace(/[^\\wäöüÄÖÜß-]+/g, '_') + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    if (state.origin != null) search.value = places[indexById.get(state.origin)].name;
    render();
  })();
  </script>
</body>
</html>
`
}
