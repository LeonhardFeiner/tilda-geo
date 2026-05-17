import { BASEMAP_OPTIONS, buildBasemapStyleJson, DEFAULT_BASEMAP } from './basemaps'
import { COLOR_SCALES, DEFAULT_COLOR_SCALE } from './colorScales'
import {
  BIKE_SHARE_COLOR_CAP_PCT,
  DEFAULT_OVERLAY_BIKELANE_MIN_ZOOM,
  DEFAULT_OVERLAY_ROAD_MIN_ZOOM_FULL,
  DEFAULT_OVERLAY_ROAD_MIN_ZOOM_MAJOR,
  DEFAULT_ROAD_OVERLAY_COLOR,
  OVERLAY_LINE_MIN_ZOOM_LIMITS,
  OVERLAY_ROAD_FULL_MIN_ZOOM_LIMITS,
  TILE_ROAD_RESIDENTIAL_MIN_ZOOM,
  PROJECT_LEAD,
  VIEWER_SOURCE_REPO_URL,
  TILDA_BIKELANES_TILES,
  TILDA_ROADS_TILES,
} from './constants'
import {
  BIKELANE_CLASS_LABELS,
  BIKELANE_CLASS_ORDER,
  RADINFRA_DEFAULT_FILTER,
  ROAD_CLASS_LABELS,
  ROAD_CLASS_ORDER,
} from './statsClassSums'

