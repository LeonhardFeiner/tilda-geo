import type { FeatureCollection } from 'geojson'
import { BASEMAP_OPTIONS, buildBasemapStyleJson, type BasemapId } from './basemaps'
import { PROJECT_LEAD, TILDA_BIKELANES_TILES, TILDA_ROADS_TILES } from './constants'
import type { MapScopeConfig } from './types'

export function generateMapHtml(
  regions: FeatureCollection,
  scope: MapScopeConfig,
  generatedAt: string,
  basemapId: BasemapId,
) {
  const stats = regions.features
    .map((f) => f.properties?.bikeSharePct)
    .filter((v) => typeof v === 'number')
  const minPct = stats.length ? Math.min(...stats) : 0
  const maxPct = stats.length ? Math.max(...stats) : 20
  const labelMinZoom = scope.labelMinZoom ?? 11
  const bikelanesMinZoom = scope.bikelanesMinZoom ?? 10

  const basemapStyles = Object.fromEntries(
    BASEMAP_OPTIONS.map((b) => [b.id, buildBasemapStyleJson(b.id)]),
  )

  const config = {
    regions,
    center: [scope.center.lng, scope.center.lat],
    zoom: scope.zoom,
    minPct,
    maxPct,
    bikelanesTiles: TILDA_BIKELANES_TILES,
    roadsTiles: TILDA_ROADS_TILES,
    title: scope.title,
    labelMinZoom,
    bikelanesMinZoom,
    generatedAt,
    basemap: basemapId,
    basemapStyles,
    basemapOptions: BASEMAP_OPTIONS,
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${scope.title} – Radinfrastruktur</title>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
    #map { position: absolute; inset: 0; }
    .panel {
      position: absolute;
      z-index: 2;
      top: 12px;
      left: 12px;
      max-width: min(380px, calc(100vw - 24px));
      padding: 12px 14px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      line-height: 1.45;
    }
    .panel h1 { margin: 0 0 6px; font-size: 16px; }
    .panel p { margin: 0 0 8px; color: #333; }
    .panel label { display: block; font-size: 13px; margin: 8px 0 4px; font-weight: 600; }
    .panel select {
      width: 100%;
      font-size: 13px;
      padding: 4px 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
    }
    .basemap-hint { font-size: 11px; color: #666; margin-top: 4px; }
    .legend {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #ddd;
    }
    .legend-bar {
      height: 12px;
      border-radius: 3px;
      background: linear-gradient(to right, #f7fcf5, #006d2c);
      margin: 6px 0 4px;
    }
    .legend-labels {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #555;
    }
    .swatch-line {
      display: inline-block;
      width: 28px;
      height: 0;
      border-top: 3px solid #b71c1c;
      vertical-align: middle;
      margin-right: 6px;
    }
    .view-meta { font-size: 11px; color: #666; margin-top: 8px; }
    .footer {
      font-size: 11px; color: #888; margin-top: 6px; padding-top: 6px;
      border-top: 1px solid #eee; line-height: 1.5;
    }
    #tooltip {
      position: absolute;
      z-index: 3;
      pointer-events: none;
      display: none;
      padding: 6px 8px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 12px;
      max-width: 320px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="panel">
    <h1>${scope.title}</h1>
    <p>Flächenfarbe: Anteil Radinfrastruktur an Straßenlänge (<code>bikelane_sum / road_sum</code>, km). ${regions.features.length} Gebiete.</p>
    <label for="basemap-select">Hintergrundkarte</label>
    <select id="basemap-select"></select>
    <p class="basemap-hint" id="basemap-hint"></p>
    <div style="display:flex;gap:16px;margin:8px 0">
      <label style="display:flex;align-items:center;gap:6px;font-weight:normal"><input type="checkbox" id="toggle-bikelanes" checked /> Radwege</label>
      <label style="display:flex;align-items:center;gap:6px;font-weight:normal"><input type="checkbox" id="toggle-roads" /> Straßen</label>
    </div>
    <div class="legend">
      <strong>Flächenfarbe (Gemeinden)</strong>
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span id="legend-min"></span>
        <span id="legend-max"></span>
      </div>
      <p><span class="swatch-line"></span>Radwege (ab Zoom ${bikelanesMinZoom})</p>
    </div>
    <p class="footer">
      Erzeugt ${generatedAt} · Daten © OpenStreetMap / tilda-geo.de · Projektverantwortlich: ${PROJECT_LEAD}
    </p>
  </div>
  <div id="tooltip"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const CONFIG = ${JSON.stringify(config)};

    const basemapSelect = document.getElementById('basemap-select');
    const basemapHint = document.getElementById('basemap-hint');
    const toggleBikelanes = document.getElementById('toggle-bikelanes');
    const toggleRoads = document.getElementById('toggle-roads');

    function setLayerVisibility(id, visible) {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
    function updateOverlayVisibility() {
      setLayerVisibility('bikelanes-casing', toggleBikelanes.checked);
      setLayerVisibility('bikelanes-lines', toggleBikelanes.checked);
      setLayerVisibility('roads-lines', toggleRoads.checked);
    }
    for (const opt of CONFIG.basemapOptions) {
      const el = document.createElement('option');
      el.value = opt.id;
      el.textContent = opt.label;
      if (opt.id === CONFIG.basemap) el.selected = true;
      basemapSelect.appendChild(el);
    }
    function updateBasemapHint() {
      const meta = CONFIG.basemapOptions.find((b) => b.id === basemapSelect.value);
      basemapHint.textContent = meta ? meta.description : '';
    }
    updateBasemapHint();

    document.getElementById('legend-min').textContent = CONFIG.minPct.toFixed(1) + ' %';
    document.getElementById('legend-max').textContent = CONFIG.maxPct.toFixed(1) + ' %';

    const map = new maplibregl.Map({
      container: 'map',
      style: CONFIG.basemapStyles[CONFIG.basemap],
      center: CONFIG.center,
      zoom: CONFIG.zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    let overlaysReady = false;

    function addOverlays() {
      if (map.getSource('regions')) return;

      map.addSource('regions', { type: 'geojson', data: CONFIG.regions });
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
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'bikeSharePct'], 0],
            CONFIG.minPct, '#e8f5e9',
            (CONFIG.minPct + CONFIG.maxPct) / 2, '#43a047',
            CONFIG.maxPct, '#1b5e20',
          ],
          'fill-opacity': 0.78,
        },
      });

      map.addLayer({
        id: 'roads-lines',
        type: 'line',
        source: 'roads',
        'source-layer': 'roads',
        minzoom: CONFIG.bikelanesMinZoom,
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
        minzoom: CONFIG.bikelanesMinZoom,
        layout: { visibility: toggleBikelanes.checked ? 'visible' : 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4, 16, 5.5],
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'bikelanes-lines',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: CONFIG.bikelanesMinZoom,
        layout: { visibility: toggleBikelanes.checked ? 'visible' : 'none' },
        paint: {
          'line-color': '#b71c1c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2, 16, 3.5],
          'line-opacity': 1,
        },
      });

      map.addLayer({
        id: 'regions-outline',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': '#263238',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1, 12, 1.4],
        },
      });

      map.addLayer({
        id: 'regions-labels',
        type: 'symbol',
        source: 'regions',
        minzoom: CONFIG.labelMinZoom,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#111',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5,
        },
      });

      overlaysReady = true;
      toggleBikelanes.addEventListener('change', updateOverlayVisibility);
      toggleRoads.addEventListener('change', updateOverlayVisibility);
    }

    function fitToRegions() {
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of CONFIG.regions.features) {
        if (feature.geometry.type === 'Polygon') {
          for (const ring of feature.geometry.coordinates) {
            for (const coord of ring) bounds.extend(coord);
          }
        } else if (feature.geometry.type === 'MultiPolygon') {
          for (const poly of feature.geometry.coordinates) {
            for (const ring of poly) {
              for (const coord of ring) bounds.extend(coord);
            }
          }
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 56, maxZoom: CONFIG.zoom + 2 });
      }
    }

    function setBasemap(id) {
      overlaysReady = false;
      map.setStyle(CONFIG.basemapStyles[id]);
      map.once('idle', () => {
        addOverlays();
        if (!map._fittedOnce) {
          fitToRegions();
          map._fittedOnce = true;
        }
      });
      updateBasemapHint();
    }

    basemapSelect.addEventListener('change', () => setBasemap(basemapSelect.value));

    map.on('load', () => {
      addOverlays();
      fitToRegions();
      map._fittedOnce = true;

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
    });

  </script>
</body>
</html>
`
}
