;(() => {
  var O = Object.defineProperty
  var Q = (n) => n
  function X(n, r) {
    this[n] = Q.bind(null, r)
  }
  var Y = (n, r) => {
    for (var s in r) O(n, s, { get: r[s], enumerable: !0, configurable: !0, set: X.bind(r, s) })
  }
  var N = {}
  Y(N, {
    stadtstaatCandidateIds: () => rn,
    simplePresetToViewScope: () => d,
    simplePresetLabel: () => v,
    simplePresetDarstellung: () => C,
    resolveFocusContext: () => M,
    presetUsesNeighborFilter: () => q,
    parseSimpleViewPreset: () => t,
    neighborCandidateIds: () => sn,
    listSimplePresetsForFocus: () => i,
    landkreisIdsInBundesland: () => J,
    gemeindenIdsInLandkreise: () => e,
    gemeindenIdsInLandkreis: () => nn,
    gemeindeUnitIdsInLandkreise: () => y,
    filterFeaturesForSimpleView: () => kn,
    expertViewScopeFromFocus: () => _n,
    defaultSimplePresetForFocus: () => j,
    SIMPLE_VIEW_PRESET_IDS: () => W,
  })
  var F = 'deutschland',
    Z = new Set(['relation/62422', 'relation/62782', 'relation/62772']),
    g = [
      { id: 'bundeslaender', label: 'Bundesländer', minLevel: 4, sortLevel: 4 },
      { id: 'regierungsbezirke', label: 'Regierungsbezirke', minLevel: 5, sortLevel: 5 },
      {
        id: 'landkreis_kreisfrei',
        label: 'Landkreise und kreisfreie Städte',
        minLevel: 6,
        sortLevel: 6,
      },
      { id: 'landkreise', label: 'Landkreise', minLevel: 6, sortLevel: 6 },
      { id: 'kreisfreie', label: 'Kreisfreie Städte', minLevel: 6, sortLevel: 6 },
      {
        id: 'gemeindeverbaende_kreisfrei',
        label: 'Gemeindeverbände, Einzelgemeinden und kreisfreie Städte',
        minLevel: 6,
        sortLevel: 7,
      },
      {
        id: 'gemeindeverbaende',
        label: 'Gemeindeverbände und Einzelgemeinden',
        minLevel: 7,
        sortLevel: 7,
      },
      {
        id: 'gemeinden_kreisfrei',
        label: 'Gemeinden und kreisfreie Städte',
        minLevel: 6,
        sortLevel: 8,
      },
      { id: 'gemeinden', label: 'Gemeinden', minLevel: 8, sortLevel: 8 },
      { id: 'stadtbezirke', label: 'Stadtbezirke', minLevel: 9, sortLevel: 9 },
      { id: 'stadtteile', label: 'Stadtteile', minLevel: 10, sortLevel: 10 },
    ]
  function a(n) {
    return String(n.properties?.level ?? '')
  }
  function S(n) {
    return String(n.properties?.id ?? '')
  }
  function h(n) {
    return a(n) === '4' && Z.has(S(n))
  }
  function H(n, r) {
    return n === 'deutschland' && !r
  }
  function I(n, r) {
    if (n === 'deutschland') return 2
    if (!r) return 4
    if (r.startsWith('rb:')) return 5
    if (r.startsWith('lk:') || r.startsWith('kreisfrei:') || r.startsWith('stadt:')) return 6
    return 4
  }
  function D(n, r) {
    if (r.startsWith('rb:')) return r.slice(3)
    if (r.startsWith('lk:')) return r.slice(3)
    if (r.startsWith('kreisfrei:')) return r.slice(9)
    if (r.startsWith('stadt:')) return r.slice(6)
    if (n === 'deutschland') return null
    return n
  }
  function z(n, r) {
    let s = [],
      o = n,
      l = new Set()
    while (o && !l.has(o)) {
      l.add(o)
      let k = r.parentById.get(o)
      if (!k) break
      ;(s.push(k), (o = k))
    }
    return s
  }
  function K(n, r) {
    if (a(n) !== '8') return !1
    let s = S(n)
    for (let l of z(s, r)) {
      let k = r.byId.get(l)
      if (k && a(k) === '7') return !1
    }
    let o = r.parentById.get(s)
    if (o) {
      let l = r.byId.get(o)
      if (l && a(l) === '7') return !1
    }
    return !0
  }
  function f(n, r, s) {
    let o = a(n),
      l = S(n)
    if (o === '7') return !0
    if (K(n, s)) return !0
    if (r === 'gemeindeverbaende_kreisfrei' && o === '6' && s.kreisfreieIds.has(l)) return !0
    return !1
  }
  function E(n, r, s, o) {
    let l = S(n)
    if (!l || !n.geometry) return !1
    let k = D(r, s)
    if (r === 'deutschland' && !s) return !0
    if (!k) return !1
    if (l === k) return !0
    if (z(l, o).includes(k)) return !0
    let _ = a(n),
      u = n.properties ?? {}
    if (I(r, s) === 4 && _ > '4' && u.bundesland_id === k) return !0
    if (I(r, s) === 6 && _ > '6' && u.landkreis_id === k) return !0
    return !1
  }
  function B(n, r, s, o, l) {
    let k = a(n),
      _ = S(n),
      u = s.kreisfreieIds.has(_),
      m = H(o, l)
    switch (r) {
      case 'bundeslaender':
        return k === '4'
      case 'regierungsbezirke':
        return k === '5'
      case 'landkreise':
        return k === '6' && !u
      case 'kreisfreie':
        return k === '6' && u
      case 'landkreis_kreisfrei':
        return k === '6' || (m && h(n))
      case 'gemeindeverbaende':
        return f(n, 'gemeindeverbaende', s)
      case 'gemeindeverbaende_kreisfrei':
        return f(n, 'gemeindeverbaende_kreisfrei', s) || (m && h(n))
      case 'gemeinden':
        return k === '8'
      case 'gemeinden_kreisfrei':
        return k === '8' || (k === '6' && u) || (m && h(n))
      case 'stadtbezirke':
        return k === '9'
      case 'stadtteile':
        return k === '10'
      default:
        return !1
    }
  }
  function A(n) {
    return g.find((s) => s.id === n)?.minLevel ?? 99
  }
  function P(n, r, s) {
    let o = I(r.gebiet, r.untergebiet),
      l = D(r.gebiet, r.untergebiet)
    return n.filter((k) => {
      if (!B(k, r.darstellung, s, r.gebiet, r.untergebiet)) return !1
      if (!E(k, r.gebiet, r.untergebiet, s)) return !1
      if (l && S(k) === l && A(r.darstellung) <= o) return !1
      return !0
    })
  }
  function U(n, r) {
    let s = []
    for (let o of r.byId.values()) {
      if (a(o) !== '5') continue
      if (n !== 'deutschland' && o.properties?.bundesland_id !== n) continue
      if (!E(o, n, '', r)) continue
      s.push({ id: S(o), name: String(o.properties?.name ?? S(o)), level: '5' })
    }
    return (s.sort((o, l) => o.name.localeCompare(l.name, 'de')), s)
  }
  var W = [
    'de_bundeslaender',
    'de_landkreis_kreisfrei',
    'bl_regierungsbezirke',
    'bl_landkreis_kreisfrei',
    'bl_gemeinden_kreisfrei',
    'lk_gemeinden',
    'lk_neighbors_landkreise',
    'lk_neighbors_gemeinden',
    'gm_neighbors',
  ]
  function $(n, r) {
    let s = r.byId.get(n)
    return s ? String(s.properties?.name ?? n) : n
  }
  function R(n, r) {
    if (!n.bundeslandId) return 'Bundesland'
    return $(n.bundeslandId, r)
  }
  function T(n, r) {
    let s = n.landkreisId ?? (n.kind === 'landkreis' ? n.focusId : null)
    if (!s) return 'Landkreis'
    return $(s, r)
  }
  function c(n) {
    return String(n.properties?.level ?? '')
  }
  function V(n) {
    return String(n.properties?.id ?? '')
  }
  function G(n, r) {
    return r.kreisfreieIds.has(n) ? `kreisfrei:${n}` : `lk:${n}`
  }
  function t(n) {
    if (!n) return null
    return W.includes(n) ? n : null
  }
  function M(n, r) {
    let s = n?.trim() || r.deutschlandId || F
    if (s === F || s === r.deutschlandId)
      return {
        focusId: r.deutschlandId ?? F,
        focusName: 'Deutschland',
        kind: 'deutschland',
        gebiet: F,
        untergebiet: '',
        bundeslandId: '',
        landkreisId: null,
        gemeindeId: null,
      }
    let o = r.byId.get(s)
    if (!o) return null
    let l = V(o),
      k = String(o.properties?.name ?? l),
      _ = c(o)
    if (_ === '4')
      return {
        focusId: l,
        focusName: k,
        kind: 'bundesland',
        gebiet: l,
        untergebiet: '',
        bundeslandId: l,
        landkreisId: null,
        gemeindeId: null,
      }
    if (_ === '5') {
      let u = String(o.properties?.bundesland_id ?? '')
      if (!u) return null
      let m = r.byId.get(u)
      return {
        focusId: l,
        focusName: k,
        kind: 'bundesland',
        gebiet: u,
        untergebiet: '',
        bundeslandId: u,
        landkreisId: null,
        gemeindeId: null,
      }
    }
    if (_ === '6') {
      let u = String(o.properties?.bundesland_id ?? L(l, r, '4') ?? '')
      if (!u) return null
      return {
        focusId: l,
        focusName: k,
        kind: 'landkreis',
        gebiet: u,
        untergebiet: G(l, r),
        bundeslandId: u,
        landkreisId: l,
        gemeindeId: null,
      }
    }
    if (_ === '8') {
      let u = String(o.properties?.landkreis_id ?? ''),
        m = String(o.properties?.bundesland_id ?? '')
      if (!u || !m) return null
      return {
        focusId: l,
        focusName: k,
        kind: 'gemeinde',
        gebiet: m,
        untergebiet: G(u, r),
        bundeslandId: m,
        landkreisId: u,
        gemeindeId: l,
      }
    }
    return null
  }
  function L(n, r, s) {
    let o = n
    while (o) {
      let l = r.byId.get(o)
      if (!l) break
      if (c(l) === s) return o
      o = r.parentById.get(o)
    }
    return null
  }
  function p() {
    return ['de_bundeslaender', 'de_landkreis_kreisfrei']
  }
  function w(n, r) {
    let s = []
    if (U(n.gebiet, r).length > 0) s.push('bl_regierungsbezirke')
    return (s.push('bl_landkreis_kreisfrei'), s.push('bl_gemeinden_kreisfrei'), s)
  }
  function b() {
    return ['lk_gemeinden', 'lk_neighbors_landkreise']
  }
  function x() {
    return ['gm_neighbors']
  }
  function i(n, r) {
    let s = [],
      o = (l) => {
        for (let k of l) if (!s.includes(k)) s.push(k)
      }
    if ((o(p()), n.kind !== 'deutschland')) o(w(n, r))
    if (n.landkreisId) o(b())
    if (n.gemeindeId) o(x())
    return s
  }
  function j(n, r) {
    let s = i(n, r)
    if (n.kind === 'deutschland')
      return s.includes('de_landkreis_kreisfrei') ? 'de_landkreis_kreisfrei' : 'de_bundeslaender'
    if (n.kind === 'bundesland') return 'bl_landkreis_kreisfrei'
    if (n.landkreisId) return 'lk_gemeinden'
    return s.at(-1) ?? 'de_landkreis_kreisfrei'
  }
  function v(n, r, s) {
    switch (n) {
      case 'de_bundeslaender':
        return 'Bundesländer in Deutschland'
      case 'de_landkreis_kreisfrei':
        return 'Landkreise in Deutschland'
      case 'bl_regierungsbezirke':
        return 'Regierungsbezirke in ' + R(r, s)
      case 'bl_landkreis_kreisfrei':
        return 'Landkreise in ' + R(r, s)
      case 'bl_gemeinden_kreisfrei':
        return 'Gemeinden in ' + R(r, s)
      case 'lk_gemeinden':
        return 'Gemeinden in ' + T(r, s)
      case 'lk_neighbors_landkreise':
      case 'lk_neighbors_gemeinden':
        return 'Nachbarn von ' + T(r, s)
      case 'gm_neighbors':
        return 'Nachbarn von ' + r.focusName
      default:
        return n
    }
  }
  function q(n) {
    return n === 'lk_neighbors_landkreise' || n === 'lk_neighbors_gemeinden' || n === 'gm_neighbors'
  }
  function C(n) {
    switch (n) {
      case 'de_bundeslaender':
        return 'bundeslaender'
      case 'de_landkreis_kreisfrei':
      case 'bl_landkreis_kreisfrei':
      case 'lk_neighbors_landkreise':
      case 'lk_neighbors_gemeinden':
        return 'landkreis_kreisfrei'
      case 'bl_regierungsbezirke':
        return 'regierungsbezirke'
      case 'bl_gemeinden_kreisfrei':
        return 'gemeinden_kreisfrei'
      case 'lk_gemeinden':
      case 'gm_neighbors':
        return 'gemeinden'
      default:
        return 'gemeinden'
    }
  }
  function d(n, r) {
    if (q(n)) return null
    let s = C(n)
    if (n.startsWith('de_')) return { gebiet: F, untergebiet: '', darstellung: s }
    if (n.startsWith('bl_')) return { gebiet: r.gebiet, untergebiet: '', darstellung: s }
    if (n === 'lk_gemeinden')
      return { gebiet: r.gebiet, untergebiet: r.untergebiet, darstellung: s }
    return null
  }
  function J(n, r) {
    let s = []
    for (let o of r.byId.values()) {
      if (c(o) !== '6') continue
      if (String(o.properties?.bundesland_id ?? '') !== n) continue
      s.push(V(o))
    }
    return s
  }
  function y(n, r) {
    let s = new Set(n),
      o = []
    for (let l of r.byId.values()) {
      let k = V(l),
        _ = c(l)
      if (_ === '8') {
        let u = String(l.properties?.landkreis_id ?? '')
        if (s.has(u)) o.push(k)
        continue
      }
      if (_ === '6' && r.kreisfreieIds.has(k) && s.has(k)) o.push(k)
    }
    return o
  }
  function e(n, r) {
    return y(n, r)
  }
  function nn(n, r) {
    return y([n], r)
  }
  function rn(n) {
    return n.stadtstaaten.map((r) => r.id)
  }
  function sn(n, r, s) {
    if (n === 'lk_neighbors_landkreise' || n === 'lk_neighbors_gemeinden') {
      if (!r.landkreisId) return []
      return J(r.bundeslandId, s)
    }
    return []
  }
  function on(n, r, s) {
    let o = V(n)
    if (!o || !r.has(o)) return !1
    if (c(n) === '6') return !0
    if (h(n)) return !0
    return !1
  }
  function ln(n, r, s) {
    let o = V(n)
    if (!o || !r.has(o)) return !1
    let l = c(n)
    if (l === '8') return !0
    if (l === '6' && s.kreisfreieIds.has(o)) return !0
    if (h(n)) return !0
    return !1
  }
  function kn(n, r, s, o, l) {
    let k = C(r),
      _ = d(r, s)
    if (_) return P(n, _, o)
    if (!l?.size) return []
    return n.filter((u) => {
      let m = V(u)
      if (!m || !l.has(m)) return !1
      if (r === 'lk_neighbors_landkreise' || r === 'lk_neighbors_gemeinden') return on(u, l, o)
      if (r === 'gm_neighbors') return ln(u, l, o)
      return un(u, k, o, s)
    })
  }
  function un(n, r, s, o) {
    let l = { gebiet: o.gebiet, untergebiet: o.untergebiet, darstellung: r }
    return P([n], l, s).length > 0
  }
  function _n(n, r) {
    let s = M(n, r)
    if (!s) return null
    let o = j(s, r),
      l = d(o, s)
    if (l) return l
    if (s.kind === 'landkreis' && s.landkreisId)
      return { gebiet: s.gebiet, untergebiet: s.untergebiet, darstellung: 'gemeinden' }
    if (s.kind === 'gemeinde')
      return { gebiet: s.gebiet, untergebiet: s.untergebiet, darstellung: 'gemeinden' }
    return null
  }
  globalThis.SimpleView = N
})()
