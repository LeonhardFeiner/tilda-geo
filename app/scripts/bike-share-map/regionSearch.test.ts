import { describe, expect, test } from 'vitest'
import { buildRegionIndex, type StatsFeature } from './regionNavigation'
import {
  buildRegionSearchEntries,
  MATCH_EXACT,
  MATCH_NONE,
  MATCH_PREFIX,
  MATCH_SUBSTRING,
  MATCH_WORD_START,
  rankRegionSearchMatches,
  regionSearchKeys,
  regionSearchLevelLabel,
  scoreRegionMatch,
  type RegionSearchEntry,
} from './regionSearch'

const entry = (name: string, level: string, extra?: Partial<RegionSearchEntry>) =>
  ({
    id: 'relation/' + name.replace(/\W+/g, '-'),
    name,
    level,
    parentName: '',
    size: 0,
    ...extra,
  }) satisfies RegionSearchEntry

const score = (name: string, query: string) =>
  scoreRegionMatch(regionSearchKeys(name), regionSearchKeys(query))

describe('regionSearchKeys', () => {
  test('offers both German spellings of an umlaut', () => {
    expect(regionSearchKeys('München')).toEqual(expect.arrayContaining(['muenchen', 'munchen']))
  })

  test('expands ß and strips admin prefixes into extra keys', () => {
    expect(regionSearchKeys('Gießen')).toEqual(expect.arrayContaining(['giessen']))
    const keys = regionSearchKeys('Landkreis Rosenheim')
    expect(keys).toEqual(expect.arrayContaining(['rosenheim']))
    // The full name stays a key, so searching "landkreis" still finds it.
    expect(keys).toEqual(expect.arrayContaining(['landkreis rosenheim']))
  })
})

describe('scoreRegionMatch', () => {
  test('ranks exact over prefix over word start over mid-word', () => {
    expect(score('Neustadt', 'neustadt')).toBe(MATCH_EXACT)
    expect(score('Neustadt am Kulm', 'neustadt')).toBe(MATCH_PREFIX)
    expect(score('Bad Neustadt an der Saale', 'neustadt')).toBe(MATCH_WORD_START)
    expect(score('Bergneustadt', 'neustadt')).toBe(MATCH_SUBSTRING)
    expect(score('Freising', 'neustadt')).toBe(MATCH_NONE)
  })

  test('finds a name typed without its umlaut, either way', () => {
    expect(score('München', 'muenchen')).toBe(MATCH_EXACT)
    expect(score('München', 'munchen')).toBe(MATCH_EXACT)
    expect(score('München', 'münchen')).toBe(MATCH_EXACT)
  })

  test('finds a Landkreis by its bare name', () => {
    expect(score('Landkreis München', 'münchen')).toBe(MATCH_EXACT)
    expect(score('Region Hannover', 'hannover')).toBe(MATCH_EXACT)
  })
})

describe('rankRegionSearchMatches', () => {
  const neustadt = [
    entry('Bad Neustadt an der Saale', '8'),
    entry('Bergneustadt', '8'),
    entry('Landkreis Neustadt an der Aisch-Bad Windsheim', '6'),
    entry('Landkreis Neustadt an der Waldnaab', '6'),
    entry('Neustadt (Dosse)', '8'),
    entry('Neustadt (Hessen)', '8'),
    entry('Neustadt am Kulm', '8'),
    entry('Neustadt am Main', '8'),
    entry('Neustadt an der Weinstraße', '6'),
  ]

  test('puts the regions actually called Neustadt first', () => {
    const names = rankRegionSearchMatches(neustadt, 'Neustadt').map((m) => m.name)
    // Alphabetical order used to spend the first four slots on these two instead.
    expect(names.indexOf('Neustadt (Dosse)')).toBeLessThan(
      names.indexOf('Bad Neustadt an der Saale'),
    )
    // A match in the middle of a word loses its slot to the nine better ones entirely.
    expect(names).not.toContain('Bergneustadt')
  })

  test('keeps room for coarser levels instead of drowning in Gemeinden', () => {
    const levels = rankRegionSearchMatches(neustadt, 'Neustadt', { limit: 6, perLevel: 3 }).map(
      (m) => m.level,
    )
    expect(levels.filter((l) => l === '6').length).toBeGreaterThan(0)
    expect(levels.filter((l) => l === '8').length).toBeLessThanOrEqual(3)
  })

  test('refills from the overflow when only one level matches', () => {
    const onlyGemeinden = [
      entry('Neuenkirchen A', '8'),
      entry('Neuenkirchen B', '8'),
      entry('Neuenkirchen C', '8'),
      entry('Neuenkirchen D', '8'),
      entry('Neuenkirchen E', '8'),
    ]
    expect(
      rankRegionSearchMatches(onlyGemeinden, 'Neuenkirchen', { limit: 4, perLevel: 2 }),
    ).toHaveLength(4)
  })

  test('breaks ties towards the larger region', () => {
    const [first] = rankRegionSearchMatches(
      [entry('Berg', '8', { size: 10 }), entry('Berg', '8', { id: 'relation/big', size: 900 })],
      'Berg',
    )
    expect(first?.size).toBe(900)
  })

  test('an empty query matches nothing', () => {
    expect(rankRegionSearchMatches(neustadt, '   ')).toEqual([])
  })
})

