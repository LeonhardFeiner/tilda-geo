import { BASEMAP_OPTIONS, buildBasemapStyleJson, DEFAULT_BASEMAP } from './basemaps'
import { COLOR_SCALES, DEFAULT_COLOR_SCALE } from './colorScales'
import {
  BIKE_SHARE_COLOR_CAP_PCT,
  GEMEINDE_GEOMETRY_DIR,
  DEFAULT_OVERLAY_BIKELANE_MIN_ZOOM,
  DEFAULT_OVERLAY_ROAD_MIN_ZOOM_FULL,
  DEFAULT_OVERLAY_ROAD_MIN_ZOOM_MAJOR,
  DEFAULT_ROAD_OVERLAY_COLOR,
  OVERLAY_LINE_MIN_ZOOM_LIMITS,
  OVERLAY_ROAD_FULL_MIN_ZOOM_LIMITS,
  TILE_ROAD_RESIDENTIAL_MIN_ZOOM,
  PROJECT_LEAD,
  VIEWER_SOURCE_REPO_URL,
  SHARE_PAGE_BASE_URL,
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
import { viewerRegionNavScript } from './viewerRegionNavScript'

// Bottom-sheet ("phone") layout: narrow screens, and short ones too — a phone held sideways is
// wide but too low for the side panel. DESKTOP_MEDIA is the exact complement.
const PHONE_MEDIA = '(max-width: 768px), (max-height: 500px)'
const DESKTOP_MEDIA = '(min-width: 769px) and (min-height: 501px)'

export function generateViewerHtml(generatedAt: string, dataDateLabel = '') {
  const basemapStyles = Object.fromEntries(
    BASEMAP_OPTIONS.map((b) => [b.id, buildBasemapStyleJson(b.id)]),
  )

  const defaultColorScale =
    COLOR_SCALES.find((s) => s.id === DEFAULT_COLOR_SCALE) ?? COLOR_SCALES[0]
  if (!defaultColorScale) {
    throw new Error(`Missing color scale configuration for "${DEFAULT_COLOR_SCALE}"`)
  }

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
    statsMsgpackUrl: './stats-core.msgpack',
    statsExtraMsgpackUrl: './stats-extra.msgpack',
    gemeindeGeometryBase: `./${GEMEINDE_GEOMETRY_DIR}/`,
    lazyDarstellungPresenceUrl: './lazy-darstellung-presence.json',
    statsUrl: './stats.geojson',
    neighborsMsgpackUrl: './neighbors.msgpack',
    neighborsUrl: './neighbors.json',
    manifestUrl: './manifest.json',
    peersUrl: './gemeinde-peers.json',
    densityUrl: './gemeinde-density.json',
    transitUrl: './gemeinde-transit.json',
    terrainUrl: './gemeinde-terrain.json',
    zensusUrl: './gemeinde-zensus.json',
    carsUrl: './gemeinde-cars.json',
    calmedUrl: './gemeinde-calmed.json',
    accidentsUrl: './gemeinde-accidents.json',
    commutersUrl: './gemeinde-commuters.json',
    colorScales: COLOR_SCALES,
    defaultColorScale: DEFAULT_COLOR_SCALE,
    defaultColorCapPct: BIKE_SHARE_COLOR_CAP_PCT,
    defaultColorCapEnabled: false,
    defaultRobustScaleEnabled: true,
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
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#1e293b" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚲</text></svg>" />
  <!-- By far the largest resource on the page (stats-core.msgpack) — without this hint the
       browser only discovers it once the inline controller script runs, after every script tag
       above it has downloaded and executed. Preloading lets it start immediately, in parallel
       with everything else. crossorigin is required even same-origin: fetch() always runs in
       CORS mode, and an uncredentialed preload wouldn't be reused otherwise. -->
  <link rel="preload" href="./stats-core.msgpack" as="fetch" crossorigin="anonymous" />
  <link rel="preload" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" as="script" crossorigin="anonymous" />
  <link rel="preconnect" href="https://unpkg.com" crossorigin />
  <link rel="preconnect" href="https://api.maptiler.com" crossorigin />
  <link rel="preconnect" href="https://tiles.tilda-geo.de" crossorigin />
  <link rel="dns-prefetch" href="https://tile.openstreetmap.de" />
  <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
  <link rel="canonical" href="${SHARE_PAGE_BASE_URL}" />
  <title>Radinfra-Vergleich – wie viel Radweg hat deine Gemeinde?</title>
  <meta
    name="description"
    content="Wie viel Prozent der Straßen haben Radinfrastruktur? Vergleich der Gemeinden und Landkreise auf Basis von OpenStreetMap-Daten."
  />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Radinfra-Vergleich" />
  <meta property="og:url" content="${SHARE_PAGE_BASE_URL}" />
  <meta property="og:title" content="Radinfra-Vergleich – wie viel Radweg hat deine Gemeinde?" />
  <meta
    property="og:description"
    content="Anteil der Straßen mit Radinfrastruktur je Gemeinde und Landkreis – auf Basis von OpenStreetMap."
  />
  <meta property="og:image" content="${new URL('r/og-default.png', SHARE_PAGE_BASE_URL).href}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Radinfra-Vergleich – wie viel Radweg hat deine Gemeinde?" />
  <meta
    name="twitter:description"
    content="Anteil der Straßen mit Radinfrastruktur je Gemeinde und Landkreis – auf Basis von OpenStreetMap."
  />
  <meta name="twitter:image" content="${new URL('r/og-default.png', SHARE_PAGE_BASE_URL).href}" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
    #app-root { display: block; width: 100%; height: 100%; position: relative; }
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
      touch-action: pan-y;
    }
    .panel > summary {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      cursor: pointer; list-style: none; user-select: none;
      font-size: 15px; font-weight: 600; color: #222; margin: 0 0 10px;
    }
    .panel > summary::-webkit-details-marker { display: none; }
    .panel > summary::after {
      content: '▼'; flex-shrink: 0; font-size: 10px; color: #475569;
      transition: transform 0.15s ease;
    }
    .panel:not([open]) > summary { margin-bottom: 0; }
    .panel:not([open]) > summary::after { transform: rotate(-90deg); }
    .panel-summary-preview {
      flex: 1; min-width: 0; font-size: 11px; font-weight: normal; color: #475569;
      text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .panel-body { margin: 0; }
    /* Desktop scrim is inert; the mobile bottom-sheet block below activates it. */
    #sheet-scrim { display: none; }
    .search-fab { display: none; }
    @media ${DESKTOP_MEDIA} {
      #share-fab {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        position: fixed; z-index: 5;
        top: 10px; right: 50px;
        height: 30px; padding: 0 10px;
        border: none; border-radius: 4px;
        background: #fff; color: #333; cursor: pointer;
        font: inherit; font-size: 12px; font-weight: 600;
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
      }
      #share-fab svg { width: 16px; height: 16px; fill: currentColor; flex: none; }
      #share-fab:hover { background: #f8fafc; }
      #share-fab:active { background: #f1f5f9; }
      #share-fab:disabled { opacity: 0.5; cursor: not-allowed; }
      /* While the panel is open the breadcrumb (or the region card) already says this; the
         preview only earns its place on the collapsed panel. */
      .panel[open] > summary .panel-summary-preview { visibility: hidden; }
    }
    @media ${PHONE_MEDIA} {
      body { --sheet-peek: 4.9rem; }

      #sheet-scrim {
        display: block; position: fixed; inset: 0; z-index: 3;
        background: rgba(0, 0, 0, 0.32);
        opacity: 0; pointer-events: none;
        transition: opacity 0.25s ease;
        touch-action: none;
      }
      body[data-sheet="full"] #sheet-scrim { opacity: 1; pointer-events: auto; }

      /* #panel-main becomes a bottom sheet with peek / half / full snap states. */
      .panel {
        position: fixed; z-index: 4; inset: auto 0 0 0;
        width: 100%; max-width: none;
        border-radius: 16px 16px 0 0;
        padding: 0 14px calc(12px + env(safe-area-inset-bottom, 0px));
        max-height: none;
        height: var(--sheet-peek);
        overflow: hidden;
        transition: height 0.28s cubic-bezier(0.32, 0.72, 0, 1);
        overscroll-behavior: contain;
        box-shadow: 0 -3px 18px rgba(0, 0, 0, 0.18);
        touch-action: pan-y;
      }
      /* --vph is set from window.innerHeight in JS; the 1vh fallback keeps this valid
         before JS runs and on browsers without it. (dvh can't be used — the formatter
         drops the vh fallback declaration.) */
      body[data-sheet="half"] .panel { height: calc(56 * var(--vph, 1vh)); overflow-y: auto; }
      body[data-sheet="full"] .panel { height: calc(94 * var(--vph, 1vh)); overflow-y: auto; }
      .panel.is-dragging { transition: none; }

      .panel > summary {
        position: sticky; top: 0; z-index: 1;
        margin: 0 -14px 6px; padding: 18px 14px 10px;
        background: #fff; border-radius: 16px 16px 0 0;
        touch-action: none; -webkit-user-select: none;
      }
      .panel > summary::before {
        content: ''; position: absolute; top: 8px; left: 50%;
        width: 40px; height: 4px; margin-left: -20px;
        border-radius: 999px; background: #d2d2d2;
      }
      .panel > summary::after { display: none; }
      .panel-summary-preview { font-size: 12px; }
      .panel-body { padding-bottom: 8px; }
      /* Peek shows the title row only — the body would otherwise be sliced mid-line. */
      body[data-sheet="peek"] .panel-body { visibility: hidden; }
      /* The region card below already leads with the name and percentage. */
      body[data-region-detail] .panel-summary-preview { visibility: hidden; }

      /* Primary sections are permanently open on the phone (see lockOpenSectionsForViewport). */
      .panel-section[data-lock-open] > summary {
        pointer-events: none;
        list-style: none;
      }
      .panel-section[data-lock-open] > summary::-webkit-details-marker { display: none; }

      /* On mobile a selected region is moved into the top of the sheet (placeRegionDetail),
         so render it as an inline block instead of the floating card. */
      #region-detail-mount:empty { display: none; }
      /* A selected region owns the top of the sheet; the intro line would only push it down. */
      body[data-region-detail] .site-tagline { display: none; }
      #region-detail-mount .region-detail {
        position: static; z-index: auto;
        width: auto; max-width: none; max-height: none;
        border: none; border-radius: 0;
        border-bottom: 1px solid #e2e2e2;
        box-shadow: none; overflow: visible;
        margin: 0 0 10px; padding: 0 0 12px;
        background: transparent;
      }
      /* The floating card's absolute "×" has no anchor here — replace it with a
         full-width "back to map" bar at the very top of the card. */
      #region-detail-mount .region-detail-close {
        position: static;
        display: flex; align-items: center;
        width: calc(100% + 28px); margin: 0 -14px 10px; padding: 12px 14px; text-align: left;
        border: none; border-bottom: 1px solid #d6e4f5;
        background: #eef4fc; color: #1565c0;
        font-size: 0; cursor: pointer;
      }
      #region-detail-mount .region-detail-close::before {
        content: '‹ Zurück zur Karte';
        font-size: 13px; font-weight: 600;
      }
      #region-detail-mount .region-detail-header { padding-right: 0; }

      /* Share button, top-left over the map: a round twin of the search pill beside it. */
      #share-fab {
        display: flex; align-items: center; justify-content: center;
        position: fixed; z-index: 5;
        top: calc(10px + env(safe-area-inset-top, 0px)); left: 10px;
        width: 44px; height: 44px; padding: 0;
        border: none; border-radius: 999px;
        background: #fff; color: #333; cursor: pointer;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
      }
      #share-fab svg { width: 20px; height: 20px; fill: currentColor; }
      #share-fab .share-fab-label { display: none; }
      #share-fab:active { background: #f2f2f2; }
      #share-fab:disabled { opacity: 0.5; cursor: not-allowed; }
      body[data-sheet="full"] #share-fab { display: none; }

      /* Search pill over the map: the search field itself sits inside the collapsed sheet. */
      #search-fab {
        display: flex; align-items: center; gap: 8px;
        position: fixed; z-index: 5;
        top: calc(10px + env(safe-area-inset-top, 0px)); left: 62px; right: 50px;
        min-height: 44px; height: 44px; padding: 0 14px;
        border: none; border-radius: 999px;
        background: #fff; color: #444; cursor: pointer;
        font: inherit; font-size: 15px; text-align: left;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
      }
      #search-fab svg { flex: none; width: 20px; height: 20px; fill: #1565c0; }
      #search-fab span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      body[data-sheet="full"] #search-fab { display: none; }
      /* With nothing selected the half sheet shows the real search field — one is enough. */
      body[data-sheet="half"]:not([data-region-detail]) #search-fab { display: none; }
      .exit-neighbor-view {
        top: calc(62px + env(safe-area-inset-top, 0px)); font-size: 12px; padding: 6px 14px;
      }
      body[data-sheet="full"] .exit-neighbor-view {
        display: none !important;
      }
      .region-search-results {
        max-height: min(220px, calc(100dvh - 320px));
      }
      .maplibregl-ctrl-group > .maplibregl-ctrl-zoom-in,
      .maplibregl-ctrl-group > .maplibregl-ctrl-zoom-out { display: none; }
      #copy-view-link-feedback {
        position: fixed; z-index: 6;
        top: calc(62px + env(safe-area-inset-top, 0px)); left: 10px;
        max-width: 74vw; padding: 6px 10px;
        background: #fff; border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.24);
      }
    }
    .panel label { display: block; font-size: 13px; margin: 8px 0 4px; font-weight: 600; }
    /* Field labels in the panel read as quiet captions, like "Gebiet suchen". */
    .region-nav > label, .settings-group > label {
      font-size: 12px; font-weight: 600; color: #555; margin: 8px 0 3px;
    }
    .panel label[hidden], .panel select[hidden] { display: none !important; }
    .panel select { width: 100%; font-size: 13px; padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; }
    .panel .row { display: flex; flex-wrap: wrap; gap: 12px 16px; margin-top: 8px; }
    .panel .row label { display: flex; align-items: center; gap: 6px; font-weight: normal; margin: 0; cursor: pointer; }
    .hint { font-size: 11px; color: #475569; margin-top: 4px; }
    .panel-section {
      border-top: 1px solid #e8e8e8;
      margin: 0;
    }
    .panel-section > summary {
      display: list-item;
      list-style-position: inside;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: #333;
      user-select: none;
      padding: 8px 0;
      margin: 0;
    }
    .panel-section[open] > summary { margin-bottom: 8px; }
    .panel-section > summary::-webkit-details-marker { color: #475569; }
    .panel-section[open] > :not(summary) { padding-bottom: 8px; }
    .map-legend-section .map-legend { padding: 0; }
    .counting-state {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #333;
    }
    .counting-state--custom #counting-state-label { color: #8a4b00; }
    #counting-reset {
      font: inherit; font-size: 12px; font-weight: 600; padding: 3px 10px; cursor: pointer;
      border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #1565c0;
    }
    #counting-reset[hidden] { display: none !important; }
    #counting-reset:hover { background: #f2f6fb; }
    .counting-group { border-top: 1px solid #eee; }
    .counting-group > summary {
      cursor: pointer; padding: 6px 0; font-size: 12px; font-weight: 600; color: #333;
    }
    .counting-count { font-weight: 400; color: #475569; margin-left: 4px; }
    .counting-group--changed .counting-count { color: #8a4b00; font-weight: 600; }
    .settings-group + .settings-group { margin-top: 12px; padding-top: 10px; border-top: 1px solid #eee; }
    .settings-heading { margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #222; }
    .metric-definition { margin: 0 0 6px; font-size: 11px; line-height: 1.45; color: #555; }
    .metric-definition a { color: #1565c0; text-decoration: none; white-space: nowrap; }
    .metric-definition a:hover { text-decoration: underline; }
    .class-filters { margin: 8px 0; }
    .class-filters strong { display: block; font-size: 12px; margin-bottom: 4px; }
    .class-filters label {
      display: flex; align-items: flex-start; gap: 6px;
      font-size: 12px; font-weight: normal; margin: 3px 0; cursor: pointer;
    }
    #copy-view-link-feedback {
      position: fixed; z-index: 6;
      top: 50px; right: 50px;
      padding: 6px 12px; font-size: 12px; font-weight: 500;
      color: #2e7d32; background: #fff;
      border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    #copy-view-link-feedback[hidden] { display: none !important; }
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
    .choropleth-legend { margin: 0; }
    .choropleth-legend-title { font-size: 12px; font-weight: 600; color: #444; display: block; margin-bottom: 4px; }
    .legend-bar { height: 10px; border-radius: 3px; margin: 4px 0 0; }
    /* Tick labels sit at their value's own position on the bar, so a mid-tone can be read off
       the scale instead of only the two ends. */
    .legend-ticks { position: relative; height: 4px; }
    .legend-ticks span { position: absolute; top: 0; width: 1px; height: 4px; background: #b5b5b5; }
    .legend-labels {
      position: relative; height: 15px;
      font-size: 11px; color: #555; line-height: 1.25;
    }
    .legend-labels span { position: absolute; top: 0; white-space: nowrap; transform: translateX(-50%); }
    .legend-labels span.legend-label--start { left: 0; transform: none; }
    .legend-labels span.legend-label--end { left: auto; right: 0; transform: none; }
    .map-legend {
      display: flex; flex-direction: column; gap: 8px;
      margin-top: 0; padding-top: 8px;
    }
    .map-legend-toggles {
      display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center;
    }
    .map-legend-toggles label {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: normal; margin: 0; cursor: pointer;
    }
    .swatch { display: inline-block; width: 24px; height: 0; border-top: 3px solid; flex-shrink: 0; }
    .ranking { padding-top: 0; }
    .ranking-hint { font-weight: normal; font-size: 11px; color: #475569; }
    .ranking-list {
      margin: 0; padding: 0;
      font-size: 12px; line-height: 1.45; color: #444;
      list-style: none;
    }
    .ranking-list li {
      display: grid;
      grid-template-columns: 1.6em minmax(0, 1fr) minmax(52px, 80px) 4.75em;
      gap: 2px 6px;
      align-items: center;
      margin: 3px 0;
      padding: 0;
    }
    .ranking-list li.ranking-row-clickable {
      cursor: pointer;
      border-radius: 4px;
      padding: 2px 4px;
      margin-left: -4px;
      margin-right: -4px;
    }
    .ranking-list li.ranking-row-clickable:hover,
    .ranking-list li.ranking-row-hovered { background: #eef4fc; }
    .ranking-list li.ranking-row-hovered .ranking-name { color: #1565c0; font-weight: 600; }
    .ranking-list li.ranking-row-clickable:focus-visible {
      outline: 2px solid #1565c0;
      outline-offset: 1px;
      background: #f5f5f5;
    }
    .ranking-list li.ranking-row-selected {
      background: #e3f2fd;
    }
    .ranking-list li.ranking-row-selected .ranking-name {
      font-weight: 600;
      color: #1565c0;
    }
    .ranking-list li.ranking-row-focus {
      background: #ececec;
    }
    .ranking-list li.ranking-row-container .ranking-name { font-weight: 600; color: #1565c0; }
    .ranking-focus-note {
      grid-column: 2 / -1; font-size: 11px; color: #1565c0; line-height: 1.3;
    }
    .ranking-rank { color: #475569; font-variant-numeric: tabular-nums; font-size: 11px; }
    .ranking-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 13px;
    }
    .ranking-bar-track {
      height: 10px; background: #eceff1; border-radius: 2px; overflow: hidden;
    }
    .ranking-bar-fill { height: 100%; border-radius: 2px; min-width: 2px; }
    .ranking-pct {
      text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #444;
      white-space: nowrap;
    }
    .ranking-list .ranking-more,
    .ranking-list .ranking-divider {
      display: block; grid-column: 1 / -1;
      color: #475569; font-style: italic; font-size: 11px; padding: 2px 0;
    }
    .ranking-divider { text-align: center; font-style: normal; color: #aaa; }
    .ranking-toolbar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px;
      margin-bottom: 6px;
    }
    .ranking-mode {
      display: flex; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;
    }
    .ranking-mode[hidden] { display: none; }
    .ranking-mode-btn {
      font-size: 12px; padding: 5px 10px; border: none; background: #f5f5f5;
      color: #444; cursor: pointer;
    }
    .ranking-mode-btn:hover { background: #ebebeb; }
    .ranking-mode-btn[aria-pressed="true"] {
      background: #e3f2fd; color: #1565c0; font-weight: 600;
    }
    .view-csv-row { margin-top: 6px; }
    .view-csv-btn {
      font-size: 12px; padding: 5px 10px;
    }
    .ranking-csv-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }
    .ranking-toolbar .view-csv-btn {
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #fff;
      color: #1565c0;
      cursor: pointer;
    }
    .view-csv-btn:hover { background: #f5f9ff; }
    .view-csv-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .ranking-scroll {
      overflow-x: hidden;
      padding-right: 2px;
    }
    .ranking-scroll--scroll {
      /* Let the full "Alle" ranking grow to its natural height instead of scrolling in its
         own fixed-size box — the panel itself already scrolls, and a box-inside-a-box nested
         scroll is confusing on both desktop and mobile. */
      max-height: none;
      overflow: visible;
    }
    .view-meta {
      font-size: 11px; color: #475569; margin: 0; line-height: 1.45;
    }
    .view-meta-more > summary {
      cursor: pointer; font-size: 11px; color: #1565c0; margin-top: 2px;
    }
    .view-meta-more[hidden] { display: none !important; }
    .national-context {
      font-size: 12px; font-weight: 600; color: #333;
      margin: 6px 0 0; line-height: 1.4;
    }
    .national-context[hidden] { display: none !important; }
    .footer {
      font-size: 11px; color: #475569; margin-top: 6px; padding-top: 6px;
      border-top: 1px solid #eee; line-height: 1.55;
    }
    .footer a { color: #1565c0; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    #tooltip {
      position: absolute; z-index: 3; pointer-events: none; display: none;
      padding: 6px 8px; border-radius: 4px; background: rgba(0,0,0,0.85); color: #fff; font-size: 12px; max-width: 320px;
      white-space: pre-line;
    }
    .region-detail {
      position: absolute; z-index: 4; right: 12px; bottom: 12px; left: auto;
      width: min(360px, calc(100vw - 24px));
      max-height: min(52vh, 420px);
      overflow: auto;
      background: rgba(255, 255, 255, 0.97);
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
      padding: 10px 12px 12px;
      font-size: 12px;
      color: #333;
      touch-action: pan-y;
    }
    .region-detail[hidden] { display: none !important; }
    /* On a computer there is room: a wider card that runs most of the way up the screen
       (below the zoom buttons, beside the panel) so it rarely needs scrolling. */
    @media ${DESKTOP_MEDIA} {
      .region-detail {
        width: min(460px, calc(100vw - 460px));
        min-width: 340px;
        max-height: calc(100vh - 110px);
      }
    }
    .region-detail-header {
      display: flex; align-items: flex-start; gap: 8px;
      margin-bottom: 8px; padding-right: 24px;
    }
    .region-detail-header h2 {
      margin: 0; font-size: 14px; line-height: 1.3; color: #111;
    }
    .region-detail-close {
      position: absolute; top: 6px; right: 8px;
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; font-size: 20px; line-height: 1;
      color: #475569; cursor: pointer; padding: 0;
    }
    .region-detail-close::after {
      content: '';
      position: absolute;
      inset: -6px;
    }
    .region-detail-close:hover { color: #111; }
    .region-detail-meta { margin: 0 0 10px; color: #555; line-height: 1.45; }
    .region-detail-pct { font-size: 28px; font-weight: 800; line-height: 1.1; color: #111; }
    .region-detail-pct-label { font-size: 13px; color: #333; }
    .region-detail-rank { display: block; margin-top: 2px; font-weight: 600; color: #333; }
    .region-detail-km { display: block; font-size: 12px; }
    .region-detail-main-road { display: block; margin-top: 4px; font-size: 13px; color: #333; }
    .region-detail-main-road strong { font-size: 16px; color: #111; }
    .region-detail-authority { margin: 0 0 10px; font-size: 12px; color: #333; }
    .region-detail-authority[hidden] { display: none !important; }
    .ra-title { font-weight: 700; margin: 0 0 4px; }
    .ra-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .ra-table th { font-size: 10px; font-weight: 600; color: #475569; text-align: right; padding: 2px 0 2px 6px; }
    .ra-table th:first-child, .ra-table td:first-child { text-align: left; padding-left: 0; }
    .ra-table td { text-align: right; padding: 3px 0 3px 6px; border-top: 1px solid #eee; }
    .ra-table td.ra-gap { font-weight: 700; color: #8a1c11; }
    .ra-note { margin: 4px 0 0; font-size: 10.5px; line-height: 1.4; color: #475569; }
    .region-detail-more { margin: 4px 0 0; border-top: 1px solid #e8e8e8; }
    .region-detail-more > summary {
      cursor: pointer; padding: 8px 0; font-size: 12px; font-weight: 600; color: #1565c0;
    }
    .region-detail-more[open] > summary { margin-bottom: 6px; }
    .region-detail-gap {
      margin: 0 0 10px; padding: 8px 10px; border-radius: 6px;
      font-size: 12px; line-height: 1.45;
    }
    .region-detail-gap[hidden] { display: none !important; }
    .region-detail-gap strong { font-weight: 700; }
    .region-detail-gap--behind {
      background: #fdecea; border: 1px solid #f5c6c0; color: #8a1c11;
    }
    .region-detail-gap--ahead {
      background: #e8f5e9; border: 1px solid #b7dfba; color: #1b5e20;
    }
    #region-detail-gap + #region-detail-peer-gap,
    .region-detail-gap + .region-detail-gap { margin-top: -4px; }
    .region-detail-gap--model {
      background: #f8fafc; border: 1px solid #cbd5e1; color: #1e293b;
    }
    .region-detail-gap--model.region-detail-gap--behind {
      background: #fdecea; border: 1px solid #f5c6c0; color: #8a1c11;
    }
    .region-detail-gap--model.region-detail-gap--ahead {
      background: #e8f5e9; border: 1px solid #b7dfba; color: #1b5e20;
    }
    .region-detail-gap--model .region-detail-gap-headline {
      display: block; font-size: 13px; font-weight: 700; margin-bottom: 2px;
    }
    .region-detail-gap--model::before {
      content: 'Struktureller Erwartungswert (Faktoren-Modell)'; display: block;
      font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; opacity: 0.7; margin-bottom: 2px;
    }
    .model-breakdown-details {
      margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(0, 0, 0, 0.1);
      font-size: 11.5px;
    }
    .model-breakdown-summary {
      cursor: pointer; font-weight: 600; color: #1565c0; padding: 2px 0; user-select: none;
    }
    .region-detail-gap--behind .model-breakdown-summary { color: #8a1c11; }
    .region-detail-gap--ahead .model-breakdown-summary { color: #1b5e20; }
    .model-breakdown-table {
      width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .model-breakdown-table th {
      font-size: 10px; font-weight: 600; color: #475569; text-align: right;
      padding: 2px 4px; border-bottom: 1px solid #cbd5e1;
    }
    .model-breakdown-table th:first-child { text-align: left; padding-left: 0; }
    .model-breakdown-table td {
      padding: 3px 4px; text-align: right; border-top: 1px solid rgba(0, 0, 0, 0.05);
    }
    .model-breakdown-table td:first-child { text-align: left; padding-left: 0; }
    .model-breakdown-table td small { display: block; font-size: 9.5px; color: #64748b; font-weight: normal; }
    .model-breakdown-table tr.model-row-total td {
      border-top: 1.5px solid #94a3b8; font-weight: 700;
    }
    .model-breakdown-table tr.model-row-actual td {
      border-top: 1px solid #cbd5e1; font-weight: 700;
    }
    .model-breakdown-table tr.model-row-diff td {
      border-top: 1.5px solid #94a3b8; font-weight: 700;
    }
    .model-breakdown-note {
      margin: 6px 0 0; font-size: 10px; line-height: 1.35; color: #64748b;
    }
    .region-detail-quality {
      margin: 0 0 10px; padding: 6px 10px; border-radius: 6px;
      font-size: 11px; line-height: 1.45; color: #555;
      background: #f5f5f5; border-left: 3px solid #9e9e9e;
    }
    .region-detail-quality[hidden] { display: none !important; }
    .region-detail-quality strong { font-weight: 700; color: #333; }
    .region-detail-quality--good { border-left-color: #43a047; }
    .region-detail-quality--mixed { border-left-color: #f9a825; background: #fffaf0; }
    .region-detail-quality--poor,
    .region-detail-quality--sparse { border-left-color: #ef6c00; background: #fff4e5; color: #6b3a00; }
    .ranking-quality { margin-right: 3px; color: #b45309; font-size: 11px; cursor: help; }
    .region-detail-gap--peer .region-detail-gap-headline {
      display: block; font-size: 13px; font-weight: 700; margin-bottom: 2px;
    }
    .region-detail-gap--peer::before {
      content: var(--peer-gap-label, 'Ähnlich große Gemeinden bundesweit'); display: block;
      font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; opacity: 0.7; margin-bottom: 2px;
    }
    .region-detail-role-model {
      display: block; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
    .region-detail-role-model-link {
      padding: 0; border: 0; background: none; cursor: pointer;
      font: inherit; font-weight: 700; color: inherit; text-decoration: underline;
    }
    .region-detail-extra { margin: 0 0 8px; color: #555; font-size: 12px; }
    .ctx-caption { margin: 0 0 4px; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #475569; font-weight: 700; }
    .ctx-scope {
      font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0;
      text-transform: none; color: #333; padding: 2px 4px; margin: 2px 0 0; display: block;
      border: 1px solid #c8d3e0; border-radius: 4px; background: #fff; width: 100%;
    }
    .ctx-row { padding: 2px 0; cursor: help; }
    .ctx-hint { margin: 0 0 4px; font-size: 11px; color: #475569; }
    /* Rows that unfold a scatter: a disclosure arrow and a hover state say they open something. */
    .ctx-row--plot { cursor: pointer; margin: 0 -4px; padding: 3px 4px; border-radius: 4px; }
    .ctx-row--plot:hover { background: #eef3fa; }
    .ctx-row--plot:focus-visible { outline: 2px solid #1565c0; outline-offset: 1px; }
    .ctx-row--plot .ctx-label::before {
      content: '▸'; display: inline-block; width: 1em; color: #1565c0;
      transition: transform 0.15s ease;
    }
    .ctx-row--plot[aria-expanded="true"] .ctx-label::before { transform: rotate(90deg); }
    .ctx-row--plot[aria-expanded="true"] { background: #f5f8fc; }
    .print-sheet .ctx-row--plot { margin: 0; padding: 2px 0; background: none; }
    .print-sheet .ctx-row--plot .ctx-label::before { content: none; }
    .ctx-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .ctx-label { color: #444; }
    .ctx-label small { color: #475569; font-size: 10px; }
    .ctx-value { font-variant-numeric: tabular-nums; color: #222; text-align: right; }
    .ctx-band { font-style: normal; font-size: 10px; font-weight: 700; color: #1565c0; margin-left: 6px; white-space: nowrap; }
    .ctx-track {
      position: relative; height: 6px; margin-top: 3px; border-radius: 3px;
      background: linear-gradient(to right, #e6edf5, #cfdcec);
    }
    .ctx-track i { position: absolute; top: 0; bottom: 0; width: 1px; background: #fff; }
    .ctx-marker {
      position: absolute; top: -3px; width: 4px; height: 12px; margin-left: -2px;
      border-radius: 2px; background: #1565c0; box-shadow: 0 0 0 1px #fff;
    }
    .region-detail-extra[hidden] { display: none !important; }
    .ctx-plot { margin: 8px 0 6px; padding-top: 8px; border-top: 1px dashed #ccc; cursor: default; }
    .ctx-plot-title { font-size: 11px; color: #475569; margin-bottom: 4px; }
    .ctx-plot-chart { width: 100%; }
    .ctx-plot-chart svg { display: block; font-size: 10px; }
    .ctx-plot-chart text { fill: #475569; }
    .ctx-plot-chart .grid { stroke: #e6e6e6; }
    .ctx-plot-chart .axis-title { fill: #333; font-weight: 600; }
    .ctx-plot-chart .dots circle { fill: #1565c0; fill-opacity: var(--dot-opacity, 0.25); }
    .ctx-plot-chart .trend { stroke: #475569; stroke-width: 1.5; stroke-dasharray: 4 3; stroke-linecap: round; opacity: 0.85; }
    .ctx-plot-chart .selected { fill: #e20613; stroke: #fff; stroke-width: 2; }
    .ctx-plot-chart .selected-label { fill: #e20613; font-size: 11px; font-weight: 700; paint-order: stroke; stroke: #fff; stroke-width: 3; }
    .region-detail-section { margin-top: 8px; }
    .region-detail-section h4 {
      margin: 0 0 4px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.02em; color: #475569;
    }
    .region-detail-rows { margin: 0; padding: 0; list-style: none; }
    .region-detail-rows li {
      display: flex; flex-direction: column; gap: 3px;
      padding: 3px 0; border-bottom: 1px solid #f0f0f0;
    }
    .region-detail-row-head { display: flex; justify-content: space-between; gap: 8px; }
    .region-detail-rows li.region-detail-row-clickable {
      cursor: pointer; margin: 0 -4px; padding: 3px 4px; border-radius: 4px;
    }
    .region-detail-rows li.region-detail-row-clickable:hover { background: #f5f5f5; }
    .region-detail-rows li.region-detail-row-active { background: #e3f2fd; }
    .region-detail-rows li:last-child { border-bottom: none; }
    .region-detail-rows .km {
      font-variant-numeric: tabular-nums; color: #444; white-space: nowrap;
    }
    .region-detail-bar-track {
      height: 6px; border-radius: 3px; background: #eee; overflow: hidden;
    }
    .region-detail-bar-fill { height: 100%; border-radius: 3px; }
    .region-detail-rows li.region-detail-row-excluded { opacity: 0.55; }
    .region-detail-rows li.region-detail-row-excluded .km { color: #718096; }
    .region-detail-rows li.region-detail-row-excluded .region-detail-bar-fill {
      background: #b0bec5 !important; opacity: 0.4;
    }
    .region-detail-excluded-badge {
      display: inline-block; font-size: 10px; font-weight: 500;
      color: #64748b; background: #f1f5f9; padding: 0 4px;
      border-radius: 3px; margin-left: 5px; vertical-align: 1px;
    }
    .detail-mode {
      display: inline-flex; margin: 6px 0 0; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;
    }
    .detail-mode-btn {
      font: inherit; font-size: 11px; padding: 3px 9px; border: none; background: #f5f5f5;
      color: #444; cursor: pointer;
    }
    .detail-mode-btn:hover { background: #ebebeb; }
    .detail-mode-btn[aria-pressed="true"] { background: #e3f2fd; color: #1565c0; font-weight: 600; }
    #load-error {
      display: none; margin: 0 0 8px; padding: 8px 10px;
      border: 1px solid #f5c6c0; border-radius: 6px; background: #fdecea;
      color: #8a1c11; font-size: 12px; line-height: 1.45;
    }
    .load-error-retry {
      display: inline-block; margin-top: 6px;
      font-size: 12px; font-weight: 600; color: #8a1c11;
      background: #fff; border: 1px solid #e0a9a2; border-radius: 6px;
      padding: 4px 9px; cursor: pointer;
    }
    .load-error-retry:hover { background: #fff5f4; }
    #load-status { color: #555; font-size: 13px; margin: 0 0 8px; display: none; }
    body.ui-minimal #panel-main, body.ui-minimal #search-fab { display: none !important; }
    .region-nav { margin-bottom: 4px; }
    .region-nav[hidden] { display: none !important; }
    .region-search-block { position: relative; margin-bottom: 10px; }
    .region-search-block[hidden] { display: none !important; }
    @media ${DESKTOP_MEDIA} {
      .region-search-block {
        position: sticky; top: -12px; z-index: 5;
        background: rgba(255, 255, 255, 0.98);
        margin: -12px -14px 10px;
        padding: 10px 14px 8px;
        border-bottom: 1px solid #e5e5e5;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }
    }
    .maplibregl-ctrl-scale {
      background-color: rgba(255, 255, 255, 0.9);
      border-color: #555;
      color: #333;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    }
    @media ${DESKTOP_MEDIA} {
      body[data-region-detail] .maplibregl-ctrl-bottom-right {
        margin-right: min(480px, calc(100vw - 440px));
        transition: margin-right 0.28s cubic-bezier(0.32, 0.72, 0, 1);
      }
    }
    @media ${PHONE_MEDIA} {
      .maplibregl-ctrl-bottom-right {
        margin-bottom: calc(var(--sheet-peek) + 8px);
      }
      body[data-sheet="full"] .maplibregl-ctrl-bottom-right {
        display: none;
      }
    }
    .region-locate {
      display: inline-flex; align-items: center; gap: 4px;
      margin: 8px 0 0; padding: 4px 10px 4px 7px; cursor: pointer;
      border: 1px solid #c5d7ee; border-radius: 999px; background: #f3f8fe;
      font: inherit; font-size: 12px; font-weight: 600; color: #1565c0;
    }
    .region-locate svg { width: 14px; height: 14px; fill: currentColor; }
    .region-locate:hover { background: #e6f0fc; }
    .region-locate[hidden], .region-locate-status[hidden] { display: none !important; }
    .region-locate-status { margin: 4px 0 0; font-size: 11px; color: #8a1c11; }
    .region-search-results li.region-search-empty { cursor: default; color: #475569; }
    .region-search-results li.region-search-empty:hover { background: none; }
    .region-search-block label { display: block; font-size: 14px; font-weight: 700; color: #222; margin: 4px 0 6px; }
    #region-search-input {
      width: 100%; box-sizing: border-box; font-size: 14px; padding: 8px 10px;
      border-radius: 6px; border: 1.5px solid #1565c0;
    }
    #region-search-input:focus { outline: 3px solid rgba(21, 101, 192, 0.25); outline-offset: 0; }
    .region-search-results {
      position: absolute; z-index: 6; top: 100%; left: 0; right: 0; margin: 2px 0 0;
      padding: 4px 0; list-style: none;
      background: #fff; border: 1px solid #ccc; border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
      max-height: 220px; overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .region-search-results[hidden] { display: none !important; }
    .region-search-results li {
      padding: 6px 10px; font-size: 13px; cursor: pointer;
    }
    .region-search-results li:hover,
    .region-search-results li:focus { background: #eef4fc; outline: none; }
    .region-search-results li .region-search-result-level { color: #475569; font-size: 11px; }
    .panel-options { display: flex; flex-direction: column; }
    .region-scope-block[hidden] { display: none !important; }
    .site-title {
      margin: 0; font-size: 15px; font-weight: 600; color: #222;
      line-height: 1.3; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .site-tagline {
      margin: 0 0 10px; font-size: 12px; line-height: 1.45; color: #555;
    }
    .site-tagline a { color: #1565c0; text-decoration: none; }
    .site-tagline a:hover { text-decoration: underline; }
    .region-detail-view-link {
      margin: 0; padding: 0; border: none;
      font-size: 11px;
    }
    .region-detail-view-link a { color: #1565c0; text-decoration: none; }
    .region-detail-view-link a:hover { text-decoration: underline; }
    .region-detail-actions {
      display: flex; flex-wrap: wrap; gap: 6px 8px;
      margin: 8px 0 10px;
    }
    .region-breadcrumb {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 4px;
      margin-bottom: 8px; font-size: 12px; line-height: 1.5;
    }
    .region-breadcrumb .region-breadcrumb-sep { color: #767676; }
    .region-breadcrumb button {
      font: inherit; color: #1565c0; background: none; border: 0; padding: 0;
      cursor: pointer;
    }
    .region-breadcrumb button:hover { text-decoration: underline; }
    /* The area you are in reads as a label, not another place to click. */
    .region-breadcrumb .region-breadcrumb-current { color: #333; font-weight: 600; }
    .region-breadcrumb .region-breadcrumb-up { margin-left: auto; color: #555; }
    .region-detail-drill {
      display: inline-flex; align-items: center; gap: 5px;
      font: inherit; font-size: 12px; font-weight: 500;
      color: #1565c0; background: #f0f6ff;
      border: 1px solid #c8ddf6; border-radius: 5px;
      padding: 5px 10px; cursor: pointer; text-align: left;
      transition: background 0.15s, border-color 0.15s;
    }
    .region-detail-drill:hover {
      background: #e1efff; border-color: #9ec5f3; text-decoration: none;
    }
    .region-detail-drill:active {
      background: #c8ddf6;
    }
    .canvas-mini-legend {
      position: fixed; z-index: 2;
      left: 428px; bottom: 16px;
      display: flex; flex-direction: column; gap: 4px;
      width: 140px; padding: 7px 10px;
      background: rgba(255, 255, 255, 0.92);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
      border-radius: 6px;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.16);
      pointer-events: none;
      transition: opacity 0.2s ease, left 0.2s ease, bottom 0.2s ease;
    }
    /* The legend precedes the panel in the DOM, so a sibling selector can't see the panel. */
    body:has(#panel-main:not([open])) .canvas-mini-legend {
      left: 16px;
    }
    /* After the base rule above: same specificity, so source order decides. */
    @media ${PHONE_MEDIA} {
      .canvas-mini-legend {
        left: 10px;
        bottom: calc(var(--sheet-peek) + 12px);
      }
      body[data-sheet="half"] .canvas-mini-legend,
      body[data-sheet="full"] .canvas-mini-legend {
        opacity: 0;
      }
    }
    .cml-title {
      font-size: 10px; font-weight: 600; color: #555;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cml-bar {
      height: 6px; border-radius: 3px; width: 100%;
    }
    .cml-labels {
      display: flex; justify-content: space-between;
      font-size: 10px; font-weight: 600; color: #444;
    }
    .exit-neighbor-view {
      position: fixed; z-index: 5;
      top: 16px; left: 50%; transform: translateX(-50%);
      display: inline-flex; align-items: center; gap: 6px;
      background: #fff; color: #1565c0;
      border: 1px solid #bbdefb; border-radius: 999px;
      padding: 7px 16px; font: inherit; font-size: 13px; font-weight: 600;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
      cursor: pointer; white-space: nowrap;
      transition: background 0.15s, box-shadow 0.15s, transform 0.15s;
    }
    .exit-neighbor-view:hover {
      background: #e3f2fd; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.22);
    }
    .exit-neighbor-view:active {
      background: #bbdefb; transform: translateX(-50%) scale(0.97);
    }
    .exit-neighbor-view[hidden] { display: none !important; }
    dialog.methodology-dialog {
      border: none;
      border-radius: 12px;
      padding: 0;
      width: min(720px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      background: #fff;
      color: #1f2421;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    dialog.methodology-dialog:not([open]) {
      display: none;
    }
    dialog.methodology-dialog::backdrop {
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
    }
    .methodology-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      border-bottom: 1px solid #e2e4e0;
      background: #f8faf8;
    }
    .methodology-dialog-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1f2421;
    }
    .methodology-dialog-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .methodology-dialog-actions a {
      font-size: 12px;
      color: #1565c0;
      text-decoration: none;
    }
    .methodology-dialog-actions a:hover {
      text-decoration: underline;
    }
    .methodology-close {
      position: relative;
      border: none;
      background: none;
      font-size: 22px;
      line-height: 1;
      color: #475569;
      cursor: pointer;
      padding: 4px 8px;
      min-width: 36px;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }
    .methodology-close::after {
      content: '';
      position: absolute;
      inset: -4px;
    }
    .methodology-close:hover {
      background: #e0e0e0;
      color: #111;
    }
    .methodology-dialog-body {
      padding: 20px 24px;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.6;
    }
    @media ${PHONE_MEDIA} {
      dialog.methodology-dialog {
        width: 100vw;
        max-height: 85vh;
        border-radius: 16px 16px 0 0;
        margin-top: auto;
        margin-bottom: 0;
      }
      .methodology-dialog-body {
        padding: 16px;
      }
    }
    dialog.export-dialog {
      border: none;
      border-radius: 12px;
      padding: 0;
      width: min(420px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      background: #fff;
      color: #1f2421;
      overflow: hidden;
    }
    dialog.export-dialog:not([open]) {
      display: none;
    }
    dialog.export-dialog::backdrop {
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }
    .export-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .export-dialog-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
    }
    .export-dialog-close {
      position: relative;
      background: none;
      border: none;
      font-size: 24px;
      line-height: 1;
      color: #64748b;
      cursor: pointer;
      padding: 0;
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }
    .export-dialog-close::after {
      content: '';
      position: absolute;
      inset: -4px;
    }
    .export-dialog-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }
    .export-dialog-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 18px;
    }
    .export-dialog-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      color: #1e293b;
      cursor: pointer;
      text-align: left;
      font: inherit;
      transition: background 0.15s, border-color 0.15s;
    }
    .export-dialog-item:hover:not(:disabled) {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .export-dialog-item:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: #f1f5f9;
      border-color: #e2e8f0;
    }
    .export-dialog-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid #cbd5e1;
      color: #1565c0;
      flex: none;
    }
    .export-dialog-item:hover:not(:disabled) .export-dialog-icon {
      background: #1565c0;
      color: #fff;
      border-color: #1565c0;
    }
    .export-dialog-icon svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    .export-dialog-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .export-dialog-name {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }
    .export-dialog-desc {
      font-size: 11px;
      color: #64748b;
    }
    .export-dialog-footer {
      padding: 0 18px 12px;
    }
    .export-dialog-feedback {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #166534;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 6px 10px;
      text-align: center;
    }
    .export-dialog-feedback[hidden] { display: none; }
    .export-dialog-feedback.is-error {
      color: #991b1b;
      background: #fef2f2;
      border-color: #fecaca;
    }
    @media ${PHONE_MEDIA} {
      dialog.export-dialog {
        width: 100vw;
        max-height: 85vh;
        border-radius: 16px 16px 0 0;
        margin-top: auto;
        margin-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom, 12px);
      }
    }
    .print-sheet { display: none; }
    @media print {
      @page { size: A4; margin: 15mm; }
      html, body.printing {
        height: auto !important;
        min-height: 100% !important;
        overflow: visible !important;
        background: #fff;
      }
      body.printing > :not(#print-sheet) { display: none !important; }
      body.printing #print-sheet {
        display: block !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
    .print-sheet { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; font-size: 10pt; line-height: 1.35; }
    .print-sheet .ps-kicker { font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; color: #555; margin: 0; }
    .print-sheet h1 { font-size: 20pt; margin: 2pt 0 0; }
    .print-sheet .ps-sub { margin: 0 0 8pt; color: #555; }
    .print-sheet h2 { font-size: 11.5pt; margin: 10pt 0 4pt; padding-bottom: 2pt; border-bottom: 1pt solid #ddd; }
    .print-sheet .ps-section { break-inside: avoid; }
    .print-sheet .ps-section .region-detail-gap,
    .print-sheet .ps-section .region-detail-quality { margin: 4pt 0; }
    .print-sheet img { display: block; width: 100%; max-height: 85mm; object-fit: contain; border: 1pt solid #ddd; }
    .print-sheet img.ps-map-img { width: auto; max-width: 100%; max-height: 100mm; margin: 0 auto; }
    .print-sheet .ps-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14pt; margin-bottom: 6pt; }
    .print-sheet .region-detail-section { break-inside: avoid; }
    .print-sheet .region-detail-section h4 { margin: 4pt 0 2pt; font-size: 10pt; }
    .print-sheet .region-detail-rows { margin: 0; padding: 0; list-style: none; }
    .print-sheet .region-detail-rows li { margin: 0 0 3pt; }
    .print-sheet .ps-plot-page { break-before: page; }
    .print-sheet .ps-plots { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6pt 14pt; }
    /* The plots are drawn at a fixed pixel size; scale them to their column so a narrower
       print layout (a phone's) shrinks them instead of cutting them off. */
    .print-sheet .ps-plots .ctx-plot-chart svg { width: 100%; height: auto; max-width: 100%; }
    .print-sheet .ps-plots img.ps-plot-img { width: 100%; max-height: none; height: auto; border: 0; object-fit: fill; }
    .print-sheet .ps-plots .ctx-plot { margin: 0; padding-top: 0; border-top: 0; break-inside: avoid; }
    .print-sheet .ps-section.ps-ranking-section { break-inside: auto; }
    .print-sheet .ps-ranking-wrap { margin-top: 4pt; }
    .print-sheet .ps-ranking-summary { font-size: 8.5pt; color: #555; margin: 0 0 5pt; }
    .print-sheet .ps-ranking-list {
      columns: 2;
      column-gap: 16pt;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .print-sheet .ps-ranking-row {
      display: grid;
      grid-template-columns: 2em minmax(0, 1fr) 52pt 3.5em;
      gap: 0 4pt;
      align-items: center;
      font-size: 8.5pt;
      line-height: 1.35;
      margin-bottom: 2pt;
      padding: 1pt 2pt;
      break-inside: avoid;
    }
    .print-sheet .ps-ranking-row--current {
      background: #eef6ff;
      font-weight: 700;
      border-radius: 2pt;
    }
    .print-sheet .ps-ranking-rank {
      color: #64748b;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .print-sheet .ps-ranking-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #1e293b;
    }
    .print-sheet .ps-ranking-row--current .ps-ranking-name {
      color: #0369a1;
    }
    .print-sheet .ps-ranking-bar-track {
      height: 6.5pt;
      background: #f1f5f9;
      border-radius: 2pt;
      overflow: hidden;
    }
    .print-sheet .ps-ranking-bar-fill {
      height: 100%;
      border-radius: 2pt;
      min-width: 2pt;
    }
    .print-sheet .ps-ranking-pct {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: #334155;
      white-space: nowrap;
    }
    .print-sheet .ps-ranking-divider {
      text-align: center;
      color: #94a3b8;
      font-size: 8.5pt;
      padding: 2pt 0;
      break-inside: avoid;
      list-style: none;
    }
    .print-sheet .ps-ranking-note {
      font-size: 8pt;
      font-style: italic;
      color: #64748b;
      margin: 4pt 0 0;
    }
    .print-sheet .ps-foot { margin-top: 10pt; padding-top: 6pt; border-top: 1pt solid #ccc; font-size: 8.5pt; color: #444; }
    .print-sheet .ps-url { word-break: break-all; }
    .region-detail-osm-edit { color: #1565c0; text-decoration: none; }
    .region-detail-osm-edit:hover { text-decoration: underline; }
    /* Touch screens: finger-sized controls. 16px inputs also stop iOS from zooming on focus. */
    @media (pointer: coarse) {
      .panel select, #region-search-input {
        min-height: 44px; font-size: 16px;
      }
      .panel input[type="checkbox"], .panel input[type="radio"] { width: 20px; height: 20px; }
      .panel .row label { min-height: 44px; }
      .panel-body summary { padding-top: 12px; padding-bottom: 12px; }
      .ranking-row-clickable { min-height: 40px; }
      #view-csv-btn-toolbar { min-height: 36px; padding-left: 12px; padding-right: 12px; }
      .ranking-mode-btn { min-height: 36px; padding-left: 12px; padding-right: 12px; }
      .region-locate { display: inline-flex; align-items: center; min-height: 44px; }
      .hint { font-size: 12px; }
      #share-fab::after { content: ''; position: absolute; inset: -7px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  </style>
</head>
<body>
  <main id="app-root">
    <div id="map" role="region" aria-label="Interaktive Karte der Radinfrastruktur"></div>
    <div id="sheet-scrim" aria-hidden="true"></div>
  <button type="button" id="share-fab" class="share-fab" title="Teilen &amp; Exportieren" aria-label="Ansicht teilen und exportieren" aria-haspopup="dialog">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6 7.7 6.9l1.4 1.4L11 6.4V15h2V6.4l1.9 1.9 1.4-1.4L12 2.6z"/><path d="M5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9h-2v9H7v-9H5z"/></svg>
    <span class="share-fab-label">Teilen &amp; Exportieren</span>
  </button>
  <span id="copy-view-link-feedback" hidden></span>
  <button type="button" id="search-fab" class="search-fab">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>
    <span>Deine Gemeinde suchen</span>
  </button>
  <button type="button" id="exit-neighbor-view" class="exit-neighbor-view" hidden>‹ Ansicht wiederherstellen</button>
  <div id="canvas-mini-legend" class="canvas-mini-legend" aria-hidden="true">
    <div class="cml-title">Radinfra-Anteil</div>
    <div class="cml-bar" id="cml-bar"></div>
    <div class="cml-labels">
      <span id="cml-min">0 %</span>
      <span id="cml-max">20 %</span>
    </div>
  </div>
  <details class="panel" id="panel-main" open>
    <summary>
      <h1 class="site-title">Radinfra-Vergleich</h1>
      <span class="panel-summary-preview" id="panel-summary-preview"></span>
    </summary>
    <div class="panel-body">
    <div id="region-detail-mount"></div>
    <p class="site-tagline">
      Anteil der Straßen mit Radinfrastruktur – je Gemeinde, Landkreis und Bundesland,
      berechnet aus OpenStreetMap-Daten. <a href="./methodik.html">Wie wird gerechnet?</a>
    </p>
    <p id="load-status">Lade Gebietsdaten…</p>
    <p id="load-error"></p>
    <div class="panel-options" id="panel-options">
    <div class="region-search-block" id="region-search-block">
      <label for="region-search-input">Wie steht deine Gemeinde da?</label>
      <input
        type="search"
        id="region-search-input"
        autocomplete="off"
        enterkeyhint="search"
        placeholder="Gemeinde oder Landkreis, z. B. Erding"
      />
      <ul id="region-search-results" class="region-search-results" hidden></ul>
      <button type="button" id="region-locate" class="region-locate" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>
        Mein Standort verwenden
      </button>
      <p class="region-locate-status" id="region-locate-status" role="status" hidden></p>
    </div>
    <details class="panel-section region-scope-block" id="region-scope-block" open>
      <summary>Gebiet &amp; Darstellung</summary>
      <div class="region-nav" id="region-nav">
        <!-- Two orthogonal axes, one control each: the breadcrumb picks the area, the select
             picks how fine the polygons in it are. The picker under "Zeige" steps one level into
             the area (Bundesland from Deutschland, Landkreis from a Bundesland). -->
        <nav class="region-breadcrumb" id="region-breadcrumb" aria-label="Gebietspfad"></nav>
        <label for="darstellung-select">Zeige</label>
        <select id="darstellung-select"></select>
        <label for="map-metric-select">Kartenansicht</label>
        <select id="map-metric-select">
          <option value="bikeShare">Radinfrastruktur-Anteil</option>
          <option value="modelGap">Modell-Abweichung (Über- &amp; Nachzügler)</option>
          <option value="cars">PKW je 1.000 Einwohner (KBA)</option>
          <option value="rent">Ø Nettokaltmiete (€/m², Zensus)</option>
          <option value="accidents">Fahrradunfälle / 10.000 Einw. (Unfallatlas)</option>
          <option value="commuters">Pendlersaldo (BA Beschäftigungsstatistik)</option>
        </select>
        <label for="region-child-select" id="region-child-label" hidden>Gebiet wählen</label>
        <select id="region-child-select" hidden></select>
        <!-- Not user-facing: the area state the breadcrumb and the picker above read and write
             (and what the 37 call sites, URL round-tripping and Back/Forward are built on). -->
        <div hidden>
          <select id="gebiet-select"></select>
          <p class="region-nav" id="untergebiet-wrap">
            <select id="untergebiet-select"></select>
          </p>
        </div>
      </div>
    </details>
    <details class="panel-section settings-drawer" id="settings-drawer">
      <summary>Einstellungen</summary>
      <div class="settings-group" id="count-classes-details">
        <h2 class="settings-heading">Was zählt als Radinfrastruktur?</h2>
        <p class="counting-state">
          <span id="counting-state-label">Radinfra.de-Standard</span>
          <button type="button" id="counting-reset" hidden>Zurücksetzen</button>
        </p>
        <p class="hint">Welche Klassen in den Anteil Radinfra an Straßen (km) einfließen. Haken setzen oder entfernen:</p>
        <details class="counting-group" id="road-class-group">
          <summary>Straßen <span class="counting-count" id="road-class-count"></span></summary>
          <div class="class-filters" id="road-class-filters"></div>
        </details>
        <details class="counting-group" id="bikelane-class-group">
          <summary>Radinfrastruktur <span class="counting-count" id="bikelane-class-count"></span></summary>
          <div class="class-filters" id="bikelane-class-filters"></div>
        </details>
      </div>
      <div class="settings-group" id="color-options-details">
        <h2 class="settings-heading">Karte</h2>
        <label for="basemap-select">Hintergrundkarte</label>
        <select id="basemap-select"></select>
        <p class="hint" id="basemap-hint"></p>
        <label for="color-scale-select">Farbskala (Flächen)</label>
        <select id="color-scale-select"></select>
        <p class="hint" id="color-scale-hint"></p>
        <!-- Not user-facing. Cap/outlier handling, overlay zoom levels and line colours stay as
             the state behind their URL parameters (cap, robustScale, radfarbe, strassenfarbe,
             radwegeMinZoom, …), so shared links and the colour-scale presets keep working. -->
        <div class="settings-state" hidden>
      <div class="scale-cap-controls">
        <label><input type="checkbox" id="scale-robust-enabled" checked /> Ausreißer bei Skalenende ignorieren</label>
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
        </div>
      </div>
    </details>
    <!-- Closed on a computer: the small legend on the map carries the scale. The phone keeps it
         open (PHONE_OPEN_SECTIONS), where that legend hides as soon as the sheet rises. -->
    <details class="panel-section map-legend-section" id="map-legend-section">
      <summary>Legende</summary>
      <div class="map-legend">
        <div class="choropleth-legend">
          <span class="choropleth-legend-title" id="choropleth-legend-title">Flächenfarbe (Radinfra-Anteil)</span>
          <p class="metric-definition" id="metric-definition">
            Länge der Radinfrastruktur ÷ Länge aller Straßen (km),
            <span id="metric-definition-counting">nach Radinfra.de-Standard</span>.
            <a href="./methodik.html">So wird gezählt</a>
          </p>
          <div class="legend-bar" id="legend-bar"></div>
          <div class="legend-ticks" id="legend-ticks"></div>
          <div class="legend-labels" id="legend-labels"></div>
        </div>
        <p class="view-meta" id="view-meta"></p>
        <details class="view-meta-more" id="view-meta-more" hidden>
          <summary>Mehr zur Farbskala</summary>
          <p class="view-meta" id="view-meta-more-text"></p>
        </details>
        <p class="national-context" id="national-context" hidden></p>
        <div class="map-legend-toggles">
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
      </div>
    </details>
    <details class="panel-section ranking" id="ranking-details" open>
        <summary>Rangliste <span class="ranking-hint" id="ranking-summary"></span></summary>
        <div class="ranking-toolbar" id="ranking-toolbar">
          <div class="ranking-mode" id="ranking-mode" role="group" aria-label="Ranglisten-Ansicht">
            <button type="button" class="ranking-mode-btn" data-ranking-mode="topflop" aria-pressed="true">Top &amp; Flop</button>
            <button type="button" class="ranking-mode-btn" data-ranking-mode="all" aria-pressed="false">Alle</button>
          </div>
          <div class="ranking-csv-actions" id="ranking-csv-actions">
            <button
              type="button"
              class="view-csv-btn"
              id="view-csv-btn-toolbar"
              disabled
              title="Gebietsdaten der aktuellen Ansicht (Rang, Summen, Klassen) als CSV"
            >
              CSV
            </button>
            <button
              type="button"
              class="view-csv-btn"
              id="view-csv-btn-full"
              hidden
              disabled
              title="Alle Gebietsdaten (alle Verwaltungsebenen, Rang, Summen, Klassen) als CSV"
            >
              CSV gesamt
            </button>
          </div>
        </div>
        <div class="ranking-scroll" id="ranking-scroll">
          <ol class="ranking-list" id="ranking-list" aria-label="Rangliste der Gebiete"></ol>
        </div>
    </details>
    </div>
    <p class="footer">
      ${dataDateLabel ? `OSM-Daten vom ${dataDateLabel} · ` : ''}Erstellt am ${generatedDateLabel} ·
      <a href="./methodik.html">Methodik &amp; Datenquellen</a> ·
      Daten: © <a href="https://www.openstreetmap.org/copyright?locale=de" target="_blank" rel="noopener noreferrer">OpenStreetMap-Mitwirkende</a>
      (<a href="https://www.openstreetmap.org/copyright?locale=de" target="_blank" rel="noopener noreferrer">ODbL</a>) ·
      basierend auf dem <a href="${VIEWER_SOURCE_REPO_URL}" target="_blank" rel="noopener noreferrer">Fork von tilda-geo</a> ·
      erstellt von ${PROJECT_LEAD}
    </p>
    </div>
  </details>
  <div id="tooltip"></div>
  <div id="region-detail" class="region-detail" hidden>
    <button type="button" class="region-detail-close" id="region-detail-close" aria-label="Schließen">×</button>
    <div class="region-detail-header">
      <h2 id="region-detail-title"></h2>
    </div>
    <p class="region-detail-meta" id="region-detail-meta"></p>
    <div id="region-detail-actions"></div>
    <p class="region-detail-gap" id="region-detail-gap" hidden></p>
    <p class="region-detail-gap region-detail-gap--peer" id="region-detail-peer-gap" hidden></p>
    <div class="region-detail-gap region-detail-gap--model" id="region-detail-model-gap" hidden></div>
    <div class="region-detail-authority" id="region-detail-authority" hidden></div>
    <p class="region-detail-quality" id="region-detail-quality" hidden></p>
    <details class="region-detail-more" id="region-detail-more">
      <summary>Mehr Zahlen: Umfeld mit Diagrammen, Aufschlüsselung</summary>
      <div class="region-detail-extra" id="region-detail-extra" hidden></div>
      <div id="region-detail-body"></div>
    </details>
  </div>
  </main>
  <div id="print-sheet" class="print-sheet"></div>
  <dialog id="methodology-dialog" class="methodology-dialog" aria-labelledby="methodology-title">
    <div class="methodology-dialog-header">
      <h2 id="methodology-title">Methodik &amp; Datenquellen</h2>
      <div class="methodology-dialog-actions">
        <a href="./methodik.html" target="_blank" rel="noopener noreferrer" class="methodology-external-link" title="In neuem Tab öffnen">In neuem Tab ↗</a>
        <button type="button" class="methodology-close" id="methodology-close" aria-label="Schließen">×</button>
      </div>
    </div>
    <div class="methodology-dialog-body" id="methodology-dialog-body">
      <p>Lade Methodik …</p>
    </div>
  </dialog>
  <dialog id="export-dialog" class="export-dialog" aria-labelledby="export-dialog-title">
    <div class="export-dialog-header">
      <h2 id="export-dialog-title">Teilen &amp; Exportieren</h2>
      <button type="button" class="export-dialog-close" id="export-dialog-close" aria-label="Schließen">×</button>
    </div>
    <div class="export-dialog-body">
      <button type="button" class="export-dialog-item" id="export-item-share">
        <span class="export-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.05-4.11A2.99 2.99 0 1 0 14.5 5.5l-7.05 4.11a3 3 0 1 0 0 4.78l7.05 4.11a3 3 0 1 0 .45 1.55 2.99 2.99 0 0 0-.45-.05z"/></svg>
        </span>
        <span class="export-dialog-info">
          <span class="export-dialog-name" id="export-item-share-label">Ansicht teilen</span>
          <span class="export-dialog-desc" id="export-item-share-desc">Link zur aktuellen Kartenansicht kopieren</span>
        </span>
      </button>
      <button type="button" class="export-dialog-item" id="export-item-map">
        <span class="export-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        </span>
        <span class="export-dialog-info">
          <span class="export-dialog-name">Karte als Bild</span>
          <span class="export-dialog-desc">Aktuelle Karte als PNG speichern</span>
        </span>
      </button>
      <button type="button" class="export-dialog-item" id="export-item-ranking">
        <span class="export-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 4h7v3h-7v-3z"/></svg>
        </span>
        <span class="export-dialog-info">
          <span class="export-dialog-name">Rangliste als Bild</span>
          <span class="export-dialog-desc">Ranglisten-Grafik als PNG speichern</span>
        </span>
      </button>
      <button type="button" class="export-dialog-item" id="export-item-pdf">
        <span class="export-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
        </span>
        <span class="export-dialog-info">
          <span class="export-dialog-name" id="export-item-pdf-label">Drucken / PDF</span>
          <span class="export-dialog-desc" id="export-item-pdf-desc">A4-Datenblatt zum ausgewählten Gebiet</span>
        </span>
      </button>
    </div>
    <div class="export-dialog-footer">
      <span id="export-dialog-feedback" class="export-dialog-feedback" hidden></span>
    </div>
  </dialog>
  <script src="./statsClassSums.js"></script>
  <script src="./regionNavigation.js"></script>
  <script src="./statsMsgpack.js"></script>
  <script src="./simpleView.js"></script>
  <script src="./regionSearch.js"></script>
  <script src="./rankingDisplay.js"></script>
  <script src="https://unpkg.com/@turf/turf@7.2.0/turf.min.js"></script>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const CONFIG = ${JSON.stringify(config)};

    let allFeatures = [];
    let manifest = {};
    let rawLoaded = false;
    // Start before MapLibre (tile requests can starve this fetch on HTTP/1).
    const statsDataPromise = fetch(CONFIG.statsMsgpackUrl).then(async (res) => {
      if (res.ok) return { type: 'msgpack', bytes: await res.arrayBuffer() };
      const geoRes = await fetch(CONFIG.statsUrl);
      if (!geoRes.ok) {
        throw new Error('stats.msgpack fehlt – bun run bike-share-map:export-stats-geojson');
      }
      return { type: 'geojson', data: await geoRes.json() };
    });
    // {id → demographic-peer bucket key, key → label}; used by the region card. Optional.
    let peerGroupIndex = null;
    fetch(CONFIG.peersUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.byId && data.groups) peerGroupIndex = data;
      })
      .catch(() => {});
    // Region-card context figures, keyed by region id: population density, transit stops, terrain.
    // ~800 KB gzipped together, so fetched on the first region selection (ensureRegionExtraIndexes)
    // rather than on page load — a visitor who never opens a region card never pays for them.
    let densityIndex = null;
    let transitIndex = null;
    let terrainIndex = null;
    let zensusIndex = null;
    let carsIndex = null;
    let calmedIndex = null;
    let accidentsIndex = null;
    let commutersIndex = null;
    let regionExtraIndexesPromise = null;
    let currentMapMetric = 'bikeShare';
    let lastBikeShareRange = { min: 0, max: 20 };
    function ensureRegionExtraIndexes() {
      if (regionExtraIndexesPromise) return regionExtraIndexesPromise;
      const load = (url, assign) =>
        fetch(url)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.byId) assign(data);
          })
          .catch(() => {});
      regionExtraIndexesPromise = Promise.all([
        load(CONFIG.densityUrl, (data) => { densityIndex = data; }),
        load(CONFIG.transitUrl, (data) => { transitIndex = data; }),
        load(CONFIG.terrainUrl, (data) => { terrainIndex = data; }),
        load(CONFIG.zensusUrl, (data) => { zensusIndex = data; }),
        load(CONFIG.carsUrl, (data) => { carsIndex = data; }),
        load(CONFIG.calmedUrl, (data) => { calmedIndex = data; }),
        load(CONFIG.accidentsUrl, (data) => { accidentsIndex = data; }),
        load(CONFIG.commutersUrl, (data) => { commutersIndex = data; }),
      ]).then(() => {
        const selected = selectedFeatureId
          ? lastRankingFeatures.find((f) => f.properties?.id === selectedFeatureId) ||
            regionIndex?.byId.get(selectedFeatureId)
          : null;
        if (selected) {
          const props = selected.properties || {};
          renderRegionExtra(props);
          renderRegionModelGap(props);
        }
      });
      return regionExtraIndexesPromise;
    }
    // Precomputed (build time, from the full feature set) presence of Gemeindeverbände/
    // Stadtbezirke per scope — lets the Darstellung dropdown list those options correctly
    // before stats-extra.msgpack has actually been fetched. Small (a few KB); safe to await
    // eagerly alongside the core stats fetch. See RegionNav.computeLazyDarstellungPresence.
    let lazyDarstellungPresence = null;
    const lazyDarstellungPresencePromise = fetch(CONFIG.lazyDarstellungPresenceUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        lazyDarstellungPresence = data;
      })
      .catch(() => {});
    let overlaysBound = false;
    let overlayLineHighlight = null;
    let overlayLineHighlightTimer = null;
    let overlayLineHighlightBlinkTimer = null;
    let overlayHighlightBlinkOn = false;
    const OVERLAY_HIGHLIGHT_PULSE_MS = 3200;
    const OVERLAY_HIGHLIGHT_BLINK_MS = 350;

    ${viewerRegionNavScript()}
    const basemapSelect = document.getElementById('basemap-select');
    const basemapHint = document.getElementById('basemap-hint');
    const toggleBikelanes = document.getElementById('toggle-bikelanes');
    const toggleRoads = document.getElementById('toggle-roads');
    const loadError = document.getElementById('load-error');
    const loadStatus = document.getElementById('load-status');

    /**
     * Visitors got the raw exception text here, up to and including build instructions
     * ("bun run bike-share-map:export-stats-geojson"). They get a sentence they can act on;
     * the technical detail goes to the console for whoever is actually debugging.
     */
    function showLoadError(error, message) {
      console.error('[radinfra-viewer]', error);
      if (!loadError) return;
      loadError.replaceChildren();
      const text = document.createElement('span');
      text.textContent = message;
      loadError.appendChild(text);
      loadError.appendChild(document.createElement('br'));
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'load-error-retry';
      retry.textContent = 'Erneut versuchen';
      retry.addEventListener('click', () => location.reload());
      loadError.appendChild(retry);
      loadError.style.display = 'block';
    }

    function clearLoadError() {
      if (!loadError) return;
      loadError.replaceChildren();
      loadError.style.display = 'none';
    }

    // stats-core.msgpack (fetched above as statsDataPromise) omits Gemeindeverbände (level 7)
    // and Stadtbezirke (level 9) — together ~40% of the combined payload — so the first paint
    // never waits on them, and (unlike an earlier version of this) nothing fetches them in the
    // background either: lazyDarstellungPresence (tiny, precomputed at build time) already
    // tells populateDarstellungSelect which scopes have real Gemeindeverbände/Stadtbezirke data,
    // so those options list correctly without needing the actual features loaded — only once a
    // visitor actually picks one of them does applyCurrentView (below) fetch stats-extra.msgpack.
    const DARSTELLUNGEN_NEEDING_EXTRA_LEVELS = RegionNav.LAZY_LEVEL_PRESET_IDS;
    let extraLevelsLoaded = false;
    let extraLevelsPromise = null;
    // Once the real level-7/9 features are loaded, prefer them over the precomputed snapshot.
    function currentLazyPresence() {
      return extraLevelsLoaded ? undefined : lazyDarstellungPresence;
    }
    function ensureExtraLevelsLoaded() {
      if (extraLevelsLoaded) return Promise.resolve();
      if (extraLevelsPromise) return extraLevelsPromise;
      extraLevelsPromise = loadRegionFeaturesInWorker(CONFIG.statsExtraMsgpackUrl)
        .then((extraFeatures) => {
          allFeatures = allFeatures.concat(extraFeatures);
          rebuildRegionIndex();
          extraLevelsLoaded = true;
          // The Gemeindeverbände/Stadtbezirke options may only now have become selectable.
          if (typeof populateDarstellungSelect === 'function') populateDarstellungSelect();
        })
        .catch((err) => {
          extraLevelsPromise = null; // let the next call retry instead of failing forever
          throw err;
        });
      return extraLevelsPromise;
    }

    // Gemeinde polygons are not in the first download (stats-core carries the statistics and a
    // centre per Gemeinde); each Landkreis's polygons are a small file, fetched when a view draws
    // them. A feature whose geometry is still to come has no geometry but a properties.center.
    const gemeindeGeometryLoads = new Map(); // shard key → Promise, kept so a file is fetched once
    function loadGemeindeGeometryShard(key) {
      if (!gemeindeGeometryLoads.has(key)) {
        const load = fetch(CONFIG.gemeindeGeometryBase + key + '.msgpack')
          .then(async (res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' für ' + key);
            const shard = StatsPack.decodeRegionFeatures(new Uint8Array(await res.arrayBuffer()));
            for (const g of shard) {
              const target = regionIndex?.byId.get(g.properties?.id);
              if (target) target.geometry = g.geometry;
            }
          })
          .catch((err) => {
            gemeindeGeometryLoads.delete(key); // let the next view retry
            throw err;
          });
        gemeindeGeometryLoads.set(key, load);
      }
      return gemeindeGeometryLoads.get(key);
    }
    /** Make sure every given feature has its polygon; fetches only the Landkreis files missing. */
    async function ensureGemeindeGeometry(features) {
      const keys = new Set();
      for (const f of features) {
        if (!f.geometry && f.properties?.center) keys.add(StatsPack.gemeindeGeometryShardKey(f.properties));
      }
      if (!keys.size) return;
      setLoadStatus('Lade Gemeindegrenzen …');
      try {
        // A view of all of Germany needs ~400 small files: a few at a time, not all at once.
        const queue = [...keys];
        const worker = async () => {
          while (queue.length) await loadGemeindeGeometryShard(queue.shift());
        };
        await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
      } finally {
        setLoadStatus('');
      }
    }

    const statsReadyPromise = statsDataPromise
      .then((data) => {
        if (data.type === 'msgpack') {
          allFeatures = StatsPack.decodeRegionFeatures(new Uint8Array(data.bytes));
        } else {
          // The geojson fallback (msgpack fetch failed) ships every level in one file, so
          // there is no separate "extra" chunk left to fetch afterwards.
          allFeatures = data.data.features || [];
          extraLevelsLoaded = true;
        }
        rebuildRegionIndex();
        rawLoaded = true;
        if (loadStatus) loadStatus.textContent = '';
      })
      .catch((e) => {
        showLoadError(
          e,
          'Die Gebietsdaten konnten nicht geladen werden. Bitte die Internetverbindung prüfen.',
        );
        throw e;
      });

    const rankingDetails = document.getElementById('ranking-details');
    const rankingScroll = document.getElementById('ranking-scroll');
    const rankingToolbar = document.getElementById('ranking-toolbar');
    const viewCsvBtnToolbar = document.getElementById('view-csv-btn-toolbar');
    const viewCsvBtnFull = document.getElementById('view-csv-btn-full');
    const rankingModeButtons = [...document.querySelectorAll('.ranking-mode-btn')];
    const colorScaleSelect = document.getElementById('color-scale-select');
    const colorScaleHint = document.getElementById('color-scale-hint');
    const mapMetricSelect = document.getElementById('map-metric-select');
    const legendBar = document.getElementById('legend-bar');
    const bikelaneSwatch = document.getElementById('bikelane-swatch');
    const roadSwatch = document.getElementById('road-swatch');
    const overlayBikelaneColorInput = document.getElementById('overlay-bikelane-color');
    const overlayRoadColorInput = document.getElementById('overlay-road-color');
    const overlayBikelaneMinzoomInput = document.getElementById('overlay-bikelane-minzoom');
    const overlayRoadMinzoomMajorInput = document.getElementById('overlay-road-minzoom-major');
    const overlayRoadMinzoomFullInput = document.getElementById('overlay-road-minzoom-full');
    const scaleCapHint = document.getElementById('scale-cap-hint');
    const scaleRobustEnabledCb = document.getElementById('scale-robust-enabled');
    const scaleCapEnabledCb = document.getElementById('scale-cap-enabled');
    const scaleCapPctInput = document.getElementById('scale-cap-pct');
    const shareFab = document.getElementById('share-fab');
    const exportDialog = document.getElementById('export-dialog');
    const exportDialogClose = document.getElementById('export-dialog-close');
    const exportDialogFeedback = document.getElementById('export-dialog-feedback');
    const exportItemShare = document.getElementById('export-item-share');
    const exportItemShareLabel = document.getElementById('export-item-share-label');
    const exportItemShareDesc = document.getElementById('export-item-share-desc');
    const exportItemMap = document.getElementById('export-item-map');
    const exportItemRanking = document.getElementById('export-item-ranking');
    const exportItemPdf = document.getElementById('export-item-pdf');
    const exportItemPdfLabel = document.getElementById('export-item-pdf-label');
    const exportItemPdfDesc = document.getElementById('export-item-pdf-desc');
    const copyViewLinkBtn = exportItemShare;
    const shareMapImageBtn = exportItemMap;
    const shareRankingImageBtn = exportItemRanking;
    const shareNativeBtn = null;
    const shareToolbar = null;
    const copyViewLinkFeedback = document.getElementById('copy-view-link-feedback');
    const panelMain = document.getElementById('panel-main');
    const panelSummaryPreview = document.getElementById('panel-summary-preview');
    const panelMobileMq = window.matchMedia('${PHONE_MEDIA}');
    if (scaleCapPctInput) scaleCapPctInput.value = String(CONFIG.defaultColorCapPct);
    if (scaleCapEnabledCb) scaleCapEnabledCb.checked = CONFIG.defaultColorCapEnabled;
    if (scaleRobustEnabledCb) scaleRobustEnabledCb.checked = CONFIG.defaultRobustScaleEnabled;
    let lastScaleCapViewAllowed = false;
    let lastRankingViewAvailable = false;
    let lastPctRange = { min: 0, max: 20, scaleCapped: false, dataMax: 20 };
    let lastRankingFeatures = [];
    let lastRankingSorted = [];
    let lastRankingMinPct = 0;
    let lastRankingMaxPct = 20;
    let rankingMode = 'topflop';
    const DEFAULT_RANKING_TOP_N = 11;
    const rankByFeatureId = new Map();
    let selectedFeatureId = null;
    let selectedFeatureOverride = null;
    let refitScopeOnNextApply = false;
    // While a selection is being made the card and sheet re-pad the map along the way; the
    // camera must be decided once, after all of that (see selectRegionById).
    let deferMapReveal = false;
    let regionClickBound = false;
    const regionDetailEl = document.getElementById('region-detail');
    const regionDetailTitle = document.getElementById('region-detail-title');
    const regionDetailMeta = document.getElementById('region-detail-meta');
    const regionDetailGap = document.getElementById('region-detail-gap');
    const regionDetailPeerGap = document.getElementById('region-detail-peer-gap');
    const regionDetailModelGap = document.getElementById('region-detail-model-gap');
    const regionDetailExtra = document.getElementById('region-detail-extra');
    const regionDetailMore = document.getElementById('region-detail-more');
    regionDetailMore?.addEventListener('toggle', () => reopenContextPlot());
    const regionDetailQuality = document.getElementById('region-detail-quality');
    const regionDetailBody = document.getElementById('region-detail-body');
    const regionDetailActions = document.getElementById('region-detail-actions');
    const regionDetailAuthority = document.getElementById('region-detail-authority');
    const regionDetailClose = document.getElementById('region-detail-close');
    const regionDetailMount = document.getElementById('region-detail-mount');
    // Anchor marking the card's home spot (floating card, desktop) so it can be moved back.
    const regionDetailAnchor = document.createComment('region-detail-home');
    regionDetailEl.parentNode.insertBefore(regionDetailAnchor, regionDetailEl);

    /**
     * On mobile the selected-region card lives at the top of the settings sheet so its
     * street-type breakdown and the region ranking scroll together; on desktop it stays
     * the floating bottom-right card.
     */
    function placeRegionDetail() {
      const inSheet =
        typeof sheetEnabled === 'function' && sheetEnabled() && !regionDetailEl.hidden;
      if (inSheet) {
        if (regionDetailEl.parentNode !== regionDetailMount) regionDetailMount.appendChild(regionDetailEl);
      } else if (regionDetailEl.parentNode !== regionDetailAnchor.parentNode) {
        regionDetailAnchor.parentNode.insertBefore(regionDetailEl, regionDetailAnchor);
      }
    }

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
      syncCountingUi();
    }

    function onLengthClassFilterChange() {
      const prevScrollTop = panelMain ? panelMain.scrollTop : 0;
      lengthClassFilter = readLengthClassFilterFromUi();
      clearOverlayLineHighlight();
      updateOverlayLayerFilters();
      if (rawLoaded) repaintRegionsFromCounting();
      syncCountingUi();
      applyOverlayLineColors();
      if (panelMain) {
        panelMain.scrollTop = prevScrollTop;
        requestAnimationFrame(() => {
          if (panelMain && panelMain.scrollTop !== prevScrollTop) {
            panelMain.scrollTop = prevScrollTop;
          }
        });
      }
    }

    function applyRadinfraDefaultCounting() {
      const prevScrollTop = panelMain ? panelMain.scrollTop : 0;
      lengthClassFilter = structuredClone(CONFIG.radinfraDefaultFilter);
      applyLengthClassFilterToUi(lengthClassFilter);
      clearOverlayLineHighlight();
      updateOverlayLayerFilters();
      if (rawLoaded) repaintRegionsFromCounting();
      syncCountingUi();
      applyOverlayLineColors();
      if (panelMain) {
        panelMain.scrollTop = prevScrollTop;
        requestAnimationFrame(() => {
          if (panelMain && panelMain.scrollTop !== prevScrollTop) {
            panelMain.scrollTop = prevScrollTop;
          }
        });
      }
    }

    function listExcludedCountingClasses(filter) {
      const excluded = [];
      const defaultFilter = CONFIG.radinfraDefaultFilter;
      for (const opt of CONFIG.roadClassOptions) {
        if (defaultFilter.road[opt.id] && !filter.road[opt.id]) {
          excluded.push('Straßen: ' + opt.label);
        }
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        if (defaultFilter.bikelane[opt.id] && !filter.bikelane[opt.id]) {
          excluded.push('Radinfrastruktur: ' + opt.label);
        }
      }
      return excluded;
    }

    /**
     * The count definition: either the Radinfra.de standard or a deviation from it. The legend
     * always says which one the numbers are based on (a number is only comparable if its
     * definition is visible next to it); here the status line says it too, offers the way back,
     * and each class group shows how many of its classes are on.
     */
    function syncCountingUi() {
      const filter = readLengthClassFilterFromUi();
      const isStandard = lengthClassFiltersEqual(filter, CONFIG.radinfraDefaultFilter);
      const stateLabel = document.getElementById('counting-state-label');
      const resetBtn = document.getElementById('counting-reset');
      const legendLabel = document.getElementById('metric-definition-counting');
      if (stateLabel) {
        stateLabel.textContent = isStandard ? 'Radinfra.de-Standard' : 'Eigene Zählung';
        stateLabel.parentElement?.classList.toggle('counting-state--custom', !isStandard);
      }
      if (resetBtn) resetBtn.hidden = isStandard;
      if (legendLabel) {
        legendLabel.textContent = isStandard
          ? 'nach Radinfra.de-Standard'
          : 'nach eigener Zählung (weicht vom Radinfra.de-Standard ab)';
      }
      for (const [kind, options] of [
        ['road', CONFIG.roadClassOptions],
        ['bikelane', CONFIG.bikelaneClassOptions],
      ]) {
        const on = options.filter((opt) => filter[kind][opt.id]).length;
        const changed = options.some((opt) => !!filter[kind][opt.id] !== !!CONFIG.radinfraDefaultFilter[kind][opt.id]);
        const count = document.getElementById(kind + '-class-count');
        if (count) count.textContent = '(' + on + ' von ' + options.length + ')';
        document.getElementById(kind + '-class-group')?.classList.toggle('counting-group--changed', changed);
      }
    }

    /** A count that arrives through the URL deviates somewhere: show where, rather than hide it. */
    function openChangedCountingGroups() {
      for (const kind of ['road', 'bikelane']) {
        const group = document.getElementById(kind + '-class-group');
        if (group?.classList.contains('counting-group--changed')) group.open = true;
      }
    }

    function initCountClassFilters() {
      const roadRoot = document.getElementById('road-class-filters');
      const bikeRoot = document.getElementById('bikelane-class-filters');
      if (!roadRoot || !bikeRoot) return;
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
      document.getElementById('counting-reset')?.addEventListener('click', applyRadinfraDefaultCounting);
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
      const lowRoad = TildaStats.isLowRoadNetworkForScale(road);

      const cars = carsIndex?.byId[p.id]?.carsPer1000 ?? null;
      const rent = zensusIndex?.byId[p.id]?.rentPerM2 ?? null;
      const accidents = accidentsIndex?.byId[p.id];
      const bikeAccidentsPer10k = accidents?.bikeAccidentsPer10k ?? null;
      const bikeAccidents = accidents?.bikeAccidents ?? null;
      const bikeFatalOrSevere = accidents?.bikeFatalOrSevere ?? null;
      const commuters = commutersIndex?.byId[p.id];
      const netCommuters = commuters?.netCommuters ?? null;
      const inCommuters = commuters?.inCommuters ?? null;
      const outCommuters = commuters?.outCommuters ?? null;
      const inCommuterSharePct = commuters?.inCommuterSharePct ?? null;
      const outCommuterSharePct = commuters?.outCommuterSharePct ?? null;
      const jobCentrality = commuters?.jobCentrality ?? null;
      const employedAtWorkplace = commuters?.employedAtWorkplace ?? null;
      const employedAtResidence = commuters?.employedAtResidence ?? null;
      const workplaces = commuters?.workplaces ?? null;

      let modelPrediction = null;
      let modelGapPct = null;
      let expectedPct = null;

      if (densityIndex && terrainIndex && !lowRoad && road > 0) {
        const dens = densityIndex?.byId[p.id];
        const slope = terrainIndex?.byId[p.id]?.road;
        const elev = terrainIndex?.byId[p.id]?.elevationMean;
        const stDist =
          transitIndex?.byId[p.id]?.avgDistanceToStationM != null
            ? transitIndex.byId[p.id].avgDistanceToStationM / 1000
            : null;
        const livingSharePct = calmedIndex?.byId[p.id]?.livingSharePct;

        modelPrediction = RankingDisplay.computeStructuralModelPrediction({
          roadKm: road,
          bikeKm: bike,
          roadSlope: typeof slope === 'number' ? slope : null,
          elevMean: typeof elev === 'number' ? elev : null,
          density: typeof dens === 'number' ? dens : null,
          stDistKm: typeof stDist === 'number' ? stDist : null,
          rent: typeof rent === 'number' ? rent : null,
          carsPer1000: typeof cars === 'number' ? cars : null,
          livingSharePct: typeof livingSharePct === 'number' ? livingSharePct : null,
        });
        if (modelPrediction) {
          modelGapPct = modelPrediction.diffPct;
          expectedPct = modelPrediction.expectedPct;
        }
      }

      const name = p.name || p.id;
      let label = '';
      if (currentMapMetric === 'modelGap') {
        if (modelGapPct != null && pct != null && expectedPct != null) {
          const sign = modelGapPct > 0 ? '+' : '';
          label =
            name +
            ': ' +
            sign +
            formatUiPct(modelGapPct) +
            ' %-Punkte ggü. Erwartung\\n(Tatsächlich: ' +
            formatUiPct(pct) +
            ' %, Erwartet: ' +
            formatUiPct(expectedPct) +
            ' %)';
        } else if (lowRoad) {
          label = name + ': Keine Modellprognose (wenig Straßennetz)';
        } else {
          label = name + ': Keine Modellprognose verfügbar';
        }
      } else if (currentMapMetric === 'cars') {
        if (typeof cars === 'number') {
          label = name + ': ' + deNumber(Math.round(cars), 0) + ' PKW je 1.000 Einw.';
        } else {
          label = name + ': Keine PKW-Daten verfügbar';
        }
      } else if (currentMapMetric === 'rent') {
        if (typeof rent === 'number') {
          label = name + ': ' + deNumber(rent, 2) + ' €/m² Ø Nettokaltmiete';
        } else {
          label = name + ': Keine Mietdaten verfügbar';
        }
      } else if (currentMapMetric === 'accidents') {
        if (typeof bikeAccidentsPer10k === 'number') {
          label =
            name +
            ': ' +
            deNumber(bikeAccidentsPer10k, 1) +
            ' Fahrradunfälle / 10.000 Einw.\\n(' +
            deNumber(bikeAccidents, 0) +
            ' Unfälle mit Personenschaden, davon ' +
            (bikeFatalOrSevere ?? 0) +
            ' schwer/tödlich)';
        } else {
          label = name + ': Keine Unfalldaten verfügbar';
        }
      } else if (currentMapMetric === 'commuters') {
        if (typeof netCommuters === 'number') {
          const sign = netCommuters > 0 ? '+' : '';
          label =
            name +
            ': ' +
            sign +
            deNumber(netCommuters, 0) +
            ' Pendlersaldo\\n(' +
            deNumber(inCommuters, 0) +
            ' Einpendler, ' +
            deNumber(outCommuters, 0) +
            ' Auspendler' +
            (typeof inCommuterSharePct === 'number'
              ? ', ' + deNumber(inCommuterSharePct, 1) + ' % Einpendlerquote'
              : '') +
            ')';
        } else {
          label = name + ': Keine Pendlerdaten verfügbar';
        }
      } else {
        label =
          name +
          ': ' +
          (pct != null ? formatUiPct(pct) : '–') +
          ' %\\n' +
          TildaStats.formatStatKm(bike, TildaStats.STAT_KM_BIKE_UI_DECIMALS) +
          ' km / ' +
          TildaStats.formatStatKm(road, TildaStats.STAT_KM_ROAD_UI_DECIMALS) +
          ' km';
        if (lowRoad && pct != null) {
          label += '\\n(wenig Straßennetz – Anteil kann unrepräsentativ sein)';
        }
      }
      return {
        type: 'Feature',
        id: p.id,
        geometry: f.geometry,
        properties: {
          ...p,
          roadSumKm: road,
          bikelaneSumKm: bike,
          bikeSharePct: pct != null ? pct : 0,
          modelGapPct,
          expectedPct,
          carsPer1000: cars,
          rentColdM2: rent,
          bikeAccidentsPer10k,
          bikeAccidents,
          bikeFatalOrSevere,
          netCommuters,
          inCommuters,
          outCommuters,
          inCommuterSharePct,
          outCommuterSharePct,
          jobCentrality,
          employedAtWorkplace,
          employedAtResidence,
          workplaces,
          lowRoad,
          label,
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

    function downloadFilenameForView() {
      const label = RegionNav.viewLabel(currentViewScope, regionIndex);
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
      if (kind === 'num0') return TildaStats.formatStatKm(n, 0);
      if (kind === 'num1') return TildaStats.formatStatKm(n, 1);
      if (kind === 'num2') return TildaStats.formatStatKm(n, 2);
      return String(raw);
    }

    function csvStatColumns() {
      const cols = [
        { key: 'rank', header: 'Platz', numeric: false },
        { key: 'id', header: 'OSM-ID', numeric: false },
        { key: 'name', header: 'Name', numeric: false },
        { key: 'level', header: 'Verwaltungsebene', numeric: false },
        { key: 'bundesland_id', header: 'Bundesland-ID', numeric: false },
        { key: 'landkreis_id', header: 'Landkreis-ID', numeric: false },
        { key: 'road_km', header: 'Straßen (km)', numeric: 'km' },
        { key: 'bikelane_km', header: 'Radinfra (km)', numeric: 'km' },
        { key: 'bike_share_pct', header: 'Radinfra-Anteil (%)', numeric: 'pct' },
        { key: 'data_quality', header: 'Datenlage', numeric: false },
        { key: 'unclear_share_pct', header: 'Davon unklar getaggt (%)', numeric: 'num1' },
        { key: 'share_without_unclear_pct', header: 'Radinfra-Anteil ohne unklare Wege (%)', numeric: 'pct' },
        { key: 'density', header: 'Einwohner pro km²', numeric: 'num0' },
        { key: 'rent', header: 'Ø Nettokaltmiete (€/m², Zensus 2022)', numeric: 'num2' },
        { key: 'youth', header: 'Kinder & Jugendliche unter 18 (%)', numeric: 'num1' },
        { key: 'vacancy', header: 'Wohnungsleerstand (%)', numeric: 'num1' },
        { key: 'carDensity', header: 'PKW je 1.000 Einwohner (KBA)', numeric: 'num0' },
        { key: 'calmedShare', header: 'Wohn- & Tempo-30-Netz Anteil (%)', numeric: 'pct' },
        { key: 'livingShare', header: 'Verkehrsberuhigt & Fahrradstraßen Anteil (%)', numeric: 'pct' },
        { key: 'bikeAccidents', header: 'Fahrradunfälle mit Personenschaden (Unfallatlas 2023)', numeric: 'num0' },
        { key: 'bikeAccidentsPer10k', header: 'Fahrradunfälle je 10.000 Einwohner', numeric: 'num1' },
        { key: 'bikeFatalOrSevere', header: 'Fahrradunfälle mit Getöteten/Schwerverletzten', numeric: 'num0' },
        { key: 'netCommuters', header: 'Pendlersaldo (BA 2025)', numeric: 'num0' },
        { key: 'inCommuters', header: 'Einpendler (BA 2025)', numeric: 'num0' },
        { key: 'outCommuters', header: 'Auspendler (BA 2025)', numeric: 'num0' },
        { key: 'inCommuterSharePct', header: 'Einpendlerquote (%)', numeric: 'pct' },
        { key: 'outCommuterSharePct', header: 'Auspendlerquote (%)', numeric: 'pct' },
        { key: 'jobCentrality', header: 'Arbeitsplatzzentralität (Arbeitsorte / Wohnorte)', numeric: 'num2' },
        { key: 'employedAtWorkplace', header: 'Sozialvers. Beschäftigte am Arbeitsort (BA 2025)', numeric: 'num0' },
        { key: 'employedAtResidence', header: 'Sozialvers. Beschäftigte am Wohnort (BA 2025)', numeric: 'num0' },
        { key: 'stops', header: 'Bahn-/Tram-/Fähr-Haltestellen pro km²', numeric: 'num2' },
        { key: 'stationDistance', header: 'Ø Luftlinie zur nächsten Haltestelle (km, einwohnergewichtet)', numeric: 'num1' },
        ...STATION_ACCESS_MODES.flatMap((m) => [
          { key: 'station_' + m.key + '_min', header: 'Ø ' + m.csv + ' zur nächsten Haltestelle (min, einwohnergewichtet)', numeric: 'num1' },
          { key: 'station_' + m.key + '_km', header: 'Ø ' + m.csv + ' zur nächsten Haltestelle (km, entlang der Wege)', numeric: 'num1' },
          { key: 'station_' + m.key + '_within_pct', header: 'Einwohner ' + m.csv + ' in 10 min an einer Haltestelle (%)', numeric: 'num1' },
        ]),
        { key: 'highwayDistance', header: 'Ø Distanz zur nächsten Autobahn/Kraftfahrstraße (km, einwohnergewichtet)', numeric: 'num1' },
        { key: 'elevation', header: 'Höhenlage Ø (m)', numeric: 'num0' },
        { key: 'elevation_range', header: 'Höhenspanne (m)', numeric: 'num0' },
        { key: 'areaSlope', header: 'Geländesteigung Ø (%)', numeric: 'num1' },
        { key: 'roadSlope', header: 'Straßensteigung Ø (%)', numeric: 'num1' },
        { key: 'roadSteep', header: 'Steilste Straßenabschnitte P95 (%)', numeric: 'num1' },
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

    const DATA_QUALITY_CSV_LABELS = {
      good: 'gut',
      mixed: 'mittel',
      poor: 'unsicher',
      sparse: 'kaum erfasst',
    };

    function statsRowFromFeature(f, rank, contextByKey) {
      const p = f.properties || {};
      const roadKm = p.roadSumKm ?? 0;
      const bikeKm = p.bikelaneSumKm ?? 0;
      const roadSums = TildaStats.getRoadSums(lengthRecordForStats(p.road_length));
      const bikeSums = TildaStats.getBikelaneSums(lengthRecordForStats(p.bikelane_length));
      const row = {
        rank: rank ?? '',
        id: p.id ?? '',
        name: p.name ?? '',
        level: p.level ?? '',
        bundesland_id: p.bundesland_id ?? '',
        landkreis_id: p.landkreis_id ?? '',
        road_km: roadKm,
        bikelane_km: bikeKm,
        bike_share_pct: roadKm > 0 ? (bikeKm / roadKm) * 100 : '',
      };
      const mainRoads = mainRoadBreakdownFor(p);
      if (mainRoads) {
        row.main_road_km = mainRoads.roadKm;
        row.main_road_bikelane_km = mainRoads.bikeKm;
        row.main_road_share_pct = mainRoads.pct;
        for (const a of mainRoads.byAuthority) row['main_road_share_pct_' + a.authority] = a.pct;
      }
      const quality = TildaStats.assessBikeDataQuality(p.road_length, p.bikelane_length);
      row.data_quality = quality ? DATA_QUALITY_CSV_LABELS[quality.level] : '';
      if (quality && quality.level !== 'sparse') {
        row.unclear_share_pct = quality.unclearShare * 100;
        // Only a different number when the unclear ways are part of the current count.
        if (roadKm > 0 && lengthClassFilter.bikelane.needsClarification) {
          row.share_without_unclear_pct = Math.max(0, ((bikeKm - quality.unclearKm) / roadKm) * 100);
        }
      }
      for (const [key, metric] of Object.entries(contextByKey || {})) {
        const v = metric.get(p.id);
        if (v != null && Number.isFinite(v)) row[key] = v;
      }
      const range = terrainIndex?.byId[p.id]?.elevationRange;
      if (typeof range === 'number') row.elevation_range = range;
      const access = transitIndex?.byId[p.id]?.access;
      for (const m of STATION_ACCESS_MODES) {
        const a = access?.[m.key];
        if (!a) continue;
        row['station_' + m.key + '_min'] = a[0];
        row['station_' + m.key + '_km'] = a[1];
        row['station_' + m.key + '_within_pct'] = a[2];
      }
      for (const opt of CONFIG.roadClassOptions) {
        row['road_km_' + opt.id] = roadSums[opt.id] ?? 0;
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        row['bikelane_km_' + opt.id] = bikeSums[opt.id] ?? 0;
      }
      return row;
    }

    function buildStatsCsv(features) {
      const contextByKey = Object.fromEntries(contextMetrics().map((m) => [m.key, m]));
      const sorted = [...features].sort(compareByBikeShare);
      const rankIndex = new Map();
      sorted
        .filter(isRanked)
        .forEach((f, i) => {
          const id = f.properties?.id;
          if (id) rankIndex.set(id, i + 1);
        });
      const columns = csvStatColumns();
      const header = columns.map((c) => csvEscape(c.header)).join(CSV_SEP);
      const lines = sorted.map((f) => {
        const id = f.properties?.id;
        const row = statsRowFromFeature(f, id ? rankIndex.get(id) : '', contextByKey);
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
      return filteredFeaturesForCurrentView().map(enrichFeature);
    }

    function downloadStatsCsv(features, filename) {
      if (!features.length) {
        showCopyViewLinkFeedback('Keine Gebiete zum Export.', true);
        return;
      }
      const csv = buildStatsCsv(features);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    /** The context figures are fetched on the first region selection; an export needs them too. */
    async function whenRegionExtraIndexesReady() {
      ensureRegionExtraIndexes();
      await regionExtraIndexesPromise;
    }

    async function downloadCurrentViewData() {
      if (!rawLoaded) return;
      await whenRegionExtraIndexesReady();
      downloadStatsCsv(currentViewFeaturesForExport(), downloadFilenameForView());
    }

    async function downloadFullStatsData() {
      if (!rawLoaded) return;
      // "Gesamt" means every region, including Gemeindeverbände/Stadtbezirke — load them even
      // if the current Darstellung never needed them.
      if (!extraLevelsLoaded) {
        try {
          await ensureExtraLevelsLoaded();
        } catch {
          /* export with whatever loaded rather than blocking the download entirely */
        }
      }
      await whenRegionExtraIndexesReady();
      lengthClassFilter = readLengthClassFilterFromUi();
      downloadStatsCsv(allFeatures.map(enrichFeature), 'radinfra-gesamt.csv');
    }

    function setCsvExportEnabled(enabled) {
      const toolbarBtn = document.getElementById('view-csv-btn-toolbar');
      const fullBtn = document.getElementById('view-csv-btn-full');
      if (toolbarBtn) toolbarBtn.disabled = !enabled;
      if (fullBtn) fullBtn.disabled = !enabled;
    }

    function setPanelActionsEnabled(enabled) {
      setCsvExportEnabled(enabled);
      if (shareFab) shareFab.disabled = !enabled;
      if (exportItemShare) exportItemShare.disabled = !enabled;
      if (exportItemMap) exportItemMap.disabled = !enabled;
      if (exportItemRanking) exportItemRanking.disabled = !enabled;
    }

    const LEGEND_TICK_COUNT = 5;

    /**
     * The choropleth interpolates linearly from min to max, so an evenly spaced value sits at
     * the same relative position on the bar. Labelling only the two ends left every mid-tone
     * unreadable, which is most of the map.
     */
    function updateLegendRange(min, max, metric) {
      metric = metric || currentMapMetric || 'bikeShare';
      const labels = document.getElementById('legend-labels');
      const ticks = document.getElementById('legend-ticks');
      const cmlMin = document.getElementById('cml-min');
      const cmlMax = document.getElementById('cml-max');
      const cmlTitle = document.querySelector('.cml-title');
      const choroplethTitle = document.getElementById('choropleth-legend-title');
      const metricDef = document.getElementById('metric-definition');

      if (cmlTitle) {
        if (metric === 'modelGap') cmlTitle.textContent = 'Modell-Abweichung';
        else if (metric === 'cars') cmlTitle.textContent = 'PKW / 1.000 Einw.';
        else if (metric === 'rent') cmlTitle.textContent = 'Ø Nettokaltmiete';
        else if (metric === 'accidents') cmlTitle.textContent = 'Fahrradunfälle / 10k';
        else if (metric === 'commuters') cmlTitle.textContent = 'Pendlersaldo';
        else cmlTitle.textContent = 'Radinfra-Anteil';
      }

      if (choroplethTitle) {
        if (metric === 'modelGap') choroplethTitle.textContent = 'Flächenfarbe (Modell-Abweichung)';
        else if (metric === 'cars') choroplethTitle.textContent = 'Flächenfarbe (PKW je 1.000 Einw.)';
        else if (metric === 'rent') choroplethTitle.textContent = 'Flächenfarbe (Ø Nettokaltmiete)';
        else if (metric === 'accidents') choroplethTitle.textContent = 'Flächenfarbe (Fahrradunfälle / 10.000 Einw.)';
        else if (metric === 'commuters') choroplethTitle.textContent = 'Flächenfarbe (Pendlersaldo)';
        else choroplethTitle.textContent = 'Flächenfarbe (Radinfra-Anteil)';
      }

      if (metricDef) {
        if (metric === 'modelGap') {
          metricDef.innerHTML =
            'Differenz tatsächlicher Ausbau minus Erwartungswert. ' +
            '<strong>Grün</strong> = mehr Radinfrastruktur als erwartet (Vorreiter), ' +
            '<strong>Rot</strong> = weniger als erwartet (Nachzügler).';
        } else if (metric === 'cars') {
          metricDef.textContent =
            'Bestand an gemeldeten Personenkraftwagen (PKW) je 1.000 Einwohner (Quelle: KBA).';
        } else if (metric === 'rent') {
          metricDef.textContent =
            'Durchschnittliche Nettokaltmiete in Euro je m² Wohnfläche (Quelle: Zensus 2022).';
        } else if (metric === 'accidents') {
          metricDef.textContent =
            'Fahrradunfälle mit Personenschaden je 10.000 Einwohner (Quelle: Destatis Unfallatlas 2023).';
        } else if (metric === 'commuters') {
          metricDef.innerHTML =
            'Differenz Einpendler minus Auspendler. ' +
            '<strong>Grün</strong> = Arbeitsplatzzentrum (Einpendlerüberschuss), ' +
            '<strong>Rot</strong> = Pendler-Wohnort (Auspendlerüberschuss). Quelle: Bundesagentur für Arbeit (BA 2025).';
        } else {
          metricDef.innerHTML =
            'Länge der Radinfrastruktur ÷ Länge aller Straßen (km), ' +
            '<span id="metric-definition-counting">nach Radinfra.de-Standard</span>. ' +
            '<a href="./methodik.html">So wird gezählt</a>';
        }
      }

      if (cmlMin) {
        if (metric === 'modelGap') cmlMin.textContent = (min > 0 ? '+' : '') + formatUiPct(min) + ' %';
        else if (metric === 'cars') cmlMin.textContent = deNumber(Math.round(min), 0);
        else if (metric === 'rent') cmlMin.textContent = deNumber(min, 1) + ' €';
        else if (metric === 'accidents') cmlMin.textContent = deNumber(min, 1);
        else if (metric === 'commuters') cmlMin.textContent = (min > 0 ? '+' : '') + deNumber(Math.round(min), 0);
        else cmlMin.textContent = formatUiPct(min) + ' %';
      }
      if (cmlMax) {
        if (metric === 'modelGap') cmlMax.textContent = (max > 0 ? '+' : '') + formatUiPct(max) + ' %';
        else if (metric === 'cars') cmlMax.textContent = deNumber(Math.round(max), 0) + ' PKW';
        else if (metric === 'rent') cmlMax.textContent = deNumber(max, 1) + ' €/m²';
        else if (metric === 'accidents') cmlMax.textContent = deNumber(max, 1) + ' / 10k';
        else if (metric === 'commuters') cmlMax.textContent = (max > 0 ? '+' : '') + deNumber(Math.round(max), 0);
        else cmlMax.textContent = formatUiPct(max) + ' %';
      }

      if (!labels) return;
      const span = max - min;
      const count = span > 0 ? LEGEND_TICK_COUNT : 2;
      labels.replaceChildren();
      if (ticks) ticks.replaceChildren();
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const val = min + span * t;
        const el = document.createElement('span');
        let text = '';
        if (metric === 'modelGap') {
          text = (val > 0 ? '+' : '') + formatUiPct(val) + (i === count - 1 ? ' %' : '');
        } else if (metric === 'cars') {
          text = deNumber(Math.round(val), 0) + (i === count - 1 ? ' PKW' : '');
        } else if (metric === 'rent') {
          text = deNumber(val, 1) + (i === count - 1 ? ' €/m²' : '');
        } else if (metric === 'accidents') {
          text = deNumber(val, 1) + (i === count - 1 ? ' / 10k' : '');
        } else if (metric === 'commuters') {
          text = (val > 0 ? '+' : '') + deNumber(Math.round(val), 0);
        } else {
          text = formatUiPct(val) + (i === count - 1 ? ' %' : '');
        }
        el.textContent = text;
        if (i === 0) {
          el.className = 'legend-label--start';
        } else if (i === count - 1) {
          el.className = 'legend-label--end';
        } else {
          el.style.left = t * 100 + '%';
          if (ticks) {
            const tick = document.createElement('span');
            tick.style.left = t * 100 + '%';
            ticks.appendChild(tick);
          }
        }
        labels.appendChild(el);
      }
    }

    function gebiete(n) {
      return n + (n === 1 ? ' Gebiet' : ' Gebiete');
    }

    /** One short line under the legend; the scale's fine print folds away below it. */
    function updateViewMetaText(filtered, range) {
      let metaText = gebiete(filtered.length);
      const details = [];
      if (range.scaleCapped) {
        const robust = range.robustApplied && !getScaleCapSettings().enabled;
        const endPct = robust ? formatUiPct(range.max) : String(range.capPct);
        metaText += ' · höhere Werte als ' + endPct + ' % gleich gefärbt';
        if (range.dataMax > range.max || !robust) {
          details.push('Höchster Wert: ' + formatUiPct(range.dataMax) + ' %');
        }
        if (robust && range.outlierCount > 0) {
          details.push(
            range.outlierCount +
              (range.outlierCount === 1 ? ' Gebiet liegt' : ' Gebiete liegen') +
              ' darüber und würden die Farben sonst zusammendrücken',
          );
        }
        if (robust && range.excludedLowRoadCount > 0) {
          details.push(gebiete(range.excludedLowRoadCount) + ' mit sehr wenig Straßen (ohne Rang)');
        }
      }
      document.getElementById('view-meta').textContent = metaText;
      const more = document.getElementById('view-meta-more');
      if (more) {
        document.getElementById('view-meta-more-text').textContent = details.join(' · ') + '.';
        more.hidden = details.length === 0;
      }
      updateScaleCapHint();
      updateNationalContext();
    }

    /** Nationwide reference value (Deutschland row), recomputed under the current counting filter. */
    function updateNationalContext() {
      const el = document.getElementById('national-context');
      if (!el) return;
      const de = allFeatures.find((f) => String(f.properties?.level ?? '') === '2');
      const p = de ? enrichFeature(de).properties : null;
      if (!p || !(p.roadSumKm > 0) || typeof p.bikeSharePct !== 'number') {
        el.hidden = true;
        return;
      }
      el.textContent =
        'Bundesweit: ' + formatUiPct(p.bikeSharePct) + ' % der Straßen mit Radinfrastruktur';
      el.hidden = false;
    }

    function repaintRegionsFromCounting() {
      const filtered = filteredFeaturesForCurrentView().map(enrichFeature);
      const bikeRange = colorScaleRange(filtered);
      lastBikeShareRange = bikeRange;
      const activeRange = colorScaleRangeForMetric(currentMapMetric, filtered);
      const { min, max } = activeRange;
      lastPctRange = { min, max, scaleCapped: activeRange.scaleCapped, dataMax: activeRange.dataMax };
      updateLegendRange(min, max, currentMapMetric);
      lastRankingFeatures = filtered;
      updateRanking(filtered, bikeRange.min, bikeRange.max);
      updateViewMetaText(filtered, activeRange);
      refreshSelectedRegionIfNeeded();
      const geojson = buildRegionGeojson(filtered);
      const src = map.getSource('regions');
      if (src) {
        src.setData(geojson);
        updateRegionColors(min, max);
        map.triggerRepaint();
      } else if (rawLoaded) {
        void applyCurrentView();
      }
    }

    function defaultScaleCapEnabledForView() {
      return viewShowsManyGemeindenForCurrentView()
        ? CONFIG.defaultColorCapEnabled
        : false;
    }

    function defaultRobustScaleEnabledForView() {
      return viewShowsGemeindenLevelForCurrentView()
        ? CONFIG.defaultRobustScaleEnabled
        : false;
    }

    function getScaleCapSettings() {
      const capPct = Math.max(
        5,
        Math.min(500, Number(scaleCapPctInput.value) || CONFIG.defaultColorCapPct),
      );
      return {
        enabled: scaleCapEnabledCb.checked,
        capPct,
        robustEnabled: scaleRobustEnabledCb.checked,
      };
    }

    function updateScaleCapDefaultForView() {
      const gemeindenLevel = viewShowsGemeindenLevelForCurrentView();
      const gemeindenOverview = viewShowsManyGemeindenForCurrentView();
      if (gemeindenLevel && !lastScaleCapViewAllowed) {
        scaleRobustEnabledCb.checked = CONFIG.defaultRobustScaleEnabled;
        if (gemeindenOverview) {
          scaleCapEnabledCb.checked = CONFIG.defaultColorCapEnabled;
        }
      } else if (!gemeindenLevel && lastScaleCapViewAllowed) {
        scaleRobustEnabledCb.checked = false;
        scaleCapEnabledCb.checked = false;
      }
      lastScaleCapViewAllowed = gemeindenLevel;
      syncScaleCapInputState();
      updateScaleCapHint();
    }

    function syncScaleCapInputState() {
      scaleCapPctInput.disabled = !scaleCapEnabledCb.checked;
    }

    function onScaleCapChange() {
      syncScaleCapInputState();
      if (rawLoaded) void applyCurrentView();
    }

    scaleRobustEnabledCb?.addEventListener('change', onScaleCapChange);
    scaleCapEnabledCb?.addEventListener('change', onScaleCapChange);
    scaleCapPctInput?.addEventListener('change', onScaleCapChange);
    scaleCapPctInput?.addEventListener('input', onScaleCapChange);

    function colorScaleRange(features) {
      const { enabled, capPct, robustEnabled } = getScaleCapSettings();
      const inputs = features
        .map((f) => ({
          bikeSharePct: f.properties?.bikeSharePct,
          roadSumKm: f.properties?.roadSumKm,
        }))
        .filter((i) => typeof i.bikeSharePct === 'number');
      return TildaStats.computeChoroplethScaleRange(inputs, {
        robustEnabled,
        manualCapEnabled: enabled,
        manualCapPct: capPct,
      });
    }

    function colorScaleRangeForMetric(metric, features) {
      if (metric === 'modelGap') {
        const vals = features
          .map((f) => f.properties?.modelGapPct)
          .filter((v) => typeof v === 'number');
        if (!vals.length) {
          return { min: -10, max: 10, dataMin: -10, dataMax: 10, scaleCapped: false };
        }
        const sorted = [...vals].sort((a, b) => a - b);
        const dataMin = sorted[0];
        const dataMax = sorted[sorted.length - 1];
        const absSorted = sorted.map((v) => Math.abs(v)).sort((a, b) => a - b);
        const p95 = absSorted[Math.min(absSorted.length - 1, Math.floor(0.95 * absSorted.length))];
        const bound = Math.max(5, Math.ceil(p95));
        return {
          min: -bound,
          max: bound,
          dataMin,
          dataMax,
          scaleCapped: bound < Math.max(Math.abs(dataMin), Math.abs(dataMax)),
        };
      }
      if (metric === 'cars') {
        const vals = features
          .map((f) => f.properties?.carsPer1000)
          .filter((v) => typeof v === 'number');
        if (!vals.length) {
          return { min: 350, max: 700, dataMin: 350, dataMax: 700, scaleCapped: false };
        }
        const sorted = [...vals].sort((a, b) => a - b);
        const dataMin = sorted[0];
        const dataMax = sorted[sorted.length - 1];
        const q02 = sorted[Math.min(sorted.length - 1, Math.floor(0.02 * sorted.length))];
        const q98 = sorted[Math.min(sorted.length - 1, Math.floor(0.98 * sorted.length))];
        const min = Math.floor(q02 / 10) * 10;
        const max = Math.ceil(q98 / 10) * 10;
        return {
          min,
          max: Math.max(max, min + 50),
          dataMin,
          dataMax,
          scaleCapped: min > dataMin || max < dataMax,
        };
      }
      if (metric === 'rent') {
        const vals = features
          .map((f) => f.properties?.rentColdM2)
          .filter((v) => typeof v === 'number');
        if (!vals.length) {
          return { min: 6.0, max: 14.0, dataMin: 6.0, dataMax: 14.0, scaleCapped: false };
        }
        const sorted = [...vals].sort((a, b) => a - b);
        const dataMin = sorted[0];
        const dataMax = sorted[sorted.length - 1];
        const q02 = sorted[Math.min(sorted.length - 1, Math.floor(0.02 * sorted.length))];
        const q98 = sorted[Math.min(sorted.length - 1, Math.floor(0.98 * sorted.length))];
        const min = Math.floor(q02 * 2) / 2;
        const max = Math.ceil(q98 * 2) / 2;
        return {
          min,
          max: Math.max(max, min + 2),
          dataMin,
          dataMax,
          scaleCapped: min > dataMin || max < dataMax,
        };
      }
      if (metric === 'accidents') {
        const vals = features
          .map((f) => f.properties?.bikeAccidentsPer10k)
          .filter((v) => typeof v === 'number');
        if (!vals.length) {
          return { min: 2, max: 20, dataMin: 2, dataMax: 20, scaleCapped: false };
        }
        const sorted = [...vals].sort((a, b) => a - b);
        const dataMin = sorted[0];
        const dataMax = sorted[sorted.length - 1];
        const q02 = sorted[Math.min(sorted.length - 1, Math.floor(0.02 * sorted.length))];
        const q98 = sorted[Math.min(sorted.length - 1, Math.floor(0.98 * sorted.length))];
        const min = Math.floor(q02);
        const max = Math.ceil(q98);
        return {
          min,
          max: Math.max(max, min + 5),
          dataMin,
          dataMax,
          scaleCapped: min > dataMin || max < dataMax,
        };
      }
      if (metric === 'commuters') {
        const vals = features
          .map((f) => f.properties?.netCommuters)
          .filter((v) => typeof v === 'number');
        if (!vals.length) {
          return { min: -5000, max: 5000, dataMin: -5000, dataMax: 5000, scaleCapped: false };
        }
        const sorted = [...vals].sort((a, b) => a - b);
        const dataMin = sorted[0];
        const dataMax = sorted[sorted.length - 1];
        const absSorted = sorted.map((v) => Math.abs(v)).sort((a, b) => a - b);
        const p90 = absSorted[Math.min(absSorted.length - 1, Math.floor(0.9 * absSorted.length))];
        const bound = Math.max(1000, Math.ceil(p90 / 500) * 500);
        return {
          min: -bound,
          max: bound,
          dataMin,
          dataMax,
          scaleCapped: bound < Math.max(Math.abs(dataMin), Math.abs(dataMax)),
        };
      }
      return colorScaleRange(features);
    }

    updateScaleCapDefaultForView();

    function updateRankingVisibility() {
      rankingDetails.hidden = false;
      rankingToolbar.hidden = false;
      if (!lastRankingViewAvailable) {
        rankingDetails.open = true;
      }
      lastRankingViewAvailable = true;
    }

    function syncRankingModeButtons() {
      for (const btn of rankingModeButtons) {
        const active = btn.dataset.rankingMode === rankingMode;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    function syncRankingScrollLayout() {
      rankingScroll?.classList.toggle('ranking-scroll--scroll', rankingMode === 'all');
    }

    function setRankingMode(mode) {
      if (mode !== 'topflop' && mode !== 'all') return;
      const prevScrollTop = panelMain ? panelMain.scrollTop : 0;
      rankingMode = mode;
      scheduleUrlSync();
      syncRankingModeButtons();
      syncRankingScrollLayout();
      if (lastRankingSorted.length) {
        updateRanking(lastRankingSorted, lastRankingMinPct, lastRankingMaxPct);
      }
      if (panelMain) {
        panelMain.scrollTop = prevScrollTop;
      }
    }

    function currentRankingTopN() {
      const withPct = lastRankingSorted.filter(
        (f) => typeof f.properties?.bikeSharePct === 'number',
      );
      const items = withPct.map((f) => ({ id: String(f.properties?.id ?? '') }));
      return RankingDisplay.effectiveRankingTopN({
        mode: rankingMode,
        items,
        focusChainIds: rankingFocusChainIds(),
      });
    }

    function rankingDisplayRows(sortedWithPct) {
      const topN = currentRankingTopN();
      if (rankingMode === 'all' || topN == null) {
        return sortedWithPct.map((f, i) => ({ type: 'row', f, rank: i + 1 }));
      }
      const items = sortedWithPct.map((f) => ({ id: String(f.properties?.id ?? '') }));
      const built = RankingDisplay.buildTopFlopDisplayRows(
        items,
        topN,
        rankingFocusChainIds(),
      );
      return built.map((row) =>
        row.type === 'divider'
          ? { type: 'divider' }
          : { type: 'row', f: sortedWithPct[row.index], rank: row.rank },
      );
    }

    function regionLevelNumber(id) {
      const f = regionIndex?.byId.get(id);
      return Number(String(f?.properties?.level ?? '0'));
    }

    function isDescendantOrEqual(innerId, ancestorId) {
      if (!innerId || !ancestorId || !regionIndex) return false;
      if (innerId === ancestorId) return true;
      let current = innerId;
      while (current) {
        if (current === ancestorId) return true;
        current = regionIndex.parentById.get(current);
      }
      const f = regionIndex.byId.get(innerId);
      if (!f) return false;
      if (String(f.properties?.landkreis_id ?? '') === ancestorId) return true;
      if (String(f.properties?.bundesland_id ?? '') === ancestorId) return true;
      return false;
    }

    function visibleUnitRelatesToFocus(visibleId, focusId) {
      if (!visibleId || !focusId) return false;
      if (visibleId === focusId) return true;
      if (isDescendantOrEqual(focusId, visibleId)) return true;
      if (isDescendantOrEqual(visibleId, focusId)) return true;
      return false;
    }

    function finestVisibleIdsRelatingToUnit(unitId, visibleFeatures) {
      if (!unitId || !regionIndex) return [];
      if (visibleFeatures.some((f) => f.properties?.id === unitId)) return [unitId];
      const candidates = [];
      for (const f of visibleFeatures) {
        const id = String(f.properties?.id ?? '');
        if (id && isDescendantOrEqual(unitId, id)) candidates.push(id);
      }
      if (!candidates.length) return [];
      let finestLevel = -1;
      for (const id of candidates) {
        const level = regionLevelNumber(id);
        if (level > finestLevel) finestLevel = level;
      }
      return candidates.filter((id) => regionLevelNumber(id) === finestLevel);
    }

    function simpleFocusHighlightIds(visibleFeatures, focusId) {
      if (!focusId || !regionIndex) return [];
      // Coarser than Gemeinde: outline the focus unit only, not every visible child (e.g. all Gemeinden in an LK).
      if (isNeighborView() && neighborFocus.kind !== 'gemeinde') {
        return [focusId];
      }
      const candidates = [];
      for (const f of visibleFeatures) {
        const id = String(f.properties?.id ?? '');
        if (id && visibleUnitRelatesToFocus(id, focusId)) candidates.push(id);
      }
      if (!candidates.length) return [];
      let finestLevel = -1;
      for (const id of candidates) {
        const level = regionLevelNumber(id);
        if (level > finestLevel) finestLevel = level;
      }
      return candidates.filter((id) => regionLevelNumber(id) === finestLevel);
    }

    function selectionHighlightIds() {
      if (!selectedFeatureId) return [];
      return finestVisibleIdsRelatingToUnit(selectedFeatureId, lastRankingFeatures);
    }

    /** Name of the visible area carrying the selection, or '' when the selection is a row itself. */
    function focusContainerName() {
      if (!selectedFeatureId || !regionIndex) return '';
      if (lastRankingFeatures.some((f) => f.properties?.id === selectedFeatureId)) return '';
      const [containerId] = selectionHighlightIds();
      return containerId ? String(regionIndex.byId.get(containerId)?.properties?.name ?? '') : '';
    }

    function syncRankingRowHighlights(opts) {
      const list = document.getElementById('ranking-list');
      if (!list) return;
      const focusIds =
        isNeighborView()
          ? new Set(simpleFocusHighlightIds(lastRankingFeatures, neighborFocus.focusId))
          : new Set();
      // The selection itself, or — when it is not a row of this view — the visible area
      // that contains it. Both read as "the focus"; the latter says what it contains.
      const focusRowIds = new Set(selectionHighlightIds());
      const selectedName = selectedFeatureId
        ? String(regionIndex?.byId.get(selectedFeatureId)?.properties?.name ?? '')
        : '';
      for (const li of list.querySelectorAll('li[data-ranking-id]')) {
        const id = li.dataset.rankingId;
        const isSelected = id === selectedFeatureId;
        const isContainer = !isSelected && focusRowIds.has(id);
        li.classList.toggle('ranking-row-selected', isSelected || isContainer);
        li.classList.toggle('ranking-row-container', isContainer);
        li.setAttribute('aria-pressed', String(isSelected || isContainer));
        li.classList.toggle('ranking-row-focus', focusIds.has(id) && !isSelected && !isContainer);
        li.querySelector('.ranking-focus-note')?.remove();
        if (isContainer && selectedName) {
          const note = document.createElement('span');
          note.className = 'ranking-focus-note';
          note.textContent = 'enthält ' + selectedName;
          li.appendChild(note);
        }
      }
      if (opts && opts.scrollIntoView) {
        const selectedLi = selectedFeatureId
          ? list.querySelector('li[data-ranking-id="' + selectedFeatureId + '"]')
          : null;
        if (selectedLi) selectedLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    function highlightGeojsonForIds(ids, visibleFeatures) {
      const features = [];
      for (const id of ids) {
        const f = featureGeometryForHighlight(id, visibleFeatures);
        if (!f?.geometry) continue;
        features.push({
          type: 'Feature',
          properties: { id, name: f.properties?.name ?? id },
          geometry: f.geometry,
        });
      }
      return { type: 'FeatureCollection', features };
    }

    function selectedHighlightGeojson() {
      return highlightGeojsonForIds(selectionHighlightIds(), lastRankingFeatures);
    }

    function featureGeometryForHighlight(id, visibleFeatures) {
      const inView = visibleFeatures.find((f) => f.properties?.id === id);
      if (inView?.geometry) return inView;
      return regionIndex?.byId.get(id) ?? null;
    }

    function simpleFocusHighlightGeojson() {
      if (!isNeighborView() || !regionIndex) {
        return { type: 'FeatureCollection', features: [] };
      }
      return highlightGeojsonForIds(
        simpleFocusHighlightIds(lastRankingFeatures, neighborFocus.focusId),
        lastRankingFeatures,
      );
    }

    function highlightLayerBeforeId() {
      return map.getLayer('regions-labels') ? 'regions-labels' : undefined;
    }

    function ensureSelectedHighlightLayer() {
      const beforeId = highlightLayerBeforeId();
      if (!map.getSource('regions-selected')) {
        map.addSource('regions-selected', {
          type: 'geojson',
          data: selectedHighlightGeojson(),
        });
        map.addLayer(
          {
            id: 'regions-selected-fill',
            type: 'fill',
            source: 'regions-selected',
            paint: { 'fill-color': '#1565c0', 'fill-opacity': 0.22 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'regions-selected-outline',
            type: 'line',
            source: 'regions-selected',
            paint: { 'line-color': '#1565c0', 'line-width': 4 },
          },
          beforeId,
        );
      } else {
        map.getSource('regions-selected').setData(selectedHighlightGeojson());
      }
    }

    function ensureSimpleFocusHighlightLayer() {
      const beforeId = highlightLayerBeforeId();
      const data = simpleFocusHighlightGeojson();
      if (!map.getSource('regions-simple-focus')) {
        map.addSource('regions-simple-focus', { type: 'geojson', data });
        map.addLayer(
          {
            id: 'regions-simple-focus-outline',
            type: 'line',
            source: 'regions-simple-focus',
            paint: {
              'line-color': '#111',
              'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 9, 2.8, 11, 4.2, 13, 5.5, 15, 7],
            },
          },
          beforeId,
        );
      } else {
        map.getSource('regions-simple-focus').setData(data);
      }
    }

    let hoveredRegionId = null;

    function hoverHighlightGeojson() {
      if (!hoveredRegionId || hoveredRegionId === selectedFeatureId) {
        return { type: 'FeatureCollection', features: [] };
      }
      return highlightGeojsonForIds([hoveredRegionId], lastRankingFeatures);
    }

    function ensureHoverHighlightLayer() {
      const beforeId = highlightLayerBeforeId();
      const data = hoverHighlightGeojson();
      if (!map.getSource('regions-hover')) {
        map.addSource('regions-hover', { type: 'geojson', data });
        map.addLayer(
          {
            id: 'regions-hover-fill',
            type: 'fill',
            source: 'regions-hover',
            paint: { 'fill-color': '#1565c0', 'fill-opacity': 0.14 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'regions-hover-outline',
            type: 'line',
            source: 'regions-hover',
            paint: {
              'line-color': '#0d47a1',
              'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 9, 3, 11, 4, 13, 5],
            },
          },
          beforeId,
        );
      } else {
        map.getSource('regions-hover').setData(data);
      }
    }

    function setHoveredRegionId(id) {
      if (hoveredRegionId === id) return;
      hoveredRegionId = id;
      if (map?.getSource('regions-hover')) {
        map.getSource('regions-hover').setData(hoverHighlightGeojson());
      }
      syncRankingRowHover();
    }

    function syncRankingRowHover() {
      const list = document.getElementById('ranking-list');
      if (!list) return;
      for (const li of list.querySelectorAll('li[data-ranking-id]')) {
        const isHover = li.dataset.rankingId === hoveredRegionId;
        li.classList.toggle('ranking-row-hovered', isHover);
        if (isHover && !li.matches(':hover')) {
          li.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }

    function updateMapHighlights() {
      if (!map.getSource('regions')) return;
      ensureSimpleFocusHighlightLayer();
      ensureSelectedHighlightLayer();
      ensureHoverHighlightLayer();
    }

    function appendRankingRow(list, rank, f, minPct, maxPct, span) {
      const pct = f.properties.bikeSharePct;
      const li = document.createElement('li');
      const featureId = String(f.properties?.id ?? '');
      const label = f.properties?.name || f.properties?.id || '–';
      if (featureId) {
        li.dataset.rankingId = featureId;
        li.classList.add('ranking-row-clickable');
        // The map polygons themselves can't be reached with a keyboard, so this list is the
        // only path to a region for keyboard and screen-reader users — it needs real button
        // semantics, not just a click listener and a title attribute.
        li.setAttribute('role', 'button');
        li.tabIndex = 0;
        li.setAttribute('aria-pressed', String(featureId === selectedFeatureId));
        li.setAttribute(
          'aria-label',
          'Platz ' + rank + ', ' + label + ', ' + formatUiPct(pct) + ' Prozent Radinfrastruktur',
        );
        li.title = 'Auf der Karte auswählen';
        li.addEventListener('click', () => selectRegionById(featureId, null, true));
        li.addEventListener('mouseenter', () => setHoveredRegionId(featureId));
        li.addEventListener('mouseleave', () => {
          if (hoveredRegionId === featureId) setHoveredRegionId(null);
        });
        li.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
          event.preventDefault(); // Space would scroll the ranking instead of selecting.
          selectRegionById(featureId, null, true);
        });
      }
      const rankEl = document.createElement('span');
      rankEl.className = 'ranking-rank';
      rankEl.textContent = rank + '.';
      const name = document.createElement('span');
      name.className = 'ranking-name';
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
      li.append(rankEl, name, track, pctEl);
      const quality = TildaStats.assessBikeDataQuality(
        f.properties?.road_length,
        f.properties?.bikelane_length,
      );
      if (quality && (quality.level === 'poor' || quality.level === 'sparse')) {
        const flag = document.createElement('span');
        flag.className = 'ranking-quality';
        flag.textContent = '⚠';
        flag.title =
          quality.level === 'poor'
            ? 'Viele Radwege sind in OpenStreetMap nicht eindeutig getaggt – Wert unsicher'
            : 'Kaum Radinfrastruktur erfasst – fehlt sie, oder gibt es sie nicht?';
        flag.setAttribute('aria-label', flag.title);
        pctEl.prepend(flag);
      }
      list.appendChild(li);
    }

    function updateScaleCapHint() {
      const { enabled, capPct, robustEnabled } = getScaleCapSettings();
      const gemeindenLevel = viewShowsGemeindenLevelForCurrentView();
      if (!gemeindenLevel || (!enabled && !robustEnabled)) {
        scaleCapHint.hidden = true;
        scaleCapHint.textContent = '';
        return;
      }
      scaleCapHint.hidden = false;
      const hints = [];
      if (robustEnabled) {
        hints.push(
          'Ausreißer ignorieren: Gebiete mit wenig Straßennetz (< ' +
            TildaStats.DEFAULT_MIN_ROAD_KM_FOR_SCALE +
            ' km) fließen nicht in die Skalenobergrenze ein; hohe Werte werden per 95. Perzentil und IQR begrenzt (z. B. Forstgemeinden).',
        );
      }
      if (enabled) {
        hints.push(
          'Farbskala kappen bei ' +
            capPct +
            ' %: darüber liegende Werte werden gleich eingefärbt.',
        );
      }
      scaleCapHint.textContent = hints.join(' ');
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

    /**
     * Whether a region takes part in the ranking. A network of a few km makes the percentage
     * jump with every way mapped — the top of the nationwide list used to be a 100 % forest
     * boundary — so those are shown on the map and in the card but not ranked.
     */
    function isRanked(f) {
      return typeof f.properties?.bikeSharePct === 'number' && !f.properties?.lowRoad;
    }

    function rebuildRankIndex(features) {
      rankByFeatureId.clear();
      const withPct = [...features]
        .filter(isRanked)
        .sort(compareByBikeShare);
      withPct.forEach((f, i) => {
        const id = f.properties?.id;
        if (id) rankByFeatureId.set(id, { rank: i + 1, total: withPct.length });
      });
    }

    function isOverlayLineHighlightActive(kind, id) {
      return overlayLineHighlight?.kind === kind && overlayLineHighlight?.id === id;
    }

    function bindOverlayHighlightRow(li, kind, id) {
      li.classList.add('region-detail-row-clickable');
      li.dataset.highlightKind = kind;
      li.dataset.highlightId = id;
      li.title = 'Kurz auf der Karte hervorheben';
      if (isOverlayLineHighlightActive(kind, id)) li.classList.add('region-detail-row-active');
      li.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pulseOverlayLineHighlight(kind, id);
      });
    }

    function syncOverlayHighlightRowStyles() {
      for (const li of regionDetailBody.querySelectorAll('.region-detail-row-clickable')) {
        const active =
          overlayLineHighlight &&
          li.dataset.highlightKind === overlayLineHighlight.kind &&
          li.dataset.highlightId === overlayLineHighlight.id;
        li.classList.toggle('region-detail-row-active', !!active);
      }
    }

    function appendLengthRows(parent, title, rows, highlightKind, barColor) {
      if (!rows.length) return;
      const section = document.createElement('section');
      section.className = 'region-detail-section';
      const h4 = document.createElement('h4');
      h4.textContent = title;
      section.appendChild(h4);
      const ul = document.createElement('ul');
      ul.className = 'region-detail-rows';
      const maxKm = Math.max(...rows.map((row) => row.km || 0), 0.001);
      for (const row of rows) {
        const li = document.createElement('li');
        const isExcluded = row.enabled === false;
        if (isExcluded) li.classList.add('region-detail-row-excluded');
        const head = document.createElement('div');
        head.className = 'region-detail-row-head';
        const label = document.createElement('span');
        label.textContent = row.label;
        const km = document.createElement('span');
        km.className = 'km';
        km.textContent =
          TildaStats.formatStatKm(row.km, TildaStats.STAT_KM_BIKE_UI_DECIMALS) + ' km';
        if (isExcluded) {
          const badge = document.createElement('span');
          badge.className = 'region-detail-excluded-badge';
          badge.textContent = 'nicht gewertet';
          km.appendChild(badge);
        }
        head.append(label, km);
        li.appendChild(head);
        if (barColor) {
          const track = document.createElement('div');
          track.className = 'region-detail-bar-track';
          const fill = document.createElement('div');
          fill.className = 'region-detail-bar-fill';
          fill.style.width = Math.max(0, (100 * (row.km || 0)) / maxKm) + '%';
          fill.style.background = isExcluded ? '#b0bec5' : barColor;
          track.appendChild(fill);
          li.appendChild(track);
        }
        if (highlightKind && row.id) bindOverlayHighlightRow(li, highlightKind, row.id);
        if (row.key) li.title = (li.title ? li.title + ' · ' : '') + row.key;
        if (isExcluded) {
          li.title = (li.title ? li.title + ' · ' : '') + 'In der aktuellen Zählung deaktiviert';
        }
        ul.appendChild(li);
      }
      section.appendChild(ul);
      parent.appendChild(section);
    }

    // Summary (by class) is what the card opens with; "Detailliert" swaps the same bar rows for
    // the individual OSM street types and bike-infrastructure types. Kept across regions.
    let regionBreakdownMode = 'summary';

    function appendBreakdownToggle(parent, onChange) {
      const group = document.createElement('div');
      group.className = 'detail-mode';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Aufschlüsselung');
      for (const [mode, label] of [
        ['summary', 'Zusammengefasst'],
        ['detail', 'Detailliert'],
      ]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'detail-mode-btn';
        btn.textContent = label;
        btn.setAttribute('aria-pressed', String(regionBreakdownMode === mode));
        btn.addEventListener('click', () => {
          if (regionBreakdownMode === mode) return;
          regionBreakdownMode = mode;
          onChange();
        });
        group.appendChild(btn);
      }
      parent.appendChild(group);
    }

    function selectedRegionGeometry() {
      const feature = lastRankingFeatures.find((f) => f.properties?.id === selectedFeatureId);
      return feature?.geometry ?? null;
    }

    function overlayHighlightBikelaneFilter(kind, id) {
      const categoryFilter = TildaStats.maplibrePropertyInFilter(
        'category',
        TildaStats.enabledBikelaneCategoryTags(lengthClassFilter),
      );
      const typeFilter =
        kind === 'bikelane-class'
          ? TildaStats.maplibreBikelaneOverlayFilterForClass(id)
          : TildaStats.maplibreBikelaneOverlayFilterForTag(id);
      const geometry = selectedRegionGeometry();
      const filters = [categoryFilter, typeFilter];
      if (geometry) filters.push(['within', geometry]);
      return TildaStats.combineMaplibreFilters(...filters);
    }

    function clearOverlayLineHighlight() {
      overlayLineHighlight = null;
      overlayHighlightBlinkOn = false;
      if (overlayLineHighlightTimer) clearTimeout(overlayLineHighlightTimer);
      if (overlayLineHighlightBlinkTimer) clearInterval(overlayLineHighlightBlinkTimer);
      overlayLineHighlightTimer = null;
      overlayLineHighlightBlinkTimer = null;
      syncOverlayHighlightRowStyles();
      updateOverlayLineHighlightLayers();
    }

    function updateOverlayLineHighlightLayers() {
      if (!map.getLayer('bikelanes-highlight-lines')) return;
      const visible =
        overlayLineHighlight && toggleBikelanes.checked ? 'visible' : 'none';
      map.setLayoutProperty('bikelanes-highlight-casing', 'visibility', visible);
      map.setLayoutProperty('bikelanes-highlight-lines', 'visibility', visible);
      if (!overlayLineHighlight) return;
      const { kind, id } = overlayLineHighlight;
      const filter = overlayHighlightBikelaneFilter(kind, id);
      map.setFilter('bikelanes-highlight-casing', filter);
      map.setFilter('bikelanes-highlight-lines', filter);
      const bikeColor = overlayBikelaneColorInput.value;
      const lineColor = bikeColor;
      const casingColor = '#ffffff';
      const lineWidth = overlayHighlightBlinkOn
        ? ['interpolate', ['linear'], ['zoom'], 10, 3.2, 14, 5.5]
        : ['interpolate', ['linear'], ['zoom'], 10, 2.4, 14, 4];
      const casingWidth = overlayHighlightBlinkOn
        ? ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8]
        : ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6.5];
      const lineOpacity = overlayHighlightBlinkOn ? 1 : 0.45;
      map.setPaintProperty('bikelanes-highlight-lines', 'line-color', lineColor);
      map.setPaintProperty('bikelanes-highlight-casing', 'line-color', casingColor);
      map.setPaintProperty('bikelanes-highlight-lines', 'line-width', lineWidth);
      map.setPaintProperty('bikelanes-highlight-casing', 'line-width', casingWidth);
      map.setPaintProperty('bikelanes-highlight-lines', 'line-opacity', lineOpacity);
      map.setPaintProperty('bikelanes-highlight-casing', 'line-opacity', lineOpacity);
      map.triggerRepaint();
    }

    function ensureBikelaneHighlightLayers() {
      if (!map.getSource('bikelanes') || map.getLayer('bikelanes-highlight-lines')) return;
      const overlayMinZoom = overlayMinZoomFromInputs();
      const layerMinZoom = CONFIG.overlayMinZoomLimits.min;
      const bikeOpacity = overlayMinZoomOpacityExpr(overlayMinZoom.bikelane);
      map.addLayer({
        id: 'bikelanes-highlight-casing',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: layerMinZoom,
        layout: { visibility: 'none' },
        filter: ['literal', false],
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6.5],
          'line-opacity': bikeOpacity,
        },
      });
      map.addLayer({
        id: 'bikelanes-highlight-lines',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: layerMinZoom,
        layout: { visibility: 'none' },
        filter: ['literal', false],
        paint: {
          'line-color': overlayBikelaneColorInput.value,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.4, 14, 4],
          'line-opacity': bikeOpacity,
        },
      });
    }

    function pulseOverlayLineHighlight(kind, id) {
      clearOverlayLineHighlight();
      overlayLineHighlight = { kind, id };
      toggleBikelanes.checked = true;
      updateOverlayVisibility();
      ensureBikelaneHighlightLayers();
      syncOverlayHighlightRowStyles();
      updateOverlayLineHighlightLayers();
      overlayHighlightBlinkOn = true;
      let blinkTicks = 0;
      overlayLineHighlightBlinkTimer = setInterval(() => {
        overlayHighlightBlinkOn = !overlayHighlightBlinkOn;
        updateOverlayLineHighlightLayers();
        blinkTicks += 1;
        if (blinkTicks >= 8) {
          clearInterval(overlayLineHighlightBlinkTimer);
          overlayLineHighlightBlinkTimer = null;
        }
      }, OVERLAY_HIGHLIGHT_BLINK_MS);
      overlayLineHighlightTimer = setTimeout(clearOverlayLineHighlight, OVERLAY_HIGHLIGHT_PULSE_MS);
    }

    /** Below this many comparable regions a median/leader comparison is not worth showing. */
    const MIN_BENCHMARK_REGIONS = 4;

    /**
     * "dieser Ansicht" only reads naturally when the view has no single named region behind it
     * (the nationwide default). Once the Gebiet/Untergebiet narrows the comparison down to one
     * specific Bundesland/Landkreis/etc., name it instead — "der Region Bayern" beats "dieser
     * Ansicht" once there's an actual region to point to.
     */
    function currentViewScopeName() {
      if (!regionIndex) return null;
      const scopeId = RegionNav.scopeIdFor(currentViewScope.gebiet, currentViewScope.untergebiet);
      if (!scopeId) return null;
      return regionIndex.byId.get(scopeId)?.properties?.name || null;
    }

    function viewComparisonLabel() {
      const name = currentViewScopeName();
      return name ? RankingDisplay.inPlacePhrase(name) : 'in dieser Ansicht';
    }

    function viewBenchmark() {
      const stats = lastRankingSorted.map((f) => f.properties).filter(Boolean);
      return RankingDisplay.computeViewBenchmark(stats);
    }

    /**
     * "What would it take to catch up" for the selected region: km of bike infra missing to
     * reach the median of the current view, and to reach its leader. Null when the region has
     * no road data or the view is too small to compare against.
     */
    function regionGapSummary(p) {
      if (!(p.roadSumKm > 0) || typeof p.bikeSharePct !== 'number') return null;
      // Median and leader belong to the regions shown; a focus carried by an ancestor isn't one.
      if (!lastRankingFeatures.some((f) => f.properties?.id === p.id)) return null;
      const bench = viewBenchmark();
      if (!bench || bench.count < MIN_BENCHMARK_REGIONS) return null;
      const leaderName =
        bench.leaderId && bench.leaderId !== p.id ? bench.leaderName || null : null;
      return {
        behind: p.bikeSharePct < bench.medianPct - 0.05,
        atMedian: Math.abs(p.bikeSharePct - bench.medianPct) <= 0.05,
        count: bench.count,
        medianPct: bench.medianPct,
        medianGapKm: RankingDisplay.bikelaneGapKm(p, bench.medianPct),
        leaderPct: bench.leaderPct,
        leaderGapKm: RankingDisplay.bikelaneGapKm(p, bench.leaderPct),
        leaderName,
      };
    }

    function appendGapText(el, pre, strongText, post) {
      el.appendChild(document.createTextNode(pre));
      const strong = document.createElement('strong');
      strong.textContent = strongText;
      el.appendChild(strong);
      if (post) el.appendChild(document.createTextNode(post));
    }

    /**
     * Says how far this region's figure can be trusted, from the data alone (see
     * assessBikeDataQuality). The "ohne unklare Wege" figure is the conservative end of the
     * range — shown only when those ways are part of the count, since otherwise they don't
     * move the number.
     */
    /**
     * Opens the OSM editor (iD) on the region. The figure is only as complete as the map, so
     * "the data is wrong" becomes something anyone can fix, not a reason to dismiss it.
     */
    function osmEditLink(feature, text) {
      if (!feature?.geometry) return null;
      const [w, s, e, n] = turf.bbox(feature);
      const span = Math.max(e - w, (n - s) * 1.5, 1e-4);
      const zoom = Math.min(16, Math.max(12, Math.round(Math.log2(360 / span))));
      const a = document.createElement('a');
      a.className = 'region-detail-osm-edit';
      a.href =
        'https://www.openstreetmap.org/edit?editor=id#map=' +
        zoom +
        '/' +
        ((s + n) / 2).toFixed(5) +
        '/' +
        ((w + e) / 2).toFixed(5);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = text;
      return a;
    }

    /**
     * Printable fact sheet (Drucken / PDF): every figure the viewer has for the region, no
     * commentary. The card parts are cloned from the rendered card (so sheet and card can't
     * disagree), the folded "Mehr Zahlen" content included; the length breakdown is printed both
     * by class and by type; the map is the live canvas.
     */
    /** Two plots side by side across the A4 content width (~180 mm at 96 dpi). */
    // The scatter plots hold ~10,000 dots each; as vector art nine of them make a PDF of tens of
    // megabytes, which phones struggle to build, share or open. A picture of each is a few
    // hundred KB in all. The page's plot CSS does not reach into an SVG that is drawn as an
    // image, so the rules it needs travel inside the SVG.
    const PRINT_PLOT_SVG_STYLE =
      'text{fill:#475569;font:10px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '.grid{stroke:#e6e6e6}.axis-title{fill:#333;font-weight:600}' +
      '.dots circle{fill:#1565c0;fill-opacity:var(--dot-opacity,.25)}' +
      '.trend{stroke:#475569;stroke-width:1.5;stroke-dasharray:4 3;stroke-linecap:round;opacity:.85}' +
      '.selected{fill:#e20613;stroke:#fff;stroke-width:2}' +
      '.selected-label{fill:#e20613;font-size:11px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:3}';
    async function rasterizePlotForPrint(chart) {
      const svg = chart.querySelector('svg');
      if (!svg) return;
      const width = Number(svg.getAttribute('width'));
      const height = Number(svg.getAttribute('height'));
      if (!(width > 0 && height > 0)) return;
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = PRINT_PLOT_SVG_STYLE;
      clone.insertBefore(style, clone.firstChild);
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(clone)], {
          type: 'image/svg+xml;charset=utf-8',
        }),
      );
      try {
        const source = new Image();
        source.src = url;
        await source.decode();
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const img = document.createElement('img');
        img.className = 'ps-plot-img';
        img.alt = '';
        img.src = canvas.toDataURL('image/png');
        await raceTimeout(img.decode(), 1500);
        chart.replaceChildren(img);
      } catch (err) {
        // Keep the vector plot: a heavy PDF beats a missing plot.
        console.error('[radinfra-viewer] print plot raster', err);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const PRINT_PLOT_WIDTH_PX = 330;
    /** Short enough for all eight plots (4 rows) to share one page. */
    const PRINT_PLOT_HEIGHT_PX = 180;

    function buildPrintRanking(feature) {
      if (!lastRankingFeatures.length) return null;
      const sorted = [...lastRankingFeatures].sort(compareByBikeShare);
      const withPct = sorted.filter(isRanked);
      if (withPct.length <= 1) return null;

      const p = feature?.properties || {};
      const minPct = lastRankingMinPct;
      const maxPct = lastRankingMaxPct;
      const span = Math.max(maxPct - minPct, 0.001);

      const items = withPct.map((f) => ({ id: String(f.properties?.id ?? '') }));
      const topN = currentRankingTopN();
      const built = RankingDisplay.buildRankingExportRows(items, {
        mode: rankingMode,
        topN,
        focusChainIds: rankingFocusChainIds(),
        maxAlleRows: 40,
      });

      const wrap = document.createElement('div');
      wrap.className = 'ps-ranking-wrap';

      const summary = document.createElement('p');
      summary.className = 'ps-ranking-summary';
      const rankInfo = rankByFeatureId.get(p.id);
      const rankText = rankInfo
        ? 'Platz ' + rankInfo.rank + ' von ' + rankInfo.total + ' ' + viewComparisonLabel()
        : withPct.length + ' Gebiete ' + viewComparisonLabel();
      const modeHint =
        rankingMode === 'topflop' && withPct.length > (topN ?? DEFAULT_RANKING_TOP_N) * 2
          ? ' (Top & Flop je ' + (topN ?? DEFAULT_RANKING_TOP_N) + ')'
          : '';

      summary.textContent = rankText + modeHint + ' · Balken = Anteil in dieser Ansicht';
      wrap.appendChild(summary);

      const list = document.createElement('ul');
      list.className = 'ps-ranking-list';

      for (const row of built) {
        if (row.type === 'divider') {
          const div = document.createElement('li');
          div.className = 'ps-ranking-divider';
          div.textContent = '…';
          list.appendChild(div);
          continue;
        }
        const f = withPct[row.index];
        if (!f) continue;
        const fProps = f.properties || {};
        const fId = String(fProps.id ?? '');
        const pct = fProps.bikeSharePct;
        const name = String(fProps.name || fId || '–');
        const isCurrent = Boolean(fId && fId === p.id);

        const li = document.createElement('li');
        li.className = 'ps-ranking-row' + (isCurrent ? ' ps-ranking-row--current' : '');

        const rankEl = document.createElement('span');
        rankEl.className = 'ps-ranking-rank';
        rankEl.textContent = row.rank + '.';

        const nameEl = document.createElement('span');
        nameEl.className = 'ps-ranking-name';
        nameEl.textContent = name;

        const track = document.createElement('div');
        track.className = 'ps-ranking-bar-track';
        const fill = document.createElement('div');
        fill.className = 'ps-ranking-bar-fill';
        const widthPct = Math.max(2, ((clampPctForScale(pct, minPct, maxPct) - minPct) / span) * 100);
        fill.style.width = widthPct + '%';
        fill.style.background = colorForPct(pct, minPct, maxPct);
        track.appendChild(fill);

        const pctEl = document.createElement('span');
        pctEl.className = 'ps-ranking-pct';
        pctEl.textContent = formatUiPct(pct) + ' %';

        li.append(rankEl, nameEl, track, pctEl);
        list.appendChild(li);
      }

      wrap.appendChild(list);

      const withoutPct = sorted.length - withPct.length;
      if (withoutPct > 0) {
        const note = document.createElement('p');
        note.className = 'ps-ranking-note';
        note.textContent = withoutPct + ' weitere Gebiete ohne Rang (< 5 km erfasste Straße)';
        wrap.appendChild(note);
      }

      return wrap;
    }

    async function printRegionSheet(feature) {
      if (document.body.classList.contains('printing')) return;
      const p = feature.properties || {};
      const sheet = document.getElementById('print-sheet');
      if (!sheet) return;
      try {
        // The context rows and scatter plots need the density/transit/terrain files, which are
        // fetched on the first selection. On a slow connection they may still be on their way —
        // without them the sheet silently comes out without "Umfeld" and without any plot.
        // Building the sheet takes seconds (data, map picture, nine plots); say so.
        if (copyViewLinkFeedback) {
          if (copyViewLinkFeedbackTimer) clearTimeout(copyViewLinkFeedbackTimer);
          copyViewLinkFeedback.textContent = 'Datenblatt wird erstellt …';
          copyViewLinkFeedback.classList.remove('is-error');
          copyViewLinkFeedback.hidden = false;
        }
        ensureRegionExtraIndexes();
        if (regionExtraIndexesPromise) await raceTimeout(regionExtraIndexesPromise, 20000);
        const el = (tag, className, text) => {
          const node = document.createElement(tag);
          if (className) node.className = className;
          if (text != null) node.textContent = text;
          return node;
        };
        /** Static copy of a card part: no ids, no buttons/links/selects, folded parts left out. */
        const printable = (node) => {
          if (!node || node.hidden) return null;
          const copy = node.cloneNode(true);
          copy.removeAttribute('id');
          for (const n of copy.querySelectorAll('[id]')) n.removeAttribute('id');
          for (const sel of copy.querySelectorAll('select')) {
            sel.replaceWith(el('span', null, sel.selectedOptions[0]?.textContent || ''));
          }
          for (const n of copy.querySelectorAll('.ctx-plot, .ctx-hint, [hidden]')) n.remove();
          // Inline buttons (e.g. the nearby example's name) carry text the sentence needs.
          for (const btn of copy.querySelectorAll('button')) btn.replaceWith(el('strong', null, btn.textContent));
          return copy;
        };
        const section = (title, ...nodes) => {
          const parts = nodes.filter(Boolean);
          if (!parts.length) return;
          const wrap = el('section', 'ps-section');
          if (title) {
            wrap.appendChild(el('h2', null, title));
            if (title === 'Rangliste') wrap.classList.add('ps-ranking-section');
          }
          wrap.append(...parts);
          sheet.appendChild(wrap);
        };

        sheet.replaceChildren();
        const parentNames = [p.landkreis_id, p.bundesland_id]
          .map((id) => (id && id !== p.id ? regionIndex?.byId.get(id)?.properties?.name : null))
          .filter(Boolean);
        sheet.append(
          el('p', 'ps-kicker', 'Radinfrastruktur – Datenblatt'),
          el('h1', null, p.name || p.id),
          el(
            'p',
            'ps-sub',
            [RegionSearch.regionSearchLevelLabel(String(p.level ?? ''), p.id, regionIndex), ...parentNames].join(
              ' · ',
            ),
          ),
        );
        section(null, printable(regionDetailMeta));
        section(
          'Vergleich',
          printable(regionDetailGap),
          printable(regionDetailPeerGap),
          printable(regionDetailModelGap),
          printable(regionDetailQuality),
        );
        section(null, printable(regionDetailAuthority));
        try {
          const img = el('img', 'ps-map-img');
          img.alt = 'Karte: ' + (p.name || '');
          img.src = (await capturePrintMapCanvas(feature)).toDataURL('image/jpeg', 0.88);
          await raceTimeout(img.decode(), 1500);
          section('Karte', img);
        } catch (e) {
          console.error('[radinfra-viewer] print map', e);
        }
        section('Rangliste', buildPrintRanking(feature));
        // The context rows render with the card even while "Mehr Zahlen" is folded.
        section('Umfeld', printable(regionDetailExtra));

        const filter = readLengthClassFilterFromUi();
        const byClass = el('div', 'ps-columns');
        appendLengthRows(byClass, 'Straßen nach Klasse', TildaStats.listFilteredRoadClassLengths(p.road_length, filter), null, overlayRoadColorInput.value);
        appendLengthRows(byClass, 'Radinfrastruktur nach Klasse', TildaStats.listFilteredBikelaneClassLengths(p.bikelane_length, filter), null, overlayBikelaneColorInput.value);
        const byType = el('div', 'ps-columns');
        appendLengthRows(byType, 'Straßen nach Typ', TildaStats.listFilteredHighwayTagLengths(p.road_length, filter), null, overlayRoadColorInput.value);
        appendLengthRows(byType, 'Radinfrastruktur nach Typ', TildaStats.listFilteredBikelaneTagLengths(p.bikelane_length, filter), null, overlayBikelaneColorInput.value);
        section('Längen', byClass, byType);

        // One small scatter per context metric, same comparison group as the card.
        const level = String(p.level ?? '');
        const scopes = contextScopesFor(p, CONTEXT_REFERENCE_NOUN[level] || { nom: 'Gebiete', gen: 'Gebiete' });
        const plotScope = scopes.find((sc) => sc.type === contextScopeChoice) || scopes[0];
        const plots = el('div', 'ps-plots');
        for (const metric of contextMetrics()) {
          const value = metric.get(p.id);
          if (value == null || !Number.isFinite(value) || !plotScope) continue;
          const plot = buildMetricPlot(metric, level, plotScope);
          if (!plot) continue;
          renderMetricPlot(plot.chart, metric, plot.entries, p.id, PRINT_PLOT_WIDTH_PX, PRINT_PLOT_HEIGHT_PX);
          await rasterizePlotForPrint(plot.chart);
          plots.appendChild(plot.plotDiv);
        }
        if (plots.childElementCount) {
          const heading = el('h2', null, 'Zusammenhänge – Vergleich: ' + plotScope.label);
          const wrap = el('section', 'ps-section ps-plot-page');
          wrap.append(heading, plots);
          sheet.appendChild(wrap);
        }

        const foot = el(
          'p',
          'ps-foot',
          'Kennzahl: Länge der Radinfrastruktur ÷ Länge aller Straßen (km), ' +
            (document.getElementById('metric-definition-counting')?.textContent || 'nach Radinfra.de-Standard') +
            '. Daten: OpenStreetMap-Mitwirkende (ODbL), Stand ${dataDateLabel || generatedDateLabel}. ' +
            'Unvollständige OpenStreetMap-Daten können Werte verfälschen. Methodik und Ansicht online: ',
        );
        foot.appendChild(el('span', 'ps-url', buildShareUrl()));
        sheet.appendChild(foot);

        if (copyViewLinkFeedback) copyViewLinkFeedback.hidden = true;
        const done = () => document.body.classList.remove('printing');
        window.addEventListener('afterprint', done, { once: true });
        document.body.classList.add('printing');
        requestAnimationFrame(() => {
          window.print();
        });
      } catch (err) {
        console.error('[radinfra-viewer] printRegionSheet failed', err);
        if (copyViewLinkFeedback) copyViewLinkFeedback.hidden = true;
        document.body.classList.remove('printing');
      }
    }

    function syncExportDialogState() {
      const feature =
        selectedFeatureOverride || (selectedFeatureId ? regionIndex?.byId.get(selectedFeatureId) : null);
      if (feature && feature.properties) {
        const name = feature.properties.name || feature.properties.id || 'Gebiet';
        if (exportItemPdf) {
          exportItemPdf.disabled = false;
          exportItemPdf.title = 'A4-Datenblatt für ' + name + ' drucken oder als PDF speichern';
        }
        if (exportItemPdfDesc) {
          exportItemPdfDesc.textContent = 'A4-Datenblatt für „' + name + '“';
        }
        if (exportItemShareDesc) {
          exportItemShareDesc.textContent = 'Link mit „' + name + '“ teilen';
        }
      } else {
        if (exportItemPdf) {
          exportItemPdf.disabled = true;
          exportItemPdf.title = 'Bitte zuerst ein Gebiet auswählen';
        }
        if (exportItemPdfDesc) {
          exportItemPdfDesc.textContent = 'Bitte zuerst ein Gebiet auswählen';
        }
        if (exportItemShareDesc) {
          exportItemShareDesc.textContent = 'Link zur aktuellen Kartenansicht kopieren';
        }
      }
    }

    function openExportDialog() {
      if (!exportDialog) return;
      syncExportDialogState();
      if (typeof exportDialog.showModal === 'function') {
        exportDialog.showModal();
      } else {
        exportDialog.hidden = false;
      }
    }

    function closeExportDialog() {
      if (!exportDialog) return;
      if (typeof exportDialog.close === 'function') {
        exportDialog.close();
      } else {
        exportDialog.hidden = true;
      }
      if (exportDialogFeedback) exportDialogFeedback.hidden = true;
    }

    const mainRoadBreakdownCache = new Map();
    /** Per-region main-road figures (fixed by the data, so cached by id). */
    function mainRoadBreakdownFor(p) {
      if (!p?.id) return null;
      if (!mainRoadBreakdownCache.has(p.id)) {
        mainRoadBreakdownCache.set(
          p.id,
          TildaStats.mainRoadBreakdown(p.road_length_by_authority, p.bikelane_length_by_road),
        );
      }
      return mainRoadBreakdownCache.get(p.id);
    }

    /**
     * "Who has to build it": road length and bike share split by road authority. Turns one percentage
     * into an address — Kreistag, Landesbauamt or Gemeinderat.
     */
    function renderRegionAuthority(p, mainRoads) {
      regionDetailAuthority.replaceChildren();
      if (!mainRoads || !mainRoads.byAuthority.length) {
        regionDetailAuthority.hidden = true;
        return;
      }
      const km = (v, d) => TildaStats.formatStatKm(v, d);
      const title = document.createElement('p');
      title.className = 'ra-title';
      title.textContent = 'Hauptverkehrsstraßen – wer ist zuständig?';
      const table = document.createElement('table');
      table.className = 'ra-table';
      const head = table.insertRow();
      for (const text of ['Baulastträger', 'Straße', 'mit Radinfra']) {
        const th = document.createElement('th');
        th.textContent = text;
        head.appendChild(th);
      }
      for (const row of mainRoads.byAuthority) {
        // A few metres of a road the boundary just clips: noise, not a responsibility.
        if (row.roadKm < 0.5) continue;
        const tr = table.insertRow();
        tr.insertCell().textContent = TildaStats.ROAD_AUTHORITY_LABELS[row.authority];
        tr.insertCell().textContent = km(row.roadKm, TildaStats.STAT_KM_ROAD_UI_DECIMALS) + ' km';
        tr.insertCell().textContent = formatUiPct(row.pct) + ' %';
      }
      const note = document.createElement('p');
      note.className = 'ra-note';
      const notes = [];
      notes.push(
        'Zuständigkeit aus der Straßennummer abgeleitet; Ortsdurchfahrten größerer Städte ' +
          'liegen oft bei der Stadt.',
      );
      // Both sides unfiltered: the per-road split doesn't know about custom counting.
      const independent = TildaStats.independentBikeKm(p.bikelane_length_by_road);
      const allBikeKm = TildaStats.sumLengthRecord(p.bikelane_length);
      if (independent > 0 && allBikeKm > 0) {
        notes.push(
          Math.round((independent / allBikeKm) * 100) +
            ' % der Radinfrastruktur hier sind eigenständige Wege abseits von Straßen; sie zählen ' +
            'im Wert über alle Straßen, nicht in dieser Tabelle.',
        );
      }
      note.textContent = notes.join(' ');
      regionDetailAuthority.append(title, table, note);
      regionDetailAuthority.hidden = false;
    }

    function renderRegionQuality(p) {
      const q = TildaStats.assessBikeDataQuality(p.road_length, p.bikelane_length);
      regionDetailQuality.replaceChildren();
      // Good data needs no sentence; the card only speaks up when the number is shaky.
      if (!q || q.level === 'good') {
        regionDetailQuality.hidden = true;
        regionDetailQuality.className = 'region-detail-quality';
        return;
      }
      regionDetailQuality.className = 'region-detail-quality region-detail-quality--' + q.level;
      const km = (v) => TildaStats.formatStatKm(v, TildaStats.STAT_KM_BIKE_UI_DECIMALS);
      const head = document.createElement('strong');
      let text;
      if (q.level === 'sparse') {
        head.textContent = 'Datenlage: kaum Radinfrastruktur erfasst. ';
        text =
          km(q.bikeKm) +
          ' km Rad bei ' +
          TildaStats.formatStatKm(q.roadKm, TildaStats.STAT_KM_ROAD_UI_DECIMALS) +
          ' km Straße – das kann heißen, dass es kaum welche gibt, oder dass sie in ' +
          'OpenStreetMap noch fehlt.';
      } else {
        const share = Math.round(q.unclearShare * 100) + ' %';
        head.textContent = q.level === 'mixed' ? 'Datenlage: mittel. ' : 'Datenlage: unsicher. ';
        text =
          share +
          ' (' +
          km(q.unclearKm) +
          ' km) der erfassten Radinfrastruktur sind in OpenStreetMap nicht eindeutig ' +
          'getaggt („Klärung nötig“).';
        const counted = readLengthClassFilterFromUi().bikelane.needsClarification;
        if (counted && p.roadSumKm > 0) {
          const conservative = ((p.bikelaneSumKm - q.unclearKm) / p.roadSumKm) * 100;
          text +=
            ' Ohne diese Wege läge der Anteil bei ' +
            formatUiPct(Math.max(0, conservative)) +
            ' % statt ' +
            formatUiPct(p.bikeSharePct) +
            ' %.';
        }
      }
      regionDetailQuality.append(head, document.createTextNode(text));
      regionDetailQuality.hidden = false;
    }

    function renderRegionGap(p) {
      const g = regionGapSummary(p);
      regionDetailGap.replaceChildren();
      if (!g) {
        regionDetailGap.hidden = true;
        regionDetailGap.className = 'region-detail-gap';
        return;
      }
      const kmBike = (km) => TildaStats.formatStatKm(km, TildaStats.STAT_KM_BIKE_UI_DECIMALS);
      const viewLabel = viewComparisonLabel();
      if (g.behind) {
        regionDetailGap.className = 'region-detail-gap region-detail-gap--behind';
        appendGapText(
          regionDetailGap,
          'Bis ins Mittelfeld ' +
            viewLabel +
            ' (Median ' +
            formatUiPct(g.medianPct) +
            ' %) fehlen rund ',
          kmBike(g.medianGapKm) + ' km',
          ' Radinfrastruktur.',
        );
        if (g.leaderName && g.leaderPct > g.medianPct + 0.05) {
          regionDetailGap.appendChild(
            document.createTextNode(
              ' Spitze: ' + g.leaderName + ' mit ' + formatUiPct(g.leaderPct) + ' %.',
            ),
          );
        }
      } else {
        regionDetailGap.className = 'region-detail-gap region-detail-gap--ahead';
        regionDetailGap.textContent = g.atMedian
          ? 'Liegt im Mittelfeld ' + viewLabel + ' (Median ' + formatUiPct(g.medianPct) + ' %).'
          : 'Liegt über dem Mittelfeld ' + viewLabel + ' (Median ' + formatUiPct(g.medianPct) + ' %).';
      }
      regionDetailGap.hidden = false;
    }

    /**
     * Rank the selected Gemeinde against every German Gemeinde in the same population band and
     * urbanization tier (peerGroupIndex from gemeinde-peers.json), using the current counting
     * filter so it moves with the rest of the card. Answers "we're just rural, of course we're
     * behind". Null unless it's a level-8 region with a peer bucket of at least
     * MIN_BENCHMARK_REGIONS members.
     */
    function demographicPeerSummary(p) {
      const level = String(p.level ?? '');
      if (!peerGroupIndex || (level !== '8' && level !== '6')) return null;
      if (!(p.roadSumKm > 0) || typeof p.bikeSharePct !== 'number') return null;
      const key = peerGroupIndex.byId[p.id];
      if (!key) return null;
      const peerFeatures = allFeatures
        .filter((f) => peerGroupIndex.byId[f.properties?.id] === key)
        .map(enrichFeature)
        .filter((f) => f.properties.roadSumKm > 0 && typeof f.properties.bikeSharePct === 'number');
      const peers = peerFeatures.map((f) => f.properties);
      if (peers.length < MIN_BENCHMARK_REGIONS) return null;
      const bench = RankingDisplay.computeViewBenchmark(peers);
      if (!bench) return null;
      const ranked = peers.slice().sort((a, b) => b.bikeSharePct - a.bikeSharePct);
      const rank = ranked.findIndex((q) => q.id === p.id) + 1;
      if (!rank) return null;
      return {
        groupLabel:
          peerGroupIndex.groups[key] ||
          (level === '6' ? 'vergleichbare Kreise' : 'vergleichbare Gemeinden'),
        rank,
        total: ranked.length,
        medianPct: bench.medianPct,
        gapKm: RankingDisplay.bikelaneGapKm(p, bench.medianPct),
        behind: p.bikeSharePct < bench.medianPct - 0.05,
        roleModel: nearestRoleModel(p, peerFeatures, bench.medianPct),
      };
    }

    const featureCenterCache = new Map();
    function featureCenter(f) {
      // Gemeinden carry their centre (their polygons are fetched per Landkreis, not up front).
      if (f.properties?.center) return f.properties.center;
      if (!f.geometry) return null;
      const id = f.properties?.id;
      if (featureCenterCache.has(id)) return featureCenterCache.get(id);
      const [w, s, e, n] = turf.bbox(f);
      const center = [(w + e) / 2, (s + n) / 2];
      featureCenterCache.set(id, center);
      return center;
    }

    /** Points of a peer that has to clearly beat the region to be worth naming. */
    const ROLE_MODEL_MIN_LEAD_PCT = 2;
    /** Beyond this, "in der Nähe" stops being true and the comparison loses its pull. */
    const ROLE_MODEL_MAX_KM = 60;
    const ROLE_MODEL_MAX_KM_LANDKREIS = 180;

    /**
     * The closest Gemeinde of the same profile that does clearly better (at least the group
     * median and ROLE_MODEL_MIN_LEAD_PCT points ahead): "Moos, 9 km away, manages 17 %" is
     * harder to wave away than a rank among 800 places nobody knows.
     */
    function nearestRoleModel(p, peerFeatures, medianPct) {
      const maxKm = String(p.level) === '6' ? ROLE_MODEL_MAX_KM_LANDKREIS : ROLE_MODEL_MAX_KM;
      const self = allFeatures.find((f) => f.properties?.id === p.id);
      const origin = self ? featureCenter(self) : null;
      if (!origin) return null;
      const minPct = Math.max(medianPct, p.bikeSharePct + ROLE_MODEL_MIN_LEAD_PCT);
      let best = null;
      for (const f of peerFeatures) {
        const q = f.properties;
        if (q.id === p.id || q.lowRoad || q.bikeSharePct < minPct) continue;
        const center = featureCenter(f);
        if (!center) continue;
        const km = turf.distance(origin, center, { units: 'kilometers' });
        if (km > maxKm || (best && km >= best.km)) continue;
        // A lead that rests on unclear tagging is exactly what a critic would point at.
        const quality = TildaStats.assessBikeDataQuality(q.road_length, q.bikelane_length);
        if (quality && quality.level !== 'good') continue;
        best = { id: q.id, name: q.name || q.id, pct: q.bikeSharePct, km };
      }
      return best;
    }

    /**
     * Leads with the rank, on its own line: "Platz 3 von 47 vergleichbaren Gemeinden" is the
     * most meaningful sentence the card can produce for a resident, far more so than the raw
     * percentage above it — so it reads as a headline, not as a footnote.
     */
    function renderRegionPeerGap(p) {
      const s = demographicPeerSummary(p);
      regionDetailPeerGap.replaceChildren();
      if (!s) {
        regionDetailPeerGap.hidden = true;
        regionDetailPeerGap.className = 'region-detail-gap region-detail-gap--peer';
        return;
      }
      regionDetailPeerGap.className =
        'region-detail-gap region-detail-gap--peer ' +
        (s.behind ? 'region-detail-gap--behind' : 'region-detail-gap--ahead');
      const headline = document.createElement('span');
      headline.className = 'region-detail-gap-headline';
      headline.textContent = 'Platz ' + s.rank + ' von ' + s.total;
      regionDetailPeerGap.appendChild(headline);
      const isCounty = String(p.level) === '6';
      regionDetailPeerGap.style.setProperty(
        '--peer-gap-label',
        isCounty ? "'Vergleichbare Kreise bundesweit'" : "'Ähnlich große Gemeinden bundesweit'",
      );
      regionDetailPeerGap.appendChild(
        document.createTextNode(
          (isCounty
            ? 'unter Landkreisen und kreisfreien Städten mit ähnlichem Profil ('
            : 'unter Gemeinden mit ähnlichem Profil (') +
            s.groupLabel +
            ').',
        ),
      );
      regionDetailPeerGap.appendChild(
        document.createTextNode(
          (s.behind ? ' Median der Gruppe: ' : ' Über dem Median der Gruppe (') +
            formatUiPct(s.medianPct) +
            (s.behind ? ' %.' : ' %).'),
        ),
      );
      if (s.roleModel) {
        const line = document.createElement('span');
        line.className = 'region-detail-role-model';
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'region-detail-role-model-link';
        link.textContent = s.roleModel.name;
        link.title = s.roleModel.name + ' anzeigen';
        link.addEventListener('click', () => jumpToRegionBySearch(s.roleModel.id));
        line.append(
          'Vorbild in der Nähe: ',
          link,
          ' (' +
            Math.max(1, Math.round(s.roleModel.km)) +
            ' km entfernt, gleiches Profil) schafft ' +
            formatUiPct(s.roleModel.pct) +
            ' %.',
        );
        regionDetailPeerGap.appendChild(line);
      }
      regionDetailPeerGap.hidden = false;
    }

    /**
     * Expected bike infrastructure share (%) and kilometres based on the multivariate structural
     * model (topography/slope, elevation, density, transit access). Shows the net expected value,
     * the actual comparison, and an expandable waterfall decomposition of the contributing factors.
     */
    function renderRegionModelGap(p) {
      if (!regionDetailModelGap) return;
      regionDetailModelGap.replaceChildren();
      const level = String(p.level ?? '');
      if (level !== '8' && level !== '6') {
        regionDetailModelGap.hidden = true;
        return;
      }
      ensureRegionExtraIndexes();
      const filter = readLengthClassFilterFromUi();
      const { roadKm, bikeKm } = TildaStats.computeFilteredLengths(
        p.road_length,
        p.bikelane_length,
        filter,
      );
      const dens = densityIndex?.byId[p.id];
      const slope = terrainIndex?.byId[p.id]?.road;
      const elev = terrainIndex?.byId[p.id]?.elevationMean;
      const stDist =
        transitIndex?.byId[p.id]?.avgDistanceToStationM != null
          ? transitIndex.byId[p.id].avgDistanceToStationM / 1000
          : null;

      const rent = zensusIndex?.byId[p.id]?.rentPerM2;
      const carsPer1000 = carsIndex?.byId[p.id]?.carsPer1000;
      const livingSharePct = calmedIndex?.byId[p.id]?.livingSharePct;

      const m = RankingDisplay.computeStructuralModelPrediction({
        roadKm,
        bikeKm,
        roadSlope: typeof slope === 'number' ? slope : null,
        elevMean: typeof elev === 'number' ? elev : null,
        density: typeof dens === 'number' ? dens : null,
        stDistKm: typeof stDist === 'number' ? stDist : null,
        rent: typeof rent === 'number' ? rent : null,
        carsPer1000: typeof carsPer1000 === 'number' ? carsPer1000 : null,
        livingSharePct: typeof livingSharePct === 'number' ? livingSharePct : null,
      });

      if (!m) {
        regionDetailModelGap.hidden = true;
        return;
      }

      regionDetailModelGap.className =
        'region-detail-gap region-detail-gap--model ' +
        (m.behind ? 'region-detail-gap--behind' : 'region-detail-gap--ahead');

      const headline = document.createElement('span');
      headline.className = 'region-detail-gap-headline';
      headline.textContent =
        'Erwartet: ' +
        formatUiPct(m.expectedPct) +
        ' % (ca. ' +
        deNumber(Math.round(m.expectedKm), 0) +
        ' km)';
      regionDetailModelGap.appendChild(headline);

      const statusText = document.createElement('span');
      const diffKmRounded = Math.abs(Math.round(m.diffKm));
      const diffKmStr = deNumber(diffKmRounded, 0) + ' km';
      const diffPctStr = formatUiPct(Math.abs(m.diffPct)) + ' %';

      if (m.behind) {
        statusText.textContent =
          'Tatsächlich ' +
          formatUiPct(m.actualPct) +
          ' % (' +
          deNumber(m.actualKm, m.actualKm < 10 ? 1 : 0) +
          ' km) · ' +
          diffKmStr +
          ' unter Erwartung (−' +
          diffPctStr +
          ' Lücke trotz Geografie und Dichte).';
      } else {
        statusText.textContent =
          'Tatsächlich ' +
          formatUiPct(m.actualPct) +
          ' % (' +
          deNumber(m.actualKm, m.actualKm < 10 ? 1 : 0) +
          ' km) · ' +
          diffKmStr +
          ' über Erwartung (+' +
          diffPctStr +
          ' Vorsprung gegenüber geografischem Profil).';
      }
      regionDetailModelGap.appendChild(statusText);

      // Expandable waterfall table (Variant B)
      const details = document.createElement('details');
      details.className = 'model-breakdown-details';
      const summary = document.createElement('summary');
      summary.className = 'model-breakdown-summary';
      summary.textContent = 'Faktoren-Zerlegung (Topografie, Wohlstand, Beruhigung, Dichte)';
      details.appendChild(summary);

      const table = document.createElement('table');
      table.className = 'model-breakdown-table';
      table.innerHTML =
        '<thead><tr><th>Faktor</th><th>Einfluss</th><th>Messwert</th></tr></thead>';
      const tbody = document.createElement('tbody');

      const formatDelta = (d) => (d > 0 ? '+' : '') + formatUiPct(d) + ' %';

      const addRow = (label, note, delta, measVal, rowClass) => {
        const tr = document.createElement('tr');
        if (rowClass) tr.className = rowClass;
        const tdLabel = document.createElement('td');
        tdLabel.append(label);
        if (note) {
          const small = document.createElement('small');
          small.textContent = note;
          tdLabel.appendChild(small);
        }
        const tdDelta = document.createElement('td');
        tdDelta.textContent = typeof delta === 'number' ? formatDelta(delta) : (delta || '');
        const tdMeas = document.createElement('td');
        tdMeas.textContent = measVal;
        tr.append(tdLabel, tdDelta, tdMeas);
        tbody.appendChild(tr);
      };

      addRow('Bundesweiter Basiswert', 'Durchschnitt aller Gebiete', m.baselinePct, formatUiPct(m.baselinePct) + ' %');

      const topoNotes = [];
      if (m.inputs.roadSlope != null) topoNotes.push('Ø ' + deNumber(m.inputs.roadSlope, 1) + ' % Steigung');
      if (m.inputs.elevMean != null) topoNotes.push(deNumber(Math.round(m.inputs.elevMean), 0) + ' m Höhe');
      addRow(
        'Topografie & Hanglage',
        topoNotes.join(', ') || null,
        m.deltaTopo,
        m.deltaTopo <= -0.05 ? 'bremsend' : m.deltaTopo >= 0.05 ? 'begünstigend' : 'neutral',
      );

      if (m.deltaRent != null) {
        addRow(
          'Mietniveau & Wohlstand',
          m.inputs.rent != null ? deNumber(m.inputs.rent, 2) + ' €/m² Kaltmiete' : null,
          m.deltaRent,
          m.deltaRent >= 0.05 ? 'gehobenes Niveau' : m.deltaRent <= -0.05 ? 'niedrigeres Niveau' : 'neutral',
        );
      }

      if (m.deltaLiving != null) {
        addRow(
          'Verkehrsberuhigung & Spielstraßen',
          m.inputs.livingSharePct != null ? deNumber(m.inputs.livingSharePct, 1) + ' % des Netzes' : null,
          m.deltaLiving,
          m.deltaLiving >= 0.05 ? 'hohe Beruhigung' : m.deltaLiving <= -0.05 ? 'wenig Beruhigung' : 'neutral',
        );
      }

      addRow(
        'Siedlungsdichte',
        m.inputs.density != null ? deNumber(Math.round(m.inputs.density), 0) + ' Einw./km²' : null,
        m.deltaDens,
        m.deltaDens >= 0.05 ? 'überdurchschn.' : m.deltaDens <= -0.05 ? 'unterdurchschn.' : 'neutral',
      );

      addRow(
        'ÖPNV-Haltestellennähe',
        m.inputs.stDistKm != null ? 'Ø ' + deNumber(m.inputs.stDistKm, 1) + ' km Distanz' : null,
        m.deltaTransit,
        m.deltaTransit >= 0.05 ? 'gute Anbindung' : m.deltaTransit <= -0.05 ? 'weite Wege' : 'neutral',
      );

      if (m.deltaCars != null) {
        addRow(
          'Motorisierungsgrad',
          m.inputs.carsPer1000 != null ? deNumber(Math.round(m.inputs.carsPer1000), 0) + ' PKW / 1k Einw.' : null,
          m.deltaCars,
          m.deltaCars >= 0.05 ? 'wenig PKW' : m.deltaCars <= -0.05 ? 'viele PKW' : 'neutral',
        );
      }

      addRow(
        'Struktureller Erwartungswert',
        'Aus Topografie, Wohlstand, Beruhigung & Dichte',
        formatUiPct(m.expectedPct) + ' %',
        'ca. ' + deNumber(Math.round(m.expectedKm), 0) + ' km',
        'model-row-total',
      );

      addRow(
        'Tatsächlicher Radinfra-Ausbau',
        'Laut OpenStreetMap-Erfassung',
        formatUiPct(m.actualPct) + ' %',
        deNumber(m.actualKm, m.actualKm < 10 ? 1 : 0) + ' km',
        'model-row-actual',
      );

      addRow(
        m.behind ? 'Aufholbedarf (Lücke)' : 'Gestaltungsspielraum (Vorsprung)',
        'Politische Priorität & Investitionen',
        (m.diffPct > 0 ? '+' : '') + formatUiPct(m.diffPct) + ' %',
        (m.diffKm > 0 ? '+' : '') + deNumber(m.diffKm, 1) + ' km',
        'model-row-diff',
      );

      table.appendChild(tbody);
      details.appendChild(table);

      const note = document.createElement('p');
      note.className = 'model-breakdown-note';
      note.textContent =
        'Strukturmerkmale (Topografie, Miete/Wohlstand, Verkehrsberuhigung, Dichte) erklären ~28 % der bundesweiten Unterschiede (Topografie 17 %, Miete 8 %, Beruhigung 2 %). ' +
        'Über 72 % beruhen auf kommunaler Schwerpunktsetzung.';
      details.appendChild(note);

      regionDetailModelGap.appendChild(details);
      regionDetailModelGap.hidden = false;
    }

    /** Fewer than this and a fifth of the distribution is a single region: no bar. */
    const CONTEXT_MIN_REFERENCE = 8;

    const CONTEXT_REFERENCE_NOUN = {
      '8': { nom: 'Gemeinden', gen: 'Gemeinden' },
      '6': { nom: 'Landkreise und kreisfreie Städte', gen: 'Landkreise und kreisfreien Städte' },
      '4': { nom: 'Bundesländer', gen: 'Bundesländer' },
    };

    function deNumber(value, digits) {
      return value.toLocaleString('de-DE', { maximumFractionDigits: digits });
    }

    /** Each figure the card shows next to the bike share, and how to read it off the data. */
    /** 7,5 min · 34 min · 2 h 10 min */
    function formatMinutes(v) {
      if (v < 10) return deNumber(v, 1) + ' min';
      if (v < 60) return deNumber(Math.round(v), 0) + ' min';
      const total = Math.round(v);
      return Math.floor(total / 60) + ' h' + (total % 60 ? ' ' + (total % 60) + ' min' : '');
    }

    const STATION_ACCESS_MODES = [
      { key: 'foot', label: 'zu Fuß', csv: 'zu Fuß' },
      { key: 'bike', label: 'Rad', csv: 'mit dem Rad' },
      { key: 'car', label: 'Auto', csv: 'mit dem Auto' },
    ];

    /** Travel time along the paths to the nearest station for one mode, with its distance. */
    function stationAccessMetric(mode, label) {
      return {
        key: 'station' + mode[0].toUpperCase() + mode.slice(1),
        label,
        note: 'entlang der Wege, einwohnergewichtet',
        source: transitIndex,
        get: (id) => {
          const v = transitIndex?.byId[id]?.access?.[mode]?.[0];
          return typeof v === 'number' ? v : null;
        },
        format: (v, id) => {
          const km = id ? transitIndex?.byId[id]?.access?.[mode]?.[1] : null;
          return (
            formatMinutes(v) +
            (typeof km === 'number' ? ' (' + deNumber(km, km < 10 ? 1 : 0) + ' km)' : '')
          );
        },
      };
    }

    function contextMetrics() {
      const slope = (key) => (id) => {
        const v = terrainIndex?.byId[id]?.[key];
        return typeof v === 'number' ? v : null;
      };
      return [
        {
          key: 'density',
          label: 'Bevölkerungsdichte',
          source: densityIndex,
          get: (id) => (typeof densityIndex?.byId[id] === 'number' ? densityIndex.byId[id] : null),
          format: (v) => deNumber(Math.round(v), 0) + ' Einw./km²',
        },
        {
          key: 'rent',
          label: 'Ø Nettokaltmiete (Zensus 2022)',
          note: 'Wohn- & Bodenwert',
          source: zensusIndex,
          get: (id) => {
            const v = zensusIndex?.byId[id]?.rentPerM2;
            return typeof v === 'number' ? v : null;
          },
          format: (v) => deNumber(v, 2) + ' €/m²',
        },
        {
          key: 'youth',
          label: 'Kinder & Jugendliche (< 18 Jahre)',
          note: 'Schulweg-Bedarf',
          source: zensusIndex,
          get: (id) => {
            const v = zensusIndex?.byId[id]?.youthSharePct;
            return typeof v === 'number' ? v : null;
          },
          format: (v) => deNumber(v, 1) + ' %',
        },
        {
          key: 'vacancy',
          label: 'Wohnungsleerstand',
          source: zensusIndex,
          get: (id) => {
            const v = zensusIndex?.byId[id]?.vacancyRatePct;
            return typeof v === 'number' ? v : null;
          },
          format: (v) => deNumber(v, 1) + ' %',
        },
        {
          key: 'carDensity',
          label: 'PKW-Dichte (KBA)',
          note: 'Motorisierungsgrad',
          source: carsIndex,
          get: (id) => {
            const v = carsIndex?.byId[id]?.carsPer1000;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const comm = carsIndex?.byId[id]?.commercialSharePct;
            return (
              deNumber(Math.round(v), 0) +
              ' PKW / 1.000 Einw.' +
              (typeof comm === 'number' ? ' (davon ' + deNumber(comm, 1) + ' % gewerblich)' : '')
            );
          },
        },
        {
          key: 'calmedShare',
          label: 'Wohn- & Tempo-30-Netz',
          note: 'Erschließungsstraßen',
          source: calmedIndex,
          get: (id) => {
            const v = calmedIndex?.byId[id]?.calmedSharePct;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const km = calmedIndex?.byId[id]?.calmedKm;
            return (
              deNumber(v, 1) +
              ' %' +
              (typeof km === 'number' ? ' (' + deNumber(Math.round(km), 0) + ' km)' : '')
            );
          },
        },
        {
          key: 'livingShare',
          label: 'Verkehrsberuhigt & Fahrradstraßen',
          note: 'Spielstraßen & Vorrang Rad',
          source: calmedIndex,
          get: (id) => {
            const v = calmedIndex?.byId[id]?.livingSharePct;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const km = calmedIndex?.byId[id]?.livingKm;
            return (
              deNumber(v, 1) +
              ' %' +
              (typeof km === 'number' ? ' (' + deNumber(km, 1) + ' km)' : '')
            );
          },
        },
        {
          key: 'bikeAccidents',
          label: 'Fahrradunfälle mit Personenschaden',
          note: 'Unfallatlas 2023',
          source: accidentsIndex,
          get: (id) => {
            const v = accidentsIndex?.byId[id]?.bikeAccidents;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const per10k = accidentsIndex?.byId[id]?.bikeAccidentsPer10k;
            const severe = accidentsIndex?.byId[id]?.bikeFatalOrSevere;
            let text = deNumber(v, 0);
            if (typeof per10k === 'number') {
              text += ' (' + deNumber(per10k, 1) + ' / 10.000 Einw.)';
            }
            if (typeof severe === 'number' && severe > 0) {
              text += ', davon ' + severe + ' schwer/tödlich';
            }
            return text;
          },
        },
        {
          key: 'bikeAccidentsPer10k',
          label: 'Fahrradunfälle je 10.000 Einw.',
          note: 'Verunglückte relativ zur Bevölkerung',
          source: accidentsIndex,
          get: (id) => {
            const v = accidentsIndex?.byId[id]?.bikeAccidentsPer10k;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const count = accidentsIndex?.byId[id]?.bikeAccidents;
            return (
              deNumber(v, 1) +
              ' / 10.000 Einw.' +
              (typeof count === 'number' ? ' (' + deNumber(count, 0) + ' Unfälle)' : '')
            );
          },
        },
        {
          key: 'bikeFatalOrSevere',
          label: 'Schwere Fahrradunfälle (Getötete & Schwerverletzte)',
          note: 'Unfallschwere (Kategorie 1 & 2)',
          source: accidentsIndex,
          get: (id) => {
            const v = accidentsIndex?.byId[id]?.bikeFatalOrSevere;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const fatal = accidentsIndex?.byId[id]?.bikeFatal;
            return (
              deNumber(v, 0) +
              (typeof fatal === 'number' && fatal > 0 ? ' (davon ' + fatal + ' tödlich)' : '')
            );
          },
        },
        {
          key: 'jobCentrality',
          label: 'Arbeitsplatzzentralität',
          note: 'Arbeitsplätze ÷ Beschäftigte am Wohnort',
          source: commutersIndex,
          get: (id) => {
            const v = commutersIndex?.byId[id]?.jobCentrality;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const jobs = commutersIndex?.byId[id]?.employedAtWorkplace;
            const res = commutersIndex?.byId[id]?.employedAtResidence;
            let text = deNumber(v, 2);
            if (typeof jobs === 'number' && typeof res === 'number') {
              text +=
                ' (' +
                deNumber(jobs, 0) +
                ' Arbeitsplätze / ' +
                deNumber(res, 0) +
                ' Erwerbstätige)';
            }
            return text;
          },
        },
        {
          key: 'netCommuters',
          label: 'Pendlersaldo',
          note: 'Einpendler minus Auspendler',
          source: commutersIndex,
          get: (id) => {
            const v = commutersIndex?.byId[id]?.netCommuters;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const sign = v > 0 ? '+' : '';
            const inp = commutersIndex?.byId[id]?.inCommuters;
            const outp = commutersIndex?.byId[id]?.outCommuters;
            let text = sign + deNumber(v, 0);
            if (typeof inp === 'number' && typeof outp === 'number') {
              text += ' (' + deNumber(inp, 0) + ' Ein- / ' + deNumber(outp, 0) + ' Auspendler)';
            }
            return text;
          },
        },
        {
          key: 'commuterRates',
          label: 'Ein- / Auspendlerquote',
          note: 'Anteil Pendler an Beschäftigten',
          source: commutersIndex,
          get: (id) => {
            const inp = commutersIndex?.byId[id]?.inCommuterSharePct;
            return typeof inp === 'number' ? inp : null;
          },
          format: (v, id) => {
            const outp = commutersIndex?.byId[id]?.outCommuterSharePct;
            let text = 'Einpendler: ' + deNumber(v, 1) + ' %';
            if (typeof outp === 'number') {
              text += ', Auspendler: ' + deNumber(outp, 1) + ' %';
            }
            return text;
          },
        },
        {
          key: 'employedAtWorkplace',
          label: 'Sozialvers. Beschäftigte am Arbeitsort',
          note: 'Bundesagentur für Arbeit 2025',
          source: commutersIndex,
          get: (id) => {
            const v = commutersIndex?.byId[id]?.employedAtWorkplace;
            return typeof v === 'number' ? v : null;
          },
          format: (v, id) => {
            const per1000 = commutersIndex?.byId[id]?.jobsPer1000Inhabitants;
            let text = deNumber(v, 0);
            if (typeof per1000 === 'number') {
              text += ' (' + deNumber(per1000, 0) + ' je 1.000 Einw.)';
            }
            return text;
          },
        },
        {
          key: 'stops',
          label: 'Bahn-/Tram-/Fährhaltestellen',
          source: transitIndex,
          get: (id) => {
            const v = transitIndex?.byId[id]?.density;
            return typeof v === 'number' ? v : null;
          },
          format: (v) => deNumber(v, 2) + ' pro km²',
        },
        {
          key: 'stationDistance',
          label: 'Ø Luftlinie zur nächsten Haltestelle',
          note: 'einwohnergewichtet',
          source: transitIndex,
          get: (id) => {
            const v = transitIndex?.byId[id]?.avgDistanceToStationM;
            return typeof v === 'number' ? v / 1000 : null;
          },
          format: (v) => deNumber(v, v < 10 ? 1 : 0) + ' km',
        },
        stationAccessMetric('foot', 'Ø zu Fuß zur nächsten Haltestelle'),
        stationAccessMetric('bike', 'Ø mit dem Rad zur nächsten Haltestelle'),
        {
          key: 'highwayDistance',
          label: 'Ø Distanz zur nächsten Autobahn/Kraftfahrstraße',
          note: 'einwohnergewichtet',
          source: transitIndex,
          get: (id) => {
            const v = transitIndex?.byId[id]?.avgDistanceToHighwayM;
            return typeof v === 'number' ? v / 1000 : null;
          },
          format: (v) => deNumber(v, v < 10 ? 1 : 0) + ' km',
        },
        {
          key: 'elevation',
          label: 'Höhenlage (Ø)',
          source: terrainIndex,
          get: slope('elevationMean'),
          format: (v, id) => {
            const range = terrainIndex?.byId[id]?.elevationRange;
            return (
              deNumber(Math.round(v), 0) +
              ' m' +
              (typeof range === 'number' ? ' (Spanne ' + deNumber(Math.round(range), 0) + ' m)' : '')
            );
          },
        },
        {
          key: 'areaSlope',
          label: 'Geländesteigung (Ø, Fläche)',
          source: terrainIndex,
          get: slope('area'),
          format: (v) => deNumber(v, 1) + ' %',
        },
        {
          key: 'roadSlope',
          label: 'Straßensteigung (Ø)',
          source: terrainIndex,
          get: slope('road'),
          format: (v) => deNumber(v, 1) + ' %',
        },
        {
          key: 'roadSteep',
          label: 'Steilste Straßenabschnitte',
          note: 'P95',
          source: terrainIndex,
          get: slope('roadSteepP95'),
          format: (v) => deNumber(v, 1) + ' %',
        },
      ];
    }

    const contextReferenceCache = new Map();
    const contextEntryCache = new Map();
    // Which yardstick the card compares against; kept across regions so clicking through
    // Gemeinden of one Landkreis keeps comparing within it.
    let contextScopeChoice = 'country';
    // The context metric whose scatter is unfolded. Kept across re-renders (counting filter,
    // scope pick, other region) so the card doesn't fold the plot away and jump under the cursor.
    let openContextPlotKey = null;

    /** Every value of one figure with where it belongs — built once per figure. */
    function contextEntries(metric) {
      let entries = contextEntryCache.get(metric.key);
      if (!entries) {
        entries = [];
        for (const id of Object.keys(metric.source?.byId || {})) {
          const v = metric.get(id);
          if (v == null || !Number.isFinite(v)) continue;
          const props = regionIndex?.byId.get(id)?.properties || {};
          const peerKey = peerGroupIndex?.byId[id] || '';
          entries.push({
            id,
            v,
            name: props.name || id,
            level: String(props.level ?? ''),
            bundesland: String(props.bundesland_id ?? ''),
            landkreis: String(props.landkreis_id ?? ''),
            peerKey,
          });
        }
        contextEntryCache.set(metric.key, entries);
      }
      return entries;
    }

    function contextFullReference(metric, level, scope) {
      return contextEntries(metric).filter(
        (e) =>
          e.level === level &&
          (scope.type === 'country' ||
            (scope.type === 'bundesland' && e.bundesland === scope.id) ||
            (scope.type === 'landkreis' && e.landkreis === scope.id) ||
            (scope.type === 'peers' && e.peerKey === scope.id)),
      );
    }

    /** Sorted values of one figure among regions of one level inside the chosen yardstick. */
    function contextReference(metric, level, scope) {
      const key = metric.key + '|' + level + '|' + scope.type + '|' + (scope.id || '');
      let values = contextReferenceCache.get(key);
      if (!values) {
        values = contextFullReference(metric, level, scope)
          .map((e) => e.v)
          .sort((a, b) => a - b);
        contextReferenceCache.set(key, values);
      }
      return values;
    }

    /**
     * The yardsticks a region can be compared within, each as a full phrase ("label", for the
     * select) and as the group it names ("group", for the tooltip). Every region has Deutschland
     * and its Bundesland; a Gemeinde also its Landkreis and its demographic peer group (size class
     * and urbanisation — the size class alone said little, so it is not offered on its own).
     */
    function contextScopesFor(p, noun) {
      const nameOf = (id) => String(regionIndex?.byId.get(id)?.properties?.name ?? id);
      const nomNoun = typeof noun === 'string' ? noun : noun.nom;
      const genNoun = typeof noun === 'string' ? noun : (noun.gen || noun.dat || noun.nom);
      const inPlace = (place) => {
        const where = RankingDisplay.inPlacePhrase(place);
        return { label: 'Alle ' + nomNoun + ' ' + where, group: genNoun + ' ' + where };
      };
      const scopes = [{ type: 'country', ...inPlace('Deutschland') }];
      const level = String(p.level ?? '');
      if (level !== '4' && p.bundesland_id) {
        scopes.push({ type: 'bundesland', id: String(p.bundesland_id), ...inPlace(nameOf(p.bundesland_id)) });
      }
      if (level === '8' && p.landkreis_id) {
        scopes.push({ type: 'landkreis', id: String(p.landkreis_id), ...inPlace(nameOf(p.landkreis_id)) });
      }
      const peerKey = (level === '8' || level === '6') ? peerGroupIndex?.byId[p.id] : null;
      if (peerKey) {
        const peerLabel = peerGroupIndex.groups[peerKey] || '';
        const isCounty = level === '6';
        scopes.push({
          type: 'peers',
          id: peerKey,
          label: (isCounty ? 'Ähnliche Kreise (' : 'Ähnliche Gemeinden (') + peerLabel + ')',
          group: (isCounty ? 'ähnlichen Kreise (' : 'ähnlichen Gemeinden (') + peerLabel + ')',
        });
      }
      return scopes;
    }

    /**
     * Population density, rail/tram/ferry-stop density, and terrain flatness — context for why
     * bike infrastructure varies between regions. A bare "104 Einwohner/km²" says little, so
     * each figure is placed among all regions of the same level in Germany: a marker on a bar
     * (fifths of the distribution) and a word for the fifth it falls in. Sources:
     * gemeinde-density.json (fetchGemeindeDemographics.ts), gemeinde-transit.json
     * (fetchTransitStopCounts.ts — rail/tram/ferry only, no bus stops; density is stops/km², plus
     * the population-weighted mean distance to the nearest station from the Zensus 2022 100m
     * population grid), gemeinde-terrain.json (fetchTerrainFlatness.ts — mean local slope from
     * Terrarium elevation tiles, sampled both over the whole Gemeinde area and along the actual
     * road network, plus a steep-spot percentile and mean/range elevation — see that script's
     * header for why these can diverge, e.g. a high-elevation plateau can be locally flatter than
     * a lower-lying river valley).
     */
    function renderRegionExtra(p) {
      ensureRegionExtraIndexes();
      const level = String(p.level ?? '');
      const noun = CONTEXT_REFERENCE_NOUN[level] || { nom: 'Gebiete', gen: 'Gebiete' };
      const scopes = contextScopesFor(p, noun);
      const scope = scopes.find((sc) => sc.type === contextScopeChoice) || scopes[0];
      regionDetailExtra.replaceChildren();
      for (const metric of contextMetrics()) {
        const value = metric.get(p.id);
        if (value == null || !Number.isFinite(value)) continue;
        if (!regionDetailExtra.firstChild) {
          const caption = document.createElement('p');
          caption.className = 'ctx-caption';
          caption.append('Zum Vergleich: ');
          if (scopes.length > 1) {
            const pick = document.createElement('select');
            pick.className = 'ctx-scope';
            pick.setAttribute('aria-label', 'Vergleichsgruppe');
            for (const sc of scopes) {
              const option = document.createElement('option');
              option.value = sc.type;
              option.textContent = sc.label;
              pick.appendChild(option);
            }
            pick.value = scope.type;
            pick.addEventListener('change', () => {
              contextScopeChoice = pick.value;
              renderRegionExtra(p);
            });
            caption.appendChild(pick);
          } else {
            caption.append(scope.label);
          }
          regionDetailExtra.appendChild(caption);
          const hint = document.createElement('p');
          hint.className = 'ctx-hint';
          hint.textContent = '▸ Zeile öffnen: Streudiagramm mit dem Radinfra-Anteil aller Vergleichsgebiete';
          regionDetailExtra.appendChild(hint);
        }
        const row = document.createElement('div');
        row.className = 'ctx-row';
        const head = document.createElement('div');
        head.className = 'ctx-head';
        const label = document.createElement('span');
        label.className = 'ctx-label';
        label.textContent = metric.label;
        if (metric.note) {
          const note = document.createElement('small');
          note.textContent = ' (' + metric.note + ')';
          label.appendChild(note);
        }
        const valueEl = document.createElement('span');
        valueEl.className = 'ctx-value';
        valueEl.textContent = metric.format(value, p.id);
        head.append(label, valueEl);
        row.appendChild(head);

        const reference = metric.noBar ? [] : contextReference(metric, level, scope);
        const pct =
          reference.length >= CONTEXT_MIN_REFERENCE
            ? RankingDisplay.percentileOf(reference, value)
            : null;
        if (pct != null) {
          const band = RankingDisplay.contextBand(pct);
          const bandEl = document.createElement('em');
          bandEl.className = 'ctx-band';
          bandEl.textContent = band;
          valueEl.appendChild(bandEl);
          const median = RankingDisplay.medianOfSorted(reference);
          row.title =
            'Höher als ' +
            Math.round(pct * 100) +
            ' % der ' +
            deNumber(reference.length, 0) +
            ' ' +
            scope.group +
            ' (Median: ' +
            metric.format(median, null) +
            ')';
          const track = document.createElement('div');
          track.className = 'ctx-track';
          for (const fifth of [20, 40, 60, 80]) {
            const tick = document.createElement('i');
            tick.style.left = fifth + '%';
            track.appendChild(tick);
          }
          const marker = document.createElement('span');
          marker.className = 'ctx-marker';
          marker.style.left = Math.max(1, Math.min(99, pct * 100)) + '%';
          track.appendChild(marker);
          row.appendChild(track);
        }
        if (!metric.noBar) {
          row.classList.add('ctx-row--plot');
          row.dataset.metric = metric.key;
          row.tabIndex = 0;
          row.setAttribute('role', 'button');
          row.setAttribute('aria-expanded', 'false');
          row.openPlot = () => openMetricPlot(row, metric, level, scope, p);
          const toggle = () => {
            const wasOpen = !!row.querySelector('.ctx-plot');
            closeMetricPlots();
            openContextPlotKey = wasOpen ? null : metric.key;
            if (!wasOpen) row.openPlot();
          };
          row.addEventListener('click', toggle);
          row.addEventListener('keydown', (ev) => {
            if (ev.target !== row || (ev.key !== 'Enter' && ev.key !== ' ')) return;
            ev.preventDefault();
            toggle();
          });
        }
        regionDetailExtra.appendChild(row);
      }
      regionDetailExtra.hidden = !regionDetailExtra.firstChild;
      // Hidden card = first selection: showRegionDetail reopens the plot once the card has a width.
      if (!regionDetailEl.hidden) reopenContextPlot();
    }

    function closeMetricPlots() {
      for (const openPlot of regionDetailExtra.querySelectorAll('.ctx-plot')) openPlot.remove();
      for (const row of regionDetailExtra.querySelectorAll('.ctx-row--plot')) {
        row.setAttribute('aria-expanded', 'false');
      }
    }

    function reopenContextPlot() {
      // Folded away, the row has no width yet; the toggle listener below reopens it on unfold.
      if (!openContextPlotKey || !regionDetailMore?.open) return;
      const row = regionDetailExtra.querySelector('.ctx-row[data-metric="' + openContextPlotKey + '"]');
      if (row && !row.querySelector('.ctx-plot')) row.openPlot?.();
    }

    function openMetricPlot(row, metric, level, scope, selectedRegion) {
      const plot = buildMetricPlot(metric, level, scope);
      if (!plot) return;
      plot.plotDiv.addEventListener('click', (ev) => ev.stopPropagation());
      row.appendChild(plot.plotDiv);
      row.setAttribute('aria-expanded', 'true');
      // Drawn after insertion so it can take the card's real pixel width.
      renderMetricPlot(plot.chart, metric, plot.entries, selectedRegion.id);
    }

    /** Scatter of one context metric against the share, for the regions of the given scope. */
    function buildMetricPlot(metric, level, scope) {
      // The share depends on the counting filter, so it is computed here, not cached.
      const entries = [];
      for (const e of contextFullReference(metric, level, scope)) {
        const props = regionIndex?.byId.get(e.id)?.properties;
        if (!props) continue;
        const { roadKm, bikeKm } = TildaStats.computeFilteredLengths(
          props.road_length,
          props.bikelane_length,
          lengthClassFilter,
        );
        // Same rule as the colour scale: a few km of road give meaningless shares (often >100 %).
        if (TildaStats.isLowRoadNetworkForScale(roadKm)) continue;
        entries.push({ ...e, bikeSharePct: (bikeKm / roadKm) * 100 });
      }

      if (entries.length < 3) return null;

      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
      for (const e of entries) {
        sumX += e.v;
        sumY += e.bikeSharePct;
        sumXY += e.v * e.bikeSharePct;
        sumX2 += e.v * e.v;
        sumY2 += e.bikeSharePct * e.bikeSharePct;
      }
      const n = entries.length;
      const divisor = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
      const r = divisor === 0 ? 0 : (n * sumXY - sumX * sumY) / divisor;

      const plotDiv = document.createElement('div');
      plotDiv.className = 'ctx-plot';
      const title = document.createElement('div');
      title.className = 'ctx-plot-title';
      const strong = document.createElement('strong');
      strong.textContent = metric.label;
      title.append(
        strong,
        ' und Radinfra-Anteil · ' + deNumber(n, 0) + ' Gebiete · Korrelation r = ' + deNumber(r, 2),
      );
      const chart = document.createElement('div');
      chart.className = 'ctx-plot-chart';
      plotDiv.append(title, chart);
      return { plotDiv, chart, entries };
    }

    /** Roughly five round tick values spanning [min, max]. */
    function niceTicks(min, max) {
      const span = max - min || 1;
      const mag = Math.pow(10, Math.floor(Math.log10(span / 5)));
      const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((st) => span / st <= 6) || 10 * mag;
      const ticks = [];
      for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
        ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
      }
      return ticks;
    }

    function renderMetricPlot(chart, metric, entries, selectedId, fixedWidth, fixedHeight) {
      const width = fixedWidth || Math.max(200, chart.clientWidth);
      const height = fixedHeight || Math.round(Math.min(320, Math.max(180, width * 0.7)));
      const m = { top: 18, right: 10, bottom: 34, left: 40 };
      const plotW = width - m.left - m.right;
      const plotH = height - m.top - m.bottom;

      // Axes end at the 1st/99th percentile so a handful of outliers don't squash the cloud;
      // points beyond are pinned to the edge.
      const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      const xs = entries.map((e) => e.v).sort((a, b) => a - b);
      const ys = entries.map((e) => e.bikeSharePct).sort((a, b) => a - b);
      const minX = quantile(xs, 0.01), maxX = quantile(xs, 0.99);
      const padX = (maxX - minX) * 0.03 || 1;
      const x0 = minX - padX, x1 = maxX + padX;
      const y1 = quantile(ys, 0.99) * 1.03 || 1;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const scaleX = (x) => m.left + ((clamp(x, x0, x1) - x0) / (x1 - x0)) * plotW;
      const scaleY = (y) => m.top + plotH - (clamp(y, 0, y1) / y1) * plotH;
      // Tick labels are bare numbers; the unit goes into the axis title.
      const unitMatch = /^[−\\-]?[\\d.,]+\\s*([^\\d]*)$/.exec(metric.format(maxX, null));
      const xUnit = unitMatch ? unitMatch[1].trim() : '';
      const tickLabel = (t, ticks) => {
        const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
        return deNumber(t, step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
      };

      const svgNs = 'http://www.w3.org/2000/svg';
      const el = (tag, attrs, text) => {
        const node = document.createElementNS(svgNs, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
        if (text != null) node.textContent = text;
        return node;
      };
      const svg = el('svg', { viewBox: '0 0 ' + width + ' ' + height, width, height });

      const xTicks = niceTicks(x0, x1);
      // Thin out x labels when the card is narrow, so they don't collide.
      const xLabelEvery = width / xTicks.length < 40 ? 2 : 1;
      xTicks.forEach((t, i) => {
        const x = scaleX(t);
        svg.appendChild(el('line', { x1: x, x2: x, y1: m.top, y2: m.top + plotH, class: 'grid' }));
        if (i % xLabelEvery === 0) {
          svg.appendChild(el('text', { x, y: m.top + plotH + 13, 'text-anchor': 'middle' }, tickLabel(t, xTicks)));
        }
      });
      const yTicks = niceTicks(0, y1);
      for (const t of yTicks) {
        const y = scaleY(t);
        svg.appendChild(el('line', { x1: m.left, x2: m.left + plotW, y1: y, y2: y, class: 'grid' }));
        svg.appendChild(el('text', { x: m.left - 4, y: y + 3, 'text-anchor': 'end' }, tickLabel(t, yTicks) + ' %'));
      }
      svg.appendChild(
        el(
          'text',
          { x: m.left + plotW / 2, y: height - 4, 'text-anchor': 'middle', class: 'axis-title' },
          metric.label + (xUnit ? ' (' + xUnit + ')' : ''),
        ),
      );
      svg.appendChild(el('text', { x: 0, y: 10, class: 'axis-title' }, 'Radinfra-Anteil'));

      let selected = null;
      // Scale dot opacity inversely with point density so dense areas don't collapse into a
      // flat solid wall, but form a visible density heatmap where the cluster ("dunkelblauer Blob")
      // stands out clearly.
      const dotOpacity = Math.max(
        0.04,
        Math.min(0.4, Number((1 / (1.5 + Math.sqrt(entries.length) * 0.18)).toFixed(3))),
      );
      const dots = el('g', {
        class: 'dots',
        style: '--dot-opacity: ' + dotOpacity,
        'fill-opacity': dotOpacity,
      });
      for (const e of entries) {
        if (e.id === selectedId) {
          selected = e;
          continue;
        }
        const pt = el('circle', { cx: scaleX(e.v), cy: scaleY(e.bikeSharePct), r: 2 });
        pt.appendChild(
          el('title', {}, e.name + '\\n' + metric.label + ': ' + metric.format(e.v, e.id) + '\\nAnteil: ' + formatUiPct(e.bikeSharePct) + ' %'),
        );
        dots.appendChild(pt);
      }
      svg.appendChild(dots);

      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (const e of entries) {
        sumX += e.v;
        sumY += e.bikeSharePct;
        sumXY += e.v * e.bikeSharePct;
        sumX2 += e.v * e.v;
      }
      const n = entries.length;
      const denomX = n * sumX2 - sumX * sumX;
      if (denomX !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denomX;
        const intercept = (sumY - slope * sumX) / n;
        const pts = [];
        const addPt = (x, y) => {
          if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > 1e-4)) {
            pts.push({ x, y });
          }
        };
        const yAtX0 = slope * x0 + intercept;
        if (yAtX0 >= 0 && yAtX0 <= y1) addPt(x0, yAtX0);
        const yAtX1 = slope * x1 + intercept;
        if (yAtX1 >= 0 && yAtX1 <= y1) addPt(x1, yAtX1);
        if (slope !== 0) {
          const xAtY0 = -intercept / slope;
          if (xAtY0 >= x0 && xAtY0 <= x1) addPt(xAtY0, 0);
          const xAtY1 = (y1 - intercept) / slope;
          if (xAtY1 >= x0 && xAtY1 <= x1) addPt(xAtY1, y1);
        }
        if (pts.length >= 2) {
          pts.sort((a, b) => a.x - b.x);
          const trendLine = el('line', {
            x1: scaleX(pts[0].x),
            y1: scaleY(pts[0].y),
            x2: scaleX(pts[1].x),
            y2: scaleY(pts[1].y),
            class: 'trend',
          });
          trendLine.appendChild(el('title', {}, 'Trendlinie (lineare Regression)'));
          svg.appendChild(trendLine);
        }
      }

      if (selected) {
        const sx = scaleX(selected.v), sy = scaleY(selected.bikeSharePct);
        svg.appendChild(el('circle', { cx: sx, cy: sy, r: 5, class: 'selected' }));
        const onRight = sx < m.left + plotW * 0.6;
        svg.appendChild(
          el(
            'text',
            { x: sx + (onRight ? 8 : -8), y: sy - 7, 'text-anchor': onRight ? 'start' : 'end', class: 'selected-label' },
            selected.name + ' (' + formatUiPct(selected.bikeSharePct) + ' %)',
          ),
        );
      }
      chart.replaceChildren(svg);
    }

    /**
     * The scope that looks into a region — null when there is nothing to look into: a Gemeinde
     * has no sub-areas (the scope for it would just be its Landkreis), and a scope that is
     * already showing it changes nothing.
     */
    function regionDrillScope(id, level) {
      if (!regionIndex || String(level) === '8') return null;
      const scope = SimpleView.expertViewScopeFromFocus(id, regionIndex);
      if (!scope) return null;
      const current = currentViewScope;
      const changes =
        scope.gebiet !== current.gebiet ||
        (scope.untergebiet || '') !== (current.untergebiet || '') ||
        scope.darstellung !== current.darstellung;
      return changes ? scope : null;
    }

    function drillIntoRegion(id, level) {
      const scope = regionDrillScope(id, level);
      if (!scope) return false;
      scheduleUrlSync('push');
      exitNeighborView();
      applyExpertScopeToUi(scope);
      updateScaleCapDefaultForView();
      void applyScopeChange();
      return true;
    }

    function showRegionDetail(feature, opts) {
      const freshSelection = !!(opts && opts.freshSelection);
      // A refresh (counting filter, breakdown toggle) empties and refills the card. On a
      // computer the card is its own scroll box, so without this it snaps back to the top.
      const prevCardScrollTop = !freshSelection && !regionDetailEl.hidden ? regionDetailEl.scrollTop : null;
      const p = feature.properties || {};
      const detailId = String(p.id ?? '');
      if (detailId) setSelectedFeatureId(detailId, feature);
      regionDetailTitle.textContent = p.name || p.id || 'Gebiet';
      const rankInfo = rankByFeatureId.get(p.id);
      const containerName = focusContainerName();
      const rankText = rankInfo
        ? 'Platz ' + rankInfo.rank + ' von ' + rankInfo.total + ' ' + viewComparisonLabel()
        : containerName
          ? 'In dieser Ansicht Teil von ' + containerName
          : 'Kein Rang (ohne Straßendaten in der Zählung)';
      const rankLine = p.lowRoad && p.roadSumKm > 0
        ? 'Kein Rang (weniger als 5 km Straße – der Prozentwert ist hier nicht aussagekräftig)'
        : rankText;
      const pct =
        p.roadSumKm > 0 && typeof p.bikeSharePct === 'number'
          ? formatUiPct(p.bikeSharePct) + ' %'
          : '–';
      const pctEl = document.createElement('span');
      pctEl.className = 'region-detail-pct';
      pctEl.textContent = pct;
      const pctLabel = document.createElement('span');
      pctLabel.className = 'region-detail-pct-label';
      pctLabel.textContent = ' der Straßen mit Radinfrastruktur';
      const rankEl = document.createElement('span');
      rankEl.className = 'region-detail-rank';
      rankEl.textContent = rankLine;
      const kmEl = document.createElement('span');
      kmEl.className = 'region-detail-km';
      kmEl.textContent =
        TildaStats.formatStatKm(p.bikelaneSumKm, TildaStats.STAT_KM_BIKE_UI_DECIMALS) +
        ' km Radinfrastruktur bei ' +
        TildaStats.formatStatKm(p.roadSumKm, TildaStats.STAT_KM_ROAD_UI_DECIMALS) +
        ' km Straße';
      regionDetailMeta.replaceChildren(pctEl, pctLabel, rankEl, kmEl);
      const mainRoads = mainRoadBreakdownFor(p);
      if (mainRoads) {
        const line = document.createElement('span');
        line.className = 'region-detail-main-road';
        const strong = document.createElement('strong');
        strong.textContent = formatUiPct(mainRoads.pct) + ' %';
        line.append('Hauptverkehrsstraßen: ', strong, ' mit Radinfrastruktur');
        regionDetailMeta.appendChild(line);
      }
      renderRegionAuthority(p, mainRoads);
      renderRegionPeerGap(p);
      renderRegionModelGap(p);
      renderRegionGap(p);
      renderRegionQuality(p);
      renderRegionExtra(p);
      regionDetailBody.replaceChildren();
      regionDetailActions.replaceChildren();
      const filter = readLengthClassFilterFromUi();
      appendBreakdownToggle(regionDetailBody, () => showRegionDetail(feature));
      const detailed = regionBreakdownMode === 'detail';
      appendLengthRows(
        regionDetailBody,
        detailed ? 'Straßen nach Typ' : 'Straßen nach Klasse',
        detailed
          ? TildaStats.listFilteredHighwayTagLengths(p.road_length, filter)
          : TildaStats.listFilteredRoadClassLengths(p.road_length, filter),
        null,
        overlayRoadColorInput.value,
      );
      appendLengthRows(
        regionDetailBody,
        detailed ? 'Radinfrastruktur nach Typ' : 'Radinfrastruktur nach Klasse',
        detailed
          ? TildaStats.listFilteredBikelaneTagLengths(p.bikelane_length, filter)
          : TildaStats.listFilteredBikelaneClassLengths(p.bikelane_length, filter),
        detailed ? 'bikelane-tag' : 'bikelane-class',
        overlayBikelaneColorInput.value,
      );
      // Drilling into a region is a deliberate click (here, or a double-click on the map).
      // Search used to do it implicitly and only for some levels, which is why a Landkreis
      // search never showed a card at all.
      const drillChangesView = regionDrillScope(p.id, p.level) !== null;
      // Only Landkreise and Gemeinden have neighbours worth comparing with.
      const offerNeighbors =
        (String(p.level) === '6' || String(p.level) === '8') &&
        !(isNeighborView() && neighborFocus.focusId === p.id);
      const offerOsmEdit = String(p.level) === '8' || String(p.level) === '9';
      const links = document.createElement('p');
      links.className = 'region-detail-view-link region-detail-actions';
      if (drillChangesView) {
        const drillButton = document.createElement('button');
        drillButton.type = 'button';
        drillButton.className = 'region-detail-drill';
        drillButton.textContent = 'Untergebiete anzeigen';
        drillButton.title = 'Die Ansicht in dieses Gebiet hineinzoomen';
        drillButton.addEventListener('click', () => {
          drillIntoRegion(p.id, p.level);
        });
        links.appendChild(drillButton);
      }
      if (offerNeighbors) {
        const neighborButton = document.createElement('button');
        neighborButton.type = 'button';
        neighborButton.id = 'region-detail-neighbors';
        neighborButton.className = 'region-detail-drill';
        neighborButton.textContent = 'Mit Nachbarn vergleichen';
        neighborButton.title = 'Dieses Gebiet zusammen mit den angrenzenden anzeigen';
        neighborButton.addEventListener('click', async () => {
          neighborButton.disabled = true;
          const shown = await showWithNeighbors(p.id);
          if (!shown) neighborButton.textContent = 'Keine Nachbarn gefunden';
          else neighborButton.disabled = false;
        });
        links.appendChild(neighborButton);
      }
      if (offerOsmEdit) {
        const edit = osmEditLink(feature, 'Radweg fehlt? In OpenStreetMap ergänzen ↗');
        if (edit) links.appendChild(edit);
      }
      regionDetailActions.appendChild(links);
      regionDetailEl.hidden = false;
      document.body.dataset.regionDetail = '1';
      placeRegionDetail();
      reopenContextPlot();
      if (prevCardScrollTop != null) {
        regionDetailEl.scrollTop = prevCardScrollTop;
        requestAnimationFrame(() => {
          if (regionDetailEl.scrollTop !== prevCardScrollTop) regionDetailEl.scrollTop = prevCardScrollTop;
        });
      }
      updatePanelSummaryPreview();
      if (typeof sheetEnabled === 'function' && sheetEnabled()) {
        const wasPeek = sheetState() === 'peek';
        const wasFull = sheetState() === 'full';
        // setSheetState() always re-syncs the map itself; when the sheet is already open
        // (switching between regions without a peek->half transition) nothing else would.
        if (freshSelection && (wasPeek || wasFull)) setSheetState('half');
        else if (freshSelection) syncMapViewport(true);
        // On a new selection show the card from its top (region name first), not wherever
        // scrollIntoView lands a tall card — but don't yank the user back up on a mere refresh.
        if (freshSelection && panelMain) panelMain.scrollTop = 0;
      } else if (freshSelection) {
        regionDetailEl.scrollIntoView?.({ block: 'nearest' });
        // The card now covers the right of the map: pad for it and keep the region visible.
        syncMapViewport(true);
      }
    }

    /**
     * The Top & Flop window is built around the focus region (the selection, or the visible
     * area that contains it), so it has to follow every change of that focus — not just the
     * highlight classes on rows that happen to be drawn already.
     */
    function rebuildRankingForFocus() {
      if (rankingMode !== 'topflop' || !lastRankingSorted.length) return;
      const prevScrollTop = panelMain ? panelMain.scrollTop : 0;
      updateRanking(lastRankingSorted, lastRankingMinPct, lastRankingMaxPct);
      if (panelMain) panelMain.scrollTop = prevScrollTop;
    }

    function setSelectedFeatureId(id, feature) {
      const previousId = selectedFeatureId;
      selectedFeatureId = id;
      selectedFeatureOverride =
        id && feature?.properties?.id === id ? feature : null;
      updateMapHighlights();
      if (previousId !== id) rebuildRankingForFocus();
      if (id) probeSharePreviewPage(id);
      syncRankingRowHighlights();
      updatePanelSummaryPreview();
      syncExportDialogState();
      // A selection is a step the Back button should be able to undo.
      scheduleUrlSync(implicitSelectionClear ? undefined : 'push');
    }

    /** Pixels of the map hidden by the bottom sheet at its target state (0 on desktop / full). */
    function mapBottomInset() {
      if (typeof sheetEnabled !== 'function' || !sheetEnabled()) return 0;
      const st = typeof sheetState === 'function' ? sheetState() : 'peek';
      if (st === 'full') return 0;
      const vph =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vph')) ||
        window.innerHeight / 100;
      if (st === 'half') return Math.round(56 * vph);
      // peek: the sheet is always on screen at this height (not "small enough to ignore" —
      // it can hide an entire region on a Deutschland view, e.g. southern Bavaria, making it
      // untappable), so measure and reserve it too.
      const measured = panelMain ? panelMain.getBoundingClientRect().height : 0;
      return measured > 0 ? Math.round(measured) : 78; // fallback ~= --sheet-peek (4.9rem)
    }

    function prefersReducedMotion() {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /** Desktop padding reserving room for left panel (400px) and right card (460px). */
    function desktopMapPadding() {
      if (typeof sheetEnabled === 'function' && sheetEnabled()) return null;
      const leftPanel = document.getElementById('panel-main');
      const isPanelOpen = Boolean(leftPanel && leftPanel.open);
      const isDetailOpen = Boolean(document.body.dataset.regionDetail);
      const left = isPanelOpen ? Math.min(416, Math.round(window.innerWidth * 0.35)) : 24;
      const right = isDetailOpen ? Math.min(480, Math.round(window.innerWidth * 0.35)) : 24;
      return { top: 32, right, bottom: 32, left };
    }

    /**
     * Bring a selected region into the free part of the map — the part not covered by the left
     * panel, the open card or the phone sheet — with the least camera movement. Selecting never
     * zooms in; only a deliberate scope change re-frames the map.
     *   - fits and is fully inside the free part: stay put
     *   - fits but sticks out or is hidden: shift so it is centred (zoom unchanged)
     *   - does not fit: with allowZoomOut (a ranking click) zoom out just far enough to show
     *     all of it; without (a map click on a polygon bigger than the screen) leave it, unless
     *     none of it is visible, then shift.
     */
    function revealSelectedRegion(feature, allowZoomOut) {
      if (!feature?.geometry || typeof map.project !== 'function') return;
      const bbox = turf.bbox(feature);
      if (!bbox.every(Number.isFinite)) return;
      const pad = (typeof map.getPadding === 'function' && map.getPadding()) || {};
      const box = map.getContainer();
      const free = {
        left: pad.left || 0,
        top: pad.top || 0,
        right: box.clientWidth - (pad.right || 0),
        bottom: box.clientHeight - (pad.bottom || 0),
      };
      const nw = map.project([bbox[0], bbox[3]]);
      const se = map.project([bbox[2], bbox[1]]);
      const x0 = Math.min(nw.x, se.x);
      const x1 = Math.max(nw.x, se.x);
      const y0 = Math.min(nw.y, se.y);
      const y1 = Math.max(nw.y, se.y);
      const margin = 24;
      const fits =
        x1 - x0 <= free.right - free.left - 2 * margin &&
        y1 - y0 <= free.bottom - free.top - 2 * margin;
      const inside =
        x0 >= free.left + margin &&
        x1 <= free.right - margin &&
        y0 >= free.top + margin &&
        y1 <= free.bottom - margin;
      const overlaps = x1 > free.left && x0 < free.right && y1 > free.top && y0 < free.bottom;
      const duration = prefersReducedMotion() ? 0 : 400;
      if (!fits && allowZoomOut) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          {
            padding: { top: 56, right: 36, bottom: 36, left: 36 },
            duration,
            maxZoom: map.getZoom(),
          },
        );
        return;
      }
      if (fits ? inside : overlaps) return;
      map.easeTo({ center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], duration });
    }

    /**
     * While a region is selected on the phone the sheet covers the lower part of the map:
     * pad the map's bottom by the sheet height and re-frame the selected region into the
     * strip that is still visible. Resets to 0 when nothing is selected.
     * On desktop: offsets the visible map center between the left panel and right card.
     */
    function syncMapViewport(animate, allowZoomOut) {
      if (!map || typeof map.setPadding !== 'function') return;
      const isMobile = typeof sheetEnabled === 'function' && sheetEnabled();
      const selected = document.body.dataset.regionDetail
        ? selectedFeatureOverride || currentSelectedFeature()
        : null;

      let targetPadding = { top: 0, right: 0, bottom: 0, left: 0 };
      if (isMobile) {
        targetPadding.bottom = mapBottomInset();
      } else {
        const desk = desktopMapPadding();
        if (desk) targetPadding = desk;
      }

      const currentPadding = typeof map.getPadding === 'function' ? map.getPadding() : null;
      const paddingChanged =
        !currentPadding ||
        Math.abs((currentPadding.bottom || 0) - targetPadding.bottom) >= 2 ||
        Math.abs((currentPadding.left || 0) - targetPadding.left) >= 2 ||
        Math.abs((currentPadding.right || 0) - targetPadding.right) >= 2;

      if (paddingChanged) map.setPadding(targetPadding);

      const shouldAnimate = Boolean(animate) && !prefersReducedMotion();

      if (selected) {
        // The padding above may just have moved the free part of the map (card or sheet opened).
        if (!deferMapReveal) revealSelectedRegion(selected, allowZoomOut);
      } else if (paddingChanged && shouldAnimate && typeof map.easeTo === 'function') {
        map.easeTo({ padding: targetPadding, duration: 260 });
      }
    }

    function selectRegionById(id, mapFeature, panToMap) {
      if (selectedFeatureId) {
        const highlightIds = selectionHighlightIds();
        if (selectedFeatureId === id || highlightIds.includes(id)) {
          clearRegionSelection();
          return;
        }
      }
      const feature =
        lastRankingFeatures.find((f) => f.properties?.id === id) ||
        (mapFeature?.geometry
          ? {
              type: 'Feature',
              properties: { ...(mapFeature.properties || {}), id },
              geometry: mapFeature.geometry,
            }
          : null);
      if (!feature) return;
      clearOverlayLineHighlight();
      deferMapReveal = true;
      try {
        showRegionDetail(feature, { freshSelection: true });
      } finally {
        deferMapReveal = false;
      }
      // One camera decision, with the card/sheet padding already in place. panToMap = a ranking
      // click: show all of the region even if that means zooming out; a map click only shifts.
      syncMapViewport(true, !!panToMap);
    }

    let implicitSelectionClear = false;

    function clearRegionSelection() {
      clearOverlayLineHighlight();
      setSelectedFeatureId(null);
      regionDetailEl.hidden = true;
      delete document.body.dataset.regionDetail;
      placeRegionDetail();
      setHoveredRegionId(null);
      updatePanelSummaryPreview();
      // Clearing (tapping the same region again, the map background, …) should collapse an
      // open sheet back to peek too — otherwise it's left open over an empty region card.
      // setSheetState() re-syncs the map itself; skip the redundant extra call in that case.
      if (typeof sheetEnabled === 'function' && sheetEnabled() && sheetState() !== 'peek') {
        setSheetState('peek');
      } else {
        syncMapViewport(true);
      }
    }

    function refreshSelectedRegionIfNeeded() {
      if (!selectedFeatureId) return;
      const feature = lastRankingFeatures.find((f) => f.properties?.id === selectedFeatureId);
      const rawFeature = feature ? null : regionIndex?.byId.get(selectedFeatureId);
      if (feature) {
        showRegionDetail(feature);
      } else if (rawFeature && selectionHighlightIds().length) {
        // The view moved up (breadcrumb, coarser "Zeige"): the region is no longer a polygon of
        // its own, but it stays the focus — carried by the visible area that contains it, which
        // the map outlines and the ranking marks. Dropping it here would leave that area in the
        // ranking window with nothing saying why.
        showRegionDetail(enrichFeature(rawFeature));
      } else {
        // The new view is already a history step of its own; the selection it drops is not a
        // second one — otherwise Back needs two presses to undo a single view change.
        implicitSelectionClear = true;
        try {
          clearRegionSelection();
        } finally {
          implicitSelectionClear = false;
        }
      }
    }

    /**
     * A shared link can carry ?region=<osm id> so the recipient lands on the same selected
     * region. Best-effort: only fires when that region is present in the current view.
     */
    function applySelectedRegionFromUrl() {
      if (selectedFeatureId) return;
      const regionId = urlParams().get('region');
      if (!regionId) return;
      const feature = lastRankingFeatures.find((f) => f.properties?.id === regionId);
      if (feature) {
        // A link lands on the area it was made in, region highlighted — not zoomed into it.
        selectRegionById(regionId, null, false);
        if (!explicitMapPositionPending) fitMapToCurrentView(true);
      }
    }

    function bindRegionMapInteraction() {
      if (regionClickBound) return;
      regionClickBound = true;
      regionDetailClose.addEventListener('click', () => {
        clearRegionSelection();
      });
      // A single hit-test per click, not two: this used to be a layer-filtered map.on('click',
      // 'regions-fill', ...) selecting the region, PLUS a separate generic map.on('click', ...)
      // doing its own queryRenderedFeatures call to detect "clicked empty space" and clear the
      // selection. Both fire for the same click, but their two independent hit-tests could
      // disagree — the generic one would sometimes come back empty even though the layer-
      // filtered one had just found (and selected) a feature at the same point, immediately
      // clearing the selection that was just made. This is exactly the "tapping a region does
      // nothing" report — reproduced deterministically, not just theorized, in a real (non-
      // headless-stubbed) browser. Querying once and branching on the result removes the
      // possibility of the two disagreeing.
      map.on('click', (e) => {
        // The second click of a double-click belongs to the drill-down below; handled as a
        // click of its own it would deselect the region the first one just selected.
        if (e.originalEvent && e.originalEvent.detail >= 2) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: ['regions-fill'] });
        const f = hits[0];
        if (f?.properties?.id) selectRegionById(f.properties.id, f);
        else clearRegionSelection();
      });
      // Double-click goes one level deeper — the map twin of the breadcrumb — for regions that
      // have sub-areas. Anywhere else it still zooms in, which is what the map's own
      // double-click did before it was taken over here.
      map.doubleClickZoom?.disable();
      map.on('dblclick', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['regions-fill'] })[0];
        const id = f?.properties?.id;
        if (id && drillIntoRegion(id, f.properties.level)) {
          e.preventDefault();
          return;
        }
        map.easeTo({ center: e.lngLat, zoom: map.getZoom() + 1 });
      });
    }

    function updateRanking(features, minPct, maxPct) {
      const list = document.getElementById('ranking-list');
      const summary = document.getElementById('ranking-summary');
      const sorted = [...features].sort(compareByBikeShare);
      const withPct = sorted.filter(isRanked);
      const span = Math.max(maxPct - minPct, 0.001);
      lastRankingSorted = sorted;
      lastRankingMinPct = minPct;
      lastRankingMaxPct = maxPct;
      rebuildRankIndex(sorted);

      const topN = currentRankingTopN() ?? DEFAULT_RANKING_TOP_N;
      // Top & Flop and Alle show the same rows for a short list, so the switch would do nothing.
      const modeSwitch = document.getElementById('ranking-mode');
      if (modeSwitch) {
        const topFlopN =
          RankingDisplay.effectiveRankingTopN({
            mode: 'topflop',
            items: withPct.map((f) => ({ id: String(f.properties?.id ?? '') })),
            focusChainIds: rankingFocusChainIds(),
          }) ?? DEFAULT_RANKING_TOP_N;
        modeSwitch.hidden = withPct.length <= topFlopN * 2;
      }
      const modeHint =
        rankingMode === 'topflop' && withPct.length > topN * 2
          ? ' · Top & Flop je ' + topN
          : rankingMode === 'all'
            ? ' · alle ' + withPct.length
            : '';
      summary.textContent =
        '(' + sorted.length + ' Gebiete' + modeHint + ', Balken = Anteil in dieser Ansicht)';

      list.replaceChildren();
      for (const row of rankingDisplayRows(withPct)) {
        if (row.type === 'divider') {
          const gap = document.createElement('li');
          gap.className = 'ranking-divider';
          gap.textContent = '…';
          list.appendChild(gap);
          continue;
        }
        appendRankingRow(list, row.rank, row.f, minPct, maxPct, span);
      }
      const withoutPct = sorted.length - withPct.length;
      if (withoutPct > 0) {
        const note = document.createElement('li');
        note.className = 'ranking-more';
        note.textContent = withoutPct + ' ohne Rang (weniger als 5 km Straße erfasst)';
        list.appendChild(note);
      }
      syncRankingRowHighlights();
    }

    function urlParams() {
      return new URLSearchParams(location.search);
    }

    function parseMapString(str) {
      if (!str) return null;
      let clean = str.trim();
      if (clean.startsWith('#')) clean = clean.slice(1).trim();
      if (clean.startsWith('map=')) clean = clean.slice(4).trim();
      const parts = clean.split(/[/,]/).map((s) => parseFloat(s.trim()));
      if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
        const [zoom, lat, lng, rawBearing = 0, rawPitch = 0] = parts;
        const bearing = Number.isFinite(rawBearing) ? rawBearing : 0;
        const pitch = Number.isFinite(rawPitch) ? Math.max(0, Math.min(85, rawPitch)) : 0;
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && zoom >= 0 && zoom <= 24) {
          return { zoom, center: [lng, lat], bearing, pitch };
        }
      }
      return null;
    }

    function getMapPositionFromUrl() {
      if (location.hash) {
        const fromHash = parseMapString(location.hash);
        if (fromHash) return fromHash;
      }
      const params = urlParams();
      const qMap = params.get('map');
      if (qMap) {
        const fromQMap = parseMapString(qMap);
        if (fromQMap) return fromQMap;
      }
      const latStr = params.get('lat');
      const lngStr = params.get('lng') || params.get('lon');
      const zoomStr = params.get('zoom') || params.get('z');
      if (latStr && lngStr) {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const zoom = zoomStr ? parseFloat(zoomStr) : 10;
        const rawBearing = parseFloat(params.get('bearing') || '0');
        const rawPitch = parseFloat(params.get('pitch') || '0');
        const bearing = Number.isFinite(rawBearing) ? rawBearing : 0;
        const pitch = Number.isFinite(rawPitch) ? Math.max(0, Math.min(85, rawPitch)) : 0;
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Number.isFinite(zoom) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180 &&
          zoom >= 0 &&
          zoom <= 24
        ) {
          return { zoom, center: [lng, lat], bearing, pitch };
        }
      }
      return null;
    }

    function isMapAtPosition(pos) {
      if (!map || !pos) return false;
      const c = map.getCenter();
      const z = map.getZoom();
      const b = map.getBearing();
      const p = map.getPitch();
      const dLng = Math.abs(c.lng - pos.center[0]);
      const dLat = Math.abs(c.lat - pos.center[1]);
      const dZoom = Math.abs(z - pos.zoom);
      const dBearing = Math.abs(b - pos.bearing);
      const dPitch = Math.abs(p - pos.pitch);
      return dLng < 0.0001 && dLat < 0.0001 && dZoom < 0.05 && dBearing < 1 && dPitch < 1;
    }

    function currentMapHash() {
      if (!map) return '';
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      if (!center || !Number.isFinite(zoom)) return '';
      const z = Math.round(zoom * 100) / 100;
      const lat = Math.round(center.lat * 100000) / 100000;
      const lng = Math.round(center.lng * 100000) / 100000;
      const b = Math.round(bearing * 10) / 10;
      const p = Math.round(pitch * 10) / 10;
      if (Math.abs(b) > 0.5 || p > 0.5) {
        return '#map=' + z + '/' + lat + '/' + lng + '/' + b + '/' + p;
      }
      return '#map=' + z + '/' + lat + '/' + lng;
    }

    const initialMapPos = getMapPositionFromUrl();
    let explicitMapPositionPending = Boolean(initialMapPos);

    const map = new maplibregl.Map({
      container: 'map',
      style: CONFIG.basemapStyles[CONFIG.basemap],
      center: initialMapPos ? initialMapPos.center : [11.5, 48.9],
      zoom: initialMapPos ? initialMapPos.zoom : 7,
      bearing: initialMapPos ? initialMapPos.bearing : 0,
      pitch: initialMapPos ? initialMapPos.pitch : 0,
      preserveDrawingBuffer: true,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-right',
    );
    map.on('moveend', () => {
      scheduleUrlSync();
    });

    function updatePanelSummaryPreview() {
      if (!panelSummaryPreview) return;
      if (selectedFeatureId) {
        const feat = selectedFeatureOverride || regionIndex?.byId?.get(selectedFeatureId);
        const p = feat?.properties;
        if (p) {
          const name = p.name || p.id || '';
          const pct =
            typeof p.bikeSharePct === 'number' && p.roadSumKm > 0
              ? formatUiPct(p.bikeSharePct) + ' %'
              : '';
          if (name && pct) {
            panelSummaryPreview.textContent = name + ' · ' + pct;
            return;
          } else if (name) {
            panelSummaryPreview.textContent = name;
            return;
          }
        }
      }
      if (regionIndex) {
        panelSummaryPreview.textContent = viewLabelForCurrentMode();
      }
    }

    function imageFilename(suffix) {
      return downloadFilenameForView().replace(/\\.csv$/i, '') + '-' + suffix + '.png';
    }

    function triggerImageDownload(dataUrl, filename) {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    function raceTimeout(promise, ms) {
      return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
    }

    async function waitForMapRender() {
      if (!map.isStyleLoaded()) {
        await raceTimeout(new Promise((resolve) => map.once('load', resolve)), 4000);
      }
      map.triggerRepaint();
      // 'idle' can fail to fire (already idle, stalled tile) — never hang the share.
      await raceTimeout(new Promise((resolve) => map.once('idle', resolve)), 4000);
    }

    async function captureLiveMapCanvas(idleTimeoutMs) {
      map.triggerRepaint();
      await raceTimeout(new Promise((resolve) => map.once('idle', resolve)), idleTimeoutMs || 1500);
      const source = map.getCanvas();
      if (!source?.width) throw new Error('empty canvas');
      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext('2d').drawImage(source, 0, 0);
      return copy;
    }

    /**
     * Map picture for the printed sheet: the region itself, framed, in a shape that suits A4.
     * The live canvas is whatever the visitor is looking at — on a phone a tall strip with the
     * sheet over its lower half, on a computer partly under the card — so frame the region
     * explicitly, crop, and put the camera back afterwards.
     */
    async function capturePrintMapCanvas(feature) {
      const bbox = feature?.geometry ? turf.bbox(feature) : null;
      if (!bbox || !bbox.every(Number.isFinite)) return captureLiveMapCanvas();
      const saved = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        padding: { ...map.getPadding() },
      };
      try {
        map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 24, duration: 0, maxZoom: 13, bearing: 0, pitch: 0 },
        );
        const canvas = await captureLiveMapCanvas(5000);
        return cropCanvasAroundBbox(canvas, bbox);
      } finally {
        map.setPadding(saved.padding);
        map.jumpTo({
          center: saved.center,
          zoom: saved.zoom,
          bearing: saved.bearing,
          pitch: saved.pitch,
        });
      }
    }

    /**
     * Crop to the region plus a margin, landscape-leaning (1:1 to 2:1), and cap the width so
     * the PDF stays small. A tall region gets a square with map on both sides, not a sliver.
     */
    function cropCanvasAroundBbox(canvas, bbox) {
      const scale = canvas.width / (map.getContainer().clientWidth || canvas.width);
      const nw = map.project([bbox[0], bbox[3]]);
      const se = map.project([bbox[2], bbox[1]]);
      const cx = ((nw.x + se.x) / 2) * scale;
      const cy = ((nw.y + se.y) / 2) * scale;
      const w0 = Math.max(Math.abs(se.x - nw.x) * scale * 1.3, 120);
      const h0 = Math.max(Math.abs(se.y - nw.y) * scale * 1.3, 120);
      const aspect = Math.min(2, Math.max(1, w0 / h0));
      let w = Math.max(w0, h0 * aspect);
      let h = w / aspect;
      if (w > canvas.width) {
        w = canvas.width;
        h = w / aspect;
      }
      if (h > canvas.height) {
        h = canvas.height;
        w = h * aspect;
      }
      const x = Math.min(Math.max(cx - w / 2, 0), canvas.width - w);
      const y = Math.min(Math.max(cy - h / 2, 0), canvas.height - h);
      const outW = Math.min(1400, Math.round(w));
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = Math.round((outW * h) / w);
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
      return out;
    }

    function bboxForCurrentView() {
      const filtered = filteredFeaturesForCurrentView().map(enrichFeature);
      const boundsFeatures = filtered.length
        ? { type: 'FeatureCollection', features: filtered }
        : { type: 'FeatureCollection', features: scopeBoundsFeaturesForCurrentView() };
      return turf.bbox(boundsFeatures);
    }

    /**
     * @param {boolean} [respectMapPadding] The map's own persistent padding (panel, card, sheet)
     *   is added to the padding passed here, so with a card or the half-open sheet showing it
     *   would count twice. Pass true to only top up what that padding does not already cover.
     */
    function fitMapToCurrentView(respectMapPadding) {
      const bbox = bboxForCurrentView();
      if (bbox.every(Number.isFinite)) {
        // Reserve space for the bottom sheet even with nothing selected — on mobile it's
        // always on screen (at least at peek height), so without this the view's southern
        // edge can render behind it and become untappable.
        const inset = mapBottomInset();
        const have = respectMapPadding && map.getPadding ? map.getPadding() : null;
        const top = (n) => Math.max(0, n - ((have && have.top) || 0));
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: {
            top: top(48),
            right: Math.max(0, 48 - ((have && have.right) || 0)),
            bottom: Math.max(0, 48 + inset - ((have && have.bottom) || 0)),
            left: Math.max(0, 48 - ((have && have.left) || 0)),
          },
          duration: 0,
        });
      }
    }

    const MAP_EXPORT_STYLE_PROPS = [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'width',
      'height',
      'inset',
      'zIndex',
    ];

    function saveInlineStyles(el, props) {
      const saved = {};
      for (const prop of props) saved[prop] = el.style[prop];
      return saved;
    }

    function restoreInlineStyles(el, saved, props) {
      for (const prop of props) el.style[prop] = saved[prop] || '';
    }

    function rankingExportRows(sortedWithPct) {
      const items = sortedWithPct.map((f) => ({ id: String(f.properties?.id ?? '') }));
      const built = RankingDisplay.buildRankingExportRows(items, {
        mode: rankingMode,
        topN: currentRankingTopN(),
        focusChainIds: rankingFocusChainIds(),
      });
      return built.map((row) =>
        row.type === 'divider'
          ? { type: 'divider' }
          : { type: 'row', f: sortedWithPct[row.index], rank: row.rank },
      );
    }

    function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
      const words = String(text).split(/\\s+/);
      let line = '';
      let cursorY = y;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, cursorY);
          line = word;
          cursorY += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) {
        ctx.fillText(line, x, cursorY);
        cursorY += lineHeight;
      }
      return cursorY;
    }

    function truncateCanvasText(ctx, text, maxWidth) {
      let out = String(text);
      if (ctx.measureText(out).width <= maxWidth) return out;
      while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
        out = out.slice(0, -1);
      }
      return out + '…';
    }

    async function captureMapExportCanvas() {
      const mapEl = document.getElementById('map');
      const { width, height } = RankingDisplay.PORTRAIT_EXPORT;
      const savedMapStyle = saveInlineStyles(mapEl, MAP_EXPORT_STYLE_PROPS);
      const hiddenControls = [...mapEl.querySelectorAll('.maplibregl-ctrl')].map((el) => [
        el,
        el.style.visibility,
      ]);
      // The visitor's camera and the padding for the card/sheet belong to the screen, not to the
      // picture: without this the picture keeps an empty band where the sheet is, and the map
      // is left at the export's framing afterwards.
      const savedCamera = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        padding: { ...map.getPadding() },
      };
      try {
        for (const [el] of hiddenControls) el.style.visibility = 'hidden';
        mapEl.style.position = 'fixed';
        mapEl.style.left = '-20000px';
        mapEl.style.top = '0';
        mapEl.style.right = 'auto';
        mapEl.style.bottom = 'auto';
        mapEl.style.inset = 'auto';
        mapEl.style.width = width + 'px';
        mapEl.style.height = height + 'px';
        mapEl.style.zIndex = '-1';
        map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        map.resize();
        const exportBbox = bboxForCurrentView();
        if (exportBbox.every(Number.isFinite)) {
          map.fitBounds(
            [
              [exportBbox[0], exportBbox[1]],
              [exportBbox[2], exportBbox[3]],
            ],
            { padding: 48, duration: 0 },
          );
        }
        await waitForMapRender();
        const source = map.getCanvas();
        if (!source?.width) throw new Error('empty canvas');
        const copy = document.createElement('canvas');
        copy.width = source.width;
        copy.height = source.height;
        copy.getContext('2d').drawImage(source, 0, 0);
        return copy;
      } finally {
        for (const [el, visibility] of hiddenControls) el.style.visibility = visibility;
        restoreInlineStyles(mapEl, savedMapStyle, MAP_EXPORT_STYLE_PROPS);
        map.resize();
        map.setPadding(savedCamera.padding);
        map.jumpTo({
          center: savedCamera.center,
          zoom: savedCamera.zoom,
          bearing: savedCamera.bearing,
          pitch: savedCamera.pitch,
        });
        await waitForMapRender();
      }
    }

    /**
     * On a phone the system share sheet is how a picture reaches Photos, WhatsApp, Signal …;
     * a download link often does nothing useful there (iOS Safari). Elsewhere, download.
     * The share sheet needs a recent tap: if the picture took long to make, sharing is refused
     * and the download still happens.
     */
    async function saveOrShareImage(canvas, filename, savedMessage) {
      if (isLikelyMobileShareDevice() && typeof navigator.share === 'function') {
        try {
          const file = await canvasToPngFile(canvas, filename);
          if (canShareData({ files: [file] })) {
            await navigator.share({ files: [file], title: shareTitleText() });
            showCopyViewLinkFeedback('Geteilt.');
            return;
          }
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      triggerImageDownload(canvas.toDataURL('image/png'), filename);
      showCopyViewLinkFeedback(savedMessage);
    }

    async function downloadMapImage() {
      try {
        const canvas = await captureMapExportCanvas();
        await saveOrShareImage(canvas, imageFilename('karte'), 'Kartenbild gespeichert.');
      } catch {
        showCopyViewLinkFeedback('Kartenbild konnte nicht erstellt werden.', true);
      }
    }

    async function canvasToPngFile(canvas, filename) {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty blob'))), 'image/png');
      });
      return new File([blob], filename, { type: 'image/png' });
    }

    function canShareData(data) {
      if (typeof navigator.canShare !== 'function') return false;
      try {
        return navigator.canShare(data);
      } catch {
        return false;
      }
    }

    function isLikelyMobileShareDevice() {
      return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function mapPolygonHoverEnabled() {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    function drawRankingExportCanvas() {
      const { width, height, padding } = RankingDisplay.PORTRAIT_EXPORT;
      const sorted = [...lastRankingFeatures].sort(compareByBikeShare);
      const withPct = sorted.filter(isRanked);
      const topN = currentRankingTopN();
      const showsAlle = RankingDisplay.rankingShowsAsAlle(withPct.length, rankingMode, topN);
      const rows = rankingExportRows(withPct);
      const minPct = lastRankingMinPct;
      const maxPct = lastRankingMaxPct;
      const span = Math.max(maxPct - minPct, 0.001);
      const focusIds = new Set(rankingFocusChainIds());
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const innerW = width - padding * 2;
      let y = padding + 8;
      ctx.fillStyle = '#111111';
      ctx.font = '700 42px system-ui, sans-serif';
      y = wrapCanvasText(ctx, viewLabelForCurrentMode(), padding, y, innerW, 48);
      y += 8;
      ctx.fillStyle = '#666666';
      ctx.font = '400 28px system-ui, sans-serif';
      const summary = showsAlle
        ? withPct.length + ' Gebiete'
        : withPct.length +
          ' Gebiete · Top & Flop je ' +
          (topN ?? DEFAULT_RANKING_TOP_N);
      y = wrapCanvasText(ctx, summary, padding, y, innerW, 34);
      y += 24;

      const rankColW = 72;
      const pctColW = 120;
      const barX = padding + rankColW + 280;
      const barW = width - padding - pctColW - barX - 16;
      const rowH = 72;

      for (const row of rows) {
        if (row.type === 'divider') {
          y += 10;
          ctx.fillStyle = '#bbbbbb';
          ctx.font = '400 28px system-ui, sans-serif';
          ctx.fillText('…', padding + rankColW, y + 24);
          y += 36;
          continue;
        }
        const f = row.f;
        const id = String(f.properties?.id ?? '');
        const pct = f.properties.bikeSharePct;
        const name = String(f.properties?.name || id || '–');
        const highlighted = focusIds.has(id);
        if (highlighted) {
          ctx.fillStyle = '#e8f4fd';
          ctx.fillRect(padding - 8, y - 8, innerW + 16, rowH - 8);
        }
        ctx.fillStyle = '#666666';
        ctx.font = '400 26px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(row.rank + '.', padding + rankColW - 8, y + 34);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#222222';
        // Shrink a long name before cutting it off — the selected region's own name especially.
        const nameWeight = highlighted ? '600' : '400';
        let nameSize = 30;
        ctx.font = nameWeight + ' ' + nameSize + 'px system-ui, sans-serif';
        while (nameSize > 22 && ctx.measureText(name).width > 268) {
          nameSize -= 1;
          ctx.font = nameWeight + ' ' + nameSize + 'px system-ui, sans-serif';
        }
        ctx.fillText(truncateCanvasText(ctx, name, 268), padding + rankColW, y + 34);
        ctx.fillStyle = '#eceff1';
        ctx.fillRect(barX, y + 22, barW, 16);
        const barFillW = Math.max(4, ((clampPctForScale(pct, minPct, maxPct) - minPct) / span) * barW);
        ctx.fillStyle = colorForPct(pct, minPct, maxPct);
        ctx.fillRect(barX, y + 22, barFillW, 16);
        ctx.fillStyle = '#444444';
        ctx.font = '400 26px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatUiPct(pct) + ' %', width - padding, y + 34);
        ctx.textAlign = 'left';
        y += rowH;
        if (y > height - padding - rowH) break;
      }

      return canvas;
    }

    async function downloadRankingImage() {
      try {
        const canvas = drawRankingExportCanvas();
        await saveOrShareImage(canvas, imageFilename('rangliste'), 'Ranglistenbild gespeichert.');
      } catch {
        showCopyViewLinkFeedback('Ranglistenbild konnte nicht erstellt werden.', true);
      }
    }


    function notifyMapResize() {
      requestAnimationFrame(() => map.resize());
    }

    // --- Mobile bottom sheet for #panel-main: peek / half / full snap states. ---
    const SHEET_ORDER = ['peek', 'half', 'full'];
    const sheetScrim = document.getElementById('sheet-scrim');

    // Real viewport-height unit (dvh substitute the CSS formatter can't strip).
    function updateVhUnit() {
      document.documentElement.style.setProperty('--vph', window.innerHeight / 100 + 'px');
    }
    updateVhUnit();
    // On phone, the browser chrome (address bar) collapsing/expanding after the initial paint
    // fires this same 'resize' event and changes #map's actual on-screen size — but MapLibre
    // keeps hit-testing against the canvas size from construction time until told otherwise, so
    // taps in the newly-revealed strip (typically the bottom, once the chrome collapses) landed
    // nowhere. Previously this only got fixed incidentally, whenever the sheet toggle's own
    // notifyMapResize() call happened to fire for an unrelated reason.
    window.addEventListener('resize', () => {
      updateVhUnit();
      notifyMapResize();
    });
    // iOS Safari in particular often does NOT fire window 'resize' for the address-bar
    // collapsing on load/scroll — only visualViewport does. Cover both so the very first
    // settling of the chrome (which is exactly the "doesn't work until I touch the UI once"
    // report) gets picked up without needing an unrelated interaction to trigger a resize first.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        updateVhUnit();
        notifyMapResize();
      });
    }
    // Also resync shortly after load regardless of any resize event firing at all — covers the
    // case where the chrome was already mid-collapse when the map was constructed, so there was
    // never a "change" for a resize listener to observe in the first place.
    for (const delay of [300, 1200]) {
      setTimeout(notifyMapResize, delay);
    }

    function sheetEnabled() {
      return panelMobileMq.matches && !document.body.classList.contains('ui-minimal');
    }
    function sheetState() {
      return document.body.dataset.sheet || 'peek';
    }
    function setSheetState(next) {
      const state = SHEET_ORDER.includes(next) ? next : 'peek';
      document.body.dataset.sheet = state;
      if (panelMain) {
        panelMain.open = true;
        if (state === 'peek') panelMain.scrollTop = 0;
      }
      notifyMapResize();
      // The sheet occupies a different amount of the screen at every state (even peek, even
      // with nothing selected) — always re-sync the map's padding/fit to match, not just when
      // a region happens to be selected.
      syncMapViewport(true);
    }

    // Primary sections: collapsible accordions on desktop, always-open blocks on the phone
    // (the sheet scrolls — no fiddly nested folding).
    const PHONE_OPEN_SECTIONS = ['region-scope-block', 'map-legend-section', 'ranking-details'];
    for (const id of PHONE_OPEN_SECTIONS) {
      document.getElementById(id)?.addEventListener('toggle', (event) => {
        if (event.target.dataset.lockOpen && !event.target.open) event.target.open = true;
      });
    }
    function lockOpenSectionsForViewport() {
      const lock = sheetEnabled();
      for (const id of PHONE_OPEN_SECTIONS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (lock) {
          el.open = true;
          el.dataset.lockOpen = '1';
        } else {
          delete el.dataset.lockOpen;
        }
      }
    }

    // Counting definition and map appearance fold behind one "Einstellungen" section on every
    // device. It stays closed by default; opening it on the phone lifts the sheet so it is seen.
    document.getElementById('settings-drawer')?.addEventListener('toggle', (event) => {
      if (event.target.open && sheetEnabled() && sheetState() === 'peek') setSheetState('half');
      notifyMapResize();
    });

    function applyPanelViewportMode() {
      if (!panelMain) return;
      if (sheetEnabled()) {
        // Always start collapsed on mobile; never remember an "open" state across reloads/rotations.
        panelMain.open = true;
        document.body.dataset.sheet = document.body.dataset.sheet || 'peek';
      } else {
        delete document.body.dataset.sheet;
        panelMain.open = true;
      }
      lockOpenSectionsForViewport();
      placeRegionDetail();
      notifyMapResize();
    }

    if (panelMain) {
      const panelSummary = panelMain.querySelector(':scope > summary');
      let sheetDrag = null;
      let uiPinch = null;
      let suppressSummaryClick = false;

      panelSummary?.addEventListener('click', (event) => {
        if (suppressSummaryClick) {
          suppressSummaryClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (!sheetEnabled()) return; // desktop: let <details> toggle natively
        event.preventDefault();
        // Drag can reach all three snap states, but nothing else ever calls setSheetState('full')
        // — a click/tap (and, since <summary> is natively keyboard-operable, Enter/Space) only
        // ever toggled peek<->half, leaving 'full' completely unreachable without a drag gesture.
        // Cycle through all three so keyboard/assistive-tech users aren't locked out of it.
        const next =
          sheetState() === 'peek' ? 'half' : sheetState() === 'half' ? 'full' : 'peek';
        setSheetState(next);
      });

      function isSheetDragTarget(event) {
        if (!sheetEnabled() || (event.button != null && event.button > 0)) return false;
        const target = event.target;
        if (target.closest('button, a, input, select, label')) return false;
        if (target.closest('.panel > summary')) return true;
        if (sheetState() === 'peek') return true;
        if (target.closest('#region-detail-mount .region-detail-header')) return true;
        return false;
      }

      panelMain?.addEventListener('pointerdown', (event) => {
        if (!isSheetDragTarget(event)) return;
        sheetDrag = {
          startY: event.clientY,
          startH: panelMain.getBoundingClientRect().height,
          lastY: event.clientY,
          lastTime: performance.now(),
          velocityY: 0,
          moved: false,
          startState: sheetState(),
        };
        panelMain.classList.add('is-dragging');
        try { panelMain.setPointerCapture?.(event.pointerId); } catch {}
      });
      panelMain?.addEventListener('pointermove', (event) => {
        if (!sheetDrag || uiPinch) return;
        const now = performance.now();
        const dt = now - sheetDrag.lastTime;
        if (dt > 8) {
          sheetDrag.velocityY = (sheetDrag.lastY - event.clientY) / dt;
          sheetDrag.lastY = event.clientY;
          sheetDrag.lastTime = now;
        }
        const dy = sheetDrag.startY - event.clientY; // drag up => taller
        if (Math.abs(dy) > 4) sheetDrag.moved = true;
        const h = Math.min(window.innerHeight * 0.94, Math.max(52, sheetDrag.startH + dy));
        panelMain.style.height = h + 'px';
      });
      const endSheetDrag = (event) => {
        if (!sheetDrag) return;
        panelMain.classList.remove('is-dragging');
        try { panelMain.releasePointerCapture?.(event.pointerId); } catch {}
        const wasDrag = sheetDrag.moved;
        const frac = panelMain.getBoundingClientRect().height / window.innerHeight;
        const vy = sheetDrag.velocityY;
        const startState = sheetDrag.startState;
        panelMain.style.height = '';
        sheetDrag = null;
        if (!wasDrag) return; // a tap — handled by the click listener
        suppressSummaryClick = true;

        let target = 'peek';
        if (vy > 0.4) {
          target = startState === 'half' || frac > 0.65 ? 'full' : 'half';
        } else if (vy < -0.4) {
          target = startState === 'full' && frac > 0.35 ? 'half' : 'peek';
        } else {
          if (startState === 'peek') {
            target = frac > 0.72 ? 'full' : frac > 0.18 ? 'half' : 'peek';
          } else if (startState === 'half') {
            target = frac > 0.72 ? 'full' : frac < 0.35 ? 'peek' : 'half';
          } else {
            target = frac < 0.35 ? 'peek' : frac < 0.75 ? 'half' : 'full';
          }
        }
        setSheetState(target);
      };
      panelMain?.addEventListener('pointerup', endSheetDrag);
      panelMain?.addEventListener('pointercancel', endSheetDrag);

      // Keep <details> open on mobile (sheet height is driven by data-sheet, not [open]);
      // a stray native toggle (keyboard, etc.) just collapses the sheet to peek.
      panelMain.addEventListener('toggle', () => {
        if (sheetEnabled() && !panelMain.open) {
          panelMain.open = true;
          setSheetState('peek');
        } else if (!sheetEnabled()) {
          syncMapViewport(true);
        }
        notifyMapResize();
      });

      sheetScrim?.addEventListener('click', () => {
        if (document.body.dataset.regionDetail) {
          setSheetState('half');
        } else {
          setSheetState('peek');
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (typeof closeMethodologyModal === 'function' && methodologyDialog?.open) {
          closeMethodologyModal();
          return;
        }
        if (sheetEnabled()) {
          if (sheetState() === 'full') setSheetState('half');
          else if (sheetState() === 'half') setSheetState('peek');
          else if (document.body.dataset.regionDetail) clearRegionSelection();
        } else if (document.body.dataset.regionDetail) {
          clearRegionSelection();
        }
      });

      panelMobileMq.addEventListener('change', applyPanelViewportMode);
      applyPanelViewportMode();

      panelMain.addEventListener('dblclick', (event) => {
        event.preventDefault();
      });

      // Prevent mobile browsers from zooming the page / UI overlays on pinch,
      // and redirect any pinch touching the sheet / context menu into zooming the map.
      for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
        window.addEventListener(
          eventName,
          (event) => {
            event.preventDefault();
          },
          { passive: false },
        );
      }

      let pinchEndTime = 0;

      function isTouchOnMapCanvas(touch) {
        try {
          return touch.target === map.getCanvas();
        } catch {
          return false;
        }
      }

      function getPinchMetrics(event) {
        if (!event.touches || event.touches.length < 2) return null;
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        return { dist, midX, midY };
      }

      function startUiPinch(event) {
        const metrics = getPinchMetrics(event);
        if (!metrics || metrics.dist < 5) return;

        if (sheetDrag) {
          panelMain?.classList.remove('is-dragging');
          if (sheetDrag.pointerId != null) {
            try {
              panelSummary?.releasePointerCapture?.(sheetDrag.pointerId);
            } catch {}
          }
          if (panelMain) panelMain.style.height = '';
          sheetDrag = null;
        }

        let anchorLocation = null;
        try {
          anchorLocation = map.unproject([metrics.midX, metrics.midY]);
        } catch {
          anchorLocation = map.getCenter();
        }

        uiPinch = {
          startDist: metrics.dist,
          startZoom: map.getZoom(),
          anchorLocation,
        };
      }

      function applyUiPinch(event) {
        const metrics = getPinchMetrics(event);
        if (!metrics || metrics.dist < 5) return;

        if (!uiPinch) {
          startUiPinch(event);
          return;
        }
        if (uiPinch.startDist < 5) return;

        const scale = metrics.dist / uiPinch.startDist;
        const deltaZoom = Math.log2(scale);
        const minZoom = typeof map.getMinZoom === 'function' ? map.getMinZoom() : 0;
        const maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 22;
        const targetZoom = Math.max(minZoom, Math.min(maxZoom, uiPinch.startZoom + deltaZoom));

        if (typeof map.calculateAnchoredCameraOptions === 'function' && uiPinch.anchorLocation) {
          try {
            const camOpts = map.calculateAnchoredCameraOptions({
              anchorLocation: uiPinch.anchorLocation,
              anchorScreenPoint: [metrics.midX, metrics.midY],
              zoom: targetZoom,
            });
            map.jumpTo(camOpts);
          } catch {
            map.setZoom(targetZoom);
          }
        } else {
          map.setZoom(targetZoom);
        }
      }

      window.addEventListener(
        'touchstart',
        (event) => {
          if (event.touches.length >= 2) {
            const allOnCanvas = Array.from(event.touches).every(isTouchOnMapCanvas);
            if (allOnCanvas) {
              uiPinch = null;
              return;
            }
            event.preventDefault();
            startUiPinch(event);
          }
        },
        { capture: true, passive: false },
      );

      window.addEventListener(
        'touchmove',
        (event) => {
          if (event.touches.length >= 2) {
            const allOnCanvas = Array.from(event.touches).every(isTouchOnMapCanvas);
            if (allOnCanvas && !uiPinch) {
              return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            applyUiPinch(event);
          } else if (Date.now() - pinchEndTime < 100) {
            event.preventDefault();
          }
        },
        { capture: true, passive: false },
      );

      const endUiPinch = (event) => {
        if (event.touches.length < 2 && uiPinch) {
          uiPinch = null;
          pinchEndTime = Date.now();
          suppressSummaryClick = true;
          setTimeout(() => {
            suppressSummaryClick = false;
          }, 300);
        }
      };

      window.addEventListener('touchend', endUiPinch, { capture: true });
      window.addEventListener('touchcancel', endUiPinch, { capture: true });
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
      openChangedCountingGroups();
      return true;
    }

    function appendViewerOptionsToUrl(params) {
      const filter = readLengthClassFilterFromUi();
      lengthClassFilter = filter;
      if (isUiMinimal()) params.set('minimal', '1');
      else params.delete('minimal');
      if (basemapSelect.value !== CONFIG.basemap) params.set('basemap', basemapSelect.value);
      else params.delete('basemap');
      if (!toggleBikelanes.checked) params.set('radwege', '0');
      else params.delete('radwege');
      if (toggleRoads.checked) params.set('strassen', '1');
      else params.delete('strassen');
      if (!rankingDetails.open) params.set('ranking', '0');
      else params.delete('ranking');
      if (rankingMode !== 'topflop') params.set('rankingMode', rankingMode);
      else params.delete('rankingMode');
      if (currentMapMetric !== 'bikeShare') {
        params.set('metrik', currentMapMetric);
      } else {
        params.delete('metrik');
      }
      if (colorScaleSelect.value !== CONFIG.defaultColorScale) {
        params.set('colors', colorScaleSelect.value);
      } else {
        params.delete('colors');
      }
      const { enabled, capPct, robustEnabled } = getScaleCapSettings();
      const defaultCapEnabled = defaultScaleCapEnabledForView();
      const defaultRobust = defaultRobustScaleEnabledForView();
      if (capPct !== CONFIG.defaultColorCapPct) params.set('cap', String(capPct));
      else params.delete('cap');
      if (enabled !== defaultCapEnabled) {
        params.set('capEnabled', enabled ? '1' : '0');
      } else {
        params.delete('capEnabled');
      }
      if (robustEnabled !== defaultRobust) {
        params.set('robustScale', robustEnabled ? '1' : '0');
      } else {
        params.delete('robustScale');
      }
      const scaleBike = bikelaneColorForScale(colorScaleSelect.value).toLowerCase();
      const bikeHex = overlayBikelaneColorInput.value.toLowerCase();
      if (bikeHex !== scaleBike) params.set('radfarbe', hexColorWithoutHash(bikeHex));
      else params.delete('radfarbe');
      const roadHex = overlayRoadColorInput.value.toLowerCase();
      if (roadHex !== CONFIG.defaultOverlayColors.road.toLowerCase()) {
        params.set('strassenfarbe', hexColorWithoutHash(roadHex));
      } else {
        params.delete('strassenfarbe');
      }
      const { bikelane: bikeMinZ, roadMajor, roadFull } = overlayMinZoomFromInputs();
      if (bikeMinZ !== CONFIG.defaultOverlayMinZoom.bikelane) {
        params.set('radwegeMinZoom', String(bikeMinZ));
      } else {
        params.delete('radwegeMinZoom');
      }
      if (roadMajor !== CONFIG.defaultOverlayMinZoom.roadMajor) {
        params.set('strassenMinZoomMajor', String(roadMajor));
      } else {
        params.delete('strassenMinZoomMajor');
      }
      if (roadFull !== CONFIG.defaultOverlayMinZoom.roadFull) {
        params.set('strassenMinZoomFull', String(roadFull));
      } else {
        params.delete('strassenMinZoomFull');
      }
      if (!lengthClassFiltersEqual(filter, CONFIG.radinfraDefaultFilter)) {
        const roads = enabledClassIds(filter, 'road');
        const bikes = enabledClassIds(filter, 'bikelane');
        if (roads.length) params.set('roadClasses', roads.join(','));
        else params.delete('roadClasses');
        if (bikes.length) params.set('bikelaneClasses', bikes.join(','));
        else params.delete('bikelaneClasses');
      } else {
        params.delete('roadClasses');
        params.delete('bikelaneClasses');
      }
    }

    // Region preview pages (r/<slug>.html) carry that region's own link-preview text and image
    // and redirect into the viewer; the plain viewer URL has the same generic preview for every
    // region. Whether a page exists is probed once per selected region, ahead of time: the
    // system share sheet has to be opened inside the tap, so nothing can be awaited then.
    const sharePreviewPages = new Map(); // region id → preview page URL, or null while unknown/absent
    function probeSharePreviewPage(id) {
      if (!id || sharePreviewPages.has(id)) return;
      sharePreviewPages.set(id, null);
      const url = new URL('r/' + id.split('/').join('-') + '.html', location.href).href;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      fetch(url, { method: 'HEAD', signal: controller.signal })
        .then((res) => {
          if (res.ok) sharePreviewPages.set(id, url);
        })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    }
    /** What to hand to other people: the region's preview page when it has one, else the view. */
    function shareableLink() {
      return (selectedFeatureId && sharePreviewPages.get(selectedFeatureId)) || buildShareUrl();
    }

    function buildShareUrl() {
      const params = new URLSearchParams();
      appendViewScopeToUrl(params);
      appendViewerOptionsToUrl(params);
      if (selectedFeatureId) params.set('region', selectedFeatureId);
      const qs = params.toString();
      return location.origin + location.pathname + (qs ? '?' + qs : '') + currentMapHash();
    }

    /**
     * Read live from the address bar rather than rebuilt from UI state, so they have to be
     * carried over by hand on every rewrite: the minimal-chrome switches. Share links
     * deliberately drop them (buildShareUrl starts from empty).
     */
    const PRESERVED_URL_PARAMS = ['chrome', 'embed'];

    function currentStateUrl() {
      const params = new URLSearchParams();
      const live = urlParams();
      for (const key of PRESERVED_URL_PARAMS) {
        const value = live.get(key);
        if (value != null) params.set(key, value);
      }
      appendViewScopeToUrl(params);
      appendViewerOptionsToUrl(params);
      if (selectedFeatureId) params.set('region', selectedFeatureId);
      const qs = params.toString();
      return location.pathname + (qs ? '?' + qs : '') + currentMapHash();
    }

    // The address bar mirrors the view, the selected region and the display options, so reload,
    // bookmarking and the browser's Back button all work on state that used to live only in
    // memory. Selections and view changes push a history entry (Back undoes that one step);
    // option tweaks only replace it, so the history doesn't fill up with colour changes.
    let urlSyncEnabled = false;
    let applyingUrlState = false;
    let urlSyncTimer = null;
    let urlSyncPushPending = false;
    // The state the page loaded with. Until something actually changes, the address bar is left
    // exactly as the visitor typed or received it, rather than being rewritten on arrival with
    // the parameters that only spell out the defaults.
    let urlSyncBaseline = null;

    function cancelPendingUrlSync() {
      if (urlSyncTimer == null) return;
      clearTimeout(urlSyncTimer);
      urlSyncTimer = null;
      urlSyncPushPending = false;
    }

    function scheduleUrlSync(mode) {
      if (!urlSyncEnabled || applyingUrlState) return;
      if (mode === 'push') urlSyncPushPending = true;
      if (urlSyncTimer != null) return;
      urlSyncTimer = setTimeout(() => {
        urlSyncTimer = null;
        const push = urlSyncPushPending;
        urlSyncPushPending = false;
        if (!urlSyncEnabled || applyingUrlState || !regionIndex) return;
        const next = currentStateUrl();
        if (next === location.pathname + location.search + location.hash) return;
        if (urlSyncBaseline !== null && next === urlSyncBaseline) return;
        urlSyncBaseline = null;
        if (push) history.pushState(null, '', next);
        else history.replaceState(null, '', next);
      }, 0);
    }

    /**
     * Re-render everything from the address bar without reloading. Drives both the browser's
     * Back/Forward buttons.
     */
    async function applyStateFromUrl() {
      if (!regionIndex) return;
      cancelPendingUrlSync();
      applyingUrlState = true;
      try {
        applyUiModeClass();
        applyUrlOptions({ live: true });
        const mapPos = getMapPositionFromUrl();
        await applyCurrentView();
        const wantedRegion = urlParams().get('region') || null;
        if (wantedRegion !== (selectedFeatureId || null)) {
          if (selectedFeatureId) clearRegionSelection();
          if (wantedRegion && lastRankingFeatures.some((f) => f.properties?.id === wantedRegion)) {
            selectRegionById(wantedRegion, null, false);
          }
        }
        if (mapPos && !isMapAtPosition(mapPos)) {
          map.easeTo({
            center: mapPos.center,
            zoom: mapPos.zoom,
            bearing: mapPos.bearing,
            pitch: mapPos.pitch,
            duration: prefersReducedMotion() ? 0 : 350,
          });
        }
      } finally {
        applyingUrlState = false;
      }
    }

    window.addEventListener('popstate', () => {
      void applyStateFromUrl();
    });

    window.addEventListener('hashchange', () => {
      if (applyingUrlState || !map) return;
      const mapPos = getMapPositionFromUrl();
      if (mapPos && !isMapAtPosition(mapPos)) {
        map.easeTo({
          center: mapPos.center,
          zoom: mapPos.zoom,
          bearing: mapPos.bearing,
          pitch: mapPos.pitch,
          duration: prefersReducedMotion() ? 0 : 350,
        });
      }
    });

    let copyViewLinkFeedbackTimer = null;

    function showCopyViewLinkFeedback(message, isError) {
      if (copyViewLinkFeedback) {
        copyViewLinkFeedback.textContent = message;
        copyViewLinkFeedback.hidden = false;
        copyViewLinkFeedback.classList.toggle('is-error', !!isError);
      }
      if (exportDialogFeedback) {
        exportDialogFeedback.textContent = message;
        exportDialogFeedback.hidden = false;
        exportDialogFeedback.classList.toggle('is-error', !!isError);
      }
      if (copyViewLinkFeedbackTimer) clearTimeout(copyViewLinkFeedbackTimer);
      copyViewLinkFeedbackTimer = setTimeout(() => {
        if (copyViewLinkFeedback) {
          copyViewLinkFeedback.hidden = true;
          copyViewLinkFeedback.classList.remove('is-error');
        }
        if (exportDialogFeedback) {
          exportDialogFeedback.hidden = true;
          exportDialogFeedback.classList.remove('is-error');
        }
      }, 2500);
    }

    function copyTextFallback(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '0';
      ta.style.top = '0';
      ta.style.opacity = '0';
      ta.style.fontSize = '16px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }

    function currentSelectedFeature() {
      if (!selectedFeatureId) return null;
      return lastRankingFeatures.find((f) => f.properties?.id === selectedFeatureId) || null;
    }

    function shareMessageText() {
      const sel = currentSelectedFeature();
      if (sel) {
        const p = sel.properties || {};
        const name = p.name || p.id || 'Dieses Gebiet';
        if (p.roadSumKm > 0 && typeof p.bikeSharePct === 'number') {
          const rankInfo = rankByFeatureId.get(p.id);
          const g = regionGapSummary(p);
          const behind = !!(g && g.behind);
          let msg =
            name +
            ': ' +
            (behind ? 'nur ' : '') +
            formatUiPct(p.bikeSharePct) +
            ' % der Straßen mit Radinfrastruktur';
          if (rankInfo) {
            msg += ' – Platz ' + rankInfo.rank + ' von ' + rankInfo.total + ' ' + viewComparisonLabel();
          }
          msg += '.';
          if (behind) {
            msg +=
              ' Bis ins Mittelfeld fehlen rund ' +
              TildaStats.formatStatKm(g.medianGapKm, TildaStats.STAT_KM_BIKE_UI_DECIMALS) +
              ' km.';
          }
          const model = demographicPeerSummary(p)?.roleModel;
          if (model) {
            msg +=
              ' ' +
              model.name +
              ' (' +
              Math.max(1, Math.round(model.km)) +
              ' km entfernt, ähnlich groß) schafft ' +
              formatUiPct(model.pct) +
              ' %.';
          }
          return msg;
        }
        return 'So steht „' + name + '“ beim Radwegausbau da:';
      }
      const label = regionIndex ? viewLabelForCurrentMode() : 'diesem Gebiet';
      return 'Radinfra-Vergleich – „' + label + '“: Wie viel Prozent der Straßen haben Radwege?';
    }

    function shareTitleText() {
      const sel = currentSelectedFeature();
      const name = sel?.properties?.name;
      return name ? name + ' – Radinfra-Vergleich' : 'Radinfra-Vergleich';
    }

    function sharePayload() {
      const url = buildShareUrl();
      return { url, title: shareTitleText(), text: shareMessageText() };
    }

    async function copyShareLink() {
      const url = shareableLink();
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
      if (map.getLayer('bikelanes-highlight-lines')) {
        map.setPaintProperty('bikelanes-highlight-lines', 'line-opacity', bikeOpacity);
        map.setPaintProperty('bikelanes-highlight-casing', 'line-opacity', bikeOpacity);
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
      bikelaneSwatch.style.borderColor = overlayBikelaneColorInput.value;
      roadSwatch.style.borderColor = overlayRoadColorInput.value;
      if (map.getLayer('bikelanes-lines')) {
        map.setPaintProperty('bikelanes-lines', 'line-color', bikeColor);
      }
      if (overlayLineHighlight) updateOverlayLineHighlightLayers();
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

    /**
     * opts.live = re-applying an already running page to a new URL (Back/Forward, the view
     * switch) rather than setting the page up once. A missing param then means "back to the
     * default", not "keep whatever is currently set" — otherwise going back to a plain URL
     * would keep the basemap or colour scale of the state being left behind.
     */
    function applyUrlOptions(opts) {
      const live = !!(opts && opts.live);
      const params = urlParams();
      if (regionIndex) {
        const scope = resolveViewScopeFromUrl();
        applyViewScopeToUi(scope);
      }

      const basemapParam = params.get('basemap');
      const basemap =
        basemapParam && CONFIG.basemapStyles[basemapParam]
          ? basemapParam
          : live
            ? CONFIG.basemap
            : null;
      if (live) {
        // setBasemap() swaps the style and re-adds the overlays once it has loaded; the raw
        // setStyle() below only gets away without that because at init nothing has been
        // added to the map yet.
        if (basemap && basemapSelect.value !== basemap) {
          basemapSelect.value = basemap;
          setBasemap(basemap);
        }
      } else if (basemap) {
        basemapSelect.value = basemap;
        overlaysBound = false;
        map.setStyle(CONFIG.basemapStyles[basemap]);
      }

      const radwege = params.get('radwege');
      if (radwege != null && radwege !== '') {
        toggleBikelanes.checked = parseBoolParam(radwege, true);
      } else if (live) {
        toggleBikelanes.checked = true;
      }
      const strassen = params.get('strassen');
      if (strassen != null && strassen !== '') {
        toggleRoads.checked = parseBoolParam(strassen, false);
      } else if (live) {
        toggleRoads.checked = false;
      }

      const ranking = params.get('ranking');
      if (ranking != null && ranking !== '') {
        rankingDetails.open = parseBoolParam(ranking, true);
      } else {
        rankingDetails.open = true;
      }
      const rankingModeParam = params.get('rankingMode');
      if (rankingModeParam === 'all' || rankingModeParam === 'topflop') {
        rankingMode = rankingModeParam;
        syncRankingModeButtons();
      } else if (live && rankingMode !== 'topflop') {
        rankingMode = 'topflop';
        syncRankingModeButtons();
      }
      const metrik = params.get('metrik');
      if (metrik && ['bikeShare', 'modelGap', 'cars', 'rent', 'accidents', 'commuters'].includes(metrik)) {
        currentMapMetric = metrik;
        if (mapMetricSelect) mapMetricSelect.value = metrik;
      } else if (live && currentMapMetric !== 'bikeShare') {
        currentMapMetric = 'bikeShare';
        if (mapMetricSelect) mapMetricSelect.value = 'bikeShare';
      }

      const colors = params.get('colors');
      let scaleFromUrl = null;
      if (colors && CONFIG.colorScales.some((s) => s.id === colors)) {
        colorScaleSelect.value = colors;
        scaleFromUrl = colors;
      } else if (live && colorScaleSelect.value !== CONFIG.defaultColorScale) {
        colorScaleSelect.value = CONFIG.defaultColorScale;
        scaleFromUrl = CONFIG.defaultColorScale;
      }

      const cap = params.get('cap');
      if (cap != null && cap !== '') {
        const capNum = Number(cap);
        if (Number.isFinite(capNum)) scaleCapPctInput.value = String(capNum);
      } else if (live) {
        scaleCapPctInput.value = String(CONFIG.defaultColorCapPct);
      }
      const capEnabled = params.get('capEnabled');
      if (capEnabled != null && capEnabled !== '') {
        scaleCapEnabledCb.checked = parseBoolParam(
          capEnabled,
          defaultScaleCapEnabledForView(),
        );
        lastScaleCapViewAllowed = viewShowsGemeindenLevelForCurrentView();
      } else {
        updateScaleCapDefaultForView();
      }
      const robustScale = params.get('robustScale');
      if (robustScale != null && robustScale !== '') {
        scaleRobustEnabledCb.checked = parseBoolParam(
          robustScale,
          defaultRobustScaleEnabledForView(),
        );
      } else if (live) {
        scaleRobustEnabledCb.checked = defaultRobustScaleEnabledForView();
      }
      syncScaleCapInputState();

      if (!applyLengthClassFilterFromUrl(params) && live) {
        lengthClassFilter = structuredClone(CONFIG.radinfraDefaultFilter);
        applyLengthClassFilterToUi(lengthClassFilter);
      }
      syncCountingUi();

      const radfarbe =
        params.get('radfarbe') ?? params.get('radwegeFarbe') ?? params.get('bikelaneColor');
      const radParsed = parseHexColorParam(radfarbe);
      if (radParsed) overlayBikelaneColorInput.value = radParsed;
      else if (scaleFromUrl || live) {
        syncOverlayColorInputsFromScale(scaleFromUrl || colorScaleSelect.value);
      }

      const strassenfarbe =
        params.get('strassenfarbe') ?? params.get('strassenFarbe') ?? params.get('roadColor');
      const roadParsed = parseHexColorParam(strassenfarbe);
      if (roadParsed) overlayRoadColorInput.value = roadParsed;
      else if (live) overlayRoadColorInput.value = CONFIG.defaultOverlayColors.road;

      const radwegeMinZoom =
        params.get('radwegeMinZoom') ?? params.get('bikelaneMinZoom') ?? params.get('radwegeMinzoom');
      if (radwegeMinZoom != null && radwegeMinZoom !== '') {
        overlayBikelaneMinzoomInput.value = String(
          clampOverlayMinZoom(radwegeMinZoom, CONFIG.defaultOverlayMinZoom.bikelane),
        );
      } else if (live) {
        overlayBikelaneMinzoomInput.value = String(CONFIG.defaultOverlayMinZoom.bikelane);
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
      } else if (live) {
        overlayRoadMinzoomMajorInput.value = String(CONFIG.defaultOverlayMinZoom.roadMajor);
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
      } else if (live) {
        overlayRoadMinzoomFullInput.value = String(CONFIG.defaultOverlayMinZoom.roadFull);
      }

      updateBasemapHint();
      updateLegendBar(colorScaleSelect.value);
      updateColorScaleHint();
      applyOverlayLineColors();
      applyOverlayMinZoom();
      if (live) updateOverlayVisibility();
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
      let roadMajorFilter = TildaStats.maplibrePropertyInFilter(
        'road',
        TildaStats.enabledMajorRoadHighwayTags(lengthClassFilter),
      );
      let roadResidentialFilter = TildaStats.maplibrePropertyInFilter(
        'road',
        TildaStats.enabledResidentialRoadHighwayTags(lengthClassFilter),
      );
      let bikeFilter = TildaStats.maplibrePropertyInFilter(
        'category',
        TildaStats.enabledBikelaneCategoryTags(lengthClassFilter),
      );
      if (map.getLayer('roads-lines-major')) map.setFilter('roads-lines-major', roadMajorFilter);
      if (map.getLayer('roads-lines-residential')) {
        map.setFilter('roads-lines-residential', roadResidentialFilter);
      }
      if (map.getLayer('bikelanes-lines')) map.setFilter('bikelanes-lines', bikeFilter);
      if (map.getLayer('bikelanes-casing')) map.setFilter('bikelanes-casing', bikeFilter);
      updateOverlayLineHighlightLayers();
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
      ensureBikelaneHighlightLayers();
    }

    function colorScaleById(id) {
      return CONFIG.colorScales.find((s) => s.id === id) || CONFIG.colorScales[0];
    }

    function fillColorExpression(minVal, maxVal, scaleId, metric) {
      metric = metric || currentMapMetric || 'bikeShare';
      const scale = colorScaleById(scaleId);
      const isColorblind = scaleId === 'colorblind';

      if (metric === 'modelGap') {
        const lowColor = isColorblind ? '#e69f00' : '#c62828';
        const midColor = '#f5f5f5';
        const highColor = isColorblind ? '#3274a1' : '#2e7d32';
        const clamped = ['max', minVal, ['min', maxVal, ['coalesce', ['get', 'modelGapPct'], 0]]];
        return [
          'case',
          ['==', ['get', 'modelGapPct'], null],
          '#cfd8dc',
          [
            'interpolate',
            ['linear'],
            clamped,
            minVal,
            lowColor,
            0,
            midColor,
            maxVal,
            highColor,
          ],
        ];
      }

      if (metric === 'cars') {
        const lowColor = isColorblind ? '#3274a1' : '#2e7d32';
        const midColor = isColorblind ? '#f0e442' : '#fff59d';
        const highColor = isColorblind ? '#e69f00' : '#c62828';
        const midVal = (minVal + maxVal) / 2;
        const clamped = ['max', minVal, ['min', maxVal, ['coalesce', ['get', 'carsPer1000'], 0]]];
        return [
          'case',
          ['==', ['get', 'carsPer1000'], null],
          '#cfd8dc',
          [
            'interpolate',
            ['linear'],
            clamped,
            minVal,
            lowColor,
            midVal,
            midColor,
            maxVal,
            highColor,
          ],
        ];
      }

      if (metric === 'rent') {
        const lowColor = isColorblind ? '#e69f00' : '#e8f5e9';
        const midColor = isColorblind ? '#f0e442' : '#ffb74d';
        const highColor = isColorblind ? '#3274a1' : '#c62828';
        const midVal = (minVal + maxVal) / 2;
        const clamped = ['max', minVal, ['min', maxVal, ['coalesce', ['get', 'rentColdM2'], 0]]];
        return [
          'case',
          ['==', ['get', 'rentColdM2'], null],
          '#cfd8dc',
          [
            'interpolate',
            ['linear'],
            clamped,
            minVal,
            lowColor,
            midVal,
            midColor,
            maxVal,
            highColor,
          ],
        ];
      }

      if (metric === 'accidents') {
        const lowColor = isColorblind ? '#3274a1' : '#2e7d32';
        const midColor = isColorblind ? '#f0e442' : '#fff59d';
        const highColor = isColorblind ? '#e69f00' : '#c62828';
        const midVal = (minVal + maxVal) / 2;
        const clamped = ['max', minVal, ['min', maxVal, ['coalesce', ['get', 'bikeAccidentsPer10k'], 0]]];
        return [
          'case',
          ['==', ['get', 'bikeAccidentsPer10k'], null],
          '#cfd8dc',
          [
            'interpolate',
            ['linear'],
            clamped,
            minVal,
            lowColor,
            midVal,
            midColor,
            maxVal,
            highColor,
          ],
        ];
      }

      if (metric === 'commuters') {
        const lowColor = isColorblind ? '#e69f00' : '#c62828';
        const midColor = '#f5f5f5';
        const highColor = isColorblind ? '#3274a1' : '#2e7d32';
        const clamped = ['max', minVal, ['min', maxVal, ['coalesce', ['get', 'netCommuters'], 0]]];
        return [
          'case',
          ['==', ['get', 'netCommuters'], null],
          '#cfd8dc',
          [
            'interpolate',
            ['linear'],
            clamped,
            minVal,
            lowColor,
            0,
            midColor,
            maxVal,
            highColor,
          ],
        ];
      }

      if (maxVal <= minVal) return scale.mid;
      const mid = (minVal + maxVal) / 2;
      const pct = ['coalesce', ['get', 'bikeSharePct'], 0];
      const clamped = ['max', minVal, ['min', maxVal, pct]];
      return [
        'interpolate',
        ['linear'],
        clamped,
        minVal,
        scale.low,
        mid,
        scale.mid,
        maxVal,
        scale.high,
      ];
    }

    function updateLegendBar(scaleId, metric) {
      metric = metric || currentMapMetric || 'bikeShare';
      const scale = colorScaleById(scaleId);
      const isColorblind = scaleId === 'colorblind';
      let gradient = scale.legendGradient;
      if (metric === 'modelGap') {
        gradient = isColorblind
          ? 'linear-gradient(to right, #e69f00, #f5f5f5, #3274a1)'
          : 'linear-gradient(to right, #c62828, #f5f5f5, #2e7d32)';
      } else if (metric === 'cars') {
        gradient = isColorblind
          ? 'linear-gradient(to right, #3274a1, #f0e442, #e69f00)'
          : 'linear-gradient(to right, #2e7d32, #fff59d, #c62828)';
      } else if (metric === 'rent') {
        gradient = isColorblind
          ? 'linear-gradient(to right, #e69f00, #f0e442, #3274a1)'
          : 'linear-gradient(to right, #e8f5e9, #ffb74d, #c62828)';
      } else if (metric === 'accidents') {
        gradient = isColorblind
          ? 'linear-gradient(to right, #3274a1, #f0e442, #e69f00)'
          : 'linear-gradient(to right, #2e7d32, #fff59d, #c62828)';
      } else if (metric === 'commuters') {
        gradient = isColorblind
          ? 'linear-gradient(to right, #e69f00, #f5f5f5, #3274a1)'
          : 'linear-gradient(to right, #c62828, #f5f5f5, #2e7d32)';
      }
      legendBar.style.background = gradient;
      const cmlBar = document.getElementById('cml-bar');
      if (cmlBar) cmlBar.style.background = scale.legendGradient;
      if (cmlBar && gradient !== scale.legendGradient) cmlBar.style.background = gradient;
    }

    function updateColorScaleHint() {
      if (!colorScaleHint) return;
      if (colorScaleSelect.value === 'colorblind') {
        colorScaleHint.textContent =
          'Niedrig → hoch als Orange, Gelb und Blau (ohne Rot–Grün-Verlauf).';
      } else {
        colorScaleHint.textContent = '';
      }
    }

    function updateRegionColors(minVal, maxVal) {
      if (!map.getLayer('regions-fill')) return;
      map.setPaintProperty(
        'regions-fill',
        'fill-color',
        fillColorExpression(minVal, maxVal, colorScaleSelect.value, currentMapMetric),
      );
    }

    function addRegionLayers(geojson, minPct, maxPct, labelMinZoom) {
      // Creating the source/layers below throws ("Style is not done loading") if the basemap
      // hasn't finished loading yet — plausible on a slow mobile connection right at page load.
      // applyCurrentView()'s 2.5s fallback can call us before that's guaranteed, and an uncaught
      // throw here skips bindRegionMapInteraction() right after it — permanently, since nothing
      // retries it — leaving the map with no click handler until an unrelated view change calls
      // us again once the style has since loaded. Defer instead of crashing.
      if (
        !map.getSource('regions') &&
        typeof map.isStyleLoaded === 'function' &&
        !map.isStyleLoaded()
      ) {
        map.once('idle', () => addRegionLayers(geojson, minPct, maxPct, labelMinZoom));
        return;
      }
      lastPctRange = { min: minPct, max: maxPct, scaleCapped: false, dataMax: maxPct };
      updateLegendBar(colorScaleSelect.value);
      applyOverlayLineColors();
      if (map.getSource('regions')) {
        map.getSource('regions').setData(geojson);
        updateRegionColors(minPct, maxPct);
        applyOverlayMinZoom();
        map.triggerRepaint();
        updateMapHighlights();
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
        if (mapPolygonHoverEnabled()) {
          map.on('mousemove', 'regions-fill', (e) => {
            const f = e.features?.[0];
            if (!f) return;
            map.getCanvas().style.cursor = 'pointer';
            tooltip.style.display = 'block';
            tooltip.textContent = f.properties.label;
            tooltip.style.left = e.point.x + 12 + 'px';
            tooltip.style.top = e.point.y + 12 + 'px';
            if (f.properties?.id) setHoveredRegionId(f.properties.id);
          });
          map.on('mouseleave', 'regions-fill', () => {
            map.getCanvas().style.cursor = '';
            tooltip.style.display = 'none';
            setHoveredRegionId(null);
          });
        } else {
          map.on('mouseenter', 'regions-fill', () => {
            map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', 'regions-fill', () => {
            map.getCanvas().style.cursor = '';
          });
        }
        bindRegionMapInteraction();
        updateMapHighlights();
        map.triggerRepaint();
      }
      updateOverlayVisibility();
    }

    /**
     * Re-render after the visitor chose a different area or level (breadcrumb, Zeige, Gebiet,
     * search, drill-down, neighbour view). Unlike a passive re-render (neighbour index arrived,
     * basemap swap), this re-frames the map on everything now shown — a selection that survives
     * the change must not keep the camera parked on the old, finer region.
     */
    function applyScopeChange() {
      refitScopeOnNextApply = true;
      return applyCurrentView();
    }

    async function applyCurrentView() {
      const refitScope = refitScopeOnNextApply;
      refitScopeOnNextApply = false;
      syncViewScopeFromUi();
      // The neighbour index (~1.3 MB) is only fetched once a view could use it: a neighbour
      // view, or a single Landkreis in the scope, whose Zeige select can then offer "Nachbarn".
      if (isNeighborView() || neighborOptionsFocus()) ensureNeighborsLoaded();
      // Nothing prefetches stats-extra.msgpack in the background any more (see
      // lazyDarstellungPresence above) — this is the only place it gets fetched, on demand,
      // the first time a visitor actually picks a Gemeindeverbände/Stadtbezirke Darstellung.
      if (
        DARSTELLUNGEN_NEEDING_EXTRA_LEVELS.has(currentViewScope.darstellung) &&
        !extraLevelsLoaded
      ) {
        setLoadStatus('Lade zusätzliche Gebiete …');
        try {
          clearLoadError();
          await ensureExtraLevelsLoaded();
        } catch (err) {
          showLoadError(
            err,
            'Die zusätzlichen Gebiete (Gemeindeverbände, Stadtbezirke) konnten nicht geladen ' +
              'werden. Die übrigen Ansichten funktionieren weiterhin.',
          );
        }
        setLoadStatus('');
      }
      if (currentMapMetric !== 'bikeShare') {
        if (!regionExtraIndexesPromise) {
          await ensureRegionExtraIndexes();
        } else {
          await regionExtraIndexesPromise;
        }
      }
      const viewFeatures = filteredFeaturesForCurrentView();
      try {
        await ensureGemeindeGeometry(viewFeatures);
      } catch (err) {
        showLoadError(err, 'Die Gemeindegrenzen konnten nicht geladen werden.');
        return;
      }
      // Enrich only now: an enriched copy takes the geometry it finds.
      const filtered = viewFeatures.map(enrichFeature);
      const bikeRange = colorScaleRange(filtered);
      lastBikeShareRange = bikeRange;
      const activeRange = colorScaleRangeForMetric(currentMapMetric, filtered);
      const { min, max } = activeRange;
      updateLegendRange(min, max, currentMapMetric);
      lastRankingFeatures = filtered;
      updateRankingVisibility();
      updateScaleCapHint();
      updateRanking(filtered, bikeRange.min, bikeRange.max);
      updateViewMetaText(filtered, activeRange);
      updatePanelSummaryPreview();
      const exitNeighborBtn = document.getElementById('exit-neighbor-view');
      if (exitNeighborBtn) {
        exitNeighborBtn.hidden = !isNeighborView();
      }
      scheduleUrlSync();
      refreshSelectedRegionIfNeeded();
      const geojson = { type: 'FeatureCollection', features: filtered };
      const labelMinZoom = labelMinZoomForView();

      const run = () => {
        addRegionLayers(geojson, min, max, labelMinZoom);
        // A region can be selected while this reruns for an unrelated reason (the neighbour view
        // re-applies the view once its neighbor index finishes loading, a basemap swap
        // re-adds the layers, …). Re-fit to that region instead of the whole scope, or the
        // refit silently undoes the focus that was just put on it.
        if (explicitMapPositionPending) {
          // Explicit map coordinates were supplied via URL hash/params on initial load; do not override
        } else if (applyingUrlState && getMapPositionFromUrl()) {
          // Handled by applyStateFromUrl easing to explicit camera coordinates
        } else if (refitScope) {
          fitMapToCurrentView(true);
        } else if (document.body.dataset.regionDetail) {
          syncMapViewport(false);
        } else {
          fitMapToCurrentView();
        }
      };
      if (map.isStyleLoaded()) {
        run();
        return;
      }
      await new Promise((resolve) => {
        const done = () => {
          map.off('load', done);
          map.off('error', onError);
          run();
          resolve();
        };
        const onError = () => {
          map.off('load', done);
          map.off('error', onError);
          run();
          resolve();
        };
        map.once('load', done);
        map.once('error', onError);
        setTimeout(done, 2500);
      });
    }

    function setBasemap(id) {
      scheduleUrlSync();
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      map.setStyle(CONFIG.basemapStyles[id]);
      map.once('idle', () => {
        map.jumpTo({ center, zoom, bearing, pitch });
        overlaysBound = false;
        void applyCurrentView();
      });
      const meta = CONFIG.basemapOptions.find((b) => b.id === id);
      basemapHint.textContent = meta?.description || '';
    }

    // "Hell" and "Gedeckt" come from MapTiler: a key that is locked to this domain and has a
    // quota. When it stops answering (401/403/429) the tiles fail silently and the map shows
    // gaps behind the colours. After a few such failures switch to the neutral background and
    // say so. Only the displayed style changes: the select and the share links keep the
    // visitor's choice, and picking a basemap again retries.
    const KEYED_BASEMAPS = ['light', 'muted'];
    let basemapAuthFailures = 0;
    let basemapFellBack = false;
    map.on('error', (event) => {
      const status = event && event.error && event.error.status;
      if (!event || event.sourceId !== 'basemap' || ![401, 403, 429].includes(status)) return;
      if (basemapFellBack || !KEYED_BASEMAPS.includes(basemapSelect?.value)) return;
      basemapAuthFailures += 1;
      if (basemapAuthFailures < 3) return;
      basemapFellBack = true;
      setBasemap('blank');
      basemapHint.textContent =
        'Die Hintergrundkarte ist gerade nicht erreichbar – neutraler Hintergrund.';
      showCopyViewLinkFeedback('Hintergrundkarte nicht erreichbar – neutraler Hintergrund.', true);
    });
    basemapSelect?.addEventListener('change', () => {
      basemapAuthFailures = 0;
      basemapFellBack = false;
      setBasemap(basemapSelect.value);
    });
    mapMetricSelect?.addEventListener('change', async () => {
      const prevScrollTop = panelMain ? panelMain.scrollTop : 0;
      currentMapMetric = mapMetricSelect.value;
      if (currentMapMetric !== 'bikeShare') {
        setLoadStatus('Lade Modelldaten …');
        await ensureRegionExtraIndexes();
        setLoadStatus('');
      }
      await applyCurrentView();
      if (panelMain) {
        panelMain.scrollTop = prevScrollTop;
      }
    });
    colorScaleSelect?.addEventListener('change', () => {
      const prevScrollTop = panelMain ? panelMain.scrollTop : 0;
      updateLegendBar(colorScaleSelect.value, currentMapMetric);
      updateColorScaleHint();
      syncOverlayColorInputsFromScale(colorScaleSelect.value);
      applyOverlayLineColors();
      updateRegionColors(lastPctRange.min, lastPctRange.max);
      if (lastRankingFeatures.length) {
        updateRanking(lastRankingFeatures, lastBikeShareRange.min, lastBikeShareRange.max);
      }
      if (panelMain) {
        panelMain.scrollTop = prevScrollTop;
        requestAnimationFrame(() => {
          if (panelMain && panelMain.scrollTop !== prevScrollTop) {
            panelMain.scrollTop = prevScrollTop;
          }
        });
      }
    });
    gebietSelect?.addEventListener('change', onGebietChange);
    untergebietSelect?.addEventListener('change', onUntergebietChange);
    document.getElementById('region-child-select')?.addEventListener('change', onRegionChildPick);
    darstellungSelect?.addEventListener('change', onDarstellungChange);

    // Jump straight to a Bundesland/Landkreis/Gemeinde by name instead of drilling through the
    // Gebiet/Untergebiet selects. Whatever level you search, the region you named is the one
    // that ends up selected, shown among its own siblings — see siblingViewScopeFromFocus.
    // Drilling into it is a separate, explicit step (the card's "Untergebiete anzeigen").
    const regionSearchInput = document.getElementById('region-search-input');
    const regionSearchResults = document.getElementById('region-search-results');
    function hideRegionSearchResults() {
      if (!regionSearchResults) return;
      regionSearchResults.hidden = true;
      regionSearchResults.style.maxHeight = '';
      regionSearchResults.replaceChildren();
    }
    function updateSearchResultsPosition() {
      if (!regionSearchResults || regionSearchResults.hidden || !regionSearchInput) return;
      if (window.visualViewport) {
        const rect = regionSearchInput.getBoundingClientRect();
        const availableHeight = window.visualViewport.height - rect.bottom - 12;
        if (availableHeight > 60) {
          regionSearchResults.style.maxHeight = Math.min(220, Math.floor(availableHeight)) + 'px';
        }
      }
    }
    function jumpToRegionBySearch(id) {
      if (!regionIndex) return;
      const scope = SimpleView.siblingViewScopeFromFocus(id, regionIndex);
      if (!scope) return;
      // A jump is a step of its own in the browser history.
      scheduleUrlSync('push');
      exitNeighborView();
      applyExpertScopeToUi(scope);
      updateScaleCapDefaultForView();
      void applyScopeChange().then(() => {
        // The sibling scope always contains the searched region, so this always opens its card —
        // and keeps showing the whole area it sits in: the card and sheet now cover part of the
        // map, so re-fit the scope into what is left instead of zooming into the region.
        // Clear first: selectRegionById treats a re-select of the current region as a toggle,
        // which would leave a search for the already-selected region with no card at all.
        if (selectedFeatureId) clearRegionSelection();
        selectRegionById(id, null, false);
        fitMapToCurrentView(true);
      });
    }
    function renderRegionSearchResults(query) {
      if (!regionSearchResults) return;
      if (!query) {
        hideRegionSearchResults();
        return;
      }
      const matches = RegionSearch.rankRegionSearchMatches(regionSearchEntries, query);
      regionSearchResults.replaceChildren();
      if (!matches.length) {
        const none = document.createElement('li');
        none.className = 'region-search-empty';
        none.textContent = 'Keine Treffer – Gemeinde, Landkreis oder Bundesland eingeben.';
        regionSearchResults.appendChild(none);
        regionSearchResults.hidden = false;
        updateSearchResultsPosition();
        return;
      }
      for (const m of matches) {
        const li = document.createElement('li');
        li.tabIndex = 0;
        li.append(m.name + ' ');
        const level = document.createElement('span');
        level.className = 'region-search-result-level';
        // The parent disambiguates: "Neuenkirchen" alone names 11 different Gemeinden.
        const context = [
          RegionSearch.regionSearchLevelLabel(m.level, m.id, regionIndex),
          m.parentName,
        ].filter(Boolean);
        level.textContent = '(' + context.join(', ') + ')';
        li.appendChild(level);
        const pick = () => {
          hideRegionSearchResults();
          regionSearchInput.value = '';
          regionSearchInput.blur();
          jumpToRegionBySearch(m.id);
        };
        li.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus, avoid blur-hide racing the click
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') pick();
        });
        regionSearchResults.appendChild(li);
      }
      regionSearchResults.hidden = false;
      updateSearchResultsPosition();
    }
    // "Where am I": the position is matched against the geometries already in the page, so it
    // never leaves the device. Only offered where the browser has a geolocation API at all.
    const regionLocateBtn = document.getElementById('region-locate');
    const regionLocateStatus = document.getElementById('region-locate-status');
    function showLocateStatus(text) {
      if (!regionLocateStatus) return;
      regionLocateStatus.textContent = text || '';
      regionLocateStatus.hidden = !text;
    }
    /**
     * The smallest region that contains a position. Gemeinde polygons are fetched per Landkreis,
     * so look into the Landkreise near the point (with a margin: their outlines are simplified)
     * and fetch only those Gemeinden's polygons.
     */
    async function findRegionAtLocation(lng, lat) {
      const margin = 0.02;
      const nearbyLandkreise = new Set();
      for (const f of allFeatures) {
        if (String(f.properties?.level ?? '') !== '6' || !f.geometry) continue;
        const [w, s, e, n] = turf.bbox(f);
        if (lng >= w - margin && lng <= e + margin && lat >= s - margin && lat <= n + margin) {
          nearbyLandkreise.add(f.properties.id);
        }
      }
      const gemeinden = allFeatures.filter(
        (f) =>
          String(f.properties?.level ?? '') === '8' && nearbyLandkreise.has(f.properties?.landkreis_id),
      );
      await ensureGemeindeGeometry(gemeinden);
      const coarser = allFeatures.filter((f) => String(f.properties?.level ?? '') !== '8');
      return RegionSearch.findRegionAtPoint([...gemeinden, ...coarser], lng, lat);
    }
    if (regionLocateBtn && navigator.geolocation) {
      regionLocateBtn.hidden = false;
      regionLocateBtn.addEventListener('click', () => {
        showLocateStatus('');
        regionLocateBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            let f = null;
            try {
              f = await findRegionAtLocation(pos.coords.longitude, pos.coords.latitude);
            } catch (err) {
              console.error('[radinfra-viewer]', err);
              regionLocateBtn.disabled = false;
              showLocateStatus('Gemeindegrenzen konnten nicht geladen werden.');
              return;
            }
            regionLocateBtn.disabled = false;
            if (f?.properties?.id) jumpToRegionBySearch(f.properties.id);
            else showLocateStatus('Dein Standort liegt außerhalb der Gebiete in dieser Karte.');
          },
          (err) => {
            regionLocateBtn.disabled = false;
            showLocateStatus(
              err && err.code === 1
                ? 'Standortzugriff wurde nicht erlaubt.'
                : 'Standort konnte nicht bestimmt werden.',
            );
          },
          { timeout: 10000, maximumAge: 60000 },
        );
      });
    }
    document.getElementById('search-fab')?.addEventListener('click', () => {
      setSheetState('full');
      if (!regionSearchInput) return;
      // Focus inside the tap itself, otherwise iOS won't raise the keyboard.
      regionSearchInput.focus({ preventScroll: true });
      regionSearchInput.select?.();
      regionSearchInput.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    if (regionSearchInput) {
      regionSearchInput.addEventListener('input', () => {
        renderRegionSearchResults(regionSearchInput.value.trim());
      });
      regionSearchInput.addEventListener('search', () => {
        if (!regionSearchInput.value) hideRegionSearchResults();
      });
      regionSearchInput.addEventListener('blur', () => {
        setTimeout(hideRegionSearchResults, 150);
      });
      regionSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          regionSearchInput.value = '';
          hideRegionSearchResults();
        } else if (e.key === 'ArrowDown' && !regionSearchResults.hidden) {
          regionSearchResults.querySelector('li')?.focus();
        }
      });
    }
    window.visualViewport?.addEventListener('resize', updateSearchResultsPosition);
    window.visualViewport?.addEventListener('scroll', updateSearchResultsPosition);

    document.getElementById('exit-neighbor-view')?.addEventListener('click', () => {
      exitNeighborView();
      scheduleUrlSync('push');
      updateScaleCapDefaultForView();
      void applyScopeChange();
    });

    const methodologyDialog = document.getElementById('methodology-dialog');
    const methodologyBody = document.getElementById('methodology-dialog-body');
    const methodologyClose = document.getElementById('methodology-close');
    let methodologyLoaded = false;

    async function openMethodologyModal() {
      if (!methodologyDialog) return;
      if (typeof methodologyDialog.showModal === 'function') {
        methodologyDialog.showModal();
      } else {
        methodologyDialog.hidden = false;
      }
      if (!methodologyLoaded) {
        try {
          const resp = await fetch('./methodik.html');
          if (resp.ok) {
            const text = await resp.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const main = doc.querySelector('main');
            if (main) {
              main.querySelector('.back')?.remove();
              methodologyBody?.replaceChildren(main);
              methodologyLoaded = true;
              return;
            }
          }
        } catch {
          // fallback to iframe on fetch error
        }
        if (methodologyBody) {
          const iframe = document.createElement('iframe');
          iframe.src = './methodik.html';
          iframe.title = 'Methodik & Datenquellen';
          iframe.style.width = '100%';
          iframe.style.height = '70vh';
          iframe.style.border = 'none';
          methodologyBody.replaceChildren(iframe);
          methodologyLoaded = true;
        }
      }
    }

    function closeMethodologyModal() {
      if (!methodologyDialog) return;
      if (typeof methodologyDialog.close === 'function') {
        methodologyDialog.close();
      } else {
        methodologyDialog.hidden = true;
      }
    }

    methodologyClose?.addEventListener('click', closeMethodologyModal);
    methodologyDialog?.addEventListener('click', (e) => {
      if (e.target === methodologyDialog) closeMethodologyModal();
    });

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href$="methodik.html"]');
      if (link) {
        e.preventDefault();
        openMethodologyModal();
      }
    });
    const panelOptions = document.getElementById('panel-options');
    if (panelOptions) {
      panelOptions.addEventListener('change', () => scheduleUrlSync());
      panelOptions.addEventListener('input', () => scheduleUrlSync());
    }
    rankingDetails?.addEventListener('toggle', () => scheduleUrlSync());
    toggleBikelanes?.addEventListener('change', updateOverlayVisibility);
    toggleRoads?.addEventListener('change', updateOverlayVisibility);
    overlayBikelaneColorInput?.addEventListener('input', applyOverlayLineColors);
    overlayRoadColorInput?.addEventListener('input', applyOverlayLineColors);
    for (const input of [
      overlayBikelaneMinzoomInput,
      overlayRoadMinzoomMajorInput,
      overlayRoadMinzoomFullInput,
    ].filter(Boolean)) {
      input.addEventListener('input', applyOverlayMinZoom);
      input.addEventListener('change', applyOverlayMinZoom);
    }
    if (viewCsvBtnToolbar) viewCsvBtnToolbar.addEventListener('click', downloadCurrentViewData);
    if (viewCsvBtnFull) viewCsvBtnFull.addEventListener('click', downloadFullStatsData);
    for (const btn of rankingModeButtons) {
      btn.addEventListener('click', () => setRankingMode(btn.dataset.rankingMode));
    }
    syncRankingModeButtons();
    syncRankingScrollLayout();
    shareFab?.addEventListener('click', openExportDialog);
    exportDialogClose?.addEventListener('click', closeExportDialog);
    exportDialog?.addEventListener('click', (e) => {
      if (e.target === exportDialog) closeExportDialog();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && exportDialog?.open) {
        closeExportDialog();
      }
    });

    exportItemShare?.addEventListener('click', async () => {
      const feature =
        selectedFeatureOverride || (selectedFeatureId ? regionIndex?.byId.get(selectedFeatureId) : null);
      if (feature && feature.properties) {
        const p = feature.properties;
        const url = shareableLink();
        const pctText = p.bikeSharePct != null ? formatUiPct(p.bikeSharePct) + ' %' : '';
        const shareText =
          (p.name || 'Gebiet') +
          (pctText ? ': ' + pctText + ' der Straßen mit Radinfrastruktur.' : '') +
          '\\n' +
          url;
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({
              title: (p.name || 'Gebiet') + ' – Radinfra-Vergleich',
              text: shareText,
              url: url,
            });
            showCopyViewLinkFeedback('✓ Geteilt!');
            return;
          } catch (err) {
            if (err?.name === 'AbortError') return;
          }
        }
      } else if (typeof navigator.share === 'function') {
        try {
          const { url, title, text } = sharePayload();
          await navigator.share({ title, text, url });
          showCopyViewLinkFeedback('✓ Geteilt!');
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      await copyShareLink();
      showCopyViewLinkFeedback('✓ Link kopiert!');
    });

    exportItemMap?.addEventListener('click', async () => {
      await downloadMapImage();
    });

    exportItemRanking?.addEventListener('click', async () => {
      await downloadRankingImage();
    });

    exportItemPdf?.addEventListener('click', () => {
      const feature =
        selectedFeatureOverride || (selectedFeatureId ? regionIndex?.byId.get(selectedFeatureId) : null);
      if (feature) {
        closeExportDialog();
        void printRegionSheet(feature);
      }
    });
    function updateBasemapHint() {
      if (!basemapHint) return;
      const basemapId = basemapSelect?.value || CONFIG.basemap;
      const meta = CONFIG.basemapOptions.find((b) => b.id === basemapId);
      basemapHint.textContent = meta?.description || '';
    }
    try {
      updateBasemapHint();
    } catch (bindUiErr) {
      console.error(bindUiErr);
    }

    function yieldToMain() {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    let neighborsFetchStarted = false;
    let neighborsBuildStarted = false;

    function neighborIndexFromFile(file) {
      return SimpleView.neighborIndexFromPrecomputed(file);
    }

    let neighborsReadyResolvers = [];

    /** Resolves once the neighbour index exists — or after a while, so a failed load can't hang a click. */
    function whenNeighborsReady() {
      if (neighborIndex) return Promise.resolve();
      ensureNeighborsLoaded();
      return new Promise((resolve) => {
        neighborsReadyResolvers.push(resolve);
        setTimeout(resolve, 20000);
      });
    }

    function refreshViewAfterNeighborsLoaded() {
      if (!rawLoaded) return;
      const waiting = neighborsReadyResolvers;
      neighborsReadyResolvers = [];
      for (const resolve of waiting) resolve();
      // The "Nachbarn" options of the Zeige select can only be offered once the index is known.
      populateDarstellungSelect();
      if (isNeighborView()) void applyCurrentView();
    }

    function onNeighborsFileLoaded(file) {
      neighborIndex = neighborIndexFromFile(file);
      setLoadStatus('');
      refreshViewAfterNeighborsLoaded();
    }

    function buildNeighborsInWorker() {
      if (neighborsBuildStarted || neighborIndex?.precomputed || !regionIndex || !allFeatures.length) {
        return;
      }
      if (typeof Worker === 'undefined') {
        neighborIndex = SimpleView.buildNeighborIndex(regionIndex);
        refreshViewAfterNeighborsLoaded();
        return;
      }
      neighborsBuildStarted = true;
      setLoadStatus('Nachbarn werden berechnet…');
      const worker = new Worker('./neighborsBuild.worker.js', { type: 'module' });
      const finish = () => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };
      worker.onmessage = (event) => {
        const data = event.data;
        finish();
        if (data?.type === 'ok' && data.file) {
          onNeighborsFileLoaded(data.file);
          return;
        }
        setLoadStatus('');
        if (!neighborIndex && regionIndex) {
          neighborIndex = SimpleView.buildNeighborIndex(regionIndex);
          refreshViewAfterNeighborsLoaded();
        }
      };
      worker.onerror = () => {
        finish();
        setLoadStatus('');
        if (!neighborIndex && regionIndex) {
          neighborIndex = SimpleView.buildNeighborIndex(regionIndex);
          refreshViewAfterNeighborsLoaded();
        }
      };
      worker.postMessage({ type: 'build', features: allFeatures });
    }

    function onNeighborsLoadFailed() {
      if (rawLoaded && regionIndex && allFeatures.length) buildNeighborsInWorker();
    }

    function ensureNeighborsLoaded() {
      if (!rawLoaded || !regionIndex || !allFeatures.length || neighborIndex) return;
      if (!neighborsFetchStarted) startNeighborsBackgroundLoad();
      else if (!neighborsBuildStarted) buildNeighborsInWorker();
    }

    async function loadPrecomputedNeighborsOnMain() {
      try {
        const msgpackRes = await fetch(CONFIG.neighborsMsgpackUrl);
        if (msgpackRes.ok) {
          const bytes = new Uint8Array(await msgpackRes.arrayBuffer());
          onNeighborsFileLoaded(SimpleView.decodeNeighborsPack(bytes));
          return;
        }
        const res = await fetch(CONFIG.neighborsUrl);
        if (!res.ok) {
          onNeighborsLoadFailed();
          return;
        }
        const file = SimpleView.precomputedNeighborsFileFromJson(await res.json());
        if (file) onNeighborsFileLoaded(file);
        else onNeighborsLoadFailed();
      } catch {
        onNeighborsLoadFailed();
      }
    }

    function startNeighborsBackgroundLoad() {
      if (neighborsFetchStarted) return;
      neighborsFetchStarted = true;
      if (typeof Worker === 'undefined') {
        void loadPrecomputedNeighborsOnMain();
        return;
      }
      const worker = new Worker('./neighbors.worker.js', { type: 'module' });
      const finish = () => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };
      worker.onmessage = (event) => {
        const data = event.data;
        finish();
        if (data?.type === 'ok' && data.file) {
          onNeighborsFileLoaded(data.file);
          return;
        }
        void loadPrecomputedNeighborsOnMain();
      };
      worker.onerror = () => {
        finish();
        void loadPrecomputedNeighborsOnMain();
      };
      worker.postMessage({
        type: 'load',
        msgpackUrl: CONFIG.neighborsMsgpackUrl,
        jsonUrl: CONFIG.neighborsUrl,
      });
    }

    function setLoadStatus(text) {
      if (!loadStatus) return;
      if (text) {
        loadStatus.textContent = text;
        loadStatus.style.display = 'block';
      } else {
        loadStatus.style.display = 'none';
      }
    }

    const STATS_MSGPACK_LOAD_TIMEOUT_MS = 120_000;

    function loadRegionFeaturesInWorker(url) {
      return new Promise((resolve, reject) => {
        if (typeof Worker === 'undefined') {
          reject(new Error('Web Worker nicht verfügbar'));
          return;
        }
        const worker = new Worker('./statsMsgpack.worker.js', { type: 'module' });
        let settled = false;
        const finish = (fn) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          worker.onmessage = null;
          worker.onerror = null;
          worker.terminate();
          fn();
        };
        const timeoutId = setTimeout(() => {
          finish(() => reject(new Error('Timeout beim Laden der Gebietsdaten')));
        }, STATS_MSGPACK_LOAD_TIMEOUT_MS);
        worker.onmessage = (event) => {
          const data = event.data;
          if (data?.type === 'ok' && data.bytes) {
            finish(() => resolve(StatsPack.decodeRegionFeatures(new Uint8Array(data.bytes))));
            return;
          }
          if (data?.type === 'error') {
            finish(() => reject(new Error(data.message || 'Worker-Fehler')));
          }
        };
        worker.onerror = () => {
          finish(() => reject(new Error('Worker-Fehler beim Laden')));
        };
        worker.postMessage({ type: 'load', url });
      });
    }

    async function init() {
      try {
        await statsReadyPromise;
        await lazyDarstellungPresencePromise; // tiny fetch, in flight since page load — just a safety margin
        const manifestPromise = fetch(CONFIG.manifestUrl)
          .catch(() => ({ ok: false }))
          .then(async (res) => (res.ok ? res.json() : {}));
        manifest = await manifestPromise;
        setPanelActionsEnabled(true);
        colorScaleSelect.innerHTML = '';
        for (const scale of CONFIG.colorScales) {
          const el = document.createElement('option');
          el.value = scale.id;
          el.textContent = scale.label;
          if (scale.id === CONFIG.defaultColorScale) el.selected = true;
          colorScaleSelect.appendChild(el);
        }
        populateGebietSelect();
        populateUntergebietSelect();
        await yieldToMain();
        populateDarstellungSelect();
        initOverlayColorInputs();
        applyUrlOptions();
        await applyCurrentView();
        applySelectedRegionFromUrl();
        explicitMapPositionPending = false;
        urlSyncEnabled = true;
        urlSyncBaseline = currentStateUrl();
      } catch (e) {
        showLoadError(e, 'Die Karte konnte nicht vollständig geladen werden.');
      }
    }

    void (async () => {
      try {
        await statsReadyPromise;
        await init();
      } catch (e) {
        // statsReadyPromise already reported its own failure; only add one if nothing has.
        if (loadError && loadError.style.display !== 'block') {
          showLoadError(e, 'Die Karte konnte nicht geladen werden.');
        } else {
          console.error('[radinfra-viewer]', e);
        }
      }
    })();
  </script>
</body>
</html>
`
}
