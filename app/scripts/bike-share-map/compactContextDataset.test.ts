import { describe, expect, test } from 'vitest'
import { roundFloats, splitContextDataset } from './compactContextDataset'

describe('compactContextDataset', () => {
  test('rounds floats to 6 significant digits, leaves integers and nested shapes intact', () => {
    expect(roundFloats(596.083891799133)).toBe(596.084)
    expect(roundFloats(0.18264840182648404)).toBe(0.182648)
    expect(roundFloats(6988847)).toBe(6988847)
    expect(roundFloats({ a: [1.23456789, 2], b: { c: 'x', d: null } })).toEqual({
      a: [1.23457, 2],
      b: { c: 'x', d: null },
    })
  })

  test('splits by pack membership and drops ids in no pack', () => {
    const byId = { 'relation/1': { v: 1.5 }, 'relation/7': { v: 2 }, 'relation/x': { v: 3 } }
    const out = splitContextDataset(byId, new Set(['relation/1']), new Set(['relation/7']))
    expect(out.main).toEqual({ 'relation/1': { v: 1.5 } })
    expect(out.extra).toEqual({ 'relation/7': { v: 2 } })
    expect(out.dropped).toBe(1)
  })

  test('keeps everything in main when there are no id sets', () => {
    const out = splitContextDataset({ a: 1, b: 2 }, null, null)
    expect(out.main).toEqual({ a: 1, b: 2 })
    expect(out.extra).toEqual({})
  })
})
