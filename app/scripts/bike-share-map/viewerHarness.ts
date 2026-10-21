import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'
import { generateViewerHtml } from './generateViewerHtml'

/**
 * Boots the viewer page in jsdom. The page is generated from the current source
 * (generateViewerHtml), so it can never be a stale build; its bundles and its one big inline
 * script run for real, against the committed data files in output/viewer.
 * Only what a browser provides and jsdom does not is stood in for: MapLibre (no WebGL), fetch
 * from local files, matchMedia, a few DOM gaps.
 *
 * Why: the inline script is a template string, so tsc and lint never see it, and a stray `\n`
 * has left the live site blank twice. Anything that stops the page from booting fails here.
 */

const viewerDir = join(dirname(fileURLToPath(import.meta.url)), 'output', 'viewer')

// Same order as the <script src> tags in index.html (MapLibre is vendored next to them).
const BUNDLES = [
  'statsClassSums.js',
  'regionNavigation.js',
  'statsMsgpack.js',
  'simpleView.js',
  'regionSearch.js',
  'rankingDisplay.js',
]

export type ShareCall = { title?: string; text?: string; url?: string; files?: unknown[] }
export type ViewerWindow = Window &
  typeof globalThis & {
    __calls: string[][]
    /** Every URL the page fetched, in order (relative to the viewer folder). */
    __fetches: string[]
    __shares: ShareCall[]
    __clipboard: string[]
    /** The stubbed map instance, to fire map events (e.g. a failing basemap tile) from a test. */
    __map: { fire: (type: string, event?: object) => void }
  }

export type ViewerPage = {
  window: ViewerWindow
  /** Uncaught errors, console.error output and unhandled rejections. Empty on a healthy page. */
  errors: string[]
  /** Camera calls the page made on the (stubbed) map: fitBounds / easeTo / jumpTo / setPadding. */
  cameraCalls: () => string[]
  waitFor: (condition: () => boolean, what: string, timeoutMs?: number) => Promise<void>
  q: <T extends Element = HTMLElement>(selector: string) => T
  qAll: (selector: string) => HTMLElement[]
  close: () => void
}

