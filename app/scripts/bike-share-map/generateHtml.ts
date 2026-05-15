import type { FeatureCollection } from 'geojson'
import { TILDA_BIKELANES_TILES } from './constants'
import type { MapScopeConfig } from './types'

export function generateMapHtml(
  regions: FeatureCollection,
  scope: MapScopeConfig,
  generatedAt: string,
) {
  const stats = regions.features
    .map((f) => f.properties?.bikeSharePct)
    .filter((v) => typeof v === 'number')
  const minPct = stats.length ? Math.min(...stats) : 0
  const maxPct = stats.length ? Math.max(...stats) : 20
  const labelMinZoom = scope.labelMinZoom ?? 11
  const bikelanesMinZoom = scope.bikelanesMinZoom ?? 10

  const config = {
    regions,
    center: [scope.center.lng, scope.center.lat],
    zoom: scope.zoom,
    minPct,
    maxPct,
    bikelanesTiles: TILDA_BIKELANES_TILES,
    title: scope.title,
    labelMinZoom,
    bikelanesMinZoom,
    generatedAt,
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
      border-top: 3px solid #c41a1a;
      vertical-align: middle;
      margin-right: 6px;
    }
    .meta { font-size: 11px; color: #666; }
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
    <div class="legend">
      <strong>Hintergrund</strong>
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span id="legend-min"></span>
        <span id="legend-max"></span>
      </div>
      <p><span class="swatch-line"></span>Radinfrastruktur (TILDA bikelanes, ab Zoom ${bikelanesMinZoom})</p>
    </div>
    <p class="meta" id="meta"></p>
  </div>
  <div id="tooltip"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
    const CONFIG = ${JSON.stringify(config)};

    document.getElementById('legend-min').textContent = CONFIG.minPct.toFixed(1) + ' %';
    document.getElementById('legend-max').textContent = CONFIG.maxPct.toFixed(1) + ' %';
    document.getElementById('meta').textContent =
      'Erzeugt ' + CONFIG.generatedAt + ' · Basemap OSM · Daten © OpenStreetMap / tilda-geo.de';

    const map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: CONFIG.center,
      zoom: CONFIG.zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      map.addSource('regions', { type: 'geojson', data: CONFIG.regions });

      map.addSource('bikelanes', {
        type: 'vector',
        tiles: [CONFIG.bikelanesTiles],
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
            CONFIG.minPct, '#f7fcf5',
            (CONFIG.minPct + CONFIG.maxPct) / 2, '#74c476',
            CONFIG.maxPct, '#006d2c',
          ],
          'fill-opacity': 0.72,
        },
      });

      map.addLayer({
        id: 'bikelanes-lines',
        type: 'line',
        source: 'bikelanes',
        'source-layer': 'bikelanes',
        minzoom: CONFIG.bikelanesMinZoom,
        paint: {
          'line-color': '#c41a1a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2, 16, 3.5],
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: 'regions-outline',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': '#1a1a1a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 0.8, 12, 1.2],
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
    });
  </script>
</body>
</html>
`
}
