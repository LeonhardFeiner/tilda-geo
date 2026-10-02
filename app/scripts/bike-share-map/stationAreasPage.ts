import { buildBasemapStyleJson } from './basemaps'

/** Network modes and what routing/station_access.py wrote for each ('straight' only has km). */
export type StationAccessFiles = Partial<
  Record<'foot' | 'bike' | 'car' | 'straight', Array<'areas' | 'minutes' | 'km'>>
>

export type StationAreasPageInput = {
  /** Path of the stations JSON next to the page (written by buildViewer from stations.json). */
  dataHref: string
  /** "Stand" of the station data. */
  dataDateLabel: string
  /**
   * Folder (relative, with trailing slash) holding `<mode>-<kind>.json` from
   * routing/station_access.py, and which of those exist. Empty when that step hasn't been run —
   * the page then only offers the straight-line areas.
   */
  accessBaseHref: string
  accessFiles: StationAccessFiles
}

/** Same order as STATION_CATEGORIES in fetchStations.ts. */
const CATEGORY_LABELS = ['Bahnhof / Haltepunkt', 'U-Bahn', 'S-/Stadtbahn', 'Straßenbahn', 'Fähre']

/** Band upper bounds; same as BAND_MINUTES / BAND_KM in station_access.py. */
const BAND_MINUTES = [5, 10, 15, 20, 30, 45, 60]
const BAND_KM = [0.5, 1, 2, 3, 5, 10, 20]
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
 * Unlisted page: which station is the nearest from every place, and how far it is. Two choices:
 * how you get there (Luftlinie, zu Fuß, Rad, Auto) and what to show (areas per station, minutes,
 * km).
 * - Straight-line areas are a Voronoi diagram computed in the browser with d3-delaunay, so the
 *   category checkboxes can redraw it. Cells are computed in Web Mercator metres; over the few km
 *   between neighbouring stations the scale difference is well under 1 %, so the borders are the
 *   real equal-distance lines for practical purposes.
 * - Everything else is precomputed for all stations by routing/station_access.py.
 */