// A MapLibre stand-in that keeps a real Web Mercator camera, so the page's reveal / fit logic
// runs on real numbers. It records the camera calls on window.__calls.
const MAPLIBRE_STUB = `
(() => {
  const record = (...c) => window.__calls.push(c.map(String));
  function makeMap(opts) {
    const handlers = {};
    const sources = new Map();
    const layers = new Map();
    let padding = { top: 0, bottom: 0, left: 0, right: 0 };
    const cam = { lng: 10, lat: 51, z: 6 };
    const mx = (lng) => (lng + 180) / 360;
    const my = (lat) =>
      (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;
    const world = () => 512 * Math.pow(2, cam.z);
    const container = typeof opts.container === 'string' ? document.getElementById(opts.container) : opts.container;
    const size = () => ({ w: window.innerWidth, h: window.innerHeight });
    const origin = () => {
      const { w, h } = size();
      return { x: (padding.left + (w - padding.right)) / 2, y: (padding.top + (h - padding.bottom)) / 2 };
    };
    const canvas = document.createElement('canvas');
    canvas.className = 'maplibregl-canvas';
    container.appendChild(canvas);
    container.classList.add('maplibregl-map');
    const handler = () => ({ enable() {}, disable() {}, isEnabled() { return true; } });
    let idleTimer = null;
    let inIdle = false;
    const scheduleIdle = () => {
      if (idleTimer || inIdle) return;
      idleTimer = setTimeout(() => {
        idleTimer = null;
        inIdle = true;
        try { base.fire('idle'); } finally { inIdle = false; }
      }, 5);
    };
    const base = {
      on(t, a, b) { const f = b || a; (handlers[t] ||= []).push(f); return this; },
      once(t, a, b) { const f = b || a; const w = (...x) => { this.off(t, w); f(...x); }; return this.on(t, w); },
      off(t, f) { handlers[t] = (handlers[t] || []).filter((h) => h !== f); return this; },
      fire(t, e = {}) {
        for (const h of (handlers[t] || []).slice()) {
          try { h({ type: t, target: proxy, ...e }); } catch (err) { console.error(err); }
        }
      },
      triggerRepaint() { scheduleIdle(); },
      resize() { return proxy; },
      isStyleLoaded() { return true; },
      loaded() { return true; },
      areTilesLoaded() { return true; },
      getSource(id) { return sources.get(id); },
      addSource(id, s) { sources.set(id, { ...s, setData() {} }); },
      removeSource(id) { sources.delete(id); },
      getLayer(id) { return layers.get(id); },
      addLayer(l) { layers.set(l.id, l); },
      removeLayer(id) { layers.delete(id); },
      getStyle() { return { layers: [...layers.values()], sources: Object.fromEntries(sources) }; },
      getBounds() { return { getWest: () => 5, getEast: () => 16, getSouth: () => 47, getNorth: () => 55, toArray: () => [[5, 47], [16, 55]], contains: () => true }; },
      getCanvas() { return canvas; },
      getCanvasContainer() { return container; },
      getContainer() { return container; },
      getCenter() { return { lng: cam.lng, lat: cam.lat, toArray() { return [cam.lng, cam.lat]; } }; },
      getZoom() { return cam.z; },
      getBearing() { return 0; },
      getPitch() { return 0; },
      getMinZoom() { return 0; },
      getMaxZoom() { return 22; },
      getPadding() { return padding; },
      setPadding(p) { padding = { ...padding, ...p }; record('setPadding', JSON.stringify(p)); },
      fitBounds(b, o) {
        const p = (o && o.padding) || {};
        const { w, h } = size();
        const aw = w - padding.left - padding.right - (p.left || 0) - (p.right || 0);
        const ah = h - padding.top - padding.bottom - (p.top || 0) - (p.bottom || 0);
        const dx = mx(b[1][0]) - mx(b[0][0]);
        const dy = my(b[0][1]) - my(b[1][1]);
        let z = Math.min(Math.log2(Math.max(aw, 1) / (Math.max(dx, 1e-9) * 512)), Math.log2(Math.max(ah, 1) / (Math.max(dy, 1e-9) * 512)));
        if (o && o.maxZoom != null) z = Math.min(z, o.maxZoom);
        record('fitBounds', 'z' + z.toFixed(2) + (o && o.maxZoom != null ? ' max' + o.maxZoom : ''));
        cam.z = z;
        cam.lng = (b[0][0] + b[1][0]) / 2;
        cam.lat = (b[0][1] + b[1][1]) / 2;
        scheduleIdle();
        return proxy;
      },
      easeTo(o) { record('easeTo'); if (o && o.center) { cam.lng = o.center[0]; cam.lat = o.center[1]; } return proxy; },
      jumpTo(o) {
        record('jumpTo');
        if (o && o.center) { const c = o.center.lng != null ? [o.center.lng, o.center.lat] : o.center; cam.lng = c[0]; cam.lat = c[1]; }
        if (o && o.zoom != null) cam.z = o.zoom;
        scheduleIdle();
        return proxy;
      },
      project(ll) {
        const [lng, lat] = Array.isArray(ll) ? ll : [ll.lng, ll.lat];
        const o = origin();
        return { x: o.x + (mx(lng) - mx(cam.lng)) * world(), y: o.y + (my(lat) - my(cam.lat)) * world() };
      },
      unproject() { return { lng: cam.lng, lat: cam.lat }; },
      queryRenderedFeatures() { return []; },
      querySourceFeatures() { return []; },
      cameraForBounds() { return { center: [cam.lng, cam.lat], zoom: cam.z }; },
      setStyle(style) {
        record('setStyle', style && style.layers && style.layers[0] ? style.layers[0].id : '');
        setTimeout(() => { base.fire('styledata'); base.fire('style.load'); base.fire('idle'); }, 5);
      },
      hasImage() { return false; },
      scrollZoom: handler(), boxZoom: handler(), dragRotate: handler(), dragPan: handler(), keyboard: handler(),
      doubleClickZoom: handler(), touchZoomRotate: handler(), touchPitch: handler(), cooperativeGestures: handler(),
    };
    const proxy = new Proxy(base, {
      get(t, k) { if (k in t) return typeof t[k] === 'function' ? t[k].bind(proxy) : t[k]; return () => proxy; },
    });
    window.__map = proxy;
    setTimeout(() => { base.fire('styledata'); base.fire('style.load'); base.fire('load'); base.fire('idle'); }, 5);
    return proxy;
  }
  function Control() {
    return { onAdd() { const d = document.createElement('div'); d.className = 'maplibregl-ctrl'; return d; }, onRemove() {} };
  }
  window.maplibregl = new Proxy(
    { Map: function (o) { return makeMap(o); }, NavigationControl: Control, AttributionControl: Control, ScaleControl: Control,
      FullscreenControl: Control, GeolocateControl: Control,
      Popup: function () { const p = new Proxy({}, { get: () => () => p }); return p; },
      LngLatBounds: function (a, b) { this.extend = () => this; this.toArray = () => [a, b]; } },
    { get(t, k) { return k in t ? t[k] : function () { return new Proxy({}, { get: () => () => ({}) }); }; } },
  );
})();
`

type BootOptions = {
  /** Phone layout: the (max-width: 768px) media queries match, so the panel is a bottom sheet. */
  phone?: boolean
  /** Whether navigator.share exists (recorded on window.__shares). Default true. */
  nativeShare?: boolean
  /** The position navigator.geolocation reports; without it the browser has no geolocation. */
  geolocation?: { lng: number; lat: number }
  /** Make every Gemeinde polygon file fail with a 404. */
  failGemeindeGeometry?: boolean
}

