var M0 = new Set(['relation/62422', 'relation/62782', 'relation/62772'])
function u(_) {
  return String(_.properties?.level ?? '')
}
function r(_) {
  return String(_.properties?.id ?? '')
}
function D0(_) {
  let $ = new Map(),
    X = new Map(),
    Z = new Map(),
    K = new Map()
  for (let D of _) {
    let N = r(D)
    if (!N) continue
    $.set(N, D)
    let A = u(D)
    if (A) {
      let R = X.get(A) ?? []
      ;(R.push(N), X.set(A, R))
    }
    let G = D.properties?.parent_id
    if (G) {
      Z.set(N, G)
      let R = K.get(G) ?? []
      ;(R.push(D), K.set(G, R))
    }
  }
  let M = new Set()
  for (let D of _) {
    if (u(D) !== '8') continue
    let N = D.properties?.landkreis_id
    if (N) M.add(N)
  }
  let J = new Set()
  for (let D of _) {
    if (u(D) !== '6') continue
    let N = r(D)
    if (!M.has(N)) J.add(N)
  }
  let q = null,
    Y = []
  for (let D of _) {
    if (u(D) !== '4') continue
    let N = r(D),
      A = String(D.properties?.name ?? N)
    Y.push({ id: N, name: A, level: '4' })
  }
  Y.sort((D, N) => D.name.localeCompare(N.name, 'de'))
  for (let D of _)
    if (u(D) === '2') {
      q = r(D)
      break
    }
  let H = Y.filter((D) => !M0.has(D.id)),
    U = Y.filter((D) => M0.has(D.id))
  return {
    deutschlandId: q,
    kreisfreieIds: J,
    parentById: Z,
    byId: $,
    idsByLevel: X,
    bundeslaender: Y,
    flaechenlaender: H,
    stadtstaaten: U,
  }
}
var w = 6371008.8,
  V1 = {
    centimeters: w * 100,
    centimetres: w * 100,
    degrees: 360 / (2 * Math.PI),
    feet: w * 3.28084,
    inches: w * 39.37,
    kilometers: w / 1000,
    kilometres: w / 1000,
    meters: w,
    metres: w,
    miles: w / 1609.344,
    millimeters: w * 1000,
    millimetres: w * 1000,
    nauticalmiles: w / 1852,
    radians: 1,
    yards: w * 1.0936,
  }
function f(_, $, X = {}) {
  let Z = { type: 'Feature' }
  if (X.id === 0 || X.id) Z.id = X.id
  if (X.bbox) Z.bbox = X.bbox
  return ((Z.properties = $ || {}), (Z.geometry = _), Z)
}
function X0(_, $, X = {}) {
  if (!_) throw Error('coordinates is required')
  if (!Array.isArray(_)) throw Error('coordinates must be an Array')
  if (_.length < 2) throw Error('coordinates must be at least 2 numbers long')
  if (!H0(_[0]) || !H0(_[1])) throw Error('coordinates must contain numbers')
  return f({ type: 'Point', coordinates: _ }, $, X)
}
function Y0(_, $, X = {}) {
  if (_.length < 2) throw Error('coordinates must be an array of two or more positions')
  return f({ type: 'LineString', coordinates: _ }, $, X)
}
function a(_, $ = {}) {
  let X = { type: 'FeatureCollection' }
  if ($.id) X.id = $.id
  if ($.bbox) X.bbox = $.bbox
  return ((X.features = _), X)
}
function K0(_, $, X = {}) {
  return f({ type: 'MultiLineString', coordinates: _ }, $, X)
}
function H0(_) {
  return !isNaN(_) && _ !== null && !Array.isArray(_)
}
function Z0(_, $, X) {
  if (_ === null) return
  var Z,
    K,
    M,
    J,
    q,
    Y,
    H,
    U = 0,
    D = 0,
    N,
    A = _.type,
    G = A === 'FeatureCollection',
    R = A === 'Feature',
    V = G ? _.features.length : 1
  for (var z = 0; z < V; z++) {
    ;((H = G ? _.features[z].geometry : R ? _.geometry : _),
      (N = H ? H.type === 'GeometryCollection' : !1),
      (q = N ? H.geometries.length : 1))
    for (var Q = 0; Q < q; Q++) {
      var B = 0,
        C = 0
      if (((J = N ? H.geometries[Q] : H), J === null)) continue
      Y = J.coordinates
      var k = J.type
      switch (((U = X && (k === 'Polygon' || k === 'MultiPolygon') ? 1 : 0), k)) {
        case null:
          break
        case 'Point':
          if ($(Y, D, z, B, C) === !1) return !1
          ;(D++, B++)
          break
        case 'LineString':
        case 'MultiPoint':
          for (Z = 0; Z < Y.length; Z++) {
            if ($(Y[Z], D, z, B, C) === !1) return !1
            if ((D++, k === 'MultiPoint')) B++
          }
          if (k === 'LineString') B++
          break
        case 'Polygon':
        case 'MultiLineString':
          for (Z = 0; Z < Y.length; Z++) {
            for (K = 0; K < Y[Z].length - U; K++) {
              if ($(Y[Z][K], D, z, B, C) === !1) return !1
              D++
            }
            if (k === 'MultiLineString') B++
            if (k === 'Polygon') C++
          }
          if (k === 'Polygon') B++
          break
        case 'MultiPolygon':
          for (Z = 0; Z < Y.length; Z++) {
            C = 0
            for (K = 0; K < Y[Z].length; K++) {
              for (M = 0; M < Y[Z][K].length - U; M++) {
                if ($(Y[Z][K][M], D, z, B, C) === !1) return !1
                D++
              }
              C++
            }
            B++
          }
          break
        case 'GeometryCollection':
          for (Z = 0; Z < J.geometries.length; Z++) if (Z0(J.geometries[Z], $, X) === !1) return !1
          break
        default:
          throw Error('Unknown Geometry Type')
      }
    }
  }
}
function m0(_, $) {
  var X,
    Z,
    K,
    M,
    J,
    q,
    Y,
    H,
    U,
    D,
    N = 0,
    A = _.type === 'FeatureCollection',
    G = _.type === 'Feature',
    R = A ? _.features.length : 1
  for (X = 0; X < R; X++) {
    ;((q = A ? _.features[X].geometry : G ? _.geometry : _),
      (H = A ? _.features[X].properties : G ? _.properties : {}),
      (U = A ? _.features[X].bbox : G ? _.bbox : void 0),
      (D = A ? _.features[X].id : G ? _.id : void 0),
      (Y = q ? q.type === 'GeometryCollection' : !1),
      (J = Y ? q.geometries.length : 1))
    for (K = 0; K < J; K++) {
      if (((M = Y ? q.geometries[K] : q), M === null)) {
        if ($(null, N, H, U, D) === !1) return !1
        continue
      }
      switch (M.type) {
        case 'Point':
        case 'LineString':
        case 'MultiPoint':
        case 'Polygon':
        case 'MultiLineString':
        case 'MultiPolygon': {
          if ($(M, N, H, U, D) === !1) return !1
          break
        }
        case 'GeometryCollection': {
          for (Z = 0; Z < M.geometries.length; Z++)
            if ($(M.geometries[Z], N, H, U, D) === !1) return !1
          break
        }
        default:
          throw Error('Unknown Geometry Type')
      }
    }
    N++
  }
}
function x(_, $) {
  m0(_, function (X, Z, K, M, J) {
    var q = X === null ? null : X.type
    switch (q) {
      case null:
      case 'Point':
      case 'LineString':
      case 'Polygon':
        if ($(f(X, K, { bbox: M, id: J }), Z, 0) === !1) return !1
        return
    }
    var Y
    switch (q) {
      case 'MultiPoint':
        Y = 'Point'
        break
      case 'MultiLineString':
        Y = 'LineString'
        break
      case 'MultiPolygon':
        Y = 'Polygon'
        break
    }
    for (var H = 0; H < X.coordinates.length; H++) {
      var U = X.coordinates[H],
        D = { type: Y, coordinates: U }
      if ($(f(D, K), Z, H) === !1) return !1
    }
  })
}
function p0(_, $ = {}) {
  if (_.bbox != null && $.recompute !== !0) return _.bbox
  let X = [1 / 0, 1 / 0, -1 / 0, -1 / 0]
  return (
    Z0(_, (Z) => {
      if (X[0] > Z[0]) X[0] = Z[0]
      if (X[1] > Z[1]) X[1] = Z[1]
      if (X[2] < Z[0]) X[2] = Z[0]
      if (X[3] < Z[1]) X[3] = Z[1]
    }),
    X
  )
}
var W0 = p0
var E = 0.00000000000000011102230246251565,
  T = 134217729,
  g = 0.00000000000000033306690738754706