export function stationAreasPageHtml({
  dataHref,
  dataDateLabel,
  accessBaseHref,
  accessFiles,
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
      --accent: #1f5fae;
      --shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme='light']) {
        --bg: #1e2125;
        --fg: #eceef0;
        --muted: #a9afb6;
        --border: #3a3f45;
        --accent: #7fb0ec;
        --shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      }
    }
    :root[data-theme='dark'] {
      --bg: #1e2125;
      --fg: #eceef0;
      --muted: #a9afb6;
      --border: #3a3f45;
      --accent: #7fb0ec;
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
      width: 320px;
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
    fieldset:disabled { opacity: 0.5; }
    legend { font-weight: 600; margin-bottom: 4px; padding: 0; }
    label { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
    label .count { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
    /* Segmented choice: one row of buttons per question. */
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
    .seg input:disabled + span { opacity: 0.4; cursor: not-allowed; }
    #hover {
      min-height: 2.9em;
      border-top: 1px solid var(--border);
      padding-top: 8px;
      margin-top: 4px;
    }
    #hover strong { display: block; }
    .dot-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; margin: 0 0 8px; }
    .dot-legend .title { flex-basis: 100%; color: var(--muted); }
    .dot-legend i { display: inline-block; border-radius: 50%; background: #1c1f23; border: 1px solid #fff; box-shadow: 0 0 0 1px #1c1f2333; vertical-align: middle; margin-right: 4px; }
    .dot-legend i.unknown { background: #9aa0a6; }
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
      <fieldset id="ways" class="seg" hidden>
        <legend>Unterwegs</legend>
        <label><input type="radio" name="mit" value="luftlinie" checked><span>Luftlinie</span></label>
        <label><input type="radio" name="mit" value="foot"><span>Zu Fuß</span></label>
        <label><input type="radio" name="mit" value="bike"><span>Rad</span></label>
        <label><input type="radio" name="mit" value="car"><span>Auto</span></label>
      </fieldset>
      <fieldset id="kinds" class="seg" hidden>
        <legend>Zeigen</legend>
        <label><input type="radio" name="zeigen" value="areas" checked><span>Einzugsgebiete</span></label>
        <label><input type="radio" name="zeigen" value="minutes"><span>Zeit</span></label>
        <label><input type="radio" name="zeigen" value="km"><span>Entfernung</span></label>
      </fieldset>
      <p id="explain"></p>
      <div id="band-legend" class="band-legend" hidden></div>
      <p id="assumptions" class="muted" hidden></p>
      <p class="muted">Bushaltestellen sind nicht enthalten.</p>
      <fieldset id="categories"><legend>Stationen</legend></fieldset>
      <div id="hover" class="muted">Über die Karte fahren oder tippen, um die nächste Station zu sehen.</div>
      <div id="dot-legend" class="dot-legend" hidden></div>
      <p class="muted" style="margin-top:8px">Daten: © OpenStreetMap-Mitwirkende${dataDateLabel ? `, Stand ${dataDateLabel}` : ''}; Einwohner: Zensus 2022<span id="timetable-credit" hidden>; Fahrplan: DELFI e.V. / gtfs.de (CC BY 4.0)</span>.</p>
    </div>
  </details>
  <script src="https://cdn.jsdelivr.net/npm/d3-delaunay@6.0.4/dist/d3-delaunay.min.js"></script>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script>
  (async function () {
    const CATEGORY_LABELS = ${JSON.stringify(CATEGORY_LABELS)};
    const DEFAULT_CATEGORIES = [0, 1, 2, 3, 4];
    // Fallback band bounds; each band file carries its own ("bins" — minutes differ by mode).
    const BANDS = { minutes: ${JSON.stringify(BAND_MINUTES)}, km: ${JSON.stringify(BAND_KM)} };
    let currentBins = null;
    const BAND_COLOURS = ${JSON.stringify(BAND_COLOURS)};
    const ACCESS_BASE = ${JSON.stringify(accessBaseHref)};
    const ACCESS_FILES = ${JSON.stringify(accessFiles)};
    // How you get there: label for sentences ("… mit dem Rad …") and the assumptions behind it.
    const WAYS = {
      luftlinie: { phrase: 'in Luftlinie', note: '' },
      foot: {
        phrase: 'zu Fuß',
        note: 'Annahmen: 4,5 km/h auf Straßen, Geh- und Feldwegen (keine Autobahnen und Kraftfahrstraßen), Treppen langsamer. Keine Einbahnstraßen, keine Ampeln.',
      },
      bike: {
        phrase: 'mit dem Rad',
        note: 'Annahmen: rund 18 km/h auf Straßen und Radwegen, langsamer auf Feldwegen und unbefestigt, Schieben (5 km/h) auf Gehwegen ohne Radfreigabe und gegen Einbahnstraßen; Straßen mit Radwegbenutzungspflicht nur über den Radweg. Keine Steigungen, keine Ampeln.',
      },
      car: {
        phrase: 'mit dem Auto',
        note: 'Annahmen: Tempolimit (sonst typischer Wert je Straßenart) mit Abschlag für Kreuzungen, Einbahnstraßen, keine Feld- und Waldwege ohne Freigabe, Anliegerstraßen nur langsam. Kein Verkehr, keine Parkplatzsuche; vom Ort zur Straße und von der Straße zur Station zu Fuß.',
      },
    };
    // Planar graphs colour with at most 6 colours under smallest-last ordering, so neighbours
    // never share one.
    const PALETTE = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#c9a400', '#a65628', '#f781bf'];
    const R = 6378137;
    const D2R = Math.PI / 180;
    const project = (lon, lat) => [R * lon * D2R, R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2))];
    const unproject = (x, y) => [
      Math.round((x / R / D2R) * 1e5) / 1e5,
      Math.round(((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D2R) * 1e5) / 1e5,
    ];
    const deNum = (v, digits) => v.toLocaleString('de-DE', { maximumFractionDigits: digits });

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
    // Departures on one weekday per station (null: no timetable station matched), as s[4].
    const hasDepartures = Array.isArray(data.departures);
    if (hasDepartures) stations.forEach((s, i) => (s[4] = data.departures[i]));
    // Dot radius at zoom 10; area grows with departures, so radius with the square root.
    const dotRadius = (dep) => (dep == null ? 2.2 : 1.6 + Math.sqrt(dep) * 0.26);
    const departuresDay = hasDepartures
      ? new Date(data.departuresDate.slice(0, 4) + '-' + data.departuresDate.slice(4, 6) + '-' + data.departuresDate.slice(6))
          .toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
      : '';

    const has = (way, kind) => (ACCESS_FILES[way === 'luftlinie' ? 'straight' : way] || []).includes(kind);
    const available = (way, kind) => (way === 'luftlinie' ? kind === 'areas' || has(way, kind) : has(way, kind));

    const params = new URLSearchParams(location.search);
    let way = WAYS[params.get('mit')] && params.get('mit') !== 'luftlinie' ? params.get('mit') : 'luftlinie';
    let kind = ['minutes', 'km'].includes(params.get('zeigen')) ? params.get('zeigen') : 'areas';
    if (!available(way, kind)) {
      way = 'luftlinie';
      kind = 'areas';
    }
    const fromUrl = params.get('arten');
    const active = new Set(
      fromUrl === null ? DEFAULT_CATEGORIES : fromUrl.split(',').map(Number).filter(Number.isInteger),
    );

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

    // Straight line: Voronoi of the stations of the ticked categories. The Delaunay triangulation
    // also answers "nearest station to this point" for the hover.
    let shown = [];
    let delaunay = null;
    function buildCells() {
      shown = stations.filter((s) => active.has(s[2]));
      const points = shown.map((s) => project(s[0], s[1]));
      const cells = { type: 'FeatureCollection', features: [] };
      delaunay = null;
      if (points.length) {
        delaunay = d3.Delaunay.from(points);
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
        }
      }
      return cells;
    }

    let allDelaunay = null;
    function allStationsDelaunay() {
      allDelaunay ||= d3.Delaunay.from(stations.map((s) => project(s[0], s[1])));
      return allDelaunay;
    }

    function dotsFor(list) {
      return {
        type: 'FeatureCollection',
        features: list.map((s, i) => ({
          type: 'Feature',
          id: i,
          properties: hasDepartures
            ? { r: dotRadius(s[4]), known: s[4] != null, order: -(s[4] ?? 0) }
            : { r: 2, known: true, order: 0 },
          geometry: { type: 'Point', coordinates: [s[0], s[1]] },
        })),
      };
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

    function bandLabel(b, k) {
      const bounds = currentBins || BANDS[k];
      const unit = k === 'minutes' ? ' min' : ' km';
      if (b === 0) return 'unter ' + deNum(bounds[0], 1) + unit;
      if (b >= bounds.length) return 'über ' + deNum(bounds[bounds.length - 1], 1) + unit;
      return deNum(bounds[b - 1], 1) + '–' + deNum(bounds[b], 1) + unit;
    }

    // Each file is fetched once and kept; switching back is instant.
    const fileCache = new Map();
    function loadFile(name) {
      if (!fileCache.has(name)) fileCache.set(name, fetch(ACCESS_BASE + name + '.json').then((r) => r.json()));
      return fileCache.get(name);
    }
    const EMPTY = { type: 'FeatureCollection', features: [] };

    function onMapReady(fn) {
      if (map.isStyleLoaded()) fn();
      else map.once('load', fn);
    }

    onMapReady(() => {
      const fillColour = ['match', ['%', ['get', 'c'], PALETTE.length], ...PALETTE.flatMap((c, i) => [i, c]), '#888'];
      const hoverOpacity = ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0.32];
      map.addSource('cells', { type: 'geojson', data: buildCells() });
      map.addSource('net-areas', { type: 'geojson', data: EMPTY, generateId: true });
      map.addSource('bands', { type: 'geojson', data: EMPTY });
      map.addSource('dots', { type: 'geojson', data: dotsFor(shown) });
      map.addSource('mask', { type: 'geojson', data: outsideMask(data.germany) });
      map.addLayer({
        id: 'bands-fill',
        type: 'fill',
        source: 'bands',
        paint: {
          'fill-color': ['match', ['get', 'b'], ...BAND_COLOURS.flatMap((c, i) => [i, c]), '#888'],
          'fill-opacity': 0.55,
        },
      });
      for (const [id, source] of [['cells', 'cells'], ['net', 'net-areas']]) {
        map.addLayer({
          id: id + '-fill',
          type: 'fill',
          source,
          paint: { 'fill-color': fillColour, 'fill-opacity': id === 'cells' ? hoverOpacity : 0.32 },
        });
        map.addLayer({
          id: id + '-line',
          type: 'line',
          source,
          paint: {
            'line-color': '#333',
            'line-opacity': 0.55,
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 10, 1, 14, 1.6],
          },
        });
      }
      // A station's network area can be several pieces; hovering one highlights all of them.
      const NO_STATION = ['==', ['get', 's'], -1];
      map.addLayer({ id: 'net-highlight', type: 'fill', source: 'net-areas', filter: NO_STATION, paint: { 'fill-color': fillColour, 'fill-opacity': 0.6 } });
      map.addLayer({
        id: 'net-highlight-line',
        type: 'line',
        source: 'net-areas',
        filter: NO_STATION,
        paint: { 'line-color': '#1c1f23', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 10, 2, 14, 3] },
      });
      map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.85 } });
      map.addLayer({ id: 'germany-line', type: 'line', source: 'mask', paint: { 'line-color': '#333', 'line-width': 1.2 } });
      map.addLayer({
        id: 'dots',
        type: 'circle',
        source: 'dots',
        // Busy stations underneath, so a small stop next to a big one stays visible.
        layout: { 'circle-sort-key': ['get', 'order'] },
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            5, ['*', 0.35, ['get', 'r']],
            10, ['get', 'r'],
            14, ['*', 1.6, ['get', 'r']],
          ],
          'circle-color': ['case', ['get', 'known'], '#1c1f23', '#9aa0a6'],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0, 10, 1],
        },
      });
      if (hasDepartures) {
        const dotLegend = document.getElementById('dot-legend');
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = 'Punktgröße: Abfahrten am ' + departuresDay + ' (Bahn, U-Bahn, Tram, Fähre)';
        dotLegend.append(title);
        for (const dep of [10, 100, 1000, null]) {
          const item = document.createElement('span');
          const dot = document.createElement('i');
          const size = 2 * dotRadius(dep);
          dot.style.width = dot.style.height = size + 'px';
          if (dep == null) dot.className = 'unknown';
          item.append(dot, dep == null ? 'kein Fahrplan gefunden' : dep.toLocaleString('de-DE'));
          dotLegend.append(item);
        }
        dotLegend.hidden = false;
        document.getElementById('timetable-credit').hidden = false;
      }

      // ---- hover
      const hoverBox = document.getElementById('hover');
      let hovered = null;
      let hoveredStation = -1;
      function setHovered(next) {
        if (hovered) map.setFeatureState(hovered, { hover: false });
        hovered = next;
        if (next) map.setFeatureState(next, { hover: true });
      }
      // All pieces of one station's network area; the fill only where areas are the view, the
      // outline also over the time/distance bands.
      function setHoveredStation(index) {
        if (index === hoveredStation) return;
        hoveredStation = index;
        const filter = ['==', ['get', 's'], index];
        map.setFilter('net-highlight', filter);
        map.setFilter('net-highlight-line', filter);
      }
      function showStation(s, detail) {
        hoverBox.innerHTML = '';
        const strong = document.createElement('strong');
        strong.textContent = s ? s[3] || 'Station ohne Namen' : 'Nächste Station';
        hoverBox.appendChild(strong);
        hoverBox.appendChild(document.createTextNode((s ? CATEGORY_LABELS[s[2]] + ' · ' : '') + detail));
        if (s && hasDepartures) {
          const dep = document.createElement('span');
          dep.style.display = 'block';
          dep.textContent =
            s[4] == null ? 'Keine Fahrplandaten gefunden' : s[4].toLocaleString('de-DE') + ' Abfahrten am ' + departuresDay;
          hoverBox.appendChild(dep);
        }
      }
      function describe(e) {
        const here = [e.lngLat.lng, e.lngLat.lat];
        if (way === 'luftlinie') {
          // The km bands cover all stations; the areas only the ticked categories.
          const [list, tri] = kind === 'areas' ? [shown, delaunay] : [stations, allStationsDelaunay()];
          if (!tri) return;
          const i = tri.find(...project(here[0], here[1]));
          const s = list[i];
          setHovered(kind === 'areas' ? { source: 'cells', id: i } : null);
          const km = distanceKm(here, [s[0], s[1]]);
          showStation(s, deNum(km, km < 10 ? 1 : 0) + ' km Luftlinie');
          return;
        }
        const area = map.queryRenderedFeatures(e.point, { layers: ['net-fill'] })[0];
        const band = kind === 'areas' ? null : map.queryRenderedFeatures(e.point, { layers: ['bands-fill'] })[0];
        setHoveredStation(area ? area.properties.s : -1);
        if (!area && !band) return;
        const s = area ? stations[area.properties.s] : null;
        showStation(s, WAYS[way].phrase + (band ? ' ' + bandLabel(band.properties.b, kind) : ''));
      }
      map.on('mousemove', describe);
      map.on('click', describe);
      map.on('mouseout', () => {
        setHovered(null);
        setHoveredStation(-1);
      });

      // ---- straight-line categories
      fieldset.addEventListener('change', () => {
        active.clear();
        for (const box of fieldset.querySelectorAll('input:checked')) active.add(Number(box.value));
        setHovered(null);
        map.getSource('cells').setData(buildCells());
        if (way === 'luftlinie') map.getSource('dots').setData(dotsFor(shown));
        syncUrl();
      });

      // ---- the two choices
      const ways = document.getElementById('ways');
      const kinds = document.getElementById('kinds');
      const legend = document.getElementById('band-legend');
      const explain = document.getElementById('explain');
      const assumptions = document.getElementById('assumptions');

      function syncUrl() {
        const url = new URL(location.href);
        const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
        set('mit', way === 'luftlinie' ? '' : way);
        set('zeigen', kind === 'areas' ? '' : kind);
        const list = [...active].sort().join(',');
        if (list === DEFAULT_CATEGORIES.join(',')) url.searchParams.delete('arten');
        else url.searchParams.set('arten', list);
        history.replaceState(null, '', url);
      }

      function explainText() {
        const p = WAYS[way].phrase;
        if (kind === 'areas') {
          return way === 'luftlinie'
            ? 'Jede Farbfläche umfasst alle Orte, die näher an ihrer Station liegen als an jeder anderen. Die Grenze zwischen zwei Flächen ist überall gleich weit von beiden Stationen entfernt – in Luftlinie, nicht entlang von Wegen.'
            : 'Jede Farbfläche umfasst alle Orte, von denen aus ihre Station ' + p + ' am schnellsten erreichbar ist – entlang von Straßen und Wegen. Wald, Flüsse, Bahnlinien und fehlende Querungen verschieben die Grenzen gegenüber der Luftlinie.';
        }
        if (kind === 'minutes') return 'Wie viele Minuten man von jedem Ort aus ' + p + ' zur nächsten Station braucht.';
        return way === 'luftlinie'
          ? 'Wie weit es von jedem Ort aus in Luftlinie zur nächsten Station ist.'
          : 'Wie weit es von jedem Ort aus ' + p + ' zur nächsten Station ist – auf dem schnellsten Weg, entlang von Straßen und Wegen.';
      }

      function syncControls() {
        for (const input of ways.querySelectorAll('input')) {
          input.checked = input.value === way;
          input.disabled = input.value !== 'luftlinie' && !(ACCESS_FILES[input.value] || []).length;
        }
        for (const input of kinds.querySelectorAll('input')) {
          input.checked = input.value === kind;
          input.disabled = !available(way, input.value);
          input.closest('label').title = input.disabled ? 'In Luftlinie gibt es keine Fahrzeit' : '';
        }
        explain.textContent = explainText();
        assumptions.textContent = WAYS[way].note;
        assumptions.hidden = !WAYS[way].note;
        fieldset.disabled = !(way === 'luftlinie' && kind === 'areas');
        legend.hidden = kind === 'areas';
      }

      function renderLegend() {
        if (kind !== 'areas') {
          legend.replaceChildren(
            ...BAND_COLOURS.flatMap((c, b) => {
              const swatch = document.createElement('i');
              swatch.style.background = c;
              const text = document.createElement('span');
              text.textContent = bandLabel(b, kind);
              return [swatch, text];
            }),
          );
        }
      }

      let applying = 0;
      async function apply() {
        const ticket = ++applying;
        setHovered(null);
        syncControls();
        syncUrl();
        const straight = way === 'luftlinie';
        const fileWay = straight ? 'straight' : way;
        const [areas, bands] = await Promise.all([
          straight ? null : loadFile(fileWay + '-areas'),
          kind === 'areas' ? null : loadFile(fileWay + '-' + kind),
        ]);
        if (ticket !== applying) return; // a newer choice won while this one was loading
        currentBins = bands?.bins || null;
        renderLegend();
        setHoveredStation(-1);
        const show = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
        show('cells-fill', straight && kind === 'areas');
        show('cells-line', straight && kind === 'areas');
        // Network areas stay queryable (invisible) under the bands, for the station in the hover.
        map.getSource('net-areas').setData(areas || EMPTY);
        show('net-fill', !straight);
        map.setPaintProperty('net-fill', 'fill-opacity', kind === 'areas' ? 0.32 : 0);
        show('net-highlight', !straight && kind === 'areas');
        show('net-highlight-line', !straight);
        show('net-line', !straight && kind === 'areas');
        map.getSource('bands').setData(bands || EMPTY);
        show('bands-fill', kind !== 'areas');
        map.getSource('dots').setData(dotsFor(straight && kind === 'areas' ? shown : stations));
      }

      const anyNetwork = Object.keys(ACCESS_FILES).length > 0;
      ways.hidden = !anyNetwork;
      kinds.hidden = !anyNetwork;
      ways.addEventListener('change', () => {
        way = ways.querySelector('input:checked').value;
        // Zeit has no straight-line counterpart; Entfernung is the closest.
        if (!available(way, kind)) kind = kind === 'minutes' && available(way, 'km') ? 'km' : 'areas';
        apply();
      });
      kinds.addEventListener('change', () => {
        kind = kinds.querySelector('input:checked').value;
        apply();
      });
      apply();
    });
  })();
  </script>
</body>
</html>
`
}
