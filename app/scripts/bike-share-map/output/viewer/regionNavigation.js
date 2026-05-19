;(() => {
  var v = Object.defineProperty
  var s = (N) => N
  function r(N, R) {
    this[N] = s.bind(null, R)
  }
  var d = (N, R) => {
    for (var T in R) v(N, T, { get: R[T], enumerable: !0, configurable: !0, set: r.bind(R, T) })
  }
  var B = {}
  d(B, {
    viewShowsManyGemeinden: () => b,
    viewShowsGemeindenLevel: () => YN,
    viewScopeFromLegacyViewId: () => UN,
    viewLabel: () => XN,
    scopeLevelFor: () => _,
    scopeIdFor: () => U,
    scopeBoundsFeatures: () => DN,
    presetUnitLevels: () => A,
    presetMinLevel: () => P,
    presetLabelForScope: () => I,
    presetIncludesStadtstaatenUnits: () => TN,
    presetCoverageForScope: () => K,
    preferredDarstellungPresetForScope: () => a,
    partialGapRankForScope: () => m,
    parseUntergebietParam: () => ZN,
    parseGebietParam: () => _N,
    parseDarstellungParam: () => $N,
    listStadtbezirkeInGebiet: () => VN,
    listRegierungsbezirkeInGebiet: () => MN,
    listLandkreiseInGebiet: () => ON,
    listKreisfreieInGebiet: () => QN,
    listDarstellungPresetsForScope: () => k,
    listDarstellungPresetGroupsForScope: () => zN,
    listAllBundeslaender: () => RN,
    isStandaloneGemeinde: () => o,
    isStadtstaatGebiet: () => NN,
    isStadtstaatFeature: () => G,
    isPresetAllowedForScope: () => u,
    isKreisfrei: () => e,
    isDeutschlandScope: () => $,
    hasFeaturesForDarstellungPreset: () => x,
    filterFeaturesForView: () => JN,
    featureWithinScope: () => X,
    defaultDarstellungPresetForScope: () => l,
    defaultDarstellungForScope: () => g,
    comparePresetUnitLevelHierarchy: () => f,
    buildRegionIndex: () => i,
    STADTSTAAT_IDS: () => F,
    DISPLAY_PRESETS: () => H,
    DEUTSCHLAND_GEBIET: () => n,
  })
  var n = 'deutschland',
    F = new Set(['relation/62422', 'relation/62782', 'relation/62772']),
    H = [
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
    t = {
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
  function i(N) {
    let R = new Map(),
      T = new Map(),
      q = new Map(),
      j = new Map()
    for (let E of N) {
      let V = M(E)
      if (!V) continue
      R.set(V, E)
      let D = J(E)
      if (D) {
        let W = T.get(D) ?? []
        ;(W.push(V), T.set(D, W))
      }
      let S = E.properties?.parent_id
      if (S) {
        q.set(V, S)
        let W = j.get(S) ?? []
        ;(W.push(E), j.set(S, W))
      }
    }
    let z = new Set()
    for (let E of N) {
      if (J(E) !== '8') continue
      let V = E.properties?.landkreis_id
      if (V) z.add(V)
    }
    let C = new Set()
    for (let E of N) {
      if (J(E) !== '6') continue
      let V = M(E)
      if (!z.has(V)) C.add(V)
    }
    let O = null,
      Q = []
    for (let E of N) {
      if (J(E) !== '4') continue
      let V = M(E),
        D = String(E.properties?.name ?? V)
      Q.push({ id: V, name: D, level: '4' })
    }
    Q.sort((E, V) => E.name.localeCompare(V.name, 'de'))
    for (let E of N)
      if (J(E) === '2') {
        O = M(E)
        break
      }
    let Y = Q.filter((E) => !F.has(E.id)),
      Z = Q.filter((E) => F.has(E.id))
    return {
      deutschlandId: O,
      kreisfreieIds: C,
      parentById: q,
      byId: R,
      idsByLevel: T,
      bundeslaender: Q,
      flaechenlaender: Y,
      stadtstaaten: Z,
    }
  }
  function e(N, R) {
    return R.kreisfreieIds.has(N)
  }
  function NN(N) {
    return N !== 'deutschland' && F.has(N)
  }
  function G(N) {
    return J(N) === '4' && F.has(M(N))
  }
  function RN(N) {
    return [...N.bundeslaender]
  }
  function TN(N) {
    return (
      N === 'landkreis_kreisfrei' ||
      N === 'gemeindeverbaende_kreisfrei' ||
      N === 'gemeinden_kreisfrei'
    )
  }
  function I(N, R, T) {
    if (!$(R, T)) return N.label
    if (N.id === 'landkreis_kreisfrei') return 'Landkreise, kreisfreie Städte und Stadtstaaten'
    if (N.id === 'gemeindeverbaende_kreisfrei')
      return 'Gemeindeverbände, Einzelgemeinden, kreisfreie Städte und Stadtstaaten'
    if (N.id === 'gemeinden_kreisfrei') return 'Gemeinden, kreisfreie Städte und Stadtstaaten'
    return N.label
  }
  function $(N, R) {
    return N === 'deutschland' && !R
  }
  function _(N, R) {
    if (N === 'deutschland') return 2
    if (!R) return 4
    if (R.startsWith('rb:')) return 5
    if (R.startsWith('lk:') || R.startsWith('kreisfrei:') || R.startsWith('stadt:')) return 6
    return 4
  }
  function U(N, R) {
    if (R.startsWith('rb:')) return R.slice(3)
    if (R.startsWith('lk:')) return R.slice(3)
    if (R.startsWith('kreisfrei:')) return R.slice(9)
    if (R.startsWith('stadt:')) return R.slice(6)
    if (N === 'deutschland') return null
    return N
  }
  function y(N, R) {
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
  function o(N, R) {
    if (J(N) !== '8') return !1
    let T = M(N)
    for (let j of y(T, R)) {
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
  function h(N, R, T) {
    let q = J(N),
      j = M(N)
    if (q === '7') return !0
    if (o(N, T)) return !0
    if (R === 'gemeindeverbaende_kreisfrei' && q === '6' && T.kreisfreieIds.has(j)) return !0
    return !1
  }
  function X(N, R, T, q) {
    let j = M(N)
    if (!j || !N.geometry) return !1
    let z = U(R, T)
    if (R === 'deutschland' && !T) return !0
    if (!z) return !1
    if (j === z) return !0
    if (y(j, q).includes(z)) return !0
    let C = J(N),
      O = N.properties ?? {}
    if (_(R, T) === 4 && C > '4' && O.bundesland_id === z) return !0
    if (_(R, T) === 6 && C > '6' && O.landkreis_id === z) return !0
    return !1
  }
  function c(N, R, T, q, j) {
    let z = J(N),
      C = M(N),
      O = T.kreisfreieIds.has(C),
      Q = $(q, j)
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
        return z === '6' || (Q && G(N))
      case 'gemeindeverbaende':
        return h(N, 'gemeindeverbaende', T)
      case 'gemeindeverbaende_kreisfrei':
        return h(N, 'gemeindeverbaende_kreisfrei', T) || (Q && G(N))
      case 'gemeinden':
        return z === '8'
      case 'gemeinden_kreisfrei':
        return z === '8' || (z === '6' && O) || (Q && G(N))
      case 'stadtbezirke':
        return z === '9'
      case 'stadtteile':
        return z === '10'
      default:
        return !1
    }
  }
  function P(N) {
    return H.find((T) => T.id === N)?.minLevel ?? 99
  }
  function w(N, R, T) {
    for (let q of T.byId.values()) {
      if (J(q) !== '6') continue
      if (!T.kreisfreieIds.has(M(q))) continue
      if (X(q, N, R, T)) return !0
    }
    return !1
  }
  function jN(N, R, T) {
    if (R) return !1
    if (N === 'deutschland') return !1
    let q = 0
    for (let j of T.byId.values()) {
      if (J(j) !== '5') continue
      if (j.properties?.bundesland_id !== N) continue
      if (!X(j, N, '', T)) continue
      q++
    }
    return q > 0
  }
  function K(N, R, T, q, j) {
    let z = w(T, q, j),
      C = jN(T, q, j)
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
  function m(N, R, T, q, j) {
    if (K(N, R, T, q, j) === 'full') return 0
    let z = w(T, q, j)
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
  function A(N, R, T) {
    let j = $(R, T) ? [4] : [],
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
  function f(N, R) {
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
  function qN(N, R, T, q, j, z) {
    let C = K(N.id, T, q, j, z),
      O = K(R.id, T, q, j, z)
    if (C !== O) return C === 'full' ? -1 : 1
    if (N.sortLevel !== R.sortLevel) return N.sortLevel - R.sortLevel
    let Q = f(A(N.id, q, j), A(R.id, q, j))
    if (Q !== 0) return Q
    if (C === 'partial') {
      let Y = m(N.id, T, q, j, z),
        Z = m(R.id, T, q, j, z)
      if (Y !== Z) return Y - Z
    }
    return N.label.localeCompare(R.label, 'de')
  }
  function x(N, R, T, q) {
    let j = _(R.gebiet, R.untergebiet),
      z = U(R.gebiet, R.untergebiet),
      C = p(N, { ...R, darstellung: T }, q)
    for (let O of C) {
      if (!c(O, T, q, R.gebiet, R.untergebiet)) continue
      if (!X(O, R.gebiet, R.untergebiet, q)) continue
      if (z && M(O) === z && P(T) <= j) continue
      return !0
    }
    return !1
  }
  function k(N, R, T) {
    let q = _(N.gebiet, N.untergebiet)
    return H.filter((z) => {
      if (!u(z.id, q, R, N.gebiet, N.untergebiet)) return !1
      return x(T, N, z.id, R)
    }).sort((z, C) => qN(z, C, q, N.gebiet, N.untergebiet, R))
  }
  function zN(N, R, T) {
    let q = k(N, R, T)
    return q.length ? [{ coverage: 'full', label: '', presets: q }] : []
  }
  function a(N, R) {
    if ($(N, R)) return 'landkreis_kreisfrei'
    if (R.startsWith('lk:')) return 'gemeinden'
    if (R.startsWith('rb:')) return 'landkreis_kreisfrei'
    if (N !== 'deutschland' && !R) return 'landkreis_kreisfrei'
    return null
  }
  function l(N, R, T, q) {
    let j = k({ gebiet: N, untergebiet: R, darstellung: 'bundeslaender' }, T, q),
      z = new Set(j.map((O) => O.id)),
      C = a(N, R)
    if (C && z.has(C)) return C
    if (j[0]) return j[0].id
    return 'bundeslaender'
  }
  function u(N, R, T, q, j) {
    if (P(N) <= R) return !1
    let C = U(q, j)
    if (q === 'deutschland' && !j) {
      if (N === 'regierungsbezirke') return EN(T, '5', 'deutschland', '', T) > 0
      return !0
    }
    if (!C) return !1
    if (N === 'regierungsbezirke') return CN(C, '5', T) > 0
    if (N === 'stadtbezirke') return L(C, '9', T) > 0
    if (N === 'stadtteile') return L(C, '10', T) > 0
    return !0
  }
  function CN(N, R, T) {
    let q = 0
    for (let j of T.byId.values()) {
      if (J(j) !== R) continue
      if (j.properties?.parent_id === N) q++
    }
    return q
  }
  function L(N, R, T) {
    let q = 0
    for (let j of T.byId.values()) {
      if (J(j) !== R) continue
      let z = M(j)
      if (z === N) continue
      if (y(z, T).includes(N)) q++
      else if (j.properties?.bundesland_id === N) q++
      else if (j.properties?.landkreis_id === N) q++
    }
    return q
  }
  function EN(N, R, T, q, j) {
    let z = 0
    for (let C of N.byId.values()) {
      if (J(C) !== R) continue
      if (X(C, T, q, N)) z++
    }
    return z
  }
  function p(N, R, T) {
    let q = $(R.gebiet, R.untergebiet),
      z = ((Q) => {
        switch (Q) {
          case 'bundeslaender':
            return ['4']
          case 'regierungsbezirke':
            return ['5']
          case 'landkreise':
          case 'kreisfreie':
            return ['6']
          case 'landkreis_kreisfrei':
            return q ? ['4', '6'] : ['6']
          case 'gemeinden':
            return ['8']
          case 'gemeinden_kreisfrei':
            return q ? ['4', '6', '8'] : ['6', '8']
          case 'stadtbezirke':
            return ['9']
          case 'stadtteile':
            return ['10']
          default:
            return null
        }
      })(R.darstellung)
    if (!z) return N
    let C = [],
      O = new Set()
    for (let Q of z)
      for (let Y of T.idsByLevel.get(Q) ?? []) {
        if (O.has(Y)) continue
        O.add(Y)
        let Z = T.byId.get(Y)
        if (Z) C.push(Z)
      }
    return C
  }
  function JN(N, R, T) {
    let q = _(R.gebiet, R.untergebiet),
      j = U(R.gebiet, R.untergebiet)
    return p(N, R, T).filter((C) => {
      if (!c(C, R.darstellung, T, R.gebiet, R.untergebiet)) return !1
      if (!X(C, R.gebiet, R.untergebiet, T)) return !1
      if (j && M(C) === j && P(R.darstellung) <= q) return !1
      return !0
    })
  }
  function MN(N, R) {
    let T = []
    for (let q of R.byId.values()) {
      if (J(q) !== '5') continue
      if (N !== 'deutschland' && q.properties?.bundesland_id !== N) continue
      if (!X(q, N, '', R)) continue
      T.push({ id: M(q), name: String(q.properties?.name ?? M(q)), level: '5' })
    }
    return (T.sort((q, j) => q.name.localeCompare(j.name, 'de')), T)
  }
  function ON(N, R, T) {
    let q = []
    for (let j of T.byId.values()) {
      if (J(j) !== '6') continue
      if (T.kreisfreieIds.has(M(j))) continue
      if (!X(j, N, R, T)) continue
      q.push({ id: M(j), name: String(j.properties?.name ?? M(j)), level: '6' })
    }
    return (q.sort((j, z) => j.name.localeCompare(z.name, 'de')), q)
  }
  function QN(N, R, T) {
    let q = []
    for (let j of T.byId.values()) {
      if (J(j) !== '6') continue
      if (!T.kreisfreieIds.has(M(j))) continue
      if (!X(j, N, R, T)) continue
      q.push({ id: M(j), name: String(j.properties?.name ?? M(j)), level: '6' })
    }
    return (q.sort((j, z) => j.name.localeCompare(z.name, 'de')), q)
  }
  function VN(N, R, T) {
    let q = []
    for (let j of T.byId.values()) {
      if (J(j) !== '9') continue
      if (!X(j, N, R, T)) continue
      q.push({ id: M(j), name: String(j.properties?.name ?? M(j)), level: '9' })
    }
    return (q.sort((j, z) => j.name.localeCompare(z.name, 'de')), q)
  }
  function g(N, R, T, q = [...T.byId.values()]) {
    return l(N, R, T, q)
  }
  function XN(N, R) {
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
    let q = H.find((j) => j.id === N.darstellung)
    return (T.push(q ? I(q, N.gebiet, N.untergebiet) : N.darstellung), T.join(' · '))
  }
  function b(N) {
    return (
      N.darstellung === 'gemeinden' ||
      N.darstellung === 'gemeinden_kreisfrei' ||
      N.darstellung === 'gemeindeverbaende' ||
      N.darstellung === 'gemeindeverbaende_kreisfrei' ||
      N.darstellung === 'stadtbezirke' ||
      N.darstellung === 'stadtteile'
    )
  }
  function YN(N) {
    return b(N)
  }
  function ZN(N) {
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
  function _N(N, R) {
    if (!N || N === 'deutschland' || N === 'de') return 'deutschland'
    let T = decodeURIComponent(N)
    if (R.byId.has(T)) return T
    return 'deutschland'
  }
  function $N(N) {
    if (!N) return null
    let R = decodeURIComponent(N),
      T = t[R] ?? R
    return H.some((q) => q.id === T) ? T : null
  }
  function UN(N, R) {
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
      if (J(T) === '4') return { gebiet: N, untergebiet: '', darstellung: g(N, '', R) }
    }
    return null
  }
  function DN(N, R, T, q) {
    let j = U(R, T)
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
  globalThis.RegionNav = B
})()
