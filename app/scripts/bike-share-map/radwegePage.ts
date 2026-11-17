import { buildBasemapStyleJson } from './basemaps'
import { CONCEPT_DATE, STATUS_GROUPS, STEP_KINDS } from './radwegeStatus'
import { siteIconHeadLinks } from './siteIcon'
import { visitCounterHeadScript } from './visitCounter'

export type RadwegePageInput = {
  /** radwege-schweitenkirchen.json (RadwegeData from radwegeData.ts), with ?v=. */
  dataHref: string
  viewerHref: string
}

const PLAN_LABEL = {
  kurz: 'Kurz- bis mittelfristig (Lageplan 5/1)',
  lang: 'Mittel- bis langfristig (Lageplan 5/2)',
} as const
const NETZ_LABEL = {
  haupt: 'Haupttrassen',
  ergaenzend: 'Ergänzende Trassen',
  bestand: 'Bestehende Geh- und Radwege',
} as const
const BAULAST = ['Gemeinde', 'Landkreis', 'Freistaat', 'unklar'] as const
const AUSBAU_LABEL = {
  freigabe: 'Lageplan 5/1 (laut Konzept überwiegend Freigabe und Beschilderung vorhandener Wege)',
  'bestand-weg': 'Bestehender asphaltierter Weg (gestrichelt in Lageplan 5/2)',
  voll: 'Vollausbau (durchgezogen in Lageplan 5/2)',
  bestand: 'Bestehender asphaltierter Geh- und Radweg (Lageplan 5/1)',
} as const
/** Colour by plan (the alternative to colouring by progress). */
const PLAN_COLOURS = { kurz: '#0097a7', lang: '#283593', bestand: '#1a7f37' } as const

/**
 * Unlisted page (github.io only): every route of the Schweitenkirchen Radwegekonzept on a map,
 * with what has publicly happened to it. Filters by progress group, plan, network and
 * Baulastträger, single routes can be switched off, a click shows a route's facts and sources.
 */