function p(_, $, X, Z, K) {
  let M,
    J,
    q,
    Y,
    H = $[0],
    U = Z[0],
    D = 0,
    N = 0
  if (U > H === U > -H) ((M = H), (H = $[++D]))
  else ((M = U), (U = Z[++N]))
  let A = 0
  if (D < _ && N < X) {
    if (U > H === U > -H) ((J = H + M), (q = M - (J - H)), (H = $[++D]))
    else ((J = U + M), (q = M - (J - U)), (U = Z[++N]))
    if (((M = J), q !== 0)) K[A++] = q
    while (D < _ && N < X) {
      if (U > H === U > -H) ((J = M + H), (Y = J - M), (q = M - (J - Y) + (H - Y)), (H = $[++D]))
      else ((J = M + U), (Y = J - M), (q = M - (J - Y) + (U - Y)), (U = Z[++N]))
      if (((M = J), q !== 0)) K[A++] = q
    }
  }
  while (D < _)
    if (((J = M + H), (Y = J - M), (q = M - (J - Y) + (H - Y)), (H = $[++D]), (M = J), q !== 0))
      K[A++] = q
  while (N < X)
    if (((J = M + U), (Y = J - M), (q = M - (J - Y) + (U - Y)), (U = Z[++N]), (M = J), q !== 0))
      K[A++] = q
  if (M !== 0 || A === 0) K[A++] = M
  return A
}
function d(_, $) {
  let X = $[0]
  for (let Z = 1; Z < _; Z++) X += $[Z]
  return X
}
function W(_) {
  return new Float64Array(_)
}
var x0 = (3 + 16 * E) * E,
  l0 = (2 + 12 * E) * E,
  s0 = (9 + 64 * E) * E * E,
  l = W(4),
  U0 = W(8),
  N0 = W(12),
  A0 = W(16),
  P = W(4)
