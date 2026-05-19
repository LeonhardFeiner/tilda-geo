;(() => {
  var a = Object.defineProperty
  var p = (N) => N
  function u(N, R) {
    this[N] = p.bind(null, R)
  }
  var g = (N, R) => {
    for (var j in R) a(N, j, { get: R[j], enumerable: !0, configurable: !0, set: u.bind(R, j) })
  }
  var k = {}
  g(k, {
    viewShowsManyGemeinden: () => x,
    viewShowsGemeindenLevel: () => MN,
    viewScopeFromLegacyViewId: () => WN,
    viewLabel: () => JN,
    scopeLevelFor: () => _,
    scopeIdFor: () => D,
    scopeBoundsFeatures: () => XN,
    presetUnitLevels: () => S,
    presetMinLevel: () => K,
    presetLabelForScope: () => B,
    presetIncludesStadtstaatenUnits: () => t,
    presetCoverageForScope: () => F,
    preferredDarstellungPresetForScope: () => o,
    partialGapRankForScope: () => H,
    parseUntergebietParam: () => ON,
    parseGebietParam: () => QN,
    parseDarstellungParam: () => VN,
    listStadtbezirkeInGebiet: () => EN,
    listRegierungsbezirkeInGebiet: () => qN,
    listLandkreiseInGebiet: () => zN,
    listKreisfreieInGebiet: () => CN,
    listDarstellungPresetsForScope: () => P,
    listDarstellungPresetGroupsForScope: () => RN,
    listAllBundeslaender: () => n,
    isStandaloneGemeinde: () => h,
    isStadtstaatGebiet: () => d,
    isStadtstaatFeature: () => G,
    isPresetAllowedForScope: () => w,
    isKreisfrei: () => r,
    isDeutschlandScope: () => U,
    filterFeaturesForView: () => l,
    featureWithinScope: () => V,
    defaultDarstellungPresetForScope: () => c,
    defaultDarstellungForScope: () => f,
    comparePresetUnitLevelHierarchy: () => I,
    buildRegionIndex: () => b,
    STADTSTAAT_IDS: () => Z,
    DISPLAY_PRESETS: () => $,
    DEUTSCHLAND_GEBIET: () => v,
  })
  var v = 'deutschland',
    Z = new Set(['relation/62422', 'relation/62782', 'relation/62772']),
    $ = [
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
    ],
    s = {
      regierungsbezirke_und_stadtstaaten: 'regierungsbezirke',
      landkreise_und_stadtstaaten: 'landkreis_kreisfrei',
      gemeindeverbaende_und_stadtstaaten: 'gemeindeverbaende_kreisfrei',
      gemeinden_und_stadtstaaten: 'gemeinden_kreisfrei',
    }
  function J(N) {
    return String(N.properties?.level ?? '')
  }
  function M(N) {
    return String(N.properties?.id ?? '')
  }
  function b(N) {
    let R = new Map(),
      j = new Map(),
      q = new Map()
    for (let E of N) {
      let Q = M(E)
      if (!Q) continue
      R.set(Q, E)
      let X = E.properties?.parent_id
      if (X) {
        j.set(Q, X)
        let Y = q.get(X) ?? []
        ;(Y.push(E), q.set(X, Y))
      }
    }
    let T = new Set()
    for (let E of N) {
      if (J(E) !== '6') continue
      let Q = M(E)
      if (!N.some((Y) => J(Y) === '8' && Y.properties?.landkreis_id === Q)) T.add(Q)
    }
    let z = null,
      C = []
    for (let E of N) {
      if (J(E) !== '4') continue
      let Q = M(E),
        X = String(E.properties?.name ?? Q)
      C.push({ id: Q, name: X, level: '4' })
    }
    C.sort((E, Q) => E.name.localeCompare(Q.name, 'de'))
    for (let E of N)
      if (J(E) === '2') {
        z = M(E)
        break
      }
    let O = C.filter((E) => !Z.has(E.id)),
      W = C.filter((E) => Z.has(E.id))
    return {
      deutschlandId: z,
      kreisfreieIds: T,
      parentById: j,
      byId: R,
      bundeslaender: C,
      flaechenlaender: O,
      stadtstaaten: W,
    }
  }
  function r(N, R) {
    return R.kreisfreieIds.has(N)
  }
  function d(N) {
    return N !== 'deutschland' && Z.has(N)
  }
  function G(N) {
    return J(N) === '4' && Z.has(M(N))
  }
  function n(N) {
    return [...N.bundeslaender]
  }
  function t(N) {
    return (
      N === 'landkreis_kreisfrei' ||
      N === 'gemeindeverbaende_kreisfrei' ||
      N === 'gemeinden_kreisfrei'
    )
  }
  function B(N, R, j) {
    if (!U(R, j)) return N.label
    if (N.id === 'landkreis_kreisfrei') return 'Landkreise, kreisfreie Städte und Stadtstaaten'
    if (N.id === 'gemeindeverbaende_kreisfrei')
      return 'Gemeindeverbände, Einzelgemeinden, kreisfreie Städte und Stadtstaaten'
    if (N.id === 'gemeinden_kreisfrei') return 'Gemeinden, kreisfreie Städte und Stadtstaaten'
    return N.label
  }
  function U(N, R) {
    return N === 'deutschland' && !R
  }
  function _(N, R) {
    if (N === 'deutschland') return 2
    if (!R) return 4
    if (R.startsWith('rb:')) return 5
    if (R.startsWith('lk:') || R.startsWith('kreisfrei:') || R.startsWith('stadt:')) return 6
    return 4
  }
  function D(N, R) {
    if (R.startsWith('rb:')) return R.slice(3)
    if (R.startsWith('lk:')) return R.slice(3)
    if (R.startsWith('kreisfrei:')) return R.slice(9)
    if (R.startsWith('stadt:')) return R.slice(6)
    if (N === 'deutschland') return null
    return N
  }
  function m(N, R) {
    let j = [],
      q = N,
      T = new Set()
    while (q && !T.has(q)) {
      T.add(q)
      let z = R.parentById.get(q)
      if (!z) break
      ;(j.push(z), (q = z))
    }
    return j
  }
  function h(N, R) {
    if (J(N) !== '8') return !1
    let j = M(N)
    for (let T of m(j, R)) {
      let z = R.byId.get(T)
      if (z && J(z) === '7') return !1
    }
    let q = R.parentById.get(j)
    if (q) {
      let T = R.byId.get(q)
      if (T && J(T) === '7') return !1
    }
    return !0
  }
  function y(N, R, j) {
    let q = J(N),
      T = M(N)
    if (q === '7') return !0
    if (h(N, j)) return !0
    if (R === 'gemeindeverbaende_kreisfrei' && q === '6' && j.kreisfreieIds.has(T)) return !0
    return !1
  }
  function V(N, R, j, q) {
    let T = M(N)
    if (!T || !N.geometry) return !1
    let z = D(R, j)
    if (R === 'deutschland' && !j) return !0
    if (!z) return !1
    if (T === z) return !0
    if (m(T, q).includes(z)) return !0
    let C = J(N),
      O = N.properties ?? {}
    if (_(R, j) === 4 && C > '4' && O.bundesland_id === z) return !0
    if (_(R, j) === 6 && C > '6' && O.landkreis_id === z) return !0
    return !1
  }
  function i(N, R, j, q, T) {
    let z = J(N),
      C = M(N),
      O = j.kreisfreieIds.has(C),
      W = U(q, T)
    switch (R) {
      case 'bundeslaender':
        return z === '4'
      case 'regierungsbezirke':
        return z === '5'
      case 'landkreise':
        return z === '6' && !O
      case 'kreisfreie':
        return z === '6' && O
      case 'landkreis_kreisfrei':
        return z === '6' || (W && G(N))
      case 'gemeindeverbaende':
        return y(N, 'gemeindeverbaende', j)
      case 'gemeindeverbaende_kreisfrei':
        return y(N, 'gemeindeverbaende_kreisfrei', j) || (W && G(N))
      case 'gemeinden':
        return z === '8'
      case 'gemeinden_kreisfrei':
        return z === '8' || (z === '6' && O) || (W && G(N))
      case 'stadtbezirke':
        return z === '9'
      case 'stadtteile':
        return z === '10'
      default:
        return !1
    }
  }
  function K(N) {
    return $.find((j) => j.id === N)?.minLevel ?? 99
  }
  function L(N, R, j) {
    for (let q of j.byId.values()) {
      if (J(q) !== '6') continue
      if (!j.kreisfreieIds.has(M(q))) continue
      if (V(q, N, R, j)) return !0
    }
    return !1
  }
  function e(N, R, j) {
    if (R) return !1
    if (N === 'deutschland') return !1
    let q = 0
    for (let T of j.byId.values()) {
      if (J(T) !== '5') continue
      if (T.properties?.bundesland_id !== N) continue
      if (!V(T, N, '', j)) continue
      q++
    }
    return q > 0
  }
  function F(N, R, j, q, T) {
    let z = L(j, q, T),
      C = e(j, q, T)
    if (q.startsWith('kreisfrei:')) {
      if (N === 'kreisfreie' || N === 'gemeinden_kreisfrei') return 'full'
      if (N === 'gemeinden' || N === 'stadtbezirke' || N === 'stadtteile') return 'full'
      return 'partial'
    }
    if (q.startsWith('stadt:')) {
      if (N === 'stadtbezirke' || N === 'stadtteile' || N === 'gemeinden') return 'full'
      return 'partial'
    }
    switch (N) {
      case 'bundeslaender':
        return R <= 2 ? 'full' : 'partial'
      case 'landkreis_kreisfrei':
        return R <= 2 || (R <= 4 && !z) ? 'full' : 'partial'
      case 'gemeinden_kreisfrei':
        return R <= 2 ? 'full' : 'partial'
      case 'gemeindeverbaende_kreisfrei':
        return R <= 2 ? 'full' : 'partial'
      case 'regierungsbezirke':
        if (R <= 2) return 'partial'
        return C && R <= 4 ? 'full' : 'partial'
      case 'landkreise':
        return z ? 'partial' : 'full'
      case 'kreisfreie':
        return 'partial'
      case 'gemeindeverbaende':
        return z && R <= 4 ? 'partial' : 'full'
      case 'gemeinden':
        return R <= 6 ? 'full' : 'partial'
      case 'stadtbezirke':
      case 'stadtteile':
        return 'partial'
      default:
        return 'partial'
    }
  }
  function H(N, R, j, q, T) {
    if (F(N, R, j, q, T) === 'full') return 0
    let z = L(j, q, T)
    switch (N) {
      case 'regierungsbezirke':
        return R <= 2 ? 50 : 10
      case 'landkreise':
        return 20
      case 'gemeindeverbaende':
        return z && R <= 4 ? 25 : 30
      case 'kreisfreie':
        return q.startsWith('kreisfrei:') ? 0 : 40
      case 'stadtbezirke':
        return 45
      case 'stadtteile':
        return 55
      default:
        return 60
    }
  }
  function S(N, R, j) {
    let T = U(R, j) ? [4] : [],
      z = [6]
    switch (N) {
      case 'bundeslaender':
        return [4]
      case 'regierungsbezirke':
        return [5]
      case 'landkreise':
      case 'kreisfreie':
        return [6]
      case 'landkreis_kreisfrei':
        return [...T, 6]
      case 'gemeindeverbaende':
        return [7, 8]
      case 'gemeindeverbaende_kreisfrei':
        return [...T, ...z, 7, 8]
      case 'gemeinden':
        return [8]
      case 'gemeinden_kreisfrei':
        return [...T, ...z, 8]
      case 'stadtbezirke':
        return [9]
      case 'stadtteile':
        return [10]
      default:
        return []
    }
  }
  function I(N, R) {
    let j = Math.max(N.length, R.length)
    for (let q = 0; q < j; q++) {
      let T = N[q],
        z = R[q]
      if (T === void 0 && z === void 0) continue
      if (T === void 0) return -1
      if (z === void 0) return 1
      if (T !== z) return T - z
    }
    return 0
  }
  function NN(N, R, j, q, T, z) {
    let C = F(N.id, j, q, T, z),
      O = F(R.id, j, q, T, z)
    if (C !== O) return C === 'full' ? -1 : 1
    if (N.sortLevel !== R.sortLevel) return N.sortLevel - R.sortLevel
    let W = I(S(N.id, q, T), S(R.id, q, T))
    if (W !== 0) return W
    if (C === 'partial') {
      let E = H(N.id, j, q, T, z),
        Q = H(R.id, j, q, T, z)
      if (E !== Q) return E - Q
    }
    return N.label.localeCompare(R.label, 'de')
  }
  function P(N, R, j) {
    let q = _(N.gebiet, N.untergebiet)
    return $.filter((z) => {
      if (!w(z.id, q, R, N.gebiet, N.untergebiet)) return !1
      return l(j, { ...N, darstellung: z.id }, R).length > 0
    }).sort((z, C) => NN(z, C, q, N.gebiet, N.untergebiet, R))
  }
  function RN(N, R, j) {
    let q = P(N, R, j)
    return q.length ? [{ coverage: 'full', label: '', presets: q }] : []
  }
  function o(N, R) {
    if (U(N, R)) return 'landkreis_kreisfrei'
    if (R.startsWith('lk:')) return 'gemeinden'
    if (R.startsWith('rb:')) return 'landkreis_kreisfrei'
    if (N !== 'deutschland' && !R) return 'landkreis_kreisfrei'
    return null
  }
  function c(N, R, j, q) {
    let T = P({ gebiet: N, untergebiet: R, darstellung: 'bundeslaender' }, j, q),
      z = new Set(T.map((O) => O.id)),
      C = o(N, R)
    if (C && z.has(C)) return C
    if (T[0]) return T[0].id
    return 'bundeslaender'
  }
  function w(N, R, j, q, T) {
    if (K(N) <= R) return !1
    let C = D(q, T)
    if (q === 'deutschland' && !T) {
      if (N === 'regierungsbezirke') return jN(j, '5', 'deutschland', '', j) > 0
      return !0
    }
    if (!C) return !1
    if (N === 'regierungsbezirke') return TN(C, '5', j) > 0
    if (N === 'stadtbezirke') return A(C, '9', j) > 0
    if (N === 'stadtteile') return A(C, '10', j) > 0
    return !0
  }
  function TN(N, R, j) {
    let q = 0
    for (let T of j.byId.values()) {
      if (J(T) !== R) continue
      if (T.properties?.parent_id === N) q++
    }
    return q
  }
  function A(N, R, j) {
    let q = 0
    for (let T of j.byId.values()) {
      if (J(T) !== R) continue
      let z = M(T)
      if (z === N) continue
      if (m(z, j).includes(N)) q++
      else if (T.properties?.bundesland_id === N) q++
      else if (T.properties?.landkreis_id === N) q++
    }
    return q
  }
  function jN(N, R, j, q, T) {
    let z = 0
    for (let C of N.byId.values()) {
      if (J(C) !== R) continue
      if (V(C, j, q, N)) z++
    }
    return z
  }
  function l(N, R, j) {
    let q = _(R.gebiet, R.untergebiet),
      T = D(R.gebiet, R.untergebiet)
    return N.filter((z) => {
      if (!i(z, R.darstellung, j, R.gebiet, R.untergebiet)) return !1
      if (!V(z, R.gebiet, R.untergebiet, j)) return !1
      if (T && M(z) === T && K(R.darstellung) <= q) return !1
      return !0
    })
  }
  function qN(N, R) {
    let j = []
    for (let q of R.byId.values()) {
      if (J(q) !== '5') continue
      if (N !== 'deutschland' && q.properties?.bundesland_id !== N) continue
      if (!V(q, N, '', R)) continue
      j.push({ id: M(q), name: String(q.properties?.name ?? M(q)), level: '5' })
    }
    return (j.sort((q, T) => q.name.localeCompare(T.name, 'de')), j)
  }
  function zN(N, R, j) {
    let q = []
    for (let T of j.byId.values()) {
      if (J(T) !== '6') continue
      if (j.kreisfreieIds.has(M(T))) continue
      if (!V(T, N, R, j)) continue
      q.push({ id: M(T), name: String(T.properties?.name ?? M(T)), level: '6' })
    }
    return (q.sort((T, z) => T.name.localeCompare(z.name, 'de')), q)
  }
  function CN(N, R, j) {
    let q = []
    for (let T of j.byId.values()) {
      if (J(T) !== '6') continue
      if (!j.kreisfreieIds.has(M(T))) continue
      if (!V(T, N, R, j)) continue
      q.push({ id: M(T), name: String(T.properties?.name ?? M(T)), level: '6' })
    }
    return (q.sort((T, z) => T.name.localeCompare(z.name, 'de')), q)
  }
  function EN(N, R, j) {
    let q = []
    for (let T of j.byId.values()) {
      if (J(T) !== '9') continue
      if (!V(T, N, R, j)) continue
      q.push({ id: M(T), name: String(T.properties?.name ?? M(T)), level: '9' })
    }
    return (q.sort((T, z) => T.name.localeCompare(z.name, 'de')), q)
  }
  function f(N, R, j, q = [...j.byId.values()]) {
    return c(N, R, j, q)
  }
  function JN(N, R) {
    let j = []
    if (N.gebiet === 'deutschland') j.push('Deutschland')
    else {
      let T = R.byId.get(N.gebiet)
      j.push(String(T?.properties?.name ?? N.gebiet))
    }
    if (N.untergebiet.startsWith('rb:')) {
      let T = N.untergebiet.slice(3)
      j.push(String(R.byId.get(T)?.properties?.name ?? T))
    } else if (N.untergebiet.startsWith('lk:')) {
      let T = N.untergebiet.slice(3)
      j.push(String(R.byId.get(T)?.properties?.name ?? T))
    } else if (N.untergebiet.startsWith('kreisfrei:')) {
      let T = N.untergebiet.slice(9)
      j.push(String(R.byId.get(T)?.properties?.name ?? T))
    } else if (N.untergebiet.startsWith('stadt:')) {
      let T = N.untergebiet.slice(6)
      j.push(String(R.byId.get(T)?.properties?.name ?? T))
    }
    let q = $.find((T) => T.id === N.darstellung)
    return (j.push(q ? B(q, N.gebiet, N.untergebiet) : N.darstellung), j.join(' · '))
  }
  function x(N) {
    return (
      N.darstellung === 'gemeinden' ||
      N.darstellung === 'gemeinden_kreisfrei' ||
      N.darstellung === 'gemeindeverbaende' ||
      N.darstellung === 'gemeindeverbaende_kreisfrei' ||
      N.darstellung === 'stadtbezirke' ||
      N.darstellung === 'stadtteile'
    )
  }
  function MN(N) {
    return x(N)
  }
  function ON(N) {
    if (!N) return ''
    let R = decodeURIComponent(N)
    if (
      R.startsWith('rb:') ||
      R.startsWith('lk:') ||
      R.startsWith('kreisfrei:') ||
      R.startsWith('stadt:')
    )
      return R
    return ''
  }
  function QN(N, R) {
    if (!N || N === 'deutschland' || N === 'de') return 'deutschland'
    let j = decodeURIComponent(N)
    if (R.byId.has(j)) return j
    return 'deutschland'
  }
  function VN(N) {
    if (!N) return null
    let R = decodeURIComponent(N),
      j = s[R] ?? R
    return $.some((q) => q.id === j) ? j : null
  }
  function WN(N, R) {
    if (N === 'bayern-landkreise-kreisfreie' || N === 'bayern-landkreise')
      return {
        gebiet: 'relation/2145268',
        untergebiet: '',
        darstellung:
          N.includes('kreisfrei') && !N.includes('landkreise-kreisfreie')
            ? 'landkreise'
            : 'landkreis_kreisfrei',
      }
    if (N === 'bayern-gemeinden-kreisfreie')
      return { gebiet: 'relation/2145268', untergebiet: '', darstellung: 'gemeinden_kreisfrei' }
    if (N === 'bayern-gemeinden')
      return { gebiet: 'relation/2145268', untergebiet: '', darstellung: 'gemeinden' }
    if (N === 'bayern-kreisfreie-staedte')
      return { gebiet: 'relation/2145268', untergebiet: '', darstellung: 'kreisfreie' }
    if (N.startsWith('landkreis:'))
      return {
        gebiet: 'relation/2145268',
        untergebiet: `lk:${N.slice(10)}`,
        darstellung: 'gemeinden',
      }
    if (N.startsWith('kreisfrei:'))
      return {
        gebiet: 'relation/2145268',
        untergebiet: `kreisfrei:${N.slice(10)}`,
        darstellung: 'gemeinden_kreisfrei',
      }
    if (R.byId.has(N)) {
      let j = R.byId.get(N)
      if (J(j) === '4') return { gebiet: N, untergebiet: '', darstellung: f(N, '', R) }
    }
    return null
  }
  function XN(N, R, j, q) {
    let T = D(R, j)
    if (T) {
      let C = q.byId.get(T)
      if (C?.geometry) return [C]
    }
    if (R === 'deutschland') {
      let C = q.deutschlandId ? q.byId.get(q.deutschlandId) : null
      if (C?.geometry) return [C]
      return N.filter((O) => J(O) === '4')
    }
    let z = q.byId.get(R)
    return z?.geometry ? [z] : []
  }
  globalThis.RegionNav = k
})()