export function radwegePageHtml({ dataHref, viewerHref }: RadwegePageInput) {
  const style = JSON.stringify(buildBasemapStyleJson('light'))
  const conceptDe = CONCEPT_DATE.split('-').reverse().join('.')
  const checkbox = (name: string, value: string, label: string, swatch = '') =>
    `<label><input type="checkbox" name="${name}" value="${value}" checked />${swatch}<span>${label}</span><span class="km" data-km="${name}:${value}"></span></label>`
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Radwege Schweitenkirchen – Stand der Umsetzung</title>
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
    #total { font-size: 13px; border-top: 1px solid var(--border); padding-top: 8px; }
    #routes { max-height: 260px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; margin-top: 4px; }
    #routes label { padding: 3px 6px; font-size: 13px; }
    #routes label:hover, #routes label.selected { background: var(--row-hover); }
    #routes .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    #routes .name { cursor: pointer; text-decoration: underline dotted; }
    #detail { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px; font-size: 13px; }
    #detail h2 { font-size: 15px; margin: 0 0 4px; }
    #detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 8px; margin: 6px 0; }
    #detail dt { color: var(--muted); }
    #detail dd { margin: 0; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 999px; color: #fff; font-size: 12px; }
    .timeline { list-style: none; padding: 0; margin: 6px 0; }
    .timeline li { border-left: 3px solid var(--border); padding: 2px 0 6px 8px; }
    .timeline li.step { border-left-color: var(--accent); }
    .timeline li.uncertain { opacity: 0.75; }
    .timeline .when { font-weight: 600; font-variant-numeric: tabular-nums; }
    .timeline .kind { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-left: 4px; }
    .note { background: var(--row-hover); border-radius: 6px; padding: 6px 8px; font-size: 12px; }
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
    <summary><h1>Radwege Schweitenkirchen</h1></summary>
    <div class="body">
      <p class="muted"><a href="${viewerHref}">&larr; Zur Karte</a></p>
      <p>Alle Trassen des Radwegekonzepts der Gemeinde (${conceptDe}) und was öffentlich dokumentiert ist: Gemeinderat, Bürgerversammlungen, Rundschau, Haushalt, Landkreis.</p>
      <p id="status" aria-live="polite">Lade Daten …</p>
      <fieldset id="f-status">
        <legend>Stand</legend>
        ${STATUS_GROUPS.map((g) =>
          checkbox('status', g.id, g.label, `<i class="sw" style="background:${g.colour}"></i>`),
        ).join('\n        ')}
      </fieldset>
      <fieldset id="f-plan">
        <legend>Plan</legend>
        ${checkbox('plan', 'kurz', PLAN_LABEL.kurz)}
        ${checkbox('plan', 'lang', PLAN_LABEL.lang)}
      </fieldset>
      <fieldset id="f-netz">
        <legend>Netz</legend>
        ${Object.entries(NETZ_LABEL)
          .map(([k, v]) => checkbox('netz', k, v))
          .join('\n        ')}
      </fieldset>
      <fieldset id="f-baulast">
        <legend>Baulastträger</legend>
        ${BAULAST.map((b) => checkbox('baulast', b, b === 'unklar' ? 'nicht angegeben' : b)).join('\n        ')}
      </fieldset>
      <fieldset class="seg" id="f-farbe">
        <legend>Farbe nach</legend>
        <label><input type="radio" name="farbe" value="status" checked><span>Stand</span></label>
        <label><input type="radio" name="farbe" value="plan"><span>Plan</span></label>
      </fieldset>
      <p class="muted" id="line-legend"><i class="sw" style="background:var(--fg)"></i> durchgezogen: vorhanden oder Vollausbau (Lageplan 5/2) · <i class="sw dash" style="border-color:var(--fg)"></i> gestrichelt: übrige Trassen (Lageplan 5/1, bestehender Weg in 5/2) · blasser: Lage nur aus dem Plan übertragen</p>
      <p id="total" aria-live="polite"></p>
      <fieldset>
        <legend><label for="route-search" style="padding:0">Trassen</label></legend>
        <input id="route-search" type="search" placeholder="Trasse oder Ort suchen" autocomplete="off" />
        <div class="row-btns"><button class="btn" type="button" id="all-on">alle</button><button class="btn" type="button" id="all-off">keine</button><button class="btn" type="button" id="csv" style="margin-left:auto">CSV</button></div>
        <div id="routes" role="group" aria-label="Trassen ein- und ausblenden"></div>
      </fieldset>
      <div id="detail" hidden></div>
      <p class="muted" style="margin-top:8px">Lage der Trassen aus den Lageplänen 5/1 und 5/2 des Radwegekonzepts übertragen und, wo die Trasse einem Weg folgt, auf OpenStreetMap gelegt (© OpenStreetMap-Mitwirkende). „Kein öffentlicher Schritt dokumentiert“ heißt: In den öffentlich zugänglichen Unterlagen wurde nichts gefunden, nicht dass nichts geschehen ist. Stand der Recherche: <span id="stand"></span>.</p>
    </div>
  </details>
  <script src="./vendor/maplibre-gl-4.7.1/maplibre-gl.js"></script>
  <script>
  (async function () {
    const DATA_HREF = ${JSON.stringify(dataHref)};
    const GROUPS = ${JSON.stringify(STATUS_GROUPS)};
    const STEP_KINDS = ${JSON.stringify(STEP_KINDS)};
    const PLAN_LABEL = ${JSON.stringify(PLAN_LABEL)};
    const NETZ_LABEL = ${JSON.stringify(NETZ_LABEL)};
    const AUSBAU_LABEL = ${JSON.stringify(AUSBAU_LABEL)};
    const PLAN_COLOURS = ${JSON.stringify(PLAN_COLOURS)};
    const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
    const $ = (id) => document.getElementById(id);
    const escHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const km = (m) => (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
    const deDate = (d) => d.split('-').reverse().join('.');
    const lineGroup = (p) => (p.netz === 'bestand' ? 'bestand' : p.plan);

    // ---- state (URL: lists of switched-off values, so the default URL stays empty)
    const params = new URLSearchParams(location.search);
    const offList = (k) => new Set((params.get(k) || '').split(',').filter(Boolean));
    const state = {
      off: { status: offList('ohne-stand'), plan: offList('ohne-plan'), netz: offList('ohne-netz'), baulast: offList('ohne-baulast') },
      hidden: offList('ohne'),
      selected: params.get('trasse') || null,
      farbe: params.get('farbe') === 'plan' ? 'plan' : 'status',
      search: '',
    };
    /** Other routes under the last map click, offered in the detail box. */
    let others = [];
    const URL_KEYS = { status: 'ohne-stand', plan: 'ohne-plan', netz: 'ohne-netz', baulast: 'ohne-baulast' };
    function syncUrl() {
      const p = new URLSearchParams();
      for (const [k, key] of Object.entries(URL_KEYS)) if (state.off[k].size) p.set(key, [...state.off[k]].join(','));
      if (state.hidden.size) p.set('ohne', [...state.hidden].join(','));
      if (state.farbe !== 'status') p.set('farbe', state.farbe);
      if (state.selected) p.set('trasse', state.selected);
      const q = p.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }

    // Without WebGL MapLibre throws; the list, the details and the CSV still work.
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
      const res = await fetch(DATA_HREF);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      console.error(e);
      $('status').textContent = 'Die Daten konnten nicht geladen werden.';
      return;
    }
    const routes = data.routes;
    const routeById = new Map(routes.map((r) => [r.id, r]));
    const features = data.lines.features;
    if (state.selected && !routeById.has(state.selected)) state.selected = null;
    $('stand').textContent = deDate(data.stand);
    $('status').textContent = routes.filter((r) => r.id !== 'bestand').length + ' Trassen in ' + features.length + ' Linienstücken.';

    // Group of a route in the list: the "furthest" group among its lines.
    const ORDER = GROUPS.map((g) => g.id);
    const routeGroup = new Map();
    for (const f of features) {
      const g = f.properties.status, cur = routeGroup.get(f.properties.routeId);
      if (cur == null || ORDER.indexOf(g) < ORDER.indexOf(cur)) routeGroup.set(f.properties.routeId, g);
    }

    function passesFilters(p) {
      const r = routeById.get(p.routeId);
      return !state.off.status.has(p.status) && !state.off.plan.has(p.plan) && !state.off.netz.has(p.netz) && !state.off.baulast.has(r.baulast);
    }
    const visible = () => features.filter((f) => passesFilters(f.properties) && !state.hidden.has(f.properties.routeId));

    // ---- controls
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
    for (const input of document.querySelectorAll('input[name=farbe]')) {
      input.checked = input.value === state.farbe;
      input.addEventListener('change', () => {
        state.farbe = input.value;
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

    // ---- map
    const EMPTY = { type: 'FeatureCollection', features: [] };
    function colourExpr() {
      if (state.farbe === 'plan') {
        return ['case', ['==', ['get', 'netz'], 'bestand'], PLAN_COLOURS.bestand, ['==', ['get', 'plan'], 'kurz'], PLAN_COLOURS.kurz, PLAN_COLOURS.lang];
      }
      return ['match', ['get', 'status'], ...GROUPS.flatMap((g) => [g.id, g.colour]), '#888'];
    }
    const SOLID = ['any', ['==', ['get', 'status'], 'bestand'], ['==', ['get', 'ausbau'], 'voll']];
    const width = (w) => ['interpolate', ['linear'], ['zoom'], 11, w, 16, w * 2];
    let mapReady = false;
    function onMapReady(fn) {
      if (!map) {
        $('status').textContent += ' Die Karte kann in diesem Browser nicht angezeigt werden (WebGL fehlt); Liste und Details funktionieren.';
        return;
      }
      if (map.isStyleLoaded()) fn();
      else map.once('load', fn);
    }
    onMapReady(() => {
      map.addSource('radwege', { type: 'geojson', data: EMPTY, promoteId: 'fid' });
      map.addLayer({ id: 'radwege-casing', type: 'line', source: 'radwege', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': width(6), 'line-opacity': 0.9 } });
      map.addLayer({ id: 'radwege-solid', type: 'line', source: 'radwege', filter: SOLID, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': width(3.5) } });
      map.addLayer({ id: 'radwege-dashed', type: 'line', source: 'radwege', filter: ['!', SOLID], layout: { 'line-join': 'round' }, paint: { 'line-width': width(3.5), 'line-dasharray': [2, 1.2] } });
      map.addLayer({ id: 'radwege-selected', type: 'line', source: 'radwege', filter: ['==', ['get', 'routeId'], ''], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffd400', 'line-width': width(9), 'line-opacity': 0.55 } }, 'radwege-casing');
      for (const id of ['radwege-solid', 'radwege-dashed']) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
      map.on('click', (e) => {
        const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
        const hits = map.queryRenderedFeatures(box, { layers: ['radwege-solid', 'radwege-dashed'] });
        const ids = [...new Set(hits.map((h) => h.properties.routeId))];
        if (ids.length) select(ids[0], false, ids.slice(1));
      });
      mapReady = true;
      render();
    });

    // ---- rendering
    function render() {
      syncUrl();
      const vis = visible();
      if (mapReady) {
        const src = map.getSource('radwege');
        if (src) src.setData({ type: 'FeatureCollection', features: vis });
        for (const id of ['radwege-solid', 'radwege-dashed']) {
          map.setPaintProperty(id, 'line-color', colourExpr());
          map.setPaintProperty(id, 'line-opacity', ['case', ['>', ['get', 'fromPlan'], 0.5], 0.6, 1]);
        }
        map.setFilter('radwege-selected', ['==', ['get', 'routeId'], state.selected || '']);
      }
      // km per filter value, counting the lines that pass every other filter
      for (const el of document.querySelectorAll('[data-km]')) {
        const [k, v] = el.dataset.km.split(':');
        let m = 0;
        for (const f of features) {
          const p = f.properties;
          if (state.hidden.has(p.routeId)) continue;
          const val = k === 'baulast' ? routeById.get(p.routeId).baulast : p[k];
          if (val !== v) continue;
          const saved = state.off[k];
          state.off[k] = new Set();
          if (passesFilters(p)) m += p.m;
          state.off[k] = saved;
        }
        el.textContent = km(m);
      }
      const totalM = vis.reduce((s, f) => s + f.properties.m, 0);
      const shown = new Set(vis.map((f) => f.properties.routeId));
      $('total').textContent = 'Angezeigt: ' + shown.size + ' Trassen, ' + km(totalM) + ' Linie' + (state.off.plan.size === 0 ? ' (Trassen in beiden Plänen doppelt gezählt)' : '') + '.';
      renderList();
      renderDetail();
    }

    function renderList() {
      const box = $('routes');
      box.textContent = '';
      for (const r of listed()) {
        const g = GROUP_BY_ID[routeGroup.get(r.id)];
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
        dot.style.background = g ? g.colour : '#888';
        dot.title = g ? g.label : '';
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
      state.selected = id;
      others = more || [];
      if (state.hidden.has(id)) state.hidden.delete(id);
      render();
      if (zoom) {
        const fs = features.filter((f) => f.properties.routeId === id);
        let w = 180, s = 90, e = -180, n = -90;
        for (const f of fs) for (const [x, y] of f.geometry.coordinates) { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }
        if (fs.length && map) map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 15, duration: 500 });
      }
      const row = document.querySelector('#routes [data-route="' + id + '"]');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      $('detail').scrollIntoView && $('detail').scrollIntoView({ block: 'nearest' });
    }

    function renderDetail() {
      const box = $('detail');
      const r = state.selected && routeById.get(state.selected);
      box.hidden = !r;
      if (!r) return;
      const fs = features.filter((f) => f.properties.routeId === r.id);
      const groups = [...new Set(fs.map((f) => f.properties.status))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      const plans = Object.entries(r.plans).map(([p, n]) => escHtml(PLAN_LABEL[p]) + ': ' + escHtml(NETZ_LABEL[n]));
      const ausbau = {};
      for (const f of fs) ausbau[f.properties.ausbau] = (ausbau[f.properties.ausbau] || 0) + f.properties.m;
      const fromPlanM = fs.reduce((s, f) => s + f.properties.m * f.properties.fromPlan, 0);
      const totalM = fs.reduce((s, f) => s + f.properties.m, 0);
      let h = '<h2>' + escHtml(r.name) + (r.road ? ' <span class="muted">' + escHtml(r.road) + '</span>' : '') + '</h2>';
      h += '<p>' + groups.map((g) => '<span class="badge" style="background:' + GROUP_BY_ID[g].colour + '">' + escHtml(GROUP_BY_ID[g].label) + '</span>').join(' ') + '</p>';
      if (r.firstStep) {
        h += '<p>Erster dokumentierter Schritt: <strong>' + escHtml(deDate(r.firstStep.date)) + '</strong> – ' + escHtml(r.firstStep.kind) + ' (' + escHtml(r.firstStep.source) + ')</p>';
      } else if (!r.built && r.id !== 'bestand') {
        h += '<p>Kein öffentlicher Schritt dokumentiert.</p>';
      }
      h += '<dl>';
      if (plans.length) h += '<dt>Plan</dt><dd>' + plans.join('<br>') + '</dd>';
      const len = [];
      if (r.lengthConceptKm) len.push('Konzept ca. ' + r.lengthConceptKm.toLocaleString('de-DE') + ' km');
      for (const [p, v] of Object.entries(r.km)) len.push((p === 'kurz' ? 'Lageplan 5/1' : 'Lageplan 5/2') + ' gemessen ' + v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' km');
      if (len.length) h += '<dt>Länge</dt><dd>' + len.join('<br>') + '</dd>';
      h += '<dt>Ausbau</dt><dd>' + Object.entries(ausbau).map(([a, m]) => escHtml(AUSBAU_LABEL[a]) + ': ' + km(m)).join('<br>') + '</dd>';
      h += '<dt>Baulast</dt><dd>' + escHtml(r.baulast === 'unklar' ? 'nicht angegeben' : r.baulast) + (r.baulastNote ? '<br><span class="muted">' + escHtml(r.baulastNote) + '</span>' : '') + '</dd>';
      if (r.konzeptHinweis) h += '<dt>Konzept</dt><dd>' + escHtml(r.konzeptHinweis) + '</dd>';
      if (r.kusHorizont) h += '<dt>Landkreis (KUS)</dt><dd>' + escHtml(r.kusHorizont) + '</dd>';
      h += '</dl>';
      if (r.documented) h += '<p class="note">' + escHtml(r.documented) + '</p>';
      if (r.events.length) {
        h += '<ul class="timeline">';
        for (const e of r.events) {
          const step = STEP_KINDS.includes(e.kind) && !e.uncertain;
          h += '<li class="' + (step ? 'step' : '') + (e.uncertain ? ' uncertain' : '') + '"><span class="when">' + escHtml(deDate(e.date)) + '</span><span class="kind">' + escHtml(e.kind) + (e.uncertain ? ' · möglicherweise verwandt' : '') + '</span><br>' + escHtml(e.text) + ' <a href="' + escHtml(e.url) + '" target="_blank" rel="noopener">' + escHtml(e.source) + '</a></li>';
        }
        h += '</ul>';
      } else if (r.id !== 'bestand') {
        h += '<p class="muted">In den öffentlichen Unterlagen (Ratsinformationssystem, Bürgerversammlungen, Rundschau, Haushalt, KUS-Steckbrief) wurde zu dieser Trasse kein Vorgang gefunden.</p>';
      }
      if (fromPlanM > 0.05 * totalM) h += '<p class="muted">' + km(fromPlanM) + ' der Linie folgen keinem Weg in OpenStreetMap und sind nur aus dem Lageplan übertragen (Lage ungefähr).</p>';
      const links = [];
      if (r.plans.kurz || r.id === 'bestand') links.push('<a href="' + escHtml(data.sources.kurz) + '" target="_blank" rel="noopener">Lageplan 5/1</a>');
      if (r.plans.lang) links.push('<a href="' + escHtml(data.sources.lang) + '" target="_blank" rel="noopener">Lageplan 5/2</a>');
      links.push('<a href="' + escHtml(data.sources.erlaeuterung) + '" target="_blank" rel="noopener">Erläuterung</a>');
      if (r.kusHorizont) links.push('<a href="' + escHtml(data.sources.kus) + '" target="_blank" rel="noopener">KUS-Steckbrief</a>');
      h += '<p>Konzept: ' + links.join(' · ') + '</p>';
      if (others.length) {
        h += '<p class="muted">An dieser Stelle auch: ' + others.map((id) => '<a href="#" data-select="' + escHtml(id) + '">' + escHtml(routeById.get(id).name) + '</a>').join(', ') + '</p>';
      }
      h += '<p><button class="btn" type="button" id="detail-close">Schließen</button></p>';
      box.innerHTML = h;
      for (const a of box.querySelectorAll('[data-select]')) {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          select(a.dataset.select, true);
        });
      }
      $('detail-close').addEventListener('click', () => {
        state.selected = null;
        others = [];
        render();
      });
    }

    function downloadCsv() {
      const rows = [['Trasse', 'Straße', 'Plan', 'Netz', 'Ausbau', 'Stand', 'Baulastträger', 'Länge (m)', 'Erster Schritt', 'Quelle']];
      for (const f of visible()) {
        const p = f.properties, r = routeById.get(p.routeId);
        rows.push([r.name, r.road || '', PLAN_LABEL[p.plan], NETZ_LABEL[p.netz], AUSBAU_LABEL[p.ausbau], GROUP_BY_ID[p.status].label, r.baulast, String(p.m), r.firstStep ? r.firstStep.date + ' ' + r.firstStep.kind : '', r.firstStep ? r.firstStep.url : '']);
      }
      const csv = rows.map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\\r\\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'radwege-schweitenkirchen.csv';
      a.click();
    }

    render();
    if (state.selected && !location.hash.includes('karte=')) select(state.selected, true);
  })();
  </script>
</body>
</html>
`
}