function u0(_, $, X, Z, K, M, J) {
  let q,
    Y,
    H,
    U,
    D,
    N,
    A,
    G,
    R,
    V,
    z,
    Q,
    B,
    C,
    k,
    L,
    h,
    S,
    v = _ - K,
    c = X - K,
    y = $ - M,
    b = Z - M
  ;((C = v * b),
    (N = T * v),
    (A = N - (N - v)),
    (G = v - A),
    (N = T * b),
    (R = N - (N - b)),
    (V = b - R),
    (k = G * V - (C - A * R - G * R - A * V)),
    (L = y * c),
    (N = T * y),
    (A = N - (N - y)),
    (G = y - A),
    (N = T * c),
    (R = N - (N - c)),
    (V = c - R),
    (h = G * V - (L - A * R - G * R - A * V)),
    (z = k - h),
    (D = k - z),
    (l[0] = k - (z + D) + (D - h)),
    (Q = C + z),
    (D = Q - C),
    (B = C - (Q - D) + (z - D)),
    (z = B - L),
    (D = B - z),
    (l[1] = B - (z + D) + (D - L)),
    (S = Q + z),
    (D = S - Q),
    (l[2] = Q - (S - D) + (z - D)),
    (l[3] = S))
  let I = d(4, l),
    s = l0 * J
  if (I >= s || -I >= s) return I
  if (
    ((D = _ - v),
    (q = _ - (v + D) + (D - K)),
    (D = X - c),
    (H = X - (c + D) + (D - K)),
    (D = $ - y),
    (Y = $ - (y + D) + (D - M)),
    (D = Z - b),
    (U = Z - (b + D) + (D - M)),
    q === 0 && Y === 0 && H === 0 && U === 0)
  )
    return I
  if (((s = s0 * J + g * Math.abs(I)), (I += v * U + b * q - (y * H + c * Y)), I >= s || -I >= s))
    return I
  ;((C = q * b),
    (N = T * q),
    (A = N - (N - q)),
    (G = q - A),
    (N = T * b),
    (R = N - (N - b)),
    (V = b - R),
    (k = G * V - (C - A * R - G * R - A * V)),
    (L = Y * c),
    (N = T * Y),
    (A = N - (N - Y)),
    (G = Y - A),
    (N = T * c),
    (R = N - (N - c)),
    (V = c - R),
    (h = G * V - (L - A * R - G * R - A * V)),
    (z = k - h),
    (D = k - z),
    (P[0] = k - (z + D) + (D - h)),
    (Q = C + z),
    (D = Q - C),
    (B = C - (Q - D) + (z - D)),
    (z = B - L),
    (D = B - z),
    (P[1] = B - (z + D) + (D - L)),
    (S = Q + z),
    (D = S - Q),
    (P[2] = Q - (S - D) + (z - D)),
    (P[3] = S))
  let b0 = p(4, l, 4, P, U0)
  ;((C = v * U),
    (N = T * v),
    (A = N - (N - v)),
    (G = v - A),
    (N = T * U),
    (R = N - (N - U)),
    (V = U - R),
    (k = G * V - (C - A * R - G * R - A * V)),
    (L = y * H),
    (N = T * y),
    (A = N - (N - y)),
    (G = y - A),
    (N = T * H),
    (R = N - (N - H)),
    (V = H - R),
    (h = G * V - (L - A * R - G * R - A * V)),
    (z = k - h),
    (D = k - z),
    (P[0] = k - (z + D) + (D - h)),
    (Q = C + z),
    (D = Q - C),
    (B = C - (Q - D) + (z - D)),
    (z = B - L),
    (D = B - z),
    (P[1] = B - (z + D) + (D - L)),
    (S = Q + z),
    (D = S - Q),
    (P[2] = Q - (S - D) + (z - D)),
    (P[3] = S))
  let I0 = p(b0, U0, 4, P, N0)
  ;((C = q * U),
    (N = T * q),
    (A = N - (N - q)),
    (G = q - A),
    (N = T * U),
    (R = N - (N - U)),
    (V = U - R),
    (k = G * V - (C - A * R - G * R - A * V)),
    (L = Y * H),
    (N = T * Y),
    (A = N - (N - Y)),
    (G = Y - A),
    (N = T * H),
    (R = N - (N - H)),
    (V = H - R),
    (h = G * V - (L - A * R - G * R - A * V)),
    (z = k - h),
    (D = k - z),
    (P[0] = k - (z + D) + (D - h)),
    (Q = C + z),
    (D = Q - C),
    (B = C - (Q - D) + (z - D)),
    (z = B - L),
    (D = B - z),
    (P[1] = B - (z + D) + (D - L)),
    (S = Q + z),
    (D = S - Q),
    (P[2] = Q - (S - D) + (z - D)),
    (P[3] = S))
  let f0 = p(I0, N0, 4, P, A0)
  return A0[f0 - 1]
}
function $0(_, $, X, Z, K, M) {
  let J = ($ - M) * (X - K),
    q = (_ - K) * (Z - M),
    Y = J - q,
    H = Math.abs(J + q)
  if (Math.abs(Y) >= x0 * H) return Y
  return -u0(_, $, X, Z, K, M, H)
}
var j1 = (7 + 56 * E) * E,
  P1 = (3 + 28 * E) * E,
  w1 = (26 + 288 * E) * E * E,
  h1 = W(4),
  v1 = W(4),
  c1 = W(4),
  y1 = W(4),
  b1 = W(4),
  I1 = W(4),
  f1 = W(4),
  m1 = W(4),
  p1 = W(4),
  x1 = W(8),
  l1 = W(8),
  s1 = W(8),
  u1 = W(4),
  a1 = W(8),
  g1 = W(8),
  d1 = W(8),
  r1 = W(12),
  t1 = W(192),
  n1 = W(192)
var e1 = (10 + 96 * E) * E,
  _6 = (4 + 48 * E) * E,
  X6 = (44 + 576 * E) * E * E,
  Y6 = W(4),
  Z6 = W(4),
  $6 = W(4),
  q6 = W(4),
  J6 = W(4),
  M6 = W(4),
  D6 = W(4),
  H6 = W(4),
  K6 = W(8),
  W6 = W(8),
  U6 = W(8),
  N6 = W(8),
  A6 = W(8),
  G6 = W(8),
  R6 = W(8),
  z6 = W(8),
  V6 = W(8),
  E6 = W(4),
  O6 = W(4),
  Q6 = W(4),
  C6 = W(8),
  B6 = W(16),
  k6 = W(16),
  F6 = W(16),
  T6 = W(32),
  L6 = W(32),
  S6 = W(48),
  j6 = W(64),
  P6 = W(1152),
  w6 = W(1152)
var y6 = (16 + 224 * E) * E,
  b6 = (5 + 72 * E) * E,
  I6 = (71 + 1408 * E) * E * E,
  f6 = W(4),
  m6 = W(4),
  p6 = W(4),
  x6 = W(4),
  l6 = W(4),
  s6 = W(4),
  u6 = W(4),
  a6 = W(4),
  g6 = W(4),
  d6 = W(4),
  r6 = W(24),
  t6 = W(24),
  n6 = W(24),
  o6 = W(24),
  i6 = W(24),
  e6 = W(24),
  _8 = W(24),
  X8 = W(24),
  Y8 = W(24),
  Z8 = W(24),
  $8 = W(1152),
  q8 = W(1152),
  J8 = W(1152),
  M8 = W(1152),
  D8 = W(1152),
  H8 = W(2304),
  K8 = W(2304),
  W8 = W(3456),
  U8 = W(5760),
  N8 = W(8),
  A8 = W(8),
  G8 = W(8),
  R8 = W(16),
  z8 = W(24),
  V8 = W(48),
  E8 = W(48),
  O8 = W(96),
  Q8 = W(192),
  C8 = W(384),
  B8 = W(384),
  k8 = W(384),
  F8 = W(768)
var T8 = W(96),
  L8 = W(96),
  S8 = W(96),
  j8 = W(1152)
