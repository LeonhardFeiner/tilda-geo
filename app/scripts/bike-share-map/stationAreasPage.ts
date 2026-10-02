import { buildBasemapStyleJson } from './basemaps'

export type StationAreasPageInput = {
  /** Path of the stations JSON next to the page (written by buildViewer from stations.json). */
  dataHref: string
  /** "Stand" of the station data. */
  dataDateLabel: string
  /**
   * Bike areas/time bands from routing/station_access.py (GeoJSON next to the page), or null
   * when that step hasn't been run — the page then only offers the straight-line view.
   */
  bikeAreasHref: string | null
  bikeBandsHref: string | null
}

/** Same order as STATION_CATEGORIES in fetchStations.ts. */
const CATEGORY_LABELS = ['Bahnhof / Haltepunkt', 'U-Bahn', 'S-/Stadtbahn', 'Straßenbahn', 'Fähre']

/** Upper bounds (minutes) of the bike time bands; same as BAND_MINUTES in station_access.py. */
const BAND_MINUTES = [5, 10, 15, 20, 30, 45, 60]
const BAND_COLOURS = [
  '#1a9850',
  '#66bd63',
  '#a6d96a',
  '#fee08b',
  '#fdae61',
  '#f46d43',
  '#d73027',
  '#762a83',
]

/**
 * Unlisted page: one coloured area per station, covering every point that is closer to that
 * station than to any other. Two ways of measuring:
 * - straight line ("Luftlinie"): a Voronoi diagram, computed in the browser with d3-delaunay so
 *   the category checkboxes can redraw it. Cells are computed in Web Mercator metres; over the
 *   few km between neighbouring stations the scale difference is well under 1 %, so the borders
 *   are the real equal-distance lines for practical purposes.
 * - by bike along the path network: precomputed for all stations by routing/station_access.py,
 *   as areas per station and as travel-time bands.
 */
