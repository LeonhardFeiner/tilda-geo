;(() => {
  var A = Object.defineProperty
  var k = (p) => p
  function _(p, n) {
    this[p] = k.bind(null, n)
  }
  var l = (p, n) => {
    for (var t in n) A(p, t, { get: n[t], enumerable: !0, configurable: !0, set: _.bind(n, t) })
  }
  var X = {}
  l(X, {
    roadClassForKey: () => J,
    maplibrePropertyInFilter: () => qp,
    listFilteredRoadClassLengths: () => tp,
    listFilteredHighwayTagLengths: () => Mp,
    listFilteredBikelaneTagLengths: () => op,
    listFilteredBikelaneClassLengths: () => cp,
    isLowRoadNetworkForScale: () => Y,
    highwayClassDefinition: () => q,
    getRoadSums: () => m,
    getBikelaneSums: () => T,
    formatStatPctUi: () => pp,
    formatStatPct: () => y,
    formatStatKm: () => s,
    enabledRoadHighwayTags: () => bp,
    enabledResidentialRoadHighwayTags: () => Up,
    enabledMajorRoadHighwayTags: () => Hp,
    enabledBikelaneCategoryTags: () => Np,
    computeFilteredLengths: () => np,
    computeChoroplethScaleRange: () => B,
    bikelaneCategoryTags: () => E,
    STAT_PCT_UI_DECIMALS: () => Z,
    STAT_PCT_MAX_DECIMALS: () => u,
    STAT_KM_ROAD_UI_DECIMALS: () => a,
    STAT_KM_MAX_DECIMALS: () => L,
    STAT_KM_BIKE_UI_DECIMALS: () => g,
    ROAD_CLASS_ORDER: () => $,
    ROAD_CLASS_LABELS: () => e,
    RADINFRA_DEFAULT_FILTER: () => v,
    DEFAULT_PERCENTILE_HIGH: () => r,
    DEFAULT_MIN_ROAD_KM_FOR_SCALE: () => h,
    DEFAULT_IQR_MULTIPLIER: () => R,
    BIKELANE_CLASS_ORDER: () => Q,
    BIKELANE_CLASS_LABELS: () => C,
  })
  var h = 5,
    r = 0.95,
    R = 1.5
  function Y(p, n = 5) {
    return !(Number.isFinite(p) && p >= n)
  }
  function W(p, n) {
    if (!p.length) return Number.NaN
    if (p.length === 1) return p[0]
    let t = n * (p.length - 1),
      x = Math.floor(t),
      c = Math.ceil(t),
      M = t - x
    return p[x] * (1 - M) + p[c] * M
  }
  function B(p, n = {}) {
    let t = n.minRoadKmForScale ?? 5,
      x = n.robustEnabled ?? !0,
      c = n.percentileHigh ?? 0.95,
      M = n.iqrMultiplier ?? 1.5,
      P = n.manualCapEnabled ?? !1,
      F = n.manualCapPct ?? 50,
      G = p.filter((o) => Number.isFinite(o.bikeSharePct))
    if (!G.length)
      return {
        min: 0,
        max: 20,
        dataMin: 0,
        dataMax: 20,
        scaleCapped: !1,
        capPct: F,
        representativeMax: 20,
        outlierCount: 0,
        excludedLowRoadCount: 0,
        robustApplied: !1,
      }
    let f = G.map((o) => o.bikeSharePct),
      D = Math.min(...f),
      V = Math.max(...f),
      O = G.filter((o) => !Y(o.roadSumKm, t)),
      w = G.length - O.length,
      H = O.map((o) => o.bikeSharePct).sort((o, I) => o - I),
      U = V,
      d = 0,
      K = !1
    if (x && H.length > 0) {
      if (((K = !0), (U = W(H, c)), H.length >= 4)) {
        let o = W(H, 0.25),
          I = W(H, 0.75),
          i = I + M * (I - o)
        U = Math.min(U, i)
      }
      d = H.filter((o) => o > U + 0.000000001).length
    } else if (H.length > 0) U = H[H.length - 1]
    let j = U,
      z = !1,
      S = x && V > U + 0.01
    if (P && j > F) ((j = F), (z = !0))
    else if (S) z = !0
    return {
      min: 0,
      max: j,
      dataMin: D,
      dataMax: V,
      scaleCapped: z,
      capPct: P ? F : U,
      representativeMax: U,
      outlierCount: d,
      excludedLowRoadCount: w,
      robustApplied: K,
    }
  }
  var $ = ['motorway_like', 'primary_like', 'secondary_like', 'residential_like'],
    e = {
      motorway_like: 'Autobahn & Kraftfahrstraßen',
      primary_like: 'Bundes- und Landesstraßen',
      secondary_like: 'Kreis- und Nebenstraßen',
      residential_like: 'Wohn- und Erschließungsstraßen',
    },
    q = {
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
    Q = [
      'needsClarification',
      'bike_with_foot_traffic',
      'bike_with_car_traffic',
      'bike_next_to_foot_traffic',
      'bike_next_to_car_traffic',
      'separate_bike_traffic',
    ],
    C = {
      needsClarification: 'Klärung nötig',
      bike_with_foot_traffic: 'Rad mit Fußverkehr',
      bike_with_car_traffic: 'Rad mit Kfz-Verkehr',
      bike_next_to_foot_traffic: 'Rad neben Fußverkehr',
      bike_next_to_car_traffic: 'Rad neben Kfz-Verkehr',
      separate_bike_traffic: 'Getrennter Radverkehr',
    },
    E = {
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
    v = {
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
    L = 3,
    u = 3,
    Z = 1,
    g = 1,
    a = 0
  function s(p, n = L) {
    if (!Number.isFinite(p)) return '–'
    return p.toLocaleString('de-DE', { maximumFractionDigits: n })
  }
  function y(p, n = u, t = 0) {
    if (!Number.isFinite(p)) return '–'
    return p.toLocaleString('de-DE', { minimumFractionDigits: t, maximumFractionDigits: n })
  }
  function pp(p) {
    return y(p, Z, Z)
  }
  function b(p) {
    let n = 0
    for (let t of p) if (typeof t === 'number' && Number.isFinite(t)) n += t
    return n
  }
  function N(p) {
    if (p == null) return {}
    if (typeof p === 'string')
      try {
        return N(JSON.parse(p))
      } catch {
        return {}
      }
    if (typeof p !== 'object' || Array.isArray(p)) return {}
    let n = {}
    for (let [t, x] of Object.entries(p)) {
      let c = typeof x === 'number' ? x : Number(x)
      if (Number.isFinite(c)) n[t] = c
    }
    return n
  }
  function J(p) {
    return q[p] ?? 'secondary_like'
  }
  function m(p) {
    let n = (t) =>
      Object.entries(p)
        .map(([x, c]) => (J(x) === t ? c : void 0))
        .filter((x) => typeof x === 'number' && Number.isFinite(x))
    return {
      sum: b(Object.values(p)),
      motorway_like: b(n('motorway_like')),
      primary_like: b(n('primary_like')),
      secondary_like: b(n('secondary_like')),
      residential_like: b(n('residential_like')),
    }
  }
  function T(p) {
    let n = p ?? {},
      t = (x) =>
        Object.entries(n)
          .map(([c, M]) => {
            return (E[x] ?? []).includes(c) ? M : void 0
          })
          .filter((c) => typeof c === 'number' && Number.isFinite(c))
    return {
      sum: b(Object.values(n)),
      needsClarification: b(t('needsClarification')),
      bike_with_foot_traffic: b(t('bike_with_foot_traffic')),
      bike_with_car_traffic: b(t('bike_with_car_traffic')),
      bike_next_to_foot_traffic: b(t('bike_next_to_foot_traffic')),
      bike_next_to_car_traffic: b(t('bike_next_to_car_traffic')),
      separate_bike_traffic: b(t('separate_bike_traffic')),
    }
  }
  function np(p, n, t) {
    let x = m(N(p)),
      c = T(N(n)),
      M = 0
    for (let F of $) if (t.road[F]) M += x[F]
    let P = 0
    for (let F of Q) if (t.bikelane[F]) P += c[F]
    return { roadKm: M, bikeKm: P }
  }
  function tp(p, n) {
    let t = m(N(p)),
      x = []
    for (let c of $) {
      if (!n.road[c]) continue
      let M = t[c]
      if (M > 0) x.push({ id: c, label: e[c], km: M })
    }
    return x
  }
  function cp(p, n) {
    let t = T(N(p)),
      x = []
    for (let c of Q) {
      if (!n.bikelane[c]) continue
      let M = t[c]
      if (M > 0) x.push({ id: c, label: C[c], km: M })
    }
    return x
  }
  var xp = new Map(Object.entries(E).flatMap(([p, n]) => n.map((t) => [t, p])))
  function Mp(p, n) {
    let t = N(p),
      x = []
    for (let [c, M] of Object.entries(t)) {
      if (!(M > 0)) continue
      let P = J(c)
      if (!n.road[P]) continue
      x.push({ id: c, label: c, km: M })
    }
    return (x.sort((c, M) => M.km - c.km), x)
  }
  function op(p, n) {
    let t = N(p),
      x = []
    for (let [c, M] of Object.entries(t)) {
      if (!(M > 0)) continue
      let P = xp.get(c)
      if (!P || !n.bikelane[P]) continue
      x.push({ id: c, label: c, km: M })
    }
    return (x.sort((c, M) => M.km - c.km), x)
  }
  function bp(p) {
    let n = []
    for (let [t, x] of Object.entries(q)) if (p.road[x]) n.push(t)
    return n
  }
  var Pp = ['motorway_like', 'primary_like', 'secondary_like'],
    Fp = ['residential_like']
  function Hp(p) {
    let n = []
    for (let t of Pp) {
      if (!p.road[t]) continue
      for (let [x, c] of Object.entries(q)) if (c === t) n.push(x)
    }
    return n
  }
  function Up(p) {
    let n = []
    for (let t of Fp) {
      if (!p.road[t]) continue
      for (let [x, c] of Object.entries(q)) if (c === t) n.push(x)
    }
    return n
  }
  function Np(p) {
    let n = []
    for (let t of Q) {
      if (!p.bikelane[t]) continue
      n.push(...E[t])
    }
    return n
  }
  function qp(p, n) {
    if (!n.length) return ['literal', !1]
    return ['match', ['get', p], n, !0, !1]
  }
  globalThis.TildaStats = X
})()
