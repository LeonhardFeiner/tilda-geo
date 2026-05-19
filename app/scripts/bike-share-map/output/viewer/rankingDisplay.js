;(() => {
  var y = Object.defineProperty
  var N = (n) => n
  function m(n, t) {
    this[n] = N.bind(null, t)
  }
  var x = (n, t) => {
    for (var e in t) y(n, e, { get: t[e], enumerable: !0, configurable: !0, set: m.bind(t, e) })
  }
  var c = {}
  x(c, {
    rankingShowsAsAlle: () => h,
    mergeFocusChains: () => w,
    isFocusChainInTopOrFlopWindow: () => I,
    focusIndexForChain: () => R,
    focusChainFromParentMap: () => W,
    effectiveRankingTopN: () => b,
    buildTopFlopDisplayRows: () => _,
    buildRankingExportRows: () => C,
    RANKING_WINDOW_CHECK_N: () => D,
    RANKING_TOP_N_OUTSIDE_WINDOW: () => O,
    RANKING_TOP_N_IN_WINDOW: () => A,
    RANKING_EXPORT_ALLE_MAX_ROWS: () => T,
    PORTRAIT_EXPORT: () => k,
  })
  var k = { width: 1080, height: 1920, padding: 56 },
    D = 11,
    A = 11,
    O = 8,
    T = 23
  function W(n, t, e = 3) {
    if (!n) return []
    let r = [],
      i = n
    for (let o = 0; o < e && i; o++) {
      if (!r.includes(i)) r.push(i)
      i = t.get(i)
    }
    return r
  }
  function w(n) {
    let t = []
    for (let e of n) for (let r of e) if (!t.includes(r)) t.push(r)
    return t
  }
  function I(n, t, e) {
    if (!t.length) return !1
    let r = n.length
    if (r <= e * 2) return !0
    let i = new Set()
    for (let o = 0; o < e; o++) i.add(n[o].id)
    for (let o = r - e; o < r; o++) i.add(n[o].id)
    return t.some((o) => i.has(o))
  }
  function R(n, t) {
    for (let e of t) {
      let r = n.findIndex((i) => i.id === e)
      if (r >= 0) return r
    }
    return -1
  }
  function b(n) {
    if (n.mode !== 'topflop') return null
    if (!n.focusChainIds.length) return 11
    if (I(n.items, n.focusChainIds, 11)) return 11
    return 8
  }
  function h(n, t, e) {
    if (t === 'all') return !0
    if (e == null) return !0
    return n <= e * 2
  }
  function C(n, t) {
    let e = t.maxAlleRows ?? 23
    if (h(n.length, t.mode, t.topN)) {
      let r = Math.min(n.length, e)
      return [...Array(r).keys()].map((i) => ({ type: 'row', index: i, rank: i + 1 }))
    }
    return _(n, t.topN, t.focusChainIds)
  }
  function _(n, t, e) {
    let r = n.length
    if (r <= t * 2) return n.map((s, p) => ({ type: 'row', index: p, rank: p + 1 }))
    let i = [...Array(t).keys()],
      o = [...Array(t).keys()].map((s) => r - t + s),
      d = new Set(i),
      g = new Set(o),
      u = R(n, e),
      l = []
    for (let s of i) l.push({ type: 'row', index: s, rank: s + 1 })
    if (u >= 0 && !d.has(u) && !g.has(u)) {
      let s = Math.max(0, u - 2),
        p = Math.min(r - 1, u + 2),
        f = []
      for (let a = s; a <= p; a++) if (!d.has(a) && !g.has(a)) f.push(a)
      if (f.length) {
        l.push({ type: 'divider' })
        for (let a of f) l.push({ type: 'row', index: a, rank: a + 1 })
      }
    }
    l.push({ type: 'divider' })
    for (let s of o) l.push({ type: 'row', index: s, rank: s + 1 })
    return l
  }
  globalThis.RankingDisplay = c
})()
