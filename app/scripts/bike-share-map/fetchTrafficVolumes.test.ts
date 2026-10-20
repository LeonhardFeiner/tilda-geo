import { describe, expect, test } from 'vitest'
import { eraDtvThreshold, sectionNeedsBikePath } from './fetchTrafficVolumes'

describe('eraDtvThreshold', () => {
  test('uses 2,500 Kfz/24h at the rural default and 4,000 at 70 km/h or less', () => {
    expect(eraDtvThreshold(null)).toBe(2500)
    expect(eraDtvThreshold(100)).toBe(2500)
    expect(eraDtvThreshold(80)).toBe(2500)
    expect(eraDtvThreshold(70)).toBe(4000)
    expect(eraDtvThreshold(60)).toBe(4000)
  })
})

describe('sectionNeedsBikePath', () => {
  const base = { klasse: 'K', fsod: 'FS', dtv: 3000, maxspeedKmh: null }

  test('flags a busy open-road Kreisstraße', () => {
    expect(sectionNeedsBikePath(base)).toBe(true)
  })

  test('respects the higher threshold at 70 km/h', () => {
    expect(sectionNeedsBikePath({ ...base, maxspeedKmh: 70 })).toBe(false)
    expect(sectionNeedsBikePath({ ...base, maxspeedKmh: 70, dtv: 4100 })).toBe(true)
  })

  test('ignores quiet roads, through-town sections and Autobahnen', () => {
    expect(sectionNeedsBikePath({ ...base, dtv: 2500 })).toBe(false)
    expect(sectionNeedsBikePath({ ...base, fsod: 'OD' })).toBe(false)
    expect(sectionNeedsBikePath({ ...base, klasse: 'A', dtv: 50000 })).toBe(false)
  })
})
