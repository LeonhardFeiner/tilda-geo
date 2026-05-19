;(() => {
  var v = Object.defineProperty
  var i = (p) => p
  function l(p, n) {
    this[p] = i.bind(null, n)
  }
  var g = (p, n) => {
    for (var x in n) v(p, x, { get: n[x], enumerable: !0, configurable: !0, set: l.bind(n, x) })
  }
  var t = {}
  g(t, {
    roadClassForKey: () => Y,
    maplibreRoadOverlayFiltersForHighwayTag: () => jp,
    maplibreRoadOverlayFiltersForClass: () => Vp,
    maplibrePropertyInFilter: () => E,
    maplibreBikelaneOverlayFilterForTag: () => Wp,
    maplibreBikelaneOverlayFilterForClass: () => zp,
    listFilteredRoadClassLengths: () => cp,
    listFilteredHighwayTagLengths: () => Np,
    listFilteredBikelaneTagLengths: () => qp,
    listFilteredBikelaneClassLengths: () => Hp,
    isLowRoadNetworkForScale: () => I,
    highwayTagsForRoadClass: () => k,
    highwayClassDefinition: () => F,
    getRoadSums: () => K,
    getBikelaneSums: () => o,
    formatStatPctUi: () => xp,
    formatStatPct: () => A,
    formatStatKm: () => np,
    enabledRoadHighwayTags: () => Pp,
    enabledResidentialRoadHighwayTags: () => Ep,
    enabledMajorRoadHighwayTags: () => Qp,
    enabledBikelaneCategoryTags: () => Fp,
    computeFilteredLengths: () => Mp,
    computeChoroplethScaleRange: () => d,
    combineMaplibreFilters: () => Yp,
    bikelaneCategoryTags: () => V,
    STAT_PCT_UI_DECIMALS: () => O,
    STAT_PCT_MAX_DECIMALS: () => C,
    STAT_KM_ROAD_UI_DECIMALS: () => pp,
    STAT_KM_MAX_DECIMALS: () => w,
    STAT_KM_BIKE_UI_DECIMALS: () => s,
    ROAD_CLASS_ORDER: () => T,
    ROAD_CLASS_LABELS: () => D,
    RADINFRA_DEFAULT_FILTER: () => a,
    DEFAULT_PERCENTILE_HIGH: () => h,
    DEFAULT_MIN_ROAD_KM_FOR_SCALE: () => R,
    DEFAULT_IQR_MULTIPLIER: () => f,
    BIKELANE_CLASS_ORDER: () => W,
    BIKELANE_CLASS_LABELS: () => S,
  })
  var R = 5,
    h = 0.95,
    f = 1.5
  function I(p, n = 5) {
    return !(Number.isFinite(p) && p >= n)
  }
  function X(p, n) {
    if (!p.length) return Number.NaN
    if (p.length === 1) return p[0]
    let x = n * (p.length - 1),
      c = Math.floor(x),
      M = Math.ceil(x),
      H = x - c
    return p[c] * (1 - H) + p[M] * H
  }
  function d(p, n = {}) {
    let x = n.minRoadKmForScale ?? 5,
      c = n.robustEnabled ?? !0,
      M = n.percentileHigh ?? 0.95,
      H = n.iqrMultiplier ?? 1.5,
      q = n.manualCapEnabled ?? !1,
      P = n.manualCapPct ?? 50,
      j = p.filter((U) => Number.isFinite(U.bikeSharePct))
    if (!j.length)
      return {
        min: 0,
        max: 20,
        dataMin: 0,
        dataMax: 20,
        scaleCapped: !1,
        capPct: P,
        representativeMax: 20,
        outlierCount: 0,
        excludedLowRoadCount: 0,
        robustApplied: !1,
      }
    let m = j.map((U) => U.bikeSharePct),
      _ = Math.min(...m),
      Z = Math.max(...m),
      B = j.filter((U) => !I(U.roadSumKm, x)),
      y = j.length - B.length,
      b = B.map((U) => U.bikeSharePct).sort((U, z) => U - z),
      G = Z,
      L = 0,
      u = !1
    if (c && b.length > 0) {
      if (((u = !0), (G = X(b, M)), b.length >= 4)) {
        let U = X(b, 0.25),
          z = X(b, 0.75),
          e = z + H * (z - U)
        G = Math.min(G, e)
      }
      L = b.filter((U) => U > G + 0.000000001).length
    } else if (b.length > 0) G = b[b.length - 1]
    let $ = G,
      J = !1,
      r = c && Z > G + 0.01
    if (q && $ > P) (($ = P), (J = !0))
    else if (r) J = !0
    return {
      min: 0,
      max: $,
      dataMin: _,
      dataMax: Z,
      scaleCapped: J,
      capPct: q ? P : G,
      representativeMax: G,
      outlierCount: L,
      excludedLowRoadCount: y,
      robustApplied: u,
    }
  }
  var T = ['motorway_like', 'primary_like', 'secondary_like', 'residential_like'],
    D = {
      motorway_like: 'Autobahn & Kraftfahrstraßen',
      primary_like: 'Bundes- und Landesstraßen',
      secondary_like: 'Kreis- und Nebenstraßen',
      residential_like: 'Wohn- und Erschließungsstraßen',
    },
    F = {
      motorway: 'motorway_like',
      motorway_link: 'motorway_like',
      trunk: 'primary_like',
      trunk_link: 'primary_like',
      primary: 'primary_like',
      primary_link: 'primary_like',
      secondary: 'primary_like',
      secondary_link: 'primary_like',
      tertiary: 'primary_like',
      tertiary_link: 'primary_like',
      unclassified: 'secondary_like',
      service_road: 'secondary_like',
      service_uncategorized: 'secondary_like',
      service_alley: 'secondary_like',
      service_driveway: 'secondary_like',
      service_emergency_access: 'secondary_like',
      residential: 'residential_like',
      residential_priority_road: 'residential_like',
      bicycle_road: 'residential_like',
      living_street: 'residential_like',
      pedestrian: 'residential_like',
      unspecified_road: 'residential_like',
    },
    W = [
      'needsClarification',
      'bike_with_foot_traffic',
      'bike_with_car_traffic',
      'bike_next_to_foot_traffic',
      'bike_next_to_car_traffic',
      'separate_bike_traffic',
    ],
    S = {
      needsClarification: 'Klärung nötig',
      bike_with_foot_traffic: 'Rad mit Fußverkehr',
      bike_with_car_traffic: 'Rad mit Kfz-Verkehr',
      bike_next_to_foot_traffic: 'Rad neben Fußverkehr',
      bike_next_to_car_traffic: 'Rad neben Kfz-Verkehr',
      separate_bike_traffic: 'Getrennter Radverkehr',
    },
    V = {
      needsClarification: ['needsClarification'],
      bike_with_foot_traffic: [
        'footwayBicycleYes_isolated',
        'pedestrianAreaBicycleYes',
        'footwayBicycleYes_adjoining',
        'footwayBicycleYes_adjoiningOrIsolated',
      ],
      bike_with_car_traffic: [
        'sharedMotorVehicleLane',
        'bicycleRoad_vehicleDestination',
        'sharedBusLaneBusWithBike',
        'sharedBusLaneBikeWithBus',
      ],
      bike_next_to_foot_traffic: [
        'footAndCyclewayShared_isolated',
        'footAndCyclewayShared_adjoining',
        'footAndCyclewayShared_adjoiningOrIsolated',
      ],
      bike_next_to_car_traffic: [
        'cyclewayOnHighway_exclusive',
        'cyclewayOnHighwayBetweenLanes',
        'cyclewayLink',
        'crossing',
        'cyclewayOnHighway_advisory',
        'cyclewayOnHighway_advisoryOrExclusive',
      ],
      separate_bike_traffic: [
        'footAndCyclewaySegregated_adjoining',
        'footAndCyclewaySegregated_adjoiningOrIsolated',
        'cycleway_isolated',
        'cycleway_adjoining',
        'bicycleRoad',
        'footAndCyclewaySegregated_isolated',
        'cycleway_adjoiningOrIsolated',
        'cyclewayOnHighwayProtected',
      ],
    },
    a = {
      road: { motorway_like: !0, primary_like: !0, secondary_like: !0, residential_like: !0 },
      bikelane: {
        needsClarification: !0,
        bike_with_foot_traffic: !0,
        bike_with_car_traffic: !0,
        bike_next_to_foot_traffic: !0,
        bike_next_to_car_traffic: !0,
        separate_bike_traffic: !0,
      },
    },
    w = 3,
    C = 3,
    O = 1,
    s = 1,
    pp = 0
  function np(p, n = w) {
    if (!Number.isFinite(p)) return '–'
    return p.toLocaleString('de-DE', { maximumFractionDigits: n })
  }
  function A(p, n = C, x = 0) {
    if (!Number.isFinite(p)) return '–'
    return p.toLocaleString('de-DE', { minimumFractionDigits: x, maximumFractionDigits: n })
  }
  function xp(p) {
    return A(p, O, O)
  }
  function N(p) {
    let n = 0
    for (let x of p) if (typeof x === 'number' && Number.isFinite(x)) n += x
    return n
  }
  function Q(p) {
    if (p == null) return {}
    if (typeof p === 'string')
      try {
        return Q(JSON.parse(p))
      } catch {
        return {}
      }
    if (typeof p !== 'object' || Array.isArray(p)) return {}
    let n = {}
    for (let [x, c] of Object.entries(p)) {
      let M = typeof c === 'number' ? c : Number(c)
      if (Number.isFinite(M)) n[x] = M
    }
    return n
  }
  function Y(p) {
    return F[p] ?? 'secondary_like'
  }
  function K(p) {
    let n = (x) =>
      Object.entries(p)
        .map(([c, M]) => (Y(c) === x ? M : void 0))
        .filter((c) => typeof c === 'number' && Number.isFinite(c))
    return {
      sum: N(Object.values(p)),
      motorway_like: N(n('motorway_like')),
      primary_like: N(n('primary_like')),
      secondary_like: N(n('secondary_like')),
      residential_like: N(n('residential_like')),
    }
  }
  function o(p) {
    let n = p ?? {},
      x = (c) =>
        Object.entries(n)
          .map(([M, H]) => {
            return (V[c] ?? []).includes(M) ? H : void 0
          })
          .filter((M) => typeof M === 'number' && Number.isFinite(M))
    return {
      sum: N(Object.values(n)),
      needsClarification: N(x('needsClarification')),
      bike_with_foot_traffic: N(x('bike_with_foot_traffic')),
      bike_with_car_traffic: N(x('bike_with_car_traffic')),
      bike_next_to_foot_traffic: N(x('bike_next_to_foot_traffic')),
      bike_next_to_car_traffic: N(x('bike_next_to_car_traffic')),
      separate_bike_traffic: N(x('separate_bike_traffic')),
    }
  }
  function Mp(p, n, x) {
    let c = K(Q(p)),
      M = o(Q(n)),
      H = 0
    for (let P of T) if (x.road[P]) H += c[P]
    let q = 0
    for (let P of W) if (x.bikelane[P]) q += M[P]
    return { roadKm: H, bikeKm: q }
  }
  function cp(p, n) {
    let x = K(Q(p)),
      c = []
    for (let M of T) {
      if (!n.road[M]) continue
      let H = x[M]
      if (H > 0) c.push({ id: M, label: D[M], km: H })
    }
    return c
  }
  function Hp(p, n) {
    let x = o(Q(p)),
      c = []
    for (let M of W) {
      if (!n.bikelane[M]) continue
      let H = x[M]
      if (H > 0) c.push({ id: M, label: S[M], km: H })
    }
    return c
  }
  var Up = new Map(Object.entries(V).flatMap(([p, n]) => n.map((x) => [x, p])))
  function Np(p, n) {
    let x = Q(p),
      c = []
    for (let [M, H] of Object.entries(x)) {
      if (!(H > 0)) continue
      let q = Y(M)
      if (!n.road[q]) continue
      c.push({ id: M, label: M, km: H })
    }
    return (c.sort((M, H) => H.km - M.km), c)
  }
  function qp(p, n) {
    let x = Q(p),
      c = []
    for (let [M, H] of Object.entries(x)) {
      if (!(H > 0)) continue
      let q = Up.get(M)
      if (!q || !n.bikelane[q]) continue
      c.push({ id: M, label: M, km: H })
    }
    return (c.sort((M, H) => H.km - M.km), c)
  }
  function Pp(p) {
    let n = []
    for (let [x, c] of Object.entries(F)) if (p.road[c]) n.push(x)
    return n
  }
  var bp = ['motorway_like', 'primary_like', 'secondary_like'],
    Gp = ['residential_like']
  function Qp(p) {
    let n = []
    for (let x of bp) {
      if (!p.road[x]) continue
      for (let [c, M] of Object.entries(F)) if (M === x) n.push(c)
    }
    return n
  }
  function Ep(p) {
    let n = []
    for (let x of Gp) {
      if (!p.road[x]) continue
      for (let [c, M] of Object.entries(F)) if (M === x) n.push(c)
    }
    return n
  }
  function Fp(p) {
    let n = []
    for (let x of W) {
      if (!p.bikelane[x]) continue
      n.push(...V[x])
    }
    return n
  }
  function E(p, n) {
    if (!n.length) return ['literal', !1]
    return ['match', ['get', p], n, !0, !1]
  }
  function k(p) {
    let n = []
    for (let [x, c] of Object.entries(F)) if (c === p) n.push(x)
    return n
  }
  function Vp(p) {
    let n = k(p),
      x = p === 'residential_like'
    return { major: E('road', x ? [] : n), residential: E('road', x ? n : []) }
  }
  function jp(p) {
    let x = Y(p) === 'residential_like'
    return { major: E('road', x ? [] : [p]), residential: E('road', x ? [p] : []) }
  }
  function zp(p) {
    return E('category', [...V[p]])
  }
  function Wp(p) {
    return E('category', [p])
  }
  function Yp(...p) {
    let n = p.filter((x) => {
      if (!x) return !1
      if (Array.isArray(x) && x[0] === 'literal' && x[1] === !1) return !1
      return !0
    })
    if (!n.length) return ['literal', !1]
    if (n.length === 1) return n[0]
    return ['all', ...n]
  }
  globalThis.TildaStats = t
})()
