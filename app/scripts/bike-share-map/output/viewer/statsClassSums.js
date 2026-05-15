;(() => {
  var M = Object.defineProperty
  var I = (j) => j
  function N(j, T) {
    this[j] = I.bind(null, T)
  }
  var B = (j, T) => {
    for (var q in T) M(j, q, { get: T[q], enumerable: !0, configurable: !0, set: N.bind(T, q) })
  }
  var X = {}
  B(X, {
    roadClassForKey: () => Z,
    maplibrePropertyInFilter: () => K,
    highwayClassDefinition: () => U,
    getRoadSums: () => $,
    getBikelaneSums: () => F,
    enabledRoadHighwayTags: () => p,
    enabledBikelaneCategoryTags: () => E,
    computeFilteredLengths: () => S,
    bikelaneCategoryTags: () => W,
    ROAD_CLASS_ORDER: () => Y,
    ROAD_CLASS_LABELS: () => O,
    RADINFRA_DEFAULT_FILTER: () => D,
    BIKELANE_CLASS_ORDER: () => V,
    BIKELANE_CLASS_LABELS: () => A,
  })
  var Y = ['motorway_like', 'primary_like', 'secondary_like', 'residential_like'],
    O = {
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
    V = [
      'needsClarification',
      'bike_with_foot_traffic',
      'bike_with_car_traffic',
      'bike_next_to_foot_traffic',
      'bike_next_to_car_traffic',
      'separate_bike_traffic',
    ],
    A = {
      needsClarification: 'Klärung nötig',
      bike_with_foot_traffic: 'Rad mit Fußverkehr',
      bike_with_car_traffic: 'Rad mit Kfz-Verkehr',
      bike_next_to_foot_traffic: 'Rad neben Fußverkehr',
      bike_next_to_car_traffic: 'Rad neben Kfz-Verkehr',
      separate_bike_traffic: 'Getrennter Radverkehr',
    },
    W = {
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
    D = {
      road: { motorway_like: !0, primary_like: !0, secondary_like: !0, residential_like: !0 },
      bikelane: {
        needsClarification: !0,
        bike_with_foot_traffic: !0,
        bike_with_car_traffic: !0,
        bike_next_to_foot_traffic: !0,
        bike_next_to_car_traffic: !0,
        separate_bike_traffic: !0,
      },
    }
  function z(j) {
    let T = 0
    for (let q of j) if (typeof q === 'number' && Number.isFinite(q)) T += q
    return T
  }
  function Q(j) {
    if (j == null) return {}
    if (typeof j === 'string')
      try {
        return Q(JSON.parse(j))
      } catch {
        return {}
      }
    if (typeof j !== 'object' || Array.isArray(j)) return {}
    let T = {}
    for (let [q, x] of Object.entries(j)) {
      let G = typeof x === 'number' ? x : Number(x)
      if (Number.isFinite(G)) T[q] = G
    }
    return T
  }
  function Z(j) {
    return U[j] ?? 'secondary_like'
  }
  function $(j) {
    let T = (q) =>
      Object.entries(j)
        .map(([x, G]) => (Z(x) === q ? G : void 0))
        .filter((x) => typeof x === 'number' && Number.isFinite(x))
    return {
      sum: z(Object.values(j)),
      motorway_like: z(T('motorway_like')),
      primary_like: z(T('primary_like')),
      secondary_like: z(T('secondary_like')),
      residential_like: z(T('residential_like')),
    }
  }
  function F(j) {
    let T = j ?? {},
      q = (x) =>
        Object.entries(T)
          .map(([G, J]) => {
            return (W[x] ?? []).includes(G) ? J : void 0
          })
          .filter((G) => typeof G === 'number' && Number.isFinite(G))
    return {
      sum: z(Object.values(T)),
      needsClarification: z(q('needsClarification')),
      bike_with_foot_traffic: z(q('bike_with_foot_traffic')),
      bike_with_car_traffic: z(q('bike_with_car_traffic')),
      bike_next_to_foot_traffic: z(q('bike_next_to_foot_traffic')),
      bike_next_to_car_traffic: z(q('bike_next_to_car_traffic')),
      separate_bike_traffic: z(q('separate_bike_traffic')),
    }
  }
  function S(j, T, q) {
    let x = $(Q(j)),
      G = F(Q(T)),
      J = 0
    for (let H of Y) if (q.road[H]) J += x[H]
    let P = 0
    for (let H of V) if (q.bikelane[H]) P += G[H]
    return { roadKm: J, bikeKm: P }
  }
  function p(j) {
    let T = []
    for (let [q, x] of Object.entries(U)) if (j.road[x]) T.push(q)
    return T
  }
  function E(j) {
    let T = []
    for (let q of V) {
      if (!j.bikelane[q]) continue
      T.push(...W[q])
    }
    return T
  }
  function K(j, T) {
    if (!T.length) return ['literal', !1]
    return ['in', ['get', j], ['literal', T]]
  }
  globalThis.TildaStats = X
})()