function R0(_, $) {
  var X,
    Z,
    K = 0,
    M,
    J,
    q,
    Y,
    H,
    U,
    D,
    N = _[0],
    A = _[1],
    G = $.length
  for (X = 0; X < G; X++) {
    Z = 0
    var R = $[X],
      V = R.length - 1
    if (((U = R[0]), U[0] !== R[V][0] && U[1] !== R[V][1]))
      throw Error('First and last coordinates in a ring must be the same')
    ;((J = U[0] - N), (q = U[1] - A))
    for (Z; Z < V; Z++) {
      if (((D = R[Z + 1]), (Y = D[0] - N), (H = D[1] - A), q === 0 && H === 0)) {
        if ((Y <= 0 && J >= 0) || (J <= 0 && Y >= 0)) return 0
      } else if ((H >= 0 && q <= 0) || (H <= 0 && q >= 0)) {
        if (((M = $0(J, Y, q, H, 0, 0)), M === 0)) return 0
        if ((M > 0 && H > 0 && q <= 0) || (M < 0 && H <= 0 && q > 0)) K++
      }
      ;((U = D), (q = H), (J = Y))
    }
  }
  if (K % 2 === 0) return !1
  return !0
}
function t(_) {
  if (!_) throw Error('coord is required')
  if (!Array.isArray(_)) {
    if (_.type === 'Feature' && _.geometry !== null && _.geometry.type === 'Point')
      return [..._.geometry.coordinates]
    if (_.type === 'Point') return [..._.coordinates]
  }
  if (Array.isArray(_) && _.length >= 2 && !Array.isArray(_[0]) && !Array.isArray(_[1]))
    return [..._]
  throw Error('coord must be GeoJSON Point or an Array of numbers')
}
function z0(_) {
  if (Array.isArray(_)) return _
  if (_.type === 'Feature') {
    if (_.geometry !== null) return _.geometry.coordinates
  } else if (_.coordinates) return _.coordinates
  throw Error('coords must be GeoJSON Feature, Geometry Object or an Array')
}
function m(_) {
  if (_.type === 'Feature') return _.geometry
  return _
}
function F(_, $, X = {}) {
  if (!_) throw Error('point is required')
  if (!$) throw Error('polygon is required')
  let Z = t(_),
    K = m($),
    M = K.type,
    J = $.bbox,
    q = K.coordinates
  if (J && g0(Z, J) === !1) return !1
  if (M === 'Polygon') q = [q]
  let Y = !1
  for (var H = 0; H < q.length; ++H) {
    let U = R0(Z, q[H])
    if (U === 0) return X.ignoreBoundary ? !1 : !0
    else if (U) Y = !0
  }
  return Y
}
function g0(_, $) {
  return $[0] <= _[0] && $[1] <= _[1] && $[2] >= _[0] && $[3] >= _[1]
}
class J0 {
  constructor(_ = [], $ = d0) {
    if (((this.data = _), (this.length = this.data.length), (this.compare = $), this.length > 0))
      for (let X = (this.length >> 1) - 1; X >= 0; X--) this._down(X)
  }
  push(_) {
    ;(this.data.push(_), this.length++, this._up(this.length - 1))
  }
  pop() {
    if (this.length === 0) return
    let _ = this.data[0],
      $ = this.data.pop()
    if ((this.length--, this.length > 0)) ((this.data[0] = $), this._down(0))
    return _
  }
  peek() {
    return this.data[0]
  }
  _up(_) {
    let { data: $, compare: X } = this,
      Z = $[_]
    while (_ > 0) {
      let K = (_ - 1) >> 1,
        M = $[K]
      if (X(Z, M) >= 0) break
      ;(($[_] = M), (_ = K))
    }
    $[_] = Z
  }
  _down(_) {
    let { data: $, compare: X } = this,
      Z = this.length >> 1,
      K = $[_]
    while (_ < Z) {
      let M = (_ << 1) + 1,
        J = $[M],
        q = M + 1
      if (q < this.length && X($[q], J) < 0) ((M = q), (J = $[q]))
      if (X(J, K) >= 0) break
      ;(($[_] = J), (_ = M))
    }
    $[_] = K
  }
}
function d0(_, $) {
  return _ < $ ? -1 : _ > $ ? 1 : 0
}
function E0(_, $) {
  if (_.p.x > $.p.x) return 1
  if (_.p.x < $.p.x) return -1
  if (_.p.y !== $.p.y) return _.p.y > $.p.y ? 1 : -1
  return 1
}
function r0(_, $) {
  if (_.rightSweepEvent.p.x > $.rightSweepEvent.p.x) return 1
  if (_.rightSweepEvent.p.x < $.rightSweepEvent.p.x) return -1
  if (_.rightSweepEvent.p.y !== $.rightSweepEvent.p.y)
    return _.rightSweepEvent.p.y < $.rightSweepEvent.p.y ? 1 : -1
  return 1
}
class q0 {
  constructor(_, $, X, Z) {
    ;((this.p = { x: _[0], y: _[1] }),
      (this.featureId = $),
      (this.ringId = X),
      (this.eventId = Z),
      (this.otherEvent = null),
      (this.isLeftEndpoint = null))
  }
  isSamePoint(_) {
    return this.p.x === _.p.x && this.p.y === _.p.y
  }
}
function t0(_, $) {
  if (_.type === 'FeatureCollection') {
    let X = _.features
    for (let Z = 0; Z < X.length; Z++) V0(X[Z], $)
  } else V0(_, $)
}
var n = 0,
  o = 0,
  i = 0
