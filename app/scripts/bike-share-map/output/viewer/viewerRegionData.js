;(() => {
  var E = Object.defineProperty
  var k = (q) => q
  function h(q, M) {
    this[q] = k.bind(null, M)
  }
  var B = (q, M) => {
    for (var z in M) E(q, z, { get: M[z], enumerable: !0, configurable: !0, set: h.bind(M, z) })
  }
  var N = {}
  B(N, {
    viewNeedsBundeslandGemeinden: () => T,
    rebuildViewerRegionIndex: () => D,
    loadMonolithicFeatures: () => I,
    loadDeutschlandRegions: () => c,
    listStadtbezirkeFromManifest: () => a,
    listRegierungsbezirkeFromManifest: () => o,
    listLandkreiseFromManifest: () => p,
    listKreisfreieFromManifest: () => v,
    listBundeslaenderFromManifest: () => f,
    ingestManifest: () => L,
    ensureDataForViewScope: () => x,
    ensureBundeslandRegionsLoaded: () => K,
    ensureBundeslandForUrlParams: () => w,
    createViewerRegionStore: () => m,
    allLoadedFeatures: () => y,
  })
  var O = 'deutschland',
    H = new Set(['relation/62422', 'relation/62782', 'relation/62772'])
  function C(q) {
    return String(q.properties?.level ?? '')
  }
  function P(q) {
    return String(q.properties?.id ?? '')
  }
  function U(q) {
    let M = new Map(),
      z = new Map(),
      Q = new Map(),
      Y = new Map()
    for (let X of q) {
      let Z = P(X)
      if (!Z) continue
      M.set(Z, X)
      let V = C(X)
      if (V) {
        let R = z.get(V) ?? []
        ;(R.push(Z), z.set(V, R))
      }
      let _ = X.properties?.parent_id
      if (_) {
        Q.set(Z, _)
        let R = Y.get(_) ?? []
        ;(R.push(X), Y.set(_, R))
      }
    }
    let $ = new Set()
    for (let X of q) {
      if (C(X) !== '8') continue
      let Z = X.properties?.landkreis_id
      if (Z) $.add(Z)
    }
    let J = new Set()
    for (let X of q) {
      if (C(X) !== '6') continue
      let Z = P(X)
      if (!$.has(Z)) J.add(Z)
    }
    let j = null,
      W = []
    for (let X of q) {
      if (C(X) !== '4') continue
      let Z = P(X),
        V = String(X.properties?.name ?? Z)
      W.push({ id: Z, name: V, level: '4' })
    }
    W.sort((X, Z) => X.name.localeCompare(Z.name, 'de'))
    for (let X of q)
      if (C(X) === '2') {
        j = P(X)
        break
      }
    let A = W.filter((X) => !H.has(X.id)),
      G = W.filter((X) => H.has(X.id))
    return {
      deutschlandId: j,
      kreisfreieIds: J,
      parentById: Q,
      byId: M,
      idsByLevel: z,
      bundeslaender: W,
      flaechenlaender: A,
      stadtstaaten: G,
    }
  }
  function S(q) {
    return q !== 'deutschland' && H.has(q)
  }
  function m() {
    return {
      manifest: null,
      featureById: new Map(),
      loadedBundeslaender: new Set(),
      regionIndex: null,
    }
  }
  function y(q) {
    return [...q.featureById.values()]
  }
  function D(q) {
    return ((q.regionIndex = U(y(q))), q.regionIndex)
  }
  function F(q, M) {
    for (let z of M) {
      let Q = String(z.properties?.id ?? '')
      if (Q) q.featureById.set(Q, z)
    }
  }
  function L(q, M) {
    if (!M || typeof M !== 'object') return !1
    let z = M
    if (z.version !== 3 || !z.deutschlandUrl || !Array.isArray(z.bundeslaender)) return !1
    return ((q.manifest = z), !0)
  }
  function I(q, M) {
    ;((q.manifest = null), q.loadedBundeslaender.clear(), q.featureById.clear(), F(q, M), D(q))
  }
  async function c(q, M) {
    let z = await fetch(M)
    if (!z.ok) throw Error('regions/deutschland.geojson fehlt')
    let Q = await z.json()
    ;(F(q, Q.features ?? []), D(q))
  }
  async function K(q, M) {
    if (!q.manifest) return !1
    if (M === O) return !0
    if (q.loadedBundeslaender.has(M)) return !0
    let z = q.manifest.bundeslaender.find(($) => $.id === M)
    if (!z) return !1
    let Q = await fetch(z.featuresUrl)
    if (!Q.ok) throw Error(`Gebietsdaten fehlen: ${z.name}`)
    let Y = await Q.json()
    return (F(q, Y.features ?? []), q.loadedBundeslaender.add(M), D(q), !0)
  }
  function T(q, M, z) {
    if (q === O)
      return (
        z === 'gemeinden' ||
        z === 'gemeinden_kreisfrei' ||
        z === 'gemeindeverbaende' ||
        z === 'gemeindeverbaende_kreisfrei' ||
        z === 'stadtbezirke' ||
        z === 'stadtteile'
      )
    if (M) return !0
    return (
      z === 'gemeinden' ||
      z === 'gemeinden_kreisfrei' ||
      z === 'gemeindeverbaende' ||
      z === 'gemeindeverbaende_kreisfrei' ||
      z === 'stadtbezirke' ||
      z === 'stadtteile'
    )
  }
  async function w(q, M) {
    if (!q.manifest) return
    let z = null,
      Q = M.get('gebiet')
    if (Q && Q !== O && Q !== 'simple') z = Q
    if (!z) {
      let Y = M.get('untergebiet') ?? ''
      if (Y.startsWith('lk:') || Y.startsWith('kreisfrei:')) {
        let $ = Y.replace(/^(lk:|kreisfrei:)/, ''),
          j = q.featureById.get($)?.properties?.bundesland_id
        if (j) z = String(j)
      }
    }
    if (!z) {
      let Y = M.get('focus')
      if (Y) {
        let J = q.featureById.get(Y)?.properties?.bundesland_id
        if (J) z = String(J)
      }
    }
    if (z) await K(q, z)
  }
  async function x(q, M, z, Q) {
    if (!q.manifest) return
    if (M === O) {
      if (T(M, z, Q)) await Promise.all(q.manifest.bundeslaender.map((Y) => K(q, Y.id)))
      return
    }
    if (T(M, z, Q) || z) await K(q, M)
  }
  function f(q) {
    return q.bundeslaender.map((M) => ({ id: M.id, name: M.name, level: '4' }))
  }
  function o(q, M) {
    if (M === O) {
      let z = []
      for (let Q of q.bundeslaender) for (let Y of Q.regierungsbezirke) z.push(Y)
      return z.sort((Q, Y) => Q.name.localeCompare(Y.name, 'de'))
    }
    return q.bundeslaender.find((z) => z.id === M)?.regierungsbezirke ?? []
  }
  function p(q, M, z) {
    let Q = q.bundeslaender.find(($) => $.id === M)
    if (!Q) return []
    let Y = [...Q.landkreise]
    if (!z) return Y
    if (z.startsWith('rb:')) {
      let $ = z.slice(3)
      return Y.filter((J) => J.parentId === $)
    }
    return Y
  }
  function v(q, M, z) {
    if (z) return []
    return q.bundeslaender.find((Y) => Y.id === M)?.kreisfreie ?? []
  }
  function a(q, M, z) {
    if (!S(M) || z) return []
    return q.bundeslaender.find((Q) => Q.id === M)?.stadtbezirke ?? []
  }
  globalThis.RegionData = N
})()
