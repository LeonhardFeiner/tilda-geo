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
import { viewerRegionNavScript } from './viewerRegionNavScript'

export function generateViewerHtml(generatedAt: string) {
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
    statsUrl: './stats.geojson',
    neighborsMsgpackUrl: './neighbors.msgpack',
    neighborsUrl: './neighbors.json',
    manifestUrl: './manifest.json',
    peersUrl: './gemeinde-peers.json',
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- By far the largest resource on the page (stats-core.msgpack) — without this hint the
       browser only discovers it once the inline controller script runs, after every script tag
       above it has downloaded and executed. Preloading lets it start immediately, in parallel
       with everything else. crossorigin is required even same-origin: fetch() always runs in
       CORS mode, and an uncredentialed preload wouldn't be reused otherwise. -->
  <link rel="preload" href="./stats-core.msgpack" as="fetch" crossorigin="anonymous" />
  <link rel="preconnect" href="https://unpkg.com" crossorigin />
  <title>Radinfra-Vergleich – wie viel Radweg hat deine Gemeinde?</title>
  <meta
    name="description"
    content="Wie viel Prozent der Straßen haben Radinfrastruktur? Vergleich der Gemeinden und Landkreise auf Basis von OpenStreetMap-Daten."
  />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Radinfra-Vergleich" />
  <meta property="og:title" content="Radinfra-Vergleich – wie viel Radweg hat deine Gemeinde?" />
  <meta
    property="og:description"
    content="Anteil der Straßen mit Radinfrastruktur je Gemeinde und Landkreis – auf Basis von OpenStreetMap."
  />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Radinfra-Vergleich – wie viel Radweg hat deine Gemeinde?" />
  <meta
    name="twitter:description"
    content="Anteil der Straßen mit Radinfrastruktur je Gemeinde und Landkreis – auf Basis von OpenStreetMap."
  />
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
    /* Desktop scrim is inert; the mobile bottom-sheet block below activates it. */
    #sheet-scrim { display: none; }
    /* Floating share button: phone only (see media query); desktop shares via the panel toolbar. */
    .share-fab { display: none; }
    @media (max-width: 768px) {
      body { --sheet-peek: 4.9rem; }

      #sheet-scrim {
        display: block; position: fixed; inset: 0; z-index: 3;
        background: rgba(0, 0, 0, 0.32);
        opacity: 0; pointer-events: none;
        transition: opacity 0.25s ease;
      }
      body[data-sheet="half"] #sheet-scrim,
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

      /* Primary sections are permanently open on the phone (see lockOpenSectionsForViewport). */
      .panel-section[data-lock-open] > summary {
        pointer-events: none;
        list-style: none;
      }
      .panel-section[data-lock-open] > summary::-webkit-details-marker { display: none; }

      /* On mobile a selected region is moved into the top of the sheet (placeRegionDetail),
         so render it as an inline block instead of the floating card. */
      #region-detail-mount:empty { display: none; }
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
        width: auto; margin: 0 -14px 10px; padding: 12px 14px;
        border: none; border-bottom: 1px solid #d6e4f5;
        background: #eef4fc; color: #1565c0;
        font-size: 0; cursor: pointer;
      }
      #region-detail-mount .region-detail-close::before {
        content: '‹ Zurück zur Karte';
        font-size: 13px; font-weight: 600;
      }
      #region-detail-mount .region-detail-header { padding-right: 0; }

      /* Advanced config (Zählung + Farben & Darstellung + Ansichts-Wechsel) folds
         behind one "Einstellungen" control so the sheet stays focused on
         Gebiet / Legende / Rangliste. Expert view only — simple view is already slim. */
      body.view-expert .settings-toggle { display: flex; }
      body.view-expert:not([data-settings-open]) #count-classes-details,
      body.view-expert:not([data-settings-open]) #color-options-details,
      body.view-expert:not([data-settings-open]) #view-mode-links-expert-panel {
        display: none;
      }
      body[data-settings-open] .settings-toggle { color: #1565c0; }

      /* Ranking CSV export is a power-user tool — phone shows it only in expert view. */
      body:not(.view-expert) #ranking-csv-actions { display: none; }

      /* Share button, top-left over the map. Styled to match the MapLibre zoom
         control (top-right) so it reads as a map control, not a floating chip. */
      #share-fab {
        display: flex; align-items: center; justify-content: center;
        position: fixed; z-index: 5;
        top: calc(10px + env(safe-area-inset-top, 0px)); left: 10px;
        width: 30px; height: 30px; padding: 0;
        border: none; border-radius: 4px;
        background: #fff; color: #333; cursor: pointer;
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
      }
      #share-fab svg { width: 18px; height: 18px; fill: currentColor; }
      #share-fab:active { background: #f2f2f2; }
      #share-fab:disabled { opacity: 0.5; cursor: not-allowed; }
      body[data-sheet="full"] #share-fab { display: none; }
      .panel-actions .share-toolbar { display: none; }
      .panel-actions { margin-top: 0; }
      #copy-view-link-feedback {
        position: fixed; z-index: 6;
        top: calc(60px + env(safe-area-inset-top, 0px)); left: 10px;
        max-width: 74vw; padding: 6px 10px;
        background: #fff; border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.24);
      }
    }
    .panel label { display: block; font-size: 13px; margin: 8px 0 4px; font-weight: 600; }
    .panel select { width: 100%; font-size: 13px; padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; }
    .panel .row { display: flex; flex-wrap: wrap; gap: 12px 16px; margin-top: 8px; }
    .panel .row label { display: flex; align-items: center; gap: 6px; font-weight: normal; margin: 0; cursor: pointer; }
    .hint { font-size: 11px; color: #666; margin-top: 4px; }
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
    .panel-section > summary::-webkit-details-marker { color: #666; }
    .panel-section[open] > :not(summary) { padding-bottom: 8px; }
    /* Phone-only: one control that collapses the advanced settings (see media query). */
    .settings-toggle {
      display: none;
      width: 100%; align-items: center; gap: 8px;
      padding: 10px 0; margin: 0;
      border: none; border-top: 1px solid #e8e8e8;
      background: none; cursor: pointer; font: inherit;
      font-size: 13px; font-weight: 600; color: #333; text-align: left;
    }
    .settings-toggle svg { width: 15px; height: 15px; fill: currentColor; flex: none; }
    .settings-toggle::after {
      content: '▸'; margin-left: auto; color: #666; font-size: 11px;
    }
    .settings-toggle[aria-expanded="true"]::after { content: '▾'; }
    .map-legend-section .map-legend { padding-bottom: 0; }
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
    .share-toolbar {
      display: flex; flex-wrap: nowrap; gap: clamp(3px, 1.2vw, 6px);
      align-items: center; width: 100%; min-width: 0;
    }
    .share-btn {
      display: inline-flex; align-items: center; justify-content: center;
      flex: 1 1 0; min-width: 0; width: auto; aspect-ratio: 1;
      max-width: 2.25rem; max-height: 2.25rem; padding: 0;
      border: 1px solid #ccc; border-radius: 6px; background: #fafafa;
      cursor: pointer; color: #444;
    }
    .share-btn:hover:not(:disabled) { background: #f0f0f0; }
    .share-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .share-btn svg {
      width: 62%; height: 62%; max-width: 1.15rem; max-height: 1.15rem;
      fill: currentColor;
    }
    .share-btn--primary { border-color: #1565c0; color: #1565c0; }
    .share-btn--primary:hover:not(:disabled) { background: #e8f0fb; }
    #share-native[hidden] { display: none !important; }
    #copy-view-link-feedback { display: block; margin-top: 4px; color: #2e7d32; font-size: 11px; }
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
    .legend-bar { height: 10px; border-radius: 3px; margin: 4px 0; }
    .legend-labels { display: flex; justify-content: space-between; font-size: 12px; color: #555; }
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
    .ranking-hint { font-weight: normal; font-size: 11px; color: #888; }
    .ranking-list {
      margin: 0; padding: 0;
      font-size: 11px; line-height: 1.45; color: #444;
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
    .ranking-list li.ranking-row-clickable:hover { background: #f5f5f5; }
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
      white-space: nowrap;
    }
    .ranking-list .ranking-more,
    .ranking-list .ranking-divider {
      display: block; grid-column: 1 / -1;
      color: #888; font-style: italic; font-size: 10px; padding: 2px 0;
    }
    .ranking-divider { text-align: center; font-style: normal; color: #aaa; }
    .ranking-toolbar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px;
      margin-bottom: 6px;
    }
    .ranking-mode {
      display: flex; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;
    }
    .ranking-mode-btn {
      font-size: 11px; padding: 3px 8px; border: none; background: #f5f5f5;
      color: #444; cursor: pointer;
    }
    .ranking-mode-btn:hover { background: #ebebeb; }
    .ranking-mode-btn[aria-pressed="true"] {
      background: #e3f2fd; color: #1565c0; font-weight: 600;
    }
    .view-csv-row { margin-top: 6px; }
    .view-csv-btn {
      font-size: 11px; padding: 3px 8px;
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
      font-size: 11px; color: #666; margin: 0; line-height: 1.45;
    }
    .national-context {
      font-size: 12px; font-weight: 600; color: #333;
      margin: 6px 0 0; line-height: 1.4;
    }
    .national-context[hidden] { display: none !important; }
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
    }
    .region-detail[hidden] { display: none !important; }
    .region-detail-header {
      display: flex; align-items: flex-start; gap: 8px;
      margin-bottom: 8px; padding-right: 24px;
    }
    .region-detail-header h3 {
      margin: 0; font-size: 14px; line-height: 1.3; color: #111;
    }
    .region-detail-close {
      position: absolute; top: 6px; right: 8px;
      border: none; background: transparent; font-size: 20px; line-height: 1;
      color: #666; cursor: pointer; padding: 2px 6px;
    }
    .region-detail-close:hover { color: #111; }
    .region-detail-meta { margin: 0 0 8px; color: #555; line-height: 1.45; white-space: pre-line; }
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
    #region-detail-gap + .region-detail-gap { margin-top: -4px; }
    .region-detail-gap--peer::before {
      content: 'Bundesweit'; display: block;
      font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; opacity: 0.7; margin-bottom: 2px;
    }
    .region-detail-trend { margin: 0 0 10px; }
    .region-detail-trend[hidden] { display: none !important; }
    .region-detail-trend-btn {
      font-size: 11px; font-weight: 600; color: #1565c0;
      background: #eef4fb; border: 1px solid #cfe0f3; border-radius: 6px;
      padding: 5px 9px; cursor: pointer;
    }
    .region-detail-trend-btn:hover { background: #e2edfa; }
    .region-detail-trend-btn:disabled { cursor: default; opacity: 0.7; }
    .region-detail-trend-btn[hidden] { display: none !important; }
    #region-detail-trend-result[hidden] { display: none !important; }
    .region-detail-trend-sparkline { display: block; margin: 6px 0 4px; }
    .region-detail-trend-summary { margin: 0 0 4px; font-size: 12px; line-height: 1.4; color: #333; }
    .region-detail-trend-note { margin: 0; font-size: 10px; line-height: 1.4; color: #888; }
    .region-detail-trend-note a { color: #888; }
    .region-detail-trend-error { color: #b71c1c; }
    .region-detail-section { margin-top: 8px; }
    .region-detail-section h4 {
      margin: 0 0 4px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.02em; color: #666;
    }
    .region-detail-rows { margin: 0; padding: 0; list-style: none; }
    .region-detail-rows li {
      display: flex; justify-content: space-between; gap: 8px;
      padding: 2px 0; border-bottom: 1px solid #f0f0f0;
    }
    .region-detail-rows li.region-detail-row-clickable {
      cursor: pointer; margin: 0 -4px; padding: 2px 4px; border-radius: 4px;
    }
    .region-detail-rows li.region-detail-row-clickable:hover { background: #f5f5f5; }
    .region-detail-rows li.region-detail-row-active { background: #e3f2fd; }
    .region-detail-rows li:last-child { border-bottom: none; }
    .region-detail-rows .km {
      font-variant-numeric: tabular-nums; color: #444; white-space: nowrap;
    }
    .region-detail-tags {
      margin-top: 4px; font-size: 11px;
    }
    .region-detail-tags summary {
      cursor: pointer; color: #1565c0; user-select: none;
    }
    .region-detail-tags[open] summary { margin-bottom: 4px; }
    #load-error { color: #b71c1c; font-size: 13px; display: none; }
    #load-status { color: #555; font-size: 13px; margin: 0 0 8px; display: none; }
    body.ui-minimal #panel-main { display: none !important; }
    body.view-simple #count-classes-details,
    body.view-simple #color-options-details { display: none !important; }
    body.view-simple #map-legend-section > summary { display: none; }
    body.view-simple #map-legend-section { border-top: none; padding-top: 0; }
    body.view-simple #map-legend-section > :not(summary) { padding-bottom: 8px; }
    .region-nav { margin-bottom: 4px; }
    .region-nav[hidden] { display: none !important; }
    .panel-options { display: flex; flex-direction: column; }
    .simple-view-block {
      padding: 0 0 8px;
    }
    .simple-view-block[hidden] { display: none !important; }
    .simple-view-block select { margin: 0; }
    .simple-counting-notice {
      margin: 0 0 8px; padding: 8px 10px; border-radius: 6px;
      background: #fff8e1; border: 1px solid #ffe082; font-size: 12px; line-height: 1.45;
    }
    .simple-counting-notice[hidden] { display: none !important; }
    .simple-counting-notice p { margin: 0 0 6px; }
    .simple-counting-notice ul {
      margin: 0 0 8px; padding-left: 1.2em; font-size: 12px;
    }
    .simple-counting-notice li { margin: 2px 0; }
    .simple-counting-notice button {
      font-size: 12px; padding: 4px 10px; border-radius: 4px;
      border: 1px solid #ccc; background: #fff; cursor: pointer;
    }
    .simple-counting-notice button:hover { background: #f5f5f5; }
    .region-scope-block[hidden] { display: none !important; }
    .view-mode-links {
      margin: 4px 0 0; font-size: 11px; line-height: 1.45;
    }
    .view-mode-links a { color: #1565c0; text-decoration: none; }
    .view-mode-links a:hover { text-decoration: underline; }
    .region-detail-view-link {
      margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;
      font-size: 11px;
    }
    .region-detail-view-link a { color: #1565c0; text-decoration: none; }
    .region-detail-view-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="sheet-scrim" aria-hidden="true"></div>
  <button type="button" id="share-fab" class="share-fab" title="Teilen" aria-label="Ansicht teilen">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6 7.7 6.9l1.4 1.4L11 6.4V15h2V6.4l1.9 1.9 1.4-1.4L12 2.6z"/><path d="M5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9h-2v9H7v-9H5z"/></svg>
  </button>
  <details class="panel" id="panel-main" open>
    <summary>
      <span>Steuerung & Legende</span>
      <span class="panel-summary-preview" id="panel-summary-preview"></span>
    </summary>
    <div class="panel-body">
    <div id="region-detail-mount"></div>
    <p id="load-status">Lade Gebietsdaten…</p>
    <p id="load-error"></p>
    <div class="panel-options" id="panel-options">
    <details class="panel-section region-scope-block" id="region-scope-block" open>
      <summary>Gebiet &amp; Darstellung</summary>
      <div class="region-nav" id="region-nav">
        <label for="gebiet-select">Gebiet</label>
        <select id="gebiet-select"></select>
        <p class="region-nav" id="untergebiet-wrap">
          <label for="untergebiet-select">Untergebiet</label>
          <select id="untergebiet-select"></select>
        </p>
        <label for="darstellung-select">Karte zeigt</label>
        <select id="darstellung-select"></select>
      </div>
    </details>
    <div class="simple-view-block" id="simple-view-block" hidden>
      <select id="simple-view-select" aria-label="Karte zeigt"></select>
      <div id="simple-counting-notice" class="simple-counting-notice" hidden>
        <p>Aktuell von der Statistik ausgeschlossen:</p>
        <ul id="simple-counting-excluded-list"></ul>
        <button type="button" id="simple-preset-radinfra">Zurücksetzen</button>
      </div>
    </div>
    <button
      type="button"
      id="settings-toggle"
      class="settings-toggle"
      aria-expanded="false"
      aria-controls="count-classes-details color-options-details"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.5 7.5 0 0 0 .05-1.88l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.75 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.24.09.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.02-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
      <span>Einstellungen</span>
    </button>
    <details class="panel-section count-classes" id="count-classes-details">
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
    <details class="panel-section color-options" id="color-options-details">
      <summary>Farben & Darstellung</summary>
      <label for="basemap-select">Hintergrundkarte</label>
      <select id="basemap-select"></select>
      <p class="hint" id="basemap-hint"></p>
      <label for="color-scale-select">Farbskala (Flächen)</label>
      <select id="color-scale-select"></select>
      <p class="hint" id="color-scale-hint"></p>
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
    </details>
    <details class="panel-section map-legend-section" id="map-legend-section" open>
      <summary>Legende</summary>
      <div class="map-legend">
        <div class="choropleth-legend">
          <span class="choropleth-legend-title">Flächenfarbe (Radinfra-Anteil)</span>
          <div class="legend-bar" id="legend-bar"></div>
          <div class="legend-labels"><span id="legend-min"></span><span id="legend-max"></span></div>
        </div>
        <p class="view-meta" id="view-meta"></p>
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
          <div class="ranking-mode" role="group" aria-label="Ranglisten-Ansicht">
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
          <ol class="ranking-list" id="ranking-list"></ol>
        </div>
    </details>
    <p class="view-mode-links" id="view-mode-links-expert-panel" hidden>
      <a href="#" id="switch-to-expert-link">Expertenansicht</a>
    </p>
    <div class="panel-actions">
      <div class="share-toolbar" role="group" aria-label="Ansicht teilen und exportieren">
        <button type="button" id="share-native" class="share-btn share-btn--primary" hidden title="Teilen" aria-label="Teilen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.05-4.11A2.99 2.99 0 1 0 14.5 5.5l-7.05 4.11a3 3 0 1 0 0 4.78l7.05 4.11a3 3 0 1 0 .45 1.55 2.99 2.99 0 0 0-.45-.05z"/></svg>
        </button>
        <button type="button" id="copy-view-link" class="share-btn" disabled title="Link kopieren" aria-label="Link kopieren">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>
        </button>
        <button type="button" id="share-map-image" class="share-btn" disabled title="Karte als Bild speichern" aria-label="Karte als Bild speichern">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        </button>
        <button type="button" id="share-ranking-image" class="share-btn" disabled title="Rangliste als Bild speichern" aria-label="Rangliste als Bild speichern">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 4h7v3h-7v-3z"/></svg>
        </button>
      </div>
      <span id="copy-view-link-feedback" hidden></span>
    </div>
    </div>
    <p class="footer">
      Erstellt am ${generatedDateLabel} ·
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
      <h3 id="region-detail-title"></h3>
    </div>
    <p class="region-detail-meta" id="region-detail-meta"></p>
    <p class="region-detail-gap" id="region-detail-gap" hidden></p>
    <p class="region-detail-gap region-detail-gap--peer" id="region-detail-peer-gap" hidden></p>
    <div class="region-detail-trend" id="region-detail-trend" hidden>
      <button type="button" class="region-detail-trend-btn" id="region-detail-trend-btn"></button>
      <div id="region-detail-trend-result" hidden></div>
    </div>
    <div id="region-detail-body"></div>
  </div>
  <script src="./statsClassSums.js"></script>
  <script src="./regionNavigation.js"></script>
  <script src="./statsMsgpack.js"></script>
  <script src="./simpleView.js"></script>
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

    // stats-core.msgpack (fetched above as statsDataPromise) omits Gemeindeverbände (level 7)
    // and Stadtbezirke (level 9) — together ~40% of the combined payload — so the first paint
    // never waits on them. They're fetched right after, in the background: the two Darstellung
    // options they power are only shown in the dropdown once features for them actually exist
    // (listDarstellungPresetsForScope), so waiting for an explicit selection before fetching
    // would make those options impossible to ever pick. This still avoids blocking the initial
    // render/interactivity on that data, which is what makes the page feel slow to load.
    const DARSTELLUNGEN_NEEDING_EXTRA_LEVELS = new Set([
      'gemeindeverbaende',
      'gemeindeverbaende_kreisfrei',
      'stadtbezirke',
    ]);
    let extraLevelsLoaded = false;
    let extraLevelsPromise = null;
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

    const statsReadyPromise = statsDataPromise
      .then((data) => {
        if (data.type === 'msgpack') {
          allFeatures = StatsPack.decodeRegionFeatures(new Uint8Array(data.bytes));
          // Fire-and-forget: starts right after the core data is usable, well before anyone
          // could realistically have picked a Darstellung needing it.
          ensureExtraLevelsLoaded().catch(() => {});
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
        if (loadError) {
          loadError.style.display = 'block';
          loadError.textContent = String(e.message || e);
        }
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
    const copyViewLinkBtn = document.getElementById('copy-view-link');
    const shareMapImageBtn = document.getElementById('share-map-image');
    const shareRankingImageBtn = document.getElementById('share-ranking-image');
    const shareNativeBtn = document.getElementById('share-native');
    const shareToolbar = document.querySelector('.share-toolbar');
    const copyViewLinkFeedback = document.getElementById('copy-view-link-feedback');
    const panelMain = document.getElementById('panel-main');
    const panelSummaryPreview = document.getElementById('panel-summary-preview');
    const panelMobileMq = window.matchMedia('(max-width: 768px)');
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
    let regionClickBound = false;
    const regionDetailEl = document.getElementById('region-detail');
    const regionDetailTitle = document.getElementById('region-detail-title');
    const regionDetailMeta = document.getElementById('region-detail-meta');
    const regionDetailGap = document.getElementById('region-detail-gap');
    const regionDetailPeerGap = document.getElementById('region-detail-peer-gap');
    const regionDetailTrend = document.getElementById('region-detail-trend');
    const regionDetailTrendBtn = document.getElementById('region-detail-trend-btn');
    const regionDetailTrendResult = document.getElementById('region-detail-trend-result');
    const regionDetailBody = document.getElementById('region-detail-body');
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
    }

    function onLengthClassFilterChange() {
      lengthClassFilter = readLengthClassFilterFromUi();
      clearOverlayLineHighlight();
      updateOverlayLayerFilters();
      if (rawLoaded) repaintRegionsFromCounting();
      syncSimpleCountingNotice();
      applyOverlayLineColors();
    }

    function applyRadinfraDefaultCounting() {
      lengthClassFilter = structuredClone(CONFIG.radinfraDefaultFilter);
      applyLengthClassFilterToUi(lengthClassFilter);
      clearOverlayLineHighlight();
      updateOverlayLayerFilters();
      if (rawLoaded) repaintRegionsFromCounting();
      syncSimpleCountingNotice();
      applyOverlayLineColors();
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

    function syncSimpleCountingNotice() {
      const notice = document.getElementById('simple-counting-notice');
      const listEl = document.getElementById('simple-counting-excluded-list');
      if (!notice || !listEl) return;
      const filter = readLengthClassFilterFromUi();
      const show =
        uiMode() === 'simple' &&
        !lengthClassFiltersEqual(filter, CONFIG.radinfraDefaultFilter);
      notice.hidden = !show;
      if (!show) return;
      listEl.replaceChildren();
      for (const label of listExcludedCountingClasses(filter)) {
        const li = document.createElement('li');
        li.textContent = label;
        listEl.appendChild(li);
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
      document.getElementById('preset-radinfra')?.addEventListener('click', applyRadinfraDefaultCounting);
    }

    initCountClassFilters();

    const simplePresetRadinfraBtn = document.getElementById('simple-preset-radinfra');
    if (simplePresetRadinfraBtn) {
      simplePresetRadinfraBtn.addEventListener('click', applyRadinfraDefaultCounting);
    }

    function enrichFeature(f) {
      const p = f.properties || {};
      const { roadKm: road, bikeKm: bike } = TildaStats.computeFilteredLengths(
        p.road_length,
        p.bikelane_length,
        lengthClassFilter,
      );
      const pct = road > 0 ? (bike / road) * 100 : null;
      const lowRoad = TildaStats.isLowRoadNetworkForScale(road);
      let label =
        (p.name || p.id) +
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
      return {
        type: 'Feature',
        id: p.id,
        geometry: f.geometry,
        properties: {
          ...p,
          roadSumKm: road,
          bikelaneSumKm: bike,
          bikeSharePct: pct != null ? pct : 0,
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

    function statsRowFromFeature(f, rank) {
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
      for (const opt of CONFIG.roadClassOptions) {
        row['road_km_' + opt.id] = roadSums[opt.id] ?? 0;
      }
      for (const opt of CONFIG.bikelaneClassOptions) {
        row['bikelane_km_' + opt.id] = bikeSums[opt.id] ?? 0;
      }
      return row;
    }

    function buildStatsCsv(features) {
      const sorted = [...features].sort(compareByBikeShare);
      const rankIndex = new Map();
      sorted
        .filter((f) => typeof f.properties?.bikeSharePct === 'number')
        .forEach((f, i) => {
          const id = f.properties?.id;
          if (id) rankIndex.set(id, i + 1);
        });
      const columns = csvStatColumns();
      const header = columns.map((c) => csvEscape(c.header)).join(CSV_SEP);
      const lines = sorted.map((f) => {
        const id = f.properties?.id;
        const row = statsRowFromFeature(f, id ? rankIndex.get(id) : '');
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

    function downloadCurrentViewData() {
      if (!rawLoaded) return;
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
      lengthClassFilter = readLengthClassFilterFromUi();
      downloadStatsCsv(allFeatures.map(enrichFeature), 'radinfra-gesamt.csv');
    }

    function setCsvExportEnabled(enabled) {
      const toolbarBtn = document.getElementById('view-csv-btn-toolbar');
      const fullBtn = document.getElementById('view-csv-btn-full');
      if (toolbarBtn) toolbarBtn.disabled = !enabled;
      if (fullBtn) fullBtn.disabled = !enabled;
    }

    function syncCsvExportVisibility() {
      const fullBtn = document.getElementById('view-csv-btn-full');
      if (fullBtn) fullBtn.hidden = uiMode() !== 'expert';
    }

    function setPanelActionsEnabled(enabled) {
      setCsvExportEnabled(enabled);
      const shareFab = document.getElementById('share-fab');
      if (shareFab) shareFab.disabled = !enabled;
      if (!shareToolbar) return;
      for (const btn of shareToolbar.querySelectorAll('.share-btn')) {
        if (btn.id === 'share-native' && btn.hidden) continue;
        btn.disabled = !enabled;
      }
    }

    function updateLegendRange(min, max) {
      document.getElementById('legend-min').textContent = formatUiPct(min) + ' %';
      document.getElementById('legend-max').textContent = formatUiPct(max) + ' %';
    }

    function updateViewMetaText(filtered, range) {
      let metaText = viewLabelForCurrentMode() + ' · ' + filtered.length + ' Gebiete';
      if (range.scaleCapped) {
        if (range.robustApplied && !getScaleCapSettings().enabled) {
          const parts = ['Skala 0–' + formatUiPct(range.max) + ' %'];
          if (range.dataMax > range.max) {
            parts.push('max. ' + formatUiPct(range.dataMax) + ' % in Daten');
          }
          if (range.outlierCount > 0) {
            parts.push(range.outlierCount + ' Ausreißer ignoriert');
          }
          if (range.excludedLowRoadCount > 0) {
            parts.push(range.excludedLowRoadCount + ' mit wenig Straßennetz');
          }
          metaText += ' · ' + parts.join(', ');
        } else {
          metaText +=
            ' · Skala 0–' +
            range.capPct +
            ' % (max. ' +
            formatUiPct(range.dataMax) +
            ' % = volle Farbe)';
        }
      }
      document.getElementById('view-meta').textContent = metaText;
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
      const range = colorScaleRange(filtered);
      const { min, max } = range;
      lastPctRange = { min, max, scaleCapped: range.scaleCapped, dataMax: range.dataMax };
      updateLegendRange(min, max);
      lastRankingFeatures = filtered;
      updateRanking(filtered, min, max);
      updateViewMetaText(filtered, range);
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
      rankingMode = mode;
      syncRankingModeButtons();
      syncRankingScrollLayout();
      if (lastRankingSorted.length) {
        updateRanking(lastRankingSorted, lastRankingMinPct, lastRankingMaxPct);
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
      if (
        uiMode() === 'simple' &&
        simpleFocusContext &&
        simpleFocusContext.kind !== 'gemeinde'
      ) {
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

    function syncRankingRowHighlights() {
      const list = document.getElementById('ranking-list');
      if (!list) return;
      const focusIds =
        uiMode() === 'simple' && simpleFocusContext?.focusId
          ? new Set(simpleFocusHighlightIds(lastRankingFeatures, simpleFocusContext.focusId))
          : new Set();
      for (const li of list.querySelectorAll('li[data-ranking-id]')) {
        const id = li.dataset.rankingId;
        li.classList.toggle('ranking-row-selected', id === selectedFeatureId);
        li.classList.toggle(
          'ranking-row-focus',
          focusIds.has(id) && id !== selectedFeatureId,
        );
      }
      const selectedLi = selectedFeatureId
        ? list.querySelector('li[data-ranking-id="' + selectedFeatureId + '"]')
        : null;
      if (selectedLi) selectedLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      if (uiMode() !== 'simple' || !simpleFocusContext?.focusId || !regionIndex) {
        return { type: 'FeatureCollection', features: [] };
      }
      return highlightGeojsonForIds(
        simpleFocusHighlightIds(lastRankingFeatures, simpleFocusContext.focusId),
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

    function updateMapHighlights() {
      if (!map.getSource('regions')) return;
      ensureSimpleFocusHighlightLayer();
      ensureSelectedHighlightLayer();
    }

    function appendRankingRow(list, rank, f, minPct, maxPct, span) {
      const pct = f.properties.bikeSharePct;
      const li = document.createElement('li');
      const featureId = String(f.properties?.id ?? '');
      if (featureId) {
        li.dataset.rankingId = featureId;
        li.classList.add('ranking-row-clickable');
        li.title = 'Auf der Karte auswählen';
        li.addEventListener('click', () => selectRegionById(featureId, null, true));
      }
      const rankEl = document.createElement('span');
      rankEl.className = 'ranking-rank';
      rankEl.textContent = rank + '.';
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
      li.append(rankEl, name, track, pctEl);
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

    function rebuildRankIndex(features) {
      rankByFeatureId.clear();
      const withPct = [...features]
        .filter((f) => typeof f.properties?.bikeSharePct === 'number')
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

    function appendLengthRows(parent, title, rows, highlightKind) {
      if (!rows.length) return;
      const section = document.createElement('section');
      section.className = 'region-detail-section';
      const h4 = document.createElement('h4');
      h4.textContent = title;
      section.appendChild(h4);
      const ul = document.createElement('ul');
      ul.className = 'region-detail-rows';
      for (const row of rows) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = row.label;
        const km = document.createElement('span');
        km.className = 'km';
        km.textContent =
          TildaStats.formatStatKm(row.km, TildaStats.STAT_KM_BIKE_UI_DECIMALS) + ' km';
        li.append(label, km);
        if (highlightKind && row.id) bindOverlayHighlightRow(li, highlightKind, row.id);
        ul.appendChild(li);
      }
      section.appendChild(ul);
      parent.appendChild(section);
    }

    function appendTagLengthDetails(parent, title, rows, highlightKind) {
      if (!rows.length) return;
      const details = document.createElement('details');
      details.className = 'region-detail-tags';
      const summary = document.createElement('summary');
      summary.textContent = title + ' (' + rows.length + ')';
      details.appendChild(summary);
      const ul = document.createElement('ul');
      ul.className = 'region-detail-rows';
      for (const row of rows) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = row.label;
        const km = document.createElement('span');
        km.className = 'km';
        km.textContent =
          TildaStats.formatStatKm(row.km, TildaStats.STAT_KM_BIKE_UI_DECIMALS) + ' km';
        li.append(label, km);
        if (highlightKind && row.id) bindOverlayHighlightRow(li, highlightKind, row.id);
        ul.appendChild(li);
      }
      details.appendChild(ul);
      parent.appendChild(details);
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
      return name ? 'der Region ' + name : 'dieser Ansicht';
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
          'Um den Mittelwert (Median) ' +
            viewLabel +
            ' (' +
            formatUiPct(g.medianPct) +
            ' %) zu erreichen, müssten rund ',
          kmBike(g.medianGapKm) + ' km',
          ' Radinfrastruktur dazukommen.',
        );
        if (g.leaderName && g.leaderPct > g.medianPct + 0.05) {
          appendGapText(
            regionDetailGap,
            ' Bis zur Spitze (' +
              g.leaderName +
              ', ' +
              formatUiPct(g.leaderPct) +
              ' %): ',
            kmBike(g.leaderGapKm) + ' km',
            '.',
          );
        }
      } else {
        regionDetailGap.className = 'region-detail-gap region-detail-gap--ahead';
        regionDetailGap.textContent = g.atMedian
          ? 'Liegt im Mittelfeld ' + viewLabel + ' (Median ' + formatUiPct(g.medianPct) + ' %).'
          : 'Liegt über dem Median ' + viewLabel + ' (' + formatUiPct(g.medianPct) + ' %).';
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
      if (!peerGroupIndex || String(p.level) !== '8') return null;
      if (!(p.roadSumKm > 0) || typeof p.bikeSharePct !== 'number') return null;
      const key = peerGroupIndex.byId[p.id];
      if (!key) return null;
      const peers = allFeatures
        .filter((f) => peerGroupIndex.byId[f.properties?.id] === key)
        .map(enrichFeature)
        .map((f) => f.properties)
        .filter((q) => q.roadSumKm > 0 && typeof q.bikeSharePct === 'number');
      if (peers.length < MIN_BENCHMARK_REGIONS) return null;
      const bench = RankingDisplay.computeViewBenchmark(peers);
      if (!bench) return null;
      const ranked = peers.slice().sort((a, b) => b.bikeSharePct - a.bikeSharePct);
      const rank = ranked.findIndex((q) => q.id === p.id) + 1;
      if (!rank) return null;
      return {
        groupLabel: peerGroupIndex.groups[key] || 'vergleichbare Gemeinden',
        rank,
        total: ranked.length,
        medianPct: bench.medianPct,
        gapKm: RankingDisplay.bikelaneGapKm(p, bench.medianPct),
        behind: p.bikeSharePct < bench.medianPct - 0.05,
      };
    }

    function renderRegionPeerGap(p) {
      const s = demographicPeerSummary(p);
      regionDetailPeerGap.replaceChildren();
      if (!s) {
        regionDetailPeerGap.hidden = true;
        regionDetailPeerGap.className = 'region-detail-gap region-detail-gap--peer';
        return;
      }
      const kmBike = (km) => TildaStats.formatStatKm(km, TildaStats.STAT_KM_BIKE_UI_DECIMALS);
      const groupPhrase = 'Unter vergleichbaren Gemeinden (' + s.groupLabel + '): ';
      if (s.behind) {
        regionDetailPeerGap.className =
          'region-detail-gap region-detail-gap--peer region-detail-gap--behind';
        appendGapText(regionDetailPeerGap, groupPhrase, 'Platz ' + s.rank + ' von ' + s.total, '.');
        appendGapText(
          regionDetailPeerGap,
          ' Zum Median dieser Gruppe (' + formatUiPct(s.medianPct) + ' %) fehlen rund ',
          kmBike(s.gapKm) + ' km',
          '.',
        );
      } else {
        regionDetailPeerGap.className =
          'region-detail-gap region-detail-gap--peer region-detail-gap--ahead';
        appendGapText(
          regionDetailPeerGap,
          groupPhrase,
          'Platz ' + s.rank + ' von ' + s.total,
          ' – über dem Median (' + formatUiPct(s.medianPct) + ' %).',
        );
      }
      regionDetailPeerGap.hidden = false;
    }

    // Live historical trend, fetched on demand from the ohsome API (HeiGIT) — an OSM full-history
    // aggregation service. Approximate (its filter can't reach TILDA's exact bikelane
    // classification) so it's kept opt-in and clearly labelled, rather than baked into every
    // region's stats. Scoped to Landkreis/Gemeinde (level 6/8) to keep geometry payloads small.
    const OHSOME_ELEMENTS_LENGTH_URL = 'https://api.ohsome.org/v1/elements/length';
    const OHSOME_TREND_FIRST_YEAR = 2012;
    const OHSOME_ROAD_FILTER = 'highway=* and geometry:line';
    const OHSOME_BIKELANE_FILTER =
      '(highway=cycleway or cycleway=* or cycleway:both=* or cycleway:left=* or cycleway:right=* or bicycle_road=yes) and geometry:line';
    const trendCache = new Map(); // region id -> { years, sharePct } | 'error'
    let trendFeature = null;

    function regionSupportsTrend(feature) {
      const level = String(feature?.properties?.level ?? '');
      return (level === '6' || level === '8') && !!feature?.geometry;
    }

    async function fetchOhsomeSeries(bpolys, filter, signal) {
      const body = new URLSearchParams({
        bpolys: JSON.stringify(bpolys),
        filter,
        time: OHSOME_TREND_FIRST_YEAR + '-01-01/' + new Date().toISOString().slice(0, 10) + '/P1Y',
      });
      const res = await fetch(OHSOME_ELEMENTS_LENGTH_URL, { method: 'POST', body, signal });
      if (!res.ok) throw new Error('ohsome ' + res.status);
      const json = await res.json();
      return Array.isArray(json.result) ? json.result : [];
    }

    function buildTrendSparkline(values) {
      const w = 220;
      const h = 36;
      const pad = 2;
      const defined = values.filter((v) => v != null);
      const min = Math.min(...defined);
      const max = Math.max(...defined);
      const range = max - min || 1;
      const step = (w - pad * 2) / Math.max(1, values.length - 1);
      const points = values
        .map((v, i) => {
          if (v == null) return null;
          const x = pad + i * step;
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          return x.toFixed(1) + ',' + y.toFixed(1);
        })
        .filter((p) => p != null)
        .join(' ');
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      svg.setAttribute('class', 'region-detail-trend-sparkline');
      const poly = document.createElementNS(svgNs, 'polyline');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#1b6e4b');
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('stroke-linecap', 'round');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
      return svg;
    }

    function appendTrendNote(container) {
      const note = document.createElement('p');
      note.className = 'region-detail-trend-note';
      const ohsomeLink = document.createElement('a');
      ohsomeLink.href = 'https://api.ohsome.org';
      ohsomeLink.target = '_blank';
      ohsomeLink.rel = 'noopener noreferrer';
      ohsomeLink.textContent = 'ohsome API';
      const heigitLink = document.createElement('a');
      heigitLink.href = 'https://heigit.org';
      heigitLink.target = '_blank';
      heigitLink.rel = 'noopener noreferrer';
      heigitLink.textContent = 'HeiGIT';
      note.append(
        'Näherungswert aus dem OSM-Verlauf, nicht identisch mit der Zählung oben · ',
        ohsomeLink,
        ', ',
        heigitLink,
      );
      container.appendChild(note);
    }

    function renderRegionTrend(data, container) {
      const { years, sharePct } = data;
      regionDetailTrendBtn.hidden = true;
      container.hidden = false;
      container.replaceChildren();
      const valid = sharePct.filter((v) => v != null);
      if (valid.length < 2) {
        const p = document.createElement('p');
        p.className = 'region-detail-trend-note';
        p.textContent = 'Für dieses Gebiet liegen keine auswertbaren Verlaufsdaten vor.';
        container.appendChild(p);
        return;
      }
      container.appendChild(buildTrendSparkline(sharePct));
      const first = valid[0];
      const last = valid[valid.length - 1];
      const change = last - first;
      const dir = change > 0.2 ? 'gestiegen' : change < -0.2 ? 'gesunken' : 'kaum verändert';
      const summary = document.createElement('p');
      summary.className = 'region-detail-trend-summary';
      summary.textContent =
        'Grober Radinfra-Anteil ' +
        years[0] +
        '–' +
        years[years.length - 1] +
        ': ' +
        formatUiPct(first) +
        ' % → ' +
        formatUiPct(last) +
        ' % (' +
        dir +
        ').';
      container.appendChild(summary);
      appendTrendNote(container);
    }

    function renderTrendError(container) {
      regionDetailTrendBtn.hidden = false;
      regionDetailTrendBtn.disabled = false;
      regionDetailTrendBtn.textContent = 'Erneut versuchen';
      container.hidden = false;
      container.replaceChildren();
      const p = document.createElement('p');
      p.className = 'region-detail-trend-note region-detail-trend-error';
      p.textContent = 'Verlauf konnte nicht geladen werden (ohsome API nicht erreichbar).';
      container.appendChild(p);
    }

    async function loadRegionTrend(feature) {
      const id = String(feature.properties?.id ?? '');
      if (!id) return;
      regionDetailTrendBtn.disabled = true;
      regionDetailTrendBtn.textContent = 'Lädt …';
      regionDetailTrendResult.hidden = false;
      regionDetailTrendResult.replaceChildren();
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = controller && setTimeout(() => controller.abort(), 12000);
      try {
        const bpolys = { type: 'Feature', properties: {}, geometry: feature.geometry };
        const signal = controller ? controller.signal : undefined;
        const [roadSeries, bikeSeries] = await Promise.all([
          fetchOhsomeSeries(bpolys, OHSOME_ROAD_FILTER, signal),
          fetchOhsomeSeries(bpolys, OHSOME_BIKELANE_FILTER, signal),
        ]);
        const years = roadSeries.map((r) => Number(String(r.timestamp).slice(0, 4)));
        const sharePct = roadSeries.map((r, i) => {
          const road = r.value;
          const bike = bikeSeries[i] ? bikeSeries[i].value : 0;
          return road > 0 ? (bike / road) * 100 : null;
        });
        const data = { years, sharePct };
        trendCache.set(id, data);
        if (trendFeature === feature) renderRegionTrend(data, regionDetailTrendResult);
      } catch {
        trendCache.set(id, 'error');
        if (trendFeature === feature) renderTrendError(regionDetailTrendResult);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    function setupRegionTrend(feature) {
      trendFeature = feature;
      if (!regionSupportsTrend(feature)) {
        regionDetailTrend.hidden = true;
        return;
      }
      regionDetailTrend.hidden = false;
      regionDetailTrendBtn.hidden = false;
      regionDetailTrendBtn.disabled = false;
      regionDetailTrendBtn.textContent = 'Entwicklung seit ' + OHSOME_TREND_FIRST_YEAR + ' zeigen';
      regionDetailTrendResult.hidden = true;
      regionDetailTrendResult.replaceChildren();
      const id = String(feature.properties?.id ?? '');
      const cached = trendCache.get(id);
      if (cached === 'error') renderTrendError(regionDetailTrendResult);
      else if (cached) renderRegionTrend(cached, regionDetailTrendResult);
    }

    function showRegionDetail(feature, opts) {
      const freshSelection = !!(opts && opts.freshSelection);
      const p = feature.properties || {};
      const detailId = String(p.id ?? '');
      if (detailId) setSelectedFeatureId(detailId, feature);
      regionDetailTitle.textContent = p.name || p.id || 'Gebiet';
      const rankInfo = rankByFeatureId.get(p.id);
      const rankText = rankInfo
        ? 'Platz ' + rankInfo.rank + ' von ' + rankInfo.total + ' in dieser Ansicht'
        : 'Kein Rang (ohne Straßendaten in der Zählung)';
      const pct =
        p.roadSumKm > 0 && typeof p.bikeSharePct === 'number'
          ? formatUiPct(p.bikeSharePct) + ' %'
          : '–';
      regionDetailMeta.textContent =
        rankText +
        '\\n' +
        pct +
        ' · ' +
        TildaStats.formatStatKm(p.bikelaneSumKm, TildaStats.STAT_KM_BIKE_UI_DECIMALS) +
        ' km Rad / ' +
        TildaStats.formatStatKm(p.roadSumKm, TildaStats.STAT_KM_ROAD_UI_DECIMALS) +
        ' km Straße';
      renderRegionGap(p);
      renderRegionPeerGap(p);
      setupRegionTrend(feature);
      regionDetailBody.replaceChildren();
      const filter = readLengthClassFilterFromUi();
      appendLengthRows(
        regionDetailBody,
        'Straßen nach Klasse',
        TildaStats.listFilteredRoadClassLengths(p.road_length, filter),
      );
      if (uiMode() !== 'simple') {
        appendTagLengthDetails(
          regionDetailBody,
          'Einzelne Straßentypen',
          TildaStats.listFilteredHighwayTagLengths(p.road_length, filter),
        );
      }
      appendLengthRows(
        regionDetailBody,
        'Radinfrastruktur nach Klasse',
        TildaStats.listFilteredBikelaneClassLengths(p.bikelane_length, filter),
        'bikelane-class',
      );
      if (uiMode() !== 'simple') {
        appendTagLengthDetails(
          regionDetailBody,
          'Einzelne Radweg-Typen',
          TildaStats.listFilteredBikelaneTagLengths(p.bikelane_length, filter),
          'bikelane-tag',
        );
      }
      if (uiMode() !== 'simple') {
        const viewLink = document.createElement('p');
        viewLink.className = 'region-detail-view-link';
        const link = document.createElement('a');
        link.textContent = 'Vereinfachte Ansicht für dieses Gebiet';
        link.href = buildSimpleViewUrl(p.id, null);
        link.addEventListener('click', (e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigateToViewMode('simple', p.id);
        });
        viewLink.appendChild(link);
        regionDetailBody.appendChild(viewLink);
      }
      regionDetailEl.hidden = false;
      document.body.dataset.regionDetail = '1';
      placeRegionDetail();
      if (typeof sheetEnabled === 'function' && sheetEnabled()) {
        const wasPeek = sheetState() === 'peek';
        // setSheetState() always re-syncs the map itself; when the sheet is already open
        // (switching between regions without a peek->half transition) nothing else would.
        if (wasPeek) setSheetState('half');
        else syncMapViewport(true);
        // On a new selection show the card from its top (region name first), not wherever
        // scrollIntoView lands a tall card — but don't yank the user back up on a mere refresh.
        if ((wasPeek || freshSelection) && panelMain) panelMain.scrollTop = 0;
      } else if (freshSelection) {
        regionDetailEl.scrollIntoView?.({ block: 'nearest' });
      }
    }

    function setSelectedFeatureId(id, feature) {
      selectedFeatureId = id;
      selectedFeatureOverride =
        id && feature?.geometry && feature.properties?.id === id ? feature : null;
      updateMapHighlights();
      syncRankingRowHighlights();
    }

    function featureBboxInMapView(bbox) {
      if (!bbox.every(Number.isFinite)) return true;
      const bounds = map.getBounds();
      return (
        bounds.getWest() <= bbox[0] &&
        bounds.getSouth() <= bbox[1] &&
        bounds.getEast() >= bbox[2] &&
        bounds.getNorth() >= bbox[3]
      );
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

    function fitMapToFeature(feature, opts) {
      if (!feature?.geometry) return;
      const bbox = turf.bbox(feature);
      if (!bbox.every(Number.isFinite)) return;
      if (!(opts && opts.force) && featureBboxInMapView(bbox)) return;
      const inset = mapBottomInset();
      const maxZoom = opts && opts.zoomIn ? Math.max(map.getZoom(), 12) : map.getZoom();
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding: { top: 56, right: 40, bottom: Math.max(40, inset + 28), left: 40 },
          duration: opts && typeof opts.duration === 'number' ? opts.duration : 400,
          maxZoom,
        },
      );
    }

    /**
     * While a region is selected on the phone the sheet covers the lower part of the map:
     * pad the map's bottom by the sheet height and re-frame the selected region into the
     * strip that is still visible. Resets to 0 when nothing is selected.
     */
    function syncMapViewport(animate) {
      if (!map || typeof map.setPadding !== 'function') return;
      const selected = document.body.dataset.regionDetail
        ? selectedFeatureOverride || currentSelectedFeature()
        : null;
      // The sheet (even at peek) always occupies this much of the screen on mobile, so the
      // inset applies whether or not a region is selected — not doing so left regions under
      // the peek bar (e.g. southern Bavaria on a Deutschland view) untappable.
      const bottom = mapBottomInset();
      const currentPadding = typeof map.getPadding === 'function' ? map.getPadding() : null;
      const paddingChanged = !currentPadding || Math.abs((currentPadding.bottom || 0) - bottom) >= 2;
      if (paddingChanged) map.setPadding({ top: 0, right: 0, bottom, left: 0 });
      if (selected) {
        fitMapToFeature(selected, { force: true, zoomIn: true, duration: animate ? 420 : 0 });
      } else if (paddingChanged && animate && typeof map.easeTo === 'function') {
        map.easeTo({ padding: { top: 0, right: 0, bottom, left: 0 }, duration: 260 });
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
      showRegionDetail(feature, { freshSelection: true });
      // Desktop: only recentre when asked (ranking click) — showRegionDetail doesn't sync the
      // map itself there (sheetEnabled() is false). Phone: showRegionDetail already synced.
      if (panToMap && !(typeof sheetEnabled === 'function' && sheetEnabled())) {
        syncMapViewport(true);
      }
    }

    function clearRegionSelection() {
      clearOverlayLineHighlight();
      setSelectedFeatureId(null);
      regionDetailEl.hidden = true;
      delete document.body.dataset.regionDetail;
      placeRegionDetail();
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
      if (feature) {
        showRegionDetail(feature);
      } else {
        clearRegionSelection();
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
      if (feature) selectRegionById(regionId, null, true);
    }

    function bindRegionMapInteraction() {
      if (regionClickBound) return;
      regionClickBound = true;
      regionDetailClose.addEventListener('click', () => {
        if (typeof sheetEnabled === 'function' && sheetEnabled()) setSheetState('peek');
        else clearRegionSelection();
      });
      regionDetailTrendBtn.addEventListener('click', () => {
        if (trendFeature) loadRegionTrend(trendFeature);
      });
      map.on('click', 'regions-fill', (e) => {
        const f = e.features?.[0];
        if (!f?.properties?.id) return;
        selectRegionById(f.properties.id, f);
      });
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['regions-fill'] });
        if (!hits.length) clearRegionSelection();
      });
    }

    function updateRanking(features, minPct, maxPct) {
      const list = document.getElementById('ranking-list');
      const summary = document.getElementById('ranking-summary');
      const sorted = [...features].sort(compareByBikeShare);
      const withPct = sorted.filter((f) => typeof f.properties?.bikeSharePct === 'number');
      const span = Math.max(maxPct - minPct, 0.001);
      lastRankingSorted = sorted;
      lastRankingMinPct = minPct;
      lastRankingMaxPct = maxPct;
      rebuildRankIndex(sorted);

      const topN = currentRankingTopN() ?? DEFAULT_RANKING_TOP_N;
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
        note.textContent = withoutPct + ' ohne Straßendaten';
        list.appendChild(note);
      }
      syncRankingRowHighlights();
    }

    const map = new maplibregl.Map({
      container: 'map',
      style: CONFIG.basemapStyles[CONFIG.basemap],
      center: [11.5, 48.9],
      zoom: 7,
      preserveDrawingBuffer: true,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    function updatePanelSummaryPreview() {
      if (!panelSummaryPreview || !regionIndex) return;
      panelSummaryPreview.textContent = viewLabelForCurrentMode();
    }

    function navigateToViewMode(mode, focusId) {
      const params = new URLSearchParams(location.search);
      if (mode === 'simple') {
        if (uiMode() === 'expert') {
          syncViewScopeFromUi();
          savedExpertViewScope = {
            gebiet: gebietSelect.value,
            untergebiet: untergebietSelect.value || '',
            darstellung: darstellungSelect.value,
          };
        }
        const ctx = SimpleView.resolveFocusContext(focusId, regionIndex);
        const preset = ctx
          ? SimpleView.defaultSimplePresetForFocus(ctx, regionIndex)
          : 'de_landkreis_kreisfrei';
        params.set('ui', 'simple');
        params.set('focus', focusId || regionIndex.deutschlandId || RegionNav.DEUTSCHLAND_GEBIET);
        params.set('simple', preset);
        writeExpertScopeToUrlParams(params, savedExpertViewScope ?? currentViewScope);
      } else {
        const scope =
          savedExpertViewScope ??
          (focusId ? SimpleView.expertViewScopeFromFocus(focusId, regionIndex) : null);
        params.delete('ui');
        params.delete('focus');
        params.delete('simple');
        writeExpertScopeToUrlParams(params, scope);
      }
      appendViewerOptionsToUrl(params);
      const qs = params.toString();
      location.assign(location.pathname + (qs ? '?' + qs : ''));
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

    async function captureLiveMapCanvas() {
      map.triggerRepaint();
      await raceTimeout(new Promise((resolve) => map.once('idle', resolve)), 1500);
      const source = map.getCanvas();
      if (!source?.width) throw new Error('empty canvas');
      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext('2d').drawImage(source, 0, 0);
      return copy;
    }

    function bboxForCurrentView() {
      const filtered = filteredFeaturesForCurrentView().map(enrichFeature);
      const boundsFeatures = filtered.length
        ? { type: 'FeatureCollection', features: filtered }
        : { type: 'FeatureCollection', features: scopeBoundsFeaturesForCurrentView() };
      return turf.bbox(boundsFeatures);
    }

    function fitMapToCurrentView() {
      const bbox = bboxForCurrentView();
      if (bbox.every(Number.isFinite)) {
        // Reserve space for the bottom sheet even with nothing selected — on mobile it's
        // always on screen (at least at peek height), so without this the view's southern
        // edge can render behind it and become untappable.
        const inset = mapBottomInset();
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: { top: 48, right: 48, bottom: 48 + inset, left: 48 },
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
        map.resize();
        fitMapToCurrentView();
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
        fitMapToCurrentView();
        await waitForMapRender();
      }
    }

    async function downloadMapImage() {
      try {
        const canvas = await captureMapExportCanvas();
        triggerImageDownload(canvas.toDataURL('image/png'), imageFilename('karte'));
        showCopyViewLinkFeedback('Kartenbild gespeichert.');
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

    function combineShareCanvases(canvases) {
      const list = canvases.filter((c) => c?.width && c?.height);
      if (!list.length) return null;
      if (list.length === 1) return list[0];
      const width = Math.max(...list.map((c) => c.width));
      const height = list.reduce((sum, c) => sum + c.height, 0);
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      let y = 0;
      for (const canvas of list) {
        ctx.drawImage(canvas, Math.floor((width - canvas.width) / 2), y);
        y += canvas.height;
      }
      return out;
    }

    async function buildShareScreenshotAssets() {
      // Phone: share exactly the map the user is looking at. The off-screen 1080x1920
      // re-render (captureMapExportCanvas) is heavy and often comes back blank on
      // mobile; the ranking goes in the link, not the image.
      const liveMapOnly = isLikelyMobileShareDevice();
      const canvases = [];
      try {
        canvases.push(liveMapOnly ? await captureLiveMapCanvas() : await captureMapExportCanvas());
      } catch {
        /* Karte optional */
      }
      if (!liveMapOnly) {
        try {
          canvases.push(drawRankingExportCanvas());
        } catch {
          /* Rangliste optional */
        }
      }
      const files = [];
      for (const canvas of canvases) {
        const kind = files.length === 0 ? 'karte' : 'rangliste';
        files.push(await canvasToPngFile(canvas, imageFilename(kind)));
      }
      const combined = combineShareCanvases(canvases);
      const combinedFile = combined
        ? await canvasToPngFile(
            combined,
            imageFilename('karte').replace(/-karte\\.png$/i, '-ansicht.png'),
          )
        : null;
      return { files, combinedFile, canvases };
    }

    function canShareData(data) {
      if (typeof navigator.canShare !== 'function') return false;
      try {
        return navigator.canShare(data);
      } catch {
        return false;
      }
    }

    async function tryNativeShareWithFiles(files, text, url, title) {
      const attempts = isLikelyMobileShareDevice()
        ? [
            { files, title, text },
            { files, text },
            { files, title },
            { files },
            { files, title, text, url },
          ]
        : [
            { files, title, text, url },
            { files, title, text },
            { files, text },
            { files },
          ];
      for (const data of attempts) {
        if (!canShareData(data)) continue;
        try {
          await navigator.share(data);
          return true;
        } catch (err) {
          if (err?.name === 'AbortError') throw err;
        }
      }
      return false;
    }

    function shareFilesForDevice(files, combinedFile) {
      if (combinedFile) return [combinedFile];
      return files.length ? files : [];
    }

    function isLikelyMobileShareDevice() {
      return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function mapPolygonHoverEnabled() {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    async function copyShareMessageToClipboard(text, url) {
      const line = text + '\\n\\n' + url;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(line);
          return true;
        }
      } catch {
        /* fallback below */
      }
      return copyTextFallback(line);
    }

    async function shareViewWithScreenshots(fallbackApp) {
      const { url, title, text: baseText } = sharePayload();
      // Keep the link in the message body itself: many share targets accept files + text
      // but drop a separate url field, so the link would otherwise be lost.
      const text = baseText + '\\n\\n' + url;
      const mobile = isLikelyMobileShareDevice();
      showCopyViewLinkFeedback('Screenshots werden vorbereitet …');
      let files = [];
      let combinedFile = null;
      try {
        const assets = await buildShareScreenshotAssets();
        files = assets.files;
        combinedFile = assets.combinedFile;
      } catch {
        showCopyViewLinkFeedback('Screenshots konnten nicht erstellt werden.', true);
        if (fallbackApp && !mobile) shareViaApp(fallbackApp);
        return;
      }

      const shareFiles = shareFilesForDevice(files, combinedFile);
      const hadImages = shareFiles.length > 0;

      try {
        if (hadImages && (await tryNativeShareWithFiles(shareFiles, text, url, title))) {
          showCopyViewLinkFeedback('Geteilt.');
          return;
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }

      await copyShareMessageToClipboard(baseText, url);

      if (fallbackApp && !mobile) {
        shareViaApp(fallbackApp);
        showCopyViewLinkFeedback(
          hadImages
            ? 'Text kopiert. Bilder über die Karten-/Ranglisten-Buttons speichern oder erneut „Teilen“ nutzen.'
            : 'Text kopiert.',
        );
        return;
      }

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, text: baseText, url });
          showCopyViewLinkFeedback(
            hadImages
              ? mobile
                ? 'Link geteilt. Für Bilder erneut tippen – System-Teilen-Dialog nutzen.'
                : 'Link geteilt. Bilder über die Speichern-Buttons exportieren.'
              : 'Geteilt.',
          );
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }

      showCopyViewLinkFeedback(
        hadImages
          ? 'Teilen mit Bildern nicht verfügbar. Text wurde kopiert.'
          : 'Teilen nicht verfügbar. Text wurde kopiert.',
        true,
      );
    }

    function drawRankingExportCanvas() {
      const { width, height, padding } = RankingDisplay.PORTRAIT_EXPORT;
      const sorted = [...lastRankingFeatures].sort(compareByBikeShare);
      const withPct = sorted.filter((f) => typeof f.properties?.bikeSharePct === 'number');
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
        ctx.font = highlighted ? '600 30px system-ui, sans-serif' : '400 30px system-ui, sans-serif';
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
        triggerImageDownload(canvas.toDataURL('image/png'), imageFilename('rangliste'));
        showCopyViewLinkFeedback('Ranglistenbild gespeichert.');
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
    window.addEventListener('resize', updateVhUnit);

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
      // Invariant: peek = just the map. Collapsing the sheet drops any region selection,
      // so swipe-down / scrim-tap / Esc all double as "close the region stats".
      if (
        state === 'peek' &&
        document.body.dataset.regionDetail &&
        typeof clearRegionSelection === 'function'
      ) {
        clearRegionSelection();
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

    // On the phone the advanced settings (Zählung / Farben & Darstellung / Ansichts-Wechsel)
    // hide behind the "Einstellungen" button; on desktop they are always-visible sections.
    const settingsToggle = document.getElementById('settings-toggle');
    function setSettingsOpen(open) {
      if (open) {
        document.body.dataset.settingsOpen = '1';
        document.getElementById('count-classes-details')?.setAttribute('open', '');
        document.getElementById('color-options-details')?.setAttribute('open', '');
      } else {
        delete document.body.dataset.settingsOpen;
      }
      settingsToggle?.setAttribute('aria-expanded', String(!!open));
      notifyMapResize();
    }
    settingsToggle?.addEventListener('click', () => {
      const open = document.body.dataset.settingsOpen !== '1';
      setSettingsOpen(open);
      if (open && sheetEnabled() && sheetState() === 'peek') setSheetState('half');
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
        setSettingsOpen(false);
      }
      lockOpenSectionsForViewport();
      placeRegionDetail();
      notifyMapResize();
    }

    if (panelMain) {
      const panelSummary = panelMain.querySelector(':scope > summary');
      let sheetDrag = null;
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
        setSheetState(sheetState() === 'peek' ? 'half' : 'peek');
      });

      panelSummary?.addEventListener('pointerdown', (event) => {
        if (!sheetEnabled() || (event.button != null && event.button > 0)) return;
        sheetDrag = {
          startY: event.clientY,
          startH: panelMain.getBoundingClientRect().height,
          moved: false,
        };
        panelMain.classList.add('is-dragging');
        panelSummary.setPointerCapture?.(event.pointerId);
      });
      panelSummary?.addEventListener('pointermove', (event) => {
        if (!sheetDrag) return;
        const dy = sheetDrag.startY - event.clientY; // drag up => taller
        if (Math.abs(dy) > 4) sheetDrag.moved = true;
        const h = Math.min(window.innerHeight * 0.94, Math.max(52, sheetDrag.startH + dy));
        panelMain.style.height = h + 'px';
      });
      const endSheetDrag = (event) => {
        if (!sheetDrag) return;
        panelMain.classList.remove('is-dragging');
        panelSummary.releasePointerCapture?.(event.pointerId);
        const wasDrag = sheetDrag.moved;
        const frac = panelMain.getBoundingClientRect().height / window.innerHeight;
        panelMain.style.height = '';
        sheetDrag = null;
        if (!wasDrag) return; // a tap — handled by the click listener
        suppressSummaryClick = true;
        setSheetState(frac > 0.75 ? 'full' : frac > 0.2 ? 'half' : 'peek');
      };
      panelSummary?.addEventListener('pointerup', endSheetDrag);
      panelSummary?.addEventListener('pointercancel', endSheetDrag);

      // Keep <details> open on mobile (sheet height is driven by data-sheet, not [open]);
      // a stray native toggle (keyboard, etc.) just collapses the sheet to peek.
      panelMain.addEventListener('toggle', () => {
        if (sheetEnabled() && !panelMain.open) {
          panelMain.open = true;
          setSheetState('peek');
        }
        notifyMapResize();
      });

      sheetScrim?.addEventListener('click', () => setSheetState('peek'));
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !sheetEnabled()) return;
        if (sheetState() !== 'peek' || document.body.dataset.regionDetail) setSheetState('peek');
      });

      panelMobileMq.addEventListener('change', applyPanelViewportMode);
      applyPanelViewportMode();
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
      if (rankingDetails.open) params.set('ranking', 'open');
      else params.delete('ranking');
      if (rankingMode !== 'topflop') params.set('rankingMode', rankingMode);
      else params.delete('rankingMode');
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

    function buildShareUrl() {
      const params = new URLSearchParams();
      appendViewScopeToUrl(params);
      appendViewerOptionsToUrl(params);
      if (selectedFeatureId) params.set('region', selectedFeatureId);
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
          if (rankInfo) msg += ' – Platz ' + rankInfo.rank + ' von ' + rankInfo.total;
          msg += '.';
          if (behind) {
            msg +=
              ' Es fehlen rund ' +
              TildaStats.formatStatKm(g.medianGapKm, TildaStats.STAT_KM_BIKE_UI_DECIMALS) +
              ' km bis zum Mittelwert dieser Auswahl.';
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

    function openShareWindow(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    function shareViaApp(app) {
      const { url, title, text } = sharePayload();
      const line = text + '\\n\\n' + url;
      let target = '';
      switch (app) {
        case 'email':
          target =
            'mailto:?subject=' +
            encodeURIComponent(title + ' – ' + text) +
            '&body=' +
            encodeURIComponent(line);
          window.location.href = target;
          return;
        case 'whatsapp':
          target = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
          break;
        case 'telegram':
          target =
            'https://t.me/share/url?url=' +
            encodeURIComponent(url) +
            '&text=' +
            encodeURIComponent(text);
          break;
        case 'linkedin':
          target =
            'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url);
          break;
        case 'bluesky':
          target = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(text + ' ' + url);
          break;
        case 'twitter':
          target =
            'https://twitter.com/intent/tweet?url=' +
            encodeURIComponent(url) +
            '&text=' +
            encodeURIComponent(text);
          break;
        default:
          return;
      }
      openShareWindow(target);
    }

    async function nativeShareLink() {
      await shareViewWithScreenshots(null);
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

    function applyUrlOptions() {
      const params = urlParams();
      if (regionIndex) {
        const scope = resolveViewScopeFromUrl();
        applyViewScopeToUi(scope);
      }

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
      if (ranking != null && ranking !== '') {
        rankingDetails.open = parseBoolParam(ranking, true) || ranking === 'open';
      } else {
        rankingDetails.open = true;
      }
      const rankingModeParam = params.get('rankingMode');
      if (rankingModeParam === 'all' || rankingModeParam === 'topflop') {
        rankingMode = rankingModeParam;
        syncRankingModeButtons();
      }
      lastRankingViewAvailable = true;

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
          defaultScaleCapEnabledForView(),
        );
        lastScaleCapViewAllowed = viewShowsGemeindenLevelForCurrentView();
      } else {
        updateScaleCapDefaultForView();
      }
      const robustScale = params.get('robustScale') ?? params.get('ausreisser');
      if (robustScale != null && robustScale !== '') {
        scaleRobustEnabledCb.checked = parseBoolParam(
          robustScale,
          defaultRobustScaleEnabledForView(),
        );
      }
      syncScaleCapInputState();

      applyLengthClassFilterFromUrl(params);
      syncSimpleCountingNotice();

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
      updateColorScaleHint();
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

    function updateColorScaleHint() {
      if (!colorScaleHint) return;
      if (colorScaleSelect.value === 'colorblind') {
        colorScaleHint.textContent =
          'Niedrig → hoch als Orange, Gelb und Blau (ohne Rot–Grün-Verlauf).';
      } else {
        colorScaleHint.textContent = '';
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
          });
          map.on('mouseleave', 'regions-fill', () => {
            map.getCanvas().style.cursor = '';
            tooltip.style.display = 'none';
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
      }
      updateOverlayVisibility();
    }

    async function applyCurrentView() {
      syncViewScopeFromUi();
      syncViewModeLinks();
      // Normally already loaded in the background by now (see ensureExtraLevelsLoaded above);
      // this only kicks in if that fetch is still in flight or failed and gets retried here.
      if (
        DARSTELLUNGEN_NEEDING_EXTRA_LEVELS.has(currentViewScope.darstellung) &&
        !extraLevelsLoaded
      ) {
        setLoadStatus('Lade zusätzliche Gebiete …');
        try {
          await ensureExtraLevelsLoaded();
        } catch (err) {
          if (loadError) {
            loadError.style.display = 'block';
            loadError.textContent = String((err && err.message) || err);
          }
        }
        setLoadStatus('');
      }
      const filtered = filteredFeaturesForCurrentView().map(enrichFeature);
      const range = colorScaleRange(filtered);
      const { min, max } = range;
      document.getElementById('legend-min').textContent = formatUiPct(min) + ' %';
      document.getElementById('legend-max').textContent = formatUiPct(max) + ' %';
      lastRankingFeatures = filtered;
      updateRankingVisibility();
      updateScaleCapHint();
      updateRanking(filtered, min, max);
      updateViewMetaText(filtered, range);
      updatePanelSummaryPreview();
      refreshSelectedRegionIfNeeded();
      const geojson = { type: 'FeatureCollection', features: filtered };
      const labelMinZoom = labelMinZoomForView();

      const run = () => {
        addRegionLayers(geojson, min, max, labelMinZoom);
        // A region can be selected while this reruns for an unrelated reason (simple view
        // re-applies the view once its neighbor index finishes loading, a basemap swap
        // re-adds the layers, …). Re-fit to that region instead of the whole scope, or the
        // refit silently undoes the focus that was just put on it.
        if (document.body.dataset.regionDetail) {
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
      const center = map.getCenter();
      const zoom = map.getZoom();
      map.setStyle(CONFIG.basemapStyles[id]);
      map.once('idle', () => {
        map.jumpTo({ center, zoom });
        overlaysBound = false;
        void applyCurrentView();
      });
      const meta = CONFIG.basemapOptions.find((b) => b.id === id);
      basemapHint.textContent = meta?.description || '';
    }

    basemapSelect?.addEventListener('change', () => setBasemap(basemapSelect.value));
    colorScaleSelect?.addEventListener('change', () => {
      updateLegendBar(colorScaleSelect.value);
      updateColorScaleHint();
      syncOverlayColorInputsFromScale(colorScaleSelect.value);
      applyOverlayLineColors();
      updateRegionColors(lastPctRange.min, lastPctRange.max);
      if (lastRankingFeatures.length) {
        updateRanking(lastRankingFeatures, lastPctRange.min, lastPctRange.max);
      }
    });
    gebietSelect?.addEventListener('change', onGebietChange);
    untergebietSelect?.addEventListener('change', onUntergebietChange);
    darstellungSelect?.addEventListener('change', onDarstellungChange);
    if (simpleViewSelect) simpleViewSelect.addEventListener('change', onSimpleViewChange);
    const switchToExpertLink = document.getElementById('switch-to-expert-link');
    if (switchToExpertLink) {
      switchToExpertLink.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const focusId = simpleFocusContext?.focusId || regionIndex?.deutschlandId;
        navigateToViewMode('expert', focusId);
      });
    }
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
    syncCsvExportVisibility();
    for (const btn of rankingModeButtons) {
      btn.addEventListener('click', () => setRankingMode(btn.dataset.rankingMode));
    }
    syncRankingModeButtons();
    syncRankingScrollLayout();
    if (typeof navigator.share === 'function' && shareNativeBtn) {
      shareNativeBtn.hidden = false;
    }
    copyViewLinkBtn?.addEventListener('click', copyShareLink);
    shareMapImageBtn?.addEventListener('click', downloadMapImage);
    shareRankingImageBtn?.addEventListener('click', downloadRankingImage);
    shareNativeBtn?.addEventListener('click', nativeShareLink);
    document.getElementById('share-fab')?.addEventListener('click', nativeShareLink);
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

    function refreshViewAfterNeighborsLoaded() {
      if (!rawLoaded) return;
      if (uiMode() === 'simple' && simpleFocusContext) {
        populateSimpleViewSelect();
        void applyCurrentView();
        return;
      }
      if (
        uiMode() === 'simple' &&
        simpleFocusContext &&
        SimpleView.presetUsesNeighborFilter(simpleViewPreset)
      ) {
        void applyCurrentView();
      }
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

    function syncViewModeLinks() {
      const expertLink = document.getElementById('switch-to-expert-link');
      if (expertLink && simpleFocusContext?.focusId && regionIndex) {
        expertLink.href = buildExpertViewUrl(simpleFocusContext.focusId);
      }
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

    async function loadAllRegionFeaturesSync() {
      const data = await statsDataPromise;
      if (data.type === 'msgpack') {
        return StatsPack.decodeRegionFeatures(new Uint8Array(data.bytes));
      }
      return data.data.features || [];
    }

    async function init() {
      try {
        await statsReadyPromise;
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
        if (!isSimpleUiFromUrl()) {
          populateUntergebietSelect();
          await yieldToMain();
          populateDarstellungSelect();
        }
        initOverlayColorInputs();
        applyUrlOptions();
        await applyCurrentView();
        applySelectedRegionFromUrl();
        if (isSimpleUiFromUrl()) {
          void populateUntergebietSelect();
        }
        const loadNeighborsAfterPageReady = () => ensureNeighborsLoaded();
        if (document.readyState === 'complete') loadNeighborsAfterPageReady();
        else window.addEventListener('load', loadNeighborsAfterPageReady, { once: true });
      } catch (e) {
        loadError.style.display = 'block';
        loadError.textContent = String(e.message || e);
      }
    }

    void (async () => {
      try {
        await statsReadyPromise;
        await init();
      } catch (e) {
        if (loadError) {
          loadError.style.display = 'block';
          loadError.textContent = String(e.message || e);
        }
      }
    })();
  </script>
</body>
</html>
`
}
