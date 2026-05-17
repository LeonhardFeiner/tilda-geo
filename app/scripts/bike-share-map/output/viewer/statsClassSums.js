;(() => {
  var x = Object.defineProperty
  var I = (T) => T
  function p(T, j) {
    this[T] = I.bind(null, j)
  }
  var F = (T, j) => {
    for (var q in j) x(T, q, { get: j[q], enumerable: !0, configurable: !0, set: p.bind(j, q) })
  }
  var $ = {}
  F($, {
    roadClassForKey: () => M,
    maplibrePropertyInFilter: () => m,
    highwayClassDefinition: () => U,
    getRoadSums: () => B,
    getBikelaneSums: () => N,
    formatStatPctUi: () => R,
    formatStatPct: () => P,
    formatStatKm: () => k,
    enabledRoadHighwayTags: () => y,
    enabledResidentialRoadHighwayTags: () => _,
    enabledMajorRoadHighwayTags: () => d,
    enabledBikelaneCategoryTags: () => C,
    computeFilteredLengths: () => f,
    bikelaneCategoryTags: () => Z,
    STAT_PCT_UI_DECIMALS: () => L,
    STAT_PCT_MAX_DECIMALS: () => A,
    STAT_KM_ROAD_UI_DECIMALS: () => S,
    STAT_KM_MAX_DECIMALS: () => E,
    STAT_KM_BIKE_UI_DECIMALS: () => w,
    ROAD_CLASS_ORDER: () => J,
    ROAD_CLASS_LABELS: () => K,
    RADINFRA_DEFAULT_FILTER: () => b,
    BIKELANE_CLASS_ORDER: () => Y,
    BIKELANE_CLASS_LABELS: () => O,
  })
  var J = ['motorway_like', 'primary_like', 'secondary_like', 'residential_like'],
    K = {
      motorway_like: 'Autobahn & Kraftfahrstraßen',
      primary_like: 'Bundes- und Landesstraßen',
      secondary_like: 'Kreis- und Nebenstraßen',
      residential_like: 'Wohn- und Erschließungsstraßen',
    },
    U = {
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
    Y = [
      'needsClarification',
      'bike_with_foot_traffic',
      'bike_with_car_traffic',
      'bike_next_to_foot_traffic',
      'bike_next_to_car_traffic',
      'separate_bike_traffic',
    ],
    O = {
      needsClarification: 'Klärung nötig',
      bike_with_foot_traffic: 'Rad mit Fußverkehr',
      bike_with_car_traffic: 'Rad mit Kfz-Verkehr',
      bike_next_to_foot_traffic: 'Rad neben Fußverkehr',
      bike_next_to_car_traffic: 'Rad neben Kfz-Verkehr',
      separate_bike_traffic: 'Getrennter Radverkehr',
    },
    Z = {
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
    b = {
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
    E = 3,
    A = 3,
    L = 1,
    w = 1,
    S = 0
  function k(T, j = 3) {
    if (!Number.isFinite(T)) return '–'
    return T.toLocaleString('de-DE', { maximumFractionDigits: j })
  }
  function P(T, j = 3, q = 0) {
    if (!Number.isFinite(T)) return '–'
    return T.toLocaleString('de-DE', { minimumFractionDigits: q, maximumFractionDigits: j })
  }
  function R(T) {
    return P(T, 1, 1)
  }
  function H(T) {
    let j = 0
    for (let q of T) if (typeof q === 'number' && Number.isFinite(q)) j += q
    return j
  }
  function X(T) {
    if (T == null) return {}
    if (typeof T === 'string')
      try {
        return X(JSON.parse(T))
      } catch {
        return {}
      }
    if (typeof T !== 'object' || Array.isArray(T)) return {}
    let j = {}
    for (let [q, z] of Object.entries(T)) {
      let G = typeof z === 'number' ? z : Number(z)
      if (Number.isFinite(G)) j[q] = G
    }
    return j
  }
  function M(T) {
    return U[T] ?? 'secondary_like'
  }
  function B(T) {
    let j = (q) =>
      Object.entries(T)
        .map(([z, G]) => (M(z) === q ? G : void 0))
        .filter((z) => typeof z === 'number' && Number.isFinite(z))
    return {
      sum: H(Object.values(T)),
      motorway_like: H(j('motorway_like')),
      primary_like: H(j('primary_like')),
      secondary_like: H(j('secondary_like')),
      residential_like: H(j('residential_like')),
    }
  }
  function N(T) {
    let j = T ?? {},
      q = (z) =>
        Object.entries(j)
          .map(([G, V]) => {
            return (Z[z] ?? []).includes(G) ? V : void 0
          })
          .filter((G) => typeof G === 'number' && Number.isFinite(G))
    return {
      sum: H(Object.values(j)),
      needsClarification: H(q('needsClarification')),
      bike_with_foot_traffic: H(q('bike_with_foot_traffic')),
      bike_with_car_traffic: H(q('bike_with_car_traffic')),
      bike_next_to_foot_traffic: H(q('bike_next_to_foot_traffic')),
      bike_next_to_car_traffic: H(q('bike_next_to_car_traffic')),
      separate_bike_traffic: H(q('separate_bike_traffic')),
    }
  }
  function f(T, j, q) {
    let z = B(X(T)),
      G = N(X(j)),
      V = 0
    for (let Q of J) if (q.road[Q]) V += z[Q]
    let W = 0
    for (let Q of Y) if (q.bikelane[Q]) W += G[Q]
    return { roadKm: V, bikeKm: W }
  }
  function y(T) {
    let j = []
    for (let [q, z] of Object.entries(U)) if (T.road[z]) j.push(q)
    return j
  }
  var D = ['motorway_like', 'primary_like', 'secondary_like'],
    c = ['residential_like']
  function d(T) {
    let j = []
    for (let q of D) {
      if (!T.road[q]) continue
      for (let [z, G] of Object.entries(U)) if (G === q) j.push(z)
    }
    return j
  }
  function _(T) {
    let j = []
    for (let q of c) {
      if (!T.road[q]) continue
      for (let [z, G] of Object.entries(U)) if (G === q) j.push(z)
    }
    return j
  }
  function C(T) {
    let j = []
    for (let q of Y) {
      if (!T.bikelane[q]) continue
      j.push(...Z[q])
    }
    return j
  }
  function m(T, j) {
    if (!j.length) return ['literal', !1]
    return ['match', ['get', T], j, !0, !1]
  }
  globalThis.TildaStats = $
})()
