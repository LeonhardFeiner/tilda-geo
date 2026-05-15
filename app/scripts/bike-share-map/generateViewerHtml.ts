import { BASEMAP_OPTIONS, buildBasemapStyleJson } from './basemaps'
import { COLOR_SCALES, DEFAULT_COLOR_SCALE } from './colorScales'
import {
  BIKE_SHARE_COLOR_CAP_PCT,
  PROJECT_LEAD,
  TILDA_BIKELANES_TILES,
  TILDA_ROADS_TILES,
} from './constants'

export function generateViewerHtml(generatedAt: string) {
  const basemapStyles = Object.fromEntries(
    BASEMAP_OPTIONS.map((b) => [b.id, buildBasemapStyleJson(b.id)]),
  )

  const config = {
    generatedAt,
    basemap: 'light',
    basemapStyles,
    basemapOptions: BASEMAP_OPTIONS.map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
    })),
    bikelanesTiles: TILDA_BIKELANES_TILES,
    roadsTiles: TILDA_ROADS_TILES,
    statsUrl: './stats.geojson',
    manifestUrl: './manifest.json',
    bayernId: 'relation/2145268',
    defaultView: 'bayern-landkreise',
    colorScales: COLOR_SCALES,
    defaultColorScale: DEFAULT_COLOR_SCALE,
    colorCapPct: BIKE_SHARE_COLOR_CAP_PCT,
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Radinfra-Karte – Viewer</title>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
    #map { position: absolute; inset: 0; }
    .panel {
      position: absolute; z-index: 2; top: 12px; left: 12px;
      max-width: min(400px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow-y: auto;
      padding: 12px 14px; border-radius: 8px;
      background: rgba(255, 255, 255, 0.95);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px; line-height: 1.45;
    }
    .panel h1 { margin: 0 0 10px; font-size: 16px; }
    .panel label { display: block; font-size: 13px; margin: 8px 0 4px; font-weight: 600; }
    .panel select { width: 100%; font-size: 13px; padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; }
    .panel .row { display: flex; flex-wrap: wrap; gap: 12px 16px; margin-top: 8px; }
    .panel .row label { display: flex; align-items: center; gap: 6px; font-weight: normal; margin: 0; cursor: pointer; }
    .hint { font-size: 11px; color: #666; margin-top: 4px; }
    .legend { margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd; }
    .legend-bar { height: 10px; border-radius: 3px; margin: 6px 0 4px; }
    .legend-labels { display: flex; justify-content: space-between; font-size: 12px; color: #555; }
    .swatch { display: inline-block; width: 24px; height: 0; border-top: 3px solid; vertical-align: middle; margin-right: 6px; }
    .ranking { margin-top: 10px; border-top: 1px solid #e8e8e8; padding-top: 8px; }
    .ranking summary {
      cursor: pointer; font-size: 13px; font-weight: 600; color: #333;
      user-select: none;
    }
    .ranking summary::-webkit-details-marker { color: #666; }
    .ranking[open] summary { margin-bottom: 6px; }
    .ranking-hint { font-weight: normal; font-size: 11px; color: #888; }
    .ranking-list {
      margin: 0; padding: 0;
      font-size: 11px; line-height: 1.45; color: #444;
      list-style: none;
    }
    .ranking-list li {
      display: grid;
      grid-template-columns: 1.6em minmax(0, 1fr) minmax(52px, 80px) 3em;
      gap: 2px 6px;
      align-items: center;
      margin: 3px 0;
      padding: 0;
    }
    .ranking-rank { color: #666; font-variant-numeric: tabular-nums; font-size: 10px; }
    .ranking-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 10px;
    }
    .ranking-bar-track {
      height: 9px; background: #eceff1; border-radius: 2px; overflow: hidden;
    }
    .ranking-bar-fill { height: 100%; border-radius: 2px; min-width: 2px; }
    .ranking-pct {
      text-align: right; font-variant-numeric: tabular-nums; font-size: 10px; color: #444;
    }
    .ranking-list .ranking-more {
      display: block; grid-column: 1 / -1;
      color: #888; font-style: italic; font-size: 10px; padding: 2px 0;
    }
    .view-meta { font-size: 11px; color: #666; margin-top: 8px; }
    .footer {
      font-size: 11px; color: #888; margin-top: 6px; padding-top: 6px;
      border-top: 1px solid #eee; line-height: 1.5;
    }
    #tooltip {
      position: absolute; z-index: 3; pointer-events: none; display: none;
      padding: 6px 8px; border-radius: 4px; background: rgba(0,0,0,0.85); color: #fff; font-size: 12px; max-width: 320px;
    }
    #load-error { color: #b71c1c; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="panel">
    <h1>Radinfra-Karte</h1>
    <p id="load-error"></p>
    <label for="view-select">Gebiet</label>
    <select id="view-select"></select>
    <label for="basemap-select">Hintergrundkarte</label>
    <select id="basemap-select"></select>
    <p class="hint" id="basemap-hint"></p>
    <div class="row">
      <label><input type="checkbox" id="toggle-bikelanes" checked /> Radwege</label>
      <label><input type="checkbox" id="toggle-roads" /> Straßen</label>
    </div>
    <div class="legend">
      <strong>Flächenfarbe</strong>
      <label for="color-scale-select">Farbskala</label>
      <select id="color-scale-select"></select>
      <div class="legend-bar" id="legend-bar"></div>
      <div class="legend-labels"><span id="legend-min"></span><span id="legend-max"></span></div>
      <p class="hint" id="scale-cap-hint" hidden></p>
      <p><span class="swatch" id="bikelane-swatch" style="border-color:#b71c1c"></span>Radwege</p>
      <p><span class="swatch" style="border-color:#78909c"></span>Straßen (optional)</p>
      <details class="ranking" id="ranking-details">
        <summary>Rangliste <span class="ranking-hint" id="ranking-summary"></span></summary>
        <ol class="ranking-list" id="ranking-list"></ol>
      </details>
    </div>
    <p class="view-meta" id="view-meta"></p>
    <p class="footer">
      Erzeugt ${generatedAt} · Daten © OpenStreetMap / tilda-geo.de · Projektverantwortlich: ${PROJECT_LEAD}
    </p>
  </div>
  <div id="tooltip"></div>
  <script src="https://unpkg.com/@turf/turf@7.2.0/turf.min.js"></script>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const CONFIG = ${JSON.stringify(config)};

    let allFeatures = [];
    let manifest = { views: [] };
    let rawLoaded = false;

    const viewSelect = document.getElementById('view-select');
    const basemapSelect = document.getElementById('basemap-select');
    const basemapHint = document.getElementById('basemap-hint');
    const toggleBikelanes = document.getElementById('toggle-bikelanes');
    const toggleRoads = document.getElementById('toggle-roads');
    const loadError = document.getElementById('load-error');
    const rankingDetails = document.getElementById('ranking-details');
    const colorScaleSelect = document.getElementById('color-scale-select');
    const legendBar = document.getElementById('legend-bar');
    const bikelaneSwatch = document.getElementById('bikelane-swatch');
    const scaleCapHint = document.getElementById('scale-cap-hint');
    let lastPctRange = { min: 0, max: 20, scaleCapped: false, dataMax: 20 };
    let lastRankingFeatures = [];
    const RANKING_RENDER_MAX = 120;

    for (const opt of CONFIG.basemapOptions) {
      const el = document.createElement('option');
      el.value = opt.id;
      el.textContent = opt.label;
      if (opt.id === CONFIG.basemap) el.selected = true;
      basemapSelect.appendChild(el);
    }

    function sumLengthRecord(obj) {
      if (!obj || typeof obj !== 'object') return 0;
      return Object.values(obj).reduce((a, v) => a + (Number(v) || 0), 0);
    }

    function enrichFeature(f) {
      const p = f.properties || {};
      const road = sumLengthRecord(p.road_length);
      const bike = sumLengthRecord(p.bikelane_length);
      const pct = road > 0 ? (bike / road) * 100 : null;
      return {
        ...f,
        properties: {
          ...p,
          roadSumKm: road,
          bikelaneSumKm: bike,
          bikeSharePct: pct,
          label: (p.name || p.id) + ': ' + (pct != null ? pct.toFixed(1) : '–') + ' % Radinfra',
        },
      };
    }

    function findBayern() {
      return allFeatures.find(
        (f) => f.properties?.level === '4' && f.properties?.id === CONFIG.bayernId,
      );
    }

    function regionLevel(f) {
      return String(f.properties?.level ?? '');
    }

    function kreisfreiIds() {
      return new Set(manifest.kreisfreieStaedteIds || []);
    }

    function inBayern(f) {
      if (f.properties?.bundesland_id === CONFIG.bayernId) return true;
      const bayern = findBayern();
      if (!bayern) return true;
      return turf.booleanPointInPolygon(turf.centroid(f), bayern);
    }

    function filterForView(viewId) {
      const kreisfrei = kreisfreiIds();
      if (viewId === 'bayern-landkreise-kreisfreie') {
        return allFeatures.filter((f) => regionLevel(f) === '6' && f.geometry && inBayern(f));
      }
      if (viewId === 'bayern-landkreise') {
        return allFeatures.filter((f) => {
          if (regionLevel(f) !== '6' || !f.geometry) return false;
          if (kreisfrei.has(f.properties?.id)) return false;
          return inBayern(f);
        });
      }
      if (viewId === 'bayern-kreisfreie-staedte') {
        return allFeatures.filter((f) => {
          if (regionLevel(f) !== '6' || !f.geometry) return false;
          return kreisfrei.has(f.properties?.id);
        });
      }
      if (viewId === 'bayern-gemeinden-kreisfreie') {
        const gemeinden = allFeatures.filter(
          (f) => regionLevel(f) === '8' && f.geometry && inBayern(f),
        );
        const cities = allFeatures.filter(
          (f) => regionLevel(f) === '6' && f.geometry && kreisfrei.has(f.properties?.id),
        );
        return [...gemeinden, ...cities];
      }
      if (viewId === 'bayern-gemeinden') {
        return allFeatures.filter((f) => regionLevel(f) === '8' && f.geometry && inBayern(f));
      }
      if (viewId.startsWith('landkreis:')) {
        const lkId = viewId.slice('landkreis:'.length);
        const lk = allFeatures.find((f) => f.properties?.id === lkId && regionLevel(f) === '6');
        const gemeinden = allFeatures.filter((f) => {
          if (regionLevel(f) !== '8' || !f.geometry) return false;
          if (f.properties?.landkreis_id === lkId) return true;
          if (!lk) return false;
          return turf.booleanPointInPolygon(turf.centroid(f), lk);
        });
        // Kreisfreie Städte have no level-8 children – show the city polygon
        return gemeinden;
      }
      if (viewId.startsWith('kreisfrei:')) {
        const cityId = viewId.slice('kreisfrei:'.length);
        const city = allFeatures.find((f) => f.properties?.id === cityId && regionLevel(f) === '6');
        return city ? [city] : [];
      }
      return [];
    }

    function colorScaleRange(features) {
      const vals = features
        .map((f) => f.properties?.bikeSharePct)
        .filter((v) => typeof v === 'number');
      const capPct = CONFIG.colorCapPct;
      if (!vals.length) {
        return { min: 0, max: 20, dataMin: 0, dataMax: 20, scaleCapped: false };
      }
      const dataMin = Math.min(...vals);
      const dataMax = Math.max(...vals);
      const scaleCapped = dataMax > capPct;
      const max = scaleCapped ? capPct : dataMax;
      return { min: 0, max, dataMin, dataMax, scaleCapped };
    }

    function viewShowsGemeinden(viewId) {
      return (
        viewId === 'bayern-gemeinden' ||
        viewId === 'bayern-gemeinden-kreisfreie' ||
        viewId.startsWith('landkreis:')
      );
    }

    function viewShowsAllGemeinden(viewId) {
      return viewId === 'bayern-gemeinden' || viewId === 'bayern-gemeinden-kreisfreie';
    }

    function updateRankingVisibility(viewId) {
      const available = !viewShowsAllGemeinden(viewId);
      rankingDetails.hidden = !available;
      if (!available) {
        rankingDetails.open = false;
        document.getElementById('ranking-list').replaceChildren();
        document.getElementById('ranking-summary').textContent = '';
      }
    }

    function updateScaleCapHint(viewId) {
      if (!viewShowsGemeinden(viewId)) {
        scaleCapHint.hidden = true;
        scaleCapHint.textContent = '';
        return;
      }
      scaleCapHint.hidden = false;
      scaleCapHint.textContent =
        'Bei Gemeinden endet die Farbskala bei ' +
        CONFIG.colorCapPct +
        ' %: darüber liegende Werte (z. B. durch Forstflächen mit mehr Rad- als Straßenkilometern) werden gleich eingefärbt.';
    }

    function clampPctForScale(pct, minPct, maxPct) {
      return Math.max(minPct, Math.min(maxPct, pct));
    }

    function compareByBikeShare(a, b) {
      const ap = a.properties?.bikeSharePct;
      const bp = b.properties?.bikeSharePct;
      if (typeof ap !== 'number' && typeof bp !== 'number') {
        return String(a.properties?.name ?? '').localeCompare(String(b.properties?.name ?? ''), 'de');
      }
      if (typeof ap !== 'number') return 1;
      if (typeof bp !== 'number') return -1;
      return bp - ap;
    }

    function hexToRgb(hex) {
      const h = hex.replace('#', '');
      return [
        Number.parseInt(h.slice(0, 2), 16),
        Number.parseInt(h.slice(2, 4), 16),
        Number.parseInt(h.slice(4, 6), 16),
      ];
    }

    function lerpColor(c1, c2, t) {
      const a = hexToRgb(c1);
      const b = hexToRgb(c2);
      const mix = (x, y) => Math.round(x + (y - x) * t);
      return 'rgb(' + mix(a[0], b[0]) + ',' + mix(a[1], b[1]) + ',' + mix(a[2], b[2]) + ')';
    }

    function colorForPct(pct, min, max) {
      const scale = colorScaleById(colorScaleSelect.value);
      if (max <= min) return scale.mid;
      const v = clampPctForScale(pct, min, max);
      const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
      if (t <= 0.5) return lerpColor(scale.low, scale.mid, t * 2);
      return lerpColor(scale.mid, scale.high, (t - 0.5) * 2);
    }

    function updateRanking(features, minPct, maxPct) {
      const list = document.getElementById('ranking-list');
      const summary = document.getElementById('ranking-summary');
      const sorted = [...features].sort(compareByBikeShare);
      const withPct = sorted.filter((f) => typeof f.properties?.bikeSharePct === 'number');
      const span = Math.max(maxPct - minPct, 0.001);
      const shown = withPct.length > RANKING_RENDER_MAX ? withPct.slice(0, RANKING_RENDER_MAX) : withPct;

      summary.textContent =
        '(' + sorted.length + ' Gebiete, Balken = Anteil in dieser Ansicht)';

      list.replaceChildren();
      for (let i = 0; i < shown.length; i++) {
        const f = shown[i];
        const pct = f.properties.bikeSharePct;
        const li = document.createElement('li');
        const rank = document.createElement('span');
        rank.className = 'ranking-rank';
        rank.textContent = (i + 1) + '.';
        const name = document.createElement('span');
        name.className = 'ranking-name';
        const label = f.properties?.name || f.properties?.id || '–';
        name.textContent = label;
        name.title = label;
        const track = document.createElement('div');
        track.className = 'ranking-bar-track';
        const fill = document.createElement('div');
        fill.className = 'ranking-bar-fill';
        const widthPct = Math.max(2, ((clampPctForScale(pct, minPct, maxPct) - minPct) / span) * 100);
        fill.style.width = widthPct + '%';
        fill.style.background = colorForPct(pct, minPct, maxPct);
        track.appendChild(fill);
        const pctEl = document.createElement('span');
        pctEl.className = 'ranking-pct';
        pctEl.textContent = pct.toFixed(1) + ' %';
        li.append(rank, name, track, pctEl);
        list.appendChild(li);
      }
      if (withPct.length > RANKING_RENDER_MAX) {
        const more = document.createElement('li');
        more.className = 'ranking-more';
        more.textContent =
          '… ' + (withPct.length - RANKING_RENDER_MAX) + ' weitere (nach unten scrollen)';
        list.appendChild(more);
      }
      const withoutPct = sorted.length - withPct.length;
      if (withoutPct > 0) {
        const note = document.createElement('li');
        note.className = 'ranking-more';
        note.textContent = withoutPct + ' ohne Straßendaten';
        list.appendChild(note);
      }
    }

    const map = new maplibregl.Map({
      container: 'map',
      style: CONFIG.basemapStyles[CONFIG.basemap],
      center: [11.5, 48.9],
      zoom: 7,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    function urlParams() {
      return new URLSearchParams(location.search);
    }

    function parseBoolParam(value, defaultValue) {
      if (value == null || value === '') return defaultValue;
      const v = value.toLowerCase();
      if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
      return true;
    }

    function allViewOptionValues() {
      return [...viewSelect.options].map((o) => o.value).filter(Boolean);
    }

    function resolveViewIdFromUrl() {
      const params = urlParams();
      const requested = params.get('view') || params.get('gebiet');
      if (!requested) return CONFIG.defaultView;
      const decoded = decodeURIComponent(requested);
      const known = new Set(allViewOptionValues());
      if (known.has(decoded)) return decoded;
      return CONFIG.defaultView;
    }

    function applyUrlOptions() {
      const params = urlParams();
      const viewId = resolveViewIdFromUrl();
      viewSelect.value = viewId;
      currentView = viewId;

      const basemap = params.get('basemap');
      if (basemap && CONFIG.basemapStyles[basemap]) {
        basemapSelect.value = basemap;
        overlaysBound = false;
        map.setStyle(CONFIG.basemapStyles[basemap]);
      }

      const radwege = params.get('radwege') ?? params.get('bikelanes');
      if (radwege != null && radwege !== '') {
        toggleBikelanes.checked = parseBoolParam(radwege, true);
      }
      const strassen = params.get('strassen') ?? params.get('roads');
      if (strassen != null && strassen !== '') {
        toggleRoads.checked = parseBoolParam(strassen, false);
      }

      const ranking = params.get('ranking');
      if (ranking != null && ranking !== '' && !viewShowsAllGemeinden(viewId)) {
        const open = parseBoolParam(ranking, false);
        rankingDetails.open = open || ranking === 'open';
      }

      const colors = params.get('colors') ?? params.get('palette') ?? params.get('farbskala');
      if (colors && CONFIG.colorScales.some((s) => s.id === colors)) {
        colorScaleSelect.value = colors;
      }

      updateBasemapHint();
      updateLegendBar(colorScaleSelect.value);
      updateBikelaneOverlayColor(colorScaleSelect.value);
    }

    let currentView = CONFIG.defaultView;
    let overlaysBound = false;

    function setLayerVisibility(id, visible) {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }

    function updateOverlayVisibility() {
      setLayerVisibility('bikelanes-casing', toggleBikelanes.checked);
      setLayerVisibility('bikelanes-lines', toggleBikelanes.checked);
      setLayerVisibility('roads-lines', toggleRoads.checked);
    }

    function addTileOverlays() {
      if (map.getSource('bikelanes')) return;
      map.addSource('bikelanes', {
        type: 'vector',
        tiles: [CONFIG.bikelanesTiles],
        minzoom: 4,
        maxzoom: 14,
      });
      map.addSource('roads', {
        type: 'vector',
        tiles: [CONFIG.roadsTiles],
        minzoom: 4,
        maxzoom: 14,
      });
      map.addLayer({
        id: 'roads-lines',
        type: 'line',
        source: 'roads',
        'source-layer': 'roads',
        minzoom: 9,
        layout: { visibility: toggleRoads.checked ? 'visible' : 'none' },
        paint: {
          'line-color': '#78909c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 14, 1.2],
          'line-opacity': 0.65,
        },
      });
      map.addLayer({
        id: 'bikelanes-casing',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: 9,
        layout: { visibility: toggleBikelanes.checked ? 'visible' : 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4],
        },
      });
      map.addLayer({
        id: 'bikelanes-lines',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: 9,
        layout: { visibility: toggleBikelanes.checked ? 'visible' : 'none' },
        paint: {
          'line-color': colorScaleById(colorScaleSelect.value).bikelaneColor,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2],
        },
      });
    }

    function colorScaleById(id) {
      return CONFIG.colorScales.find((s) => s.id === id) || CONFIG.colorScales[0];
    }

    function fillColorExpression(minPct, maxPct, scaleId) {
      const scale = colorScaleById(scaleId);
      if (maxPct <= minPct) return scale.mid;
      const mid = (minPct + maxPct) / 2;
      const pct = ['coalesce', ['get', 'bikeSharePct'], 0];
      const clamped = ['max', minPct, ['min', maxPct, pct]];
      return [
        'interpolate',
        ['linear'],
        clamped,
        minPct,
        scale.low,
        mid,
        scale.mid,
        maxPct,
        scale.high,
      ];
    }

    function updateLegendBar(scaleId) {
      const scale = colorScaleById(scaleId);
      legendBar.style.background = scale.legendGradient;
    }

    function updateBikelaneOverlayColor(scaleId) {
      const scale = colorScaleById(scaleId);
      bikelaneSwatch.style.borderColor = scale.bikelaneColor;
      if (map.getLayer('bikelanes-lines')) {
        map.setPaintProperty('bikelanes-lines', 'line-color', scale.bikelaneColor);
      }
    }

    function updateRegionColors(minPct, maxPct) {
      if (!map.getLayer('regions-fill')) return;
      map.setPaintProperty(
        'regions-fill',
        'fill-color',
        fillColorExpression(minPct, maxPct, colorScaleSelect.value),
      );
    }

    function addRegionLayers(geojson, minPct, maxPct, labelMinZoom) {
      lastPctRange = { min: minPct, max: maxPct, scaleCapped: false, dataMax: maxPct };
      updateLegendBar(colorScaleSelect.value);
      updateBikelaneOverlayColor(colorScaleSelect.value);
      if (map.getSource('regions')) {
        map.getSource('regions').setData(geojson);
        updateRegionColors(minPct, maxPct);
      } else {
        map.addSource('regions', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'regions-fill',
          type: 'fill',
          source: 'regions',
          paint: {
            'fill-color': fillColorExpression(minPct, maxPct, colorScaleSelect.value),
            'fill-opacity': 0.78,
          },
        });
        addTileOverlays();
        map.addLayer({
          id: 'regions-outline',
          type: 'line',
          source: 'regions',
          paint: {
            'line-color': '#263238',
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 1.2],
          },
        });
        map.addLayer({
          id: 'regions-labels',
          type: 'symbol',
          source: 'regions',
          minzoom: labelMinZoom,
          layout: { 'text-field': ['get', 'name'], 'text-size': 10 },
          paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
        });
        overlaysBound = true;
        const tooltip = document.getElementById('tooltip');
        map.on('mousemove', 'regions-fill', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          map.getCanvas().style.cursor = 'pointer';
          tooltip.style.display = 'block';
          tooltip.textContent = f.properties.label;
          tooltip.style.left = e.point.x + 12 + 'px';
          tooltip.style.top = e.point.y + 12 + 'px';
        });
        map.on('mouseleave', 'regions-fill', () => {
          map.getCanvas().style.cursor = '';
          tooltip.style.display = 'none';
        });
      }
      updateOverlayVisibility();
    }

    function applyView(viewId) {
      currentView = viewId;
      const filtered = filterForView(viewId).map(enrichFeature);
      const range = colorScaleRange(filtered);
      const { min, max } = range;
      document.getElementById('legend-min').textContent = min.toFixed(1) + ' %';
      document.getElementById('legend-max').textContent = max.toFixed(1) + ' %';
      lastRankingFeatures = filtered;
      updateRankingVisibility(viewId);
      if (!rankingDetails.hidden) updateRanking(filtered, min, max);
      const geojson = { type: 'FeatureCollection', features: filtered };
      const labelMinZoom =
        viewId === 'bayern-landkreise-kreisfreie' ||
        viewId === 'bayern-landkreise' ||
        viewId === 'bayern-kreisfreie-staedte'
          ? 8
          : viewId === 'bayern-gemeinden-kreisfreie' || viewId === 'bayern-gemeinden'
            ? 10
            : viewId.startsWith('kreisfrei:')
              ? 10
              : 11;
      const viewMeta = manifest.views.find((v) => v.id === viewId);
      let metaText = (viewMeta?.label || viewId) + ' · ' + filtered.length + ' Gebiete';
      if (range.scaleCapped) {
        metaText +=
          ' · Skala 0–' +
          CONFIG.colorCapPct +
          ' % (max. ' +
          range.dataMax.toFixed(1) +
          ' % = volle Farbe)';
      }
      document.getElementById('view-meta').textContent = metaText;
      updateScaleCapHint(viewId);

      const run = () => {
        addRegionLayers(geojson, min, max, labelMinZoom);
        const bbox = turf.bbox(geojson);
        if (bbox.every(Number.isFinite)) {
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 48, duration: 0 });
        }
      };
      if (map.isStyleLoaded()) run();
      else map.once('load', run);
    }

    function setBasemap(id) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      map.setStyle(CONFIG.basemapStyles[id]);
      map.once('idle', () => {
        map.jumpTo({ center, zoom });
        overlaysBound = false;
        applyView(currentView);
      });
      const meta = CONFIG.basemapOptions.find((b) => b.id === id);
      basemapHint.textContent = meta?.description || '';
    }

    basemapSelect.addEventListener('change', () => setBasemap(basemapSelect.value));
    colorScaleSelect.addEventListener('change', () => {
      updateLegendBar(colorScaleSelect.value);
      updateBikelaneOverlayColor(colorScaleSelect.value);
      updateRegionColors(lastPctRange.min, lastPctRange.max);
      if (lastRankingFeatures.length && !rankingDetails.hidden) {
        updateRanking(lastRankingFeatures, lastPctRange.min, lastPctRange.max);
      }
    });
    viewSelect.addEventListener('change', () => applyView(viewSelect.value));
    toggleBikelanes.addEventListener('change', updateOverlayVisibility);
    toggleRoads.addEventListener('change', updateOverlayVisibility);
    function updateBasemapHint() {
      const meta = CONFIG.basemapOptions.find((b) => b.id === basemapSelect.value);
      basemapHint.textContent = meta?.description || '';
    }
    updateBasemapHint();

    async function init() {
      try {
        const [statsRes, manifestRes] = await Promise.all([
          fetch(CONFIG.statsUrl),
          fetch(CONFIG.manifestUrl),
        ]);
        if (!statsRes.ok) throw new Error('stats.geojson fehlt – zuerst export-stats-geojson ausführen');
        if (!manifestRes.ok) throw new Error('manifest.json fehlt – buildViewer ausführen');
        const stats = await statsRes.json();
        manifest = await manifestRes.json();
        allFeatures = stats.features || [];
        rawLoaded = true;
        colorScaleSelect.innerHTML = '';
        for (const scale of CONFIG.colorScales) {
          const el = document.createElement('option');
          el.value = scale.id;
          el.textContent = scale.label;
          if (scale.id === CONFIG.defaultColorScale) el.selected = true;
          colorScaleSelect.appendChild(el);
        }
        viewSelect.innerHTML = '';
        const overview = manifest.views.filter((v) => v.group === 'overview');
        const landkreise = manifest.views.filter((v) => v.group === 'landkreis');
        const kreisfreie = manifest.views.filter((v) => v.group === 'kreisfrei');
        for (const v of overview) {
          const el = document.createElement('option');
          el.value = v.id;
          el.textContent = v.label;
          viewSelect.appendChild(el);
        }
        if (landkreise.length) {
          const group = document.createElement('optgroup');
          group.label = 'Landkreise (Gemeinden)';
          for (const v of landkreise) {
            const el = document.createElement('option');
            el.value = v.id;
            el.textContent = v.label;
            group.appendChild(el);
          }
          viewSelect.appendChild(group);
        }
        if (kreisfreie.length) {
          const group = document.createElement('optgroup');
          group.label = 'Kreisfreie Städte';
          for (const v of kreisfreie) {
            const el = document.createElement('option');
            el.value = v.id;
            el.textContent = v.label;
            group.appendChild(el);
          }
          viewSelect.appendChild(group);
        }
        applyUrlOptions();
        applyView(currentView);
      } catch (e) {
        loadError.style.display = 'block';
        loadError.textContent = String(e.message || e);
      }
    }

    init();
  </script>
</body>
</html>
`
}