export function stationAreasPageHtml({
  dataHref,
  dataDateLabel,
  bikeAreasHref,
  bikeBandsHref,
}: StationAreasPageInput) {
  const style = JSON.stringify(buildBasemapStyleJson('light'))
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Nächste Station</title>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff;
      --fg: #1c1f23;
      --muted: #5a6068;
      --border: #d5d8dc;
      --shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme='light']) {
        --bg: #1e2125;
        --fg: #eceef0;
        --muted: #a9afb6;
        --border: #3a3f45;
        --shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      }
    }
    :root[data-theme='dark'] {
      --bg: #1e2125;
      --fg: #eceef0;
      --muted: #a9afb6;
      --border: #3a3f45;
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
      width: 300px;
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
    .body { padding: 0 14px 12px; }
    p { margin: 0 0 8px; }
    .muted { color: var(--muted); font-size: 12px; }
    fieldset { border: 0; padding: 0; margin: 0 0 8px; }
    legend { font-weight: 600; margin-bottom: 4px; padding: 0; }
    label { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
    label .count { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
    #hover {
      min-height: 2.9em;
      border-top: 1px solid var(--border);
      padding-top: 8px;
      margin-top: 4px;
    }
    #hover strong { display: block; }
    fieldset:disabled { opacity: 0.5; }
    .band-legend { display: grid; grid-template-columns: 14px 1fr; gap: 3px 6px; align-items: center; font-size: 12px; margin: 0 0 8px; }
    .band-legend i { width: 14px; height: 10px; border-radius: 2px; }
    [hidden] { display: none !important; }
    @media (max-width: 600px) {
      #panel { top: auto; bottom: 28px; left: 16px; right: 16px; width: auto; max-height: 50vh; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <details id="panel" open>
    <summary>Nächste Station</summary>
    <div class="body">
      <fieldset id="modes" hidden>
        <legend>Messen</legend>
        <label><input type="radio" name="modus" value="luftlinie" checked> Luftlinie</label>
        <label><input type="radio" name="modus" value="rad"> Mit dem Rad – Einzugsgebiete</label>
        <label><input type="radio" name="modus" value="zeit"> Mit dem Rad – Fahrzeit</label>
      </fieldset>
      <p id="explain-luftlinie">Jede Farbfläche umfasst alle Orte, die näher an <em>ihrer</em> Station liegen als an jeder anderen. Die Grenze zwischen zwei Flächen ist überall gleich weit von beiden Stationen entfernt – in Luftlinie, nicht entlang von Wegen.</p>
      <p id="explain-rad" hidden>Jede Farbfläche umfasst alle Orte, von denen aus <em>ihre</em> Station mit dem Rad am schnellsten erreichbar ist – entlang von Straßen und Wegen. Wald, Flüsse und Autobahnen ohne Querung verschieben die Grenzen gegenüber der Luftlinie.</p>
      <p id="explain-zeit" hidden>Wie viele Minuten man von jedem Ort aus mit dem Rad zur nächsten Station braucht.</p>
      <div id="band-legend" class="band-legend" hidden></div>
      <p id="explain-profile" class="muted" hidden>Annahmen: rund 18 km/h auf Straßen und Radwegen, langsamer auf Feldwegen und unbefestigt, Schieben (5 km/h) auf Gehwegen ohne Radfreigabe und gegen Einbahnstraßen. Keine Steigungen, keine Ampeln. Alle Stationsarten.</p>
      <p class="muted">Bushaltestellen sind nicht enthalten.</p>
      <fieldset id="categories"><legend>Stationen</legend></fieldset>
      <div id="hover" class="muted">Über die Karte fahren oder tippen, um die nächste Station zu sehen.</div>
      <p class="muted" style="margin-top:8px">Daten: © OpenStreetMap-Mitwirkende${dataDateLabel ? `, Stand ${dataDateLabel}` : ''}.</p>
    </div>
  </details>
  <script src="https://cdn.jsdelivr.net/npm/d3-delaunay@6.0.4/dist/d3-delaunay.min.js"></script>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
  (async function () {
    const CATEGORY_LABELS = ${JSON.stringify(CATEGORY_LABELS)};
    const DEFAULT_CATEGORIES = [0, 1, 2, 3, 4];
    // Planar graphs colour with at most 6 colours under smallest-last ordering, so neighbours
    // never share one.
    const BAND_MINUTES = ${JSON.stringify(BAND_MINUTES)};
    const BAND_COLOURS = ${JSON.stringify(BAND_COLOURS)};
    const BIKE_AREAS_HREF = ${JSON.stringify(bikeAreasHref)};
    const BIKE_BANDS_HREF = ${JSON.stringify(bikeBandsHref)};
    const PALETTE = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#c9a400', '#a65628', '#f781bf'];
    const R = 6378137;
    const D2R = Math.PI / 180;
    const project = (lon, lat) => [R * lon * D2R, R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2))];
    const unproject = (x, y) => [
      Math.round((x / R / D2R) * 1e5) / 1e5,
      Math.round(((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D2R) * 1e5) / 1e5,
    ];

    const map = new maplibregl.Map({
      container: 'map',
      style: ${style},
      bounds: [[5.8, 47.2], [15.1, 55.1]],
      hash: 'karte',
      maxZoom: 17,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const data = await (await fetch(${JSON.stringify(dataHref)})).json();
    const stations = data.stations;

    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('arten');
    const active = new Set(
      fromUrl === null ? DEFAULT_CATEGORIES : fromUrl.split(',').map(Number).filter(Number.isInteger),
    );

    const modeParam = params.get('modus');
    let mode = BIKE_AREAS_HREF && (modeParam === 'rad' || modeParam === 'zeit') ? modeParam : 'luftlinie';

    const counts = CATEGORY_LABELS.map(() => 0);
    for (const s of stations) counts[s[2]]++;
    const fieldset = document.getElementById('categories');
    CATEGORY_LABELS.forEach((label, i) => {
      const el = document.createElement('label');
      el.innerHTML =
        '<input type="checkbox" value="' + i + '"' + (active.has(i) ? ' checked' : '') + '> ' +
        label + '<span class="count">' + counts[i].toLocaleString('de-DE') + '</span>';
      fieldset.appendChild(el);
    });

    function colourCells(n, neighbours) {
      const degree = new Int32Array(n);
      const buckets = [];
      for (let v = 0; v < n; v++) {
        degree[v] = neighbours[v].length;
        (buckets[degree[v]] ||= new Set()).add(v);
      }
      const removed = new Uint8Array(n);
      const order = [];
      for (let k = 0; k < n; k++) {
        let d = 0;
        while (!buckets[d] || buckets[d].size === 0) d++;
        const v = buckets[d].values().next().value;
        buckets[d].delete(v);
        removed[v] = 1;
        order.push(v);
        for (const u of neighbours[v]) {
          if (removed[u]) continue;
          buckets[degree[u]].delete(u);
          degree[u]--;
          (buckets[degree[u]] ||= new Set()).add(u);
        }
      }
      const colour = new Int8Array(n).fill(-1);
      for (let k = order.length - 1; k >= 0; k--) {
        const v = order[k];
        const used = new Set();
        for (const u of neighbours[v]) if (colour[u] >= 0) used.add(colour[u]);
        let c = 0;
        while (used.has(c)) c++;
        colour[v] = c;
      }
      return colour;
    }

    let shown = [];
    function buildCells() {
      shown = stations.filter((s) => active.has(s[2]));
      const points = shown.map((s) => project(s[0], s[1]));
      const cells = { type: 'FeatureCollection', features: [] };
      const dots = { type: 'FeatureCollection', features: [] };
      if (points.length) {
        const delaunay = d3.Delaunay.from(points);
        const [minX, minY] = project(2, 44);
        const [maxX, maxY] = project(19, 58);
        const voronoi = delaunay.voronoi([minX, minY, maxX, maxY]);
        const neighbours = points.map((_, i) => Array.from(delaunay.neighbors(i)));
        const colour = colourCells(points.length, neighbours);
        for (let i = 0; i < points.length; i++) {
          const ring = voronoi.cellPolygon(i);
          if (!ring) continue;
          cells.features.push({
            type: 'Feature',
            id: i,
            properties: { c: colour[i] % PALETTE.length },
            geometry: { type: 'Polygon', coordinates: [ring.map(([x, y]) => unproject(x, y))] },
          });
          dots.features.push({
            type: 'Feature',
            id: i,
            properties: {},
            geometry: { type: 'Point', coordinates: [shown[i][0], shown[i][1]] },
          });
        }
      }
      return { cells, dots };
    }

    // Everything outside Germany is washed out: a world polygon with Germany's rings cut out.
    function outsideMask(germany) {
      const polygons = germany.type === 'Polygon' ? [germany.coordinates] : germany.coordinates;
      const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      return {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [world, ...polygons.map((p) => p[0])] },
      };
    }

    function distanceKm(a, b) {
      const dLat = (b[1] - a[1]) * D2R;
      const dLon = (b[0] - a[0]) * D2R;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2;
      return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
    }

    function bandLabel(b) {
      if (b === 0) return 'unter ' + BAND_MINUTES[0] + ' min';
      if (b >= BAND_MINUTES.length) return 'über ' + BAND_MINUTES[BAND_MINUTES.length - 1] + ' min';
      return BAND_MINUTES[b - 1] + '–' + BAND_MINUTES[b] + ' min';
    }

    function onMapReady(fn) {
      if (map.isStyleLoaded()) fn();
      else map.once('load', fn);
    }

    onMapReady(() => {
      const { cells, dots } = buildCells();
      const fillColour = ['match', ['%', ['get', 'c'], PALETTE.length], ...PALETTE.flatMap((c, i) => [i, c]), '#888'];
      map.addSource('cells', { type: 'geojson', data: cells });
      map.addSource('dots', { type: 'geojson', data: dots });
      map.addSource('mask', { type: 'geojson', data: outsideMask(data.germany) });
      map.addLayer({
        id: 'cells-fill',
        type: 'fill',
        source: 'cells',
        paint: {
          'fill-color': fillColour,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0.32],
        },
      });
      map.addLayer({
        id: 'cells-line',
        type: 'line',
        source: 'cells',
        paint: {
          'line-color': '#333',
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 10, 1, 14, 1.6],
        },
      });
      map.addLayer({
        id: 'mask',
        type: 'fill',
        source: 'mask',
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.85 },
      });
      map.addLayer({
        id: 'germany-line',
        type: 'line',
        source: 'mask',
        paint: { 'line-color': '#333', 'line-width': 1.2 },
      });
      map.addLayer({
        id: 'dots',
        type: 'circle',
        source: 'dots',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 3, 14, 5],
          'circle-color': '#1c1f23',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0, 10, 1],
        },
      });

      const hoverBox = document.getElementById('hover');
      let hovered = null;
      function setHovered(next) {
        if (hovered) map.setFeatureState(hovered, { hover: false });
        hovered = next;
        if (next) map.setFeatureState(next, { hover: true });
      }
      function showStation(s, detail) {
        hoverBox.innerHTML = '';
        const strong = document.createElement('strong');
        strong.textContent = s[3] || 'Station ohne Namen';
        hoverBox.appendChild(strong);
        hoverBox.appendChild(document.createTextNode(CATEGORY_LABELS[s[2]] + ' · ' + detail));
      }
      function describe(e) {
        if (mode === 'luftlinie') {
          const hit = map.queryRenderedFeatures(e.point, { layers: ['cells-fill'] })[0];
          if (!hit) return setHovered(null);
          setHovered({ source: 'cells', id: hit.id });
          const s = shown[Number(hit.id)];
          const km = distanceKm([e.lngLat.lng, e.lngLat.lat], [s[0], s[1]]);
          showStation(s, km.toLocaleString('de-DE', { maximumFractionDigits: km < 10 ? 1 : 0 }) + ' km Luftlinie');
          return;
        }
        const area = map.queryRenderedFeatures(e.point, { layers: ['bike-fill'] })[0];
        const band = map.queryRenderedFeatures(e.point, { layers: ['bands-fill'] })[0];
        if (!area && !band) return setHovered(null);
        setHovered(mode === 'rad' && area ? { source: 'bike', id: area.id } : null);
        const time = band ? 'mit dem Rad ' + bandLabel(band.properties.b) : 'mit dem Rad';
        if (area) showStation(stations[area.properties.s], time);
        else hoverBox.textContent = time;
      }
      map.on('mousemove', describe);
      map.on('click', describe);
      map.on('mouseout', () => setHovered(null));

      fieldset.addEventListener('change', () => {
        active.clear();
        for (const box of fieldset.querySelectorAll('input:checked')) active.add(Number(box.value));
        setHovered(null);
        const next = buildCells();
        map.getSource('cells').setData(next.cells);
        map.getSource('dots').setData(next.dots);
        const url = new URL(location.href);
        const list = [...active].sort().join(',');
        if (list === DEFAULT_CATEGORIES.join(',')) url.searchParams.delete('arten');
        else url.searchParams.set('arten', list);
        history.replaceState(null, '', url);
      });

      // ---- bike views: loaded on first use (several MB), then just toggled
      const legend = document.getElementById('band-legend');
      BAND_COLOURS.forEach((c, b) => {
        const swatch = document.createElement('i');
        swatch.style.background = c;
        const text = document.createElement('span');
        text.textContent = bandLabel(b);
        legend.append(swatch, text);
      });

      let bikeLoaded = null;
      function loadBike() {
        bikeLoaded ||= Promise.all([
          fetch(BIKE_AREAS_HREF).then((r) => r.json()),
          fetch(BIKE_BANDS_HREF).then((r) => r.json()),
        ]).then(([areas, bands]) => {
          map.addSource('bike', { type: 'geojson', data: areas, generateId: true });
          map.addSource('bands', { type: 'geojson', data: bands });
          map.addLayer(
            {
              id: 'bands-fill',
              type: 'fill',
              source: 'bands',
              paint: {
                'fill-color': ['match', ['get', 'b'], ...BAND_COLOURS.flatMap((c, i) => [i, c]), '#888'],
                'fill-opacity': 0,
              },
            },
            'mask',
          );
          map.addLayer(
            {
              id: 'bike-fill',
              type: 'fill',
              source: 'bike',
              paint: {
                'fill-color': fillColour,
                'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0.32],
              },
            },
            'mask',
          );
          map.addLayer(
            {
              id: 'bike-line',
              type: 'line',
              source: 'bike',
              paint: {
                'line-color': '#333',
                'line-opacity': 0.55,
                'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 10, 1, 14, 1.6],
              },
            },
            'mask',
          );
        });
        return bikeLoaded;
      }

      const allDots = {
        type: 'FeatureCollection',
        features: stations.map((s, i) => ({
          type: 'Feature',
          id: i,
          properties: {},
          geometry: { type: 'Point', coordinates: [s[0], s[1]] },
        })),
      };

      async function applyMode() {
        setHovered(null);
        const straight = mode === 'luftlinie';
        for (const id of ['luftlinie', 'rad', 'zeit']) {
          document.getElementById('explain-' + id).hidden = id !== mode;
        }
        legend.hidden = mode !== 'zeit';
        document.getElementById('explain-profile').hidden = straight;
        fieldset.disabled = !straight;
        for (const id of ['cells-fill', 'cells-line']) {
          map.setLayoutProperty(id, 'visibility', straight ? 'visible' : 'none');
        }
        if (straight) {
          map.getSource('dots').setData(buildCells().dots);
        } else {
          await loadBike();
          map.getSource('dots').setData(allDots);
          map.setLayoutProperty('bike-fill', 'visibility', 'visible');
          map.setPaintProperty('bike-fill', 'fill-opacity', mode === 'rad'
            ? ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0.32]
            : 0);
          map.setLayoutProperty('bike-line', 'visibility', mode === 'rad' ? 'visible' : 'none');
          map.setPaintProperty('bands-fill', 'fill-opacity', mode === 'zeit' ? 0.55 : 0);
        }
        if (bikeLoaded && straight) {
          for (const id of ['bike-fill', 'bike-line']) map.setLayoutProperty(id, 'visibility', 'none');
          map.setPaintProperty('bands-fill', 'fill-opacity', 0);
        }
        const url = new URL(location.href);
        if (straight) url.searchParams.delete('modus');
        else url.searchParams.set('modus', mode);
        history.replaceState(null, '', url);
      }

      const modes = document.getElementById('modes');
      if (BIKE_AREAS_HREF && BIKE_BANDS_HREF) {
        modes.hidden = false;
        modes.querySelector('input[value="' + mode + '"]').checked = true;
        modes.addEventListener('change', () => {
          mode = modes.querySelector('input:checked').value;
          applyMode();
        });
        if (mode !== 'luftlinie') applyMode();
      }
    });
  })();
  </script>
</body>
</html>
`
}