export function generateViewerHtml(generatedAt: string) {
  const basemapStyles = Object.fromEntries(
    BASEMAP_OPTIONS.map((b) => [b.id, buildBasemapStyleJson(b.id)]),
  )

  const defaultColorScale =
    COLOR_SCALES.find((s) => s.id === DEFAULT_COLOR_SCALE) ?? COLOR_SCALES[0]

  const generatedDateLabel = new Date(generatedAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const config = {
    generatedAt,
    basemap: DEFAULT_BASEMAP,
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
    defaultColorCapPct: BIKE_SHARE_COLOR_CAP_PCT,
    defaultColorCapEnabled: true,
    defaultOverlayColors: {
      bikelane: defaultColorScale.bikelaneColor,
      road: DEFAULT_ROAD_OVERLAY_COLOR,
    },
    defaultOverlayMinZoom: {
      bikelane: DEFAULT_OVERLAY_BIKELANE_MIN_ZOOM,
      roadMajor: DEFAULT_OVERLAY_ROAD_MIN_ZOOM_MAJOR,
      roadFull: DEFAULT_OVERLAY_ROAD_MIN_ZOOM_FULL,
    },
    overlayMinZoomLimits: OVERLAY_LINE_MIN_ZOOM_LIMITS,
    overlayRoadFullMinZoomLimits: OVERLAY_ROAD_FULL_MIN_ZOOM_LIMITS,
    tileRoadResidentialMinZoom: TILE_ROAD_RESIDENTIAL_MIN_ZOOM,
    roadClassOptions: ROAD_CLASS_ORDER.map((id) => ({ id, label: ROAD_CLASS_LABELS[id] })),
    bikelaneClassOptions: BIKELANE_CLASS_ORDER.map((id) => ({
      id,
      label: BIKELANE_CLASS_LABELS[id],
    })),
    radinfraDefaultFilter: RADINFRA_DEFAULT_FILTER,
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
    .panel > summary {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      cursor: pointer; list-style: none; user-select: none;
      font-size: 15px; font-weight: 600; color: #222; margin: 0 0 10px;
    }
    .panel > summary::-webkit-details-marker { display: none; }
    .panel > summary::after {
      content: '▼'; flex-shrink: 0; font-size: 10px; color: #666;
      transition: transform 0.15s ease;
    }
    .panel:not([open]) > summary { margin-bottom: 0; }
    .panel:not([open]) > summary::after { transform: rotate(-90deg); }
    .panel-summary-preview {
      flex: 1; min-width: 0; font-size: 11px; font-weight: normal; color: #666;
      text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .panel-body { margin: 0; }
    @media (max-width: 768px) {
      .panel {
        top: 8px; left: 8px; right: 8px; max-width: none;
        max-height: min(88vh, calc(100vh - 16px));
      }
      .panel:not([open]) { max-height: none; overflow: visible; }
    }
    .panel label { display: block; font-size: 13px; margin: 8px 0 4px; font-weight: 600; }
    .panel select { width: 100%; font-size: 13px; padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; }
    .panel .row { display: flex; flex-wrap: wrap; gap: 12px 16px; margin-top: 8px; }
    .panel .row label { display: flex; align-items: center; gap: 6px; font-weight: normal; margin: 0; cursor: pointer; }
    .hint { font-size: 11px; color: #666; margin-top: 4px; }
    .count-classes, .color-options { margin-top: 8px; }
    .count-classes > summary, .color-options > summary {
      cursor: pointer; font-size: 13px; font-weight: 600; color: #333;
      user-select: none; list-style-position: outside;
    }
    .count-classes[open] > summary, .color-options[open] > summary { margin-bottom: 8px; }
    .class-filters { margin: 8px 0; }
    .class-filters strong { display: block; font-size: 12px; margin-bottom: 4px; }
    .class-filters label {
      display: flex; align-items: flex-start; gap: 6px;
      font-size: 12px; font-weight: normal; margin: 3px 0; cursor: pointer;
    }
    #preset-radinfra {
      margin: 4px 0 8px; font-size: 12px; padding: 4px 8px; cursor: pointer;
    }
    .panel-actions { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
    .panel-actions button {
      width: 100%; font-size: 12px; padding: 6px 10px; cursor: pointer;
      border: 1px solid #ccc; border-radius: 4px; background: #fafafa;
    }
    .panel-actions button:hover:not(:disabled) { background: #f0f0f0; }
    .panel-actions button:disabled { opacity: 0.55; cursor: not-allowed; }
    #copy-view-link-feedback { display: block; margin-top: 4px; color: #2e7d32; }
    #copy-view-link-feedback.is-error { color: #b71c1c; }
    .scale-cap-controls {
      margin: 10px 0 8px; padding-top: 8px; border-top: 1px solid #e8e8e8;
    }
    .scale-cap-controls label {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: normal; margin: 4px 0; cursor: pointer;
    }
    .scale-cap-value {
      display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px;
    }
    .scale-cap-value input[type="number"] {
      width: 4.5em; padding: 3px 6px; border: 1px solid #ccc; border-radius: 4px;
    }
    .scale-cap-value input:disabled { opacity: 0.5; background: #f5f5f5; }
    .overlay-display-controls,
    .overlay-color-controls {
      margin: 10px 0 4px; padding-top: 8px; border-top: 1px solid #e8e8e8;
    }
    .overlay-section-title {
      display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 2px;
    }
    .overlay-color-row {
      display: flex; align-items: center; gap: 10px; margin: 6px 0;
    }
    .overlay-color-row label {
      flex: 1; font-size: 12px; font-weight: normal; margin: 0;
    }
    .overlay-color-row input[type="color"] {
      width: 2.75rem; height: 1.75rem; padding: 2px; border: 1px solid #ccc;
      border-radius: 4px; cursor: pointer; background: #fff;
    }
    .overlay-layer-block { margin-bottom: 10px; }
    .overlay-layer-block:last-child { margin-bottom: 0; }
    .overlay-minzoom-row {
      display: flex; align-items: center; gap: 10px; margin: 4px 0 0;
    }
    .overlay-minzoom-row label {
      flex: 1; font-size: 12px; font-weight: normal; margin: 0;
    }
    .overlay-minzoom-row input[type="number"] {
      width: 4em; padding: 3px 6px; border: 1px solid #ccc; border-radius: 4px;
    }
    .overlay-layer-hint { margin: 2px 0 0; }
    .choropleth-legend { margin-top: 8px; }
    .choropleth-legend-title { font-size: 12px; font-weight: 600; color: #444; display: block; margin-bottom: 4px; }
    .legend-bar { height: 10px; border-radius: 3px; margin: 4px 0; }
    .legend-labels { display: flex; justify-content: space-between; font-size: 12px; color: #555; }
    .map-legend {
      display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center;
      margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd;
    }
    .map-legend label {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: normal; margin: 0; cursor: pointer;
    }
    .swatch { display: inline-block; width: 24px; height: 0; border-top: 3px solid; flex-shrink: 0; }
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
      border-top: 1px solid #eee; line-height: 1.55;
    }
    .footer a { color: #1565c0; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    #tooltip {
      position: absolute; z-index: 3; pointer-events: none; display: none;
      padding: 6px 8px; border-radius: 4px; background: rgba(0,0,0,0.85); color: #fff; font-size: 12px; max-width: 320px;
      white-space: pre-line;
    }
    #load-error { color: #b71c1c; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <details class="panel" id="panel-main" open>
    <summary>
      <span>Steuerung & Legende</span>
      <span class="panel-summary-preview" id="panel-summary-preview"></span>
    </summary>
    <div class="panel-body">
    <p id="load-error"></p>
    <label for="view-select">Gebiet</label>
    <select id="view-select"></select>
    <p class="view-meta" id="view-meta"></p>
    <div class="choropleth-legend">
      <span class="choropleth-legend-title">Flächenfarbe (Radinfra-Anteil)</span>
      <div class="legend-bar" id="legend-bar"></div>
      <div class="legend-labels"><span id="legend-min"></span><span id="legend-max"></span></div>
    </div>
    <details class="count-classes" id="count-classes-details">
          <summary>Zählung: Straßen- & Radinfra-Klassen</summary>
          <p class="hint">Welche Klassen in den Anteil Radinfra an Straßen (km) einfließen.</p>
          <button type="button" id="preset-radinfra">Radinfra.de-Standard</button>
          <div class="class-filters" id="road-class-filters">
            <strong>Straßen</strong>
          </div>
          <div class="class-filters" id="bikelane-class-filters">
            <strong>Radinfrastruktur</strong>
          </div>
    </details>
    <details class="color-options" id="color-options-details">
      <summary>Farben & Darstellung</summary>
      <label for="basemap-select">Hintergrundkarte</label>
      <select id="basemap-select"></select>
      <p class="hint" id="basemap-hint"></p>
      <label for="color-scale-select">Farbskala (Flächen)</label>
      <select id="color-scale-select"></select>
      <div class="scale-cap-controls">
        <label><input type="checkbox" id="scale-cap-enabled" /> Farbskala kappen</label>
        <div class="scale-cap-value">
          <label for="scale-cap-pct">Obergrenze</label>
          <input type="number" id="scale-cap-pct" min="5" max="500" step="5" value="${BIKE_SHARE_COLOR_CAP_PCT}" />
          <span>%</span>
        </div>
        <p class="hint" id="scale-cap-hint" hidden></p>
      </div>
      <div class="overlay-display-controls">
        <span class="overlay-section-title">Darstellung (Zoomstufen)</span>
        <div class="overlay-minzoom-row">
            <label for="overlay-bikelane-minzoom">Radwege – ab Zoomstufe</label>
            <input
              type="number"
              id="overlay-bikelane-minzoom"
              min="${OVERLAY_LINE_MIN_ZOOM_LIMITS.min}"
              max="${OVERLAY_LINE_MIN_ZOOM_LIMITS.max}"
              step="1"
              value="${DEFAULT_OVERLAY_BIKELANE_MIN_ZOOM}"
            />
          </div>
          <p class="hint overlay-layer-hint">Radwege erst nach starkem Zoom sichtbar.</p>
        <div class="overlay-minzoom-row">
            <label for="overlay-road-minzoom-major">Straßen – ab Zoomstufe (Hauptstraßen)</label>
            <input
              type="number"
              id="overlay-road-minzoom-major"
              min="${OVERLAY_LINE_MIN_ZOOM_LIMITS.min}"
              max="${OVERLAY_LINE_MIN_ZOOM_LIMITS.max}"
              step="1"
              value="${DEFAULT_OVERLAY_ROAD_MIN_ZOOM_MAJOR}"
            />
          </div>
          <p class="hint overlay-layer-hint">Hauptstraßen (Autobahn bis Kreisstraße); in den Kacheln ab niedrigem Zoom verfügbar.</p>
        <div class="overlay-minzoom-row">
            <label for="overlay-road-minzoom-full">Straßen – vollständig ab Zoomstufe</label>
            <input
              type="number"
              id="overlay-road-minzoom-full"
              min="${OVERLAY_ROAD_FULL_MIN_ZOOM_LIMITS.min}"
              max="${OVERLAY_ROAD_FULL_MIN_ZOOM_LIMITS.max}"
              step="1"
              value="${DEFAULT_OVERLAY_ROAD_MIN_ZOOM_FULL}"
            />
          </div>
          <p class="hint overlay-layer-hint">Inkl. Wohn- und Erschließungsstraßen. In den Kacheln erst ab Zoomstufe ${TILE_ROAD_RESIDENTIAL_MIN_ZOOM} (TILDA-Verarbeitung) – niedrigere Werte sind nicht möglich.</p>
      </div>
      <div class="overlay-color-controls">
        <span class="overlay-section-title">Linienfarbe (Vordergrund)</span>
        <div class="overlay-color-row">
          <label for="overlay-bikelane-color">Radwege</label>
          <input type="color" id="overlay-bikelane-color" value="${defaultColorScale.bikelaneColor}" />
        </div>
        <div class="overlay-color-row">
          <label for="overlay-road-color">Straßen</label>
          <input type="color" id="overlay-road-color" value="${DEFAULT_ROAD_OVERLAY_COLOR}" />
        </div>
      </div>
    </details>
    <div class="map-legend">
      <label>
        <input type="checkbox" id="toggle-bikelanes" checked />
        <span class="swatch" id="bikelane-swatch"></span>
        Radwege
      </label>
      <label>
        <input type="checkbox" id="toggle-roads" />
        <span class="swatch" id="road-swatch"></span>
        Straßen
      </label>
    </div>
    <details class="ranking" id="ranking-details">
        <summary>Rangliste <span class="ranking-hint" id="ranking-summary"></span></summary>
        <ol class="ranking-list" id="ranking-list"></ol>
    </details>
    <div class="panel-actions">
      <button type="button" id="download-view-data" disabled>Daten des Gebiets herunterladen</button>
      <button type="button" id="copy-view-link" disabled>Link zur aktuellen Ansicht kopieren</button>
      <span id="copy-view-link-feedback" hidden></span>
    </div>
    <p class="footer">
      Erstellt am ${generatedDateLabel} ·
      Daten: © <a href="https://www.openstreetmap.org/copyright?locale=de" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a>
      (<a href="https://www.openstreetmap.org/copyright?locale=de" target="_blank" rel="noopener noreferrer">ODbL</a>) ·
      basierend auf dem <a href="${VIEWER_SOURCE_REPO_URL}" target="_blank" rel="noopener noreferrer">Fork von tilda-geo</a> ·
      erstellt von ${PROJECT_LEAD}
    </p>
    </div>
  </details>
  <div id="tooltip"></div>
  <script src="./statsClassSums.js"></script>
  <script src="https://unpkg.com/@turf/turf@7.2.0/turf.min.js"></script>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const CONFIG = ${JSON.stringify(config)};

    let allFeatures = [];
    let manifest = { views: [] };
    let rawLoaded = false;
    let currentView = CONFIG.defaultView;
    let overlaysBound = false;

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
    const roadSwatch = document.getElementById('road-swatch');
    const overlayBikelaneColorInput = document.getElementById('overlay-bikelane-color');
    const overlayRoadColorInput = document.getElementById('overlay-road-color');
    const overlayBikelaneMinzoomInput = document.getElementById('overlay-bikelane-minzoom');
    const overlayRoadMinzoomMajorInput = document.getElementById('overlay-road-minzoom-major');
    const overlayRoadMinzoomFullInput = document.getElementById('overlay-road-minzoom-full');
    const scaleCapHint = document.getElementById('scale-cap-hint');
    const scaleCapEnabledCb = document.getElementById('scale-cap-enabled');
    const scaleCapPctInput = document.getElementById('scale-cap-pct');
    const downloadViewDataBtn = document.getElementById('download-view-data');
    const copyViewLinkBtn = document.getElementById('copy-view-link');
    const copyViewLinkFeedback = document.getElementById('copy-view-link-feedback');
    const panelMain = document.getElementById('panel-main');
    const panelSummaryPreview = document.getElementById('panel-summary-preview');
    const panelMobileMq = window.matchMedia('(max-width: 768px)');
    scaleCapPctInput.value = String(CONFIG.defaultColorCapPct);
    scaleCapEnabledCb.checked = false;
    let lastScaleCapViewAllowed = false;
    let lastRankingViewAvailable = false;
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

    let lengthClassFilter = structuredClone(CONFIG.radinfraDefaultFilter);

    function readLengthClassFilterFromUi() {
      const road = {};
      const bikelane = {};
      for (const opt of CONFIG.roadClassOptions) {
        const el = document.querySelector('[data-road-class="' + opt.id + '"]');
        road[opt.id] = el ? el.checked : false;
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        const el = document.querySelector('[data-bikelane-class="' + opt.id + '"]');
        bikelane[opt.id] = el ? el.checked : false;
      }
      return { road, bikelane };
    }

    function applyLengthClassFilterToUi(filter) {
      for (const opt of CONFIG.roadClassOptions) {
        const el = document.querySelector('[data-road-class="' + opt.id + '"]');
        if (el) el.checked = !!filter.road[opt.id];
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        const el = document.querySelector('[data-bikelane-class="' + opt.id + '"]');
        if (el) el.checked = !!filter.bikelane[opt.id];
      }
    }

    function onLengthClassFilterChange() {
      lengthClassFilter = readLengthClassFilterFromUi();
      updateOverlayLayerFilters();
      if (rawLoaded) repaintRegionsFromCounting();
    }

    function initCountClassFilters() {
      const roadRoot = document.getElementById('road-class-filters');
      const bikeRoot = document.getElementById('bikelane-class-filters');
      for (const opt of CONFIG.roadClassOptions) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.roadClass = opt.id;
        input.checked = !!CONFIG.radinfraDefaultFilter.road[opt.id];
        input.addEventListener('change', onLengthClassFilterChange);
        label.append(input, document.createTextNode(' ' + opt.label));
        roadRoot.appendChild(label);
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.bikelaneClass = opt.id;
        input.checked = !!CONFIG.radinfraDefaultFilter.bikelane[opt.id];
        input.addEventListener('change', onLengthClassFilterChange);
        label.append(input, document.createTextNode(' ' + opt.label));
        bikeRoot.appendChild(label);
      }
      document.getElementById('preset-radinfra').addEventListener('click', () => {
        lengthClassFilter = structuredClone(CONFIG.radinfraDefaultFilter);
        applyLengthClassFilterToUi(lengthClassFilter);
        updateOverlayLayerFilters();
        if (rawLoaded) repaintRegionsFromCounting();
      });
    }

    initCountClassFilters();

    function enrichFeature(f) {
      const p = f.properties || {};
      const { roadKm: road, bikeKm: bike } = TildaStats.computeFilteredLengths(
        p.road_length,
        p.bikelane_length,
        lengthClassFilter,
      );
      const pct = road > 0 ? (bike / road) * 100 : null;
      return {
        type: 'Feature',
        id: p.id,
        geometry: f.geometry,
        properties: {
          ...p,
          roadSumKm: road,
          bikelaneSumKm: bike,
          bikeSharePct: pct != null ? pct : 0,
          label:
            (p.name || p.id) +
            ': ' +
            (pct != null ? formatUiPct(pct) : '–') +
            ' %\\n' +
            TildaStats.formatStatKm(bike, TildaStats.STAT_KM_BIKE_UI_DECIMALS) +
            ' km / ' +
            TildaStats.formatStatKm(road, TildaStats.STAT_KM_ROAD_UI_DECIMALS) +
            ' km',
        },
      };
    }

    function buildRegionGeojson(features) {
      return { type: 'FeatureCollection', features };
    }

    function slugifyFilenamePart(text) {
      return (
        String(text)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || 'gebiet'
      );
    }

    function downloadFilenameForView(viewId) {
      const viewMeta = manifest.views.find((v) => v.id === viewId);
      const label = viewMeta?.label || viewId;
      return 'radinfra-' + slugifyFilenamePart(label) + '.csv';
    }

    function lengthRecordForStats(value) {
      if (value == null) return {};
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
        } catch {
          return {};
        }
      }
      if (typeof value === 'object' && !Array.isArray(value)) return value;
      return {};
    }

    const CSV_SEP = ';';

    function formatUiPct(value) {
      return TildaStats.formatStatPctUi(value);
    }

    function csvEscape(value) {
      if (value == null || value === '') return '';
      const s = String(value);
      if (
        s.includes('"') ||
        s.includes(CSV_SEP) ||
        s.includes('\\n') ||
        s.includes('\\r')
      ) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    function formatCsvStatValue(raw, kind) {
      if (raw === '' || raw == null) return '';
      const n = Number(raw);
      if (!Number.isFinite(n)) return String(raw);
      if (kind === 'pct') return TildaStats.formatStatPct(n);
      if (kind === 'km') return TildaStats.formatStatKm(n);
      return String(raw);
    }

    function csvStatColumns() {
      const cols = [
        { key: 'id', header: 'OSM-ID', numeric: false },
        { key: 'name', header: 'Name', numeric: false },
        { key: 'level', header: 'Verwaltungsebene', numeric: false },
        { key: 'bundesland_id', header: 'Bundesland-ID', numeric: false },
        { key: 'landkreis_id', header: 'Landkreis-ID', numeric: false },
        { key: 'road_km', header: 'Straßen (km)', numeric: 'km' },
        { key: 'bikelane_km', header: 'Radinfra (km)', numeric: 'km' },
        { key: 'bike_share_pct', header: 'Radinfra-Anteil (%)', numeric: 'pct' },
      ];
      for (const opt of CONFIG.roadClassOptions) {
        cols.push({
          key: 'road_km_' + opt.id,
          header: 'Straßen: ' + opt.label + ' (km)',
          numeric: 'km',
        });
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        cols.push({
          key: 'bikelane_km_' + opt.id,
          header: 'Radinfra: ' + opt.label + ' (km)',
          numeric: 'km',
        });
      }
      return cols;
    }

    function statsRowFromFeature(f) {
      const p = f.properties || {};
      const roadKm = p.roadSumKm ?? 0;
      const bikeKm = p.bikelaneSumKm ?? 0;
      const roadSums = TildaStats.getRoadSums(lengthRecordForStats(p.road_length));
      const bikeSums = TildaStats.getBikelaneSums(lengthRecordForStats(p.bikelane_length));
      const row = {
        id: p.id ?? '',
        name: p.name ?? '',
        level: p.level ?? '',
        bundesland_id: p.bundesland_id ?? '',
        landkreis_id: p.landkreis_id ?? '',
        road_km: roadKm,
        bikelane_km: bikeKm,
        bike_share_pct: roadKm > 0 ? (bikeKm / roadKm) * 100 : '',
      };
      for (const opt of CONFIG.roadClassOptions) {
        row['road_km_' + opt.id] = roadSums[opt.id] ?? 0;
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        row['bikelane_km_' + opt.id] = bikeSums[opt.id] ?? 0;
      }
      return row;
    }

    function buildStatsCsv(features) {
      const columns = csvStatColumns();
      const header = columns.map((c) => csvEscape(c.header)).join(CSV_SEP);
      const lines = features.map((f) => {
        const row = statsRowFromFeature(f);
        return columns
          .map((c) => {
            const raw = row[c.key];
            const formatted = c.numeric ? formatCsvStatValue(raw, c.numeric) : raw;
            return csvEscape(formatted);
          })
          .join(CSV_SEP);
      });
      return '\\uFEFF' + header + '\\n' + lines.join('\\n') + '\\n';
    }

    function currentViewFeaturesForExport() {
      lengthClassFilter = readLengthClassFilterFromUi();
      return filterForView(currentView).map(enrichFeature);
    }

    function downloadCurrentViewData() {
      if (!rawLoaded) return;
      const features = currentViewFeaturesForExport();
      if (!features.length) {
        showCopyViewLinkFeedback('Keine Gebiete in dieser Ansicht.', true);
        return;
      }
      const csv = buildStatsCsv(features);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFilenameForView(currentView);
      link.click();
      URL.revokeObjectURL(url);
    }

    function setPanelActionsEnabled(enabled) {
      downloadViewDataBtn.disabled = !enabled;
      copyViewLinkBtn.disabled = !enabled;
    }

    function updateLegendRange(min, max) {
      document.getElementById('legend-min').textContent = formatUiPct(min) + ' %';
      document.getElementById('legend-max').textContent = formatUiPct(max) + ' %';
    }

    function updateViewMetaText(viewId, filtered, range) {
      const viewMeta = manifest.views.find((v) => v.id === viewId);
      let metaText = (viewMeta?.label || viewId) + ' · ' + filtered.length + ' Gebiete';
      if (range.scaleCapped) {
        metaText +=
          ' · Skala 0–' +
          range.capPct +
          ' % (max. ' +
          formatUiPct(range.dataMax) +
          ' % = volle Farbe)';
      }
      document.getElementById('view-meta').textContent = metaText;
      updateScaleCapHint(viewId);
    }

    function repaintRegionsFromCounting() {
      const filtered = filterForView(currentView).map(enrichFeature);
      const range = colorScaleRange(filtered);
      const { min, max } = range;
      lastPctRange = { min, max, scaleCapped: range.scaleCapped, dataMax: range.dataMax };
      updateLegendRange(min, max);
      lastRankingFeatures = filtered;
      if (!rankingDetails.hidden) updateRanking(filtered, min, max);
      updateViewMetaText(currentView, filtered, range);
      const geojson = buildRegionGeojson(filtered);
      const src = map.getSource('regions');
      if (src) {
        src.setData(geojson);
        updateRegionColors(min, max);
        map.triggerRepaint();
      } else if (rawLoaded) {
        applyView(currentView);
      }
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

    function defaultScaleCapEnabledForView(viewId) {
      return viewShowsAllGemeinden(viewId) ? CONFIG.defaultColorCapEnabled : false;
    }

    function getScaleCapSettings() {
      const capPct = Math.max(
        5,
        Math.min(500, Number(scaleCapPctInput.value) || CONFIG.defaultColorCapPct),
      );
      return { enabled: scaleCapEnabledCb.checked, capPct };
    }

    function updateScaleCapDefaultForView(viewId) {
      const gemeindenOverview = viewShowsAllGemeinden(viewId);
      if (gemeindenOverview && !lastScaleCapViewAllowed) {
        scaleCapEnabledCb.checked = CONFIG.defaultColorCapEnabled;
      } else if (!gemeindenOverview && lastScaleCapViewAllowed) {
        scaleCapEnabledCb.checked = false;
      }
      lastScaleCapViewAllowed = gemeindenOverview;
      syncScaleCapInputState();
      updateScaleCapHint(viewId);
    }

    function syncScaleCapInputState() {
      scaleCapPctInput.disabled = !scaleCapEnabledCb.checked;
    }

    function onScaleCapChange() {
      syncScaleCapInputState();
      if (rawLoaded) applyView(currentView);
    }

    scaleCapEnabledCb.addEventListener('change', onScaleCapChange);
    scaleCapPctInput.addEventListener('change', onScaleCapChange);
    scaleCapPctInput.addEventListener('input', onScaleCapChange);

    function colorScaleRange(features) {
      const vals = features
        .map((f) => f.properties?.bikeSharePct)
        .filter((v) => typeof v === 'number');
      const { enabled, capPct } = getScaleCapSettings();
      if (!vals.length) {
        return { min: 0, max: 20, dataMin: 0, dataMax: 20, scaleCapped: false, capPct };
      }
      const dataMin = Math.min(...vals);
      const dataMax = Math.max(...vals);
      const scaleCapped = enabled && dataMax > capPct;
      const max = scaleCapped ? capPct : dataMax;
      return { min: 0, max, dataMin, dataMax, scaleCapped, capPct };
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

    updateScaleCapDefaultForView(CONFIG.defaultView);

    function updateRankingVisibility(viewId) {
      const available = !viewShowsAllGemeinden(viewId);
      rankingDetails.hidden = !available;
      if (!available) {
        rankingDetails.open = false;
        document.getElementById('ranking-list').replaceChildren();
        document.getElementById('ranking-summary').textContent = '';
      } else if (available && !lastRankingViewAvailable) {
        rankingDetails.open = true;
      }
      lastRankingViewAvailable = available;
    }

    function updateScaleCapHint(viewId) {
      const { enabled, capPct } = getScaleCapSettings();
      if (!viewShowsGemeinden(viewId) || !enabled) {
        scaleCapHint.hidden = true;
        scaleCapHint.textContent = '';
        return;
      }
      scaleCapHint.hidden = false;
      scaleCapHint.textContent =
        'Bei Gemeinden endet die Farbskala bei ' +
        capPct +
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
        pctEl.textContent = formatUiPct(pct) + ' %';
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

    function updatePanelSummaryPreview(viewId) {
      if (!panelSummaryPreview) return;
      const v = viewId ?? currentView;
      const viewMeta = manifest.views.find((item) => item.id === v);
      panelSummaryPreview.textContent = viewMeta?.label || v;
    }

    function notifyMapResize() {
      requestAnimationFrame(() => map.resize());
    }

    function syncPanelDrawerForViewport() {
      if (!panelMain) return;
      if (panelMobileMq.matches && !panelMain.dataset.userToggled) {
        panelMain.open = false;
      } else if (!panelMobileMq.matches) {
        panelMain.open = true;
      }
    }

    if (panelMain) {
      panelMain.addEventListener('toggle', () => {
        panelMain.dataset.userToggled = '1';
        notifyMapResize();
      });
      panelMobileMq.addEventListener('change', () => {
        delete panelMain.dataset.userToggled;
        syncPanelDrawerForViewport();
        notifyMapResize();
      });
      syncPanelDrawerForViewport();
    }

    function urlParams() {
      return new URLSearchParams(location.search);
    }

    function parseBoolParam(value, defaultValue) {
      if (value == null || value === '') return defaultValue;
      const v = value.toLowerCase();
      if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
      return true;
    }

    function parseHexColorParam(value) {
      if (value == null || value === '') return null;
      const v = value.startsWith('#') ? value : '#' + value;
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
      return v.toLowerCase();
    }

    function hexColorWithoutHash(value) {
      return value.replace(/^#/, '').toLowerCase();
    }

    function lengthClassFiltersEqual(a, b) {
      for (const opt of CONFIG.roadClassOptions) {
        if (!!a.road[opt.id] !== !!b.road[opt.id]) return false;
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        if (!!a.bikelane[opt.id] !== !!b.bikelane[opt.id]) return false;
      }
      return true;
    }

    function enabledClassIds(filter, kind) {
      const options = kind === 'road' ? CONFIG.roadClassOptions : CONFIG.bikelaneClassOptions;
      return options.filter((opt) => filter[kind][opt.id]).map((opt) => opt.id);
    }

    function applyLengthClassFilterFromUrl(params) {
      const roadParam = params.get('roadClasses');
      const bikeParam = params.get('bikelaneClasses');
      if (roadParam == null && bikeParam == null) return false;
      const filter = structuredClone(CONFIG.radinfraDefaultFilter);
      if (roadParam != null) {
        const enabled = new Set(roadParam.split(',').map((s) => s.trim()).filter(Boolean));
        for (const opt of CONFIG.roadClassOptions) {
          filter.road[opt.id] = enabled.has(opt.id);
        }
      }
      if (bikeParam != null) {
        const enabled = new Set(bikeParam.split(',').map((s) => s.trim()).filter(Boolean));
        for (const opt of CONFIG.bikelaneClassOptions) {
          filter.bikelane[opt.id] = enabled.has(opt.id);
        }
      }
      lengthClassFilter = filter;
      applyLengthClassFilterToUi(lengthClassFilter);
      return true;
    }

    function buildShareUrl() {
      const filter = readLengthClassFilterFromUi();
      lengthClassFilter = filter;
      const params = new URLSearchParams();
      const view = viewSelect.value;
      if (view && view !== CONFIG.defaultView) params.set('view', view);
      if (basemapSelect.value !== CONFIG.basemap) params.set('basemap', basemapSelect.value);
      if (!toggleBikelanes.checked) params.set('radwege', '0');
      if (toggleRoads.checked) params.set('strassen', '1');
      if (rankingDetails.open && !rankingDetails.hidden) params.set('ranking', 'open');
      if (colorScaleSelect.value !== CONFIG.defaultColorScale) {
        params.set('colors', colorScaleSelect.value);
      }
      const { enabled, capPct } = getScaleCapSettings();
      const defaultCapEnabled = defaultScaleCapEnabledForView(view);
      if (capPct !== CONFIG.defaultColorCapPct) params.set('cap', String(capPct));
      if (enabled !== defaultCapEnabled) {
        params.set('capEnabled', enabled ? '1' : '0');
      }
      const scaleBike = bikelaneColorForScale(colorScaleSelect.value).toLowerCase();
      const bikeHex = overlayBikelaneColorInput.value.toLowerCase();
      if (bikeHex !== scaleBike) params.set('radfarbe', hexColorWithoutHash(bikeHex));
      const roadHex = overlayRoadColorInput.value.toLowerCase();
      if (roadHex !== CONFIG.defaultOverlayColors.road.toLowerCase()) {
        params.set('strassenfarbe', hexColorWithoutHash(roadHex));
      }
      const { bikelane: bikeMinZ, roadMajor, roadFull } = overlayMinZoomFromInputs();
      if (bikeMinZ !== CONFIG.defaultOverlayMinZoom.bikelane) {
        params.set('radwegeMinZoom', String(bikeMinZ));
      }
      if (roadMajor !== CONFIG.defaultOverlayMinZoom.roadMajor) {
        params.set('strassenMinZoomMajor', String(roadMajor));
      }
      if (roadFull !== CONFIG.defaultOverlayMinZoom.roadFull) {
        params.set('strassenMinZoomFull', String(roadFull));
      }
      if (!lengthClassFiltersEqual(filter, CONFIG.radinfraDefaultFilter)) {
        const roads = enabledClassIds(filter, 'road');
        const bikes = enabledClassIds(filter, 'bikelane');
        if (roads.length) params.set('roadClasses', roads.join(','));
        if (bikes.length) params.set('bikelaneClasses', bikes.join(','));
      }
      const qs = params.toString();
      return location.origin + location.pathname + (qs ? '?' + qs : '');
    }

    let copyViewLinkFeedbackTimer = null;

    function showCopyViewLinkFeedback(message, isError) {
      copyViewLinkFeedback.textContent = message;
      copyViewLinkFeedback.hidden = false;
      copyViewLinkFeedback.classList.toggle('is-error', !!isError);
      if (copyViewLinkFeedbackTimer) clearTimeout(copyViewLinkFeedbackTimer);
      copyViewLinkFeedbackTimer = setTimeout(() => {
        copyViewLinkFeedback.hidden = true;
        copyViewLinkFeedback.classList.remove('is-error');
      }, 2500);
    }

    function copyTextFallback(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }

    async function copyShareLink() {
      const url = buildShareUrl();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else if (!copyTextFallback(url)) {
          throw new Error('copy failed');
        }
        showCopyViewLinkFeedback('Link kopiert.');
      } catch {
        showCopyViewLinkFeedback('Kopieren fehlgeschlagen.', true);
      }
    }

    function bikelaneColorForScale(scaleId) {
      return colorScaleById(scaleId).bikelaneColor;
    }

    function clampOverlayMinZoom(value, fallback, limits = CONFIG.overlayMinZoomLimits) {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(limits.min, Math.min(limits.max, Math.round(n)));
    }

    function overlayMinZoomFromInputs() {
      let roadMajor = clampOverlayMinZoom(
        overlayRoadMinzoomMajorInput.value,
        CONFIG.defaultOverlayMinZoom.roadMajor,
      );
      let roadFull = clampOverlayMinZoom(
        overlayRoadMinzoomFullInput.value,
        CONFIG.defaultOverlayMinZoom.roadFull,
        CONFIG.overlayRoadFullMinZoomLimits,
      );
      if (roadFull < roadMajor) roadFull = roadMajor;
      return {
        bikelane: clampOverlayMinZoom(
          overlayBikelaneMinzoomInput.value,
          CONFIG.defaultOverlayMinZoom.bikelane,
        ),
        roadMajor,
        roadFull,
      };
    }

    function syncOverlayMinZoomInputs() {
      const { bikelane, roadMajor, roadFull } = overlayMinZoomFromInputs();
      overlayBikelaneMinzoomInput.value = String(bikelane);
      overlayRoadMinzoomMajorInput.value = String(roadMajor);
      overlayRoadMinzoomFullInput.value = String(roadFull);
    }

    function overlayMinZoomOpacityExpr(threshold) {
      return ['step', ['zoom'], 0, threshold, 0.65];
    }

    function applyOverlayMinZoom() {
      const { bikelane, roadMajor, roadFull } = overlayMinZoomFromInputs();
      syncOverlayMinZoomInputs();
      const bikeOpacity = overlayMinZoomOpacityExpr(bikelane);
      const majorOpacity = overlayMinZoomOpacityExpr(roadMajor);
      const fullOpacity = overlayMinZoomOpacityExpr(roadFull);
      if (map.getLayer('bikelanes-lines')) {
        map.setPaintProperty('bikelanes-lines', 'line-opacity', bikeOpacity);
        map.setPaintProperty('bikelanes-casing', 'line-opacity', bikeOpacity);
      }
      if (map.getLayer('roads-lines-major')) {
        map.setPaintProperty('roads-lines-major', 'line-opacity', majorOpacity);
      }
      if (map.getLayer('roads-lines-residential')) {
        map.setPaintProperty('roads-lines-residential', 'line-opacity', fullOpacity);
      }
      map.triggerRepaint();
    }

    function applyOverlayLineColors() {
      const bikeColor = overlayBikelaneColorInput.value;
      const roadColor = overlayRoadColorInput.value;
      bikelaneSwatch.style.borderColor = bikeColor;
      roadSwatch.style.borderColor = roadColor;
      if (map.getLayer('bikelanes-lines')) {
        map.setPaintProperty('bikelanes-lines', 'line-color', bikeColor);
      }
      if (map.getLayer('roads-lines-major')) {
        map.setPaintProperty('roads-lines-major', 'line-color', roadColor);
      }
      if (map.getLayer('roads-lines-residential')) {
        map.setPaintProperty('roads-lines-residential', 'line-color', roadColor);
      }
    }

    function syncOverlayColorInputsFromScale(scaleId) {
      overlayBikelaneColorInput.value = bikelaneColorForScale(scaleId);
    }

    function initOverlayColorInputs() {
      overlayBikelaneColorInput.value = CONFIG.defaultOverlayColors.bikelane;
      overlayRoadColorInput.value = CONFIG.defaultOverlayColors.road;
      overlayBikelaneMinzoomInput.value = String(CONFIG.defaultOverlayMinZoom.bikelane);
      overlayRoadMinzoomMajorInput.value = String(CONFIG.defaultOverlayMinZoom.roadMajor);
      overlayRoadMinzoomFullInput.value = String(CONFIG.defaultOverlayMinZoom.roadFull);
      applyOverlayLineColors();
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
      if (!viewShowsAllGemeinden(viewId)) {
        if (ranking != null && ranking !== '') {
          rankingDetails.open = parseBoolParam(ranking, true) || ranking === 'open';
        } else {
          rankingDetails.open = true;
        }
        lastRankingViewAvailable = true;
      }

      const colors = params.get('colors') ?? params.get('palette') ?? params.get('farbskala');
      let scaleFromUrl = null;
      if (colors && CONFIG.colorScales.some((s) => s.id === colors)) {
        colorScaleSelect.value = colors;
        scaleFromUrl = colors;
      }

      const cap = params.get('cap') ?? params.get('kappung');
      if (cap != null && cap !== '') {
        const capNum = Number(cap);
        if (Number.isFinite(capNum)) scaleCapPctInput.value = String(capNum);
      }
      const capEnabled = params.get('capEnabled') ?? params.get('kappungEnabled');
      if (capEnabled != null && capEnabled !== '') {
        scaleCapEnabledCb.checked = parseBoolParam(
          capEnabled,
          defaultScaleCapEnabledForView(viewId),
        );
        lastScaleCapViewAllowed = viewShowsAllGemeinden(viewId);
      } else {
        updateScaleCapDefaultForView(viewId);
      }
      syncScaleCapInputState();

      applyLengthClassFilterFromUrl(params);

      const radfarbe =
        params.get('radfarbe') ?? params.get('radwegeFarbe') ?? params.get('bikelaneColor');
      const radParsed = parseHexColorParam(radfarbe);
      if (radParsed) overlayBikelaneColorInput.value = radParsed;
      else if (scaleFromUrl) syncOverlayColorInputsFromScale(scaleFromUrl);

      const strassenfarbe =
        params.get('strassenfarbe') ?? params.get('strassenFarbe') ?? params.get('roadColor');
      const roadParsed = parseHexColorParam(strassenfarbe);
      if (roadParsed) overlayRoadColorInput.value = roadParsed;

      const radwegeMinZoom =
        params.get('radwegeMinZoom') ?? params.get('bikelaneMinZoom') ?? params.get('radwegeMinzoom');
      if (radwegeMinZoom != null && radwegeMinZoom !== '') {
        overlayBikelaneMinzoomInput.value = String(
          clampOverlayMinZoom(radwegeMinZoom, CONFIG.defaultOverlayMinZoom.bikelane),
        );
      }
      const strassenMinZoomMajor =
        params.get('strassenMinZoomMajor') ??
        params.get('strassenMinZoom') ??
        params.get('roadMinZoom') ??
        params.get('strassenMinzoom');
      if (strassenMinZoomMajor != null && strassenMinZoomMajor !== '') {
        overlayRoadMinzoomMajorInput.value = String(
          clampOverlayMinZoom(strassenMinZoomMajor, CONFIG.defaultOverlayMinZoom.roadMajor),
        );
      }
      const strassenMinZoomFull =
        params.get('strassenMinZoomFull') ?? params.get('strassenMinZoomVoll');
      if (strassenMinZoomFull != null && strassenMinZoomFull !== '') {
        overlayRoadMinzoomFullInput.value = String(
          clampOverlayMinZoom(
            strassenMinZoomFull,
            CONFIG.defaultOverlayMinZoom.roadFull,
            CONFIG.overlayRoadFullMinZoomLimits,
          ),
        );
      }

      updateBasemapHint();
      updateLegendBar(colorScaleSelect.value);
      applyOverlayLineColors();
      applyOverlayMinZoom();
    }

    function setLayerVisibility(id, visible) {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }

    function updateOverlayLayerFilters() {
      if (
        !map.getLayer('roads-lines-major') &&
        !map.getLayer('roads-lines-residential') &&
        !map.getLayer('bikelanes-lines')
      ) {
        return;
      }
      const roadMajorFilter = TildaStats.maplibrePropertyInFilter(
        'road',
        TildaStats.enabledMajorRoadHighwayTags(lengthClassFilter),
      );
      const roadResidentialFilter = TildaStats.maplibrePropertyInFilter(
        'road',
        TildaStats.enabledResidentialRoadHighwayTags(lengthClassFilter),
      );
      const bikeFilter = TildaStats.maplibrePropertyInFilter(
        'category',
        TildaStats.enabledBikelaneCategoryTags(lengthClassFilter),
      );
      if (map.getLayer('roads-lines-major')) map.setFilter('roads-lines-major', roadMajorFilter);
      if (map.getLayer('roads-lines-residential')) {
        map.setFilter('roads-lines-residential', roadResidentialFilter);
      }
      if (map.getLayer('bikelanes-lines')) map.setFilter('bikelanes-lines', bikeFilter);
      if (map.getLayer('bikelanes-casing')) map.setFilter('bikelanes-casing', bikeFilter);
    }

    function updateOverlayVisibility() {
      setLayerVisibility('bikelanes-casing', toggleBikelanes.checked);
      setLayerVisibility('bikelanes-lines', toggleBikelanes.checked);
      setLayerVisibility('roads-lines-major', toggleRoads.checked);
      setLayerVisibility('roads-lines-residential', toggleRoads.checked);
      updateOverlayLayerFilters();
    }

    function addTileOverlays() {
      if (map.getSource('bikelanes')) {
        applyOverlayMinZoom();
        updateOverlayLayerFilters();
        return;
      }
      const overlayMinZoom = overlayMinZoomFromInputs();
      const layerMinZoom = CONFIG.overlayMinZoomLimits.min;
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
      const roadPaint = (minZoomThreshold) => ({
        'line-color': overlayRoadColorInput.value,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 14, 1.2],
        'line-opacity': overlayMinZoomOpacityExpr(minZoomThreshold),
      });
      const roadLayout = { visibility: toggleRoads.checked ? 'visible' : 'none' };
      map.addLayer({
        id: 'roads-lines-major',
        type: 'line',
        source: 'roads',
        'source-layer': 'roads',
        minzoom: layerMinZoom,
        layout: roadLayout,
        paint: roadPaint(overlayMinZoom.roadMajor),
      });
      map.addLayer({
        id: 'roads-lines-residential',
        type: 'line',
        source: 'roads',
        'source-layer': 'roads',
        minzoom: layerMinZoom,
        layout: roadLayout,
        paint: roadPaint(overlayMinZoom.roadFull),
      });
      map.addLayer({
        id: 'bikelanes-casing',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: layerMinZoom,
        layout: { visibility: toggleBikelanes.checked ? 'visible' : 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4],
          'line-opacity': overlayMinZoomOpacityExpr(overlayMinZoom.bikelane),
        },
      });
      map.addLayer({
        id: 'bikelanes-lines',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: layerMinZoom,
        layout: { visibility: toggleBikelanes.checked ? 'visible' : 'none' },
        paint: {
          'line-color': overlayBikelaneColorInput.value,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2],
          'line-opacity': overlayMinZoomOpacityExpr(overlayMinZoom.bikelane),
        },
      });
      updateOverlayLayerFilters();
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
      applyOverlayLineColors();
      if (map.getSource('regions')) {
        map.getSource('regions').setData(geojson);
        updateRegionColors(minPct, maxPct);
        applyOverlayMinZoom();
        map.triggerRepaint();
      } else {
        map.addSource('regions', { type: 'geojson', data: geojson, promoteId: 'id' });
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
      document.getElementById('legend-min').textContent = formatUiPct(min) + ' %';
      document.getElementById('legend-max').textContent = formatUiPct(max) + ' %';
      lastRankingFeatures = filtered;
      updateRankingVisibility(viewId);
      updateScaleCapHint(viewId);
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
          range.capPct +
          ' % (max. ' +
          formatUiPct(range.dataMax) +
          ' % = volle Farbe)';
      }
      document.getElementById('view-meta').textContent = metaText;
      updatePanelSummaryPreview(viewId);

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
      syncOverlayColorInputsFromScale(colorScaleSelect.value);
      applyOverlayLineColors();
      updateRegionColors(lastPctRange.min, lastPctRange.max);
      if (lastRankingFeatures.length && !rankingDetails.hidden) {
        updateRanking(lastRankingFeatures, lastPctRange.min, lastPctRange.max);
      }
    });
    viewSelect.addEventListener('change', () => {
      updateScaleCapDefaultForView(viewSelect.value);
      applyView(viewSelect.value);
    });
    toggleBikelanes.addEventListener('change', updateOverlayVisibility);
    toggleRoads.addEventListener('change', updateOverlayVisibility);
    overlayBikelaneColorInput.addEventListener('input', applyOverlayLineColors);
    overlayRoadColorInput.addEventListener('input', applyOverlayLineColors);
    for (const input of [
      overlayBikelaneMinzoomInput,
      overlayRoadMinzoomMajorInput,
      overlayRoadMinzoomFullInput,
    ]) {
      input.addEventListener('input', applyOverlayMinZoom);
      input.addEventListener('change', applyOverlayMinZoom);
    }
    downloadViewDataBtn.addEventListener('click', downloadCurrentViewData);
    copyViewLinkBtn.addEventListener('click', copyShareLink);
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
        setPanelActionsEnabled(true);
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
        initOverlayColorInputs();
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
