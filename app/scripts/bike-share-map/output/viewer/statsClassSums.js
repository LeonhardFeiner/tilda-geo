;(() => {
  var B = Object.defineProperty
  var x = (T) => T
  function O(T, j) {
    this[T] = x.bind(null, j)
  }
  var A = (T, j) => {
    for (var q in j) B(T, q, { get: j[q], enumerable: !0, configurable: !0, set: O.bind(j, q) })
  }
  var Z = {}
  A(Z, {
    roadClassForKey: () => P,
    maplibrePropertyInFilter: () => d,
    highwayClassDefinition: () => W,
    getRoadSums: () => I,
    getBikelaneSums: () => N,
    formatStatPctUi: () => R,
    formatStatPct: () => M,
    formatStatKm: () => w,
    enabledRoadHighwayTags: () => D,
    enabledBikelaneCategoryTags: () => C,
    computeFilteredLengths: () => y,
    bikelaneCategoryTags: () => Y,
    STAT_PCT_UI_DECIMALS: () => L,
    STAT_PCT_MAX_DECIMALS: () => S,
    STAT_KM_ROAD_UI_DECIMALS: () => f,
    STAT_KM_MAX_DECIMALS: () => K,
    STAT_KM_BIKE_UI_DECIMALS: () => b,
    ROAD_CLASS_ORDER: () => $,
    ROAD_CLASS_LABELS: () => p,
    RADINFRA_DEFAULT_FILTER: () => F,
    BIKELANE_CLASS_ORDER: () => X,
    BIKELANE_CLASS_LABELS: () => E,
  })
  var $ = ['motorway_like', 'primary_like', 'secondary_like', 'residential_like'],
    p = {
      motorway_like: 'Autobahn & Kraftfahrstraßen',
      primary_like: 'Bundes- und Landesstraßen',
      secondary_like: 'Kreis- und Nebenstraßen',
      residential_like: 'Wohn- und Erschließungsstraßen',
    },
    W = {
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
    X = [
      'needsClarification',
      'bike_with_foot_traffic',
      'bike_with_car_traffic',
      'bike_next_to_foot_traffic',
      'bike_next_to_car_traffic',
      'separate_bike_traffic',
    ],
    E = {
      needsClarification: 'Klärung nötig',
      bike_with_foot_traffic: 'Rad mit Fußverkehr',
      bike_with_car_traffic: 'Rad mit Kfz-Verkehr',
      bike_next_to_foot_traffic: 'Rad neben Fußverkehr',
      bike_next_to_car_traffic: 'Rad neben Kfz-Verkehr',
      separate_bike_traffic: 'Getrennter Radverkehr',
    },
    Y = {
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
    F = {
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
    K = 3,
    S = 3,
    L = 1,
    b = 1,
    f = 0
  function w(T, j = 3) {
    if (!Number.isFinite(T)) return '–'
    return T.toLocaleString('de-DE', { maximumFractionDigits: j })
  }
  function M(T, j = 3, q = 0) {
    if (!Number.isFinite(T)) return '–'
    return T.toLocaleString('de-DE', { minimumFractionDigits: q, maximumFractionDigits: j })
  }
  function R(T) {
    return M(T, 1, 1)
  }
  function G(T) {
    let j = 0
    for (let q of T) if (typeof q === 'number' && Number.isFinite(q)) j += q
    return j
  }
  function V(T) {
    if (T == null) return {}
    if (typeof T === 'string')
      try {
        return V(JSON.parse(T))
      } catch {
        return {}
      }
    if (typeof T !== 'object' || Array.isArray(T)) return {}
    let j = {}
    for (let [q, z] of Object.entries(T)) {
      let H = typeof z === 'number' ? z : Number(z)
      if (Number.isFinite(H)) j[q] = H
    }
    return j
  }
  function P(T) {
    return W[T] ?? 'secondary_like'
  }
  function I(T) {
    let j = (q) =>
      Object.entries(T)
        .map(([z, H]) => (P(z) === q ? H : void 0))
        .filter((z) => typeof z === 'number' && Number.isFinite(z))
    return {
      sum: G(Object.values(T)),
      motorway_like: G(j('motorway_like')),
      primary_like: G(j('primary_like')),
      secondary_like: G(j('secondary_like')),
      residential_like: G(j('residential_like')),
    }
  }
  function N(T) {
    let j = T ?? {},
      q = (z) =>
        Object.entries(j)
          .map(([H, Q]) => {
            return (Y[z] ?? []).includes(H) ? Q : void 0
          })
          .filter((H) => typeof H === 'number' && Number.isFinite(H))
    return {
      sum: G(Object.values(j)),
      needsClarification: G(q('needsClarification')),
      bike_with_foot_traffic: G(q('bike_with_foot_traffic')),
      bike_with_car_traffic: G(q('bike_with_car_traffic')),
      bike_next_to_foot_traffic: G(q('bike_next_to_foot_traffic')),
      bike_next_to_car_traffic: G(q('bike_next_to_car_traffic')),
      separate_bike_traffic: G(q('separate_bike_traffic')),
    }
  }
  function y(T, j, q) {
    let z = I(V(T)),
      H = N(V(j)),
      Q = 0
    for (let J of $) if (q.road[J]) Q += z[J]
    let U = 0
    for (let J of X) if (q.bikelane[J]) U += H[J]
    return { roadKm: Q, bikeKm: U }
  }
  function D(T) {
    let j = []
    for (let [q, z] of Object.entries(W)) if (T.road[z]) j.push(q)
    return j
  }
  function C(T) {
    let j = []
    for (let q of X) {
      if (!T.bikelane[q]) continue
      j.push(...Y[q])
    }
    return j
  }
  function d(T, j) {
    if (!j.length) return ['literal', !1]
    return ['in', ['get', T], ['literal', j]]
  }
  globalThis.TildaStats = Z
})()