export async function bootViewer(query = '', options: BootOptions = {}): Promise<ViewerPage> {
  const html = generateViewerHtml('2026-01-01T00:00:00.000Z', '01.01.2026')
  const errors: string[] = []

  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (err) => {
    const message = String((err as Error | undefined)?.message ?? err)
    // jsdom has no canvas / layout engine; those calls only matter to export paths.
    if (!/Not implemented/.test(message)) errors.push(`jsdom: ${message}`)
  })
  virtualConsole.on('error', (...args) =>
    errors.push(`console.error: ${args.map(String).join(' ')}`),
  )

  const dom = new JSDOM(html, {
    url: `http://localhost/${query}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  })
  const window = dom.window as ViewerWindow
  window.__calls = []
  window.__fetches = []
  window.__shares = []
  window.__clipboard = []

  const onRejection = (reason: unknown) => errors.push(`unhandled rejection: ${String(reason)}`)
  process.on('unhandledRejection', onRejection)
  window.addEventListener('error', (event) => errors.push(`error: ${event.message}`))

  // --- what jsdom lacks ---------------------------------------------------------------------
  const asWindowArrayBuffer = (buffer: Buffer) => {
    const out = new window.ArrayBuffer(buffer.length)
    new window.Uint8Array(out).set(buffer)
    return out
  }
  const respond = (status: number, body?: Buffer) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body?.toString('utf8') ?? 'null'),
    arrayBuffer: async () => asWindowArrayBuffer(body ?? Buffer.alloc(0)),
    text: async () => body?.toString('utf8') ?? '',
  })
  const fakeFetch = async (input: unknown, init?: { method?: string }) => {
    const url = new URL(String(input), window.location.href)
    const rel = url.pathname.replace(/^\//, '')
    window.__fetches.push(rel)
    if (options.failGemeindeGeometry && rel.startsWith('gemeinde-geometry/')) return respond(404)
    // Region preview pages are gitignored build output (CI makes them); pretend they exist.
    if (rel.startsWith('r/') && rel.endsWith('.html'))
      return respond(init?.method === 'HEAD' ? 200 : 404)
    const file = join(viewerDir, rel)
    if (!rel || !existsSync(file)) return respond(404)
    return respond(200, readFileSync(file))
  }
  const matchMedia = (query: string) => ({
    matches: Boolean(options.phone) && /max-width:\s*768px/.test(query),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
  Object.assign(window, {
    fetch: fakeFetch,
    matchMedia,
    structuredClone,
    TextDecoder,
    TextEncoder,
    print: () => {},
  })
  window.Element.prototype.scrollIntoView = () => {}
  window.scrollTo = () => {}
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (text: string) => void window.__clipboard.push(text) },
    configurable: true,
  })
  if (options.geolocation) {
    const { lng, lat } = options.geolocation
    Object.defineProperty(window.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (ok: (position: unknown) => void) =>
          setTimeout(() => ok({ coords: { longitude: lng, latitude: lat } }), 0),
      },
      configurable: true,
    })
  }
  if (options.nativeShare !== false) {
    Object.defineProperty(window.navigator, 'share', {
      value: async (data: ShareCall) => void window.__shares.push(data),
      configurable: true,
    })
    Object.defineProperty(window.navigator, 'canShare', { value: () => true, configurable: true })
  }

  // --- run the page the way a browser would --------------------------------------------------
  window.eval(MAPLIBRE_STUB)
  for (const bundle of BUNDLES) window.eval(readFileSync(join(viewerDir, bundle), 'utf8'))
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '')
  const controller = inlineScripts.sort((a, b) => b.length - a.length)[0]
  if (!controller)
    throw new Error('viewer: no inline controller script found in the generated page')
  // Wrapped in a function: under `bun --bun` (the pre-push hook) jsdom's top-level eval loses the
  // script's function declarations, which a browser — and node — keep.
  window.eval(`(function () {\n${controller}\n})()`)

  const page: ViewerPage = {
    window,
    errors,
    cameraCalls: () => window.__calls.filter((c) => c[0] !== 'setPadding').map((c) => c.join(' ')),
    async waitFor(condition, what, timeoutMs = 20_000) {
      const started = Date.now()
      while (!condition()) {
        if (Date.now() - started > timeoutMs) {
          throw new Error(
            `viewer: timed out waiting for ${what}. Errors so far: ${errors.join(' | ') || 'none'}`,
          )
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    },
    q: <T extends Element = HTMLElement>(selector: string) => {
      const el = window.document.querySelector<T>(selector)
      if (!el) throw new Error(`viewer: no element for ${selector}`)
      return el
    },
    qAll: (selector) => [...window.document.querySelectorAll<HTMLElement>(selector)],
    close() {
      process.off('unhandledRejection', onRejection)
      window.close()
    },
  }

  await page.waitFor(
    () =>
      page.qAll('#ranking-list li').length > 2 ||
      errors.length > 0 ||
      Boolean(page.window.document.getElementById('load-error')?.textContent),
    'the ranking list to fill',
    60_000,
  )
  return page
}