function V0(_, $) {
  let X = _.type === 'Feature' ? _.geometry : _,
    Z = X.coordinates
  if (X.type === 'Polygon' || X.type === 'MultiLineString') Z = [Z]
  if (X.type === 'LineString') Z = [[Z]]
  for (let K = 0; K < Z.length; K++)
    for (let M = 0; M < Z[K].length; M++) {
      let J = Z[K][M][0],
        q = null
      o = o + 1
      for (let Y = 0; Y < Z[K][M].length - 1; Y++) {
        q = Z[K][M][Y + 1]
        let H = new q0(J, n, o, i),
          U = new q0(q, n, o, i + 1)
        if (((H.otherEvent = U), (U.otherEvent = H), E0(H, U) > 0))
          ((U.isLeftEndpoint = !0), (H.isLeftEndpoint = !1))
        else ((H.isLeftEndpoint = !0), (U.isLeftEndpoint = !1))
        ;($.push(H), $.push(U), (J = q), (i = i + 1))
      }
    }
  n = n + 1
}
class O0 {
  constructor(_) {
    ;((this.leftSweepEvent = _), (this.rightSweepEvent = _.otherEvent))
  }
}
function n0(_, $) {
  if (_ === null || $ === null) return !1
  if (
    _.leftSweepEvent.ringId === $.leftSweepEvent.ringId &&
    (_.rightSweepEvent.isSamePoint($.leftSweepEvent) ||
      _.rightSweepEvent.isSamePoint($.leftSweepEvent) ||
      _.rightSweepEvent.isSamePoint($.rightSweepEvent) ||
      _.leftSweepEvent.isSamePoint($.leftSweepEvent) ||
      _.leftSweepEvent.isSamePoint($.rightSweepEvent))
  )
    return !1
  let X = _.leftSweepEvent.p.x,
    Z = _.leftSweepEvent.p.y,
    K = _.rightSweepEvent.p.x,
    M = _.rightSweepEvent.p.y,
    J = $.leftSweepEvent.p.x,
    q = $.leftSweepEvent.p.y,
    Y = $.rightSweepEvent.p.x,
    H = $.rightSweepEvent.p.y,
    U = (H - q) * (K - X) - (Y - J) * (M - Z),
    D = (Y - J) * (Z - q) - (H - q) * (X - J),
    N = (K - X) * (Z - q) - (M - Z) * (X - J)
  if (U === 0) {
    if (D === 0 && N === 0) return !1
    return !1
  }
  let A = D / U,
    G = N / U
  if (A >= 0 && A <= 1 && G >= 0 && G <= 1) {
    let R = X + A * (K - X),
      V = Z + A * (M - Z)
    return [R, V]
  }
  return !1
}
function o0(_, $) {
  $ = $ ? $ : !1
  let X = [],
    Z = new J0([], r0)
  while (_.length) {
    let K = _.pop()
    if (K.isLeftEndpoint) {
      let M = new O0(K)
      for (let J = 0; J < Z.data.length; J++) {
        let q = Z.data[J]
        if ($) {
          if (q.leftSweepEvent.featureId === K.featureId) continue
        }
        let Y = n0(M, q)
        if (Y !== !1) X.push(Y)
      }
      Z.push(M)
    } else if (K.isLeftEndpoint === !1) Z.pop()
  }
  return X
}
function i0(_, $) {
  let X = new J0([], E0)
  return (t0(_, X), o0(X, $))
}
var Q0 = i0
var e0 = Q0
function e(_, $, X = {}) {
  let { removeDuplicates: Z = !0, ignoreSelfIntersections: K = !0 } = X,
    M = []
  if (_.type === 'FeatureCollection') M = M.concat(_.features)
  else if (_.type === 'Feature') M.push(_)
  else if (
    _.type === 'LineString' ||
    _.type === 'Polygon' ||
    _.type === 'MultiLineString' ||
    _.type === 'MultiPolygon'
  )
    M.push(f(_))
  if ($.type === 'FeatureCollection') M = M.concat($.features)
  else if ($.type === 'Feature') M.push($)
  else if (
    $.type === 'LineString' ||
    $.type === 'Polygon' ||
    $.type === 'MultiLineString' ||
    $.type === 'MultiPolygon'
  )
    M.push(f($))
  let J = e0(a(M), K),
    q = []
  if (Z) {
    let Y = {}
    J.forEach((H) => {
      let U = H.join(',')
      if (!Y[U]) ((Y[U] = !0), q.push(H))
    })
  } else q = J
  return a(q.map((Y) => X0(Y)))
}
function _0(_, $ = {}) {
  let X = m(_)
  if (!$.properties && _.type === 'Feature') $.properties = _.properties
  switch (X.type) {
    case 'Polygon':
      return _1(X, $)
    case 'MultiPolygon':
      return X1(X, $)
    default:
      throw Error('invalid poly')
  }
}
function _1(_, $ = {}) {
  let Z = m(_).coordinates,
    K = $.properties ? $.properties : _.type === 'Feature' ? _.properties : {}
  return C0(Z, K)
}
function X1(_, $ = {}) {
  let Z = m(_).coordinates,
    K = $.properties ? $.properties : _.type === 'Feature' ? _.properties : {},
    M = []
  return (
    Z.forEach((J) => {
      M.push(C0(J, K))
    }),
    a(M)
  )
}
function C0(_, $) {
  if (_.length > 1) return K0(_, $)
  return Y0(_[0], $)
}
function F0(_, $, { ignoreSelfIntersections: X = !0 } = { ignoreSelfIntersections: !0 }) {
  let Z = !0
  return (
    x(_, (K) => {
      x($, (M) => {
        if (Z === !1) return !1
        Z = Y1(K.geometry, M.geometry, X)
      })
    }),
    Z
  )
}
function Y1(_, $, X) {
  switch (_.type) {
    case 'Point':
      switch ($.type) {
        case 'Point':
          return !J1(_.coordinates, $.coordinates)
        case 'LineString':
          return !B0($, _)
        case 'Polygon':
          return !F(_, $)
      }
      break
    case 'LineString':
      switch ($.type) {
        case 'Point':
          return !B0(_, $)
        case 'LineString':
          return !Z1(_, $, X)
        case 'Polygon':
          return !k0($, _, X)
      }
      break
    case 'Polygon':
      switch ($.type) {
        case 'Point':
          return !F($, _)
        case 'LineString':
          return !k0(_, $, X)
        case 'Polygon':
          return !$1($, _, X)
      }
  }
  return !1
}
function B0(_, $) {
  for (let X = 0; X < _.coordinates.length - 1; X++)
    if (q1(_.coordinates[X], _.coordinates[X + 1], $.coordinates)) return !0
  return !1
}
function Z1(_, $, X) {
  if (e(_, $, { ignoreSelfIntersections: X }).features.length > 0) return !0
  return !1
}
function k0(_, $, X) {
  for (let K of $.coordinates) if (F(K, _)) return !0
  if (e($, _0(_), { ignoreSelfIntersections: X }).features.length > 0) return !0
  return !1
}
function $1(_, $, X) {
  for (let K of _.coordinates[0]) if (F(K, $)) return !0
  for (let K of $.coordinates[0]) if (F(K, _)) return !0
  if (e(_0(_), _0($), { ignoreSelfIntersections: X }).features.length > 0) return !0
  return !1
}
function q1(_, $, X) {
  let Z = X[0] - _[0],
    K = X[1] - _[1],
    M = $[0] - _[0],
    J = $[1] - _[1]
  if (Z * J - K * M !== 0) return !1
  if (Math.abs(M) >= Math.abs(J))
    if (M > 0) return _[0] <= X[0] && X[0] <= $[0]
    else return $[0] <= X[0] && X[0] <= _[0]
  else if (J > 0) return _[1] <= X[1] && X[1] <= $[1]
  else return $[1] <= X[1] && X[1] <= _[1]
}
function J1(_, $) {
  return _[0] === $[0] && _[1] === $[1]
}
function M1(_, $, { ignoreSelfIntersections: X = !0 } = {}) {
  let Z = !1
  return (
    x(_, (K) => {
      x($, (M) => {
        if (Z === !0) return !0
        Z = !F0(K.geometry, M.geometry, { ignoreSelfIntersections: X })
      })
    }),
    Z
  )
}
var T0 = M1
function O(_, $, X = {}) {
  let Z = t(_),
    K = z0($)
  for (let M = 0; M < K.length - 1; M++) {
    let J = !1
    if (X.ignoreEndVertices) {
      if (M === 0) J = 'start'
      if (M === K.length - 2) J = 'end'
      if (M === 0 && M + 1 === K.length - 1) J = 'both'
    }
    if (D1(K[M], K[M + 1], Z, J, typeof X.epsilon > 'u' ? null : X.epsilon)) return !0
  }
  return !1
}
function D1(_, $, X, Z, K) {
  let M = X[0],
    J = X[1],
    q = _[0],
    Y = _[1],
    H = $[0],
    U = $[1],
    D = X[0] - q,
    N = X[1] - Y,
    A = H - q,
    G = U - Y,
    R = D * G - N * A
  if (K !== null) {
    if (Math.abs(R) > K) return !1
  } else if (R !== 0) return !1
  if (Math.abs(A) === Math.abs(G) && Math.abs(A) === 0) {
    if (Z) return !1
    if (X[0] === _[0] && X[1] === _[1]) return !0
    else return !1
  }
  if (!Z) {
    if (Math.abs(A) >= Math.abs(G)) return A > 0 ? q <= M && M <= H : H <= M && M <= q
    return G > 0 ? Y <= J && J <= U : U <= J && J <= Y
  } else if (Z === 'start') {
    if (Math.abs(A) >= Math.abs(G)) return A > 0 ? q < M && M <= H : H <= M && M < q
    return G > 0 ? Y < J && J <= U : U <= J && J < Y
  } else if (Z === 'end') {
    if (Math.abs(A) >= Math.abs(G)) return A > 0 ? q <= M && M < H : H < M && M <= q
    return G > 0 ? Y <= J && J < U : U < J && J <= Y
  } else if (Z === 'both') {
    if (Math.abs(A) >= Math.abs(G)) return A > 0 ? q < M && M < H : H < M && M < q
    return G > 0 ? Y < J && J < U : U < J && J < Y
  }
  return !1
}
function H1(_, $) {
  var X = m(_),
    Z = m($),
    K = X.type,
    M = Z.type
  switch (K) {
    case 'Point':
      switch (M) {
        case 'LineString':
          return j(X, Z)
        case 'MultiLineString':
          var J = !1
          for (var q = 0; q < Z.coordinates.length; q++)
            if (j(X, { type: 'LineString', coordinates: Z.coordinates[q] })) J = !0
          return J
        case 'Polygon':
          for (var Y = 0; Y < Z.coordinates.length; Y++)
            if (O(X, { type: 'LineString', coordinates: Z.coordinates[Y] })) return !0
          return !1
        case 'MultiPolygon':
          for (var Y = 0; Y < Z.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates[Y].length; q++)
              if (O(X, { type: 'LineString', coordinates: Z.coordinates[Y][q] })) return !0
          return !1
        default:
          throw Error('feature2 ' + M + ' geometry not supported')
      }
    case 'MultiPoint':
      switch (M) {
        case 'LineString':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++) {
            if (!J) {
              if (j({ type: 'Point', coordinates: X.coordinates[Y] }, Z)) J = !0
            }
            if (O({ type: 'Point', coordinates: X.coordinates[Y] }, Z, { ignoreEndVertices: !0 }))
              return !1
          }
          return J
        case 'MultiLineString':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++) {
              if (!J) {
                if (
                  j(
                    { type: 'Point', coordinates: X.coordinates[Y] },
                    { type: 'LineString', coordinates: Z.coordinates[q] },
                  )
                )
                  J = !0
              }
              if (
                O(
                  { type: 'Point', coordinates: X.coordinates[Y] },
                  { type: 'LineString', coordinates: Z.coordinates[q] },
                  { ignoreEndVertices: !0 },
                )
              )
                return !1
            }
          return J
        case 'Polygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++) {
            if (!J) {
              if (
                O(
                  { type: 'Point', coordinates: X.coordinates[Y] },
                  { type: 'LineString', coordinates: Z.coordinates[0] },
                )
              )
                J = !0
            }
            if (F({ type: 'Point', coordinates: X.coordinates[Y] }, Z, { ignoreBoundary: !0 }))
              return !1
          }
          return J
        case 'MultiPolygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: X.coordinates[Y] },
                    { type: 'LineString', coordinates: Z.coordinates[q][0] },
                  )
                )
                  J = !0
              }
              if (
                F(
                  { type: 'Point', coordinates: X.coordinates[Y] },
                  { type: 'Polygon', coordinates: Z.coordinates[q] },
                  { ignoreBoundary: !0 },
                )
              )
                return !1
            }
          return J
        default:
          throw Error('feature2 ' + M + ' geometry not supported')
      }
    case 'LineString':
      switch (M) {
        case 'Point':
          return j(Z, X)
        case 'MultiPoint':
          var J = !1
          for (var Y = 0; Y < Z.coordinates.length; Y++) {
            if (!J) {
              if (j({ type: 'Point', coordinates: Z.coordinates[Y] }, X)) J = !0
            }
            if (O({ type: 'Point', coordinates: Z.coordinates[Y] }, X, { ignoreEndVertices: !0 }))
              return !1
          }
          return J
        case 'LineString':
          var H = !1
          if (j({ type: 'Point', coordinates: X.coordinates[0] }, Z)) H = !0
          if (j({ type: 'Point', coordinates: X.coordinates[X.coordinates.length - 1] }, Z)) H = !0
          if (H === !1) return !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            if (O({ type: 'Point', coordinates: X.coordinates[Y] }, Z, { ignoreEndVertices: !0 }))
              return !1
          return H
        case 'MultiLineString':
          var H = !1
          for (var Y = 0; Y < Z.coordinates.length; Y++) {
            if (
              j(
                { type: 'Point', coordinates: X.coordinates[0] },
                { type: 'LineString', coordinates: Z.coordinates[Y] },
              )
            )
              H = !0
            if (
              j(
                { type: 'Point', coordinates: X.coordinates[X.coordinates.length - 1] },
                { type: 'LineString', coordinates: Z.coordinates[Y] },
              )
            )
              H = !0
            for (var q = 0; q < X.coordinates[Y].length; q++)
              if (
                O(
                  { type: 'Point', coordinates: X.coordinates[q] },
                  { type: 'LineString', coordinates: Z.coordinates[Y] },
                  { ignoreEndVertices: !0 },
                )
              )
                return !1
          }
          return H
        case 'Polygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++) {
            if (!J) {
              if (
                O(
                  { type: 'Point', coordinates: X.coordinates[Y] },
                  { type: 'LineString', coordinates: Z.coordinates[0] },
                )
              )
                J = !0
            }
            if (F({ type: 'Point', coordinates: X.coordinates[Y] }, Z, { ignoreBoundary: !0 }))
              return !1
          }
          return J
        case 'MultiPolygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++) {
            for (var q = 0; q < Z.coordinates.length; q++)
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: X.coordinates[Y] },
                    { type: 'LineString', coordinates: Z.coordinates[q][0] },
                  )
                )
                  J = !0
              }
            if (F({ type: 'Point', coordinates: X.coordinates[Y] }, Z, { ignoreBoundary: !0 }))
              return !1
          }
          return J
        default:
          throw Error('feature2 ' + M + ' geometry not supported')
      }
    case 'MultiLineString':
      switch (M) {
        case 'Point':
          for (var Y = 0; Y < X.coordinates.length; Y++)
            if (j(Z, { type: 'LineString', coordinates: X.coordinates[Y] })) return !0
          return !1
        case 'MultiPoint':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++) {
              if (!J) {
                if (
                  j(
                    { type: 'Point', coordinates: Z.coordinates[q] },
                    { type: 'LineString', coordinates: X.coordinates[q] },
                  )
                )
                  J = !0
              }
              if (
                O(
                  { type: 'Point', coordinates: Z.coordinates[q] },
                  { type: 'LineString', coordinates: X.coordinates[q] },
                  { ignoreEndVertices: !0 },
                )
              )
                return !1
            }
          return J
        case 'LineString':
          var H = !1
          for (var Y = 0; Y < X.coordinates.length; Y++) {
            if (j({ type: 'Point', coordinates: X.coordinates[Y][0] }, Z)) H = !0
            if (j({ type: 'Point', coordinates: X.coordinates[Y][X.coordinates[Y].length - 1] }, Z))
              H = !0
            for (var q = 0; q < Z.coordinates.length; q++)
              if (
                O(
                  { type: 'Point', coordinates: Z.coordinates[q] },
                  { type: 'LineString', coordinates: X.coordinates[Y] },
                  { ignoreEndVertices: !0 },
                )
              )
                return !1
          }
          return H
        case 'MultiLineString':
          var H = !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++) {
              if (
                j(
                  { type: 'Point', coordinates: X.coordinates[Y][0] },
                  { type: 'LineString', coordinates: Z.coordinates[q] },
                )
              )
                H = !0
              if (
                j(
                  { type: 'Point', coordinates: X.coordinates[Y][X.coordinates[Y].length - 1] },
                  { type: 'LineString', coordinates: Z.coordinates[q] },
                )
              )
                H = !0
              for (var U = 0; U < X.coordinates[Y].length; U++)
                if (
                  O(
                    { type: 'Point', coordinates: X.coordinates[Y][U] },
                    { type: 'LineString', coordinates: Z.coordinates[q] },
                    { ignoreEndVertices: !0 },
                  )
                )
                  return !1
            }
          return H
        case 'Polygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            for (var q = 0; q < X.coordinates.length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: X.coordinates[Y][q] },
                    { type: 'LineString', coordinates: Z.coordinates[0] },
                  )
                )
                  J = !0
              }
              if (F({ type: 'Point', coordinates: X.coordinates[Y][q] }, Z, { ignoreBoundary: !0 }))
                return !1
            }
          return J
        case 'MultiPolygon':
          var J = !1
          for (var Y = 0; Y < Z.coordinates[0].length; Y++)
            for (var q = 0; q < X.coordinates.length; q++)
              for (var U = 0; U < X.coordinates[q].length; U++) {
                if (!J) {
                  if (
                    O(
                      { type: 'Point', coordinates: X.coordinates[q][U] },
                      { type: 'LineString', coordinates: Z.coordinates[0][Y] },
                    )
                  )
                    J = !0
                }
                if (
                  F(
                    { type: 'Point', coordinates: X.coordinates[q][U] },
                    { type: 'Polygon', coordinates: [Z.coordinates[0][Y]] },
                    { ignoreBoundary: !0 },
                  )
                )
                  return !1
              }
          return J
        default:
          throw Error('feature2 ' + M + ' geometry not supported')
      }
    case 'Polygon':
      switch (M) {
        case 'Point':
          for (var Y = 0; Y < X.coordinates.length; Y++)
            if (O(Z, { type: 'LineString', coordinates: X.coordinates[Y] })) return !0
          return !1
        case 'MultiPoint':
          var J = !1
          for (var Y = 0; Y < Z.coordinates.length; Y++) {
            if (!J) {
              if (
                O(
                  { type: 'Point', coordinates: Z.coordinates[Y] },
                  { type: 'LineString', coordinates: X.coordinates[0] },
                )
              )
                J = !0
            }
            if (F({ type: 'Point', coordinates: Z.coordinates[Y] }, X, { ignoreBoundary: !0 }))
              return !1
          }
          return J
        case 'LineString':
          var J = !1
          for (var Y = 0; Y < Z.coordinates.length; Y++) {
            if (!J) {
              if (
                O(
                  { type: 'Point', coordinates: Z.coordinates[Y] },
                  { type: 'LineString', coordinates: X.coordinates[0] },
                )
              )
                J = !0
            }
            if (F({ type: 'Point', coordinates: Z.coordinates[Y] }, X, { ignoreBoundary: !0 }))
              return !1
          }
          return J
        case 'MultiLineString':
          var J = !1
          for (var Y = 0; Y < Z.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates[Y].length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: Z.coordinates[Y][q] },
                    { type: 'LineString', coordinates: X.coordinates[0] },
                  )
                )
                  J = !0
              }
              if (F({ type: 'Point', coordinates: Z.coordinates[Y][q] }, X, { ignoreBoundary: !0 }))
                return !1
            }
          return J
        case 'Polygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates[0].length; Y++) {
            if (!J) {
              if (
                O(
                  { type: 'Point', coordinates: X.coordinates[0][Y] },
                  { type: 'LineString', coordinates: Z.coordinates[0] },
                )
              )
                J = !0
            }
            if (F({ type: 'Point', coordinates: X.coordinates[0][Y] }, Z, { ignoreBoundary: !0 }))
              return !1
          }
          return J
        case 'MultiPolygon':
          var J = !1
          for (var Y = 0; Y < Z.coordinates[0].length; Y++)
            for (var q = 0; q < X.coordinates[0].length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: X.coordinates[0][q] },
                    { type: 'LineString', coordinates: Z.coordinates[0][Y] },
                  )
                )
                  J = !0
              }
              if (
                F(
                  { type: 'Point', coordinates: X.coordinates[0][q] },
                  { type: 'Polygon', coordinates: Z.coordinates[0][Y] },
                  { ignoreBoundary: !0 },
                )
              )
                return !1
            }
          return J
        default:
          throw Error('feature2 ' + M + ' geometry not supported')
      }
    case 'MultiPolygon':
      switch (M) {
        case 'Point':
          for (var Y = 0; Y < X.coordinates[0].length; Y++)
            if (O(Z, { type: 'LineString', coordinates: X.coordinates[0][Y] })) return !0
          return !1
        case 'MultiPoint':
          var J = !1
          for (var Y = 0; Y < X.coordinates[0].length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: Z.coordinates[q] },
                    { type: 'LineString', coordinates: X.coordinates[0][Y] },
                  )
                )
                  J = !0
              }
              if (
                F(
                  { type: 'Point', coordinates: Z.coordinates[q] },
                  { type: 'Polygon', coordinates: X.coordinates[0][Y] },
                  { ignoreBoundary: !0 },
                )
              )
                return !1
            }
          return J
        case 'LineString':
          var J = !1
          for (var Y = 0; Y < X.coordinates[0].length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: Z.coordinates[q] },
                    { type: 'LineString', coordinates: X.coordinates[0][Y] },
                  )
                )
                  J = !0
              }
              if (
                F(
                  { type: 'Point', coordinates: Z.coordinates[q] },
                  { type: 'Polygon', coordinates: X.coordinates[0][Y] },
                  { ignoreBoundary: !0 },
                )
              )
                return !1
            }
          return J
        case 'MultiLineString':
          var J = !1
          for (var Y = 0; Y < X.coordinates.length; Y++)
            for (var q = 0; q < Z.coordinates.length; q++)
              for (var U = 0; U < Z.coordinates[q].length; U++) {
                if (!J) {
                  if (
                    O(
                      { type: 'Point', coordinates: Z.coordinates[q][U] },
                      { type: 'LineString', coordinates: X.coordinates[Y][0] },
                    )
                  )
                    J = !0
                }
                if (
                  F(
                    { type: 'Point', coordinates: Z.coordinates[q][U] },
                    { type: 'Polygon', coordinates: [X.coordinates[Y][0]] },
                    { ignoreBoundary: !0 },
                  )
                )
                  return !1
              }
          return J
        case 'Polygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates[0].length; Y++)
            for (var q = 0; q < X.coordinates[0][Y].length; q++) {
              if (!J) {
                if (
                  O(
                    { type: 'Point', coordinates: X.coordinates[0][Y][q] },
                    { type: 'LineString', coordinates: Z.coordinates[0] },
                  )
                )
                  J = !0
              }
              if (
                F({ type: 'Point', coordinates: X.coordinates[0][Y][q] }, Z, { ignoreBoundary: !0 })
              )
                return !1
            }
          return J
        case 'MultiPolygon':
          var J = !1
          for (var Y = 0; Y < X.coordinates[0].length; Y++)
            for (var q = 0; q < Z.coordinates[0].length; q++)
              for (var U = 0; U < X.coordinates[0].length; U++) {
                if (!J) {
                  if (
                    O(
                      { type: 'Point', coordinates: X.coordinates[0][Y][U] },
                      { type: 'LineString', coordinates: Z.coordinates[0][q] },
                    )
                  )
                    J = !0
                }
                if (
                  F(
                    { type: 'Point', coordinates: X.coordinates[0][Y][U] },
                    { type: 'Polygon', coordinates: Z.coordinates[0][q] },
                    { ignoreBoundary: !0 },
                  )
                )
                  return !1
              }
          return J
        default:
          throw Error('feature2 ' + M + ' geometry not supported')
      }
    default:
      throw Error('feature1 ' + K + ' geometry not supported')
  }
}
function j(_, $) {
  if (L0($.coordinates[0], _.coordinates)) return !0
  if (L0($.coordinates[$.coordinates.length - 1], _.coordinates)) return !0
  return !1
}
function L0(_, $) {
  return _[0] === $[0] && _[1] === $[1]
}
var S0 = H1
var K1 = 1
function j0(_) {
  return String(_.properties?.level ?? '')
}
function P0(_) {
  return String(_.properties?.id ?? '')
}
function w0(_) {
  let $ =
    _.gemeindeNeighborRecord ??
    Object.fromEntries([..._.gemeindeNeighbors.entries()].map(([X, Z]) => [X, [...Z]]))
  return {
    version: K1,
    landkreis: Object.fromEntries([..._.landkreisNeighbors.entries()].map(([X, Z]) => [X, [...Z]])),
    landkreisStadtstaat: Object.fromEntries(
      [..._.landkreisStadtstaatNeighbors.entries()].map(([X, Z]) => [X, [...Z]]),
    ),
    gemeinde: $,
  }
}
function h0(_) {
  if (!_.geometry) return null
  try {
    return W0(_)
  } catch {
    return null
  }
}
function v0(_, $) {
  return _[0] <= $[2] && _[2] >= $[0] && _[1] <= $[3] && _[3] >= $[1]
}
function c0(_, $) {
  try {
    return S0(_, $) || T0(_, $)
  } catch {
    return !1
  }
}
function W1(_, $, X) {
  if ($ === X) return
  let Z = _.get($) ?? new Set()
  ;(Z.add(X), _.set($, Z))
  let K = _.get(X) ?? new Set()
  ;(K.add($), _.set(X, K))
}
function U1(_) {
  let $ = new Map()
  for (let [X, Z] of _) $.set(X, [...Z])
  return $
}
function N1(_) {
  let $ = new Map()
  for (let X of _.byId.values()) {
    if (j0(X) !== '6') continue
    let Z = P0(X),
      K = String(X.properties?.bundesland_id ?? '')
    if (!K) continue
    let M = $.get(K) ?? []
    ;(M.push(Z), $.set(K, M))
  }
  return $
}
function A1(_) {
  let $ = new Map()
  for (let X of _.byId.values()) {
    if (j0(X) !== '6') continue
    let Z = P0(X),
      K = h0(X)
    if (Z && K) $.set(Z, K)
  }
  return $
}
function G1(_, $) {
  let X = new Map(),
    Z = N1(_)
  for (let K of Z.values())
    for (let M = 0; M < K.length; M++) {
      let J = K[M],
        q = _.byId.get(J),
        Y = $.get(J)
      if (!q || !Y) continue
      for (let H = M + 1; H < K.length; H++) {
        let U = K[H],
          D = _.byId.get(U),
          N = $.get(U)
        if (!D || !N) continue
        if (!v0(Y, N)) continue
        if (c0(q, D)) W1(X, J, U)
      }
    }
  return U1(X)
}
function R1(_, $) {
  let X = _.stadtstaaten.map((M) => M.id),
    Z = new Map()
  for (let M of X) {
    let J = _.byId.get(M),
      q = J ? h0(J) : null
    if (q) Z.set(M, q)
  }
  let K = new Map()
  for (let [M, J] of $) {
    let q = _.byId.get(M)
    if (!q) continue
    let Y = []
    for (let H of X) {
      let U = Z.get(H),
        D = _.byId.get(H)
      if (!U || !D) continue
      if (!v0(J, U)) continue
      if (c0(q, D)) Y.push(H)
    }
    if (Y.length) K.set(M, Y)
  }
  return K
}
function y0(_) {
  let $ = A1(_)
  return {
    landkreisNeighbors: G1(_, $),
    landkreisStadtstaatNeighbors: R1(_, $),
    gemeindeNeighbors: new Map(),
    gemeindeNeighborRecord: null,
    precomputed: !1,
  }
}
self.onmessage = (_) => {
  if (_.data.type !== 'build') return
  try {
    let $ = D0(_.data.features),
      X = y0($)
    self.postMessage({ type: 'ok', file: w0(X) })
  } catch ($) {
    self.postMessage({
      type: 'error',
      message: $ instanceof Error ? $.message : 'Nachbarn berechnen fehlgeschlagen',
    })
  }
}
