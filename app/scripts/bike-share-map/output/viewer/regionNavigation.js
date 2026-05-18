;(() => {
  var a = Object.defineProperty
  var x = (N) => N
  function p(N, R) {
    this[N] = x.bind(null, R)
  }
  var u = (N, R) => {
    for (var T in R) a(N, T, { get: R[T], enumerable: !0, configurable: !0, set: p.bind(R, T) })
  }
  var k = {}
  u(k, {
    viewShowsManyGemeinden: () => l,
    viewShowsGemeindenLevel: () => JN,
    viewScopeFromLegacyViewId: () => VN,
    viewLabel: () => EN,
    scopeLevelFor: () => Y,
    scopeIdFor: () => D,
    scopeBoundsFeatures: () => WN,
    presetUnitLevels: () => S,
    presetMinLevel: () => K,
    presetLabelForScope: () => B,
    presetIncludesStadtstaatenUnits: () => n,
    presetCoverageForScope: () => $,
    partialGapRankForScope: () => H,
    parseUntergebietParam: () => MN,
    parseGebietParam: () => ON,
    parseDarstellungParam: () => QN,
    listStadtbezirkeInGebiet: () => CN,
    listRegierungsbezirkeInGebiet: () => jN,
    listLandkreiseInGebiet: () => qN,
    listKreisfreieInGebiet: () => zN,
    listDarstellungPresetsForScope: () => P,
    listDarstellungPresetGroupsForScope: () => NN,
    listAllBundeslaender: () => d,
    isStandaloneGemeinde: () => h,
    isStadtstaatGebiet: () => r,
    isStadtstaatFeature: () => G,
    isPresetAllowedForScope: () => c,
    isKreisfrei: () => s,
    isDeutschlandScope: () => F,
    filterFeaturesForView: () => w,
    featureWithinScope: () => V,
    defaultDarstellungPresetForScope: () => o,
    defaultDarstellungForScope: () => f,
    comparePresetUnitLevelHierarchy: () => I,
    buildRegionIndex: () => b,
    STADTSTAAT_IDS: () => _,
    DISPLAY_PRESETS: () => U,
    DEUTSCHLAND_GEBIET: () => g,
  })
  var g = 'deutschland',
    _ = new Set(['relation/62422', 'relation/62782', 'relation/62772']),
    U = [
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
    v = {
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
      T = new Map(),
      q = new Map()
    for (let E of N) {
      let Q = M(E)
      if (!Q) continue
      R.set(Q, E)
      let X = E.properties?.parent_id
      if (X) {
        T.set(Q, X)
        let Z = q.get(X) ?? []
        ;(Z.push(E), q.set(X, Z))
      }
    }
    let j = new Set()
    for (let E of N) {
      if (J(E) !== '6') continue
      let Q = M(E)
      if (!N.some((Z) => J(Z) === '8' && Z.properties?.landkreis_id === Q)) j.add(Q)
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
    let O = C.filter((E) => !_.has(E.id)),
      W = C.filter((E) => _.has(E.id))
    return {
      deutschlandId: z,
      kreisfreieIds: j,
      parentById: T,
      byId: R,
      bundeslaender: C,
      flaechenlaender: O,
      stadtstaaten: W,
    }
  }
  function s(N, R) {
    return R.kreisfreieIds.has(N)
  }
  function r(N) {
    return N !== 'deutschland' && _.has(N)
  }
  function G(N) {
    return J(N) === '4' && _.has(M(N))
  }
  function d(N) {
    return [...N.bundeslaender]
  }
  function n(N) {
    return (
      N === 'landkreis_kreisfrei' ||
      N === 'gemeindeverbaende_kreisfrei' ||
      N === 'gemeinden_kreisfrei'
    )
  }
  function B(N, R, T) {
    if (!F(R, T)) return N.label
    if (N.id === 'landkreis_kreisfrei') return 'Landkreise, kreisfreie Städte und Stadtstaaten'
    if (N.id === 'gemeindeverbaende_kreisfrei')
      return 'Gemeindeverbände, Einzelgemeinden, kreisfreie Städte und Stadtstaaten'
    if (N.id === 'gemeinden_kreisfrei') return 'Gemeinden, kreisfreie Städte und Stadtstaaten'
    return N.label
  }
  function F(N, R) {
    return N === 'deutschland' && !R
  }
  function Y(N, R) {
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
    let T = [],
      q = N,
      j = new Set()
    while (q && !j.has(q)) {
      j.add(q)
      let z = R.parentById.get(q)
      if (!z) break
      ;(T.push(z), (q = z))
    }
    return T
  }
  function h(N, R) {
    if (J(N) !== '8') return !1
    let T = M(N)
    for (let j of m(T, R)) {
      let z = R.byId.get(j)
      if (z && J(z) === '7') return !1
    }
    let q = R.parentById.get(T)
    if (q) {
      let j = R.byId.get(q)
      if (j && J(j) === '7') return !1
    }
    return !0
  }
  function y(N, R, T) {
    let q = J(N),
      j = M(N)
    if (q === '7') return !0
    if (h(N, T)) return !0
    if (R === 'gemeindeverbaende_kreisfrei' && q === '6' && T.kreisfreieIds.has(j)) return !0
    return !1
  }
  function V(N, R, T, q) {
    let j = M(N)
    if (!j || !N.geometry) return !1
    let z = D(R, T)
    if (R === 'deutschland' && !T) return !0
    if (!z) return !1
    if (j === z) return !0
    if (m(j, q).includes(z)) return !0
    let C = J(N),
      O = N.properties ?? {}
    if (Y(R, T) === 4 && C > '4' && O.bundesland_id === z) return !0
    if (Y(R, T) === 6 && C > '6' && O.landkreis_id === z) return !0
    return !1
  }
  function t(N, R, T, q, j) {
    let z = J(N),
      C = M(N),
      O = T.kreisfreieIds.has(C),
      W = F(q, j)
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
        return y(N, 'gemeindeverbaende', T)
      case 'gemeindeverbaende_kreisfrei':
        return y(N, 'gemeindeverbaende_kreisfrei', T) || (W && G(N))
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
    return U.find((T) => T.id === N)?.minLevel ?? 99
  }
  function L(N, R, T) {
    for (let q of T.byId.values()) {
      if (J(q) !== '6') continue
      if (!T.kreisfreieIds.has(M(q))) continue
      if (V(q, N, R, T)) return !0
    }
    return !1
  }
  function i(N, R, T) {
    if (R) return !1
    if (N === 'deutschland') return !1
    let q = 0
    for (let j of T.byId.values()) {
      if (J(j) !== '5') continue
      if (j.properties?.bundesland_id !== N) continue
      if (!V(j, N, '', T)) continue
      q++
    }
    return q > 0
  }
  function $(N, R, T, q, j) {
    let z = L(T, q, j),
      C = i(T, q, j)
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
  function H(N, R, T, q, j) {
    if ($(N, R, T, q, j) === 'full') return 0
    let z = L(T, q, j)
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
  function S(N, R, T) {
    let j = F(R, T) ? [4] : [],
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
        return [...j, 6]
      case 'gemeindeverbaende':
        return [7, 8]
      case 'gemeindeverbaende_kreisfrei':
        return [...j, ...z, 7, 8]
      case 'gemeinden':
        return [8]
      case 'gemeinden_kreisfrei':
        return [...j, ...z, 8]
      case 'stadtbezirke':
        return [9]
      case 'stadtteile':
        return [10]
      default:
        return []
    }
  }
  function I(N, R) {
    let T = Math.max(N.length, R.length)
    for (let q = 0; q < T; q++) {
      let j = N[q],
        z = R[q]
      if (j === void 0 && z === void 0) continue
      if (j === void 0) return -1
      if (z === void 0) return 1
      if (j !== z) return j - z
    }
    return 0
  }
  function e(N, R, T, q, j, z) {
    let C = $(N.id, T, q, j, z),
      O = $(R.id, T, q, j, z)
    if (C !== O) return C === 'full' ? -1 : 1
    if (C === 'partial') {
      let E = H(N.id, T, q, j, z),
        Q = H(R.id, T, q, j, z)
      if (E !== Q) return E - Q
    }
    let W = I(S(N.id, q, j), S(R.id, q, j))
    if (W !== 0) return W
    return N.label.localeCompare(R.label, 'de')
  }
  function P(N, R, T) {
    let q = Y(N.gebiet, N.untergebiet)
    return U.filter((z) => {
      if (!c(z.id, q, R, N.gebiet, N.untergebiet)) return !1
      return w(T, { ...N, darstellung: z.id }, R).length > 0
    }).sort((z, C) => e(z, C, q, N.gebiet, N.untergebiet, R))
  }
  function NN(N, R, T) {
    let q = P(N, R, T)
    return q.length ? [{ coverage: 'full', label: '', presets: q }] : []
  }
  function o(N, R, T, q) {
    let j = P({ gebiet: N, untergebiet: R, darstellung: 'bundeslaender' }, T, q),
      z = Y(N, R),
      C = j.find((O) => $(O.id, z, N, R, T) === 'full')
    if (C) return C.id
    if (j[0]) return j[0].id
    return 'bundeslaender'
  }
  function c(N, R, T, q, j) {
    if (K(N) <= R) return !1
    let C = D(q, j)
    if (q === 'deutschland' && !j) {
      if (N === 'regierungsbezirke') return TN(T, '5', 'deutschland', '', T) > 0
      return !0
    }
    if (!C) return !1
    if (N === 'regierungsbezirke') return RN(C, '5', T) > 0
    if (N === 'stadtbezirke') return A(C, '9', T) > 0
    if (N === 'stadtteile') return A(C, '10', T) > 0
    return !0
  }
  function RN(N, R, T) {
    let q = 0
    for (let j of T.byId.values()) {
      if (J(j) !== R) continue
      if (j.properties?.parent_id === N) q++
    }
    return q
  }
  function A(N, R, T) {
    let q = 0
    for (let j of T.byId.values()) {
      if (J(j) !== R) continue
      let z = M(j)
      if (z === N) continue
      if (m(z, T).includes(N)) q++
      else if (j.properties?.bundesland_id === N) q++
      else if (j.properties?.landkreis_id === N) q++
    }
    return q
  }
  function TN(N, R, T, q, j) {
    let z = 0
    for (let C of N.byId.values()) {
      if (J(C) !== R) continue
      if (V(C, T, q, N)) z++
    }
    return z
  }
  function w(N, R, T) {
    let q = Y(R.gebiet, R.untergebiet),
      j = D(R.gebiet, R.untergebiet)
    return N.filter((z) => {
      if (!t(z, R.darstellung, T, R.gebiet, R.untergebiet)) return !1
      if (!V(z, R.gebiet, R.untergebiet, T)) return !1
      if (j && M(z) === j && K(R.darstellung) <= q) return !1
      return !0
    })
  }
  function jN(N, R) {
    let T = []
    for (let q of R.byId.values()) {
      if (J(q) !== '5') continue
      if (N !== 'deutschland' && q.properties?.bundesland_id !== N) continue
      if (!V(q, N, '', R)) continue
      T.push({ id: M(q), name: String(q.properties?.name ?? M(q)), level: '5' })
    }
    return (T.sort((q, j) => q.name.localeCompare(j.name, 'de')), T)
  }
  function qN(N, R, T) {
    let q = []
    for (let j of T.byId.values()) {
      if (J(j) !== '6') continue
      if (T.kreisfreieIds.has(M(j))) continue
      if (!V(j, N, R, T)) continue
      q.push({ id: M(j), name: String(j.properties?.name ?? M(j)), level: '6' })
    }
    return (q.sort((j, z) => j.name.localeCompare(z.name, 'de')), q)
  }
  function zN(N, R, T) {
    let q = []
    for (let j of T.byId.values()) {
      if (J(j) !== '6') continue
      if (!T.kreisfreieIds.has(M(j))) continue
      if (!V(j, N, R, T)) continue
      q.push({ id: M(j), name: String(j.properties?.name ?? M(j)), level: '6' })
    }
    return (q.sort((j, z) => j.name.localeCompare(z.name, 'de')), q)
  }
  function CN(N, R, T) {
    let q = []
    for (let j of T.byId.values()) {
      if (J(j) !== '9') continue
      if (!V(j, N, R, T)) continue
      q.push({ id: M(j), name: String(j.properties?.name ?? M(j)), level: '9' })
    }
    return (q.sort((j, z) => j.name.localeCompare(z.name, 'de')), q)
  }
  function f(N, R, T, q = [...T.byId.values()]) {
    return o(N, R, T, q)
  }
  function EN(N, R) {
    let T = []
    if (N.gebiet === 'deutschland') T.push('Deutschland')
    else {
      let j = R.byId.get(N.gebiet)
      T.push(String(j?.properties?.name ?? N.gebiet))
    }
    if (N.untergebiet.startsWith('rb:')) {
      let j = N.untergebiet.slice(3)
      T.push(String(R.byId.get(j)?.properties?.name ?? j))
    } else if (N.untergebiet.startsWith('lk:')) {
      let j = N.untergebiet.slice(3)
      T.push(String(R.byId.get(j)?.properties?.name ?? j))
    } else if (N.untergebiet.startsWith('kreisfrei:')) {
      let j = N.untergebiet.slice(9)
      T.push(String(R.byId.get(j)?.properties?.name ?? j))
    } else if (N.untergebiet.startsWith('stadt:')) {
      let j = N.untergebiet.slice(6)
      T.push(String(R.byId.get(j)?.properties?.name ?? j))
    }
    let q = U.find((j) => j.id === N.darstellung)
    return (T.push(q ? B(q, N.gebiet, N.untergebiet) : N.darstellung), T.join(' · '))
  }
  function l(N) {
    return (
      N.darstellung === 'gemeinden' ||
      N.darstellung === 'gemeinden_kreisfrei' ||
      N.darstellung === 'gemeindeverbaende' ||
      N.darstellung === 'gemeindeverbaende_kreisfrei' ||
      N.darstellung === 'stadtbezirke' ||
      N.darstellung === 'stadtteile'
    )
  }
  function JN(N) {
    return l(N)
  }
  function MN(N) {
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
  function ON(N, R) {
    if (!N || N === 'deutschland' || N === 'de') return 'deutschland'
    let T = decodeURIComponent(N)
    if (R.byId.has(T)) return T
    return 'deutschland'
  }
  function QN(N) {
    if (!N) return null
    let R = decodeURIComponent(N),
      T = v[R] ?? R
    return U.some((q) => q.id === T) ? T : null
  }
  function VN(N, R) {
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
      let T = R.byId.get(N)
      if (J(T) === '4') return { gebiet: N, untergebiet: '', darstellung: f(N, '', R) }
    }
    return null
  }
  function WN(N, R, T, q) {
    let j = D(R, T)
    if (j) {
      let C = q.byId.get(j)
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