const features = [
  {
    type: 'Feature',
    properties: { id: 'relation/62422', name: 'Berlin', level: '4' },
    geometry: null,
  },
  {
    type: 'Feature',
    properties: { id: 'relation/BY', name: 'Bayern', level: '4' },
    geometry: null,
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/LK',
      name: 'Landkreis Steinfurt',
      level: '6',
      bundesland_id: 'relation/BY',
      road_length: { primary: 200, residential: 300 },
    },
    geometry: null,
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/GM',
      name: 'Neuenkirchen',
      level: '8',
      bundesland_id: 'relation/BY',
      landkreis_id: 'relation/LK',
      road_length: { residential: 20 },
    },
    geometry: null,
  },
  {
    type: 'Feature',
    properties: {
      id: 'relation/VB',
      name: 'Ein Gemeindeverband',
      level: '7',
      bundesland_id: 'relation/BY',
    },
    geometry: null,
  },
] as unknown as StatsFeature[]

describe('buildRegionSearchEntries', () => {
  const index = buildRegionIndex(features)
  const entries = buildRegionSearchEntries(features, index)

  test('covers levels 4/6/8 only', () => {
    expect(entries.map((e) => e.level).sort()).toEqual(['4', '4', '6', '8'])
  })

  test('leaves out regions no view can show', () => {
    // Border municipalities OSM spills over the national boundary carry no Bundesland, so
    // there is no scope to put them in — offering them would be a result that does nothing.
    const withForeign = [
      ...features,
      {
        type: 'Feature',
        properties: { id: 'relation/PL', name: 'Słubice', level: '8' },
        geometry: null,
      },
    ] as unknown as StatsFeature[]
    const names = buildRegionSearchEntries(withForeign, buildRegionIndex(withForeign)).map(
      (e) => e.name,
    )
    expect(names).not.toContain('Słubice')
  })

  test('carries the parent as disambiguating context', () => {
    expect(entries.find((e) => e.name === 'Neuenkirchen')?.parentName).toBe('Landkreis Steinfurt')
    expect(entries.find((e) => e.name === 'Landkreis Steinfurt')?.parentName).toBe('Bayern')
    expect(entries.find((e) => e.name === 'Bayern')?.parentName).toBe('')
  })

  test('sums the road_length class record into the size tiebreaker', () => {
    expect(entries.find((e) => e.name === 'Landkreis Steinfurt')?.size).toBe(500)
    expect(entries.find((e) => e.name === 'Neuenkirchen')?.size).toBe(20)
  })
})

describe('regionSearchLevelLabel', () => {
  const index = buildRegionIndex(features)

  test('names a Stadtstaat and a kreisfreie Stadt correctly', () => {
    expect(regionSearchLevelLabel('4', 'relation/62422', index)).toBe('Stadtstaat')
    expect(regionSearchLevelLabel('4', 'relation/BY', index)).toBe('Bundesland')
    // Steinfurt has a Gemeinde below it, so it is a real Landkreis, not a kreisfreie Stadt.
    expect(regionSearchLevelLabel('6', 'relation/LK', index)).toBe('Landkreis')
    expect(regionSearchLevelLabel('8', 'relation/GM', index)).toBe('Gemeinde')
  })
})
